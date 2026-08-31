<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { getTeamDocumentBlobUrl, getClassDocumentBlobUrl, getGroupDocumentBlobUrl } from '@/services/draht'
import PdfViewerModal from '@/components/PdfViewerModal.vue'
import {
  defaultShipmentPickerRange,
  fallbackShipmentWednesdays,
  formatShipmentDate,
  todayYmd,
} from '@/utils/shipmentSchedule'
import { buildStatusLanes } from '@/utils/timeline'

const props = defineProps({
  steps: { type: Array, default: () => [] },
  /** Optional `crc` notice from getPublicStatus() (missing Führungszeugnis or paused). */
  alert: { type: Object, default: null },
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

/** White box only while the planned date is still today or later; hide once it has passed. */
const isShipmentDateUpcoming = computed(() => {
  const ymd = plannedYmd.value
  if (!ymd) return true
  return ymd >= todayYmd()
})

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

const lanes = computed(() =>
  buildStatusLanes({
    steps: props.steps,
    alert: props.alert,
    schedule: schedule.value,
  }),
)

function laneNodeIcon(lane) {
  if (lane.status === 'closed') return 'bi-check-lg'
  if (lane.status === 'skip') return 'bi-dash-lg'
  return lane.icon
}

function factorIcon(factor) {
  if (factor.done) return 'bi-check-circle-fill'
  if (factor.warn) return 'bi-exclamation-triangle-fill'
  if (factor.waiting) return 'bi-hourglass-split'
  return 'bi-circle'
}

function factorLabel(factor) {
  if (factor.fromAlert) {
    return props.locale === 'de'
      ? (factor.fromAlert.de || factor.fromAlert.en || '')
      : (factor.fromAlert.en || factor.fromAlert.de || '')
  }
  return factor.labelKey ? t(factor.labelKey) : ''
}

function factorDetail(factor) {
  if (factor.id === 'date' && plannedYmd.value) {
    return formatShipmentDate(plannedYmd.value, props.locale)
  }
  return ''
}

function showDatePicker(factor) {
  return (
    factor.showShipmentPicker &&
    isShipmentPickerEnabled.value &&
    isShipmentDateUpcoming.value &&
    hasShipmentDate.value
  )
}

function onFactorAction(factor) {
  if (factor.action === 'scroll-address') {
    document.getElementById('detail-addresses')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    return
  }
  if (factor.action === 'open-invoice') {
    const invoice = (factor.items || []).find((item) => (item.type || '').toLowerCase() === 'invoice')
    if (invoice && isPdfDoc(invoice) && props.teklaId) openPdf(invoice)
  }
}
</script>

<template>
  <section v-if="lanes.length" class="tekla-status">
    <h2 class="tekla-status-title">{{ heading }}</h2>

    <div class="tekla-process">
      <ol class="tekla-stages">
        <li
          v-for="(lane, idx) in lanes"
          :key="lane.id"
          class="tekla-stage"
          :class="`tekla-stage--${lane.status}`"
        >
          <div class="tekla-stage-axis" aria-hidden="true">
            <div class="tekla-stage-node">
              <i class="bi" :class="laneNodeIcon(lane)"></i>
            </div>
            <div
              v-if="idx < lanes.length - 1"
              class="tekla-stage-connector"
              :class="`tekla-stage-connector--${lane.status}`"
            ></div>
          </div>
          <div class="tekla-stage-content">
            <div class="tekla-stage-head">
              <span class="tekla-stage-index">{{ idx + 1 }}</span>
              <span class="tekla-stage-label"><I18nText :k="lane.labelKey" /></span>
              <span v-if="lane.skipKey" class="tekla-stage-skip"><I18nText :k="lane.skipKey" /></span>
              <span v-else-if="lane.blockedKey" class="tekla-stage-blocked"><I18nText :k="lane.blockedKey" /></span>
            </div>

            <ul v-if="lane.factors.length" class="tekla-points">
              <li
                v-for="factor in lane.factors"
                :key="factor.id"
                class="tekla-point"
                :class="{
                  done: factor.done,
                  waiting: factor.waiting && !factor.done,
                  warn: factor.warn && !factor.done,
                  action: factor.coachAction && !factor.done,
                }"
              >
                <i class="bi tekla-point-icon" :class="factorIcon(factor)" aria-hidden="true"></i>
                <div class="tekla-point-body">
                  <div class="tekla-point-main">
                    <span class="tekla-point-label">{{ factorLabel(factor) }}</span>
                    <span v-if="factorDetail(factor)" class="tekla-point-detail">{{ factorDetail(factor) }}</span>
                    <button
                      v-if="factor.coachAction && factor.action && !readOnly"
                      type="button"
                      class="tekla-point-action"
                      @click="onFactorAction(factor)"
                    >
                      <I18nText
                        :k="factor.action === 'scroll-address' ? 'detail.factorActionAdd' : 'detail.factorActionOpen'"
                      />
                    </button>
                  </div>
                  <p v-if="factor.hintKey" class="tekla-point-hint"><I18nText :k="factor.hintKey" /></p>

                  <ul v-if="factor.items && factor.items.length" class="tekla-stage-docs">
                    <li v-for="(item, i) in factor.items" :key="i" class="tekla-doc">
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

                  <div
                    v-if="showDatePicker(factor) && !readOnly && !shipmentLocked && wednesdayOptions.length"
                    class="tekla-shipment-picker"
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
            </ul>
          </div>
        </li>
      </ol>
    </div>

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

.tekla-process {
  margin: 0;
}

.tekla-stages {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
}

.tekla-stage {
  display: flex;
  gap: 0.9rem;
  align-items: stretch;
}

.tekla-stage-axis {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 2.75rem;
  flex-shrink: 0;
}

.tekla-stage-node {
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: 2px solid var(--color-border);
  background: var(--color-bg-elevated);
  color: var(--color-text-muted);
  z-index: 1;
}

.tekla-stage-node .bi {
  font-size: 1.15rem;
}

.tekla-stage-connector {
  flex: 1;
  width: 4px;
  min-height: 1.35rem;
  margin: 0.2rem 0 0.15rem;
  border-radius: 999px;
  background: var(--color-border);
}

.tekla-stage-connector--closed {
  background: var(--color-success, #16a34a);
}

.tekla-stage-connector--progress {
  background: var(--color-accent);
}

.tekla-stage-connector--warn {
  background: var(--color-warn, #ca8a04);
}

.tekla-stage-connector--skip {
  background: repeating-linear-gradient(
    to bottom,
    var(--color-border) 0 5px,
    transparent 5px 9px
  );
}

.tekla-stage--closed .tekla-stage-node {
  border-color: var(--color-success, #16a34a);
  background: var(--color-success, #16a34a);
  color: #fff;
}

.tekla-stage--progress .tekla-stage-node {
  border-color: var(--color-accent);
  background: var(--color-accent);
  color: var(--color-on-accent, #fff);
  box-shadow: 0 0 0 4px var(--color-accent-soft, color-mix(in srgb, var(--color-accent) 22%, transparent));
}

.tekla-stage--warn .tekla-stage-node {
  border-color: var(--color-warn, #ca8a04);
  background: var(--color-warn, #ca8a04);
  color: #fff;
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-warn, #ca8a04) 22%, transparent);
}

.tekla-stage--skip .tekla-stage-node {
  border-style: dashed;
  border-color: var(--color-border);
  color: var(--color-text-muted);
  background: var(--color-bg);
}

.tekla-stage-content {
  min-width: 0;
  flex: 1;
  margin-bottom: 0.85rem;
  padding: 0.8rem 1rem 0.9rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg, var(--radius));
  background: var(--color-bg-elevated);
}

.tekla-stage:last-child .tekla-stage-content {
  margin-bottom: 0;
}

.tekla-stage--progress .tekla-stage-content {
  border-color: color-mix(in srgb, var(--color-accent) 42%, var(--color-border));
}

.tekla-stage--warn .tekla-stage-content {
  border-color: color-mix(in srgb, var(--color-warn, #ca8a04) 45%, var(--color-border));
}

.tekla-stage--closed .tekla-stage-content {
  border-color: color-mix(in srgb, var(--color-success, #16a34a) 28%, var(--color-border));
}

.tekla-stage--skip .tekla-stage-content {
  background: var(--color-bg);
  border-style: dashed;
}

.tekla-stage-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.4rem 0.55rem;
}

.tekla-stage-index {
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}

.tekla-stage-label {
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--color-text);
  line-height: 1.3;
}

.tekla-stage--skip .tekla-stage-label {
  font-weight: 500;
  color: var(--color-text-muted);
}

.tekla-stage-skip {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.tekla-stage-blocked {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-warn, #ca8a04);
}

.tekla-points {
  list-style: none;
  margin: 0.45rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.tekla-point {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  font-size: var(--text-sm);
  color: var(--color-text);
}

.tekla-point-icon {
  margin-top: 0.12rem;
  flex-shrink: 0;
  color: var(--color-text-muted);
}

.tekla-point.done {
  color: var(--color-text-muted);
}

.tekla-point.done .tekla-point-icon {
  color: var(--color-success, #16a34a);
}

.tekla-point.waiting .tekla-point-icon,
.tekla-point.warn .tekla-point-icon,
.tekla-point.action .tekla-point-icon {
  color: var(--color-warn, #ca8a04);
}

.tekla-point-body {
  min-width: 0;
  flex: 1;
}

.tekla-point-main {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.3rem 0.6rem;
}

.tekla-point-label {
  font-weight: 500;
  line-height: 1.35;
}

.tekla-point-detail {
  margin-left: auto;
  font-weight: 600;
  color: var(--color-text);
}

.tekla-point.done .tekla-point-detail {
  font-weight: 500;
  color: var(--color-text-muted);
}

.tekla-point-hint {
  margin: 0.2rem 0 0;
  font-size: var(--text-xs);
  line-height: 1.4;
  color: var(--color-text-muted);
}

.tekla-point-action {
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-accent);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
}

.tekla-stage-docs {
  list-style: none;
  padding: 0;
  margin: 0.35rem 0 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.tekla-doc {
  margin: 0;
}

.tekla-doc-link,
.tekla-doc-label {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  font-size: var(--text-sm);
  color: var(--color-accent);
  text-decoration: none;
  padding: 0.35rem 0.6rem;
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

.tekla-shipment-picker {
  width: 100%;
  margin-top: 0.5rem;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.4rem;
}

.tekla-shipment-select-label {
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--color-text-muted);
}

.tekla-shipment-select {
  min-width: 16rem;
  max-width: 100%;
  appearance: auto;
  cursor: pointer;
}

.tekla-shipment-form-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.tekla-versandaufschub-input {
  font-size: var(--text-base);
  padding: 0.5rem 0.65rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-bg);
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
  .tekla-point-detail {
    margin-left: 0;
    width: 100%;
  }

  .tekla-shipment-select {
    min-width: 0;
  }
}
</style>

