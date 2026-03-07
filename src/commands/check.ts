import { Command } from 'commander';
import { checkWorld } from '../lib/check.js';

export const checkCommand = new Command('check')
  .description('Run security checks');

checkCommand
  .command('world')
  .description('Run security checks on world build artifacts')
  .option('--build', 'Run build command before checking')
  .option('--ignore-warnings', 'Ignore warnings and fail only on REJECT')
  .option('--json', 'Output results in JSON format')
  .action(async (options) => {
    const exitCode = await checkWorld({
      build: options.build,
      ignoreWarnings: options.ignoreWarnings,
      json: options.json,
    });
    process.exit(exitCode);
  });

export default checkCommand;
