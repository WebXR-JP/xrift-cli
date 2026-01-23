import { Command } from 'commander';
import { uploadWorld } from '../lib/upload.js';
import { str } from '../lib/i18n.js';

export const uploadCommand = new Command('upload')
  .description(str('ワールドまたはアバターをアップロード'));

uploadCommand
  .command('world')
  .description(str('ワールドをアップロード'))
  .action(async () => {
    try {
      await uploadWorld();
    } catch (error) {
      if (error instanceof Error) {
        console.error('エラー:', error.message);
      }
      process.exit(1);
    }
  });

export default uploadCommand;
