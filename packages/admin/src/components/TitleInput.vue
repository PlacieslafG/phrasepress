<template>
  <div class="flex flex-col gap-1">
    <input
      :value="modelValue"
      type="text"
      placeholder="Titolo"
      class="text-2xl font-semibold bg-transparent border-0 border-b-2 border-transparent focus:border-primary-500 outline-none py-1 w-full transition-colors"
      @input="onInput"
    />
    <SlugEditor :model-value="slug" @update:model-value="$emit('update:slug', $event)" />
  </div>
</template>

<script setup lang="ts">
import SlugEditor from './SlugEditor.vue'

const props = defineProps<{
  modelValue: string
  slug:       string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:slug':       [value: string]
}>()

function onInput(e: Event) {
  const title = (e.target as HTMLInputElement).value
  emit('update:modelValue', title)
  // Auto-genera slug solo se il parent non l'ha già personalizzato
  // (il parent decide — qui emittiamo sempre lo slug derivato)
  emit('update:slug', generateSlug(title))
}

function generateSlug(title: string): string {
  return title
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
</script>
