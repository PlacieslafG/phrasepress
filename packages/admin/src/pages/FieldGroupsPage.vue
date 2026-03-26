<template>
  <div class="p-6">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold">Gruppi di campi</h1>
      <Button label="Nuovo gruppo" icon="pi pi-plus" @click="$router.push('/field-groups/new')" />
    </div>

    <div v-if="loading" class="flex justify-center py-12">
      <ProgressSpinner style="width:48px;height:48px" />
    </div>

    <div v-else-if="groups.length === 0" class="text-center py-12 text-surface-400">
      <i class="pi pi-list-check text-4xl mb-3 block" />
      <p>Nessun gruppo di campi. Creane uno per aggiungere campi personalizzati ai tuoi post type.</p>
    </div>

    <div v-else class="flex flex-col gap-3">
      <div
        v-for="group in groups"
        :key="group.id"
        class="surface-card border border-surface-border rounded-xl p-4 flex items-center gap-4"
      >
        <div class="flex-1 min-w-0">
          <p class="font-semibold">{{ group.name }}</p>
          <p v-if="group.description" class="text-sm text-surface-400 mt-0.5">{{ group.description }}</p>
          <div class="flex flex-wrap gap-1.5 mt-2">
            <Tag
              v-for="pt in group.postTypes"
              :key="pt"
              :value="ptLabel(pt)"
              severity="secondary"
              class="text-xs"
            />
            <span v-if="group.postTypes.length === 0" class="text-xs text-surface-400 italic">
              Nessun post type associato
            </span>
          </div>
        </div>
        <div class="flex items-center gap-2 text-surface-400 text-sm shrink-0">
          <i class="pi pi-list" />
          {{ group.fields.length }} {{ group.fields.length === 1 ? 'campo' : 'campi' }}
        </div>
        <div class="flex gap-2 shrink-0">
          <Button
            text plain icon="pi pi-pencil"
            @click="$router.push(`/field-groups/${group.id}`)"
          />
          <Button
            text plain icon="pi pi-trash" severity="danger"
            @click="confirmDelete(group)"
          />
        </div>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import { useAppStore } from '@/stores/app.js'
import { listFieldGroups, deleteFieldGroup, type FieldGroup } from '@/api/fields.js'

const confirm  = useConfirm()
const toast    = useToast()
const appStore = useAppStore()

const loading = ref(true)
const groups  = ref<FieldGroup[]>([])

function ptLabel(name: string): string {
  return appStore.postTypes.find(pt => pt.name === name)?.label ?? name
}

onMounted(async () => {
  try {
    groups.value = await listFieldGroups()
  } catch {
    toast.add({ severity: 'error', summary: 'Errore', detail: 'Impossibile caricare i gruppi', life: 3000 })
  } finally {
    loading.value = false
  }
})

function confirmDelete(group: FieldGroup) {
  confirm.require({
    message:  `Eliminare il gruppo "${group.name}" e tutti i suoi campi?`,
    header:   'Conferma eliminazione',
    icon:     'pi pi-trash',
    accept:   () => doDelete(group.id),
  })
}

async function doDelete(id: string) {
  try {
    await deleteFieldGroup(id)
    groups.value = groups.value.filter(g => g.id !== id)
    // Force post types reload so deleted fields disappear from post editor
    appStore.reset()
    await appStore.load()
    toast.add({ severity: 'success', summary: 'Eliminato', life: 2000 })
  } catch {
    toast.add({ severity: 'error', summary: 'Errore', detail: 'Impossibile eliminare il gruppo', life: 3000 })
  }
}
</script>
