import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useThemeStore = defineStore('theme', () => {
  const isDark = ref(false)

  function init() {
    isDark.value = localStorage.getItem('pp_dark') === 'true'
    applyDark()
  }

  function toggleDark() {
    isDark.value = !isDark.value
    localStorage.setItem('pp_dark', String(isDark.value))
    applyDark()
  }

  function applyDark() {
    document.documentElement.classList.toggle('dark', isDark.value)
  }

  return { isDark, init, toggleDark }
})
