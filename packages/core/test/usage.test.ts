import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { EXCHANGE_ESTIMATES, tierFromUsage } from '../dist/index.js'

describe('tierFromUsage', () => {
  it('derives tokens from requests/month and exchange size', () => {
    const result = tierFromUsage({ requestsPerUserPerMonth: 100, exchangeSize: 'standard' })
    // standard = 400 input / 800 output per exchange
    assert.equal(result.input, 100 * 400)
    assert.equal(result.output, 100 * 800)
    // quota defaults to 1.5x the combined tokens
    assert.equal(result.quota, Math.round((100 * 400 + 100 * 800) * 1.5))
  })

  it('scales linearly with requests', () => {
    const low = tierFromUsage({ requestsPerUserPerMonth: 10, exchangeSize: 'brief' })
    const high = tierFromUsage({ requestsPerUserPerMonth: 100, exchangeSize: 'brief' })
    assert.equal(high.input, low.input * 10)
    assert.equal(high.output, low.output * 10)
  })

  it('applies a custom quota buffer', () => {
    const result = tierFromUsage({ requestsPerUserPerMonth: 100, exchangeSize: 'standard', quotaBuffer: 2 })
    assert.equal(result.quota, (100 * 400 + 100 * 800) * 2)
  })

  it('covers every exchange size preset with positive tokens', () => {
    for (const size of ['brief', 'standard', 'detailed', 'intensive'] as const) {
      const estimate = EXCHANGE_ESTIMATES[size]
      const result = tierFromUsage({ requestsPerUserPerMonth: 1, exchangeSize: size })
      assert.ok(estimate.input > 0 && estimate.output > 0)
      assert.equal(result.input, estimate.input)
      assert.equal(result.output, estimate.output)
    }
  })
})
