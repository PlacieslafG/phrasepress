import { eq, and, ne } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { posts } from '../db/schema.js'

export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')                        // decomponi caratteri accentati
    .replace(/[\u0300-\u036f]/g, '')         // rimuovi diacritici
    .replace(/[\s_]+/g, '-')                 // spazi e underscore → trattino (prima di rimuovere speciali)
    .replace(/[^a-z0-9-]/g, '')             // rimuovi caratteri speciali
    .replace(/-+/g, '-')                     // trattini multipli → singolo
    .replace(/^-+|-+$/g, '')                 // rimuovi trattini iniziali/finali
}

export function ensureUniqueSlug(
  db: Db,
  postType: string,
  baseSlug: string,
  excludeId?: number,
): string {
  let candidate = baseSlug
  let counter = 2

  while (true) {
    const conditions = [
      eq(posts.postType, postType),
      eq(posts.slug, candidate),
    ]
    if (excludeId !== undefined) {
      conditions.push(ne(posts.id, excludeId))
    }

    const existing = db
      .select({ id: posts.id })
      .from(posts)
      .where(and(...conditions))
      .limit(1)
      .all()

    if (existing.length === 0) return candidate

    candidate = `${baseSlug}-${counter}`
    counter++
  }
}
