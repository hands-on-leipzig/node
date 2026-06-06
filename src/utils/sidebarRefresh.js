/** @typedef {{ source?: string, silent?: boolean }} SidebarRefreshDetail */

export const SIDEBAR_REFRESH_EVENT = 'hot-sidebar-refresh'

/**
 * Ask the dashboard sidebar to reload teams/classes/groups.
 * @param {SidebarRefreshDetail} [detail]
 */
export function requestSidebarRefresh(detail = {}) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(SIDEBAR_REFRESH_EVENT, { detail }))
}

/**
 * Whether a successful handson/node API mutation should refresh sidebar lists.
 * @param {import('axios').InternalAxiosRequestConfig} config
 */
export function shouldRefreshSidebarAfterMutation(config) {
  const method = String(config.method || 'get').toLowerCase()
  if (method !== 'post' && method !== 'put') return false
  const url = String(config.url || '')
  if (method === 'post' && (url === '/teams' || url === '/classes' || url === '/groups')) return true
  if (method === 'put' && /\/teams\/[^/]+\/label$/.test(url)) return true
  if (method === 'put' && /\/groups\/[^/]+\/event$/.test(url)) return true
  return false
}
