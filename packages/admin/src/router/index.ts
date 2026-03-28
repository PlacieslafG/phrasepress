import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth.js'
import { useAppStore } from '@/stores/app.js'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/pages/LoginPage.vue'),
    },
    {
      path: '/',
      component: () => import('@/layouts/AdminLayout.vue'),
      meta: { requireAuth: true },
      children: [
        {
          path: '',
          name: 'dashboard',
          component: () => import('@/pages/DashboardPage.vue'),
        },
        {
          path: 'folios/:codex',
          name: 'folio-list',
          component: () => import('@/pages/FolioListPage.vue'),
        },
        {
          path: 'folios/:codex/new',
          name: 'folio-new',
          component: () => import('@/pages/FolioEditorPage.vue'),
        },
        {
          path: 'folios/:codex/:id/edit',
          name: 'folio-edit',
          component: () => import('@/pages/FolioEditorPage.vue'),
        },
        {
          path: 'vocabulary/:slug',
          name: 'terms',
          component: () => import('@/pages/VocabularyTermsPage.vue'),
        },
        {
          path: 'users',
          name: 'users',
          component: () => import('@/pages/UsersPage.vue'),
          meta: { requireCapability: 'manage_users' },
        },
        {
          path: 'roles',
          name: 'roles',
          component: () => import('@/pages/RolesPage.vue'),
          meta: { requireCapability: 'manage_roles' },
        },
        {
          path: 'media',
          name: 'media',
          component: () => import('@/pages/MediaPage.vue'),
          meta: { requireCapability: 'upload_files', requirePlugin: 'phrasepress-media' },
        },
        {
          path: 'plugins',
          name: 'plugins',
          component: () => import('@/pages/PluginsPage.vue'),
          meta: { requireCapability: 'manage_plugins' },
        },
        {
          path: 'profile',
          name: 'profile',
          component: () => import('@/pages/ProfilePage.vue'),
        },
        {
          path: 'settings',
          name: 'settings',
          component: () => import('@/pages/SettingsPage.vue'),
        },
        {
          path: 'field-groups',
          name: 'field-groups',
          component: () => import('@/pages/FieldGroupsPage.vue'),
          meta: { requireCapability: 'manage_plugins', requirePlugin: 'phrasepress-fields' },
        },
        {
          path: 'field-groups/new',
          name: 'field-group-new',
          component: () => import('@/pages/FieldGroupEditorPage.vue'),
          meta: { requireCapability: 'manage_plugins', requirePlugin: 'phrasepress-fields' },
        },
        {
          path: 'field-groups/:id',
          name: 'field-group-edit',
          component: () => import('@/pages/FieldGroupEditorPage.vue'),
          meta: { requireCapability: 'manage_plugins', requirePlugin: 'phrasepress-fields' },
        },
        {
          path: 'forms',
          name: 'forms',
          component: () => import('@/pages/FormsPage.vue'),
          meta: { requireCapability: 'manage_plugins', requirePlugin: 'phrasepress-forms' },
        },
        {
          path: 'forms/new',
          name: 'form-new',
          component: () => import('@/pages/FormEditorPage.vue'),
          meta: { requireCapability: 'manage_plugins', requirePlugin: 'phrasepress-forms' },
        },
        {
          path: 'forms/:id/edit',
          name: 'form-edit',
          component: () => import('@/pages/FormEditorPage.vue'),
          meta: { requireCapability: 'manage_plugins', requirePlugin: 'phrasepress-forms' },
        },
        {
          path: 'forms/:id/submissions',
          name: 'form-submissions',
          component: () => import('@/pages/FormSubmissionsPage.vue'),
          meta: { requireCapability: 'manage_plugins', requirePlugin: 'phrasepress-forms' },
        },
        {
          path: 'mailer-settings',
          name: 'mailer-settings',
          component: () => import('@/pages/MailerSettingsPage.vue'),
          meta: { requireCapability: 'manage_options', requirePlugin: 'phrasepress-mailer' },
        },
        {
          path: 'api-tester',
          name: 'api-tester',
          component: () => import('@/pages/ApiTesterPage.vue'),
          meta: { requireCapability: 'manage_plugins' },
        },
        {
          path: 'i18n',
          name: 'i18n-settings',
          component: () => import('@/pages/I18nSettingsPage.vue'),
          meta: { requireCapability: 'manage_plugins', requirePlugin: 'phrasepress-i18n' },
        },
        {
          path: 'db-monitor',
          name: 'db-monitor',
          component: () => import('@/pages/DbMonitorPage.vue'),
          meta: { requireCapability: 'manage_options', requirePlugin: 'phrasepress-db-monitor' },
        },
        {
          path: 'backup',
          name: 'backup',
          component: () => import('@/pages/BackupPage.vue'),
          meta: { requireCapability: 'manage_options', requirePlugin: 'phrasepress-backup' },
        },
      ],
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  // Al primo accesso (o dopo reload), tenta di ripristinare la sessione
  // dal refresh token nel cookie httpOnly. Non farlo se la destinazione è
  // /login: il backend blocca comunque i cookie invalidati dal logout.
  if (!auth.sessionRestored) {
    auth.sessionRestored = true
    if (!auth.isLoggedIn && to.name !== 'login') {
      await auth.fetchMe()
    }
    if (auth.isLoggedIn) {
      await useAppStore().load()
    }
  }

  if (to.meta.requireAuth && !auth.isLoggedIn) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  if (to.name === 'login' && auth.isLoggedIn) {
    return { name: 'dashboard' }
  }

  if (to.meta.requireCapability) {
    const cap = to.meta.requireCapability as string
    if (!auth.hasCapability(cap)) {
      return { name: 'dashboard' }
    }
  }

  if (to.meta.requirePlugin) {
    const plugin = to.meta.requirePlugin as string
    if (!useAppStore().isPluginActive(plugin)) {
      return { name: 'dashboard' }
    }
  }
})

export default router
