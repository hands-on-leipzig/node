<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { enrollFuture, getAddresses, validateVoucher } from '@/services/draht'
import AddressSelector from '@/components/AddressSelector.vue'
import CustomSelect from '@/components/CustomSelect.vue'
import DevDummyFormFillButton from '@/components/DevDummyFormFillButton.vue'
import { cloneDummyAddressState } from '@/utils/devDummyFormDefaults'
import { SCHOOL_TYPE_OPTIONS } from '@/config/schoolTypes'
import {
  FUTURE_GROUP_PRICE_EUR,
  FUTURE_GROUP_PRODUCT_REFS,
  FUTURE_SEASON_SET_UNIT_EUR,
  FUTURE_SEASON_SET_PRODUCT_REF,
  FUTURE_TEAM_EVENT_UNIT_EUR,
  FUTURE_TEAM_EVENT_PRODUCT_REF,
  FUTURE_PUPIL_COUNTS,
  futureMaxEventTeams,
} from '@/config/futureEditionConfig'

const router = useRouter()
const route = useRoute()
const { t, locale } = useI18n()

const LOGIC_PDF = 'CRM-Anmeldelogik FIRST LEGO League Future Edition - Asana.pdf'

const group = computed(() => {
  const g = route.query.group
  return g === '5' || g === '8' ? g : null
})

/** voucher | pupils | seasonSets | teams | form */
const step = ref('voucher')

const selectedPupils = ref(null)
/** 0 = kein Set, 1 oder 2 Saisonsets */
const seasonSetCount = ref(1)
const registerEventTeams = ref(false)
const teamCount = ref(1)
/** { players: [{ firstname, name, gender, birthdayStr }] }[] */
const eventTeams = ref([])

const emptyAddressState = () => ({
  useExisting: true,
  addressId: '',
  new: { street: '', postalCode: '', city: '', country: '' },
})

const form = ref({
  name: '',
  schoolType: '',
  location: '',
  zip: '',
  organization: '',
  voucher: '',
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

const pdfHref = computed(() => {
  const base = import.meta.env.BASE_URL || '/'
  return base.replace(/\/?$/, '/') + encodeURIComponent(LOGIC_PDF)
})

const maxTeams = computed(() =>
  selectedPupils.value ? futureMaxEventTeams(selectedPupils.value) : 1
)

function formatMoney(eur) {
  try {
    return new Intl.NumberFormat(locale.value === 'de' ? 'de-DE' : 'en-GB', {
      style: 'currency',
      currency: 'EUR',
    }).format(eur)
  } catch {
    return `${eur} €`
  }
}

function syncEventTeamsArray() {
  const n = registerEventTeams.value ? Math.min(Math.max(1, teamCount.value), maxTeams.value) : 0
  while (eventTeams.value.length < n) {
    eventTeams.value.push({ players: [] })
  }
  eventTeams.value = eventTeams.value.slice(0, n)
}

watch([registerEventTeams, teamCount, maxTeams, selectedPupils], syncEventTeamsArray)

const genderOptions = computed(() => [
  { value: '', label: t('detail.gender') },
  { value: 'M', label: t('detail.genderM') },
  { value: 'F', label: t('detail.genderF') },
  { value: 'D', label: t('detail.genderD') },
])

function emptyPlayer() {
  return { firstname: '', name: '', gender: '', birthdayStr: '' }
}

function addPlayer(teamIdx) {
  const t = eventTeams.value[teamIdx]
  if (!t) return
  t.players = [...(t.players || []), emptyPlayer()]
}

function removePlayer(teamIdx, pIdx) {
  const t = eventTeams.value[teamIdx]
  if (!t?.players) return
  t.players = t.players.filter((_, i) => i !== pIdx)
}

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

function goVoucherNext() {
  if (form.value.voucher?.trim() && voucherValid.value === false) return
  step.value = 'pupils'
}

function choosePupils(num) {
  selectedPupils.value = num
  teamCount.value = 1
  seasonSetCount.value = 1
  registerEventTeams.value = false
  eventTeams.value = []
  step.value = 'seasonSets'
}

function seasonNext() {
  step.value = 'teams'
  syncEventTeamsArray()
}

function teamsNext() {
  loadAddresses()
  step.value = 'form'
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

/** Snapshot + refs for order lines (prices from catalog later) */
function buildPricingPayload() {
  const p = selectedPupils.value
  const groupLine = p
    ? {
        productRef: FUTURE_GROUP_PRODUCT_REFS[p],
        quantity: 1,
        unitPriceEurPlaceholder: FUTURE_GROUP_PRICE_EUR[p],
      }
    : null
  const seasonLines =
    seasonSetCount.value > 0
      ? [
          {
            productRef: FUTURE_SEASON_SET_PRODUCT_REF,
            quantity: seasonSetCount.value,
            unitPriceEurPlaceholder: FUTURE_SEASON_SET_UNIT_EUR,
          },
        ]
      : []
  const teamLines =
    registerEventTeams.value && teamCount.value > 0
      ? [
          {
            productRef: FUTURE_TEAM_EVENT_PRODUCT_REF,
            quantity: teamCount.value,
            unitPriceEurPlaceholder: FUTURE_TEAM_EVENT_UNIT_EUR,
          },
        ]
      : []
  return {
    lines: [groupLine, ...seasonLines, ...teamLines].filter(Boolean),
  }
}

function playersToPayload(players) {
  return (players || []).map((p) => ({
    firstname: (p.firstname || '').trim(),
    name: (p.name || '').trim(),
    gender: p.gender || '',
    birthday: p.birthdayStr
      ? Math.floor(new Date(p.birthdayStr).getTime() / 1000)
      : null,
  }))
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
    const eventTeamsPayload = registerEventTeams.value
      ? eventTeams.value.map((team, i) => ({
          index: i + 1,
          players: playersToPayload(team.players),
        }))
      : []

    const payload = {
      group: group.value,
      pupils: selectedPupils.value,
      seasonSetCount: seasonSetCount.value,
      registerEventTeams: registerEventTeams.value,
      eventTeamCount: registerEventTeams.value ? teamCount.value : 0,
      eventTeams: eventTeamsPayload,
      pricing: buildPricingPayload(),
      name: form.value.name.trim(),
      schoolType: form.value.schoolType || undefined,
      location: form.value.location.trim() || undefined,
      zip: form.value.zip.trim() || undefined,
      organization: form.value.organization.trim() || undefined,
      voucher: form.value.voucher.trim() || undefined,
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
    step.value = 'voucher'
    selectedPupils.value = null
    seasonSetCount.value = 1
    registerEventTeams.value = false
    teamCount.value = 1
    eventTeams.value = []
    form.value = {
      name: '',
      schoolType: '',
      location: '',
      zip: '',
      organization: '',
      voucher: '',
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
    step.value = 'teams'
  } else if (step.value === 'teams') {
    step.value = 'seasonSets'
  } else if (step.value === 'seasonSets') {
    step.value = 'pupils'
    selectedPupils.value = null
  } else if (step.value === 'pupils') {
    step.value = 'voucher'
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

const stepIndex = computed(() => {
  const s = ['voucher', 'pupils', 'seasonSets', 'teams', 'form'].indexOf(step.value)
  return s >= 0 ? s : 0
})

function fillFutureFormDummy() {
  error.value = null
  form.value.name = 'Future-Coach Taylor'
  form.value.schoolType = 'realschule_de'
  form.value.location = 'Stuttgart'
  form.value.zip = '70173'
  form.value.organization = 'Realschule Mitte'
  const inv = cloneDummyAddressState()
  form.value.deliveryAddress = cloneDummyAddressState()
  form.value.invoiceAddress = inv
  if (registerEventTeams.value) {
    syncEventTeamsArray()
    eventTeams.value.forEach((team) => {
      team.players = [
        { firstname: 'Alex', name: 'Muster', gender: 'M', birthdayStr: '2011-04-12' },
        { firstname: 'Sam', name: 'Demo', gender: 'D', birthdayStr: '2011-08-03' },
      ]
    })
  }
}
</script>

<template>
  <div class="enroll-page">
    <div class="enroll-view enroll-view-wide">
      <div class="enroll-head">
        <div class="enroll-icon future-icon">
          <i class="bi bi-stars"></i>
        </div>
        <h2><I18nText k="enrollFuture.title" /></h2>
        <p class="description">
          <I18nText k="enrollFuture.description" :values="{ group: group || '—' }" />
        </p>
        <a :href="pdfHref" class="logic-pdf-link" target="_blank" rel="noopener noreferrer">
          <i class="bi bi-file-earmark-pdf"></i> <I18nText k="enrollFuture.openLogicPdf" />
        </a>
        <p class="pricing-disclaimer"><I18nText k="enrollFuture.pricingDisclaimer" /></p>
        <div class="step-dots" aria-hidden="true">
          <span
            v-for="(lbl, i) in ['0', '1', '2', '3', '4']"
            :key="i"
            class="dot"
            :class="{ active: stepIndex >= i }"
          />
        </div>
      </div>

      <!-- Step 0: Voucher -->
      <div v-if="step === 'voucher' && group" class="step-block">
        <h3 class="step-title"><I18nText k="enrollFuture.stepVoucher" /></h3>
        <p class="step-lead"><I18nText k="enrollFuture.stepVoucherLead" /></p>
        <div class="field">
          <label for="fv-voucher"><I18nText k="enroll.voucherCodeLabel" /></label>
          <input
            id="fv-voucher"
            v-model="form.voucher"
            type="text"
            :placeholder="t('enroll.placeholderVoucher')"
            @input="
              voucherValid = null;
              voucherMessage = '';
              voucherType = null;
              voucherInvoiceId = null;
              voucherInvoiceName = null;
            "
            @blur="onVoucherBlur"
          />
          <p v-if="voucherChecking" class="field-hint checking">
            <i class="bi bi-arrow-repeat spin"></i> <I18nText k="enroll.voucherChecking" />
          </p>
          <p v-else-if="voucherValid === true" class="field-hint valid">
            <i class="bi bi-check-circle-fill"></i> {{ voucherMessage }}
          </p>
          <p v-else-if="voucherValid === false" class="field-hint invalid">
            <i class="bi bi-exclamation-circle-fill"></i> {{ voucherMessage }}
          </p>
        </div>
        <div class="actions">
          <button type="button" class="btn btn-ghost" @click="back">
            <i class="bi bi-arrow-left"></i> <I18nText k="enrollFuture.back" />
          </button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="!!(form.voucher?.trim() && voucherValid === false)"
            @click="goVoucherNext"
          >
            <I18nText k="enrollFuture.continue" />
          </button>
        </div>
      </div>

      <!-- Step 1: Gruppengröße -->
      <div v-else-if="step === 'pupils' && group" class="step-block">
        <h3 class="step-title"><I18nText k="enrollFuture.stepGroupSize" /></h3>
        <p class="step-lead"><I18nText k="enrollFuture.stepGroupSizeLead" /></p>
        <div class="option-cards">
          <button
            v-for="num in FUTURE_PUPIL_COUNTS"
            :key="num"
            type="button"
            class="option-card"
            @click="choosePupils(num)"
          >
            <span class="option-card-main">{{ num }} <I18nText k="enrollFuture.pupils" /></span>
            <span class="option-card-price">{{ formatMoney(FUTURE_GROUP_PRICE_EUR[num]) }}</span>
          </button>
        </div>
        <div class="actions">
          <button type="button" class="btn btn-ghost" @click="back">
            <i class="bi bi-arrow-left"></i> <I18nText k="enrollFuture.back" />
          </button>
        </div>
      </div>

      <!-- Step 2: Saisonset -->
      <div v-else-if="step === 'seasonSets' && group" class="step-block">
        <h3 class="step-title"><I18nText k="enrollFuture.stepSeasonSets" /></h3>
        <p class="step-lead"><I18nText k="enrollFuture.stepSeasonSetsLead" /></p>
        <div class="radio-cards">
          <label class="radio-card">
            <input v-model.number="seasonSetCount" type="radio" :value="0" />
            <span class="radio-card-body">
              <strong><I18nText k="enrollFuture.seasonNone" /></strong>
              <span class="muted">{{ formatMoney(0) }}</span>
            </span>
          </label>
          <label class="radio-card">
            <input v-model.number="seasonSetCount" type="radio" :value="1" />
            <span class="radio-card-body">
              <strong><I18nText k="enrollFuture.seasonOne" /></strong>
              <span>{{ formatMoney(FUTURE_SEASON_SET_UNIT_EUR) }}</span>
            </span>
          </label>
          <label class="radio-card">
            <input v-model.number="seasonSetCount" type="radio" :value="2" />
            <span class="radio-card-body">
              <strong><I18nText k="enrollFuture.seasonTwo" /></strong>
              <span>{{ formatMoney(FUTURE_SEASON_SET_UNIT_EUR * 2) }}</span>
            </span>
          </label>
        </div>
        <div class="actions">
          <button type="button" class="btn btn-ghost" @click="back">
            <i class="bi bi-arrow-left"></i> <I18nText k="enrollFuture.back" />
          </button>
          <button type="button" class="btn btn-primary" @click="seasonNext">
            <I18nText k="enrollFuture.continue" />
          </button>
        </div>
      </div>

      <!-- Step 3: Event / Teams (optional) -->
      <div v-else-if="step === 'teams' && group" class="step-block">
        <h3 class="step-title"><I18nText k="enrollFuture.stepTeams" /></h3>
        <p class="step-lead">
          <I18nText k="enrollFuture.stepTeamsLead" :values="{ max: maxTeams }" />
        </p>
        <label class="check-row">
          <input v-model="registerEventTeams" type="checkbox" @change="syncEventTeamsArray" />
          <I18nText k="enrollFuture.registerTeamsNow" />
        </label>
        <template v-if="registerEventTeams">
          <div class="field">
            <label><I18nText k="enrollFuture.teamCountLabel" /></label>
            <select v-model.number="teamCount" class="select-input">
              <option v-for="n in maxTeams" :key="n" :value="n">
                {{ n }} {{ n === 1 ? t('enrollFuture.teamSingular') : t('enrollFuture.teamPlural') }}
                — {{ formatMoney(FUTURE_TEAM_EVENT_UNIT_EUR * n) }}
              </option>
            </select>
          </div>
          <div v-for="(team, ti) in eventTeams" :key="'team-' + ti" class="team-block">
            <h4 class="team-block-title">
              <I18nText k="enrollFuture.teamBlockTitle" :values="{ n: ti + 1 }" />
            </h4>
            <p class="muted small"><I18nText k="enrollFuture.teamParticipantsHint" /></p>
            <div v-for="(pl, pi) in team.players" :key="'p-' + ti + '-' + pi" class="player-row">
              <input v-model="pl.firstname" :placeholder="t('detail.firstname')" class="inp-sm" />
              <input v-model="pl.name" :placeholder="t('detail.lastname')" class="inp-sm" />
              <CustomSelect v-model="pl.gender" class="sel-sm" :options="genderOptions" :placeholder="t('detail.gender')" />
              <input v-model="pl.birthdayStr" type="date" class="inp-sm" />
              <button type="button" class="btn-icon" :aria-label="t('enrollFuture.removeParticipant')" @click="removePlayer(ti, pi)">
                <i class="bi bi-trash"></i>
              </button>
            </div>
            <button type="button" class="btn btn-ghost btn-sm" @click="addPlayer(ti)">
              <i class="bi bi-person-plus"></i> <I18nText k="enrollFuture.addParticipant" />
            </button>
          </div>
        </template>
        <div class="actions">
          <button type="button" class="btn btn-ghost" @click="back">
            <i class="bi bi-arrow-left"></i> <I18nText k="enrollFuture.back" />
          </button>
          <button type="button" class="btn btn-primary" @click="teamsNext">
            <I18nText k="enrollFuture.continue" />
          </button>
        </div>
      </div>

      <!-- Step 4: Stammdaten -->
      <form
        v-else-if="step === 'form' && group"
        class="form step-block"
        @submit.prevent="submit"
        @focusin="onFormFieldFocus"
      >
        <DevDummyFormFillButton @click="fillFutureFormDummy" />
        <h3 class="step-title"><I18nText k="enrollFuture.stepDetails" /></h3>
        <div class="summary-box">
          <p>
            <strong><I18nText k="enrollFuture.groupLabel" :values="{ group }" /></strong> · {{ selectedPupils }}
            <I18nText k="enrollFuture.pupils" /> — {{ formatMoney(FUTURE_GROUP_PRICE_EUR[selectedPupils]) }}
          </p>
          <p>
            <I18nText v-if="seasonSetCount === 0" k="enrollFuture.seasonNone" />
            <I18nText v-else-if="seasonSetCount === 1" k="enrollFuture.seasonOne" />
            <I18nText v-else k="enrollFuture.seasonTwo" />
            —
            {{
              seasonSetCount === 0
                ? formatMoney(0)
                : formatMoney(FUTURE_SEASON_SET_UNIT_EUR * seasonSetCount)
            }}
          </p>
          <p v-if="registerEventTeams">
            {{ teamCount }}× <I18nText k="enrollFuture.teamEventLine" /> — {{ formatMoney(FUTURE_TEAM_EVENT_UNIT_EUR * teamCount) }}
          </p>
          <p v-else class="muted"><I18nText k="enrollFuture.noTeamsInOrder" /></p>
        </div>

        <div class="field">
          <label for="future-name"><I18nText k="enrollFuture.nameLabel" /> <span class="required">*</span></label>
          <input
            id="future-name"
            v-model="form.name"
            type="text"
            required
            :placeholder="t('enrollFuture.placeholderName')"
          />
        </div>
        <div class="field">
          <label for="future-school-type"><I18nText k="enroll.schoolType" /></label>
          <select id="future-school-type" v-model="form.schoolType">
            <option value="" disabled><I18nText k="schoolTypes.none" /></option>
            <option v-for="opt in SCHOOL_TYPE_OPTIONS" :key="opt.value" :value="opt.value" :disabled="!!opt.disabled">
              {{ opt.labelKey ? t(opt.labelKey) : opt.label }}
            </option>
          </select>
        </div>
        <div class="field">
          <label for="future-location"><I18nText k="enroll.location" /></label>
          <input id="future-location" v-model="form.location" type="text" />
        </div>
        <div class="field">
          <label for="future-zip"><I18nText k="enroll.postalCode" /></label>
          <input id="future-zip" v-model="form.zip" type="text" />
        </div>
        <div class="field">
          <label for="future-organization"><I18nText k="enroll.schoolName" /></label>
          <input id="future-organization" v-model="form.organization" type="text" />
        </div>

        <AddressSelector
          v-model="form.deliveryAddress"
          :addresses="addresses"
          :label="t('enroll.deliveryAddress')"
          id-prefix="future-delivery"
        />
        <template v-if="voucherType === '1'">
          <div class="field voucher-invoice-forced">
            <label class="label"><I18nText k="enroll.invoiceAddress" /></label>
            <p class="field-hint valid voucher-forced-msg">
              <i class="bi bi-info-circle-fill"></i>
              <I18nText k="enroll.voucherInvoiceForced" />
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

        <div v-if="error" class="message error">
          <i class="bi bi-exclamation-circle"></i> {{ error }}
        </div>
        <div v-if="success" class="message success">
          <i class="bi bi-check-circle-fill"></i> <I18nText k="enrollFuture.success" />
        </div>
        <div class="actions">
          <button type="button" class="btn btn-ghost" @click="back">
            <i class="bi bi-arrow-left"></i> <I18nText k="enrollFuture.back" />
          </button>
          <button type="submit" class="btn btn-primary" :disabled="submitting">
            <i v-if="submitting" class="bi bi-arrow-repeat spin"></i>
            <i v-else class="bi bi-check-lg"></i>
            <I18nText v-if="submitting" k="enrollFuture.submitting" />
            <I18nText v-else k="enrollFuture.submit" />
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
  padding: 1.5rem 0;
}
.enroll-view {
  max-width: 32rem;
  width: 100%;
  text-align: left;
}
.enroll-view-wide {
  max-width: 40rem;
}
.enroll-head {
  margin-bottom: 1.25rem;
}
.logic-pdf-link {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: var(--text-sm);
  color: var(--color-accent);
  margin-top: 0.5rem;
}
.pricing-disclaimer {
  font-size: 0.8rem;
  color: var(--color-text-subtle);
  margin: 0.75rem 0 0;
  line-height: 1.4;
}
.step-dots {
  display: flex;
  gap: 0.35rem;
  margin-top: 1rem;
}
.step-dots .dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--color-border);
}
.step-dots .dot.active {
  background: var(--color-accent);
}
.enroll-icon.future-icon {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}
.enroll-view h2 {
  font-size: var(--text-2xl);
  font-weight: 600;
  margin-bottom: 0.35rem;
}
.description {
  font-size: var(--text-lg);
  color: var(--color-text-muted);
  line-height: 1.5;
}
.step-block {
  margin-top: 0.5rem;
}
.step-title {
  font-size: 1.1rem;
  margin: 0 0 0.35rem;
}
.step-lead {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  margin: 0 0 1rem;
  line-height: 1.45;
}
.option-cards {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
}
.option-card {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.5rem 1rem;
  padding: 1rem 1.25rem;
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-elevated);
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: border-color 0.15s;
}
.option-card:hover {
  border-color: var(--color-accent);
}
.option-card-main {
  font-weight: 700;
  font-size: 1.125rem;
}
.option-card-price {
  font-weight: 600;
  color: var(--color-accent);
}
.radio-cards {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1.25rem;
}
.radio-card {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.875rem 1rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  cursor: pointer;
}
.radio-card:has(input:checked) {
  border-color: var(--color-accent);
  background: var(--color-accent-soft);
}
.radio-card-body {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  font-size: var(--text-sm);
}
.radio-card-body .ref {
  font-size: 0.7rem;
  color: var(--color-text-subtle);
  font-family: ui-monospace, monospace;
}
.muted {
  color: var(--color-text-muted);
}
.small {
  font-size: 0.85rem;
}
.check-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
  font-weight: 500;
}
.select-input {
  width: 100%;
  padding: 0.65rem 0.75rem;
  border-radius: var(--radius);
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  color: var(--color-text);
  font-size: var(--text-base);
}
.team-block {
  margin: 1rem 0;
  padding: 1rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
}
.team-block-title {
  margin: 0 0 0.5rem;
  font-size: var(--text-base);
}
.player-row {
  display: grid;
  grid-template-columns: 1fr 1fr minmax(5rem, auto) minmax(7rem, auto) auto;
  gap: 0.35rem;
  align-items: center;
  margin-bottom: 0.35rem;
}
@media (max-width: 640px) {
  .player-row {
    grid-template-columns: 1fr 1fr;
  }
}
.inp-sm,
.sel-sm {
  padding: 0.45rem 0.5rem;
  font-size: var(--text-sm);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-bg);
  color: var(--color-text);
}
.btn-icon {
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 0.25rem;
}
.btn-sm {
  font-size: var(--text-sm);
  padding: 0.4rem 0.75rem;
}
.summary-box {
  padding: 1rem;
  background: var(--color-bg-muted);
  border-radius: var(--radius);
  margin-bottom: 1.25rem;
  font-size: var(--text-sm);
  line-height: 1.6;
}
.summary-box p {
  margin: 0.25rem 0;
}
.field {
  margin-bottom: 1.1rem;
}
.field label,
.label {
  display: block;
  font-weight: 500;
  margin-bottom: 0.35rem;
}
.required {
  color: #dc2626;
}
.form input,
.form textarea,
.form select {
  width: 100%;
  padding: 0.75rem 0.875rem;
  min-height: var(--touch-lg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  font-size: var(--text-base);
  font-family: inherit;
  background: var(--color-bg-elevated);
  color: var(--color-text);
  box-sizing: border-box;
}
.field-hint {
  margin: 0.35rem 0 0;
  font-size: var(--text-sm);
  display: flex;
  align-items: center;
  gap: 0.35rem;
}
.field-hint.valid {
  color: #16a34a;
}
.field-hint.invalid {
  color: #dc2626;
}
.spin {
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.message {
  margin-bottom: 1rem;
  padding: 0.75rem 1rem;
  border-radius: var(--radius);
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
  margin-top: 1.25rem;
}
.btn {
  padding: 0.75rem 1.15rem;
  min-height: var(--touch-lg);
  border-radius: var(--radius);
  font-size: var(--text-base);
  font-weight: 500;
  cursor: pointer;
  border: none;
  font-family: inherit;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}
.btn:disabled {
  opacity: 0.65;
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
</style>
