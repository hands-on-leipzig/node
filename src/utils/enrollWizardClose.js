/** Ask an open enroll wizard (on the dashboard) to close (with confirm in the wizard). */
export const CLOSE_ENROLL_WIZARD_EVENT = 'hot-close-enroll-wizard'

/**
 * Request closing the enroll wizard.
 * If a wizard is open it will call `preventDefault()` on the event and show an abort confirm.
 * @param {{ navigateHome?: boolean }} [detail]
 * @returns {boolean} true if a wizard handled the request (is open)
 */
export function requestCloseEnrollWizard(detail = {}) {
  if (typeof window === 'undefined') return false
  const event = new CustomEvent(CLOSE_ENROLL_WIZARD_EVENT, {
    cancelable: true,
    detail: { navigateHome: true, ...detail },
  })
  window.dispatchEvent(event)
  return event.defaultPrevented
}
