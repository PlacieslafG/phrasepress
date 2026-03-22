<template>
  <div class="flex flex-col gap-5">
    <!-- Title -->
    <div class="flex flex-col gap-1.5">
      <label class="text-sm font-semibold">Titolo <span class="text-red-500">*</span></label>
      <InputText
        v-model="form.title"
        class="w-full"
        :invalid="!form.title.trim()"
      />
    </div>

    <!-- Slug -->
    <div class="flex flex-col gap-1.5">
      <label class="text-sm font-semibold text-surface-500">Slug</label>
      <InputText
        v-model="form.slug"
        class="w-full font-mono text-sm"
        placeholder="auto-generato dal titolo"
      />
    </div>

    <!-- Content -->
    <div class="flex flex-col gap-1.5">
      <label class="text-sm font-semibold">Contenuto</label>
      <RichTextEditor v-model="form.content" />
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
        v-model="form.status"
        :options="statusOptions"
        option-label="label"
        option-value="value"
        class="w-full"
      />
    </div>

    <!-- Actions -->
    <div class="flex items-center gap-2 pt-2 border-t border-surface-200">
      <Button label="Salva" icon="pi pi-check" :loading="saving" @click="save" />
      <Button label="Traduci auto" icon="pi pi-language" severity="secondary" text :loading="saving" @click="autoTranslate" />
      <Button
        v-if="translation"
        icon="pi pi-trash"
        severity="danger"
        text
        :loading="deleting"
        class="ml-auto"
        v-tooltip="'Elimina traduzione'"
        @click="confirmDelete"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
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
  saved:   [translation: Translation]
  deleted: []
}>()

const toast   = useToast()
const confirm = useConfirm()

const saving  = ref(false)
const deleting = ref(false)

// Form state
const form = ref(toForm(props.translation))

watch(() => props.translation, t => { form.value = toForm(t) })

function toForm(t: Translation | null) {
  return {
    title:   t?.title   ?? '',
    slug:    t?.slug    ?? '',
    content: t?.content ?? '',
    fields:  t?.fields  ?? {} as Record<string, unknown>,
    status:  t?.status  ?? 'draft',
  }
}

const statusOptions = [
  { label: 'Bozza',      value: 'draft' },
  { label: 'Pubblicato', value: 'published' },
]

function strVal(name: string): string {
  return String(form.value.fields[name] ?? '')
}

function setField(name: string, value: string) {
  form.value.fields = { ...form.value.fields, [name]: value }
}

async function save() {
  saving.value = true
  try {
    const t = await i18nApi.upsertTranslation(props.postId, props.locale.code, {
      title:   form.value.title,
      slug:    form.value.slug || undefined,
      content: form.value.content,
      fields:  form.value.fields,
      status:  form.value.status,
    })
    emit('saved', t)
    toast.add({ severity: 'success', summary: 'Traduzione salvata', life: 2500 })
  } catch (err: unknown) {
    const msg = (err as { message?: string })?.message ?? 'Errore salvataggio'
    toast.add({ severity: 'error', summary: msg, life: 4000 })
  } finally {
    saving.value = false
  }
}

async function autoTranslate() {
  saving.value = true
  try {
    const t = await i18nApi.autoTranslate(props.postId, props.locale.code)
    form.value = toForm(t)
    emit('saved', t)
    toast.add({ severity: 'success', summary: 'Traduzione automatica completata', life: 2500 })
  } catch (err: unknown) {
    const msg = (err as { message?: string })?.message ?? 'Errore traduzione automatica'
    toast.add({ severity: 'error', summary: msg, life: 4000 })
  } finally {
    saving.value = false
  }
}

function confirmDelete() {
  confirm.require({
    message: `Eliminare la traduzione in ${props.locale.label}?`,
    header:  'Conferma eliminazione',
    icon:    'pi pi-trash',
    rejectProps: { label: 'Annulla', severity: 'secondary', text: true },
    acceptProps: { label: 'Elimina', severity: 'danger' },
    accept: async () => {
      deleting.value = true
      try {
        await i18nApi.deleteTranslation(props.postId, props.locale.code)
        emit('deleted')
        toast.add({ severity: 'success', summary: 'Traduzione eliminata', life: 2500 })
      } catch (err: unknown) {
        const msg = (err as { message?: string })?.message ?? 'Errore eliminazione'
        toast.add({ severity: 'error', summary: msg, life: 4000 })
      } finally {
        deleting.value = false
      }
    },
  })
}
</script>
