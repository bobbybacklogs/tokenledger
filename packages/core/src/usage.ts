/**
 * A business-friendly "usage" model that derives raw token budgets from two
 * things a product owner actually knows:
 *   - how many requests (messages) a user makes per month, and
 *   - how a typical interaction feels (a short set of plain-English presets).
 *
 * This replaces the need to know raw input/output token counts or quotas.
 * Two input levels share one engine:
 *   NORMAL   users, requests/user/month, interaction size, price
 *   ADVANCED input tokens, output tokens, quota  (the resolved TierConfig)
 */

export type PresetSize = 'short' | 'medium' | 'long' | 'heavy'

export type ExchangeSize = PresetSize | 'custom'

export interface ExchangePreset {
  label: string
  description: string
  /** Average input tokens per exchange. */
  input: number
  /** Average output tokens per exchange. */
  output: number
}

/** Average per-exchange token counts for the friendly presets. */
export const EXCHANGE_PRESETS: Record<PresetSize, ExchangePreset> = {
  short: { label: 'Short', description: 'quick answers / classifications', input: 150, output: 300 },
  medium: { label: 'Medium', description: 'typical assistant response', input: 400, output: 800 },
  long: { label: 'Long', description: 'detailed generation / analysis', input: 1000, output: 2000 },
  heavy: { label: 'Heavy', description: 'large-context or code-heavy work', input: 2500, output: 5000 },
}

/** The friendly presets in ascending size order. */
export const PRESET_SIZES: readonly PresetSize[] = ['short', 'medium', 'long', 'heavy']

/** All exchange sizes a caller can pick, presets plus a Custom option. */
export const EXCHANGE_SIZES: readonly ExchangeSize[] = [...PRESET_SIZES, 'custom']

/**
 * The token assumption for an exchange size. Returns `undefined` for
 * `'custom'` (the caller supplies per-exchange tokens instead).
 */
export function presetEstimate(size: ExchangeSize): ExchangePreset | undefined {
  if (size === 'custom') return undefined
  return EXCHANGE_PRESETS[size]
}

export interface UsageInput {
  /** Number of requests (messages) a user makes per month. */
  requestsPerUserPerMonth: number
  exchangeSize: ExchangeSize
  /** For `'custom'`: average input tokens per exchange (required). */
  inputTokensPerExchange?: number
  /** For `'custom'`: average output tokens per exchange (required). */
  outputTokensPerExchange?: number
  /** Monthly quota is set as this multiple of computed tokens (default 1.5). */
  quotaBuffer?: number
}

export interface UsageResult {
  /** Input tokens per user per month. */
  input: number
  /** Output tokens per user per month. */
  output: number
  /** Monthly token quota per user (a buffer above the estimate). */
  quota: number
}

/**
 * Derive per-user monthly token budgets from requests/month and an exchange
 * size. For `'custom'`, `inputTokensPerExchange` and `outputTokensPerExchange`
 * are required.
 */
export function tierFromUsage(usage: UsageInput): UsageResult {
  let perExchange: { input: number; output: number }
  if (usage.exchangeSize === 'custom') {
    const input = usage.inputTokensPerExchange
    const output = usage.outputTokensPerExchange
    if (input === undefined || output === undefined) {
      throw new Error(
        'tierFromUsage: custom exchange size requires inputTokensPerExchange and outputTokensPerExchange',
      )
    }
    perExchange = { input, output }
  } else {
    perExchange = EXCHANGE_PRESETS[usage.exchangeSize]
  }

  const input = usage.requestsPerUserPerMonth * perExchange.input
  const output = usage.requestsPerUserPerMonth * perExchange.output
  const quota = Math.round((input + output) * (usage.quotaBuffer ?? 1.5))
  return { input, output, quota }
}
