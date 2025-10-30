import { Command } from 'commander';
import { resolve } from 'path';
import { access, constants, readdir } from 'fs';
import chalk from 'chalk';
import prompts from 'prompts';
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
  interactive?: boolean;
  y?: boolean;
}

export const createCommand = new Command('create')
  .argument('[project-name]', 'プロジェクト名（省略時は対話式）')
  .option(
    '-t, --template <repository>',
    'テンプレートリポジトリ（例: WebXR-JP/xrift-world-template）',
    'WebXR-JP/xrift-test-world'
  )
  .option('--skip-install', '依存関係のインストールをスキップ')
  .option('--here', 'カレントディレクトリに直接作成')
  .option('-y, --no-interactive', '対話式モードを無効化')
  .description('新しいXRiftプロジェクトを作成')
  .action(async (projectName: string | undefined, options: CreateOptions) => {
    try {
      // --no-interactive の場合、プロジェクト名が必須
      if (options.interactive === false && !projectName) {
        console.error(
          chalk.red(
            '\nエラー: --no-interactive を使用する場合はプロジェクト名が必要です'
          )
        );
        process.exit(1);
      }

      // 対話式モードが必要か判定
      const needsInteraction =
        options.interactive !== false &&
        (!projectName ||
          options.here === undefined ||
          options.skipInstall === undefined);

      if (needsInteraction) {
        console.log(chalk.cyan('\n✨ XRiftワールドを作成します\n'));

        const questions = [];

        // プロジェクト名が未指定の場合のみ質問
        if (!projectName) {
          questions.push({
            type: 'text',
            name: 'projectName',
            message: 'プロジェクト名を入力してください',
            validate: (value: string) =>
              /^[a-z0-9-]+$/.test(value)
                ? true
                : '小文字の英数字とハイフンのみ使用できます',
          });
        }

        // 作成場所が未指定の場合のみ質問
        if (options.here === undefined) {
          questions.push({
            type: 'select',
            name: 'location',
            message: 'どこに作成しますか？',
            choices: [
              { title: '新しいディレクトリを作成', value: 'new' },
              { title: 'カレントディレクトリに直接作成', value: 'here' },
            ],
            initial: 0,
          });
        }

        // テンプレートがデフォルトの場合のみ質問
        if (!options.template || options.template === 'WebXR-JP/xrift-test-world') {
          questions.push({
            type: 'select',
            name: 'templateType',
            message: 'テンプレートを選択してください',
            choices: [
              { title: 'デフォルト (WebXR-JP/xrift-test-world)', value: 'default' },
              { title: 'カスタムテンプレート', value: 'custom' },
            ],
            initial: 0,
          });
          questions.push({
            type: (prev: string) => (prev === 'custom' ? 'text' : null),
            name: 'customTemplate',
            message: 'GitHubリポジトリを入力してください (例: username/repo)',
            validate: (value: string) =>
              value && value.includes('/')
                ? true
                : '正しい形式で入力してください (username/repo)',
          });
        }

        // インストール有無が未指定の場合のみ質問
        if (options.skipInstall === undefined) {
          questions.push({
            type: 'confirm',
            name: 'install',
            message: '依存関係をインストールしますか？',
            initial: true,
          });
        }

        const response = await prompts(questions as any);

        // ユーザーがキャンセルした場合
        if (Object.keys(response).length === 0) {
          console.log(chalk.yellow('\n❌ キャンセルされました'));
          process.exit(0);
        }

        // 対話式モードの回答を変数に設定
        if (response.projectName) {
          projectName = response.projectName;
        }
        if (response.location !== undefined) {
          options.here = response.location === 'here';
        }
        if (response.install !== undefined) {
          options.skipInstall = !response.install;
        }
        if (response.templateType === 'custom') {
          options.template = response.customTemplate;
        }
      }

      // この時点で projectName は必ず定義されている
      if (!projectName) {
        console.error(chalk.red('\nエラー: プロジェクト名が指定されていません'));
        process.exit(1);
      }

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
