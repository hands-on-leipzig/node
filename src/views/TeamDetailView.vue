<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { getTeam } from '@/services/draht'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const team = ref(null)
const loading = ref(true)
const error = ref(null)

const id = computed(() => route.params.id)

onMounted(async () => {
  if (!id.value) return
  try {
    const res = await getTeam(id.value)
    team.value = res.data
  } catch (e) {
    error.value = e.response?.status === 404 ? t('detail.notFound') : (e.message || t('errors.loadFailed'))
  } finally {
    loading.value = false
  }
})

function back() {
  router.push({ name: 'dashboard' })
}
</script>

<template>
  <div class="detail-view">
    <div v-if="loading" class="detail-loading">
      <i class="bi bi-arrow-repeat spin"></i>
      {{ t('dashboard.loading') }}
    </div>
    <div v-else-if="error" class="detail-error">
      <i class="bi bi-exclamation-circle"></i>
      {{ error }}
      <button type="button" class="btn btn-ghost" @click="back">
        <i class="bi bi-arrow-left"></i>
        {{ t('detail.backToDashboard') }}
      </button>
    </div>
    <template v-else-if="team">
      <div class="detail-header">
        <div class="detail-icon detail-icon-team">
          <i class="bi bi-person-fill"></i>
        </div>
        <div class="detail-heading">
          <h2 class="detail-title">{{ team.label || team.name || team.ref }}</h2>
          <p v-if="team.ref" class="detail-ref">{{ team.ref }}</p>
        </div>
      </div>
      <dl class="detail-meta">
        <template v-if="team.thirdparty?.name || team.organization">
          <dt>{{ t('enroll.organization') }}</dt>
          <dd>{{ team.thirdparty?.name || team.organization }}</dd>
        </template>
      </dl>
      <div class="detail-actions">
        <button type="button" class="btn btn-ghost" @click="back">
          <i class="bi bi-arrow-left"></i>
          {{ t('detail.backToDashboard') }}
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.detail-view {
  max-width: 36rem;
}
.detail-loading,
.detail-error {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1rem;
  color: var(--color-text-muted);
}
.detail-error {
  color: var(--color-error, #dc2626);
}
.detail-error .btn {
  margin-top: 0.5rem;
}
.spin {
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
.detail-header {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 1.5rem;
}
.detail-icon {
  width: 3rem;
  height: 3rem;
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  flex-shrink: 0;
}
.detail-icon-team {
  background: var(--color-accent-soft);
  color: var(--color-accent);
}
.detail-heading {
  min-width: 0;
}
.detail-title {
  font-size: var(--text-2xl);
  font-weight: 600;
  color: var(--color-text);
  margin: 0 0 0.25rem;
}
.detail-ref {
  font-size: var(--text-base);
  color: var(--color-text-muted);
  margin: 0;
}
.detail-meta {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.25rem 1.5rem;
  margin-bottom: 1.5rem;
}
.detail-meta dt {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  margin: 0;
}
.detail-meta dd {
  font-size: var(--text-base);
  color: var(--color-text);
  margin: 0;
}
.detail-actions {
  padding-top: 1rem;
  border-top: 1px solid var(--color-border);
}
</style>
