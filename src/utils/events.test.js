import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  eventRegisterEndDay,
  eventRegistrationClosed,
  eventSelectionClosed,
  futureTeamRegistrationClosed,
  isHomeEvent,
  organizeEventsForSelect,
} from './events.js'

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

  it('recognises Zu Hause labels and keeps them out of the closed set', () => {
    assert.equal(isHomeEvent({ label: 'Zu Hause - DE' }), true)
    assert.equal(isHomeEvent({ name: 'Zuhause - AT' }), true)
    assert.equal(isHomeEvent({ label: 'Rockenhausen' }), false)
  })

  it('closes Future team registration after 31 Oct 2026', () => {
    assert.equal(futureTeamRegistrationClosed(new Date('2026-10-31T20:00:00+01:00')), false)
    assert.equal(futureTeamRegistrationClosed(new Date('2026-11-01T08:00:00+01:00')), true)
  })

  it('pins home options above the list once another event is closed', () => {
    const events = [
      { id: 1, label: 'Berlin', country: 'de', registrationClosed: true },
      { id: 2, label: 'Wien', country: 'at', registrationClosed: true },
      { id: 3, label: 'Zu Hause - DE', country: 'de', registrationClosed: false },
    ]
    const organized = organizeEventsForSelect(events, { nearestLimit: 5 })
    assert.deepEqual(organized.home.map((ev) => ev.id), [3])
    assert.equal(organized.nearest.some((ev) => ev.id === 3), false)
  })

  it('leaves home events in place while every event is still open', () => {
    const events = [
      { id: 1, label: 'Berlin', country: 'de' },
      { id: 3, label: 'Zu Hause - DE', country: 'de' },
    ]
    const organized = organizeEventsForSelect(events, { nearestLimit: 5 })
    assert.deepEqual(organized.home, [])
    assert.deepEqual(organized.nearest.map((ev) => ev.id), [1, 3])
  })

  it('does not close an event without a deadline', () => {
    assert.equal(eventRegistrationClosed({ id: 4, label: 'Offen' }), false)
    assert.equal(eventSelectionClosed([{ id: 4 }], 9), false)
    assert.equal(eventSelectionClosed([{ id: 4, registrationClosed: true }], 4), true)
  })
})
