import path from 'node:path';
import fs from 'node:fs/promises';
import chalk from 'chalk';
import ora from 'ora';
import {
  CodeSecurityService,
  determineFileContext,
} from '@xrift/code-security';
import type { ValidateCodeResponse, Violation, WorldPermissions } from '@xrift/code-security';
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
    console.log(chalk.blue('🔒 Starting security check\n'));
  }

  try {
    // 1. 設定読み込み
    const spinner = !options.json ? ora('Loading config...').start() : null;
    const config = await loadProjectConfig(cwd);

    if (!config.world) {
      spinner?.fail('No world config found in xrift.json');
      throw new Error('world is not configured in xrift.json');
    }

    const worldConfig = config.world;
    const distDir = path.resolve(cwd, worldConfig.distDir);
    spinner?.succeed(chalk.green(`Config loaded: distDir=${worldConfig.distDir}`));

    // 2. ビルドコマンド実行
    if (options.build && worldConfig.buildCommand) {
      if (!options.json) {
        console.log(chalk.blue(`\n🔨 Running build command: ${worldConfig.buildCommand}\n`));
      }
      const { execSync } = await import('node:child_process');
      execSync(worldConfig.buildCommand, { cwd, stdio: options.json ? 'ignore' : 'inherit' });
      if (!options.json) {
        console.log(chalk.green('\n✓ Build completed\n'));
      }
    }

    // 3. distディレクトリ検証
    await validateDistDir(distDir);

    // 4. JSファイルをスキャン
    const scanSpinner = !options.json ? ora('Scanning files...').start() : null;
    const allFiles = await scanDirectory(distDir, worldConfig.ignore);
    const jsFiles = allFiles.filter((f) => /\.(js|mjs)$/.test(f));

    if (jsFiles.length === 0) {
      scanSpinner?.succeed(chalk.yellow('No JS files to check'));
      if (options.json) {
        console.log(JSON.stringify({ results: [], hasReject: false, hasReview: false }));
      }
      return 0;
    }

    scanSpinner?.succeed(chalk.green(`Found ${jsFiles.length} JS files`));

    // 5. セキュリティチェック実行
    const checkResult = await runSecurityCheck(jsFiles, distDir, worldConfig.permissions);

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
  distDir: string,
  worldPermissions?: WorldPermissions
): Promise<SecurityCheckResult> {
  const service = new CodeSecurityService();
  const results: FileCheckResult[] = [];
  const allPermissionWarnings: string[] = [];

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
      worldPermissions,
    });

    // permissionWarnings を収集
    if (response.permissionWarnings && response.permissionWarnings.length > 0) {
      allPermissionWarnings.push(...response.permissionWarnings);
    }

    // fileContext による severity 調整後の violations ベースで判定
    // securityScore は生シグナルから計算されるため fileContext を反映しない
    const verdict = determineVerdict(response);

    results.push({
      file: relativePath,
      score: response.securityScore,
      verdict,
      violations: response.violations,
    });
  }

  // permissionWarnings をコンソールに表示
  if (allPermissionWarnings.length > 0) {
    const uniqueWarnings = [...new Set(allPermissionWarnings)];
    console.log(chalk.yellow('\n⚠ Permission warnings:'));
    for (const warning of uniqueWarnings) {
      console.log(chalk.yellow(`  - ${warning}`));
    }
    console.log('');
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
export function printResults(checkResult: SecurityCheckResult): void {
  // REVIEW / REJECT のファイルのみ詳細表示
  const issueResults = checkResult.results.filter((r) => r.verdict !== 'APPROVE');

  if (issueResults.length > 0) {
    console.log('');

    for (const result of issueResults) {
      const verdictColor = result.verdict === 'REVIEW' ? chalk.yellow : chalk.red;

      console.log(chalk.gray(`━━━ ${result.file} ${'━'.repeat(Math.max(0, 40 - result.file.length))}`));
      console.log(`  Score: ${result.score}  Verdict: ${verdictColor(result.verdict)}`);

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
  }

  // サマリー
  const total = checkResult.results.length;
  const approveCount = checkResult.results.filter((r) => r.verdict === 'APPROVE').length;
  const reviewCount = checkResult.results.filter((r) => r.verdict === 'REVIEW').length;
  const rejectCount = checkResult.results.filter((r) => r.verdict === 'REJECT').length;

  console.log(chalk.gray('━'.repeat(40)));
  let summary = `Results: ${total} files`;
  if (approveCount > 0) summary += `  ${chalk.green(`APPROVE: ${approveCount}`)}`;
  if (reviewCount > 0) summary += `  ${chalk.yellow(`REVIEW: ${reviewCount}`)}`;
  if (rejectCount > 0) summary += `  ${chalk.red(`REJECT: ${rejectCount}`)}`;
  console.log(summary);

  if (checkResult.hasReject) {
    console.log(chalk.red('\n❌ Security check failed'));
  } else if (checkResult.hasReview) {
    console.log(chalk.yellow('\n⚠ Some items require review'));
  } else {
    console.log(chalk.green('\n✅ Security check passed'));
  }
}

/**
 * fileContext 調整済みの violations ベースで verdict を判定
 * critical violations があれば REJECT、warnings のみなら REVIEW、なければ APPROVE
 */
function determineVerdict(response: ValidateCodeResponse): 'APPROVE' | 'REVIEW' | 'REJECT' {
  if (response.violations.critical.length > 0) {
    return 'REJECT';
  }
  if (response.violations.warnings.length > 0) {
    return 'REVIEW';
  }
  return 'APPROVE';
}
