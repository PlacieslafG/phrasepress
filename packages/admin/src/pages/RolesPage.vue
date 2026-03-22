<template>
  <div class="p-6 max-w-4xl">

    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold">Ruoli</h1>
      <Button label="Nuovo ruolo" icon="pi pi-plus" @click="openNew" />
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex justify-center py-16">
      <i class="pi pi-spinner animate-spin text-3xl text-surface-400" />
    </div>

    <!-- Role cards -->
    <div v-else class="flex flex-col gap-4">
      <div
        v-for="role in roles"
        :key="role.id"
        class="border border-surface-border rounded-xl overflow-hidden bg-surface-card"
      >
        <!-- Card header -->
        <div class="flex items-center justify-between px-5 py-3.5 bg-surface-ground border-b border-surface-border">
          <div class="flex items-center gap-3">
            <span class="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <i class="pi pi-shield text-primary text-sm" />
            </span>
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-semibold text-base">{{ role.name }}</span>
              <code class="text-xs bg-surface-border text-surface-400 px-1.5 py-0.5 rounded">{{ role.slug }}</code>
              <Tag :value="`${role.capabilities.length} capabilities`" severity="secondary" />
            </div>
          </div>
          <div class="flex items-center gap-2">
            <Button
              icon="pi pi-pencil"
              label="Modifica"
              size="small"
              severity="secondary"
              outlined
              @click="openEdit(role)"
            />
            <Button
              v-if="role.slug !== 'administrator'"
              icon="pi pi-trash"
              size="small"
              severity="danger"
              text
              v-tooltip.left="'Elimina ruolo'"
              @click="confirmDelete(role)"
            />
          </div>
        </div>

        <!-- Capability groups display -->
        <div class="px-5 py-4 flex flex-col gap-3">
          <div v-for="group in CAPABILITY_GROUPS" :key="group.label">
            <p class="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2">{{ group.label }}</p>
            <div class="flex flex-wrap gap-1.5">
              <span
                v-for="cap in group.caps"
                :key="cap.key"
                class="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border font-mono transition-colors"
                :class="role.capabilities.includes(cap.key)
                  ? 'bg-green-500/10 border-green-500/30 text-green-600 dark:text-green-400'
                  : 'bg-surface-border/30 border-surface-border/50 text-surface-400 opacity-50'"
              >
                <i
                  class="text-[10px]"
                  :class="role.capabilities.includes(cap.key) ? 'pi pi-check' : 'pi pi-times'"
                />
                {{ cap.key }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div v-if="!roles.length" class="text-center py-16 text-surface-400">
        Nessun ruolo configurato.
      </div>
    </div>
  </div>

  <!-- ─── Dialog crea/modifica ruolo ───────────────────────────────────────── -->
  <Dialog
    v-model:visible="dialogVisible"
    :header="editingId ? 'Modifica ruolo' : 'Nuovo ruolo'"
    modal
    :style="{ width: '680px', maxHeight: '90vh' }"
    :dismissable-mask="true"
  >
    <div class="flex flex-col gap-5 pt-1 pb-2">

      <!-- Nome + Slug -->
      <div class="grid grid-cols-2 gap-4">
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium">Nome <span class="text-red-500">*</span></label>
          <InputText v-model="form.name" @input="onNameInput" class="w-full" placeholder="Es. Editor" autofocus />
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium">Slug</label>
          <InputText v-model="form.slug" :disabled="!!editingId" placeholder="auto-generato" class="w-full" />
          <span v-if="!editingId" class="text-xs text-surface-400">Non modificabile dopo la creazione.</span>
          <span v-else class="text-xs text-surface-400">Lo slug non può essere modificato.</span>
        </div>
      </div>

      <!-- Capabilities -->
      <div>
        <div class="flex items-center justify-between mb-2">
          <p class="text-sm font-medium">Capabilities</p>
          <div class="flex gap-2 text-xs text-surface-400">
            <button class="hover:text-primary transition-colors" @click="selectAllCaps">Seleziona tutte</button>
            <span>·</span>
            <button class="hover:text-primary transition-colors" @click="clearAllCaps">Deseleziona tutte</button>
          </div>
        </div>

        <div class="border border-surface-border rounded-xl overflow-hidden">
          <div v-for="(group, gi) in CAPABILITY_GROUPS" :key="group.label">

            <!-- Group header -->
            <div
              class="flex items-center justify-between px-4 py-2.5 bg-surface-ground cursor-pointer select-none"
              :class="gi > 0 ? 'border-t border-surface-border' : ''"
              @click="toggleGroup(group)"
            >
              <div class="flex items-center gap-2">
                <i :class="group.icon + ' text-sm text-surface-400'" />
                <span class="text-xs font-bold text-surface-500 uppercase tracking-wider">{{ group.label }}</span>
              </div>
              <div class="flex items-center gap-2.5">
                <span class="text-xs text-surface-400">
                  {{ countSelected(group.caps) }}/{{ group.caps.length }} selezionate
                </span>
                <!-- Pseudo "select all" indicator -->
                <span
                  class="w-4 h-4 rounded border-2 flex items-center justify-center text-[10px] transition-colors"
                  :class="isGroupAllSelected(group.caps)
                    ? 'bg-primary border-primary text-white'
                    : isGroupIndeterminate(group.caps)
                      ? 'bg-primary/20 border-primary/50 text-primary'
                      : 'border-surface-400'"
                >
                  <i v-if="isGroupAllSelected(group.caps)" class="pi pi-check" />
                  <i v-else-if="isGroupIndeterminate(group.caps)" class="pi pi-minus" />
                </span>
              </div>
            </div>

            <!-- Capability rows -->
            <div
              v-for="cap in group.caps"
              :key="cap.key"
              class="flex items-center justify-between px-4 py-2.5 border-t border-surface-border/50 hover:bg-surface-hover/50 cursor-pointer transition-colors"
              @click="toggleCap(cap.key)"
            >
              <div>
                <span class="text-sm font-mono font-medium">{{ cap.key }}</span>
                <p class="text-xs text-surface-400 mt-0.5">{{ cap.description }}</p>
              </div>
              <ToggleSwitch
                :model-value="form.capabilities.includes(cap.key)"
                @click.stop
                @update:model-value="toggleCap(cap.key)"
              />
            </div>
          </div>
        </div>
      </div>

      <div v-if="formError" class="text-red-500 text-sm rounded-lg bg-red-500/10 px-3 py-2">
        {{ formError }}
      </div>
    </div>

    <template #footer>
      <Button label="Annulla" severity="secondary" text @click="dialogVisible = false" />
      <Button
        :label="editingId ? 'Aggiorna ruolo' : 'Crea ruolo'"
        icon="pi pi-check"
        :loading="saving"
        @click="submitForm"
      />
    </template>
  </Dialog>

  <ConfirmDialog />
  <Toast />
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import { rolesApi } from '@/api/users.js'
import type { Role } from '@/api/users.js'

// ─── Capabilities con descrizioni ─────────────────────────────────────────────

interface CapDef { key: string; description: string }
interface GroupDef { label: string; icon: string; caps: CapDef[] }

const CAPABILITY_GROUPS: GroupDef[] = [
  {
    label: 'Contenuto',
    icon:  'pi pi-file-edit',
    caps: [
      { key: 'read',                description: 'Visualizzare i contenuti pubblicati' },
      { key: 'edit_posts',          description: 'Creare e modificare i propri post' },
      { key: 'edit_others_posts',   description: 'Modificare post di altri utenti' },
      { key: 'publish_posts',       description: 'Pubblicare e impostare la visibilità dei post' },
      { key: 'delete_posts',        description: 'Eliminare i propri post' },
      { key: 'delete_others_posts', description: 'Eliminare post di altri utenti' },
    ],
  },
  {
    label: 'Tassonomie',
    icon:  'pi pi-tags',
    caps: [
      { key: 'manage_terms', description: 'Creare, modificare ed eliminare categorie e tag' },
    ],
  },
  {
    label: 'Media',
    icon:  'pi pi-image',
    caps: [
      { key: 'upload_files', description: 'Caricare file e gestire la libreria media' },
    ],
  },
  {
    label: 'Amministrazione',
    icon:  'pi pi-cog',
    caps: [
      { key: 'manage_users',   description: 'Creare, modificare ed eliminare utenti' },
      { key: 'manage_roles',   description: 'Creare e modificare i ruoli del sito' },
      { key: 'manage_plugins', description: 'Attivare, disattivare e configurare plugin' },
      { key: 'manage_options', description: 'Accedere alle impostazioni di sistema' },
    ],
  },
]

// ─── State ─────────────────────────────────────────────────────────────────────

const confirm = useConfirm()
const toast   = useToast()

const loading       = ref(false)
const saving        = ref(false)
const roles         = ref<Role[]>([])
const dialogVisible = ref(false)
const editingId     = ref<number | null>(null)
const formError     = ref('')
const form          = ref({ name: '', slug: '', capabilities: [] as string[] })

let slugManuallyEdited = false

// ─── Load ──────────────────────────────────────────────────────────────────────

async function loadRoles() {
  loading.value = true
  try {
    roles.value = await rolesApi.list()
  } finally {
    loading.value = false
  }
}

onMounted(loadRoles)

// ─── Dialog ───────────────────────────────────────────────────────────────────

function openNew() {
  editingId.value        = null
  slugManuallyEdited     = false
  formError.value        = ''
  form.value             = { name: '', slug: '', capabilities: [] }
  dialogVisible.value    = true
}

function openEdit(role: Role) {
  editingId.value        = role.id
  slugManuallyEdited     = true
  formError.value        = ''
  form.value             = { name: role.name, slug: role.slug, capabilities: [...role.capabilities] }
  dialogVisible.value    = true
}

function onNameInput() {
  if (!slugManuallyEdited && !editingId.value) {
    form.value.slug = form.value.name
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '')
  }
}

async function submitForm() {
  formError.value = ''
  if (!form.value.name.trim()) { formError.value = 'Il nome è obbligatorio.'; return }
  if (!editingId.value && !form.value.slug.trim()) { formError.value = 'Lo slug è obbligatorio.'; return }

  saving.value = true
  try {
    if (editingId.value) {
      const updated = await rolesApi.update(editingId.value, {
        name:         form.value.name,
        capabilities: form.value.capabilities,
      })
      const idx = roles.value.findIndex(r => r.id === editingId.value)
      if (idx !== -1) roles.value[idx] = updated
    } else {
      const created = await rolesApi.create({
        name:         form.value.name,
        slug:         form.value.slug,
        capabilities: form.value.capabilities,
      })
      roles.value.push(created)
    }
    dialogVisible.value = false
    toast.add({ severity: 'success', summary: 'Salvato', detail: 'Ruolo salvato', life: 2000 })
  } catch (e: unknown) {
    formError.value = e instanceof Error ? e.message : 'Errore nel salvataggio.'
  } finally {
    saving.value = false
  }
}

// ─── Capability helpers ───────────────────────────────────────────────────────

function toggleCap(key: string) {
  const idx = form.value.capabilities.indexOf(key)
  if (idx >= 0) form.value.capabilities.splice(idx, 1)
  else form.value.capabilities.push(key)
}

function countSelected(caps: CapDef[]): number {
  return caps.filter(c => form.value.capabilities.includes(c.key)).length
}

function isGroupAllSelected(caps: CapDef[]): boolean {
  return caps.every(c => form.value.capabilities.includes(c.key))
}

function isGroupIndeterminate(caps: CapDef[]): boolean {
  const n = countSelected(caps)
  return n > 0 && n < caps.length
}

function toggleGroup(group: GroupDef) {
  if (isGroupAllSelected(group.caps)) {
    // Deseleziona tutto il gruppo
    group.caps.forEach(c => {
      const idx = form.value.capabilities.indexOf(c.key)
      if (idx >= 0) form.value.capabilities.splice(idx, 1)
    })
  } else {
    // Seleziona tutto il gruppo
    group.caps.forEach(c => {
      if (!form.value.capabilities.includes(c.key)) {
        form.value.capabilities.push(c.key)
      }
    })
  }
}

function selectAllCaps() {
  form.value.capabilities = CAPABILITY_GROUPS.flatMap(g => g.caps.map(c => c.key))
}

function clearAllCaps() {
  form.value.capabilities = []
}

// ─── Delete ───────────────────────────────────────────────────────────────────

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
        roles.value = roles.value.filter(r => r.id !== role.id)
        toast.add({ severity: 'success', summary: 'Eliminato', detail: `Ruolo "${role.name}" eliminato`, life: 2000 })
      } catch {
        toast.add({ severity: 'error', summary: 'Errore', detail: 'Impossibile eliminare il ruolo', life: 3000 })
      }
    },
  })
}
</script>
