<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { enrollFuture, getAddresses, validateVoucher } from '@/services/draht'
import AddressSelector from '@/components/AddressSelector.vue'
import { FUTURE_PUPIL_OPTIONS } from '@/config/enrollmentOptions'

const router = useRouter()
const route = useRoute()
const { t } = useI18n()

const group = computed(() => {
  const g = route.query.group
  return g === '5' || g === '8' ? g : null
})

const step = ref('pupils') // 'pupils' | 'form'
const selectedPupils = ref(null) // 8 | 16 | 24

const emptyAddressState = () => ({
  useExisting: true,
  addressId: '',
  new: { street: '', postalCode: '', city: '', country: '' },
})

const form = ref({
  name: '',
  school: '',
  location: '',
  zip: '',
  organization: '',
  voucher: '',
  notes: '',
  deliveryAddress: emptyAddressState(),
  invoiceAddress: emptyAddressState(),
})

const addresses = ref([])
const submitting = ref(false)
const error = ref(null)
const success = ref(false)
const voucherChecking = ref(false)
const voucherValid = ref(null)
const voucherMessage = ref('')
const voucherType = ref(null)
const voucherInvoiceId = ref(null)
const voucherInvoiceName = ref(null)

onMounted(() => {
  if (!group.value) {
    router.replace({ name: 'dashboard' })
  }
})

async function loadAddresses() {
  try {
    const res = await getAddresses()
    const list = res.data?.data ?? (Array.isArray(res.data) ? res.data : [])
    addresses.value = Array.isArray(list) ? list : []
    if (addresses.value.length === 0) {
      form.value.deliveryAddress = { ...form.value.deliveryAddress, useExisting: false }
      form.value.invoiceAddress = { ...form.value.invoiceAddress, useExisting: false }
    }
  } catch (_) {
    addresses.value = []
    form.value.deliveryAddress = { ...form.value.deliveryAddress, useExisting: false }
    form.value.invoiceAddress = { ...form.value.invoiceAddress, useExisting: false }
  }
}

function choosePupils(num) {
  selectedPupils.value = num
  step.value = 'form'
  loadAddresses()
}

function buildAddressPayload(addr) {
  if (addr.useExisting && addr.addressId) {
    return { addressId: addr.addressId }
  }
  const n = addr.new || {}
  if (!n.street && !n.city && !n.country) return undefined
  return {
    street: n.street?.trim() || undefined,
    postalCode: n.postalCode?.trim() || undefined,
    city: n.city?.trim() || undefined,
    country: n.country?.trim() || undefined,
  }
}

function buildInvoiceAddressPayload() {
  if (voucherType.value === '1' && voucherInvoiceId.value != null) {
    return { addressId: voucherInvoiceId.value }
  }
  return buildAddressPayload(form.value.invoiceAddress)
}

async function onVoucherBlur() {
  const code = form.value.voucher?.trim()
  if (!code) {
    voucherValid.value = null
    voucherMessage.value = ''
    voucherType.value = null
    voucherInvoiceId.value = null
    voucherInvoiceName.value = null
    return
  }
  voucherChecking.value = true
  voucherValid.value = null
  voucherMessage.value = ''
  voucherType.value = null
  voucherInvoiceId.value = null
  voucherInvoiceName.value = null
  try {
    const result = await validateVoucher(code)
    voucherValid.value = result.valid
    voucherMessage.value = result.message || (result.valid ? t('enroll.voucherValid') : t('enroll.voucherInvalid'))
    if (result.valid) {
      voucherType.value = result.voucherType ?? null
      if (result.voucherType === '1') {
        voucherInvoiceId.value = result.invoiceAddressId ?? null
        voucherInvoiceName.value = result.invoiceAddressName ?? null
        if (voucherInvoiceId.value == null) {
          voucherValid.value = false
          voucherMessage.value = t('enroll.voucherInvalid')
        }
      }
    }
  } catch (_) {
    voucherValid.value = false
    voucherMessage.value = t('enroll.voucherInvalid')
  } finally {
    voucherChecking.value = false
  }
}

async function submit() {
  if (!form.value.name?.trim()) {
    error.value = t('enrollFuture.nameRequired')
    return
  }
  if (form.value.voucher?.trim() && voucherValid.value === false) {
    error.value = t('enroll.voucherInvalid')
    return
  }
  error.value = null
  success.value = false
  submitting.value = true
  try {
    const payload = {
      group: group.value,
      pupils: selectedPupils.value,
      name: form.value.name.trim(),
      school: form.value.school.trim() || undefined,
      location: form.value.location.trim() || undefined,
      zip: form.value.zip.trim() || undefined,
      organization: form.value.organization.trim() || undefined,
      voucher: form.value.voucher.trim() || undefined,
      notes: form.value.notes.trim() || undefined,
      deliveryAddress: buildAddressPayload(form.value.deliveryAddress),
      invoiceAddress: buildInvoiceAddressPayload(),
    }
    await enrollFuture(payload)
    success.value = true
    voucherValid.value = null
    voucherMessage.value = ''
    voucherType.value = null
    voucherInvoiceId.value = null
    voucherInvoiceName.value = null
    form.value = {
      name: '',
      school: '',
      location: '',
      zip: '',
      organization: '',
      voucher: '',
      notes: '',
      deliveryAddress: emptyAddressState(),
      invoiceAddress: emptyAddressState(),
    }
  } catch (e) {
    error.value = e.response?.data?.message || e.message || t('enrollFuture.enrollmentFailed')
  } finally {
    submitting.value = false
  }
}

function back() {
  if (step.value === 'form') {
    step.value = 'pupils'
    selectedPupils.value = null
  } else {
    router.push({ name: 'dashboard' })
  }
}

function onFormFieldFocus(e) {
  const el = e.target
  if (el && el.matches && el.matches('input, select, textarea')) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
  }
}
</script>

<template>
  <div class="enroll-page">
    <div class="enroll-view">
      <div class="enroll-head">
        <div class="enroll-icon future-icon">
          <i class="bi bi-stars"></i>
        </div>
        <h2>{{ t('enrollFuture.title') }}</h2>
        <p class="description">{{ t('enrollFuture.description', { group: group || '—' }) }}</p>
      </div>

      <!-- Step 1: Choose number of pupils -->
      <div v-if="step === 'pupils' && group" class="pupils-step">
        <p class="pupils-question">{{ t('enrollFuture.howManyPupils') }}</p>
        <div class="pupils-options">
          <button
            v-for="num in FUTURE_PUPIL_OPTIONS"
            :key="num"
            type="button"
            class="pupils-btn"
            @click="choosePupils(num)"
          >
            {{ num }}
          </button>
        </div>
        <div class="actions">
          <button type="button" class="btn btn-ghost" @click="back">
            <i class="bi bi-arrow-left"></i>
            {{ t('enrollFuture.back') }}
          </button>
        </div>
      </div>

      <!-- Step 2: Form -->
      <form v-else-if="step === 'form' && group" @submit.prevent="submit" class="form" @focusin="onFormFieldFocus">
        <p class="form-context">
          {{ t('enrollFuture.groupLabel', { group: group }) }} · {{ selectedPupils }} {{ t('enrollFuture.pupils') }}
        </p>

        <div class="field">
          <label for="future-name">{{ t('enrollFuture.nameLabel') }} <span class="required">*</span></label>
          <input
            id="future-name"
            v-model="form.name"
            type="text"
            required
            :placeholder="t('enrollFuture.placeholderName')"
          />
        </div>
        <div class="field">
          <label for="future-school">{{ t('enrollClass.school') }}</label>
          <input
            id="future-school"
            v-model="form.school"
            type="text"
            :placeholder="t('enrollClass.placeholderSchool')"
          />
        </div>
        <div class="field">
          <label for="future-location">{{ t('enroll.location') }}</label>
          <input
            id="future-location"
            v-model="form.location"
            type="text"
            :placeholder="t('enrollClass.placeholderLocation')"
          />
        </div>
        <div class="field">
          <label for="future-zip">{{ t('enroll.postalCode') }}</label>
          <input
            id="future-zip"
            v-model="form.zip"
            type="text"
            :placeholder="t('enrollClass.placeholderZip')"
          />
        </div>
        <div class="field">
          <label for="future-organization">{{ t('enroll.organization') }}</label>
          <input id="future-organization" v-model="form.organization" type="text" />
        </div>
        <div class="field">
          <label for="future-voucher">{{ t('enroll.voucher') }}</label>
          <input
            id="future-voucher"
            v-model="form.voucher"
            type="text"
            :placeholder="t('enroll.placeholderVoucher')"
            @input="voucherValid = null; voucherMessage = ''; voucherType = null; voucherInvoiceId = null; voucherInvoiceName = null"
            @blur="onVoucherBlur"
          />
          <p v-if="voucherChecking" class="field-hint checking">
            <i class="bi bi-arrow-repeat spin"></i> {{ t('enroll.voucherChecking') }}
          </p>
          <p v-else-if="voucherValid === true" class="field-hint valid">
            <i class="bi bi-check-circle-fill"></i> {{ voucherMessage }}
          </p>
          <p v-else-if="voucherValid === false" class="field-hint invalid">
            <i class="bi bi-exclamation-circle-fill"></i> {{ voucherMessage }}
          </p>
        </div>

        <AddressSelector
          v-model="form.deliveryAddress"
          :addresses="addresses"
          :label="t('enroll.deliveryAddress')"
          id-prefix="future-delivery"
        />
        <template v-if="voucherType === '1'">
          <div class="field voucher-invoice-forced">
            <label class="label">{{ t('enroll.invoiceAddress') }}</label>
            <p class="field-hint valid voucher-forced-msg">
              <i class="bi bi-info-circle-fill"></i>
              {{ t('enroll.voucherInvoiceForced') }}
              <span v-if="voucherInvoiceName" class="voucher-invoice-name"> ({{ voucherInvoiceName }})</span>
            </p>
          </div>
        </template>
        <AddressSelector
          v-else
          v-model="form.invoiceAddress"
          :addresses="addresses"
          :label="t('enroll.invoiceAddress')"
          id-prefix="future-invoice"
        />

        <div class="field">
          <label for="future-notes">{{ t('enrollClass.notes') }}</label>
          <textarea
            id="future-notes"
            v-model="form.notes"
            rows="3"
            :placeholder="t('enrollClass.optionalNotes')"
          />
        </div>

        <div v-if="error" class="message error">
          <i class="bi bi-exclamation-circle"></i>
          {{ error }}
        </div>
        <div v-if="success" class="message success">
          <i class="bi bi-check-circle-fill"></i>
          {{ t('enrollFuture.success') }}
        </div>
        <div class="actions">
          <button type="button" class="btn btn-ghost" @click="back">
            <i class="bi bi-arrow-left"></i>
            {{ t('enrollFuture.back') }}
          </button>
          <button type="submit" class="btn btn-primary" :disabled="submitting">
            <i v-if="submitting" class="bi bi-arrow-repeat spin"></i>
            <i v-else class="bi bi-check-lg"></i>
            {{ submitting ? t('enrollFuture.submitting') : t('enrollFuture.submit') }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.enroll-page {
  min-height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 1.5rem 0;
}
.enroll-view {
  max-width: 32rem;
  width: 100%;
  text-align: left;
}
.enroll-head {
  margin-bottom: 1.5rem;
}
.enroll-icon.future-icon {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}
.enroll-view h2 {
  font-size: var(--text-2xl);
  font-weight: 600;
  margin-bottom: 0.35rem;
  color: var(--color-text);
}
.description {
  font-size: var(--text-lg);
  color: var(--color-text-muted);
  line-height: 1.5;
}
.pupils-step {
  margin-top: 0.5rem;
}
.pupils-question {
  font-size: var(--text-lg);
  font-weight: 500;
  color: var(--color-text);
  margin-bottom: 1.25rem;
}
.pupils-options {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 1.5rem;
}
.pupils-btn {
  flex: 1;
  min-width: 5rem;
  padding: 1.25rem 1.5rem;
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--color-text);
  background: var(--color-bg-elevated);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg);
  cursor: pointer;
  font-family: inherit;
  transition: border-color 0.2s, background 0.2s;
}
.pupils-btn:hover {
  border-color: var(--color-accent);
  background: var(--color-accent-soft);
}
.form-context {
  font-size: var(--text-base);
  color: var(--color-text-muted);
  margin-bottom: 1.25rem;
  padding: 0.5rem 0;
}
.form .field {
  margin-bottom: 1.25rem;
}
.form label,
.form .label {
  display: block;
  font-size: var(--text-base);
  font-weight: 500;
  color: var(--color-text);
  margin-bottom: 0.5rem;
}
.required {
  color: #dc2626;
}
.form input,
.form textarea {
  width: 100%;
  padding: 0.875rem 1rem;
  min-height: var(--touch-lg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  font-size: var(--text-lg);
  font-family: inherit;
  background: var(--color-bg-elevated);
  color: var(--color-text);
  box-sizing: border-box;
}
.form textarea {
  min-height: 5rem;
  resize: vertical;
}
.field-hint {
  margin: 0.35rem 0 0;
  font-size: var(--text-sm, 0.875rem);
  display: flex;
  align-items: center;
  gap: 0.35rem;
}
.field-hint.checking {
  color: var(--color-text-muted);
}
.field-hint.valid {
  color: #16a34a;
}
.field-hint.invalid {
  color: #dc2626;
}
.field-hint .spin {
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
.voucher-invoice-forced .voucher-forced-msg {
  margin-top: 0;
}
.voucher-invoice-name {
  opacity: 0.9;
}
.message {
  margin-bottom: 1rem;
  padding: 0.875rem 1rem;
  border-radius: var(--radius);
  font-size: var(--text-base);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.message.error {
  background: rgba(220, 38, 38, 0.08);
  color: #dc2626;
}
.message.success {
  background: rgba(22, 163, 74, 0.1);
  color: #16a34a;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 1.5rem;
}
.btn {
  padding: 0.875rem 1.25rem;
  min-height: var(--touch-lg);
  border-radius: var(--radius);
  font-size: var(--text-lg);
  font-weight: 500;
  cursor: pointer;
  border: none;
  font-family: inherit;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}
.btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
.btn-primary {
  background: var(--color-accent);
  color: white;
}
.btn-ghost {
  background: transparent;
  color: var(--color-text-muted);
}
.btn-ghost:hover {
  color: var(--color-text);
}
</style>
