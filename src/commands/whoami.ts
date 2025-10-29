import { Command } from 'commander';
import { whoami } from '../lib/auth.js';

export const whoamiCommand = new Command('whoami')
  .description('現在ログインしているユーザーを表示')
  .action(async () => {
    try {
      await whoami();
    } catch (error) {
      if (error instanceof Error) {
        console.error('エラー:', error.message);
      }
      process.exit(1);
    }
  });
