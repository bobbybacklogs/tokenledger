#!/usr/bin/env node
import { createRequire } from 'node:module'
import { Command } from 'commander'
import { compareCommand } from './commands/compare.js'
import { creditsCommand } from './commands/credits.js'
import { embedCompareCommand } from './commands/embed-compare.js'
import { embedEstimateCommand } from './commands/embed-estimate.js'
import { embeddingsCommand } from './commands/embeddings.js'
import { estimateCommand, scenarioCommand } from './commands/estimate.js'
import { imageCompareCommand } from './commands/image-compare.js'
import { imageEstimateCommand } from './commands/image-estimate.js'
import { imagesCommand } from './commands/images.js'
import { initCommand } from './commands/init.js'
import { modelsCommand, searchCommand } from './commands/models.js'
import { videoCompareCommand } from './commands/video-compare.js'
import { videoEstimateCommand } from './commands/video-estimate.js'
import { videosCommand } from './commands/videos.js'
import { wizardCommand } from './commands/wizard.js'

const require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = require('../package.json') as { version: string }

const program = new Command()
program
  .name('tokenledger')
  .description('AI unit-economics planner — live model pricing from OpenRouter, models.dev, GitHub Copilot, and Vercel AI Gateway')
  .version(pkg.version)

modelsCommand(program)
searchCommand(program)
imagesCommand(program)
embeddingsCommand(program)
videosCommand(program)
estimateCommand(program)
creditsCommand(program)
imageEstimateCommand(program)
embedEstimateCommand(program)
videoEstimateCommand(program)
scenarioCommand(program)
compareCommand(program)
imageCompareCommand(program)
embedCompareCommand(program)
videoCompareCommand(program)
initCommand(program)
wizardCommand(program)

program.parseAsync().catch((error: unknown) => {
  process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})