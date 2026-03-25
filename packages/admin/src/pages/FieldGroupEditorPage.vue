<template>
  <div class="p-6 max-w-4xl mx-auto">
    <!-- Header -->
    <div class="flex items-center gap-3 mb-6">
      <Button text plain icon="pi pi-arrow-left" @click="$router.push('/field-groups')" />
      <h1 class="text-2xl font-bold">{{ isNew ? 'Nuovo gruppo' : 'Modifica gruppo' }}</h1>
    </div>

    <div v-if="loading" class="flex justify-center py-12">
      <ProgressSpinner style="width:48px;height:48px" />
    </div>

    <template v-else>
      <!-- Group info -->
      <div class="surface-card border border-surface-border rounded-xl p-6 mb-6">
        <h2 class="text-lg font-semibold mb-4">Informazioni</h2>
        <div class="flex flex-col gap-4">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium">Nome <span class="text-red-500">*</span></label>
            <InputText v-model="form.name" placeholder="Es. Dati prodotto" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium">Descrizione</label>
            <InputText v-model="form.description" placeholder="Descrizione opzionale" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium">Post type associati</label>
            <MultiSelect
              v-model="form.postTypes"
              :options="postTypeOptions"
              option-label="label"
              option-value="name"
              placeholder="Seleziona post type..."
              display="chip"
            />
          </div>
        </div>
      </div>

      <!-- Fields list -->
      <div class="surface-card border border-surface-border rounded-xl p-6 mb-6">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-semibold">Campi</h2>
          <Button label="Aggiungi campo" icon="pi pi-plus" size="small" outlined @click="openFieldDialog()" />
        </div>

        <div v-if="fields.length === 0" class="text-center py-6 text-surface-400 text-sm">
          Nessun campo. Clicca "Aggiungi campo" per iniziare.
        </div>

        <DataTable v-else :value="fields" class="text-sm">
          <Column field="label" header="Etichetta">
            <template #body="{ data }">{{ data.label || data.name }}</template>
          </Column>
          <Column field="name" header="Nome" />
          <Column field="type" header="Tipo">
            <template #body="{ data }">
              <Tag :value="FIELD_TYPE_LABELS[data.type] ?? data.type" severity="secondary" />
            </template>
          </Column>
          <Column field="required" header="Obbl." style="width:60px">
            <template #body="{ data }">
              <i :class="data.required ? 'pi pi-check text-green-500' : 'pi pi-minus text-surface-300'" />
            </template>
          </Column>
          <Column field="queryable" header="Indice" style="width:70px">
            <template #body="{ data }">
              <i :class="data.queryable ? 'pi pi-check text-green-500' : 'pi pi-minus text-surface-300'" />
            </template>
          </Column>
          <Column field="translatable" header="Traduci" style="width:70px">
            <template #body="{ data }">
              <i :class="data.translatable !== false ? 'pi pi-language text-primary-500' : 'pi pi-minus text-surface-300'" />
            </template>
          </Column>
          <Column style="width:90px">
            <template #body="{ data }">
              <div class="flex gap-1">
                <Button text plain icon="pi pi-pencil" size="small" @click="openFieldDialog(data)" />
                <Button text plain icon="pi pi-trash" size="small" severity="danger" @click="removeField(data.id)" />
              </div>
            </template>
          </Column>
        </DataTable>
      </div>

      <!-- Save bar -->
      <div class="flex justify-end gap-3">
        <Button label="Annulla" outlined @click="$router.push('/field-groups')" />
        <Button label="Salva" icon="pi pi-check" :loading="saving" @click="save" />
      </div>
    </template>

    <!-- Field dialog -->
    <Dialog v-model:visible="fieldDialogVisible" :header="editingField ? 'Modifica campo' : 'Aggiungi campo'" :style="{ width: '520px' }" modal>
      <div class="flex flex-col gap-4 py-2">
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium">Nome (chiave) <span class="text-red-500">*</span></label>
            <InputText v-model="fieldForm.name" placeholder="es. prezzo" @input="autoLabel" />
            <small class="text-surface-400">Usato come chiave nel DB, senza spazi</small>
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium">Etichetta</label>
            <InputText v-model="fieldForm.label" placeholder="es. Prezzo" />
          </div>
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium">Tipo <span class="text-red-500">*</span></label>
          <Select
            v-model="fieldForm.type"
            :options="FIELD_TYPES"
            option-label="label"
            option-value="value"
            placeholder="Seleziona tipo..."
          />
        </div>

        <!-- Options (select) -->
        <div v-if="fieldForm.type === 'select'" class="flex flex-col gap-1">
          <label class="text-sm font-medium">Opzioni (una per riga)</label>
          <Textarea v-model="selectOptionsText" rows="4" placeholder="opzione1&#10;opzione2&#10;opzione3" />
        </div>

        <!-- Relationship config -->
        <div v-if="fieldForm.type === 'relationship'" class="flex flex-col gap-3">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium">Post type correlato</label>
            <Select
              v-model="relPostType"
              :options="postTypeOptions"
              option-label="label"
              option-value="name"
              placeholder="Seleziona post type..."
            />
          </div>
          <div class="flex items-center gap-2">
            <ToggleSwitch v-model="relMultiple" input-id="relMultiple" />
            <label for="relMultiple" class="text-sm">Selezione multipla</label>
          </div>
        </div>

        <!-- Repeater sub-fields -->
        <div v-if="fieldForm.type === 'repeater'" class="flex flex-col gap-3">
          <label class="text-sm font-medium">Sotto-campi</label>

          <div v-if="subFields.length > 0" class="flex flex-col gap-1.5">
            <div
              v-for="(sf, i) in subFields"
              :key="i"
              class="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-100 dark:bg-surface-800 text-sm"
            >
              <span class="font-mono text-xs w-32 shrink-0 truncate">{{ sf.name }}</span>
              <span class="flex-1 truncate text-surface-500">{{ sf.label }}</span>
              <Tag :value="sf.type" severity="secondary" class="text-xs shrink-0" />
              <Button text plain icon="pi pi-times" size="small" severity="danger" @click="subFields.splice(i, 1)" />
            </div>
          </div>
          <p v-else class="text-xs text-surface-400 italic">Nessun sotto-campo ancora.</p>

          <div class="grid grid-cols-3 gap-2">
            <InputText v-model="newSubField.name" placeholder="nome (chiave)" class="text-sm" />
            <InputText v-model="newSubField.label" placeholder="etichetta" class="text-sm" />
            <Select
              v-model="newSubField.type"
              :options="SUB_FIELD_TYPES"
              option-label="label"
              option-value="value"
            />
          </div>
          <Button label="Aggiungi sotto-campo" icon="pi pi-plus" outlined size="small" class="self-start" @click="addSubField" />
        </div>

        <div class="flex items-center gap-6 pt-1">
          <div class="flex items-center gap-2">
            <ToggleSwitch v-model="fieldForm.required" input-id="fRequired" />
            <label for="fRequired" class="text-sm">Obbligatorio</label>
          </div>
          <div class="flex items-center gap-2">
            <ToggleSwitch v-model="fieldForm.queryable" input-id="fQueryable" />
            <label for="fQueryable" class="text-sm">Indicizzabile</label>
          </div>
          <div class="flex items-center gap-2">
            <ToggleSwitch v-model="fieldForm.translatable" input-id="fTranslatable" />
            <label for="fTranslatable" class="text-sm">Traduci automaticamente</label>
          </div>
        </div>
      </div>

      <template #footer>
        <Button label="Annulla" text @click="fieldDialogVisible = false" />
        <Button label="Salva campo" icon="pi pi-check" @click="saveField" />
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { useAppStore } from '@/stores/app.js'
import {
  getFieldGroup, createFieldGroup, updateFieldGroup,
  addField, updateField, deleteField,
  type FieldGroup, type FieldItem, type FieldItemInput,
} from '@/api/fields.js'

const FIELD_TYPES = [
  { label: 'Testo',       value: 'string'       },
  { label: 'Area testo',  value: 'textarea'      },
  { label: 'Numero',      value: 'number'        },
  { label: 'Booleano',    value: 'boolean'       },
  { label: 'Selezione',   value: 'select'        },
  { label: 'Data',        value: 'date'          },
  { label: 'Rich text',   value: 'richtext'      },
  { label: 'Immagine',    value: 'image'         },
  { label: 'Relazione',   value: 'relationship'  },
  { label: 'Ripetitore',  value: 'repeater'      },
]

const FIELD_TYPE_LABELS: Record<string, string> = Object.fromEntries(FIELD_TYPES.map(t => [t.value, t.label]))

const router   = useRouter()
const route    = useRoute()
const toast    = useToast()
const appStore = useAppStore()

const groupId = computed(() => route.params.id as string | undefined)
const isNew   = computed(() => !groupId.value || groupId.value === 'new')
const loading = ref(!isNew.value)
const saving  = ref(false)

const form = ref({ name: '', description: '', postTypes: [] as string[] })
const fields = ref<FieldItem[]>([])

const postTypeOptions = computed(() => appStore.postTypes)

// ─── Field dialog ─────────────────────────────────────────────────────────────

const fieldDialogVisible = ref(false)
const editingField       = ref<FieldItem | null>(null)
const fieldForm = ref<FieldItemInput & { required: boolean; queryable: boolean; translatable: boolean }>({
  name: '', label: '', type: 'string', required: false, queryable: false, translatable: true,
})
const selectOptionsText = ref('')
const relPostType       = ref('')
const relMultiple       = ref(false)

const SUB_FIELD_TYPES = [
  { label: 'Testo',      value: 'string'   },
  { label: 'Area testo', value: 'textarea' },
  { label: 'Numero',     value: 'number'   },
  { label: 'Booleano',   value: 'boolean'  },
  { label: 'Data',       value: 'date'     },
]
const subFields    = ref<{ name: string; label: string; type: string }[]>([])
const newSubField  = ref({ name: '', label: '', type: 'string' })

function addSubField() {
  if (!newSubField.value.name.trim()) return
  subFields.value.push({
    name:  newSubField.value.name.trim().replace(/\s+/g, '_'),
    label: newSubField.value.label.trim() || newSubField.value.name.trim(),
    type:  newSubField.value.type,
  })
  newSubField.value = { name: '', label: '', type: 'string' }
}

function openFieldDialog(item?: FieldItem) {
  editingField.value = item ?? null
  if (item) {
    fieldForm.value = {
      name:         item.name,
      label:        item.label,
      type:         item.type,
      required:     item.required,
      queryable:    item.queryable,
      translatable: item.translatable !== false,
    }
    selectOptionsText.value = item.options?.join('\n') ?? ''
    relPostType.value       = (item.fieldOptions?.postType as string) ?? ''
    relMultiple.value       = (item.fieldOptions?.multiple as boolean) ?? false
    subFields.value         = (item.fieldOptions?.subFields as { name: string; label: string; type: string }[]) ?? []
  } else {
    fieldForm.value = { name: '', label: '', type: 'string', required: false, queryable: false, translatable: true }
    selectOptionsText.value = ''
    relPostType.value       = ''
    relMultiple.value       = false
    subFields.value         = []
  }
  fieldDialogVisible.value = true
}

// Auto-fill label from name (first time only)
function autoLabel() {
  if (!editingField.value && !fieldForm.value.label) {
    fieldForm.value.label = fieldForm.value.name
  }
}

async function saveField() {
  if (!fieldForm.value.name || !fieldForm.value.type) {
    toast.add({ severity: 'warn', summary: 'Attenzione', detail: 'Nome e tipo sono obbligatori', life: 3000 })
    return
  }

  const payload: FieldItemInput = {
    name:         fieldForm.value.name.trim().replace(/\s+/g, '_'),
    label:        fieldForm.value.label,
    type:         fieldForm.value.type,
    required:     fieldForm.value.required,
    queryable:    fieldForm.value.queryable,
    translatable: fieldForm.value.translatable,
  }

  if (fieldForm.value.type === 'select') {
    payload.options = selectOptionsText.value.split('\n').map(s => s.trim()).filter(Boolean)
  }
  if (fieldForm.value.type === 'relationship') {
    payload.fieldOptions = { postType: relPostType.value, multiple: relMultiple.value }
  }
  if (fieldForm.value.type === 'repeater') {
    payload.fieldOptions = { subFields: subFields.value }
  }

  try {
    if (isNew.value) {
      // Group not saved yet — keep field in local state only
      if (editingField.value) {
        const idx = fields.value.findIndex(f => f.id === editingField.value!.id)
        if (idx !== -1) fields.value[idx] = { ...fields.value[idx], ...payload, options: payload.options ?? [], fieldOptions: payload.fieldOptions ?? {} }
      } else {
        fields.value.push({
          id:           crypto.randomUUID(),
          groupId:      '',
          name:         payload.name ?? '',
          label:        payload.label ?? '',
          type:         payload.type ?? 'string',
          required:     payload.required ?? false,
          queryable:    payload.queryable ?? false,
          translatable: payload.translatable !== false,
          options:      payload.options ?? [],
          fieldOptions: payload.fieldOptions ?? {},
          defaultValue: null,
          sortOrder:    fields.value.length,
        })
      }
    } else {
      if (editingField.value) {
        const updated = await updateField(groupId.value!, editingField.value.id, payload)
        const idx = fields.value.findIndex(f => f.id === editingField.value!.id)
        if (idx !== -1) fields.value[idx] = updated
      } else {
        const created = await addField(groupId.value!, payload)
        fields.value.push(created)
      }
      // Refresh post types in store so changes appear in post editor
      appStore.reset()
      await appStore.load()
    }
    fieldDialogVisible.value = false
  } catch {
    toast.add({ severity: 'error', summary: 'Errore', detail: 'Impossibile salvare il campo', life: 3000 })
  }
}

async function removeField(fieldId: string) {
  if (!isNew.value) {
    try {
      await deleteField(groupId.value!, fieldId)
      appStore.reset()
      await appStore.load()
    } catch {
      toast.add({ severity: 'error', summary: 'Errore', detail: 'Impossibile eliminare il campo', life: 3000 })
      return
    }
  }
  fields.value = fields.value.filter(f => f.id !== fieldId)
}

// ─── Save group ───────────────────────────────────────────────────────────────

async function save() {
  if (!form.value.name.trim()) {
    toast.add({ severity: 'warn', summary: 'Attenzione', detail: 'Il nome del gruppo è obbligatorio', life: 3000 })
    return
  }
  saving.value = true
  try {
    const groupData = { name: form.value.name.trim(), description: form.value.description, postTypes: form.value.postTypes }

    if (isNew.value) {
      const created = await createFieldGroup(groupData)
      // Now save all locally buffered fields
      for (const f of fields.value) {
        await addField(created.id, {
          name:         f.name,
          label:        f.label,
          type:         f.type,
          required:     f.required,
          queryable:    f.queryable,
          options:      f.options,
          fieldOptions: f.fieldOptions,
        })
      }
    } else {
      await updateFieldGroup(groupId.value!, groupData)
    }

    appStore.reset()
    await appStore.load()
    toast.add({ severity: 'success', summary: 'Salvato', life: 2000 })
    router.push('/field-groups')
  } catch {
    toast.add({ severity: 'error', summary: 'Errore', detail: 'Impossibile salvare il gruppo', life: 3000 })
  } finally {
    saving.value = false
  }
}

// ─── Load existing ────────────────────────────────────────────────────────────

onMounted(async () => {
  if (isNew.value) return
  try {
    const group = await getFieldGroup(groupId.value!)
    form.value.name        = group.name
    form.value.description = group.description
    form.value.postTypes   = group.postTypes
    fields.value           = group.fields
  } catch {
    toast.add({ severity: 'error', summary: 'Errore', detail: 'Impossibile caricare il gruppo', life: 3000 })
    router.push('/field-groups')
  } finally {
    loading.value = false
  }
})
</script>
