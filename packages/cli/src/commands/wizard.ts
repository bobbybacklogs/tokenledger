import { createInterface, type Interface } from 'node:readline'
import {
  DEFAULT_EMBEDDING_MODEL_ID,
  DEFAULT_IMAGE_MODEL_ID,
  DEFAULT_MODEL_ID,
  DEFAULT_VIDEO_MODEL_ID,
  EXCHANGE_PRESETS,
  PRESET_SIZES,
  calculateEmbeddingScenario,
  calculateImageScenario,
  calculateScenario,
  calculateVideoScenario,
  defaultEmbeddingScenario,
  defaultImageScenario,
  defaultScenario,
  defaultVideoScenario,
  isEmbeddingModel,
  isImageModel,
  isVideoModel,
  money,
  tierFromUsage,
  type ExchangeSize,
  type LiveModel,
  type ModelList,
  type Scenario,
  type TierConfig,
} from '@tokenledger/core'
import type { Command } from 'commander'
import pc from 'picocolors'
import { resolveModelList, SOURCE_OPTION_HELP, sourceLine, type ExchangeConfig } from '../helpers.js'
import { renderEmbeddingProjection, renderImageProjection, renderProjection, renderVideoProjection } from '../render.js'

type Lane = 'tokens' | 'images' | 'embeddings' | 'video'

/** Reads answers one line at a time; queued input is never dropped. */
interface Prompter {
  ask(text: string, fallback?: string): Promise<string>
}

/**
 * Build a scenario interactively, one question at a time.
 * Every prompt accepts Enter for the [default]; searches find models by
 * id or name, and the finished scenario is projected and optionally saved.
 */
export function wizardCommand(program: Command): void {
  program
    .command('wizard')
    .description('Build a scenario interactively, step by step (no JSON needed)')
    .option('-o, --offline', 'use the bundled estimate catalog instead of the live feed')
    .option('--source <name>', SOURCE_OPTION_HELP)
    .option('-n, --name <name>', 'pre-set the scenario name')
    .option('-f, --file <file>', 'pre-set the file to save the scenario to')
    .action(async (options: { offline?: boolean; source?: string; name?: string; file?: string }) => {
      if (!process.stdin.isTTY && !process.env.TOKENLEDGER_WIZARD_SCRIPT) {
        process.stderr.write(
          pc.yellow('The wizard is interactive — run it in a terminal, or pipe answers line by line with TOKENLEDGER_WIZARD_SCRIPT=1.\n'),
        )
        process.exit(1)
      }

      const rl: Interface = createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: Boolean(process.stdin.isTTY),
      })
      rl.on('SIGINT', () => {
        process.stdout.write('\nCancelled.\n')
        process.exit(130)
      })
      const lines = rl[Symbol.asyncIterator]()

      /** Prompt one question and read one answer line (queued, EOF-safe). */
      const ask = async (text: string, fallback?: string): Promise<string> => {
        const suffix = fallback === undefined ? '' : ` ${pc.dim(`[${fallback}]`)}`
        process.stdout.write(pc.bold(text) + suffix + ' ')
        const next = await lines.next()
        if (next.done) {
          process.stdout.write('\n' + pc.dim('No input — cancelling.\n'))
          process.exit(130)
        }
        return next.value.trim() || (fallback ?? '')
      }
      const prompter: Prompter = { ask }

      try {
        const list = await resolveModelList({ source: options.source, offline: Boolean(options.offline) })
        process.stdout.write(
          pc.cyan('=== TokenLedger scenario wizard ===\n') +
            pc.dim('Press Enter to accept the [default] for each question.\n') +
            `Pricing: ${sourceLine(list)}\n`,
        )

        const name = await ask('Scenario name', options.name ?? 'My plan')
        const lane = await chooseLane(prompter)
        process.stdout.write('\n' + pc.cyan(laneHeading(lane)) + '\n')
        const model = await pickModel(prompter, list, lane)
        process.stdout.write(pc.dim(`  Chosen: ${model.id}\n`))

        process.stdout.write('\n' + pc.cyan('── Users ──') + '\n')
        const totalUsers = await askTotalUsers(prompter)

        process.stdout.write('\n' + pc.cyan('── Tiers ──') + '\n')
        const exchangeConfig: ExchangeConfig = lane === 'tokens' ? await chooseExchangeSize(prompter) : { size: 'medium' }
        const count = await askTierCount(prompter)
        const tiers = await collectTiers(prompter, count, lane, exchangeConfig)

        const scenario: Scenario = {
          name,
          model: model.id,
          ...(totalUsers !== undefined ? { users: totalUsers } : {}),
          tiers,
        }

        const projection =
          lane === 'tokens'
            ? calculateScenario(scenario, model)
            : lane === 'images'
              ? calculateImageScenario(scenario, model)
              : lane === 'embeddings'
                ? calculateEmbeddingScenario(scenario, model)
                : calculateVideoScenario(scenario, model)
        const rendered =
          lane === 'tokens'
            ? renderProjection(projection)
            : lane === 'images'
              ? renderImageProjection(projection)
              : lane === 'embeddings'
                ? renderEmbeddingProjection(projection)
                : renderVideoProjection(projection)
        process.stdout.write('\n' + rendered + '\n')
        process.stdout.write('Pricing source: ' + sourceLine(list) + '\n')

        await maybeSave(prompter, scenario, options.file)
      } finally {
        rl.close()
      }
    })
}

async function askNumber(p: Prompter, text: string, fallback: number, kind = 'number'): Promise<number> {
  return askPositiveNumber(p, text, fallback, kind, false)
}

async function askPositiveNumber(p: Prompter, text: string, fallback: number, kind: string, integerOnly: boolean): Promise<number> {
  for (;;) {
    const raw = await p.ask(text, String(fallback))
    const n = Number(raw)
    const valid = Number.isFinite(n) && n >= 0 && (!integerOnly || Number.isInteger(n))
    if (valid) return n
    process.stdout.write(pc.red(`  Please enter a valid ${kind} (${integerOnly ? 'a whole' : 'a non-negative'} number).\n`))
  }
}

function laneHeading(lane: Lane): string {
  switch (lane) {
    case 'images':
      return '── Image model ──'
    case 'embeddings':
      return '── Embedding model ──'
    case 'video':
      return '── Video model ──'
    default:
      return '── Model ──'
  }
}

async function chooseLane(p: Prompter): Promise<Lane> {
  process.stdout.write('\n' + pc.cyan('── What to model ──') + '\n')
  process.stdout.write('  1. Token costs — LLM tokens used per user per month (optional cache-hit %)\n')
  process.stdout.write('  2. Image generation — images generated per user per month\n')
  process.stdout.write('  3. Embeddings — embedding tokens per user per month\n')
  process.stdout.write('  4. Video generation — generated seconds per user per month\n')
  for (;;) {
    const raw = await p.ask('What do you want to model?', '1')
    const value = raw.trim().toLowerCase()
    if (value === '1' || value.startsWith('token')) return 'tokens'
    if (value === '2' || value.startsWith('image')) return 'images'
    if (value === '3' || value.startsWith('embed')) return 'embeddings'
    if (value === '4' || value.startsWith('video')) return 'video'
    process.stdout.write(pc.red('  Pick 1 (tokens), 2 (images), 3 (embeddings), or 4 (video).\n'))
  }
}

async function askTotalUsers(p: Prompter): Promise<number | undefined> {
  process.stdout.write(
    pc.dim('  When set, total users scales your per-tier splits to add up. Type 0 to keep tier counts as-is.\n'),
  )
  for (;;) {
    const raw = await p.ask('Total users across all tiers?', '12000')
    if (raw.trim() === '0' || ['skip', 'none', '-'].includes(raw.trim().toLowerCase())) return undefined
    const n = Number(raw)
    if (Number.isFinite(n) && n > 0 && Number.isInteger(n)) return n
    process.stdout.write(pc.red('  Please enter a whole number of users, or 0 to skip scaling.\n'))
  }
}

async function askTierCount(p: Prompter): Promise<number> {
  process.stdout.write(pc.dim('  Start simple: Free users pay $0, paying tiers carry the AI cost.\n'))
  for (;;) {
    const n = await askPositiveNumber(p, 'Number of customer tiers?', 3, 'tier count', true)
    if (n >= 1) return n
    process.stdout.write(pc.red('  You need at least one tier.\n'))
  }
}

function defaultTiersFor(lane: Lane): TierConfig[] {
  if (lane === 'images') return defaultImageScenario().tiers
  if (lane === 'embeddings') return defaultEmbeddingScenario().tiers
  if (lane === 'video') return defaultVideoScenario().tiers
  return defaultScenario().tiers
}

async function collectTiers(p: Prompter, count: number, lane: Lane, config: ExchangeConfig): Promise<TierConfig[]> {
  const defaults = defaultTiersFor(lane)
  const fallback: TierConfig =
    defaults[defaults.length - 1] ?? { name: 'Tier', users: 1000, price: 0, input: 18_000, output: 6_000, quota: 25_000 }
  const tiers: TierConfig[] = []
  for (let i = 0; i < count; i++) {
    const base: TierConfig = defaults[i] ?? { ...fallback, name: `Tier ${i + 1}` }
    process.stdout.write(pc.cyan(`\n  Tier ${i + 1}/${count} — ${base.name}\n`))
    const name = await p.ask('  Name', base.name)
    const users = await askNumber(p, '  Users', base.users)
    const price = await askNumber(p, '  Subscription price per user / month ($)', base.price)
    if (lane === 'tokens') {
      const requests = await askNumber(p, '  Requests per user / month', 300)
      const cacheHit = await askNumber(p, '  Prompt-cache hit rate %', base.cacheHit ?? 0)
      const { input, output, quota } = tierFromUsage({
        requestsPerUserPerMonth: requests,
        exchangeSize: config.size,
        ...(config.size === 'custom'
          ? { inputTokensPerExchange: config.inputTokens, outputTokensPerExchange: config.outputTokens }
          : {}),
      })
      tiers.push({ name, users, price, input, output, quota, cacheHit })
      process.stdout.write(
        pc.dim(`  → ${input.toLocaleString()} in / ${output.toLocaleString()} out / ${quota.toLocaleString()} quota tokens per user / month\n`),
      )
    } else if (lane === 'images') {
      const images = await askNumber(p, '  Images per user / month', base.images ?? 0)
      tiers.push({ name, users, price, input: 0, output: 0, quota: 0, images })
    } else if (lane === 'embeddings') {
      const embedTokens = await askNumber(p, '  Embedding tokens per user / month', base.embedTokens ?? 0)
      tiers.push({ name, users, price, input: 0, output: 0, quota: 0, embedTokens })
    } else {
      const videoSeconds = await askNumber(p, '  Video seconds per user / month', base.videoSeconds ?? 0)
      tiers.push({ name, users, price, input: 0, output: 0, quota: 0, videoSeconds })
    }
  }
  return tiers
}

const SIZE_BY_NAME: Record<string, ExchangeSize> = {
  short: 'short',
  brief: 'short',
  quick: 'short',
  medium: 'medium',
  standard: 'medium',
  normal: 'medium',
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

/** Ask how big a typical AI interaction is, returning the exchange config. */
async function chooseExchangeSize(p: Prompter): Promise<ExchangeConfig> {
  process.stdout.write('\n' + pc.cyan('── Average interaction size ──') + '\n')
  PRESET_SIZES.forEach((size, i) => {
    const estimate = EXCHANGE_PRESETS[size]
    process.stdout.write(`  ${i + 1}. ${estimate.label} — ${estimate.description}\n`)
  })
  process.stdout.write(`  ${PRESET_SIZES.length + 1}. Custom — your own input/output tokens\n`)
  for (;;) {
    const raw = await p.ask('How big is a typical AI interaction?', '2')
    const value = raw.trim().toLowerCase()
    if (/^[1-4]$/.test(value)) {
      const size = PRESET_SIZES[Number(value) - 1]!
      const estimate = EXCHANGE_PRESETS[size]
      process.stdout.write(pc.dim(`  → Assumed ${estimate.input} in / ${estimate.output} out tokens per exchange.\n`))
      return { size }
    }
    if (value === '5' || SIZE_BY_NAME[value] === 'custom') {
      const inputTokens = await askNumber(p, '  Average input tokens per exchange', 400)
      const outputTokens = await askNumber(p, '  Average output tokens per exchange', 800)
      process.stdout.write(pc.dim(`  → Custom: ${inputTokens} in / ${outputTokens} out tokens per exchange.\n`))
      return { size: 'custom', inputTokens, outputTokens }
    }
    const preset = SIZE_BY_NAME[value]
    if (preset) {
      const estimate = EXCHANGE_PRESETS[preset]
      process.stdout.write(pc.dim(`  → Assumed ${estimate.input} in / ${estimate.output} out tokens per exchange.\n`))
      return { size: preset }
    }
    process.stdout.write(pc.red('  Pick 1–4, or 5 for Custom.\n'))
  }
}

function laneFilter(lane: Lane): (model: LiveModel) => boolean {
  if (lane === 'images') return isImageModel
  if (lane === 'embeddings') return isEmbeddingModel
  if (lane === 'video') return isVideoModel
  return () => true
}

function laneDefaultId(lane: Lane, pool: readonly LiveModel[]): string | undefined {
  if (lane === 'images') return pool.some((m) => m.id === DEFAULT_IMAGE_MODEL_ID) ? DEFAULT_IMAGE_MODEL_ID : pool.find(isImageModel)?.id
  if (lane === 'embeddings') return pool.some((m) => m.id === DEFAULT_EMBEDDING_MODEL_ID) ? DEFAULT_EMBEDDING_MODEL_ID : pool.find(isEmbeddingModel)?.id
  if (lane === 'video') return pool.some((m) => m.id === DEFAULT_VIDEO_MODEL_ID) ? DEFAULT_VIDEO_MODEL_ID : pool.find(isVideoModel)?.id
  return pool.some((m) => m.id === DEFAULT_MODEL_ID) ? DEFAULT_MODEL_ID : pool[0]?.id
}

function lanePrice(lane: Lane, model: LiveModel): string {
  if (lane === 'images') return `${money(model.image ?? 0)}/image`
  if (lane === 'embeddings') return `${money(model.input)}/1M`
  if (lane === 'video') return `${money(model.video ?? 0)}/s`
  return `${money(model.input)} / ${money(model.output)}`
}

async function pickModel(p: Prompter, list: ModelList, lane: Lane): Promise<LiveModel> {
  const pool = list.models
  const defaultId = laneDefaultId(lane, pool)
  if (!defaultId) {
    process.stderr.write(pc.red(`No ${lane} models available — run "tokenledger models" or retry without --offline.\n`))
    process.exit(1)
  }

  const label = lane === 'tokens' ? 'Model id or search' : `${lane[0]!.toUpperCase()}${lane.slice(1)} model id or search`
  const filter = laneFilter(lane)
  for (;;) {
    const raw = await p.ask(label, defaultId)
    const q = raw.trim().toLowerCase()
    const exact = pool.find((m) => m.id.toLowerCase() === q) ?? pool.find((m) => m.name.toLowerCase() === q)
    if (exact) {
      if (filter(exact)) return exact
      process.stdout.write(pc.yellow(`  "${exact.id}" is not a ${lane} model — pick one below or search again.\n`))
    }
    const matches = pool
      .filter(filter)
      .filter((m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q))
      .sort((a, b) => a.provider.localeCompare(b.provider) || a.id.localeCompare(b.id))
      .slice(0, 8)
    if (matches.length === 0) {
      process.stdout.write(pc.red(`  No models match "${raw}". Try "claude", "gpt", "gemini", or a full id.\n`))
      continue
    }
    matches.forEach((m, i) => {
      process.stdout.write(`  ${pc.bold(String(i + 1))}. ${m.id}  ${pc.dim(m.provider)}  ${lanePrice(lane, m)}\n`)
    })
    const picked = await p.ask('Pick a model', '')
    const index = Number(picked) - 1
    const match = matches[index]
    if (match) return match
    process.stdout.write(pc.red('  Pick one of the numbered models above.\n'))
  }
}

async function maybeSave(p: Prompter, scenario: Scenario, presetFile?: string): Promise<void> {
  const file = presetFile ?? (await p.ask('Save scenario to file? (Enter = scenario.json, or a path)', 'scenario.json'))
  if (['no', 'n', 'skip', '-'].includes(file.trim().toLowerCase())) {
    process.stdout.write(pc.dim('  Not saved.\n'))
    return
  }
  try {
    const fs = await import('node:fs/promises')
    await fs.writeFile(file, JSON.stringify(scenario, null, 2) + '\n')
    process.stdout.write(pc.green(`  Saved ${file}\n`))
    process.stdout.write(pc.dim(`  Re-run it with: tokenledger scenario ${file}\n`))
  } catch (error) {
    process.stderr.write(pc.red(`  Could not write ${file}: ${error instanceof Error ? error.message : String(error)}\n`))
  }
}