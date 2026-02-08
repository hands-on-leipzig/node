<script setup>
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { enrollTeam, enrollClass, enrollFuture, getAddresses, validateVoucher } from '@/services/draht'
import AddressSelector from '@/components/AddressSelector.vue'
import { FUTURE_PUPIL_OPTIONS } from '@/config/enrollmentOptions'
import logoHot from '@/assets/hot.png'
import logoHotOutline from '@/assets/hot_outline.png'
import logoHotFll from '@/assets/hot+fll.png'
import logoFirstH from '@/assets/first_h.png'
import logoFirstV from '@/assets/first_v.png'
import logoFirstFllH from '@/assets/first+fll_h.png'
import logoFirstFllV from '@/assets/first+fll_v.png'
import logoFllExploreH from '@/assets/fll_explore_h.png'
import logoFllExploreHs from '@/assets/fll_explore_hs.png'
import logoFllExploreV from '@/assets/fll_explore_v.png'
import logoFllChallengeH from '@/assets/fll_challenge_h.png'
import logoFllChallengeHs from '@/assets/fll_challenge_hs.png'
import logoFllChallengeV from '@/assets/fll_challenge_v.png'
import logoFuture from '@/assets/first_canopy_fll_future_edition_rgb_fullcolor_ohne_HG-Fläche.png'
import logoMain from '@/assets/logo.svg'

const props = defineProps({
  open: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'success'])

const { t } = useI18n()
const router = useRouter()

const emptyAddressState = () => ({
  useExisting: true,
  addressId: '',
  new: { street: '', postalCode: '', city: '', country: '' },
})

// Step 1
const edition = ref(null) // 'founders' | 'future'
// Step 2: Future = group '5'|'8', Founders = variant 'explore'|'challenge'
const futureGroup = ref(null)
const foundersVariant = ref(null)
// Step 3: Future = pupils 8|16|24, Founders = type 'team'|'class'
const futurePupils = ref(null)
const foundersType = ref(null)
// Step 4
const formData = ref({
  name: '',
  schoolOrClub: '',
  school: '',
  location: '',
  zip: '',
  organization: '',
  notes: '',
  grade: '',
  teacherName: '',
  description: '',
  playersTotal: '',
})
// Step 5
const voucher = ref('')
const voucherChecking = ref(false)
const voucherValid = ref(null)
const voucherMessage = ref('')
const voucherType = ref(null)
const voucherInvoiceId = ref(null)
const voucherInvoiceName = ref(null)
// Step 6
const deliveryAddress = ref(emptyAddressState())
const invoiceAddress = ref(emptyAddressState())
const addresses = ref([])

const step = ref(1)
const submitting = ref(false)
const error = ref(null)
const success = ref(false)
const successMessage = ref('')

const totalSteps = computed(() => {
  return 6
})

const progress = computed(() => {
  if (totalSteps.value <= 1) return 0
  return Math.round(((step.value - 1) / (totalSteps.value - 1)) * 100)
})

const stepTitle = computed(() => {
  if (step.value === 1) return t('wizard.stepEdition')
  if (step.value === 2) return edition.value === 'future' ? t('wizard.stepFutureGroup') : t('wizard.stepVariant')
  if (step.value === 3) return edition.value === 'future' ? t('wizard.stepPupils') : t('wizard.stepTeamClass')
  if (step.value === 4) return t('wizard.stepData')
  if (step.value === 5) return t('wizard.stepVoucher')
  if (step.value === 6) return t('wizard.stepAddresses')
  return ''
})

const foundersLogos = [{ src: logoFirstFllH, alt: 'FIRST LEGO League' }]

const futureLogos = [{ src: logoFuture, alt: 'Future Edition' }]

function openWizard() {
  edition.value = null
  futureGroup.value = null
  foundersVariant.value = null
  futurePupils.value = null
  foundersType.value = null
  formData.value = { name: '', schoolOrClub: '', school: '', location: '', zip: '', organization: '', notes: '', grade: '', teacherName: '', description: '', playersTotal: '' }
  voucher.value = ''
  voucherValid.value = null
  voucherMessage.value = ''
  voucherType.value = null
  voucherInvoiceId.value = null
  voucherInvoiceName.value = null
  deliveryAddress.value = emptyAddressState()
  invoiceAddress.value = emptyAddressState()
  step.value = 1
  error.value = null
  success.value = false
}

function close() {
  emit('close')
}

function isFilled(value) {
  return value !== null && value !== undefined && String(value).trim() !== ''
}

function getCreatedId(res) {
  if (!res) return null
  if (typeof res.data === 'number') return res.data
  if (res.data && typeof res.data.id === 'number') return res.data.id
  if (res.data && res.data.data && typeof res.data.data.id === 'number') return res.data.data.id
  return null
}

function successMessageFor(kind) {
  if (kind === 'team') return t('wizard.successTeamRedirect')
  if (kind === 'class') return t('wizard.successClassRedirect')
  return t('wizard.success')
}

function canNext() {
  if (step.value === 1) return edition.value != null
  if (step.value === 2) return edition.value === 'future' ? futureGroup.value != null : foundersVariant.value != null
  if (step.value === 3) return edition.value === 'future' ? futurePupils.value != null : foundersType.value != null
  if (step.value === 4) return !!formData.value.name?.trim()
  if (step.value === 5) return true
  if (step.value === 6) return true
  return false
}

function next() {
  if (step.value === 2 && edition.value === 'future') loadAddresses()
  if (step.value === 3) loadAddresses() // have addresses ready for step 6
  if (step.value < totalSteps.value) step.value++
}

function prev() {
  if (step.value > 1) step.value--
}

async function loadAddresses() {
  try {
    const res = await getAddresses()
    const list = res.data?.data ?? (Array.isArray(res.data) ? res.data : [])
    addresses.value = Array.isArray(list) ? list : []
    if (addresses.value.length === 0) {
      deliveryAddress.value = { ...deliveryAddress.value, useExisting: false }
      invoiceAddress.value = { ...invoiceAddress.value, useExisting: false }
    }
  } catch (_) {
    addresses.value = []
    deliveryAddress.value = { ...deliveryAddress.value, useExisting: false }
    invoiceAddress.value = { ...invoiceAddress.value, useExisting: false }
  }
}

function buildAddressPayload(addr) {
  if (addr.useExisting && addr.addressId) return { addressId: addr.addressId }
  const n = addr.new || {}
  if (!n.street && !n.city && !n.country) return undefined
  return { street: n.street?.trim() || undefined, postalCode: n.postalCode?.trim() || undefined, city: n.city?.trim() || undefined, country: n.country?.trim() || undefined }
}

function buildInvoicePayload() {
  if (voucherType.value === '1' && voucherInvoiceId.value != null) return { addressId: voucherInvoiceId.value }
  return buildAddressPayload(invoiceAddress.value)
}

function formatSubmitError(e) {
  const status = e.response?.status
  const statusText = e.response?.statusText
  const message = e.response?.data?.message || e.response?.data?.error || e.message
  if (status) {
    const details = [status, statusText].filter(Boolean).join(' ')
    if (message) return `${message} (${details})`
    return t('wizard.enrollmentFailed') + ` (${details})`
  }
  return message || t('wizard.enrollmentFailed')
}

async function onVoucherBlur() {
  const code = voucher.value?.trim()
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
  if (!formData.value.name?.trim()) {
    error.value = t('wizard.nameRequired')
    return
  }
  if (voucher.value?.trim() && voucherValid.value === false) {
    error.value = t('enroll.voucherInvalid')
    return
  }
  error.value = null
  submitting.value = true
  try {
    if (edition.value === 'future') {
      const payload = {
        group: futureGroup.value,
        pupils: futurePupils.value,
        name: formData.value.name.trim(),
        school: formData.value.school?.trim() || undefined,
        location: formData.value.location?.trim() || undefined,
        zip: formData.value.zip?.trim() || undefined,
        organization: formData.value.organization?.trim() || undefined,
        voucher: voucher.value?.trim() || undefined,
        notes: formData.value.notes?.trim() || undefined,
        deliveryAddress: buildAddressPayload(deliveryAddress.value),
        invoiceAddress: buildInvoicePayload(),
      }
      await enrollFuture(payload)
      successMessage.value = t('wizard.success')
    } else {
      const isTeam = foundersType.value === 'team'
      const program = foundersVariant.value === 'explore' ? (isTeam ? 1 : 4) : (isTeam ? 2 : 5)
      const payload = {
        program,
        name: formData.value.name.trim(),
        schoolOrClub: isTeam ? (formData.value.schoolOrClub?.trim() || undefined) : undefined,
        school: !isTeam ? (formData.value.school?.trim() || undefined) : undefined,
        location: formData.value.location?.trim() || undefined,
        zip: formData.value.zip?.trim() || undefined,
        organization: formData.value.organization?.trim() || undefined,
        voucher: voucher.value?.trim() || undefined,
        notes: formData.value.notes?.trim() || undefined,
        deliveryAddress: buildAddressPayload(deliveryAddress.value),
        invoiceAddress: buildInvoicePayload(),
      }
      if (!isTeam) {
        payload.grade = formData.value.grade?.trim() || undefined
        payload.teacherName = formData.value.teacherName?.trim() || undefined
        payload.description = formData.value.description?.trim() || undefined
        const v = formData.value.playersTotal
        if (v !== '' && v != null) {
          const n = parseInt(String(v).trim(), 10)
          if (Number.isFinite(n)) payload.playersTotal = n
        }
      }
      let res
      if (isTeam) res = await enrollTeam(payload)
      else res = await enrollClass(payload)
      const createdId = getCreatedId(res)
      successMessage.value = successMessageFor(isTeam ? 'team' : 'class')
      if (createdId) {
        setTimeout(() => {
          close()
          router.push({ name: isTeam ? 'team-detail' : 'class-detail', params: { id: createdId } })
        }, 1200)
      }
    }
    success.value = true
    emit('success')
    if (edition.value === 'future') {
      setTimeout(() => { close() }, 1500)
    }
  } catch (e) {
    error.value = formatSubmitError(e)
  } finally {
    submitting.value = false
  }
}

watch(() => props.open, (isOpen) => {
  if (isOpen) openWizard()
})

watch(edition, (val) => {
  if (!props.open || !val) return
  if (step.value === 1) next()
})

watch(futureGroup, (val) => {
  if (!props.open || !val) return
  if (step.value === 2 && edition.value === 'future') next()
})

watch(foundersVariant, (val) => {
  if (!props.open || !val) return
  if (step.value === 2 && edition.value !== 'future') next()
})

watch(futurePupils, (val) => {
  if (!props.open || val == null) return
  if (step.value === 3 && edition.value === 'future') next()
})

watch(foundersType, (val) => {
  if (!props.open || !val) return
  if (step.value === 3 && edition.value !== 'future') next()
})
</script>

<template>
  <div v-if="open" class="wizard-backdrop" @click.self="close">
    <div class="wizard-modal" role="dialog" aria-modal="true" aria-labelledby="wizard-title">
      <div class="wizard-hero">
        <div class="wizard-hero-content">
          <p class="wizard-eyebrow">{{ t('wizard.stepEdition') }}</p>
          <h2 id="wizard-title">{{ t('wizard.ctaTitle') }}</h2>
          <p class="wizard-hero-text">{{ t('dashboard.intro') }}</p>
          <div class="wizard-hero-progress">
            <div class="wizard-progress-bar" role="progressbar" :aria-valuenow="progress" aria-valuemin="0" aria-valuemax="100">
              <span :style="{ width: `${progress}%` }"></span>
            </div>
            <p class="wizard-step-label">{{ stepTitle }} ({{ step }}/{{ totalSteps }})</p>
          </div>
          <div class="wizard-hero-hint">
            <i class="bi bi-lightning-charge-fill"></i>
            {{ stepTitle }}
          </div>
        </div>
      </div>

      <div class="wizard-panel">
        <div class="wizard-header">
          <button type="button" class="wizard-close" aria-label="Close" @click="close">
            <i class="bi bi-x-lg"></i>
          </button>
        </div>

        <div class="wizard-body">
          <!-- Step 1: Edition -->
          <div v-show="step === 1" class="wizard-step">
            <div class="wizard-options wizard-options-two">
              <button type="button" class="wizard-option wizard-option-card" :class="{ active: edition === 'founders' }" @click="edition = 'founders'">
                <div class="wizard-option-main">{{ t('dashboard.editionFounders') }}</div>
                <div class="wizard-option-desc">{{ t('wizard.editionFoundersDesc') }}</div>
                <div class="wizard-option-logos">
                  <img v-for="logo in foundersLogos" :key="logo.src" :src="logo.src" :alt="logo.alt" loading="lazy" />
                </div>
              </button>
              <button type="button" class="wizard-option wizard-option-card" :class="{ active: edition === 'future' }" @click="edition = 'future'">
                <div class="wizard-option-main">{{ t('dashboard.editionFuture') }}</div>
                <div class="wizard-option-desc">{{ t('wizard.editionFutureDesc') }}</div>
                <div class="wizard-option-logos wizard-option-logos-single">
                  <img v-for="logo in futureLogos" :key="logo.src" :src="logo.src" :alt="logo.alt" loading="lazy" />
                </div>
              </button>
            </div>
          </div>

          <!-- Step 2: Future = group 5+/8+, Founders = Explore/Challenge -->
          <div v-show="step === 2" class="wizard-step">
            <template v-if="edition === 'future'">
              <div class="wizard-options wizard-options-two">
                <button type="button" class="wizard-option wizard-option-card" :class="{ active: futureGroup === '5' }" @click="futureGroup = '5'">
                  <div class="wizard-option-main">{{ t('dashboard.optionFutureGroup5') }}</div>
                  <div class="wizard-option-desc">{{ t('wizard.futureGroup5Desc') }}</div>
                </button>
                <button type="button" class="wizard-option wizard-option-card" :class="{ active: futureGroup === '8' }" @click="futureGroup = '8'">
                  <div class="wizard-option-main">{{ t('dashboard.optionFutureGroup8') }}</div>
                  <div class="wizard-option-desc">{{ t('wizard.futureGroup8Desc') }}</div>
                </button>
              </div>
            </template>
            <template v-else>
              <div class="wizard-options wizard-options-two">
                <button type="button" class="wizard-option wizard-option-card" :class="{ active: foundersVariant === 'explore' }" @click="foundersVariant = 'explore'">
                  <img :src="logoFllExploreHs" alt="" class="wizard-option-logo" />
                  <div class="wizard-option-main">{{ t('wizard.optionExplore') }}</div>
                  <div class="wizard-option-desc">{{ t('wizard.optionExploreDesc') }}</div>
                </button>
                <button type="button" class="wizard-option wizard-option-card" :class="{ active: foundersVariant === 'challenge' }" @click="foundersVariant = 'challenge'">
                  <img :src="logoFllChallengeHs" alt="" class="wizard-option-logo" />
                  <div class="wizard-option-main">{{ t('wizard.optionChallenge') }}</div>
                  <div class="wizard-option-desc">{{ t('wizard.optionChallengeDesc') }}</div>
                </button>
              </div>
            </template>
          </div>

          <!-- Step 3: Future = pupils, Founders = Team/Class -->
          <div v-show="step === 3" class="wizard-step">
            <template v-if="edition === 'future'">
              <p class="wizard-question">{{ t('enrollFuture.howManyPupils') }}</p>
              <div class="wizard-options wizard-options-three">
                <button
                  v-for="num in FUTURE_PUPIL_OPTIONS"
                  :key="num"
                  type="button"
                  class="wizard-option"
                  :class="{ active: futurePupils === num }"
                  @click="futurePupils = num"
                >
                  {{ num }}
                </button>
              </div>
            </template>
            <template v-else>
              <div class="wizard-options wizard-options-two">
                <button type="button" class="wizard-option wizard-option-card" :class="{ active: foundersType === 'team' }" @click="foundersType = 'team'">
                  <img :src="logoHot" alt="" class="wizard-option-logo" />
                  <div class="wizard-option-main">{{ t('dashboard.team') }}</div>
                  <div class="wizard-option-desc">{{ t('wizard.teamDesc') }}</div>
                </button>
                <button type="button" class="wizard-option wizard-option-card" :class="{ active: foundersType === 'class' }" @click="foundersType = 'class'">
                  <img :src="logoFirstH" alt="" class="wizard-option-logo" />
                  <div class="wizard-option-main">{{ t('dashboard.class') }}</div>
                  <div class="wizard-option-desc">{{ t('wizard.classDesc') }}</div>
                </button>
              </div>
            </template>
          </div>

          <!-- Step 4: Form data -->
          <div v-show="step === 4" class="wizard-step wizard-step-form">
            <div class="field" :class="{ filled: isFilled(formData.name) }">
              <input v-model="formData.name" type="text" placeholder=" " />
              <label>{{ foundersType === 'team' ? t('enrollTeam.teamName') : (edition === 'future' ? t('enrollFuture.nameLabel') : t('enrollClass.className')) }} <span class="required">*</span></label>
            </div>
            <div v-if="foundersType === 'team'" class="field" :class="{ filled: isFilled(formData.schoolOrClub) }">
              <input v-model="formData.schoolOrClub" type="text" placeholder=" " />
              <label>{{ t('enrollTeam.schoolClub') }}</label>
            </div>
            <div v-if="foundersType === 'class' || edition === 'future'" class="field" :class="{ filled: isFilled(formData.school) }">
              <input v-model="formData.school" type="text" placeholder=" " />
              <label>{{ t('enrollClass.school') }}</label>
            </div>
            <div class="field" :class="{ filled: isFilled(formData.location) }">
              <input v-model="formData.location" type="text" placeholder=" " />
              <label>{{ t('enroll.location') }}</label>
            </div>
            <div class="field" :class="{ filled: isFilled(formData.zip) }">
              <input v-model="formData.zip" type="text" placeholder=" " />
              <label>{{ t('enroll.postalCode') }}</label>
            </div>
            <div class="field" :class="{ filled: isFilled(formData.organization) }">
              <input v-model="formData.organization" type="text" placeholder=" " />
              <label>{{ t('enroll.organization') }}</label>
            </div>
            <template v-if="foundersType === 'class'">
              <div class="field" :class="{ filled: isFilled(formData.grade) }">
                <input v-model="formData.grade" type="text" placeholder=" " />
                <label>{{ t('enrollClass.grade') }}</label>
              </div>
              <div class="field" :class="{ filled: isFilled(formData.teacherName) }">
                <input v-model="formData.teacherName" type="text" placeholder=" " />
                <label>{{ t('enrollClass.teacherName') }}</label>
              </div>
              <div class="field" :class="{ filled: isFilled(formData.description) }">
                <input v-model="formData.description" type="text" placeholder=" " />
                <label>{{ t('enrollClass.description') }}</label>
              </div>
              <div class="field" :class="{ filled: isFilled(formData.playersTotal) }">
                <input v-model="formData.playersTotal" type="number" min="0" step="1" placeholder=" " />
                <label>{{ t('enrollClass.playersTotal') }}</label>
              </div>
            </template>
            <div class="field" :class="{ filled: isFilled(formData.notes) }">
              <textarea v-model="formData.notes" rows="2" placeholder=" " />
              <label>{{ t('enrollTeam.notes') }}</label>
            </div>
          </div>

          <!-- Step 5: Voucher -->
          <div v-show="step === 5" class="wizard-step wizard-step-form">
            <div class="field" :class="{ filled: isFilled(voucher) }">
              <input
                v-model="voucher"
                type="text"
                placeholder=" "
                @input="voucherValid = null; voucherMessage = ''; voucherType = null; voucherInvoiceId = null; voucherInvoiceName = null"
                @blur="onVoucherBlur"
              />
              <label>{{ t('enroll.voucher') }}</label>
              <p v-if="voucherChecking" class="field-hint checking"><i class="bi bi-arrow-repeat spin"></i> {{ t('enroll.voucherChecking') }}</p>
              <p v-else-if="voucherValid === true" class="field-hint valid"><i class="bi bi-check-circle-fill"></i> {{ voucherMessage }}</p>
              <p v-else-if="voucherValid === false" class="field-hint invalid"><i class="bi bi-exclamation-circle-fill"></i> {{ voucherMessage }}</p>
            </div>
            <template v-if="voucherType === '1'">
              <p class="field-hint valid voucher-forced-msg"><i class="bi bi-info-circle-fill"></i> {{ t('enroll.voucherInvoiceForced') }} <span v-if="voucherInvoiceName">({{ voucherInvoiceName }})</span></p>
            </template>
          </div>

          <!-- Step 6: Addresses -->
          <div v-show="step === 6" class="wizard-step wizard-step-form">
            <AddressSelector v-model="deliveryAddress" :addresses="addresses" :label="t('enroll.deliveryAddress')" id-prefix="wizard-delivery" />
            <template v-if="voucherType === '1'">
              <div class="field voucher-invoice-forced">
                <label class="label">{{ t('enroll.invoiceAddress') }}</label>
                <p class="field-hint valid voucher-forced-msg"><i class="bi bi-info-circle-fill"></i> {{ t('enroll.voucherInvoiceForced') }} <span v-if="voucherInvoiceName">({{ voucherInvoiceName }})</span></p>
              </div>
            </template>
            <AddressSelector v-else v-model="invoiceAddress" :addresses="addresses" :label="t('enroll.invoiceAddress')" id-prefix="wizard-invoice" />
          </div>
        </div>

        <div v-if="error" class="wizard-message error"><i class="bi bi-exclamation-circle"></i> {{ error }}</div>
        <div v-if="success" class="wizard-message success"><i class="bi bi-check-circle-fill"></i> {{ successMessage || t('wizard.success') }}</div>

        <div class="wizard-footer">
          <button type="button" class="btn btn-ghost" :disabled="step === 1" @click="prev">
            <i class="bi bi-arrow-left"></i> {{ t('wizard.back') }}
          </button>
          <button v-if="step < totalSteps" type="button" class="btn btn-primary" :disabled="!canNext()" @click="next">
            {{ t('wizard.next') }} <i class="bi bi-arrow-right"></i>
          </button>
          <button v-else type="button" class="btn btn-primary" :disabled="submitting || !formData.name?.trim()" @click="submit">
            <i v-if="submitting" class="bi bi-arrow-repeat spin"></i>
            <i v-else class="bi bi-check-lg"></i>
            {{ submitting ? t('wizard.submitting') : t('wizard.submit') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wizard-backdrop {
  position: fixed;
  inset: 0;
  background: radial-gradient(circle at top, rgba(37, 99, 235, 0.2), transparent 55%),
    radial-gradient(circle at 20% 20%, rgba(16, 185, 129, 0.18), transparent 50%),
    rgba(10, 10, 12, 0.7);
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}
.wizard-modal {
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-columns: minmax(18rem, 38%) 1fr;
  background: var(--color-bg);
  box-shadow: var(--shadow);
  overflow: hidden;
}
.wizard-header {
  flex-shrink: 0;
  padding: 1rem 2rem 0.5rem;
  border-bottom: 1px solid var(--color-border);
  position: relative;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 1rem;
}
.wizard-panel-title {
  font-size: var(--text-lg);
  font-weight: 600;
  margin: 0.25rem 0 0;
  color: var(--color-text);
}
.wizard-step-label {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  margin: 0;
}
.wizard-close {
  width: 2.75rem;
  height: 2.75rem;
  padding: 0;
  border: none;
  border-radius: var(--radius);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.wizard-close:hover {
  background: var(--color-bg-elevated);
  color: var(--color-text);
}
.wizard-close i {
  font-size: 1.35rem;
}
.wizard-body {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem 2rem 2rem;
  display: flex;
  flex-direction: column;
}
.wizard-step {
  min-height: 8rem;
  flex: 1;
}
.wizard-step:not(.wizard-step-form) {
  display: flex;
  align-items: center;
  justify-content: center;
}
.wizard-step:not(.wizard-step-form) .wizard-options {
  width: 100%;
  max-width: 36rem;
  margin: 0 auto;
}
.wizard-question {
  font-size: var(--text-base);
  font-weight: 500;
  color: var(--color-text);
  margin: 0 0 1rem;
}
.wizard-options {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}
.wizard-options-two {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.25rem;
}
.wizard-options-three .wizard-option {
  flex: 1;
  min-width: 5rem;
}
.wizard-option {
  padding: 2.25rem 2rem;
  font-size: 1.15rem;
  font-weight: 500;
  color: var(--color-text);
  background: var(--color-bg-elevated);
  border: 2px solid var(--color-border);
  border-radius: 1.25rem;
  cursor: pointer;
  font-family: inherit;
  transition: border-color 0.2s, background 0.2s, transform 0.2s, box-shadow 0.2s;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-height: 7.5rem;
}
.wizard-option-card {
  width: 100%;
  align-items: flex-start;
  text-align: left;
  flex-direction: column;
}
.wizard-option-main {
  font-size: 1.35rem;
  font-weight: 600;
}
.wizard-option-desc {
  font-size: 1.05rem;
  color: var(--color-text-muted);
  line-height: 1.4;
}
.wizard-option-logos {
  display: flex;
  align-items: center;
  margin-top: 0.75rem;
}
.wizard-option-logos img {
  width: auto;
  height: 2.75rem;
  object-fit: contain;
  filter: none;
}
.wizard-option-logos-single {
  justify-content: flex-start;
}
.wizard-option-logo {
  width: 2.75rem;
  height: 2.75rem;
  object-fit: contain;
}
.wizard-option:hover {
  border-color: var(--color-accent);
  background: var(--color-accent-soft);
  transform: translateY(-2px);
  box-shadow: 0 6px 14px rgba(15, 23, 42, 0.12);
}
.wizard-option.active {
  border-color: var(--color-accent);
  background: var(--color-accent-soft);
  color: var(--color-accent);
  box-shadow: 0 8px 18px rgba(59, 130, 246, 0.18);
}
.wizard-step-form .field {
  margin-bottom: 1.25rem;
  position: relative;
}
.wizard-step-form input,
.wizard-step-form textarea {
  width: 100%;
  padding: 1.4rem 1.1rem 0.85rem;
  border: none;
  border-bottom: 2px solid var(--color-border);
  border-radius: 0.75rem;
  font-size: 1.1rem;
  font-family: inherit;
  background: transparent;
  color: var(--color-text);
  box-sizing: border-box;
  transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
}
.wizard-step-form textarea {
  min-height: 6.5rem;
  resize: vertical;
}
.wizard-step-form input:focus,
.wizard-step-form textarea:focus {
  border-color: var(--color-accent);
  outline: none;
  box-shadow: 0 10px 20px rgba(15, 23, 42, 0.08);
  background: rgba(255, 255, 255, 0.6);
}
.wizard-step-form label {
  position: absolute;
  left: 1.1rem;
  top: 1.25rem;
  font-size: 1.05rem;
  font-weight: 500;
  color: var(--color-text-muted);
  pointer-events: none;
  transition: transform 0.2s, color 0.2s, font-size 0.2s, top 0.2s;
}
.wizard-step-form .field.filled label,
.wizard-step-form .field:focus-within label {
  top: 0.45rem;
  font-size: 0.8rem;
  color: var(--color-accent);
}
.required { color: #dc2626; }
.field-hint {
  margin: 0.35rem 0 0;
  font-size: var(--text-sm);
  display: flex;
  align-items: center;
  gap: 0.35rem;
}
.field-hint.checking { color: var(--color-text-muted); }
.field-hint.valid { color: #16a34a; }
.field-hint.invalid { color: #dc2626; }
.field-hint .spin { animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.voucher-forced-msg { margin-top: 0.5rem; }
.voucher-invoice-forced .label { margin-bottom: 0.35rem; }
.wizard-message {
  margin: 0 2rem 0;
  padding: 0.75rem 1rem;
  border-radius: var(--radius);
  font-size: var(--text-sm);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.wizard-message.error { background: rgba(220, 38, 38, 0.08); color: #dc2626; }
.wizard-message.success { background: rgba(22, 163, 74, 0.1); color: #16a34a; }
.wizard-footer {
  flex-shrink: 0;
  padding: 1.25rem 2rem 1.75rem;
  border-top: 1px solid var(--color-border);
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
}
.wizard-footer .btn {
  padding: 0.9rem 1.4rem;
  font-size: 1.05rem;
  font-weight: 500;
  border-radius: var(--radius);
  border: none;
  cursor: pointer;
  font-family: inherit;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  transition: transform 0.2s, box-shadow 0.2s;
}
.wizard-footer .btn:disabled { opacity: 0.6; cursor: not-allowed; }
.wizard-footer .btn-primary {
  background: var(--color-accent);
  color: white;
  box-shadow: 0 10px 20px rgba(37, 99, 235, 0.25);
}
.wizard-footer .btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 12px 24px rgba(37, 99, 235, 0.3);
}
.wizard-footer .btn-ghost { background: transparent; color: var(--color-text-muted); }
.wizard-footer .btn-ghost:hover:not(:disabled) { color: var(--color-text); }

.wizard-hero {
  padding: 3rem 2.5rem;
  background: linear-gradient(160deg, rgba(37, 99, 235, 0.9), rgba(14, 116, 144, 0.9));
  color: #f8fafc;
  display: flex;
  align-items: center;
}
.wizard-hero-content {
  max-width: 22rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.wizard-eyebrow {
  font-size: 0.75rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  margin: 0;
  opacity: 0.85;
}
.wizard-hero h2 {
  font-size: 2rem;
  font-weight: 700;
  margin: 0;
}
.wizard-hero-text {
  margin: 0;
  font-size: 1rem;
  line-height: 1.5;
  opacity: 0.9;
}
.wizard-hero .wizard-step-label {
  color: rgba(248, 250, 252, 0.8);
}
.wizard-hero-progress {
  display: grid;
  gap: 0.5rem;
}
.wizard-progress-bar {
  height: 0.5rem;
  background: rgba(248, 250, 252, 0.2);
  border-radius: 999px;
  overflow: hidden;
}
.wizard-progress-bar span {
  display: block;
  height: 100%;
  background: #f8fafc;
  width: 0;
  transition: width 0.35s ease;
}
.wizard-hero-hint {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-radius: 999px;
  background: rgba(248, 250, 252, 0.15);
  font-size: 0.875rem;
  width: fit-content;
}
.wizard-panel {
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
}

@media (max-width: 960px) {
  .wizard-modal {
    grid-template-columns: 1fr;
  }
  .wizard-hero {
    padding: 2rem;
  }
  .wizard-hero-content {
    max-width: none;
  }
}

@media (max-width: 640px) {
  .wizard-header,
  .wizard-body,
  .wizard-footer {
    padding-left: 1.25rem;
    padding-right: 1.25rem;
  }
  .wizard-hero {
    padding: 1.75rem 1.25rem;
  }
}
</style>
