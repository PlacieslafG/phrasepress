import { describe, it, expect, beforeEach } from 'vitest'
import { generateSlug, ensureUniqueSlug } from '../../codices/slug.js'
import { db } from '../../db/client.js'
import { folios, folioFieldIndex } from '../../db/schema.js'
import { eq } from 'drizzle-orm'

describe('generateSlug', () => {
  it('converte in minuscolo e spazi in trattini', () => {
    expect(generateSlug('Hello World')).toBe('hello-world')
  })

  it('rimuove i diacritici', () => {
    expect(generateSlug('Héllo Möund')).toBe('hello-mound')
  })

  it('rimuove caratteri speciali', () => {
    expect(generateSlug('Special @#$% chars!')).toBe('special-chars')
  })

  it('normalizza trattini multipli in uno', () => {
    expect(generateSlug('multiple---dashes')).toBe('multiple-dashes')
  })

  it('elimina spazi iniziali e finali', () => {
    expect(generateSlug('  trim me  ')).toBe('trim-me')
  })

  it('elimina trattini iniziali e finali', () => {
    expect(generateSlug('-start and end-')).toBe('start-and-end')
  })

  it('converte underscore in trattini', () => {
    expect(generateSlug('snake_case_title')).toBe('snake-case-title')
  })

  it('gestisce stringhe con solo caratteri speciali', () => {
    expect(generateSlug('@@@')).toBe('')
  })
})

describe('ensureUniqueSlug', () => {
  const TEST_CODEX = 'test-slug-codex'

  beforeEach(() => {
    // Rimuove folios e field index residui del codex di test
    const ids = db.select({ id: folios.id }).from(folios).where(eq(folios.codex, TEST_CODEX)).all()
    if (ids.length > 0) {
      for (const { id } of ids) {
        db.delete(folioFieldIndex).where(eq(folioFieldIndex.folioId, id)).run()
      }
    }
    db.delete(folios).where(eq(folios.codex, TEST_CODEX)).run()
  })

  it('restituisce lo slug base se non esiste già', () => {
    const slug = ensureUniqueSlug(db, TEST_CODEX, 'my-folio')
    expect(slug).toBe('my-folio')
  })

  it('aggiunge suffisso -2 se lo slug base è già occupato', () => {
    const now = Math.floor(Date.now() / 1000)
    const [inserted] = db.insert(folios).values({
      codex:     TEST_CODEX,
      stage:     'published',
      fields:    '{}',
      createdAt: now,
      updatedAt: now,
    }).returning({ id: folios.id }).all()
    db.insert(folioFieldIndex).values({
      folioId:     inserted!.id,
      fieldName:   'slug',
      stringValue: 'my-folio',
      numberValue: null,
    }).run()

    const slug = ensureUniqueSlug(db, TEST_CODEX, 'my-folio')
    expect(slug).toBe('my-folio-2')
  })

  it('aggiunge suffisso incrementale fino a trovarne uno libero', () => {
    const now = Math.floor(Date.now() / 1000)
    for (const s of ['my-folio', 'my-folio-2', 'my-folio-3']) {
      const [ins] = db.insert(folios).values({
        codex:     TEST_CODEX,
        stage:     'published',
        fields:    '{}',
        createdAt: now,
        updatedAt: now,
      }).returning({ id: folios.id }).all()
      db.insert(folioFieldIndex).values({
        folioId:     ins!.id,
        fieldName:   'slug',
        stringValue: s,
        numberValue: null,
      }).run()
    }

    const slug = ensureUniqueSlug(db, TEST_CODEX, 'my-folio')
    expect(slug).toBe('my-folio-4')
  })

  it('excludeId permette di riutilizzare lo slug del folio stesso', () => {
    const now = Math.floor(Date.now() / 1000)
    const [inserted] = db.insert(folios).values({
      codex:     TEST_CODEX,
      stage:     'published',
      fields:    '{}',
      createdAt: now,
      updatedAt: now,
    }).returning({ id: folios.id }).all()
    db.insert(folioFieldIndex).values({
      folioId:     inserted!.id,
      fieldName:   'slug',
      stringValue: 'my-folio',
      numberValue: null,
    }).run()

    const slug = ensureUniqueSlug(db, TEST_CODEX, 'my-folio', inserted!.id)
    expect(slug).toBe('my-folio')
  })
})
