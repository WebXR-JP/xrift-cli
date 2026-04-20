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
 * トークンを検証
 */
export async function verifyToken(token: string): Promise<VerifyTokenResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}${AUTH_VERIFY_PATH}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.status === 401) {
      return { valid: false };
    }

    if (!response.ok) {
      throw new Error(`Failed to verify token: ${response.statusText}`);
    }

    return (await response.json()) as VerifyTokenResponse;
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(`Failed to verify token: ${error.message}`);
    }
    throw error;
  }
}

/**
 * 検証済みトークンを取得
 */
export async function getVerifiedToken(): Promise<string> {
  const token = await getToken();

  if (!token) {
    throw new Error('Login required. Please run `xrift login`.');
  }

  // トークンの有効性を確認
  const verification = await verifyToken(token);
  if (!verification.valid) {
    throw new Error('Token is invalid. Please log in again.');
  }

  return token;
}

/**
 * 認証コードをトークンと交換（Authorization Code Flow）
 */
export async function exchangeCodeForToken(
  code: string
): Promise<ExchangeTokenResponse> {
  try {
    const request: ExchangeTokenRequest = { code };
    const response = await fetch(
      `${API_BASE_URL}${AUTH_TOKEN_EXCHANGE_PATH}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      }
    );

    if (response.status === 401) {
      throw new Error('Authentication code is invalid or expired');
    }

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      throw new Error(
        `Failed to retrieve token: ${data?.message || response.statusText}`
      );
    }

    return (await response.json()) as ExchangeTokenResponse;
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(`Failed to retrieve token: ${error.message}`);
    }
    throw error;
  }
}
