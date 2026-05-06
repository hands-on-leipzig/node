<script setup>
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { RouterLink } from 'vue-router'
import { listTeams, listClasses, getOpenTasks } from '@/services/draht'
import { fetchDocumentsConfig } from '@/services/documentsConfig'
import { hasAdminRole } from '@/auth/keycloak'
import EnrollWizard from '@/components/EnrollWizard.vue'
import DocumentsFolderTree from '@/components/DocumentsFolderTree.vue'
import PdfViewerModal from '@/components/PdfViewerModal.vue'
import { buildDocumentsFolderTree } from '@/utils/documentsTree'

const { t } = useI18n()
const router = useRouter()

const wizardOpen = ref(false)
const coCoachModalOpen = ref(false)
const selectedTeamId = ref('')

function openWizard() {
  wizardOpen.value = true
}
function openCoCoachModal() {
  coCoachModalOpen.value = true
  const list = teams.value
  if (list.length === 1) {
    selectedTeamId.value = String(list[0].id)
  } else if (list.length > 1) {
    selectedTeamId.value = String(list[0].id)
  } else {
    selectedTeamId.value = ''
  }
}
function closeCoCoachModal() {
  coCoachModalOpen.value = false
}
function goToCoCoachTeamPage() {
  const id = selectedTeamId.value
  if (!id) return
  closeCoCoachModal()
  router.push({ name: 'team-detail', params: { id }, query: { focus: 'coCoaches' } })
}
function teamSelectLabel(team) {
  return team.name || team.label || team.ref || '#' + team.id
}
function onWizardClose() {
  wizardOpen.value = false
}
function onWizardSuccess() {
  loadLists()
}

const teams = ref([])
const classes = ref([])
const loading = ref(true)
const error = ref(null)

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
const documentsModalOpen = ref(false)
const pdfModalOpen = ref(false)
const pdfModalUrl = ref('')
const pdfModalTitle = ref('')
const pdfModalBlobUrl = ref('')
const isMobileDashboard = ref(false)
let mobileMediaQuery = null
let detachMobileListener = null

/** Mock upcoming events – replace with API feed later. */
const upcomingEvents = ref([
  { titleKey: 'dashboard.mockEventStammtisch', dateKey: 'dashboard.mockEventStammtischDate', locationKey: 'dashboard.mockEventStammtischLocation' },
  { titleKey: 'dashboard.mockEventRegional', dateKey: 'dashboard.mockEventRegionalDate', locationKey: 'dashboard.mockEventRegionalLocation' },
  { titleKey: 'dashboard.mockEventLandesfinale', dateKey: 'dashboard.mockEventLandesfinaleDate', locationKey: 'dashboard.mockEventLandesfinaleLocation' },
])

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
    const [teamsRes, classesRes] = await Promise.allSettled([
      listTeams(),
      listClasses(),
    ])
    let teamList = []
    let classList = []
    if (teamsRes.status === 'fulfilled' && teamsRes.value?.data != null) {
      const d = teamsRes.value.data
      teamList = Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : [])
    }
    if (classesRes.status === 'fulfilled' && classesRes.value?.data != null) {
      const d = classesRes.value.data
      classList = Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : [])
    }
    // Show list immediately so dashboard never hangs
    teams.value = [...teamList]
    classes.value = [...classList]
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

async function tryOpenPdfAsBlob(rawUrl, title) {
  try {
    const res = await fetch(rawUrl, { credentials: 'include' })
    if (!res.ok) return false
    const blob = await res.blob()
    if (!blob || blob.size <= 0) return false
    if (pdfModalBlobUrl.value) {
      URL.revokeObjectURL(pdfModalBlobUrl.value)
    }
    pdfModalBlobUrl.value = URL.createObjectURL(blob)
    pdfModalUrl.value = pdfModalBlobUrl.value
    pdfModalTitle.value = title
    pdfModalOpen.value = true
    return true
  } catch {
    return false
  }
}

async function openDocumentsPdf(payload) {
  const rawUrl = String(payload?.url || '')
  const title = String(payload?.name || 'PDF')
  const host = (() => {
    try {
      return new URL(rawUrl).hostname.toLowerCase()
    } catch {
      return ''
    }
  })()
  // SharePoint/OneDrive often forbids direct iframe embedding (X-Frame-Options/CSP).
  // Workaround: try fetching bytes and display a local blob URL in the modal.
  // If that fails (CORS/auth), fall back to a new tab.
  if (host.endsWith('sharepoint.com') || host.endsWith('onedrive.live.com')) {
    if (await tryOpenPdfAsBlob(rawUrl, title)) return
    window.open(rawUrl, '_blank', 'noopener,noreferrer')
    return
  }
  pdfModalUrl.value = rawUrl
  pdfModalTitle.value = title
  pdfModalOpen.value = true
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
  <div class="dashboard-view">
    <div v-if="loading" class="dashboard-loading">
      <i class="bi bi-arrow-repeat spin"></i>
      <I18nText k="dashboard.loading" />
    </div>
    <div v-else-if="error" class="dashboard-error">
      <i class="bi bi-exclamation-circle"></i>
      {{ error }}
    </div>
    <template v-else>
      <header class="dashboard-header">
        <h1 class="dashboard-title"><I18nText k="dashboard.cockpitTitle" /></h1>
        <p class="dashboard-subtitle"><I18nText k="dashboard.cockpitSubtitle" /></p>
      </header>

      <div class="dashboard-grid">
        <!-- Section: Register new team / class -->
        <section class="dashboard-card dashboard-card-register">
          <h2 class="dashboard-card-title">
            <i class="bi bi-plus-circle"></i>
            <I18nText k="dashboard.registerNew" />
          </h2>
          <p class="dashboard-card-desc"><I18nText k="dashboard.intro" /></p>
          <div class="dashboard-register-actions">
            <button type="button" class="dashboard-cta" @click="openWizard" :title="t('wizard.ctaButton')">
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
        <section class="dashboard-card dashboard-card-tasks">
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
        <section class="dashboard-card dashboard-card-documents">
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
            <DocumentsFolderTree
              v-if="hasDocumentTreeContent"
              :node="documentsFolderRoot"
              :depth="0"
              @open-pdf="openDocumentsPdf"
            />
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

        <!-- Section: Upcoming events (mock – replace with API later) -->
        <section class="dashboard-card dashboard-card-events">
          <h2 class="dashboard-card-title">
            <i class="bi bi-calendar-event"></i>
            <I18nText k="dashboard.upcomingEvents" />
          </h2>
          <ul class="dashboard-events-list">
            <li v-for="(ev, idx) in upcomingEvents" :key="idx" class="dashboard-event-item">
              <span class="dashboard-event-title"><I18nText :k="ev.titleKey" /></span>
              <span class="dashboard-event-meta">
                <I18nText :k="ev.dateKey" /> · <I18nText :k="ev.locationKey" />
              </span>
            </li>
          </ul>
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
              <DocumentsFolderTree
                v-if="hasDocumentTreeContent"
                :node="documentsFolderRoot"
                :depth="0"
                @open-pdf="openDocumentsPdf"
              />
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
            <template v-if="teams.length === 0">
              <p class="co-coach-modal-text"><I18nText k="dashboard.addCoCoachNoTeams" /></p>
            </template>
            <template v-else>
              <p class="co-coach-modal-text"><I18nText k="dashboard.addCoCoachModalLead" /></p>
              <label v-if="teams.length > 1" class="co-coach-modal-label">
                <span><I18nText k="dashboard.addCoCoachChooseTeam" /></span>
                <select v-model="selectedTeamId" class="co-coach-modal-select">
                  <option v-for="tm in teams" :key="tm.id" :value="String(tm.id)">
                    {{ teamSelectLabel(tm) }}
                  </option>
                </select>
              </label>
              <p class="co-coach-modal-note"><I18nText k="dashboard.addCoCoachModalNote" /></p>
            </template>
          </div>
          <footer class="co-coach-modal-foot">
            <button type="button" class="co-coach-modal-btn co-coach-modal-btn-ghost" @click="closeCoCoachModal">
              <I18nText k="dashboard.addCoCoachClose" />
            </button>
            <button
              v-if="teams.length > 0"
              type="button"
              class="co-coach-modal-btn co-coach-modal-btn-primary"
              :disabled="!selectedTeamId"
              @click="goToCoCoachTeamPage"
            >
              <I18nText k="dashboard.addCoCoachGo" />
            </button>
          </footer>
        </div>
      </div>
    </Teleport>

    <EnrollWizard :open="wizardOpen" @close="onWizardClose" @success="onWizardSuccess" />
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
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 1.25rem 1.5rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
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

/* Tasks */
.dashboard-card-tasks {
  border-left: 3px solid #b45309;
}

.dashboard-card-documents {
  grid-column: 1 / -1;
  border-left: 3px solid #2563eb;
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
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}
.dashboard-documents-modal {
  width: min(100%, 44rem);
  max-height: min(88vh, 780px);
  overflow: auto;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
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
  background: var(--color-bg-elevated);
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
  padding: 0.6rem 0.75rem;
  border: none;
  border-radius: var(--radius);
  background: var(--color-bg);
  font-family: inherit;
  font-size: 0.9375rem;
  color: var(--color-text);
  cursor: pointer;
  text-align: left;
  transition: background 0.15s;
}

.dashboard-task-item:hover {
  background: rgba(180, 83, 9, 0.08);
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

/* Register CTA */
.dashboard-card-register {
  border-left: 3px solid var(--color-accent);
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

.dashboard-cta:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(37, 99, 235, 0.4);
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
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  box-sizing: border-box;
}

.co-coach-modal-dialog {
  width: 100%;
  max-width: 26rem;
  max-height: min(90vh, 520px);
  overflow: auto;
  background: var(--color-bg-elevated);
  color: var(--color-text);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
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

.co-coach-modal-select {
  width: 100%;
  padding: 0.5rem 0.65rem;
  font-size: var(--text-sm);
  border-radius: var(--radius);
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  color: var(--color-text);
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

/* Upcoming events */
.dashboard-card-events {
  grid-column: 1 / -1;
  border-left: 3px solid #0d9488;
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
  background: var(--color-bg);
  border-radius: var(--radius);
  border: 1px solid var(--color-border);
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
