<template>
  <Dialog :visible="visible" @update:visible="$emit('update:visible', $event)"
    header="Seleziona media" modal style="width: 720px">

    <div class="flex flex-col gap-4">
      <InputText v-model="search" placeholder="Cerca…" class="w-full" @input="onSearch" />

      <div v-if="loading" class="flex justify-center py-8">
        <ProgressSpinner />
      </div>

      <div v-else-if="items.length === 0" class="text-center py-8 text-surface-400">
        Nessuna immagine disponibile.
      </div>

      <div v-else class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 max-h-96 overflow-y-auto">
        <div
          v-for="item in items"
          :key="item.id"
          class="rounded-lg border-2 overflow-hidden cursor-pointer transition-colors"
          :class="selected?.id === item.id
            ? 'border-primary-500'
            : 'border-surface-200 dark:border-surface-700 hover:border-primary-300'"
          @click="selected = item"
          @dblclick="confirm"
        >
          <div class="aspect-square bg-surface-100 dark:bg-surface-800 flex items-center justify-center overflow-hidden">
            <img
              :src="fileUrl(item.filename)"
              :alt="item.alt || item.originalName"
              class="w-full h-full object-cover"
            />
          </div>
          <div class="px-1 py-0.5 text-xs truncate text-surface-500">{{ item.originalName }}</div>
        </div>
      </div>

      <Paginator
        v-if="total > limit"
        :rows="limit"
        :totalRecords="total"
        :first="(page - 1) * limit"
        @page="onPageChange"
      />

      <!-- Inserisci per URL -->
      <Divider />
      <div class="flex flex-col gap-1">
        <label class="text-sm text-surface-500">Oppure inserisci URL immagine</label>
        <div class="flex gap-2">
          <InputText v-model="manualUrl" placeholder="https://…" class="flex-1 text-sm" />
          <Button label="Inserisci" size="small" :disabled="!manualUrl" @click="confirmUrl" />
        </div>
      </div>
    </div>

    <template #footer>
      <Button label="Annulla" severity="secondary" @click="$emit('update:visible', false)" />
      <Button label="Inserisci" :disabled="!selected" @click="confirm" />
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { mediaApi } from '@/api/media.js'
import type { MediaItem } from '@/api/media.js'

const props = defineProps<{ visible: boolean }>()
const emit  = defineEmits<{
  'update:visible': [value: boolean]
  'select': [url: string, alt: string]
}>()

const loading   = ref(false)
const items     = ref<MediaItem[]>([])
const total     = ref(0)
const page      = ref(1)
const limit     = 20
const search    = ref('')
const selected  = ref<MediaItem | null>(null)
const manualUrl = ref('')

let searchTimer: ReturnType<typeof setTimeout> | null = null

function fileUrl(filename: string) {
  return mediaApi.fileUrl(filename)
}

async function load() {
  loading.value = true
  try {
    const res = await mediaApi.list(page.value, limit, search.value || undefined)
    // Solo immagini nel picker
    items.value = res.data.filter(i => i.mimeType.startsWith('image/'))
    total.value = res.total
  } catch {
    items.value = []
  } finally {
    loading.value = false
  }
}

function onSearch() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { page.value = 1; void load() }, 300)
}

function onPageChange(event: { page: number }) {
  page.value = event.page + 1
  void load()
}

function confirm() {
  if (!selected.value) return
  emit('select', fileUrl(selected.value.filename), selected.value.alt || selected.value.originalName)
  emit('update:visible', false)
}

function confirmUrl() {
  if (!manualUrl.value) return
  emit('select', manualUrl.value, '')
  emit('update:visible', false)
  manualUrl.value = ''
}

watch(() => props.visible, (v) => {
  if (v) {
    selected.value = null
    search.value = ''
    page.value = 1
    void load()
  }
})
</script>
