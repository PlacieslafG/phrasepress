<script setup lang="ts">
import { RouterView } from 'vue-router'
import Toast from 'primevue/toast'
import ConfirmDialog from 'primevue/confirmdialog'
import ServerRestartDialog from '@/components/ServerRestartDialog.vue'
import AiChatPanel from '@/components/AiChatPanel.vue'
import { useAppStore } from '@/stores/app.js'
import { useAuthStore } from '@/stores/auth.js'

const appStore  = useAppStore()
const authStore = useAuthStore()
</script>

<template>
  <RouterView />
  <Toast position="top-right" />
  <ConfirmDialog />
  <ServerRestartDialog />
  <AiChatPanel v-if="appStore.isPluginActive('phrasepress-ai') && authStore.isLoggedIn" />
</template>
