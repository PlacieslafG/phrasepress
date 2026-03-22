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
  postType:   string
  multiple?:  boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: number | number[] | null] }>()

interface PostOption { id: number; title: string }

const loading  = ref(false)
const options  = ref<PostOption[]>([])
const placeholder = computed(() => props.multiple ? 'Seleziona post...' : 'Seleziona un post...')

const singleValue = computed(() => (props.multiple ? null : props.modelValue as number | null))
const multiValue  = computed(() => (props.multiple ? (props.modelValue as number[] | null) ?? [] : []))

onMounted(async () => {
  loading.value = true
  try {
    const res = await apiFetch<{ data: { id: number; title: string }[] }>(
      `/api/v1/posts?type=${encodeURIComponent(props.postType)}&limit=100&status=published`
    )
    options.value = res.data.map(p => ({ id: p.id, title: p.title }))
  } catch {
    options.value = []
  } finally {
    loading.value = false
  }
})
</script>
