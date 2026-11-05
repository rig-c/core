// Temporary #1702 2x2 target/temp and npm-cache location control.
// Node outside the probe is solely an independent 600-second tree-kill watchdog.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
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
  if (!process.versions.bun) throw new Error('Root control requires the original Bun parent');
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
  const originalTemp = resolve(tmpdir());
  // This reads actual runner configuration; no assumed historical npm-cache path.
  // The query may itself create a debug log, so the snapshot below says so.
  const originalCache = resolve(read('npm', ['config', 'get', 'cache']));
  const token = `rigc-root-control-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`;
  const targets = { original: join(originalTemp, token), relocated: join(root, 'targets', token) };
  const caches = { original: join(originalCache, token), relocated: join(root, 'caches', token) };
  const arms = [
    { name: 'base', targetTempD: false, cacheD: false },
    { name: 'temp', targetTempD: true, cacheD: false },
    { name: 'cach', targetTempD: false, cacheD: true },
    { name: 'both', targetTempD: true, cacheD: true },
  ];
  const report = { schema: 'paired-windows-roots/1', result: 'STARTED', packageHead: process.env.MEASURE_HEAD,
    runUrl: `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
    package: { name: manifest.name, version: manifest.version, sha256: hash(tarball), runtimeVersion },
    versions: { parentBun: process.versions.bun, parentExecPath: process.execPath, node: read(node, ['--version']), npm: read('npm', ['--version']) },
    npmLocations: read('where.exe', ['npm']), node, npmCli,
    runner: { image: process.env.ImageOS, imageVersion: process.env.ImageVersion, arch: process.arch },
    originalDefaults: { osTmpdir: originalTemp, npmCache: originalCache,
      tempEnvironment: Object.fromEntries(Object.entries(process.env).filter(([k]) => ['TEMP','TMP','TMPDIR'].includes(k.toUpperCase()))),
      cacheSnapshotAfterConfigProbe: { exists: existsSync(originalCache), cacacheExists: existsSync(join(originalCache, '_cacache')), logsExist: existsSync(join(originalCache, '_logs')) },
      note: 'Default cache contents are retained, not cleared or consumed by samples. Initial-state snapshot follows one npm config query, which may create a log. Historical cache location/content and exact TEMP variable values were not logged.' },
    historicalEvidence: { job: 'https://github.com/rig-c/core/actions/runs/42051220785/job/127327516071', installRootObserved: 'C: runner profile AppData/Local/Temp/rigc-smoke-*', cacheLocation: 'UNAVAILABLE' },
    protocol: { replicates: 4, installationCalls: 48, arms, targets, caches,
      launcher: "Same Bun parent: spawnSync('npm', args, options); no explicit Node launcher arm",
      order: 'Four Latin rotations of base/temp/cach/both; interleave arms within each package/runtime/review stage',
      state: 'Each replicate/arm starts with its own empty project and empty cache; cache persists only across its package/runtime/review sequence. Original-location cache children never read the existing default cache contents.',
      options: { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }, watchdogSeconds: 600,
      instrumentation: { npm_config_timing: 'true', npm_config_loglevel: 'verbose', npm_config_logs_max: '10000' },
      scripts: 'No ignore-scripts or foreground-scripts override; effective defaults recorded. Every install uses --no-audit --no-fund.',
      limitation: 'Target directory and TEMP/TMP/TMPDIR relocation form ONE combined factor; cache location is the independent second factor. This is location-matched cold state, not exact historical/default cache contents. Tarball and logs stay on runner temp in every arm; historical tarballs were packed below their case root. Folder length, OS cache, policies and physical devices are not separately isolated. Sampled clean tarball, not 69 calls/full smoke.' },
    rows: [] };
  report.npmDefaults = Object.fromEntries(['ignore-scripts', 'foreground-scripts', 'registry', 'prefer-offline', 'prefer-online'].map(k => [k, read('npm', ['config', 'get', k])]));
  const save = () => json(join(out, 'report.json'), report);
  const start = performance.now(), end = start + 600000;
  function environment(state, logs) {
    const overrides = { npm_config_cache: state.cache, npm_config_logs_dir: logs,
      npm_config_logs_max: '10000', npm_config_timing: 'true', npm_config_loglevel: 'verbose' };
    if (state.arm.targetTempD) Object.assign(overrides, { TEMP: state.temp, TMP: state.temp, TMPDIR: state.temp });
    return { overrides, env: { ...process.env, ...overrides } };
  }
  function install(state, args, kind, replicate) {
    const { arm, home, cache, temp } = state;
    const tag = `${replicate}-${kind}-${arm.name}`, logs = join(out, tag);
    for (const d of [home, cache, temp, logs]) mkdirSync(d, { recursive: true });
    const { env, overrides } = environment(state, logs);
    const row = { arm: arm.name, targetTempD: arm.targetTempD, cacheD: arm.cacheD, phase: 'measured', kind, replicate, args, cwd: home,
      environmentOverrides: overrides, inheritedTempEnvironment: report.originalDefaults.tempEnvironment, status: null };
    report.rows.push(row); save();
    const remaining = Math.floor(end - performance.now());
    if (remaining <= 0) throw new Error('CENSORED_GLOBAL_LIMIT');
    console.log(`START ${tag} ${JSON.stringify(args)}`);
    const before = performance.now();
    const r = spawnSync('npm', args, { ...options(home, env), timeout: remaining });
    row.seconds = (performance.now() - before) / 1000;
    row.status = typeof r.status === 'number' ? r.status : 1;
    row.signal = r.signal; row.error = r.error?.message ?? null;
    writeFileSync(join(logs, 'stdout.txt'), typeof r.stdout === 'string' ? r.stdout : '');
    writeFileSync(join(logs, 'stderr.txt'), typeof r.stderr === 'string' ? r.stderr : '');
    row.timing = readTiming(logs);
    if (existsSync(join(home, 'package-lock.json'))) writeFileSync(join(logs, 'package-lock.json'), readFileSync(join(home, 'package-lock.json')));
    save();
    console.log(`END ${tag} ${row.seconds.toFixed(6)}s status=${row.status}`);
    if (row.status !== 0) throw new Error(`STOP_INSTALL: ${tag}`);
    return row;
  }
  try {
    for (let rep = 1; rep <= 4; rep++) {
      const offset = rep - 1, order = [...arms.slice(offset), ...arms.slice(0, offset)];
      const states = Object.fromEntries(order.map(arm => {
        const base = join(arm.targetTempD ? targets.relocated : targets.original, `rep-${rep}`, arm.name);
        const home = join(base, 'empty');
        const cache = join(arm.cacheD ? caches.relocated : caches.original, `rep-${rep}`, arm.name);
        if (existsSync(home) || existsSync(cache)) throw new Error('OUTPUT_REUSE_REFUSED');
        mkdirSync(home, { recursive: true });
        json(join(home, 'package.json'), { name: 'rigc-install-smoke', private: true, version: '0.0.0' });
        return [arm.name, { arm, home, cache, temp: join(base, 'temp') }];
      }));
      for (const kind of ['package', 'runtime', 'review']) for (const arm of order) {
        const state = states[arm.name], { home } = state;
        let target, args;
        if (kind === 'package') { target = manifest.name; args = ['install', tarball, '--no-audit', '--no-fund']; }
        if (kind === 'runtime') { target = runtime; args = ['install', `${runtime}@${runtimeVersion}`, '--no-save', '--no-audit', '--no-fund']; }
        if (kind === 'review') {
          rmSync(join(home, 'node_modules', '@esotericsoftware'), { recursive: true, force: true });
          const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.rigc;
          if (!bin) throw new Error('No rigc bin in shared tarball');
          const refusalLogs = join(out, `refusal-${rep}-${arm.name}`);
          mkdirSync(refusalLogs, { recursive: true });
          const { env } = environment(state, refusalLogs);
          const refusal = spawnSync(node, [join(home, 'node_modules', ...manifest.name.split('/'), bin), 'review', 'check', 'build'], { ...options(home, env), timeout: 15000 });
          const named = /REVIEW_NOT_INSTALLED: (\S+) is not installed/.exec(refusal.stderr ?? '');
          json(join(refusalLogs, 'refusal.json'), { status: refusal.status, stdout: refusal.stdout, stderr: refusal.stderr });
          if (refusal.status !== 2 || !named) throw new Error('Cannot derive review target from installed shim refusal');
          target = named[1]; args = ['install', '-D', target, '--no-audit', '--no-fund'];
        }
        const row = install(state, args, kind, rep);
        const installed = join(home, 'node_modules', ...target.split('/'), 'package.json');
        if (!existsSync(installed)) throw new Error('Install exited zero without target manifest');
        row.installedVersion = JSON.parse(readFileSync(installed, 'utf8')).version; save();
      }
    }
    report.result = 'ROOTS_COMPLETE';
  } catch (error) { report.result = 'INCOMPLETE_OR_FAILED'; report.error = String(error); process.exitCode = 1; }
  report.secondsIncludingProbes = (performance.now() - start) / 1000;
  report.contrasts = [];
  for (const kind of ['package', 'runtime', 'review']) for (let replicate = 1; replicate <= 4; replicate++) {
    const rows = report.rows.filter(r => r.kind === kind && r.replicate === replicate);
    const cells = Object.fromEntries(rows.map(r => [r.arm, r]));
    if (arms.every(a => cells[a.name]?.status === 0 && cells[a.name]?.installedVersion)) {
      const v = n => cells[n].seconds;
      report.contrasts.push({ kind, replicate, order: rows.map(r => r.arm), seconds: Object.fromEntries(arms.map(a => [a.name, v(a.name)])),
        targetTempEffectAtOriginalCache: v('temp') - v('base'), targetTempEffectAtDCache: v('both') - v('cach'),
        cacheEffectAtOriginalTemp: v('cach') - v('base'), cacheEffectAtDTemp: v('both') - v('temp'),
        interaction: v('both') - v('temp') - v('cach') + v('base'),
        sameInstalledVersion: new Set(rows.map(r => r.installedVersion)).size === 1 });
    }
  }
  if (report.result === 'ROOTS_COMPLETE' && (report.rows.length !== 48 || report.contrasts.length !== 12 || report.contrasts.some(p => !p.sameInstalledVersion))) { report.result = 'WORKLOAD_MISMATCH'; process.exitCode = 1; }
  save();
  const lines = ['## Target/temp x cache root control', '', `Result: ${report.result}. Package SHA-256: ${report.package.sha256}.`, '', '| Kind | Replicate | base (s) | temp only (s) | cache only (s) | both (s) |', '| --- | ---: | ---: | ---: | ---: | ---: |', ...report.contrasts.map(p => `| ${p.kind} | ${p.replicate} | ${p.seconds.base.toFixed(6)} | ${p.seconds.temp.toFixed(6)} | ${p.seconds.cach.toFixed(6)} | ${p.seconds.both.toFixed(6)} |`), '', 'All arms use original Bun bare npm and synchronous capture. Default-location cache children start empty; existing default cache contents are retained, not reproduced. Raw npm timers overlap.'];
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
