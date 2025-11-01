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
  loadWorldMetadata,
  saveWorldMetadata,
  validateDistDir,
  scanDirectory,
} from './project-config.js';
import { getAuthenticatedClient } from './api.js';
import { WORLD_CREATE_PATH, WORLD_UPDATE_PATH, WORLD_COMPLETE_PATH } from './constants.js';
import type {
  CreateWorldResponse,
  CreateWorldRequest,
  UpdateWorldMetadataRequest,
  SignedUrlResponse,
  UploadFileInfo,
} from '../types/index.js';

/**
 * ワールドをアップロード
 */
export async function uploadWorld(cwd: string = process.cwd()): Promise<void> {
  console.log(chalk.blue('🌍 ワールドアップロードを開始します\n'));

  let spinner: Ora | undefined;

  try {
    // 1. プロジェクト設定を読み込み
    spinner = ora('プロジェクト設定を読み込み中...').start();
    const config = await loadProjectConfig(cwd);
    const distDir = path.resolve(cwd, config.world.distDir);
    spinner.succeed(chalk.green(`設定を読み込みました: distDir=${config.world.distDir}`));

    // 1.5. ビルドコマンドを実行
    if (config.world.buildCommand) {
      console.log(chalk.blue(`\n🔨 ビルドコマンドを実行: ${config.world.buildCommand}\n`));
      try {
        const { execSync } = await import('node:child_process');
        execSync(config.world.buildCommand, {
          cwd,
          stdio: 'inherit',
        });
        console.log(chalk.green('\n✓ ビルドが完了しました\n'));
      } catch (error) {
        console.error(chalk.red('\n✗ ビルドに失敗しました\n'));
        throw error;
      }
    }

    // 2. distディレクトリを検証
    spinner = ora('distディレクトリを検証中...').start();
    await validateDistDir(distDir);
    spinner.succeed(chalk.green('distディレクトリを検証しました'));

    // 3. ファイルをスキャン
    spinner = ora('ファイルをスキャン中...').start();
    const files = await scanDirectory(distDir);

    if (files.length === 0) {
      spinner.fail(chalk.red('アップロードするファイルが見つかりません'));
      return;
    }

    spinner.succeed(chalk.green(`${files.length}個のファイルを検出しました`));

    // 3.5. サムネイル設定を確認
    let thumbnailPath: string | undefined;
    if (config.world.thumbnailPath) {
      const configuredPath = path.join(distDir, config.world.thumbnailPath);
      try {
        const stat = await fs.stat(configuredPath);
        if (stat.isFile()) {
          thumbnailPath = config.world.thumbnailPath;
          console.log(chalk.green(`✓ サムネイル設定: ${config.world.thumbnailPath}`));
        } else {
          throw new Error(`${config.world.thumbnailPath} はファイルではありません`);
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new Error(
            `設定されたサムネイルが見つかりません: ${config.world.thumbnailPath}`
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
    spinner = ora('認証情報を確認中...').start();
    const client = await getAuthenticatedClient();
    spinner.succeed(chalk.green('認証情報を確認しました'));

    // 6. ワールドメタデータを確認（新規/更新判定）
    const existingMetadata = await loadWorldMetadata(cwd);
    let worldId: string;

    if (existingMetadata) {
      console.log(chalk.gray(`\n既存のワールドを更新します (ID: ${existingMetadata.id})`));
      worldId = existingMetadata.id;

      // 既存ワールドのメタデータを更新
      if (config.world.title || config.world.description || thumbnailPath) {
        spinner = ora('ワールド情報を更新中...').start();
        try {
          const updateRequest: UpdateWorldMetadataRequest = {
            name: config.world.title,
            description: config.world.description,
            thumbnailPath: thumbnailPath,
          };

          await client.patch(`${WORLD_UPDATE_PATH}/${worldId}`, updateRequest);
          spinner.succeed(chalk.green('ワールド情報を更新しました'));
        } catch (error) {
          spinner.fail(chalk.yellow('ワールド情報の更新に失敗しました（アップロードは続行します）'));
          console.error(chalk.gray('エラー詳細:'), error);
        }
      }
    } else {
      // メタデータを収集
      const metadata = await collectWorldMetadata(
        {
          title: config.world.title,
          description: config.world.description,
        },
        path.basename(cwd)
      );

      // 新規ワールド作成
      spinner = ora('新規ワールドを作成中...').start();

      try {
        const createRequest: CreateWorldRequest = {
          name: metadata.title, // titleをnameとしてバックエンドに送信
          description: metadata.description,
          thumbnailPath: thumbnailPath, // xrift.jsonで設定された相対パス
        };

        const response = await client.post<CreateWorldResponse>(WORLD_CREATE_PATH, createRequest);

        worldId = response.data.id;
        spinner.succeed(
          chalk.green(`新規ワールドを作成しました (ID: ${worldId}, タイトル: ${metadata.title})`)
        );
      } catch (error) {
        spinner.fail(chalk.red('ワールドの作成に失敗しました'));
        throw error;
      }
    }

    // 7. contentHashとfileSizeを計算
    spinner = ora('ファイルのハッシュを計算中...').start();
    const contentHash = await calculateContentHash(uploadFiles);
    const fileSize = calculateTotalSize(uploadFiles);
    spinner.succeed(
      chalk.green(`ハッシュ計算完了 (contentHash: ${contentHash}, fileSize: ${fileSize} bytes)`)
    );

    // 8. 署名付きURLを取得
    spinner = ora('アップロード用URLを取得中...').start();

    let signedUrls: SignedUrlResponse[];
    try {
      const response = await client.post<{ urls: SignedUrlResponse[] }>(
        `${WORLD_UPDATE_PATH}/${worldId}/upload-urls`,
        {
          contentHash,
          fileSize,
          files: uploadFiles.map((f) => ({
            path: f.remotePath,
            contentType: getMimeType(f.localPath),
          })),
        }
      );

      signedUrls = response.data.urls;
      spinner.succeed(chalk.green(`${signedUrls.length}個のアップロードURLを取得しました`));

      // デバッグ: 最初のURLを表示
      if (signedUrls.length > 0) {
        console.log(chalk.gray(`デバッグ: 最初のURL構造: ${JSON.stringify(signedUrls[0], null, 2)}`));
      }
    } catch (error) {
      spinner.fail(chalk.red('アップロードURLの取得に失敗しました'));
      if (axios.isAxiosError(error) && error.response) {
        console.error(chalk.red(`バックエンドエラー: ${JSON.stringify(error.response.data)}`));
      }
      throw error;
    }

    // 9. ファイルをアップロード
    console.log(chalk.blue('\n📤 ファイルをアップロード中...\n'));

    const progressBar = new cliProgress.SingleBar(
      {
        format: `${chalk.cyan('{bar}')} | {percentage}% | {value}/{total} ファイル | {filename}`,
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
        console.error(chalk.red(`\n❌ ${fileInfo.remotePath} のアップロードに失敗しました`));
        throw error;
      }
    }

    progressBar.update(uploadFiles.length, { filename: '完了' });
    progressBar.stop();

    // 10. アップロード完了通知
    spinner = ora('アップロード完了を通知中...').start();
    try {
      await client.post(`${WORLD_COMPLETE_PATH}/${worldId}/complete`);
      spinner.succeed(chalk.green('アップロード完了を通知しました'));
    } catch (error) {
      spinner.fail(chalk.red('アップロード完了通知に失敗しました'));
      if (axios.isAxiosError(error) && error.response) {
        console.error(chalk.red(`バックエンドエラー: ${JSON.stringify(error.response.data)}`));
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

    console.log(chalk.green(`\n✅ ワールドアップロード完了: ${uploadFiles.length}ファイル`));
    console.log(chalk.gray(`ワールドID: ${worldId}`));
    if (thumbnailPath) {
      console.log(chalk.gray(`サムネイル: ${thumbnailPath}`));
    }
  } catch (error) {
    if (spinner) {
      spinner.fail(chalk.red('エラーが発生しました'));
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

  // ファイルをパスでソートして順序を確定
  const sortedFiles = [...uploadFiles].sort((a, b) =>
    a.remotePath.localeCompare(b.remotePath)
  );

  for (const fileInfo of sortedFiles) {
    const fileBuffer = await fs.readFile(fileInfo.localPath);
    hash.update(fileBuffer);
  }

  const fullHash = hash.digest('hex');
  return fullHash.substring(0, 12); // 先頭12文字
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
 * インタラクティブにワールドのメタデータを収集
 */
async function collectWorldMetadata(
  config: { title?: string; description?: string },
  defaultName: string
): Promise<{ title: string; description?: string }> {
  console.log(chalk.blue('\n📝 ワールドの情報を入力してください\n'));

  const response = await prompts(
    [
      {
        type: 'text',
        name: 'title',
        message: 'ワールドのタイトル',
        initial: config.title || defaultName,
        validate: (value: string) => (value.trim() ? true : 'タイトルは必須です'),
      },
      {
        type: 'text',
        name: 'description',
        message: 'ワールドの説明 (任意)',
        initial: config.description || '',
      },
    ],
    {
      onCancel: () => {
        throw new Error('アップロードがキャンセルされました');
      },
    }
  );

  return {
    title: response.title.trim(),
    description: response.description?.trim() || undefined,
  };
}
