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
import { ITEM_CREATE_PATH, ITEM_UPDATE_PATH, ITEM_COMPLETE_PATH, ITEM_LIST_PATH } from './constants.js';
import { logVerbose } from './logger.js';
import type {
  CreateItemResponse,
  CreateItemRequest,
  SignedUrlResponse,
  UploadFileInfo,
  ItemUploadUrlsRequest,
  ItemUploadUrlsResponse,
  ItemCompleteUploadRequest,
  ItemCompleteUploadResponse,
  UpdateItemVersionMetadataRequest,
  UpdateItemVersionMetadataResponse,
  ItemThumbnailUploadUrlResponse,
  ItemListResponse,
  ItemDetailResponse,
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

    // 3.5. サムネイル設定を確認
    let thumbnailPath: string | undefined;
    if (itemConfig.thumbnailPath) {
      const configuredPath = path.join(distDir, itemConfig.thumbnailPath);
      try {
        const stat = await fs.stat(configuredPath);
        if (stat.isFile()) {
          thumbnailPath = itemConfig.thumbnailPath;
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
    let itemName: string;
    let itemDescription: string | undefined;

    if (existingMetadata) {
      logVerbose(`\nUpdating existing item (ID: ${existingMetadata.id})`);
      itemId = existingMetadata.id;

      itemName = itemConfig.title || path.basename(cwd);
      itemDescription = itemConfig.description;
    } else {
      // 新規アイテム作成
      spinner = ora('Creating new item...').start();

      try {
        const createRequest: CreateItemRequest = {};

        const response = await client.post<CreateItemResponse>(ITEM_CREATE_PATH, createRequest);

        itemId = response.data.id;
        spinner.succeed(chalk.green(`New item created (ID: ${itemId})`));
      } catch (error) {
        spinner.fail(chalk.red('Failed to create item'));
        throw error;
      }

      // 新規作成時はメタデータを収集
      const metadata = await collectItemMetadata(
        {
          title: itemConfig.title,
          description: itemConfig.description,
        },
        path.basename(cwd)
      );
      itemName = metadata.title;
      itemDescription = metadata.description;
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

    let signedUrls: SignedUrlResponse[];
    let versionId: string;
    let versionNumber: number;
    try {
      const uploadUrlsRequest: ItemUploadUrlsRequest = {
        name: itemName,
        description: itemDescription,
        thumbnailPath: thumbnailPath,
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

      signedUrls = response.data.uploadUrls;
      versionId = response.data.versionId;
      versionNumber = response.data.versionNumber;
      const alreadyExists = response.data.alreadyExists || false;

      if (alreadyExists) {
        spinner.succeed(chalk.yellow(`A version with the same content already exists (v${versionNumber})`));
        console.log(chalk.yellow('📦 File upload skipped'));

        // ItemVersionのメタデータを更新
        if (itemConfig.title || itemConfig.description || thumbnailPath !== undefined) {
          spinner = ora('Updating item info...').start();
          try {
            const updateRequest: UpdateItemVersionMetadataRequest = {};
            if (itemConfig.title) {
              updateRequest.name = itemConfig.title;
            }
            if (itemConfig.description !== undefined) {
              updateRequest.description = itemConfig.description;
            }
            if (thumbnailPath !== undefined) {
              updateRequest.thumbnailPath = thumbnailPath;
            }

            const updateUrl = `${ITEM_UPDATE_PATH}/${itemId}/versions/${versionId}`;
            logVerbose(`PATCH ${updateUrl}`);
            logVerbose(`Request body: ${JSON.stringify(updateRequest, null, 2)}`);

            const updateResponse = await client.patch<UpdateItemVersionMetadataResponse>(
              updateUrl,
              updateRequest
            );

            spinner.succeed(chalk.green('✓ Item info updated'));
            console.log(chalk.gray(`  Title: ${updateResponse.data.name}`));
            if (updateResponse.data.description) {
              console.log(chalk.gray(`  Description: ${updateResponse.data.description}`));
            }
            if (updateResponse.data.thumbnailPath) {
              console.log(chalk.gray(`  Thumbnail: ${updateResponse.data.thumbnailPath}`));
            }

            console.log(chalk.green('\n✅ Done'));
            return;
          } catch (updateError) {
            spinner.fail(chalk.red('Failed to update item info'));
            if (axios.isAxiosError(updateError)) {
              if (updateError.response) {
                console.error(chalk.red(`Status code: ${updateError.response.status}`));
                console.error(chalk.red(`Error details: ${JSON.stringify(updateError.response.data, null, 2)}`));
              } else if (updateError.request) {
                console.error(chalk.red('Request was sent but no response was received'));
              } else {
                console.error(chalk.red(`Error: ${updateError.message}`));
              }
            }
            throw updateError;
          }
        } else {
          console.log(chalk.yellow('No information to update'));
          return;
        }
      }

      spinner.succeed(
        chalk.green(
          `Retrieved ${signedUrls.length} upload URLs (version: ${versionNumber})`
        )
      );

      if (signedUrls.length > 0) {
        logVerbose(`Debug: First URL structure: ${JSON.stringify(signedUrls[0], null, 2)}`);
      }
      logVerbose(`Version ID: ${versionId}`);
    } catch (error) {
      spinner.fail(chalk.red('Failed to retrieve upload URLs'));
      if (axios.isAxiosError(error) && error.response) {
        const errorData = error.response.data;
        const errorMessage = typeof errorData === 'object' && errorData.error
          ? errorData.error
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
    try {
      const completeRequest: ItemCompleteUploadRequest = {
        versionId,
      };

      const completeResponse = await client.post<ItemCompleteUploadResponse>(
        `${ITEM_COMPLETE_PATH}/${itemId}/complete`,
        completeRequest
      );

      spinner.succeed(
        chalk.green(
          `Upload completed (version: ${completeResponse.data.versionNumber})`
        )
      );
      logVerbose(`Status: ${completeResponse.data.status}`);
      logVerbose(`Item name: ${completeResponse.data.name}`);
    } catch (error) {
      spinner.fail(chalk.red('Failed to notify upload completion'));
      if (axios.isAxiosError(error) && error.response) {
        console.error(chalk.red(`Backend error: ${JSON.stringify(error.response.data)}`));
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
 * アイテム一覧を取得
 */
export async function listItems(): Promise<void> {
  let spinner: Ora | undefined;

  try {
    spinner = ora('Fetching items...').start();
    const client = await getAuthenticatedClient();

    const response = await client.get<ItemListResponse>(ITEM_LIST_PATH);
    const items = response.data.items;
    spinner.stop();

    if (items.length === 0) {
      console.log(chalk.yellow('No items found'));
      return;
    }

    console.log(chalk.blue(`📦 Items (${items.length})\n`));

    for (const item of items) {
      console.log(chalk.white.bold(`  ${item.name}`));
      console.log(chalk.gray(`    ID: ${item.id}`));
      if (item.description) {
        console.log(chalk.gray(`    Description: ${item.description}`));
      }
      console.log(chalk.gray(`    Status: ${item.status}`));
      console.log(chalk.gray(`    Created: ${item.createdAt}`));
      console.log('');
    }
  } catch (error) {
    if (spinner) {
      spinner.fail(chalk.red('Failed to fetch items'));
    }

    if (error instanceof Error) {
      console.error(chalk.red(`\n❌ ${error.message}`));
    }

    throw error;
  }
}

/**
 * アイテム詳細を取得
 */
export async function getItemInfo(itemId: string): Promise<void> {
  let spinner: Ora | undefined;

  try {
    spinner = ora('Fetching item info...').start();
    const client = await getAuthenticatedClient();

    const response = await client.get<ItemDetailResponse>(`${ITEM_LIST_PATH}/${itemId}`);
    const item = response.data;
    spinner.stop();

    console.log(chalk.blue(`📦 Item Details\n`));
    console.log(chalk.white.bold(`  ${item.name}`));
    console.log(chalk.gray(`  ID: ${item.id}`));
    if (item.description) {
      console.log(chalk.gray(`  Description: ${item.description}`));
    }
    console.log(chalk.gray(`  Status: ${item.status}`));
    if (item.thumbnailUrl) {
      console.log(chalk.gray(`  Thumbnail: ${item.thumbnailUrl}`));
    }
    if (item.fileUrl) {
      console.log(chalk.gray(`  File: ${item.fileUrl}`));
    }
    console.log(chalk.gray(`  Created: ${item.createdAt}`));
    console.log(chalk.gray(`  Updated: ${item.updatedAt}`));
  } catch (error) {
    if (spinner) {
      spinner.fail(chalk.red('Failed to fetch item info'));
    }

    if (error instanceof Error) {
      console.error(chalk.red(`\n❌ ${error.message}`));
    }

    throw error;
  }
}

/**
 * アイテムサムネイルをアップロード
 */
export async function uploadItemThumbnail(itemId: string, imagePath: string): Promise<void> {
  console.log(chalk.blue('🖼️  Setting item thumbnail\n'));

  let spinner: Ora | undefined;

  try {
    spinner = ora('Checking image file...').start();
    const absolutePath = path.resolve(imagePath);
    const stat = await fs.stat(absolutePath);

    if (!stat.isFile()) {
      spinner.fail(chalk.red('Specified path is not a file'));
      throw new Error(`Not a file: ${absolutePath}`);
    }

    const ext = path.extname(absolutePath).toLowerCase();
    const allowedExts = ['.png', '.jpg', '.jpeg', '.webp'];
    if (!allowedExts.includes(ext)) {
      spinner.fail(chalk.red(`Unsupported image format: ${ext}`));
      throw new Error(`Supported formats: ${allowedExts.join(', ')}`);
    }

    const fileSize = stat.size;
    const fileName = path.basename(absolutePath);
    spinner.succeed(chalk.green(`Image: ${fileName} (${fileSize} bytes)`));

    spinner = ora('Verifying credentials...').start();
    const client = await getAuthenticatedClient();
    spinner.succeed(chalk.green('Credentials verified'));

    spinner = ora('Fetching thumbnail upload URL...').start();

    const response = await client.post<ItemThumbnailUploadUrlResponse>(
      `${ITEM_LIST_PATH}/${itemId}/thumbnail-upload-url`
    );

    const uploadUrl = response.data.uploadUrl;
    spinner.succeed(chalk.green('Thumbnail upload URL retrieved'));
    logVerbose(`Thumbnail URL expires at: ${response.data.expiresAt}`);

    spinner = ora('Uploading thumbnail...').start();

    const fileBuffer = await fs.readFile(absolutePath);

    await axios.put(uploadUrl, fileBuffer, {
      headers: {
        'Content-Type': getMimeType(absolutePath),
        'Content-Length': fileSize,
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    spinner.succeed(chalk.green('Thumbnail uploaded'));

    spinner = ora('Confirming thumbnail...').start();
    await client.post(`${ITEM_LIST_PATH}/${itemId}/confirm-thumbnail`);
    spinner.succeed(chalk.green('Thumbnail set'));

    console.log(chalk.green(`\n✅ Thumbnail updated for item (ID: ${itemId})`));
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
 * アイテムを削除
 */
export async function deleteItem(itemId: string): Promise<void> {
  let spinner: Ora | undefined;

  try {
    spinner = ora('Deleting item...').start();
    const client = await getAuthenticatedClient();

    await client.delete(`${ITEM_LIST_PATH}/${itemId}`);
    spinner.succeed(chalk.green(`Item deleted (ID: ${itemId})`));
  } catch (error) {
    if (spinner) {
      spinner.fail(chalk.red('Failed to delete item'));
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
