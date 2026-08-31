import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildShipmentConditions,
  classifyTimelineStep,
  resolveTimelineNextAction,
  shipmentLaneStatus,
  sortTimelineSteps,
  timelineHasShipmentStep,
} from './timeline.js'

describe('classifyTimelineStep', () => {
  it('maps known labels and pictos', () => {
    assert.equal(classifyTimelineStep({ de: 'Versand', en: 'Shipment', picto: 'truck' }), 'shipment')
    assert.equal(classifyTimelineStep({ de: 'Kein Versand', en: 'No shipment' }), 'shipment')
    assert.equal(classifyTimelineStep({ de: 'Rechnung', en: 'Invoice', picto: 'receipt' }), 'billing')
    assert.equal(classifyTimelineStep({ de: 'Anmeldung', en: 'Registration', picto: 'user' }), 'registration')
    assert.equal(classifyTimelineStep({ de: 'Event', en: 'Event', picto: 'flag' }), 'event')
  })
})

describe('sortTimelineSteps', () => {
  it('uses a stable coach order regardless of API order', () => {
    const steps = [
      { de: 'Event', en: 'Event', picto: 'flag' },
      { de: 'Versand', en: 'Shipment', picto: 'truck' },
      { de: 'Anmeldung', en: 'Registration', picto: 'user' },
      { de: 'Rechnung', en: 'Invoice', picto: 'receipt' },
    ]
    assert.deepEqual(
      sortTimelineSteps(steps).map((row) => row.kind),
      ['registration', 'billing', 'shipment', 'event'],
    )
  })
})

describe('shipment conditions', () => {
  it('treats shipment as independent AND-conditions', () => {
    const steps = [
      {
        de: 'Versand',
        en: 'Shipment',
        items: [
          { type: 'order', status: 'validated' },
          { type: 'invoice', status: 'open' },
        ],
      },
    ]
    const conditions = buildShipmentConditions({
      steps,
      shipmentStep: steps[0],
      schedule: { hasDeliveryAddress: false },
    })
    assert.equal(conditions.find((c) => c.id === 'order').done, true)
    assert.equal(conditions.find((c) => c.id === 'invoice').done, false)
    assert.equal(conditions.find((c) => c.id === 'address').done, false)
    assert.equal(conditions.find((c) => c.id === 'address').action, 'scroll-address')
    assert.equal(shipmentLaneStatus(conditions), 'warn')
  })

  it('does not invent a shipment step for Kein Versand', () => {
    assert.equal(
      timelineHasShipmentStep([{ de: 'Kein Versand', en: 'No shipment' }]),
      false,
    )
    assert.deepEqual(
      buildShipmentConditions({
        shipmentStep: { de: 'Kein Versand', en: 'No shipment' },
        schedule: null,
      }),
      [],
    )
  })
})

describe('resolveTimelineNextAction', () => {
  it('asks for the first coach-actionable shipment blocker', () => {
    const next = resolveTimelineNextAction({
      steps: [{ de: 'Versand', en: 'Shipment', status: 'progress' }],
      conditions: [
        { id: 'order', done: true, coachAction: false, action: null },
        { id: 'address', done: false, coachAction: true, action: 'scroll-address' },
      ],
    })
    assert.equal(next.action, 'scroll-address')
    assert.equal(next.titleKey, 'detail.statusNextAddressTitle')
  })

  it('shows planned shipment when only the date is left', () => {
    const next = resolveTimelineNextAction({
      steps: [{ de: 'Versand', en: 'Shipment', status: 'progress' }],
      schedule: { locked: false },
      plannedDateLabel: 'Mittwoch, 02.09.2026',
      conditions: [
        { id: 'order', done: true, coachAction: false, action: null },
        { id: 'invoice', done: true, coachAction: false, action: null },
        { id: 'address', done: true, coachAction: false, action: null },
        { id: 'date', done: true, coachAction: false, action: null },
        { id: 'dispatch', done: false, waiting: true, coachAction: false, action: null },
      ],
    })
    assert.equal(next.tone, 'wait')
    assert.equal(next.titleKey, 'detail.statusShipmentPlannedTitle')
  })
})
