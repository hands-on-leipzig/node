<script setup>
import { ref, computed, onMounted } from 'vue'
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
import {
  venueMatchesFilters,
  clusterVenuesForMap,
  venueDisplayName,
  venueCapacityLabel,
  formatVenueDate,
  OFFER_COLORS,
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

const qualiEvents = computed(() =>
  filteredVenues.value
    .filter((v) => v.type === 'quali')
    .slice()
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
)

const finalEvents = computed(() =>
  filteredVenues.value
    .filter((v) => v.type === 'final')
    .slice()
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
)

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

function offerStyle(key) {
  return { '--offer-color': OFFER_COLORS[key] || OFFER_COLORS.other }
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
  <div class="venues-page venues-page--shell">
    <main class="venues-main">
      <section class="venues-hero">
        <div v-if="showForbidden" class="venues-forbidden">
          <p><i class="bi bi-shield-exclamation"></i> <I18nText k="auth.forbiddenMessage" /></p>
          <button type="button" class="btn btn-secondary btn-sm" @click="logout">
            <I18nText k="auth.logout" />
          </button>
        </div>
        <h1 class="venues-title"><I18nText k="venues.title" /></h1>
        <p class="venues-lead"><I18nText k="venues.lead" /></p>
        <div v-if="!coachAccess" class="venues-hero-actions">
          <button type="button" class="btn btn-primary venues-cta" @click="doLogin">
            <I18nText k="venues.ctaRegister" />
          </button>
        </div>
      </section>

      <div v-if="loading" class="venues-status">
        <i class="bi bi-arrow-repeat spin"></i>
        <I18nText k="venues.loading" />
      </div>
      <div v-else-if="error" class="venues-status venues-status-error">
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
        <section class="venues-map-section">
          <div class="venues-map-col">
            <VenuesMap :clusters="mapClusters" />
          </div>
          <aside class="venues-filters">
            <h2 class="venues-filters-title"><I18nText k="venues.filters" /></h2>
            <fieldset class="venues-filter-group">
              <legend><I18nText k="venues.filterCountries" /></legend>
              <div class="venues-filter-chips" role="group" :aria-label="t('venues.filterCountries')">
                <label v-for="c in COUNTRY_KEYS" :key="c" class="venues-filter-chip venues-filter-chip--country">
                  <input v-model="countries[c]" type="checkbox" class="venues-filter-input" />
                  <span class="venues-filter-chip-bg">
                    <span class="venues-filter-code" aria-hidden="true">{{ c.toUpperCase() }}</span>
                    <span class="venues-filter-chip-text"><I18nText :k="`venues.country.${c}`" /></span>
                    <i class="bi bi-check-lg venues-filter-check" aria-hidden="true"></i>
                  </span>
                </label>
              </div>
            </fieldset>
            <fieldset class="venues-filter-group">
              <legend><I18nText k="venues.filterOffers" /></legend>
              <div class="venues-filter-chips" role="group" :aria-label="t('venues.filterOffers')">
                <label
                  v-for="o in OFFER_KEYS"
                  :key="o"
                  class="venues-filter-chip venues-filter-chip--offer"
                  :style="offerStyle(o)"
                >
                  <input v-model="offers[o]" type="checkbox" class="venues-filter-input" />
                  <span class="venues-filter-chip-bg">
                    <span class="venues-filter-offer-dot" aria-hidden="true"></span>
                    <span class="venues-filter-chip-text"><I18nText :k="`venues.offer.${o}`" /></span>
                    <i class="bi bi-check-lg venues-filter-check" aria-hidden="true"></i>
                  </span>
                </label>
              </div>
            </fieldset>
            <p class="venues-filter-hint">
              <I18nText k="venues.resultsCount" :values="{ count: filteredVenues.length }" />
            </p>
          </aside>
        </section>

        <section class="venues-program-section">
          <h2 class="venues-section-title"><I18nText k="venues.sectionFuture" /></h2>
          <div v-for="country in COUNTRY_KEYS" :key="'future-' + country" class="venues-accordion">
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
              <li v-for="ev in eventsByCountry(futureEvents, country)" :key="ev.id" class="venues-event-row">
                <span class="venues-event-name">{{ venueDisplayName(ev, locale) }}</span>
                <span class="venues-event-meta">
                  <template v-if="ev.date">{{ formatVenueDate(ev.date, locale) }}</template>
                  <template v-if="venueCapacityLabel(ev, t)"> · {{ venueCapacityLabel(ev, t) }}</template>
                  <template v-if="ev.program === 'future5'">
                    · <I18nText k="venues.futureTrack5" />
                  </template>
                </span>
              </li>
              <li v-if="!eventsByCountry(futureEvents, country).length" class="venues-empty">
                <I18nText k="venues.noEventsInRegion" />
              </li>
            </ul>
          </div>
        </section>

        <section v-for="section in ['explore', 'challenge']" :key="section" class="venues-program-section">
          <h2 class="venues-section-title">
            <I18nText :k="section === 'explore' ? 'venues.sectionExplore' : 'venues.sectionChallenge'" />
          </h2>
          <div v-for="country in COUNTRY_KEYS" :key="section + country" class="venues-accordion">
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
              <li v-for="ev in eventsByCountry(regioByProgram(section), country)" :key="ev.id" class="venues-event-row">
                <span class="venues-event-name">{{ venueDisplayName(ev, locale) }}</span>
                <span class="venues-event-meta">
                  <template v-if="ev.date">{{ formatVenueDate(ev.date, locale) }}</template>
                  <template v-if="venueCapacityLabel(ev, t)"> · {{ venueCapacityLabel(ev, t) }}</template>
                </span>
              </li>
              <li v-if="!eventsByCountry(regioByProgram(section), country).length" class="venues-empty">
                <I18nText k="venues.noEventsInRegion" />
              </li>
            </ul>
          </div>
        </section>

        <section class="venues-table-section">
          <h2 class="venues-section-title"><I18nText k="venues.qualiTitle" /></h2>
          <div class="venues-table-wrap">
            <table class="venues-table">
              <thead>
                <tr>
                  <th><I18nText k="venues.colEvent" /></th>
                  <th><I18nText k="venues.colDate" /></th>
                  <th><I18nText k="venues.colCapacity" /></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="ev in qualiEvents" :key="'q-' + ev.id">
                  <td>{{ venueDisplayName(ev, locale) }}</td>
                  <td>{{ formatVenueDate(ev.date, locale) }}</td>
                  <td>{{ venueCapacityLabel(ev, t) || '—' }}</td>
                </tr>
                <tr v-if="!qualiEvents.length">
                  <td colspan="3" class="venues-empty-cell"><I18nText k="venues.noQuali" /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="venues-table-section">
          <h2 class="venues-section-title"><I18nText k="venues.finalTitle" /></h2>
          <div class="venues-table-wrap">
            <table class="venues-table">
              <thead>
                <tr>
                  <th><I18nText k="venues.colEvent" /></th>
                  <th><I18nText k="venues.colDate" /></th>
                  <th><I18nText k="venues.colCapacity" /></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="ev in finalEvents" :key="'f-' + ev.id">
                  <td>{{ venueDisplayName(ev, locale) }}</td>
                  <td>{{ formatVenueDate(ev.date, locale) }}</td>
                  <td>{{ venueCapacityLabel(ev, t) || '—' }}</td>
                </tr>
                <tr v-if="!finalEvents.length">
                  <td colspan="3" class="venues-empty-cell"><I18nText k="venues.noFinal" /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>
    </main>
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
  background: var(--liquid-tile-bg);
  backdrop-filter: blur(var(--liquid-blur)) saturate(var(--liquid-saturate));
  -webkit-backdrop-filter: blur(var(--liquid-blur)) saturate(var(--liquid-saturate));
  border-radius: var(--radius-xl);
  border: 1px solid var(--liquid-border);
  box-shadow: var(--liquid-shadow);
}
.venues-forbidden p {
  margin: 0 0 0.75rem;
}
.venues-hero {
  margin-bottom: 2rem;
  padding: 1.5rem 1.35rem;
  border-radius: var(--radius-xl);
  border: 1px solid var(--liquid-border);
  background: var(--liquid-tile-bg);
  backdrop-filter: blur(var(--liquid-blur)) saturate(var(--liquid-saturate));
  -webkit-backdrop-filter: blur(var(--liquid-blur)) saturate(var(--liquid-saturate));
  box-shadow: var(--liquid-shadow);
}
.venues-title {
  font-size: var(--text-3xl);
  font-weight: 700;
  letter-spacing: -0.02em;
  margin: 0 0 0.75rem;
  line-height: 1.2;
}
.venues-lead {
  font-size: var(--text-lg);
  color: var(--color-text-muted);
  max-width: 42rem;
  line-height: 1.55;
  margin: 0 0 1.25rem;
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
  border-radius: var(--radius-xl);
  border: 1px solid var(--liquid-border);
  background: var(--liquid-tile-bg);
  backdrop-filter: blur(var(--liquid-blur)) saturate(var(--liquid-saturate));
  -webkit-backdrop-filter: blur(var(--liquid-blur)) saturate(var(--liquid-saturate));
  box-shadow: var(--liquid-shadow);
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
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.25rem;
  margin-bottom: 2.5rem;
}
@media (min-width: 900px) {
  .venues-map-section {
    grid-template-columns: 1fr minmax(220px, 280px);
    align-items: stretch;
  }
  .venues-map-col {
    min-height: 420px;
  }
}
.venues-map-col {
  min-height: 320px;
  border-radius: var(--radius-xl);
  border: 1px solid var(--liquid-border);
  overflow: hidden;
  background: var(--liquid-tile-bg);
  backdrop-filter: blur(var(--liquid-blur)) saturate(var(--liquid-saturate));
  -webkit-backdrop-filter: blur(var(--liquid-blur)) saturate(var(--liquid-saturate));
  box-shadow: var(--liquid-shadow);
}
.venues-filters {
  background: var(--liquid-tile-bg);
  backdrop-filter: blur(calc(var(--liquid-blur) * 0.55)) saturate(calc(var(--liquid-saturate) * 0.95));
  -webkit-backdrop-filter: blur(calc(var(--liquid-blur) * 0.55)) saturate(calc(var(--liquid-saturate) * 0.95));
  border-radius: var(--radius-xl);
  padding: 1.25rem;
  border: 1px solid rgba(21, 101, 192, 0.14);
  box-shadow: var(--liquid-shadow);
}
html[data-theme='dark'] .venues-filters {
  border-color: rgba(100, 181, 246, 0.18);
}
.venues-filters-title {
  font-size: var(--text-lg);
  margin: 0 0 1rem;
  font-weight: 700;
}
.venues-filter-group {
  border: none;
  margin: 0 0 1.1rem;
  padding: 0;
}
.venues-filter-group:last-of-type {
  margin-bottom: 0.65rem;
}
.venues-filter-group legend {
  font-weight: 600;
  font-size: 0.65rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  margin-bottom: 0.5rem;
  padding: 0;
  color: var(--color-text-muted);
  opacity: 0.92;
}
.venues-filter-chips {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.venues-filter-chip {
  position: relative;
  cursor: pointer;
  user-select: none;
  width: 100%;
}
.venues-filter-input {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
  margin: 0;
  clip: rect(0, 0, 0, 0);
  clip-path: inset(50%);
  overflow: hidden;
  white-space: nowrap;
}
.venues-filter-chip-bg {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 2.5rem;
  padding: 0.45rem 0.6rem 0.45rem 0.5rem;
  border-radius: var(--radius-lg);
  border: 1px solid var(--liquid-border);
  background: var(--liquid-tile-bg);
  backdrop-filter: blur(calc(var(--liquid-blur) * 0.42)) saturate(calc(var(--liquid-saturate) * 0.9));
  -webkit-backdrop-filter: blur(calc(var(--liquid-blur) * 0.42)) saturate(calc(var(--liquid-saturate) * 0.9));
  box-shadow: var(--shadow-sm);
  transition:
    border-color 0.22s ease,
    background 0.22s ease,
    box-shadow 0.22s ease;
}
html[data-theme='dark'] .venues-filter-chip-bg {
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}
.venues-filter-chip:hover .venues-filter-chip-bg {
  border-color: color-mix(in srgb, var(--liquid-border) 65%, var(--color-text-muted));
  box-shadow: var(--shadow-sm), 0 0 0 1px color-mix(in srgb, var(--color-text) 4%, transparent);
}
.venues-filter-chip:has(.venues-filter-input:checked) .venues-filter-chip-bg {
  border-color: color-mix(in srgb, var(--color-accent) 18%, var(--liquid-border));
  background: color-mix(in srgb, var(--liquid-tile-bg) 92%, var(--color-accent) 8%);
  box-shadow: var(--shadow-sm);
}
html[data-theme='dark'] .venues-filter-chip:has(.venues-filter-input:checked) .venues-filter-chip-bg {
  border-color: color-mix(in srgb, var(--color-accent) 22%, var(--liquid-border));
  background: color-mix(in srgb, var(--liquid-tile-bg) 88%, var(--color-accent) 12%);
}
.venues-filter-chip:has(.venues-filter-input:focus-visible) .venues-filter-chip-bg {
  outline: 2px solid color-mix(in srgb, var(--color-accent) 55%, transparent);
  outline-offset: 1px;
}
.venues-filter-code {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.65rem;
  height: 1.65rem;
  flex-shrink: 0;
  border-radius: var(--radius);
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--color-text-muted);
  background: color-mix(in srgb, var(--color-text-muted) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-text-muted) 14%, transparent);
  transition: color 0.2s ease, background 0.2s ease, border-color 0.2s ease;
}
.venues-filter-chip:has(.venues-filter-input:checked) .venues-filter-code {
  color: var(--color-text);
  background: color-mix(in srgb, var(--color-accent) 14%, transparent);
  border-color: color-mix(in srgb, var(--color-accent) 22%, transparent);
  box-shadow: none;
}
.venues-filter-chip-text {
  flex: 1;
  min-width: 0;
  font-size: var(--text-sm);
  font-weight: 500;
  line-height: 1.3;
  color: var(--color-text);
  opacity: 0.95;
}
.venues-filter-check {
  flex-shrink: 0;
  font-size: 0.72rem;
  color: var(--color-text-muted);
  opacity: 0;
  transform: none;
  transition: opacity 0.2s ease;
}
.venues-filter-chip:has(.venues-filter-input:checked) .venues-filter-check {
  opacity: 0.55;
}
.venues-filter-chip--offer .venues-filter-offer-dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  flex-shrink: 0;
  background: color-mix(in srgb, var(--offer-color) 82%, var(--color-text-muted));
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.22);
  transition: opacity 0.2s ease;
  opacity: 0.88;
}
.venues-filter-chip--offer:hover .venues-filter-offer-dot {
  opacity: 1;
}
.venues-filter-chip--offer:has(.venues-filter-input:checked) .venues-filter-chip-bg {
  border-color: color-mix(in srgb, var(--offer-color) 16%, var(--liquid-border));
  background: color-mix(in srgb, var(--liquid-tile-bg) 90%, var(--offer-color) 10%);
  box-shadow: var(--shadow-sm);
}
html[data-theme='dark'] .venues-filter-chip--offer:has(.venues-filter-input:checked) .venues-filter-chip-bg {
  border-color: color-mix(in srgb, var(--offer-color) 22%, var(--liquid-border));
  background: color-mix(in srgb, var(--liquid-tile-bg) 84%, var(--offer-color) 16%);
}
.venues-filter-chip--offer:has(.venues-filter-input:checked) .venues-filter-check {
  color: var(--color-text-muted);
  opacity: 0.5;
}
.venues-filter-chip--offer:has(.venues-filter-input:checked) .venues-filter-offer-dot {
  opacity: 1;
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.18);
}
html[data-theme='dark'] .venues-filter-chip--offer:has(.venues-filter-input:checked) .venues-filter-offer-dot {
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.35);
}
.venues-filter-hint {
  margin: 0.5rem 0 0;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
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
  border: 1px solid var(--liquid-border);
  border-radius: var(--radius-lg);
  margin-bottom: 0.5rem;
  overflow: hidden;
  background: var(--liquid-tile-bg);
  backdrop-filter: blur(calc(var(--liquid-blur) * 0.48)) saturate(calc(var(--liquid-saturate) * 0.88));
  -webkit-backdrop-filter: blur(calc(var(--liquid-blur) * 0.48)) saturate(calc(var(--liquid-saturate) * 0.88));
  box-shadow: var(--shadow-sm);
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
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.venues-event-row:last-child {
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
  border: 1px solid var(--liquid-border);
  border-radius: var(--radius-xl);
  background: var(--liquid-tile-bg);
  backdrop-filter: blur(var(--liquid-blur)) saturate(var(--liquid-saturate));
  -webkit-backdrop-filter: blur(var(--liquid-blur)) saturate(var(--liquid-saturate));
  box-shadow: var(--liquid-shadow);
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
