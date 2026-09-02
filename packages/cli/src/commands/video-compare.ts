import {
  calculateVideoScenario,
  featuredVideoModels,
  findModel,
  isVideoModel,
  money,
  monthlyVideoSeconds,
  number,
  type LiveModel,
  type ModelList,
  type Projection,
} from '@tokenledger/core'
import pc from 'picocolors'
import type { Command } from 'commander'
import { renderTable, type Column } from '../table.js'
import { buildVideoScenario, resolveModelList, SOURCE_OPTION_HELP, sourceLine } from '../helpers.js'

interface VideoCompareRow {
  model: LiveModel
  projection: Projection
}

const videoCompareColumns: Column<VideoCompareRow>[] = [
  { header: 'Video model', value: (row) => row.model.id },
  { header: 'Provider', value: (row) => row.model.provider },
  { header: 'Price/second', align: 'right', value: (row) => money(row.model.video ?? 0) },
  { header: 'Seconds/user', align: 'right', value: (row) => secondsPerUser(row) },
  { header: 'Video spend/mo', align: 'right', value: (row) => money(row.projection.spend) },
  { header: 'Blended/user', align: 'right', value: (row) => money(row.projection.weightedCost) },
  { header: 'Rev/mo', align: 'right', value: (row) => money(row.projection.revenue) },
  { header: 'Gross margin', align: 'right', value: (row) => row.projection.margin.toFixed(1) + '%' },
]

function secondsPerUser(row: VideoCompareRow): string {
  const seconds = monthlyVideoSeconds(row.projection.scenario.tiers)
  return row.projection.users > 0 ? number(Math.round((seconds / row.projection.users) * 10) / 10) : '0'
}

const collect = (value: string, previous: string[]): string[] => previous.concat([value])

export function videoCompareCommand(program: Command): void {
  program
    .command('video-compare')
    .description('Compare video-generation models against the same scenario')
    .argument('[models...]', 'video model ids to compare (defaults to the curated featured set)')
    .option('--scenario <file>', 'scenario JSON file to compare against')
    .option('-t, --tier <spec>', 'add a tier: Name:users:price:secondsPerUser:quota (repeatable)', collect, [])
    .option('-f, --tiers <file>', 'load tiers from a JSON array file')
    .option('-u, --users <n>', 'override total users')
    .option('-l, --limit <n>', 'with no model ids, compare the first N featured video models (default 8)', Number)
    .option('--source <name>', SOURCE_OPTION_HELP)
    .option('-o, --offline', 'use the bundled estimate catalog instead of the live feed')
    .option('-j, --json', 'output raw JSON')
    .action(
      async (
        modelArgs: string[] | undefined,
        options: {
          scenario?: string
          tier?: string[]
          tiers?: string
          users?: string
          limit?: number
          source?: string
          offline?: boolean
          json?: boolean
        },
      ) => {
        const list: ModelList = await resolveModelList({ source: options.source, offline: Boolean(options.offline) })
        const limit = options.limit ?? 8
        const { scenario } = await buildVideoScenario({
          scenario: options.scenario,
          users: options.users,
          tierSpecs: options.tier,
          tiersFile: options.tiers,
        })

        const queries = modelArgs && modelArgs.length > 0 ? modelArgs : featuredVideoModels(list.models, { max: limit }).map((m) => m.id)
        const results: VideoCompareRow[] = []
        const skipped: string[] = []
        for (const query of queries) {
          const model = findModel(list.models, query)
          if (!model || !isVideoModel(model)) {
            skipped.push(query)
            continue
          }
          results.push({ model, projection: calculateVideoScenario(scenario, model) })
        }
        results.sort((a, b) => a.projection.spend - b.projection.spend)

        if (options.json) {
          process.stdout.write(JSON.stringify({ source: list.source, fetchedAt: list.fetchedAt, scenario, skipped, results: results.map(({ model, projection }) => ({ model, projection })) }, null, 2) + '\n')
          return
        }

        if (results.length === 0) {
          process.stderr.write(pc.red('No matching video models found. Try "tokenledger videos" to browse the catalog.\n'))
          process.exit(1)
        }

        for (const skippedModel of skipped) process.stderr.write(pc.yellow(`Skipped unknown or non-video model: ${skippedModel}\n`))
        process.stdout.write('\n' + pc.bold(`Scenario: ${scenario.name}`) + '\n\n')
        process.stdout.write(renderTable(results, videoCompareColumns) + '\n')
        process.stdout.write('Pricing source: ' + sourceLine(list) + '\n\n')
        if (skipped.length > 0) process.stdout.write(pc.yellow(`${skipped.length} model(s) not found.`) + '\n\n')
      },
    )
}
