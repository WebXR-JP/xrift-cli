import path from 'node:path';
import os from 'node:os';

/**
 * XRift CLI Constants
 */

// API Base URL
export const API_BASE_URL = process.env.XRIFT_API_URL || 'https://api.xrift.net';

// Frontend URL (for browser authentication)
export const FRONTEND_URL = process.env.XRIFT_FRONTEND_URL || 'https://app.xrift.net';

// Authentication
export const AUTH_LOGIN_PATH = '/cli-login';
export const AUTH_VERIFY_PATH = '/api/auth/verify-cli-token';
export const AUTH_TOKEN_EXCHANGE_PATH = '/api/auth/cli-token'; // POST: code -> token exchange
export const CALLBACK_PORT = 3000;
export const CALLBACK_PATH = '/callback';

// Config file paths
export const CONFIG_DIR = path.join(os.homedir(), '.xrift');
export const AUTH_CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
export const PROJECT_CONFIG_FILE = 'xrift.json';
export const PROJECT_META_DIR = '.xrift';
export const WORLD_META_FILE = 'world.json';

// World API endpoints
export const WORLD_CREATE_PATH = '/api/worlds';
export const WORLD_UPDATE_PATH = '/api/worlds';
export const WORLD_UPLOAD_URL_PATH = '/api/worlds';
