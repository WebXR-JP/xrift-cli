import { describe, it, expect } from '@jest/globals';
import { isTokenValid } from '../config.js';
import type { AuthConfig } from '../../types/index.js';

// Note: config.ts の関数は実際のホームディレクトリを使用するため、
// ファイルI/Oのテストは統合テストで行うことを推奨します。
// ここではビジネスロジックのみをテストします。

describe('config', () => {

  describe('isTokenValid', () => {
    it('トークンがない場合は false を返す', () => {
      const config: AuthConfig = { token: '' };
      expect(isTokenValid(config)).toBe(false);
    });

    it('expiresAt がない場合は true を返す', () => {
      const config: AuthConfig = { token: 'valid-token' };
      expect(isTokenValid(config)).toBe(true);
    });

    it('有効期限が未来の場合は true を返す', () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      const config: AuthConfig = {
        token: 'valid-token',
        expiresAt: futureDate.toISOString(),
      };

      expect(isTokenValid(config)).toBe(true);
    });

    it('有効期限が過去の場合は false を返す', () => {
      const pastDate = new Date();
      pastDate.setFullYear(pastDate.getFullYear() - 1);

      const config: AuthConfig = {
        token: 'expired-token',
        expiresAt: pastDate.toISOString(),
      };

      expect(isTokenValid(config)).toBe(false);
    });
  });
});
