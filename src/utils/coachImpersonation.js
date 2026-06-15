/** sessionStorage keys (tab-local — closing the tab ends the simulation). */
export const COACH_IMPERSONATION_STORAGE_ID = 'joinViewAsCoachId'
export const COACH_IMPERSONATION_STORAGE_LABEL = 'joinViewAsCoachLabel'
/** Query param for admin view-as-coach (avoids extra CORS preflight header). */
export const COACH_IMPERSONATION_QUERY_PARAM = 'coach_contact_id'
/** Legacy/alternate: custom header (requires CORS Allow-Headers on server). */
export const COACH_IMPERSONATION_HEADER = 'X-Impersonate-Coach-Contact-Id'

export function getImpersonatedCoachId() {
  try {
    const raw = sessionStorage.getItem(COACH_IMPERSONATION_STORAGE_ID)
    const n = parseInt(String(raw), 10)
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

export function getImpersonatedCoachLabel() {
  try {
    return String(sessionStorage.getItem(COACH_IMPERSONATION_STORAGE_LABEL) || '').trim()
  } catch {
    return ''
  }
}

export function setImpersonatedCoach(coachContactId, label = '') {
  const id = parseInt(String(coachContactId), 10)
  if (!Number.isFinite(id) || id <= 0) return false
  sessionStorage.setItem(COACH_IMPERSONATION_STORAGE_ID, String(id))
  const trimmed = String(label || '').trim()
  if (trimmed) {
    sessionStorage.setItem(COACH_IMPERSONATION_STORAGE_LABEL, trimmed)
  } else {
    sessionStorage.removeItem(COACH_IMPERSONATION_STORAGE_LABEL)
  }
  return true
}

export function clearImpersonatedCoach() {
  sessionStorage.removeItem(COACH_IMPERSONATION_STORAGE_ID)
  sessionStorage.removeItem(COACH_IMPERSONATION_STORAGE_LABEL)
}

export function isCoachImpersonationActive() {
  return getImpersonatedCoachId() != null
}

/**
 * Build URL for a new tab: /dashboard?viewAs=<id>
 * @param {number} coachContactId
 * @param {string} [label]
 */
export function buildViewAsCoachUrl(coachContactId, label = '') {
  const url = new URL('/dashboard', window.location.origin)
  url.searchParams.set('viewAs', String(coachContactId))
  const trimmed = String(label || '').trim()
  if (trimmed) url.searchParams.set('viewAsLabel', trimmed)
  return url.toString()
}
