<template>
  <div class="flex flex-col gap-3">
    <div
      v-if="rows.length === 0"
      class="text-sm text-surface-400 italic py-2"
    >
      Nessuna riga. Clicca "Aggiungi riga" per iniziare.
    </div>

    <div
      v-for="(row, rowIdx) in rows"
      :key="rowIdx"
      class="border border-surface-border rounded-lg"
    >
      <div class="flex items-center justify-between px-4 py-2 border-b border-surface-border bg-surface-100 dark:bg-surface-800 rounded-t-lg">
        <span class="text-xs font-medium text-surface-500">Riga {{ rowIdx + 1 }}</span>
        <Button
          text plain icon="pi pi-trash" size="small" severity="danger"
          @click="removeRow(rowIdx)"
        />
      </div>

      <div class="flex flex-col gap-3 p-4">
        <div v-for="sf in subFields" :key="sf.name" class="flex flex-col gap-1">
          <label class="text-xs font-medium text-surface-500">{{ sf.label || sf.name }}</label>

          <InputText
            v-if="sf.type === 'string'"
            :model-value="strVal(row, sf.name)"
            @update:model-value="setCell(rowIdx, sf.name, $event)"
            class="w-full"
          />
          <Textarea
            v-else-if="sf.type === 'textarea'"
            :model-value="strVal(row, sf.name)"
            @update:model-value="setCell(rowIdx, sf.name, $event)"
            :rows="3"
            auto-resize
            class="w-full"
          />
          <InputNumber
            v-else-if="sf.type === 'number'"
            :model-value="numVal(row, sf.name)"
            @update:model-value="setCell(rowIdx, sf.name, $event)"
            :min-fraction-digits="0"
            :max-fraction-digits="6"
            class="w-full"
          />
          <ToggleSwitch
            v-else-if="sf.type === 'boolean'"
            :model-value="boolVal(row, sf.name)"
            @update:model-value="setCell(rowIdx, sf.name, $event)"
          />
          <DatePicker
            v-else-if="sf.type === 'date'"
            :model-value="dateVal(row, sf.name)"
            @update:model-value="setCell(rowIdx, sf.name, $event)"
            date-format="dd/mm/yy"
            show-button-bar
            class="w-full"
          />
        </div>
      </div>
    </div>

    <Button
      label="Aggiungi riga"
      icon="pi pi-plus"
      outlined size="small"
      class="self-start"
      @click="addRow"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

export interface SubFieldDef {
  name:    string
  label?:  string
  type:    string
}

const props = defineProps<{
  modelValue: Record<string, unknown>[]
  subFields:  SubFieldDef[]
}>()

const emit = defineEmits<{ 'update:modelValue': [v: Record<string, unknown>[]] }>()

const rows = computed(() => props.modelValue ?? [])

function addRow() {
  const newRow: Record<string, unknown> = {}
  for (const sf of props.subFields) {
    newRow[sf.name] = sf.type === 'number' ? null : sf.type === 'boolean' ? false : ''
  }
  emit('update:modelValue', [...rows.value, newRow])
}

function removeRow(idx: number) {
  emit('update:modelValue', rows.value.filter((_, i) => i !== idx))
}

function setCell(rowIdx: number, name: string, value: unknown) {
  emit('update:modelValue', rows.value.map((row, i) => i === rowIdx ? { ...row, [name]: value } : row))
}

function strVal(row: Record<string, unknown>, name: string): string {
  return (row[name] as string | undefined) ?? ''
}
function numVal(row: Record<string, unknown>, name: string): number | null {
  const v = row[name]
  return v != null ? Number(v) : null
}
function boolVal(row: Record<string, unknown>, name: string): boolean {
  return !!row[name]
}
function dateVal(row: Record<string, unknown>, name: string): Date | null {
  const v = row[name]
  if (!v) return null
  return v instanceof Date ? v : new Date(v as string)
}
</script>
