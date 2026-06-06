/**
 * Map Dolibarr program id + tekla element to enrollment labels for detail views.
 * Programs: 1/2 = Founders team Explore/Challenge, 4/5 = Founders class, 6/7 = Future 5+/8+.
 */

const BY_PROGRAM = {
  1: {
    edition: 'founders',
    editionKey: 'dashboard.editionFounders',
    variantKey: 'wizard.optionExplore',
    variantTone: 'explore',
    formatKey: 'dashboard.team',
  },
  2: {
    edition: 'founders',
    editionKey: 'dashboard.editionFounders',
    variantKey: 'wizard.optionChallenge',
    variantTone: 'challenge',
    formatKey: 'dashboard.team',
  },
  4: {
    edition: 'founders',
    editionKey: 'dashboard.editionFounders',
    variantKey: 'wizard.optionExplore',
    variantTone: 'explore',
    formatKey: 'dashboard.class',
  },
  5: {
    edition: 'founders',
    editionKey: 'dashboard.editionFounders',
    variantKey: 'wizard.optionChallenge',
    variantTone: 'challenge',
    formatKey: 'dashboard.class',
  },
  6: {
    edition: 'future',
    editionKey: 'dashboard.editionFuture',
    variantKey: 'dashboard.optionFutureGroup5',
    variantTone: 'future5',
    formatKey: 'dashboard.coCoachTypeGroup',
  },
  7: {
    edition: 'future',
    editionKey: 'dashboard.editionFuture',
    variantKey: 'dashboard.optionFutureGroup8',
    variantTone: 'future8',
    formatKey: 'dashboard.coCoachTypeGroup',
  },
}

/**
 * @param {unknown} source Card or raw program id
 * @returns {number|null}
 */
export function normalizeProgramId(source) {
  if (source == null) return null
  if (typeof source === 'number' && Number.isFinite(source) && source > 0) return source
  if (typeof source === 'object') {
    const obj = /** @type {Record<string, unknown>} */ (source)
    const nested = obj.program
    if (nested != null && nested !== source) return normalizeProgramId(nested)
    const id = obj.program_id ?? obj.programId
    if (id != null) {
      const n = Number(id)
      return Number.isFinite(n) && n > 0 ? n : null
    }
    return null
  }
  const n = Number(source)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * @param {Record<string, unknown>|null|undefined} card Team/class/group card from API
 * @returns {{ badges: Array<{ key: string, tone: string }> }|null}
 */
export function resolveEnrollmentDisplay(card) {
  if (!card || typeof card !== 'object') return null

  const programId = normalizeProgramId(card)
  const entry = programId != null ? BY_PROGRAM[programId] : null

  if (entry) {
    const element = String(card.element || '').toLowerCase()
    let formatKey = entry.formatKey
    if (programId === 6 || programId === 7) {
      if (element === 'team') {
        formatKey = 'dashboard.team'
      } else if (element === 'gruppe') {
        formatKey = programId === 6 ? 'dashboard.futureGroupType5' : 'dashboard.futureGroupType8'
      }
    }
    const badges = [
      { key: entry.editionKey, tone: entry.edition },
      { key: entry.variantKey, tone: entry.variantTone },
      { key: formatKey, tone: 'format' },
    ]
    appendRegisteredPupilsBadge(badges, card)
    return { badges }
  }

  const element = String(card.element || '').toLowerCase()
  const formatKey =
    element === 'team'
      ? 'dashboard.team'
      : element === 'klazi'
        ? 'dashboard.class'
        : element === 'gruppe'
          ? 'dashboard.coCoachTypeGroup'
          : null
  if (!formatKey) return null

  const edition = element === 'gruppe' ? 'future' : 'founders'
  const badges = [
    { key: edition === 'future' ? 'dashboard.editionFuture' : 'dashboard.editionFounders', tone: edition },
    { key: formatKey, tone: 'format' },
  ]
  appendRegisteredPupilsBadge(badges, card)
  return { badges }
}

/**
 * @param {Array<{ key: string, tone: string, values?: Record<string, unknown> }>} badges
 * @param {Record<string, unknown>} card
 */
function appendRegisteredPupilsBadge(badges, card) {
  const element = String(card.element || '').toLowerCase()
  if (element !== 'gruppe') return
  const n = Number(card.registeredPupils)
  if (!Number.isFinite(n) || n <= 0) return
  badges.push({
    key: 'detail.registeredPupilsBadge',
    tone: 'pupils',
    values: { count: n },
  })
}

/**
 * Sidebar left-border accent: challenge | explore | future5 | future8
 * @param {Record<string, unknown>|null|undefined} row List row (program, element, edition)
 * @returns {'challenge'|'explore'|'future5'|'future8'}
 */
/**
 * Detail page headline (matches sidebar: team name, or „Klasse“ / „Gruppe“).
 *
 * @param {Record<string, unknown>|null|undefined} card
 * @param {'team'|'class'|'group'} kind
 * @returns {{ i18nKey: string|null, text: string, ref: string }}
 */
export function resolveDetailHeadline(card, kind) {
  const ref =
    card?.ref != null && String(card.ref).trim() !== ''
      ? String(card.ref).trim()
      : card?.id != null
        ? `#${card.id}`
        : ''

  if (kind === 'class') {
    return { i18nKey: 'dashboard.class', text: '', ref }
  }
  if (kind === 'group') {
    return { i18nKey: 'dashboard.coCoachTypeGroup', text: '', ref }
  }

  const name = String(card?.label ?? card?.name ?? '').trim()
  if (name) {
    return { i18nKey: null, text: name, ref }
  }
  return { i18nKey: 'dashboard.team', text: '', ref }
}

export function resolveSidebarAccentTone(row) {
  const programId = normalizeProgramId(row)
  const entry = programId != null ? BY_PROGRAM[programId] : null
  if (entry?.variantTone === 'challenge' || entry?.variantTone === 'explore' || entry?.variantTone === 'future5' || entry?.variantTone === 'future8') {
    return entry.variantTone
  }
  const element = String(row?.element ?? '').toLowerCase()
  if (element === 'gruppe') return 'future8'
  if (element === 'klazi') return 'explore'
  return 'explore'
}

/**
 * Sidebar title for a future group row (5+ / 8+ depending on program).
 *
 * @param {Record<string, unknown>|null|undefined} row
 * @returns {'dashboard.futureGroupType5'|'dashboard.futureGroupType8'|'dashboard.coCoachTypeGroup'}
 */
export function resolveSidebarGroupLabelKey(row) {
  const programId = normalizeProgramId(row)
  const entry = programId != null ? BY_PROGRAM[programId] : null
  if (entry?.variantTone === 'future5') return 'dashboard.futureGroupType5'
  if (entry?.variantTone === 'future8') return 'dashboard.futureGroupType8'
  if (row?.edition === 'future') return 'dashboard.futureGroupType8'
  return 'dashboard.coCoachTypeGroup'
}
