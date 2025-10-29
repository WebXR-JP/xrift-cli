import { Command } from 'commander';
import { login } from '../lib/auth.js';

export const loginCommand = new Command('login')
  .description('ブラウザ認証でログイン')
  .action(async () => {
    try {
      await login();
    } catch (error) {
      if (error instanceof Error) {
        console.error('エラー:', error.message);
      }
      process.exit(1);
    }
  });
