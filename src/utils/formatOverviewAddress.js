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

function isIsoCountryCode(value) {
  return /^[a-z]{2}$/i.test(String(value || '').trim())
}

function countryCodeToLabel(code, localeTag = 'en') {
  const normalized = String(code || '').trim().toLowerCase()
  if (!isIsoCountryCode(normalized)) return ''

  if (typeof Intl === 'undefined' || typeof Intl.DisplayNames !== 'function') {
    return normalized.toUpperCase()
  }

  const locales = [localeTag, 'de', 'en'].filter(Boolean)
  const seen = new Set()
  for (const loc of locales) {
    if (seen.has(loc)) continue
    seen.add(loc)
    try {
      const dn = new Intl.DisplayNames([loc], { type: 'region' })
      const name = dn.of(normalized.toUpperCase())
      if (name) return name
    } catch (_) {
      /* invalid locale — skip */
    }
  }
  return normalized.toUpperCase()
}

function resolveCountryLabel(addr, localeTag = 'en') {
  let countryLabel = String(addr.country ?? addr.country_label ?? '').trim()
  if (isBadCountryLabel(countryLabel)) countryLabel = ''

  const code =
    pickCountryCode(addr)
    || (isIsoCountryCode(countryLabel) ? countryLabel.toLowerCase() : '')

  if (countryLabel && isIsoCountryCode(countryLabel)) {
    return countryCodeToLabel(countryLabel, localeTag) || countryLabel
  }

  if (!countryLabel && code) {
    return countryCodeToLabel(code, localeTag)
  }

  return countryLabel
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

  const countryLabel = resolveCountryLabel(addr, localeTag)

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

/**
 * Two-line labels for address book dropdowns: name/institution on the first line, street + locality on the second.
 *
 * @param {Record<string, unknown> | null | undefined} addr
 * @param {string} [localeTag]
 * @returns {{ primary: string, secondary: string }}
 */
export function formatAddressBookLines(addr, localeTag = 'en') {
  if (!addr || typeof addr !== 'object') return { primary: '', secondary: '' }

  const primary = String(addr.label || addr.institution || addr.name || '').trim()
  const countryLabel = resolveCountryLabel(addr, localeTag)
  const zip = pickZip(addr)
  const town = pickTown(addr)
  const streetLine = [addr.street, addr.number].filter(Boolean).join(' ').trim()
    || String(addr.address || addr.address1 || '').trim()
  const line2 = String(addr.line2 || addr.addressLine2 || '').trim()
  const line3 = String(addr.line3 || addr.addressLine3 || '').trim()

  const secondary = [
    streetLine,
    line2,
    line3,
    [zip, town].filter(Boolean).join(' '),
    countryLabel,
  ]
    .map((p) => (typeof p === 'string' ? p.trim() : p))
    .filter(Boolean)
    .join(', ')

  if (!primary) {
    return { primary: secondary, secondary: '' }
  }
  return { primary, secondary }
}
