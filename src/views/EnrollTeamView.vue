<script setup>
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { enrollTeam, getAddresses, validateVoucher } from '@/services/draht'
import AddressSelector from '@/components/AddressSelector.vue'

const router = useRouter()
const route = useRoute()
const { t } = useI18n()

const program = route.query.program != null && route.query.program !== ''
  ? parseInt(route.query.program, 10)
  : null
const programId = Number.isFinite(program) && program > 0 ? program : null

const emptyAddressState = () => ({
  useExisting: true,
  addressId: '',
  new: { street: '', postalCode: '', city: '', country: '' },
})

const form = ref({
  name: '',
  schoolOrClub: '',
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
const voucherValid = ref(null) // null = not checked, true = valid, false = invalid
const voucherMessage = ref('')
const voucherType = ref(null) // '1' = forces invoice address, '2' = no form change
const voucherInvoiceId = ref(null) // societe id for type 1
const voucherInvoiceName = ref(null) // display name for type 1

onMounted(async () => {
  try {
    const res = await getAddresses()
    // API returns { data: [ { id, label, street, postalCode, city, country } ] }
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
})

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
    const result = await validateVoucher(code) // no program filter: voucher is validated by code only
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

async function submit() {
  if (!form.value.name?.trim()) {
    error.value = t('enrollTeam.teamNameRequired')
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
      name: form.value.name.trim(),
      schoolOrClub: form.value.schoolOrClub.trim() || undefined,
      location: form.value.location.trim() || undefined,
      zip: form.value.zip.trim() || undefined,
      organization: form.value.organization.trim() || undefined,
      voucher: form.value.voucher.trim() || undefined,
      notes: form.value.notes.trim() || undefined,
      deliveryAddress: buildAddressPayload(form.value.deliveryAddress),
      invoiceAddress: buildInvoiceAddressPayload(),
    }
    if (programId != null) payload.program = programId
    await enrollTeam(payload)
    success.value = true
    voucherValid.value = null
    voucherMessage.value = ''
    voucherType.value = null
    voucherInvoiceId.value = null
    voucherInvoiceName.value = null
    form.value = {
      name: '',
      schoolOrClub: '',
      location: '',
      zip: '',
      organization: '',
      voucher: '',
      notes: '',
      deliveryAddress: emptyAddressState(),
      invoiceAddress: emptyAddressState(),
    }
  } catch (e) {
    error.value = e.response?.data?.message || e.message || t('enrollTeam.enrollmentFailed')
  } finally {
    submitting.value = false
  }
}

function back() {
  router.push({ name: 'dashboard' })
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
      <div class="enroll-icon">
        <i class="bi bi-people-fill"></i>
      </div>
      <h2>{{ t('enrollTeam.title') }}</h2>
      <p class="description">{{ t('enrollTeam.description') }}</p>
    </div>

    <form @submit.prevent="submit" class="form" @focusin="onFormFieldFocus">
      <div class="field">
        <label for="team-name">{{ t('enrollTeam.teamName') }} <span class="required">*</span></label>
        <input
          id="team-name"
          v-model="form.name"
          type="text"
          required
          :placeholder="t('enrollTeam.placeholderName')"
        />
      </div>
      <div class="field">
        <label for="team-location">{{ t('enroll.location') }}</label>
        <input
          id="team-location"
          v-model="form.location"
          type="text"
          :placeholder="t('enrollTeam.placeholderLocation')"
        />
      </div>
      <div class="field">
        <label for="team-zip">{{ t('enroll.postalCode') }}</label>
        <input
          id="team-zip"
          v-model="form.zip"
          type="text"
          :placeholder="t('enrollTeam.placeholderZip')"
        />
      </div>
      <div class="field">
        <label for="team-organization">{{ t('enroll.organization') }}</label>
        <input
          id="team-organization"
          v-model="form.organization"
          type="text"
        />
      </div>
      <div class="field">
        <label for="team-school">{{ t('enrollTeam.schoolClub') }}</label>
        <input
          id="team-school"
          v-model="form.schoolOrClub"
          type="text"
          :placeholder="t('enrollTeam.placeholderSchool')"
        />
      </div>
      <div class="field">
        <label for="team-voucher">{{ t('enroll.voucher') }}</label>
        <input
          id="team-voucher"
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
        id-prefix="team-delivery"
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
        id-prefix="team-invoice"
      />

      <div class="field">
        <label for="team-notes">{{ t('enrollTeam.notes') }}</label>
        <textarea
          id="team-notes"
          v-model="form.notes"
          rows="3"
          :placeholder="t('enrollTeam.optionalNotes')"
        />
      </div>
      <div v-if="error" class="message error">
        <i class="bi bi-exclamation-circle"></i>
        {{ error }}
      </div>
      <div v-if="success" class="message success">
        <i class="bi bi-check-circle-fill"></i>
        {{ t('enrollTeam.success') }}
      </div>
      <div class="actions">
        <button type="button" class="btn btn-ghost" @click="back">
          <i class="bi bi-arrow-left"></i>
          {{ t('enrollTeam.back') }}
        </button>
        <button type="submit" class="btn btn-primary" :disabled="submitting">
          <i v-if="submitting" class="bi bi-arrow-repeat spin"></i>
          <i v-else class="bi bi-check-lg"></i>
          {{ submitting ? t('enrollTeam.submitting') : t('enrollTeam.submit') }}
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
.enroll-icon {
  width: 3rem;
  height: 3rem;
  border-radius: var(--radius);
  background: var(--color-accent-soft);
  color: var(--color-accent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  margin-bottom: 1rem;
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
.form .field {
  margin-bottom: 1.25rem;
}
.form label {
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
  transition: border-color 0.15s;
}
.form textarea {
  min-height: 5rem;
  resize: vertical;
}
.form input:focus,
.form textarea:focus {
  outline: none;
  border-color: var(--color-accent);
}
.form input::placeholder,
.form textarea::placeholder {
  color: var(--color-text-subtle);
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
.voucher-invoice-forced .label {
  display: block;
  font-size: var(--text-base);
  font-weight: 500;
  color: var(--color-text);
  margin-bottom: 0.5rem;
}
.voucher-forced-msg {
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
.message .bi {
  flex-shrink: 0;
  font-size: 1.2rem;
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
  transition: background 0.15s, transform 0.1s;
}
.btn .bi {
  font-size: 1.15rem;
}
.btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
.btn-ghost {
  background: var(--color-bg-muted);
  color: var(--color-text);
}
.btn-ghost:hover:not(:disabled) {
  background: var(--color-bg-hover);
}
.btn-primary {
  background: var(--color-accent);
  color: white;
  box-shadow: 0 4px 14px rgba(255, 122, 0, 0.35);
}
.btn-primary:hover:not(:disabled) {
  background: var(--color-accent-hover);
  transform: translateY(-1px);
}
.spin {
  animation: spin 0.7s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
html[data-theme='dark'] .btn-primary {
  box-shadow: 0 4px 14px rgba(255, 159, 77, 0.3);
}
</style>
