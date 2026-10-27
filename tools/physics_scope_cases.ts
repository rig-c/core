/** Scoped live physics movement controls. Importing this module runs nothing. */
import { createHash } from 'node:crypto';
import { AtlasAttachmentLoader, Physics, Skeleton, SkeletonJson, TextureAtlas } from '@esotericsoftware/spine-core';
import { CoreInputError, openTrack, openTracks, readModel, type CompiledDocument, type LiveTrack, type LiveTracks, type RawReset } from '../src/core/entry.ts';
import type { PhysicsState, PhysicsStepContext } from '../src/core/constraints_physics.ts';
import { physics1541Fixture } from './physics_parameters_1541_cases.ts';

const bits = (value: unknown): string => JSON.stringify(value, (_key, v: unknown) => typeof v === 'number' ? Object.is(v, -0) ? '-0' : String(v) : v);
const digest = (value: unknown): string => createHash('sha256').update(bits(value)).digest('hex');
const origins = ['ux', 'uy', 'cx', 'cy'] as const;
const stateOf = (live: LiveTrack | LiveTracks): PhysicsStepContext => 'first' in live
  ? (live as unknown as { track: { ctx: PhysicsStepContext } }).track.ctx
  : (live as unknown as { path: { ctx: PhysicsStepContext } }).path.ctx;
const stateBits = (ctx: PhysicsStepContext): string => bits([...ctx.states]);

function opened(doc: CompiledDocument, kind: 'single' | 'composed', reset: RawReset): LiveTrack | LiveTracks {
  if (kind === 'single') return openTrack(doc, 'move', { loop: true, reset });
  const live = openTracks(doc, { reset });
  live.setAnimation(0, 'move', { loop: true, mixDuration: 0 });
  live.start();
  return live;
}

export function physicsScopeCases(omitScope = false): { ok: boolean; problems: string[]; checks: number; unscoped: Record<string, string>; omittedScopeDetected: boolean } {
  // The shared helper's actual tip2 parent is tip; make BOTH independent
  // reader inputs explicit siblings instead of trusting its prose.
  const pair = physics1541Fixture();
  const model = JSON.parse(pair.model) as { bones: Array<{ name: string; parent?: string }> };
  const nativeInput = JSON.parse(pair.spine) as { bones: Array<{ name: string; parent?: string }> };
  for (const input of [model, nativeInput]) {
    const outside = input.bones.find((b) => b.name === 'tip2');
    if (outside === undefined) throw new Error('scope control: missing independent tip2');
    outside.parent = 'block';
  }
  const doc = readModel(JSON.stringify(model));
  const spine = JSON.stringify(nativeInput);
  const source = bits(doc);
  const problems: string[] = [];
  let checks = 0;
  const check = (ok: boolean, label: string): void => { checks++; if (!ok) problems.push(label); };
  const unscoped: Record<string, string> = {};
  for (const kind of ['single', 'composed'] as const) for (const reset of ['animation', 'setup'] as const) {
    const label = `${kind}/${reset}`;
    const open = (): LiveTrack | LiveTracks => opened(doc, kind, reset);
    const warmed = (): LiveTrack | LiveTracks => { const live = open(); live.step(1 / 60); live.step(1 / 30); return live; };
    const translate = (live: LiveTrack | LiveTracks, scope: readonly string[]): void => live.physicsTranslate(3, -2, omitScope ? undefined : scope);
    const rotate = (live: LiveTrack | LiveTracks, scope: readonly string[]): void => live.physicsRotate(11, -7, 9, omitScope ? undefined : scope);

    for (const operation of ['translate', 'rotate'] as const) {
      const live = warmed(), baseline = warmed();
      const ctx = stateOf(live), before = stateBits(ctx);
      const originalMap = ctx.states;
      const outside = ctx.states.get('defaults') as PhysicsState;
      const outsideBefore = bits(outside);
      const selected = ctx.states.get('spring') as PhysicsState;
      const selectedBefore = { ...selected };
      const clocks = bits([ctx.time, ctx.phase, ctx.last, live.trackTime]);
      const native = new Skeleton(new SkeletonJson(new AtlasAttachmentLoader(new TextureAtlas(''))).readSkeletonData(JSON.parse(spine)));
      native.updateWorldTransform(Physics.reset);
      const nativeState = native.physics.find((p) => p.data.name === 'spring');
      if (nativeState === undefined) throw new Error('scope control: missing native spring');
      for (const field of origins) nativeState[field] = selected[field];
      if (operation === 'translate') { nativeState.translate(3, -2); translate(live, ['spring']); }
      else { nativeState.rotate(11, -7, 9); rotate(live, ['spring']); }
      check(ctx.states === originalMap && ctx.states.get('defaults') === outside, `${label}/${operation}: map/state identity changed`);
      check(bits(outside) === outsideBefore, `${label}/${operation}: outsider state changed at input`);
      check(bits([ctx.time, ctx.phase, ctx.last, live.trackTime]) === clocks, `${label}/${operation}: input changed clocks`);
      check(origins.every((f) => Object.is(selected[f], nativeState[f])), `${label}/${operation}: selected origin differs from official constraint operation`);
      check(origins.some((f) => !Object.is(selected[f], selectedBefore[f])), `${label}/${operation}: input did not move selected origin`);
      check(Object.keys(selectedBefore).filter((k) => !origins.includes(k as typeof origins[number])).every((k) => Object.is(selected[k as keyof PhysicsState], selectedBefore[k as keyof PhysicsState])), `${label}/${operation}: non-origin field changed`);
      check(before !== stateBits(ctx), `${label}/${operation}: vacuous state comparison`);
      for (let frame = 0; frame < 12; frame++) {
        const actual = live.step(1 / 60), ordinary = baseline.step(1 / 60);
        check(bits(ctx.states.get('defaults')) === bits(stateOf(baseline).states.get('defaults')), `${label}/${operation}/${frame}: independent outsider differs after step`);
        check(bits(actual.bones.find((b) => b.name === 'tip2')) === bits(ordinary.bones.find((b) => b.name === 'tip2')), `${label}/${operation}/${frame}: independent outsider bone differs after step`);
      }
    }

    // Scope omission preserves a pre-change trace, saved by the red/green run.
    // Explicit all/repeated names must execute once per state in original order.
    const all = warmed(), explicit = warmed(), empty = warmed(), ordinary = warmed();
    const trace: unknown[] = [];
    for (let frame = 0; frame < 16; frame++) {
      all.physicsTranslate(0.25, -0.5); all.physicsRotate(11, -7, 2);
      explicit.physicsTranslate(0.25, -0.5, ['defaults', 'spring', 'sleep', 'spring']);
      explicit.physicsRotate(11, -7, 2, ['spring', 'defaults', 'sleep']);
      const emptyBefore = stateBits(stateOf(empty));
      translate(empty, []); rotate(empty, []);
      check(stateBits(stateOf(empty)) === emptyBefore, `${label}/${frame}: empty scope changed state`);
      const a = all.step(1 / 60), b = explicit.step(1 / 60), e = empty.step(1 / 60), o = ordinary.step(1 / 60);
      check(bits(a) === bits(b) && stateBits(stateOf(all)) === stateBits(stateOf(explicit)), `${label}/${frame}: unscoped vs all names differs`);
      check(bits(e) === bits(o), `${label}/${frame}: empty scope differs from no input`);
      trace.push([a, [...stateOf(all).states]]);
    }
    unscoped[label] = digest(trace);

    const refused = warmed();
    const refusalCtx = stateOf(refused);
    const invalid = [['spring', 'missing'], ['spring', 'dial'], ['spring', 7], 'spring', null] as unknown as readonly (readonly string[])[];
    for (const scope of invalid) for (const operation of ['translate', 'rotate'] as const) {
      const before = stateBits(refusalCtx), clock = refused.trackTime;
      let error: unknown;
      try { if (operation === 'translate') translate(refused, scope); else rotate(refused, scope); } catch (e) { error = e; }
      const name = Array.isArray(scope) ? String(scope[1]) : 'scope';
      check(error instanceof CoreInputError && error.message.includes(name), `${label}/${operation}: invalid ${name} accepted or not named`);
      check(before === stateBits(refusalCtx) && clock === refused.trackTime, `${label}/${operation}: invalid scope mutated state before refusal`);
    }
    const absent = warmed(), absentBefore = stateBits(stateOf(absent));
    translate(absent, ['sleep']); rotate(absent, ['sleep']);
    check(stateBits(stateOf(absent)) === absentBefore && !stateOf(absent).states.has('sleep'), `${label}: inactive declared name created or changed state`);
    const fresh = open(), freshBefore = bits([...stateOf(fresh).states]);
    try { fresh.physicsTranslate(1, 0, ['missing']); check(false, `${label}: nonexistent name accepted before warmup`); }
    catch (e) { check(e instanceof CoreInputError && e.message.includes('missing'), `${label}: cold refusal not named`); }
    check(bits([...stateOf(fresh).states]) === freshBefore, `${label}: cold refusal changed state`);
  }
  // Constraint names are namespaced by kind. A transform sharing a physics
  // name is legal, in either order, and must not shadow movement selection.
  for (const first of [true, false]) for (const kind of ['single', 'composed'] as const) for (const reset of ['animation', 'setup'] as const) {
    const shared = JSON.parse(JSON.stringify(model)) as { constraints: Array<Record<string, unknown>> };
    const transform = { kind: 'transform', name: 'spring', declaredIn: 'rig', bones: ['tip2'], source: 'block', properties: {} };
    if (first) shared.constraints.unshift(transform); else shared.constraints.push(transform);
    const sharedDoc = readModel(JSON.stringify(shared));
    for (const operation of ['translate', 'rotate'] as const) {
      const live = opened(sharedDoc, kind, reset), expected = opened(doc, kind, reset);
      live.step(1 / 60); expected.step(1 / 60);
      const ctx = stateOf(live), outside = bits(ctx.states.get('defaults'));
      const beforeClock = bits([ctx.time, ctx.last, live.trackTime]);
      let error: unknown;
      try {
        if (operation === 'translate') live.physicsTranslate(3, -2, Object.freeze(['spring']));
        else live.physicsRotate(11, -7, 9, Object.freeze(['spring']));
      } catch (e) { error = e; }
      if (operation === 'translate') expected.physicsTranslate(3, -2, ['spring']);
      else expected.physicsRotate(11, -7, 9, ['spring']);
      const label = `shared-name/${first ? 'transform-first' : 'physics-first'}/${kind}/${reset}/${operation}`;
      check(error === undefined, `${label}: legal physics name refused: ${String(error)}`);
      check(stateBits(ctx) === stateBits(stateOf(expected)), `${label}: did not select the physics state`);
      check(bits(ctx.states.get('defaults')) === outside, `${label}: outsider changed`);
      check(ctx.states.has('spring'), `${label}: missing positive physics state`);
      check(bits([ctx.time, ctx.last, live.trackTime]) === beforeClock, `${label}: clock changed`);
      check(sharedDoc.constraints.filter((c) => c.name === 'spring').length === 2, `${label}: fixture did not retain both kinds`);
    }
  }
  const raw = JSON.parse(physics1541Fixture().model) as { constraints: unknown[]; animations: Array<{ name: string }> };
  raw.constraints = [];
  raw.animations = raw.animations.filter((a) => a.name === 'move');
  const noPhysics = readModel(JSON.stringify(raw));
  for (const kind of ['single', 'composed'] as const) {
    const live = opened(noPhysics, kind, 'animation');
    live.physicsTranslate(1, 2, []); live.physicsRotate(1, 2, 3, []);
    let error: unknown;
    try { live.physicsTranslate(1, 2, ['spring']); } catch (e) { error = e; }
    check(error instanceof CoreInputError && error.message.includes('spring'), `${kind}: no-physics document did not refuse named scope`);
  }
  check(bits(doc) === source, 'movement mutated the shared compiled document');
  // A mutation at the public call boundary must be caught by exact outsider bytes.
  const mutant = opened(doc, 'single', 'animation'); mutant.step(1 / 60);
  const before = bits(stateOf(mutant).states.get('defaults'));
  mutant.physicsTranslate(3, -2);
  const omittedScopeDetected = bits(stateOf(mutant).states.get('defaults')) !== before;
  check(omittedScopeDetected, 'whole-context movement plant did not change outsider');
  return { ok: problems.length === 0, problems, checks, unscoped, omittedScopeDetected };
}

if (import.meta.main) {
  const result = physicsScopeCases();
  console.log(JSON.stringify(result));
  process.exitCode = result.ok ? 0 : 1;
}
