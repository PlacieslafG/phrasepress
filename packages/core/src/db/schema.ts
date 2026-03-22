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

// ─── posts ────────────────────────────────────────────────────────────────────

export const posts = sqliteTable('posts', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  postType:  text('post_type').notNull(),
  title:     text('title').notNull(),
  slug:      text('slug').notNull(),
  content:   text('content').notNull().default(''),
  fields:    text('fields').notNull().default('{}'),   // JSON blob custom fields
  status:    text('status').notNull().default('draft'),
  authorId:  integer('author_id').references(() => users.id),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (t) => [
  uniqueIndex('posts_post_type_slug_idx').on(t.postType, t.slug),
])

export const postFieldIndex = sqliteTable('post_field_index', {
  id:          integer('id').primaryKey({ autoIncrement: true }),
  postId:      integer('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  fieldName:   text('field_name').notNull(),
  stringValue: text('string_value'),
  numberValue: real('number_value'),
}, (t) => [
  index('pfi_post_id_idx').on(t.postId),
  index('pfi_field_string_idx').on(t.fieldName, t.stringValue),
  index('pfi_field_number_idx').on(t.fieldName, t.numberValue),
])

export const postRevisions = sqliteTable('post_revisions', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  postId:    integer('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  title:     text('title').notNull(),
  slug:      text('slug').notNull(),
  content:   text('content').notNull(),
  fields:    text('fields').notNull(),
  status:    text('status').notNull(),
  authorId:  integer('author_id').references(() => users.id),
  createdAt: integer('created_at').notNull(),
}, (t) => [
  index('post_revisions_post_id_idx').on(t.postId),
])

// ─── taxonomies ───────────────────────────────────────────────────────────────

export const taxonomies = sqliteTable('taxonomies', {
  id:           integer('id').primaryKey({ autoIncrement: true }),
  name:         text('name').notNull(),
  slug:         text('slug').notNull().unique(),
  hierarchical: integer('hierarchical').notNull().default(0), // 0 | 1
})

export const terms = sqliteTable('terms', {
  id:          integer('id').primaryKey({ autoIncrement: true }),
  taxonomyId:  integer('taxonomy_id').notNull().references(() => taxonomies.id, { onDelete: 'cascade' }),
  name:        text('name').notNull(),
  slug:        text('slug').notNull(),
  description: text('description').notNull().default(''),
  parentId:    integer('parent_id').references((): AnySQLiteColumn => terms.id),
}, (t) => [
  uniqueIndex('terms_taxonomy_slug_idx').on(t.taxonomyId, t.slug),
])

export const postTerms = sqliteTable('post_terms', {
  postId: integer('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  termId: integer('term_id').notNull().references(() => terms.id, { onDelete: 'cascade' }),
}, (t) => [
  primaryKey({ columns: [t.postId, t.termId] }),
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
