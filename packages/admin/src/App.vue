<script setup lang="ts">
import { RouterView } from 'vue-router'
import Toast from 'primevue/toast'
import ConfirmDialog from 'primevue/confirmdialog'
import ServerRestartDialog from '@/components/ServerRestartDialog.vue'
</script>

<template>
  <RouterView />
  <Toast position="top-right" />
  <ConfirmDialog />
  <ServerRestartDialog />
</template>
