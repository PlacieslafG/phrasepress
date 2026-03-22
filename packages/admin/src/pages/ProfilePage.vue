<template>
  <div class="p-6 max-w-lg flex flex-col gap-6">
    <h2 class="text-2xl font-semibold">Profilo</h2>

    <div class="bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-xl p-6 flex flex-col gap-4">
      <div class="flex flex-col gap-1">
        <label class="text-sm font-medium">Username</label>
        <InputText :model-value="authStore.user?.username ?? ''" disabled class="w-full" />
      </div>

      <div class="flex flex-col gap-1">
        <label class="text-sm font-medium">Email</label>
        <InputText v-model="form.email" type="email" class="w-full" />
      </div>

      <div class="flex flex-col gap-1">
        <label class="text-sm font-medium">Nuova password <span class="text-surface-400 text-xs">(lascia vuoto per non cambiare)</span></label>
        <Password v-model="form.password" :feedback="false" toggle-mask class="w-full" input-class="w-full" />
      </div>

      <div v-if="error" class="text-red-500 text-sm">{{ error }}</div>

      <Button label="Salva modifiche" :loading="saving" @click="save" class="self-start" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useAuthStore } from '@/stores/auth.js'
import { usersApi } from '@/api/users.js'

const toast     = useToast()
const authStore = useAuthStore()

const saving = ref(false)
const error  = ref('')
const form   = ref({ email: '', password: '' })

onMounted(() => {
  form.value.email = authStore.user?.email ?? ''
})

async function save() {
  error.value = ''
  if (!form.value.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.value.email)) {
    error.value = 'Email non valida.'
    return
  }
  if (form.value.password && form.value.password.length < 8) {
    error.value = 'Password minimo 8 caratteri.'
    return
  }
  if (!authStore.user) return
  saving.value = true
  try {
    const data: { email: string; password?: string } = { email: form.value.email }
    if (form.value.password) data.password = form.value.password
    await usersApi.update(authStore.user.id, data)
    form.value.password = ''
    toast.add({ severity: 'success', summary: 'Salvato', detail: 'Profilo aggiornato', life: 2000 })
    await authStore.fetchMe()
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Errore nel salvataggio.'
  } finally {
    saving.value = false
  }
}
</script>
