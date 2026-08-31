<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { getTeamDocumentBlobUrl, getClassDocumentBlobUrl, getGroupDocumentBlobUrl } from '@/services/draht'
import PdfViewerModal from '@/components/PdfViewerModal.vue'
import {
  defaultShipmentPickerRange,
  fallbackShipmentWednesdays,
  formatShipmentDate,
} from '@/utils/shipmentSchedule'
import {
  buildShipmentConditions,
  isNoShipmentStep,
  isRealShipmentStep,
  resolveTimelineNextAction,
  shipmentLaneStatus,
  sortTimelineSteps,
} from '@/utils/timeline'

const props = defineProps({
  steps: { type: Array, default: () => [] },
  locale: { type: String, default: 'en' },
  /** Optional override; empty uses i18n `detail.statusTitle`. */
  title: { type: String, default: '' },
  /** 'teams', 'classes' or 'groups' – used to build document URL */
  teklaType: { type: String, default: 'teams' },
  /** Team or class id – used to build document URL */
  teklaId: { type: [String, Number], default: null },
  /**
   * { earliestDate, standardDate, coachMinDate } as Y-m-d from API.
   * When set, shows standard Wednesday shipment UI at Versand step.
   */
  shipmentSchedule: { type: Object, default: null },
  /** @deprecated use shipmentSchedule – kept for backward compatibility */
  versandaufschub: { type: [Number, null], default: undefined },
  /** Deregistered ("abgemeldet"): hide interactive shipment controls, keep info read-only. */
  readOnly: { type: Boolean, default: false },
})

const emit = defineEmits(['versandaufschub-save', 'shipment-date-save'])

const { t } = useI18n()

const selectedShipmentYmd = ref('')

const heading = computed(() => props.title || t('detail.statusTitle'))

const stepLabel = (step) => (props.locale === 'de' ? step.de : step.en) || step.en || step.de || ''
const stepSub = (step) => (props.locale === 'de' ? step.de_sub : step.en_sub) || step.en_sub || step.de_sub || ''

function laneIcon(kind, step) {
  if (kind === 'registration') return 'bi-person-check'
  if (kind === 'billing') return 'bi-receipt'
  if (kind === 'shipment') return 'bi-truck'
  if (kind === 'participants') return 'bi-people'
  if (kind === 'event') return 'bi-flag'
  if (kind === 'alert') return 'bi-exclamation-triangle'
  const p = (step?.picto || '').toLowerCase()
  if (p.includes('user') && p.includes('slash')) return 'bi-person-x'
  if (p.includes('user')) return 'bi-person-check'
  if (p.includes('truck')) return 'bi-truck'
  if (p.includes('receipt')) return 'bi-receipt'
  if (p.includes('triangle') || p.includes('exclamation')) return 'bi-exclamation-triangle'
  if (p.includes('people') || p.includes('group')) return 'bi-people'
  if (p.includes('flag')) return 'bi-flag'
  return 'bi-circle'
}

function itemIcon(item) {
  const type = (item.type || '').toLowerCase()
  if (type === 'order') return 'bi-cart'
  if (type === 'invoice') return 'bi-receipt'
  if (type === 'shipment') return 'bi-truck'
  return 'bi-file-earmark'
}

const pdfModalOpen = ref(false)
const pdfModalUrl = ref('')
const pdfModalTitle = ref('')
const pdfLoading = ref(false)
const pdfError = ref(null)

function isPdfDoc(item) {
  const type = (item.type || '').toLowerCase()
  return type === 'order' || type === 'invoice'
}

/** True for provisional draft refs like "(PROV5256)". */
function isDraftRef(label) {
  const s = String(label || '').trim()
  return s.startsWith('(') || /PROV/i.test(s)
}

/** Display label: friendly text for draft orders, otherwise the raw ref. */
function itemLabel(item) {
  if ((item?.type || '').toLowerCase() === 'order' && isDraftRef(item?.label)) {
    return t('detail.orderDraft')
  }
  return item?.label ?? ''
}

/**
 * Semantic document status coming from DRAHT (getPublicStatus).
 * Orders:    'draft' | 'validated' | 'shipment' | 'closed'
 * Invoices:  'open' | 'paid' | 'canceled' | 'not_needed' | 'draft'
 * Shipments: 'draft' | 'sent' | 'delivered'
 * Returns null when no badge should be shown for this item.
 */
function docStatus(item) {
  if (!item) return null
  const type = (item.type || '').toLowerCase()
  if (type !== 'order' && type !== 'invoice' && type !== 'shipment') return null

  const s = String(item.status || '').toLowerCase()
  if (s) return s

  if (type === 'invoice') {
    const payed = item.payed
    if (payed === true || payed === 1 || payed === '1') return 'paid'
    if (item.not_needed === true) return 'not_needed'
    return 'open'
  }
  return null
}

function docStatusClass(item) {
  const s = docStatus(item)
  if (!s) return null
  if (s === 'paid' || s === 'closed' || s === 'delivered') return 'done'
  if (s === 'draft' || s === 'canceled' || s === 'not_needed') return 'muted'
  return 'progress'
}

function docStatusLabelKey(item) {
  const s = docStatus(item)
  if (!s) return null
  const type = (item.type || '').toLowerCase()
  if (type === 'order') {
    if (s === 'draft') return 'detail.orderStatusDraft'
    if (s === 'shipment') return 'detail.orderStatusShipment'
    if (s === 'closed') return 'detail.orderStatusClosed'
    return 'detail.orderStatusValidated'
  }
  if (type === 'shipment') {
    if (s === 'draft') return 'detail.shipmentStatusDraft'
    if (s === 'delivered') return 'detail.shipmentStatusDelivered'
    return 'detail.shipmentStatusSent'
  }
  if (s === 'paid') return 'detail.invoiceStatusPaid'
  if (s === 'not_needed') return 'detail.invoiceStatusNotNeeded'
  if (s === 'canceled') return 'detail.invoiceStatusCanceled'
  return 'detail.invoiceStatusOpen'
}

async function openPdf(item) {
  if (!props.teklaId || !item?.label) return
  const docType = (item.type || '').toLowerCase()
  if (docType !== 'order' && docType !== 'invoice') return
  pdfError.value = null
  pdfLoading.value = true
  const docId =
    item.id !== undefined && item.id !== null && item.id !== '' ? String(item.id) : item.label
  try {
    let blobUrl
    if (props.teklaType === 'classes') {
      blobUrl = await getClassDocumentBlobUrl(props.teklaId, docType, docId)
    } else if (props.teklaType === 'groups') {
      blobUrl = await getGroupDocumentBlobUrl(props.teklaId, docType, docId)
    } else {
      blobUrl = await getTeamDocumentBlobUrl(props.teklaId, docType, docId)
    }
    pdfModalUrl.value = blobUrl
    pdfModalTitle.value = itemLabel(item)
    pdfModalOpen.value = true
  } catch (e) {
    pdfError.value = e.response?.status === 404 ? 'Document not found' : (e.message || 'Failed to load document')
    pdfModalTitle.value = pdfError.value
    pdfModalOpen.value = true
  } finally {
    pdfLoading.value = false
  }
}

function closePdfModal() {
  if (pdfModalUrl.value) {
    URL.revokeObjectURL(pdfModalUrl.value)
    pdfModalUrl.value = ''
  }
  pdfModalTitle.value = ''
  pdfModalOpen.value = false
}

const shipmentControlsEnabled = computed(
  () => props.shipmentSchedule !== null || props.versandaufschub !== undefined,
)

function ymdFromVersandaufschub(ts) {
  if (ts == null || ts === '') return null
  const ms = typeof ts === 'number' ? ts * 1000 : Date.parse(ts)
  if (!Number.isFinite(ms)) return null
  return new Date(ms).toISOString().slice(0, 10)
}

const schedule = computed(() => {
  if (!shipmentControlsEnabled.value) return null
  const s = props.shipmentSchedule && typeof props.shipmentSchedule === 'object'
    ? props.shipmentSchedule
    : {}
  const standard = s.standardDate || null
  const stored = s.earliestDate || ymdFromVersandaufschub(props.versandaufschub) || null
  const effective = stored || standard
  return {
    earliestDate: effective,
    standardDate: standard,
    storedDate: stored,
    coachMinDate: s.coachMinDate || null,
    isCustom: s.isCustom === true || !!(standard && stored && stored !== standard),
    preparationStartDate: s.preparationStartDate || null,
    locked: s.locked === true,
    standardMissingReason: s.standardMissingReason || null,
    hasDeliveryAddress: s.hasDeliveryAddress !== false,
  }
})

const isShipmentPickerEnabled = computed(() => shipmentControlsEnabled.value)

const shipmentLocked = computed(() => !!schedule.value?.locked)

const plannedYmd = computed(() => schedule.value?.earliestDate || schedule.value?.standardDate || '')

const standardYmd = computed(() => schedule.value?.standardDate || '')
const coachMinYmd = computed(() => schedule.value?.coachMinDate || '')

const isCustomShipment = computed(() => !!schedule.value?.isCustom)

const hasShipmentDate = computed(() => !!plannedYmd.value)

const hasDeliveryAddress = computed(() => schedule.value?.hasDeliveryAddress !== false)

const needsDeliveryAddress = computed(
  () => isShipmentPickerEnabled.value && !hasDeliveryAddress.value,
)

const shipmentMissingKey = computed(() =>
  schedule.value?.standardMissingReason === 'no_holiday_config'
    ? 'detail.shipmentStandardUnconfigured'
    : 'detail.shipmentStandardMissing',
)

function scrollToDeliveryForm(event) {
  event?.preventDefault?.()
  document.getElementById('detail-addresses')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const wednesdayOptions = computed(() => {
  const anchor = standardYmd.value || plannedYmd.value
  const ymds = anchor
    ? defaultShipmentPickerRange(anchor, coachMinYmd.value, 16).options
    : fallbackShipmentWednesdays(coachMinYmd.value, 24)
  return ymds.map((ymd) => ({
    value: ymd,
    label: formatShipmentDate(ymd, props.locale),
  }))
})

const shipmentSelectionDirty = computed(() => {
  if (!selectedShipmentYmd.value) return false
  if (!plannedYmd.value) return true
  return selectedShipmentYmd.value !== plannedYmd.value
})

watch(
  [plannedYmd, wednesdayOptions],
  () => {
    const planned = plannedYmd.value
    if (planned && wednesdayOptions.value.some((o) => o.value === planned)) {
      selectedShipmentYmd.value = planned
    } else if (wednesdayOptions.value.length) {
      selectedShipmentYmd.value = wednesdayOptions.value[0].value
    } else {
      selectedShipmentYmd.value = planned || ''
    }
  },
  { immediate: true },
)

function submitShipmentDate() {
  const val = selectedShipmentYmd.value?.trim()
  if (!val) return
  emit('shipment-date-save', val)
  emit('versandaufschub-save', val)
}

function resetToStandardShipment() {
  emit('shipment-date-save', null)
  emit('versandaufschub-save', null)
}

const shipmentStep = computed(() => props.steps.find(isRealShipmentStep) || props.steps.find(isNoShipmentStep) || null)

const shipmentConditions = computed(() =>
  buildShipmentConditions({
    steps: props.steps,
    shipmentStep: shipmentStep.value,
    schedule: schedule.value,
  }),
)

const lanes = computed(() =>
  sortTimelineSteps(props.steps).map(({ step, kind }, idx) => {
    const noShipment = isNoShipmentStep(step)
    const realShipment = isRealShipmentStep(step)
    const conditions = realShipment ? shipmentConditions.value : []
    let status = step.status || 'open'
    if (realShipment && conditions.length) {
      status = shipmentLaneStatus(conditions)
    }
    const doneCount = conditions.filter((c) => c.done).length
    return {
      key: `${kind}-${idx}`,
      step,
      kind,
      status,
      noShipment,
      realShipment,
      conditions,
      doneCount,
      totalCount: conditions.length,
      icon: laneIcon(kind, step),
    }
  }),
)

const plannedDateLabel = computed(() =>
  plannedYmd.value ? formatShipmentDate(plannedYmd.value, props.locale) : '',
)

const nextAction = computed(() =>
  resolveTimelineNextAction({
    steps: props.steps,
    schedule: schedule.value,
    conditions: shipmentConditions.value,
    plannedDateLabel: plannedDateLabel.value,
  }),
)

const nextActionTitle = computed(() => {
  const next = nextAction.value
  if (next.fromStep) return stepLabel(next.fromStep)
  return t(next.titleKey, next.titleValues || {})
})

const nextActionSub = computed(() => {
  const next = nextAction.value
  if (next.fromStep) return stepSub(next.fromStep)
  return next.subKey ? t(next.subKey) : ''
})

function laneStateKey(status) {
  if (status === 'closed') return 'detail.statusLaneDone'
  if (status === 'warn') return 'detail.statusLaneWarn'
  if (status === 'progress') return 'detail.statusLaneProgress'
  return 'detail.statusLaneOpen'
}

function firstInvoiceItem() {
  for (const step of props.steps) {
    const items = Array.isArray(step?.items) ? step.items : []
    const invoice = items.find((item) => (item.type || '').toLowerCase() === 'invoice')
    if (invoice) return invoice
  }
  return null
}

function onNextAction() {
  const action = nextAction.value.action
  if (action === 'scroll-address') {
    scrollToDeliveryForm()
    return
  }
  if (action === 'open-invoice') {
    const invoice = firstInvoiceItem()
    if (invoice && isPdfDoc(invoice) && props.teklaId) openPdf(invoice)
  }
}

function onConditionAction(condition) {
  if (condition.action === 'scroll-address') scrollToDeliveryForm()
  if (condition.action === 'open-invoice') {
    const invoice = firstInvoiceItem()
    if (invoice && isPdfDoc(invoice) && props.teklaId) openPdf(invoice)
  }
}
</script>

<template>
  <section class="tekla-status">
    <h2 class="tekla-status-title">{{ heading }}</h2>

    <div class="tekla-next" :class="`tekla-next--${nextAction.tone}`">
      <i
        class="bi tekla-next-icon"
        :class="{
          'bi-arrow-right-circle': nextAction.tone === 'action',
          'bi-hourglass-split': nextAction.tone === 'wait',
          'bi-check-circle': nextAction.tone === 'done',
          'bi-exclamation-triangle': nextAction.tone === 'warn',
        }"
        aria-hidden="true"
      ></i>
      <div class="tekla-next-copy">
        <p class="tekla-next-kicker"><I18nText :k="nextAction.kickerKey" /></p>
        <p class="tekla-next-heading">{{ nextActionTitle }}</p>
        <p v-if="nextActionSub" class="tekla-next-sub">{{ nextActionSub }}</p>
        <button
          v-if="nextAction.action && !readOnly"
          type="button"
          class="tekla-next-action"
          @click="onNextAction"
        >
          <I18nText
            :k="nextAction.action === 'scroll-address' ? 'detail.shipmentAddDeliveryAddressLink' : 'detail.statusOpenInvoice'"
          />
        </button>
      </div>
    </div>

    <ol class="tekla-lanes">
      <li
        v-for="lane in lanes"
        :key="lane.key"
        class="tekla-lane"
        :class="[`tekla-lane--${lane.kind}`, `tekla-lane--${lane.status}`]"
      >
        <div class="tekla-lane-head">
          <span class="tekla-lane-node" aria-hidden="true">
            <i v-if="lane.status === 'closed'" class="bi bi-check-lg"></i>
            <i v-else class="bi" :class="lane.icon"></i>
          </span>
          <div class="tekla-lane-titles">
            <div class="tekla-lane-label">{{ stepLabel(lane.step) }}</div>
            <p v-if="lane.noShipment" class="tekla-lane-sub">
              <I18nText k="detail.statusNoShipment" />
            </p>
            <p v-else-if="stepSub(lane.step)" class="tekla-lane-sub">{{ stepSub(lane.step) }}</p>
          </div>
          <span class="tekla-lane-state">
            <template v-if="lane.realShipment && lane.totalCount">
              <I18nText
                k="detail.statusConditionsProgress"
                :values="{ done: lane.doneCount, total: lane.totalCount }"
              />
            </template>
            <I18nText v-else :k="laneStateKey(lane.status)" />
          </span>
        </div>

        <ul v-if="lane.step.items && lane.step.items.length" class="tekla-stage-docs">
          <li v-for="(item, i) in lane.step.items" :key="i" class="tekla-doc">
            <a
              v-if="item.link"
              :href="item.link"
              target="_blank"
              rel="noopener noreferrer"
              class="tekla-doc-link"
            >
              <i class="bi tekla-doc-icon" :class="itemIcon(item)"></i>
              <span>{{ itemLabel(item) }}</span>
              <span
                v-if="docStatusLabelKey(item)"
                class="tekla-doc-status"
                :class="docStatusClass(item)"
                :title="t(docStatusLabelKey(item))"
              >
                <I18nText :k="docStatusLabelKey(item)" />
              </span>
              <span v-if="item.link_text" class="tekla-doc-extra">{{ item.link_text }}</span>
              <i class="bi bi-box-arrow-up-right tekla-doc-external"></i>
            </a>
            <button
              v-else-if="isPdfDoc(item) && teklaId"
              type="button"
              class="tekla-doc-link tekla-doc-button"
              :disabled="pdfLoading"
              @click="openPdf(item)"
            >
              <i class="bi tekla-doc-icon" :class="itemIcon(item)"></i>
              <span>{{ itemLabel(item) }}</span>
              <span
                v-if="docStatusLabelKey(item)"
                class="tekla-doc-status"
                :class="docStatusClass(item)"
                :title="t(docStatusLabelKey(item))"
              >
                <I18nText :k="docStatusLabelKey(item)" />
              </span>
              <i class="bi bi-box-arrow-up-right tekla-doc-external"></i>
            </button>
            <span v-else class="tekla-doc-label">
              <i class="bi tekla-doc-icon" :class="itemIcon(item)"></i>
              <span>{{ itemLabel(item) }}</span>
              <span
                v-if="docStatusLabelKey(item)"
                class="tekla-doc-status"
                :class="docStatusClass(item)"
                :title="t(docStatusLabelKey(item))"
              >
                <I18nText :k="docStatusLabelKey(item)" />
              </span>
            </span>
          </li>
        </ul>

        <div v-if="lane.realShipment && lane.conditions.length" class="tekla-conditions">
          <p class="tekla-conditions-title"><I18nText k="detail.statusConditionsTitle" /></p>
          <p class="tekla-conditions-hint"><I18nText k="detail.statusConditionsHint" /></p>
          <ul class="tekla-conditions-list">
            <li
              v-for="condition in lane.conditions"
              :key="condition.id"
              class="tekla-condition"
              :class="{
                done: condition.done,
                waiting: condition.waiting && !condition.done,
                action: condition.coachAction && !condition.done,
              }"
            >
              <i
                class="bi"
                :class="condition.done ? 'bi-check-circle-fill' : (condition.waiting ? 'bi-hourglass-split' : 'bi-circle')"
                aria-hidden="true"
              ></i>
              <span><I18nText :k="condition.labelKey" /></span>
              <button
                v-if="condition.coachAction && condition.action && !readOnly"
                type="button"
                class="tekla-condition-action"
                @click="onConditionAction(condition)"
              >
                <I18nText
                  :k="condition.action === 'scroll-address' ? 'detail.shipmentAddDeliveryAddressLink' : 'detail.statusOpenInvoice'"
                />
              </button>
            </li>
          </ul>
        </div>

        <div
          v-if="lane.realShipment && isShipmentPickerEnabled && !needsDeliveryAddress"
          class="tekla-versandaufschub"
        >
          <p v-if="hasShipmentDate" class="tekla-shipment-main">
            <I18nText k="detail.shipmentDateLabel" />&nbsp;
            <strong>{{ formatShipmentDate(plannedYmd, locale) }}</strong>
          </p>
          <p v-else class="tekla-shipment-hint">
            <I18nText :k="shipmentMissingKey" />
          </p>
          <p v-if="isCustomShipment && standardYmd" class="tekla-shipment-current">
            <I18nText k="detail.shipmentDiffersFromStandard" />
            <strong>{{ formatShipmentDate(standardYmd, locale) }}</strong>
          </p>
          <p v-else-if="hasShipmentDate && standardYmd" class="tekla-shipment-current tekla-shipment-current--standard">
            <I18nText k="detail.shipmentEarliestIsStandard" />
          </p>
          <p v-if="shipmentLocked && hasShipmentDate" class="tekla-shipment-preparing">
            <i class="bi bi-truck"></i>&nbsp;<I18nText k="detail.shipmentPreparing" />
          </p>
          <div
            v-if="!readOnly && !shipmentLocked && hasShipmentDate && wednesdayOptions.length"
            class="tekla-versandaufschub-form tekla-shipment-picker"
          >
            <label class="tekla-shipment-select-label" :for="`shipment-date-${teklaId}`">
              <I18nText k="detail.shipmentPickWednesday" />
            </label>
            <select
              :id="`shipment-date-${teklaId}`"
              v-model="selectedShipmentYmd"
              class="tekla-versandaufschub-input tekla-shipment-select"
            >
              <option v-for="opt in wednesdayOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
            <div class="tekla-shipment-form-actions">
              <button
                type="button"
                class="tekla-btn tekla-btn-primary"
                :disabled="!shipmentSelectionDirty"
                @click="submitShipmentDate"
              >
                <I18nText k="common.save" />
              </button>
              <button
                v-if="isCustomShipment && standardYmd"
                type="button"
                class="tekla-btn"
                @click="resetToStandardShipment"
              >
                <I18nText k="detail.shipmentResetStandard" />
              </button>
            </div>
          </div>
        </div>
      </li>
    </ol>

    <PdfViewerModal
      :show="pdfModalOpen"
      :pdf-url="pdfModalUrl"
      :title="pdfModalTitle"
      @close="closePdfModal"
    />
  </section>
</template>

<style scoped>
.tekla-status {
  margin-bottom: 1.5rem;
  padding-top: 0.25rem;
}

.tekla-status-title {
  margin: 0 0 0.85rem;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.tekla-next {
  display: flex;
  gap: 0.85rem;
  align-items: flex-start;
  padding: 0.9rem 1rem;
  margin-bottom: 1rem;
  border-radius: var(--radius);
  border: 1px solid var(--color-border);
  background: var(--color-bg-elevated);
}

.tekla-next--action {
  border-color: color-mix(in srgb, var(--color-accent) 40%, var(--color-border));
  background: color-mix(in srgb, var(--color-accent-soft) 70%, var(--color-bg-elevated));
}

.tekla-next--warn {
  border-color: color-mix(in srgb, var(--color-warn, #ca8a04) 45%, var(--color-border));
  background: color-mix(in srgb, var(--color-warn, #ca8a04) 10%, var(--color-bg-elevated));
}

.tekla-next--done {
  border-color: color-mix(in srgb, var(--color-success, #16a34a) 40%, var(--color-border));
  background: color-mix(in srgb, var(--color-success, #16a34a) 8%, var(--color-bg-elevated));
}

.tekla-next-icon {
  font-size: 1.35rem;
  line-height: 1;
  margin-top: 0.15rem;
  color: var(--color-accent);
}

.tekla-next--wait .tekla-next-icon,
.tekla-next--warn .tekla-next-icon {
  color: var(--color-warn, #ca8a04);
}

.tekla-next--done .tekla-next-icon {
  color: var(--color-success, #16a34a);
}

.tekla-next-copy {
  min-width: 0;
  flex: 1;
}

.tekla-next-kicker,
.tekla-next-heading,
.tekla-next-sub {
  margin: 0;
}

.tekla-next-kicker {
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.tekla-next-heading {
  margin-top: 0.2rem;
  font-size: var(--text-lg);
  font-weight: 700;
  line-height: 1.3;
  color: var(--color-text);
}

.tekla-next-sub {
  margin-top: 0.3rem;
  font-size: var(--text-sm);
  line-height: 1.45;
  color: var(--color-text-muted);
}

.tekla-next-action,
.tekla-condition-action {
  margin-top: 0.55rem;
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-accent);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
}

.tekla-condition-action {
  margin-top: 0;
  margin-left: 0.35rem;
}

.tekla-lanes {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.tekla-lane {
  padding: 0.85rem 1rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-bg-elevated);
}

.tekla-lane--warn {
  border-color: color-mix(in srgb, var(--color-warn, #ca8a04) 40%, var(--color-border));
}

.tekla-lane--closed {
  opacity: 0.96;
}

.tekla-lane-head {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.tekla-lane-node {
  width: 2.15rem;
  height: 2.15rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: 2px solid var(--color-border);
  background: var(--color-bg);
  color: var(--color-text-muted);
}

.tekla-lane--closed .tekla-lane-node {
  border-color: var(--color-success, #16a34a);
  color: var(--color-success, #16a34a);
}

.tekla-lane--progress .tekla-lane-node {
  border-color: var(--color-accent);
  color: var(--color-accent);
}

.tekla-lane--warn .tekla-lane-node {
  border-color: var(--color-warn, #ca8a04);
  color: var(--color-warn, #ca8a04);
}

.tekla-lane-titles {
  min-width: 0;
  flex: 1;
}

.tekla-lane-label {
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--color-text);
  line-height: 1.3;
}

.tekla-lane-sub {
  margin: 0.3rem 0 0;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  line-height: 1.4;
}

.tekla-lane-state {
  flex-shrink: 0;
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--color-text-muted);
  padding-top: 0.25rem;
}

.tekla-lane--closed .tekla-lane-state {
  color: var(--color-success, #16a34a);
}

.tekla-lane--warn .tekla-lane-state {
  color: var(--color-warn, #ca8a04);
}

.tekla-conditions {
  margin-top: 0.85rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--color-border);
}

.tekla-conditions-title {
  margin: 0;
  font-size: var(--text-sm);
  font-weight: 700;
  color: var(--color-text);
}

.tekla-conditions-hint {
  margin: 0.25rem 0 0.65rem;
  font-size: var(--text-xs);
  line-height: 1.45;
  color: var(--color-text-muted);
}

.tekla-conditions-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.tekla-condition {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem;
  font-size: var(--text-sm);
  color: var(--color-text);
}

.tekla-condition .bi {
  color: var(--color-text-muted);
}

.tekla-condition.done {
  color: var(--color-text-muted);
}

.tekla-condition.done .bi {
  color: var(--color-success, #16a34a);
}

.tekla-condition.waiting .bi,
.tekla-condition.action .bi {
  color: var(--color-warn, #ca8a04);
}

.tekla-stage-docs {
  list-style: none;
  padding: 0;
  margin: 0.7rem 0 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.tekla-doc {
  margin: 0;
}

.tekla-doc-link,
.tekla-doc-label {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: var(--text-base);
  color: var(--color-accent);
  text-decoration: none;
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  transition: border-color 0.2s, background 0.2s;
}

.tekla-doc-link:hover {
  background: var(--color-accent-soft);
  border-color: var(--color-accent);
}

.tekla-doc-button {
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  width: 100%;
}

.tekla-doc-button:disabled {
  opacity: 0.7;
  cursor: wait;
}

.tekla-doc-label {
  color: var(--color-text);
}

.tekla-doc-icon {
  font-size: 0.9rem;
  color: var(--color-text-muted);
}

.tekla-doc-link .tekla-doc-icon {
  color: var(--color-accent);
}

.tekla-doc-extra {
  font-size: 0.8em;
  color: var(--color-text-muted);
}

.tekla-doc-external {
  margin-left: auto;
  font-size: 0.75rem;
  opacity: 0.8;
}

.tekla-doc-status {
  margin-left: 0.25rem;
  font-size: 0.8em;
  opacity: 0.9;
}

.tekla-doc-status.done {
  color: var(--color-success, #16a34a);
}

.tekla-doc-status.progress {
  color: var(--color-warn, #ca8a04);
}

.tekla-doc-status.muted {
  color: var(--color-fg-muted);
  font-style: italic;
}

.tekla-versandaufschub {
  margin-top: 0.75rem;
  padding: 0.75rem 1rem;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.35rem;
}

.tekla-shipment-main {
  margin: 0 0 0.25rem;
  font-size: var(--text-base);
  font-weight: 500;
  color: var(--color-text);
  line-height: 1.45;
}

.tekla-shipment-main strong {
  font-weight: 700;
}

.tekla-shipment-current,
.tekla-shipment-hint {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-text);
  line-height: 1.45;
}

.tekla-shipment-hint {
  color: var(--color-fg-muted);
  font-size: var(--text-xs);
}

.tekla-shipment-address-link {
  display: inline;
  margin-left: 0.35em;
  color: var(--color-accent);
  font-weight: 600;
  text-decoration: underline;
}

.tekla-shipment-current--standard {
  color: var(--color-success, #16a34a);
}

.tekla-shipment-preparing {
  margin: 0.25rem 0 0;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-accent);
  line-height: 1.45;
}

.tekla-shipment-select-label {
  font-size: var(--text-sm);
  font-weight: 500;
}

.tekla-shipment-select {
  min-width: 16rem;
  max-width: 100%;
  appearance: auto;
  cursor: pointer;
}

.tekla-shipment-picker {
  width: 100%;
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--color-border);
}

.tekla-shipment-form-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.tekla-versandaufschub-form {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.5rem;
  width: 100%;
}

.tekla-versandaufschub-input {
  font-size: var(--text-base);
  padding: 0.5rem 0.65rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-bg-elevated);
  color: var(--color-text);
  width: 100%;
  max-width: 22rem;
}

.tekla-btn {
  font-size: var(--text-sm);
  padding: 0.35rem 0.75rem;
  border-radius: var(--radius);
  border: 1px solid var(--color-border);
  background: var(--color-bg-elevated);
  cursor: pointer;
  color: var(--color-text);
}

.tekla-btn-primary {
  background: var(--color-accent);
  color: var(--color-on-accent);
  border-color: var(--color-accent);
  font-weight: 600;
}

.tekla-btn-primary:hover:not(:disabled) {
  background: var(--color-accent-hover);
  border-color: var(--color-accent-hover);
}

.tekla-btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  color: var(--color-on-accent);
}

@media (max-width: 640px) {
  .tekla-lane-head {
    flex-wrap: wrap;
  }

  .tekla-lane-state {
    width: 100%;
    padding-top: 0;
    padding-left: 2.9rem;
  }

  .tekla-shipment-select {
    min-width: 0;
  }
}
</style>
