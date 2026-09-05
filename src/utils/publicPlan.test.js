import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { hasPublicPlan, publicPlanBase, publicPlanUrl } from './publicPlan.js'

describe('publicPlanBase', () => {
  it('falls back to the vanity host', () => {
    assert.equal(publicPlanBase(), 'https://handson.tools')
  })
})

describe('publicPlanUrl', () => {
  it('builds the url from a bare slug', () => {
    assert.equal(publicPlanUrl({ slug: 'aachen' }), 'https://handson.tools/aachen')
  })

  it('keeps the season prefix of an archive path', () => {
    assert.equal(publicPlanUrl({ plan_path: '/2025/aachen' }), 'https://handson.tools/2025/aachen')
  })

  it('passes an absolute url through unchanged', () => {
    assert.equal(
      publicPlanUrl({ planlink: 'https://handson.tools/quali-koeln' }),
      'https://handson.tools/quali-koeln',
    )
  })

  it('prefers the more specific field', () => {
    assert.equal(
      publicPlanUrl({ slug: 'aachen', planlink: 'https://handson.tools/2025/aachen' }),
      'https://handson.tools/2025/aachen',
    )
  })

  it('returns empty for events without a schedule reference', () => {
    assert.equal(publicPlanUrl({ id: 7, label: 'Aachen' }), '')
    assert.equal(publicPlanUrl({ slug: '   ' }), '')
    assert.equal(publicPlanUrl(null), '')
    assert.equal(publicPlanUrl(undefined), '')
  })

  it('rejects values that are not a plain slug, path or http url', () => {
    assert.equal(publicPlanUrl({ slug: 'javascript:alert(1)' }), '')
    assert.equal(publicPlanUrl({ slug: 'two words' }), '')
  })
})

describe('hasPublicPlan', () => {
  it('reports whether a link can be built', () => {
    assert.equal(hasPublicPlan({ slug: 'aachen' }), true)
    assert.equal(hasPublicPlan({ id: 7 }), false)
  })
})
