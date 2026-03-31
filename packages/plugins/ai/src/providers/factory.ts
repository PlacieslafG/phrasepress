import type { AiSettings } from '../db.js'
import type { AiProviderInterface } from './types.js'
import { OpenAiProvider } from './openai.js'
import { AnthropicProvider } from './anthropic.js'

export function createProvider(settings: AiSettings, model: string): AiProviderInterface {
  switch (settings.provider) {
    case 'openai':
      return new OpenAiProviderWithModel(settings.apiKey, model, undefined)

    case 'ollama':
      // Ollama espone API OpenAI-compatibili, passa solo baseURL diverso
      return new OpenAiProviderWithModel(
        settings.apiKey || 'ollama',
        model,
        settings.baseUrl || 'http://localhost:11434/v1',
      )

    case 'anthropic':
      return new AnthropicProvider(settings.apiKey, model)

    default:
      throw new Error(`Provider LLM non supportato: ${settings.provider}`)
  }
}

// ─── Wrapper che inietta il model nelle chiamate OpenAI ───────────────────────

import OpenAI from 'openai'
import type { ChatMessage, ToolDefinition, StreamEvent, ToolCall } from './types.js'

class OpenAiProviderWithModel implements AiProviderInterface {
  private client: OpenAI
  private model:  string

  constructor(apiKey: string, model: string, baseURL: string | undefined) {
    this.client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) })
    this.model  = model
  }

  async streamChat(
    messages: ChatMessage[],
    tools:    ToolDefinition[],
    onEvent:  (event: StreamEvent) => void,
  ): Promise<void> {
    const openaiMessages = messages.map(m => {
      if (m.role === 'tool') {
        return { role: 'tool' as const, content: m.content, tool_call_id: m.toolCallId ?? '' }
      }
      if (m.role === 'assistant' && m.toolCalls?.length) {
        return {
          role:       'assistant' as const,
          content:    m.content || null,
          tool_calls: m.toolCalls.map(tc => ({
            id:       tc.id,
            type:     'function' as const,
            function: { name: tc.name, arguments: JSON.stringify(tc.input) },
          })),
        }
      }
      return { role: m.role, content: m.content } as OpenAI.ChatCompletionMessageParam
    })

    const openaiTools: OpenAI.ChatCompletionTool[] = tools.map(t => ({
      type:     'function' as const,
      function: { name: t.name, description: t.description, parameters: t.parameters as Record<string, unknown> },
    }))

    const stream = await this.client.chat.completions.create({
      model:    this.model,
      messages: openaiMessages,
      tools:    openaiTools.length > 0 ? openaiTools : undefined,
      stream:   true,
    }) as AsyncIterable<OpenAI.ChatCompletionChunk>

    let fullContent = ''
    const pendingCalls: Map<number, { id: string; name: string; args: string }> = new Map()

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta
      if (!delta) continue

      if (delta.content) {
        fullContent += delta.content
        onEvent({ type: 'chunk', text: delta.content })
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index
          if (!pendingCalls.has(idx)) pendingCalls.set(idx, { id: '', name: '', args: '' })
          const entry = pendingCalls.get(idx)!
          if (tc.id) entry.id = tc.id
          if (tc.function?.name) entry.name = tc.function.name
          if (tc.function?.arguments) entry.args += tc.function.arguments
        }
      }
    }

    const toolCalls: ToolCall[] = []
    for (const [, tc] of pendingCalls) {
      let input: Record<string, unknown> = {}
      try { input = JSON.parse(tc.args) as Record<string, unknown> } catch { /* args invalidi */ }
      const call: ToolCall = { id: tc.id, name: tc.name, input }
      toolCalls.push(call)
      onEvent({ type: 'tool_call', call })
    }

    onEvent({ type: 'done', content: fullContent, toolCalls })
  }
}
