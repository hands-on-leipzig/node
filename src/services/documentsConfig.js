/**
 * Coach dashboard documents: config from DRAHT + folder file list from Graph API.
 */
import { getDocumentsConfig, getDocumentsFolderFiles } from '@/services/draht'

function normalizeFiles(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((x) => x && typeof x === 'object')
    .map((x) => ({
      name: String(x.name ?? '').trim() || 'Download',
      url: String(x.url ?? '').trim(),
      folder: String(x.folder ?? x.group ?? '').trim(),
      path: String(x.path ?? x.folderPath ?? x.relativePath ?? '').trim().replace(/\\/g, '/'),
    }))
    .filter((x) => /^https?:\/\//i.test(x.url))
    .slice(0, 150)
}

function normalizeConfig(j) {
  if (!j || typeof j !== 'object') {
    return {
      folderUrl: '',
      title: '',
      files: [],
      skipGraphFileListing: false,
    }
  }
  return {
    folderUrl: String(j.folderUrl ?? '').trim(),
    title: String(j.title ?? '').trim(),
    files: normalizeFiles(j.files),
    skipGraphFileListing: !!j.skipGraphFileListing,
  }
}

function unwrapPayload(data) {
  if (!data || typeof data !== 'object') return data
  const inner = data.data
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    if ('folderUrl' in inner || 'files' in inner || 'title' in inner || 'graphOk' in inner) {
      return inner
    }
  }
  return data
}

function isConfigured(base) {
  return !!(base.folderUrl || base.title || (base.files && base.files.length > 0))
}

/**
 * Graph files first, then manual entries (no duplicate URLs).
 */
function mergeFileLists(graphFiles, manualFiles) {
  const seen = new Set()
  const out = []
  for (const f of graphFiles) {
    if (!f.url || seen.has(f.url)) continue
    seen.add(f.url)
    out.push({
      name: f.name,
      url: f.url,
      folder: f.folder || '',
      path: f.path || '',
    })
  }
  for (const f of manualFiles) {
    if (!f.url || seen.has(f.url)) continue
    seen.add(f.url)
    out.push({
      name: f.name,
      url: f.url,
      folder: f.folder || '',
      path: f.path || '',
    })
  }
  return out
}

/**
 * Loads documents-config, then documents-folder-files when Graph is enabled.
 * @returns {Promise<{ folderUrl: string, title: string, files: Array<{name: string, url: string}>, graphFolders?: string[], skipGraphFileListing: boolean, graphMeta?: { ok: boolean, code: string } }>}
 */
export async function fetchDocumentsConfig() {
  const empty = {
    folderUrl: '',
    title: '',
    files: [],
    skipGraphFileListing: false,
  }

  let base = null
  try {
    const res = await getDocumentsConfig()
    base = normalizeConfig(unwrapPayload(res?.data))
  } catch (_) {
    base = null
  }

  if (!base || !isConfigured(base)) {
    try {
      const r2 = await fetch(`${import.meta.env.BASE_URL}documents-config.json`)
      if (r2.ok) {
        const j = await r2.json()
        base = normalizeConfig(j)
      }
    } catch (_) {
      /* empty */
    }
  }

  if (!base) {
    return { ...empty, graphMeta: { ok: false, code: 'no_config' } }
  }

  const graphMeta = { ok: false, code: 'not_requested' }
  let mergedFiles = [...base.files]
  let graphFolders = []

  const wantGraph = base.folderUrl && !base.skipGraphFileListing

  if (wantGraph) {
    try {
      const gRes = await getDocumentsFolderFiles()
      const g = unwrapPayload(gRes?.data)
      const graphFiles = normalizeFiles(g?.files)
      graphFolders = Array.isArray(g?.folders)
        ? g.folders.map((x) => String(x || '').trim().replace(/\\/g, '/')).filter(Boolean)
        : []
      graphMeta.ok = !!g?.graphOk
      graphMeta.code = String(g?.graphCode ?? 'unknown')
      mergedFiles = mergeFileLists(graphFiles, base.files)
    } catch (e) {
      graphMeta.ok = false
      graphMeta.code = 'request_failed'
      mergedFiles = base.files.length ? base.files : []
    }
  } else if (base.folderUrl && base.skipGraphFileListing) {
    graphMeta.code = 'skipped_config'
  }

  return {
    folderUrl: base.folderUrl,
    title: base.title,
    files: mergedFiles,
    graphFolders,
    skipGraphFileListing: base.skipGraphFileListing,
    graphMeta,
  }
}
