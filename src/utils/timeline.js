/**
 * Coach-facing status factors from Tekla timeline payloads.
 *
 * DRAHT returns a process-dependent step list plus an optional `crc` notice.
 * Shipping is an AND-gate, and not every registration has the same gates
 * (no material, no invoice, missing Führungszeugnis, incomplete team data).
 */

/**
 * @param {unknown} payload team/class/group `timeline` field from the card API
 * @returns {{ steps: object[], alert: object|null }}
 */
export function unwrapTimelinePayload(payload) {
  if (!payload) return { steps: [], alert: null }
  if (Array.isArray(payload)) return { steps: payload, alert: null }
  if (typeof payload !== 'object') return { steps: [], alert: null }
  return {
    steps: Array.isArray(payload.timeline) ? payload.timeline : [],
    alert: payload.crc && typeof payload.crc === 'object' ? payload.crc : null,
  }
}

/**
 * Timeline includes a real shipment step (products ordered), not "Kein Versand".
 * @param {unknown[]} steps
 * @returns {boolean}
 */
export function timelineHasShipmentStep(steps) {
  if (!Array.isArray(steps)) return false
  return steps.some((s) => s && s.de === 'Versand' && s.en === 'Shipment')
}

/**
 * @param {unknown} step
 * @returns {boolean}
 */
export function isRealShipmentStep(step) {
  if (!step || typeof step !== 'object' || isNoShipmentStep(step)) return false
  const de = String(step.de || '')
  const en = String(step.en || '')
  if (de === 'Versand' && en === 'Shipment') return true
  // After dispatch DRAHT relabels the same lane to "Material".
  if (de === 'Material' && en === 'Material') return true
  return false
}

/**
 * @param {unknown} step
 * @returns {boolean}
 */
export function isNoShipmentStep(step) {
  if (!step || typeof step !== 'object') return false
  const de = String(step.de || '').toLowerCase()
  const en = String(step.en || '').toLowerCase()
  return de.includes('kein versand') || en.includes('no shipment')
}

function normalizeText(step) {
  return `${step?.de || ''} ${step?.en || ''}`.toLowerCase()
}

function itemType(item) {
  return String(item?.type || '').toLowerCase()
}

function itemStatus(item) {
  return String(item?.status || '').toLowerCase()
}

/**
 * @param {unknown[]} steps
 * @returns {object[]}
 */
export function collectTimelineItems(steps) {
  if (!Array.isArray(steps)) return []
  return steps.flatMap((s) => (Array.isArray(s?.items) ? s.items : []))
}

function invoiceIsSettled(item) {
  const s = itemStatus(item)
  if (s === 'paid' || s === 'not_needed') return true
  if (item?.not_needed === true) return true
  const payed = item?.payed
  return payed === true || payed === 1 || payed === '1'
}

function invoiceIsNotNeeded(item) {
  return itemStatus(item) === 'not_needed' || item?.not_needed === true
}

function orderIsConfirmed(item) {
  const s = itemStatus(item)
  return s === 'validated' || s === 'shipment' || s === 'closed'
}

function shipmentIsDispatched(item) {
  const s = itemStatus(item)
  return s === 'sent' || s === 'delivered'
}

function billingIsNotNeeded(step, invoices) {
  if (!step) return false
  if (/nicht benötigt|not needed/.test(normalizeText(step))) return true
  return invoices.length > 0 && invoices.every(invoiceIsNotNeeded)
}

/**
 * @param {unknown} alert `crc` object from getPublicStatus()
 * @returns {boolean}
 */
export function isCrcMissingAlert(alert) {
  if (!alert || typeof alert !== 'object') return false
  const text = `${alert.de || ''} ${alert.en || ''}`.toLowerCase()
  return (
    text.includes('führungszeugnis') ||
    text.includes('fuehrungszeugnis') ||
    /\bcrc\b/.test(text)
  )
}

/**
 * Paused registration / open questions (same `crc` slot, different copy).
 * @param {unknown} alert
 * @returns {boolean}
 */
export function isPausedAlert(alert) {
  return !!(alert && typeof alert === 'object' && !isCrcMissingAlert(alert))
}

function findStep(steps, pred) {
  return steps.find((s) => s && pred(s)) || null
}

function isCancelledStep(step) {
  const text = normalizeText(step)
  const picto = String(step?.picto || '').toLowerCase()
  return (picto.includes('user') && picto.includes('slash')) || /abgemeldet|de-registration/.test(text)
}

/**
 * Applicable requirement rows for the coach checklist.
 * Factors that do not apply (no shipment, no invoice, valid CRC, complete team data)
 * are omitted rather than shown as "n/a". Each factor belongs to a stable process lane.
 *
 * @param {{
 *   steps?: unknown[],
 *   alert?: object|null,
 *   schedule?: {
 *     hasDeliveryAddress?: boolean,
 *     earliestDate?: string|null,
 *     standardDate?: string|null,
 *     locked?: boolean,
 *   }|null,
 * }} opts
 * @returns {Array<{
 *   id: string,
 *   lane: 'registration'|'billing'|'shipment'|'participants'|'event',
 *   done: boolean,
 *   waiting?: boolean,
 *   warn?: boolean,
 *   coachAction: boolean,
 *   action: 'scroll-address'|'open-invoice'|null,
 *   labelKey: string|null,
 *   fromAlert?: object,
 *   items: object[],
   *   showShipmentPicker?: boolean,
   *   hintKey?: string|null,
   * }>}
 */
export function buildStatusFactors({ steps = [], alert = null, schedule = null } = {}) {
  const list = Array.isArray(steps) ? steps.filter(Boolean) : []
  const items = collectTimelineItems(list)
  const orders = items.filter((i) => itemType(i) === 'order')
  const invoices = items.filter((i) => itemType(i) === 'invoice')
  const shipments = items.filter((i) => itemType(i) === 'shipment')

  const cancelled = findStep(list, isCancelledStep)
  const registration = findStep(list, (s) => {
    if (isCancelledStep(s)) return false
    const de = String(s.de || '').toLowerCase()
    const en = String(s.en || '').toLowerCase()
    if (de === 'anmeldung' || en === 'registration') return true
    const picto = String(s.picto || '').toLowerCase()
    return picto.includes('user') && !picto.includes('slash')
  })
  const billing = findStep(list, (s) => {
    const text = normalizeText(s)
    const picto = String(s.picto || '').toLowerCase()
    return picto.includes('receipt') || /rechnung|zahlung|invoice|billing|payment/.test(text)
  })
  const teamData = findStep(list, (s) => {
    const text = normalizeText(s)
    const picto = String(s.picto || '').toLowerCase()
    return (
      /teamdaten|team data/.test(text) ||
      ((picto.includes('people') || picto.includes('group')) && /vollständig|unvollständig|complete|incomplete/.test(text))
    )
  })
  const event = findStep(list, (s) => {
    const text = normalizeText(s)
    const picto = String(s.picto || '').toLowerCase()
    return picto.includes('flag') || /veranstaltung|wettbewerb|tournament|\bevent\b/.test(text)
  })
  const shipmentStep = findStep(list, isRealShipmentStep)
  const noShipment = list.some(isNoShipmentStep)

  const factors = []

  if (cancelled) {
    factors.push({
      id: 'cancelled',
      lane: 'registration',
      done: cancelled.status === 'closed',
      warn: cancelled.status === 'warn',
      coachAction: false,
      action: null,
      labelKey: 'detail.factorCancelled',
      items: [],
    })
  }

  if (isPausedAlert(alert)) {
    factors.push({
      id: 'paused',
      lane: 'registration',
      done: false,
      warn: true,
      coachAction: false,
      action: null,
      labelKey: null,
      fromAlert: alert,
      items: [],
    })
  }

  if (isCrcMissingAlert(alert)) {
    factors.push({
      id: 'crc',
      lane: 'registration',
      done: false,
      warn: true,
      coachAction: false,
      action: null,
      labelKey: 'detail.factorCrcMissing',
      items: [],
    })
  }

  if (registration && !cancelled) {
    factors.push({
      id: 'registration',
      lane: 'registration',
      done: registration.status === 'closed',
      coachAction: false,
      action: null,
      labelKey: 'detail.factorConfirmed',
      items: [],
    })
  }

  if (teamData && teamData.status !== 'closed') {
    factors.push({
      id: 'teamdata',
      lane: 'participants',
      done: false,
      coachAction: false,
      action: null,
      labelKey: 'detail.factorTeamData',
      items: [],
    })
  }

  if (orders.length) {
    const done = orders.every(orderIsConfirmed)
    factors.push({
      id: 'order',
      lane: 'registration',
      done,
      coachAction: false,
      action: null,
      labelKey: 'detail.factorOrder',
      items: orders,
    })
  }

  if (billing && !billingIsNotNeeded(billing, invoices)) {
    const invoice = invoices[0]
    const done = billing.status === 'closed' || (invoice ? invoiceIsSettled(invoice) : false)
    factors.push({
      id: 'invoice',
      lane: 'billing',
      done,
      coachAction: !done && !!invoice,
      action: !done && invoice ? 'open-invoice' : null,
      labelKey: 'detail.factorInvoice',
      items: invoices,
    })
  }

  if (shipmentStep && !noShipment) {
    const shipment = shipments[0]
    const dispatched = !!(shipment && shipmentIsDispatched(shipment))
    const delivered = itemStatus(shipment) === 'delivered'

    if (dispatched) {
      factors.push({
        id: 'dispatch',
        lane: 'shipment',
        done: true,
        coachAction: false,
        action: null,
        labelKey: delivered ? 'detail.factorDelivered' : 'detail.factorSent',
        items: shipments,
      })
    } else if (schedule) {
      const hasAddr = schedule.hasDeliveryAddress !== false
      factors.push({
        id: 'address',
        lane: 'shipment',
        done: hasAddr,
        warn: !hasAddr,
        coachAction: !hasAddr,
        action: hasAddr ? null : 'scroll-address',
        labelKey: 'detail.factorAddress',
        items: [],
      })
      if (hasAddr) {
        const hasDate = !!(schedule.earliestDate || schedule.standardDate)
        const locked = schedule.locked === true
        factors.push({
          id: 'date',
          lane: 'shipment',
          done: hasDate && !locked,
          waiting: locked,
          coachAction: false,
          action: null,
          labelKey: 'detail.factorDate',
          hintKey: locked ? null : 'detail.factorDateHint',
          items: [],
          showShipmentPicker: !locked,
        })
      }
    }
  }

  if (event && event.status !== 'closed') {
    factors.push({
      id: 'event',
      lane: 'event',
      done: false,
      coachAction: false,
      action: null,
      labelKey: 'detail.factorEvent',
      items: [],
    })
  }

  return factors
}

const LANE_DEFS = [
  { id: 'registration', labelKey: 'detail.laneRegistration', icon: 'bi-person-check' },
  { id: 'billing', labelKey: 'detail.laneBilling', icon: 'bi-receipt' },
  { id: 'shipment', labelKey: 'detail.laneShipment', icon: 'bi-truck' },
  { id: 'participants', labelKey: 'detail.laneTeamData', icon: 'bi-people' },
  { id: 'event', labelKey: 'detail.laneEvent', icon: 'bi-flag' },
]

function laneStatus(factors, skip) {
  if (skip) return 'skip'
  if (factors.some((f) => !f.done && (f.warn || f.coachAction))) return 'warn'
  if (factors.length && factors.every((f) => f.done)) return 'closed'
  if (factors.some((f) => !f.done)) return 'progress'
  return 'closed'
}

function shipmentBlockedByUpstream(factors, invoiceSkip) {
  if (factors.some((f) => f.id === 'crc' && !f.done)) return true
  if (factors.some((f) => f.id === 'paused' && !f.done)) return true
  if (!invoiceSkip && factors.some((f) => f.id === 'invoice' && !f.done)) return true
  return false
}

/**
 * Stable process frame. Lanes are always in the same order; points inside vary.
 *
 * @param {{
 *   steps?: unknown[],
 *   alert?: object|null,
 *   schedule?: object|null,
 * }} opts
 * @returns {Array<{
 *   id: string,
 *   labelKey: string,
 *   icon: string,
 *   status: 'closed'|'progress'|'warn'|'skip'|'open',
   *   skipKey: string|null,
   *   blockedKey: string|null,
   *   factors: ReturnType<typeof buildStatusFactors>,
 * }>}
 */
export function buildStatusLanes({ steps = [], alert = null, schedule = null } = {}) {
  const list = Array.isArray(steps) ? steps.filter(Boolean) : []
  if (!list.length && !alert) return []

  const factors = buildStatusFactors({ steps: list, alert, schedule })
  const invoices = collectTimelineItems(list).filter((i) => itemType(i) === 'invoice')
  const billing = findStep(list, (s) => {
    const text = normalizeText(s)
    const picto = String(s.picto || '').toLowerCase()
    return picto.includes('receipt') || /rechnung|zahlung|invoice|billing|payment/.test(text)
  })
  const teamData = findStep(list, (s) => {
    const text = normalizeText(s)
    return /teamdaten|team data/.test(text)
  })
  const event = findStep(list, (s) => {
    const text = normalizeText(s)
    const picto = String(s.picto || '').toLowerCase()
    return picto.includes('flag') || /veranstaltung|wettbewerb|tournament|\bevent\b/.test(text)
  })
  const cancelled = findStep(list, isCancelledStep)
  const noShipment = list.some(isNoShipmentStep)
  const invoiceSkip = !!(billing && billingIsNotNeeded(billing, invoices))

  const wanted = new Set(['registration', 'billing', 'shipment'])
  if (teamData) wanted.add('participants')
  if (event) wanted.add('event')

  return LANE_DEFS.filter((def) => wanted.has(def.id)).map((def) => {
    const laneFactors = factors.filter((f) => f.lane === def.id)
    let skipKey = null
    if (def.id === 'billing' && invoiceSkip) skipKey = 'detail.laneInvoiceSkip'
    if (def.id === 'shipment' && noShipment) skipKey = 'detail.laneNoShipment'
    let icon = def.icon
    let labelKey = def.labelKey
    if (def.id === 'registration' && cancelled) {
      icon = 'bi-person-x'
      labelKey = 'detail.laneCancelled'
    }
    let status = laneStatus(laneFactors, !!skipKey)
    let blockedKey = null
    if (def.id === 'shipment' && !skipKey) {
      const dispatched = laneFactors.some((f) => f.id === 'dispatch' && f.done)
      if (!dispatched && shipmentBlockedByUpstream(factors, invoiceSkip)) {
        blockedKey = 'detail.laneShipmentBlocked'
        if (status === 'closed') status = 'progress'
      }
    }
    return {
      id: def.id,
      labelKey,
      icon,
      status,
      skipKey,
      blockedKey,
      factors: skipKey ? [] : laneFactors,
    }
  })
}
