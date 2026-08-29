import { ModelsDevClient, type ProviderMap } from 'mdev-sdk'
import { CATALOG_IMAGE_MODELS, CATALOG_MODELS, DEFAULT_IMAGE_MODEL_ID, DEFAULT_MODEL_ID, FEATURED_IMAGE_MODEL_IDS, FEATURED_MODEL_IDS } from './catalog.js'
import type { LiveModel, ModelList } from './types.js'

/** OpenRouter's public model catalog endpoint (no API key required). */
export const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models'

/** models.dev's public catalog root (the open catalog behind OpenCode). */
export const MODELSDEV_BASE_URL = 'https://models.dev'

/** Nicer display names for common id namespaces. */
const PROVIDER_NAMES: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  googleai: 'Google AI',
  'google-deepmind': 'Google DeepMind',
  mistralai: 'Mistral',
  meta: 'Meta',
  xai: 'xAI',
  'x-ai': 'xAI',
  amazon: 'Amazon',
  microsoft: 'Microsoft',
  moonshotai: 'Moonshot AI',
  nvidia: 'NVIDIA',
  qwen: 'Qwen',
  deepseek: 'DeepSeek',
  'z-ai': 'Z AI',
  cohere: 'Cohere',
  groq: 'Groq',
  together: 'Together',
}

/** Derive a provider display name from a model id namespace. */
export function providerFromId(id: string): string {
  const namespace = (id.split('/')[0] ?? '').replace(/^~/, '').toLowerCase()
  return PROVIDER_NAMES[namespace] ?? (namespace ? namespace.charAt(0).toUpperCase() + namespace.slice(1) : id)
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

/**
 * Normalize the OpenRouter `/api/v1/models` payload into `LiveModel[]`.
 * Prices arrive as USD per token, so we scale to per 1M tokens and keep a
 * reasonable 4-decimal precision for display and math.
 */
export function normalizeOpenRouterModels(payload: unknown): LiveModel[] {
  const data = (payload as { data?: unknown[] } | null)?.data
  if (!Array.isArray(data)) return []

  const models: LiveModel[] = []
  for (const raw of data) {
    if (typeof raw !== 'object' || raw === null) continue
    const item = raw as Record<string, unknown>
    const id = typeof item.id === 'string' ? item.id.trim() : ''
    if (!id) continue

    const pricing = (typeof item.pricing === 'object' && item.pricing !== null ? item.pricing : {}) as Record<string, unknown>
    const prompt = toNumber(pricing.prompt)
    const completion = toNumber(pricing.completion)
    // Models without an explicit prompt/completion price can't be quoted.
    // OpenRouter marks variable-priced routers (openrouter/auto, auto-beta,
    // bodybuilder, fusion, pareto-code, ...) with a `-1` sentinel instead of
    // a real per-token price — skip those too.
    if (prompt === null || completion === null || prompt < 0 || completion < 0) continue

    const context = typeof item.context_length === 'number' && item.context_length > 0 ? item.context_length : 0
    const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : id

    const architecture =
      typeof item.architecture === 'object' && item.architecture !== null
        ? (item.architecture as Record<string, unknown>)
        : {}
    const modality =
      typeof architecture.modality === 'string' && architecture.modality.trim()
        ? (architecture.modality as string)
        : undefined

    // OpenRouter prices generated images via `pricing.image_output`. The feed
    // reports it scaled ×1000 from the per-image USD price (e.g. GPT-5 Image
    // lists `0.00004` for its documented $0.04 per output image).
    const imageOutput = toNumber(pricing.image_output)
    const image = imageOutput !== null && imageOutput > 0 ? roundPrice(imageOutput * 1000) : undefined

    models.push({
      id,
      name,
      provider: providerFromId(id),
      input: roundPrice(prompt * 1_000_000),
      output: roundPrice(completion * 1_000_000),
      context,
      ...(image !== undefined ? { image } : {}),
      ...(modality !== undefined && image !== undefined ? { modality } : {}),
    })
  }

  models.sort((a, b) => a.provider.localeCompare(b.provider) || a.id.localeCompare(b.id))
  return models
}

function roundPrice(value: number): number {
  return Math.round(value * 10_000) / 10_000
}

/**
 * Normalize a models.dev `ProviderMap` (from `catalog()` / `/catalog.json`)
 * into `LiveModel[]`.
 *
 * models.dev prices are already USD per 1M tokens, so nothing is scaled.
 * A model with no `cost` is *unpriced* (absence ≠ free) and can't be quoted —
 * skip it, mirroring the OpenRouter missing-price skip. Canonical ids are
 * `provider/model`, and provider display names come from the catalog itself.
 * models.dev does not publish per-image pricing, so the image lane is empty.
 */
export function normalizeModelsDevProviders(providers: ProviderMap): LiveModel[] {
  const models: LiveModel[] = []
  for (const provider of Object.values(providers)) {
    if (!provider || typeof provider !== 'object') continue
    for (const model of Object.values(provider.models ?? {})) {
      if (!model || typeof model !== 'object') continue
      const cost = model.cost
      if (!cost || !Number.isFinite(cost.input) || !Number.isFinite(cost.output) || cost.input < 0 || cost.output < 0) continue
      const context = model.limit?.context && model.limit.context > 0 ? model.limit.context : 0
      const id = `${provider.id}/${model.id}`.trim().replace(/\/+$/, '')
      if (!id) continue
      models.push({
        id,
        name: (model.name || id).trim(),
        provider: provider.name || provider.id,
        input: roundPrice(cost.input),
        output: roundPrice(cost.output),
        context,
      })
    }
  }
  models.sort((a, b) => a.provider.localeCompare(b.provider) || a.id.localeCompare(b.id))
  return models
}

export interface FetchOptions {
  /** Override the source base URL (mainly for tests). Default: the OpenRouter endpoint (or models.dev for `fetchModelsDev`). */
  baseUrl?: string
  /** Abort the request after this many milliseconds. Default 10s. */
  timeoutMs?: number
  /** Forward an external abort signal. */
  signal?: AbortSignal
}

/** Fetch and normalize the live model catalog from OpenRouter. */
export async function fetchModels(opts: FetchOptions = {}): Promise<ModelList> {
  const { baseUrl = OPENROUTER_MODELS_URL, timeoutMs = 10_000, signal } = opts
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort)

  try {
    const response = await fetch(baseUrl, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    })
    if (!response.ok) throw new Error(`OpenRouter responded with HTTP ${response.status}`)
    const payload: unknown = await response.json()
    return { source: 'live', fetchedAt: new Date().toISOString(), models: normalizeOpenRouterModels(payload) }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

/** Fetch and normalize the models.dev catalog (via `mdev-sdk`). */
export async function fetchModelsDev(opts: FetchOptions = {}): Promise<ModelList> {
  const { baseUrl = MODELSDEV_BASE_URL, timeoutMs = 10_000, signal } = opts
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort)

  try {
    const client = new ModelsDevClient({ baseUrl })
    const catalog = await client.catalog({ signal: controller.signal })
    return {
      source: 'modelsdev',
      fetchedAt: new Date().toISOString(),
      models: normalizeModelsDevProviders(catalog.providers ?? {}),
    }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

/** The bundled offline estimate catalogs as a `ModelList` (token + image lanes). */
export function catalogModels(): ModelList {
  return { source: 'offline', fetchedAt: null, models: [...CATALOG_MODELS, ...CATALOG_IMAGE_MODELS] }
}

export interface LoadOptions extends FetchOptions {
  /** Skip the network and use the bundled catalog (alias for `source: 'offline'`). */
  offline?: boolean
  /** Which live catalog to load when not offline. Default: OpenRouter. */
  source?: 'openrouter' | 'modelsdev' | 'offline'
}

/**
 * Load a model list: live from OpenRouter (or models.dev with
 * `source: 'modelsdev'`) when possible, otherwise the bundled catalog.
 * Never throws — check `result.source` for provenance.
 */
export async function loadModels(opts: LoadOptions = {}): Promise<ModelList> {
  if (opts.source === 'offline' || opts.offline) return catalogModels()
  if (opts.source === 'modelsdev') {
    try {
      return await fetchModelsDev(opts)
    } catch {
      return catalogModels()
    }
  }
  try {
    return await fetchModels(opts)
  } catch {
    return catalogModels()
  }
}

/** Look a model up by id, name, or a partial/trailing slug match. */
export function findModel(models: readonly LiveModel[], query: string): LiveModel | undefined {
  const q = query.trim().toLowerCase()
  if (!q) return undefined
  const exactId = models.find((model) => model.id.toLowerCase() === q)
  if (exactId) return exactId
  const exactName = models.find((model) => model.name.toLowerCase() === q)
  if (exactName) return exactName
  return models.find((model) => model.id.toLowerCase().endsWith(`/${q}`) || model.id.toLowerCase().includes(q))
}

export interface FeaturedOptions {
  /** Maximum number of models to return. Default 12. */
  max?: number
  /** Fill pinned ids that are missing from the live feed using this fallback list. */
  backfill?: readonly LiveModel[]
  /** Pinned ids to list first. Defaults to the token-lane featured set. */
  pins?: readonly string[]
}

/**
 * Return the pinned "featured" model set, followed by remaining models up to
 * `max`. Missing pinned ids can be backfilled from an offline catalog so the
 * benchmark table stays stable even when a model rotates out of the live feed.
 */
export function featuredModels(models: readonly LiveModel[], opts: FeaturedOptions = {}): LiveModel[] {
  const { max = 12, backfill, pins = FEATURED_MODEL_IDS } = opts
  const byId = new Map(models.map((model) => [model.id, model]))

  const pinned: LiveModel[] = []
  for (const id of pins) {
    const found = byId.get(id)
    if (found) {
      pinned.push(found)
      continue
    }
    if (backfill) {
      const fallback = backfill.find((model) => model.id === id)
      if (fallback) pinned.push({ ...fallback, estimate: true })
    }
  }

  const pinnedIds = new Set(pinned.map((model) => model.id))
  const rest = models.filter((model) => !pinnedIds.has(model.id))
  return [...pinned, ...rest].slice(0, max)
}

/** Which model id to default to when none is specified. */
export function defaultModelId(): string {
  return DEFAULT_MODEL_ID
}

/** True when a model has per-image output pricing and can drive the image lane. */
export function isImageModel(model: LiveModel): boolean {
  return typeof model.image === 'number' && model.image > 0
}

export interface FeaturedImageOptions {
  /** Maximum number of image models to return. Default 10. */
  max?: number
  /** Fill pinned image-model ids missing from the live feed using this fallback list. */
  backfill?: readonly LiveModel[]
}

/**
 * Return the pinned "featured" image-generating model set, followed by the
 * remaining image-capable models up to `max`. Missing pinned ids are
 * backfilled from `CATALOG_IMAGE_MODELS` so the image-lane benchmark table
 * stays stable even when a provider rotates a model out of the live feed.
 */
export function featuredImageModels(models: readonly LiveModel[], opts: FeaturedImageOptions = {}): LiveModel[] {
  const { max = 10, backfill } = opts
  const imageModels = models.filter(isImageModel)
  return featuredModels(imageModels, { max, backfill: backfill ?? CATALOG_IMAGE_MODELS, pins: FEATURED_IMAGE_MODEL_IDS })
}

/** Which image model id to default to when none is specified. */
export function defaultImageModelId(): string {
  return DEFAULT_IMAGE_MODEL_ID
}

/** Re-export for convenience. */
export { CATALOG_IMAGE_MODELS, CATALOG_MODELS, DEFAULT_IMAGE_MODEL_ID, DEFAULT_MODEL_ID, FEATURED_IMAGE_MODEL_IDS, FEATURED_MODEL_IDS }