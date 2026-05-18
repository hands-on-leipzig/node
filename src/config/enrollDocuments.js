/**
 * Fallback PDFs from `public/` when SharePoint URLs are not configured (documents-config API).
 */
export const PARTICIPATION_TERMS_PDF_FALLBACK = {
  de:
    (import.meta.env.VITE_PARTICIPATION_TERMS_PDF_DE || '').trim() ||
    '/teilnahmebedingungen-de.pdf',
  en:
    (import.meta.env.VITE_PARTICIPATION_TERMS_PDF_EN || '').trim() ||
    '/teilnahmebedingungen-en.pdf',
}

/**
 * @param {string} locale vue-i18n locale (e.g. de, en)
 * @param {{ de?: string, en?: string }|null|undefined} fromConfig SharePoint URLs from GET documents-config
 * @returns {string}
 */
export function participationTermsPdfForLocale(locale, fromConfig = null) {
  const loc = String(locale || 'de').toLowerCase()
  const key = loc.startsWith('en') ? 'en' : 'de'
  const configured = fromConfig?.[key]
  if (configured && /^https?:\/\//i.test(String(configured).trim())) {
    return String(configured).trim()
  }
  return PARTICIPATION_TERMS_PDF_FALLBACK[key]
}
