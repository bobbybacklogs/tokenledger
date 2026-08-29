import type { LiveModel, Projection, Scenario, TierConfig, TierProjection } from './types.js'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** Monthly AI cost for a single tier given a model. */
export function tierMonthlyCost(tier: TierConfig, model: LiveModel): number {
  const tokens = (tier.input / 1_000_000) * model.input + (tier.output / 1_000_000) * model.output
  return Math.max(0, tier.users) * tokens
}

/**
 * Monthly image-generation cost for a single tier:
 * `users × images-per-user × price-per-image`.
 */
export function imageTierMonthlyCost(tier: TierConfig, model: LiveModel): number {
  const images = Math.max(0, tier.images ?? 0)
  const rate = Math.max(0, model.image ?? 0)
  return Math.max(0, tier.users) * images * rate
}

/** Total images generated across all tiers in a month. */
export function monthlyImages(tiers: readonly TierConfig[]): number {
  return tiers.reduce((sum, tier) => sum + Math.max(0, tier.users) * Math.max(0, tier.images ?? 0), 0)
}

/** Monthly subscription revenue for a tier. */
export function tierRevenue(tier: TierConfig): number {
  return Math.max(0, tier.users) * Math.max(0, tier.price)
}

/** Compute per-tier projection metrics for a model. */
export function tierProjection(tier: TierConfig, model: LiveModel): TierProjection {
  const revenue = tierRevenue(tier)
  const monthlyCost = tierMonthlyCost(tier, model)
  const costPerUser = tier.users > 0 ? monthlyCost / tier.users : 0
  const margin = tier.price > 0 ? ((tier.price - costPerUser) / tier.price) * 100 : null
  const quotaUtilization = tier.quota > 0 ? ((tier.input + tier.output) / tier.quota) * 100 : 0

  return {
    tier,
    revenue,
    monthlyCost,
    costPerUser,
    margin: margin === null ? null : Math.round(margin * 10) / 10,
    quotaUtilization: Math.round(clamp(quotaUtilization, 0, 999) * 10) / 10,
  }
}

/** Compute per-tier image-lane projection metrics for an image-capable model. */
export function imageTierProjection(tier: TierConfig, model: LiveModel): TierProjection {
  const revenue = tierRevenue(tier)
  const monthlyCost = imageTierMonthlyCost(tier, model)
  const costPerUser = tier.users > 0 ? monthlyCost / tier.users : 0
  const margin = tier.price > 0 ? ((tier.price - costPerUser) / tier.price) * 100 : null

  return {
    tier,
    revenue,
    monthlyCost,
    costPerUser,
    margin: margin === null ? null : Math.round(margin * 10) / 10,
  }
}

/** Scale per-tier user counts proportionally to hit a target total. */
export function scaleUsersPerTier(tiers: readonly TierConfig[], targetUsers: number): TierConfig[] {
  const current = tiers.reduce((sum, tier) => sum + Math.max(0, tier.users), 0)
  const target = Math.max(0, targetUsers)
  if (current === 0) return tiers.map((tier) => ({ ...tier, users: 0 }))
  const scale = target / current
  return tiers.map((tier) => ({ ...tier, users: Math.round(Math.max(0, tier.users) * scale) }))
}

/** Resolve a scenario's tiers, applying the optional total-user scaling. */
export function resolveTiers(scenario: Scenario): TierConfig[] {
  return scenario.users === undefined || scenario.users === null
    ? scenario.tiers
    : scaleUsersPerTier(scenario.tiers, scenario.users)
}

/** Compute a full projection for a scenario + model. */
export function calculateScenario(scenario: Scenario, model: LiveModel): Projection {
  const tiers = resolveTiers(scenario)
  const perTier = tiers.map((tier) => tierProjection(tier, model))
  const users = tiers.reduce((sum, tier) => sum + Math.max(0, tier.users), 0)
  const spend = perTier.reduce((sum, tier) => sum + tier.monthlyCost, 0)
  const revenue = perTier.reduce((sum, tier) => sum + tier.revenue, 0)
  const weightedCost = users > 0 ? spend / users : 0
  const margin = revenue > 0 ? ((revenue - spend) / revenue) * 100 : 0

  return {
    scenario: { ...scenario, tiers },
    model,
    users,
    spend,
    revenue,
    weightedCost,
    margin,
    perTier,
  }
}

/**
 * Compute a full image-lane projection for a scenario + image model. The
 * result shape matches `calculateScenario` (`spend` is image spend, per-tier
 * `monthlyCost` is image cost); `quotaUtilization` is omitted per tier.
 */
export function calculateImageScenario(scenario: Scenario, model: LiveModel): Projection {
  const tiers = resolveTiers(scenario)
  const perTier = tiers.map((tier) => imageTierProjection(tier, model))
  const users = tiers.reduce((sum, tier) => sum + Math.max(0, tier.users), 0)
  const spend = perTier.reduce((sum, tier) => sum + tier.monthlyCost, 0)
  const revenue = perTier.reduce((sum, tier) => sum + tier.revenue, 0)
  const weightedCost = users > 0 ? spend / users : 0
  const margin = revenue > 0 ? ((revenue - spend) / revenue) * 100 : 0

  return {
    scenario: { ...scenario, tiers },
    model,
    users,
    spend,
    revenue,
    weightedCost,
    margin,
    perTier,
  }
}

/** The bundled starter scenario (matches the original seeded planner). */
export function defaultScenario(): Scenario {
  return {
    name: 'Growth plan',
    model: 'openai/gpt-4o-mini',
    users: 12_000,
    tiers: [
      { name: 'Free', users: 8_000, price: 0, input: 18_000, output: 6_000, quota: 25_000 },
      { name: 'Pro', users: 3_200, price: 29, input: 120_000, output: 40_000, quota: 250_000 },
      { name: 'Business', users: 800, price: 99, input: 420_000, output: 140_000, quota: 1_000_000 },
    ],
  }
}

/**
 * The bundled starter image-lane scenario: same tiers/user split as
 * `defaultScenario`, but each tier carries images-per-user instead of tokens.
 */
export function defaultImageScenario(): Scenario {
  return {
    name: 'Image lane',
    model: 'openai/gpt-5-image',
    users: 12_000,
    tiers: [
      { name: 'Free', users: 8_000, price: 0, input: 0, output: 0, quota: 0, images: 5 },
      { name: 'Pro', users: 3_200, price: 29, input: 0, output: 0, quota: 0, images: 100 },
      { name: 'Business', users: 800, price: 99, input: 0, output: 0, quota: 0, images: 500 },
    ],
  }
}