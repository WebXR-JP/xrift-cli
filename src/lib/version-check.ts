import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import chalk from 'chalk';

interface VersionCache {
  lastCheck: number;
  latestVersion: string;
}

const CACHE_FILE = join(homedir(), '.xrift', 'version-cache.json');
const CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24時間

/**
 * npmレジストリから最新バージョンを取得
 */
async function fetchLatestVersion(): Promise<string | null> {
  try {
    const response = await fetch('https://registry.npmjs.org/@xrift/cli/latest');
    if (!response.ok) {
      return null;
    }
    const data = await response.json() as { version?: string };
    return data.version || null;
  } catch (error) {
    // ネットワークエラーなどは無視
    return null;
  }
}

/**
 * キャッシュからバージョン情報を読み込む
 */
function readCache(): VersionCache | null {
  try {
    if (!existsSync(CACHE_FILE)) {
      return null;
    }
    const data = readFileSync(CACHE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * キャッシュにバージョン情報を書き込む
 */
function writeCache(cache: VersionCache): void {
  try {
    const cacheDir = join(homedir(), '.xrift');
    if (!existsSync(cacheDir)) {
      mkdirSync(cacheDir, { recursive: true });
    }
    writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch {
    // キャッシュ書き込みエラーは無視
  }
}

/**
 * バージョンを比較して、latestの方が新しいかチェック
 */
function isNewerVersion(current: string, latest: string): boolean {
  const currentParts = current.split('.').map(Number);
  const latestParts = latest.split('.').map(Number);

  for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
    const currentPart = currentParts[i] || 0;
    const latestPart = latestParts[i] || 0;

    if (latestPart > currentPart) {
      return true;
    }
    if (latestPart < currentPart) {
      return false;
    }
  }

  return false;
}

/**
 * 更新通知を表示
 */
function displayUpdateNotification(currentVersion: string, latestVersion: string): void {
  console.log();
  console.log(chalk.yellow('━'.repeat(60)));
  console.log(
    chalk.yellow('  新しいバージョンの XRift CLI が利用可能です!')
  );
  console.log(
    chalk.gray(`  現在のバージョン: ${currentVersion}`)
  );
  console.log(
    chalk.green(`  最新のバージョン: ${latestVersion}`)
  );
  console.log();
  console.log(
    chalk.cyan('  更新するには以下のコマンドを実行してください:')
  );
  console.log(
    chalk.white('  npm install -g @xrift/cli@latest')
  );
  console.log(chalk.yellow('━'.repeat(60)));
  console.log();
}

/**
 * バージョンチェックを実行（非同期、エラーは無視）
 */
export async function checkForUpdates(currentVersion: string): Promise<void> {
  try {
    const cache = readCache();
    const now = Date.now();

    // キャッシュが有効な場合
    if (cache && now - cache.lastCheck < CHECK_INTERVAL) {
      if (isNewerVersion(currentVersion, cache.latestVersion)) {
        displayUpdateNotification(currentVersion, cache.latestVersion);
      }
      return;
    }

    // 新しいバージョンを取得（バックグラウンドで）
    setImmediate(async () => {
      try {
        const latestVersion = await fetchLatestVersion();
        if (!latestVersion) {
          return;
        }

        // キャッシュを更新
        writeCache({
          lastCheck: now,
          latestVersion,
        });
      } catch {
        // エラーは無視
      }
    });
  } catch {
    // すべてのエラーを無視（バージョンチェックは必須機能ではない）
  }
}
