import {
  calculateImageScenario,
  contextLabel,
  featuredImageModels,
  findModel,
  isImageModel,
  money,
  monthlyImages,
  number,
  type LiveModel,
  type ModelList,
  type Projection,
} from '@tokenledger/core'
import pc from 'picocolors'
import type { Command } from 'commander'
import { renderTable, type Column } from '../table.js'
import { buildImageScenario, resolveModelList, sourceLine } from '../helpers.js'

interface ImageCompareRow {
  model: LiveModel
  projection: Projection
}

const imageCompareColumns: Column<ImageCompareRow>[] = [
  { header: 'Image model', value: (row) => row.model.id },
  { header: 'Provider', value: (row) => row.model.provider },
  { header: 'Price/image', align: 'right', value: (row) => money(row.model.image ?? 0) },
  { header: 'Images/user', align: 'right', value: (row) => imagesPerUser(row) },
  { header: 'Context', align: 'right', value: (row) => contextLabel(row.model.context) },
  { header: 'Image spend/mo', align: 'right', value: (row) => money(row.projection.spend) },
  { header: 'Blended/user', align: 'right', value: (row) => money(row.projection.weightedCost) },
  { header: 'Rev/mo', align: 'right', value: (row) => money(row.projection.revenue) },
  { header: 'Gross margin', align: 'right', value: (row) => row.projection.margin.toFixed(1) + '%' },
]

function imagesPerUser(row: ImageCompareRow): string {
  const images = monthlyImages(row.projection.scenario.tiers)
  return row.projection.users > 0 ? number(Math.round((images / row.projection.users) * 10) / 10) : '0'
}

const collect = (value: string, previous: string[]): string[] => previous.concat([value])

export function imageCompareCommand(program: Command): void {
  program
    .command('image-compare')
    .description('Compare image-generation models against the same scenario')
    .argument('[models...]', 'image model ids to compare (defaults to the curated featured image set)')
    .option('--scenario <file>', 'scenario JSON file to compare against')
    .option('-t, --tier <spec>', 'add a tier: Name:users:price:imagesPerUser:quota (repeatable)', collect, [])
    .option('-f, --tiers <file>', 'load tiers from a JSON array file')
    .option('-u, --users <n>', 'override total users')
    .option('-l, --limit <n>', 'with no model ids, compare the first N featured image models (default 8)', Number)
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
          json?: boolean
        },
      ) => {
        const list: ModelList = await resolveModelList({ offline: Boolean(options.offline) })
        const limit = options.limit ?? 8
        const { scenario } = await buildImageScenario({
          scenario: options.scenario,
          users: options.users,
          tierSpecs: options.tier,
          tiersFile: options.tiers,
        })

        const queries = modelArgs && modelArgs.length > 0 ? modelArgs : featuredImageModels(list.models, { max: limit }).map((m) => m.id)

        const results: ImageCompareRow[] = []
        const skipped: string[] = []
        for (const query of queries) {
          const model = findModel(list.models, query)
          if (!model || !isImageModel(model)) {
            skipped.push(query)
            continue
          }
          results.push({ model, projection: calculateImageScenario(scenario, model) })
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
          process.stderr.write(pc.red('No matching image models found. Try "tokenledger images" to browse the catalog.\n'))
          process.exit(1)
        }

        for (const skippedModel of skipped) {
          process.stderr.write(pc.yellow(`Skipped unknown or non-image model: ${skippedModel}\n`))
        }

        process.stdout.write('\n' + pc.bold(`Scenario: ${scenario.name}`) + '\n\n')
        process.stdout.write(renderTable(results, imageCompareColumns) + '\n')
        process.stdout.write('Pricing source: ' + sourceLine(list) + '\n\n')
        if (skipped.length > 0) process.stdout.write(pc.yellow(`${skipped.length} model(s) not found.`) + '\n\n')
      },
    )
}