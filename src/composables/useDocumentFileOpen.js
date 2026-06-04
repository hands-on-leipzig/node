import { getDocumentsFileLink, getDocumentsFileStreamBlob } from '@/services/draht'
import { isPdfDocumentFile } from '@/utils/documentFileIcon'

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return ''
  }
}

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
 */
export function useDocumentFileOpen({ tryOpenPdfAsBlob, openExternalUrl, openPdfDirect }) {
  async function openViaStream(driveId, itemId, file) {
    const blob = await getDocumentsFileStreamBlob(driveId, itemId)
    if (!blob) {
      openExternalUrl(file?.url || '')
      return
    }
    const blobUrl = URL.createObjectURL(blob)
    const title = String(file?.name || 'Download')
    if (isPdfDocumentFile(file) && tryOpenPdfAsBlob) {
      const ok = await tryOpenPdfAsBlob(blobUrl, title)
      URL.revokeObjectURL(blobUrl)
      if (ok) return
    }
    openExternalUrl(blobUrl)
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
  }

  async function openDocumentFile(file) {
    const driveId = String(file?.driveId || '').trim()
    const itemId = String(file?.itemId || '').trim()
    const title = String(file?.name || 'Download')

    if (driveId && itemId) {
      try {
        const res = await getDocumentsFileLink(driveId, itemId)
        const link = unwrapLinkPayload(res?.data)
        if (link?.useStream) {
          await openViaStream(driveId, itemId, file)
          return
        }
        const guestUrl = String(link?.url || '').trim()
        if (guestUrl) {
          if (isPdfDocumentFile(file) && tryOpenPdfAsBlob) {
            const ok = await tryOpenPdfAsBlob(guestUrl, title)
            if (ok) return
          }
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
      const host = hostOf(rawUrl)
      if (host.endsWith('sharepoint.com') || host.endsWith('onedrive.live.com')) {
        if (tryOpenPdfAsBlob && (await tryOpenPdfAsBlob(rawUrl, title))) return
        openExternalUrl(rawUrl)
        return
      }
      if (openPdfDirect) {
        openPdfDirect(rawUrl, title)
        return
      }
      if (tryOpenPdfAsBlob && (await tryOpenPdfAsBlob(rawUrl, title))) return
    }
    openExternalUrl(rawUrl)
  }

  return { openDocumentFile }
}
