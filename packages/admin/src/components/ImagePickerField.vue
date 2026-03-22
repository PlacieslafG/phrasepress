<template>
  <div class="flex flex-col gap-2">
    <!-- Preview thumbnail -->
    <div
      v-if="preview"
      class="flex items-center gap-3 p-2 border border-surface-border rounded-lg"
    >
      <img
        :src="thumbUrl"
        :alt="preview.originalName"
        class="w-16 h-16 object-cover rounded"
      />
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium truncate">{{ preview.originalName }}</p>
        <p class="text-xs text-surface-400">{{ preview.alt }}</p>
      </div>
      <Button icon="pi pi-times" text plain size="small" @click="clear" />
    </div>

    <Button
      :label="preview ? 'Cambia immagine' : 'Scegli immagine'"
      icon="pi pi-image"
      outlined
      size="small"
      @click="open"
    />

    <Dialog v-model:visible="visible" header="Scegli media" :style="{ width: '700px' }" modal>
      <div v-if="loading" class="flex justify-center p-6">
        <ProgressSpinner style="width:40px;height:40px" />
      </div>
      <template v-else>
        <div v-if="mediaList.length === 0" class="text-center py-8 text-surface-400">
          Nessun file caricato
        </div>
        <div v-else class="grid grid-cols-4 gap-3 max-h-96 overflow-y-auto">
          <button
            v-for="item in mediaList"
            :key="item.id"
            class="flex flex-col items-center gap-1 p-2 border rounded-lg cursor-pointer transition-colors"
            :class="modelValue === item.id
              ? 'border-primary-500 bg-primary-50 dark:bg-primary-950'
              : 'border-surface-border hover:border-surface-400'"
            @click="select(item)"
          >
            <img
              v-if="item.mimeType.startsWith('image/')"
              :src="`/api/v1/plugins/media/files/${item.filename}`"
              :alt="item.alt || item.originalName"
              class="w-full aspect-square object-cover rounded"
            />
            <div
              v-else
              class="w-full aspect-square flex items-center justify-center bg-surface-100 dark:bg-surface-800 rounded"
            >
              <i class="pi pi-file text-2xl text-surface-400" />
            </div>
            <span class="text-xs truncate w-full text-center text-surface-600">{{ item.originalName }}</span>
          </button>
        </div>
        <div v-if="hasMore" class="mt-4 flex justify-center">
          <Button label="Carica altri" text size="small" :loading="loadingMore" @click="loadMore" />
        </div>
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { apiFetch } from '@/api/client.js'

interface MediaItem {
  id:           number
  filename:     string
  originalName: string
  mimeType:     string
  alt:          string
}

const props = defineProps<{ modelValue: number | null }>()
const emit  = defineEmits<{ 'update:modelValue': [value: number | null] }>()

const visible     = ref(false)
const loading     = ref(false)
const loadingMore = ref(false)
const mediaList   = ref<MediaItem[]>([])
const page        = ref(1)
const hasMore     = ref(false)
const preview     = ref<MediaItem | null>(null)

const thumbUrl = computed(() =>
  preview.value ? `/api/v1/plugins/media/files/${preview.value.filename}` : ''
)

// Load preview when value changes
watch(() => props.modelValue, async (id) => {
  if (id == null) { preview.value = null; return }
  if (preview.value?.id === id) return
  try {
    preview.value = await apiFetch<MediaItem>(`/api/v1/plugins/media/${id}`)
  } catch {
    preview.value = null
  }
}, { immediate: true })

async function open() {
  visible.value = true
  if (mediaList.value.length === 0) await fetchMedia(1)
}

async function fetchMedia(p: number) {
  if (p === 1) loading.value = true
  else loadingMore.value = true
  try {
    const res = await apiFetch<{ data: MediaItem[]; total: number }>(`/api/v1/plugins/media?page=${p}&limit=20`)
    if (p === 1) mediaList.value = res.data
    else mediaList.value.push(...res.data)
    hasMore.value = mediaList.value.length < res.total
    page.value = p
  } finally {
    loading.value     = false
    loadingMore.value = false
  }
}

async function loadMore() {
  await fetchMedia(page.value + 1)
}

function select(item: MediaItem) {
  preview.value = item
  emit('update:modelValue', item.id)
  visible.value = false
}

function clear() {
  preview.value = null
  emit('update:modelValue', null)
}
</script>
