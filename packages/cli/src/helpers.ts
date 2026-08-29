import {
  DEFAULT_IMAGE_MODEL_ID,
  DEFAULT_MODEL_ID,
  catalogModels,
  defaultImageScenario,
  defaultScenario,
  findModel,
  loadModels,
  type LiveModel,
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

function readTierSpec(spec: string): TierConfig {
  const parts = spec.split(':')
  if (parts.length < 5 || parts.length > 6) {
    process.stderr.write(
      pc.red(`Invalid tier spec "${spec}". Expected Name:users:price:inputTokens:outputTokens:quota\n`),
    )
    process.exit(1)
  }
  const [name, usersRaw, priceRaw, inputRaw, outputRaw, quotaRaw] = parts
  const users = Number(usersRaw)
  const price = Number(priceRaw)
  const input = Number(inputRaw)
  const output = Number(outputRaw)
  const quota = quotaRaw === undefined ? 0 : Number(quotaRaw)
  if (
    !name ||
    [users, price, input, output, quota].some((value) => !Number.isFinite(value) || value < 0)
  ) {
    process.stderr.write(pc.red(`Invalid tier spec "${spec}". Expected Name:users:price:inputTokens:outputTokens:quota\n`))
    process.exit(1)
  }
  return { name, users, price, input, output, quota }
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
export async function resolveTiers(options: { tier?: string[]; tiers?: string }): Promise<TierConfig[]> {
  if (options.tiers) return readTierFile(options.tiers)
  if (options.tier && options.tier.length > 0) return options.tier.map(readTierSpec)
  return defaultScenario().tiers
}

/** Load image-lane tiers from --tier specs, a JSON file, or the image defaults. */
export async function resolveImageTiers(options: { tier?: string[]; tiers?: string }): Promise<TierConfig[]> {
  if (options.tiers) return readTierFile(options.tiers)
  if (options.tier && options.tier.length > 0) return options.tier.map(readImageTierSpec)
  return defaultImageScenario().tiers
}

async function readTierFile(path: string): Promise<TierConfig[]> {
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
  const tiers = parsed.map((item, index) => normalizeTier(item, index))
  return tiers
}

function normalizeTier(value: unknown, index: number): TierConfig {
  const item = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
  const name = typeof item.name === 'string' && item.name ? item.name : `Tier ${index + 1}`
  const asNum = (key: string) => (typeof item[key] === 'number' ? (item[key] as number) : Number(item[key] ?? NaN))
  const users = asNum('users')
  const price = asNum('price')
  const input = asNum('input')
  const output = asNum('output')
  const quota = item.quota === undefined ? 0 : asNum('quota')
  const tier: TierConfig = { name, users, price, input, output, quota }
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
}

/** Build a scenario from CLI flags + a scenario file (optionally). */
export async function buildScenario(options: ScenarioSource): Promise<{ scenario: Scenario; fromDefaults: boolean }> {
  if (options.scenario) return loadScenarioFile(options.scenario)

  const tiers = await resolveTiers({ tier: options.tierSpecs, tiers: options.tiersFile })
  const usingDefaultTiers = !options.tierSpecs?.length && !options.tiersFile
  const defaultBase = usingDefaultTiers ? defaultScenario() : null
  const users = options.users !== undefined ? Number(options.users) : defaultBase?.users
  const model = options.model?.trim() || defaultBase?.model || DEFAULT_MODEL_ID

  return {
    scenario: { name: options.name ?? defaultBase?.name ?? 'CLI scenario', model, ...(users !== undefined ? { users } : {}), tiers },
    fromDefaults: usingDefaultTiers,
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
  const tiers = (item.tiers as unknown[]).map(normalizeTier)
  return { scenario: { name, model, ...(users !== undefined ? { users } : {}), tiers }, fromDefaults: false }
}

/** Which catalog a command loads: live OpenRouter, live models.dev, or bundled offline. */
export type SourceChoice = 'openrouter' | 'modelsdev' | 'offline'

const SOURCE_NAMES: Record<string, SourceChoice> = {
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

export function modelHeader(model: LiveModel): string {
  return `${pc.bold(model.name)} ${pc.dim(`(${model.id})`)} · ${pc.dim(model.provider)}`
}

export function estimateLabel(value: LiveModel): string {
  return value.estimate ? pc.yellow(' (estimate)') : ''
}