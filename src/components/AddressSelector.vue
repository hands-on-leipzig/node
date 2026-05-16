<script setup>
import { computed, ref, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import CustomSelect from '@/components/CustomSelect.vue'
import { formatOverviewAddress } from '@/utils/formatOverviewAddress'

const { t, locale } = useI18n()

const props = defineProps({
  modelValue: {
    type: Object,
    required: true,
    // { useExisting: boolean, addressId: string, new: { street, postalCode, city, country } }
  },
  addresses: {
    type: Array,
    default: () => [],
    // [{ id, label?, street, postalCode, city, country }]
  },
  label: {
    type: String,
    required: true,
  },
  /** Set false when the parent already renders a section heading (avoids duplicate titles). */
  showLabel: {
    type: Boolean,
    default: true,
  },
  idPrefix: {
    type: String,
    default: 'addr',
  },
})

const emit = defineEmits(['update:modelValue'])

const zipSuggestions = ref([])
const streetSuggestions = ref([])
const zipLoading = ref(false)
const streetLoading = ref(false)
const zipQuery = ref('')
const streetQuery = ref('')

let zipDebounceTimer = null
let streetDebounceTimer = null
let zipAbortController = null
let streetAbortController = null

function addressIdOf(addr, fallback = '') {
  if (!addr || typeof addr !== 'object') return fallback
  return String(addr.id ?? addr.addressId ?? addr.rowid ?? fallback)
}

const addressOptions = computed(() =>
  props.addresses
    .map((addr) => {
      const id = addressIdOf(addr, '')
      if (!/^\d+$/.test(String(id).trim())) return null
      return {
        value: String(Number(String(id).trim())),
        label: addr.label || formatOverviewAddress(addr, locale.value),
      }
    })
    .filter(Boolean)
)

/** Strict boolean — avoids radios stuck when useExisting is undefined/null. */
const isExistingMode = computed(() => props.modelValue.useExisting !== false)
const streetContextReady = computed(() => {
  const country = (props.modelValue.new?.country || '').trim()
  const zip = (props.modelValue.new?.postalCode || '').trim()
  return country.length > 0 && zip.length >= 3
})

const countryOptions = computed(() => {
  const displayNames = typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function'
    ? new Intl.DisplayNames(['de', 'en'], { type: 'region' })
    : null
  const toLabel = (code) => (displayNames ? displayNames.of(code.toUpperCase()) : code.toUpperCase())
  const top = ['de', 'at', 'ch']
  const extra = ['fr', 'it', 'nl', 'be', 'pl', 'cz', 'sk', 'hu', 'si', 'hr', 'es', 'pt', 'gb', 'ie']
  const all = [...top, ...extra]
  return all.map((c) => ({ value: c, label: toLabel(c) || c.toUpperCase() }))
})

function setMode(useExisting) {
  const wantExisting = !!useExisting
  const prev = props.modelValue
  const newBlock = prev.new || { street: '', postalCode: '', city: '', country: '' }

  let addressId = prev.addressId
  if (wantExisting) {
    const stillValid = props.addresses.some((a) => addressIdOf(a) === String(addressId))
    if (!stillValid) {
      addressId = props.addresses[0] ? addressIdOf(props.addresses[0]) : ''
    }
  }

  emit('update:modelValue', {
    ...prev,
    useExisting: wantExisting,
    addressId,
    new: newBlock,
  })
}

function setAddressId(id) {
  emit('update:modelValue', { ...props.modelValue, addressId: id })
}

function setNewField(field, value) {
  emit('update:modelValue', {
    ...props.modelValue,
    new: { ...(props.modelValue.new || {}), [field]: value },
  })
}

function clearAutocompleteState() {
  zipSuggestions.value = []
  streetSuggestions.value = []
  zipLoading.value = false
  streetLoading.value = false
  zipQuery.value = ''
  streetQuery.value = ''
  if (zipDebounceTimer) clearTimeout(zipDebounceTimer)
  if (streetDebounceTimer) clearTimeout(streetDebounceTimer)
  if (zipAbortController) zipAbortController.abort()
  if (streetAbortController) streetAbortController.abort()
}

function normalizeCountryForZipLookup(rawCountry, rawZip) {
  const country = String(rawCountry || '').trim().toLowerCase()
  const zip = String(rawZip || '').trim()
  if (country) return country
  // Fallback for common DACH-style numeric postcodes when no country selected.
  if (/^\d{4,5}$/.test(zip)) return 'de'
  return ''
}

function onCountryChange(value) {
  setNewField('country', value)
  zipSuggestions.value = []
  streetSuggestions.value = []
  const currentZip = props.modelValue.new?.postalCode || ''
  if (String(currentZip).trim().length >= 3) {
    onZipInput(currentZip)
  }
}

function onZipInput(value) {
  setNewField('postalCode', value)
  zipQuery.value = value || ''
  zipSuggestions.value = []
  streetSuggestions.value = []
  if (zipDebounceTimer) clearTimeout(zipDebounceTimer)
  const country = normalizeCountryForZipLookup(props.modelValue.new?.country, value)
  if (!country || !value || String(value).trim().length < 3) return
  zipDebounceTimer = setTimeout(() => { lookupZip(value, country) }, 260)
}

async function lookupZip(rawZip, country) {
  const zip = String(rawZip || '').trim()
  if (!zip || !country) return
  if (zipAbortController) zipAbortController.abort()
  zipAbortController = new AbortController()
  zipLoading.value = true
  try {
    const res = await fetch(`https://api.zippopotam.us/${encodeURIComponent(country)}/${encodeURIComponent(zip)}`, {
      signal: zipAbortController.signal,
    })
    if (!res.ok) {
      zipSuggestions.value = []
      return
    }
    const data = await res.json()
    const places = Array.isArray(data?.places) ? data.places : []
    const normalized = places.map((p) => ({
      postalCode: data['post code'] || zip,
      city: p['place name'] || '',
      state: p.state || '',
      country,
    }))
    const seen = new Set()
    zipSuggestions.value = normalized.filter((s) => {
      const key = `${s.postalCode}|${s.city}|${s.state}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }).slice(0, 6)
    if (zipSuggestions.value.length === 1 && zipSuggestions.value[0].city) {
      setNewField('city', zipSuggestions.value[0].city)
    }
  } catch (_) {
    zipSuggestions.value = []
  } finally {
    zipLoading.value = false
  }
}

function applyZipSuggestion(item) {
  setNewField('postalCode', item.postalCode || props.modelValue.new?.postalCode || '')
  if (item.city) setNewField('city', item.city)
  if (item.country) setNewField('country', item.country)
  zipSuggestions.value = []
}

function onStreetInput(value) {
  setNewField('street', value)
  streetQuery.value = value || ''
  streetSuggestions.value = []
  if (streetDebounceTimer) clearTimeout(streetDebounceTimer)
  const q = String(value || '').trim()
  if (q.length < 3) return
  streetDebounceTimer = setTimeout(() => { lookupStreet(q) }, 280)
}

async function lookupStreet(street) {
  const country = normalizeCountryForZipLookup(props.modelValue.new?.country, props.modelValue.new?.postalCode)
  const zip = (props.modelValue.new?.postalCode || '').trim()
  const city = (props.modelValue.new?.city || '').trim()
  if (!country || zip.length < 3) return
  const qParts = [street, zip, city].filter(Boolean)
  if (qParts.length === 0) return
  const q = qParts.join(', ')
  if (streetAbortController) streetAbortController.abort()
  streetAbortController = new AbortController()
  streetLoading.value = true
  try {
    const params = new URLSearchParams({
      format: 'jsonv2',
      addressdetails: '1',
      limit: '6',
      q,
    })
    if (country) params.set('countrycodes', country)
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      signal: streetAbortController.signal,
    })
    if (!res.ok) {
      streetSuggestions.value = []
      return
    }
    const list = await res.json()
    const items = Array.isArray(list) ? list : []
    streetSuggestions.value = items.map((it) => {
      const a = it.address || {}
      const road = a.road || a.pedestrian || a.footway || a.path || a.cycleway || ''
      const houseNo = a.house_number || ''
      const st = [road, houseNo].filter(Boolean).join(' ').trim() || street
      const zipCode = a.postcode || zip || ''
      const town = a.city || a.town || a.village || a.hamlet || city || ''
      const countryCode = (a.country_code || country || '').toLowerCase()
      return {
        label: it.display_name || st,
        street: st,
        postalCode: zipCode,
        city: town,
        country: countryCode,
      }
    })
  } catch (_) {
    streetSuggestions.value = []
  } finally {
    streetLoading.value = false
  }
}

function applyStreetSuggestion(item) {
  if (item.street) setNewField('street', item.street)
  if (item.postalCode) setNewField('postalCode', item.postalCode)
  if (item.city) setNewField('city', item.city)
  if (item.country) setNewField('country', item.country)
  streetSuggestions.value = []
  zipSuggestions.value = []
}

function onExistingKeydown(e) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    setMode(true)
  }
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    e.preventDefault()
    setMode(false)
    document.getElementById(`${props.idPrefix}-mode-new`)?.focus()
  }
}

function onNewKeydown(e) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    setMode(false)
  }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    e.preventDefault()
    setMode(true)
    document.getElementById(`${props.idPrefix}-mode-existing`)?.focus()
  }
}

onBeforeUnmount(() => {
  clearAutocompleteState()
})
</script>

<template>
  <div class="address-selector">
    <label v-if="showLabel" class="address-label">{{ label }}</label>
    <div
      class="address-mode-cards"
      role="radiogroup"
      :aria-label="label"
    >
      <button
        :id="idPrefix + '-mode-existing'"
        type="button"
        role="radio"
        class="address-mode-card"
        :class="{ active: isExistingMode }"
        :aria-checked="isExistingMode"
        :tabindex="isExistingMode ? 0 : -1"
        @click="setMode(true)"
        @keydown="onExistingKeydown"
      >
        <span class="address-mode-card-inner">
          <span class="address-mode-icon-wrap" aria-hidden="true">
            <i class="bi bi-geo-alt-fill address-mode-icon" />
          </span>
          <span class="address-mode-text">
            <span class="address-mode-title"><I18nText k="enroll.useExistingAddress" /></span>
            <span class="address-mode-hint"><I18nText k="enroll.useExistingAddressHint" /></span>
          </span>
          <span class="address-mode-check" aria-hidden="true">
            <i class="bi bi-check-lg" />
          </span>
        </span>
      </button>
      <button
        :id="idPrefix + '-mode-new'"
        type="button"
        role="radio"
        class="address-mode-card"
        :class="{ active: !isExistingMode }"
        :aria-checked="!isExistingMode"
        :tabindex="!isExistingMode ? 0 : -1"
        @click="setMode(false)"
        @keydown="onNewKeydown"
      >
        <span class="address-mode-card-inner">
          <span class="address-mode-icon-wrap" aria-hidden="true">
            <i class="bi bi-pencil-square address-mode-icon" />
          </span>
          <span class="address-mode-text">
            <span class="address-mode-title"><I18nText k="enroll.enterNewAddress" /></span>
            <span class="address-mode-hint"><I18nText k="enroll.enterNewAddressHint" /></span>
          </span>
          <span class="address-mode-check" aria-hidden="true">
            <i class="bi bi-check-lg" />
          </span>
        </span>
      </button>
    </div>
    <template v-if="isExistingMode">
      <template v-if="addressOptions.length">
        <CustomSelect
          :id="idPrefix + '-select'"
          :model-value="modelValue.addressId"
          :options="addressOptions"
          :placeholder="t('enroll.selectAddress')"
          @update:model-value="setAddressId"
        />
      </template>
      <div v-else class="address-empty-state">
        <i class="bi bi-info-circle" />
        <span><I18nText k="enroll.noSavedAddresses" /></span>
        <button type="button" class="address-empty-action" @click="setMode(false)">
          <I18nText k="enroll.enterNewAddress" />
        </button>
      </div>
    </template>
    <template v-else>
      <div class="address-fields">
        <div class="field field-select">
          <label :for="idPrefix + '-country'"><I18nText k="enroll.country" /></label>
          <CustomSelect
            :id="idPrefix + '-country'"
            :model-value="(modelValue.new?.country || '').toLowerCase()"
            :options="countryOptions"
            :placeholder="t('enroll.selectCountry')"
            @update:model-value="onCountryChange"
          />
        </div>
        <div class="field-row">
          <div class="field">
            <label :for="idPrefix + '-postalCode'"><I18nText k="enroll.postalCode" /></label>
            <div class="autocomplete-wrap">
              <input
                :id="idPrefix + '-postalCode'"
                type="text"
                :value="modelValue.new?.postalCode"
                @input="onZipInput($event.target.value)"
              />
              <div v-if="zipLoading" class="autocomplete-state">
              <i class="bi bi-arrow-repeat spin" /> {{ t('enroll.addressLookupLoading') }}
              </div>
              <div v-else-if="zipSuggestions.length" class="autocomplete-list" role="listbox">
                <button
                  v-for="(s, i) in zipSuggestions"
                  :key="idPrefix + '-zip-s-' + i"
                  type="button"
                  class="autocomplete-item"
                  @click="applyZipSuggestion(s)"
                >
                  <span class="autocomplete-item-main">{{ s.postalCode }} {{ s.city }}</span>
                  <span v-if="s.state" class="autocomplete-item-sub">{{ s.state }}</span>
                </button>
              </div>
            </div>
          </div>
          <div class="field field-flex">
            <label :for="idPrefix + '-city'"><I18nText k="enroll.city" /></label>
            <input
              :id="idPrefix + '-city'"
              type="text"
              :value="modelValue.new?.city"
              @input="setNewField('city', $event.target.value)"
            />
          </div>
        </div>
        <div class="field">
          <label :for="idPrefix + '-street'"><I18nText k="enroll.street" /></label>
          <div class="autocomplete-wrap">
            <input
              :id="idPrefix + '-street'"
              type="text"
              :disabled="!streetContextReady"
              :placeholder="streetContextReady ? '' : t('enroll.postalCode')"
              :value="modelValue.new?.street"
              @input="onStreetInput($event.target.value)"
            />
            <div v-if="!streetContextReady" class="autocomplete-state">
              <i class="bi bi-info-circle" /> <I18nText k="enroll.selectCountry" /> + <I18nText k="enroll.postalCode" />
            </div>
            <div v-if="streetLoading" class="autocomplete-state">
              <i class="bi bi-arrow-repeat spin" /> {{ t('enroll.addressLookupLoading') }}
            </div>
            <div v-else-if="streetSuggestions.length" class="autocomplete-list" role="listbox">
              <button
                v-for="(s, i) in streetSuggestions"
                :key="idPrefix + '-street-s-' + i"
                type="button"
                class="autocomplete-item"
                @click="applyStreetSuggestion(s)"
              >
                <span class="autocomplete-item-main">{{ s.street }}</span>
                <span class="autocomplete-item-sub">{{ s.postalCode }} {{ s.city }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.address-selector {
  margin-bottom: 1.25rem;
}
.address-label {
  display: block;
  font-size: var(--text-base);
  font-weight: 500;
  color: var(--color-text);
  margin-bottom: 0.5rem;
}
.address-mode-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.65rem;
  margin-bottom: 1rem;
}
@media (max-width: 520px) {
  .address-mode-cards {
    grid-template-columns: 1fr;
  }
}
.address-mode-card {
  position: relative;
  margin: 0;
  padding: 0;
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg, 0.65rem);
  background: var(--color-bg-elevated);
  color: var(--color-text);
  cursor: pointer;
  text-align: left;
  font: inherit;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    background 0.2s ease,
    transform 0.15s ease;
}
.address-mode-card:hover {
  border-color: color-mix(in srgb, var(--color-accent) 45%, var(--color-border));
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.06);
}
.address-mode-card:focus {
  outline: none;
}
.address-mode-card:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.address-mode-card.active {
  border-color: var(--color-accent);
  background: color-mix(in srgb, var(--color-accent) 8%, var(--color-bg-elevated));
  box-shadow: 0 0 0 1px var(--color-accent), 0 8px 24px rgba(37, 99, 235, 0.12);
}
.address-mode-card-inner {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  padding: 0.85rem 0.9rem;
  min-height: 3.25rem;
}
.address-mode-icon-wrap {
  flex-shrink: 0;
  width: 2.35rem;
  height: 2.35rem;
  border-radius: 0.5rem;
  background: color-mix(in srgb, var(--color-text-muted) 12%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s ease, color 0.2s ease;
}
.address-mode-card.active .address-mode-icon-wrap {
  background: color-mix(in srgb, var(--color-accent) 22%, transparent);
  color: var(--color-accent);
}
.address-mode-icon {
  font-size: 1.1rem;
  opacity: 0.85;
}
.address-mode-card.active .address-mode-icon {
  opacity: 1;
}
.address-mode-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.address-mode-title {
  font-size: 0.95rem;
  font-weight: 600;
  line-height: 1.25;
}
.address-mode-hint {
  font-size: 0.78rem;
  line-height: 1.35;
  color: var(--color-text-muted);
  font-weight: 400;
}
.address-mode-check {
  flex-shrink: 0;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 999px;
  background: var(--color-accent);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transform: scale(0.85);
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.address-mode-card.active .address-mode-check {
  opacity: 1;
  transform: scale(1);
}
.address-mode-check i {
  font-size: 0.85rem;
}
.address-fields .field {
  margin-bottom: 1rem;
}
.address-fields .field:last-child {
  margin-bottom: 0;
}
.address-fields label {
  display: block;
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text-muted);
  margin-bottom: 0.35rem;
}
.address-fields input {
  width: 100%;
  padding: 0.75rem 1rem;
  min-height: var(--touch);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  font-size: var(--text-base);
  font-family: inherit;
  background: var(--color-bg-elevated);
  color: var(--color-text);
}
.address-fields input:focus {
  outline: none;
  border-color: var(--color-accent);
}
.address-fields .field-select :deep(.custom-select-trigger) {
  min-height: var(--touch);
  font-size: var(--text-base);
}
.field-row {
  display: flex;
  gap: 0.75rem;
}
.field-row .field {
  flex: 1;
}
.field-row .field-flex {
  flex: 2;
}
.autocomplete-wrap {
  position: relative;
}
.autocomplete-state {
  margin-top: 0.35rem;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}
.autocomplete-list {
  position: absolute;
  z-index: 30;
  top: calc(100% + 0.25rem);
  left: 0;
  right: 0;
  max-height: 13rem;
  overflow-y: auto;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}
.autocomplete-item {
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 0.55rem 0.7rem;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}
.autocomplete-item + .autocomplete-item {
  border-top: 1px solid var(--color-border);
}
.autocomplete-item:hover {
  background: var(--color-bg-hover);
}
.autocomplete-item-main {
  font-size: var(--text-sm);
  color: var(--color-text);
}
.autocomplete-item-sub {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}
.field-select {
  margin-bottom: 0.95rem;
}
.address-empty-state {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin-top: 0.2rem;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}
.address-empty-action {
  margin-left: auto;
  border: 1px solid var(--color-border);
  background: var(--color-bg-elevated);
  color: var(--color-text);
  border-radius: var(--radius);
  padding: 0.3rem 0.6rem;
  font-size: 0.78rem;
  cursor: pointer;
}
.address-empty-action:hover {
  background: var(--color-bg-hover);
}
.spin { animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 620px) {
  .field-row {
    flex-direction: column;
    gap: 0.6rem;
  }
}
</style>
