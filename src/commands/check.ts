import { Command } from 'commander';
import { checkWorld } from '../lib/check.js';
import { detectProjectType } from '../lib/project-config.js';

export const checkCommand = new Command('check')
  .description('Run security checks')
  .option('--build', 'Run build command before checking')
  .option('--ignore-warnings', 'Ignore warnings and fail only on REJECT')
  .option('--json', 'Output results in JSON format')
  .action(async (options) => {
    // サブコマンド未指定: xrift.json から自動判定
    try {
      const type = await detectProjectType();
      if (type === 'world') {
        const exitCode = await checkWorld({
          build: options.build,
          ignoreWarnings: options.ignoreWarnings,
          json: options.json,
        });
        process.exit(exitCode);
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error('Error:', error.message);
      }
      process.exit(1);
    }
  });

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
