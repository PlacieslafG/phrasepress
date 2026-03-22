<template>
  <div class="flex flex-col gap-1">

    <!-- Gerarchico: lista di checkbox inline (no dropdown, no overflow) -->
    <template v-if="taxonomy.hierarchical">
      <div v-if="allTerms.length === 0" class="text-xs text-surface-400 py-1">Nessun termine</div>
      <div v-else class="flex flex-col gap-0.5 max-h-48 overflow-y-auto">
        <TermCheckboxRow
          v-for="term in allTerms"
          :key="term.id"
          :term="term"
          :selected-ids="selectedIds"
          :depth="0"
          @toggle="toggleTerm"
        />
      </div>
    </template>

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
import { ref, computed, watch, onMounted, defineComponent, h } from 'vue'
import Checkbox from 'primevue/checkbox'
import { taxonomiesApi } from '@/api/taxonomies.js'
import type { TaxonomyDefinition, TermWithChildren } from '@/api/taxonomies.js'

const props = defineProps<{
  taxonomy:     TaxonomyDefinition
  selectedIds:  number[]
}>()

const emit = defineEmits<{ 'update:selectedIds': [ids: number[]] }>()

const allTerms     = ref<TermWithChildren[]>([])
const selectedFlat = ref<number[]>([...props.selectedIds])

// Flat list for MultiSelect
const flatTerms = computed(() => flattenTerms(allTerms.value))

function flattenTerms(terms: TermWithChildren[]): { id: number; name: string }[] {
  const result: { id: number; name: string }[] = []
  for (const t of terms) {
    result.push({ id: t.id, name: t.name })
    result.push(...flattenTerms(t.children ?? []))
  }
  return result
}

function toggleTerm(id: number) {
  const idx = props.selectedIds.indexOf(id)
  const next = idx >= 0
    ? props.selectedIds.filter(x => x !== id)
    : [...props.selectedIds, id]
  emit('update:selectedIds', next)
}

function emitFlatChange(ids: number[]) {
  emit('update:selectedIds', ids)
}

onMounted(async () => {
  try {
    allTerms.value = await taxonomiesApi.getTerms(props.taxonomy.slug)
  } catch { /* silenzioso */ }
})

watch(() => props.selectedIds, (ids) => {
  selectedFlat.value = [...ids]
}, { immediate: true })

// ── Recursive checkbox row component ──────────────────────────────────────────
const TermCheckboxRow = defineComponent({
  name: 'TermCheckboxRow',
  props: {
    term:        { type: Object as () => TermWithChildren, required: true },
    selectedIds: { type: Array as () => number[],          required: true },
    depth:       { type: Number,                           default: 0 },
  },
  emits: ['toggle'],
  setup(p, { emit: emitRow }) {
    const checked = computed(() => p.selectedIds.includes(p.term.id))
    return () => h('div', { class: 'flex flex-col' }, [
      h('label', {
        class: 'flex items-center gap-2 py-1 px-1 rounded cursor-pointer hover:bg-surface-800 select-none',
        style: { paddingLeft: `${p.depth * 16 + 4}px` },
        onClick: () => emitRow('toggle', p.term.id),
      }, [
        h(Checkbox, {
          modelValue: checked.value,
          binary: true,
          class: 'pointer-events-none shrink-0',
          'onUpdate:modelValue': () => {},
        }),
        h('span', { class: 'text-sm truncate' }, p.term.name),
      ]),
      ...(p.term.children ?? []).map(child =>
        h(TermCheckboxRow, {
          term:        child,
          selectedIds: p.selectedIds,
          depth:       p.depth + 1,
          onToggle:    (id: number) => emitRow('toggle', id),
        })
      ),
    ])
  },
})
</script>
