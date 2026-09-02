import { ModelsDevClient, type ProviderMap } from 'mdev-sdk'
import {
  CATALOG_EMBEDDING_MODELS,
  CATALOG_IMAGE_MODELS,
  CATALOG_MODELS,
  CATALOG_VIDEO_MODELS,
  DEFAULT_EMBEDDING_MODEL_ID,
  DEFAULT_IMAGE_MODEL_ID,
  DEFAULT_MODEL_ID,
  DEFAULT_VIDEO_MODEL_ID,
  FEATURED_EMBEDDING_MODEL_IDS,
  FEATURED_IMAGE_MODEL_IDS,
  FEATURED_MODEL_IDS,
  FEATURED_VIDEO_MODEL_IDS,
} from './catalog.js'
import type { LiveModel, ModelList } from './types.js'

/** OpenRouter's public model catalog endpoint (no API key required). */
export const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models'

/** models.dev's public catalog root (the open catalog behind OpenCode). */
export const MODELSDEV_BASE_URL = 'https://models.dev'

/** Vercel AI Gateway's public model catalog (no API key required). */
export const VERCEL_MODELS_URL = 'https://ai-gateway.vercel.sh/v1/models'

/** models.dev provider id for GitHub Copilot (GitHub Models was retired). */
export const GITHUB_COPILOT_PROVIDER_ID = 'github-copilot'

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
  spacexai: 'xAI',
  amazon: 'Amazon',
  microsoft: 'Microsoft',
  moonshotai: 'Moonshot AI',
  nvidia: 'NVIDIA',
  qwen: 'Qwen',
  alibaba: 'Alibaba',
  deepseek: 'DeepSeek',
  'z-ai': 'Z AI',
  cohere: 'Cohere',
  groq: 'Groq',
  together: 'Together',
  bfl: 'Black Forest Labs',
  'github-copilot': 'GitHub Copilot',
  github: 'GitHub',
  vercel: 'Vercel',
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
    const cacheReadRaw = toNumber(pricing.input_cache_read)
    const cacheWriteRaw = toNumber(pricing.input_cache_write)
    const cacheRead = cacheReadRaw !== null && cacheReadRaw >= 0 ? roundPrice(cacheReadRaw * 1_000_000) : undefined
    const cacheWrite = cacheWriteRaw !== null && cacheWriteRaw >= 0 ? roundPrice(cacheWriteRaw * 1_000_000) : undefined

    models.push({
      id,
      name,
      provider: providerFromId(id),
      input: roundPrice(prompt * 1_000_000),
      output: roundPrice(completion * 1_000_000),
      context,
      ...(image !== undefined ? { image } : {}),
      ...(cacheRead !== undefined ? { cacheRead } : {}),
      ...(cacheWrite !== undefined ? { cacheWrite } : {}),
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
      const rawCost = model.cost as { input?: number; output?: number; cache_read?: number; cache_write?: number } | undefined
      const input = rawCost?.input
      if (!rawCost || input === undefined || !Number.isFinite(input) || input < 0) continue
      const output = Number.isFinite(rawCost.output) && (rawCost.output as number) >= 0 ? (rawCost.output as number) : 0
      const context = model.limit?.context && model.limit.context > 0 ? model.limit.context : 0
      const id = `${provider.id}/${model.id}`.trim().replace(/\/+$/, '')
      if (!id) continue
      // Retain the modality string (OpenRouter-style "input+image->output") so
      // vision/audio category detection works for the models.dev catalog too.
      const inputModality = Array.isArray(model.modalities?.input) ? model.modalities!.input : []
      const outputModality = Array.isArray(model.modalities?.output) ? model.modalities!.output : []
      const modality =
        inputModality.length > 0 || outputModality.length > 0
          ? `${inputModality.join('+')}->${outputModality.join('+')}`
          : undefined
      const cacheRead = Number.isFinite(rawCost.cache_read) && (rawCost.cache_read as number) >= 0 ? roundPrice(rawCost.cache_read as number) : undefined
      const cacheWrite = Number.isFinite(rawCost.cache_write) && (rawCost.cache_write as number) >= 0 ? roundPrice(rawCost.cache_write as number) : undefined
      models.push({
        id,
        name: (model.name || id).trim(),
        provider: provider.name || provider.id,
        input: roundPrice(input),
        output: roundPrice(output),
        context,
        ...(cacheRead !== undefined ? { cacheRead } : {}),
        ...(cacheWrite !== undefined ? { cacheWrite } : {}),
        ...(modality ? { modality } : {}),
      })
    }
  }
  models.sort((a, b) => a.provider.localeCompare(b.provider) || a.id.localeCompare(b.id))
  return models
}

function vercelVideoPerSecond(pricing: Record<string, unknown>): number | undefined {
  const duration = pricing.video_duration_pricing
  if (Array.isArray(duration) && duration.length > 0) {
    const preferred =
      duration.find((tier) => typeof tier === 'object' && tier !== null && (tier as { resolution?: string }).resolution === '720p') ??
      duration[0]
    const cost = typeof preferred === 'object' && preferred !== null ? toNumber((preferred as { cost_per_second?: unknown }).cost_per_second) : null
    if (cost !== null && cost > 0) return roundPrice(cost)
  }
  const tokenPricing = pricing.video_token_pricing
  if (typeof tokenPricing === 'object' && tokenPricing !== null) {
    const cost = toNumber((tokenPricing as { cost_per_second?: unknown }).cost_per_second)
    if (cost !== null && cost > 0) return roundPrice(cost)
  }
  return undefined
}

function modalityFromParts(input: unknown, output: unknown): string | undefined {
  const inputModality = Array.isArray(input) ? input.filter((part): part is string => typeof part === 'string') : []
  const outputModality = Array.isArray(output) ? output.filter((part): part is string => typeof part === 'string') : []
  if (inputModality.length === 0 && outputModality.length === 0) return undefined
  return `${inputModality.join('+')}->${outputModality.join('+')}`
}

/**
 * Normalize Vercel AI Gateway's `GET /v1/models` payload into `LiveModel[]`.
 *
 * Language prices arrive as USD per token (same as OpenRouter) and are scaled
 * to per 1M tokens. Image models quote `pricing.image` already in USD per
 * generated image. Unpriced models and video/speech/realtime types that have
 * no usable token or per-image rate are skipped.
 */
export function normalizeVercelModels(payload: unknown): LiveModel[] {
  const data = (payload as { data?: unknown[] } | null)?.data
  if (!Array.isArray(data)) return []

  const models: LiveModel[] = []
  for (const raw of data) {
    if (typeof raw !== 'object' || raw === null) continue
    const item = raw as Record<string, unknown>
    const id = typeof item.id === 'string' ? item.id.trim() : ''
    if (!id) continue

    const pricing = (typeof item.pricing === 'object' && item.pricing !== null ? item.pricing : {}) as Record<string, unknown>
    const prompt = toNumber(pricing.input)
    const completion = toNumber(pricing.output)
    const imagePrice = toNumber(pricing.image)
    const image = imagePrice !== null && imagePrice > 0 ? roundPrice(imagePrice) : undefined
    const video = vercelVideoPerSecond(pricing)
    const cacheReadRaw = toNumber(pricing.input_cache_read)
    const cacheWriteRaw = toNumber(pricing.input_cache_write)
    const cacheRead = cacheReadRaw !== null && cacheReadRaw >= 0 ? roundPrice(cacheReadRaw * 1_000_000) : undefined
    const cacheWrite = cacheWriteRaw !== null && cacheWriteRaw >= 0 ? roundPrice(cacheWriteRaw * 1_000_000) : undefined
    const type = typeof item.type === 'string' ? item.type : ''
    const hasTokenPrice = prompt !== null && prompt >= 0 && (type === 'embedding' || (completion !== null && completion >= 0))
    if (!hasTokenPrice && image === undefined && video === undefined) continue

    const context = typeof item.context_window === 'number' && item.context_window > 0 ? item.context_window : 0
    const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : id
    const ownedBy = typeof item.owned_by === 'string' && item.owned_by.trim() ? item.owned_by.trim() : undefined
    const modalities = typeof item.modalities === 'object' && item.modalities !== null ? (item.modalities as Record<string, unknown>) : {}
    const modality = modalityFromParts(modalities.input, modalities.output)

    models.push({
      id,
      name,
      provider: ownedBy ? providerFromId(ownedBy) : providerFromId(id),
      input: prompt !== null && prompt >= 0 ? roundPrice(prompt * 1_000_000) : 0,
      output: completion !== null && completion >= 0 ? roundPrice(completion * 1_000_000) : 0,
      context,
      ...(image !== undefined ? { image } : {}),
      ...(video !== undefined ? { video } : {}),
      ...(cacheRead !== undefined ? { cacheRead } : {}),
      ...(cacheWrite !== undefined ? { cacheWrite } : {}),
      ...(modality ? { modality } : {}),
    })
  }

  models.sort((a, b) => a.provider.localeCompare(b.provider) || a.id.localeCompare(b.id))
  return models
}

/**
 * Keep only the GitHub Copilot slice of a models.dev catalog. Canonical ids
 * stay `github-copilot/<model>` so they don't collide with OpenRouter/Vercel
 * ids for the same underlying model.
 */
export function githubCopilotModels(models: readonly LiveModel[]): LiveModel[] {
  const prefix = `${GITHUB_COPILOT_PROVIDER_ID}/`
  return models.filter((model) => model.id.startsWith(prefix) || model.provider.toLowerCase() === 'github copilot')
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

/**
 * Fetch GitHub Copilot models from models.dev. GitHub Models (the playground
 * / inference catalog) was retired in July 2026; Copilot is the remaining
 * GitHub-hosted model list with public prices.
 */
export async function fetchGitHubModels(opts: FetchOptions = {}): Promise<ModelList> {
  const list = await fetchModelsDev(opts)
  return { source: 'github', fetchedAt: list.fetchedAt, models: githubCopilotModels(list.models) }
}

/** Fetch and normalize the Vercel AI Gateway catalog. */
export async function fetchVercelModels(opts: FetchOptions = {}): Promise<ModelList> {
  const { baseUrl = VERCEL_MODELS_URL, timeoutMs = 10_000, signal } = opts
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort)

  try {
    const response = await fetch(baseUrl, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    })
    if (!response.ok) throw new Error(`Vercel AI Gateway responded with HTTP ${response.status}`)
    const payload: unknown = await response.json()
    return { source: 'vercel', fetchedAt: new Date().toISOString(), models: normalizeVercelModels(payload) }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

/** The bundled offline estimate catalogs as a `ModelList` (all lanes). */
export function catalogModels(): ModelList {
  return {
    source: 'offline',
    fetchedAt: null,
    models: [...CATALOG_MODELS, ...CATALOG_IMAGE_MODELS, ...CATALOG_EMBEDDING_MODELS, ...CATALOG_VIDEO_MODELS],
  }
}

export interface LoadOptions extends FetchOptions {
  /** Skip the network and use the bundled catalog (alias for `source: 'offline'`). */
  offline?: boolean
  /** Which live catalog to load when not offline. Default: OpenRouter. */
  source?: 'openrouter' | 'modelsdev' | 'github' | 'vercel' | 'offline'
}

/**
 * Load a model list: live from OpenRouter (or models.dev / GitHub Copilot /
 * Vercel AI Gateway with `source`) when possible, otherwise the bundled catalog.
 * Never throws — check `result.source` for provenance.
 */
export async function loadModels(opts: LoadOptions = {}): Promise<ModelList> {
  if (opts.source === 'offline' || opts.offline) return catalogModels()
  try {
    if (opts.source === 'modelsdev') return await fetchModelsDev(opts)
    if (opts.source === 'github') return await fetchGitHubModels(opts)
    if (opts.source === 'vercel') return await fetchVercelModels(opts)
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

/** True when a model publishes a prompt-cache hit rate. */
export function isCacheModel(model: LiveModel): boolean {
  return typeof model.cacheRead === 'number' && model.cacheRead >= 0
}

/** True when a model is an embeddings model (id/name, or input-only pricing). */
export function isEmbeddingModel(model: LiveModel): boolean {
  if (typeof model.image === 'number' && model.image > 0) return false
  if (typeof model.video === 'number' && model.video > 0) return false
  const hay = `${model.id} ${model.name}`.toLowerCase()
  if (/\b(embedding|embeddings|text-embedding|\be5\b|\bbge\b)\b/.test(hay)) return true
  return model.input > 0 && model.output === 0 && !isCacheModel(model)
}

/** True when a model has per-second video pricing and can drive the video lane. */
export function isVideoModel(model: LiveModel): boolean {
  return typeof model.video === 'number' && model.video > 0
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

export interface FeaturedEmbeddingOptions {
  max?: number
  backfill?: readonly LiveModel[]
}

export function featuredEmbeddingModels(models: readonly LiveModel[], opts: FeaturedEmbeddingOptions = {}): LiveModel[] {
  const { max = 10, backfill } = opts
  return featuredModels(models.filter(isEmbeddingModel), {
    max,
    backfill: backfill ?? CATALOG_EMBEDDING_MODELS,
    pins: FEATURED_EMBEDDING_MODEL_IDS,
  })
}

export function defaultEmbeddingModelId(): string {
  return DEFAULT_EMBEDDING_MODEL_ID
}

export interface FeaturedVideoOptions {
  max?: number
  backfill?: readonly LiveModel[]
}

export function featuredVideoModels(models: readonly LiveModel[], opts: FeaturedVideoOptions = {}): LiveModel[] {
  const { max = 10, backfill } = opts
  return featuredModels(models.filter(isVideoModel), {
    max,
    backfill: backfill ?? CATALOG_VIDEO_MODELS,
    pins: FEATURED_VIDEO_MODEL_IDS,
  })
}

export function defaultVideoModelId(): string {
  return DEFAULT_VIDEO_MODEL_ID
}

/** Re-export for convenience. */
export {
  CATALOG_EMBEDDING_MODELS,
  CATALOG_IMAGE_MODELS,
  CATALOG_MODELS,
  CATALOG_VIDEO_MODELS,
  DEFAULT_EMBEDDING_MODEL_ID,
  DEFAULT_IMAGE_MODEL_ID,
  DEFAULT_MODEL_ID,
  DEFAULT_VIDEO_MODEL_ID,
  FEATURED_EMBEDDING_MODEL_IDS,
  FEATURED_IMAGE_MODEL_IDS,
  FEATURED_MODEL_IDS,
  FEATURED_VIDEO_MODEL_IDS,
}