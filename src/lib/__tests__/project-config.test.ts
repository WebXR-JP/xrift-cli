import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  loadProjectConfig,
  loadWorldMetadata,
  saveWorldMetadata,
  scanDirectory,
  validateDistDir,
} from '../project-config.js';
import type { XriftConfig, WorldMetadata } from '../../types/index.js';

describe('project-config', () => {
  let testDir: string;

  beforeEach(async () => {
    // テスト用の一時ディレクトリを作成
    testDir = path.join(os.tmpdir(), `xrift-project-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // テスト用ディレクトリを削除
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // 削除失敗は無視
    }
  });

  describe('loadProjectConfig', () => {
    it('正しい設定ファイルを読み込める', async () => {
      const config: XriftConfig = {
        world: {
          distDir: './dist',
        },
      };

      await fs.writeFile(
        path.join(testDir, 'xrift.json'),
        JSON.stringify(config, null, 2)
      );

      const loaded = await loadProjectConfig(testDir);
      expect(loaded).toEqual(config);
    });

    it('設定ファイルが存在しない場合はエラー', async () => {
      await expect(loadProjectConfig(testDir)).rejects.toThrow(
        'プロジェクト設定ファイルが見つかりません'
      );
    });

    it('distDir が設定されていない場合はエラー', async () => {
      const invalidConfig = { world: {} };
      await fs.writeFile(
        path.join(testDir, 'xrift.json'),
        JSON.stringify(invalidConfig, null, 2)
      );

      await expect(loadProjectConfig(testDir)).rejects.toThrow(
        'world.distDir が設定されていません'
      );
    });
  });

  describe('loadWorldMetadata と saveWorldMetadata', () => {
    it('ワールドメタデータを保存して読み込める', async () => {
      const metadata: WorldMetadata = {
        id: 'world_123',
        createdAt: '2025-01-15T10:00:00Z',
        lastUploadedAt: '2025-01-15T12:00:00Z',
      };

      await saveWorldMetadata(metadata, testDir);
      const loaded = await loadWorldMetadata(testDir);

      expect(loaded).toEqual(metadata);
    });

    it('メタデータが存在しない場合は null を返す', async () => {
      const loaded = await loadWorldMetadata(testDir);
      expect(loaded).toBeNull();
    });

    it('.xrift ディレクトリが自動作成される', async () => {
      const metadata: WorldMetadata = {
        id: 'world_456',
        createdAt: '2025-01-16T10:00:00Z',
        lastUploadedAt: '2025-01-16T10:00:00Z',
      };

      await saveWorldMetadata(metadata, testDir);

      const metaDir = path.join(testDir, '.xrift');
      const stat = await fs.stat(metaDir);
      expect(stat.isDirectory()).toBe(true);
    });
  });

  describe('scanDirectory', () => {
    it('ディレクトリ内のファイルを再帰的にスキャンできる', async () => {
      // テスト用のファイル構造を作成
      const distDir = path.join(testDir, 'dist');
      await fs.mkdir(distDir, { recursive: true });
      await fs.mkdir(path.join(distDir, 'textures'), { recursive: true });

      await fs.writeFile(path.join(distDir, 'world.glb'), 'test');
      await fs.writeFile(path.join(distDir, 'config.json'), '{}');
      await fs.writeFile(path.join(distDir, 'textures', 'texture1.png'), 'test');

      const files = await scanDirectory(distDir);

      expect(files).toHaveLength(3);
      expect(files).toContain(path.join(distDir, 'world.glb'));
      expect(files).toContain(path.join(distDir, 'config.json'));
      expect(files).toContain(path.join(distDir, 'textures', 'texture1.png'));
    });

    it('空のディレクトリの場合は空配列を返す', async () => {
      const emptyDir = path.join(testDir, 'empty');
      await fs.mkdir(emptyDir, { recursive: true });

      const files = await scanDirectory(emptyDir);
      expect(files).toEqual([]);
    });
  });

  describe('validateDistDir', () => {
    it('存在するディレクトリの場合は成功', async () => {
      const distDir = path.join(testDir, 'dist');
      await fs.mkdir(distDir, { recursive: true });

      await expect(validateDistDir(distDir)).resolves.not.toThrow();
    });

    it('存在しないディレクトリの場合はエラー', async () => {
      const nonExistentDir = path.join(testDir, 'does-not-exist');

      await expect(validateDistDir(nonExistentDir)).rejects.toThrow(
        'distディレクトリが見つかりません'
      );
    });

    it('ファイルの場合はエラー', async () => {
      const filePath = path.join(testDir, 'not-a-directory');
      await fs.writeFile(filePath, 'test');

      await expect(validateDistDir(filePath)).rejects.toThrow(
        'はディレクトリではありません'
      );
    });
  });
});
