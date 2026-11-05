// Temporary #1702 paired launcher probe. Both arms execute in ONE Bun parent.
// Node outside the probe is solely an independent 600-second tree-kill watchdog.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const json = (file, value) => writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const hash = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

export function readTiming(logDir) {
  const raw = readdirSync(logDir).filter((f) => f.endsWith('-timing.json')).map((file) => ({ file, ...JSON.parse(readFileSync(join(logDir, file), 'utf8')) }));
  const main = raw.filter((r) => r.metadata?.command?.[0] === 'install');
  const timers = main.length === 1 ? main[0].timers ?? {} : {};
  const debug = readdirSync(logDir).filter((f) => f.endsWith('.log')).flatMap((file) => readFileSync(join(logDir, file), 'utf8').split(/\r?\n/));
  return {
    timingFileStatus: main.length === 1 ? 'ONE_INSTALL_TIMER' : `SKIP_AMBIGUOUS_OR_MISSING_INSTALL_TIMER: ${main.length}`,
    npmMs: timers.npm ?? null,
    idealTreeMs: timers.idealTree ?? null,
    unpackIncludingFetchMs: timers['reify:unpack'] ?? null,
    buildIncludingLinksAndScriptsMs: timers['reify:build'] ?? null,
    binLinkTimersMs: Object.fromEntries(Object.entries(timers).filter(([k]) => /^build:(?:.*:)?link(?:$|:)/.test(k))),
    lifecycleTimersMs: Object.fromEntries(Object.entries(timers).filter(([k]) => /build:run:/.test(k))),
    httpLines: debug.filter((l) => /\bhttp (fetch|cache)\b/.test(l)),
    lifecycleLines: debug.filter((l) => /\binfo run\b/.test(l)),
    pureResolutionMs: null, pureDownloadMs: null, pureExtractionMs: null,
    limitation: 'No exclusive resolution/download/extraction partition: idealTree includes metadata fetch; unpack includes fetch/decompression/writes; build includes links/scripts. Absent timers are unavailable, never zero. HTTP requests and nested timers overlap; no sum is a wall-time share.',
    raw,
  };
}

export function distribution(rows, phase, kind) {
  const seconds = rows.filter((r) => r.phase === phase && r.kind === kind && r.status === 0 && !r.timedOut).map((r) => r.seconds).sort((a, b) => a - b);
  const n = seconds.length;
  return { n, min: n ? seconds[0] : null, median: n ? (seconds[Math.floor((n - 1) / 2)] + seconds[Math.floor(n / 2)]) / 2 : null, max: n ? seconds[n - 1] : null, mean: n ? seconds.reduce((a, b) => a + b, 0) / n : null };
}

function pair() {
  if (!process.versions.bun) throw new Error('Both paired arms require the same Bun parent');
  const root = resolve(process.env.MEASURE_ROOT);
  const out = join(root, 'artifacts');
  const node = process.env.MEASURE_NODE;
  const npmCli = process.env.MEASURE_NPM_CLI;
  const arg = process.argv.indexOf('--tarball');
  if (arg < 0 || !process.argv[arg + 1]) throw new Error('--tarball is required');
  const tarball = resolve(process.argv[arg + 1]);
  if (!node || !npmCli || ![node, npmCli, tarball].every(existsSync)) throw new Error('Missing Node, npm CLI or tarball');
  mkdirSync(out, { recursive: true });
  const options = (cwd, env) => ({ cwd, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const read = (exe, args) => {
    const r = spawnSync(exe, args, { ...options(root, process.env), timeout: 15000 });
    if (r.status !== 0) throw new Error(`Prerequisite failed: ${exe}`);
    return r.stdout.trim();
  };
  const manifest = JSON.parse(read('tar.exe', ['-xzOf', tarball, 'package/package.json']));
  const runtime = '@esotericsoftware/spine-core';
  const runtimeVersion = manifest.devDependencies?.[runtime];
  if (!runtimeVersion) throw new Error('Runtime version missing from tarball; refusing to guess');
  const report = { schema: 'paired-bun-npm-launcher/1', result: 'STARTED', packageHead: process.env.MEASURE_HEAD,
    runUrl: `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
    package: { name: manifest.name, version: manifest.version, sha256: hash(tarball), runtimeVersion },
    versions: { parentBun: process.versions.bun, parentExecPath: process.execPath, node: read(node, ['--version']) },
    npmLocations: read('where.exe', ['npm']), node, npmCli,
    runner: { image: process.env.ImageOS, imageVersion: process.env.ImageVersion, arch: process.arch },
    protocol: { replicates: 5, installationCalls: 30, startupCalls: 4, parent: 'Same Bun process and node:child_process.spawnSync implementation',
      arms: { bare: "spawnSync('npm', args, options)", node: 'spawnSync(nodePath, [npmCli, ...args], options)' },
      order: 'Per replicate, alternate first arm; interleave both arms within package/runtime/review stages',
      state: 'Separate initially empty cache and install home for each arm of each replicate; equal directory depth/name length; same tarball; preceding stages warm only that sequence cache',
      options: { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
      instrumentation: { npm_config_timing: 'true', npm_config_loglevel: 'verbose', npm_config_logs_max: '10000' },
      scripts: 'No ignore-scripts or foreground-scripts override; effective defaults recorded; --no-audit --no-fund on every install',
      watchdogSeconds: 600,
      limitation: 'Sampled clean tarball, not 69 original calls or full smoke. Absolute A/B paths differ for isolation; shapes/settings match. OS cache and sequence effects remain; five pairs cannot establish a tail. Same timing injection in both arms.' },
    startup: [], rows: [] };
  report.npmDefaults = Object.fromEntries(['ignore-scripts', 'foreground-scripts', 'registry', 'prefer-offline', 'prefer-online'].map(k => [k, read(node, [npmCli, 'config', 'get', k])]));
  const save = () => json(join(out, 'report.json'), report);
  const start = performance.now();
  const end = start + 600000;
  function run(arm, args, cwd, cache, temp, tag, phase, kind, replicate) {
    const logs = join(out, tag);
    for (const d of [cwd, cache, temp, logs]) mkdirSync(d, { recursive: true });
    const overrides = { TEMP: temp, TMP: temp, TMPDIR: temp, npm_config_cache: cache, npm_config_logs_dir: logs,
      npm_config_logs_max: '10000', npm_config_timing: 'true', npm_config_loglevel: 'verbose' };
    const env = { ...process.env, ...overrides };
    const row = { arm, phase, kind, replicate, args, cwd, environmentOverrides: overrides, status: null };
    (phase === 'startup' ? report.startup : report.rows).push(row);
    save();
    const remaining = Math.floor(end - performance.now());
    if (remaining <= 0) throw new Error('CENSORED_GLOBAL_LIMIT');
    // Same capture/options as install_smoke.run(). Bare npm does NOT enter its
    // .cmd/.bat-only shell branch. The timeout is an equal guard on both arms.
    const opts = { ...options(cwd, env), timeout: remaining };
    console.log(`START ${tag} ${JSON.stringify(args)}`);
    const before = performance.now();
    const r = arm === 'bare' ? spawnSync('npm', args, opts) : spawnSync(node, [npmCli, ...args], opts);
    row.seconds = (performance.now() - before) / 1000;
    row.status = typeof r.status === 'number' ? r.status : 1;
    row.signal = r.signal; row.error = r.error?.message ?? null;
    // Exactly the original run() status/output interpretation; all streams are
    // saved only AFTER timing, and neither arm streams output to a file in spawn.
    const stdout = typeof r.stdout === 'string' ? r.stdout : '';
    const stderr = typeof r.stderr === 'string' ? r.stderr : '';
    writeFileSync(join(logs, 'stdout.txt'), stdout);
    writeFileSync(join(logs, 'stderr.txt'), stderr);
    row.timing = readTiming(logs);
    if (existsSync(join(cwd, 'package-lock.json'))) writeFileSync(join(logs, 'package-lock.json'), readFileSync(join(cwd, 'package-lock.json')));
    save();
    console.log(`END ${tag} ${row.seconds.toFixed(6)}s status=${row.status}`);
    if (row.status !== 0) throw new Error(`STOP_COMMAND: ${tag}`);
    return { row, stdout, stderr };
  }
  try {
    for (let rep = 1; rep <= 2; rep++) for (const arm of rep % 2 ? ['bare', 'node'] : ['node', 'bare']) {
      const base = join(root, 'startup', `rep-${rep}`, arm);
      const got = run(arm, ['--version'], join(base, 'empty'), join(base, 'cache'), join(base, 'temp'), `startup-${rep}-${arm}`, 'startup', 'version', rep);
      got.row.npmVersion = got.stdout.trim();
    }
    const versions = [...new Set(report.startup.map(r => r.npmVersion))];
    if (versions.length !== 1) throw new Error('NPM_VERSION_MISMATCH');
    report.versions.npm = versions[0];
    for (let rep = 1; rep <= 5; rep++) {
      const arms = rep % 2 ? ['bare', 'node'] : ['node', 'bare'];
      const states = Object.fromEntries(arms.map(arm => {
        const base = join(root, 'installs', `rep-${rep}`, arm);
        const home = join(base, 'empty');
        const cache = join(root, 'caches', `rep-${rep}`, arm);
        if (existsSync(home) || existsSync(cache)) throw new Error('OUTPUT_REUSE_REFUSED');
        mkdirSync(home, { recursive: true });
        json(join(home, 'package.json'), { name: 'rigc-install-smoke', private: true, version: '0.0.0' });
        return [arm, { home, cache, temp: join(base, 'temp') }];
      }));
      for (const kind of ['package', 'runtime', 'review']) for (const arm of arms) {
        const { home, cache, temp } = states[arm];
        let target, args;
        if (kind === 'package') { target = manifest.name; args = ['install', tarball, '--no-audit', '--no-fund']; }
        if (kind === 'runtime') { target = runtime; args = ['install', `${runtime}@${runtimeVersion}`, '--no-save', '--no-audit', '--no-fund']; }
        if (kind === 'review') {
          rmSync(join(home, 'node_modules', '@esotericsoftware'), { recursive: true, force: true });
          const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.rigc;
          if (!bin) throw new Error('No rigc bin in shared tarball');
          const refusal = spawnSync(node, [join(home, 'node_modules', ...manifest.name.split('/'), bin), 'review', 'check', 'build'], { ...options(home, process.env), timeout: 15000 });
          const named = /REVIEW_NOT_INSTALLED: (\S+) is not installed/.exec(refusal.stderr ?? '');
          json(join(out, `refusal-${rep}-${arm}.json`), { status: refusal.status, stdout: refusal.stdout, stderr: refusal.stderr });
          if (refusal.status !== 2 || !named) throw new Error('Cannot derive review target from installed shim refusal');
          target = named[1]; args = ['install', '-D', target, '--no-audit', '--no-fund'];
        }
        const { row } = run(arm, args, home, cache, temp, `${rep}-${kind}-${arm}`, 'measured', kind, rep);
        const installed = join(home, 'node_modules', ...target.split('/'), 'package.json');
        if (!existsSync(installed)) throw new Error('Install exited zero without target package manifest');
        row.installedVersion = JSON.parse(readFileSync(installed, 'utf8')).version;
        save();
      }
    }
    report.result = 'PAIRED_COMPLETE';
  } catch (error) { report.result = 'INCOMPLETE_OR_FAILED'; report.error = String(error); process.exitCode = 1; }
  report.secondsIncludingProbes = (performance.now() - start) / 1000;
  report.pairs = [];
  for (const kind of ['package', 'runtime', 'review']) for (let replicate = 1; replicate <= 5; replicate++) {
    const rows = report.rows.filter(r => r.kind === kind && r.replicate === replicate);
    const a = rows.find(r => r.arm === 'bare'), b = rows.find(r => r.arm === 'node');
    if (a?.status === 0 && b?.status === 0 && a.installedVersion && b.installedVersion) report.pairs.push({ kind, replicate, order: rows.map(r => r.arm), bareSeconds: a.seconds, nodeSeconds: b.seconds, bareMinusNodeSeconds: a.seconds - b.seconds, sameInstalledVersion: a.installedVersion === b.installedVersion });
  }
  if (report.result === 'PAIRED_COMPLETE' && (report.rows.length !== 30 || report.pairs.length !== 15 || report.pairs.some(p => !p.sameInstalledVersion))) { report.result = 'WORKLOAD_MISMATCH'; process.exitCode = 1; }
  save();
  const lines = ['## Same-Bun-parent launcher pairs', '', `Result: ${report.result}. Package SHA-256: ${report.package.sha256}.`, '', '| Kind | Replicate | First arm | Bare npm (s) | Node CLI (s) | Difference (s) |', '| --- | ---: | --- | ---: | ---: | ---: |', ...report.pairs.map(p => `| ${p.kind} | ${p.replicate} | ${p.order[0]} | ${p.bareSeconds.toFixed(6)} | ${p.nodeSeconds.toFixed(6)} | ${p.bareMinusNodeSeconds.toFixed(6)} |`), '', 'Both arms capture output synchronously under Bun; raw npm timing intervals overlap. Sampled workload only.'];
  writeFileSync(join(out, 'summary.md'), lines.join('\n') + '\n');
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
}

async function watchdog() {
  const out = join(resolve(process.env.MEASURE_ROOT), 'artifacts');
  mkdirSync(out, { recursive: true });
  const child = spawn('bun.exe', [fileURLToPath(import.meta.url), '--pair', ...process.argv.slice(2)], { stdio: 'inherit', env: process.env, windowsHide: true });
  await new Promise((done, reject) => {
    const timer = setTimeout(() => {
      const killed = child.pid ? spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { encoding: 'utf8', timeout: 10000 }) : null;
      json(join(out, 'watchdog.json'), { result: 'CENSORED_600_SECONDS', pid: child.pid, killStatus: killed?.status, stdout: killed?.stdout, stderr: killed?.stderr });
      // Exit even if Windows refused the kill; the job also has a 13-minute cap.
      process.exit(124);
    }, 600000);
    child.on('error', e => { clearTimeout(timer); reject(e); });
    child.on('close', code => { clearTimeout(timer); process.exitCode = code ?? 1; done(); });
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.platform !== 'win32' || process.env.GITHUB_ACTIONS !== 'true') { console.error('Hosted Windows diagnostic only'); process.exitCode = 1; }
  else if (process.argv.includes('--pair')) pair();
  else watchdog().catch(error => { console.error(error); process.exitCode = 1; });
}
