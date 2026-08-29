import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  calculateImageScenario,
  calculateScenario,
  defaultImageScenario,
  defaultScenario,
  imageTierMonthlyCost,
  imageTierProjection,
  monthlyImages,
  scaleUsersPerTier,
  tierMonthlyCost,
  tierProjection,
  type LiveModel,
  type Scenario,
} from '../dist/index.js'

const MINI: LiveModel = { id: 'openai/gpt-4o-mini', name: 'GPT-4o mini', provider: 'OpenAI', input: 0.15, output: 0.6, context: 128_000 }
const IMAGE: LiveModel = { id: 'openai/gpt-5-image', name: 'GPT-5 Image', provider: 'OpenAI', input: 10, output: 10, context: 400_000, image: 0.04 }

function scenario(): Scenario {
  return defaultScenario()
}

describe('calculateScenario', () => {
  it('computes tier costs for the default scenario with GPT-4o mini', () => {
    const result = calculateScenario(scenario(), MINI)
    // Free: 8000 * (18000/1M * 0.15 + 6000/1M * 0.6)
    assert.ok(Math.abs(result.perTier[0]!.monthlyCost - 50.4) < 1e-9)
    // Pro: 3200 * (120000/1M * 0.15 + 40000/1M * 0.6)
    assert.ok(Math.abs(result.perTier[1]!.monthlyCost - 134.4) < 1e-9)
    // Business: 800 * (420000/1M * 0.15 + 140000/1M * 0.6)
    assert.ok(Math.abs(result.perTier[2]!.monthlyCost - 117.6) < 1e-9)
    assert.ok(Math.abs(result.spend - 302.4) < 1e-9)
    assert.equal(result.users, 12_000)
  })

  it('computes revenue, blended cost, and margin', () => {
    const result = calculateScenario(scenario(), MINI)
    assert.equal(result.revenue, 3_200 * 29 + 800 * 99)
    assert.ok(Math.abs(result.weightedCost - result.spend / result.users) < 1e-9)
    const expectedMargin = ((result.revenue - result.spend) / result.revenue) * 100
    assert.ok(Math.abs(result.margin - expectedMargin) < 1e-9)
  })

  it('returns null margin for free tiers', () => {
    const result = calculateScenario(scenario(), MINI)
    assert.equal(result.perTier[0]!.margin, null)
    assert.ok(result.perTier[1]!.margin! > 90)
  })

  it('handles a $0 price tier and zero users without NaN', () => {
    const result = calculateScenario({ name: 'edge', model: 'openai/gpt-4o-mini', users: 0, tiers: [{ name: 'Free', users: 0, price: 0, input: 1, output: 1, quota: 100 }] }, MINI)
    assert.equal(result.users, 0)
    assert.equal(result.spend, 0)
    assert.equal(result.revenue, 0)
    assert.equal(result.margin, 0)
    assert.equal(Number.isNaN(result.weightedCost), false)
  })
})

describe('tier helpers', () => {
  it('tierMonthlyCost matches the documented formula', () => {
    const tier = { name: 'Pro', users: 1_000, price: 29, input: 100_000, output: 20_000, quota: 250_000 }
    const expected = 1_000 * (0.1 * 0.15 + 0.02 * 0.6)
    assert.ok(Math.abs(tierMonthlyCost(tier, MINI) - expected) < 1e-9)
  })

  it('tierProjection reports quota utilization', () => {
    const projection = tierProjection({ name: 'Pro', users: 1_000, price: 29, input: 100_000, output: 20_000, quota: 250_000 }, MINI)
    assert.equal(projection.quotaUtilization, ((100_000 + 20_000) / 250_000) * 100)
    // price > 0, cost/user = 0.1*0.15 + 0.02*0.6 = 0.027 -> margin ~99.9%
    assert.ok(projection.margin !== null && Math.abs(projection.margin - 99.9) < 0.2)
  })

  it('scaleUsersPerTier redistributes users to a new total', () => {
    const scaled = scaleUsersPerTier(defaultScenario().tiers, 60_000)
    const total = scaled.reduce((sum, tier) => sum + tier.users, 0)
    assert.equal(total, 60_000)
  })
})

describe('image lane', () => {
  it('imageTierMonthlyCost is users × images × price per image', () => {
    const tier = { name: 'Pro', users: 1_000, price: 29, input: 0, output: 0, quota: 0, images: 200 }
    assert.ok(Math.abs(imageTierMonthlyCost(tier, IMAGE) - 1_000 * 200 * 0.04) < 1e-9)
  })

  it('monthlyImages sums users × images across tiers', () => {
    const tiers = [
      { name: 'Free', users: 800, price: 0, input: 0, output: 0, quota: 0, images: 5 },
      { name: 'Pro', users: 200, price: 29, input: 0, output: 0, quota: 0, images: 100 },
    ]
    assert.equal(monthlyImages(tiers), 800 * 5 + 200 * 100)
  })

  it('imageTierProjection reports image cost per user and margin, no quota utilization', () => {
    const projection = imageTierProjection({ name: 'Pro', users: 1_000, price: 29, input: 0, output: 0, quota: 0, images: 200 }, IMAGE)
    assert.equal(projection.monthlyCost, 8_000)
    assert.equal(projection.costPerUser, 8)
    assert.equal(projection.quotaUtilization, undefined)
    assert.ok(projection.margin !== null && Math.abs(projection.margin - 72.4) < 0.2)
  })

  it('calculateImageScenario totals image spend', () => {
    const scenario: Scenario = {
      name: 'Image test',
      model: 'openai/gpt-5-image',
      tiers: [{ name: 'Pro', users: 1_000, price: 29, input: 0, output: 0, quota: 0, images: 200 }],
    }
    const result = calculateImageScenario(scenario, IMAGE)
    assert.equal(result.spend, 8_000)
    assert.equal(result.users, 1_000)
    assert.equal(result.weightedCost, 8)
  })

  it('gracefully handles missing image pricing or images', () => {
    const tier = { name: 'T', users: 100, price: 10, input: 0, output: 0, quota: 0 }
    assert.equal(imageTierMonthlyCost(tier, IMAGE), 0)
    assert.equal(imageTierMonthlyCost({ ...tier, images: 10 }, MINI), 0)
  })

  it('defaultImageScenario sets an image model and positive per-tier images', () => {
    const scenario = defaultImageScenario()
    assert.equal(scenario.model, 'openai/gpt-5-image')
    assert.ok(scenario.tiers.every((tier) => (tier.images ?? 0) > 0))
  })
})