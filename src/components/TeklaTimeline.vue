<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { getTeamDocumentBlobUrl, getClassDocumentBlobUrl } from '@/services/draht'
import PdfViewerModal from '@/components/PdfViewerModal.vue'

const props = defineProps({
  steps: { type: Array, default: () => [] },
  locale: { type: String, default: 'en' },
  title: { type: String, default: 'Timeline' },
  /** 'teams' or 'classes' – used to build document URL */
  teklaType: { type: String, default: 'teams' },
  /** Team or class id – used to build document URL */
  teklaId: { type: [String, Number], default: null },
  /** Versandaufschub date (Unix timestamp) or null – show set/change UI next to Versand step when defined (even if null) */
  versandaufschub: { type: [Number, null], default: undefined },
})

const emit = defineEmits(['versandaufschub-save'])

const { t } = useI18n()

const showVersandaufschubForm = ref(false)
const versandaufschubDateStr = ref('')

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

async function openPdf(item) {
  if (!props.teklaId || !item?.label) return
  const docType = (item.type || '').toLowerCase()
  if (docType !== 'order' && docType !== 'invoice') return
  pdfError.value = null
  pdfLoading.value = true
  try {
    const blobUrl =
      props.teklaType === 'classes'
        ? await getClassDocumentBlobUrl(props.teklaId, docType, item.label)
        : await getTeamDocumentBlobUrl(props.teklaId, docType, item.label)
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

const isVersandaufschubEnabled = computed(() => props.versandaufschub !== undefined)

function isShipmentStep(step) {
  return step && (step.de === 'Versand' && step.en === 'Shipment')
}

function formatVersandaufschubDate(ts) {
  if (!ts) return ''
  const d = new Date(typeof ts === 'number' ? ts * 1000 : ts)
  return d.toLocaleDateString(props.locale === 'de' ? 'de-DE' : 'en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function openVersandaufschubForm() {
  versandaufschubDateStr.value = props.versandaufschub
    ? new Date(props.versandaufschub * 1000).toISOString().slice(0, 10)
    : ''
  showVersandaufschubForm.value = true
}

function submitVersandaufschub() {
  const val = versandaufschubDateStr.value?.trim() || null
  emit('versandaufschub-save', val || null)
  showVersandaufschubForm.value = false
}

function clearVersandaufschub() {
  emit('versandaufschub-save', null)
  showVersandaufschubForm.value = false
}

function cancelVersandaufschubForm() {
  showVersandaufschubForm.value = false
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
                      <span v-if="item.payed !== undefined && item.payed" class="tekla-doc-paid" title="Paid">
                        <i class="bi bi-check-circle-fill"></i>
                      </span>
                      <i class="bi bi-box-arrow-up-right tekla-doc-external"></i>
                    </button>
                    <span v-else class="tekla-doc-label">
                      <i class="bi tekla-doc-icon" :class="itemIcon(item)"></i>
                      <span>{{ item.label }}</span>
                      <span v-if="item.payed !== undefined && item.payed" class="tekla-doc-paid" title="Paid">
                        <i class="bi bi-check-circle-fill"></i>
                      </span>
                    </span>
                  </li>
                </ul>
                <!-- Versandaufschub next to Versand step (teams only) -->
                <div
                  v-if="isShipmentStep(step) && isVersandaufschubEnabled"
                  class="tekla-versandaufschub"
                >
                  <template v-if="showVersandaufschubForm">
                    <div class="tekla-versandaufschub-form">
                      <input
                        v-model="versandaufschubDateStr"
                        type="date"
                        class="tekla-versandaufschub-input"
                        :placeholder="t('detail.versandaufschub')"
                      />
                      <button type="button" class="tekla-btn tekla-btn-primary" @click="submitVersandaufschub">
                        {{ t('common.save') }}
                      </button>
                      <button v-if="versandaufschub" type="button" class="tekla-btn" @click="clearVersandaufschub">
                        {{ t('detail.versandaufschubClear') }}
                      </button>
                      <button type="button" class="tekla-btn" @click="cancelVersandaufschubForm">
                        {{ t('common.cancel') }}
                      </button>
                    </div>
                  </template>
                  <template v-else>
                    <span v-if="versandaufschub" class="tekla-versandaufschub-text">
                      {{ t('detail.versandaufschubBis') }} {{ formatVersandaufschubDate(versandaufschub) }}
                    </span>
                    <button
                      type="button"
                      class="tekla-versandaufschub-btn"
                      @click="openVersandaufschubForm"
                    >
                      {{ versandaufschub ? t('detail.versandaufschubChange') : t('detail.versandaufschubSet') }}
                    </button>
                  </template>
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
  padding: 0.5rem 0.75rem;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
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
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
}

.tekla-versandaufschub-input {
  font-size: var(--text-sm);
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
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
  color: var(--color-bg);
  border-color: var(--color-accent);
}
</style>
