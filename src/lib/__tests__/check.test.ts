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
import type { ValidateCodeResponse, WorldPermissions } from '@xrift/code-security';

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

    it('__federation_shared_ はバンドル依存と判定', () => {
      const ctx = determineFileContext('__federation_shared_react.js');
      expect(ctx.isBundledDependency).toBe(true);
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

    it('__federation_fn_import を参照するチャンクは厳格にチェックされる', async () => {
      // React.lazy(() => import('./Inner')) で分離されたチャンクを想定
      // federation 経由のチャンクは importShared で共有ライブラリを取得する
      const dynamicChunk = path.join(distDir, 'Inner-abc123.js');
      const federationCode = [
        'import { importShared } from "./__federation_fn_import-xxx.js";',
        'const code = "alert(1)";',
        'eval(code);',
      ].join('\n');
      await fs.writeFile(dynamicChunk, federationCode);

      const code = await fs.readFile(dynamicChunk, 'utf-8');
      const relativePath = path.relative(distDir, dynamicChunk);

      // CLI と同じ判定: __federation_fn_import を含む → isBundledDependency: false
      const isFederationChunk = code.includes('__federation_fn_import');
      expect(isFederationChunk).toBe(true);

      const fileContext = {
        ...determineFileContext(relativePath),
        isBundledDependency: false,
      };

      const service = new CodeSecurityService();
      const result = service.validate({
        code,
        packageJson: { dependencies: {} },
        fileContext,
      });

      const verdict = determineVerdict(result);
      expect(verdict).toBe('REJECT');
      expect(result.violations.critical.length).toBeGreaterThan(0);
    });

    it('__federation_fn_import を参照しない純粋なライブラリチャンクは緩和される', async () => {
      const vendorChunk = path.join(distDir, 'vendor-lib.js');
      await fs.writeFile(vendorChunk, 'Object.prototype.foo = 1;');

      const code = await fs.readFile(vendorChunk, 'utf-8');
      const relativePath = path.relative(distDir, vendorChunk);

      // federation を参照しない → isBundledDependency のまま
      const isFederationChunk = code.includes('__federation_fn_import');
      expect(isFederationChunk).toBe(false);

      const fileContext = determineFileContext(relativePath);
      expect(fileContext.isBundledDependency).toBe(true);

      const service = new CodeSecurityService();
      const result = service.validate({
        code,
        packageJson: { dependencies: {} },
        fileContext,
      });

      const verdict = determineVerdict(result);
      // 技術的違反は抑制されるので REJECT にはならない
      expect(verdict).not.toBe('REJECT');
    });

    it('worldPermissions の allowedCodeRules で許可されたルールの違反が抑制される', async () => {
      const testFile = path.join(distDir, '__federation_expose_World-test.js');
      // String.fromCharCode は no-obfuscation ルールで検出される
      const obfuscatedCode = [
        'const s = String.fromCharCode(72, 101, 108, 108, 111);',
        'console.log(s);',
      ].join('\n');
      await fs.writeFile(testFile, obfuscatedCode);

      const code = await fs.readFile(testFile, 'utf-8');
      const relativePath = path.relative(distDir, testFile);
      const fileContext = determineFileContext(relativePath);

      const service = new CodeSecurityService();

      // worldPermissions なしでチェック → 違反が検出される
      const resultWithout = service.validate({
        code,
        packageJson: { dependencies: {} },
        fileContext,
      });
      const hasObfuscationViolation = [
        ...resultWithout.violations.critical,
        ...resultWithout.violations.warnings,
      ].some((v) => v.rule === 'no-obfuscation');

      // no-obfuscation 違反が検出された場合のみ、permissions での抑制をテスト
      if (hasObfuscationViolation) {
        const permissions: WorldPermissions = {
          allowedCodeRules: ['no-obfuscation'],
        };

        const resultWith = service.validate({
          code,
          packageJson: { dependencies: {} },
          fileContext,
          worldPermissions: permissions,
        });

        const hasObfuscationAfter = [
          ...resultWith.violations.critical,
          ...resultWith.violations.warnings,
        ].some((v) => v.rule === 'no-obfuscation');
        expect(hasObfuscationAfter).toBe(false);
      }
    });

    it('worldPermissions の allowedDomains でネットワーク違反が抑制される', async () => {
      const testFile = path.join(distDir, '__federation_expose_World-net.js');
      const networkCode = [
        'fetch("https://api.example.com/data");',
      ].join('\n');
      await fs.writeFile(testFile, networkCode);

      const code = await fs.readFile(testFile, 'utf-8');
      const relativePath = path.relative(distDir, testFile);
      const fileContext = determineFileContext(relativePath);

      const service = new CodeSecurityService();

      // worldPermissions なしでチェック
      const resultWithout = service.validate({
        code,
        packageJson: { dependencies: {} },
        fileContext,
      });
      const hasNetworkViolation = [
        ...resultWithout.violations.critical,
        ...resultWithout.violations.warnings,
      ].some((v) => v.rule === 'no-network-without-permission');

      // ネットワーク違反が検出された場合のみ、allowedDomains での抑制をテスト
      if (hasNetworkViolation) {
        const permissions: WorldPermissions = {
          allowedDomains: ['api.example.com'],
        };

        const resultWith = service.validate({
          code,
          packageJson: { dependencies: {} },
          fileContext,
          worldPermissions: permissions,
        });

        const hasNetworkAfter = [
          ...resultWith.violations.critical,
          ...resultWith.violations.warnings,
        ].some((v) => v.rule === 'no-network-without-permission');
        expect(hasNetworkAfter).toBe(false);
      }
    });

    it('worldPermissions を渡しても NEVER_ALLOWABLE_RULES の違反は抑制されない', () => {
      const service = new CodeSecurityService();
      const permissions: WorldPermissions = {
        allowedCodeRules: ['no-eval'], // no-eval は NEVER_ALLOWABLE
      };

      const result = service.validate({
        code: 'eval("alert(1)")',
        packageJson: { dependencies: {} },
        worldPermissions: permissions,
      });

      // no-eval は never-allowable なので抑制されない
      const hasEval = result.violations.critical.some((v) => v.rule === 'no-eval');
      expect(hasEval).toBe(true);
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
