import type { Command } from 'commander'
import { buildVideoScenario, resolveModelList, SOURCE_OPTION_HELP } from '../helpers.js'
import { runVideoProjection } from '../render.js'

export function videoEstimateCommand(program: Command): void {
  const collect = (value: string, previous: string[]): string[] => previous.concat([value])

  program
    .command('video-estimate')
    .description('Project video-generation spend, revenue, and margin (video model × seconds/user × users)')
    .option('-m, --model <id>', 'video model id (e.g. alibaba/wan-v2.6-t2v)')
    .option('-u, --users <n>', 'total users; per-tier splits scale proportionally')
    .option('-t, --tier <spec>', 'add a tier: Name:users:price:secondsPerUser:quota (repeatable)', collect, [])
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
        const { scenario } = await buildVideoScenario({
          model: options.model,
          users: options.users,
          tierSpecs: options.tier,
          tiersFile: options.tiers,
        })
        await runVideoProjection(list, scenario, { json: Boolean(options.json), model: options.model })
      },
    )
}
