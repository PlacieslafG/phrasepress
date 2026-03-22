export interface TaxonomyDefinition {
  name:         string     // label plurale, es. 'Genres'
  slug:         string     // identificatore, es. 'genre'
  postTypes:    string[]   // post type a cui si applica
  hierarchical: boolean
  icon?:        string
}

export class TaxonomyRegistry {
  private readonly registry = new Map<string, TaxonomyDefinition>()

  register(def: TaxonomyDefinition): void {
    if (this.registry.has(def.slug)) {
      throw new Error(`Taxonomy '${def.slug}' is already registered`)
    }
    this.registry.set(def.slug, def)
  }

  get(slug: string): TaxonomyDefinition | undefined {
    return this.registry.get(slug)
  }

  getAll(): TaxonomyDefinition[] {
    return Array.from(this.registry.values())
  }

  getForPostType(postType: string): TaxonomyDefinition[] {
    return Array.from(this.registry.values()).filter(t => t.postTypes.includes(postType))
  }

  exists(slug: string): boolean {
    return this.registry.has(slug)
  }
}
