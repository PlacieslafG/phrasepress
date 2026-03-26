import { eq, and, ne } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { folios, folioFieldIndex } from '../db/schema.js'

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

/**
 * Garantisce che lo slug sia unico per il Codex cercando collisioni
 * nella folio_field_index (campo 'slug'). Aggiunge suffisso numerico se necessario.
 */
export function ensureUniqueSlug(
  db: Db,
  codex: string,
  baseSlug: string,
  excludeId?: number,
): string {
  let candidate = baseSlug
  let counter = 2

  while (true) {
    const conditions = [
      eq(folios.codex, codex),
      eq(folioFieldIndex.fieldName, 'slug'),
      eq(folioFieldIndex.stringValue, candidate),
    ]

    const query = db
      .select({ id: folios.id })
      .from(folios)
      .innerJoin(folioFieldIndex, eq(folioFieldIndex.folioId, folios.id))
      .where(and(...conditions))
      .limit(1)
      .all()

    const conflict = excludeId !== undefined
      ? query.filter(r => r.id !== excludeId)
      : query

    if (conflict.length === 0) return candidate

    candidate = `${baseSlug}-${counter}`
    counter++
  }
}
