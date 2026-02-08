<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { getTeam, updateTeamPlayers, updateTeamVersandaufschub } from '@/services/draht'
import TeklaTimeline from '@/components/TeklaTimeline.vue'
import CustomSelect from '@/components/CustomSelect.vue'

const route = useRoute()
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

const id = computed(() => route.params.id)

const displayedPlayers = computed(() => {
  const list = editingPlayers.value.length ? editingPlayers.value : (team.value?.players || [])
  return list
})

const timelineSteps = computed(() => {
  const t = team.value?.timeline
  if (!t) return []
  return Array.isArray(t.timeline) ? t.timeline : (Array.isArray(t) ? t : [])
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
  if (!addr) return ''
  const parts = [
    addr.name,
    [addr.street, addr.number].filter(Boolean).join(' '),
    addr.line2,
    addr.line3,
    [addr.zip, addr.town].filter(Boolean).join(' '),
    addr.country,
  ].filter(Boolean)
  return parts.join(', ')
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
  isAddingPlayer.value = true
  newPlayer.value = { firstname: '', name: '', gender: '', birthdayStr: '' }
}

function addPlayer() {
  const e = newPlayer.value
  let copy = editingPlayers.value.length ? [...editingPlayers.value] : [...(team.value?.players || [])]
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
  const list = displayedPlayers.value
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
  }
}

onMounted(fetchTeam)
watch(id, fetchTeam)
</script>

<template>
  <div class="detail-view">
    <div v-if="loading" class="detail-loading">
      <i class="bi bi-arrow-repeat spin"></i>
      {{ t('dashboard.loading') }}
    </div>
    <div v-else-if="error" class="detail-error">
      <i class="bi bi-exclamation-circle"></i>
      {{ error }}
    </div>
    <template v-else-if="team">
      <!-- 1) Name of tekla + number -->
      <div class="detail-header">
        <div class="detail-icon detail-icon-team">
          <i class="bi bi-person-fill"></i>
        </div>
        <div class="detail-heading">
          <h2 class="detail-title">{{ team.label || team.name || team.ref }}</h2>
          <p v-if="team.ref" class="detail-ref">{{ team.ref }}</p>
        </div>
      </div>

      <!-- 2) Timeline -->
      <TeklaTimeline
        v-if="timelineSteps.length"
        :steps="timelineSteps"
        :locale="locale"
        tekla-type="teams"
        :tekla-id="team.id"
        :versandaufschub="team.versandaufschub ?? null"
        class="detail-timeline-first"
        @versandaufschub-save="saveVersandaufschub"
      />

      <div class="detail-overview">
      <!-- 3) Coach infos (all fields, placeholder when missing) -->
      <section class="detail-section">
        <dl class="detail-meta">
          <dt>{{ t('detail.coach') }}</dt>
          <dd>
            <template v-if="team.coach">
              {{ team.coach.name || [team.coach.firstname, team.coach.lastname].filter(Boolean).join(' ') || t('detail.noData') }}
              <span v-if="team.coach.email" class="detail-meta-extra">{{ team.coach.email }}</span>
            </template>
            <template v-else>{{ t('detail.noData') }}</template>
          </dd>
          <dt>{{ t('enroll.organization') }}</dt>
          <dd>{{ (team.organization && team.organization.name) || t('detail.noData') }}</dd>
          <dt>{{ t('detail.event') }}</dt>
          <dd>{{ (team.event && (team.event.label || team.event.ref)) || t('detail.noData') }}</dd>
          <dt>{{ t('detail.ort') }}</dt>
          <dd>{{ team.ort || t('detail.noData') }}</dd>
          <dt>{{ t('detail.institution') }}</dt>
          <dd>{{ team.institution || t('detail.noData') }}</dd>
        </dl>
      </section>

      <!-- 4) Invoice + shipping address (always both, placeholder when missing) -->
      <section class="detail-section">
        <h3 class="detail-section-title">{{ t('enroll.invoiceAddress') }} / {{ t('enroll.deliveryAddress') }}</h3>
        <p class="detail-address-label">{{ t('detail.billingAddress') }}</p>
        <p class="detail-address">{{ (team.overview && team.overview.billing_address && formatAddress(team.overview.billing_address)) || t('detail.noData') }}</p>
        <p class="detail-address-label">{{ t('detail.deliveryAddress') }}</p>
        <p class="detail-address">{{ (team.overview && team.overview.delivery_address && formatAddress(team.overview.delivery_address)) || t('detail.noData') }}</p>
      </section>

      <!-- Players + co-coaches (team only) -->
      <section class="detail-section detail-section-wide">
        <h3 class="detail-section-title">{{ t('detail.players') }}</h3>
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
                  <button type="button" class="detail-btn detail-btn-primary" @click="saveEditPlayer">{{ t('common.save') }}</button>
                  <button type="button" class="detail-btn" @click="cancelEditPlayer">{{ t('common.cancel') }}</button>
                </div>
              </template>
              <template v-else>
                <span class="detail-player-name">{{ playerDisplayName(p) }}</span>
                <span class="detail-player-meta">{{ playerMeta(p) }}</span>
                <div class="detail-player-actions">
                  <button type="button" class="detail-btn detail-btn-ghost" @click="startEditPlayer(idx)" :aria-label="t('detail.edit')"><i class="bi bi-pencil"></i></button>
                  <button type="button" class="detail-btn detail-btn-ghost" @click="removePlayer(idx)" :aria-label="t('detail.remove')"><i class="bi bi-trash"></i></button>
                </div>
              </template>
            </li>
          </ul>
          <p v-else class="detail-empty-hint">{{ t('detail.noData') }}</p>
          <div class="detail-players-toolbar">
            <button v-if="!isAddingPlayer" type="button" class="detail-btn detail-btn-primary" @click="startAddPlayer">{{ t('detail.addPlayer') }}</button>
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
              <button type="button" class="detail-btn detail-btn-primary" @click="addPlayer">{{ t('detail.add') }}</button>
              <button type="button" class="detail-btn" @click="cancelAddPlayer">{{ t('common.cancel') }}</button>
            </template>
          </div>
          <div v-if="savingPlayers" class="detail-saving-hint">{{ t('dashboard.loading') }}</div>
        </div>

        <h4 class="detail-subsection-title">{{ t('detail.coCoaches') }}</h4>
        <p v-if="!(team.co_coaches && team.co_coaches.length) && !(team.manual_co_coaches && team.manual_co_coaches.length)" class="detail-empty-hint">{{ t('detail.noData') }}</p>
        <template v-else>
          <p v-if="team.co_coaches && team.co_coaches.length" class="detail-coaches">
            <span v-for="(c, i) in team.co_coaches" :key="'c-' + i">{{ c.name || [c.firstname, c.lastname].filter(Boolean).join(' ') }}{{ c.email ? ' (' + c.email + ')' : '' }}</span>
          </p>
          <p v-if="team.manual_co_coaches && team.manual_co_coaches.length" class="detail-coaches">
            <span v-for="(c, i) in team.manual_co_coaches" :key="'m-' + i">{{ [c.firstname, c.name].filter(Boolean).join(' ') }}</span>
          </p>
        </template>
      </section>

      <!-- 5) Note (always shown, placeholder when missing) -->
      <section class="detail-section">
        <h3 class="detail-section-title">{{ t('detail.note') }}</h3>
        <p class="detail-notes">{{ team.note_public || t('detail.noData') }}</p>
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
.detail-header {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 1.5rem;
}
.detail-icon {
  width: 3rem;
  height: 3rem;
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  flex-shrink: 0;
}
.detail-icon-team {
  background: var(--color-accent-soft);
  color: var(--color-accent);
}
.detail-heading {
  min-width: 0;
}
.detail-title {
  font-size: var(--text-2xl);
  font-weight: 600;
  color: var(--color-text);
  margin: 0 0 0.25rem;
}
.detail-ref {
  font-size: var(--text-base);
  color: var(--color-text-muted);
  margin: 0;
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
.detail-notes {
  font-size: var(--text-base);
  color: var(--color-text-muted);
  margin: 0;
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
  color: var(--color-bg);
  border-color: var(--color-accent);
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
</style>
