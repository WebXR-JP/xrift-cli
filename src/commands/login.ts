import { Command } from 'commander';
import { login } from '../lib/auth.js';

export const loginCommand = new Command('login')
  .description('Log in via browser authentication')
  .action(async () => {
    try {
      await login();
    } catch (error) {
      if (error instanceof Error) {
        console.error('Error:', error.message);
      }
      process.exit(1);
    }
  });
