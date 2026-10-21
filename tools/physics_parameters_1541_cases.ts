/** Public, stimulated fixtures for issue #1541. Importing runs nothing. */
import { AnimationState, AnimationStateData, AtlasAttachmentLoader, Physics, Skeleton, SkeletonJson, TextureAtlas } from '@esotericsoftware/spine-core';
import { CoreInputError, openTrack, openTracks, readModel, type CompiledDocument, type LiveTrack, type LiveTracks, type PhysicsParameters, type PhysicsParameterPatch, type RawPose, type RawReset } from '../src/core/entry.ts';
import { openRawTrack, stepRawTrack } from '../src/core/raw.ts';
import { stepPhysics, type PhysicsStepContext } from '../src/core/constraints_physics.ts';
import type { TimelinePlant } from '../src/core/animation.ts';
import { sliderPhysicsPair, type SliderPhysicsShape } from './core_gate.ts';

const FIELDS = ['strength', 'damping', 'inertia', 'wind', 'gravity', 'mix'] as const;
const PATCH: PhysicsParameters = { strength: 45, damping: 0.3, inertia: 0.8, wind: 3, gravity: -4, mix: 0.25 };
const MATRIX = ['a', 'b', 'c', 'd', 'worldX', 'worldY'] as const;
type Kind = 'single' | 'composed';
const KINDS: Kind[] = ['single', 'composed'];
const RESETS: RawReset[] = ['animation', 'setup'];
type Say = (name: string, problems: string[], detail: string) => void;
const bits = (value: unknown): string => JSON.stringify(value, (_k, v: unknown) => typeof v === 'number' ? Object.is(v, -0) ? '-0' : String(v) : v);
const six = (r: PhysicsParameters): PhysicsParameters => ({ strength: r.strength, damping: r.damping, inertia: r.inertia, wind: r.wind, gravity: r.gravity, mix: r.mix });

/** A moving root excites two independent springs; a third is skin-required and never listed. */
export function physics1541Fixture(keyed = false, slider = false): { doc: CompiledDocument; spine: string; model: string } {
  const shape: SliderPhysicsShape = {
    rotations: [0, 0],
    physics: [
      { name: 'spring', bone: 'tip', fields: { x: 1, y: 1, strength: 90, damping: 0.75, inertia: 0.6, wind: 0.2, gravity: 0.1, mix: 0.9 } },
      { name: 'defaults', bone: 'tip2', fields: { x: 1 } },
      { name: 'sleep', bone: 'tip2', fields: { x: 1, skin: true } },
    ],
    sliders: [{ name: 'dial', animation: 'dialled', fields: { time: 0.5, mix: slider ? 1 : 0 } }],
    order: ['dial', 'spring', 'defaults', 'sleep'],
    animations: [
      { name: 'move', bones: [{ bone: 'root', timeline: 'translate', keys: [{ time: 0, x: 0, y: 0 }, { time: 1, x: 30, y: 10 }] }], physics: keyed ? FIELDS.map((kind, i) => ({ name: 'spring', kind, keys: [{ time: 0, value: i + 2 }, { time: 1, value: i + 4 }] })) : [], sliders: [] },
      { name: 'other', bones: [{ bone: 'root', timeline: 'translate', keys: [{ time: 0, x: 0, y: 0 }, { time: 1, x: -30, y: -10 }] }], physics: [], sliders: [] },
      { name: 'dialled', bones: [], physics: FIELDS.map((kind, i) => ({ name: 'spring', kind, keys: [{ time: 0, value: i + 12 }, { time: 1, value: i + 14 }] })), sliders: [] },
    ],
  };
  // All keyed damping/mix numbers are finite by design, but keep the stimulated
  // oracle separate: precedence is a readback claim, not a range/sensitivity claim.
  const pair = sliderPhysicsPair(shape);
  return { ...pair, doc: readModel(pair.model) };
}

function opened(doc: CompiledDocument, kind: Kind, reset: RawReset = 'animation', loop = false, plant: TimelinePlant = {}): LiveTrack | LiveTracks {
  if (kind === 'single') return openTrack(doc, 'move', { loop, reset }, plant);
  const track = openTracks(doc, { reset }, plant);
  track.setAnimation(0, 'move', { loop, mixDuration: 0 });
  track.start();
  return track;
}

function nativeFixture(spine: string): Skeleton {
  return new Skeleton(new SkeletonJson(new AtlasAttachmentLoader(new TextureAtlas(''))).readSkeletonData(JSON.parse(spine)));
}

export function physicsParameter1541Cases(say: Say): void {
  const fixture = physics1541Fixture();
  const source = bits(fixture.doc);
  const native = nativeFixture(fixture.spine);
  const setup = new Map(native.physics.map((p) => [p.data.name, six(p.pose)]));

  for (const kind of KINDS) for (const name of ['spring', 'defaults']) for (const field of FIELDS) {
    const problems: string[] = [];
    for (const reset of RESETS) {
      const track = opened(fixture.doc, kind, reset);
      const initial = track.readPhysicsParameters(name);
      const expected = setup.get(name) as PhysicsParameters;
      if (initial.override !== null || bits(initial.effective) !== bits(expected)) problems.push(`${reset}: initial ${bits(initial)}, native ${bits(expected)}`);
      const patch = { [field]: PATCH[field] };
      track.setPhysicsParameters(name, patch);
      patch[field] = 12345; // Setter must have copied the caller's patch.
      const pending = track.readPhysicsParameters(name);
      if (pending.override?.[field] !== PATCH[field] || bits(pending.effective) !== bits(expected)) problems.push(`${reset}: pending/evaluated values conflated or patch aliased`);
      track.step(1 / 60);
      const applied = track.readPhysicsParameters(name);
      if (bits(applied.effective) !== bits({ ...expected, [field]: PATCH[field] })) problems.push(`${reset}: ${field} did not replace exactly one evaluated field: ${bits(applied)}`);
      track.clearPhysicsParameters(name);
      if (track.readPhysicsParameters(name).override !== null || bits(track.readPhysicsParameters(name).effective) !== bits(applied.effective)) problems.push(`${reset}: clear fabricated a newly evaluated value`);
      track.step(1 / 60);
      if (bits(track.readPhysicsParameters(name).effective) !== bits(expected)) problems.push(`${reset}: clear did not resume resolved authored/default values`);
    }
    say(`PP1541_${kind.toUpperCase()}_${name.toUpperCase()}_${field.toUpperCase()}`, problems, `both resets: set/read/clear ${name}.${field}; expected six values read from the official parser, not restated defaults`);
  }

  for (const kind of KINDS) {
    const problems: string[] = [];
    const track = opened(fixture.doc, kind);
    const other = opened(fixture.doc, kind);
    track.setPhysicsParameters('spring', { damping: 0.2 });
    track.setPhysicsParameters('spring', { wind: -7 });
    const before = bits(['spring', 'defaults', 'sleep'].map((name) => track.readPhysicsParameters(name)));
    const untouched = bits(['spring', 'defaults', 'sleep'].map((name) => other.readPhysicsParameters(name)));
    const invalid: Array<[string, () => void, string[]]> = [
      ['unknown name', () => track.setPhysicsParameters('missing', { mix: 1 }), ['missing', 'no constraint']],
      ['wrong kind', () => track.setPhysicsParameters('dial', { mix: 1 }), ['dial', 'slider', 'not physics']],
      ['unknown field', () => track.setPhysicsParameters('spring', { wind: 99, mass: 2 } as PhysicsParameterPatch), ['spring', 'mass', 'unknown']],
      ['symbol field', () => track.setPhysicsParameters('spring', { wind: 99, [Symbol('bad')]: 2 }), ['spring', 'Symbol(bad)', 'unknown']],
      ...[NaN, Infinity, -Infinity, undefined, '0.5'].map((v): [string, () => void, string[]] => [String(v), () => track.setPhysicsParameters('spring', { wind: 99, damping: v } as PhysicsParameterPatch), ['spring', 'damping', 'finite']]),
      ['null patch', () => track.setPhysicsParameters('spring', null as unknown as PhysicsParameterPatch), ['spring', 'object']],
      ['read unknown', () => { track.readPhysicsParameters('missing'); }, ['missing', 'no constraint']],
      ['clear wrong kind', () => track.clearPhysicsParameters('dial'), ['dial', 'not physics']],
    ];
    for (const [label, op, fragments] of invalid) {
      let error: unknown;
      try { op(); } catch (e) { error = e; }
      if (!(error instanceof CoreInputError) || fragments.some((f) => !error.message.includes(f))) problems.push(`${label}: expected named CoreInputError, got ${String(error)}`);
      if (bits(['spring', 'defaults', 'sleep'].map((name) => track.readPhysicsParameters(name))) !== before) problems.push(`${label}: a constraint changed on refusal`);
      if (bits(['spring', 'defaults', 'sleep'].map((name) => other.readPhysicsParameters(name))) !== untouched || bits(fixture.doc) !== source) problems.push(`${label}: shared document or other track changed`);
    }
    const snap = track.readPhysicsParameters('spring');
    if (snap.override !== null) (snap.override as Record<string, number>).damping = 789;
    if (snap.effective !== null) (snap.effective as unknown as Record<string, number>).mix = 789;
    if (bits(track.readPhysicsParameters('spring')) !== bits(JSON.parse(before)[0])) problems.push('readback aliases live state');
    track.setPhysicsParameters('spring', {});
    if (bits(track.readPhysicsParameters('spring').override) !== bits({ damping: 0.2, wind: -7 })) problems.push('empty patch replaced existing fields');
    const unrestricted: PhysicsParameters = { strength: -2, damping: -3, inertia: 4, wind: -5, gravity: 6, mix: -7 };
    track.setPhysicsParameters('spring', unrestricted);
    if (bits(track.readPhysicsParameters('spring').override) !== bits({ damping: -3, wind: -5, strength: -2, inertia: 4, gravity: 6, mix: -7 })) problems.push('finite fields were clamped or converted');
    say(`PP1541_${kind.toUpperCase()}_ATOMIC_REFUSALS_AND_SNAPSHOTS`, problems, `${invalid.length} named refusals preserve every constraint and another instance; merged patches and detached input/read snapshots; finite values unclamped`);
  }

  {
    const problems: string[] = [];
    for (const reset of RESETS) {
      const track = openTracks(fixture.doc, { reset });
      for (const name of ['spring', 'defaults', 'sleep']) if (track.readPhysicsParameters(name).effective !== null) problems.push(`${reset}/${name}: invented a pre-start effective value`);
      track.setPhysicsParameters('spring', { damping: 0.2 });
      if (track.readPhysicsParameters('spring').effective !== null) problems.push(`${reset}: setting before start invented an evaluation`);
      track.setAnimation(0, 'move', { loop: true, mixDuration: 0 });
      track.start();
      if (track.readPhysicsParameters('spring').effective?.damping !== 0.2) problems.push(`${reset}: pre-start patch missed pose 0`);
    }
    for (const kind of KINDS) {
      const inactive = opened(fixture.doc, kind);
      inactive.setPhysicsParameters('sleep', { damping: 0.2 });
      inactive.step(1 / 60);
      const value = inactive.readPhysicsParameters('sleep');
      if (value.override?.damping !== 0.2 || value.effective !== null) problems.push(`${kind}: inactive constraint fabricated effective values`);
      inactive.clearPhysicsParameters('sleep');
      if (inactive.readPhysicsParameters('sleep').override !== null) problems.push(`${kind}: inactive clear failed`);
    }
    say('PP1541_UNEVALUATED_IS_NULL', problems, 'composed before start and both kinds with an inactive skin-required constraint return null effective; pre-start patch is used at start');
  }

  {
    const problems: string[] = [];
    const input: Record<string, unknown> = JSON.parse(fixture.model);
    input.constraints = [];
    input.animations = (input.animations as unknown[]).slice(0, 2);
    const doc = readModel(JSON.stringify(input));
    const before = bits(doc);
    for (const kind of KINDS) {
      const track = opened(doc, kind);
      for (const call of [() => track.setPhysicsParameters('spring', { damping: 1 }), () => track.readPhysicsParameters('spring'), () => track.clearPhysicsParameters('spring')]) {
        let error: unknown;
        try { call(); } catch (e) { error = e; }
        if (!(error instanceof CoreInputError) || !error.message.includes('spring') || !error.message.includes('declares []')) problems.push(`${kind}: zero-physics name refusal ${String(error)}`);
      }
      track.step(1 / 60);
    }
    if (bits(doc) !== before) problems.push('zero-physics source changed');
    say('PP1541_NO_PHYSICS_REFUSES_BY_NAME', problems, 'both track kinds continue posing a zero-constraint document; set/read/clear refuse a missing name without adding constraints');
  }

  {
    const problems: string[] = [];
    for (const kind of KINDS) for (const reset of RESETS) {
      const f = physics1541Fixture(kind === 'single', true);
      const track = opened(f.doc, kind, reset);
      const control = opened(f.doc, kind, reset);
      track.setPhysicsParameters('spring', PATCH);
      track.step(0);
      control.step(0);
      if (bits(track.readPhysicsParameters('spring').effective) !== bits(PATCH)) problems.push(`${kind}/${reset}: slider or keys won over patch`);
      if (bits(control.readPhysicsParameters('spring').effective) === bits(PATCH)) problems.push(`${kind}/${reset}: precedence fixture measured no disagreement`);
      track.clearPhysicsParameters('spring');
      track.step(0);
      if (bits(track.readPhysicsParameters('spring').effective) !== bits(control.readPhysicsParameters('spring').effective)) problems.push(`${kind}/${reset}: clear did not resume keyed/slider values`);
    }
    // Without a slider, the keyed value must resume too, not the setup default.
    const keyed = opened(physics1541Fixture(true).doc, 'single');
    keyed.setPhysicsParameters('spring', { wind: 200 });
    keyed.step(0.25);
    keyed.clearPhysicsParameters('spring');
    keyed.step(0.25);
    if (keyed.readPhysicsParameters('spring').effective?.wind !== 6) problems.push(`keyed clear: wind ${keyed.readPhysicsParameters('spring').effective?.wind}, required literal key interpolation 6 at 0.5`);
    say('PP1541_KEYS_SLIDERS_BEFORE_OVERRIDES', problems, 'all six overrides beat keyed and slider fields; clear resumes slider values and wind key interpolation, not setup; composed constraint timelines remain outside its existing mixing contract');
  }

  {
    const problems: string[] = [];
    for (const kind of KINDS) {
      const track = opened(fixture.doc, kind, 'animation', true);
      track.setPhysicsParameters('spring', { damping: 0.2 });
      for (const dt of [0.4, 0.4, 0.4]) track.step(dt);
      if (track.readPhysicsParameters('spring').effective?.damping !== 0.2) problems.push(`${kind}: loop lost the patch`);
      if (kind === 'composed') {
        const composed = track as LiveTracks;
        composed.setAnimation(0, 'other', { loop: true, mixDuration: 0 });
        composed.step(1 / 60);
        if (composed.readPhysicsParameters('spring').effective?.damping !== 0.2) problems.push('entry replacement lost the patch');
        composed.setEmptyAnimation(0, 0);
        composed.step(1 / 60);
        if (composed.readPhysicsParameters('spring').effective?.damping !== 0.2) problems.push('empty entries lost the patch');
      }
    }
    say('PP1541_PATCH_LIFETIME', problems, 'patch persists over wrap, current-entry replacement and mixing composed animation entries out to nothing');
  }

  {
    const problems: string[] = [];
    let moved = 0;
    let maxDelta = 0;
    let historyDelta = 0;
    let samples = 0;
    for (const kind of KINDS) for (const reset of RESETS) {
      const observed: { ctx?: PhysicsStepContext } = {};
      const track = opened(fixture.doc, kind, reset, false, { physicsStep: (r, w, length, ctx) => { observed.ctx = ctx; return stepPhysics(r, w, length, ctx); } });
      const control = opened(fixture.doc, kind, reset);
      const reference = nativeFixture(fixture.spine);
      const state = new AnimationState(new AnimationStateData(reference.data));
      state.setAnimation(0, 'move', false);
      reference.setupPose();
      if (reset === 'animation') state.apply(reference);
      reference.update(0);
      reference.updateWorldTransform(Physics.reset);
      const spring = reference.physics.find((p) => p.data.name === 'spring');
      if (spring === undefined) throw new Error('official fixture lost spring');
      const stepNative = (dt: number, damping: number | null): void => {
        state.update(dt);
        reference.setupPoseBones();
        state.apply(reference);
        if (damping !== null) spring.pose.damping = damping;
        reference.update(dt);
        reference.updateWorldTransform(Physics.update);
      };
      const compare = (pose: RawPose): void => {
        for (const bone of pose.bones) {
          const native = reference.findBone(bone.name)?.appliedPose;
          if (native === undefined) { problems.push(`missing native bone ${bone.name}`); continue; }
          for (const field of MATRIX) {
            const delta = Math.abs(bone[field] - native[field]);
            maxDelta = Math.max(maxDelta, delta);
            if (!Object.is(bone[field], native[field])) problems.push(`${kind}/${reset}/${bone.name}.${field}: ${bone[field]} != ${native[field]}`);
          }
        }
        samples++;
      };
      for (let i = 0; i < 12; i++) { const pose = track.step(1 / 60); control.step(1 / 60); stepNative(1 / 60, null); compare(pose); }
      track.setPhysicsParameters('spring', { damping: 0.1 });
      // A measured impulse, equal on every engine and control, keeps damping
      // sensitivity from being inferred from constant-speed motion near rest.
      track.physicsTranslate(20, -10);
      control.physicsTranslate(20, -10);
      reference.physicsTranslate(20, -10);
      // A 24 fps display step spans 2.5 fixed steps. At an exact whole-step
      // boundary this runtime displays the preceding lag, hiding the changed
      // damping until another displayed frame; do not count ulp noise as motion.
      const changed = track.step(1 / 24);
      const unchanged = control.step(1 / 24);
      stepNative(1 / 24, 0.1);
      compare(changed);
      const nextDelta = Math.max(...changed.bones.flatMap((b, i) => MATRIX.map((f) => Math.abs(b[f] - unchanged.bones[i][f]))));
      if (!(nextDelta > 1e-6)) problems.push(`${kind}/${reset}: next-step difference ${nextDelta} did not exceed the fixture's 1e-6 sensitivity floor`);
      moved = Math.max(moved, nextDelta);
      for (let i = 0; i < 5; i++) { const p = track.step(1 / 60); stepNative(1 / 60, 0.1); compare(p); }
      const retained = [spring.xVelocity, spring.yVelocity, spring.xOffset, spring.yOffset];
      if (retained.every((v) => v === 0)) problems.push(`${kind}/${reset}: history fixture contains no velocity/offset`);
      const ctx = observed.ctx;
      if (ctx === undefined) throw new Error('physics observer saw no step');
      const historyBefore = bits([ctx.time, [...ctx.states]]);
      const statesBefore = new Map(ctx.states);
      track.clearPhysicsParameters('spring');
      if (bits([ctx.time, [...ctx.states]]) !== historyBefore || [...statesBefore].some(([name, value]) => ctx.states.get(name) !== value)) problems.push(`${kind}/${reset}: clear reset/replaced physics state or clock`);
      const continued = track.step(1 / 60);
      stepNative(1 / 60, null);
      compare(continued);
      if (bits(track.readPhysicsParameters('spring').effective) !== bits(setup.get('spring'))) problems.push('clear did not resume native authored parameters');
      // The oracle above continues the exact parameter/step history. A fresh
      // trajectory is a rejected equality bar, measured separately below.
      const resetTrack = opened(fixture.doc, kind, reset);
      // Replaying a new track only to the same time has a different parameter
      // history too: do not use it to assert equality after clear.
      const freshAtTime = resetTrack.step(track.trackTime);
      historyDelta = Math.max(historyDelta, ...continued.bones.flatMap((b, i) => MATRIX.map((f) => Math.abs(b[f] - freshAtTime.bones[i][f]))));
      if (spring.xVelocity === 0 && spring.yVelocity === 0) problems.push(`${kind}/${reset}: oracle continuation has no retained velocity`);
    }
    if (historyDelta === 0) problems.push('a fresh trajectory was indistinguishable; history was not exercised');
    say('PP1541_STIMULATED_DAMPING_OFFICIAL_ORACLE', problems, `${samples} pose comparisons, every matrix cell tolerance 0; max delta ${maxDelta}; next-step override/control delta ${moved}; fresh-history difference ${historyDelta}; clear continues official velocities and offsets`);
  }

  {
    const problems: string[] = [];
    let poses = 0;
    for (const reset of RESETS) for (const loop of [false, true]) {
      const single = openTrack(fixture.doc, 'move', { reset, loop });
      const composed = openTracks(fixture.doc, { reset });
      composed.setAnimation(0, 'move', { loop, mixDuration: 0 });
      const raw = openRawTrack(fixture.doc, 'move', {}, reset, { loop, keep: false, ...(loop ? { live: true } : {}) });
      if (bits(single.first) !== bits(raw.first) || bits(composed.start()) !== bits(raw.first)) problems.push(`${reset}/${loop}: no-override first pose differs from raw path`);
      for (const dt of [0, 1 / 60, 0.125, 0.4, 0.6, 1 / 60]) {
        const a = single.step(dt), b = composed.step(dt), c = stepRawTrack(raw.track, dt);
        if (bits(a) !== bits(c) || bits(b) !== bits(c)) problems.push(`${reset}/${loop}: no-override output differs at ${single.trackTime}`);
        poses++;
      }
    }
    if (bits(fixture.doc) !== source) problems.push('tests mutated source');
    say('PP1541_NO_OVERRIDE_BYTE_IDENTITY', problems, `${poses} stepped poses plus reset poses: single/composed JSON bytes identical to the raw path with no parameter layer, held/looped and both resets; source unchanged`);
  }
}

if (import.meta.main) {
  let bad = 0;
  physicsParameter1541Cases((name, problems, detail) => {
    console.log(`  ${problems.length === 0 ? 'PASS' : 'FAIL'}  ${name}: ${problems.length === 0 ? detail : problems.join('; ')}`);
    bad += Number(problems.length !== 0);
  });
  process.exitCode = bad === 0 ? 0 : 1;
}
