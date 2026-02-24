import { Command } from 'commander';
import { uploadWorld } from '../lib/upload.js';

export const uploadCommand = new Command('upload')
  .description('ワールドまたはアバターをアップロード');

uploadCommand
  .command('world')
  .description('ワールドをアップロード')
  .option('--skip-check', 'セキュリティチェックをスキップ')
  .action(async (options) => {
    try {
      await uploadWorld({ skipCheck: options.skipCheck }, process.cwd());
    } catch (error) {
      if (error instanceof Error) {
        console.error('エラー:', error.message);
      }
      process.exit(1);
    }
  });

export default uploadCommand;
