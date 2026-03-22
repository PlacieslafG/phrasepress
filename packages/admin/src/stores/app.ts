import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiFetch } from '@/api/client.js'

export interface PostTypeDefinition {
  name:   string
  label:  string
  icon?:  string
  fields?: FieldDefinition[]
}

export interface FieldDefinition {
  name:          string
  type:          'string' | 'number' | 'boolean' | 'richtext' | 'date' | 'select' | 'textarea' | 'image' | 'relationship' | 'repeater'
  label?:        string
  queryable?:    boolean
  required?:     boolean
  options?:      string[]
  fieldOptions?: Record<string, unknown>
}

export interface TaxonomyDefinition {
  slug:         string
  name:         string
  postTypes:    string[]
  hierarchical: boolean
  icon?:        string
}

export interface PluginStatus {
  name:        string
  version:     string
  description: string
  active:      boolean
  activatedAt: number | null
}

export const useAppStore = defineStore('app', () => {
  const postTypes  = ref<PostTypeDefinition[]>([])
  const taxonomies = ref<TaxonomyDefinition[]>([])
  const plugins    = ref<PluginStatus[]>([])
  const loaded     = ref(false)

  async function load(): Promise<void> {
    if (loaded.value) return
    const [ptRes, txRes, plRes] = await Promise.all([
      apiFetch<PostTypeDefinition[]>('/api/v1/post-types'),
      apiFetch<TaxonomyDefinition[]>('/api/v1/taxonomies'),
      apiFetch<PluginStatus[]>('/api/v1/plugins'),
    ])
    postTypes.value  = ptRes
    taxonomies.value = txRes
    plugins.value    = plRes
    loaded.value = true
  }

  function isPluginActive(name: string): boolean {
    return plugins.value.some(p => p.name === name && p.active)
  }

  function reset(): void {
    postTypes.value  = []
    taxonomies.value = []
    plugins.value    = []
    loaded.value = false
  }

  return { postTypes, taxonomies, plugins, loaded, load, isPluginActive, reset }
})
