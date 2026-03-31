import { computed } from 'vue'
import { useRoute } from 'vue-router'
import type { ChatContext } from '@/api/ai.js'

/**
 * Legge la route corrente e restituisce un ChatContext tipizzato
 * da inviare al backend insieme a ogni messaggio.
 */
export function useAiContext() {
  const route = useRoute()

  const context = computed<ChatContext | undefined>(() => {
    const name = route.name as string | undefined

    if (name === 'folio-edit' || name === 'folio-new') {
      const codex   = route.params.codex as string | undefined
      const idParam = route.params.id    as string | undefined
      if (codex) {
        return {
          type:    'folio',
          codex,
          folioId: idParam ? Number(idParam) : undefined,
        }
      }
    }

    if (name) {
      return { type: 'page', page: name }
    }

    return undefined
  })

  const contextLabel = computed<string | null>(() => {
    const ctx = context.value
    if (!ctx) return null
    if (ctx.type === 'folio') {
      return ctx.folioId
        ? `${ctx.codex} #${ctx.folioId}`
        : `Nuovo ${ctx.codex}`
    }
    if (ctx.type === 'page') return ctx.page ?? null
    return null
  })

  return { context, contextLabel }
}
