<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { getClass } from '@/services/draht'
import TeklaTimeline from '@/components/TeklaTimeline.vue'

const route = useRoute()
const { t, locale } = useI18n()
const cls = ref(null)
const loading = ref(true)
const error = ref(null)

const id = computed(() => route.params.id)

const timelineSteps = computed(() => {
  const t = cls.value?.timeline
  if (!t) return []
  return Array.isArray(t.timeline) ? t.timeline : (Array.isArray(t) ? t : [])
})

function statusLabel(obj) {
  if (!obj || typeof obj !== 'object') return ''
  return locale.value === 'de' ? (obj.de || obj.en) : (obj.en || obj.de)
}

function formatAddress(addr) {
  if (!addr) return ''
  const parts = [
    addr.name,
    [addr.street, addr.number].filter(Boolean).join(' '),
    addr.line2,
    addr.line3,
    [addr.zip, addr.town].filter(Boolean).join(' '),
    addr.country,
  ].filter(Boolean)
  return parts.join(', ')
}

function formatDate(timestamp) {
  if (!timestamp) return ''
  const d = new Date(typeof timestamp === 'number' ? timestamp * 1000 : timestamp)
  return d.toLocaleDateString(locale.value === 'de' ? 'de-DE' : 'en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

async function fetchClass() {
  if (!id.value) return
  loading.value = true
  error.value = null
  cls.value = null
  try {
    const res = await getClass(id.value)
    cls.value = res.data
  } catch (e) {
    error.value = e.response?.status === 404 ? t('detail.notFound') : (e.message || t('errors.loadFailed'))
  } finally {
    loading.value = false
  }
}

onMounted(fetchClass)
watch(id, fetchClass)
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
    </div>
    <template v-else-if="cls">
      <!-- 1) Name of tekla + number -->
      <div class="detail-header">
        <div class="detail-icon detail-icon-class">
          <i class="bi bi-mortarboard-fill"></i>
        </div>
        <div class="detail-heading">
          <h2 class="detail-title">{{ cls.label || cls.name || cls.ref }}</h2>
          <p v-if="cls.ref" class="detail-ref">{{ cls.ref }}</p>
        </div>
      </div>

      <!-- 2) Timeline -->
      <TeklaTimeline
        v-if="timelineSteps.length"
        :steps="timelineSteps"
        :locale="locale"
        tekla-type="classes"
        :tekla-id="cls.id"
        class="detail-timeline-first"
      />

      <div class="detail-overview">
      <!-- 3) Coach infos (all fields, placeholder when missing) -->
      <section class="detail-section">
        <dl class="detail-meta">
          <dt>{{ t('detail.coach') }}</dt>
          <dd>
            <template v-if="cls.coach">
              {{ cls.coach.name || [cls.coach.firstname, cls.coach.lastname].filter(Boolean).join(' ') || t('detail.noData') }}
              <span v-if="cls.coach.email" class="detail-meta-extra">{{ cls.coach.email }}</span>
            </template>
            <template v-else>{{ t('detail.noData') }}</template>
          </dd>
          <dt>{{ t('enroll.organization') }}</dt>
          <dd>{{ (cls.organization && cls.organization.name) || t('detail.noData') }}</dd>
          <dt>{{ t('detail.event') }}</dt>
          <dd>{{ (cls.event && (cls.event.label || cls.event.ref)) || t('detail.noData') }}</dd>
          <dt>{{ t('detail.ort') }}</dt>
          <dd>{{ cls.ort || t('detail.noData') }}</dd>
          <dt>{{ t('detail.institution') }}</dt>
          <dd>{{ cls.institution || t('detail.noData') }}</dd>
        </dl>
      </section>

      <!-- 4) Invoice + shipping address (always both, placeholder when missing) -->
      <section class="detail-section">
        <h3 class="detail-section-title">{{ t('enroll.invoiceAddress') }} / {{ t('enroll.deliveryAddress') }}</h3>
        <p class="detail-address-label">{{ t('detail.billingAddress') }}</p>
        <p class="detail-address">{{ (cls.overview && cls.overview.billing_address && formatAddress(cls.overview.billing_address)) || t('detail.noData') }}</p>
        <p class="detail-address-label">{{ t('detail.deliveryAddress') }}</p>
        <p class="detail-address">{{ (cls.overview && cls.overview.delivery_address && formatAddress(cls.overview.delivery_address)) || t('detail.noData') }}</p>
      </section>

      <!-- 5) Note (always shown, placeholder when missing) -->
      <section class="detail-section">
        <h3 class="detail-section-title">{{ t('detail.note') }}</h3>
        <p class="detail-notes">{{ cls.note_public || t('detail.noData') }}</p>
      </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.detail-view {
  max-width: 42rem;
}
.detail-overview {
  display: grid;
  gap: 1.5rem 2rem;
}
.detail-loading,
.detail-error {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--color-text-muted);
}
.detail-error {
  color: var(--color-error, #dc2626);
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
.detail-icon-class {
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
.detail-section {
  margin-bottom: 1.5rem;
  padding: 1rem 0;
  border-top: 1px solid var(--color-border);
}
.detail-section-title {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  margin: 0 0 0.75rem;
}
.detail-meta {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.35rem 1.5rem;
  margin: 0;
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
.detail-meta-extra {
  display: block;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  margin-top: 0.15rem;
}
.detail-address-label {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-muted);
  margin: 0 0 0.25rem;
}
.detail-address {
  font-size: var(--text-base);
  color: var(--color-text);
  margin: 0 0 0.75rem;
  white-space: pre-line;
}
.detail-address:last-child {
  margin-bottom: 0;
}
.detail-notes {
  font-size: var(--text-base);
  color: var(--color-text-muted);
  margin: 1rem 0 0;
  padding-top: 1rem;
  border-top: 1px solid var(--color-border);
}

@media (min-width: 960px) {
  .detail-view {
    max-width: 78rem;
  }
  .detail-overview {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
