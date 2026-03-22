<template>
  <div class="p-6 max-w-4xl mx-auto">
    <!-- Header -->
    <div class="flex items-center gap-3 mb-6">
      <RouterLink to="/forms">
        <Button icon="pi pi-arrow-left" text plain />
      </RouterLink>
      <h1 class="text-2xl font-bold">{{ isNew ? 'Nuovo form' : 'Modifica form' }}</h1>
    </div>

    <!-- Pannello impostazioni generali -->
    <div class="bg-surface-card border border-surface-border rounded-lg p-6 mb-6">
      <h2 class="text-lg font-semibold mb-4">Impostazioni generali</h2>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium">Nome *</label>
          <InputText
            v-model="formData.name"
            placeholder="es. Contattaci"
            :invalid="!!errors.name"
            @input="handleNameInput"
          />
          <small class="text-red-500" v-if="errors.name">{{ errors.name }}</small>
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium">Slug *</label>
          <InputText
            v-model="formData.slug"
            placeholder="es. contattaci"
            :invalid="!!errors.slug"
          />
          <small class="text-red-500" v-if="errors.slug">{{ errors.slug }}</small>
          <small class="text-surface-400 text-xs">Solo lettere minuscole, numeri e trattini</small>
        </div>

        <div class="flex flex-col gap-1 md:col-span-2">
          <label class="text-sm font-medium">Descrizione</label>
          <InputText v-model="formData.description" placeholder="Descrizione opzionale del form" />
        </div>

        <div class="flex items-center gap-2 mt-2">
          <ToggleSwitch v-model="isActive" inputId="statusToggle" />
          <label for="statusToggle" class="text-sm cursor-pointer">Form attivo</label>
        </div>
      </div>
    </div>

    <!-- Costruttore campi -->
    <div class="bg-surface-card border border-surface-border rounded-lg p-6 mb-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold">Campi</h2>
        <Button label="Aggiungi campo" icon="pi pi-plus" size="small" @click="addField" />
      </div>

      <div v-if="formData.fields.length === 0" class="text-surface-400 text-sm py-4 text-center">
        Nessun campo. Aggiungi almeno un campo per creare il form.
      </div>

      <div class="flex flex-col gap-3">
        <div
          v-for="(field, index) in formData.fields"
          :key="field.id"
          class="border border-surface-border rounded-lg p-4 bg-surface-ground"
        >
          <div class="flex items-start gap-3">
            <!-- Drag handle placeholder (ordinamento via frecce) -->
            <div class="flex flex-col gap-1 mt-1">
              <Button
                icon="pi pi-chevron-up"
                text plain
                size="small"
                :disabled="index === 0"
                @click="moveField(index, -1)"
              />
              <Button
                icon="pi pi-chevron-down"
                text plain
                size="small"
                :disabled="index === formData.fields.length - 1"
                @click="moveField(index, 1)"
              />
            </div>

            <div class="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
              <!-- Nome campo -->
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium text-surface-500">Nome (identificatore)</label>
                <InputText
                  v-model="field.name"
                  placeholder="es. email_utente"
                  size="small"
                />
              </div>

              <!-- Etichetta -->
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium text-surface-500">Etichetta</label>
                <InputText
                  v-model="field.label"
                  placeholder="es. La tua email"
                  size="small"
                />
              </div>

              <!-- Tipo -->
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium text-surface-500">Tipo</label>
                <Select
                  v-model="field.type"
                  :options="fieldTypeOptions"
                  option-label="label"
                  option-value="value"
                  size="small"
                />
              </div>

              <!-- Placeholder -->
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium text-surface-500">Placeholder</label>
                <InputText
                  v-model="field.placeholder"
                  placeholder="Testo di aiuto..."
                  size="small"
                />
              </div>

              <!-- Opzioni (solo per select) -->
              <div v-if="field.type === 'select'" class="flex flex-col gap-1 md:col-span-2">
                <label class="text-xs font-medium text-surface-500">Opzioni (una per riga)</label>
                <Textarea
                  :model-value="(field.options ?? []).join('\n')"
                  @update:model-value="(v: string) => field.options = v.split('\n').filter(o => o.trim())"
                  rows="3"
                  placeholder="Opzione 1&#10;Opzione 2&#10;Opzione 3"
                  size="small"
                />
              </div>

              <!-- Obbligatorio -->
              <div class="flex items-center gap-2 mt-auto">
                <Checkbox :input-id="`req-${field.id}`" v-model="field.required" binary />
                <label :for="`req-${field.id}`" class="text-xs cursor-pointer">Obbligatorio</label>
              </div>
            </div>

            <!-- Elimina campo -->
            <Button
              icon="pi pi-trash"
              text plain
              size="small"
              severity="danger"
              v-tooltip="'Rimuovi campo'"
              @click="removeField(index)"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Azioni -->
    <div class="flex justify-end gap-3">
      <RouterLink to="/forms">
        <Button label="Annulla" severity="secondary" />
      </RouterLink>
      <Button
        :label="isNew ? 'Crea form' : 'Salva modifiche'"
        icon="pi pi-check"
        :loading="saving"
        @click="save"
      />
    </div>

    <Toast />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { getForm, createForm, updateForm } from '@/api/forms.js'
import type { FormField, FormFieldType } from '@/api/forms.js'
import { ApiError } from '@/api/client.js'

const router = useRouter()
const route  = useRoute()
const toast  = useToast()

const isNew    = computed(() => !route.params['id'])
const saving   = ref(false)
const isActive = ref(true)

const formData = ref<{
  name:        string
  slug:        string
  description: string
  fields:      FormField[]
}>({
  name:        '',
  slug:        '',
  description: '',
  fields:      [],
})

const errors = ref<{ name?: string; slug?: string }>({})

const fieldTypeOptions: Array<{ label: string; value: FormFieldType }> = [
  { label: 'Testo breve',   value: 'text'     },
  { label: 'Email',         value: 'email'    },
  { label: 'Testo lungo',   value: 'textarea' },
  { label: 'Numero',        value: 'number'   },
  { label: 'Selezione',     value: 'select'   },
  { label: 'Checkbox',      value: 'checkbox' },
  { label: 'Data',          value: 'date'     },
]

// Auto-genera lo slug dal nome (solo nei form nuovi)
function handleNameInput() {
  if (!isNew.value) return
  formData.value.slug = formData.value.name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function addField() {
  const newField: FormField = {
    id:        crypto.randomUUID(),
    name:      '',
    label:     '',
    type:      'text',
    required:  false,
    sortOrder: formData.value.fields.length,
  }
  formData.value.fields.push(newField)
}

function removeField(index: number) {
  formData.value.fields.splice(index, 1)
  // Ricalcola sortOrder
  formData.value.fields.forEach((f, i) => { f.sortOrder = i })
}

function moveField(index: number, direction: -1 | 1) {
  const fields = formData.value.fields
  const target = index + direction
  if (target < 0 || target >= fields.length) return
  ;[fields[index], fields[target]] = [fields[target]!, fields[index]!]
  fields.forEach((f, i) => { f.sortOrder = i })
}

function validate(): boolean {
  errors.value = {}
  if (!formData.value.name.trim()) {
    errors.value.name = 'Il nome è obbligatorio'
  }
  if (!formData.value.slug.trim()) {
    errors.value.slug = 'Lo slug è obbligatorio'
  } else if (!/^[a-z0-9-]+$/.test(formData.value.slug)) {
    errors.value.slug = 'Solo lettere minuscole, numeri e trattini'
  }
  return Object.keys(errors.value).length === 0
}

async function save() {
  if (!validate()) return

  saving.value = true
  try {
    const payload = {
      name:        formData.value.name,
      slug:        formData.value.slug,
      description: formData.value.description,
      fields:      formData.value.fields,
      status:      isActive.value ? 'active' as const : 'inactive' as const,
    }

    if (isNew.value) {
      await createForm(payload)
      toast.add({ severity: 'success', summary: 'Creato', detail: 'Form creato con successo', life: 3000 })
    } else {
      await updateForm(route.params['id'] as string, payload)
      toast.add({ severity: 'success', summary: 'Salvato', detail: 'Modifiche salvate', life: 3000 })
    }
    await router.push('/forms')
  } catch (err) {
    if (err instanceof ApiError && err.status === 422) {
      const details = err.details as { field?: string; error?: string } | undefined
      if (details?.field === 'slug') errors.value.slug = 'Slug già in uso'
      else toast.add({ severity: 'error', summary: 'Errore', detail: err.message, life: 4000 })
    } else {
      const msg = err instanceof ApiError ? err.message : 'Errore durante il salvataggio'
      toast.add({ severity: 'error', summary: 'Errore', detail: msg, life: 4000 })
    }
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  if (!isNew.value) {
    try {
      const form = await getForm(route.params['id'] as string)
      formData.value.name        = form.name
      formData.value.slug        = form.slug
      formData.value.description = form.description
      formData.value.fields      = form.fields
      isActive.value             = form.status === 'active'
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Form non trovato'
      toast.add({ severity: 'error', summary: 'Errore', detail: msg, life: 4000 })
      await router.push('/forms')
    }
  }
})
</script>
