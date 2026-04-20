import path from 'node:path';
import fs from 'node:fs/promises';
import chalk from 'chalk';
import ora, { type Ora } from 'ora';
import cliProgress from 'cli-progress';
import prompts from 'prompts';
import { calculateContentHash, getMimeType, XriftApiError } from '@xrift/sdk';
import {
  loadProjectConfig,
  loadWorldMetadata,
  saveWorldMetadata,
  validateDistDir,
  scanDirectory,
} from './project-config.js';
import { getAuthenticatedClient } from './api.js';
import { logVerbose } from './logger.js';
import { runSecurityCheck, printResults } from './check.js';
import type {
  CreateWorldResponse,
  SignedUrlResponse,
  UploadFileInfo,
  WorldUploadUrlsRequest,
  WorldUploadUrlsResponse,
  CompleteWorldUploadResponse,
} from '../types/index.js';

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

    // 3. ファイルをスキャン
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
    let thumbnailPath: string | undefined;
    if (worldConfig.thumbnailPath) {
      const configuredPath = path.join(distDir, worldConfig.thumbnailPath);
      try {
        const stat = await fs.stat(configuredPath);
        if (stat.isFile()) {
          thumbnailPath = worldConfig.thumbnailPath;
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

    // 4. ファイル情報を準備
    const uploadFiles: UploadFileInfo[] = await Promise.all(
      files.map(async (filePath) => {
        const stat = await fs.stat(filePath);
        const relativePath = path.relative(distDir, filePath);
        return {
          localPath: filePath,
          remotePath: relativePath.replace(/\\/g, '/'), // Windows対応
          size: stat.size,
        };
      })
    );

    // 5. 認証済みクライアントを取得
    spinner = ora('Verifying credentials...').start();
    const client = await getAuthenticatedClient();
    spinner.succeed(chalk.green('Credentials verified'));

    // 6. ワールドメタデータを確認（新規/更新判定）
    const existingMetadata = await loadWorldMetadata(cwd);
    let worldId: string;
    let worldName: string;
    let worldDescription: string | undefined;

    if (existingMetadata) {
      logVerbose(`\nUpdating existing world (ID: ${existingMetadata.id})`);
      worldId = existingMetadata.id;

      // 更新時は設定ファイルから名前と説明を取得
      worldName = worldConfig.title || path.basename(cwd);
      worldDescription = worldConfig.description;
    } else {
      // 新規作成時はメタデータを収集
      // xrift.json に title があればプロンプトをスキップ
      let metadata: { title: string; description?: string };
      if (worldConfig.title) {
        metadata = { title: worldConfig.title, description: worldConfig.description };
        console.log(chalk.blue(`\n📝 World title: ${metadata.title}`));
        if (metadata.description) {
          console.log(chalk.blue(`   Description: ${metadata.description}`));
        }
      } else {
        metadata = await collectWorldMetadata(
          {
            title: worldConfig.title,
            description: worldConfig.description,
          },
          path.basename(cwd)
        );
      }
      worldName = metadata.title;
      worldDescription = metadata.description;

      // 新規ワールド作成
      spinner = ora('Creating new world...').start();

      try {
        const response: CreateWorldResponse = await client.worlds.create();

        worldId = response.id;
        spinner.succeed(chalk.green(`New world created (ID: ${worldId})`));
      } catch (error) {
        spinner.fail(chalk.red('Failed to create world'));
        throw error;
      }
    }

    // 7. contentHashとfileSizeを計算
    spinner = ora('Calculating file hashes...').start();
    const hashFiles = await Promise.all(
      uploadFiles.map(async (f) => ({
        remotePath: f.remotePath,
        data: new Uint8Array(await fs.readFile(f.localPath)),
      }))
    );
    const contentHash = await calculateContentHash(hashFiles, {
      physics: worldConfig.physics,
      camera: worldConfig.camera,
      permissions: worldConfig.permissions,
      outputBufferType: worldConfig.outputBufferType,
    });
    const fileSize = calculateTotalSize(uploadFiles);
    spinner.succeed(
      chalk.green(`Hash calculated (contentHash: ${contentHash}, fileSize: ${fileSize} bytes)`)
    );

    // 8. 署名付きURLを取得
    spinner = ora('Fetching upload URLs...').start();

    let signedUrls: SignedUrlResponse[];
    let versionId: string;
    let versionNumber: number;
    try {
      const uploadUrlsRequest: WorldUploadUrlsRequest = {
        name: worldName,
        description: worldDescription,
        thumbnailPath: thumbnailPath,
        physics: worldConfig.physics,
        camera: worldConfig.camera,
        permissions: worldConfig.permissions,
        outputBufferType: worldConfig.outputBufferType,
        contentHash,
        fileSize,
        files: uploadFiles.map((f) => ({
          path: f.remotePath,
          contentType: getMimeType(f.localPath),
        })),
      };

      const response: WorldUploadUrlsResponse = await client.worlds.getUploadUrls(
        worldId,
        uploadUrlsRequest
      );

      signedUrls = response.uploadUrls;
      versionId = response.versionId;
      versionNumber = response.versionNumber;

      spinner.succeed(
        chalk.green(
          `Retrieved ${signedUrls.length} upload URLs (version: ${versionNumber})`
        )
      );

      // デバッグ: 最初のURLを表示
      if (signedUrls.length > 0) {
        logVerbose(`Debug: First URL structure: ${JSON.stringify(signedUrls[0], null, 2)}`);
      }
      logVerbose(`Version ID: ${versionId}`);
    } catch (error) {
      spinner.fail(chalk.red('Failed to retrieve upload URLs'));
      if (error instanceof XriftApiError && error.responseBody) {
        const errorData = error.responseBody as Record<string, unknown>;
        const errorMessage = errorData.error
          ? String(errorData.error)
          : JSON.stringify(errorData);
        console.error(chalk.red(`Backend error: ${errorMessage}`));
      }
      throw error;
    }

    // 9. ファイルをアップロード
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

    progressBar.start(uploadFiles.length, 0, { filename: '' });

    for (let i = 0; i < uploadFiles.length; i++) {
      const fileInfo = uploadFiles[i];
      const signedUrl = signedUrls[i];

      progressBar.update(i, { filename: fileInfo.remotePath });

      try {
        const fileBuffer = await fs.readFile(fileInfo.localPath);

        await fetch(signedUrl.uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': getMimeType(fileInfo.localPath),
            'Content-Length': String(fileInfo.size),
          },
          body: fileBuffer,
        });
      } catch (error) {
        progressBar.stop();
        console.error(chalk.red(`\n❌ Failed to upload ${fileInfo.remotePath}`));
        throw error;
      }
    }

    progressBar.update(uploadFiles.length, { filename: 'Done' });
    progressBar.stop();

    // 10. アップロード完了通知
    spinner = ora('Notifying upload completion...').start();
    try {
      const completeResponse: CompleteWorldUploadResponse = await client.worlds.complete(
        worldId,
        versionId
      );

      spinner.succeed(
        chalk.green(
          `Upload completed (version: ${completeResponse.versionNumber})`
        )
      );
      logVerbose(`Status: ${completeResponse.status}`);
      logVerbose(`World name: ${completeResponse.name}`);
    } catch (error) {
      spinner.fail(chalk.red('Failed to notify upload completion'));
      if (error instanceof XriftApiError && error.responseBody) {
        console.error(chalk.red(`Backend error: ${JSON.stringify(error.responseBody)}`));
      }
      throw error;
    }

    // 11. メタデータを保存
    await saveWorldMetadata(
      {
        id: worldId,
        createdAt: existingMetadata?.createdAt || new Date().toISOString(),
        lastUploadedAt: new Date().toISOString(),
      },
      cwd
    );

    console.log(chalk.green(`\n✅ World upload complete: ${uploadFiles.length} files`));
    logVerbose(`World ID: ${worldId}`);
    if (thumbnailPath) {
      logVerbose(`Thumbnail: ${thumbnailPath}`);
    }
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
 * 全ファイルのサイズ合計を計算
 */
function calculateTotalSize(uploadFiles: UploadFileInfo[]): number {
  return uploadFiles.reduce((total, file) => total + file.size, 0);
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
