import { apiFetch } from './client.js'

const BASE = '/api/v1/plugins/phrasepress-mailer'

// ─── Tipi ─────────────────────────────────────────────────────────────────────

export interface SmtpSettings {
  host:        string
  port:        number
  secure:      boolean
  fromName:    string
  fromEmail:   string
  authUser:    string
  hasPassword: boolean   // true se una password è salvata (non viene mai restituita in chiaro)
}

export interface SmtpSettingsInput {
  host:      string
  port:      number
  secure:    boolean
  fromName:  string
  fromEmail: string
  authUser:  string
  authPass?: string     // omettere per mantenere la password esistente
}

export interface NotificationRule {
  id:              string
  formId:          string
  toEmail:         string
  subjectTemplate: string
  enabled:         boolean
}

export type NotificationInput = {
  formId:           string
  toEmail:          string
  subjectTemplate?: string
  enabled?:         boolean
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export function getMailerSettings(): Promise<SmtpSettings> {
  return apiFetch<SmtpSettings>(`${BASE}/settings`)
}

export function updateMailerSettings(data: SmtpSettingsInput): Promise<SmtpSettings> {
  return apiFetch<SmtpSettings>(`${BASE}/settings`, {
    method: 'PUT',
    body:   JSON.stringify(data),
  })
}

export function testMailer(toEmail: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`${BASE}/test`, {
    method: 'POST',
    body:   JSON.stringify({ toEmail }),
  })
}

// ─── Notifications ────────────────────────────────────────────────────────────

export function getMailerNotifications(): Promise<NotificationRule[]> {
  return apiFetch<NotificationRule[]>(`${BASE}/notifications`)
}

export function createMailerNotification(data: NotificationInput): Promise<NotificationRule> {
  return apiFetch<NotificationRule>(`${BASE}/notifications`, {
    method: 'POST',
    body:   JSON.stringify(data),
  })
}

export function updateMailerNotification(id: string, data: NotificationInput): Promise<NotificationRule> {
  return apiFetch<NotificationRule>(`${BASE}/notifications/${id}`, {
    method: 'PUT',
    body:   JSON.stringify(data),
  })
}

export function deleteMailerNotification(id: string): Promise<void> {
  return apiFetch<void>(`${BASE}/notifications/${id}`, { method: 'DELETE' })
}
