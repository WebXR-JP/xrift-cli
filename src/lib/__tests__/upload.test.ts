import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { calculateContentHash } from '@xrift/sdk';

describe('upload - メタデータ更新ロジックテスト', () => {
  describe('既存ワールドのメタデータ更新', () => {
    it('title, description, thumbnailPathがすべて設定されている場合、更新リクエストに含まれる', () => {
      const config = {
        world: {
          distDir: 'dist',
          title: 'Test World',
          description: 'Test Description',
          thumbnailPath: 'thumbnail.png',
        },
      };

      const thumbnailPath = config.world.thumbnailPath;

      // メタデータ更新条件をチェック
      const shouldUpdate = !!(
        config.world.title ||
        config.world.description ||
        thumbnailPath !== undefined
      );

      expect(shouldUpdate).toBe(true);

      // 更新リクエストを作成
      const updateRequest: { name?: string; description?: string; thumbnailPath?: string } = {};
      if (config.world.title) {
        updateRequest.name = config.world.title;
      }
      if (config.world.description !== undefined) {
        updateRequest.description = config.world.description;
      }
      if (thumbnailPath !== undefined) {
        updateRequest.thumbnailPath = thumbnailPath;
      }

      expect(updateRequest).toEqual({
        name: 'Test World',
        description: 'Test Description',
        thumbnailPath: 'thumbnail.png',
      });
    });

    it('titleのみが設定されている場合、nameのみを含む更新リクエストが作成される', () => {
      const config = {
        world: {
          distDir: 'dist',
          title: 'Only Title' as string | undefined,
          description: undefined as string | undefined,
        },
      };

      const thumbnailPath = undefined;

      const updateRequest: { name?: string; description?: string; thumbnailPath?: string } = {};
      if (config.world.title) {
        updateRequest.name = config.world.title;
      }
      if (config.world.description !== undefined) {
        updateRequest.description = config.world.description;
      }
      if (thumbnailPath !== undefined) {
        updateRequest.thumbnailPath = thumbnailPath;
      }

      expect(updateRequest).toEqual({
        name: 'Only Title',
      });
    });

    it('descriptionのみが設定されている場合、descriptionのみを含む更新リクエストが作成される', () => {
      const config = {
        world: {
          distDir: 'dist',
          title: undefined as string | undefined,
          description: 'Only Description' as string | undefined,
        },
      };

      const thumbnailPath = undefined;

      const updateRequest: { name?: string; description?: string; thumbnailPath?: string } = {};
      if (config.world.title) {
        updateRequest.name = config.world.title;
      }
      if (config.world.description !== undefined) {
        updateRequest.description = config.world.description;
      }
      if (thumbnailPath !== undefined) {
        updateRequest.thumbnailPath = thumbnailPath;
      }

      expect(updateRequest).toEqual({
        description: 'Only Description',
      });
    });

    it('thumbnailPathのみが設定されている場合、thumbnailPathのみを含む更新リクエストが作成される', () => {
      const config = {
        world: {
          distDir: 'dist',
          title: undefined as string | undefined,
          description: undefined as string | undefined,
        },
      };

      const thumbnailPath = 'only-thumbnail.png';

      const updateRequest: { name?: string; description?: string; thumbnailPath?: string } = {};
      if (config.world.title) {
        updateRequest.name = config.world.title;
      }
      if (config.world.description !== undefined) {
        updateRequest.description = config.world.description;
      }
      if (thumbnailPath !== undefined) {
        updateRequest.thumbnailPath = thumbnailPath;
      }

      expect(updateRequest).toEqual({
        thumbnailPath: 'only-thumbnail.png',
      });
    });

    it('メタデータが何も設定されていない場合、更新がスキップされる', () => {
      const config = {
        world: {
          distDir: 'dist',
          title: undefined as string | undefined,
          description: undefined as string | undefined,
        },
      };

      const thumbnailPath = undefined;

      const shouldUpdate = !!(
        config.world.title ||
        config.world.description ||
        thumbnailPath !== undefined
      );

      expect(shouldUpdate).toBe(false);
    });

    it('physicsが設定されている場合、更新リクエストに含まれる', () => {
      const config = {
        world: {
          distDir: 'dist',
          title: 'Test World',
          physics: {
            gravity: -9.81,
            allowInfiniteJump: true,
          },
        },
      };

      const thumbnailPath = undefined;

      // メタデータ更新条件をチェック（physicsも含む）
      const shouldUpdate = !!(
        config.world.title ||
        config.world.physics ||
        thumbnailPath !== undefined
      );

      expect(shouldUpdate).toBe(true);

      // 更新リクエストを作成
      const updateRequest: {
        name?: string;
        description?: string;
        thumbnailPath?: string;
        physics?: { gravity?: number; allowInfiniteJump?: boolean };
      } = {};
      if (config.world.title) {
        updateRequest.name = config.world.title;
      }
      if (config.world.physics) {
        updateRequest.physics = config.world.physics;
      }

      expect(updateRequest).toEqual({
        name: 'Test World',
        physics: {
          gravity: -9.81,
          allowInfiniteJump: true,
        },
      });
    });

    it('physicsのみが設定されている場合、physicsのみを含む更新リクエストが作成される', () => {
      const config = {
        world: {
          distDir: 'dist',
          title: undefined as string | undefined,
          description: undefined as string | undefined,
          physics: {
            gravity: -20,
          },
        },
      };

      const thumbnailPath = undefined;

      // メタデータ更新条件をチェック（physicsも含む）
      const shouldUpdate = !!(
        config.world.title ||
        config.world.description ||
        config.world.physics ||
        thumbnailPath !== undefined
      );

      expect(shouldUpdate).toBe(true);

      // 更新リクエストを作成
      const updateRequest: {
        name?: string;
        description?: string;
        thumbnailPath?: string;
        physics?: { gravity?: number; allowInfiniteJump?: boolean };
      } = {};
      if (config.world.title) {
        updateRequest.name = config.world.title;
      }
      if (config.world.description !== undefined) {
        updateRequest.description = config.world.description;
      }
      if (thumbnailPath !== undefined) {
        updateRequest.thumbnailPath = thumbnailPath;
      }
      if (config.world.physics) {
        updateRequest.physics = config.world.physics;
      }

      expect(updateRequest).toEqual({
        physics: {
          gravity: -20,
        },
      });
    });

    it('cameraが設定されている場合、更新リクエストに含まれる', () => {
      const config = {
        world: {
          distDir: 'dist',
          title: 'Test World',
          camera: {
            near: 0.1,
            far: 1000,
          },
        },
      };

      const thumbnailPath = undefined;

      // メタデータ更新条件をチェック（cameraも含む）
      const shouldUpdate = !!(
        config.world.title ||
        config.world.camera ||
        thumbnailPath !== undefined
      );

      expect(shouldUpdate).toBe(true);

      // 更新リクエストを作成
      const updateRequest: {
        name?: string;
        description?: string;
        thumbnailPath?: string;
        camera?: { near?: number; far?: number };
      } = {};
      if (config.world.title) {
        updateRequest.name = config.world.title;
      }
      if (config.world.camera) {
        updateRequest.camera = config.world.camera;
      }

      expect(updateRequest).toEqual({
        name: 'Test World',
        camera: {
          near: 0.1,
          far: 1000,
        },
      });
    });

    it('cameraのみが設定されている場合、cameraのみを含む更新リクエストが作成される', () => {
      const config = {
        world: {
          distDir: 'dist',
          title: undefined as string | undefined,
          description: undefined as string | undefined,
          camera: {
            near: 0.05,
            far: 5000,
          },
        },
      };

      const thumbnailPath = undefined;

      // メタデータ更新条件をチェック（cameraも含む）
      const shouldUpdate = !!(
        config.world.title ||
        config.world.description ||
        config.world.camera ||
        thumbnailPath !== undefined
      );

      expect(shouldUpdate).toBe(true);

      // 更新リクエストを作成
      const updateRequest: {
        name?: string;
        description?: string;
        thumbnailPath?: string;
        camera?: { near?: number; far?: number };
      } = {};
      if (config.world.title) {
        updateRequest.name = config.world.title;
      }
      if (config.world.description !== undefined) {
        updateRequest.description = config.world.description;
      }
      if (thumbnailPath !== undefined) {
        updateRequest.thumbnailPath = thumbnailPath;
      }
      if (config.world.camera) {
        updateRequest.camera = config.world.camera;
      }

      expect(updateRequest).toEqual({
        camera: {
          near: 0.05,
          far: 5000,
        },
      });
    });

    it('cameraがnearのみの場合も正しく更新リクエストに含まれる', () => {
      const config = {
        world: {
          distDir: 'dist',
          camera: {
            near: 0.01,
          },
        },
      };

      const updateRequest: {
        camera?: { near?: number; far?: number };
      } = {};
      if (config.world.camera) {
        updateRequest.camera = config.world.camera;
      }

      expect(updateRequest).toEqual({
        camera: {
          near: 0.01,
        },
      });
    });

    it('outputBufferTypeが設定されている場合、更新リクエストに含まれる', () => {
      const config = {
        world: {
          distDir: 'dist',
          title: 'Test World',
          outputBufferType: 'HalfFloatType' as const,
        },
      };

      const updateRequest: {
        name?: string;
        outputBufferType?: string;
      } = {};
      if (config.world.title) {
        updateRequest.name = config.world.title;
      }
      if (config.world.outputBufferType) {
        updateRequest.outputBufferType = config.world.outputBufferType;
      }

      expect(updateRequest).toEqual({
        name: 'Test World',
        outputBufferType: 'HalfFloatType',
      });
    });

    it('outputBufferTypeのみが設定されている場合、outputBufferTypeのみを含む更新リクエストが作成される', () => {
      const config = {
        world: {
          distDir: 'dist',
          title: undefined as string | undefined,
          description: undefined as string | undefined,
          outputBufferType: 'FloatType' as const,
        },
      };

      const updateRequest: {
        name?: string;
        description?: string;
        outputBufferType?: string;
      } = {};
      if (config.world.title) {
        updateRequest.name = config.world.title;
      }
      if (config.world.description !== undefined) {
        updateRequest.description = config.world.description;
      }
      if (config.world.outputBufferType) {
        updateRequest.outputBufferType = config.world.outputBufferType;
      }

      expect(updateRequest).toEqual({
        outputBufferType: 'FloatType',
      });
    });

    it('physicsがallowInfiniteJumpのみの場合も正しく更新リクエストに含まれる', () => {
      const config = {
        world: {
          distDir: 'dist',
          physics: {
            allowInfiniteJump: false,
          },
        },
      };

      const updateRequest: {
        physics?: { gravity?: number; allowInfiniteJump?: boolean };
      } = {};
      if (config.world.physics) {
        updateRequest.physics = config.world.physics;
      }

      expect(updateRequest).toEqual({
        physics: {
          allowInfiniteJump: false,
        },
      });
    });
  });
});

describe('calculateContentHash - 設定値によるハッシュ変化テスト', () => {
  let tmpDir: string;
  let hashFiles: Array<{ remotePath: string; data: Uint8Array }>;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xrift-test-'));
    const testFile = path.join(tmpDir, 'index.js');
    const content = 'console.log("hello");';
    await fs.writeFile(testFile, content);
    hashFiles = [
      { remotePath: 'index.js', data: new TextEncoder().encode(content) },
    ];
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('configValues なしと空オブジェクトで異なるハッシュを返す', async () => {
    const hashWithout = await calculateContentHash(hashFiles);
    const hashEmpty = await calculateContentHash(hashFiles, {});
    // 空オブジェクトの JSON.stringify は "{}" なので異なるハッシュになる
    expect(hashWithout).not.toBe(hashEmpty);
  });

  it('同じ設定値なら同じハッシュを返す', async () => {
    const config = { physics: { gravity: -9.81 }, camera: { near: 0.1 } };
    const hash1 = await calculateContentHash(hashFiles, config);
    const hash2 = await calculateContentHash(hashFiles, config);
    expect(hash1).toBe(hash2);
  });

  it('physics の値が変わるとハッシュが変わる', async () => {
    const hash1 = await calculateContentHash(hashFiles, {
      physics: { gravity: -9.81 },
    });
    const hash2 = await calculateContentHash(hashFiles, {
      physics: { gravity: -20 },
    });
    expect(hash1).not.toBe(hash2);
  });

  it('camera の値が変わるとハッシュが変わる', async () => {
    const hash1 = await calculateContentHash(hashFiles, {
      camera: { near: 0.1, far: 1000 },
    });
    const hash2 = await calculateContentHash(hashFiles, {
      camera: { near: 0.1, far: 5000 },
    });
    expect(hash1).not.toBe(hash2);
  });

  it('permissions の値が変わるとハッシュが変わる', async () => {
    const hash1 = await calculateContentHash(hashFiles, {
      permissions: { allowedDomains: ['example.com'] },
    });
    const hash2 = await calculateContentHash(hashFiles, {
      permissions: { allowedDomains: ['example.com', 'other.com'] },
    });
    expect(hash1).not.toBe(hash2);
  });

  it('outputBufferType の値が変わるとハッシュが変わる', async () => {
    const hash1 = await calculateContentHash(hashFiles, {
      outputBufferType: 'UnsignedByteType',
    });
    const hash2 = await calculateContentHash(hashFiles, {
      outputBufferType: 'HalfFloatType',
    });
    expect(hash1).not.toBe(hash2);
  });

  it('設定値ありと設定値なしでハッシュが異なる', async () => {
    const hashWithout = await calculateContentHash(hashFiles);
    const hashWith = await calculateContentHash(hashFiles, {
      physics: { gravity: -9.81 },
    });
    expect(hashWithout).not.toBe(hashWith);
  });
});
