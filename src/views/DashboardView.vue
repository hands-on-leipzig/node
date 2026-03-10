<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { listTeams, listClasses } from '@/services/draht'
import EnrollWizard from '@/components/EnrollWizard.vue'

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
  padding: 1.1rem 1.5rem;
  font-size: 1.05rem;
  font-weight: 600;
  color: white;
  background: linear-gradient(120deg, #2563eb, #0ea5e9);
  border: none;
  border-radius: 999px;
  cursor: pointer;
  font-family: inherit;
  box-shadow: 0 16px 28px rgba(37, 99, 235, 0.3);
  transition: transform 0.2s, box-shadow 0.2s;
}

.wizard-trigger:hover {
  transform: translateY(-2px);
  box-shadow: 0 20px 32px rgba(37, 99, 235, 0.35);
}

.wizard-trigger .bi {
  font-size: 1.1rem;
}


@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 420px) {
  .dashboard-boxes {
    grid-template-columns: 1fr;
  }
  .dashboard-box-value {
    font-size: 3.25rem;
  }
}
</style>
