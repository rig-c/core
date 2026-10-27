/** #1589 CPU-only stage microbench for the runtime poser: same-frame AA/AB.
 * No player, renderer, browser, package patch or on-by-default runtime hook.
 * Existing #1589 asset loader and official spine-core arm supply the reference.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { cpus, loadavg } from 'node:os';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { EventTimeline, MixFrom, MeshAttachment, RegionAttachment, type Event } from '@esotericsoftware/spine-core';
import { compileRuntime, RuntimePose } from '../src/runtime/index.ts';
import { readModel, underNoSkin } from '../src/core/index.ts';
import { ensureBenchAssets, createSpineInstances, stepSpineArm, percentile } from './pose_bench.ts';
import { allocationPerFrame } from './runtime_poser_cases.ts';

type Stage = 'timeline' | 'world+constraints' | 'geometry' | 'total';
const stages: readonly Stage[] = ['timeline', 'world+constraints', 'geometry', 'total'];
const dt = 1 / 60;
interface Costs { timeline: number; 'world+constraints': number; geometry: number; total: number }
const empty = (): Costs => ({ timeline: 0, 'world+constraints': 0, geometry: 0, total: 0 });
type Internal = { boneTimelines: (...args: unknown[]) => void; hierarchy: () => void; constraintValues: (...args: unknown[]) => void; solveConstraints: () => void; slotValues: (...args: unknown[]) => void; deformValues: (...args: unknown[]) => void };
interface Arm { step(): Costs; poses: RuntimePose[]; compare(): string | null }

function runtimeArm(text: string, n: number, hooks: boolean, busy = false): Arm {
  const doc = underNoSkin(readModel(text)), model = compileRuntime(doc);
  const poses = Array.from({ length: n }, (_, i) => {
    const p = new RuntimePose(model); p.setAnimation('walk'); p.step((i * 0.07) % 1); return p;
  });
  const plain = poses.map(p => { const q = new RuntimePose(model); q.restore('walk', p.trackTime, p.time); return q; });
  const costs = empty();
  // Instrument the executing instance, never source/dependencies. The wrappers
  // are installed only for this tool, with exact original arguments/receiver.
  if (hooks) for (const p of poses) {
    const obj = p as unknown as Internal;
    for (const name of ['boneTimelines', 'hierarchy', 'constraintValues', 'solveConstraints', 'slotValues', 'deformValues'] as const) {
      const original = obj[name];
      const stage = name === 'hierarchy' || name === 'solveConstraints' ? 'world+constraints' : 'timeline';
      obj[name] = function (...args: unknown[]): void {
        const t = Bun.nanoseconds(); original.apply(p, args);
        if (busy && name === 'hierarchy') { const until = Bun.nanoseconds() + 30_000; while (Bun.nanoseconds() < until) { /* measured work plant */ } }
        costs[stage] += (Bun.nanoseconds() - t) / 1000;
      };
    }
  }
  return { poses,
    step() {
      costs.timeline = costs['world+constraints'] = costs.geometry = costs.total = 0;
      const t = Bun.nanoseconds();
      for (let i = 0; i < poses.length; i++) { poses[i].step(dt); }
      const g = Bun.nanoseconds();
      for (let i = 0; i < poses.length; i++) poses[i].computeVertices();
      const end = Bun.nanoseconds();
      costs.geometry = (end - g) / 1000;
      costs.total = (end - t) / 1000;
      if (!hooks) costs.timeline = (g - t) / 1000;
      return costs;
    },
    compare() {
      for (let i = 0; i < poses.length; i++) {
        const p = poses[i], q = plain[i]; q.restore('walk', p.trackTime, p.time); q.computeVertices();
        for (const field of ['world', 'light', 'shown', 'vertices'] as const) for (let k = 0; k < p[field].length; k++) if (!Object.is(p[field][k], q[field][k])) return `instance ${i} ${field}[${k}]: instrumented differs`;
      }
      return null;
    },
  };
}

function officialArm(spine: string, atlas: string, n: number): { step(): Costs; instances: ReturnType<typeof createSpineInstances>; events: Event[][] } {
  const instances = createSpineInstances(spine, atlas, n), out = { timeline: 0, world: 0, geometry: 0 }, costs = empty();
  const events: Event[][] = instances.map((inst, i) => {
    const fired: Event[] = [];
    const animation = inst.skeleton.data.findAnimation('walk')!;
    for (const timeline of animation.timelines) if (timeline instanceof EventTimeline) timeline.apply(inst.skeleton, -1, (i * 0.07) % 1, fired, 1, MixFrom.setup, false, false, false);
    inst.state.addListener({ event(_entry, event) { fired.push(event); } });
    return fired;
  });
  return { instances, events, step() {
    for (let i = 0; i < events.length; i++) events[i].length = 0;
    const t = Bun.nanoseconds(); stepSpineArm(instances, dt, out);
    costs.total = (Bun.nanoseconds() - t) / 1000;
    costs.timeline = out.timeline; costs['world+constraints'] = out.world; costs.geometry = out.geometry;
    return costs;
  } };
}
function referenceDiff(p: RuntimePose[], official: ReturnType<typeof officialArm>): string | null {
  const buffer: number[] = [];
  for (let i = 0; i < p.length; i++) {
    const pose = p[i], s = official.instances[i].skeleton;
    pose.computeVertices();
    if (JSON.stringify(s.drawOrder.appliedPose.map(slot => slot.data.name)) !== JSON.stringify(pose.model.slots.map(slot => slot.name))) return `instance ${i}: draw order`;
    const actual = pose.events.map(e => [e.name, e.time, e.int, e.float, e.string, e.volume, e.balance]);
    const expected = official.events[i].map(e => [e.data.name, e.time, e.intValue, e.floatValue, e.stringValue, e.volume, e.balance]);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) return `instance ${i}: events ${JSON.stringify(actual)} / ${JSON.stringify(expected)}`;
    for (let b = 0; b < s.bones.length; b++) {
      const r = s.bones[b].appliedPose, values = [r.a, r.b, r.c, r.d, r.worldX, r.worldY];
      for (let f = 0; f < 6; f++) if (pose.world[b * 6 + f] !== values[f]) return `instance ${i} bone ${s.bones[b].data.name} ${f}: runtime ${pose.world[b * 6 + f]} / official ${values[f]}`;
    }
    for (let slot = 0; slot < s.slots.length; slot++) {
      const row = s.slots[slot], applied = row.appliedPose, at = applied.attachment;
      const mine = pose.model.attachments[pose.shown[slot]];
      if ((mine?.name ?? null) !== (at?.name ?? null)) return `instance ${i} slot ${row.data.name} attachment`;
      for (let f = 0; f < 4; f++) if (pose.light[slot * 4 + f] !== [applied.color.r, applied.color.g, applied.color.b, applied.color.a][f]) return `instance ${i} slot ${row.data.name} colour ${f}`;
      let count = 0;
      if (at instanceof RegionAttachment) { at.computeWorldVertices(row, at.getOffsets(applied), buffer, 0, 2); count = 8; }
      else if (at instanceof MeshAttachment) { at.computeWorldVertices(s, row, 0, at.worldVerticesLength, buffer, 0, 2); count = at.worldVerticesLength; }
      if (count !== (mine?.count ?? 0)) return `instance ${i} slot ${row.data.name} count`;
      for (let f = 0; f < count; f++) if (pose.vertices[mine.offset + f] !== buffer[f]) return `instance ${i} slot ${row.data.name} vertex ${f}`;
    }
  }
  return null;
}

export async function stage3BenchMain(args: string[]): Promise<void> {
  const get = (key: string, fallback: string): string => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
  const assets = await ensureBenchAssets(get('--assets', join(process.env.TMPDIR!, 'stage3-bench-assets')));
  if (args.includes('--prepare')) { console.log(JSON.stringify({ prepared: Object.keys(assets) })); return; }
  const frames = Number(get('--frames', '300')), warmup = Number(get('--warmup', '120'));
  const mode = get('--mode', 'ab');
  if (!['aa', 'ab'].includes(mode) || !Number.isInteger(frames) || frames < 1 || !Number.isInteger(warmup) || warmup < 1) throw new Error('expected --mode aa|ab, positive whole frames and warmup');
  const result: Record<string, unknown> = { spec: 'runtime-stage3-microbench/1', mode, frames, warmup, bun: Bun.version, cpu: cpus()[0].model, load: loadavg(), stages, clock: 'sum(dt), 1/60', official: '@esotericsoftware/spine-core 4.3.13', rows: [] };
  const rows: unknown[] = [];
  for (const name of ['spineboy', 'raptor'] as const) for (const n of [1, 100]) {
    const a = assets[name], reference = officialArm(a.spineJsonText, a.atlasText, n);
    const candidate = runtimeArm(a.modelText, n, true), control = runtimeArm(a.modelText, n, true);
    const fixtureHash = createHash('sha256').update(a.modelText).update(a.spineJsonText).update(a.atlasText).digest('hex');
    // Untimed real reference, all instances, at initial + three advanced states.
    for (let f = 0; f < 4; f++) {
      if (f > 0) { candidate.step(); reference.step(); }
      const difference = referenceDiff(candidate.poses, reference); if (difference) throw new Error(`REFERENCE_STATE_MATCH ${name} ${difference}`);
      const instrument = candidate.compare(); if (instrument) throw new Error(`INSTRUMENTATION_EQUAL ${name} ${instrument}`);
    }
    if (args.includes('--preflight-only')) {
      rows.push({ name, n, fixtureHash, preflight: 'bones/colours/vertices/order/events, all instances, 4 states; instrumentation buffers Object.is' });
      continue;
    }
    // Fresh matching arms for timing, independent of preflight.
    const b = runtimeArm(a.modelText, n, true), armA = mode === 'aa' ? control : officialArm(a.spineJsonText, a.atlasText, n);
    const series = Object.fromEntries(stages.map(s => [s, { a: [] as number[], b: [] as number[], paired: [] as number[], ratio: [] as number[] }])) as Record<Stage, { a: number[]; b: number[]; paired: number[]; ratio: number[] }>;
    let ca: Costs = empty(), cb: Costs = empty();
    for (let f = 0; f < warmup + frames; f++) {
      if (f % 2 === 0) { ca = armA.step(); cb = b.step(); } else { cb = b.step(); ca = armA.step(); }
      if (f < warmup) continue;
      for (const s of stages) {
        if (!(ca[s] > 0 && Number.isFinite(ca[s]) && cb[s] > 0 && Number.isFinite(cb[s]))) throw new Error(`NONFINITE_COST ${name}/${n}/${s}`);
        series[s].a.push(ca[s]); series[s].b.push(cb[s]); series[s].paired.push(cb[s] - ca[s]); series[s].ratio.push(cb[s] / ca[s]);
      }
    }
    const equal = b.compare(); if (equal) throw new Error(`INSTRUMENTATION_EQUAL ${name} ${equal}`);
    const summary = Object.fromEntries(stages.map(s => [s, { ratio: percentile(series[s].ratio, 0.5), a50: percentile(series[s].a, 0.5), a95: percentile(series[s].a, 0.95), b50: percentile(series[s].b, 0.5), b95: percentile(series[s].b, 0.95), paired05: percentile(series[s].paired, 0.05), paired50: percentile(series[s].paired, 0.5), paired95: percentile(series[s].paired, 0.95) }]));
    rows.push({ name, n, fixtureHash, referenceValues: 'all instances at 4 poses, signed zero equivalent; exact doubles', summary, series });
    console.log(JSON.stringify({ name, n, mode, summary }));
  }
  result.rows = rows;
  if (args.includes('--controls')) {
    const a = assets.spineboy, normal = runtimeArm(a.modelText, 1, true), busy = runtimeArm(a.modelText, 1, true, true);
    const differences: Record<Stage, number[]> = { timeline: [], 'world+constraints': [], geometry: [], total: [] };
    for (let f = 0; f < 240; f++) { const a = normal.step(), b = busy.step(); if (f >= 120) for (const s of stages) differences[s].push(b[s] - a[s]); }
    const shifts = Object.fromEntries(stages.map(s => [s, percentile(differences[s], 0.5)]));
    if (shifts['world+constraints'] < 20 || Math.abs(shifts.timeline) > 10 || Math.abs(shifts.geometry) > 10) throw new Error(`BUSY_PLANT_STAGE ${JSON.stringify(shifts)}`);
    const file = join(process.env.TMPDIR!, 'stage3-bench-alloc.json'); writeFileSync(file, a.modelText);
    const clean = allocationPerFrame(import.meta.dir + '/..', file, 'walk', 'none'), plant = allocationPerFrame(import.meta.dir + '/..', file, 'walk', 'object');
    if (clean.bytes !== 0 || plant.bytes === null || plant.bytes < 16) throw new Error(`ALLOCATION_PLANT ${JSON.stringify({ clean, plant })}`);
    result.controls = { busyShiftsUs: shifts, clean, plant };
  }
  writeFileSync(get('--json-out', join(process.env.TMPDIR!, 'runtime-stage3-bench.json')), JSON.stringify(result) + '\n');
}
if (import.meta.main) stage3BenchMain(process.argv.slice(2)).catch(e => { console.error(e); process.exit(1); });
