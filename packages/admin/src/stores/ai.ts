import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import {
  listConversations, getConversation, deleteConversation,
  sendChatMessage, parseSSEStream,
  type AiConversation, type AiMessage, type ChatContext,
} from '@/api/ai.js'

// ─── Tipo per i tool steps visibili nella UI ──────────────────────────────────

export interface ToolStep {
  id:     string
  name:   string
  input:  Record<string, unknown>
  result: string | null  // null = in corso
}

// ─── Store ────────────────────────────────────────────────────────────────────

const LS_EXPANDED = 'ai_panel_expanded'
const LS_WIDTH    = 'ai_panel_width'

export const useAiStore = defineStore('ai', () => {
  const isOpen            = ref(false)
  const isExpanded        = ref(localStorage.getItem(LS_EXPANDED) === 'true')
  const panelWidth        = ref(Number(localStorage.getItem(LS_WIDTH)) || 420)
  const isLoading         = ref(false)
  const conversations     = ref<AiConversation[]>([])
  const activeConvId      = ref<number | null>(null)
  const messages          = ref<AiMessage[]>([])
  const streamingContent  = ref('')
  const toolSteps         = ref<ToolStep[]>([])
  const error             = ref<string | null>(null)

  async function toggle(): Promise<void> {
    isOpen.value = !isOpen.value
    if (!isOpen.value) {
      return
    }
    // Apertura: carica conversazioni e seleziona la più recente
    try {
      conversations.value = await listConversations()
      if (conversations.value.length > 0 && activeConvId.value === null) {
        await selectConversation(conversations.value[0].id)
      }
    } catch { /* silenzioso: non critico */ }
  }

  async function loadConversations(): Promise<void> {
    try {
      conversations.value = await listConversations()
    } catch { /* silenzioso: non critico */ }
  }

  async function selectConversation(id: number): Promise<void> {
    try {
      const conv      = await getConversation(id)
      activeConvId.value = id
      messages.value     = conv.messages
      // Aggiorna il titolo nella lista locale
      const idx = conversations.value.findIndex(c => c.id === id)
      if (idx !== -1) conversations.value[idx] = { ...conversations.value[idx], title: conv.title }
    } catch { /* conversazione non trovata, ignora */ }
  }

  function startNewConversation(): void {
    activeConvId.value = null
    messages.value     = []
    streamingContent.value = ''
    toolSteps.value    = []
    error.value        = null
  }

  async function removeConversation(id: number): Promise<void> {
    await deleteConversation(id)
    conversations.value = conversations.value.filter(c => c.id !== id)
    if (activeConvId.value === id) startNewConversation()
  }

  async function sendMessage(text: string, context?: ChatContext): Promise<void> {
    if (isLoading.value || !text.trim()) return

    isLoading.value        = true
    streamingContent.value = ''
    toolSteps.value        = []
    error.value            = null

    // Aggiunta ottimistica del messaggio utente
    const userMsg: AiMessage = {
      id:             Date.now(),
      conversationId: activeConvId.value ?? 0,
      role:           'user',
      content:        text,
      toolCalls:      null,
      toolCallId:     null,
      createdAt:      Date.now(),
    }
    messages.value = [...messages.value, userMsg]

    try {
      const stream = await sendChatMessage({
        message:         text,
        conversationId:  activeConvId.value ?? undefined,
        context,
      })

      await parseSSEStream(stream, (event) => {
        if (event.type === 'conversation_id') {
          activeConvId.value = event.conversationId
          // Aggiorna il messaggio utente aggiunto in modo ottimistico
          userMsg.conversationId = event.conversationId
          // Se è una nuova conversazione, aggiungila alla lista
          if (!conversations.value.find(c => c.id === event.conversationId)) {
            conversations.value = [{
              id:             event.conversationId,
              userId:         0,
              title:          text.slice(0, 60),
              contextCodex:   context?.codex ?? null,
              contextFolioId: context?.folioId ?? null,
              createdAt:      Date.now(),
              updatedAt:      Date.now(),
            }, ...conversations.value]
          }
        } else if (event.type === 'chunk') {
          streamingContent.value += event.text
        } else if (event.type === 'tool_start') {
          toolSteps.value = [...toolSteps.value, {
            id:     event.id,
            name:   event.name,
            input:  event.input,
            result: null,
          }]
        } else if (event.type === 'tool_result') {
          toolSteps.value = toolSteps.value.map(s =>
            s.id === event.id ? { ...s, result: event.result } : s,
          )
        } else if (event.type === 'done') {
          // Aggiungi il messaggio assistant alla lista
          const assistantMsg: AiMessage = {
            id:             Date.now() + 1,
            conversationId: activeConvId.value ?? 0,
            role:           'assistant',
            content:        event.finalContent,
            toolCalls:      null,
            toolCallId:     null,
            createdAt:      Date.now(),
          }
          messages.value = [...messages.value, assistantMsg]
          streamingContent.value = ''
          // Aggiorna il titolo nella lista locale
          const idx = conversations.value.findIndex(c => c.id === activeConvId.value)
          if (idx !== -1) {
            conversations.value[idx] = {
              ...conversations.value[idx],
              title:     text.slice(0, 60) + (text.length > 60 ? '…' : ''),
              updatedAt: Date.now(),
            }
          }
        } else if (event.type === 'error') {
          error.value = event.message
          streamingContent.value = ''
        }
      })
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : 'Errore sconosciuto'
      streamingContent.value = ''
    } finally {
      isLoading.value = false
    }
  }

  watch(isExpanded, v => localStorage.setItem(LS_EXPANDED, String(v)))
  watch(panelWidth,  v => localStorage.setItem(LS_WIDTH,    String(v)))

  return {
    isOpen,
    isExpanded,
    panelWidth,
    isLoading,
    conversations,
    activeConvId,
    messages,
    streamingContent,
    toolSteps,
    error,
    toggle,
    loadConversations,
    selectConversation,
    startNewConversation,
    removeConversation,
    sendMessage,
  }
})
