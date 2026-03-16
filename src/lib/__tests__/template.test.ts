import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

jest.mock('giget', () => ({
  downloadTemplate: jest.fn(),
}));

jest.mock('ora', () => {
  const mockSpinner = {
    start: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis(),
  };
  const ora = () => mockSpinner;
  return { __esModule: true, default: ora };
});

import { customizeProject } from '../template.js';

describe('template - customizeProject', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `xrift-template-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // 削除失敗は無視
    }
  });

  describe('xrift.json の更新', () => {
    it('worldTitle と worldDescription が xrift.json に書き込まれる', async () => {
      const xriftJson = { world: { distDir: './dist' } };
      await fs.writeFile(
        path.join(testDir, 'xrift.json'),
        JSON.stringify(xriftJson, null, 2)
      );

      await customizeProject('my-world', testDir, 'My Cool World', 'A test world');

      const result = JSON.parse(
        await fs.readFile(path.join(testDir, 'xrift.json'), 'utf-8')
      );
      expect(result.world.title).toBe('My Cool World');
      expect(result.world.description).toBe('A test world');
      expect(result.world.distDir).toBe('./dist');
    });

    it('worldDescription が空の場合、description は設定されない', async () => {
      const xriftJson = { world: { distDir: './dist' } };
      await fs.writeFile(
        path.join(testDir, 'xrift.json'),
        JSON.stringify(xriftJson, null, 2)
      );

      await customizeProject('my-world', testDir, 'Title Only', '');

      const result = JSON.parse(
        await fs.readFile(path.join(testDir, 'xrift.json'), 'utf-8')
      );
      expect(result.world.title).toBe('Title Only');
      expect(result.world.description).toBeUndefined();
    });

    it('xrift.json に world キーがない場合でも正しく作成される', async () => {
      const xriftJson = {};
      await fs.writeFile(
        path.join(testDir, 'xrift.json'),
        JSON.stringify(xriftJson, null, 2)
      );

      await customizeProject('my-world', testDir, 'New World', 'desc');

      const result = JSON.parse(
        await fs.readFile(path.join(testDir, 'xrift.json'), 'utf-8')
      );
      expect(result.world.title).toBe('New World');
      expect(result.world.description).toBe('desc');
    });

    it('xrift.json が存在しない場合はエラーにならない', async () => {
      await expect(
        customizeProject('my-world', testDir, 'Title', 'desc')
      ).resolves.not.toThrow();
    });
  });

  describe('index.html の title 更新', () => {
    it('XRift Test World テンプレートの title が worldTitle に置換される', async () => {
      await fs.writeFile(
        path.join(testDir, 'index.html'),
        '<html><head><title>XRift Test World</title></head></html>'
      );

      await customizeProject('my-world', testDir, 'My World Title', '');

      const html = await fs.readFile(path.join(testDir, 'index.html'), 'utf-8');
      expect(html).toContain('<title>My World Title</title>');
      expect(html).not.toContain('XRift Test World');
    });

    it('XRift World Template の title が worldTitle に置換される', async () => {
      await fs.writeFile(
        path.join(testDir, 'index.html'),
        '<html><head><title>XRift World Template</title></head></html>'
      );

      await customizeProject('my-world', testDir, 'Custom Title', '');

      const html = await fs.readFile(path.join(testDir, 'index.html'), 'utf-8');
      expect(html).toContain('<title>Custom Title</title>');
      expect(html).not.toContain('XRift World Template');
    });

    it('日本語タイトルが正しく設定される', async () => {
      await fs.writeFile(
        path.join(testDir, 'index.html'),
        '<html><head><title>XRift Test World</title></head></html>'
      );
      const xriftJson = { world: { distDir: './dist' } };
      await fs.writeFile(
        path.join(testDir, 'xrift.json'),
        JSON.stringify(xriftJson, null, 2)
      );

      await customizeProject('my-world', testDir, 'テストワールド', '日本語の説明');

      const html = await fs.readFile(path.join(testDir, 'index.html'), 'utf-8');
      expect(html).toContain('<title>テストワールド</title>');

      const result = JSON.parse(
        await fs.readFile(path.join(testDir, 'xrift.json'), 'utf-8')
      );
      expect(result.world.title).toBe('テストワールド');
      expect(result.world.description).toBe('日本語の説明');
    });
  });

  describe('package.json の更新', () => {
    it('テンプレートのパッケージ名が projectName に置換される', async () => {
      const packageJson = {
        name: '@xrift/test-world',
        version: '1.0.0',
      };
      await fs.writeFile(
        path.join(testDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );

      await customizeProject('cool-world', testDir, 'Cool World', '');

      const result = JSON.parse(
        await fs.readFile(path.join(testDir, 'package.json'), 'utf-8')
      );
      expect(result.name).toBe('@xrift/cool-world');
      expect(result.version).toBe('0.1.0');
    });
  });
});
