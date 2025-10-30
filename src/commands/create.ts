import { Command } from 'commander';
import { resolve } from 'path';
import { access, constants, readdir } from 'fs';
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

/**
 * ディレクトリが空かチェック
 */
async function isDirectoryEmpty(path: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    readdir(path, (err, files) => {
      if (err) {
        reject(err);
      } else {
        // .git などの隠しファイルを除外
        const visibleFiles = files.filter((file) => !file.startsWith('.'));
        resolve(visibleFiles.length === 0);
      }
    });
  });
}

interface CreateOptions {
  template?: string;
  skipInstall?: boolean;
  here?: boolean;
}

export const createCommand = new Command('create')
  .argument('<project-name>', 'プロジェクト名')
  .option(
    '-t, --template <repository>',
    'テンプレートリポジトリ（例: WebXR-JP/xrift-world-template）',
    'WebXR-JP/xrift-test-world'
  )
  .option('--skip-install', '依存関係のインストールをスキップ')
  .option('--here', 'カレントディレクトリに直接作成')
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
      let projectPath: string;

      if (options.here) {
        // カレントディレクトリに作成
        projectPath = process.cwd();

        // カレントディレクトリが空かチェック
        const isEmpty = await isDirectoryEmpty(projectPath);
        if (!isEmpty) {
          console.log(
            chalk.yellow(
              '⚠️  カレントディレクトリは空ではありません。既存のファイルは上書きされる可能性があります。'
            )
          );
        }
      } else {
        // 新しいディレクトリを作成
        projectPath = resolve(process.cwd(), projectName);

        // 既存ディレクトリのチェック
        const exists = await pathExists(projectPath);
        if (exists) {
          console.error(
            chalk.red(`エラー: ディレクトリ "${projectName}" は既に存在します`)
          );
          process.exit(1);
        }
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
      if (!options.here) {
        console.log(`  ${chalk.yellow(`cd ${projectName}`)}`);
      }
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
