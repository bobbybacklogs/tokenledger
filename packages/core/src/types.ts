/**
 * Public types for TokenLedger.
 */

/** A normalized model with pricing expressed in USD per 1 million tokens. */
export interface LiveModel {
  /** Stable identifier, e.g. `openai/gpt-4o-mini`. */
  id: string
  /** Human-friendly display name. */
  name: string
  /** Provider display name derived from the id namespace. */
  provider: string
  /** Input price in USD per 1,000,000 tokens. */
  input: number
  /** Output (completion) price in USD per 1,000,000 tokens. */
  output: number
  /** Maximum context length in tokens; `0` when unknown. */
  context: number
  /**
   * Price per generated (output) image in USD. Present only for
   * image-capable models; drives the image lane (`users × images × rate`).
   */
  image?: number
  /**
   * Cache-read (prompt-cache hit) price in USD per 1,000,000 tokens.
   * When set, the token lane can apply a cache-hit rate to input tokens.
   */
  cacheRead?: number
  /**
   * Cache-write (prompt-cache fill) price in USD per 1,000,000 tokens.
   * Informational; the cache-hit projection uses `cacheRead`.
   */
  cacheWrite?: number
  /**
   * Price per second of generated video in USD. Present only for
   * video-capable models; drives the video lane (`users × seconds × rate`).
   */
  video?: number
  /** Model modality label from OpenRouter, e.g. `text+image->text+image`. */
  modality?: string
  /** Short note on the model's best use case (offline catalog only). */
  best?: string
  /** True when this entry comes from the bundled offline estimate catalog. */
  estimate?: boolean
}

/** A customer tier (subscription plan) used by a scenario. */
export interface TierConfig {
  /** Tier display name, e.g. "Pro". */
  name: string
  /** Number of users in this tier. */
  users: number
  /** Monthly subscription price per user in USD. */
  price: number
  /** Average input tokens consumed per user, per month. */
  input: number
  /** Average output tokens consumed per user, per month. */
  output: number
  /** Monthly token quota per user for this tier. */
  quota: number
  /** Average images generated per user, per month (image lane). */
  images?: number
  /**
   * Share of input tokens served from prompt cache, 0–100. Applied by the
   * token lane when the model publishes `cacheRead`.
   */
  cacheHit?: number
  /** Average embedding tokens consumed per user, per month (embeddings lane). */
  embedTokens?: number
  /** Average generated-video seconds per user, per month (video lane). */
  videoSeconds?: number
}

/** A whole modeling scenario: which model, which tiers, and an optional total user count. */
export interface Scenario {
  /** Scenario name. */
  name: string
  /** Model id (OpenRouter-style, e.g. `openai/gpt-4o-mini`). */
  model: string
  /**
   * Optional total user count. When set, per-tier user counts are scaled
   * proportionally to match this total (like the web planner's user slider).
   */
  users?: number
  /** The tiers that make up this scenario. */
  tiers: TierConfig[]
}

/** Per-tier results for a projection. */
export interface TierProjection {
  tier: TierConfig
  /** Monthly subscription revenue for the tier. */
  revenue: number
  /** Monthly AI cost for the tier. */
  monthlyCost: number
  /** AI cost per user per month for the tier. */
  costPerUser: number
  /** Gross margin percent; `null` when the tier has no subscription price. */
  margin: number | null
  /**
   * Share of the monthly token quota consumed per user, as a percentage.
   * Only meaningful for the token lane; absent for image-lane projections.
   */
  quotaUtilization?: number
}

/** Full projection results for a scenario + model. */
export interface Projection {
  scenario: Scenario
  model: LiveModel
  /** Total users across all tiers. */
  users: number
  /** Total monthly AI spend. */
  spend: number
  /** Total monthly subscription revenue. */
  revenue: number
  /** Blended AI cost per user. */
  weightedCost: number
  /** Gross margin percent across the whole scenario. */
  margin: number
  perTier: TierProjection[]
}

/** Where a model list came from. */
export type PricingSource = 'live' | 'modelsdev' | 'github' | 'vercel' | 'offline'

/** A model list plus provenance metadata. */
export interface ModelList {
  source: PricingSource
  /**
   * ISO timestamp of when the live feed was fetched; `null` for the offline
   * catalog.
   */
  fetchedAt: string | null
  models: LiveModel[]
}

/** How included credits reset. */
export type CreditResetCadence = 'monthly' | 'weekly' | 'never'

/**
 * Billing-cycle policy for included credits. Credits are an abstract unit
 * derived from AI spend (`credits = spendUsd / creditValueUsd`).
 */
export interface CreditPlan {
  /**
   * USD value of one credit. Default `$0.01` (100 credits = $1 of model cost).
   * Lower = more credits per dollar; higher = fewer.
   */
  creditValueUsd?: number
  /**
   * Optional per-model burn multiplier (1 = normal). Use >1 for premium models
   * that should consume credits faster than list USD cost implies.
   */
  modelMultiplier?: number
  /** When included credits reset. Default `monthly`. */
  reset?: CreditResetCadence
  /**
   * Day of month (1–28) for monthly reset, or day of week (0=Sun…6=Sat) for
   * weekly. Default 1 (1st of month / Sunday).
   */
  resetDay?: number
  /**
   * Optional "as of" date for remaining-cycle math (ISO date or Date).
   * Defaults to now.
   */
  asOf?: string | Date
}

/** Per-tier credit allowance and optional overage rules. */
export interface CreditTierConfig {
  /** Credits included per user, per billing cycle. */
  creditsIncluded: number
  /**
   * Optional hard overage budget in USD per user per cycle after credits are
   * exhausted. `0` / omitted = no paid overage (hard stop at included credits
   * for planning — usage above is reported but not billed).
   */
  overageBudgetUsd?: number
  /**
   * Optional USD charged per credit once included credits are gone.
   * When set with a budget, overage spend is min(overageCredits × rate, budget).
   * When set without a budget, overage is uncapped at this rate.
   * When omitted, overage is billed at the underlying model USD cost.
   */
  overagePerCredit?: number
}

/** A scenario tier with optional credit-plan fields. */
export type CreditTier = TierConfig & CreditTierConfig

/** Full credit-plan scenario (tiers carry included credits + overage rules). */
export interface CreditScenario {
  name: string
  model: string
  users?: number
  tiers: CreditTier[]
  plan?: CreditPlan
}

/** Per-tier credit projection. */
export interface CreditTierProjection {
  tier: CreditTier
  /** Users in this tier after optional scaling. */
  users: number
  /** Subscription revenue for the tier. */
  revenue: number
  /** Gross AI spend in USD if there were no credit caps (list cost). */
  listSpendUsd: number
  /** Credits burned by list spend (after model multiplier). */
  creditsUsed: number
  /** Included credits granted this cycle (per user × users). */
  creditsIncluded: number
  /** Credits still unused this cycle (floor 0). */
  creditsRemaining: number
  /** Credits beyond the included pool. */
  overageCredits: number
  /** USD charged for overage this cycle. */
  overageSpendUsd: number
  /** Effective AI cost this cycle: overage only (included credits are prepaid). */
  effectiveSpendUsd: number
  /** Share of included credits consumed, 0–100+. */
  creditUtilization: number
  /** True when usage exceeds included credits. */
  exhausted: boolean
}

/** Full credit-plan projection. */
export interface CreditProjection {
  scenario: CreditScenario
  model: LiveModel
  plan: Required<Pick<CreditPlan, 'creditValueUsd' | 'modelMultiplier' | 'reset' | 'resetDay'>> & {
    asOf: string
  }
  users: number
  /** Subscription revenue. */
  revenue: number
  /** Uncapped list AI spend in USD. */
  listSpendUsd: number
  /** Credits burned across all tiers. */
  creditsUsed: number
  /** Included credits granted. */
  creditsIncluded: number
  /** Credits still available. */
  creditsRemaining: number
  /** Credits past the included pool. */
  overageCredits: number
  /** USD overage charges. */
  overageSpendUsd: number
  /** Effective AI cost (overage); included credits treated as prepaid. */
  effectiveSpendUsd: number
  /** Gross margin using effective AI cost: (revenue − effective) / revenue. */
  margin: number
  /** Days until the next credit reset from `plan.asOf`. `null` when never. */
  daysToReset: number | null
  /** Next reset instant (ISO), or `null` when never. */
  nextResetAt: string | null
  /** Average credits burned per day over the current cycle length. */
  burnPerDay: number
  perTier: CreditTierProjection[]
}