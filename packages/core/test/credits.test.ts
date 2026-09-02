import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  calculateCreditScenario,
  creditsToUsd,
  daysUntilReset,
  defaultCreditScenario,
  nextCreditReset,
  overageSpendUsd,
  resolveCreditPlan,
  usdToCredits,
  type LiveModel,
} from '../dist/index.js'

const MINI: LiveModel = {
  id: 'openai/gpt-4o-mini',
  name: 'GPT-4o mini',
  provider: 'OpenAI',
  input: 0.15,
  output: 0.6,
  context: 128_000,
}

describe('usdToCredits / creditsToUsd', () => {
  it('converts at the plan credit value and multiplier', () => {
    assert.equal(usdToCredits(1, { creditValueUsd: 0.01, modelMultiplier: 1 }), 100)
    assert.equal(usdToCredits(1, { creditValueUsd: 0.01, modelMultiplier: 2 }), 200)
    assert.equal(creditsToUsd(100, 0.01), 1)
  })
})

describe('nextCreditReset', () => {
  it('finds the next monthly reset day', () => {
    const asOf = new Date('2026-09-02T12:00:00.000Z')
    const next = nextCreditReset(asOf, 'monthly', 1)!
    assert.equal(next.toISOString(), '2026-10-01T00:00:00.000Z')
    assert.equal(daysUntilReset(asOf, next), 29)
  })

  it('finds the next weekly reset weekday', () => {
    // 2026-09-02 is Wednesday (3). Next Sunday (0) is 2026-09-06.
    const asOf = new Date('2026-09-02T12:00:00.000Z')
    const next = nextCreditReset(asOf, 'weekly', 0)!
    assert.equal(next.toISOString(), '2026-09-06T00:00:00.000Z')
    assert.equal(daysUntilReset(asOf, next), 4)
  })

  it('returns null when reset is never', () => {
    assert.equal(nextCreditReset(new Date(), 'never'), null)
    assert.equal(daysUntilReset(new Date(), null), null)
  })
})

describe('overageSpendUsd', () => {
  it('returns 0 when there is no overage', () => {
    assert.equal(
      overageSpendUsd({
        overageCredits: 0,
        listSpendUsd: 10,
        creditsUsed: 100,
        creditsIncluded: 100,
        creditValueUsd: 0.01,
        overagePerCredit: 0.02,
      }),
      0,
    )
  })

  it('bills overage at overagePerCredit and caps by budget', () => {
    assert.equal(
      overageSpendUsd({
        overageCredits: 100,
        listSpendUsd: 5,
        creditsUsed: 200,
        creditsIncluded: 100,
        creditValueUsd: 0.01,
        overagePerCredit: 0.02,
        overageBudgetUsd: 1,
      }),
      1,
    )
  })

  it('hard-stops (0 overage) when no rate and no positive budget', () => {
    assert.equal(
      overageSpendUsd({
        overageCredits: 50,
        listSpendUsd: 10,
        creditsUsed: 150,
        creditsIncluded: 100,
        creditValueUsd: 0.01,
        overageBudgetUsd: 0,
      }),
      0,
    )
  })
})

describe('calculateCreditScenario', () => {
  it('projects included credits, burn, and overage for a single tier', () => {
    // 1000 users × (100k in @ 0.15 + 0 out) / 1M = $15 list spend
    // @ $0.01/credit → 1500 credits used; 1000 included → 500 overage
    // overage @ $0.02/credit = $10, budget $5/user × 1000 = $5000 → $10
    const result = calculateCreditScenario(
      {
        name: 'Test',
        model: 'openai/gpt-4o-mini',
        plan: { creditValueUsd: 0.01, modelMultiplier: 1, reset: 'monthly', resetDay: 1, asOf: '2026-09-02T00:00:00.000Z' },
        tiers: [
          {
            name: 'Pro',
            users: 1_000,
            price: 29,
            input: 100_000,
            output: 0,
            quota: 250_000,
            creditsIncluded: 1,
            overageBudgetUsd: 5,
            overagePerCredit: 0.02,
          },
        ],
      },
      MINI,
    )

    assert.equal(result.users, 1_000)
    assert.equal(result.listSpendUsd, 15)
    assert.equal(result.creditsUsed, 1500)
    assert.equal(result.creditsIncluded, 1000)
    assert.equal(result.overageCredits, 500)
    assert.equal(result.overageSpendUsd, 10)
    assert.equal(result.effectiveSpendUsd, 10)
    assert.equal(result.daysToReset, 29)
    assert.ok(result.perTier[0]!.exhausted)
  })

  it('defaultCreditScenario is internally consistent', () => {
    const scenario = defaultCreditScenario()
    const plan = resolveCreditPlan(scenario.plan)
    assert.equal(plan.creditValueUsd, 0.01)
    assert.equal(scenario.tiers.length, 3)
    const result = calculateCreditScenario(scenario, MINI)
    assert.equal(result.users, 12_000)
    assert.ok(result.creditsIncluded > 0)
    assert.ok(result.listSpendUsd > 0)
  })
})
