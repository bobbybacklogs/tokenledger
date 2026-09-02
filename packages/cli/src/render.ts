import {
  calculateCreditScenario,
  calculateEmbeddingScenario,
  calculateImageScenario,
  calculateScenario,
  calculateVideoScenario,
  compact,
  money,
  monthlyEmbedTokens,
  monthlyImages,
  monthlyVideoSeconds,
  number,
  type CreditProjection,
  type CreditScenario,
  type ModelList,
  type Projection,
  type Scenario,
} from '@tokenledger/core'
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

interface UnitTierRow {
  name: string
  users: string
  price: string
  units: string
  cost: string
  revenue: string
  costPerUser: string
  margin: string
}

function unitTierColumns(unitHeader: string, costHeader: string): Column<UnitTierRow>[] {
  return [
    { header: 'Tier', value: (row) => row.name },
    { header: 'Users', align: 'right', value: (row) => row.users },
    { header: 'Price/mo', align: 'right', value: (row) => row.price },
    { header: unitHeader, align: 'right', value: (row) => row.units },
    { header: costHeader, align: 'right', value: (row) => row.cost },
    { header: 'Rev/mo', align: 'right', value: (row) => row.revenue },
    { header: 'Cost/user', align: 'right', value: (row) => row.costPerUser },
    { header: 'Margin', align: 'right', value: (row) => row.margin },
  ]
}

function unitTierRows(projection: Projection, units: (tier: Projection['perTier'][number]['tier']) => number): UnitTierRow[] {
  return projection.perTier.map(({ tier, monthlyCost, revenue, costPerUser, margin }) => ({
    name: pc.bold(tier.name),
    users: number(tier.users),
    price: money(tier.price),
    units: number(units(tier)),
    cost: money(monthlyCost),
    revenue: money(revenue),
    costPerUser: money(costPerUser),
    margin: margin === null ? pc.dim('—') : pc.magenta(`${margin.toFixed(1)}%`),
  }))
}

export function renderEmbeddingProjection(projection: Projection): string {
  const out: string[] = []
  out.push(pc.bold(`Scenario: ${projection.scenario.name}`))
  out.push(`Embedding model:  ${modelHeader(projection.model)}${estimateLabel(projection.model)}`)
  out.push('')
  out.push(renderTable(unitTierRows(projection, (tier) => tier.embedTokens ?? 0), unitTierColumns('Embed tok/user', 'Embed cost/mo')))
  out.push('')
  out.push(
    `Totals   users=${number(projection.users)}   ` +
      `embed tok/mo=${number(monthlyEmbedTokens(projection.scenario.tiers))}   ` +
      `embed spend=${money(projection.spend)}   ` +
      `revenue=${money(projection.revenue)}   ` +
      `blended embed cost/user=${money(projection.weightedCost)}   ` +
      `gross margin=${pc.magenta(projection.margin.toFixed(1) + '%')}`,
  )
  return out.join('\n')
}

export async function runEmbeddingProjection(
  list: ModelList,
  scenario: Scenario,
  options: { json?: boolean; model?: string },
): Promise<void> {
  const model = requireModel(list, options.model ?? scenario.model)
  const projection = calculateEmbeddingScenario(scenario, model)
  if (options.json) {
    process.stdout.write(JSON.stringify({ source: list.source, fetchedAt: list.fetchedAt, ...projection }, null, 2) + '\n')
    return
  }
  process.stdout.write('\n' + renderEmbeddingProjection(projection) + '\n\n')
  process.stdout.write('Pricing source: ' + sourceLine(list) + '\n')
}

export function renderVideoProjection(projection: Projection): string {
  const out: string[] = []
  out.push(pc.bold(`Scenario: ${projection.scenario.name}`))
  out.push(`Video model:  ${modelHeader(projection.model)}${estimateLabel(projection.model)}`)
  out.push('')
  out.push(renderTable(unitTierRows(projection, (tier) => tier.videoSeconds ?? 0), unitTierColumns('Seconds/user', 'Video cost/mo')))
  out.push('')
  out.push(
    `Totals   users=${number(projection.users)}   ` +
      `seconds/mo=${number(monthlyVideoSeconds(projection.scenario.tiers))}   ` +
      `video spend=${money(projection.spend)}   ` +
      `revenue=${money(projection.revenue)}   ` +
      `blended video cost/user=${money(projection.weightedCost)}   ` +
      `gross margin=${pc.magenta(projection.margin.toFixed(1) + '%')}`,
  )
  return out.join('\n')
}

export async function runVideoProjection(
  list: ModelList,
  scenario: Scenario,
  options: { json?: boolean; model?: string },
): Promise<void> {
  const model = requireModel(list, options.model ?? scenario.model)
  if (model.video === undefined || model.video <= 0) {
    process.stderr.write(pc.yellow(`Note: "${model.id}" has no per-second video pricing in this catalog — treating it as $0.00/s. Browse video models with "tokenledger videos".\n`))
  }
  const projection = calculateVideoScenario(scenario, model)
  if (options.json) {
    process.stdout.write(JSON.stringify({ source: list.source, fetchedAt: list.fetchedAt, ...projection }, null, 2) + '\n')
    return
  }
  process.stdout.write('\n' + renderVideoProjection(projection) + '\n\n')
  process.stdout.write('Pricing source: ' + sourceLine(list) + '\n')
}

interface CreditTierRow {
  name: string
  users: string
  included: string
  used: string
  remaining: string
  util: string
  overage: string
  effective: string
  revenue: string
}

const creditTierColumns: Column<CreditTierRow>[] = [
  { header: 'Tier', value: (row) => row.name },
  { header: 'Users', align: 'right', value: (row) => row.users },
  { header: 'Credits in', align: 'right', value: (row) => row.included },
  { header: 'Used', align: 'right', value: (row) => row.used },
  { header: 'Left', align: 'right', value: (row) => row.remaining },
  { header: 'Util %', align: 'right', value: (row) => row.util },
  { header: 'Overage $', align: 'right', value: (row) => row.overage },
  { header: 'Effective $', align: 'right', value: (row) => row.effective },
  { header: 'Rev/mo', align: 'right', value: (row) => row.revenue },
]

export function renderCreditProjection(projection: CreditProjection): string {
  const out: string[] = []
  out.push(pc.bold(`Scenario: ${projection.scenario.name}`))
  out.push(`Model:  ${modelHeader(projection.model)}${estimateLabel(projection.model)}`)
  out.push(
    pc.dim(
      `Plan:  1 credit = ${money(projection.plan.creditValueUsd)} · multiplier ${projection.plan.modelMultiplier}× · reset ${projection.plan.reset}` +
        (projection.plan.reset === 'never' ? '' : ` (day ${projection.plan.resetDay})`),
    ),
  )
  out.push('')
  const rows: CreditTierRow[] = projection.perTier.map((row) => ({
    name: pc.bold(row.tier.name),
    users: number(row.users),
    included: number(row.creditsIncluded),
    used: number(row.creditsUsed),
    remaining: number(row.creditsRemaining),
    util: `${row.creditUtilization.toFixed(1)}%`,
    overage: money(row.overageSpendUsd),
    effective: money(row.effectiveSpendUsd),
    revenue: money(row.revenue),
  }))
  out.push(renderTable(rows, creditTierColumns))
  out.push('')
  out.push(
    `Totals   users=${number(projection.users)}   ` +
      `list AI=${money(projection.listSpendUsd)}   ` +
      `credits ${number(projection.creditsUsed)}/${number(projection.creditsIncluded)}   ` +
      `overage=${money(projection.overageSpendUsd)}   ` +
      `effective AI=${money(projection.effectiveSpendUsd)}   ` +
      `revenue=${money(projection.revenue)}   ` +
      `margin=${pc.magenta(projection.margin.toFixed(1) + '%')}`,
  )
  if (projection.daysToReset !== null) {
    out.push(
      pc.dim(
        `Reset in ${projection.daysToReset} day(s)` +
          (projection.nextResetAt ? ` · next ${projection.nextResetAt.slice(0, 10)}` : '') +
          ` · burn ≈ ${number(projection.burnPerDay)} credits/day`,
      ),
    )
  }
  return out.join('\n')
}

export async function runCreditProjection(
  list: ModelList,
  scenario: CreditScenario,
  options: { json?: boolean; model?: string },
): Promise<void> {
  const model = requireModel(list, options.model ?? scenario.model)
  const projection = calculateCreditScenario(scenario, model)
  if (options.json) {
    process.stdout.write(JSON.stringify({ source: list.source, fetchedAt: list.fetchedAt, ...projection }, null, 2) + '\n')
    return
  }
  process.stdout.write('\n' + renderCreditProjection(projection) + '\n\n')
  process.stdout.write('Pricing source: ' + sourceLine(list) + '\n')
}