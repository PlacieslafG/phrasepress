<template>
  <div class="flex flex-col h-full">
    <!-- Top bar -->
    <div class="flex items-center gap-3 px-6 py-3 border-b border-surface-200 bg-surface-card shrink-0">
      <Button text plain icon="pi pi-arrow-left" @click="router.back()" />
      <span class="text-sm text-surface-400">
        {{ postType?.label ?? type }} /
        <span class="text-surface-600">{{ isNew ? 'Nuovo' : form.title || '…' }}</span>
      </span>
      <div class="ml-auto flex gap-2">
        <Button
          label="Bozza" severity="secondary" outlined
          :loading="saving"
          @click="save('draft')"
        />
        <Button
          label="Pubblica"
          :loading="saving"
          @click="save('published')"
        />
      </div>
    </div>

    <!-- Body -->
    <div class="flex flex-1 overflow-hidden">
      <!-- Colonna principale -->
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

      <!-- Sidebar destra -->
      <aside class="w-72 shrink-0 overflow-y-auto border-l border-surface-200 p-4 flex flex-col gap-5">

        <!-- Errori -->
        <Message v-if="errorMsg" severity="error" :closable="false" class="text-sm">{{ errorMsg }}</Message>

        <!-- Status -->
        <Panel header="Status" toggleable>
          <div class="flex flex-col gap-2">
            <div v-for="opt in statusOptions" :key="opt.value" class="flex items-center gap-2">
              <RadioButton v-model="form.status" :value="opt.value" :input-id="`status-${opt.value}`" />
              <label :for="`status-${opt.value}`" class="text-sm cursor-pointer">{{ opt.label }}</label>
            </div>
          </div>
        </Panel>

        <!-- Tassonomie -->
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

        <!-- Revisioni (solo in edit) -->
        <Panel v-if="!isNew" header="Revisioni" toggleable>
          <RevisionsPanel
            ref="revPanelRef"
            :post-id="postId!"
            @restored="onRestored"
          />
        </Panel>

        <!-- Traduzioni (plugin i18n, solo in edit) -->
        <Panel v-if="!isNew && appStore.isPluginActive('phrasepress-i18n')" header="Traduzioni" toggleable>
          <TranslationsPanel
            :post-id="postId!"
            :post-type="type"
            :field-defs="fieldDefs"
          />
        </Panel>
      </aside>
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
import TitleInput       from '@/components/TitleInput.vue'
import RichTextEditor   from '@/components/RichTextEditor.vue'
import CustomFieldsPanel from '@/components/CustomFieldsPanel.vue'
import TaxonomySelector from '@/components/TaxonomySelector.vue'
import RevisionsPanel   from '@/components/RevisionsPanel.vue'
import TranslationsPanel from '@/components/TranslationsPanel.vue'

const route   = useRoute()
const router  = useRouter()
const appStore = useAppStore()
const toast   = useToast()

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

onMounted(loadPost)

// Se l'utente naviga a un altro post type senza uscire dalla pagina
watch(() => route.params, () => {
  form.value = { title: '', slug: '', content: '', status: 'draft', fields: {}, termIds: {} }
  loadPost()
})
</script>
