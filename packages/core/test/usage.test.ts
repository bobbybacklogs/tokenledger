import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { EXCHANGE_PRESETS, PRESET_SIZES, presetEstimate, tierFromUsage } from '../dist/index.js'

describe('tierFromUsage', () => {
  it('derives tokens from requests/month and exchange size', () => {
    const result = tierFromUsage({ requestsPerUserPerMonth: 100, exchangeSize: 'medium' })
    // medium = 400 input / 800 output per exchange
    assert.equal(result.input, 100 * 400)
    assert.equal(result.output, 100 * 800)
    // quota defaults to 1.5x the combined tokens
    assert.equal(result.quota, Math.round((100 * 400 + 100 * 800) * 1.5))
  })

  it('scales linearly with requests', () => {
    const low = tierFromUsage({ requestsPerUserPerMonth: 10, exchangeSize: 'short' })
    const high = tierFromUsage({ requestsPerUserPerMonth: 100, exchangeSize: 'short' })
    assert.equal(high.input, low.input * 10)
    assert.equal(high.output, low.output * 10)
  })

  it('applies a custom quota buffer', () => {
    const result = tierFromUsage({ requestsPerUserPerMonth: 100, exchangeSize: 'medium', quotaBuffer: 2 })
    assert.equal(result.quota, (100 * 400 + 100 * 800) * 2)
  })

  it('uses caller-supplied per-exchange tokens for custom', () => {
    const result = tierFromUsage({
      requestsPerUserPerMonth: 50,
      exchangeSize: 'custom',
      inputTokensPerExchange: 200,
      outputTokensPerExchange: 1000,
    })
    assert.equal(result.input, 50 * 200)
    assert.equal(result.output, 50 * 1000)
    assert.equal(result.quota, Math.round((50 * 200 + 50 * 1000) * 1.5))
  })

  it('throws for custom without per-exchange tokens', () => {
    assert.throws(
      () => tierFromUsage({ requestsPerUserPerMonth: 50, exchangeSize: 'custom' }),
      /inputTokensPerExchange/,
    )
  })

  it('covers every preset with positive tokens', () => {
    for (const size of PRESET_SIZES) {
      const estimate = EXCHANGE_PRESETS[size]
      const result = tierFromUsage({ requestsPerUserPerMonth: 1, exchangeSize: size })
      assert.ok(estimate.input > 0 && estimate.output > 0)
      assert.equal(result.input, estimate.input)
      assert.equal(result.output, estimate.output)
    }
  })

  it('exposes the preset assumption, and none for custom', () => {
    assert.equal(presetEstimate('heavy')!.input, EXCHANGE_PRESETS.heavy.input)
    assert.equal(presetEstimate('custom'), undefined)
  })
})
