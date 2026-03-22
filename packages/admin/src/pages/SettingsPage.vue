<template>
  <div class="p-6 max-w-2xl mx-auto">
    <h1 class="text-2xl font-bold mb-6">Impostazioni</h1>

    <div class="surface-card rounded-xl border border-surface-border p-6">
      <h2 class="text-lg font-semibold mb-4">Aspetto</h2>

      <div class="flex items-center justify-between">
        <div>
          <p class="font-medium">Modalità scura</p>
          <p class="text-sm text-surface-500">Passa tra tema chiaro e tema scuro</p>
        </div>
        <ToggleSwitch :model-value="themeStore.isDark" @update:model-value="themeStore.toggleDark()" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useThemeStore } from '@/stores/theme.js'

const themeStore = useThemeStore()
</script>
