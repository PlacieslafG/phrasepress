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
// Il test usa 60s: genera pochi token, se ci vuole di più il motore è in coda/bloccato
const DEFAULT_TIMEOUT_MS = 120_000
const TEST_TIMEOUT_MS    = 60_000

// Rimuove i src base64 dalle immagini prima di mandare l'HTML all'LLM.
// Le immagini non si traducono: inviare blob base64 gonfia il prompt inutilmente
// e può bloccare il modello o causare timeout.
function stripBase64Images(html: string): string {
  return html.replace(/(<img\b[^>]*?\bsrc=["'])data:[^"']*?(["'][^>]*?>)/gi, '$1$2')
}

// Estrae i tag <img> dall'HTML e li sostituisce con placeholder [PP_IMG_N].
// Impedisce all'LLM di perdere le immagini durante la traduzione.
// I src base64 vengono rimossi per non gonfiare l'array images.
function extractImages(html: string): { html: string; images: string[] } {
  const images: string[] = []
  const result = html.replace(/<img\b[^>]*>/gi, (match) => {
    const cleaned = match.replace(/(\bsrc=["'])data:[^"']*(["])/gi, '$1$2')
    images.push(cleaned)
    return `[PP_IMG_${images.length - 1}]`
  })
  return { html: result, images }
}

function restoreImages(html: string, images: string[]): string {
  return html.replace(/\[PP_IMG_(\d+)\]/gi, (_, idx) => images[Number(idx)] ?? '')
}

export async function translateText(
  config: TranslatorConfig,
  text:   string,
  targetLocale: string,
  isHtml = false,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxTokens?: number,
): Promise<string> {
  if (!text.trim()) return text   // non chiamare l'LLM per testi vuoti

  const { html: processedText, images: extractedImages } = isHtml
    ? extractImages(text)
    : { html: text, images: [] as string[] }

  if (!config.baseUrl || !config.model) {
    throw new TranslatorError('LLM not configured: baseUrl and model are required')
  }

  const userMessage = buildUserMessage(
    config.promptTemplate ?? DEFAULT_PROMPT_TEMPLATE,
    processedText,
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

  function buildBody(withThinkingKwargs: boolean) {
    return JSON.stringify({
      model:       config.model,
      temperature: 0.2,
      // chat_template_kwargs è specifico di llama.cpp + Qwen3: disabilita il thinking mode.
      // Non è supportato da cloud API (Groq, OpenAI, ecc.): verrà escluso al retry se 400.
      ...(withThinkingKwargs ? { chat_template_kwargs: { enable_thinking: false } } : {}),
      ...(maxTokens !== undefined ? { max_tokens: maxTokens } : {}),
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user',   content: userMessage },
      ],
    })
  }

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: buildBody(true),
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new TranslatorError(`LLM request timed out after ${timeoutMs / 1000}s`)
    }
    throw new TranslatorError(`LLM request failed: ${String(err)}`, err)
  } finally {
    clearTimeout(timer)
  }

  // Alcuni server (Groq, OpenAI) non supportano chat_template_kwargs: riprova senza
  if (response.status === 400) {
    const errBody = await response.text().catch(() => '')
    if (errBody.includes('chat_template_kwargs')) {
      const controller2 = new AbortController()
      const timer2 = setTimeout(() => controller2.abort(), timeoutMs)
      try {
        response = await fetch(url, {
          method: 'POST',
          headers,
          signal: controller2.signal,
          body: buildBody(false),
        })
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          throw new TranslatorError(`LLM request timed out after ${timeoutMs / 1000}s`)
        }
        throw new TranslatorError(`LLM request failed: ${String(err)}`, err)
      } finally {
        clearTimeout(timer2)
      }
    } else {
      throw new TranslatorError(`LLM returned HTTP 400: ${errBody}`)
    }
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

  return extractedImages.length > 0
    ? restoreImages(content.trim(), extractedImages)
    : content.trim()
}

// Traduce un set di campi — traduce i tipi testuali, gestisce i repeater ricorsivamente
export async function translateFields(
  config: TranslatorConfig,
  fields: Record<string, unknown>,
  fieldDefs: Array<{ name: string; type: string; translatable?: boolean; fieldOptions?: Record<string, unknown> }>,
  targetLocale: string,
): Promise<Record<string, unknown>> {
  const TRANSLATABLE_TYPES = new Set(['string', 'textarea', 'richtext'])
  const result: Record<string, unknown> = { ...fields }

  for (const def of fieldDefs) {
    // Salta esplicitamente i campi marcati translatable: false
    if (def.translatable === false) continue

    if (def.type === 'repeater') {
      const subFieldDefs = (def.fieldOptions?.subFields as Array<{ name: string; type: string }> | undefined) ?? []
      const rows = (fields[def.name] as Record<string, unknown>[] | undefined) ?? []
      result[def.name] = await Promise.all(rows.map(async row => {
        const translatedRow: Record<string, unknown> = { ...row }
        for (const sf of subFieldDefs) {
          if (!TRANSLATABLE_TYPES.has(sf.type)) continue
          const val = row[sf.name]
          if (typeof val !== 'string' || !val.trim()) continue
          translatedRow[sf.name] = await translateText(config, val, targetLocale, sf.type === 'richtext')
        }
        return translatedRow
      }))
      continue
    }
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

// Ping rapido: chiama GET /models senza fare inferenza.
// Risponde in pochi ms anche se il modello è occupato con richieste in coda.
// Utile per distinguere "server down" da "server occupato".
export async function pingServer(config: TranslatorConfig): Promise<{ ok: boolean; message: string }> {
  if (!config.baseUrl) {
    return { ok: false, message: 'baseUrl non configurato' }
  }

  const url = config.baseUrl.replace(/\/$/, '') + '/models'
  const headers: Record<string, string> = {}
  if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5_000)

  try {
    const res = await fetch(url, { method: 'GET', headers, signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) {
      return { ok: false, message: `HTTP ${res.status} — server raggiungibile ma ha risposto con errore` }
    }
    interface ModelsResponse { data?: Array<{ id: string }> }
    const body = await res.json() as ModelsResponse
    const models = body.data?.map(m => m.id) ?? []
    const preview = models.slice(0, 3).join(', ') || '(nessun modello elencato)'
    return { ok: true, message: `Server raggiungibile — modelli: ${preview}` }
  } catch (err) {
    clearTimeout(timer)
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, message: 'Ping scaduto dopo 5s — server non raggiungibile o firewall' }
    }
    return { ok: false, message: `Ping fallito: ${String(err)}` }
  }
}

// Verifica che il server LLM sia raggiungibile inviando una traduzione di test
export async function testConnection(config: TranslatorConfig): Promise<{ ok: boolean; message: string }> {
  const testLocale = config.sourceLocale === 'en' ? 'it' : 'en'
  try {
    const result = await translateText(
      config,
      'Hello.',
      testLocale,
      false,
      TEST_TIMEOUT_MS,
      30,   // max_tokens: la risposta è breve, forziamo il limite per tornare subito
    )
    return { ok: true, message: `Connection OK — "${result}" (${localeName(config.sourceLocale)} → ${localeName(testLocale)})` }
  } catch (err) {
    return { ok: false, message: err instanceof TranslatorError ? err.message : String(err) }
  }
}
