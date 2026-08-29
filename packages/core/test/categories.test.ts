import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { categorizeModel } from '../dist/index.js'

describe('categorizeModel', () => {
  it('classifies image generation from per-image pricing', () => {
    assert.equal(categorizeModel({ id: 'openai/gpt-image-1', name: 'GPT Image 1', image: 0.04 }), 'image')
    assert.equal(categorizeModel({ id: 'google/imagen-3', name: 'Imagen 3', image: 0.04 }), 'image')
  })

  it('classifies coding models by id/name', () => {
    assert.equal(categorizeModel({ id: 'qwen/qwen2.5-coder-7b', name: 'Qwen2.5 Coder' }), 'coding')
    assert.equal(categorizeModel({ id: 'openai/codex-1', name: 'Codex' }), 'coding')
    assert.equal(categorizeModel({ id: 'anthropic/claude-code', name: 'Claude Code' }), 'coding')
    assert.equal(categorizeModel({ id: 'deepseek/deepseek-coder', name: 'DeepSeek Coder' }), 'coding')
  })

  it('classifies reasoning models', () => {
    assert.equal(categorizeModel({ id: 'openai/o3', name: 'OpenAI o3' }), 'reasoning')
    assert.equal(categorizeModel({ id: 'deepseek/deepseek-r1', name: 'DeepSeek R1' }), 'reasoning')
    assert.equal(categorizeModel({ id: 'google/gemini-2.5-flash-thinking', name: 'Gemini Flash Thinking' }), 'reasoning')
  })

  it('detects vision from modality when present', () => {
    assert.equal(categorizeModel({ id: 'openai/gpt-4o', name: 'GPT-4o', modality: 'text+image->text' }), 'vision')
  })

  it('classifies embeddings and audio', () => {
    assert.equal(categorizeModel({ id: 'openai/text-embedding-3-large', name: 'Embedding 3' }), 'embedding')
    assert.equal(categorizeModel({ id: 'openai/whisper-1', name: 'Whisper' }), 'audio')
  })

  it('falls back to general for everything else', () => {
    assert.equal(categorizeModel({ id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' }), 'general')
    assert.equal(categorizeModel({ id: 'openai/gpt-4o-mini', name: 'GPT-4o mini' }), 'general')
  })
})
