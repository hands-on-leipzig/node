<script setup>
import { ref, watch, onMounted, onUnmounted, shallowRef, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const props = defineProps({
  lat: { type: Number, default: null },
  lon: { type: Number, default: null },
})

const { t } = useI18n()

const mapRoot = ref(null)
const mapInstance = shallowRef(null)
const markerLayer = shallowRef(null)
let resizeObserver = null

const hasCoords = () => {
  const lat = Number(props.lat)
  const lon = Number(props.lon)
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
}

function syncMarker() {
  const map = mapInstance.value
  const layer = markerLayer.value
  if (!map || !layer) return
  layer.clearLayers()
  if (!hasCoords()) return
  const lat = Number(props.lat)
  const lon = Number(props.lon)
  const marker = L.circleMarker([lat, lon], {
    radius: 14,
    color: '#fff',
    weight: 2,
    fillColor: '#1565c0',
    fillOpacity: 0.92,
  })
  marker.addTo(layer)
  map.setView([lat, lon], 14, { animate: false })
  nextTick(() => map.invalidateSize({ animate: false }))
}

onMounted(() => {
  if (!mapRoot.value) return
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
    syncMarker()
  }
  resizeObserver = new ResizeObserver(() => {
    map.invalidateSize({ animate: false })
    if (hasCoords()) syncMarker()
  })
  if (mapRoot.value?.parentElement) resizeObserver.observe(mapRoot.value.parentElement)
})

watch(() => [props.lat, props.lon], syncMarker)

onUnmounted(() => {
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
      v-if="hasCoords()"
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
