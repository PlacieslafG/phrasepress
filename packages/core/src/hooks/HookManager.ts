type ActionHandler = (...args: unknown[]) => void | Promise<void>
type FilterHandler = (value: unknown, ...args: unknown[]) => unknown | Promise<unknown>

interface HookEntry<T> {
  handler:  T
  priority: number
}

export class HookManager {
  private readonly actions = new Map<string, HookEntry<ActionHandler>[]>()
  private readonly filters = new Map<string, HookEntry<FilterHandler>[]>()

  // ─── Actions ──────────────────────────────────────────────────────────────

  addAction(hook: string, handler: ActionHandler, priority = 10): void {
    const list = this.actions.get(hook) ?? []
    list.push({ handler, priority })
    this.actions.set(hook, list)
  }

  removeAction(hook: string, handler: ActionHandler): void {
    const list = this.actions.get(hook) ?? []
    this.actions.set(hook, list.filter(e => e.handler !== handler))
  }

  async doAction(hook: string, ...args: unknown[]): Promise<void> {
    const list = this.getSorted(this.actions, hook)
    for (const { handler } of list) {
      await handler(...args)
    }
  }

  doActionSync(hook: string, ...args: unknown[]): void {
    const list = this.getSorted(this.actions, hook)
    for (const { handler } of list) {
      const result = handler(...args)
      if (result instanceof Promise) {
        throw new Error(`HookManager: async handler registered on action '${hook}' called in sync context`)
      }
    }
  }

  // ─── Filters ──────────────────────────────────────────────────────────────

  addFilter(hook: string, handler: FilterHandler, priority = 10): void {
    const list = this.filters.get(hook) ?? []
    list.push({ handler, priority })
    this.filters.set(hook, list)
  }

  removeFilter(hook: string, handler: FilterHandler): void {
    const list = this.filters.get(hook) ?? []
    this.filters.set(hook, list.filter(e => e.handler !== handler))
  }

  async applyFilters(hook: string, value: unknown, ...args: unknown[]): Promise<unknown> {
    const list = this.getSorted(this.filters, hook)
    let current = value
    for (const { handler } of list) {
      current = await handler(current, ...args)
    }
    return current
  }

  applyFiltersSync(hook: string, value: unknown, ...args: unknown[]): unknown {
    const list = this.getSorted(this.filters, hook)
    let current = value
    for (const { handler } of list) {
      const result = handler(current, ...args)
      if (result instanceof Promise) {
        throw new Error(`HookManager: async handler registered on filter '${hook}' called in sync context`)
      }
      current = result
    }
    return current
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  private getSorted<T>(map: Map<string, HookEntry<T>[]>, hook: string): HookEntry<T>[] {
    const list = map.get(hook)
    if (!list || list.length === 0) return []
    return [...list].sort((a, b) => a.priority - b.priority)
  }
}
