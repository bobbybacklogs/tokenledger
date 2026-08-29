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
export type PricingSource = 'live' | 'offline'

/** A model list plus provenance metadata. */
export interface ModelList {
  source: PricingSource
  /** ISO timestamp of when the live feed was fetched; `null` for the offline catalog. */
  fetchedAt: string | null
  models: LiveModel[]
}