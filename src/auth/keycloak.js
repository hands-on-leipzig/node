import Keycloak from 'keycloak-js'

const keycloakConfig = {
  url: import.meta.env.VITE_KEYCLOAK_URL || 'https://sso.hands-on-technology.org',
  realm: import.meta.env.VITE_KEYCLOAK_REALM || 'master',
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'node',
}

export const keycloak = new Keycloak(keycloakConfig)

/**
 * Initialize Keycloak. Call before mounting the app.
 * @param {Object} options - { onLoad: 'login-required' | 'check-sso' }
 * @returns {Promise<boolean>} true if authenticated
 */
export function initKeycloak(options = {}) {
  const { onLoad = 'check-sso' } = options
  return keycloak.init({
    onLoad,
    checkLoginIframe: false,
    pkceMethod: 'S256',
  })
}

export function getToken() {
  return keycloak.token
}

export function isAuthenticated() {
  return !!keycloak.authenticated
}

/** Realm role name that grants access to the app (coaches only) */
const COACH_REALM_ROLE = 'coach'

/**
 * True if the current user has the realm role "coach". Use after isAuthenticated().
 * Keycloak puts realm roles in tokenParsed.realm_access.roles.
 */
export function hasCoachRole() {
  if (!keycloak.authenticated || !keycloak.tokenParsed) return false
  const roles = keycloak.tokenParsed.realm_access?.roles
  return Array.isArray(roles) && roles.includes(COACH_REALM_ROLE)
}

/** Claim name for the coach's Dolibarr contact ID in the token (must match Keycloak mapper and DRAHT config) */
const DOLIBARR_CONTACT_CLAIM = 'dolibarr_contact_id'

export function getUserProfile() {
  if (!keycloak.authenticated || !keycloak.tokenParsed) return null
  const p = keycloak.tokenParsed
  return {
    name: p.name ?? p.preferred_username ?? 'Coach',
    email: p.email ?? '',
    username: p.preferred_username ?? '',
    picture: p.picture ?? '',
  }
}

/**
 * Dolibarr contact ID for the current coach (from Keycloak user attribute, exposed in token).
 * Used by DRAHT to identify the coach and find their teams. Frontend does not need to send it;
 * the DRAHT middleware reads it from the Bearer token.
 * @returns {number|null} Contact ID or null if not in token
 */
export function getCoachDolibarrContactId() {
  if (!keycloak.authenticated || !keycloak.tokenParsed) return null
  const v = keycloak.tokenParsed[DOLIBARR_CONTACT_CLAIM]
  if (v == null || v === '') return null
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : null
}

export function login() {
  keycloak.login()
}

export function logout() {
  keycloak.logout()
}

export function updateToken(minValidity = 30) {
  return keycloak.updateToken(minValidity)
}
