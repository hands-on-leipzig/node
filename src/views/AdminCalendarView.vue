<script setup>
import { ref, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  getDashboardCalendarConfig,
  putDashboardCalendarConfig,
  getDashboardCalendarTest,
} from '@/services/draht'

const { t } = useI18n()

const loading = ref(true)
const saving = ref(false)
const testing = ref(false)
const error = ref(null)
const success = ref(false)
const testMessage = ref(null)

const enabled = ref(false)
const userPrincipalName = ref('')
const calendarUrlOrId = ref('')
const daysAhead = ref(90)
const maxEvents = ref(12)

function unwrapBody(res) {
  const raw = res?.data
  if (
    raw?.data &&
    typeof raw.data === 'object' &&
    ('enabled' in raw.data || 'userPrincipalName' in raw.data || 'calendarUrlOrId' in raw.data)
  ) {
    return raw.data
  }
  return raw
}

async function load() {
  loading.value = true
  error.value = null
  testMessage.value = null
  try {
    const res = await getDashboardCalendarConfig()
    const j = unwrapBody(res) || {}
    enabled.value = !!j.enabled
    userPrincipalName.value = String(j.userPrincipalName ?? '').trim()
    calendarUrlOrId.value = String(j.calendarUrlOrId ?? '').trim()
    daysAhead.value = Math.min(365, Math.max(7, Number(j.daysAhead) || 90))
    maxEvents.value = Math.min(50, Math.max(1, Number(j.maxEvents) || 12))
  } catch (e) {
    error.value =
      e.response?.status === 403 ? t('admin.calendarForbidden') : t('admin.calendarLoadFailed')
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  error.value = null
  success.value = false
  testMessage.value = null
  try {
    const res = await putDashboardCalendarConfig({
      enabled: enabled.value,
      userPrincipalName: userPrincipalName.value.trim(),
      calendarUrlOrId: calendarUrlOrId.value.trim(),
      daysAhead: daysAhead.value,
      maxEvents: maxEvents.value,
    })
    const j = unwrapBody(res) || {}
    enabled.value = !!j.enabled
    userPrincipalName.value = String(j.userPrincipalName ?? '').trim()
    calendarUrlOrId.value = String(j.calendarUrlOrId ?? '').trim()
    daysAhead.value = Math.min(365, Math.max(7, Number(j.daysAhead) || 90))
    maxEvents.value = Math.min(50, Math.max(1, Number(j.maxEvents) || 12))
    success.value = true
    setTimeout(() => {
      success.value = false
    }, 5000)
  } catch (e) {
    const msg = e.response?.data?.message || e.response?.data?.error
    error.value =
      e.response?.status === 403 ? t('admin.calendarForbidden') : msg || t('admin.documentsSaveFailed')
  } finally {
    saving.value = false
  }
}

async function runTest() {
  testing.value = true
  error.value = null
  testMessage.value = null
  try {
    const res = await getDashboardCalendarTest()
    const raw = res?.data
    const r = raw?.data && typeof raw.data === 'object' ? raw.data : raw
    if (r?.ok) {
      testMessage.value = t('admin.calendarTestOk', {
        count: Number(r.eventCount) || 0,
        sample: String(r.sampleTitle || '—'),
      })
    } else {
      const msg =
        r?.graphError ||
        (r?.code ? String(r.code) : '') ||
        (r?.graphHttp != null ? `HTTP ${r.graphHttp}` : '') ||
        '—'
      testMessage.value = t('admin.calendarTestFail', { message: msg })
    }
  } catch (e) {
    const msg = e.response?.data?.message || e.message || '—'
    testMessage.value = t('admin.calendarTestFail', { message: msg })
  } finally {
    testing.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="admin-calendar">
    <header class="admin-calendar-head">
      <RouterLink to="/dashboard" class="admin-back">
        <i class="bi bi-arrow-left"></i> <I18nText k="admin.backToDashboard" />
      </RouterLink>
      <h1><I18nText k="admin.calendarTitle" /></h1>
      <p class="admin-lead"><I18nText k="admin.calendarLead" /></p>
    </header>

    <div v-if="loading" class="admin-loading">
      <i class="bi bi-arrow-repeat spin"></i> <I18nText k="dashboard.loading" />
    </div>
    <form v-else class="admin-form" @submit.prevent="save">
      <fieldset class="admin-fieldset">
        <legend><I18nText k="admin.calendarTitle" /></legend>
        <label class="admin-check">
          <input v-model="enabled" type="checkbox" />
          <span><I18nText k="admin.calendarEnabled" /></span>
        </label>

        <label class="admin-label">
          <span><I18nText k="admin.calendarUpn" /></span>
          <input
            v-model="userPrincipalName"
            type="email"
            class="admin-input"
            autocomplete="username"
            :placeholder="t('admin.calendarUpnPlaceholder')"
          />
        </label>
        <p class="admin-hint"><I18nText k="admin.calendarUpnHint" /></p>

        <label class="admin-label">
          <span><I18nText k="admin.calendarUrlOrId" /></span>
          <input
            v-model="calendarUrlOrId"
            type="text"
            class="admin-input"
            autocomplete="off"
            :placeholder="t('admin.calendarUrlOrIdPlaceholder')"
          />
        </label>
        <p class="admin-hint"><I18nText k="admin.calendarUrlOrIdHint" /></p>

        <div class="admin-calendar-row">
          <label class="admin-label admin-label-inline">
            <span><I18nText k="admin.calendarDaysAhead" /></span>
            <input v-model.number="daysAhead" type="number" min="7" max="365" class="admin-input admin-input-narrow" />
          </label>
          <label class="admin-label admin-label-inline">
            <span><I18nText k="admin.calendarMaxEvents" /></span>
            <input v-model.number="maxEvents" type="number" min="1" max="50" class="admin-input admin-input-narrow" />
          </label>
        </div>
      </fieldset>

      <div class="admin-calendar-actions">
        <button type="button" class="admin-btn-secondary" :disabled="testing" @click="runTest">
          <i v-if="testing" class="bi bi-arrow-repeat spin"></i>
          <I18nText k="admin.calendarTest" />
        </button>
      </div>
      <p v-if="testMessage" class="admin-hint admin-test-msg">{{ testMessage }}</p>

      <p v-if="error" class="admin-error"><i class="bi bi-exclamation-circle"></i> {{ error }}</p>
      <p v-if="success" class="admin-success"><i class="bi bi-check-circle"></i> <I18nText k="admin.calendarSaveOk" /></p>

      <button type="submit" class="admin-save" :disabled="saving">
        <i v-if="saving" class="bi bi-arrow-repeat spin"></i>
        <template v-if="saving"><I18nText k="common.save" />…</template>
        <I18nText v-else k="admin.calendarSave" />
      </button>
    </form>
  </div>
</template>

<style scoped>
.admin-calendar {
  max-width: 42rem;
  margin: 0 auto;
  padding-bottom: 2rem;
}
.admin-calendar-head {
  margin-bottom: 1.5rem;
}
.admin-back {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: var(--text-sm);
  color: var(--color-accent);
  text-decoration: none;
  margin-bottom: 0.75rem;
}
.admin-back:hover {
  text-decoration: underline;
}
.admin-calendar h1 {
  font-size: 1.5rem;
  margin: 0 0 0.5rem;
}
.admin-lead {
  color: var(--color-text-muted);
  margin: 0;
  font-size: var(--text-sm);
  line-height: 1.5;
}
.admin-loading {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--color-text-muted);
}
.spin {
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.admin-form {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.admin-fieldset {
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: 1rem 1rem 0.75rem;
  margin: 0 0 1rem;
}
.admin-fieldset legend {
  font-size: var(--text-sm);
  font-weight: 600;
  padding: 0 0.35rem;
}
.admin-check {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin-bottom: 1rem;
  font-weight: 500;
  cursor: pointer;
}
.admin-label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-bottom: 0.35rem;
  font-size: var(--text-sm);
  font-weight: 600;
}
.admin-label-inline {
  flex: 1;
  min-width: 0;
}
.admin-calendar-row {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-top: 0.5rem;
}
.admin-input {
  width: 100%;
  padding: 0.55rem 0.65rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-bg-elevated, #fff);
  color: var(--color-text);
  font: inherit;
}
.admin-input-narrow {
  max-width: 8rem;
}
.admin-hint {
  font-size: 0.8125rem;
  color: var(--color-text-muted);
  margin: 0 0 0.75rem;
  line-height: 1.45;
}
.admin-test-msg {
  margin-top: 0.25rem;
}
.admin-calendar-actions {
  margin-bottom: 0.5rem;
}
.admin-btn-secondary {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.5rem 0.85rem;
  border-radius: var(--radius);
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  color: var(--color-text);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.admin-btn-secondary:hover:not(:disabled) {
  background: var(--color-bg-hover);
}
.admin-btn-secondary:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.admin-error {
  color: var(--color-error, #dc2626);
  margin: 0.25rem 0;
  font-size: var(--text-sm);
}
.admin-success {
  color: #15803d;
  margin: 0.25rem 0;
  font-size: var(--text-sm);
}
.admin-save {
  margin-top: 0.75rem;
  align-self: flex-start;
  padding: 0.65rem 1.25rem;
  border: none;
  border-radius: var(--radius);
  background: var(--color-accent);
  color: #fff;
  font-weight: 700;
  cursor: pointer;
  font: inherit;
}
.admin-save:hover:not(:disabled) {
  opacity: 0.94;
}
.admin-save:disabled {
  opacity: 0.6;
  cursor: wait;
}
</style>
