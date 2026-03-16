<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { listTeams, listClasses } from '@/services/draht'
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

/** Only teams that need an action from the coach. */
const teamsWithActions = computed(() => teams.value.filter((t) => getTeamAction(t)))
/** Only classes that need an action. */
const classesWithActions = computed(() => classes.value.filter((c) => getClassAction(c)))
const taskItems = computed(() => {
  const items = []
  teamsWithActions.value.forEach((team) => {
    const action = getTeamAction(team)
    if (action) items.push({ type: 'team', id: team.id, name: team.label || team.name || team.ref || '#' + team.id, ref: team.ref, action })
  })
  classesWithActions.value.forEach((cls) => {
    const action = getClassAction(cls)
    if (action) items.push({ type: 'class', id: cls.id, name: cls.label || cls.name || cls.ref || '#' + cls.id, ref: cls.ref, action })
  })
  return items
})

/** Mock upcoming events – replace with API feed later. */
const upcomingEvents = ref([
  { titleKey: 'dashboard.mockEventStammtisch', dateKey: 'dashboard.mockEventStammtischDate', locationKey: 'dashboard.mockEventStammtischLocation' },
  { titleKey: 'dashboard.mockEventRegional', dateKey: 'dashboard.mockEventRegionalDate', locationKey: 'dashboard.mockEventRegionalLocation' },
  { titleKey: 'dashboard.mockEventLandesfinale', dateKey: 'dashboard.mockEventLandesfinaleDate', locationKey: 'dashboard.mockEventLandesfinaleLocation' },
])

/** Derive coach action for a team (e.g. pay invoice). Returns { label, icon } or null. */
function getTeamAction(team) {
  if (!team) return null
  // Explicit flags from API
  if (team.invoice_pending === true || team.action_required === 'invoice') {
    return { label: t('dashboard.payInvoice'), icon: 'bi-receipt' }
  }
  const billing = (team.status_billing || team.billing_status || '').toLowerCase()
  if (billing === 'unpaid' || billing === 'pending' || billing === 'open') {
    return { label: t('dashboard.payInvoice'), icon: 'bi-receipt' }
  }
  if (team.action_required) {
    const msg = typeof team.action_required === 'string' ? team.action_required : t('dashboard.actionRequired')
    return { label: msg, icon: 'bi-exclamation-circle' }
  }
  // Timeline: step with status progress/warn that suggests invoice
  const steps = team.timeline?.timeline ?? team.timeline
  const arr = Array.isArray(steps) ? steps : []
  for (const step of arr) {
    if (step.status === 'warn' || step.status === 'progress') {
      const sub = (step.de_sub || step.en_sub || '').toLowerCase()
      if (sub.includes('rechnung') || sub.includes('invoice')) {
        return { label: t('dashboard.payInvoice'), icon: 'bi-receipt' }
      }
      return { label: t('dashboard.actionRequired'), icon: 'bi-exclamation-circle' }
    }
  }
  return null
}

/** Same for class if needed later. */
function getClassAction(cls) {
  if (!cls) return null
  if (cls.invoice_pending === true || cls.action_required === 'invoice') {
    return { label: t('dashboard.payInvoice'), icon: 'bi-receipt' }
  }
  const billing = (cls.status_billing || cls.billing_status || '').toLowerCase()
  if (billing === 'unpaid' || billing === 'pending' || billing === 'open') {
    return { label: t('dashboard.payInvoice'), icon: 'bi-receipt' }
  }
  if (cls.action_required) {
    return { label: typeof cls.action_required === 'string' ? cls.action_required : t('dashboard.actionRequired'), icon: 'bi-exclamation-circle' }
  }
  const steps = cls.timeline?.timeline ?? cls.timeline
  const arr = Array.isArray(steps) ? steps : []
  for (const step of arr) {
    if (step.status === 'warn' || step.status === 'progress') {
      const sub = (step.de_sub || step.en_sub || '').toLowerCase()
      if (sub.includes('rechnung') || sub.includes('invoice')) {
        return { label: t('dashboard.payInvoice'), icon: 'bi-receipt' }
      }
      return { label: t('dashboard.actionRequired'), icon: 'bi-exclamation-circle' }
    }
  }
  return null
}

async function loadLists() {
  loading.value = true
  error.value = null
  try {
    const [teamsRes, classesRes] = await Promise.allSettled([
      listTeams(),
      listClasses(),
    ])
    if (teamsRes.status === 'fulfilled' && teamsRes.value?.data != null) {
      const d = teamsRes.value.data
      teams.value = Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : [])
    } else {
      teams.value = []
    }
    if (classesRes.status === 'fulfilled' && classesRes.value?.data != null) {
      const d = classesRes.value.data
      classes.value = Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : [])
    } else {
      classes.value = []
    }
  } catch (e) {
    error.value = e.message || t('errors.loadFailed')
  } finally {
    loading.value = false
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

onMounted(loadLists)
</script>

<template>
  <div class="dashboard-view">
    <div v-if="loading" class="dashboard-loading">
      <i class="bi bi-arrow-repeat spin"></i>
      {{ t('dashboard.loading') }}
    </div>
    <div v-else-if="error" class="dashboard-error">
      <i class="bi bi-exclamation-circle"></i>
      {{ error }}
    </div>
    <template v-else>
      <header class="dashboard-header">
        <h1 class="dashboard-title">{{ t('dashboard.cockpitTitle') }}</h1>
        <p class="dashboard-subtitle">{{ t('dashboard.cockpitSubtitle') }}</p>
      </header>

      <div class="dashboard-grid">
        <!-- Section: Tasks to do (only teams/classes with action required) -->
        <section class="dashboard-card dashboard-card-tasks">
          <h2 class="dashboard-card-title">
            <i class="bi bi-list-check"></i>
            {{ t('dashboard.tasksToDo') }}
            <span v-if="taskItems.length" class="dashboard-card-badge">{{ taskItems.length }}</span>
          </h2>
          <div v-if="taskItems.length" class="dashboard-tasks-list">
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
            {{ t('dashboard.noPendingTasks') }}
          </p>
        </section>

        <!-- Section: Register new team / class -->
        <section class="dashboard-card dashboard-card-register">
          <h2 class="dashboard-card-title">
            <i class="bi bi-plus-circle"></i>
            {{ t('dashboard.registerNew') }}
          </h2>
          <p class="dashboard-card-desc">{{ t('dashboard.intro') }}</p>
          <button type="button" class="dashboard-cta" @click="openWizard" :title="t('wizard.ctaButton')">
            <i class="bi bi-magic"></i>
            <span>{{ t('wizard.ctaButton') }}</span>
          </button>
        </section>

        <!-- Section: Upcoming events (mock – replace with API later) -->
        <section class="dashboard-card dashboard-card-events">
          <h2 class="dashboard-card-title">
            <i class="bi bi-calendar-event"></i>
            {{ t('dashboard.upcomingEvents') }}
          </h2>
          <ul class="dashboard-events-list">
            <li v-for="(ev, idx) in upcomingEvents" :key="idx" class="dashboard-event-item">
              <span class="dashboard-event-title">{{ t(ev.titleKey) }}</span>
              <span class="dashboard-event-meta">{{ t(ev.dateKey) }} · {{ t(ev.locationKey) }}</span>
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
