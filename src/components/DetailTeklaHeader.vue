<script setup>
import { computed, ref, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { resolveDetailHeadline, resolveSidebarAccentTone } from '@/utils/enrollmentDisplay'
import DetailEnrollmentBadges from '@/components/DetailEnrollmentBadges.vue'

const props = defineProps({
  card: { type: Object, required: true },
  /** @type {'team'|'class'|'group'} */
  kind: { type: String, required: true },
  editableTeamName: { type: Boolean, default: false },
  savingTeamName: { type: Boolean, default: false },
  teamNameError: { type: String, default: '' },
})

const emit = defineEmits(['save-team-name', 'clear-team-name-error'])

const { t } = useI18n()

const headline = computed(() => resolveDetailHeadline(props.card, props.kind))
const accent = computed(() => resolveSidebarAccentTone(props.card))

const editingName = ref(false)
const draftName = ref('')
const nameInputRef = ref(null)
const localNameError = ref('')

const showTeamNameEdit = computed(() => props.editableTeamName && props.kind === 'team')

watch(
  () => props.card?.label ?? props.card?.name,
  () => {
    if (!editingName.value) {
      draftName.value = String(props.card?.label ?? props.card?.name ?? '').trim()
    }
  },
  { immediate: true },
)

const nameError = computed(() => props.teamNameError || localNameError.value)

function startEditName() {
  emit('clear-team-name-error')
  localNameError.value = ''
  draftName.value = String(props.card?.label ?? props.card?.name ?? '').trim()
  editingName.value = true
  nextTick(() => nameInputRef.value?.focus())
}

function cancelEditName() {
  editingName.value = false
  localNameError.value = ''
  draftName.value = String(props.card?.label ?? props.card?.name ?? '').trim()
}

function submitName() {
  const name = draftName.value.trim()
  if (!name) {
    localNameError.value = t('detail.teamNameRequired')
    return
  }
  localNameError.value = ''
  emit('save-team-name', name)
}

function onNameKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault()
    submitName()
  } else if (e.key === 'Escape') {
    cancelEditName()
  }
}

watch(
  () => props.savingTeamName,
  (saving, wasSaving) => {
    if (wasSaving && !saving && editingName.value && !props.teamNameError && !localNameError.value) {
      editingName.value = false
    }
  },
)
</script>

<template>
  <header class="detail-header" :class="`detail-header--${accent}`">
    <div class="detail-header-top">
      <div class="detail-header-titles">
        <div v-if="showTeamNameEdit" class="detail-title-row">
          <h1
            v-if="!editingName"
            class="detail-title"
            :class="{ 'detail-title--muted': headline.i18nKey }"
          >
          <I18nText v-if="headline.i18nKey" :k="headline.i18nKey" />
          <template v-else>{{ headline.text }}</template>
        </h1>
        <input
          v-else
          ref="nameInputRef"
          v-model="draftName"
          type="text"
          class="detail-title-input"
          maxlength="255"
          :placeholder="t('detail.teamNamePlaceholder')"
          :disabled="savingTeamName"
          @keydown="onNameKeydown"
        />
        <button
          type="button"
          class="detail-name-edit-btn"
          :aria-label="editingName ? t('detail.edit') : t('detail.editTeamName')"
          :disabled="savingTeamName"
          @click="editingName ? submitName() : startEditName()"
        >
          <i class="bi" :class="savingTeamName ? 'bi-arrow-repeat spin' : editingName ? 'bi-check-lg' : 'bi-pencil'" />
        </button>
        <button
          v-if="editingName"
          type="button"
          class="detail-name-edit-btn detail-name-edit-btn--cancel"
          :aria-label="t('common.cancel')"
          :disabled="savingTeamName"
          @click="cancelEditName"
        >
          <i class="bi bi-x-lg" />
        </button>
        </div>
        <h1 v-else class="detail-title">
          <I18nText v-if="headline.i18nKey" :k="headline.i18nKey" />
          <template v-else>{{ headline.text }}</template>
        </h1>
        <span v-if="headline.ref" class="detail-ref">{{ headline.ref }}</span>
      </div>
    </div>
    <p v-if="nameError" class="detail-name-error">{{ nameError }}</p>
    <DetailEnrollmentBadges :card="card" />
  </header>
</template>

<style scoped>
.detail-header {
  margin: 0 0 1.5rem;
  padding: 0.15rem 0 0.15rem 1rem;
  border-left: 4px solid var(--detail-accent-bar, var(--color-accent));
}

.detail-header--challenge {
  --detail-accent-bar: #c62828;
}
.detail-header--explore {
  --detail-accent-bar: #2e7d32;
}
.detail-header--future8 {
  --detail-accent-bar: #1565c0;
}
.detail-header--future5 {
  --detail-accent-bar: #e6a800;
}

.detail-header-top {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.detail-header-titles {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.2rem;
  min-width: 0;
  max-width: 100%;
}

.detail-title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem 0.5rem;
  min-width: 0;
  flex: 1 1 auto;
}

.detail-title {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: -0.02em;
  color: var(--color-text);
}

.detail-title--muted {
  color: var(--color-text-muted);
}

.detail-title-input {
  flex: 1 1 12rem;
  min-width: 8rem;
  max-width: 100%;
  margin: 0;
  padding: 0.2rem 0.5rem;
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: -0.02em;
  color: var(--color-text);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 6px;
}

.detail-title-input:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 0 0 0 2px var(--color-accent-soft);
}

.detail-name-edit-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  flex-shrink: 0;
}

.detail-name-edit-btn:hover:not(:disabled) {
  color: var(--color-accent);
  background: var(--color-accent-soft);
}

.detail-name-edit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.detail-name-error {
  margin: 0.25rem 0 0;
  font-size: 0.875rem;
  color: #c62828;
}

.detail-ref {
  display: block;
  font-size: 0.9375rem;
  font-weight: 600;
  line-height: 1.3;
  color: var(--color-text-muted);
}

.spin {
  animation: detail-name-spin 0.8s linear infinite;
}

@keyframes detail-name-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
