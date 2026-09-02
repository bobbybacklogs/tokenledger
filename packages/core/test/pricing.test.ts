import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  CATALOG_MODELS,
  categorizeModel,
  featuredImageModels,
  featuredModels,
  findModel,
  githubCopilotModels,
  isEmbeddingModel,
  isVideoModel,
  normalizeModelsDevProviders,
  normalizeOpenRouterModels,
  normalizeVercelModels,
  providerFromId,
  type ProviderMap,
} from '../dist/index.js'

const PAYLOAD = {
  data: [
    {
      // free model
      id: 'openai/gpt-4o-mini',
      name: 'GPT-4o mini',
      context_length: 128000,
      pricing: { prompt: '0.00000015', completion: '0.0000006', input_cache_read: '0.00000003' },
    },
    {
      // numeric pricing + name fallback
      id: 'anthropic/claude-3.5-haiku',
      name: null,
      context_length: 200000,
      pricing: { prompt: 0.0000008, completion: 0.000004 },
    },
    {
      // missing pricing -> skipped
      id: 'weird/sampler',
      name: 'Weird Sampler',
      context_length: 137,
      pricing: {},
    },
    {
      // unknown provider
      id: 'acme/toaster',
      name: 'Acme Toaster',
      context_length: 4096,
      pricing: { prompt: '0.00000001', completion: '0.00000002' },
    },
    {
      // image-capable model: image_output is scaled ×1000 to per-image USD
      id: 'openai/gpt-5-image',
      name: 'GPT-5 Image',
      context_length: 400000,
      architecture: { modality: 'text+image->text+image' },
      pricing: { prompt: '0.00001', completion: '0.00001', image_output: '0.00004' },
    },
    {
      // image-capable model without a usable image_output -> no image price
      id: 'openai/gpt-image-lite',
      name: 'GPT Image Lite',
      context_length: 400000,
      architecture: { modality: 'text+image->text+image' },
      pricing: { prompt: '0.000002', completion: '0.000002', image_output: '0' },
    },
    {
      // variable-priced router: OpenRouter's "-1" sentinel means "no fixed
      // price" (it routes across providers) -> skipped, not $-1M garbage
      id: 'openrouter/auto',
      name: 'Auto Router',
      context_length: 2000000,
      pricing: { prompt: '-1', completion: '-1' },
    },
  ],
}

describe('normalizeOpenRouterModels', () => {
  it('scales per-token pricing to per-1M-token values', () => {
    const models = normalizeOpenRouterModels(PAYLOAD)
    const mini = models.find((model) => model.id === 'openai/gpt-4o-mini')!
    assert.equal(mini.input, 0.15)
    assert.equal(mini.output, 0.6)
    assert.equal(mini.context, 128_000)
    assert.equal(mini.cacheRead, 0.03)
  })

  it('handles numeric pricing and missing names', () => {
    const models = normalizeOpenRouterModels(PAYLOAD)
    const haiku = models.find((model) => model.id === 'anthropic/claude-3.5-haiku')!
    assert.equal(haiku.name, 'anthropic/claude-3.5-haiku')
    assert.equal(haiku.input, 0.8)
    assert.equal(haiku.output, 4)
  })

  it('skips models without usable pricing', () => {
    const models = normalizeOpenRouterModels(PAYLOAD)
    assert.equal(models.some((model) => model.id === 'weird/sampler'), false)
  })

  it('skips variable-priced routers OpenRouter flags with the -1 sentinel', () => {
    const models = normalizeOpenRouterModels(PAYLOAD)
    assert.equal(models.some((model) => model.id === 'openrouter/auto'), false)
  })

  it('derives providers and sorts the list', () => {
    const models = normalizeOpenRouterModels(PAYLOAD)
    assert.equal(models.find((model) => model.id === 'acme/toaster')!.provider, 'Acme')
    assert.deepEqual(
      models.map((model) => model.id),
      ['acme/toaster', 'anthropic/claude-3.5-haiku', 'openai/gpt-4o-mini', 'openai/gpt-5-image', 'openai/gpt-image-lite'],
    )
  })

  it('scales image_output to a per-image price and keeps modality', () => {
    const models = normalizeOpenRouterModels(PAYLOAD)
    const gpt5 = models.find((model) => model.id === 'openai/gpt-5-image')!
    assert.equal(gpt5.image, 0.04)
    assert.equal(gpt5.modality, 'text+image->text+image')
    assert.equal(gpt5.input, 10)
    const lite = models.find((model) => model.id === 'openai/gpt-image-lite')!
    assert.equal(lite.image, undefined)
  })

  it('returns [] for a malformed payload', () => {
    assert.deepEqual(normalizeOpenRouterModels({ nope: true }), [])
    assert.deepEqual(normalizeOpenRouterModels(null), [])
  })
})

describe('normalizeModelsDevProviders', () => {
  // models.dev is typed strictly; tests use a loose fixture cast so the bits
  // we care about (canonical ids, pricing, unpriced skips) stay readable.
  const providers = {
    openai: {
      id: 'openai',
      env: ['OPENAI_API_KEY'],
      npm: '@opencode-ai/ai/providers/openai',
      name: 'OpenAI',
      doc: 'https://openai.com',
      models: {
        'gpt-4o-mini': {
          id: 'gpt-4o-mini',
          name: 'GPT-4o mini',
          description: 'Fast small model',
          attachment: true,
          reasoning: false,
          tool_call: true,
          interleaved: true,
          temperature: true,
          knowledge: '2024-10',
          release_date: '2024-07',
          last_updated: '2026-01',
          modalities: { input: ['text'], output: ['text'] },
          open_weights: false,
          limit: { context: 128000, output: 16384 },
          cost: { input: 0.15, output: 0.6, cache_read: 0.03 },
        },
        // unpriced: absence of cost is NOT free -> skipped
        'unpriced-slug': {
          id: 'unpriced-slug',
          name: 'Unpriced',
          description: 'no cost at all',
          attachment: false,
          reasoning: false,
          tool_call: false,
          interleaved: false,
          temperature: true,
          release_date: '2025-01',
          last_updated: '2026-01',
          modalities: { input: ['text'], output: ['text'] },
          open_weights: false,
          limit: { context: 4096, output: 1024 },
        },
      },
    },
    anthropic: {
      id: 'anthropic',
      env: ['ANTHROPIC_API_KEY'],
      npm: '@opencode-ai/ai/providers/anthropic',
      name: 'Anthropic',
      doc: 'https://anthropic.com',
      models: {
        'claude-3.5-haiku': {
          id: 'claude-3.5-haiku',
          name: 'Claude 3.5 Haiku',
          description: 'Fast',
          attachment: true,
          reasoning: false,
          tool_call: true,
          interleaved: true,
          temperature: true,
          knowledge: '2025-01',
          release_date: '2024-10',
          last_updated: '2026-02',
          modalities: { input: ['text', 'image'], output: ['text'] },
          open_weights: false,
          limit: { context: 200000, output: 8192 },
          cost: { input: 0.8, output: 4 },
        },
      },
    },
  } as unknown as ProviderMap

  it('maps provider/model to canonical LiveModels with USD-per-1M prices', () => {
    const models = normalizeModelsDevProviders(providers)
    const mini = models.find((model) => model.id === 'openai/gpt-4o-mini')!
    assert.equal(mini.name, 'GPT-4o mini')
    assert.equal(mini.provider, 'OpenAI')
    assert.equal(mini.input, 0.15)
    assert.equal(mini.output, 0.6)
    assert.equal(mini.context, 128_000)
    assert.equal(mini.image, undefined)
    assert.equal(mini.cacheRead, 0.03)
  })

  it('retains the modality string for vision/audio detection', () => {
    const models = normalizeModelsDevProviders(providers)
    const haiku = models.find((model) => model.id === 'anthropic/claude-3.5-haiku')!
    assert.equal(haiku.modality, 'text+image->text')
    assert.equal(categorizeModel(haiku), 'vision')
  })

  it('skips unpriced models (absence of cost is not free)', () => {
    const models = normalizeModelsDevProviders(providers)
    assert.equal(models.some((model) => model.id === 'openai/unpriced-slug'), false)
  })

  it('sorts by provider name then model id', () => {
    const models = normalizeModelsDevProviders(providers)
    assert.deepEqual(
      models.map((model) => model.id),
      ['anthropic/claude-3.5-haiku', 'openai/gpt-4o-mini'],
    )
  })

  it('returns [] for an empty provider map', () => {
    assert.deepEqual(normalizeModelsDevProviders({}), [])
  })
})

describe('normalizeVercelModels', () => {
  const payload = {
    object: 'list',
    data: [
      {
        id: 'openai/gpt-5.6-sol',
        name: 'GPT-5.6 Sol',
        owned_by: 'openai',
        context_window: 1_050_000,
        type: 'language',
        modalities: { input: ['text', 'image'], output: ['text'] },
        pricing: { input: '0.000002', output: '0.00001', input_cache_read: '0.0000002' },
      },
      {
        id: 'bfl/flux-kontext-max',
        name: 'FLUX.1 Kontext Max',
        owned_by: 'bfl',
        context_window: 512,
        type: 'image',
        modalities: { input: ['text'], output: ['image'] },
        pricing: { image: '0.08' },
      },
      {
        id: 'bfl/flux-2-flex',
        name: 'FLUX.2 flex',
        owned_by: 'bfl',
        type: 'image',
        pricing: {},
      },
      {
        id: 'perplexity/sonar',
        name: 'Sonar',
        owned_by: 'perplexity',
        type: 'language',
        pricing: {},
      },
      {
        id: 'openai/text-embedding-3-small',
        name: 'text-embedding-3-small',
        owned_by: 'openai',
        context_window: 8191,
        type: 'embedding',
        pricing: { input: '0.00000002' },
      },
      {
        id: 'alibaba/wan-v2.6-t2v',
        name: 'Wan v2.6 Text-to-Video',
        owned_by: 'alibaba',
        type: 'video',
        pricing: {
          video_duration_pricing: [
            { resolution: '480p', cost_per_second: '0.05' },
            { resolution: '720p', cost_per_second: '0.1' },
          ],
        },
      },
    ],
  }

  it('scales per-token pricing to per-1M-token values and keeps modality', () => {
    const models = normalizeVercelModels(payload)
    const sol = models.find((model) => model.id === 'openai/gpt-5.6-sol')!
    assert.equal(sol.input, 2)
    assert.equal(sol.output, 10)
    assert.equal(sol.context, 1_050_000)
    assert.equal(sol.provider, 'OpenAI')
    assert.equal(sol.modality, 'text+image->text')
    assert.equal(sol.cacheRead, 0.2)
  })

  it('keeps embedding input-only prices and 720p video-per-second rates', () => {
    const models = normalizeVercelModels(payload)
    const embed = models.find((model) => model.id === 'openai/text-embedding-3-small')!
    assert.equal(embed.input, 0.02)
    assert.equal(embed.output, 0)
    assert.equal(isEmbeddingModel(embed), true)
    const video = models.find((model) => model.id === 'alibaba/wan-v2.6-t2v')!
    assert.equal(video.video, 0.1)
    assert.equal(isVideoModel(video), true)
  })

  it('keeps per-image prices without inventing token rates', () => {
    const models = normalizeVercelModels(payload)
    const flux = models.find((model) => model.id === 'bfl/flux-kontext-max')!
    assert.equal(flux.image, 0.08)
    assert.equal(flux.input, 0)
    assert.equal(flux.output, 0)
    assert.equal(flux.provider, 'Black Forest Labs')
  })

  it('skips unpriced models', () => {
    const models = normalizeVercelModels(payload)
    assert.equal(models.some((model) => model.id === 'bfl/flux-2-flex'), false)
    assert.equal(models.some((model) => model.id === 'perplexity/sonar'), false)
  })

  it('returns [] for a malformed payload', () => {
    assert.deepEqual(normalizeVercelModels({ nope: true }), [])
    assert.deepEqual(normalizeVercelModels(null), [])
  })
})

describe('githubCopilotModels', () => {
  it('keeps only github-copilot ids', () => {
    const models = [
      { id: 'github-copilot/gpt-5-mini', name: 'GPT-5 Mini', provider: 'GitHub Copilot', input: 0.25, output: 2, context: 264_000 },
      { id: 'openai/gpt-5-mini', name: 'GPT-5 Mini', provider: 'OpenAI', input: 0.25, output: 2, context: 264_000 },
    ]
    const copilot = githubCopilotModels(models)
    assert.deepEqual(copilot.map((model) => model.id), ['github-copilot/gpt-5-mini'])
  })
})

describe('providerFromId', () => {
  it('maps known namespaces, strips aliases, and falls back to a capitalized slug', () => {
    assert.equal(providerFromId('openai/gpt-4o'), 'OpenAI')
    assert.equal(providerFromId('google/gemini-2.0-pro'), 'Google')
    assert.equal(providerFromId('mistralai/mistral-small'), 'Mistral')
    assert.equal(providerFromId('~anthropic/claude-haiku-latest'), 'Anthropic')
    assert.equal(providerFromId('github-copilot/gpt-5-mini'), 'GitHub Copilot')
    assert.equal(providerFromId('bfl/flux-kontext-max'), 'Black Forest Labs')
    assert.equal(providerFromId('acme/thing'), 'Acme')
  })
})

describe('findModel', () => {
  it('matches by exact id, name, and trailing slug', () => {
    assert.equal(findModel(CATALOG_MODELS, 'openai/gpt-4o-mini')?.id, 'openai/gpt-4o-mini')
    assert.equal(findModel(CATALOG_MODELS, 'GPT-4o mini')?.id, 'openai/gpt-4o-mini')
    assert.equal(findModel(CATALOG_MODELS, 'gpt-4o-mi')!.id, 'openai/gpt-4o-mini')
    assert.equal(findModel(CATALOG_MODELS, 'missing/model'), undefined)
  })
})

describe('featuredModels', () => {
  it('pins featured ids first and caps the list', () => {
    const list = featuredModels(CATALOG_MODELS, { max: 6 })
    assert.equal(list.length, 6)
    assert.equal(list[0]!.id, 'openai/gpt-4o-mini')
  })

  it('backfills missing pinned ids from the offline catalog', () => {
    const live = [{ id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'OpenAI', input: 2.5, output: 10, context: 128_000 }]
    const curated = featuredModels(live, { backfill: CATALOG_MODELS })
    assert.ok(curated.some((model) => model.id === 'openai/gpt-4o-mini' && model.estimate))
    assert.ok(curated.some((model) => model.id === 'openai/gpt-4o' && !model.estimate))
  })

  it('featuredImageModels keeps only image-capable models and backfills', () => {
    const live = [{ id: 'openai/gpt-5-image', name: 'GPT-5 Image', provider: 'OpenAI', input: 10, output: 10, context: 400_000, image: 0.04 }]
    const curated = featuredImageModels(live)
    assert.ok(curated.some((model) => model.id === 'openai/gpt-5-image' && !model.estimate))
    assert.ok(curated.every((model) => typeof model.image === 'number'))
    assert.ok(curated.some((model) => model.id === 'black-forest-labs/flux-1.1-pro' && model.estimate))
  })
})