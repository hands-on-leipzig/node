<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { saveTeamForm } from '@/services/flowPublicForm'

const props = defineProps({
  slug: { type: String, required: true },
  email: { type: String, required: true },
  formToken: { type: String, default: '' },
  form: { type: Object, required: true },
  participantHref: { type: String, default: '' },
})

const emit = defineEmits(['saved'])
const { t } = useI18n()

const custom = ref({})
const saving = ref(false)
const error = ref('')
const saved = ref(false)

const customColumns = computed(() => (props.form?.columns || []).filter((column) => column.kind === 'custom'))

function fieldKind(field) {
  return field.type || field.editor || 'text'
}

function customOpen(field) {
  const value = custom.value[field.field_key]
  const kind = fieldKind(field)
  if (kind === 'boolean') return value !== true && value !== false
  if (kind === 'number') return value === null || value === undefined || value === ''
  return value == null || String(value).trim() === ''
}

const answersOpen = computed(() => customColumns.value.some((field) => customOpen(field)))

watch(() => props.form, (form) => {
  custom.value = { ...(form?.custom || {}) }
  saved.value = false
  error.value = ''
}, { immediate: true })

function setCustom(key, value) {
  custom.value = { ...custom.value, [key]: value }
}

async function submit() {
  if (saving.value || !props.form?.team?.id) return
  saving.value = true
  error.value = ''
  saved.value = false
  try {
    const next = await saveTeamForm(
      props.slug,
      props.email,
      props.form.team.id,
      undefined,
      custom.value,
      props.formToken,
    )
    if (next) emit('saved', next)
    saved.value = true
  } catch (e) {
    error.value = e?.response?.data?.error || e?.message || t('errors.loadFailed')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <form v-if="customColumns.length" class="event-questions" @submit.prevent="submit">
    <p v-if="form.team?.name" class="event-questions-team">
      {{ form.team.name }}
      <span v-if="form.team.team_number_hot != null">({{ form.team.team_number_hot }})</span>
    </p>
    <p class="event-questions-status" :class="{ 'event-questions-status--open': answersOpen }">
      {{ answersOpen ? t('detail.eventQuestionsOpen') : t('detail.eventQuestionsFilled') }}
    </p>
    <label v-for="field in customColumns" :key="field.field_key" class="event-questions-field">
      <span>{{ field.label }}</span>
      <input
        v-if="fieldKind(field) === 'text' || fieldKind(field) === 'number'"
        class="detail-player-input"
        :type="fieldKind(field) === 'number' ? 'number' : 'text'"
        :value="custom[field.field_key] ?? ''"
        @input="setCustom(field.field_key, fieldKind(field) === 'number' ? ($event.target.value === '' ? null : Number($event.target.value)) : ($event.target.value || null))"
      >
      <select
        v-else-if="fieldKind(field) === 'select'"
        class="detail-player-input"
        :value="custom[field.field_key] ?? ''"
        @change="setCustom(field.field_key, $event.target.value || null)"
      >
        <option value="">?</option>
        <option v-for="option in field.options || []" :key="option.value" :value="option.value">{{ option.label }}</option>
      </select>
      <span v-else class="event-questions-bool">
        <button type="button" :class="{ active: custom[field.field_key] === null || custom[field.field_key] === undefined }" @click="setCustom(field.field_key, null)">?</button>
        <button type="button" :class="{ active: custom[field.field_key] === true }" @click="setCustom(field.field_key, true)">{{ t('enroll.yes') }}</button>
        <button type="button" :class="{ active: custom[field.field_key] === false }" @click="setCustom(field.field_key, false)">{{ t('enroll.no') }}</button>
      </span>
    </label>
    <p v-if="error" class="event-questions-error">{{ error }}</p>
    <p v-else-if="saved" class="event-questions-note">{{ t('detail.eventQuestionsSaved') }}</p>
    <div class="event-questions-actions">
      <button type="submit" class="detail-btn detail-btn-primary" :disabled="saving">
        {{ saving ? t('detail.eventQuestionsSaving') : t('detail.eventQuestionsSave') }}
      </button>
      <RouterLink v-if="participantHref" class="detail-btn detail-btn-ghost" :to="participantHref">
        {{ t('detail.eventEntryParticipants') }}
      </RouterLink>
    </div>
  </form>
</template>

<style scoped>
.event-questions {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.event-questions-team {
  margin: 0;
  font-weight: 650;
}
.event-questions-status {
  margin: 0;
  font-size: 0.8125rem;
  font-weight: 650;
}
.event-questions-status--open {
  color: var(--color-danger, #c0392b);
}
.event-questions-note,
.event-questions-error {
  margin: 0;
  font-size: 0.875rem;
  color: var(--color-text-muted);
}
.event-questions-error {
  color: var(--color-danger, #c0392b);
}
.event-questions-meals,
.event-questions-field {
  display: grid;
  gap: 0.35rem;
}
.event-questions-meal {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: center;
}
.event-questions-meal input,
.event-questions-field input,
.event-questions-field select {
  max-width: 12rem;
}
.event-questions-bool {
  display: flex;
  gap: 0.35rem;
}
.event-questions-bool button {
  border: 1px solid var(--color-border);
  background: transparent;
  border-radius: 8px;
  padding: 0.25rem 0.6rem;
  cursor: pointer;
}
.event-questions-bool button.active {
  border-color: var(--color-accent);
  color: var(--color-accent);
}
.event-questions-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
</style>
