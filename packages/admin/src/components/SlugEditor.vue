<template>
  <div class="flex items-center gap-2 text-sm text-surface-400">
    <span class="select-none">Slug:</span>
    <template v-if="editing">
      <InputText
        v-model="draft"
        size="small"
        class="w-60 font-mono"
        @keyup.enter="save"
        @keyup.escape="cancel"
      />
      <Button size="small" label="Salva"   text @click="save" />
      <Button size="small" label="Annulla" text severity="secondary" @click="cancel" />
    </template>
    <template v-else>
      <span class="font-mono">{{ modelValue || '—' }}</span>
      <Button size="small" icon="pi pi-pencil" text rounded @click="startEdit" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{ modelValue: string }>()
const emit  = defineEmits<{ 'update:modelValue': [value: string] }>()

const editing = ref(false)
const draft   = ref('')

function startEdit() {
  draft.value   = props.modelValue
  editing.value = true
}

function save() {
  const sanitized = draft.value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  emit('update:modelValue', sanitized)
  editing.value = false
}

function cancel() {
  editing.value = false
}
</script>
