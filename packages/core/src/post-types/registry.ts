export type FieldType =
  | 'string' | 'number' | 'boolean' | 'richtext' | 'date' | 'select'
  | 'textarea' | 'image' | 'relationship' | 'repeater'

export interface FieldDefinition {
  name:         string
  type:         FieldType
  label?:       string
  queryable?:   boolean     // se true, scritto anche in post_field_index
  required?:    boolean
  translatable?: boolean    // se false, non viene incluso nella traduzione automatica (default: true)
  options?:     string[]    // solo per type: 'select'
  fieldOptions?: Record<string, unknown>  // config per 'image' e 'relationship'
  default?:     unknown
}

export interface PostTypeDefinition {
  name:    string          // es. 'product'
  label:   string          // es. 'Products'
  icon?:   string          // nome icona PrimeIcons
  fields?: FieldDefinition[]
}

export class PostTypeRegistry {
  private readonly registry = new Map<string, PostTypeDefinition>()

  register(def: PostTypeDefinition): void {
    if (this.registry.has(def.name)) {
      throw new Error(`Post type '${def.name}' is already registered`)
    }
    this.registry.set(def.name, def)
  }

  get(name: string): PostTypeDefinition | undefined {
    return this.registry.get(name)
  }

  getAll(): PostTypeDefinition[] {
    return Array.from(this.registry.values())
  }

  exists(name: string): boolean {
    return this.registry.has(name)
  }
}
