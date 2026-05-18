/**
 * Normalize flow / events API list payloads.
 * @param {unknown} data
 * @returns {unknown[]}
 */
export function extractEventList(data) {
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object') {
    const o = /** @type {Record<string, unknown>} */ (data)
    if (Array.isArray(o.data)) return o.data
    if (Array.isArray(o.events)) return o.events
    if (Array.isArray(o.items)) return o.items
    if (Array.isArray(o.results)) return o.results
    if (o.data && typeof o.data === 'object') {
      const inner = /** @type {Record<string, unknown>} */ (o.data)
      if (Array.isArray(inner.data)) return inner.data
      if (Array.isArray(inner.events)) return inner.events
    }
  }
  return []
}

/**
 * @param {unknown[]} rawList
 * @returns {Array<Record<string, unknown>>}
 */
export function normalizeEvents(rawList) {
  if (!Array.isArray(rawList)) return []
  return rawList
    .filter((e) => e && typeof e === 'object')
    .map((e) => {
      const row = /** @type {Record<string, unknown>} */ (e)
      const id = row.id ?? row.rowid ?? row.event_id
      return {
        ...row,
        id: id != null ? Number(id) : null,
        label: row.label ?? row.name ?? row.title ?? row.ref ?? '',
      }
    })
    .filter((e) => e.id != null && !Number.isNaN(e.id))
}

/**
 * @param {Record<string, unknown>|null|undefined} ev
 * @param {(key: string, values?: Record<string, unknown>) => string} t
 */
export function formatEventOptionLabel(ev, t) {
  const name = ev?.label || ev?.name || ev?.title || ev?.ref || (ev?.id != null ? `Event ${ev.id}` : '')
  const used = ev?.registered ?? ev?.used ?? ev?.count ?? ev?.teams_count
  const max = ev?.capacity ?? ev?.max ?? ev?.max_teams ?? ev?.slots
  if (typeof used === 'number' && typeof max === 'number') {
    return `${name} (${t('wizard.eventCapacitySlots', { used, max })})`
  }
  return String(name)
}
