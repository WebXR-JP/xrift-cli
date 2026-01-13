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
import { logVerbose } from './logger.js';
import type {
  CreateWorldResponse,
  CreateWorldRequest,
  SignedUrlResponse,
  UploadFileInfo,
  UploadUrlsRequest,
  UploadUrlsResponse,
  CompleteUploadRequest,
  CompleteUploadResponse,
  UpdateWorldVersionMetadataRequest,
  UpdateWorldVersionMetadataResponse,
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
    const files = await scanDirectory(distDir, config.world.ignore);

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
    let worldName: string;
    let worldDescription: string | undefined;

    if (existingMetadata) {
      logVerbose(`\n既存のワールドを更新します (ID: ${existingMetadata.id})`);
      worldId = existingMetadata.id;

      // 更新時は設定ファイルから名前と説明を取得
      worldName = config.world.title || path.basename(cwd);
      worldDescription = config.world.description;
    } else {
      // 新規ワールド作成（Phase 3-2: 空のリクエストボディ）
      spinner = ora('新規ワールドを作成中...').start();

      try {
        const createRequest: CreateWorldRequest = {};

        const response = await client.post<CreateWorldResponse>(WORLD_CREATE_PATH, createRequest);

        worldId = response.data.id;
        spinner.succeed(chalk.green(`新規ワールドを作成しました (ID: ${worldId})`));
      } catch (error) {
        spinner.fail(chalk.red('ワールドの作成に失敗しました'));
        throw error;
      }

      // 新規作成時はメタデータを収集
      const metadata = await collectWorldMetadata(
        {
          title: config.world.title,
          description: config.world.description,
        },
        path.basename(cwd)
      );
      worldName = metadata.title;
      worldDescription = metadata.description;
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
    let versionId: string;
    let versionNumber: number;
    try {
      const uploadUrlsRequest: UploadUrlsRequest = {
        name: worldName,
        description: worldDescription,
        thumbnailPath: thumbnailPath,
        physics: config.world.physics,
        contentHash,
        fileSize,
        files: uploadFiles.map((f) => ({
          path: f.remotePath,
          contentType: getMimeType(f.localPath),
        })),
      };

      const response = await client.post<UploadUrlsResponse>(
        `${WORLD_UPDATE_PATH}/${worldId}/upload-urls`,
        uploadUrlsRequest
      );

      signedUrls = response.data.uploadUrls;
      versionId = response.data.versionId;
      versionNumber = response.data.versionNumber;
      const alreadyExists = response.data.alreadyExists || false;

      if (alreadyExists) {
        // 既存バージョンの場合：メタデータのみ更新
        spinner.succeed(chalk.yellow(`同じ内容のバージョンが既に存在します (v${versionNumber})`));
        console.log(chalk.yellow('📦 ファイルアップロードをスキップしました'));

        // WorldVersionのメタデータを更新
        if (config.world.title || config.world.description || thumbnailPath !== undefined || config.world.physics) {
          spinner = ora('ワールド情報を更新中...').start();
          try {
            const updateRequest: UpdateWorldVersionMetadataRequest = {};
            if (config.world.title) {
              updateRequest.name = config.world.title;
            }
            if (config.world.description !== undefined) {
              updateRequest.description = config.world.description;
            }
            if (thumbnailPath !== undefined) {
              updateRequest.thumbnailPath = thumbnailPath;
            }
            if (config.world.physics) {
              updateRequest.physics = config.world.physics;
            }

            const updateUrl = `${WORLD_UPDATE_PATH}/${worldId}/versions/${versionId}`;
            logVerbose(`PATCH ${updateUrl}`);
            logVerbose(`リクエストボディ: ${JSON.stringify(updateRequest, null, 2)}`);

            const updateResponse = await client.patch<UpdateWorldVersionMetadataResponse>(
              updateUrl,
              updateRequest
            );

            spinner.succeed(chalk.green('✓ ワールド情報を更新しました'));
            console.log(chalk.gray(`  タイトル: ${updateResponse.data.name}`));
            if (updateResponse.data.description) {
              console.log(chalk.gray(`  説明: ${updateResponse.data.description}`));
            }
            if (updateResponse.data.thumbnailPath) {
              console.log(chalk.gray(`  サムネイル: ${updateResponse.data.thumbnailPath}`));
            }

            console.log(chalk.green('\n✅ 処理が完了しました'));
            return; // 正常終了
          } catch (updateError) {
            spinner.fail(chalk.red('ワールド情報の更新に失敗しました'));
            if (axios.isAxiosError(updateError)) {
              if (updateError.response) {
                console.error(chalk.red(`ステータスコード: ${updateError.response.status}`));
                console.error(chalk.red(`エラー詳細: ${JSON.stringify(updateError.response.data, null, 2)}`));
              } else if (updateError.request) {
                console.error(chalk.red('リクエストは送信されましたが、レスポンスがありません'));
              } else {
                console.error(chalk.red(`エラー: ${updateError.message}`));
              }
            }
            throw updateError;
          }
        } else {
          console.log(chalk.yellow('更新する情報がありません'));
          return; // 何もせず終了
        }
      }

      // 新規バージョンの場合：通常のアップロードフロー
      spinner.succeed(
        chalk.green(
          `${signedUrls.length}個のアップロードURLを取得しました (バージョン: ${versionNumber})`
        )
      );

      // デバッグ: 最初のURLを表示
      if (signedUrls.length > 0) {
        logVerbose(`デバッグ: 最初のURL構造: ${JSON.stringify(signedUrls[0], null, 2)}`);
      }
      logVerbose(`バージョンID: ${versionId}`);
    } catch (error) {
      spinner.fail(chalk.red('アップロードURLの取得に失敗しました'));
      if (axios.isAxiosError(error) && error.response) {
        const errorData = error.response.data;
        const errorMessage = typeof errorData === 'object' && errorData.error
          ? errorData.error
          : JSON.stringify(errorData);
        console.error(chalk.red(`バックエンドエラー: ${errorMessage}`));
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
      const completeRequest: CompleteUploadRequest = {
        versionId,
      };

      const completeResponse = await client.post<CompleteUploadResponse>(
        `${WORLD_COMPLETE_PATH}/${worldId}/complete`,
        completeRequest
      );

      spinner.succeed(
        chalk.green(
          `アップロード完了を通知しました (バージョン: ${completeResponse.data.versionNumber})`
        )
      );
      logVerbose(`ステータス: ${completeResponse.data.status}`);
      logVerbose(`ワールド名: ${completeResponse.data.name}`);
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
    logVerbose(`ワールドID: ${worldId}`);
    if (thumbnailPath) {
      logVerbose(`サムネイル: ${thumbnailPath}`);
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
