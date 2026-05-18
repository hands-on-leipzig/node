import { computed } from 'vue'

/**
 * Build shipmentSchedule prop for TeklaTimeline when Versand step is shown.
 * @param {import('vue').Ref<object|null>} cardRef team/group/class card from API
 * @param {import('vue').ComputedRef<boolean>} showRef timelineHasShipmentStep
 */
export function useTeklaShipmentSchedule(cardRef, showRef) {
  return computed(() => {
    if (!showRef.value) return null
    const card = cardRef.value
    const fromApi = card?.shipmentSchedule
    const schedule = fromApi && typeof fromApi === 'object' ? { ...fromApi } : {}
    if (!schedule.earliestDate && card?.versandaufschub) {
      const ts = card.versandaufschub
      const ms = typeof ts === 'number' ? ts * 1000 : Date.parse(ts)
      if (Number.isFinite(ms)) {
        schedule.earliestDate = new Date(ms).toISOString().slice(0, 10)
      }
    }
    return schedule
  })
}
