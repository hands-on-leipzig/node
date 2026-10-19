/**
 * Team member age rule from DRAHT (`playerAgeRule` on the team card, `GET node/player-age-rule`):
 * `{ minAge, maxAge, referenceDate: 'YYYY-01-01' }` — the age counts on January 1st of the year
 * the season starts in. `null` when the program has no age rule (e.g. Future 5+).
 */
import { ageOnDate, parseDateOfBirth } from './coachAge.js'

/**
 * @param {unknown} rule
 * @returns {{ minAge: number, maxAge: number, referenceDate: string }|null}
 */
export function normalizePlayerAgeRule(rule) {
  if (!rule || typeof rule !== 'object') return null
  const minAge = Number(rule.minAge)
  const maxAge = Number(rule.maxAge)
  const referenceDate = typeof rule.referenceDate === 'string' ? rule.referenceDate : ''
  if (!Number.isFinite(minAge) || !Number.isFinite(maxAge) || !parseDateOfBirth(referenceDate)) return null
  return { minAge, maxAge, referenceDate }
}

/**
 * Age on the reference date when it is outside the allowed range; null when allowed or not checkable.
 *
 * @param {string|number|null|undefined} birthday `YYYY-MM-DD` or Unix timestamp (seconds)
 * @param {{ minAge: number, maxAge: number, referenceDate: string }|null} rule
 * @returns {number|null}
 */
export function playerAgeOutOfRange(birthday, rule) {
  if (!rule) return null
  const age = ageOnDate(birthday, rule.referenceDate)
  if (age === null) return null
  return age < rule.minAge || age > rule.maxAge ? age : null
}

/**
 * Reference date for display: `01.01.2026` (de) or `01/01/2026` (en).
 *
 * @param {{ referenceDate: string }} rule
 * @param {string} locale
 * @returns {string}
 */
export function formatAgeReferenceDate(rule, locale) {
  const [y, m, d] = rule.referenceDate.split('-')
  return locale === 'de' ? `${d}.${m}.${y}` : `${d}/${m}/${y}`
}

/**
 * Local calendar date `YYYY-MM-DD` of a birthday (Unix timestamp in seconds or date string).
 *
 * @param {string|number|null|undefined} value
 * @returns {string}
 */
export function birthdayToDateStr(value) {
  const d = parseDateOfBirth(value)
  if (!d) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
