import fs from 'node:fs/promises';
import { CONFIG_DIR, AUTH_CONFIG_FILE } from './constants.js';
import type { AuthConfig } from '../types/index.js';

/**
 * 設定ディレクトリを確保
 */
export async function ensureConfigDir(): Promise<void> {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
  } catch (error) {
    throw new Error(`設定ディレクトリの作成に失敗しました: ${CONFIG_DIR}`);
  }
}

/**
 * 認証設定を保存
 */
export async function saveAuthConfig(config: AuthConfig): Promise<void> {
  await ensureConfigDir();
  try {
    await fs.writeFile(AUTH_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  } catch (error) {
    throw new Error(`認証設定の保存に失敗しました: ${AUTH_CONFIG_FILE}`);
  }
}

/**
 * 認証設定を読み込み
 */
export async function loadAuthConfig(): Promise<AuthConfig | null> {
  try {
    const data = await fs.readFile(AUTH_CONFIG_FILE, 'utf-8');
    return JSON.parse(data) as AuthConfig;
  } catch (error) {
    // ファイルが存在しない場合はnullを返す
    return null;
  }
}

/**
 * 認証設定を削除
 */
export async function deleteAuthConfig(): Promise<void> {
  try {
    await fs.unlink(AUTH_CONFIG_FILE);
  } catch (error) {
    // ファイルが存在しない場合は無視
  }
}

/**
 * トークンを取得
 */
export async function getToken(): Promise<string | null> {
  const config = await loadAuthConfig();
  return config?.token || null;
}

/**
 * トークンの有効性を確認
 */
export function isTokenValid(config: AuthConfig): boolean {
  if (!config.token) return false;
  if (!config.expiresAt) return true; // expiresAtがない場合は有効とみなす

  const expiresAt = new Date(config.expiresAt);
  return expiresAt > new Date();
}
