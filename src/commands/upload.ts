import { Command } from 'commander';
import { uploadWorld } from '../lib/upload.js';
import { uploadItem } from '../lib/item.js';
import { detectProjectType } from '../lib/project-config.js';

export const uploadCommand = new Command('upload')
  .description('Upload to XRift')
  .action(async () => {
    // サブコマンド未指定: xrift.json から自動判定
    try {
      const type = await detectProjectType();
      if (type === 'world') {
        await uploadWorld();
      } else if (type === 'item') {
        await uploadItem();
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error('Error:', error.message);
      }
      process.exit(1);
    }
  });

uploadCommand
  .command('world')
  .description('Upload a world')
  .action(async () => {
    try {
      await uploadWorld();
    } catch (error) {
      if (error instanceof Error) {
        console.error('Error:', error.message);
      }
      process.exit(1);
    }
  });

uploadCommand
  .command('item')
  .description('Upload an item (reads from xrift.json)')
  .action(async () => {
    try {
      await uploadItem();
    } catch (error) {
      if (error instanceof Error) {
        console.error('Error:', error.message);
      }
      process.exit(1);
    }
  });

export default uploadCommand;
