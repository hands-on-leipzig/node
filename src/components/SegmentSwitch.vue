<script setup>
/** Horizontal liquid-glass switch with a sliding lens, same look as the WISE results switch. */
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps({
  /** @type {{ id: string, label: string }[]} */
  options: { type: Array, required: true },
  modelValue: { type: String, default: '' },
  ariaLabel: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue'])

const switchEl = ref(null)
const lens = ref({ on: false, x: 0, y: 0, width: 0, height: 0, swoosh: false })
let lensPlaced = false
let lensResize = null
let lensSwooshTimer = 0

function placeLens() {
  const nav = switchEl.value
  if (!nav) return
  const active = nav.querySelector('.segment-switch__btn.is-on')
  if (!(active instanceof HTMLElement)) {
    lensPlaced = false
    lens.value = { ...lens.value, on: false, swoosh: false }
    return
  }
  const navBox = nav.getBoundingClientRect()
  const box = active.getBoundingClientRect()
  const x = box.left - navBox.left
  const y = box.top - navBox.top
  const moved = lensPlaced && Math.abs(x - lens.value.x) > 1
  if (lensPlaced && !moved && Math.abs(box.width - lens.value.width) < 1 && Math.abs(box.height - lens.value.height) < 1) return
  lens.value = { on: true, x, y, width: box.width, height: box.height, swoosh: moved }
  lensPlaced = true
  if (!moved) return
  window.clearTimeout(lensSwooshTimer)
  lensSwooshTimer = window.setTimeout(() => {
    lens.value = { ...lens.value, swoosh: false }
  }, 280)
}

watch(switchEl, (el) => {
  lensResize?.disconnect()
  lensResize = null
  lensPlaced = false
  if (!el) return
  nextTick(() => {
    placeLens()
    if (typeof ResizeObserver !== 'undefined') {
      lensResize = new ResizeObserver(() => placeLens())
      lensResize.observe(el)
    }
  })
})

watch(() => [props.modelValue, props.options], () => nextTick(() => placeLens()), { deep: true })

onBeforeUnmount(() => {
  lensResize?.disconnect()
  window.clearTimeout(lensSwooshTimer)
})
</script>

<template>
  <div ref="switchEl" class="segment-switch" role="tablist" :aria-label="ariaLabel || undefined">
    <span
      v-show="lens.on"
      class="segment-switch__lens"
      :class="{ 'is-swoosh': lens.swoosh }"
      :style="{
        width: `${lens.width}px`,
        height: `${lens.height}px`,
        transform: `translate(${lens.x}px, ${lens.y}px)`,
      }"
      aria-hidden="true"
    >
      <span class="segment-switch__lens-glass" />
    </span>
    <button
      v-for="option in options"
      :key="option.id"
      type="button"
      class="segment-switch__btn"
      role="tab"
      :class="{ 'is-on': modelValue === option.id }"
      :aria-selected="modelValue === option.id"
      @click="emit('update:modelValue', option.id)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<style scoped>
.segment-switch {
  position: relative;
  display: flex;
  align-items: stretch;
  gap: 0.2rem;
  min-height: 3.65rem;
  padding: 0.28rem;
  box-sizing: border-box;
  overflow: hidden;
  border: 1px solid var(--liquid-border);
  border-radius: 1.85rem;
  background: var(--liquid-tile-bg);
  backdrop-filter: blur(var(--liquid-blur)) saturate(var(--liquid-saturate));
  -webkit-backdrop-filter: blur(var(--liquid-blur)) saturate(var(--liquid-saturate));
  box-shadow: var(--liquid-shadow);
}
.segment-switch::before {
  content: "";
  position: absolute;
  z-index: 0;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.55) 0%, rgba(255, 255, 255, 0.12) 34%, transparent 58%);
}
html[data-theme='dark'] .segment-switch::before {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.18) 0%, transparent 48%);
}
.segment-switch__lens {
  position: absolute;
  z-index: 1;
  top: 0;
  left: 0;
  border-radius: 1.5rem;
  pointer-events: none;
  transition: transform 0.62s cubic-bezier(0.22, 1.45, 0.36, 1);
}
.segment-switch__lens-glass {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  background: color-mix(in srgb, var(--color-bg, #fff) 88%, transparent);
  box-shadow:
    inset 0 1.5px 0 rgba(255, 255, 255, 1),
    inset 0 -1px 0 rgba(15, 23, 42, 0.08),
    0 6px 16px rgba(15, 23, 42, 0.12);
  transform: scaleX(1) scaleY(1);
  transition: transform 0.5s cubic-bezier(0.22, 1.35, 0.36, 1);
}
.segment-switch__lens.is-swoosh .segment-switch__lens-glass {
  transform: scaleX(1.22) scaleY(0.9);
}
html[data-theme='dark'] .segment-switch__lens-glass {
  background: color-mix(in srgb, #fff 22%, transparent);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.28),
    0 6px 16px rgba(0, 0, 0, 0.28);
}
.segment-switch__btn {
  position: relative;
  z-index: 2;
  flex: 1 1 0;
  min-width: 0;
  min-height: 3rem;
  margin: 0;
  padding: 0.45rem 0.55rem;
  border: 0;
  border-radius: 1.5rem;
  background: transparent;
  color: var(--color-text-muted);
  font: inherit;
  font-size: 0.95rem;
  font-weight: 650;
  line-height: 1.15;
  text-align: center;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}
.segment-switch__btn:hover,
.segment-switch__btn:focus-visible {
  color: var(--color-text);
  outline: none;
}
.segment-switch__btn.is-on,
.segment-switch__btn.is-on:hover,
.segment-switch__btn.is-on:focus-visible {
  color: var(--color-accent, #e85d04);
  font-weight: 800;
}
@media (prefers-reduced-motion: reduce) {
  .segment-switch__lens,
  .segment-switch__lens-glass {
    transition: none;
  }
}
</style>
