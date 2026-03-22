<template>
  <div class="min-h-screen flex items-center justify-center bg-surface-ground">
    <Card class="w-full max-w-sm">
      <template #title>
        <div class="text-center">
          <h1 class="text-2xl font-bold">PhrasePress</h1>
          <p class="text-surface-500 text-sm font-normal mt-1">Admin Panel</p>
        </div>
      </template>

      <template #content>
        <form class="flex flex-col gap-4" @submit.prevent="handleSubmit">
          <div class="flex flex-col gap-1">
            <label for="username" class="text-sm font-medium">Username</label>
            <InputText
              id="username"
              v-model="form.username"
              autocomplete="username"
              :disabled="loading"
              fluid
            />
          </div>

          <div class="flex flex-col gap-1">
            <label for="password" class="text-sm font-medium">Password</label>
            <Password
              id="password"
              v-model="form.password"
              :feedback="false"
              toggle-mask
              autocomplete="current-password"
              :disabled="loading"
              fluid
            />
          </div>

          <Message v-if="errorMsg" severity="error" :closable="false">{{ errorMsg }}</Message>

          <Button
            type="submit"
            label="Accedi"
            icon="pi pi-sign-in"
            :loading="loading"
            fluid
          />
        </form>
      </template>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.js'
import { useAppStore } from '@/stores/app.js'
import { ApiError } from '@/api/client.js'

const router    = useRouter()
const authStore = useAuthStore()
const appStore  = useAppStore()

const form = ref({ username: '', password: '' })
const loading  = ref(false)
const errorMsg = ref('')

async function handleSubmit() {
  errorMsg.value = ''
  loading.value  = true
  try {
    await authStore.login(form.value.username, form.value.password)
    await appStore.load()
    router.push('/')
  } catch (err) {
    if (err instanceof ApiError) {
      errorMsg.value = err.message
    } else {
      errorMsg.value = 'Errore di connessione'
    }
  } finally {
    loading.value = false
  }
}
</script>
