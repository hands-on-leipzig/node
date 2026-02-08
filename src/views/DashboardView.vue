<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { listTeams, listClasses } from '@/services/draht'
import { ENROLLMENT_OPTIONS, EDITION_FOUNDERS, EDITION_FUTURE } from '@/config/enrollmentOptions'
import EnrollWizard from '@/components/EnrollWizard.vue'
import fllExploreLogo from '@/assets/fll_explore_v.png'
import fllChallengeLogo from '@/assets/fll_challenge_v.png'
import firstFllLogo from '@/assets/first+fll_v.png'

const router = useRouter()
const { t } = useI18n()

const wizardOpen = ref(false)
function openWizard() {
  wizardOpen.value = true
}
function onWizardClose() {
  wizardOpen.value = false
}
function onWizardSuccess() {
  // Optional: refresh counts
  listTeams().then((r) => {
    const d = r.data
    const arr = Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : [])
    teamsCount.value = arr.length
  })
  listClasses().then((r) => {
    const d = r.data
    const arr = Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : [])
    classesCount.value = arr.length
  })
}

function foundersCardLogo(opt) {
  return opt.program === 1 || opt.program === 4 ? fllExploreLogo : fllChallengeLogo
}

const foundersOptions = computed(() => ENROLLMENT_OPTIONS.filter(o => o.edition === EDITION_FOUNDERS))
const futureOptions = computed(() => ENROLLMENT_OPTIONS.filter(o => o.edition === EDITION_FUTURE))

function goEnroll(option) {
  if (option.type === 'future') {
    router.push({ name: 'enroll-future', query: { group: option.group } })
    return
  }
  const name = option.type === 'team' ? 'enroll-team' : 'enroll-class'
  router.push({ name, query: { program: option.program } })
}

const teamsCount = ref(0)
const classesCount = ref(0)
const loading = ref(true)
const error = ref(null)

onMounted(async () => {
  try {
    const [teamsRes, classesRes] = await Promise.allSettled([
      listTeams(),
      listClasses(),
    ])
    if (teamsRes.status === 'fulfilled' && teamsRes.value?.data) {
      const d = teamsRes.value.data
      const arr = Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : [])
      teamsCount.value = arr.length
    }
    if (classesRes.status === 'fulfilled' && classesRes.value?.data) {
      const d = classesRes.value.data
      const arr = Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : [])
      classesCount.value = arr.length
    }
  } catch (e) {
    error.value = e.message || t('errors.loadFailed')
  } finally {
    loading.value = false
  }
})
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
    <div v-else class="dashboard-boxes">
      <div class="dashboard-box">
        <span class="dashboard-box-value">{{ teamsCount }}</span>
        <span class="dashboard-box-label">{{ t('dashboard.registeredTeams') }}</span>
      </div>
      <div class="dashboard-box">
        <span class="dashboard-box-value">{{ classesCount }}</span>
        <span class="dashboard-box-label">{{ t('dashboard.registeredClasses') }}</span>
      </div>
    </div>

    <p class="dashboard-intro">{{ t('dashboard.intro') }}</p>

    <div class="dashboard-wizard-row">
      <button type="button" class="wizard-trigger" @click="openWizard" :title="t('wizard.ctaButton')">
        <i class="bi bi-magic"></i>
        <span>{{ t('wizard.ctaButton') }}</span>
      </button>
    </div>

    <div class="dashboard-sections">
      <section class="dashboard-section">
        <h2 class="dashboard-section-title">{{ t('dashboard.editionFuture') }}</h2>
        <div class="dashboard-cards">
          <button
            v-for="opt in futureOptions"
            :key="'future-' + opt.group"
            type="button"
            class="dashboard-card card-future"
            @click="goEnroll(opt)"
          >
            <div class="dashboard-card-left">
              <div class="dashboard-card-icon">
                <i class="bi bi-stars"></i>
              </div>
              <span class="dashboard-card-label">{{ t(opt.labelKey) }}</span>
              <span class="dashboard-card-cta">{{ t('dashboard.optionCta') }}</span>
            </div>
            <div class="dashboard-card-logo">
              <img :src="firstFllLogo" :alt="t(opt.labelKey)" class="card-logo" />
            </div>
          </button>
        </div>
      </section>
      <section class="dashboard-section">
        <h2 class="dashboard-section-title">{{ t('dashboard.editionFounders') }}</h2>
        <div class="dashboard-cards">
          <button
            v-for="opt in foundersOptions"
            :key="opt.edition + '-' + opt.type + '-' + opt.program"
            type="button"
            class="dashboard-card"
            :class="{ 'card-team': opt.type === 'team', 'card-class': opt.type === 'class' }"
            @click="goEnroll(opt)"
          >
            <div class="dashboard-card-left">
              <div class="dashboard-card-icon">
                <i class="bi" :class="opt.type === 'team' ? 'bi-people-fill' : 'bi-mortarboard-fill'"></i>
              </div>
              <span class="dashboard-card-label">{{ t(opt.labelKey) }}</span>
              <span class="dashboard-card-cta">{{ t('dashboard.optionCta') }}</span>
            </div>
            <div class="dashboard-card-logo">
              <img :src="foundersCardLogo(opt)" :alt="t(opt.labelKey)" class="card-logo" />
            </div>
          </button>
        </div>
      </section>
    </div>

    <EnrollWizard :open="wizardOpen" @close="onWizardClose" @success="onWizardSuccess" />
  </div>
</template>

<style scoped>
.dashboard-view {
  width: 100%;
  max-width: 40rem;
  margin-left: auto;
  margin-right: auto;
}

.dashboard-loading,
.dashboard-error {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-height: 12rem;
  font-size: 1.25rem;
  color: var(--color-text-muted);
}

.dashboard-error {
  color: var(--color-error, #dc2626);
}

.dashboard-boxes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
}

.dashboard-box {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 2.5rem 2rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 14rem;
  box-shadow: var(--shadow-sm);
}

.dashboard-box-value {
  font-size: 4rem;
  font-weight: 700;
  line-height: 1;
  color: var(--color-text);
  letter-spacing: -0.02em;
}

.dashboard-box-label {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--color-text-muted);
  margin-top: 0.75rem;
  text-align: center;
}

.dashboard-intro {
  margin-top: 2rem;
  font-size: var(--text-base);
  color: var(--color-text-muted);
  line-height: 1.5;
}

.dashboard-wizard-row {
  margin-top: 1rem;
}

.wizard-trigger {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text-muted);
  background: transparent;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius);
  cursor: pointer;
  font-family: inherit;
  transition: border-color 0.2s, color 0.2s;
}

.wizard-trigger:hover {
  color: var(--color-accent);
  border-color: var(--color-accent);
}

.wizard-trigger .bi {
  font-size: 1rem;
}

.dashboard-sections {
  margin-top: 1.5rem;
}

.dashboard-section {
  margin-bottom: 2rem;
}

.dashboard-section:last-child {
  margin-bottom: 0;
}

.dashboard-section-title {
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--color-text);
  margin: 0 0 1rem;
  padding-bottom: 0.35rem;
  border-bottom: 1px solid var(--color-border);
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.dashboard-cards {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
}

.dashboard-card {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 1.25rem;
  text-align: left;
  cursor: pointer;
  font-family: inherit;
  width: 100%;
  box-shadow: var(--shadow-sm);
  transition: border-color 0.2s, box-shadow 0.2s, transform 0.2s;
  display: flex;
  flex-direction: row;
  align-items: stretch;
  min-height: 5.5rem;
  gap: 1rem;
}
.dashboard-card-left {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.dashboard-card:hover {
  border-color: var(--color-accent);
  box-shadow: var(--shadow);
  transform: translateY(-2px);
}

.dashboard-card:active {
  transform: translateY(0);
}

.dashboard-card-icon {
  width: 2rem;
  height: 2rem;
  border-radius: var(--radius);
  background: var(--color-accent-soft);
  color: var(--color-accent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  margin-bottom: 0.5rem;
}

.dashboard-card.card-team .dashboard-card-icon {
  background: rgba(59, 130, 246, 0.15);
  color: #3b82f6;
}

.dashboard-card.card-class .dashboard-card-icon {
  background: rgba(168, 85, 247, 0.15);
  color: #a855f7;
}

.dashboard-card.card-future .dashboard-card-icon {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}

.dashboard-card-logo {
  flex-shrink: 0;
  align-self: stretch;
  display: flex;
  align-items: center;
  justify-content: center;
  padding-left: 0.5rem;
  border-left: 1px solid var(--color-border);
}

.dashboard-card-logo .card-logo {
  height: 100%;
  width: auto;
  max-width: 5rem;
  object-fit: contain;
}

.dashboard-card-label {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 0.25rem;
}

.dashboard-card-cta {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-accent);
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  margin-top: auto;
}

@media (max-width: 420px) {
  .dashboard-boxes {
    grid-template-columns: 1fr;
  }
  .dashboard-box-value {
    font-size: 3.25rem;
  }
  .dashboard-cards {
    grid-template-columns: 1fr;
  }
}
</style>
