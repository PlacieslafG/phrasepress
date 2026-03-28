<template>
  <Dialog
    v-model:visible="dialogVisible"
    :header="dialogTitle"
    modal
    :closable="false"
    :close-on-escape="false"
    :style="{ width: '400px' }"
  >
    <div class="flex flex-col gap-5 py-2">

      <!-- Step 1: initial (opzionale — mostrato solo se configurato) -->
      <template v-if="dialogSteps.initial">
        <div class="flex items-center gap-3">
          <i v-if="dialogPhase === 'initial'" class="pi pi-spin pi-spinner text-primary text-xl shrink-0" />
          <i v-else class="pi pi-check-circle text-green-500 text-xl shrink-0" />
          <div>
            <p class="text-sm font-medium">{{ dialogSteps.initial.label }}</p>
            <p v-if="dialogPhase === 'initial' && dialogSteps.initial.description"
               class="text-xs text-surface-400">{{ dialogSteps.initial.description }}</p>
          </div>
        </div>
      </template>

      <!-- Step 2: restarting -->
      <div class="flex items-center gap-3"
           :class="dialogPhase === 'initial' ? 'opacity-40' : ''">
        <i v-if="dialogPhase === 'restarting'" class="pi pi-spin pi-spinner text-primary text-xl shrink-0" />
        <i v-else-if="dialogPhase === 'reloading'" class="pi pi-check-circle text-green-500 text-xl shrink-0" />
        <i v-else class="pi pi-circle text-surface-300 dark:text-surface-600 text-xl shrink-0" />
        <div>
          <p class="text-sm font-medium">{{ dialogSteps.restarting?.label ?? 'Riavvio server' }}</p>
          <p v-if="dialogPhase === 'restarting'"
             class="text-xs text-surface-400">{{ dialogSteps.restarting?.description ?? 'Il server si sta riavviando…' }}</p>
        </div>
      </div>

      <!-- Step 3: reloading -->
      <div class="flex items-center gap-3"
           :class="dialogPhase !== 'reloading' ? 'opacity-40' : ''">
        <i v-if="dialogPhase === 'reloading'" class="pi pi-spin pi-spinner text-primary text-xl shrink-0" />
        <i v-else class="pi pi-circle text-surface-300 dark:text-surface-600 text-xl shrink-0" />
        <div>
          <p class="text-sm font-medium">{{ dialogSteps.reloading?.label ?? 'Aggiornamento interfaccia' }}</p>
          <p v-if="dialogPhase === 'reloading'"
             class="text-xs text-surface-400">{{ dialogSteps.reloading?.description ?? 'Quasi fatto…' }}</p>
        </div>
      </div>

      <p class="text-xs text-surface-400 pt-2 border-t border-surface-200 dark:border-surface-700">
        {{ dialogFooter }}
      </p>
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import Dialog from 'primevue/dialog'
import { useServerRestart } from '@/composables/useServerRestart.js'

const { dialogVisible, dialogTitle, dialogFooter, dialogPhase, dialogSteps } = useServerRestart()
</script>
