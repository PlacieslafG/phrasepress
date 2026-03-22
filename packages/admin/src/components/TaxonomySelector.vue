<template>
  <div class="flex flex-col gap-2">
    <p class="text-sm font-medium">{{ taxonomy.name }}</p>

    <!-- Gerarchico: Tree con checkbox -->
    <TreeSelect
      v-if="taxonomy.hierarchical"
      v-model="selected"
      :options="treeNodes"
      selection-mode="checkbox"
      placeholder="Nessun termine selezionato"
      class="w-full"
      @update:model-value="emitChange"
    />

    <!-- Flat: MultiSelect -->
    <MultiSelect
      v-else
      v-model="selectedFlat"
      :options="flatTerms"
      option-label="name"
      option-value="id"
      placeholder="Seleziona..."
      class="w-full"
      filter
      @update:model-value="emitFlatChange"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import type { TreeNode } from 'primevue/treenode'
import { taxonomiesApi } from '@/api/taxonomies.js'
import type { TaxonomyDefinition, TermWithChildren } from '@/api/taxonomies.js'

const props = defineProps<{
  taxonomy:     TaxonomyDefinition
  selectedIds:  number[]
}>()

const emit = defineEmits<{ 'update:selectedIds': [ids: number[]] }>()

const allTerms = ref<TermWithChildren[]>([])

// Per TreeSelect: mappa { [key]: { checked, partialChecked } }
const selected     = ref<Record<string, { checked: boolean; partialChecked: boolean }>>({})
// Per MultiSelect: array di id
const selectedFlat = ref<number[]>([...props.selectedIds])

// Nodi per TreeSelect
const treeNodes = computed<TreeNode[]>(() => termToNodes(allTerms.value))
// Lista piatta per MultiSelect
const flatTerms = computed(() => flattenTerms(allTerms.value))

function flattenTerms(terms: TermWithChildren[]): { id: number; name: string }[] {
  const result: { id: number; name: string }[] = []
  for (const t of terms) {
    result.push({ id: t.id, name: t.name })
    result.push(...flattenTerms(t.children ?? []))
  }
  return result
}

function termToNodes(terms: TermWithChildren[]): TreeNode[] {
  return terms.map((t) => ({
    key:      String(t.id),
    label:    t.name,
    children: termToNodes(t.children ?? []),
  }))
}

function buildSelected(ids: number[]): Record<string, { checked: boolean; partialChecked: boolean }> {
  return Object.fromEntries(ids.map((id) => [String(id), { checked: true, partialChecked: false }]))
}

function emitChange(val: Record<string, { checked: boolean; partialChecked: boolean }>) {
  const ids = Object.entries(val)
    .filter(([, v]) => v.checked)
    .map(([k]) => Number(k))
  emit('update:selectedIds', ids)
}

function emitFlatChange(ids: number[]) {
  emit('update:selectedIds', ids)
}

onMounted(async () => {
  try {
    allTerms.value = await taxonomiesApi.getTerms(props.taxonomy.slug)
  } catch { /* silenzioso - terms semplicemente vuoti */ }
})

// Sync props → stato locale
watch(() => props.selectedIds, (ids) => {
  selected.value     = buildSelected(ids)
  selectedFlat.value = [...ids]
}, { immediate: true })
</script>
