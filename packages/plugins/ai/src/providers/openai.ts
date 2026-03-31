import OpenAI from 'openai'
import type { AiProviderInterface, ChatMessage, ToolDefinition, StreamEvent, ToolCall } from './types.js'

export class OpenAiProvider implements AiProviderInterface {
  private client: OpenAI

  constructor(apiKey: string, baseURL?: string) {
    this.client = new OpenAI({
      apiKey,
      ...(baseURL ? { baseURL } : {}),
    })
  }

  async streamChat(
    messages: ChatMessage[],
    tools:    ToolDefinition[],
    onEvent:  (event: StreamEvent) => void,
  ): Promise<void> {
    const openaiMessages = messages.map(m => {
      if (m.role === 'tool') {
        return {
          role:         'tool' as const,
          content:      m.content,
          tool_call_id: m.toolCallId ?? '',
        }
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
      function: {
        name:        t.name,
        description: t.description,
        parameters:  t.parameters as Record<string, unknown>,
      },
    }))

    const stream = await this.client.chat.completions.create({
      model:    '',  // sovrascritto dal chiamante via model option
      messages: openaiMessages,
      tools:    openaiTools.length > 0 ? openaiTools : undefined,
      stream:   true,
    } as Parameters<typeof this.client.chat.completions.create>[0]) as AsyncIterable<OpenAI.ChatCompletionChunk>

    let fullContent = ''
    const pendingToolCalls: Map<number, { id: string; name: string; args: string }> = new Map()

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
          if (!pendingToolCalls.has(idx)) {
            pendingToolCalls.set(idx, { id: tc.id ?? '', name: tc.function?.name ?? '', args: '' })
          }
          const entry = pendingToolCalls.get(idx)!
          if (tc.function?.arguments) entry.args += tc.function.arguments
          if (tc.id) entry.id = tc.id
          if (tc.function?.name) entry.name = tc.function.name
        }
      }
    }

    const toolCalls: ToolCall[] = []
    for (const [, tc] of pendingToolCalls) {
      let input: Record<string, unknown> = {}
      try { input = JSON.parse(tc.args) as Record<string, unknown> } catch { /* args invalidi */ }
      const call: ToolCall = { id: tc.id, name: tc.name, input }
      toolCalls.push(call)
      onEvent({ type: 'tool_call', call })
    }

    onEvent({ type: 'done', content: fullContent, toolCalls })
  }
}
