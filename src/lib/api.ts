import axios, { type AxiosInstance } from 'axios';
import {
  API_BASE_URL,
  AUTH_VERIFY_PATH,
  AUTH_TOKEN_EXCHANGE_PATH,
} from './constants.js';
import { getToken } from './config.js';
import type {
  VerifyTokenResponse,
  ExchangeTokenRequest,
  ExchangeTokenResponse,
} from '../types/index.js';

/**
 * API クライアントのインスタンスを作成
 */
export function createApiClient(token?: string): AxiosInstance {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return axios.create({
    baseURL: API_BASE_URL,
    headers,
    timeout: 30000,
  });
}

/**
 * トークンを検証
 */
export async function verifyToken(token: string): Promise<VerifyTokenResponse> {
  const client = createApiClient(token);

  try {
    const response = await client.get<VerifyTokenResponse>(AUTH_VERIFY_PATH);
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        return { valid: false };
      }
      throw new Error(`トークンの検証に失敗しました: ${error.message}`);
    }
    throw error;
  }
}

/**
 * 認証済みAPIクライアントを取得
 */
export async function getAuthenticatedClient(): Promise<AxiosInstance> {
  const token = await getToken();

  if (!token) {
    throw new Error('ログインが必要です。`xrift login` を実行してください。');
  }

  // トークンの有効性を確認
  const verification = await verifyToken(token);
  if (!verification.valid) {
    throw new Error('トークンが無効です。再度ログインしてください。');
  }

  return createApiClient(token);
}

/**
 * 認証コードをトークンと交換（Authorization Code Flow）
 */
export async function exchangeCodeForToken(
  code: string
): Promise<ExchangeTokenResponse> {
  const client = createApiClient();

  try {
    const request: ExchangeTokenRequest = { code };
    const response = await client.post<ExchangeTokenResponse>(
      AUTH_TOKEN_EXCHANGE_PATH,
      request
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        throw new Error('認証コードが無効または期限切れです');
      }
      throw new Error(
        `トークンの取得に失敗しました: ${error.response?.data?.message || error.message}`
      );
    }
    throw error;
  }
}
