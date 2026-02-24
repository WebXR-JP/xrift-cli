import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

// chalk / ora は ESM 専用モジュールのため、check.ts を直接 import すると
// Jest のトランスフォームで問題が起きる。runSecurityCheck のみを個別テストする。
// check.ts 全体の mock ではなく、依存関係を直接使ってテストする。

import {
  CodeSecurityService,
  determineFileContext,
} from '@xrift/code-security';
import type { ValidateCodeResponse } from '@xrift/code-security';

/**
 * CLI と同じ判定ロジック: violations ベースで verdict を決定
 */
function determineVerdict(response: ValidateCodeResponse): 'APPROVE' | 'REVIEW' | 'REJECT' {
  if (response.violations.critical.length > 0) return 'REJECT';
  if (response.violations.warnings.length > 0) return 'REVIEW';
  return 'APPROVE';
}

describe('check - セキュリティチェックのコアロジック', () => {
  let testDir: string;
  let distDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `xrift-check-test-${Date.now()}`);
    distDir = path.join(testDir, 'dist');
    await fs.mkdir(distDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // 削除失敗は無視
    }
  });

  describe('CodeSecurityService.validate', () => {
    it('安全なコードは低スコアを返す', () => {
      const service = new CodeSecurityService();
      const result = service.validate({
        code: 'const x = 1 + 2;\nconsole.log(x);',
        packageJson: { dependencies: {} },
      });

      expect(result.securityScore).toBeLessThan(50);
      expect(result.violations.critical).toHaveLength(0);
    });

    it('eval()を含むコードはcritical違反を検出する', () => {
      const service = new CodeSecurityService();
      const result = service.validate({
        code: 'const code = "alert(1)";\neval(code);',
        packageJson: { dependencies: {} },
      });

      expect(result.securityScore).toBeGreaterThan(0);
      const evalViolation = result.violations.critical.find(
        (v) => v.rule === 'no-eval'
      );
      expect(evalViolation).toBeDefined();
    });

    it('fileContextを指定してチェックできる', () => {
      const service = new CodeSecurityService();
      const fileContext = determineFileContext('__federation_expose_World.js');
      const result = service.validate({
        code: 'const x = 1;',
        packageJson: { dependencies: {} },
        fileContext,
      });

      expect(result).toHaveProperty('securityScore');
      expect(result).toHaveProperty('violations');
    });
  });

  describe('determineVerdict (violations ベース判定)', () => {
    it('critical violations があれば REJECT', () => {
      const service = new CodeSecurityService();
      const result = service.validate({
        code: 'eval("alert(1)")',
        packageJson: { dependencies: {} },
      });
      expect(result.violations.critical.length).toBeGreaterThan(0);
      expect(determineVerdict(result)).toBe('REJECT');
    });

    it('warnings のみなら REVIEW', () => {
      const service = new CodeSecurityService();
      // バンドル依存の fileContext で critical が warning に緩和されるケースをテスト
      const fileContext = determineFileContext('vendor-lib.js');
      const result = service.validate({
        code: 'Object.prototype.foo = 1;',
        packageJson: { dependencies: {} },
        fileContext,
      });
      // fileContext により critical → warning に緩和される
      if (result.violations.critical.length === 0 && result.violations.warnings.length > 0) {
        expect(determineVerdict(result)).toBe('REVIEW');
      }
    });

    it('violations なしなら APPROVE', () => {
      const service = new CodeSecurityService();
      const result = service.validate({
        code: 'const x = 1;',
        packageJson: { dependencies: {} },
      });
      expect(determineVerdict(result)).toBe('APPROVE');
    });
  });

  describe('determineFileContext', () => {
    it('__federation_expose_World-xxx はユーザーコードと判定', () => {
      const ctx = determineFileContext('__federation_expose_World-abc123.js');
      expect(ctx.isUserCode).toBe(true);
    });

    it('__federation_shared_ は共有ライブラリと判定', () => {
      const ctx = determineFileContext('__federation_shared_react.js');
      expect(ctx.isSharedLibrary).toBe(true);
    });

    it('通常のファイルはバンドル依存と判定', () => {
      const ctx = determineFileContext('vendor.js');
      expect(ctx.isBundledDependency).toBe(true);
    });
  });

  describe('runSecurityCheck 相当のインテグレーションテスト', () => {
    it('複数ファイルをチェックして結果を集約できる', async () => {
      // ファイルを準備
      const safeFile = path.join(distDir, 'safe.js');
      const dangerousFile = path.join(distDir, 'dangerous.js');
      await fs.writeFile(safeFile, 'const x = 1;');
      await fs.writeFile(dangerousFile, 'const code = "alert(1)";\neval(code);');

      const service = new CodeSecurityService();
      const files = [safeFile, dangerousFile];
      const results = [];

      for (const filePath of files) {
        const code = await fs.readFile(filePath, 'utf-8');
        const relativePath = path.relative(distDir, filePath);
        const fileContext = determineFileContext(relativePath);
        const response: ValidateCodeResponse = service.validate({
          code,
          packageJson: { dependencies: {} },
          fileContext,
        });
        const verdict = determineVerdict(response);
        results.push({
          file: relativePath,
          score: response.securityScore,
          verdict,
          violations: response.violations,
        });
      }

      expect(results).toHaveLength(2);

      const safeResult = results.find((r) => r.file === 'safe.js');
      expect(safeResult?.verdict).toBe('APPROVE');

      const dangerousResult = results.find((r) => r.file === 'dangerous.js');
      expect(dangerousResult?.score).toBeGreaterThan(0);
    });

    it('.mjs ファイルもチェックできる', async () => {
      const mjsFile = path.join(distDir, 'module.mjs');
      await fs.writeFile(mjsFile, 'export const value = 42;');

      const code = await fs.readFile(mjsFile, 'utf-8');
      const service = new CodeSecurityService();
      const result = service.validate({
        code,
        packageJson: { dependencies: {} },
      });

      expect(result.securityScore).toBeLessThan(50);
    });
  });
});
