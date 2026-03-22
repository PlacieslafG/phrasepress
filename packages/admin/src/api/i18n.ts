import { apiFetch } from './client.js'

const BASE = '/api/v1/plugins/phrasepress-i18n'

// ─── Tipi ────────────────────────────────────────────────────────────────────

export interface Locale {
  code:      string
  label:     string
  isDefault: boolean
  createdAt: number
}

export interface Translation {
  id:        number
  postId:    number
  locale:    string
  title:     string
  slug:      string
  content:   string
  fields:    Record<string, unknown>
  status:    string
  isDirty:   boolean
  updatedAt: number
}

export interface I18nConfig {
  baseUrl:        string
  model:          string
  hasApiKey:      boolean
  promptTemplate: string
  sourceLocale:   string
}

export interface TranslationInput {
  title:    string
  slug?:    string
  content?: string
  fields?:  Record<string, unknown>
  status?:  string
}

export interface AutoTranslateAllResult {
  locale:       string
  ok:           boolean
  translation?: Translation
  error?:       string
}

// ─── API client ───────────────────────────────────────────────────────────────

export const i18nApi = {
  // Locales
  listLocales(): Promise<Locale[]> {
    return apiFetch<Locale[]>(`${BASE}/locales`)
  },

  createLocale(data: { code: string; label: string; isDefault?: boolean }): Promise<Locale> {
    return apiFetch<Locale>(`${BASE}/locales`, { method: 'POST', body: JSON.stringify(data) })
  },

  updateLocale(code: string, data: { label?: string; isDefault?: boolean }): Promise<Locale> {
    return apiFetch<Locale>(`${BASE}/locales/${encodeURIComponent(code)}`, {
      method: 'PATCH',
      body:   JSON.stringify(data),
    })
  },

  deleteLocale(code: string): Promise<void> {
    return apiFetch<void>(`${BASE}/locales/${encodeURIComponent(code)}`, { method: 'DELETE' })
  },

  // Translations
  listTranslations(postId: number): Promise<Translation[]> {
    return apiFetch<Translation[]>(`${BASE}/posts/${postId}/translations`)
  },

  getTranslation(postId: number, locale: string): Promise<Translation> {
    return apiFetch<Translation>(`${BASE}/posts/${postId}/translations/${encodeURIComponent(locale)}`)
  },

  upsertTranslation(postId: number, locale: string, data: TranslationInput): Promise<Translation> {
    return apiFetch<Translation>(`${BASE}/posts/${postId}/translations/${encodeURIComponent(locale)}`, {
      method: 'PUT',
      body:   JSON.stringify(data),
    })
  },

  deleteTranslation(postId: number, locale: string): Promise<void> {
    return apiFetch<void>(`${BASE}/posts/${postId}/translations/${encodeURIComponent(locale)}`, {
      method: 'DELETE',
    })
  },

  // Auto-translation
  autoTranslate(postId: number, locale: string): Promise<Translation> {
    return apiFetch<Translation>(`${BASE}/posts/${postId}/translate/${encodeURIComponent(locale)}`, {
      method: 'POST',
    })
  },

  autoTranslateAll(postId: number): Promise<AutoTranslateAllResult[]> {
    return apiFetch<AutoTranslateAllResult[]>(`${BASE}/posts/${postId}/translate-all`, {
      method: 'POST',
    })
  },

  // Settings
  getSettings(): Promise<I18nConfig> {
    return apiFetch<I18nConfig>(`${BASE}/settings`)
  },

  updateSettings(data: Partial<Omit<I18nConfig, 'hasApiKey'>> & { apiKey?: string }): Promise<I18nConfig> {
    return apiFetch<I18nConfig>(`${BASE}/settings`, { method: 'PUT', body: JSON.stringify(data) })
  },

  testConnection(): Promise<{ message: string }> {
    return apiFetch<{ message: string }>(`${BASE}/settings/test`, { method: 'POST' })
  },
}
