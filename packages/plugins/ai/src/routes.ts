import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { PluginContext } from '@phrasepress/core'
import {
  dbGetSettings, dbUpdateSettings,
  dbCreateConversation, dbListConversations,
  dbGetConversation, dbDeleteConversation,
  dbAddMessage, dbListMessages,
  dbUpdateConversationTitle,
  type AiProvider,
} from './db.js'
import { createProvider } from './providers/factory.js'
import { buildToolContext } from './tools/index.js'
import { runAgent } from './agent.js'
import type { ChatMessage } from './providers/types.js'

// ─── Schema body ────────────────────────────────────────────────────────────────

const chatBodySchema = {
  type: 'object',
  required: ['message'],
  properties: {
    message:        { type: 'string', minLength: 1 },
    conversationId: { type: 'number' },
    context: {
      type: 'object',
      properties: {
        type:   { type: 'string' },
        codex:  { type: 'string' },
        folioId: { type: 'number' },
        page:   { type: 'string' },
      },
    },
  },
}

const settingsBodySchema = {
  type: 'object',
  properties: {
    provider:     { type: 'string', enum: ['openai', 'anthropic', 'ollama'] },
    model:        { type: 'string' },
    apiKey:       { type: 'string' },
    baseUrl:      { type: 'string' },
    systemPrompt: { type: 'string' },
    allowedPaths: { type: 'array', items: { type: 'string' } },
  },
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function registerAiRoutes(app: FastifyInstance, ctx: PluginContext): Promise<void> {
  const auth      = [ctx.fastify.authenticate]
  const adminAuth = [ctx.fastify.authenticate, ctx.fastify.requireCapability('manage_plugins')]

  // ── GET /settings ──────────────────────────────────────────────────────────
  app.get('/settings', { preHandler: adminAuth }, async () => {
    const s = dbGetSettings(ctx.db)
    return {
      provider:     s.provider,
      model:        s.model,
      hasApiKey:    s.apiKey !== '',
      baseUrl:      s.baseUrl,
      systemPrompt: s.systemPrompt,
      allowedPaths: s.allowedPaths,
    }
  })

  // ── PUT /settings ──────────────────────────────────────────────────────────
  app.put<{ Body: {
    provider?:     AiProvider
    model?:        string
    apiKey?:       string
    baseUrl?:      string
    systemPrompt?: string
    allowedPaths?: string[]
  } }>('/settings', {
    preHandler: adminAuth,
    schema:     { body: settingsBodySchema },
  }, async (req) => {
    const current = dbGetSettings(ctx.db)
    dbUpdateSettings(ctx.db, {
      provider:     req.body.provider     ?? current.provider,
      model:        req.body.model        ?? current.model,
      // Non sovrascrivere la chiave se non è stata passata o è vuota
      apiKey:       (req.body.apiKey !== undefined && req.body.apiKey !== '')
                      ? req.body.apiKey
                      : current.apiKey,
      baseUrl:      req.body.baseUrl      ?? current.baseUrl,
      systemPrompt: req.body.systemPrompt ?? current.systemPrompt,
      allowedPaths: req.body.allowedPaths ?? current.allowedPaths,
    })
    const updated = dbGetSettings(ctx.db)
    return { provider: updated.provider, model: updated.model, hasApiKey: updated.apiKey !== '', baseUrl: updated.baseUrl, systemPrompt: updated.systemPrompt, allowedPaths: updated.allowedPaths }
  })

  // ── GET /conversations ─────────────────────────────────────────────────────
  app.get('/conversations', { preHandler: auth }, async (req) => {
    return dbListConversations(ctx.db, req.userId)
  })

  // ── GET /conversations/:id ─────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/conversations/:id', { preHandler: auth }, async (req, reply) => {
    const conv = dbGetConversation(ctx.db, Number(req.params.id), req.userId)
    if (!conv) return reply.code(404).send({ error: 'Conversazione non trovata' })
    const messages = dbListMessages(ctx.db, conv.id)
    return { ...conv, messages }
  })

  // ── DELETE /conversations/:id ──────────────────────────────────────────────
  app.delete<{ Params: { id: string } }>('/conversations/:id', { preHandler: auth }, async (req, reply) => {
    const conv = dbGetConversation(ctx.db, Number(req.params.id), req.userId)
    if (!conv) return reply.code(404).send({ error: 'Conversazione non trovata' })
    dbDeleteConversation(ctx.db, conv.id, req.userId)
    return { success: true }
  })

  // ── POST /chat — SSE stream ────────────────────────────────────────────────
  app.post<{ Body: {
    message:        string
    conversationId?: number
    context?: {
      type?:    string
      codex?:   string
      folioId?: number
      page?:    string
    }
  } }>('/chat', {
    preHandler: auth,
    schema:     { body: chatBodySchema },
  }, async (req, reply) => {
    const settings = dbGetSettings(ctx.db)

    if (!settings.apiKey && settings.provider !== 'ollama') {
      reply.code(400).send({ error: 'API key non configurata. Vai in AI Settings.' })
      return
    }

    // Recupera o crea conversazione
    let convId = req.body.conversationId
    if (!convId) {
      const conv = dbCreateConversation(ctx.db, {
        userId:         req.userId,
        contextCodex:   req.body.context?.codex ?? null,
        contextFolioId: req.body.context?.folioId ?? null,
      })
      convId = conv.id
    } else {
      // Verifica appartenenza
      const existing = dbGetConversation(ctx.db, convId, req.userId)
      if (!existing) {
        reply.code(404).send({ error: 'Conversazione non trovata' })
        return
      }
    }

    // Salva messaggio utente
    dbAddMessage(ctx.db, { conversationId: convId, role: 'user', content: req.body.message })

    // Carica history messaggi precedenti
    const history = dbListMessages(ctx.db, convId)

    // Costruisce array ChatMessage per il provider
    // Il contesto viene unito al system prompt in un unico messaggio system,
    // perché molti modelli (es. Qwen, LLaMA) richiedono che ce ne sia solo uno.
    let systemContent = settings.systemPrompt || `You are a helpful assistant integrated into PhrasePress CMS.
You have access to tools to interact with the project. ALWAYS use tools when asked about files or content:
- Use list_files to explore directories
- Use read_file to read file contents
- Use search_folios / read_folio to access CMS content
- Use write_file / write_folio / create_folio to create or modify content
Never say you cannot access files — use the tools instead.`

    // Aggiunge sempre i percorsi autorizzati al system prompt
    if (settings.allowedPaths.length > 0) {
      systemContent += `\n\nAllowed filesystem paths (use these with list_files and read_file):\n${settings.allowedPaths.map(p => `- ${p}`).join('\n')}`
    }
    if (req.body.context?.type === 'folio' && req.body.context.codex && req.body.context.folioId) {
      systemContent += `\n\nContext: l'utente sta lavorando sul folio ID=${req.body.context.folioId} di tipo "${req.body.context.codex}".`
    } else if (req.body.context?.page) {
      systemContent += `\n\nContext: l'utente si trova nella pagina "${req.body.context.page}" dell'admin.`
    }
    const chatMessages: ChatMessage[] = [
      { role: 'system', content: systemContent },
    ]

    // Aggiungi history (escludi l'ultimo che è il messaggio corrente già aggiunto)
    for (const msg of history.slice(0, -1)) {
      if (msg.role === 'tool') {
        chatMessages.push({ role: 'tool', content: msg.content, toolCallId: msg.toolCallId ?? undefined })
      } else if (msg.role === 'assistant' && msg.toolCalls) {
        let toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = []
        try { toolCalls = JSON.parse(msg.toolCalls) as typeof toolCalls } catch { /* ignora */ }
        chatMessages.push({ role: 'assistant', content: msg.content, toolCalls })
      } else {
        chatMessages.push({ role: msg.role as 'user' | 'assistant', content: msg.content })
      }
    }

    // Aggiungi messaggio utente corrente
    chatMessages.push({ role: 'user', content: req.body.message })

    // Setup SSE
    reply.raw.setHeader('Content-Type',  'text/event-stream')
    reply.raw.setHeader('Cache-Control', 'no-cache')
    reply.raw.setHeader('Connection',    'keep-alive')
    reply.raw.setHeader('X-Accel-Buffering', 'no')

    const writeEvent = (event: Record<string, unknown>): void => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
    }

    // Invia conversationId al client subito
    writeEvent({ type: 'conversation_id', conversationId: convId })

    // [DEBUG] Log del contesto inviato al modello — rimuovere prima del deploy
    console.log('[AI DEBUG] chat request', JSON.stringify({
      provider:     settings.provider,
      model:        settings.model,
      baseUrl:      settings.baseUrl || '(default)',
      allowedPaths: settings.allowedPaths,
      context:      req.body.context ?? null,
      systemPrompt: systemContent,
      historyLen:   history.length,
    }, null, 2))

    const provider    = createProvider(settings, settings.model)
    const toolContext = buildToolContext(
      ctx.db,
      settings,
      ctx.config.plugins.map(p => p.name),
      ctx.codices.getAll().map(c => ({
        name:   c.name,
        label:  c.label,
        stages: (c.stages ?? [
          { name: 'draft',     label: 'Bozza' },
          { name: 'published', label: 'Pubblicato' },
          { name: 'trash',     label: 'Cestino' },
        ]).map(s => ({ name: s.name, label: s.label })),
      })),
    )

    let assistantContent = ''
    const assistantToolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = []

    try {
      for await (const event of runAgent({ provider, messages: chatMessages, toolContext })) {
        writeEvent(event)

        if (event.type === 'chunk') {
          assistantContent += event.text
        } else if (event.type === 'tool_result') {
          // Salva tool call + result come messaggi separati
          const relatedCall = assistantToolCalls.find(tc => tc.id === event.id)
          dbAddMessage(ctx.db, {
            conversationId: convId,
            role:           'tool',
            content:        event.result,
            toolCallId:     event.id,
          })
        } else if (event.type === 'tool_start') {
          assistantToolCalls.push({ id: event.id, name: event.name, input: event.input })
        } else if (event.type === 'done') {
          assistantContent = event.finalContent
          // Salva risposta assistant
          dbAddMessage(ctx.db, {
            conversationId: convId,
            role:           'assistant',
            content:        assistantContent,
            toolCalls:      assistantToolCalls.length > 0 ? assistantToolCalls : undefined,
          })

          // Aggiorna titolo conversazione se è il primo scambio
          if (history.length <= 2) {
            const title = req.body.message.slice(0, 60) + (req.body.message.length > 60 ? '…' : '')
            dbUpdateConversationTitle(ctx.db, convId, title)
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Errore sconosciuto'
      writeEvent({ type: 'error', message: msg })
    }

    reply.raw.end()
  })
}
