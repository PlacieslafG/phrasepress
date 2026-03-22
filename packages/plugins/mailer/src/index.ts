import type { Plugin, PluginContext } from '@phrasepress/core'
import { createTables, dbGetSettings, dbListNotificationsByFormId } from './db.js'
import { registerMailerRoutes } from './routes.js'
import { sendMail, buildSubmissionHtml } from './mailer.js'

// ─── Tipo payload hook form.submitted ─────────────────────────────────────────

interface FormSubmittedPayload {
  form: {
    id:     string
    name:   string
    fields: Array<{ name: string; label: string }>
  }
  submission: {
    data: string  // JSON string { [fieldName]: value }
  }
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

const mailerPlugin: Plugin = {
  name:        'phrasepress-mailer',
  version:     '1.0.0',
  description: 'Invio email per notifiche submission form',

  async onActivate(ctx: PluginContext) {
    createTables(ctx.db)
  },

  async register(ctx: PluginContext) {
    // Hook: intercetta ogni submission e invia le email configurate
    ctx.hooks.addAction('form.submitted', async (payload: unknown) => {
      const { form, submission } = payload as FormSubmittedPayload

      const notifications = dbListNotificationsByFormId(ctx.db, form.id)
        .filter(n => n.enabled === 1)
      if (notifications.length === 0) return

      const settings = dbGetSettings(ctx.db)
      if (!settings.host) return

      let data: Record<string, unknown> = {}
      try {
        data = JSON.parse(submission.data) as Record<string, unknown>
      } catch {
        return
      }

      const html = buildSubmissionHtml(form.name, form.fields, data)

      for (const notification of notifications) {
        const subject = notification.subjectTemplate.replace('{form_name}', form.name)
        try {
          await sendMail(settings, { to: notification.toEmail, subject, html })
        } catch (err) {
          // Non bloccare le altre notifiche se una fallisce
          console.error(`[phrasepress-mailer] send failed for notification ${notification.id}:`, err)
        }
      }
    })

    // Route admin
    await ctx.fastify.register(async (app) => {
      await registerMailerRoutes(app, ctx)
    }, { prefix: '/api/v1/plugins/phrasepress-mailer' })
  },
}

export default mailerPlugin
