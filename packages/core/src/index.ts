// Entry point pubblico del package @phrasepress/core
// Esporta tutti i tipi e funzioni necessari ai plugin e alla config utente

export { defineConfig }                 from './config.js'
export type { PhrasePressConfig }       from './config.js'
export type { PostTypeDefinition, FieldDefinition, FieldType } from './post-types/registry.js'
export type { TaxonomyDefinition }      from './taxonomies/registry.js'
export type { Plugin, PluginContext }   from './plugins/types.js'
