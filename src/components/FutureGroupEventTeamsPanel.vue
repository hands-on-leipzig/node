<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import EventSelectDropdown from '@/components/EventSelectDropdown.vue'
import AddressSelector from '@/components/AddressSelector.vue'
import {
  getEventsNearest,
  getGroup,
  registerGroupForEvent,
  listAddressBookGrouped,
  isDolibarrRowId,
  unwrapNodeCard,
} from '@/services/draht'
import { requestSidebarRefresh } from '@/utils/sidebarRefresh'
import {
  FUTURE_TEAM_EVENT_UNIT_EUR,
  FUTURE_EVENT_TEAM_SIZE,
  futureMaxEventTeams,
  futureMaxSelectableEventTeams,
  minPupilsForEventTeamCount,
} from '@/config/futureEditionConfig'
import { FUTURE_PUPIL_OPTIONS } from '@/config/enrollmentOptions'
import { extractEventList, normalizeEvents, formatEventOptionLabel, filterEventsWithCapacity } from '@/utils/events'
import {
  emptyAddressState,
  buildNewAddressPayload,
  ADDRESS_MODE_INVOICE,
  syncExistingAddressSelection,
} from '@/utils/addressForm'
const props = defineProps({
  groupId: { type: [String, Number], required: true },
  group: { type: Object, required: true },
  /** When true (e.g. abgemeldet), block registration actions without using HTML inert. */
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['updated'])

const { t } = useI18n()

/** null | 'yes' | 'later' — wie Wizard Schritt Event */
const registrationChoice = ref(null)
const panelOpen = ref(false)
const events = ref([])
const eventsLoading = ref(false)

/** Total teams to register (initial) or additional teams (when already registered). */
const selectedTeamCount = ref(1)
/** Per-team event + name (wizard-style). */
const teamEvents = ref([{ eventId: null, name: '' }])
const teamAutoUpgrade = ref(null)

const submitting = ref(false)
const submitError = ref(null)
const submitSuccess = ref(false)

/** Start in "new address" mode so submit isn't blocked waiting for the address book. */
const invoiceAddress = ref({ ...emptyAddressState(ADDRESS_MODE_INVOICE), useExisting: false })
const invoiceAddresses = ref([])
const addressesLoading = ref(false)
const addressesLoadAttempted = ref(false)

const registeredPupils = computed(() => {
  const n = Number(props.group?.registeredPupils || 0)
  return Number.isFinite(n) && n > 0 ? n : 0
})

const enrolledTeams = computed(() => {
  const list = props.group?.eventTeams
  return Array.isArray(list) ? list.filter((t) => t && t.id != null) : []
})

/** Prefer real team rows — meta eventTeamCount alone can be stale without teams. */
const currentEventTeamCount = computed(() => {
  if (enrolledTeams.value.length > 0) return enrolledTeams.value.length
  return 0
})

const maxTeamsByPupils = computed(() =>
  registeredPupils.value > 0 ? futureMaxEventTeams(registeredPupils.value) : 1,
)

const maxTeamsSelectable = computed(() => futureMaxSelectableEventTeams())

/** Only actual event teams count as registered (not a leftover meta eventTeamCount). */
const hasEventRegistration = computed(() => enrolledTeams.value.length > 0)

function firstEnrolledTeamEvent() {
  for (const team of enrolledTeams.value) {
    const ev = team?.event
    if (ev && (ev.label || ev.ref || ev.id != null)) return ev
  }
  return null
}

const currentEventLabel = computed(() => {
  const ev = firstEnrolledTeamEvent()
  if (!ev) return ''
  return ev.label || ev.ref || (ev.id != null ? `Event ${ev.id}` : '')
})

const unitEur = computed(() => Number(props.group?.eventTeamUnitEur) || FUTURE_TEAM_EVENT_UNIT_EUR)

/** True when enrollment left invoice_adr empty (e.g. voucher) — collect RA before event fee. */
const needsInvoiceAddress = computed(() => {
  const id = Number(props.group?.invoice_adr)
  return !(Number.isFinite(id) && id > 0)
})

const invoiceAddressValid = computed(() => {
  if (!needsInvoiceAddress.value) return true
  const addr = invoiceAddress.value
  if (addr?.useExisting !== false && isDolibarrRowId(addr?.addressId)) return true
  if (addr?.useExisting !== false && !isDolibarrRowId(addr?.addressId)) return false
  return !!buildNewAddressPayload(addr, ADDRESS_MODE_INVOICE)
})

function buildInvoicePayload() {
  if (!needsInvoiceAddress.value) return null
  const addr = invoiceAddress.value
  if (addr?.useExisting !== false && isDolibarrRowId(addr?.addressId)) {
    return { addressId: String(Number(String(addr.addressId).trim())) }
  }
  return buildNewAddressPayload(addr, ADDRESS_MODE_INVOICE) || null
}

async function loadInvoiceAddresses() {
  if (!needsInvoiceAddress.value || addressesLoading.value) return
  addressesLoading.value = true
  try {
    const grouped = await listAddressBookGrouped()
    invoiceAddresses.value = Array.isArray(grouped?.invoice)
      ? grouped.invoice
      : (Array.isArray(grouped?.combined) ? grouped.combined : [])
    if (invoiceAddresses.value.length > 0) {
      invoiceAddress.value = syncExistingAddressSelection(
        { ...invoiceAddress.value, useExisting: true },
        invoiceAddresses.value,
      )
    } else {
      invoiceAddress.value = { ...invoiceAddress.value, useExisting: false, addressId: '' }
    }
  } catch {
    invoiceAddresses.value = []
    invoiceAddress.value = { ...invoiceAddress.value, useExisting: false, addressId: '' }
  } finally {
    addressesLoading.value = false
    addressesLoadAttempted.value = true
  }
}

function teamDisplayName(team) {
  const label = String(team?.label || '').trim()
  if (label) return label
  const ref = String(team?.ref || '').trim()
  if (ref) return ref
  return team?.id != null ? `Team ${team.id}` : ''
}

function teamEventLabel(team) {
  const ev = team?.event
  if (!ev) return '—'
  return ev.label || ev.ref || (ev.id != null ? `Event ${ev.id}` : '—')
}

/** Initial registration (no teams yet). */
const isInitialRegistration = computed(() => !hasEventRegistration.value)

const maxAdditionalTeams = computed(() =>
  Math.max(0, maxTeamsSelectable.value - currentEventTeamCount.value),
)

const teamOptionCounts = computed(() => {
  if (isInitialRegistration.value) {
    return Array.from(
      new Set(
        FUTURE_PUPIL_OPTIONS.map((n) => Math.floor(n / FUTURE_EVENT_TEAM_SIZE)).filter((n) => n > 0),
      ),
    ).sort((a, b) => a - b)
  }
  const max = maxAdditionalTeams.value
  if (max <= 0) return []
  return Array.from({ length: max }, (_, i) => i + 1)
})

const totalTeamsAfterSubmit = computed(() =>
  isInitialRegistration.value
    ? selectedTeamCount.value
    : currentEventTeamCount.value + selectedTeamCount.value,
)

const pupilsRequiredAfterSubmit = computed(() => minPupilsForEventTeamCount(totalTeamsAfterSubmit.value))

const willAutoIncreasePupils = computed(
  () => pupilsRequiredAfterSubmit.value > registeredPupils.value,
)

const estimatedSubmitCostEur = computed(() => {
  const count = isInitialRegistration.value
    ? selectedTeamCount.value
    : selectedTeamCount.value
  return (Number(count) || 0) * unitEur.value
})

const allTeamEventsSelected = computed(() => {
  if (teamEvents.value.length === 0) return false
  return teamEvents.value.every((entry) => {
    const id = Number(entry?.eventId)
    const hasEvent = Number.isFinite(id) && id > 0
    const hasName = String(entry?.name ?? '').trim().length > 0
    return hasEvent && hasName
  })
})

const showRegistrationForm = computed(
  () => isInitialRegistration.value
    ? registrationChoice.value === 'yes'
    : panelOpen.value,
)

const canSubmit = computed(() => {
  if (props.disabled || submitting.value) return false
  if (isInitialRegistration.value && registrationChoice.value !== 'yes') return false
  if (!selectedTeamCount.value || selectedTeamCount.value < 1) return false
  if (!invoiceAddressValid.value) return false
  if (isInitialRegistration.value) {
    if (selectedTeamCount.value > maxTeamsByPupils.value && !teamAutoUpgrade.value) return false
    return allTeamEventsSelected.value
  }
  if (maxAdditionalTeams.value <= 0) return false
  if (selectedTeamCount.value > maxAdditionalTeams.value) return false
  return allTeamEventsSelected.value
})

/** Why the primary action stays disabled — shown under the button. */
const submitBlockedHintKey = computed(() => {
  if (canSubmit.value || submitting.value) return ''
  if (props.disabled) return 'detail.cancelledBanner'
  if (!showRegistrationForm.value) return ''
  if (!isInitialRegistration.value && maxAdditionalTeams.value <= 0) return 'groupDetail.eventTeamsAtCapacity'
  if (!allTeamEventsSelected.value) return 'groupDetail.submitNeedsTeamAndEvent'
  if (needsInvoiceAddress.value && !invoiceAddressValid.value) return 'groupDetail.submitNeedsInvoiceAddress'
  return ''
})

function futureProgramId() {
  const p = Number(props.group?.program)
  if (Number.isFinite(p) && p > 0) return p
  return undefined
}

async function loadEvents() {
  eventsLoading.value = true
  events.value = []
  try {
    const country = String(props.group?.country || '').trim() || undefined
    const zip = String(props.group?.zip || '').trim() || undefined
    const res = await getEventsNearest(country, zip, futureProgramId())
    events.value = filterEventsWithCapacity(normalizeEvents(extractEventList(res?.data)))
  } catch {
    events.value = []
  } finally {
    eventsLoading.value = false
  }
}

function teamPillNeedsMorePupils(count) {
  if (!isInitialRegistration.value) return false
  const n = Number(count)
  if (!Number.isFinite(n) || n <= maxTeamsByPupils.value) return false
  return selectedTeamCount.value !== n
}

const teamPillsShowExpandHint = computed(
  () => isInitialRegistration.value
    && teamOptionCounts.value.some((c) => c > maxTeamsByPupils.value),
)

function selectTeamCount(count) {
  const n = Number(count)
  if (!Number.isFinite(n) || n <= 0) return

  if (isInitialRegistration.value) {
    const maxByPupils = maxTeamsByPupils.value
    if (n <= maxByPupils) {
      selectedTeamCount.value = n
      teamAutoUpgrade.value = null
      syncTeamEventsArray()
      return
    }
    const neededPupils = n * FUTURE_EVENT_TEAM_SIZE
    if (!FUTURE_PUPIL_OPTIONS.includes(neededPupils)) return
    selectedTeamCount.value = n
    teamAutoUpgrade.value = { teams: n, pupils: neededPupils }
    syncTeamEventsArray()
    return
  }

  if (n <= maxAdditionalTeams.value) {
    selectedTeamCount.value = n
    syncTeamEventsArray()
  }
}

function syncTeamEventsArray() {
  const count = Math.max(1, Number(selectedTeamCount.value) || 1)
  const enrolledEventId = (() => {
    const ev = firstEnrolledTeamEvent()
    const id = ev?.id != null ? Number(ev.id) : NaN
    return Number.isFinite(id) && id > 0 ? id : null
  })()
  while (teamEvents.value.length < count) {
    teamEvents.value.push({
      eventId: !isInitialRegistration.value && enrolledEventId != null ? enrolledEventId : null,
      name: '',
    })
  }
  teamEvents.value = teamEvents.value.slice(0, count)
}

function selectTeamEvent(teamIndex, eventId) {
  const idx = Number(teamIndex)
  if (!Number.isFinite(idx) || idx < 0 || !teamEvents.value[idx]) return
  const prev = teamEvents.value[idx]
  teamEvents.value[idx] = {
    eventId: eventId ? Number(eventId) : null,
    name: String(prev?.name ?? '').trim(),
  }
}

function chooseRegistration(mode) {
  if (props.disabled) return
  registrationChoice.value = mode
  if (mode === 'yes') {
    panelOpen.value = true
    if (events.value.length === 0) loadEvents()
    if (needsInvoiceAddress.value) void loadInvoiceAddresses()
    if (!Number.isFinite(Number(selectedTeamCount.value)) || selectedTeamCount.value < 1) {
      selectedTeamCount.value = 1
    }
    syncTeamEventsArray()
  } else {
    panelOpen.value = false
  }
}

function primaryEventIdForSubmit() {
  const ids = teamEvents.value
    .map((e) => Number(e?.eventId))
    .filter((id) => Number.isFinite(id) && id > 0)
  if (ids.length) return ids[0]
  const ev = firstEnrolledTeamEvent()
  const enrolledId = ev?.id != null ? Number(ev.id) : NaN
  return Number.isFinite(enrolledId) && enrolledId > 0 ? enrolledId : null
}

function buildEventTeamsPayload() {
  const rows = teamEvents.value
    .map((entry) => {
      const evId = Number(entry?.eventId)
      const name = String(entry?.name ?? '').trim()
      if (!Number.isFinite(evId) || evId <= 0 || !name) return null
      return { eventId: evId, name }
    })
    .filter(Boolean)
  if (isInitialRegistration.value) return rows
  return rows.slice(-Math.max(1, Number(selectedTeamCount.value) || 1))
}

async function submit() {
  if (props.disabled) return
  const eventTeamsPayload = buildEventTeamsPayload()
  const eventId = primaryEventIdForSubmit()
  if (!props.groupId || !eventId || eventTeamsPayload.length === 0) return
  const invoicePayload = buildInvoicePayload()
  if (needsInvoiceAddress.value && !invoicePayload) return

  submitting.value = true
  submitError.value = null
  submitSuccess.value = false
  try {
    const totalTeams = totalTeamsAfterSubmit.value
    const neededPupils = pupilsRequiredAfterSubmit.value
    const currentPupils = registeredPupils.value
    const payload = {
      eventId,
      eventTeamCount: totalTeams,
      eventTeams: eventTeamsPayload,
      // Bump capacity when more teams need a higher pupil tier (never shrink).
      registeredPupils: Math.max(currentPupils, neededPupils) || undefined,
    }
    if (invoicePayload) payload.invoiceAddress = invoicePayload
    const res = await registerGroupForEvent(props.groupId, payload)
    let card = unwrapNodeCard(res) || res?.data
    // Always re-fetch: GET heals fk_gruppe from meta and returns eventTeams reliably.
    try {
      const fresh = await getGroup(props.groupId)
      const freshCard = unwrapNodeCard(fresh)
      if (freshCard) {
        const feeErr = card?.eventFeeOrderError
        card = feeErr ? { ...freshCard, eventFeeOrderError: feeErr } : freshCard
      }
    } catch {
      /* keep PUT response */
    }
    emit('updated', card)
    requestSidebarRefresh()
    if (card?.eventFeeOrderError) {
      submitError.value = String(card.eventFeeOrderError)
      submitSuccess.value = false
    } else if (card?.eventRegistrationSkipped === 'already_registered') {
      // 200 without new teams — surface that teams already exist (stale UI / retry).
      submitSuccess.value = true
      setTimeout(() => {
        submitSuccess.value = false
      }, 4000)
    } else {
      submitSuccess.value = true
      setTimeout(() => {
        submitSuccess.value = false
      }, 4000)
    }
    selectedTeamCount.value = 1
    teamAutoUpgrade.value = null
    registrationChoice.value = null
    panelOpen.value = false
    invoiceAddress.value = { ...emptyAddressState(ADDRESS_MODE_INVOICE), useExisting: false }
    syncTeamEventsArray()
  } catch (e) {
    const errData = e.response?.data
    const msg =
      errData?.message || errData?.error?.message || e.message || t('groupDetail.registerEventFailed')
    // Capacity / retry races: reload group so already-created teams show up in the UI.
    if (props.groupId) {
      try {
        const fresh = await getGroup(props.groupId)
        const freshCard = unwrapNodeCard(fresh)
        if (freshCard) {
          emit('updated', freshCard)
          requestSidebarRefresh()
        }
      } catch {
        /* ignore reload failure */
      }
    }
    submitError.value = msg
  } finally {
    submitting.value = false
  }
}

function togglePanel() {
  if (props.disabled) return
  panelOpen.value = !panelOpen.value
  if (panelOpen.value && events.value.length === 0) {
    loadEvents()
  }
  if (panelOpen.value && needsInvoiceAddress.value) {
    void loadInvoiceAddresses()
  }
}

watch(
  () => props.group?.id,
  () => {
    selectedTeamCount.value = 1
    teamAutoUpgrade.value = null
    registrationChoice.value = null
    panelOpen.value = enrolledTeams.value.length > 0
    invoiceAddress.value = { ...emptyAddressState(ADDRESS_MODE_INVOICE), useExisting: false }
    invoiceAddresses.value = []
    addressesLoadAttempted.value = false
    syncTeamEventsArray()
    if (panelOpen.value) {
      loadEvents()
      if (needsInvoiceAddress.value) void loadInvoiceAddresses()
    }
  },
)

watch(selectedTeamCount, () => {
  syncTeamEventsArray()
})

watch(
  () => [showRegistrationForm.value, needsInvoiceAddress.value],
  ([show, needs]) => {
    if (show && needs) void loadInvoiceAddresses()
  },
)

onMounted(() => {
  syncTeamEventsArray()
  if (isInitialRegistration.value) {
    loadEvents()
  } else {
    // Nachmeldung: Panel offen, damit der Flow sofort bedienbar ist.
    panelOpen.value = true
    loadEvents()
    if (needsInvoiceAddress.value) void loadInvoiceAddresses()
  }
})
</script>

<template>
  <div class="future-event-teams">
    <h3 class="detail-section-title"><I18nText k="groupDetail.eventTeamsTitle" /></h3>

    <ul v-if="enrolledTeams.length" class="future-event-team-list">
      <li v-for="team in enrolledTeams" :key="'enrolled-team-' + team.id">
        <RouterLink
          :to="{ name: 'team-detail', params: { id: String(team.id) } }"
          class="future-event-team-row"
        >
          <span class="future-event-team-row-text">
            <span class="future-event-team-row-name">{{ teamDisplayName(team) }}</span>
            <span v-if="team.ref" class="future-event-team-row-ref">{{ team.ref }}</span>
            <span class="future-event-team-row-event">{{ teamEventLabel(team) }}</span>
          </span>
          <i class="bi bi-chevron-right future-event-team-row-chevron" aria-hidden="true" />
        </RouterLink>
      </li>
    </ul>
    <div v-else-if="!hasEventRegistration" class="future-event-status future-event-status--empty">
      <i class="bi bi-calendar-x" aria-hidden="true" />
      <p><I18nText k="groupDetail.eventTeamsStatusNone" /></p>
    </div>

    <div class="future-event-registration" :class="{ 'future-event-registration--readonly': disabled }">
    <template v-if="isInitialRegistration">
      <p class="onsite-event-question"><I18nText k="wizard.onSiteEventQuestion" /></p>
      <p class="future-event-hint onsite-event-hint"><I18nText k="wizard.onSiteEventHint" /></p>
      <div class="onsite-event-options">
        <button
          type="button"
          class="onsite-event-option"
          :class="{ active: registrationChoice === 'yes' }"
          :disabled="disabled"
          @click="chooseRegistration('yes')"
        >
          <span class="onsite-event-option-main"><I18nText k="wizard.onSiteEventYes" /></span>
          <span class="onsite-event-option-desc"><I18nText k="wizard.onSiteEventYesDesc" /></span>
        </button>
        <button
          v-if="registrationChoice !== 'yes'"
          type="button"
          class="onsite-event-option"
          :class="{ active: registrationChoice === 'later' }"
          :disabled="disabled"
          @click="chooseRegistration('later')"
        >
          <span class="onsite-event-option-main"><I18nText k="wizard.onSiteEventSkip" /></span>
          <span class="onsite-event-option-desc"><I18nText k="wizard.onSiteEventSkipDesc" /></span>
        </button>
      </div>
    </template>

    <button
      v-else
      type="button"
      class="future-event-panel-toggle"
      :aria-expanded="panelOpen"
      :disabled="disabled"
      @click="togglePanel"
    >
      <i class="bi" :class="panelOpen ? 'bi-chevron-up' : 'bi-chevron-down'" aria-hidden="true" />
      <span><I18nText k="groupDetail.eventTeamsPanelAddMore" /></span>
    </button>

    <div v-show="showRegistrationForm" class="future-event-panel-body">
      <p class="future-event-hint wizard-event-team-hint">
        <I18nText
          k="wizard.onSiteEventTeamsSummary"
          :values="{ pupils: registeredPupils || '—', maxTeams: maxTeamsByPupils }"
        />
      </p>

      <template v-if="!isInitialRegistration && maxAdditionalTeams <= 0">
        <p class="future-event-hint future-event-hint-warn">
          <I18nText k="groupDetail.eventTeamsAtCapacity" />
        </p>
      </template>

      <template v-else>
        <p class="future-event-label">
          <I18nText
            :k="isInitialRegistration ? 'wizard.onSiteEventTeamCountLabel' : 'groupDetail.eventTeamsAdditionalLabel'"
          />
        </p>
        <div class="future-event-team-count-row" role="group">
          <button
            v-for="count in teamOptionCounts"
            :key="'fe-team-count-' + count"
            type="button"
            class="future-event-team-count-pill"
            :class="{
              active: selectedTeamCount === count,
              'needs-pupils-upgrade': teamPillNeedsMorePupils(count),
            }"
            @click="selectTeamCount(count)"
          >
            <span class="future-event-team-count-pill-main">
              {{ count }}
              {{ count === 1 ? t('wizard.teamSingular') : t('wizard.teamsPlural') }}
            </span>
            <span
              v-if="teamPillNeedsMorePupils(count)"
              class="future-event-team-count-pill-hint"
            >
              <I18nText
                k="wizard.eventTeamCountNeedsPupils"
                :values="{ pupils: count * FUTURE_EVENT_TEAM_SIZE }"
              />
            </span>
          </button>
        </div>

        <p v-if="teamPillsShowExpandHint" class="future-event-hint future-event-team-expand-hint">
          <I18nText k="wizard.onSiteEventTeamsExpandHint" />
        </p>

        <p v-if="!isInitialRegistration && hasEventRegistration" class="future-event-hint">
          <I18nText
            k="groupDetail.eventTeamsTotalAfterAdd"
            :values="{ total: totalTeamsAfterSubmit, event: currentEventLabel }"
          />
        </p>

        <p v-if="willAutoIncreasePupils" class="future-event-hint future-event-hint-accent">
          <I18nText
            k="groupDetail.eventTeamAutoPupilsHint"
            :values="{
              teams: totalTeamsAfterSubmit,
              pupils: pupilsRequiredAfterSubmit,
            }"
          />
        </p>

        <div v-if="teamAutoUpgrade" class="future-event-upgrade">
          <p>
            <I18nText
              k="wizard.eventTeamAutoUpgraded"
              :values="{ teams: teamAutoUpgrade.teams, pupils: teamAutoUpgrade.pupils }"
            />
          </p>
        </div>

        <p v-if="selectedTeamCount > 1" class="future-event-label">
          <I18nText k="wizard.onSiteEventPerTeam" />
        </p>
        <div v-if="selectedTeamCount > 0" class="future-event-team-rows">
            <div
              v-for="(entry, idx) in teamEvents"
              :key="'fe-event-row-' + idx"
              class="future-event-team-card future-event-team-card--wizard"
            >
              <div
                class="future-event-team-grid future-event-team-grid--wizard"
                :class="{ 'future-event-team-grid--solo': selectedTeamCount === 1 }"
              >
                <div v-if="selectedTeamCount > 1" class="future-event-team-meta">
                  <span class="future-event-team-name">{{ t('wizard.teamSingular') }} {{ idx + 1 }}</span>
                </div>
                <div class="future-event-team-combined-body">
                  <label class="future-event-name-field">
                    <span class="future-event-name-label">
                      <I18nText :k="selectedTeamCount > 1 ? 'wizard.futureEventTeamNameLabel' : 'wizard.futureEventTeamNameLabelSolo'" />
                    </span>
                    <input
                      v-model="entry.name"
                      type="text"
                      class="future-event-name-input"
                      :placeholder="t('wizard.futureEventTeamNamePlaceholder')"
                      autocomplete="off"
                    >
                  </label>
                  <div class="future-event-team-dropdown">
                    <EventSelectDropdown
                      :title="selectedTeamCount > 1 ? t('wizard.onSiteEventDropdownTitleTeam', { team: idx + 1 }) : ''"
                      :events="events"
                      :loading="eventsLoading"
                      :model-value="entry.eventId"
                      :placeholder="t('wizard.onSiteEventPlaceholder')"
                      :event-label-fn="(ev) => formatEventOptionLabel(ev, t)"
                      @update:model-value="selectTeamEvent(idx, $event)"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

        <div v-if="needsInvoiceAddress" class="future-event-invoice">
          <p class="future-event-hint future-event-invoice-hint">
            <i class="bi bi-receipt" aria-hidden="true" />
            <I18nText k="groupDetail.invoiceAddressRequiredHint" />
          </p>
          <p v-if="addressesLoading && !addressesLoadAttempted" class="future-event-hint">
            <i class="bi bi-arrow-repeat spin" aria-hidden="true" />
            <I18nText k="dashboard.loading" />
          </p>
          <AddressSelector
            v-model="invoiceAddress"
            mode="invoice"
            :addresses="invoiceAddresses"
            :label="t('enroll.invoiceAddress')"
            id-prefix="future-event-invoice"
          />
        </div>

        <p class="future-event-hint">
          <I18nText k="groupDetail.eventCostHint" :values="{ cost: estimatedSubmitCostEur }" />
        </p>

        <button type="button" class="detail-btn detail-btn-primary" :disabled="!canSubmit" @click="submit">
          <i v-if="submitting" class="bi bi-arrow-repeat spin" aria-hidden="true" />
          <i v-else class="bi bi-plus-circle" aria-hidden="true" />
          <I18nText v-if="submitting" k="groupDetail.registering" />
          <I18nText v-else-if="isInitialRegistration" k="groupDetail.registerForEventButton" />
          <I18nText v-else k="groupDetail.eventTeamsAddMoreSubmit" />
        </button>
        <p v-if="submitBlockedHintKey" class="future-event-hint future-event-submit-hint">
          <i class="bi bi-info-circle" aria-hidden="true" />
          <I18nText :k="submitBlockedHintKey" />
        </p>
      </template>

      <p v-if="submitError" class="detail-message detail-message-error">
        <i class="bi bi-exclamation-circle" aria-hidden="true" />
        {{ submitError }}
      </p>
      <p v-if="submitSuccess" class="detail-message detail-message-success">
        <i class="bi bi-check-circle-fill" aria-hidden="true" />
        <I18nText k="groupDetail.registerEventSuccess" />
      </p>
    </div>
    </div>
  </div>
</template>

<style scoped>
.future-event-teams {
  margin-bottom: 0;
}
.onsite-event-question {
  margin: 0 0 0.35rem;
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--color-text);
}
.onsite-event-hint {
  white-space: pre-line;
  max-width: 40rem;
}
.onsite-event-options {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  margin-bottom: 0.85rem;
}
.onsite-event-option {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.2rem;
  width: 100%;
  padding: 0.75rem 0.9rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-bg-muted);
  color: var(--color-text);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.onsite-event-option:hover:not(:disabled) {
  border-color: var(--color-accent);
}
.onsite-event-option.active {
  border-color: var(--color-accent);
  background: color-mix(in srgb, var(--color-accent) 8%, var(--color-bg-muted));
}
.onsite-event-option-main {
  font-weight: 600;
  font-size: var(--text-sm);
}
.onsite-event-option-desc {
  font-size: 0.82rem;
  color: var(--color-text-muted);
}
.wizard-event-team-hint {
  line-height: 1.45;
  white-space: pre-line;
}
.future-event-team-grid--wizard {
  display: grid;
  gap: 0.65rem;
}
.future-event-team-combined-body {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  min-width: 0;
}
.future-event-name-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.future-event-name-label {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text);
}
.future-event-name-input {
  width: 100%;
  padding: 0.45rem 0.6rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-bg);
  color: var(--color-text);
  font-size: var(--text-base);
}
.future-event-name-input:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 0 0 0 2px var(--color-accent-soft);
}
.future-event-registration {
  margin-top: 0.25rem;
}
.future-event-registration--readonly {
  opacity: 0.55;
  filter: grayscale(0.35);
}
.future-event-submit-hint {
  display: flex;
  align-items: flex-start;
  gap: 0.4rem;
  margin-top: 0.55rem;
  color: #b45309;
}
.future-event-submit-hint .bi {
  margin-top: 0.15rem;
  flex-shrink: 0;
}
.future-event-panel-toggle:disabled,
.onsite-event-option:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.future-event-team-list {
  list-style: none;
  margin: 0 0 0.75rem;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.future-event-team-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.65rem;
  padding: 0.7rem 0.85rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-bg-muted);
  color: var(--color-text);
  text-decoration: none;
  transition: border-color 0.15s, background 0.15s;
}
.future-event-team-row:hover {
  border-color: var(--color-accent);
  background: color-mix(in srgb, var(--color-accent) 6%, var(--color-bg-muted));
}
.future-event-team-row-text {
  display: grid;
  gap: 0.12rem;
  min-width: 0;
}
.future-event-team-row-name {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text);
}
.future-event-team-row-ref {
  font-size: 0.78rem;
  color: var(--color-text-muted);
}
.future-event-team-row-event {
  font-size: 0.82rem;
  color: var(--color-text-muted);
}
.future-event-team-row-chevron {
  flex-shrink: 0;
  color: var(--color-text-muted);
  font-size: 0.95rem;
}
.future-event-status {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  padding: 0.85rem 1rem;
  border-radius: var(--radius);
  margin-bottom: 0.75rem;
  font-size: var(--text-sm);
  line-height: 1.45;
}
.future-event-status--active {
  background: color-mix(in srgb, #22c55e 12%, var(--color-bg-muted));
  border: 1px solid color-mix(in srgb, #22c55e 35%, var(--color-border));
}
.future-event-status--empty {
  background: var(--color-bg-muted);
  border: 1px solid var(--color-border);
  color: var(--color-text-muted);
}
.future-event-status-main {
  display: flex;
  gap: 0.65rem;
  align-items: flex-start;
}
.future-event-status-main > .bi {
  font-size: 1.25rem;
  color: #16a34a;
  margin-top: 0.1rem;
}
.future-event-status-headline {
  margin: 0 0 0.25rem;
  font-weight: 600;
  color: var(--color-text);
}
.future-event-status-meta {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.82rem;
}
.future-event-panel-toggle {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  width: 100%;
  padding: 0.55rem 0.75rem;
  margin-bottom: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-bg-muted);
  color: var(--color-text);
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
  text-align: left;
}
.future-event-panel-toggle:hover {
  border-color: var(--color-accent);
  color: var(--color-accent);
}
.future-event-panel-body {
  padding: 0.25rem 0 0.5rem;
}
.future-event-hint {
  margin: 0 0 0.65rem;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  line-height: 1.45;
}
.future-event-invoice {
  margin: 0.85rem 0 1rem;
  padding: 0.85rem 1rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-bg-muted, var(--liquid-tile-bg-inner));
}
.future-event-invoice-hint {
  display: flex;
  align-items: flex-start;
  gap: 0.45rem;
  margin-bottom: 0.75rem;
  color: var(--color-text);
  font-weight: 500;
}
.future-event-invoice-hint .bi {
  margin-top: 0.15rem;
  color: var(--color-accent);
}
.future-event-hint-warn {
  color: #b45309;
}
.future-event-hint-accent {
  color: color-mix(in srgb, var(--color-accent) 85%, var(--color-text));
  font-weight: 500;
}
.future-event-label {
  margin: 0 0 0.45rem;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text);
}
.future-event-team-count-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin-bottom: 0.85rem;
}
.future-event-team-count-pill {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.15rem;
  min-width: 5.25rem;
  padding: 0.5rem 0.85rem;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-bg);
  color: var(--color-text);
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, color 0.15s;
}
.future-event-team-count-pill:hover {
  border-color: var(--color-accent);
}
.future-event-team-count-pill.active {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: #fff;
}
.future-event-team-count-pill.needs-pupils-upgrade {
  border-style: dashed;
  border-color: color-mix(in srgb, var(--color-accent) 45%, var(--color-border));
  background: color-mix(in srgb, var(--color-accent) 7%, var(--color-bg));
  cursor: pointer;
}
.future-event-team-count-pill.needs-pupils-upgrade:hover {
  border-color: var(--color-accent);
  background: color-mix(in srgb, var(--color-accent) 12%, var(--color-bg));
}
.future-event-team-count-pill.needs-pupils-upgrade.active {
  border-style: solid;
}
.future-event-team-count-pill.needs-pupils-upgrade.active .future-event-team-count-pill-hint {
  color: color-mix(in srgb, #fff 88%, transparent);
}
.future-event-team-count-pill-main {
  white-space: nowrap;
}
.future-event-team-count-pill-hint {
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1.2;
  text-align: center;
  max-width: 100%;
  color: color-mix(in srgb, var(--color-accent) 75%, var(--color-text-muted));
}
.future-event-team-expand-hint {
  margin-top: -0.5rem;
}
.future-event-team-rows {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  margin-bottom: 0.85rem;
}
.future-event-team-card {
  padding: 0.65rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-bg-muted);
}
.future-event-team-grid {
  display: grid;
  gap: 0.5rem;
  grid-template-columns: minmax(4.5rem, auto) 1fr;
  align-items: center;
}
.future-event-team-grid--solo {
  grid-template-columns: 1fr;
}
.future-event-team-name {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-muted);
}
.future-event-upgrade {
  margin: 0 0 0.75rem;
  padding: 0.65rem 0.85rem;
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--color-accent) 10%, var(--color-bg-muted));
  font-size: var(--text-sm);
}
.future-event-upgrade p {
  margin: 0;
}
.spin {
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.detail-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-bg-elevated);
  color: var(--color-text);
  padding: 0.55rem 0.9rem;
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
}
.detail-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.detail-btn-primary {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: #fff;
}
.detail-message {
  margin: 0.6rem 0 0;
  font-size: var(--text-sm);
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.detail-message-error {
  color: var(--color-error, #dc2626);
}
.detail-message-success {
  color: #16a34a;
}
</style>
