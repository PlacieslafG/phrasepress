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

    <!-- Custom translatable fields -->
    <template v-if="translatableFieldDefs.length > 0">
      <div
        v-for="def in translatableFieldDefs"
        :key="def.name"
        class="flex flex-col gap-1.5"
      >
        <label class="text-sm font-semibold">{{ def.label ?? def.name }}</label>

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
import RichTextEditor from './RichTextEditor.vue'

interface FieldDef {
  name:    string
  type:    string
  label?:  string
  options?: string[]
}

export interface TranslationFormState {
  title:   string
  slug:    string
  content: string
  fields:  Record<string, unknown>
  status:  string
}

const props = defineProps<{
  modelValue:           TranslationFormState
  translatableFieldDefs: FieldDef[]
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
</script>
