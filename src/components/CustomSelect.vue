<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useDropdownPanelPosition } from '@/composables/useDropdownPanelPosition'

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  /** @type {Array<{ value?: string|number, label?: string, subLabel?: string, heading?: boolean, disabled?: boolean }>} */
  options: { type: Array, default: () => [] },
  placeholder: { type: String, default: '' },
  id: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  size: { type: String, default: 'md' }, // 'sm' | 'md'
  /** Dashboard-style glass control (uses .liquid-surface-control from @hands-on/glass) */
  surface: { type: Boolean, default: false },
  /** Blue left accent rim (with surface), matches dashboard tile accent */
  surfaceAccent: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

const open = ref(false)
const triggerRef = ref(null)
const panelRef = ref(null)
const highlightedIndex = ref(-1)
const { panelStyle, updatePanelPosition } = useDropdownPanelPosition(open, triggerRef, {
  maxHeight: '16rem',
})

function isHeading(o) {
  return !!(o && o.heading === true)
}

function isOptionDisabled(o) {
  return !!(o && o.disabled === true && !isHeading(o))
}

function isSelectable(o) {
  return !!(o && !isHeading(o) && !isOptionDisabled(o))
}

/** True when this row sits under the nearest preceding section heading. */
function optionIsInGroup(idx) {
  let lastHeading = -1
  for (let i = 0; i < idx; i++) {
    if (isHeading(props.options[i])) lastHeading = i
  }
  return lastHeading >= 0
}

function headingIsFirstInPanel(idx) {
  for (let i = 0; i < idx; i++) {
    if (isHeading(props.options[i]) || isSelectable(props.options[i]) || isOptionDisabled(props.options[i])) {
      return false
    }
  }
  return true
}

const selectableIndexes = computed(() => {
  const out = []
  props.options.forEach((o, i) => {
    if (isSelectable(o)) out.push(i)
  })
  return out
})

const selectedOption = computed(() => {
  if (props.modelValue === '' || props.modelValue === null || props.modelValue === undefined) return null
  return (
    props.options.find((o) => isSelectable(o) && String(o.value) === String(props.modelValue)) || null
  )
})

const displayLabel = computed(() => {
  const o = selectedOption.value
  return o ? (o.label ?? String(o.value)) : props.placeholder
})

const displaySubLabel = computed(() => {
  const o = selectedOption.value
  return o?.subLabel ? String(o.subLabel) : ''
})

const triggerAriaLabel = computed(() => {
  if (!selectedOption.value) return props.placeholder || 'Choose option'
  const parts = [displayLabel.value, displaySubLabel.value].filter(Boolean)
  return parts.join(', ')
})

function moveHighlight(delta) {
  const list = selectableIndexes.value
  if (!list.length) return
  let pos = list.indexOf(highlightedIndex.value)
  if (pos < 0) pos = delta > 0 ? 0 : list.length - 1
  else pos = Math.max(0, Math.min(list.length - 1, pos + delta))
  highlightedIndex.value = list[pos]
}

function toggle() {
  if (props.disabled) return
  open.value = !open.value
  if (open.value) {
    const sel = props.options.findIndex(
      (o) => isSelectable(o) && String(o.value) === String(props.modelValue),
    )
    if (sel >= 0) highlightedIndex.value = sel
    else highlightedIndex.value = selectableIndexes.value[0] ?? -1
    updatePanelPosition()
  }
}

function select(opt) {
  if (!isSelectable(opt)) return
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
    moveHighlight(1)
    return
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    moveHighlight(-1)
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
  if (!open.value || !triggerRef.value) return
  if (triggerRef.value.contains(e.target)) return
  if (panelRef.value?.contains(e.target)) return
  open.value = false
}

onMounted(() => {
  document.addEventListener('click', onClickOutside, true)
})
onUnmounted(() => {
  document.removeEventListener('click', onClickOutside, true)
})
</script>

<template>
  <div class="custom-select" :class="{ open, disabled, size }">
    <button
      :id="id || undefined"
      ref="triggerRef"
      type="button"
      class="custom-select-trigger"
      :class="{ 'liquid-surface-control': surface, 'liquid-surface-control--accent-blue': surface && surfaceAccent }"
      :disabled="disabled"
      :aria-expanded="open"
      aria-haspopup="listbox"
      :aria-label="triggerAriaLabel"
      @click.stop="toggle"
      @keydown="onKeydown"
    >
      <span
        class="custom-select-value"
        :class="{ 'custom-select-value--stacked': !!displaySubLabel }"
      >
        <span class="custom-select-value-primary">{{ displayLabel }}</span>
        <span v-if="displaySubLabel" class="custom-select-value-secondary">{{ displaySubLabel }}</span>
      </span>
      <span class="custom-select-chevron" aria-hidden="true">
        <i class="bi bi-chevron-down"></i>
      </span>
    </button>
    <Teleport to="body">
      <Transition name="custom-select-drop">
        <div
          v-if="open"
          ref="panelRef"
          class="custom-select-panel custom-select-panel--floating"
          :style="panelStyle"
          role="listbox"
          tabindex="-1"
        >
          <template v-for="(opt, idx) in options" :key="'row-' + idx">
          <div
            v-if="isHeading(opt)"
            class="custom-select-heading"
            :class="{ 'custom-select-heading--first': headingIsFirstInPanel(idx) }"
            role="presentation"
          >
            {{ opt.label }}
          </div>
          <button
            v-else
            type="button"
            role="option"
            class="custom-select-option"
            :class="{
              selected: isSelectable(opt) && String(opt.value) === String(modelValue),
              highlighted: idx === highlightedIndex,
              'custom-select-option--disabled': isOptionDisabled(opt),
              'custom-select-option--indented': optionIsInGroup(idx),
            }"
            :disabled="isOptionDisabled(opt)"
            :aria-selected="isSelectable(opt) && String(opt.value) === String(modelValue)"
            @click="select(opt)"
            @mouseenter="highlightedIndex = idx"
          >
            <span
              class="custom-select-option-text"
              :class="{ 'custom-select-option-text--stacked': !!opt.subLabel }"
            >
              <span class="custom-select-option-primary">{{ opt.label ?? opt.value }}</span>
              <span v-if="opt.subLabel" class="custom-select-option-secondary">{{ opt.subLabel }}</span>
            </span>
          </button>
          </template>
        </div>
      </Transition>
    </Teleport>
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
  cursor: pointer;
  text-align: left;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
}
.custom-select-trigger:has(.custom-select-value--stacked) {
  min-height: auto;
  padding-top: 0.7rem;
  padding-bottom: 0.7rem;
}
.custom-select-trigger:not(.liquid-surface-control) {
  background-color: var(--color-bg-elevated);
  border: 1px solid var(--liquid-border, var(--color-border));
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm), inset 0 1px 0 rgba(255, 255, 255, 0.12);
}
.custom-select-trigger:not(.liquid-surface-control):hover:not(:disabled) {
  border-color: var(--color-border-strong);
  background-color: var(--color-bg-muted);
}
.custom-select-trigger:not(.liquid-surface-control):focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px var(--color-accent-soft);
}
.custom-select-trigger:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.custom-select.open .custom-select-trigger:not(.liquid-surface-control) {
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
.custom-select-value--stacked {
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
  white-space: normal;
}
.custom-select-value-primary {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.custom-select-value-secondary {
  display: block;
  font-size: 0.78rem;
  line-height: 1.3;
  color: var(--color-text-muted);
  font-weight: 400;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.custom-select-option-text {
  display: block;
}
.custom-select-option-text--stacked {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.custom-select-option-primary {
  display: block;
  line-height: 1.3;
}
.custom-select-option-secondary {
  display: block;
  font-size: 0.78rem;
  line-height: 1.35;
  color: var(--color-text-muted);
  font-weight: 400;
}
.custom-select-option.selected .custom-select-option-secondary {
  color: color-mix(in srgb, var(--color-accent) 72%, var(--color-text-muted));
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
  overflow-y: auto;
  background: var(--liquid-popover-fill);
  border: 1px solid var(--liquid-border, var(--color-border));
  box-shadow: var(--shadow-lg);
  padding: 0.35rem 0.25rem;
  backdrop-filter: blur(var(--liquid-popover-blur)) saturate(var(--liquid-popover-saturate));
  -webkit-backdrop-filter: blur(var(--liquid-popover-blur)) saturate(var(--liquid-popover-saturate));
}
.custom-select-panel--floating {
  border-radius: var(--radius);
}
.custom-select-heading {
  margin: 0.55rem 0.35rem 0.25rem;
  padding: 0.5rem 0.65rem 0.4rem 0.75rem;
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--color-text-muted);
  background: color-mix(in srgb, var(--color-bg-muted) 88%, transparent);
  border-left: 3px solid var(--color-accent);
  border-radius: 0 var(--radius) var(--radius) 0;
  pointer-events: none;
  user-select: none;
}
.custom-select-heading--first {
  margin-top: 0.15rem;
}
.custom-select-option:has(.custom-select-option-text--stacked) {
  padding-top: 0.5rem;
  padding-bottom: 0.5rem;
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
.custom-select-option--indented {
  margin-left: 0.65rem;
  margin-right: 0.2rem;
  padding-left: 1.15rem;
  width: calc(100% - 0.85rem);
  border-left: 1px solid color-mix(in srgb, var(--color-border) 75%, transparent);
  border-radius: 0 6px 6px 0;
}
.custom-select.size-sm .custom-select-option--indented {
  margin-left: 0.5rem;
  padding-left: 0.95rem;
  width: calc(100% - 0.7rem);
}
.custom-select-option--disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.custom-select-option:hover:not(:disabled),
.custom-select-option.highlighted:not(:disabled) {
  background: var(--color-bg-muted);
}
.custom-select-option.selected {
  background: var(--color-accent-soft);
  color: var(--color-accent);
  font-weight: 500;
}
.custom-select-option.selected.highlighted:not(:disabled),
.custom-select-option.selected:hover:not(:disabled) {
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
