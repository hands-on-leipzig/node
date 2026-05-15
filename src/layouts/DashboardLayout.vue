<script setup>
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { getUserProfile, logout, hasAdminRole, isAuthenticated, hasCoachRole, login } from '@/auth/keycloak'
import {
  setLocale,
  showTranslationKeys,
  setShowTranslationKeys,
  translationEditMode,
  setTranslationEditMode,
} from '@/i18n'
import { theme, setTheme } from '@/theme'
import { listTeams, listClasses, listGroups } from '@/services/draht'
import { usePwaInstall } from '@/composables/usePwaInstall'

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const user = computed(() => getUserProfile())
const isCoachApp = computed(() => isAuthenticated() && hasCoachRole())
/** Logged-out (or non-coach) on public venues: minimal sidebar + login */
const isGuestShell = computed(() => route.name === 'venues' && !isCoachApp.value)
const sidebarOpen = ref(false)
const profileMenuOpen = ref(false)
const teams = ref([])
const classes = ref([])
const groups = ref([])
const sidebarLoading = ref(false)

const navItems = computed(() => {
  if (isGuestShell.value) {
    return [{ path: '/', nameKey: 'nav.venues', exact: true, icon: 'bi-geo-alt' }]
  }
  const items = [
    { path: '/dashboard', nameKey: 'nav.dashboard', exact: true, icon: 'bi-grid-1x2-fill' },
    { path: '/', nameKey: 'nav.venues', exact: true, icon: 'bi-geo-alt' },
  ]
  if (hasAdminRole()) {
    items.push({
      path: '/dashboard/admin/documents',
      nameKey: 'nav.adminDocuments',
      exact: true,
      icon: 'bi-folder2-open',
    })
    items.push({
      path: '/dashboard/admin/calendar',
      nameKey: 'nav.adminCalendar',
      exact: true,
      icon: 'bi-calendar3',
    })
    items.push({
      path: '/dashboard/admin/translations',
      nameKey: 'nav.adminTranslations',
      exact: true,
      icon: 'bi-translate',
    })
  }
  return items
})

function doLogin() {
  login()
}

async function loadSidebarLists() {
  if (!isCoachApp.value) {
    teams.value = []
    classes.value = []
    groups.value = []
    return
  }
  sidebarLoading.value = true
  try {
    const [teamsRes, classesRes, groupsRes] = await Promise.allSettled([
      listTeams(),
      listClasses(),
      listGroups(),
    ])
    if (teamsRes.status === 'fulfilled' && teamsRes.value?.data) {
      const d = teamsRes.value.data
      teams.value = Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : [])
    }
    if (classesRes.status === 'fulfilled' && classesRes.value?.data) {
      const d = classesRes.value.data
      classes.value = Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : [])
    }
    if (groupsRes.status === 'fulfilled' && groupsRes.value?.data) {
      const d = groupsRes.value.data
      groups.value = Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : [])
    }
  } finally {
    sidebarLoading.value = false
  }
}

function teamPrimaryLabel(team) {
  return team.name || t('dashboard.team')
}
function teamSecondaryLabel(team) {
  if (team.ref) return String(team.ref)
  return team.id != null ? '#' + team.id : ''
}
function classPrimaryLabel(cls) {
  return cls.name || t('dashboard.class')
}
function classSecondaryLabel(cls) {
  if (cls.ref) return String(cls.ref)
  return cls.id != null ? '#' + cls.id : ''
}
function groupPrimaryLabel(group) {
  return group.name || t('dashboard.editionFuture')
}
function groupSecondaryLabel(group) {
  if (group.ref) return String(group.ref)
  return group.id != null ? '#' + group.id : ''
}
function goTeam(id) {
  closeSidebar()
  router.push({ name: 'team-detail', params: { id } })
}
function goClass(id) {
  closeSidebar()
  router.push({ name: 'class-detail', params: { id } })
}
function goGroup(id) {
  closeSidebar()
  router.push({ name: 'group-detail', params: { id } })
}
function isTeamActive(id) {
  return route.name === 'team-detail' && route.params.id === String(id)
}
function isClassActive(id) {
  return route.name === 'class-detail' && route.params.id === String(id)
}
function isGroupActive(id) {
  return route.name === 'group-detail' && route.params.id === String(id)
}

function isActive(item) {
  if (item.exact) return route.path === item.path
  return route.path.startsWith(item.path)
}

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

function pushBackTrapState() {
  if (typeof window === 'undefined') return
  if (!route.path.startsWith('/dashboard')) return
  window.history.pushState({ hotBackTrap: true }, '', window.location.href)
}

function handleBrowserBack() {
  if (typeof window === 'undefined') return
  if (!route.path.startsWith('/dashboard')) return

  const backEvent = new CustomEvent('hot-browser-back', { detail: { handled: false } })
  window.dispatchEvent(backEvent)
  if (backEvent.detail?.handled) {
    pushBackTrapState()
    return
  }

  if (route.name !== 'dashboard') {
    router.replace({ name: 'dashboard' }).finally(() => {
      pushBackTrapState()
    })
    return
  }

  pushBackTrapState()
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  window.addEventListener('popstate', handleBrowserBack)
  pushBackTrapState()
  loadSidebarLists()
})
onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  window.removeEventListener('popstate', handleBrowserBack)
})
watch(
  () => route.path,
  (path) => {
    if (path === '/dashboard' || path === '/dashboard/' || path === '/' || path === '') {
      loadSidebarLists()
    }
    pushBackTrapState()
  }
)
watch(isCoachApp, (coach) => {
  if (coach) loadSidebarLists()
})

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

function goSettings() {
  closeProfileMenu()
  router.push({ name: 'settings' })
}

const userInitials = computed(() => {
  const name = user.value?.name
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
})

const hasFoundersEnrollments = computed(() => teams.value.length > 0 || classes.value.length > 0)
const hasFutureEnrollments = computed(() => groups.value.length > 0)
const { canInstall, promptInstall } = usePwaInstall()
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
      <RouterLink :to="isCoachApp ? '/dashboard' : '/'" class="sidebar-brand" @click="closeSidebar">
        <img src="@/assets/hot.png" alt="HANDS on TECHNOLOGY" class="sidebar-brand-logo" />
      </RouterLink>
      <nav class="sidebar-nav">
        <RouterLink
          v-for="item in navItems"
          :key="item.nameKey"
          :to="item.path"
          class="nav-link sidebar-item"
          :class="{ active: isActive(item) }"
          @click="closeSidebar"
        >
          <span class="sidebar-item-icon">
            <i class="bi" :class="item.icon" aria-hidden="true"></i>
          </span>
          <span class="sidebar-item-label"><I18nText :k="item.nameKey" /></span>
        </RouterLink>
        <template v-if="isCoachApp">
          <div v-if="sidebarLoading" class="sidebar-list-loading">
            <i class="bi bi-arrow-repeat spin"></i>
          </div>
          <template v-else>
            <p v-if="hasFoundersEnrollments" class="sidebar-section-title">
              <I18nText k="nav.sidebarSectionFounders" />
            </p>
            <button
              v-for="team in teams"
              :key="'team-' + team.id"
              type="button"
              class="sidebar-item sidebar-entry"
              :class="{ active: isTeamActive(team.id) }"
              :title="t('nav.sidebarOpenTeam', { name: teamPrimaryLabel(team) })"
              :aria-label="t('nav.sidebarOpenTeam', { name: teamPrimaryLabel(team) })"
              @click="goTeam(team.id)"
            >
              <span class="sidebar-item-icon">
                <i class="bi bi-person-fill" aria-hidden="true"></i>
              </span>
              <span class="sidebar-item-text">
                <span class="sidebar-item-label">{{ teamPrimaryLabel(team) }}</span>
                <span v-if="teamSecondaryLabel(team)" class="sidebar-item-sublabel">{{ teamSecondaryLabel(team) }}</span>
              </span>
            </button>
            <button
              v-for="cls in classes"
              :key="'class-' + cls.id"
              type="button"
              class="sidebar-item sidebar-entry"
              :class="{ active: isClassActive(cls.id) }"
              :title="t('nav.sidebarOpenClass', { name: classPrimaryLabel(cls) })"
              :aria-label="t('nav.sidebarOpenClass', { name: classPrimaryLabel(cls) })"
              @click="goClass(cls.id)"
            >
              <span class="sidebar-item-icon">
                <i class="bi bi-mortarboard-fill" aria-hidden="true"></i>
              </span>
              <span class="sidebar-item-text">
                <span class="sidebar-item-label">{{ classPrimaryLabel(cls) }}</span>
                <span v-if="classSecondaryLabel(cls)" class="sidebar-item-sublabel">{{ classSecondaryLabel(cls) }}</span>
              </span>
            </button>
            <p
              v-if="hasFutureEnrollments"
              class="sidebar-section-title"
              :class="{ 'sidebar-section-title--after-founders': hasFoundersEnrollments }"
            >
              <I18nText k="nav.sidebarSectionFuture" />
            </p>
            <button
              v-for="group in groups"
              :key="'group-' + group.id"
              type="button"
              class="sidebar-item sidebar-entry"
              :class="{ active: isGroupActive(group.id) }"
              :title="t('nav.sidebarOpenGroup', { name: groupPrimaryLabel(group) })"
              :aria-label="t('nav.sidebarOpenGroup', { name: groupPrimaryLabel(group) })"
              @click="goGroup(group.id)"
            >
              <span class="sidebar-item-icon">
                <i class="bi bi-stars" aria-hidden="true"></i>
              </span>
              <span class="sidebar-item-text">
                <span class="sidebar-item-label">{{ groupPrimaryLabel(group) }}</span>
                <span v-if="groupSecondaryLabel(group)" class="sidebar-item-sublabel">{{ groupSecondaryLabel(group) }}</span>
              </span>
            </button>
          </template>
        </template>
      </nav>
      <div v-if="isGuestShell" class="sidebar-bottom sidebar-bottom-guest">
        <div class="sidebar-guest-tools">
          <button
            type="button"
            class="profile-pill"
            :class="{ active: theme === 'light' }"
            :title="t('common.light')"
            @click="setTheme('light')"
          >
            <i class="bi bi-sun-fill"></i>
          </button>
          <button
            type="button"
            class="profile-pill"
            :class="{ active: theme === 'dark' }"
            :title="t('common.dark')"
            @click="setTheme('dark')"
          >
            <i class="bi bi-moon-fill"></i>
          </button>
          <button type="button" class="profile-pill" :class="{ active: locale === 'de' }" @click="switchToDe">DE</button>
          <button type="button" class="profile-pill" :class="{ active: locale === 'en' }" @click="switchToEn">EN</button>
        </div>
        <button
          v-if="!isAuthenticated()"
          type="button"
          class="sidebar-login-btn sidebar-item"
          @click="doLogin(); closeSidebar()"
        >
          <span class="sidebar-item-icon"><i class="bi bi-box-arrow-in-right" aria-hidden="true"></i></span>
          <span class="sidebar-item-label"><I18nText k="nav.login" /></span>
        </button>
        <button
          v-else
          type="button"
          class="sidebar-login-btn sidebar-item"
          @click="doLogout(); closeSidebar()"
        >
          <span class="sidebar-item-icon"><i class="bi bi-box-arrow-right" aria-hidden="true"></i></span>
          <span class="sidebar-item-label"><I18nText k="auth.logout" /></span>
        </button>
      </div>
      <div v-else class="sidebar-bottom">
        <div class="sidebar-profile-wrap">
          <button
            type="button"
            class="profile-trigger sidebar-item"
            aria-haspopup="true"
            :aria-expanded="profileMenuOpen"
            @click="openProfileMenu"
          >
            <span class="profile-avatar">
              <img
                v-if="user?.picture"
                :src="user.picture"
                alt=""
                class="profile-avatar-img"
              />
              <span v-else class="profile-avatar-initials">{{ userInitials }}</span>
            </span>
            <span class="sidebar-item-label profile-sidebar-name">
              <template v-if="user?.name">{{ user.name }}</template>
              <I18nText v-else k="common.coach" />
            </span>
          </button>
          <Transition name="profile-menu">
            <div v-if="profileMenuOpen" class="profile-menu" role="menu">
              <div class="profile-menu-header">
                <span class="profile-menu-name">
                  <template v-if="user?.name">{{ user.name }}</template>
                  <I18nText v-else k="common.coach" />
                </span>
              </div>
              <button type="button" class="profile-menu-item" role="menuitem" @click="goSettings">
                <i class="bi bi-gear"></i>
                <span><I18nText k="common.settings" /></span>
              </button>
              <button type="button" class="profile-menu-item" role="menuitem" disabled>
                <i class="bi bi-question-circle"></i>
                <span><I18nText k="common.help" /></span>
              </button>
              <div class="profile-menu-section">
                <span class="profile-menu-label"><I18nText k="common.language" /></span>
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
                  <button
                    type="button"
                    class="profile-pill"
                    :class="{ active: showTranslationKeys }"
                    @click="setShowTranslationKeys(!showTranslationKeys)"
                    :title="t('common.showTranslationKeys')"
                  >
                    <i class="bi" :class="showTranslationKeys ? 'bi-code-slash' : 'bi-translate'"></i>
                    Keys
                  </button>
                  <button
                    v-if="hasAdminRole()"
                    type="button"
                    class="profile-pill"
                    :class="{ active: translationEditMode }"
                    @click="setTranslationEditMode(!translationEditMode)"
                    :title="t('common.translationEditMode')"
                  >
                    <i class="bi bi-pencil-square"></i>
                    Edit
                  </button>
                </div>
              </div>
              <div class="profile-menu-section">
                <span class="profile-menu-label"><I18nText k="common.theme" /></span>
                <div class="profile-menu-btns">
                  <button
                    type="button"
                    class="profile-pill"
                    :class="{ active: theme === 'light' }"
                    @click="setTheme('light')"
                  >
                    <i class="bi bi-sun-fill"></i>
                    <I18nText k="common.light" />
                  </button>
                  <button
                    type="button"
                    class="profile-pill"
                    :class="{ active: theme === 'dark' }"
                    @click="setTheme('dark')"
                  >
                    <i class="bi bi-moon-fill"></i>
                    <I18nText k="common.dark" />
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
                <span><I18nText k="nav.logOut" /></span>
              </button>
            </div>
          </Transition>
        </div>
      </div>
    </aside>
    <main class="main">
      <div class="content" :key="'content-' + showTranslationKeys + '-' + translationEditMode">
        <div class="content-actions">
          <button
            v-if="canInstall"
            type="button"
            class="header-install-btn"
            @click="promptInstall"
            title="Install app"
            aria-label="Install app"
          >
            <i class="bi bi-phone"></i>
            <span>Install App</span>
          </button>
        </div>
        <RouterView />
      </div>
    </main>
  </div>
</template>

<style scoped>
.dashboard-layout {
  display: flex;
  min-height: 100dvh;
  height: 100dvh;
  overflow: hidden;
  background: transparent;
  position: relative;
  gap: 1rem;
  padding: 0.85rem 1rem 1rem;
  box-sizing: border-box;
}
.menu-toggle {
  display: none;
  position: fixed;
  top: max(0.75rem, env(safe-area-inset-top, 0px));
  left: max(0.75rem, env(safe-area-inset-left, 0px));
  z-index: 102;
  width: var(--touch-lg);
  height: var(--touch-lg);
  padding: 0;
  border: 1px solid var(--liquid-border);
  border-radius: var(--radius-lg);
  background: var(--liquid-tile-bg);
  backdrop-filter: blur(var(--liquid-blur)) saturate(var(--liquid-saturate));
  -webkit-backdrop-filter: blur(var(--liquid-blur)) saturate(var(--liquid-saturate));
  color: var(--color-text);
  cursor: pointer;
  align-items: center;
  justify-content: center;
  font-size: 1.35rem;
  box-shadow: var(--liquid-shadow);
}
.sidebar-backdrop {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.sidebar {
  --sidebar-width: 16.75rem;
  width: var(--sidebar-width);
  align-self: stretch;
  min-height: 0;
  flex-shrink: 0;
  background: var(--liquid-tile-bg);
  backdrop-filter: blur(var(--liquid-blur)) saturate(var(--liquid-saturate));
  -webkit-backdrop-filter: blur(var(--liquid-blur)) saturate(var(--liquid-saturate));
  border: 1px solid var(--liquid-border);
  border-radius: var(--radius-xl);
  box-shadow: var(--liquid-shadow);
  padding: 1rem 0;
  display: flex;
  flex-direction: column;
  overflow-x: hidden;
  overflow-y: auto;
}
.sidebar-brand {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 0.75rem;
  padding: 0.25rem 0.2rem 0.85rem;
  border-bottom: 1px solid var(--color-border);
  text-decoration: none;
}
.sidebar-brand-logo {
  height: 4.5rem;
  width: auto;
  max-width: 100%;
  object-fit: contain;
  display: block;
}

/* Icon + label row; full-width click target */
.sidebar-item {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 0.6rem;
  width: calc(100% - 1rem);
  max-width: 100%;
  box-sizing: border-box;
  min-height: 2.75rem;
  margin: 0 0.5rem;
  padding: 0.35rem 0.5rem;
  border-radius: var(--radius);
  border: 1px solid transparent;
  transition: background 0.15s, border-color 0.15s;
}
.sidebar-item-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 2.25rem;
  min-width: 2.25rem;
}
.sidebar-item:hover .sidebar-item-icon .bi {
  opacity: 1;
}
.sidebar-item-label {
  flex: 1;
  min-width: 0;
  text-align: left;
  font-size: var(--text-sm);
  font-weight: 600;
  line-height: 1.25;
  color: inherit;
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}
.nav-link .sidebar-item-label {
  font-weight: 600;
}
.sidebar-item-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.1rem;
  text-align: left;
}
.sidebar-item-sublabel {
  font-size: 0.7rem;
  font-weight: 500;
  color: var(--color-text-subtle);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  margin-top: 0.85rem;
}
.sidebar-nav-top-spacer {
  flex-shrink: 0;
  min-height: 1.35rem;
  width: 100%;
}
.sidebar-section-title {
  margin: 0.65rem 0.5rem 0.15rem;
  padding: 0 0.5rem;
  border: 0;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-text-subtle);
  line-height: 1.3;
}
.sidebar-section-title--after-founders {
  margin-top: 0.95rem;
}
.nav-link {
  padding: 0;
  min-height: 2.75rem;
  font-size: var(--text-base);
  color: var(--color-text-muted);
  text-decoration: none;
  align-self: stretch;
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
  font-family: inherit;
  color: var(--color-text-muted);
  background: transparent;
  border: 1px solid transparent;
  text-align: left;
  align-self: stretch;
}
.sidebar-entry .bi {
  font-size: 1.25rem;
  opacity: 0.9;
}
.sidebar-entry:hover {
  background: var(--color-bg-hover);
  color: var(--color-text);
  border-color: var(--color-border);
}
.sidebar-entry:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.sidebar-entry.active {
  background: var(--color-accent-soft);
  color: var(--color-accent);
  border-color: var(--color-border);
}
.sidebar-entry.active .bi {
  opacity: 1;
}
.sidebar-entry.active .sidebar-item-sublabel {
  color: inherit;
  opacity: 0.85;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

.sidebar-bottom-guest {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}
.sidebar-guest-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  justify-content: flex-start;
}
.sidebar-login-btn {
  width: calc(100% - 1rem);
  max-width: 100%;
  margin: 0 0.5rem;
  justify-content: flex-start;
  border: 1px solid var(--color-border);
  background: var(--color-accent-soft);
  color: var(--color-accent);
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  font-size: var(--text-sm);
  border-radius: var(--radius);
  padding: 0.55rem 0.65rem;
  min-height: var(--touch);
}
.sidebar-login-btn:hover {
  background: var(--color-bg-hover);
  border-color: var(--color-accent);
}
.sidebar-login-btn .sidebar-item-icon .bi {
  font-size: 1.2rem;
}

.sidebar-bottom {
  padding: 0.5rem 0.75rem 0;
  border-top: 1px solid var(--color-border);
  margin-top: auto;
  background: var(--liquid-bg-subtle);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}
.sidebar-profile-wrap {
  position: relative;
}
.profile-trigger {
  border: 1px solid transparent;
  background: transparent;
  cursor: pointer;
  font: inherit;
  color: var(--color-text-muted);
  text-align: left;
}
.profile-trigger:hover {
  background: var(--color-bg-hover);
  color: var(--color-text);
  border-color: var(--color-border);
}
.profile-avatar {
  width: 2.5rem;
  height: 2.5rem;
  min-width: 2.5rem;
  min-height: 2.5rem;
  flex-shrink: 0;
  border-radius: 50%;
  overflow: hidden;
  background: var(--color-bg-muted);
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
  aspect-ratio: 1;
}
.profile-trigger:hover .profile-avatar {
  background: var(--color-bg-hover);
  color: var(--color-text);
}
.profile-sidebar-name {
  font-weight: 600;
  -webkit-line-clamp: 2;
  line-clamp: 2;
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
  background: var(--liquid-popover-fill);
  backdrop-filter: blur(var(--liquid-popover-blur)) saturate(var(--liquid-popover-saturate));
  -webkit-backdrop-filter: blur(var(--liquid-popover-blur)) saturate(var(--liquid-popover-saturate));
  border: 1px solid var(--liquid-border);
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
  align-self: stretch;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: var(--radius-xl);
  border: 1px solid var(--liquid-border);
  background: var(--liquid-tile-bg-strong);
  backdrop-filter: blur(var(--liquid-blur)) saturate(var(--liquid-saturate));
  -webkit-backdrop-filter: blur(var(--liquid-blur)) saturate(var(--liquid-saturate));
  box-shadow: var(--liquid-shadow);
}
.content-actions {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  justify-content: flex-end;
  width: 100%;
  margin-bottom: 0.75rem;
}
.header-install-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-height: var(--touch);
  padding: 0.45rem 0.8rem;
  border-radius: var(--radius-full);
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  color: var(--color-text);
  font-weight: 600;
  font-size: var(--text-sm);
  cursor: pointer;
}
.header-install-btn:hover {
  background: var(--color-bg-hover);
}
.content {
  flex: 1;
  min-height: 0;
  padding: 1.25rem;
  overflow: auto;
  padding-bottom: max(1.25rem, env(safe-area-inset-bottom, 0px));
  border-radius: calc(var(--radius-xl) - 3px);
}

/* Mobile: drawer overlay */
@media (max-width: 768px) {
  .dashboard-layout {
    gap: 0;
    padding: 0.5rem 0.65rem 0.65rem;
  }
  .menu-toggle {
    display: flex;
  }
  .header-install-btn {
    padding: 0.45rem 0.65rem;
  }
  .header-install-btn span {
    display: none;
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
    width: min(var(--sidebar-width), 86vw);
    height: 100dvh;
    max-height: none;
    transform: translateX(-100%);
    transition: transform 0.25s ease;
    box-shadow: var(--shadow-lg);
    border-radius: 0 var(--radius-xl) var(--radius-xl) 0;
    border-left: none;
  }
  .sidebar.open {
    transform: translateX(0);
  }
  .sidebar-brand {
    padding-top: max(0.55rem, env(safe-area-inset-top, 0px));
  }
  .sidebar-brand-logo {
    height: 2.85rem;
  }
  .content {
    padding: 1rem;
    padding-left: max(1rem, env(safe-area-inset-left, 0px));
    padding-right: max(1rem, env(safe-area-inset-right, 0px));
  }
}

@media (max-width: 420px) {
  .sidebar-brand-logo {
    height: 2.45rem;
  }
}
</style>
