// ─── Tipi Blueprint ───────────────────────────────────────────────────────────

export type FieldType =
  | 'string' | 'number' | 'boolean' | 'richtext' | 'date' | 'select'
  | 'textarea' | 'image' | 'link' | 'slug' | 'repeater'

export interface FieldDefinition {
  name:           string
  type:           FieldType
  label?:         string
  queryable?:     boolean       // se true, scritto anche in folio_field_index
  required?:      boolean
  translatable?:  boolean       // se false, escluso da traduzione automatica (default: true)
  options?:       string[]      // solo per type: 'select'
  slugSource?:    string        // solo per type: 'slug': campo da cui derivare lo slug
  fieldOptions?:  Record<string, unknown>  // config per 'link', 'image', 'repeater'
  default?:       unknown
}

// Definisce uno stadio del ciclo di vita di un Folio.
export interface StageDefinition {
  name:     string    // identificatore (es. 'published')
  label:    string    // label UI (es. 'Pubblicato')
  initial?: boolean   // se true, stadio predefinito alla creazione
  final?:   boolean   // se true, stadio terminale (es. 'archived')
  color?:   string    // colore opzionale per la UI
}

// ─── CodexDefinition ─────────────────────────────────────────────────────────
// Il Codex definisce la struttura di una classe di Folios.
// Rimpiazza PostTypeDefinition.

export interface CodexDefinition {
  name:          string             // identificatore (snake_case), usato nelle URL e nel DB
  label:         string             // label plurale mostrata nell'admin
  icon?:         string             // nome icona PrimeIcons (opzionale)
  stages?:       StageDefinition[]  // ciclo di vita; se omesso: draft/published/trash default
  blueprint?:    FieldDefinition[]  // schema dei campi del Folio
  displayField?: string             // campo usato come "titolo" nella lista admin
  listColumns?:  string[]           // colonne visibili nella lista admin
}

// Alias backward-compat per plugin che usano ancora il vecchio nome
export type PostTypeDefinition = CodexDefinition

// ─── CodexRegistry ────────────────────────────────────────────────────────────

export class CodexRegistry {
  private readonly registry = new Map<string, CodexDefinition>()

  register(def: CodexDefinition): void {
    if (this.registry.has(def.name)) {
      throw new Error(`Codex '${def.name}' is already registered`)
    }
    this.registry.set(def.name, def)
  }

  get(name: string): CodexDefinition | undefined {
    return this.registry.get(name)
  }

  getAll(): CodexDefinition[] {
    return Array.from(this.registry.values())
  }

  exists(name: string): boolean {
    return this.registry.has(name)
  }

  /** Restituisce il nome del primo stage o 'draft' se il Codex non ha stages. */
  getDefaultStage(name: string): string {
    const def = this.registry.get(name)
    if (!def?.stages?.length) return 'draft'
    return def.stages.find(s => s.initial)?.name ?? def.stages[0]!.name
  }

  /** Tutti gli stage validi per un Codex (vuoto = accetta qualsiasi valore). */
  getValidStages(name: string): string[] {
    return this.registry.get(name)?.stages?.map(s => s.name) ?? []
  }
}

// Alias backward-compat
export { CodexRegistry as PostTypeRegistry }
