import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { eventRegisterEndDay, eventRegistrationClosed, eventSelectionClosed } from './events.js'

describe('eventRegistrationClosed', () => {
  it('trusts an explicit API flag', () => {
    assert.equal(eventRegistrationClosed({ registrationClosed: true }), true)
    assert.equal(eventRegistrationClosed({ registrationClosed: false, registerEnd: '2000-01-01' }), false)
  })

  it('keeps the deadline day itself open and closes the next day', () => {
    const ev = { registerEnd: '2026-11-04' }
    assert.equal(eventRegistrationClosed(ev, new Date('2026-11-04T22:30:00+01:00')), false)
    assert.equal(eventRegistrationClosed(ev, new Date('2026-11-04T23:30:00Z')), true)
  })

  it('reads register_end dates', () => {
    assert.equal(eventRegisterEndDay({ register_end: '2026-03-12T00:00:00' }), '2026-03-12')
    assert.equal(eventRegistrationClosed({ register_end: '2026-03-12' }, new Date('2026-03-13T08:00:00+01:00')), true)
  })

  it('does not close an event without a deadline', () => {
    assert.equal(eventRegistrationClosed({ id: 4, label: 'Offen' }), false)
    assert.equal(eventSelectionClosed([{ id: 4 }], 9), false)
    assert.equal(eventSelectionClosed([{ id: 4, registrationClosed: true }], 4), true)
  })
})
