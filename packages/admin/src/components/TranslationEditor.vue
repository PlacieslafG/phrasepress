<template>
  <div class="flex flex-col gap-5">
    <!-- Title -->
    <div class="flex flex-col gap-1.5">
      <label class="text-sm font-semibold">Titolo <span class="text-red-500">*</span></label>
      <InputText
        :model-value="modelValue.title"
        class="w-full"
        :invalid="!modelValue.title.trim()"
        @update:model-value="update('title', $event ?? '')"
      />
    </div>

    <!-- Slug -->
    <div class="flex flex-col gap-1.5">
      <label class="text-sm font-semibold text-surface-500">Slug</label>
      <InputText
        :model-value="modelValue.slug"
        class="w-full font-mono text-sm"
        placeholder="auto-generato dal titolo"
        @update:model-value="update('slug', $event ?? '')"
      />
    </div>

    <!-- Content -->
    <div class="flex flex-col gap-1.5">
      <label class="text-sm font-semibold">Contenuto</label>
      <RichTextEditor
        :model-value="modelValue.content"
        @update:model-value="update('content', $event)"
      />
    </div>

    <!-- Campi personalizzati -->
    <template v-if="allFieldDefs.length > 0">
      <p class="text-sm font-semibold">Campi personalizzati</p>
      <div
        v-for="def in allFieldDefs"
        :key="def.name"
        class="flex flex-col gap-1.5"
      >
        <label class="text-sm font-semibold">{{ def.label ?? def.name }}</label>

        <!-- Tipi traducibili: editabili -->
        <InputText
          v-if="def.type === 'string'"
          :model-value="strVal(def.name)"
          class="w-full"
          @update:model-value="setField(def.name, $event ?? '')"
        />
        <Textarea
          v-else-if="def.type === 'textarea'"
          :model-value="strVal(def.name)"
          :rows="3"
          auto-resize
          class="w-full"
          @update:model-value="setField(def.name, $event ?? '')"
        />
        <RichTextEditor
          v-else-if="def.type === 'richtext'"
          :model-value="strVal(def.name)"
          @update:model-value="setField(def.name, $event)"
        />

        <!-- Repeater: sottocampi traducibili editabili, altri in sola lettura -->
        <div v-else-if="def.type === 'repeater'" class="flex flex-col gap-3">
          <p v-if="repeaterRows(def.name).length === 0" class="text-sm text-surface-400 italic">Nessuna riga</p>
          <div
            v-for="(row, rowIdx) in repeaterRows(def.name)"
            :key="rowIdx"
            class="border border-surface-border rounded-lg"
          >
            <div class="px-4 py-2 border-b border-surface-border bg-surface-100 dark:bg-surface-800 rounded-t-lg">
              <span class="text-xs font-medium text-surface-500">Riga {{ rowIdx + 1 }}</span>
            </div>
            <div class="flex flex-col gap-3 p-4">
              <div v-for="sf in getSubFields(def)" :key="sf.name" class="flex flex-col gap-1">
                <label class="text-xs font-medium text-surface-500">{{ sf.label || sf.name }}</label>
                <InputText
                  v-if="sf.type === 'string'"
                  :model-value="String(row[sf.name] ?? '')"
                  class="w-full"
                  @update:model-value="setRepeaterCell(def.name, rowIdx, sf.name, $event ?? '')"
                />
                <Textarea
                  v-else-if="sf.type === 'textarea'"
                  :model-value="String(row[sf.name] ?? '')"
                  :rows="3"
                  auto-resize
                  class="w-full"
                  @update:model-value="setRepeaterCell(def.name, rowIdx, sf.name, $event ?? '')"
                />
                <div v-else class="flex items-center gap-2 px-3 py-1.5 text-sm text-surface-500 rounded border border-surface-200 bg-surface-50 dark:bg-surface-800">
                  <i class="pi pi-lock text-xs text-surface-300" />
                  <span>{{ formatReadOnly(row[sf.name]) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Altri tipi: sola lettura, valore originale -->
        <div v-else class="flex items-center gap-2 px-3 py-2 rounded border border-surface-200 bg-surface-50 dark:bg-surface-800 text-sm text-surface-500 min-h-[2.5rem]">
          <i class="pi pi-lock text-xs text-surface-300" />
          <span>{{ formatReadOnly(originalFields[def.name]) }}</span>
        </div>
      </div>
    </template>

    <!-- Status -->
    <div class="flex flex-col gap-1.5">
      <label class="text-sm font-semibold text-surface-500">Status traduzione</label>
      <Select
        :model-value="modelValue.status"
        :options="statusOptions"
        option-label="label"
        option-value="value"
        class="w-full"
        @update:model-value="update('status', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { FieldDefinition } from '@/api/posts.js'
import RichTextEditor from './RichTextEditor.vue'

export interface TranslationFormState {
  title:   string
  slug:    string
  content: string
  fields:  Record<string, unknown>
  status:  string
}

interface SubFieldDef { name: string; label?: string; type: string }

const props = defineProps<{
  modelValue:    TranslationFormState
  allFieldDefs:  FieldDefinition[]
  originalFields: Record<string, unknown>
}>()

const emit = defineEmits<{
  'update:modelValue': [TranslationFormState]
}>()

const statusOptions = [
  { label: 'Bozza',      value: 'draft' },
  { label: 'Pubblicato', value: 'published' },
]

function update<K extends keyof TranslationFormState>(key: K, value: TranslationFormState[K]) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}

function strVal(name: string): string {
  return String(props.modelValue.fields[name] ?? '')
}

function setField(name: string, value: string) {
  emit('update:modelValue', {
    ...props.modelValue,
    fields: { ...props.modelValue.fields, [name]: value },
  })
}

function repeaterRows(fieldName: string): Record<string, unknown>[] {
  const v = props.modelValue.fields[fieldName] ?? props.originalFields[fieldName]
  return Array.isArray(v) ? v as Record<string, unknown>[] : []
}

function getSubFields(def: FieldDefinition): SubFieldDef[] {
  return (def.fieldOptions?.subFields as SubFieldDef[] | undefined) ?? []
}

function setRepeaterCell(fieldName: string, rowIdx: number, cellName: string, value: string) {
  const rows = repeaterRows(fieldName)
  const newRows = rows.map((row, i) => i === rowIdx ? { ...row, [cellName]: value } : row)
  emit('update:modelValue', {
    ...props.modelValue,
    fields: { ...props.modelValue.fields, [fieldName]: newRows },
  })
}

function formatReadOnly(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'Sì' : 'No'
  if (Array.isArray(value)) return value.length > 0 ? `[${value.length} elementi]` : '—'
  return String(value)
}
</script>
