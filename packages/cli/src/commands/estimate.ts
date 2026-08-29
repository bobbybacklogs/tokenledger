import type { Command } from 'commander'
import type { Scenario } from '@tokenledger/core'
import { buildScenario, loadScenarioFile, resolveModelList } from '../helpers.js'
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
    .option('-z, --size <name>', 'exchange size for usage-style tiers: brief, standard, detailed, intensive (default: standard)')
    .option('-o, --offline', 'use the bundled estimate catalog instead of the live feed')
    .option('--source <name>', 'pricing source: openrouter, models.dev, or offline (default: openrouter)')
    .option('-j, --json', 'output raw JSON')
    .action(
      async (options: {
        model?: string
        users?: string
        tier?: string[]
        tiers?: string
        size?: string
        offline?: boolean
        source?: string
        json?: boolean
      }) => {
        const list = await resolveModelList({ source: options.source, offline: Boolean(options.offline) })
        const { scenario } = await buildScenario({
          model: options.model,
          users: options.users,
          tierSpecs: options.tier,
          tiersFile: options.tiers,
          size: options.size,
        })
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
    .option('--source <name>', 'pricing source: openrouter, models.dev, or offline (default: openrouter)')
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