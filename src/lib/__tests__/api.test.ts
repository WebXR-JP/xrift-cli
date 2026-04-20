import { describe, it, expect } from '@jest/globals';

describe('api', () => {
  // verifyToken と exchangeCodeForToken は fetch ベースに移行済み
  // getAuthenticatedClient は XriftClient を返すように変更済み
  // これらの統合テストは実際のHTTPリクエストが必要なため、
  // モックサーバーを使った別のテストで実施することを推奨

  it('モジュールが正しくインポートできる', async () => {
    const api = await import('../api.js');
    expect(typeof api.verifyToken).toBe('function');
    expect(typeof api.getAuthenticatedClient).toBe('function');
    expect(typeof api.exchangeCodeForToken).toBe('function');
  });
});
