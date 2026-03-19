/**
 * Flatten nested locale object to dot-path keys (string leaves only).
 * @param {Record<string, unknown>} obj
 * @param {string} prefix
 * @returns {Record<string, string>}
 */
export function flattenLocaleStrings(obj, prefix = '') {
  /** @type {Record<string, string>} */
  const out = {}
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flattenLocaleStrings(v, key))
    } else {
      out[key] = typeof v === 'string' ? v : JSON.stringify(v)
    }
  }
  return out
}

/**
 * @param {Record<string, string>} flat
 * @returns {Record<string, unknown>}
 */
export function unflattenLocaleStrings(flat) {
  /** @type {Record<string, unknown>} */
  const root = {}
  for (const [path, val] of Object.entries(flat)) {
    const parts = path.split('.')
    let cur = root
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i]
      if (!cur[p] || typeof cur[p] !== 'object' || cur[p] === null || Array.isArray(cur[p])) {
        cur[p] = {}
      }
      cur = cur[p]
    }
    cur[parts[parts.length - 1]] = val
  }
  return root
}

/** @param {unknown} obj */
export function deepCloneLocale(obj) {
  return JSON.parse(JSON.stringify(obj))
}
