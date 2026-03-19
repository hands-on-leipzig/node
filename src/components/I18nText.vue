<script setup>
import { computed, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { showTranslationKeys, translationEditMode } from '@/i18n'
import { hasAdminRole } from '@/auth/keycloak'
import { openTranslationQuickEdit } from '@/utils/translationQuickEditModal'

const props = defineProps({
  /** vue-i18n message key */
  k: { type: String, required: true },
  /** Interpolation values for t(k, values) */
  values: { type: Object, default: null },
  /** Root HTML tag */
  tag: { type: String, default: 'span' },
  /** Skip pen (e.g. meta UI that should not link to editor) */
  noPen: { type: Boolean, default: false },
})

const { t, locale } = useI18n()
const route = useRoute()

const text = computed(() => t(props.k, props.values ?? {}))

const showPen = computed(
  () =>
    translationEditMode.value &&
    hasAdminRole() &&
    !props.noPen &&
    route.name !== 'admin-translations'
)

const showKeyLayer = computed(() => showTranslationKeys.value)

const keyOpen = ref(false)

const isAdmin = computed(() => hasAdminRole())

const editQuery = computed(() => ({
  name: 'admin-translations',
  query: {
    key: props.k,
    locale: typeof locale.value === 'string' ? locale.value : String(locale.value ?? 'de'),
  },
}))

function onPenClick(e) {
  e.preventDefault()
  e.stopPropagation()
  keyOpen.value = false
  openTranslationQuickEdit(props.k)
}

function openQuickEditFromPopover() {
  keyOpen.value = false
  openTranslationQuickEdit(props.k)
}

function onKeyEnter() {
  if (showKeyLayer.value) keyOpen.value = true
}
function onKeyLeave() {
  keyOpen.value = false
}
</script>

<template>
  <component
    :is="tag"
    class="i18n-text"
    :class="{ 'i18n-text--with-pen': showPen, 'i18n-text--key-hint': showKeyLayer }"
    @mouseenter="onKeyEnter"
    @mouseleave="onKeyLeave"
    @focusin="onKeyEnter"
    @focusout="onKeyLeave"
  >
    <span class="i18n-text-main">{{ text }}</span>
    <button
      v-if="showPen"
      type="button"
      class="i18n-pen"
      :title="t('common.editThisTranslation')"
      :aria-label="t('common.editThisTranslation')"
      @click="onPenClick"
    >
      <i class="bi bi-pencil-square" aria-hidden="true" />
    </button>
    <span
      v-if="showKeyLayer && keyOpen"
      class="i18n-key-popover"
      role="tooltip"
    >
      <code class="i18n-key-code">{{ k }}</code>
      <button
        v-if="isAdmin"
        type="button"
        class="i18n-key-modal-link"
        @click="openQuickEditFromPopover"
      >
        {{ t('common.translationQuickEditTitle') }}
      </button>
      <RouterLink
        v-if="isAdmin"
        class="i18n-key-edit-link"
        :to="editQuery"
        @click="keyOpen = false"
      >
        {{ t('common.openInTranslationEditor') }}
      </RouterLink>
    </span>
  </component>
</template>

<style scoped>
.i18n-text {
  position: relative;
  display: inline-flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.1rem 0.2rem;
  max-width: 100%;
  vertical-align: baseline;
}
.i18n-text--with-pen {
  white-space: normal;
}
.i18n-text-main {
  vertical-align: middle;
}
.i18n-pen {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--color-accent, #0d6efd);
  text-decoration: none;
  opacity: 0.75;
  font-size: 0.85em;
  padding: 0.1rem;
  border-radius: 0.2rem;
  line-height: 1;
  border: none;
  background: transparent;
  cursor: pointer;
  font: inherit;
}
.i18n-pen:hover,
.i18n-pen:focus-visible {
  opacity: 1;
  background: var(--color-accent-soft, rgba(13, 110, 253, 0.12));
  outline: none;
}
.i18n-key-popover {
  position: absolute;
  left: 0;
  top: 100%;
  z-index: 200;
  margin-top: 4px;
  min-width: max-content;
  max-width: min(90vw, 28rem);
  padding: 0.4rem 0.55rem;
  border-radius: 0.35rem;
  background: var(--color-text, #212529);
  color: #fff;
  font-size: 0.75rem;
  font-weight: 500;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  align-items: flex-start;
  pointer-events: auto;
}
.i18n-key-code {
  font-family: ui-monospace, monospace;
  font-size: 0.72rem;
  word-break: break-all;
  color: #e9ecef;
  background: transparent;
}
.i18n-key-modal-link {
  display: block;
  width: 100%;
  text-align: left;
  padding: 0;
  border: none;
  background: none;
  color: #b6d4fe;
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
}
.i18n-key-modal-link:hover {
  color: #e7f1ff;
}
.i18n-key-edit-link {
  color: #9ec5fe;
  font-size: 0.72rem;
  text-decoration: underline;
}
.i18n-key-edit-link:hover {
  color: #cfe2ff;
}
</style>
