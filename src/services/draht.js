import axios from 'axios'
import { getToken, updateToken } from '@/auth/keycloak'

// Use proxy when api/index.php cannot be changed: set VITE_DRAHT_API_URL to https://your-domain/custom/handson/api_proxy.php
const baseURL = (import.meta.env.VITE_DRAHT_API_URL || '') + '/handson/node'

const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use(async (config) => {
  await updateToken(5)
  const token = getToken()
  if (token) {
    const value = `Bearer ${token}`
    config.headers.Authorization = value
    // Fallback when server strips Authorization (e.g. nginx); middleware reads X-Authorization
    config.headers['X-Authorization'] = value
  }
  // Force entity 1 so api_access finds the technical user (avoids 401 when multi-entity)
  config.headers['DOLAPIENTITY'] = '1'
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token invalid/expired – Keycloak will handle on next request
    }
    return Promise.reject(error)
  }
)

/**
 * List address book entries for the current user (for delivery/invoice).
 */
export function getAddresses() {
  return api.get('/addresses')
}

/**
 * Enroll a team. Payload: name, location, organization, voucher, deliveryAddress, invoiceAddress.
 */
export function enrollTeam(payload) {
  return api.post('/teams', payload)
}

/**
 * Enroll a class. Payload: name, location, organization, voucher, deliveryAddress, invoiceAddress.
 */
export function enrollClass(payload) {
  return api.post('/classes', payload)
}

/**
 * List enrolled teams for the current coach (GET /handson/node/teams).
 */
export function listTeams() {
  return api.get('/teams')
}

/**
 * List enrolled classes for the current coach (GET /handson/node/classes).
 */
export function listClasses() {
  return api.get('/classes')
}

/**
 * Get a single team by id (for detail view).
 */
export function getTeam(id) {
  return api.get('/teams/' + encodeURIComponent(id))
}

/**
 * Get a single class by id (for detail view).
 */
export function getClass(id) {
  return api.get('/classes/' + encodeURIComponent(id))
}

export default api
