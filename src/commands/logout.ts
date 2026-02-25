import { Command } from 'commander';
import { logout } from '../lib/auth.js';

export const logoutCommand = new Command('logout')
  .description('Log out')
  .action(async () => {
    try {
      await logout();
    } catch (error) {
      if (error instanceof Error) {
        console.error('Error:', error.message);
      }
      process.exit(1);
    }
  });
