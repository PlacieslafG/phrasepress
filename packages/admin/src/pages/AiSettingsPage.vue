<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import Select from 'primevue/select'
import Textarea from 'primevue/textarea'
import { getAiSettings, updateAiSettings, type AiSettings } from '@/api/ai.js'
import { ApiError } from '@/api/client.js'

const toast = useToast()

const loading   = ref(true)
const saving    = ref(false)
const hasApiKey = ref(false)

const form = ref<{
  provider:     'openai' | 'anthropic' | 'ollama'
  model:        string
  apiKey:       string
  baseUrl:      string
  systemPrompt: string
  allowedPaths: string
}>({
  provider:     'openai',
  model:        'gpt-4o-mini',
  apiKey:       '',
  baseUrl:      '',
  systemPrompt: 'You are a helpful assistant integrated into PhrasePress CMS. You can read and write CMS content and project files using the available tools.',
  allowedPaths: '',
})

const providerOptions = [
  { label: 'OpenAI',    value: 'openai'    },
  { label: 'Anthropic', value: 'anthropic' },
  { label: 'Ollama',    value: 'ollama'    },
]

const defaultModels: Record<string, string> = {
  openai:    'gpt-4o-mini',
  anthropic: 'claude-3-5-haiku-latest',
  ollama:    'llama3.2',
}

function onProviderChange(): void {
  form.value.model = defaultModels[form.value.provider] ?? ''
  if (form.value.provider === 'ollama' && !form.value.baseUrl) {
    form.value.baseUrl = 'http://localhost:11434/v1'
  }
}

onMounted(async () => {
  try {
    const settings = await getAiSettings()
    form.value.provider     = settings.provider
    form.value.model        = settings.model
    form.value.baseUrl      = settings.baseUrl
    form.value.systemPrompt = settings.systemPrompt
    form.value.allowedPaths = settings.allowedPaths.join('\n')
    hasApiKey.value         = settings.hasApiKey
  } catch {
    toast.add({ severity: 'error', summary: 'Errore nel caricamento delle impostazioni AI', life: 4000 })
  } finally {
    loading.value = false
  }
})

async function save(): Promise<void> {
  saving.value = true
  try {
    const paths = form.value.allowedPaths
      .split('\n')
      .map(p => p.trim())
      .filter(p => p.length > 0)

    await updateAiSettings({
      provider:     form.value.provider,
      model:        form.value.model,
      apiKey:       form.value.apiKey || undefined,
      baseUrl:      form.value.baseUrl,
      systemPrompt: form.value.systemPrompt,
      allowedPaths: paths,
    })

    hasApiKey.value  = form.value.apiKey !== '' || hasApiKey.value
    form.value.apiKey = ''
    toast.add({ severity: 'success', summary: 'Impostazioni AI salvate', life: 3000 })
  } catch (err) {
    const msg = err instanceof ApiError ? err.message : 'Errore nel salvataggio'
    toast.add({ severity: 'error', summary: msg, life: 4000 })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="p-6 max-w-2xl">
    <div class="flex items-center gap-3 mb-6">
      <i class="pi pi-sparkles text-2xl text-primary" />
      <div>
        <h1 class="text-xl font-bold">AI Settings</h1>
        <p class="text-sm text-surface-500">Configura il provider LLM e le impostazioni dell'assistente AI.</p>
      </div>
    </div>

    <div v-if="loading" class="flex items-center gap-2 text-surface-500">
      <i class="pi pi-spin pi-spinner" />
      Caricamento…
    </div>

    <form v-else class="flex flex-col gap-5" @submit.prevent="save">

      <!-- Provider -->
      <div class="flex flex-col gap-1.5">
        <label class="text-sm font-medium">Provider LLM</label>
        <Select
          v-model="form.provider"
          :options="providerOptions"
          optionLabel="label"
          optionValue="value"
          class="w-full"
          @change="onProviderChange"
        />
        <span class="text-xs text-surface-400">
          <template v-if="form.provider === 'ollama'">Ollama gira in locale, non richiede API key.</template>
          <template v-else-if="form.provider === 'anthropic'">Richiede un account Anthropic con credito attivo.</template>
          <template v-else>Compatibile con OpenAI API. Supporta anche API OpenAI-compatibili (es. OpenRouter).</template>
        </span>
      </div>

      <!-- Model -->
      <div class="flex flex-col gap-1.5">
        <label class="text-sm font-medium">Modello</label>
        <InputText v-model="form.model" placeholder="es. gpt-4o-mini" class="w-full" />
      </div>

      <!-- API Key -->
      <div v-if="form.provider !== 'ollama'" class="flex flex-col gap-1.5">
        <label class="text-sm font-medium">
          API Key
          <span v-if="hasApiKey" class="text-green-500 font-normal text-xs ml-2">
            <i class="pi pi-check-circle" /> Configurata
          </span>
        </label>
        <Password
          v-model="form.apiKey"
          :placeholder="hasApiKey ? 'Lascia vuoto per non modificare' : 'Inserisci la tua API key'"
          :feedback="false"
          toggle-mask
          class="w-full"
          inputClass="w-full"
        />
      </div>

      <!-- Base URL (Ollama o provider custom) -->
      <div v-if="form.provider === 'ollama' || form.provider === 'openai'" class="flex flex-col gap-1.5">
        <label class="text-sm font-medium">
          Base URL
          <span class="text-surface-400 font-normal text-xs ml-1">(opzionale)</span>
        </label>
        <InputText
          v-model="form.baseUrl"
          :placeholder="form.provider === 'ollama' ? 'http://localhost:11434/v1' : 'https://api.openai.com/v1'"
          class="w-full"
        />
        <span class="text-xs text-surface-400">
          Per Ollama: usa l'URL del server locale. Per OpenAI: lascia vuoto per il default.
        </span>
      </div>

      <!-- System Prompt -->
      <div class="flex flex-col gap-1.5">
        <label class="text-sm font-medium">System Prompt</label>
        <Textarea
          v-model="form.systemPrompt"
          rows="4"
          class="w-full font-mono text-sm"
          placeholder="Istruzioni di sistema per l'AI…"
        />
      </div>

      <!-- Allowed Paths -->
      <div class="flex flex-col gap-1.5">
        <label class="text-sm font-medium">Percorsi autorizzati (file tool)</label>
        <Textarea
          v-model="form.allowedPaths"
          rows="4"
          class="w-full font-mono text-sm"
          placeholder="/home/user/mio-progetto&#10;/var/www/html"
        />
        <span class="text-xs text-surface-400">
          Un percorso per riga. I tool <code>read_file</code>, <code>write_file</code> e <code>list_files</code>
          sono bloccati per qualsiasi path fuori da questa lista.
          Lascia vuoto per disabilitare i tool file system.
        </span>
      </div>

      <div class="flex justify-end pt-2">
        <Button
          type="submit"
          label="Salva impostazioni"
          icon="pi pi-save"
          :loading="saving"
        />
      </div>

    </form>
  </div>
</template>
