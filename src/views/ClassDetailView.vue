<script setup>
import { ref, onMounted, computed, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { getClass, updateClassVersandaufschub } from '@/services/draht'
import { formatOverviewAddress } from '@/utils/formatOverviewAddress'
import { timelineHasShipmentStep } from '@/utils/timeline'
import { useTeklaShipmentSchedule } from '@/composables/useTeklaShipmentSchedule'
import TeklaTimeline from '@/components/TeklaTimeline.vue'
import DetailEnrollmentBadges from '@/components/DetailEnrollmentBadges.vue'
import { DETAIL_EVENT_ACTIONS_ENABLED } from '@/config/detailEventActions'

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

const showShipmentSchedule = computed(() => timelineHasShipmentStep(timelineSteps.value))
const shipmentScheduleProp = useTeklaShipmentSchedule(cls, showShipmentSchedule)

async function saveVersandaufschub(dateStrOrNull) {
  if (!id.value) return
  try {
    const res = await updateClassVersandaufschub(id.value, { versandaufschub: dateStrOrNull })
    cls.value = res.data
  } catch (e) {
    console.error('[ClassDetail] versandaufschub save failed', e)
  }
}

function statusLabel(obj) {
  if (!obj || typeof obj !== 'object') return ''
  return locale.value === 'de' ? (obj.de || obj.en) : (obj.en || obj.de)
}

function formatAddress(addr) {
  return formatOverviewAddress(addr, locale.value)
}

function formatDate(timestamp) {
  if (!timestamp) return ''
  const d = new Date(typeof timestamp === 'number' ? timestamp * 1000 : timestamp)
  return d.toLocaleDateString(locale.value === 'de' ? 'de-DE' : 'en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function scrollToCoCoachesSection() {
  if (route.query.focus !== 'coCoaches' || loading.value || !cls.value) return
  nextTick(() => {
    document.getElementById('class-co-coaches-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
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
    if (cls.value) scrollToCoCoachesSection()
  }
}

onMounted(fetchClass)
watch(id, fetchClass)
watch(
  () => route.query.focus,
  () => {
    if (cls.value && route.query.focus === 'coCoaches') scrollToCoCoachesSection()
  }
)
</script>

<template>
  <div class="detail-view">
    <div v-if="loading" class="detail-loading">
      <i class="bi bi-arrow-repeat spin"></i>
      <I18nText k="dashboard.loading" />
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
          <DetailEnrollmentBadges :card="cls" />
        </div>
      </div>

      <!-- 2) Timeline -->
      <TeklaTimeline
        v-if="timelineSteps.length"
        :steps="timelineSteps"
        :locale="locale"
        tekla-type="classes"
        :tekla-id="cls.id"
        :shipment-schedule="shipmentScheduleProp"
        :versandaufschub="showShipmentSchedule ? (cls.versandaufschub ?? null) : undefined"
        class="detail-timeline-first"
        @versandaufschub-save="saveVersandaufschub"
      />

      <div class="detail-overview">
      <!-- 3) Coach infos (all fields, placeholder when missing) -->
      <section class="detail-section">
        <dl class="detail-meta">
          <dt><I18nText k="detail.coach" /></dt>
          <dd>
            <template v-if="cls.coach">
              <template
                v-if="cls.coach.name || [cls.coach.firstname, cls.coach.lastname].filter(Boolean).join(' ')"
              >
                {{ cls.coach.name || [cls.coach.firstname, cls.coach.lastname].filter(Boolean).join(' ') }}
              </template>
              <I18nText v-else k="detail.noData" />
              <span v-if="cls.coach.email" class="detail-meta-extra">{{ cls.coach.email }}</span>
            </template>
            <template v-else><I18nText k="detail.noData" /></template>
          </dd>
          <dt><I18nText k="enroll.organization" /></dt>
          <dd>
            <template v-if="cls.organization && cls.organization.name">{{ cls.organization.name }}</template>
            <I18nText v-else k="detail.noData" />
          </dd>
          <dt><I18nText k="detail.event" /></dt>
          <dd
            class="detail-meta-event"
            :class="{ 'detail-meta-event--disabled': !DETAIL_EVENT_ACTIONS_ENABLED }"
          >
            <div class="detail-meta-event-inner" :inert="!DETAIL_EVENT_ACTIONS_ENABLED">
              <template v-if="cls.event && (cls.event.label || cls.event.ref)">{{
                cls.event.label || cls.event.ref
              }}</template>
              <I18nText v-else k="detail.noData" />
            </div>
            <p v-if="!DETAIL_EVENT_ACTIONS_ENABLED" class="detail-section-disabled-hint">
              <I18nText k="detail.eventSectionComingSoon" />
            </p>
          </dd>
          <dt><I18nText k="detail.ort" /></dt>
          <dd>
            <template v-if="cls.ort">{{ cls.ort }}</template>
            <I18nText v-else k="detail.noData" />
          </dd>
          <dt><I18nText k="detail.institution" /></dt>
          <dd>
            <template v-if="cls.institution">{{ cls.institution }}</template>
            <I18nText v-else k="detail.noData" />
          </dd>
        </dl>
      </section>

      <!-- 4) Invoice + shipping address (always both, placeholder when missing) -->
      <section class="detail-section">
        <h3 class="detail-section-title"><I18nText k="wizard.stepAddresses" /></h3>
        <p class="detail-address-label"><I18nText k="detail.billingAddress" /></p>
        <p class="detail-address">
          <template
            v-if="cls.overview && cls.overview.billing_address && formatAddress(cls.overview.billing_address)"
          >
            {{ formatAddress(cls.overview.billing_address) }}
          </template>
          <I18nText v-else k="detail.noData" />
        </p>
        <p class="detail-address-label"><I18nText k="detail.deliveryAddress" /></p>
        <p class="detail-address">
          <template
            v-if="cls.overview && cls.overview.delivery_address && formatAddress(cls.overview.delivery_address)"
          >
            {{ formatAddress(cls.overview.delivery_address) }}
          </template>
          <I18nText v-else k="detail.noData" />
        </p>
      </section>

      <!-- 5) Note (always shown, placeholder when missing) -->
      <section class="detail-section">
        <h3 class="detail-section-title"><I18nText k="detail.note" /></h3>
        <p class="detail-notes">
          <template v-if="cls.note_public">{{ cls.note_public }}</template>
          <I18nText v-else k="detail.noData" />
        </p>
      </section>

      <section id="class-co-coaches-anchor" class="detail-section detail-co-coaches-wrap">
        <h3 class="detail-section-title"><I18nText k="detail.coCoaches" /></h3>
        <p v-if="!(cls.co_coaches && cls.co_coaches.length)" class="detail-notes">
          <I18nText k="detail.noData" />
        </p>
        <p v-else class="detail-coaches">
          <span v-for="(c, i) in cls.co_coaches" :key="'c-' + i">
            {{ c.name || [c.firstname, c.lastname].filter(Boolean).join(' ') }}{{ c.email ? ' (' + c.email + ')' : '' }}
          </span>
        </p>
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
.detail-meta-event--disabled .detail-meta-event-inner {
  opacity: 0.5;
  filter: grayscale(0.35);
  pointer-events: none;
  user-select: none;
}
.detail-section-disabled-hint {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  margin: 0.5rem 0 0;
  padding: 0.5rem 0.65rem;
  border-radius: var(--radius);
  border: 1px dashed var(--color-border);
  background: color-mix(in srgb, var(--color-bg) 92%, var(--color-text-muted));
}
.detail-notes {
  font-size: var(--text-base);
  color: var(--color-text-muted);
  margin: 1rem 0 0;
  padding-top: 1rem;
  border-top: 1px solid var(--color-border);
}
.detail-co-coaches-wrap {
  margin-top: 0.25rem;
}
.detail-coaches {
  margin: 0;
  font-size: var(--text-base);
  color: var(--color-text);
}
.detail-coaches span + span::before {
  content: ', ';
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
