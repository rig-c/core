/** Apply-only noise instrument (#1636). Repository tool; absent from package files.
 * No product hooks: independently imported production RuntimePose.apply on both arms.
 * --preflight reads no clocks. See docs/RUNTIME_TIMING.md for the fixed protocol.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { arch, cpus, freemem, loadavg, platform, release, totalmem } from 'node:os';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { RuntimeModel, RuntimePose } from '../src/runtime/index.ts';

export const PROTOCOL = Object.freeze({ version: 'rigc-pose-noise/2', instances: 100, grid: 256,
  stride: 17, warmup: 1024, pairs: 512, clusterPairs: 8, bootstrap: 10000,
  orderSeed: 1636, bootstrapSeed: 0x1636b005, checkpoints: [128, 256, 512],
  diagnosticPairs: 128, calibrationRounds: 3, calibrationPairs: 64, verificationPairs: 128 });
type Rig = 'spineboy' | 'raptor';
type Arm = 'a' | 'b';
type Mode = 'interleaved' | 'grouped';
interface Pin { path: string; sha256: string }
interface Source { root: string; manifest: string; sha256: string }
interface Config { version: string; sources: Record<Arm, Source>; fixtures: Record<Rig, Pin>;
  bar: Pin & { url: string }; amendment: Pin & { url: string }; calibrationSeed: Pin }
interface Sample { cpuUs: number | null; wallNs: number; poseSink: number; workSink: number; checksum: string }
interface Pair { order: 'ab' | 'ba' | null; a: Sample; b: Sample }
interface Group { firstPair: number; pairs: number; direction: 'a-then-b' | 'b-then-a' }
interface AcquisitionPlan { mode: Mode; pairs: number; pairOrders: ('ab' | 'ba')[] | null;
  groups: Group[]; sequence: { arm: Arm; pair: number }[] }
interface Estimate { medianPct: number; ci95Pct: [number, number] }
interface Loaded { model: RuntimeModel; ctor: typeof RuntimePose; duration: number }
interface Calibration { configSha256: string; toolSha256: string; counts: Record<Rig, number>;
  verification: Record<Rig, Estimate>; projectedAcceptanceSeconds: number; fitsBudget: boolean; admitted: boolean }
const rigs: Rig[] = ['spineboy', 'raptor'];
const states = ['locals', 'world', 'light', 'dark', 'shown', 'drawOrder', 'deform'] as const;
const sha = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const fileSha = (path: string): string => sha(readFileSync(path));
const toolSha = (): string => fileSha(fileURLToPath(import.meta.url));
function assert(ok: unknown, message: string): asserts ok { if (!ok) throw Error(message); }
function rng(seed: number): () => number {
  let x = seed >>> 0;
  return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; };
}
/** Every adjacent two pairs contain one AB and one BA, never duplicated arms. */
export function pairOrder(count: number, seed: number = PROTOCOL.orderSeed): ('ab' | 'ba')[] {
  assert(Number.isInteger(count) && count > 0 && count % 2 === 0, 'ORDER: positive even pair count required');
  const random = rng(seed), out: ('ab' | 'ba')[] = [];
  for (let i = 0; i < count; i += 2) out.push(...(random() < .5 ? ['ab', 'ba'] as const : ['ba', 'ab'] as const));
  return out;
}
/** Grouped diagnostic: half the matched work in each direction. Pair rows in
 * this mode are index matches across long runs, never adjacent AB/BA samples.
 */
export function acquisitionPlan(mode: Mode, count: number, seed: number = PROTOCOL.orderSeed): AcquisitionPlan {
  assert(Number.isInteger(count) && count >= 16 && count % 16 === 0, 'PLAN: complete balanced clusters required');
  const sequence: AcquisitionPlan['sequence'] = [], groups: Group[] = [];
  const pairOrders = mode === 'interleaved' ? pairOrder(count, seed) : null;
  if (pairOrders !== null) {
    pairOrders.forEach((order, pair) => { for (const arm of order) sequence.push({ arm: arm as Arm, pair }); });
  } else {
    const half = count / 2, first = rng(seed)() < .5 ? 'a-then-b' : 'b-then-a';
    for (const [index, direction] of [first, first === 'a-then-b' ? 'b-then-a' : 'a-then-b'].entries()) {
      const group: Group = { firstPair: index * half, pairs: half, direction: direction as Group['direction'] };
      groups.push(group);
      for (const arm of direction === 'a-then-b' ? ['a', 'b'] as const : ['b', 'a'] as const) {
        for (let pair = group.firstPair; pair < group.firstPair + half; pair++) sequence.push({ arm, pair });
      }
    }
  }
  return { mode, pairs: count, pairOrders, groups, sequence };
}
/** Shared by real acquisition and the untimed execution-trace controls. */
export function executePlan<T>(plan: AcquisitionPlan, run: (arm: Arm, pair: number) => T): { order: 'ab' | 'ba' | null; a: T; b: T }[] {
  const seen = new Set<string>(), rows: Partial<Record<Arm, T>>[] = Array.from({ length: plan.pairs }, () => ({}));
  for (const { arm, pair } of plan.sequence) {
    assert((arm === 'a' || arm === 'b') && Number.isInteger(pair) && pair >= 0 && pair < plan.pairs && !seen.has(`${arm}${pair}`), 'PLAN: invalid/duplicate invocation');
    seen.add(`${arm}${pair}`); rows[pair][arm] = run(arm, pair);
  }
  assert(seen.size === plan.pairs * 2, 'PLAN: incomplete acquisition');
  return rows.map((row, pair) => ({ order: plan.pairOrders?.[pair] ?? null, a: row.a!, b: row.b! }));
}
export function median(values: readonly number[]): number {
  assert(values.length > 0 && values.every(Number.isFinite), 'STAT: nonempty finite samples required');
  const a = [...values].sort((x, y) => x - y), mid = a.length >> 1;
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}
function quantile(sorted: number[], q: number): number {
  const at = (sorted.length - 1) * q, i = Math.floor(at);
  return sorted[i] + (sorted[Math.min(i + 1, sorted.length - 1)] - sorted[i]) * (at - i);
}
/** Unpaired resamples arm clusters independently; paired preserves each cluster's pairing.
 * Eight contiguous pairs are one dependence unit. Inter-cluster independence is an
 * assumption, not a claim that serial correlation cannot extend further.
 */
export function estimate(a: number[], b: number[], paired: boolean, resamples: number = PROTOCOL.bootstrap): Estimate {
  const size = PROTOCOL.clusterPairs;
  assert(a.length === b.length && a.length >= size * 2 && a.length % size === 0, 'STAT: complete paired clusters required');
  assert([...a, ...b].every(x => Number.isFinite(x) && x > 0), 'STAT: positive finite meters required');
  const stat = (x: number[], y: number[]): number => paired
    ? median(x.map((v, i) => 100 * (y[i] - v) / v)) : 100 * (median(y) - median(x)) / median(x);
  const random = rng(PROTOCOL.bootstrapSeed), boot: number[] = [], n = a.length / size;
  for (let r = 0; r < resamples; r++) {
    const x: number[] = [], y: number[] = [];
    for (let c = 0; c < n; c++) {
      const ca = Math.floor(random() * n), cb = paired ? ca : Math.floor(random() * n);
      for (let k = 0; k < size; k++) { x.push(a[ca * size + k]); y.push(b[cb * size + k]); }
    }
    boot.push(stat(x, y));
  }
  boot.sort((x, y) => x - y);
  return { medianPct: stat(a, b), ci95Pct: [quantile(boot, .025), quantile(boot, .975)] };
}
function accepts(e: Estimate | null, plant: boolean): boolean {
  if (e === null) return false;
  return plant ? e.medianPct >= 2 && e.medianPct <= 4 && e.ci95Pct[0] >= 1 && e.ci95Pct[1] <= 5
    : Math.abs(e.medianPct) <= 1 && e.ci95Pct[0] <= 0 && e.ci95Pct[1] >= 0;
}
/** Fixed three correction rounds (within the posted maximum), then a fresh
 * verification. The callback is the actual acquisition, or an untimed control.
 */
export async function boundedCalibration(start: number,
  measure: (count: number, pairs: number, phase: 'round' | 'verification', round: number) => Promise<Estimate>) {
  assert(Number.isInteger(start) && start >= 1 && start <= 4096, 'CALIBRATION: invalid starting count');
  let count = start;
  const rounds = [];
  for (let round = 1; round <= PROTOCOL.calibrationRounds; round++) {
    const estimate = await measure(count, PROTOCOL.calibrationPairs, 'round', round);
    assert(Number.isFinite(estimate.medianPct) && estimate.medianPct > 0, 'CALIBRATION: nonpositive/nonfinite estimate');
    const nextCount = Math.max(1, Math.min(4096, Math.round(count * 3 / estimate.medianPct)));
    rounds.push({ round, count, estimate, nextCount }); count = nextCount;
  }
  const verification = await measure(count, PROTOCOL.verificationPairs, 'verification', 0);
  assert(Number.isFinite(verification.medianPct) && verification.medianPct > 0, 'CALIBRATION: nonpositive/nonfinite verification');
  return { count, rounds, verification, verificationPassed: verification.medianPct >= 2 && verification.medianPct <= 4 };
}
export function acceptanceBudgetSeconds(sampledSeconds: number, sampledPairs: number): number {
  assert(Number.isFinite(sampledSeconds) && sampledSeconds > 0 && sampledPairs > 0, 'BUDGET: positive sample required');
  return sampledSeconds * (PROTOCOL.pairs / sampledPairs) * 1.5 + 60;
}
function summaries(pairs: Pair[], resamples: number = PROTOCOL.bootstrap) {
  const result: Record<string, Estimate | null> = {};
  for (const meter of ['cpuUs', 'wallNs'] as const) for (const paired of [true, false]) {
    const a = pairs.map(p => p.a[meter]), b = pairs.map(p => p.b[meter]);
    result[`${meter}/${paired ? 'paired' : 'unpaired'}`] = a.some(x => x === null) || b.some(x => x === null)
      ? null : estimate(a as number[], b as number[], paired, resamples);
  }
  return result;
}
function inside(root: string, path: string): string {
  assert(!isAbsolute(path), `INPUT: expected relative path ${path}`);
  const full = realpathSync(resolve(root, path)), rel = relative(realpathSync(root), full);
  assert(rel !== '..' && !rel.startsWith('../') && !isAbsolute(rel), `INPUT: path escapes root ${path}`);
  return full;
}
function readConfig(path: string): { config: Config; root: string; hash: string } {
  const bytes = readFileSync(path), config = JSON.parse(bytes.toString()) as Config, root = dirname(resolve(path));
  assert(config.version === PROTOCOL.version, 'INPUT: unsupported protocol');
  assert(config.bar.url.startsWith('https://github.com/rig-c/core/issues/1636#issuecomment-'), 'BAR: posted issue comment required');
  assert(fileSha(inside(root, config.bar.path)) === config.bar.sha256, 'BAR: digest mismatch');
  assert(config.amendment.url.startsWith('https://github.com/rig-c/core/issues/1636#issuecomment-') && config.amendment.url !== config.bar.url, 'AMENDMENT: distinct posted comment required');
  assert(fileSha(inside(root, config.amendment.path)) === config.amendment.sha256, 'AMENDMENT: digest mismatch');
  assert(config.amendment.path !== config.bar.path, 'AMENDMENT: original bar must remain separate');
  assert(fileSha(inside(root, config.calibrationSeed.path)) === config.calibrationSeed.sha256, 'CALIBRATION_SEED: digest mismatch');
  const roots: string[] = [];
  for (const arm of ['a', 'b'] as const) {
    const source = config.sources[arm], sourceRoot = inside(root, source.root), manifestPath = inside(root, source.manifest);
    assert(fileSha(manifestPath) === source.sha256, `SOURCE_MANIFEST ${arm}`);
    const rows = JSON.parse(readFileSync(manifestPath, 'utf8')) as Pin[];
    assert(rows.length > 0 && new Set(rows.map(r => r.path)).size === rows.length, 'SOURCE: empty/duplicate manifest');
    for (const row of rows) assert(fileSha(inside(sourceRoot, row.path)) === row.sha256, `SOURCE_HASH ${arm} ${row.path}`);
    assert(rows.some(r => r.path === 'src/runtime/pose.ts') && rows.some(r => r.path === 'src/core/entry.ts'), 'SOURCE: required entry missing');
    roots.push(sourceRoot);
  }
  assert(roots[0] !== roots[1], 'SOURCE: A/B must be independent real paths');
  for (const rig of rigs) assert(fileSha(inside(root, config.fixtures[rig].path)) === config.fixtures[rig].sha256, `FIXTURE_HASH ${rig}`);
  return { config, root, hash: sha(bytes) };
}
async function load(config: Config, root: string, arm: Arm, rig: Rig): Promise<Loaded> {
  const base = inside(root, config.sources[arm].root);
  const rt = await import(pathToFileURL(resolve(base, 'src/runtime/index.ts')).href) as typeof import('../src/runtime/index.ts');
  const core = await import(pathToFileURL(resolve(base, 'src/core/entry.ts')).href) as typeof import('../src/core/entry.ts');
  const model = rt.compileRuntime(core.underNoSkin(core.readModel(readFileSync(inside(root, config.fixtures[rig].path), 'utf8'))));
  const duration = model.animation('walk').duration;
  assert(Number.isFinite(duration) && duration > 0, `FIXTURE: no positive walk duration ${rig}`);
  return { model, ctor: rt.RuntimePose, duration };
}
function posesOf(loaded: Loaded, count: number = PROTOCOL.instances): RuntimePose[] {
  return Array.from({ length: count }, () => { const p = new loaded.ctor(loaded.model); p.setAnimation('walk'); p.apply(0); return p; });
}
function checksum(poses: RuntimePose[], sink: number): string {
  const h = createHash('sha256'); h.update(new Uint8Array(new Float64Array([sink]).buffer));
  for (const p of poses) {
    for (const field of states) { const a = p[field]; h.update(field); h.update(new Uint8Array(a.buffer, a.byteOffset, a.byteLength)); }
    h.update(JSON.stringify([p.time, p.events]));
  }
  return h.digest('hex');
}
function equal(a: RuntimePose, b: RuntimePose): boolean {
  return states.every(f => a[f].length === b[f].length && a[f].every((v, i) => Object.is(v, b[f][i])))
    && Object.is(a.time, b.time) && JSON.stringify(a.events) === JSON.stringify(b.events);
}
/** Both arms call exactly this wrapper, including at zero extra iterations.
 * An observable sink consumes the recurrence, so its work cannot be dead code.
 */
function invoke(p: RuntimePose, t: number, read: number, iterations: number): number {
  p.apply(t);
  let x = p.world[read] | 0;
  for (let j = 0; j < iterations; j++) x = (Math.imul(x, 1664525) + 1013904223) | 0;
  return x;
}
function schedule(duration: number, count: number) {
  const times = new Float64Array(PROTOCOL.grid * count), reads = new Int32Array(times.length);
  for (let f = 0; f < PROTOCOL.grid; f++) for (let i = 0; i < count; i++) times[f * count + i] = duration * ((f + PROTOCOL.stride * i) % PROTOCOL.grid) / PROTOCOL.grid;
  return { times, reads };
}
function batch(poses: RuntimePose[], times: Float64Array, reads: Int32Array, iterations: number) {
  let poseSink = 0, workSink = 0;
  for (let f = 0, at = 0; f < PROTOCOL.grid; f++) for (let i = 0; i < poses.length; i++, at++) {
    const p = poses[i]; workSink = (workSink + invoke(p, times[at], reads[at], iterations)) | 0;
    poseSink += p.world[reads[at]];
  }
  return { poseSink, workSink };
}
function prepare(loaded: Loaded, count: number = PROTOCOL.instances) {
  const poses = posesOf(loaded, count), s = schedule(loaded.duration, count);
  for (let f = 0; f < PROTOCOL.grid; f++) for (let i = 0; i < count; i++) s.reads[f * count + i] = (f + i) % poses[i].world.length;
  for (let f = 0; f < PROTOCOL.warmup; f++) for (let i = 0; i < count; i++) poses[i].apply(loaded.duration * ((f + PROTOCOL.stride * i) % PROTOCOL.grid) / PROTOCOL.grid);
  return { poses, ...s };
}
/** Independent formula scheduler and integer multiply (all products <2^53). */
function reference(loaded: Loaded, iterations: number, count: number = PROTOCOL.instances) {
  const poses = posesOf(loaded, count);
  for (let f = 0; f < PROTOCOL.warmup; f++) for (let i = 0; i < count; i++) poses[i].apply(loaded.duration * ((f + 17 * i) % 256) / 256);
  let poseSink = 0, workSink = 0;
  for (let f = 0; f < 256; f++) for (let i = 0; i < count; i++) {
    const p = poses[i]; p.apply(loaded.duration * ((f + 17 * i) % 256) / 256);
    const value = p.world[(f + i) % p.world.length]; poseSink += value;
    let x = value | 0;
    for (let j = 0; j < iterations; j++) x = (x * 1664525 + 1013904223) | 0;
    workSink = (workSink + x) | 0;
  }
  return { poseSink, workSink, checksum: checksum(poses, poseSink) };
}
function check(result: { poseSink: number; workSink: number }, poses: RuntimePose[], expected: ReturnType<typeof reference>): string {
  const digest = checksum(poses, result.poseSink);
  assert(Object.is(result.poseSink, expected.poseSink) && result.workSink === expected.workSink && digest === expected.checksum, 'REFERENCE_CHECKSUM: measured output differs');
  return digest;
}
let meterReads = 0;
function measured(prepared: ReturnType<typeof prepare>, iterations: number, expected: ReturnType<typeof reference>): Sample {
  meterReads += 4;
  let c0: NodeJS.CpuUsage | null = null;
  try { c0 = process.cpuUsage(); } catch { /* Preserve wall fallback; CPU stays unavailable. */ }
  const w0 = process.hrtime.bigint();
  const result = batch(prepared.poses, prepared.times, prepared.reads, iterations);
  const wallNs = Number(process.hrtime.bigint() - w0);
  let cpuUs: number | null = null;
  if (c0 !== null) try { const c1 = process.cpuUsage(c0); cpuUs = c1.user + c1.system; } catch { /* Wall-only diagnostic. */ }
  if (cpuUs !== null && (!Number.isFinite(cpuUs) || cpuUs <= 0)) cpuUs = null;
  assert(wallNs > 0, 'METER: unavailable/nonpositive CPU or wall reading');
  return { ...result, cpuUs, wallNs, checksum: check(result, prepared.poses, expected) };
}
function cpu(sample: Sample): number {
  assert(sample.cpuUs !== null, 'CPU_UNAVAILABLE: raw wall fallback retained, no CPU acceptance'); return sample.cpuUs;
}
const machine = () => ({ loadavg: loadavg(), freeBytes: freemem(), totalBytes: totalmem() });
async function acquire(config: Config, root: string, rig: Rig, iterations: number, count: number, mode: Mode) {
  const a = await load(config, root, 'a', rig), b = await load(config, root, 'b', rig);
  assert(a.ctor !== b.ctor && a.duration === b.duration, 'SOURCE: independent constructors/equal duration required');
  const pa = prepare(a), pb = prepare(b), ea = reference(a, 0), eb = reference(a, iterations);
  // Warm the same wrapper/plant path on both independently imported implementations.
  for (let i = 0; i < 4; i++) { batch(pa.poses, pa.times, pa.reads, 0); batch(pb.poses, pb.times, pb.reads, iterations); }
  const plan = acquisitionPlan(mode, count), before = machine();
  const pairs: Pair[] = executePlan(plan, arm => arm === 'a' ? measured(pa, 0, ea) : measured(pb, iterations, eb));
  return { rig, mode, iterations, before, after: machine(), referenceChecksum: ea.checksum,
    duration: a.duration, callsPerBlock: PROTOCOL.grid * PROTOCOL.instances,
    acquisition: plan, orderSha256: sha(JSON.stringify(plan.sequence)), pairs };
}

export function statsControls(): string[] {
  const a = Array.from({ length: 32 }, (_, i) => 100 + (i % 8)), b = a.map(x => x * 1.03);
  assert(JSON.stringify(pairOrder(512)) === JSON.stringify(pairOrder(512)), 'CONTROL: seed determinism');
  assert(JSON.stringify(pairOrder(512, 2)) !== JSON.stringify(pairOrder(512)), 'CONTROL: seed sensitivity');
  const order = pairOrder(512);
  for (let i = 0; i < order.length; i += 2) assert(order[i] !== order[i + 1], 'CONTROL: AB/BA balance');
  const same = estimate(a, a, true), plant = estimate(a, b, true);
  assert(same.medianPct === 0 && same.ci95Pct.every(v => v === 0) && accepts(same, false), 'CONTROL: exact identity');
  assert(Math.abs(plant.medianPct - 3) < 1e-10 && accepts(plant, true), 'CONTROL: 3 percent plant');
  assert(!accepts(estimate(a, a.map(x => x * 1.06), true), true), 'CONTROL: oversized plant');
  assert(!accepts({ medianPct: 0, ci95Pct: [.01, .02] }, false), 'CONTROL: interval must contain zero');
  assert(accepts({ medianPct: 1, ci95Pct: [0, 1] }, false) && !accepts({ medianPct: 1.00001, ci95Pct: [0, 2] }, false), 'CONTROL: 1 percent boundary');
  assert(accepts({ medianPct: 2, ci95Pct: [1, 5] }, true) && !accepts({ medianPct: 3, ci95Pct: [.99999, 4] }, true), 'CONTROL: plant interval boundary');
  for (const bad of [[0, ...a.slice(1)], [NaN, ...a.slice(1)], a.slice(1)]) {
    let refused = false; try { estimate(bad, a, true); } catch { refused = true; } assert(refused, 'CONTROL: malformed samples refused');
  }
  // Drifting common-mode samples: paired is exactly 3%; unpaired resampling is wider.
  const drift = Array.from({ length: 128 }, (_, i) => 100 + i * 10), scaled = drift.map(v => v * 1.03);
  const paired = estimate(drift, scaled, true), unpaired = estimate(drift, scaled, false);
  assert(paired.ci95Pct[1] - paired.ci95Pct[0] < unpaired.ci95Pct[1] - unpaired.ci95Pct[0], 'CONTROL: independent reducer resampling');
  return ['seed reproducibility/sensitivity', 'balanced AB/BA pairs', 'identity', '3% plant', 'oversized plant', 'CI and inclusive boundaries', 'malformed meter refusal', 'paired/unpaired drift control'];
}
async function preflight(config: Config, root: string) {
  const controls = statsControls(), fixtures = [];
  for (const rig of rigs) {
    const a = await load(config, root, 'a', rig), b = await load(config, root, 'b', rig);
    assert(a.ctor !== b.ctor, 'CONTROL: module alias');
    const pa = posesOf(a, 3), pb = posesOf(b, 3); let compared = 0;
    for (let g = 0; g < 256; g++) for (let i = 0; i < 3; i++) {
      const t = a.duration * ((g + 17 * i) % 256) / 256; pa[i].apply(t); pb[i].apply(t);
      assert(equal(pa[i], pb[i]), `PARITY ${rig} grid ${g} instance ${i}`); compared++;
    }
    const checksums: string[] = [];
    for (const loaded of [a, b]) for (const extra of [0, 16]) {
      const p = prepare(loaded, 3), expected = reference(a, extra, 3);
      checksums.push(check(batch(p.poses, p.times, p.reads, extra), p.poses, expected));
    }
    const negatives: string[] = [];
    for (const defect of ['no-op', 'time-shift']) {
      const p = posesOf(b, 1)[0], q = posesOf(a, 1)[0]; let found = false;
      for (let g = 1; g < 256 && !found; g++) {
        q.apply(a.duration * g / 256);
        if (defect === 'time-shift') p.apply(a.duration * ((g + 1) % 256) / 256);
        found = !equal(q, p);
      }
      assert(found, `CONTROL: surviving ${defect}`); negatives.push(defect);
    }
    const p = prepare(a, 3), value = batch(p.poses, p.times, p.reads, 0), expected = reference(a, 0, 3);
    value.workSink ^= 1; let refused = false;
    try { check(value, p.poses, expected); } catch { refused = true; }
    assert(refused, 'CONTROL: unconsumed/incorrect work sink');
    fixtures.push({ rig, duration: a.duration, compared, checksums, negatives, alteredWorkSinkRefused: refused });
  }
  assert(meterReads === 0, 'CONTROL: preflight read a meter');
  return { mode: 'UNTIMED_PREFLIGHT', meterReads, controls, fixtures };
}
function output(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
}
const USAGE = `bun tools/pose_bench.ts --apply-only --config <config.json> --preflight|--calibrate|--diagnostic|--measure AA1|plant1 ... --out <new.json> [--calibration <calibration.json>]
Config pins independent source roots/manifests, fixtures, original bar, amendment and old calibration seed. Paths are relative to config.
--preflight is untimed. Calibration/measurement require Linux x64, a Nova exclusive job and the posted bar.
Acceptance is interleaved-only 512 pairs per fixture; diagnostic is 128 pairs per fixture/mode with both grouped directions.
CPU = process user+system, not thread CPU. No early acceptance success.`;
export async function applyBenchMain(args: string[]): Promise<void> {
  if (args.includes('--help')) { console.log(USAGE); return; }
  const options = new Map<string, string>(); let action = '';
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (['--preflight', '--calibrate', '--diagnostic'].includes(key)) { assert(!action, 'ARGS: exactly one action'); action = key; }
    else if (['--config', '--out', '--calibration', '--measure'].includes(key)) {
      assert(args[i + 1] !== undefined && !args[i + 1].startsWith('--') && !options.has(key), `ARGS: missing/duplicate ${key}`);
      options.set(key, args[++i]); if (key === '--measure') { assert(!action, 'ARGS: exactly one action'); action = key; }
    } else throw Error(`ARGS: unknown ${key}\n${USAGE}`);
  }
  const configPath = options.get('--config'), out = options.get('--out');
  assert(configPath && out && action, USAGE); assert(!existsSync(out), 'OUTPUT: existing receipt will not be overwritten');
  const { config, root, hash } = readConfig(configPath);
  if (action === '--preflight') { output(out, await preflight(config, root)); console.log('UNTIMED_PREFLIGHT PASS meterReads=0'); return; }
  assert(platform() === 'linux' && arch() === 'x64', 'TIMING: Linux x64 Nova pool only; no Mac timing');
  const header = { protocol: PROTOCOL, configSha256: hash, toolSha256: toolSha(), bar: config.bar, amendment: config.amendment,
    runtime: { bun: Bun.version, node: process.versions.node, platform: platform(), arch: arch(), release: release(), cpus: cpus().map(c => c.model) },
    meter: 'process.cpuUsage user+system (all threads), CPU start / hrtime start / loop / hrtime end / CPU end; no overhead subtraction', gc: 'default; no forced collection' };
  if (action === '--calibrate') {
    const seed = JSON.parse(readFileSync(inside(root, config.calibrationSeed.path), 'utf8')) as { counts: Record<Rig, number> };
    const counts = {} as Record<Rig, number>, verification = {} as Record<Rig, Estimate>, corrections = [];
    const raw: (Awaited<ReturnType<typeof acquire>> & { phase: 'round' | 'verification'; round: number })[] = [];
    let sampledSeconds = 0;
    for (const rig of rigs) {
      const correction = await boundedCalibration(seed.counts[rig], async (count, pairs, phase, round) => {
        const run = await acquire(config, root, rig, count, pairs, 'interleaved');
        raw.push({ phase, round, ...run }); output(`${out}.${rig}.${phase}${round}.raw.json`, run);
        if (phase === 'verification') sampledSeconds += run.pairs.reduce((sum, p) => sum + p.a.wallNs + p.b.wallNs, 0) / 1e9;
        return estimate(run.pairs.map(p => cpu(p.a)), run.pairs.map(p => cpu(p.b)), true);
      });
      counts[rig] = correction.count; verification[rig] = correction.verification; corrections.push({ rig, ...correction });
    }
    // Both fixtures' fresh verification -> interleaved-only acceptance; fixed
    // 50% plus 60s reserve. Forecast, never a measured timeout.
    const projectedAcceptanceSeconds = acceptanceBudgetSeconds(sampledSeconds, PROTOCOL.verificationPairs);
    const fitsBudget = projectedAcceptanceSeconds < 840;
    const admitted = fitsBudget && corrections.every(c => c.verificationPassed);
    readConfig(configPath);
    output(out, { ...header, calibrationSeed: config.calibrationSeed, counts, verification, corrections, projectedAcceptanceSeconds, fitsBudget, admitted, raw });
    console.log(JSON.stringify({ counts, verification, projectedAcceptanceSeconds, fitsBudget, admitted }));
    assert(admitted, 'CALIBRATION: budget/plant unresolved; preserve receipt and STOP before acceptance');
    return;
  }
  const calibrationPath = options.get('--calibration'); assert(calibrationPath, 'CALIBRATION: frozen calibration required');
  const calibration = JSON.parse(readFileSync(calibrationPath, 'utf8')) as Calibration;
  assert(calibration.configSha256 === hash && calibration.toolSha256 === toolSha() && calibration.fitsBudget && calibration.admitted === true, 'CALIBRATION: freeze mismatch/not admitted');
  for (const rig of rigs) assert(Number.isInteger(calibration.counts[rig]) && calibration.counts[rig] > 0 && calibration.counts[rig] <= 4096, 'CALIBRATION: invalid count');
  const diagnostic = action === '--diagnostic', runId = diagnostic ? 'diagnostic' : options.get('--measure')!;
  assert(diagnostic || /^(AA|plant)[1-5]$/.test(runId), 'RUN: expected AA1..AA5 or plant1..plant5');
  assert((!diagnostic && !runId.startsWith('AA')) || config.sources.a.sha256 === config.sources.b.sha256, 'AA/DIAGNOSTIC: source manifests must match');
  const plant = runId.startsWith('plant'), runs = [], random = rng(PROTOCOL.orderSeed);
  for (const rig of rigs) {
    const modes: Mode[] = diagnostic ? (random() < .5 ? ['interleaved', 'grouped'] : ['grouped', 'interleaved']) : ['interleaved'];
    for (const mode of modes) {
      const run = await acquire(config, root, rig, plant ? calibration.counts[rig] : 0, diagnostic ? PROTOCOL.diagnosticPairs : PROTOCOL.pairs, mode);
      // Incremental receipts retain complete raw blocks even if a later fixture fails.
      output(`${out}.${rig}.${mode}.raw.json`, run);
      const checkpoints = Object.fromEntries((diagnostic ? [PROTOCOL.diagnosticPairs] : PROTOCOL.checkpoints).map(n => [n, summaries(run.pairs.slice(0, n))]));
      runs.push({ ...run, checkpoints, pass: diagnostic ? null : accepts(checkpoints[512]['cpuUs/paired'], plant) });
    }
  }
  readConfig(configPath);
  const pass = diagnostic ? null : runs.every(r => r.pass);
  output(out, { ...header, runId, plant, diagnostic, calibrationSha256: fileSha(calibrationPath), runs, pass, meterReads });
  console.log(JSON.stringify({ runId, pass, cells: runs.map(r => ({ rig: r.rig, mode: r.mode, primary: r.checkpoints[diagnostic ? 128 : 512]['cpuUs/paired'], pass: r.pass })) }));
  // A red noise bar is a measurement outcome, not grounds to truncate the five-job protocol.
}
if (import.meta.main) await applyBenchMain(process.argv.slice(2));
