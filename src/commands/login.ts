import { Command } from 'commander';
import { login } from '../lib/auth.js';
import { str } from '../lib/i18n.js';

export const loginCommand = new Command('login')
  .description(str('ブラウザ認証でログイン'))
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
