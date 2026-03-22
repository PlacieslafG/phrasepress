import { apiFetch } from './client.js'

export interface Role {
  id:           number
  slug:         string
  name:         string
  capabilities: string[]
}

export interface UserListItem {
  id:        number
  username:  string
  email:     string
  role:      { slug: string; name: string }
  createdAt: number
}

export interface UserDetail extends UserListItem {
  bio: string | null
}

export interface UserInput {
  username?:  string
  email?:     string
  password?:  string
  roleSlug?:  string
  bio?:       string
}

const usersApi = {
  list(): Promise<UserListItem[]> {
    return apiFetch<UserListItem[]>('/api/v1/users')
  },

  get(id: number): Promise<UserDetail> {
    return apiFetch<UserDetail>(`/api/v1/users/${id}`)
  },

  create(data: Required<Pick<UserInput, 'username' | 'email' | 'password'>> & UserInput): Promise<UserDetail> {
    return apiFetch<UserDetail>('/api/v1/users', {
      method: 'POST',
      body:   JSON.stringify(data),
    })
  },

  update(id: number, data: UserInput): Promise<UserDetail> {
    return apiFetch<UserDetail>(`/api/v1/users/${id}`, {
      method: 'PUT',
      body:   JSON.stringify(data),
    })
  },

  delete(id: number): Promise<void> {
    return apiFetch<void>(`/api/v1/users/${id}`, { method: 'DELETE' })
  },
}

const rolesApi = {
  list(): Promise<Role[]> {
    return apiFetch<Role[]>('/api/v1/roles')
  },

  get(id: number): Promise<Role> {
    return apiFetch<Role>(`/api/v1/roles/${id}`)
  },

  create(data: { name: string; slug: string; capabilities: string[] }): Promise<Role> {
    return apiFetch<Role>('/api/v1/roles', {
      method: 'POST',
      body:   JSON.stringify(data),
    })
  },

  update(id: number, data: { name?: string; capabilities?: string[] }): Promise<Role> {
    return apiFetch<Role>(`/api/v1/roles/${id}`, {
      method: 'PUT',
      body:   JSON.stringify(data),
    })
  },

  delete(id: number): Promise<void> {
    return apiFetch<void>(`/api/v1/roles/${id}`, { method: 'DELETE' })
  },
}

export { usersApi, rolesApi }
