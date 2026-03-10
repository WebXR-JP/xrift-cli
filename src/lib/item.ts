import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import chalk from 'chalk';
import ora, { type Ora } from 'ora';
import cliProgress from 'cli-progress';
import axios from 'axios';
import prompts from 'prompts';
import {
  loadProjectConfig,
  loadItemMetadata,
  saveItemMetadata,
  validateDistDir,
  scanDirectory,
} from './project-config.js';
import { getAuthenticatedClient } from './api.js';
import { ITEM_CREATE_PATH, ITEM_UPDATE_PATH, ITEM_COMPLETE_PATH } from './constants.js';
import { logVerbose } from './logger.js';
import type {
  CreateItemRequest,
  CreateItemResponse,
  UploadFileInfo,
  ItemUploadUrlsRequest,
  ItemUploadUrlsResponse,
} from '../types/index.js';

/**
 * アイテムをアップロード
 */
export async function uploadItem(cwd: string = process.cwd()): Promise<void> {
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

    // 3. ファイルをスキャン
    spinner = ora('Scanning files...').start();
    const files = await scanDirectory(distDir, itemConfig.ignore);

    if (files.length === 0) {
      spinner.fail(chalk.red('No files found to upload'));
      return;
    }

    spinner.succeed(chalk.green(`Found ${files.length} files`));

    // 4. ファイル情報を準備
    const uploadFiles: UploadFileInfo[] = await Promise.all(
      files.map(async (filePath) => {
        const stat = await fs.stat(filePath);
        const relativePath = path.relative(distDir, filePath);
        return {
          localPath: filePath,
          remotePath: relativePath.replace(/\\/g, '/'),
          size: stat.size,
        };
      })
    );

    // 5. 認証済みクライアントを取得
    spinner = ora('Verifying credentials...').start();
    const client = await getAuthenticatedClient();
    spinner.succeed(chalk.green('Credentials verified'));

    // 6. アイテムメタデータを確認（新規/更新判定）
    const existingMetadata = await loadItemMetadata(cwd);
    let itemId: string;

    if (existingMetadata) {
      logVerbose(`\nUpdating existing item (ID: ${existingMetadata.id})`);
      itemId = existingMetadata.id;
    } else {
      // メタデータを収集
      const metadata = await collectItemMetadata(
        {
          title: itemConfig.title,
          description: itemConfig.description,
        },
        path.basename(cwd)
      );

      // 新規アイテム作成
      spinner = ora('Creating new item...').start();

      try {
        const createRequest: CreateItemRequest = {
          name: metadata.title,
          description: metadata.description,
        };

        const response = await client.post<CreateItemResponse>(ITEM_CREATE_PATH, createRequest);

        itemId = response.data.id;
        spinner.succeed(chalk.green(`New item created (ID: ${itemId})`));
      } catch (error) {
        spinner.fail(chalk.red('Failed to create item'));
        throw error;
      }
    }

    // 7. contentHashとfileSizeを計算
    spinner = ora('Calculating file hashes...').start();
    const contentHash = await calculateContentHash(uploadFiles);
    const fileSize = calculateTotalSize(uploadFiles);
    spinner.succeed(
      chalk.green(`Hash calculated (contentHash: ${contentHash}, fileSize: ${fileSize} bytes)`)
    );

    // 8. 署名付きURLを取得
    spinner = ora('Fetching upload URLs...').start();

    try {
      const uploadUrlsRequest: ItemUploadUrlsRequest = {
        contentHash,
        fileSize,
        files: uploadFiles.map((f) => ({
          path: f.remotePath,
          contentType: getMimeType(f.localPath),
        })),
      };

      const response = await client.post<ItemUploadUrlsResponse>(
        `${ITEM_UPDATE_PATH}/${itemId}/upload-urls`,
        uploadUrlsRequest
      );

      const signedUrls = response.data.uploadUrls;

      spinner.succeed(
        chalk.green(`Retrieved ${signedUrls.length} upload URLs`)
      );

      if (signedUrls.length > 0) {
        logVerbose(`Debug: First URL structure: ${JSON.stringify(signedUrls[0], null, 2)}`);
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

          await axios.put(signedUrl.uploadUrl, fileBuffer, {
            headers: {
              'Content-Type': getMimeType(fileInfo.localPath),
              'Content-Length': fileInfo.size,
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
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

      await client.post(`${ITEM_COMPLETE_PATH}/${itemId}/complete`);

      spinner.succeed(chalk.green('Upload completed'));
    } catch (error) {
      spinner.fail(chalk.red('Failed during upload'));
      if (axios.isAxiosError(error) && error.response) {
        const errorData = error.response.data;
        const errorMessage = typeof errorData === 'object' && errorData.error
          ? errorData.error
          : JSON.stringify(errorData);
        console.error(chalk.red(`Backend error: ${errorMessage}`));
      }
      throw error;
    }

    // 11. メタデータを保存
    await saveItemMetadata(
      {
        id: itemId,
        createdAt: existingMetadata?.createdAt || new Date().toISOString(),
        lastUploadedAt: new Date().toISOString(),
      },
      cwd
    );

    console.log(chalk.green(`\n✅ Item upload complete: ${uploadFiles.length} files`));
    logVerbose(`Item ID: ${itemId}`);
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
 * 全ファイルを結合してSHA-256ハッシュを計算（先頭12文字）
 */
async function calculateContentHash(uploadFiles: UploadFileInfo[]): Promise<string> {
  const hash = crypto.createHash('sha256');

  const sortedFiles = [...uploadFiles].sort((a, b) =>
    a.remotePath.localeCompare(b.remotePath)
  );

  for (const fileInfo of sortedFiles) {
    const fileBuffer = await fs.readFile(fileInfo.localPath);
    hash.update(fileBuffer);
  }

  const fullHash = hash.digest('hex');
  return fullHash.substring(0, 12);
}

/**
 * 全ファイルのサイズ合計を計算
 */
function calculateTotalSize(uploadFiles: UploadFileInfo[]): number {
  return uploadFiles.reduce((total, file) => total + file.size, 0);
}

/**
 * ファイルのMIMEタイプを取得
 */
function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();

  const mimeTypes: Record<string, string> = {
    '.glb': 'model/gltf-binary',
    '.gltf': 'model/gltf+json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.json': 'application/json',
    '.js': 'application/javascript',
    '.html': 'text/html',
    '.css': 'text/css',
    '.txt': 'text/plain',
    '.bin': 'application/octet-stream',
  };

  return mimeTypes[ext] || 'application/octet-stream';
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
