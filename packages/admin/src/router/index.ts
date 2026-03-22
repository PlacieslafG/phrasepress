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
          path: 'posts/:type',
          name: 'post-list',
          component: () => import('@/pages/PostListPage.vue'),
        },
        {
          path: 'posts/:type/new',
          name: 'post-new',
          component: () => import('@/pages/PostEditorPage.vue'),
        },
        {
          path: 'posts/:type/:id/edit',
          name: 'post-edit',
          component: () => import('@/pages/PostEditorPage.vue'),
        },
        {
          path: 'taxonomy/:slug',
          name: 'terms',
          component: () => import('@/pages/TermsPage.vue'),
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
          meta: { requireCapability: 'upload_files' },
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
          meta: { requireCapability: 'manage_plugins' },
        },
        {
          path: 'field-groups/new',
          name: 'field-group-new',
          component: () => import('@/pages/FieldGroupEditorPage.vue'),
          meta: { requireCapability: 'manage_plugins' },
        },
        {
          path: 'field-groups/:id',
          name: 'field-group-edit',
          component: () => import('@/pages/FieldGroupEditorPage.vue'),
          meta: { requireCapability: 'manage_plugins' },
        },
        {
          path: 'forms',
          name: 'forms',
          component: () => import('@/pages/FormsPage.vue'),
          meta: { requireCapability: 'manage_plugins' },
        },
        {
          path: 'forms/new',
          name: 'form-new',
          component: () => import('@/pages/FormEditorPage.vue'),
          meta: { requireCapability: 'manage_plugins' },
        },
        {
          path: 'forms/:id/edit',
          name: 'form-edit',
          component: () => import('@/pages/FormEditorPage.vue'),
          meta: { requireCapability: 'manage_plugins' },
        },
        {
          path: 'forms/:id/submissions',
          name: 'form-submissions',
          component: () => import('@/pages/FormSubmissionsPage.vue'),
          meta: { requireCapability: 'manage_plugins' },
        },
        {
          path: 'mailer-settings',
          name: 'mailer-settings',
          component: () => import('@/pages/MailerSettingsPage.vue'),
          meta: { requireCapability: 'manage_options' },
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
          meta: { requireCapability: 'manage_plugins' },
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
})

export default router
