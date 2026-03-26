import { apiFetch, apiFetchBlob } from './client.js'

const BASE = '/api/v1/plugins/phrasepress-backup'

// ─── Types ────────────────────────────────────────────────────────────────────

export type StorageType      = 'local' | 's3' | 'both'
export type BackupStatusType = 'running' | 'success' | 'failed'

export interface BackupIncludes {
  db:      boolean
  media:   boolean
  plugins: boolean
  config:  boolean
}

export interface BackupSettings {
  retentionDays:    number
  localStoragePath: string
  s3KeepLocal:      boolean
  s3Endpoint:       string
  s3Bucket:         string
  s3AccessKey:      string
  s3SecretKey:      string
  s3Region:         string
  updatedAt:        number
}

export interface BackupSchedule {
  id:             number
  name:           string
  enabled:        boolean
  intervalHours:  number
  includeDb:      boolean
  includeMedia:   boolean
  includePlugins: boolean
  includeConfig:  boolean
  storageType:    StorageType
  lastRunAt:      number | null
  createdAt:      number
}

export interface ScheduledRunInfo {
  scheduleId: number
  name:       string
  nextRunAt:  number
}

export interface BackupStatus {
  isRunning:        boolean
  runningCount:     number
  currentJobIds:    number[]
  nextScheduledRuns: ScheduledRunInfo[]
}

export interface BackupHistoryEntry {
  id:           number
  filename:     string
  filepath:     string | null
  s3Key:        string | null
  sizeBytes:    number
  includes:     BackupIncludes
  storageType:  StorageType
  status:       BackupStatusType
  error:        string | null
  scheduleId:   number | null
  scheduleName: string | null
  createdAt:    number
}

export interface PaginatedHistory {
  entries: BackupHistoryEntry[]
  total:   number
  page:    number
  limit:   number
}

export interface CreateScheduleBody {
  name:           string
  enabled?:       boolean
  intervalHours:  number
  includeDb?:     boolean
  includeMedia?:  boolean
  includePlugins?: boolean
  includeConfig?: boolean
  storageType?:   StorageType
}

// ─── Settings API ─────────────────────────────────────────────────────────────

export function getBackupSettings(): Promise<BackupSettings> {
  return apiFetch(`${BASE}/settings`)
}

export function updateBackupSettings(patch: Partial<BackupSettings>): Promise<BackupSettings> {
  return apiFetch(`${BASE}/settings`, {
    method: 'PUT',
    body:   JSON.stringify(patch),
  })
}

// ─── Status API ───────────────────────────────────────────────────────────────

export function getBackupStatus(): Promise<BackupStatus> {
  return apiFetch(`${BASE}/status`)
}

// ─── Schedules API ────────────────────────────────────────────────────────────

export function listSchedules(): Promise<BackupSchedule[]> {
  return apiFetch(`${BASE}/schedules`)
}

export function createSchedule(body: CreateScheduleBody): Promise<BackupSchedule> {
  return apiFetch(`${BASE}/schedules`, { method: 'POST', body: JSON.stringify(body) })
}

export function updateSchedule(id: number, patch: Partial<CreateScheduleBody>): Promise<BackupSchedule> {
  return apiFetch(`${BASE}/schedules/${id}`, { method: 'PUT', body: JSON.stringify(patch) })
}

export function deleteSchedule(id: number): Promise<void> {
  return apiFetch(`${BASE}/schedules/${id}`, { method: 'DELETE' })
}

// ─── History API ──────────────────────────────────────────────────────────────

export function getBackupHistory(params?: { page?: number; limit?: number }): Promise<PaginatedHistory> {
  const q = new URLSearchParams()
  if (params?.page)  q.set('page', String(params.page))
  if (params?.limit) q.set('limit', String(params.limit))
  const qs = q.toString()
  return apiFetch(`${BASE}/history${qs ? `?${qs}` : ''}`)
}

export function triggerBackup(body: {
  includes?:    Partial<BackupIncludes>
  storageType?: StorageType
}): Promise<{ id: number }> {
  return apiFetch(`${BASE}/trigger`, { method: 'POST', body: JSON.stringify(body) })
}

export function restoreBackup(id: number, includes?: Partial<BackupIncludes>): Promise<{ success: boolean; restarting: boolean }> {
  return apiFetch(`${BASE}/history/${id}/restore`, {
    method: 'POST',
    body:   JSON.stringify({ includes }),
  })
}

export function deleteBackup(id: number): Promise<void> {
  return apiFetch(`${BASE}/history/${id}`, { method: 'DELETE' })
}

export async function downloadBackup(id: number, filename: string): Promise<void> {
  const blob = await apiFetchBlob(`${BASE}/history/${id}/download`)
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

