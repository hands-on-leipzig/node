import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { describeTeamDataGaps, isPlaceholderTeamName, playerFieldGaps } from './teamDataGaps.js'

const complete = {
  firstname: 'Lea',
  name: 'Beispiel',
  gender: 'F',
  birthday: '2014-05-02',
}

describe('playerFieldGaps', () => {
  it('is empty when name, gender and birthday are set', () => {
    assert.deepEqual(playerFieldGaps(complete), [])
  })

  it('lists a missing birthday while the row is closed', () => {
    assert.deepEqual(playerFieldGaps({ ...complete, birthday: null }), ['birthday'])
    assert.deepEqual(playerFieldGaps({ ...complete, birthday: 0 }), ['birthday'])
    assert.deepEqual(playerFieldGaps({ ...complete, birthday: '' }), ['birthday'])
  })

  it('lists every empty form field', () => {
    assert.deepEqual(playerFieldGaps({ firstname: '  ', name: '', gender: '', birthday: null }), [
      'firstname',
      'lastname',
      'gender',
      'birthday',
    ])
  })
})

describe('describeTeamDataGaps', () => {
  it('flags a placeholder team name and too few members', () => {
    assert.equal(isPlaceholderTeamName(' TBD '), true)
    assert.equal(isPlaceholderTeamName('tdb'), true)
    const gaps = describeTeamDataGaps('tbd', [complete])
    assert.equal(gaps.placeholderName, true)
    assert.equal(gaps.tooFew, true)
    assert.deepEqual(gaps.players, [])
  })

  it('names the member whose birthday is missing', () => {
    const gaps = describeTeamDataGaps('RoboKids', [
      complete,
      { firstname: 'Max', name: 'Muster', gender: 'M', birthday: null },
    ])
    assert.equal(gaps.placeholderName, false)
    assert.equal(gaps.tooFew, false)
    assert.deepEqual(gaps.players, [{ index: 1, name: 'Max Muster', fields: ['birthday'] }])
  })

  it('is quiet when two members are complete', () => {
    const gaps = describeTeamDataGaps('RoboKids', [complete, { ...complete, firstname: 'Max' }])
    assert.equal(gaps.placeholderName, false)
    assert.equal(gaps.tooFew, false)
    assert.deepEqual(gaps.players, [])
  })
})
