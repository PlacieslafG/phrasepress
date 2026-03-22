import { apiFetch } from './client.js'

export interface FieldDefinition {
  name:          string
  type:          'string' | 'number' | 'boolean' | 'richtext' | 'date' | 'select' | 'textarea' | 'image' | 'relationship' | 'repeater'
  label?:        string
  required?:     boolean
  queryable?:    boolean
  options?:      string[]
  fieldOptions?: Record<string, unknown>
}

export interface PostTypeDefinition {
  name:   string
  label:  string
  icon?:  string
  fields: FieldDefinition[]
}

export interface TermSummary {
  termId:       number
  termName:     string
  termSlug:     string
  taxonomyId:   number
  taxonomySlug: string
  taxonomyName: string
}

export interface Post {
  id:        number
  postType:  string
  title:     string
  slug:      string
  content:   string | null
  status:    string
  fields:    Record<string, unknown>
  authorId:  number | null
  createdAt: number
  updatedAt: number
  terms:     TermSummary[]
}

export interface PostRevision {
  id:        number
  postId:    number
  title:     string
  slug:      string
  content:   string | null
  status:    string
  fields:    string
  authorId:  number | null
  createdAt: number
}

export interface PostListParams {
  type:      string
  status?:   string
  search?:   string
  page?:     number
  limit?:    number
  authorId?: number
  dateFrom?: number
  dateTo?:   number
  orderBy?:  string
  order?:    'asc' | 'desc'
  [key: string]: string | number | undefined
}

export interface PostListResponse {
  data:  Post[]
  total: number
  page:  number
  limit: number
}

export interface PostInput {
  title:    string
  content?: string
  status?:  string
  fields?:  Record<string, unknown>
  terms?:   Record<string, number[]>
}

const postsApi = {
  list(params: PostListParams): Promise<PostListResponse> {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) qs.set(k, String(v))
    }
    return apiFetch<PostListResponse>(`/api/v1/posts?${qs}`)
  },

  get(id: number): Promise<Post> {
    return apiFetch<Post>(`/api/v1/posts/${id}`)
  },

  create(data: PostInput & { postType: string }): Promise<Post> {
    return apiFetch<Post>('/api/v1/posts', {
      method: 'POST',
      body:   JSON.stringify(data),
    })
  },

  update(id: number, data: Partial<PostInput>): Promise<Post> {
    return apiFetch<Post>(`/api/v1/posts/${id}`, {
      method: 'PUT',
      body:   JSON.stringify(data),
    })
  },

  delete(id: number, force = false): Promise<void> {
    return apiFetch<void>(`/api/v1/posts/${id}${force ? '?force=true' : ''}`, {
      method: 'DELETE',
    })
  },

  getRevisions(id: number): Promise<PostRevision[]> {
    return apiFetch<PostRevision[]>(`/api/v1/posts/${id}/revisions`)
  },

  restoreRevision(postId: number, revisionId: number): Promise<Post> {
    return apiFetch<Post>(`/api/v1/posts/${postId}/revisions/${revisionId}/restore`, {
      method: 'POST',
    })
  },
}

export { postsApi }
