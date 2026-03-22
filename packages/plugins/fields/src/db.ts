import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import type { PluginContext } from '@phrasepress/core'

type Db = PluginContext['db']

// ─── Drizzle table schemas ────────────────────────────────────────────────────

export const ppFieldGroups = sqliteTable('pp_field_groups', {
  id:          text('id').primaryKey(),
  name:        text('name').notNull(),
  description: text('description').notNull().default(''),
  postTypes:   text('post_types').notNull().default('[]'),   // JSON string[]
  sortOrder:   integer('sort_order').notNull().default(0),
  createdAt:   integer('created_at').notNull(),
})

export const ppFieldItems = sqliteTable('pp_field_items', {
  id:           text('id').primaryKey(),
  groupId:      text('group_id').notNull(),
  name:         text('name').notNull(),
  label:        text('label').notNull().default(''),
  type:         text('type').notNull(),
  required:     integer('required').notNull().default(0),
  queryable:    integer('queryable').notNull().default(0),
  options:      text('options').notNull().default('[]'),        // JSON string[] for 'select'
  fieldOptions: text('field_options').notNull().default('{}'),  // JSON config for 'image'/'relationship'
  defaultValue: text('default_value'),                          // JSON-encoded or null
  sortOrder:    integer('sort_order').notNull().default(0),
})

export type FieldGroupRow = typeof ppFieldGroups.$inferSelect
export type FieldItemRow  = typeof ppFieldItems.$inferSelect

// ─── Table creation ───────────────────────────────────────────────────────────

export function createTables(db: Db): void {
  const client = (db as unknown as { $client: { exec(sql: string): void } }).$client
  client.exec(`
    CREATE TABLE IF NOT EXISTS pp_field_groups (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      post_types  TEXT NOT NULL DEFAULT '[]',
      sort_order  INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pp_field_items (
      id            TEXT PRIMARY KEY,
      group_id      TEXT NOT NULL,
      name          TEXT NOT NULL,
      label         TEXT NOT NULL DEFAULT '',
      type          TEXT NOT NULL,
      required      INTEGER NOT NULL DEFAULT 0,
      queryable     INTEGER NOT NULL DEFAULT 0,
      options       TEXT NOT NULL DEFAULT '[]',
      field_options TEXT NOT NULL DEFAULT '{}',
      default_value TEXT,
      sort_order    INTEGER NOT NULL DEFAULT 0
    );
  `)
}

// ─── Group helpers ────────────────────────────────────────────────────────────

export function dbListGroups(db: Db) {
  return db.select().from(ppFieldGroups).orderBy(ppFieldGroups.sortOrder).all()
}

export function dbGetGroup(db: Db, id: string) {
  return db.select().from(ppFieldGroups).where(eq(ppFieldGroups.id, id)).get() ?? null
}

export function dbCreateGroup(db: Db, data: { name: string; description: string; postTypes: string[] }) {
  const [row] = db.insert(ppFieldGroups).values({
    id:          randomUUID(),
    name:        data.name,
    description: data.description,
    postTypes:   JSON.stringify(data.postTypes),
    createdAt:   Math.floor(Date.now() / 1000),
  }).returning().all()
  return row!
}

export function dbUpdateGroup(db: Db, id: string, data: { name: string; description: string; postTypes: string[] }) {
  const [row] = db.update(ppFieldGroups)
    .set({ name: data.name, description: data.description, postTypes: JSON.stringify(data.postTypes) })
    .where(eq(ppFieldGroups.id, id))
    .returning().all()
  return row ?? null
}

export function dbDeleteGroup(db: Db, id: string) {
  db.delete(ppFieldItems).where(eq(ppFieldItems.groupId, id)).run()
  db.delete(ppFieldGroups).where(eq(ppFieldGroups.id, id)).run()
}

// ─── Field item helpers ───────────────────────────────────────────────────────

export function dbListItems(db: Db, groupId: string) {
  return db.select().from(ppFieldItems)
    .where(eq(ppFieldItems.groupId, groupId))
    .orderBy(ppFieldItems.sortOrder)
    .all()
}

export function dbGetItem(db: Db, id: string) {
  return db.select().from(ppFieldItems).where(eq(ppFieldItems.id, id)).get() ?? null
}

export interface FieldItemInput {
  name:          string
  label?:        string
  type:          string
  required?:     boolean
  queryable?:    boolean
  options?:      string[]
  fieldOptions?: Record<string, unknown>
  defaultValue?: unknown
}

export function dbCreateItem(db: Db, groupId: string, data: FieldItemInput): FieldItemRow {
  const existing = dbListItems(db, groupId)
  const [row] = db.insert(ppFieldItems).values({
    id:           randomUUID(),
    groupId,
    name:         data.name,
    label:        data.label ?? '',
    type:         data.type,
    required:     data.required ? 1 : 0,
    queryable:    data.queryable ? 1 : 0,
    options:      JSON.stringify(data.options ?? []),
    fieldOptions: JSON.stringify(data.fieldOptions ?? {}),
    defaultValue: data.defaultValue != null ? JSON.stringify(data.defaultValue) : null,
    sortOrder:    existing.length,
  }).returning().all()
  return row!
}

export function dbUpdateItem(db: Db, id: string, data: FieldItemInput): FieldItemRow | null {
  const [row] = db.update(ppFieldItems).set({
    name:         data.name,
    label:        data.label ?? '',
    type:         data.type,
    required:     data.required ? 1 : 0,
    queryable:    data.queryable ? 1 : 0,
    options:      JSON.stringify(data.options ?? []),
    fieldOptions: JSON.stringify(data.fieldOptions ?? {}),
    defaultValue: data.defaultValue != null ? JSON.stringify(data.defaultValue) : null,
  }).where(eq(ppFieldItems.id, id)).returning().all()
  return row ?? null
}

export function dbDeleteItem(db: Db, id: string) {
  db.delete(ppFieldItems).where(eq(ppFieldItems.id, id)).run()
}

export function dbReorderItems(db: Db, order: { id: string; order: number }[]) {
  for (const { id, order: sortOrder } of order) {
    db.update(ppFieldItems).set({ sortOrder }).where(eq(ppFieldItems.id, id)).run()
  }
}
