<template>
  <div class="p-6 flex flex-col gap-6">
    <h2 class="text-2xl font-semibold">{{ taxonomyDef?.name ?? route.params.slug }}</h2>

    <div class="grid grid-cols-[300px_1fr] gap-6 items-start">
      <!-- Form aggiunta/modifica -->
      <div class="bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-xl p-5 flex flex-col gap-4">
        <h3 class="font-semibold text-base">{{ editing ? 'Modifica term' : 'Aggiungi term' }}</h3>

        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium">Nome <span class="text-red-500">*</span></label>
          <InputText v-model="form.name" @input="onNameInput" placeholder="Nome term" class="w-full" />
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium">Slug</label>
          <InputText v-model="form.slug" placeholder="slug-automatico" class="w-full" />
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium">Descrizione</label>
          <Textarea v-model="form.description" rows="3" class="w-full" />
        </div>

        <div v-if="taxonomyDef?.hierarchical" class="flex flex-col gap-1">
          <label class="text-sm font-medium">Genitore</label>
          <Select
            v-model="form.parentId"
            :options="parentOptions"
            option-label="label"
            option-value="value"
            placeholder="Nessun genitore"
            show-clear
            class="w-full"
          />
        </div>

        <div class="flex gap-2">
          <Button
            :label="editing ? 'Aggiorna term' : 'Aggiungi term'"
            :loading="saving"
            @click="submitForm"
            class="flex-1"
          />
          <Button
            v-if="editing"
            label="Annulla"
            severity="secondary"
            @click="resetForm"
          />
        </div>
      </div>

      <!-- Tabella terms -->
      <DataTable
        :value="flatRows"
        :loading="loading"
        class="bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-xl overflow-hidden"
      >
        <template #empty>
          <div class="p-4 text-center text-surface-400">Nessun term trovato.</div>
        </template>

        <Column field="name" header="Nome">
          <template #body="{ data: row }">
            <span v-if="row.depth > 0" class="text-surface-400 mr-1">{{ '— '.repeat(row.depth) }}</span>
            {{ row.name }}
          </template>
        </Column>
        <Column field="slug" header="Slug" />
        <Column field="description" header="Descrizione">
          <template #body="{ data: row }">
            <span class="text-surface-400 text-sm">{{ truncate(row.description, 50) }}</span>
          </template>
        </Column>
        <Column field="postCount" header="Post" style="width: 80px; text-align: center" />
        <Column header="Azioni" style="width: 140px">
          <template #body="{ data: row }">
            <div class="flex gap-2">
              <Button label="Modifica" size="small" severity="secondary" @click="startEdit(row)" />
              <Button icon="pi pi-trash" size="small" severity="danger" text @click="confirmDelete(row)" />
            </div>
          </template>
        </Column>
      </DataTable>
    </div>
  </div>

</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import { useAppStore } from '@/stores/app.js'
import { taxonomiesApi } from '@/api/taxonomies.js'
import type { Term, TermWithChildren } from '@/api/taxonomies.js'

function generateSlug(v: string): string {
  return v.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

interface FlatRow extends Term { depth: number }

const route    = useRoute()
const confirm  = useConfirm()
const toast    = useToast()
const appStore = useAppStore()

const loading = ref(false)
const saving  = ref(false)

const editing    = ref<Term | null>(null)
const allTerms   = ref<TermWithChildren[]>([])

const form = ref({ name: '', slug: '', description: '', parentId: null as number | null })

let slugManuallyEdited = false

const taxonomyDef = computed(() =>
  appStore.taxonomies.find(t => t.slug === route.params.slug as string)
)

// Righe piatte con profondità per visualizzazione gerarchica
const flatRows = computed<FlatRow[]>(() => flatten(allTerms.value, 0))

function flatten(terms: TermWithChildren[], depth: number): FlatRow[] {
  const result: FlatRow[] = []
  for (const t of terms) {
    result.push({ ...t, depth })
    if (t.children?.length) result.push(...flatten(t.children, depth + 1))
  }
  return result
}

// Opzioni per il select "Genitore" (esclude il term in modifica e i suoi discendenti)
const parentOptions = computed(() => {
  const excluded = editing.value ? getDescendantIds(allTerms.value, editing.value.id) : new Set<number>()
  if (editing.value) excluded.add(editing.value.id)
  return [
    { label: '— Nessun genitore —', value: null },
    ...flatRows.value
      .filter(r => !excluded.has(r.id))
      .map(r => ({ label: '  '.repeat(r.depth) + r.name, value: r.id })),
  ]
})

function getDescendantIds(terms: TermWithChildren[], id: number): Set<number> {
  const result = new Set<number>()
  function walk(list: TermWithChildren[]) {
    for (const t of list) {
      if (t.id === id) { collectIds(t.children); return }
      walk(t.children)
    }
  }
  function collectIds(list: TermWithChildren[]) {
    for (const t of list) { result.add(t.id); collectIds(t.children) }
  }
  walk(terms)
  return result
}

function truncate(s: string, max: number) {
  return s.length > max ? s.slice(0, max) + '…' : s
}

function onNameInput() {
  if (!slugManuallyEdited) form.value.slug = generateSlug(form.value.name)
}

async function loadTerms() {
  loading.value = true
  try {
    allTerms.value = await taxonomiesApi.getTerms(route.params.slug as string)
  } catch {
    toast.add({ severity: 'error', summary: 'Errore', detail: 'Impossibile caricare i terms', life: 3000 })
  } finally {
    loading.value = false
  }
}

function resetForm() {
  editing.value = null
  form.value = { name: '', slug: '', description: '', parentId: null }
  slugManuallyEdited = false
}

function startEdit(term: FlatRow) {
  editing.value = term
  form.value = { name: term.name, slug: term.slug, description: term.description ?? '', parentId: term.parentId }
  slugManuallyEdited = true
}

async function submitForm() {
  if (!form.value.name.trim()) return
  saving.value = true
  try {
    const slug = route.params.slug as string
    const payload = { name: form.value.name, slug: form.value.slug || undefined, description: form.value.description, parentId: form.value.parentId ?? undefined }
    if (editing.value) {
      await taxonomiesApi.updateTerm(slug, editing.value.id, payload)
      toast.add({ severity: 'success', summary: 'Aggiornato', detail: 'Term aggiornato', life: 2000 })
    } else {
      await taxonomiesApi.createTerm(slug, payload)
      toast.add({ severity: 'success', summary: 'Creato', detail: 'Term creato', life: 2000 })
    }
    resetForm()
    await loadTerms()
  } catch {
    toast.add({ severity: 'error', summary: 'Errore', detail: 'Operazione fallita', life: 3000 })
  } finally {
    saving.value = false
  }
}

function confirmDelete(term: FlatRow) {
  confirm.require({
    message:       `Eliminare il term "${term.name}"? I post associati perderanno questo term.`,
    header:        'Conferma eliminazione',
    icon:          'pi pi-exclamation-triangle',
    rejectLabel:   'Annulla',
    acceptLabel:   'Elimina',
    acceptClass:   'p-button-danger',
    accept: async () => {
      try {
        await taxonomiesApi.deleteTerm(route.params.slug as string, term.id)
        toast.add({ severity: 'success', summary: 'Eliminato', detail: 'Term eliminato', life: 2000 })
        if (editing.value?.id === term.id) resetForm()
        await loadTerms()
      } catch {
        toast.add({ severity: 'error', summary: 'Errore', detail: 'Impossibile eliminare il term', life: 3000 })
      }
    },
  })
}

watch(
  () => route.params.slug,
  () => { resetForm(); loadTerms() },
  { immediate: false }
)

onMounted(async () => {
  await appStore.load()
  await loadTerms()
})
</script>
