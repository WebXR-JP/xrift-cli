import chalk from 'chalk';

let isVerbose = false;

export function setVerbose(verbose: boolean): void {
  isVerbose = verbose;
}

export function getVerbose(): boolean {
  return isVerbose;
}

export function logVerbose(...args: unknown[]): void {
  if (isVerbose) {
    console.log(chalk.gray(...args));
  }
}
