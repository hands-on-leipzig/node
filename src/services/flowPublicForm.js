import axios from 'axios'
import { getToken, updateToken } from '@/auth/keycloak'

const flowApi = axios.create({
  baseURL: import.meta.env.VITE_FLOW_API_URL || 'https://dev.flow.hands-on-technology.org/api',
  headers: { 'Content-Type': 'application/json' },
})

export async function flowFormHeaders(formToken = '') {
  const headers = {}
  if (formToken) headers['X-Public-Form-Token'] = formToken
  try {
    await updateToken(5)
  } catch {
    /* a mail-code session has no Keycloak token */
  }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

export async function loadCoachEventForms(drahtEventId) {
  const headers = await flowFormHeaders()
  const { data } = await flowApi.get('/public-team-form/for-coach', {
    headers,
    params: { draht_event: drahtEventId },
  })
  return data
}

export async function requestTeamCode(slug, email) {
  const headers = await flowFormHeaders()
  await flowApi.post(`/public-team-form/${encodeURIComponent(slug)}/otp`, { email }, { headers })
}

export async function verifyTeamCode(slug, email, code) {
  const headers = await flowFormHeaders()
  const { data } = await flowApi.post(
    `/public-team-form/${encodeURIComponent(slug)}/otp/verify`,
    { email, code },
    { headers },
  )
  return data?.token || ''
}

export async function lookupTeamForms(slug, email, formToken = '') {
  const headers = await flowFormHeaders(formToken)
  const { data } = await flowApi.get(`/public-team-form/${encodeURIComponent(slug)}/lookup`, {
    headers,
    params: { email },
  })
  if (data?.form) return [data.form]
  const teams = Array.isArray(data?.teams) ? data.teams : []
  const forms = []
  for (const team of teams) {
    const one = await flowApi.get(`/public-team-form/${encodeURIComponent(slug)}/team/${team.id}`, {
      headers,
      params: { email },
    })
    if (one.data?.form) forms.push(one.data.form)
  }
  return forms
}

export async function saveTeamForm(slug, email, teamId, meals, custom, formToken = '') {
  const headers = await flowFormHeaders(formToken)
  const body = { email, team: teamId, custom }
  if (meals) body.meals = meals
  const { data } = await flowApi.post(`/public-team-form/${encodeURIComponent(slug)}/save`, body, { headers })
  return data?.form || null
}
