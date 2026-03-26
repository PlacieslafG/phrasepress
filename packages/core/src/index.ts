// Entry point pubblico del package @phrasepress/core
// Esporta tutti i tipi e funzioni necessari ai plugin e alla config utente

export { defineConfig }                 from './config.js'
export type { PhrasePressConfig }       from './config.js'
export type {
  CodexDefinition,
  FieldDefinition,
  FieldType,
  StageDefinition,
  PostTypeDefinition,   // alias backward-compat
} from './codices/registry.js'
export type {
  VocabularyDefinition,
  TaxonomyDefinition,   // alias backward-compat
} from './vocabularies/registry.js'
export type { Plugin, PluginContext }   from './plugins/types.js'
