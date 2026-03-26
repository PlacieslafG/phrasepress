export type StorageType      = 'local' | 's3' | 'both'
export type BackupStatusType = 'running' | 'success' | 'failed'

export interface BackupIncludes {
  db:      boolean
  media:   boolean
  plugins: boolean
  config:  boolean
}

// Global settings: storage config and retention only.
// Schedule-specific settings (interval, includes, storage type) live in BackupSchedule.
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
  id:            number
  name:          string
  enabled:       boolean
  intervalHours: number
  includeDb:     boolean
  includeMedia:  boolean
  includePlugins: boolean
  includeConfig: boolean
  storageType:   StorageType
  lastRunAt:     number | null
  createdAt:     number
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

export interface TriggerBackupBody {
  includes?:    Partial<BackupIncludes>
  storageType?: StorageType
}

export interface RestoreBody {
  includes?: Partial<BackupIncludes>
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

export interface ScheduledRunInfo {
  scheduleId: number
  name:       string
  nextRunAt:  number  // Unix timestamp seconds
}

export interface BackupStatus {
  isRunning:         boolean
  runningCount:      number
  currentJobIds:     number[]
  nextScheduledRuns: ScheduledRunInfo[]
}
