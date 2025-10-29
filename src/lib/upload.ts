import path from 'node:path';
import fs from 'node:fs/promises';
import chalk from 'chalk';
import ora, { type Ora } from 'ora';
import cliProgress from 'cli-progress';
import axios from 'axios';
import {
  loadProjectConfig,
  loadWorldMetadata,
  saveWorldMetadata,
  validateDistDir,
  scanDirectory,
} from './project-config.js';
import { getAuthenticatedClient } from './api.js';
import { WORLD_CREATE_PATH, WORLD_UPDATE_PATH } from './constants.js';
import type { CreateWorldResponse, SignedUrlResponse, UploadFileInfo } from '../types/index.js';

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
      console.log(chalk.gray(`既存のワールドを更新します (ID: ${existingMetadata.id})`));
      worldId = existingMetadata.id;
    } else {
      // 新規ワールド作成
      spinner = ora('新規ワールドを作成中...').start();

      try {
        const response = await client.post<CreateWorldResponse>(WORLD_CREATE_PATH, {
          name: path.basename(cwd),
        });

        worldId = response.data.id;
        spinner.succeed(chalk.green(`新規ワールドを作成しました (ID: ${worldId})`));
      } catch (error) {
        spinner.fail(chalk.red('ワールドの作成に失敗しました'));
        throw error;
      }
    }

    // 7. 署名付きURLを取得
    spinner = ora('アップロード用URLを取得中...').start();

    let signedUrls: SignedUrlResponse[];
    try {
      const response = await client.post<SignedUrlResponse[]>(
        `${WORLD_UPDATE_PATH}/${worldId}/upload-urls`,
        {
          files: uploadFiles.map((f) => ({
            path: f.remotePath,
            size: f.size,
          })),
        }
      );

      signedUrls = response.data;
      spinner.succeed(chalk.green(`${signedUrls.length}個のアップロードURLを取得しました`));
    } catch (error) {
      spinner.fail(chalk.red('アップロードURLの取得に失敗しました'));
      throw error;
    }

    // 8. ファイルをアップロード
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

        await axios.put(signedUrl.url, fileBuffer, {
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

    // 9. メタデータを保存
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
