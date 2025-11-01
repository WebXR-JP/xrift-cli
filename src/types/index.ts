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
  name: string; // ユーザーが入力した "タイトル" を name として送信
  description?: string;
  thumbnailPath?: string; // dist内の相対パス (例: "thumbnail.png")
}

export interface CreateWorldResponse {
  id: string;
  name?: string;
  description?: string;
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
