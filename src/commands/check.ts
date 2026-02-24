import { Command } from 'commander';
import { checkWorld } from '../lib/check.js';

export const checkCommand = new Command('check')
  .description('セキュリティチェックを実行');

checkCommand
  .command('world')
  .description('ワールドのビルド成果物をセキュリティチェック')
  .option('--build', 'チェック前にビルドコマンドを実行')
  .option('--ignore-warnings', '警告を無視しREJECTのみで失敗')
  .option('--json', '結果をJSON形式で出力')
  .action(async (options) => {
    const exitCode = await checkWorld({
      build: options.build,
      ignoreWarnings: options.ignoreWarnings,
      json: options.json,
    });
    process.exit(exitCode);
  });

export default checkCommand;
