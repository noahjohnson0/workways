// Shared lockfile primitives for sim-lock and metro-lock.
//
// Each tool passes its own { dir, validateKey } and gets back functions that
// operate on lockfiles under that dir. The lock payload is whatever JSON the
// caller hands to acquire(); the shared code only requires `pid` and `started`.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { execSync, spawn } from 'node:child_process';

export const WORKWAYS_DIR = path.join(os.homedir(), '.workways');

export function pidAlive(pid) {
  if (!pid || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

export function gitBranch(cwd) {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { cwd, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim();
  } catch { return null; }
}

export function gitToplevel(cwd) {
  try {
    return execSync('git rev-parse --show-toplevel', { cwd, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim() || cwd;
  } catch { return cwd; }
}

/**
 * Returns the controlling TTY of a process, e.g. "ttys004". Two terminal
 * windows each have their own pty, so this distinguishes sibling Claude
 * sessions launched from the same directory. Returns null for daemons /
 * background processes without a controlling terminal ("??" from `ps`).
 */
export function processTty(pid) {
  try {
    const out = execSync(`ps -o tty= -p ${pid}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    if (!out || out === '?' || out === '??') return null;
    return out;
  } catch { return null; }
}

export function isTty() { return Boolean(process.stdin.isTTY && process.stdout.isTTY); }

export async function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  try {
    return await new Promise(resolve => rl.question(question, ans => resolve(ans.trim())));
  } finally {
    rl.close();
  }
}

export function fmtElapsed(ms) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export async function runWithHeartbeat(label, cmd, args, intervalMs = 5 * 60 * 1000) {
  process.stderr.write(`[${label}] starting ${cmd} ${args.join(' ')}\n`);
  const start = Date.now();
  const child = spawn(cmd, args, { stdio: 'inherit' });
  const beat = setInterval(() => {
    process.stderr.write(`[${label}] still running (elapsed ${fmtElapsed(Date.now() - start)})\n`);
  }, intervalMs);
  return new Promise((resolve, reject) => {
    child.on('exit', code => {
      clearInterval(beat);
      process.stderr.write(`[${label}] finished (${fmtElapsed(Date.now() - start)}, exit=${code})\n`);
      code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`));
    });
    child.on('error', err => { clearInterval(beat); reject(err); });
  });
}

/**
 * Build a lock manager bound to a directory.
 * @param {object} opts
 * @param {string} opts.dir - directory under ~/.workways to hold lockfiles
 * @param {(key:string)=>boolean} opts.validateKey - reject bad keys early
 */
export function createLockManager({ dir, validateKey }) {
  const lockDir = path.join(WORKWAYS_DIR, dir);

  const ensureDir = () => fs.mkdirSync(lockDir, { recursive: true });

  const lockPath = (key) => {
    if (!key || !validateKey(key)) throw new Error(`invalid key: ${key}`);
    return path.join(lockDir, `${key}.lock`);
  };

  const readLock = (key) => {
    try { return JSON.parse(fs.readFileSync(lockPath(key), 'utf8')); }
    catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  };

  /** Atomic create; on EEXIST, take over only if existing pid is dead or force=true. */
  const acquire = (key, payload, { force = false } = {}) => {
    ensureDir();
    const p = lockPath(key);
    try {
      const fd = fs.openSync(p, 'wx');
      fs.writeSync(fd, JSON.stringify(payload, null, 2));
      fs.closeSync(fd);
      return { ok: true, holder: null };
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const existing = readLock(key);
      if (!force && existing && pidAlive(existing.pid)) {
        return { ok: false, holder: existing };
      }
      fs.writeFileSync(p, JSON.stringify(payload, null, 2));
      return { ok: true, holder: null };
    }
  };

  const release = (key, pid, { force = false } = {}) => {
    const l = readLock(key);
    if (!l) return { ok: true, already: true };
    if (!force && l.pid !== pid) return { ok: false, holder: l };
    try { fs.unlinkSync(lockPath(key)); } catch {}
    return { ok: true, already: false };
  };

  const listAll = () => {
    ensureDir();
    return fs.readdirSync(lockDir)
      .filter(f => f.endsWith('.lock'))
      .map(f => ({ key: f.replace(/\.lock$/, ''), lock: readLock(f.replace(/\.lock$/, '')) }))
      .filter(x => x.lock);
  };

  // Returns the lock held by the *current terminal session*, if any. Two
  // sibling Claude windows in the same directory have different
  // CLAUDE_CODE_SESSION_IDs (and different controlling TTYs as a fallback),
  // so only the window that actually acquired the lock sees it.
  //
  // Match priority: claudeSessionId (when both sides have one) → TTY. If
  // neither identifier is available on either side we conservatively return
  // null rather than guess.
  const forSession = () => {
    const myClaude = process.env.CLAUDE_CODE_SESSION_ID ?? null;
    const myTty = processTty(process.pid);
    for (const { key, lock } of listAll()) {
      if (!pidAlive(lock.pid)) continue;
      if (myClaude && lock.claudeSessionId && lock.claudeSessionId === myClaude) return { key, lock };
      if (myTty && lock.tty && lock.tty === myTty) return { key, lock };
    }
    return null;
  };

  return { lockDir, ensureDir, lockPath, readLock, acquire, release, listAll, forSession };
}
