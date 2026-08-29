import {
  calculateScenario,
  contextLabel,
  featuredModels,
  findModel,
  money,
  type LiveModel,
  type ModelList,
  type Projection,
} from '@tokenledger/core'
import pc from 'picocolors'
import type { Command } from 'commander'
import { renderTable, type Column } from '../table.js'
import { buildScenario, resolveModelList, sourceLine } from '../helpers.js'

interface CompareRow {
  model: LiveModel
  projection: Projection
}

const compareColumns: Column<CompareRow>[] = [
  { header: 'Model', value: (row) => row.model.id },
  { header: 'Provider', value: (row) => row.model.provider },
  { header: 'Input/1M', align: 'right', value: (row) => money(row.model.input) },
  { header: 'Output/1M', align: 'right', value: (row) => money(row.model.output) },
  { header: 'Context', align: 'right', value: (row) => contextLabel(row.model.context) },
  { header: 'AI spend/mo', align: 'right', value: (row) => money(row.projection.spend) },
  { header: 'Blended/user', align: 'right', value: (row) => money(row.projection.weightedCost) },
  { header: 'Rev/mo', align: 'right', value: (row) => money(row.projection.revenue) },
  { header: 'Gross margin', align: 'right', value: (row) => row.projection.margin.toFixed(1) + '%' },
]

const collect = (value: string, previous: string[]): string[] => previous.concat([value])

export function compareCommand(program: Command): void {
  program
    .command('compare')
    .description('Compare multiple models against the same scenario')
    .argument('[models...]', 'model ids to compare (defaults to the curated featured set)')
    .option('--scenario <file>', 'scenario JSON file to compare against')
    .option('-t, --tier <spec>', 'add a tier: Name:users:price:inputTokens:outputTokens:quota (repeatable)', collect, [])
    .option('-f, --tiers <file>', 'load tiers from a JSON array file')
    .option('-u, --users <n>', 'override total users')
    .option('-l, --limit <n>', 'with no model ids, compare the first N featured models (default 8)', Number)
    .option('--source <name>', 'pricing source: openrouter, models.dev, or offline (default: openrouter)')
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
          offline?: boolean
          source?: string
          json?: boolean
        },
      ) => {
        const list: ModelList = await resolveModelList({ source: options.source, offline: Boolean(options.offline) })
        const limit = options.limit ?? 8
        const { scenario } = await buildScenario({
          scenario: options.scenario,
          users: options.users,
          tierSpecs: options.tier,
          tiersFile: options.tiers,
        })

        const queries = modelArgs && modelArgs.length > 0 ? modelArgs : featuredModels(list.models, { max: limit }).map((m) => m.id)

        const results: CompareRow[] = []
        const skipped: string[] = []
        for (const query of queries) {
          const model = findModel(list.models, query)
          if (!model) {
            skipped.push(query)
            continue
          }
          results.push({ model, projection: calculateScenario(scenario, model) })
        }
        results.sort((a, b) => a.projection.spend - b.projection.spend)

        if (options.json) {
          process.stdout.write(
            JSON.stringify(
              {
                source: list.source,
                fetchedAt: list.fetchedAt,
                scenario,
                skipped,
                results: results.map(({ model, projection }) => ({ model, projection })),
              },
              null,
              2,
            ) + '\n',
          )
          return
        }

        if (results.length === 0) {
          process.stderr.write(pc.red('No matching models found. Try "tokenledger models" to browse the catalog.\n'))
          process.exit(1)
        }

        for (const skippedModel of skipped) {
          process.stderr.write(pc.yellow(`Skipped unknown model: ${skippedModel}\n`))
        }

        process.stdout.write('\n' + pc.bold(`Scenario: ${scenario.name}`) + '\n\n')
        process.stdout.write(renderTable(results, compareColumns) + '\n')
        process.stdout.write('Pricing source: ' + sourceLine(list) + '\n\n')
        if (skipped.length > 0) process.stdout.write(pc.yellow(`${skipped.length} model(s) not found.`) + '\n\n')
      },
    )
}