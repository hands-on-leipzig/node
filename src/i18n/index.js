import { createI18n } from 'vue-i18n'
import { ref, watch } from 'vue'
import de from '@/locales/de'
import en from '@/locales/en'

const LOCALE_KEY = 'node-locale'
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

export function setLocale(newLocale) {
  if (newLocale !== 'de' && newLocale !== 'en') return
  i18n.global.locale.value = newLocale
  try {
    localStorage.setItem(LOCALE_KEY, newLocale)
  } catch (_) {}
}

export function getLocale() {
  return i18n.global.locale.value
}
