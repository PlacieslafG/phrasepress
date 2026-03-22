import { describe, it, expect, beforeEach } from 'vitest'
import { generateSlug, ensureUniqueSlug } from '../../post-types/slug.js'
import { db } from '../../db/client.js'
import { posts } from '../../db/schema.js'
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
  const TEST_POST_TYPE = 'test-slug-type'

  beforeEach(() => {
    // Rimuove eventuali post residui dal post type di test
    db.delete(posts).where(eq(posts.postType, TEST_POST_TYPE)).run()
  })

  it('restituisce lo slug base se non esiste già', () => {
    const slug = ensureUniqueSlug(db, TEST_POST_TYPE, 'my-post')
    expect(slug).toBe('my-post')
  })

  it('aggiunge suffisso -2 se lo slug base è già occupato', () => {
    const now = Math.floor(Date.now() / 1000)
    db.insert(posts).values({
      postType:  TEST_POST_TYPE,
      title:     'My Post',
      slug:      'my-post',
      status:    'published',
      fields:    '{}',
      createdAt: now,
      updatedAt: now,
    }).run()

    const slug = ensureUniqueSlug(db, TEST_POST_TYPE, 'my-post')
    expect(slug).toBe('my-post-2')
  })

  it('aggiunge suffisso incrementale fino a trovarne uno libero', () => {
    const now = Math.floor(Date.now() / 1000)
    for (const s of ['my-post', 'my-post-2', 'my-post-3']) {
      db.insert(posts).values({
        postType:  TEST_POST_TYPE,
        title:     s,
        slug:      s,
        status:    'published',
        fields:    '{}',
        createdAt: now,
        updatedAt: now,
      }).run()
    }

    const slug = ensureUniqueSlug(db, TEST_POST_TYPE, 'my-post')
    expect(slug).toBe('my-post-4')
  })

  it('excludeId permette di riutilizzare lo slug del post stesso', () => {
    const now = Math.floor(Date.now() / 1000)
    const inserted = db.insert(posts).values({
      postType:  TEST_POST_TYPE,
      title:     'My Post',
      slug:      'my-post',
      status:    'published',
      fields:    '{}',
      createdAt: now,
      updatedAt: now,
    }).returning({ id: posts.id }).get()

    const slug = ensureUniqueSlug(db, TEST_POST_TYPE, 'my-post', inserted.id)
    expect(slug).toBe('my-post')
  })
})
