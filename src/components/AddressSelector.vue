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

function formatAddress(addr) {
  if (!addr) return ''
  const parts = [addr.street, addr.postalCode && addr.city ? `${addr.postalCode} ${addr.city}` : addr.city, addr.country].filter(Boolean)
  return parts.join(', ')
}

function setMode(useExisting) {
  emit('update:modelValue', {
    ...props.modelValue,
    useExisting,
    addressId: useExisting ? (props.addresses[0]?.id || '') : '',
    new: props.modelValue.new || { street: '', postalCode: '', city: '', country: '' },
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
</script>

<template>
  <div class="address-selector">
    <label class="address-label">{{ label }}</label>
    <div class="address-mode">
      <label class="radio-label">
        <input
          type="radio"
          :name="idPrefix + '-mode'"
          :checked="modelValue.useExisting"
          @change="setMode(true)"
        />
        <span>{{ t('enroll.useExistingAddress') }}</span>
      </label>
      <label class="radio-label">
        <input
          type="radio"
          :name="idPrefix + '-mode'"
          :checked="!modelValue.useExisting"
          @change="setMode(false)"
        />
        <span>{{ t('enroll.enterNewAddress') }}</span>
      </label>
    </div>
    <template v-if="modelValue.useExisting">
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
          <label :for="idPrefix + '-street'">{{ t('enroll.street') }}</label>
          <input
            :id="idPrefix + '-street'"
            type="text"
            :value="modelValue.new?.street"
            @input="setNewField('street', ($event.target).value)"
          />
        </div>
        <div class="field-row">
          <div class="field">
            <label :for="idPrefix + '-postalCode'">{{ t('enroll.postalCode') }}</label>
            <input
              :id="idPrefix + '-postalCode'"
              type="text"
              :value="modelValue.new?.postalCode"
              @input="setNewField('postalCode', ($event.target).value)"
            />
          </div>
          <div class="field field-flex">
            <label :for="idPrefix + '-city'">{{ t('enroll.city') }}</label>
            <input
              :id="idPrefix + '-city'"
              type="text"
              :value="modelValue.new?.city"
              @input="setNewField('city', ($event.target).value)"
            />
          </div>
        </div>
        <div class="field">
          <label :for="idPrefix + '-country'">{{ t('enroll.country') }}</label>
          <input
            :id="idPrefix + '-country'"
            type="text"
            :value="modelValue.new?.country"
            @input="setNewField('country', ($event.target).value)"
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
.address-mode {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 0.75rem;
}
.radio-label {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: var(--text-base);
  color: var(--color-text);
  cursor: pointer;
}
.radio-label input {
  width: 1.1rem;
  height: 1.1rem;
  accent-color: var(--color-accent);
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
