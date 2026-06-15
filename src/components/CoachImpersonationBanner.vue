<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  getImpersonatedCoachId,
  getImpersonatedCoachLabel,
  isCoachImpersonationActive,
} from '@/utils/coachImpersonation'
import { getNodeCoachMe } from '@/services/draht'

const { t } = useI18n()

const active = computed(() => isCoachImpersonationActive())
const coachId = computed(() => getImpersonatedCoachId())
const storedLabel = computed(() => getImpersonatedCoachLabel())
const resolvedLabel = ref('')

const displayLabel = computed(() => {
  const fromApi = resolvedLabel.value.trim()
  if (fromApi) return fromApi
  const stored = storedLabel.value.trim()
  if (stored) return stored
  const id = coachId.value
  return id != null ? `#${id}` : ''
})

async function loadCoachLabel() {
  resolvedLabel.value = ''
  if (!active.value) return
  try {
    const res = await getNodeCoachMe()
    const d = res?.data?.data ?? res?.data ?? {}
    const name = [d.firstname, d.lastname].filter(Boolean).join(' ').trim()
    resolvedLabel.value = name || String(d.email || '').trim()
  } catch {
    /* keep stored label / id fallback */
  }
}

watch(active, (on) => {
  if (on) void loadCoachLabel()
}, { immediate: true })
</script>

<template>
  <div v-if="active" class="coach-impersonation-banner" role="status">
    <i class="bi bi-eye-fill coach-impersonation-banner-icon" aria-hidden="true"></i>
    <p class="coach-impersonation-banner-text">
      {{ t('admin.viewAsCoachBanner', { name: displayLabel }) }}
    </p>
  </div>
</template>

<style scoped>
.coach-impersonation-banner {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  margin-bottom: 1rem;
  padding: 0.75rem 1rem;
  border-radius: var(--radius-lg, 12px);
  border: 1px solid color-mix(in srgb, var(--color-warning, #e6a700) 45%, transparent);
  background: color-mix(in srgb, var(--color-warning, #e6a700) 12%, var(--surface-elevated, #fff));
  color: var(--text-primary, inherit);
}

.coach-impersonation-banner-icon {
  flex-shrink: 0;
  margin-top: 0.1rem;
  color: var(--color-warning, #c99200);
}

.coach-impersonation-banner-text {
  margin: 0;
  font-size: 0.92rem;
  line-height: 1.45;
}
</style>
