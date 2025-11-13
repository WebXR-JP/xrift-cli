/**
 * XRift CLI Type Definitions
 */

export interface XriftConfig {
  world: {
    distDir: string;
    title?: string;
    description?: string;
    thumbnailPath?: string;
    buildCommand?: string; // アップロード前に実行するビルドコマンド
    ignore?: string[]; // アップロード対象から除外するファイル/ディレクトリのglobパターン
  };
}

export interface WorldMetadata {
  id: string;
  createdAt: string;
  lastUploadedAt: string;
}

export interface AuthConfig {
  token: string;
  expiresAt?: string;
}

export interface UploadFileInfo {
  localPath: string;
  remotePath: string;
  size: number;
}

export interface SignedUrlResponse {
  path: string;
  uploadUrl: string;
  publicUrl: string;
  expiresAt: string;
}

export interface CreateWorldRequest {
  // Phase 3-2: 空のリクエストボディ
}

export interface CreateWorldResponse {
  id: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface UploadUrlsRequest {
  name: string; // ワールド名（必須）
  description?: string; // 説明（任意）
  thumbnailPath?: string; // サムネイルパス（任意）
  contentHash: string;
  fileSize: number;
  files: Array<{
    path: string;
    contentType: string;
  }>;
}

export interface UploadUrlsResponse {
  uploadUrls: SignedUrlResponse[];
  versionId: string;
  contentHash: string;
  versionNumber: number;
}

export interface CompleteUploadRequest {
  versionId: string;
}

export interface CompleteUploadResponse {
  versionId: string;
  worldId: string;
  name: string;
  description?: string;
  contentHash: string;
  fileSize: number;
  status: string;
  versionNumber: number;
  owner: {
    id: string;
    displayName: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface UpdateWorldMetadataRequest {
  name?: string; // タイトル更新時は name を使用
  description?: string;
}

export interface VerifyTokenResponse {
  valid: boolean;
  user?: {
    id: string;
    email: string;
    displayName: string;
  };
}

export interface ExchangeTokenRequest {
  code: string;
}

export interface ExchangeTokenResponse {
  token: string;
  user?: {
    id: string;
    email: string;
    displayName: string;
  };
}
