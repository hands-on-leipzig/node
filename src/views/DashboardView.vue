<script setup>
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { RouterLink } from 'vue-router'
import {
  listTeams,
  listClasses,
  listGroups,
  parseNodeListPayload,
  getOpenTasks,
  inviteCoCoach,
  checkCoCoachEmail,
  getDashboardCalendarEvents,
  getRegistrationWindow,
} from '@/services/draht'
import { fetchDocumentsConfig } from '@/services/documentsConfig'
import { hasAdminRole } from '@/auth/keycloak'
import EnrollWizard from '@/components/EnrollWizard.vue'
import CustomSelect from '@/components/CustomSelect.vue'
import DocumentsFolderTree from '@/components/DocumentsFolderTree.vue'
import DocumentsFileOpeningOverlay from '@/components/DocumentsFileOpeningOverlay.vue'
import PdfViewerModal from '@/components/PdfViewerModal.vue'
import { buildDocumentsFolderTree } from '@/utils/documentsTree'
import { useDocumentFileOpen } from '@/composables/useDocumentFileOpen'

const { t, locale } = useI18n()
const router = useRouter()
const route = useRoute()

const wizardOpen = ref(false)
const wizardRef = ref(null)
const coCoachModalOpen = ref(false)
const selectedRegistrationTarget = ref('')
const coCoachEmail = ref('')
const coCoachProbe = ref(null)
const coCoachChecking = ref(false)
const coCoachInviteSubmitting = ref(false)
const coCoachInviteSuccess = ref(false)
const coCoachInviteError = ref('')

function resetCoCoachInviteForm() {
  coCoachEmail.value = ''
  coCoachProbe.value = null
  coCoachInviteSuccess.value = false
  coCoachInviteError.value = ''
  coCoachInviteSubmitting.value = false
  coCoachChecking.value = false
}

const registrationWindow = ref({
  loading: true,
  allowed: true,
  opensAt: null,
  openHour: 10,
  timezone: 'Europe/Berlin',
  closedMessage: '',
  controlMode: 'season',
})

const registrationAllowed = computed(() => !registrationWindow.value.loading && registrationWindow.value.allowed !== false)

const registrationOpensMessage = computed(() => {
  if (registrationAllowed.value) return ''
  const custom = (registrationWindow.value.closedMessage || '').trim()
  if (custom) return custom
  if (!registrationWindow.value.opensAt) {
    return t('dashboard.registrationClosedHint')
  }
  const d = new Date(registrationWindow.value.opensAt)
  if (Number.isNaN(d.getTime())) return ''
  const dateStr = new Intl.DateTimeFormat(locale.value === 'de' ? 'de-DE' : 'en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d)
  const hour = registrationWindow.value.openHour ?? 10
  return t('dashboard.registrationOpensAt', { date: dateStr, hour })
})

async function loadRegistrationWindow() {
  registrationWindow.value = { ...registrationWindow.value, loading: true }
  try {
    const res = await getRegistrationWindow()
    const data = res?.data?.data ?? res?.data ?? {}
    registrationWindow.value = {
      loading: false,
      allowed: data.allowed !== false,
      opensAt: data.opensAt || null,
      openHour: Number.isFinite(Number(data.openHour)) ? Number(data.openHour) : 10,
      timezone: data.timezone || 'Europe/Berlin',
      closedMessage: typeof data.closedMessage === 'string' ? data.closedMessage : '',
      controlMode: data.controlMode || 'season',
    }
  } catch {
    registrationWindow.value = {
      loading: false,
      allowed: true,
      opensAt: null,
      openHour: 10,
      timezone: 'Europe/Berlin',
      closedMessage: '',
      controlMode: 'season',
    }
  }
}

function openWizard() {
  if (!registrationAllowed.value) return
  wizardOpen.value = true
}
function clearWizardQuery() {
  if (!route.query?.wizard) return
  const nextQuery = { ...route.query }
  delete nextQuery.wizard
  void router.replace({ name: 'dashboard', query: nextQuery })
}
function openCoCoachModal() {
  resetCoCoachInviteForm()
  coCoachModalOpen.value = true
  const list = coCoachTargets.value
  if (list.length === 1) {
    selectedRegistrationTarget.value = list[0].value
  } else if (list.length > 1) {
    selectedRegistrationTarget.value = list[0].value
  } else {
    selectedRegistrationTarget.value = ''
  }
}
function closeCoCoachModal() {
  coCoachModalOpen.value = false
}

function parseCoCoachTarget() {
  const target = String(selectedRegistrationTarget.value || '')
  if (!target.includes(':')) return null
  const [type, idStr] = target.split(':')
  const targetId = parseInt(idStr, 10)
  const targetType = type === 'team' || type === 'class' || type === 'group' ? type : ''
  if (!targetType || Number.isNaN(targetId)) return null
  return { targetType, targetId }
}

const canCheckCoCoachEmail = computed(() => {
  if (coCoachChecking.value || coCoachInviteSuccess.value) return false
  if (!selectedRegistrationTarget.value) return false
  const e = coCoachEmail.value.trim()
  if (!e) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
})

watch([selectedRegistrationTarget, coCoachEmail], () => {
  coCoachProbe.value = null
})

async function runCoCoachEmailCheck() {
  coCoachInviteError.value = ''
  const parsed = parseCoCoachTarget()
  if (!parsed || !canCheckCoCoachEmail.value) {
    coCoachInviteError.value = t('common.requiredField')
    return
  }
  coCoachChecking.value = true
  try {
    const res = await checkCoCoachEmail({
      ...parsed,
      email: coCoachEmail.value.trim(),
    })
    const d = res?.data?.data ?? res?.data
    coCoachProbe.value = {
      coachAccountExists: !!d?.coachAccountExists,
      alreadyCoCoach: !!d?.alreadyCoCoach,
    }
  } catch (e) {
    const d = e.response?.data
    const msg =
      (typeof d === 'string' && d) ||
      d?.message ||
      d?.error?.message ||
      (Array.isArray(d?.errors) ? d.errors.join(' ') : '') ||
      e.message
    coCoachInviteError.value = (msg && String(msg).trim()) || t('dashboard.addCoCoachErrorGeneric')
    coCoachProbe.value = null
  } finally {
    coCoachChecking.value = false
  }
}

async function submitCoCoachInvite(inviteUnregistered) {
  coCoachInviteError.value = ''
  const parsed = parseCoCoachTarget()
  if (!parsed) {
    coCoachInviteError.value = t('dashboard.addCoCoachErrorGeneric')
    return
  }
  const email = coCoachEmail.value.trim()
  if (!email) {
    coCoachInviteError.value = t('common.requiredField')
    return
  }
  coCoachInviteSubmitting.value = true
  try {
    await inviteCoCoach({
      ...parsed,
      email,
      inviteUnregistered: !!inviteUnregistered,
    })
    coCoachInviteSuccess.value = true
  } catch (e) {
    const d = e.response?.data
    const msg =
      (typeof d === 'string' && d) ||
      d?.message ||
      d?.error?.message ||
      (Array.isArray(d?.errors) ? d.errors.join(' ') : '') ||
      e.message
    coCoachInviteError.value = (msg && String(msg).trim()) || t('dashboard.addCoCoachErrorGeneric')
  } finally {
    coCoachInviteSubmitting.value = false
  }
}
function goToCoCoachPage() {
  const target = String(selectedRegistrationTarget.value || '')
  if (!target.includes(':')) return
  const [type, id] = target.split(':')
  if (!type || !id) return
  closeCoCoachModal()
  if (type === 'team') {
    router.push({ name: 'team-detail', params: { id }, query: { focus: 'coCoaches' } })
    return
  }
  if (type === 'class') {
    router.push({ name: 'class-detail', params: { id }, query: { focus: 'coCoaches' } })
    return
  }
  if (type === 'group') {
    router.push({ name: 'group-detail', params: { id }, query: { focus: 'coCoaches' } })
  }
}
function coCoachTargetLabel(item) {
  const label = item.name || item.label || item.ref || '#' + item.id
  if (item.type === 'class') return `${t('dashboard.coCoachTypeClass')}: ${label}`
  if (item.type === 'group') return `${t('dashboard.coCoachTypeGroup')}: ${label}`
  return `${t('dashboard.coCoachTypeTeam')}: ${label}`
}
function onWizardClose() {
  wizardOpen.value = false
  clearWizardQuery()
}
function onWizardSuccess() {
  loadLists()
  clearWizardQuery()
}

function handleBrowserBackRequest(event) {
  if (!wizardOpen.value) return
  const handled = wizardRef.value?.handleBrowserBack?.()
  if (handled && event?.detail) {
    event.detail.handled = true
  }
}

const teams = ref([])
const classes = ref([])
const groups = ref([])
const loading = ref(true)
const error = ref(null)
const coCoachTargets = computed(() => {
  const teamTargets = teams.value.map((item) => ({ ...item, type: 'team', value: `team:${item.id}` }))
  const classTargets = classes.value.map((item) => ({ ...item, type: 'class', value: `class:${item.id}` }))
  const groupTargets = groups.value.map((item) => ({ ...item, type: 'group', value: `group:${item.id}` }))
  return [...teamTargets, ...classTargets, ...groupTargets]
})

const coCoachSelectOptions = computed(() =>
  coCoachTargets.value.map((item) => ({
    value: item.value,
    label: coCoachTargetLabel(item),
  })),
)


/** Tasks to do: built from getTeam/getClass detail responses (same data as team detail page). */
const taskItems = ref([])
const tasksLoading = ref(false)

const documentsConfig = ref({
  folderUrl: '',
  title: '',
  files: [],
  graphMeta: null,
})
const documentsLoading = ref(false)
const documentsLoadedOnce = ref(false)
const documentsFileOpening = ref(false)
const documentsFileOpeningName = ref('')
const documentsModalOpen = ref(false)
const pdfModalOpen = ref(false)
const pdfModalUrl = ref('')
const pdfModalTitle = ref('')
const pdfModalBlobUrl = ref('')
const isMobileDashboard = ref(false)
let mobileMediaQuery = null
let detachMobileListener = null

/** 'graph' | 'graph_empty' | 'graph_error' */
const calendarFeedKind = ref('graph_empty')
const calendarEvents = ref([])
const calendarLoading = ref(false)
/** False when admin disabled the calendar feed or events could not be loaded. */
const calendarTileVisible = ref(false)

const upcomingDisplayList = computed(() =>
  calendarEvents.value.map((ev) => ({ ...ev, _from: 'graph' })),
)

function formatGraphStart(dateTime, tz) {
  if (!dateTime) return ''
  const s = String(dateTime).replace(/\.\d+$/, '').replace('T', ' ')
  return tz && tz !== 'UTC' ? `${s} (${tz})` : s
}

function graphLocationLine(ev) {
  if (ev.isOnline === true || ev.isOnline === 1 || ev.isOnline === '1') return t('dashboard.calendarOnline')
  return ev.location || '—'
}

async function loadUpcomingCalendar() {
  calendarLoading.value = true
  calendarTileVisible.value = false
  calendarFeedKind.value = 'graph_empty'
  calendarEvents.value = []
  try {
    const res = await getDashboardCalendarEvents()
    const inner = res?.data?.data ?? res?.data
    if (!inner?.enabled) {
      return
    }
    calendarTileVisible.value = true
    const meta = inner.meta && typeof inner.meta === 'object' ? inner.meta : {}
    const code = String(meta.code ?? '')
    const evs = Array.isArray(inner.events) ? inner.events : []
    if (code === 'ok' && evs.length > 0) {
      calendarEvents.value = evs
      calendarFeedKind.value = 'graph'
      return
    }
    if (code === 'ok') {
      calendarFeedKind.value = 'graph_empty'
      return
    }
    calendarFeedKind.value = 'graph_error'
  } catch (_) {
    calendarTileVisible.value = false
  } finally {
    calendarLoading.value = false
  }
}

/** Map API action string to UI { label, icon }. */
function actionFromApi(apiAction) {
  if (apiAction === 'pay_invoice') {
    return { label: t('dashboard.payInvoice'), icon: 'bi-receipt' }
  }
  return { label: t('dashboard.actionRequired'), icon: 'bi-exclamation-circle' }
}

async function loadLists() {
  loading.value = true
  error.value = null
  try {
    const [teamsRes, classesRes, groupsRes] = await Promise.allSettled([
      listTeams(),
      listClasses(),
      listGroups(),
    ])
    const teamList = teamsRes.status === 'fulfilled' ? parseNodeListPayload(teamsRes.value) : []
    const classList = classesRes.status === 'fulfilled' ? parseNodeListPayload(classesRes.value) : []
    const groupList = groupsRes.status === 'fulfilled' ? parseNodeListPayload(groupsRes.value) : []
    if (groupsRes.status === 'rejected') {
      console.warn('[dashboard] listGroups failed', groupsRes.reason)
    }
    teams.value = [...teamList]
    classes.value = [...classList]
    groups.value = [...groupList]
  } catch (e) {
    error.value = e.message || t('errors.loadFailed')
  } finally {
    loading.value = false
  }
  // Open tasks from single backend endpoint (GET node/tasks)
  tasksLoading.value = true
  taskItems.value = []
  try {
    const res = await getOpenTasks()
    const data = res?.data?.data ?? (Array.isArray(res?.data) ? res.data : [])
    taskItems.value = (Array.isArray(data) ? data : []).map((row) => ({
      type: row.type || (row.id != null ? 'team' : 'class'),
      id: row.id,
      name: row.name ?? row.ref ?? '#' + row.id,
      ref: row.ref,
      action: actionFromApi(row.action),
    }))
  } catch (e) {
    if (import.meta.env.DEV) console.warn('Dashboard open tasks failed', e)
  } finally {
    tasksLoading.value = false
  }
}

function goTeam(id) {
  router.push({ name: 'team-detail', params: { id } })
}
function goClass(id) {
  router.push({ name: 'class-detail', params: { id } })
}
function goToTask(item) {
  if (item.type === 'team') goTeam(item.id)
  else goClass(item.id)
}

onMounted(async () => {
  loadLists()
  loadUpcomingCalendar()
  await loadRegistrationWindow()
  if (route.query?.wizard === '1' && registrationAllowed.value) {
    wizardOpen.value = true
  } else if (route.query?.wizard === '1') {
    clearWizardQuery()
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('hot-browser-back', handleBrowserBackRequest)
  }
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    mobileMediaQuery = window.matchMedia('(max-width: 768px)')
    isMobileDashboard.value = !!mobileMediaQuery.matches
    const onMqChange = (e) => {
      isMobileDashboard.value = !!e.matches
    }
    if (typeof mobileMediaQuery.addEventListener === 'function') {
      mobileMediaQuery.addEventListener('change', onMqChange)
      detachMobileListener = () => mobileMediaQuery?.removeEventListener('change', onMqChange)
    } else if (typeof mobileMediaQuery.addListener === 'function') {
      mobileMediaQuery.addListener(onMqChange)
      detachMobileListener = () => mobileMediaQuery?.removeListener(onMqChange)
    }
  }
  if (!isMobileDashboard.value) {
    await ensureDocumentsLoaded()
  }
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('hot-browser-back', handleBrowserBackRequest)
  }
  if (detachMobileListener) detachMobileListener()
  if (pdfModalBlobUrl.value) {
    URL.revokeObjectURL(pdfModalBlobUrl.value)
    pdfModalBlobUrl.value = ''
  }
})

watch(isMobileDashboard, async (mobile) => {
  if (!mobile) {
    await ensureDocumentsLoaded()
  }
})

watch(
  () => route.query?.wizard,
  (wizardFlag) => {
    if (wizardFlag === '1') {
      if (registrationAllowed.value) {
        wizardOpen.value = true
      } else {
        clearWizardQuery()
      }
    }
  },
)

async function ensureDocumentsLoaded() {
  if (documentsLoadedOnce.value || documentsLoading.value) return
  documentsLoading.value = true
  try {
    documentsConfig.value = await fetchDocumentsConfig()
    documentsLoadedOnce.value = true
  } finally {
    documentsLoading.value = false
  }
}

async function openDocumentsModal() {
  documentsModalOpen.value = true
  await ensureDocumentsLoaded()
}

function closeDocumentsModal() {
  documentsModalOpen.value = false
}

/** @param {Blob} blob */
async function openPdfFromBlob(blob, title) {
  if (!blob || blob.size < 100) return false
  if (pdfModalBlobUrl.value) {
    URL.revokeObjectURL(pdfModalBlobUrl.value)
  }
  pdfModalBlobUrl.value = URL.createObjectURL(blob)
  pdfModalUrl.value = pdfModalBlobUrl.value
  pdfModalTitle.value = title
  pdfModalOpen.value = true
  return true
}

function openExternalUrl(url) {
  if (!url) return
  window.open(url, '_blank', 'noopener,noreferrer')
}

const { openDocumentFile } = useDocumentFileOpen({
  openPdfFromBlob,
  openExternalUrl,
  openPdfDirect: (url, title) => {
    pdfModalUrl.value = url
    pdfModalTitle.value = title
    pdfModalOpen.value = true
  },
})

/** @param {{ url?: string, name?: string, driveId?: string, itemId?: string, graphItem?: boolean }} file */
async function handleOpenDocumentFile(file) {
  if (documentsFileOpening.value) return
  documentsFileOpening.value = true
  documentsFileOpeningName.value = String(file?.name || '').trim()
  try {
    await openDocumentFile(file || {})
  } finally {
    documentsFileOpening.value = false
    documentsFileOpeningName.value = ''
  }
}

/** @param {{ url?: string, name?: string, driveId?: string, itemId?: string, graphItem?: boolean }} payload */
async function openDocumentsPdf(payload) {
  await handleOpenDocumentFile(payload || {})
}

function closeDocumentsPdf() {
  pdfModalOpen.value = false
  pdfModalUrl.value = ''
  pdfModalTitle.value = ''
  if (pdfModalBlobUrl.value) {
    URL.revokeObjectURL(pdfModalBlobUrl.value)
    pdfModalBlobUrl.value = ''
  }
}

/** SharePoint / manual files grouped by relative path (`path` from API or `folder` with slashes). */
const documentsFolderRoot = computed(() => {
  const cfg = documentsConfig.value
  if (!cfg || typeof cfg !== 'object') return { files: [], folders: [] }
  const files = Array.isArray(cfg.files) ? cfg.files : []
  const folderPaths = Array.isArray(cfg.graphFolders) ? cfg.graphFolders : []
  return buildDocumentsFolderTree(files, folderPaths)
})

const hasDocumentTreeContent = computed(() => {
  const r = documentsFolderRoot.value
  return (r.files?.length || 0) + (r.folders?.length || 0) > 0
})

</script>

<template>
  <div class="dashboard-view liquid-surface-scope">
    <div v-if="loading" class="dashboard-loading liquid-surface">
      <i class="bi bi-arrow-repeat spin"></i>
      <I18nText k="dashboard.loading" />
    </div>
    <div v-else-if="error" class="dashboard-error liquid-surface">
      <i class="bi bi-exclamation-circle"></i>
      {{ error }}
    </div>
    <template v-else>
      <header class="dashboard-header liquid-surface liquid-surface--accent">
        <h1 class="dashboard-title"><I18nText k="dashboard.cockpitTitle" /></h1>
        <p class="dashboard-subtitle"><I18nText k="dashboard.cockpitSubtitle" /></p>
      </header>

      <div class="dashboard-grid">
        <!-- Section: Register new team / class -->
        <section class="dashboard-card liquid-surface liquid-surface--accent dashboard-card-register">
          <h2 class="dashboard-card-title">
            <i class="bi bi-plus-circle"></i>
            <I18nText k="dashboard.registerNew" />
          </h2>
          <p class="dashboard-card-desc"><I18nText k="dashboard.intro" /></p>
          <p
            v-if="!registrationWindow.loading && !registrationAllowed && registrationOpensMessage.trim()"
            class="dashboard-registration-hint"
            role="status"
          >
            <i class="bi bi-info-circle" aria-hidden="true" />
            {{ registrationOpensMessage }}
          </p>
          <div class="dashboard-register-actions">
            <button
              type="button"
              class="dashboard-cta"
              :class="{ 'dashboard-cta--disabled': !registrationAllowed }"
              :disabled="!registrationAllowed"
              @click="openWizard"
              :title="registrationAllowed ? t('wizard.ctaButton') : registrationOpensMessage"
            >
              <i class="bi bi-magic"></i>
              <span><I18nText k="wizard.ctaButton" /></span>
            </button>
            <button type="button" class="dashboard-cta-coach" @click="openCoCoachModal">
              <i class="bi bi-person-plus" aria-hidden="true" />
              <span><I18nText k="dashboard.addCoCoachButton" /></span>
            </button>
          </div>
        </section>

        <!-- Section: Tasks to do (only teams/classes with action required) -->
        <section class="dashboard-card liquid-surface liquid-surface--accent liquid-surface--accent-amber dashboard-card-tasks">
          <h2 class="dashboard-card-title">
            <i class="bi bi-list-check"></i>
            <I18nText k="dashboard.tasksToDo" />
            <span v-if="taskItems.length" class="dashboard-card-badge">{{ taskItems.length }}</span>
          </h2>
          <div v-if="tasksLoading" class="dashboard-empty">
            <i class="bi bi-arrow-repeat spin"></i>
            <I18nText k="dashboard.checkingTasks" />
          </div>
          <div v-else-if="taskItems.length" class="dashboard-tasks-list">
            <button
                v-for="item in taskItems"
                :key="item.type + '-' + item.id"
                type="button"
                class="dashboard-task-item"
                @click="goToTask(item)"
            >
              <span class="dashboard-task-name">{{ item.name }}</span>
              <span v-if="item.ref" class="dashboard-task-ref">{{ item.ref }}</span>
              <span class="dashboard-task-action">
                <i :class="['bi', item.action.icon]"></i>
                {{ item.action.label }}
              </span>
            </button>
          </div>
          <p v-else class="dashboard-empty">
            <i class="bi bi-check-circle"></i>
            <I18nText k="dashboard.noPendingTasks" />
          </p>
        </section>

        <!-- Documents for download (SharePoint / shared folder) — always visible -->
        <section class="dashboard-card liquid-surface liquid-surface--accent liquid-surface--accent-blue dashboard-card-documents">
          <h2 class="dashboard-card-title">
            <i class="bi bi-cloud-arrow-down"></i>
            <template v-if="documentsConfig.title">{{ documentsConfig.title }}</template>
            <I18nText v-else k="dashboard.documentsForDownload" />
          </h2>
          <template v-if="isMobileDashboard">
            <p class="dashboard-card-desc"><I18nText k="dashboard.documentsDescription" /></p>
            <button type="button" class="dashboard-documents-open-mobile" @click="openDocumentsModal">
              <i class="bi bi-folder2-open" aria-hidden="true" />
              <I18nText k="dashboard.documentsOpenMobile" />
            </button>
          </template>
          <template v-else>
          <div v-if="documentsLoading" class="dashboard-documents-loading">
            <i class="bi bi-arrow-repeat spin"></i>
            <I18nText k="dashboard.documentsLoadingList" />
          </div>
          <template
            v-else-if="documentsConfig.files?.length || documentsConfig.folderUrl"
          >
            <p class="dashboard-card-desc"><I18nText k="dashboard.documentsDescription" /></p>
            <p
              v-if="
                documentsConfig.graphMeta?.code === 'empty_or_unavailable' &&
                documentsConfig.folderUrl &&
                !documentsConfig.files?.length
              "
              class="dashboard-documents-graph-hint"
            >
              <I18nText k="dashboard.documentsGraphNoFiles" />
            </p>
            <div
              v-if="hasDocumentTreeContent"
              class="dashboard-documents-panel"
              :class="{ 'dashboard-documents-panel--busy': documentsFileOpening }"
            >
              <DocumentsFileOpeningOverlay
                :open="documentsFileOpening"
                :file-name="documentsFileOpeningName"
              />
              <DocumentsFolderTree
                :node="documentsFolderRoot"
                :depth="0"
                @open-pdf="openDocumentsPdf"
                @open-file="handleOpenDocumentFile"
              />
            </div>
          </template>
          <template v-else-if="!documentsLoading">
            <p class="dashboard-card-desc dashboard-documents-empty">
              <I18nText k="dashboard.documentsNotConfigured" />
            </p>
            <p class="dashboard-documents-hint"><I18nText k="dashboard.documentsNotConfiguredHint" /></p>
            <RouterLink
              v-if="hasAdminRole()"
              to="/dashboard/admin/documents"
              class="dashboard-documents-link dashboard-documents-link-secondary"
            >
              <i class="bi bi-gear"></i>
              <I18nText k="dashboard.documentsConfigureAdmin" />
            </RouterLink>
          </template>
          </template>
        </section>

        <!-- Upcoming events (only when admin enabled calendar feed) -->
        <section v-if="calendarTileVisible" class="dashboard-card liquid-surface liquid-surface--accent liquid-surface--accent-teal dashboard-card-events">
          <h2 class="dashboard-card-title">
            <i class="bi bi-calendar-event"></i>
            <I18nText k="dashboard.upcomingEvents" />
          </h2>
          <div v-if="calendarLoading" class="dashboard-documents-loading">
            <i class="bi bi-arrow-repeat spin"></i>
            <I18nText k="dashboard.calendarLoading" />
          </div>
          <template v-else>
            <ul v-if="upcomingDisplayList.length" class="dashboard-events-list">
              <li v-for="(ev, idx) in upcomingDisplayList" :key="ev.id || idx" class="dashboard-event-item">
                <a
                  v-if="ev.webLink"
                  :href="ev.webLink"
                  class="dashboard-event-title dashboard-event-link"
                  target="_blank"
                  rel="noopener noreferrer"
                >{{ ev.title }}</a>
                <span v-else class="dashboard-event-title">{{ ev.title }}</span>
                <span class="dashboard-event-meta">{{ formatGraphStart(ev.start, ev.startTimeZone) }} · {{ graphLocationLine(ev) }}</span>
              </li>
            </ul>
            <p v-if="calendarFeedKind === 'graph_empty'" class="dashboard-events-hint">
              <I18nText k="dashboard.calendarEmpty" />
            </p>
            <p v-else-if="calendarFeedKind === 'graph_error'" class="dashboard-events-hint dashboard-events-hint-warn">
              <I18nText k="dashboard.calendarLoadError" />
            </p>
            <p v-if="calendarFeedKind === 'graph_error' && hasAdminRole()" class="dashboard-events-hint">
              <RouterLink to="/dashboard/admin/calendar" class="dashboard-documents-link-secondary dashboard-events-admin-link">
                <i class="bi bi-gear"></i>
                <I18nText k="dashboard.calendarConfigureAdmin" />
              </RouterLink>
            </p>
          </template>
        </section>
      </div>
    </template>

    <Teleport to="body">
      <div
        v-if="documentsModalOpen"
        class="dashboard-documents-modal-backdrop"
        role="dialog"
        aria-modal="true"
        :aria-label="t('dashboard.documentsForDownload')"
        @click.self="closeDocumentsModal"
      >
        <div class="dashboard-documents-modal" @click.stop>
          <header class="dashboard-documents-modal-head">
            <h2 class="dashboard-documents-modal-title">
              <template v-if="documentsConfig.title">{{ documentsConfig.title }}</template>
              <I18nText v-else k="dashboard.documentsForDownload" />
            </h2>
            <button type="button" class="dashboard-documents-modal-close" :aria-label="t('common.closeDialog')" @click="closeDocumentsModal">
              <i class="bi bi-x-lg" aria-hidden="true" />
            </button>
          </header>
          <div class="dashboard-documents-modal-body">
            <div v-if="documentsLoading" class="dashboard-documents-loading">
              <i class="bi bi-arrow-repeat spin"></i>
              <I18nText k="dashboard.documentsLoadingList" />
            </div>
            <template v-else-if="documentsConfig.files?.length || documentsConfig.folderUrl">
              <p class="dashboard-card-desc"><I18nText k="dashboard.documentsDescription" /></p>
              <p
                v-if="
                  documentsConfig.graphMeta?.code === 'empty_or_unavailable' &&
                  documentsConfig.folderUrl &&
                  !documentsConfig.files?.length
                "
                class="dashboard-documents-graph-hint"
              >
                <I18nText k="dashboard.documentsGraphNoFiles" />
              </p>
              <div
                v-if="hasDocumentTreeContent"
                class="dashboard-documents-panel"
                :class="{ 'dashboard-documents-panel--busy': documentsFileOpening }"
              >
                <DocumentsFileOpeningOverlay
                  :open="documentsFileOpening"
                  :file-name="documentsFileOpeningName"
                />
                <DocumentsFolderTree
                  :node="documentsFolderRoot"
                  :depth="0"
                  @open-pdf="openDocumentsPdf"
                  @open-file="handleOpenDocumentFile"
                />
              </div>
            </template>
            <template v-else>
              <p class="dashboard-card-desc dashboard-documents-empty">
                <I18nText k="dashboard.documentsNotConfigured" />
              </p>
              <p class="dashboard-documents-hint"><I18nText k="dashboard.documentsNotConfiguredHint" /></p>
              <RouterLink
                v-if="hasAdminRole()"
                to="/dashboard/admin/documents"
                class="dashboard-documents-link dashboard-documents-link-secondary"
                @click="closeDocumentsModal"
              >
                <i class="bi bi-gear"></i>
                <I18nText k="dashboard.documentsConfigureAdmin" />
              </RouterLink>
            </template>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="coCoachModalOpen"
        class="co-coach-modal-backdrop"
        role="dialog"
        aria-modal="true"
        :aria-label="t('dashboard.addCoCoachModalTitle')"
        @click.self="closeCoCoachModal"
      >
        <div class="co-coach-modal-dialog" @click.stop>
          <header class="co-coach-modal-head">
            <h2 class="co-coach-modal-title"><I18nText k="dashboard.addCoCoachModalTitle" /></h2>
            <button type="button" class="co-coach-modal-close" :aria-label="t('dashboard.addCoCoachClose')" @click="closeCoCoachModal">
              <i class="bi bi-x-lg" aria-hidden="true" />
            </button>
          </header>
          <div class="co-coach-modal-body">
            <template v-if="coCoachTargets.length === 0">
              <p class="co-coach-modal-text"><I18nText k="dashboard.addCoCoachNoRegistrations" /></p>
            </template>
            <template v-else>
              <p v-if="!coCoachInviteSuccess" class="co-coach-modal-text"><I18nText k="dashboard.addCoCoachModalLead" /></p>
              <label v-if="coCoachTargets.length > 1 && !coCoachInviteSuccess" class="co-coach-modal-label">
                <span><I18nText k="dashboard.addCoCoachChooseRegistration" /></span>
                <CustomSelect
                  v-model="selectedRegistrationTarget"
                  size="sm"
                  :options="coCoachSelectOptions"
                  :placeholder="t('dashboard.addCoCoachChooseRegistration')"
                />
              </label>
              <template v-if="!coCoachInviteSuccess">
                <label class="co-coach-modal-label co-coach-modal-span2">
                  <span><I18nText k="dashboard.addCoCoachEmail" /></span>
                  <input
                    v-model="coCoachEmail"
                    type="email"
                    class="co-coach-modal-input"
                    name="co-coach-email-manual"
                    autocomplete="off"
                    autocorrect="off"
                    autocapitalize="off"
                    spellcheck="false"
                    data-lpignore="true"
                    data-1p-ignore
                  />
                </label>
                <p v-if="coCoachProbe?.alreadyCoCoach" class="co-coach-modal-info">
                  <I18nText k="dashboard.addCoCoachAlreadyLinked" />
                </p>
                <template v-else-if="coCoachProbe && coCoachProbe.coachAccountExists">
                  <p class="co-coach-modal-info"><I18nText k="dashboard.addCoCoachResultHasCoach" /></p>
                </template>
                <template v-else-if="coCoachProbe && !coCoachProbe.coachAccountExists">
                  <p class="co-coach-modal-info"><I18nText k="dashboard.addCoCoachResultNoCoach" /></p>
                  <p class="co-coach-modal-note co-coach-modal-note-spaced"><I18nText k="dashboard.addCoCoachUnregisteredHint" /></p>
                </template>
                <p class="co-coach-modal-note co-coach-modal-note-spaced"><I18nText k="dashboard.addCoCoachModalNote" /></p>
              </template>
              <p v-else class="co-coach-modal-success"><I18nText k="dashboard.addCoCoachSuccess" /></p>
              <p v-if="coCoachInviteError" class="co-coach-modal-error">{{ coCoachInviteError }}</p>
            </template>
          </div>
          <footer class="co-coach-modal-foot">
            <button type="button" class="co-coach-modal-btn co-coach-modal-btn-ghost" @click="closeCoCoachModal">
              <I18nText k="dashboard.addCoCoachClose" />
            </button>
            <button
              v-if="coCoachTargets.length > 0 && !coCoachInviteSuccess"
              type="button"
              class="co-coach-modal-btn co-coach-modal-btn-ghost"
              :disabled="!selectedRegistrationTarget"
              @click="goToCoCoachPage"
            >
              <I18nText k="dashboard.addCoCoachGo" />
            </button>
            <button
              v-if="coCoachTargets.length > 0 && !coCoachInviteSuccess && !coCoachProbe"
              type="button"
              class="co-coach-modal-btn co-coach-modal-btn-primary"
              :disabled="!canCheckCoCoachEmail"
              @click="runCoCoachEmailCheck"
            >
              <template v-if="coCoachChecking"><I18nText k="dashboard.addCoCoachChecking" /></template>
              <template v-else><I18nText k="dashboard.addCoCoachCheckEmail" /></template>
            </button>
            <button
              v-if="coCoachTargets.length > 0 && !coCoachInviteSuccess && coCoachProbe && !coCoachProbe.alreadyCoCoach && coCoachProbe.coachAccountExists"
              type="button"
              class="co-coach-modal-btn co-coach-modal-btn-primary"
              :disabled="coCoachInviteSubmitting"
              @click="submitCoCoachInvite(false)"
            >
              <template v-if="coCoachInviteSubmitting"><I18nText k="dashboard.addCoCoachSending" /></template>
              <template v-else><I18nText k="dashboard.addCoCoachSendInviteExisting" /></template>
            </button>
            <button
              v-if="coCoachTargets.length > 0 && !coCoachInviteSuccess && coCoachProbe && !coCoachProbe.alreadyCoCoach && !coCoachProbe.coachAccountExists"
              type="button"
              class="co-coach-modal-btn co-coach-modal-btn-primary"
              :disabled="coCoachInviteSubmitting"
              @click="submitCoCoachInvite(true)"
            >
              <template v-if="coCoachInviteSubmitting"><I18nText k="dashboard.addCoCoachSending" /></template>
              <template v-else><I18nText k="dashboard.addCoCoachSendInviteUnregistered" /></template>
            </button>
          </footer>
        </div>
      </div>
    </Teleport>

    <EnrollWizard ref="wizardRef" :open="wizardOpen" @close="onWizardClose" @success="onWizardSuccess" />
    <PdfViewerModal
      :show="pdfModalOpen"
      :pdf-url="pdfModalUrl"
      :title="pdfModalTitle"
      @close="closeDocumentsPdf"
    />
  </div>
</template>

<style scoped>
.dashboard-view {
  width: 100%;
  max-width: 64rem;
  margin-left: auto;
  margin-right: auto;
  padding-bottom: 2rem;
}

.dashboard-loading,
.dashboard-error {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-height: 14rem;
  font-size: 1.25rem;
  color: var(--color-text-muted);
}

.dashboard-error {
  color: var(--color-error, #dc2626);
}

.dashboard-header {
  margin-bottom: 1.75rem;
  padding: 1.25rem 1.5rem;
}

.dashboard-title {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--color-text);
  margin: 0 0 0.25rem;
  letter-spacing: -0.02em;
}

.dashboard-subtitle {
  font-size: var(--text-base);
  color: var(--color-text-muted);
  margin: 0;
}

.dashboard-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.25rem;
}

.dashboard-card {
  padding: 1.25rem 1.5rem;
}

.dashboard-card-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9375rem;
  font-weight: 700;
  color: var(--color-text);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin: 0 0 1rem;
}

.dashboard-card-title .bi {
  font-size: 1.1rem;
  color: var(--color-accent);
}

.dashboard-card-badge {
  margin-left: auto;
  font-size: 0.75rem;
  font-weight: 700;
  color: white;
  background: var(--color-accent);
  padding: 0.2rem 0.5rem;
  border-radius: 999px;
}

.dashboard-card-desc {
  font-size: 0.9375rem;
  color: var(--color-text-muted);
  margin: 0 0 1rem;
  line-height: 1.45;
}

.dashboard-card-documents {
  grid-column: 1 / -1;
}
.dashboard-documents-panel {
  position: relative;
  min-height: 2.5rem;
  border-radius: var(--radius);
}
.dashboard-documents-panel--busy :deep(.doc-folder-tree) {
  pointer-events: none;
  opacity: 0.55;
  transition: opacity 0.15s ease;
}
.dashboard-documents-modal-body .dashboard-documents-panel {
  min-height: 6rem;
}
.dashboard-documents-loading {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  padding: 0.5rem 0;
}
.dashboard-documents-graph-hint {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  margin: 0 0 0.75rem;
  line-height: 1.45;
}
.dashboard-documents-link {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 1rem;
  font-weight: 600;
  font-size: var(--text-sm);
  color: white;
  background: var(--color-accent);
  border-radius: var(--radius);
  text-decoration: none;
  transition: opacity 0.15s;
}
.dashboard-documents-link:hover {
  opacity: 0.92;
  color: white;
}
.dashboard-documents-empty {
  color: var(--color-text-muted);
}
.dashboard-documents-hint {
  font-size: var(--text-sm);
  color: var(--color-text-subtle);
  margin: 0 0 0.75rem;
  line-height: 1.45;
}
.dashboard-documents-link-secondary {
  background: var(--color-bg-muted);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}
.dashboard-documents-link-secondary:hover {
  background: var(--color-bg-hover);
  color: var(--color-text);
}
.dashboard-documents-open-mobile {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-height: var(--touch);
  padding: 0.7rem 1rem;
  border-radius: var(--radius);
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  color: var(--color-text);
  font-weight: 600;
  cursor: pointer;
}
.dashboard-documents-open-mobile:hover {
  background: var(--color-bg-hover);
}
.dashboard-documents-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10030;
  background: var(--liquid-modal-scrim-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}
.dashboard-documents-modal {
  width: min(100%, 44rem);
  max-height: min(88vh, 780px);
  overflow: auto;
  background: var(--liquid-popover-fill);
  backdrop-filter: blur(var(--liquid-popover-blur)) saturate(var(--liquid-popover-saturate));
  -webkit-backdrop-filter: blur(var(--liquid-popover-blur)) saturate(var(--liquid-popover-saturate));
  border: 1px solid var(--liquid-border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
}
.dashboard-documents-modal-head {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.9rem 1rem;
  border-bottom: 1px solid var(--color-border);
  background: var(--liquid-popover-fill);
  backdrop-filter: blur(var(--liquid-popover-blur)) saturate(var(--liquid-popover-saturate));
  -webkit-backdrop-filter: blur(var(--liquid-popover-blur)) saturate(var(--liquid-popover-saturate));
}
.dashboard-documents-modal-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
}
.dashboard-documents-modal-close {
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  border-radius: var(--radius);
  width: 2.2rem;
  height: 2.2rem;
}
.dashboard-documents-modal-close:hover {
  background: var(--color-bg-hover);
  color: var(--color-text);
}
.dashboard-documents-modal-body {
  padding: 0.85rem 1rem 1rem;
  min-width: 0;
}

.dashboard-tasks-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.dashboard-task-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.65rem 0.85rem;
  border: 1px solid var(--liquid-border-soft);
  border-radius: var(--radius-lg);
  background: var(--liquid-tile-bg-inner);
  backdrop-filter: blur(calc(var(--liquid-blur) * 0.62)) saturate(calc(var(--liquid-saturate) * 0.94));
  -webkit-backdrop-filter: blur(calc(var(--liquid-blur) * 0.62)) saturate(calc(var(--liquid-saturate) * 0.94));
  font-family: inherit;
  font-size: 0.9375rem;
  color: var(--color-text);
  cursor: pointer;
  text-align: left;
  transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}

.dashboard-task-item:hover {
  background: var(--liquid-tile-bg);
  border-color: var(--liquid-border);
}

.dashboard-task-name {
  font-weight: 500;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dashboard-task-ref {
  flex-shrink: 0;
  font-size: 0.8125rem;
  color: var(--color-text-muted);
}

.dashboard-task-action {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: #b45309;
}

.dashboard-empty {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9375rem;
  color: var(--color-text-muted);
  margin: 0;
}

.dashboard-empty .bi {
  color: #16a34a;
  font-size: 1.25rem;
}

.dashboard-cta {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.9rem 1.35rem;
  font-size: 1rem;
  font-weight: 600;
  color: white;
  background: linear-gradient(135deg, #2563eb, #0ea5e9);
  border: none;
  border-radius: var(--radius);
  cursor: pointer;
  font-family: inherit;
  box-shadow: 0 4px 14px rgba(37, 99, 235, 0.35);
  transition: transform 0.15s, box-shadow 0.15s;
}

.dashboard-cta:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(37, 99, 235, 0.4);
}

.dashboard-cta--disabled,
.dashboard-cta:disabled {
  cursor: not-allowed;
  opacity: 0.55;
  box-shadow: none;
  filter: grayscale(0.25);
}

.dashboard-registration-hint {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin: 0 0 0.85rem;
  padding: 0.75rem 0.9rem;
  font-size: 0.9375rem;
  line-height: 1.45;
  color: #1e40af;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: var(--radius);
}

.dashboard-registration-hint .bi {
  flex-shrink: 0;
  margin-top: 0.1rem;
  font-size: 1.1rem;
}

.dashboard-cta .bi {
  font-size: 1.1rem;
}

.dashboard-register-actions {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.65rem;
}

.dashboard-cta-coach {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem 1.15rem;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--color-accent);
  background: var(--color-bg);
  border: 2px solid var(--color-border);
  border-radius: var(--radius);
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}

.dashboard-cta-coach:hover {
  background: var(--color-accent-soft);
  border-color: var(--color-accent);
  color: var(--color-text);
}

.dashboard-cta-coach .bi {
  font-size: 1.05rem;
}

.co-coach-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10040;
  background: var(--liquid-modal-scrim-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  box-sizing: border-box;
}

.co-coach-modal-dialog {
  width: 100%;
  max-width: 28rem;
  max-height: min(92vh, 720px);
  overflow: auto;
  background: var(--liquid-popover-fill);
  backdrop-filter: blur(var(--liquid-popover-blur)) saturate(var(--liquid-popover-saturate));
  -webkit-backdrop-filter: blur(var(--liquid-popover-blur)) saturate(var(--liquid-popover-saturate));
  color: var(--color-text);
  border-radius: var(--radius-xl);
  border: 1px solid var(--liquid-border);
  box-shadow: var(--shadow-lg);
}

.co-coach-modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 1rem 1rem 0.5rem;
  border-bottom: 1px solid var(--color-border);
}

.co-coach-modal-title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
}

.co-coach-modal-close {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 0.25rem;
  border-radius: var(--radius);
  line-height: 1;
}

.co-coach-modal-close:hover {
  background: var(--color-bg-hover);
  color: var(--color-text);
}

.co-coach-modal-body {
  padding: 1rem;
}

.co-coach-modal-text,
.co-coach-modal-note {
  margin: 0 0 0.75rem;
  font-size: var(--text-sm);
  line-height: 1.5;
  color: var(--color-text-muted);
}

.co-coach-modal-note {
  margin-bottom: 0;
  font-size: 0.8125rem;
  color: var(--color-text-subtle);
}

.co-coach-modal-label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-bottom: 0.75rem;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text);
}

.co-coach-modal-span2 {
  width: 100%;
}

.co-coach-modal-input {
  width: 100%;
  padding: 0.45rem 0.6rem;
  font-size: var(--text-sm);
  border-radius: var(--radius);
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  color: var(--color-text);
  font-family: inherit;
  box-sizing: border-box;
}

.co-coach-modal-note-spaced {
  margin-top: 0.5rem;
}

.co-coach-modal-info {
  margin: 0.65rem 0 0;
  font-size: var(--text-sm);
  line-height: 1.5;
  color: var(--color-text);
}

.co-coach-modal-check {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin: 0.75rem 0 0;
  font-size: 0.8125rem;
  line-height: 1.45;
  color: var(--color-text);
  cursor: pointer;
}

.co-coach-modal-check input {
  margin-top: 0.2rem;
  flex-shrink: 0;
}

.co-coach-modal-success {
  margin: 0;
  font-size: var(--text-sm);
  line-height: 1.5;
  color: #15803d;
}

.co-coach-modal-error {
  margin: 0.65rem 0 0;
  font-size: 0.8125rem;
  line-height: 1.45;
  color: var(--color-error, #dc2626);
}

.co-coach-modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  flex-wrap: wrap;
  padding: 0.75rem 1rem 1rem;
  border-top: 1px solid var(--color-border);
}

.co-coach-modal-btn {
  padding: 0.45rem 0.9rem;
  font-size: var(--text-sm);
  font-weight: 600;
  border-radius: var(--radius);
  cursor: pointer;
  font-family: inherit;
  border: 1px solid transparent;
}

.co-coach-modal-btn-ghost {
  background: transparent;
  color: var(--color-text-muted);
  border-color: var(--color-border);
}

.co-coach-modal-btn-ghost:hover {
  background: var(--color-bg-hover);
  color: var(--color-text);
}

.co-coach-modal-btn-primary {
  background: var(--color-accent);
  color: white;
  border-color: var(--color-accent);
}

.co-coach-modal-btn-primary:hover:not(:disabled) {
  opacity: 0.92;
}

.co-coach-modal-btn-primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.dashboard-card-events {
  grid-column: 1 / -1;
}

.dashboard-events-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
  gap: 0.75rem;
}

.dashboard-event-item {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.65rem 0.85rem;
  background: var(--liquid-tile-bg-inner);
  backdrop-filter: blur(calc(var(--liquid-blur) * 0.6)) saturate(calc(var(--liquid-saturate) * 0.93));
  -webkit-backdrop-filter: blur(calc(var(--liquid-blur) * 0.6)) saturate(calc(var(--liquid-saturate) * 0.93));
  border-radius: var(--radius-lg);
  border: 1px solid var(--liquid-border-soft);
}

.dashboard-event-title {
  font-weight: 600;
  font-size: 0.9375rem;
  color: var(--color-text);
}

.dashboard-event-meta {
  font-size: 0.8125rem;
  color: var(--color-text-muted);
}

.dashboard-event-link {
  text-decoration: none;
  color: var(--color-accent);
}
.dashboard-event-link:hover {
  text-decoration: underline;
}

.dashboard-events-hint {
  margin: 0.35rem 0 0;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  line-height: 1.45;
}
.dashboard-events-hint-warn {
  color: var(--color-text);
}
.dashboard-events-admin-link {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin-top: 0.35rem;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 640px) {
  .dashboard-grid {
    grid-template-columns: 1fr;
  }
  .dashboard-card {
    padding: 1rem 1rem;
  }
  .dashboard-title {
    font-size: 1.5rem;
  }
  .dashboard-documents-modal {
    width: 100%;
    max-height: 92vh;
  }
}

@media (max-width: 900px) {
  .dashboard-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 480px) {
  .dashboard-header {
    margin-bottom: 1.1rem;
  }
  .dashboard-title {
    font-size: 1.3rem;
  }
  .dashboard-subtitle {
    font-size: 0.92rem;
  }
  .dashboard-card-title {
    font-size: 0.85rem;
  }
  .dashboard-task-item {
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 0.35rem 0.5rem;
  }
  .dashboard-task-action {
    width: 100%;
  }
  .dashboard-events-list {
    grid-template-columns: 1fr;
  }
}
</style>
