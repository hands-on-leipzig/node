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

  function requestedMaxPx() {
    if (typeof maxHeight === 'number' && Number.isFinite(maxHeight)) return maxHeight
    if (typeof maxHeight !== 'string') return 280
    const n = parseFloat(maxHeight)
    if (!Number.isFinite(n)) return 280
    if (maxHeight.endsWith('rem') || maxHeight.endsWith('em')) {
      const root = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
      return n * root
    }
    return n
  }

  function updatePanelPosition() {
    const el = triggerRef.value
    if (!el || !open.value) return
    const rect = el.getBoundingClientRect()
    const viewportH = window.innerHeight || document.documentElement.clientHeight
    const edge = 8
    const spaceBelow = Math.max(0, viewportH - rect.bottom - gap - edge)
    const spaceAbove = Math.max(0, rect.top - gap - edge)
    const requested = requestedMaxPx()
    const openBelow = spaceBelow >= requested || spaceBelow >= spaceAbove
    const available = openBelow ? spaceBelow : spaceAbove
    const maxPx = Math.max(0, Math.min(requested, available))

    const shared = {
      position: 'fixed',
      left: `${Math.round(rect.left)}px`,
      width: `${Math.round(rect.width)}px`,
      maxHeight: `${Math.round(maxPx)}px`,
      overflowY: 'auto',
      zIndex: String(zIndex),
    }
    panelStyle.value = openBelow
      ? { ...shared, top: `${Math.round(rect.bottom + gap)}px` }
      : { ...shared, bottom: `${Math.round(viewportH - rect.top + gap)}px` }
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
