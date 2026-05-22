<script setup>
import { ref, onMounted, computed, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { getGroup, updateGroupVersandaufschub } from '@/services/draht'
import { formatOverviewAddress } from '@/utils/formatOverviewAddress'
import { timelineHasShipmentStep } from '@/utils/timeline'
import { useTeklaShipmentSchedule } from '@/composables/useTeklaShipmentSchedule'
import TeklaTimeline from '@/components/TeklaTimeline.vue'
import FutureGroupEventTeamsPanel from '@/components/FutureGroupEventTeamsPanel.vue'
import DetailTeklaHeader from '@/components/DetailTeklaHeader.vue'
import FutureEnrollmentContextBanner from '@/components/FutureEnrollmentContextBanner.vue'

const route = useRoute()
const { t, locale } = useI18n()
const group = ref(null)
const loading = ref(true)
const error = ref(null)
const id = computed(() => route.params.id)

const timelineSteps = computed(() => {
  const tl = group.value?.timeline
  if (!tl) return []
  return Array.isArray(tl.timeline) ? tl.timeline : (Array.isArray(tl) ? tl : [])
})

const showShipmentSchedule = computed(() => timelineHasShipmentStep(timelineSteps.value))
const shipmentScheduleProp = useTeklaShipmentSchedule(group, showShipmentSchedule)

function formatAddress(addr) {
  return formatOverviewAddress(addr, locale.value)
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
    group.value = res.data
  } catch (e) {
    error.value = e.response?.status === 404 ? t('detail.notFound') : (e.message || t('errors.loadFailed'))
  } finally {
    loading.value = false
    if (group.value) scrollToCoCoachesSection()
  }
}

function onGroupUpdated(card) {
  group.value = card
}

async function saveVersandaufschub(dateStrOrNull) {
  if (!id.value) return
  try {
    const res = await updateGroupVersandaufschub(id.value, { versandaufschub: dateStrOrNull })
    group.value = res.data
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
      <DetailTeklaHeader :card="group" kind="group" />
      <FutureEnrollmentContextBanner kind="group" :card="group" />

      <TeklaTimeline
        v-if="timelineSteps.length"
        :steps="timelineSteps"
        :locale="locale"
        tekla-type="groups"
        :tekla-id="group.id"
        :shipment-schedule="shipmentScheduleProp"
        :versandaufschub="showShipmentSchedule ? (group.versandaufschub ?? null) : undefined"
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

        <section class="detail-section detail-section--wide">
          <FutureGroupEventTeamsPanel
            :group-id="group.id"
            :group="group"
            @updated="onGroupUpdated"
          />
        </section>

        <section class="detail-section">
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
          <p class="detail-address">
            <template
              v-if="group.overview && group.overview.delivery_address && formatAddress(group.overview.delivery_address)"
            >
              {{ formatAddress(group.overview.delivery_address) }}
            </template>
            <I18nText v-else k="detail.noData" />
          </p>
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
.detail-co-coaches-wrap { margin-top: 0.25rem; }
.detail-coaches { margin: 0; font-size: var(--text-base); color: var(--color-text); }
.detail-coaches span + span::before { content: ', '; }
@media (min-width: 960px) {
  .detail-view { max-width: 78rem; }
  .detail-overview { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .detail-section--wide { grid-column: 1 / -1; }
}
</style>
