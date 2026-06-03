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
