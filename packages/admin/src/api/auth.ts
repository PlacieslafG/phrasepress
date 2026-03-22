import { apiFetch } from './client.js'

export interface LoginPayload {
  username: string
  password: string
}

export interface LoginResponse {
  accessToken: string
  user: {
    id: number
    username: string
    email: string
    role: { slug: string; capabilities: string[] }
  }
}

export interface MeResponse {
  id: number
  username: string
  email: string
  role: { slug: string; capabilities: string[] }
}

export const authApi = {
  login: (payload: LoginPayload) =>
    apiFetch<LoginResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  logout: () =>
    apiFetch<void>('/api/v1/auth/logout', { method: 'POST' }),

  refresh: () =>
    apiFetch<{ accessToken: string }>('/api/v1/auth/refresh', { method: 'POST' }),

  me: () =>
    apiFetch<MeResponse>('/api/v1/auth/me'),
}
