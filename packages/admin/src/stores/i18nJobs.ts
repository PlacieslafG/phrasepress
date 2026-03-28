import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface ActiveTranslationJob {
  jobId:   string
  folioId: number
  total:   number
  completed: number
  failed:  number
}

const STORAGE_KEY = 'pp_active_translation_job'

function loadFromStorage(): ActiveTranslationJob | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as ActiveTranslationJob) : null
  } catch {
    return null
  }
}

export const useI18nJobsStore = defineStore('i18nJobs', () => {
  const activeJob = ref<ActiveTranslationJob | null>(loadFromStorage())

  const isRunning = computed(() => activeJob.value !== null)

  function startJob(jobId: string, folioId: number, total: number) {
    activeJob.value = { jobId, folioId, total, completed: 0, failed: 0 }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(activeJob.value))
  }

  function updateProgress(completed: number, failed: number) {
    if (!activeJob.value) return
    activeJob.value.completed = completed
    activeJob.value.failed    = failed
    localStorage.setItem(STORAGE_KEY, JSON.stringify(activeJob.value))
  }

  function clearJob() {
    activeJob.value = null
    localStorage.removeItem(STORAGE_KEY)
  }

  return { activeJob, isRunning, startJob, updateProgress, clearJob }
})
