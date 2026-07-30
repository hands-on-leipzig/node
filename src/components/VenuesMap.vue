<script setup>
import { ref, watch, onMounted, onUnmounted, shallowRef, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { OFFER_COLORS } from '@/utils/venueFilters'

const COUNTRY_KEYS = ['de', 'at', 'ch']
const OFFER_KEYS = ['exhibition', 'competition', 'future']

const countries = defineModel('countries', { type: Object, required: true })
const offers = defineModel('offers', { type: Object, required: true })

const props = defineProps({
  clusters: {
    type: Array,
    default: () => [],
  },
  resultCount: {
    type: Number,
    default: null,
  },
})

const emit = defineEmits(['venue-select'])

const { t } = useI18n()

const mapWrap = ref(null)
const mapRoot = ref(null)
const legendEl = ref(null)
const mapInstance = shallowRef(null)
const markersLayer = shallowRef(null)
let resizeObserver = null

/** On small screens the legend starts collapsed so it doesn't cover the map. */
const LEGEND_COLLAPSE_QUERY = '(max-width: 640px)'
const legendCollapsed = ref(false)
let legendMedia = null

function onLegendMediaChange(event) {
  legendCollapsed.value = event.matches
}

function toggleLegend() {
  legendCollapsed.value = !legendCollapsed.value
}

/** Only used when there are no markers (initial + empty filters). Changing this has no effect while points are shown. */
const EUROPE_CENTER = [51.1, 10.4]
const DEFAULT_ZOOM = 5
const FIT_EDGE_MARGIN = 24
const LEGEND_FIT_GAP = 10
const FIT_MAX_ZOOM = 18
const FIT_GEO_PAD_SINGLE = 0.035
const FIT_GEO_PAD_MULTI = 0.008
const FIT_SIZE_RETRY_MAX = 12

/** @returns {Array<[number, number]>} */
function normalizeMarkerLatLngs(raw) {
  const out = []
  for (const item of raw) {
    const lat = Number(Array.isArray(item) ? item[0] : item?.lat)
    const lng = Number(Array.isArray(item) ? item[1] : item?.lon ?? item?.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue
    out.push([lat, lng])
  }
  return out
}

/**
 * Pixel padding for fitBounds: markers fit into the map area beside the legend.
 * Leaflet uses paddingTopLeft + paddingBottomRight for zoom and offsets the center.
 */
function computeLegendFitPadding(map) {
  const margin = FIT_EDGE_MARGIN
  const size = map.getSize()
  const maxLeft = Math.max(64, Math.floor(size.x * 0.4))
  const maxBottom = Math.max(64, Math.floor(size.y * 0.42))

  let left = margin
  let bottom = margin
  const legend = legendEl.value
  const mapEl = map?.getContainer?.()
  if (legend && mapEl) {
    const mapRect = mapEl.getBoundingClientRect()
    const legendRect = legend.getBoundingClientRect()
    if (legendRect.width > 0 && legendRect.height > 0) {
      left = Math.max(margin, legendRect.right - mapRect.left + LEGEND_FIT_GAP)
      bottom = Math.max(margin, mapRect.bottom - legendRect.top + LEGEND_FIT_GAP)
    }
  }

  left = Math.min(left, maxLeft)
  bottom = Math.min(bottom, maxBottom)

  return {
    topLeft: L.point(left, margin),
    bottomRight: L.point(margin, bottom),
  }
}

function buildLatLngBounds(latlngs) {
  let llb = L.latLngBounds(latlngs)
  if (!llb.isValid()) return null

  const spanLat = llb.getNorth() - llb.getSouth()
  const spanLng = llb.getEast() - llb.getWest()
  const isPoint = spanLat < 1e-6 && spanLng < 1e-6
  const geoPad = isPoint ? FIT_GEO_PAD_SINGLE : FIT_GEO_PAD_MULTI
  llb = llb.pad(geoPad)
  return llb
}

let fitRetryCount = 0

function applyMapView(rawBounds) {
  const map = mapInstance.value
  if (!map) return

  const latlngs = normalizeMarkerLatLngs(rawBounds)

  const run = () => {
    map.invalidateSize({ animate: false })
    const size = map.getSize()

    if (!latlngs.length) {
      fitRetryCount = 0
      map.setView(EUROPE_CENTER, DEFAULT_ZOOM)
      return
    }

    if (size.x < 80 || size.y < 80) {
      if (fitRetryCount < FIT_SIZE_RETRY_MAX) {
        fitRetryCount += 1
        requestAnimationFrame(run)
      }
      return
    }
    fitRetryCount = 0

    const llb = buildLatLngBounds(latlngs)
    if (!llb) return

    const pad = computeLegendFitPadding(map)
    const fitWidth = size.x - pad.topLeft.x - pad.bottomRight.x
    const fitHeight = size.y - pad.topLeft.y - pad.bottomRight.y
    if (fitWidth < 100 || fitHeight < 100) {
      map.fitBounds(llb, { padding: [FIT_EDGE_MARGIN, FIT_EDGE_MARGIN], maxZoom: FIT_MAX_ZOOM, animate: false })
      return
    }

    map.fitBounds(llb, {
      paddingTopLeft: pad.topLeft,
      paddingBottomRight: pad.bottomRight,
      maxZoom: FIT_MAX_ZOOM,
      animate: false,
    })
  }

  nextTick(() => {
    requestAnimationFrame(run)
  })
}

let resizeFitTimer = null
function scheduleMapRefit(rawBounds) {
  if (resizeFitTimer) clearTimeout(resizeFitTimer)
  resizeFitTimer = setTimeout(() => applyMapView(rawBounds), 120)
}

function offerColor(category) {
  return OFFER_COLORS[category] || OFFER_COLORS.other
}

function offerStyle(key) {
  return { '--offer-color': OFFER_COLORS[key] || OFFER_COLORS.other }
}

function syncMarkers() {
  const map = mapInstance.value
  const layer = markersLayer.value
  if (!map || !layer) return
  layer.clearLayers()
  const bounds = []
  for (const cluster of props.clusters) {
    const lat = Number(cluster.lat)
    const lon = Number(cluster.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue

    const color = offerColor(cluster.offerCategory)
    const radius = cluster.count > 1 ? 18 + Math.min(cluster.count, 20) : 14
    const marker = L.circleMarker([lat, lon], {
      radius,
      color: '#fff',
      weight: 2,
      fillColor: color,
      fillOpacity: 0.92,
    })
    const title = cluster.venues.map((v) => v.name).join('<br>')
    marker.bindPopup(`<strong>${cluster.count}</strong><br>${title}`)
    if (cluster.count > 1) {
      marker.bindTooltip(String(cluster.count), { permanent: true, direction: 'center', className: 'venues-map-count' })
    }
    marker.on('click', () => {
      const list = Array.isArray(cluster.venues) ? cluster.venues : []
      if (list.length) emit('venue-select', list[0])
    })
    marker.addTo(layer)
    bounds.push([lat, lon])
  }
  applyMapView(bounds)
}

onMounted(() => {
  if (typeof window !== 'undefined' && window.matchMedia) {
    legendMedia = window.matchMedia(LEGEND_COLLAPSE_QUERY)
    legendCollapsed.value = legendMedia.matches
    legendMedia.addEventListener('change', onLegendMediaChange)
  }

  if (!mapRoot.value) return
  const map = L.map(mapRoot.value, {
    scrollWheelZoom: true,
    attributionControl: true,
  }).setView(EUROPE_CENTER, DEFAULT_ZOOM)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map)
  markersLayer.value = L.layerGroup().addTo(map)
  mapInstance.value = map
  syncMarkers()
  nextTick(() => {
    requestAnimationFrame(() => map.invalidateSize())
  })

  resizeObserver = new ResizeObserver(() => {
    if (props.clusters.length) {
      scheduleMapRefit(props.clusters)
    } else {
      map.invalidateSize()
    }
  })
  if (mapWrap.value) resizeObserver.observe(mapWrap.value)
})

watch(() => props.clusters, syncMarkers, { deep: true })

/** Re-fit markers into the changed free space when the legend collapses/expands. */
watch(legendCollapsed, () => {
  const map = mapInstance.value
  if (!map) return
  nextTick(() => {
    map.invalidateSize({ animate: false })
    if (props.clusters.length) scheduleMapRefit(props.clusters)
  })
})

onUnmounted(() => {
  if (resizeFitTimer) clearTimeout(resizeFitTimer)
  resizeObserver?.disconnect()
  resizeObserver = null
  legendMedia?.removeEventListener('change', onLegendMediaChange)
  legendMedia = null
  mapInstance.value?.remove()
  mapInstance.value = null
  markersLayer.value = null
})
</script>

<template>
  <div ref="mapWrap" class="venues-map-wrap">
    <div ref="mapRoot" class="venues-map" role="img" :aria-label="t('venues.mapLabel')" />
    <div
      ref="legendEl"
      class="venues-map-legend"
      :class="{ 'is-collapsed': legendCollapsed }"
      role="region"
      :aria-label="t('venues.mapLegendTitle')"
      @click.stop
      @wheel.stop
      @dblclick.stop
      @mousedown.stop
      @touchstart.stop
    >
      <button
        type="button"
        class="venues-map-legend-toggle"
        :aria-expanded="!legendCollapsed"
        :aria-label="t('venues.mapLegendToggle')"
        @click="toggleLegend"
      >
        <span class="venues-map-legend-title">{{ t('venues.mapLegendTitle') }}</span>
        <span v-if="legendCollapsed && resultCount != null" class="venues-map-legend-toggle-count">{{ resultCount }}</span>
        <i
          class="bi venues-map-legend-chevron"
          :class="legendCollapsed ? 'bi-chevron-up' : 'bi-chevron-down'"
          aria-hidden="true"
        ></i>
      </button>

      <div v-show="!legendCollapsed" class="venues-map-legend-body">
      <div class="venues-map-legend-block">
        <span class="venues-map-legend-label">{{ t('venues.filterOffers') }}</span>
        <ul class="venues-map-legend-list">
          <li
            v-for="o in OFFER_KEYS"
            :key="'legend-offer-' + o"
            class="venues-map-legend-row venues-map-legend-row--offer"
            :class="offers[o] ? 'is-on' : 'is-off'"
            :style="offerStyle(o)"
          >
            <span class="venues-map-legend-marker" aria-hidden="true"></span>
            <span class="venues-map-legend-text"><I18nText :k="`venues.offerShort.${o}`" /></span>
            <label class="venues-map-switch" :aria-label="t(`venues.offer.${o}`)">
              <input v-model="offers[o]" type="checkbox" class="venues-map-switch-input" />
              <span class="venues-map-switch-track" aria-hidden="true">
                <span class="venues-map-switch-thumb"></span>
              </span>
            </label>
          </li>
        </ul>
      </div>

      <div class="venues-map-legend-block">
        <span class="venues-map-legend-label">{{ t('venues.filterCountries') }}</span>
        <ul class="venues-map-legend-list">
          <li
            v-for="c in COUNTRY_KEYS"
            :key="'legend-country-' + c"
            class="venues-map-legend-row venues-map-legend-row--country"
            :class="countries[c] ? 'is-on' : 'is-off'"
          >
            <span class="venues-map-legend-code" aria-hidden="true">{{ c.toUpperCase() }}</span>
            <span class="venues-map-legend-text"><I18nText :k="`venues.country.${c}`" /></span>
            <label class="venues-map-switch" :aria-label="t(`venues.country.${c}`)">
              <input v-model="countries[c]" type="checkbox" class="venues-map-switch-input" />
              <span class="venues-map-switch-track" aria-hidden="true">
                <span class="venues-map-switch-thumb"></span>
              </span>
            </label>
          </li>
        </ul>
      </div>

      <p v-if="resultCount != null" class="venues-map-legend-footer">
        <I18nText k="venues.resultsCount" :values="{ count: resultCount }" />
      </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.venues-map-wrap {
  position: relative;
  width: 100%;
  height: 100%;
}
.venues-map {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
}
.venues-map-legend {
  position: absolute;
  left: 0.75rem;
  bottom: 0.75rem;
  z-index: 500;
  width: min(18.5rem, calc(100% - 1.5rem));
  padding: 0.7rem 0.8rem;
  border-radius: var(--radius-lg);
  border: 1px solid var(--liquid-border);
  background: color-mix(in srgb, var(--liquid-tile-bg) 92%, transparent);
  backdrop-filter: blur(calc(var(--liquid-blur) * 0.55)) saturate(calc(var(--liquid-saturate) * 0.95));
  -webkit-backdrop-filter: blur(calc(var(--liquid-blur) * 0.55)) saturate(calc(var(--liquid-saturate) * 0.95));
  box-shadow: var(--shadow-md);
  pointer-events: auto;
}
.venues-map-legend-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  font: inherit;
  color: inherit;
  cursor: default;
  text-align: left;
}
.venues-map-legend-title {
  margin: 0;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--color-text);
}
.venues-map-legend-toggle-count {
  margin-left: auto;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--color-text-muted);
}
.venues-map-legend-chevron {
  display: none;
  margin-left: auto;
  font-size: 0.85rem;
  line-height: 1;
  color: var(--color-text-muted);
}
.venues-map-legend-toggle-count + .venues-map-legend-chevron {
  margin-left: 0.35rem;
}
.venues-map-legend-body {
  margin-top: 0.5rem;
}
.venues-map-legend-block {
  margin-bottom: 0.5rem;
}
.venues-map-legend-block:last-of-type {
  margin-bottom: 0.35rem;
}
.venues-map-legend-label {
  display: block;
  margin-bottom: 0.32rem;
  font-size: 0.62rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}
.venues-map-legend-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.22rem;
}
.venues-map-legend-row {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-height: 1.85rem;
  padding: 0.12rem 0.2rem;
  border-radius: var(--radius);
  font-size: var(--text-sm);
  line-height: 1.25;
}
.venues-map-legend-row.is-off {
  opacity: 0.72;
}
.venues-map-legend-row--offer.is-on {
  background: color-mix(in srgb, var(--offer-color) 12%, transparent);
}
.venues-map-legend-row--offer.is-off .venues-map-legend-marker {
  background: transparent;
  border: 2px solid color-mix(in srgb, var(--offer-color) 50%, var(--color-text-muted));
  box-shadow: none;
}
.venues-map-legend-row--offer.is-off .venues-map-legend-text {
  color: var(--color-text-muted);
}
.venues-map-legend-marker {
  width: 0.65rem;
  height: 0.65rem;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--offer-color);
  border: 2px solid #fff;
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--offer-color) 40%, transparent);
}
.venues-map-legend-code {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.35rem;
  height: 1.35rem;
  flex-shrink: 0;
  border-radius: var(--radius);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  color: var(--color-text-muted);
  background: color-mix(in srgb, var(--color-text-muted) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-text-muted) 16%, transparent);
}
.venues-map-legend-row--country.is-on .venues-map-legend-code {
  color: #fff;
  background: var(--color-accent);
  border-color: var(--color-accent);
}
.venues-map-legend-text {
  flex: 1;
  min-width: 0;
  font-weight: 600;
  color: var(--color-text);
}
.venues-map-switch {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
  cursor: pointer;
  margin: 0;
}
.venues-map-switch-input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
  margin: 0;
}
.venues-map-switch-track {
  display: block;
  width: 2.65rem;
  height: 1.55rem;
  border-radius: 999px;
  background: #e5e5ea;
  transition: background 0.22s ease;
  position: relative;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.06);
}
html[data-theme='dark'] .venues-map-switch-track {
  background: #39393d;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
}
.venues-map-switch-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 1.35rem;
  height: 1.35rem;
  border-radius: 50%;
  background: #fff;
  box-shadow:
    0 2px 4px rgba(0, 0, 0, 0.18),
    0 0 0 0.5px rgba(0, 0, 0, 0.04);
  transition: transform 0.22s cubic-bezier(0.4, 0, 0.2, 1);
}
.venues-map-switch-input:checked + .venues-map-switch-track {
  background: #34c759;
}
html[data-theme='dark'] .venues-map-switch-input:checked + .venues-map-switch-track {
  background: #30d158;
}
.venues-map-legend-row--offer .venues-map-switch-input:checked + .venues-map-switch-track {
  background: var(--offer-color);
}
.venues-map-switch-input:checked + .venues-map-switch-track .venues-map-switch-thumb {
  transform: translateX(1.1rem);
}
.venues-map-switch-input:focus-visible + .venues-map-switch-track {
  outline: 2px solid color-mix(in srgb, var(--color-accent) 55%, transparent);
  outline-offset: 2px;
}
.venues-map-legend-footer {
  margin: 0.15rem 0 0;
  padding-top: 0.4rem;
  border-top: 1px solid var(--liquid-border);
  font-size: 0.72rem;
  color: var(--color-text-muted);
  line-height: 1.35;
}
@media (max-width: 640px) {
  .venues-map-legend {
    left: 0.6rem;
    right: 0.6rem;
    bottom: 0.6rem;
    width: auto;
    display: flex;
    flex-direction: column;
    max-height: calc(100% - 1.2rem);
  }
  .venues-map-legend.is-collapsed {
    width: auto;
    right: auto;
    max-width: calc(100% - 1.2rem);
  }
  .venues-map-legend-toggle {
    cursor: pointer;
    min-height: 1.75rem;
    align-items: center;
  }
  .venues-map-legend-chevron {
    display: inline-flex;
  }
  .venues-map-legend-body {
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
  }
}
</style>

<style>
.venues-map-count {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  color: #fff !important;
  font-weight: 700;
  font-size: 0.75rem;
  margin: 0 !important;
  padding: 0 !important;
}
</style>
