<template>
  <div class="p-6 flex flex-col gap-6">
    <h2 class="text-2xl font-semibold">Plugin</h2>

    <div v-if="loading" class="text-surface-400 text-sm">Caricamento...</div>

    <!-- Banner restart -->
    <div v-if="showRestartBanner" class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded-xl p-4 text-yellow-800 dark:text-yellow-200 flex items-center gap-3">
      <span class="pi pi-exclamation-triangle" />
      <span>{{ restartBannerMessage }}</span>
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
          @click="activate(plugin.name)"
        />
        <Button
          v-else
          label="Disattiva"
          severity="warning"
          size="small"
          :loading="activating === plugin.name"
          @click="confirmDeactivate(plugin.name)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import { pluginsApi } from '@/api/plugins.js'
import { useAppStore } from '@/stores/app.js'
import type { PluginStatus } from '@/api/plugins.js'

const confirm  = useConfirm()
const toast    = useToast()
const appStore = useAppStore()

const loading              = ref(false)
const activating           = ref<string | null>(null)
const plugins              = ref<PluginStatus[]>([])
const showRestartBanner    = ref(false)
const restartBannerMessage = ref('')

async function loadPlugins() {
  loading.value = true
  try {
    plugins.value = await pluginsApi.list()
  } finally {
    loading.value = false
  }
}

async function activate(name: string) {
  activating.value = name
  // Aggiornamento ottimista
  const plugin = plugins.value.find(p => p.name === name)
  if (plugin) plugin.active = true
  try {
    await pluginsApi.activate(name)
    appStore.reset()
    await appStore.load()
    showRestartBanner.value    = true
    restartBannerMessage.value = 'Plugin attivato. Riavvia il server per caricare le sue route e funzionalità.'
    toast.add({ severity: 'warn', summary: 'Riavvio necessario', detail: 'Riavvia il server per completare l\'attivazione.', life: 6000 })
    await loadPlugins()
  } catch {
    if (plugin) plugin.active = false
    toast.add({ severity: 'error', summary: 'Errore', detail: 'Impossibile attivare il plugin', life: 3000 })
  } finally {
    activating.value = null
  }
}

function confirmDeactivate(name: string) {
  confirm.require({
    message:     'Il plugin verrà disattivato. Alcune funzionalità potrebbero smettere di funzionare. Richiede riavvio del server per rimozione completa.',
    header:      'Disattiva plugin',
    icon:        'pi pi-exclamation-triangle',
    rejectLabel: 'Annulla',
    acceptLabel: 'Disattiva',
    acceptClass: 'p-button-warning',
    accept: async () => {
      activating.value = name
      try {
        await pluginsApi.deactivate(name)
        showRestartBanner.value    = true
        restartBannerMessage.value = 'Plugin disattivato. Riavvia il server per la rimozione completa dei suoi hook.'
        await loadPlugins()
      } catch {
        toast.add({ severity: 'error', summary: 'Errore', detail: 'Impossibile disattivare il plugin', life: 3000 })
      } finally {
        activating.value = null
      }
    },
  })
}

onMounted(loadPlugins)
</script>
