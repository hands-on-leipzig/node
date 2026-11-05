<script setup>
import { ref, onMounted, computed, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { getTeam, updateTeamPlayers, updateTeamPlayersComplete, updateTeamVersandaufschub, updateTeamLabel, requestTeamDataChange, checkCoCoachEmail, inviteCoCoach } from '@/services/draht'
import DetailDeliveryAddressForm from '@/components/DetailDeliveryAddressForm.vue'
import { formatOverviewAddress } from '@/utils/formatOverviewAddress'
import { isTeklaCancelled } from '@/utils/enrollmentDisplay'
import { timelineHasShipmentStep, unwrapTimelinePayload } from '@/utils/timeline'
import { useTeklaShipmentSchedule } from '@/composables/useTeklaShipmentSchedule'
import TeklaStatusBoard from '@/components/TeklaStatusBoard.vue'
import CustomSelect from '@/components/CustomSelect.vue'
import DetailTeklaHeader from '@/components/DetailTeklaHeader.vue'
import FutureEnrollmentContextBanner from '@/components/FutureEnrollmentContextBanner.vue'
import EventScheduleLink from '@/components/EventScheduleLink.vue'
import { foundersTeamMaxPlayers } from '@/config/foundersEditionConfig'
import { futureTeamMaxPlayers } from '@/config/futureEditionConfig'
import { useCoachProfile } from '@/composables/useCoachProfile'
import { useModalDismiss } from '@/composables/useModalDismiss'
import {
  birthdayToDateStr,
  formatAgeReferenceDate,
  normalizePlayerAgeRule,
  playerAgeOutOfRange,
} from '@/utils/playerAge'
import { describeTeamDataGaps, playerFieldGaps } from '@/utils/teamDataGaps'

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const team = ref(null)
const loading = ref(true)
const error = ref(null)

// Local copy of players for add/edit; null = use team.players
const editingPlayers = ref([])
const editingPlayerIndex = ref(-1)
const editingPlayer = ref({ firstname: '', name: '', gender: '', birthdayStr: '' })
const newPlayer = ref({ firstname: '', name: '', gender: '', birthdayStr: '' })
const isAddingPlayer = ref(false)
const savingPlayers = ref(false)
const savingComplete = ref(false)
const playersError = ref('')
const savingTeamName = ref(false)
const teamNameError = ref('')

const id = computed(() => route.params.id)

/** Deregistered ("abgemeldet"): all editing functions are disabled. */
const cancelled = computed(() => isTeklaCancelled(team.value))

/** Underage coach (day-precise): may view + edit team data (e.g. player names) but not addresses. */
const { isMinorCoach, loadCoachProfile } = useCoachProfile()
void loadCoachProfile()

const displayedPlayers = computed(() => {
  const list = editingPlayers.value.length ? editingPlayers.value : (team.value?.players || [])
  return list
})

const timelinePayload = computed(() => unwrapTimelinePayload(team.value?.timeline))
const timelineSteps = computed(() => timelinePayload.value.steps)
const timelineAlert = computed(() => timelinePayload.value.alert)

const showShipmentSchedule = computed(() => timelineHasShipmentStep(timelineSteps.value))
const shipmentScheduleProp = useTeklaShipmentSchedule(team, showShipmentSchedule)

const teamMaxPlayers = computed(() =>
  foundersTeamMaxPlayers(team.value?.program) ?? futureTeamMaxPlayers(team.value?.program),
)
const teamAtMaxPlayers = computed(() => {
  const max = teamMaxPlayers.value
  if (max == null) return false
  return displayedPlayers.value.length >= max
})

const playerAgeRule = computed(() => normalizePlayerAgeRule(team.value?.playerAgeRule))
const teamDataLocked = computed(() => !!team.value?.teamDataLocked)
const hasTeamDataConfirmation = computed(() => !!team.value && Object.prototype.hasOwnProperty.call(team.value, 'playersComplete'))
const canEditPlayers = computed(() => !cancelled.value && !teamDataLocked.value)
const teamDataDeadlineLabel = computed(() => {
  const date = team.value?.teamDataDeadline
  if (!date) return ''
  return formatAgeReferenceDate({ referenceDate: date }, locale.value)
})
const teamDataLockedText = computed(() =>
  teamDataDeadlineLabel.value
    ? t('detail.teamDataLocked', { date: teamDataDeadlineLabel.value })
    : t('detail.teamDataLockedNoDate'),
)
const canContactRegionalPartner = computed(() => !!team.value?.regionalPartner?.contactable)
const rpModalOpen = ref(false)
const rpModalEl = ref(null)
const rpMessage = ref('')
const rpSending = ref(false)
const rpError = ref('')
const rpSent = ref(false)
const rpLead = computed(() => {
  const name = String(team.value?.regionalPartner?.name || '').trim()
  return name
    ? t('detail.teamDataContactRpLead', { name })
    : t('detail.teamDataContactRpLeadNoName')
})

useModalDismiss(() => rpModalOpen.value, {
  dialogRef: rpModalEl,
  onClose: closeRpModal,
})

function openRpModal() {
  rpError.value = ''
  rpSent.value = false
  rpMessage.value = ''
  rpModalOpen.value = true
}

function closeRpModal() {
  if (rpSending.value) return
  rpModalOpen.value = false
}

async function submitRpMessage() {
  if (!id.value || rpSending.value || rpSent.value) return
  const message = rpMessage.value.trim()
  if (!message) {
    rpError.value = t('detail.teamDataContactRpRequired')
    return
  }
  rpSending.value = true
  rpError.value = ''
  try {
    await requestTeamDataChange(id.value, { message })
    rpSent.value = true
  } catch (e) {
    const code = e.response?.data?.code || e.response?.data?.error?.code
    if (code === 'rp_contact_missing') rpError.value = t('detail.teamDataContactRpMissing')
    else if (code === 'message_required') rpError.value = t('detail.teamDataContactRpRequired')
    else if (code === 'message_too_long') rpError.value = t('detail.teamDataContactRpTooLong')
    else if (code === 'team_data_open') rpError.value = t('detail.teamDataContactRpStillOpen')
    else rpError.value = t('detail.teamDataContactRpError')
  } finally {
    rpSending.value = false
  }
}

const playerAgeHint = computed(() => {
  const rule = playerAgeRule.value
  if (!rule) return ''
  return t('detail.playerAgeHint', { min: rule.minAge, max: rule.maxAge, date: formatAgeReferenceDate(rule, locale.value) })
})

function playerAgeError(birthday) {
  const rule = playerAgeRule.value
  const age = playerAgeOutOfRange(birthday, rule)
  if (age === null) return ''
  return t('detail.playerAgeInvalid', { age, min: rule.minAge, max: rule.maxAge, date: formatAgeReferenceDate(rule, locale.value) })
}

function playerAgeWarning(p) {
  const rule = playerAgeRule.value
  const age = playerAgeOutOfRange(p.birthday, rule)
  if (age === null) return ''
  return t('detail.playerAgeOutOfRange', { age, date: formatAgeReferenceDate(rule, locale.value) })
}

/** Birthday of the player being edited as loaded; unchanged out-of-range dates are exceptions set by the RP. */
const editingPlayerOriginalBirthday = ref('')
const editingPlayerAgeError = computed(() =>
  editingPlayer.value.birthdayStr === editingPlayerOriginalBirthday.value
    ? ''
    : playerAgeError(editingPlayer.value.birthdayStr),
)
const newPlayerAgeError = computed(() => playerAgeError(newPlayer.value.birthdayStr))

const genderOptions = computed(() => [
  { value: '', label: t('detail.chooseOption') },
  { value: 'M', label: t('detail.genderM') },
  { value: 'F', label: t('detail.genderF') },
  { value: 'D', label: t('detail.genderD') },
])

function statusLabel(obj) {
  if (!obj || typeof obj !== 'object') return ''
  return locale.value === 'de' ? (obj.de || obj.en) : (obj.en || obj.de)
}

function formatAddress(addr) {
  return formatOverviewAddress(addr, locale.value)
}

function cardHasDeliveryAddress(card) {
  if (!card) return false
  if (card.shipmentSchedule?.hasDeliveryAddress === false) return false
  if (Number(card.delivery_adr) > 0) return true
  const addr = card.overview?.delivery_address
  return !!(addr && formatAddress(addr))
}

function onDeliveryAddressSaved(card) {
  if (card && typeof card === 'object') team.value = card
}

function scrollToDeliveryForm() {
  if (typeof window === 'undefined' || window.location.hash !== '#detail-addresses') return
  nextTick(() => {
    document.getElementById('detail-addresses')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}

function formatDate(timestamp) {
  if (!timestamp) return ''
  const d = new Date(typeof timestamp === 'number' ? timestamp * 1000 : timestamp)
  return d.toLocaleDateString(locale.value === 'de' ? 'de-DE' : 'en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function playerGenderLabel(p) {
  if (p?.gender === 'M') return t('detail.genderM')
  if (p?.gender === 'F') return t('detail.genderF')
  if (p?.gender === 'D') return t('detail.genderD')
  return ''
}

function playerBirthdayLabel(p) {
  if (!p?.birthday) return ''
  const d = new Date(typeof p.birthday === 'number' ? p.birthday * 1000 : p.birthday)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(locale.value === 'de' ? 'de-DE' : 'en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const FIELD_LABEL_KEY = {
  firstname: 'detail.firstname',
  lastname: 'detail.lastname',
  gender: 'detail.gender',
  birthday: 'detail.dateOfBirth',
}

function joinFieldLabels(labels) {
  if (labels.length <= 1) return labels[0] || ''
  if (labels.length === 2) {
    return locale.value === 'de' ? `${labels[0]} und ${labels[1]}` : `${labels[0]} and ${labels[1]}`
  }
  const head = labels.slice(0, -1).join(', ')
  const last = labels[labels.length - 1]
  return locale.value === 'de' ? `${head} und ${last}` : `${head}, and ${last}`
}

function labelsForFields(fields) {
  return fields.map((field) => t(FIELD_LABEL_KEY[field]))
}

function playerMissingText(p) {
  const fields = playerFieldGaps(p)
  if (!fields.length) return ''
  const joined = joinFieldLabels(labelsForFields(fields))
  return fields.length === 1
    ? t('detail.playerFieldMissing', { field: joined })
    : t('detail.playerFieldsMissing', { fields: joined })
}

const teamDataNotes = computed(() => {
  const gaps = describeTeamDataGaps(team.value?.label, displayedPlayers.value)
  const lines = []
  if (gaps.placeholderName) lines.push(t('detail.teamDataNamePlaceholder'))
  if (gaps.tooFew) lines.push(t('detail.teamDataTooFew'))
  for (const player of gaps.players) {
    const joined = joinFieldLabels(labelsForFields(player.fields))
    const name = player.name || t('detail.teamMemberN', { n: player.index + 1 })
    lines.push(
      player.fields.length === 1
        ? t('detail.teamDataPlayerMissing', { name, field: joined })
        : t('detail.teamDataPlayersMissing', { name, fields: joined }),
    )
  }
  return lines
})

function startEditPlayer(idx) {
  const list = displayedPlayers.value
  const p = list[idx] || {}
  editingPlayerIndex.value = idx
  editingPlayer.value = {
    firstname: p.firstname || '',
    name: p.name || '',
    gender: p.gender || '',
    birthdayStr: birthdayToDateStr(p.birthday),
  }
  editingPlayerOriginalBirthday.value = editingPlayer.value.birthdayStr
}

function saveEditPlayer() {
  const idx = editingPlayerIndex.value
  if (idx < 0 || editingPlayerAgeError.value) return
  const e = editingPlayer.value
  const copy = [...editingPlayers.value]
  if (!copy.length && team.value?.players?.length) {
    copy.push(...team.value.players.map((p) => ({ ...p })))
  }
  const birthday = e.birthdayStr || null
  copy[idx] = { firstname: e.firstname, name: e.name, gender: e.gender, birthday }
  editingPlayers.value = copy
  editingPlayerIndex.value = -1
  editingPlayer.value = { firstname: '', name: '', gender: '', birthdayStr: '' }
  persistPlayers()
}

function cancelEditPlayer() {
  editingPlayerIndex.value = -1
  editingPlayer.value = { firstname: '', name: '', gender: '', birthdayStr: '' }
}

function removePlayer(idx) {
  let copy = editingPlayers.value.length ? [...editingPlayers.value] : [...(team.value?.players || [])]
  copy = copy.filter((_, i) => i !== idx)
  editingPlayers.value = copy
  if (editingPlayerIndex.value === idx) cancelEditPlayer()
  else if (editingPlayerIndex.value > idx) editingPlayerIndex.value--
  persistPlayers()
}

function startAddPlayer() {
  if (teamAtMaxPlayers.value) return
  isAddingPlayer.value = true
  newPlayer.value = { firstname: '', name: '', gender: '', birthdayStr: '' }
}

function addPlayer() {
  if (teamAtMaxPlayers.value || newPlayerAgeError.value) return
  const e = newPlayer.value
  let copy = editingPlayers.value.length ? [...editingPlayers.value] : [...(team.value?.players || [])]
  if (teamMaxPlayers.value != null && copy.length >= teamMaxPlayers.value) return
  const birthday = e.birthdayStr || null
  copy.push({ firstname: e.firstname, name: e.name, gender: e.gender, birthday })
  editingPlayers.value = copy
  isAddingPlayer.value = false
  newPlayer.value = { firstname: '', name: '', gender: '', birthdayStr: '' }
  persistPlayers()
}

function cancelAddPlayer() {
  isAddingPlayer.value = false
  newPlayer.value = { firstname: '', name: '', gender: '', birthdayStr: '' }
}

async function saveTeamName(label) {
  if (!id.value) return
  savingTeamName.value = true
  teamNameError.value = ''
  try {
    const res = await updateTeamLabel(id.value, { label })
    team.value = res.data
  } catch (e) {
    teamNameError.value = e.response?.data?.message || e.message || t('detail.teamNameSaveFailed')
  } finally {
    savingTeamName.value = false
  }
}

async function saveVersandaufschub(dateStrOrNull) {
  if (!id.value) return
  try {
    const res = await updateTeamVersandaufschub(id.value, { versandaufschub: dateStrOrNull })
    team.value = res.data
  } catch (e) {
    error.value = e.response?.data?.message || e.message || t('errors.loadFailed')
  }
}

function buildPlayersPayload(list) {
  return list.map((p) => ({
    firstname: p.firstname || '',
    name: p.name || '',
    gender: p.gender || '',
    birthday: birthdayToDateStr(p.birthday) || null,
  }))
}

async function onCompleteChange(event) {
  if (!id.value) return
  const complete = !!event.target.checked
  savingComplete.value = true
  playersError.value = ''
  try {
    const res = await updateTeamPlayersComplete(id.value, { complete })
    team.value = res.data
  } catch (e) {
    event.target.checked = !!team.value?.playersComplete
    const code = e.response?.data?.code || e.response?.data?.error?.code
    playersError.value = code === 'team_data_locked'
      ? teamDataLockedText.value
      : (e.response?.data?.error?.message || e.response?.data?.message || e.message || t('errors.loadFailed'))
  } finally {
    savingComplete.value = false
  }
}

async function persistPlayers() {
  if (!id.value) return
  let list = displayedPlayers.value
  const max = teamMaxPlayers.value
  if (max != null && list.length > max) {
    list = list.slice(0, max)
    editingPlayers.value = list
  }
  savingPlayers.value = true
  playersError.value = ''
  try {
    const payload = buildPlayersPayload(list)
    const res = await updateTeamPlayers(id.value, { players: payload })
    team.value = res.data
    editingPlayers.value = []
  } catch (e) {
    editingPlayers.value = []
    playersError.value = e.response?.data?.error?.message || e.response?.data?.message || e.message || t('errors.loadFailed')
  } finally {
    savingPlayers.value = false
  }
}

function scrollToCoCoachesSection() {
  if (route.query.focus !== 'coCoaches' || loading.value || !team.value) return
  nextTick(() => {
    document.getElementById('team-co-coaches-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}

function dismissCoCoachBanner() {
  router.replace({ name: 'team-detail', params: { id: id.value }, query: {} })
}

const coCoachModalOpen = ref(false)
const coCoachModalEl = ref(null)
const coCoachEmail = ref('')
const coCoachProbe = ref(null)
const coCoachChecking = ref(false)
const coCoachInviteSubmitting = ref(false)
const coCoachInviteSuccess = ref(false)
const coCoachInviteError = ref('')

useModalDismiss(() => coCoachModalOpen.value, {
  dialogRef: coCoachModalEl,
  onClose: closeCoCoachModal,
})

function resetCoCoachInviteForm() {
  coCoachEmail.value = ''
  coCoachProbe.value = null
  coCoachInviteSuccess.value = false
  coCoachInviteError.value = ''
  coCoachInviteSubmitting.value = false
  coCoachChecking.value = false
}

function openCoCoachModal() {
  resetCoCoachInviteForm()
  coCoachModalOpen.value = true
}

function closeCoCoachModal() {
  coCoachModalOpen.value = false
}

const canCheckCoCoachEmail = computed(() => {
  if (coCoachChecking.value || coCoachInviteSuccess.value) return false
  const email = coCoachEmail.value.trim()
  if (!email) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
})

watch(coCoachEmail, () => {
  coCoachProbe.value = null
  coCoachInviteError.value = ''
})

function coCoachErrorMessage(e) {
  const d = e?.response?.data
  const msg =
    (typeof d === 'string' && d) ||
    d?.message ||
    d?.error?.message ||
    (Array.isArray(d?.errors) ? d.errors.join(' ') : '') ||
    e?.message
  return (msg && String(msg).trim()) || t('dashboard.addCoCoachErrorGeneric')
}

async function runCoCoachEmailCheck() {
  coCoachInviteError.value = ''
  if (!id.value || !canCheckCoCoachEmail.value) {
    coCoachInviteError.value = t('common.requiredField')
    return
  }
  coCoachChecking.value = true
  try {
    const res = await checkCoCoachEmail({
      targetType: 'team',
      targetId: Number(id.value),
      email: coCoachEmail.value.trim(),
    })
    const d = res?.data?.data ?? res?.data
    coCoachProbe.value = {
      coachAccountExists: !!d?.coachAccountExists,
      alreadyCoCoach: !!d?.alreadyCoCoach,
    }
  } catch (e) {
    coCoachInviteError.value = coCoachErrorMessage(e)
    coCoachProbe.value = null
  } finally {
    coCoachChecking.value = false
  }
}

async function submitCoCoachInvite(inviteUnregistered) {
  coCoachInviteError.value = ''
  if (!id.value) {
    coCoachInviteError.value = t('dashboard.addCoCoachErrorGeneric')
    return
  }
  const email = coCoachEmail.value.trim()
  if (!email) {
    coCoachInviteError.value = t('common.requiredField')
    return
  }
  coCoachInviteSubmitting.value = true
  try {
    await inviteCoCoach({
      targetType: 'team',
      targetId: Number(id.value),
      email,
      inviteUnregistered: !!inviteUnregistered,
    })
    coCoachInviteSuccess.value = true
    try {
      const res = await getTeam(id.value)
      team.value = res.data
    } catch {
      /* the invitation is sent even if the list cannot be refreshed */
    }
  } catch (e) {
    coCoachInviteError.value = coCoachErrorMessage(e)
  } finally {
    coCoachInviteSubmitting.value = false
  }
}

async function fetchTeam() {
  if (!id.value) return
  loading.value = true
  error.value = null
  team.value = null
  rpModalOpen.value = false
  try {
    const res = await getTeam(id.value)
    team.value = res.data
    editingPlayers.value = []
  } catch (e) {
    error.value = e.response?.status === 404 ? t('detail.notFound') : (e.message || t('errors.loadFailed'))
  } finally {
    loading.value = false
    if (team.value) {
      scrollToCoCoachesSection()
      scrollToDeliveryForm()
    }
  }
}

const registeredEventLabel = computed(() => {
  const ev = team.value?.event
  if (!ev) return ''
  return ev.label || ev.ref || (ev.id != null ? `Event ${ev.id}` : '')
})

onMounted(fetchTeam)
watch(id, fetchTeam)

watch(
  () => route.query.focus,
  () => {
    if (team.value && route.query.focus === 'coCoaches') scrollToCoCoachesSection()
  }
)
watch(
  () => route.hash,
  () => {
    if (team.value) scrollToDeliveryForm()
  }
)
</script>

<template>
  <div class="detail-view">
    <div v-if="loading" class="detail-loading">
      <i class="bi bi-arrow-repeat spin"></i>
      <I18nText k="dashboard.loading" />
    </div>
    <div v-else-if="error" class="detail-error">
      <i class="bi bi-exclamation-circle"></i>
      {{ error }}
    </div>
    <template v-else-if="team">
      <!-- 1) Name of tekla + number -->
      <DetailTeklaHeader
        :card="team"
        kind="team"
        editable-team-name
        :cancelled="cancelled"
        :saving-team-name="savingTeamName"
        :team-name-error="teamNameError"
        @save-team-name="saveTeamName"
        @clear-team-name-error="teamNameError = ''"
      />
      <p v-if="cancelled" class="detail-cancelled-banner" role="status">
        <i class="bi bi-slash-circle" aria-hidden="true"></i>
        <span><I18nText k="detail.cancelledBanner" /></span>
      </p>
      <FutureEnrollmentContextBanner v-if="!cancelled" kind="team" :card="team" />

      <!-- 2) Status -->
      <TeklaStatusBoard
        v-if="timelineSteps.length || timelineAlert"
        :steps="timelineSteps"
        :alert="timelineAlert"
        :locale="locale"
        tekla-type="teams"
        :tekla-id="team.id"
        :shipment-schedule="shipmentScheduleProp"
        :versandaufschub="showShipmentSchedule ? (team.versandaufschub ?? null) : undefined"
        :read-only="cancelled"
        :team-data-notes="teamDataNotes"
        class="detail-timeline-first"
        @versandaufschub-save="saveVersandaufschub"
      />

      <div v-if="teamDataLocked && !cancelled" class="detail-lock" role="status">
        <p>{{ teamDataLockedText }}</p>
        <button
          v-if="canContactRegionalPartner"
          type="button"
          class="detail-btn detail-btn-primary"
          @click="openRpModal"
        >
          {{ t('detail.teamDataContactRp') }}
        </button>
        <p v-else class="detail-lock-fallback">{{ t('detail.teamDataContactRpMissing') }}</p>
      </div>

      <div class="detail-overview">
      <!-- 3) Coach infos (all fields, placeholder when missing) -->
      <section id="team-co-coaches-anchor" class="detail-section">
        <dl class="detail-meta">
          <dt><I18nText k="detail.coach" /></dt>
          <dd>
            <template v-if="team.coach">
              <template
                v-if="team.coach.name || [team.coach.firstname, team.coach.lastname].filter(Boolean).join(' ')"
              >
                {{ team.coach.name || [team.coach.firstname, team.coach.lastname].filter(Boolean).join(' ') }}
              </template>
              <I18nText v-else k="detail.noData" />
              <span v-if="team.coach.email" class="detail-meta-extra">{{ team.coach.email }}</span>
            </template>
            <template v-else><I18nText k="detail.noData" /></template>
          </dd>
          <dt><I18nText k="detail.coCoaches" /></dt>
          <dd class="detail-coaches-dd">
            <div v-if="route.query.focus === 'coCoaches'" class="detail-co-coach-banner" role="note">
              <p class="detail-co-coach-banner-text"><I18nText k="teamDetail.coCoachFocusBanner" /></p>
              <button type="button" class="detail-btn detail-btn-ghost detail-co-coach-banner-dismiss" @click="dismissCoCoachBanner">
                <I18nText k="teamDetail.coCoachFocusDismiss" />
              </button>
            </div>
            <p v-if="!(team.co_coaches && team.co_coaches.length)" class="detail-coaches-empty">
              <I18nText k="detail.coCoachesEmpty" />
            </p>
            <p v-else class="detail-coaches">
              <span v-for="(c, i) in team.co_coaches" :key="'c-' + i">{{ c.name || [c.firstname, c.lastname].filter(Boolean).join(' ') }}{{ c.email ? ' (' + c.email + ')' : '' }}</span>
            </p>
            <button
              v-if="!cancelled"
              type="button"
              class="detail-btn detail-btn-primary detail-coaches-add"
              @click="openCoCoachModal"
            >
              <i class="bi bi-person-plus" aria-hidden="true" />
              <I18nText k="dashboard.addCoCoachButton" />
            </button>
          </dd>
          <dt><I18nText k="detail.ort" /></dt>
          <dd>
            <template v-if="team.ort">{{ team.ort }}</template>
            <I18nText v-else k="detail.noData" />
          </dd>
          <dt><I18nText k="detail.institution" /></dt>
          <dd>
            <template v-if="team.institution">{{ team.institution }}</template>
            <I18nText v-else k="detail.noData" />
          </dd>
        </dl>
      </section>

      <!-- 3b) Event (right column): registered event only -->
      <section class="detail-section detail-section-event">
        <h3 class="detail-section-title"><I18nText k="teamDetail.event" /></h3>
        <p v-if="registeredEventLabel" class="detail-event-current">{{ registeredEventLabel }}</p>
        <EventScheduleLink v-if="registeredEventLabel" :event="team.event" />
        <p v-if="!registeredEventLabel" class="detail-hint">
          <I18nText k="teamDetail.noEventRegistered" />
        </p>
      </section>

      <!-- 4) Invoice + shipping address (always both, placeholder when missing) -->
      <section id="detail-addresses" class="detail-section detail-section-addresses">
        <h3 class="detail-section-title"><I18nText k="wizard.stepAddresses" /></h3>
        <p class="detail-address-label"><I18nText k="detail.billingAddress" /></p>
        <p class="detail-address">
          <template
            v-if="team.overview && team.overview.billing_address && formatAddress(team.overview.billing_address)"
          >
            {{ formatAddress(team.overview.billing_address) }}
          </template>
          <I18nText v-else k="detail.noData" />
        </p>
        <p class="detail-address-label"><I18nText k="detail.deliveryAddress" /></p>
        <p v-if="cardHasDeliveryAddress(team)" class="detail-address">
          {{ formatAddress(team.overview.delivery_address) }}
        </p>
        <DetailDeliveryAddressForm
          v-else-if="!cancelled"
          tekla-type="teams"
          :tekla-id="team.id"
          :minor-locked="isMinorCoach"
          @saved="onDeliveryAddressSaved"
        />
        <p v-else class="detail-address"><I18nText k="detail.noData" /></p>
      </section>

      <!-- Players -->
      <section class="detail-section detail-section-wide">
        <h3 class="detail-section-title"><I18nText k="detail.players" /></h3>
        <div class="detail-players-block">
          <p v-if="teamDataDeadlineLabel && !teamDataLocked && !cancelled" class="detail-hint">
            {{ t('detail.teamDataDeadline', { date: teamDataDeadlineLabel }) }}
          </p>
          <label v-if="!cancelled && hasTeamDataConfirmation" class="detail-complete">
            <input
              type="checkbox"
              :checked="!!team.playersComplete"
              :disabled="teamDataLocked || savingComplete"
              @change="onCompleteChange"
            >
            {{ t('detail.teamDataComplete') }}
          </label>
          <p v-if="playerAgeHint && !cancelled" class="detail-hint">{{ playerAgeHint }}</p>
          <div v-if="displayedPlayers.length || isAddingPlayer" class="detail-players-wrap">
            <table class="detail-players-table">
              <thead>
                <tr>
                  <th scope="col"><I18nText k="detail.firstname" /></th>
                  <th scope="col"><I18nText k="detail.lastname" /></th>
                  <th scope="col"><I18nText k="detail.gender" /></th>
                  <th scope="col"><I18nText k="detail.dateOfBirth" /></th>
                  <th scope="col" class="detail-players-actions-col">
                    <span class="detail-sr"><I18nText k="detail.edit" /></span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <template v-for="(p, idx) in displayedPlayers" :key="'p-' + idx">
                  <tr v-if="editingPlayerIndex === idx" class="detail-players-row detail-players-row--edit">
                    <td>
                      <input
                        :id="'player-edit-firstname-' + idx"
                        v-model="editingPlayer.firstname"
                        class="detail-player-input"
                        autocomplete="off"
                        :aria-label="t('detail.firstname')"
                      />
                    </td>
                    <td>
                      <input
                        :id="'player-edit-lastname-' + idx"
                        v-model="editingPlayer.name"
                        class="detail-player-input"
                        autocomplete="off"
                        :aria-label="t('detail.lastname')"
                      />
                    </td>
                    <td>
                      <CustomSelect
                        :id="'player-edit-gender-' + idx"
                        v-model="editingPlayer.gender"
                        size="sm"
                        class="detail-player-select-wrap"
                        :options="genderOptions"
                        :placeholder="t('detail.chooseOption')"
                      />
                    </td>
                    <td>
                      <input
                        :id="'player-edit-birthday-' + idx"
                        v-model="editingPlayer.birthdayStr"
                        type="date"
                        class="detail-player-input"
                        :class="{ 'detail-player-input--invalid': editingPlayerAgeError }"
                        :aria-invalid="!!editingPlayerAgeError"
                        :aria-label="t('detail.dateOfBirth')"
                      />
                    </td>
                    <td class="detail-players-actions-cell">
                      <div class="detail-player-actions">
                        <button type="button" class="detail-btn detail-btn-primary" :disabled="!!editingPlayerAgeError" @click="saveEditPlayer"><I18nText k="common.save" /></button>
                        <button type="button" class="detail-btn" @click="cancelEditPlayer"><I18nText k="common.cancel" /></button>
                      </div>
                    </td>
                  </tr>
                  <tr
                    v-else
                    class="detail-players-row"
                    :class="{ 'detail-players-row--warn': playerMissingText(p) || playerAgeWarning(p) }"
                  >
                    <td>{{ p.firstname || '—' }}</td>
                    <td>{{ p.name || '—' }}</td>
                    <td>{{ playerGenderLabel(p) || '—' }}</td>
                    <td>{{ playerBirthdayLabel(p) || '—' }}</td>
                    <td class="detail-players-actions-cell">
                      <div v-if="canEditPlayers" class="detail-player-actions">
                        <button type="button" class="detail-btn detail-btn-ghost" @click="startEditPlayer(idx)" :aria-label="t('detail.edit')"><i class="bi bi-pencil"></i></button>
                        <button type="button" class="detail-btn detail-btn-ghost" @click="removePlayer(idx)" :aria-label="t('detail.remove')"><i class="bi bi-trash"></i></button>
                      </div>
                    </td>
                  </tr>
                  <tr v-if="editingPlayerIndex === idx && editingPlayerAgeError" class="detail-players-note">
                    <td colspan="5">
                      <p class="detail-message detail-message-error" role="alert">
                        <i class="bi bi-exclamation-circle" aria-hidden="true"></i>{{ editingPlayerAgeError }}
                      </p>
                    </td>
                  </tr>
                  <tr v-else-if="editingPlayerIndex !== idx && (playerMissingText(p) || playerAgeWarning(p))" class="detail-players-note">
                    <td colspan="5">
                      <p v-if="playerMissingText(p)" class="detail-player-missing">
                        <i class="bi bi-exclamation-triangle" aria-hidden="true"></i>
                        {{ playerMissingText(p) }}
                      </p>
                      <p v-if="playerAgeWarning(p)" class="detail-player-warning">
                        <i class="bi bi-exclamation-triangle" aria-hidden="true"></i>
                        {{ playerAgeWarning(p) }}
                      </p>
                    </td>
                  </tr>
                </template>
                <tr v-if="isAddingPlayer" class="detail-players-row detail-players-row--edit">
                  <td>
                    <input
                      id="player-new-firstname"
                      v-model="newPlayer.firstname"
                      class="detail-player-input"
                      autocomplete="off"
                      :aria-label="t('detail.firstname')"
                    />
                  </td>
                  <td>
                    <input
                      id="player-new-lastname"
                      v-model="newPlayer.name"
                      class="detail-player-input"
                      autocomplete="off"
                      :aria-label="t('detail.lastname')"
                    />
                  </td>
                  <td>
                    <CustomSelect
                      id="player-new-gender"
                      v-model="newPlayer.gender"
                      size="sm"
                      class="detail-player-select-wrap"
                      :options="genderOptions"
                      :placeholder="t('detail.chooseOption')"
                    />
                  </td>
                  <td>
                    <input
                      id="player-new-birthday"
                      v-model="newPlayer.birthdayStr"
                      type="date"
                      class="detail-player-input"
                      :class="{ 'detail-player-input--invalid': newPlayerAgeError }"
                      :aria-invalid="!!newPlayerAgeError"
                      :aria-label="t('detail.dateOfBirth')"
                    />
                  </td>
                  <td class="detail-players-actions-cell">
                    <div class="detail-player-actions">
                      <button type="button" class="detail-btn detail-btn-primary" :disabled="!!newPlayerAgeError" @click="addPlayer"><I18nText k="detail.add" /></button>
                      <button type="button" class="detail-btn" @click="cancelAddPlayer"><I18nText k="common.cancel" /></button>
                    </div>
                  </td>
                </tr>
                <tr v-if="isAddingPlayer && newPlayerAgeError" class="detail-players-note">
                  <td colspan="5">
                    <p class="detail-message detail-message-error" role="alert">
                      <i class="bi bi-exclamation-circle" aria-hidden="true"></i>{{ newPlayerAgeError }}
                    </p>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else class="detail-players-empty"><I18nText k="detail.playersEmpty" /></p>
          <div v-if="canEditPlayers" class="detail-players-toolbar">
            <p v-if="teamMaxPlayers != null && teamAtMaxPlayers && !isAddingPlayer" class="detail-empty-hint">
              <I18nText k="detail.playersMaxReached" :values="{ max: teamMaxPlayers }" />
            </p>
            <button v-else-if="!isAddingPlayer" type="button" class="detail-btn detail-btn-primary" @click="startAddPlayer"><I18nText k="detail.addPlayer" /></button>
          </div>
          <div v-if="savingPlayers" class="detail-saving-hint"><I18nText k="dashboard.loading" /></div>
          <p v-if="playersError" class="detail-message detail-message-error" role="alert">
            <i class="bi bi-exclamation-circle" aria-hidden="true"></i>{{ playersError }}
          </p>
        </div>
      </section>
      </div>

      <Teleport to="body">
        <div
          v-if="coCoachModalOpen"
          class="rp-modal-backdrop"
          role="presentation"
          @click.self="closeCoCoachModal"
        >
          <div
            ref="coCoachModalEl"
            class="rp-modal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="co-coach-modal-title"
            tabindex="-1"
            @click.stop
          >
            <header class="rp-modal-head">
              <h2 id="co-coach-modal-title" class="rp-modal-title">{{ t('dashboard.addCoCoachModalTitle') }}</h2>
              <button type="button" class="rp-modal-close" :aria-label="t('dashboard.addCoCoachClose')" @click="closeCoCoachModal">
                <i class="bi bi-x-lg" aria-hidden="true" />
              </button>
            </header>
            <div class="rp-modal-body">
              <template v-if="!coCoachInviteSuccess">
                <p class="rp-modal-lead">{{ t('detail.coCoachInviteLead') }}</p>
                <label class="rp-modal-label">
                  <span>{{ t('dashboard.addCoCoachEmail') }}</span>
                  <input
                    v-model="coCoachEmail"
                    type="email"
                    class="rp-modal-input rp-modal-input--line"
                    name="co-coach-email-manual"
                    autocomplete="off"
                    autocorrect="off"
                    autocapitalize="off"
                    spellcheck="false"
                    data-lpignore="true"
                    data-1p-ignore
                  />
                </label>
                <p v-if="coCoachProbe?.alreadyCoCoach" class="rp-modal-info">
                  <I18nText k="dashboard.addCoCoachAlreadyLinked" />
                </p>
                <template v-else-if="coCoachProbe && coCoachProbe.coachAccountExists">
                  <p class="rp-modal-info"><I18nText k="dashboard.addCoCoachResultHasCoach" /></p>
                </template>
                <template v-else-if="coCoachProbe && !coCoachProbe.coachAccountExists">
                  <p class="rp-modal-info"><I18nText k="dashboard.addCoCoachResultNoCoach" /></p>
                  <p class="rp-modal-lead"><I18nText k="dashboard.addCoCoachUnregisteredHint" /></p>
                </template>
                <p class="rp-modal-lead"><I18nText k="dashboard.addCoCoachModalNote" /></p>
              </template>
              <p v-else class="rp-modal-success"><I18nText k="dashboard.addCoCoachSuccess" /></p>
              <p v-if="coCoachInviteError" class="rp-modal-error" role="alert">{{ coCoachInviteError }}</p>
              <footer class="rp-modal-foot">
                <button type="button" class="detail-btn" @click="closeCoCoachModal">
                  <I18nText k="dashboard.addCoCoachClose" />
                </button>
                <button
                  v-if="!coCoachInviteSuccess && !coCoachProbe"
                  type="button"
                  class="detail-btn detail-btn-primary"
                  :disabled="!canCheckCoCoachEmail"
                  @click="runCoCoachEmailCheck"
                >
                  <template v-if="coCoachChecking"><I18nText k="dashboard.addCoCoachChecking" /></template>
                  <template v-else><I18nText k="dashboard.addCoCoachCheckEmail" /></template>
                </button>
                <button
                  v-if="!coCoachInviteSuccess && coCoachProbe && !coCoachProbe.alreadyCoCoach && coCoachProbe.coachAccountExists"
                  type="button"
                  class="detail-btn detail-btn-primary"
                  :disabled="coCoachInviteSubmitting"
                  @click="submitCoCoachInvite(false)"
                >
                  <template v-if="coCoachInviteSubmitting"><I18nText k="dashboard.addCoCoachSending" /></template>
                  <template v-else><I18nText k="dashboard.addCoCoachSendInviteExisting" /></template>
                </button>
                <button
                  v-if="!coCoachInviteSuccess && coCoachProbe && !coCoachProbe.alreadyCoCoach && !coCoachProbe.coachAccountExists"
                  type="button"
                  class="detail-btn detail-btn-primary"
                  :disabled="coCoachInviteSubmitting"
                  @click="submitCoCoachInvite(true)"
                >
                  <template v-if="coCoachInviteSubmitting"><I18nText k="dashboard.addCoCoachSending" /></template>
                  <template v-else><I18nText k="dashboard.addCoCoachSendInviteUnregistered" /></template>
                </button>
              </footer>
            </div>
          </div>
        </div>
      </Teleport>

      <Teleport to="body">
        <div
          v-if="rpModalOpen"
          class="rp-modal-backdrop"
          role="presentation"
          @click.self="closeRpModal"
        >
          <div
            ref="rpModalEl"
            class="rp-modal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rp-modal-title"
            tabindex="-1"
            @click.stop
          >
            <header class="rp-modal-head">
              <h2 id="rp-modal-title" class="rp-modal-title">{{ t('detail.teamDataContactRpTitle') }}</h2>
              <button type="button" class="rp-modal-close" :aria-label="t('common.closeDialog')" @click="closeRpModal">
                <i class="bi bi-x-lg" aria-hidden="true" />
              </button>
            </header>
            <form class="rp-modal-body" @submit.prevent="submitRpMessage">
              <p v-if="!rpSent" class="rp-modal-lead">{{ rpLead }}</p>
              <label v-if="!rpSent" class="rp-modal-label">
                <span>{{ t('detail.teamDataContactRpMessage') }}</span>
                <textarea
                  v-model="rpMessage"
                  class="rp-modal-input"
                  rows="6"
                  maxlength="4000"
                  required
                />
              </label>
              <p v-else class="rp-modal-success">{{ t('detail.teamDataContactRpSuccess') }}</p>
              <p v-if="rpError" class="rp-modal-error" role="alert">{{ rpError }}</p>
              <footer class="rp-modal-foot">
                <button type="button" class="detail-btn" @click="closeRpModal">
                  {{ t('common.closeDialog') }}
                </button>
                <button
                  v-if="!rpSent"
                  type="submit"
                  class="detail-btn detail-btn-primary"
                  :disabled="rpSending || !rpMessage.trim()"
                >
                  {{ t('detail.teamDataContactRpSend') }}
                </button>
              </footer>
            </form>
          </div>
        </div>
      </Teleport>
    </template>
  </div>
</template>

<style scoped>
.detail-view {
  max-width: 42rem;
}
.detail-overview {
  display: grid;
  gap: 1.5rem 2rem;
}
.detail-section-wide {
  grid-column: 1 / -1;
}
.detail-cancelled-banner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0 0 1.5rem;
  padding: 0.75rem 1rem;
  border-radius: var(--radius);
  border: 1px solid color-mix(in srgb, #b91c1c 35%, transparent);
  background: color-mix(in srgb, #b91c1c 10%, transparent);
  color: #b91c1c;
  font-size: var(--text-sm);
  font-weight: 600;
  line-height: 1.4;
}
.detail-cancelled-banner .bi {
  font-size: 1.1rem;
  flex-shrink: 0;
}
.detail-loading,
.detail-error {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--color-text-muted);
}
.detail-error {
  color: var(--color-error, #dc2626);
}
.spin {
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
.detail-section {
  margin-bottom: 1.5rem;
  padding: 1rem 0;
  border-top: 1px solid var(--color-border);
}
.detail-section-title {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  margin: 0 0 0.75rem;
}
.detail-meta {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.35rem 1.5rem;
  margin: 0;
}
.detail-meta dt {
  align-self: start;
  padding-top: 0.12rem;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  margin: 0;
}
.detail-meta dd {
  font-size: var(--text-base);
  color: var(--color-text);
  margin: 0;
}
.detail-meta-extra {
  display: block;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  margin-top: 0.15rem;
}
.detail-address-label {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-muted);
  margin: 0 0 0.25rem;
}
.detail-address {
  font-size: var(--text-base);
  color: var(--color-text);
  margin: 0 0 0.75rem;
  white-space: pre-line;
}
.detail-address:last-child {
  margin-bottom: 0;
}
.detail-section-addresses,
.detail-co-coaches-wrap {
  scroll-margin-top: 5rem;
}
.detail-co-coach-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  margin: 0 0 0.75rem;
  border-radius: var(--radius);
  border: 1px solid var(--color-border);
  background: var(--color-accent-soft);
}
.detail-co-coach-banner-text {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-text);
  line-height: 1.45;
  flex: 1;
  min-width: 12rem;
}
.detail-co-coach-banner-dismiss {
  flex-shrink: 0;
}
.detail-co-coaches-wrap .detail-subsection-title {
  margin-top: 0;
}
.detail-subsection-title {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-muted);
  margin: 1rem 0 0.5rem;
}
.detail-empty-hint {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  margin: 0 0 0.75rem;
  font-style: italic;
}
.detail-players-block {
  margin-bottom: 0.5rem;
}
.detail-players-empty {
  margin: 0 0 0.75rem;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}
.detail-players-wrap {
  margin: 0 0 0.75rem;
  border: 1px solid color-mix(in srgb, var(--color-border) 80%, transparent);
  border-radius: calc(var(--radius) + 2px);
  background: color-mix(in srgb, var(--color-bg-muted) 32%, var(--color-bg));
  overflow: auto;
}
.detail-players-table {
  --player-control-h: 2.25rem;
  width: 100%;
  min-width: 44rem;
  border-collapse: collapse;
  font-size: var(--text-sm);
}
.detail-players-table th {
  padding: 0.55rem 0.7rem;
  text-align: left;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-muted);
  border-bottom: 1px solid color-mix(in srgb, var(--color-border) 85%, transparent);
}
.detail-players-table td {
  padding: 0.45rem 0.7rem;
  vertical-align: middle;
  border-bottom: 1px solid color-mix(in srgb, var(--color-border) 55%, transparent);
}
.detail-players-table th:first-child,
.detail-players-table td:first-child {
  padding-left: 0.9rem;
}
.detail-players-table tbody tr:last-child td {
  border-bottom: none;
}
.detail-players-row--warn td {
  background: color-mix(in srgb, #b45309 7%, transparent);
}
.detail-players-row--edit td {
  background: color-mix(in srgb, var(--color-bg) 78%, var(--color-accent-soft));
}
.detail-players-note td {
  padding-top: 0;
  background: transparent;
}
.detail-players-note p {
  margin: 0 0 0.35rem;
}
.detail-players-actions-col,
.detail-players-actions-cell {
  width: 1%;
  white-space: nowrap;
  text-align: right;
}
.detail-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.detail-player-input {
  box-sizing: border-box;
  width: 100%;
  height: var(--player-control-h);
  min-height: var(--player-control-h);
  margin: 0;
  padding: 0 0.55rem;
  font-size: var(--text-sm);
  font-family: inherit;
  line-height: 1.2;
  color: var(--color-text);
  background-color: #fff;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
}
html[data-theme='dark'] .detail-player-input {
  background-color: var(--liquid-bg-deep);
}
.detail-player-input--invalid {
  border-color: var(--color-error, #dc2626);
}
.detail-player-input[type='date']::-webkit-datetime-edit,
.detail-player-input[type='date']::-webkit-datetime-edit-fields-wrapper {
  padding: 0;
  line-height: 1.2;
}
.detail-player-warning,
.detail-player-missing {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-warning, #b45309);
}
.detail-player-select-wrap {
  width: 100%;
  min-width: 0;
}
.detail-player-select-wrap :deep(.custom-select-trigger) {
  box-sizing: border-box;
  height: var(--player-control-h);
  min-height: var(--player-control-h);
  padding-top: 0;
  padding-bottom: 0;
}
.detail-player-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.35rem;
}
.detail-players-row--edit .detail-player-actions .detail-btn {
  box-sizing: border-box;
  height: var(--player-control-h);
  min-height: var(--player-control-h);
  padding: 0 0.75rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.detail-players-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0;
}

@media (min-width: 960px) {
  .detail-view {
    max-width: 78rem;
  }
  .detail-overview {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
.detail-btn {
  font-size: var(--text-sm);
  padding: 0.35rem 0.75rem;
  border-radius: var(--radius);
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  cursor: pointer;
  color: var(--color-text);
}
.detail-btn-primary {
  background: var(--color-accent);
  color: var(--color-on-accent);
  border-color: var(--color-accent);
  font-weight: 600;
}

.detail-btn-primary:hover:not(:disabled) {
  background: var(--color-accent-hover);
  border-color: var(--color-accent-hover);
}

.detail-btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  color: var(--color-on-accent);
}
.detail-btn-ghost {
  padding: 0.25rem;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
}
.detail-saving-hint {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  margin-top: 0.5rem;
}
.detail-coaches-dd {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.45rem;
}
.detail-coaches-empty {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}
.detail-coaches-add {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}
.detail-coaches {
  font-size: var(--text-base);
  color: var(--color-text);
  margin: 0;
}
.detail-coaches span + span::before {
  content: ' · ';
  color: var(--color-text-muted);
}
.detail-hint {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  margin: 0 0 0.75rem;
}
.detail-lock {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.65rem;
  margin: 1rem 0 0.75rem;
  padding: 0.75rem 1rem;
  border-radius: var(--radius);
  border: 1px solid color-mix(in srgb, #b45309 40%, transparent);
  background: color-mix(in srgb, #b45309 12%, transparent);
}
.detail-lock p {
  margin: 0;
  font-size: var(--text-sm);
  font-weight: 600;
  line-height: 1.45;
  color: var(--color-text);
}
.detail-lock-fallback {
  font-weight: 500;
  color: var(--color-text-muted);
}
.rp-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10040;
  background: var(--liquid-modal-scrim-bg, rgba(6, 6, 8, 0.78));
  backdrop-filter: blur(var(--liquid-modal-scrim-blur)) saturate(var(--liquid-saturate));
  -webkit-backdrop-filter: blur(var(--liquid-modal-scrim-blur)) saturate(var(--liquid-saturate));
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  box-sizing: border-box;
}
.rp-modal-dialog {
  width: 100%;
  max-width: 28rem;
  max-height: min(92vh, 720px);
  overflow: auto;
  background: var(--liquid-popover-fill, var(--color-bg));
  color: var(--color-text);
  border-radius: var(--radius-xl, var(--radius));
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-lg, 0 12px 40px rgba(0, 0, 0, 0.2));
}
.rp-modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 1rem 1rem 0.5rem;
  border-bottom: 1px solid var(--color-border);
}
.rp-modal-title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
}
.rp-modal-close {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 0.25rem;
  border-radius: var(--radius);
  line-height: 1;
}
.rp-modal-body {
  padding: 1rem;
}
.rp-modal-lead {
  margin: 0 0 0.75rem;
  font-size: var(--text-sm);
  line-height: 1.5;
  color: var(--color-text-muted);
}
.rp-modal-label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: var(--text-sm);
  font-weight: 600;
}
.rp-modal-input {
  width: 100%;
  min-height: 8rem;
  padding: 0.45rem 0.6rem;
  font: inherit;
  font-weight: 400;
  border-radius: var(--radius);
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  color: var(--color-text);
  box-sizing: border-box;
  resize: vertical;
}
.rp-modal-input--line {
  min-height: 2.5rem;
  height: 2.5rem;
  resize: none;
}
.rp-modal-info {
  margin: 0.75rem 0 0;
  font-size: var(--text-sm);
  line-height: 1.45;
}
.rp-modal-success {
  margin: 0;
  font-size: var(--text-sm);
  line-height: 1.5;
}
.rp-modal-error {
  margin: 0.75rem 0 0;
  font-size: var(--text-sm);
  color: var(--color-error, #dc2626);
}
.rp-modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1rem;
}
.detail-complete {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0 0 0.75rem;
  font-size: var(--text-sm);
}
.detail-hint-sm {
  margin-bottom: 0.5rem;
}
.detail-event-current {
  font-size: var(--text-base);
  font-weight: 500;
  color: var(--color-text);
  margin: 0;
}
.detail-field-hint,
.detail-message {
  font-size: var(--text-sm);
  margin: 0.5rem 0 0;
  display: flex;
  align-items: center;
  gap: 0.35rem;
}
.detail-message-error {
  color: var(--color-error, #dc2626);
}
.detail-message-success {
  color: #16a34a;
}
</style>
