import type { Command } from 'commander'
import type { Scenario } from '@tokenledger/core'
import pc from 'picocolors'
import { buildScenario, loadScenarioFile, resolveModelList, SOURCE_OPTION_HELP } from '../helpers.js'
import { runProjection } from '../render.js'

const collect = (value: string, previous: string[]): string[] => previous.concat([value])

function parseNumber(value: string): string | undefined {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? String(n) : undefined
}

export function estimateCommand(program: Command): void {
  program
    .command('estimate')
    .description('Project AI spend, revenue, and margin for a model and tier mix')
    .option('-m, --model <id>', 'model id (OpenRouter-style, e.g. openai/gpt-4o-mini)')
    .option('-u, --users <n>', 'total users; per-tier splits scale proportionally')
    .option('-t, --tier <spec>', 'add a tier — usage: Name:users:price:requests, or tokens: Name:users:price:input:output:quota (repeatable)', collect, [])
    .option('-f, --tiers <file>', 'load tiers from a JSON array file')
    .option('-z, --size <name>', 'interaction size for usage-style tiers: short, medium, long, heavy, or custom (default: medium)')
    .option('--input-per <n>', 'per-exchange input tokens when --size custom')
    .option('--output-per <n>', 'per-exchange output tokens when --size custom')
    .option('--cache-hit <pct>', 'prompt-cache hit rate 0–100 applied to every tier (uses the model cacheRead price)')
    .option('-o, --offline', 'use the bundled estimate catalog instead of the live feed')
    .option('--source <name>', SOURCE_OPTION_HELP)
    .option('-j, --json', 'output raw JSON')
    .action(
      async (options: {
        model?: string
        users?: string
        tier?: string[]
        tiers?: string
        size?: string
        inputPer?: string
        outputPer?: string
        cacheHit?: string
        offline?: boolean
        source?: string
        json?: boolean
      }) => {
        const list = await resolveModelList({ source: options.source, offline: Boolean(options.offline) })
        const { scenario, assumption } = await buildScenario({
          model: options.model,
          users: options.users,
          tierSpecs: options.tier,
          tiersFile: options.tiers,
          size: options.size,
          inputPer: options.inputPer,
          outputPer: options.outputPer,
          cacheHit: options.cacheHit,
        })
        if (assumption && !options.json) {
          process.stdout.write(
            pc.dim(`Assumed interaction: ${assumption.label} — ${assumption.perInput} in / ${assumption.perOutput} out tokens per exchange.\n`),
          )
        }
        await runProjection(list, scenario, { json: Boolean(options.json), model: options.model })
      },
    )
}

export function scenarioCommand(program: Command): void {
  program
    .command('scenario')
    .description('Run a projection from a scenario JSON file')
    .argument('<file>', 'path to a scenario JSON file')
    .option('-m, --model <id>', 'override the scenario model')
    .option('-u, --users <n>', 'override total users', parseNumber)
    .option('-o, --offline', 'use the bundled estimate catalog instead of the live feed')
    .option('--source <name>', SOURCE_OPTION_HELP)
    .option('-j, --json', 'output raw JSON')
    .action(
      async (
        file: string,
        options: { model?: string; users?: string; offline?: boolean; source?: string; json?: boolean },
      ) => {
        const list = await resolveModelList({ source: options.source, offline: Boolean(options.offline) })
        const scenario = await parseScenarioFile(file, options)
        await runProjection(list, scenario, { json: Boolean(options.json), model: options.model })
      },
    )
}

async function parseScenarioFile(file: string, overrides: { model?: string; users?: string }): Promise<Scenario> {
  const { scenario } = await loadScenarioFile(file)
  if (overrides.model) scenario.model = overrides.model
  if (overrides.users !== undefined) scenario.users = Number(overrides.users)
  return scenario
}