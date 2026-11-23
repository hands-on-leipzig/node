import axios from 'axios'

/**
 * Resolve handson API base (same prefix as draht.js handsonApi).
 * VITE_DRAHT_API_URL is typically …/custom/handson/api_proxy.php
 */
export function handsonApiBaseUrl() {
  const raw = (import.meta.env.VITE_DRAHT_API_URL || '').replace(/\/$/, '')
  if (!raw) return ''
  return raw
}

/**
 * Public venues: GET {VITE_DRAHT_API_URL}/handson/node/public/venues
 * Handled in api_proxy without login; standalone node_public_venues.php remains a fallback.
 */
function venuesApiUrl() {
  const explicit = import.meta.env.VITE_VENUES_API_URL?.trim()
  if (explicit) return explicit
  const base = handsonApiBaseUrl()
  if (base) return `${base}/handson/node/public/venues`
  return '/custom/handson/api_proxy.php/handson/node/public/venues'
}

const client = axios.create({
  headers: { Accept: 'application/json' },
})

/**
 * @param {{ debug?: boolean, types?: Array<'regio'|'quali'|'final'> }} [options] Without
 *   `types` DRAHT sends regional events only.
 * @returns {Promise<{ data: object[], meta?: { count?: number, generatedAt?: string } }>}
 */
export async function fetchPublicVenues(options = {}) {
  const params = {}
  if (options.debug) params.debug = '1'
  if (options.types?.length) params.types = options.types.join(',')
  const res = await client.get(venuesApiUrl(), { params })
  const body = res.data ?? {}
  const list = Array.isArray(body.data) ? body.data : []
  return { data: list, meta: body.meta ?? {} }
}
