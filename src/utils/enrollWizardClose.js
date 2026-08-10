/** Ask an open enroll wizard (on the dashboard) to close. */
export const CLOSE_ENROLL_WIZARD_EVENT = 'hot-close-enroll-wizard'

export function requestCloseEnrollWizard() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(CLOSE_ENROLL_WIZARD_EVENT))
}
