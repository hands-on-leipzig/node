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
    return {
      badges: [
        { key: entry.editionKey, tone: entry.edition },
        { key: entry.variantKey, tone: entry.variantTone },
        { key: entry.formatKey, tone: 'format' },
      ],
    }
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
  return {
    badges: [
      { key: edition === 'future' ? 'dashboard.editionFuture' : 'dashboard.editionFounders', tone: edition },
      { key: formatKey, tone: 'format' },
    ],
  }
}
