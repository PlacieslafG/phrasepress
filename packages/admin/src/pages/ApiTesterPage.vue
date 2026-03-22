<template>
  <iframe
    ref="iframeRef"
    src="/api-tester.html"
    style="width:100%;height:calc(100vh - 56px);border:none;display:block"
    title="API Tester"
    @load="onLoad"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth.js'

const iframeRef = ref<HTMLIFrameElement>()
const authStore = useAuthStore()

function onLoad() {
  iframeRef.value?.contentWindow?.postMessage(
    { type: 'pp-auth', token: authStore.accessToken, base: '/api/v1' },
    window.location.origin
  )
}
</script>
