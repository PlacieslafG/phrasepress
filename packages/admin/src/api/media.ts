import { apiFetch } from './client.js'

export interface MediaItem {
  id:           number
  filename:     string
  originalName: string
  mimeType:     string
  size:         number
  path:         string
  alt:          string
  caption:      string
  uploadedBy:   number | null
  createdAt:    number
}

export interface MediaList {
  data:  MediaItem[]
  total: number
  page:  number
  limit: number
}

export const mediaApi = {
  list(page = 1, limit = 20, search?: string): Promise<MediaList> {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) })
    if (search) params.set('search', search)
    return apiFetch<MediaList>(`/api/v1/plugins/media/?${params}`)
  },

  upload(file: File): Promise<MediaItem> {
    const form = new FormData()
    form.append('file', file)
    return apiFetch<MediaItem>('/api/v1/plugins/media/upload', {
      method: 'POST',
      body:   form,
    })
  },

  update(id: number, data: { alt?: string; caption?: string }): Promise<MediaItem> {
    return apiFetch<MediaItem>(`/api/v1/plugins/media/${id}`, {
      method: 'PUT',
      body:   JSON.stringify(data),
    })
  },

  delete(id: number): Promise<void> {
    return apiFetch<void>(`/api/v1/plugins/media/${id}`, { method: 'DELETE' })
  },

  fileUrl(filename: string): string {
    return `/api/v1/plugins/media/files/${encodeURIComponent(filename)}`
  },
}
