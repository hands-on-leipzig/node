/**
 * Stable HTML id for a locale dot-path (editor row scroll target).
 * @param {string} path
 */
export function localePathDomId(path) {
  return (
    'le-' +
    btoa(unescape(encodeURIComponent(path)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
  )
}
