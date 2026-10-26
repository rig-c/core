/** Stage-two deform controls: independent oracle poses, state boundaries and allocation. */
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { readModel, underSkin, type CompiledDocument } from '../src/core/index.ts';
import { openTrack } from '../src/core/track.ts';
import type { RawPose } from '../src/core/raw.ts';
import { compileRuntime, RuntimePose, type RuntimePlant } from '../src/runtime/index.ts';
import { allocationPerFrame, probeModel } from './runtime_poser_cases.ts';
import { runtimeOfTexts } from './core_gate.ts';

type Say = (name: string, problems: string[], detail: string) => void;

export function deformProbe(weighted: boolean, curve: 'linear' | 'stepped' | number[] = 'linear', seed = 0): string {
  const vertices = weighted ? { weighted: true, bindings: Array.from({ length: 3 }, (_, i) => [
    { bone: 'root', x: i * 3.10005 + seed, y: -i * 2.40007, weight: 0.30003 },
    { bone: 'tip', x: i * 2.30006, y: i * 4.10009 + seed, weight: 0.69997 },
  ]) } : { weighted: false, xy: [0.10005 + seed, -0.20007, 10.30006, 0.40009, -0.50003, 10.60001] };
  const mesh = { kind: 'mesh', name: 'shared', uvs: [0, 0, 1, 0, 0, 1], triangles: [0, 1, 2], vertices };
  const keys = [{ time: 0.125, offset: 1, vertices: [3.12345 + seed, -5.23456, 7.34567], ...(curve === 'linear' ? {} : { curve }) }, { time: 0.625, curve: 'stepped', vertices: Array.from({ length: weighted ? 12 : 6 }, (_, i) => (i + 1) * 0.12345) }, { time: 0.875 }];
  return probeModel({ bones: [{ name: 'root', rotation: 17.12345, scaleX: 1.30003, x: 5.12345 }, { name: 'tip', parent: 'root', rotation: -32.54321, scaleY: 0.70003, x: 7.12345, y: -2.34567 }],
    slots: [{ name: 's', bone: 'root', setup: 'm' }, { name: 'linked', bone: 'tip', setup: 'yes' }, { name: 'isolated', bone: 'root', setup: 'no' }],
    attachments: { s: { m: mesh, other: { ...mesh, name: 'shared' } }, linked: { yes: { kind: 'linkedmesh', skin: 'default', slot: 's', source: 'm', timelines: true } }, isolated: { no: { kind: 'linkedmesh', skin: 'default', slot: 's', source: 'm', timelines: false } } },
    skins: [{ name: 'alt', bones: [], constraints: {}, attachments: { s: { m: { ...mesh, name: 'shared' } } } }],
    animations: [{ name: 'a', duration: 1, slots: [{ name: 's', timelines: [{ name: 'attachment', keys: [{ time: 0, name: 'm' }, { time: 0.4, name: 'other' }, { time: 0.55, name: null }, { time: 0.7, name: 'm' }] }] }],
      attachments: [{ name: 'default', slots: [{ name: 's', attachments: [{ name: 'm', deform: keys }] }] }, { name: 'alt', slots: [{ name: 's', attachments: [{ name: 'm', deform: [{ time: 0.125, vertices: [11.23456] }, { time: 1 }] }] }] }] }, { name: 'plain', duration: 1 }],
  });
}

/** All drawn cells by Object.is, reporting the exact logical vertex and coordinate. */
function mismatch(pose: RuntimePose, raw: RawPose): string | null {
  pose.computeVertices();
  for (const draw of raw.drawn) {
    const slot = pose.model.slots.findIndex(s => s.name === draw.slot);
    const index = pose.shown[slot];
    const at = pose.model.attachments[index];
    if (!at || at.name !== draw.attachment) return `slot "${draw.slot}" attachment differs`;
    for (let k = 0; k < draw.vertices.length; k++) if (!Object.is(draw.vertices[k], pose.vertices[at.offset + k])) return `slot "${draw.slot}" attachment "${draw.attachment}" vertex ${Math.floor(k / 2)} ${k % 2 ? 'y' : 'x'}: oracle ${draw.vertices[k]}, runtime ${pose.vertices[at.offset + k]}`;
  }
  return null;
}

function at(doc: CompiledDocument, time: number, animation = 'a'): RawPose {
  return openTrack(doc, animation, { loop: false, reset: 'animation' }).step(time);
}

export function runtimeStage2Cases(say: Say): void {
  const normal: string[] = [];
  let values = 0;
  // First/last Bezier pieces, key endpoints, short/empty runs, switches and linked source identity.
  const times = [0, 0.124, 0.125, 0.125001, 0.1267, 0.15791, 0.234567, 0.399, 0.4, 0.549, 0.55, 0.624999, 0.625, 0.7, 0.87499, 0.875, 1, 1.25];
  for (const weighted of [false, true]) for (let seed = 0; seed < 12; seed++) {
    const text = deformProbe(weighted, seed % 3 === 0 ? 'linear' : seed % 3 === 1 ? 'stepped' : [0.20123, 0.04123, 0.53123, 0.95123], seed / 13);
    for (const skin of ['default', 'alt']) {
      const doc = underSkin(readModel(text), skin);
      const pose = new RuntimePose(compileRuntime(doc)); pose.setAnimation('a');
      const vertices = pose.vertices, deform = pose.deform;
      for (const time of times) {
        pose.apply(time);
        const raw = at(doc, time);
        const first = mismatch(pose, raw);
        values += raw.drawn.reduce((n, g) => n + g.vertices.length, 0);
        if (first && normal.length < 4) normal.push(`${weighted ? 'weighted' : 'unweighted'} seed ${seed} skin ${skin} t=${time}: ${first}`);
        if (pose.vertices !== vertices || pose.deform !== deform) normal.push('pose replaced a vertex or deform buffer');
      }
      const row = runtimeOfTexts('deform generated', text, '', {}, skin);
      if (row.verdict !== 'IDENTICAL' && normal.length < 4) normal.push(`${row.verdict}: ${row.why}`);
    }
  }
  say('RP17_DEFORM_LINEAR_STEPPED_BEZIER_MATCH_ORACLE_AND_LINKED_SKIN_IDENTITIES', normal, `48 named-skin model views, ${times.length} times each, ${values} drawn coordinates by Object.is; per-influence weighted pairs, short/empty runs, shared display names, linked timelines true/false, attachment/null switches; stable buffers`);

  const states: string[] = [];
  const doc = underSkin(readModel(deformProbe(true, [0.20123, 0.04123, 0.53123, 0.95123])), 'default');
  const model = compileRuntime(doc);
  const pose = new RuntimePose(model); pose.setAnimation('a');
  const other = new RuntimePose(model); other.setAnimation('a'); other.apply(0.3); other.computeVertices();
  const kept = [...other.vertices];
  const track = openTrack(doc, 'a', { loop: true, reset: 'animation' });
  pose.apply(0); let first = mismatch(pose, track.first);
  if (first) states.push(first);
  let wraps = 0, previous = 0;
  for (let i = 0; i < 240; i++) {
    const dt = 0.004 + ((i * 7919) % 97) / 2000;
    const raw = track.step(dt); pose.step(dt);
    if (pose.time < previous) wraps++;
    previous = pose.time;
    const diff = mismatch(pose, raw);
    if (diff && states.length < 4) states.push(`loop step ${i}: ${diff}`);
  }
  for (const time of [0.99, 0.3, 0.6, 0.1, 0.8, 0, 0.125]) {
    pose.apply(time);
    const diff = mismatch(pose, at(doc, time)); if (diff) states.push(`seek ${time}: ${diff}`);
    if (time < 0.125 && pose.deform.some(v => v !== 0)) states.push(`seek ${time}: stale deform buffer before first key`);
  }
  const restored = new RuntimePose(model); restored.restore('a', 5.1, 0.1);
  if (restored.deform.some(v => v !== 0)) states.push('restore before first key kept a deform');
  restored.step(0.2);
  first = mismatch(restored, at(doc, restored.time)); if (first) states.push(`restore continuation: ${first}`);
  for (const skin of ['alt', 'default', 'alt']) {
    const view = underSkin(readModel(deformProbe(true, [0.20123, 0.04123, 0.53123, 0.95123])), skin);
    const replacement = new RuntimePose(compileRuntime(view));
    replacement.restore('a', 5.3, 0.3);
    let diff = mismatch(replacement, at(view, 0.3)); if (diff) states.push(`skin restore ${skin}: ${diff}`);
    replacement.step(0.2);
    diff = mismatch(replacement, at(view, replacement.time)); if (diff) states.push(`skin continuation ${skin}: ${diff}`);
  }
  pose.setupPose(); if (pose.deform.some(v => v !== 0)) states.push('setup did not zero deform');
  pose.setAnimation('plain'); pose.apply(0.3); if (pose.deform.some(v => v !== 0)) states.push('animation change kept deform');
  if (kept.some((v, i) => !Object.is(v, other.vertices[i]))) states.push('another pose sharing the model was changed');
  if (!wraps) states.push('no loop wrap exercised');
  say('RP18_WEIGHTED_DEFORM_WRAP_SEEK_RESTORE_RESET_AND_POSE_ISOLATION', states, `240 irregular steps, ${wraps} wraps; backwards seeks, setup/plain reset, restore before first key and continuation, alt/default/alt skin replacement at an active deform; two poses sharing one compiled model`);

  const plants: string[] = [], reds: string[] = [];
  for (const plant of [{ omitDeform: true }, { deformAfterWeights: true }] satisfies RuntimePlant[]) {
    const wrong = new RuntimePose(compileRuntime(doc, {}, plant)); wrong.setAnimation('a'); wrong.apply(0.3);
    const red = mismatch(wrong, at(doc, 0.3));
    if (!red?.includes('vertex')) plants.push(`${JSON.stringify(plant)}: failed without a named vertex: ${red}`);
    else reds.push(red);
  }
  say('RP19_DEFORM_OMISSION_AND_WEIGHTS_BEFORE_DEFORM_PLANTS_NAME_THE_VERTEX', plants, reds.join('; '));

  const work = mkdtempSync(join(tmpdir(), 'runtime-deform-'));
  try {
    const file = join(work, 'deform.model.json'); writeFileSync(file, deformProbe(true, [0.20123, 0.04123, 0.53123, 0.95123]));
    const clean = allocationPerFrame(resolve(import.meta.dir, '..'), file, 'a', 'none');
    const plant = allocationPerFrame(resolve(import.meta.dir, '..'), file, 'a', 'object');
    const faults: string[] = [];
    if (clean.bytes !== 0) faults.push(`deform animation: ${clean.said}`);
    if (plant.bytes === null || plant.bytes < 16) faults.push(`object plant not seen: ${plant.said}`);
    say('RP20_DEFORM_ANIMATION_ALLOCATES_ZERO_BYTES_PER_FRAME', faults, `weighted Bezier deform and attachment switches, loop wraps: ${clean.said}; object plant: ${plant.said}`);
  } finally { rmSync(work, { recursive: true, force: true }); }
}

if (import.meta.main) {
  let failures = 0;
  runtimeStage2Cases((name, problems, detail) => { console.log(JSON.stringify({ name, problems, detail })); failures += problems.length; });
  process.exit(failures ? 1 : 0);
}
