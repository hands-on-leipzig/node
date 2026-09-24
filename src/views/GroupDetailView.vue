<script setup>
import { ref, onMounted, computed, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { getGroup, updateGroupVersandaufschub, unwrapNodeCard } from '@/services/draht'
import DetailDeliveryAddressForm from '@/components/DetailDeliveryAddressForm.vue'
import { formatOverviewAddress } from '@/utils/formatOverviewAddress'
import { isTeklaCancelled } from '@/utils/enrollmentDisplay'
import { timelineHasShipmentStep, unwrapTimelinePayload } from '@/utils/timeline'
import { useTeklaShipmentSchedule } from '@/composables/useTeklaShipmentSchedule'
import TeklaStatusBoard from '@/components/TeklaStatusBoard.vue'
import FutureGroupEventTeamsPanel from '@/components/FutureGroupEventTeamsPanel.vue'
import DetailTeklaHeader from '@/components/DetailTeklaHeader.vue'

const route = useRoute()
const { t, locale } = useI18n()
const group = ref(null)
const loading = ref(true)
const error = ref(null)
const id = computed(() => route.params.id)

/** Deregistered ("abgemeldet"): all editing functions are disabled. */
const cancelled = computed(() => isTeklaCancelled(group.value))

const timelinePayload = computed(() => unwrapTimelinePayload(group.value?.timeline))
const timelineSteps = computed(() => timelinePayload.value.steps)
const timelineAlert = computed(() => timelinePayload.value.alert)

const showShipmentSchedule = computed(() => timelineHasShipmentStep(timelineSteps.value))
const shipmentScheduleProp = useTeklaShipmentSchedule(group, showShipmentSchedule)

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
  if (card && typeof card === 'object') group.value = card
}

function scrollToDeliveryForm() {
  if (typeof window === 'undefined' || window.location.hash !== '#detail-addresses') return
  nextTick(() => {
    document.getElementById('detail-addresses')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}

function scrollToCoCoachesSection() {
  if (route.query.focus !== 'coCoaches' || loading.value || !group.value) return
  nextTick(() => {
    document.getElementById('group-co-coaches-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}

async function fetchGroup() {
  if (!id.value) return
  loading.value = true
  error.value = null
  group.value = null
  try {
    const res = await getGroup(id.value)
    group.value = unwrapNodeCard(res)
  } catch (e) {
    error.value = e.response?.status === 404 ? t('detail.notFound') : (e.message || t('errors.loadFailed'))
  } finally {
    loading.value = false
    if (group.value) {
      scrollToCoCoachesSection()
      scrollToDeliveryForm()
    }
  }
}

function onGroupUpdated(card) {
  const unwrapped = card && typeof card === 'object' && card.data && typeof card.data === 'object' && !Array.isArray(card.data)
    && (card.data.id != null || card.data.rowid != null)
    ? card.data
    : card
  group.value = unwrapped
}

async function saveVersandaufschub(dateStrOrNull) {
  if (!id.value) return
  try {
    const res = await updateGroupVersandaufschub(id.value, { versandaufschub: dateStrOrNull })
    group.value = unwrapNodeCard(res)
  } catch (e) {
    console.error('[GroupDetail] versandaufschub save failed', e)
  }
}

onMounted(fetchGroup)
watch(id, fetchGroup)
watch(
  () => route.query.focus,
  () => {
    if (group.value && route.query.focus === 'coCoaches') scrollToCoCoachesSection()
  }
)
watch(
  () => route.hash,
  () => {
    if (group.value) scrollToDeliveryForm()
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
    <template v-else-if="group">
      <DetailTeklaHeader :card="group" kind="group" :cancelled="cancelled" />
      <p v-if="cancelled" class="detail-cancelled-banner" role="status">
        <i class="bi bi-slash-circle" aria-hidden="true"></i>
        <span><I18nText k="detail.cancelledBanner" /></span>
      </p>

      <TeklaStatusBoard
        v-if="timelineSteps.length || timelineAlert"
        :steps="timelineSteps"
        :alert="timelineAlert"
        :locale="locale"
        tekla-type="groups"
        :tekla-id="group.id"
        :shipment-schedule="shipmentScheduleProp"
        :versandaufschub="showShipmentSchedule ? (group.versandaufschub ?? null) : undefined"
        :read-only="cancelled"
        class="detail-timeline-first"
        @versandaufschub-save="saveVersandaufschub"
      />

      <div class="detail-overview">
        <section class="detail-section">
          <dl class="detail-meta">
            <dt><I18nText k="detail.coach" /></dt>
            <dd>
              <template v-if="group.coach">
                <template
                  v-if="group.coach.name || [group.coach.firstname, group.coach.lastname].filter(Boolean).join(' ')"
                >
                  {{ group.coach.name || [group.coach.firstname, group.coach.lastname].filter(Boolean).join(' ') }}
                </template>
                <I18nText v-else k="detail.noData" />
                <span v-if="group.coach.email" class="detail-meta-extra">{{ group.coach.email }}</span>
              </template>
              <template v-else><I18nText k="detail.noData" /></template>
            </dd>
            <dt><I18nText k="detail.ort" /></dt>
            <dd>
              <template v-if="group.ort">{{ group.ort }}</template>
              <I18nText v-else k="detail.noData" />
            </dd>
            <dt><I18nText k="detail.institution" /></dt>
            <dd>
              <template v-if="group.institution">{{ group.institution }}</template>
              <I18nText v-else k="detail.noData" />
            </dd>
          </dl>
        </section>

        <section
          class="detail-section detail-section--wide"
          :class="{ 'detail-section--disabled': cancelled }"
        >
          <FutureGroupEventTeamsPanel
            :group-id="group.id"
            :group="group"
            :disabled="cancelled"
            @updated="onGroupUpdated"
          />
        </section>

        <section id="detail-addresses" class="detail-section detail-section-addresses">
          <h3 class="detail-section-title"><I18nText k="wizard.stepAddresses" /></h3>
          <p class="detail-address-label"><I18nText k="detail.billingAddress" /></p>
          <p class="detail-address">
            <template
              v-if="group.overview && group.overview.billing_address && formatAddress(group.overview.billing_address)"
            >
              {{ formatAddress(group.overview.billing_address) }}
            </template>
            <I18nText v-else k="detail.noData" />
          </p>
          <p class="detail-address-label"><I18nText k="detail.deliveryAddress" /></p>
          <p v-if="cardHasDeliveryAddress(group)" class="detail-address">
            {{ formatAddress(group.overview.delivery_address) }}
          </p>
          <DetailDeliveryAddressForm
            v-else-if="!cancelled"
            tekla-type="groups"
            :tekla-id="group.id"
            @saved="onDeliveryAddressSaved"
          />
          <p v-else class="detail-address"><I18nText k="detail.noData" /></p>
        </section>

        <section id="group-co-coaches-anchor" class="detail-section detail-co-coaches-wrap">
          <h3 class="detail-section-title"><I18nText k="detail.coCoaches" /></h3>
          <p v-if="!(group.co_coaches && group.co_coaches.length)" class="detail-empty-hint">
            <I18nText k="detail.noData" />
          </p>
          <p v-else class="detail-coaches">
            <span v-for="(c, i) in group.co_coaches" :key="'c-' + i">
              {{ c.name || [c.firstname, c.lastname].filter(Boolean).join(' ') }}{{ c.email ? ' (' + c.email + ')' : '' }}
            </span>
          </p>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.detail-view { max-width: 42rem; }
.detail-overview { display: grid; gap: 1.5rem 2rem; }
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
.detail-cancelled-banner .bi { font-size: 1.1rem; flex-shrink: 0; }
.detail-section--disabled { opacity: 0.55; filter: grayscale(0.35); }
.detail-loading,
.detail-error { display: flex; align-items: center; gap: 0.5rem; color: var(--color-text-muted); }
.detail-error { color: var(--color-error, #dc2626); }
.spin { animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.detail-section { margin-bottom: 1.5rem; padding: 1rem 0; border-top: 1px solid var(--color-border); }
.detail-section-title { font-size: var(--text-sm); font-weight: 600; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.03em; margin: 0 0 0.75rem; }
.detail-meta { display: grid; grid-template-columns: auto 1fr; gap: 0.35rem 1.5rem; margin: 0; }
.detail-meta dt { font-size: var(--text-sm); color: var(--color-text-muted); margin: 0; }
.detail-meta dd { font-size: var(--text-base); color: var(--color-text); margin: 0; }
.detail-meta-extra { display: block; font-size: var(--text-sm); color: var(--color-text-muted); margin-top: 0.15rem; }
.detail-address-label { font-size: var(--text-sm); font-weight: 600; color: var(--color-text-muted); margin: 0 0 0.25rem; }
.detail-address { font-size: var(--text-base); color: var(--color-text); margin: 0 0 0.75rem; white-space: pre-line; }
.detail-address:last-child { margin-bottom: 0; }
.detail-empty-hint { font-size: var(--text-base); color: var(--color-text-muted); margin: 0; }
.detail-section-addresses,
.detail-co-coaches-wrap { margin-top: 0.25rem; scroll-margin-top: 5rem; }
.detail-coaches { margin: 0; font-size: var(--text-base); color: var(--color-text); }
.detail-coaches span + span::before { content: ', '; }
@media (min-width: 960px) {
  .detail-view { max-width: 78rem; }
  .detail-overview { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .detail-section--wide { grid-column: 1 / -1; }
}
</style>
