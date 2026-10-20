/** Native-oracle regression for stepped transverse scale (issue #1453).
 * Importing this module runs no cases, writes nothing and changes no exit code.
 */
import { AtlasAttachmentLoader, Physics, Skeleton, SkeletonJson, TextureAtlas } from '@esotericsoftware/spine-core';
import { freshStepContext, physicsState, readPhysicsRecord, stepPhysics, type PhysicsStepper } from '../src/core/constraints_physics.ts';
import { worldTransforms, type CoreWorld } from '../src/core/world.ts';
import type { ModelBone } from '../src/model.ts';

const FIELDS = ['a', 'b', 'c', 'd', 'worldX', 'worldY'] as const;
const MODES = ['none', 'uniform', 'volume'] as const;
type Mode = (typeof MODES)[number];

interface Sample {
  time: number;
  native: CoreWorld;
  core: CoreWorld;
  nativeArea: number;
  coreArea: number;
  maxDelta: number;
}
interface Reading {
  name: string;
  mode: Mode;
  samples: Sample[];
  maxDelta: number;
  scaleMoved: boolean;
}
export interface PhysicsScaleCases {
  ok: boolean;
  problems: string[];
  readings: Reading[];
  rejected: { mode: Mode; maxDelta: number }[];
}
const snapshot = (w: CoreWorld): CoreWorld => ({ a: w.a, b: w.b, c: w.c, d: w.d, worldX: w.worldX, worldY: w.worldY });
const area = (w: CoreWorld): number => w.a * w.d - w.b * w.c;

/** Both engines start from the same bone, force environment and finite state.
 * The seeded cases hold the clock at zero to isolate the displayed scale's
 * branch, not to prescribe a separate solver or forge a runtime result.
 */
function reading(mode: Mode, bone: ModelBone, seed: number | null, step: PhysicsStepper): Reading {
  const raw = { bone: bone.name, scaleX: 1, scaleY: mode, x: 0, y: 0, rotate: 0, shearX: 0,
    gravity: 1, wind: 0, inertia: 0.5, strength: 100, damping: 0.85, mass: 1, fps: 60, mix: 1 };
  const input = { skeleton: { spine: '4.3.13', referenceScale: 100 }, bones: [bone],
    constraints: [{ type: 'physics', name: 'scale', ...raw }], slots: [], skins: [], animations: {} };
  const native = new Skeleton(new SkeletonJson(new AtlasAttachmentLoader(new TextureAtlas(''))).readSkeletonData(input));
  native.gravityX = 1;
  native.gravityY = 0;
  native.windX = 1;
  native.windY = 0;
  const problems: string[] = [];
  const record = readPhysicsRecord(raw, 'scale', 'scale-mode probe', new Set([bone.name]), 100, problems);
  if (record === undefined || problems.length) throw new Error(`scale-mode probe: ${problems.join('; ')}`);
  const ctx = freshStepContext();
  ctx.env = { wind: [1, 0], gravity: [1, 0] };
  const fresh = (): CoreWorld => {
    const w = worldTransforms([bone]).get(bone.name);
    if (w === undefined) throw new Error(`scale-mode probe: missing setup bone ${bone.name}`);
    return w;
  };
  native.updateWorldTransform(Physics.reset);
  step(record, fresh(), bone.length ?? 0, ctx);
  const initial = snapshot(native.bones[0].appliedPose);
  if (seed !== null) {
    native.physics[0].scaleOffset = seed;
    physicsState(ctx, 'scale').scaleOffset = seed;
  }
  const samples: Sample[] = [];
  const times = seed === null ? Array.from({ length: 13 }, (_, i) => i / 60) : [0];
  for (const time of times) {
    native.time = time;
    native.updateWorldTransform(Physics.update);
    ctx.time = time;
    ctx.phase = 'update';
    const w = fresh();
    step(record, w, bone.length ?? 0, ctx);
    const n = snapshot(native.bones[0].appliedPose);
    const c = snapshot(w);
    const maxDelta = Math.max(...FIELDS.map((k) => Math.abs(n[k] - c[k])));
    samples.push({ time, native: n, core: c, nativeArea: area(n), coreArea: area(c), maxDelta });
  }
  return { name: `${bone.rotation === undefined ? 'axis-aligned' : 'rotated/sheared'} ${seed === null ? 'gravity walk' : `seed ${seed}`}`,
    mode, samples, maxDelta: Math.max(...samples.map((s) => s.maxDelta)),
    scaleMoved: samples.some((s) => s.native.a !== initial.a || s.native.c !== initial.c) };
}

/** The same cases are called by selftest CO58 and the standalone command. */
export function physicsScaleCases(step: PhysicsStepper = stepPhysics): PhysicsScaleCases {
  const problems: string[] = [];
  const readings: Reading[] = [];
  const bone = { name: 'root', length: 40 };
  for (const mode of MODES) readings.push(reading(mode, bone, null, step));
  // These finite, stated offsets produce k=-1,-0.8,0,0.5,0.7,1,1.25.
  // The oracle, not a copied reciprocal formula, supplies every expected column.
  for (const setup of [bone, { ...bone, rotation: 37, shearX: 11, shearY: -13, scaleX: 0.8, scaleY: 1.2 }]) {
    for (const seed of [-2, -1.8, -1, -0.5, -0.3, 0, 0.25]) {
      for (const mode of MODES) readings.push(reading(mode, setup, seed, step));
    }
  }
  for (const r of readings) {
    for (const s of r.samples) {
      if (!FIELDS.every((k) => Number.isFinite(s.native[k]) && Number.isFinite(s.core[k]))) problems.push(`${r.name}/${r.mode} at ${s.time}: nonfinite matrix`);
      if (s.maxDelta !== 0 || s.nativeArea !== s.coreArea) problems.push(`${r.name}/${r.mode} at ${s.time}: matrix delta ${s.maxDelta}, signed areas ${s.nativeArea}/${s.coreArea}`);
    }
  }
  if (!readings.slice(0, MODES.length).every((r) => r.scaleMoved)) problems.push('gravity walk: scale never moved in at least one mode');
  // A planted omission on a separate step, never a source rewrite: both modes
  // must be detected with the same positive input. None is its positive control.
  const omitted: PhysicsStepper = (r, w, length, ctx) => step({ ...r, scaleYMode: 'None' }, w, length, ctx);
  const rejected = MODES.map((mode) => ({ mode, maxDelta: reading(mode, bone, null, omitted).maxDelta }));
  for (const r of rejected) {
    if (r.mode === 'none' ? r.maxDelta !== 0 : !(r.maxDelta > 0)) problems.push(`omitted transverse ${r.mode}: delta ${r.maxDelta}, expected ${r.mode === 'none' ? 'exact positive control' : 'detected mismatch'}`);
  }
  return { ok: problems.length === 0, problems, readings, rejected };
}

if (import.meta.main) {
  const result = physicsScaleCases();
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.ok ? 0 : 1;
}
