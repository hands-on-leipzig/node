/**
 * Founders Edition – placeholder prices for order summary (catalog / order rules are authoritative).
 */
import {
  FUTURE_SEASON_SET_UNIT_EUR,
  FUTURE_TEAM_EVENT_UNIT_EUR,
} from '@/config/futureEditionConfig'

export const FOUNDERS_SEASON_SET_UNIT_EUR = FUTURE_SEASON_SET_UNIT_EUR
export const FOUNDERS_TEAM_EVENT_UNIT_EUR = FUTURE_TEAM_EVENT_UNIT_EUR

export const FOUNDERS_REGISTRATION_PRODUCT_REFS = {
  1: 'FOUNDERS_TEAM_EXPLORE',
  2: 'FOUNDERS_TEAM_CHALLENGE',
  4: 'FOUNDERS_CLASS_EXPLORE',
  5: 'FOUNDERS_CLASS_CHALLENGE',
}

/** Named roster cap for Founders teams (program 1 Explore / 2 Challenge). */
export const FOUNDERS_TEAM_MAX_PLAYERS_EXPLORE = 6
export const FOUNDERS_TEAM_MAX_PLAYERS_CHALLENGE = 10

/**
 * Max named team members for a Founders team.
 * @param {unknown} programOrVariant program id 1|2 or 'explore'|'challenge'
 * @returns {number|null}
 */
export function foundersTeamMaxPlayers(programOrVariant) {
  if (programOrVariant === 'explore' || Number(programOrVariant) === 1) {
    return FOUNDERS_TEAM_MAX_PLAYERS_EXPLORE
  }
  if (programOrVariant === 'challenge' || Number(programOrVariant) === 2) {
    return FOUNDERS_TEAM_MAX_PLAYERS_CHALLENGE
  }
  return null
}

/** EUR placeholders by program id (1/2 = team, 4/5 = class). */
export const FOUNDERS_REGISTRATION_PRICE_EUR = {
  1: 275,
  2: 375,
  4: 475,
  5: 575,
}

/**
 * @param {'explore'|'challenge'|null} variant
 * @param {'team'|'class'|null} type
 * @returns {number}
 */
export function foundersRegistrationPriceEur(variant, type) {
  if (!variant || !type) return 0
  const program =
    type === 'team'
      ? (variant === 'explore' ? 1 : 2)
      : (variant === 'explore' ? 4 : 5)
  const amount = FOUNDERS_REGISTRATION_PRICE_EUR[program]
  return Number.isFinite(amount) ? amount : 0
}
