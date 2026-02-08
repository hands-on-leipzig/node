<script setup>
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { getUserProfile, logout } from '@/auth/keycloak'
import { setLocale } from '@/i18n'
import { theme, setTheme } from '@/theme'
import { listTeams, listClasses } from '@/services/draht'

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const user = computed(() => getUserProfile())
const sidebarOpen = ref(false)
const profileMenuOpen = ref(false)
const teams = ref([])
const classes = ref([])
const sidebarLoading = ref(false)

const navItems = [
  { path: '/dashboard', nameKey: 'nav.dashboard', exact: true, icon: 'bi-grid-1x2-fill' },
]

async function loadSidebarLists() {
  sidebarLoading.value = true
  try {
    const [teamsRes, classesRes] = await Promise.allSettled([
      listTeams(),
      listClasses(),
    ])
    if (teamsRes.status === 'fulfilled' && teamsRes.value?.data) {
      const d = teamsRes.value.data
      teams.value = Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : [])
    }
    if (classesRes.status === 'fulfilled' && classesRes.value?.data) {
      const d = classesRes.value.data
      classes.value = Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : [])
    }
  } finally {
    sidebarLoading.value = false
  }
}

function teamFlyoutLabel(team) {
  const name = team.name || t('dashboard.team')
  const ref = team.ref || '#' + team.id
  return name + ' ' + ref
}
function classFlyoutLabel(cls) {
  const name = cls.name || t('dashboard.class')
  const ref = cls.ref || '#' + cls.id
  return name + ' ' + ref
}
function goTeam(id) {
  closeSidebar()
  router.push({ name: 'team-detail', params: { id } })
}
function goClass(id) {
  closeSidebar()
  router.push({ name: 'class-detail', params: { id } })
}
function isTeamActive(id) {
  return route.name === 'team-detail' && route.params.id === String(id)
}
function isClassActive(id) {
  return route.name === 'class-detail' && route.params.id === String(id)
}

function isActive(item) {
  if (item.exact) return route.path === item.path
  return route.path.startsWith(item.path)
}

const pageTitle = computed(() => {
  const key = route.meta?.titleKey
  return key ? t(key) : t('nav.dashboard')
})

function closeSidebar() {
  sidebarOpen.value = false
}
function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value
}

function openProfileMenu() {
  profileMenuOpen.value = !profileMenuOpen.value
}
function closeProfileMenu() {
  profileMenuOpen.value = false
}

function handleClickOutside(e) {
  const el = e.target
  if (!el.closest('.profile-trigger') && !el.closest('.profile-menu')) {
    closeProfileMenu()
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  loadSidebarLists()
})
onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
watch(
  () => route.path,
  (path) => {
    if (path === '/dashboard' || path === '/dashboard/') loadSidebarLists()
  }
)

function switchToDe() {
  setLocale('de')
}
function switchToEn() {
  setLocale('en')
}

function doLogout() {
  closeProfileMenu()
  logout()
}

const userInitials = computed(() => {
  const name = user.value?.name
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
})
</script>

<template>
  <div class="dashboard-layout">
    <button
      type="button"
      class="menu-toggle"
      aria-label="Menu"
      @click="toggleSidebar"
    >
      <i class="bi bi-list"></i>
    </button>
    <div
      v-if="sidebarOpen"
      class="sidebar-backdrop"
      aria-hidden="true"
      @click="closeSidebar"
    ></div>
    <aside class="sidebar" :class="{ open: sidebarOpen }">
      <div class="sidebar-head">
        <RouterLink to="/dashboard" class="sidebar-item sidebar-logo-link" @click="closeSidebar">
          <span class="sidebar-item-icon">
            <img src="@/assets/hot.png" alt="" class="sidebar-logo" />
          </span>
          <span class="flyout">{{ t('common.appName') }}</span>
        </RouterLink>
      </div>
      <nav class="sidebar-nav">
        <RouterLink
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="nav-link sidebar-item"
          :class="{ active: isActive(item) }"
          @click="closeSidebar"
        >
          <span class="sidebar-item-icon">
            <i class="bi" :class="item.icon"></i>
          </span>
          <span class="flyout">{{ t(item.nameKey) }}</span>
        </RouterLink>
        <div v-if="sidebarLoading" class="sidebar-list-loading">
          <i class="bi bi-arrow-repeat spin"></i>
        </div>
        <template v-else>
          <div v-for="team in teams" :key="'team-' + team.id" class="sidebar-item sidebar-entry" :class="{ active: isTeamActive(team.id) }" :title="teamFlyoutLabel(team)" @click="goTeam(team.id)">
            <span class="sidebar-item-icon">
              <i class="bi bi-person-fill" aria-hidden="true"></i>
            </span>
            <span class="flyout">{{ teamFlyoutLabel(team) }}</span>
          </div>
          <div v-for="cls in classes" :key="'class-' + cls.id" class="sidebar-item sidebar-entry" :class="{ active: isClassActive(cls.id) }" :title="classFlyoutLabel(cls)" @click="goClass(cls.id)">
            <span class="sidebar-item-icon">
              <i class="bi bi-mortarboard-fill" aria-hidden="true"></i>
            </span>
            <span class="flyout">{{ classFlyoutLabel(cls) }}</span>
          </div>
        </template>
      </nav>
      <div class="sidebar-bottom">
        <div class="profile-trigger sidebar-item">
          <button
            type="button"
            class="profile-btn"
            aria-haspopup="true"
            :aria-expanded="profileMenuOpen"
            @click="openProfileMenu"
          >
            <img
              v-if="user?.picture"
              :src="user.picture"
              alt=""
              class="profile-avatar-img"
            />
            <span v-else class="profile-avatar-initials">{{ userInitials }}</span>
          </button>
          <span class="flyout profile-flyout">{{ user?.name ?? t('common.coach') }}</span>
          <Transition name="profile-menu">
            <div v-if="profileMenuOpen" class="profile-menu" role="menu">
              <div class="profile-menu-header">
                <span class="profile-menu-name">{{ user?.name ?? t('common.coach') }}</span>
              </div>
              <button type="button" class="profile-menu-item" role="menuitem" disabled>
                <i class="bi bi-gear"></i>
                <span>{{ t('common.settings') }}</span>
              </button>
              <button type="button" class="profile-menu-item" role="menuitem" disabled>
                <i class="bi bi-question-circle"></i>
                <span>{{ t('common.help') }}</span>
              </button>
              <div class="profile-menu-section">
                <span class="profile-menu-label">{{ t('common.language') }}</span>
                <div class="profile-menu-btns">
                  <button
                    type="button"
                    class="profile-pill"
                    :class="{ active: locale === 'de' }"
                    @click="switchToDe"
                  >
                    DE
                  </button>
                  <button
                    type="button"
                    class="profile-pill"
                    :class="{ active: locale === 'en' }"
                    @click="switchToEn"
                  >
                    EN
                  </button>
                </div>
              </div>
              <div class="profile-menu-section">
                <span class="profile-menu-label">{{ t('common.theme') }}</span>
                <div class="profile-menu-btns">
                  <button
                    type="button"
                    class="profile-pill"
                    :class="{ active: theme === 'light' }"
                    @click="setTheme('light')"
                  >
                    <i class="bi bi-sun-fill"></i>
                    {{ t('common.light') }}
                  </button>
                  <button
                    type="button"
                    class="profile-pill"
                    :class="{ active: theme === 'dark' }"
                    @click="setTheme('dark')"
                  >
                    <i class="bi bi-moon-fill"></i>
                    {{ t('common.dark') }}
                  </button>
                </div>
              </div>
              <button
                type="button"
                class="profile-menu-item profile-menu-item-logout"
                role="menuitem"
                @click="doLogout"
              >
                <i class="bi bi-box-arrow-right"></i>
                <span>{{ t('nav.logOut') }}</span>
              </button>
            </div>
          </Transition>
        </div>
      </div>
    </aside>
    <main class="main">
      <header class="header">
        <h1 class="page-title">{{ pageTitle }}</h1>
      </header>
      <div class="content">
        <RouterView />
      </div>
    </main>
  </div>
</template>

<style scoped>
.dashboard-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: var(--color-bg);
  position: relative;
}
.menu-toggle {
  display: none;
  position: fixed;
  top: 0.75rem;
  left: 0.75rem;
  z-index: 102;
  width: var(--touch-lg);
  height: var(--touch-lg);
  padding: 0;
  border: none;
  border-radius: var(--radius);
  background: var(--color-bg-elevated);
  color: var(--color-text);
  cursor: pointer;
  align-items: center;
  justify-content: center;
  font-size: 1.35rem;
  box-shadow: var(--shadow);
}
.sidebar-backdrop {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(2px);
}

.sidebar {
  width: 4.5rem;
  height: 100vh;
  flex-shrink: 0;
  background: var(--color-sidebar);
  border-right: 1px solid var(--color-sidebar-border);
  padding: 1rem 0;
  display: flex;
  flex-direction: column;
  overflow: visible;
}

/* Dock-style: item expands (scale) on hover, label in flyout to the right */
.sidebar-item {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 2.75rem;
  margin: 0 0.5rem;
  border-radius: var(--radius);
  transition: background 0.15s;
}
.sidebar-item-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s ease;
}
.sidebar-item:hover .sidebar-item-icon {
  transform: scale(1.18);
}
.sidebar-item .flyout {
  position: absolute;
  left: 100%;
  top: 50%;
  transform: translateY(-50%);
  margin-left: 0.75rem;
  padding: 0.4rem 0.75rem;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text);
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
  z-index: 50;
}
.sidebar-item:hover .flyout {
  opacity: 1;
}

.sidebar-head {
  padding: 0 0 1rem;
  margin-bottom: 0.5rem;
  border-bottom: 1px solid var(--color-border);
}
.sidebar-logo-link {
  text-decoration: none;
  color: inherit;
}
.sidebar-logo {
  height: 2rem;
  width: auto;
  display: block;
  object-fit: contain;
}
.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}
.nav-link {
  padding: 0;
  min-height: 2.75rem;
  font-size: var(--text-base);
  color: var(--color-text-muted);
  text-decoration: none;
}
.nav-link .bi {
  font-size: 1.35rem;
  opacity: 0.9;
}
.nav-link:hover {
  background: var(--color-bg-hover);
  color: var(--color-text);
}
.nav-link.active {
  background: var(--color-accent-soft);
  color: var(--color-accent);
}
.nav-link.active .bi {
  opacity: 1;
}
.sidebar-list-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 2rem;
  padding: 0.5rem 0;
  color: var(--color-text-muted);
}
.sidebar-list-loading .spin {
  animation: spin 0.8s linear infinite;
}
.sidebar-entry {
  cursor: pointer;
  font-size: var(--text-base);
  color: var(--color-text-muted);
}
.sidebar-entry .bi {
  font-size: 1.25rem;
  opacity: 0.9;
}
.sidebar-entry:hover {
  background: var(--color-bg-hover);
  color: var(--color-text);
}
.sidebar-entry.active {
  background: var(--color-accent-soft);
  color: var(--color-accent);
}
.sidebar-entry.active .bi {
  opacity: 1;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
.profile-trigger .flyout.profile-flyout {
  max-width: 10rem;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar-bottom {
  padding: 0.5rem 0.75rem 0;
  border-top: 1px solid var(--color-border);
  margin-top: auto;
}
.profile-trigger {
  position: relative;
}
.profile-btn {
  width: 2.5rem;
  height: 2.5rem;
  min-width: 2.5rem;
  min-height: 2.5rem;
  flex-shrink: 0;
  border-radius: 50%;
  border: none;
  padding: 0;
  cursor: pointer;
  overflow: hidden;
  background: var(--color-bg-muted);
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
  aspect-ratio: 1;
}
.profile-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text);
}
.profile-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.profile-avatar-initials {
  font-size: 0.75rem;
  font-weight: 600;
}
.profile-menu {
  position: absolute;
  bottom: calc(100% + 0.5rem);
  left: 0;
  min-width: 12rem;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: 0.5rem 0;
  z-index: 200;
  text-align: left;
}
.profile-menu-header {
  padding: 0.5rem 1rem 0.75rem;
  border-bottom: 1px solid var(--color-border);
  margin-bottom: 0.25rem;
}
.profile-menu-name {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text);
}
.profile-menu-item {
  width: 100%;
  padding: 0.5rem 1rem;
  border: none;
  background: none;
  font-size: var(--text-base);
  color: var(--color-text);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  text-align: left;
  transition: background 0.15s;
}
.profile-menu-item .bi {
  font-size: 1.1rem;
  opacity: 0.85;
}
.profile-menu-item:hover:not(:disabled) {
  background: var(--color-bg-hover);
}
.profile-menu-item:disabled {
  opacity: 0.6;
  cursor: default;
}
.profile-menu-item-logout {
  margin-top: 0.25rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--color-border);
  color: var(--color-text-muted);
}
.profile-menu-item-logout:hover {
  color: var(--color-text);
}
.profile-menu-section {
  padding: 0.5rem 1rem;
}
.profile-menu-label {
  display: block;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--color-text-subtle);
  margin-bottom: 0.35rem;
}
.profile-menu-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.profile-pill {
  padding: 0.3rem 0.6rem;
  font-size: 0.8rem;
  font-weight: 500;
  border: none;
  border-radius: var(--radius-full);
  background: var(--color-bg-muted);
  color: var(--color-text-muted);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  transition: background 0.15s, color 0.15s;
}
.profile-pill:hover {
  background: var(--color-bg-hover);
  color: var(--color-text);
}
.profile-pill.active {
  background: var(--color-accent);
  color: white;
}
.profile-menu-enter-active,
.profile-menu-leave-active {
  transition: opacity 0.15s, transform 0.15s;
}
.profile-menu-enter-from,
.profile-menu-leave-to {
  opacity: 0;
  transform: translateY(4px);
}

.main {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 0.875rem 1.25rem;
  min-height: 3.5rem;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-elevated);
}
.page-title {
  font-size: var(--text-xl);
  font-weight: 600;
  color: var(--color-text);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.content {
  flex: 1;
  min-height: 0;
  padding: 1.25rem;
  overflow: auto;
}

/* Mobile: drawer overlay */
@media (max-width: 768px) {
  .menu-toggle {
    display: flex;
  }
  .header {
    padding-left: 4.5rem;
  }
  .sidebar-backdrop {
    display: block;
  }
  .sidebar {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    z-index: 101;
    width: 4.5rem;
    transform: translateX(-100%);
    transition: transform 0.25s ease;
    box-shadow: var(--shadow-lg);
  }
  .sidebar.open {
    transform: translateX(0);
  }
}
</style>
