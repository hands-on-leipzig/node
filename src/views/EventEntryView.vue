<script setup>
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { getUserProfile, isAuthenticated, login } from '@/auth/keycloak'
import EventQuestionsFields from '@/components/EventQuestionsFields.vue'
import { lookupTeamForms, requestTeamCode, verifyTeamCode } from '@/services/flowPublicForm'

const route = useRoute()
const { t } = useI18n()

const slug = computed(() => String(route.params.slug || ''))
const signedIn = computed(() => isAuthenticated())
const profileEmail = computed(() => getUserProfile()?.email || '')

const email = ref('')
const code = ref('')
const formToken = ref('')
const step = ref('choose')
const forms = ref([])
const loading = ref(false)
const error = ref('')

const activeEmail = computed(() => (signedIn.value && profileEmail.value ? profileEmail.value : email.value.trim()))

async function loadForms() {
  loading.value = true
  error.value = ''
  try {
    forms.value = await lookupTeamForms(slug.value, activeEmail.value, formToken.value)
    step.value = 'form'
  } catch (e) {
    error.value = e?.response?.data?.error || e?.message || t('errors.loadFailed')
  } finally {
    loading.value = false
  }
}

async function sendCode() {
  if (!email.value.trim() || loading.value) return
  loading.value = true
  error.value = ''
  try {
    await requestTeamCode(slug.value, email.value.trim())
    step.value = 'code'
  } catch (e) {
    error.value = e?.response?.data?.error || e?.message || t('errors.loadFailed')
  } finally {
    loading.value = false
  }
}

async function confirmCode() {
  if (!code.value.trim() || loading.value) return
  loading.value = true
  error.value = ''
  try {
    formToken.value = await verifyTeamCode(slug.value, email.value.trim(), code.value.trim())
    await loadForms()
  } catch (e) {
    error.value = e?.response?.data?.error || e?.message || t('errors.loadFailed')
  } finally {
    loading.value = false
  }
}

function startSso() {
  login(window.location.href)
}

if (signedIn.value && profileEmail.value) {
  loadForms()
}

function participantHref() {
  return signedIn.value ? '/dashboard' : ''
}

function onSaved(index, next) {
  forms.value = forms.value.map((form, i) => (i === index ? next : form))
}
</script>

<template>
  <div class="detail-view event-entry">
    <h1 class="detail-section-title">{{ t('detail.eventEntryTitle') }}</h1>
    <p class="detail-hint">{{ t('detail.eventEntryLead') }}</p>
    <p v-if="error" class="event-questions-error">{{ error }}</p>
    <p v-if="loading" class="detail-hint">{{ t('dashboard.loading') }}</p>

    <template v-else-if="step !== 'form'">
      <button type="button" class="detail-btn detail-btn-primary" @click="startSso">
        {{ t('home.signInWithSso') }}
      </button>
      <form v-if="step === 'choose'" class="event-entry-mail" @submit.prevent="sendCode">
        <label>
          <span>{{ t('detail.eventEntryEmail') }}</span>
          <input v-model="email" type="email" class="detail-player-input" autocomplete="email" required>
        </label>
        <button type="submit" class="detail-btn detail-btn-ghost">{{ t('detail.eventEntrySendCode') }}</button>
      </form>
      <form v-else class="event-entry-mail" @submit.prevent="confirmCode">
        <p class="detail-hint">{{ t('detail.eventEntryCodeSent') }}</p>
        <label>
          <span>{{ t('detail.eventEntryCode') }}</span>
          <input v-model="code" type="text" inputmode="numeric" maxlength="6" class="detail-player-input" autocomplete="one-time-code" required>
        </label>
        <button type="submit" class="detail-btn detail-btn-primary">{{ t('detail.eventEntryConfirm') }}</button>
      </form>
    </template>

    <template v-else>
      <p v-if="!forms.length" class="detail-hint">{{ t('detail.eventQuestionsHint') }}</p>
      <EventQuestionsFields
        v-for="(form, index) in forms"
        :key="form.team?.id || index"
        :slug="slug"
        :email="activeEmail"
        :form-token="formToken"
        :form="form"
        :participant-href="participantHref()"
        @saved="onSaved(index, $event)"
      />
    </template>
  </div>
</template>

<style scoped>
.event-entry {
  max-width: 40rem;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  padding: 1.25rem 0 2rem;
}
.event-entry-mail {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}
.event-entry-mail label {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.event-questions-error {
  margin: 0;
  color: var(--color-danger, #c0392b);
}
</style>
