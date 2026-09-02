import { contextLabel, featuredModels, money, type LiveModel } from '@tokenledger/core'
import pc from 'picocolors'
import type { Command } from 'commander'
import { renderTable, type Column } from '../table.js'
import { filterByCategory, resolveCategory, resolveModelList, SOURCE_OPTION_HELP, sourceLine } from '../helpers.js'

interface ModelRow {
  id: string
  provider: string
  input: string
  output: string
  context: string
  estimate: string
}

interface ModelsOptions {
  provider?: string
  sort: string
  limit?: number
  category?: string
  featured?: boolean
  source?: string
  offline?: boolean
  search?: string
  json?: boolean
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

/** Shared rendering for `models` and `search`. */
async function runModels(term: string | undefined, options: ModelsOptions): Promise<void> {
  const list = await resolveModelList({ source: options.source, offline: Boolean(options.offline) })
  const category = resolveCategory(options.category)
  let models = filterByCategory(list.models, category)
  if (options.featured) models = featuredModels(models)

  // A --search flag, or the positional term, whichever the user provided.
  const query = options.search ?? term
  if (query) {
    const q = query.toLowerCase()
    models = models.filter(
      (model) => model.id.toLowerCase().includes(q) || model.name.toLowerCase().includes(q),
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
}

const sortOption = '-s, --sort <field>'
const sortDescription = 'sort by price, output, context, provider, or id (default: provider)'

export function modelsCommand(program: Command): void {
  program
    .command('models')
    .description('List model pricing (live from OpenRouter, models.dev, GitHub Copilot, Vercel AI Gateway, or the offline catalog)')
    .argument('[search]', 'filter by model id or name')
    .option(sortOption, sortDescription, 'provider')
    .option('--search <term>', 'filter by model id or name (alias for the positional argument)')
    .option('-p, --provider <name>', 'only show models from a provider')
    .option('-l, --limit <n>', 'limit the number of rows', parseLimit)
    .option('-k, --category <name>', 'filter by category: general, coding, reasoning, vision, image, embedding, audio')
    .option('-f, --featured', 'show only the curated featured models')
    .option('--source <name>', SOURCE_OPTION_HELP)
    .option('-o, --offline', 'use the bundled estimate catalog instead of the live feed (alias for --source offline)')
    .option('-j, --json', 'output raw JSON')
    .action(async (search: string | undefined, options: ModelsOptions) => {
      await runModels(search, options)
    })
}

export function searchCommand(program: Command): void {
  program
    .command('search')
    .description('Search the model catalog by id or name (same as "models <term>")')
    .argument('<term>', 'model id or name to search for')
    .option(sortOption, sortDescription, 'provider')
    .option('-p, --provider <name>', 'only show models from a provider')
    .option('-l, --limit <n>', 'limit the number of rows', parseLimit)
    .option('-k, --category <name>', 'filter by category: general, coding, reasoning, vision, image, embedding, audio')
    .option('-f, --featured', 'show only the curated featured models')
    .option('--source <name>', SOURCE_OPTION_HELP)
    .option('-o, --offline', 'use the bundled estimate catalog instead of the live feed (alias for --source offline)')
    .option('-j, --json', 'output raw JSON')
    .action(async (term: string, options: ModelsOptions) => {
      await runModels(term, options)
    })
}

function sortModels(models: LiveModel[], field: string): LiveModel[] {
  const sorted = [...models]
  switch (field) {
    case 'price':
      return sorted.sort((a, b) => a.input - b.input || a.output - b.output || a.id.localeCompare(b.id))
    case 'output':
      return sorted.sort((a, b) => a.output - b.output || a.input - b.input || a.id.localeCompare(b.id))
    case 'context':
      return sorted.sort((a, b) => b.context - a.context || a.input - b.input || a.id.localeCompare(b.id))
    case 'id':
      return sorted.sort((a, b) => a.id.localeCompare(b.id))
    case 'provider':
    default:
      return sorted.sort((a, b) => a.provider.localeCompare(b.provider) || a.input - b.input || a.id.localeCompare(b.id))
  }
}
