<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  enrollTeam,
  enrollClass,
  enrollFuture,
  fetchEnrollmentPricingQuote,
  getEventsNearest,
  validateVoucher,
  validateTeamName,
  updateTeamPlayers,
  registerTeamForEvent,
  listAddressBookGrouped,
  isDolibarrRowId,
} from '@/services/draht'
import {
  emptyAddressState,
  buildNewAddressPayload,
  ADDRESS_MODE_INVOICE,
  ADDRESS_MODE_DELIVERY,
  syncExistingAddressSelection,
} from '@/utils/addressForm'
import { useEnrollmentPricingQuote } from '@/composables/useEnrollmentPricingQuote'
import AddressSelector from '@/components/AddressSelector.vue'
import CustomSelect from '@/components/CustomSelect.vue'
import EnrollConsentCheckboxes from '@/components/EnrollConsentCheckboxes.vue'
import EventSelectDropdown from '@/components/EventSelectDropdown.vue'
import { FUTURE_PUPIL_OPTIONS, REASON_ATTENTION_OPTIONS } from '@/config/enrollmentOptions'
import { SCHOOL_TYPE_OPTIONS } from '@/config/schoolTypes'
import { usePrivateInstitutionOrganization } from '@/composables/usePrivateInstitutionOrganization'
import { extractLockedSeasonSetCount } from '@/utils/voucherPreset'
import { fetchPlacesForPostalCode, normalizeCountryForZipLookup } from '@/utils/postalCodeLookup'
import { buildCountryOptions } from '@/utils/countryOptions'
import {
  filterEventsWithCapacity,
  formatEventOptionLabel,
} from '@/utils/events'
import logoFllExploreV from '@/assets/fll_explore_v.png'
import logoFllChallengeV from '@/assets/fll_challenge_v.png'
import logoFuture from '@/assets/first_rgb_fullcolor_ohne.png'
import logoFounders from '@/assets/first_canopy_fll_founders_edition_rgb_fullcolor.png'
import I18nText from "@/components/I18nText.vue";

const props = defineProps({
  open: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'success', 'history-change'])
const previousBodyOverflow = ref('')
const previousHtmlOverflow = ref('')

const { t, locale } = useI18n()
const router = useRouter()
const FUTURE_GROUP_5_ENABLED = false

// Step 0a: FLL experience (before voucher)
const introSubStep = ref('fll') // 'fll' | 'voucher'
/** User already participated in FLL: 'yes' | 'no' (maps to tekla first_participation inverted). */
const fllParticipatedBefore = ref(null)
/** Tekla reason_attention when first participation. */
const reasonAttention = ref(null)

// Step 0b: Voucher / Direkteinstieg
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
/** Future pupils per group fixed by voucher preset — user must not choose, step is skipped. */
const presetPupilsCount = ref(null)

const effectiveSeasonSetCount = computed(() => {
  if (edition.value === 'founders' && foundersVariant.value === 'explore') return 0
  if (presetSeasonSetCount.value != null && [0, 1, 2].includes(presetSeasonSetCount.value)) {
    return presetSeasonSetCount.value
  }
  const w = Number(wizardSeasonSetCount.value)
  return [0, 1, 2].includes(w) ? w : 1
})

/** Voucher/form preset fixes season set count — user must not choose. */
const seasonSetsPresetLocked = computed(() => {
  const n = presetSeasonSetCount.value
  return n != null && [0, 1, 2].includes(n)
})

/** Voucher/form preset fixes Future pupils count — user must not choose, step is skipped. */
const pupilsPresetLocked = computed(() => {
  if (edition.value !== 'future') return false
  const n = presetPupilsCount.value
  return n != null && FUTURE_PUPIL_OPTIONS.includes(Number(n))
})

/** Future participants (pupils) step. */
function isPupilsWizardStep(s) {
  return edition.value === 'future' && s === 4
}

const shouldSkipPupilsWizardStep = computed(() => pupilsPresetLocked.value)

function isSeasonSetsWizardStep(s) {
  if (edition.value === 'future' && s === 5) return true
  return edition.value === 'founders'
    && foundersNeedsSeasonSets.value
    && s === foundersSeasonSetsStep.value
}

const shouldSkipSeasonSetsWizardStep = computed(() => {
  if (!seasonSetsPresetLocked.value) return false
  if (edition.value === 'future') return true
  return foundersNeedsSeasonSets.value
})

/** True when step `n` is a preset-locked step that should be skipped (pupils or season-sets). */
function isSkippablePresetStep(n) {
  if (shouldSkipPupilsWizardStep.value && isPupilsWizardStep(n)) return true
  if (shouldSkipSeasonSetsWizardStep.value && isSeasonSetsWizardStep(n)) return true
  return false
}

/** Step index after moving forward/backward, skipping any preset-locked steps (pupils, season-sets). */
function adjustStepForSeasonSetsSkip(s, direction) {
  let n = s + direction
  let guard = 0
  while (guard++ < 10 && isSkippablePresetStep(n)) {
    n += direction
  }
  return n
}

/** If we landed on a preset-locked step (pupils/season-sets), advance past it. */
function skipSeasonSetsStepIfNeeded() {
  let guard = 0
  while (guard++ < 10 && isSkippablePresetStep(step.value)) {
    if (!canNext()) return
    step.value = adjustStepForSeasonSetsSkip(step.value, 1)
  }
}
const presetRegisterEventTeams = ref(null)
const presetEventTeamCount = ref(null)
// Founder team: participants (first name, last name, date of birth, gender)
const founderTeamPlayers = ref([])
// Founder team: event to register for
const founderTeamEventId = ref(null)
const founderEventsNearest = ref([])
const founderEventsNearestLoading = ref(false)

// Team name validation
const nameValidation = ref({ blocked: false, blockedReason: null, warning: false, warningType: null, duplicateCount: 0 })
const nameValidationLoading = ref(false)
/** When true, user has acknowledged the soft warning and wants to proceed anyway. */
const nameValidationIgnored = ref(false)
let nameValidationTimer = null
// Step 6
const deliveryAddress = ref(emptyAddressState(ADDRESS_MODE_DELIVERY))
const invoiceAddress = ref(emptyAddressState(ADDRESS_MODE_INVOICE))
/** Options for delivery selector (contacts only when API returns split lists). */
const deliveryAddresses = ref([])
/** Options for invoice selector (third parties only when API returns split lists). */
const invoiceAddresses = ref([])
const deliveryAddressDifferent = ref(false)

/** Voucher sets invoice (Thirdparty) — delivery must be a separate contact address, not “same as invoice”. */
const voucherForcesInvoiceAddress = computed(
  () => (voucherType.value === '1' && isDolibarrRowId(voucherInvoiceId.value))
    || isDolibarrRowId(voucherPresetInvoiceId.value),
)

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

const foundersClassEnrollment = computed(
  () => edition.value === 'founders' && foundersType.value === 'class',
)

const foundersNeedsSeasonSets = computed(
  () => edition.value === 'founders' && foundersVariant.value === 'challenge',
)

const foundersTeamNameStepIndex = computed(() =>
  (foundersTeamHasParticipantsStep.value ? 6 : -1),
)

const foundersSeasonSetsStep = computed(() => {
  if (!foundersNeedsSeasonSets.value) return -1
  if (foundersTeamHasParticipantsStep.value) return 8
  if (foundersClassEnrollment.value) return 5
  return -1
})

const foundersAddressesStep = computed(() => {
  if (edition.value !== 'founders') return -1
  if (foundersTeamHasParticipantsStep.value) {
    return foundersNeedsSeasonSets.value ? 9 : 8
  }
  if (foundersClassEnrollment.value) {
    return foundersNeedsSeasonSets.value ? 6 : 5
  }
  return foundersNeedsSeasonSets.value ? 7 : 6
})

const foundersOrderStep = computed(() => {
  if (edition.value !== 'founders') return -1
  return foundersAddressesStep.value + 1
})

/** Founders inserts team/class between variant (2) and institution — institution shifts +1 vs Future. */
const institutionStepIndex = computed(() => (edition.value === 'founders' ? 4 : 3))
const participantsStepIndex = computed(() => {
  if (edition.value === 'future') return 4
  if (foundersTeamHasParticipantsStep.value) return 7
  return 5
})

const lastStep = computed(() => {
  // Future: 5=sets, 6=on-site, 7=addresses, 8=review. Founders team: +1 step for team name.
  if (edition.value === 'future') return 8
  if (foundersTeamHasParticipantsStep.value) {
    return foundersNeedsSeasonSets.value ? 10 : 9
  }
  if (foundersClassEnrollment.value) {
    return foundersNeedsSeasonSets.value ? 7 : 6
  }
  if (edition.value === 'founders') {
    return foundersNeedsSeasonSets.value ? 8 : 7
  }
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

const futureTeamPillsShowExpandHint = computed(() =>
  futureOnSiteEvent.value === 'yes'
  && futureTeamOptionCounts.value.some((c) => c > maxFutureEventTeamsByPupils.value),
)
const futureTeamEventsAllSelected = computed(() => {
  if (futureOnSiteEvent.value !== 'yes') return true
  if (futureTeamEvents.value.length === 0) return false
  return futureTeamEvents.value.every((entry) => {
    const evId = Number(entry?.eventId)
    const hasEvent = Number.isFinite(evId) && evId > 0
    const hasName = String(entry?.name ?? '').trim().length > 0
    return hasEvent && hasName
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

  if (!edition.value) {
    return withIndex([
      { key: 'wizard.progressChoose', active: s <= 1, done: false },
      { key: 'wizard.progressDetails', active: false, done: false },
      { key: 'wizard.progressAddresses', active: false, done: false },
      { key: 'wizard.progressReview', active: false, done: false },
    ])
  }

  if (edition.value === 'future') {
    return withIndex([
      { key: 'wizard.progressChoose', active: s <= 2, done: s > 2 },
      { key: 'wizard.progressDetails', active: s === 3, done: s > 3 },
      {
        key: 'wizard.progressParticipants',
        active: s === 4 && !shouldSkipPupilsWizardStep.value,
        done: s > 4 || shouldSkipPupilsWizardStep.value,
      },
      {
        key: 'wizard.progressSeasonSets',
        active: s === 5 && !shouldSkipSeasonSetsWizardStep.value,
        done: s > 5 || shouldSkipSeasonSetsWizardStep.value,
      },
      { key: 'wizard.progressOnSite', active: s === 6, done: s > 6 },
      { key: 'wizard.progressAddresses', active: s === 7, done: s > 7 },
      { key: 'wizard.progressReview', active: s === 8, done: success.value },
    ])
  }

  if (foundersTeamHasParticipantsStep.value) {
    const addr = foundersAddressesStep.value
    const order = foundersOrderStep.value
    const items = [
      { key: 'wizard.progressChoose', active: s <= 2, done: s > 2 },
      { key: 'wizard.stepTeamClass', active: s === 3, done: s > 3 },
      { key: 'wizard.progressDetails', active: s === 4, done: s > 4 },
      { key: 'wizard.progressEvent', active: s === 5, done: s > 5 },
      { key: 'wizard.progressTeamName', active: s === 6, done: s > 6 },
      { key: 'wizard.progressParticipants', active: s === 7, done: s > 7 },
    ]
    if (foundersNeedsSeasonSets.value) {
      items.push({
        key: 'wizard.progressSeasonSets',
        active: s === 8 && !shouldSkipSeasonSetsWizardStep.value,
        done: s > 8 || shouldSkipSeasonSetsWizardStep.value,
      })
    }
    items.push(
      { key: 'wizard.progressAddresses', active: s === addr, done: s > addr },
      { key: 'wizard.progressReview', active: s === order, done: success.value },
    )
    return withIndex(items)
  }

  const addr = foundersAddressesStep.value
  const order = foundersOrderStep.value
  const items = [
    { key: 'wizard.progressChoose', active: s <= 2, done: s > 2 },
    { key: 'wizard.stepTeamClass', active: s === 3, done: s > 3 },
    { key: 'wizard.progressDetails', active: s === 4, done: s > 4 },
  ]
  if (foundersNeedsSeasonSets.value) {
    items.push({
      key: 'wizard.progressSeasonSets',
      active: s === foundersSeasonSetsStep.value && !shouldSkipSeasonSetsWizardStep.value,
      done: s > foundersSeasonSetsStep.value || shouldSkipSeasonSetsWizardStep.value,
    })
  }
  items.push(
    { key: 'wizard.progressAddresses', active: s === addr, done: s > addr },
    { key: 'wizard.progressReview', active: s === order, done: success.value },
  )
  return withIndex(items)
})

const stepTitle = computed(() => {
  const s = step.value
  const ft = foundersTeamHasParticipantsStep.value
  if (s === 0) {
    return introSubStep.value === 'fll' ? t('wizard.stepFllExperience') : t('wizard.stepVoucherCode')
  }
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
    if (foundersClassEnrollment.value) {
      return foundersNeedsSeasonSets.value ? t('enrollFuture.stepSeasonSets') : t('wizard.stepAddresses')
    }
    if (ft) return t('wizard.stepEvent')
    return ''
  }
  if (s === 6) {
    if (edition.value === 'future') return t('wizard.stepOnSiteEvent')
    if (ft) return t('wizard.stepTeamName')
    if (foundersClassEnrollment.value) {
      return foundersNeedsSeasonSets.value ? t('wizard.stepAddresses') : t('wizard.stepOrder')
    }
    return ''
  }
  if (s === 7) {
    if (edition.value === 'future') return t('wizard.stepAddresses')
    if (ft) return t('wizard.stepParticipants')
    if (foundersClassEnrollment.value) return t('wizard.stepOrder')
    return ''
  }
  if (s === 8) {
    if (edition.value === 'future') return t('wizard.stepOrder')
    if (ft) {
      return foundersNeedsSeasonSets.value ? t('enrollFuture.stepSeasonSets') : t('wizard.stepAddresses')
    }
    return ''
  }
  if (s === 9) {
    if (ft) {
      return foundersNeedsSeasonSets.value ? t('wizard.stepAddresses') : t('wizard.stepOrder')
    }
    return ''
  }
  if (s === 10 && ft && foundersNeedsSeasonSets.value) return t('wizard.stepOrder')
  return ''
})

function scheduleAdvanceIfReady(expectedStep) {
  nextTick(() => {
    if (!props.open) return
    if (step.value !== expectedStep) return
    if (!canNext()) return
    next()
    skipSeasonSetsStepIfNeeded()
  })
}

const futurePupilCompare = ref(null)
const futurePupilCompareLoading = ref(false)
let futurePupilCompareSeq = 0

async function refreshFuturePupilCompare() {
  if (edition.value !== 'future' || !futureGroup.value) {
    futurePupilCompare.value = null
    futurePupilCompareLoading.value = false
    return
  }
  const seq = ++futurePupilCompareSeq
  futurePupilCompareLoading.value = true
  try {
    const data = await fetchEnrollmentPricingQuote({
      edition: 'future',
      group: futureGroup.value,
      country: resolveQuoteCountryCode(),
      seasonSetCount: 0,
      hasEvent: false,
      futureOnSiteEvent: 'later',
      comparePupils: [...FUTURE_PUPIL_OPTIONS],
      voucher: voucherValid.value === true && voucher.value?.trim() ? voucher.value.trim() : undefined,
    })
    if (seq !== futurePupilCompareSeq) return
    futurePupilCompare.value = data?.comparePupils ?? null
  } catch {
    if (seq === futurePupilCompareSeq) futurePupilCompare.value = null
  } finally {
    if (seq === futurePupilCompareSeq) futurePupilCompareLoading.value = false
  }
}

function formatFutureGroupPriceEur(pupils) {
  const key = String(Number(pupils))
  const cmp = futurePupilCompare.value?.[key] ?? pricingQuote.value?.comparePupils?.[key]
  const amount = cmp?.groupGrossEur ?? cmp?.totalGrossEur
  if (!Number.isFinite(amount)) {
    return futurePupilCompareLoading.value || pricingLoading.value ? '…' : ''
  }
  return formatWizardEur(amount)
}

function quoteLineProductName(line) {
  const label = String(line?.label ?? '').trim()
  if (label) return label
  return String(line?.productRef ?? '').trim()
}

function seasonSetCompareEntry(setCount) {
  return pricingQuote.value?.compareSeasonSets?.[String(Number(setCount))] ?? null
}

function formatSeasonSetOptionPrice(setCount) {
  const cmp = seasonSetCompareEntry(setCount)
  const amount = cmp?.seasonSetsGrossEur
  if (pricingLoading.value && (cmp == null || !Number.isFinite(Number(amount)))) return '…'
  if (!Number.isFinite(Number(amount))) return ''
  return formatWizardEur(amount)
}

const pricingQuotePayload = computed(() => {
  if (!edition.value) return null
  const payload = {
    edition: edition.value,
    country: resolveQuoteCountryCode(),
    seasonSetCount: effectiveSeasonSetCount.value,
    voucher: voucherValid.value === true && voucher.value?.trim() ? voucher.value.trim() : undefined,
  }

  if (edition.value === 'future') {
    if (!futureGroup.value) return null
    payload.group = futureGroup.value
    if (futurePupils.value != null) payload.pupils = Number(futurePupils.value)
    payload.futureOnSiteEvent = futureOnSiteEvent.value
    payload.eventTeamCount = futureOnSiteEvent.value === 'yes' ? normalizeFutureEventTeamCount() : 0
    if (futureOnSiteEvent.value === 'yes' && futureEventId.value) payload.eventId = futureEventId.value
    payload.comparePupils = [...FUTURE_PUPIL_OPTIONS]
    payload.compareSeasonSets = [0, 1, 2]
  } else if (edition.value === 'founders') {
    if (!foundersVariant.value || !foundersType.value) return null
    payload.foundersVariant = foundersVariant.value
    payload.foundersType = foundersType.value
    const isTeam = foundersType.value === 'team'
    payload.program = foundersVariant.value === 'explore' ? (isTeam ? 1 : 4) : (isTeam ? 2 : 5)
    if (foundersType.value !== 'class') {
      const pc = founderTeamPlayers.value.filter((p) => p.firstname || p.name || p.gender || p.birthdayStr).length
      payload.participantCount = pc
      payload.registeredPupils = pc
      if (founderTeamEventId.value) {
        payload.founderTeamEventId = founderTeamEventId.value
        payload.hasEvent = true
      }
    }
    if (foundersNeedsSeasonSets.value) {
      payload.compareSeasonSets = [0, 1, 2]
    }
  } else {
    return null
  }

  return payload
})

const { quote: pricingQuote, loading: pricingLoading, error: pricingError } = useEnrollmentPricingQuote(
  () => pricingQuotePayload.value,
)

const pricingLines = computed(() => (Array.isArray(pricingQuote.value?.lines) ? pricingQuote.value.lines : []))

/**
 * Mirrors the PHP helper handson_unified_rules_quote_line_is_season_set_shipping.
 * A line is "shipping" when its lineKind is 'service' or its label/productRef
 * contains a shipping-related keyword.
 */
function isShippingLine(line) {
  if (!line || typeof line !== 'object') return false
  if (line.lineKind === 'service') return true
  const text = `${line.label ?? ''} ${line.productRef ?? ''}`.toLowerCase()
  return /\b(porto|versand|shipping|lieferung|paketporto|transport|portgeb[uü]hr)\b/.test(text)
}

/**
 * Delivery country is "confirmed" when an explicit address has been entered or
 * selected — not just based on the institution location fallback.
 * Used to decide whether to show shipping costs in the order overview.
 */
const deliveryCountryConfirmed = computed(() => {
  // Separate delivery address entered
  if (deliveryAddressDifferent.value || voucherForcesInvoiceAddress.value) {
    const newC = deliveryAddress.value?.new?.country?.trim()
    if (newC) return true
    if (deliveryAddress.value?.useExisting && deliveryAddress.value?.addressId) return true
    return false
  }
  // Delivery = invoice address; check whether an invoice address country is available
  const newC = invoiceAddress.value?.new?.country?.trim()
  if (newC) return true
  if (invoiceAddress.value?.useExisting && invoiceAddress.value?.addressId) return true
  return false
})

const pricingDisplayLines = computed(() => {
  if (deliveryCountryConfirmed.value) return pricingLines.value
  return pricingLines.value.filter((l) => !isShippingLine(l))
})

const pricingTotalGrossEur = computed(() => {
  if (deliveryCountryConfirmed.value) {
    const t = Number(pricingQuote.value?.totalGrossEur)
    return Number.isFinite(t) ? t : 0
  }
  // Subtract shipping lines from total
  return pricingLines.value.reduce((sum, l) => {
    if (isShippingLine(l)) return sum
    const v = Number(l.lineGrossEur)
    return sum + (Number.isFinite(v) ? v : 0)
  }, 0)
})

const pricingUseApi = computed(() => pricingQuote.value?.ok === true)

const quotedEventTeamUnitGross = computed(() => {
  const ln = pricingLines.value.find((l) => l.category === 'eventTeams' && Number(l.qty) > 0)
  if (!ln) return 0
  const u = Number(ln.unitGrossEur)
  return Number.isFinite(u) ? u : 0
})

function pricingLineShowsWasPrice(line) {
  const cat = Number(line?.catalogGrossEur)
  const gross = Number(line?.lineGrossEur)
  return Number.isFinite(cat) && Number.isFinite(gross) && cat > gross + 0.01
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
  return foundersSeasonSetsStep.value
}

function selectWizardSeasonSetCount(count) {
  if (seasonSetsPresetLocked.value) return
  wizardSeasonSetCount.value = count
  const expected = seasonSetsStepIndex()
  if (expected >= 0) scheduleAdvanceIfReady(expected)
}

function selectFutureEventTeamCount(count) {
  const n = Number(count)
  const maxTeams = maxFutureEventTeamsByPupils.value
  if (!Number.isFinite(n) || n <= 0) return
  if (n <= maxTeams) {
    if (futureTeamAutoUpgrade.value && n < futureTeamAutoUpgrade.value.teams) {
      futurePupils.value = futureTeamAutoUpgrade.value.previousPupils
      futureTeamAutoUpgrade.value = null
    }
    futureEventTeamCount.value = n
    return
  }
  const neededPupils = n * FUTURE_EVENT_TEAM_SIZE
  if (!FUTURE_PUPIL_OPTIONS.includes(neededPupils)) return
  const previousPupils = futureTeamAutoUpgrade.value?.previousPupils ?? futurePupils.value
  futurePupils.value = neededPupils
  futureEventTeamCount.value = n
  futureTeamAutoUpgrade.value = { teams: n, pupils: neededPupils, previousPupils }
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
    futureTeamEvents.value.push({ eventId: null, name: '' })
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
  const prev = futureTeamEvents.value[idx]
  futureTeamEvents.value[idx] = {
    eventId: eventId ? Number(eventId) : null,
    name: String(prev?.name ?? '').trim(),
  }
  updateDerivedFutureEventId()
}

const futureOrderEventTeamsCount = computed(() => {
  if (futureOnSiteEvent.value !== 'yes') return 0
  return normalizeFutureEventTeamCount()
})

function resolveQuoteCountryCode() {
  // Delivery address country takes priority — shipping (Logistikpauschale) is
  // always calculated based on where the goods are sent, not the institution location.
  const newDeliveryC = deliveryAddress.value?.new?.country?.trim()
  if (newDeliveryC) return newDeliveryC.length === 2 ? newDeliveryC.toUpperCase() : newDeliveryC
  if (deliveryAddress.value?.useExisting && deliveryAddress.value?.addressId) {
    const id = String(deliveryAddress.value.addressId)
    const found = deliveryAddresses.value.find((a) => String(a.id) === id)
    const c = found?.country != null ? String(found.country).trim() : ''
    if (c) return c.length === 2 ? c.toUpperCase() : c
  }
  // Delivery = invoice: use invoice address country
  const newInvoiceC = invoiceAddress.value?.new?.country?.trim()
  if (newInvoiceC) return newInvoiceC.length === 2 ? newInvoiceC.toUpperCase() : newInvoiceC
  if (invoiceAddress.value?.useExisting && invoiceAddress.value?.addressId) {
    const id = String(invoiceAddress.value.addressId)
    const found = invoiceAddresses.value.find((a) => String(a.id) === id)
    const c = found?.country != null ? String(found.country).trim() : ''
    if (c) return c.length === 2 ? c.toUpperCase() : c
  }
  // Fall back to institution/school country
  const fromInstitution = formData.value.country?.trim()
  if (fromInstitution) return fromInstitution.length === 2 ? fromInstitution.toUpperCase() : fromInstitution
  return 'DE'
}

watch(
  [edition, futureGroup, () => formData.value.country, voucher, voucherValid],
  () => {
    refreshFuturePupilCompare()
  },
  { immediate: true },
)

watch(
  [seasonSetsPresetLocked, pupilsPresetLocked, () => step.value, edition, foundersNeedsSeasonSets],
  () => {
    if (!props.open) return
    if (!isSkippablePresetStep(step.value)) return
    nextTick(() => {
      skipSeasonSetsStepIfNeeded()
    })
  },
)

const summaryVoucherCode = computed(() => {
  const code = voucher.value?.trim()
  if (!code || voucherValid.value !== true) return ''
  return code
})

const summaryItems = computed(() => {
  const items = []
  if (summaryVoucherCode.value) {
    items.push({ label: `${t('enroll.voucher')}: ${summaryVoucherCode.value}` })
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
  if (edition.value === 'future' || foundersNeedsSeasonSets.value) {
    const sc = effectiveSeasonSetCount.value
    const setLabel = sc === 0 ? t('enrollFuture.seasonNone') : sc === 1 ? t('enrollFuture.seasonOne') : t('enrollFuture.seasonTwo')
    items.push({ label: `${t('wizard.orderSeasonSets')}: ${setLabel}` })
  }
  if (edition.value === 'future' && futureOnSiteEvent.value === 'yes') {
    if (futureTeamEventSummaries.value.length > 0) {
      futureTeamEventSummaries.value.forEach((line) => items.push({ label: line }))
    } else if (futureEventId.value) {
      items.push({ label: selectedFutureEventLabel.value || t('wizard.onSiteEventSelected') })
    }
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
      const teamName = String(entry?.name ?? '').trim()
      const prefix = teamName || `${t('wizard.teamSingular')} ${idx + 1}`
      return `${prefix}: ${evLabel}`
    })
    .filter(Boolean),
)

const selectedFounderEventLabel = computed(() => {
  if (!founderTeamEventId.value || !founderEventsNearest.value.length) return null
  const ev = founderEventsNearest.value.find((e) => String(e.id) === String(founderTeamEventId.value))
  return ev ? (ev.label || ev.name || ev.title || ev.ref) : null
})

const centeredOptionStep = computed(() => {
  if (step.value === 0 && introSubStep.value === 'fll') {
    return fllParticipatedBefore.value === null || fllParticipatedBefore.value === 'no'
  }
  if (step.value === 0 && introSubStep.value === 'voucher') return hasVoucherCode.value === null
  return step.value === 1
    || step.value === 2
    || (step.value === 3 && edition.value === 'founders')
    || (step.value === 4 && edition.value === 'future')
    || (foundersTeamNameStepIndex.value >= 0 && step.value === foundersTeamNameStepIndex.value)
})

/** Event display label with optional capacity (from nearest API). */
function futureEventOptionLabel(ev) {
  return formatEventOptionLabel(ev, t)
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

const countryOptions = computed(() => buildCountryOptions(locale.value))

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
/** True after user picked a place from the PLZ list — ignore stale lookup results. */
let institutionZipPlaceSelected = false
const institutionZipPlaces = ref([])
const institutionZipLoading = ref(false)

function applyInstitutionPlace(item) {
  if (!item) return
  institutionZipPlaceSelected = true
  if (zipLookupAbort) zipLookupAbort.abort()
  if (zipLookupTimer) clearTimeout(zipLookupTimer)
  institutionZipLoading.value = false
  institutionZipPlaces.value = []
  if (item.city) formData.value.city = item.city
  if (item.state) formData.value.state = item.state
}

async function lookupInstitutionPlaces() {
  const zip = formData.value.zip?.trim()
  if (!zip) {
    institutionZipPlaces.value = []
    institutionZipLoading.value = false
    return
  }
  const country = normalizeCountryForZipLookup(formData.value.country, zip)
  if (!country) {
    institutionZipPlaces.value = []
    return
  }
  if (zipLookupAbort) zipLookupAbort.abort()
  zipLookupAbort = new AbortController()
  institutionZipLoading.value = true
  try {
    const places = await fetchPlacesForPostalCode(country, zip, { signal: zipLookupAbort.signal })
    if (institutionZipPlaceSelected) return
    institutionZipPlaces.value = places
    if (places.length === 1) {
      applyInstitutionPlace(places[0])
    } else if (places.length > 1) {
      formData.value.city = ''
      formData.value.state = ''
    } else {
      formData.value.city = ''
      formData.value.state = ''
    }
  } catch (_) {
    institutionZipPlaces.value = []
  } finally {
    institutionZipLoading.value = false
  }
}

const foundersLogos = [{ src: logoFounders, alt: 'Founders Edition' }]

const futureLogos = [{ src: logoFuture, alt: 'Future Edition' }]

function chooseNoVoucher() {
  hasVoucherCode.value = 'no'
  step.value = 1
}

function advanceIntroToVoucher() {
  nextTick(() => {
    if (!props.open) return
    if (step.value !== 0 || introSubStep.value !== 'fll') return
    if (fllParticipatedBefore.value === 'yes') {
      introSubStep.value = 'voucher'
      return
    }
    if (fllParticipatedBefore.value === 'no' && reasonAttention.value) {
      introSubStep.value = 'voucher'
    }
  })
}

function selectFllParticipatedBefore(val) {
  fllParticipatedBefore.value = val
  if (val === 'yes') {
    reasonAttention.value = null
    advanceIntroToVoucher()
  }
}

function selectReasonAttention(value) {
  reasonAttention.value = value
  advanceIntroToVoucher()
}

function buildParticipationPayload() {
  if (fllParticipatedBefore.value === 'yes') {
    return { firstParticipation: 'no' }
  }
  if (fllParticipatedBefore.value === 'no') {
    const payload = { firstParticipation: 'yes' }
    if (reasonAttention.value) payload.reasonAttention = reasonAttention.value
    return payload
  }
  return {}
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
  if (val === 'explore') {
    wizardSeasonSetCount.value = 0
    if (presetSeasonSetCount.value != null) presetSeasonSetCount.value = 0
  }
  scheduleAdvanceIfReady(2)
}

function selectFoundersType(val) {
  foundersType.value = val
  scheduleAdvanceIfReady(3)
}

function openWizard() {
  introSubStep.value = 'fll'
  fllParticipatedBefore.value = null
  reasonAttention.value = null
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
  presetPupilsCount.value = null
  presetRegisterEventTeams.value = null
  presetEventTeamCount.value = null
  deliveryAddress.value = emptyAddressState(ADDRESS_MODE_DELIVERY)
  invoiceAddress.value = emptyAddressState(ADDRESS_MODE_INVOICE)
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

function institutionPlaceSelectionPending() {
  return institutionZipPlaces.value.length > 1
}

function hasRequiredInstitutionFields() {
  return !(
    isInstitutionFieldMissing('organization')
    || isInstitutionFieldMissing('schoolType')
    || isInstitutionFieldMissing('country')
    || isInstitutionFieldMissing('zip')
    || institutionPlaceSelectionPending()
  )
}

function hasRequiredParticipantFields() {
  if (edition.value === 'future') return futurePupils.value != null
  return true
}

function hasRequiredTeamName() {
  return foundersType.value !== 'team' || !!formData.value.name?.trim()
}

/** Debounced call to the backend name-validation endpoint. */
function scheduleNameValidation(eventId = null) {
  clearTimeout(nameValidationTimer)
  const name = formData.value.name?.trim() ?? ''
  if (!name) {
    nameValidation.value = { blocked: false, blockedReason: null, warning: false, warningType: null, duplicateCount: 0 }
    nameValidationLoading.value = false
    return
  }
  nameValidationLoading.value = true
  nameValidationTimer = setTimeout(async () => {
    try {
      const result = await validateTeamName(name, eventId ?? founderTeamEventId.value)
      nameValidation.value = result
    } catch (_) {
      nameValidation.value = { blocked: false, blockedReason: null, warning: false, warningType: null, duplicateCount: 0 }
    } finally {
      nameValidationLoading.value = false
    }
  }, 400)
}

function hasRequiredSchoolFields() {
  return hasRequiredInstitutionFields() && hasRequiredParticipantFields() && hasRequiredTeamName()
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
    if (introSubStep.value === 'fll') {
      if (fllParticipatedBefore.value === 'yes') return true
      if (fllParticipatedBefore.value === 'no') return !!reasonAttention.value
      return false
    }
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
    if (edition.value === 'future') {
      if (shouldSkipPupilsWizardStep.value) return true
      return hasRequiredParticipantFields()
    }
    return hasRequiredInstitutionFields()
  }
  if (s === 5) {
    if (edition.value === 'future') {
      if (shouldSkipSeasonSetsWizardStep.value) return true
      const w = Number(wizardSeasonSetCount.value)
      return [0, 1, 2].includes(w)
    }
    if (foundersClassEnrollment.value) {
      if (foundersNeedsSeasonSets.value) {
        if (shouldSkipSeasonSetsWizardStep.value) return true
        const w = Number(wizardSeasonSetCount.value)
        return [0, 1, 2].includes(w)
      }
      return areAddressesValid()
    }
    if (ft) return true  // event step is optional
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
    if (ft) return hasRequiredTeamName() && !nameValidation.value.blocked
    if (foundersClassEnrollment.value) {
      return foundersNeedsSeasonSets.value ? areAddressesValid() : false
    }
    return false
  }
  if (s === 7) {
    if (edition.value === 'future') return areAddressesValid()
    if (ft) return true
    if (foundersClassEnrollment.value) return false
    return false
  }
  if (s === 8) {
    if (edition.value === 'future') return false
    if (ft) {
      if (foundersNeedsSeasonSets.value) {
        if (shouldSkipSeasonSetsWizardStep.value) return true
        const w = Number(wizardSeasonSetCount.value)
        return [0, 1, 2].includes(w)
      }
      return areAddressesValid()
    }
    return false
  }
  if (s === 9) {
    if (ft) return foundersNeedsSeasonSets.value ? areAddressesValid() : false
  }
  if (s === 10) {
    if (ft && foundersNeedsSeasonSets.value) return false
  }
  return false
}

function next() {
  if (step.value === institutionStepIndex.value && !hasRequiredInstitutionFields()) {
    step4ValidationAttempted.value = true
    return
  }
  if (step.value === foundersTeamNameStepIndex.value && !hasRequiredTeamName()) {
    step4ValidationAttempted.value = true
    return
  }
  if (step.value === foundersTeamNameStepIndex.value && nameValidation.value.blocked) {
    return
  }
  if (step.value === 0 && introSubStep.value === 'fll') {
    introSubStep.value = 'voucher'
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
    if (step.value >= 5 && foundersTeamHasParticipantsStep.value) loadFounderTeamEventsNearest()
    return
  }
  if (step.value === 2 && edition.value === 'future') loadAddresses()
  if (step.value === institutionStepIndex.value) loadAddresses()
  if (step.value === institutionStepIndex.value && foundersTeamHasParticipantsStep.value) loadFounderTeamEventsNearest()
  if (step.value === 4 && edition.value === 'future') loadFutureEventsNearest()
  if (step.value === participantsStepIndex.value && foundersTeamHasParticipantsStep.value) {
    if (founderTeamPlayers.value.length === 0) addFounderParticipant()
  }
  if (step.value < lastStep.value) {
    if (step.value === institutionStepIndex.value && foundersClassEnrollment.value) {
      if (foundersNeedsSeasonSets.value) {
        step.value = shouldSkipSeasonSetsWizardStep.value
          ? foundersAddressesStep.value
          : foundersSeasonSetsStep.value
      } else {
        step.value = foundersAddressesStep.value
      }
    } else {
      step.value = adjustStepForSeasonSetsSkip(step.value, 1)
    }
    skipSeasonSetsStepIfNeeded()
  }
  step4ValidationAttempted.value = false
}

function prev() {
  if (step.value === 1) {
    step.value = 0
    introSubStep.value = 'voucher'
    hasVoucherCode.value = null
    return
  }
  if (step.value === 0 && introSubStep.value === 'voucher') {
    introSubStep.value = 'fll'
    hasVoucherCode.value = null
    voucher.value = ''
    voucherValid.value = null
    voucherMessage.value = ''
    voucherType.value = null
    voucherInvoiceId.value = null
    voucherInvoiceName.value = null
    voucherPresetInvoiceId.value = null
    voucherPresetInvoiceName.value = null
    presetSeasonSetCount.value = null
    presetPupilsCount.value = null
    presetRegisterEventTeams.value = null
    presetEventTeamCount.value = null
    return
  }
  if (step.value > 1) {
    if (foundersClassEnrollment.value) {
      if (step.value === foundersOrderStep.value) {
        step.value = foundersAddressesStep.value
      } else if (step.value === foundersAddressesStep.value && foundersNeedsSeasonSets.value) {
        step.value = shouldSkipSeasonSetsWizardStep.value
          ? institutionStepIndex.value
          : foundersSeasonSetsStep.value
      } else if (
        step.value === foundersSeasonSetsStep.value
        || (step.value === foundersAddressesStep.value && !foundersNeedsSeasonSets.value)
      ) {
        step.value = institutionStepIndex.value
      } else {
        step.value = adjustStepForSeasonSetsSkip(step.value, -1)
      }
    } else {
      step.value = adjustStepForSeasonSetsSkip(step.value, -1)
    }
  }
}

const suppressHistoryPush = ref(false)

function applyWizardSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return
  suppressHistoryPush.value = true
  if (typeof snapshot.step === 'number') step.value = snapshot.step
  if (typeof snapshot.introSubStep === 'string') introSubStep.value = snapshot.introSubStep
  nextTick(() => {
    suppressHistoryPush.value = false
  })
}

function goWizardBack() {
  if (typeof window !== 'undefined') window.history.back()
  else prev()
}

watch(
  [step, introSubStep, () => props.open],
  ([s, intro, open]) => {
    if (!open || suppressHistoryPush.value) return
    emit('history-change', { step: s, introSubStep: intro })
  },
  { flush: 'post' },
)

defineExpose({
  applyWizardSnapshot,
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
    futureEventsNearest.value = filterEventsWithCapacity(normalizeEvents(list))
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
    founderEventsNearest.value = filterEventsWithCapacity(normalizeEvents(list))
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
      deliveryAddress.value = syncExistingAddressSelection(
        deliveryAddress.value,
        deliveryAddresses.value,
      )
      invoiceAddress.value = syncExistingAddressSelection(
        invoiceAddress.value,
        invoiceAddresses.value,
      )
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

function buildAddressPayload(addr, mode) {
  if (addr.useExisting && isDolibarrRowId(addr.addressId)) {
    return { addressId: String(Number(String(addr.addressId).trim())) }
  }
  return buildNewAddressPayload(addr, mode)
}

function buildInvoicePayload() {
  if (voucherType.value === '1' && isDolibarrRowId(voucherInvoiceId.value)) {
    return { addressId: String(Number(String(voucherInvoiceId.value).trim())) }
  }
  if (isDolibarrRowId(voucherPresetInvoiceId.value)) {
    return { addressId: String(Number(String(voucherPresetInvoiceId.value).trim())) }
  }
  return buildAddressPayload(invoiceAddress.value, ADDRESS_MODE_INVOICE)
}

function buildDeliveryPayload() {
  if (voucherForcesInvoiceAddress.value) {
    return buildAddressPayload(deliveryAddress.value, ADDRESS_MODE_DELIVERY)
  }
  if (!deliveryAddressDifferent.value) {
    return { sameAsInvoice: true }
  }
  return buildAddressPayload(deliveryAddress.value, ADDRESS_MODE_DELIVERY)
}

/** Delivery address is valid when an existing one is selected or new address has at least street/city/country. */
function isDeliveryAddressValid() {
  if (voucherForcesInvoiceAddress.value) {
    return !!buildAddressPayload(deliveryAddress.value, ADDRESS_MODE_DELIVERY)
  }
  if (!deliveryAddressDifferent.value) return isInvoiceAddressValid()
  return !!buildAddressPayload(deliveryAddress.value, ADDRESS_MODE_DELIVERY)
}

function syncDeliveryRequiredForVoucherInvoice() {
  if (!voucherForcesInvoiceAddress.value) return
  deliveryAddressDifferent.value = true
}

/** Invoice address is valid when voucher forces it (and we have id), or same as delivery. */
function isInvoiceAddressValid() {
  if (voucherType.value === '1') return isDolibarrRowId(voucherInvoiceId.value)
  if (isDolibarrRowId(voucherPresetInvoiceId.value)) return true
  return !!buildAddressPayload(invoiceAddress.value, ADDRESS_MODE_INVOICE)
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

/**
 * Lock season set count from voucher form_preset (seasonSetCount / num_boards)
 * or Versandvorlage via API field force_numberOfBoards (top-level on validate response).
 * @returns {boolean} whether count was locked
 */
function applyVoucherSeasonSetLock(sources) {
  const setsNum = extractLockedSeasonSetCount(sources)
  if (setsNum == null) return false
  presetSeasonSetCount.value = setsNum
  wizardSeasonSetCount.value = setsNum
  return true
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
      presetPupilsCount.value = pupilsNum
    }
    presetBranch = 'edition_future'
  } else if (program === 6 || program === 7) {
    edition.value = 'future'
    futureGroup.value = program === 7 ? '8' : (FUTURE_GROUP_5_ENABLED ? '5' : null)
    const pupilsNum = Number(data.pupils)
    if (Number.isFinite(pupilsNum) && FUTURE_PUPIL_OPTIONS.includes(pupilsNum)) {
      futurePupils.value = pupilsNum
      presetPupilsCount.value = pupilsNum
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

  applyVoucherSeasonSetLock(data)
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
    futureTeamEvents.value = Array.from({ length: teamCount }, () => ({ eventId: evId, name: '' }))
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
    syncDeliveryRequiredForVoucherInvoice()
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
    if (shouldSkipSeasonSetsWizardStep.value) return 6
    return 5
  }
  if (edition.value === 'founders') {
    if (!foundersVariant.value) return 2
    if (!foundersType.value) return 3
    if (!hasRequiredInstitutionFields()) return 4
    if (foundersTeamHasParticipantsStep.value) {
      if (!hasRequiredTeamName()) return 6
      return 7
    }
    if (foundersNeedsSeasonSets.value) {
      if (shouldSkipSeasonSetsWizardStep.value) return foundersAddressesStep.value
      return foundersSeasonSetsStep.value
    }
    return foundersAddressesStep.value
  }
  return 1
}

let voucherValidateTimer = null
let voucherValidateSeq = 0

function clearVoucherValidationState() {
  voucherValid.value = null
  voucherMessage.value = ''
  voucherType.value = null
  voucherInvoiceId.value = null
  voucherInvoiceName.value = null
  voucherPresetInvoiceId.value = null
  voucherPresetInvoiceName.value = null
  presetSeasonSetCount.value = null
  wizardSeasonSetCount.value = 1
  presetPupilsCount.value = null
  presetRegisterEventTeams.value = null
  presetEventTeamCount.value = null
}

function scheduleVoucherValidation(delayMs = 450) {
  if (voucherValidateTimer) clearTimeout(voucherValidateTimer)
  voucherValidateTimer = setTimeout(() => {
    voucherValidateTimer = null
    validateVoucherCode()
  }, delayMs)
}

function onVoucherInput() {
  clearVoucherValidationState()
  const code = voucher.value?.trim()
  if (!code) {
    if (voucherValidateTimer) {
      clearTimeout(voucherValidateTimer)
      voucherValidateTimer = null
    }
    return
  }
  scheduleVoucherValidation()
}

function onVoucherBlur() {
  const code = voucher.value?.trim()
  if (!code) {
    clearVoucherValidationState()
    if (voucherValidateTimer) {
      clearTimeout(voucherValidateTimer)
      voucherValidateTimer = null
    }
    return
  }
  if (voucherValidateTimer) {
    clearTimeout(voucherValidateTimer)
    voucherValidateTimer = null
    validateVoucherCode()
    return
  }
  if (voucherValid.value === null && !voucherChecking.value) {
    validateVoucherCode()
  }
}

async function validateVoucherCode() {
  const code = voucher.value?.trim()
  if (!code) {
    clearVoucherValidationState()
    return
  }
  const seq = ++voucherValidateSeq
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
  presetPupilsCount.value = null
  presetRegisterEventTeams.value = null
  presetEventTeamCount.value = null
  try {
    const result = await validateVoucher(code)
    if (seq !== voucherValidateSeq) return
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
      if (body) applyVoucherSeasonSetLock(body)
      syncDeliveryRequiredForVoucherInvoice()
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

    if (result.valid && voucherValid.value === true && props.open && step.value === 0 && introSubStep.value === 'voucher' && hasVoucherCode.value === 'yes') {
      nextTick(() => {
        if (canNext()) next()
      })
    }
  } catch (err) {
    if (seq !== voucherValidateSeq) return
    voucherValid.value = false
    voucherMessage.value = t('enroll.voucherInvalid')
    console.warn('[EnrollWizard][voucher] validate: request failed', { code, err })
  } finally {
    if (seq === voucherValidateSeq) voucherChecking.value = false
  }
}

async function submit() {
  if (edition.value === 'founders' && foundersType.value === 'team' && !formData.value.name?.trim()) {
    error.value = t('wizard.nameRequired')
    return
  }
  if (edition.value === 'founders' && foundersType.value === 'team' && nameValidation.value.blocked) {
    error.value = t('wizard.nameBlocked')
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
        deliverySameAsInvoice: !deliveryAddressDifferent.value,
        invoiceAddress: buildInvoicePayload(),
        consentDataProcessing: true,
        consentTerms: true,
        newsletterOptIn: !!consentNewsletter.value,
        ...buildParticipationPayload(),
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
            const name = String(entry?.name ?? '').trim()
            if (!Number.isFinite(evId) || evId <= 0 || !name) return null
            return { index: index + 1, eventId: evId, name }
          })
          .filter(Boolean)
        if (teamEventsPayload.length) {
          payload.eventTeams = teamEventsPayload
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
        deliverySameAsInvoice: !deliveryAddressDifferent.value,
        invoiceAddress: invoicePayload ?? undefined,
        consentDataProcessing: true,
        consentTerms: true,
        newsletterOptIn: !!consentNewsletter.value,
        ...buildParticipationPayload(),
      }
      const sc = effectiveSeasonSetCount.value
      payload.seasonSetCount = sc
      payload.num_boards = sc
      if (isTeam && founderTeamEventId.value) {
        const evId = Number(founderTeamEventId.value)
        if (Number.isFinite(evId) && evId > 0) payload.eventId = evId
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
  if (voucherValidateTimer) clearTimeout(voucherValidateTimer)
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
  if (step.value !== 7) return
  if (val) nextTick(() => next())
})

watch([step, foundersTeamNameStepIndex], () => {
  if (!props.open || foundersTeamNameStepIndex.value < 0 || step.value !== foundersTeamNameStepIndex.value) return
  nextTick(() => {
    document.getElementById('wizard-founder-team-name')?.focus?.()
  })
})

// Trigger name validation whenever the team name changes
watch(
  () => formData.value.name,
  () => {
    if (foundersType.value !== 'team') return
    nameValidationIgnored.value = false
    scheduleNameValidation()
  },
)

// Re-run for duplicate check when event is selected (step 7)
watch(founderTeamEventId, (eventId) => {
  if (foundersType.value !== 'team' || !formData.value.name?.trim()) return
  scheduleNameValidation(eventId)
})

watch(
  () => [formData.value.country, formData.value.zip],
  () => {
    institutionZipPlaceSelected = false
    institutionZipPlaces.value = []
    if (zipLookupTimer) clearTimeout(zipLookupTimer)
    zipLookupTimer = setTimeout(() => {
      lookupInstitutionPlaces()
    }, 350)
  },
)

watch(voucherForcesInvoiceAddress, (forced) => {
  if (forced) syncDeliveryRequiredForVoucherInvoice()
})

watch(deliveryAddressDifferent, (different) => {
  if (voucherForcesInvoiceAddress.value && !different) {
    deliveryAddressDifferent.value = true
  }
})
</script>

<template>
  <div v-if="open" class="wizard-backdrop" @click.self="close">
    <div class="wizard-modal liquid-surface-scope" role="dialog" aria-modal="true" aria-labelledby="wizard-title">
      <div class="wizard-hero">
        <div class="wizard-hero-content">
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
          <!-- Progress only after voucher step: totalSteps/edition are unknown until then. -->
          <template v-if="step > 0">
            <div class="wizard-hero-progress">
              <div class="wizard-progress-bar" role="progressbar" :aria-valuenow="progress" aria-valuemin="0" aria-valuemax="100">
                <span :style="{ width: `${progress}%` }"></span>
              </div>
              <p class="wizard-step-label">{{ stepTitle }} ({{ step + 1 }}/{{ totalSteps }})</p>
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
        <div class="wizard-sticky-top">
          <div class="wizard-header">
            <!--<button type="button" class="wizard-close" aria-label="Close" @click="close">
              <i class="bi bi-x-lg"></i>
            </button>-->
            <button type="button" class="btn btn-ghost" :disabled="step === 0 && introSubStep === 'fll'" @click="goWizardBack">
              <i class="bi bi-arrow-left"></i> <I18nText k="wizard.back" />
            </button>
            <button v-if="step < lastStep" type="button" class="btn btn-primary" :disabled="step !== institutionStepIndex && step !== foundersTeamNameStepIndex && step !== participantsStepIndex && !canNext()" @click="next">
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

        <div class="wizard-panel-main">
          <div class="wizard-scroll">
            <div class="wizard-body" :class="{ 'wizard-body--center-options': centeredOptionStep }">
          <!-- Step 0a: FLL experience -->
          <div
            v-show="step === 0 && introSubStep === 'fll'"
            class="wizard-step wizard-step-voucher wizard-step-animate"
            :class="{ 'wizard-step-voucher--choice': fllParticipatedBefore === null }"
          >
            <div class="wizard-step-voucher-inner">
              <p class="wizard-question"><I18nText k="wizard.fllParticipatedQuestion" /></p>
              <div v-if="fllParticipatedBefore === null" class="wizard-options wizard-options-stack">
                <button type="button" class="wizard-option wizard-option-card" @click="selectFllParticipatedBefore('yes')">
                  <div class="wizard-option-main"><I18nText k="wizard.fllParticipatedYes" /></div>
                </button>
                <button type="button" class="wizard-option wizard-option-card" @click="selectFllParticipatedBefore('no')">
                  <div class="wizard-option-main"><I18nText k="wizard.fllParticipatedNo" /></div>
                </button>
              </div>
              <template v-else-if="fllParticipatedBefore === 'no'">
                <p class="wizard-question wizard-question--follow"><I18nText k="wizard.reasonAttentionQuestion" /></p>
                <p class="wizard-hint"><I18nText k="wizard.reasonAttentionHint" /></p>
                <div class="wizard-options wizard-options-stack wizard-options-reason">
                  <button
                    v-for="opt in REASON_ATTENTION_OPTIONS"
                    :key="opt.value"
                    type="button"
                    class="wizard-option wizard-option-card"
                    :class="{ active: reasonAttention === opt.value }"
                    @click="selectReasonAttention(opt.value)"
                  >
                    <div class="wizard-option-main"><I18nText :k="opt.labelKey" /></div>
                  </button>
                </div>
                <button type="button" class="btn btn-ghost wizard-back-link" @click="fllParticipatedBefore = null; reasonAttention = null">
                  <i class="bi bi-arrow-left"></i> <I18nText k="wizard.fllParticipatedBack" />
                </button>
              </template>
            </div>
          </div>

          <!-- Step 0b: Voucher-Code / Direkteinstieg -->
          <div
            v-show="step === 0 && introSubStep === 'voucher'"
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
                <div class="wizard-form-field wizard-voucher-field">
                  <label class="wizard-form-field-label"><I18nText k="enroll.voucherCodeLabel" /></label>
                  <input
                    v-model="voucher"
                    type="text"
                    class="wizard-form-field-input liquid-surface-control liquid-surface-control--accent-blue"
                    :class="{ 'liquid-surface-control--invalid': voucherValid === false }"
                    :placeholder="t('enroll.placeholderVoucherCode')"
                    autocomplete="off"
                    autocapitalize="characters"
                    spellcheck="false"
                    autofocus
                    @input="onVoucherInput"
                    @blur="onVoucherBlur"
                  >
                  <p v-if="voucherChecking" class="field-hint checking"><i class="bi bi-arrow-repeat spin"></i> <I18nText k="enroll.voucherChecking" /></p>
                  <p v-else-if="voucherValid === true" class="field-hint valid"><i class="bi bi-check-circle-fill"></i> {{ voucherMessage }}</p>
                  <p v-else-if="voucherValid === false" class="field-hint invalid"><i class="bi bi-exclamation-circle-fill"></i> {{ voucherMessage }}</p>
                </div>
                <button type="button" class="btn btn-ghost wizard-back-link" @click="hasVoucherCode = null; voucher = ''; clearVoucherValidationState()">
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

          <!-- Step 3 (Future) / Step 4 (Founders): Institution (same layout for all programs) -->
          <div
            v-show="(step === 3 && edition === 'future') || (step === 4 && edition === 'founders')"
            class="wizard-step wizard-step-form wizard-step-institution wizard-step-animate"
          >
            <p class="wizard-form-section-title"><I18nText k="wizard.stepInstitution" /></p>
            <div class="wizard-institution-intro">
              <p class="wizard-institution-intro-text"><I18nText k="wizard.institutionLead" /></p>
              <p class="wizard-institution-intro-meta"><I18nText k="wizard.requiredLegend" /></p>
            </div>
            <div
              v-if="edition === 'future' || foundersType === 'class' || foundersType === 'team'"
              class="wizard-institution-fields"
            >
              <div
                class="wizard-form-field"
                :class="{ 'wizard-form-field--invalid': step4ValidationAttempted && isInstitutionFieldMissing('schoolType') }"
              >
                <label class="wizard-form-field-label" for="wizard-institution-type">
                  <I18nText k="enroll.schoolType" /> <span class="required">*</span>
                </label>
                <CustomSelect
                  id="wizard-institution-type"
                  v-model="formData.schoolType"
                  surface
                  surface-accent
                  :options="schoolTypeWizardOptions"
                  :placeholder="t('schoolTypes.none')"
                />
                <p v-if="step4ValidationAttempted && isInstitutionFieldMissing('schoolType')" class="wizard-form-field-error">
                  <I18nText k="common.requiredField" />
                </p>
              </div>
              <div
                class="wizard-form-field"
                :class="{ 'wizard-form-field--invalid': step4ValidationAttempted && isInstitutionFieldMissing('organization') }"
              >
                <label class="wizard-form-field-label" for="wizard-institution-name">
                  <I18nText k="enroll.schoolName" /> <span class="required">*</span>
                </label>
                <input
                  id="wizard-institution-name"
                  v-model="formData.organization"
                  type="text"
                  class="wizard-form-field-input liquid-surface-control liquid-surface-control--accent-blue"
                  :class="{ 'liquid-surface-control--invalid': step4ValidationAttempted && isInstitutionFieldMissing('organization') }"
                  :disabled="isPrivateInstitution"
                  autocomplete="off"
                >
                <p v-if="step4ValidationAttempted && isInstitutionFieldMissing('organization')" class="wizard-form-field-error">
                  <I18nText k="common.requiredField" />
                </p>
              </div>
              <div
                class="wizard-form-field"
                :class="{ 'wizard-form-field--invalid': step4ValidationAttempted && isInstitutionFieldMissing('country') }"
              >
                <label class="wizard-form-field-label" for="wizard-institution-country">
                  <I18nText k="enroll.schoolCountry" /> <span class="required">*</span>
                </label>
                <CustomSelect
                  id="wizard-institution-country"
                  v-model="formData.country"
                  surface
                  surface-accent
                  :options="countryWizardSelectOptions"
                  :placeholder="t('enroll.selectCountry')"
                />
                <p v-if="step4ValidationAttempted && isInstitutionFieldMissing('country')" class="wizard-form-field-error">
                  <I18nText k="common.requiredField" />
                </p>
              </div>
              <div
                class="wizard-form-field"
                :class="{ 'wizard-form-field--invalid': step4ValidationAttempted && isInstitutionFieldMissing('zip') }"
              >
                <label class="wizard-form-field-label" for="wizard-institution-zip">
                  <I18nText k="enroll.schoolZip" /> <span class="required">*</span>
                </label>
                <input
                  id="wizard-institution-zip"
                  v-model="formData.zip"
                  type="text"
                  class="wizard-form-field-input liquid-surface-control liquid-surface-control--accent-blue"
                  :class="{ 'liquid-surface-control--invalid': step4ValidationAttempted && isInstitutionFieldMissing('zip') }"
                  inputmode="numeric"
                  autocomplete="off"
                >
                <p v-if="step4ValidationAttempted && isInstitutionFieldMissing('zip')" class="wizard-form-field-error">
                  <I18nText k="common.requiredField" />
                </p>
                <div v-if="institutionZipLoading" class="wizard-zip-lookup-state">
                  <i class="bi bi-arrow-repeat spin" aria-hidden="true" />
                  <I18nText k="enroll.addressLookupLoading" />
                </div>
                <template v-else-if="institutionZipPlaces.length > 1">
                  <p class="wizard-zip-place-prompt">
                    <I18nText k="enroll.selectPlaceFromList" />
                  </p>
                  <div class="wizard-zip-place-list" role="listbox">
                    <button
                      v-for="(place, idx) in institutionZipPlaces"
                      :key="'wizard-inst-zip-' + idx"
                      type="button"
                      class="wizard-zip-place-item"
                      @mousedown.prevent
                      @click="applyInstitutionPlace(place)"
                    >
                      <span class="wizard-zip-place-item-main">{{ place.postalCode }} {{ place.city }}</span>
                      <span v-if="place.state" class="wizard-zip-place-item-sub">{{ place.state }}</span>
                    </button>
                  </div>
                  <p
                    v-if="step4ValidationAttempted && institutionPlaceSelectionPending()"
                    class="wizard-form-field-error"
                  >
                    <I18nText k="enroll.selectPlaceFromList" />
                  </p>
                </template>
              </div>
              <div
                v-if="(formData.city || formData.state) && institutionZipPlaces.length <= 1"
                class="wizard-institution-place liquid-surface liquid-surface--radius-lg liquid-surface--accent liquid-surface--accent-blue"
              >
                <span class="wizard-institution-place-label"><I18nText k="enroll.location" /></span>
                <span class="wizard-institution-place-value">{{ [formData.city, formData.state].filter(Boolean).join(', ') }}</span>
              </div>
            </div>
          </div>

          <!-- Step 4 (Future): pupils -->
          <div v-show="step === 4 && edition === 'future'" class="wizard-step wizard-step-animate wizard-step-pupils">
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
          </div>

          <!-- Step 5 (Founders team): team name — centered, prominent -->
          <div
            v-show="step === foundersTeamNameStepIndex"
            class="wizard-step wizard-step-animate wizard-step-team-name"
          >
            <div class="wizard-team-name-hero">
              <p class="wizard-question"><I18nText k="wizard.teamNameQuestion" /></p>
              <p class="wizard-hint"><I18nText k="wizard.teamNameHint" /></p>
              <div
                class="wizard-form-field wizard-team-name-field"
                :class="{ 'wizard-form-field--invalid': (step4ValidationAttempted && isStep4RequiredFieldMissing('name')) || nameValidation.blocked }"
              >
                <label class="wizard-form-field-label wizard-team-name-label" for="wizard-founder-team-name">
                  <I18nText k="enrollTeam.teamName" /> <span class="required">*</span>
                </label>
                <input
                  id="wizard-founder-team-name"
                  v-model="formData.name"
                  type="text"
                  class="wizard-form-field-input liquid-surface-control liquid-surface-control--accent-blue wizard-team-name-input"
                  :class="{ 'liquid-surface-control--invalid': (step4ValidationAttempted && isStep4RequiredFieldMissing('name')) || nameValidation.blocked }"
                  :placeholder="t('wizard.teamNamePlaceholder')"
                  autocomplete="organization"
                  @keydown.enter.prevent="next()"
                >
                <p v-if="step4ValidationAttempted && isStep4RequiredFieldMissing('name')" class="wizard-form-field-error">
                  <I18nText k="common.requiredField" />
                </p>
                <!-- Hard block: name is on the blacklist -->
                <p v-else-if="nameValidation.blocked" class="wizard-form-field-error">
                  <I18nText k="wizard.nameBlocked" />
                </p>
                <!-- Soft warning: name looks like a placeholder -->
                <p v-else-if="nameValidation.warning && nameValidation.warningType === 'placeholder' && !nameValidationIgnored" class="wizard-name-warning">
                  <I18nText k="wizard.namePlaceholderWarning" />
                  <button type="button" class="wizard-name-warning-dismiss" @click="nameValidationIgnored = true">
                    <I18nText k="wizard.nameWarningProceed" />
                  </button>
                </p>
                <!-- Soft warning: duplicate name at selected event -->
                <p v-else-if="nameValidation.warning && nameValidation.warningType === 'duplicate' && !nameValidationIgnored" class="wizard-name-warning">
                  <I18nText k="wizard.nameDuplicateWarning" />
                  <button type="button" class="wizard-name-warning-dismiss" @click="nameValidationIgnored = true">
                    <I18nText k="wizard.nameWarningProceed" />
                  </button>
                </p>
              </div>
            </div>
          </div>

          <!-- Step 6 (Founders team): participants -->
          <div
            v-show="step === participantsStepIndex && foundersTeamHasParticipantsStep"
            class="wizard-step wizard-step-form wizard-step-animate"
          >
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
          </div>

          <!-- Season sets (Future step 5 / Founders class / Founder team) -->
          <div
            v-show="!shouldSkipSeasonSetsWizardStep && ((step === 5 && edition === 'future') || (edition === 'founders' && foundersNeedsSeasonSets && step === foundersSeasonSetsStep))"
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
                <div class="wizard-option-desc">{{ formatSeasonSetOptionPrice(0) }}</div>
              </button>
              <button
                type="button"
                class="wizard-option wizard-option-card"
                :class="{ active: wizardSeasonSetCount === 1 }"
                @click="selectWizardSeasonSetCount(1)"
              >
                <div class="wizard-option-main"><I18nText k="enrollFuture.seasonOne" /></div>
                <div class="wizard-option-desc">{{ formatSeasonSetOptionPrice(1) }}</div>
              </button>
              <button
                type="button"
                class="wizard-option wizard-option-card"
                :class="{ active: wizardSeasonSetCount === 2 }"
                @click="selectWizardSeasonSetCount(2)"
              >
                <div class="wizard-option-main"><I18nText k="enrollFuture.seasonTwo" /></div>
                <div class="wizard-option-desc">{{ formatSeasonSetOptionPrice(2) }}</div>
              </button>
            </div>
          </div>

          <!-- Step 5 (Founders team): event selection — comes before team name for duplicate check -->
          <div v-show="step === 5 && foundersTeamHasParticipantsStep" class="wizard-step wizard-step-form wizard-step-animate">
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
            <!-- Duplicate team name warning for the selected event -->
            <p
              v-if="founderTeamEventId && nameValidation.warning && nameValidation.warningType === 'duplicate' && !nameValidationIgnored"
              class="wizard-name-warning wizard-name-warning--event-step"
            >
              <I18nText k="wizard.nameDuplicateWarning" />
              <button type="button" class="wizard-name-warning-dismiss" @click="nameValidationIgnored = true">
                <I18nText k="wizard.nameWarningProceed" />
              </button>
            </p>
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
                      :class="{ active: futureEventTeamCount === count }"
                      @click="selectFutureEventTeamCount(count)"
                    >
                      {{ count }} {{ count === 1 ? t('wizard.teamSingular') : t('wizard.teamsPlural') }}
                    </button>
                  </div>
                  <div v-if="futureTeamAutoUpgrade" class="wizard-event-team-upgrade">
                    <p>
                      <I18nText
                        k="wizard.eventTeamAutoUpgraded"
                        :args="{ teams: futureTeamAutoUpgrade.teams, pupils: futureTeamAutoUpgrade.pupils }"
                      />
                    </p>
                  </div>
                  <p v-if="futureTeamPillsShowExpandHint" class="wizard-hint wizard-event-team-expand-hint">
                    <I18nText k="wizard.onSiteEventTeamsExpandHint" />
                  </p>
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
                        <div class="wizard-event-team-combined-body">
                          <div class="wizard-event-team-name-field wizard-form-field">
                            <label class="wizard-form-field-label">
                            <I18nText :k="futureEventTeamCount > 1 ? 'wizard.futureEventTeamNameLabel' : 'wizard.futureEventTeamNameLabelSolo'" />
                          </label>
                          <input
                            v-model="entry.name"
                            type="text"
                            class="wizard-form-field-input liquid-surface-control liquid-surface-control--accent-blue wizard-event-team-name-input"
                            :placeholder="t('wizard.futureEventTeamNamePlaceholder')"
                            autocomplete="off"
                          >
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
                  </div>
                </div>
                <button
                  v-if="futureOnSiteEvent !== 'yes'"
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
              <template v-if="voucherType === '1' || voucherPresetInvoiceId != null">
                <h4 class="wizard-address-title"><I18nText k="enroll.invoiceAddress" /></h4>
                <div class="field voucher-invoice-forced">
                  <p class="field-hint valid voucher-forced-msg"><i class="bi bi-info-circle-fill"></i> <I18nText k="enroll.voucherInvoiceForced" /> <span v-if="voucherInvoiceName || voucherPresetInvoiceName">({{ voucherInvoiceName || voucherPresetInvoiceName }})</span></p>
                </div>
              </template>
              <AddressSelector
                v-else
                v-model="invoiceAddress"
                mode="invoice"
                :addresses="invoiceAddresses"
                :label="t('enroll.invoiceAddress')"
                id-prefix="wizard-invoice"
              />
            </div>
            <div class="wizard-address-section">
              <p v-if="voucherForcesInvoiceAddress" class="wizard-hint wizard-hint-required">
                <i class="bi bi-info-circle"></i> <I18nText k="wizard.deliveryRequiredVoucherInvoice" />
              </p>
              <label v-else class="wizard-delivery-toggle">
                <input v-model="deliveryAddressDifferent" type="checkbox">
                <span><I18nText k="wizard.deliveryDifferentToggle" /></span>
              </label>

              <div style="margin-bottom: .5rem;">
                <h4><I18nText k="enroll.deliveryNoteHeading" /></h4>
                <p><I18nText k="enroll.deliveryNote" /></p>
              </div>

              <AddressSelector
                v-if="deliveryAddressDifferent || voucherForcesInvoiceAddress"
                v-model="deliveryAddress"
                mode="delivery"
                :addresses="deliveryAddresses"
                :label="t('enroll.deliveryAddress')"
                id-prefix="wizard-delivery"
              />
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
              <div v-if="summaryVoucherCode" class="wizard-cart-row">
                <span><I18nText k="enroll.voucher" /></span>
                <strong>{{ summaryVoucherCode }}</strong>
              </div>
              <div class="wizard-cart-divider" role="presentation" />
              <h4 class="wizard-cart-subtitle"><I18nText k="wizard.orderPricesHeading" /></h4>
              <p v-if="pricingLoading" class="wizard-hint"><I18nText k="wizard.pricingLoading" /></p>
              <p v-else-if="!pricingUseApi" class="wizard-hint"><I18nText k="wizard.pricingUnavailable" /></p>
              <template v-else>
                <div
                  v-for="(line, li) in pricingDisplayLines"
                  :key="'future-price-' + li"
                  class="wizard-cart-row wizard-cart-row--price"
                >
                  <span class="wizard-cart-line-label">
                    <span class="wizard-cart-product-name">{{ quoteLineProductName(line) || '—' }}</span>
                    <span v-if="line.category === 'group' && futurePupils != null" class="wizard-cart-muted">
                      · {{ futurePupils }} <I18nText k="enrollFuture.pupils" />
                    </span>
                    <span v-else-if="Number(line.qty) > 0" class="wizard-cart-muted">
                      · {{ line.qty }}×
                    </span>
                    <span v-if="line.free" class="wizard-cart-muted"> · <I18nText k="wizard.priceFree" /></span>
                  </span>
                  <span class="wizard-price-amounts">
                    <span v-if="pricingLineShowsWasPrice(line)" class="wizard-price-was">{{ formatWizardEur(line.catalogGrossEur) }}</span>
                    <strong>{{ formatWizardEur(line.lineGrossEur) }}</strong>
                  </span>
                </div>
                <div v-if="!deliveryCountryConfirmed" class="wizard-cart-row wizard-cart-row--price">
                  <span><I18nText k="wizard.shippingPending" /></span>
                  <span class="wizard-cart-muted"><I18nText k="wizard.shippingPendingNote" /></span>
                </div>
                <div v-if="futureOnSiteEvent !== 'yes'" class="wizard-cart-row wizard-cart-row--price">
                  <span><I18nText k="wizard.orderPriceEventLater" /></span>
                  <strong>{{ formatWizardEur(0) }}</strong>
                </div>
                <div class="wizard-cart-row wizard-cart-row--price wizard-cart-row--total">
                  <span><I18nText k="wizard.orderPriceTotal" /></span>
                  <strong>{{ formatWizardEur(pricingTotalGrossEur) }}</strong>
                </div>
              </template>
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
                <li><I18nText k="wizard.nextStepsItemEmailConfirmation" /></li>
                <li><I18nText k="wizard.nextStepsItemManage" /></li>
                <li><I18nText k="wizard.nextStepsItemStatus" /></li>
              </ul>
            </div>
          </div>

          <!-- Step 7: Addresses (Founders class) / Step 8: Addresses (Founder team) -->
          <div
            v-show="edition === 'founders' && step === foundersAddressesStep"
            class="wizard-step wizard-step-form wizard-step-animate"
          >
            <p v-if="!areAddressesValid()" class="wizard-hint wizard-hint-required"><i class="bi bi-info-circle"></i> <I18nText k="wizard.addressesRequiredHint" /></p>
            <div class="wizard-address-section">
              <template v-if="voucherType === '1' || voucherPresetInvoiceId != null">
                <h4 class="wizard-address-title"><I18nText k="enroll.invoiceAddress" /></h4>
                <div class="field voucher-invoice-forced">
                  <p class="field-hint valid voucher-forced-msg"><i class="bi bi-info-circle-fill"></i> <I18nText k="enroll.voucherInvoiceForced" /> <span v-if="voucherInvoiceName || voucherPresetInvoiceName">({{ voucherInvoiceName || voucherPresetInvoiceName }})</span></p>
                </div>
              </template>
              <AddressSelector
                v-else
                v-model="invoiceAddress"
                mode="invoice"
                :addresses="invoiceAddresses"
                :label="t('enroll.invoiceAddress')"
                id-prefix="wizard-invoice"
              />
            </div>
            <div class="wizard-address-section">
              <p v-if="voucherForcesInvoiceAddress" class="wizard-hint wizard-hint-required">
                <i class="bi bi-info-circle"></i> <I18nText k="wizard.deliveryRequiredVoucherInvoice" />
              </p>
              <label v-else class="wizard-delivery-toggle">
                <input v-model="deliveryAddressDifferent" type="checkbox">
                <span><I18nText k="wizard.deliveryDifferentToggle" /></span>
              </label>
              <div v-if="voucherForcesInvoiceAddress" style="margin-bottom: .5rem;">
                <h4><I18nText k="enroll.deliveryNoteHeading" /></h4>
                <p><I18nText k="enroll.deliveryNote" /></p>
              </div>
              <AddressSelector
                v-if="deliveryAddressDifferent || voucherForcesInvoiceAddress"
                v-model="deliveryAddress"
                mode="delivery"
                :addresses="deliveryAddresses"
                :label="t('enroll.deliveryAddress')"
                id-prefix="wizard-delivery"
              />
            </div>
          </div>

          <!-- Step 8: Order (Founders class) / Step 9: Order (Founder team) -->
          <div
            v-show="edition === 'founders' && step === foundersOrderStep"
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
              <div v-if="foundersNeedsSeasonSets" class="wizard-cart-row">
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
              <div v-if="summaryVoucherCode" class="wizard-cart-row">
                <span><I18nText k="enroll.voucher" /></span>
                <strong>{{ summaryVoucherCode }}</strong>
              </div>
              <div class="wizard-cart-divider" role="presentation" />
              <h4 class="wizard-cart-subtitle"><I18nText k="wizard.orderPricesHeading" /></h4>
              <p v-if="pricingLoading" class="wizard-hint"><I18nText k="wizard.pricingLoading" /></p>
              <p v-else-if="!pricingUseApi" class="wizard-hint"><I18nText k="wizard.pricingUnavailable" /></p>
              <template v-else>
                <div
                  v-for="(line, li) in pricingDisplayLines"
                  :key="'founders-price-' + li"
                  class="wizard-cart-row wizard-cart-row--price"
                >
                  <span class="wizard-cart-line-label">
                    <span class="wizard-cart-product-name">{{ quoteLineProductName(line) || '—' }}</span>
                    <span v-if="Number(line.qty) > 0" class="wizard-cart-muted">
                      · {{ line.qty }}×
                    </span>
                    <span v-if="line.free" class="wizard-cart-muted"> · <I18nText k="wizard.priceFree" /></span>
                  </span>
                  <span class="wizard-price-amounts">
                    <span v-if="pricingLineShowsWasPrice(line)" class="wizard-price-was">{{ formatWizardEur(line.catalogGrossEur) }}</span>
                    <strong>{{ formatWizardEur(line.lineGrossEur) }}</strong>
                  </span>
                </div>
                <div v-if="!deliveryCountryConfirmed" class="wizard-cart-row wizard-cart-row--price">
                  <span><I18nText k="wizard.shippingPending" /></span>
                  <span class="wizard-cart-muted"><I18nText k="wizard.shippingPendingNote" /></span>
                </div>
                <div class="wizard-cart-row wizard-cart-row--price wizard-cart-row--total">
                  <span><I18nText k="wizard.orderPriceTotal" /></span>
                  <strong>{{ formatWizardEur(pricingTotalGrossEur) }}</strong>
                </div>
              </template>
              <p class="wizard-hint wizard-pricing-disclaimer">
                <I18nText k="enrollFuture.pricingDisclaimer" />
              </p>
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
                <li><I18nText k="wizard.nextStepsItemEmailConfirmation" /></li>
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
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wizard-backdrop {
  position: fixed;
  inset: 0;
  height: 100%;
  height: 100dvh;
  max-height: 100dvh;
  background: radial-gradient(circle at top, rgba(37, 99, 235, 0.08), transparent 55%),
    radial-gradient(circle at 20% 20%, rgba(16, 185, 129, 0.06), transparent 50%),
    var(--liquid-modal-scrim-bg, rgba(6, 6, 8, 0.78));
  backdrop-filter: blur(var(--liquid-blur)) saturate(calc(var(--liquid-saturate) * 0.92));
  -webkit-backdrop-filter: blur(var(--liquid-blur)) saturate(calc(var(--liquid-saturate) * 0.92));
  display: flex;
  align-items: stretch;
  justify-content: stretch;
  z-index: 9999;
  overflow: hidden;
}
.wizard-modal {
  width: 100%;
  height: 100%;
  min-height: 0;
  max-height: 100dvh;
  display: grid;
  grid-template-columns: minmax(18rem, 38%) minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  background: var(--wizard-shell-fill);
  box-shadow: var(--liquid-shadow);
  overflow: hidden;
  animation: wizardFadeIn 0.35s ease;
}
.wizard-sticky-top {
  flex-shrink: 0;
  z-index: 50;
  background: color-mix(in srgb, var(--wizard-shell-fill) 96%, transparent);
  backdrop-filter: blur(calc(var(--liquid-blur) * 0.5)) saturate(1.12);
  -webkit-backdrop-filter: blur(calc(var(--liquid-blur) * 0.5)) saturate(1.12);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.08);
  border-bottom: 1px solid var(--liquid-border);
}
html[data-theme='dark'] .wizard-sticky-top {
  box-shadow: 0 10px 32px rgba(0, 0, 0, 0.35);
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

.wizard-close i {
  font-size: 1.35rem;
}
/* Panel: sticky nav on top + scrollable step content below */
.wizard-body {
  flex: 0 1 auto;
  min-height: 0;
  overflow: visible;
  padding: 1.5rem 2rem 1.25rem;
  display: flex;
  flex-direction: column;
}
.wizard-body--center-options {
  justify-content: flex-start;
}
.wizard-panel-main {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.wizard-scroll {
  flex: 1 1 auto;
  min-height: 0;
  display: block;
  overflow-x: hidden;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  touch-action: pan-y;
  scrollbar-gutter: stable;
  padding-bottom: max(1.25rem, env(safe-area-inset-bottom, 0px));
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--color-text-muted) 35%, transparent) transparent;
}
.wizard-scroll::-webkit-scrollbar {
  width: 6px;
}
.wizard-scroll::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-text-muted) 28%, transparent);
}
.wizard-step {
  min-height: 0;
  flex: 0 1 auto;
}
.wizard-step:not(.wizard-step-form) {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: min(70vh, 100dvh);
}
.wizard-step:not(.wizard-step-form) .wizard-options {
  width: 100%;
  max-width: 36rem;
  margin: 0 auto;
}
/* Founders team name — centered hero step */
.wizard-step-team-name {
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: min(65vh, 100dvh);
  text-align: center;
}
.wizard-team-name-hero {
  width: 100%;
  max-width: 32rem;
  margin: 0 auto;
}
.wizard-step-team-name .wizard-question {
  margin-bottom: 0.35rem;
  font-size: 1.35rem;
  line-height: 1.35;
}
.wizard-step-team-name .wizard-hint {
  margin: 0 auto 1.5rem;
  max-width: 26rem;
}
.wizard-team-name-field {
  text-align: left;
  margin-top: 0.25rem;
}
.wizard-team-name-label {
  justify-content: center;
  text-align: center;
  font-size: 0.95rem;
}
.wizard-team-name-input {
  font-size: 1.4rem;
  line-height: 1.35;
  text-align: center;
  padding: 1rem 1.25rem;
  min-height: 3.25rem;
}
.wizard-team-name-input::placeholder {
  text-align: center;
  opacity: 0.55;
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
.wizard-voucher-code-form .wizard-voucher-field {
  margin-bottom: 0;
  max-width: 100%;
}
.wizard-voucher-code-form .field-hint {
  margin: 0.35rem 0 0;
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
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.5rem;
  margin-bottom: 1rem;
}
.wizard-event-team-count-pill {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 3.1rem;
  padding: 0.5rem 0.65rem;
  border: 1px solid var(--liquid-border);
  border-radius: var(--radius-lg);
  background: var(--liquid-tile-bg-inner);
  color: var(--color-text);
  font: inherit;
  font-weight: 600;
  font-size: 0.98rem;
  text-align: center;
  cursor: pointer;
  box-shadow: var(--shadow-sm), var(--liquid-shadow-inset);
  backdrop-filter: blur(calc(var(--liquid-blur) * 0.32)) saturate(1.05);
  -webkit-backdrop-filter: blur(calc(var(--liquid-blur) * 0.32)) saturate(1.05);
  transition: border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
}
.wizard-event-team-count-pill:hover {
  border-color: color-mix(in srgb, var(--color-accent) 28%, var(--liquid-border));
  background: var(--liquid-tile-bg);
}
.wizard-event-team-count-pill.active {
  border-color: color-mix(in srgb, var(--color-accent) 42%, var(--liquid-border));
  background: var(--liquid-tile-bg-strong);
  box-shadow: var(--liquid-shadow), var(--liquid-shadow-inset);
}
.wizard-event-team-expand-hint {
  margin: -0.35rem 0 0.75rem;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
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
.wizard-event-team-combined-body {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  min-width: 0;
}
.wizard-event-team-name-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 0;
}
.wizard-event-team-combined-body .wizard-event-team-name-field.wizard-form-field {
  margin-bottom: 0;
}
.wizard-event-team-name-input {
  width: 100%;
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
.wizard-question--follow {
  margin-top: 1.5rem;
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
.wizard-step-institution {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  padding-top: 0.25rem;
  padding-bottom: 0.5rem;
}
.wizard-step-institution .wizard-form-section-title,
.wizard-step-institution .wizard-institution-intro,
.wizard-step-institution .wizard-institution-fields {
  width: 100%;
  max-width: 28rem;
  margin-left: auto;
  margin-right: auto;
}
.wizard-step-institution .wizard-form-section-title,
.wizard-step-institution .wizard-institution-intro {
  text-align: center;
}
.wizard-institution-intro {
  margin: 0 auto 1.35rem;
  max-width: 28rem;
}
.wizard-institution-intro-text {
  margin: 0 0 0.4rem;
  font-size: 0.95rem;
  line-height: 1.5;
  color: var(--color-text-muted);
}
.wizard-institution-intro-meta {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.4;
  color: var(--color-text-subtle);
}
.wizard-institution-fields {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  max-width: 28rem;
  margin-left: auto;
  margin-right: auto;
}
.wizard-form-field {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  margin-bottom: 1.25rem;
}
.wizard-form-field-label {
  display: block;
  margin: 0 0 0.45rem;
  padding: 0;
  position: static;
  left: auto;
  top: auto;
  transform: none;
  pointer-events: auto;
  font-size: 0.92rem;
  font-weight: 600;
  line-height: 1.35;
  color: var(--color-text);
  font-family: inherit;
}
.wizard-form-field-input {
  display: block;
  width: 100%;
  box-sizing: border-box;
  margin: 0;
  padding: 0.8rem 1rem;
  min-height: 3rem;
  font-size: 1rem;
  font-family: inherit;
  line-height: 1.4;
  color: var(--color-text);
}
.wizard-form-field-input::placeholder {
  color: var(--color-text-subtle);
}
.wizard-step-institution .wizard-form-field :deep(.custom-select) {
  width: 100%;
}
.wizard-step-institution .wizard-form-field :deep(.custom-select-trigger) {
  width: 100%;
  min-height: 3rem;
  padding: 0.8rem 2.5rem 0.8rem 1rem;
  font-size: 1rem;
  font-family: inherit;
  line-height: 1.4;
  color: var(--color-text);
}
.wizard-step-institution .wizard-form-field :deep(.custom-select-value) {
  font-size: 1rem;
}
.wizard-form-field-error {
  margin: 0.35rem 0 0;
  font-size: 0.85rem;
  color: #dc2626;
}
.wizard-name-warning {
  margin: 0.6rem 0 0;
  padding: 0.6rem 0.85rem;
  background: #fffbeb;
  border: 1px solid #f59e0b;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  color: #92400e;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.wizard-name-warning--event-step {
  margin-top: 1rem;
}
.wizard-name-warning-dismiss {
  align-self: flex-start;
  background: none;
  border: 1px solid #f59e0b;
  border-radius: 0.35rem;
  padding: 0.2rem 0.6rem;
  font-size: 0.8rem;
  color: #92400e;
  cursor: pointer;
}
.wizard-name-warning-dismiss:hover {
  background: #fef3c7;
}
.wizard-zip-lookup-state {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin-top: 0.35rem;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}
.wizard-zip-place-prompt {
  margin: 0.5rem 0 0.35rem;
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text-muted);
}
.wizard-zip-place-list {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-top: 0.25rem;
}
.wizard-zip-place-item {
  width: 100%;
  text-align: left;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-bg-elevated);
  padding: 0.6rem 0.75rem;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  font: inherit;
  color: var(--color-text);
}
.wizard-zip-place-item:hover {
  border-color: var(--color-accent);
  background: var(--color-bg-hover);
}
.wizard-zip-place-item-main {
  font-size: var(--text-sm);
  font-weight: 500;
}
.wizard-zip-place-item-sub {
  font-size: 0.78rem;
  color: var(--color-text-muted);
}
.wizard-institution-place {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.35rem 0.65rem;
  margin: 0.15rem 0 0.5rem;
  padding: 0.75rem 1rem;
}
.wizard-institution-place-label {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--color-text-muted);
}
.wizard-institution-place-value {
  font-size: 1rem;
  color: var(--color-text);
}
/* After generic .wizard-step-form .field floating rules — keep institution labels above controls */
.wizard-step-institution .wizard-form-field > .wizard-form-field-label {
  position: static;
  left: auto;
  top: auto;
  transform: none;
  pointer-events: auto;
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
.wizard-step-form .field input,
.wizard-step-form .field textarea,
.wizard-step-form .field select {
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
.wizard-step-form .field textarea {
  min-height: 6.5rem;
  resize: vertical;
}
.wizard-step-form .field input:focus,
.wizard-step-form .field textarea:focus,
.wizard-step-form .field select:focus {
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
.wizard-step-form .field > label {
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
.wizard-step-form .field.filled > label,
.wizard-step-form .field:focus-within > label {
  top: 0.45rem;
  font-size: 0.8rem;
  color: var(--color-accent);
}
.wizard-step-form .field.field-select > label {
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
.wizard-price-amounts {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: flex-end;
  gap: 0.35rem 0.5rem;
  text-align: right;
}
.wizard-price-was {
  color: var(--color-text-muted, #64748b);
  text-decoration: line-through;
  font-weight: 500;
  font-size: 0.85em;
}
.wizard-cart-line-label {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.2rem 0.45rem;
  min-width: 0;
}
.wizard-cart-product-name {
  font-weight: 600;
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
  margin: 0 0 1rem;
  padding: 0.75rem 1rem;
  border-radius: var(--radius);
  font-size: var(--text-sm);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.wizard-message.error { background: rgba(220, 38, 38, 0.08); color: #dc2626; }
.wizard-message.success { background: rgba(22, 163, 74, 0.1); color: #16a34a; }
.wizard-header {
  flex-shrink: 0;
  padding: 1rem 2rem 0.75rem;
  padding-top: max(1rem, env(safe-area-inset-top, 0px));
  padding-bottom: 0.85rem;
  border-top: none;
  border-bottom: none;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  background: transparent;
}
.wizard-header .btn {
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
.wizard-header .btn:disabled { opacity: 0.6; cursor: not-allowed; }
.wizard-header .btn-primary {
  background: var(--color-accent);
  color: white;
  box-shadow: 0 10px 20px rgba(37, 99, 235, 0.25);
}
.wizard-header .btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 12px 24px rgba(37, 99, 235, 0.3);
}
.wizard-header .btn-ghost { background: transparent; color: var(--color-text-muted); }
.wizard-header .btn-ghost:hover:not(:disabled) { color: var(--color-text); }

.wizard-hero {
  padding: 3rem 2.5rem;
  background: linear-gradient(160deg, rgba(37, 99, 235, 0.9), rgba(14, 116, 144, 0.9));
  color: #f8fafc;
  display: flex;
  align-items: center;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
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
  border-radius: var(--radius-lg);
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.38);
  border-left-width: 3px;
  border-left-style: solid;
  border-left-color: rgba(255, 255, 255, 0.88);
  box-shadow:
    0 8px 18px rgba(0, 0, 0, 0.08),
    inset 0 1.5px 0 rgba(255, 255, 255, 0.6),
    inset 0 -1px 0 rgba(0, 0, 0, 0.05);
  backdrop-filter: blur(10px) saturate(1.1);
  -webkit-backdrop-filter: blur(10px) saturate(1.1);
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
  padding: 0.65rem 0.8rem;
  border-radius: var(--radius-lg);
  background: rgba(255, 255, 255, 0.14);
  border: 1px solid rgba(255, 255, 255, 0.42);
  border-left-width: 3px;
  border-left-style: solid;
  border-left-color: rgba(255, 255, 255, 0.95);
  box-shadow:
    0 10px 22px rgba(0, 0, 0, 0.1),
    inset 0 1.5px 0 rgba(255, 255, 255, 0.72),
    inset 0 -1px 0 rgba(0, 0, 0, 0.06);
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

@media (min-height: 721px) {
  .wizard-body--center-options {
    min-height: 100%;
    justify-content: center;
  }
  .wizard-step-institution {
    justify-content: center;
  }
}

@media (max-height: 720px) {
  .wizard-step:not(.wizard-step-form) {
    min-height: 0;
    align-items: flex-start;
    padding-top: 0.5rem;
  }
}

@media (max-width: 960px) {
  .wizard-modal {
    height: 100dvh;
    max-height: 100dvh;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
  }
  /* Full-screen mobile mode: hide large hero column */
  .wizard-hero {
    display: none;
  }
  .wizard-panel {
    min-height: 0;
    height: 100%;
    max-height: 100dvh;
    flex: 1 1 auto;
  }
  .wizard-panel-main {
    min-height: 0;
  }

  .wizard-header {
    padding: 0.45rem 1rem 0.65rem;
  }
  .wizard-close {
    width: 2.4rem;
    height: 2.4rem;
  }
  .wizard-header .btn {
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
  .wizard-body,
  .wizard-header {
    padding-left: 1.25rem;
    padding-right: 1.25rem;
  }
  .wizard-sticky-top {
    padding-top: max(0.45rem, env(safe-area-inset-top, 0px));
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
    min-height: 0;
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
  .wizard-step-form .field input,
  .wizard-step-form .field textarea,
  .wizard-step-form .field select {
    font-size: 1rem;
    padding: 1.2rem 0.9rem 0.72rem;
  }
  .wizard-step-form .field > label {
    left: 0.9rem;
    top: 1rem;
    font-size: 0.95rem;
  }
  .wizard-step-form .field.filled > label,
  .wizard-step-form .field:focus-within > label {
    top: 0.4rem;
    font-size: 0.74rem;
  }
  .wizard-step-institution .wizard-form-field-input,
  .wizard-step-institution .wizard-form-field :deep(.custom-select-trigger) {
    font-size: 1rem;
    min-height: 3rem;
    padding: 0.75rem 1rem;
  }
  .wizard-step-institution .wizard-form-field :deep(.custom-select-trigger) {
    padding-right: 2.5rem;
  }
  .wizard-cart-row {
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 0.2rem 0.75rem;
  }
  .wizard-header {
    gap: 0.5rem;
  }
  .wizard-header .btn {
    flex: 1 1 0;
    justify-content: center;
    padding: 0.8rem 0.9rem;
    font-size: 0.95rem;
  }
  .wizard-header .btn .bi {
    font-size: 0.95rem;
  }
}

@media (max-width: 420px) {
  .wizard-body,
  .wizard-header {
    padding-left: 0.85rem;
    padding-right: 0.85rem;
  }
  .wizard-header {
    flex-wrap: nowrap;
  }
  .wizard-header .btn {
    flex: 1 1 0;
    min-width: 0;
    justify-content: center;
    padding: 0.75rem 0.5rem;
    font-size: 0.9rem;
  }
  .wizard-options-vertical {
    max-width: 100%;
  }
}
</style>
