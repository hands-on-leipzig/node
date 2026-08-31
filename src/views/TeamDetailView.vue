<script setup>
import { ref, onMounted, computed, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { getTeam, updateTeamPlayers, updateTeamVersandaufschub, updateTeamLabel } from '@/services/draht'
import DetailDeliveryAddressForm from '@/components/DetailDeliveryAddressForm.vue'
import { formatOverviewAddress } from '@/utils/formatOverviewAddress'
import { isTeklaCancelled } from '@/utils/enrollmentDisplay'
import { timelineHasShipmentStep } from '@/utils/timeline'
import { useTeklaShipmentSchedule } from '@/composables/useTeklaShipmentSchedule'
import TeklaTimeline from '@/components/TeklaTimeline.vue'
import CustomSelect from '@/components/CustomSelect.vue'
import DetailTeklaHeader from '@/components/DetailTeklaHeader.vue'
import FutureEnrollmentContextBanner from '@/components/FutureEnrollmentContextBanner.vue'
import { foundersTeamMaxPlayers } from '@/config/foundersEditionConfig'
import { futureTeamMaxPlayers } from '@/config/futureEditionConfig'

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
const savingTeamName = ref(false)
const teamNameError = ref('')

const id = computed(() => route.params.id)

/** Deregistered ("abgemeldet"): all editing functions are disabled. */
const cancelled = computed(() => isTeklaCancelled(team.value))

const displayedPlayers = computed(() => {
  const list = editingPlayers.value.length ? editingPlayers.value : (team.value?.players || [])
  return list
})

const timelineSteps = computed(() => {
  const t = team.value?.timeline
  if (!t) return []
  return Array.isArray(t.timeline) ? t.timeline : (Array.isArray(t) ? t : [])
})

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

const genderOptions = computed(() => [
  { value: '', label: t('detail.gender') },
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

function playerDisplayName(p) {
  const first = p.firstname || ''
  const last = p.name || ''
  return [first, last].filter(Boolean).join(' ') || t('detail.noData')
}

function playerMeta(p) {
  const parts = []
  if (p.gender) parts.push(p.gender)
  if (p.birthday) {
    const d = new Date(typeof p.birthday === 'number' ? p.birthday * 1000 : p.birthday)
    parts.push(d.toLocaleDateString(locale.value === 'de' ? 'de-DE' : 'en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }))
  }
  return parts.length ? parts.join(' · ') : ''
}

function toBirthdayStr(ts) {
  if (!ts) return ''
  const d = new Date(typeof ts === 'number' ? ts * 1000 : ts)
  return d.toISOString().slice(0, 10)
}

function startEditPlayer(idx) {
  const list = displayedPlayers.value
  const p = list[idx] || {}
  editingPlayerIndex.value = idx
  editingPlayer.value = {
    firstname: p.firstname || '',
    name: p.name || '',
    gender: p.gender || '',
    birthdayStr: toBirthdayStr(p.birthday) || '',
  }
}

function saveEditPlayer() {
  const idx = editingPlayerIndex.value
  if (idx < 0) return
  const e = editingPlayer.value
  const copy = [...editingPlayers.value]
  if (!copy.length && team.value?.players?.length) {
    copy.push(...team.value.players.map((p) => ({ ...p })))
  }
  const birthday = e.birthdayStr ? Math.floor(new Date(e.birthdayStr).getTime() / 1000) : null
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
  if (teamAtMaxPlayers.value) return
  const e = newPlayer.value
  let copy = editingPlayers.value.length ? [...editingPlayers.value] : [...(team.value?.players || [])]
  if (teamMaxPlayers.value != null && copy.length >= teamMaxPlayers.value) return
  const birthday = e.birthdayStr ? Math.floor(new Date(e.birthdayStr).getTime() / 1000) : null
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
  return list.map((p) => {
    let birthday = null
    if (p.birthday) {
      const ts = typeof p.birthday === 'number' ? p.birthday : null
      if (ts) birthday = new Date(ts * 1000).toISOString().slice(0, 10)
    }
    return {
      firstname: p.firstname || '',
      name: p.name || '',
      gender: p.gender || '',
      birthday,
    }
  })
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
  try {
    const payload = buildPlayersPayload(list)
    const res = await updateTeamPlayers(id.value, { players: payload })
    team.value = res.data
    editingPlayers.value = []
  } catch (e) {
    error.value = e.response?.data?.message || e.message || t('errors.loadFailed')
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

async function fetchTeam() {
  if (!id.value) return
  loading.value = true
  error.value = null
  team.value = null
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

      <!-- 2) Timeline -->
      <TeklaTimeline
        v-if="timelineSteps.length"
        :steps="timelineSteps"
        :locale="locale"
        tekla-type="teams"
        :tekla-id="team.id"
        :shipment-schedule="shipmentScheduleProp"
        :versandaufschub="showShipmentSchedule ? (team.versandaufschub ?? null) : undefined"
        :read-only="cancelled"
        class="detail-timeline-first"
        @versandaufschub-save="saveVersandaufschub"
      />

      <div class="detail-overview">
      <!-- 3) Coach infos (all fields, placeholder when missing) -->
      <section class="detail-section">
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
        <p v-else class="detail-hint"><I18nText k="teamDetail.noEventRegistered" /></p>
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
          @saved="onDeliveryAddressSaved"
        />
        <p v-else class="detail-address"><I18nText k="detail.noData" /></p>
      </section>

      <!-- Players + co-coaches (team only) -->
      <section class="detail-section detail-section-wide">
        <h3 class="detail-section-title"><I18nText k="detail.players" /></h3>
        <div class="detail-players-block">
          <ul v-if="(team.players && team.players.length) || editingPlayers.length" class="detail-players-list">
            <li v-for="(p, idx) in displayedPlayers" :key="'p-' + idx" class="detail-player-row">
              <template v-if="editingPlayerIndex === idx">
                <input v-model="editingPlayer.firstname" class="detail-player-input" :placeholder="t('detail.firstname')" />
                <input v-model="editingPlayer.name" class="detail-player-input" :placeholder="t('detail.lastname')" />
                <CustomSelect
                  v-model="editingPlayer.gender"
                  size="sm"
                  class="detail-player-select-wrap"
                  :options="genderOptions"
                  :placeholder="t('detail.gender')"
                />
                <input v-model="editingPlayer.birthdayStr" type="date" class="detail-player-input" />
                <div class="detail-player-actions">
                  <button type="button" class="detail-btn detail-btn-primary" @click="saveEditPlayer"><I18nText k="common.save" /></button>
                  <button type="button" class="detail-btn" @click="cancelEditPlayer"><I18nText k="common.cancel" /></button>
                </div>
              </template>
              <template v-else>
                <span class="detail-player-name">{{ playerDisplayName(p) }}</span>
                <span class="detail-player-meta">{{ playerMeta(p) }}</span>
                <div v-if="!cancelled" class="detail-player-actions">
                  <button type="button" class="detail-btn detail-btn-ghost" @click="startEditPlayer(idx)" :aria-label="t('detail.edit')"><i class="bi bi-pencil"></i></button>
                  <button type="button" class="detail-btn detail-btn-ghost" @click="removePlayer(idx)" :aria-label="t('detail.remove')"><i class="bi bi-trash"></i></button>
                </div>
              </template>
            </li>
          </ul>
          <p v-else class="detail-empty-hint"><I18nText k="detail.noData" /></p>
          <div v-if="!cancelled" class="detail-players-toolbar">
            <p v-if="teamMaxPlayers != null && teamAtMaxPlayers && !isAddingPlayer" class="detail-empty-hint">
              <I18nText k="detail.playersMaxReached" :values="{ max: teamMaxPlayers }" />
            </p>
            <button v-else-if="!isAddingPlayer" type="button" class="detail-btn detail-btn-primary" @click="startAddPlayer"><I18nText k="detail.addPlayer" /></button>
            <template v-else>
              <input v-model="newPlayer.firstname" class="detail-player-input" :placeholder="t('detail.firstname')" />
              <input v-model="newPlayer.name" class="detail-player-input" :placeholder="t('detail.lastname')" />
              <CustomSelect
                v-model="newPlayer.gender"
                size="sm"
                class="detail-player-select-wrap"
                :options="genderOptions"
                :placeholder="t('detail.gender')"
              />
              <input v-model="newPlayer.birthdayStr" type="date" class="detail-player-input" />
              <button type="button" class="detail-btn detail-btn-primary" @click="addPlayer"><I18nText k="detail.add" /></button>
              <button type="button" class="detail-btn" @click="cancelAddPlayer"><I18nText k="common.cancel" /></button>
            </template>
          </div>
          <div v-if="savingPlayers" class="detail-saving-hint"><I18nText k="dashboard.loading" /></div>
        </div>

        <div id="team-co-coaches-anchor" class="detail-co-coaches-wrap">
          <div v-if="route.query.focus === 'coCoaches'" class="detail-co-coach-banner" role="note">
            <p class="detail-co-coach-banner-text"><I18nText k="teamDetail.coCoachFocusBanner" /></p>
            <button type="button" class="detail-btn detail-btn-ghost detail-co-coach-banner-dismiss" @click="dismissCoCoachBanner">
              <I18nText k="teamDetail.coCoachFocusDismiss" />
            </button>
          </div>
          <h4 class="detail-subsection-title"><I18nText k="detail.coCoaches" /></h4>
        </div>
        <p v-if="!(team.co_coaches && team.co_coaches.length)" class="detail-empty-hint"><I18nText k="detail.noData" /></p>
        <p v-else class="detail-coaches">
          <span v-for="(c, i) in team.co_coaches" :key="'c-' + i">{{ c.name || [c.firstname, c.lastname].filter(Boolean).join(' ') }}{{ c.email ? ' (' + c.email + ')' : '' }}</span>
        </p>
      </section>
      </div>
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
.detail-players-list {
  list-style: none;
  margin: 0 0 0.75rem;
  padding: 0;
}
.detail-player-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--color-border);
}
.detail-player-row:last-child {
  border-bottom: none;
}
.detail-player-name {
  font-weight: 500;
  min-width: 8rem;
}
.detail-player-meta {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}
.detail-player-input {
  font-size: var(--text-sm);
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  min-width: 6rem;
}
.detail-player-select-wrap {
  min-width: 7rem;
}
.detail-player-select-wrap :deep(.custom-select-trigger) {
  min-height: auto;
}
.detail-player-actions {
  display: flex;
  gap: 0.25rem;
  margin-left: auto;
}
.detail-players-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
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
.detail-coaches {
  font-size: var(--text-base);
  color: var(--color-text);
  margin: 0.25rem 0 0;
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
