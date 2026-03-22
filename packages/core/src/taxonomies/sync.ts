import { eq } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { taxonomies } from '../db/schema.js'
import type { TaxonomyRegistry } from './registry.js'

export function syncTaxonomiesWithDb(registry: TaxonomyRegistry, db: Db): void {
  for (const def of registry.getAll()) {
    const existing = db
      .select({ id: taxonomies.id })
      .from(taxonomies)
      .where(eq(taxonomies.slug, def.slug))
      .get()

    if (!existing) {
      db.insert(taxonomies).values({
        name:         def.name,
        slug:         def.slug,
        hierarchical: def.hierarchical ? 1 : 0,
      }).run()
    }
  }
  console.log('[db] taxonomies synced')
}
