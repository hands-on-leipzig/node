<script setup>
import { ref, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { listAddressBook, createAddress, updateAddress, deleteAddress } from '@/services/draht'
import DevDummyFormFillButton from '@/components/DevDummyFormFillButton.vue'

const { t } = useI18n()

const loading = ref(false)
const saving = ref(false)
const deletingId = ref('')
const error = ref('')
const success = ref('')
const addresses = ref([])
const editingId = ref('')

const form = ref({
  label: '',
  street: '',
  postalCode: '',
  city: '',
  country: 'de',
})

const hasAddresses = computed(() => addresses.value.length > 0)
const isEditing = computed(() => editingId.value !== '')

function resetForm() {
  editingId.value = ''
  form.value = { label: '', street: '', postalCode: '', city: '', country: 'de' }
}

function applyAddressToForm(item) {
  editingId.value = String(item.id || '')
  form.value = {
    label: item.label || '',
    street: item.street || '',
    postalCode: item.postalCode || '',
    city: item.city || '',
    country: item.country || 'de',
  }
}

async function loadAddresses() {
  loading.value = true
  error.value = ''
  try {
    addresses.value = await listAddressBook()
  } catch (e) {
    error.value = e.response?.data?.message || e.message || t('settings.addressesLoadFailed')
  } finally {
    loading.value = false
  }
}

function buildPayload() {
  return {
    label: form.value.label?.trim() || undefined,
    street: form.value.street?.trim() || undefined,
    postalCode: form.value.postalCode?.trim() || undefined,
    city: form.value.city?.trim() || undefined,
    country: form.value.country?.trim() || undefined,
  }
}

async function saveAddress() {
  error.value = ''
  success.value = ''
  const payload = buildPayload()
  if (!payload.street || !payload.postalCode || !payload.city || !payload.country) {
    error.value = t('settings.addressRequiredFields')
    return
  }
  saving.value = true
  try {
    if (isEditing.value) await updateAddress(editingId.value, payload)
    else await createAddress(payload)
    success.value = isEditing.value ? t('settings.addressUpdated') : t('settings.addressCreated')
    await loadAddresses()
    resetForm()
  } catch (e) {
    error.value = e.response?.data?.message || e.message || t('settings.addressSaveFailed')
  } finally {
    saving.value = false
  }
}

async function removeAddress(addressId) {
  error.value = ''
  success.value = ''
  deletingId.value = String(addressId)
  try {
    await deleteAddress(addressId)
    success.value = t('settings.addressDeleted')
    if (editingId.value === String(addressId)) resetForm()
    await loadAddresses()
  } catch (e) {
    error.value = e.response?.data?.message || e.message || t('settings.addressDeleteFailed')
  } finally {
    deletingId.value = ''
  }
}

function fillDevDummy() {
  error.value = ''
  success.value = ''
  form.value = {
    label: 'Büro (Test)',
    street: 'Auguststraße 1',
    postalCode: '10117',
    city: 'Berlin',
    country: 'de',
  }
}

onMounted(loadAddresses)
</script>

<template>
  <div class="settings-view">
    <section class="settings-card">
      <h1 class="settings-title"><I18nText k="common.settings" /></h1>
      <p class="settings-sub"><I18nText k="settings.addressesIntro" /></p>

      <div v-if="error" class="settings-msg settings-msg-error">
        <i class="bi bi-exclamation-circle"></i>{{ error }}
      </div>
      <div v-if="success" class="settings-msg settings-msg-success">
        <i class="bi bi-check-circle"></i>{{ success }}
      </div>

      <div class="settings-grid">
        <div class="settings-block">
          <h2><I18nText k="settings.savedAddressesTitle" /></h2>
          <div v-if="loading" class="settings-loading"><i class="bi bi-arrow-repeat spin"></i></div>
          <div v-else-if="!hasAddresses" class="settings-empty"><I18nText k="settings.noAddressesYet" /></div>
          <ul v-else class="settings-list">
            <li v-for="item in addresses" :key="item.id" class="settings-list-item">
              <div class="settings-address-lines">
                <strong>{{ item.label || t('settings.addressDefaultLabel') }}</strong>
                <span>{{ item.street }}</span>
                <span>{{ item.postalCode }} {{ item.city }}</span>
                <span>{{ item.country?.toUpperCase() }}</span>
              </div>
              <div class="settings-actions">
                <button type="button" class="btn btn-ghost btn-sm" @click="applyAddressToForm(item)">
                  <i class="bi bi-pencil"></i>
                </button>
                <button type="button" class="btn btn-ghost btn-sm" :disabled="deletingId === String(item.id)" @click="removeAddress(item.id)">
                  <i class="bi bi-trash"></i>
                </button>
              </div>
            </li>
          </ul>
        </div>

        <form class="settings-block" @submit.prevent="saveAddress">
          <DevDummyFormFillButton @click="fillDevDummy" />
          <h2>{{ isEditing ? t('settings.editAddressTitle') : t('settings.newAddressTitle') }}</h2>
          <div class="field">
            <label for="addr-label"><I18nText k="settings.addressLabel" /></label>
            <input id="addr-label" v-model="form.label" type="text">
          </div>
          <div class="field">
            <label for="addr-street"><I18nText k="enroll.street" /></label>
            <input id="addr-street" v-model="form.street" type="text" required>
          </div>
          <div class="field-row">
            <div class="field">
              <label for="addr-plz"><I18nText k="enroll.postalCode" /></label>
              <input id="addr-plz" v-model="form.postalCode" type="text" required>
            </div>
            <div class="field">
              <label for="addr-city"><I18nText k="enroll.city" /></label>
              <input id="addr-city" v-model="form.city" type="text" required>
            </div>
          </div>
          <div class="field">
            <label for="addr-country"><I18nText k="enroll.country" /></label>
            <input id="addr-country" v-model="form.country" type="text" maxlength="2" required>
          </div>
          <div class="settings-form-actions">
            <button v-if="isEditing" type="button" class="btn btn-ghost" @click="resetForm">
              <I18nText k="common.cancel" />
            </button>
            <button type="submit" class="btn btn-primary" :disabled="saving">
              <i v-if="saving" class="bi bi-arrow-repeat spin"></i>
              <I18nText v-else k="common.save" />
            </button>
          </div>
        </form>
      </div>
    </section>
  </div>
</template>

<style scoped>
.settings-view { max-width: 72rem; margin: 0 auto; }
.settings-card { background: var(--color-bg-elevated); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 1rem; }
.settings-title { margin: 0; font-size: 1.25rem; }
.settings-sub { margin: 0.35rem 0 1rem; color: var(--color-text-muted); }
.settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
.settings-block { background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius); padding: 0.9rem; }
.settings-block h2 { margin: 0 0 0.7rem; font-size: 1rem; }
.settings-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.6rem; }
.settings-list-item { border: 1px solid var(--color-border); border-radius: var(--radius); padding: 0.65rem; display: flex; justify-content: space-between; gap: 0.75rem; }
.settings-address-lines { display: flex; flex-direction: column; gap: 0.1rem; font-size: 0.88rem; }
.settings-address-lines strong { font-size: 0.92rem; }
.settings-actions { display: flex; gap: 0.4rem; }
.btn-sm { min-height: 2rem; padding: 0.2rem 0.5rem; }
.settings-empty, .settings-loading { color: var(--color-text-muted); font-size: 0.9rem; }
.settings-msg { margin-bottom: 0.7rem; padding: 0.55rem 0.7rem; border-radius: var(--radius); display: inline-flex; align-items: center; gap: 0.45rem; }
.settings-msg-error { border: 1px solid color-mix(in srgb, var(--color-danger) 35%, var(--color-border)); color: var(--color-danger); }
.settings-msg-success { border: 1px solid color-mix(in srgb, var(--color-success) 35%, var(--color-border)); color: var(--color-success); }
.field { margin-bottom: 0.7rem; }
.field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }
.field label { display: block; margin-bottom: 0.25rem; font-size: 0.82rem; color: var(--color-text-muted); }
.field input { width: 100%; min-height: var(--touch); border: 1px solid var(--color-border); border-radius: var(--radius); padding: 0.55rem 0.75rem; background: var(--color-bg-elevated); color: var(--color-text); }
.settings-form-actions { margin-top: 0.8rem; display: flex; justify-content: flex-end; gap: 0.5rem; }
@media (max-width: 880px) {
  .settings-grid { grid-template-columns: 1fr; }
}
</style>
