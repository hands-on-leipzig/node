<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { listTeams, listClasses } from '@/services/draht'

const router = useRouter()
const { t } = useI18n()
const teams = ref([])
const classes = ref([])
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
      teams.value = Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : [])
    }
    if (classesRes.status === 'fulfilled' && classesRes.value?.data) {
      const d = classesRes.value.data
      classes.value = Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : [])
    }
  } catch (e) {
    error.value = e.message || t('errors.loadFailed')
  } finally {
    loading.value = false
  }
})

function goEnrollTeam() {
  router.push({ name: 'enroll-team' })
}
function goEnrollClass() {
  router.push({ name: 'enroll-class' })
}
</script>

<template>
  <div class="dashboard-view">
    <!-- Enrollments overview – main focus -->
    <section class="overview">
      <h2 class="overview-title">
        <i class="bi bi-clipboard-check"></i>
        {{ t('dashboard.yourEnrollments') }}
      </h2>
      <div v-if="loading" class="overview-loading">
        <i class="bi bi-arrow-repeat spin"></i>
        {{ t('dashboard.loading') }}
      </div>
      <div v-else-if="error" class="overview-error">
        <i class="bi bi-exclamation-circle"></i>
        {{ error }}
      </div>
      <div v-else-if="teams.length === 0 && classes.length === 0" class="overview-empty">
        <p>{{ t('dashboard.noEnrollmentsYet') }}</p>
      </div>
      <div v-else class="overview-grid">
        <div v-if="teams.length" class="overview-block">
          <h3><i class="bi bi-people-fill"></i> {{ t('dashboard.teams') }}</h3>
          <ul class="overview-list">
            <li v-for="team in teams" :key="team.id || team.name" class="overview-item">
              <span class="overview-item-name">{{ team.name }}</span>
              <span v-if="team.organization" class="overview-item-meta">{{ team.organization }}</span>
            </li>
          </ul>
        </div>
        <div v-if="classes.length" class="overview-block">
          <h3><i class="bi bi-mortarboard-fill"></i> {{ t('dashboard.classes') }}</h3>
          <ul class="overview-list">
            <li v-for="cls in classes" :key="cls.id || cls.name" class="overview-item">
              <span class="overview-item-name">{{ cls.name }}</span>
              <span v-if="cls.organization" class="overview-item-meta">{{ cls.organization }}</span>
            </li>
          </ul>
        </div>
      </div>
    </section>

    <p class="intro">{{ t('dashboard.intro') }}</p>

    <div class="cards">
      <button type="button" class="card card-action" @click="goEnrollTeam">
        <div class="card-icon">
          <i class="bi bi-people-fill"></i>
        </div>
        <h2>{{ t('dashboard.enrollTeam') }}</h2>
        <p>{{ t('dashboard.enrollTeamDesc') }}</p>
        <span class="card-cta">
          {{ t('dashboard.enrollTeamCta') }}
          <i class="bi bi-arrow-right"></i>
        </span>
      </button>
      <button type="button" class="card card-action" @click="goEnrollClass">
        <div class="card-icon">
          <i class="bi bi-mortarboard-fill"></i>
        </div>
        <h2>{{ t('dashboard.enrollClass') }}</h2>
        <p>{{ t('dashboard.enrollClassDesc') }}</p>
        <span class="card-cta">
          {{ t('dashboard.enrollClassCta') }}
          <i class="bi bi-arrow-right"></i>
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.dashboard-view {
  max-width: 40rem;
  width: 100%;
}

/* Enrollments overview – top of dashboard */
.overview {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 1.5rem;
  margin-bottom: 1.5rem;
  box-shadow: var(--shadow-sm);
}
.overview-title {
  font-size: var(--text-xl);
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.overview-title .bi {
  font-size: 1.25rem;
  color: var(--color-accent);
}
.overview-loading,
.overview-error {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: var(--text-base);
  color: var(--color-text-muted);
}
.overview-error {
  color: #dc2626;
}
.overview-error .bi {
  flex-shrink: 0;
}
.overview-empty {
  color: var(--color-text-muted);
  font-size: var(--text-base);
}
.overview-empty p {
  margin: 0;
}
.overview-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
}
@media (max-width: 520px) {
  .overview-grid {
    grid-template-columns: 1fr;
  }
}
.overview-block h3 {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 0.75rem;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.overview-block h3 .bi {
  font-size: 1rem;
  color: var(--color-accent);
}
.overview-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.overview-item {
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.overview-item:last-child {
  border-bottom: none;
}
.overview-item-name {
  font-size: var(--text-base);
  font-weight: 500;
  color: var(--color-text);
}
.overview-item-meta {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.intro {
  font-size: var(--text-lg);
  color: var(--color-text-muted);
  margin-bottom: 1.25rem;
  line-height: 1.55;
}
.cards {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
}
.card {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 1.5rem;
  transition: border-color 0.2s, box-shadow 0.2s, transform 0.2s;
  min-height: 8rem;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
  cursor: pointer;
  font-family: inherit;
  width: 100%;
  box-shadow: var(--shadow-sm);
}
.card-action:hover {
  border-color: var(--color-accent);
  box-shadow: var(--shadow);
  transform: translateY(-2px);
}
.card-action:active {
  transform: translateY(0);
}
.card-icon {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: var(--radius);
  background: var(--color-accent-soft);
  color: var(--color-accent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  margin-bottom: 1rem;
}
.card h2 {
  font-size: var(--text-xl);
  font-weight: 600;
  margin-bottom: 0.25rem;
  color: var(--color-text);
}
.card p {
  font-size: var(--text-base);
  color: var(--color-text-muted);
  margin-bottom: 0.75rem;
  line-height: 1.45;
}
.card-cta {
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--color-accent);
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin-top: auto;
}
.card-cta .bi {
  font-size: 1rem;
  transition: transform 0.2s;
}
.card-action:hover .card-cta .bi {
  transform: translateX(4px);
}
.loading .spin {
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
@media (min-width: 480px) {
  .cards {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
