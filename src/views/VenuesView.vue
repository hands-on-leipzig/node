<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { VenuesCatalog, publicEventPathFromUrl } from '@hands-on/glass/venues'
import {
  isAuthenticated,
  login,
  logout,
  hasCoachRole,
} from '@/auth/keycloak'
import { fetchPublicVenues } from '@/services/publicVenues'
import { fetchPublicEventLinks } from '@/services/publicEventLinks'
import { publicPlanUrl } from '@/utils/publicPlan'
import EventScheduleLink from '@/components/EventScheduleLink.vue'
import logoFll from '@/assets/FIRSTLego_IconVert_RGB.png'
import { BROWSER_BACK_EVENT, popOverlayHistory, pushOverlayHistory } from '@/utils/spaBrowserBack'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const showForbidden = computed(() => !!route.query.forbidden && authenticated.value)

const loading = ref(true)
const error = ref(null)
const venues = ref([])
const venuesMeta = ref({})
const selectedVenue = ref(null)
/** DRAHT event id → schedule URL, fetched from FLOW. */
const planLinks = ref(new Map())
let planLinksRequest = null

const authenticated = computed(() => isAuthenticated())
const coachAccess = computed(() => authenticated.value && hasCoachRole())

function venuePublicUrl(venue) {
  return planLinks.value.get(Number(venue?.id)) || publicPlanUrl(venue) || ''
}

function venueEventRoute(venue) {
  const url = venuePublicUrl(venue)
  const publicPath = publicEventPathFromUrl(url)
  if (!publicPath) return null
  return {
    name: 'venues-event',
    params: { publicPath },
    query: { src: url, title: venue.name || '' },
  }
}

function venueEventHref(venue) {
  const target = venueEventRoute(venue)
  return target ? router.resolve(target).href : ''
}

async function openVenueDetail(venue) {
  if (!venue?.id) return
  await loadPlanLinks()
  const target = venueEventRoute(venue)
  if (target) {
    router.push(target)
    return
  }
  selectedVenue.value = venue
  pushOverlayHistory('venue')
}

/** Fetched once per visit; a venue list without schedule links is still complete. */
function loadPlanLinks() {
  if (planLinksRequest) return planLinksRequest

  planLinksRequest = fetchPublicEventLinks()
    .then((links) => {
      planLinks.value = links
    })
    .catch(() => {
      planLinksRequest = null
    })

  return planLinksRequest
}

/**
 * The schedule link belongs to the event, so the detail view gets it on the venue and
 * an own copy of it is not kept in the list.
 */
const selectedVenueWithPlan = computed(() => {
  const venue = selectedVenue.value
  if (!venue) return null

  const url = planLinks.value.get(Number(venue.id))

  return url ? { ...venue, planlink: url } : venue
})

function closeVenueDetail(fromBrowserBack = false) {
  if (!fromBrowserBack && popOverlayHistory('venue')) return
  selectedVenue.value = null
}

function handleBrowserBackRequest(event) {
  if (!selectedVenue.value) return
  closeVenueDetail(true)
  if (event?.detail) {
    event.detail.handled = true
    event.detail.skipRestore = true
    event.detail.rearmRootTrap = true
  }
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
  loadPlanLinks()
  if (typeof window !== 'undefined') {
    window.addEventListener(BROWSER_BACK_EVENT, handleBrowserBackRequest)
  }
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener(BROWSER_BACK_EVENT, handleBrowserBackRequest)
  }
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
              :src="logoFll"
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
        <VenuesCatalog
          :venues="venues"
          :selected-venue="selectedVenueWithPlan"
          state-key="node.venues.catalog"
          :event-href="venueEventHref"
          @select="openVenueDetail"
          @close="() => closeVenueDetail()"
        >
          <template #detail-links="{ venue }">
            <EventScheduleLink :event="venue" />
          </template>
        </VenuesCatalog>
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
.spin {
  animation: venues-spin 0.8s linear infinite;
}
@keyframes venues-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
