import path from 'node:path';
import fs from 'node:fs/promises';
import chalk from 'chalk';
import ora from 'ora';
import {
  CodeSecurityService,
  determineFileContext,
  getSecurityVerdict,
} from '@xrift/code-security';
import type { ValidateCodeResponse, Violation } from '@xrift/code-security';
import {
  loadProjectConfig,
  validateDistDir,
  scanDirectory,
} from './project-config.js';

export interface CheckWorldOptions {
  build?: boolean;
  ignoreWarnings?: boolean;
  json?: boolean;
}

export interface FileCheckResult {
  file: string;
  score: number;
  verdict: 'APPROVE' | 'REVIEW' | 'REJECT';
  violations: {
    critical: Violation[];
    warnings: Violation[];
  };
}

export interface SecurityCheckResult {
  results: FileCheckResult[];
  hasReject: boolean;
  hasReview: boolean;
}

/**
 * 独立コマンド用: セキュリティチェックを実行し結果を表示
 * @returns 終了コード (0: 成功, 1: 失敗)
 */
export async function checkWorld(
  options: CheckWorldOptions = {},
  cwd: string = process.cwd()
): Promise<number> {
  if (!options.json) {
    console.log(chalk.blue('🔒 セキュリティチェックを開始します\n'));
  }

  try {
    // 1. 設定読み込み
    const spinner = !options.json ? ora('設定を読み込み中...').start() : null;
    const config = await loadProjectConfig(cwd);
    const distDir = path.resolve(cwd, config.world.distDir);
    spinner?.succeed(chalk.green(`設定を読み込みました: distDir=${config.world.distDir}`));

    // 2. ビルドコマンド実行
    if (options.build && config.world.buildCommand) {
      if (!options.json) {
        console.log(chalk.blue(`\n🔨 ビルドコマンドを実行: ${config.world.buildCommand}\n`));
      }
      const { execSync } = await import('node:child_process');
      execSync(config.world.buildCommand, { cwd, stdio: options.json ? 'ignore' : 'inherit' });
      if (!options.json) {
        console.log(chalk.green('\n✓ ビルドが完了しました\n'));
      }
    }

    // 3. distディレクトリ検証
    await validateDistDir(distDir);

    // 4. JSファイルをスキャン
    const scanSpinner = !options.json ? ora('ファイルをスキャン中...').start() : null;
    const allFiles = await scanDirectory(distDir, config.world.ignore);
    const jsFiles = allFiles.filter((f) => /\.(js|mjs)$/.test(f));

    if (jsFiles.length === 0) {
      scanSpinner?.succeed(chalk.yellow('チェック対象のJSファイルがありません'));
      if (options.json) {
        console.log(JSON.stringify({ results: [], hasReject: false, hasReview: false }));
      }
      return 0;
    }

    scanSpinner?.succeed(chalk.green(`${jsFiles.length}個のJSファイルを検出しました`));

    // 5. セキュリティチェック実行
    const checkResult = await runSecurityCheck(jsFiles, distDir);

    // 6. 結果表示
    if (options.json) {
      console.log(JSON.stringify(checkResult, null, 2));
    } else {
      printResults(checkResult);
    }

    // 7. 終了コード判定
    if (checkResult.hasReject) {
      return 1;
    }
    if (checkResult.hasReview && !options.ignoreWarnings) {
      return 0;
    }
    return 0;
  } catch (error) {
    if (options.json) {
      console.log(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    } else if (error instanceof Error) {
      console.error(chalk.red(`\n❌ ${error.message}`));
    }
    return 1;
  }
}

/**
 * upload 連携用: セキュリティチェックを実行し結果オブジェクトのみ返す
 */
export async function runSecurityCheck(
  files: string[],
  distDir: string
): Promise<SecurityCheckResult> {
  const service = new CodeSecurityService();
  const results: FileCheckResult[] = [];

  // package.json を読み込み（存在しない場合は空の dependencies を使用）
  let packageJsonDeps: Record<string, string> = {};
  try {
    const pkgPath = path.join(distDir, '..', 'package.json');
    const pkgContent = await fs.readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(pkgContent);
    packageJsonDeps = pkg.dependencies || {};
  } catch {
    // package.json がない場合は空で続行
  }

  for (const filePath of files) {
    const code = await fs.readFile(filePath, 'utf-8');
    const relativePath = path.relative(distDir, filePath);
    const fileContext = determineFileContext(relativePath);

    const response: ValidateCodeResponse = service.validate({
      code,
      packageJson: { dependencies: packageJsonDeps },
      fileContext,
    });

    const verdict = getSecurityVerdict(response.securityScore);

    results.push({
      file: relativePath,
      score: response.securityScore,
      verdict,
      violations: response.violations,
    });
  }

  return {
    results,
    hasReject: results.some((r) => r.verdict === 'REJECT'),
    hasReview: results.some((r) => r.verdict === 'REVIEW'),
  };
}

/**
 * 結果をコンソールに表示
 */
function printResults(checkResult: SecurityCheckResult): void {
  console.log('');

  for (const result of checkResult.results) {
    const verdictColor =
      result.verdict === 'APPROVE'
        ? chalk.green
        : result.verdict === 'REVIEW'
          ? chalk.yellow
          : chalk.red;

    console.log(chalk.gray(`━━━ ${result.file} ${'━'.repeat(Math.max(0, 40 - result.file.length))}`));
    console.log(`  スコア: ${result.score}  判定: ${verdictColor(result.verdict)}`);

    for (const v of result.violations.critical) {
      const loc = v.location ? ` (line ${v.location.line})` : '';
      console.log(chalk.red(`  ✗ ${v.message}${loc}`));
    }
    for (const v of result.violations.warnings) {
      const loc = v.location ? ` (line ${v.location.line})` : '';
      console.log(chalk.yellow(`  ⚠ ${v.message}${loc}`));
    }
    console.log('');
  }

  // サマリー
  const total = checkResult.results.length;
  const approveCount = checkResult.results.filter((r) => r.verdict === 'APPROVE').length;
  const reviewCount = checkResult.results.filter((r) => r.verdict === 'REVIEW').length;
  const rejectCount = checkResult.results.filter((r) => r.verdict === 'REJECT').length;

  console.log(chalk.gray('━'.repeat(40)));
  let summary = `結果: ${total}ファイル`;
  if (approveCount > 0) summary += `  ${chalk.green(`APPROVE: ${approveCount}`)}`;
  if (reviewCount > 0) summary += `  ${chalk.yellow(`REVIEW: ${reviewCount}`)}`;
  if (rejectCount > 0) summary += `  ${chalk.red(`REJECT: ${rejectCount}`)}`;
  console.log(summary);

  if (checkResult.hasReject) {
    console.log(chalk.red('\n❌ セキュリティチェックに失敗しました'));
  } else if (checkResult.hasReview) {
    console.log(chalk.yellow('\n⚠ レビューが必要な項目があります'));
  } else {
    console.log(chalk.green('\n✅ セキュリティチェックに合格しました'));
  }
}
