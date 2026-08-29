/**
 * A business-friendly "usage" model that derives raw token budgets from two
 * things a product owner actually knows:
 *   - how many requests (messages) a user makes per month, and
 *   - how wordy a typical exchange is (a small set of presets).
 *
 * This replaces the need to know raw input/output token counts or quotas.
 */

export type ExchangeSize = 'brief' | 'standard' | 'detailed' | 'intensive'

export interface ExchangeEstimate {
  label: string
  description: string
  /** Average input tokens per exchange. */
  input: number
  /** Average output tokens per exchange. */
  output: number
}

/** Average token counts per exchange, per preset. */
export const EXCHANGE_ESTIMATES: Record<ExchangeSize, ExchangeEstimate> = {
  brief: { label: 'Brief', description: 'short Q&A — a sentence or two', input: 150, output: 300 },
  standard: { label: 'Standard', description: 'typical chat — a short paragraph each way', input: 400, output: 800 },
  detailed: { label: 'Detailed', description: 'longer answers, docs, deep dives', input: 1000, output: 2000 },
  intensive: { label: 'Intensive', description: 'heavy use — large documents, code, research', input: 2500, output: 5000 },
}

/** The ordered preset list, cheapest→heaviest. */
export const EXCHANGE_SIZES: readonly ExchangeSize[] = ['brief', 'standard', 'detailed', 'intensive']

export interface UsageInput {
  /** Number of requests (messages) a user makes per month. */
  requestsPerUserPerMonth: number
  /** How wordy a typical exchange is. */
  exchangeSize: ExchangeSize
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
 * size preset.
 */
export function tierFromUsage(usage: UsageInput): UsageResult {
  const estimate = EXCHANGE_ESTIMATES[usage.exchangeSize]
  const input = usage.requestsPerUserPerMonth * estimate.input
  const output = usage.requestsPerUserPerMonth * estimate.output
  const quota = Math.round((input + output) * (usage.quotaBuffer ?? 1.5))
  return { input, output, quota }
}
