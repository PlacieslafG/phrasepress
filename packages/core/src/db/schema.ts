import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core'

// ─── users ────────────────────────────────────────────────────────────────────

export const roles = sqliteTable('roles', {
  id:           integer('id').primaryKey({ autoIncrement: true }),
  name:         text('name').notNull(),
  slug:         text('slug').notNull().unique(),
  capabilities: text('capabilities').notNull().default('[]'),  // JSON string[]
})

export const users = sqliteTable('users', {
  id:           integer('id').primaryKey({ autoIncrement: true }),
  username:     text('username').notNull().unique(),
  email:        text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  roleId:       integer('role_id').references(() => roles.id),
  createdAt:    integer('created_at').notNull(),
})

// ─── folios ───────────────────────────────────────────────────────────────────
// Un Folio è l'istanza di un Codex (es. un articolo, un prodotto, un contatto).
// Nessun campo predefinito oltre all'identità e i timestamp: tutti i dati
// sono nel blob JSON `fields`, con la struttura definita dal Blueprint del Codex.

export const folios = sqliteTable('folios', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  codex:     text('codex').notNull(),                        // nome del Codex (ex postType)
  stage:     text('stage').notNull().default('draft'),       // stato del ciclo di vita (ex status)
  fields:    text('fields').notNull().default('{}'),         // JSON blob: title, slug, content, custom…
  authorId:  integer('author_id').references(() => users.id),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (t) => ({
  codexStageIdx: index('folios_codex_stage_idx').on(t.codex, t.stage),
  codexCreatedAtIdx: index('folios_codex_created_at_idx').on(t.codex, t.createdAt),
}))

// Indice queryable dei campi dichiarati con queryable:true nel Blueprint.
// Pattern DELETE+INSERT ad ogni update del Folio.
export const folioFieldIndex = sqliteTable('folio_field_index', {
  id:          integer('id').primaryKey({ autoIncrement: true }),
  folioId:     integer('folio_id').notNull().references(() => folios.id, { onDelete: 'cascade' }),
  fieldName:   text('field_name').notNull(),
  stringValue: text('string_value'),
  numberValue: real('number_value'),
}, (t) => [
  index('ffi_folio_id_idx').on(t.folioId),
  index('ffi_field_string_idx').on(t.fieldName, t.stringValue),
  index('ffi_field_number_idx').on(t.fieldName, t.numberValue),
])

// Snapshot immutabile creato PRIMA di ogni aggiornamento di un Folio.
export const folioRevisions = sqliteTable('folio_revisions', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  folioId:   integer('folio_id').notNull().references(() => folios.id, { onDelete: 'cascade' }),
  stage:     text('stage').notNull(),
  fields:    text('fields').notNull(),   // JSON snapshot completo dei fields al momento della revisione
  authorId:  integer('author_id').references(() => users.id),
  createdAt: integer('created_at').notNull(),
}, (t) => [
  index('folio_revisions_folio_id_idx').on(t.folioId),
])

// Relazioni tipizzate tra Folios, con integrità referenziale e indici.
// Rimpiazza il tipo di campo 'relationship' nel blob JSON.
export const folioLinks = sqliteTable('folio_links', {
  id:          integer('id').primaryKey({ autoIncrement: true }),
  fromFolioId: integer('from_folio_id').notNull().references(() => folios.id, { onDelete: 'cascade' }),
  fromField:   text('from_field').notNull(),   // nome del campo Link nel Blueprint
  toFolioId:   integer('to_folio_id').notNull().references(() => folios.id, { onDelete: 'cascade' }),
  toCodex:     text('to_codex').notNull(),     // denormalizzato per query senza JOIN su folios
  sortOrder:   integer('sort_order').notNull().default(0),
}, (t) => [
  index('fl_from_folio_field_idx').on(t.fromFolioId, t.fromField),
  index('fl_to_folio_idx').on(t.toFolioId),
])

// ─── vocabularies ─────────────────────────────────────────────────────────────
// I Vocabularies (ex taxonomies) sono schemi di catalogazione associabili ai Folios.

export const vocabularies = sqliteTable('vocabularies', {
  id:           integer('id').primaryKey({ autoIncrement: true }),
  name:         text('name').notNull(),
  slug:         text('slug').notNull().unique(),
  hierarchical: integer('hierarchical').notNull().default(0), // 0 | 1
})

export const terms = sqliteTable('terms', {
  id:           integer('id').primaryKey({ autoIncrement: true }),
  vocabularyId: integer('vocabulary_id').notNull().references(() => vocabularies.id, { onDelete: 'cascade' }),
  name:         text('name').notNull(),
  slug:         text('slug').notNull(),
  description:  text('description').notNull().default(''),
  parentId:     integer('parent_id').references((): AnySQLiteColumn => terms.id),
}, (t) => [
  uniqueIndex('terms_vocabulary_slug_idx').on(t.vocabularyId, t.slug),
])

export const folioTerms = sqliteTable('folio_terms', {
  folioId: integer('folio_id').notNull().references(() => folios.id, { onDelete: 'cascade' }),
  termId:  integer('term_id').notNull().references(() => terms.id, { onDelete: 'cascade' }),
}, (t) => [
  primaryKey({ columns: [t.folioId, t.termId] }),
])

// ─── plugins ─────────────────────────────────────────────────────────────────

export const pluginStatus = sqliteTable('plugin_status', {
  id:          integer('id').primaryKey({ autoIncrement: true }),
  pluginName:  text('plugin_name').notNull().unique(),
  active:      integer('active').notNull().default(0),
  activatedAt: integer('activated_at'),
})

// ─── auth ─────────────────────────────────────────────────────────────────────

export const refreshTokens = sqliteTable('refresh_tokens', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  userId:    integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: integer('expires_at').notNull(),
  createdAt: integer('created_at').notNull(),
}, (t) => [
  index('refresh_tokens_user_id_idx').on(t.userId),
])
