<template>
  <div class="flex flex-col gap-4">
    <!-- Titolo -->
    <div class="flex flex-col gap-1">
      <label class="text-xs font-medium text-surface-500">Titolo *</label>
      <InputText v-model="form.title" class="w-full" :invalid="!form.title.trim()" />
    </div>

    <!-- Slug -->
    <div class="flex flex-col gap-1">
      <label class="text-xs font-medium text-surface-500">Slug</label>
      <InputText v-model="form.slug" class="w-full font-mono text-sm" placeholder="auto-generato dal titolo" />
    </div>

    <!-- Contenuto -->
    <div class="flex flex-col gap-1">
      <label class="text-xs font-medium text-surface-500">Contenuto</label>
      <RichTextEditor v-model="form.content" />
    </div>

    <!-- Campi personalizzati traducibili -->
    <div v-if="translatableFieldDefs.length > 0" class="flex flex-col gap-3">
      <label class="text-xs font-medium text-surface-500">Campi personalizzati</label>
      <div v-for="def in translatableFieldDefs" :key="def.name" class="flex flex-col gap-1">
        <label class="text-xs text-surface-400">{{ def.label ?? def.name }}</label>

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
    </div>

    <!-- Status -->
    <div class="flex flex-col gap-1">
      <label class="text-xs font-medium text-surface-500">Status</label>
      <Select
        v-model="form.status"
        :options="statusOptions"
        option-label="label"
        option-value="value"
        class="w-full"
      />
    </div>

    <!-- Azioni — in fondo al form -->
    <div class="flex items-center gap-2 pt-2 border-t border-surface-700 mt-auto">
      <Button
        label="Auto-traduci"
        icon="pi pi-sparkles"
        size="small"
        severity="secondary"
        outlined
        :loading="translating"
        @click="autoTranslate"
      />
      <Button
        label="Salva"
        icon="pi pi-save"
        size="small"
        :loading="saving"
        class="ml-auto"
        @click="save"
      />
      <Button
        v-if="translation"
        icon="pi pi-trash"
        severity="danger"
        text
        size="small"
        @click="confirmDelete"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import { i18nApi } from '@/api/i18n.js'
import type { Locale, Translation } from '@/api/i18n.js'
import RichTextEditor from './RichTextEditor.vue'

interface FieldDef {
  name:    string
  type:    string
  label?:  string
  options?: string[]
}

const props = defineProps<{
  locale:               Locale
  postId:               number
  translation:          Translation | null
  translatableFieldDefs: FieldDef[]
}>()

const emit = defineEmits<{
  saved:   [t: Translation]
  deleted: []
}>()

const confirm  = useConfirm()
const toast    = useToast()
const saving     = ref(false)
const translating = ref(false)

const statusOptions = [
  { label: 'Bozza',      value: 'draft' },
  { label: 'Pubblicato', value: 'published' },
]

interface FormState {
  title:   string
  slug:    string
  content: string
  fields:  Record<string, unknown>
  status:  string
}

const form = ref<FormState>(buildForm(props.translation))

function buildForm(t: Translation | null): FormState {
  return {
    title:   t?.title   ?? '',
    slug:    t?.slug    ?? '',
    content: t?.content ?? '',
    fields:  t?.fields  ?? {},
    status:  t?.status  ?? 'draft',
  }
}

// Reset form when translation prop changes (e.g. after auto-translate)
watch(() => props.translation, (t) => {
  form.value = buildForm(t)
})

function strVal(name: string): string {
  return String(form.value.fields[name] ?? '')
}

function setField(name: string, value: string) {
  form.value.fields = { ...form.value.fields, [name]: value }
}

async function save() {
  if (!form.value.title.trim()) {
    toast.add({ severity: 'warn', summary: 'Titolo obbligatorio', life: 3000 })
    return
  }
  saving.value = true
  try {
    const saved = await i18nApi.upsertTranslation(props.postId, props.locale.code, {
      title:   form.value.title,
      slug:    form.value.slug || undefined,
      content: form.value.content,
      fields:  form.value.fields,
      status:  form.value.status,
    })
    emit('saved', saved)
    form.value.slug = saved.slug   // update with server-generated slug
    toast.add({ severity: 'success', summary: `Traduzione ${props.locale.label} salvata`, life: 3000 })
  } catch (err: unknown) {
    const msg = (err as { message?: string })?.message ?? 'Errore salvataggio'
    toast.add({ severity: 'error', summary: 'Errore', detail: msg, life: 4000 })
  } finally {
    saving.value = false
  }
}

async function autoTranslate() {
  translating.value = true
  try {
    const t = await i18nApi.autoTranslate(props.postId, props.locale.code)
    emit('saved', t)
    form.value = buildForm(t)
    toast.add({ severity: 'success', summary: `${props.locale.label} tradotta automaticamente`, life: 3000 })
  } catch (err: unknown) {
    const msg = (err as { message?: string })?.message ?? 'Errore traduzione'
    toast.add({ severity: 'error', summary: 'Traduzione fallita', detail: msg, life: 4000 })
  } finally {
    translating.value = false
  }
}

function confirmDelete() {
  confirm.require({
    message: `Eliminare la traduzione in ${props.locale.label}?`,
    header:  'Conferma eliminazione',
    icon:    'pi pi-exclamation-triangle',
    rejectProps: { label: 'Annulla', severity: 'secondary', outlined: true },
    acceptProps: { label: 'Elimina', severity: 'danger' },
    accept: async () => {
      try {
        await i18nApi.deleteTranslation(props.postId, props.locale.code)
        emit('deleted')
        form.value = buildForm(null)
        toast.add({ severity: 'success', summary: 'Traduzione eliminata', life: 3000 })
      } catch {
        toast.add({ severity: 'error', summary: 'Errore eliminazione', life: 3000 })
      }
    },
  })
}
</script>
