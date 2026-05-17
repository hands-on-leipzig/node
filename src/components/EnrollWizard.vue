<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { enrollTeam, enrollClass, enrollFuture, getEventsNearest, validateVoucher, updateTeamPlayers, registerTeamForEvent, listAddressBookGrouped, isDolibarrRowId } from '@/services/draht'
import AddressSelector from '@/components/AddressSelector.vue'
import CustomSelect from '@/components/CustomSelect.vue'
import EnrollConsentCheckboxes from '@/components/EnrollConsentCheckboxes.vue'
import EventSelectDropdown from '@/components/EventSelectDropdown.vue'
import { FUTURE_PUPIL_OPTIONS } from '@/config/enrollmentOptions'
import {
  FUTURE_GROUP_PRICE_EUR,
  FUTURE_SEASON_SET_UNIT_EUR,
  FUTURE_TEAM_EVENT_UNIT_EUR,
} from '@/config/futureEditionConfig'
import { SCHOOL_TYPE_OPTIONS } from '@/config/schoolTypes'
import { usePrivateInstitutionOrganization } from '@/composables/usePrivateInstitutionOrganization'
import logoFllExploreV from '@/assets/fll_explore_v.png'
import logoFllChallengeV from '@/assets/fll_challenge_v.png'
import logoFuture from '@/assets/first_rgb_fullcolor_ohne.png'
import logoFounders from '@/assets/first_canopy_fll_founders_edition_rgb_fullcolor.png'

const props = defineProps({
  open: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'success'])
const previousBodyOverflow = ref('')
const previousHtmlOverflow = ref('')

const { t, locale } = useI18n()
const router = useRouter()
const FUTURE_GROUP_5_ENABLED = false

const emptyAddressState = () => ({
  useExisting: true,
  addressId: '',
  new: { street: '', postalCode: '', city: '', country: '' },
})

// Step 0: Voucher / Direkteinstieg
const hasVoucherCode = ref(null) // null | 'yes' | 'no'
// Step 1
const edition = ref(null) // 'founders' | 'future'
// Step 2: Future = group '5'|'8', Founders = variant + type 'team'|'class' (same step)
const futureGroup = ref(null)
const foundersVariant = ref(null)
// Step 3: Institution (school / location — same step for all modes)
// Step 4: Future = pupils 8|16|24, Founders class = players count, Founders team = name + participant list
const futurePupils = ref(null)
// Future: optional on-site event registration (+100€)
const futureOnSiteEvent = ref(null) // null | 'yes' | 'later'
const futureEventId = ref(null)
const futureEventsNearest = ref([])
const futureEventsNearestLoading = ref(false)
const futureEventTeamCount = ref(1)
const futureTeamAutoUpgrade = ref(null)
const futureTeamEvents = ref([])
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
  playersTotal: '',
})

const { isPrivateInstitution } = usePrivateInstitutionOrganization(formData)

// Step 5
const voucher = ref('')
const voucherChecking = ref(false)
const voucherValid = ref(null)
const voucherMessage = ref('')
const voucherType = ref(null)
const voucherInvoiceId = ref(null)
const voucherInvoiceName = ref(null)
/** Optional invoice address from voucher JSON preset (llx_societe / address book id). */
const voucherPresetInvoiceId = ref(null)
const voucherPresetInvoiceName = ref(null)
/** 0|1|2 — maps to seasonSetCount / num_boards in enrollment API payloads. */
const presetSeasonSetCount = ref(null)
/** User-chosen season sets (0–2); overridden in payload when voucher preset sets count. */
const wizardSeasonSetCount = ref(1)

const effectiveSeasonSetCount = computed(() => {
  if (presetSeasonSetCount.value != null && [0, 1, 2].includes(presetSeasonSetCount.value)) {
    return presetSeasonSetCount.value
  }
  const w = Number(wizardSeasonSetCount.value)
  return [0, 1, 2].includes(w) ? w : 1
})
const presetRegisterEventTeams = ref(null)
const presetEventTeamCount = ref(null)
// Founder team: participants (first name, last name, date of birth, gender)
const founderTeamPlayers = ref([])
// Founder team: event to register for
const founderTeamEventId = ref(null)
const founderEventsNearest = ref([])
const founderEventsNearestLoading = ref(false)
// Step 6
const deliveryAddress = ref(emptyAddressState())
const invoiceAddress = ref(emptyAddressState())
/** Options for delivery selector (contacts only when API returns split lists). */
const deliveryAddresses = ref([])
/** Options for invoice selector (third parties only when API returns split lists). */
const invoiceAddresses = ref([])
const deliveryAddressDifferent = ref(false)

const consentDataProcessing = ref(false)
const consentTerms = ref(false)
const consentNewsletter = ref(false)

const step = ref(1)
const submitting = ref(false)
const error = ref(null)
const success = ref(false)
const successMessage = ref('')
const step4ValidationAttempted = ref(false)

const foundersTeamHasParticipantsStep = computed(
  () => edition.value === 'founders' && foundersType.value === 'team'
)

/** Founders inserts team/class between variant (2) and institution — institution shifts +1 vs Future. */
const institutionStepIndex = computed(() => (edition.value === 'founders' ? 4 : 3))
const participantsStepIndex = computed(() => (edition.value === 'founders' ? 5 : 4))

const lastStep = computed(() => {
  // Future: 5=sets, 6=on-site, 7=addresses, 8=review. Founders class: +sets before addresses. Team: event, then sets, addresses, order.
  if (edition.value === 'future') return 8
  if (foundersTeamHasParticipantsStep.value) return 9
  if (edition.value === 'founders') return 8
  return 1
})

const totalSteps = computed(() => lastStep.value + 1)
const FUTURE_EVENT_TEAM_SIZE = 8
const futureTeamOptionCounts = computed(() =>
  Array.from(new Set(
    FUTURE_PUPIL_OPTIONS
      .map((n) => Math.floor(Number(n) / FUTURE_EVENT_TEAM_SIZE))
      .filter((n) => Number.isFinite(n) && n > 0),
  )).sort((a, b) => a - b),
)
const maxFutureEventTeamsByPupils = computed(() => {
  const pupils = Number(futurePupils.value)
  if (!Number.isFinite(pupils) || pupils <= 0) return 0
  return Math.max(1, Math.floor(pupils / FUTURE_EVENT_TEAM_SIZE))
})
const futureTeamEventsAllSelected = computed(() => {
  if (futureOnSiteEvent.value !== 'yes') return true
  if (futureTeamEvents.value.length === 0) return false
  return futureTeamEvents.value.every((entry) => {
    const evId = Number(entry?.eventId)
    return Number.isFinite(evId) && evId > 0
  })
})

/** Matches the step label (step+1)/(last+1): first screen > 0% and final screen = 100%. */
const progress = computed(() => {
  const last = lastStep.value
  if (last < 0) return 0
  return Math.min(100, Math.round(((step.value + 1) / (last + 1)) * 100))
})

const wizardProgressSteps = computed(() => {
  const s = step.value
  const withIndex = (items) => items.map((it, idx) => ({ ...it, index: idx + 1, label: t(it.key) }))

  if (edition.value === 'future') {
    return withIndex([
      { key: 'wizard.progressChoose', active: s <= 2, done: s > 2 },
      { key: 'wizard.progressDetails', active: s === 3, done: s > 3 },
      { key: 'wizard.progressParticipants', active: s === 4, done: s > 4 },
      { key: 'wizard.progressSeasonSets', active: s === 5, done: s > 5 },
      { key: 'wizard.progressOnSite', active: s === 6, done: s > 6 },
      { key: 'wizard.progressAddresses', active: s === 7, done: s > 7 },
      { key: 'wizard.progressReview', active: s === 8, done: success.value },
    ])
  }

  if (foundersTeamHasParticipantsStep.value) {
    return withIndex([
      { key: 'wizard.progressChoose', active: s <= 2, done: s > 2 },
      { key: 'wizard.stepTeamClass', active: s === 3, done: s > 3 },
      { key: 'wizard.progressDetails', active: s === 4, done: s > 4 },
      { key: 'wizard.progressParticipants', active: s === 5, done: s > 5 },
      { key: 'wizard.progressEvent', active: s === 6, done: s > 6 },
      { key: 'wizard.progressSeasonSets', active: s === 7, done: s > 7 },
      { key: 'wizard.progressAddresses', active: s === 8, done: s > 8 },
      { key: 'wizard.progressReview', active: s === 9, done: success.value },
    ])
  }

  return withIndex([
    { key: 'wizard.progressChoose', active: s <= 2, done: s > 2 },
    { key: 'wizard.stepTeamClass', active: s === 3, done: s > 3 },
    { key: 'wizard.progressDetails', active: s === 4, done: s > 4 },
    { key: 'wizard.progressParticipants', active: s === 5, done: s > 5 },
    { key: 'wizard.progressSeasonSets', active: s === 6, done: s > 6 },
    { key: 'wizard.progressAddresses', active: s === 7, done: s > 7 },
    { key: 'wizard.progressReview', active: s === 8, done: success.value },
  ])
})

const stepTitle = computed(() => {
  const s = step.value
  const ft = foundersTeamHasParticipantsStep.value
  if (s === 0) return t('wizard.stepVoucherCode')
  if (s === 1) return t('wizard.stepEdition')
  if (s === 2) return edition.value === 'future' ? t('wizard.stepFutureGroup') : t('wizard.stepVariant')
  if (s === 3) {
    if (edition.value === 'future') return t('wizard.stepInstitution')
    return t('wizard.stepTeamClass')
  }
  if (s === 4) {
    if (edition.value === 'future') return t('wizard.stepPupils')
    if (edition.value === 'founders') return t('wizard.stepInstitution')
    return ''
  }
  if (s === 5) {
    if (edition.value === 'future') return t('enrollFuture.stepSeasonSets')
    if (edition.value === 'founders') {
      if (foundersType.value === 'class') return t('wizard.stepClassParticipants')
      return t('wizard.stepParticipants')
    }
    return ''
  }
  if (s === 6) {
    if (edition.value === 'future') return t('wizard.stepOnSiteEvent')
    if (ft) return t('wizard.stepEvent')
    if (edition.value === 'founders' && foundersType.value === 'class') return t('enrollFuture.stepSeasonSets')
    return ''
  }
  if (s === 7) {
    if (edition.value === 'future') return t('wizard.stepAddresses')
    if (ft) return t('enrollFuture.stepSeasonSets')
    if (edition.value === 'founders' && foundersType.value === 'class') return t('wizard.stepAddresses')
    return ''
  }
  if (s === 8) {
    if (edition.value === 'future') return t('wizard.stepOrder')
    if (ft) return t('wizard.stepAddresses')
    if (edition.value === 'founders' && foundersType.value === 'class') return t('wizard.stepOrder')
    return ''
  }
  if (s === 9 && ft) return t('wizard.stepOrder')
  return ''
})

function scheduleAdvanceIfReady(expectedStep) {
  nextTick(() => {
    if (!props.open) return
    if (step.value !== expectedStep) return
    if (!canNext()) return
    next()
  })
}

function formatFutureGroupPriceEur(pupils) {
  const amount = FUTURE_GROUP_PRICE_EUR[Number(pupils)]
  if (!Number.isFinite(amount)) return ''
  try {
    return new Intl.NumberFormat(locale.value === 'de' ? 'de-DE' : 'en-GB', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${amount} €`
  }
}

function formatWizardEur(amount) {
  const n = Number(amount)
  if (!Number.isFinite(n)) return ''
  try {
    return new Intl.NumberFormat(locale.value === 'de' ? 'de-DE' : 'en-GB', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(n)
  } catch {
    return `${n} €`
  }
}

function selectFuturePupils(num) {
  futurePupils.value = num
  futureTeamAutoUpgrade.value = null
  const maxTeams = maxFutureEventTeamsByPupils.value
  if (futureEventTeamCount.value > maxTeams) {
    futureEventTeamCount.value = maxTeams
  }
  scheduleAdvanceIfReady(4)
}

function seasonSetsStepIndex() {
  if (edition.value === 'future') return 5
  if (foundersTeamHasParticipantsStep.value) return 7
  if (edition.value === 'founders' && foundersType.value === 'class') return 6
  return -1
}

function selectWizardSeasonSetCount(count) {
  if (presetSeasonSetCount.value != null && [0, 1, 2].includes(presetSeasonSetCount.value)) return
  wizardSeasonSetCount.value = count
  const expected = seasonSetsStepIndex()
  if (expected >= 0) scheduleAdvanceIfReady(expected)
}

function selectFutureEventTeamCount(count) {
  const n = Number(count)
  const maxTeams = maxFutureEventTeamsByPupils.value
  if (!Number.isFinite(n) || n <= 0) return
  if (n <= maxTeams) {
    futureEventTeamCount.value = n
    futureTeamAutoUpgrade.value = null
    return
  }
  const neededPupils = n * FUTURE_EVENT_TEAM_SIZE
  if (!FUTURE_PUPIL_OPTIONS.includes(neededPupils)) return
  futurePupils.value = neededPupils
  futureEventTeamCount.value = n
  futureTeamAutoUpgrade.value = { teams: n, pupils: neededPupils }
}

function normalizeFutureEventTeamCount() {
  const maxTeams = maxFutureEventTeamsByPupils.value
  if (maxTeams <= 0) return 0
  const current = Number(futureEventTeamCount.value)
  if (!Number.isFinite(current) || current < 1) return 1
  return Math.min(current, maxTeams)
}

function syncFutureTeamEventsArray() {
  if (futureOnSiteEvent.value !== 'yes') {
    futureTeamEvents.value = []
    futureEventId.value = null
    return
  }
  const count = normalizeFutureEventTeamCount()
  while (futureTeamEvents.value.length < count) {
    futureTeamEvents.value.push({ eventId: null })
  }
  futureTeamEvents.value = futureTeamEvents.value.slice(0, count)
}

function updateDerivedFutureEventId() {
  if (futureOnSiteEvent.value !== 'yes' || futureTeamEvents.value.length === 0) {
    futureEventId.value = null
    return
  }
  const ids = futureTeamEvents.value
    .map((entry) => Number(entry?.eventId))
    .filter((id) => Number.isFinite(id) && id > 0)
  if (!ids.length || ids.length !== futureTeamEvents.value.length) {
    futureEventId.value = null
    return
  }
  const allSame = ids.every((id) => id === ids[0])
  futureEventId.value = allSame ? ids[0] : null
}

function selectFutureTeamEvent(teamIndex, eventId) {
  const idx = Number(teamIndex)
  if (!Number.isFinite(idx) || idx < 0) return
  if (!futureTeamEvents.value[idx]) return
  futureTeamEvents.value[idx] = { eventId: eventId ? Number(eventId) : null }
  updateDerivedFutureEventId()
}

const futureOrderGroupPriceEur = computed(() => {
  const p = Number(futurePupils.value)
  const a = FUTURE_GROUP_PRICE_EUR[p]
  return Number.isFinite(a) ? a : 0
})

const futureOrderSeasonSetsPriceEur = computed(() => {
  const n = Number(effectiveSeasonSetCount.value)
  if (!Number.isFinite(n) || n < 0) return 0
  return n * FUTURE_SEASON_SET_UNIT_EUR
})

const futureOrderEventTeamsCount = computed(() => {
  if (futureOnSiteEvent.value !== 'yes') return 0
  return normalizeFutureEventTeamCount()
})

const futureOrderEventTeamsPriceEur = computed(
  () => futureOrderEventTeamsCount.value * FUTURE_TEAM_EVENT_UNIT_EUR,
)

const futureOrderTotalEur = computed(
  () =>
    futureOrderGroupPriceEur.value +
    futureOrderSeasonSetsPriceEur.value +
    futureOrderEventTeamsPriceEur.value,
)

// generate the summary of selected options as a list of displayable items
// only show items that were set in previous steps
const summaryItems = computed(() => {
  const items = []

  if (voucher.value?.trim() && voucherValid.value === true) {
    // voucher item
    items.push({ label: t('wizard.entryByCode') })
  }


  if (step.value > 1) {
    // edition item founders
    if (edition.value == 'founders') items.push({ label: t('dashboard.editionFounders') })
    
    // edition item future
    if (edition.value == 'future') items.push({ label: t('dashboard.editionFuture') })
  }

  
  if (step.value > 2) {
    // future group size item
    if (edition.value === 'future' && futureGroup.value) items.push({ label: t(futureGroup.value === '5' ? 'dashboard.optionFutureGroup5' : 'dashboard.optionFutureGroup8') })      
    
    // founders age variant item
    if (edition.value === 'founders' && foundersVariant.value) items.push({ label: t(foundersVariant.value === 'explore' ? 'wizard.optionExplore' : 'wizard.optionChallenge') })
  }

  
  //step 3
  if (step.value > 3) {
    // future school info -> no item 
    
    // founders class or group item
    if (edition.value === 'founders' && foundersType.value) items.push({ label: t(foundersType.value === 'team' ? 'dashboard.team' : 'dashboard.class') })
  }


  //step 4
  if (step.value > 4) {
    // future pupil count item
    if (edition.value === 'future' && futurePupils.value != null) items.push({ label: `${futurePupils.value} ${t('enrollFuture.pupils')}` })
  
    // founders school info -> no item    
  }


  // step 5
  if (step.value > 5) {
    // future saison set count
    if (edition.value === 'future') {
      const sc = effectiveSeasonSetCount.value
      const setLabel = sc === 0 ? t('enrollFuture.seasonNone') : sc === 1 ? t('enrollFuture.seasonOne') : t('enrollFuture.seasonTwo')
      items.push({ label: `${t('wizard.orderSeasonSets')}: ${setLabel}` })
    }

    // founders team signup
    if (edition.value == 'founders' && foundersType.value == 'team' && formData.value.name?.trim()) items.push({ label: 'Name: ' + formData.value.name.trim()})

    // founders class pupil count
    if (edition.value == 'founders' && foundersType.value == 'class' && formData.value.playersTotal) items.push({ label: `${formData.value.playersTotal} ${t('enrollFuture.pupils')}`})
  }

  // step 6
  if (step.value > 6) {
    // future event signup
    if (edition.value === 'future' && futureOnSiteEvent.value === 'yes') {
      if (futureTeamEventSummaries.value.length > 0) {
        futureTeamEventSummaries.value.forEach((line) => items.push({ label: line }))
      } else if (futureEventId.value) {
        items.push({ label: selectedFutureEventLabel.value || t('wizard.onSiteEventSelected') })
      }
    }

    // founders class saison set count
    if (edition.value === 'founders' && foundersType.value == 'class') {
      const sc = effectiveSeasonSetCount.value
      const setLabel = sc === 0 ? t('enrollFuture.seasonNone') : sc === 1 ? t('enrollFuture.seasonOne') : t('enrollFuture.seasonTwo')
      items.push({ label: `${t('wizard.orderSeasonSets')}: ${setLabel}` })
    }
  }


  // step 7
  if (step.value > 7) {
    // future confirm adress -> no item

    // founders confirm adress -> no item

    // founders team saison set count
    if (edition.value === 'founders' && foundersType.value == 'team') {
      const sc = effectiveSeasonSetCount.value
      const setLabel = sc === 0 ? t('enrollFuture.seasonNone') : sc === 1 ? t('enrollFuture.seasonOne') : t('enrollFuture.seasonTwo')
      items.push({ label: `${t('wizard.orderSeasonSets')}: ${setLabel}` })
    }
  }

  return items
})

const selectedFutureEventLabel = computed(() => {
  if (!futureEventId.value || !futureEventsNearest.value.length) return null
  const ev = futureEventsNearest.value.find((e) => String(e.id) === String(futureEventId.value))
  return ev ? (ev.label || ev.name || ev.title || ev.ref) : null
})

const futureTeamEventSummaries = computed(() =>
  futureTeamEvents.value
    .map((entry, idx) => {
      const evId = Number(entry?.eventId)
      if (!Number.isFinite(evId) || evId <= 0) return null
      const ev = futureEventsNearest.value.find((item) => String(item.id) === String(evId))
      const evLabel = ev ? (ev.label || ev.name || ev.title || ev.ref) : `#${evId}`
      return `${t('wizard.teamSingular')} ${idx + 1}: ${evLabel}`
    })
    .filter(Boolean),
)

const selectedFounderEventLabel = computed(() => {
  if (!founderTeamEventId.value || !founderEventsNearest.value.length) return null
  const ev = founderEventsNearest.value.find((e) => String(e.id) === String(founderTeamEventId.value))
  return ev ? (ev.label || ev.name || ev.title || ev.ref) : null
})

const centeredOptionStep = computed(() => {
  if (step.value === 0) return hasVoucherCode.value === null
  return step.value === 1
    || step.value === 2
    || (step.value === 3 && edition.value === 'founders')
    || (step.value === 4 && edition.value === 'future')
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

function extractEventList(data) {
  if (Array.isArray(data)) return data
  if (!data || typeof data !== 'object') return []
  const isMapObject = (obj) => obj && typeof obj === 'object' && !Array.isArray(obj) && Object.keys(obj).length > 0
  if (isMapObject(data) && !('data' in data) && !('events' in data) && !('items' in data) && !('results' in data) && !('list' in data)) {
    return Object.values(data)
  }
  const direct = data.data ?? data.events ?? data.items ?? data.results ?? data.list
  if (Array.isArray(direct)) return direct
  if (isMapObject(direct)) return Object.values(direct)
  if (direct && typeof direct === 'object') {
    const nested = direct.data ?? direct.events ?? direct.items ?? direct.results ?? direct.list
    if (Array.isArray(nested)) return nested
    if (isMapObject(nested)) return Object.values(nested)
  }
  return []
}

function normalizeEvents(rawList) {
  return rawList
    .map((entry) => {
      const base = entry?.event && typeof entry.event === 'object' ? { ...entry.event, ...entry } : entry
      const id = base?.id ?? base?.eventId ?? base?.event_id ?? base?.rowid ?? base?.fk_event ?? base?.value
      if (id == null || id === '') return null
      const label = base?.label ?? base?.name ?? base?.title ?? base?.ref ?? base?.eventLabel ?? base?.event_name
      return {
        ...base,
        id: String(id),
        label: label != null ? String(label) : `Event ${id}`,
      }
    })
    .filter(Boolean)
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

const schoolTypeWizardOptions = computed(() => {
  const out = []
  for (const opt of SCHOOL_TYPE_OPTIONS) {
    if (opt.disabled) {
      out.push({ heading: true, label: opt.labelKey ? t(opt.labelKey) : opt.label })
    } else {
      out.push({ value: opt.value, label: opt.labelKey ? t(opt.labelKey) : opt.label })
    }
  }
  return out
})

const countryWizardSelectOptions = computed(() => {
  const out = []
  out.push({ heading: true, label: t('enroll.countriesTop') })
  out.push(...countryOptions.value.top)
  out.push({ heading: true, label: t('enroll.countriesOther') })
  out.push(...countryOptions.value.rest)
  return out
})

const founderGenderOptions = computed(() => [
  { value: 'M', label: t('detail.genderM') },
  { value: 'F', label: t('detail.genderF') },
  { value: 'D', label: t('detail.genderD') },
])

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

const foundersLogos = [{ src: logoFounders, alt: 'Founders Edition' }]

const futureLogos = [{ src: logoFuture, alt: 'Future Edition' }]

function chooseNoVoucher() {
  hasVoucherCode.value = 'no'
  step.value = 1
}

function selectEdition(val) {
  edition.value = val
  scheduleAdvanceIfReady(1)
}

function selectFutureGroup(val) {
  if (val === '5' && !FUTURE_GROUP_5_ENABLED) return
  futureGroup.value = val
  scheduleAdvanceIfReady(2)
}

function selectFoundersVariant(val) {
  foundersVariant.value = val
  scheduleAdvanceIfReady(2)
}

function selectFoundersType(val) {
  foundersType.value = val
  scheduleAdvanceIfReady(3)
}

function openWizard() {
  hasVoucherCode.value = null
  edition.value = null
  futureGroup.value = null
  foundersVariant.value = null
  futurePupils.value = null
  futureOnSiteEvent.value = null
  futureEventId.value = null
  futureEventsNearest.value = []
  futureEventTeamCount.value = 1
  futureTeamAutoUpgrade.value = null
  futureTeamEvents.value = []
  foundersType.value = null
  formData.value = { name: '', schoolOrClub: '', schoolType: '', organization: '', country: '', zip: '', city: '', state: '', location: '', playersTotal: '' }
  voucher.value = ''
  voucherValid.value = null
  voucherMessage.value = ''
  voucherType.value = null
  voucherInvoiceId.value = null
  voucherInvoiceName.value = null
  voucherPresetInvoiceId.value = null
  voucherPresetInvoiceName.value = null
  presetSeasonSetCount.value = null
  wizardSeasonSetCount.value = 1
  presetRegisterEventTeams.value = null
  presetEventTeamCount.value = null
  deliveryAddress.value = emptyAddressState()
  invoiceAddress.value = emptyAddressState()
  deliveryAddressDifferent.value = false
  consentDataProcessing.value = false
  consentTerms.value = false
  consentNewsletter.value = false
  founderTeamPlayers.value = []
  founderTeamEventId.value = null
  step.value = 0
  error.value = null
  success.value = false
  step4ValidationAttempted.value = false
}

function close() {
  emit('close')
}

function isFilled(value) {
  return value !== null && value !== undefined && String(value).trim() !== ''
}

function isInstitutionFieldMissing(field) {
  const requiresSchoolDetails = edition.value === 'future' || foundersType.value === 'class' || foundersType.value === 'team'
  const requiresLocation = requiresSchoolDetails
  if (field === 'organization') return requiresSchoolDetails && !formData.value.organization?.trim()
  if (field === 'schoolType') return requiresSchoolDetails && !formData.value.schoolType
  if (field === 'country') return requiresLocation && !formData.value.country?.trim()
  if (field === 'zip') return requiresLocation && !formData.value.zip?.trim()
  return false
}

function hasRequiredInstitutionFields() {
  return !(
    isInstitutionFieldMissing('organization')
    || isInstitutionFieldMissing('schoolType')
    || isInstitutionFieldMissing('country')
    || isInstitutionFieldMissing('zip')
  )
}

function hasRequiredParticipantFields() {
  if (edition.value === 'future') return futurePupils.value != null
  if (foundersType.value === 'team') return !!formData.value.name?.trim()
  return true
}

function hasRequiredSchoolFields() {
  return hasRequiredInstitutionFields() && hasRequiredParticipantFields()
}

function isStep4RequiredFieldMissing(field) {
  if (field === 'name') return foundersType.value === 'team' && !formData.value.name?.trim()
  return false
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
  const s = step.value
  const ft = foundersTeamHasParticipantsStep.value
  if (s === 0) {
    if (hasVoucherCode.value === 'no') return true
    if (hasVoucherCode.value === 'yes') return !!voucher.value?.trim() && voucherValid.value === true
    return false
  }
  if (s === 1) return edition.value != null
  if (s === 2) {
    return edition.value === 'future' ? futureGroup.value != null : !!foundersVariant.value
  }
  if (s === 3) {
    if (edition.value === 'future') return hasRequiredInstitutionFields()
    return foundersType.value != null
  }
  if (s === 4) {
    if (edition.value === 'future') return hasRequiredParticipantFields()
    return hasRequiredInstitutionFields()
  }
  if (s === 5) {
    if (edition.value === 'future') {
      const w = Number(wizardSeasonSetCount.value)
      return [0, 1, 2].includes(w)
    }
    if (edition.value === 'founders') return hasRequiredParticipantFields()
    return true
  }
  if (s === 6) {
    if (edition.value === 'future') {
      if (!futureOnSiteEvent.value) return false
      if (futureOnSiteEvent.value === 'yes') {
        const n = Number(futureEventTeamCount.value)
        return Number.isFinite(n)
          && n >= 1
          && n <= maxFutureEventTeamsByPupils.value
          && futureTeamEventsAllSelected.value
      }
      return true
    }
    if (ft) return true
    if (edition.value === 'founders' && foundersType.value === 'class') {
      const w = Number(wizardSeasonSetCount.value)
      return [0, 1, 2].includes(w)
    }
    return false
  }
  if (s === 7) {
    if (edition.value === 'future') return areAddressesValid()
    if (ft) {
      const w = Number(wizardSeasonSetCount.value)
      return [0, 1, 2].includes(w)
    }
    if (edition.value === 'founders' && foundersType.value === 'class') return areAddressesValid()
    return false
  }
  if (s === 8) {
    if (edition.value === 'future') return false
    if (ft) return areAddressesValid()
    if (edition.value === 'founders' && foundersType.value === 'class') return false
    return false
  }
  if (s === 9) {
    if (ft) return false
  }
  return false
}

function next() {
  if (step.value === institutionStepIndex.value && !hasRequiredInstitutionFields()) {
    step4ValidationAttempted.value = true
    return
  }
  if (step.value === participantsStepIndex.value && !hasRequiredParticipantFields()) {
    step4ValidationAttempted.value = true
    return
  }
  if (step.value === 0) {
    step.value = firstIncompleteEnrollmentStep()
    if (edition.value === 'future' && futureGroup.value && step.value >= 2) loadAddresses()
    else if (edition.value === 'founders' && step.value >= institutionStepIndex.value) loadAddresses()
    if (step.value >= 4 && edition.value === 'future') loadFutureEventsNearest()
    if (step.value >= participantsStepIndex.value && foundersTeamHasParticipantsStep.value && founderTeamPlayers.value.length === 0) {
      addFounderParticipant()
    }
    if (step.value >= 6 && foundersTeamHasParticipantsStep.value) loadFounderTeamEventsNearest()
    return
  }
  if (step.value === 2 && edition.value === 'future') loadAddresses()
  if (step.value === institutionStepIndex.value) loadAddresses()
  if (step.value === 4 && edition.value === 'future') loadFutureEventsNearest()
  if (step.value === participantsStepIndex.value && foundersTeamHasParticipantsStep.value) {
    if (founderTeamPlayers.value.length === 0) addFounderParticipant()
    loadFounderTeamEventsNearest()
  }
  if (step.value < lastStep.value) step.value++
  step4ValidationAttempted.value = false
}

function prev() {
  if (step.value == 1) hasVoucherCode.value = null

  step.value--
}

function handleBrowserBack() {
  if (!props.open) return false
  if (step.value > 0) {
    prev()
    return true
  }
  close()
  return true
}

defineExpose({
  handleBrowserBack,
})

async function loadFutureEventsNearest() {
  futureEventsNearestLoading.value = true
  futureEventsNearest.value = []
  try {
    const country = formData.value.country?.trim() || undefined
    const zip = formData.value.zip?.trim() || undefined
    const program = futureGroup.value === '8' ? 7 : (futureGroup.value === '5' ? 6 : undefined)
    const res = await getEventsNearest(country, zip, program)
    const data = res.data
    const list = extractEventList(data)
    futureEventsNearest.value = normalizeEvents(list)
  } catch (_) {
    futureEventsNearest.value = []
  } finally {
    futureEventsNearestLoading.value = false
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
    const list = extractEventList(data)
    founderEventsNearest.value = normalizeEvents(list)
  } catch (_) {
    founderEventsNearest.value = []
  } finally {
    founderEventsNearestLoading.value = false
  }
}

async function loadAddresses() {
  try {
    const grouped = await listAddressBookGrouped()
    if (!grouped.legacyFlat) {
      deliveryAddresses.value = grouped.delivery
      invoiceAddresses.value = grouped.invoice
    } else {
      deliveryAddresses.value = grouped.combined
      invoiceAddresses.value = grouped.combined
    }
    const hasAny = deliveryAddresses.value.length > 0 || invoiceAddresses.value.length > 0
    if (hasAny) {
      if (deliveryAddress.value.useExisting === false) {
        deliveryAddress.value = { ...deliveryAddress.value, useExisting: true }
      }
      if (invoiceAddress.value.useExisting === false) {
        invoiceAddress.value = { ...invoiceAddress.value, useExisting: true }
      }
    } else {
      deliveryAddress.value = { ...deliveryAddress.value, useExisting: false }
      invoiceAddress.value = { ...invoiceAddress.value, useExisting: false }
    }
  } catch (_) {
    deliveryAddresses.value = []
    invoiceAddresses.value = []
    deliveryAddress.value = { ...deliveryAddress.value, useExisting: false }
    invoiceAddress.value = { ...invoiceAddress.value, useExisting: false }
  }
}

function buildAddressPayload(addr) {
  if (addr.useExisting && isDolibarrRowId(addr.addressId)) {
    return { addressId: String(Number(String(addr.addressId).trim())) }
  }
  const n = addr.new || {}
  if (!n.street && !n.city && !n.country) return undefined
  return { street: n.street?.trim() || undefined, postalCode: n.postalCode?.trim() || undefined, city: n.city?.trim() || undefined, country: n.country?.trim() || undefined }
}

function buildInvoicePayload() {
  if (voucherType.value === '1' && isDolibarrRowId(voucherInvoiceId.value)) {
    return { addressId: String(Number(String(voucherInvoiceId.value).trim())) }
  }
  if (isDolibarrRowId(voucherPresetInvoiceId.value)) {
    return { addressId: String(Number(String(voucherPresetInvoiceId.value).trim())) }
  }
  return buildAddressPayload(invoiceAddress.value)
}

function buildDeliveryPayload() {
  if (!deliveryAddressDifferent.value) return buildInvoicePayload()
  return buildAddressPayload(deliveryAddress.value)
}

/** Delivery address is valid when an existing one is selected or new address has at least street/city/country. */
function isDeliveryAddressValid() {
  return !!buildDeliveryPayload()
}

/** Invoice address is valid when voucher forces it (and we have id), or same as delivery. */
function isInvoiceAddressValid() {
  if (voucherType.value === '1') return isDolibarrRowId(voucherInvoiceId.value)
  if (isDolibarrRowId(voucherPresetInvoiceId.value)) return true
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
 * Apply preset from voucher API `preset` object (or legacy flat body).
 * edition ('founders'|'future'), program (1|2|4|5|6|7), future: group ('5'|'8'), pupils (number).
 * Program: 1=Explore team, 2=Challenge team, 4=Explore class, 5=Challenge class, 6=Future 5-8, 7=Future 8-16.
 */
function logVoucherDebug(label, payload) {
  console.info(`[EnrollWizard][voucher] ${label}`, payload)
}

function applyVoucherPreset(raw) {
  const data = raw && typeof raw === 'object' && raw.preset && typeof raw.preset === 'object' ? raw.preset : raw
  if (!data || typeof data !== 'object') {
    logVoucherDebug('applyVoucherPreset: skipped (no object)', { raw })
    return
  }
  const editionVal = data.edition
  const programNum = data.program != null && data.program !== '' ? Number(data.program) : NaN
  const program = Number.isFinite(programNum) ? programNum : undefined
  let presetBranch = 'none'

  if (editionVal === 'future') {
    edition.value = 'future'
    const g = data.group != null ? String(data.group) : ''
    if (g === '8') futureGroup.value = '8'
    if (g === '5' && FUTURE_GROUP_5_ENABLED) futureGroup.value = '5'
    const pupilsNum = Number(data.pupils)
    if (Number.isFinite(pupilsNum) && FUTURE_PUPIL_OPTIONS.includes(pupilsNum)) {
      futurePupils.value = pupilsNum
    }
    presetBranch = 'edition_future'
  } else if (program === 6 || program === 7) {
    edition.value = 'future'
    futureGroup.value = program === 7 ? '8' : (FUTURE_GROUP_5_ENABLED ? '5' : null)
    const pupilsNum = Number(data.pupils)
    if (Number.isFinite(pupilsNum) && FUTURE_PUPIL_OPTIONS.includes(pupilsNum)) {
      futurePupils.value = pupilsNum
    }
    presetBranch = 'program_6_or_7_future'
  } else if (program === 1 || program === 2 || program === 4 || program === 5) {
    edition.value = 'founders'
    foundersVariant.value = program === 1 || program === 4 ? 'explore' : 'challenge'
    foundersType.value = program === 1 || program === 2 ? 'team' : 'class'
    presetBranch = 'program_founders_standard'
  } else if (editionVal === 'founders') {
    edition.value = 'founders'
    if (data.variant === 'explore' || data.variant === 'challenge') foundersVariant.value = data.variant
    if (data.type === 'team' || data.type === 'class') foundersType.value = data.type
    presetBranch = 'edition_founders_fields'
  } else {
    presetBranch = 'no_matching_rule'
  }

  const setsNum = data.seasonSetCount != null ? Number(data.seasonSetCount) : (data.num_boards != null ? Number(data.num_boards) : NaN)
  if ([0, 1, 2].includes(setsNum)) {
    presetSeasonSetCount.value = setsNum
    wizardSeasonSetCount.value = setsNum
  }
  if (typeof data.registerEventTeams === 'boolean') {
    presetRegisterEventTeams.value = data.registerEventTeams
  } else if (data.registerEventTeams == null) {
    presetRegisterEventTeams.value = null
  }
  const etc = Number(data.eventTeamCount)
  if (Number.isFinite(etc) && etc >= 0) {
    presetEventTeamCount.value = etc
    if (etc > 0) futureEventTeamCount.value = etc
  } else if (data.eventTeamCount == null) {
    presetEventTeamCount.value = null
  }
  if (data.futureOnSiteEvent === 'yes' || data.futureOnSiteEvent === 'later') {
    futureOnSiteEvent.value = data.futureOnSiteEvent
  }
  const evId = Number(data.eventId)
  if (Number.isFinite(evId) && evId > 0) {
    futureEventId.value = evId
    const teamCount = Number.isFinite(Number(futureEventTeamCount.value)) && Number(futureEventTeamCount.value) > 0
      ? Number(futureEventTeamCount.value)
      : 1
    futureTeamEvents.value = Array.from({ length: teamCount }, () => ({ eventId: evId }))
  }
  const invId = Number(data.invoiceAddressId)
  if (Number.isFinite(invId) && invId > 0) {
    voucherPresetInvoiceId.value = invId
    voucherPresetInvoiceName.value = data.invoiceAddressName != null ? String(data.invoiceAddressName) : ''
    invoiceAddress.value = {
      ...invoiceAddress.value,
      useExisting: true,
      addressId: String(invId),
    }
  }

  const fd = data.formDefaults
  if (fd && typeof fd === 'object') {
    const keys = ['name', 'schoolOrClub', 'schoolType', 'organization', 'country', 'zip', 'city', 'state', 'location', 'playersTotal']
    for (const k of keys) {
      if (fd[k] == null || fd[k] === '') continue
      formData.value[k] = String(fd[k])
    }
  }

  logVoucherDebug('applyVoucherPreset: applied', {
    presetBranch,
    inputRaw: raw,
    parsed: { edition: data.edition, program: data.program, group: data.group, pupils: data.pupils, variant: data.variant, type: data.type },
    wizardNow: {
      edition: edition.value,
      futureGroup: futureGroup.value,
      futurePupils: futurePupils.value,
      foundersVariant: foundersVariant.value,
      foundersType: foundersType.value,
      presetSeasonSetCount: presetSeasonSetCount.value,
      presetRegisterEventTeams: presetRegisterEventTeams.value,
      presetEventTeamCount: presetEventTeamCount.value,
      futureOnSiteEvent: futureOnSiteEvent.value,
      futureEventId: futureEventId.value,
      voucherPresetInvoiceId: voucherPresetInvoiceId.value,
    },
  })
}

/** First wizard step that still needs input after optional voucher preset (1=edition …). */
function firstIncompleteEnrollmentStep() {
  if (!edition.value) return 1
  if (edition.value === 'future') {
    if (!futureGroup.value) return 2
    if (!hasRequiredInstitutionFields()) return 3
    if (futurePupils.value == null) return 4
    return 5
  }
  if (edition.value === 'founders') {
    if (!foundersVariant.value) return 2
    if (!foundersType.value) return 3
    if (!hasRequiredInstitutionFields()) return 4
    if (!hasRequiredParticipantFields()) return 5
    return 6
  }
  return 1
}

async function onVoucherBlur() {
  const code = voucher.value?.trim()
  if (!code) {
    voucherValid.value = null
    voucherMessage.value = ''
    voucherType.value = null
    voucherInvoiceId.value = null
    voucherInvoiceName.value = null
    voucherPresetInvoiceId.value = null
    voucherPresetInvoiceName.value = null
    presetSeasonSetCount.value = null
    wizardSeasonSetCount.value = 1
    presetRegisterEventTeams.value = null
    presetEventTeamCount.value = null
    return
  }
  voucherChecking.value = true
  voucherValid.value = null
  voucherMessage.value = ''
  voucherType.value = null
  voucherInvoiceId.value = null
  voucherInvoiceName.value = null
  voucherPresetInvoiceId.value = null
  voucherPresetInvoiceName.value = null
  presetSeasonSetCount.value = null
  wizardSeasonSetCount.value = 1
  presetRegisterEventTeams.value = null
  presetEventTeamCount.value = null
  try {
    const result = await validateVoucher(code)
    voucherValid.value = result.valid
    voucherMessage.value = result.message || (result.valid ? t('enroll.voucherValid') : t('enroll.voucherInvalid'))
    const body = result.data && typeof result.data === 'object' ? result.data : null
    const presetFromApi = body && typeof body.preset === 'object' ? body.preset : null
    const apiKeys = body ? Object.keys(body) : []

    if (result.valid) {
      voucherType.value = result.voucherType ?? null
      if (result.voucherType === '1') {
        voucherInvoiceId.value = result.invoiceAddressId ?? null
        voucherInvoiceName.value = result.invoiceAddressName ?? null
        if (!isDolibarrRowId(voucherInvoiceId.value)) {
          voucherValid.value = false
          voucherMessage.value = t('enroll.voucherInvalid')
        }
      }
      if (presetFromApi) applyVoucherPreset(presetFromApi)
      else logVoucherDebug('validate: no preset object on API body', { code, apiType: body?.type, apiKeys })
    }

    logVoucherDebug('validate: summary', {
      code,
      apiSaysValid: result.valid,
      wizardShowsValid: voucherValid.value,
      message: result.message,
      voucherType: voucherType.value,
      apiType: body?.type,
      apiKeys,
      presetRecognized: presetFromApi != null,
      presetFromApi: presetFromApi,
      wizardAfter: {
        edition: edition.value,
        futureGroup: futureGroup.value,
        futurePupils: futurePupils.value,
        foundersVariant: foundersVariant.value,
        foundersType: foundersType.value,
        presetSeasonSetCount: presetSeasonSetCount.value,
        voucherPresetInvoiceId: voucherPresetInvoiceId.value,
      },
    })

    if (result.valid && voucherValid.value === true && props.open && step.value === 0 && hasVoucherCode.value === 'yes') {
      nextTick(() => {
        if (canNext()) next()
      })
    }
  } catch (err) {
    voucherValid.value = false
    voucherMessage.value = t('enroll.voucherInvalid')
    console.warn('[EnrollWizard][voucher] validate: request failed', { code, err })
  } finally {
    voucherChecking.value = false
  }
}

async function submit() {
  if (edition.value === 'founders' && foundersType.value === 'team' && !formData.value.name?.trim()) {
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
  if (!consentDataProcessing.value || !consentTerms.value) {
    error.value = t('enroll.consentRequired')
    return
  }
  error.value = null
  submitting.value = true
  try {
    if (edition.value === 'future') {
      const payload = {
        create_order: 1,
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
        deliveryAddress: buildDeliveryPayload(),
        invoiceAddress: buildInvoicePayload(),
        consentDataProcessing: true,
        consentTerms: true,
        newsletterOptIn: !!consentNewsletter.value,
      }
      const sc = effectiveSeasonSetCount.value
      payload.seasonSetCount = sc
      payload.num_boards = sc
      if (futureOnSiteEvent.value === 'yes') {
        payload.registerEventTeams = true
        const n = Number(futureEventTeamCount.value)
        payload.eventTeamCount = Number.isFinite(n) && n >= 1 ? n : 1
        const teamEventsPayload = futureTeamEvents.value
          .map((entry, index) => {
            const evId = Number(entry?.eventId)
            if (!Number.isFinite(evId) || evId <= 0) return null
            return { index: index + 1, eventId: evId }
          })
          .filter(Boolean)
        if (teamEventsPayload.length) {
          payload.eventTeams = teamEventsPayload
        }
        const uniqueEventIds = Array.from(new Set(teamEventsPayload.map((entry) => entry.eventId)))
        if (uniqueEventIds.length === 1) {
          payload.eventId = uniqueEventIds[0]
        }
      } else if (presetRegisterEventTeams.value === false || futureOnSiteEvent.value === 'later') {
        payload.registerEventTeams = false
        payload.eventTeamCount = 0
      }
      const res = await enrollFuture(payload)
      const createdId = getCreatedId(res)
      successMessage.value = t('wizard.success')
      if (createdId) {
        setTimeout(() => {
          close()
          router.push({ name: 'group-detail', params: { id: createdId } })
        }, 1200)
      }
    } else {
      const isTeam = foundersType.value === 'team'
      const program = foundersVariant.value === 'explore' ? (isTeam ? 1 : 4) : (isTeam ? 2 : 5)
      const deliveryPayload = buildDeliveryPayload()
      const invoicePayload = buildInvoicePayload()
      const resolvedName = isTeam
        ? formData.value.name.trim()
        : (formData.value.organization?.trim() || formData.value.city?.trim() || 'Klasse')
      const payload = {
        create_order: 1,
        program,
        name: resolvedName,
        schoolOrClub: isTeam ? (formData.value.schoolOrClub?.trim() || undefined) : undefined,
        schoolType: formData.value.schoolType || undefined,
        organization: formData.value.organization?.trim() || undefined,
        country: formData.value.country?.trim() || undefined,
        zip: formData.value.zip?.trim() || undefined,
        location: (formData.value.city || '').trim() || undefined,
        state: (formData.value.state || '').trim() || undefined,
        voucher: voucher.value?.trim() || undefined,
        deliveryAddress: deliveryPayload ?? undefined,
        invoiceAddress: invoicePayload ?? undefined,
        consentDataProcessing: true,
        consentTerms: true,
        newsletterOptIn: !!consentNewsletter.value,
      }
      const sc = effectiveSeasonSetCount.value
      payload.seasonSetCount = sc
      payload.num_boards = sc
      if (!isTeam) {
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
      // Fallback close when backend does not return created id.
      setTimeout(() => { close() }, 1500)
    }
  } catch (e) {
    error.value = formatSubmitError(e)
  } finally {
    submitting.value = false
  }
}

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    openWizard()
    loadAddresses()
  }
  if (typeof document !== 'undefined') {
    if (isOpen) {
      previousBodyOverflow.value = document.body.style.overflow || ''
      previousHtmlOverflow.value = document.documentElement.style.overflow || ''
      document.body.style.overflow = 'hidden'
      document.documentElement.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = previousBodyOverflow.value
      document.documentElement.style.overflow = previousHtmlOverflow.value
    }
  }
})

onBeforeUnmount(() => {
  if (typeof document !== 'undefined') {
    document.body.style.overflow = previousBodyOverflow.value
    document.documentElement.style.overflow = previousHtmlOverflow.value
  }
})

watch(futureOnSiteEvent, (val) => {
  if (!props.open || edition.value !== 'future') return
  if (step.value !== 6) return
  if (val === 'yes') {
    if (!Number.isFinite(Number(futureEventTeamCount.value)) || Number(futureEventTeamCount.value) < 1) {
      futureEventTeamCount.value = 1
    }
    syncFutureTeamEventsArray()
    return
  }
  if (val === 'later') {
    futureEventId.value = null
    futureTeamEvents.value = []
    futureTeamAutoUpgrade.value = null
    next()
  }
})

watch([futureEventTeamCount, maxFutureEventTeamsByPupils], () => {
  syncFutureTeamEventsArray()
  updateDerivedFutureEventId()
})

watch(futurePupils, () => {
  const maxTeams = maxFutureEventTeamsByPupils.value
  if (maxTeams > 0 && futureEventTeamCount.value > maxTeams) {
    futureEventTeamCount.value = maxTeams
  }
  syncFutureTeamEventsArray()
  updateDerivedFutureEventId()
})

watch(founderTeamEventId, (val) => {
  if (!props.open || !foundersTeamHasParticipantsStep.value) return
  if (step.value !== 6) return
  if (val) nextTick(() => next())
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
          <h2 id="wizard-title"><I18nText k="wizard.ctaTitle" /></h2>
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
          <p v-else class="wizard-hero-text"><I18nText k="dashboard.intro" /></p>
          <!-- Progress only after voucher step: totalSteps/edition are unknown until then. -->
          <template v-if="step > 1">
            <div class="wizard-hero-progress">
              <div class="wizard-progress-bar" role="progressbar" :aria-valuenow="progress" aria-valuemin="0" aria-valuemax="100">
                <span :style="{ width: `${progress}%` }"></span>
              </div>
              <p class="wizard-step-label">{{ stepTitle }} ({{ step - 1 }}/{{ totalSteps - 2}})</p>
            </div>
            <div class="wizard-hero-stepper">
              <p class="wizard-hero-stepper-title"><I18nText k="wizard.progressTitle" /></p>
              <ol class="wizard-hero-stepper-list">
                <li
                  v-for="item in wizardProgressSteps"
                  :key="item.key"
                  class="wizard-hero-stepper-item"
                  :class="{ done: item.done, active: item.active }"
                >
                  <span class="wizard-hero-stepper-index">{{ item.index }}</span>
                  <span>{{ item.label }}</span>
                </li>
              </ol>
            </div>
          </template>
        </div>
      </div>

      <div class="wizard-panel">
        <div class="wizard-header">
          <button type="button" class="wizard-close" aria-label="Close" @click="close">
            <i class="bi bi-x-lg"></i>
          </button>
        </div>

        <div class="wizard-panel-main">
          <div class="wizard-scroll">
            <div class="wizard-body" :class="{ 'wizard-body--center-options': centeredOptionStep }">
          <!-- Step 0: Voucher-Code / Direkteinstieg -->
          <div
            v-show="step === 0"
            class="wizard-step wizard-step-voucher wizard-step-animate"
            :class="{ 'wizard-step-voucher--choice': hasVoucherCode === null }"
          >
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
                    @input="voucherValid = null; voucherMessage = ''; voucherType = null; voucherInvoiceId = null; voucherInvoiceName = null; voucherPresetInvoiceId = null; voucherPresetInvoiceName = null; presetSeasonSetCount = null; presetRegisterEventTeams = null; presetEventTeamCount = null"
                    @blur="onVoucherBlur"
                  />
                  <p v-if="voucherChecking" class="field-hint checking"><i class="bi bi-arrow-repeat spin"></i> <I18nText k="enroll.voucherChecking" /></p>
                  <p v-else-if="voucherValid === true" class="field-hint valid"><i class="bi bi-check-circle-fill"></i> {{ voucherMessage }}</p>
                  <p v-else-if="voucherValid === false" class="field-hint invalid"><i class="bi bi-exclamation-circle-fill"></i> {{ voucherMessage }}</p>
                </div>
                <button type="button" class="btn btn-ghost wizard-back-link" @click="hasVoucherCode = null; voucher = ''; voucherValid = null; voucherMessage = ''; voucherType = null; voucherInvoiceId = null; voucherInvoiceName = null; voucherPresetInvoiceId = null; voucherPresetInvoiceName = null; presetSeasonSetCount = null; presetRegisterEventTeams = null; presetEventTeamCount = null">
                  <i class="bi bi-arrow-left"></i> <I18nText k="wizard.voucherCodeBack" />
                </button>
              </div>
            </div>
          </div>

          <!-- Step 1: Edition -->
          <div v-show="step === 1" class="wizard-step wizard-step-animate">
            <div class="wizard-options wizard-options-two">
              <button type="button" class="wizard-option wizard-option-card" :class="{ active: edition === 'future' }" @click="selectEdition('future')">
                <div class="wizard-option-main"><I18nText k="dashboard.editionFuture" /></div>
                <div class="wizard-option-desc"><I18nText k="wizard.editionFutureDesc" /></div>
                <div class="wizard-option-logos wizard-option-logos-single">
                  <img v-for="logo in futureLogos" :key="logo.src" :src="logo.src" :alt="logo.alt" loading="lazy" />
                </div>
              </button>
              <button type="button" class="wizard-option wizard-option-card" :class="{ active: edition === 'founders' }" @click="selectEdition('founders')">
                <div class="wizard-option-main"><I18nText k="dashboard.editionFounders" /></div>
                <div class="wizard-option-desc"><I18nText k="wizard.editionFoundersDesc" /></div>
                <div class="wizard-option-logos">
                  <img v-for="logo in foundersLogos" :key="logo.src" :src="logo.src" :alt="logo.alt" loading="lazy" />
                </div>
              </button>
            </div>
          </div>

          <!-- Step 2: Future = group 5+/8+ (5+ currently disabled), Founders = Explore/Challenge -->
          <div v-show="step === 2" class="wizard-step wizard-step-animate">
            <template v-if="edition === 'future'">
              <div class="wizard-options wizard-options-two">
                <button
                  type="button"
                  class="wizard-option wizard-option-card"
                  :class="{ active: futureGroup === '5', 'is-disabled': !FUTURE_GROUP_5_ENABLED }"
                  :disabled="!FUTURE_GROUP_5_ENABLED"
                  @click="selectFutureGroup('5')"
                >
                  <div class="wizard-option-main"><I18nText k="dashboard.optionFutureGroup5" /></div>
                  <div class="wizard-option-desc"><I18nText k="wizard.futureGroup5Desc" /></div>
                </button>
                <button type="button" class="wizard-option wizard-option-card" :class="{ active: futureGroup === '8' }" @click="selectFutureGroup('8')">
                  <div class="wizard-option-main"><I18nText k="dashboard.optionFutureGroup8" /></div>
                  <div class="wizard-option-desc"><I18nText k="wizard.futureGroup8Desc" /></div>
                </button>
              </div>
            </template>
            <template v-else>
              <div class="wizard-options wizard-options-two">
                <button type="button" class="wizard-option wizard-option-card" :class="{ active: foundersVariant === 'explore' }" @click="selectFoundersVariant('explore')">
                  <div class="wizard-option-main"><I18nText k="wizard.optionExplore" /></div>
                  <div class="wizard-option-desc"><I18nText k="wizard.optionExploreDesc" /></div>
                </button>
                <button type="button" class="wizard-option wizard-option-card" :class="{ active: foundersVariant === 'challenge' }" @click="selectFoundersVariant('challenge')">
                  <div class="wizard-option-main"><I18nText k="wizard.optionChallenge" /></div>
                  <div class="wizard-option-desc"><I18nText k="wizard.optionChallengeDesc" /></div>
                </button>
              </div>
            </template>
          </div>

          <!-- Step 3: Founders only — Team or class (Future uses this step for institution) -->
          <div v-show="step === 3 && edition === 'founders'" class="wizard-step wizard-step-animate">
            <div class="wizard-options wizard-options-two">
              <button type="button" class="wizard-option wizard-option-card" :class="{ active: foundersType === 'team' }" @click="selectFoundersType('team')">
                <div class="wizard-option-main"><I18nText k="dashboard.team" /></div>
                <div class="wizard-option-desc"><I18nText k="wizard.teamDesc" /></div>
              </button>
              <button type="button" class="wizard-option wizard-option-card" :class="{ active: foundersType === 'class' }" @click="selectFoundersType('class')">
                <div class="wizard-option-main"><I18nText k="dashboard.class" /></div>
                <div class="wizard-option-desc"><I18nText k="wizard.classDesc" /></div>
              </button>
            </div>
          </div>

          <!-- Step 3 (Future) / Step 4 (Founders): Institution -->
          <div v-show="(step === 3 && edition === 'future') || (step === 4 && edition === 'founders')" class="wizard-step wizard-step-form wizard-step-animate">
            <p class="wizard-form-section-title"><I18nText k="wizard.stepInstitution" /></p>
            <p class="wizard-hint wizard-hint-compact"><I18nText k="wizard.requiredLegend" /></p>
            <template v-if="edition === 'future' || foundersType === 'class' || foundersType === 'team'">
              <div class="field field-select" :class="{ invalid: step4ValidationAttempted && isInstitutionFieldMissing('schoolType') }">
                <label><I18nText k="enroll.schoolType" /> <span class="required">*</span></label>
                <CustomSelect
                  v-model="formData.schoolType"
                  :options="schoolTypeWizardOptions"
                  :placeholder="t('schoolTypes.none')"
                />
                <p v-if="step4ValidationAttempted && isInstitutionFieldMissing('schoolType')" class="field-hint invalid"><I18nText k="common.requiredField" /></p>
              </div>
              <div
                class="field"
                :class="{
                  filled: isFilled(formData.organization) || isPrivateInstitution,
                  invalid: step4ValidationAttempted && isInstitutionFieldMissing('organization'),
                }"
              >
                <input v-model="formData.organization" type="text" placeholder=" " :disabled="isPrivateInstitution" />
                <label><I18nText k="enroll.schoolName" /> <span class="required">*</span></label>
                <p v-if="step4ValidationAttempted && isInstitutionFieldMissing('organization')" class="field-hint invalid"><I18nText k="common.requiredField" /></p>
              </div>
              <div v-if="foundersType === 'team'" class="field" :class="{ filled: isFilled(formData.schoolOrClub) }">
                <input v-model="formData.schoolOrClub" type="text" placeholder=" " />
                <label><I18nText k="enrollTeam.schoolClub" /></label>
              </div>
              <div class="field field-select" :class="{ invalid: step4ValidationAttempted && isInstitutionFieldMissing('country') }">
                <label><I18nText k="enroll.schoolCountry" /> <span class="required">*</span></label>
                <CustomSelect
                  v-model="formData.country"
                  :options="countryWizardSelectOptions"
                  :placeholder="t('enroll.selectCountry')"
                />
                <p v-if="step4ValidationAttempted && isInstitutionFieldMissing('country')" class="field-hint invalid"><I18nText k="common.requiredField" /></p>
              </div>
              <div class="field" :class="{ filled: isFilled(formData.zip), invalid: step4ValidationAttempted && isInstitutionFieldMissing('zip') }">
                <input v-model="formData.zip" type="text" placeholder=" " />
                <label><I18nText k="enroll.schoolZip" /> <span class="required">*</span></label>
                <p v-if="step4ValidationAttempted && isInstitutionFieldMissing('zip')" class="field-hint invalid"><I18nText k="common.requiredField" /></p>
              </div>
              <div v-if="formData.city || formData.state" class="wizard-place-display-wrap">
                <span class="wizard-place-display">{{ [formData.city, formData.state].filter(Boolean).join(', ') }}</span>
              </div>
            </template>
          </div>

          <!-- Step 4 (Future) / Step 5 (Founders): Pupils / class count / team + members -->
          <div v-show="(step === 4 && edition === 'future') || (step === 5 && edition === 'founders')" class="wizard-step wizard-step-animate" :class="{ 'wizard-step-pupils': edition === 'future', 'wizard-step-form': edition !== 'future' }">
            <template v-if="edition === 'future'">
              <p class="wizard-question"><I18nText k="enrollFuture.howManyPupils" /></p>
              <p class="wizard-hint"><I18nText k="enrollFuture.pupilsFlexibleHint" /></p>
              <div class="wizard-options wizard-options-three wizard-options-vertical">
                <button
                  v-for="num in FUTURE_PUPIL_OPTIONS"
                  :key="num"
                  type="button"
                  class="wizard-option wizard-option-card"
                  :class="{ active: futurePupils === num }"
                  @click="selectFuturePupils(num)"
                >
                  <div class="wizard-option-main">
                    {{ num }} <I18nText k="enrollFuture.pupils" />
                  </div>
                  <div class="wizard-option-desc">
                    {{ formatFutureGroupPriceEur(num) }}
                  </div>
                </button>
              </div>
            </template>
            <template v-else-if="foundersType === 'class'">
              <p class="wizard-form-section-title"><I18nText k="wizard.stepClassParticipants" /></p>
              <div class="field" :class="{ filled: isFilled(formData.playersTotal) }">
                <input v-model="formData.playersTotal" type="number" min="0" step="1" value="8"/>
                <label><I18nText k="enrollClass.playersTotal" /></label>
              </div>
            </template>
            <template v-else-if="foundersTeamHasParticipantsStep">
              <div class="field" :class="{ filled: isFilled(formData.name), invalid: step4ValidationAttempted && isStep4RequiredFieldMissing('name') }">
                <input v-model="formData.name" type="text" placeholder=" " />
                <label>
                  <I18nText k="enrollTeam.teamName" />
                  <span class="required">*</span>
                </label>
                <p v-if="step4ValidationAttempted && isStep4RequiredFieldMissing('name')" class="field-hint invalid"><I18nText k="common.requiredField" /></p>
              </div>
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
                  <CustomSelect
                    v-model="p.gender"
                    class="wizard-participant-gender"
                    size="sm"
                    :options="founderGenderOptions"
                    :placeholder="t('detail.gender')"
                  />
                  <button type="button" class="wizard-participant-remove" :aria-label="t('detail.remove')" @click="removeFounderParticipant(idx)">
                    <i class="bi bi-trash"></i>
                  </button>
                </div>
                <button type="button" class="wizard-btn-add-participant" @click="addFounderParticipant">
                  <i class="bi bi-plus-lg"></i> <I18nText k="detail.addPlayer" />
                </button>
              </div>
            </template>
          </div>

          <!-- Season sets (Future step 5 / Founders class step 6 / Founder team step 7) → numberOfBoards / Versandregel -->
          <div
            v-show="(step === 5 && edition === 'future') || (step === 6 && edition === 'founders' && foundersType === 'class') || (step === 7 && foundersTeamHasParticipantsStep)"
            class="wizard-step wizard-step-animate wizard-step-season-sets"
          >
            <div class="wizard-season-sets-intro">
              <h4 class="wizard-season-sets-title"><I18nText k="enrollFuture.stepSeasonSets" /></h4>
              <p class="wizard-season-sets-lead"><I18nText k="enrollFuture.stepSeasonSetsLead" /></p>
            </div>
            <p v-if="presetSeasonSetCount != null && [0, 1, 2].includes(presetSeasonSetCount)" class="field-hint valid voucher-forced-msg">
              <i class="bi bi-info-circle-fill" /> <I18nText k="wizard.seasonSetsPresetLocked" /> ({{ effectiveSeasonSetCount }})
            </p>
            <div v-else class="wizard-options wizard-options-three wizard-options-vertical">
              <button
                type="button"
                class="wizard-option wizard-option-card"
                :class="{ active: wizardSeasonSetCount === 0 }"
                @click="selectWizardSeasonSetCount(0)"
              >
                <div class="wizard-option-main"><I18nText k="enrollFuture.seasonNone" /></div>
                <div class="wizard-option-desc">{{ formatWizardEur(0) }}</div>
              </button>
              <button
                type="button"
                class="wizard-option wizard-option-card"
                :class="{ active: wizardSeasonSetCount === 1 }"
                @click="selectWizardSeasonSetCount(1)"
              >
                <div class="wizard-option-main"><I18nText k="enrollFuture.seasonOne" /></div>
                <div class="wizard-option-desc">{{ formatWizardEur(FUTURE_SEASON_SET_UNIT_EUR) }}</div>
              </button>
              <button
                type="button"
                class="wizard-option wizard-option-card"
                :class="{ active: wizardSeasonSetCount === 2 }"
                @click="selectWizardSeasonSetCount(2)"
              >
                <div class="wizard-option-main"><I18nText k="enrollFuture.seasonTwo" /></div>
                <div class="wizard-option-desc">{{ formatWizardEur(FUTURE_SEASON_SET_UNIT_EUR * 2) }}</div>
              </button>
            </div>
          </div>

          <!-- Step 6: Event (Founder team only; Future uses step 6 for on-site event) -->
          <div v-show="step === 6 && foundersTeamHasParticipantsStep" class="wizard-step wizard-step-form wizard-step-animate">
            <p class="wizard-hint"><I18nText k="wizard.founderTeamEventHint" /></p>
            <div class="wizard-event-select-wrap">
              <EventSelectDropdown
                :title="t('wizard.eventSelectSimple')"
                :events="founderEventsNearest"
                :loading="founderEventsNearestLoading"
                :model-value="founderTeamEventId"
                :placeholder="t('wizard.founderTeamEventPlaceholder')"
                :event-label-fn="futureEventOptionLabel"
                @update:model-value="founderTeamEventId = $event"
              />
            </div>
          </div>

          <!-- Step 6: On-site event (Future only) -->
          <div v-show="step === 6 && edition === 'future'" class="wizard-step wizard-step-animate">
            <div class="wizard-step-voucher-inner wizard-step-onsite-event">
              <p class="wizard-question"><I18nText k="wizard.onSiteEventQuestion" /></p>
              <p class="wizard-hint"><I18nText k="wizard.onSiteEventHint" /></p>
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
                  <p class="wizard-hint wizard-event-team-hint">
                    <I18nText
                      k="wizard.onSiteEventTeamsSummary"
                      :values="{ pupils: futurePupils, maxTeams: maxFutureEventTeamsByPupils }"
                    />
                  </p>
                  <p class="wizard-event-label wizard-event-team-count-label">
                    <I18nText k="wizard.onSiteEventTeamCountLabel" />
                  </p>
                  <div class="wizard-event-team-count-row" role="group" :aria-label="t('wizard.onSiteEventTeamCountLabel')">
                    <button
                      v-for="count in futureTeamOptionCounts"
                      :key="'future-event-team-' + count"
                      type="button"
                      class="wizard-event-team-count-pill"
                      :class="{
                        active: futureEventTeamCount === count,
                        'is-disabled': count > maxFutureEventTeamsByPupils,
                      }"
                      :aria-disabled="count > maxFutureEventTeamsByPupils ? 'true' : 'false'"
                      @click="selectFutureEventTeamCount(count)"
                    >
                      <span class="wizard-event-team-count-pill-main">
                        {{ count }} {{ count === 1 ? t('wizard.teamSingular') : t('wizard.teamsPlural') }}
                      </span>
                    </button>
                  </div>
                  <p v-if="futureEventTeamCount > 1" class="wizard-event-label wizard-event-per-team-label">
                    <I18nText k="wizard.onSiteEventPerTeam" />
                  </p>
                  <div v-if="futureEventTeamCount > 0" class="wizard-event-team-rows">
                    <div
                      v-for="(entry, idx) in futureTeamEvents"
                      :key="'future-event-select-' + idx"
                      class="wizard-event-team-combined-card"
                    >
                      <div
                        class="wizard-event-team-combined-grid"
                        :class="{ 'wizard-event-team-combined-grid--solo': futureEventTeamCount === 1 }"
                      >
                        <div v-if="futureEventTeamCount > 1" class="wizard-event-team-combined-meta">
                          <span class="wizard-event-team-name">{{ t('wizard.teamSingular') }} {{ idx + 1 }}</span>
                        </div>
                        <div class="wizard-event-team-combined-dropdown">
                          <EventSelectDropdown
                            :title="futureEventTeamCount > 1 ? t('wizard.onSiteEventDropdownTitleTeam', { team: idx + 1 }) : ''"
                            :events="futureEventsNearest"
                            :loading="futureEventsNearestLoading"
                            :model-value="entry.eventId"
                            :placeholder="t('wizard.onSiteEventPlaceholder')"
                            :event-label-fn="futureEventOptionLabel"
                            @update:model-value="selectFutureTeamEvent(idx, $event)"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div v-if="futureTeamAutoUpgrade" class="wizard-event-team-upgrade">
                    <p>
                      <I18nText
                        k="wizard.eventTeamAutoUpgraded"
                        :args="{ teams: futureTeamAutoUpgrade.teams, pupils: futureTeamAutoUpgrade.pupils }"
                      />
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  class="wizard-option wizard-option-card"
                  :class="{ active: futureOnSiteEvent === 'later' }"
                  @click="futureOnSiteEvent = 'later'; futureEventId = null"
                >
                  <div class="wizard-option-main"><I18nText k="wizard.onSiteEventSkip" /></div>
                  <div class="wizard-option-desc"><I18nText k="wizard.onSiteEventSkipDesc" /></div>
                </button>
              </div>
            </div>
          </div>

          <!-- Step 7: Addresses only (Future) -->
          <div v-show="step === 7 && edition === 'future'" class="wizard-step wizard-step-form wizard-step-animate">
            <p v-if="!areAddressesValid()" class="wizard-hint wizard-hint-required"><i class="bi bi-info-circle"></i> <I18nText k="wizard.addressesRequiredHint" /></p>
            <div class="wizard-address-section">
              <h4 class="wizard-address-title"><I18nText k="enroll.invoiceAddress" /></h4>
              <template v-if="voucherType === '1' || voucherPresetInvoiceId != null">
                <div class="field voucher-invoice-forced">
                  <p class="field-hint valid voucher-forced-msg"><i class="bi bi-info-circle-fill"></i> <I18nText k="enroll.voucherInvoiceForced" /> <span v-if="voucherInvoiceName || voucherPresetInvoiceName">({{ voucherInvoiceName || voucherPresetInvoiceName }})</span></p>
                </div>
              </template>
              <AddressSelector
                v-else
                v-model="invoiceAddress"
                :addresses="invoiceAddresses"
                :label="t('enroll.invoiceAddress')"
                :show-label="false"
                id-prefix="wizard-invoice"
              />
            </div>
            <div class="wizard-address-section">
              <label class="wizard-delivery-toggle">
                <input v-model="deliveryAddressDifferent" type="checkbox">
                <span><I18nText k="wizard.deliveryDifferentToggle" /></span>
              </label>
              <AddressSelector v-if="deliveryAddressDifferent" v-model="deliveryAddress" :addresses="deliveryAddresses" :label="t('enroll.deliveryAddress')" id-prefix="wizard-delivery" />
            </div>
          </div>

          <!-- Step 8: Order overview (Future) -->
          <div v-show="step === 8 && edition === 'future'" class="wizard-step wizard-step-form wizard-step-animate">
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
              <div class="wizard-cart-row">
                <span><I18nText k="wizard.orderSeasonSets" /></span>
                <strong>
                  <I18nText v-if="effectiveSeasonSetCount === 0" k="enrollFuture.seasonNone" tag="span" />
                  <I18nText v-else-if="effectiveSeasonSetCount === 1" k="enrollFuture.seasonOne" tag="span" />
                  <I18nText v-else k="enrollFuture.seasonTwo" tag="span" />
                </strong>
              </div>
              <div v-if="futureOnSiteEvent === 'yes' && futureTeamEventSummaries.length" class="wizard-cart-row">
                <span><I18nText k="wizard.orderOnSiteEvent" /></span>
                <strong class="wizard-cart-multi-lines">{{ futureTeamEventSummaries.join(' · ') }}</strong>
              </div>
              <div class="wizard-cart-divider" role="presentation" />
              <h4 class="wizard-cart-subtitle"><I18nText k="wizard.orderPricesHeading" /></h4>
              <div class="wizard-cart-row wizard-cart-row--price">
                <span>
                  <I18nText k="wizard.orderPriceGroup" />
                  <span v-if="futurePupils != null" class="wizard-cart-muted">
                    ({{ futurePupils }} <I18nText k="enrollFuture.pupils" />)
                  </span>
                </span>
                <strong>{{ formatWizardEur(futureOrderGroupPriceEur) }}</strong>
              </div>
              <div class="wizard-cart-row wizard-cart-row--price">
                <span>
                  <I18nText k="wizard.orderPriceSeasonSets" />
                  <span class="wizard-cart-muted"> ({{ effectiveSeasonSetCount }}×)</span>
                </span>
                <strong>{{ formatWizardEur(futureOrderSeasonSetsPriceEur) }}</strong>
              </div>
              <div v-if="futureOnSiteEvent === 'yes'" class="wizard-cart-row wizard-cart-row--price">
                <span>
                  <I18nText k="wizard.orderPriceEventTeams" />
                  <span class="wizard-cart-muted">
                    ({{ futureOrderEventTeamsCount }}× {{ formatWizardEur(FUTURE_TEAM_EVENT_UNIT_EUR) }})
                  </span>
                </span>
                <strong>{{ formatWizardEur(futureOrderEventTeamsPriceEur) }}</strong>
              </div>
              <div v-else class="wizard-cart-row wizard-cart-row--price">
                <span><I18nText k="wizard.orderPriceEventLater" /></span>
                <strong>{{ formatWizardEur(0) }}</strong>
              </div>
              <div class="wizard-cart-row wizard-cart-row--price wizard-cart-row--total">
                <span><I18nText k="wizard.orderPriceTotal" /></span>
                <strong>{{ formatWizardEur(futureOrderTotalEur) }}</strong>
              </div>
            </div>
            <EnrollConsentCheckboxes
              id-prefix="wizard-consent-future"
              v-model:consent-data-processing="consentDataProcessing"
              v-model:consent-terms="consentTerms"
              v-model:consent-newsletter="consentNewsletter"
            />
            <p class="wizard-hint"><I18nText k="wizard.orderReviewHint" /></p>
            <div class="wizard-next-steps">
              <h4><I18nText k="wizard.nextStepsTitle" /></h4>
              <ul>
                <li><I18nText k="wizard.nextStepsItemCreated" /></li>
                <li><I18nText k="wizard.nextStepsItemManage" /></li>
                <li><I18nText k="wizard.nextStepsItemStatus" /></li>
              </ul>
            </div>
          </div>

          <!-- Step 7: Addresses (Founders class) / Step 8: Addresses (Founder team) -->
          <div
            v-show="(step === 7 && edition === 'founders' && foundersType === 'class') || (step === 8 && foundersTeamHasParticipantsStep)"
            class="wizard-step wizard-step-form wizard-step-animate"
          >
            <p v-if="!areAddressesValid()" class="wizard-hint wizard-hint-required"><i class="bi bi-info-circle"></i> <I18nText k="wizard.addressesRequiredHint" /></p>
            <div class="wizard-address-section">
              <h4 class="wizard-address-title"><I18nText k="enroll.invoiceAddress" /></h4>
              <template v-if="voucherType === '1' || voucherPresetInvoiceId != null">
                <div class="field voucher-invoice-forced">
                  <p class="field-hint valid voucher-forced-msg"><i class="bi bi-info-circle-fill"></i> <I18nText k="enroll.voucherInvoiceForced" /> <span v-if="voucherInvoiceName || voucherPresetInvoiceName">({{ voucherInvoiceName || voucherPresetInvoiceName }})</span></p>
                </div>
              </template>
              <AddressSelector
                v-else
                v-model="invoiceAddress"
                :addresses="invoiceAddresses"
                :label="t('enroll.invoiceAddress')"
                :show-label="false"
                id-prefix="wizard-invoice"
              />
            </div>
            <div class="wizard-address-section">
              <label class="wizard-delivery-toggle">
                <input v-model="deliveryAddressDifferent" type="checkbox">
                <span><I18nText k="wizard.deliveryDifferentToggle" /></span>
              </label>
              <AddressSelector v-if="deliveryAddressDifferent" v-model="deliveryAddress" :addresses="deliveryAddresses" :label="t('enroll.deliveryAddress')" id-prefix="wizard-delivery" />
            </div>
          </div>

          <!-- Step 8: Order (Founders class) / Step 9: Order (Founder team) -->
          <div
            v-show="(step === 8 && edition === 'founders' && foundersType === 'class') || (step === 9 && foundersTeamHasParticipantsStep)"
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
                <span><I18nText k="wizard.orderSeasonSets" /></span>
                <strong>
                  <I18nText v-if="effectiveSeasonSetCount === 0" k="enrollFuture.seasonNone" tag="span" />
                  <I18nText v-else-if="effectiveSeasonSetCount === 1" k="enrollFuture.seasonOne" tag="span" />
                  <I18nText v-else k="enrollFuture.seasonTwo" tag="span" />
                </strong>
              </div>
              <div v-if="foundersType === 'team'" class="wizard-cart-row">
                <span><I18nText k="enrollTeam.teamName" /></span>
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
            <EnrollConsentCheckboxes
              id-prefix="wizard-consent-founders"
              v-model:consent-data-processing="consentDataProcessing"
              v-model:consent-terms="consentTerms"
              v-model:consent-newsletter="consentNewsletter"
            />
            <p class="wizard-hint"><I18nText k="wizard.orderReviewHint" /></p>
            <div class="wizard-next-steps">
              <h4><I18nText k="wizard.nextStepsTitle" /></h4>
              <ul>
                <li><I18nText k="wizard.nextStepsItemCreated" /></li>
                <li><I18nText k="wizard.nextStepsItemManage" /></li>
                <li><I18nText k="wizard.nextStepsItemStatus" /></li>
              </ul>
            </div>
          </div>

            </div>

            <div v-if="error" class="wizard-message error"><i class="bi bi-exclamation-circle"></i> {{ error }}</div>
            <div v-if="success" class="wizard-message success">
              <i class="bi bi-check-circle-fill"></i>
              <template v-if="successMessage">{{ successMessage }}</template>
              <I18nText v-else k="wizard.success" />
            </div>
          </div>

          <div class="wizard-footer">
            <button type="button" class="btn btn-ghost" :disabled="step === 0" @click="prev">
              <i class="bi bi-arrow-left"></i> <I18nText k="wizard.back" />
            </button>
            <button v-if="step < lastStep" type="button" class="btn btn-primary" :disabled="step !== institutionStepIndex && step !== participantsStepIndex && !canNext()" @click="next">
              <I18nText k="wizard.next" /> <i class="bi bi-arrow-right"></i>
            </button>
            <button v-else type="button" class="btn btn-primary" :disabled="submitting || !hasRequiredSchoolFields() || !areAddressesValid() || !consentDataProcessing || !consentTerms" @click="submit">
              <i v-if="submitting" class="bi bi-arrow-repeat spin"></i>
              <i v-else class="bi bi-check-lg"></i>
              <I18nText v-if="submitting" k="wizard.submitting" />
              <I18nText v-else k="wizard.submit" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wizard-backdrop {
  position: fixed;
  inset: 0;
  background: radial-gradient(circle at top, rgba(37, 99, 235, 0.08), transparent 55%),
    radial-gradient(circle at 20% 20%, rgba(16, 185, 129, 0.06), transparent 50%),
    var(--liquid-modal-scrim-bg, rgba(6, 6, 8, 0.78));
  backdrop-filter: blur(var(--liquid-blur)) saturate(calc(var(--liquid-saturate) * 0.92));
  -webkit-backdrop-filter: blur(var(--liquid-blur)) saturate(calc(var(--liquid-saturate) * 0.92));
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  overflow: hidden;
}
.wizard-modal {
  width: 100%;
  height: 100%;
  min-height: 0;
  max-height: 100%;
  display: grid;
  grid-template-columns: minmax(18rem, 38%) 1fr;
  background: var(--wizard-shell-fill);
  box-shadow: var(--liquid-shadow);
  overflow: hidden;
  animation: wizardFadeIn 0.35s ease;
}
.wizard-header {
  flex-shrink: 0;
  padding: 1rem 2rem 0.5rem;
  border-bottom: 1px solid var(--liquid-border);
  position: relative;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 1rem;
  background: color-mix(in srgb, var(--wizard-shell-fill) 70%, transparent);
  backdrop-filter: blur(calc(var(--liquid-blur) * 0.45)) saturate(1.1);
  -webkit-backdrop-filter: blur(calc(var(--liquid-blur) * 0.45)) saturate(1.1);
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
  background: var(--liquid-tile-bg-inner);
  color: var(--color-text);
}
.wizard-close i {
  font-size: 1.35rem;
}
/* Scroll lives on .wizard-scroll; body is content only */
.wizard-body {
  flex: 1 0 auto;
  min-height: 100%;
  overflow: visible;
  padding: 1.5rem 2rem 1rem;
  display: flex;
  flex-direction: column;
}
.wizard-body--center-options {
  justify-content: center;
}
.wizard-panel-main {
  --wizard-footer-safe: 6.5rem;
  flex: 1 1 auto;
  min-height: 0;
  position: relative;
  display: flex;
  flex-direction: column;
}
.wizard-scroll {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow-x: hidden;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  padding-bottom: max(var(--wizard-footer-safe), calc(env(safe-area-inset-bottom, 0px) + 5.5rem));
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.wizard-scroll::-webkit-scrollbar {
  width: 0;
  height: 0;
  display: none;
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
/* Future pupils step uses vertical flow: heading, subheading, choices */
.wizard-step-pupils {
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
}
.wizard-step-pupils .wizard-question,
.wizard-step-pupils .wizard-hint {
  width: 100%;
  max-width: 36rem;
  margin-left: auto;
  margin-right: auto;
}
.wizard-step-pupils .wizard-options {
  width: 100%;
  max-width: 36rem;
  margin: 0.2rem auto 0;
}

.wizard-step-season-sets {
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
}
.wizard-season-sets-intro {
  width: 100%;
  max-width: 36rem;
  margin: 0 auto 1.25rem;
}
.wizard-season-sets-title {
  margin: 0 0 0.5rem;
  font-size: 1.15rem;
  font-weight: 600;
  color: var(--color-text);
}
.wizard-season-sets-lead {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.5;
  color: var(--color-text-muted);
}
.wizard-step-season-sets .wizard-options {
  width: 100%;
  max-width: 22rem;
  margin: 0 auto;
}
.wizard-step-season-sets .field-hint.valid {
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
.wizard-participant-input {
  padding: 0.5rem 0.6rem;
  border: 1px solid var(--liquid-border);
  border-radius: var(--radius);
  background: var(--liquid-tile-bg-inner);
  color: var(--color-text);
  font-size: 0.95rem;
  box-shadow: var(--liquid-shadow-inset);
}
.wizard-participant-gender {
  min-width: 0;
}
.wizard-participant-gender :deep(.custom-select-trigger) {
  min-height: 2.35rem;
  font-size: 0.9rem;
  padding: 0.4rem 2.1rem 0.4rem 0.5rem;
  background: var(--liquid-tile-bg-inner);
  border-color: var(--liquid-border);
  box-shadow: var(--liquid-shadow-inset);
}
.wizard-participant-input.wizard-participant-dob {
  min-width: 0;
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
  background: var(--liquid-tile-bg-inner);
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
.wizard-step-voucher.wizard-step-voucher--choice {
  justify-content: center;
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
  border: 1px solid var(--liquid-border);
  border-radius: var(--radius-lg);
  font-size: 1.05rem;
  box-sizing: border-box;
  background: var(--liquid-tile-bg-inner);
  box-shadow: var(--liquid-shadow-inset);
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
  background: var(--liquid-tile-bg-inner);
  border-radius: var(--radius-lg);
  border: 1px solid var(--liquid-border);
  box-shadow: var(--shadow-sm), var(--liquid-shadow-inset);
  backdrop-filter: blur(calc(var(--liquid-blur) * 0.38)) saturate(1.08);
  -webkit-backdrop-filter: blur(calc(var(--liquid-blur) * 0.38)) saturate(1.08);
}
.wizard-event-team-hint {
  margin-top: 0.9rem;
  margin-bottom: 0.65rem;
  line-height: 1.45;
  max-width: 40rem;
}
.wizard-event-team-count-label {
  margin-top: 0.35rem;
  margin-bottom: 0.45rem;
}
.wizard-event-team-count-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1rem;
}
.wizard-event-team-count-pill {
  flex: 1 1 6.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.15rem;
  min-height: 3.1rem;
  padding: 0.5rem 0.65rem;
  border: 1px solid var(--liquid-border);
  border-radius: var(--radius-lg);
  background: var(--liquid-tile-bg-inner);
  color: var(--color-text);
  font: inherit;
  cursor: pointer;
  box-shadow: var(--shadow-sm), var(--liquid-shadow-inset);
  backdrop-filter: blur(calc(var(--liquid-blur) * 0.32)) saturate(1.05);
  -webkit-backdrop-filter: blur(calc(var(--liquid-blur) * 0.32)) saturate(1.05);
  transition: border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
}
.wizard-event-team-count-pill:hover:not(.is-disabled) {
  border-color: color-mix(in srgb, var(--color-accent) 28%, var(--liquid-border));
  background: var(--liquid-tile-bg);
}
.wizard-event-team-count-pill.active {
  border-color: color-mix(in srgb, var(--color-accent) 42%, var(--liquid-border));
  background: var(--liquid-tile-bg-strong);
  box-shadow: var(--liquid-shadow), var(--liquid-shadow-inset);
}
.wizard-event-team-count-pill.is-disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.wizard-event-team-count-pill-main {
  font-weight: 600;
  font-size: 0.98rem;
}
.wizard-event-per-team-label {
  margin-bottom: 0.5rem;
}
.wizard-event-team-rows {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}
.wizard-event-team-combined-card {
  padding: 0.75rem 0.85rem;
  border-radius: var(--radius-lg);
  border: 1px solid var(--liquid-border);
  background: var(--liquid-tile-bg-inner);
  box-shadow: var(--shadow-sm), var(--liquid-shadow-inset);
  backdrop-filter: blur(calc(var(--liquid-blur) * 0.35)) saturate(1.06);
  -webkit-backdrop-filter: blur(calc(var(--liquid-blur) * 0.35)) saturate(1.06);
}
.wizard-event-team-combined-grid {
  display: grid;
  gap: 0.65rem;
  align-items: stretch;
}
@media (min-width: 36rem) {
  .wizard-event-team-combined-grid {
    grid-template-columns: minmax(6.5rem, auto) minmax(0, 1fr);
    align-items: center;
    gap: 0.85rem;
  }
}
.wizard-event-team-combined-grid--solo {
  grid-template-columns: minmax(0, 1fr);
}
@media (min-width: 36rem) {
  .wizard-event-team-combined-grid--solo {
    grid-template-columns: minmax(0, 1fr);
  }
}
.wizard-event-team-combined-meta {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.wizard-event-team-name {
  font-weight: 600;
  font-size: 1rem;
  text-transform: capitalize;
}
.wizard-event-team-pupils {
  font-size: 0.86rem;
  color: var(--color-text-muted, var(--color-text));
}
.wizard-event-team-combined-dropdown {
  min-width: 0;
}
.wizard-event-team-upgrade {
  margin-top: 0.85rem;
  padding: 0.8rem 0.9rem;
  border-radius: var(--radius-lg);
  border: 1px solid color-mix(in srgb, var(--color-accent) 35%, var(--liquid-border));
  background: color-mix(in srgb, var(--liquid-tile-bg) 88%, var(--color-accent-soft));
  backdrop-filter: blur(calc(var(--liquid-blur) * 0.3)) saturate(1.05);
  -webkit-backdrop-filter: blur(calc(var(--liquid-blur) * 0.3)) saturate(1.05);
}
.wizard-event-team-upgrade p {
  margin: 0 0 0.55rem;
  font-size: 0.92rem;
  color: var(--color-text);
}
.wizard-delivery-toggle {
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  margin: 0.35rem 0 0.8rem;
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--color-text);
  width: 100%;
  box-sizing: border-box;
  cursor: pointer;
}
.wizard-delivery-toggle input[type='checkbox'] {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
  margin-top: 0.2rem;
  cursor: pointer;
}
.wizard-delivery-toggle > span {
  flex: 1;
  min-width: 0;
  line-height: 1.35;
}
.wizard-address-section {
  margin-top: 0.45rem;
  margin-bottom: 1rem;
}
.wizard-address-title {
  margin: 0 0 0.55rem;
  font-size: 0.97rem;
  font-weight: 600;
  color: var(--color-text);
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
  border: 1px solid var(--liquid-border);
  border-radius: var(--radius-lg);
  background: var(--liquid-tile-bg-inner);
  color: var(--color-text);
  box-shadow: var(--liquid-shadow-inset);
  backdrop-filter: blur(calc(var(--liquid-blur) * 0.28)) saturate(1.04);
  -webkit-backdrop-filter: blur(calc(var(--liquid-blur) * 0.28)) saturate(1.04);
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
.wizard-hint-compact {
  margin-top: 0;
  margin-bottom: 1rem;
}
.wizard-form-section-title {
  margin: 0.25rem 0 0.4rem;
  font-size: 0.8rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-text-subtle);
  font-weight: 700;
}
.wizard-form-section-title-optional {
  margin-top: 0.9rem;
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
  background: var(--liquid-tile-bg);
  border: 1px solid var(--liquid-border);
  box-shadow: var(--shadow-sm), var(--liquid-shadow-inset);
  backdrop-filter: blur(calc(var(--liquid-blur) * 0.35)) saturate(1.06);
  -webkit-backdrop-filter: blur(calc(var(--liquid-blur) * 0.35)) saturate(1.06);
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
.wizard-options-vertical {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 22rem;
  margin: 0 auto;
  gap: 0.75rem;
}
.wizard-options-vertical .wizard-option {
  width: 100%;
  min-height: 4.6rem;
  padding: 0.95rem 1rem;
}
.wizard-option {
  padding: 2.25rem 2rem;
  font-size: 1.15rem;
  font-weight: 500;
  color: var(--color-text);
  background: var(--liquid-tile-bg);
  border: 1px solid var(--liquid-border);
  border-radius: var(--radius-xl);
  cursor: pointer;
  font-family: inherit;
  box-shadow: var(--shadow-sm), var(--liquid-shadow-inset);
  backdrop-filter: blur(calc(var(--liquid-blur) * 0.55)) saturate(calc(var(--liquid-saturate) * 0.96));
  -webkit-backdrop-filter: blur(calc(var(--liquid-blur) * 0.55)) saturate(calc(var(--liquid-saturate) * 0.96));
  transition:
    border-color 0.22s ease,
    background 0.22s ease,
    transform 0.22s ease,
    box-shadow 0.22s ease;
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
  border-color: color-mix(in srgb, var(--color-accent) 32%, var(--liquid-border));
  background: var(--liquid-tile-bg-strong);
  transform: translateY(-2px);
  box-shadow: var(--liquid-shadow), var(--liquid-shadow-inset);
}
.wizard-option.active {
  border-color: color-mix(in srgb, var(--color-accent) 48%, var(--liquid-border));
  background: var(--liquid-tile-bg-strong);
  color: var(--color-text);
  box-shadow: var(--liquid-shadow), 0 0 0 1px color-mix(in srgb, var(--color-accent) 22%, transparent), var(--liquid-shadow-inset);
}
.wizard-option.active .wizard-option-main {
  color: var(--color-text);
}
.wizard-option.active .wizard-option-desc {
  color: var(--color-text-muted);
}
.wizard-option:disabled,
.wizard-option.is-disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
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
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.07), var(--liquid-shadow-inset);
  background: var(--liquid-tile-bg-inner);
}
.wizard-step-form .field input:disabled {
  opacity: 0.72;
  cursor: not-allowed;
  color: var(--color-text-muted);
}
.wizard-step-form .field.invalid input,
.wizard-step-form .field.invalid textarea,
.wizard-step-form .field.invalid select {
  border-color: #dc2626;
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
/* Delivery checkbox row is a <label>; must not use floating-label positioning. */
.wizard-step-form label.wizard-delivery-toggle {
  position: static;
  left: auto;
  top: auto;
  transform: none;
  pointer-events: auto;
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
.wizard-step-form .field.field-select :deep(.custom-select) {
  width: 100%;
}
.wizard-step-form .field.field-select :deep(.custom-select-trigger) {
  min-height: var(--touch-lg);
  font-size: 1.05rem;
}
.wizard-step-form .field.field-select.invalid :deep(.custom-select-trigger) {
  border-color: #dc2626;
  box-shadow: 0 0 0 2px rgba(220, 38, 38, 0.12), var(--shadow-sm), var(--liquid-shadow-inset);
}
.wizard-cart {
  background: var(--liquid-tile-bg);
  border: 1px solid var(--liquid-border);
  border-radius: var(--radius-xl);
  padding: 1rem 1.25rem;
  margin-bottom: 1.5rem;
  box-shadow: var(--shadow-sm), var(--liquid-shadow-inset);
  backdrop-filter: blur(calc(var(--liquid-blur) * 0.4)) saturate(1.05);
  -webkit-backdrop-filter: blur(calc(var(--liquid-blur) * 0.4)) saturate(1.05);
}
.wizard-cart-title {
  margin: 0 0 0.75rem;
  font-size: 1rem;
  font-weight: 700;
  color: var(--color-text);
}
.wizard-cart-divider {
  height: 1px;
  margin: 0.75rem 0 0.65rem;
  background: var(--color-border);
  opacity: 0.85;
}
.wizard-cart-subtitle {
  margin: 0 0 0.45rem;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-subtle, var(--color-text-muted));
}
.wizard-cart-muted {
  font-weight: 500;
  color: var(--color-text-muted);
  font-size: 0.85em;
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
.wizard-cart-row--price {
  font-size: 0.9rem;
}
.wizard-cart-row--total {
  margin-top: 0.35rem;
  padding-top: 0.55rem;
  border-top: 1px solid var(--color-border);
  font-size: 1rem;
}
.wizard-cart-row--total span {
  color: var(--color-text);
  font-weight: 700;
}
.wizard-cart-row--total strong {
  font-weight: 700;
  font-size: 1.05rem;
}
.wizard-cart-multi-lines {
  line-height: 1.45;
}
.wizard-next-steps {
  margin-top: 0.75rem;
  padding: 0.8rem 1rem;
  border-radius: var(--radius-lg);
  background: var(--liquid-tile-bg-inner);
  border: 1px solid var(--liquid-border);
  box-shadow: var(--shadow-sm), var(--liquid-shadow-inset);
  backdrop-filter: blur(calc(var(--liquid-blur) * 0.32)) saturate(1.04);
  -webkit-backdrop-filter: blur(calc(var(--liquid-blur) * 0.32)) saturate(1.04);
}
.wizard-next-steps h4 {
  margin: 0 0 0.45rem;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-subtle);
}
.wizard-next-steps ul {
  margin: 0;
  padding-left: 1.1rem;
  display: grid;
  gap: 0.25rem;
  color: var(--color-text-muted);
  font-size: 0.9rem;
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
  margin: 0 2rem 1rem;
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
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 40;
  flex-shrink: 0;
  padding: 0.85rem 2rem max(1rem, env(safe-area-inset-bottom, 0px));
  padding-top: 1rem;
  border-top: 1px solid var(--liquid-border);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  background: color-mix(in srgb, var(--wizard-shell-fill) 82%, transparent);
  backdrop-filter: blur(calc(var(--liquid-blur) * 0.5)) saturate(1.12);
  -webkit-backdrop-filter: blur(calc(var(--liquid-blur) * 0.5)) saturate(1.12);
  box-shadow: 0 -12px 40px rgba(0, 0, 0, 0.06), var(--liquid-shadow-inset);
}
html[data-theme='dark'] .wizard-footer {
  box-shadow: 0 -14px 44px rgba(0, 0, 0, 0.35), var(--liquid-shadow-inset);
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
.wizard-hero-stepper {
  display: grid;
  gap: 0.45rem;
}
.wizard-hero-stepper-title {
  margin: 0;
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.85;
}
.wizard-hero-stepper-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.45rem;
}
.wizard-hero-stepper-item {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  font-size: 0.88rem;
  color: rgba(248, 250, 252, 0.82);
}
.wizard-hero-stepper-item.active {
  color: #fff;
  font-weight: 600;
}
.wizard-hero-stepper-item.done {
  color: rgba(187, 247, 208, 0.95);
}
.wizard-hero-stepper-index {
  width: 1.2rem;
  height: 1.2rem;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(248, 250, 252, 0.24);
  font-size: 0.72rem;
  font-weight: 700;
}
.wizard-hero-stepper-item.done .wizard-hero-stepper-index {
  background: rgba(34, 197, 94, 0.35);
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
  min-height: 0;
  height: 100%;
  overflow: hidden;
  background: var(--wizard-shell-fill);
  backdrop-filter: blur(calc(var(--liquid-popover-blur) * 0.42)) saturate(calc(var(--liquid-popover-saturate) * 0.88));
  -webkit-backdrop-filter: blur(calc(var(--liquid-popover-blur) * 0.42)) saturate(calc(var(--liquid-popover-saturate) * 0.88));
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
  border-radius: var(--radius-lg);
  background: rgba(255, 255, 255, 0.14);
  border: 1px solid var(--liquid-border-soft);
  backdrop-filter: blur(10px) saturate(1.15);
  -webkit-backdrop-filter: blur(10px) saturate(1.15);
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
    height: 100dvh;
    grid-template-columns: 1fr;
    grid-template-rows: minmax(0, 1fr);
  }
  /* Full-screen mobile mode: hide large hero column */
  .wizard-hero {
    display: none;
  }
  .wizard-panel {
    min-height: 0;
    height: 100dvh;
  }
  .wizard-header {
    position: sticky;
    top: 0;
    z-index: 35;
    background: color-mix(in srgb, var(--wizard-shell-fill) 78%, transparent);
    backdrop-filter: blur(calc(var(--liquid-blur) * 0.5)) saturate(1.1);
    -webkit-backdrop-filter: blur(calc(var(--liquid-blur) * 0.5)) saturate(1.1);
    padding: 0.6rem 1rem 0.45rem;
  }
  .wizard-close {
    width: 2.4rem;
    height: 2.4rem;
  }
  .wizard-footer .btn {
    min-height: 2.75rem;
  }
}

@media (max-width: 640px) {
  .wizard-backdrop {
    align-items: stretch;
    justify-content: stretch;
  }
  .wizard-modal {
    height: 100dvh;
  }
  .wizard-header,
  .wizard-body,
  .wizard-footer {
    padding-left: 1.25rem;
    padding-right: 1.25rem;
  }
  .wizard-panel-main {
    --wizard-footer-safe: 7.25rem;
  }
  .wizard-message {
    margin-left: 1.25rem;
    margin-right: 1.25rem;
  }
  .wizard-body {
    padding-top: 0.75rem;
  }
  .wizard-body--center-options {
    justify-content: flex-start;
  }
  .wizard-step {
    min-height: 5rem;
  }
  .wizard-options.wizard-options-grid {
    grid-template-columns: 1fr;
    gap: 0.65rem;
  }
  /* Future pupils step: keep heading at top + large 2x2 choices */
  .wizard-step-pupils {
    align-items: flex-start !important;
    justify-content: flex-start !important;
  }
  .wizard-step-pupils .wizard-question {
    margin-bottom: 0.45rem;
  }
  .wizard-step-pupils .wizard-hint {
    margin-top: 0;
    margin-bottom: 0.9rem;
  }
  .wizard-step-pupils .wizard-options {
    margin-top: 0.2rem;
  }
  .wizard-options-three .wizard-option {
    min-height: 5.2rem;
    padding: 1rem 0.8rem;
    border-radius: 0.85rem;
    font-size: 1.1rem;
    font-weight: 600;
  }
  .wizard-option {
    width: 100%;
    min-height: 5.5rem;
    padding: 1rem 1rem;
    border-radius: 0.85rem;
    font-size: 1rem;
  }
  .wizard-option-main {
    font-size: 1.1rem;
  }
  .wizard-option-desc {
    font-size: 0.9rem;
  }
  .wizard-counter {
    width: 100%;
    justify-content: center;
  }
  .wizard-participant-row.wizard-participant-header {
    display: none;
  }
  .wizard-participant-row:not(.wizard-participant-header) {
    grid-template-columns: 1fr;
    gap: 0.45rem;
    padding: 0.6rem 0.7rem;
    border: 1px solid var(--liquid-border);
    border-radius: var(--radius);
    background: var(--liquid-tile-bg-inner);
    box-shadow: var(--shadow-sm), var(--liquid-shadow-inset);
  }
  .wizard-participant-remove {
    justify-self: end;
  }
  .wizard-step-form input,
  .wizard-step-form textarea,
  .wizard-step-form select {
    font-size: 1rem;
    padding: 1.2rem 0.9rem 0.72rem;
  }
  .wizard-step-form label {
    left: 0.9rem;
    top: 1rem;
    font-size: 0.95rem;
  }
  .wizard-step-form .field.filled label,
  .wizard-step-form .field:focus-within label {
    top: 0.4rem;
    font-size: 0.74rem;
  }
  .wizard-cart-row {
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 0.2rem 0.75rem;
  }
  .wizard-footer {
    gap: 0.5rem;
    padding-top: 0.65rem;
    padding-bottom: max(0.75rem, env(safe-area-inset-bottom, 0px));
  }
  .wizard-footer .btn {
    flex: 1 1 0;
    justify-content: center;
    padding: 0.8rem 0.9rem;
    font-size: 0.95rem;
  }
  .wizard-footer .btn .bi {
    font-size: 0.95rem;
  }
}

@media (max-width: 420px) {
  .wizard-header,
  .wizard-body,
  .wizard-footer {
    padding-left: 0.85rem;
    padding-right: 0.85rem;
  }
  .wizard-footer {
    flex-wrap: wrap;
  }
  .wizard-footer .btn {
    width: 100%;
  }
  .wizard-options-vertical {
    max-width: 100%;
  }
}
</style>
