<template>
  <div class="flex flex-col gap-2">
    <div v-if="loading" class="text-sm text-surface-400">Caricamento revisioni...</div>

    <div v-else-if="revisions.length === 0" class="text-sm text-surface-400">
      Nessuna revisione disponibile.
    </div>

    <div
      v-for="rev in revisions"
      :key="rev.id"
      class="flex items-center justify-between gap-2 py-1 border-b border-surface-100 last:border-0"
    >
      <div class="flex flex-col text-sm">
        <span class="font-medium">{{ rev.title }}</span>
        <span class="text-xs text-surface-400">{{ formatDate(rev.createdAt) }}</span>
      </div>
      <Button
        size="small" text severity="secondary" label="Ripristina"
        @click="confirmRestore(rev)"
      />
    </div>
  </div>

  <!-- Dialog conferma -->
  <Dialog v-model:visible="showConfirm" modal header="Ripristina revisione" :style="{ width: '26rem' }">
    <p class="text-sm">
      Questa azione sovrascriverà il contenuto attuale con la revisione del
      <strong>{{ pendingRev ? formatDate(pendingRev.createdAt) : '' }}</strong>.
      Vuoi continuare?
    </p>
    <template #footer>
      <Button label="Annulla"    text severity="secondary" @click="showConfirm = false" />
      <Button label="Ripristina" severity="warn" @click="doRestore" />
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { foliosApi } from '@/api/folios.js'
import type { FolioRevision } from '@/api/folios.js'
import { useToast } from 'primevue/usetoast'

const props = defineProps<{ codex: string; postId: number }>()
const emit  = defineEmits<{ restored: [] }>()

const toast    = useToast()
const revisions = ref<FolioRevision[]>([])
const loading   = ref(false)

const showConfirm = ref(false)
const pendingRev  = ref<FolioRevision | null>(null)

function formatDate(ts: number) {
  return new Date(ts * 1000).toLocaleString('it-IT', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

async function load() {
  loading.value = true
  try {
    revisions.value = await foliosApi.getRevisions(props.codex, props.postId)
  } catch {
    /* silenzioso */
  } finally {
    loading.value = false
  }
}

function confirmRestore(rev: PostRevision) {
  pendingRev.value  = rev
  showConfirm.value = true
}

async function doRestore() {
  if (!pendingRev.value) return
  showConfirm.value = false
  try {
    await foliosApi.restoreRevision(props.codex, props.postId, pendingRev.value.id)
    emit('restored')
    toast.add({ severity: 'success', summary: 'Revisione ripristinata', life: 2000 })
    await load()
  } catch {
    toast.add({ severity: 'error', summary: 'Errore ripristino', life: 3000 })
  }
}

onMounted(load)

// Espone reload per il parent
defineExpose({ reload: load })
</script>
