import { apiFetch } from './client.js'

export interface VocabularyDefinition {
  slug:         string
  name:         string
  codices:      string[]
  hierarchical: boolean
  icon?:        string
}

/** @deprecated use VocabularyDefinition */
export type TaxonomyDefinition = VocabularyDefinition & { postTypes: string[] }

export interface Term {
  id:           number
  vocabularyId: number
  name:         string
  slug:         string
  description:  string
  parentId:     number | null
  postCount?:   number
}

export interface TermWithChildren extends Term {
  children: TermWithChildren[]
}

export interface TermInput {
  name:         string
  slug?:        string
  description?: string
  parentId?:    number | null
}

export interface TermsFlat {
  data:  Term[]
  total: number
  page:  number
  limit: number
}

const vocabulariesApi = {
  list(): Promise<VocabularyDefinition[]> {
    return apiFetch<VocabularyDefinition[]>('/api/v1/vocabularies')
  },

  getTerms(vocabularySlug: string): Promise<TermWithChildren[]> {
    return apiFetch<{ data: TermWithChildren[] }>(`/api/v1/vocabularies/${vocabularySlug}/terms?hierarchical=true`)
      .then(r => r.data)
  },

  getTermsFlat(vocabularySlug: string, params?: { page?: number; limit?: number; search?: string }): Promise<TermsFlat> {
    const qs = new URLSearchParams()
    if (params?.page)   qs.set('page',   String(params.page))
    if (params?.limit)  qs.set('limit',  String(params.limit))
    if (params?.search) qs.set('search', params.search)
    const query = qs.toString() ? `?${qs}` : ''
    return apiFetch<TermsFlat>(`/api/v1/vocabularies/${vocabularySlug}/terms${query}`)
  },

  createTerm(vocabularySlug: string, data: TermInput): Promise<Term> {
    return apiFetch<Term>(`/api/v1/vocabularies/${vocabularySlug}/terms`, {
      method: 'POST',
      body:   JSON.stringify(data),
    })
  },

  updateTerm(vocabularySlug: string, termId: number, data: Partial<TermInput>): Promise<Term> {
    return apiFetch<Term>(`/api/v1/vocabularies/${vocabularySlug}/terms/${termId}`, {
      method: 'PUT',
      body:   JSON.stringify(data),
    })
  },

  deleteTerm(vocabularySlug: string, termId: number, reassignChildren?: number): Promise<void> {
    const qs = reassignChildren !== undefined ? `?reassignChildren=${reassignChildren}` : ''
    return apiFetch<void>(`/api/v1/vocabularies/${vocabularySlug}/terms/${termId}${qs}`, {
      method: 'DELETE',
    })
  },

  getFolioTerms(codex: string, folioId: number): Promise<Record<string, Term[]>> {
    return apiFetch<Record<string, Term[]>>(`/api/v1/${encodeURIComponent(codex)}/${folioId}/terms`)
  },

  setFolioTerms(codex: string, folioId: number, vocabularySlug: string, termIds: number[]): Promise<void> {
    return apiFetch<void>(`/api/v1/${encodeURIComponent(codex)}/${folioId}/terms/${vocabularySlug}`, {
      method: 'PUT',
      body:   JSON.stringify({ termIds }),
    })
  },
}

export { vocabulariesApi }
export { vocabulariesApi as taxonomiesApi }  // backward-compat
