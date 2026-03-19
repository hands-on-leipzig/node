/**
 * Future Edition – logical line items for DRAHT orders (products/services later).
 * Amounts are placeholders until DRAHT provides catalog prices via API.
 */
export const FUTURE_GROUP_PRODUCT_REFS = {
  8: 'FUTURE_GROUP_P8',
  16: 'FUTURE_GROUP_P16',
  24: 'FUTURE_GROUP_P24',
}

/** Gruppenanmeldung (Hauptposition) – EUR placeholder */
export const FUTURE_GROUP_PRICE_EUR = {
  8: 250,
  16: 350,
  24: 450,
}

export const FUTURE_SEASON_SET_PRODUCT_REF = 'FUTURE_SEASONSET'
/** Ein Saisonset – EUR placeholder; zweites Set = gleiche Position ×2 */
export const FUTURE_SEASON_SET_UNIT_EUR = 150

export const FUTURE_TEAM_EVENT_PRODUCT_REF = 'FUTURE_TEAM_EVENT'
/** Team-Event-Anmeldung pro Team – EUR placeholder */
export const FUTURE_TEAM_EVENT_UNIT_EUR = 100

/** Zulässige Teilnehmerzahlen pro Gruppe (CRM-Logik) */
export const FUTURE_PUPIL_COUNTS = [8, 16, 24]

/**
 * Max. Teams für Event-Anmeldung je nach Gruppengröße.
 * 8 → 1, 16 → 2, 24 → 3
 */
export function futureMaxEventTeams(pupilCount) {
  if (pupilCount <= 8) return 1
  if (pupilCount <= 16) return 2
  return 3
}
