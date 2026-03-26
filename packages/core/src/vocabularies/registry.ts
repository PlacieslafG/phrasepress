// ─── VocabularyDefinition ─────────────────────────────────────────────────────
// Un Vocabulary (ex Taxonomy) è uno schema di catalogazione associabile ai Folios.

export interface VocabularyDefinition {
  name:         string     // label plurale, es. 'Genres'
  slug:         string     // identificatore, es. 'genre'
  codices:      string[]   // nomi dei Codex a cui si applica (ex postTypes)
  hierarchical: boolean
  icon?:        string
}

// Alias backward-compat per plugin esistenti
export type TaxonomyDefinition = VocabularyDefinition & { postTypes: string[] }

// ─── VocabularyRegistry ──────────────────────────────────────────────────────

export class VocabularyRegistry {
  private readonly registry = new Map<string, VocabularyDefinition>()

  register(def: VocabularyDefinition): void {
    if (this.registry.has(def.slug)) {
      throw new Error(`Vocabulary '${def.slug}' is already registered`)
    }
    this.registry.set(def.slug, def)
  }

  get(slug: string): VocabularyDefinition | undefined {
    return this.registry.get(slug)
  }

  getAll(): VocabularyDefinition[] {
    return Array.from(this.registry.values())
  }

  getForCodex(codex: string): VocabularyDefinition[] {
    return Array.from(this.registry.values()).filter(v => v.codices.includes(codex))
  }

  exists(slug: string): boolean {
    return this.registry.has(slug)
  }
}

// Alias backward-compat
export { VocabularyRegistry as TaxonomyRegistry }
