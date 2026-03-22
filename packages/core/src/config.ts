import type { PostTypeDefinition } from './post-types/registry.js'
import type { TaxonomyDefinition } from './taxonomies/registry.js'
import type { Plugin } from './plugins/types.js'

export interface PhrasePressConfig {
  postTypes:  PostTypeDefinition[]
  taxonomies: TaxonomyDefinition[]
  plugins:    Plugin[]
}

export function defineConfig(config: Partial<PhrasePressConfig>): PhrasePressConfig {
  return {
    postTypes:  config.postTypes  ?? [],
    taxonomies: config.taxonomies ?? [],
    plugins:    config.plugins    ?? [],
  }
}
