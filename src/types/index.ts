/**
 * XRift CLI Type Definitions
 */

export interface XriftConfig {
  world: {
    distDir: string;
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
  url: string;
  key: string;
}

export interface CreateWorldResponse {
  id: string;
  name?: string;
}

export interface VerifyTokenResponse {
  valid: boolean;
  userId?: string;
  username?: string;
  email?: string;
}
