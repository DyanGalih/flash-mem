#!/usr/bin/env node
import { Command } from 'commander';
import { InitializeProjectService } from '../../application/services/InitializeProjectService';
import * as path from 'path';

const program = new Command();

program
  .name('flash-mem')
  .description('Local-first engineering memory server and CLI tool')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize a new flash-mem workspace')
  .argument('[path]', 'The project path to initialize', '.')
  .option('-j, --json', 'Output structured JSON instead of plain text')
  .action((dirArg, options) => {
    const service = new InitializeProjectService();
    const useJson = !!options.json;

    try {
      const targetDir = path.resolve(process.cwd(), dirArg);
      const result = service.execute(targetDir);

      if (useJson) {
        process.stdout.write(JSON.stringify({
          success: true,
          path: result.path,
          metadata: result.metadata
        }, null, 2) + '\n');
      } else {
        process.stdout.write(`flash-mem initialized successfully at: ${result.path}\n`);
      }
      process.exit(0);
    } catch (err: any) {
      const errMsg = err.message || 'Unknown error occurred during initialization';
      process.stderr.write(`Error: ${errMsg}\n`);

      if (useJson) {
        process.stdout.write(JSON.stringify({
          success: false,
          error: errMsg
        }, null, 2) + '\n');
      }
      process.exit(1);
    }
  });

// Only parse if executed as a script
if (require.main === module || !module.parent) {
  program.parse(process.argv);
}

export { program };
