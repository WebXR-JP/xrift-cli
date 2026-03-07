import http from 'node:http';
import crypto from 'node:crypto';
import open from 'open';
import chalk from 'chalk';
import ora from 'ora';
import {
  FRONTEND_URL,
  AUTH_LOGIN_PATH,
  CALLBACK_PORT,
  CALLBACK_PATH,
} from './constants.js';
import { saveAuthConfig, deleteAuthConfig, getToken } from './config.js';
import { verifyToken, exchangeCodeForToken } from './api.js';
import { logVerbose } from './logger.js';

/**
 * ランダムなstateパラメータを生成（CSRF対策）
 */
function generateState(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * ログイン処理
 */
export async function login(): Promise<void> {
  const state = generateState();
  const callbackUrl = `http://localhost:${CALLBACK_PORT}${CALLBACK_PATH}`;
  const loginUrl = `${FRONTEND_URL}${AUTH_LOGIN_PATH}?callback=${encodeURIComponent(
    callbackUrl
  )}&state=${state}`;

  console.log(chalk.blue('Authenticating via browser...'));

  // Callback serverを起動
  const spinner = ora({ text: 'Waiting for authentication...', isEnabled: false });

  return new Promise((resolve, reject) => {
    let timeoutId: NodeJS.Timeout;

    const server = http.createServer(async (req, res) => {
      if (!req.url?.startsWith(CALLBACK_PATH)) {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }

      try {
        const url = new URL(req.url, `http://localhost:${CALLBACK_PORT}`);
        const code = url.searchParams.get('code');
        const returnedState = url.searchParams.get('state');

        // CSRF対策: stateパラメータを検証
        if (returnedState !== state) {
          throw new Error('Invalid state parameter');
        }

        if (!code) {
          throw new Error('Failed to retrieve authentication code');
        }

        // コードをトークンと交換
        const { token, user } = await exchangeCodeForToken(code);

        // トークンを保存
        await saveAuthConfig({ token });

        // 成功レスポンス
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <title>XRift CLI - Login Successful</title>
              <style>
                body {
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  height: 100vh;
                  margin: 0;
                  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                }
                .container {
                  background: white;
                  padding: 3rem;
                  border-radius: 1rem;
                  box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                  text-align: center;
                }
                h1 { color: #667eea; margin-bottom: 1rem; }
                p { color: #666; margin: 0.5rem 0; }
              </style>
            </head>
            <body>
              <div class="container">
                <h1>✅ Login Successful</h1>
                <p>You have successfully logged in to XRift CLI!</p>
                <p>You can close this window and return to your terminal.</p>
              </div>
            </body>
          </html>
        `);

        spinner.succeed(chalk.green('✅ Successfully logged in'));

        if (user?.displayName) {
          logVerbose(`Logged in as: ${user.displayName}`);
        }

        // タイムアウトをクリア
        clearTimeout(timeoutId);

        server.close(() => {
          resolve();
        });
        // server.closeの外で即座に終了
        process.exit(0);
      } catch (error) {
        spinner.fail(chalk.red('❌ Login failed'));

        if (error instanceof Error) {
          console.error(chalk.red(error.message));
        }

        // エラーレスポンス
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <title>XRift CLI - Login Failed</title>
              <style>
                body {
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  height: 100vh;
                  margin: 0;
                  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
                }
                .container {
                  background: white;
                  padding: 3rem;
                  border-radius: 1rem;
                  box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                  text-align: center;
                }
                h1 { color: #f5576c; margin-bottom: 1rem; }
                p { color: #666; margin: 0.5rem 0; }
              </style>
            </head>
            <body>
              <div class="container">
                <h1>❌ Login Failed</h1>
                <p>Authentication failed.</p>
                <p>Please return to your terminal and try again.</p>
              </div>
            </body>
          </html>
        `);

        // タイムアウトをクリア
        clearTimeout(timeoutId);

        server.close(() => {
          // サーバーを閉じたらすぐに終了
          setTimeout(() => process.exit(1), 100);
          reject(error);
        });
      }
    });

    server.listen(CALLBACK_PORT, () => {
      // ブラウザを開く
      open(loginUrl).catch(() => {
        spinner.warn('Could not open browser automatically');
        console.log(chalk.yellow('\nPlease open the following URL in your browser:'));
        console.log(chalk.blue(loginUrl));
      });
    });

    // タイムアウト設定（5分）
    timeoutId = setTimeout(() => {
      spinner.fail(chalk.red('Authentication timed out'));
      server.close(() => {
        // サーバーを閉じたらすぐに終了
        setTimeout(() => process.exit(1), 100);
        reject(new Error('Authentication timed out'));
      });
    }, 5 * 60 * 1000);
  });
}

/**
 * ログアウト処理
 */
export async function logout(): Promise<void> {
  const token = await getToken();

  if (!token) {
    console.log(chalk.yellow('Not logged in'));
    return;
  }

  await deleteAuthConfig();
  console.log(chalk.green('✅ Logged out successfully'));
}

/**
 * 現在のユーザー情報を表示
 */
export async function whoami(): Promise<void> {
  const token = await getToken();

  if (!token) {
    console.log(chalk.yellow('Not logged in'));
    logVerbose('Run `xrift login` to log in');
    return;
  }

  const spinner = ora('Fetching user info...').start();

  try {
    const verification = await verifyToken(token);

    if (!verification.valid) {
      spinner.fail(chalk.red('Token is invalid'));
      logVerbose('Please log in again: `xrift login`');
      return;
    }

    spinner.succeed(chalk.green('Logged in'));

    if (verification.user?.displayName) {
      console.log(chalk.blue('Display Name:'), verification.user.displayName);
    }
    if (verification.user?.email) {
      console.log(chalk.blue('Email:'), verification.user.email);
    }
    if (verification.user?.id) {
      console.log(chalk.blue('User ID:'), verification.user.id);
    }
  } catch (error) {
    spinner.fail(chalk.red('Failed to fetch user info'));
    if (error instanceof Error) {
      console.error(chalk.red(error.message));
    }
    throw error;
  }
}
