import { sql } from 'drizzle-orm'
import type { PluginContext } from '@phrasepress/core'

type Db = PluginContext['db']

// ─── PRAGMA result shapes ─────────────────────────────────────────────────────

interface TableInfoRow {
  cid:       number
  name:      string
  type:      string
  notnull:   number
  dflt_value: string | null
  pk:        number
}

interface IndexListRow {
  seq:     number
  name:    string
  unique:  number
  origin:  string
  partial: number
}

interface IndexInfoRow {
  seqno: number
  cid:   number
  name:  string
}

// ─── Public types ─────────────────────────────────────────────────────────────

export interface ColumnInfo {
  name:      string
  type:      string
  notNull:   boolean
  pk:        boolean
  indexed:   boolean
  indexName: string | null
  unique:    boolean
}

export interface IndexInfo {
  name:    string
  unique:  boolean
  columns: string[]
}

export interface TableAnalysis {
  name:             string
  columns:          ColumnInfo[]
  indexes:          IndexInfo[]
  unindexedColumns: string[]   // non-PK columns with no index (optimization hints)
}

export interface IndexAnalysisResult {
  tables: TableAnalysis[]
}

export interface DbStats {
  pageCount:    number
  pageSize:     number
  totalSizeKb:  number
  walMode:      boolean
  foreignKeys:  boolean
  tables:       Array<{ name: string; rowCount: number }>
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function listTables(db: Db): string[] {
  const rows = db.all(
    sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
  ) as { name: string }[]
  return rows.map(r => r.name)
}

function getTableInfo(db: Db, tableName: string): TableInfoRow[] {
  return db.all(sql`PRAGMA table_info(${sql.raw(tableName)})`) as TableInfoRow[]
}

function getIndexList(db: Db, tableName: string): IndexListRow[] {
  return db.all(sql`PRAGMA index_list(${sql.raw(tableName)})`) as IndexListRow[]
}

function getIndexInfo(db: Db, indexName: string): IndexInfoRow[] {
  return db.all(sql`PRAGMA index_info(${sql.raw(indexName)})`) as IndexInfoRow[]
}

// ─── Index analysis ───────────────────────────────────────────────────────────

export function analyzeIndexes(db: Db): IndexAnalysisResult {
  const tableNames = listTables(db)

  const tables: TableAnalysis[] = tableNames.map(tableName => {
    const tableInfo  = getTableInfo(db, tableName)
    const indexList  = getIndexList(db, tableName)

    // Build a map: columnName → first index that covers it (+ unique flag)
    const columnIndexMap = new Map<string, { indexName: string; unique: boolean }>()
    const indexes: IndexInfo[] = []

    for (const idx of indexList) {
      const idxCols = getIndexInfo(db, idx.name).map(r => r.name)
      indexes.push({ name: idx.name, unique: idx.unique === 1, columns: idxCols })

      // Mark the first column in the index as indexed
      for (const col of idxCols) {
        if (!columnIndexMap.has(col)) {
          columnIndexMap.set(col, { indexName: idx.name, unique: idx.unique === 1 })
        }
      }
    }

    const columns: ColumnInfo[] = tableInfo.map(col => {
      const isPk      = col.pk > 0
      const idxEntry  = columnIndexMap.get(col.name)
      const isIndexed = isPk || idxEntry != null

      return {
        name:      col.name,
        type:      col.type,
        notNull:   col.notnull === 1,
        pk:        isPk,
        indexed:   isIndexed,
        indexName: isPk ? null : (idxEntry?.indexName ?? null),
        unique:    isPk ? true : (idxEntry?.unique ?? false),
      }
    })

    const unindexedColumns = columns
      .filter(c => !c.indexed)
      .map(c => c.name)

    return { name: tableName, columns, indexes, unindexedColumns }
  })

  return { tables }
}

// ─── Table / DB stats ─────────────────────────────────────────────────────────

export function getDbStats(db: Db): DbStats {
  const pageCount  = (db.get(sql`PRAGMA page_count`) as { page_count: number }).page_count
  const pageSize   = (db.get(sql`PRAGMA page_size`) as { page_size: number }).page_size
  const walMode    = (db.get(sql`PRAGMA journal_mode`) as { journal_mode: string }).journal_mode === 'wal'
  const fkEnabled  = (db.get(sql`PRAGMA foreign_keys`) as { foreign_keys: number }).foreign_keys === 1
  const totalSizeKb = Math.round((pageCount * pageSize) / 1024)

  const tableNames = listTables(db)
  const tables = tableNames.map(name => {
    const result = db.get(sql`SELECT COUNT(*) AS cnt FROM ${sql.raw(name)}`) as { cnt: number }
    return { name, rowCount: result.cnt }
  })

  return { pageCount, pageSize, totalSizeKb, walMode, foreignKeys: fkEnabled, tables }
}
