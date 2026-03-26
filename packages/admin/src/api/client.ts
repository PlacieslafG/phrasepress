export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// Callbacks iniettati da main.ts per rompere il ciclo di import:
// client.ts → stores/auth.ts → api/auth.ts → client.ts
let _getToken: () => string | null = () => null
let _doRefresh: () => Promise<void> = async () => { throw new Error('apiFetch not initialized') }
let _clearSession: () => void = () => {}

export function initApiFetch(opts: {
  getToken: () => string | null
  doRefresh: () => Promise<void>
  clearSession: () => void
}): void {
  _getToken = opts.getToken
  _doRefresh = opts.doRefresh
  _clearSession = opts.clearSession
}

let refreshing: Promise<void> | null = null

// ─── Query tracking (opt-in, set by DbMonitorPage) ───────────────────────────

let _trackingEnabled = false

export function setQueryTracking(enabled: boolean): void {
  _trackingEnabled = enabled
}

function sendQueryLog(entry: {
  url: string; method: string; durationMs: number; statusCode: number
}): void {
  const token = _getToken()
  // Fire-and-forget, niente await — non deve rallentare le chiamate normali
  fetch('/api/v1/plugins/db-monitor/query-log', {
    method:      'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      url:        entry.url,
      method:     entry.method,
      durationMs: entry.durationMs,
      statusCode: entry.statusCode,
    }),
  }).catch(() => { /* silenzioso: il log è best-effort */ })
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = _getToken()
  const t0    = _trackingEnabled ? performance.now() : 0

  const response = await fetch(path, {
    ...options,
    credentials: 'include',  // invia il cookie refresh token
    headers: {
      ...(options.body != null && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  })

  if (response.status === 401 && path !== '/api/v1/auth/refresh') {
    // Tenta refresh una sola volta (evita loop concorrenti)
    if (!refreshing) {
      refreshing = _doRefresh().finally(() => { refreshing = null })
    }
    try {
      await refreshing
    } catch {
      // Svuota solo lo stato locale: NON chiamare auth.logout() qui perché
      // farebbe una nuova richiesta API che produrrebbe un altro 401,
      // ricominciando il loop refresh → logout → refresh → ...
      _clearSession()
      window.location.href = '/login'
      throw new ApiError(401, 'Session expired')
    }
    // Riprova con il nuovo token
    return apiFetch<T>(path, options)
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new ApiError(response.status, body.error ?? 'Request failed', body.details)
  }

  // Traccia la durata se il tracking è attivo (escluse le chiamate di auth e del monitor stesso)
  if (_trackingEnabled && t0 > 0 && !path.includes('/plugins/db-monitor/') && !path.includes('/auth/')) {
    sendQueryLog({
      url:        path,
      method:     (options.method ?? 'GET').toUpperCase(),
      durationMs: Math.round(performance.now() - t0),
      statusCode: response.status,
    })
  }

  // 204 No Content
  if (response.status === 204) return undefined as T

  return response.json() as Promise<T>
}

// Authenticated fetch that returns a Blob (for file downloads)
export async function apiFetchBlob(path: string): Promise<Blob> {
  const token = _getToken()

  const response = await fetch(path, {
    credentials: 'include',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  })

  if (response.status === 401) {
    if (!refreshing) {
      refreshing = _doRefresh().finally(() => { refreshing = null })
    }
    try {
      await refreshing
    } catch {
      _clearSession()
      window.location.href = '/login'
      throw new ApiError(401, 'Session expired')
    }
    return apiFetchBlob(path)
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new ApiError(response.status, body.error ?? 'Request failed')
  }

  return response.blob()
}
