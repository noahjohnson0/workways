#!/usr/bin/env node
// sim-lock — coordinate iOS simulator usage across worktrees / Claude sessions.
//
// Subcommands: list | status <udid> | acquire <udid> | release <udid> |
//              claim-any | discover | for-worktree
//
// Pool: auto-discovered via `xcrun simctl list devices available --json`
// (iPhone-family sims with installed runtimes). Override by writing
// ~/.cumbre/sim-pool.json: { "sims": [{ "udid": "...", "name": "..." }, ...] }.

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import {
  CUMBRE_DIR, createLockManager, pidAlive, gitBranch, processTty,
  isTty, prompt, runWithHeartbeat,
} from '../lib/lockfile.mjs';

const POOL_FILE = path.join(CUMBRE_DIR, 'sim-pool.json');

const argv = process.argv.slice(2);
const cmd = argv[0];

function die(msg, code = 1) {
  process.stderr.write(`sim-lock: ${msg}\n`);
  process.exit(code);
}

const validUdid = (k) => /^[A-Z0-9-]{8,}$/i.test(k);
const mgr = createLockManager({ dir: 'sim-locks', validateKey: validUdid });

function flag(name) { const i = argv.indexOf(name); return i === -1 ? undefined : argv[i + 1]; }
function bool(name) { return argv.includes(name); }

function simctlName(udid) {
  try {
    const j = JSON.parse(execSync('xcrun simctl list devices --json', { stdio: ['ignore', 'pipe', 'ignore'] }).toString());
    for (const devs of Object.values(j.devices)) {
      for (const dev of devs) if (dev.udid?.toLowerCase() === udid.toLowerCase()) return dev.name;
    }
  } catch {}
  return null;
}

function readPoolFile() {
  try {
    const j = JSON.parse(fs.readFileSync(POOL_FILE, 'utf8'));
    if (!Array.isArray(j.sims)) die(`${POOL_FILE} missing "sims" array`);
    return j.sims;
  } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}

function discoverSims({ family = 'iPhone' } = {}) {
  try {
    const j = JSON.parse(execSync('xcrun simctl list devices available --json',
      { stdio: ['ignore', 'pipe', 'ignore'] }).toString());
    const out = [];
    for (const [runtime, devs] of Object.entries(j.devices)) {
      if (!/iOS-/.test(runtime)) continue;
      for (const dev of devs) {
        if (!dev.isAvailable) continue;
        if (!new RegExp(family, 'i').test(dev.name)) continue;
        out.push({ udid: dev.udid, name: dev.name, runtime });
      }
    }
    return out;
  } catch { return []; }
}

const resolvePool = () => readPoolFile() ?? discoverSims();

function listInstalledIosRuntimes() {
  try {
    const j = JSON.parse(execSync('xcrun simctl list runtimes --json', { stdio: ['ignore', 'pipe', 'ignore'] }).toString());
    return (j.runtimes ?? []).filter(r => r.isAvailable && /iOS/.test(r.name ?? r.identifier ?? ''));
  } catch { return []; }
}

function newestRuntimeIdentifier() {
  const rts = listInstalledIosRuntimes();
  if (rts.length === 0) return null;
  rts.sort((a, b) => (b.version ?? '').localeCompare(a.version ?? '', undefined, { numeric: true }));
  return rts[0].identifier;
}

function newestIphoneDeviceType() {
  try {
    const j = JSON.parse(execSync('xcrun simctl list runtimes --json', { stdio: ['ignore', 'pipe', 'ignore'] }).toString());
    const types = new Set();
    for (const r of j.runtimes ?? []) {
      for (const t of r.supportedDeviceTypes ?? []) {
        if (t.productFamily === 'iPhone') types.add(JSON.stringify({ id: t.identifier, name: t.name }));
      }
    }
    const arr = [...types].map(s => JSON.parse(s));
    return arr.find(t => /^iPhone \d+$/i.test(t.name)) ?? arr[0] ?? null;
  } catch { return null; }
}

async function ensureIosRuntime() {
  if (listInstalledIosRuntimes().length > 0) return true;
  process.stderr.write('[sim-lock] no iOS simulator runtime installed.\n');
  if (!isTty()) { process.stderr.write('  Run manually: xcodebuild -downloadPlatform iOS\n'); return false; }
  const ans = (await prompt('[sim-lock] Download iOS runtime now (multi-GB, slow)? [y/N] ')).toLowerCase();
  if (ans !== 'y' && ans !== 'yes') return false;
  await runWithHeartbeat('sim-lock download iOS runtime', 'xcodebuild', ['-downloadPlatform', 'iOS']);
  return listInstalledIosRuntimes().length > 0;
}

async function createIphoneSim(name) {
  const dt = newestIphoneDeviceType();
  const rt = newestRuntimeIdentifier();
  if (!dt || !rt) die('no iPhone device type / iOS runtime available after install attempt');
  const finalName = name ?? dt.name ?? 'iPhone';
  process.stderr.write(`[sim-lock] creating sim "${finalName}" (${dt.id}, ${rt})\n`);
  const udid = execSync(
    `xcrun simctl create ${JSON.stringify(finalName)} ${JSON.stringify(dt.id)} ${JSON.stringify(rt)}`,
    { stdio: ['ignore', 'pipe', 'inherit'] },
  ).toString().trim();
  return { udid, name: finalName, runtime: rt };
}

async function provisionFlow(reason) {
  process.stderr.write(`[sim-lock] ${reason}\n`);
  if (!isTty()) {
    process.stderr.write('  Non-interactive. To provision manually:\n');
    process.stderr.write('    xcodebuild -downloadPlatform iOS    # if no runtime installed\n');
    process.stderr.write('    xcrun simctl create "iPhone 16" "com.apple.CoreSimulator.SimDeviceType.iPhone-16" <runtime-id>\n');
    return null;
  }
  if (!(await ensureIosRuntime())) return null;
  const ans = (await prompt('[sim-lock] Create a new iPhone simulator now? [Y/n] ')).toLowerCase();
  if (ans === 'n' || ans === 'no') return null;
  return await createIphoneSim();
}

// ---------- commands ----------

function cmdList() {
  const all = mgr.listAll();
  if (all.length === 0) { console.log('(no locks held)'); return; }
  for (const { key: udid, lock: l } of all) {
    const alive = pidAlive(l.pid);
    const name = simctlName(udid) ?? l.name ?? '?';
    const age = Math.round((Date.now() - new Date(l.started).getTime()) / 1000);
    console.log(
      `${udid}  [${name}]  pid=${l.pid}${alive ? '' : ' (STALE)'}  ` +
      `branch=${l.branch ?? '?'}  age=${age}s  worktree=${l.worktree ?? '?'}`,
    );
  }
}

function cmdStatus(udid) {
  if (!udid) die('usage: sim-lock status <udid>');
  const l = mgr.readLock(udid);
  if (!l) { console.log(`${udid}: free`); process.exit(0); }
  if (!pidAlive(l.pid)) { console.log(`${udid}: stale (pid ${l.pid} dead)`); process.exit(2); }
  console.log(`${udid}: held by pid ${l.pid} branch=${l.branch ?? '?'} worktree=${l.worktree ?? '?'}`);
  process.exit(3);
}

function doAcquire(udid, { quiet = false } = {}) {
  const pid = parseInt(flag('--pid') ?? String(process.ppid), 10);
  if (!Number.isFinite(pid) || pid <= 0) die(`bad --pid: ${pid}`);
  const force = bool('--force');
  const label = flag('--label');
  const cwd = process.cwd();
  const payload = {
    pid,
    worktree: cwd,
    branch: gitBranch(cwd),
    label: label ?? null,
    name: simctlName(udid),
    claudeSessionId: process.env.CLAUDE_CODE_SESSION_ID ?? null,
    tty: processTty(pid),
    started: new Date().toISOString(),
  };
  const r = mgr.acquire(udid, payload, { force });
  if (!r.ok) {
    const h = r.holder;
    die(`held by pid ${h.pid} (branch=${h.branch ?? '?'} worktree=${h.worktree ?? '?'}). Re-run with --force to override.`, 3);
  }
  if (!quiet) process.stderr.write(`acquired ${udid} (pid=${pid})\n`);
}

function cmdAcquire(udid) {
  if (!udid) die('usage: sim-lock acquire <udid> [--pid N] [--label X] [--force]');
  doAcquire(udid);
}

function cmdRelease(udid) {
  if (!udid) die('usage: sim-lock release <udid> [--pid N] [--force]');
  const pid = parseInt(flag('--pid') ?? String(process.ppid), 10);
  const force = bool('--force');
  const r = mgr.release(udid, pid, { force });
  if (!r.ok) die(`not the holder (lock pid=${r.holder.pid}, you=${pid}). Use --force to override.`, 3);
  if (r.already) console.log(`${udid}: already free`);
  else process.stderr.write(`released ${udid}\n`);
}

function cmdForSession() {
  const found = mgr.forSession();
  if (!found) process.exit(1);
  const { key: udid, lock } = found;
  process.stdout.write(`${lock.name ?? simctlName(udid) ?? udid}\n`);
}

function cmdDiscover() {
  const sims = discoverSims();
  if (sims.length === 0) { process.stderr.write('(no iPhone sims found)\n'); process.exit(1); }
  for (const s of sims) process.stdout.write(`${s.udid}  ${s.name}  (${s.runtime})\n`);
}

async function cmdClaimAny() {
  const noProvision = bool('--no-provision');
  let sims = resolvePool();

  const tryClaim = () => {
    for (const sim of sims) {
      const l = mgr.readLock(sim.udid);
      if (!l || !pidAlive(l.pid)) {
        doAcquire(sim.udid);
        process.stdout.write(`UDID=${sim.udid}\n`);
        return true;
      }
    }
    return false;
  };

  if (tryClaim()) return;
  if (noProvision) die('no free sim available (--no-provision set)', 4);

  if (sims.length > 0) {
    process.stderr.write('[sim-lock] all candidate sims busy:\n');
    for (const sim of sims) {
      const l = mgr.readLock(sim.udid);
      if (l && pidAlive(l.pid)) {
        process.stderr.write(`  ${sim.name ?? sim.udid}: branch=${l.branch ?? '?'} worktree=${l.worktree ?? '?'}\n`);
      }
    }
  }

  const reason = sims.length === 0 ? 'no iPhone simulators found on this machine.' : 'all candidate simulators are held.';
  const fresh = await provisionFlow(reason);
  if (!fresh) die('no free sim available and provisioning declined/failed', 4);
  sims = [fresh, ...sims];
  if (tryClaim()) return;
  die('provisioned a sim but failed to claim it (unexpected)', 5);
}

// ---------- dispatch ----------

(async () => {
  switch (cmd) {
    case 'list': cmdList(); break;
    case 'status': cmdStatus(argv[1]); break;
    case 'acquire': cmdAcquire(argv[1]); break;
    case 'release': cmdRelease(argv[1]); break;
    case 'claim-any': await cmdClaimAny(); break;
    case 'for-session':
    case 'for-worktree': cmdForSession(); break;
    case 'discover': cmdDiscover(); break;
    default:
      process.stderr.write(
        'usage: sim-lock <cmd> [args]\n' +
        '  list                            show current locks\n' +
        '  status <udid>                   exit 0=free, 2=stale, 3=held\n' +
        '  acquire <udid> [--pid N] [--label X] [--force]\n' +
        '  release <udid> [--pid N] [--force]\n' +
        '  claim-any [--no-provision]      auto-discover iPhone sims; prompts to create more on TTY\n' +
        '  discover                        list discovered iPhone sims (no locking)\n' +
        '  for-session                     print sim name held by a lock in this terminal session (exit 1 if none)\n' +
        '  for-worktree                    deprecated alias for for-session\n',
      );
      process.exit(cmd ? 1 : 0);
  }
})().catch(e => die(e?.message ?? String(e)));
