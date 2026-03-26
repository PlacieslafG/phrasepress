<template>
  <div class="p-6 flex flex-col gap-4">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-semibold">{{ codex?.label ?? route.params.codex }}</h2>
      <Button icon="pi pi-plus" :label="`Nuovo ${codex?.label ?? ''}`" @click="goNew" />
    </div>

    <!-- Filtri -->
    <div class="flex items-center gap-3 flex-wrap">
      <InputText
        v-model="filterSearch"
        placeholder="Cerca..."
        class="w-52"
        @input="onSearchInput"
      />
      <Select
        v-model="filterStatus"
        :options="statusOptions"
        option-label="label"
        option-value="value"
        placeholder="Tutti gli stati"
        show-clear
        class="w-44"
        @change="onFilterChange"
      />
      <Select
        v-model="filterAuthor"
        :options="authors"
        option-label="username"
        option-value="id"
        placeholder="Tutti gli autori"
        show-clear
        class="w-44"
        @change="onFilterChange"
      />
      <DatePicker
        v-model="filterDateFrom"
        placeholder="Dal"
        date-format="dd/mm/yy"
        show-button-bar
        class="w-36"
        @date-select="onFilterChange"
        @clear-click="onFilterChange"
      />
      <DatePicker
        v-model="filterDateTo"
        placeholder="Al"
        date-format="dd/mm/yy"
        show-button-bar
        class="w-36"
        @date-select="onFilterChange"
        @clear-click="onFilterChange"
      />
      <Button
        v-if="hasActiveFilters"
        icon="pi pi-times"
        label="Azzera filtri"
        severity="secondary"
        size="small"
        text
        @click="resetFilters"
      />
    </div>

    <!-- Tabella -->
    <DataTable
      :value="posts"
      :loading="loading"
      lazy
      paginator
      :rows="limit"
      :total-records="total"
      :rows-per-page-options="[10, 25, 50]"
      :sort-field="sortField"
      :sort-order="sortOrder"
      @page="onPage"
      @sort="onSort"
      data-key="id"
      striped-rows
      class="text-sm"
    >
      <template #empty>Nessun folio trovato.</template>

      <Column field="fields.title" header="Titolo" sortable>
        <template #body="{ data }">
          <span class="font-medium cursor-pointer hover:underline" @click="goEdit(data.id)">
            {{ data.fields?.title ?? '—' }}
          </span>
        </template>
      </Column>

      <Column field="stage" header="Stato" class="w-28">
        <template #body="{ data }">
          <Tag
            :value="data.stage"
            :severity="data.stage === 'published' ? 'success' : data.stage === 'trash' ? 'danger' : 'secondary'"
          />
        </template>
      </Column>

      <Column field="authorId" header="Autore" class="w-36">
        <template #body="{ data }">
          {{ authorName(data.authorId) }}
        </template>
      </Column>

      <Column field="createdAt" header="Data" class="w-36" sortable>
        <template #body="{ data }">
          {{ formatDate(data.createdAt) }}
        </template>
      </Column>

      <Column header="Azioni" class="w-40">
        <template #body="{ data }">
          <div class="flex gap-1">
            <Button icon="pi pi-pencil" text rounded size="small" @click="goEdit(data.id)" />
            <Button
              v-if="data.stage === 'draft'"
              icon="pi pi-send" text rounded size="small" severity="success"
              v-tooltip="'Pubblica'"
              @click="setStage(data, 'published')"
            />
            <Button
              v-else-if="data.stage === 'published'"
              icon="pi pi-eye-slash" text rounded size="small" severity="secondary"
              v-tooltip="'Metti in bozza'"
              @click="setStage(data, 'draft')"
            />
            <Button
              v-if="data.stage !== 'trash'"
              icon="pi pi-trash" text rounded size="small" severity="warn"
              @click="trashFolio(data)"
            />
            <Button
              v-else
              icon="pi pi-times-circle" text rounded size="small" severity="danger"
              v-tooltip="'Elimina definitivamente'"
              @click="deleteFolio(data)"
            />
          </div>
        </template>
      </Column>
    </DataTable>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app.js'
import { foliosApi } from '@/api/folios.js'
import type { Folio } from '@/api/folios.js'
import { usersApi } from '@/api/users.js'
import type { UserListItem } from '@/api/users.js'
import { useToast } from 'primevue/usetoast'

const route    = useRoute()
const router   = useRouter()
const appStore = useAppStore()
const toast    = useToast()

const type  = computed(() => route.params.codex as string)
const codex = computed(() => appStore.codices.find((c) => c.name === type.value))

const posts   = ref<Folio[]>([])
const total   = ref(0)
const loading = ref(false)
const page    = ref(1)
const limit   = ref(25)

// Filtri
const filterSearch   = ref('')
const filterStatus   = ref<string | null>(null)
const filterAuthor   = ref<number | null>(null)
const filterDateFrom = ref<Date | null>(null)
const filterDateTo   = ref<Date | null>(null)

// Ordinamento
const sortField = ref<string | undefined>(undefined)
const sortOrder = ref<1 | -1>(1)

// Utenti per il dropdown autore
const authors = ref<UserListItem[]>([])

const statusOptions = [
  { label: 'Pubblicati', value: 'published' },
  { label: 'Bozze',      value: 'draft' },
  { label: 'Cestino',    value: 'trash' },
]

const hasActiveFilters = computed(() =>
  !!filterSearch.value || !!filterStatus.value || !!filterAuthor.value ||
  !!filterDateFrom.value || !!filterDateTo.value,
)

function authorName(id: number | null): string {
  if (id === null) return '—'
  return authors.value.find(u => u.id === id)?.username ?? String(id)
}

function formatDate(ts: number) {
  return new Date(ts * 1000).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
}

async function loadList() {
  loading.value = true
  try {
    const params: Record<string, string | number> = {
      page:  page.value,
      limit: limit.value,
      stage: filterStatus.value ?? 'any',
    }
    if (filterSearch.value)   params['search']   = filterSearch.value
    if (filterAuthor.value)   params['authorId']  = filterAuthor.value
    if (filterDateFrom.value) params['dateFrom']  = Math.floor(filterDateFrom.value.getTime() / 1000)
    if (filterDateTo.value)   params['dateTo']    = Math.floor(filterDateTo.value.getTime() / 1000)
    if (sortField.value) {
      params['orderBy'] = sortField.value
      params['order']   = sortOrder.value === 1 ? 'asc' : 'desc'
    }

    const res = await foliosApi.list(type.value, params as Parameters<typeof foliosApi.list>[1])
    posts.value = res.data
    total.value = res.total
  } catch {
    toast.add({ severity: 'error', summary: 'Errore', detail: 'Impossibile caricare i post', life: 3000 })
  } finally {
    loading.value = false
  }
}

function onPage(event: { page: number; rows: number }) {
  page.value  = event.page + 1
  limit.value = event.rows
  loadList()
}

function onSort(event: { sortField?: string | ((item: unknown) => string) | null; sortOrder?: 0 | 1 | -1 | null }) {
  sortField.value = typeof event.sortField === 'string' ? event.sortField : undefined
  sortOrder.value = (event.sortOrder === 1 || event.sortOrder === -1) ? event.sortOrder : 1
  page.value = 1
  loadList()
}

function onFilterChange() {
  page.value = 1
  loadList()
}

let searchTimer: ReturnType<typeof setTimeout> | null = null
function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { page.value = 1; void loadList() }, 400)
}

function resetFilters() {
  filterSearch.value   = ''
  filterStatus.value   = null
  filterAuthor.value   = null
  filterDateFrom.value = null
  filterDateTo.value   = null
  sortField.value = undefined
  page.value           = 1
  loadList()
}

function goNew()            { router.push(`/folios/${type.value}/new`) }
function goEdit(id: number) { router.push(`/folios/${type.value}/${id}/edit`) }

async function setStage(folio: Folio, stage: string) {
  try {
    const updated = await foliosApi.update(type.value, folio.id, { stage })
    const idx = posts.value.findIndex(p => p.id === folio.id)
    if (idx !== -1) posts.value[idx] = updated
    toast.add({ severity: 'success', summary: stage === 'published' ? 'Pubblicato' : 'Messo in bozza', life: 2000 })
  } catch {
    toast.add({ severity: 'error', summary: 'Errore', detail: 'Impossibile cambiare stato', life: 3000 })
  }
}

async function trashFolio(folio: Folio) {
  try {
    await foliosApi.delete(type.value, folio.id)
    await loadList()
    toast.add({ severity: 'success', summary: 'Spostato nel cestino', life: 2000 })
  } catch {
    toast.add({ severity: 'error', summary: 'Errore', detail: 'Impossibile spostare nel cestino', life: 3000 })
  }
}

async function deleteFolio(folio: Folio) {
  try {
    await foliosApi.delete(type.value, folio.id, true)
    await loadList()
    toast.add({ severity: 'success', summary: 'Eliminato', life: 2000 })
  } catch {
    toast.add({ severity: 'error', summary: 'Errore', detail: 'Impossibile eliminare', life: 3000 })
  }
}

async function loadAuthors() {
  try {
    authors.value = await usersApi.list()
  } catch {
    // non bloccare il caricamento se gli utenti non si caricano
  }
}

watch(type, () => {
  page.value           = 1
  filterSearch.value   = ''
  filterStatus.value   = null
  filterAuthor.value   = null
  filterDateFrom.value = null
  filterDateTo.value   = null
  sortField.value = undefined
  loadList()
})

onMounted(() => {
  void loadAuthors()
  void loadList()
})
</script>
