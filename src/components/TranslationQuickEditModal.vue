<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import enSource from '@/locales/en.js'
import deSource from '@/locales/de.js'
import { deepCloneLocale, flattenLocaleStrings } from '@/utils/localeFlatten'
import { loadAllLocaleDrafts, patchLocaleDraft } from '@/utils/localeDrafts'
import {
  translationQuickEditOpen,
  translationQuickEditKey,
  closeTranslationQuickEdit,
} from '@/utils/translationQuickEditModal'

const { t } = useI18n()

const valEn = ref('')
const valDe = ref('')
const lastSavedEn = ref('')
const lastSavedDe = ref('')

let autosaveTimer = null
let hydrating = false

function clearAutosaveTimer() {
  if (autosaveTimer != null) {
    clearTimeout(autosaveTimer)
    autosaveTimer = null
  }
}

function flushDraftsForKey(key) {
  if (!key) return
  if (valEn.value !== lastSavedEn.value) {
    patchLocaleDraft('en', key, valEn.value)
    lastSavedEn.value = valEn.value
  }
  if (valDe.value !== lastSavedDe.value) {
    patchLocaleDraft('de', key, valDe.value)
    lastSavedDe.value = valDe.value
  }
}

function scheduleAutosave() {
  clearAutosaveTimer()
  autosaveTimer = setTimeout(() => {
    autosaveTimer = null
    if (!translationQuickEditOpen.value) return
    flushDraftsForKey(translationQuickEditKey.value)
  }, 300)
}

function loadValues() {
  const key = translationQuickEditKey.value
  if (!key) return
  hydrating = true
  clearAutosaveTimer()
  const d = loadAllLocaleDrafts()
  const flatEn = { ...flattenLocaleStrings(deepCloneLocale(enSource)), ...d.en }
  const flatDe = { ...flattenLocaleStrings(deepCloneLocale(deSource)), ...d.de }
  valEn.value = flatEn[key] ?? ''
  valDe.value = flatDe[key] ?? ''
  lastSavedEn.value = valEn.value
  lastSavedDe.value = valDe.value
  hydrating = false
}

watch(
  () => [translationQuickEditOpen.value, translationQuickEditKey.value],
  ([open, key], [prevOpen, prevKey]) => {
    if (prevOpen && prevKey && (!open || key !== prevKey)) {
      flushDraftsForKey(prevKey)
      clearAutosaveTimer()
    }
    if (open) loadValues()
  }
)

watch([valEn, valDe], () => {
  if (!translationQuickEditOpen.value || hydrating) return
  scheduleAutosave()
})

function closeModal() {
  clearAutosaveTimer()
  flushDraftsForKey(translationQuickEditKey.value)
  closeTranslationQuickEdit()
}

function save() {
  closeModal()
}

function onBackdrop(e) {
  if (e.target === e.currentTarget) closeModal()
}

onBeforeUnmount(() => {
  clearAutosaveTimer()
  if (translationQuickEditOpen.value) {
    flushDraftsForKey(translationQuickEditKey.value)
  }
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="translationQuickEditOpen"
      class="tqem-backdrop"
      role="dialog"
      aria-modal="true"
      :aria-label="t('common.translationQuickEditTitle')"
      @click="onBackdrop"
    >
      <div class="tqem-dialog" @click.stop>
        <header class="tqem-head">
          <h2 id="tqem-title" class="tqem-title">{{ t('common.translationQuickEditTitle') }}</h2>
          <button type="button" class="tqem-close" :aria-label="t('common.closeDialog')" @click="closeModal">
            <i class="bi bi-x-lg" aria-hidden="true" />
          </button>
        </header>
        <p class="tqem-key">
          <code>{{ translationQuickEditKey }}</code>
        </p>
        <div class="tqem-fields">
          <label class="tqem-label">
            <span>{{ t('admin.i18nEditorColEn') }}</span>
            <textarea v-model="valEn" class="tqem-input" rows="4" />
          </label>
          <label class="tqem-label">
            <span>{{ t('admin.i18nEditorColDe') }}</span>
            <textarea v-model="valDe" class="tqem-input" rows="4" />
          </label>
        </div>
        <footer class="tqem-foot">
          <button type="button" class="tqem-btn tqem-btn-ghost" @click="closeModal">
            {{ t('common.cancel') }}
          </button>
          <button type="button" class="tqem-btn tqem-btn-primary" @click="save">
            {{ t('common.translationQuickEditSave') }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* Above full-screen overlays (e.g. EnrollWizard uses 9999) */
.tqem-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10050;
  background: var(--liquid-modal-scrim-bg, rgba(12, 10, 8, 0.34));
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  box-sizing: border-box;
}
.tqem-dialog {
  width: 100%;
  max-width: 32rem;
  max-height: min(90vh, 640px);
  overflow: auto;
  background: var(--liquid-popover-fill, rgba(255, 255, 255, 0.92));
  color: var(--color-text, #212529);
  border: 1px solid var(--liquid-border, rgba(0, 0, 0, 0.08));
  border-radius: var(--radius-lg, 0.5rem);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(var(--liquid-popover-blur, 80px)) saturate(var(--liquid-popover-saturate, 1.85));
  -webkit-backdrop-filter: blur(var(--liquid-popover-blur, 80px)) saturate(var(--liquid-popover-saturate, 1.85));
}
.tqem-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 1rem 1rem 0;
}
.tqem-title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
}
.tqem-close {
  border: none;
  background: transparent;
  padding: 0.25rem;
  cursor: pointer;
  color: var(--color-text-muted, #6c757d);
  border-radius: 0.25rem;
}
.tqem-close:hover {
  background: var(--color-bg-hover, #f1f3f5);
  color: var(--color-text, #212529);
}
.tqem-key {
  margin: 0.35rem 1rem 0;
  font-size: 0.75rem;
}
.tqem-key code {
  word-break: break-all;
  font-family: ui-monospace, monospace;
  color: var(--color-text-muted, #495057);
}
.tqem-fields {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
}
.tqem-label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.875rem;
  font-weight: 600;
}
.tqem-input {
  width: 100%;
  box-sizing: border-box;
  padding: 0.5rem 0.65rem;
  border: 1px solid var(--color-border, #dee2e6);
  border-radius: var(--radius, 0.375rem);
  background: var(--color-bg, #fff);
  color: inherit;
  font-size: 0.9rem;
  resize: vertical;
  min-height: 4rem;
}
.tqem-input:focus {
  outline: none;
  border-color: var(--color-accent, #0d6efd);
}
.tqem-foot {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0 1rem 1rem;
  flex-wrap: wrap;
}
.tqem-btn {
  padding: 0.5rem 1rem;
  font-weight: 600;
  border-radius: var(--radius, 0.375rem);
  cursor: pointer;
  font-size: 0.9rem;
  border: 1px solid transparent;
}
.tqem-btn-ghost {
  background: transparent;
  border-color: var(--color-border, #dee2e6);
  color: var(--color-text, #212529);
}
.tqem-btn-primary {
  background: var(--color-accent, #0d6efd);
  color: #fff;
}
</style>
