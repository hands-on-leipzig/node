import { computed } from 'vue'

function inferHasDeliveryAddress(card, schedule) {
  if (schedule.hasDeliveryAddress === true) return true
  if (schedule.hasDeliveryAddress === false) return false
  if (Number(card?.delivery_adr) > 0) return true
  const addr = card?.overview?.delivery_address
  if (addr && typeof addr === 'object') {
    return Object.values(addr).some((v) => v != null && String(v).trim() !== '')
  }
  return false
}

/**
 * Build shipmentSchedule prop for TeklaStatusBoard when Versand step is shown.
 * Shipment date is derived from the delivery address only.
 * @param {import('vue').Ref<object|null>} cardRef team/group/class card from API
 * @param {import('vue').ComputedRef<boolean>} showRef timelineHasShipmentStep
 */
export function useTeklaShipmentSchedule(cardRef, showRef) {
  return computed(() => {
    if (!showRef.value) return null
    const card = cardRef.value
    const fromApi = card?.shipmentSchedule
    const schedule = fromApi && typeof fromApi === 'object' ? { ...fromApi } : {}
    const hasDelivery = inferHasDeliveryAddress(card, schedule)
    schedule.hasDeliveryAddress = hasDelivery
    if (!hasDelivery) {
      schedule.earliestDate = null
      schedule.standardDate = null
      schedule.isCustom = false
      schedule.standardMissingReason = null
      return schedule
    }
    if (!schedule.earliestDate && card?.versandaufschub) {
      const ts = card.versandaufschub
      const ms = typeof ts === 'number' ? ts * 1000 : Date.parse(ts)
      if (Number.isFinite(ms)) {
        schedule.earliestDate = new Date(ms).toISOString().slice(0, 10)
      }
    }
    if (!schedule.earliestDate && schedule.standardDate) {
      schedule.earliestDate = schedule.standardDate
    }
    if (schedule.earliestDate && schedule.standardDate) {
      schedule.isCustom = schedule.earliestDate !== schedule.standardDate
    } else {
      schedule.isCustom = false
    }
    return schedule
  })
}
