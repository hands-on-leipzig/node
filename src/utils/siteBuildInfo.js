/**
 * Static metadata written at deploy time to `public/build-info.json` (root URL `/build-info.json`).
 * Used to detect when a new build is live without calling the GitHub API from the browser.
 */

/**
 * @returns {Promise<{ builtAt: string, sha: string } | null>}
 */
export async function fetchSiteBuildInfo() {
  if (typeof window === 'undefined') return null
  try {
    const base = import.meta.env.BASE_URL || '/'
    const url = new URL('build-info.json', window.location.origin + base)
    url.searchParams.set('t', String(Date.now()))
    const res = await fetch(url.href, { cache: 'no-store', credentials: 'same-origin' })
    if (!res.ok) return null
    const j = await res.json()
    if (!j || typeof j.builtAt !== 'string') return null
    return { builtAt: j.builtAt, sha: String(j.sha || '') }
  } catch {
    return null
  }
}

export function isLocalDevBuildInfo(info) {
  if (!info) return true
  return info.sha === 'local' || info.builtAt === 'local-dev'
}

export function formatBuildInfoShort(info) {
  if (!info) return ''
  const sha = info.sha.length > 7 ? info.sha.slice(0, 7) : info.sha
  return `${info.builtAt} · ${sha}`
}

export function buildInfoFingerprint(info) {
  if (!info) return ''
  return `${info.builtAt}|${info.sha}`
}
