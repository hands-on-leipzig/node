<script setup>
import { ref, watch, onMounted, onUnmounted, shallowRef } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { OFFER_COLORS } from '@/utils/venueFilters'

const props = defineProps({
  clusters: {
    type: Array,
    default: () => [],
  },
})

const mapRoot = ref(null)
const mapInstance = shallowRef(null)
const markersLayer = shallowRef(null)

const EUROPE_CENTER = [51.1, 10.4]
const DEFAULT_ZOOM = 5

function offerColor(category) {
  return OFFER_COLORS[category] || OFFER_COLORS.other
}

function syncMarkers() {
  const map = mapInstance.value
  const layer = markersLayer.value
  if (!map || !layer) return
  layer.clearLayers()
  const bounds = []
  for (const cluster of props.clusters) {
    const color = offerColor(cluster.offerCategory)
    const radius = cluster.count > 1 ? 18 + Math.min(cluster.count, 20) : 14
    const marker = L.circleMarker([cluster.lat, cluster.lon], {
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
    marker.addTo(layer)
    bounds.push([cluster.lat, cluster.lon])
  }
  if (bounds.length === 1) {
    map.setView(bounds[0], 8)
  } else if (bounds.length > 1) {
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 10 })
  } else {
    map.setView(EUROPE_CENTER, DEFAULT_ZOOM)
  }
}

onMounted(() => {
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
})

watch(() => props.clusters, syncMarkers, { deep: true })

onUnmounted(() => {
  mapInstance.value?.remove()
  mapInstance.value = null
  markersLayer.value = null
})
</script>

<template>
  <div class="venues-map-wrap">
    <div ref="mapRoot" class="venues-map" role="img" aria-label="Map" />
  </div>
</template>

<style scoped>
.venues-map-wrap {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 320px;
  border-radius: var(--radius-lg);
  overflow: hidden;
  border: 1px solid var(--color-border);
  background: var(--color-bg-muted);
}
.venues-map {
  width: 100%;
  height: 100%;
  min-height: 320px;
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
