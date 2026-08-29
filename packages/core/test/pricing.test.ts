import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  CATALOG_MODELS,
  featuredImageModels,
  featuredModels,
  findModel,
  normalizeOpenRouterModels,
  providerFromId,
} from '../dist/index.js'

const PAYLOAD = {
  data: [
    {
      // free model
      id: 'openai/gpt-4o-mini',
      name: 'GPT-4o mini',
      context_length: 128000,
      pricing: { prompt: '0.00000015', completion: '0.0000006' },
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
  ],
}

describe('normalizeOpenRouterModels', () => {
  it('scales per-token pricing to per-1M-token values', () => {
    const models = normalizeOpenRouterModels(PAYLOAD)
    const mini = models.find((model) => model.id === 'openai/gpt-4o-mini')!
    assert.equal(mini.input, 0.15)
    assert.equal(mini.output, 0.6)
    assert.equal(mini.context, 128_000)
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

describe('providerFromId', () => {
  it('maps known namespaces, strips aliases, and falls back to a capitalized slug', () => {
    assert.equal(providerFromId('openai/gpt-4o'), 'OpenAI')
    assert.equal(providerFromId('google/gemini-2.0-pro'), 'Google')
    assert.equal(providerFromId('mistralai/mistral-small'), 'Mistral')
    assert.equal(providerFromId('~anthropic/claude-haiku-latest'), 'Anthropic')
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