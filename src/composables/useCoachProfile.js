import { ref, computed } from 'vue'
import { getNodeCoachMe } from '@/services/draht'
import { isMinorOnDate } from '@/utils/coachAge'

/**
 * Module-level singleton so every component sharing `useCoachProfile()` sees the same
 * state and `GET /handson/node/me` is only requested once per session (cache via
 * `coachProfileLoaded`; pass `{ force: true }` to `loadCoachProfile` to refetch, e.g.
 * after switching "view as coach").
 */
const coachProfile = ref(null)
const coachProfileLoading = ref(false)
const coachProfileError = ref('')
const coachProfileLoaded = ref(false)
let inflightRequest = null

function extractProfile(res) {
  const d = res?.data?.data ?? res?.data ?? {}
  const rawIsMinor = d.isMinor ?? d.isMinorCoach
  return {
    coachContactId: d.coachContactId ?? null,
    firstname: d.firstname ?? '',
    lastname: d.lastname ?? '',
    email: d.email ?? '',
    defaultLang: d.defaultLang ?? null,
    // Planned draht-dev contract: `dateOfBirth` as `YYYY-MM-DD` (from $contact->birthdate).
    // Not shipped yet — until it is, dateOfBirth stays null and isMinorCoach stays false
    // (fail-open), so this restriction is a no-op for every coach.
    dateOfBirth: d.dateOfBirth ?? null,
    // Backend may alternatively/also send a precomputed boolean (avoids any client
    // timezone concerns); prefer it over computing from dateOfBirth when present.
    isMinorFromApi: typeof rawIsMinor === 'boolean' ? rawIsMinor : null,
  }
}

/**
 * Shared coach profile (identity + minor status). Call `loadCoachProfile()` once
 * (e.g. in a top-level layout or on each screen that needs it — repeated calls are
 * deduped/cached).
 */
export function useCoachProfile() {
  const isMinorCoach = computed(() => {
    const p = coachProfile.value
    if (!p) return false
    if (p.isMinorFromApi != null) return p.isMinorFromApi
    return isMinorOnDate(p.dateOfBirth)
  })

  async function loadCoachProfile({ force = false } = {}) {
    if (coachProfileLoaded.value && !force) return coachProfile.value
    if (inflightRequest && !force) return inflightRequest
    coachProfileLoading.value = true
    coachProfileError.value = ''
    inflightRequest = (async () => {
      try {
        const res = await getNodeCoachMe()
        coachProfile.value = extractProfile(res)
        coachProfileLoaded.value = true
        return coachProfile.value
      } catch (e) {
        coachProfileError.value = e.response?.data?.message || e.message || ''
        return null
      } finally {
        coachProfileLoading.value = false
        inflightRequest = null
      }
    })()
    return inflightRequest
  }

  return {
    coachProfile,
    coachProfileLoading,
    coachProfileError,
    coachProfileLoaded,
    isMinorCoach,
    loadCoachProfile,
  }
}
