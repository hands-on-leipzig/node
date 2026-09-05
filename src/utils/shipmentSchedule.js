/**
 * @param {string} ymd YYYY-MM-DD
 * @returns {boolean}
 */
export function isWednesdayYmd(ymd) {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false
  const d = new Date(`${ymd}T12:00:00`)
  return d.getDay() === 3
}

/**
 * @param {string} fromYmd
 * @param {string} toYmd
 * @returns {string[]}
 */
export function listWednesdaysBetween(fromYmd, toYmd) {
  if (!fromYmd || !toYmd) return []
  const from = new Date(`${fromYmd}T12:00:00`)
  const to = new Date(`${toYmd}T12:00:00`)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return []

  const cur = new Date(from)
  while (cur.getDay() !== 3) {
    cur.setDate(cur.getDate() + 1)
  }
  const out = []
  while (cur <= to) {
    const y = cur.getFullYear()
    const m = String(cur.getMonth() + 1).padStart(2, '0')
    const d = String(cur.getDate()).padStart(2, '0')
    out.push(`${y}-${m}-${d}`)
    cur.setDate(cur.getDate() + 7)
  }
  return out
}

/**
 * @param {string} standardYmd
 * @param {number} extraWeeks after standard
 */
function toYmd(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function todayYmd() {
  return toYmd(new Date())
}

/** Next Wednesday on or after ymd (defaults to today). */
export function nextWednesdayOnOrAfter(ymd) {
  const start = ymd || todayYmd()
  const cur = new Date(`${start}T12:00:00`)
  if (Number.isNaN(cur.getTime())) return null
  for (let i = 0; i < 7; i++) {
    if (cur.getDay() === 3) return toYmd(cur)
    cur.setDate(cur.getDate() + 1)
  }
  return null
}

export function addWeeksToYmd(ymd, weeks) {
  const d = new Date(`${ymd}T12:00:00`)
  d.setDate(d.getDate() + weeks * 7)
  return toYmd(d)
}

/**
 * When no standard/earliest date from API: offer upcoming Wednesdays.
 * @param {string|null} coachMinYmd
 * @param {number} weekCount
 */
export function fallbackShipmentWednesdays(coachMinYmd, weekCount = 24) {
  const today = todayYmd()
  let from = coachMinYmd && coachMinYmd > today ? coachMinYmd : today
  from = nextWednesdayOnOrAfter(from)
  if (!from) return []
  const to = addWeeksToYmd(from, weekCount)
  return listWednesdaysBetween(from, to)
}

export function defaultShipmentPickerRange(anchorYmd, pickerMinYmd, extraWeeks = 16) {
  const today = todayYmd()
  let min = pickerMinYmd || nextWednesdayOnOrAfter(today)
  if (!min) {
    return { min: '', max: '', options: [] }
  }
  const maxAnchor = anchorYmd && anchorYmd > min ? anchorYmd : min
  let max = addWeeksToYmd(maxAnchor, extraWeeks)
  if (anchorYmd && anchorYmd > max) {
    max = anchorYmd
  }
  return {
    min,
    max,
    options: listWednesdaysBetween(min, max),
  }
}

/**
 * @param {string} ymd
 * @param {'de'|'en'|string} locale
 */
export function formatShipmentDate(ymd, locale = 'de') {
  if (!ymd) return ''
  const d = new Date(`${ymd}T12:00:00`)
  return d.toLocaleDateString(locale === 'de' ? 'de-DE' : 'en-GB', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}
