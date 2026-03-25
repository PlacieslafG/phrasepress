<template>
  <div class="p-6 flex flex-col gap-6">
    <div class="flex items-center justify-between">
      <h2 class="text-2xl font-semibold">DB Monitor</h2>
      <div class="flex items-center gap-2">
        <!-- Live interval selector (visible only when live is on) -->
        <Select
          v-if="liveEnabled"
          v-model="liveInterval"
          :options="INTERVAL_OPTIONS"
          option-label="label"
          option-value="value"
          size="small"
          class="w-32"
          @change="restartLive"
        />
        <!-- Live toggle -->
        <button
          class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors select-none"
          :class="liveEnabled
            ? 'bg-green-500/10 border-green-500/40 text-green-600 dark:text-green-400 hover:bg-green-500/20'
            : 'bg-surface-0 dark:bg-surface-900 border-surface-200 dark:border-surface-700 text-surface-500 hover:bg-surface-50 dark:hover:bg-surface-800'"
          @click="toggleLive"
        >
          <span
            class="inline-block w-2 h-2 rounded-full"
            :class="liveEnabled ? 'bg-green-500 animate-pulse' : 'bg-surface-400'"
          />
          {{ liveEnabled ? 'Live ON' : 'Live' }}
        </button>
        <!-- Manual refresh -->
        <Button icon="pi pi-refresh" severity="secondary" size="small" :loading="refreshing" @click="refresh" v-tooltip.bottom="'Aggiorna ora'" />
      </div>
    </div>

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

    <!-- ─── Tab: Indici ──────────────────────────────────────────────────────── -->
    <div v-if="activeTab === 'indexes'">
      <div v-if="loadingIndexes" class="text-surface-400 text-sm">Caricamento...</div>

      <div v-else-if="indexes" class="flex flex-col gap-4">
        <!-- Summary badges -->
        <div class="flex gap-3 flex-wrap">
          <div class="bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-lg px-4 py-2 text-sm">
            <span class="font-semibold">{{ indexes.tables.length }}</span>
            <span class="text-surface-400 ml-1">tabelle</span>
          </div>
          <div class="bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-lg px-4 py-2 text-sm">
            <span class="font-semibold">{{ totalIndexCount }}</span>
            <span class="text-surface-400 ml-1">indici totali</span>
          </div>
          <div
            class="rounded-lg px-4 py-2 text-sm"
            :class="totalUnindexed > 0
              ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700'
              : 'bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-700'"
          >
            <span class="font-semibold" :class="totalUnindexed > 0 ? 'text-amber-700 dark:text-amber-300' : ''">
              {{ totalUnindexed }}
            </span>
            <span class="text-surface-400 ml-1">colonne senza indice</span>
          </div>
        </div>

        <!-- Tables -->
        <div
          v-for="table in indexes.tables"
          :key="table.name"
          class="bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-xl overflow-hidden"
        >
          <!-- Table header -->
          <button
            class="w-full flex items-center justify-between px-5 py-3 hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors"
            @click="toggleTable(table.name)"
          >
            <div class="flex items-center gap-3">
              <i class="pi pi-table text-sm text-surface-400" />
              <span class="font-semibold text-sm font-mono">{{ table.name }}</span>
              <Tag value="PK" severity="info" class="text-xs" />
              <span class="text-xs text-surface-400">{{ table.columns.length }} col · {{ table.indexes.length }} idx</span>
              <Tag
                v-if="table.unindexedColumns.length > 0"
                :value="`${table.unindexedColumns.length} senza indice`"
                severity="warn"
                class="text-xs"
              />
            </div>
            <i class="pi text-surface-400 text-xs" :class="expandedTables.has(table.name) ? 'pi-chevron-up' : 'pi-chevron-down'" />
          </button>

          <!-- Columns list (expanded) -->
          <div v-if="expandedTables.has(table.name)">
            <div class="border-t border-surface-200 dark:border-surface-700">
              <table class="w-full text-sm">
                <thead>
                  <tr class="bg-surface-50 dark:bg-surface-800 text-xs text-surface-400 uppercase">
                    <th class="text-left px-5 py-2 font-medium">Colonna</th>
                    <th class="text-left px-5 py-2 font-medium">Tipo</th>
                    <th class="text-left px-5 py-2 font-medium">Vincoli</th>
                    <th class="text-left px-5 py-2 font-medium">Indice</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="col in table.columns"
                    :key="col.name"
                    class="border-t border-surface-100 dark:border-surface-700"
                    :class="!col.indexed ? 'bg-amber-50/40 dark:bg-amber-900/10' : ''"
                  >
                    <td class="px-5 py-2 font-mono">{{ col.name }}</td>
                    <td class="px-5 py-2 text-surface-400 font-mono text-xs">{{ col.type || '—' }}</td>
                    <td class="px-5 py-2">
                      <div class="flex gap-1 flex-wrap">
                        <Tag v-if="col.pk" value="PK" severity="info" />
                        <Tag v-if="col.notNull && !col.pk" value="NOT NULL" severity="secondary" />
                      </div>
                    </td>
                    <td class="px-5 py-2">
                      <div v-if="col.indexed" class="flex items-center gap-2">
                        <i class="pi pi-check-circle text-green-500 text-sm" />
                        <span class="text-xs text-surface-400 font-mono">{{ col.indexName ?? 'PK' }}</span>
                        <Tag v-if="col.unique && !col.pk" value="UNIQUE" severity="success" />
                      </div>
                      <div v-else class="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                        <i class="pi pi-exclamation-triangle text-sm" />
                        <span class="text-xs">nessun indice</span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Indexes detail -->
            <div v-if="table.indexes.length > 0" class="border-t border-surface-200 dark:border-surface-700 px-5 py-3 bg-surface-50 dark:bg-surface-800">
              <p class="text-xs font-semibold text-surface-400 uppercase mb-2">Indici definiti</p>
              <div class="flex flex-wrap gap-2">
                <div
                  v-for="idx in table.indexes"
                  :key="idx.name"
                  class="flex items-center gap-1.5 bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-lg px-3 py-1 text-xs font-mono"
                >
                  <i class="pi pi-key text-primary text-xs" />
                  <span>{{ idx.name }}</span>
                  <Tag v-if="idx.unique" value="UNIQUE" severity="success" />
                  <span class="text-surface-400">({{ idx.columns.join(', ') }})</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ─── Tab: Statistiche DB ──────────────────────────────────────────────── -->
    <div v-if="activeTab === 'stats'">
      <div v-if="loadingStats" class="text-surface-400 text-sm">Caricamento...</div>

      <div v-else-if="dbStats" class="flex flex-col gap-6">
        <!-- DB info cards -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-xl p-4 flex flex-col gap-1">
            <span class="text-xs text-surface-400 uppercase font-medium">Dimensione totale</span>
            <span class="text-2xl font-bold">{{ dbStats.totalSizeKb }} KB</span>
          </div>
          <div class="bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-xl p-4 flex flex-col gap-1">
            <span class="text-xs text-surface-400 uppercase font-medium">Pagine DB</span>
            <span class="text-2xl font-bold">{{ dbStats.pageCount }}</span>
            <span class="text-xs text-surface-400">{{ dbStats.pageSize }} bytes / pagina</span>
          </div>
          <div class="bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-xl p-4 flex flex-col gap-1">
            <span class="text-xs text-surface-400 uppercase font-medium">WAL mode</span>
            <div class="flex items-center gap-2 mt-1">
              <i class="pi text-lg" :class="dbStats.walMode ? 'pi-check-circle text-green-500' : 'pi-times-circle text-red-500'" />
              <span class="font-semibold">{{ dbStats.walMode ? 'Attivo' : 'Non attivo' }}</span>
            </div>
          </div>
          <div class="bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-xl p-4 flex flex-col gap-1">
            <span class="text-xs text-surface-400 uppercase font-medium">Foreign keys</span>
            <div class="flex items-center gap-2 mt-1">
              <i class="pi text-lg" :class="dbStats.foreignKeys ? 'pi-check-circle text-green-500' : 'pi-times-circle text-red-500'" />
              <span class="font-semibold">{{ dbStats.foreignKeys ? 'ON' : 'OFF' }}</span>
            </div>
          </div>
        </div>

        <!-- Row counts table -->
        <div class="bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-xl overflow-hidden">
          <div class="px-5 py-3 border-b border-surface-200 dark:border-surface-700">
            <h3 class="text-sm font-semibold">Righe per tabella</h3>
          </div>
          <DataTable :value="dbStats.tables" class="text-sm">
            <Column field="name" header="Tabella">
              <template #body="{ data }">
                <span class="font-mono text-sm">{{ data.name }}</span>
              </template>
            </Column>
            <Column field="rowCount" header="Righe" style="width: 140px">
              <template #body="{ data }">
                <span class="font-semibold">{{ data.rowCount.toLocaleString('it-IT') }}</span>
              </template>
            </Column>
            <Column header="Occupazione relativa" style="width: 240px">
              <template #body="{ data }">
                <div class="flex items-center gap-2">
                  <div class="flex-1 bg-surface-100 dark:bg-surface-700 rounded-full h-1.5 overflow-hidden">
                    <div
                      class="h-full bg-primary rounded-full"
                      :style="{ width: `${rowCountPercent(data.rowCount)}%` }"
                    />
                  </div>
                  <span class="text-xs text-surface-400 w-10 text-right">{{ rowCountPercent(data.rowCount).toFixed(0) }}%</span>
                </div>
              </template>
            </Column>
          </DataTable>
        </div>
      </div>
    </div>

    <!-- ─── Tab: Query Log ───────────────────────────────────────────────────── -->
    <div v-if="activeTab === 'queries'">
      <div v-if="loadingLog" class="text-surface-400 text-sm">Caricamento...</div>

      <div v-else-if="queryLog" class="flex flex-col gap-6">
        <!-- Stats cards -->
        <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div class="bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-xl p-4 flex flex-col gap-1">
            <span class="text-xs text-surface-400 uppercase font-medium">Query totali</span>
            <span class="text-2xl font-bold">{{ queryLog.stats.count.toLocaleString('it-IT') }}</span>
          </div>
          <div class="bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-xl p-4 flex flex-col gap-1">
            <span class="text-xs text-surface-400 uppercase font-medium">Media</span>
            <span class="text-2xl font-bold">{{ queryLog.stats.avgMs }} <span class="text-sm font-normal text-surface-400">ms</span></span>
          </div>
          <div class="bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-xl p-4 flex flex-col gap-1">
            <span class="text-xs text-surface-400 uppercase font-medium">P50 (mediana)</span>
            <span class="text-2xl font-bold">{{ queryLog.stats.p50Ms }} <span class="text-sm font-normal text-surface-400">ms</span></span>
          </div>
          <div
            class="rounded-xl p-4 flex flex-col gap-1 border"
            :class="queryLog.stats.p95Ms > 500
              ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700'
              : 'bg-surface-0 dark:bg-surface-900 border-surface-200 dark:border-surface-700'"
          >
            <span class="text-xs text-surface-400 uppercase font-medium">P95</span>
            <span
              class="text-2xl font-bold"
              :class="queryLog.stats.p95Ms > 500 ? 'text-amber-600 dark:text-amber-300' : ''"
            >
              {{ queryLog.stats.p95Ms }} <span class="text-sm font-normal text-surface-400">ms</span>
            </span>
          </div>
          <div
            class="rounded-xl p-4 flex flex-col gap-1 border"
            :class="queryLog.stats.maxMs > 1000
              ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700'
              : 'bg-surface-0 dark:bg-surface-900 border-surface-200 dark:border-surface-700'"
          >
            <span class="text-xs text-surface-400 uppercase font-medium">Max</span>
            <span
              class="text-2xl font-bold"
              :class="queryLog.stats.maxMs > 1000 ? 'text-red-600 dark:text-red-400' : ''"
            >
              {{ queryLog.stats.maxMs }} <span class="text-sm font-normal text-surface-400">ms</span>
            </span>
          </div>
        </div>

        <!-- Empty state -->
        <div
          v-if="queryLog.stats.count === 0"
          class="bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-xl p-10 text-center text-surface-400"
        >
          <i class="pi pi-chart-bar text-3xl mb-3 block" />
          <p class="text-sm">Nessuna query loggata ancora.</p>
          <p class="text-xs mt-1">Le query vengono registrate automaticamente dall'admin UI.</p>
        </div>

        <template v-else>
          <!-- Controls -->
          <div class="flex items-center justify-between gap-4">
            <div class="flex items-center gap-2">
              <span class="text-sm text-surface-400">Ordina per:</span>
              <Select
                v-model="logSort"
                :options="SORT_OPTIONS"
                option-label="label"
                option-value="value"
                size="small"
                class="w-44"
                @change="loadQueryLog"
              />
            </div>
            <Button
              icon="pi pi-trash"
              label="Svuota log"
              severity="danger"
              size="small"
              outlined
              @click="confirmClear"
            />
          </div>

          <!-- Query log table -->
          <div class="bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-xl overflow-hidden">
            <DataTable :value="queryLog.data" class="text-sm">
              <Column header="Metodo" style="width: 90px">
                <template #body="{ data }">
                  <Tag
                    :value="data.method"
                    :severity="methodSeverity(data.method)"
                  />
                </template>
              </Column>
              <Column field="url" header="URL">
                <template #body="{ data }">
                  <span class="font-mono text-xs">{{ data.url }}</span>
                </template>
              </Column>
              <Column header="Durata" style="width: 120px">
                <template #body="{ data }">
                  <span
                    class="font-semibold"
                    :class="durationClass(data.durationMs)"
                  >
                    {{ data.durationMs }} ms
                  </span>
                </template>
              </Column>
              <Column header="Status" style="width: 90px">
                <template #body="{ data }">
                  <Tag
                    v-if="data.statusCode"
                    :value="String(data.statusCode)"
                    :severity="statusSeverity(data.statusCode)"
                  />
                  <span v-else class="text-surface-400 text-xs">—</span>
                </template>
              </Column>
              <Column header="Data" style="width: 160px">
                <template #body="{ data }">
                  <span class="text-xs text-surface-400">{{ formatDate(data.createdAt) }}</span>
                </template>
              </Column>
              <template #empty>
                <div class="text-center text-surface-400 text-sm py-6">Nessuna entry.</div>
              </template>
            </DataTable>
          </div>

          <!-- Pagination -->
          <div v-if="queryLog.total > logLimit" class="flex items-center justify-between text-sm text-surface-400">
            <span>{{ queryLog.total }} query totali</span>
            <div class="flex gap-2">
              <Button
                icon="pi pi-chevron-left"
                severity="secondary"
                size="small"
                outlined
                :disabled="logPage <= 1"
                @click="logPage--; loadQueryLog()"
              />
              <span class="px-2 py-1">{{ logPage }} / {{ totalLogPages }}</span>
              <Button
                icon="pi pi-chevron-right"
                severity="secondary"
                size="small"
                outlined
                :disabled="logPage >= totalLogPages"
                @click="logPage++; loadQueryLog()"
              />
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>

  <ConfirmDialog />
  <Toast />
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import {
  getIndexes,
  getTableStats,
  getQueryLog,
  clearQueryLog,
  type IndexAnalysisResult,
  type DbStats,
  type QueryLogResponse,
  type QueryLogSort,
} from '@/api/db-monitor.js'
import { ApiError, setQueryTracking } from '@/api/client.js'

// ─── State ────────────────────────────────────────────────────────────────────

const toast   = useToast()
const confirm = useConfirm()

type TabId = 'indexes' | 'stats' | 'queries'

const TABS = [
  { id: 'indexes' as TabId,  label: 'Indici',         icon: 'pi pi-key' },
  { id: 'stats'   as TabId,  label: 'Statistiche DB',  icon: 'pi pi-chart-bar' },
  { id: 'queries' as TabId,  label: 'Query Log',       icon: 'pi pi-history' },
]

const SORT_OPTIONS = [
  { label: 'Più lente prima',  value: 'slowest' },
  { label: 'Più veloci prima', value: 'fastest' },
  { label: 'Più recenti',      value: 'newest' },
  { label: 'Meno recenti',     value: 'oldest' },
]

const activeTab      = ref<TabId>('indexes')
const refreshing     = ref(false)
const expandedTables = ref(new Set<string>())

// Live refresh
const INTERVAL_OPTIONS = [
  { label: '2 sec',  value: 2000 },
  { label: '5 sec',  value: 5000 },
  { label: '10 sec', value: 10000 },
  { label: '30 sec', value: 30000 },
]
const liveEnabled  = ref(false)
const liveInterval = ref(5000)
let   liveTimer: ReturnType<typeof setInterval> | null = null

// Indexes
const indexes      = ref<IndexAnalysisResult | null>(null)
const loadingIndexes = ref(false)

// Stats
const dbStats      = ref<DbStats | null>(null)
const loadingStats = ref(false)

// Query log
const queryLog     = ref<QueryLogResponse | null>(null)
const loadingLog   = ref(false)
const logPage      = ref(1)
const logLimit     = 50
const logSort      = ref<QueryLogSort>('newest')

// ─── Computed ─────────────────────────────────────────────────────────────────

const totalIndexCount = computed(() =>
  indexes.value?.tables.reduce((sum, t) => sum + t.indexes.length, 0) ?? 0
)

const totalUnindexed = computed(() =>
  indexes.value?.tables.reduce((sum, t) => sum + t.unindexedColumns.length, 0) ?? 0
)

const maxRowCount = computed(() =>
  Math.max(1, ...(dbStats.value?.tables.map(t => t.rowCount) ?? [1]))
)

const totalLogPages = computed(() =>
  queryLog.value ? Math.max(1, Math.ceil(queryLog.value.total / logLimit)) : 1
)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rowCountPercent(count: number): number {
  return maxRowCount.value === 0 ? 0 : (count / maxRowCount.value) * 100
}

function toggleTable(name: string): void {
  if (expandedTables.value.has(name)) {
    expandedTables.value.delete(name)
  } else {
    expandedTables.value.add(name)
  }
}

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleString('it-IT', {
    day:    '2-digit',
    month:  '2-digit',
    year:   '2-digit',
    hour:   '2-digit',
    minute: '2-digit',
  })
}

function durationClass(ms: number): string {
  if (ms > 1000) return 'text-red-600 dark:text-red-400'
  if (ms > 300)  return 'text-amber-600 dark:text-amber-400'
  return 'text-green-600 dark:text-green-400'
}

function methodSeverity(method: string): 'info' | 'success' | 'warn' | 'danger' | 'secondary' {
  const map: Record<string, 'info' | 'success' | 'warn' | 'danger' | 'secondary'> = {
    GET:    'info',
    POST:   'success',
    PUT:    'warn',
    PATCH:  'warn',
    DELETE: 'danger',
  }
  return map[method] ?? 'secondary'
}

function statusSeverity(code: number): 'success' | 'warn' | 'danger' | 'secondary' {
  if (code >= 500) return 'danger'
  if (code >= 400) return 'warn'
  if (code >= 200) return 'success'
  return 'secondary'
}

// ─── Data loading ─────────────────────────────────────────────────────────────

async function loadIndexes(): Promise<void> {
  loadingIndexes.value = true
  try {
    indexes.value = await getIndexes()
  } catch (err) {
    if (err instanceof ApiError) {
      toast.add({ severity: 'error', summary: 'Errore', detail: err.message, life: 4000 })
    }
  } finally {
    loadingIndexes.value = false
  }
}

async function loadStats(): Promise<void> {
  loadingStats.value = true
  try {
    dbStats.value = await getTableStats()
  } catch (err) {
    if (err instanceof ApiError) {
      toast.add({ severity: 'error', summary: 'Errore', detail: err.message, life: 4000 })
    }
  } finally {
    loadingStats.value = false
  }
}

async function loadQueryLog(): Promise<void> {
  loadingLog.value = true
  try {
    queryLog.value = await getQueryLog({ page: logPage.value, limit: logLimit, sort: logSort.value })
  } catch (err) {
    if (err instanceof ApiError) {
      toast.add({ severity: 'error', summary: 'Errore', detail: err.message, life: 4000 })
    }
  } finally {
    loadingLog.value = false
  }
}

async function refresh(): Promise<void> {
  refreshing.value = true
  await Promise.all([loadIndexes(), loadStats(), loadQueryLog()])
  refreshing.value = false
}

function startLive(): void {
  liveTimer = setInterval(refresh, liveInterval.value)
}

function stopLive(): void {
  if (liveTimer !== null) {
    clearInterval(liveTimer)
    liveTimer = null
  }
}

function toggleLive(): void {
  liveEnabled.value = !liveEnabled.value
  if (liveEnabled.value) {
    startLive()
  } else {
    stopLive()
  }
}

function restartLive(): void {
  if (liveEnabled.value) {
    stopLive()
    startLive()
  }
}

function confirmClear(): void {
  confirm.require({
    message: 'Eliminare tutte le query registrate nel log?',
    header:  'Svuota query log',
    icon:    'pi pi-exclamation-triangle',
    rejectLabel:  'Annulla',
    acceptLabel:  'Svuota',
    acceptClass:  'p-button-danger',
    accept: async () => {
      try {
        const result = await clearQueryLog()
        toast.add({ severity: 'success', summary: 'Log svuotato', detail: `${result.deleted} entry eliminate`, life: 3000 })
        await loadQueryLog()
      } catch (err) {
        if (err instanceof ApiError) {
          toast.add({ severity: 'error', summary: 'Errore', detail: err.message, life: 4000 })
        }
      }
    },
  })
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

onMounted(() => {
  setQueryTracking(true)
  loadIndexes()
  loadStats()
  loadQueryLog()
})

onUnmounted(() => {
  setQueryTracking(false)
  stopLive()
})
</script>
