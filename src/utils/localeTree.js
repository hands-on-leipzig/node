/**
 * Build a nested tree from flat dot-path locale entries for collapsible UI.
 * @param {Array<[string, string]>} entries - [fullPath, value]
 * @returns {{ branches: Array<{ key: string, node: TreeNode, count: number }>, leaves: Array<{ path: string, value: string, segment: string }> }}
 */
export function buildLocaleTreeFromFlatEntries(entries) {
  const root = emptyState()
  for (const [path, val] of entries) {
    const parts = path.split('.').filter(Boolean)
    if (parts.length === 0) continue
    addPath(root, parts, path, val)
  }
  return finalizeState(root)
}

function emptyState() {
  return { branchMap: new Map(), leaves: [] }
}

/**
 * @param {{ branchMap: Map<string, ReturnType<typeof emptyState>>, leaves: Array<{ path: string, value: string, segment: string }> }} state
 * @param {string[]} parts
 * @param {string} fullPath
 * @param {string} value
 */
function addPath(state, parts, fullPath, value) {
  if (parts.length === 1) {
    state.leaves.push({ path: fullPath, value, segment: parts[0] })
    return
  }
  const head = parts[0]
  if (!state.branchMap.has(head)) {
    state.branchMap.set(head, emptyState())
  }
  addPath(state.branchMap.get(head), parts.slice(1), fullPath, value)
}

/**
 * @param {{ branchMap: Map<string, unknown>, leaves: unknown[] }} state
 */
function countUnderState(state) {
  let n = state.leaves.length
  for (const sub of state.branchMap.values()) {
    n += countUnderState(sub)
  }
  return n
}

/**
 * @param {{ branchMap: Map<string, ReturnType<typeof emptyState>>, leaves: Array<{ path: string, value: string, segment: string }> }} state
 */
function finalizeState(state) {
  const branches = [...state.branchMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, sub]) => ({
      key,
      node: finalizeState(sub),
      count: countUnderState(sub),
    }))
  const leaves = [...state.leaves].sort((a, b) => a.path.localeCompare(b.path))
  return { branches, leaves }
}
