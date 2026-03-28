<template>
  <div>
    <Select
      v-if="!multiple"
      :model-value="singleValue"
      :options="options"
      option-label="title"
      option-value="id"
      :loading="loading"
      :placeholder="placeholder"
      filter
      show-clear
      @update:model-value="emit('update:modelValue', $event ?? null)"
    />
    <MultiSelect
      v-else
      :model-value="multiValue"
      :options="options"
      option-label="title"
      option-value="id"
      :loading="loading"
      :placeholder="placeholder"
      filter
      @update:model-value="emit('update:modelValue', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { apiFetch } from '@/api/client.js'

const props = defineProps<{
  modelValue: number | number[] | null
  codex:      string
  multiple?:  boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: number | number[] | null] }>()

interface FolioOption { id: number; title: string }

const loading  = ref(false)
const options  = ref<FolioOption[]>([])
const placeholder = computed(() => props.multiple ? 'Seleziona...' : 'Seleziona...')

const singleValue = computed(() => (props.multiple ? null : props.modelValue as number | null))
const multiValue  = computed(() => (props.multiple ? (props.modelValue as number[] | null) ?? [] : []))

onMounted(async () => {
  loading.value = true
  try {
    const res = await apiFetch<{ data: Array<{ id: number; fields: Record<string, unknown> }> }>(
      `/api/v1/${encodeURIComponent(props.codex)}?stage=published&limit=100`
    )
    options.value = res.data.map(f => ({ id: f.id, title: String(f.fields?.title ?? f.id) }))
  } catch {
    options.value = []
  } finally {
    loading.value = false
  }
})
</script>
