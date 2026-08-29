#!/usr/bin/env node
import { createRequire } from 'node:module'
import { Command } from 'commander'
import { compareCommand } from './commands/compare.js'
import { estimateCommand, scenarioCommand } from './commands/estimate.js'
import { imageCompareCommand } from './commands/image-compare.js'
import { imageEstimateCommand } from './commands/image-estimate.js'
import { imagesCommand } from './commands/images.js'
import { initCommand } from './commands/init.js'
import { modelsCommand } from './commands/models.js'

const require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = require('../package.json') as { version: string }

const program = new Command()
program
  .name('tokenledger')
  .description('AI unit-economics planner — live model pricing from OpenRouter and scenario projections')
  .version(pkg.version)

modelsCommand(program)
imagesCommand(program)
estimateCommand(program)
imageEstimateCommand(program)
scenarioCommand(program)
compareCommand(program)
imageCompareCommand(program)
initCommand(program)

program.parseAsync().catch((error: unknown) => {
  process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})