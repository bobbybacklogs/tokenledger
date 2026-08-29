/** Format helpers shared by the browser app and the CLI. */

/** USD formatting: 2 decimals normally, 3 below a cent. */
export function money(value: number): string {
  if (!Number.isFinite(value)) return '$0.00'
  if (value === 0) return '$0.00'
  return value < 0.01 ? `$${value.toFixed(3)}` : `$${value.toFixed(2)}`
}

/** Compact number formatting: 1.2M, 45k, 800. */
export function compact(value: number): string {
  if (!Number.isFinite(value)) return '0'
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`
  return value.toString()
}

/** Context-window label: "128k", "1M", or "—" when unknown. */
export function contextLabel(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens <= 0) return '—'
  return compact(tokens)
}

/** Locale grouping with optional decimals (e.g. 8,000 / 1.5M). */
export function number(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return value.toLocaleString('en-US')
}