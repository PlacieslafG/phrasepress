<template>
  <div class="p-6 flex flex-col gap-4">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-semibold">{{ postType?.label ?? route.params.type }}</h2>
      <Button icon="pi pi-plus" :label="`Nuovo ${postType?.label ?? ''}`" @click="goNew" />
    </div>

    <!-- Filtri -->
    <div class="flex items-center gap-3 flex-wrap">
      <Select
        v-model="filterStatus"
        :options="statusOptions"
        option-label="label"
        option-value="value"
        placeholder="Tutti gli status"
        show-clear
        class="w-44"
        @change="loadList"
      />
      <InputText
        v-model="filterSearch"
        placeholder="Cerca..."
        class="w-52"
        @input="onSearchInput"
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
      @page="onPage"
      data-key="id"
      striped-rows
      class="text-sm"
    >
      <template #empty>Nessun post trovato.</template>

      <Column field="title" header="Titolo">
        <template #body="{ data }">
          <span class="font-medium cursor-pointer hover:underline" @click="goEdit(data.id)">
            {{ data.title }}
          </span>
        </template>
      </Column>

      <Column field="status" header="Status" class="w-28">
        <template #body="{ data }">
          <Tag
            :value="data.status"
            :severity="data.status === 'published' ? 'success' : data.status === 'trash' ? 'danger' : 'secondary'"
          />
        </template>
      </Column>

      <Column header="Data" class="w-36">
        <template #body="{ data }">
          {{ formatDate(data.updatedAt) }}
        </template>
      </Column>

      <Column header="Azioni" class="w-40">
        <template #body="{ data }">
          <div class="flex gap-1">
            <Button icon="pi pi-pencil" text rounded size="small" @click="goEdit(data.id)" />
            <Button
              v-if="data.status === 'draft'"
              icon="pi pi-send" text rounded size="small" severity="success"
              v-tooltip="'Pubblica'"
              @click="setStatus(data, 'published')"
            />
            <Button
              v-else-if="data.status === 'published'"
              icon="pi pi-eye-slash" text rounded size="small" severity="secondary"
              v-tooltip="'Metti in bozza'"
              @click="setStatus(data, 'draft')"
            />
            <Button
              v-if="data.status !== 'trash'"
              icon="pi pi-trash" text rounded size="small" severity="warn"
              @click="trashPost(data)"
            />
            <Button
              v-else
              icon="pi pi-times-circle" text rounded size="small" severity="danger"
              v-tooltip="'Elimina definitivamente'"
              @click="deletePost(data)"
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
import { postsApi } from '@/api/posts.js'
import type { Post } from '@/api/posts.js'
import { useToast } from 'primevue/usetoast'

const route   = useRoute()
const router  = useRouter()
const appStore = useAppStore()
const toast   = useToast()

const type = computed(() => route.params.type as string)
const postType = computed(() => appStore.postTypes.find((p) => p.name === type.value))

const posts   = ref<Post[]>([])
const total   = ref(0)
const loading = ref(false)
const page    = ref(1)
const limit   = ref(25)

const filterStatus = ref<string | null>(null)
const filterSearch = ref('')

const statusOptions = [
  { label: 'Pubblicati', value: 'published' },
  { label: 'Bozze',      value: 'draft' },
  { label: 'Cestino',    value: 'trash' },
]

function formatDate(ts: number) {
  return new Date(ts * 1000).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
}

async function loadList() {
  loading.value = true
  try {
    const params: Record<string, string | number> = {
      type: type.value,
      page: page.value,
      limit: limit.value,
      status: filterStatus.value ?? 'any',
    }
    if (filterSearch.value) params['search'] = filterSearch.value
    const res = await postsApi.list(params as Parameters<typeof postsApi.list>[0])
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

function goNew()        { router.push(`/posts/${type.value}/new`) }
function goEdit(id: number) { router.push(`/posts/${type.value}/${id}/edit`) }

let searchTimer: ReturnType<typeof setTimeout> | null = null
function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { page.value = 1; void loadList() }, 400)
}

async function setStatus(post: Post, status: 'published' | 'draft') {
  try {
    const updated = await postsApi.update(post.id, { status })
    const idx = posts.value.findIndex(p => p.id === post.id)
    if (idx !== -1) posts.value[idx] = updated
    toast.add({ severity: 'success', summary: status === 'published' ? 'Pubblicato' : 'Messo in bozza', life: 2000 })
  } catch {
    toast.add({ severity: 'error', summary: 'Errore', detail: 'Impossibile cambiare stato', life: 3000 })
  }
}

async function trashPost(post: Post) {
  try {
    await postsApi.delete(post.id)
    await loadList()
    toast.add({ severity: 'success', summary: 'Spostato nel cestino', life: 2000 })
  } catch {
    toast.add({ severity: 'error', summary: 'Errore', detail: 'Impossibile spostare nel cestino', life: 3000 })
  }
}

async function deletePost(post: Post) {
  try {
    await postsApi.delete(post.id, true)
    await loadList()
    toast.add({ severity: 'success', summary: 'Eliminato', life: 2000 })
  } catch {
    toast.add({ severity: 'error', summary: 'Errore', detail: 'Impossibile eliminare', life: 3000 })
  }
}

watch(type, () => {
  page.value = 1
  filterStatus.value = null
  filterSearch.value = ''
  loadList()
})

onMounted(loadList)
</script>
