import axios from 'axios'
import { getToken, updateToken } from '@/auth/keycloak'

// Use proxy when api/index.php cannot be changed: set VITE_DRAHT_API_URL to https://your-domain/custom/handson/api_proxy.php
const baseURL = (import.meta.env.VITE_DRAHT_API_URL || '') + '/handson/node'
const handsonBaseURL = (import.meta.env.VITE_DRAHT_API_URL || '') + '/handson'

const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
})

const handsonApi = axios.create({
  baseURL: handsonBaseURL,
  headers: {
    'Content-Type': 'application/json',
  },
})

const injectAuth = async (config) => {
  await updateToken(5)
  const token = getToken()
  if (token) {
    const value = `Bearer ${token}`
    config.headers.Authorization = value
    config.headers['X-Authorization'] = value
  }
  config.headers['DOLAPIENTITY'] = '1'
  return config
}

api.interceptors.request.use(injectAuth)
handsonApi.interceptors.request.use(injectAuth)

const responseErrorHandler = (error) => {
  if (error.response?.status === 401) {
    // Token invalid/expired – Keycloak will handle on next request
  }
  return Promise.reject(error)
}
api.interceptors.response.use((response) => response, responseErrorHandler)
handsonApi.interceptors.response.use((response) => response, responseErrorHandler)

/**
 * Validate a voucher code. Uses GET handson/voucher/{code} or GET handson/voucher/{program}/{code}.
 * Voucher is valid when the API returns message "VoucherValid" (i.e. type !== 'error').
 * - type '1': forces invoice address; response includes data.id (societe id) and data.name; use data.id as invoice_adr when submitting.
 * - type '2': no form change; effect is handled later in DRAHT.
 *
 * @param {string} code - Voucher code (e.g. user-entered ref)
 * @param {number} [program] - Optional program id (team: 1=explore, 2=challenge; class: 4 or 5). If omitted, validates without program.
 * @returns {Promise<{ valid: boolean, voucherType: '1'|'2'|null, invoiceAddressId: number|null, invoiceAddressName: string|null, data: object, message: string }>}
 */
export async function validateVoucher(code, program = null) {
  const encoded = encodeURIComponent(code)
  const hasProgram = program !== null && program !== undefined && program !== ''
  const url = hasProgram
    ? `/voucher/${encodeURIComponent(program)}/${encoded}`
    : `/voucher/${encoded}`
  const res = await handsonApi.get(url)
  const body = res.data
  // Valid when API does not return type 'error' (success responses have type '1' or '2' and message e.g. VoucherValid)
  const valid = body && body.type !== 'error'
  const voucherType = valid && (body.type === '1' || body.type === '2') ? String(body.type) : null
  const invoiceAddressId = voucherType === '1' && body.data && body.data.id != null ? Number(body.data.id) : null
  const invoiceAddressName = voucherType === '1' && body.data && body.data.name ? String(body.data.name) : null
  return {
    valid,
    voucherType,
    invoiceAddressId,
    invoiceAddressName,
    data: body,
    message: body?.message ?? '',
  }
}

/**
 * List address book entries for the current user (for delivery/invoice).
 */
export function getAddresses() {
  return api.get('/addresses')
}

/**
 * Enroll a team. Payload: name, location, organization, voucher, deliveryAddress, invoiceAddress.
 */
export function enrollTeam(payload) {
  return api.post('/teams', payload)
}

/**
 * Enroll a class. Payload: name, location, organization, voucher, deliveryAddress, invoiceAddress.
 */
export function enrollClass(payload) {
  return api.post('/classes', payload)
}

/**
 * Enroll a future edition group (5+ or 8+). Payload: group ('5'|'8'), pupils (8|16|24), name, school, location, addresses, etc.
 * Backend endpoint to be implemented; may return 501 until then.
 */
export function enrollFuture(payload) {
  return api.post('/future', payload)
}

/**
 * List enrolled teams for the current coach (GET /handson/node/teams).
 */
export function listTeams() {
  return api.get('/teams')
}

/**
 * List enrolled classes for the current coach (GET /handson/node/classes).
 */
export function listClasses() {
  return api.get('/classes')
}

/**
 * Get a single team by id (for detail view).
 */
export function getTeam(id) {
  return api.get('/teams/' + encodeURIComponent(id))
}

/**
 * Update team players. Payload: { players: [ { firstname, name, gender, birthday } ] }. birthday: Y-m-d or null.
 * Returns updated team card.
 */
export function updateTeamPlayers(teamId, payload) {
  return api.put('/teams/' + encodeURIComponent(teamId) + '/players', payload)
}

/**
 * Update team versandaufschub. Payload: { versandaufschub: "Y-m-d" | null }. Returns updated team card.
 */
export function updateTeamVersandaufschub(teamId, payload) {
  return api.put('/teams/' + encodeURIComponent(teamId) + '/versandaufschub', payload)
}

/**
 * Get a single class by id (for detail view).
 */
export function getClass(id) {
  return api.get('/classes/' + encodeURIComponent(id))
}

/**
 * Fetch team document (order or invoice) as blob and return an object URL for the iframe.
 * Call URL.revokeObjectURL() when done to free memory.
 */
export async function getTeamDocumentBlobUrl(teamId, docType, ref) {
  const res = await api.get(
    `/teams/${encodeURIComponent(teamId)}/documents/${encodeURIComponent(docType)}/${encodeURIComponent(ref)}`,
    { responseType: 'blob' }
  )
  return URL.createObjectURL(res.data)
}

/**
 * Fetch class document (order or invoice) as blob and return an object URL for the iframe.
 */
export async function getClassDocumentBlobUrl(classId, docType, ref) {
  const res = await api.get(
    `/classes/${encodeURIComponent(classId)}/documents/${encodeURIComponent(docType)}/${encodeURIComponent(ref)}`,
    { responseType: 'blob' }
  )
  return URL.createObjectURL(res.data)
}

export default api
