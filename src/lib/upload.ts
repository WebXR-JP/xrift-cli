import path from 'node:path';
import fs from 'node:fs/promises';
import chalk from 'chalk';
import ora, { type Ora } from 'ora';
import cliProgress from 'cli-progress';
import prompts from 'prompts';
import { uploadWorldFromDirectory } from '@xrift/sdk/node';
import {
  loadProjectConfig,
  updateProjectConfig,
  loadWorldMetadata,
  saveWorldMetadata,
  validateDistDir,
  scanDirectory,
} from './project-config.js';
import { getVerifiedToken } from './api.js';
import { API_BASE_URL } from './constants.js';
import { logVerbose } from './logger.js';
import { runSecurityCheck, printResults } from './check.js';

/**
 * ワールドをアップロード
 */
export async function uploadWorld(cwd: string = process.cwd(), skipCheck?: boolean): Promise<void> {
  console.log(chalk.blue('🌍 Starting world upload\n'));

  let spinner: Ora | undefined;

  try {
    // 1. プロジェクト設定を読み込み
    spinner = ora('Loading project config...').start();
    const config = await loadProjectConfig(cwd);

    if (!config.world) {
      spinner.fail(chalk.red('No world config found in xrift.json'));
      throw new Error('world is not configured in xrift.json');
    }

    const worldConfig = config.world;
    const distDir = path.resolve(cwd, worldConfig.distDir);
    spinner.succeed(chalk.green(`Config loaded: distDir=${worldConfig.distDir}`));

    // 1.5. ビルドコマンドを実行
    if (worldConfig.buildCommand) {
      console.log(chalk.blue(`\n🔨 Running build command: ${worldConfig.buildCommand}\n`));
      try {
        const { execSync } = await import('node:child_process');
        execSync(worldConfig.buildCommand, {
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
    const files = await scanDirectory(distDir, worldConfig.ignore);

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
        const checkResult = await runSecurityCheck(jsFiles, distDir, worldConfig.permissions);
        if (checkResult.hasReject) {
          spinner.fail('Security check failed');
          printResults(checkResult);
          throw new Error('Upload aborted due to security violations');
        }
        if (checkResult.hasReview) {
          spinner.warn('Security check has warnings');
          printResults(checkResult);
        } else {
          spinner.succeed('Security check passed');
        }
      } else {
        spinner.succeed('No JS files to check');
      }
    }

    // 3.6. サムネイル設定を確認
    if (worldConfig.thumbnailPath) {
      const configuredPath = path.join(distDir, worldConfig.thumbnailPath);
      try {
        const stat = await fs.stat(configuredPath);
        if (stat.isFile()) {
          console.log(chalk.green(`✓ Thumbnail: ${worldConfig.thumbnailPath}`));
        } else {
          throw new Error(`${worldConfig.thumbnailPath} is not a file`);
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new Error(
            `Configured thumbnail not found: ${worldConfig.thumbnailPath}`
          );
        }
        throw error;
      }
    }

    // 4. 認証トークンを取得
    spinner = ora('Verifying credentials...').start();
    const token = await getVerifiedToken();
    spinner.succeed(chalk.green('Credentials verified'));

    // 5. ワールドメタデータを確認（新規/更新判定）
    const existingMetadata = await loadWorldMetadata(cwd);
    let worldId: string | undefined;

    if (existingMetadata) {
      logVerbose(`\nUpdating existing world (ID: ${existingMetadata.id})`);
      worldId = existingMetadata.id;
    } else {
      // 新規作成時: title が未設定ならインタラクティブに入力して xrift.json に保存
      if (!worldConfig.title) {
        const metadata = await collectWorldMetadata(
          {
            title: worldConfig.title,
            description: worldConfig.description,
          },
          path.basename(cwd)
        );
        // xrift.json に保存
        await updateProjectConfig(cwd, {
          world: { title: metadata.title, description: metadata.description },
        } as Partial<typeof config>);
      } else {
        console.log(chalk.blue(`\n📝 World title: ${worldConfig.title}`));
        if (worldConfig.description) {
          console.log(chalk.blue(`   Description: ${worldConfig.description}`));
        }
      }
    }

    // 6. SDK の uploadWorldFromDirectory に委譲
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

    const result = await uploadWorldFromDirectory(distDir, {
      token,
      baseUrl: API_BASE_URL,
      worldId,
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
    await saveWorldMetadata(
      {
        id: result.worldId,
        createdAt: existingMetadata?.createdAt || new Date().toISOString(),
        lastUploadedAt: new Date().toISOString(),
      },
      cwd
    );

    console.log(chalk.green(`\n✅ World upload complete (version: ${result.versionNumber})`));
    logVerbose(`World ID: ${result.worldId}`);
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
 * インタラクティブにワールドのメタデータを収集
 */
async function collectWorldMetadata(
  config: { title?: string; description?: string },
  defaultName: string
): Promise<{ title: string; description?: string }> {
  console.log(chalk.blue('\n📝 Enter world information\n'));

  const response = await prompts(
    [
      {
        type: 'text',
        name: 'title',
        message: 'World title',
        initial: config.title || defaultName,
        validate: (value: string) => (value.trim() ? true : 'Title is required'),
      },
      {
        type: 'text',
        name: 'description',
        message: 'World description (optional)',
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
