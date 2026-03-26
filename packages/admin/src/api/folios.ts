import { apiFetch } from './client.js'

export interface TermSummary {
  termId:         number
  termName:       string
  termSlug:       string
  vocabularyId:   number
  vocabularySlug: string
  vocabularyName: string
}

export interface Folio {
  id:        number
  codex:     string
  stage:     string
  fields:    Record<string, unknown>
  authorId:  number | null
  createdAt: number
  updatedAt: number
  terms:     TermSummary[]
}

export interface FolioRevision {
  id:        number
  folioId:   number
  stage:     string
  fields:    Record<string, unknown>
  authorId:  number | null
  createdAt: number
}

export interface FolioListParams {
  page?:     number
  limit?:    number
  stage?:    string
  search?:   string
  authorId?: number
  dateFrom?: number
  dateTo?:   number
  orderBy?:  string
  order?:    'asc' | 'desc'
  [key: string]: string | number | undefined
}

export interface FolioListResponse {
  data:  Folio[]
  total: number
  page:  number
  limit: number
}

export interface FolioInput {
  fields:   Record<string, unknown>
  stage?:   string
  termIds?: number[]
}

const foliosApi = {
  list(codex: string, params: FolioListParams): Promise<FolioListResponse> {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) qs.set(k, String(v))
    }
    return apiFetch<FolioListResponse>(`/api/v1/${encodeURIComponent(codex)}?${qs}`)
  },

  get(codex: string, id: number): Promise<Folio> {
    return apiFetch<Folio>(`/api/v1/${encodeURIComponent(codex)}/${id}`)
  },

  create(codex: string, data: FolioInput): Promise<Folio> {
    return apiFetch<Folio>(`/api/v1/${encodeURIComponent(codex)}`, {
      method: 'POST',
      body:   JSON.stringify(data),
    })
  },

  update(codex: string, id: number, data: Partial<FolioInput>): Promise<Folio> {
    return apiFetch<Folio>(`/api/v1/${encodeURIComponent(codex)}/${id}`, {
      method: 'PUT',
      body:   JSON.stringify(data),
    })
  },

  delete(codex: string, id: number, force = false): Promise<void> {
    return apiFetch<void>(`/api/v1/${encodeURIComponent(codex)}/${id}${force ? '?force=true' : ''}`, {
      method: 'DELETE',
    })
  },

  getRevisions(codex: string, id: number): Promise<FolioRevision[]> {
    return apiFetch<FolioRevision[]>(`/api/v1/${encodeURIComponent(codex)}/${id}/revisions`)
  },

  restoreRevision(codex: string, folioId: number, revisionId: number): Promise<Folio> {
    return apiFetch<Folio>(`/api/v1/${encodeURIComponent(codex)}/${folioId}/revisions/${revisionId}/restore`, {
      method: 'POST',
    })
  },
}

export { foliosApi }
