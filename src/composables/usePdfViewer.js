import { ref } from 'vue'
import { canFetchPdfUrlInBrowser, isSharePointHost } from '@/utils/sharePointHost'

/**
 * Open a PDF in-app (iframe or blob). SharePoint must use a Blob from DRAHT proxy, not fetch().
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

  /**
   * @param {Blob} blob
   * @param {string} docTitle
   * @returns {Promise<boolean>}
   */
  async function openPdfFromBlob(blob, docTitle = 'PDF') {
    if (!blob || blob.size <= 0) return false
    if (blobUrl.value) {
      URL.revokeObjectURL(blobUrl.value)
    }
    blobUrl.value = URL.createObjectURL(blob)
    url.value = blobUrl.value
    title.value = docTitle
    open.value = true
    return true
  }

  async function tryOpenAsBlob(rawUrl, docTitle) {
    if (!canFetchPdfUrlInBrowser(rawUrl)) return false
    try {
      const res = await fetch(rawUrl, { credentials: 'include' })
      if (!res.ok) return false
      const blob = await res.blob()
      return openPdfFromBlob(blob, docTitle)
    } catch {
      return false
    }
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

    if (isSharePointHost(trimmed)) {
      window.open(trimmed, '_blank', 'noopener,noreferrer')
      return true
    }

    if (await tryOpenAsBlob(trimmed, docTitle)) return true

    url.value = trimmed
    title.value = docTitle
    open.value = true
    return true
  }

  return { open, url, title, openPdf, openPdfFromBlob, close }
}
