import { eq } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { vocabularies } from '../db/schema.js'
import type { VocabularyRegistry } from './registry.js'

export function syncVocabulariesWithDb(registry: VocabularyRegistry, db: Db): void {
  for (const def of registry.getAll()) {
    const existing = db
      .select({ id: vocabularies.id })
      .from(vocabularies)
      .where(eq(vocabularies.slug, def.slug))
      .get()

    if (!existing) {
      db.insert(vocabularies).values({
        name:         def.name,
        slug:         def.slug,
        hierarchical: def.hierarchical ? 1 : 0,
      }).run()
    }
  }
  console.log('[db] vocabularies synced')
}

// Alias backward-compat
export { syncVocabulariesWithDb as syncTaxonomiesWithDb }
