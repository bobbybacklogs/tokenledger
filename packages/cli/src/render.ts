import { calculateImageScenario, calculateScenario, compact, money, monthlyImages, number, type ModelList, type Projection, type Scenario } from '@tokenledger/core'
import pc from 'picocolors'
import { renderTable, type Column } from './table.js'
import { estimateLabel, modelHeader, requireModel, sourceLine } from './helpers.js'

interface TierRow {
  name: string
  users: string
  price: string
  input: string
  output: string
  quota: string
  cost: string
  revenue: string
  costPerUser: string
  margin: string
}

const tierColumns: Column<TierRow>[] = [
  { header: 'Tier', value: (row) => row.name },
  { header: 'Users', align: 'right', value: (row) => row.users },
  { header: 'Price/mo', align: 'right', value: (row) => row.price },
  { header: 'In tok/user', align: 'right', value: (row) => row.input },
  { header: 'Out tok/user', align: 'right', value: (row) => row.output },
  { header: 'Quota', align: 'right', value: (row) => row.quota },
  { header: 'AI cost/mo', align: 'right', value: (row) => row.cost },
  { header: 'Rev/mo', align: 'right', value: (row) => row.revenue },
  { header: 'AI cost/user', align: 'right', value: (row) => row.costPerUser },
  { header: 'Margin', align: 'right', value: (row) => row.margin },
]

function tierRows(projection: Projection): TierRow[] {
  return projection.perTier.map(({ tier, monthlyCost, revenue, costPerUser, margin }) => ({
    name: pc.bold(tier.name),
    users: number(tier.users),
    price: money(tier.price),
    input: number(tier.input),
    output: number(tier.output),
    quota: compact(tier.quota),
    cost: money(monthlyCost),
    revenue: money(revenue),
    costPerUser: money(costPerUser),
    margin: margin === null ? pc.dim('—') : pc.magenta(`${margin.toFixed(1)}%`),
  }))
}

export function renderProjection(projection: Projection): string {
  const out: string[] = []
  out.push(pc.bold(`Scenario: ${projection.scenario.name}`))
  out.push(`Model:  ${modelHeader(projection.model)}${estimateLabel(projection.model)}`)
  out.push('')
  out.push(renderTable(tierRows(projection), tierColumns))
  out.push('')
  out.push(
    `Totals   users=${number(projection.users)}   ` +
      `AI spend=${money(projection.spend)}   ` +
      `revenue=${money(projection.revenue)}   ` +
      `blended AI cost/user=${money(projection.weightedCost)}   ` +
      `gross margin=${pc.magenta(projection.margin.toFixed(1) + '%')}`,
  )
  return out.join('\n')
}

/** Project and print (or emit as JSON) a scenario against a model list. */
export async function runProjection(
  list: ModelList,
  scenario: Scenario,
  options: { json?: boolean; model?: string },
): Promise<void> {
  const model = requireModel(list, options.model ?? scenario.model)
  const projection = calculateScenario(scenario, model)

  if (options.json) {
    process.stdout.write(JSON.stringify({ source: list.source, fetchedAt: list.fetchedAt, ...projection }, null, 2) + '\n')
    return
  }

  process.stdout.write('\n' + renderProjection(projection) + '\n\n')
  process.stdout.write('Pricing source: ' + sourceLine(list) + '\n')
}

interface ImageTierRow {
  name: string
  users: string
  price: string
  images: string
  cost: string
  revenue: string
  costPerUser: string
  margin: string
}

const imageTierColumns: Column<ImageTierRow>[] = [
  { header: 'Tier', value: (row) => row.name },
  { header: 'Users', align: 'right', value: (row) => row.users },
  { header: 'Price/mo', align: 'right', value: (row) => row.price },
  { header: 'Images/user', align: 'right', value: (row) => row.images },
  { header: 'Image cost/mo', align: 'right', value: (row) => row.cost },
  { header: 'Rev/mo', align: 'right', value: (row) => row.revenue },
  { header: 'Cost/user', align: 'right', value: (row) => row.costPerUser },
  { header: 'Margin', align: 'right', value: (row) => row.margin },
]

function imageTierRows(projection: Projection): ImageTierRow[] {
  return projection.perTier.map(({ tier, monthlyCost, revenue, costPerUser, margin }) => ({
    name: pc.bold(tier.name),
    users: number(tier.users),
    price: money(tier.price),
    images: number(tier.images ?? 0),
    cost: money(monthlyCost),
    revenue: money(revenue),
    costPerUser: money(costPerUser),
    margin: margin === null ? pc.dim('—') : pc.magenta(`${margin.toFixed(1)}%`),
  }))
}

export function renderImageProjection(projection: Projection): string {
  const out: string[] = []
  out.push(pc.bold(`Scenario: ${projection.scenario.name}`))
  out.push(`Image model:  ${modelHeader(projection.model)}${estimateLabel(projection.model)}`)
  out.push('')
  out.push(renderTable(imageTierRows(projection), imageTierColumns))
  out.push('')
  out.push(
    `Totals   users=${number(projection.users)}   ` +
      `images/mo=${number(monthlyImages(projection.scenario.tiers))}   ` +
      `image spend=${money(projection.spend)}   ` +
      `revenue=${money(projection.revenue)}   ` +
      `blended image cost/user=${money(projection.weightedCost)}   ` +
      `gross margin=${pc.magenta(projection.margin.toFixed(1) + '%')}`,
  )
  return out.join('\n')
}

/** Project (or emit as JSON) the image lane against a model list. */
export async function runImageProjection(
  list: ModelList,
  scenario: Scenario,
  options: { json?: boolean; model?: string },
): Promise<void> {
  const model = requireModel(list, options.model ?? scenario.model)
  if (model.image === undefined || model.image <= 0) {
    process.stderr.write(pc.yellow(`Note: "${model.id}" has no per-image pricing in this catalog — treating it as $0.00/image. Browse image models with "tokenledger images".\n`))
  }
  const projection = calculateImageScenario(scenario, model)

  if (options.json) {
    process.stdout.write(JSON.stringify({ source: list.source, fetchedAt: list.fetchedAt, ...projection }, null, 2) + '\n')
    return
  }

  process.stdout.write('\n' + renderImageProjection(projection) + '\n\n')
  process.stdout.write('Pricing source: ' + sourceLine(list) + '\n')
}