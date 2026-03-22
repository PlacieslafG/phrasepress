import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import * as schema from './schema.js'

function createDb() {
  const dbPath = process.env['DATABASE_PATH']
  if (!dbPath) throw new Error('DATABASE_PATH env variable is required')

  // Crea la directory se non esiste
  mkdirSync(dirname(dbPath), { recursive: true })

  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  return drizzle(sqlite, { schema })
}

export const db = createDb()
export type Db = typeof db
// Tipo compatibile sia con db che con il callback di db.transaction()
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
