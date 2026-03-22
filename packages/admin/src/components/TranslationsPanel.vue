<template>
  <div class="flex flex-col gap-2">

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
        class="w-full flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg hover:bg-surface-800 transition-colors text-left"
        @click="openDrawer(locale)"
      >
        <div class="flex flex-col min-w-0">
          <span class="text-sm font-medium leading-tight truncate">{{ locale.label }}</span>
          <code class="text-xs text-surface-500">{{ locale.code }}</code>
        </div>

        <div class="flex items-center gap-1.5 shrink-0">
          <span
            v-if="translatingLocale === locale.code"
            class="pi pi-spinner pi-spin text-xs text-surface-400"
          />
          <Tag
            v-else-if="getTranslation(locale.code)"
            :value="getTranslation(locale.code)!.isDirty ? 'Obsoleta' : 'Tradotta'"
            :severity="getTranslation(locale.code)!.isDirty ? 'warn' : 'success'"
            class="!text-[10px] !py-0 !px-1.5"
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

      <TranslationEditor
        v-if="selectedLocale"
        :locale="selectedLocale"
        :post-id="postId"
        :translation="getTranslation(selectedLocale.code) ?? null"
        :translatable-field-defs="translatableFieldDefs"
        @saved="onTranslationSaved"
        @deleted="onTranslationDeleted(selectedLocale.code)"
      />
    </Drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import { i18nApi } from '@/api/i18n.js'
import type { Locale, Translation } from '@/api/i18n.js'
import TranslationEditor from './TranslationEditor.vue'

interface FieldDef {
  name: string
  type: string
  label?: string
  options?: string[]
}

const props = defineProps<{
  postId:    number
  postType:  string
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

function getTranslation(locale: string): Translation | undefined {
  return translations.value.find(t => t.locale === locale)
}

function openDrawer(locale: Locale) {
  selectedLocale.value = locale
  drawerVisible.value  = true
}

async function load() {
  loadingLocales.value = true
  try {
    const [locs, trans] = await Promise.all([
      i18nApi.listLocales(),
      i18nApi.listTranslations(props.postId),
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
    const t = await i18nApi.autoTranslate(props.postId, locale.code)
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
  try {
    const results = await i18nApi.autoTranslateAll(props.postId)
    for (const r of results) {
      if (r.ok && r.translation) onTranslationSaved(r.translation)
    }
    const failures = results.filter(r => !r.ok)
    if (failures.length === 0) {
      toast.add({ severity: 'success', summary: 'Traduzione completata', detail: `${results.length} lingue tradotte`, life: 3000 })
    } else {
      toast.add({
        severity: 'warn',
        summary:  'Traduzione parziale',
        detail:   `${results.length - failures.length} su ${results.length} riuscite`,
        life:     4000,
      })
    }
  } catch (err: unknown) {
    const msg = (err as { message?: string })?.message ?? 'Errore traduzione'
    toast.add({ severity: 'error', summary: 'Errore', detail: msg, life: 4000 })
  } finally {
    translatingAll.value = false
  }
}

onMounted(load)
</script>
