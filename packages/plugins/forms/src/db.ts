import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { eq, desc, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import type { PluginContext } from '@phrasepress/core'

type Db = PluginContext['db']

// ─── Tipi ────────────────────────────────────────────────────────────────────

export type FormFieldType = 'text' | 'email' | 'textarea' | 'number' | 'select' | 'checkbox' | 'date'

export interface FormField {
  id:           string
  name:         string         // identificatore (snake_case, usato come chiave nel submission data)
  label:        string         // etichetta visibile all'utente
  type:         FormFieldType
  required:     boolean
  placeholder?: string
  options?:     string[]       // solo per type === 'select'
  sortOrder:    number
}

// ─── Drizzle table schemas ────────────────────────────────────────────────────

export const ppForms = sqliteTable('pp_forms', {
  id:          text('id').primaryKey(),
  name:        text('name').notNull(),
  slug:        text('slug').notNull().unique(),
  description: text('description').notNull().default(''),
  fields:      text('fields').notNull().default('[]'),   // JSON FormField[]
  status:      text('status').notNull().default('active'), // 'active' | 'inactive'
  createdAt:   integer('created_at').notNull(),
  updatedAt:   integer('updated_at').notNull(),
})

export const ppFormSubmissions = sqliteTable('pp_form_submissions', {
  id:        text('id').primaryKey(),
  formId:    text('form_id').notNull(),
  data:      text('data').notNull(),           // JSON { [fieldName]: value }
  ip:        text('ip'),
  userAgent: text('user_agent'),
  createdAt: integer('created_at').notNull(),
})

export type FormRow            = typeof ppForms.$inferSelect
export type FormSubmissionRow  = typeof ppFormSubmissions.$inferSelect

// ─── Creazione tabelle ────────────────────────────────────────────────────────

export function createTables(db: Db): void {
  const client = (db as unknown as { $client: { exec(sql: string): void } }).$client
  client.exec(`
    CREATE TABLE IF NOT EXISTS pp_forms (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      slug        TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      fields      TEXT NOT NULL DEFAULT '[]',
      status      TEXT NOT NULL DEFAULT 'active',
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pp_form_submissions (
      id         TEXT PRIMARY KEY,
      form_id    TEXT NOT NULL,
      data       TEXT NOT NULL,
      ip         TEXT,
      user_agent TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pp_form_submissions_form_id
      ON pp_form_submissions(form_id);
  `)
}

// ─── Serializzazione ──────────────────────────────────────────────────────────

export function serializeForm(row: FormRow) {
  return {
    id:          row.id,
    name:        row.name,
    slug:        row.slug,
    description: row.description,
    fields:      JSON.parse(row.fields) as FormField[],
    status:      row.status as 'active' | 'inactive',
    createdAt:   row.createdAt,
    updatedAt:   row.updatedAt,
  }
}

export function serializeSubmission(row: FormSubmissionRow) {
  return {
    id:        row.id,
    formId:    row.formId,
    data:      JSON.parse(row.data) as Record<string, unknown>,
    ip:        row.ip,
    userAgent: row.userAgent,
    createdAt: row.createdAt,
  }
}

// ─── Form helpers ─────────────────────────────────────────────────────────────

export function dbListForms(db: Db) {
  return db.select().from(ppForms).orderBy(desc(ppForms.createdAt)).all()
}

export function dbGetForm(db: Db, id: string) {
  return db.select().from(ppForms).where(eq(ppForms.id, id)).get() ?? null
}

export function dbGetFormBySlug(db: Db, slug: string) {
  return db.select().from(ppForms).where(eq(ppForms.slug, slug)).get() ?? null
}

export function dbCreateForm(db: Db, data: {
  name:        string
  slug:        string
  description: string
  fields:      FormField[]
  status:      'active' | 'inactive'
}) {
  const now = Math.floor(Date.now() / 1000)
  const [row] = db.insert(ppForms).values({
    id:          randomUUID(),
    name:        data.name,
    slug:        data.slug,
    description: data.description,
    fields:      JSON.stringify(data.fields),
    status:      data.status,
    createdAt:   now,
    updatedAt:   now,
  }).returning().all()
  return row!
}

export function dbUpdateForm(db: Db, id: string, data: {
  name:        string
  slug:        string
  description: string
  fields:      FormField[]
  status:      'active' | 'inactive'
}) {
  const [row] = db.update(ppForms)
    .set({
      name:        data.name,
      slug:        data.slug,
      description: data.description,
      fields:      JSON.stringify(data.fields),
      status:      data.status,
      updatedAt:   Math.floor(Date.now() / 1000),
    })
    .where(eq(ppForms.id, id))
    .returning().all()
  return row ?? null
}

export function dbDeleteForm(db: Db, id: string) {
  db.delete(ppFormSubmissions).where(eq(ppFormSubmissions.formId, id)).run()
  db.delete(ppForms).where(eq(ppForms.id, id)).run()
}

// ─── Submission helpers ───────────────────────────────────────────────────────

export function dbListSubmissions(db: Db, formId: string, page: number, limit: number) {
  const offset = (page - 1) * limit
  const rows   = db.select().from(ppFormSubmissions)
    .where(eq(ppFormSubmissions.formId, formId))
    .orderBy(desc(ppFormSubmissions.createdAt))
    .limit(limit)
    .offset(offset)
    .all()
  const total  = (db.select({ count: sql<number>`count(*)` })
    .from(ppFormSubmissions)
    .where(eq(ppFormSubmissions.formId, formId))
    .get()?.count) ?? 0
  return { rows, total }
}

export function dbGetSubmission(db: Db, id: string) {
  return db.select().from(ppFormSubmissions).where(eq(ppFormSubmissions.id, id)).get() ?? null
}

export function dbCreateSubmission(db: Db, data: {
  formId:    string
  data:      Record<string, unknown>
  ip:        string | null
  userAgent: string | null
}) {
  const [row] = db.insert(ppFormSubmissions).values({
    id:        randomUUID(),
    formId:    data.formId,
    data:      JSON.stringify(data.data),
    ip:        data.ip,
    userAgent: data.userAgent,
    createdAt: Math.floor(Date.now() / 1000),
  }).returning().all()
  return row!
}

export function dbDeleteSubmission(db: Db, id: string) {
  db.delete(ppFormSubmissions).where(eq(ppFormSubmissions.id, id)).run()
}
