import { Command } from 'commander';
import { uploadWorld } from '../lib/upload.js';
import { uploadItem } from '../lib/item.js';
import { detectProjectType } from '../lib/project-config.js';

export const uploadCommand = new Command('upload')
  .description('Upload to XRift')
  .option('--skip-check', 'Skip security check before upload')
  .option(
    '--skip-item-scan',
    'Skip checking that every <Item itemId> in the bundle is declared in xrift.json world.items (world only)'
  )
  .action(async (options) => {
    // サブコマンド未指定: xrift.json から自動判定
    try {
      const type = await detectProjectType();
      if (type === 'world') {
        await uploadWorld(process.cwd(), options.skipCheck, options.skipItemScan);
      } else if (type === 'item') {
        await uploadItem(process.cwd(), options.skipCheck);
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
  .option('--skip-check', 'Skip security check before upload')
  .option(
    '--skip-item-scan',
    'Skip checking that every <Item itemId> in the bundle is declared in xrift.json world.items'
  )
  .action(async (options) => {
    try {
      await uploadWorld(process.cwd(), options.skipCheck, options.skipItemScan);
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
  .option('--skip-check', 'Skip security check before upload')
  .action(async (options) => {
    try {
      await uploadItem(process.cwd(), options.skipCheck);
    } catch (error) {
      if (error instanceof Error) {
        console.error('Error:', error.message);
      }
      process.exit(1);
    }
  });

export default uploadCommand;
