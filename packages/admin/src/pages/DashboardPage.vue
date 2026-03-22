<template>
  <div class="p-6">
    <h2 class="text-xl font-semibold mb-6">Dashboard</h2>

    <div v-if="loading" class="flex justify-center py-12">
      <ProgressSpinner />
    </div>

    <div v-else-if="error" class="text-red-500">{{ error }}</div>

    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <Card v-for="pt in appStore.postTypes" :key="pt.name">
        <template #title>
          <div class="flex items-center gap-2">
            <i :class="['text-lg', pt.icon ?? 'pi pi-file']" />
            <span>{{ pt.label }}</span>
          </div>
        </template>
        <template #content>
          <div class="flex gap-6">
            <div class="text-center">
              <p class="text-2xl font-bold">{{ stats?.[pt.name]?.published ?? 0 }}</p>
              <p class="text-xs text-surface-500 mt-1">Pubblicati</p>
            </div>
            <div class="text-center">
              <p class="text-2xl font-bold text-surface-400">{{ stats?.[pt.name]?.draft ?? 0 }}</p>
              <p class="text-xs text-surface-500 mt-1">Bozze</p>
            </div>
            <div class="text-center">
              <p class="text-2xl font-bold text-surface-300">{{ stats?.[pt.name]?.trash ?? 0 }}</p>
              <p class="text-xs text-surface-500 mt-1">Cestino</p>
            </div>
          </div>
        </template>
        <template #footer>
          <RouterLink :to="`/posts/${pt.name}`">
            <Button text plain size="small" icon="pi pi-arrow-right" label="Vai alla lista" />
          </RouterLink>
        </template>
      </Card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAppStore } from '@/stores/app.js'
import { apiFetch } from '@/api/client.js'

const appStore = useAppStore()

const loading = ref(false)
const error   = ref('')
const stats   = ref<Record<string, Record<string, number>> | null>(null)

onMounted(async () => {
  loading.value = true
  error.value   = ''
  try {
    stats.value = await apiFetch<Record<string, Record<string, number>>>('/api/v1/stats')
  } catch {
    error.value = 'Impossibile caricare le statistiche'
  } finally {
    loading.value = false
  }
})
</script>
