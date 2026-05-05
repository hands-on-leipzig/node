<script setup>
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { getUserProfile, logout, hasAdminRole } from '@/auth/keycloak'
import {
  setLocale,
  showTranslationKeys,
  setShowTranslationKeys,
  translationEditMode,
  setTranslationEditMode,
} from '@/i18n'
import { theme, setTheme } from '@/theme'
import { listTeams, listClasses, listGroups } from '@/services/draht'

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const user = computed(() => getUserProfile())
const sidebarOpen = ref(false)
const profileMenuOpen = ref(false)
const teams = ref([])
const classes = ref([])
const groups = ref([])
const sidebarLoading = ref(false)

const navItems = computed(() => {
  const items = [{ path: '/dashboard', nameKey: 'nav.dashboard', exact: true, icon: 'bi-grid-1x2-fill' }]
  if (hasAdminRole()) {
    items.push({
      path: '/dashboard/admin/documents',
      nameKey: 'nav.adminDocuments',
      exact: true,
      icon: 'bi-folder2-open',
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

async function loadSidebarLists() {
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

const hasFoundersEnrollments = computed(() => teams.value.length > 0 || classes.value.length > 0)
const hasFutureEnrollments = computed(() => groups.value.length > 0)
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
            <i class="bi" :class="item.icon" aria-hidden="true"></i>
          </span>
          <span class="sidebar-item-label"><I18nText :k="item.nameKey" /></span>
        </RouterLink>
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
      </nav>
      <div class="sidebar-bottom">
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
              <button type="button" class="profile-menu-item" role="menuitem" disabled>
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
      <header class="header">
        <RouterLink to="/dashboard" class="header-brand" @click="closeSidebar">
          <span class="header-logo-wrap">
            <img src="@/assets/hot.png" alt="HANDS on TECHNOLOGY" class="header-logo" />
          </span>
          <span class="header-app-name"><I18nText k="common.appName" /></span>
        </RouterLink>
      </header>
      <div class="content" :key="'content-' + showTranslationKeys + '-' + translationEditMode">
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
  --sidebar-width: 16.75rem;
  width: var(--sidebar-width);
  height: 100vh;
  flex-shrink: 0;
  background: var(--color-sidebar);
  border-right: 1px solid var(--color-sidebar-border);
  padding: 1rem 0;
  display: flex;
  flex-direction: column;
  overflow-x: hidden;
  overflow-y: auto;
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

.sidebar-bottom {
  padding: 0.5rem 0.75rem 0;
  border-top: 1px solid var(--color-border);
  margin-top: auto;
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
.header-brand {
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
  text-decoration: none;
  color: var(--color-text);
  min-width: 0;
  border-radius: var(--radius);
  padding: 0.15rem 0.35rem 0.15rem 0.15rem;
  margin: -0.15rem 0 -0.15rem -0.15rem;
  transition: background 0.15s;
}
.header-brand:hover {
  background: var(--color-bg-hover);
  color: var(--color-text);
}
.header-brand:hover .header-logo-wrap {
  border-color: var(--color-accent);
  box-shadow: 0 2px 10px rgba(37, 99, 235, 0.12);
}
.header-logo-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.2rem 0.45rem;
  border-radius: var(--radius-lg);
  background: linear-gradient(160deg, var(--color-bg-muted) 0%, var(--color-bg-elevated) 100%);
  border: 1px solid var(--color-border);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.35),
    0 1px 2px rgba(0, 0, 0, 0.06);
  flex-shrink: 0;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.header-logo {
  height: 2.35rem;
  width: auto;
  max-height: 2.75rem;
  display: block;
  object-fit: contain;
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.06));
}
.header-app-name {
  font-size: var(--text-lg);
  font-weight: 600;
  letter-spacing: -0.02em;
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
    width: min(var(--sidebar-width), 92vw);
    transform: translateX(-100%);
    transition: transform 0.25s ease;
    box-shadow: var(--shadow-lg);
  }
  .sidebar.open {
    transform: translateX(0);
  }
}
</style>
