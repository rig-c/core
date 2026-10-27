/** Stage-three physics and value-slider controls, always against the unchanged oracle. */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { readModel, underNoSkin } from '../src/core/index.ts';
import { openTrack } from '../src/core/track.ts';
import { physicsClockStep, type RawPose } from '../src/core/raw.ts';
import { compileRuntime, RuntimePose, RuntimeRefusal, type RuntimePlant } from '../src/runtime/index.ts';
import { runtimeOfTexts, sliderPhysicsPair, sliderPhysicsShape, SLIDER_PHYSICS_PROBES } from './core_gate.ts';
import { allocationPerFrame, probeModel, stepAgainstTrack } from './runtime_poser_cases.ts';
import { compile } from '../src/compile.ts';
import { modelDocument } from '../src/model.ts';
import { skirtFixture, passThroughFixture, legStopFixture } from '../fixtures/public.ts';
import { stepRuntimePhysics, freshPhysicsState } from '../src/runtime/physics.ts';
import { stepPhysics, freshStepContext, type CorePhysicsRecord } from '../src/core/constraints_physics.ts';
import { deformProbe } from './runtime_stage2_cases.ts';

type Say = (name: string, problems: string[], detail: string) => void;
const steps = Array.from({ length: 240 }, (_, f) => 0.004 + ((f * 7919) % 97) / 2000);
const key = (a: number, b: number) => [{ time: 0, value: a }, { time: 1, value: b }];

export function physicsProbe(): string {
  return probeModel({ bones: [{ name: 'root', rotation: 13 }, { name: 'a', parent: 'root', x: 7, y: 3, length: 20 }, { name: 'tip', parent: 'a', x: 20 }],
    constraints: [{ kind: 'physics', name: 'j', bone: 'a', x: 1, y: 1, rotate: 0.7, scaleX: 0.5, shearX: 0.3, fps: 120, mass: 2.3, wind: 0.4, gravity: 1.1, mix: 0 }],
    animations: [{ name: 'a', bones: [{ name: 'root', timelines: [{ name: 'rotate', keys: key(0, 70) }] }], constraints: { ik: [], transform: [], path: [], slider: [], physics: [{ name: 'j', timelines: [{ name: 'mix', keys: [{ time: 0, value: 0, curve: 'stepped' }, { time: 0.2, value: 1 }] }, { name: 'reset', keys: [{ time: 0.5 }, { time: 0.8 }] }] }] } }],
  });
}

/** Exact full doubles, including signed zeros, named by logical object. */
function mismatch(p: RuntimePose, raw: RawPose): string | null {
  p.computeVertices();
  for (let b = 0; b < raw.bones.length; b++) {
    const r = raw.bones[b], values = [r.a, r.b, r.c, r.d, r.worldX, r.worldY];
    for (let f = 0; f < 6; f++) if (!Object.is(p.world[b * 6 + f], values[f])) return `bone ${r.name} ${'abcdXY'[f]}: runtime ${p.world[b * 6 + f]}, oracle ${values[f]}`;
  }
  for (const draw of raw.drawn) {
    const slot = p.model.slots.findIndex(s => s.name === draw.slot), at = p.model.attachments[p.shown[slot]];
    if (!at || at.name !== draw.attachment) return `slot ${draw.slot}: attachment mismatch`;
    for (let f = 0; f < draw.vertices.length; f++) if (!Object.is(p.vertices[at.offset + f], draw.vertices[f])) return `slot ${draw.slot}: vertex ${f}`;

  }
  for (let s = 0; s < raw.slots.length; s++) for (let f = 0; f < 4; f++) {
    if (!Object.is(p.light[s * 4 + f], raw.slots[s][f + 2])) return `slot ${raw.slots[s][0]}: colour ${f}`;
  }
  return null;
}

export function runtimeStage3Cases(say: Say): void {
  const normal: string[] = []; let poses = 0, values = 0;
  let seed = 1591;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const pairs = [...SLIDER_PHYSICS_PROBES.map(([name, shape]) => ({ name, text: sliderPhysicsPair(shape).model })), ...Array.from({ length: 100 }, (_, i) => ({ name: `seeded ${i}`, text: sliderPhysicsPair(sliderPhysicsShape(random)).model })), { name: 'mix-zero/reset boundaries', text: physicsProbe() }];
  for (const { name, text } of pairs) {
    const row = runtimeOfTexts(name, text, '');
    if (row.verdict !== 'IDENTICAL' && normal.length < 5) normal.push(`${name}: ${row.verdict}: ${row.why}`);
    poses += row.poses; values += row.values;
    for (const anim of readModel(text).animations) {
      const r = stepAgainstTrack(text, anim.name, steps);
      poses += r.poses; values += r.values;
      if (r.first && normal.length < 5) normal.push(`${name}/${anim.name}: ${r.first}`);
    }
  }
  say('RP21_PHYSICS_AND_SLIDER_PHYSICS_MATCH_ORACLE_AT_ZERO', normal, `${pairs.length} fixtures: ${poses} poses / ${values} values; none + stepped sample grid and 240 irregular looping steps per animation; global/named parameters, mass, pending, reset and mix zero`);

  const boundary: string[] = []; let boundaryValues = 0;
  for (const reset of ['animation', 'setup'] as const) for (const clock of [undefined, physicsClockStep]) {
    const doc = underNoSkin(readModel(physicsProbe()));
    const p = new RuntimePose(compileRuntime(doc), { clock }); p.setAnimation('a'); p.resetPhysics(reset);
    const track = openTrack(doc, 'a', { loop: true, reset, clock });
    let diff = mismatch(p, track.first); if (diff) boundary.push(`${reset} first: ${diff}`);
    for (let i = 0; i < 240; i++) {
      if (i % 11 === 0) { p.physicsTranslate(0.37, -0.29); track.physicsTranslate(0.37, -0.29); }
      if (i % 17 === 0) { p.physicsRotate(3.1, -7.3, 13.7); track.physicsRotate(3.1, -7.3, 13.7); }
      if (i % 29 === 0) { const env = { wind: [0.7, -0.2] as const, gravity: [-0.3, 1.4] as const }; p.setEnvironment(env); track.setEnvironment(env); }
      p.step(steps[i]); const raw = track.step(steps[i]); diff = mismatch(p, raw); boundaryValues += raw.bones.length * 6;
      if (diff && boundary.length < 5) boundary.push(`${reset} clock=${!!clock} step ${i}: ${diff}`);
    }
  }
  say('RP22_CLOCK_RESET_ENVIRONMENT_AND_EXTERNAL_MOTION_MATCH_ORACLE', boundary, `${boundaryValues} bone cells; setup/animation reset, ordinary/physicsClockStep clocks; translate/rotate/environment interleaved, reset crossings and wraps`);

  const sliders: string[] = []; let views = 0;
  for (const weighted of [false, true]) for (const additive of [false, true]) for (const mix of [0, 0.25, 1, -0.3, 1.4]) for (const local of [false, true]) {
    const raw = JSON.parse(deformProbe(weighted)) as { constraints: unknown[]; animations: Array<Record<string, unknown>> };
    raw.constraints = [{ kind: 'slider', name: 's', animation: 'a', bone: 'tip', property: 'rotate', local, from: -40, to: 0.125, scale: 0.01, additive, mix, loop: true, declaredIn: 'rig' }];
    raw.animations.push({ name: 'move', duration: 1, bones: [{ name: 'tip', timelines: [{ name: 'rotate', keys: key(-100, 300) }] }], slots: [], constraints: { ik: [], transform: [], path: [], physics: [], slider: [] }, attachments: [], drawOrder: [], events: [] });
    const row = runtimeOfTexts('slider deform', JSON.stringify(raw), '', {}, 'default'); views++;
    if (row.verdict !== 'IDENTICAL' && sliders.length < 5) sliders.push(`${weighted}/${additive}/${mix}/${local}: ${row.verdict}: ${row.why}`);
  }
  say('RP23_SLIDERS_MAP_VALUES_AND_COMPOSE_DEFORMS_SLOTS_AND_BONES', sliders, `${views} weighted/unweighted, additive/absolute, world/local, zero/partial/one/negative/over-one mixes, loop and attachment switch views; slider animation never used as track to select the dial`);

  const firstEvents: string[] = [];
  for (const physics of [false, true]) {
    const raw = JSON.parse(physicsProbe());
    if (!physics) raw.constraints = [];
    raw.events = [{ name: 'zero' }];
    raw.animations = [{ name: 'a', duration: 1, bones: [], slots: [], constraints: { ik: [], transform: [], path: [], physics: [], slider: [] }, attachments: [], drawOrder: [], events: [{ time: 0, name: 'zero' }, { time: 1, name: 'zero' }] }];
    const p = new RuntimePose(compileRuntime(readModel(JSON.stringify(raw)))); p.setAnimation('a'); p.step(0.1);
    if (p.events.length !== 1 || p.events[0].time !== 0) firstEvents.push(`physics=${physics}: first step lost key zero`);
  }
  say('RP28_FIRST_STEP_PHYSICS_INITIALIZATION_DOES_NOT_CONSUME_EVENTS', firstEvents, 'setAnimation then step, without an initial apply: zero-time key delivered once with and without physics; RP13 retains complete event boundaries');

  const defects: string[] = [];
  for (const [name, text, plant] of [
    ['omitted physics', physicsProbe(), { omitPhysics: true }],
    ['slider as track', sliderPhysicsPair(SLIDER_PHYSICS_PROBES[0][1]).model, { sliderAsTrack: true }],
  ] as Array<[string, string, RuntimePlant]>) {
    const row = runtimeOfTexts(name, text, '', plant);
    if (row.verdict !== 'DIFF' || !row.why?.includes('bone')) defects.push(`${name}: ${row.verdict} ${row.why}`);
  }
  const raw = JSON.parse(physicsProbe()); raw.constraints.push({ kind: 'slider', name: 's', animation: 'dark', declaredIn: 'rig' });
  raw.slots = [{ name: 's', bone: 'a', setup: null, dark: '000000' }];
  raw.animations.push({ name: 'dark', duration: 1, bones: [], slots: [{ name: 's', timelines: [{ name: 'rgba2', keys: [{ time: 0, light: 'ffffffff', dark: '102030' }] }] }], constraints: { ik: [], transform: [], path: [], physics: [], slider: [] }, attachments: [], drawOrder: [], events: [] });
  try { compileRuntime(readModel(JSON.stringify(raw))); defects.push('slider smuggled dark colour'); } catch (e) { if (!(e instanceof RuntimeRefusal) || !e.missing.some(m => m.feature === 'dark-colour-timeline')) defects.push(String(e)); }
  say('RP24_PHYSICS_AND_SLIDER_FAULTS_AND_TRANSITIVE_REFUSALS_ARE_NAMED', defects, 'omitted physics and slider-as-track caught by bone; slider-applied dark colour refuses whole model under existing feature name');

  const components: string[] = []; let stateCells = 0;
  const record = readModel(physicsProbe()).constraints[0].record as CorePhysicsRecord;
  for (const offset of [0, 6, 18]) for (const component of ['x', 'y', 'rotate', 'scaleX', 'shearX', 'all', 'off']) for (const scaleYMode of ['None', 'Uniform', 'Volume'] as const) {
    const r = { ...record, mix: 1, x: 0, y: 0, rotate: 0, scaleX: 0, shearX: 0, scaleYMode };
    if (component === 'all') { r.x = r.y = r.rotate = r.scaleX = r.shearX = 0.7; }
    else if (component !== 'off') r[component as 'x' | 'y' | 'rotate' | 'scaleX' | 'shearX'] = 0.7;
    const state = freshPhysicsState(), ctx = freshStepContext(), env = new Float64Array([1, 0, 0, 1]);
    const storage = new Float64Array(offset + 6).fill(123.456);
    const w = storage.subarray(offset);
    w.set([1, 0, 0, 1, 5, 7]);
    for (let frame = 0; frame < 80; frame++) {
      ctx.phase = frame === 7 ? 'reset' : 'update'; ctx.time += [0.003, 0.01, 0.027][frame % 3];
      r.mix = frame >= 13 && frame < 19 ? 0 : 1;
      w.set([1 + frame * 0.001, 0.13, 0.17, 0.9, 5 + frame * 0.7, 7 - frame * 0.3]);
      const world = { a: w[0], b: w[1], c: w[2], d: w[3], worldX: w[4], worldY: w[5] };
      const before = state.lastTime;
      stepRuntimePhysics(r, state, storage, offset, 20, ctx.time, ctx.phase === 'reset', env);
      stepPhysics(r, world, 20, ctx);
      const oracle = ctx.states.get(r.name)!;
      for (const name of Object.keys(state) as Array<keyof typeof state>) {
        stateCells++; if (!Object.is(state[name], oracle[name]) && components.length < 5) components.push(`${component}/${scaleYMode} frame ${frame} state ${name}`);
      }
      for (let f = 0; f < 6; f++) if (!Object.is(w[f], [world.a, world.b, world.c, world.d, world.worldX, world.worldY][f]) && components.length < 5) components.push(`${component}/${scaleYMode} world ${f}`);
      if (storage.subarray(0, offset).some(v => v !== 123.456)) components.push('physics wrote another bone');
      if (r.mix === 0 && state.lastTime !== before) components.push('mix zero consumed clock');
      if (frame === 0 && (state.remaining !== ctx.time || state.xVelocity !== 0 || state.rotateVelocity !== 0)) components.push('pending integrated or dropped remainder');
    }
  }
  say('RP26_PHYSICS_COMPONENT_STATE_AND_MIX_ZERO_PENDING_BOUNDARIES', components, `${stateCells} state cells by Object.is, all components and off at offsets 0/6/18 with sentinel guard, three scaleY modes, pending partial remainder, mix-zero interval, explicit reset`);

  const fixtures: string[] = []; let fixturePoses = 0, fixtureValues = 0; const skipped: string[] = [];
  for (const make of [skirtFixture, passThroughFixture, legStopFixture]) {
    const f = make();
    try {
      for (const rigPath of [f.rigPath, ...('handRigPath' in f && 'freeRigPath' in f ? [String(f.handRigPath), String(f.freeRigPath)] : [])]) {
        const built = compile({ rigPath, motionPath: f.motionPath, outDir: f.outDir });
        const text = modelDocument(built.model, built.skeletonText, built.atlasText);
        const row = runtimeOfTexts(f.rig, text, built.atlasText);
        fixturePoses += row.poses; fixtureValues += row.values;
        if (row.verdict === 'DIFF' || row.verdict === 'REFUSED') fixtures.push(`${f.rig}: ${row.verdict} ${row.why}`);
        for (const no of row.refusedAnimations) skipped.push(`${f.rig}/${no.animation}: ${no.missing.map(m => m.feature).join(',')}`);
        for (const name of row.covered) {
          const live = stepAgainstTrack(text, name, steps); fixturePoses += live.poses; fixtureValues += live.values;
          if (live.first && fixtures.length < 5) fixtures.push(`${f.rig}/${name}: ${live.first}`);
        }
      }
    } finally { rmSync(f.dir, { recursive: true, force: true }); }
  }
  say('RP27_SIX_CHAIN_PASS_THROUGH_AND_LEG_STOP_FIXTURES', fixtures, `${fixturePoses} poses / ${fixtureValues} values; six-chain skirt, pass-through, declared/hand/free leg-stop; SKIP ${skipped.join('; ') || 'none'}`);

  const alloc: string[] = [], work = mkdtempSync(join(tmpdir(), 'runtime-stage3-'));
  let detail = '';
  try {
    for (const [name, text] of [['physics', physicsProbe()], ['slider physics', sliderPhysicsPair(SLIDER_PHYSICS_PROBES[2][1]).model]] as const) {
      const file = join(work, `${name.replaceAll(' ', '-')}.json`); writeFileSync(file, text);
      const animation = name === 'physics' ? 'a' : 'sway';
      const clean = allocationPerFrame(resolve(import.meta.dir, '..'), file, animation, 'none');
      const planted = allocationPerFrame(resolve(import.meta.dir, '..'), file, animation, 'object');
      detail += `${name}: ${clean.said}, plant ${planted.said}; `;
      if (clean.bytes !== 0 || planted.bytes === null || planted.bytes < 16) alloc.push(detail);
    }
  } finally { rmSync(work, { recursive: true, force: true }); }
  say('RP25_PHYSICS_SLIDER_STEADY_STATE_ZERO_ALLOCATION', alloc, detail);
}
if (import.meta.main) {
  let bad = 0;
  runtimeStage3Cases((name, problems, detail) => { console.log(JSON.stringify({ name, problems, detail })); bad += problems.length; });
  process.exit(bad === 0 ? 0 : 1);
}
