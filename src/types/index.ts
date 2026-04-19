/**
 * XRift CLI Type Definitions
 */

export interface PhysicsConfig {
  gravity?: number;
  allowInfiniteJump?: boolean;
}

export interface CameraConfig {
  near?: number;
  far?: number;
}

export interface WorldPermissions {
  allowedDomains?: string[];
  allowedCodeRules?: string[];
}

export interface ItemPermissions {
  allowedDomains?: string[];
  allowedCodeRules?: string[];
}

export type OutputBufferType = 'UnsignedByteType' | 'HalfFloatType' | 'FloatType';

export interface XriftConfig {
  world?: {
    distDir: string;
    title?: string;
    description?: string;
    thumbnailPath?: string;
    buildCommand?: string; // アップロード前に実行するビルドコマンド
    ignore?: string[]; // アップロード対象から除外するファイル/ディレクトリのglobパターン
    physics?: PhysicsConfig; // 物理設定
    camera?: CameraConfig; // カメラ設定
    permissions?: WorldPermissions; // セキュリティ権限宣言
    outputBufferType?: OutputBufferType; // WebGLRenderer の出力バッファタイプ
  };
  item?: {
    distDir: string; // ビルド成果物のディレクトリ
    title?: string; // アイテム名
    description?: string; // 説明
    thumbnailPath?: string; // サムネイルパス
    buildCommand?: string; // アップロード前に実行するビルドコマンド
    ignore?: string[]; // アップロード対象から除外するglobパターン
    permissions?: ItemPermissions; // セキュリティ権限宣言
  };
}

export interface WorldMetadata {
  id: string;
  createdAt: string;
  lastUploadedAt: string;
}

export interface ItemMetadata {
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
  physics?: PhysicsConfig; // 物理設定（任意）
  camera?: CameraConfig; // カメラ設定（任意）
  permissions?: WorldPermissions; // セキュリティ権限宣言（任意）
  outputBufferType?: OutputBufferType; // WebGLRenderer の出力バッファタイプ（任意）
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

// Item types

export interface CreateItemRequest {
  // ItemVersion ベース: 空のリクエストボディ
}

export interface CreateItemResponse {
  id: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ItemUploadUrlsRequest {
  name: string; // アイテム名（必須）
  description?: string; // 説明（任意）
  thumbnailPath?: string; // サムネイルパス（任意）
  contentHash: string; // 12文字の16進数
  fileSize: number;
  files: Array<{
    path: string;
    contentType: string;
  }>;
  permissions?: ItemPermissions; // セキュリティ権限宣言（任意）
}

export interface ItemUploadUrlsResponse {
  uploadUrls: SignedUrlResponse[];
  versionId: string;
  contentHash: string;
  versionNumber: number;
}

export interface CompleteItemUploadRequest {
  versionId: string;
}

export interface CompleteItemUploadResponse {
  versionId: string;
  itemId: string;
  name: string;
  description?: string;
  contentHash: string;
  fileSize: number;
  status: string;
  versionNumber: number;
  createdAt: string;
  updatedAt: string;
}
