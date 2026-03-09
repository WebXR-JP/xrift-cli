import { Command } from 'commander';
import {
  listItems,
  getItemInfo,
  uploadItemThumbnail,
  deleteItem,
} from '../lib/item.js';

export const itemCommand = new Command('item')
  .description('Manage items');

itemCommand
  .command('list')
  .description('List your items')
  .action(async () => {
    try {
      await listItems();
    } catch (error) {
      if (error instanceof Error) {
        console.error('Error:', error.message);
      }
      process.exit(1);
    }
  });

itemCommand
  .command('info')
  .description('Show item details')
  .argument('<itemId>', 'Item ID')
  .action(async (itemId: string) => {
    try {
      await getItemInfo(itemId);
    } catch (error) {
      if (error instanceof Error) {
        console.error('Error:', error.message);
      }
      process.exit(1);
    }
  });

itemCommand
  .command('thumbnail')
  .description('Set item thumbnail')
  .argument('<itemId>', 'Item ID')
  .argument('<image>', 'Image file (png, jpg, webp)')
  .action(async (itemId: string, image: string) => {
    try {
      await uploadItemThumbnail(itemId, image);
    } catch (error) {
      if (error instanceof Error) {
        console.error('Error:', error.message);
      }
      process.exit(1);
    }
  });

itemCommand
  .command('delete')
  .description('Delete an item')
  .argument('<itemId>', 'Item ID')
  .action(async (itemId: string) => {
    try {
      await deleteItem(itemId);
    } catch (error) {
      if (error instanceof Error) {
        console.error('Error:', error.message);
      }
      process.exit(1);
    }
  });

export default itemCommand;
