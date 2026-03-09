import fs from 'node:fs/promises';
import path from 'node:path';
import { minimatch } from 'minimatch';
import { PROJECT_CONFIG_FILE, PROJECT_META_DIR, WORLD_META_FILE, ITEM_META_FILE } from './constants.js';
import type { XriftConfig, WorldMetadata, ItemMetadata } from '../types/index.js';

export type ProjectType = 'world' | 'item';

/**
 * xrift.json を読み込み、トップレベルキーからプロジェクトタイプを判定
 */
export async function detectProjectType(cwd: string = process.cwd()): Promise<ProjectType> {
  const configPath = path.join(cwd, PROJECT_CONFIG_FILE);
  const data = await fs.readFile(configPath, 'utf-8');
  const config = JSON.parse(data);
  if (config.world) return 'world';
  if (config.item) return 'item';
  throw new Error('No recognized project type found in xrift.json');
}

/**
 * プロジェクト設定ファイル (xrift.json) を読み込み
 */
export async function loadProjectConfig(cwd: string = process.cwd()): Promise<XriftConfig> {
  const configPath = path.join(cwd, PROJECT_CONFIG_FILE);

  try {
    const data = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(data) as XriftConfig;

    // バリデーション（worldまたはitemのいずれかが必要）
    if (!config.world && !config.item) {
      throw new Error('world or item must be configured in xrift.json');
    }

    if (config.world && !config.world.distDir) {
      throw new Error('world.distDir is not configured in xrift.json');
    }

    if (config.item && !config.item.distDir) {
      throw new Error('item.distDir is not configured in xrift.json');
    }

    return config;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        `Project config file not found: ${PROJECT_CONFIG_FILE}\n` +
          'Please create xrift.json in the project root.'
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
 * アイテムメタデータを読み込み
 */
export async function loadItemMetadata(
  cwd: string = process.cwd()
): Promise<ItemMetadata | null> {
  const metaPath = path.join(cwd, PROJECT_META_DIR, ITEM_META_FILE);

  try {
    const data = await fs.readFile(metaPath, 'utf-8');
    return JSON.parse(data) as ItemMetadata;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * アイテムメタデータを保存
 */
export async function saveItemMetadata(
  metadata: ItemMetadata,
  cwd: string = process.cwd()
): Promise<void> {
  await ensureMetaDir(cwd);
  const metaPath = path.join(cwd, PROJECT_META_DIR, ITEM_META_FILE);

  await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2), 'utf-8');
}

/**
 * distディレクトリの検証
 */
export async function validateDistDir(distDir: string): Promise<void> {
  try {
    const stat = await fs.stat(distDir);
    if (!stat.isDirectory()) {
      throw new Error(`${distDir} is not a directory`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Dist directory not found: ${distDir}`);
    }
    throw error;
  }
}
