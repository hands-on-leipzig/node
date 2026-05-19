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
import { listTeams, listClasses, listGroups, parseNodeListPayload, isFutureEnrollmentEntry } from '@/services/draht'
import { resolveSidebarAccentTone } from '@/utils/enrollmentDisplay'
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
const sidebarGroupsError = ref('')

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
  sidebarGroupsError.value = ''
  try {
    const [teamsRes, classesRes, groupsRes] = await Promise.allSettled([
      listTeams(),
      listClasses(),
      listGroups(),
    ])
    teams.value = teamsRes.status === 'fulfilled' ? parseNodeListPayload(teamsRes.value) : []
    classes.value = classesRes.status === 'fulfilled' ? parseNodeListPayload(classesRes.value) : []
    if (groupsRes.status === 'fulfilled') {
      groups.value = parseNodeListPayload(groupsRes.value)
    } else {
      groups.value = []
      const err = groupsRes.reason
      sidebarGroupsError.value =
        err?.response?.data?.error?.message
        || err?.response?.data?.message
        || err?.message
        || t('nav.sidebarGroupsLoadFailed')
      console.warn('[sidebar] listGroups failed', err)
    }
    if (foundersTeams.value.length > 0 || classes.value.length > 0) {
      foundersSectionOpen.value = true
    }
    if (groups.value.length > 0 || futureTeams.value.length > 0) {
      futureSectionOpen.value = true
    }
    if (import.meta.env.DEV) {
      console.info('[sidebar] loaded', {
        teams: teams.value.length,
        classes: classes.value.length,
        groups: groups.value.length,
      })
    }
  } finally {
    sidebarLoading.value = false
  }
}

/** @param {'team'|'class'|'group'} kind */
function sidebarTeklaBoldLabel(item, kind) {
  if (kind === 'class') return t('dashboard.class')
  if (kind === 'group') return t('dashboard.coCoachTypeGroup')
  return String(item?.name ?? '').trim() || t('dashboard.team')
}

function sidebarTeklaRefLabel(item) {
  if (item?.ref) return String(item.ref)
  return item?.id != null ? `#${item.id}` : ''
}

function sidebarTeklaAccent(item) {
  return resolveSidebarAccentTone(item)
}

function sidebarTeklaAriaLabel(item, kind) {
  const bold = sidebarTeklaBoldLabel(item, kind)
  const ref = sidebarTeklaRefLabel(item)
  if (kind === 'team') return t('nav.sidebarOpenTeam', { name: bold })
  if (kind === 'class') return t('nav.sidebarOpenClass', { name: bold })
  return t('nav.sidebarOpenGroup', { name: bold })
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
watch(
  isCoachApp,
  (coach) => {
    if (coach) void loadSidebarLists()
    else {
      teams.value = []
      classes.value = []
      groups.value = []
    }
  },
  { immediate: true },
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

function goSettings() {
  closeProfileMenu()
  router.push({ name: 'settings' })
}

const foundersTeams = computed(() => teams.value.filter((t) => !isFutureEnrollmentEntry(t)))
const futureTeams = computed(() => teams.value.filter((t) => isFutureEnrollmentEntry(t)))
const hasFoundersEnrollments = computed(() => foundersTeams.value.length > 0 || classes.value.length > 0)
const hasFutureEnrollments = computed(() => groups.value.length > 0 || futureTeams.value.length > 0)

const SIDEBAR_SECTIONS_STORAGE_KEY = 'handson.sidebarSections'

function readSidebarSectionOpen(section, defaultOpen = true) {
  try {
    const raw = localStorage.getItem(SIDEBAR_SECTIONS_STORAGE_KEY)
    if (!raw) return defaultOpen
    const parsed = JSON.parse(raw)
    return typeof parsed?.[section] === 'boolean' ? parsed[section] : defaultOpen
  } catch {
    return defaultOpen
  }
}

function persistSidebarSections() {
  try {
    localStorage.setItem(
      SIDEBAR_SECTIONS_STORAGE_KEY,
      JSON.stringify({
        founders: foundersSectionOpen.value,
        future: futureSectionOpen.value,
      }),
    )
  } catch {
    /* ignore quota / private mode */
  }
}

const foundersSectionOpen = ref(readSidebarSectionOpen('founders', true))
const futureSectionOpen = ref(readSidebarSectionOpen('future', true))

function toggleFoundersSection() {
  foundersSectionOpen.value = !foundersSectionOpen.value
  persistSidebarSections()
}

function toggleFutureSection() {
  futureSectionOpen.value = !futureSectionOpen.value
  persistSidebarSections()
}

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
        <img src="/JOIN_v1.0.png" alt="JOIN" class="sidebar-brand-logo sidebar-brand-logo--join" />
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
            <button
              v-if="hasFoundersEnrollments"
              type="button"
              class="sidebar-section-toggle"
                :aria-expanded="foundersSectionOpen"
                :aria-controls="'sidebar-section-founders'"
                @click="toggleFoundersSection"
              >
                <i class="bi sidebar-section-toggle-icon" :class="foundersSectionOpen ? 'bi-dash-lg' : 'bi-plus-lg'" aria-hidden="true"></i>
                <span class="sidebar-section-toggle-label"><I18nText k="nav.sidebarSectionFounders" /></span>
              </button>
            <div
              v-show="!hasFoundersEnrollments || foundersSectionOpen"
              id="sidebar-section-founders"
              class="sidebar-section-entries"
            >
                <button
                  v-for="team in foundersTeams"
                  :key="'team-' + team.id"
                  type="button"
                  class="sidebar-tekla-tile"
                  :class="[
                    { active: isTeamActive(team.id) },
                    `sidebar-tekla-tile--${sidebarTeklaAccent(team)}`,
                  ]"
                  :title="sidebarTeklaAriaLabel(team, 'team')"
                  :aria-label="sidebarTeklaAriaLabel(team, 'team')"
                  @click="goTeam(team.id)"
                >
                  <span class="sidebar-tekla-tile-text">
                    <span class="sidebar-tekla-tile-title">{{ sidebarTeklaBoldLabel(team, 'team') }}</span>
                    <span v-if="sidebarTeklaRefLabel(team)" class="sidebar-tekla-tile-ref">{{ sidebarTeklaRefLabel(team) }}</span>
                  </span>
                </button>
                <button
                  v-for="cls in classes"
                  :key="'class-' + cls.id"
                  type="button"
                  class="sidebar-tekla-tile"
                  :class="[
                    { active: isClassActive(cls.id) },
                    `sidebar-tekla-tile--${sidebarTeklaAccent(cls)}`,
                  ]"
                  :title="sidebarTeklaAriaLabel(cls, 'class')"
                  :aria-label="sidebarTeklaAriaLabel(cls, 'class')"
                  @click="goClass(cls.id)"
                >
                  <span class="sidebar-tekla-tile-text">
                    <span class="sidebar-tekla-tile-title">{{ sidebarTeklaBoldLabel(cls, 'class') }}</span>
                    <span v-if="sidebarTeklaRefLabel(cls)" class="sidebar-tekla-tile-ref">{{ sidebarTeklaRefLabel(cls) }}</span>
                  </span>
                </button>
            </div>
            <p v-if="sidebarGroupsError" class="sidebar-section-hint sidebar-section-hint--error">
              <i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i>
              {{ sidebarGroupsError }}
            </p>
            <template v-if="hasFutureEnrollments">
              <button
                type="button"
                class="sidebar-section-toggle"
                :class="{ 'sidebar-section-toggle--after-founders': hasFoundersEnrollments }"
                :aria-expanded="futureSectionOpen"
                :aria-controls="'sidebar-section-future'"
                @click="toggleFutureSection"
              >
                <i class="bi sidebar-section-toggle-icon" :class="futureSectionOpen ? 'bi-dash-lg' : 'bi-plus-lg'" aria-hidden="true"></i>
                <span class="sidebar-section-toggle-label"><I18nText k="nav.sidebarSectionFuture" /></span>
              </button>
              <div v-show="futureSectionOpen" id="sidebar-section-future" class="sidebar-section-entries">
                <button
                  v-for="group in groups"
                  :key="'group-' + group.id"
                  type="button"
                  class="sidebar-tekla-tile"
                  :class="[
                    { active: isGroupActive(group.id) },
                    `sidebar-tekla-tile--${sidebarTeklaAccent(group)}`,
                  ]"
                  :title="sidebarTeklaAriaLabel(group, 'group')"
                  :aria-label="sidebarTeklaAriaLabel(group, 'group')"
                  @click="goGroup(group.id)"
                >
                  <span class="sidebar-tekla-tile-text">
                    <span class="sidebar-tekla-tile-title">{{ sidebarTeklaBoldLabel(group, 'group') }}</span>
                    <span v-if="sidebarTeklaRefLabel(group)" class="sidebar-tekla-tile-ref">{{ sidebarTeklaRefLabel(group) }}</span>
                  </span>
                </button>
                <button
                  v-for="team in futureTeams"
                  :key="'future-team-' + team.id"
                  type="button"
                  class="sidebar-tekla-tile"
                  :class="[
                    { active: isTeamActive(team.id) },
                    `sidebar-tekla-tile--${sidebarTeklaAccent(team)}`,
                  ]"
                  :title="sidebarTeklaAriaLabel(team, 'team')"
                  :aria-label="sidebarTeklaAriaLabel(team, 'team')"
                  @click="goTeam(team.id)"
                >
                  <span class="sidebar-tekla-tile-text">
                    <span class="sidebar-tekla-tile-title">{{ sidebarTeklaBoldLabel(team, 'team') }}</span>
                    <span v-if="sidebarTeklaRefLabel(team)" class="sidebar-tekla-tile-ref">{{ sidebarTeklaRefLabel(team) }}</span>
                  </span>
                </button>
              </div>
            </template>
          </template>
        </template>
      </nav>
      <div class="sidebar-partner">
        <img
          src="/FIRSTLego_IconVert_RGB.png"
          alt="FIRST LEGO League"
          class="sidebar-partner-logo sidebar-partner-logo--fll"
          decoding="async"
        >
        <a
          href="https://www.hands-on-technology.org"
          target="_blank"
          rel="noopener noreferrer"
          class="sidebar-partner-link"
        >
          <img src="@/assets/hot.png" alt="HANDS on TECHNOLOGY" class="sidebar-partner-logo sidebar-partner-logo--hot" />
        </a>
      </div>
      <div class="sidebar-bottom" :class="{ 'sidebar-bottom--guest': isGuestShell }">
        <button
          v-if="isGuestShell && !isAuthenticated()"
          type="button"
          class="sidebar-login-btn sidebar-item"
          @click="doLogin(); closeSidebar()"
        >
          <span class="sidebar-item-icon"><i class="bi bi-box-arrow-in-right" aria-hidden="true"></i></span>
          <span class="sidebar-item-label"><I18nText k="nav.login" /></span>
        </button>
        <button
          v-else-if="isGuestShell"
          type="button"
          class="sidebar-login-btn sidebar-item"
          @click="doLogout(); closeSidebar()"
        >
          <span class="sidebar-item-icon"><i class="bi bi-box-arrow-right" aria-hidden="true"></i></span>
          <span class="sidebar-item-label"><I18nText k="auth.logout" /></span>
        </button>
        <div v-else class="sidebar-profile-wrap">
          <button
            type="button"
            class="profile-trigger sidebar-item"
            aria-haspopup="true"
            :aria-expanded="profileMenuOpen"
            :aria-label="t('common.settings')"
            @click="openProfileMenu"
          >
            <span class="sidebar-item-icon profile-settings-icon" aria-hidden="true">
              <i class="bi bi-gear-fill" />
            </span>
            <span class="sidebar-item-label">
              <I18nText k="common.settings" />
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
              <div class="profile-menu-prefs">
                <div class="profile-menu-prefs-block">
                  <span class="profile-menu-label"><I18nText k="common.theme" /></span>
                  <div class="profile-menu-prefs-row" role="group" :aria-label="t('common.theme')">
                    <button
                      type="button"
                      class="profile-pref-btn"
                      :class="{ active: theme === 'light' }"
                      :aria-pressed="theme === 'light'"
                      @click="setTheme('light')"
                    >
                      <i class="bi bi-sun-fill" aria-hidden="true" />
                      <span><I18nText k="common.light" /></span>
                    </button>
                    <button
                      type="button"
                      class="profile-pref-btn"
                      :class="{ active: theme === 'dark' }"
                      :aria-pressed="theme === 'dark'"
                      @click="setTheme('dark')"
                    >
                      <i class="bi bi-moon-fill" aria-hidden="true" />
                      <span><I18nText k="common.dark" /></span>
                    </button>
                  </div>
                </div>
                <div class="profile-menu-prefs-block">
                  <span class="profile-menu-label"><I18nText k="common.language" /></span>
                  <div class="profile-menu-prefs-row" role="group" :aria-label="t('common.language')">
                    <button
                      type="button"
                      class="profile-pref-btn"
                      :class="{ active: locale === 'de' }"
                      :aria-pressed="locale === 'de'"
                      @click="switchToDe"
                    >
                      DE
                    </button>
                    <button
                      type="button"
                      class="profile-pref-btn"
                      :class="{ active: locale === 'en' }"
                      :aria-pressed="locale === 'en'"
                      @click="switchToEn"
                    >
                      EN
                    </button>
                  </div>
                </div>
              </div>
              <button type="button" class="profile-menu-item" role="menuitem" @click="goSettings">
                <i class="bi bi-person-lines-fill"></i>
                <span><I18nText k="settings.profileTitle" /></span>
              </button>
              <button type="button" class="profile-menu-item" role="menuitem" disabled>
                <i class="bi bi-question-circle"></i>
                <span><I18nText k="common.help" /></span>
              </button>
              <div v-if="hasAdminRole()" class="profile-menu-section">
                <span class="profile-menu-label"><I18nText k="nav.adminTranslations" /></span>
                <div class="profile-menu-btns">
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
  padding: 0.35rem 0 0.85rem;
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
.sidebar-brand-logo--join {
  width: 100%;
  height: auto;
  max-height: 3.25rem;
  object-fit: contain;
  object-position: center;
}
.sidebar-partner {
  margin: 0.75rem 0.5rem 0;
  padding: 0.85rem 0.5rem 0.4rem;
  border-top: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.7rem;
  text-align: center;
}
.sidebar-partner-link {
  display: block;
  width: 100%;
  line-height: 0;
}
.sidebar-partner-logo {
  object-fit: contain;
  object-position: center;
  transition: opacity 0.15s;
}
.sidebar-partner-logo--fll {
  width: auto;
  max-width: 100%;
  max-height: 4.5rem;
  opacity: 0.98;
}
.sidebar-partner-logo--hot {
  width: 100%;
  height: auto;
  max-height: 4.85rem;
  opacity: 0.95;
}
.sidebar-partner-link:hover .sidebar-partner-logo--hot {
  opacity: 1;
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
.sidebar-section-toggle {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  width: calc(100% - 1rem);
  margin: 0.65rem 0.5rem 0.15rem;
  padding: 0.35rem 0.5rem;
  border: 0;
  border-radius: var(--radius);
  background: transparent;
  font-family: inherit;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-text-subtle);
  line-height: 1.3;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.sidebar-section-toggle--after-founders {
  margin-top: 0.95rem;
}
.sidebar-section-toggle:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-muted);
}
.sidebar-section-toggle-icon {
  flex-shrink: 0;
  width: 0.85rem;
  font-size: 0.75rem;
  line-height: 1;
  opacity: 0.85;
}
.sidebar-section-toggle-label {
  flex: 1;
  min-width: 0;
}
.sidebar-section-entries {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.15rem 0.35rem 0.35rem;
}
.sidebar-section-hint {
  margin: 0.35rem 0.5rem 0.5rem;
  padding: 0.45rem 0.55rem;
  font-size: 0.72rem;
  line-height: 1.35;
  color: var(--color-text-muted);
  border-radius: var(--radius);
  background: var(--color-bg-muted);
}
.sidebar-section-hint--error {
  color: #b45309;
  background: rgba(180, 83, 9, 0.1);
}
.sidebar-section-hint .bi {
  margin-right: 0.25rem;
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
.sidebar-tekla-tile {
  display: flex;
  align-items: stretch;
  width: 100%;
  margin: 0;
  padding: 0.55rem 0.65rem 0.55rem 0.7rem;
  border: 1px solid var(--liquid-border);
  border-left-width: 3px;
  border-radius: var(--radius-lg);
  background: var(--liquid-tile-bg-inner);
  box-shadow: var(--shadow-sm), var(--liquid-shadow-inset);
  backdrop-filter: blur(calc(var(--liquid-blur) * 0.35)) saturate(1.05);
  -webkit-backdrop-filter: blur(calc(var(--liquid-blur) * 0.35)) saturate(1.05);
  cursor: pointer;
  font-family: inherit;
  font-size: var(--text-sm);
  color: var(--color-text);
  text-align: left;
  transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}
.sidebar-tekla-tile--challenge {
  border-left-color: #c62828;
}
.sidebar-tekla-tile--explore {
  border-left-color: #2e7d32;
}
.sidebar-tekla-tile--future8 {
  border-left-color: #1565c0;
}
.sidebar-tekla-tile--future5 {
  border-left-color: #e6a800;
}
.sidebar-tekla-tile:hover {
  background: color-mix(in srgb, var(--liquid-tile-bg-inner) 88%, var(--color-bg-hover));
  box-shadow: var(--shadow-md), var(--liquid-shadow-inset);
}
.sidebar-tekla-tile:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.sidebar-tekla-tile.active {
  background: color-mix(in srgb, var(--color-accent-soft) 55%, var(--liquid-tile-bg-inner));
  box-shadow: var(--shadow-md), var(--liquid-shadow-inset);
}
.sidebar-tekla-tile-text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.12rem;
  min-width: 0;
  width: 100%;
}
.sidebar-tekla-tile-title {
  font-weight: 700;
  font-size: var(--text-sm);
  line-height: 1.25;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
.sidebar-tekla-tile-ref {
  font-size: 0.72rem;
  font-weight: 500;
  line-height: 1.2;
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
.sidebar-tekla-tile.active .sidebar-tekla-tile-ref {
  color: color-mix(in srgb, var(--color-text) 72%, var(--color-text-muted));
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

.sidebar-bottom {
  padding: 0.75rem 0.5rem max(0.75rem, env(safe-area-inset-bottom, 0px));
  border-top: 1px solid var(--color-border);
  margin-top: auto;
  background: var(--liquid-bg-subtle);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  flex-shrink: 0;
}
.sidebar-bottom--guest {
  gap: 0.75rem;
}
.profile-settings-icon .bi {
  font-size: 1.2rem;
  opacity: 0.9;
}
.profile-trigger:hover .profile-settings-icon .bi {
  opacity: 1;
  color: var(--color-accent);
}
.profile-menu-prefs {
  padding: 0.35rem 1rem 0.65rem;
  border-bottom: 1px solid var(--color-border);
  margin-bottom: 0.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}
.profile-menu-prefs-block {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.profile-menu-prefs-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.35rem;
}
.profile-pref-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  min-height: 2.25rem;
  padding: 0.4rem 0.5rem;
  border: 1px solid var(--liquid-border);
  border-radius: var(--radius);
  background: var(--liquid-tile-bg-inner);
  font-family: inherit;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}
.profile-pref-btn:hover {
  background: var(--color-bg-hover);
}
.profile-pref-btn.active {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: var(--color-on-accent);
}
.profile-pref-btn .bi {
  font-size: 1rem;
  flex-shrink: 0;
}
.sidebar-login-btn {
  width: 100%;
  max-width: 100%;
  margin: 0;
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

.sidebar-profile-wrap {
  position: relative;
  width: 100%;
  box-sizing: border-box;
}
.profile-trigger {
  width: 100%;
  margin: 0;
  box-sizing: border-box;
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
.profile-menu {
  position: absolute;
  bottom: calc(100% + 0.5rem);
  left: 0;
  right: 0;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
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
  .sidebar-brand-logo--join {
    max-height: 2.75rem;
  }
  .sidebar-partner-logo--fll {
    max-height: 3.75rem;
  }
  .sidebar-partner-logo--hot {
    max-height: 4rem;
  }
  .content {
    padding: 1rem;
    padding-left: max(1rem, env(safe-area-inset-left, 0px));
    padding-right: max(1rem, env(safe-area-inset-right, 0px));
  }
}

@media (max-width: 420px) {
  .sidebar-brand-logo--join {
    max-height: 2.35rem;
  }
}
</style>
