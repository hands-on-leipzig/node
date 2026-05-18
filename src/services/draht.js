import axios from 'axios'
import { getToken, updateToken } from '@/auth/keycloak'

// Base URL for the HandsOn API (env: VITE_DRAHT_API_URL). Proxies to Dolibarr when needed.
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
 * - type '2' / '3': no invoice override; optional `preset` from voucher program (edition, program, group, …) for enrollment wizard.
 *
 * @param {string} code - Voucher code (e.g. user-entered ref)
 * @param {number} [program] - Optional program id (team: 1/2, class: 4/5, future groups: 6/7). If omitted, validates without program.
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
 * Current coach identity from the API (Dolibarr contact id as set by Bearer middleware).
 * Prefer this over parsing the JWT in the browser — the claim name may differ or be omitted from tokenParsed.
 * @returns {Promise<{ data: { coachContactId: number } }>}
 */
export function getNodeCoachMe() {
  return api.get('/me')
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== null && value !== undefined && value !== '') return value
  }
  return null
}

/** Dolibarr rowid: positive integer string only (not "address-1" or composite keys). */
export function isDolibarrRowId(value) {
  if (value == null || value === '') return false
  const s = String(value).trim()
  if (!/^\d+$/.test(s)) return false
  const n = Number(s)
  return Number.isFinite(n) && n > 0
}

function normalizeAddressItem(raw) {
  if (!raw || typeof raw !== 'object') return null
  const idRaw = firstDefined(raw.id, raw.addressId, raw.rowid, raw.fk_address, raw.fk_socpeople)
  if (!isDolibarrRowId(idRaw)) {
    return null
  }
  const street = firstDefined(raw.street, raw.address, raw.address1, raw.line1, raw.addr1, raw.adresse) || ''
  const postalCode = firstDefined(raw.postalCode, raw.zip, raw.zipcode, raw.cp) || ''
  const city = firstDefined(raw.city, raw.town) || ''
  const country = firstDefined(raw.country, raw.countryCode, raw.country_code, raw.countrycode) || ''
  const label = firstDefined(raw.label, raw.name, raw.title) || ''
  return {
    id: String(Number(String(idRaw).trim())),
    label: String(label || '').trim(),
    street: String(street || '').trim(),
    postalCode: String(postalCode || '').trim(),
    city: String(city || '').trim(),
    country: String(country || '').trim().toLowerCase(),
  }
}

export function extractAddressesFromResponse(payload) {
  const candidates = [
    payload?.data?.data,
    payload?.data?.addresses,
    payload?.data,
    payload?.addresses,
    payload,
  ]
  const list = candidates.find((entry) => Array.isArray(entry)) || []
  return list
    .map((item) => normalizeAddressItem(item))
    .filter(Boolean)
}

export async function listAddressBook() {
  const res = await getAddresses()
  return extractAddressesFromResponse(res)
}

/**
 * Saved addresses split by kind (delivery = contact, invoice = third party).
 * Uses GET /addresses response keys `delivery` and `invoice` when present; otherwise falls back to the flat merged list (legacy API).
 * @returns {Promise<{ delivery: object[], invoice: object[], combined: object[], legacyFlat: boolean }>}
 */
export async function listAddressBookGrouped() {
  const res = await getAddresses()
  const body = res?.data ?? {}

  const mapList = (arr) =>
    (Array.isArray(arr) ? arr : [])
      .map((item) => normalizeAddressItem(item))
      .filter(Boolean)

  const hasSplit =
    Object.prototype.hasOwnProperty.call(body, 'delivery') &&
    Object.prototype.hasOwnProperty.call(body, 'invoice') &&
    Array.isArray(body.delivery) &&
    Array.isArray(body.invoice)

  if (hasSplit) {
    return {
      delivery: mapList(body.delivery),
      invoice: mapList(body.invoice),
      legacyFlat: false,
      combined: [],
    }
  }

  const flat = extractAddressesFromResponse(res)
  return { delivery: [], invoice: [], legacyFlat: true, combined: flat }
}

export function createAddress(payload) {
  return api.post('/addresses', payload)
}

export function updateAddress(addressId, payload) {
  return api.put('/addresses/' + encodeURIComponent(addressId), payload)
}

export function deleteAddress(addressId) {
  return api.delete('/addresses/' + encodeURIComponent(addressId))
}

/**
 * List events via flow API (for event registration, team nachmelden).
 * GET /handson/flow/events – returns list of events with capacity/usage (Auslastung) when provided.
 * Response may be: array, or { data: [] }, or { events: [] }. Each event may have id, label/name/title/ref, capacity, registered, etc.
 */
export function getEvents() {
  return handsonApi.get('/flow/events')
}

/**
 * Get a single event details from flow API (e.g. capacity, slots).
 * GET /handson/flow/events/:id – optional second endpoint for event details/usage.
 */
export function getFlowEvent(eventId) {
  return handsonApi.get('/flow/events/' + encodeURIComponent(eventId))
}

/**
 * List events nearest to a location (sorted by distance to zip).
 * GET /handson/events/nearest?country=de&zip=10115&program=1
 * @param {string} [country] - Country code (e.g. 'de')
 * @param {string} [zip] - Postal code
 * @param {string|number} [program] - Program id (optional)
 */
export function getEventsNearest(country, zip, program) {
  const params = new URLSearchParams()
  if (country != null && String(country).trim()) params.set('country', String(country).trim())
  if (zip != null && String(zip).trim()) params.set('zip', String(zip).trim())
  if (program != null && program !== '') params.set('program', String(program))
  const qs = params.toString()
  return handsonApi.get('/events/nearest' + (qs ? '?' + qs : ''))
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
 * Future edition enrollment. Payload includes:
 * group, pupils (8|16|24), seasonSetCount (0–2), registerEventTeams, eventTeamCount, eventTeams[{index, players[]}],
 * pricing.lines[{ productRef, quantity, unitPriceEurPlaceholder }], name, addresses, voucher, …
 * Backend creates a future group (program 6 for 5-8, program 7 for 8-16).
 */
export function enrollFuture(payload) {
  return api.post('/groups', payload)
}

/**
 * Extract raw list rows from axios response (same rules as pre–improvements-15 sidebar code, plus deep unwrap).
 * @param {import('axios').AxiosResponse|undefined} res
 * @returns {Array<Record<string, unknown>>}
 */
export function extractNodeListArray(res) {
  if (res?.data == null) return []
  let d = res.data
  if (Array.isArray(d)) return d
  if (d && typeof d === 'object' && Array.isArray(d.data)) return d.data
  let node = d
  for (let depth = 0; depth < 8; depth++) {
    if (Array.isArray(node)) return node
    if (node && typeof node === 'object' && Object.prototype.hasOwnProperty.call(node, 'data')) {
      node = node.data
      continue
    }
    break
  }
  return []
}

/**
 * One list row from GET /teams|/classes|/groups (id + display fields).
 * @param {unknown} row
 * @returns {{ id: number, name: string, organization: string|null, ref: string|null }|null}
 */
export function normalizeNodeListRow(row) {
  if (!row || typeof row !== 'object') return null
  const idRaw = row.id ?? row.rowid ?? row.ID
  const id = idRaw != null && idRaw !== '' ? Number(idRaw) : NaN
  if (!Number.isFinite(id) || id <= 0) return null
  const name = String(row.name ?? row.label ?? row.ref ?? '').trim()
  return {
    id,
    name: name || `#${id}`,
    organization: row.organization ?? row.org ?? null,
    ref: row.ref != null ? String(row.ref) : null,
  }
}

/**
 * Normalize GET /teams|/classes|/groups list responses from axios.
 * @param {import('axios').AxiosResponse|undefined} res
 * @returns {Array<{ id: number, name: string, organization: string|null, ref: string|null }>}
 */
export function parseNodeListPayload(res) {
  const rows = extractNodeListArray(res)
  const out = []
  for (const row of rows) {
    const normalized = normalizeNodeListRow(row)
    if (normalized) {
      out.push(normalized)
      continue
    }
    if (row && typeof row === 'object') {
      const idRaw = row.id ?? row.rowid ?? row.ID
      const id = idRaw != null && idRaw !== '' ? Number(idRaw) : NaN
      if (Number.isFinite(id) && id > 0) {
        out.push({
          ...row,
          id,
          name: String(row.name ?? row.label ?? row.ref ?? `#${id}`).trim() || `#${id}`,
        })
      }
    }
  }
  if (import.meta.env.DEV && rows.length > 0 && out.length === 0) {
    console.warn('[parseNodeListPayload] rows present but none parsed', rows[0], res?.data)
  }
  if (import.meta.env.DEV && rows.length === 0 && res?.data != null) {
    console.warn('[parseNodeListPayload] empty list, response shape', res.data)
  }
  return out
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
 * List enrolled future groups for the current coach (GET /handson/node/groups).
 */
export function listGroups() {
  return api.get('/groups')
}

/**
 * List open tasks for the current coach (GET /handson/node/tasks).
 * Returns teams/classes that need action (e.g. pay invoice). Single call, no N+1.
 * Response: { data: [ { type: 'team'|'class', id, name, ref, action: 'pay_invoice'|'action_required' } ] }
 */
export function getOpenTasks() {
  return api.get('/tasks')
}

/**
 * Coach dashboard: documents config only (GET /handson/node/documents-config).
 */
export function getDocumentsConfig() {
  return api.get('/documents-config')
}

/**
 * Participation terms PDF via server proxy (SharePoint-safe). Returns blob URL for iframe.
 * @param {'de'|'en'|string} lang
 * @returns {Promise<string|null>}
 */
export async function getParticipationTermsPdfBlobUrl(lang = 'de') {
  const key = String(lang || 'de').toLowerCase().startsWith('en') ? 'en' : 'de'
  try {
    const res = await api.get(`/participation-terms-pdf/${key}`, { responseType: 'blob' })
    const blob = res?.data
    if (blob && blob.size > 100) {
      return URL.createObjectURL(blob)
    }
  } catch {
    /* not configured or fetch failed */
  }
  return null
}

/**
 * SharePoint folder file list via Microsoft Graph (GET /handson/node/documents-folder-files).
 */
export function getDocumentsFolderFiles() {
  return api.get('/documents-folder-files')
}

/**
 * Update documents folder URL (admin only on server). PUT /handson/node/documents-config
 */
export function putDocumentsConfig(payload) {
  return api.put('/documents-config', payload)
}

/** Admin: MS Graph token + GET /sites/root diagnostic */
export function getDocumentsGraphStatus() {
  return api.get('/documents-graph-status')
}

/** Admin: probe folder URL (Graph) without saving */
export function postDocumentsProbeFolder(url) {
  return api.post('/documents-probe-folder', { url: url || '' })
}

/** Admin: dashboard M365 calendar config (GET/PUT) */
export function getDashboardCalendarConfig() {
  return api.get('/dashboard-calendar-config')
}

export function putDashboardCalendarConfig(payload) {
  return api.put('/dashboard-calendar-config', payload)
}

/** Admin: quick Graph calendar test */
export function getDashboardCalendarTest() {
  return api.get('/dashboard-calendar-test')
}

/** Coach dashboard: upcoming events from M365 when configured */
export function getDashboardCalendarEvents() {
  return api.get('/dashboard-calendar-events')
}

/** Coach app: registration window from DRAHT season register_start. */
export function getRegistrationWindow() {
  return api.get('/registration-window')
}

/**
 * Admin: create GitHub PR with updated locale file(s) (POST /handson/node/translations-pr).
 * Configure on server: Dolibarr constants HANDSON_GITHUB_TOKEN, HANDSON_GITHUB_REPO;
 * optional HANDSON_GITHUB_LOCALE_PATH_PREFIX (default src/locales).
 *
 * **Combined (preferred):** `{ locales: { en: nested, de: nested }, prTitle?, editorUsername?, baseBranch? }` — one PR for both files.
 *
 * **Legacy:** `{ locale: 'en'|'de', messages: nested, ... }` — single-file shape when the API expects it.
 *
 * @param {{
 *   locales?: Record<'en'|'de', Record<string, unknown>>,
 *   locale?: 'en'|'de',
 *   messages?: Record<string, unknown>,
 *   prTitle?: string,
 *   editorUsername?: string,
 *   baseBranch?: string,
 * }} payload
 */
export function postTranslationsPr(payload) {
  return api.post('/translations-pr', payload, { timeout: 120000 })
}

/**
 * Get a single team by id (for detail view).
 */
export function getTeam(id) {
  return api.get('/teams/' + encodeURIComponent(id))
}

/**
 * Update team roster (participants). Payload: { players: [ { firstname, name, gender, birthday } ] }. birthday: Y-m-d or null.
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
 * Register team for an event (nachmelden). Payload: { eventId }. Returns updated team card.
 */
export function registerTeamForEvent(teamId, eventId) {
  return api.put('/teams/' + encodeURIComponent(teamId) + '/event', { eventId })
}

/**
 * Get a single class by id (for detail view).
 */
export function getClass(id) {
  return api.get('/classes/' + encodeURIComponent(id))
}

/**
 * Get a single future group by id (for detail view).
 */
export function getGroup(id) {
  return api.get('/groups/' + encodeURIComponent(id))
}

/**
 * Check whether an email belongs to a coach account (primary coach only).
 * Payload: { targetType, targetId, email }
 */
export function checkCoCoachEmail(payload) {
  return api.post('/co-coach-email-check', payload)
}

/**
 * Invite a co-coach by e-mail (primary coach only). Backend sends confirmation link.
 * Payload: { targetType, targetId, email, inviteUnregistered?: boolean }
 */
export function inviteCoCoach(payload) {
  return api.post('/co-coach-invite', payload)
}

/**
 * Register future group for an event (or update/clear).
 * Payload: { eventId, eventTeamCount } where eventTeamCount is number of 8-pupil teams.
 * Optional `registeredPupils` bumps group capacity when more teams require a higher tier (8/16/24/32).
 */
/**
 * Update group versandaufschub. Payload: { versandaufschub: "Y-m-d" | null }. Returns updated group card.
 */
export function updateGroupVersandaufschub(groupId, payload) {
  return api.put('/groups/' + encodeURIComponent(groupId) + '/versandaufschub', payload)
}

/**
 * Update class versandaufschub. Payload: { versandaufschub: "Y-m-d" | null }. Returns updated class card.
 */
export function updateClassVersandaufschub(classId, payload) {
  return api.put('/classes/' + encodeURIComponent(classId) + '/versandaufschub', payload)
}

export function registerGroupForEvent(groupId, eventId, eventTeamCount, options = {}) {
  const body = { eventId, eventTeamCount }
  if (options.registeredPupils != null && Number.isFinite(Number(options.registeredPupils))) {
    body.registeredPupils = Number(options.registeredPupils)
  }
  return api.put('/groups/' + encodeURIComponent(groupId) + '/event', body)
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

/**
 * Fetch future group document (order or invoice) as blob and return an object URL for the iframe.
 */
export async function getGroupDocumentBlobUrl(groupId, docType, ref) {
  const res = await api.get(
    `/groups/${encodeURIComponent(groupId)}/documents/${encodeURIComponent(docType)}/${encodeURIComponent(ref)}`,
    { responseType: 'blob' }
  )
  return URL.createObjectURL(res.data)
}

export default api
