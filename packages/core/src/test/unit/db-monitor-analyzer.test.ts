import { describe, it, expect, beforeEach } from 'vitest'
import { sql } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { analyzeIndexes, getDbStats } from '../../../../plugins/db-monitor/src/analyzer.js'

describe('analyzeIndexes', () => {
  it('restituisce un elenco non vuoto di tabelle', () => {
    const result = analyzeIndexes(db)
    expect(result.tables.length).toBeGreaterThan(0)
  })

  it('ogni tabella contiene name, columns, indexes, unindexedColumns', () => {
    const { tables } = analyzeIndexes(db)
    for (const table of tables) {
      expect(table).toHaveProperty('name')
      expect(table).toHaveProperty('columns')
      expect(table).toHaveProperty('indexes')
      expect(table).toHaveProperty('unindexedColumns')
      expect(Array.isArray(table.columns)).toBe(true)
      expect(Array.isArray(table.indexes)).toBe(true)
      expect(Array.isArray(table.unindexedColumns)).toBe(true)
    }
  })

  it('la tabella folios ha colonne con indici (codex+stage)', () => {
    const { tables } = analyzeIndexes(db)
    const foliosTable = tables.find(t => t.name === 'folios')
    expect(foliosTable).toBeDefined()
    expect(foliosTable!.indexes.length).toBeGreaterThan(0)
  })

  it('le colonne PK sono marcate come indexed=true', () => {
    const { tables } = analyzeIndexes(db)
    for (const table of tables) {
      const pkCols = table.columns.filter(c => c.pk)
      for (const col of pkCols) {
        expect(col.indexed).toBe(true)
      }
    }
  })

  it('unindexedColumns non contiene colonne PK o già indicizzate', () => {
    const { tables } = analyzeIndexes(db)
    for (const table of tables) {
      const indexedNames = new Set(table.columns.filter(c => c.indexed).map(c => c.name))
      for (const colName of table.unindexedColumns) {
        expect(indexedNames.has(colName)).toBe(false)
      }
    }
  })

  it('non include tabelle interne SQLite (sqlite_*)', () => {
    const { tables } = analyzeIndexes(db)
    const internal = tables.filter(t => t.name.startsWith('sqlite_'))
    expect(internal.length).toBe(0)
  })
})

describe('getDbStats', () => {
  it('restituisce pageCount, pageSize e totalSizeKb > 0', () => {
    const stats = getDbStats(db)
    expect(stats.pageCount).toBeGreaterThan(0)
    expect(stats.pageSize).toBeGreaterThan(0)
    expect(stats.totalSizeKb).toBeGreaterThan(0)
  })

  it('restituisce walMode come booleano (false su :memory: perché WAL richiede file fisico)', () => {
    const stats = getDbStats(db)
    // In-memory SQLite non supporta WAL. Il campo esiste ed è booleano.
    expect(typeof stats.walMode).toBe('boolean')
  })

  it('restituisce foreignKeys true', () => {
    const stats = getDbStats(db)
    expect(stats.foreignKeys).toBe(true)
  })

  it('elenca tutte le tabelle con il rowCount', () => {
    const stats = getDbStats(db)
    expect(Array.isArray(stats.tables)).toBe(true)
    expect(stats.tables.length).toBeGreaterThan(0)
    for (const t of stats.tables) {
      expect(t).toHaveProperty('name')
      expect(t).toHaveProperty('rowCount')
      expect(typeof t.rowCount).toBe('number')
    }
  })

  it('la tabella users ha almeno 1 riga (utente admin seedato)', () => {
    const stats = getDbStats(db)
    const usersTable = stats.tables.find(t => t.name === 'users')
    expect(usersTable).toBeDefined()
    expect(usersTable!.rowCount).toBeGreaterThanOrEqual(1)
  })
})
