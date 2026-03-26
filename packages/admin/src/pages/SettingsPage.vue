<template>
  <div class="p-6 max-w-3xl mx-auto flex flex-col gap-6">
    <h1 class="text-2xl font-bold">Impostazioni</h1>

    <!-- Tab bar -->
    <div class="flex border-b border-surface-200 dark:border-surface-700">
      <button
        v-for="tab in TABS"
        :key="tab.id"
        :class="tabClass(tab.id)"
        @click="activeTab = tab.id"
      >
        <i :class="tab.icon + ' text-sm'" />
        {{ tab.label }}
      </button>
    </div>

    <!-- ── Aspetto ── -->
    <div v-if="activeTab === 'aspetto'" class="flex flex-col gap-4">
      <div class="bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-xl p-6 flex flex-col gap-4">
        <h2 class="font-semibold">Tema</h2>
        <div class="flex items-center justify-between">
          <div>
            <p class="font-medium">Modalità scura</p>
            <p class="text-sm text-surface-500">Passa tra tema chiaro e tema scuro</p>
          </div>
          <ToggleSwitch :model-value="themeStore.isDark" @update:model-value="themeStore.toggleDark()" />
        </div>
      </div>
    </div>

    <!-- ── Struttura ── -->
    <div v-else-if="activeTab === 'struttura'" class="flex flex-col gap-8">

      <!-- Codici -->
      <section class="flex flex-col gap-3">
        <h2 class="font-semibold flex items-center gap-2">
          <i class="pi pi-file-edit text-primary-500" />
          Codici
          <Tag :value="String(appStore.codices.length)" severity="secondary" />
        </h2>

        <div v-if="appStore.codices.length === 0" class="text-sm text-surface-400 italic">
          Nessun codex registrato.
        </div>

        <Panel
          v-for="cx in appStore.codices"
          :key="cx.name"
          toggleable
        >
          <template #header>
            <div class="flex items-center gap-3">
              <i :class="cxIcon(cx.icon) + ' text-primary-400'" />
              <span class="font-semibold">{{ cx.label }}</span>
              <Tag :value="cx.name" severity="secondary" class="font-mono text-xs" />
            </div>
          </template>

          <div class="flex flex-col gap-5">
            <!-- Stages -->
            <div v-if="cx.stages?.length">
              <p class="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2">Stages</p>
              <div class="flex flex-wrap gap-2">
                <div
                  v-for="s in cx.stages"
                  :key="s.name"
                  class="flex items-center gap-1.5 bg-surface-100 dark:bg-surface-800 rounded-lg px-3 py-1.5 text-sm"
                >
                  <span class="font-medium">{{ s.label }}</span>
                  <span class="text-surface-400 font-mono text-xs">{{ s.name }}</span>
                  <Tag v-if="s.initial" value="iniziale" severity="success" class="text-xs" />
                  <Tag v-if="s.final"   value="finale"   severity="secondary" class="text-xs" />
                </div>
              </div>
            </div>

            <!-- Blueprint -->
            <div v-if="cx.blueprint?.length">
              <p class="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2">Blueprint campi</p>
              <DataTable :value="cx.blueprint" size="small" class="text-sm">
                <Column field="name" header="Nome">
                  <template #body="{ data }">
                    <span class="font-mono text-xs">{{ data.name }}</span>
                  </template>
                </Column>
                <Column field="label" header="Label" />
                <Column field="type" header="Tipo" class="w-32">
                  <template #body="{ data }">
                    <Tag :value="data.type" :severity="fieldTypeSeverity(data.type)" class="text-xs" />
                  </template>
                </Column>
                <Column header="Flag" class="w-40">
                  <template #body="{ data }">
                    <div class="flex gap-1 flex-wrap">
                      <Tag v-if="data.required"     value="required"  severity="danger"    class="text-xs" />
                      <Tag v-if="data.queryable"    value="queryable" severity="info"       class="text-xs" />
                      <Tag v-if="data.translatable" value="i18n"      severity="warn"       class="text-xs" />
                    </div>
                  </template>
                </Column>
              </DataTable>
            </div>
            <div v-else class="text-sm text-surface-400 italic">Nessun campo nel blueprint.</div>
          </div>
        </Panel>
      </section>

      <!-- Vocabolari -->
      <section class="flex flex-col gap-3">
        <h2 class="font-semibold flex items-center gap-2">
          <i class="pi pi-tags text-primary-500" />
          Vocabolari
          <Tag :value="String(appStore.vocabularies.length)" severity="secondary" />
        </h2>

        <div v-if="appStore.vocabularies.length === 0" class="text-sm text-surface-400 italic">
          Nessun vocabolario registrato.
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div
            v-for="voc in appStore.vocabularies"
            :key="voc.slug"
            class="bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-xl p-4 flex flex-col gap-3"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="font-semibold">{{ voc.name }}</span>
              <Tag :value="voc.slug" severity="secondary" class="font-mono text-xs shrink-0" />
            </div>
            <div class="flex flex-wrap gap-1.5">
              <Tag
                :value="voc.hierarchical ? 'gerarchico' : 'flat'"
                :severity="voc.hierarchical ? 'info' : 'secondary'"
                class="text-xs"
              />
              <Tag
                v-for="cx in voc.codices"
                :key="cx"
                :value="cx"
                severity="secondary"
                class="font-mono text-xs"
              />
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- ── Sistema ── -->
    <div v-else-if="activeTab === 'sistema'" class="flex flex-col gap-4">

      <!-- Contatori -->
      <div class="grid grid-cols-3 gap-3">
        <div
          v-for="stat in systemStats"
          :key="stat.label"
          class="bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-xl p-4 text-center"
        >
          <p class="text-3xl font-bold text-primary-500">{{ stat.value }}</p>
          <p class="text-xs text-surface-500 mt-1">{{ stat.label }}</p>
        </div>
      </div>

      <!-- Plugin -->
      <div class="bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-xl p-5 flex flex-col gap-1">
        <h2 class="text-sm font-semibold text-surface-400 uppercase tracking-wider mb-3">Plugin registrati</h2>
        <div v-if="appStore.plugins.length === 0" class="text-sm text-surface-400 italic">
          Nessun plugin registrato.
        </div>
        <div
          v-for="p in appStore.plugins"
          :key="p.name"
          class="flex items-center justify-between py-2.5 border-b border-surface-100 dark:border-surface-800 last:border-0"
        >
          <div class="flex flex-col gap-0.5 min-w-0">
            <span class="text-sm font-medium font-mono">{{ p.name }}</span>
            <span class="text-xs text-surface-400 truncate">{{ p.description }}</span>
          </div>
          <div class="flex items-center gap-2 shrink-0 ml-3">
            <span class="text-xs text-surface-400">v{{ p.version }}</span>
            <Tag
              :value="p.active ? 'attivo' : 'inattivo'"
              :severity="p.active ? 'success' : 'secondary'"
            />
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useThemeStore } from '@/stores/theme.js'
import { useAppStore } from '@/stores/app.js'
import type { FieldDefinition } from '@/stores/app.js'

const themeStore = useThemeStore()
const appStore   = useAppStore()

type TabId = 'aspetto' | 'struttura' | 'sistema'

const TABS = [
  { id: 'aspetto'   as TabId, label: 'Aspetto',   icon: 'pi pi-palette' },
  { id: 'struttura' as TabId, label: 'Struttura', icon: 'pi pi-sitemap' },
  { id: 'sistema'   as TabId, label: 'Sistema',   icon: 'pi pi-server'  },
]

const activeTab = ref<TabId>('aspetto')

function tabClass(id: TabId): string {
  const active = activeTab.value === id
  return [
    'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
    active
      ? 'border-primary-500 text-primary-500'
      : 'border-transparent text-surface-500 hover:text-surface-700 dark:hover:text-surface-300',
  ].join(' ')
}

function cxIcon(icon?: string): string {
  if (!icon) return 'pi pi-file'
  return icon.startsWith('pi ') ? icon : `pi ${icon}`
}

type Severity = 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast'

function fieldTypeSeverity(type: FieldDefinition['type']): Severity {
  const map: Partial<Record<FieldDefinition['type'], Severity>> = {
    number:       'info',
    boolean:      'warn',
    richtext:     'success',
    date:         'contrast',
    image:        'success',
    relationship: 'info',
    repeater:     'warn',
  }
  return map[type] ?? 'secondary'
}

const systemStats = computed(() => [
  { label: 'Codici',             value: appStore.codices.length },
  { label: 'Vocabolari',         value: appStore.vocabularies.length },
  { label: 'Plugin attivi',      value: `${appStore.plugins.filter(p => p.active).length}/${appStore.plugins.length}` },
])
</script>
