// ─── Tipi condivisi tra tutti i provider ────────────────────────────────────

export interface ChatMessage {
  role:        'system' | 'user' | 'assistant' | 'tool'
  content:     string
  toolCallId?: string
  toolCalls?:  ToolCall[]
  name?:       string
}

export interface ToolCall {
  id:       string
  name:     string
  input:    Record<string, unknown>
}

export interface ToolDefinition {
  name:        string
  description: string
  parameters:  Record<string, unknown>  // JSON Schema object
}

// ─── Stream events emessi durante una chiamata LLM ───────────────────────────

export type StreamEvent =
  | { type: 'chunk';       text: string }
  | { type: 'tool_call';   call: ToolCall }
  | { type: 'done';        content: string; toolCalls: ToolCall[] }
  | { type: 'error';       message: string }

// ─── Interfaccia provider ────────────────────────────────────────────────────

export interface AiProviderInterface {
  /**
   * Invia i messaggi al LLM e chiama `onEvent` per ogni stream event.
   * Ritorna quando lo stream è completo.
   */
  streamChat(
    messages: ChatMessage[],
    tools:    ToolDefinition[],
    onEvent:  (event: StreamEvent) => void,
  ): Promise<void>
}
