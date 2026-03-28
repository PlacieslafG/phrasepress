<template>
  <div class="flex flex-col gap-1 w-full min-w-0 overflow-hidden">

    <div v-if="loadingLocales" class="text-surface-400 text-xs py-1">Caricamento...</div>

    <div v-else-if="locales.length === 0" class="text-surface-400 text-xs py-1">
      Nessuna lingua configurata.
      <RouterLink to="/i18n" class="text-primary-500 hover:underline">Configura le lingue</RouterLink>
    </div>

    <template v-else>
      <!-- Riga per ogni lingua — tutta cliccabile per aprire il drawer -->
      <button
        v-for="locale in locales"
        :key="locale.code"
        type="button"
        class="w-full min-w-0 flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-surface-800 transition-colors text-left overflow-hidden"
        @click="openDrawer(locale)"
      >
        <div class="flex flex-col min-w-0 flex-1 overflow-hidden">
          <span class="text-sm font-medium leading-tight truncate">{{ locale.label }}</span>
          <code class="text-xs text-surface-500 truncate">{{ locale.code }}</code>
        </div>

        <div class="flex items-center gap-1 shrink-0">
          <span
            v-if="translatingLocale === locale.code"
            class="pi pi-spinner pi-spin text-xs text-surface-400"
          />
          <Tag
            v-else-if="getTranslation(locale.code)"
            :value="getTranslation(locale.code)!.isDirty ? 'Obs.' : 'OK'"
            :severity="getTranslation(locale.code)!.isDirty ? 'warn' : 'success'"
            class="!text-[10px] !py-0 !px-1"
          />
          <i class="pi pi-angle-right text-xs text-surface-500" />
        </div>
      </button>

      <!-- "Traduci tutto" in fondo -->
      <div class="pt-1 border-t border-surface-700">
        <Button
          label="Traduci tutto"
          icon="pi pi-language"
          size="small"
          text
          fluid
          :loading="translatingAll"
          @click="translateAll"
        />
      </div>
    </template>

    <!-- Drawer per l'editor della traduzione -->
    <Drawer
      v-model:visible="drawerVisible"
      position="right"
      :style="{ width: 'min(560px, 92vw)' }"
      :pt="{ header: { class: 'border-b border-surface-700 pb-3' } }"
    >
      <template #header>
        <div class="flex flex-col gap-0.5">
          <span class="font-semibold">{{ selectedLocale?.label }}</span>
          <code class="text-xs text-surface-400 font-normal">{{ selectedLocale?.code }}</code>
        </div>
      </template>

      <template v-if="selectedLocale">
        <TranslationEditor
          v-model="drawerForm"
          :translatable-field-defs="translatableFieldDefs"
        />

        <div class="flex items-center gap-2 pt-4 mt-2 border-t border-surface-700">
          <Button
            label="Salva"
            icon="pi pi-check"
            class="flex-1"
            :loading="drawerSaving"
            @click="saveDrawerTranslation"
          />
          <Button
            v-if="getTranslation(selectedLocale.code)"
            icon="pi pi-trash"
            severity="danger"
            text
            :loading="drawerDeleting"
            @click="deleteDrawerTranslation"
          />
        </div>
      </template>
    </Drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import { i18nApi } from '@/api/i18n.js'
import type { Locale, Translation } from '@/api/i18n.js'
import TranslationEditor from './TranslationEditor.vue'
import type { TranslationFormState } from './TranslationEditor.vue'

interface FieldDef {
  name: string
  type: string
  label?: string
  options?: string[]
}

const props = defineProps<{
  folioId:   number
  codex:     string
  fieldDefs: FieldDef[]
}>()

const toast = useToast()

const TRANSLATABLE_TYPES = new Set(['string', 'textarea', 'richtext'])

const translatableFieldDefs = computed(() =>
  props.fieldDefs.filter(f => TRANSLATABLE_TYPES.has(f.type))
)

// ── Data ──────────────────────────────────────────────────────────────────────
const locales         = ref<Locale[]>([])
const translations    = ref<Translation[]>([])
const loadingLocales  = ref(false)
const translatingAll  = ref(false)
const translatingLocale = ref<string | null>(null)

// Drawer
const drawerVisible  = ref(false)
const selectedLocale = ref<Locale | null>(null)
const drawerSaving   = ref(false)
const drawerDeleting = ref(false)

const drawerForm = ref<TranslationFormState>({
  title: '', slug: '', content: '', fields: {}, status: 'draft',
})

function getTranslation(locale: string): Translation | undefined {
  return translations.value.find(t => t.locale === locale)
}

function openDrawer(locale: Locale) {
  selectedLocale.value = locale
  const existing = getTranslation(locale.code)
  drawerForm.value = existing
    ? { title: existing.title, slug: existing.slug, content: existing.content, fields: { ...existing.fields }, status: existing.status }
    : { title: '', slug: '', content: '', fields: {}, status: 'draft' }
  drawerVisible.value  = true
}

async function saveDrawerTranslation() {
  if (!selectedLocale.value) return
  drawerSaving.value = true
  try {
    const t = await i18nApi.upsertTranslation(props.folioId, selectedLocale.value.code, drawerForm.value)
    onTranslationSaved(t)
    toast.add({ severity: 'success', summary: 'Traduzione salvata', life: 2000 })
  } catch (err: unknown) {
    toast.add({ severity: 'error', summary: 'Errore salvataggio', detail: (err as { message?: string })?.message, life: 4000 })
  } finally {
    drawerSaving.value = false
  }
}

async function deleteDrawerTranslation() {
  if (!selectedLocale.value) return
  drawerDeleting.value = true
  try {
    await i18nApi.deleteTranslation(props.folioId, selectedLocale.value.code)
    onTranslationDeleted(selectedLocale.value.code)
    toast.add({ severity: 'success', summary: 'Traduzione eliminata', life: 2000 })
  } catch (err: unknown) {
    toast.add({ severity: 'error', summary: 'Errore eliminazione', detail: (err as { message?: string })?.message, life: 4000 })
  } finally {
    drawerDeleting.value = false
  }
}

async function load() {
  loadingLocales.value = true
  try {
    const [locs, trans] = await Promise.all([
      i18nApi.listLocales(),
      i18nApi.listTranslations(props.folioId),
    ])
    locales.value      = locs
    translations.value = trans
  } catch {
    toast.add({ severity: 'error', summary: 'Errore caricamento traduzioni', life: 3000 })
  } finally {
    loadingLocales.value = false
  }
}

function onTranslationSaved(t: Translation) {
  const idx = translations.value.findIndex(x => x.locale === t.locale)
  if (idx >= 0) translations.value[idx] = t
  else translations.value.push(t)
}

function onTranslationDeleted(locale: string) {
  translations.value = translations.value.filter(t => t.locale !== locale)
  drawerVisible.value = false
}

async function autoTranslateSingle(locale: Locale) {
  translatingLocale.value = locale.code
  try {
    const t = await i18nApi.autoTranslate(props.folioId, locale.code)
    onTranslationSaved(t)
    toast.add({ severity: 'success', summary: `${locale.label} tradotta`, life: 2500 })
  } catch (err: unknown) {
    const msg = (err as { message?: string })?.message ?? 'Errore traduzione'
    toast.add({ severity: 'error', summary: 'Traduzione fallita', detail: msg, life: 4000 })
  } finally {
    translatingLocale.value = null
  }
}

async function translateAll() {
  translatingAll.value = true
  const targets = locales.value.filter(l => !l.isDefault)
  const total = targets.length
  let successes = 0
  try {
    for (const locale of targets) {
      translatingLocale.value = locale.code
      try {
        const t = await i18nApi.autoTranslate(props.folioId, locale.code)
        onTranslationSaved(t)
        successes++
      } catch {
        // continue with next locale
      }
    }
    if (successes === total) {
      toast.add({ severity: 'success', summary: 'Traduzione completata', detail: `${total} lingue tradotte`, life: 3000 })
    } else {
      toast.add({
        severity: 'warn',
        summary:  'Traduzione parziale',
        detail:   `${successes} su ${total} riuscite`,
        life:     4000,
      })
    }
  } finally {
    translatingAll.value    = false
    translatingLocale.value = null
  }
}

onMounted(load)
</script>
