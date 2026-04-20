/**
 * XRift CLI Type Definitions
 */

// SDK から API 関連の型を re-export
export type {
  PhysicsConfig,
  CameraConfig,
  OutputBufferType,
  SignedUrlResponse,
  WorldPermissions,
  CreateWorldRequest,
  CreateWorldResponse,
  WorldUploadUrlsRequest,
  WorldUploadUrlsResponse,
  CompleteWorldUploadResponse,
  ItemPermissions,
  CreateItemRequest,
  CreateItemResponse,
  ItemUploadUrlsRequest,
  ItemUploadUrlsResponse,
  CompleteItemUploadResponse,
} from '@xrift/sdk';

// CLI 固有の型定義

export interface XriftConfig {
  world?: {
    distDir: string;
    title?: string;
    description?: string;
    thumbnailPath?: string;
    buildCommand?: string; // アップロード前に実行するビルドコマンド
    ignore?: string[]; // アップロード対象から除外するファイル/ディレクトリのglobパターン
    physics?: import('@xrift/sdk').PhysicsConfig; // 物理設定
    camera?: import('@xrift/sdk').CameraConfig; // カメラ設定
    permissions?: import('@xrift/sdk').WorldPermissions; // セキュリティ権限宣言
    outputBufferType?: import('@xrift/sdk').OutputBufferType; // WebGLRenderer の出力バッファタイプ
  };
  item?: {
    distDir: string; // ビルド成果物のディレクトリ
    title?: string; // アイテム名
    description?: string; // 説明
    thumbnailPath?: string; // サムネイルパス
    buildCommand?: string; // アップロード前に実行するビルドコマンド
    ignore?: string[]; // アップロード対象から除外するglobパターン
    permissions?: import('@xrift/sdk').ItemPermissions; // セキュリティ権限宣言
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
