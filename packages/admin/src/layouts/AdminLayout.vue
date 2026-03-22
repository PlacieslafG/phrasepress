<template>
  <div class="flex flex-col h-screen bg-surface-ground">
    <!-- Header -->
    <header
      class="flex items-center justify-between px-4 h-14 bg-surface-card border-b border-surface-border shrink-0"
      :style="{ color: themeStore.isDark ? '#e2e8f0' : '#334155' }"
    >
      <div class="flex items-center gap-3">
        <button class="hbtn" @click="sidebarOpen = !sidebarOpen">
          <i class="pi pi-bars" />
        </button>
        <span class="font-semibold text-lg">PhrasePress</span>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-sm text-surface-500">{{ authStore.user?.username }}</span>
        <button
          class="hbtn"
          v-tooltip.bottom="themeStore.isDark ? 'Tema chiaro' : 'Tema scuro'"
          @click="themeStore.toggleDark()"
        >
          <i :class="themeStore.isDark ? 'pi pi-sun' : 'pi pi-moon'" />
        </button>
        <button class="hbtn gap-1.5 px-2" @click="handleLogout">
          <i class="pi pi-sign-out" />
          <span class="text-sm">Logout</span>
        </button>
      </div>
    </header>

    <div class="flex flex-1 overflow-hidden">
      <!-- Sidebar -->
      <aside
        class="bg-surface-card border-r border-surface-border flex flex-col overflow-y-auto transition-all duration-200"
        :class="sidebarOpen ? 'w-56' : 'w-0'"
      >
        <nav class="flex flex-col gap-0.5 p-3 min-w-56 flex-1">

          <RouterLink to="/" v-slot="{ navigate, isExactActive }" custom>
            <a @click="navigate" :class="navClass(isExactActive)">
              <i class="pi pi-home text-sm shrink-0" />
              <span>Dashboard</span>
            </a>
          </RouterLink>

          <template v-if="appStore.postTypes.length > 0 || authStore.hasCapability('upload_files')">
            <p class="text-xs font-semibold text-surface-400 uppercase px-3 pt-4 pb-1 tracking-wider">Contenuti</p>
            <RouterLink
              v-for="pt in appStore.postTypes"
              :key="pt.name"
              :to="`/posts/${pt.name}`"
              v-slot="{ navigate, isActive }"
              custom
            >
              <a @click="navigate" :class="navClass(isActive)">
                <i :class="ptIcon(pt.icon) + ' text-sm shrink-0'" />
                <span>{{ pt.label }}</span>
              </a>
            </RouterLink>
            <RouterLink v-if="authStore.hasCapability('upload_files')" to="/media" v-slot="{ navigate, isActive }" custom>
              <a @click="navigate" :class="navClass(isActive)">
                <i class="pi pi-image text-sm shrink-0" />
                <span>Media</span>
              </a>
            </RouterLink>
          </template>

          <template v-if="appStore.taxonomies.length > 0">
            <p class="text-xs font-semibold text-surface-400 uppercase px-3 pt-4 pb-1 tracking-wider">Tassonomie</p>
            <RouterLink
              v-for="tax in appStore.taxonomies"
              :key="tax.slug"
              :to="`/taxonomy/${tax.slug}`"
              v-slot="{ navigate, isActive }"
              custom
            >
              <a @click="navigate" :class="navClass(isActive)">
                <i class="pi pi-tags text-sm shrink-0" />
                <span>{{ tax.name }}</span>
              </a>
            </RouterLink>
          </template>

          <template v-if="authStore.hasCapability('manage_users')">
            <p class="text-xs font-semibold text-surface-400 uppercase px-3 pt-4 pb-1 tracking-wider">Amministrazione</p>

            <RouterLink to="/users" v-slot="{ navigate, isActive }" custom>
              <a @click="navigate" :class="navClass(isActive)">
                <i class="pi pi-users text-sm shrink-0" />
                <span>Utenti</span>
              </a>
            </RouterLink>

            <RouterLink to="/roles" v-slot="{ navigate, isActive }" custom>
              <a @click="navigate" :class="navClass(isActive)">
                <i class="pi pi-shield text-sm shrink-0" />
                <span>Ruoli</span>
              </a>
            </RouterLink>
          </template>

          <template v-if="authStore.hasCapability('manage_plugins')">
            <p class="text-xs font-semibold text-surface-400 uppercase px-3 pt-4 pb-1 tracking-wider">Strumenti</p>

            <RouterLink to="/plugins" v-slot="{ navigate, isActive }" custom>
              <a @click="navigate" :class="navClass(isActive)">
                <i class="pi pi-box text-sm shrink-0" />
                <span>Plugin</span>
              </a>
            </RouterLink>

            <RouterLink
              v-if="appStore.isPluginActive('phrasepress-fields')"
              to="/field-groups"
              v-slot="{ navigate, isActive }"
              custom
            >
              <a @click="navigate" :class="navClass(isActive)">
                <i class="pi pi-list-check text-sm shrink-0" />
                <span>Gruppi di campi</span>
              </a>
            </RouterLink>

            <RouterLink
              v-if="appStore.isPluginActive('phrasepress-forms')"
              to="/forms"
              v-slot="{ navigate, isActive }"
              custom
            >
              <a @click="navigate" :class="navClass(isActive)">
                <i class="pi pi-envelope text-sm shrink-0" />
                <span>Form</span>
              </a>
            </RouterLink>

            <RouterLink
              v-if="appStore.isPluginActive('phrasepress-mailer')"
              to="/mailer-settings"
              v-slot="{ navigate, isActive }"
              custom
            >
              <a @click="navigate" :class="navClass(isActive)">
                <i class="pi pi-send text-sm shrink-0" />
                <span>Mailer</span>
              </a>
            </RouterLink>

            <RouterLink
              v-if="appStore.isPluginActive('phrasepress-i18n')"
              to="/i18n"
              v-slot="{ navigate, isActive }"
              custom
            >
              <a @click="navigate" :class="navClass(isActive)">
                <i class="pi pi-language text-sm shrink-0" />
                <span>Lingue</span>
              </a>
            </RouterLink>

            <RouterLink to="/api-tester" v-slot="{ navigate, isActive }" custom>
              <a @click="navigate" :class="navClass(isActive)">
                <i class="pi pi-code text-sm shrink-0" />
                <span>API Tester</span>
              </a>
            </RouterLink>
          </template>

          <div class="mt-auto pt-3 border-t border-surface-border">
            <RouterLink to="/settings" v-slot="{ navigate, isActive }" custom>
              <a @click="navigate" :class="navClass(isActive)">
                <i class="pi pi-cog text-sm shrink-0" />
                <span>Impostazioni</span>
              </a>
            </RouterLink>
          </div>

        </nav>
      </aside>

      <!-- Contenuto principale -->
      <main class="flex-1 overflow-y-auto">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth.js'
import { useAppStore } from '@/stores/app.js'
import { useThemeStore } from '@/stores/theme.js'

const authStore = useAuthStore()
const appStore  = useAppStore()
const themeStore = useThemeStore()
const sidebarOpen = ref(true)

function navClass(active: boolean): string {
  return [
    'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors select-none',
    active
      ? 'bg-primary/15 text-primary font-semibold'
      : 'text-surface-500 hover:bg-surface-hover hover:text-surface-700 dark:hover:text-surface-200',
  ].join(' ')
}

// Normalize icon: 'pi-file-edit' → 'pi pi-file-edit', 'pi pi-file-edit' → unchanged
function ptIcon(icon?: string): string {
  if (!icon) return 'pi pi-file'
  if (icon.startsWith('pi pi-')) return icon
  if (icon.startsWith('pi-')) return `pi ${icon}`
  return `pi pi-${icon}`
}

async function handleLogout() {
  await authStore.logout()
  window.location.replace('/login')
}
</script>
