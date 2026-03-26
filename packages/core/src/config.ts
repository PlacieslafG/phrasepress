import type { CodexDefinition } from './codices/registry.js'
import type { VocabularyDefinition } from './vocabularies/registry.js'
import type { Plugin } from './plugins/types.js'

export interface PhrasePressConfig {
  codices:      CodexDefinition[]
  vocabularies: VocabularyDefinition[]
  plugins:      Plugin[]
}

export function defineConfig(config: Partial<PhrasePressConfig>): PhrasePressConfig {
  return {
    codices:      config.codices      ?? [],
    vocabularies: config.vocabularies ?? [],
    plugins:      config.plugins      ?? [],
  }
}
