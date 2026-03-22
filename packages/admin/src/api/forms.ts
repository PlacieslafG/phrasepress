import { apiFetch } from './client.js'

// ─── Tipi ─────────────────────────────────────────────────────────────────────

export type FormFieldType = 'text' | 'email' | 'textarea' | 'number' | 'select' | 'checkbox' | 'date'

export interface FormField {
  id:           string
  name:         string
  label:        string
  type:         FormFieldType
  required:     boolean
  placeholder?: string
  options?:     string[]
  sortOrder:    number
}

export interface Form {
  id:          string
  name:        string
  slug:        string
  description: string
  fields:      FormField[]
  status:      'active' | 'inactive'
  createdAt:   number
  updatedAt:   number
}

export interface FormSubmission {
  id:        string
  formId:    string
  data:      Record<string, unknown>
  ip:        string | null
  userAgent: string | null
  createdAt: number
}

export interface PaginatedSubmissions {
  data:  FormSubmission[]
  total: number
  page:  number
  limit: number
}

export type FormInput = {
  name:        string
  slug:        string
  description?: string
  fields?:     FormField[]
  status?:     'active' | 'inactive'
}

// ─── CRUD forms ───────────────────────────────────────────────────────────────

const BASE = '/api/v1/plugins/phrasepress-forms'

export function getForms(): Promise<Form[]> {
  return apiFetch<Form[]>(`${BASE}/forms`)
}

export function getForm(id: string): Promise<Form> {
  return apiFetch<Form>(`${BASE}/forms/${id}`)
}

export function createForm(data: FormInput): Promise<Form> {
  return apiFetch<Form>(`${BASE}/forms`, {
    method: 'POST',
    body:   JSON.stringify(data),
  })
}

export function updateForm(id: string, data: FormInput): Promise<Form> {
  return apiFetch<Form>(`${BASE}/forms/${id}`, {
    method: 'PUT',
    body:   JSON.stringify(data),
  })
}

export function deleteForm(id: string): Promise<void> {
  return apiFetch<void>(`${BASE}/forms/${id}`, { method: 'DELETE' })
}

// ─── Submissions ──────────────────────────────────────────────────────────────

export function getFormSubmissions(
  formId: string,
  params: { page?: number; limit?: number } = {},
): Promise<PaginatedSubmissions> {
  const qs = new URLSearchParams()
  if (params.page)  qs.set('page',  String(params.page))
  if (params.limit) qs.set('limit', String(params.limit))
  const query = qs.toString() ? `?${qs.toString()}` : ''
  return apiFetch<PaginatedSubmissions>(`${BASE}/forms/${formId}/submissions${query}`)
}

export function deleteSubmission(id: string): Promise<void> {
  return apiFetch<void>(`${BASE}/submissions/${id}`, { method: 'DELETE' })
}
