/**
 * Normalise Dolibarr / API country labels that are error placeholders instead of a name.
 */
function isBadCountryLabel(value) {
  const n = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '')
  if (!n) return true
  return (
    n.includes('countrynotfound')
    || n.includes('landnichtgefunden')
    || n === 'notfound'
    || n === 'unknown'
  )
}

function pickZip(addr) {
  const z = addr.zip ?? addr.postalCode ?? addr.postcode
  return z != null ? String(z).trim() : ''
}

function pickTown(addr) {
  const c = addr.town ?? addr.city
  return c != null ? String(c).trim() : ''
}

function pickCountryCode(addr) {
  const candidates = [
    addr.country_code,
    addr.countryCode,
    addr.code,
  ]
  for (const c of candidates) {
    const s = c != null ? String(c).trim() : ''
    if (/^[a-z]{2}$/i.test(s)) return s.toLowerCase()
  }
  const fromCountry = String(addr.country ?? '').trim()
  if (/^[a-z]{2}$/i.test(fromCountry)) return fromCountry.toLowerCase()
  return ''
}

/**
 * Format address objects from team/class/group `overview` APIs for display.
 * Replaces sentinel strings like "Country not found" with {@link Intl.DisplayNames} when a 2-letter code is present.
 *
 * @param {Record<string, unknown> | null | undefined} addr
 * @param {string} [localeTag] BCP 47 tag, e.g. from vue-i18n `locale`
 */
export function formatOverviewAddress(addr, localeTag = 'en') {
  if (!addr || typeof addr !== 'object') return ''

  let countryLabel = String(addr.country ?? addr.country_label ?? '').trim()
  if (isBadCountryLabel(countryLabel)) countryLabel = ''

  const code = pickCountryCode(addr)
  if (!countryLabel && code && typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function') {
    const locales = [localeTag, 'de', 'en'].filter(Boolean)
    const seen = new Set()
    for (const loc of locales) {
      if (seen.has(loc)) continue
      seen.add(loc)
      try {
        const dn = new Intl.DisplayNames([loc], { type: 'region' })
        const n = dn.of(code.toUpperCase())
        if (n) {
          countryLabel = n
          break
        }
      } catch (_) {
        /* invalid locale — skip */
      }
    }
    if (!countryLabel) countryLabel = code.toUpperCase()
  }

  const zip = pickZip(addr)
  const town = pickTown(addr)

  const streetLine = [addr.street, addr.number].filter(Boolean).join(' ').trim()
    || String(addr.address || addr.address1 || '').trim()

  const parts = [
    addr.name,
    streetLine,
    addr.line2,
    addr.line3,
    [zip, town].filter(Boolean).join(' '),
    countryLabel,
  ]
    .map((p) => (typeof p === 'string' ? p.trim() : p))
    .filter(Boolean)

  return parts.join(', ')
}
