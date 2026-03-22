<template>
  <div class="p-6">
    <!-- Header -->
    <div class="flex items-center gap-3 mb-2">
      <RouterLink to="/forms">
        <Button icon="pi pi-arrow-left" text plain />
      </RouterLink>
      <div>
        <h1 class="text-2xl font-bold">Submission</h1>
        <p class="text-surface-400 text-sm mt-0.5" v-if="form">
          Form: <span class="font-medium text-surface-600">{{ form.name }}</span>
          — <Tag :value="form.status === 'active' ? 'Attivo' : 'Inattivo'" :severity="form.status === 'active' ? 'success' : 'secondary'" />
        </p>
      </div>
    </div>

    <!-- Stats -->
    <div class="text-sm text-surface-400 mb-4" v-if="!loading">
      {{ total }} submission totali
    </div>

    <!-- Tabella -->
    <DataTable
      :value="submissions"
      :loading="loading"
      striped-rows
      class="w-full"
      scroll-height="600px"
    >
      <template #empty>
        <div class="text-center py-8 text-surface-400">
          Nessuna submission ricevuta per questo form.
        </div>
      </template>

      <Column header="Data" style="width: 160px">
        <template #body="{ data: sub }: { data: FormSubmission }">
          <span class="text-sm">{{ formatDate(sub.createdAt) }}</span>
        </template>
      </Column>

      <!-- Colonne dinamiche per ogni campo del form -->
      <Column
        v-for="field in form?.fields ?? []"
        :key="field.id"
        :header="field.label"
      >
        <template #body="{ data: sub }: { data: FormSubmission }">
          <span class="text-sm">{{ formatFieldValue(sub.data[field.name], field.type) }}</span>
        </template>
      </Column>

      <Column header="IP" style="width: 130px">
        <template #body="{ data: sub }: { data: FormSubmission }">
          <span class="text-xs text-surface-400 font-mono">{{ sub.ip ?? '—' }}</span>
        </template>
      </Column>

      <Column style="width: 60px">
        <template #body="{ data: sub }: { data: FormSubmission }">
          <Button
            icon="pi pi-trash"
            text plain
            size="small"
            severity="danger"
            v-tooltip="'Elimina'"
            @click="confirmDeleteSubmission(sub)"
          />
        </template>
      </Column>
    </DataTable>

    <!-- Paginazione -->
    <div class="flex justify-center mt-4" v-if="total > limit">
      <Paginator
        :rows="limit"
        :total-records="total"
        :first="(currentPage - 1) * limit"
        @page="onPage"
      />
    </div>

    <ConfirmDialog />
    <Toast />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { getForm, getFormSubmissions, deleteSubmission } from '@/api/forms.js'
import type { Form, FormSubmission, FormFieldType } from '@/api/forms.js'
import { ApiError } from '@/api/client.js'

const route   = useRoute()
const toast   = useToast()
const confirm = useConfirm()

const form        = ref<Form | null>(null)
const submissions = ref<FormSubmission[]>([])
const loading     = ref(false)
const total       = ref(0)
const currentPage = ref(1)
const limit       = 20

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatFieldValue(value: unknown, type: FormFieldType): string {
  if (value === undefined || value === null) return '—'
  if (type === 'checkbox') return value ? 'Sì' : 'No'
  if (type === 'date' && typeof value === 'string') {
    return new Date(value).toLocaleDateString('it-IT')
  }
  return String(value)
}

async function load() {
  loading.value = true
  try {
    const formId = route.params['id'] as string
    const [formData, subData] = await Promise.all([
      getForm(formId),
      getFormSubmissions(formId, { page: currentPage.value, limit }),
    ])
    form.value        = formData
    submissions.value = subData.data
    total.value       = subData.total
  } catch (err) {
    const msg = err instanceof ApiError ? err.message : 'Errore nel caricamento'
    toast.add({ severity: 'error', summary: 'Errore', detail: msg, life: 4000 })
  } finally {
    loading.value = false
  }
}

async function onPage(event: { page: number }) {
  currentPage.value = event.page + 1
  await load()
}

function confirmDeleteSubmission(sub: FormSubmission) {
  confirm.require({
    message:     'Eliminare questa submission?',
    header:      'Conferma eliminazione',
    icon:        'pi pi-exclamation-triangle',
    acceptLabel: 'Elimina',
    rejectLabel: 'Annulla',
    acceptClass: 'p-button-danger',
    accept: async () => {
      try {
        await deleteSubmission(sub.id)
        submissions.value = submissions.value.filter(s => s.id !== sub.id)
        total.value--
        toast.add({ severity: 'success', summary: 'Eliminata', detail: 'Submission eliminata', life: 3000 })
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : 'Errore durante l\'eliminazione'
        toast.add({ severity: 'error', summary: 'Errore', detail: msg, life: 4000 })
      }
    },
  })
}

onMounted(load)
</script>
