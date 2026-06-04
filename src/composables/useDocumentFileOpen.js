import { getDocumentsFileLink, getDocumentsFileStreamBlob } from '@/services/draht'
import { isPdfDocumentFile } from '@/utils/documentFileIcon'
import { isSharePointHost } from '@/utils/sharePointHost'

function unwrapLinkPayload(data) {
  if (!data || typeof data !== 'object') return data
  const inner = data.data
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    if ('url' in inner || 'useStream' in inner || 'via' in inner) return inner
    const inner2 = inner.data
    if (inner2 && typeof inner2 === 'object' && !Array.isArray(inner2)) {
      if ('url' in inner2 || 'useStream' in inner2) return inner2
    }
  }
  return data
}

/**
 * Open a coach-dashboard document (Graph-listed SharePoint file or manual https link).
 * SharePoint bytes are loaded via DRAHT (documents-file-stream), never fetch() from the SPA.
 */
export function useDocumentFileOpen({ openPdfFromBlob, openExternalUrl, openPdfDirect }) {
  async function openViaStream(driveId, itemId, file) {
    const blob = await getDocumentsFileStreamBlob(driveId, itemId)
    if (!blob) {
      return
    }
    const title = String(file?.name || 'Download')
    if (isPdfDocumentFile(file) && openPdfFromBlob) {
      if (await openPdfFromBlob(blob, title)) return
    }
    const blobUrl = URL.createObjectURL(blob)
    openExternalUrl(blobUrl)
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
  }

  async function openDocumentFile(file) {
    const driveId = String(file?.driveId || '').trim()
    const itemId = String(file?.itemId || '').trim()
    const title = String(file?.name || 'Download')

    if (driveId && itemId) {
      // PDF in-app: always proxy via API (avoids CORS on SharePoint guest URLs).
      if (isPdfDocumentFile(file)) {
        await openViaStream(driveId, itemId, file)
        return
      }
      try {
        const res = await getDocumentsFileLink(driveId, itemId)
        const link = unwrapLinkPayload(res?.data)
        if (link?.useStream) {
          await openViaStream(driveId, itemId, file)
          return
        }
        const guestUrl = String(link?.url || '').trim()
        const via = String(link?.via || '')
        const preferStream =
          link?.useStream ||
          via === 'stream_proxy' ||
          (guestUrl && /\/:f:\//i.test(guestUrl))
        if (!preferStream && guestUrl) {
          openExternalUrl(guestUrl)
          return
        }
        await openViaStream(driveId, itemId, file)
        return
      } catch {
        await openViaStream(driveId, itemId, file)
        return
      }
    }

    const rawUrl = String(file?.url || '').trim()
    if (!rawUrl) return
    if (isPdfDocumentFile(file)) {
      if (isSharePointHost(rawUrl)) {
        openExternalUrl(rawUrl)
        return
      }
      if (openPdfDirect) {
        openPdfDirect(rawUrl, title)
        return
      }
    }
    openExternalUrl(rawUrl)
  }

  return { openDocumentFile }
}
