/**
 * Day-precise minor (under 18) check for a coach's date of birth.
 *
 * Backend contract: `GET /handson/node/me` → `data.dateOfBirth`,
 * a plain calendar date string `YYYY-MM-DD` mapped from Dolibarr's `$contact->birthday`
 * (`null` when not set). Using a plain date string (no time,
 * no timezone) avoids off-by-one-day errors that a Unix timestamp would risk when compared
 * against "today" in the browser's local timezone.
 *
 * The coach turns adult on the exact calendar day of their 18th birthday (inclusive).
 */

/**
 * Parse a backend date-of-birth value into a local Date (midnight).
 * Accepts `YYYY-MM-DD` (and full ISO datetime strings), a Date instance, or a Unix
 * timestamp in seconds (defensive — the contract is a plain date string).
 *
 * @param {string|number|Date|null|undefined} value
 * @returns {Date|null}
 */
export function parseDateOfBirth(value) {
  if (value == null || value === '') return null
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null
    const d = new Date(value * 1000)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const s = String(value).trim()
  if (!s) return null
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (dateOnlyMatch) {
    const [, y, m, day] = dateOnlyMatch
    const d = new Date(Number(y), Number(m) - 1, Number(day))
    return Number.isNaN(d.getTime()) ? null : d
  }
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * True if a person born on `dateOfBirth` is a minor (under 18) on `referenceDate`,
 * computed day-precise using calendar year/month/day (not elapsed time / timezone).
 *
 * @param {string|number|Date|null|undefined} dateOfBirth
 * @param {Date} [referenceDate] Defaults to now (local time)
 * @returns {boolean} false when `dateOfBirth` is missing/unparseable (fail-open — unknown treated as adult)
 */
export function isMinorOnDate(dateOfBirth, referenceDate = new Date()) {
  const dob = parseDateOfBirth(dateOfBirth)
  if (!dob) return false
  const ref = referenceDate instanceof Date ? referenceDate : new Date(referenceDate)
  if (Number.isNaN(ref.getTime())) return false

  let age = ref.getFullYear() - dob.getFullYear()
  const hasHadBirthdayThisYear =
    ref.getMonth() > dob.getMonth() ||
    (ref.getMonth() === dob.getMonth() && ref.getDate() >= dob.getDate())
  if (!hasHadBirthdayThisYear) age -= 1
  return age < 18
}
