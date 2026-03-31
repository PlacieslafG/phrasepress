import Anthropic from '@anthropic-ai/sdk'
import type { AiProviderInterface, ChatMessage, ToolDefinition, StreamEvent, ToolCall } from './types.js'

export class AnthropicProvider implements AiProviderInterface {
  private client: Anthropic
  private model:  string

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey })
    this.model  = model
  }

  async streamChat(
    messages: ChatMessage[],
    tools:    ToolDefinition[],
    onEvent:  (event: StreamEvent) => void,
  ): Promise<void> {
    // Anthropic separa il system message dal resto
    const systemMsg  = messages.find(m => m.role === 'system')
    const chatMessages = messages.filter(m => m.role !== 'system')

    const anthropicMessages: Anthropic.MessageParam[] = chatMessages.map(m => {
      if (m.role === 'tool') {
        return {
          role:    'user' as const,
          content: [{
            type:        'tool_result' as const,
            tool_use_id: m.toolCallId ?? '',
            content:     m.content,
          }],
        }
      }
      if (m.role === 'assistant' && m.toolCalls?.length) {
        return {
          role:    'assistant' as const,
          content: [
            ...(m.content ? [{ type: 'text' as const, text: m.content }] : []),
            ...m.toolCalls.map(tc => ({
              type:  'tool_use' as const,
              id:    tc.id,
              name:  tc.name,
              input: tc.input,
            })),
          ],
        }
      }
      return { role: m.role as 'user' | 'assistant', content: m.content }
    })

    const anthropicTools: Anthropic.Tool[] = tools.map(t => ({
      name:         t.name,
      description:  t.description,
      input_schema: t.parameters as Anthropic.Tool['input_schema'],
    }))

    let fullContent = ''
    const toolCalls: ToolCall[] = []

    const stream = await this.client.messages.stream({
      model:      this.model,
      max_tokens: 4096,
      system:     systemMsg?.content,
      messages:   anthropicMessages,
      tools:      anthropicTools.length > 0 ? anthropicTools : undefined,
    })

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          fullContent += event.delta.text
          onEvent({ type: 'chunk', text: event.delta.text })
        } else if (event.delta.type === 'input_json_delta') {
          // Accumula input per tool_use (gestito al content_block_stop)
        }
      }

      if (event.type === 'content_block_stop') {
        const block = stream.currentMessage?.content[event.index]
        if (block?.type === 'tool_use') {
          const call: ToolCall = {
            id:    block.id,
            name:  block.name,
            input: block.input as Record<string, unknown>,
          }
          toolCalls.push(call)
          onEvent({ type: 'tool_call', call })
        }
      }
    }

    onEvent({ type: 'done', content: fullContent, toolCalls })
  }
}
