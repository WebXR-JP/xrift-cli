import { describe, it, expect } from '@jest/globals';

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
  });
});
