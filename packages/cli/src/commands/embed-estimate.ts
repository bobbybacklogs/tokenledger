import type { Command } from 'commander'
import { buildEmbeddingScenario, resolveModelList, SOURCE_OPTION_HELP } from '../helpers.js'
import { runEmbeddingProjection } from '../render.js'

export function embedEstimateCommand(program: Command): void {
  const collect = (value: string, previous: string[]): string[] => previous.concat([value])

  program
    .command('embed-estimate')
    .description('Project embeddings spend, revenue, and margin (embed model × tokens/user × users)')
    .option('-m, --model <id>', 'embedding model id (e.g. openai/text-embedding-3-small)')
    .option('-u, --users <n>', 'total users; per-tier splits scale proportionally')
    .option('-t, --tier <spec>', 'add a tier: Name:users:price:embedTokensPerUser:quota (repeatable)', collect, [])
    .option('-f, --tiers <file>', 'load tiers from a JSON array file')
    .option('--source <name>', SOURCE_OPTION_HELP)
    .option('-o, --offline', 'use the bundled estimate catalog instead of the live feed')
    .option('-j, --json', 'output raw JSON')
    .action(
      async (options: {
        model?: string
        users?: string
        tier?: string[]
        tiers?: string
        source?: string
        offline?: boolean
        json?: boolean
      }) => {
        const list = await resolveModelList({ source: options.source, offline: Boolean(options.offline) })
        const { scenario } = await buildEmbeddingScenario({
          model: options.model,
          users: options.users,
          tierSpecs: options.tier,
          tiersFile: options.tiers,
        })
        await runEmbeddingProjection(list, scenario, { json: Boolean(options.json), model: options.model })
      },
    )
}
