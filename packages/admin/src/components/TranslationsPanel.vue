<template>
  <div class="flex flex-col gap-3">
    <!-- Intestazione con "Traduci tutto" -->
    <div class="flex items-center justify-between">
      <span class="text-xs text-surface-400">{{ locales.length }} lingue configurate</span>
      <Button
        v-if="locales.length > 0"
        label="Traduci tutto"
        icon="pi pi-language"
        size="small"
        text
        :loading="translatingAll"
        @click="translateAll"
      />
    </div>

    <div v-if="loadingLocales" class="text-surface-400 text-xs">Caricamento...</div>

    <div v-else-if="locales.length === 0" class="text-surface-400 text-xs">
      Nessuna lingua configurata.
      <RouterLink to="/i18n" class="text-primary-500 hover:underline">Configura le lingue</RouterLink>
    </div>

    <!-- Lista lingue — accordion -->
    <Accordion v-else :multiple="false" :value="expandedLocale" @update:value="(v) => expandedLocale = v as string">
      <AccordionPanel
        v-for="locale in locales"
        :key="locale.code"
        :value="locale.code"
      >
        <AccordionHeader>
          <div class="flex items-center gap-2 w-full">
            <span class="font-medium text-sm">{{ locale.label }}</span>
            <code class="text-xs text-surface-400">({{ locale.code }})</code>
            <div class="ml-auto mr-2">
              <Tag
                v-if="getTranslation(locale.code)"
                :value="getTranslation(locale.code)!.isDirty ? 'Obsoleta' : 'Tradotta'"
                :severity="getTranslation(locale.code)!.isDirty ? 'warn' : 'success'"
                class="text-xs"
              />
              <Tag v-else value="Mancante" severity="secondary" class="text-xs" />
            </div>
          </div>
        </AccordionHeader>
        <AccordionContent>
          <TranslationEditor
            :locale="locale"
            :post-id="postId"
            :translation="getTranslation(locale.code) ?? null"
            :translatable-field-defs="translatableFieldDefs"
            @saved="onTranslationSaved"
            @deleted="onTranslationDeleted(locale.code)"
          />
        </AccordionContent>
      </AccordionPanel>
    </Accordion>
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
const locales        = ref<Locale[]>([])
const translations   = ref<Translation[]>([])
const loadingLocales = ref(false)
const expandedLocale = ref<string | undefined>(undefined)
const translatingAll = ref(false)

function getTranslation(locale: string): Translation | undefined {
  return translations.value.find(t => t.locale === locale)
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
}

async function translateAll() {
  translatingAll.value = true
  try {
    const results = await i18nApi.autoTranslateAll(props.postId)
    for (const r of results) {
      if (r.ok && r.translation) {
        onTranslationSaved(r.translation)
      }
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
