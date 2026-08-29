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
import {
  buildScenario,
  filterByCategory,
  loadListForSource,
  parseSourceSpec,
  resolveCategory,
  resolvePerModelSources,
  sourceLabel,
  sourceLine,
  type SourceChoice,
} from '../helpers.js'

interface CompareRow {
  model: LiveModel
  source: SourceChoice
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

// Only shown when the comparison mixes more than one pricing source.
const sourceColumn: Column<CompareRow> = { header: 'Source', value: (row) => sourceLabel(row.source) }

const collect = (value: string, previous: string[]): string[] => previous.concat([value])

export function compareCommand(program: Command): void {
  program
    .command('compare')
    .description('Compare multiple models against the same scenario')
    .argument('[models...]', 'model ids to compare (defaults to the curated featured set)')
    .option('--scenario <file>', 'scenario JSON file to compare against')
    .option('-t, --tier <spec>', 'add a tier — usage: Name:users:price:requests, or tokens: Name:users:price:input:output:quota (repeatable)', collect, [])
    .option('-f, --tiers <file>', 'load tiers from a JSON array file')
    .option('-z, --size <name>', 'interaction size for usage-style tiers: short, medium, long, heavy, or custom (default: medium)')
    .option('--input-per <n>', 'per-exchange input tokens when --size custom')
    .option('--output-per <n>', 'per-exchange output tokens when --size custom')
    .option('-u, --users <n>', 'override total users')
    .option('-l, --limit <n>', 'with no model ids, compare the first N featured models (default 8)', Number)
    .option('-k, --category <name>', 'with no model ids, compare models of this category: general, coding, reasoning, vision, image, embedding, audio')
    .option('--source <sources>', 'pricing source per model: comma-separated openrouter, models.dev, offline, or default (default = openrouter)')
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
          category?: string
          offline?: boolean
          source?: string
          size?: string
          inputPer?: string
          outputPer?: string
          json?: boolean
        },
      ) => {
        const limit = options.limit ?? 8
        const spec = parseSourceSpec(options.source)
        const offline = Boolean(options.offline)
        const category = resolveCategory(options.category)
        const { scenario, assumption } = await buildScenario({
          scenario: options.scenario,
          users: options.users,
          tierSpecs: options.tier,
          tiersFile: options.tiers,
          size: options.size,
          inputPer: options.inputPer,
          outputPer: options.outputPer,
        })
        if (assumption && !options.json) {
          process.stdout.write(
            pc.dim(`Assumed interaction: ${assumption.label} — ${assumption.perInput} in / ${assumption.perOutput} out tokens per exchange.\n`),
          )
        }

        // Decide which models to compare and the source that prices each one.
        let queries: string[]
        let perSource: SourceChoice[]
        if (modelArgs && modelArgs.length > 0) {
          queries = modelArgs
          perSource = resolvePerModelSources(queries.length, spec, offline)
        } else {
          const first: SourceChoice = offline ? 'offline' : (spec?.[0] ?? 'openrouter')
          const primary = await loadListForSource(first)
          queries = featuredModels(filterByCategory(primary.models, category), { max: limit }).map((m) => m.id)
          perSource = Array<SourceChoice>(queries.length).fill(first)
        }

        // Load each distinct source's catalog once and cache it.
        const lists = new Map<SourceChoice, ModelList>()
        for (const source of new Set(perSource)) {
          if (!lists.has(source)) lists.set(source, await loadListForSource(source))
        }

        const results: CompareRow[] = []
        const skipped: string[] = []
        const entries: Array<{ query: string; source: SourceChoice }> = queries.map((query, i) => ({
          query,
          source: perSource[i] ?? perSource[perSource.length - 1] ?? 'openrouter',
        }))
        for (const { query, source } of entries) {
          const list = lists.get(source)!
          const model = findModel(list.models, query)
          if (!model) {
            skipped.push(query)
            continue
          }
          results.push({ model, source, projection: calculateScenario(scenario, model) })
        }
        results.sort((a, b) => a.projection.spend - b.projection.spend)

        if (options.json) {
          process.stdout.write(
            JSON.stringify(
              {
                scenario,
                skipped,
                results: results.map(({ model, source, projection }) => ({
                  source: sourceLabel(source),
                  model,
                  projection,
                })),
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

        const distinctSources = [...new Set(results.map((r) => r.source))]
        const columns =
          distinctSources.length > 1 ? [...compareColumns, sourceColumn] : compareColumns
        const sourceSummary =
          distinctSources.length === 1
            ? sourceLine(lists.get(distinctSources[0]!)!)
            : distinctSources.map((s) => sourceLabel(s)).join(', ')

        process.stdout.write('\n' + pc.bold(`Scenario: ${scenario.name}`) + '\n\n')
        process.stdout.write(renderTable(results, columns) + '\n')
        process.stdout.write('Pricing source: ' + sourceSummary + '\n\n')
        if (skipped.length > 0) process.stdout.write(pc.yellow(`${skipped.length} model(s) not found.`) + '\n\n')
      },
    )
}