// Client LLM per auto-traduzione — compatibile con l'API OpenAI (Chat Completions)
// Funziona con qualsiasi server che espone POST /chat/completions nel formato OpenAI.

const DEFAULT_PROMPT_TEMPLATE = `Translate the following text from {sourceLocale} to {targetLocale}.
Return ONLY the translated text, without any explanation, notes, or additional content.
{htmlNote}

{text}`

const HTML_NOTE = 'The text contains HTML tags. Preserve ALL HTML tags exactly as they appear. Only translate the visible text content between tags, not the tags themselves or their attributes.'

export interface TranslatorConfig {
  baseUrl:        string
  model:          string
  apiKey?:        string
  promptTemplate?: string
  sourceLocale:   string
}

export class TranslatorError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message)
    this.name = 'TranslatorError'
  }
}

function buildPrompt(
  promptTemplate: string,
  text: string,
  sourceLocale: string,
  targetLocale: string,
  isHtml: boolean,
): string {
  return promptTemplate
    .replace('{sourceLocale}', sourceLocale)
    .replace('{targetLocale}', targetLocale)
    .replace('{htmlNote}',     isHtml ? HTML_NOTE : '')
    .replace('{text}',         text)
}

export async function translateText(
  config: TranslatorConfig,
  text:   string,
  targetLocale: string,
  isHtml = false,
): Promise<string> {
  if (!config.baseUrl || !config.model) {
    throw new TranslatorError('LLM not configured: baseUrl and model are required')
  }

  const prompt = buildPrompt(
    config.promptTemplate ?? DEFAULT_PROMPT_TEMPLATE,
    text,
    config.sourceLocale,
    targetLocale,
    isHtml,
  )

  const url = config.baseUrl.replace(/\/$/, '') + '/chat/completions'

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`
  }

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model:    config.model,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
  } catch (err) {
    throw new TranslatorError(`LLM request failed: ${String(err)}`, err)
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new TranslatorError(`LLM returned HTTP ${response.status}: ${body}`)
  }

  interface ChatResponse {
    choices: Array<{ message: { content: string } }>
  }

  let data: ChatResponse
  try {
    data = await response.json() as ChatResponse
  } catch (err) {
    throw new TranslatorError('LLM returned invalid JSON', err)
  }

  const content = data.choices?.[0]?.message?.content
  if (typeof content !== 'string' || content.length === 0) {
    throw new TranslatorError('LLM returned empty or unexpected response')
  }

  return content.trim()
}

// Traduce un set di campi — salta i tipi non testuali
export async function translateFields(
  config: TranslatorConfig,
  fields: Record<string, unknown>,
  fieldDefs: Array<{ name: string; type: string }>,
  targetLocale: string,
): Promise<Record<string, unknown>> {
  const TRANSLATABLE_TYPES = new Set(['string', 'textarea', 'richtext'])
  const result: Record<string, unknown> = { ...fields }

  for (const def of fieldDefs) {
    if (!TRANSLATABLE_TYPES.has(def.type)) continue
    const value = fields[def.name]
    if (typeof value !== 'string' || value.trim() === '') continue

    result[def.name] = await translateText(
      config,
      value,
      targetLocale,
      def.type === 'richtext',
    )
  }

  return result
}

// Verifica che il server LLM sia raggiungibile inviando una traduzione di test
export async function testConnection(config: TranslatorConfig): Promise<{ ok: boolean; message: string }> {
  try {
    const result = await translateText(
      config,
      'Hello',
      config.sourceLocale === 'en' ? 'it' : 'en',
    )
    return { ok: true, message: `Connection OK — test result: "${result}"` }
  } catch (err) {
    return { ok: false, message: err instanceof TranslatorError ? err.message : String(err) }
  }
}
