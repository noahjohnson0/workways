import { readdir, mkdir, copyFile, stat, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES = resolve(__dirname, '..', 'templates');

export const CLUSTERS = {
  method: 'Shipping methodology — atomic-PR, ephemeral worktree, manual-QA gate, PR screenshot rule.',
  'pr-screenshots': 'screenshot.sh (capture) + gh-attach (upload + PR body rewrite) + convention doc.',
  'rn-e2e': 'sim-lock + metro-lock + wdio harness for parallel React Native e2e across worktrees.',
};

export function list() {
  for (const [name, desc] of Object.entries(CLUSTERS)) {
    process.stdout.write(`  ${name.padEnd(16)} ${desc}\n`);
  }
}

function parseArgs(argv) {
  const opts = { dest: process.cwd(), force: false, dryRun: false, all: false, clusters: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dest') opts.dest = resolve(argv[++i]);
    else if (a === '--force') opts.force = true;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--all') opts.all = true;
    else if (a.startsWith('--')) throw new Error(`unknown flag: ${a}`);
    else opts.clusters.push(a);
  }
  return opts;
}

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

export async function add(argv) {
  const opts = parseArgs(argv);
  const targets = opts.all ? Object.keys(CLUSTERS) : opts.clusters;
  if (targets.length === 0) throw new Error('specify a cluster (or --all). Run `workways list` to see options.');
  for (const c of targets) {
    if (!CLUSTERS[c]) throw new Error(`unknown cluster: ${c}`);
  }

  for (const cluster of targets) {
    const src = join(TEMPLATES, cluster);
    if (!existsSync(src)) throw new Error(`template missing on disk: ${src}`);
    const files = await walk(src);
    process.stdout.write(`\n[${cluster}] ${files.length} file(s) → ${opts.dest}\n`);
    for (const file of files) {
      const rel = relative(src, file);
      const dest = join(opts.dest, rel);
      const exists = existsSync(dest);
      if (exists && !opts.force) {
        process.stdout.write(`  skip   ${rel} (exists; use --force)\n`);
        continue;
      }
      process.stdout.write(`  ${opts.dryRun ? 'plan ' : 'write'}  ${rel}\n`);
      if (!opts.dryRun) {
        await mkdir(dirname(dest), { recursive: true });
        await copyFile(file, dest);
      }
    }
  }
}
