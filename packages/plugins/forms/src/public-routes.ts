import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { PluginContext } from '@phrasepress/core'
import type { FormField } from './db.js'
import {
  dbGetFormBySlug,
  dbCreateSubmission,
  serializeForm,
} from './db.js'

// ─── Routes pubbliche (no autenticazione) ─────────────────────────────────────

export async function registerPublicRoutes(app: FastifyInstance, ctx: PluginContext): Promise<void> {

  // ── GET /public/forms/:slug — definizione pubblica del form ───────────────
  // Restituisce solo i dati necessari per il rendering del form sul front-end.
  app.get<{ Params: { slug: string } }>('/public/forms/:slug', {
    schema: {
      params: {
        type: 'object',
        required: ['slug'],
        properties: { slug: { type: 'string' } },
      },
    },
  }, async (req: FastifyRequest<{ Params: { slug: string } }>, reply: FastifyReply) => {
    const form = dbGetFormBySlug(ctx.db, req.params.slug)
    if (!form || form.status !== 'active') {
      return reply.status(404).send({ error: 'Form not found' })
    }
    const serialized = serializeForm(form)
    // Al pubblico esponiamo solo i campi necessari al rendering
    return {
      name:        serialized.name,
      slug:        serialized.slug,
      description: serialized.description,
      fields:      serialized.fields,
    }
  })

  // ── POST /public/submit/:slug — invio di un form ──────────────────────────
  app.post<{
    Params: { slug: string }
    Body:   Record<string, unknown>
  }>('/public/submit/:slug', {
    schema: {
      params: {
        type: 'object',
        required: ['slug'],
        properties: { slug: { type: 'string' } },
      },
      body: {
        type: 'object',
        additionalProperties: true,
      },
    },
  }, async (req: FastifyRequest<{ Params: { slug: string }; Body: Record<string, unknown> }>, reply: FastifyReply) => {
    const form = dbGetFormBySlug(ctx.db, req.params.slug)
    if (!form || form.status !== 'active') {
      return reply.status(404).send({ error: 'Form not found' })
    }

    const serialized = serializeForm(form)
    const fields     = serialized.fields as FormField[]

    // Valida che tutti i campi required siano presenti e non vuoti
    const validationErrors: Array<{ field: string; message: string }> = []
    for (const field of fields) {
      const value = req.body[field.name]
      if (field.required) {
        if (value === undefined || value === null || value === '') {
          validationErrors.push({ field: field.name, message: `${field.label} è obbligatorio` })
        }
      }
      // Validazione formato email
      if (field.type === 'email' && value) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (typeof value !== 'string' || !emailRegex.test(value)) {
          validationErrors.push({ field: field.name, message: `${field.label} non è un indirizzo email valido` })
        }
      }
      // Validazione opzioni per select
      if (field.type === 'select' && value !== undefined && value !== '' && field.options) {
        if (!field.options.includes(String(value))) {
          validationErrors.push({ field: field.name, message: `${field.label}: valore non valido` })
        }
      }
    }

    if (validationErrors.length > 0) {
      return reply.status(422).send({ errors: validationErrors })
    }

    // Estrai solo i campi del form (ignora campi extra inviati dal client)
    const submissionData: Record<string, unknown> = {}
    for (const field of fields) {
      if (req.body[field.name] !== undefined) {
        submissionData[field.name] = req.body[field.name]
      }
    }

    const ip        = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim()
                    ?? req.ip
                    ?? null
    const userAgent = req.headers['user-agent'] ?? null

    const submission = dbCreateSubmission(ctx.db, {
      formId:    form.id,
      data:      submissionData,
      ip,
      userAgent,
    })

    await ctx.hooks.doAction('form.submitted', { form: serialized, submission })

    return reply.status(201).send({ id: submission.id, message: 'Form submitted successfully' })
  })
}
