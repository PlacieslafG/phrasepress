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
  folioId:   number
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

export interface TranslateAllJobStatus {
  status:    'running' | 'done'
  total:     number
  completed: number
  failed:    number
  createdAt: number
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
  listTranslations(folioId: number): Promise<Translation[]> {
    return apiFetch<Translation[]>(`${BASE}/folios/${folioId}/translations`)
  },

  getTranslation(folioId: number, locale: string): Promise<Translation> {
    return apiFetch<Translation>(`${BASE}/folios/${folioId}/translations/${encodeURIComponent(locale)}`)
  },

  upsertTranslation(folioId: number, locale: string, data: TranslationInput): Promise<Translation> {
    return apiFetch<Translation>(`${BASE}/folios/${folioId}/translations/${encodeURIComponent(locale)}`, {
      method: 'PUT',
      body:   JSON.stringify(data),
    })
  },

  deleteTranslation(folioId: number, locale: string): Promise<void> {
    return apiFetch<void>(`${BASE}/folios/${folioId}/translations/${encodeURIComponent(locale)}`, {
      method: 'DELETE',
    })
  },

  // Auto-translation
  autoTranslate(folioId: number, locale: string): Promise<Translation> {
    return apiFetch<Translation>(`${BASE}/folios/${folioId}/translate/${encodeURIComponent(locale)}`, {
      method: 'POST',
    })
  },

  startTranslateAll(folioId: number): Promise<{ jobId: string; total: number }> {
    return apiFetch<{ jobId: string; total: number }>(`${BASE}/folios/${folioId}/translate-all`, {
      method: 'POST',
    })
  },

  getTranslateAllJob(jobId: string): Promise<TranslateAllJobStatus> {
    return apiFetch<TranslateAllJobStatus>(`${BASE}/jobs/${encodeURIComponent(jobId)}`)
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

  pingServer(): Promise<{ message: string }> {
    return apiFetch<{ message: string }>(`${BASE}/settings/ping`)
  },
}
