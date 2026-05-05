import { i18n } from './index.js'
import de from '@/locales/de.js'
import en from '@/locales/en.js'
import { deepCloneLocale, flattenLocaleStrings, unflattenLocaleStrings } from '@/utils/localeFlatten.js'

/**
 * Rebuild locale messages from bundled sources plus flat draft overrides (dot paths).
 * @param {{ en: Record<string, string>, de: Record<string, string> }} drafts
 */
export function applyDraftsToI18nFromData(drafts) {
  const flatEn = {
    ...flattenLocaleStrings(deepCloneLocale(en)),
    ...(drafts.en && typeof drafts.en === 'object' ? drafts.en : {}),
  }
  const flatDe = {
    ...flattenLocaleStrings(deepCloneLocale(de)),
    ...(drafts.de && typeof drafts.de === 'object' ? drafts.de : {}),
  }
  i18n.global.setLocaleMessage('en', unflattenLocaleStrings(flatEn))
  i18n.global.setLocaleMessage('de', unflattenLocaleStrings(flatDe))
}
