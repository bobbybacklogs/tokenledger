import type { Command } from 'commander'
import { buildImageScenario, resolveModelList } from '../helpers.js'
import { runImageProjection } from '../render.js'

/** Project the image lane (image model × images/user × users) for a tier mix. */
export function imageEstimateCommand(program: Command): void {
  const collect = (value: string, previous: string[]): string[] => previous.concat([value])

  program
    .command('image-estimate')
    .description('Project image-generation spend, revenue, and margin (image model × images/user × users)')
    .option('-m, --model <id>', 'image model id (OpenRouter-style, e.g. openai/gpt-5-image)')
    .option('-u, --users <n>', 'total users; per-tier splits scale proportionally')
    .option('-t, --tier <spec>', 'add a tier: Name:users:price:imagesPerUser:quota (repeatable)', collect, [])
    .option('-f, --tiers <file>', 'load tiers from a JSON array file')
    .option('-o, --offline', 'use the bundled estimate catalog instead of the live feed')
    .option('-j, --json', 'output raw JSON')
    .action(
      async (options: {
        model?: string
        users?: string
        tier?: string[]
        tiers?: string
        offline?: boolean
        json?: boolean
      }) => {
        const list = await resolveModelList({ offline: Boolean(options.offline) })
        const { scenario } = await buildImageScenario({
          model: options.model,
          users: options.users,
          tierSpecs: options.tier,
          tiersFile: options.tiers,
        })
        await runImageProjection(list, scenario, { json: Boolean(options.json), model: options.model })
      },
    )
}