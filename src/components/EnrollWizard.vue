<script setup>
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { enrollTeam, enrollClass, enrollFuture, getAddresses, getEvents, getEventsNearest, validateVoucher, updateTeamPlayers, registerTeamForEvent } from '@/services/draht'
import AddressSelector from '@/components/AddressSelector.vue'
import EventSelectDropdown from '@/components/EventSelectDropdown.vue'
import { FUTURE_PUPIL_OPTIONS } from '@/config/enrollmentOptions'
import { SCHOOL_TYPE_OPTIONS } from '@/config/schoolTypes'
import logoFirstFllV from '@/assets/first+fll_v.png'
import logoFllExploreV from '@/assets/fll_explore_v.png'
import logoFllChallengeV from '@/assets/fll_challenge_v.png'
import logoFuture from '@/assets/first_rgb_fullcolor_ohne.png'

const props = defineProps({
  open: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'success'])

const { t, locale } = useI18n()
const router = useRouter()

const emptyAddressState = () => ({
  useExisting: true,
  addressId: '',
  new: { street: '', postalCode: '', city: '', country: '' },
})

// Step 0: Voucher / Direkteinstieg
const hasVoucherCode = ref(null) // null | 'yes' | 'no'
// Step 1
const edition = ref(null) // 'founders' | 'future'
// Step 2: Future = group '5'|'8', Founders = variant 'explore'|'challenge'
const futureGroup = ref(null)
const foundersVariant = ref(null)
// Step 3: Future = pupils 8|16|24, Founders = type 'team'|'class'
const futurePupils = ref(null)
const futurePupilsMode = ref(null) // 'preset' | 'custom'
const futurePupilsCustom = ref(40)
// Future: optional on-site event registration (+100€)
const futureOnSiteEvent = ref(null) // null | 'yes' | 'no' | 'skip'
const futureEventId = ref(null)
const futureEvents = ref([])
const futureEventsLoading = ref(false)
const futureEventsNearest = ref([])
const futureEventsNearestLoading = ref(false)
const foundersType = ref(null)
// Step 4
const formData = ref({
  name: '',
  schoolOrClub: '',
  schoolType: '',
  organization: '',
  country: '',
  zip: '',
  city: '',
  state: '',
  location: '',
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
// Founder team: participants (first name, last name, date of birth, gender)
const founderTeamPlayers = ref([])
// Founder team: event to register for
const founderTeamEventId = ref(null)
const founderEvents = ref([])
const founderEventsLoading = ref(false)
const founderEventsNearest = ref([])
const founderEventsNearestLoading = ref(false)
// Step 6
const deliveryAddress = ref(emptyAddressState())
const invoiceAddress = ref(emptyAddressState())
const addresses = ref([])

const step = ref(1)
const submitting = ref(false)
const error = ref(null)
const success = ref(false)
const successMessage = ref('')

const foundersTeamHasParticipantsStep = computed(
  () => edition.value === 'founders' && foundersType.value === 'team'
)

const totalSteps = computed(() => {
  // Future: 6 content steps. Founders team: 7 (no voucher step). Founders class: 5 (no voucher step).
  const contentSteps =
    edition.value === 'future' ? 6 : foundersTeamHasParticipantsStep.value ? 7 : 5
  return 1 + contentSteps // Step 0 (voucher?) + rest
})

const progress = computed(() => {
  if (totalSteps.value <= 1) return 0
  return Math.round((step.value / (totalSteps.value - 1)) * 100)
})

const stepTitle = computed(() => {
  if (step.value === 0) return t('wizard.stepVoucherCode')
  if (step.value === 1) return t('wizard.stepEdition')
  if (step.value === 2) return edition.value === 'future' ? t('wizard.stepFutureGroup') : t('wizard.stepVariant')
  if (step.value === 3) return edition.value === 'future' ? t('wizard.stepPupils') : t('wizard.stepTeamClass')
  if (step.value === 4) return t('wizard.stepData')
  if (step.value === 5) {
    if (edition.value === 'future') return t('wizard.stepOnSiteEvent')
    if (foundersTeamHasParticipantsStep.value) return t('wizard.stepParticipants')
    return t('wizard.stepAddresses') // Founders class: no voucher step, Addresses is step 5
  }
  if (step.value === 6) {
    if (edition.value === 'future') return t('wizard.stepOrder')
    if (foundersTeamHasParticipantsStep.value) return t('wizard.stepEvent')
    return t('wizard.stepAddresses')
  }
  if (step.value === 7) return t('wizard.stepAddresses') // Founder team: Addresses (no voucher step)
  if (step.value === 6 && edition.value === 'founders' && foundersType.value === 'class') return t('wizard.orderTitle')
  if (step.value === 8 && foundersTeamHasParticipantsStep.value) return t('wizard.orderTitle')
  return ''
})

function selectFuturePupils(num) {
  futurePupilsMode.value = 'preset'
  futurePupils.value = num
}

function selectFuturePupilsMore() {
  futurePupilsMode.value = 'custom'
  if (!futurePupilsCustom.value || futurePupilsCustom.value < 40) futurePupilsCustom.value = 40
  futurePupils.value = futurePupilsCustom.value
}

function adjustFuturePupils(delta) {
  const nextVal = Math.max(40, (futurePupilsCustom.value || 40) + delta)
  futurePupilsCustom.value = nextVal
  futurePupils.value = nextVal
}

const summaryItems = computed(() => {
  const items = []
  if (voucher.value?.trim() && voucherValid.value === true) {
    items.push({ label: t('wizard.entryByCode') })
  }
  if (edition.value === 'founders') {
    items.push({ label: t('dashboard.editionFounders') })
  } else if (edition.value === 'future') {
    items.push({ label: t('dashboard.editionFuture') })
  }
  if (edition.value === 'future' && futureGroup.value) {
    items.push({ label: t(futureGroup.value === '5' ? 'dashboard.optionFutureGroup5' : 'dashboard.optionFutureGroup8') })
  }
  if (edition.value === 'founders' && foundersVariant.value) {
    items.push({ label: t(foundersVariant.value === 'explore' ? 'wizard.optionExplore' : 'wizard.optionChallenge') })
  }
  if (edition.value === 'future' && futurePupils.value != null) {
    items.push({ label: `${futurePupils.value} ${t('enrollFuture.pupils')}` })
  }
  if (edition.value === 'future' && futureOnSiteEvent.value === 'yes' && futureEventId.value) {
    items.push({ label: selectedFutureEventLabel.value || t('wizard.onSiteEventSelected') })
  }
  if (edition.value === 'founders' && foundersType.value) {
    items.push({ label: t(foundersType.value === 'team' ? 'dashboard.team' : 'dashboard.class') })
  }
  if (formData.value.name?.trim()) {
    items.push({ label: formData.value.name.trim() })
  }
  return items
})

const selectedFutureEventLabel = computed(() => {
  if (!futureEventId.value || !futureEvents.value.length) return null
  const ev = futureEvents.value.find((e) => String(e.id) === String(futureEventId.value))
  return ev ? (ev.label || ev.name || ev.title || ev.ref) : null
})

const selectedFounderEventLabel = computed(() => {
  if (!founderTeamEventId.value || !founderEvents.value.length) return null
  const ev = founderEvents.value.find((e) => String(e.id) === String(founderTeamEventId.value))
  return ev ? (ev.label || ev.name || ev.title || ev.ref) : null
})

/** Event display label with optional capacity (from flow API). */
function futureEventOptionLabel(ev) {
  const name = ev?.label || ev?.name || ev?.title || ev?.ref || (ev?.id != null ? `Event ${ev.id}` : '')
  const used = ev?.registered ?? ev?.used ?? ev?.count ?? ev?.teams_count
  const max = ev?.capacity ?? ev?.max ?? ev?.max_teams ?? ev?.slots
  if (typeof used === 'number' && typeof max === 'number') {
    return `${name} (${t('wizard.eventCapacitySlots', { used, max })})`
  }
  return name
}

const countryOptions = computed(() => {
  const displayNames = typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function'
    ? new Intl.DisplayNames([locale.value], { type: 'region' })
    : null
  let codes = ['DE', 'AT', 'CH', 'US', 'GB', 'FR', 'IT', 'ES', 'NL', 'BE', 'PL', 'CZ', 'SK', 'HU', 'RO', 'BG', 'SE', 'NO', 'DK', 'FI', 'PT', 'IE', 'GR', 'SI', 'HR', 'RS', 'UA', 'TR', 'CN', 'JP', 'KR', 'AU', 'NZ', 'CA', 'BR', 'MX', 'AR', 'CL', 'ZA', 'IN']
  if (typeof Intl !== 'undefined' && typeof Intl.supportedValuesOf === 'function') {
    try {
      const supported = Intl.supportedValuesOf('region')
      if (Array.isArray(supported) && supported.length) codes = supported
    } catch (_) {
      // keep fallback list
    }
  }
  codes = codes.filter((code) => /^[A-Z]{2}$/.test(code))
  const toLabel = (code) => displayNames ? displayNames.of(code) : code
  const unique = Array.from(new Set(codes))
  unique.sort((a, b) => toLabel(a).localeCompare(toLabel(b)))
  const top = ['DE', 'AT', 'CH']
  const rest = unique.filter((c) => !top.includes(c))
  return {
    top: top.map((code) => ({ value: code.toLowerCase(), label: toLabel(code) })),
    rest: rest.map((code) => ({ value: code.toLowerCase(), label: toLabel(code) })),
  }
})

let zipLookupTimer = null
let zipLookupAbort = null

async function lookupZipCityState() {
  const zip = formData.value.zip?.trim()
  let country = (formData.value.country || '').toLowerCase()
  if (!zip) return
  // Fallback: if no country selected but zip looks like DACH PLZ, try DE so Ort gets filled (Team/Class)
  if (!country && /^\d{4,5}$/.test(zip)) country = 'de'
  if (!country) return
  if (zipLookupAbort) zipLookupAbort.abort()
  zipLookupAbort = new AbortController()
  try {
    const res = await fetch(`https://api.zippopotam.us/${country}/${encodeURIComponent(zip)}`, { signal: zipLookupAbort.signal })
    if (!res.ok) return
    const data = await res.json()
    const place = Array.isArray(data.places) && data.places.length ? data.places[0] : null
    if (!place) return
    const city = place['place name']
    const state = place['state']
    if (city) formData.value.city = city
    if (state) formData.value.state = state
  } catch (_) {
    // ignore lookup errors
  }
}

const foundersLogos = [{ src: logoFirstFllV, alt: 'FIRST LEGO League' }]

const futureLogos = [{ src: logoFuture, alt: 'Future Edition' }]

function chooseNoVoucher() {
  hasVoucherCode.value = 'no'
  step.value = 1
}

function selectEdition(val) {
  edition.value = val
  if (step.value === 1) next()
}

function openWizard() {
  hasVoucherCode.value = null
  edition.value = null
  futureGroup.value = null
  foundersVariant.value = null
  futurePupils.value = null
  futurePupilsMode.value = null
  futureOnSiteEvent.value = null
  futureEventId.value = null
  futureEvents.value = []
  futureEventsNearest.value = []
  foundersType.value = null
  formData.value = { name: '', schoolOrClub: '', schoolType: '', organization: '', country: '', zip: '', city: '', state: '', location: '', notes: '', grade: '', teacherName: '', description: '', playersTotal: '' }
  voucher.value = ''
  voucherValid.value = null
  voucherMessage.value = ''
  voucherType.value = null
  voucherInvoiceId.value = null
  voucherInvoiceName.value = null
  deliveryAddress.value = emptyAddressState()
  invoiceAddress.value = emptyAddressState()
  founderTeamPlayers.value = []
  founderTeamEventId.value = null
  step.value = 0
  error.value = null
  success.value = false
}

function close() {
  emit('close')
}

function isFilled(value) {
  return value !== null && value !== undefined && String(value).trim() !== ''
}

function addFounderParticipant() {
  founderTeamPlayers.value = [...founderTeamPlayers.value, { firstname: '', name: '', gender: '', birthdayStr: '' }]
}

function removeFounderParticipant(idx) {
  founderTeamPlayers.value = founderTeamPlayers.value.filter((_, i) => i !== idx)
}

function buildWizardPlayersPayload() {
  return founderTeamPlayers.value.map((p) => ({
    firstname: (p.firstname || '').trim() || '',
    name: (p.name || '').trim() || '',
    gender: (p.gender || '').trim() || '',
    birthday: (p.birthdayStr || '').trim() || null,
  }))
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
  if (step.value === 0) {
    if (hasVoucherCode.value === 'no') return true
    if (hasVoucherCode.value === 'yes') return !!voucher.value?.trim() && voucherValid.value === true
    return false
  }
  if (step.value === 1) return edition.value != null
  if (step.value === 2) return edition.value === 'future' ? futureGroup.value != null : foundersVariant.value != null
  if (step.value === 3) return edition.value === 'future' ? futurePupils.value != null : foundersType.value != null
  if (step.value === 4) return edition.value === 'future' ? true : !!formData.value.name?.trim()
  if (step.value === 5 && foundersTeamHasParticipantsStep.value) return true // participants optional
  if (step.value === 5 && edition.value === 'future') {
    if (!futureOnSiteEvent.value) return false
    if (futureOnSiteEvent.value === 'yes') return !!futureEventId.value
    return true
  }
  if (step.value === 5 && edition.value === 'founders' && foundersType.value === 'class') return areAddressesValid()
  if (step.value === 5) return true
  if (step.value === 6) return true
  if (step.value === 7 && foundersTeamHasParticipantsStep.value) return areAddressesValid()
  if (step.value === 7) return true
  return false
}

function next() {
  if (step.value === 0) {
    step.value = 1
    if (edition.value) {
      if (edition.value === 'future' && futureGroup.value) loadAddresses()
      else if (edition.value !== 'future') loadAddresses()
    }
    return
  }
  if (step.value === 2 && edition.value === 'future') loadAddresses()
  if (step.value === 3) loadAddresses()
  if (step.value === 4 && edition.value === 'future') {
    loadFutureEvents()
    loadFutureEventsNearest()
  }
  if (step.value === 4 && foundersTeamHasParticipantsStep.value && founderTeamPlayers.value.length === 0) {
    addFounderParticipant()
  }
  if (step.value === 5 && foundersTeamHasParticipantsStep.value) {
    loadFounderTeamEvents()
    loadFounderTeamEventsNearest()
  }
  if (step.value < totalSteps.value) step.value++
}

function prev() {
  if (step.value === 1) {
    step.value = 0
    hasVoucherCode.value = null
    return
  }
  if (step.value > 1) step.value--
}

async function loadFutureEvents() {
  futureEventsLoading.value = true
  futureEvents.value = []
  try {
    const res = await getEvents()
    const data = res.data
    const list = Array.isArray(data) ? data : (data?.data ?? (data?.events ?? []))
    futureEvents.value = Array.isArray(list) ? list : []
  } catch (_) {
    futureEvents.value = []
  } finally {
    futureEventsLoading.value = false
  }
}

async function loadFutureEventsNearest() {
  futureEventsNearestLoading.value = true
  futureEventsNearest.value = []
  try {
    const country = formData.value.country?.trim() || undefined
    const zip = formData.value.zip?.trim() || undefined
    const program = futureGroup.value || undefined
    const res = await getEventsNearest(country, zip, program)
    const data = res.data
    const list = Array.isArray(data) ? data : (data?.data ?? (data?.events ?? []))
    futureEventsNearest.value = Array.isArray(list) ? list : []
  } catch (_) {
    futureEventsNearest.value = []
  } finally {
    futureEventsNearestLoading.value = false
  }
}

async function loadFounderTeamEvents() {
  founderEventsLoading.value = true
  founderEvents.value = []
  try {
    const res = await getEvents()
    const data = res.data
    const list = Array.isArray(data) ? data : (data?.data ?? (data?.events ?? []))
    founderEvents.value = Array.isArray(list) ? list : []
  } catch (_) {
    founderEvents.value = []
  } finally {
    founderEventsLoading.value = false
  }
}

async function loadFounderTeamEventsNearest() {
  founderEventsNearestLoading.value = true
  founderEventsNearest.value = []
  try {
    const country = formData.value.country?.trim() || undefined
    const zip = formData.value.zip?.trim() || undefined
    const program = foundersVariant.value === 'explore' ? 1 : 2
    const res = await getEventsNearest(country, zip, program)
    const data = res.data
    const list = Array.isArray(data) ? data : (data?.data ?? (data?.events ?? []))
    founderEventsNearest.value = Array.isArray(list) ? list : []
  } catch (_) {
    founderEventsNearest.value = []
  } finally {
    founderEventsNearestLoading.value = false
  }
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

/** Delivery address is valid when an existing one is selected or new address has at least street/city/country. */
function isDeliveryAddressValid() {
  return !!buildAddressPayload(deliveryAddress.value)
}

/** Invoice address is valid when voucher forces it (and we have id), or same as delivery. */
function isInvoiceAddressValid() {
  if (voucherType.value === '1') return voucherInvoiceId.value != null
  return !!buildAddressPayload(invoiceAddress.value)
}

function areAddressesValid() {
  return isDeliveryAddressValid() && isInvoiceAddressValid()
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

/**
 * Apply preset from voucher/direct-entry API response.
 * Expected data (when API supports it): edition ('founders'|'future'), program (1|2|4|5),
 * or for future: group ('5'|'8'), pupils (number). Program: 1=Explore team, 2=Challenge team, 4=Explore class, 5=Challenge class.
 */
function applyVoucherPreset(data) {
  if (!data || typeof data !== 'object') return
  const editionVal = data.edition
  if (editionVal === 'future') {
    edition.value = 'future'
    if (data.group === '5' || data.group === '8') futureGroup.value = data.group
    if (typeof data.pupils === 'number' && data.pupils >= 8) {
      futurePupils.value = data.pupils
      futurePupilsMode.value = [8, 16, 32].includes(data.pupils) ? 'preset' : 'custom'
      if (futurePupilsMode.value === 'custom') futurePupilsCustom.value = data.pupils
    }
    return
  }
  const program = data.program
  if (program === 1 || program === 2 || program === 4 || program === 5) {
    edition.value = 'founders'
    foundersVariant.value = program === 1 || program === 4 ? 'explore' : 'challenge'
    foundersType.value = program === 1 || program === 2 ? 'team' : 'class'
  } else if (editionVal === 'founders') {
    edition.value = 'founders'
    if (data.variant === 'explore' || data.variant === 'challenge') foundersVariant.value = data.variant
    if (data.type === 'team' || data.type === 'class') foundersType.value = data.type
  }
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
      const preset = result.data?.data ?? result.data
      if (preset) applyVoucherPreset(preset)
    }
  } catch (_) {
    voucherValid.value = false
    voucherMessage.value = t('enroll.voucherInvalid')
  } finally {
    voucherChecking.value = false
  }
}

async function submit() {
  if (edition.value !== 'future' && !formData.value.name?.trim()) {
    error.value = t('wizard.nameRequired')
    return
  }
  if (voucher.value?.trim() && voucherValid.value === false) {
    error.value = t('enroll.voucherInvalid')
    return
  }
  if (!areAddressesValid()) {
    error.value = t('wizard.addressesRequired')
    return
  }
  error.value = null
  submitting.value = true
  try {
    if (edition.value === 'future') {
      const payload = {
        group: futureGroup.value,
        pupils: futurePupils.value,
        name: formData.value.name?.trim() || undefined,
        schoolType: formData.value.schoolType || undefined,
        organization: formData.value.organization?.trim() || undefined,
        country: formData.value.country?.trim() || undefined,
        zip: formData.value.zip?.trim() || undefined,
        location: formData.value.city?.trim() || undefined,
        state: formData.value.state?.trim() || undefined,
        voucher: voucher.value?.trim() || undefined,
        notes: formData.value.notes?.trim() || undefined,
        deliveryAddress: buildAddressPayload(deliveryAddress.value),
        invoiceAddress: buildInvoicePayload(),
      }
      if (futureOnSiteEvent.value === 'yes' && futureEventId.value) {
        payload.eventId = futureEventId.value
      }
      await enrollFuture(payload)
      successMessage.value = t('wizard.success')
    } else {
      const isTeam = foundersType.value === 'team'
      const program = foundersVariant.value === 'explore' ? (isTeam ? 1 : 4) : (isTeam ? 2 : 5)
      const deliveryPayload = buildAddressPayload(deliveryAddress.value)
      const invoicePayload = buildInvoicePayload()
      const payload = {
        program,
        name: formData.value.name.trim(),
        schoolOrClub: isTeam ? (formData.value.schoolOrClub?.trim() || undefined) : undefined,
        schoolType: !isTeam ? (formData.value.schoolType || undefined) : undefined,
        organization: formData.value.organization?.trim() || undefined,
        country: formData.value.country?.trim() || undefined,
        zip: formData.value.zip?.trim() || undefined,
        location: (formData.value.city || '').trim() || undefined,
        state: (formData.value.state || '').trim() || undefined,
        voucher: voucher.value?.trim() || undefined,
        notes: formData.value.notes?.trim() || undefined,
        deliveryAddress: deliveryPayload ?? undefined,
        invoiceAddress: invoicePayload ?? undefined,
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
      if (createdId && isTeam && founderTeamPlayers.value.length > 0) {
        const allPlayers = buildWizardPlayersPayload()
        const nonEmpty = allPlayers.filter((p) => p.firstname || p.name || p.gender || p.birthday)
        if (nonEmpty.length > 0) {
          await updateTeamPlayers(createdId, { players: nonEmpty })
        }
      }
      if (createdId && isTeam && founderTeamEventId.value) {
        await registerTeamForEvent(createdId, founderTeamEventId.value)
      }
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
  if (step.value === 3 && edition.value === 'future' && futurePupilsMode.value !== 'custom') next()
})

watch(foundersType, (val) => {
  if (!props.open || !val) return
  if (step.value === 3 && edition.value !== 'future') next()
})

watch(
  () => [formData.value.country, formData.value.zip],
  () => {
    if (zipLookupTimer) clearTimeout(zipLookupTimer)
    zipLookupTimer = setTimeout(() => {
      lookupZipCityState()
    }, 350)
  }
)
</script>

<template>
  <div v-if="open" class="wizard-backdrop" @click.self="close">
    <div class="wizard-modal" role="dialog" aria-modal="true" aria-labelledby="wizard-title">
      <div class="wizard-hero">
        <div class="wizard-hero-content">
          <p class="wizard-eyebrow"><I18nText k="wizard.stepEdition" /></p>
          <h2 id="wizard-title"><I18nText k="wizard.ctaTitle" /></h2>
          <p class="wizard-hero-text"><I18nText k="dashboard.intro" /></p>
          <div v-if="summaryItems.length" class="wizard-path">
            <div v-for="(item, idx) in summaryItems" :key="idx" class="wizard-path-step">
              <span class="wizard-path-icon">
                <i v-if="idx === 0" class="bi bi-stars"></i>
                <i v-else-if="idx === 1" class="bi bi-diagram-3"></i>
                <i v-else-if="idx === 2" class="bi bi-people"></i>
                <i v-else class="bi bi-check2-circle"></i>
              </span>
              <span class="wizard-path-label">{{ item.label }}</span>
            </div>
          </div>
          <div class="wizard-hero-progress">
            <div class="wizard-progress-bar" role="progressbar" :aria-valuenow="progress" aria-valuemin="0" aria-valuemax="100">
              <span :style="{ width: `${progress}%` }"></span>
            </div>
            <p class="wizard-step-label">{{ stepTitle }} ({{ step + 1 }}/{{ totalSteps }})</p>
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
          <!-- Step 0: Voucher-Code / Direkteinstieg -->
          <div v-show="step === 0" class="wizard-step wizard-step-voucher wizard-step-animate">
            <div class="wizard-step-voucher-inner">
              <p class="wizard-question"><I18nText k="wizard.voucherCodeQuestion" /></p>
              <p class="wizard-hint"><I18nText k="wizard.voucherCodeHint" /></p>
              <div v-if="hasVoucherCode === null" class="wizard-options wizard-options-stack">
                <button type="button" class="wizard-option wizard-option-card" @click="hasVoucherCode = 'yes'">
                  <div class="wizard-option-main"><I18nText k="wizard.voucherCodeYes" /></div>
                  <div class="wizard-option-desc"><I18nText k="wizard.voucherCodeYesDesc" /></div>
                </button>
                <button type="button" class="wizard-option wizard-option-card" @click="chooseNoVoucher">
                  <div class="wizard-option-main"><I18nText k="wizard.voucherCodeNo" /></div>
                  <div class="wizard-option-desc"><I18nText k="wizard.voucherCodeNoDesc" /></div>
                </button>
              </div>
              <div v-else-if="hasVoucherCode === 'yes'" class="wizard-voucher-code-form">
                <div class="field" :class="{ filled: isFilled(voucher) }">
                  <label><I18nText k="enroll.voucherCodeLabel" /></label>
                  <input
                    v-model="voucher"
                    type="text"
                    :placeholder="t('enroll.placeholderVoucherCode')"
                    autofocus
                    @input="voucherValid = null; voucherMessage = ''; voucherType = null; voucherInvoiceId = null; voucherInvoiceName = null"
                    @blur="onVoucherBlur"
                  />
                  <p v-if="voucherChecking" class="field-hint checking"><i class="bi bi-arrow-repeat spin"></i> <I18nText k="enroll.voucherChecking" /></p>
                  <p v-else-if="voucherValid === true" class="field-hint valid"><i class="bi bi-check-circle-fill"></i> {{ voucherMessage }}</p>
                  <p v-else-if="voucherValid === false" class="field-hint invalid"><i class="bi bi-exclamation-circle-fill"></i> {{ voucherMessage }}</p>
                </div>
                <button type="button" class="btn btn-ghost wizard-back-link" @click="hasVoucherCode = null; voucher = ''; voucherValid = null; voucherMessage = ''; voucherType = null; voucherInvoiceId = null; voucherInvoiceName = null">
                  <i class="bi bi-arrow-left"></i> <I18nText k="wizard.voucherCodeBack" />
                </button>
              </div>
            </div>
          </div>

          <!-- Step 1: Edition -->
          <div v-show="step === 1" class="wizard-step wizard-step-animate">
            <div class="wizard-options wizard-options-two">
              <button type="button" class="wizard-option wizard-option-card" :class="{ active: edition === 'founders' }" @click="selectEdition('founders')">
                <div class="wizard-option-main"><I18nText k="dashboard.editionFounders" /></div>
                <div class="wizard-option-desc"><I18nText k="wizard.editionFoundersDesc" /></div>
                <div class="wizard-option-logos">
                  <img v-for="logo in foundersLogos" :key="logo.src" :src="logo.src" :alt="logo.alt" loading="lazy" />
                </div>
              </button>
              <button type="button" class="wizard-option wizard-option-card" :class="{ active: edition === 'future' }" @click="selectEdition('future')">
                <div class="wizard-option-main"><I18nText k="dashboard.editionFuture" /></div>
                <div class="wizard-option-desc"><I18nText k="wizard.editionFutureDesc" /></div>
                <div class="wizard-option-logos wizard-option-logos-single">
                  <img v-for="logo in futureLogos" :key="logo.src" :src="logo.src" :alt="logo.alt" loading="lazy" />
                </div>
              </button>
            </div>
          </div>

          <!-- Step 2: Future = group 5+/8+, Founders = Explore/Challenge -->
          <div v-show="step === 2" class="wizard-step wizard-step-animate">
            <template v-if="edition === 'future'">
              <div class="wizard-options wizard-options-two">
                <button type="button" class="wizard-option wizard-option-card" :class="{ active: futureGroup === '5' }" @click="futureGroup = '5'">
                  <img :src="logoFuture" alt="" class="wizard-option-logo" />
                  <div class="wizard-option-main"><I18nText k="dashboard.optionFutureGroup5" /></div>
                  <div class="wizard-option-desc"><I18nText k="wizard.futureGroup5Desc" /></div>
                </button>
                <button type="button" class="wizard-option wizard-option-card" :class="{ active: futureGroup === '8' }" @click="futureGroup = '8'">
                  <img :src="logoFuture" alt="" class="wizard-option-logo" />
                  <div class="wizard-option-main"><I18nText k="dashboard.optionFutureGroup8" /></div>
                  <div class="wizard-option-desc"><I18nText k="wizard.futureGroup8Desc" /></div>
                </button>
              </div>
            </template>
            <template v-else>
              <div class="wizard-options wizard-options-two">
                <button type="button" class="wizard-option wizard-option-card" :class="{ active: foundersVariant === 'explore' }" @click="foundersVariant = 'explore'">
                  <img :src="logoFllExploreV" alt="" class="wizard-option-logo" />
                  <div class="wizard-option-main"><I18nText k="wizard.optionExplore" /></div>
                  <div class="wizard-option-desc"><I18nText k="wizard.optionExploreDesc" /></div>
                </button>
                <button type="button" class="wizard-option wizard-option-card" :class="{ active: foundersVariant === 'challenge' }" @click="foundersVariant = 'challenge'">
                  <img :src="logoFllChallengeV" alt="" class="wizard-option-logo" />
                  <div class="wizard-option-main"><I18nText k="wizard.optionChallenge" /></div>
                  <div class="wizard-option-desc"><I18nText k="wizard.optionChallengeDesc" /></div>
                </button>
              </div>
            </template>
          </div>

          <!-- Step 3: Future = pupils, Founders = Team/Class -->
          <div v-show="step === 3" class="wizard-step wizard-step-animate">
            <template v-if="edition === 'future'">
              <p class="wizard-question"><I18nText k="enrollFuture.howManyPupils" /></p>
              <p class="wizard-hint"><I18nText k="enrollFuture.pupilsFlexibleHint" /></p>
              <div class="wizard-options wizard-options-three wizard-options-grid">
                <button
                  v-for="num in [8, 16, 32]"
                  :key="num"
                  type="button"
                  class="wizard-option"
                  :class="{ active: futurePupils === num && futurePupilsMode !== 'custom' }"
                  @click="selectFuturePupils(num)"
                >
                  {{ num }}
                </button>
                <button
                  type="button"
                  class="wizard-option"
                  :class="{ active: futurePupilsMode === 'custom' }"
                  @click="selectFuturePupilsMore"
                >
                  <I18nText k="wizard.morePupils" />
                </button>
              </div>
              <div v-if="futurePupilsMode === 'custom'" class="wizard-counter">
                <button type="button" class="wizard-counter-btn" :disabled="futurePupilsCustom <= 40" @click="adjustFuturePupils(-8)">-</button>
                <span class="wizard-counter-value">{{ futurePupilsCustom }}</span>
                <button type="button" class="wizard-counter-btn" @click="adjustFuturePupils(8)">+</button>
              </div>
            </template>
            <template v-else>
              <div class="wizard-options wizard-options-two">
                <button type="button" class="wizard-option wizard-option-card" :class="{ active: foundersType === 'team' }" @click="foundersType = 'team'">
                  <img :src="logoFirstFllV" alt="" class="wizard-option-logo" />
                  <div class="wizard-option-main"><I18nText k="dashboard.team" /></div>
                  <div class="wizard-option-desc"><I18nText k="wizard.teamDesc" /></div>
                </button>
                <button type="button" class="wizard-option wizard-option-card" :class="{ active: foundersType === 'class' }" @click="foundersType = 'class'">
                  <img :src="logoFirstFllV" alt="" class="wizard-option-logo" />
                  <div class="wizard-option-main"><I18nText k="dashboard.class" /></div>
                  <div class="wizard-option-desc"><I18nText k="wizard.classDesc" /></div>
                </button>
              </div>
            </template>
          </div>

          <!-- Step 4: Form data -->
          <div v-show="step === 4" class="wizard-step wizard-step-form wizard-step-animate">
            <div v-if="edition !== 'future'" class="field" :class="{ filled: isFilled(formData.name) }">
              <input v-model="formData.name" type="text" placeholder=" " />
              <label>
                <I18nText v-if="foundersType === 'team'" k="enrollTeam.teamName" />
                <I18nText v-else k="enrollClass.className" />
                <span class="required">*</span>
              </label>
            </div>
            <div v-if="foundersType === 'team'" class="field" :class="{ filled: isFilled(formData.schoolOrClub) }">
              <input v-model="formData.schoolOrClub" type="text" placeholder=" " />
              <label><I18nText k="enrollTeam.schoolClub" /></label>
            </div>
            <template v-if="foundersType === 'class' || edition === 'future'">
              <div class="field" :class="{ filled: isFilled(formData.organization) }">
                <input v-model="formData.organization" type="text" placeholder=" " />
                <label><I18nText k="enroll.schoolName" /></label>
              </div>
              <div class="field field-select">
                <label><I18nText k="enroll.schoolType" /></label>
                <select v-model="formData.schoolType">
                  <option v-for="opt in SCHOOL_TYPE_OPTIONS" :key="opt.value" :value="opt.value">
                    {{ t(opt.labelKey) }}
                  </option>
                </select>
              </div>
            </template>
            <template v-if="edition === 'future' || foundersType === 'class' || foundersType === 'team'">
              <div class="field field-select">
                <label><I18nText k="enroll.schoolCountry" /></label>
                <select v-model="formData.country">
                  <optgroup :label="t('enroll.countriesTop')">
                    <option v-for="opt in countryOptions.top" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                  </optgroup>
                  <optgroup :label="t('enroll.countriesOther')">
                    <option v-for="opt in countryOptions.rest" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                  </optgroup>
                </select>
              </div>
              <div class="field" :class="{ filled: isFilled(formData.zip) }">
                <input v-model="formData.zip" type="text" placeholder=" " />
                <label><I18nText k="enroll.schoolZip" /></label>
              </div>
              <div v-if="formData.city || formData.state" class="wizard-place-display-wrap">
                <span class="wizard-place-display">{{ [formData.city, formData.state].filter(Boolean).join(', ') }}</span>
              </div>
            </template>
            <template v-if="foundersType === 'class'">
              <div class="field" :class="{ filled: isFilled(formData.grade) }">
                <input v-model="formData.grade" type="text" placeholder=" " />
                <label><I18nText k="enrollClass.grade" /></label>
              </div>
              <div class="field" :class="{ filled: isFilled(formData.teacherName) }">
                <input v-model="formData.teacherName" type="text" placeholder=" " />
                <label><I18nText k="enrollClass.teacherName" /></label>
              </div>
              <div class="field" :class="{ filled: isFilled(formData.description) }">
                <input v-model="formData.description" type="text" placeholder=" " />
                <label><I18nText k="enrollClass.description" /></label>
              </div>
              <div class="field" :class="{ filled: isFilled(formData.playersTotal) }">
                <input v-model="formData.playersTotal" type="number" min="0" step="1" placeholder=" " />
                <label><I18nText k="enrollClass.playersTotal" /></label>
              </div>
            </template>
            <div class="field" :class="{ filled: isFilled(formData.notes) }">
              <textarea v-model="formData.notes" rows="2" placeholder=" " />
              <label><I18nText k="enrollTeam.notes" /></label>
            </div>
          </div>

          <!-- Step 5: Participants (Founder team only) -->
          <div v-show="step === 5 && foundersTeamHasParticipantsStep" class="wizard-step wizard-step-form wizard-step-animate">
            <p class="wizard-hint"><I18nText k="wizard.participantsHint" /></p>
            <div class="wizard-participants">
              <div class="wizard-participant-row wizard-participant-header">
                <span class="wizard-participant-label"><I18nText k="detail.firstname" /></span>
                <span class="wizard-participant-label"><I18nText k="detail.lastname" /></span>
                <span class="wizard-participant-label"><I18nText k="detail.dateOfBirth" /></span>
                <span class="wizard-participant-label"><I18nText k="detail.gender" /></span>
                <span></span>
              </div>
              <div
                v-for="(p, idx) in founderTeamPlayers"
                :key="'p-' + idx"
                class="wizard-participant-row"
              >
                <input v-model="p.firstname" type="text" class="wizard-participant-input" :placeholder="t('detail.firstname')" />
                <input v-model="p.name" type="text" class="wizard-participant-input" :placeholder="t('detail.lastname')" />
                <input v-model="p.birthdayStr" type="date" class="wizard-participant-input wizard-participant-dob" :title="t('detail.dateOfBirth')" />
                <select v-model="p.gender" class="wizard-participant-select">
                  <option value=""><I18nText k="detail.gender" /></option>
                  <option value="M"><I18nText k="detail.genderM" /></option>
                  <option value="F"><I18nText k="detail.genderF" /></option>
                  <option value="D"><I18nText k="detail.genderD" /></option>
                </select>
                <button type="button" class="wizard-participant-remove" :aria-label="t('detail.remove')" @click="removeFounderParticipant(idx)">
                  <i class="bi bi-trash"></i>
                </button>
              </div>
              <button type="button" class="wizard-btn-add-participant" @click="addFounderParticipant">
                <i class="bi bi-plus-lg"></i> <I18nText k="detail.addPlayer" />
              </button>
            </div>
          </div>

          <!-- Step 6: Event (Founder team only) -->
          <div v-show="step === 6 && foundersTeamHasParticipantsStep" class="wizard-step wizard-step-form wizard-step-animate">
            <p class="wizard-hint"><I18nText k="wizard.founderTeamEventHint" /></p>
            <div class="wizard-event-select-wrap">
              <div class="wizard-event-dropdowns">
                <EventSelectDropdown
                  :title="t('wizard.eventSelectAllEvents')"
                  :events="founderEvents"
                  :loading="founderEventsLoading"
                  :model-value="founderTeamEventId"
                  :placeholder="t('wizard.founderTeamEventPlaceholder')"
                  :event-label-fn="futureEventOptionLabel"
                  @update:model-value="founderTeamEventId = $event"
                />
                <EventSelectDropdown
                  :title="t('wizard.eventSelectNearest')"
                  :events="founderEventsNearest"
                  :loading="founderEventsNearestLoading"
                  :model-value="founderTeamEventId"
                  :placeholder="t('wizard.founderTeamEventPlaceholder')"
                  :event-label-fn="futureEventOptionLabel"
                  @update:model-value="founderTeamEventId = $event"
                />
              </div>
            </div>
          </div>

          <!-- Step 5: On-site event (Future only) -->
          <div v-show="step === 5 && edition === 'future'" class="wizard-step wizard-step-animate">
            <div class="wizard-step-voucher-inner wizard-step-onsite-event">
              <p class="wizard-question"><I18nText k="wizard.onSiteEventQuestion" /></p>
              <p class="wizard-hint"><I18nText k="wizard.onSiteEventHint" /></p>
              <p class="wizard-hint wizard-hint-skip"><I18nText k="wizard.onSiteEventSkipHint" /></p>
              <div class="wizard-options wizard-options-stack">
                <button
                  type="button"
                  class="wizard-option wizard-option-card"
                  :class="{ active: futureOnSiteEvent === 'yes' }"
                  @click="futureOnSiteEvent = 'yes'"
                >
                  <div class="wizard-option-main"><I18nText k="wizard.onSiteEventYes" /></div>
                  <div class="wizard-option-desc"><I18nText k="wizard.onSiteEventYesDesc" /></div>
                </button>
                <div v-if="futureOnSiteEvent === 'yes'" class="wizard-event-select-wrap">
                  <p class="wizard-event-label"><I18nText k="wizard.onSiteEventSelect" /></p>
                  <div class="wizard-event-dropdowns">
                    <EventSelectDropdown
                      :title="t('wizard.eventSelectAllEvents')"
                      :events="futureEvents"
                      :loading="futureEventsLoading"
                      :model-value="futureEventId"
                      :placeholder="t('wizard.onSiteEventSelectPlaceholder')"
                      :event-label-fn="futureEventOptionLabel"
                      @update:model-value="futureEventId = $event"
                    />
                    <EventSelectDropdown
                      :title="t('wizard.eventSelectNearest')"
                      :events="futureEventsNearest"
                      :loading="futureEventsNearestLoading"
                      :model-value="futureEventId"
                      :placeholder="t('wizard.onSiteEventSelectPlaceholder')"
                      :event-label-fn="futureEventOptionLabel"
                      @update:model-value="futureEventId = $event"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  class="wizard-option wizard-option-card"
                  :class="{ active: futureOnSiteEvent === 'no' }"
                  @click="futureOnSiteEvent = 'no'; futureEventId = null"
                >
                  <div class="wizard-option-main"><I18nText k="wizard.onSiteEventNo" /></div>
                  <div class="wizard-option-desc"><I18nText k="wizard.onSiteEventNoDesc" /></div>
                </button>
                <button
                  type="button"
                  class="wizard-option wizard-option-card"
                  :class="{ active: futureOnSiteEvent === 'skip' }"
                  @click="futureOnSiteEvent = 'skip'; futureEventId = null"
                >
                  <div class="wizard-option-main"><I18nText k="wizard.onSiteEventSkip" /></div>
                  <div class="wizard-option-desc"><I18nText k="wizard.onSiteEventSkipDesc" /></div>
                </button>
              </div>
            </div>
          </div>

          <!-- Step 6: Order overview (Future) -->
          <div v-show="step === 6 && edition === 'future'" class="wizard-step wizard-step-form wizard-step-animate">
            <p v-if="!areAddressesValid()" class="wizard-hint wizard-hint-required"><i class="bi bi-info-circle"></i> <I18nText k="wizard.addressesRequiredHint" /></p>
            <div class="wizard-cart">
              <h3 class="wizard-cart-title"><I18nText k="wizard.orderTitle" /></h3>
              <div class="wizard-cart-row">
                <span><I18nText k="wizard.orderEdition" /></span>
                <strong><I18nText k="dashboard.editionFuture" /></strong>
              </div>
              <div class="wizard-cart-row">
                <span><I18nText k="wizard.orderGroup" /></span>
                <strong>
                  <I18nText v-if="futureGroup === '5'" k="dashboard.optionFutureGroup5" tag="span" />
                  <I18nText v-else k="dashboard.optionFutureGroup8" tag="span" />
                </strong>
              </div>
              <div class="wizard-cart-row">
                <span><I18nText k="wizard.orderPupils" /></span>
                <strong>{{ futurePupils }} <I18nText k="enrollFuture.pupils" /></strong>
              </div>
              <div v-if="formData.organization?.trim()" class="wizard-cart-row">
                <span><I18nText k="wizard.orderSchool" /></span>
                <strong>{{ formData.organization.trim() }}</strong>
              </div>
              <div v-if="futureOnSiteEvent === 'yes' && futureEventId" class="wizard-cart-row">
                <span><I18nText k="wizard.orderOnSiteEvent" /></span>
                <strong>{{ selectedFutureEventLabel || futureEventId }}</strong>
              </div>
            </div>

            <div class="field" :class="{ filled: isFilled(voucher) }">
              <input
                v-model="voucher"
                type="text"
                placeholder=" "
                @input="voucherValid = null; voucherMessage = ''; voucherType = null; voucherInvoiceId = null; voucherInvoiceName = null"
                @blur="onVoucherBlur"
              />
              <label><I18nText k="enroll.voucher" /></label>
              <p v-if="voucherChecking" class="field-hint checking"><i class="bi bi-arrow-repeat spin"></i> <I18nText k="enroll.voucherChecking" /></p>
              <p v-else-if="voucherValid === true" class="field-hint valid"><i class="bi bi-check-circle-fill"></i> {{ voucherMessage }}</p>
              <p v-else-if="voucherValid === false" class="field-hint invalid"><i class="bi bi-exclamation-circle-fill"></i> {{ voucherMessage }}</p>
            </div>
            <template v-if="voucherType === '1'">
              <p class="field-hint valid voucher-forced-msg"><i class="bi bi-info-circle-fill"></i> <I18nText k="enroll.voucherInvoiceForced" /> <span v-if="voucherInvoiceName">({{ voucherInvoiceName }})</span></p>
            </template>

            <AddressSelector v-model="deliveryAddress" :addresses="addresses" :label="t('enroll.deliveryAddress')" id-prefix="wizard-delivery" />
            <template v-if="voucherType === '1'">
              <div class="field voucher-invoice-forced">
                <label class="label"><I18nText k="enroll.invoiceAddress" /></label>
                <p class="field-hint valid voucher-forced-msg"><i class="bi bi-info-circle-fill"></i> <I18nText k="enroll.voucherInvoiceForced" /> <span v-if="voucherInvoiceName">({{ voucherInvoiceName }})</span></p>
              </div>
            </template>
            <AddressSelector v-else v-model="invoiceAddress" :addresses="addresses" :label="t('enroll.invoiceAddress')" id-prefix="wizard-invoice" />
          </div>

          <!-- Step 5: Addresses (Founders class) / Step 7: Addresses (Founder team) – voucher available at checkout here -->
          <div
            v-show="(step === 5 && edition === 'founders' && foundersType === 'class') || (step === 7 && foundersTeamHasParticipantsStep)"
            class="wizard-step wizard-step-form wizard-step-animate"
          >
            <p v-if="!areAddressesValid()" class="wizard-hint wizard-hint-required"><i class="bi bi-info-circle"></i> <I18nText k="wizard.addressesRequiredHint" /></p>
            <div class="field" :class="{ filled: isFilled(voucher) }">
              <input
                v-model="voucher"
                type="text"
                placeholder=" "
                @input="voucherValid = null; voucherMessage = ''; voucherType = null; voucherInvoiceId = null; voucherInvoiceName = null"
                @blur="onVoucherBlur"
              />
              <label><I18nText k="enroll.voucher" /></label>
              <p v-if="voucherChecking" class="field-hint checking"><i class="bi bi-arrow-repeat spin"></i> <I18nText k="enroll.voucherChecking" /></p>
              <p v-else-if="voucherValid === true" class="field-hint valid"><i class="bi bi-check-circle-fill"></i> {{ voucherMessage }}</p>
              <p v-else-if="voucherValid === false" class="field-hint invalid"><i class="bi bi-exclamation-circle-fill"></i> {{ voucherMessage }}</p>
            </div>
            <template v-if="voucherType === '1'">
              <p class="field-hint valid voucher-forced-msg"><i class="bi bi-info-circle-fill"></i> <I18nText k="enroll.voucherInvoiceForced" /> <span v-if="voucherInvoiceName">({{ voucherInvoiceName }})</span></p>
            </template>
            <AddressSelector v-model="deliveryAddress" :addresses="addresses" :label="t('enroll.deliveryAddress')" id-prefix="wizard-delivery" />
            <template v-if="voucherType === '1'">
              <div class="field voucher-invoice-forced">
                <label class="label"><I18nText k="enroll.invoiceAddress" /></label>
                <p class="field-hint valid voucher-forced-msg"><i class="bi bi-info-circle-fill"></i> <I18nText k="enroll.voucherInvoiceForced" /> <span v-if="voucherInvoiceName">({{ voucherInvoiceName }})</span></p>
              </div>
            </template>
            <AddressSelector v-else v-model="invoiceAddress" :addresses="addresses" :label="t('enroll.invoiceAddress')" id-prefix="wizard-invoice" />
          </div>

          <!-- Step 6: Order overview / Checkout (Founders class) / Step 8: Order overview (Founder team) -->
          <div
            v-show="(step === 6 && edition === 'founders' && foundersType === 'class') || (step === 8 && foundersTeamHasParticipantsStep)"
            class="wizard-step wizard-step-form wizard-step-animate"
          >
            <div class="wizard-cart">
              <h3 class="wizard-cart-title"><I18nText k="wizard.orderTitle" /></h3>
              <div class="wizard-cart-row">
                <span><I18nText k="wizard.orderEdition" /></span>
                <strong><I18nText k="dashboard.editionFounders" /></strong>
              </div>
              <div class="wizard-cart-row">
                <span>
                  <I18nText v-if="foundersType === 'team'" k="dashboard.team" />
                  <I18nText v-else k="dashboard.class" />
                </span>
                <strong>
                  <I18nText v-if="foundersVariant === 'explore'" k="wizard.optionExplore" tag="span" />
                  <I18nText v-else k="wizard.optionChallenge" tag="span" />
                </strong>
              </div>
              <div class="wizard-cart-row">
                <span>
                  <I18nText v-if="foundersType === 'team'" k="enrollTeam.teamName" />
                  <I18nText v-else k="enrollClass.className" />
                </span>
                <strong>{{ formData.name?.trim() || '—' }}</strong>
              </div>
              <div v-if="foundersType === 'team' && founderTeamEventId" class="wizard-cart-row">
                <span><I18nText k="wizard.stepEvent" /></span>
                <strong>{{ selectedFounderEventLabel || founderTeamEventId }}</strong>
              </div>
              <div v-if="foundersType === 'team' && founderTeamPlayers.length" class="wizard-cart-row">
                <span><I18nText k="detail.players" /></span>
                <strong>{{ founderTeamPlayers.filter((p) => p.firstname || p.name || p.gender || p.birthdayStr).length }}</strong>
              </div>
              <div v-if="voucher?.trim()" class="wizard-cart-row">
                <span><I18nText k="enroll.voucher" /></span>
                <strong>{{ voucherValid === true ? (voucherMessage || voucher) : voucher }}</strong>
              </div>
            </div>
            <p class="wizard-hint"><I18nText k="wizard.orderReviewHint" /></p>
          </div>
        </div>

        <div v-if="error" class="wizard-message error"><i class="bi bi-exclamation-circle"></i> {{ error }}</div>
        <div v-if="success" class="wizard-message success">
          <i class="bi bi-check-circle-fill"></i>
          <template v-if="successMessage">{{ successMessage }}</template>
          <I18nText v-else k="wizard.success" />
        </div>

        <div class="wizard-footer">
          <button type="button" class="btn btn-ghost" :disabled="step === 0" @click="prev">
            <i class="bi bi-arrow-left"></i> <I18nText k="wizard.back" />
          </button>
          <button v-if="step < totalSteps" type="button" class="btn btn-primary" :disabled="!canNext()" @click="next">
            <I18nText k="wizard.next" /> <i class="bi bi-arrow-right"></i>
          </button>
          <button v-else type="button" class="btn btn-primary" :disabled="submitting || (edition !== 'future' && !formData.name?.trim()) || !areAddressesValid()" @click="submit">
            <i v-if="submitting" class="bi bi-arrow-repeat spin"></i>
            <i v-else class="bi bi-check-lg"></i>
            <I18nText v-if="submitting" k="wizard.submitting" />
            <I18nText v-else k="wizard.submit" />
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
  animation: wizardFadeIn 0.35s ease;
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

/* Participants step (founder team) */
.wizard-participants {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.wizard-participant-row {
  display: grid;
  grid-template-columns: 1fr 1fr minmax(8rem, auto) minmax(6rem, auto) auto;
  gap: 0.5rem;
  align-items: center;
}
.wizard-participant-row.wizard-participant-header {
  padding-bottom: 0.25rem;
  border-bottom: 1px solid var(--color-border);
  margin-bottom: 0.25rem;
}
.wizard-participant-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: none;
}
.wizard-participant-input,
.wizard-participant-select {
  padding: 0.5rem 0.6rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-bg);
  color: var(--color-text);
  font-size: 0.95rem;
}
.wizard-participant-input.wizard-participant-dob {
  min-width: 0;
}
.wizard-participant-select {
  cursor: pointer;
}
.wizard-participant-remove {
  padding: 0.5rem;
  border: none;
  border-radius: var(--radius);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.wizard-participant-remove:hover {
  background: var(--color-bg-elevated);
  color: var(--color-error, #dc2626);
}
.wizard-btn-add-participant {
  margin-top: 0.5rem;
  padding: 0.6rem 1rem;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius);
  background: transparent;
  color: var(--color-text-muted);
  font-size: 0.95rem;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  align-self: flex-start;
}
.wizard-btn-add-participant:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

/* Step 0: vertical layout for voucher / direct entry */
.wizard-step-voucher {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
}
.wizard-step-voucher .wizard-step-voucher-inner {
  width: 100%;
  max-width: 28rem;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}
.wizard-step-voucher .wizard-question {
  margin: 0 0 0.25rem;
}
.wizard-step-voucher .wizard-hint {
  margin: 0 0 0.5rem;
}
.wizard-options-stack {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
}
.wizard-voucher-code-form {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  width: 100%;
}
.wizard-voucher-code-form .field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 0;
}
.wizard-voucher-code-form .field label {
  position: static;
  font-size: 1rem;
  font-weight: 500;
  color: var(--color-text);
  margin-bottom: 0.25rem;
}
.wizard-voucher-code-form .field input {
  width: 100%;
  padding: 0.85rem 1rem;
  border: 2px solid var(--color-border);
  border-radius: 0.75rem;
  font-size: 1.05rem;
  box-sizing: border-box;
}
.wizard-voucher-code-form .field input:focus {
  border-color: var(--color-accent);
  outline: none;
}
.wizard-voucher-code-form .field-hint {
  margin: 0;
}
.wizard-step-onsite-event {
  max-width: 32rem;
}
.wizard-hint-skip {
  font-size: 0.9rem;
  color: var(--color-accent);
  margin-bottom: 0.5rem;
}
.wizard-event-select-wrap {
  margin-top: 0.5rem;
  padding: 1rem;
  background: var(--color-bg-elevated);
  border-radius: var(--radius);
  border: 1px solid var(--color-border);
}
.wizard-event-dropdowns {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.wizard-event-label {
  display: block;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 0.5rem;
}
.wizard-event-select {
  width: 100%;
  padding: 0.75rem 1rem;
  font-size: 1rem;
  border: 2px solid var(--color-border);
  border-radius: 0.5rem;
  background: var(--color-bg);
  color: var(--color-text);
}
.wizard-event-select:focus {
  border-color: var(--color-accent);
  outline: none;
}
.wizard-step-animate {
  animation: wizardStepSlide 0.35s ease;
}
.wizard-question {
  font-size: var(--text-base);
  font-weight: 500;
  color: var(--color-text);
  margin: 0 0 1rem;
}
.wizard-hint {
  margin: 0.35rem 0 1.25rem;
  font-size: 0.95rem;
  color: var(--color-text-muted);
}
.wizard-options {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}
.wizard-options.wizard-options-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}
.wizard-counter {
  margin-top: 1.25rem;
  display: inline-flex;
  align-items: center;
  gap: 1rem;
  padding: 0.6rem 1rem;
  border-radius: 999px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
}
.wizard-counter-btn {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 999px;
  border: none;
  background: var(--color-accent-soft);
  color: var(--color-accent);
  font-size: 1.25rem;
  font-weight: 700;
  cursor: pointer;
}
.wizard-counter-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.wizard-counter-value {
  font-size: 1.25rem;
  font-weight: 600;
  min-width: 3rem;
  text-align: center;
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
  animation: wizardFloatIn 0.4s ease;
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
.wizard-place-display-wrap {
  margin-top: 0.25rem;
  margin-bottom: 1rem;
}
.wizard-place-display {
  font-size: 1rem;
  color: var(--color-text);
}
.wizard-step-form input,
.wizard-step-form textarea,
.wizard-step-form select {
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
.wizard-step-form textarea:focus,
.wizard-step-form select:focus {
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
.wizard-step-form .field-select label {
  position: static;
  transform: none;
  font-size: 1rem;
  color: var(--color-text);
  margin-bottom: 0.5rem;
}
.wizard-step-form .field-select select {
  padding-top: 0.95rem;
}
.wizard-cart {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: 1rem;
  padding: 1rem 1.25rem;
  margin-bottom: 1.5rem;
  box-shadow: var(--shadow-sm);
}
.wizard-cart-title {
  margin: 0 0 0.75rem;
  font-size: 1rem;
  font-weight: 700;
  color: var(--color-text);
}
.wizard-cart-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.35rem 0;
  font-size: 0.95rem;
  color: var(--color-text-muted);
}
.wizard-cart-row strong {
  color: var(--color-text);
  font-weight: 600;
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
.wizard-voucher-code-form .wizard-back-link {
  margin-top: 0.5rem;
}
.wizard-back-link {
  padding: 0.5rem 0;
  font-size: 0.95rem;
  color: var(--color-text-muted);
  background: none;
  border: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  width: fit-content;
}
.wizard-back-link:hover { color: var(--color-text); }
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
  animation: wizardSlideIn 0.5s ease;
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
.wizard-path {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}
.wizard-path-step {
  display: grid;
  grid-template-columns: 2rem 1fr;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 0.75rem;
  border-radius: 0.85rem;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(4px);
  animation: wizardPopIn 0.4s ease;
}
.wizard-path-icon {
  width: 2rem;
  height: 2rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #f8fafc;
}
.wizard-path-label {
  color: #f8fafc;
  font-size: 0.95rem;
  font-weight: 600;
  letter-spacing: 0.01em;
}

@keyframes wizardFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes wizardSlideIn {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes wizardFloatIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes wizardPopIn {
  from { opacity: 0; transform: scale(0.97); }
  to { opacity: 1; transform: scale(1); }
}

@keyframes wizardStepSlide {
  from { opacity: 0; transform: translateX(14px); }
  to { opacity: 1; transform: translateX(0); }
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
