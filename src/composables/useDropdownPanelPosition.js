import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue'

/**
 * Positions a dropdown panel with `position: fixed` from the trigger rect.
 * Use with Teleport to="body" so panels are not clipped by overflow containers (e.g. wizard scroll).
 */
export function useDropdownPanelPosition(open, triggerRef, options = {}) {
  const {
    gap = 4,
    zIndex = 10600,
    maxHeight = '280px',
  } = options

  const panelStyle = ref({})

  function updatePanelPosition() {
    const el = triggerRef.value
    if (!el || !open.value) return
    const rect = el.getBoundingClientRect()
    const viewportH = window.innerHeight || document.documentElement.clientHeight
    const spaceBelow = viewportH - rect.bottom
    const spaceAbove = rect.top
    const maxH = typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight
    const panelMaxPx =
      typeof maxHeight === 'string' && maxHeight.endsWith('px') ? parseFloat(maxHeight) : 220
    const preferBelow = spaceBelow >= panelMaxPx * 0.45 || spaceBelow >= spaceAbove

    if (preferBelow) {
      panelStyle.value = {
        position: 'fixed',
        top: `${Math.round(rect.bottom + gap)}px`,
        left: `${Math.round(rect.left)}px`,
        width: `${Math.round(rect.width)}px`,
        maxHeight: maxH,
        zIndex: String(zIndex),
      }
    } else {
      panelStyle.value = {
        position: 'fixed',
        bottom: `${Math.round(viewportH - rect.top + gap)}px`,
        left: `${Math.round(rect.left)}px`,
        width: `${Math.round(rect.width)}px`,
        maxHeight: maxH,
        zIndex: String(zIndex),
      }
    }
  }

  watch(open, (isOpen) => {
    if (isOpen) nextTick(updatePanelPosition)
    else panelStyle.value = {}
  })

  onMounted(() => {
    window.addEventListener('scroll', updatePanelPosition, true)
    window.addEventListener('resize', updatePanelPosition)
  })

  onUnmounted(() => {
    window.removeEventListener('scroll', updatePanelPosition, true)
    window.removeEventListener('resize', updatePanelPosition)
  })

  return { panelStyle, updatePanelPosition }
}
