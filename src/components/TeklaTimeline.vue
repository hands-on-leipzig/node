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

const props = defineProps({
  steps: { type: Array, default: () => [] },
  locale: { type: String, default: 'en' },
  title: { type: String, default: 'Timeline' },
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
})

const emit = defineEmits(['versandaufschub-save', 'shipment-date-save'])

const { t } = useI18n()

const selectedShipmentYmd = ref('')

const isOpen = ref(true)
const expandKey = ref(0)

watch(isOpen, (open) => {
  if (open) expandKey.value += 1
})

const stepLabel = (step) => (props.locale === 'de' ? step.de : step.en) || step.en || step.de || ''
const stepSub = (step) => (props.locale === 'de' ? step.de_sub : step.en_sub) || step.en_sub || step.de_sub || ''

const currentStageIndex = computed(() => {
  let idx = -1
  for (let i = 0; i < props.steps.length; i++) {
    const s = props.steps[i]
    if (s.status === 'closed') idx = i
    else if (s.status === 'progress' || s.status === 'warn') return i
  }
  return idx
})

/** Fill height % for vertical bar: from top down to center of current stage */
const fillHeightPercent = computed(() => {
  if (props.steps.length === 0) return 0
  const n = props.steps.length
  const curr = currentStageIndex.value
  if (curr < 0) return 0
  return ((curr + 0.5) / n) * 100
})

function stepIcon(step) {
  const p = (step.picto || '').toLowerCase()
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
  const t = (item.type || '').toLowerCase()
  if (t === 'order') return 'bi-cart'
  if (t === 'invoice') return 'bi-receipt'
  if (t === 'shipment') return 'bi-truck'
  return 'bi-file-earmark'
}

const pdfModalOpen = ref(false)
const pdfModalUrl = ref('')
const pdfModalTitle = ref('')
const pdfLoading = ref(false)
const pdfError = ref(null)

function isPdfDoc(item) {
  const t = (item.type || '').toLowerCase()
  return t === 'order' || t === 'invoice'
}

/** Invoice/order document status for display: 'paid' | 'open' | 'not_needed'. Null if not applicable. */
function docStatus(item) {
  if (!item) return null
  const t = (item.type || '').toLowerCase()
  if (t !== 'order' && t !== 'invoice') return null
  if (item.payed === true) return 'paid'
  if (item.not_needed === true) return 'not_needed'
  return 'open'
}

function docStatusLabelKey(item) {
  const s = docStatus(item)
  if (!s) return null
  return s === 'paid' ? 'detail.invoiceStatusPaid' : s === 'not_needed' ? 'detail.invoiceStatusNotNeeded' : 'detail.invoiceStatusOpen'
}

async function openPdf(item) {
  if (!props.teklaId || !item?.label) return
  const docType = (item.type || '').toLowerCase()
  if (docType !== 'order' && docType !== 'invoice') return
  pdfError.value = null
  pdfLoading.value = true
  try {
    let blobUrl
    if (props.teklaType === 'classes') {
      blobUrl = await getClassDocumentBlobUrl(props.teklaId, docType, item.label)
    } else if (props.teklaType === 'groups') {
      blobUrl = await getGroupDocumentBlobUrl(props.teklaId, docType, item.label)
    } else {
      blobUrl = await getTeamDocumentBlobUrl(props.teklaId, docType, item.label)
    }
    pdfModalUrl.value = blobUrl
    pdfModalTitle.value = item.label
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

/** Parent passes non-null when Versand step exists; versandaufschub kept as fallback. */
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
  }
})

const isShipmentPickerEnabled = computed(() => shipmentControlsEnabled.value)

/** Aktuell geltender Versandtermin (Standard, sofern kein abweichender gespeichert). */
const plannedYmd = computed(() => schedule.value?.earliestDate || schedule.value?.standardDate || '')

const standardYmd = computed(() => schedule.value?.standardDate || '')
const coachMinYmd = computed(() => schedule.value?.coachMinDate || '')

const isCustomShipment = computed(() => !!schedule.value?.isCustom)

const hasShipmentDate = computed(() => !!plannedYmd.value)

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

function isShipmentStep(step) {
  return step && (step.de === 'Versand' && step.en === 'Shipment')
}

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
</script>

<template>
  <section class="tekla-timeline" :class="{ 'no-title': !title }">
    <button
      v-if="title"
      type="button"
      class="tekla-timeline-header"
      :aria-expanded="isOpen"
      @click="isOpen = !isOpen"
    >
      <span class="tekla-timeline-title">{{ title }}</span>
      <i class="bi tekla-timeline-chevron" :class="isOpen ? 'bi-chevron-down' : 'bi-chevron-right'"></i>
    </button>

    <div class="tekla-timeline-body" :class="{ open: isOpen || !title }">
      <div class="tekla-timeline-inner" :key="expandKey">
        <!-- Vertical track: bar and items in same direction -->
        <div class="tekla-vertical">
          <div class="tekla-rail" aria-hidden="true">
            <div
              class="tekla-rail-fill"
              role="progressbar"
              :aria-valuenow="currentStageIndex + 1"
              :aria-valuemin="0"
              :aria-valuemax="steps.length"
              :style="{ height: fillHeightPercent + '%' }"
            ></div>
          </div>
          <ul class="tekla-stages">
            <li
              v-for="(step, idx) in steps"
              :key="idx"
              class="tekla-stage"
              :class="[step.status, { active: idx === currentStageIndex }]"
              :style="{ '--step-index': idx }"
            >
              <div class="tekla-stage-node">
                <i v-if="step.status === 'closed'" class="bi bi-check-lg tekla-stage-icon"></i>
                <i v-else class="bi tekla-stage-icon" :class="stepIcon(step)"></i>
              </div>
              <div class="tekla-stage-content">
                <div class="tekla-stage-label">{{ stepLabel(step) }}</div>
                <p v-if="stepSub(step)" class="tekla-stage-sub">{{ stepSub(step) }}</p>
                <ul v-if="step.items && step.items.length" class="tekla-stage-docs">
                  <li v-for="(item, i) in step.items" :key="i" class="tekla-doc">
                    <a
                      v-if="item.link"
                      :href="item.link"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="tekla-doc-link"
                    >
                      <i class="bi tekla-doc-icon" :class="itemIcon(item)"></i>
                      <span>{{ item.label }}</span>
                      <span v-if="docStatusLabelKey(item)" class="tekla-doc-status" :class="docStatus(item)" :title="t(docStatusLabelKey(item))">
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
                      <span>{{ item.label }}</span>
                      <span v-if="docStatusLabelKey(item)" class="tekla-doc-status" :class="docStatus(item)" :title="t(docStatusLabelKey(item))">
                        <I18nText :k="docStatusLabelKey(item)" />
                      </span>
                      <i class="bi bi-box-arrow-up-right tekla-doc-external"></i>
                    </button>
                    <span v-else class="tekla-doc-label">
                      <i class="bi tekla-doc-icon" :class="itemIcon(item)"></i>
                      <span>{{ item.label }}</span>
                      <span v-if="docStatusLabelKey(item)" class="tekla-doc-status" :class="docStatus(item)" :title="t(docStatusLabelKey(item))">
                        <I18nText :k="docStatusLabelKey(item)" />
                      </span>
                    </span>
                  </li>
                </ul>
                <!-- Frühestes Versanddatum (Mittwoch) am Versand-Schritt -->
                <div
                  v-if="isShipmentStep(step) && isShipmentPickerEnabled"
                  class="tekla-versandaufschub"
                >
                  <p v-if="hasShipmentDate" class="tekla-shipment-main">
                    <I18nText k="detail.shipmentDateLabel" />
                    <strong>{{ formatShipmentDate(plannedYmd, locale) }}</strong>
                  </p>
                  <p v-else class="tekla-shipment-hint">
                    <I18nText k="detail.shipmentStandardMissing" />
                  </p>
                  <p v-if="isCustomShipment && standardYmd" class="tekla-shipment-current">
                    <I18nText k="detail.shipmentDiffersFromStandard" />
                    <strong>{{ formatShipmentDate(standardYmd, locale) }}</strong>
                  </p>
                  <p v-else-if="hasShipmentDate && standardYmd" class="tekla-shipment-current tekla-shipment-current--standard">
                    <I18nText k="detail.shipmentEarliestIsStandard" />
                  </p>
                  <p v-if="hasShipmentDate" class="tekla-shipment-hint">
                    <I18nText k="detail.shipmentWednesdayHint" />
                  </p>
                  <div v-if="hasShipmentDate && wednesdayOptions.length" class="tekla-versandaufschub-form tekla-shipment-picker">
                    <p class="tekla-shipment-picker-intro">
                      <I18nText k="detail.shipmentPickOptionalIntro" />
                    </p>
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
              </div>
            </li>
          </ul>
        </div>
      </div>
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
.tekla-timeline {
  margin-bottom: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--color-border);
}
.tekla-timeline.no-title {
  padding-top: 0;
  border-top: none;
  margin-bottom: 2rem;
}

.tekla-timeline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 0.5rem 0;
  border: none;
  background: none;
  cursor: pointer;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  transition: color 0.2s;
}

.tekla-timeline-header:hover {
  color: var(--color-text);
}

.tekla-timeline-chevron {
  font-size: 1rem;
  transition: transform 0.3s ease;
  color: var(--color-accent);
}

.tekla-timeline-body {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.45s cubic-bezier(0.4, 0, 0.2, 1);
}

.tekla-timeline-body.open {
  grid-template-rows: 1fr;
}

.tekla-timeline-inner {
  overflow: hidden;
}

/* Vertical: rail and stages in same direction – larger scale */
.tekla-vertical {
  position: relative;
  padding-left: 4rem; /* node (3rem) + gap (1rem) */
}

.tekla-rail {
  position: absolute;
  left: 1.5rem; /* center of 3rem node */
  top: 1.5rem;
  bottom: 1.5rem;
  width: 4px;
  margin-left: -2px;
  background: var(--color-border);
  border-radius: 2px;
  overflow: hidden;
}

.tekla-rail-fill {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  background: linear-gradient(to bottom, var(--color-accent), var(--color-accent-hover));
  border-radius: 2px;
  transition: height 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

.tekla-stages {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.tekla-stage {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
  opacity: 0;
  transform: translateY(6px);
  animation: stage-in 0.35s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  animation-delay: calc(var(--step-index, 0) * 0.06s);
}

.tekla-stage-node {
  width: 3rem;
  height: 3rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-left: -4rem; /* pull into rail column */
  border: 2px solid var(--color-border);
  /* Opaque background so the rail never shows through the circle */
  background: var(--color-bg-elevated);
  transition: border-color 0.2s, background 0.2s, color 0.2s;
  z-index: 1;
}

.tekla-stage-icon {
  font-size: 1.35rem;
  color: var(--color-text-muted);
}

.tekla-stage.closed .tekla-stage-node {
  border-color: var(--color-success, #16a34a);
  background: var(--color-bg-elevated);
  color: var(--color-success, #16a34a);
}

.tekla-stage.progress .tekla-stage-node,
.tekla-stage.active .tekla-stage-node {
  border-color: var(--color-accent);
  background: var(--color-bg-elevated);
  color: var(--color-accent);
  box-shadow: 0 0 0 3px var(--color-accent-muted);
}

.tekla-stage.warn .tekla-stage-node {
  border-color: var(--color-warn, #ca8a04);
  background: var(--color-bg-elevated);
  color: var(--color-warn, #ca8a04);
}

.tekla-stage-content {
  min-width: 0;
  padding: 0.35rem 0;
  flex: 1;
}

.tekla-stage-label {
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--color-text);
  line-height: 1.35;
}

.tekla-stage-sub {
  font-size: var(--text-base);
  color: var(--color-text-muted);
  margin: 0.35rem 0 0;
  line-height: 1.4;
}

.tekla-stage-docs {
  list-style: none;
  padding: 0;
  margin: 0.6rem 0 0;
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
  background: var(--color-bg-elevated);
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

.tekla-doc-paid {
  color: var(--color-success, #16a34a);
  margin-left: 0.25rem;
}

.tekla-doc-status {
  margin-left: 0.25rem;
  font-size: 0.8em;
  opacity: 0.9;
}
.tekla-doc-status.paid {
  color: var(--color-success, #16a34a);
}
.tekla-doc-status.open {
  color: var(--color-warn, #ca8a04);
}
.tekla-doc-status.not_needed {
  color: var(--color-fg-muted);
  font-style: italic;
}

@keyframes stage-in {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.tekla-timeline-body.open .tekla-stage {
  animation: stage-in 0.35s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  animation-delay: calc(var(--step-index, 0) * 0.06s);
}

.tekla-versandaufschub {
  margin-top: 0.75rem;
  padding: 0.75rem 1rem;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.35rem;
}

.tekla-shipment-planned,
.tekla-shipment-main {
  margin: 0 0 0.25rem;
  font-size: var(--text-base);
  font-weight: 500;
  color: var(--color-text);
  line-height: 1.45;
}

.tekla-shipment-planned strong,
.tekla-shipment-main strong {
  font-weight: 700;
}

.tekla-shipment-picker-intro {
  margin: 0 0 0.5rem;
  font-size: var(--text-sm);
  color: var(--color-fg-muted);
  line-height: 1.45;
}

.tekla-shipment-standard,
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

.tekla-shipment-current--standard {
  color: var(--color-success, #16a34a);
}

.tekla-shipment-select-label {
  font-size: var(--text-sm);
  font-weight: 500;
}

.tekla-shipment-select {
  min-width: 16rem;
  max-width: 100%;
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

.tekla-versandaufschub-text {
  font-size: var(--text-base);
  color: var(--color-text);
}

.tekla-versandaufschub-btn {
  font-size: var(--text-sm);
  padding: 0.35rem 0.75rem;
  border-radius: var(--radius);
  border: 1px solid var(--color-accent);
  background: transparent;
  color: var(--color-accent);
  cursor: pointer;
}

.tekla-versandaufschub-btn:hover {
  background: var(--color-accent-soft);
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
  background: var(--color-bg);
  color: var(--color-text);
  width: 100%;
  max-width: 22rem;
}

.tekla-shipment-select {
  appearance: auto;
  cursor: pointer;
}

.tekla-btn {
  font-size: var(--text-sm);
  padding: 0.35rem 0.75rem;
  border-radius: var(--radius);
  border: 1px solid var(--color-border);
  background: var(--color-bg);
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
</style>
