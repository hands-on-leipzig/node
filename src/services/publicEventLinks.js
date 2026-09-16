import axios from 'axios'

/**
 * Public schedule links ("one-links", e.g. https://handson.tools/aachen), read from FLOW.
 *
 * FLOW owns the slug and the URL rules (vanity host, year segment of past seasons), so
 * JOIN asks for the finished link instead of assembling one. Venues come from DRAHT, so
 * the DRAHT event id is the key: Explore and Challenge are two venues there that belong
 * to one event in FLOW and therefore share a link.
 *
 * The endpoint is public and cached, and the links are meant to be shared, so no token
 * is involved.
 */

const DEFAULT_BASE = 'https://flow.hands-on-technology.org/api'

const env = import.meta.env ?? {}

function linksApiUrl() {
  const base = String(env.VITE_FLOW_API_URL || DEFAULT_BASE)
    .trim()
    .replace(/\/+$/, '')

  return `${base}/public/event-links`
}

const client = axios.create({
  headers: { Accept: 'application/json' },
})

/**
 * Turn the payload into a lookup by DRAHT event id.
 *
 * @param {unknown} rows Entries of the `data` array.
 * @returns {Map<number, string>}
 */
export function eventLinkMap(rows) {
  const byDrahtId = new Map()
  if (!Array.isArray(rows)) return byDrahtId

  for (const row of rows) {
    const url = typeof row?.url === 'string' ? row.url.trim() : ''
    if (!url || !Array.isArray(row?.draht_ids)) continue

    for (const id of row.draht_ids) {
      const key = Number(id)
      if (Number.isInteger(key)) byDrahtId.set(key, url)
    }
  }

  return byDrahtId
}

/**
 * @returns {Promise<Map<number, string>>} DRAHT event id → absolute schedule URL.
 */
export async function fetchPublicEventLinks() {
  const res = await client.get(linksApiUrl())

  return eventLinkMap(res.data?.data)
}
