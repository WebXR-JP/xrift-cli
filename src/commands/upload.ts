import { Command } from 'commander';
import { uploadWorld } from '../lib/upload.js';

export const uploadCommand = new Command('upload')
  .description('Upload a world or avatar');

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
