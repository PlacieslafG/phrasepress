import { apiFetch } from './client.js'

export interface FieldItem {
  id:           string
  groupId:      string
  name:         string
  label:        string
  type:         string
  required:     boolean
  queryable:    boolean
  translatable: boolean
  options:      string[]
  fieldOptions: Record<string, unknown>
  defaultValue: unknown
  sortOrder:    number
}

export interface FieldGroup {
  id:          string
  name:        string
  description: string
  postTypes:   string[]
  sortOrder:   number
  createdAt:   number
  fields:      FieldItem[]
}

export interface FieldGroupInput {
  name:         string
  description?: string
  postTypes?:   string[]
}

export interface FieldItemInput {
  name:          string
  label?:        string
  type:          string
  required?:     boolean
  queryable?:    boolean
  translatable?: boolean
  options?:      string[]
  fieldOptions?: Record<string, unknown>
  defaultValue?: unknown
}

const BASE = '/api/v1/plugins/fields'

export const listFieldGroups = () =>
  apiFetch<FieldGroup[]>(`${BASE}/groups`)

export const getFieldGroup = (id: string) =>
  apiFetch<FieldGroup>(`${BASE}/groups/${id}`)

export const createFieldGroup = (data: FieldGroupInput) =>
  apiFetch<FieldGroup>(`${BASE}/groups`, { method: 'POST', body: JSON.stringify(data) })

export const updateFieldGroup = (id: string, data: FieldGroupInput) =>
  apiFetch<FieldGroup>(`${BASE}/groups/${id}`, { method: 'PUT', body: JSON.stringify(data) })

export const deleteFieldGroup = (id: string) =>
  apiFetch<void>(`${BASE}/groups/${id}`, { method: 'DELETE' })

export const addField = (groupId: string, data: FieldItemInput) =>
  apiFetch<FieldItem>(`${BASE}/groups/${groupId}/fields`, { method: 'POST', body: JSON.stringify(data) })

export const updateField = (groupId: string, fieldId: string, data: FieldItemInput) =>
  apiFetch<FieldItem>(`${BASE}/groups/${groupId}/fields/${fieldId}`, { method: 'PUT', body: JSON.stringify(data) })

export const deleteField = (groupId: string, fieldId: string) =>
  apiFetch<void>(`${BASE}/groups/${groupId}/fields/${fieldId}`, { method: 'DELETE' })

export const reorderFields = (groupId: string, order: { id: string; order: number }[]) =>
  apiFetch<void>(`${BASE}/groups/${groupId}/reorder`, { method: 'PUT', body: JSON.stringify({ order }) })
