import { apiFetch } from './client.js'

const BASE = '/api/v1/plugins/db-monitor'

// ─── Index analysis ───────────────────────────────────────────────────────────

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
  unindexedColumns: string[]
}

export interface IndexAnalysisResult {
  tables: TableAnalysis[]
}

// ─── Table / DB stats ─────────────────────────────────────────────────────────

export interface DbStats {
  pageCount:    number
  pageSize:     number
  totalSizeKb:  number
  walMode:      boolean
  foreignKeys:  boolean
  tables:       Array<{ name: string; rowCount: number }>
}

// ─── Query log ────────────────────────────────────────────────────────────────

export interface QueryLogEntry {
  id:         number
  url:        string
  method:     string
  durationMs: number
  statusCode: number | null
  userAgent:  string | null
  userId:     number | null
  createdAt:  number
}

export interface QueryLogStats {
  count:   number
  avgMs:   number
  p50Ms:   number
  p95Ms:   number
  maxMs:   number
  slowest: Array<{ url: string; method: string; durationMs: number; createdAt: number }>
}

export interface QueryLogResponse {
  data:  QueryLogEntry[]
  stats: QueryLogStats
  total: number
  page:  number
  limit: number
}

export type QueryLogSort = 'slowest' | 'fastest' | 'newest' | 'oldest'

export interface QueryLogInput {
  url:        string
  method:     string
  durationMs: number
  statusCode?: number
}

// ─── API functions ────────────────────────────────────────────────────────────

export function getIndexes(): Promise<IndexAnalysisResult> {
  return apiFetch<IndexAnalysisResult>(`${BASE}/indexes`)
}

export function getTableStats(): Promise<DbStats> {
  return apiFetch<DbStats>(`${BASE}/table-stats`)
}

export function getQueryLog(params?: {
  page?:  number
  limit?: number
  sort?:  QueryLogSort
}): Promise<QueryLogResponse> {
  const q = new URLSearchParams()
  if (params?.page)  q.set('page',  String(params.page))
  if (params?.limit) q.set('limit', String(params.limit))
  if (params?.sort)  q.set('sort',  params.sort)
  const qs = q.toString()
  return apiFetch<QueryLogResponse>(`${BASE}/query-log${qs ? `?${qs}` : ''}`)
}

export function postQueryLog(entry: QueryLogInput): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`${BASE}/query-log`, {
    method: 'POST',
    body:   JSON.stringify(entry),
  })
}

export function clearQueryLog(): Promise<{ deleted: number }> {
  return apiFetch<{ deleted: number }>(`${BASE}/query-log`, { method: 'DELETE' })
}
