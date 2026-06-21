<script setup>
import { ref, watch, onMounted, onUnmounted, shallowRef, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const props = defineProps({
  lat: { type: Number, default: null },
  lon: { type: Number, default: null },
  /** Full address text (Straße + Hausnummer + Ort) for precise pin placement */
  address: { type: String, default: '' },
  /** Postal code – used together with address for geocoding */
  zip: { type: String, default: '' },
  /** ISO country code (de, at, ch) – used for countrycodes= filter */
  country: { type: String, default: '' },
})

const { t } = useI18n()

const mapRoot = ref(null)
const mapInstance = shallowRef(null)
const markerLayer = shallowRef(null)
let resizeObserver = null

/** Resolved coordinates: start with stored lat/lon, overwritten by geocoding if available */
const resolvedLat = ref(null)
const resolvedLon = ref(null)
let geocodeAbort = null

const hasCoords = () => {
  const lat = Number(resolvedLat.value)
  const lon = Number(resolvedLon.value)
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
}

/**
 * Extract the street line from a multi-line address block like:
 *   "Technische Hochschule Mannheim\nPaul-Wittsack-Straße 10\n68163 Mannheim"
 *
 * Returns the first line that looks like "Straßenname Hausnummer"
 * (contains letters followed by digits, but does NOT start with a ZIP code).
 * Falls back to the full text if no street line is found.
 */
function extractStreetLine(text) {
  if (!text) return ''
  const lines = text.split(/[\n\r;,]+/).map((l) => l.trim()).filter(Boolean)
  // A street line has at least one letter AND at least one digit, and does not
  // start with a 4–5-digit postal code (those are ZIP+city lines).
  const streetLine = lines.find(
    (l) => /[a-zA-ZäöüÄÖÜßàáâãèéêëìíîïòóôõùúûýÿ]/.test(l) &&
           /\d/.test(l) &&
           !/^\d{4,5}/.test(l),
  )
  return streetLine || ''
}

/**
 * OSM result types that indicate a precise street/building match.
 * so the zoom only increases when we really found the right address.
 */
const PRECISE_TYPES = new Set([
  'house', 'building', 'amenity', 'office', 'shop', 'leisure',
  'tourism', 'school', 'university', 'college', 'sports_centre',
  'stadium', 'theatre', 'cinema', 'place_of_worship', 'hospital',
  'hall', 'community_centre', 'museum', 'library', 'marketplace',
])

function syncMarker(precise = false) {
  const map = mapInstance.value
  const layer = markerLayer.value
  if (!map || !layer) return
  layer.clearLayers()
  if (!hasCoords()) return
  const lat = Number(resolvedLat.value)
  const lon = Number(resolvedLon.value)
  const marker = L.circleMarker([lat, lon], {
    radius: 14,
    color: '#fff',
    weight: 2,
    fillColor: '#1565c0',
    fillOpacity: 0.92,
  })
  marker.addTo(layer)
  // Only zoom to street level (16) when Nominatim returned a genuine address hit.
  // For ZIP-centre coords (fallback), keep zoom 14 so the inaccuracy isn't obvious.
  map.setView([lat, lon], precise ? 16 : 14, { animate: false })
  nextTick(() => map.invalidateSize({ animate: false }))
}

/**
 * Client-side Nominatim geocoding using the venue address (Straße + Hausnummer, PLZ, Land).
 * Improves pin precision beyond the postal-code centre stored in the DB.
 * Falls back to stored lat/lon silently if geocoding fails or is imprecise.
 */
async function geocodeAddress() {
  if (geocodeAbort) geocodeAbort.abort()
  geocodeAbort = new AbortController()

  const rawAddr  = (props.address || '').trim()
  const zipText  = (props.zip || '').trim()
  const cc       = (props.country || '').toLowerCase().trim()

  // Use only the street line (e.g. "Paul-Wittsack-Straße 10"), stripping institution names.
  const streetLine = extractStreetLine(rawAddr)
  const addrText   = streetLine || rawAddr

  if (addrText || zipText) {
    try {
      const params = new URLSearchParams({ format: 'json', limit: '1', addressdetails: '1' })
      if (addrText && zipText) {
        params.set('q', `${addrText}, ${zipText}`)
      } else if (addrText) {
        params.set('q', addrText)
      } else {
        params.set('postalcode', zipText)
      }
      if (cc) params.set('countrycodes', cc)

      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?${params.toString()}`,
        { signal: geocodeAbort.signal },
      )
      if (res.ok) {
        const list = await res.json()
        const hit  = Array.isArray(list) ? list[0] : null
        if (hit?.lat) {
          const type    = hit.type || ''
          const cls     = hit.class || ''
          // Accept street-level results (road, building, amenity, …)
          // but reject broad area results (postcode, city, county, state)
          const isPrecise = PRECISE_TYPES.has(type) || cls === 'highway' ||
            (cls === 'place' && !['postcode', 'city', 'town', 'village', 'county', 'state', 'country'].includes(type))
          resolvedLat.value = parseFloat(hit.lat)
          resolvedLon.value = parseFloat(hit.lon)
          syncMarker(isPrecise)
          return
        }
      }
    } catch (_) { /* aborted or network error – fall through to stored coords */ }
  }

  // Fallback: use stored lat/lon (postal-code centre, zoom 14)
  resolvedLat.value = props.lat
  resolvedLon.value = props.lon
  syncMarker(false)
}

onMounted(() => {
  if (!mapRoot.value) return

  // Seed with stored coords immediately so the map shows something while geocoding
  resolvedLat.value = props.lat
  resolvedLon.value = props.lon

  const map = L.map(mapRoot.value, {
    scrollWheelZoom: true,
    attributionControl: true,
  })
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map)
  markerLayer.value = L.layerGroup().addTo(map)
  mapInstance.value = map

  if (!hasCoords()) {
    map.setView([51.1, 10.4], 5)
  } else {
    syncMarker(false)
  }

  // Kick off precise geocoding
  geocodeAddress()

  resizeObserver = new ResizeObserver(() => {
    map.invalidateSize({ animate: false })
    if (hasCoords()) syncMarker()
  })
  if (mapRoot.value?.parentElement) resizeObserver.observe(mapRoot.value.parentElement)
})

watch(
  () => [props.lat, props.lon, props.address, props.zip, props.country],
  () => {
    resolvedLat.value = props.lat
    resolvedLon.value = props.lon
    syncMarker(false)
    geocodeAddress()
  },
)

onUnmounted(() => {
  geocodeAbort?.abort()
  geocodeAbort = null
  resizeObserver?.disconnect()
  resizeObserver = null
  mapInstance.value?.remove()
  mapInstance.value = null
  markerLayer.value = null
})
</script>

<template>
  <div class="venue-detail-map-wrap liquid-surface-inner">
    <div
      v-if="hasCoords() || address || zip"
      ref="mapRoot"
      class="venue-detail-map"
      role="img"
      :aria-label="t('venues.detailMapLabel')"
    />
    <p v-else class="venue-detail-map-empty">
      <I18nText k="venues.detailNoMapCoords" />
    </p>
  </div>
</template>

<style scoped>
.venue-detail-map-wrap {
  position: relative;
  width: 100%;
  min-height: 220px;
  height: 100%;
  border-radius: var(--radius-lg);
  overflow: hidden;
}
.venue-detail-map {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.venue-detail-map-empty {
  margin: 0;
  padding: 2rem 1rem;
  text-align: center;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}
</style>
