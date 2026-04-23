import path from 'node:path';
import fs from 'node:fs/promises';
import chalk from 'chalk';
import ora, { type Ora } from 'ora';
import cliProgress from 'cli-progress';
import prompts from 'prompts';
import { uploadItemFromDirectory } from '@xrift/sdk/node';
import {
  loadProjectConfig,
  updateProjectConfig,
  loadItemMetadata,
  saveItemMetadata,
  validateDistDir,
  scanDirectory,
} from './project-config.js';
import { getVerifiedToken } from './api.js';
import { API_BASE_URL } from './constants.js';
import { logVerbose } from './logger.js';
import { runSecurityCheck, printResults } from './check.js';

/**
 * アイテムをアップロード
 */
export async function uploadItem(cwd: string = process.cwd(), skipCheck?: boolean): Promise<void> {
  console.log(chalk.blue('📦 Starting item upload\n'));

  let spinner: Ora | undefined;

  try {
    // 1. プロジェクト設定を読み込み
    spinner = ora('Loading project config...').start();
    const config = await loadProjectConfig(cwd);

    if (!config.item) {
      spinner.fail(chalk.red('No item config found in xrift.json'));
      throw new Error('item is not configured in xrift.json');
    }

    const itemConfig = config.item;
    const distDir = path.resolve(cwd, itemConfig.distDir);
    spinner.succeed(chalk.green(`Config loaded: distDir=${itemConfig.distDir}`));

    // 1.5. ビルドコマンドを実行
    if (itemConfig.buildCommand) {
      console.log(chalk.blue(`\n🔨 Running build command: ${itemConfig.buildCommand}\n`));
      try {
        const { execSync } = await import('node:child_process');
        execSync(itemConfig.buildCommand, {
          cwd,
          stdio: 'inherit',
        });
        console.log(chalk.green('\n✓ Build completed\n'));
      } catch (error) {
        console.error(chalk.red('\n✗ Build failed\n'));
        throw error;
      }
    }

    // 2. distディレクトリを検証
    spinner = ora('Validating dist directory...').start();
    await validateDistDir(distDir);
    spinner.succeed(chalk.green('Dist directory validated'));

    // 3. ファイルをスキャン（セキュリティチェック用）
    spinner = ora('Scanning files...').start();
    const files = await scanDirectory(distDir, itemConfig.ignore);

    if (files.length === 0) {
      spinner.fail(chalk.red('No files found to upload'));
      return;
    }

    spinner.succeed(chalk.green(`Found ${files.length} files`));

    // 3.5. セキュリティチェック
    if (!skipCheck) {
      spinner = ora('Running security check...').start();
      const jsFiles = files.filter((f) => /\.(js|mjs)$/.test(f));
      if (jsFiles.length > 0) {
        const checkResult = await runSecurityCheck(jsFiles, distDir, itemConfig.permissions);
        if (checkResult.hasReject) {
          spinner.fail('Security check failed');
          printResults(checkResult, 'item');
          throw new Error('Upload aborted due to security violations');
        }
        if (checkResult.hasReview) {
          spinner.warn('Security check has warnings');
          printResults(checkResult, 'item');
        } else {
          spinner.succeed('Security check passed');
        }
      } else {
        spinner.succeed('No JS files to check');
      }
    }

    // 3.6. サムネイル設定を確認
    if (itemConfig.thumbnailPath) {
      const configuredPath = path.join(distDir, itemConfig.thumbnailPath);
      try {
        const stat = await fs.stat(configuredPath);
        if (stat.isFile()) {
          console.log(chalk.green(`✓ Thumbnail: ${itemConfig.thumbnailPath}`));
        } else {
          throw new Error(`${itemConfig.thumbnailPath} is not a file`);
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new Error(
            `Configured thumbnail not found: ${itemConfig.thumbnailPath}`
          );
        }
        throw error;
      }
    }

    // 4. 認証トークンを取得
    spinner = ora('Verifying credentials...').start();
    const token = await getVerifiedToken();
    spinner.succeed(chalk.green('Credentials verified'));

    // 5. アイテムメタデータを確認（新規/更新判定）
    const existingMetadata = await loadItemMetadata(cwd);
    let itemId: string | undefined;

    if (existingMetadata) {
      logVerbose(`\nUpdating existing item (ID: ${existingMetadata.id})`);
      itemId = existingMetadata.id;
    } else {
      // 新規作成時: title が未設定ならインタラクティブに入力して xrift.json に保存
      if (!itemConfig.title) {
        const metadata = await collectItemMetadata(
          {
            title: itemConfig.title,
            description: itemConfig.description,
          },
          path.basename(cwd)
        );
        // xrift.json に保存
        await updateProjectConfig(cwd, {
          item: { title: metadata.title, description: metadata.description },
        } as Partial<typeof config>);
      } else {
        console.log(chalk.blue(`\n📝 Item title: ${itemConfig.title}`));
        if (itemConfig.description) {
          console.log(chalk.blue(`   Description: ${itemConfig.description}`));
        }
      }
    }

    // 6. SDK の uploadItemFromDirectory に委譲
    console.log(chalk.blue('\n📤 Uploading files...\n'));

    const progressBar = new cliProgress.SingleBar(
      {
        format: `${chalk.cyan('{bar}')} | {percentage}% | {value}/{total} files | {filename}`,
        barCompleteChar: '█',
        barIncompleteChar: '░',
        hideCursor: true,
      },
      cliProgress.Presets.shades_classic
    );

    let progressStarted = false;

    const result = await uploadItemFromDirectory(cwd, {
      token,
      baseUrl: API_BASE_URL,
      itemId,
      onProgress: (progress) => {
        if (!progressStarted) {
          progressBar.start(progress.total, 0, { filename: '' });
          progressStarted = true;
        }
        progressBar.update(progress.completed, { filename: progress.currentFile });
      },
    });

    if (progressStarted) {
      progressBar.stop();
    }

    // 7. メタデータを保存
    await saveItemMetadata(
      {
        id: result.itemId,
        createdAt: existingMetadata?.createdAt || new Date().toISOString(),
        lastUploadedAt: new Date().toISOString(),
      },
      cwd
    );

    console.log(chalk.green(`\n✅ Item upload complete (version: ${result.versionNumber})`));
    logVerbose(`Item ID: ${result.itemId}`);
    logVerbose(`Content hash: ${result.contentHash}`);
  } catch (error) {
    if (spinner) {
      spinner.fail(chalk.red('An error occurred'));
    }

    if (error instanceof Error) {
      console.error(chalk.red(`\n❌ ${error.message}`));
    }

    throw error;
  }
}

/**
 * インタラクティブにアイテムのメタデータを収集
 */
async function collectItemMetadata(
  config: { title?: string; description?: string },
  defaultName: string
): Promise<{ title: string; description?: string }> {
  console.log(chalk.blue('\n📝 Enter item information\n'));

  const response = await prompts(
    [
      {
        type: 'text',
        name: 'title',
        message: 'Item title',
        initial: config.title || defaultName,
        validate: (value: string) => (value.trim() ? true : 'Title is required'),
      },
      {
        type: 'text',
        name: 'description',
        message: 'Item description (optional)',
        initial: config.description || '',
      },
    ],
    {
      onCancel: () => {
        throw new Error('Upload cancelled');
      },
    }
  );

  return {
    title: response.title.trim(),
    description: response.description?.trim() || undefined,
  };
}
