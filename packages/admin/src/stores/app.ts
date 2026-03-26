import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { apiFetch } from '@/api/client.js'

export interface StageDefinition {
  name:     string
  label:    string
  initial?: boolean
  final?:   boolean
  color?:   string
}

export interface FieldDefinition {
  name:          string
  type:          'string' | 'number' | 'boolean' | 'richtext' | 'date' | 'select' | 'textarea' | 'image' | 'relationship' | 'repeater' | 'slug'
  label?:        string
  queryable?:    boolean
  required?:     boolean
  options?:      string[]
  fieldOptions?: Record<string, unknown>
  slugSource?:   string
  translatable?: boolean
}

export interface CodexDefinition {
  name:         string
  label:        string
  icon?:        string
  stages?:      StageDefinition[]
  blueprint?:   FieldDefinition[]
  displayField?: string
}

/** @deprecated use CodexDefinition */
export type PostTypeDefinition = CodexDefinition

export interface VocabularyDefinition {
  slug:         string
  name:         string
  codices:      string[]
  hierarchical: boolean
  icon?:        string
}

/** @deprecated use VocabularyDefinition */
export type TaxonomyDefinition = VocabularyDefinition & { postTypes: string[] }

export interface PluginStatus {
  name:        string
  version:     string
  description: string
  active:      boolean
  activatedAt: number | null
}

export const useAppStore = defineStore('app', () => {
  const codices     = ref<CodexDefinition[]>([])
  const vocabularies = ref<VocabularyDefinition[]>([])
  const plugins      = ref<PluginStatus[]>([])
  const loaded       = ref(false)

  // Backward-compat aliases
  const postTypes  = computed(() => codices.value)
  const taxonomies = computed(() => vocabularies.value)

  async function load(): Promise<void> {
    if (loaded.value) return
    const [cxRes, vocRes, plRes] = await Promise.all([
      apiFetch<CodexDefinition[]>('/api/v1/codices'),
      apiFetch<VocabularyDefinition[]>('/api/v1/vocabularies'),
      apiFetch<PluginStatus[]>('/api/v1/plugins'),
    ])
    codices.value      = cxRes
    vocabularies.value = vocRes
    plugins.value      = plRes
    loaded.value = true
  }

  function isPluginActive(name: string): boolean {
    return plugins.value.some(p => p.name === name && p.active)
  }

  function reset(): void {
    codices.value      = []
    vocabularies.value = []
    plugins.value      = []
    loaded.value = false
  }

  return { codices, vocabularies, postTypes, taxonomies, plugins, loaded, load, isPluginActive, reset }
})
