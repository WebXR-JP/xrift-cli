/**
 * create コマンドのヘルパー関数
 * テスト可能にするため、依存関係のない純粋な関数として分離
 */

export interface CreateOptions {
  template?: string;
  skipInstall?: boolean;
  here?: boolean;
  interactive?: boolean;
  y?: boolean;
}

/**
 * プロジェクト名が有効かバリデーション
 */
export function isValidProjectName(name: string): boolean {
  return /^[a-z0-9-]+$/.test(name);
}

/**
 * 対話式モードが必要か判定
 */
export function needsInteraction(
  projectName: string | undefined,
  options: CreateOptions
): boolean {
  return (
    options.interactive !== false &&
    (!projectName ||
      options.here === undefined ||
      options.skipInstall === undefined)
  );
}
