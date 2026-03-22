import { describe, it, expect, vi } from 'vitest'
import { HookManager } from '../../hooks/HookManager.js'

describe('HookManager — Actions', () => {
  it('esegue un handler registrato', async () => {
    const hooks = new HookManager()
    const calls: string[] = []

    hooks.addAction('test.action', () => { calls.push('a') })
    await hooks.doAction('test.action')

    expect(calls).toEqual(['a'])
  })

  it('non fa niente se non ci sono handler', async () => {
    const hooks = new HookManager()
    await expect(hooks.doAction('no.handlers')).resolves.toBeUndefined()
  })

  it('esegue gli handler in ordine di priorità crescente', async () => {
    const hooks = new HookManager()
    const calls: number[] = []

    hooks.addAction('prio', () => { calls.push(20) }, 20)
    hooks.addAction('prio', () => { calls.push(5)  }, 5)
    hooks.addAction('prio', () => { calls.push(10) }, 10)

    await hooks.doAction('prio')

    expect(calls).toEqual([5, 10, 20])
  })

  it('rimuove un handler specifico', async () => {
    const hooks = new HookManager()
    const calls: string[] = []

    const handler = () => { calls.push('to-remove') }
    hooks.addAction('remove.test', handler)
    hooks.addAction('remove.test', () => { calls.push('keep') })
    hooks.removeAction('remove.test', handler)

    await hooks.doAction('remove.test')

    expect(calls).toEqual(['keep'])
  })

  it('gestisce handler asincroni in sequenza', async () => {
    const hooks = new HookManager()
    const order: number[] = []

    hooks.addAction('async.action', async () => {
      await new Promise(r => setTimeout(r, 10))
      order.push(1)
    }, 1)
    hooks.addAction('async.action', async () => {
      order.push(2)
    }, 2)

    await hooks.doAction('async.action')

    expect(order).toEqual([1, 2])
  })

  it('doActionSync lancia se un handler è async', () => {
    const hooks = new HookManager()
    hooks.addAction('sync.broken', async () => { /* async! */ })

    expect(() => hooks.doActionSync('sync.broken')).toThrow(
      /async handler registered on action 'sync\.broken'/,
    )
  })

  it('doActionSync funziona con handler sincroni', () => {
    const hooks = new HookManager()
    const calls: string[] = []
    hooks.addAction('sync.ok', () => { calls.push('ok') })
    hooks.doActionSync('sync.ok')
    expect(calls).toEqual(['ok'])
  })
})

describe('HookManager — Filters', () => {
  it('restituisce il valore invariato se non ci sono handler', async () => {
    const hooks = new HookManager()
    const result = await hooks.applyFilters('no.filter', 42)
    expect(result).toBe(42)
  })

  it('trasforma il valore attraverso la catena di handler', async () => {
    const hooks = new HookManager()

    hooks.addFilter('double', (v) => (v as number) * 2)
    hooks.addFilter('double', (v) => (v as number) + 1)

    const result = await hooks.applyFilters('double', 3)

    // 3 * 2 = 6, poi 6 + 1 = 7
    expect(result).toBe(7)
  })

  it('rispetta la priorità nei filtri', async () => {
    const hooks = new HookManager()

    hooks.addFilter('order', (v) => `${v as string}-B`, 20)
    hooks.addFilter('order', (v) => `${v as string}-A`, 10)

    const result = await hooks.applyFilters('order', 'start')

    expect(result).toBe('start-A-B')
  })

  it('rimuove un filter handler', async () => {
    const hooks = new HookManager()

    const handler = (v: unknown) => (v as number) * 100
    hooks.addFilter('removable', handler)
    hooks.addFilter('removable', (v) => (v as number) + 1)
    hooks.removeFilter('removable', handler)

    const result = await hooks.applyFilters('removable', 5)

    expect(result).toBe(6)
  })

  it('applyFiltersSync lancia se un handler è async', () => {
    const hooks = new HookManager()
    hooks.addFilter('sync.bad', async (v) => v)

    expect(() => hooks.applyFiltersSync('sync.bad', 'x')).toThrow(
      /async handler registered on filter 'sync\.bad'/,
    )
  })

  it('applyFiltersSync funziona con handler sincroni', () => {
    const hooks = new HookManager()
    hooks.addFilter('sync.filter', (v) => (v as number) + 10)
    const result = hooks.applyFiltersSync('sync.filter', 5)
    expect(result).toBe(15)
  })
})
