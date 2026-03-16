import { createI18n } from 'vue-i18n'
import { ref, watch } from 'vue'
import de from '@/locales/de'
import en from '@/locales/en'

const LOCALE_KEY = 'node-locale'
const SHOW_KEYS_KEY = 'node-show-translation-keys'

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

export const defaultLocale = 'de'

export const i18n = createI18n({
  legacy: false,
  locale: getDefaultLocale(),
  fallbackLocale: 'en',
  messages: { de, en },
})

/** When true, t() returns the translation key instead of the translated string. */
export const showTranslationKeys = ref(getDefaultShowKeys())

watch(
  showTranslationKeys,
  (v) => {
    try {
      localStorage.setItem(SHOW_KEYS_KEY, v ? '1' : '0')
    } catch (_) {}
  },
  { immediate: false }
)

const originalT = i18n.global.t.bind(i18n.global)
i18n.global.t = (...args) => {
  if (showTranslationKeys.value) {
    const key = args[0]
    return typeof key === 'string' ? key : (key ?? '')
  }
  return originalT(...args)
}

export function setShowTranslationKeys(value) {
  showTranslationKeys.value = !!value
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
