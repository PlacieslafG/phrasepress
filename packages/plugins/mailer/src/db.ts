import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import type { PluginContext } from '@phrasepress/core'

type Db = PluginContext['db']

// ─── Drizzle table schemas ────────────────────────────────────────────────────

export const ppMailerConfig = sqliteTable('pp_mailer_config', {
  id:        text('id').primaryKey(),
  host:      text('host').notNull().default(''),
  port:      integer('port').notNull().default(587),
  secure:    integer('secure').notNull().default(0),
  authUser:  text('auth_user').notNull().default(''),
  authPass:  text('auth_pass').notNull().default(''),
  fromName:  text('from_name').notNull().default(''),
  fromEmail: text('from_email').notNull().default(''),
})

export const ppMailerNotifications = sqliteTable('pp_mailer_notifications', {
  id:              text('id').primaryKey(),
  formId:          text('form_id').notNull(),
  toEmail:         text('to_email').notNull(),
  subjectTemplate: text('subject_template').notNull().default('Nuova submission: {form_name}'),
  enabled:         integer('enabled').notNull().default(1),
})

export type ConfigRow       = typeof ppMailerConfig.$inferSelect
export type NotificationRow = typeof ppMailerNotifications.$inferSelect

// ─── Creazione tabelle ─────────────────────────────────────────────────────────

export function createTables(db: Db): void {
  const client = (db as unknown as { $client: { exec(sql: string): void } }).$client
  client.exec(`
    CREATE TABLE IF NOT EXISTS pp_mailer_config (
      id         TEXT PRIMARY KEY,
      host       TEXT NOT NULL DEFAULT '',
      port       INTEGER NOT NULL DEFAULT 587,
      secure     INTEGER NOT NULL DEFAULT 0,
      auth_user  TEXT NOT NULL DEFAULT '',
      auth_pass  TEXT NOT NULL DEFAULT '',
      from_name  TEXT NOT NULL DEFAULT '',
      from_email TEXT NOT NULL DEFAULT ''
    );
    INSERT OR IGNORE INTO pp_mailer_config (id) VALUES ('default');
    CREATE TABLE IF NOT EXISTS pp_mailer_notifications (
      id               TEXT PRIMARY KEY,
      form_id          TEXT NOT NULL,
      to_email         TEXT NOT NULL,
      subject_template TEXT NOT NULL DEFAULT 'Nuova submission: {form_name}',
      enabled          INTEGER NOT NULL DEFAULT 1
    );
  `)
}

// ─── Tipo settings ─────────────────────────────────────────────────────────────

export interface SmtpSettings {
  host:      string
  port:      number
  secure:    boolean
  authUser:  string
  authPass:  string
  fromName:  string
  fromEmail: string
}

// ─── Config helpers ────────────────────────────────────────────────────────────

export function dbGetSettings(db: Db): SmtpSettings {
  const row = db.select().from(ppMailerConfig).where(eq(ppMailerConfig.id, 'default')).get()
  if (!row) return { host: '', port: 587, secure: false, authUser: '', authPass: '', fromName: '', fromEmail: '' }
  return {
    host:      row.host,
    port:      row.port,
    secure:    row.secure === 1,
    authUser:  row.authUser,
    authPass:  row.authPass,
    fromName:  row.fromName,
    fromEmail: row.fromEmail,
  }
}

export function dbUpdateSettings(db: Db, s: SmtpSettings): void {
  db.update(ppMailerConfig)
    .set({
      host:      s.host,
      port:      s.port,
      secure:    s.secure ? 1 : 0,
      authUser:  s.authUser,
      authPass:  s.authPass,
      fromName:  s.fromName,
      fromEmail: s.fromEmail,
    })
    .where(eq(ppMailerConfig.id, 'default'))
    .run()
}

// ─── Notification helpers ──────────────────────────────────────────────────────

export function serializeNotification(row: NotificationRow) {
  return {
    id:              row.id,
    formId:          row.formId,
    toEmail:         row.toEmail,
    subjectTemplate: row.subjectTemplate,
    enabled:         row.enabled === 1,
  }
}

export function dbListNotifications(db: Db) {
  return db.select().from(ppMailerNotifications).all()
}

export function dbListNotificationsByFormId(db: Db, formId: string) {
  return db.select().from(ppMailerNotifications)
    .where(eq(ppMailerNotifications.formId, formId))
    .all()
}

export function dbGetNotification(db: Db, id: string) {
  return db.select().from(ppMailerNotifications).where(eq(ppMailerNotifications.id, id)).get() ?? null
}

export function dbCreateNotification(db: Db, data: {
  formId:          string
  toEmail:         string
  subjectTemplate: string
  enabled:         boolean
}) {
  const [row] = db.insert(ppMailerNotifications).values({
    id:              randomUUID(),
    formId:          data.formId,
    toEmail:         data.toEmail,
    subjectTemplate: data.subjectTemplate,
    enabled:         data.enabled ? 1 : 0,
  }).returning().all()
  return row!
}

export function dbUpdateNotification(db: Db, id: string, data: {
  formId:          string
  toEmail:         string
  subjectTemplate: string
  enabled:         boolean
}) {
  const [row] = db.update(ppMailerNotifications)
    .set({
      formId:          data.formId,
      toEmail:         data.toEmail,
      subjectTemplate: data.subjectTemplate,
      enabled:         data.enabled ? 1 : 0,
    })
    .where(eq(ppMailerNotifications.id, id))
    .returning().all()
  return row ?? null
}

export function dbDeleteNotification(db: Db, id: string) {
  db.delete(ppMailerNotifications).where(eq(ppMailerNotifications.id, id)).run()
}
