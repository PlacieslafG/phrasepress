// Client LLM per auto-traduzione — compatibile con l'API OpenAI (Chat Completions)
// Funziona con qualsiasi server che espone POST /chat/completions nel formato OpenAI.

// Mappa locale → nome lingua esteso per prompt più efficaci con modelli general-purpose
const LOCALE_NAMES: Record<string, string> = {
  'af': 'Afrikaans', 'ar': 'Arabic', 'az': 'Azerbaijani', 'be': 'Belarusian',
  'bg': 'Bulgarian', 'bn': 'Bengali', 'bs': 'Bosnian', 'ca': 'Catalan',
  'cs': 'Czech', 'cy': 'Welsh', 'da': 'Danish', 'de': 'German',
  'el': 'Greek', 'en': 'English', 'eo': 'Esperanto', 'es': 'Spanish',
  'et': 'Estonian', 'eu': 'Basque', 'fa': 'Persian', 'fi': 'Finnish',
  'fr': 'French', 'ga': 'Irish', 'gl': 'Galician', 'gu': 'Gujarati',
  'he': 'Hebrew', 'hi': 'Hindi', 'hr': 'Croatian', 'hu': 'Hungarian',
  'hy': 'Armenian', 'id': 'Indonesian', 'is': 'Icelandic', 'it': 'Italian',
  'ja': 'Japanese', 'ka': 'Georgian', 'kk': 'Kazakh', 'km': 'Khmer',
  'kn': 'Kannada', 'ko': 'Korean', 'lt': 'Lithuanian', 'lv': 'Latvian',
  'mk': 'Macedonian', 'ml': 'Malayalam', 'mn': 'Mongolian', 'mr': 'Marathi',
  'ms': 'Malay', 'mt': 'Maltese', 'my': 'Burmese', 'nb': 'Norwegian Bokmål',
  'ne': 'Nepali', 'nl': 'Dutch', 'pa': 'Punjabi', 'pl': 'Polish',
  'pt': 'Portuguese', 'pt-br': 'Brazilian Portuguese', 'pt-pt': 'European Portuguese',
  'ro': 'Romanian', 'ru': 'Russian', 'sk': 'Slovak', 'sl': 'Slovenian',
  'sq': 'Albanian', 'sr': 'Serbian', 'sv': 'Swedish', 'sw': 'Swahili',
  'ta': 'Tamil', 'te': 'Telugu', 'th': 'Thai', 'tl': 'Filipino',
  'tr': 'Turkish', 'uk': 'Ukrainian', 'ur': 'Urdu', 'uz': 'Uzbek',
  'vi': 'Vietnamese', 'zh': 'Chinese (Simplified)', 'zh-cn': 'Chinese (Simplified)',
  'zh-tw': 'Chinese (Traditional)', 'zu': 'Zulu',
}

function localeName(code: string): string {
  return LOCALE_NAMES[code.toLowerCase()] ?? code
}

// System message: stabilisce il ruolo del modello come traduttore professionale.
// Usare il system message è fondamentale per i modelli general-purpose.
const SYSTEM_MESSAGE = `You are an expert professional translator with deep knowledge of grammar, style, and cultural nuances across languages. Your sole task is to translate content for a CMS (website/blog content management system).

Rules you must follow without exception:
1. Output ONLY the translated text — no explanations, no notes, no alternatives, no preamble, no "Here is the translation:", nothing extra.
2. Preserve the original tone, register, and formatting exactly (formal/informal, headlines vs body text, lists, punctuation style).
3. Use natural, fluent, idiomatic expressions in the target language — avoid word-for-word literal translation.
4. Proper nouns, brand names, product names, and technical terms should remain unchanged unless there is a well-established equivalent in the target language.
5. If the source text is empty or meaningless, output an empty string.`

const SYSTEM_MESSAGE_HTML = `${SYSTEM_MESSAGE}
6. The text contains HTML markup. Preserve ALL HTML tags, attributes, and entities EXACTLY as they appear — do not translate, modify, add, or remove any tags. Only translate the visible human-readable text content between tags.`

// Template per il messaggio utente — sovrapponibile dall'utente tramite impostazioni
export const DEFAULT_PROMPT_TEMPLATE = `Translate the following {sourceLocaleName} text to {targetLocaleName} ({targetLocale}).

{text}`

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

function buildUserMessage(
  promptTemplate: string,
  text: string,
  sourceLocale: string,
  targetLocale: string,
): string {
  return promptTemplate
    .replace('{sourceLocale}',     sourceLocale)
    .replace('{sourceLocaleName}', localeName(sourceLocale))
    .replace('{targetLocale}',     targetLocale)
    .replace('{targetLocaleName}', localeName(targetLocale))
    .replace('{text}',             text)
}

// Timeout default per le traduzioni: 120s (i modelli LLM grandi sono lenti)
// Timeout per il test di connessione: 30s
const DEFAULT_TIMEOUT_MS = 120_000
const TEST_TIMEOUT_MS    = 30_000

export async function translateText(
  config: TranslatorConfig,
  text:   string,
  targetLocale: string,
  isHtml = false,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<string> {
  if (!text.trim()) return text   // non chiamare l'LLM per testi vuoti

  if (!config.baseUrl || !config.model) {
    throw new TranslatorError('LLM not configured: baseUrl and model are required')
  }

  const userMessage = buildUserMessage(
    config.promptTemplate ?? DEFAULT_PROMPT_TEMPLATE,
    text,
    config.sourceLocale,
    targetLocale,
  )

  const systemMessage = isHtml ? SYSTEM_MESSAGE_HTML : SYSTEM_MESSAGE

  const url = config.baseUrl.replace(/\/$/, '') + '/chat/completions'

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model:       config.model,
        temperature: 0.2,        // bassa creatività = traduzioni consistenti e accurate
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user',   content: userMessage },
        ],
      }),
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new TranslatorError(`LLM request timed out after ${timeoutMs / 1000}s`)
    }
    throw new TranslatorError(`LLM request failed: ${String(err)}`, err)
  } finally {
    clearTimeout(timer)
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
  const testLocale = config.sourceLocale === 'en' ? 'it' : 'en'
  try {
    const result = await translateText(
      config,
      'Hello, this is a connection test.',
      testLocale,
      false,
      TEST_TIMEOUT_MS,
    )
    return { ok: true, message: `Connection OK — "${result}" (${localeName(config.sourceLocale)} → ${localeName(testLocale)})` }
  } catch (err) {
    return { ok: false, message: err instanceof TranslatorError ? err.message : String(err) }
  }
}
