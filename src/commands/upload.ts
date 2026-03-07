import { Command } from 'commander';
import { uploadWorld } from '../lib/upload.js';
import { detectProjectType } from '../lib/project-config.js';

export const uploadCommand = new Command('upload')
  .description('Upload to XRift')
  .action(async () => {
    // サブコマンド未指定: xrift.json から自動判定
    try {
      const type = await detectProjectType();
      if (type === 'world') {
        await uploadWorld();
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

export default uploadCommand;
