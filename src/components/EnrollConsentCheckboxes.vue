<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import PdfViewerModal from '@/components/PdfViewerModal.vue'
import { participationTermsPdfForLocale } from '@/config/enrollDocuments'
import { fetchParticipationTermsPdfUrls } from '@/services/documentsConfig'
import { getParticipationTermsPdfBlobUrl } from '@/services/draht'
import { usePdfViewer } from '@/composables/usePdfViewer'

const props = defineProps({
  idPrefix: { type: String, default: 'enroll-consent' },
  /** Optional fixed PDF URL; overrides SharePoint config and locale fallback. */
  termsPdfUrl: { type: String, default: '' },
})

const { t, locale } = useI18n()
const { open: termsPdfOpen, url: termsPdfUrl, title: termsPdfTitle, openPdf, close: closeTermsPdf } =
  usePdfViewer()

/** @type {import('vue').Ref<{ de: string, en: string }>} */
const participationTermsFromConfig = ref({ de: '', en: '' })

const activeTermsPdfUrl = computed(() => {
  if (props.termsPdfUrl?.trim()) return props.termsPdfUrl.trim()
  return participationTermsPdfForLocale(locale.value, participationTermsFromConfig.value)
})

const canOpenTermsPdf = computed(() => {
  if (props.termsPdfUrl?.trim()) return true
  const cfg = participationTermsFromConfig.value
  if (cfg?.de || cfg?.en) return true
  return !!activeTermsPdfUrl.value
})

async function openTermsPdf(event) {
  event.preventDefault()
  event.stopPropagation()

  const proxyBlobUrl = await getParticipationTermsPdfBlobUrl(locale.value)
  if (proxyBlobUrl) {
    await openPdf(proxyBlobUrl, t('enroll.consentTermsPdfTitle'))
    return
  }

  const url = activeTermsPdfUrl.value
  if (!url) return
  await openPdf(url, t('enroll.consentTermsPdfTitle'))
}

onMounted(async () => {
  participationTermsFromConfig.value = await fetchParticipationTermsPdfUrls()
})

const consentDataProcessing = defineModel('consentDataProcessing', { type: Boolean, default: false })
const consentTerms = defineModel('consentTerms', { type: Boolean, default: false })
const consentNewsletter = defineModel('consentNewsletter', { type: Boolean, default: false })
</script>

<template>
  <div class="enroll-consents" role="group" :aria-label="t('enroll.consentGroupLabel')">
    <div class="enroll-consents-head">
      <span class="enroll-consents-head-icon" aria-hidden="true">
        <i class="bi bi-shield-check"></i>
      </span>
      <div class="enroll-consents-head-text">
        <h4 class="enroll-consents-title"><I18nText k="enroll.consentGroupLabel" /></h4>
        <p class="enroll-consents-sub"><I18nText k="enroll.consentPanelHint" /></p>
      </div>
    </div>

    <div class="enroll-consents-list">
      <label
        class="enroll-consent-card"
        :class="{ 'is-checked': consentDataProcessing }"
        :for="`${idPrefix}-data`"
      >
        <input
          :id="`${idPrefix}-data`"
          v-model="consentDataProcessing"
          class="enroll-consent-native"
          type="checkbox"
        />
        <span class="enroll-consent-tile" aria-hidden="true">
          <i class="bi bi-check-lg enroll-consent-tile-mark"></i>
        </span>
        <span class="enroll-consent-body">
          <span class="enroll-consent-label">
            <I18nText k="enroll.consentDataProcessing" />
            <span class="required" aria-hidden="true">*</span>
          </span>
        </span>
      </label>

      <label
        class="enroll-consent-card"
        :class="{ 'is-checked': consentTerms }"
        :for="`${idPrefix}-terms`"
      >
        <input
          :id="`${idPrefix}-terms`"
          v-model="consentTerms"
          class="enroll-consent-native"
          type="checkbox"
        />
        <span class="enroll-consent-tile" aria-hidden="true">
          <i class="bi bi-check-lg enroll-consent-tile-mark"></i>
        </span>
        <span class="enroll-consent-body">
          <span class="enroll-consent-label">
            <I18nText k="enroll.consentTermsPrefix" />
            {{ ' ' }}
            <button
              type="button"
              class="enroll-consent-terms-link"
              :disabled="!canOpenTermsPdf"
              @click="openTermsPdf"
            >
              <I18nText k="enroll.consentTermsLink" />
            </button>
            {{ ' ' }}
            <I18nText k="enroll.consentTermsSuffix" />
            <span class="required" aria-hidden="true">*</span>
          </span>
        </span>
      </label>

      <label
        class="enroll-consent-card"
        :class="{ 'is-checked': consentNewsletter }"
        :for="`${idPrefix}-newsletter`"
      >
        <input
          :id="`${idPrefix}-newsletter`"
          v-model="consentNewsletter"
          class="enroll-consent-native"
          type="checkbox"
        />
        <span class="enroll-consent-tile" aria-hidden="true">
          <i class="bi bi-check-lg enroll-consent-tile-mark"></i>
        </span>
        <span class="enroll-consent-body">
          <span class="enroll-consent-label">
            <I18nText k="enroll.consentNewsletter" />
          </span>
        </span>
      </label>
    </div>
  </div>

  <PdfViewerModal
    :show="termsPdfOpen"
    :pdf-url="termsPdfUrl"
    :title="termsPdfTitle"
    @close="closeTermsPdf"
  />
</template>
<style scoped>
.enroll-consents {
  margin-top: 1.25rem;
  margin-bottom: 0.25rem;
  padding: 1.1rem 1.15rem 1.15rem;
  border-radius: 14px;
  background: color-mix(in srgb, var(--color-accent) 7%, var(--color-bg-elevated));
  border: 1px solid color-mix(in srgb, var(--color-accent) 22%, var(--color-border));
  box-shadow:
    0 1px 0 color-mix(in srgb, var(--color-text) 6%, transparent),
    0 12px 32px color-mix(in srgb, var(--color-accent) 8%, transparent);
}

.enroll-consents-head {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  margin-bottom: 1rem;
  padding-bottom: 0.85rem;
  border-bottom: 1px solid color-mix(in srgb, var(--color-text) 8%, transparent);
}

.enroll-consents-head-icon {
  flex-shrink: 0;
  width: 2.25rem;
  height: 2.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  font-size: 1.15rem;
  color: var(--color-accent);
  background: color-mix(in srgb, var(--color-accent) 14%, transparent);
}

.enroll-consents-title {
  margin: 0 0 0.2rem;
  font-size: var(--text-base, 1rem);
  font-weight: 600;
  color: var(--color-text);
  letter-spacing: 0.01em;
}

.enroll-consents-sub {
  margin: 0;
  font-size: var(--text-sm, 0.875rem);
  line-height: 1.45;
  color: var(--color-text-muted);
}

.enroll-consents-list {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.enroll-consent-card {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 0.85rem;
  padding: 0.85rem 1rem;
  border-radius: 12px;
  cursor: pointer;
  border: 1px solid var(--color-border);
  background: var(--color-bg-elevated);
  box-shadow: 0 1px 2px color-mix(in srgb, var(--color-text) 4%, transparent);
  transition:
    border-color 0.18s ease,
    background 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.12s ease;
}

.enroll-consent-card:hover {
  border-color: color-mix(in srgb, var(--color-accent) 45%, var(--color-border));
  box-shadow: 0 4px 16px color-mix(in srgb, var(--color-accent) 12%, transparent);
}

.enroll-consent-card:active {
  transform: scale(0.992);
}

.enroll-consent-card.is-checked {
  border-color: color-mix(in srgb, var(--color-accent) 55%, var(--color-border));
  background: color-mix(in srgb, var(--color-accent) 9%, var(--color-bg-elevated));
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--color-accent) 25%, transparent),
    0 6px 20px color-mix(in srgb, var(--color-accent) 14%, transparent);
}

.enroll-consent-card:has(.enroll-consent-native:focus-visible) {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.enroll-consent-native {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.enroll-consent-tile {
  flex-shrink: 0;
  width: 1.5rem;
  height: 1.5rem;
  margin-top: 0.12rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  border: 2px solid color-mix(in srgb, var(--color-text-muted) 55%, var(--color-border));
  background: var(--color-bg);
  color: transparent;
  transition:
    border-color 0.18s ease,
    background 0.18s ease,
    color 0.15s ease,
    transform 0.2s cubic-bezier(0.34, 1.4, 0.64, 1);
}

.enroll-consent-card:hover .enroll-consent-tile {
  border-color: color-mix(in srgb, var(--color-accent) 50%, var(--color-border));
}

.enroll-consent-card.is-checked .enroll-consent-tile {
  border-color: transparent;
  background: linear-gradient(
    145deg,
    color-mix(in srgb, var(--color-accent) 92%, #fff),
    var(--color-accent)
  );
  color: #fff;
  transform: scale(1.02);
}

.enroll-consent-tile-mark {
  font-size: 0.95rem;
  line-height: 1;
  opacity: 0;
  transform: scale(0.5) rotate(-45deg);
  transition:
    opacity 0.15s ease,
    transform 0.22s cubic-bezier(0.34, 1.4, 0.64, 1);
}

.enroll-consent-card.is-checked .enroll-consent-tile-mark {
  opacity: 1;
  transform: scale(1) rotate(0deg);
}

.enroll-consent-body {
  flex: 1;
  min-width: 0;
}

.enroll-consent-label {
  display: block;
  font-size: var(--text-base, 0.9375rem);
  line-height: 1.5;
  color: var(--color-text);
}

.required {
  color: #dc2626;
  margin-left: 0.15rem;
  font-weight: 600;
}

.enroll-consent-terms-link {
  display: inline;
  padding: 0;
  margin: 0;
  border: none;
  background: none;
  font: inherit;
  font-weight: 600;
  color: var(--color-accent);
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}

.enroll-consent-terms-link:hover:not(:disabled) {
  color: color-mix(in srgb, var(--color-accent) 75%, var(--color-text));
}

.enroll-consent-terms-link:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  text-decoration: none;
}
</style>
