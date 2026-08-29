import { createInterface, type Interface } from 'node:readline'
import {
  DEFAULT_IMAGE_MODEL_ID,
  DEFAULT_MODEL_ID,
  calculateImageScenario,
  calculateScenario,
  defaultImageScenario,
  defaultScenario,
  isImageModel,
  money,
  type LiveModel,
  type ModelList,
  type Scenario,
  type TierConfig,
} from '@tokenledger/core'
import type { Command } from 'commander'
import pc from 'picocolors'
import { resolveModelList, sourceLine } from '../helpers.js'
import { renderImageProjection, renderProjection } from '../render.js'

type Lane = 'tokens' | 'images'

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
    .option('-n, --name <name>', 'pre-set the scenario name')
    .option('-f, --file <file>', 'pre-set the file to save the scenario to')
    .action(async (options: { offline?: boolean; name?: string; file?: string }) => {
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
        const list = await resolveModelList(Boolean(options.offline))
        process.stdout.write(
          pc.cyan('=== TokenLedger scenario wizard ===\n') +
            pc.dim('Press Enter to accept the [default] for each question.\n') +
            `Pricing: ${sourceLine(list)}\n`,
        )

        const name = await ask('Scenario name', options.name ?? 'My plan')
        const lane = await chooseLane(prompter)
        process.stdout.write('\n' + pc.cyan(lane === 'tokens' ? '── Model ──' : '── Image model ──') + '\n')
        const model = await pickModel(prompter, list, lane)
        process.stdout.write(pc.dim(`  Chosen: ${model.id}\n`))

        process.stdout.write('\n' + pc.cyan('── Users ──') + '\n')
        const totalUsers = await askTotalUsers(prompter)

        process.stdout.write('\n' + pc.cyan('── Tiers ──') + '\n')
        const count = await askTierCount(prompter)
        const tiers = await collectTiers(prompter, count, lane)

        const scenario: Scenario = {
          name,
          model: model.id,
          ...(totalUsers !== undefined ? { users: totalUsers } : {}),
          tiers,
        }

        const projection = lane === 'tokens' ? calculateScenario(scenario, model) : calculateImageScenario(scenario, model)
        process.stdout.write('\n' + (lane === 'tokens' ? renderProjection(projection) : renderImageProjection(projection)) + '\n')
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

async function chooseLane(p: Prompter): Promise<Lane> {
  process.stdout.write('\n' + pc.cyan('── What to model ──') + '\n')
  process.stdout.write('  1. Token costs — LLM tokens used per user per month\n')
  process.stdout.write('  2. Image generation — images generated per user per month\n')
  for (;;) {
    const raw = await p.ask('What do you want to model?', '1')
    const value = raw.trim().toLowerCase()
    if (value === '1' || value.startsWith('token')) return 'tokens'
    if (value === '2' || value.startsWith('image')) return 'images'
    process.stdout.write(pc.red('  Pick 1 (token costs) or 2 (image generation).\n'))
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

async function collectTiers(p: Prompter, count: number, lane: Lane): Promise<TierConfig[]> {
  const defaults = (lane === 'images' ? defaultImageScenario() : defaultScenario()).tiers
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
      const input = await askNumber(p, '  Input tokens per user / month', base.input)
      const output = await askNumber(p, '  Output tokens per user / month', base.output)
      const quota = await askNumber(p, '  Monthly token quota per user', base.quota)
      tiers.push({ name, users, price, input, output, quota })
    } else {
      const images = await askNumber(p, '  Images per user / month', base.images ?? 0)
      tiers.push({ name, users, price, input: 0, output: 0, quota: 0, images })
    }
  }
  return tiers
}

async function pickModel(p: Prompter, list: ModelList, lane: Lane): Promise<LiveModel> {
  const pool = list.models
  const defaultId =
    lane === 'images'
      ? pool.some((m) => m.id === DEFAULT_IMAGE_MODEL_ID)
        ? DEFAULT_IMAGE_MODEL_ID
        : pool.find(isImageModel)?.id
      : pool.some((m) => m.id === DEFAULT_MODEL_ID)
        ? DEFAULT_MODEL_ID
        : pool[0]?.id
  if (!defaultId) {
    process.stderr.write(pc.red(`No ${lane === 'images' ? 'image ' : ''}models available — run "tokenledger models" or retry without --offline.\n`))
    process.exit(1)
  }

  const label = lane === 'images' ? 'Image model id or search' : 'Model id or search'
  for (;;) {
    const raw = await p.ask(label, defaultId)
    const q = raw.trim().toLowerCase()
    // Exact id or name selects immediately; anything vaguer goes through the picker.
    const exact = pool.find((m) => m.id.toLowerCase() === q) ?? pool.find((m) => m.name.toLowerCase() === q)
    if (exact) {
      if (lane === 'tokens' || exact.image !== undefined) return exact
      process.stdout.write(pc.yellow(`  "${exact.id}" has no per-image pricing — pick one below or search again.\n`))
    }
    const matches = pool
      .filter((m) => (lane === 'images' ? isImageModel(m) : true))
      .filter((m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q))
      .sort((a, b) => a.provider.localeCompare(b.provider) || a.id.localeCompare(b.id))
      .slice(0, 8)
    if (matches.length === 0) {
      process.stdout.write(pc.red(`  No models match "${raw}". Try "claude", "gpt", "gemini", or a full id.\n`))
      continue
    }
    matches.forEach((m, i) => {
      const price = lane === 'images' ? `${money(m.image ?? 0)}/image` : `${money(m.input)} / ${money(m.output)}`
      process.stdout.write(`  ${pc.bold(String(i + 1))}. ${m.id}  ${pc.dim(m.provider)}  ${price}\n`)
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