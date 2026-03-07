import { resolve } from 'path';
import { access, constants, readdir } from 'fs';
import chalk from 'chalk';
import prompts from 'prompts';
import {
  downloadTemplate,
  customizeProject,
  installDependencies,
} from './template.js';

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

export interface CreateWorldOptions {
  template?: string;
  skipInstall?: boolean;
  here?: boolean;
  interactive?: boolean;
  y?: boolean;
}

export async function createWorld(
  projectName: string | undefined,
  options: CreateWorldOptions
): Promise<void> {
  // テンプレートのデフォルト値
  if (!options.template) {
    options.template = 'WebXR-JP/xrift-test-world';
  }

  // --no-interactive の場合、プロジェクト名が必須
  if (options.interactive === false && !projectName) {
    throw new Error('Project name is required when using --no-interactive');
  }

  // 対話式モードが必要か判定
  const needsInteraction =
    options.interactive !== false &&
    (!projectName ||
      options.here === undefined ||
      options.skipInstall === undefined);

  if (needsInteraction) {
    console.log(chalk.cyan('\n✨ Creating an XRift world\n'));

    const questions = [];

    // プロジェクト名が未指定の場合のみ質問
    if (!projectName) {
      questions.push({
        type: 'text',
        name: 'projectName',
        message: 'Enter a project name',
        validate: (value: string) =>
          /^[a-z0-9-]+$/.test(value)
            ? true
            : 'Only lowercase alphanumeric characters and hyphens are allowed',
      });
    }

    // 作成場所が未指定の場合のみ質問
    if (options.here === undefined) {
      questions.push({
        type: 'select',
        name: 'location',
        message: 'Where should the project be created?',
        choices: [
          { title: 'Create a new directory', value: 'new' },
          { title: 'Create in the current directory', value: 'here' },
        ],
        initial: 0,
      });
    }

    // テンプレートがデフォルトの場合のみ質問
    if (!options.template || options.template === 'WebXR-JP/xrift-test-world') {
      questions.push({
        type: 'select',
        name: 'templateType',
        message: 'Select a template',
        choices: [
          { title: 'Default (WebXR-JP/xrift-test-world)', value: 'default' },
          { title: 'Custom template', value: 'custom' },
        ],
        initial: 0,
      });
      questions.push({
        type: (prev: string) => (prev === 'custom' ? 'text' : null),
        name: 'customTemplate',
        message: 'Enter a GitHub repository (e.g. username/repo)',
        validate: (value: string) =>
          value && value.includes('/')
            ? true
            : 'Please enter a valid format (username/repo)',
      });
    }

    // インストール有無が未指定の場合のみ質問
    if (options.skipInstall === undefined) {
      questions.push({
        type: 'confirm',
        name: 'install',
        message: 'Install dependencies?',
        initial: true,
      });
    }

    const response = await prompts(questions as any);

    // ユーザーがキャンセルした場合
    if (Object.keys(response).length === 0) {
      console.log(chalk.yellow('\n❌ Cancelled'));
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
    throw new Error('Project name is not specified');
  }

  console.log(chalk.cyan(`\n✨ Creating an XRift world...\n`));

  // プロジェクト名のバリデーション
  if (!/^[a-z0-9-]+$/.test(projectName)) {
    throw new Error(
      'Project name must contain only lowercase alphanumeric characters and hyphens'
    );
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
          '⚠️  The current directory is not empty. Existing files may be overwritten.'
        )
      );
    }
  } else {
    // 新しいディレクトリを作成
    projectPath = resolve(process.cwd(), projectName);

    // 既存ディレクトリのチェック
    const exists = await pathExists(projectPath);
    if (exists) {
      throw new Error(`Directory "${projectName}" already exists`);
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
  console.log(chalk.green('\n✅ Project created successfully!\n'));
  console.log(chalk.cyan('Next steps:'));
  if (!options.here) {
    console.log(`  ${chalk.yellow(`cd ${projectName}`)}`);
  }
  if (options.skipInstall) {
    console.log(`  ${chalk.yellow('npm install')}       # Install dependencies`);
  }
  console.log(`  ${chalk.yellow('npm run dev')}        # Start dev server`);
  console.log(`  ${chalk.yellow('npm run build')}      # Build`);
  console.log(`  ${chalk.yellow('xrift upload world')} # Upload to XRift\n`);
}
