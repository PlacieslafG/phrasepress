<template>
  <div class="flex flex-col gap-1">

    <!-- Gerarchico: lista checkbox inline con indentazione visiva -->
    <template v-if="taxonomy.hierarchical">
      <div v-if="flatTree.length === 0" class="text-xs text-surface-400 py-1">Nessun termine</div>
      <div v-else class="flex flex-col gap-0.5 max-h-52 overflow-y-auto pr-1">
        <div
          v-for="item in flatTree"
          :key="item.id"
          class="flex items-center gap-2 py-1.5 rounded-md cursor-pointer hover:bg-surface-800 transition-colors select-none"
          :style="{ paddingLeft: `${item.depth * 14 + 6}px`, paddingRight: '6px' }"
          @click="toggleHierarchical(item.id)"
        >
          <span
            class="shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors"
            :class="localHierarchical.includes(item.id)
              ? 'bg-primary-500 border-primary-500'
              : 'bg-transparent border-surface-500'"
          >
            <i v-if="localHierarchical.includes(item.id)" class="pi pi-check text-white" style="font-size: 9px;" />
          </span>
          <span class="text-sm leading-none">{{ item.name }}</span>
        </div>
      </div>
    </template>

    <!-- Flat: MultiSelect -->
    <MultiSelect
      v-else
      v-model="localFlat"
      :options="flatTerms"
      option-label="name"
      option-value="id"
      display="chip"
      placeholder="Seleziona..."
      class="w-full"
      filter
      @update:model-value="emit('update:selectedIds', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { taxonomiesApi } from '@/api/taxonomies.js'
import type { TaxonomyDefinition, TermWithChildren } from '@/api/taxonomies.js'

const props = defineProps<{
  taxonomy:    TaxonomyDefinition
  selectedIds: number[]
}>()

const emit = defineEmits<{ 'update:selectedIds': [ids: number[]] }>()

const allTerms = ref<TermWithChildren[]>([])

// ── Local state — instant visual feedback independent of prop cycle ────────────
const localHierarchical = ref<number[]>([...props.selectedIds])
const localFlat         = ref<number[]>([...props.selectedIds])

// Sync from parent (e.g. after loadPost or auto-translate)
watch(() => props.selectedIds, (ids) => {
  localHierarchical.value = [...ids]
  localFlat.value         = [...ids]
}, { immediate: true })

// ── Flat tree for rendering ────────────────────────────────────────────────────
interface FlatItem { id: number; name: string; depth: number }

function flatten(terms: TermWithChildren[], depth = 0): FlatItem[] {
  const out: FlatItem[] = []
  for (const t of terms) {
    out.push({ id: t.id, name: t.name, depth })
    if (t.children?.length) out.push(...flatten(t.children, depth + 1))
  }
  return out
}

const flatTree  = computed(() => flatten(allTerms.value))
const flatTerms = computed(() => flatten(allTerms.value).map(({ id, name }) => ({ id, name })))

// ── Actions ───────────────────────────────────────────────────────────────────
function toggleHierarchical(id: number) {
  const next = localHierarchical.value.includes(id)
    ? localHierarchical.value.filter(x => x !== id)
    : [...localHierarchical.value, id]
  localHierarchical.value = next
  emit('update:selectedIds', next)
}

// ── Load ──────────────────────────────────────────────────────────────────────
onMounted(async () => {
  try {
    allTerms.value = await taxonomiesApi.getTerms(props.taxonomy.slug)
  } catch {
    // Silenzioso — taxonomy potrebbe non avere terms
  }
})
</script>
