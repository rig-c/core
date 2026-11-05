// Temporary #1702 sampled diagnostic. No compiler/build/assertion path is changed.
// Node builtins only; the runner's Bun is used solely to read the installed CLI's
// missing-review refusal, as the original smoke does. No project deps are installed.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const json = (file, value) => writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const hash = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

// Do not add timers together: idealTree can fetch metadata, unpack can download,
// and build includes links AND lifecycle scripts. HTTP durations overlap as well.
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

async function main() {
  if (process.platform !== 'win32' || process.env.GITHUB_ACTIONS !== 'true') throw new Error('Hosted Windows diagnostic only; use exported pure readers for local validation');
  const mode = process.env.MEASURE_MODE;
  if (!['cold', 'warm', 'excluded'].includes(mode)) throw new Error('MEASURE_MODE must be cold, warm or excluded');
  const root = resolve(process.env.MEASURE_ROOT);
  const out = join(root, 'artifacts');
  const installs = join(root, 'installs');
  const caches = join(root, 'caches'); // Deliberately outside the Defender exclusion.
  const tarball = resolve(process.argv[process.argv.indexOf('--tarball') + 1]);
  const npmCli = process.env.MEASURE_NPM_CLI;
  if (!npmCli || !existsSync(npmCli) || !existsSync(tarball)) throw new Error('Missing npm CLI or shared tarball');
  for (const p of [out, installs, caches]) mkdirSync(p, { recursive: true });
  const command = (exe, args, cwd = root) => spawnSync(exe, args, { cwd, encoding: 'utf8', timeout: 15000 });
  const version = (exe, args) => {
    const r = command(exe, args);
    if (r.status !== 0) throw new Error(`Version probe failed: ${exe}`);
    return r.stdout.trim();
  };
  const readManifest = command('tar.exe', ['-xzOf', tarball, 'package/package.json']);
  if (readManifest.status !== 0) throw new Error('Cannot read the shared tarball manifest');
  const manifest = JSON.parse(readManifest.stdout);
  const runtimeName = '@esotericsoftware/spine-core';
  const runtimeVersion = manifest.devDependencies?.[runtimeName];
  if (!runtimeVersion) throw new Error('Tarball declares no runtime version; refusing to guess');
  const envFor = (cache, logs, temp) => ({ ...process.env, TEMP: temp, TMP: temp, TMPDIR: temp,
    npm_config_cache: cache, npm_config_logs_dir: logs, npm_config_logs_max: '10000',
    npm_config_timing: 'true', npm_config_loglevel: 'verbose' });
  const rows = [];
  const report = {
    schema: 'sampled-windows-install/1', mode, sampled: true,
    eventSha: process.env.GITHUB_SHA, // PR merge ref; head below is the actual checkout/pack source.
    packageHead: process.env.MEASURE_HEAD,
    runUrl: `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
    jobName: `measure (${mode})`, runAttempt: process.env.GITHUB_RUN_ATTEMPT,
    versions: { node: process.version, npm: version(process.execPath, [npmCli, '--version']), bun: version('bun.exe', ['--version']) },
    runner: { image: process.env.ImageOS, imageVersion: process.env.ImageVersion, arch: process.arch, cpu: cpus()[0]?.model, cpuCount: cpus().length },
    package: { name: manifest.name, version: manifest.version, sha256: hash(tarball), runtimeName, runtimeVersion },
    protocol: { samples: 5, callsPerSample: 3, measuredCalls: 15, warmupCalls: mode === 'warm' ? 15 : 0,
      cache: mode === 'warm' ? 'One initially empty cache for all prewarm and measured calls; all install targets reset between phases' : 'New empty npm cache per sample, shared only within package/runtime/review sequence',
      runtimeRemovedBeforeReview: true, installRoot: installs, cacheRoot: caches,
      npmEntry: [process.execPath, npmCli], audit: 'false via --no-audit', fund: 'false via --no-fund',
      launcherLimitation: 'Invokes the runner npm-cli.js with Node directly instead of the original Bun spawn of bare npm; argv and install semantics are retained, launcher overhead differs. Verbose/timing instrumentation also has a cost.',
      scripts: 'npm defaults retained: ignore-scripts/foreground-scripts not overridden; effective values recorded below',
      phaseLimitSeconds: mode === 'warm' ? 300 : 600,
      limitation: '15 sampled clean-package installs, not the 69-call plant battery or smoke assertions. Within each cold sample only package starts with a cold npm cache; runtime/review share preceding cache effects. Five samples do not establish a tail or causal attribution. OS disk cache is uncontrolled; configured Defender exclusion does not prove scanning changed.' },
    rows,
  };
  // Query only relevant npm settings, never dump the environment or auth config.
  report.npmDefaults = Object.fromEntries(['ignore-scripts', 'foreground-scripts', 'registry', 'prefer-offline', 'prefer-online', 'fetch-retries'].map((key) => [key, version(process.execPath, [npmCli, 'config', 'get', key])]));
  json(join(out, 'report.json'), report);
  const sampleHome = (phase, sample) => join(installs, `${phase}-${sample}`, 'empty');
  async function install(phase, sample, kind, argv, home, cache, deadline, targetName) {
    const tag = `${phase}-${sample}-${kind}`;
    const logs = join(out, tag);
    const temp = join(installs, `${phase}-${sample}`, 'temp');
    for (const p of [logs, temp, cache]) mkdirSync(p, { recursive: true });
    const row = { phase, sample, kind, argv, cwd: home, cache,
      environmentOverrides: Object.fromEntries(Object.entries(envFor(cache, logs, temp)).filter(([k]) => k.startsWith('npm_config_') || ['TEMP', 'TMP', 'TMPDIR'].includes(k))),
      status: null, timedOut: false };
    rows.push(row);
    json(join(out, 'report.json'), report); // Preserve attempted calls if interrupted.
    const remaining = deadline - performance.now();
    if (remaining <= 0) throw new Error('CENSORED_PHASE_LIMIT');
    const stdout = openSync(join(logs, 'stdout.txt'), 'w');
    const stderr = openSync(join(logs, 'stderr.txt'), 'w');
    const before = performance.now();
    console.log(`START ${tag} ${JSON.stringify(argv)}`);
    try {
      await new Promise((done, reject) => {
        const child = spawn(process.execPath, [npmCli, ...argv], { cwd: home, env: envFor(cache, logs, temp), stdio: ['ignore', stdout, stderr], windowsHide: true });
        const timer = setTimeout(() => {
          row.timedOut = true;
          if (child.pid) {
            const killed = spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { encoding: 'utf8', timeout: 10000 });
            row.killStatus = killed.status;
          }
        }, remaining);
        child.on('error', (error) => { clearTimeout(timer); reject(error); });
        child.on('close', (code, signal) => { clearTimeout(timer); row.status = code; row.signal = signal; done(); });
      });
    } finally {
      row.seconds = (performance.now() - before) / 1000;
      closeSync(stdout); closeSync(stderr);
      row.timing = readTiming(logs);
      const installed = join(home, 'node_modules', ...targetName.split('/'), 'package.json');
      row.installedVersion = existsSync(installed) ? JSON.parse(readFileSync(installed, 'utf8')).version : null;
      if (existsSync(join(home, 'package-lock.json'))) {
        const lock = join(home, 'package-lock.json');
        row.lockSha256 = hash(lock);
        writeFileSync(join(logs, 'package-lock.json'), readFileSync(lock));
      }
      json(join(out, 'report.json'), report);
      console.log(`END ${tag} ${row.seconds.toFixed(6)}s status=${row.status} timedOut=${row.timedOut}`);
    }
    if (row.timedOut || row.status !== 0 || !row.installedVersion) throw new Error(`STOP_INSTALL: ${tag}`);
  }
  try {
    for (const phase of mode === 'warm' ? ['prewarm', 'measured'] : ['measured']) {
      const phaseStart = performance.now();
      const deadline = phaseStart + report.protocol.phaseLimitSeconds * 1000;
      for (let sample = 1; sample <= 5; sample++) {
        const home = sampleHome(phase, sample);
        const cache = join(caches, mode === 'warm' ? 'shared' : `sample-${sample}`);
        if (existsSync(home) || ((mode !== 'warm' || (phase === 'prewarm' && sample === 1)) && existsSync(cache))) throw new Error('OUTPUT_REUSE_REFUSED');
        mkdirSync(home, { recursive: true });
        json(join(home, 'package.json'), { name: 'rigc-install-smoke', private: true, version: '0.0.0' });
        await install(phase, sample, 'package', ['install', tarball, '--no-audit', '--no-fund'], home, cache, deadline, manifest.name);
        await install(phase, sample, 'runtime', ['install', `${runtimeName}@${runtimeVersion}`, '--no-save', '--no-audit', '--no-fund'], home, cache, deadline, runtimeName);
        // Match smoke's review-install context: remove the optional runtime first.
        rmSync(join(home, 'node_modules', '@esotericsoftware'), { recursive: true, force: true });
        const shipped = join(home, 'node_modules', ...manifest.name.split('/'));
        const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.rigc;
        if (!bin) throw new Error('Shared package declares no rigc bin');
        const refusal = command(process.execPath, [join(shipped, bin), 'review', 'check', 'build'], home);
        const named = /REVIEW_NOT_INSTALLED: (\S+) is not installed/.exec(refusal.stderr);
        json(join(out, `${phase}-${sample}-review-refusal.json`), { status: refusal.status, stdout: refusal.stdout, stderr: refusal.stderr });
        if (refusal.status !== 2 || !named) throw new Error('Review target unavailable from installed CLI refusal; refusing to guess');
        const reviewName = named[1]; // Original smoke deliberately installs this unpinned name.
        await install(phase, sample, 'review', ['install', '-D', reviewName, '--no-audit', '--no-fund'], home, cache, deadline, reviewName);
      }
      report[`${phase}SecondsIncludingProbes`] = (performance.now() - phaseStart) / 1000;
      if (phase === 'prewarm') {
        // Delete every prewarm target, manifest, lock and temp tree. Keep ONLY cache.
        for (let sample = 1; sample <= 5; sample++) rmSync(dirname(sampleHome(phase, sample)), { recursive: true, force: true });
        report.prewarmTargetsRemoved = true;
      }
    }
    report.result = 'SAMPLED_COMPLETE';
  } catch (error) { report.result = 'INCOMPLETE_OR_FAILED'; report.error = String(error); process.exitCode = 1; }
  report.distributions = Object.fromEntries(['package', 'runtime', 'review'].map((k) => [k, distribution(rows, 'measured', k)]));
  const d = report.distributions;
  report.derived = {
    label: 'DERIVED, NOT MEASURED 69-CALL TOTAL',
    formula: '23 * package mean + 23 * runtime mean + 21 * review mean + T_typescript + T_vite',
    sampledSubtotalSeconds: report.result === 'SAMPLED_COMPLETE' ? 23 * d.package.mean + 23 * d.runtime.mean + 21 * d.review.mean : null,
    tooling: 'T_typescript and T_vite not measured by this harness; historical fixed reference = 10.598792 + 10.358934 seconds, not current-machine evidence',
    limitation: 'Clean-tarball samples omit plant differences, the add-dependency runtime state and non-ASCII paths; cold/excluded reset cache per sample while original battery shared it. Unpinned review/transitive versions and OS caches may differ. This estimate cannot prove the full CI target.' };
  json(join(out, 'report.json'), report);
  const table = ['## Sampled install diagnostic: ' + mode, '', `Result: ${report.result}. Shared tarball SHA-256: ${report.package.sha256}.`, '', '| Phase | Sample | Kind | Seconds | Exit |', '| --- | ---: | --- | ---: | ---: |', ...rows.map((r) => `| ${r.phase} | ${r.sample} | ${r.kind} | ${r.seconds?.toFixed(6) ?? 'unavailable'} | ${r.status ?? 'unavailable'} |`), '', '15 measured clean-package calls are samples, not the original 69-call battery. Timer boundaries are overlapping; inspect report.json and raw npm logs.'];
  writeFileSync(join(out, 'summary.md'), table.join('\n') + '\n');
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, table.join('\n') + '\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
