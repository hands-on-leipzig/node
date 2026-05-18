<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import EventSelectDropdown from '@/components/EventSelectDropdown.vue'
import { getEventsNearest, registerGroupForEvent } from '@/services/draht'
import {
  FUTURE_TEAM_EVENT_UNIT_EUR,
  FUTURE_PUPIL_COUNTS,
  FUTURE_EVENT_TEAM_SIZE,
  futureMaxEventTeams,
  futureMaxSelectableEventTeams,
  minPupilsForEventTeamCount,
} from '@/config/futureEditionConfig'
import { extractEventList, normalizeEvents, formatEventOptionLabel } from '@/utils/events'

const props = defineProps({
  groupId: { type: [String, Number], required: true },
  group: { type: Object, required: true },
})

const emit = defineEmits(['updated'])

const { t } = useI18n()

const panelOpen = ref(false)
const events = ref([])
const eventsLoading = ref(false)

/** Total teams to register (initial) or additional teams (when already registered). */
const selectedTeamCount = ref(1)
/** Per-team event picks (wizard-style). */
const teamEvents = ref([{ eventId: null }])
const teamAutoUpgrade = ref(null)

const submitting = ref(false)
const submitError = ref(null)
const submitSuccess = ref(false)

const registeredPupils = computed(() => {
  const n = Number(props.group?.registeredPupils || 0)
  return Number.isFinite(n) && n > 0 ? n : 0
})

const currentEventTeamCount = computed(() => {
  const n = Number(props.group?.eventTeamCount || 0)
  return Number.isFinite(n) && n > 0 ? n : 0
})

const maxTeamsByPupils = computed(() =>
  registeredPupils.value > 0 ? futureMaxEventTeams(registeredPupils.value) : 1,
)

const maxTeamsSelectable = computed(() => futureMaxSelectableEventTeams())

const hasEventRegistration = computed(
  () => currentEventTeamCount.value > 0 && props.group?.event && (props.group.event.label || props.group.event.ref || props.group.event.id),
)

const currentEventLabel = computed(() => {
  const ev = props.group?.event
  if (!ev) return ''
  return ev.label || ev.ref || (ev.id != null ? `Event ${ev.id}` : '')
})

const unitEur = computed(() => Number(props.group?.eventTeamUnitEur) || FUTURE_TEAM_EVENT_UNIT_EUR)

const currentEventCostEur = computed(() => currentEventTeamCount.value * unitEur.value)

/** Initial registration (no teams yet). */
const isInitialRegistration = computed(() => !hasEventRegistration.value)

const maxAdditionalTeams = computed(() =>
  Math.max(0, maxTeamsSelectable.value - currentEventTeamCount.value),
)

const teamOptionCounts = computed(() => {
  if (isInitialRegistration.value) {
    return Array.from(
      new Set(
        FUTURE_PUPIL_COUNTS.map((n) => Math.floor(n / 8)).filter((n) => n > 0),
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
    return Number.isFinite(id) && id > 0
  })
})

const canSubmit = computed(() => {
  if (submitting.value) return false
  if (!selectedTeamCount.value || selectedTeamCount.value < 1) return false
  if (isInitialRegistration.value) {
    if (selectedTeamCount.value > maxTeamsByPupils.value && !teamAutoUpgrade.value) return false
    return allTeamEventsSelected.value
  }
  if (maxAdditionalTeams.value <= 0) return false
  return selectedTeamCount.value <= maxAdditionalTeams.value
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
    events.value = normalizeEvents(extractEventList(res?.data))
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
    const neededPupils = n * 8
    if (!FUTURE_PUPIL_COUNTS.includes(neededPupils)) return
    selectedTeamCount.value = n
    teamAutoUpgrade.value = { teams: n, pupils: neededPupils }
    syncTeamEventsArray()
    return
  }

  if (n <= maxAdditionalTeams.value) {
    selectedTeamCount.value = n
  }
}

function syncTeamEventsArray() {
  const count = Math.max(1, Number(selectedTeamCount.value) || 1)
  const currentEventId = props.group?.event?.id != null ? Number(props.group.event.id) : null
  while (teamEvents.value.length < count) {
    teamEvents.value.push({
      eventId: !isInitialRegistration.value && currentEventId > 0 ? currentEventId : null,
    })
  }
  teamEvents.value = teamEvents.value.slice(0, count)
}

function selectTeamEvent(teamIndex, eventId) {
  const idx = Number(teamIndex)
  if (!Number.isFinite(idx) || idx < 0 || !teamEvents.value[idx]) return
  teamEvents.value[idx] = { eventId: eventId ? Number(eventId) : null }
}

function primaryEventIdForSubmit() {
  const ids = teamEvents.value
    .map((e) => Number(e?.eventId))
    .filter((id) => Number.isFinite(id) && id > 0)
  if (!ids.length) {
    const cur = props.group?.event?.id
    return cur != null ? Number(cur) : null
  }
  return ids[0]
}

async function submit() {
  const eventId = primaryEventIdForSubmit()
  if (!props.groupId || !eventId) return

  submitting.value = true
  submitError.value = null
  submitSuccess.value = false
  try {
    const totalTeams = totalTeamsAfterSubmit.value
    const neededPupils = pupilsRequiredAfterSubmit.value
    const currentPupils = registeredPupils.value
    const payload = {
      registeredPupils: neededPupils > currentPupils ? neededPupils : undefined,
    }
    const res = await registerGroupForEvent(props.groupId, eventId, totalTeams, payload)
    emit('updated', res.data)
    submitSuccess.value = true
    selectedTeamCount.value = 1
    teamAutoUpgrade.value = null
    syncTeamEventsArray()
    setTimeout(() => {
      submitSuccess.value = false
    }, 4000)
  } catch (e) {
    submitError.value =
      e.response?.data?.message || e.response?.data?.error?.message || e.message || t('groupDetail.registerEventFailed')
  } finally {
    submitting.value = false
  }
}

function togglePanel() {
  panelOpen.value = !panelOpen.value
  if (panelOpen.value && events.value.length === 0) {
    loadEvents()
  }
}

watch(
  () => props.group?.id,
  () => {
    selectedTeamCount.value = 1
    teamAutoUpgrade.value = null
    syncTeamEventsArray()
  },
)

watch(selectedTeamCount, () => {
  if (isInitialRegistration.value) syncTeamEventsArray()
})

onMounted(() => {
  syncTeamEventsArray()
})
</script>

<template>
  <div class="future-event-teams">
    <h3 class="detail-section-title"><I18nText k="groupDetail.eventTeamsTitle" /></h3>

    <div v-if="hasEventRegistration" class="future-event-status future-event-status--active">
      <div class="future-event-status-main">
        <i class="bi bi-calendar-check" aria-hidden="true" />
        <div>
          <p class="future-event-status-headline">
            <I18nText
              k="groupDetail.eventTeamsStatusRegistered"
              :values="{
                count: currentEventTeamCount,
                event: currentEventLabel,
              }"
            />
          </p>
          <p class="future-event-status-meta">
            <I18nText
              k="groupDetail.eventTeamsStatusMeta"
              :values="{
                pupils: registeredPupils,
                maxTeams: maxTeamsByPupils,
                cost: currentEventCostEur,
              }"
            />
          </p>
        </div>
      </div>
    </div>
    <div v-else class="future-event-status future-event-status--empty">
      <i class="bi bi-calendar-x" aria-hidden="true" />
      <p><I18nText k="groupDetail.eventTeamsStatusNone" /></p>
    </div>

    <button type="button" class="future-event-panel-toggle" :aria-expanded="panelOpen" @click="togglePanel">
      <i class="bi" :class="panelOpen ? 'bi-chevron-up' : 'bi-chevron-down'" aria-hidden="true" />
      <span>
        <I18nText v-if="isInitialRegistration" k="groupDetail.eventTeamsPanelRegister" />
        <I18nText v-else k="groupDetail.eventTeamsPanelAddMore" />
      </span>
    </button>

    <div v-show="panelOpen" class="future-event-panel-body">
      <p class="future-event-hint">
        <I18nText
          k="groupDetail.teamCountHint"
          :values="{
            pupils: registeredPupils || '—',
            maxCurrent: maxTeamsByPupils,
            maxSelectable: maxTeamsSelectable,
          }"
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

        <template v-if="isInitialRegistration">
          <p v-if="selectedTeamCount > 1" class="future-event-label">
            <I18nText k="wizard.onSiteEventPerTeam" />
          </p>
          <div v-if="selectedTeamCount > 0" class="future-event-team-rows">
            <div
              v-for="(entry, idx) in teamEvents"
              :key="'fe-event-row-' + idx"
              class="future-event-team-card"
            >
              <div
                class="future-event-team-grid"
                :class="{ 'future-event-team-grid--solo': selectedTeamCount === 1 }"
              >
                <div v-if="selectedTeamCount > 1" class="future-event-team-meta">
                  <span class="future-event-team-name">{{ t('wizard.teamSingular') }} {{ idx + 1 }}</span>
                </div>
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
        </template>

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
</template>

<style scoped>
.future-event-teams {
  margin-bottom: 0;
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
  gap: 0.12rem;
  min-width: 4.5rem;
  padding: 0.45rem 0.75rem;
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
  font-size: 0.7rem;
  font-weight: 500;
  line-height: 1.2;
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
