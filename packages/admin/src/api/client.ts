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

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = _getToken()

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

  // 204 No Content
  if (response.status === 204) return undefined as T

  return response.json() as Promise<T>
}
