/** Stage-three physics and value-slider controls, always against the unchanged oracle. */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { readModel, underNoSkin, underSkin } from '../src/core/index.ts';
import { openTrack } from '../src/core/track.ts';
import { physicsClockStep, type RawPose } from '../src/core/raw.ts';
import { compileRuntime, RuntimeInputError, RuntimePose, RuntimeRefusal, type RuntimePlant } from '../src/runtime/index.ts';
import { runtimeOfTexts, sliderPhysicsPair, sliderPhysicsShape, SLIDER_PHYSICS_PROBES } from './core_gate.ts';
import { allocationPerFrame, probeModel, stepAgainstTrack } from './runtime_poser_cases.ts';
import { galleryRecipe, runRecipe } from './emit_hashes.ts';
import { compile } from '../src/compile.ts';
import { MODEL_DOCUMENT_FILE, modelDocument } from '../src/model.ts';
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

/** Duplicate targets are legal model input: sliders compose all entries, tracks keep the last. */
export function duplicateSliderProbe(additive: boolean, mix: number, ending: 'full' | 'empty' | 'late' | 'inherit', shared: boolean, enabled = true): string {
  const first = ending === 'inherit' ? [{ name: 'inherit', keys: [{ time: 0, inherit: 'onlyTranslation' }] }] : [
    { name: 'rotate', keys: key(10, 31) }, { name: 'translatex', keys: key(3, 7) },
    { name: 'scalex', keys: key(1.2, 1.4) }, { name: 'translate', keys: [{ time: 0.25, x: 2, y: -3 }, { time: 1, x: 5, y: 4 }] },
  ];
  const start = ending === 'late' ? 0.5 : 0;
  const last = ending === 'empty' ? [] : [
    { name: 'rotate', keys: [{ time: start, value: -7 }, { time: 1, value: 15 }] },
    { name: 'translatex', keys: [{ time: start, value: -2 }, { time: 1, value: -5 }] },
    { name: 'scalex', keys: [{ time: start, value: -0.7 }, { time: 1, value: 0.8 }] },
    { name: 'shearx', keys: [{ time: 0.75, value: 3 }] },
  ];
  return probeModel({ bones: [{ name: 'root', rotation: 13 }, { name: 'a', parent: 'root', x: 7, y: 2, rotation: 17, scaleX: 1.3 }, { name: 'b', parent: 'root', x: -4 }, { name: 'tip', parent: 'a', x: 20 }],
    constraints: !enabled ? [] : [{ kind: 'slider', name: 's', animation: 'pose', time: 0.125, additive, mix }, ...(shared ? [{ kind: 'slider', name: 's2', animation: 'pose', time: 0.875, additive: !additive, mix: 0.25 }] : [])],
    animations: [{ name: 'pose', duration: 1, bones: [{ name: 'a', timelines: first }, { name: 'b', timelines: [{ name: 'rotate', keys: key(4, -9) }] }, { name: 'a', timelines: last }] },
      { name: 'drive', duration: 1, constraints: { ik: [], transform: [], path: [], physics: [], slider: !enabled ? [] : [
        { name: 's', timelines: [{ name: 'time', keys: key(0, 1) }, { name: 'mix', keys: key(mix, mix) }] },
        ...(shared ? [{ name: 's2', timelines: [{ name: 'time', keys: key(1, 0) }] }] : []),
      ] } }],
  });
}

export function duplicateSliderCases(): { problems: string[]; detail: string } {
  const problems: string[] = []; let views = 0, poses = 0, values = 0;
  const deltas = [0.125, 0.25, 0.375, 0.125, 0.25, 0.625, 0.5, 0.125];
  for (const additive of [false, true]) for (const mix of [0, 0.375, 1]) for (const ending of ['full', 'empty', 'late'] as const) for (const shared of [false, true]) {
    const text = duplicateSliderProbe(additive, mix, ending, shared); views++;
    for (const animation of ['drive', 'pose']) {
      const row = stepAgainstTrack(text, animation, deltas); poses += row.poses; values += row.values;
      if (row.first) problems.push(`${additive}/${mix}/${ending}/shared=${shared}/${animation}: ${row.first}`);
    }
  }
  for (const ending of ['full', 'empty', 'late'] as const) {
    const row = stepAgainstTrack(duplicateSliderProbe(true, 0.375, ending, false, false), 'pose', deltas);
    poses += row.poses; values += row.values;
    if (row.first) problems.push(`ordinary last-target track/${ending}: ${row.first}`);
  }
  for (const enabled of [false, true]) {
    try {
      const text = duplicateSliderProbe(true, 0.375, 'inherit', false, enabled);
      compileRuntime(underNoSkin(readModel(text)));
      if (enabled) problems.push('slider silently accepted inherit in an earlier duplicate target');
      else { const row = stepAgainstTrack(text, 'pose', deltas); poses += row.poses; values += row.values; if (row.first) problems.push(`discarded inherit on ordinary track: ${row.first}`); }
    } catch (e) {
      if (!enabled || !(e instanceof RuntimeRefusal) || !e.missing.some(m => m.feature === 'inherit-timeline' && m.detail.includes('slider'))) problems.push(`inherit slider=${enabled}: ${String(e)}`);
    }
  }
  return { problems, detail: `${views} slider views, 3 ordinary duplicate tracks and 2 inherit boundaries; ${poses} poses / ${values} bone cells against openTrack by Object.is; additive/absolute, zero/partial/one mix, nonadjacent targets, overlapping timelines, empty/late last entry, shared animation at opposite mapped times and loop wraps` };
}

export function runtimeStage3Cases(say: Say): void {
  const duplicates = duplicateSliderCases();
  say('RP29_SLIDER_DUPLICATE_BONE_TARGETS_COMPOSE_WHILE_TRACKS_KEEP_LAST', duplicates.problems, duplicates.detail);
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
  const raw = JSON.parse(physicsProbe()); raw.constraints.push({ kind: 'slider', name: 's', animation: 'seq', declaredIn: 'rig' });
  raw.slots = [{ name: 's', bone: 'a', setup: 'p' }];
  raw.skins = [{ name: 'default', bones: [], constraints: {}, attachments: { s: { p: { kind: 'region', width: 10, height: 10, sequence: { count: 2, start: 0, digits: 0, setup: 0, atlas: [{ width: 10, height: 10, originalWidth: 10, originalHeight: 10, offsetX: 0, offsetY: 0 }, { width: 8, height: 8, originalWidth: 8, originalHeight: 8, offsetX: 0, offsetY: 0 }] } } } } }];
  raw.animations.push({ name: 'seq', duration: 1, bones: [], slots: [], constraints: { ik: [], transform: [], path: [], physics: [], slider: [] }, attachments: [{ name: 'default', slots: [{ name: 's', attachments: [{ name: 'p', sequence: [{ time: 0, mode: 'loop', index: 0, delay: 0.1 }] }] }] }], drawOrder: [], events: [] });
  try { compileRuntime(readModel(JSON.stringify(raw))); defects.push('slider smuggled sequence'); } catch (e) { if (!(e instanceof RuntimeRefusal) || !e.missing.some(m => m.feature === 'sequence-timeline')) defects.push(String(e)); }
  say('RP24_PHYSICS_AND_SLIDER_FAULTS_AND_TRANSITIVE_REFUSALS_ARE_NAMED', defects, 'omitted physics and slider-as-track caught by bone; slider-applied sequence timeline refuses whole model under existing feature name');

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
  runtimeStage4Cases(say);
}

interface PathProbeOptions {
  positionMode?: 'fixed' | 'percent';
  spacingMode?: 'length' | 'fixed' | 'percent' | 'proportional';
  rotateMode?: 'tangent' | 'chain' | 'chainScale';
  closed?: boolean;
  constantSpeed?: boolean;
  weighted?: boolean;
  offsetRotation?: number;
  slotSign?: 'plain' | 'before' | 'after';
  deform?: boolean;
  withPhysics?: boolean;
  withSlider?: boolean;
}

export function pathProbe(opts: PathProbeOptions = {}): string {
  const {
    positionMode = 'percent',
    spacingMode = 'length',
    rotateMode = 'tangent',
    closed = false,
    constantSpeed = true,
    weighted = false,
    offsetRotation = 0,
    slotSign = 'plain',
    deform = false,
    withPhysics = false,
    withSlider = false,
  } = opts;
  const onlyGuides = slotSign === 'before';
  const vertices = weighted || onlyGuides
    ? {
        weighted: true,
        bindings: [
          onlyGuides ? [{ bone: 'guide1', x: -15, y: -5, weight: 0.7 }, { bone: 'guide2', x: -40, y: -20, weight: 0.3 }] : [{ bone: 'slotBone', x: -15, y: -5, weight: 0.7 }, { bone: 'guide1', x: -40, y: -20, weight: 0.3 }],
          onlyGuides ? [{ bone: 'guide1', x: 0, y: 0, weight: 0.6 }, { bone: 'guide2', x: -25, y: -15, weight: 0.4 }] : [{ bone: 'slotBone', x: 0, y: 0, weight: 0.6 }, { bone: 'guide1', x: -25, y: -15, weight: 0.4 }],
          onlyGuides ? [{ bone: 'guide1', x: 15, y: 8, weight: 0.5 }, { bone: 'guide2', x: -10, y: -7, weight: 0.5 }] : [{ bone: 'slotBone', x: 15, y: 8, weight: 0.5 }, { bone: 'guide1', x: -10, y: -7, weight: 0.5 }],
          [{ bone: 'guide1', x: 5, y: 4, weight: 0.65 }, { bone: 'guide2', x: -35, y: 30, weight: 0.35 }],
          [{ bone: 'guide1', x: 20, y: 0, weight: 0.45 }, { bone: 'guide2', x: -20, y: 24, weight: 0.55 }],
          [{ bone: 'guide1', x: 40, y: -18, weight: 0.25 }, { bone: 'guide2', x: 0, y: 6, weight: 0.75 }],
        ],
      }
    : { weighted: false, xy: [-15, -5, 0, 0, 15, 8, 35, 22, 55, 18, 75, -6] };
  const signConstraints = slotSign === 'before'
    ? [
        { kind: 'transform', name: 'orderSlotChild', bones: ['slotChild'], source: 'guide1', properties: { x: { to: { x: {} } } } },
        { kind: 'transform', name: 'flipCarrier', bones: ['carrier'], source: 'driver', properties: { scaleX: { to: { scaleX: {} } } } },
      ]
    : slotSign === 'after'
      ? [
          { kind: 'transform', name: 'flipSlotBone', bones: ['slotBone'], source: 'driver', properties: { scaleX: { to: { scaleX: {} } } } },
          { kind: 'transform', name: 'flipCarrier', bones: ['carrier'], source: 'driver', properties: { scaleX: { to: { scaleX: {} } } } },
        ]
      : [];
  const posSetup = positionMode === 'fixed' ? 8.5 : 0.15;
  const spcSetup = spacingMode === 'fixed' ? 12.5 : spacingMode === 'length' ? 2.5 : 0.2;
  const deformCount = (weighted || onlyGuides) ? 24 : 12;
  return probeModel({
    bones: [
      { name: 'root', rotation: 7 },
      { name: 'carrier', parent: 'root', x: 5, y: -3, rotation: 11 },
      { name: 'slotBone', parent: 'carrier', x: 4, y: 2, rotation: -9 },
      { name: 'slotChild', parent: 'slotBone', x: 6 },
      { name: 'guide1', parent: 'root', x: 35, y: 18, rotation: 23 },
      { name: 'guide2', parent: 'root', x: 80, y: -12, rotation: -19 },
      { name: 'driver', parent: 'root', x: -10, scaleX: -1.2 },
      { name: 'c1', parent: 'root', x: 2, y: 1, length: 18, rotation: 5 },
      { name: 'c2', parent: 'c1', x: 18, length: 22, rotation: -12 },
      { name: 'c3', parent: 'c2', x: 22, length: 14, rotation: 8 },
      { name: 'tip', parent: 'c3', x: 14, length: 10 },
    ],
    slots: [
      { name: 'pathSlot', bone: 'slotBone', setup: 'curve' },
      { name: 'badge', bone: 'tip', setup: 'dot' },
    ],
    attachments: {
      pathSlot: {
        curve: { kind: 'path', closed, constantSpeed, vertexCount: 6, lengths: [42.5, 91.25], vertices },
      },
      badge: {
        dot: { kind: 'region', width: 8, height: 8, atlas: { width: 8, height: 8, originalWidth: 8, originalHeight: 8, offsetX: 0, offsetY: 0 } },
      },
    },
    constraints: [
      ...signConstraints,
      ...(withSlider ? [{ kind: 'slider', name: 'dial', animation: 'slidePose', bone: 'guide1', property: 'rotate', from: 0, to: 0.1, scale: 0.02, mix: 0.6 }] : []),
      {
        kind: 'path',
        name: 'p',
        bones: ['c1', 'c2', 'c3'],
        slot: 'pathSlot',
        positionMode,
        spacingMode,
        rotateMode,
        rotation: offsetRotation,
        position: posSetup,
        spacing: spcSetup,
        mixRotate: 0.85,
        mixX: 0.9,
        mixY: 0.75,
      },
      ...(withPhysics ? [{ kind: 'physics', name: 'tail', bone: 'tip', x: 0.6, y: 0.5, rotate: 0.7, scaleX: 0.3, shearX: 0.2, fps: 60, mass: 1.5, wind: 0.3, gravity: 0.9, mix: 0.8 }] : []),
    ],
    animations: [
      {
        name: 'walk',
        duration: 1,
        bones: [
          { name: 'root', timelines: [{ name: 'rotate', keys: [{ time: 0, value: 0 }, { time: 0.5, value: 25, curve: [0.15, 5, 0.35, 20] }, { time: 1, value: -10 }] }] },
          { name: 'guide1', timelines: [{ name: 'translate', keys: [{ time: 0, x: 0, y: 0 }, { time: 0.5, x: 8, y: -6 }, { time: 1, x: -4, y: 5 }] }, { name: 'rotate', keys: key(0, 35) }] },
          { name: 'guide2', timelines: [{ name: 'rotate', keys: [{ time: 0, value: 0 }, { time: 0.5, value: -30 }, { time: 1, value: 15 }] }] },
        ],
        constraints: {
          ik: [],
          transform: [],
          slider: [],
          physics: [],
          path: [
            {
              name: 'p',
              timelines: [
                {
                  name: 'position',
                  keys: [
                    { time: 0, value: positionMode === 'fixed' ? -5 : -0.1, curve: [0.1, 0, 0.3, 0.4] },
                    { time: 0.45, value: positionMode === 'fixed' ? 35 : 0.65, curve: 'stepped' },
                    { time: 0.75, value: positionMode === 'fixed' ? 70 : 1.15 },
                    { time: 1, value: positionMode === 'fixed' ? 12 : 0.25 },
                  ],
                },
                {
                  name: 'spacing',
                  keys: [
                    { time: 0, value: spacingMode === 'fixed' ? 10 : spacingMode === 'length' ? 0 : 0.18 },
                    { time: 0.5, value: spacingMode === 'fixed' ? 18 : spacingMode === 'length' ? 5 : 0.32, curve: [0.6, 0.2, 0.85, 0.25] },
                    { time: 1, value: spacingMode === 'fixed' ? 6 : spacingMode === 'length' ? -3 : 0.12 },
                  ],
                },
                {
                  name: 'mix',
                  keys: [
                    { time: 0, mixRotate: 1, mixX: 1, mixY: 0.8 },
                    { time: 0.35, mixRotate: 0.5, mixX: 0.7, mixY: 0.4, curve: [0.4, 0.6, 0.55, 0.2, 0.4, 0.8, 0.55, 0.3, 0.4, 0.5, 0.55, 0.2] },
                    { time: 0.6, mixRotate: 0, mixX: 0, mixY: 0, curve: 'stepped' },
                    { time: 0.8, mixRotate: 0.9, mixX: 0.85, mixY: 0.95 },
                    { time: 1, mixRotate: 1, mixX: 1, mixY: 1 },
                  ],
                },
              ],
            },
          ],
        },
        attachments: deform
          ? [
              {
                name: 'default',
                slots: [
                  {
                    name: 'pathSlot',
                    attachments: [
                      {
                        name: 'curve',
                        deform: [
                          { time: 0.125, offset: 2, vertices: [4.25, -3.5, -2.75, 6.125], curve: [0.2, 0.05, 0.4, 0.95] },
                          { time: 0.55, curve: 'stepped', vertices: Array.from({ length: deformCount }, (_, i) => ((i % 5) - 2) * 1.375) },
                          { time: 0.9 },
                        ],
                      },
                    ],
                  },
                ],
              },
            ]
          : [],
      },
      ...(withSlider
        ? [
            {
              name: 'slidePose',
              duration: 1,
              bones: [{ name: 'c1', timelines: [{ name: 'rotate', keys: key(-15, 25) }] }, { name: 'slotBone', timelines: [{ name: 'translatex', keys: key(-3, 6) }] }],
            },
          ]
        : []),
    ],
  });
}

function scopedPhysicsProbe(): string {
  return probeModel({
    bones: [
      { name: 'root', rotation: 5 },
      { name: 'a', parent: 'root', x: 10, y: 2, length: 18 },
      { name: 'b', parent: 'root', x: -12, y: 4, length: 22 },
      { name: 'c', parent: 'root', x: 0, y: 15, length: 16 },
      { name: 'target', parent: 'root', x: 14, y: 18 },
    ],
    constraints: [
      { kind: 'ik', name: 'onlyIk', bones: ['c'], target: 'target', mix: 0.25 },
      { kind: 'ik', name: 'shared', bones: ['c'], target: 'target', mix: 0.15 },
      { kind: 'physics', name: 'pa', bone: 'a', x: 0.8, y: 0.7, rotate: 0.6, scaleX: 0.4, shearX: 0.3, fps: 60, mass: 1.8, wind: 0.2, gravity: 0.8, mix: 1 },
      { kind: 'physics', name: 'pb', bone: 'b', x: 0.75, y: 0.65, rotate: 0.55, scaleX: 0.35, shearX: 0.25, fps: 60, mass: 2.1, wind: -0.3, gravity: 1.1, mix: 0.9 },
      { kind: 'physics', name: 'shared', bone: 'c', x: 0.6, y: 0.5, rotate: 0.7, scaleX: 0.3, shearX: 0.2, fps: 60, mass: 1.4, wind: 0.1, gravity: 0.5, mix: 0.85 },
    ],
    animations: [
      {
        name: 'sway',
        duration: 1,
        bones: [{ name: 'root', timelines: [{ name: 'rotate', keys: key(0, 20) }] }],
      },
    ],
  });
}

function runtimeStage4Cases(say: Say): void {
  // --- RP30: path constraints across all modes, curves, deforms and slot-bone determinant snapshots match the oracle at 0 ---
  {
    const problems: string[] = [];
    let fixtures = 0;
    let poses = 0;
    let values = 0;
    const specs: Array<[string, PathProbeOptions]> = [];
    for (const positionMode of ['fixed', 'percent'] as const) {
      for (const spacingMode of ['length', 'fixed', 'percent', 'proportional'] as const) {
        for (const rotateMode of ['tangent', 'chain', 'chainScale'] as const) {
          const idx = specs.length;
          specs.push([
            `${positionMode}/${spacingMode}/${rotateMode}`,
            {
              positionMode,
              spacingMode,
              rotateMode,
              closed: idx % 2 === 1,
              constantSpeed: idx % 3 !== 0,
              weighted: idx % 2 === 0,
              offsetRotation: idx % 4 === 0 ? 0 : idx % 2 === 0 ? 17.5 : -23.25,
              deform: idx % 3 === 0,
              withPhysics: idx % 5 === 0,
              withSlider: idx % 7 === 0,
            },
          ]);
        }
      }
    }
    for (const closed of [false, true]) {
      for (const constantSpeed of [false, true]) {
        for (const weighted of [false, true]) {
          specs.push([
            `curve closed=${closed} const=${constantSpeed} weighted=${weighted}`,
            { positionMode: 'percent', spacingMode: 'proportional', rotateMode: 'chainScale', closed, constantSpeed, weighted, offsetRotation: 13.75, deform: true },
          ]);
        }
      }
    }
    for (const slotSign of ['plain', 'before', 'after'] as const) {
      specs.push([`slotSign=${slotSign}`, { positionMode: 'fixed', spacingMode: 'length', rotateMode: 'tangent', offsetRotation: 29.5, slotSign, weighted: slotSign === 'before' }]);
    }
    for (const [label, opts] of specs) {
      const text = pathProbe(opts);
      fixtures++;
      const row = runtimeOfTexts(label, text, '');
      poses += row.poses;
      values += row.values;
      if (row.verdict !== 'IDENTICAL' && problems.length < 5) problems.push(`${label}: ${row.verdict} — ${row.why}`);
      const live = stepAgainstTrack(text, 'walk', steps.slice(0, 60));
      poses += live.poses;
      values += live.values;
      if (live.first !== null && problems.length < 5) problems.push(`${label} step: ${live.first}`);
    }
    say(
      'RP30_PATH_CONSTRAINTS_ALL_MODES_DEFORM_AND_SLOT_BONE_SIGNS_MATCH_ORACLE_AT_ZERO',
      problems,
      `${fixtures} path fixtures (${poses} poses / ${values} values at tolerance 0, sample grid + 60 looping steps each): fixed/percent position, length/fixed/percent/proportional spacing, tangent/chain/chainScale rotate, open/closed, constantSpeed true/false, unweighted/weighted, path deform, slider + physics composition, and before/after slot-bone determinant snapshots`,
    );
  }

  // --- RP31: path plants (omitPath, omitDeform, bindingIndex) fail by name and boundary refusals are named ---
  {
    const problems: string[] = [];
    const caught: string[] = [];
    const baseText = pathProbe({ weighted: true, deform: true, rotateMode: 'chainScale', offsetRotation: 15 });
    const cleanRow = runtimeOfTexts('clean path', baseText, '');
    if (cleanRow.verdict !== 'IDENTICAL') problems.push(`clean path probe read ${cleanRow.verdict}: ${cleanRow.why}`);
    const plants: Array<[string, string, RuntimePlant, string]> = [
      ['omitPath', baseText, { omitPath: true }, '"c1"'],
      ['omitDeform on path', pathProbe({ weighted: false, deform: true, rotateMode: 'tangent' }), { omitDeform: true }, '"c1"'],
      ['bindingIndex on weighted path', pathProbe({ weighted: true, deform: false, rotateMode: 'chain' }), { bindingIndex: (i, n) => (i + 1) % n }, '"c1"'],
    ];
    for (const [label, text, plant, expected] of plants) {
      const green = runtimeOfTexts(`${label} green`, text, '');
      const red = runtimeOfTexts(label, text, '', plant);
      if (green.verdict !== 'IDENTICAL') problems.push(`${label} unplanted read ${green.verdict}: ${green.why}`);
      else if (red.verdict !== 'DIFF' || !(red.why ?? '').includes(expected)) problems.push(`${label} planted read ${red.verdict}: ${red.why} (expected DIFF naming ${expected})`);
      else caught.push(`${label} → ${red.verdict} (${expected})`);
    }

    // Refusal boundaries: inactive constrained bone and oracle-absent path conditions.
    const inactiveDoc = JSON.parse(pathProbe()) as { bones: Array<Record<string, unknown>> };
    inactiveDoc.bones = inactiveDoc.bones.map((b) => (b.name === 'c2' ? { ...b, skinRequired: true } : b));
    const switchDoc = JSON.parse(pathProbe()) as { animations: Array<Record<string, unknown>> };
    switchDoc.animations[0].slots = [{ name: 'pathSlot', timelines: [{ name: 'attachment', keys: [{ time: 0.5, name: null }] }] }];
    const conflictDoc = JSON.parse(pathProbe()) as { skins: Array<Record<string, unknown>> };
    conflictDoc.skins.push({
      name: 'alt',
      bones: [],
      constraints: {},
      attachments: {
        pathSlot: {
          curve: { kind: 'path', closed: true, constantSpeed: false, vertexCount: 6, lengths: [10, 20], vertices: { weighted: false, xy: [0, 0, 5, 5, 10, 0, 15, -5, 20, 0, 25, 5] } },
        },
      },
    });
    const prevPassDoc = JSON.parse(pathProbe({ slotSign: 'before', offsetRotation: 20 })) as { constraints: Array<Record<string, unknown>>; animations: Array<{ bones: Array<Record<string, unknown>> }> };
    prevPassDoc.constraints = prevPassDoc.constraints.filter((c) => c.name === 'p');
    prevPassDoc.animations[0].bones.push({ name: 'slotBone', timelines: [{ name: 'scalex', keys: [{ time: 0, value: 1 }, { time: 0.5, value: -1 }] }] });
    const sliderDeformDoc = JSON.parse(pathProbe({ withSlider: true, deform: true })) as { animations: Array<Record<string, unknown>> };
    sliderDeformDoc.animations[1].attachments = sliderDeformDoc.animations[0].attachments;

    const refusals: Array<[string, () => unknown, string, string]> = [
      ['inactive path bone', () => compileRuntime(underNoSkin(readModel(JSON.stringify(inactiveDoc)))), 'inactive-constrained-bone', 'path constraint "p" names bone(s) "c2"'],
      ['switched path slot', () => compileRuntime(underNoSkin(readModel(JSON.stringify(switchDoc)))), 'oracle-absent', 'keys the attachment of slot "pathSlot"'],
      ['conflicting skin path under all', () => compileRuntime(underSkin(readModel(JSON.stringify(conflictDoc)), 'all')), 'oracle-absent', 'walks slot "pathSlot"'],
      ['previous-pass slot bone reflection', () => compileRuntime(underNoSkin(readModel(JSON.stringify(prevPassDoc)))), 'oracle-absent', 'reads slot bone "slotBone" from the previous pose'],
      ['slider deforming walked path', () => compileRuntime(underNoSkin(readModel(JSON.stringify(sliderDeformDoc)))), 'oracle-absent', 'deforms walked path'],
    ];
    for (const [label, run, feature, snippet] of refusals) {
      try {
        run();
        problems.push(`${label}: compiled without refusal`);
      } catch (err) {
        if (!(err instanceof RuntimeRefusal) || !err.missing.some((m) => m.feature === feature && m.detail.includes(snippet))) {
          problems.push(`${label}: refused as ${String(err)}`);
        } else caught.push(`${label} → ${feature}`);
      }
    }
    say(
      'RP31_PATH_FAULTS_DEFORM_AND_BINDING_PLANTS_AND_BOUNDARY_REFUSALS_ARE_NAMED',
      problems,
      `${caught.length} controls (3 plants RED when planted / GREEN when unplanted, 5 refusal boundaries): ${caught.join('; ')}`,
    );
  }

  // --- RP32: physicsTranslate and physicsRotate scope match the oracle, plant turns RED, and invalid scopes fail atomically ---
  {
    const problems: string[] = [];
    const text = scopedPhysicsProbe();
    const doc = underNoSkin(readModel(text));
    const pose = new RuntimePose(compileRuntime(doc));
    const planted = new RuntimePose(compileRuntime(doc, {}, { ignorePhysicsScope: true }));
    pose.setAnimation('sway');
    pose.resetPhysics('animation');
    planted.setAnimation('sway');
    planted.resetPhysics('animation');
    const track = openTrack(doc, 'sway', { loop: true, reset: 'animation' });
    let diff = mismatch(pose, track.first);
    if (diff) problems.push(`first: ${diff}`);

    // Empty scope is a strict no-op; duplicate names in scope apply once, not twice, and leave unselected constraints untouched.
    const emptyPose = new RuntimePose(compileRuntime(doc));
    const singlePose = new RuntimePose(compileRuntime(doc));
    const dupPose = new RuntimePose(compileRuntime(doc));
    for (const p of [emptyPose, singlePose, dupPose]) {
      p.setAnimation('sway');
      p.resetPhysics('animation');
    }
    const baseB = [...singlePose.world.slice(2 * 6, 3 * 6)];
    emptyPose.physicsTranslate(99, -99, []);
    emptyPose.physicsRotate(15, -25, 45, []);
    emptyPose.step(steps[0]);
    const refPose = new RuntimePose(compileRuntime(doc));
    refPose.setAnimation('sway');
    refPose.resetPhysics('animation');
    refPose.step(steps[0]);
    if (emptyPose.world.some((v, idx) => !Object.is(v, refPose.world[idx]))) problems.push('empty scope mutated physics state');

    singlePose.physicsTranslate(4.5, -3.25, ['pa']);
    dupPose.physicsTranslate(4.5, -3.25, ['pa', 'pa']);
    singlePose.physicsRotate(2, 3, 18, ['pa']);
    dupPose.physicsRotate(2, 3, 18, ['pa', 'pa']);
    singlePose.step(steps[0]);
    dupPose.step(steps[0]);
    if (singlePose.world.some((v, idx) => !Object.is(v, dupPose.world[idx]))) problems.push('duplicate name in scope applied more than once');
    if (singlePose.world.slice(2 * 6, 3 * 6).some((v, idx) => !Object.is(v, refPose.world[2 * 6 + idx])) || baseB.length !== 6) {
      problems.push('scoped physicsTranslate/Rotate mutated unselected constraint pb');
    }

    // Negative control: ignorePhysicsScope moves unselected constraint pb when scope is ['pa'], turning bone b RED while bone a stays GREEN.
    const cleanScoped = new RuntimePose(compileRuntime(doc));
    cleanScoped.setAnimation('sway');
    cleanScoped.resetPhysics('animation');
    planted.physicsTranslate(4.5, -3.25, ['pa']);
    planted.physicsRotate(2, 3, 18, ['pa']);
    cleanScoped.physicsTranslate(4.5, -3.25, ['pa']);
    cleanScoped.physicsRotate(2, 3, 18, ['pa']);
    const plantTrack = openTrack(doc, 'sway', { loop: true, reset: 'animation' });
    plantTrack.physicsTranslate(4.5, -3.25, ['pa']);
    plantTrack.physicsRotate(2, 3, 18, ['pa']);
    planted.step(steps[0]);
    cleanScoped.step(steps[0]);
    const plantRaw = plantTrack.step(steps[0]);
    if (mismatch(cleanScoped, plantRaw) !== null) problems.push(`unplanted ['pa'] scope differed: ${mismatch(cleanScoped, plantRaw)}`);
    const plantDiff = mismatch(planted, plantRaw);
    if (plantDiff === null || !plantDiff.includes('bone b')) problems.push(`ignorePhysicsScope plant read ${plantDiff ?? 'IDENTICAL'} (expected bone b)`);

    let comparedCells = 0;
    const scopes: Array<readonly string[] | undefined> = [undefined, [], ['pa'], ['pb'], ['pa', 'pa'], ['shared'], ['pa', 'shared']];
    for (let i = 0; i < 120; i++) {
      const sc = scopes[i % scopes.length];
      if (i % 3 === 0) {
        pose.physicsTranslate(0.45 * ((i % 5) - 2), -0.35 * ((i % 3) - 1), sc);
        track.physicsTranslate(0.45 * ((i % 5) - 2), -0.35 * ((i % 3) - 1), sc);
      }
      if (i % 5 === 0) {
        pose.physicsRotate(2.5, -4.5, 11.25 * ((i % 4) - 1.5), sc);
        track.physicsRotate(2.5, -4.5, 11.25 * ((i % 4) - 1.5), sc);
      }
      const dt = steps[i];
      pose.step(dt);
      const raw = track.step(dt);
      diff = mismatch(pose, raw);
      comparedCells += raw.bones.length * 6;
      if (diff && problems.length < 5) problems.push(`step ${i} (scope=${JSON.stringify(sc)}): ${diff}`);
    }

    // Atomicity on invalid inputs: even when the first scope entry is valid ('pa') and the second is invalid, 'pa' is untouched.
    const invalidCalls: Array<[string, (p: RuntimePose) => void, string]> = [
      ['non-finite x', (p) => p.physicsTranslate(Number.NaN, 1, ['pa']), 'physicsTranslate: x and y must be finite'],
      ['non-finite degrees', (p) => p.physicsRotate(1, 2, Number.POSITIVE_INFINITY, ['pa']), 'physicsRotate: x, y and degrees must be finite'],
      ['non-array scope', (p) => p.physicsTranslate(1, 2, 'pa' as unknown as readonly string[]), 'not an array of physics constraint names'],
      ['non-string scope item', (p) => p.physicsRotate(1, 2, 15, ['pa', 7 as unknown as string]), 'scope name 7 is not a string'],
      ['unknown constraint after valid', (p) => p.physicsTranslate(5, 6, ['pa', 'nosuch']), 'no constraint "nosuch"'],
      ['non-physics constraint after valid', (p) => p.physicsRotate(5, 6, 20, ['pa', 'onlyIk']), 'constraint "onlyIk" is ik, not physics'],
    ];
    for (const [label, fn, expected] of invalidCalls) {
      try {
        fn(pose);
        problems.push(`${label}: did not throw`);
      } catch (err) {
        if (!(err instanceof RuntimeInputError) || !err.message.includes(expected)) problems.push(`${label}: threw ${String(err)}`);
      }
    }
    // Step both pose (after all 6 rejected calls) and track by one more frame: if any rejected call partially mutated 'pa', bone 'a' diverges now.
    pose.step(steps[0]);
    const afterInvalidRaw = track.step(steps[0]);
    const afterInvalidDiff = mismatch(pose, afterInvalidRaw);
    if (afterInvalidDiff !== null) problems.push(`rejected calls partially mutated state: ${afterInvalidDiff}`);
    say(
      'RP32_PHYSICS_TRANSLATE_AND_ROTATE_SCOPE_MATCH_ORACLE_AND_REFUSE_INVALID_SCOPES_ATOMICALLY',
      problems,
      `${comparedCells} bone cells by Object.is over 120 steps with interleaved undefined, [], ['pa'], ['pb'], duplicate ['pa','pa'], and homonymous ['shared'] (ik + physics) scopes; ignorePhysicsScope plant caught on bone b; ${invalidCalls.length} invalid calls refused atomically with 0 state mutations`,
    );
  }

  // --- RP33: steady-state frame allocation on path-constrained rigs (probe + gallery/ride) is 0 B/frame ---
  {
    const problems: string[] = [];
    const work = mkdtempSync(join(tmpdir(), 'runtime-stage4-'));
    const root = resolve(import.meta.dir, '..');
    const details: string[] = [];
    try {
      const probeFile = join(work, 'path-physics.model.json');
      writeFileSync(probeFile, pathProbe({ weighted: true, deform: true, rotateMode: 'chainScale', closed: true, withPhysics: true, withSlider: true }));
      const rideDir = join(work, 'ride');
      const ride = runRecipe(galleryRecipe(root, 'ride').recipe, rideDir, root);
      const rideOk = ride.exits.every((e) => e === 0);
      if (!rideOk) problems.push(`gallery/ride build failed: exits ${JSON.stringify(ride.exits)}`);
      const targets: Array<[string, string, string]> = [
        ['path+deform+physics probe', probeFile, 'walk'],
        ...(rideOk ? [['gallery/ride', join(rideDir, 'out', MODEL_DOCUMENT_FILE), 'ride'] as [string, string, string]] : []),
      ];
      for (const [label, file, animation] of targets) {
        const clean = allocationPerFrame(root, file, animation, 'none');
        const planted = allocationPerFrame(root, file, animation, 'object');
        details.push(`${label} "${animation}": ${clean.said}, plant ${planted.said}`);
        if (clean.bytes !== 0) problems.push(`${label} clean: ${clean.said}`);
        if (planted.bytes === null || planted.bytes < 16) problems.push(`${label} plant: ${planted.said}`);
      }
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
    say('RP33_PATH_AND_SCOPED_PHYSICS_STEADY_STATE_ZERO_ALLOCATION', problems, details.join('; '));
  }
  runtimeStage5Cases(say);
}

// ---------------------------------------------------------------------------
// Stage 5 controls (issue #1591): draw-order timelines and dark-colour timelines
// ---------------------------------------------------------------------------

interface DrawOrderProbeOptions {
  readonly sliderMix?: number;
  readonly secondSliderMix?: number;
  readonly sliderFirstKeyTime?: number;
  readonly trackFirstKeyTime?: number;
}

function drawOrderProbe(opts: DrawOrderProbeOptions = {}): string {
  const rect = { width: 16, height: 16, offsetX: 0, offsetY: 0, originalWidth: 16, originalHeight: 16 };
  const sliderMix = opts.sliderMix;
  const secondSliderMix = opts.secondSliderMix;
  const sFirst = opts.sliderFirstKeyTime ?? 0.25;
  const tFirst = opts.trackFirstKeyTime ?? 0.2;
  const constraints: Array<Record<string, unknown>> = [];
  if (sliderMix !== undefined) {
    constraints.push({
      kind: 'slider', name: 'sl1', animation: 'sliderOrder1', bone: 'dial1',
      property: 'rotate', local: true, from: 0, to: 0, scale: 0.01, mix: sliderMix, loop: false,
    });
  }
  if (secondSliderMix !== undefined) {
    constraints.push({
      kind: 'slider', name: 'sl2', animation: 'sliderOrder2', bone: 'dial2',
      property: 'rotate', local: true, from: 0, to: 0, scale: 0.01, mix: secondSliderMix, loop: false,
    });
  }
  return probeModel({
    bones: [
      { name: 'root' },
      { name: 'a', parent: 'root', x: 10, y: 5, rotation: 15 },
      { name: 'b', parent: 'a', x: 12, y: -4, rotation: -20 },
      { name: 'dial1', parent: 'root', rotation: 35 },
      { name: 'dial2', parent: 'root', rotation: 60 },
      { name: 'hidden', parent: 'root', skinRequired: true },
    ],
    slots: [
      { name: 's0', bone: 'a', setup: 'r0', color: 'ff8040ff', dark: '102030' },
      { name: 's1', bone: 'b', setup: 'm1', color: '40ff80cc', dark: '304050' },
      { name: 's2', bone: 'a', setup: 'w2', color: '8040ffff' },
      { name: 's3', bone: 'root', setup: null },
      { name: 's4', bone: 'b', setup: 'r4', dark: '051525' },
    ],
    attachments: {
      s0: { r0: { kind: 'region', x: 2, y: -3, rotation: 10, width: 16, height: 16, atlas: rect }, r0b: { kind: 'region', x: -4, y: 5, width: 12, height: 12, atlas: rect } },
      s1: { m1: { kind: 'mesh', uvs: [0, 0, 1, 0, 1, 1, 0, 1], triangles: [0, 1, 2, 2, 3, 0], vertices: { weighted: false, xy: [-6, -6, 6, -6, 6, 6, -6, 6] } } },
      s2: {
        w2: {
          kind: 'mesh', uvs: [0, 0, 1, 0, 0, 1], triangles: [0, 1, 2],
          vertices: {
            weighted: true,
            bindings: [
              [{ bone: 'a', x: -4, y: -2, weight: 0.6 }, { bone: 'b', x: 2, y: 3, weight: 0.4 }],
              [{ bone: 'a', x: 5, y: -1, weight: 0.25 }, { bone: 'b', x: -3, y: 4, weight: 0.75 }],
              [{ bone: 'b', x: 1, y: 6, weight: 1 }],
            ],
          },
        },
      },
      s3: { r3: { kind: 'region', width: 8, height: 8, atlas: rect } },
      s4: { r4: { kind: 'region', x: 1, y: 2, width: 10, height: 10, atlas: rect } },
    },
    constraints,
    animations: [
      {
        name: 'shuffle',
        duration: 1,
        bones: [
          { name: 'a', timelines: [{ name: 'rotate', keys: [{ time: 0, value: 0 }, { time: 0.5, value: 45 }, { time: 1, value: -15 }] }] },
          { name: 'dial1', timelines: [{ name: 'rotate', keys: [{ time: 0, value: 10 }, { time: 0.5, value: 55 }, { time: 1, value: 90 }] }] },
          { name: 'dial2', timelines: [{ name: 'rotate', keys: [{ time: 0, value: 80 }, { time: 0.5, value: 15 }, { time: 1, value: 75 }] }] },
        ],
        slots: [
          { name: 's0', timelines: [{ name: 'attachment', keys: [{ time: 0.15, name: 'r0b' }, { time: 0.65, name: 'r0' }] }] },
          { name: 's3', timelines: [{ name: 'attachment', keys: [{ time: 0.3, name: 'r3' }, { time: 0.75, name: null }] }] },
        ],
        attachments: [
          { name: 'default', slots: [{ name: 's1', attachments: [{ name: 'm1', deform: [{ time: 0, vertices: [1, -1, 2, 0, -1, 2, 0, -2] }, { time: 1, vertices: [-2, 1, 0, 3, 2, -1, 1, 1] }] }] }] },
        ],
        drawOrder: [
          { time: tFirst, offsets: [{ slot: 's0', offset: 3 }, { slot: 's4', offset: -3 }] },
          { time: 0.45, offsets: [{ slot: 's1', offset: 2 }, { slot: 's2', offset: -1 }] },
          { time: 0.7, offsets: [] },
          { time: 0.85, offsets: [{ slot: 's4', offset: -4 }, { slot: 's0', offset: 2 }] },
        ],
      },
      {
        name: 'sliderOrder1',
        duration: 1,
        drawOrder: [
          { time: sFirst, offsets: [{ slot: 's2', offset: 2 }, { slot: 's4', offset: -2 }] },
          { time: 0.6, offsets: [{ slot: 's0', offset: 4 }] },
        ],
      },
      {
        name: 'sliderOrder2',
        duration: 1,
        drawOrder: [
          { time: 0.4, offsets: [{ slot: 's1', offset: 3 }, { slot: 's4', offset: -4 }] },
          { time: 0.7, offsets: [] },
        ],
      },
    ],
  });
}

interface DarkColourProbeOptions {
  readonly timelineKind: 'rgba2' | 'rgb2';
  readonly curveKind: 'linear' | 'stepped' | 'bezier';
  readonly firstKeyTime: number;
  readonly sliderMix?: number;
  readonly overlap?: boolean;
}

function darkColourProbe(opts: DarkColourProbeOptions): string {
  const rect = { width: 14, height: 14, offsetX: 0, offsetY: 0, originalWidth: 14, originalHeight: 14 };
  const channels = opts.timelineKind === 'rgba2' ? 7 : 6;
  const curve0 = opts.curveKind === 'stepped'
    ? 'stepped'
    : opts.curveKind === 'bezier'
      ? Array.from({ length: channels * 4 }, (_, i) => (i % 4 === 0 ? 0.25 : i % 4 === 2 ? 0.75 : i % 2 === 1 ? -0.35 : 1.35))
      : undefined;
  const keys = opts.timelineKind === 'rgba2'
    ? [
        { time: opts.firstKeyTime, light: '204080cc', dark: '103050', ...(curve0 !== undefined ? { curve: curve0 } : {}) },
        { time: 0.65, light: 'e0a03066', dark: '90c0f0' },
        { time: 0.95, light: '40c070ff', dark: 'f04020' },
      ]
    : [
        { time: opts.firstKeyTime, light: '306090', dark: '153555', ...(curve0 !== undefined ? { curve: curve0 } : {}) },
        { time: 0.65, light: 'd08040', dark: '85b5e5' },
        { time: 0.95, light: '50b060', dark: 'e03010' },
      ];
  const slot0Timelines: Array<Record<string, unknown>> = [{ name: opts.timelineKind, keys }];
  if (opts.overlap) {
    slot0Timelines.push(
      opts.timelineKind === 'rgb2'
        ? { name: 'alpha', keys: [{ time: 0.1, value: 0.35 }, { time: 0.8, value: 0.9 }] }
        : { name: 'rgb2', keys: [{ time: 0.5, light: 'ff2040', dark: '084888' }, { time: 0.9, light: '20ff80', dark: '884808' }] },
    );
  }
  const constraints: Array<Record<string, unknown>> = opts.sliderMix === undefined
    ? []
    : [{
        kind: 'slider', name: 'tintSlider', animation: 'sliderTint', bone: 'dial',
        property: 'rotate', local: true, from: 0, to: 0, scale: 0.01, mix: opts.sliderMix, loop: false,
      }];
  return probeModel({
    bones: [
      { name: 'root' },
      { name: 'a', parent: 'root', x: 8, y: -3, rotation: 12 },
      { name: 'dial', parent: 'root', rotation: 45 },
      { name: 'off', parent: 'root', skinRequired: true },
    ],
    slots: [
      { name: 's0', bone: 'a', setup: 'r0', color: 'c08040d0', dark: '224466' },
      { name: 's1', bone: 'a', setup: 'r1', color: '80c0ffaa', dark: '553311' },
      { name: 's2', bone: 'root', setup: 'r2', color: 'ffffff80' },
      { name: 'sOff', bone: 'off', setup: 'rOff', color: 'ff00ffFF', dark: '112233' },
    ],
    attachments: {
      s0: { r0: { kind: 'region', width: 14, height: 14, atlas: rect } },
      s1: { r1: { kind: 'region', width: 14, height: 14, atlas: rect } },
      s2: { r2: { kind: 'region', width: 14, height: 14, atlas: rect } },
      sOff: { rOff: { kind: 'region', width: 14, height: 14, atlas: rect } },
    },
    constraints,
    animations: [
      {
        name: 'tint',
        duration: 1,
        bones: [
          { name: 'a', timelines: [{ name: 'rotate', keys: [{ time: 0, value: 0 }, { time: 1, value: 30 }] }] },
          { name: 'dial', timelines: [{ name: 'rotate', keys: [{ time: 0, value: 10 }, { time: 0.5, value: 55 }, { time: 1, value: 95 }] }] },
        ],
        slots: [
          { name: 's0', timelines: slot0Timelines },
          { name: 's1', timelines: [{ name: opts.timelineKind === 'rgba2' ? 'rgb2' : 'rgba2', keys: opts.timelineKind === 'rgba2' ? [{ time: 0, light: '105090', dark: '604020' }, { time: 1, light: '905010', dark: '204060' }] : [{ time: 0, light: '105090aa', dark: '604020' }, { time: 1, light: '905010ff', dark: '204060' }] }] },
          { name: 's2', timelines: [{ name: 'rgba', keys: [{ time: 0, color: '4080c0ff' }, { time: 1, color: 'c0804040' }] }] },
          { name: 'sOff', timelines: [{ name: 'rgba2', keys: [{ time: 0, light: '00ff00ff', dark: 'ffffff' }] }] },
        ],
        drawOrder: [{ time: 0.35, offsets: [{ slot: 's0', offset: 2 }] }],
      },
      {
        name: 'sliderTint',
        duration: 1,
        slots: [
          {
            name: 's0',
            timelines: [
              {
                name: opts.timelineKind,
                keys: opts.timelineKind === 'rgba2'
                  ? [{ time: 0.25, light: 'ff102080', dark: '0585f5' }, { time: 0.85, light: '10ff40ff', dark: 'f58505' }]
                  : [{ time: 0.25, light: 'ff1020', dark: '0585f5' }, { time: 0.85, light: '10ff40', dark: 'f58505' }],
              },
            ],
          },
          {
            name: 's1',
            timelines: [
              { name: 'rgb2', keys: [{ time: 0.15, light: '8020f0', dark: '129abc' }, { time: 0.9, light: '20f080', dark: 'cba921' }] },
            ],
          },
        ],
      },
    ],
  });
}

function runtimeStage5Cases(say: Say): void {
  const drawFixtures: Array<[string, string]> = [];
  for (const tFirst of [0, 0.2]) {
    for (const sFirst of [0, 0.25]) {
      for (const sliderMix of [undefined, 0, 0.5, 1, -0.3]) {
        for (const secondSliderMix of [undefined, 0, 0.75]) {
          if (sliderMix === undefined && secondSliderMix !== undefined) continue;
          const label = `tFirst=${tFirst},sFirst=${sFirst},s1=${sliderMix ?? 'none'},s2=${secondSliderMix ?? 'none'}`;
          drawFixtures.push([label, drawOrderProbe({ trackFirstKeyTime: tFirst, sliderFirstKeyTime: sFirst, sliderMix, secondSliderMix })]);
        }
      }
    }
  }

  // --- RP34: draw-order timelines, slider draw-order, and looping wraps match the oracle at tolerance 0 ---
  {
    const problems: string[] = [];
    let totalPoses = 0;
    let totalValues = 0;
    let wrapSteps = 0;
    const loopDeltas = Array.from({ length: 120 }, (_, f) => 0.015 + ((f * 6151) % 73) / 1000);
    for (const [label, text] of drawFixtures) {
      const row = runtimeOfTexts(label, text, '');
      totalPoses += row.poses;
      totalValues += row.values;
      if (row.verdict !== 'IDENTICAL' && problems.length < 5) problems.push(`${label}: ${row.verdict} — ${row.why}`);
      const w = stepAgainstTrack(text, 'shuffle', loopDeltas);
      totalPoses += w.poses;
      totalValues += w.values;
      wrapSteps += loopDeltas.length;
      if (w.first !== null && problems.length < 5) problems.push(`${label} loop: ${w.first}`);
    }
    // Verify in-place mutation of pose.drawOrder and wrap restoration before a non-zero first key (time < 0.2 after wrap).
    const wrapDoc = underNoSkin(readModel(drawOrderProbe({ trackFirstKeyTime: 0.2 })));
    const wrapModel = compileRuntime(wrapDoc);
    const wrapPose = new RuntimePose(wrapModel);
    const refOrder = wrapPose.drawOrder;
    wrapPose.setupPose();
    if (wrapPose.drawOrder !== refOrder) problems.push('setupPose replaced pose.drawOrder typed array');
    wrapPose.setAnimation('shuffle');
    wrapPose.apply(0.3);
    if (wrapPose.drawOrder !== refOrder || [...wrapPose.drawOrder].join(',') !== '1,4,2,0,3') {
      problems.push(`at t=0.3 expected drawOrder 1,4,2,0,3, got ${[...wrapPose.drawOrder].join(',')}`);
    }
    // Step across duration=1.0 into t=0.05 (before first key 0.2): drawOrder must restore setup order 0,1,2,3,4 in place.
    wrapPose.step(0.3);
    wrapPose.step(0.75);
    if (wrapPose.drawOrder !== refOrder || [...wrapPose.drawOrder].join(',') !== '0,1,2,3,4') {
      problems.push(`after wrap to t=${wrapPose.time} (< 0.2) expected setup drawOrder 0,1,2,3,4, got ${[...wrapPose.drawOrder].join(',')}`);
    }
    wrapPose.step(0.25);
    if (wrapPose.drawOrder !== refOrder || [...wrapPose.drawOrder].join(',') !== '1,4,2,0,3') {
      problems.push(`after advancing past first key to t=${wrapPose.time} expected 1,4,2,0,3, got ${[...wrapPose.drawOrder].join(',')}`);
    }
    say(
      'RP34_DRAW_ORDER_TIMELINES_SLIDER_DRAW_ORDER_AND_LOOP_WRAPS_MATCH_ORACLE_AT_ZERO',
      problems,
      `${drawFixtures.length} draw-order fixtures (${totalPoses} poses / ${totalValues} values at tolerance 0, sample grid + ${wrapSteps} looping steps across wraps): before-first-key setup restore, multiple positive/negative offsets, empty restore key, slider draw-order at setup and in animation (mix 0 / nonzero / two sliders), drawn attachments in draw order, and in-place pose.drawOrder buffer identity`,
    );
  }

  const darkFixtures: Array<[string, string]> = [];
  for (const timelineKind of ['rgba2', 'rgb2'] as const) {
    for (const curveKind of ['linear', 'stepped', 'bezier'] as const) {
      for (const firstKeyTime of [0, 0.25]) {
        for (const sliderMix of [undefined, 0, 0.375, 1]) {
          for (const overlap of [false, true]) {
            const label = `${timelineKind}/${curveKind}/t0=${firstKeyTime}/s=${sliderMix ?? 'none'}/ov=${overlap}`;
            darkFixtures.push([label, darkColourProbe({ timelineKind, curveKind, firstKeyTime, sliderMix, overlap })]);
          }
        }
      }
    }
  }

  // --- RP35: dark-colour timelines (rgba2, rgb2) and slider dark-colour match the oracle at tolerance 0 ---
  {
    const problems: string[] = [];
    let totalPoses = 0;
    let totalValues = 0;
    const loopDeltas = Array.from({ length: 80 }, (_, f) => 0.018 + ((f * 4999) % 61) / 1000);
    for (const [label, text] of darkFixtures) {
      const row = runtimeOfTexts(label, text, '');
      totalPoses += row.poses;
      totalValues += row.values;
      if (row.verdict !== 'IDENTICAL' && problems.length < 5) problems.push(`${label}: ${row.verdict} — ${row.why}`);
      const w = stepAgainstTrack(text, 'tint', loopDeltas);
      totalPoses += w.poses;
      totalValues += w.values;
      if (w.first !== null && problems.length < 5) problems.push(`${label} loop: ${w.first}`);
    }
    // Verify in-place pose.dark buffer identity and setup dark restoration across loop wrap before firstKeyTime=0.25.
    const doc = underNoSkin(readModel(darkColourProbe({ timelineKind: 'rgba2', curveKind: 'linear', firstKeyTime: 0.25 })));
    const pose = new RuntimePose(compileRuntime(doc));
    const refDark = pose.dark;
    pose.setupPose();
    const setupDark0 = [pose.dark[0], pose.dark[1], pose.dark[2]];
    pose.setAnimation('tint');
    pose.step(0.5);
    if (pose.dark !== refDark || pose.dark[0] === setupDark0[0]) problems.push('step(0.5) did not update pose.dark in place');
    pose.step(0.6); // wraps to 0.1 (< 0.25), restoring setupDark0
    if (pose.dark !== refDark || !Object.is(pose.dark[0], setupDark0[0]) || !Object.is(pose.dark[1], setupDark0[1]) || !Object.is(pose.dark[2], setupDark0[2])) {
      problems.push(`after wrap to t=${pose.time} (< 0.25), pose.dark did not restore setup dark colour`);
    }
    say(
      'RP35_DARK_COLOUR_RGBA2_AND_RGB2_TIMELINES_AND_SLIDERS_MATCH_ORACLE_AT_ZERO',
      problems,
      `${darkFixtures.length} dark-colour fixtures (${totalPoses} poses / ${totalValues} values at tolerance 0, sample grid + 80 looping steps each): rgba2 and rgb2, linear/stepped/overshooting-Bezier clamp01, before-first-key setup dark restore, overlapping slot timelines, inactive-bone slot gate, slider mix 0 / 0.375 / 1 exact, and in-place pose.dark buffer identity`,
    );
  }

  // --- RP36: red-then-green controls for draw-order and dark-colour timelines (both counts reported) ---
  {
    const problems: string[] = [];
    let drawRed = 0;
    let drawGreen = 0;
    for (const [label, text] of drawFixtures) {
      const planted = runtimeOfTexts(`${label} (omitDrawOrder)`, text, '', { omitDrawOrder: true });
      const clean = runtimeOfTexts(`${label} (clean)`, text, '');
      if (planted.verdict === 'DIFF' && ((planted.why ?? '').includes('draw order') || (planted.why ?? '').includes('drawOrder') || (planted.why ?? '').includes('attachment'))) drawRed++;
      else if (problems.length < 4) problems.push(`omitDrawOrder on ${label}: expected DIFF on drawOrder/attachments, got ${planted.verdict} — ${planted.why}`);
      if (clean.verdict === 'IDENTICAL') drawGreen++;
      else if (problems.length < 4) problems.push(`clean on ${label}: expected IDENTICAL, got ${clean.verdict} — ${clean.why}`);
    }
    let darkRed = 0;
    let darkGreen = 0;
    for (const [label, text] of darkFixtures) {
      const planted = runtimeOfTexts(`${label} (omitDarkColour)`, text, '', { omitDarkColour: true });
      const clean = runtimeOfTexts(`${label} (clean)`, text, '');
      if (planted.verdict === 'DIFF' && (planted.why ?? '').includes('slot')) darkRed++;
      else if (problems.length < 4) problems.push(`omitDarkColour on ${label}: expected DIFF on slot dark colour, got ${planted.verdict} — ${planted.why}`);
      if (clean.verdict === 'IDENTICAL') darkGreen++;
      else if (problems.length < 4) problems.push(`clean on ${label}: expected IDENTICAL, got ${clean.verdict} — ${clean.why}`);
    }
    say(
      'RP36_DRAW_ORDER_AND_DARK_COLOUR_PLANTS_ARE_RED_WHEN_PLANTED_AND_GREEN_WHEN_UNPLANTED',
      problems,
      `omitDrawOrder plant: ${drawRed}/${drawFixtures.length} RED (DIFF on drawOrder/attachments) when planted, ${drawGreen}/${drawFixtures.length} GREEN (IDENTICAL, 0 RED) when unplanted; omitDarkColour plant: ${darkRed}/${darkFixtures.length} RED (DIFF on slot dark colour) when planted, ${darkGreen}/${darkFixtures.length} GREEN (IDENTICAL, 0 RED) when unplanted`,
    );
  }

  // --- RP37: steady-state frame allocation on draw-order + dark-colour rigs is 0 B/frame ---
  {
    const problems: string[] = [];
    const work = mkdtempSync(join(tmpdir(), 'runtime-stage5-'));
    const root = resolve(import.meta.dir, '..');
    const details: string[] = [];
    try {
      const drawFile = join(work, 'draw-order-slider.model.json');
      writeFileSync(drawFile, drawOrderProbe({ trackFirstKeyTime: 0.2, sliderFirstKeyTime: 0.25, sliderMix: 0.5, secondSliderMix: 0.75 }));
      const darkFile = join(work, 'dark-colour-slider.model.json');
      writeFileSync(darkFile, darkColourProbe({ timelineKind: 'rgba2', curveKind: 'bezier', firstKeyTime: 0.25, sliderMix: 0.375, overlap: true }));
      const targets: Array<[string, string, string]> = [
        ['draw-order+slider+deform probe', drawFile, 'shuffle'],
        ['dark-colour+slider+draw-order probe', darkFile, 'tint'],
      ];
      for (const [label, file, animation] of targets) {
        const clean = allocationPerFrame(root, file, animation, 'none');
        const planted = allocationPerFrame(root, file, animation, 'object');
        details.push(`${label} "${animation}": ${clean.said}, plant ${planted.said}`);
        if (clean.bytes !== 0) problems.push(`${label} clean: ${clean.said}`);
        if (planted.bytes === null || planted.bytes < 16) problems.push(`${label} plant: ${planted.said}`);
      }
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
    say('RP37_DRAW_ORDER_AND_DARK_COLOUR_STEADY_STATE_ZERO_ALLOCATION', problems, details.join('; '));
  }
  runtimeStage6Cases(say);
}

/** Local source/target constraints, read in document order, never through a track surrogate. */
export function localTransformProbe(localSource: boolean, localTarget: boolean, from = 'rotate', to = 'rotate', mode = 'normal', mix = 0.375, clamp = false, order = 'ordinary'): string {
  const properties: Record<string, unknown> = from === 'all' ? Object.fromEntries(['rotate', 'x', 'y', 'scaleX', 'scaleY', 'shearY'].map(p => [p, { offset: 0.125, to: { [p]: { offset: -0.75, scale: 0.7, max: 0.25 } } }])) : { [from]: { offset: 0.125, to: { [to]: { offset: -0.75, scale: 0.7, max: 0.25 } } } };
  const local = { kind: 'transform', name: 'local', source: order === 'self' ? 'a' : 'source', bones: order === 'duplicates' ? [...Array.from({ length: 20 }, () => 'a'), 'b'] : order === 'reverse' ? ['b', 'a'] : ['a', 'b'], localSource, localTarget, clamp,
    rotation: 13, x: -2, y: 3, scaleX: -0.2, scaleY: 0.3, shearY: -11,
    mixRotate: mix, mixX: mix, mixY: mix, mixScaleX: mix, mixScaleY: mix, mixShearY: mix, properties, ...(order.startsWith('zero-') ? { [order.slice(5)]: 0 } : {}) };
  // A world writer before the local reader forces source locals to be read back;
  // a world reader after it observes the changed target and its descendants.
  const writer = { kind: 'transform', name: 'writer', source: 'driver', bones: ['source'], properties: { rotate: { to: { rotate: {} } }, x: { to: { x: {} } } }, mixRotate: 0.3, mixX: 0.6 };
  const reader = { kind: 'transform', name: 'reader', source: 'tip', bones: ['reader'], properties: { x: { to: { x: {} } }, rotate: { to: { rotate: {} } } }, mixX: 0.6, mixRotate: 0.7 };
  return probeModel({ bones: [
    { name: 'root', x: -4, y: 3, rotation: 19, scaleX: -1.2, scaleY: 0.8, shearY: 7 },
    { name: 'driver', parent: 'root', x: 17, y: -9, rotation: 43 },
    { name: 'source', parent: 'root', x: 3, y: 7, rotation: -37, scaleX: -0.8, scaleY: 1.3, shearX: 4, shearY: -13 },
    { name: 'a', parent: 'root', x: -11, y: 5, rotation: 23, scaleX: -1.1, scaleY: 0.9, shearX: 3, shearY: 17, inheritMode: mode },
    { name: 'b', parent: 'a', x: 23, y: -7, rotation: -41, scaleX: 0.6, scaleY: -1.4, shearY: 9, inheritMode: mode },
    { name: 'tip', parent: 'b', x: 1234, y: -987 },
    { name: 'reader', parent: 'root', x: 29, y: 11, rotation: -7 },
  ], slots: [{ name: 's', bone: 'tip', setup: 'p' }], attachments: { s: { p: { kind: 'region', width: 13, height: 9, atlas: { width: 13, height: 9, offsetX: 0, offsetY: 0, originalWidth: 13, originalHeight: 9 } } } },
    constraints: order === 'swapped' ? [local, writer, reader] : [writer, local, reader],
    animations: [{ name: 'a', duration: 1, ...(order.startsWith('timeline-') ? { constraints: { ik: [], path: [], physics: [], slider: [], transform: [{ name: 'local', keys: [0.25, 0.6, 1].map((time, i) => ({ time, ...Object.fromEntries(['mixRotate', 'mixX', 'mixY', 'mixScaleX', 'mixScaleY', 'mixShearY'].map(p => [p, [0, 0.375, 1][i]])), ...(order === 'timeline-stepped' && i < 2 ? { curve: 'stepped' } : {}) })) }] } } : {}), bones: [{ name: 'driver', timelines: [{ name: 'rotate', keys: key(-17, 83) }, { name: 'translate', keys: [{ time: 0, x: 3, y: -4 }, { time: 1, x: -5, y: 8 }] }] }, { name: 'a', timelines: [{ name: 'shear', keys: [{ time: 0, x: -3, y: 7 }, { time: 1, x: 9, y: -11 }] }] }] }],
  });
}

export function runtimeStage6Cases(say: Say): void {
  const groups: Array<[string, boolean, boolean]> = [['local-source', true, false], ['local-target', false, true], ['local-both', true, true]];
  const props = ['rotate', 'x', 'y', 'scaleX', 'scaleY', 'shearY'];
  const all: Array<[string, string]> = [];
  for (const [label, source, target] of groups) {
    const problems: string[] = [];
    let fixtures = 0, identical = 0, poses = 0, values = 0, walked = 0;
    const check = (name: string, text: string): void => {
      fixtures++; all.push([name, text]);
      const row = runtimeOfTexts(name, text, ''); poses += row.poses; values += row.values;
      if (row.verdict !== 'IDENTICAL' && problems.length < 5) problems.push(`${name}: ${row.verdict}: ${row.why}`);
      // Irregular looping steps are held directly to the live oracle, including signed zero.
      if (row.verdict === 'IDENTICAL') {
        identical++;
        const live = stepAgainstTrack(text, 'a', steps); walked += live.poses; values += live.values;
        if (live.first !== null && problems.length < 5) problems.push(`${name}: ${live.first}`);
      }
    };
    for (const from of props) for (const to of props) check(`${label}/${from}->${to}`, localTransformProbe(source, target, from, to));
    for (const mode of target ? ['normal', 'onlyTranslation', 'noRotationOrReflection', 'noScale', 'noScaleOrReflection'] : ['normal', 'onlyTranslation', 'noRotationOrReflection']) {
      for (const mix of [0.375, 1, -0.25, 1.25]) for (const clamp of [false, true]) check(`${label}/${mode}/${mix}/clamp=${clamp}`, localTransformProbe(source, target, 'all', 'all', mode, mix, clamp));
    }
    for (const order of ['self', 'reverse', 'swapped', 'duplicates', 'timeline-linear', 'timeline-stepped', ...['mixRotate', 'mixX', 'mixY', 'mixScaleX', 'mixScaleY', 'mixShearY'].map(p => `zero-${p}`)]) check(`${label}/${order}`, localTransformProbe(source, target, 'all', 'all', 'normal', 0.6, false, order));
    say(`RP${38 + groups.findIndex(g => g[0] === label)}_${label.toUpperCase().replaceAll('-', '_')}_MATCHES_ORACLE_AT_ZERO`, problems, `${identical}/${fixtures} fixtures IDENTICAL; ${poses} none/step sampled poses, ${walked} looping live poses (setup included), ${values} Object.is cells; six properties and cross-mappings, offsets, clamp, reflected/sheared frames, inherit modes and ordered readers/writers`);
  }
  {
    const problems: string[] = []; let red = 0;
    for (const [name, text] of all) {
      const row = runtimeOfTexts(name, text, '', { omitLocalTransform: true });
      if (row.verdict === 'DIFF') red++;
      else if (problems.length < 5) problems.push(`${name}: omission read ${row.verdict}: ${row.why}`);
    }
    say('RP41_OMITTED_LOCAL_TRANSFORM_MAKES_EVERY_FIXTURE_RED', problems, `${red}/${all.length} fixtures DIFF with local-transform omitted; unplanted counterparts measured above`);
  }
  {
    const problems: string[] = [], details: string[] = [];
    const work = mkdtempSync(join(tmpdir(), 'runtime-stage6-'));
    try {
      for (const [label, source, target] of groups) {
        const file = join(work, `${label}.model.json`);
        writeFileSync(file, localTransformProbe(source, target, 'all', 'all'));
        const clean = allocationPerFrame(resolve(import.meta.dir, '..'), file, 'a', 'none');
        const planted = allocationPerFrame(resolve(import.meta.dir, '..'), file, 'a', 'object');
        details.push(`${label}: ${clean.said}; object plant ${planted.said}`);
        if (clean.bytes !== 0) problems.push(`${label}: ${clean.said}`);
        if (planted.bytes === null || planted.bytes < 16) problems.push(`${label} plant: ${planted.said}`);
      }
    } finally { rmSync(work, { recursive: true, force: true }); }
    say('RP42_LOCAL_TRANSFORMS_STEADY_STATE_ZERO_ALLOCATION', problems, details.join('; '));
  }
  runtimeStage7Cases(say);
}

/** World targets in both no-scale modes, observed through locals and a later parent edit. */
export function noScaleWorldProbe(mode: string, from = 'all', to = 'all', localSource = false, mix = 0.375, shape = 'ordinary', profile = 'reflected-x'): string {
  const raw = JSON.parse(localTransformProbe(localSource, false, from, to, mode, mix, shape === 'clamp', shape)) as {
    bones: Array<Record<string, unknown>>; constraints: Array<Record<string, unknown>>;
  };
  const root = raw.bones[0];
  const frames: Record<string, number[]> = {
    'reflected-x': [-1.2, 0.8, 7], 'reflected-y': [1.2, -0.8, -19],
    anisotropic: [1.7, 0.6, 23], tiny: [0.00001, 2, 11], rigid: [1, 1, 0],
  };
  const frame = frames[profile]; root.scaleX = frame[0]; root.scaleY = frame[1]; root.shearY = frame[2];
  if (shape === 'collapsed' || shape === 'near-collapsed') {
    for (const bone of raw.bones) if (bone.name === 'b') bone.scaleX = shape === 'collapsed' ? 0 : 0.00001;
  }
  for (const target of ['a', 'b']) {
    raw.bones.push({ name: `read_${target}`, parent: 'root', x: 13, y: -17 });
    // Read back every local field before a later world writer reposes the target.
    raw.constraints.push({ kind: 'transform', name: `read_${target}`, declaredIn: 'rig', source: target, bones: [`read_${target}`], localSource: true, localTarget: true,
      properties: Object.fromEntries(['rotate', 'x', 'y', 'scaleX', 'scaleY', 'shearY'].map(p => [p, { to: { [p]: { scale: 0.7, offset: -0.2 } } }])),
    });
  }
  raw.constraints.push({ kind: 'transform', name: 'parent_writer', declaredIn: 'rig', source: 'driver', bones: ['root'], mixX: 0.3, properties: { x: { to: { x: { offset: 1.25 } } } } });
  return JSON.stringify(raw);
}

export function runtimeStage7Cases(say: Say): void {
  const all: Array<[string, string]> = [];
  const props = ['rotate', 'x', 'y', 'scaleX', 'scaleY', 'shearY'];
  for (const [index, mode] of ['noScale', 'noScaleOrReflection'].entries()) {
    const problems: string[] = []; let fixtures = 0, identical = 0, refused = 0, poses = 0, values = 0, livePoses = 0;
    const check = (name: string, text: string): void => {
      fixtures++; all.push([name, text]);
      const row = runtimeOfTexts(name, text, ''); poses += row.poses; values += row.values;
      if (row.refusedAtLoad?.some(m => String(m.feature) === 'noscale-world-target')) refused++;
      if (row.verdict !== 'IDENTICAL') { if (problems.length < 5) problems.push(`${name}: ${row.verdict}: ${row.why}`); return; }
      identical++;
      const live = stepAgainstTrack(text, 'a', steps); livePoses += live.poses; values += live.values;
      if (live.first !== null && problems.length < 5) problems.push(`${name}: ${live.first}`);
    };
    for (const source of [false, true]) for (const from of props) for (const to of props) check(`${mode}/localSource=${source}/${from}->${to}`, noScaleWorldProbe(mode, from, to, source));
    for (const profile of ['reflected-x', 'reflected-y', 'anisotropic', 'tiny', 'rigid']) for (const mix of [0.375, 1, -0.25, 1.25]) check(`${mode}/${profile}/mix=${mix}`, noScaleWorldProbe(mode, 'all', 'all', false, mix, 'ordinary', profile));
    for (const shape of ['collapsed', 'near-collapsed']) check(`${mode}/${shape}`, noScaleWorldProbe(mode, 'all', 'all', false, 0.375, shape));
    for (const source of [false, true]) check(`${mode}/clamp/localSource=${source}`, noScaleWorldProbe(mode, 'all', 'all', source, 0.6, 'clamp'));
    for (const shape of ['self', 'reverse', 'swapped', 'duplicates', 'timeline-linear', 'timeline-stepped', ...['mixRotate', 'mixX', 'mixY', 'mixScaleX', 'mixScaleY', 'mixShearY'].map(p => `zero-${p}`)]) check(`${mode}/${shape}`, noScaleWorldProbe(mode, 'all', 'all', false, 0.6, shape));
    say(`RP${43 + index}_${mode.toUpperCase()}_WORLD_TARGET_MATCHES_ORACLE_AT_ZERO`, problems, `${identical}/${fixtures} fixtures IDENTICAL, ${refused} refused as noscale-world-target; ${poses} none/step sampled poses, ${livePoses} looping live poses (setup included), ${values} Object.is cells; all cross-mappings, local/world sources, reflected/anisotropic/tiny parent frames, collapsed target axes, clamp, keyed and zero mixes, repeated targets, local readers and later parent repose`);
  }
  {
    const problems: string[] = []; let red = 0;
    for (const [name, text] of all) {
      const row = runtimeOfTexts(name, text, '', { omitNoScaleWorldTransform: true });
      if (row.verdict === 'DIFF') red++; else if (problems.length < 5) problems.push(`${name}: omission read ${row.verdict}: ${row.why}`);
    }
    say('RP45_OMITTED_NOSCALE_WORLD_TRANSFORM_MAKES_EVERY_FIXTURE_RED', problems, `${red}/${all.length} fixtures DIFF under omission; unplanted fixtures measured above`);
  }
  {
    const problems: string[] = [], details: string[] = [], work = mkdtempSync(join(tmpdir(), 'runtime-stage7-'));
    try {
      for (const mode of ['noScale', 'noScaleOrReflection']) {
        const file = join(work, `${mode}.model.json`); writeFileSync(file, noScaleWorldProbe(mode));
        const clean = allocationPerFrame(resolve(import.meta.dir, '..'), file, 'a', 'none');
        const plant = allocationPerFrame(resolve(import.meta.dir, '..'), file, 'a', 'object');
        details.push(`${mode}: ${clean.said}; object plant ${plant.said}`);
        if (clean.bytes !== 0) problems.push(`${mode}: ${clean.said}`);
        if (plant.bytes === null || plant.bytes < 16) problems.push(`${mode} plant: ${plant.said}`);
      }
    } finally { rmSync(work, { recursive: true, force: true }); }
    say('RP46_NOSCALE_WORLD_TARGET_STEADY_STATE_ZERO_ALLOCATION', problems, details.join('; '));
  }
  runtimeStage8Cases(say);
}

/** Additive flags change only the transform being measured; ordered readers/writers stay absolute. */
export function additiveTransformProbe(localSource: boolean, localTarget: boolean, from = 'all', to = 'all', mode = 'normal', mix = 0.375, shape = 'ordinary', profile = 'reflected-x'): string {
  const raw = JSON.parse(noScaleWorldProbe(mode, from, to, localSource, mix, shape === 'zero-target-scale' ? 'ordinary' : shape, profile)) as { bones: Array<Record<string, unknown>>; constraints: Array<Record<string, unknown>> };
  const measured = raw.constraints.find(c => c.name === 'local')!;
  measured.additive = true; measured.localTarget = localTarget;
  if (shape === 'source-collapsed') {
    const source = raw.bones.find(b => b.name === 'source')!; source.scaleX = 0; source.scaleY = 0;
  }
  if (shape === 'zero-target-scale' || shape === 'tiny-target-scale') {
    // A zero child column with a finite parent is in the oracle's finite domain.
    measured.bones = ['b']; measured.mixScaleX = 1;
    measured.properties = { x: { to: { scaleX: { scale: 0, offset: shape === 'zero-target-scale' ? 0 : 0.00001 } } } };
  }
  if (shape === 'rotate-big-positive' || shape === 'rotate-big-negative' || shape === 'shear-boundary') {
    const property = shape === 'shear-boundary' ? 'shearY' : 'rotate';
    const value = shape === 'rotate-big-positive' ? 1080 : shape === 'rotate-big-negative' ? -1080 : 540.123;
    measured.properties = { x: { to: { [property]: { scale: 0, offset: value } } } };
  }
  return JSON.stringify(raw);
}

/** Shared with baseline admission measurements so every before/after fixture byte is identical. */
export function additiveTransformFixtures(source: boolean, target: boolean): Array<[string, string]> {
  const out: Array<[string, string]> = [], props = ['rotate', 'x', 'y', 'scaleX', 'scaleY', 'shearY'];
  const push = (name: string, from = 'all', to = 'all', mode = 'normal', mix = 0.375, shape = 'ordinary', profile = 'reflected-x'): void => { out.push([name, additiveTransformProbe(source, target, from, to, mode, mix, shape, profile)]); };
  for (const from of props) for (const to of props) push(`${from}->${to}`, from, to);
  for (const mode of ['normal', 'onlyTranslation', 'noRotationOrReflection', 'noScale', 'noScaleOrReflection']) for (const profile of ['reflected-x', 'reflected-y', 'anisotropic']) for (const mix of [0.375, 1, -0.25, 1.25]) push(`${mode}/${profile}/mix=${mix}`, 'all', 'all', mode, mix, 'ordinary', profile);
  for (const shape of ['self', 'reverse', 'swapped', 'duplicates', 'timeline-linear', 'timeline-stepped', ...['mixRotate', 'mixX', 'mixY', 'mixScaleX', 'mixScaleY', 'mixShearY'].map(p => `zero-${p}`), 'source-collapsed', 'collapsed', 'near-collapsed', 'zero-target-scale', 'tiny-target-scale', 'rotate-big-positive', 'rotate-big-negative', 'shear-boundary']) push(shape, 'all', 'all', 'normal', 0.6, shape);
  for (const mode of ['noScale', 'noScaleOrReflection']) push(`${mode}/clamp`, 'all', 'all', mode, 0.6, 'clamp');
  return out;
}

export function runtimeStage8Cases(say: Say): void {
  const groups: Array<[string, boolean, boolean]> = [['WORLD_TO_WORLD', false, false], ['LOCAL_TO_WORLD', true, false], ['WORLD_TO_LOCAL', false, true], ['LOCAL_TO_LOCAL', true, true]];
  const all: Array<[string, string]> = [];
  for (const [index, [label, source, target]] of groups.entries()) {
    const problems: string[] = []; let identical = 0, refused = 0, poses = 0, livePoses = 0, values = 0;
    const fixtures = additiveTransformFixtures(source, target);
    for (const [name, text] of fixtures) {
      all.push([`${label}/${name}`, text]);
      const row = runtimeOfTexts(name, text, ''); poses += row.poses; values += row.values;
      if (row.refusedAtLoad?.some(m => String(m.feature) === 'additive-transform')) refused++;
      if (row.verdict !== 'IDENTICAL') { if (problems.length < 5) problems.push(`${name}: ${row.verdict}: ${row.why}`); continue; }
      identical++; const live = stepAgainstTrack(text, 'a', steps); livePoses += live.poses; values += live.values;
      if (live.first !== null && problems.length < 5) problems.push(`${name}: ${live.first}`);
    }
    say(`RP${47 + index}_ADDITIVE_${label}_MATCHES_ORACLE_AT_ZERO`, problems, `${identical}/${fixtures.length} fixtures IDENTICAL, ${refused} refused as additive-transform; ${poses} none/step sampled poses, ${livePoses} looping live poses (setup included), ${values} Object.is cells; all properties and cross-mappings, five inherit modes, reflection, finite collapsed axes, keyed/zero/out-of-range mixes, wrap boundaries, clamp, repeated targets, local readers and later parent edits`);
  }
  {
    const problems: string[] = []; let red = 0;
    for (const [name, text] of all) {
      const row = runtimeOfTexts(name, text, '', { omitAdditiveTransform: true });
      if (row.verdict === 'DIFF') red++; else if (problems.length < 5) problems.push(`${name}: omitted additive read ${row.verdict}: ${row.why}`);
    }
    say('RP51_OMITTED_ADDITIVE_TRANSFORM_MAKES_EVERY_FIXTURE_RED', problems, `${red}/${all.length} fixtures DIFF under omission; unplanted fixtures measured above`);
  }
  {
    const problems: string[] = [], details: string[] = [], work = mkdtempSync(join(tmpdir(), 'runtime-stage8-'));
    try {
      for (const [label, source, target] of groups) {
        const file = join(work, `${label}.model.json`); writeFileSync(file, additiveTransformProbe(source, target));
        const clean = allocationPerFrame(resolve(import.meta.dir, '..'), file, 'a', 'none');
        const plant = allocationPerFrame(resolve(import.meta.dir, '..'), file, 'a', 'object');
        details.push(`${label}: ${clean.said}; object plant ${plant.said}`);
        if (clean.bytes !== 0) problems.push(`${label}: ${clean.said}`);
        if (plant.bytes === null || plant.bytes < 16) problems.push(`${label} plant: ${plant.said}`);
      }
    } finally { rmSync(work, { recursive: true, force: true }); }
    say('RP52_ADDITIVE_TRANSFORMS_STEADY_STATE_ZERO_ALLOCATION', problems, details.join('; '));
  }
}

if (import.meta.main) {
  let bad = 0;
  runtimeStage3Cases((name, problems, detail) => { console.log(JSON.stringify({ name, problems, detail })); bad += problems.length; });
  process.exit(bad === 0 ? 0 : 1);
}
