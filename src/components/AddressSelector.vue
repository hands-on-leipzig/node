<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import CustomSelect from '@/components/CustomSelect.vue'

const { t } = useI18n()

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
  idPrefix: {
    type: String,
    default: 'addr',
  },
})

const emit = defineEmits(['update:modelValue'])

const addressOptions = computed(() =>
  props.addresses.map((addr) => ({
    value: addr.id,
    label: addr.label || formatAddress(addr),
  }))
)

/** Strict boolean — avoids radios stuck when useExisting is undefined/null. */
const isExistingMode = computed(() => props.modelValue.useExisting !== false)

function formatAddress(addr) {
  if (!addr) return ''
  const parts = [addr.street, addr.postalCode && addr.city ? `${addr.postalCode} ${addr.city}` : addr.city, addr.country].filter(Boolean)
  return parts.join(', ')
}

function setMode(useExisting) {
  const wantExisting = !!useExisting
  const prev = props.modelValue
  const newBlock = prev.new || { street: '', postalCode: '', city: '', country: '' }

  let addressId = prev.addressId
  if (wantExisting) {
    const stillValid = props.addresses.some((a) => String(a.id) === String(addressId))
    if (!stillValid) {
      addressId = props.addresses[0]?.id != null ? String(props.addresses[0].id) : ''
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
</script>

<template>
  <div class="address-selector">
    <label class="address-label">{{ label }}</label>
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
      <CustomSelect
        :id="idPrefix + '-select'"
        :model-value="modelValue.addressId"
        :options="addressOptions"
        :placeholder="t('enroll.selectAddress')"
        @update:model-value="setAddressId"
      />
    </template>
    <template v-else>
      <div class="address-fields">
        <div class="field">
          <label :for="idPrefix + '-street'"><I18nText k="enroll.street" /></label>
          <input
            :id="idPrefix + '-street'"
            type="text"
            :value="modelValue.new?.street"
            @input="setNewField('street', $event.target.value)"
          />
        </div>
        <div class="field-row">
          <div class="field">
            <label :for="idPrefix + '-postalCode'"><I18nText k="enroll.postalCode" /></label>
            <input
              :id="idPrefix + '-postalCode'"
              type="text"
              :value="modelValue.new?.postalCode"
              @input="setNewField('postalCode', $event.target.value)"
            />
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
          <label :for="idPrefix + '-country'"><I18nText k="enroll.country" /></label>
          <input
            :id="idPrefix + '-country'"
            type="text"
            :value="modelValue.new?.country"
            @input="setNewField('country', $event.target.value)"
          />
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
</style>
