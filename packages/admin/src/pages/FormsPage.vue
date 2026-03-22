<template>
  <div class="p-6">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold">Form</h1>
      <RouterLink to="/forms/new">
        <Button label="Nuovo form" icon="pi pi-plus" />
      </RouterLink>
    </div>

    <DataTable
      :value="forms"
      :loading="loading"
      striped-rows
      class="w-full"
    >
      <template #empty>
        <div class="text-center py-8 text-surface-400">
          Nessun form creato. <RouterLink to="/forms/new" class="text-primary-500 underline">Crea il primo</RouterLink>.
        </div>
      </template>

      <Column field="name" header="Nome">
        <template #body="{ data: form }: { data: Form }">
          <span class="font-medium">{{ form.name }}</span>
          <span class="ml-2 text-sm text-surface-400">/{{ form.slug }}</span>
        </template>
      </Column>

      <Column field="description" header="Descrizione">
        <template #body="{ data: form }: { data: Form }">
          <span class="text-surface-500 text-sm">{{ form.description || '—' }}</span>
        </template>
      </Column>

      <Column header="Campi" style="width: 80px; text-align: center">
        <template #body="{ data: form }: { data: Form }">
          <Tag :value="String(form.fields.length)" severity="secondary" />
        </template>
      </Column>

      <Column header="Stato" style="width: 100px">
        <template #body="{ data: form }: { data: Form }">
          <Tag
            :value="form.status === 'active' ? 'Attivo' : 'Inattivo'"
            :severity="form.status === 'active' ? 'success' : 'secondary'"
          />
        </template>
      </Column>

      <Column header="Azioni" style="width: 200px">
        <template #body="{ data: form }: { data: Form }">
          <div class="flex gap-2">
            <RouterLink :to="`/forms/${form.id}/edit`">
              <Button icon="pi pi-pencil" text plain size="small" v-tooltip="'Modifica'" />
            </RouterLink>
            <RouterLink :to="`/forms/${form.id}/submissions`">
              <Button icon="pi pi-inbox" text plain size="small" v-tooltip="'Submission'" />
            </RouterLink>
            <Button
              icon="pi pi-trash"
              text plain
              size="small"
              severity="danger"
              v-tooltip="'Elimina'"
              @click="confirmDelete(form)"
            />
          </div>
        </template>
      </Column>
    </DataTable>

    <ConfirmDialog />
    <Toast />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { getForms, deleteForm } from '@/api/forms.js'
import type { Form } from '@/api/forms.js'
import { ApiError } from '@/api/client.js'

const toast   = useToast()
const confirm = useConfirm()

const forms   = ref<Form[]>([])
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    forms.value = await getForms()
  } catch (err) {
    const msg = err instanceof ApiError ? err.message : 'Errore nel caricamento dei form'
    toast.add({ severity: 'error', summary: 'Errore', detail: msg, life: 4000 })
  } finally {
    loading.value = false
  }
}

function confirmDelete(form: Form) {
  confirm.require({
    message:       `Eliminare il form "${form.name}" e tutte le sue submission?`,
    header:        'Conferma eliminazione',
    icon:          'pi pi-exclamation-triangle',
    acceptLabel:   'Elimina',
    rejectLabel:   'Annulla',
    acceptClass:   'p-button-danger',
    accept: async () => {
      try {
        await deleteForm(form.id)
        forms.value = forms.value.filter(f => f.id !== form.id)
        toast.add({ severity: 'success', summary: 'Eliminato', detail: `Form "${form.name}" eliminato`, life: 3000 })
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : 'Errore durante l\'eliminazione'
        toast.add({ severity: 'error', summary: 'Errore', detail: msg, life: 4000 })
      }
    },
  })
}

onMounted(load)
</script>
