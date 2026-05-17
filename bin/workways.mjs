#!/usr/bin/env node
import { add, list } from '../src/cli.mjs';

const [, , cmd, ...rest] = process.argv;

const usage = `workways — scaffold reusable workflows into your repo

Usage:
  workways list                       List available clusters
  workways add <cluster> [cluster...] Copy a cluster into the current repo
  workways add --all                  Copy all clusters

Clusters:
  method            Shipping methodology (atomic-PR, worktree, manual-QA, screenshots)
  pr-screenshots    screenshot.sh + gh-attach + convention doc
  rn-e2e            sim-lock + metro-lock + wdio harness for parallel RN e2e

Options:
  --dest <dir>      Destination root (default: cwd)
  --force           Overwrite existing files
  --dry-run         Print what would be written without writing
`;

try {
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    process.stdout.write(usage);
    process.exit(0);
  }
  if (cmd === 'list') {
    list();
    process.exit(0);
  }
  if (cmd === 'add') {
    await add(rest);
    process.exit(0);
  }
  process.stderr.write(`unknown command: ${cmd}\n\n${usage}`);
  process.exit(2);
} catch (err) {
  process.stderr.write(`error: ${err.message}\n`);
  process.exit(1);
}
