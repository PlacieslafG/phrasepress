import { describe, it, expect, beforeEach } from 'vitest'
import { sql } from 'drizzle-orm'
import { db } from '../../db/client.js'
import {
  createQueryLogTable,
  insertQueryLog,
  listQueryLog,
  getQueryLogStats,
  clearQueryLog,
  dbMonitorQueryLog,
} from '../../../../plugins/db-monitor/src/query-tracker.js'

beforeEach(() => {
  // Crea la tabella se non esiste e svuota tra i test
  createQueryLogTable(db)
  db.delete(dbMonitorQueryLog).run()
})

describe('createQueryLogTable', () => {
  it('è idempotente (chiamabile più volte)', () => {
    expect(() => {
      createQueryLogTable(db)
      createQueryLogTable(db)
    }).not.toThrow()
  })
})

describe('insertQueryLog', () => {
  it('inserisce una riga nel log', () => {
    insertQueryLog(db, {
      url:        '/api/v1/posts',
      method:     'GET',
      durationMs: 42,
      statusCode: 200,
      userAgent:  'TestBrowser/1.0',
      userId:     1,
    })

    const rows = db.select().from(dbMonitorQueryLog).all()
    expect(rows.length).toBe(1)
    expect(rows[0]!.url).toBe('/api/v1/posts')
    expect(rows[0]!.method).toBe('GET')
    expect(rows[0]!.durationMs).toBe(42)
    expect(rows[0]!.statusCode).toBe(200)
    expect(rows[0]!.userId).toBe(1)
  })

  it('normalizza il method in uppercase', () => {
    insertQueryLog(db, { url: '/test', method: 'get', durationMs: 10, statusCode: null, userAgent: null, userId: null })
    const row = db.select().from(dbMonitorQueryLog).get()
    expect(row!.method).toBe('GET')
  })

  it('tronca url a 500 caratteri', () => {
    const longUrl = '/api/' + 'x'.repeat(600)
    insertQueryLog(db, { url: longUrl, method: 'GET', durationMs: 5, statusCode: null, userAgent: null, userId: null })
    const row = db.select().from(dbMonitorQueryLog).get()
    expect(row!.url.length).toBe(500)
  })

  it('accetta null per campi opzionali', () => {
    expect(() => insertQueryLog(db, {
      url:        '/test',
      method:     'POST',
      durationMs: 100,
      statusCode: null,
      userAgent:  null,
      userId:     null,
    })).not.toThrow()
  })
})

describe('listQueryLog', () => {
  beforeEach(() => {
    // Inserisce 5 entry con durate diverse
    const entries = [
      { url: '/api/slow',    method: 'GET',  durationMs: 500 },
      { url: '/api/fast',    method: 'GET',  durationMs: 10 },
      { url: '/api/medium',  method: 'POST', durationMs: 150 },
      { url: '/api/medium2', method: 'GET',  durationMs: 200 },
      { url: '/api/vfast',   method: 'GET',  durationMs: 5 },
    ]
    for (const e of entries) {
      insertQueryLog(db, { ...e, statusCode: 200, userAgent: null, userId: null })
    }
  })

  it('restituisce total corretto', () => {
    const result = listQueryLog(db, 1, 50, 'newest')
    expect(result.total).toBe(5)
    expect(result.data.length).toBe(5)
  })

  it('ordinamento slowest: prima la più lenta', () => {
    const result = listQueryLog(db, 1, 50, 'slowest')
    expect(result.data[0]!.url).toBe('/api/slow')
    expect(result.data[0]!.durationMs).toBe(500)
  })

  it('ordinamento fastest: prima la più veloce', () => {
    const result = listQueryLog(db, 1, 50, 'fastest')
    expect(result.data[0]!.durationMs).toBe(5)
  })

  it('paginazione limita i risultati', () => {
    const result = listQueryLog(db, 1, 2, 'newest')
    expect(result.data.length).toBe(2)
    expect(result.total).toBe(5)
    expect(result.page).toBe(1)
    expect(result.limit).toBe(2)
  })

  it('seconda pagina restituisce i restanti', () => {
    const result = listQueryLog(db, 2, 2, 'newest')
    expect(result.data.length).toBe(2)
  })
})

describe('getQueryLogStats', () => {
  it('restituisce zeri su log vuoto', () => {
    const stats = getQueryLogStats(db)
    expect(stats.count).toBe(0)
    expect(stats.avgMs).toBe(0)
    expect(stats.p50Ms).toBe(0)
    expect(stats.p95Ms).toBe(0)
    expect(stats.maxMs).toBe(0)
    expect(stats.slowest.length).toBe(0)
  })

  it('calcola count, avgMs e maxMs correttamente', () => {
    insertQueryLog(db, { url: '/a', method: 'GET', durationMs: 100, statusCode: 200, userAgent: null, userId: null })
    insertQueryLog(db, { url: '/b', method: 'GET', durationMs: 200, statusCode: 200, userAgent: null, userId: null })
    insertQueryLog(db, { url: '/c', method: 'GET', durationMs: 300, statusCode: 200, userAgent: null, userId: null })

    const stats = getQueryLogStats(db)
    expect(stats.count).toBe(3)
    expect(stats.avgMs).toBe(200)
    expect(stats.maxMs).toBe(300)
  })

  it('slowest contiene le 10 query più lente', () => {
    for (let i = 1; i <= 15; i++) {
      insertQueryLog(db, { url: `/api/q${i}`, method: 'GET', durationMs: i * 10, statusCode: 200, userAgent: null, userId: null })
    }
    const stats = getQueryLogStats(db)
    expect(stats.slowest.length).toBe(10)
    expect(stats.slowest[0]!.durationMs).toBe(150) // la più lenta (15 * 10)
  })
})

describe('clearQueryLog', () => {
  it('elimina tutte le righe e restituisce il conteggio', () => {
    insertQueryLog(db, { url: '/x', method: 'GET', durationMs: 1, statusCode: 200, userAgent: null, userId: null })
    insertQueryLog(db, { url: '/y', method: 'GET', durationMs: 2, statusCode: 200, userAgent: null, userId: null })

    const result = clearQueryLog(db)
    expect(result.deleted).toBe(2)

    const remaining = db.select().from(dbMonitorQueryLog).all()
    expect(remaining.length).toBe(0)
  })

  it('su log vuoto restituisce deleted: 0', () => {
    const result = clearQueryLog(db)
    expect(result.deleted).toBe(0)
  })
})
