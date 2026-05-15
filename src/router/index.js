import { createRouter, createWebHistory } from 'vue-router'
import { initKeycloak, isAuthenticated, hasCoachRole, hasAdminRole, login } from '@/auth/keycloak'

const routes = [
  {
    path: '/',
    component: () => import('@/layouts/DashboardLayout.vue'),
    meta: { public: true },
    children: [
      {
        path: '',
        name: 'venues',
        component: () => import('@/views/VenuesView.vue'),
        meta: { public: true, titleKey: 'venues.title' },
      },
    ],
  },
  {
    path: '/home',
    name: 'home',
    component: () => import('@/views/HomeView.vue'),
    meta: { public: true },
  },
  {
    path: '/dashboard',
    component: () => import('@/layouts/DashboardLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'dashboard',
        component: () => import('@/views/DashboardView.vue'),
        meta: { titleKey: 'nav.dashboard' },
      },
      {
        path: 'enroll-team',
        name: 'enroll-team',
        redirect: { name: 'dashboard', query: { wizard: '1' } },
        meta: { titleKey: 'nav.enrollTeam' },
      },
      {
        path: 'enroll-class',
        name: 'enroll-class',
        redirect: { name: 'dashboard', query: { wizard: '1' } },
        meta: { titleKey: 'nav.enrollClass' },
      },
      {
        path: 'enroll-future',
        name: 'enroll-future',
        redirect: { name: 'dashboard', query: { wizard: '1' } },
        meta: { titleKey: 'nav.enrollFuture' },
      },
      {
        path: 'team/:id',
        name: 'team-detail',
        component: () => import('@/views/TeamDetailView.vue'),
        meta: { titleKey: 'nav.teamDetail' },
      },
      {
        path: 'class/:id',
        name: 'class-detail',
        component: () => import('@/views/ClassDetailView.vue'),
        meta: { titleKey: 'nav.classDetail' },
      },
      {
        path: 'group/:id',
        name: 'group-detail',
        component: () => import('@/views/GroupDetailView.vue'),
        meta: { titleKey: 'nav.groupDetail' },
      },
      {
        path: 'admin/documents',
        name: 'admin-documents',
        component: () => import('@/views/AdminDocumentsView.vue'),
        meta: { titleKey: 'nav.adminDocuments', requiresAdmin: true },
      },
      {
        path: 'admin/calendar',
        name: 'admin-calendar',
        component: () => import('@/views/AdminCalendarView.vue'),
        meta: { titleKey: 'nav.adminCalendar', requiresAdmin: true },
      },
      {
        path: 'admin/translations',
        name: 'admin-translations',
        component: () => import('@/views/AdminTranslationsView.vue'),
        meta: { titleKey: 'nav.adminTranslations', requiresAdmin: true },
      },
      {
        path: 'settings',
        name: 'settings',
        component: () => import('@/views/SettingsView.vue'),
        meta: { titleKey: 'common.settings' },
      },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

let keycloakReady = false

router.beforeEach(async (to) => {
  if (!keycloakReady) {
    try {
      await initKeycloak({ onLoad: 'check-sso' })
      keycloakReady = true
    } catch (e) {
      console.error('Keycloak init failed', e)
      keycloakReady = true
    }
  }

  if (to.meta.requiresAuth) {
    if (!isAuthenticated()) {
      login()
      return false
    }
    // Only users with realm role "coach" may access the app
    if (!hasCoachRole()) {
      return { name: 'venues', query: { forbidden: '1' } }
    }
    if (to.meta.requiresAdmin && !hasAdminRole()) {
      return { name: 'dashboard' }
    }
  }
  return true
})

export default router
