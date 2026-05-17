#!/usr/bin/env node
// metro-lock — coordinate Metro (React Native dev server) ports across
// worktrees and parallel Claude sessions.
//
// Why: a Debug `.app` baked by `expo run:ios` hard-codes its JS dev URL at
// build time using RCT_METRO_PORT (defaulting to 8081). If two worktrees both
// run `expo run:ios` without port discipline, the second Metro falls back to
// 8082 but the new `.app` still points at 8081 — so worktree B loads
// worktree A's JS. metro-lock keeps that from happening.
//
// Subcommands: list | status <port> | acquire <port> | release <port> |
//              claim-any | for-worktree

import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import {
  WORKWAYS_DIR, createLockManager, pidAlive, gitBranch, processTty,
} from '../lib/lockfile.mjs';

const POOL_FILE = path.join(WORKWAYS_DIR, 'metro-pool.json');
const DEFAULT_POOL = [8081, 8082, 8083, 8084];

const argv = process.argv.slice(2);
const cmd = argv[0];

function die(msg, code = 1) { process.stderr.write(`metro-lock: ${msg}\n`); process.exit(code); }

const validPort = (k) => /^\d+$/.test(k) && +k > 0 && +k < 65536;
const mgr = createLockManager({ dir: 'metro-locks', validateKey: validPort });

function flag(name) { const i = argv.indexOf(name); return i === -1 ? undefined : argv[i + 1]; }
function bool(name) { return argv.includes(name); }

function readPoolFile() {
  try {
    const j = JSON.parse(fs.readFileSync(POOL_FILE, 'utf8'));
    if (!Array.isArray(j.ports)) die(`${POOL_FILE} missing "ports" array`);
    return j.ports.map(Number);
  } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}

const resolvePool = () => readPoolFile() ?? DEFAULT_POOL;

function portFree(port) {
  return new Promise(resolve => {
    const sock = net.createServer();
    sock.once('error', () => resolve(false));
    sock.once('listening', () => sock.close(() => resolve(true)));
    sock.listen(port, '127.0.0.1');
  });
}

function doAcquire(port, { quiet = false } = {}) {
  const pid = parseInt(flag('--pid') ?? String(process.ppid), 10);
  if (!Number.isFinite(pid) || pid <= 0) die(`bad --pid: ${pid}`);
  const force = bool('--force');
  const label = flag('--label');
  const cwd = process.cwd();
  const payload = {
    pid, worktree: cwd, branch: gitBranch(cwd),
    label: label ?? null, port: Number(port),
    claudeSessionId: process.env.CLAUDE_CODE_SESSION_ID ?? null,
    tty: processTty(pid),
    started: new Date().toISOString(),
  };
  const r = mgr.acquire(String(port), payload, { force });
  if (!r.ok) {
    const h = r.holder;
    die(`port ${port} held by pid ${h.pid} (branch=${h.branch ?? '?'} worktree=${h.worktree ?? '?'}). Re-run with --force.`, 3);
  }
  if (!quiet) process.stderr.write(`acquired metro port ${port} (pid=${pid})\n`);
}

function cmdList() {
  const all = mgr.listAll();
  if (all.length === 0) { console.log('(no locks held)'); return; }
  for (const { key: port, lock: l } of all) {
    const alive = pidAlive(l.pid);
    const age = Math.round((Date.now() - new Date(l.started).getTime()) / 1000);
    console.log(
      `port ${port}  pid=${l.pid}${alive ? '' : ' (STALE)'}  branch=${l.branch ?? '?'}  age=${age}s  worktree=${l.worktree ?? '?'}`,
    );
  }
}

function cmdStatus(port) {
  if (!port) die('usage: metro-lock status <port>');
  const l = mgr.readLock(port);
  if (!l) { console.log(`${port}: free`); process.exit(0); }
  if (!pidAlive(l.pid)) { console.log(`${port}: stale (pid ${l.pid} dead)`); process.exit(2); }
  console.log(`${port}: held by pid ${l.pid} branch=${l.branch ?? '?'} worktree=${l.worktree ?? '?'}`);
  process.exit(3);
}

function cmdAcquire(port) {
  if (!port) die('usage: metro-lock acquire <port> [--pid N] [--label X] [--force]');
  doAcquire(port);
}

function cmdRelease(port) {
  if (!port) die('usage: metro-lock release <port> [--pid N] [--force]');
  const pid = parseInt(flag('--pid') ?? String(process.ppid), 10);
  const force = bool('--force');
  const r = mgr.release(String(port), pid, { force });
  if (!r.ok) die(`not the holder (lock pid=${r.holder.pid}, you=${pid}). Use --force to override.`, 3);
  if (r.already) console.log(`${port}: already free`);
  else process.stderr.write(`released metro port ${port}\n`);
}

function cmdForSession() {
  const found = mgr.forSession();
  if (!found) process.exit(1);
  process.stdout.write(`${found.key}\n`);
}

async function cmdClaimAny() {
  const ports = resolvePool();
  for (const port of ports) {
    const l = mgr.readLock(String(port));
    if (l && pidAlive(l.pid)) continue;          // someone else owns it
    if (!(await portFree(port))) continue;       // OS-level bind would fail (other process bound it)
    doAcquire(String(port));
    process.stdout.write(`PORT=${port}\n`);
    return;
  }
  die(`no free port in pool [${ports.join(', ')}]`, 4);
}

(async () => {
  switch (cmd) {
    case 'list': cmdList(); break;
    case 'status': cmdStatus(argv[1]); break;
    case 'acquire': cmdAcquire(argv[1]); break;
    case 'release': cmdRelease(argv[1]); break;
    case 'claim-any': await cmdClaimAny(); break;
    case 'for-session':
    case 'for-worktree': cmdForSession(); break;
    default:
      process.stderr.write(
        'usage: metro-lock <cmd> [args]\n' +
        '  list                            show current locks\n' +
        '  status <port>                   exit 0=free, 2=stale, 3=held\n' +
        '  acquire <port> [--pid N] [--label X] [--force]\n' +
        '  release <port> [--pid N] [--force]\n' +
        '  claim-any                       acquire first free port from pool (default 8081–8084)\n' +
        '  for-session                     print port held by a lock in this terminal session (exit 1 if none)\n' +
        '  for-worktree                    deprecated alias for for-session\n',
      );
      process.exit(cmd ? 1 : 0);
  }
})().catch(e => die(e?.message ?? String(e)));
