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
}
if (import.meta.main) {
  let bad = 0;
  runtimeStage3Cases((name, problems, detail) => { console.log(JSON.stringify({ name, problems, detail })); bad += problems.length; });
  process.exit(bad === 0 ? 0 : 1);
}
