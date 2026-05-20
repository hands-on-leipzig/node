import { createI18n } from 'vue-i18n'
import { ref, watch } from 'vue'
import de from '@/locales/de'
import en from '@/locales/en'

const LOCALE_KEY = 'node-locale'
const LOCALE_MANUAL_KEY = 'node-locale-manual'
const SHOW_KEYS_KEY = 'node-show-translation-keys'
const EDIT_MODE_KEY = 'node-translation-edit-mode'

function getDefaultLocale() {
  try {
    const saved = localStorage.getItem(LOCALE_KEY)
    if (saved === 'en' || saved === 'de') return saved
  } catch (_) {}
  return 'de'
}

function getDefaultShowKeys() {
  try {
    return localStorage.getItem(SHOW_KEYS_KEY) === '1'
  } catch (_) {}
  return false
}

function getDefaultTranslationEditMode() {
  try {
    return localStorage.getItem(EDIT_MODE_KEY) === '1'
  } catch (_) {}
  return false
}

export const defaultLocale = 'de'

export const i18n = createI18n({
  legacy: false,
  locale: getDefaultLocale(),
  fallbackLocale: 'en',
  messages: { de, en },
})

/** When true, hovering/focusing wrapped strings shows the i18n key (see I18nText). UI still shows real translations. */
export const showTranslationKeys = ref(getDefaultShowKeys())

watch(showTranslationKeys, (v) => {
  try {
    localStorage.setItem(SHOW_KEYS_KEY, v ? '1' : '0')
  } catch (_) {}
})

/** When true (admins), I18nText shows a pen to open the translations editor for that key. */
export const translationEditMode = ref(getDefaultTranslationEditMode())

watch(translationEditMode, (v) => {
  try {
    localStorage.setItem(EDIT_MODE_KEY, v ? '1' : '0')
  } catch (_) {}
})

export function setShowTranslationKeys(value) {
  showTranslationKeys.value = !!value
}

export function setTranslationEditMode(value) {
  translationEditMode.value = !!value
}

/**
 * Dolibarr contact default_lang (e.g. de_DE, en_GB) → JOIN locale (de | en).
 * Non-German codes map to English; empty/unknown returns null (no auto switch).
 *
 * @param {string} [defaultLang]
 * @returns {'de'|'en'|null}
 */
export function dolibarrDefaultLangToJoinLocale(defaultLang) {
  const s = String(defaultLang || '').trim().toLowerCase()
  if (!s) return null
  if (s === 'de' || s.startsWith('de_') || s.startsWith('de-')) return 'de'
  return 'en'
}

export function setLocale(newLocale, options = {}) {
  if (newLocale !== 'de' && newLocale !== 'en') return
  i18n.global.locale.value = newLocale
  try {
    localStorage.setItem(LOCALE_KEY, newLocale)
    if (options.userChoice) {
      localStorage.setItem(LOCALE_MANUAL_KEY, '1')
    }
  } catch (_) {}
}

/** User picked DE/EN in the UI — do not override on next login from Draht default_lang. */
export function setLocaleUserChoice(newLocale) {
  setLocale(newLocale, { userChoice: true })
}

export function getLocale() {
  return i18n.global.locale.value
}

function isLocaleManuallyChosen() {
  try {
    return localStorage.getItem(LOCALE_MANUAL_KEY) === '1'
  } catch (_) {
    return false
  }
}

/**
 * After coach login: EN when contact default_lang is not German; DE when it is.
 * Skipped if the user already chose a language in JOIN (profile menu / home).
 *
 * @param {() => Promise<unknown>} fetchMe e.g. getNodeCoachMe
 */
export async function applyCoachLocaleFromProfile(fetchMe) {
  if (isLocaleManuallyChosen()) return
  try {
    const res = await fetchMe()
    const body = res?.data?.data ?? res?.data ?? {}
    const mapped = dolibarrDefaultLangToJoinLocale(body.defaultLang)
    if (mapped) setLocale(mapped)
  } catch (_) {
    /* not logged in or /me unavailable */
  }
}
