import { Command } from 'commander';
import { whoami } from '../lib/auth.js';

export const whoamiCommand = new Command('whoami')
  .description('Display the currently logged-in user')
  .action(async () => {
    try {
      await whoami();
    } catch (error) {
      if (error instanceof Error) {
        console.error('Error:', error.message);
      }
      process.exit(1);
    }
  });
