<template>
  <div class="p-6 flex flex-col gap-6">
    <div class="flex items-center justify-between">
      <h2 class="text-2xl font-semibold">Ruoli</h2>
      <Button label="+ Nuovo ruolo" @click="openNew" />
    </div>

    <div v-if="loading" class="text-surface-400 text-sm">Caricamento...</div>

    <div v-for="role in roles" :key="role.id" class="bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-xl p-5 flex flex-col gap-4">
      <div class="flex items-center justify-between">
        <div>
          <span class="font-semibold text-base">{{ role.name }}</span>
          <span class="ml-2 text-surface-400 text-sm font-mono">{{ role.slug }}</span>
        </div>
        <div class="flex gap-2">
          <Button label="Modifica" size="small" severity="secondary" @click="openEdit(role)" />
          <Button
            v-if="role.slug !== 'administrator'"
            label="Elimina"
            size="small"
            severity="danger"
            text
            @click="confirmDelete(role)"
          />
        </div>
      </div>

      <div class="grid grid-cols-2 gap-x-8 gap-y-1">
        <template v-for="(caps, groupName) in CAPABILITY_GROUPS" :key="groupName">
          <div class="col-span-2 mt-2 text-xs font-semibold text-surface-500 uppercase tracking-wide">{{ groupName }}</div>
          <div v-for="cap in caps" :key="cap" class="flex items-center gap-2 text-sm">
            <span :class="role.capabilities.includes(cap) ? 'pi pi-check-circle text-green-500' : 'pi pi-times-circle text-surface-400'" />
            {{ cap }}
          </div>
        </template>
      </div>
    </div>
  </div>

  <!-- Dialog ruolo -->
  <Dialog v-model:visible="dialogVisible" :header="dialogTitle" modal style="width: 520px">
    <div class="flex flex-col gap-4 pt-2">
      <div class="flex flex-col gap-1">
        <label class="text-sm font-medium">Nome <span class="text-red-500">*</span></label>
        <InputText v-model="form.name" @input="onNameInput" class="w-full" />
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-sm font-medium">Slug</label>
        <InputText v-model="form.slug" :disabled="!!editingId" placeholder="auto-generato" class="w-full" />
        <span v-if="!editingId" class="text-xs text-surface-400">Non modificabile dopo la creazione.</span>
      </div>

      <div class="flex flex-col gap-3">
        <label class="text-sm font-medium">Capabilities</label>
        <template v-for="(caps, groupName) in CAPABILITY_GROUPS" :key="groupName">
          <div class="text-xs font-semibold text-surface-500 uppercase tracking-wide mt-1">{{ groupName }}</div>
          <div class="grid grid-cols-2 gap-1">
            <div v-for="cap in caps" :key="cap" class="flex items-center gap-2">
              <Checkbox :model-value="form.capabilities.includes(cap)" binary @change="toggleCap(cap)" :input-id="`cap-${cap}`" />
              <label :for="`cap-${cap}`" class="text-sm cursor-pointer">{{ cap }}</label>
            </div>
          </div>
        </template>
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
import { rolesApi } from '@/api/users.js'
import type { Role } from '@/api/users.js'

const CAPABILITY_GROUPS: Record<string, string[]> = {
  'Contenuto':        ['read', 'edit_posts', 'edit_others_posts', 'publish_posts', 'delete_posts', 'delete_others_posts'],
  'Tassonomie':       ['manage_terms'],
  'Media':            ['upload_files'],
  'Amministrazione':  ['manage_users', 'manage_roles', 'manage_plugins', 'manage_options'],
}

const confirm = useConfirm()
const toast   = useToast()

const loading       = ref(false)
const saving        = ref(false)
const roles         = ref<Role[]>([])
const dialogVisible = ref(false)
const editingId     = ref<number | null>(null)
const formError     = ref('')

const form = ref({ name: '', slug: '', capabilities: [] as string[] })

const dialogTitle = computed(() => editingId.value ? 'Modifica ruolo' : 'Nuovo ruolo')

let slugManuallyEdited = false

function onNameInput() {
  if (!slugManuallyEdited && !editingId.value) {
    form.value.slug = form.value.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
  }
}

function toggleCap(cap: string) {
  const idx = form.value.capabilities.indexOf(cap)
  if (idx >= 0) form.value.capabilities.splice(idx, 1)
  else form.value.capabilities.push(cap)
}

async function loadRoles() {
  loading.value = true
  try {
    roles.value = await rolesApi.list()
  } finally {
    loading.value = false
  }
}

function openNew() {
  editingId.value = null
  form.value = { name: '', slug: '', capabilities: [] }
  slugManuallyEdited = false
  formError.value = ''
  dialogVisible.value = true
}

function openEdit(role: Role) {
  editingId.value = role.id
  form.value = { name: role.name, slug: role.slug, capabilities: [...role.capabilities] }
  slugManuallyEdited = true
  formError.value = ''
  dialogVisible.value = true
}

async function submitForm() {
  formError.value = ''
  if (!form.value.name.trim()) { formError.value = 'Nome richiesto.'; return }
  if (!editingId.value && !form.value.slug.trim()) { formError.value = 'Slug richiesto.'; return }
  saving.value = true
  try {
    if (editingId.value) {
      await rolesApi.update(editingId.value, { name: form.value.name, capabilities: form.value.capabilities })
    } else {
      await rolesApi.create({ name: form.value.name, slug: form.value.slug, capabilities: form.value.capabilities })
    }
    dialogVisible.value = false
    toast.add({ severity: 'success', summary: 'Salvato', detail: 'Ruolo salvato', life: 2000 })
    await loadRoles()
  } catch (e: unknown) {
    formError.value = e instanceof Error ? e.message : 'Errore nel salvataggio.'
  } finally {
    saving.value = false
  }
}

function confirmDelete(role: Role) {
  confirm.require({
    message:     `Eliminare il ruolo "${role.name}"? Gli utenti con questo ruolo potrebbero perdere accesso.`,
    header:      'Conferma eliminazione',
    icon:        'pi pi-exclamation-triangle',
    rejectLabel: 'Annulla',
    acceptLabel: 'Elimina',
    acceptClass: 'p-button-danger',
    accept: async () => {
      try {
        await rolesApi.delete(role.id)
        toast.add({ severity: 'success', summary: 'Eliminato', detail: 'Ruolo eliminato', life: 2000 })
        await loadRoles()
      } catch {
        toast.add({ severity: 'error', summary: 'Errore', detail: 'Impossibile eliminare il ruolo', life: 3000 })
      }
    },
  })
}

onMounted(loadRoles)
</script>
