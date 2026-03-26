<template>
  <div class="p-6 flex flex-col gap-6">
    <h2 class="text-2xl font-semibold">Plugin</h2>

    <div v-if="loading" class="text-surface-400 text-sm">Caricamento...</div>

    <!-- Banner riavvio in corso -->
    <div v-if="restarting" class="bg-blue-50 dark:bg-blue-900/20 border border-blue-300 dark:border-blue-700 rounded-xl p-4 text-blue-800 dark:text-blue-200 flex items-center gap-3">
      <span class="pi pi-spin pi-spinner" />
      <span>Riavvio del server in corso... L'admin si aggiornerà automaticamente.</span>
    </div>

    <div v-for="plugin in plugins" :key="plugin.name" class="bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-xl p-5 flex items-start justify-between gap-4">
      <div class="flex flex-col gap-1 min-w-0">
        <div class="flex items-center gap-3">
          <span class="font-semibold text-base">{{ plugin.name }}</span>
          <Tag
            :value="plugin.active ? 'ATTIVO' : 'INATTIVO'"
            :severity="plugin.active ? 'success' : 'secondary'"
          />
        </div>
        <div class="text-surface-400 text-sm">v{{ plugin.version }}</div>
        <div class="text-surface-600 dark:text-surface-300 text-sm">{{ plugin.description }}</div>
      </div>

      <div class="shrink-0">
        <Button
          v-if="!plugin.active"
          label="Attiva"
          severity="success"
          size="small"
          :loading="activating === plugin.name"
          :disabled="restarting"
          @click="activate(plugin.name)"
        />
        <Button
          v-else
          label="Disattiva"
          severity="warning"
          size="small"
          :loading="activating === plugin.name"
          :disabled="restarting"
          @click="confirmDeactivate(plugin.name)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import { pluginsApi } from '@/api/plugins.js'
import { useAppStore } from '@/stores/app.js'
import type { PluginStatus } from '@/api/plugins.js'

const confirm  = useConfirm()
const toast    = useToast()
const appStore = useAppStore()

const loading    = ref(false)
const activating = ref<string | null>(null)
const plugins    = ref<PluginStatus[]>([])
const restarting = ref(false)

let pollTimer: ReturnType<typeof setTimeout> | null = null
let pollStart  = 0
const POLL_INTERVAL = 2000
const POLL_TIMEOUT  = 30_000

async function loadPlugins() {
  loading.value = true
  try {
    plugins.value = await pluginsApi.list()
  } finally {
    loading.value = false
  }
}

function startRestartPolling() {
  restarting.value = true
  pollStart        = Date.now()
  schedulePoll()
}

function schedulePoll() {
  pollTimer = setTimeout(async () => {
    if (!restarting.value) return

    if (Date.now() - pollStart > POLL_TIMEOUT) {
      restarting.value = false
      toast.add({ severity: 'warn', summary: 'Timeout', detail: 'Il server non risponde dopo 30s. Verifica i log.', life: 6000 })
      return
    }

    const alive = await pluginsApi.isAlive()
    if (alive) {
      restarting.value = false
      activating.value = null
      await appStore.reset()
      await appStore.load()
      await loadPlugins()
      toast.add({ severity: 'success', summary: 'Pronto', detail: 'Server riavviato. Plugin aggiornati.', life: 4000 })
    } else {
      schedulePoll()
    }
  }, POLL_INTERVAL)
}

async function activate(name: string) {
  activating.value = name
  const plugin = plugins.value.find(p => p.name === name)
  if (plugin) plugin.active = true
  try {
    await pluginsApi.activate(name)
    startRestartPolling()
  } catch {
    if (plugin) plugin.active = false
    activating.value = null
    toast.add({ severity: 'error', summary: 'Errore', detail: 'Impossibile attivare il plugin', life: 3000 })
  }
}

function confirmDeactivate(name: string) {
  confirm.require({
    message:     'Il plugin verrà disattivato e il server riavviato automaticamente.',
    header:      'Disattiva plugin',
    icon:        'pi pi-exclamation-triangle',
    rejectLabel: 'Annulla',
    acceptLabel: 'Disattiva',
    acceptClass: 'p-button-warning',
    accept: async () => {
      activating.value = name
      try {
        await pluginsApi.deactivate(name)
        startRestartPolling()
      } catch {
        activating.value = null
        toast.add({ severity: 'error', summary: 'Errore', detail: 'Impossibile disattivare il plugin', life: 3000 })
      }
    },
  })
}

onMounted(loadPlugins)
onUnmounted(() => { if (pollTimer) clearTimeout(pollTimer) })
</script>
