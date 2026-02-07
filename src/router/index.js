import { createRouter, createWebHistory } from 'vue-router'
import { initKeycloak, isAuthenticated, hasCoachRole, login } from '@/auth/keycloak'

const routes = [
  {
    path: '/',
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
        component: () => import('@/views/EnrollTeamView.vue'),
        meta: { titleKey: 'nav.enrollTeam' },
      },
      {
        path: 'enroll-class',
        name: 'enroll-class',
        component: () => import('@/views/EnrollClassView.vue'),
        meta: { titleKey: 'nav.enrollClass' },
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
      return { name: 'home', query: { forbidden: '1' } }
    }
  }
  return true
})

export default router
