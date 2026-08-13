/** @typedef {{ handled: boolean, state: HistoryState | null, skipRestore: boolean, rearmRootTrap: boolean }} BrowserBackDetail */

export const BROWSER_BACK_EVENT = 'hot-browser-back'

/**
 * Push a history entry so the browser back button closes an overlay instead of leaving the app.
 * @param {string} overlayId
 */
function cloneRouterHistoryState() {
  if (typeof window === 'undefined') return {}
  const state = window.history.state
  if (!state || typeof state !== 'object') return {}
  const next = { ...state }
  delete next.hotBackTrap
  delete next.hotOverlay
  delete next.hotWizard
  delete next.wizardSnapshot
  return next
}

export function pushOverlayHistory(overlayId) {
  if (typeof window === 'undefined') return
  if (window.history.state?.hotOverlay === overlayId) return
  window.history.pushState(
    { ...cloneRouterHistoryState(), hotOverlay: overlayId },
    '',
    window.location.href,
  )
}

/**
 * Close an overlay via UI: pop the matching history entry when present.
 * Prefer {@link dismissOverlayHistory} when a router navigation follows —
 * history.back() races with router.push / RouterLink and can cancel the nav.
 * @param {string} overlayId
 * @returns {boolean} true when history.back() was triggered
 */
export function popOverlayHistory(overlayId) {
  if (typeof window === 'undefined') return false
  if (window.history.state?.hotOverlay === overlayId) {
    window.history.back()
    return true
  }
  return false
}

/**
 * Clear an overlay marker with replaceState (no history.back()).
 * Safe to call before router.push / from RouterLink @click handlers.
 * @param {string} overlayId
 * @returns {boolean}
 */
export function dismissOverlayHistory(overlayId) {
  if (typeof window === 'undefined') return false
  if (window.history.state?.hotOverlay !== overlayId) return false
  window.history.replaceState(
    { ...cloneRouterHistoryState() },
    '',
    window.location.href,
  )
  return true
}

/**
 * @param {{ step: number, introSubStep: string }} snapshot
 */
export function pushWizardHistorySnapshot(snapshot) {
  if (typeof window === 'undefined') return
  window.history.pushState(
    { ...cloneRouterHistoryState(), hotWizard: true, wizardSnapshot: snapshot },
    '',
    window.location.href,
  )
}

/** Prevent leaving the SPA when the user presses back on a root route. */
export function pushRootBackTrap() {
  if (typeof window === 'undefined') return
  if (window.history.state?.hotBackTrap) return
  window.history.pushState(
    { ...cloneRouterHistoryState(), hotBackTrap: true },
    '',
    window.location.href,
  )
}

/**
 * Let views/modals handle browser back first (wizard steps, open overlays, etc.).
 * @param {HistoryState | null} [state]
 * @returns {BrowserBackDetail}
 */
export function dispatchBrowserBackRequest(state = null) {
  if (typeof window === 'undefined') {
    return { handled: false, state, skipRestore: false, rearmRootTrap: false }
  }
  /** @type {BrowserBackDetail} */
  const detail = { handled: false, state, skipRestore: false, rearmRootTrap: false }
  window.dispatchEvent(new CustomEvent(BROWSER_BACK_EVENT, { detail }))
  return detail
}

/**
 * @param {import('vue-router').RouteLocationNormalizedLoaded} route
 */
export function isSpaRootRoute(route) {
  return route.name === 'dashboard' || route.name === 'venues'
}

/**
 * Routes rendered inside DashboardLayout (coach app + public venues shell).
 * @param {import('vue-router').RouteLocationNormalizedLoaded} route
 */
export function isSpaShellRoute(route) {
  return route.path === '/' || route.path.startsWith('/dashboard')
}
