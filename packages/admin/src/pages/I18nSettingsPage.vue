<template>
  <div class="p-6 flex flex-col gap-8">
    <h2 class="text-2xl font-semibold">Impostazioni Multilingua</h2>

    <!-- ── Sezione Lingue ─────────────────────────────────────────────── -->
    <section class="flex flex-col gap-4">
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-medium">Lingue</h3>
        <Button label="Aggiungi lingua" icon="pi pi-plus" size="small" @click="showAddDialog = true" />
      </div>

      <div v-if="loadingLocales" class="text-surface-400 text-sm">Caricamento...</div>

      <DataTable v-else :value="locales" class="rounded-xl overflow-hidden border border-surface-200 dark:border-surface-700">
        <Column field="code" header="Codice" style="width: 120px" />
        <Column field="label" header="Nome" />
        <Column header="Default" style="width: 100px">
          <template #body="{ data }">
            <Tag v-if="data.isDefault" value="Default" severity="success" />
          </template>
        </Column>
        <Column header="Azioni" style="width: 120px">
          <template #body="{ data }">
            <Button
              icon="pi pi-trash"
              severity="danger"
              text
              size="small"
              :disabled="data.isDefault"
              @click="confirmDeleteLocale(data.code)"
            />
          </template>
        </Column>
        <template #empty>
          <div class="text-center text-surface-400 text-sm py-6">
            Nessuna lingua configurata. Aggiungi la prima lingua.
          </div>
        </template>
      </DataTable>
    </section>

    <!-- ── Sezione Configurazione LLM ─────────────────────────────────── -->
    <section class="flex flex-col gap-4">
      <h3 class="text-lg font-medium">Configurazione Auto-traduzione LLM</h3>

      <div v-if="loadingSettings" class="text-surface-400 text-sm">Caricamento...</div>

      <div v-else class="bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-xl p-6 flex flex-col gap-5">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div class="flex flex-col gap-2">
            <label class="text-sm font-medium">URL base API (OpenAI-compatible)</label>
            <InputText v-model="form.baseUrl" placeholder="http://localhost:8123/v1" class="w-full" />
            <small class="text-surface-400">Endpoint del server LLM (es. Ollama, vLLM, OpenAI)</small>
          </div>

          <div class="flex flex-col gap-2">
            <label class="text-sm font-medium">Modello</label>
            <InputText v-model="form.model" placeholder="gpt-4o-mini" class="w-full" />
          </div>

          <div class="flex flex-col gap-2">
            <label class="text-sm font-medium">API Key (opzionale)</label>
            <Password
              v-model="form.apiKey"
              :placeholder="settings?.hasApiKey ? '••••••••••• (già configurata)' : 'Nessuna chiave'"
              :feedback="false"
              toggleMask
              class="w-full"
            />
            <small class="text-surface-400">Lascia vuoto per non modificare la chiave esistente</small>
          </div>

          <div class="flex flex-col gap-2">
            <label class="text-sm font-medium">Lingua sorgente</label>
            <Select
              v-model="form.sourceLocale"
              :options="locales"
              option-label="label"
              option-value="code"
              placeholder="Seleziona lingua sorgente"
              class="w-full"
            />
            <small class="text-surface-400">Lingua in cui è scritto il contenuto originale</small>
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <label class="text-sm font-medium">Template prompt (opzionale)</label>
          <Textarea
            v-model="form.promptTemplate"
            :rows="5"
            :placeholder="defaultPromptPlaceholder"
            class="w-full font-mono text-sm"
          />
          <small class="text-surface-400">
            Variabili disponibili: <code>{sourceLocale}</code>, <code>{sourceLocaleName}</code>,
            <code>{targetLocale}</code>, <code>{targetLocaleName}</code>, <code>{text}</code>.
            Lascia vuoto per usare il template di default.
          </small>
        </div>

        <div class="flex items-center gap-3">
          <Button
            label="Salva impostazioni"
            icon="pi pi-save"
            :loading="saving"
            @click="saveSettings"
          />
          <Button
            label="Ping server"
            icon="pi pi-wifi"
            severity="secondary"
            outlined
            :loading="pinging"
            @click="doPing"
          />
          <Button
            label="Testa connessione"
            icon="pi pi-bolt"
            severity="secondary"
            :loading="testing"
            @click="testConnection"
          />
          <Tag v-if="testResult === 'ok'" value="Connessione riuscita" severity="success" />
          <Tag v-else-if="testResult === 'error'" value="Connessione fallita" severity="danger" />
        </div>
      </div>
    </section>

    <!-- ── Dialog Aggiungi Lingua ─────────────────────────────────────── -->
    <Dialog
      v-model:visible="showAddDialog"
      modal
      header="Aggiungi lingua"
      style="width: 420px"
      @hide="resetAddForm"
    >
      <div class="flex flex-col gap-4 py-2">
        <div class="flex flex-col gap-2">
          <label class="text-sm font-medium">Codice lingua *</label>
          <InputText
            v-model="addForm.code"
            placeholder="it, en, fr, de, es..."
            class="w-full"
            :invalid="!!addErrors.code"
          />
          <small v-if="addErrors.code" class="text-red-500">{{ addErrors.code }}</small>
          <small v-else class="text-surface-400">ISO 639-1 o locale (es. it, en, zh-CN)</small>
        </div>

        <div class="flex flex-col gap-2">
          <label class="text-sm font-medium">Nome visualizzato *</label>
          <InputText
            v-model="addForm.label"
            placeholder="Italiano, English, Français..."
            class="w-full"
            :invalid="!!addErrors.label"
          />
          <small v-if="addErrors.label" class="text-red-500">{{ addErrors.label }}</small>
        </div>

        <div class="flex items-center gap-2">
          <Checkbox v-model="addForm.isDefault" :binary="true" input-id="addDefault" />
          <label for="addDefault" class="text-sm">Lingua sorgente predefinita</label>
        </div>
      </div>

      <template #footer>
        <Button label="Annulla" severity="secondary" text @click="showAddDialog = false" />
        <Button label="Aggiungi" icon="pi pi-plus" :loading="addingLocale" @click="addLocale" />
      </template>
    </Dialog>

  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import { i18nApi } from '@/api/i18n.js'
import type { Locale, I18nConfig } from '@/api/i18n.js'

const confirm = useConfirm()
const toast   = useToast()

// ── Locales ──────────────────────────────────────────────────────────────────
const locales       = ref<Locale[]>([])
const loadingLocales = ref(false)

async function loadLocales() {
  loadingLocales.value = true
  try {
    locales.value = await i18nApi.listLocales()
  } catch {
    toast.add({ severity: 'error', summary: 'Errore', detail: 'Impossibile caricare le lingue', life: 3000 })
  } finally {
    loadingLocales.value = false
  }
}

function confirmDeleteLocale(code: string) {
  confirm.require({
    message: `Eliminare la lingua "${code}" e tutte le sue traduzioni?`,
    header:  'Conferma eliminazione',
    icon:    'pi pi-exclamation-triangle',
    rejectProps: { label: 'Annulla', severity: 'secondary', outlined: true },
    acceptProps: { label: 'Elimina', severity: 'danger' },
    accept: async () => {
      try {
        await i18nApi.deleteLocale(code)
        locales.value = locales.value.filter(l => l.code !== code)
        toast.add({ severity: 'success', summary: 'Lingua eliminata', life: 3000 })
      } catch {
        toast.add({ severity: 'error', summary: 'Errore eliminazione', life: 3000 })
      }
    },
  })
}

// ── Add locale dialog ─────────────────────────────────────────────────────────
const showAddDialog  = ref(false)
const addingLocale   = ref(false)
const addForm        = ref({ code: '', label: '', isDefault: false })
const addErrors      = ref<{ code?: string; label?: string }>({})

function resetAddForm() {
  addForm.value  = { code: '', label: '', isDefault: false }
  addErrors.value = {}
}

async function addLocale() {
  addErrors.value = {}
  if (!addForm.value.code.trim())  addErrors.value.code  = 'Il codice è obbligatorio'
  if (!addForm.value.label.trim()) addErrors.value.label = 'Il nome è obbligatorio'
  if (Object.keys(addErrors.value).length) return

  addingLocale.value = true
  try {
    const locale = await i18nApi.createLocale({
      code:      addForm.value.code.trim().toLowerCase(),
      label:     addForm.value.label.trim(),
      isDefault: addForm.value.isDefault,
    })
    locales.value.push(locale)
    if (locale.isDefault) {
      locales.value.forEach(l => { if (l.code !== locale.code) l.isDefault = false })
    }
    showAddDialog.value = false
    toast.add({ severity: 'success', summary: 'Lingua aggiunta', life: 3000 })
  } catch (err: unknown) {
    const msg = (err as { message?: string })?.message ?? 'Errore imprevisto'
    if (msg.includes('already exists')) addErrors.value.code = 'Codice già in uso'
    else toast.add({ severity: 'error', summary: 'Errore', detail: msg, life: 4000 })
  } finally {
    addingLocale.value = false
  }
}

// ── Settings ──────────────────────────────────────────────────────────────────
const settings       = ref<I18nConfig | null>(null)
const loadingSettings = ref(false)
const saving         = ref(false)
const testing        = ref(false)
const testResult     = ref<'ok' | 'error' | null>(null)
const pinging        = ref(false)

const defaultPromptPlaceholder = `Translate the following {sourceLocaleName} text to {targetLocaleName} ({targetLocale}).

{text}`

const form = ref({
  baseUrl:        '',
  model:          '',
  apiKey:         '',
  sourceLocale:   '',
  promptTemplate: '',
})

async function loadSettings() {
  loadingSettings.value = true
  try {
    settings.value = await i18nApi.getSettings()
    form.value = {
      baseUrl:        settings.value.baseUrl,
      model:          settings.value.model,
      apiKey:         '',
      sourceLocale:   settings.value.sourceLocale,
      promptTemplate: settings.value.promptTemplate,
    }
  } catch {
    toast.add({ severity: 'error', summary: 'Errore caricamento impostazioni', life: 3000 })
  } finally {
    loadingSettings.value = false
  }
}

async function saveSettings() {
  saving.value = true
  testResult.value = null
  try {
    const payload: Record<string, string> = {
      baseUrl:        form.value.baseUrl,
      model:          form.value.model,
      sourceLocale:   form.value.sourceLocale,
      promptTemplate: form.value.promptTemplate,
    }
    if (form.value.apiKey) payload['apiKey'] = form.value.apiKey
    settings.value = await i18nApi.updateSettings(payload)
    toast.add({ severity: 'success', summary: 'Impostazioni salvate', life: 3000 })
  } catch {
    toast.add({ severity: 'error', summary: 'Errore salvataggio', life: 3000 })
  } finally {
    saving.value = false
  }
}

async function doPing() {
  pinging.value = true
  try {
    const res = await i18nApi.pingServer()
    toast.add({
      severity: 'success',
      summary:  'Ping riuscito',
      detail:   res.message + ' — se Testa connessione rimane in attesa, il motore LLM è occupato: riavvia il server LLM per svuotare la coda.',
      life:     6000,
    })
  } catch (err: unknown) {
    const msg = (err as { message?: string })?.message ?? 'Server non raggiungibile'
    toast.add({ severity: 'warn', summary: 'Ping fallito', detail: msg, life: 4000 })
  } finally {
    pinging.value = false
  }
}

async function testConnection() {
  testing.value = true
  testResult.value = null
  try {
    const res = await i18nApi.testConnection()
    testResult.value = 'ok'
    toast.add({ severity: 'success', summary: 'Test riuscito', detail: res.message, life: 4000 })
  } catch (err: unknown) {
    testResult.value = 'error'
    const msg = (err as { message?: string })?.message ?? 'Connessione fallita'
    toast.add({ severity: 'error', summary: 'Test fallito', detail: msg, life: 4000 })
  } finally {
    testing.value = false
  }
}

onMounted(() => {
  loadLocales()
  loadSettings()
})
</script>
