<template>
  <div class="p-6 flex flex-col gap-6">
    <div class="flex items-center justify-between">
      <h2 class="text-2xl font-semibold">Utenti</h2>
      <Button label="+ Nuovo" @click="openNew" />
    </div>

    <DataTable
      :value="users"
      :loading="loading"
      class="bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-xl overflow-hidden"
    >
      <template #empty>
        <div class="p-4 text-center text-surface-400">Nessun utente trovato.</div>
      </template>
      <Column field="username" header="Username" />
      <Column field="email" header="Email" />
      <Column header="Ruolo">
        <template #body="{ data: u }">{{ u.role?.name }}</template>
      </Column>
      <Column header="Azioni" style="width: 120px">
        <template #body="{ data: u }">
          <div class="flex gap-2">
            <Button icon="pi pi-pencil" size="small" severity="secondary" text @click="openEdit(u)" />
            <Button
              v-if="u.id !== authStore.user?.id"
              icon="pi pi-trash"
              size="small"
              severity="danger"
              text
              @click="confirmDelete(u)"
            />
          </div>
        </template>
      </Column>
    </DataTable>
  </div>

  <!-- Dialog utente -->
  <Dialog v-model:visible="dialogVisible" :header="dialogTitle" modal style="width: 440px">
    <div class="flex flex-col gap-4 pt-2">
      <div class="flex flex-col gap-1">
        <label class="text-sm font-medium">Username <span class="text-red-500">*</span></label>
        <InputText v-model="form.username" :disabled="!!editingId" class="w-full" />
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-sm font-medium">Email <span class="text-red-500">*</span></label>
        <InputText v-model="form.email" type="email" class="w-full" />
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-sm font-medium">
          Password{{ editingId ? ' (lascia vuoto per non cambiare)' : ' *' }}
        </label>
        <Password v-model="form.password" :feedback="false" toggle-mask class="w-full" input-class="w-full" />
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-sm font-medium">Ruolo</label>
        <Select v-model="form.roleSlug" :options="roles" option-label="name" option-value="slug" placeholder="Seleziona ruolo" class="w-full" />
      </div>
      <div v-if="formError" class="text-red-500 text-sm">{{ formError }}</div>
    </div>
    <template #footer>
      <Button label="Annulla" severity="secondary" @click="dialogVisible = false" />
      <Button :label="editingId ? 'Aggiorna' : 'Crea'" :loading="saving" @click="submitForm" />
    </template>
  </Dialog>

  <ConfirmDialog />
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import { useAuthStore } from '@/stores/auth.js'
import { usersApi, rolesApi } from '@/api/users.js'
import type { UserListItem, Role } from '@/api/users.js'

const confirm   = useConfirm()
const toast     = useToast()
const authStore = useAuthStore()

const loading        = ref(false)
const saving         = ref(false)
const users          = ref<UserListItem[]>([])
const roles          = ref<Role[]>([])
const dialogVisible  = ref(false)
const editingId      = ref<number | null>(null)
const formError      = ref('')

const form = ref({ username: '', email: '', password: '', roleSlug: '' })

const dialogTitle = computed(() => editingId.value ? 'Modifica utente' : 'Nuovo utente')

async function loadData() {
  loading.value = true
  try {
    [users.value, roles.value] = await Promise.all([usersApi.list(), rolesApi.list()])
  } finally {
    loading.value = false
  }
}

function openNew() {
  editingId.value = null
  form.value = { username: '', email: '', password: '', roleSlug: roles.value[0]?.slug ?? '' }
  formError.value = ''
  dialogVisible.value = true
}

function openEdit(u: UserListItem) {
  editingId.value = u.id
  form.value = { username: u.username, email: u.email, password: '', roleSlug: u.role?.slug ?? '' }
  formError.value = ''
  dialogVisible.value = true
}

async function submitForm() {
  formError.value = ''
  if (!form.value.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.value.email)) {
    formError.value = 'Email non valida.'
    return
  }
  if (!editingId.value) {
    if (!form.value.username.trim()) { formError.value = 'Username richiesto.'; return }
    if (form.value.password.length < 8) { formError.value = 'Password minimo 8 caratteri.'; return }
  } else if (form.value.password && form.value.password.length < 8) {
    formError.value = 'Password minimo 8 caratteri.'
    return
  }
  saving.value = true
  try {
    if (editingId.value) {
      const data: Record<string, string> = { email: form.value.email, roleSlug: form.value.roleSlug }
      if (form.value.password) data.password = form.value.password
      await usersApi.update(editingId.value, data)
    } else {
      await usersApi.create({ username: form.value.username, email: form.value.email, password: form.value.password, roleSlug: form.value.roleSlug })
    }
    dialogVisible.value = false
    toast.add({ severity: 'success', summary: 'Salvato', detail: 'Utente salvato', life: 2000 })
    await loadData()
  } catch (e: unknown) {
    formError.value = e instanceof Error ? e.message : 'Errore nel salvataggio.'
  } finally {
    saving.value = false
  }
}

function confirmDelete(u: UserListItem) {
  confirm.require({
    message:     `Eliminare l'utente "${u.username}"?`,
    header:      'Conferma eliminazione',
    icon:        'pi pi-exclamation-triangle',
    rejectLabel: 'Annulla',
    acceptLabel: 'Elimina',
    acceptClass: 'p-button-danger',
    accept: async () => {
      try {
        await usersApi.delete(u.id)
        toast.add({ severity: 'success', summary: 'Eliminato', detail: 'Utente eliminato', life: 2000 })
        await loadData()
      } catch {
        toast.add({ severity: 'error', summary: 'Errore', detail: 'Impossibile eliminare l\'utente', life: 3000 })
      }
    },
  })
}

onMounted(loadData)
</script>
