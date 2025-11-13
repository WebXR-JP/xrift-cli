import { describe, it, expect } from '@jest/globals';
import {
  isValidProjectName,
  needsInteraction,
  type CreateOptions,
} from '../../lib/create-helpers.js';

describe('create command', () => {
  describe('isValidProjectName', () => {
    it('有効なプロジェクト名の場合は true を返す', () => {
      expect(isValidProjectName('my-world')).toBe(true);
      expect(isValidProjectName('test-project-123')).toBe(true);
      expect(isValidProjectName('simple')).toBe(true);
      expect(isValidProjectName('a-b-c-d-e-f')).toBe(true);
      expect(isValidProjectName('world-2024')).toBe(true);
    });

    it('大文字が含まれる場合は false を返す', () => {
      expect(isValidProjectName('MyWorld')).toBe(false);
      expect(isValidProjectName('Test')).toBe(false);
    });

    it('アンダースコアが含まれる場合は false を返す', () => {
      expect(isValidProjectName('my_world')).toBe(false);
      expect(isValidProjectName('test_project')).toBe(false);
    });

    it('スペースが含まれる場合は false を返す', () => {
      expect(isValidProjectName('my world')).toBe(false);
      expect(isValidProjectName('test project')).toBe(false);
    });

    it('特殊文字が含まれる場合は false を返す', () => {
      expect(isValidProjectName('my@world')).toBe(false);
      expect(isValidProjectName('test!project')).toBe(false);
      expect(isValidProjectName('world.project')).toBe(false);
    });

    it('空文字の場合は false を返す', () => {
      expect(isValidProjectName('')).toBe(false);
    });

    it('ハイフンのみの場合は true を返す', () => {
      expect(isValidProjectName('-')).toBe(true);
      expect(isValidProjectName('---')).toBe(true);
    });
  });

  describe('needsInteraction', () => {
    it('全てのオプションが指定されている場合は false を返す', () => {
      const options: CreateOptions = {
        here: true,
        skipInstall: true,
        template: 'custom/repo',
        interactive: undefined,
      };
      expect(needsInteraction('my-project', options)).toBe(false);
    });

    it('プロジェクト名が未指定の場合は true を返す', () => {
      const options: CreateOptions = {
        here: true,
        skipInstall: true,
        interactive: undefined,
      };
      expect(needsInteraction(undefined, options)).toBe(true);
    });

    it('here オプションが未指定の場合は true を返す', () => {
      const options: CreateOptions = {
        skipInstall: true,
        interactive: undefined,
      };
      expect(needsInteraction('my-project', options)).toBe(true);
    });

    it('skipInstall オプションが未指定の場合は true を返す', () => {
      const options: CreateOptions = {
        here: true,
        interactive: undefined,
      };
      expect(needsInteraction('my-project', options)).toBe(true);
    });

    it('interactive が false の場合は false を返す', () => {
      const options: CreateOptions = {
        interactive: false,
      };
      expect(needsInteraction(undefined, options)).toBe(false);
    });

    it('複数のオプションが未指定の場合は true を返す', () => {
      const options: CreateOptions = {
        interactive: undefined,
      };
      expect(needsInteraction(undefined, options)).toBe(true);
    });

    it('プロジェクト名とhereが指定され、skipInstallが未指定の場合は true を返す', () => {
      const options: CreateOptions = {
        here: true,
        interactive: undefined,
      };
      expect(needsInteraction('my-project', options)).toBe(true);
    });

    it('--no-interactive フラグがある場合、他のオプションに関わらず false を返す', () => {
      const options: CreateOptions = {
        interactive: false,
      };
      expect(needsInteraction(undefined, options)).toBe(false);
    });

    it('全てのオプションが空でもinteractiveがfalseならfalseを返す', () => {
      const options: CreateOptions = {
        here: undefined,
        skipInstall: undefined,
        template: undefined,
        interactive: false,
      };
      expect(needsInteraction('my-project', options)).toBe(false);
    });
  });
});
