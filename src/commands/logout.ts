import { Command } from 'commander';
import { logout } from '../lib/auth.js';
import { str } from '../lib/i18n.js';

export const logoutCommand = new Command('logout')
  .description(str('ログアウト'))
  .action(async () => {
    try {
      await logout();
    } catch (error) {
      if (error instanceof Error) {
        console.error('エラー:', error.message);
      }
      process.exit(1);
    }
  });
