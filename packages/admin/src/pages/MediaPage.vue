<template>
  <div class="p-6 flex flex-col gap-6">
    <div class="flex items-center justify-between">
      <h2 class="text-2xl font-semibold">Media</h2>
      <Button label="+ Carica" icon="pi pi-upload" @click="triggerUpload" :loading="uploading" />
      <input ref="fileInput" type="file" class="hidden" accept="image/*,.pdf" multiple @change="handleFiles" />
    </div>

    <!-- Ricerca -->
    <InputText v-model="search" placeholder="Cerca per nome…" class="w-full max-w-sm" @input="onSearch" />

    <!-- Griglia media -->
    <div v-if="loading" class="flex justify-center py-12">
      <ProgressSpinner />
    </div>

    <div v-else-if="items.length === 0" class="text-center py-12 text-surface-400">
      Nessun file caricato.
    </div>

    <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
      <div
        v-for="item in items"
        :key="item.id"
        class="rounded-lg border border-surface-200 dark:border-surface-700 overflow-hidden cursor-pointer hover:border-primary-400 transition-colors group"
        @click="openItem(item)"
      >
        <!-- Thumbnail -->
        <div class="aspect-square bg-surface-100 dark:bg-surface-800 flex items-center justify-center overflow-hidden">
          <img
            v-if="item.mimeType.startsWith('image/')"
            :src="mediaApi.fileUrl(item.filename)"
            :alt="item.alt || item.originalName"
            class="w-full h-full object-cover"
          />
          <i v-else class="pi pi-file-pdf text-4xl text-surface-400" />
        </div>
        <!-- Nome -->
        <div class="px-2 py-1 text-xs truncate text-surface-600 dark:text-surface-400">
          {{ item.originalName }}
        </div>
      </div>
    </div>

    <!-- Paginazione -->
    <Paginator
      v-if="total > limit"
      :rows="limit"
      :totalRecords="total"
      :first="(page - 1) * limit"
      @page="onPageChange"
    />
  </div>

  <!-- Dialog dettaglio / modifica -->
  <Dialog v-model:visible="dialogVisible" :header="selected?.originalName" modal style="width: 520px">
    <div v-if="selected" class="flex flex-col gap-4">
      <!-- Preview -->
      <div class="flex justify-center bg-surface-100 dark:bg-surface-800 rounded-lg overflow-hidden max-h-64">
        <img
          v-if="selected.mimeType.startsWith('image/')"
          :src="mediaApi.fileUrl(selected.filename)"
          :alt="selected.alt"
          class="max-h-64 object-contain"
        />
        <div v-else class="flex items-center justify-center w-full h-32">
          <i class="pi pi-file-pdf text-6xl text-surface-400" />
        </div>
      </div>

      <!-- Info -->
      <div class="text-sm text-surface-500 flex gap-4">
        <span>{{ selected.mimeType }}</span>
        <span>{{ formatSize(selected.size) }}</span>
      </div>

      <!-- URL copia -->
      <div class="flex gap-2 items-center">
        <InputText :value="mediaApi.fileUrl(selected.filename)" readonly class="w-full text-xs" />
        <Button icon="pi pi-copy" text @click="copyUrl(selected)" />
      </div>

      <!-- Alt e caption -->
      <div class="flex flex-col gap-1">
        <label class="text-sm font-medium">Alt text</label>
        <InputText v-model="editForm.alt" class="w-full" />
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-sm font-medium">Didascalia</label>
        <InputText v-model="editForm.caption" class="w-full" />
      </div>
    </div>

    <template #footer>
      <Button label="Elimina" severity="danger" text icon="pi pi-trash" @click="confirmDelete" :loading="deleting" />
      <Button label="Annulla" severity="secondary" @click="dialogVisible = false" />
      <Button label="Salva" @click="saveItem" :loading="saving" />
    </template>
  </Dialog>

</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import { mediaApi } from '@/api/media.js'
import type { MediaItem } from '@/api/media.js'

const confirm = useConfirm()
const toast   = useToast()

const loading   = ref(false)
const uploading = ref(false)
const saving    = ref(false)
const deleting  = ref(false)

const items  = ref<MediaItem[]>([])
const total  = ref(0)
const page   = ref(1)
const limit  = 24
const search = ref('')

const fileInput     = ref<HTMLInputElement | null>(null)
const dialogVisible = ref(false)
const selected      = ref<MediaItem | null>(null)
const editForm      = ref({ alt: '', caption: '' })

let searchTimer: ReturnType<typeof setTimeout> | null = null

async function loadMedia() {
  loading.value = true
  try {
    const result = await mediaApi.list(page.value, limit, search.value || undefined)
    items.value = result.data
    total.value = result.total
  } finally {
    loading.value = false
  }
}

function triggerUpload() {
  fileInput.value?.click()
}

async function handleFiles(event: Event) {
  const input = event.target as HTMLInputElement
  if (!input.files?.length) return

  uploading.value = true
  let uploaded = 0
  let failed   = 0

  for (const file of Array.from(input.files)) {
    try {
      await mediaApi.upload(file)
      uploaded++
    } catch {
      failed++
    }
  }

  input.value = ''
  uploading.value = false

  if (uploaded > 0) {
    toast.add({ severity: 'success', summary: 'Caricati', detail: `${uploaded} file caricati`, life: 3000 })
    page.value = 1
    await loadMedia()
  }
  if (failed > 0) {
    toast.add({ severity: 'error', summary: 'Errore', detail: `${failed} file non caricati`, life: 4000 })
  }
}

function onSearch() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { page.value = 1; void loadMedia() }, 400)
}

function onPageChange(event: { page: number }) {
  page.value = event.page + 1
  void loadMedia()
}

function openItem(item: MediaItem) {
  selected.value  = item
  editForm.value  = { alt: item.alt, caption: item.caption }
  dialogVisible.value = true
}

async function saveItem() {
  if (!selected.value) return
  saving.value = true
  try {
    const updated = await mediaApi.update(selected.value.id, editForm.value)
    const idx = items.value.findIndex(i => i.id === updated.id)
    if (idx !== -1) items.value[idx] = updated
    selected.value = updated
    toast.add({ severity: 'success', summary: 'Salvato', life: 2000 })
  } catch {
    toast.add({ severity: 'error', summary: 'Errore salvataggio', life: 3000 })
  } finally {
    saving.value = false
  }
}

function confirmDelete() {
  confirm.require({
    message:     `Eliminare "${selected.value?.originalName}"?`,
    header:      'Conferma eliminazione',
    icon:        'pi pi-exclamation-triangle',
    rejectLabel: 'Annulla',
    acceptLabel: 'Elimina',
    acceptClass: 'p-button-danger',
    accept:      async () => {
      if (!selected.value) return
      deleting.value = true
      try {
        await mediaApi.delete(selected.value.id)
        dialogVisible.value = false
        toast.add({ severity: 'success', summary: 'Eliminato', life: 2000 })
        await loadMedia()
      } catch {
        toast.add({ severity: 'error', summary: 'Errore eliminazione', life: 3000 })
      } finally {
        deleting.value = false
      }
    },
  })
}

function copyUrl(item: MediaItem) {
  void navigator.clipboard.writeText(window.location.origin + mediaApi.fileUrl(item.filename))
  toast.add({ severity: 'info', summary: 'URL copiato', life: 2000 })
}

function formatSize(bytes: number): string {
  if (bytes < 1024)       return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

onMounted(loadMedia)
</script>
