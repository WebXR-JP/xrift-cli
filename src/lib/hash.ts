import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import type { UploadFileInfo } from '../types/index.js';

/**
 * 全ファイルを結合してSHA-256ハッシュを計算（先頭12文字）
 * configValues が渡された場合、設定値も含めてハッシュを計算する
 */
export async function calculateContentHash(
  uploadFiles: UploadFileInfo[],
  configValues?: Record<string, unknown>,
): Promise<string> {
  const hash = crypto.createHash('sha256');

  // ファイルをパスでソートして順序を確定
  const sortedFiles = [...uploadFiles].sort((a, b) =>
    a.remotePath.localeCompare(b.remotePath)
  );

  for (const fileInfo of sortedFiles) {
    const fileBuffer = await fs.readFile(fileInfo.localPath);
    hash.update(fileBuffer);
  }

  // 設定値をハッシュに含める（キーをソートして順序を安定化）
  if (configValues) {
    const configString = JSON.stringify(configValues, (_key, value) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const sorted: Record<string, unknown> = {};
        for (const k of Object.keys(value).sort()) {
          sorted[k] = value[k];
        }
        return sorted;
      }
      return value;
    });
    hash.update(configString);
  }

  const fullHash = hash.digest('hex');
  return fullHash.substring(0, 12); // 先頭12文字
}
