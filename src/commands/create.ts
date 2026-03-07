import { Command } from 'commander';
import chalk from 'chalk';
import prompts from 'prompts';
import { createWorld } from '../lib/create-world.js';

export const createCommand = new Command('create')
  .description('Create a new XRift project')
  .action(async () => {
    // サブコマンド未指定時: 対話型で種類を選択
    const response = await prompts({
      type: 'select',
      name: 'type',
      message: 'What would you like to create?',
      choices: [
        { title: 'World', value: 'world' },
        // 将来: { title: 'Item', value: 'item' },
      ],
    });

    if (!response.type) {
      console.log(chalk.yellow('\n❌ Cancelled'));
      process.exit(0);
    }

    if (response.type === 'world') {
      try {
        await createWorld(undefined, {});
      } catch (error) {
        if (error instanceof Error) {
          console.error(chalk.red('\nError:'), error.message);
        } else {
          console.error(chalk.red('\nAn unexpected error occurred'));
        }
        process.exit(1);
      }
    }
  });

createCommand
  .command('world')
  .argument('[project-name]', 'Project name (interactive if omitted)')
  .option(
    '-t, --template <repository>',
    'Template repository (e.g. WebXR-JP/xrift-world-template)',
    'WebXR-JP/xrift-test-world'
  )
  .option('--skip-install', 'Skip dependency installation')
  .option('--here', 'Create directly in the current directory')
  .option('-y, --no-interactive', 'Disable interactive mode')
  .description('Create a new XRift world project')
  .action(async (projectName: string | undefined, options) => {
    try {
      await createWorld(projectName, options);
    } catch (error) {
      if (error instanceof Error) {
        console.error(chalk.red('\nError:'), error.message);
      } else {
        console.error(chalk.red('\nAn unexpected error occurred'));
      }
      process.exit(1);
    }
  });
