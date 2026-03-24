<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { RouterLink } from 'vue-router'
import { listTeams, listClasses, getOpenTasks } from '@/services/draht'
import { fetchDocumentsConfig } from '@/services/documentsConfig'
import { hasAdminRole } from '@/auth/keycloak'
import EnrollWizard from '@/components/EnrollWizard.vue'

const { t } = useI18n()
const router = useRouter()

const wizardOpen = ref(false)
function openWizard() {
  wizardOpen.value = true
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
const documentsLoading = ref(true)

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
  documentsLoading.value = true
  try {
    documentsConfig.value = await fetchDocumentsConfig()
  } finally {
    documentsLoading.value = false
  }
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

        <!-- Section: Register new team / class -->
        <section class="dashboard-card dashboard-card-register">
          <h2 class="dashboard-card-title">
            <i class="bi bi-plus-circle"></i>
            <I18nText k="dashboard.registerNew" />
          </h2>
          <p class="dashboard-card-desc"><I18nText k="dashboard.intro" /></p>
          <button type="button" class="dashboard-cta" @click="openWizard" :title="t('wizard.ctaButton')">
            <i class="bi bi-magic"></i>
            <span><I18nText k="wizard.ctaButton" /></span>
          </button>
        </section>

        <!-- Documents for download (SharePoint / shared folder) — always visible -->
        <section class="dashboard-card dashboard-card-documents">
          <h2 class="dashboard-card-title">
            <i class="bi bi-cloud-arrow-down"></i>
            <template v-if="documentsConfig.title">{{ documentsConfig.title }}</template>
            <I18nText v-else k="dashboard.documentsForDownload" />
          </h2>
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
            <ul
              v-if="documentsConfig.files?.length"
              class="dashboard-documents-file-list"
            >
              <li v-for="(f, i) in documentsConfig.files" :key="i">
                <a
                  :href="f.url"
                  class="dashboard-documents-file-link"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <i class="bi bi-file-earmark-arrow-down"></i>
                  <span>{{ f.name }}</span>
                </a>
              </li>
            </ul>
            <a
              v-if="documentsConfig.folderUrl"
              :href="documentsConfig.folderUrl"
              class="dashboard-documents-link"
              :class="{ 'dashboard-documents-link-after-list': documentsConfig.files?.length }"
              target="_blank"
              rel="noopener noreferrer"
            >
              <i class="bi bi-folder2-open"></i>
              <I18nText k="dashboard.openDocumentsFolder" />
            </a>
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

    <EnrollWizard :open="wizardOpen" @close="onWizardClose" @success="onWizardSuccess" />
  </div>
</template>

<style scoped>
.dashboard-view {
  width: 100%;
  max-width: 56rem;
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
.dashboard-documents-file-list {
  list-style: none;
  margin: 0 0 1rem;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.dashboard-documents-file-link {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.65rem;
  font-size: var(--text-sm);
  color: var(--color-text);
  background: var(--color-bg-muted);
  border-radius: var(--radius);
  text-decoration: none;
  border: 1px solid var(--color-border);
  transition: border-color 0.15s, background 0.15s;
}
.dashboard-documents-file-link:hover {
  border-color: var(--color-accent);
  background: var(--color-bg);
  color: var(--color-accent);
}
.dashboard-documents-file-link .bi {
  flex-shrink: 0;
  color: var(--color-accent);
}
.dashboard-documents-link-after-list {
  margin-top: 0.25rem;
  background: var(--color-bg-muted);
  color: var(--color-accent);
  border: 1px solid var(--color-border);
}
.dashboard-documents-link-after-list:hover {
  opacity: 1;
  background: var(--color-bg);
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
  .dashboard-title {
    font-size: 1.5rem;
  }
}
</style>
