import { FUTURE_PUPIL_OPTIONS } from '@/config/enrollmentOptions'

/**
 * Normalize Dolibarr / DRAHT voucher validate API body and extract fixed season set count.
 */

/**
 * @param {unknown} raw
 * @returns {Record<string, unknown>|null}
 */
export function normalizeVoucherApiBody(raw) {
  if (!raw || typeof raw !== 'object') return null
  if (Array.isArray(raw)) {
    const first = raw[0]
    return first && typeof first === 'object' ? first : null
  }
  const obj = /** @type {Record<string, unknown>} */ (raw)
  if (obj.data && typeof obj.data === 'object' && obj.type == null && obj.preset == null) {
    return /** @type {Record<string, unknown>} */ (obj.data)
  }
  return obj
}

/**
 * @param {unknown} raw
 * @returns {number|null} 0|1|2 when voucher fixes season set count
 */
export function extractLockedSeasonSetCount(raw) {
  const body = normalizeVoucherApiBody(raw)
  if (!body) return null

  const preset = body.preset && typeof body.preset === 'object'
    ? /** @type {Record<string, unknown>} */ (body.preset)
    : null

  for (const src of [preset, body]) {
    if (!src) continue
    for (const key of ['seasonSetCount', 'num_boards', 'numberOfBoards']) {
      if (src[key] == null || src[key] === '') continue
      const n = Number(src[key])
      if ([0, 1, 2].includes(n)) return n
    }
  }

  const forcedRaw = body.force_numberOfBoards ?? body.forceNumberOfBoards
  if (forcedRaw != null && forcedRaw !== '') {
    const forced = Number(forcedRaw)
    if (Number.isFinite(forced) && [0, 1, 2].includes(forced)) {
      return forced
    }
  }

  return null
}

/**
 * @param {unknown} raw
 * @returns {number|null} fixed pupil count from voucher preset (8|16|24)
 */
export function extractLockedPupils(raw) {
  const body = normalizeVoucherApiBody(raw)
  if (!body) return null

  const preset = body.preset && typeof body.preset === 'object'
    ? /** @type {Record<string, unknown>} */ (body.preset)
    : null

  for (const src of [preset, body]) {
    if (!src) continue
    for (const key of ['pupils', 'registeredPupils']) {
      if (src[key] == null || src[key] === '') continue
      const n = Number(src[key])
      if (FUTURE_PUPIL_OPTIONS.includes(n)) return n
    }
  }
  return null
}

/**
 * @param {unknown} raw
 * @returns {number|null} fixed event team count from voucher preset (≥1)
 */
export function extractLockedEventTeamCount(raw) {
  const body = normalizeVoucherApiBody(raw)
  if (!body) return null

  const preset = body.preset && typeof body.preset === 'object'
    ? /** @type {Record<string, unknown>} */ (body.preset)
    : null

  for (const src of [preset, body]) {
    if (!src) continue
    if (src.eventTeamCount == null || src.eventTeamCount === '') continue
    const n = Number(src.eventTeamCount)
    if (Number.isFinite(n) && n >= 1) return n
  }
  return null
}

/**
 * @param {unknown} raw
 * @returns {number|null} fixed event rowid from voucher preset
 */
export function extractLockedEventId(raw) {
  const body = normalizeVoucherApiBody(raw)
  if (!body) return null

  const preset = body.preset && typeof body.preset === 'object'
    ? /** @type {Record<string, unknown>} */ (body.preset)
    : null

  for (const src of [preset, body]) {
    if (!src) continue
    if (src.eventId == null || src.eventId === '') continue
    const n = Number(src.eventId)
    if (Number.isFinite(n) && n > 0) return n
  }
  return null
}
