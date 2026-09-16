import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { eventLinkMap } from './publicEventLinks.js'

describe('eventLinkMap', () => {
  it('maps every draht id of an event to the same link', () => {
    const links = eventLinkMap([
      { event_id: 1, url: 'https://handson.tools/aachen', draht_ids: [1001, 1002] },
      { event_id: 2, url: 'https://handson.tools/2025/koeln', draht_ids: [1003] },
    ])

    assert.equal(links.get(1001), 'https://handson.tools/aachen')
    assert.equal(links.get(1002), 'https://handson.tools/aachen')
    assert.equal(links.get(1003), 'https://handson.tools/2025/koeln')
    assert.equal(links.size, 3)
  })

  it('ignores entries without a link or without ids', () => {
    const links = eventLinkMap([
      { event_id: 1, url: '   ', draht_ids: [1001] },
      { event_id: 2, url: 'https://handson.tools/koeln' },
      { event_id: 3, url: 'https://handson.tools/bonn', draht_ids: [] },
    ])

    assert.equal(links.size, 0)
  })

  it('answers empty for a payload that is not a list', () => {
    assert.equal(eventLinkMap(undefined).size, 0)
    assert.equal(eventLinkMap(null).size, 0)
    assert.equal(eventLinkMap({ url: 'https://handson.tools/aachen' }).size, 0)
  })
})
