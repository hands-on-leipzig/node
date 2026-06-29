/**
 * Capacity fields from an event list row (nearest API, venues, flow).
 * @param {Record<string, unknown>|null|undefined} ev
 */
export function eventCapacityFromEvent(ev) {
  const maxRaw = ev?.capacity ?? ev?.max ?? ev?.max_teams ?? ev?.slots
  const max = maxRaw != null && maxRaw !== '' ? Number(maxRaw) : null
  const registeredRaw = ev?.registered ?? ev?.used ?? ev?.count ?? ev?.teams_count
  const registered = registeredRaw != null && registeredRaw !== '' ? Number(registeredRaw) : null
  let available = ev?.available
  if (available != null && available !== '') available = Number(available)
  else if (typeof max === 'number' && !Number.isNaN(max) && max > 0 && typeof registered === 'number' && !Number.isNaN(registered)) {
    available = Math.max(0, max - registered)
  } else {
    available = null
  }
  const unlimited = max == null || Number.isNaN(max) || max <= 0
  const full = ev?.full === true || (!unlimited && typeof available === 'number' && available <= 0)
  return {
    max: unlimited ? null : max,
    registered: typeof registered === 'number' && !Number.isNaN(registered) ? registered : 0,
    available: unlimited ? null : available,
    unlimited,
    full,
    canRegister(slotsNeeded = 1) {
      const need = Math.max(1, Number(slotsNeeded) || 1)
      if (unlimited) return true
      return typeof available === 'number' && !Number.isNaN(available) && available >= need
    },
  }
}

/** Events that still have at least `slotsNeeded` free team slots. */
export function filterEventsWithCapacity(events, slotsNeeded = 1) {
  const list = Array.isArray(events) ? events : []
  return list.filter((ev) => eventCapacityFromEvent(ev).canRegister(slotsNeeded))
}

/**
 * Normalize flow / events API list payloads.
 * @param {unknown} data
 * @returns {unknown[]}
 */
export function extractEventList(data) {
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object') {
    const o = /** @type {Record<string, unknown>} */ (data)
    if (Array.isArray(o.data)) return o.data
    if (Array.isArray(o.events)) return o.events
    if (Array.isArray(o.items)) return o.items
    if (Array.isArray(o.results)) return o.results
    if (o.data && typeof o.data === 'object') {
      const inner = /** @type {Record<string, unknown>} */ (o.data)
      if (Array.isArray(inner.data)) return inner.data
      if (Array.isArray(inner.events)) return inner.events
    }
  }
  return []
}

/**
 * @param {unknown[]} rawList
 * @returns {Array<Record<string, unknown>>}
 */
export function normalizeEvents(rawList) {
  if (!Array.isArray(rawList)) return []
  return rawList
    .filter((e) => e && typeof e === 'object')
    .map((e) => {
      const row = /** @type {Record<string, unknown>} */ (e)
      const id = row.id ?? row.rowid ?? row.event_id
      return {
        ...row,
        id: id != null ? Number(id) : null,
        label: row.label ?? row.name ?? row.title ?? row.ref ?? '',
      }
    })
    .filter((e) => e.id != null && !Number.isNaN(e.id))
}

/**
 * @param {Record<string, unknown>|null|undefined} ev
 * @param {(key: string, values?: Record<string, unknown>) => string} t
 */
export function formatEventOptionLabel(ev, t) {
  const name = ev?.label || ev?.name || ev?.title || ev?.ref || (ev?.id != null ? `Event ${ev.id}` : '')
  const cap = eventCapacityFromEvent(ev)
  if (!cap.unlimited && cap.max != null) {
    return `${name} (${t('wizard.eventCapacitySlots', { used: cap.registered, max: cap.max })})`
  }
  return String(name)
}

const EVENT_COUNTRY_ORDER = ['de', 'at', 'ch']

/**
 * @param {unknown} country
 * @returns {string}
 */
export function normalizeEventCountry(country) {
  const c = String(country ?? '').trim().toLowerCase()
  if (c === 'deutschland' || c === 'germany' || c === 'd') return 'de'
  if (c === 'österreich' || c === 'oesterreich' || c === 'austria') return 'at'
  if (c === 'schweiz' || c === 'switzerland') return 'ch'
  if (EVENT_COUNTRY_ORDER.includes(c)) return c
  return c || 'other'
}

/**
 * Nearest block (distance order, capped) + remaining events grouped by country, sorted A–Z per country.
 * @param {Array<Record<string, unknown>>} events
 * @param {{ nearestLimit?: number, locale?: string }} [options]
 */
export function organizeEventsForSelect(events, { nearestLimit = 5, locale = 'de' } = {}) {
  const list = Array.isArray(events) ? [...events] : []
  const nearest = list.slice(0, nearestLimit)
  const nearestIds = new Set(nearest.map((e) => String(e.id)))
  const rest = list.filter((e) => !nearestIds.has(String(e.id)))

  const byCountry = new Map()
  for (const ev of rest) {
    const code = normalizeEventCountry(ev.country ?? ev.country_code ?? ev.countryCode)
    if (!byCountry.has(code)) byCountry.set(code, [])
    byCountry.get(code).push(ev)
  }

  const collator = new Intl.Collator(locale, { sensitivity: 'base' })
  const sortByLabel = (a, b) => collator.compare(
    String(a.label ?? a.name ?? ''),
    String(b.label ?? b.name ?? ''),
  )

  const countryCodes = [...byCountry.keys()].sort((a, b) => {
    const ai = EVENT_COUNTRY_ORDER.indexOf(a)
    const bi = EVENT_COUNTRY_ORDER.indexOf(b)
    if (ai !== -1 && bi !== -1) return ai - bi
    if (ai !== -1) return -1
    if (bi !== -1) return 1
    if (a === 'other') return 1
    if (b === 'other') return -1
    return collator.compare(a, b)
  })

  const countryGroups = countryCodes
    .map((country) => ({
      country,
      events: byCountry.get(country).slice().sort(sortByLabel),
    }))
    .filter((g) => g.events.length > 0)

  return { nearest, countryGroups }
}

/** Flat list for keyboard navigation (nearest, then all country groups). */
export function flatEventSelectOptions({ nearest, countryGroups }) {
  return [...nearest, ...countryGroups.flatMap((g) => g.events)]
}
