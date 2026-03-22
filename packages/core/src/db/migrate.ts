import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { db } from './client.js'

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), 'migrations')

export function runMigrations() {
  migrate(db, { migrationsFolder })
  console.log('[db] migrations applied')
}
