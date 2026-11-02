import { birthdayToDateStr } from './playerAge.js'

/** Same minimum as DRAHT `Team::checkTeamDataComplete()`. */
export const TEAM_DATA_MIN_PLAYERS = 2

/**
 * DRAHT treats `tbd` and `tdb` as an unfinished team name.
 *
 * @param {unknown} label
 * @returns {boolean}
 */
export function isPlaceholderTeamName(label) {
  const name = String(label ?? '').trim().toLowerCase()
  return name === 'tbd' || name === 'tdb'
}

/**
 * Form fields that are still empty on one team member.
 * `birthday` matches the server check (empty or 0). Gender is required in the form.
 *
 * @param {object|null|undefined} player
 * @returns {Array<'firstname'|'lastname'|'gender'|'birthday'>}
 */
export function playerFieldGaps(player) {
  const p = player && typeof player === 'object' ? player : {}
  /** @type {Array<'firstname'|'lastname'|'gender'|'birthday'>} */
  const missing = []
  if (!String(p.firstname ?? '').trim()) missing.push('firstname')
  if (!String(p.name ?? '').trim()) missing.push('lastname')
  if (!String(p.gender ?? '').trim()) missing.push('gender')
  if (!birthdayToDateStr(p.birthday)) missing.push('birthday')
  return missing
}

/**
 * Why team data is still open: placeholder name, fewer than two members,
 * and each member's empty fields.
 *
 * @param {unknown} label
 * @param {unknown} players
 * @returns {{
 *   placeholderName: boolean,
 *   tooFew: boolean,
 *   players: Array<{ index: number, name: string, fields: Array<'firstname'|'lastname'|'gender'|'birthday'> }>,
 * }}
 */
export function describeTeamDataGaps(label, players) {
  const list = Array.isArray(players) ? players : []
  const memberGaps = []
  list.forEach((player, index) => {
    const fields = playerFieldGaps(player)
    if (!fields.length) return
    const name = [player?.firstname, player?.name]
      .map((part) => String(part ?? '').trim())
      .filter(Boolean)
      .join(' ')
    memberGaps.push({ index, name, fields })
  })
  return {
    placeholderName: isPlaceholderTeamName(label),
    tooFew: list.length < TEAM_DATA_MIN_PLAYERS,
    players: memberGaps,
  }
}
