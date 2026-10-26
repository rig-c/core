/**
 * runtime_bench — the runtime poser (issue #1591) timed beside spine-core and
 * rigc's live path, same frame, same rig, the allocation per frame beside the
 * time. Evidence for a pull request, never a gate: a figure here depends on
 * the machine, its load and the engine, and nothing reads it but a person.
 *
 *   bun tools/runtime_bench.ts <dir> [<dir> …] [--animation walk] [--instances 1,100]
 *                              [--spine-json skeleton.json] [--frames 3000] [--frame-of <module>]
 *
 * Each `<dir>` holds a build: `skeleton.model.json`, the Spine skeleton named
 * by `--spine-json` (default `skeleton.json`, `build`'s own; an editor export
 * beside it can be named instead) and `skeleton.atlas`. Three arms, each over
 * N instances staggered by `(i · 7) mod 60` steps so they are not in phase,
 * each split into a pose half and a rest half timed apart:
 *
 * - **a, the runtime poser**: `RuntimePose.step(1/60)`, then
 *   `computeVertices()`. Compiled with `ignore: ['events']`: it fires none.
 * - **b, spine-core 4.3.13**: `AnimationState.update/apply`,
 *   `Skeleton.update` and `updateWorldTransform(Physics.update)`, then every
 *   drawn region's and mesh's `computeWorldVertices` into one buffer.
 * - **c, rigc's live path**: the core's `openTrack(…).step(1/60)`, whose pose
 *   already carries the drawn vertices, then — with `--frame-of <module>`, a
 *   module exporting play's `frameSource(doc, parsed)` and `frameOf(source,
 *   pose)` — the frame a player builds from it; without it the rest is empty.
 *
 * Every frame poses all three arms in an order that rotates (abc, bca, cab).
 * Then each arm runs alone in a child process with the collector off
 * (`BUN_JSC_useGC=0`), where `heapUsed` grows by every byte allocated, and
 * its growth over a batch of frames is divided by the batch: bytes per frame.
 * (`heapStats` does not count allocation; the collector-off heap does.)
 *
 * Prints one table row per rig, instance count and arm (µs per frame for all
 * N instances, p50 and p95), the ratios at p50, and the bytes per frame.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { AnimationState, AnimationStateData, AtlasAttachmentLoader, MeshAttachment, Physics, RegionAttachment, Skeleton, SkeletonJson, TextureAtlas } from '@esotericsoftware/spine-core';
import { readModel, underNoSkin, type CompiledDocument } from '../src/core/index.ts';
import { openTrack } from '../src/core/track.ts';
import type { RawPose } from '../src/core/raw.ts';
import { compileRuntime, RuntimePose } from '../src/runtime/index.ts';

const DT = 1 / 60;
const ORDERS = ['abc', 'bca', 'cab'] as const;
type ArmKey = 'a' | 'b' | 'c';

interface Arm {
  name: string;
  pose(): void;
  rest(): void;
}

interface FrameOfModule {
  frameSource(doc: CompiledDocument, parsed: unknown): unknown;
  frameOf(source: unknown, pose: RawPose): unknown;
}

class BenchInputError extends Error {}

function isFrameOfModule(m: unknown): m is FrameOfModule {
  if (typeof m !== 'object' || m === null) return false;
  const r = m as Record<string, unknown>;
  return typeof r.frameSource === 'function' && typeof r.frameOf === 'function';
}

const stagger = (i: number): number => (i * 7) % 60;

function makeArms(dir: string, animation: string, n: number, spineJson: string, frameOf: FrameOfModule | null): Record<ArmKey, Arm> {
  const text = readFileSync(join(dir, 'skeleton.model.json'), 'utf8');
  const view = underNoSkin(readModel(text, join(dir, 'skeleton.model.json')));

  const model = compileRuntime(view, { ignore: ['events'] });
  const poses: RuntimePose[] = [];
  for (let i = 0; i < n; i++) {
    const p = new RuntimePose(model);
    p.setAnimation(animation);
    p.apply(0);
    for (let k = 0; k < stagger(i); k++) p.step(DT);
    poses.push(p);
  }
  const a: Arm = {
    name: 'runtime poser',
    pose: () => {
      for (let i = 0; i < poses.length; i++) poses[i].step(DT);
    },
    rest: () => {
      for (let i = 0; i < poses.length; i++) poses[i].computeVertices();
    },
  };

  const atlas = new TextureAtlas(readFileSync(join(dir, 'skeleton.atlas'), 'utf8'));
  const data = new SkeletonJson(new AtlasAttachmentLoader(atlas)).readSkeletonData(JSON.parse(readFileSync(join(dir, spineJson), 'utf8')));
  const stateData = new AnimationStateData(data);
  const skeletons: Skeleton[] = [];
  const states: AnimationState[] = [];
  const buffer = new Float32Array(1 << 16);
  for (let i = 0; i < n; i++) {
    const skeleton = new Skeleton(data);
    skeleton.setupPose();
    const state = new AnimationState(stateData);
    state.setAnimation(0, animation, true);
    state.apply(skeleton);
    skeleton.update(0);
    skeleton.updateWorldTransform(Physics.reset);
    for (let k = 0; k < stagger(i); k++) {
      state.update(DT);
      state.apply(skeleton);
      skeleton.update(DT);
      skeleton.updateWorldTransform(Physics.update);
    }
    skeletons.push(skeleton);
    states.push(state);
  }
  const b: Arm = {
    name: 'spine-core 4.3.13',
    pose: () => {
      for (let i = 0; i < skeletons.length; i++) {
        states[i].update(DT);
        states[i].apply(skeletons[i]);
        skeletons[i].update(DT);
        skeletons[i].updateWorldTransform(Physics.update);
      }
    },
    rest: () => {
      for (let i = 0; i < skeletons.length; i++) {
        const skeleton = skeletons[i];
        for (const slot of skeleton.drawOrder.appliedPose) {
          if (!slot.bone.active) continue;
          const pose = slot.appliedPose;
          const at = pose.attachment;
          if (at instanceof RegionAttachment) at.computeWorldVertices(slot, at.getOffsets(pose), buffer, 0, 2);
          else if (at instanceof MeshAttachment) at.computeWorldVertices(skeleton, slot, 0, at.worldVerticesLength, buffer, 0, 2);
        }
      }
    },
  };

  const source = frameOf === null ? null : frameOf.frameSource(view, JSON.parse(text));
  const tracks: Array<ReturnType<typeof openTrack>> = [];
  const last: RawPose[] = [];
  for (let i = 0; i < n; i++) {
    const track = openTrack(view, animation, { loop: true, reset: 'animation' });
    let pose = track.first;
    for (let k = 0; k < stagger(i); k++) pose = track.step(DT);
    tracks.push(track);
    last.push(pose);
  }
  let sink: unknown = null;
  const c: Arm = {
    name: frameOf === null ? 'rigc live track.step' : 'rigc live track.step + frameOf',
    pose: () => {
      for (let i = 0; i < tracks.length; i++) last[i] = tracks[i].step(DT);
    },
    rest: () => {
      if (frameOf === null) return;
      for (let i = 0; i < tracks.length; i++) sink = frameOf.frameOf(source, last[i]);
    },
  };
  void sink;
  return { a, b, c };
}

const quantile = (xs: readonly number[], q: number): number => {
  const s = [...xs].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};

function flag(args: readonly string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  if (v === undefined || v.startsWith('--')) throw new BenchInputError(`${name} needs a value`);
  return v;
}

async function main(argv: readonly string[]): Promise<number> {
  const known = ['--animation', '--instances', '--spine-json', '--frames', '--frame-of'];
  const dirs: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (known.includes(argv[i])) i++;
    else if (argv[i].startsWith('--')) throw new BenchInputError(`unknown argument ${argv[i]}; this tool takes ${known.join(', ')}`);
    else dirs.push(resolve(argv[i]));
  }
  if (dirs.length === 0) throw new BenchInputError('name at least one build directory');
  const animation = flag(argv, '--animation') ?? 'walk';
  const counts = (flag(argv, '--instances') ?? '1,100').split(',').map(Number);
  if (counts.some((x) => !Number.isInteger(x) || x < 1)) throw new BenchInputError('--instances takes whole numbers above 0, comma-separated');
  const spineJson = flag(argv, '--spine-json') ?? 'skeleton.json';
  const framesFlag = flag(argv, '--frames');
  const modulePath = flag(argv, '--frame-of');
  let frameOf: FrameOfModule | null = null;
  if (modulePath !== undefined) {
    const loaded: unknown = await import(resolve(modulePath));
    if (!isFrameOfModule(loaded)) throw new BenchInputError(`--frame-of ${modulePath} exports no frameSource and frameOf`);
    frameOf = loaded;
  }

  const child = process.env.RUNTIME_BENCH_ALLOC;
  if (child !== undefined) {
    // The allocation pass: one arm alone, the collector off, the heap's growth over a batch.
    const [dir, nText, key] = child.split('|');
    const n = Number(nText);
    const arm = makeArms(dir, animation, n, spineJson, frameOf)[key as ArmKey];
    const heavy = key === 'c';
    const warm = heavy ? (n === 1 ? 300 : 12) : n === 1 ? 1500 : 60;
    const batch = heavy ? (n === 1 ? 200 : 10) : n === 1 ? 4000 : 200;
    for (let f = 0; f < warm; f++) {
      arm.pose();
      arm.rest();
    }
    const before = process.memoryUsage().heapUsed;
    for (let f = 0; f < batch; f++) {
      arm.pose();
      arm.rest();
    }
    const after = process.memoryUsage().heapUsed;
    console.log(JSON.stringify({ bytesPerFrame: (after - before) / batch }));
    return 0;
  }

  console.log(`runtime_bench: Bun ${Bun.version}, animation "${animation}", dt 1/60, spine-core arm on ${spineJson}; µs per frame for all N instances`);
  console.log('| rig | N | arm | pose p50 | pose p95 | frame p50 | frame p95 | B/frame |');
  console.log('| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |');
  const ratios: string[] = [];
  for (const dir of dirs) {
    for (const n of counts) {
      const arms = makeArms(dir, animation, n, spineJson, frameOf);
      const warm = n === 1 ? 1500 : 60;
      const frames = framesFlag === undefined ? (n === 1 ? 3000 : 240) : Number(framesFlag);
      const pose: Record<ArmKey, number[]> = { a: [], b: [], c: [] };
      const whole: Record<ArmKey, number[]> = { a: [], b: [], c: [] };
      for (let f = 0; f < warm + frames; f++) {
        for (const key of ORDERS[f % 3]) {
          const arm = arms[key as ArmKey];
          const t0 = Bun.nanoseconds();
          arm.pose();
          const t1 = Bun.nanoseconds();
          arm.rest();
          const t2 = Bun.nanoseconds();
          if (f >= warm) {
            pose[key as ArmKey].push((t1 - t0) / 1000);
            whole[key as ArmKey].push((t2 - t0) / 1000);
          }
        }
      }
      const rig = dir.split('/').pop() ?? dir;
      const p50 = { a: quantile(whole.a, 0.5), b: quantile(whole.b, 0.5), c: quantile(whole.c, 0.5) };
      for (const key of ['a', 'b', 'c'] as const) {
        const args = ['bun', import.meta.path, ...argv];
        const run = Bun.spawnSync(args, { env: { ...process.env, RUNTIME_BENCH_ALLOC: `${dir}|${n}|${key}`, BUN_JSC_useGC: '0' } });
        const out = run.stdout.toString().trim().split('\n').pop() ?? '';
        let bytes = 'n/a';
        try {
          bytes = String(Math.round((JSON.parse(out) as { bytesPerFrame: number }).bytesPerFrame));
        } catch {
          bytes = `failed (exit ${run.exitCode})`;
        }
        console.log(`| ${rig} | ${n} | ${key} ${arms[key].name} | ${quantile(pose[key], 0.5).toFixed(1)} | ${quantile(pose[key], 0.95).toFixed(1)} | ${quantile(whole[key], 0.5).toFixed(1)} | ${quantile(whole[key], 0.95).toFixed(1)} | ${bytes} |`);
      }
      ratios.push(`${rig} N=${n}: runtime/spine-core ${(p50.a / p50.b).toFixed(2)}x, live/spine-core ${(p50.c / p50.b).toFixed(2)}x, live/runtime ${(p50.c / p50.a).toFixed(2)}x (frame p50)`);
    }
  }
  for (const line of ratios) console.log(line);
  return 0;
}

if (import.meta.main) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err: unknown) => {
      if (err instanceof BenchInputError) {
        console.error(`runtime_bench: ${err.message}`);
        process.exit(2);
      }
      throw err;
    },
  );
}
