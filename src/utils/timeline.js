/**
 * Coach-facing status board helpers for Tekla timeline payloads.
 *
 * DRAHT returns steps in a process-dependent order. Shipping is an AND-gate
 * (address + payment + order + date), not "the next step after invoice".
 * These helpers normalize that into a stable layout for coaches.
 */

/** @typedef {'registration'|'billing'|'shipment'|'participants'|'event'|'alert'|'other'} TimelineLaneKind */

/** Stable coach-facing order. API order is ignored. */
export const TIMELINE_LANE_ORDER = [
  'registration',
  'billing',
  'shipment',
  'participants',
  'event',
  'alert',
  'other',
]

/**
 * Timeline includes a real shipment step (products ordered), not "Kein Versand".
 * @param {unknown[]} steps
 * @returns {boolean}
 */
export function timelineHasShipmentStep(steps) {
  if (!Array.isArray(steps)) return false
  return steps.some(isRealShipmentStep)
}

/**
 * @param {unknown} step
 * @returns {boolean}
 */
export function isRealShipmentStep(step) {
  return !!(step && step.de === 'Versand' && step.en === 'Shipment')
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

/**
 * @param {unknown} step
 * @returns {TimelineLaneKind}
 */
export function classifyTimelineStep(step) {
  if (!step || typeof step !== 'object') return 'other'
  const text = normalizeText(step)
  const picto = String(step.picto || '').toLowerCase()

  if (isRealShipmentStep(step) || isNoShipmentStep(step) || picto.includes('truck')) {
    return 'shipment'
  }
  if (
    picto.includes('receipt') ||
    /rechnung|zahlung|invoice|billing|payment/.test(text)
  ) {
    return 'billing'
  }
  if (picto.includes('flag') || /veranstaltung|wettbewerb|tournament|\bevent\b/.test(text)) {
    return 'event'
  }
  if (
    picto.includes('people') ||
    picto.includes('group') ||
    /teilnehm|spieler|roster|participant|teammitglieder/.test(text)
  ) {
    return 'participants'
  }
  if (
    (picto.includes('user') && picto.includes('slash')) ||
    /abgemeldet|cancelled|canceled/.test(text)
  ) {
    return 'alert'
  }
  if (picto.includes('triangle') || picto.includes('exclamation') || step.status === 'warn') {
    return 'alert'
  }
  if (picto.includes('user') || /anmeld|registr|bestätig|confirm/.test(text)) {
    return 'registration'
  }
  return 'other'
}

/**
 * @param {unknown[]} steps
 * @returns {Array<{ step: object, kind: TimelineLaneKind, index: number }>}
 */
export function sortTimelineSteps(steps) {
  if (!Array.isArray(steps)) return []
  const indexed = steps
    .map((step, index) => ({ step, kind: classifyTimelineStep(step), index }))
    .filter((row) => row.step)
  indexed.sort((a, b) => {
    const ao = TIMELINE_LANE_ORDER.indexOf(a.kind)
    const bo = TIMELINE_LANE_ORDER.indexOf(b.kind)
    if (ao !== bo) return ao - bo
    return a.index - b.index
  })
  return indexed
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

function orderIsConfirmed(item) {
  const s = itemStatus(item)
  return s === 'validated' || s === 'shipment' || s === 'closed'
}

function shipmentIsDispatched(item) {
  const s = itemStatus(item)
  return s === 'sent' || s === 'delivered'
}

/**
 * Independent AND-conditions for the shipment lane.
 * Only conditions we can derive from the payload are included.
 *
 * @param {{
 *   steps?: unknown[],
 *   shipmentStep?: object|null,
 *   schedule?: {
 *     hasDeliveryAddress?: boolean,
 *     earliestDate?: string|null,
 *     standardDate?: string|null,
 *     locked?: boolean,
 *   }|null,
 * }} opts
 * @returns {Array<{
 *   id: string,
 *   done: boolean,
 *   waiting?: boolean,
 *   coachAction: boolean,
 *   action: 'scroll-address'|'open-invoice'|null,
 *   labelKey: string,
 * }>}
 */
export function buildShipmentConditions({ steps = [], shipmentStep = null, schedule = null } = {}) {
  if (shipmentStep && isNoShipmentStep(shipmentStep)) return []
  if (shipmentStep && !isRealShipmentStep(shipmentStep) && !schedule) return []

  const items = collectTimelineItems(steps)
  const stepItems = Array.isArray(shipmentStep?.items) ? shipmentStep.items : []
  const allItems = items.length ? items : stepItems

  const order = allItems.find((i) => itemType(i) === 'order')
  const invoice = allItems.find((i) => itemType(i) === 'invoice')
  const shipment = allItems.find((i) => itemType(i) === 'shipment')
  const conditions = []

  if (order) {
    const done = orderIsConfirmed(order)
    conditions.push({
      id: 'order',
      done,
      coachAction: false,
      action: null,
      labelKey: done ? 'detail.shipCondOrderDone' : 'detail.shipCondOrderPending',
    })
  }

  if (invoice) {
    const done = invoiceIsSettled(invoice)
    const notNeeded = itemStatus(invoice) === 'not_needed' || invoice.not_needed === true
    conditions.push({
      id: 'invoice',
      done,
      coachAction: !done,
      action: done ? null : 'open-invoice',
      labelKey: notNeeded
        ? 'detail.shipCondInvoiceNotNeeded'
        : done
          ? 'detail.shipCondInvoiceDone'
          : 'detail.shipCondInvoicePending',
    })
  }

  if (schedule) {
    const hasAddr = schedule.hasDeliveryAddress !== false
    conditions.push({
      id: 'address',
      done: hasAddr,
      coachAction: !hasAddr,
      action: hasAddr ? null : 'scroll-address',
      labelKey: hasAddr ? 'detail.shipCondAddressDone' : 'detail.shipCondAddressPending',
    })

    if (hasAddr) {
      const hasDate = !!(schedule.earliestDate || schedule.standardDate)
      conditions.push({
        id: 'date',
        done: hasDate,
        coachAction: false,
        action: null,
        labelKey: hasDate ? 'detail.shipCondDateDone' : 'detail.shipCondDatePending',
      })
    }
  }

  if (shipment) {
    const dispatched = shipmentIsDispatched(shipment)
    const delivered = itemStatus(shipment) === 'delivered'
    conditions.push({
      id: 'dispatch',
      done: dispatched,
      waiting: !dispatched,
      coachAction: false,
      action: null,
      labelKey: delivered
        ? 'detail.shipCondDelivered'
        : dispatched
          ? 'detail.shipCondSent'
          : 'detail.shipCondPreparing',
    })
  } else if (schedule?.locked) {
    conditions.push({
      id: 'dispatch',
      done: false,
      waiting: true,
      coachAction: false,
      action: null,
      labelKey: 'detail.shipCondPreparing',
    })
  } else if (schedule?.earliestDate || schedule?.standardDate) {
    const blockers = conditions.filter((c) => !c.done)
    if (blockers.length === 0) {
      conditions.push({
        id: 'dispatch',
        done: false,
        waiting: true,
        coachAction: false,
        action: null,
        labelKey: 'detail.shipCondWaitingDate',
      })
    }
  }

  return conditions
}

/**
 * @param {Array<{ done: boolean }>} conditions
 * @returns {'closed'|'progress'|'warn'|'open'}
 */
export function shipmentLaneStatus(conditions) {
  if (!conditions.length) return 'open'
  const actionableOpen = conditions.some((c) => !c.done && c.coachAction)
  if (actionableOpen) return 'warn'
  if (conditions.every((c) => c.done)) return 'closed'
  return 'progress'
}

/**
 * One-sentence "what should I do / what's happening" for the banner.
 *
 * @param {{
 *   steps?: unknown[],
 *   schedule?: object|null,
 *   conditions?: ReturnType<typeof buildShipmentConditions>,
 *   plannedDateLabel?: string,
 * }} opts
 * @returns {{
 *   tone: 'action'|'wait'|'done'|'warn',
 *   kickerKey: string,
 *   titleKey: string,
 *   titleValues?: Record<string, string>,
 *   subKey: string|null,
 *   action: 'scroll-address'|'open-invoice'|null,
 * }}
 */
export function resolveTimelineNextAction({
  steps = [],
  schedule = null,
  conditions = [],
  plannedDateLabel = '',
} = {}) {
  const list = Array.isArray(steps) ? steps : []
  const warn = list.find((s) => s && s.status === 'warn')
  if (warn) {
    return {
      tone: 'warn',
      kickerKey: 'detail.statusNextKicker',
      titleKey: 'detail.statusNextFromStep',
      titleValues: {},
      subKey: null,
      action: null,
      fromStep: warn,
    }
  }

  const firstCoachAction = conditions.find((c) => !c.done && c.coachAction)
  if (firstCoachAction?.action === 'scroll-address') {
    return {
      tone: 'action',
      kickerKey: 'detail.statusNextKicker',
      titleKey: 'detail.statusNextAddressTitle',
      subKey: 'detail.statusNextAddressSub',
      action: 'scroll-address',
    }
  }
  if (firstCoachAction?.action === 'open-invoice') {
    return {
      tone: 'action',
      kickerKey: 'detail.statusNextKicker',
      titleKey: 'detail.statusNextInvoiceTitle',
      subKey: 'detail.statusNextInvoiceSub',
      action: 'open-invoice',
    }
  }

  const shipment = list.find(isRealShipmentStep)
  if (shipment && conditions.length) {
    const dispatched = conditions.find((c) => c.id === 'dispatch' && c.done)
    if (dispatched) {
      return {
        tone: 'done',
        kickerKey: 'detail.statusDoneKicker',
        titleKey: dispatched.labelKey === 'detail.shipCondDelivered'
          ? 'detail.statusDeliveredTitle'
          : 'detail.statusShippedTitle',
        subKey: null,
        action: null,
      }
    }
    if (schedule?.locked) {
      return {
        tone: 'wait',
        kickerKey: 'detail.statusWaitingKicker',
        titleKey: 'detail.statusPreparingTitle',
        subKey: 'detail.statusPreparingSub',
        action: null,
      }
    }
    if (plannedDateLabel && conditions.every((c) => c.done || c.id === 'dispatch')) {
      return {
        tone: 'wait',
        kickerKey: 'detail.statusWaitingKicker',
        titleKey: 'detail.statusShipmentPlannedTitle',
        titleValues: { date: plannedDateLabel },
        subKey: 'detail.statusShipmentPlannedSub',
        action: null,
      }
    }
  }

  const progress = list.find((s) => s && s.status === 'progress')
  if (progress) {
    return {
      tone: 'action',
      kickerKey: 'detail.statusNextKicker',
      titleKey: 'detail.statusNextFromStep',
      subKey: null,
      action: null,
      fromStep: progress,
    }
  }

  if (list.length && list.every((s) => !s || s.status === 'closed')) {
    return {
      tone: 'done',
      kickerKey: 'detail.statusDoneKicker',
      titleKey: 'detail.statusDoneTitle',
      subKey: null,
      action: null,
    }
  }

  return {
    tone: 'wait',
    kickerKey: 'detail.statusWaitingKicker',
    titleKey: 'detail.statusInProgressTitle',
    subKey: null,
    action: null,
  }
}
