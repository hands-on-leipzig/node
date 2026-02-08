<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  options: { type: Array, default: () => [] },
  placeholder: { type: String, default: '' },
  id: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  size: { type: String, default: 'md' }, // 'sm' | 'md'
})

const emit = defineEmits(['update:modelValue'])

const open = ref(false)
const triggerRef = ref(null)
const panelRef = ref(null)
const highlightedIndex = ref(-1)

const selectedOption = computed(() => {
  if (props.modelValue === '' || props.modelValue === null || props.modelValue === undefined) return null
  return props.options.find((o) => String(o.value) === String(props.modelValue)) || null
})

const displayLabel = computed(() => {
  const o = selectedOption.value
  return o ? (o.label ?? String(o.value)) : props.placeholder
})

function toggle() {
  if (props.disabled) return
  open.value = !open.value
  if (open.value) highlightedIndex.value = props.options.findIndex((o) => String(o.value) === String(props.modelValue))
  if (open.value && highlightedIndex.value < 0) highlightedIndex.value = 0
}

function select(opt) {
  emit('update:modelValue', opt.value)
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
    highlightedIndex.value = Math.min(highlightedIndex.value + 1, props.options.length - 1)
    return
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    highlightedIndex.value = Math.max(highlightedIndex.value - 1, 0)
    return
  }
  if (e.key === 'Enter') {
    e.preventDefault()
    const opt = props.options[highlightedIndex.value]
    if (opt) select(opt)
    return
  }
}

function onClickOutside(e) {
  if (open.value && triggerRef.value && panelRef.value && !triggerRef.value.contains(e.target) && !panelRef.value.contains(e.target)) {
    open.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', onClickOutside)
})
onUnmounted(() => {
  document.removeEventListener('click', onClickOutside)
})
</script>

<template>
  <div class="custom-select" :class="{ open, disabled, size }">
    <button
      :id="id || undefined"
      ref="triggerRef"
      type="button"
      class="custom-select-trigger"
      :disabled="disabled"
      :aria-expanded="open"
      aria-haspopup="listbox"
      aria-label="Choose option"
      @click="toggle"
      @keydown="onKeydown"
    >
      <span class="custom-select-value">{{ displayLabel }}</span>
      <span class="custom-select-chevron" aria-hidden="true">
        <i class="bi bi-chevron-down"></i>
      </span>
    </button>
    <Transition name="custom-select-drop">
      <div
        v-show="open"
        ref="panelRef"
        class="custom-select-panel"
        role="listbox"
        tabindex="-1"
      >
        <button
          v-for="(opt, idx) in options"
          :key="String(opt.value)"
          type="button"
          role="option"
          class="custom-select-option"
          :class="{ selected: String(opt.value) === String(modelValue), highlighted: idx === highlightedIndex }"
          :aria-selected="String(opt.value) === String(modelValue)"
          @click="select(opt)"
          @mouseenter="highlightedIndex = idx"
        >
          {{ opt.label ?? opt.value }}
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.custom-select {
  position: relative;
  width: 100%;
}
.custom-select-trigger {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.875rem 1rem;
  padding-right: 2.5rem;
  min-height: var(--touch-lg);
  font-size: var(--text-lg);
  font-family: inherit;
  color: var(--color-text);
  background-color: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
}
.custom-select-trigger:hover:not(:disabled) {
  border-color: var(--color-border-strong);
  background-color: var(--color-bg-muted);
}
.custom-select-trigger:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px var(--color-accent-soft);
}
.custom-select-trigger:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.custom-select.open .custom-select-trigger {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px var(--color-accent-soft);
}
.custom-select-value {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.custom-select-value:empty::before {
  content: attr(data-placeholder);
  color: var(--color-text-subtle);
}
.custom-select-chevron {
  position: absolute;
  right: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  color: var(--color-text-muted);
  font-size: 1rem;
  pointer-events: none;
  transition: transform 0.2s ease;
}
.custom-select.open .custom-select-chevron {
  transform: translateY(-50%) rotate(180deg);
}
.custom-select-panel {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 4px);
  z-index: 50;
  max-height: 16rem;
  overflow-y: auto;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
  padding: 0.25rem;
}
.custom-select-option {
  display: block;
  width: 100%;
  padding: 0.625rem 0.875rem;
  font-size: var(--text-base);
  font-family: inherit;
  color: var(--color-text);
  background: none;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
  transition: background 0.1s;
}
.custom-select-option:hover,
.custom-select-option.highlighted {
  background: var(--color-bg-muted);
}
.custom-select-option.selected {
  background: var(--color-accent-soft);
  color: var(--color-accent);
  font-weight: 500;
}
.custom-select-option.selected.highlighted,
.custom-select-option.selected:hover {
  background: var(--color-accent-soft);
}
.custom-select.size-sm .custom-select-trigger {
  padding: 0.35rem 2.25rem 0.35rem 0.5rem;
  min-height: auto;
  font-size: var(--text-sm);
}
.custom-select.size-sm .custom-select-chevron {
  right: 0.5rem;
  font-size: 0.85rem;
}
.custom-select-drop-enter-active,
.custom-select-drop-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.custom-select-drop-enter-from,
.custom-select-drop-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
