<script setup>
/**
 * Native country <select> for reliable browser autofill (CustomSelect is not recognized).
 */
const props = defineProps({
  modelValue: { type: String, default: '' },
  id: { type: String, default: '' },
  name: { type: String, default: '' },
  autocomplete: { type: String, default: 'country' },
  placeholder: { type: String, default: '' },
  required: { type: Boolean, default: false },
  /** Flat list: [{ value, label }] */
  options: { type: Array, default: () => [] },
  /** Grouped: { topLabel, top: [], restLabel, rest: [] } */
  groups: { type: Object, default: null },
  /** 'address' | 'wizard' — matches surrounding field styles */
  variant: { type: String, default: 'address' },
})

const emit = defineEmits(['update:modelValue'])

function onChange(event) {
  emit('update:modelValue', event.target.value)
}
</script>

<template>
  <select
    :id="id"
    :name="name"
    :autocomplete="autocomplete"
    :value="modelValue"
    :required="required"
    :class="['country-native-select', `country-native-select--${variant}`]"
    @change="onChange"
  >
    <option value="" disabled>{{ placeholder }}</option>
    <template v-if="groups">
      <optgroup v-if="groups.top?.length" :label="groups.topLabel">
        <option
          v-for="opt in groups.top"
          :key="'top-' + opt.value"
          :value="opt.value"
        >
          {{ opt.label }}
        </option>
      </optgroup>
      <optgroup v-if="groups.rest?.length" :label="groups.restLabel">
        <option
          v-for="opt in groups.rest"
          :key="'rest-' + opt.value"
          :value="opt.value"
        >
          {{ opt.label }}
        </option>
      </optgroup>
    </template>
    <template v-else>
      <option
        v-for="opt in options"
        :key="opt.value"
        :value="opt.value"
      >
        {{ opt.label }}
      </option>
    </template>
  </select>
</template>

<style scoped>
.country-native-select {
  width: 100%;
  padding: 0.75rem 1rem;
  min-height: var(--touch, 2.75rem);
  border: 1px solid var(--color-border);
  border-radius: var(--radius, 0.5rem);
  font-size: var(--text-base, 1rem);
  font-family: inherit;
  background: var(--color-bg-elevated);
  color: var(--color-text);
  appearance: auto;
}
.country-native-select:focus {
  outline: none;
  border-color: var(--color-accent);
}
.country-native-select--wizard {
  border-radius: var(--radius-lg, 0.65rem);
  background: var(--color-bg);
}
</style>
