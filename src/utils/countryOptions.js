/**
 * Shared country-list builder used by EnrollWizard and AddressSelector.
 *
 * Strategy:
 *  1. Use Intl.supportedValuesOf('region') when available (~250 ISO-3166-1 alpha-2 codes).
 *  2. Fall back to a broad hardcoded list covering all continents/regions.
 *  3. Always pin DE / AT / CH at the top of the list.
 *  4. Sort the rest alphabetically by the localized display name for the given locale.
 */

/** Broad fallback covering all continents – used when Intl.supportedValuesOf is unavailable. */
const FALLBACK_CODES = [
  // DACH (top group)
  'DE', 'AT', 'CH',
  // Rest of Europe
  'AL', 'AD', 'AM', 'AZ', 'BY', 'BE', 'BA', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE',
  'FI', 'FR', 'GE', 'GR', 'HU', 'IS', 'IE', 'IT', 'XK', 'LV', 'LI', 'LT', 'LU',
  'MT', 'MD', 'MC', 'ME', 'NL', 'MK', 'NO', 'PL', 'PT', 'RO', 'RU', 'SM', 'RS',
  'SK', 'SI', 'ES', 'SE', 'TR', 'UA', 'GB', 'VA',
  // Americas
  'AG', 'AR', 'BS', 'BB', 'BZ', 'BO', 'BR', 'CA', 'CL', 'CO', 'CR', 'CU', 'DM',
  'DO', 'EC', 'SV', 'GD', 'GT', 'GY', 'HT', 'HN', 'JM', 'MX', 'NI', 'PA', 'PY',
  'PE', 'KN', 'LC', 'VC', 'TT', 'US', 'UY', 'VE',
  // Africa
  'DZ', 'AO', 'BJ', 'BW', 'BF', 'BI', 'CM', 'CV', 'CF', 'TD', 'KM', 'CG', 'CD',
  'CI', 'DJ', 'EG', 'GQ', 'ER', 'SZ', 'ET', 'GA', 'GM', 'GH', 'GN', 'GW', 'KE',
  'LS', 'LR', 'LY', 'MG', 'MW', 'ML', 'MR', 'MU', 'MA', 'MZ', 'NA', 'NE', 'NG',
  'RW', 'ST', 'SN', 'SC', 'SL', 'SO', 'ZA', 'SS', 'SD', 'TZ', 'TG', 'TN', 'UG',
  'ZM', 'ZW',
  // Asia
  'AF', 'BH', 'BD', 'BT', 'BN', 'KH', 'CN', 'TL', 'IN', 'ID', 'IR', 'IQ', 'IL',
  'JP', 'JO', 'KZ', 'KW', 'KG', 'LA', 'LB', 'MY', 'MV', 'MN', 'MM', 'NP', 'KP',
  'OM', 'PK', 'PS', 'PH', 'QA', 'SA', 'SG', 'KR', 'LK', 'SY', 'TW', 'TJ', 'TH',
  'TM', 'AE', 'UZ', 'VN', 'YE',
  // Oceania
  'AU', 'FJ', 'KI', 'MH', 'FM', 'NR', 'NZ', 'PW', 'PG', 'WS', 'SB', 'TO', 'TV',
  'VU',
]

const TOP_CODES = ['DE', 'AT', 'CH']

/**
 * Build grouped country options.
 *
 * @param {string|string[]} locale  BCP-47 locale (e.g. 'de' or ['de','en'])
 * @returns {{ top: Array<{value:string,label:string}>, rest: Array<{value:string,label:string}> }}
 */
export function buildCountryOptions(locale) {
  const locales = Array.isArray(locale) ? locale : [locale || 'de']

  const displayNames =
    typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function'
      ? new Intl.DisplayNames(locales, { type: 'region' })
      : null

  let codes = [...FALLBACK_CODES]
  if (typeof Intl !== 'undefined' && typeof Intl.supportedValuesOf === 'function') {
    try {
      const supported = Intl.supportedValuesOf('region')
      if (Array.isArray(supported) && supported.length) {
        codes = supported
      }
    } catch (_) {
      // use FALLBACK_CODES
    }
  }

  const toLabel = (code) => (displayNames ? (displayNames.of(code) ?? code) : code)

  const unique = Array.from(new Set(codes)).filter((c) => /^[A-Z]{2}$/.test(c))
  const rest = unique
    .filter((c) => !TOP_CODES.includes(c))
    .sort((a, b) => toLabel(a).localeCompare(toLabel(b), locales))

  return {
    top: TOP_CODES.map((code) => ({ value: code.toLowerCase(), label: toLabel(code) })),
    rest: rest.map((code) => ({ value: code.toLowerCase(), label: toLabel(code) })),
  }
}
