import { describe, it, expect } from '@jest/globals';
import { createApiClient } from '../api.js';
import { API_BASE_URL } from '../constants.js';

describe('api', () => {
  describe('createApiClient', () => {
    it('トークンなしでAPIクライアントを作成できる', () => {
      const client = createApiClient();

      expect(client.defaults.baseURL).toBe(API_BASE_URL);
      expect(client.defaults.headers['Content-Type']).toBe('application/json');
      expect(client.defaults.timeout).toBe(30000);
    });

    it('トークン付きでAPIクライアントを作成できる', () => {
      const client = createApiClient('test-token-123');

      expect(client.defaults.baseURL).toBe(API_BASE_URL);
      expect(client.defaults.headers['Content-Type']).toBe('application/json');
      expect(client.defaults.headers['Authorization']).toBe('Bearer test-token-123');
      expect(client.defaults.timeout).toBe(30000);
    });
  });

  // Note: verifyToken と getAuthenticatedClient のテストは実際のHTTPリクエストが必要なため、
  // 統合テストまたはモックサーバーを使った別のテストで実施することを推奨
});
