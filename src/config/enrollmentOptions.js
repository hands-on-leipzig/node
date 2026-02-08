/**
 * Enrollment options shown on the dashboard.
 * Founders: type 'team'|'class', program (backend id).
 * Future: type 'future', group '5'|'8' (group 5+ or 8+); user then chooses 8, 16 or 24 pupils.
 * Program ids: 1 = Explore team, 2 = Challenge team, 4 = Explore class, 5 = Challenge class.
 */
export const ENROLLMENT_OPTIONS = [
  // Founders edition
  { type: 'team', program: 1, edition: 'founders', labelKey: 'dashboard.optionFoundersTeamExplore' },
  { type: 'team', program: 2, edition: 'founders', labelKey: 'dashboard.optionFoundersTeamChallenge' },
  { type: 'class', program: 4, edition: 'founders', labelKey: 'dashboard.optionFoundersClassExplore' },
  { type: 'class', program: 5, edition: 'founders', labelKey: 'dashboard.optionFoundersClassChallenge' },
  // Future edition (group 5+ and 8+; pupil count 8/16/24 chosen in next step)
  { type: 'future', group: '5', edition: 'future', labelKey: 'dashboard.optionFutureGroup5' },
  { type: 'future', group: '8', edition: 'future', labelKey: 'dashboard.optionFutureGroup8' },
]

export const EDITION_FOUNDERS = 'founders'
export const EDITION_FUTURE = 'future'

export const FUTURE_PUPIL_OPTIONS = [8, 16, 24]
