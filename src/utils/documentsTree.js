/**
 * Build a folder tree from flat document rows (SharePoint relative path and/or admin "Ordner" with slashes).
 * @typedef {{ name: string, url: string, folder?: string, path?: string }} DocFile
 */

function emptyNode() {
  return { files: [], children: new Map() }
}

/**
 * @param {string[]} segments
 * @param {DocFile} file
 * @param {ReturnType<typeof emptyNode>} root
 */
function insertAtPath(root, segments, file) {
  if (segments.length === 0) {
    root.files.push(file)
    return
  }
  const head = segments[0]
  const rest = segments.slice(1)
  if (!root.children.has(head)) {
    root.children.set(head, emptyNode())
  }
  const child = root.children.get(head)
  if (rest.length === 0) {
    child.files.push(file)
  } else {
    insertAtPath(child, rest, file)
  }
}

/** Relative path: API `path` / `folderPath`, else admin `folder` (may contain "A/B/C"). */
function relativePathFor(file) {
  const p = String(file.path || file.folderPath || file.folder || file.group || '')
    .trim()
    .replace(/\\/g, '/')
  return p
}

/**
 * @param {DocFile[]} files
 * @returns {{ files: DocFile[], folders: Array<{ name: string, node: ReturnType<typeof finalizeNode> }> }}
 */
export function buildDocumentsFolderTree(files) {
  const root = emptyNode()
  if (!Array.isArray(files)) return finalizeNode(root)
  for (const file of files) {
    const rel = relativePathFor(file)
    const segments = rel ? rel.split('/').map((s) => s.trim()).filter(Boolean) : []
    insertAtPath(root, segments, file)
  }
  return finalizeNode(root)
}

/**
 * @param {ReturnType<typeof emptyNode>} node
 */
function finalizeNode(node) {
  const folders = [...node.children.entries()]
    .map(([name, child]) => ({
      name,
      node: finalizeNode(child),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  node.files.sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' })
  )
  return {
    files: node.files,
    folders,
  }
}

/**
 * @param {{ files: DocFile[], folders: Array<{ name: string, node: unknown }> }} node
 */
export function countFilesInDocumentTree(node) {
  if (!node) return 0
  let n = node.files?.length || 0
  for (const fd of node.folders || []) {
    n += countFilesInDocumentTree(fd.node)
  }
  return n
}
