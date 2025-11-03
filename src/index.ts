#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createCommand } from './commands/create.js';
import { loginCommand } from './commands/login.js';
import { logoutCommand } from './commands/logout.js';
import { whoamiCommand } from './commands/whoami.js';
import { uploadCommand } from './commands/upload.js';
import { checkForUpdates } from './lib/version-check.js';

// package.json からバージョンを読み込む
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../package.json'), 'utf-8')
);

const program = new Command();

program
  .name('xrift')
  .description('XRift CLI - Upload worlds and avatars to XRift')
  .version(packageJson.version, '-v, --version', 'バージョンを表示')
  .helpOption('-h, --help', 'ヘルプを表示');

// Register commands
program.addCommand(createCommand);
program.addCommand(loginCommand);
program.addCommand(logoutCommand);
program.addCommand(whoamiCommand);
program.addCommand(uploadCommand);

// バージョンチェックを実行（非同期、エラーは無視）
await checkForUpdates(packageJson.version);

program.parse();
