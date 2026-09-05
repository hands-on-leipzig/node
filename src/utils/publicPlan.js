/**
 * Public event schedule ("one-link", e.g. https://handson.tools/aachen).
 *
 * FLOW owns the slug and hands it to DRAHT, which passes it through on the event.
 * JOIN only assembles the URL so no copy of it has to be stored here.
 *
 * Past seasons are addressed with a year segment (/2025/aachen). That prefix comes
 * from FLOW, so it is only present when DRAHT sends a ready link or path.
 */

// Fall back to an empty object so this module can be imported by the node test runner,
// which has no import.meta.env.
const env = import.meta.env ?? {}

const DEFAULT_BASE = 'https://handson.tools'

/**
 * Field names accepted on an event, most specific first. DRAHT may send an absolute
 * URL, a path or a bare slug; all three are handled.
 */
const PLAN_KEYS = [
  'publicPlanUrl',
  'public_plan_url',
  'planLink',
  'planlink',
  'plan_link',
  'publicLink',
  'public_link',
  'planPath',
  'plan_path',
  'planSlug',
  'plan_slug',
  'slug',
]

/**
 * @returns {string} Base URL without trailing slash.
 */
export function publicPlanBase() {
  const configured = String(env.VITE_PUBLIC_PLAN_URL || '').trim()

  return (configured || DEFAULT_BASE).replace(/\/+$/, '')
}

/**
 * Absolute URL of the public schedule of an event.
 *
 * @param {Record<string, unknown>|null|undefined} event
 * @returns {string} Empty when the event carries no schedule reference.
 */
export function publicPlanUrl(event) {
  if (!event || typeof event !== 'object') return ''

  let raw = ''
  for (const key of PLAN_KEYS) {
    const value = /** @type {Record<string, unknown>} */ (event)[key]
    if (typeof value === 'string' && value.trim() !== '') {
      raw = value.trim()
      break
    }
  }

  if (!raw || /\s/.test(raw)) return ''
  if (/^https?:\/\//i.test(raw)) return raw

  // A protocol we do not want to render, e.g. javascript: from a bad payload.
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return ''

  const path = raw.replace(/^\/+/, '')

  return path ? `${publicPlanBase()}/${path}` : ''
}

/**
 * @param {Record<string, unknown>|null|undefined} event
 * @returns {boolean}
 */
export function hasPublicPlan(event) {
  return publicPlanUrl(event) !== ''
}
