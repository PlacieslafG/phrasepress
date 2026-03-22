import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authApi } from '@/api/auth.js'

export interface User {
  id:       number
  username: string
  email:    string
  role: {
    slug:         string
    capabilities: string[]
  }
}

export const useAuthStore = defineStore('auth', () => {
  const user          = ref<User | null>(null)
  const accessToken   = ref<string | null>(null)
  const sessionRestored = ref(false)   // sopravvive all'HMR di Vite, si resetta solo sul page reload

  const isLoggedIn = computed(() => !!accessToken.value)

  function hasCapability(cap: string): boolean {
    if (!user.value) return false
    if (user.value.role.slug === 'administrator') return true
    return user.value.role.capabilities.includes(cap)
  }

  async function login(username: string, password: string): Promise<void> {
    const res = await authApi.login({ username, password })
    accessToken.value = res.accessToken
    user.value = res.user
  }

  async function logout(): Promise<void> {
    try {
      await authApi.logout()
    } catch { /* pulisci lo stato locale anche se la chiamata API fallisce */ }
    accessToken.value = null
    user.value = null
  }

  // Usata da apiFetch quando il refresh fallisce: svuota lo stato locale
  // SENZA chiamare l'API (evita loop ricorsivo logout → 401 → logout → ...)
  function clearSession(): void {
    accessToken.value = null
    user.value = null
  }

  async function refreshToken(): Promise<void> {
    const res = await authApi.refresh()
    accessToken.value = res.accessToken
  }

  async function fetchMe(): Promise<void> {
    try {
      await refreshToken()
      const me = await authApi.me()
      user.value = me
    } catch {
      accessToken.value = null
      user.value = null
    }
  }

  return { user, accessToken, isLoggedIn, sessionRestored, hasCapability, login, logout, clearSession, refreshToken, fetchMe }
})
