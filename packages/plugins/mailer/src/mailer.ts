import nodemailer from 'nodemailer'
import type { SmtpSettings } from './db.js'

export interface SendMailOptions {
  to:      string
  subject: string
  html:    string
}

export async function sendMail(settings: SmtpSettings, opts: SendMailOptions): Promise<void> {
  if (!settings.host) throw new Error('SMTP host not configured')

  const transport = nodemailer.createTransport({
    host:   settings.host,
    port:   settings.port,
    secure: settings.secure,
    auth:   settings.authUser
      ? { user: settings.authUser, pass: settings.authPass }
      : undefined,
  })

  const from = settings.fromName
    ? `"${settings.fromName}" <${settings.fromEmail}>`
    : settings.fromEmail

  await transport.sendMail({
    from,
    to:      opts.to,
    subject: opts.subject,
    html:    opts.html,
  })
}

export function buildSubmissionHtml(
  formName: string,
  fields:   Array<{ name: string; label: string }>,
  data:     Record<string, unknown>,
): string {
  const rows = fields.map(f =>
    `<tr>
      <td style="padding:10px 14px;font-weight:600;background:#f8f9fa;border:1px solid #dee2e6;white-space:nowrap;vertical-align:top">${escapeHtml(f.label)}</td>
      <td style="padding:10px 14px;border:1px solid #dee2e6">${escapeHtml(String(data[f.name] ?? '—'))}</td>
    </tr>`
  ).join('\n')

  return `<!DOCTYPE html>
<html lang="it">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,-apple-system,sans-serif;color:#212529;max-width:600px;margin:0 auto;padding:24px;background:#fff">
  <h2 style="margin:0 0 4px;color:#1a1a2e">${escapeHtml(formName)}</h2>
  <p style="margin:0 0 20px;color:#6c757d;font-size:14px">Nuova submission ricevuta</p>
  <table style="border-collapse:collapse;width:100%;font-size:14px">
    <tbody>
${rows}
    </tbody>
  </table>
  <p style="margin:24px 0 0;font-size:12px;color:#adb5bd">Inviato da PhrasePress</p>
</body>
</html>`
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
