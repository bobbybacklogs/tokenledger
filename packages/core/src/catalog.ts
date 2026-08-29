import type { LiveModel } from './types.js'

/**
 * Bundled offline fallback catalog. Prices are approximate estimates in USD
 * per 1M tokens and are only used when the live OpenRouter feed is
 * unavailable. Every entry is flagged with `estimate: true`.
 */
export const CATALOG_MODELS: LiveModel[] = [
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o mini', provider: 'OpenAI', input: 0.15, output: 0.6, context: 128_000, best: 'High-volume chat' },
  { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'OpenAI', input: 2.5, output: 10, context: 128_000, best: 'Complex reasoning' },
  { id: 'openai/gpt-4.1-mini', name: 'GPT-4.1 mini', provider: 'OpenAI', input: 0.4, output: 1.6, context: 1_047_576, best: 'Fast & affordable' },
  { id: 'openai/gpt-4.1', name: 'GPT-4.1', provider: 'OpenAI', input: 2, output: 8, context: 1_047_576, best: 'General coding' },
  { id: 'anthropic/claude-3.5-haiku', name: 'Claude 3.5 Haiku', provider: 'Anthropic', input: 0.8, output: 4, context: 200_000, best: 'Fast reasoning' },
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'Anthropic', input: 3, output: 15, context: 200_000, best: 'Balanced agent work' },
  { id: 'anthropic/claude-3.7-sonnet', name: 'Claude 3.7 Sonnet', provider: 'Anthropic', input: 3, output: 15, context: 200_000, best: 'Coding & agents' },
  { id: 'google/gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'Google', input: 0.1, output: 0.4, context: 1_000_000, best: 'Long context' },
  { id: 'google/gemini-2.0-pro', name: 'Gemini 2.0 Pro', provider: 'Google', input: 2.5, output: 15, context: 1_000_000, best: 'Big batch jobs' },
  { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'Google', input: 0.3, output: 2.5, context: 1_000_000, best: 'Low-latency chat' },
  { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'Google', input: 1.25, output: 10, context: 1_000_000, best: 'Frontier reasoning' },
  { id: 'mistralai/mistral-small', name: 'Mistral Small', provider: 'Mistral', input: 0.1, output: 0.3, context: 32_000, best: 'Balanced workloads' },
  { id: 'mistralai/mistral-large', name: 'Mistral Large', provider: 'Mistral', input: 2, output: 6, context: 128_000, best: 'High quality' },
].map((model) => ({ ...model, estimate: true }))

/**
 * Model ids the UIs pin to the top of the benchmark table. Live-only: ids
 * that don't exist in the live feed are skipped (or backfilled from the
 * catalog when asked).
 */
export const FEATURED_MODEL_IDS = [
  'openai/gpt-4o-mini',
  'openai/gpt-4o',
  'openai/gpt-4.1-mini',
  'anthropic/claude-3.5-haiku',
  'anthropic/claude-3.7-sonnet',
  'google/gemini-2.0-flash',
  'google/gemini-2.5-pro',
  'mistralai/mistral-small',
  'mistralai/mistral-large',
]

/** Model id used when a scenario does not specify one. */
export const DEFAULT_MODEL_ID = 'openai/gpt-4o-mini'

/**
 * Bundled offline fallback catalog for the image lane. Prices are approximate
 * estimates in USD per generated image (image-capable models typically also
 * quote token pricing for their text input/output, kept here too). Every entry
 * is flagged with `estimate: true`.
 */
export const CATALOG_IMAGE_MODELS: LiveModel[] = [
  { id: 'openai/gpt-5-image', name: 'GPT-5 Image', provider: 'OpenAI', input: 10, output: 10, context: 400_000, image: 0.04, modality: 'text+image->text+image', best: 'Quality + editing' },
  { id: 'openai/gpt-5-image-mini', name: 'GPT-5 Image Mini', provider: 'OpenAI', input: 2.5, output: 2, context: 400_000, image: 0.008, modality: 'text+image->text+image', best: 'High-volume drafts' },
  { id: 'openai/gpt-5.4-image-2', name: 'GPT-5.4 Image 2', provider: 'OpenAI', input: 8, output: 15, context: 272_000, image: 0.03, modality: 'text+image->text+image', best: 'Fast image generation' },
  { id: 'google/gemini-3.1-flash-lite-image', name: 'Nano Banana 2 Lite (Gemini 3.1 Flash Lite Image)', provider: 'Google', input: 0.25, output: 1.5, context: 65_536, image: 0.03, modality: 'text+image->text+image', best: 'Low-cost image batch' },
  { id: 'google/gemini-3.1-flash-image', name: 'Nano Banana 2 (Gemini 3.1 Flash Image)', provider: 'Google', input: 0.5, output: 3, context: 131_072, image: 0.06, modality: 'text+image->text+image', best: 'Pro quality at flash speed' },
  { id: 'google/gemini-3-pro-image', name: 'Nano Banana Pro (Gemini 3 Pro Image)', provider: 'Google', input: 2, output: 12, context: 131_072, image: 0.12, modality: 'text+image->text+image', best: 'Frontier image quality' },
  { id: 'google/gemini-2.5-flash-image', name: 'Gemini 2.5 Flash Image', provider: 'Google', input: 0.3, output: 2.5, context: 32_768, image: 0.03, modality: 'text+image->text+image', best: 'Simple image tasks' },
  { id: 'openai/dall-e-3', name: 'DALL·E 3', provider: 'OpenAI', input: 0, output: 0, context: 0, image: 0.04, best: 'Classic image generation' },
  { id: 'black-forest-labs/flux-1.1-pro', name: 'FLUX 1.1 Pro', provider: 'Black Forest Labs', input: 0, output: 0, context: 0, image: 0.04, best: 'Fast, faithful renders' },
].map((model) => ({ ...model, estimate: true }))

/**
 * Image-model ids the UIs pin to the top of the image-lane benchmark table.
 * Live-only like `FEATURED_MODEL_IDS`: missing ids are skipped or backfilled
 * from `CATALOG_IMAGE_MODELS` when asked.
 */
export const FEATURED_IMAGE_MODEL_IDS = [
  'openai/gpt-5-image',
  'openai/gpt-5-image-mini',
  'openai/gpt-5.4-image-2',
  'google/gemini-3.1-flash-image',
  'google/gemini-3.1-flash-lite-image',
  'google/gemini-3-pro-image',
  'google/gemini-2.5-flash-image',
  'black-forest-labs/flux-1.1-pro',
  'openai/dall-e-3',
]

/** Image-model id used when a scenario does not specify one. */
export const DEFAULT_IMAGE_MODEL_ID = 'openai/gpt-5-image'