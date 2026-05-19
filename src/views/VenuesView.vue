<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  isAuthenticated,
  login,
  logout,
  hasCoachRole,
} from '@/auth/keycloak'
import { fetchPublicVenues } from '@/services/publicVenues'
import VenuesMap from '@/components/VenuesMap.vue'
import VenueDetailModal from '@/components/VenueDetailModal.vue'
import {
  venueMatchesFilters,
  clusterVenuesForMap,
  venueDisplayName,
  venueCapacityLabel,
  formatVenueDate,
  isFutureEditionVenue,
} from '@/utils/venueFilters'

const route = useRoute()
const { t, locale } = useI18n()

const showForbidden = computed(() => !!route.query.forbidden && authenticated.value)

const loading = ref(true)
const error = ref(null)
const venues = ref([])
const venuesMeta = ref({})

const countries = ref({ de: true, at: true, ch: true })
const offers = ref({ exhibition: true, competition: true, future: true })

const openAccordions = ref({})
const selectedVenue = ref(null)

const COUNTRY_KEYS = ['de', 'at', 'ch']
const OFFER_KEYS = ['exhibition', 'competition', 'future']

const authenticated = computed(() => isAuthenticated())
const coachAccess = computed(() => authenticated.value && hasCoachRole())
const activeFilters = computed(() => ({
  countries: new Set(COUNTRY_KEYS.filter((c) => countries.value[c])),
  offers: new Set(OFFER_KEYS.filter((o) => offers.value[o])),
}))

const filteredVenues = computed(() =>
  venues.value.filter((v) => venueMatchesFilters(v, activeFilters.value))
)

const mapClusters = computed(() => clusterVenuesForMap(filteredVenues.value))

const showFutureSection = computed(() => offers.value.future)
const showExploreSection = computed(() => offers.value.exhibition)
const showChallengeSection = computed(() => offers.value.competition)

function regioByProgram(program) {
  return filteredVenues.value
    .filter((v) => v.program === program && v.type === 'regio')
    .slice()
    .sort((a, b) => venueDisplayName(a, locale.value).localeCompare(venueDisplayName(b, locale.value), locale.value))
}

const futureEvents = computed(() =>
  filteredVenues.value
    .filter((v) => isFutureEditionVenue(v))
    .slice()
    .sort((a, b) => venueDisplayName(a, locale.value).localeCompare(venueDisplayName(b, locale.value), locale.value))
)

function eventsByCountry(list, country) {
  return list.filter((v) => v.country === country)
}

/** Länder-Akkordeons nur anzeigen, wenn Land im Kartenfilter aktiv ist und Treffer da sind. */
function countriesWithEvents(list) {
  return COUNTRY_KEYS.filter((c) => countries.value[c] && eventsByCountry(list, c).length > 0)
}

function sectionEvents(section) {
  if (section === 'future') return futureEvents.value
  return regioByProgram(section)
}

function syncAccordionsToFilters() {
  const next = { ...openAccordions.value }
  for (const section of ['future', 'explore', 'challenge']) {
    if (section === 'future' && !showFutureSection.value) continue
    if (section === 'explore' && !showExploreSection.value) continue
    if (section === 'challenge' && !showChallengeSection.value) continue
    const list = sectionEvents(section)
    for (const c of COUNTRY_KEYS) {
      const key = accordionKey(section, c)
      const count = countries.value[c] ? eventsByCountry(list, c).length : 0
      next[key] = count > 0
    }
  }
  openAccordions.value = next
}

watch([countries, offers, filteredVenues], syncAccordionsToFilters, { deep: true, immediate: true })

function accordionKey(section, country) {
  return `${section}-${country}`
}

function isAccordionOpen(section, country) {
  return !!openAccordions.value[accordionKey(section, country)]
}

function toggleAccordion(section, country) {
  const key = accordionKey(section, country)
  openAccordions.value = { ...openAccordions.value, [key]: !openAccordions.value[key] }
}

function openVenueDetail(venue) {
  if (!venue?.id) return
  selectedVenue.value = venue
}

function closeVenueDetail() {
  selectedVenue.value = null
}

function onMapVenueSelect(venue) {
  if (!venue?.id) return
  const full = venues.value.find((v) => v.id === venue.id)
  openVenueDetail(full || venue)
}

async function loadVenues() {
  loading.value = true
  error.value = null
  try {
    const res = await fetchPublicVenues()
    venues.value = res.data
    venuesMeta.value = res.meta || {}
  } catch (e) {
    error.value = e?.message || t('venues.loadError')
    venues.value = []
  } finally {
    loading.value = false
  }
}

function doLogin() {
  login()
}

onMounted(() => {
  loadVenues()
})
</script>

<template>
  <div class="venues-page venues-page--shell liquid-surface-scope">
    <main class="venues-main">
      <section class="venues-hero liquid-surface liquid-surface--accent">
        <div v-if="showForbidden" class="venues-forbidden liquid-surface liquid-surface--radius-lg liquid-surface--accent">
          <p><i class="bi bi-shield-exclamation"></i> <I18nText k="auth.forbiddenMessage" /></p>
          <button type="button" class="btn btn-secondary btn-sm" @click="logout">
            <I18nText k="auth.logout" />
          </button>
        </div>
        <div class="venues-hero-layout">
          <div class="venues-hero-main">
            <h1 class="venues-title"><I18nText k="venues.title" /></h1>
            <p class="venues-lead"><I18nText k="venues.lead" /></p>
            <div v-if="!coachAccess" class="venues-hero-actions">
              <button type="button" class="btn btn-primary venues-cta" @click="doLogin">
                <I18nText k="venues.ctaRegister" />
              </button>
            </div>
          </div>
          <div class="venues-hero-logo-wrap" aria-hidden="true">
            <img
              src="/FIRSTLego_IconVert_RGB.png"
              alt=""
              class="venues-hero-logo"
              decoding="async"
            >
          </div>
        </div>
      </section>

      <div v-if="loading" class="venues-status liquid-surface">
        <i class="bi bi-arrow-repeat spin"></i>
        <I18nText k="venues.loading" />
      </div>
      <div v-else-if="error" class="venues-status venues-status-error liquid-surface">
        <i class="bi bi-exclamation-circle"></i>
        {{ error }}
        <button type="button" class="btn btn-secondary btn-sm" @click="loadVenues">
          <I18nText k="venues.retry" />
        </button>
      </div>

      <template v-else>
        <p v-if="venuesMeta.noActiveSeason" class="venues-hint venues-hint-warn">
          <i class="bi bi-calendar-x"></i>
          <I18nText k="venues.noActiveSeason" />
        </p>
        <p v-else-if="venues.length === 0" class="venues-hint">
          <i class="bi bi-info-circle"></i>
          <I18nText k="venues.emptyListHint" />
        </p>
        <section class="venues-map-section liquid-surface liquid-surface--accent liquid-surface--accent-blue">
          <VenuesMap
            v-model:countries="countries"
            v-model:offers="offers"
            :clusters="mapClusters"
            :result-count="filteredVenues.length"
            @venue-select="onMapVenueSelect"
          />
        </section>

        <p v-if="venues.length && filteredVenues.length === 0" class="venues-hint">
          <i class="bi bi-funnel"></i>
          <I18nText k="venues.noFilterResults" />
        </p>

        <section v-if="showFutureSection" class="venues-program-section">
          <h2 class="venues-section-title"><I18nText k="venues.sectionFuture" /></h2>
          <div v-for="country in countriesWithEvents(futureEvents)" :key="'future-' + country" class="venues-accordion liquid-surface liquid-surface--radius-lg liquid-surface--accent">
            <button
              type="button"
              class="venues-accordion-head"
              :aria-expanded="isAccordionOpen('future', country)"
              @click="toggleAccordion('future', country)"
            >
              <i class="bi" :class="isAccordionOpen('future', country) ? 'bi-dash-lg' : 'bi-plus-lg'"></i>
              <I18nText :k="`venues.country.${country}`" />
              <span class="venues-accordion-count">{{ eventsByCountry(futureEvents, country).length }}</span>
            </button>
            <ul v-show="isAccordionOpen('future', country)" class="venues-accordion-body">
              <li v-for="ev in eventsByCountry(futureEvents, country)" :key="ev.id">
                <button type="button" class="venues-event-row" @click="openVenueDetail(ev)">
                <span class="venues-event-name">{{ venueDisplayName(ev, locale) }}</span>
                <span class="venues-event-meta">
                  <template v-if="ev.date">{{ formatVenueDate(ev.date, locale) }}</template>
                  <template v-if="venueCapacityLabel(ev, t)"> · {{ venueCapacityLabel(ev, t) }}</template>
                  <template v-if="ev.program === 'future5'">
                    · <I18nText k="venues.futureTrack5" />
                  </template>
                </span>
                </button>
              </li>
              <li v-if="!eventsByCountry(futureEvents, country).length" class="venues-empty">
                <I18nText k="venues.noEventsInRegion" />
              </li>
            </ul>
          </div>
        </section>

        <section
          v-for="section in ['explore', 'challenge']"
          v-show="section === 'explore' ? showExploreSection : showChallengeSection"
          :key="section"
          class="venues-program-section"
        >
          <h2 class="venues-section-title">
            <I18nText :k="section === 'explore' ? 'venues.sectionExplore' : 'venues.sectionChallenge'" />
          </h2>
          <div
            v-for="country in countriesWithEvents(regioByProgram(section))"
            :key="section + country"
            class="venues-accordion liquid-surface liquid-surface--radius-lg liquid-surface--accent"
            :class="section === 'explore' ? 'liquid-surface--accent-blue' : 'liquid-surface--accent-amber'"
          >
            <button
              type="button"
              class="venues-accordion-head"
              :aria-expanded="isAccordionOpen(section, country)"
              @click="toggleAccordion(section, country)"
            >
              <i class="bi" :class="isAccordionOpen(section, country) ? 'bi-dash-lg' : 'bi-plus-lg'"></i>
              <I18nText :k="`venues.country.${country}`" />
              <span class="venues-accordion-count">
                {{ eventsByCountry(regioByProgram(section), country).length }}
              </span>
            </button>
            <ul v-show="isAccordionOpen(section, country)" class="venues-accordion-body">
              <li v-for="ev in eventsByCountry(regioByProgram(section), country)" :key="ev.id">
                <button type="button" class="venues-event-row" @click="openVenueDetail(ev)">
                  <span class="venues-event-name">{{ venueDisplayName(ev, locale) }}</span>
                  <span class="venues-event-meta">
                    <template v-if="ev.date">{{ formatVenueDate(ev.date, locale) }}</template>
                    <template v-if="venueCapacityLabel(ev, t)"> · {{ venueCapacityLabel(ev, t) }}</template>
                  </span>
                </button>
              </li>
              <li v-if="!eventsByCountry(regioByProgram(section), country).length" class="venues-empty">
                <I18nText k="venues.noEventsInRegion" />
              </li>
            </ul>
          </div>
        </section>

      </template>
    </main>

    <VenueDetailModal
      :show="!!selectedVenue"
      :venue="selectedVenue"
      @close="closeVenueDetail"
    />
  </div>
</template>

<style scoped>
.venues-page--shell {
  min-height: 0;
}
.venues-page {
  color: var(--color-text);
}
.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.55rem 1rem;
  border-radius: var(--radius);
  font-weight: 600;
  border: none;
  cursor: pointer;
  font-size: var(--text-sm);
}
.btn-sm {
  min-height: var(--touch);
}
.btn-primary {
  background: var(--color-accent);
  color: #fff;
}
.btn-secondary {
  background: var(--color-bg-muted);
  color: var(--color-text);
}
.venues-main {
  max-width: 72rem;
  margin: 0 auto;
  padding: 1.5rem 1.25rem 3rem;
}
.venues-forbidden {
  margin-bottom: 1rem;
  padding: 1rem;
}
.venues-forbidden p {
  margin: 0 0 0.75rem;
}
.venues-hero {
  margin-bottom: 2rem;
  padding: 1.5rem 1.35rem;
}
.venues-title {
  font-size: var(--text-3xl);
  font-weight: 700;
  letter-spacing: -0.02em;
  margin: 0 0 0.75rem;
  line-height: 1.2;
}
.venues-hero-layout {
  display: flex;
  align-items: stretch;
  gap: 1.25rem 1.75rem;
}
.venues-hero-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.venues-lead {
  flex: 1;
  font-size: var(--text-lg);
  color: var(--color-text-muted);
  max-width: 42rem;
  line-height: 1.55;
  margin: 0 0 1.25rem;
}
.venues-hero-logo-wrap {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  align-self: stretch;
  min-height: 100%;
  padding: 0.15rem 0;
}
.venues-hero-logo {
  height: 100%;
  width: auto;
  max-width: min(7.5rem, 28vw);
  object-fit: contain;
  object-position: center;
}
@media (max-width: 640px) {
  .venues-hero-layout {
    flex-direction: column;
  }
  .venues-hero-logo-wrap {
    align-self: flex-end;
    min-height: 0;
    height: 4.5rem;
  }
  .venues-hero-logo {
    height: 100%;
    max-width: 4rem;
  }
}
.venues-hero-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1rem;
}
.venues-cta {
  padding: 0.85rem 1.5rem;
  font-size: var(--text-lg);
  box-shadow: 0 4px 14px rgba(255, 122, 0, 0.35);
}
.venues-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 2rem;
  justify-content: center;
  color: var(--color-text-muted);
}
.venues-status-error {
  flex-direction: column;
  color: #b91c1c;
}
.venues-hint {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.85rem 1rem;
  margin: 0 0 1.25rem;
  border-radius: var(--radius-lg);
  background: var(--liquid-tile-bg);
  backdrop-filter: blur(calc(var(--liquid-blur) * 0.48)) saturate(calc(var(--liquid-saturate) * 0.88));
  -webkit-backdrop-filter: blur(calc(var(--liquid-blur) * 0.48)) saturate(calc(var(--liquid-saturate) * 0.88));
  border: 1px solid var(--liquid-border);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  line-height: 1.5;
  box-shadow: var(--shadow-sm);
}
.venues-hint-warn {
  border-color: rgba(255, 122, 0, 0.35);
  color: var(--color-text);
}
.venues-map-section {
  position: relative;
  --venues-map-height: min(52vh, 480px);
  margin-bottom: 2.5rem;
  min-height: var(--venues-map-height);
  height: var(--venues-map-height);
  overflow: hidden;
}
@media (min-width: 900px) {
  .venues-map-section {
    --venues-map-height: 420px;
  }
}
.venues-map-section :deep(.venues-map-wrap) {
  position: absolute;
  inset: 0;
}
.venues-program-section {
  margin-bottom: 2rem;
}
.venues-section-title {
  font-size: var(--text-2xl);
  font-weight: 700;
  margin: 0 0 1rem;
}
.venues-accordion {
  margin-bottom: 0.5rem;
  overflow: hidden;
}
.venues-accordion-head {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.85rem 1rem;
  border: none;
  background: transparent;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
  color: var(--color-text);
}
.venues-accordion-count {
  margin-left: auto;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  font-weight: 500;
}
.venues-accordion-body {
  list-style: none;
  margin: 0;
  padding: 0 1rem 0.75rem;
  border-top: 1px solid var(--color-border);
}
.venues-event-row {
  width: 100%;
  margin: 0;
  padding: 0.5rem 0;
  border: none;
  border-bottom: 1px solid var(--color-border);
  border-radius: 0;
  background: transparent;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.15rem;
  text-align: left;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.venues-event-row:hover {
  background: var(--color-bg-muted);
}
.venues-event-row:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}
.venues-accordion-body > li:last-child .venues-event-row {
  border-bottom: none;
}
.venues-event-name {
  font-weight: 600;
}
.venues-event-meta {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}
.venues-empty,
.venues-empty-cell {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}
.venues-table-section {
  margin-bottom: 2.5rem;
}
.venues-table-wrap {
  overflow-x: auto;
}
.venues-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
}
.venues-table th,
.venues-table td {
  padding: 0.75rem 1rem;
  text-align: left;
  border-bottom: 1px solid var(--color-border);
}
.venues-table thead th {
  background: var(--color-bg-muted);
  font-weight: 600;
}
.venues-table tbody tr:nth-child(even) {
  background: var(--color-bg-muted);
}
.spin {
  animation: venues-spin 0.8s linear infinite;
}
@keyframes venues-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
