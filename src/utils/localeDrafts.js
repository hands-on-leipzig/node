/** Persist translation overrides until a PR is created (localStorage). */
import { ref } from 'vue'
import { applyDraftsToI18nFromData } from '@/i18n/mergeLocaleDrafts.js'
import {
  notifyTranslationDraftSaved,
  showGithubExportBanner,
} from '@/utils/translationExportReminder'

const STORAGE_KEY = 'node-locale-drafts-v1'

/** Incremented when drafts change so UIs (e.g. export banner) can react. */
export const localeDraftRevision = ref(0)

/**
 * @returns {{ en: Record<string, string>, de: Record<string, string> }}
 */
export function loadAllLocaleDrafts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { en: {}, de: {} }
    const p = JSON.parse(raw)
    return {
      en: typeof p.en === 'object' && p.en && !Array.isArray(p.en) ? p.en : {},
      de: typeof p.de === 'object' && p.de && !Array.isArray(p.de) ? p.de : {},
    }
  } catch {
    return { en: {}, de: {} }
  }
}

function writeAll(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    /* ignore quota */
  }
}

/**
 * @param {'en'|'de'} locale
 * @param {string} path - dot path
 * @param {string} value
 */
export function patchLocaleDraft(locale, path, value) {
  if (locale !== 'en' && locale !== 'de') return
  const all = loadAllLocaleDrafts()
  all[locale] = { ...all[locale], [path]: value }
  writeAll(all)
  applyDraftsToI18nFromData(all)
  localeDraftRevision.value++
  notifyTranslationDraftSaved()
}

/** @param {'en'|'de'} locale */
export function clearLocaleDraft(locale) {
  if (locale !== 'en' && locale !== 'de') return
  const all = loadAllLocaleDrafts()
  all[locale] = {}
  writeAll(all)
  applyDraftsToI18nFromData(all)
  localeDraftRevision.value++
  if (countLocaleDraftKeys('en') + countLocaleDraftKeys('de') === 0) {
    showGithubExportBanner.value = false
  }
}

/** @param {'en'|'de'} locale */
export function countLocaleDraftKeys(locale) {
  return Object.keys(loadAllLocaleDrafts()[locale] || {}).length
}
