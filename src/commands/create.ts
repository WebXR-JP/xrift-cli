import { Command } from 'commander';
import { resolve } from 'path';
import { access, constants } from 'fs';
import chalk from 'chalk';
import {
  downloadTemplate,
  customizeProject,
  installDependencies,
} from '../lib/template.js';

/**
 * ファイルまたはディレクトリが存在するかチェック
 */
async function pathExists(path: string): Promise<boolean> {
  try {
    await new Promise<void>((resolve, reject) => {
      access(path, constants.F_OK, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    return true;
  } catch {
    return false;
  }
}

interface CreateOptions {
  template?: string;
  skipInstall?: boolean;
}

export const createCommand = new Command('create')
  .argument('<project-name>', 'プロジェクト名')
  .option(
    '-t, --template <repository>',
    'テンプレートリポジトリ（例: WebXR-JP/xrift-world-template）',
    'WebXR-JP/xrift-test-world'
  )
  .option('--skip-install', '依存関係のインストールをスキップ')
  .description('新しいXRiftプロジェクトを作成')
  .action(async (projectName: string, options: CreateOptions) => {
    try {
      console.log(chalk.cyan(`\n✨ XRiftワールドを作成します...\n`));

      // プロジェクト名のバリデーション
      if (!/^[a-z0-9-]+$/.test(projectName)) {
        console.error(
          chalk.red(
            'エラー: プロジェクト名は小文字の英数字とハイフンのみ使用できます'
          )
        );
        process.exit(1);
      }

      // プロジェクトパスの設定
      const projectPath = resolve(process.cwd(), projectName);

      // 既存ディレクトリのチェック
      const exists = await pathExists(projectPath);
      if (exists) {
        console.error(
          chalk.red(`エラー: ディレクトリ "${projectName}" は既に存在します`)
        );
        process.exit(1);
      }

      // テンプレートのダウンロード
      await downloadTemplate(options.template!, projectPath);

      // プロジェクトのカスタマイズ
      await customizeProject(projectName, projectPath);

      // 依存関係のインストール
      if (!options.skipInstall) {
        await installDependencies(projectPath);
      }

      // 完了メッセージ
      console.log(chalk.green('\n✅ プロジェクトが作成されました！\n'));
      console.log(chalk.cyan('次のステップ:'));
      console.log(`  ${chalk.yellow(`cd ${projectName}`)}`);
      if (options.skipInstall) {
        console.log(`  ${chalk.yellow('npm install')}       # 依存関係をインストール`);
      }
      console.log(`  ${chalk.yellow('npm run dev')}        # 開発サーバー起動`);
      console.log(`  ${chalk.yellow('npm run build')}      # ビルド`);
      console.log(`  ${chalk.yellow('xrift upload world')} # XRiftにアップロード\n`);
    } catch (error) {
      if (error instanceof Error) {
        console.error(chalk.red('\nエラー:'), error.message);
      } else {
        console.error(chalk.red('\n予期しないエラーが発生しました'));
      }
      process.exit(1);
    }
  });
