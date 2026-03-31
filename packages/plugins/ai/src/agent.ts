import type { AiProviderInterface, ChatMessage, StreamEvent, ToolCall } from './providers/types.js'
import type { ToolContext } from './tools/index.js'
import { getToolDefinitions, executeTool } from './tools/index.js'

// ─── Tipi emessi dall'agent loop ──────────────────────────────────────────────

export type AgentEvent =
  | { type: 'chunk';        text: string }
  | { type: 'tool_start';   id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result';  id: string; name: string; result: string }
  | { type: 'done';         finalContent: string }
  | { type: 'error';        message: string }

export interface AgentParams {
  provider:     AiProviderInterface
  messages:     ChatMessage[]
  toolContext:  ToolContext
  maxIter?:     number  // default 10
}

// ─── Agent loop ────────────────────────────────────────────────────────────────
// Esegue il ciclo: LLM → tool calls → risultati → LLM finché non c'è risposta
// testuale senza tool calls (o si raggiunge maxIter).

export async function* runAgent(params: AgentParams): AsyncGenerator<AgentEvent> {
  const { provider, toolContext } = params
  const maxIter = params.maxIter ?? 10
  const tools   = getToolDefinitions()

  // Copia mutabile dei messaggi — li estendiamo ad ogni iterazione
  const messages: ChatMessage[] = [...params.messages]

  // [DEBUG] — rimuovere prima del deploy
  console.log(`[AI AGENT] iter start | tools: ${tools.map(t => t.name).join(', ')} | messages: ${messages.length}`)

  for (let iter = 0; iter < maxIter; iter++) {
    console.log(`[AI AGENT] iteration ${iter + 1}/${maxIter}`)
    let finalContent = ''
    const toolCalls: ToolCall[] = []

    // Buffer di eventi dal provider — li raccogliamo per sapere la risposta
    const events: StreamEvent[] = []

    await provider.streamChat(messages, tools, (event) => {
      events.push(event)
    })

    // Processa gli eventi in ordine
    for (const event of events) {
      if (event.type === 'chunk') {
        finalContent += event.text
        yield { type: 'chunk', text: event.text }
      } else if (event.type === 'tool_call') {
        toolCalls.push(event.call)
      } else if (event.type === 'done') {
        finalContent = event.content
        // I tool_calls arrivano già dalle iterazioni precedenti, done li conferma
      }
    }

    // Nessun tool call → risposta finale, usciamo
    if (toolCalls.length === 0) {
      yield { type: 'done', finalContent }
      return
    }

    // Aggiungi il messaggio assistant con i tool calls
    messages.push({
      role:      'assistant',
      content:   finalContent,
      toolCalls: toolCalls,
    })

    // Esegui i tool calls e aggiungi i risultati
    for (const call of toolCalls) {
      yield { type: 'tool_start', id: call.id, name: call.name, input: call.input }

      const result = await executeTool(call.name, call.input, toolContext)

      yield { type: 'tool_result', id: call.id, name: call.name, result }

      messages.push({
        role:       'tool',
        content:    result,
        toolCallId: call.id,
        name:       call.name,
      })
    }
  }

  // Abbiamo raggiunto maxIter senza risposta finale
  yield { type: 'error', message: `Limite massimo iterazioni (${maxIter}) raggiunto.` }
}
