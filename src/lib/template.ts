import { downloadTemplate as gigetDownload } from 'giget';
import { readFile, writeFile, access } from 'fs/promises';
import { constants } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';
import ora from 'ora';

/**
 * ファイルまたはディレクトリが存在するかチェック
 */
async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * GitHubからテンプレートをダウンロードする
 */
export async function downloadTemplate(
  template: string,
  destination: string
): Promise<void> {
  const spinner = ora('Downloading template...').start();

  try {
    await gigetDownload(`github:${template}`, {
      dir: destination,
      force: true, // 既存ディレクトリへの展開を許可
    });
    spinner.succeed('Template downloaded');
  } catch (error) {
    spinner.fail('Failed to download template');
    throw error;
  }
}

/**
 * プロジェクト名をkebab-caseからsnake_caseに変換
 */
function toSnakeCase(str: string): string {
  return str.replace(/-/g, '_');
}

/**
 * ファイル内の文字列を置換する
 */
async function replaceInFile(
  filePath: string,
  replacements: Array<{ from: string | RegExp; to: string }>
): Promise<void> {
  const exists = await pathExists(filePath);
  if (!exists) {
    return;
  }

  let content = await readFile(filePath, 'utf-8');

  for (const { from, to } of replacements) {
    if (typeof from === 'string') {
      content = content.split(from).join(to);
    } else {
      content = content.replace(from, to);
    }
  }

  await writeFile(filePath, content, 'utf-8');
}

/**
 * プロジェクトファイルをカスタマイズする
 */
export async function customizeProject(
  projectName: string,
  projectPath: string
): Promise<void> {
  const spinner = ora('Customizing project...').start();

  try {
    const snakeCaseName = toSnakeCase(projectName);

    // package.json を更新
    await replaceInFile(join(projectPath, 'package.json'), [
      { from: '@xrift/test-world', to: `@xrift/${projectName}` },
      { from: '@xrift/world-template', to: `@xrift/${projectName}` },
      { from: '"version": "0.2.1"', to: '"version": "0.1.0"' },
      { from: '"version": "1.0.0"', to: '"version": "0.1.0"' },
    ]);

    // vite.config.ts を更新
    await replaceInFile(join(projectPath, 'vite.config.ts'), [
      { from: 'xrift_test_world', to: `xrift_${snakeCaseName}` },
      { from: 'xrift_world_template', to: `xrift_${snakeCaseName}` },
    ]);

    // index.html を更新
    await replaceInFile(join(projectPath, 'index.html'), [
      { from: '<title>XRift Test World</title>', to: `<title>${projectName}</title>` },
      { from: '<title>XRift World Template</title>', to: `<title>${projectName}</title>` },
    ]);

    spinner.succeed('Project customized');
  } catch (error) {
    spinner.fail('Failed to customize project');
    throw error;
  }
}

/**
 * 依存関係をインストールする
 */
export async function installDependencies(projectPath: string): Promise<void> {
  const spinner = ora('Installing dependencies...').start();

  return new Promise((resolve, reject) => {
    const npm = spawn('npm', ['install'], {
      cwd: projectPath,
      stdio: 'pipe',
      shell: true,
    });

    npm.on('close', (code) => {
      if (code === 0) {
        spinner.succeed('Dependencies installed');
        resolve();
      } else {
        spinner.fail('Failed to install dependencies');
        reject(new Error(`npm install exited with code ${code}`));
      }
    });

    npm.on('error', (error) => {
      spinner.fail('Failed to install dependencies');
      reject(error);
    });
  });
}
