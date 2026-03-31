import { apiFetch } from './client.js'
import { getAuthHeaders } from './client.js'

// ─── Tipi ─────────────────────────────────────────────────────────────────────

export interface AiSettings {
  provider:     'openai' | 'anthropic' | 'ollama'
  model:        string
  hasApiKey:    boolean
  baseUrl:      string
  systemPrompt: string
  allowedPaths: string[]
}

export interface AiSettingsUpdate {
  provider?:     'openai' | 'anthropic' | 'ollama'
  model?:        string
  apiKey?:       string
  baseUrl?:      string
  systemPrompt?: string
  allowedPaths?: string[]
}

export interface AiConversation {
  id:             number
  userId:         number
  title:          string
  contextCodex:   string | null
  contextFolioId: number | null
  createdAt:      number
  updatedAt:      number
}

export interface AiMessage {
  id:             number
  conversationId: number
  role:           'user' | 'assistant' | 'tool' | 'tool_result'
  content:        string
  toolCalls:      string | null
  toolCallId:     string | null
  createdAt:      number
}

export interface AiConversationWithMessages extends AiConversation {
  messages: AiMessage[]
}

export interface ChatContext {
  type?:    string
  codex?:   string
  folioId?: number
  page?:    string
}

// ─── SSE stream events ────────────────────────────────────────────────────────

export type SseEvent =
  | { type: 'conversation_id'; conversationId: number }
  | { type: 'chunk';           text: string }
  | { type: 'tool_start';      id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result';     id: string; name: string; result: string }
  | { type: 'done';            finalContent: string }
  | { type: 'error';           message: string }

// ─── API functions ────────────────────────────────────────────────────────────

export function getAiSettings(): Promise<AiSettings> {
  return apiFetch<AiSettings>('/api/v1/plugins/ai/settings')
}

export function updateAiSettings(data: AiSettingsUpdate): Promise<AiSettings> {
  return apiFetch<AiSettings>('/api/v1/plugins/ai/settings', {
    method: 'PUT',
    body:   JSON.stringify(data),
  })
}

export function listConversations(): Promise<AiConversation[]> {
  return apiFetch<AiConversation[]>('/api/v1/plugins/ai/conversations')
}

export function getConversation(id: number): Promise<AiConversationWithMessages> {
  return apiFetch<AiConversationWithMessages>(`/api/v1/plugins/ai/conversations/${id}`)
}

export function deleteConversation(id: number): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/api/v1/plugins/ai/conversations/${id}`, { method: 'DELETE' })
}

/**
 * Invia un messaggio e ritorna un ReadableStream di righe SSE.
 * Il chiamante deve iterare sul reader con parseSSEStream().
 */
export function sendChatMessage(params: {
  message:         string
  conversationId?: number
  context?:        ChatContext
}): Promise<ReadableStream<Uint8Array>> {
  return fetch('/api/v1/plugins/ai/chat', {
    method:      'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(params),
  }).then(res => {
    if (!res.ok || !res.body) throw new Error(`Chat error: ${res.status}`)
    return res.body
  })
}

/**
 * Legge uno stream SSE e chiama onEvent per ogni evento ricevuto.
 */
export async function parseSSEStream(
  stream:  ReadableStream<Uint8Array>,
  onEvent: (event: SseEvent) => void,
): Promise<void> {
  const reader  = stream.getReader()
  const decoder = new TextDecoder()
  let buffer    = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''  // L'ultima riga potrebbe essere incompleta

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (!data) continue
        try {
          const event = JSON.parse(data) as SseEvent
          onEvent(event)
        } catch { /* JSON invalido, ignora */ }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
