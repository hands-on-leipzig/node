import { ref } from 'vue'

/**
 * Open a PDF in-app (iframe or blob). SharePoint links use blob fetch when possible.
 */
export function usePdfViewer() {
  const open = ref(false)
  const url = ref('')
  const title = ref('')
  const blobUrl = ref('')

  function close() {
    open.value = false
    url.value = ''
    title.value = ''
    if (blobUrl.value) {
      URL.revokeObjectURL(blobUrl.value)
      blobUrl.value = ''
    }
  }

  async function tryOpenAsBlob(rawUrl, docTitle) {
    try {
      const res = await fetch(rawUrl, { credentials: 'include' })
      if (!res.ok) return false
      const blob = await res.blob()
      if (!blob || blob.size <= 0) return false
      if (blobUrl.value) {
        URL.revokeObjectURL(blobUrl.value)
      }
      blobUrl.value = URL.createObjectURL(blob)
      url.value = blobUrl.value
      title.value = docTitle
      open.value = true
      return true
    } catch {
      return false
    }
  }

  function isSharePointHost(hostname) {
    const h = String(hostname || '').toLowerCase()
    return h.endsWith('sharepoint.com') || h.endsWith('onedrive.live.com')
  }

  async function openPdf(rawUrl, docTitle = 'PDF') {
    const trimmed = String(rawUrl || '').trim()
    if (!trimmed) return false

    if (trimmed.startsWith('blob:')) {
      if (blobUrl.value && blobUrl.value !== trimmed) {
        URL.revokeObjectURL(blobUrl.value)
      }
      blobUrl.value = trimmed
      url.value = trimmed
      title.value = docTitle
      open.value = true
      return true
    }

    let host = ''
    try {
      host = new URL(trimmed).hostname
    } catch {
      host = ''
    }

    if (isSharePointHost(host)) {
      if (await tryOpenAsBlob(trimmed, docTitle)) return true
      window.open(trimmed, '_blank', 'noopener,noreferrer')
      return true
    }

    url.value = trimmed
    title.value = docTitle
    open.value = true
    return true
  }

  return { open, url, title, openPdf, close }
}
