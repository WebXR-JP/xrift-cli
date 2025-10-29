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
import { verifyToken } from './api.js';

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

  console.log(chalk.blue('ブラウザで認証を行います...'));
  console.log(chalk.gray(`認証URL: ${loginUrl}`));

  // Callback serverを起動
  const spinner = ora('認証を待機中...').start();

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      if (!req.url?.startsWith(CALLBACK_PATH)) {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }

      try {
        const url = new URL(req.url, `http://localhost:${CALLBACK_PORT}`);
        const token = url.searchParams.get('token');
        const returnedState = url.searchParams.get('state');

        // CSRF対策: stateパラメータを検証
        if (returnedState !== state) {
          throw new Error('不正なstateパラメータです');
        }

        if (!token) {
          throw new Error('トークンが取得できませんでした');
        }

        // トークンを検証
        const verification = await verifyToken(token);
        if (!verification.valid) {
          throw new Error('無効なトークンです');
        }

        // トークンを保存
        await saveAuthConfig({ token });

        // 成功レスポンス
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <title>XRift CLI - ログイン成功</title>
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
                <h1>✅ ログイン成功</h1>
                <p>XRift CLI へのログインに成功しました！</p>
                <p>このウィンドウを閉じて、ターミナルに戻ってください。</p>
              </div>
            </body>
          </html>
        `);

        spinner.succeed(chalk.green('✅ ログインに成功しました'));

        if (verification.username) {
          console.log(chalk.gray(`ログイン中: ${verification.username}`));
        }

        server.close();
        resolve();
      } catch (error) {
        spinner.fail(chalk.red('❌ ログインに失敗しました'));

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
              <title>XRift CLI - ログイン失敗</title>
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
                <h1>❌ ログイン失敗</h1>
                <p>認証に失敗しました。</p>
                <p>ターミナルに戻り、もう一度お試しください。</p>
              </div>
            </body>
          </html>
        `);

        server.close();
        reject(error);
      }
    });

    server.listen(CALLBACK_PORT, () => {
      // ブラウザを開く
      open(loginUrl).catch(() => {
        spinner.warn('ブラウザを自動で開けませんでした');
        console.log(chalk.yellow('\n以下のURLをブラウザで開いてください:'));
        console.log(chalk.blue(loginUrl));
      });
    });

    // タイムアウト設定（5分）
    setTimeout(() => {
      spinner.fail(chalk.red('認証がタイムアウトしました'));
      server.close();
      reject(new Error('認証がタイムアウトしました'));
    }, 5 * 60 * 1000);
  });
}

/**
 * ログアウト処理
 */
export async function logout(): Promise<void> {
  const token = await getToken();

  if (!token) {
    console.log(chalk.yellow('ログインしていません'));
    return;
  }

  await deleteAuthConfig();
  console.log(chalk.green('✅ ログアウトしました'));
}

/**
 * 現在のユーザー情報を表示
 */
export async function whoami(): Promise<void> {
  const token = await getToken();

  if (!token) {
    console.log(chalk.yellow('ログインしていません'));
    console.log(chalk.gray('`xrift login` を実行してログインしてください'));
    return;
  }

  const spinner = ora('ユーザー情報を取得中...').start();

  try {
    const verification = await verifyToken(token);

    if (!verification.valid) {
      spinner.fail(chalk.red('トークンが無効です'));
      console.log(chalk.gray('再度ログインしてください: `xrift login`'));
      return;
    }

    spinner.succeed(chalk.green('ログイン中'));

    if (verification.username) {
      console.log(chalk.blue('ユーザー名:'), verification.username);
    }
    if (verification.email) {
      console.log(chalk.blue('メール:'), verification.email);
    }
  } catch (error) {
    spinner.fail(chalk.red('ユーザー情報の取得に失敗しました'));
    if (error instanceof Error) {
      console.error(chalk.red(error.message));
    }
    throw error;
  }
}
