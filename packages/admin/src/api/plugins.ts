import { apiFetch } from './client.js'

export interface PluginStatus {
  name:        string
  version:     string
  description: string
  active:      boolean
}

const pluginsApi = {
  list(): Promise<PluginStatus[]> {
    return apiFetch<PluginStatus[]>('/api/v1/plugins')
  },

  activate(name: string): Promise<{ success: boolean; requiresRestart: boolean }> {
    return apiFetch(`/api/v1/plugins/${encodeURIComponent(name)}/activate`, {
      method: 'POST',
    })
  },

  deactivate(name: string): Promise<{ success: boolean; requiresRestart: boolean }> {
    return apiFetch(`/api/v1/plugins/${encodeURIComponent(name)}/deactivate`, {
      method: 'POST',
    })
  },
}

export { pluginsApi }
