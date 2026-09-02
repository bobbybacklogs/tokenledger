import { resolveTiers, tierMonthlyCost, tierRevenue } from './calculate.js'
import type {
  CreditPlan,
  CreditProjection,
  CreditResetCadence,
  CreditScenario,
  CreditTier,
  CreditTierProjection,
  LiveModel,
  Scenario,
  TierConfig,
} from './types.js'

const DEFAULT_CREDIT_VALUE_USD = 0.01
const DEFAULT_MULTIPLIER = 1
const DEFAULT_RESET: CreditResetCadence = 'monthly'
const DEFAULT_RESET_DAY = 1

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function parseAsOf(asOf?: string | Date): Date {
  if (asOf instanceof Date && Number.isFinite(asOf.getTime())) return new Date(asOf.getTime())
  if (typeof asOf === 'string' && asOf.trim()) {
    const parsed = new Date(asOf)
    if (Number.isFinite(parsed.getTime())) return parsed
  }
  return new Date()
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

/**
 * Next credit-reset instant (UTC midnight) after `asOf`.
 * - monthly: next occurrence of `resetDay` (1–28)
 * - weekly: next occurrence of weekday `resetDay` (0=Sun…6=Sat)
 * - never: null
 */
export function nextCreditReset(
  asOf: Date,
  reset: CreditResetCadence = DEFAULT_RESET,
  resetDay: number = DEFAULT_RESET_DAY,
): Date | null {
  const day = startOfUtcDay(asOf)
  if (reset === 'never') return null

  if (reset === 'weekly') {
    const target = clamp(Math.floor(resetDay), 0, 6)
    const current = day.getUTCDay()
    let delta = (target - current + 7) % 7
    if (delta === 0) delta = 7
    const next = new Date(day)
    next.setUTCDate(next.getUTCDate() + delta)
    return next
  }

  // monthly
  const target = clamp(Math.floor(resetDay), 1, 28)
  const y = day.getUTCFullYear()
  const m = day.getUTCMonth()
  const d = day.getUTCDate()
  if (d < target) return new Date(Date.UTC(y, m, target))
  // already on/after reset day this month → next month
  return new Date(Date.UTC(y, m + 1, target))
}

/** Whole UTC days from `asOf` until `nextReset` (0 if same day / past). */
export function daysUntilReset(asOf: Date, nextReset: Date | null): number | null {
  if (!nextReset) return null
  const a = startOfUtcDay(asOf).getTime()
  const b = startOfUtcDay(nextReset).getTime()
  return Math.max(0, Math.round((b - a) / 86_400_000))
}

/** Cycle length in days used for burn/day (monthly≈30, weekly=7). */
export function creditCycleDays(reset: CreditResetCadence = DEFAULT_RESET): number {
  if (reset === 'weekly') return 7
  if (reset === 'never') return 30
  return 30
}

export interface ResolvedCreditPlan {
  creditValueUsd: number
  modelMultiplier: number
  reset: CreditResetCadence
  resetDay: number
  asOf: Date
}

/** Normalize plan defaults. */
export function resolveCreditPlan(plan: CreditPlan = {}): ResolvedCreditPlan {
  const creditValueUsd =
    typeof plan.creditValueUsd === 'number' && plan.creditValueUsd > 0 ? plan.creditValueUsd : DEFAULT_CREDIT_VALUE_USD
  const modelMultiplier =
    typeof plan.modelMultiplier === 'number' && plan.modelMultiplier > 0 ? plan.modelMultiplier : DEFAULT_MULTIPLIER
  const reset = plan.reset ?? DEFAULT_RESET
  const resetDay =
    typeof plan.resetDay === 'number' && Number.isFinite(plan.resetDay) ? plan.resetDay : DEFAULT_RESET_DAY
  return { creditValueUsd, modelMultiplier, reset, resetDay, asOf: parseAsOf(plan.asOf) }
}

/**
 * Convert USD of model spend into credits.
 * `credits = (spendUsd × modelMultiplier) / creditValueUsd`
 */
export function usdToCredits(spendUsd: number, plan: Pick<ResolvedCreditPlan, 'creditValueUsd' | 'modelMultiplier'>): number {
  const spend = Math.max(0, spendUsd)
  if (plan.creditValueUsd <= 0) return 0
  return (spend * plan.modelMultiplier) / plan.creditValueUsd
}

/** Convert credits back to USD at the plan's credit value (ignores multiplier). */
export function creditsToUsd(credits: number, creditValueUsd: number): number {
  return Math.max(0, credits) * Math.max(0, creditValueUsd)
}

/**
 * Overage USD for credits past the included pool.
 * - `overagePerCredit` set → credits × rate (capped by budget when present)
 * - else bill at underlying list USD for those credits (capped by budget)
 * - budget 0 / missing with no rate → $0 overage (hard stop for planning)
 */
export function overageSpendUsd(opts: {
  overageCredits: number
  listSpendUsd: number
  creditsUsed: number
  creditsIncluded: number
  creditValueUsd: number
  overageBudgetUsd?: number
  overagePerCredit?: number
}): number {
  const overageCredits = Math.max(0, opts.overageCredits)
  if (overageCredits <= 0) return 0

  const budget =
    typeof opts.overageBudgetUsd === 'number' && Number.isFinite(opts.overageBudgetUsd)
      ? Math.max(0, opts.overageBudgetUsd)
      : undefined
  const rate =
    typeof opts.overagePerCredit === 'number' && Number.isFinite(opts.overagePerCredit)
      ? Math.max(0, opts.overagePerCredit)
      : undefined

  let spend: number
  if (rate !== undefined) {
    spend = overageCredits * rate
  } else if (opts.creditsUsed > 0) {
    // Pro-rate list USD across overage credits.
    spend = opts.listSpendUsd * (overageCredits / opts.creditsUsed)
  } else {
    spend = creditsToUsd(overageCredits, opts.creditValueUsd)
  }

  if (budget === undefined) {
    // No budget + no explicit rate → treat as hard stop (no billed overage).
    if (rate === undefined) return 0
    return round2(spend)
  }
  if (budget <= 0) return 0
  return round2(Math.min(spend, budget))
}

function asCreditTier(tier: TierConfig): CreditTier {
  const base = tier as CreditTier
  return {
    ...tier,
    creditsIncluded: Math.max(0, base.creditsIncluded ?? 0),
    ...(base.overageBudgetUsd !== undefined ? { overageBudgetUsd: base.overageBudgetUsd } : {}),
    ...(base.overagePerCredit !== undefined ? { overagePerCredit: base.overagePerCredit } : {}),
  }
}

/** Per-user list AI spend for a tier + model (token lane). */
export function tierListSpendPerUser(tier: TierConfig, model: LiveModel): number {
  const users = Math.max(0, tier.users)
  if (users <= 0) return tierMonthlyCost({ ...tier, users: 1 }, model)
  return tierMonthlyCost(tier, model) / users
}

/** Project one credit tier. */
export function creditTierProjection(
  tier: CreditTier,
  model: LiveModel,
  plan: ResolvedCreditPlan,
): CreditTierProjection {
  const users = Math.max(0, tier.users)
  const revenue = tierRevenue(tier)
  const listSpendUsd = round2(tierMonthlyCost(tier, model))
  const creditsUsed = round2(usdToCredits(listSpendUsd, plan))
  const creditsIncluded = round2(users * Math.max(0, tier.creditsIncluded ?? 0))
  const creditsRemaining = round2(Math.max(0, creditsIncluded - creditsUsed))
  const overageCredits = round2(Math.max(0, creditsUsed - creditsIncluded))
  // overageBudgetUsd is per user; scale to the whole tier.
  const tierBudget =
    typeof tier.overageBudgetUsd === 'number' && Number.isFinite(tier.overageBudgetUsd)
      ? Math.max(0, tier.overageBudgetUsd) * users
      : undefined
  const overage = overageSpendUsd({
    overageCredits,
    listSpendUsd,
    creditsUsed,
    creditsIncluded,
    creditValueUsd: plan.creditValueUsd,
    overageBudgetUsd: tierBudget,
    overagePerCredit: tier.overagePerCredit,
  })

  const creditUtilization = creditsIncluded > 0 ? (creditsUsed / creditsIncluded) * 100 : creditsUsed > 0 ? 999 : 0

  return {
    tier,
    users,
    revenue,
    listSpendUsd,
    creditsUsed,
    creditsIncluded,
    creditsRemaining,
    overageCredits,
    overageSpendUsd: overage,
    effectiveSpendUsd: overage,
    creditUtilization: round1(clamp(creditUtilization, 0, 999)),
    exhausted: overageCredits > 0,
  }
}

/**
 * Full credit-plan projection: included credits, burn from model list cost,
 * optional overage, and reset timing.
 */
export function calculateCreditScenario(scenario: CreditScenario, model: LiveModel): CreditProjection {
  const plan = resolveCreditPlan(scenario.plan)
  const base: Scenario = { name: scenario.name, model: scenario.model, users: scenario.users, tiers: scenario.tiers }
  const tiers = resolveTiers(base).map(asCreditTier)
  const perTier = tiers.map((tier) => creditTierProjection(tier, model, plan))

  const users = perTier.reduce((sum, row) => sum + row.users, 0)
  const revenue = perTier.reduce((sum, row) => sum + row.revenue, 0)
  const listSpendUsd = round2(perTier.reduce((sum, row) => sum + row.listSpendUsd, 0))
  const creditsUsed = round2(perTier.reduce((sum, row) => sum + row.creditsUsed, 0))
  const creditsIncluded = round2(perTier.reduce((sum, row) => sum + row.creditsIncluded, 0))
  const creditsRemaining = round2(perTier.reduce((sum, row) => sum + row.creditsRemaining, 0))
  const overageCredits = round2(perTier.reduce((sum, row) => sum + row.overageCredits, 0))
  const overageSpendUsd = round2(perTier.reduce((sum, row) => sum + row.overageSpendUsd, 0))
  const effectiveSpendUsd = overageSpendUsd
  const margin = revenue > 0 ? ((revenue - effectiveSpendUsd) / revenue) * 100 : 0

  const nextReset = nextCreditReset(plan.asOf, plan.reset, plan.resetDay)
  const days = daysUntilReset(plan.asOf, nextReset)
  const cycle = creditCycleDays(plan.reset)
  const burnPerDay = cycle > 0 ? round2(creditsUsed / cycle) : 0

  return {
    scenario: { ...scenario, tiers },
    model,
    plan: {
      creditValueUsd: plan.creditValueUsd,
      modelMultiplier: plan.modelMultiplier,
      reset: plan.reset,
      resetDay: plan.resetDay,
      asOf: plan.asOf.toISOString(),
    },
    users,
    revenue,
    listSpendUsd,
    creditsUsed,
    creditsIncluded,
    creditsRemaining,
    overageCredits,
    overageSpendUsd,
    effectiveSpendUsd,
    margin,
    daysToReset: days,
    nextResetAt: nextReset ? nextReset.toISOString() : null,
    burnPerDay,
    perTier,
  }
}

/** Bundled starter credit-plan scenario (Growth plan + included credits). */
export function defaultCreditScenario(): CreditScenario {
  return {
    name: 'Credits plan',
    model: 'openai/gpt-4o-mini',
    users: 12_000,
    plan: {
      creditValueUsd: 0.01,
      modelMultiplier: 1,
      reset: 'monthly',
      resetDay: 1,
    },
    tiers: [
      {
        name: 'Free',
        users: 8_000,
        price: 0,
        input: 18_000,
        output: 6_000,
        quota: 25_000,
        cacheHit: 0,
        creditsIncluded: 50,
        overageBudgetUsd: 0,
      },
      {
        name: 'Pro',
        users: 3_200,
        price: 29,
        input: 120_000,
        output: 40_000,
        quota: 250_000,
        cacheHit: 40,
        creditsIncluded: 500,
        overageBudgetUsd: 10,
        overagePerCredit: 0.015,
      },
      {
        name: 'Business',
        users: 800,
        price: 99,
        input: 420_000,
        output: 140_000,
        quota: 1_000_000,
        cacheHit: 60,
        creditsIncluded: 2_000,
        overageBudgetUsd: 50,
        overagePerCredit: 0.012,
      },
    ],
  }
}
