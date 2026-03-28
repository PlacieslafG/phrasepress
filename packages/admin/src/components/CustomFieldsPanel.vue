<template>
  <div v-if="fieldDefs.length > 0" class="flex flex-col gap-4">
    <div
      v-for="def in fieldDefs"
      :key="def.name"
      class="flex flex-col gap-1"
    >
      <label class="text-sm font-medium">{{ def.label ?? def.name }}</label>

      <InputText
        v-if="def.type === 'string'"
        :model-value="stringVal(def.name)"
        @update:model-value="set(def.name, $event)"
      />

      <InputNumber
        v-else-if="def.type === 'number'"
        :model-value="numVal(def.name)"
        @update:model-value="set(def.name, $event)"
        :min-fraction-digits="0"
        :max-fraction-digits="6"
      />

      <ToggleSwitch
        v-else-if="def.type === 'boolean'"
        :model-value="boolVal(def.name)"
        @update:model-value="set(def.name, $event)"
      />

      <DatePicker
        v-else-if="def.type === 'date'"
        :model-value="dateVal(def.name)"
        @update:model-value="set(def.name, $event)"
        date-format="dd/mm/yy"
        show-button-bar
      />

      <Select
        v-else-if="def.type === 'select'"
        :model-value="stringVal(def.name)"
        @update:model-value="set(def.name, $event)"
        :options="def.options ?? []"
        show-clear
      />

      <RichTextEditor
        v-else-if="def.type === 'richtext'"
        :model-value="stringVal(def.name)"
        @update:model-value="set(def.name, $event)"
      />

      <Textarea
        v-else-if="def.type === 'textarea'"
        :model-value="stringVal(def.name)"
        @update:model-value="set(def.name, $event)"
        :rows="4"
        auto-resize
        class="w-full"
      />

      <ImagePickerField
        v-else-if="def.type === 'image'"
        :model-value="numVal(def.name)"
        @update:model-value="set(def.name, $event)"
      />

      <RelationshipField
        v-else-if="def.type === 'relationship'"
        :model-value="relVal(def.name)"
        @update:model-value="set(def.name, $event)"
        :codex="(def.fieldOptions?.codex as string) ?? 'post'"
        :multiple="(def.fieldOptions?.multiple as boolean) ?? false"
      />

      <RepeaterField
        v-else-if="def.type === 'repeater'"
        :model-value="arrVal(def.name)"
        @update:model-value="set(def.name, $event)"
        :sub-fields="(def.fieldOptions?.subFields as SubFieldDef[]) ?? []"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import RichTextEditor from './RichTextEditor.vue'
import ImagePickerField from './ImagePickerField.vue'
import RelationshipField from './RelationshipField.vue'
import RepeaterField, { type SubFieldDef } from './RepeaterField.vue'
import type { FieldDefinition } from '@/stores/app.js'

const props = defineProps<{
  modelValue:  Record<string, unknown>
  fieldDefs:   FieldDefinition[]
}>()

const emit = defineEmits<{ 'update:modelValue': [value: Record<string, unknown>] }>()

function set(name: string, value: unknown) {
  emit('update:modelValue', { ...props.modelValue, [name]: value })
}

function stringVal(name: string): string {
  return (props.modelValue[name] as string | undefined) ?? ''
}
function numVal(name: string): number | null {
  const v = props.modelValue[name]
  return v !== undefined && v !== null ? Number(v) : null
}
function boolVal(name: string): boolean {
  return !!(props.modelValue[name])
}
function dateVal(name: string): Date | null {
  const v = props.modelValue[name]
  if (!v) return null
  return v instanceof Date ? v : new Date(v as string)
}
function relVal(name: string): number | number[] | null {
  const v = props.modelValue[name]
  return v != null ? v as number | number[] : null
}
function arrVal(name: string): Record<string, unknown>[] {
  const v = props.modelValue[name]
  return Array.isArray(v) ? v as Record<string, unknown>[] : []
}
</script>
