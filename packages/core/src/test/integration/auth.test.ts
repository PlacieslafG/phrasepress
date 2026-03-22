import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { createTestApp } from '../helpers.js'

let app: FastifyInstance

beforeAll(async () => { app = await createTestApp() })
afterAll(async ()  => { await app.close() })

describe('POST /api/v1/auth/login', () => {
  it('credenziali valide → 200 con accessToken e info utente', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/auth/login',
      payload: { username: 'admin', password: 'Test@Password123!' },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json<{ accessToken: string; user: { username: string; role: { slug: string } } }>()
    expect(body.accessToken).toBeTruthy()
    expect(body.user.username).toBe('admin')
    expect(body.user.role.slug).toBe('administrator')
  })

  it('imposta il cookie refreshToken httpOnly', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/auth/login',
      payload: { username: 'admin', password: 'Test@Password123!' },
    })

    const cookie = res.headers['set-cookie']
    expect(cookie).toBeTruthy()
    const cookieStr = Array.isArray(cookie) ? cookie.join('; ') : cookie
    expect(cookieStr).toContain('refreshToken=')
    expect(cookieStr).toContain('HttpOnly')
  })

  it('password errata → 401', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/auth/login',
      payload: { username: 'admin', password: 'WrongPassword!' },
    })

    expect(res.statusCode).toBe(401)
    expect(res.json<{ error: string }>().error).toBe('Invalid credentials')
  })

  it('utente inesistente → 401 (risposta generica, non rivela se esiste)', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/auth/login',
      payload: { username: 'ghost', password: 'anything' },
    })

    expect(res.statusCode).toBe(401)
    expect(res.json<{ error: string }>().error).toBe('Invalid credentials')
  })

  it('body mancante → 400', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/auth/login',
      payload: {},
    })

    expect(res.statusCode).toBe(400)
  })
})

describe('GET /api/v1/auth/me', () => {
  it('token valido → 200 con info utente', async () => {
    const loginRes = await app.inject({
      method:  'POST',
      url:     '/api/v1/auth/login',
      payload: { username: 'admin', password: 'Test@Password123!' },
    })
    const { accessToken } = loginRes.json<{ accessToken: string }>()

    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/auth/me',
      headers: { authorization: `Bearer ${accessToken}` },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json<{ username: string }>()
    expect(body.username).toBe('admin')
  })

  it('senza token → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/me' })
    expect(res.statusCode).toBe(401)
  })
})

describe('POST /api/v1/auth/logout', () => {
  it('invalida la sessione e cancella il cookie', async () => {
    const loginRes = await app.inject({
      method:  'POST',
      url:     '/api/v1/auth/login',
      payload: { username: 'admin', password: 'Test@Password123!' },
    })
    const { accessToken } = loginRes.json<{ accessToken: string }>()

    const logoutRes = await app.inject({
      method:  'POST',
      url:     '/api/v1/auth/logout',
      headers: { authorization: `Bearer ${accessToken}` },
    })

    expect(logoutRes.statusCode).toBe(200)
    const cookie = logoutRes.headers['set-cookie']
    const cookieStr = Array.isArray(cookie) ? cookie.join('; ') : (cookie ?? '')
    // Il cookie viene svuotato con maxAge=0
    expect(cookieStr).toMatch(/refreshToken=;|refreshToken=\s*;/)
  })
})

describe('POST /api/v1/auth/refresh', () => {
  it('refresh token valido nel cookie → nuovo accessToken', async () => {
    const loginRes = await app.inject({
      method:  'POST',
      url:     '/api/v1/auth/login',
      payload: { username: 'admin', password: 'Test@Password123!' },
    })
    const setCookie = loginRes.headers['set-cookie']
    const cookieStr = Array.isArray(setCookie) ? setCookie[0] : (setCookie ?? '')
    // Estrae solo il valore del cookie (senza attributi)
    const cookie = cookieStr.split(';')[0] ?? ''

    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/auth/refresh',
      headers: { cookie },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json<{ accessToken: string }>().accessToken).toBeTruthy()
  })

  it('senza cookie → 401', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh' })
    expect(res.statusCode).toBe(401)
  })
})
