import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { birthdayToDateStr, normalizePlayerAgeRule, playerAgeOutOfRange } from './playerAge.js'

const challenge = { minAge: 9, maxAge: 16, referenceDate: '2026-01-01' }

describe('normalizePlayerAgeRule', () => {
  it('accepts the DRAHT rule shape', () => {
    assert.deepEqual(normalizePlayerAgeRule({ ...challenge }), challenge)
  })

  it('returns null for missing or broken rules', () => {
    assert.equal(normalizePlayerAgeRule(null), null)
    assert.equal(normalizePlayerAgeRule({ minAge: 9, maxAge: 16 }), null)
  })
})

describe('playerAgeOutOfRange', () => {
  it('counts the age on January 1st, inclusive at both ends', () => {
    assert.equal(playerAgeOutOfRange('2017-01-01', challenge), null)
    assert.equal(playerAgeOutOfRange('2017-01-02', challenge), 8)
    assert.equal(playerAgeOutOfRange('2009-01-02', challenge), null)
    assert.equal(playerAgeOutOfRange('2009-01-01', challenge), 17)
  })

  it('does not check without birthday or rule', () => {
    assert.equal(playerAgeOutOfRange('', challenge), null)
    assert.equal(playerAgeOutOfRange('2001-01-01', null), null)
  })
})

describe('birthdayToDateStr', () => {
  it('formats timestamps and date strings as local calendar dates', () => {
    const noonTs = Math.floor(new Date(2015, 2, 10, 12).getTime() / 1000)
    assert.equal(birthdayToDateStr(noonTs), '2015-03-10')
    assert.equal(birthdayToDateStr('2015-03-10'), '2015-03-10')
    assert.equal(birthdayToDateStr(null), '')
  })
})
