import { getToken, updateToken, getUserProfile } from '@/auth/keycloak'
import { postTranslationsPr } from '@/services/draht'

function unwrapApiData(data) {
  if (!data || typeof data !== 'object') return data
  const inner = data.data
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) return inner
  return data
}

/**
 * Create one GitHub PR that updates both `en.js` and `de.js`.
 * @param {{ en: Record<string, unknown>, de: Record<string, unknown> }} locales - Nested message trees per locale
 * @param {string} [prTitle]
 */
export async function submitLocalesPullRequest(locales, prTitle) {
  await updateToken(40)
  if (!getToken()) {
    throw new Error('Not signed in')
  }
  const profile = getUserProfile()
  const res = await postTranslationsPr({
    locales,
    prTitle: prTitle || undefined,
    editorUsername: profile?.username || profile?.name || '',
  })
  return unwrapApiData(res?.data) ?? res?.data
}

/**
 * @deprecated Prefer {@link submitLocalesPullRequest} — one PR for all locales.
 * @param {'en'|'de'} locale
 * @param {Record<string, unknown>} messages
 * @param {string} [prTitle]
 */
export async function submitLocalePullRequest(locale, messages, prTitle) {
  await updateToken(40)
  if (!getToken()) {
    throw new Error('Not signed in')
  }
  const profile = getUserProfile()
  const res = await postTranslationsPr({
    locale,
    messages,
    prTitle: prTitle || undefined,
    editorUsername: profile?.username || profile?.name || '',
  })
  return unwrapApiData(res?.data) ?? res?.data
}
