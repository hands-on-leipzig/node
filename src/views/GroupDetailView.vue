<script setup>
import { ref, onMounted, computed, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { getGroup, getEvents, registerGroupForEvent } from '@/services/draht'
import { formatOverviewAddress } from '@/utils/formatOverviewAddress'
import TeklaTimeline from '@/components/TeklaTimeline.vue'
import EventSelectDropdown from '@/components/EventSelectDropdown.vue'
import { FUTURE_TEAM_EVENT_UNIT_EUR, futureMaxEventTeams } from '@/config/futureEditionConfig'

const route = useRoute()
const { t, locale } = useI18n()
const group = ref(null)
const loading = ref(true)
const error = ref(null)
const events = ref([])
const eventsLoading = ref(false)
const registerEventId = ref('')
const registerEventTeamCount = ref(1)
const registeringEvent = ref(false)
const registerEventError = ref(null)
const registerEventSuccess = ref(false)

const id = computed(() => route.params.id)

const timelineSteps = computed(() => {
  const tl = group.value?.timeline
  if (!tl) return []
  return Array.isArray(tl.timeline) ? tl.timeline : (Array.isArray(tl) ? tl : [])
})

const registeredPupils = computed(() => {
  const n = Number(group.value?.registeredPupils || 0)
  return Number.isFinite(n) && n > 0 ? n : 0
})

const maxEventTeams = computed(() => {
  const backendVal = Number(group.value?.maxEventTeams || 0)
  if (Number.isFinite(backendVal) && backendVal > 0) return backendVal
  return registeredPupils.value > 0 ? futureMaxEventTeams(registeredPupils.value) : 1
})

const eventTeamCountOptions = computed(() => {
  const max = Math.max(1, maxEventTeams.value)
  return Array.from({ length: max }, (_, idx) => idx + 1)
})

const estimatedEventCostEur = computed(() => {
  const count = Number(registerEventTeamCount.value || 0)
  if (!Number.isFinite(count) || count <= 0) return 0
  return count * FUTURE_TEAM_EVENT_UNIT_EUR
})

function formatAddress(addr) {
  return formatOverviewAddress(addr, locale.value)
}

function scrollToCoCoachesSection() {
  if (route.query.focus !== 'coCoaches' || loading.value || !group.value) return
  nextTick(() => {
    document.getElementById('group-co-coaches-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}

async function fetchGroup() {
  if (!id.value) return
  loading.value = true
  error.value = null
  group.value = null
  try {
    const res = await getGroup(id.value)
    group.value = res.data
  } catch (e) {
    error.value = e.response?.status === 404 ? t('detail.notFound') : (e.message || t('errors.loadFailed'))
  } finally {
    loading.value = false
    if (group.value) scrollToCoCoachesSection()
  }
}

async function loadEvents() {
  eventsLoading.value = true
  events.value = []
  registerEventError.value = null
  try {
    const res = await getEvents()
    const data = res.data
    const list = Array.isArray(data) ? data : (data?.data ?? (data?.events ?? []))
    events.value = Array.isArray(list) ? list : []
  } catch (_) {
    events.value = []
  } finally {
    eventsLoading.value = false
  }
}

async function submitRegisterForEvent() {
  const eventId = registerEventId.value?.trim()
  if (!id.value || !eventId) return
  registeringEvent.value = true
  registerEventError.value = null
  registerEventSuccess.value = false
  try {
    const teamCount = Math.min(Math.max(1, Number(registerEventTeamCount.value || 1)), maxEventTeams.value)
    const res = await registerGroupForEvent(id.value, eventId, teamCount)
    group.value = res.data
    registerEventSuccess.value = true
    setTimeout(() => { registerEventSuccess.value = false }, 3000)
  } catch (e) {
    registerEventError.value = e.response?.data?.message || e.message || t('groupDetail.registerEventFailed')
  } finally {
    registeringEvent.value = false
  }
}

/** Event display label with optional capacity (from flow API). */
function eventLabel(ev) {
  const name = ev?.label || ev?.name || ev?.title || ev?.ref || (ev?.id != null ? `Event ${ev.id}` : '')
  const used = ev?.registered ?? ev?.used ?? ev?.count ?? ev?.teams_count
  const max = ev?.capacity ?? ev?.max ?? ev?.max_teams ?? ev?.slots
  if (typeof used === 'number' && typeof max === 'number') {
    return `${name} (${t('wizard.eventCapacitySlots', { used, max })})`
  }
  return name
}

onMounted(async () => {
  await fetchGroup()
  loadEvents()
})
watch(id, async () => {
  await fetchGroup()
  loadEvents()
})
watch(
  () => route.query.focus,
  () => {
    if (group.value && route.query.focus === 'coCoaches') scrollToCoCoachesSection()
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
    <template v-else-if="group">
      <div class="detail-header">
        <div class="detail-icon detail-icon-group">
          <i class="bi bi-stars"></i>
        </div>
        <div class="detail-heading">
          <h2 class="detail-title">{{ group.label || group.name || group.ref }}</h2>
          <p v-if="group.ref" class="detail-ref">{{ group.ref }}</p>
        </div>
      </div>

      <TeklaTimeline
        v-if="timelineSteps.length"
        :steps="timelineSteps"
        :locale="locale"
        tekla-type="groups"
        :tekla-id="group.id"
        class="detail-timeline-first"
      />

      <div class="detail-overview">
        <section class="detail-section">
          <dl class="detail-meta">
            <dt><I18nText k="detail.coach" /></dt>
            <dd>
              <template v-if="group.coach">
                <template
                  v-if="group.coach.name || [group.coach.firstname, group.coach.lastname].filter(Boolean).join(' ')"
                >
                  {{ group.coach.name || [group.coach.firstname, group.coach.lastname].filter(Boolean).join(' ') }}
                </template>
                <I18nText v-else k="detail.noData" />
                <span v-if="group.coach.email" class="detail-meta-extra">{{ group.coach.email }}</span>
              </template>
              <template v-else><I18nText k="detail.noData" /></template>
            </dd>
            <dt><I18nText k="enroll.organization" /></dt>
            <dd>
              <template v-if="group.organization && group.organization.name">{{ group.organization.name }}</template>
              <I18nText v-else k="detail.noData" />
            </dd>
            <dt><I18nText k="detail.ort" /></dt>
            <dd>
              <template v-if="group.ort">{{ group.ort }}</template>
              <I18nText v-else k="detail.noData" />
            </dd>
            <dt><I18nText k="detail.institution" /></dt>
            <dd>
              <template v-if="group.institution">{{ group.institution }}</template>
              <I18nText v-else k="detail.noData" />
            </dd>
          </dl>
        </section>

        <section class="detail-section">
          <h3 class="detail-section-title"><I18nText k="groupDetail.event" /></h3>
          <p v-if="group.event && (group.event.label || group.event.ref)" class="detail-event-current">
            {{ group.event.label || group.event.ref }}
          </p>
          <p class="detail-hint"><I18nText k="groupDetail.registerForEventHint" /></p>
          <p class="detail-hint detail-hint-sm">
            <I18nText
              k="groupDetail.teamCountHint"
              :params="{ pupils: registeredPupils || '—', maxTeams: maxEventTeams }"
            />
          </p>
          <div class="detail-register-event">
            <EventSelectDropdown
              :title="t('wizard.eventSelectAllEvents')"
              :events="events"
              :loading="eventsLoading"
              :model-value="registerEventId"
              :placeholder="t('groupDetail.selectEvent')"
              :event-label-fn="eventLabel"
              @update:model-value="registerEventId = $event"
            />
            <div class="detail-event-team-count">
              <label for="group-event-team-count"><I18nText k="groupDetail.eventTeamsLabel" /></label>
              <select id="group-event-team-count" v-model.number="registerEventTeamCount">
                <option v-for="n in eventTeamCountOptions" :key="'event-team-count-' + n" :value="n">
                  {{ n }}
                </option>
              </select>
              <p class="detail-hint detail-hint-sm">
                <I18nText k="groupDetail.eventCostHint" :params="{ cost: estimatedEventCostEur }" />
              </p>
            </div>
            <button
              type="button"
              class="detail-btn detail-btn-primary"
              :disabled="!registerEventId || registeringEvent"
              @click="submitRegisterForEvent"
            >
              <i v-if="registeringEvent" class="bi bi-arrow-repeat spin"></i>
              <i v-else class="bi bi-calendar-check"></i>
              <I18nText v-if="registeringEvent" k="groupDetail.registering" />
              <I18nText v-else k="groupDetail.registerForEventButton" />
            </button>
          </div>
          <p v-if="registerEventError" class="detail-message detail-message-error"><i class="bi bi-exclamation-circle"></i> {{ registerEventError }}</p>
          <p v-if="registerEventSuccess" class="detail-message detail-message-success"><i class="bi bi-check-circle-fill"></i> <I18nText k="groupDetail.registerEventSuccess" /></p>
        </section>

        <section class="detail-section">
          <h3 class="detail-section-title"><I18nText k="enroll.invoiceAddress" /> / <I18nText k="enroll.deliveryAddress" /></h3>
          <p class="detail-address-label"><I18nText k="detail.billingAddress" /></p>
          <p class="detail-address">
            <template
              v-if="group.overview && group.overview.billing_address && formatAddress(group.overview.billing_address)"
            >
              {{ formatAddress(group.overview.billing_address) }}
            </template>
            <I18nText v-else k="detail.noData" />
          </p>
          <p class="detail-address-label"><I18nText k="detail.deliveryAddress" /></p>
          <p class="detail-address">
            <template
              v-if="group.overview && group.overview.delivery_address && formatAddress(group.overview.delivery_address)"
            >
              {{ formatAddress(group.overview.delivery_address) }}
            </template>
            <I18nText v-else k="detail.noData" />
          </p>
        </section>

        <section class="detail-section">
          <h3 class="detail-section-title"><I18nText k="detail.note" /></h3>
          <p class="detail-notes">
            <template v-if="group.note_public">{{ group.note_public }}</template>
            <I18nText v-else k="detail.noData" />
          </p>
        </section>

        <section id="group-co-coaches-anchor" class="detail-section detail-co-coaches-wrap">
          <h3 class="detail-section-title"><I18nText k="detail.coCoaches" /></h3>
          <p v-if="!(group.co_coaches && group.co_coaches.length)" class="detail-notes">
            <I18nText k="detail.noData" />
          </p>
          <p v-else class="detail-coaches">
            <span v-for="(c, i) in group.co_coaches" :key="'c-' + i">
              {{ c.name || [c.firstname, c.lastname].filter(Boolean).join(' ') }}{{ c.email ? ' (' + c.email + ')' : '' }}
            </span>
          </p>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.detail-view { max-width: 42rem; }
.detail-overview { display: grid; gap: 1.5rem 2rem; }
.detail-loading,
.detail-error { display: flex; align-items: center; gap: 0.5rem; color: var(--color-text-muted); }
.detail-error { color: var(--color-error, #dc2626); }
.spin { animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.detail-header { display: flex; align-items: flex-start; gap: 1rem; margin-bottom: 1.5rem; }
.detail-icon { width: 3rem; height: 3rem; border-radius: var(--radius-lg); display: flex; align-items: center; justify-content: center; font-size: 1.5rem; flex-shrink: 0; }
.detail-icon-group { background: rgba(34, 197, 94, 0.15); color: #22c55e; }
.detail-heading { min-width: 0; }
.detail-title { font-size: var(--text-2xl); font-weight: 600; color: var(--color-text); margin: 0 0 0.25rem; }
.detail-ref { font-size: var(--text-base); color: var(--color-text-muted); margin: 0; }
.detail-section { margin-bottom: 1.5rem; padding: 1rem 0; border-top: 1px solid var(--color-border); }
.detail-section-title { font-size: var(--text-sm); font-weight: 600; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.03em; margin: 0 0 0.75rem; }
.detail-meta { display: grid; grid-template-columns: auto 1fr; gap: 0.35rem 1.5rem; margin: 0; }
.detail-meta dt { font-size: var(--text-sm); color: var(--color-text-muted); margin: 0; }
.detail-meta dd { font-size: var(--text-base); color: var(--color-text); margin: 0; }
.detail-meta-extra { display: block; font-size: var(--text-sm); color: var(--color-text-muted); margin-top: 0.15rem; }
.detail-address-label { font-size: var(--text-sm); font-weight: 600; color: var(--color-text-muted); margin: 0 0 0.25rem; }
.detail-address { font-size: var(--text-base); color: var(--color-text); margin: 0 0 0.75rem; white-space: pre-line; }
.detail-address:last-child { margin-bottom: 0; }
.detail-notes { font-size: var(--text-base); color: var(--color-text-muted); margin: 1rem 0 0; padding-top: 1rem; border-top: 1px solid var(--color-border); }
.detail-co-coaches-wrap { margin-top: 0.25rem; }
.detail-coaches { margin: 0; font-size: var(--text-base); color: var(--color-text); }
.detail-coaches span + span::before { content: ', '; }
.detail-event-current {
  margin: 0 0 0.65rem;
  font-size: var(--text-base);
  color: var(--color-text);
  font-weight: 600;
}
.detail-hint {
  margin: 0 0 0.5rem;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  line-height: 1.45;
}
.detail-hint-sm {
  font-size: 0.82rem;
  margin-bottom: 0.75rem;
}
.detail-register-event {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}
.detail-event-team-count label {
  display: block;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  margin-bottom: 0.35rem;
}
.detail-event-team-count select {
  width: 100%;
  max-width: 10rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: 0.5rem 0.6rem;
  background: var(--color-bg);
  color: var(--color-text);
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
.detail-message-error { color: var(--color-error, #dc2626); }
.detail-message-success { color: #16a34a; }
@media (min-width: 960px) {
  .detail-view { max-width: 78rem; }
  .detail-overview { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
