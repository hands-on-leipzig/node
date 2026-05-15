/** @typedef {'de'|'at'|'ch'} VenueCountry */
/** @typedef {'exhibition'|'competition'|'future'|'other'} VenueOfferCategory */

/**
 * @param {object} venue
 * @param {{ countries: Set<string>, offers: Set<string> }} filters
 */
export function venueMatchesFilters(venue, filters) {
  if (filters.countries.size && !filters.countries.has(venue.country)) return false
  if (filters.offers.size && !filters.offers.has(venue.offerCategory)) return false
  return true
}

/** Future Edition regio venues (not shown on the public map — list/accordion only). */
export function isFutureEditionVenue(venue) {
  return (
    venue.offerCategory === 'future' ||
    venue.program === 'future5' ||
    venue.program === 'future8'
  )
}

/**
 * Cluster venues with coordinates for map markers.
 * @param {object[]} venues
 * @returns {Array<{ lat: number, lon: number, count: number, venues: object[], offerCategory: string }>}
 */
export function clusterVenuesForMap(venues) {
  /** @type {Map<string, { lat: number, lon: number, count: number, venues: object[], offerCategory: string }>} */
  const map = new Map()
  for (const v of venues) {
    if (v.lat == null || v.lon == null || !Number.isFinite(v.lat) || !Number.isFinite(v.lon)) continue
    const key = `${v.lat.toFixed(3)}:${v.lon.toFixed(3)}:${v.offerCategory}`
    const existing = map.get(key)
    if (existing) {
      existing.count += 1
      existing.venues.push(v)
    } else {
      map.set(key, {
        lat: v.lat,
        lon: v.lon,
        count: 1,
        venues: [v],
        offerCategory: v.offerCategory || 'other',
      })
    }
  }
  return [...map.values()]
}

/**
 * @param {object} venue
 * @param {string} locale
 */
export function venueDisplayName(venue, locale) {
  if (locale === 'en' && venue.nameEn?.trim()) return venue.nameEn.trim()
  return venue.name || ''
}

/**
 * @param {object} venue
 * @param {(key: string) => string} t
 */
export function venueCapacityLabel(venue, t) {
  const reg = venue.registered ?? 0
  const cap = venue.capacity
  const isFuture = venue.offerCategory === 'future'
  if (cap != null && cap > 0) {
    return isFuture
      ? t('venues.capacityGroups', { registered: reg, capacity: cap })
      : t('venues.capacityTeams', { registered: reg, capacity: cap })
  }
  if (reg > 0) {
    return isFuture
      ? t('venues.registeredGroups', { count: reg })
      : t('venues.registeredTeams', { count: reg })
  }
  return ''
}

/**
 * @param {string} isoDate YYYY-MM-DD
 * @param {string} locale
 */
export function formatVenueDate(isoDate, locale) {
  if (!isoDate) return ''
  const d = new Date(isoDate + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return isoDate
  return d.toLocaleDateString(locale === 'de' ? 'de-DE' : 'en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export const OFFER_COLORS = {
  exhibition: '#2e7d32',
  competition: '#c62828',
  future: '#1565c0',
  other: '#64748b',
}
