import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildStatusFactors,
  buildStatusLanes,
  isCrcMissingAlert,
  isPausedAlert,
  isRealShipmentStep,
  timelineHasShipmentStep,
  unwrapTimelinePayload,
} from './timeline.js'

describe('unwrapTimelinePayload', () => {
  it('reads steps and crc from the DRAHT status object', () => {
    const payload = {
      timeline: [{ de: 'Anmeldung', en: 'Registration' }],
      crc: { de: 'Führungszeugnis fehlt', en: 'CRC missing', status: 'warn' },
    }
    const { steps, alert } = unwrapTimelinePayload(payload)
    assert.equal(steps.length, 1)
    assert.equal(isCrcMissingAlert(alert), true)
    assert.equal(isPausedAlert(alert), false)
  })

  it('treats paused copy on the same crc slot as not a missing certificate', () => {
    const alert = {
      de: 'Wir haben noch Fragen zur Anmeldung, bitte melde dich bei uns!',
      en: 'There are open questions regarding the regiatration, please contact us!',
      status: 'warn',
    }
    assert.equal(isCrcMissingAlert(alert), false)
    assert.equal(isPausedAlert(alert), true)
  })
})

describe('shipment step detection', () => {
  it('does not invent a shipment step for Kein Versand', () => {
    assert.equal(
      timelineHasShipmentStep([{ de: 'Kein Versand', en: 'No shipment' }]),
      false,
    )
  })

  it('still treats the post-dispatch Material lane as shipment', () => {
    assert.equal(isRealShipmentStep({ de: 'Material', en: 'Material' }), true)
    assert.equal(timelineHasShipmentStep([{ de: 'Material', en: 'Material' }]), false)
  })
})

describe('buildStatusLanes', () => {
  it('keeps a stable process frame and nests CRC under registration', () => {
    const lanes = buildStatusLanes({
      steps: [
        {
          de: 'Versand',
          en: 'Shipment',
          items: [
            { type: 'order', status: 'validated' },
            { type: 'invoice', status: 'paid' },
          ],
        },
        { de: 'Anmeldung', en: 'Registration', status: 'closed', picto: 'user' },
        { de: 'Rechnung', en: 'Invoice', status: 'closed', picto: 'receipt', de_sub: 'bezahlt' },
        { de: 'Teamdaten', en: 'Team data', status: 'closed', de_sub: 'vollständig' },
      ],
      alert: { de: 'Führungszeugnis fehlt', en: 'CRC missing', status: 'warn' },
      schedule: { hasDeliveryAddress: false },
    })
    assert.deepEqual(
      lanes.map((l) => l.id),
      ['registration', 'billing', 'shipment', 'participants'],
    )
    assert.deepEqual(
      lanes.find((l) => l.id === 'registration').factors.map((f) => f.id),
      ['crc', 'registration', 'order'],
    )
    assert.equal(lanes.find((l) => l.id === 'registration').status, 'warn')
    assert.equal(lanes.find((l) => l.id === 'shipment').factors.find((f) => f.id === 'order'), undefined)
    assert.equal(lanes.find((l) => l.id === 'shipment').factors.find((f) => f.id === 'address').action, 'scroll-address')
    assert.equal(lanes.find((l) => l.id === 'shipment').factors.find((f) => f.id === 'date'), undefined)
    assert.equal(lanes.find((l) => l.id === 'participants').status, 'closed')
    assert.deepEqual(lanes.find((l) => l.id === 'participants').factors, [])
    assert.notEqual(lanes.find((l) => l.id === 'shipment').status, 'closed')
    assert.equal(lanes.find((l) => l.id === 'shipment').blockedKey, 'detail.laneShipmentBlocked')
  })

  it('keeps invoice and shipment lanes visible when they do not apply', () => {
    const lanes = buildStatusLanes({
      steps: [
        { de: 'Anmeldung', en: 'Registration', status: 'closed', picto: 'user' },
        { de: 'Kein Versand', en: 'No shipment', status: 'closed' },
        {
          de: 'Rechnung',
          en: 'Invoice',
          status: 'closed',
          picto: 'receipt',
          de_sub: 'nicht benötigt',
          items: [{ type: 'invoice', status: 'not_needed' }],
        },
        { de: 'Teamdaten', en: 'Team data', status: 'closed', de_sub: 'vollständig' },
      ],
      schedule: null,
    })
    assert.equal(lanes.find((l) => l.id === 'billing').status, 'skip')
    assert.equal(lanes.find((l) => l.id === 'billing').skipKey, 'detail.laneInvoiceSkip')
    assert.equal(lanes.find((l) => l.id === 'shipment').status, 'skip')
    assert.equal(lanes.find((l) => l.id === 'shipment').skipKey, 'detail.laneNoShipment')
    assert.deepEqual(
      lanes.find((l) => l.id === 'registration').factors.map((f) => f.id),
      ['registration'],
    )
  })

  it('shows incomplete team data and an open invoice without inventing an address', () => {
    const lanes = buildStatusLanes({
      steps: [
        { de: 'Anmeldung', en: 'Registration', status: 'closed', picto: 'user' },
        {
          de: 'Rechnung',
          en: 'Invoice',
          status: 'progress',
          picto: 'receipt',
          items: [{ type: 'invoice', label: 'RE2026-91', status: 'open' }],
        },
        { de: 'Teamdaten', en: 'Team data', status: 'open', de_sub: 'unvollständig' },
      ],
    })
    assert.equal(lanes.find((l) => l.id === 'billing').status, 'warn')
    assert.equal(lanes.find((l) => l.id === 'billing').factors[0].action, 'open-invoice')
    assert.equal(lanes.find((l) => l.id === 'participants').factors[0].id, 'teamdata')
    assert.equal(lanes.find((l) => l.id === 'shipment').factors.find((f) => f.id === 'address'), undefined)
    assert.notEqual(lanes.find((l) => l.id === 'shipment').status, 'closed')
    assert.equal(lanes.find((l) => l.id === 'shipment').blockedKey, 'detail.laneShipmentBlocked')
  })

  it('does not mark shipment done while the invoice is unpaid, even if address and date are set', () => {
    const lanes = buildStatusLanes({
      steps: [
        { de: 'Anmeldung', en: 'Registration', status: 'closed', picto: 'user' },
        {
          de: 'Rechnung',
          en: 'Invoice',
          status: 'progress',
          picto: 'receipt',
          items: [{ type: 'invoice', status: 'open' }],
        },
        { de: 'Versand', en: 'Shipment', status: 'progress' },
      ],
      schedule: { hasDeliveryAddress: true, earliestDate: '2026-09-02' },
    })
    const shipment = lanes.find((l) => l.id === 'shipment')
    assert.notEqual(shipment.status, 'closed')
    assert.equal(shipment.blockedKey, 'detail.laneShipmentBlocked')
    assert.equal(shipment.factors.find((f) => f.id === 'address').done, true)
    assert.equal(shipment.factors.find((f) => f.id === 'date').done, true)
  })

  it('does not mark shipment done while the Führungszeugnis is missing', () => {
    const lanes = buildStatusLanes({
      steps: [
        { de: 'Anmeldung', en: 'Registration', status: 'closed', picto: 'user' },
        { de: 'Rechnung', en: 'Invoice', status: 'closed', picto: 'receipt', items: [{ type: 'invoice', status: 'paid' }] },
        { de: 'Versand', en: 'Shipment', status: 'progress' },
      ],
      alert: { de: 'Führungszeugnis fehlt', en: 'CRC missing', status: 'warn' },
      schedule: { hasDeliveryAddress: true, earliestDate: '2026-09-02' },
    })
    const shipment = lanes.find((l) => l.id === 'shipment')
    assert.notEqual(shipment.status, 'closed')
    assert.equal(shipment.blockedKey, 'detail.laneShipmentBlocked')
  })

  it('collapses shipment gates to delivered once the parcel is out', () => {
    const lanes = buildStatusLanes({
      steps: [
        {
          de: 'Material',
          en: 'Material',
          status: 'closed',
          items: [{ type: 'shipment', status: 'delivered' }],
        },
        { de: 'Anmeldung', en: 'Registration', status: 'closed', picto: 'user' },
      ],
      schedule: { hasDeliveryAddress: true, earliestDate: '2026-08-12', locked: true },
    })
    const shipment = lanes.find((l) => l.id === 'shipment')
    assert.deepEqual(
      shipment.factors.map((f) => f.id),
      ['dispatch'],
    )
    assert.equal(shipment.factors[0].labelKey, 'detail.factorDelivered')
  })
})

describe('buildStatusFactors', () => {
  it('marks the shipment date as waiting when preparation is locked', () => {
    const factors = buildStatusFactors({
      steps: [
        { de: 'Versand', en: 'Shipment', status: 'progress' },
        { de: 'Anmeldung', en: 'Registration', status: 'closed', picto: 'user' },
      ],
      schedule: { hasDeliveryAddress: true, earliestDate: '2026-09-02', locked: true },
    })
    const date = factors.find((f) => f.id === 'date')
    assert.equal(date.lane, 'shipment')
    assert.equal(date.waiting, true)
    assert.equal(date.done, false)
    assert.equal(date.showShipmentPicker, false)
    assert.equal(date.hintKey, null)
  })

  it('labels the date as earliest-possible while other gates can still delay it', () => {
    const factors = buildStatusFactors({
      steps: [
        { de: 'Versand', en: 'Shipment', status: 'progress', items: [{ type: 'order', status: 'validated' }] },
        { de: 'Anmeldung', en: 'Registration', status: 'closed', picto: 'user' },
        {
          de: 'Rechnung',
          en: 'Invoice',
          status: 'progress',
          picto: 'receipt',
          items: [{ type: 'invoice', status: 'open' }],
        },
      ],
      schedule: { hasDeliveryAddress: true, earliestDate: '2026-09-02', locked: false },
    })
    const date = factors.find((f) => f.id === 'date')
    assert.equal(date.labelKey, 'detail.factorDate')
    assert.equal(date.hintKey, 'detail.factorDateHint')
  })
})
