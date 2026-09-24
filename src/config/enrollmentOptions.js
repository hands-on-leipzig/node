/**
 * Enrollment options shown on the dashboard.
 * Founders: type 'team'|'class', program (backend id).
 * Future: type 'future', group '5'|'8' (group 5+ currently disabled in UI); user then chooses 8, 16 or 24 participants per group.
 * Program ids: 1 = Explore team, 2 = Challenge team, 4 = Explore class, 5 = Challenge class,
 * 6 = Future group 5-8, 7 = Future group 8-16.
 */
export const ENROLLMENT_OPTIONS = [
  // Future edition (group 5+ and 8+; 5+ currently disabled in Wizard UI)
  { type: 'future', group: '5', edition: 'future', labelKey: 'dashboard.optionFutureGroup5' },
  { type: 'future', group: '8', edition: 'future', labelKey: 'dashboard.optionFutureGroup8' },
  // Founders edition
  { type: 'team', program: 1, edition: 'founders', labelKey: 'dashboard.optionFoundersTeamExplore' },
  { type: 'team', program: 2, edition: 'founders', labelKey: 'dashboard.optionFoundersTeamChallenge' },
  { type: 'class', program: 4, edition: 'founders', labelKey: 'dashboard.optionFoundersClassExplore' },
  { type: 'class', program: 5, edition: 'founders', labelKey: 'dashboard.optionFoundersClassChallenge' },
]

export const EDITION_FOUNDERS = 'founders'
export const EDITION_FUTURE = 'future'

/** Future Edition: nur 8 / 16 / 24 laut Anmeldelogik */
export const FUTURE_PUPIL_OPTIONS = [8, 16, 24]

/** Tekla `reason_attention` keys (see mod-handson/class/tekla.class.php). */
export const REASON_ATTENTION_OPTIONS = [
  { value: 'virtual_fll', labelKey: 'wizard.reasonVirtualFll' },
  { value: 'social_media', labelKey: 'wizard.reasonSocialMedia' },
  { value: 'fair', labelKey: 'wizard.reasonFair' },
  { value: 'retailer', labelKey: 'wizard.reasonRetailer' },
  { value: 'press', labelKey: 'wizard.reasonPress' },
  { value: 'research', labelKey: 'wizard.reasonResearch' },
  { value: 'other', labelKey: 'wizard.reasonOther' },
]
