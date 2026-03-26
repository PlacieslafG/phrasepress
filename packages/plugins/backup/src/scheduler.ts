import type { PluginContext } from '@phrasepress/core'
import type { BackupSchedule, BackupStatus, ScheduledRunInfo } from './types.js'
import { listSchedules, getSchedule, updateScheduleLastRun } from './db.js'
import { startBackup } from './backup.js'

type Db = PluginContext['db']

export class BackupScheduler {
  private timers:        Map<number, ReturnType<typeof setTimeout>> = new Map()
  private running:       Set<number>                                = new Set()
  private nextRuns:      Map<number, number>                        = new Map()  // scheduleId → ms timestamp
  private currentJobIds: Map<number, number>                        = new Map()  // scheduleId → historyId
  private scheduleNames: Map<number, string>                        = new Map()  // scheduleId → name

  start(db: Db): void {
    this.stop()
    const schedules = listSchedules(db)
    for (const schedule of schedules) {
      if (schedule.enabled) {
        this.scheduleOne(db, schedule)
      }
    }
  }

  stop(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer)
    }
    this.timers.clear()
    this.nextRuns.clear()
    this.scheduleNames.clear()
  }

  stopSchedule(id: number): void {
    const timer = this.timers.get(id)
    if (timer !== undefined) {
      clearTimeout(timer)
      this.timers.delete(id)
    }
    this.nextRuns.delete(id)
    this.scheduleNames.delete(id)
  }

  restartSchedule(db: Db, id: number): void {
    this.stopSchedule(id)
    const schedule = getSchedule(db, id)
    if (schedule && schedule.enabled) {
      this.scheduleOne(db, schedule)
    }
  }

  getStatus(): BackupStatus {
    const nextScheduledRuns: ScheduledRunInfo[] = []
    for (const [scheduleId, nextRunAt] of this.nextRuns.entries()) {
      nextScheduledRuns.push({
        scheduleId,
        name:      this.scheduleNames.get(scheduleId) ?? String(scheduleId),
        nextRunAt: Math.floor(nextRunAt / 1000),
      })
    }
    nextScheduledRuns.sort((a, b) => a.nextRunAt - b.nextRunAt)

    return {
      isRunning:        this.running.size > 0,
      runningCount:     this.running.size,
      currentJobIds:    Array.from(this.currentJobIds.values()),
      nextScheduledRuns,
    }
  }

  private scheduleOne(db: Db, schedule: BackupSchedule): void {
    const now        = Date.now()
    const intervalMs = schedule.intervalHours * 60 * 60 * 1000
    const nextRunMs  = schedule.lastRunAt
      ? (schedule.lastRunAt * 1000 + intervalMs)
      : (now + 60_000)
    const delay = Math.max(0, nextRunMs - now)

    this.nextRuns.set(schedule.id, now + delay)
    this.scheduleNames.set(schedule.id, schedule.name)

    const timer = setTimeout(async () => {
      if (this.running.has(schedule.id)) {
        // Already running — defer 1 minute and re-schedule
        const deferred: BackupSchedule = { ...schedule, lastRunAt: Math.floor((Date.now() - intervalMs + 60_000) / 1000) }
        this.scheduleOne(db, deferred)
        return
      }
      this.running.add(schedule.id)
      try {
        const { id, done } = startBackup({
          db,
          includes: {
            db:      schedule.includeDb,
            media:   schedule.includeMedia,
            plugins: schedule.includePlugins,
            config:  schedule.includeConfig,
          },
          scheduleId:   schedule.id,
          scheduleName: schedule.name,
        })
        this.currentJobIds.set(schedule.id, id)
        await done
        updateScheduleLastRun(db, schedule.id, Math.floor(Date.now() / 1000))
      } catch {
        // Error already recorded in backup_history; scheduler continues
      } finally {
        this.running.delete(schedule.id)
        this.currentJobIds.delete(schedule.id)
        this.timers.delete(schedule.id)
        const updated = getSchedule(db, schedule.id)
        if (updated && updated.enabled) {
          this.scheduleOne(db, updated)
        }
      }
    }, delay)

    this.timers.set(schedule.id, timer)
  }
}
