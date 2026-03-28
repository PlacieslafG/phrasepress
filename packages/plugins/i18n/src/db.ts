import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { eq, and, ne, sql } from 'drizzle-orm'
import type { PluginContext } from '@phrasepress/core'

type Db = PluginContext['db']

// ─── Drizzle table schemas ────────────────────────────────────────────────────

export const ppI18nLocales = sqliteTable('pp_i18n_locales', {
  code:      text('code').primaryKey(),
  label:     text('label').notNull(),
  isDefault: integer('is_default').notNull().default(0),
  createdAt: integer('created_at').notNull(),
})

export const ppI18nTranslations = sqliteTable('pp_i18n_translations', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  folioId:   integer('post_id').notNull(),
  locale:    text('locale').notNull(),
  title:     text('title').notNull().default(''),
  slug:      text('slug').notNull().default(''),
  content:   text('content').notNull().default(''),
  fields:    text('fields').notNull().default('{}'),  // JSON blob
  status:    text('status').notNull().default('draft'),
  isDirty:   integer('is_dirty').notNull().default(0), // 1 = source post updated after this translation
  updatedAt: integer('updated_at').notNull(),
}, (t) => [
  uniqueIndex('pp_i18n_trans_post_locale_idx').on(t.folioId, t.locale),
  uniqueIndex('pp_i18n_trans_slug_locale_idx').on(t.locale, t.slug),
])

export const ppI18nConfig = sqliteTable('pp_i18n_config', {
  id:             text('id').primaryKey().default('default'),
  baseUrl:        text('base_url').notNull().default(''),
  model:          text('model').notNull().default(''),
  apiKey:         text('api_key').notNull().default(''),
  promptTemplate: text('prompt_template').notNull().default(''),
  sourceLocale:   text('source_locale').notNull().default(''),
})

export type LocaleRow      = typeof ppI18nLocales.$inferSelect
export type TranslationRow = typeof ppI18nTranslations.$inferSelect
export type ConfigRow      = typeof ppI18nConfig.$inferSelect

// ─── Creazione tabelle ────────────────────────────────────────────────────────

export function createTables(db: Db): void {
  const client = (db as unknown as { $client: { exec(sql: string): void } }).$client
  client.exec(`
    CREATE TABLE IF NOT EXISTS pp_i18n_locales (
      code       TEXT PRIMARY KEY,
      label      TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pp_i18n_translations (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id    INTEGER NOT NULL,
      locale     TEXT NOT NULL,
      title      TEXT NOT NULL DEFAULT '',
      slug       TEXT NOT NULL DEFAULT '',
      content    TEXT NOT NULL DEFAULT '',
      fields     TEXT NOT NULL DEFAULT '{}',
      status     TEXT NOT NULL DEFAULT 'draft',
      is_dirty   INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      UNIQUE(post_id, locale)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS pp_i18n_trans_slug_locale_idx
      ON pp_i18n_translations(locale, slug)
      WHERE slug != '';

    CREATE TABLE IF NOT EXISTS pp_i18n_config (
      id              TEXT PRIMARY KEY DEFAULT 'default',
      base_url        TEXT NOT NULL DEFAULT '',
      model           TEXT NOT NULL DEFAULT '',
      api_key         TEXT NOT NULL DEFAULT '',
      prompt_template TEXT NOT NULL DEFAULT '',
      source_locale   TEXT NOT NULL DEFAULT ''
    );

    INSERT OR IGNORE INTO pp_i18n_config(id) VALUES('default');
  `)
}

// ─── Serializzazione ──────────────────────────────────────────────────────────

export function serializeLocale(row: LocaleRow) {
  return {
    code:      row.code,
    label:     row.label,
    isDefault: row.isDefault === 1,
    createdAt: row.createdAt,
  }
}

export function serializeTranslation(row: TranslationRow) {
  return {
    id:        row.id,
    folioId:   row.folioId,
    locale:    row.locale,
    title:     row.title,
    slug:      row.slug,
    content:   row.content,
    fields:    JSON.parse(row.fields) as Record<string, unknown>,
    status:    row.status,
    isDirty:   row.isDirty === 1,
    updatedAt: row.updatedAt,
  }
}

export function serializeConfig(row: ConfigRow) {
  return {
    baseUrl:        row.baseUrl,
    model:          row.model,
    hasApiKey:      row.apiKey.length > 0,
    promptTemplate: row.promptTemplate,
    sourceLocale:   row.sourceLocale,
  }
}

// ─── Locale queries ───────────────────────────────────────────────────────────

export function dbListLocales(db: Db): LocaleRow[] {
  return db.select().from(ppI18nLocales).all()
}

export function dbGetLocale(db: Db, code: string): LocaleRow | undefined {
  return db.select().from(ppI18nLocales).where(eq(ppI18nLocales.code, code)).get()
}

export function dbCreateLocale(db: Db, data: { code: string; label: string; isDefault?: boolean }): LocaleRow {
  const now = Math.floor(Date.now() / 1000)
  if (data.isDefault) {
    // Rimuovi il flag default dagli altri
    db.update(ppI18nLocales).set({ isDefault: 0 }).run()
  }
  db.insert(ppI18nLocales).values({
    code:      data.code,
    label:     data.label,
    isDefault: data.isDefault ? 1 : 0,
    createdAt: now,
  }).run()
  return db.select().from(ppI18nLocales).where(eq(ppI18nLocales.code, data.code)).get()!
}

export function dbUpdateLocale(db: Db, code: string, data: { label?: string; isDefault?: boolean }): LocaleRow | undefined {
  if (data.isDefault) {
    db.update(ppI18nLocales).set({ isDefault: 0 }).run()
  }
  const updates: Partial<LocaleRow> = {}
  if (data.label    !== undefined) updates.label     = data.label
  if (data.isDefault !== undefined) updates.isDefault = data.isDefault ? 1 : 0
  if (Object.keys(updates).length > 0) {
    db.update(ppI18nLocales).set(updates).where(eq(ppI18nLocales.code, code)).run()
  }
  return db.select().from(ppI18nLocales).where(eq(ppI18nLocales.code, code)).get()
}

export function dbDeleteLocale(db: Db, code: string): void {
  // Elimina anche tutte le traduzioni in questa lingua
  db.delete(ppI18nTranslations).where(eq(ppI18nTranslations.locale, code)).run()
  db.delete(ppI18nLocales).where(eq(ppI18nLocales.code, code)).run()
}

// ─── Translation queries ──────────────────────────────────────────────────────

export function dbListTranslations(db: Db, folioId: number): TranslationRow[] {
  return db.select().from(ppI18nTranslations)
    .where(eq(ppI18nTranslations.folioId, folioId))
    .all()
}

export function dbGetTranslation(db: Db, folioId: number, locale: string): TranslationRow | undefined {
  return db.select().from(ppI18nTranslations)
    .where(and(eq(ppI18nTranslations.folioId, folioId), eq(ppI18nTranslations.locale, locale)))
    .get()
}

export function dbUpsertTranslation(db: Db, data: {
  folioId:  number
  locale:   string
  title:    string
  slug:     string
  content:  string
  fields:   Record<string, unknown>
  status:   string
  isDirty?: boolean
}): TranslationRow {
  const now = Math.floor(Date.now() / 1000)
  const existing = dbGetTranslation(db, data.folioId, data.locale)

  const values = {
    folioId:   data.folioId,
    locale:    data.locale,
    title:     data.title,
    slug:      data.slug,
    content:   data.content,
    fields:    JSON.stringify(data.fields),
    status:    data.status,
    isDirty:   (data.isDirty ?? false) ? 1 : 0,
    updatedAt: now,
  }

  if (existing) {
    db.update(ppI18nTranslations)
      .set(values)
      .where(and(eq(ppI18nTranslations.folioId, data.folioId), eq(ppI18nTranslations.locale, data.locale)))
      .run()
  } else {
    db.insert(ppI18nTranslations).values(values).run()
  }

  return db.select().from(ppI18nTranslations)
    .where(and(eq(ppI18nTranslations.folioId, data.folioId), eq(ppI18nTranslations.locale, data.locale)))
    .get()!
}

export function dbDeleteTranslation(db: Db, folioId: number, locale: string): void {
  db.delete(ppI18nTranslations)
    .where(and(eq(ppI18nTranslations.folioId, folioId), eq(ppI18nTranslations.locale, locale)))
    .run()
}

export function dbDeleteAllTranslations(db: Db, folioId: number): void {
  db.delete(ppI18nTranslations).where(eq(ppI18nTranslations.folioId, folioId)).run()
}

// Marca tutte le traduzioni di un post come "dirty" (sorgente cambiata)
export function dbMarkTranslationsDirty(db: Db, folioId: number): void {
  db.update(ppI18nTranslations)
    .set({ isDirty: 1 })
    .where(eq(ppI18nTranslations.folioId, folioId))
    .run()
}

// ─── Config queries ───────────────────────────────────────────────────────────

export function dbGetConfig(db: Db): ConfigRow {
  return db.select().from(ppI18nConfig).where(eq(ppI18nConfig.id, 'default')).get()!
}

export function dbUpsertConfig(db: Db, data: {
  baseUrl?:        string
  model?:          string
  apiKey?:         string
  promptTemplate?: string
  sourceLocale?:   string
}): ConfigRow {
  const updates: Partial<ConfigRow> = {}
  if (data.baseUrl        !== undefined) updates.baseUrl        = data.baseUrl
  if (data.model          !== undefined) updates.model          = data.model
  if (data.apiKey         !== undefined) updates.apiKey         = data.apiKey
  if (data.promptTemplate !== undefined) updates.promptTemplate = data.promptTemplate
  if (data.sourceLocale   !== undefined) updates.sourceLocale   = data.sourceLocale

  db.update(ppI18nConfig).set(updates).where(eq(ppI18nConfig.id, 'default')).run()
  return dbGetConfig(db)
}

// ─── Slug uniqueness per translation ─────────────────────────────────────────

export function ensureUniqueTranslationSlug(db: Db, locale: string, baseSlug: string, excludeId?: number): string {
  let candidate = baseSlug
  let counter   = 2

  while (true) {
    const conditions = [
      eq(ppI18nTranslations.locale, locale),
      eq(ppI18nTranslations.slug, candidate),
    ]
    if (excludeId !== undefined) {
      conditions.push(ne(ppI18nTranslations.id, excludeId))
    }

    const existing = db.select({ id: sql<number>`id` })
      .from(ppI18nTranslations)
      .where(and(...conditions))
      .limit(1)
      .all()

    if (existing.length === 0) return candidate

    candidate = `${baseSlug}-${counter}`
    counter++
  }
}
