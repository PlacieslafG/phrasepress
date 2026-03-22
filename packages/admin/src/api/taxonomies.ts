import { apiFetch } from './client.js'

export interface TaxonomyDefinition {
  slug:         string
  name:         string
  postTypes:    string[]
  hierarchical: boolean
}

export interface Term {
  id:          number
  taxonomyId:  number
  name:        string
  slug:        string
  description: string
  parentId:    number | null
  postCount?:  number  // presente nelle list query, assente nelle risposte create/update
}

export interface TermWithChildren extends Term {
  children: TermWithChildren[]
}

export interface TermInput {
  name:        string
  slug?:       string
  description?: string
  parentId?:   number | null
}

export interface TermsFlat {
  data:  Term[]
  total: number
  page:  number
  limit: number
}

const taxonomiesApi = {
  list(): Promise<TaxonomyDefinition[]> {
    return apiFetch<TaxonomyDefinition[]>('/api/v1/taxonomies')
  },

  // Restituisce l'albero (o lista flat senza figli) per TaxonomySelector
  getTerms(taxonomySlug: string): Promise<TermWithChildren[]> {
    return apiFetch<{ data: TermWithChildren[] }>(`/api/v1/taxonomies/${taxonomySlug}/terms?hierarchical=true`)
      .then(r => r.data)
  },

  // Lista piatta paginata per TermsPage
  getTermsFlat(taxonomySlug: string, params?: { page?: number; limit?: number; search?: string }): Promise<TermsFlat> {
    const qs = new URLSearchParams()
    if (params?.page)   qs.set('page',   String(params.page))
    if (params?.limit)  qs.set('limit',  String(params.limit))
    if (params?.search) qs.set('search', params.search)
    const query = qs.toString() ? `?${qs}` : ''
    return apiFetch<TermsFlat>(`/api/v1/taxonomies/${taxonomySlug}/terms${query}`)
  },

  createTerm(taxonomySlug: string, data: TermInput): Promise<Term> {
    return apiFetch<Term>(`/api/v1/taxonomies/${taxonomySlug}/terms`, {
      method: 'POST',
      body:   JSON.stringify(data),
    })
  },

  updateTerm(taxonomySlug: string, termId: number, data: Partial<TermInput>): Promise<Term> {
    return apiFetch<Term>(`/api/v1/taxonomies/${taxonomySlug}/terms/${termId}`, {
      method: 'PUT',
      body:   JSON.stringify(data),
    })
  },

  deleteTerm(taxonomySlug: string, termId: number, reassignChildren?: number): Promise<void> {
    const qs = reassignChildren !== undefined ? `?reassignChildren=${reassignChildren}` : ''
    return apiFetch<void>(`/api/v1/taxonomies/${taxonomySlug}/terms/${termId}${qs}`, {
      method: 'DELETE',
    })
  },

  getPostTerms(postId: number): Promise<Record<string, Term[]>> {
    return apiFetch<Record<string, Term[]>>(`/api/v1/posts/${postId}/terms`)
  },

  setPostTerms(postId: number, taxonomySlug: string, termIds: number[]): Promise<void> {
    return apiFetch<void>(`/api/v1/posts/${postId}/terms/${taxonomySlug}`, {
      method: 'PUT',
      body:   JSON.stringify({ termIds }),
    })
  },
}

export { taxonomiesApi }
