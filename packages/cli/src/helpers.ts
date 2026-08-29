import {
  DEFAULT_IMAGE_MODEL_ID,
  DEFAULT_MODEL_ID,
  EXCHANGE_SIZES,
  catalogModels,
  defaultImageScenario,
  defaultScenario,
  findModel,
  loadModels,
  matchesCategory,
  presetEstimate,
  tierFromUsage,
  type ExchangeSize,
  type LiveModel,
  type ModelCategory,
  type ModelList,
  type Scenario,
  type TierConfig,
} from '@tokenledger/core'
import pc from 'picocolors'

/** Look up a model, exiting with a helpful message when it can't be found. */
export function requireModel(list: ModelList, query?: string): LiveModel {
  const fallbackDefault = list.models[0]
  const resolved = query?.trim() ? findModel(list.models, query) : undefined
  const model = resolved ?? (query ? undefined : fallbackDefault)
  if (!model) {
    process.stderr.write(pc.red(`Model "${query}" not found in the current catalog.\n`))
    process.stderr.write(pc.dim(`Try "tokenledger models ${query ?? ''}" to browse the catalog, or use --offline for the bundled estimates.\n`))
    process.exit(1)
  }
  return model
}

const EXCHANGE_ALIASES: Record<string, ExchangeSize> = {
  short: 'short',
  brief: 'short',
  quick: 'short',
  medium: 'medium',
  standard: 'medium',
  normal: 'medium',
  regular: 'medium',
  default: 'medium',
  long: 'long',
  detailed: 'long',
  deep: 'long',
  heavy: 'heavy',
  intensive: 'heavy',
  max: 'heavy',
  custom: 'custom',
  manual: 'custom',
}

/** Resolve a `--size <name>` exchange-size preset, defaulting to `medium`. */
export function resolveExchangeSize(spec?: string): ExchangeSize {
  if (!spec || !spec.trim()) return 'medium'
  const raw = spec.trim().toLowerCase()
  const size = EXCHANGE_ALIASES[raw]
  if (size) return size
  process.stderr.write(
    pc.red(`Unknown exchange size "${spec}". Use one of: ${EXCHANGE_SIZES.join(', ')}.\n`),
  )
  process.exit(1)
}

/** A resolved exchange-size choice plus any custom per-exchange tokens. */
export interface ExchangeConfig {
  size: ExchangeSize
  /** For `custom`: average input tokens per exchange. */
  inputTokens?: number
  /** For `custom`: average output tokens per exchange. */
  outputTokens?: number
}

function parseCount(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

/** Resolve `--size` plus the optional custom per-exchange token flags. */
export function resolveExchangeConfig(opts: {
  size?: string
  inputPer?: string
  outputPer?: string
}): ExchangeConfig {
  const size = resolveExchangeSize(opts.size)
  if (size !== 'custom') return { size }
  const inputTokens = parseCount(opts.inputPer)
  const outputTokens = parseCount(opts.outputPer)
  if (inputTokens === undefined || outputTokens === undefined) {
    process.stderr.write(
      pc.red('Custom exchange size requires --input-per <n> and --output-per <n> (tokens per exchange).\n'),
    )
    process.exit(1)
  }
  return { size, inputTokens, outputTokens }
}

/** The token assumption a config implies, shown so users can inspect it. */
export interface ExchangeAssumption {
  size: ExchangeSize
  label: string
  perInput: number
  perOutput: number
}

/** Compute the per-exchange token assumption a config implies. */
export function exchangeAssumption(config: ExchangeConfig): ExchangeAssumption {
  const estimate = presetEstimate(config.size)
  if (estimate) {
    return { size: config.size, label: estimate.label, perInput: estimate.input, perOutput: estimate.output }
  }
  return { size: 'custom', label: 'Custom', perInput: config.inputTokens!, perOutput: config.outputTokens! }
}

/** A short description of an exchange choice, e.g. "Medium (typical assistant response)". */
export function exchangeSizeHint(config: ExchangeConfig): string {
  const estimate = presetEstimate(config.size)
  if (estimate) return `${estimate.label} (${estimate.description})`
  return `Custom (${config.inputTokens} in / ${config.outputTokens} out tokens per exchange)`
}

/**
 * Parse a token-lane tier spec.
 *
 * Two formats are supported:
 * - Usage (business-friendly): `Name:users:price:requests` — tokens are
 *   derived from requests/month × the exchange-size preset.
 * - Raw tokens (advanced): `Name:users:price:inputTokens:outputTokens:quota`.
 */
function readTierSpec(spec: string, config: ExchangeConfig): TierConfig {
  const parts = spec.split(':')
  const [name, usersRaw, priceRaw, aRaw, bRaw, cRaw] = parts

  // Usage format: Name:users:price:requests
  if (parts.length === 4) {
    const users = Number(usersRaw)
    const price = Number(priceRaw)
    const requests = Number(aRaw)
    if (!name || [users, price, requests].some((value) => !Number.isFinite(value) || value < 0)) {
      process.stderr.write(pc.red(`Invalid usage tier spec "${spec}". Expected Name:users:price:requests\n`))
      process.exit(1)
    }
    const { input, output, quota } = tierFromUsage({
      requestsPerUserPerMonth: requests,
      exchangeSize: config.size,
      ...(config.size === 'custom'
        ? { inputTokensPerExchange: config.inputTokens, outputTokensPerExchange: config.outputTokens }
        : {}),
    })
    return { name, users, price, input, output, quota }
  }

  // Raw token format: Name:users:price:input:output:quota
  if (parts.length === 6) {
    const users = Number(usersRaw)
    const price = Number(priceRaw)
    const input = Number(aRaw)
    const output = Number(bRaw)
    const quota = Number(cRaw)
    if (
      !name ||
      [users, price, input, output, quota].some((value) => !Number.isFinite(value) || value < 0)
    ) {
      process.stderr.write(pc.red(`Invalid tier spec "${spec}". Expected Name:users:price:inputTokens:outputTokens:quota\n`))
      process.exit(1)
    }
    return { name, users, price, input, output, quota }
  }

  process.stderr.write(
    pc.red(
      `Invalid tier spec "${spec}". Expected usage format Name:users:price:requests or token format Name:users:price:inputTokens:outputTokens:quota\n`,
    ),
  )
  process.exit(1)
}

/** Parse an image-lane tier spec: `Name:users:price:imagesPerUser[:quota]`. */
function readImageTierSpec(spec: string): TierConfig {
  const parts = spec.split(':')
  if (parts.length < 4 || parts.length > 5) {
    process.stderr.write(pc.red(`Invalid image tier spec "${spec}". Expected Name:users:price:imagesPerUser:quota\n`))
    process.exit(1)
  }
  const [name, usersRaw, priceRaw, imagesRaw, quotaRaw] = parts
  const users = Number(usersRaw)
  const price = Number(priceRaw)
  const images = Number(imagesRaw)
  const quota = quotaRaw === undefined ? 0 : Number(quotaRaw)
  if (
    !name ||
    [users, price, images, quota].some((value) => !Number.isFinite(value) || value < 0)
  ) {
    process.stderr.write(pc.red(`Invalid image tier spec "${spec}". Expected Name:users:price:imagesPerUser:quota\n`))
    process.exit(1)
  }
  return { name, users, price, input: 0, output: 0, images, quota }
}

/** Load tiers from --tier specs, a JSON file, or fall back to the defaults. */
export async function resolveTiers(
  options: { tier?: string[]; tiers?: string },
  config: ExchangeConfig,
): Promise<TierConfig[]> {
  if (options.tiers) return readTierFile(options.tiers, config)
  if (options.tier && options.tier.length > 0) return options.tier.map((spec) => readTierSpec(spec, config))
  return defaultScenario().tiers
}

/** Load image-lane tiers from --tier specs, a JSON file, or the image defaults. */
export async function resolveImageTiers(options: { tier?: string[]; tiers?: string }): Promise<TierConfig[]> {
  if (options.tiers) return readTierFile(options.tiers)
  if (options.tier && options.tier.length > 0) return options.tier.map(readImageTierSpec)
  return defaultImageScenario().tiers
}

async function readTierFile(path: string, config?: ExchangeConfig): Promise<TierConfig[]> {
  const fs = await import('node:fs/promises')
  let raw: string
  try {
    raw = await fs.readFile(path, 'utf8')
  } catch {
    process.stderr.write(pc.red(`Could not read tiers file: ${path}\n`))
    process.exit(1)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    process.stderr.write(pc.red(`"${path}" is not valid JSON.\n`))
    process.exit(1)
  }
  if (!Array.isArray(parsed)) {
    process.stderr.write(pc.red(`Tiers file "${path}" must contain a JSON array of tier objects.\n`))
    process.exit(1)
  }
  return parsed.map((item, index) => normalizeTier(item, index, config))
}

function normalizeTier(value: unknown, index: number, config?: ExchangeConfig): TierConfig {
  const item = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
  const name = typeof item.name === 'string' && item.name ? item.name : `Tier ${index + 1}`
  const asNum = (key: string) => (typeof item[key] === 'number' ? (item[key] as number) : Number(item[key] ?? NaN))
  const users = asNum('users')
  const price = asNum('price')
  const input = asNum('input')
  const output = asNum('output')
  const requests = asNum('requests')

  // A tier can be described in business terms with `requests` (plus an
  // optional `size` preset) instead of raw input/output token counts.
  if (!Number.isFinite(input) && !Number.isFinite(output) && Number.isFinite(requests)) {
    const perTierSize = typeof item.size === 'string' ? item.size : undefined
    let cfg: ExchangeConfig
    if (perTierSize) {
      cfg =
        resolveExchangeSize(perTierSize) === 'custom'
          ? { size: 'custom', inputTokens: asNum('inputPerExchange'), outputTokens: asNum('outputPerExchange') }
          : { size: resolveExchangeSize(perTierSize) }
    } else {
      cfg = config ?? { size: 'medium' }
    }
    if (cfg.size === 'custom' && (cfg.inputTokens === undefined || cfg.outputTokens === undefined)) {
      process.stderr.write(
        pc.red(`Tier "${name}" uses size "custom" — add inputPerExchange and outputPerExchange, or use raw input/output tokens.\n`),
      )
      process.exit(1)
    }
    const computed = tierFromUsage({
      requestsPerUserPerMonth: requests,
      exchangeSize: cfg.size,
      ...(cfg.size === 'custom'
        ? { inputTokensPerExchange: cfg.inputTokens, outputTokensPerExchange: cfg.outputTokens }
        : {}),
    })
    return { name, users, price, input: computed.input, output: computed.output, quota: item.quota === undefined ? computed.quota : asNum('quota') }
  }

  const quota: number = item.quota === undefined ? 0 : asNum('quota')
  const tier: TierConfig = {
    name,
    users,
    price,
    input: Number.isFinite(input) ? input : 0,
    output: Number.isFinite(output) ? output : 0,
    quota,
  }
  if (item.images !== undefined) tier.images = asNum('images')
  return tier
}

export interface ScenarioSource {
  scenario?: string
  model?: string
  users?: string
  tierSpecs?: string[]
  tiersFile?: string
  name?: string
  /** Exchange-size preset for usage-style tier specs. */
  size?: string
  /** Per-exchange input tokens when `size` is `custom`. */
  inputPer?: string
  /** Per-exchange output tokens when `size` is `custom`. */
  outputPer?: string
}

export interface BuiltScenario {
  scenario: Scenario
  fromDefaults: boolean
  /** The per-exchange token assumption when usage-style tiers were used. */
  assumption?: ExchangeAssumption
}

/** Build a scenario from CLI flags + a scenario file (optionally). */
export async function buildScenario(options: ScenarioSource): Promise<BuiltScenario> {
  if (options.scenario) return loadScenarioFile(options.scenario)

  const config = resolveExchangeConfig({ size: options.size, inputPer: options.inputPer, outputPer: options.outputPer })
  const tiers = await resolveTiers({ tier: options.tierSpecs, tiers: options.tiersFile }, config)
  const usingDefaultTiers = !options.tierSpecs?.length && !options.tiersFile
  const defaultBase = usingDefaultTiers ? defaultScenario() : null
  const users = options.users !== undefined ? Number(options.users) : defaultBase?.users
  const model = options.model?.trim() || defaultBase?.model || DEFAULT_MODEL_ID

  // Surface the token assumption whenever usage-style specs are in play.
  const usingUsage = Boolean(options.size) || (options.tierSpecs?.some((s) => s.split(':').length === 4) ?? false)
  const assumption = usingUsage ? exchangeAssumption(config) : undefined

  return {
    scenario: { name: options.name ?? defaultBase?.name ?? 'CLI scenario', model, ...(users !== undefined ? { users } : {}), tiers },
    fromDefaults: usingDefaultTiers,
    ...(assumption ? { assumption } : {}),
  }
}

/** Build an image-lane scenario from CLI flags + a scenario file (optionally). */
export async function buildImageScenario(options: ScenarioSource): Promise<{ scenario: Scenario; fromDefaults: boolean }> {
  if (options.scenario) return loadScenarioFile(options.scenario)

  const tiers = await resolveImageTiers({ tier: options.tierSpecs, tiers: options.tiersFile })
  const usingDefaultTiers = !options.tierSpecs?.length && !options.tiersFile
  const defaultBase = usingDefaultTiers ? defaultImageScenario() : null
  const users = options.users !== undefined ? Number(options.users) : defaultBase?.users
  const model = options.model?.trim() || defaultBase?.model || DEFAULT_IMAGE_MODEL_ID

  return {
    scenario: {
      name: options.name ?? defaultBase?.name ?? 'CLI image scenario',
      model,
      ...(users !== undefined ? { users } : {}),
      tiers,
    },
    fromDefaults: usingDefaultTiers,
  }
}

export async function loadScenarioFile(path: string): Promise<{ scenario: Scenario; fromDefaults: boolean }> {
  const fs = await import('node:fs/promises')
  let raw: string
  try {
    raw = await fs.readFile(path, 'utf8')
  } catch {
    process.stderr.write(pc.red(`Could not read scenario file: ${path}\n`))
    process.exit(1)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    process.stderr.write(pc.red(`"${path}" is not valid JSON.\n`))
    process.exit(1)
  }
  const item = (typeof parsed === 'object' && parsed !== null ? parsed : {}) as Record<string, unknown>
  if (!Array.isArray(item.tiers)) {
    process.stderr.write(pc.red(`Scenario file "${path}" must contain a "tiers" array.\n`))
    process.exit(1)
  }
  const name = typeof item.name === 'string' && item.name ? item.name : 'Scenario'
  const model = typeof item.model === 'string' && item.model ? item.model : DEFAULT_MODEL_ID
  const users = typeof item.users === 'number' ? item.users : undefined
  const tiers = (item.tiers as unknown[]).map((value, index) => normalizeTier(value, index))
  return { scenario: { name, model, ...(users !== undefined ? { users } : {}), tiers }, fromDefaults: false }
}

/** Which catalog a command loads: live OpenRouter, live models.dev, or bundled offline. */
export type SourceChoice = 'openrouter' | 'modelsdev' | 'offline'

const SOURCE_NAMES: Record<string, SourceChoice> = {
  default: 'openrouter',
  openrouter: 'openrouter',
  live: 'openrouter',
  'models.dev': 'modelsdev',
  modelsdev: 'modelsdev',
  mdev: 'modelsdev',
  offline: 'offline',
  catalog: 'offline',
  bundled: 'offline',
}

/** Resolve a `--source <name>` value (with `--offline` as an alias) to a choice. */
export function resolveSourceChoice(opts: { source?: string; offline?: boolean }): SourceChoice {
  if (opts.offline) return 'offline'
  const raw = opts.source?.trim().toLowerCase()
  if (raw) {
    const choice = SOURCE_NAMES[raw]
    if (choice) return choice
    process.stderr.write(pc.red(`Unknown source "${opts.source}". Use one of: openrouter, models.dev, offline.\n`))
    process.exit(1)
  }
  return 'openrouter'
}

/**
 * Resolve a model list from the requested source. Falls back to the bundled
 * catalog on network failure for live sources (never throws).
 */
export async function resolveModelList(opts: { source?: string; offline?: boolean }): Promise<ModelList> {
  const source = resolveSourceChoice(opts)
  if (source === 'offline') return catalogModels()
  return loadModels({ source })
}

export function sourceLine(list: ModelList): string {
  if (list.source === 'live') {
    return pc.green('live pricing') + pc.dim(` · OpenRouter · ${list.models.length.toLocaleString()} models`) + pc.dim(` · fetched ${list.fetchedAt}`)
  }
  if (list.source === 'modelsdev') {
    return pc.green('models.dev pricing') + pc.dim(` · ${list.models.length.toLocaleString()} models`) + pc.dim(` · fetched ${list.fetchedAt}`)
  }
  return pc.yellow('offline estimates') + pc.dim(` · bundled catalog · ${list.models.length.toLocaleString()} models`)
}

/** Short human label for a source, used in per-row source columns. */
export function sourceLabel(source: SourceChoice): string {
  switch (source) {
    case 'modelsdev':
      return 'models.dev'
    case 'offline':
      return 'offline'
    default:
      return 'OpenRouter'
  }
}

/**
 * Parse a comma- or space-separated `--source` list (e.g. `models.dev,default`
 * or `models.dev default`). `default` means OpenRouter. Returns `undefined`
 * when nothing was given. Exits with a message on an unknown source.
 */
export function parseSourceSpec(spec?: string): SourceChoice[] | undefined {
  if (!spec || !spec.trim()) return undefined
  const parts = spec.split(/[\s,]+/).map((part) => part.trim()).filter(Boolean)
  if (parts.length === 0) return undefined
  return parts.map((part) => {
    const raw = part.toLowerCase()
    const choice = SOURCE_NAMES[raw]
    if (!choice) {
      process.stderr.write(
        pc.red(`Unknown source "${part}". Use one of: openrouter, models.dev, offline (or "default" for OpenRouter).\n`),
      )
      process.exit(1)
    }
    return choice
  })
}

/**
 * Assign a source to each of `count` models. A single `--source` value applies
 * to every model; a longer list maps positionally and its last value fills the
 * remainder. `--offline` forces everything offline.
 */
export function resolvePerModelSources(count: number, spec?: SourceChoice[], offline?: boolean): SourceChoice[] {
  if (offline) return Array<SourceChoice>(count).fill('offline')
  if (!spec || spec.length === 0) return Array<SourceChoice>(count).fill('openrouter')
  return Array.from({ length: count }, (_, i) => spec[Math.min(i, spec.length - 1)]!)
}

/** Load a model list for a single source choice. */
export async function loadListForSource(source: SourceChoice): Promise<ModelList> {
  if (source === 'offline') return catalogModels()
  return loadModels({ source })
}

const CATEGORY_ALIASES: Record<string, ModelCategory> = {
  general: 'general',
  text: 'general',
  coding: 'coding',
  code: 'coding',
  coder: 'coding',
  reasoning: 'reasoning',
  think: 'reasoning',
  thinking: 'reasoning',
  vision: 'vision',
  multimodal: 'vision',
  image: 'image',
  imagegen: 'image',
  images: 'image',
  embedding: 'embedding',
  embeddings: 'embedding',
  audio: 'audio',
  speech: 'audio',
}

/** Resolve a `--category <name>` value to a category, or `undefined` if none. */
export function resolveCategory(spec?: string): ModelCategory | undefined {
  if (!spec || !spec.trim()) return undefined
  const raw = spec.trim().toLowerCase()
  const category = CATEGORY_ALIASES[raw]
  if (category) return category
  process.stderr.write(
    pc.red(`Unknown category "${spec}". Use one of: general, coding, reasoning, vision, image, embedding, audio.\n`),
  )
  process.exit(1)
}

/** Filter a model list down to one category (no-op when category is undefined). */
export function filterByCategory(
  models: readonly LiveModel[],
  category: ModelCategory | undefined,
): LiveModel[] {
  if (!category) return [...models]
  return models.filter((model) => matchesCategory(model, category))
}

export function modelHeader(model: LiveModel): string {
  return `${pc.bold(model.name)} ${pc.dim(`(${model.id})`)} · ${pc.dim(model.provider)}`
}

export function estimateLabel(value: LiveModel): string {
  return value.estimate ? pc.yellow(' (estimate)') : ''
}