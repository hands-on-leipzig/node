import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { defaultShipmentPickerRange, nextWednesdayOnOrAfter } from './shipmentSchedule.js'

describe('defaultShipmentPickerRange', () => {
  it('before holidays includes earlier Wednesdays from the first shipping day', () => {
    const { options } = defaultShipmentPickerRange('2026-08-19', '2026-08-05', 4)
    assert.equal(options[0], '2026-08-05')
    assert.ok(options.includes('2026-08-12'))
    assert.ok(options.includes('2026-08-19'))
    assert.ok(options.includes('2026-08-26'))
  })

  it('after holidays starts at next Wednesday and only offers later dates', () => {
    const { options } = defaultShipmentPickerRange('2026-08-26', '2026-08-26', 4)
    assert.equal(options[0], '2026-08-26')
    assert.equal(options.includes('2026-08-19'), false)
    assert.ok(options.includes('2026-09-02'))
  })
})

describe('nextWednesdayOnOrAfter', () => {
  it('keeps a Wednesday', () => {
    assert.equal(nextWednesdayOnOrAfter('2026-08-26'), '2026-08-26')
  })

  it('advances a Thursday to the following Wednesday', () => {
    assert.equal(nextWednesdayOnOrAfter('2026-08-20'), '2026-08-26')
  })
})
