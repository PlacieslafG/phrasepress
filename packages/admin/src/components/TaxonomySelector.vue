<template>
  <div class="flex flex-col gap-1">

    <!-- Gerarchico: lista Checkbox PrimeVue con indentazione -->
    <template v-if="taxonomy.hierarchical">
      <div v-if="flatTree.length === 0" class="text-xs text-surface-400 py-1">
        Nessun termine
      </div>
      <div v-else class="flex flex-col gap-0.5 max-h-52 overflow-y-auto pr-1">
        <div
          v-for="item in flatTree"
          :key="item.id"
          class="flex items-center gap-2 py-1.5"
          :style="{ paddingLeft: `${item.depth * 14 + 6}px` }"
        >
          <Checkbox
            v-model="localIds"
            :value="item.id"
            :input-id="`term-${taxonomy.slug}-${item.id}`"
          />
          <label
            :for="`term-${taxonomy.slug}-${item.id}`"
            class="text-sm cursor-pointer select-none"
          >{{ item.name }}</label>
        </div>
      </div>
    </template>

    <!-- Flat: MultiSelect -->
    <MultiSelect
      v-else
      v-model="localIds"
      :options="flatTerms"
      option-label="name"
      option-value="id"
      display="chip"
      placeholder="Seleziona..."
      class="w-full"
      filter
    />

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { taxonomiesApi } from '@/api/taxonomies.js'
import type { TaxonomyDefinition, TermWithChildren } from '@/api/taxonomies.js'

const props = defineProps<{
  taxonomy:    TaxonomyDefinition
  selectedIds: number[]
}>()

const emit = defineEmits<{ 'update:selectedIds': [ids: number[]] }>()

const allTerms = ref<TermWithChildren[]>([])

// Proxy puro: getter legge la prop, setter emette al parent.
// Niente ref locale, niente watch, niente loop.
const localIds = computed({
  get: () => props.selectedIds ?? [],
  set: (ids: number[]) => emit('update:selectedIds', ids),
})

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

onMounted(async () => {
  try {
    allTerms.value = await taxonomiesApi.getTerms(props.taxonomy.slug)
  } catch { /* taxonomy senza terms */ }
})
</script>
