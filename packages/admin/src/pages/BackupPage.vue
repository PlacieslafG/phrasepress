<template>
  <div class="p-6 flex flex-col gap-6 max-w-5xl">
    <h1 class="text-2xl font-bold">Backup</h1>

    <!-- ─── Tab navigation ──────────────────────────────────────────────────── -->
    <div class="flex gap-1 border-b border-surface-200 dark:border-surface-700">
      <button
        v-for="tab in TABS"
        :key="tab.id"
        class="px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors"
        :class="activeTab === tab.id
          ? 'border-primary text-primary'
          : 'border-transparent text-surface-500 hover:text-surface-700 dark:hover:text-surface-200'"
        @click="activeTab = tab.id"
      >
        <i :class="`${tab.icon} mr-1.5 text-xs`" />
        {{ tab.label }}
      </button>
    </div>

    <!-- ─── Tab: Dashboard ──────────────────────────────────────────────────── -->
    <div v-if="activeTab === 'dashboard'" class="flex flex-col gap-6">

      <!-- Status cards -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="card flex flex-col gap-1">
          <p class="text-xs font-medium text-surface-400 uppercase tracking-wide">Ultimo backup</p>
          <template v-if="lastBackup">
            <p class="font-semibold text-sm">{{ formatDate(lastBackup.createdAt) }}</p>
            <p class="text-xs text-surface-400">{{ formatSize(lastBackup.sizeBytes) }} · {{ includesLabel(lastBackup.includes) }}</p>
          </template>
          <p v-else class="text-sm text-surface-400">Nessun backup ancora</p>
        </div>

        <div class="card flex flex-col gap-1">
          <p class="text-xs font-medium text-surface-400 uppercase tracking-wide">Programmi attivi</p>
          <p class="font-semibold text-sm">{{ backupStatus.nextScheduledRuns.length }}</p>
          <p class="text-xs text-surface-400">{{ backupStatus.nextScheduledRuns.length === 1 ? 'schedule attivo' : 'schedule attivi' }}</p>
        </div>

        <div class="card flex flex-col gap-1">
          <p class="text-xs font-medium text-surface-400 uppercase tracking-wide">Stato</p>
          <div class="flex items-center gap-2">
            <i v-if="backupStatus.isRunning" class="pi pi-spin pi-spinner text-primary" />
            <i v-else class="pi pi-check-circle text-green-500" />
            <span class="text-sm font-medium">
              {{ backupStatus.isRunning ? `${backupStatus.runningCount} in esecuzione…` : 'Inattivo' }}
            </span>
          </div>
        </div>
      </div>

      <!-- Prossime esecuzioni -->
      <div v-if="backupStatus.nextScheduledRuns.length > 0" class="card">
        <h2 class="text-base font-semibold mb-3">Prossime esecuzioni pianificate</h2>
        <div class="flex flex-col divide-y divide-surface-200 dark:divide-surface-700">
          <div
            v-for="run in backupStatus.nextScheduledRuns"
            :key="run.scheduleId"
            class="flex items-center justify-between py-2.5"
          >
            <span class="text-sm font-medium">{{ run.name }}</span>
            <span class="text-sm text-surface-400">{{ formatDate(run.nextRunAt) }}</span>
          </div>
        </div>
      </div>

      <!-- Manual trigger -->
      <div class="card">
        <h2 class="text-base font-semibold mb-4">Esegui backup adesso</h2>

        <div class="flex flex-col gap-4">
          <div>
            <p class="text-sm font-medium mb-2">Includi nel backup:</p>
            <div class="flex flex-wrap gap-4">
              <div v-for="item in includeItems" :key="item.key" class="flex items-center gap-2">
                <Checkbox v-model="triggerIncludes[item.key]" :inputId="`inc-${item.key}`" :binary="true" />
                <label :for="`inc-${item.key}`" class="text-sm cursor-pointer">{{ item.label }}</label>
              </div>
            </div>
          </div>

          <div class="flex items-center gap-4">
            <div class="flex flex-col gap-1">
              <label class="text-sm font-medium">Storage</label>
              <Select
                v-model="triggerStorageType"
                :options="storageTypeOptions"
                option-label="label"
                option-value="value"
                class="w-40"
              />
            </div>
            <div class="mt-5">
              <Button
                label="Esegui backup"
                icon="pi pi-download"
                :loading="triggerRunning"
                :disabled="backupStatus.isRunning"
                @click="triggerManualBackup"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ─── Tab: Impostazioni ────────────────────────────────────────────────── -->
    <div v-if="activeTab === 'settings'" class="flex flex-col gap-6">

      <!-- Schedules section -->
      <div class="card">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-base font-semibold">Programmi automatici</h2>
          <Button label="Aggiungi programma" icon="pi pi-plus" size="small" @click="openScheduleDialog()" />
        </div>

        <DataTable
          :value="schedules"
          :loading="loadingSchedules"
          striped-rows
          class="w-full"
        >
          <template #empty>
            <div class="text-center py-6 text-surface-400">
              Nessun programma configurato. Crea il primo backup automatico.
            </div>
          </template>

          <Column header="Nome">
            <template #body="{ data: s }: { data: BackupSchedule }">
              <span class="text-sm font-medium">{{ s.name }}</span>
            </template>
          </Column>

          <Column header="Frequenza" style="width: 140px">
            <template #body="{ data: s }: { data: BackupSchedule }">
              <span class="text-sm">{{ intervalLabel(s.intervalHours) }}</span>
            </template>
          </Column>

          <Column header="Contenuto">
            <template #body="{ data: s }: { data: BackupSchedule }">
              <div class="flex flex-wrap gap-1">
                <Tag v-if="s.includeDb"      value="DB"      severity="info"      class="text-xs" />
                <Tag v-if="s.includeMedia"   value="Media"   severity="secondary" class="text-xs" />
                <Tag v-if="s.includePlugins" value="Plugin"  severity="secondary" class="text-xs" />
                <Tag v-if="s.includeConfig"  value="Config"  severity="secondary" class="text-xs" />
              </div>
            </template>
          </Column>

          <Column header="Storage" style="width: 100px">
            <template #body="{ data: s }: { data: BackupSchedule }">
              <span class="text-xs uppercase text-surface-500">{{ s.storageType }}</span>
            </template>
          </Column>

          <Column header="Attivo" style="width: 80px">
            <template #body="{ data: s }: { data: BackupSchedule }">
              <ToggleSwitch
                :model-value="s.enabled"
                @update:model-value="(val: boolean) => toggleSchedule(s, val)"
              />
            </template>
          </Column>

          <Column header="Azioni" style="width: 90px">
            <template #body="{ data: s }: { data: BackupSchedule }">
              <div class="flex gap-1">
                <Button
                  icon="pi pi-pencil"
                  text plain size="small"
                  v-tooltip.top="'Modifica'"
                  @click="openScheduleDialog(s)"
                />
                <Button
                  icon="pi pi-trash"
                  text plain size="small"
                  severity="danger"
                  v-tooltip.top="'Elimina'"
                  @click="confirmDeleteSchedule(s)"
                />
              </div>
            </template>
          </Column>
        </DataTable>
      </div>

      <!-- Global settings -->
      <div class="card">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-base font-semibold">Storage e retention</h2>
          <Button label="Salva" icon="pi pi-check" size="small" :loading="savingSettings" @click="saveSettings" />
        </div>
        <div class="flex flex-col gap-5">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium">Retention (giorni)</label>
            <InputNumber v-model="settings.retentionDays" :min="0" :max="3650" class="w-48" placeholder="0 = disabilita" />
            <p class="text-xs text-surface-400">I backup più vecchi di N giorni vengono eliminati automaticamente.</p>
          </div>

          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium">Directory locale</label>
            <InputText v-model="settings.localStoragePath" placeholder="./data/backups" class="w-full max-w-md" />
            <p class="text-xs text-surface-400">Percorso relativo a packages/core o assoluto.</p>
          </div>

          <!-- S3 section -->
          <div class="border-t border-surface-200 dark:border-surface-700 pt-4">
            <p class="text-sm font-semibold mb-4 text-surface-600 dark:text-surface-300">Configurazione S3 <span class="font-normal text-surface-400">(opzionale)</span></p>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium">Endpoint <span class="text-surface-400 font-normal">(opzionale per AWS)</span></label>
                <InputText v-model="settings.s3Endpoint" placeholder="https://s3.example.com" class="w-full" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium">Bucket</label>
                <InputText v-model="settings.s3Bucket" placeholder="my-backups" class="w-full" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium">Access Key</label>
                <InputText v-model="settings.s3AccessKey" placeholder="AKIAIOSFODNN7EXAMPLE" class="w-full" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium">Secret Key</label>
                <Password v-model="settings.s3SecretKey" :feedback="false" toggle-mask input-class="w-full" class="w-full" placeholder="********" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium">Region</label>
                <InputText v-model="settings.s3Region" placeholder="us-east-1" class="w-full" />
              </div>
              <div class="flex items-center gap-2 self-end pb-1">
                <ToggleSwitch v-model="settings.s3KeepLocal" inputId="s3-keep-local" />
                <label for="s3-keep-local" class="text-sm cursor-pointer">Mantieni copia locale quando si usa S3</label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ─── Tab: Storico ─────────────────────────────────────────────────────── -->
    <div v-if="activeTab === 'history'" class="flex flex-col gap-4">
      <div class="flex justify-between items-center">
        <p class="text-sm text-surface-400">{{ history.total }} backup totali</p>
        <div class="flex items-center gap-2">
          <Button
            v-if="selectedBackups.length > 0"
            :label="`Elimina selezionati (${selectedBackups.length})`"
            icon="pi pi-trash"
            severity="danger"
            size="small"
            :loading="bulkDeleting"
            @click="confirmBulkDelete"
          />
          <Button icon="pi pi-refresh" severity="secondary" size="small" :loading="loadingHistory" @click="loadHistory" v-tooltip.bottom="'Aggiorna'" />
        </div>
      </div>

      <DataTable
        v-model:selection="selectedBackups"
        :value="history.entries"
        :loading="loadingHistory"
        striped-rows
        class="w-full"
      >
        <template #empty>
          <div class="text-center py-8 text-surface-400">Nessun backup nello storico.</div>
        </template>

        <Column style="width: 48px" :exportable="false">
          <template #body="{ data: e }: { data: BackupHistoryEntry }">
            <Checkbox
              v-model="selectedBackups"
              :value="e"
              :disabled="e.status === 'running'"
            />
          </template>
          <template #header>
            <Checkbox
              :binary="true"
              :model-value="allSelectable.length > 0 && allSelectable.length === selectedBackups.length"
              :indeterminate="selectedBackups.length > 0 && selectedBackups.length < allSelectable.length"
              @update:model-value="toggleSelectAll"
            />
          </template>
        </Column>

        <Column header="Data" style="min-width: 150px">
          <template #body="{ data: e }: { data: BackupHistoryEntry }">
            <span class="text-sm">{{ formatDate(e.createdAt) }}</span>
          </template>
        </Column>

        <Column header="Programma" style="min-width: 120px">
          <template #body="{ data: e }: { data: BackupHistoryEntry }">
            <span class="text-sm text-surface-500">{{ e.scheduleName ?? 'Manuale' }}</span>
          </template>
        </Column>

        <Column header="Dimensione" style="width: 110px">
          <template #body="{ data: e }: { data: BackupHistoryEntry }">
            <span class="text-sm">{{ e.status === 'success' ? formatSize(e.sizeBytes) : '—' }}</span>
          </template>
        </Column>

        <Column header="Contenuto">
          <template #body="{ data: e }: { data: BackupHistoryEntry }">
            <div class="flex flex-wrap gap-1">
              <Tag v-if="e.includes.db"      value="DB"      severity="info"      class="text-xs" />
              <Tag v-if="e.includes.media"   value="Media"   severity="secondary" class="text-xs" />
              <Tag v-if="e.includes.plugins" value="Plugin"  severity="secondary" class="text-xs" />
              <Tag v-if="e.includes.config"  value="Config"  severity="secondary" class="text-xs" />
            </div>
          </template>
        </Column>

        <Column header="Storage" style="width: 90px">
          <template #body="{ data: e }: { data: BackupHistoryEntry }">
            <span class="text-xs uppercase text-surface-500">{{ e.storageType }}</span>
          </template>
        </Column>

        <Column header="Stato" style="width: 110px">
          <template #body="{ data: e }: { data: BackupHistoryEntry }">
            <Tag :value="statusLabel(e.status)" :severity="statusSeverity(e.status)" class="text-xs" />
          </template>
        </Column>

        <Column header="Azioni" style="width: 130px">
          <template #body="{ data: e }: { data: BackupHistoryEntry }">
            <div class="flex gap-1">
              <Button icon="pi pi-download" text plain size="small" v-tooltip.top="'Scarica'"
                :disabled="e.status !== 'success'" @click="handleDownload(e)" />
              <Button icon="pi pi-refresh" text plain size="small" severity="warn" v-tooltip.top="'Ripristina'"
                :disabled="e.status !== 'success'" @click="confirmRestore(e)" />
              <Button icon="pi pi-trash" text plain size="small" severity="danger" v-tooltip.top="'Elimina'"
                :disabled="e.status === 'running'" @click="confirmDeleteBackup(e)" />
            </div>
          </template>
        </Column>
      </DataTable>

      <div v-if="history.total > history.limit" class="flex justify-center">
        <Paginator
          :rows="history.limit"
          :total-records="history.total"
          :first="(history.page - 1) * history.limit"
          @page="onPageChange"
        />
      </div>
    </div>

    <!-- ─── Dialog: crea/modifica programma ─────────────────────────────────── -->
    <Dialog
      v-model:visible="scheduleDialogVisible"
      :header="scheduleDialogMode === 'create' ? 'Nuovo programma' : 'Modifica programma'"
      modal
      :style="{ width: '480px' }"
    >
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium">Nome</label>
          <InputText v-model="scheduleForm.name" placeholder="es. Backup giornaliero" class="w-full" />
        </div>

        <div class="flex items-center gap-3">
          <ToggleSwitch v-model="scheduleForm.enabled" inputId="sch-enabled" />
          <label for="sch-enabled" class="text-sm cursor-pointer">Abilitato</label>
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium">Frequenza</label>
          <Select
            v-model="scheduleForm.intervalHours"
            :options="intervalOptions"
            option-label="label"
            option-value="value"
            class="w-full"
          />
        </div>

        <div>
          <p class="text-sm font-medium mb-2">Includi nel backup:</p>
          <div class="flex flex-wrap gap-4">
            <div v-for="item in includeItems" :key="item.key" class="flex items-center gap-2">
              <Checkbox v-model="scheduleForm[item.key]" :inputId="`sch-inc-${item.key}`" :binary="true" />
              <label :for="`sch-inc-${item.key}`" class="text-sm cursor-pointer">{{ item.label }}</label>
            </div>
          </div>
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium">Storage</label>
          <Select
            v-model="scheduleForm.storageType"
            :options="storageTypeOptions"
            option-label="label"
            option-value="value"
            class="w-full"
          />
        </div>
      </div>

      <template #footer>
        <Button label="Annulla" text @click="scheduleDialogVisible = false" />
        <Button
          :label="scheduleDialogMode === 'create' ? 'Crea' : 'Salva'"
          icon="pi pi-check"
          :loading="savingSchedule"
          @click="saveSchedule"
        />
      </template>
    </Dialog>

    <!-- ─── Dialog: ripristina ──────────────────────────────────────────────── -->
    <Dialog
      v-model:visible="restoreDialogVisible"
      header="Ripristina backup"
      modal
      :style="{ width: '480px' }"
    >
      <div v-if="restoreTarget" class="flex flex-col gap-4">
        <div class="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-lg">
          <i class="pi pi-exclamation-triangle text-amber-600 mt-0.5 shrink-0" />
          <p class="text-sm text-amber-700 dark:text-amber-300">
            <strong>Attenzione:</strong> il ripristino sovrascriverà i dati correnti con quelli del backup del
            <strong>{{ formatDate(restoreTarget.createdAt) }}</strong>.
            Il server si riavvierà automaticamente al termine.
          </p>
        </div>

        <div>
          <p class="text-sm font-medium mb-2">Cosa ripristinare:</p>
          <div class="flex flex-col gap-2">
            <div
              v-for="item in includeItems"
              :key="item.key"
              class="flex items-center gap-2"
              :class="!restoreTarget.includes[item.key] ? 'opacity-40' : ''"
            >
              <Checkbox
                v-model="restoreIncludes[item.key]"
                :inputId="`restore-inc-${item.key}`"
                :binary="true"
                :disabled="!restoreTarget.includes[item.key]"
              />
              <label :for="`restore-inc-${item.key}`" class="text-sm cursor-pointer">
                {{ item.label }}
                <span v-if="!restoreTarget.includes[item.key]" class="text-surface-400 text-xs">(non incluso)</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <Button label="Annulla" text @click="restoreDialogVisible = false" />
        <Button
          label="Ripristina e riavvia"
          icon="pi pi-refresh"
          severity="danger"
          :loading="restoring"
          @click="executeRestore"
        />
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { useToast }   from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import {
  getBackupSettings, updateBackupSettings,
  getBackupStatus, getBackupHistory,
  triggerBackup, restoreBackup, downloadBackup, deleteBackup,
  listSchedules, createSchedule, updateSchedule, deleteSchedule,
  type BackupSettings, type BackupHistoryEntry, type BackupIncludes,
  type StorageType, type BackupStatus, type PaginatedHistory,
  type BackupSchedule, type CreateScheduleBody,
} from '@/api/backup.js'
import { ApiError } from '@/api/client.js'
import { useServerRestart } from '@/composables/useServerRestart.js'

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'dashboard', label: 'Dashboard',    icon: 'pi pi-home'     },
  { id: 'settings',  label: 'Impostazioni', icon: 'pi pi-cog'      },
  { id: 'history',   label: 'Storico',      icon: 'pi pi-history'  },
]
const activeTab = ref<string>('dashboard')

// ─── Composables ──────────────────────────────────────────────────────────────

const toast   = useToast()
const confirm = useConfirm()
const { captureBootId, showInitialPhase, pollUntilRestarted, cancel: cancelRestart } = useServerRestart()

// ─── Constants ────────────────────────────────────────────────────────────────

const includeItems: Array<{ key: keyof BackupIncludes; label: string }> = [
  { key: 'db',      label: 'Database' },
  { key: 'media',   label: 'Media'    },
  { key: 'plugins', label: 'Plugin'   },
  { key: 'config',  label: 'Config'   },
]

const intervalOptions = [
  { value: 1,   label: 'Ogni ora'       },
  { value: 6,   label: 'Ogni 6 ore'    },
  { value: 12,  label: 'Ogni 12 ore'   },
  { value: 24,  label: 'Ogni 24 ore'   },
  { value: 48,  label: 'Ogni 2 giorni' },
  { value: 72,  label: 'Ogni 3 giorni' },
  { value: 168, label: 'Ogni settimana'},
]

const storageTypeOptions = [
  { value: 'local', label: 'Solo locale' },
  { value: 's3',    label: 'Solo S3'     },
  { value: 'both',  label: 'Locale + S3' },
]

// ─── State: settings ──────────────────────────────────────────────────────────

const settings = reactive<BackupSettings>({
  retentionDays:    30,
  localStoragePath: './data/backups',
  s3KeepLocal:      true,
  s3Endpoint:       '',
  s3Bucket:         '',
  s3AccessKey:      '',
  s3SecretKey:      '',
  s3Region:         'us-east-1',
  updatedAt:        0,
})
const savingSettings = ref(false)

// ─── State: schedules ─────────────────────────────────────────────────────────

const schedules        = ref<BackupSchedule[]>([])
const loadingSchedules = ref(false)

// Schedule dialog
const scheduleDialogVisible = ref(false)
const scheduleDialogMode    = ref<'create' | 'edit'>('create')
const scheduleEditId        = ref<number | null>(null)
const savingSchedule        = ref(false)
const scheduleForm          = reactive({
  name:           '',
  enabled:        true,
  intervalHours:  24,
  db:             true,
  media:          true,
  plugins:        false,
  config:         false,
  storageType:    'local' as StorageType,
})

// ─── State: status ────────────────────────────────────────────────────────────

const backupStatus = reactive<BackupStatus>({
  isRunning:         false,
  runningCount:      0,
  currentJobIds:     [],
  nextScheduledRuns: [],
})
let statusPoller: ReturnType<typeof setInterval> | null = null

// ─── State: manual trigger ────────────────────────────────────────────────────

const triggerIncludes = reactive<BackupIncludes>({
  db:      true,
  media:   true,
  plugins: false,
  config:  false,
})
const triggerStorageType = ref<StorageType>('local')
const triggerRunning     = ref(false)

// ─── State: history ───────────────────────────────────────────────────────────

const history = reactive<PaginatedHistory>({
  entries: [],
  total:   0,
  page:    1,
  limit:   20,
})
const loadingHistory  = ref(false)
const selectedBackups = ref<BackupHistoryEntry[]>([])
const bulkDeleting    = ref(false)

const lastBackup = computed<BackupHistoryEntry | null>(() =>
  history.entries.find(e => e.status === 'success') ?? null
)

const allSelectable = computed(() =>
  history.entries.filter(e => e.status !== 'running')
)

function toggleSelectAll(val: boolean): void {
  selectedBackups.value = val ? [...allSelectable.value] : []
}

// ─── State: restore dialog ────────────────────────────────────────────────────

const restoreDialogVisible  = ref(false)
const restoreTarget         = ref<BackupHistoryEntry | null>(null)
const restoreIncludes       = reactive<BackupIncludes>({ db: true, media: true, plugins: false, config: false })
const restoring             = ref(false)


// ─── Load ─────────────────────────────────────────────────────────────────────

async function loadAll(): Promise<void> {
  try {
    const [s, status] = await Promise.all([getBackupSettings(), getBackupStatus()])
    Object.assign(settings, s)
    Object.assign(backupStatus, status)
  } catch (err) {
    showError(err)
  }
  await Promise.all([loadHistory(), loadSchedules()])
}

async function loadHistory(): Promise<void> {
  loadingHistory.value = true
  try {
    const result = await getBackupHistory({ page: history.page, limit: history.limit })
    Object.assign(history, result)
    // Clear selection when history reloads to avoid stale references
    selectedBackups.value = []
  } catch (err) {
    showError(err)
  } finally {
    loadingHistory.value = false
  }
}

async function loadSchedules(): Promise<void> {
  loadingSchedules.value = true
  try {
    schedules.value = await listSchedules()
  } catch (err) {
    showError(err)
  } finally {
    loadingSchedules.value = false
  }
}

async function refreshStatus(): Promise<void> {
  try {
    const status = await getBackupStatus()
    const wasRunning = backupStatus.isRunning
    Object.assign(backupStatus, status)

    // Reload history either on isRunning transition OR if history has stale
    // 'running' entries while the server reports nothing is running (race condition
    // where the backup finished before we registered wasRunning=true).
    const hasStaleRunning = !status.isRunning && history.entries.some(e => e.status === 'running')
    if ((wasRunning && !status.isRunning) || hasStaleRunning) {
      await loadHistory()
      const latest = history.entries[0]
      if (latest?.status === 'success') {
        toast.add({ severity: 'success', summary: 'Backup completato', detail: `${formatSize(latest.sizeBytes)} salvato correttamente.`, life: 5000 })
      } else if (latest && latest.status !== 'running') {
        toast.add({ severity: 'error', summary: 'Backup fallito', detail: latest.error ?? 'Errore sconosciuto', life: 8000 })
      }
    }
  } catch { /* silenzioso */ }
}

// ─── Actions: settings ────────────────────────────────────────────────────────

async function saveSettings(): Promise<void> {
  savingSettings.value = true
  try {
    const updated = await updateBackupSettings({ ...settings })
    Object.assign(settings, updated)
    toast.add({ severity: 'success', summary: 'Impostazioni salvate', life: 3000 })
  } catch (err) {
    showError(err, 'Errore nel salvare')
  } finally {
    savingSettings.value = false
  }
}

// ─── Actions: schedules ───────────────────────────────────────────────────────

function openScheduleDialog(schedule?: BackupSchedule): void {
  if (schedule) {
    scheduleDialogMode.value  = 'edit'
    scheduleEditId.value      = schedule.id
    scheduleForm.name         = schedule.name
    scheduleForm.enabled      = schedule.enabled
    scheduleForm.intervalHours = schedule.intervalHours
    scheduleForm.db           = schedule.includeDb
    scheduleForm.media        = schedule.includeMedia
    scheduleForm.plugins      = schedule.includePlugins
    scheduleForm.config       = schedule.includeConfig
    scheduleForm.storageType  = schedule.storageType
  } else {
    scheduleDialogMode.value  = 'create'
    scheduleEditId.value      = null
    scheduleForm.name         = ''
    scheduleForm.enabled      = true
    scheduleForm.intervalHours = 24
    scheduleForm.db           = true
    scheduleForm.media        = true
    scheduleForm.plugins      = false
    scheduleForm.config       = false
    scheduleForm.storageType  = 'local'
  }
  scheduleDialogVisible.value = true
}

async function saveSchedule(): Promise<void> {
  if (!scheduleForm.name.trim()) {
    toast.add({ severity: 'warn', summary: 'Il nome è obbligatorio', life: 3000 })
    return
  }

  const body: CreateScheduleBody = {
    name:           scheduleForm.name.trim(),
    enabled:        scheduleForm.enabled,
    intervalHours:  scheduleForm.intervalHours,
    includeDb:      scheduleForm.db,
    includeMedia:   scheduleForm.media,
    includePlugins: scheduleForm.plugins,
    includeConfig:  scheduleForm.config,
    storageType:    scheduleForm.storageType,
  }

  savingSchedule.value = true
  try {
    if (scheduleDialogMode.value === 'create') {
      await createSchedule(body)
      toast.add({ severity: 'success', summary: 'Programma creato', life: 3000 })
    } else {
      await updateSchedule(scheduleEditId.value!, body)
      toast.add({ severity: 'success', summary: 'Programma aggiornato', life: 3000 })
    }
    scheduleDialogVisible.value = false
    await loadSchedules()
    await refreshStatus()
  } catch (err) {
    showError(err, 'Errore nel salvare il programma')
  } finally {
    savingSchedule.value = false
  }
}

async function toggleSchedule(schedule: BackupSchedule, enabled: boolean): Promise<void> {
  try {
    await updateSchedule(schedule.id, { enabled })
    await loadSchedules()
    await refreshStatus()
  } catch (err) {
    showError(err, 'Errore nel modificare il programma')
  }
}

function confirmDeleteSchedule(schedule: BackupSchedule): void {
  confirm.require({
    message:  `Eliminare il programma "${schedule.name}"?`,
    header:   'Conferma eliminazione',
    icon:     'pi pi-trash',
    rejectProps: { label: 'Annulla', severity: 'secondary', outlined: true },
    acceptProps: { label: 'Elimina', severity: 'danger' },
    accept: async () => {
      try {
        await deleteSchedule(schedule.id)
        toast.add({ severity: 'success', summary: 'Programma eliminato', life: 3000 })
        await loadSchedules()
        await refreshStatus()
      } catch (err) {
        showError(err, 'Errore nella eliminazione')
      }
    },
  })
}

// ─── Actions: trigger ─────────────────────────────────────────────────────────

function triggerManualBackup(): void {
  if (!triggerIncludes.db && !triggerIncludes.media && !triggerIncludes.plugins && !triggerIncludes.config) {
    toast.add({ severity: 'warn', summary: 'Seleziona almeno un elemento', life: 3000 })
    return
  }
  const parts = includesLabel({ ...triggerIncludes })
  confirm.require({
    message:     `Verrà incluso: ${parts}. Avviare il backup adesso?`,
    header:      'Conferma backup',
    icon:        'pi pi-download',
    rejectProps: { label: 'Annulla', severity: 'secondary', outlined: true },
    acceptProps: { label: 'Esegui backup', icon: 'pi pi-download' },
    accept:      runManualBackup,
  })
}

async function runManualBackup(): Promise<void> {
  triggerRunning.value = true
  try {
    await triggerBackup({ includes: { ...triggerIncludes }, storageType: triggerStorageType.value })
    toast.add({ severity: 'info', summary: 'Backup avviato', detail: 'Il backup è in esecuzione in background.', life: 4000 })
    // Imposta isRunning ottimisticamente: se il backup finisce prima del prossimo poll
    // refreshStatus() vede wasRunning=true e mostra il toast di completamento.
    backupStatus.isRunning = true
    await refreshStatus()
  } catch (err) {
    showError(err, 'Errore nel avviare il backup')
  } finally {
    triggerRunning.value = false
  }
}

// ─── Actions: history ─────────────────────────────────────────────────────────

async function onPageChange(event: { page: number }): Promise<void> {
  history.page = event.page + 1
  await loadHistory()
}

async function handleDownload(entry: BackupHistoryEntry): Promise<void> {
  try {
    await downloadBackup(entry.id, entry.filename)
  } catch (err) {
    showError(err, 'Errore nel download')
  }
}

function confirmDeleteBackup(entry: BackupHistoryEntry): void {
  confirm.require({
    message:     `Eliminare il backup del ${formatDate(entry.createdAt)}?`,
    header:      'Conferma eliminazione',
    icon:        'pi pi-trash',
    rejectProps: { label: 'Annulla', severity: 'secondary', outlined: true },
    acceptProps: { label: 'Elimina', severity: 'danger' },
    accept: async () => {
      try {
        await deleteBackup(entry.id)
        toast.add({ severity: 'success', summary: 'Backup eliminato', life: 3000 })
        await loadHistory()
      } catch (err) {
        showError(err, 'Errore nella eliminazione')
      }
    },
  })
}

function confirmBulkDelete(): void {
  const count = selectedBackups.value.length
  confirm.require({
    message:     `Eliminare ${count} backup selezionati? L'operazione non è reversibile.`,
    header:      'Conferma eliminazione multipla',
    icon:        'pi pi-trash',
    rejectProps: { label: 'Annulla', severity: 'secondary', outlined: true },
    acceptProps: { label: `Elimina ${count}`, severity: 'danger' },
    accept:      executeBulkDelete,
  })
}

async function executeBulkDelete(): Promise<void> {
  bulkDeleting.value = true
  const toDelete = [...selectedBackups.value]
  const results = await Promise.allSettled(toDelete.map(e => deleteBackup(e.id)))
  const failed  = results.filter(r => r.status === 'rejected').length
  const deleted = results.length - failed

  selectedBackups.value = []

  if (deleted > 0) {
    toast.add({ severity: 'success', summary: `${deleted} backup eliminati`, life: 3000 })
  }
  if (failed > 0) {
    toast.add({ severity: 'error', summary: `${failed} eliminazioni fallite`, life: 5000 })
  }

  bulkDeleting.value = false
  await loadHistory()
}

// ─── Actions: restore ────────────────────────────────────────────────────────

function confirmRestore(entry: BackupHistoryEntry): void {
  restoreTarget.value        = entry
  restoreIncludes.db         = entry.includes.db
  restoreIncludes.media      = entry.includes.media
  restoreIncludes.plugins    = entry.includes.plugins
  restoreIncludes.config     = entry.includes.config
  restoreDialogVisible.value = true
}

async function executeRestore(): Promise<void> {
  if (!restoreTarget.value) return

  if (!restoreIncludes.db && !restoreIncludes.media && !restoreIncludes.plugins && !restoreIncludes.config) {
    toast.add({ severity: 'warn', summary: 'Seleziona almeno un elemento', life: 3000 })
    return
  }

  restoring.value = true
  try {
    const bootIdBefore = await captureBootId()

    showInitialPhase({
      title: 'Ripristino backup',
      steps: {
        initial:   { label: 'Ripristino dati', description: 'Sostituzione database e file in corso…' },
        reloading: { label: 'Ricarica pagina' },
      },
    })

    await restoreBackup(restoreTarget.value.id, { ...restoreIncludes })
    restoreDialogVisible.value = false

    pollUntilRestarted(bootIdBefore, {
      dialog:      {},
      onRestarted: () => { window.location.reload() },
      onTimeout:   () => {
        toast.add({ severity: 'warn', summary: 'Timeout', detail: 'Il server non risponde dopo 30s. Verifica i log.', life: 8000 })
      },
    })
  } catch (err) {
    cancelRestart()
    showError(err, 'Errore nel ripristino')
  } finally {
    restoring.value = false
  }
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatDate(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatSize(bytes: number): string {
  if (bytes < 1024)        return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function includesLabel(inc: BackupIncludes): string {
  const parts: string[] = []
  if (inc.db)      parts.push('DB')
  if (inc.media)   parts.push('Media')
  if (inc.plugins) parts.push('Plugin')
  if (inc.config)  parts.push('Config')
  return parts.join(' · ') || '—'
}

function intervalLabel(hours: number): string {
  return intervalOptions.find(o => o.value === hours)?.label ?? `${hours}h`
}

function statusLabel(status: string): string {
  return ({ running: 'In corso', success: 'Completato', error: 'Errore', failed: 'Fallito' } as Record<string, string>)[status] ?? status
}

function statusSeverity(status: string): string {
  return ({ running: 'info', success: 'success', error: 'danger', failed: 'danger' } as Record<string, string>)[status] ?? 'secondary'
}

function showError(err: unknown, prefix = 'Errore'): void {
  const msg = err instanceof ApiError ? err.message : (err instanceof Error ? err.message : 'Errore sconosciuto')
  toast.add({ severity: 'error', summary: prefix, detail: msg, life: 5000 })
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

onMounted(async () => {
  await loadAll()
  statusPoller = setInterval(refreshStatus, 3000)
})

onUnmounted(() => {
  if (statusPoller !== null) {
    clearInterval(statusPoller)
    statusPoller = null
  }
})
</script>
