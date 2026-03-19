<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps({
  /** List of event objects (id, label/name/title/ref, capacity, registered, etc.) */
  events: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  modelValue: { type: [String, Number], default: '' },
  placeholder: { type: String, default: '' },
  /** Title shown above the dropdown (e.g. "Alle Events") */
  title: { type: String, default: '' },
  /** Function (ev) => string to display each event (e.g. name + capacity) */
  eventLabelFn: { type: Function, default: (ev) => ev?.label || ev?.name || ev?.title || ev?.ref || `Event ${ev?.id ?? ''}` },
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

const open = ref(false)
const triggerRef = ref(null)
const panelRef = ref(null)
const highlightedIndex = ref(-1)

const selectedEvent = computed(() => {
  if (props.modelValue === '' || props.modelValue === null || props.modelValue === undefined) return null
  return props.events.find((e) => String(e.id) === String(props.modelValue)) || null
})

const displayText = computed(() => {
  if (selectedEvent.value) return props.eventLabelFn(selectedEvent.value)
  return props.placeholder
})

function getEventLabel(ev) {
  return props.eventLabelFn(ev)
}

function toggle() {
  if (props.disabled || props.loading) return
  open.value = !open.value
  if (open.value) {
    highlightedIndex.value = props.events.findIndex((e) => String(e.id) === String(props.modelValue))
    if (highlightedIndex.value < 0) highlightedIndex.value = 0
  }
}

function select(ev) {
  emit('update:modelValue', ev.id)
  open.value = false
}

function onKeydown(e) {
  if (!open.value) {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault()
      toggle()
    }
    return
  }
  if (e.key === 'Escape') {
    e.preventDefault()
    open.value = false
    triggerRef.value?.focus()
    return
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    highlightedIndex.value = Math.min(highlightedIndex.value + 1, props.events.length - 1)
    return
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    highlightedIndex.value = Math.max(highlightedIndex.value - 1, 0)
    return
  }
  if (e.key === 'Enter') {
    e.preventDefault()
    const ev = props.events[highlightedIndex.value]
    if (ev) select(ev)
    return
  }
}

function onClickOutside(e) {
  if (open.value && triggerRef.value && panelRef.value && !triggerRef.value.contains(e.target) && !panelRef.value.contains(e.target)) {
    open.value = false
  }
}

onMounted(() => document.addEventListener('click', onClickOutside))
onUnmounted(() => document.removeEventListener('click', onClickOutside))

watch(() => props.events.length, () => {
  if (highlightedIndex.value >= props.events.length) highlightedIndex.value = Math.max(0, props.events.length - 1)
})
</script>

<template>
  <div class="event-select" :class="{ open, disabled: disabled || loading }">
    <label v-if="title" class="event-select-title">{{ title }}</label>
    <div class="event-select-trigger-wrap">
      <button
        ref="triggerRef"
        type="button"
        class="event-select-trigger"
        :disabled="disabled || loading"
        :aria-expanded="open"
        aria-haspopup="listbox"
        @click="toggle"
        @keydown="onKeydown"
      >
        <span class="event-select-value">{{ displayText }}</span>
        <span class="event-select-chevron">
          <i v-if="loading" class="bi bi-arrow-repeat spin"></i>
          <i v-else class="bi bi-chevron-down"></i>
        </span>
      </button>
      <Transition name="event-select-drop">
        <div
          v-show="open"
          ref="panelRef"
          class="event-select-panel"
          role="listbox"
          tabindex="-1"
        >
          <button
            v-for="(ev, idx) in events"
            :key="ev.id"
            type="button"
            role="option"
            class="event-select-option"
            :class="{
              selected: String(ev.id) === String(modelValue),
              highlighted: idx === highlightedIndex,
            }"
            :aria-selected="String(ev.id) === String(modelValue)"
            @click="select(ev)"
            @mouseenter="highlightedIndex = idx"
          >
            <span class="event-select-option-label">{{ getEventLabel(ev) }}</span>
          </button>
          <p v-if="!loading && events.length === 0" class="event-select-empty"><I18nText k="wizard.eventSelectNoEvents" /></p>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.event-select {
  position: relative;
  width: 100%;
}
.event-select-title {
  display: block;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-text-muted);
  margin-bottom: 0.5rem;
  letter-spacing: 0.02em;
}
.event-select-trigger-wrap {
  position: relative;
}
.event-select-trigger {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.875rem 1.125rem;
  min-height: 3rem;
  font-size: 1rem;
  font-family: inherit;
  color: var(--color-text);
  background: linear-gradient(145deg, var(--color-bg-elevated) 0%, var(--color-bg-muted) 100%);
  border: 2px solid var(--color-border);
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.15s ease;
}
.event-select-trigger:hover:not(:disabled) {
  border-color: var(--color-accent);
  box-shadow: 0 4px 14px rgba(59, 130, 246, 0.15);
  transform: translateY(-1px);
}
.event-select-trigger:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 0 0 0 4px var(--color-accent-soft);
}
.event-select-trigger:disabled {
  opacity: 0.7;
  cursor: not-allowed;
  transform: none;
}
.event-select.open .event-select-trigger {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 4px var(--color-accent-soft);
  border-bottom-left-radius: 4px;
  border-bottom-right-radius: 4px;
}
.event-select-value {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: inherit;
}
.event-select-value:empty::before {
  content: attr(data-placeholder);
  color: var(--color-text-muted);
}
.event-select-chevron {
  flex-shrink: 0;
  color: var(--color-text-muted);
  font-size: 1.1rem;
  transition: transform 0.2s ease;
}
.event-select.open .event-select-chevron .bi-chevron-down {
  transform: rotate(180deg);
}
.event-select-chevron .spin {
  animation: event-select-spin 0.8s linear infinite;
}
@keyframes event-select-spin {
  to { transform: rotate(360deg); }
}
.event-select-panel {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% - 2px);
  z-index: 100;
  max-height: 280px;
  overflow-y: auto;
  background: var(--color-bg-elevated);
  border: 2px solid var(--color-accent);
  border-top: none;
  border-radius: 0 0 12px 12px;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.12);
  padding: 0.35rem;
}
.event-select-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  width: 100%;
  padding: 0.75rem 1rem;
  font-size: 0.9375rem;
  font-family: inherit;
  color: var(--color-text);
  background: none;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s ease, color 0.12s ease;
}
.event-select-option:hover,
.event-select-option.highlighted {
  background: var(--color-accent-soft);
  color: var(--color-accent);
}
.event-select-option.selected {
  background: var(--color-accent-soft);
  color: var(--color-accent);
  font-weight: 600;
}
.event-select-option-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.event-select-empty {
  padding: 1rem;
  margin: 0;
  font-size: 0.875rem;
  color: var(--color-text-muted);
  text-align: center;
}
.event-select-drop-enter-active,
.event-select-drop-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.event-select-drop-enter-from,
.event-select-drop-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
