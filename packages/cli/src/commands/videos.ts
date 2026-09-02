import { featuredVideoModels, money, type LiveModel } from '@tokenledger/core'
import pc from 'picocolors'
import type { Command } from 'commander'
import { renderTable, type Column } from '../table.js'
import { resolveModelList, SOURCE_OPTION_HELP, sourceLine } from '../helpers.js'

interface VideoModelRow {
  id: string
  provider: string
  price: string
  estimate: string
}

const videoModelColumns: Column<VideoModelRow>[] = [
  { header: 'Model', value: (row) => row.id },
  { header: 'Provider', value: (row) => row.provider },
  { header: 'Price/second', align: 'right', value: (row) => row.price },
  { header: '', value: (row) => row.estimate },
]

function parseLimit(value: string): number | undefined {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined
}

export function videosCommand(program: Command): void {
  program
    .command('videos')
    .description('List video-generation model pricing (USD per generated second, live from Vercel or the offline catalog)')
    .argument('[search]', 'filter by model id or name')
    .option('-p, --provider <name>', 'only show models from a provider')
    .option('-s, --sort <field>', 'sort by price, provider, or id (default: provider)', 'provider')
    .option('-l, --limit <n>', 'limit the number of rows', parseLimit)
    .option('-f, --featured', 'show only the curated featured video models')
    .option('--source <name>', SOURCE_OPTION_HELP)
    .option('-o, --offline', 'use the bundled estimate catalog instead of the live feed')
    .option('-j, --json', 'output raw JSON')
    .action(
      async (search: string | undefined, options: { provider?: string; sort: string; limit?: number; featured?: boolean; source?: string; offline?: boolean; json?: boolean }) => {
        const list = await resolveModelList({ source: options.source, offline: Boolean(options.offline) })
        let models: LiveModel[] = options.featured ? featuredVideoModels(list.models) : list.models.filter((model) => model.video !== undefined)

        if (search) {
          const query = search.toLowerCase()
          models = models.filter((model) => model.id.toLowerCase().includes(query) || model.name.toLowerCase().includes(query))
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

        const rows: VideoModelRow[] = models.map((model) => ({
          id: model.id,
          provider: model.provider,
          price: money(model.video ?? 0) + '/s',
          estimate: model.estimate ? pc.yellow('estimate') : '',
        }))

        process.stdout.write('\n' + renderTable(rows, videoModelColumns) + '\n')
        process.stdout.write(sourceLine(list) + pc.dim(`  showing ${models.length.toLocaleString()} video models`) + '\n\n')
      },
    )
}

function sortModels(models: LiveModel[], field: string): LiveModel[] {
  const sorted = [...models]
  switch (field) {
    case 'price':
      return sorted.sort((a, b) => (a.video ?? 0) - (b.video ?? 0) || a.id.localeCompare(b.id))
    case 'id':
      return sorted.sort((a, b) => a.id.localeCompare(b.id))
    case 'provider':
    default:
      return sorted.sort((a, b) => a.provider.localeCompare(b.provider) || (a.video ?? 0) - (b.video ?? 0) || a.id.localeCompare(b.id))
  }
}
