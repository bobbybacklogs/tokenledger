import { defaultScenario } from '@tokenledger/core'
import pc from 'picocolors'
import type { Command } from 'commander'

export function initCommand(program: Command): void {
  program
    .command('init')
    .description('Scaffold a starter scenario JSON file')
    .argument('[file]', 'output path (default: scenario.json)', 'scenario.json')
    .option('-f, --force', 'overwrite the file if it already exists')
    .option('-m, --model <id>', 'model id to use in the generated scenario')
    .action(async (file: string, options: { force?: boolean; model?: string }) => {
      const fs = await import('node:fs/promises')

      let exists = false
      try {
        await fs.access(file)
        exists = true
      } catch {
        exists = false
      }

      if (exists && !options.force) {
        process.stderr.write(pc.red(`${file} already exists. Re-run with --force to overwrite.\n`))
        process.exit(1)
      }

      const scenario = defaultScenario()
      if (options.model) scenario.model = options.model
      await fs.writeFile(file, JSON.stringify(scenario, null, 2) + '\n')

      process.stdout.write(pc.green(`Wrote ${file}\n`))
      process.stdout.write('\nNext steps:\n')
      process.stdout.write(`  tokenledger scenario ${file}\n`)
      process.stdout.write('  tokenledger compare --scenario ' + file + '\n')
      process.stdout.write('  tokenledger estimate -m ' + scenario.model + '\n')
      process.stdout.write('\n' + pc.dim('Edit the file to change tiers, model, or the total user count.\n'))
    })
}