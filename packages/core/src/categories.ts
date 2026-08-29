import type { LiveModel } from './types.js'

/**
 * Coarse model categories used for browsing and filtering. Categories are
 * inferred from a model's id, display name, per-image pricing, and modality
 * string (best-effort), since neither OpenRouter nor models.dev exposes an
 * explicit category field.
 */
export type ModelCategory =
  | 'general'
  | 'coding'
  | 'reasoning'
  | 'vision'
  | 'image'
  | 'embedding'
  | 'audio'

/** Every supported category, in the order used for precedence. */
export const MODEL_CATEGORIES: readonly ModelCategory[] = [
  'image',
  'embedding',
  'audio',
  'coding',
  'reasoning',
  'vision',
  'general',
]

const embeddingRe = /\b(embedding|embeddings|text-embedding|\be5\b|\bbge\b)\b/
const audioRe = /\b(audio|whisper|speech|voice|tts)\b/
const codingRe = /\b(coder|codex|coding|codegen|code-basil|\bcode\b)\b/
const reasoningRe = /\bo[134](?=\b|[-_])|thinking|reasoner|reasoning|think-|\br[12]\b/

/**
 * Assign a coarse category to a model.
 *
 * Precedence: image generation (per-image pricing) → embedding → audio →
 * coding → reasoning → vision (modality) → general.
 */
export function categorizeModel(model: {
  id: string
  name: string
  image?: number
  modality?: string
}): ModelCategory {
  const hay = `${model.id} ${model.name}`.toLowerCase()

  // Per-image output pricing is the most concrete signal we have.
  if (typeof model.image === 'number' && model.image > 0) return 'image'

  if (embeddingRe.test(hay)) return 'embedding'
  if (audioRe.test(hay)) return 'audio'
  if (codingRe.test(hay)) return 'coding'
  if (reasoningRe.test(hay)) return 'reasoning'

  // Modality is only retained for some models/feeds (e.g. models.dev always,
  // OpenRouter only alongside image pricing). Best-effort vision detection.
  if (model.modality && model.modality.toLowerCase().includes('image')) return 'vision'

  return 'general'
}

/** True when a model belongs to the given category. */
export function matchesCategory(model: LiveModel, category: ModelCategory): boolean {
  return categorizeModel(model) === category
}

/** A short human label for a category. */
export function categoryLabel(category: ModelCategory): string {
  switch (category) {
    case 'general':
      return 'Text (general)'
    case 'coding':
      return 'Coding'
    case 'reasoning':
      return 'Reasoning'
    case 'vision':
      return 'Vision'
    case 'image':
      return 'Image generation'
    case 'embedding':
      return 'Embeddings'
    case 'audio':
      return 'Audio / speech'
  }
}
