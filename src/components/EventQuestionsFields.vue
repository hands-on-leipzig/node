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

const meals = ref({})
const custom = ref({})
const saving = ref(false)
const error = ref('')
const saved = ref(false)

const hasPhoto = computed(() => (props.form?.columns || []).some((column) => column.kind === 'photo'))
const hasMeal = computed(() => (props.form?.columns || []).some((column) => column.kind === 'meal'))
const customColumns = computed(() => (props.form?.columns || []).filter((column) => column.kind === 'custom'))
const peopleCount = computed(() => props.form?.team?.people_count ?? null)
const mealSum = computed(() => Object.values(meals.value).reduce((sum, value) => sum + (Number(value) || 0), 0))
const mealMismatch = computed(() => hasMeal.value && peopleCount.value != null && mealSum.value !== Number(peopleCount.value))

watch(() => props.form, (form) => {
  meals.value = { ...(form?.meals || {}) }
  custom.value = { ...(form?.custom || {}) }
  saved.value = false
  error.value = ''
}, { immediate: true })

function setMeal(key, raw) {
  const n = Number(raw)
  meals.value = { ...meals.value, [key]: Number.isFinite(n) && n >= 0 ? n : 0 }
}

function setCustom(key, value) {
  custom.value = { ...custom.value, [key]: value }
}

async function submit() {
  if (saving.value || mealMismatch.value || !props.form?.team?.id) return
  saving.value = true
  error.value = ''
  saved.value = false
  try {
    const next = await saveTeamForm(
      props.slug,
      props.email,
      props.form.team.id,
      hasMeal.value ? meals.value : undefined,
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
  <form class="event-questions" @submit.prevent="submit">
    <p v-if="form.team?.name" class="event-questions-team">
      {{ form.team.name }}
      <span v-if="form.team.team_number_hot != null">({{ form.team.team_number_hot }})</span>
    </p>
    <p v-if="hasPhoto" class="event-questions-note">{{ t('detail.eventQuestionsPhoto') }}</p>
    <div v-if="hasMeal" class="event-questions-meals">
      <label v-for="option in form.meal_options || []" :key="option.value" class="event-questions-meal">
        <span>{{ option.label }}</span>
        <input
          type="number"
          min="0"
          class="detail-player-input"
          :value="meals[option.value] ?? 0"
          @input="setMeal(option.value, $event.target.value)"
        >
      </label>
      <p class="event-questions-note" :class="{ 'event-questions-error': mealMismatch }">
        {{ t('detail.eventQuestionsMealSum', { sum: mealSum, people: peopleCount ?? '—' }) }}
      </p>
    </div>
    <label v-for="field in customColumns" :key="field.field_key" class="event-questions-field">
      <span>{{ field.label }}</span>
      <input
        v-if="field.type === 'text' || field.type === 'number'"
        class="detail-player-input"
        :type="field.type === 'number' ? 'number' : 'text'"
        :value="custom[field.field_key] ?? ''"
        @input="setCustom(field.field_key, $event.target.value || null)"
      >
      <select
        v-else-if="field.type === 'select'"
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
      <button type="submit" class="detail-btn detail-btn-primary" :disabled="saving || mealMismatch">
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
