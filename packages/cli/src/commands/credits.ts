import type { Command } from 'commander'
import { buildCreditScenario, resolveModelList, SOURCE_OPTION_HELP } from '../helpers.js'
import { runCreditProjection } from '../render.js'

const collect = (value: string, previous: string[]): string[] => previous.concat([value])

export function creditsCommand(program: Command): void {
  program
    .command('credits')
    .description(
      'Project included monthly credits, per-model burn, optional overage budget, and reset timing',
    )
    .option('-m, --model <id>', 'model id (OpenRouter-style, e.g. openai/gpt-4o-mini)')
    .option('-u, --users <n>', 'total users; per-tier splits scale proportionally')
    .option(
      '-t, --tier <spec>',
      'credit tier — usage: Name:users:price:requests:creditsIncluded[:overageBudget[:overagePerCredit]], or tokens: Name:users:price:input:output:quota:creditsIncluded[:overageBudget[:overagePerCredit]] (repeatable)',
      collect,
      [],
    )
    .option('-f, --tiers <file>', 'load credit tiers from a JSON array file')
    .option('--scenario <file>', 'credit scenario JSON file')
    .option('-z, --size <name>', 'interaction size for usage-style tiers: short, medium, long, heavy, or custom (default: medium)')
    .option('--input-per <n>', 'per-exchange input tokens when --size custom')
    .option('--output-per <n>', 'per-exchange output tokens when --size custom')
    .option('--cache-hit <pct>', 'prompt-cache hit rate 0–100 applied to every tier')
    .option('--credit-value <usd>', 'USD value of one credit (default 0.01)')
    .option('--multiplier <n>', 'per-model credit burn multiplier (default 1)')
    .option('--reset <cadence>', 'credit reset: monthly, weekly, or never (default monthly)')
    .option('--reset-day <n>', 'monthly day 1–28, or weekday 0–6 for weekly (default 1)')
    .option('--as-of <iso>', 'as-of date for days-to-reset (ISO date, default now)')
    .option('--source <name>', SOURCE_OPTION_HELP)
    .option('-o, --offline', 'use the bundled estimate catalog instead of the live feed')
    .option('-j, --json', 'output raw JSON')
    .action(
      async (options: {
        model?: string
        users?: string
        tier?: string[]
        tiers?: string
        scenario?: string
        size?: string
        inputPer?: string
        outputPer?: string
        cacheHit?: string
        creditValue?: string
        multiplier?: string
        reset?: string
        resetDay?: string
        asOf?: string
        source?: string
        offline?: boolean
        json?: boolean
      }) => {
        const list = await resolveModelList({ source: options.source, offline: Boolean(options.offline) })
        const { scenario } = await buildCreditScenario({
          scenario: options.scenario,
          model: options.model,
          users: options.users,
          tierSpecs: options.tier,
          tiersFile: options.tiers,
          size: options.size,
          inputPer: options.inputPer,
          outputPer: options.outputPer,
          cacheHit: options.cacheHit,
          creditValue: options.creditValue,
          multiplier: options.multiplier,
          reset: options.reset,
          resetDay: options.resetDay,
          asOf: options.asOf,
        })
        await runCreditProjection(list, scenario, { json: Boolean(options.json), model: options.model })
      },
    )
}
