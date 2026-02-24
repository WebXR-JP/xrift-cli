import { Command } from 'commander';
import { uploadWorld } from '../lib/upload.js';

export const uploadCommand = new Command('upload')
  .description('ワールドまたはアバターをアップロード');

uploadCommand
  .command('world')
  .description('ワールドをアップロード')
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
