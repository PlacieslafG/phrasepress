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

  activate(name: string): Promise<{ success: boolean; restarting: boolean }> {
    return apiFetch(`/api/v1/plugins/${encodeURIComponent(name)}/activate`, {
      method: 'POST',
    })
  },

  deactivate(name: string): Promise<{ success: boolean; restarting: boolean }> {
    return apiFetch(`/api/v1/plugins/${encodeURIComponent(name)}/deactivate`, {
      method: 'POST',
    })
  },

  /** Polling endpoint senza autenticazione — usato per rilevare quando il server è tornato su dopo il riavvio. */
  async isAlive(): Promise<boolean> {
    try {
      const res = await fetch('/api/v1/health')
      return res.ok
    } catch {
      return false
    }
  },
}

export { pluginsApi }
