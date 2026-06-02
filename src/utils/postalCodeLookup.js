/**
 * Zippopotam lookup: all localities (Orte) for a postal code.
 */

export function normalizeCountryForZipLookup(rawCountry, rawZip) {
  const country = String(rawCountry || '').trim().toLowerCase()
  const zip = String(rawZip || '').trim()
  if (country) return country
  if (/^\d{4,5}$/.test(zip)) return 'de'
  return ''
}

/**
 * @param {Array<{ postalCode: string, city: string, state: string, country: string }>} places
 */
export function dedupePostalPlaces(places) {
  const seen = new Set()
  return places.filter((s) => {
    const key = `${s.postalCode}|${s.city}|${s.state}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * @param {string} country ISO country code (de, at, ch, …)
 * @param {string} zip Postal code
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<Array<{ postalCode: string, city: string, state: string, country: string }>>}
 */
export async function fetchPlacesForPostalCode(country, zip, options = {}) {
  const resolvedCountry = normalizeCountryForZipLookup(country, zip)
  const normalizedZip = String(zip || '').trim()
  if (!resolvedCountry || !normalizedZip) return []

  const res = await fetch(
    `https://api.zippopotam.us/${encodeURIComponent(resolvedCountry)}/${encodeURIComponent(normalizedZip)}`,
    { signal: options.signal },
  )
  if (!res.ok) return []

  const data = await res.json()
  const places = Array.isArray(data?.places) ? data.places : []
  const normalized = places.map((p) => ({
    postalCode: data['post code'] || normalizedZip,
    city: p['place name'] || '',
    state: p.state || '',
    country: resolvedCountry,
  }))
  return dedupePostalPlaces(normalized)
}
