import fs from 'node:fs/promises';
import path from 'node:path';
import { minimatch } from 'minimatch';
import { PROJECT_CONFIG_FILE, PROJECT_META_DIR, WORLD_META_FILE } from './constants.js';
import type { XriftConfig, WorldMetadata } from '../types/index.js';

/**
 * プロジェクト設定ファイル (xrift.json) を読み込み
 */
export async function loadProjectConfig(cwd: string = process.cwd()): Promise<XriftConfig> {
  const configPath = path.join(cwd, PROJECT_CONFIG_FILE);

  try {
    const data = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(data) as XriftConfig;

    // バリデーション
    if (!config.world?.distDir) {
      throw new Error('xrift.json に world.distDir が設定されていません');
    }

    return config;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        `プロジェクト設定ファイルが見つかりません: ${PROJECT_CONFIG_FILE}\n` +
          'プロジェクトルートに xrift.json を作成してください。'
      );
    }
    throw error;
  }
}

/**
 * .xrift ディレクトリを作成
 */
async function ensureMetaDir(cwd: string = process.cwd()): Promise<string> {
  const metaDir = path.join(cwd, PROJECT_META_DIR);
  await fs.mkdir(metaDir, { recursive: true });
  return metaDir;
}

/**
 * ワールドメタデータを読み込み
 */
export async function loadWorldMetadata(
  cwd: string = process.cwd()
): Promise<WorldMetadata | null> {
  const metaPath = path.join(cwd, PROJECT_META_DIR, WORLD_META_FILE);

  try {
    const data = await fs.readFile(metaPath, 'utf-8');
    return JSON.parse(data) as WorldMetadata;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * ワールドメタデータを保存
 */
export async function saveWorldMetadata(
  metadata: WorldMetadata,
  cwd: string = process.cwd()
): Promise<void> {
  await ensureMetaDir(cwd);
  const metaPath = path.join(cwd, PROJECT_META_DIR, WORLD_META_FILE);

  await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2), 'utf-8');
}

/**
 * ディレクトリ内のファイルを再帰的にスキャン
 * @param dirPath スキャンするディレクトリのパス
 * @param ignorePatterns アップロード対象から除外するglobパターン（オプション）
 */
export async function scanDirectory(
  dirPath: string,
  ignorePatterns: string[] = []
): Promise<string[]> {
  const files: string[] = [];

  async function scan(currentPath: string) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      const relativePath = path.relative(dirPath, fullPath);

      // ignoreパターンに一致するかチェック
      const shouldIgnore = ignorePatterns.some((pattern) =>
        minimatch(relativePath, pattern, { dot: true })
      );

      if (shouldIgnore) {
        continue;
      }

      if (entry.isDirectory()) {
        await scan(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  await scan(dirPath);
  return files;
}

/**
 * distディレクトリの検証
 */
export async function validateDistDir(distDir: string): Promise<void> {
  try {
    const stat = await fs.stat(distDir);
    if (!stat.isDirectory()) {
      throw new Error(`${distDir} はディレクトリではありません`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`distディレクトリが見つかりません: ${distDir}`);
    }
    throw error;
  }
}
