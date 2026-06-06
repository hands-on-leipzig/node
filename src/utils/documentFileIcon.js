/**
 * SharePoint / manual document rows: pick a Bootstrap Icons class suffix (use with `bi` + `bi-${suffix}`).
 * @param {{ name?: string, url?: string }} file
 * @returns {string} e.g. `filetype-pdf` (second segment after `bi-`)
 */
export function documentFileIconBiSuffix(file) {
  const ext = documentFileExtension(file)
  return EXT_ICON[ext] || 'file-earmark'
}

/**
 * @param {{ name?: string, url?: string }} file
 */
export function documentFileExtension(file) {
  const name = String(file?.name || '').trim()
  let m = /\.([a-z0-9]{1,12})$/i.exec(name)
  if (m) return m[1].toLowerCase()
  try {
    const raw = String(file?.url || '').trim()
    if (!raw) return ''
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://placeholder.invalid${raw.startsWith('/') ? '' : '/'}${raw}`
    const u = new URL(withProto)
    const last = (u.pathname.split('/').pop() || '').split('?')[0]
    m = /\.([a-z0-9]{1,12})$/i.exec(last)
    return m ? m[1].toLowerCase() : ''
  } catch {
    return ''
  }
}

/** @param {{ name?: string, url?: string }} file */
export function isPdfDocumentFile(file) {
  return documentFileExtension(file) === 'pdf'
}

/** Windows Internet Shortcut (.url) — open target URL, not the shortcut file. */
export function isUrlShortcutDocumentFile(file) {
  return documentFileExtension(file) === 'url'
}

/**
 * Parse `URL=` from a `.url` / InternetShortcut file body.
 * @param {string} text
 * @returns {string}
 */
export function parseInternetShortcutUrl(text) {
  if (!text || typeof text !== 'string') return ''
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  const match = normalized.match(/^URL=(.+)$/im)
  if (!match) return ''
  return String(match[1]).trim()
}

/** @param {Blob|null|undefined} blob */
export async function parseInternetShortcutUrlFromBlob(blob) {
  if (!blob) return ''
  try {
    return parseInternetShortcutUrl(await blob.text())
  } catch {
    return ''
  }
}

/**
 * Broad visual bucket for list row / icon chrome (BEM modifier on the icon wrap).
 * @param {{ name?: string, url?: string }} file
 * @returns {'pdf'|'video'|'audio'|'image'|'sheet'|'slide'|'archive'|'doc'|'text'|'file'}
 */
export function documentFileVisualKind(file) {
  const e = documentFileExtension(file)
  if (!e) return 'file'
  if (e === 'pdf') return 'pdf'
  if (
    new Set(['mp4', 'm4v', 'mov', 'webm', 'mkv', 'avi', 'wmv', 'mpg', 'mpeg']).has(e)
  ) {
    return 'video'
  }
  if (new Set(['mp3', 'wav', 'aac', 'flac', 'm4a', 'ogg', 'oga']).has(e)) {
    return 'audio'
  }
  if (new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'ico']).has(e)) {
    return 'image'
  }
  if (['xls', 'xlsx', 'csv'].includes(e)) return 'sheet'
  if (['ppt', 'pptx'].includes(e)) return 'slide'
  if (['zip', 'rar', '7z', 'gz'].includes(e)) return 'archive'
  if (['doc', 'docx'].includes(e)) return 'doc'
  if (['txt', 'md', 'html', 'htm', 'css', 'js', 'json', 'xml'].includes(e)) return 'text'
  return 'file'
}

const EXT_ICON = {
  pdf: 'filetype-pdf',
  mp4: 'filetype-mp4',
  m4v: 'filetype-mp4',
  mov: 'filetype-mov',
  webm: 'camera-video',
  mkv: 'camera-video',
  avi: 'camera-video',
  wmv: 'camera-video',
  mpg: 'camera-video',
  mpeg: 'camera-video',
  mp3: 'filetype-mp3',
  m4a: 'file-earmark-music',
  wav: 'filetype-wav',
  aac: 'filetype-aac',
  ogg: 'music-note-beamed',
  oga: 'music-note-beamed',
  flac: 'music-note-beamed',
  doc: 'filetype-doc',
  docx: 'filetype-docx',
  xls: 'filetype-xls',
  xlsx: 'filetype-xlsx',
  csv: 'filetype-csv',
  ppt: 'filetype-ppt',
  pptx: 'filetype-pptx',
  zip: 'filetype-zip',
  rar: 'archive',
  '7z': 'archive',
  gz: 'archive',
  txt: 'filetype-txt',
  md: 'filetype-md',
  html: 'filetype-html',
  htm: 'filetype-html',
  css: 'filetype-css',
  js: 'filetype-js',
  json: 'filetype-json',
  xml: 'filetype-xml',
  png: 'filetype-png',
  jpg: 'filetype-jpg',
  jpeg: 'filetype-jpg',
  gif: 'filetype-gif',
  webp: 'filetype-png',
  svg: 'filetype-svg',
  ico: 'file-image',
}
