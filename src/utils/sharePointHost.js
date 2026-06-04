/**
 * SharePoint / OneDrive hosts block cross-origin fetch from the Join app (CORS).
 * Use DRAHT stream/proxy endpoints instead of fetch() in the browser.
 */
export function isSharePointHost(urlOrHostname) {
  const raw = String(urlOrHostname || '').trim()
  if (!raw) return false
  let host = raw
  if (raw.includes('://')) {
    try {
      host = new URL(raw).hostname
    } catch {
      return false
    }
  }
  const h = host.toLowerCase()
  return h.endsWith('sharepoint.com') || h.endsWith('onedrive.live.com')
}

export function canFetchPdfUrlInBrowser(url) {
  const trimmed = String(url || '').trim()
  if (!trimmed || trimmed.startsWith('blob:')) return true
  if (isSharePointHost(trimmed)) return false
  try {
    return new URL(trimmed).origin === window.location.origin
  } catch {
    return false
  }
}
