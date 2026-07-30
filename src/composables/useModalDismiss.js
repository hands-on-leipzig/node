import { watch, nextTick, onUnmounted } from 'vue'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

/**
 * Shared modal keyboard/focus behaviour: Escape to close, Tab focus trap,
 * focus restore on close and optional body scroll lock.
 *
 * @param {import('vue').Ref<boolean> | (() => boolean)} source Reactive open state.
 * @param {object} opts
 * @param {import('vue').Ref<HTMLElement|null>} opts.dialogRef Dialog container ref (for the focus trap).
 * @param {() => void} opts.onClose Called when the user presses Escape.
 * @param {boolean} [opts.lockScroll=true] Lock body scroll while open.
 */
export function useModalDismiss(source, { dialogRef, onClose, lockScroll = true } = {}) {
  let lastFocused = null

  function focusableElements() {
    const root = dialogRef?.value
    if (!root) return []
    return Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
      (el) => el.offsetParent !== null || el === document.activeElement,
    )
  }

  function onKeydown(e) {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose?.()
      return
    }
    if (e.key !== 'Tab') return
    const items = focusableElements()
    const root = dialogRef?.value
    if (!items.length) {
      e.preventDefault()
      root?.focus?.()
      return
    }
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (e.shiftKey && (active === first || (root && !root.contains(active)))) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  function activate() {
    lastFocused = document.activeElement
    if (lockScroll) document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKeydown, true)
    nextTick(() => {
      const items = focusableElements()
      ;(items[0] || dialogRef?.value)?.focus?.()
    })
  }

  function deactivate() {
    if (lockScroll) document.body.style.overflow = ''
    document.removeEventListener('keydown', onKeydown, true)
    if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus()
    lastFocused = null
  }

  watch(
    source,
    (open) => {
      if (open) activate()
      else deactivate()
    },
    { immediate: true },
  )

  onUnmounted(() => {
    if (lockScroll) document.body.style.overflow = ''
    document.removeEventListener('keydown', onKeydown, true)
  })
}
