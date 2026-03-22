<template>
  <div class="flex flex-col h-full">
    <!-- ── Top bar ── -->
    <div class="flex items-center gap-3 px-6 py-3 border-b border-surface-200 bg-surface-card shrink-0">
      <Button text plain icon="pi pi-arrow-left" @click="router.back()" />

      <!-- Breadcrumb + active locale badge -->
      <div class="flex flex-col min-w-0">
        <span class="text-sm text-surface-400 truncate">
          {{ postType?.label ?? type }} /
          <span class="text-surface-600">{{ isNew ? 'Nuovo' : form.title || '…' }}</span>
        </span>
        <span v-if="activeLocale !== null" class="flex items-center gap-1 text-xs font-semibold text-primary-500 mt-0.5">
          <i class="pi pi-language text-[10px]" />{{ currentLocaleLabel }}
        </span>
      </div>

      <!-- Action buttons -->
      <div class="ml-auto flex items-center gap-2">
        <!-- Translation tab -->
        <template v-if="activeLocale !== null">
          <Button
            label="Auto-traduci"
            icon="pi pi-sparkles"
            severity="secondary"
            outlined
            :loading="translatingCurrent"
            @click="autoTranslateCurrent"
          />
          <Button
            label="Bozza"
            severity="secondary"
            outlined
            :loading="savingTranslation"
            @click="saveTranslation('draft')"
          />
          <Button
            label="Pubblica"
            :loading="savingTranslation"
            @click="saveTranslation('published')"
          />
          <Button
            v-if="getTranslation(activeLocale)"
            icon="pi pi-trash"
            severity="danger"
            text
            @click="confirmDeleteTranslation"
          />
        </template>

        <!-- Original tab -->
        <template v-else>
          <Button label="Bozza" severity="secondary" outlined :loading="saving" @click="save('draft')" />
          <Button label="Pubblica" :loading="saving" @click="save('published')" />
        </template>
      </div>
    </div>

    <!-- ── Language tab bar (i18n active, post saved, locales loaded) ── -->
    <div
      v-if="showI18nTabs"
      class="flex items-center px-2 border-b border-surface-200 bg-surface-50 shrink-0 overflow-x-auto"
      style="scrollbar-width:none"
    >
      <!-- Originale -->
      <button :class="tabClass(null)" @click="activeLocale = null">
        <i class="pi pi-file-edit text-[11px]" />
        Originale
      </button>

      <!-- One tab per locale -->
      <button
        v-for="locale in locales"
        :key="locale.code"
        :class="tabClass(locale.code)"
        @click="switchLocale(locale.code)"
      >
        {{ locale.label }}
        <!-- Status indicator -->
        <span class="inline-flex items-center">
          <i v-if="translatingLocale === locale.code" class="pi pi-spinner pi-spin text-[10px]" />
          <i
            v-else-if="getTranslation(locale.code) && !getTranslation(locale.code)!.isDirty"
            class="pi pi-check-circle text-[11px] text-green-500"
          />
          <i
            v-else-if="getTranslation(locale.code)"
            class="pi pi-exclamation-circle text-[11px] text-amber-500"
          />
          <span v-else class="block w-1.5 h-1.5 rounded-full bg-surface-300" />
        </span>
      </button>

      <div class="flex-1 min-w-4" />

      <Button
        label="Traduci tutto"
        icon="pi pi-language"
        size="small"
        text
        class="shrink-0 mx-2 my-1"
        :loading="translatingAll"
        @click="translateAll"
      />
    </div>

    <!-- ── Body ── -->
    <div class="flex flex-1 overflow-hidden">

      <!-- ── Original tab ── -->
      <template v-if="activeLocale === null">
        <!-- Main content column -->
        <div class="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
          <TitleInput v-model="form.title" v-model:slug="form.slug" />

          <div>
            <p class="text-sm font-medium mb-1">Contenuto</p>
            <RichTextEditor v-model="form.content" />
          </div>

          <div v-if="fieldDefs.length > 0">
            <p class="text-sm font-medium mb-2">Campi personalizzati</p>
            <CustomFieldsPanel v-model="form.fields" :field-defs="fieldDefs" />
          </div>
        </div>

        <!-- Right sidebar -->
        <aside class="w-72 shrink-0 overflow-y-auto border-l border-surface-200 p-4 flex flex-col gap-5">
          <Message v-if="errorMsg" severity="error" :closable="false" class="text-sm">{{ errorMsg }}</Message>

          <Panel header="Status" toggleable>
            <div class="flex flex-col gap-2">
              <div v-for="opt in statusOptions" :key="opt.value" class="flex items-center gap-2">
                <RadioButton v-model="form.status" :value="opt.value" :input-id="`status-${opt.value}`" />
                <label :for="`status-${opt.value}`" class="text-sm cursor-pointer">{{ opt.label }}</label>
              </div>
            </div>
          </Panel>

          <Panel
            v-for="tax in relatedTaxonomies"
            :key="tax.slug"
            :header="tax.name"
            toggleable
          >
            <TaxonomySelector
              :taxonomy="tax"
              :selected-ids="form.termIds[tax.slug] ?? []"
              @update:selected-ids="form.termIds[tax.slug] = $event"
            />
          </Panel>

          <Panel v-if="!isNew" header="Revisioni" toggleable>
            <RevisionsPanel ref="revPanelRef" :post-id="postId!" @restored="onRestored" />
          </Panel>
        </aside>
      </template>

      <!-- ── Translation tab ── -->
      <div v-else class="flex-1 overflow-y-auto">
        <div class="max-w-3xl mx-auto p-6 flex flex-col gap-6">
          <!-- Info banner -->
          <div class="flex items-start gap-3 p-3 rounded-lg bg-primary-50 border border-primary-100 text-sm text-primary-700">
            <i class="pi pi-info-circle mt-0.5 shrink-0" />
            <span>
              Stai modificando la traduzione in
              <strong>{{ currentLocaleLabel }}</strong>.
              Le tassonomie e le revisioni sono gestite nella scheda
              <button class="underline font-semibold" @click="activeLocale = null">Originale</button>.
            </span>
          </div>

          <TranslationEditor
            v-if="currentLocale"
            v-model="translationForm"
            :translatable-field-defs="translatableFieldDefs"
          />
        </div>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app.js'
import { postsApi } from '@/api/posts.js'
import type { FieldDefinition } from '@/api/posts.js'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { i18nApi } from '@/api/i18n.js'
import type { Locale, Translation } from '@/api/i18n.js'
import TitleInput        from '@/components/TitleInput.vue'
import RichTextEditor    from '@/components/RichTextEditor.vue'
import CustomFieldsPanel from '@/components/CustomFieldsPanel.vue'
import TaxonomySelector  from '@/components/TaxonomySelector.vue'
import RevisionsPanel    from '@/components/RevisionsPanel.vue'
import TranslationEditor from '@/components/TranslationEditor.vue'

const route   = useRoute()
const router  = useRouter()
const appStore = useAppStore()
const toast   = useToast()
const confirm = useConfirm()

const type    = computed(() => route.params.type as string)
const isNew   = computed(() => route.params.id === undefined)
const postId  = computed(() => isNew.value ? null : Number(route.params.id))

const postType = computed(() => appStore.postTypes.find((p) => p.name === type.value))
const fieldDefs = computed<FieldDefinition[]>(() => postType.value?.fields ?? [])

const relatedTaxonomies = computed(() =>
  appStore.taxonomies.filter((t) => t.postTypes.includes(type.value))
)

const statusOptions = [
  { label: 'Bozza',      value: 'draft' },
  { label: 'Pubblicato', value: 'published' },
]

interface FormState {
  title:   string
  slug:    string
  content: string
  status:  'draft' | 'published'
  fields:  Record<string, unknown>
  termIds: Record<string, number[]>
}

const form = ref<FormState>({
  title:   '',
  slug:    '',
  content: '',
  status:  'draft',
  fields:  {},
  termIds: {},
})

const saving   = ref(false)
const errorMsg = ref('')
const revPanelRef = ref<InstanceType<typeof RevisionsPanel> | null>(null)

// Carica post esistente
async function loadPost() {
  if (isNew.value || !postId.value) return
  try {
    const post = await postsApi.get(postId.value)
    form.value = {
      title:   post.title,
      slug:    post.slug,
      content: post.content ?? '',
      status:  post.status as 'draft' | 'published',
      fields:  post.fields ?? {},
      termIds: Object.fromEntries(
        Object.entries(
          post.terms.reduce((acc, t) => {
            const arr = acc[t.taxonomySlug] ?? []
            arr.push(t.termId)
            return { ...acc, [t.taxonomySlug]: arr }
          }, {} as Record<string, number[]>)
        )
      ),
    }
  } catch {
    toast.add({ severity: 'error', summary: 'Errore caricamento post', life: 3000 })
  }
}

async function save(status: 'draft' | 'published') {
  saving.value  = true
  errorMsg.value = ''
  form.value.status = status

  try {
    const payload = {
      title:   form.value.title,
      slug:    form.value.slug || undefined,
      content: form.value.content,
      status:  form.value.status,
      fields:  form.value.fields,
      terms:   form.value.termIds,
    }

    if (isNew.value) {
      const created = await postsApi.create({ ...payload, postType: type.value })
      toast.add({ severity: 'success', summary: 'Post creato', life: 2000 })
      router.replace(`/posts/${type.value}/${created.id}/edit`)
    } else {
      await postsApi.update(postId.value!, payload)
      toast.add({ severity: 'success', summary: 'Salvato', life: 2000 })
      revPanelRef.value?.reload()
    }
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : 'Errore durante il salvataggio'
  } finally {
    saving.value = false
  }
}

async function onRestored() {
  await loadPost()
}

onMounted(async () => {
  await loadPost()
  await loadI18n()
})

// Se l'utente naviga a un altro post type senza uscire dalla pagina
watch(() => route.params, () => {
  form.value = { title: '', slug: '', content: '', status: 'draft', fields: {}, termIds: {} }
  activeLocale.value = null
  locales.value = []
  translations.value = []
  loadPost().then(() => loadI18n())
})

// ── i18n ──────────────────────────────────────────────────────────────────────

interface TranslationForm {
  title:   string
  slug:    string
  content: string
  fields:  Record<string, unknown>
  status:  string
}

const locales          = ref<Locale[]>([])
const translations     = ref<Translation[]>([])
const activeLocale     = ref<string | null>(null)
const translatingLocale = ref<string | null>(null)
const translatingAll   = ref(false)
const savingTranslation = ref(false)
const translatingCurrent = ref(false)

const translationForm = ref<TranslationForm>({
  title: '', slug: '', content: '', fields: {}, status: 'draft',
})

const TRANSLATABLE_TYPES = new Set(['string', 'textarea', 'richtext'])

const translatableFieldDefs = computed(() =>
  fieldDefs.value.filter(f => TRANSLATABLE_TYPES.has(f.type))
)

const showI18nTabs = computed(() =>
  !isNew.value && appStore.isPluginActive('phrasepress-i18n') && locales.value.length > 0
)

const currentLocale = computed(() =>
  locales.value.find(l => l.code === activeLocale.value) ?? null
)

const currentLocaleLabel = computed(() => currentLocale.value?.label ?? '')

function getTranslation(code: string): Translation | undefined {
  return translations.value.find(t => t.locale === code)
}

function tabClass(code: string | null): string {
  const active = activeLocale.value === code
  return [
    'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors shrink-0 whitespace-nowrap',
    active
      ? 'border-primary-500 text-primary-500'
      : 'border-transparent text-surface-500 hover:text-surface-700',
  ].join(' ')
}

function switchLocale(code: string) {
  activeLocale.value = code
  const t = getTranslation(code)
  translationForm.value = t
    ? { title: t.title, slug: t.slug, content: t.content, fields: { ...t.fields }, status: t.status }
    : { title: form.value.title, slug: '', content: '', fields: {}, status: 'draft' }
}

async function loadI18n() {
  if (!appStore.isPluginActive('phrasepress-i18n') || !postId.value) return
  try {
    const [locs, trans] = await Promise.all([
      i18nApi.listLocales(),
      i18nApi.listTranslations(postId.value),
    ])
    locales.value = locs
    translations.value = trans
  } catch {
    // silent — plugin might not be configured yet
  }
}

function onTranslationSaved(t: Translation) {
  const idx = translations.value.findIndex(x => x.locale === t.locale)
  if (idx >= 0) translations.value[idx] = t
  else translations.value.push(t)
  if (t.locale === activeLocale.value) {
    translationForm.value.slug = t.slug
    translationForm.value.status = t.status
  }
}

async function saveTranslation(status: 'draft' | 'published') {
  if (!activeLocale.value || !postId.value) return
  if (!translationForm.value.title.trim()) {
    toast.add({ severity: 'warn', summary: 'Titolo obbligatorio', life: 3000 })
    return
  }
  savingTranslation.value = true
  try {
    const saved = await i18nApi.upsertTranslation(postId.value, activeLocale.value, {
      title:   translationForm.value.title,
      slug:    translationForm.value.slug || undefined,
      content: translationForm.value.content,
      fields:  translationForm.value.fields,
      status,
    })
    onTranslationSaved(saved)
    toast.add({ severity: 'success', summary: `${currentLocaleLabel.value} salvata`, life: 3000 })
  } catch (err: unknown) {
    const msg = (err as { message?: string })?.message ?? 'Errore salvataggio'
    toast.add({ severity: 'error', summary: 'Errore', detail: msg, life: 4000 })
  } finally {
    savingTranslation.value = false
  }
}

async function autoTranslateCurrent() {
  if (!activeLocale.value || !postId.value) return
  translatingCurrent.value = true
  try {
    const t = await i18nApi.autoTranslate(postId.value, activeLocale.value)
    onTranslationSaved(t)
    translationForm.value = { title: t.title, slug: t.slug, content: t.content, fields: { ...t.fields }, status: t.status }
    toast.add({ severity: 'success', summary: `${currentLocaleLabel.value} tradotta automaticamente`, life: 3000 })
  } catch (err: unknown) {
    const msg = (err as { message?: string })?.message ?? 'Errore'
    toast.add({ severity: 'error', summary: 'Traduzione fallita', detail: msg, life: 4000 })
  } finally {
    translatingCurrent.value = false
  }
}

async function translateAll() {
  if (!postId.value || locales.value.length === 0) return
  translatingAll.value = true
  let successes = 0
  try {
    for (const locale of locales.value) {
      translatingLocale.value = locale.code
      try {
        const t = await i18nApi.autoTranslate(postId.value, locale.code)
        onTranslationSaved(t)
        successes++
      } catch {
        // continue with next locale
      }
    }
    const total = locales.value.length
    if (successes === total) {
      toast.add({ severity: 'success', summary: 'Traduzione completata', detail: `${total} lingue tradotte`, life: 3000 })
    } else {
      toast.add({ severity: 'warn', summary: 'Traduzione parziale', detail: `${successes} su ${total} riuscite`, life: 4000 })
    }
    // Refresh form if we're on a translated tab
    if (activeLocale.value) {
      const t = getTranslation(activeLocale.value)
      if (t) translationForm.value = { title: t.title, slug: t.slug, content: t.content, fields: { ...t.fields }, status: t.status }
    }
  } finally {
    translatingAll.value   = false
    translatingLocale.value = null
  }
}

async function deleteCurrentTranslation() {
  if (!activeLocale.value || !postId.value) return
  try {
    await i18nApi.deleteTranslation(postId.value, activeLocale.value)
    translations.value = translations.value.filter(t => t.locale !== activeLocale.value)
    translationForm.value = { title: form.value.title, slug: '', content: '', fields: {}, status: 'draft' }
    toast.add({ severity: 'success', summary: 'Traduzione eliminata', life: 3000 })
  } catch (err: unknown) {
    const msg = (err as { message?: string })?.message ?? 'Errore eliminazione'
    toast.add({ severity: 'error', summary: 'Errore', detail: msg, life: 4000 })
  }
}

function confirmDeleteTranslation() {
  confirm.require({
    message:     `Eliminare la traduzione in ${currentLocaleLabel.value}?`,
    header:      'Conferma eliminazione',
    icon:        'pi pi-trash',
    rejectLabel: 'Annulla',
    acceptLabel: 'Elimina',
    accept:      deleteCurrentTranslation,
  })
}
</script>
