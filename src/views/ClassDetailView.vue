<script setup>
import { ref, onMounted, computed, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { getClass, updateClassVersandaufschub } from '@/services/draht'
import DetailDeliveryAddressForm from '@/components/DetailDeliveryAddressForm.vue'
import { formatOverviewAddress } from '@/utils/formatOverviewAddress'
import { isTeklaCancelled } from '@/utils/enrollmentDisplay'
import { timelineHasShipmentStep } from '@/utils/timeline'
import { useTeklaShipmentSchedule } from '@/composables/useTeklaShipmentSchedule'
import TeklaTimeline from '@/components/TeklaTimeline.vue'
import DetailTeklaHeader from '@/components/DetailTeklaHeader.vue'
import { DETAIL_EVENT_ACTIONS_ENABLED } from '@/config/detailEventActions'

const route = useRoute()
const { t, locale } = useI18n()
const cls = ref(null)
const loading = ref(true)
const error = ref(null)

const id = computed(() => route.params.id)

/** Deregistered ("abgemeldet"): all editing functions are disabled. */
const cancelled = computed(() => isTeklaCancelled(cls.value))

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

function cardHasDeliveryAddress(card) {
  if (!card) return false
  if (card.shipmentSchedule?.hasDeliveryAddress === false) return false
  if (Number(card.delivery_adr) > 0) return true
  const addr = card.overview?.delivery_address
  return !!(addr && formatAddress(addr))
}

function onDeliveryAddressSaved(card) {
  if (card && typeof card === 'object') cls.value = card
}

function scrollToDeliveryForm() {
  if (typeof window === 'undefined' || window.location.hash !== '#detail-addresses') return
  nextTick(() => {
    document.getElementById('detail-addresses')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
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
    if (cls.value) {
      scrollToCoCoachesSection()
      scrollToDeliveryForm()
    }
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
watch(
  () => route.hash,
  () => {
    if (cls.value) scrollToDeliveryForm()
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
      <DetailTeklaHeader :card="cls" kind="class" :cancelled="cancelled" />
      <p v-if="cancelled" class="detail-cancelled-banner" role="status">
        <i class="bi bi-slash-circle" aria-hidden="true"></i>
        <span><I18nText k="detail.cancelledBanner" /></span>
      </p>

      <!-- 2) Timeline -->
      <TeklaTimeline
        v-if="timelineSteps.length"
        :steps="timelineSteps"
        :locale="locale"
        tekla-type="classes"
        :tekla-id="cls.id"
        :shipment-schedule="shipmentScheduleProp"
        :versandaufschub="showShipmentSchedule ? (cls.versandaufschub ?? null) : undefined"
        :read-only="cancelled"
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
      <section id="detail-addresses" class="detail-section detail-section-addresses">
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
        <p v-if="cardHasDeliveryAddress(cls)" class="detail-address">
          {{ formatAddress(cls.overview.delivery_address) }}
        </p>
        <DetailDeliveryAddressForm
          v-else-if="!cancelled"
          tekla-type="classes"
          :tekla-id="cls.id"
          @saved="onDeliveryAddressSaved"
        />
        <p v-else class="detail-address"><I18nText k="detail.noData" /></p>
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
.detail-cancelled-banner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0 0 1.5rem;
  padding: 0.75rem 1rem;
  border-radius: var(--radius);
  border: 1px solid color-mix(in srgb, #b91c1c 35%, transparent);
  background: color-mix(in srgb, #b91c1c 10%, transparent);
  color: #b91c1c;
  font-size: var(--text-sm);
  font-weight: 600;
  line-height: 1.4;
}
.detail-cancelled-banner .bi {
  font-size: 1.1rem;
  flex-shrink: 0;
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
.detail-section-addresses,
.detail-co-coaches-wrap {
  margin-top: 0.25rem;
  scroll-margin-top: 5rem;
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
