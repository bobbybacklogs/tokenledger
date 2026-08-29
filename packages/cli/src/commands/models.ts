import { contextLabel, featuredModels, money, type LiveModel } from '@tokenledger/core'
import pc from 'picocolors'
import type { Command } from 'commander'
import { renderTable, type Column } from '../table.js'
import { resolveModelList, sourceLine } from '../helpers.js'

interface ModelRow {
  id: string
  provider: string
  input: string
  output: string
  context: string
  estimate: string
}

const modelColumns: Column<ModelRow>[] = [
  { header: 'Model', value: (row) => row.id },
  { header: 'Provider', value: (row) => row.provider },
  { header: 'Input/1M', align: 'right', value: (row) => row.input },
  { header: 'Output/1M', align: 'right', value: (row) => row.output },
  { header: 'Context', align: 'right', value: (row) => row.context },
  { header: '', value: (row) => row.estimate },
]

function parseLimit(value: string): number | undefined {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined
}

export function modelsCommand(program: Command): void {
  program
    .command('models')
    .description('List model pricing (live from OpenRouter, or the offline catalog with --offline)')
    .argument('[search]', 'filter by model id or name')
    .option('-p, --provider <name>', 'only show models from a provider')
    .option('-s, --sort <field>', 'sort by price, provider, or id (default: provider)', 'provider')
    .option('-l, --limit <n>', 'limit the number of rows', parseLimit)
    .option('-f, --featured', 'show only the curated featured models')
    .option('-o, --offline', 'use the bundled estimate catalog instead of the live feed')
    .option('-j, --json', 'output raw JSON')
    .action(async (search: string | undefined, options: { provider?: string; sort: string; limit?: number; featured?: boolean; offline?: boolean; json?: boolean }) => {
      const list = await resolveModelList(Boolean(options.offline))
      let models: LiveModel[] = options.featured ? featuredModels(list.models) : list.models

      if (search) {
        const query = search.toLowerCase()
        models = models.filter(
          (model) => model.id.toLowerCase().includes(query) || model.name.toLowerCase().includes(query),
        )
      }
      if (options.provider) {
        const provider = options.provider.toLowerCase()
        models = models.filter((model) => model.provider.toLowerCase().includes(provider))
      }

      models = sortModels(models, options.sort)
      if (options.limit !== undefined) models = models.slice(0, options.limit)

      if (options.json) {
        process.stdout.write(JSON.stringify({ source: list.source, fetchedAt: list.fetchedAt, models }, null, 2) + '\n')
        return
      }

      const rows: ModelRow[] = models.map((model) => ({
        id: model.id,
        provider: model.provider,
        input: money(model.input),
        output: money(model.output),
        context: contextLabel(model.context),
        estimate: model.estimate ? pc.yellow('estimate') : '',
      }))

      process.stdout.write('\n' + renderTable(rows, modelColumns) + '\n')
      const suffix = models.length === list.models.length ? '' : `  ${pc.dim(`showing ${models.length.toLocaleString()} of ${list.models.length.toLocaleString()}`)}`
      process.stdout.write(sourceLine(list) + suffix + '\n\n')
    })
}

function sortModels(models: LiveModel[], field: string): LiveModel[] {
  const sorted = [...models]
  switch (field) {
    case 'price':
      return sorted.sort((a, b) => a.input - b.input || a.output - b.output || a.id.localeCompare(b.id))
    case 'id':
      return sorted.sort((a, b) => a.id.localeCompare(b.id))
    case 'provider':
    default:
      return sorted.sort((a, b) => a.provider.localeCompare(b.provider) || a.input - b.input || a.id.localeCompare(b.id))
  }
}