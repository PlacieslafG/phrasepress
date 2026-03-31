<script setup lang="ts">
import { ref, computed, nextTick, watch, onMounted, onUnmounted } from 'vue'
import { useAiStore } from '@/stores/ai.js'
import { useAiContext } from '@/composables/useAiContext.js'
import Button from 'primevue/button'
import Tag from 'primevue/tag'

const aiStore = useAiStore()
const { context, contextLabel } = useAiContext()

const inputText    = ref('')
const messagesEl   = ref<HTMLElement | null>(null)
const showHistory  = ref(false)
const inputEl      = ref<HTMLTextAreaElement | null>(null)

// ─── Resize handle (solo modalità espansa) ────────────────────────────────────

const MIN_WIDTH = 280
const MAX_WIDTH = 900

let isResizing  = false
let startX      = 0
let startWidth  = 0

function onResizeStart(e: MouseEvent): void {
  isResizing = true
  startX     = e.clientX
  startWidth = aiStore.panelWidth
  document.body.style.cursor    = 'col-resize'
  document.body.style.userSelect = 'none'
}

function onResizeMove(e: MouseEvent): void {
  if (!isResizing) return
  const delta = startX - e.clientX
  aiStore.panelWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + delta))
}

function onResizeEnd(): void {
  if (!isResizing) return
  isResizing = false
  document.body.style.cursor    = ''
  document.body.style.userSelect = ''
}

onMounted(() => {
  window.addEventListener('mousemove', onResizeMove)
  window.addEventListener('mouseup',   onResizeEnd)
})

onUnmounted(() => {
  window.removeEventListener('mousemove', onResizeMove)
  window.removeEventListener('mouseup',   onResizeEnd)
})

// ─── Auto-scroll ai nuovi messaggi ───────────────────────────────────────────

function scrollToBottom(): void {
  nextTick(() => {
    if (messagesEl.value) {
      messagesEl.value.scrollTop = messagesEl.value.scrollHeight
    }
  })
}

watch(() => aiStore.messages.length, scrollToBottom)
watch(() => aiStore.streamingContent, scrollToBottom)

// ─── Carica conversazioni all'apertura ───────────────────────────────────────

watch(() => aiStore.isOpen, (open) => {
  if (open) {
    aiStore.loadConversations()
    nextTick(() => inputEl.value?.focus())
  }
})

// ─── Invia messaggio ──────────────────────────────────────────────────────────

async function handleSend(): Promise<void> {
  const text = inputText.value.trim()
  if (!text || aiStore.isLoading) return
  inputText.value = ''
  await aiStore.sendMessage(text, context.value)
  scrollToBottom()
}

function handleKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

// ─── Formattazione messaggi ───────────────────────────────────────────────────

function formatToolName(name: string): string {
  return name.replace(/_/g, ' ')
}

function renderMarkdown(text: string): string {
  // Minima formattazione: code blocks, inline code, bold, link
  return text
    .replace(/```([\s\S]*?)```/g, '<pre class="bg-surface-ground rounded p-2 text-xs overflow-x-auto my-1"><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code class="bg-surface-ground px-1 rounded text-xs break-all">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>')
}
</script>

<template>
  <!-- Bottone toggle floating -->
  <Transition name="fab">
    <button
      v-if="!aiStore.isOpen"
      class="fixed bottom-5 right-5 z-50 w-12 h-12 rounded-full bg-primary text-white shadow-lg flex items-center justify-center hover:bg-primary-600 transition-colors"
      title="Apri AI Chat"
      @click="aiStore.toggle()"
    >
      <i class="pi pi-sparkles text-lg" />
    </button>
  </Transition>

  <!-- Panel chat -->
  <Transition :name="aiStore.isExpanded ? 'sidebar' : 'panel'">
    <div
      v-if="aiStore.isOpen"
      :class="aiStore.isExpanded
        ? 'fixed right-0 top-14 z-40 flex flex-col bg-surface-card border-l border-surface-border shadow-2xl overflow-hidden'
        : 'fixed bottom-5 right-5 z-50 w-96 h-[600px] flex flex-col bg-surface-card border border-surface-border rounded-xl shadow-2xl overflow-hidden'
      "
      :style="aiStore.isExpanded
        ? { width: aiStore.panelWidth + 'px', height: 'calc(100vh - 3.5rem)' }
        : {}
      "

      <!-- Resize handle (solo modalità espansa) -->
      <div
        v-if="aiStore.isExpanded"
        class="absolute left-0 top-0 h-full w-1.5 cursor-col-resize z-50 group"
        @mousedown.prevent="onResizeStart"
      >
        <div class="absolute left-0 top-0 h-full w-full group-hover:bg-primary/40 transition-colors" />
      </div>

      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-surface-border shrink-0 bg-surface-card">
        <div class="flex items-center gap-2">
          <i class="pi pi-sparkles text-primary" />
          <span class="font-semibold text-sm">AI Assistant</span>
        </div>
        <div class="flex items-center gap-1">
          <Button
            :icon="aiStore.isExpanded ? 'pi pi-arrow-down-left-and-arrow-up-right-to-center' : 'pi pi-expand'"
            text
            rounded
            size="small"
            severity="secondary"
            v-tooltip.bottom="aiStore.isExpanded ? 'Vista compatta' : 'Espandi'"
            @click="aiStore.isExpanded = !aiStore.isExpanded"
          />
          <Button
            icon="pi pi-history"
            text
            rounded
            size="small"
            :severity="showHistory ? 'primary' : 'secondary'"
            v-tooltip.bottom="'Cronologia'"
            @click="showHistory = !showHistory"
          />
          <Button
            icon="pi pi-plus"
            text
            rounded
            size="small"
            severity="secondary"
            v-tooltip.bottom="'Nuova chat'"
            @click="aiStore.startNewConversation(); showHistory = false"
          />
          <Button
            icon="pi pi-times"
            text
            rounded
            size="small"
            severity="secondary"
            @click="aiStore.toggle()"
          />
        </div>
      </div>

      <!-- Pannello cronologia (drawer interno) -->
      <Transition name="slide">
        <div v-if="showHistory" class="absolute inset-0 top-[53px] z-10 bg-surface-card flex flex-col">
          <div class="px-4 py-2 text-xs font-semibold text-surface-500 uppercase tracking-wide border-b border-surface-border">
            Conversazioni recenti
          </div>
          <div class="flex-1 overflow-y-auto">
            <div
              v-if="aiStore.conversations.length === 0"
              class="p-4 text-sm text-surface-400 text-center"
            >
              Nessuna conversazione
            </div>
            <div
              v-for="conv in aiStore.conversations"
              :key="conv.id"
              class="flex items-center justify-between px-4 py-2.5 hover:bg-surface-hover cursor-pointer border-b border-surface-border/50 group"
              :class="{ 'bg-primary/10': conv.id === aiStore.activeConvId }"
              @click="aiStore.selectConversation(conv.id); showHistory = false"
            >
              <span class="text-sm truncate flex-1 pr-2">{{ conv.title }}</span>
              <button
                class="opacity-0 group-hover:opacity-100 text-surface-400 hover:text-red-500 transition-all"
                @click.stop="aiStore.removeConversation(conv.id)"
              >
                <i class="pi pi-trash text-xs" />
              </button>
            </div>
          </div>
        </div>
      </Transition>

      <!-- Context badge -->
      <div v-if="contextLabel" class="px-4 py-1.5 border-b border-surface-border/50 shrink-0 bg-surface-ground/60">
        <Tag severity="info" class="text-xs gap-1">
          <i class="pi pi-file-edit mr-1 text-xs" />
          {{ contextLabel }}
        </Tag>
      </div>

      <!-- Lista messaggi -->
      <div ref="messagesEl" class="flex-1 overflow-y-auto p-3 flex flex-col gap-3">

        <!-- Stato vuoto -->
        <div
          v-if="aiStore.messages.length === 0 && !aiStore.streamingContent"
          class="flex flex-col items-center justify-center h-full text-center gap-3 text-surface-400"
        >
          <i class="pi pi-sparkles text-4xl text-primary/40" />
          <p class="text-sm">Come posso aiutarti?</p>
          <p class="text-xs">Posso leggere e scrivere contenuti CMS, fare ricerche e accedere ai file del progetto.</p>
        </div>

        <!-- Messaggi -->
        <template v-for="msg in aiStore.messages" :key="msg.id">
          <!-- Tool result: non mostrato direttamente, è già nel tool step -->
          <template v-if="msg.role !== 'tool'">
            <div
              class="flex flex-col gap-1"
              :class="msg.role === 'user' ? 'items-end' : 'items-start'"
            >
              <div
                class="max-w-[85%] min-w-0 overflow-hidden px-3 py-2 rounded-2xl text-sm leading-relaxed"
                :class="msg.role === 'user'
                  ? 'bg-primary text-white rounded-br-sm'
                  : 'bg-surface-ground text-surface-700 dark:text-surface-200 rounded-bl-sm'"
                v-html="msg.role === 'user' ? msg.content.replace(/\n/g, '<br>') : renderMarkdown(msg.content)"
              />
            </div>
          </template>
        </template>

        <!-- Tool steps (visibili separatamente) -->
        <div v-if="aiStore.toolSteps.length > 0" class="flex flex-col gap-1.5">
          <details
            v-for="step in aiStore.toolSteps"
            :key="step.id"
            class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-lg text-xs overflow-hidden"
          >
            <summary class="flex items-center gap-1.5 px-2.5 py-1.5 cursor-pointer list-none select-none">
              <i
                class="pi text-amber-600 dark:text-amber-400 text-xs"
                :class="step.result === null ? 'pi-spin pi-spinner' : 'pi-wrench'"
              />
              <span class="font-medium text-amber-700 dark:text-amber-300">{{ formatToolName(step.name) }}</span>
              <span v-if="step.result !== null" class="text-amber-500 ml-auto">✓</span>
            </summary>
            <div class="px-2.5 pb-2 pt-0.5 border-t border-amber-200 dark:border-amber-700/50">
              <div class="text-surface-500 mb-1">Input:</div>
              <pre class="text-xs overflow-x-auto whitespace-pre-wrap break-all text-surface-600 dark:text-surface-300">{{ JSON.stringify(step.input, null, 2) }}</pre>
              <template v-if="step.result !== null">
                <div class="text-surface-500 mt-1.5 mb-1">Risultato:</div>
                <pre class="text-xs overflow-x-auto whitespace-pre-wrap break-all text-surface-600 dark:text-surface-300">{{ step.result }}</pre>
              </template>
            </div>
          </details>
        </div>

        <!-- Messaggio in streaming -->
        <div v-if="aiStore.streamingContent" class="flex items-start">
          <div
            class="max-w-[85%] px-3 py-2 rounded-2xl rounded-bl-sm text-sm leading-relaxed bg-surface-ground text-surface-700 dark:text-surface-200"
            v-html="renderMarkdown(aiStore.streamingContent)"
          />
        </div>

        <!-- Typing indicator -->
        <div v-if="aiStore.isLoading && !aiStore.streamingContent && aiStore.toolSteps.length === 0" class="flex items-start">
          <div class="bg-surface-ground rounded-2xl rounded-bl-sm px-3 py-2.5 flex gap-1">
            <span class="w-1.5 h-1.5 bg-surface-400 rounded-full animate-bounce" style="animation-delay:0ms" />
            <span class="w-1.5 h-1.5 bg-surface-400 rounded-full animate-bounce" style="animation-delay:150ms" />
            <span class="w-1.5 h-1.5 bg-surface-400 rounded-full animate-bounce" style="animation-delay:300ms" />
          </div>
        </div>

        <!-- Errore -->
        <div v-if="aiStore.error" class="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/50 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          <i class="pi pi-exclamation-triangle mr-1.5" />
          {{ aiStore.error }}
        </div>

      </div>

      <!-- Input area -->
      <div class="shrink-0 border-t border-surface-border p-3">
        <div class="flex gap-2 items-end">
          <textarea
            ref="inputEl"
            v-model="inputText"
            rows="1"
            class="flex-1 resize-none rounded-xl border border-surface-border bg-surface-ground px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary text-surface-700 dark:text-surface-200 placeholder-surface-400 max-h-32 overflow-y-auto"
            placeholder="Scrivi un messaggio… (Invio invia, Shift+Invio va a capo)"
            :disabled="aiStore.isLoading"
            @keydown="handleKeydown"
            @input="($event.target as HTMLTextAreaElement).style.height = 'auto'; ($event.target as HTMLTextAreaElement).style.height = ($event.target as HTMLTextAreaElement).scrollHeight + 'px'"
          />
          <Button
            icon="pi pi-send"
            rounded
            :disabled="!inputText.trim() || aiStore.isLoading"
            @click="handleSend"
          />
        </div>
      </div>

    </div>
  </Transition>
</template>

<style scoped>
.fab-enter-active,
.fab-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}
.fab-enter-from,
.fab-leave-to {
  opacity: 0;
  transform: scale(0.7);
}

.panel-enter-active,
.panel-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}
.panel-enter-from,
.panel-leave-to {
  opacity: 0;
  transform: translateY(16px) scale(0.97);
}

.sidebar-enter-active,
.sidebar-leave-active {
  transition: opacity 0.2s, transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.sidebar-enter-from,
.sidebar-leave-to {
  opacity: 0;
  transform: translateX(100%);
}

.slide-enter-active,
.slide-leave-active {
  transition: opacity 0.15s, transform 0.15s;
}
.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  transform: translateX(20px);
}
</style>
