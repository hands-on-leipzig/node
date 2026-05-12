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
let initPromise = null

export function initKeycloak(options = {}) {
  if (initPromise) return initPromise
  const { onLoad = 'check-sso' } = options
  initPromise = keycloak.init({
    onLoad,
    checkLoginIframe: false,
    pkceMethod: 'S256',
  })
  return initPromise
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

/** Client role on the node client (Keycloak: Clients → node → Roles → node-admin). */
const NODE_ADMIN_CLIENT_ROLE = 'node-admin'

/**
 * App admin: Keycloak client role "node-admin" on this app’s client, or legacy realm role "admin".
 */
export function hasAdminRole() {
  if (!keycloak.authenticated || !keycloak.tokenParsed) return false
  const p = keycloak.tokenParsed
  const clientId = keycloakConfig.clientId
  const clientRoles = p.resource_access?.[clientId]?.roles
  if (Array.isArray(clientRoles) && clientRoles.includes(NODE_ADMIN_CLIENT_ROLE)) {
    return true
  }
  const realmRoles = p.realm_access?.roles
  return Array.isArray(realmRoles) && realmRoles.includes('admin')
}

/** Claim(s) for the coach's Dolibarr contact ID in the token (Keycloak protocol mapper). Server may use a different name via API_KEYCLOAK_DOLIBARR_CONTACT_CLAIM; set VITE_KEYCLOAK_DOLIBARR_CONTACT_CLAIM to match. */
function dolibarrContactClaimCandidates() {
  const fromEnv = import.meta.env.VITE_KEYCLOAK_DOLIBARR_CONTACT_CLAIM
  const list = []
  if (fromEnv && String(fromEnv).trim()) list.push(String(fromEnv).trim())
  list.push('dolibarr_contact_id', 'dolibarrContactId', 'dolibarr_id')
  return [...new Set(list)]
}

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
 * Dolibarr contact ID from the Keycloak token, if the mapper exposes it to this client’s access token.
 * Team enrollment uses the same Bearer on the server; for the authoritative ID use getNodeCoachMe() in draht.js.
 * @returns {number|null}
 */
export function getCoachDolibarrContactId() {
  if (!keycloak.authenticated || !keycloak.tokenParsed) return null
  const p = keycloak.tokenParsed
  for (const claim of dolibarrContactClaimCandidates()) {
    const v = p[claim]
    if (v != null && v !== '') {
      const n = parseInt(v, 10)
      if (Number.isFinite(n)) return n
    }
  }
  return null
}

export async function login() {
  const redirectUri = `${window.location.origin}/dashboard`
  try {
    await initKeycloak({ onLoad: 'check-sso' })
    return keycloak.login({ redirectUri })
  } catch (e) {
    try {
      const url = keycloak.createLoginUrl({ redirectUri })
      window.location.assign(url)
    } catch (err) {
      console.error('Keycloak login failed', err)
      throw err
    }
  }
}

export function logout() {
  keycloak.logout()
}

export function updateToken(minValidity = 30) {
  return keycloak.updateToken(minValidity)
}
