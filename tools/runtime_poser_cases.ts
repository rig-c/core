/**
 * The runtime poser's controls (issue #1591): public, generated fixtures and
 * the gallery, every one compared with the oracle at tolerance 0 through
 * `tools/core_gate.ts`'s third dumper. Importing runs nothing; the selftest's
 * `runtime-poser` suite calls `runtimePoserCases`, and the allocation control
 * runs this file as a child process (`--alloc`, below).
 *
 * The probes are model documents written directly — the shape `readModel`
 * reads (`rigc-compiled/1`) — so that a population of hundreds costs no
 * compile: bones in all five inherit modes, skewed and reflecting; one- and
 * two-bone ik and world-space transform constraints in random order reading
 * each other's bones; rotate, translate, scale and shear timelines keyed
 * linear, stepped and by Bézier; ik and transform timelines; regions, meshes
 * and weighted meshes; attachment and colour timelines. Bones ten thousand
 * units out along a constrained bone's axes amplify a last-bit difference in
 * its matrix into the vertices and the rows.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readModel, underNoSkin } from '../src/core/index.ts';
import { openTrack } from '../src/core/track.ts';
import { compileRuntime, RUNTIME_FEATURES, RuntimeInputError, RuntimePose, RuntimeRefusal, L_ROTATION, WORLDS, type RuntimeFeature, type RuntimeModel, type RuntimePlant, type RuntimeAttachment } from '../src/runtime/index.ts';
import { MODEL_DOCUMENT_FILE } from '../src/model.ts';
import { galleryRecipe, runRecipe } from './emit_hashes.ts';
import { runtimeLines, runtimeOfTexts, runtimeRow, type RuntimeRow } from './core_gate.ts';

type Obj = Record<string, unknown>;
type Say = (name: string, problems: string[], detail: string) => void;

/** Exact attachment identity even when display names collide (issue #1596). */
export function runtimeAttachmentIdentityCase(): { problems: string[]; detail: string } {
  const mesh = (x: number): Obj => ({ kind: 'mesh', name: 'shared', uvs: [0, 0, 1, 0, 0, 1], triangles: [0, 1, 2], vertices: { weighted: false, xy: [x, 0, x + 10, 0, x, 10] } });
  const doc = underNoSkin(readModel(probeModel({
    bones: [{ name: 'root' }], slots: [{ name: 's', bone: 'root', setup: 'first' }],
    attachments: { s: { first: mesh(0), second: mesh(20) } },
    animations: [{ name: 'switch', duration: 1, slots: [{ name: 's', timelines: [{ name: 'attachment', keys: [{ time: 0, name: 'first' }, { time: 0.5, name: 'second' }] }] }] }],
  })));
  const model = compileRuntime(doc);
  const problems: string[] = [];
  const validate = (attachments: readonly RuntimeAttachment[]): string[] => {
    const errors: string[] = [];
    for (const attachment of attachments) {
      const slot = model.slots[attachment.slot].name;
      const record = doc.skins.find(skin => skin.name === attachment.skin)?.attachments[slot]?.[attachment.placeholder];
      const where = `attachment "${attachment.name}" of slot "${slot}" at ${attachment.skin}/${attachment.placeholder}`;
      if (!record) { errors.push(`${where}: no source record`); continue; }
      const geometry = record.geometry;
      if (geometry?.kind !== 'mesh' || geometry.vertices.weighted) { errors.push(`${where}: expected unweighted mesh source`); continue; }
      if (geometry.vertices.xy.length !== attachment.count || geometry.vertices.xy.some((value, i) => !Object.is(Math.fround(value), attachment.local[i]))) errors.push(`${where}: source geometry differs from compiled attachment`);
    }
    return errors;
  };
  if (model.attachments.length !== 2 || model.attachments.some(attachment => attachment.name !== 'shared')) problems.push(`expected two compiled attachments named shared; found ${model.attachments.map(attachment => attachment.name).join(', ')}`);
  if (new Set(model.attachments.map(attachment => attachment.placeholder)).size !== 2) problems.push('the two display-name twins lost their distinct table placeholders');
  problems.push(...validate(model.attachments));
  const plants: Array<[string, readonly RuntimeAttachment[]]> = [
    ['name-as-placeholder', model.attachments.map(attachment => ({ ...attachment, placeholder: attachment.name }))],
    ['wrong-skin', model.attachments.map(attachment => ({ ...attachment, skin: 'absent' }))],
    ['swapped-placeholder', model.attachments.map(attachment => ({ ...attachment, placeholder: attachment.placeholder === 'first' ? 'second' : 'first' }))],
  ];
  const red: string[] = [];
  for (const [name, attachments] of plants) {
    const errors = validate(attachments);
    if (errors.length === 0 || errors.some(error => !error.includes('attachment "shared" of slot "s"'))) problems.push(`${name}: mutant survived or failed without naming attachment and slot`);
    else red.push(`${name}: ${errors[0]}`);
  }
  return { problems, detail: `two placeholders first/second share display name shared; both resolve by skin/slot/placeholder to their own compiled mesh values; ${red.join('; ')}` };
}

/** What the suite hands the cases: the checkout, a scratch directory, and the selftest's seeded generator (every population draws from it). */
export interface RuntimeCasesInput {
  root: string;
  work: string;
  random: (seed: number) => () => number;
}

const MODES5 = ['normal', 'onlyTranslation', 'noRotationOrReflection', 'noScale', 'noScaleOrReflection'] as const;
const PROPS = ['rotate', 'x', 'y', 'scaleX', 'scaleY', 'shearY'] as const;
const rect = (w: number, h: number): Obj => ({ width: w, height: h, offsetX: 0, offsetY: 0, originalWidth: w, originalHeight: h });

/** A probe document: what a `rigc-compiled/1` model states, every section the reader requires present. */
export interface ProbeSpec {
  bones: Obj[];
  slots?: Obj[];
  /** The default skin's table, slot then placeholder. */
  attachments?: Record<string, Record<string, Obj>>;
  /** Skins beside the default one. */
  skins?: Obj[];
  constraints?: Obj[];
  events?: Obj[];
  animations?: Obj[];
}

export function probeModel(spec: ProbeSpec): string {
  return JSON.stringify({
    spec: 'rigc-compiled/1',
    referenceScale: 100,
    bones: spec.bones,
    slots: spec.slots ?? [],
    skins: [{ name: 'default', bones: [], constraints: {}, attachments: spec.attachments ?? {} }, ...(spec.skins ?? [])],
    constraints: (spec.constraints ?? []).map((c) => ({ declaredIn: 'rig', ...c })),
    events: spec.events ?? [],
    animations: (spec.animations ?? []).map((a) => ({ duration: 0, bones: [], slots: [], constraints: { ik: [], transform: [], path: [], physics: [], slider: [] }, attachments: [], drawOrder: [], events: [], ...a })),
    images: [], pageGrids: [], droppedStates: [], absentParts: [], meshBones: {}, meshes: {}, physics: [], deformTransforms: [], trackDerivations: [], rig: {}, spine: { sha256: '0'.repeat(64) },
  });
}

/** Rounded draws, so a document's numbers are short decimals as a writer would state them. */
function draws(rnd: () => number): { R: (lo: number, hi: number) => number; pick: <T>(l: readonly T[]) => T } {
  return {
    R: (lo, hi) => Math.round((lo + rnd() * (hi - lo)) * 1000) / 1000,
    pick: <T,>(l: readonly T[]): T => l[Math.floor(rnd() * l.length)],
  };
}

/**
 * Keys at increasing times over [0, 1], each segment linear, stepped or a
 * Bézier whose handles lie inside it in time: `valueOf(key, c)` reads a key's
 * channel `c` (of `channels`), which the handles are placed around.
 */
function keysOf(rnd: () => number, channels: number, value: () => Obj, valueOf: (key: Obj, c: number) => number): Obj[] {
  const { R, pick } = draws(rnd);
  const n = 2 + Math.floor(rnd() * 3);
  const times = [0, ...Array.from({ length: n - 1 }, (_, i) => Math.round(((i + 1) / (n - 1)) * (0.7 + rnd() * 0.3) * 1000) / 1000)];
  const keys: Obj[] = times.map((time) => ({ time, ...value() }));
  for (let i = 0; i + 1 < keys.length; i++) {
    const shape = pick(['linear', 'stepped', 'bezier', 'bezier']);
    if (shape === 'stepped') keys[i].curve = 'stepped';
    else if (shape === 'bezier') {
      const t0 = keys[i].time as number;
      const t1 = keys[i + 1].time as number;
      const curve: number[] = [];
      for (let c = 0; c < channels; c++) {
        const v0 = valueOf(keys[i], c);
        const v1 = valueOf(keys[i + 1], c);
        curve.push(t0 + (t1 - t0) * R(0.05, 0.6), v0 + (v1 - v0) * R(-0.5, 1.5), t0 + (t1 - t0) * R(0.4, 0.95), v0 + (v1 - v0) * R(-0.5, 1.5));
      }
      keys[i].curve = curve.map((v) => Math.round(v * 1e5) / 1e5);
    }
  }
  return keys;
}

/** A key's numbered fields, read in order — what `keysOf` places a number key's handles around. */
const fields = (...names: string[]) => (key: Obj, c: number): number => key[names[c]] as number;
/** A colour key's channel `c`, its hex pair over 255. */
const colourChannel = (key: Obj, c: number): number => Number.parseInt((key.color as string).slice(2 * c, 2 * c + 2), 16) / 255;

const hex = (rnd: () => number, digits: number): string => Array.from({ length: digits / 2 }, () => Math.floor(rnd() * 256).toString(16).padStart(2, '0')).join('');

/** One population probe: the header's rig, every construct stage 0 poses, two animations. */
export function populationProbe(rnd: () => number): string {
  const { R, pick } = draws(rnd);
  const bones: Obj[] = [{ name: 'root' }];
  for (let k = 1; k <= 8; k++) {
    const b: Obj = { name: `b${k}`, parent: k === 1 ? 'root' : pick(bones.map((x) => x.name as string)), x: R(-40, 40), y: R(-40, 40), rotation: R(-180, 180), length: R(5, 60) };
    if (rnd() < 0.5) Object.assign(b, { scaleX: pick([1, -1]) * R(0.3, 2), scaleY: pick([1, -1]) * R(0.3, 2), shearX: R(-30, 30), shearY: R(-30, 30) });
    if (rnd() < 0.25) b.inheritMode = pick(MODES5.slice(1));
    bones.push(b);
  }
  const parentOf = new Map(bones.map((b) => [b.name as string, b.parent as string | undefined]));
  const below = (top: string, n: string): boolean => {
    for (let at = parentOf.get(n); at !== undefined; at = parentOf.get(at)) if (at === top) return true;
    return false;
  };
  const names = bones.slice(1).map((b) => b.name as string);
  const modeOf = (n: string): string => (bones.find((b) => b.name === n)?.inheritMode as string | undefined) ?? 'normal';
  const constraints: Obj[] = [];
  const count = 1 + Math.floor(rnd() * 4);
  for (let k = 0; k < count; k++) {
    const kind = pick(['ik1', 'ik2', 'transform']);
    if (kind === 'ik2') {
      const child = pick(names.filter((n) => parentOf.get(n) !== 'root'));
      if (child === undefined) continue;
      const parent = parentOf.get(child) as string;
      const targets = names.filter((n) => n !== parent && n !== child && !below(parent, n));
      if (targets.length === 0) continue;
      constraints.push({ kind: 'ik', name: `k${k}`, bones: [parent, child], target: pick(targets), mix: pick([1, R(0, 1)]), bendPositive: rnd() < 0.5, softness: pick([0, R(0, 20)]), stretch: rnd() < 0.3, scaleY: pick(['none', 'uniform', 'volume']) });
    } else if (kind === 'ik1') {
      const b = pick(names);
      const targets = names.filter((n) => n !== b && !below(b, n));
      if (targets.length === 0) continue;
      constraints.push({ kind: 'ik', name: `k${k}`, bones: [b], target: pick(targets), mix: pick([1, R(0, 1)]), compress: rnd() < 0.3, stretch: rnd() < 0.3, scaleY: pick(['none', 'uniform', 'volume']) });
    } else {
      // A world-space target in a noScale mode is refused at load, so the population targets the other three.
      const candidates = names.filter((n) => modeOf(n) !== 'noScale' && modeOf(n) !== 'noScaleOrReflection');
      if (candidates.length === 0) continue;
      const b = pick(candidates);
      const sources = names.filter((n) => n !== b && !below(b, n));
      if (sources.length === 0) continue;
      const properties: Obj = {};
      for (const from of PROPS) {
        if (rnd() >= 0.4) continue;
        const to: Obj = {};
        for (const q of PROPS) if (rnd() < 0.3) to[q] = { ...(rnd() < 0.5 ? { offset: R(-20, 20) } : {}), ...(rnd() < 0.5 ? { scale: R(-2, 2) } : {}), ...(rnd() < 0.5 ? { max: R(-50, 50) } : {}) };
        if (Object.keys(to).length === 0) to[pick(PROPS)] = {};
        properties[from] = { ...(rnd() < 0.4 ? { offset: R(-20, 20) } : {}), to };
      }
      if (Object.keys(properties).length === 0) properties[pick(PROPS)] = { to: { [pick(PROPS)]: {} } };
      const source = pick(sources);
      // Repeated targets (issue #1591's review): the reader takes the list as written and the oracle applies each entry in turn,
      // so a list may name a bone several times — beside others, or one bone more times than the skeleton has bones.
      let targets = [b];
      const shape = rnd();
      if (shape < 0.25) {
        const others = candidates.filter((n) => n !== source && !below(n, source));
        targets = Array.from({ length: 2 + Math.floor(rnd() * 4) }, () => (rnd() < 0.5 ? b : pick(others)));
      } else if (shape < 0.35) {
        // One bone named more times than the skeleton has bones, then a bone with bones below it, which a short buffer would drop.
        const parents = candidates.filter((n) => n !== b && n !== source && !below(n, source) && names.some((m) => parentOf.get(m) === n));
        targets = [...Array.from({ length: 12 + Math.floor(rnd() * 13) }, () => b), ...(parents.length > 0 ? [pick(parents)] : [])];
      }
      const c: Obj = { kind: 'transform', name: `k${k}`, bones: targets, source, properties };
      if (rnd() < 0.3) c.clamp = true;
      for (const m of ['mixRotate', 'mixX', 'mixY', 'mixScaleX', 'mixScaleY', 'mixShearY']) if (rnd() < 0.5) c[m] = pick([0, 1, R(-1, 2)]);
      for (const o of ['rotation', 'x', 'y', 'scaleX', 'scaleY', 'shearY']) if (rnd() < 0.4) c[o] = R(-30, 30);
      constraints.push(c);
    }
  }
  for (const c of constraints.slice(0, 2)) for (const b of new Set(c.bones as string[])) bones.push({ name: `${b}_ax${c.name}`, parent: b, x: 1e4 }, { name: `${b}_ay${c.name}`, parent: b, y: 1e4 });

  // Three slots: a region, a mesh and a weighted mesh, each with a second placeholder its attachment timeline shows.
  const slotBone = (): string => pick(names);
  const region = (): Obj => ({ kind: 'region', x: R(-20, 20), y: R(-20, 20), rotation: R(-180, 180), scaleX: R(0.5, 2), scaleY: R(-2, 2), width: R(10, 80), height: R(10, 80), atlas: rect(64, 64) });
  const mesh = (): Obj => ({ kind: 'mesh', uvs: [0, 0, 1, 0, 1, 1, 0, 1], triangles: [0, 1, 2, 2, 3, 0], vertices: { weighted: false, xy: Array.from({ length: 8 }, () => R(-50, 50)) } });
  const weighted = (): Obj => {
    const pool = names.slice();
    const bindings = Array.from({ length: 4 }, () => {
      const n = 1 + Math.floor(rnd() * 3);
      const ws = Array.from({ length: n }, () => R(0.1, 1));
      const sum = ws.reduce((x, y) => x + y, 0);
      return ws.map((w) => ({ bone: pick(pool), x: R(-40, 40), y: R(-40, 40), weight: Math.round((w / sum) * 1e5) / 1e5 }));
    });
    return { kind: 'mesh', uvs: [0, 0, 1, 0, 1, 1, 0, 1], triangles: [0, 1, 2, 2, 3, 0], vertices: { weighted: true, bindings } };
  };
  const slots: Obj[] = [
    { name: 's0', bone: slotBone(), setup: 'p', ...(rnd() < 0.5 ? { color: hex(rnd, 8) } : {}) },
    { name: 's1', bone: slotBone(), setup: 'p', ...(rnd() < 0.5 ? { color: hex(rnd, 6) } : {}) },
    { name: 's2', bone: slotBone(), setup: 'p', ...(rnd() < 0.5 ? { color: hex(rnd, 8), dark: hex(rnd, 6) } : {}) },
  ];
  const attachments: Record<string, Record<string, Obj>> = { s0: { p: region(), q: mesh() }, s1: { p: mesh(), q: region() }, s2: { p: weighted(), q: weighted() } };

  const boneKinds: Array<[string, readonly string[], () => Obj]> = [
    ['rotate', ['value'], () => ({ value: R(-360, 360) })],
    ['translate', ['x', 'y'], () => ({ x: R(-30, 30), y: R(-30, 30) })],
    ['translatex', ['value'], () => ({ value: R(-30, 30) })],
    ['translatey', ['value'], () => ({ value: R(-30, 30) })],
    ['scale', ['x', 'y'], () => ({ x: R(-2, 2), y: R(-2, 2) })],
    ['scalex', ['value'], () => ({ value: R(0.2, 2) })],
    ['scaley', ['value'], () => ({ value: R(-2, 2) })],
    ['shear', ['x', 'y'], () => ({ x: R(-40, 40), y: R(-40, 40) })],
    ['shearx', ['value'], () => ({ value: R(-40, 40) })],
    ['sheary', ['value'], () => ({ value: R(-40, 40) })],
  ];
  const MIXES = ['mixRotate', 'mixX', 'mixY', 'mixScaleX', 'mixScaleY', 'mixShearY'];
  const animation = (name: string): Obj => {
    const keyed = new Set<string>();
    for (let i = 0; i < 3; i++) keyed.add(pick(names));
    const boneTimelines = [...keyed].map((bone) => {
      const kinds = new Set<number>();
      for (let i = 0; i < 1 + Math.floor(rnd() * 2); i++) kinds.add(Math.floor(rnd() * boneKinds.length));
      return { name: bone, timelines: [...kinds].map((k) => ({ name: boneKinds[k][0], keys: keysOf(rnd, boneKinds[k][1].length, boneKinds[k][2], fields(...boneKinds[k][1])) })) };
    });
    const ik = constraints.filter((c) => c.kind === 'ik' && rnd() < 0.5).map((c) => ({ name: c.name, keys: keysOf(rnd, 2, () => ({ mix: R(-0.2, 1.2), softness: pick([0, R(0, 15)]), bendPositive: rnd() < 0.5, compress: rnd() < 0.3, stretch: rnd() < 0.3 }), fields('mix', 'softness')) }));
    const transform = constraints.filter((c) => c.kind === 'transform' && rnd() < 0.5).map((c) => ({ name: c.name, keys: keysOf(rnd, MIXES.length, () => Object.fromEntries(MIXES.map((m) => [m, pick([0, 1, R(-0.5, 1.5)])])), fields(...MIXES)) }));
    const slotTimelines = [
      { name: 's0', timelines: [{ name: 'attachment', keys: [{ time: R(0, 0.3), name: 'q' }, { time: R(0.4, 0.6), name: null }, { time: R(0.7, 0.9), name: 'p' }] }, { name: 'rgba', keys: keysOf(rnd, 4, () => ({ color: hex(rnd, 8) }), colourChannel) }] },
      { name: 's1', timelines: [{ name: 'rgb', keys: keysOf(rnd, 3, () => ({ color: hex(rnd, 6) }), colourChannel) }, { name: 'attachment', keys: [{ time: R(0.2, 0.8), name: 'q' }] }] },
      { name: 's2', timelines: [{ name: 'alpha', keys: keysOf(rnd, 1, () => ({ value: R(-0.2, 1.2) }), fields('value')) }, { name: 'attachment', keys: [{ time: R(0.1, 0.9), name: 'q' }] }] },
    ];
    return { name, bones: boneTimelines, slots: slotTimelines, constraints: { ik, transform, path: [], physics: [], slider: [] } };
  };
  return probeModel({ bones, slots, attachments, constraints, animations: [animation('a'), animation('b')] });
}

/** A built gallery rig, named as the gate names it. */
interface Built {
  name: string;
  out: string;
}

function buildGallery(root: string, work: string): { built: Built[]; problems: string[] } {
  const galleryRoot = join(root, 'gallery');
  const names = existsSync(galleryRoot) ? readdirSync(galleryRoot).sort().filter((n) => existsSync(join(galleryRoot, n, 'rig.json'))) : [];
  const built: Built[] = [];
  const problems: string[] = [];
  names.forEach((name, i) => {
    const dir = join(work, `g${i}`);
    mkdirSync(dir, { recursive: true });
    const run = runRecipe(galleryRecipe(root, name).recipe, dir, root);
    const out = join(dir, 'out');
    if (run.exits.some((e) => e !== 0) || !existsSync(join(out, MODEL_DOCUMENT_FILE))) problems.push(`gallery/${name} built with exits ${JSON.stringify(run.exits)}`);
    else built.push({ name: `gallery/${name}`, out });
  });
  if (names.length === 0) problems.push(`no gallery rig under ${galleryRoot}`);
  return { built, problems };
}

/** The probes' numbers compared, over every one of a population. */
function population(n: number, seed: number, input: RuntimeCasesInput, plant: RuntimePlant = {}): { rows: RuntimeRow[]; texts: string[] } {
  const rnd = input.random(seed);
  const texts: string[] = [];
  const rows: RuntimeRow[] = [];
  for (let i = 0; i < n; i++) {
    const text = populationProbe(rnd);
    texts.push(text);
    rows.push(runtimeOfTexts(`probe ${i}`, text, '', plant));
  }
  return { rows, texts };
}

/**
 * The last bone no constraint names: its own setup rotation reaches its world
 * matrix whatever its mode, where a constrained bone's can be overwritten by
 * the constraint (a one-bone ik at mix 1 turns it to the target again).
 */
function freeBone(doc: ReturnType<typeof readModel>): string {
  const named = new Set(doc.constraints.flatMap((c) => (c.record !== undefined && 'bones' in c.record && Array.isArray(c.record.bones) ? c.record.bones : [])));
  const free = doc.bones.filter((b) => b.parent !== undefined && !named.has(b.name));
  return (free[free.length - 1] ?? doc.bones[doc.bones.length - 1]).name;
}

/** The control's figures off a set of rows. */
const sum = (rows: readonly RuntimeRow[], f: 'poses' | 'values'): number => rows.reduce((n, r) => n + r[f], 0);

/** The bytes the collector-off heap grew by per frame, over a batch, in a child process — the allocation control's instrument. */
export function allocationPerFrame(root: string, model: string, animation: string, plant: 'none' | 'object'): { bytes: number | null; said: string } {
  const run = Bun.spawnSync(['bun', join(root, 'tools', 'runtime_poser_cases.ts'), '--alloc', model, animation, plant], { env: { ...process.env, BUN_JSC_useGC: '0' } });
  const out = run.stdout.toString().trim().split('\n').pop() ?? '';
  try {
    const read = JSON.parse(out) as { bytesPerFrame: number; frames: number };
    return { bytes: read.bytesPerFrame, said: `${read.bytesPerFrame} B/frame, the least of three batches of ${read.frames} frames` };
  } catch {
    return { bytes: null, said: `the child exited ${run.exitCode}: ${run.stderr.toString().trim().slice(0, 300)}` };
  }
}

/** Every pose of a looping walk, the runtime's `step` against the core's live track (`openTrack`), every bone's world, every slot's colour and every drawn vertex by `Object.is`. */
function stepAgainstTrack(text: string, animation: string, steps: readonly number[]): { first: string | null; poses: number; values: number } {
  const view = underNoSkin(readModel(text));
  const runtime = compileRuntime(view, { ignore: ['events'] });
  const pose = new RuntimePose(runtime);
  pose.setAnimation(animation);
  pose.apply(0);
  const track = openTrack(view, animation, { loop: true, reset: 'animation' });
  let values = 0;
  let poses = 0;
  const same = (a: number, b: number): boolean => Object.is(a, b);
  const check = (raw: ReturnType<typeof track.step>, at: string): string | null => {
    poses++;
    if (!Object.is(raw.animationTime, pose.time)) return `${at}: the track's animation time ${raw.animationTime}, the runtime's ${pose.time}`;
    pose.computeVertices();
    for (let i = 0; i < raw.bones.length; i++) {
      const b = raw.bones[i];
      const o = i * WORLDS;
      const mine = [pose.world[o], pose.world[o + 1], pose.world[o + 2], pose.world[o + 3], pose.world[o + 4], pose.world[o + 5]];
      const theirs = [b.a, b.b, b.c, b.d, b.worldX, b.worldY];
      for (let k = 0; k < 6; k++) {
        values++;
        if (!same(mine[k], theirs[k])) return `${at}: bone "${b.name}" ${'abcdXY'[k]}: the track ${theirs[k]}, the runtime ${mine[k]}`;
      }
    }
    for (const d of raw.drawn) {
      const s = runtime.slots.findIndex((x) => x.name === d.slot);
      const at2 = runtime.attachments[pose.shown[s]];
      if (at2 === undefined || at2.name !== d.attachment) return `${at}: slot "${d.slot}" draws "${d.attachment}" on the track and ${at2 === undefined ? 'nothing' : `"${at2.name}"`} in the runtime`;
      for (let k = 0; k < d.vertices.length; k++) {
        values++;
        if (!same(d.vertices[k], pose.vertices[at2.offset + k])) return `${at}: slot "${d.slot}" vertex ${k}: the track ${d.vertices[k]}, the runtime ${pose.vertices[at2.offset + k]}`;
      }
    }
    return null;
  };
  let first = check(track.first, 'pose 0');
  for (let i = 0; i < steps.length && first === null; i++) {
    const raw = track.step(steps[i]);
    pose.step(steps[i]);
    first = check(raw, `step ${i + 1} (dt ${steps[i]})`);
  }
  return { first, poses, values };
}

/** A model that compiles, or its refusal's features; an animation's refusal read through `animation(name)`. */
function refusalOf(text: string, options: { ignore?: readonly 'events'[] } = {}): { model: RuntimeModel | null; features: RuntimeFeature[]; message: string } {
  try {
    return { model: compileRuntime(readModel(text), options), features: [], message: '' };
  } catch (err) {
    if (err instanceof RuntimeRefusal) return { model: null, features: err.missing.map((m) => m.feature), message: err.message };
    throw err;
  }
}

/** The runtime poser's controls (the suite's `runtime-poser`). */
export function runtimePoserCases(say: Say, input: RuntimeCasesInput): void {
  const identity = runtimeAttachmentIdentityCase();
  say('RP12_ATTACHMENT_SOURCE_IDENTITY_SURVIVES_SHARED_DISPLAY_NAMES', identity.problems, identity.detail);
  const { built, problems: buildProblems } = buildGallery(input.root, join(input.work, 'gallery'));
  const gallery = built.map((b) => runtimeRow(b.name, b.out));

  // --- RP01: the gallery through the third dumper — every covered model equal at 0, every other one SKIP by name --
  {
    const probes = [...buildProblems];
    const whole = gallery.filter((r) => r.verdict === 'IDENTICAL');
    for (const r of gallery) if (r.verdict === 'DIFF' || r.verdict === 'REFUSED') probes.push(`${r.name}: ${r.verdict} — ${r.why}`);
    for (const r of gallery) if (r.verdict === 'SKIP' && (r.why === null || !RUNTIME_FEATURES.some((f) => (r.why ?? '').includes(f)) && !(r.why ?? '').includes('events'))) probes.push(`${r.name}: SKIP naming no feature — ${r.why}`);
    if (whole.length === 0) probes.push('no gallery rig is posed whole by the runtime poser, so the positive control compared no model in full');
    for (const r of whole) if (r.poses < 2 || r.values === 0) probes.push(`${r.name}: IDENTICAL over ${r.poses} pose(s) and ${r.values} value(s)`);
    const lines = runtimeLines(gallery);
    if (!lines.ok || !lines.lines[lines.lines.length - 1].startsWith('RUNTIME GREEN')) probes.push(`the verdict line reads ${lines.lines[lines.lines.length - 1]}`);
    say(
      'RP01_A_COVERED_GALLERY_MODEL_POSES_EQUAL_TO_THE_ORACLE_AT_TOLERANCE_0_AND_EVERY_OTHER_ONE_SKIPS_BY_NAME',
      probes,
      `${gallery.length} gallery rig(s) through the third dumper: ${whole.length} covered whole and IDENTICAL [${whole.map((r) => `${r.name}: ${r.poses} pose(s), ${r.values} value(s)`).join('; ')}], ${gallery.filter((r) => r.verdict === 'SKIP').length} SKIP each naming what it misses, ${sum(gallery, 'values')} value(s) compared at tolerance 0 in all; the verdict line GREEN`,
    );
  }

  // --- RP02: the population — every construct stage 0 poses, equal at 0 --
  const N = 240;
  const pop = population(N, 15911, input);
  {
    const probes: string[] = [];
    const exact = pop.rows.filter((r) => r.verdict === 'IDENTICAL');
    for (const r of pop.rows) if (r.verdict !== 'IDENTICAL' && probes.length < 3) probes.push(`${r.name}: ${r.verdict} — ${r.why}`);
    const reach = { modes: new Set<string>(), ik2: 0, ik1: 0, transform: 0, repeated: 0, longer: 0 };
    for (const text of pop.texts) {
      const doc = readModel(text);
      for (const b of doc.bones) reach.modes.add(b.inheritMode ?? 'normal');
      for (const c of doc.constraints) {
        if (c.record?.kind === 'ik') reach[c.record.bones.length === 2 ? 'ik2' : 'ik1']++;
        if (c.record?.kind === 'transform') {
          reach.transform++;
          if (new Set(c.record.bones).size < c.record.bones.length) reach.repeated++;
          if (c.record.bones.length > doc.bones.length) reach.longer++;
        }
      }
    }
    if (reach.modes.size < MODES5.length) probes.push(`the population reaches the modes [${[...reach.modes].join(', ')}], not all five`);
    if (reach.repeated === 0 || reach.longer === 0) probes.push(`the population reaches ${reach.repeated} transform(s) naming a bone twice and ${reach.longer} naming more entries than the skeleton has bones; both are required`);
    say(
      'RP02_A_SEEDED_POPULATION_OF_EVERY_CONSTRUCT_STAGE_0_POSES_IS_EQUAL_TO_THE_ORACLE_AT_TOLERANCE_0',
      probes,
      `${exact.length} of ${N} probes IDENTICAL, ${sum(pop.rows, 'poses')} pose(s) and ${sum(pop.rows, 'values')} value(s) at tolerance 0: all five inherit modes, ${reach.ik1} one-bone and ${reach.ik2} two-bone ik and ${reach.transform} world transform constraint(s) — ${reach.repeated} naming a bone more than once, ${reach.longer} of them with more entries than the skeleton has bones — each probe's two animations posed on one pose in turn`,
    );
  }

  // --- RP03: a 1e-6 perturbation of one bone's setup rotation is caught by name --
  {
    const probes: string[] = [];
    const targets = gallery.filter((r) => r.verdict === 'IDENTICAL');
    const caught: string[] = [];
    for (const r of targets) {
      const b = built.find((x) => x.name === r.name) as Built;
      const doc = readModel(readFileSync(join(b.out, MODEL_DOCUMENT_FILE), 'utf8'));
      const bone = freeBone(doc);
      const red = runtimeRow(r.name, b.out, { setupNudge: { bone, field: L_ROTATION, delta: 1e-6 } });
      if (red.verdict !== 'DIFF' || !(red.why ?? '').includes(`"${bone}"`)) probes.push(`${r.name}: bone "${bone}" turned 1e-6° read ${red.verdict} — ${red.why}`);
      else caught.push(`${r.name} at bone "${bone}"`);
    }
    const planted = pop.texts.slice(0, 40).map((text, i) => runtimeOfTexts(`probe ${i}`, text, '', { setupNudge: { bone: freeBone(readModel(text)), field: L_ROTATION, delta: 1e-6 } }));
    const missed = planted.filter((r) => r.verdict !== 'DIFF');
    if (missed.length > 0) probes.push(`${missed.length} of ${planted.length} probes turned 1e-6° read ${missed.map((r) => `${r.name} ${r.verdict}`).slice(0, 3).join(', ')}`);
    if (targets.length === 0) probes.push('no gallery rig is covered whole, so the plant had no corpus row to turn red');
    say(
      'RP03_A_1E_6_PERTURBATION_OF_ONE_BONE_IS_CAUGHT_BY_NAME',
      probes,
      `one bone's setup rotation +1e-6° at load: DIFF naming the bone on [${caught.join(', ')}], and on ${planted.length - missed.length} of ${planted.length} probes`,
    );
  }

  // --- RP04: a weighted binding rebound to the next bone's index is caught --
  {
    const probes: string[] = [];
    const rebind: RuntimePlant = { bindingIndex: (i, n) => (i + 1) % n };
    let weighted = 0;
    let red = 0;
    pop.texts.slice(0, 60).forEach((text, i) => {
      weighted++;
      const r = runtimeOfTexts(`probe ${i}`, text, '', rebind);
      if (r.verdict === 'DIFF' && (r.why ?? '').includes('attachment')) red++;
      else if (probes.length < 3) probes.push(`probe ${i}, whose slot s2 shows a weighted mesh: ${r.verdict} — ${r.why}`);
    });
    say(
      'RP04_A_WEIGHTED_BINDING_BOUND_TO_THE_WRONG_BONE_INDEX_IS_CAUGHT',
      probes,
      `every binding of every weighted mesh rebound to the next bone's index at load: ${red} of ${weighted} probes DIFF on their attachments`,
    );
  }

  // --- RP05: a refused feature smuggled through is a DIFF, never a pass --
  {
    const probes: string[] = [];
    const deformed = gallery.filter((r) => r.refusedAnimations.some((a) => a.missing.some((m) => m.feature === 'deform-timeline')));
    const turned: string[] = [];
    for (const r of deformed) {
      const b = built.find((x) => x.name === r.name) as Built;
      const smuggled = runtimeRow(r.name, b.out, { admit: ['deform-timeline'] });
      if (smuggled.verdict !== 'DIFF' || !(smuggled.why ?? '').includes('attachment')) probes.push(`${r.name}: its deform timelines posed as absent read ${smuggled.verdict} — ${smuggled.why}`);
      else turned.push(r.name);
    }
    if (deformed.length === 0) probes.push('no gallery rig keys a deform timeline, so nothing was smuggled');
    say(
      'RP05_A_REFUSED_FEATURE_SMUGGLED_THROUGH_IS_A_DIFF_NEVER_A_PASS',
      probes,
      `the deform-timeline refusal let through by a plant, the timelines posed as absent: DIFF on the attachments of [${turned.join(', ')}], every gallery rig that keys one`,
    );
  }

  // --- RP06: a steady-state frame allocates nothing --
  {
    const probes: string[] = [];
    const target = gallery.filter((r) => r.covered.length > 0).sort((x, y) => y.values - x.values)[0];
    let said = 'no covered gallery animation to measure';
    if (target === undefined) probes.push(said);
    else {
      const b = built.find((x) => x.name === target.name) as Built;
      const model = join(b.out, MODEL_DOCUMENT_FILE);
      const clean = allocationPerFrame(input.root, model, target.covered[0], 'none');
      const planted = allocationPerFrame(input.root, model, target.covered[0], 'object');
      said = `${target.name} "${target.covered[0]}", stepped and its vertices computed under BUN_JSC_useGC=0: ${clean.said}; with one small object allocated per frame planted beside it: ${planted.said}`;
      if (clean.bytes === null || clean.bytes >= 1) probes.push(`the runtime poser: ${clean.said}`);
      if (planted.bytes === null || planted.bytes < 16) probes.push(`the planted allocation read ${planted.said}, so the instrument would not see one`);
    }
    say('RP06_A_STEADY_STATE_FRAME_ALLOCATES_NOTHING_AND_THE_INSTRUMENT_SEES_ONE_OBJECT', probes, said);
  }

  // --- RP07: a looping walk stepped by the runtime is the core's live track, value for value --
  {
    const probes: string[] = [];
    const steps = Array.from({ length: 240 }, (_, f) => 0.004 + ((f * 7919) % 97) / 2000);
    const walked: string[] = [];
    for (const r of gallery.filter((x) => x.covered.length > 0 && x.refusedAtLoad === null)) {
      const b = built.find((x) => x.name === r.name) as Built;
      const text = readFileSync(join(b.out, MODEL_DOCUMENT_FILE), 'utf8');
      for (const animation of r.covered) {
        const w = stepAgainstTrack(text, animation, steps);
        if (w.first !== null) probes.push(`${r.name} "${animation}": ${w.first}`);
        else walked.push(`${r.name} "${animation}" ${w.poses} pose(s), ${w.values} value(s)`);
      }
    }
    pop.texts.slice(0, 20).forEach((text, i) => {
      const w = stepAgainstTrack(text, 'a', steps);
      if (w.first !== null && probes.length < 4) probes.push(`probe ${i}: ${w.first}`);
    });
    if (walked.length === 0) probes.push('no covered gallery animation was walked');
    say(
      'RP07_A_LOOPING_WALK_STEPPED_BY_THE_RUNTIME_IS_THE_LIVE_TRACK_VALUE_FOR_VALUE',
      probes,
      `240 irregular steps of 4–52 ms across the wrap, the runtime's step against openTrack's, bones, colours and drawn vertices by Object.is: [${walked.join('; ')}] and 20 probes`,
    );
  }

  // --- RP08: every construct stage 0 does not pose is refused by name, the model's at load and an animation's alone --
  {
    const probes: string[] = [];
    const base: ProbeSpec = {
      bones: [{ name: 'root' }, { name: 'a', parent: 'root', x: 10, length: 20 }, { name: 'b', parent: 'a', x: 20, length: 20 }, { name: 't', parent: 'root', x: 30, y: 30 }],
      slots: [{ name: 's', bone: 'b', setup: 'p' }, { name: 'm', bone: 'a', setup: 'mesh' }],
      attachments: { s: { p: { kind: 'region', width: 10, height: 10, atlas: rect(10, 10) } }, m: { mesh: { kind: 'mesh', uvs: [0, 0, 1, 0, 0, 1], triangles: [0, 1, 2], vertices: { weighted: false, xy: [0, 0, 10, 0, 0, 10] } } } },
      constraints: [{ kind: 'ik', name: 'k', bones: ['a', 'b'], target: 't' }],
      animations: [{ name: 'idle', bones: [{ name: 'a', timelines: [{ name: 'rotate', keys: [{ time: 0, value: 0 }, { time: 1, value: 30 }] }] }] }],
    };
    const fired = new Set<RuntimeFeature>();
    const plain = refusalOf(probeModel(base));
    if (plain.model === null) probes.push(`the base probe was refused: ${plain.message}`);
    // The model's own constructs: each refuses the whole model, naming itself.
    const modelProbes: Array<[RuntimeFeature, ProbeSpec]> = [
      ['skin', { ...base, skins: [{ name: 'extra', bones: [], constraints: {}, attachments: {} }] }],
      ['local-transform', { ...base, constraints: [{ kind: 'transform', name: 'x', bones: ['b'], source: 't', localSource: true, properties: { x: { to: { x: {} } } } }] }],
      ['additive-transform', { ...base, constraints: [{ kind: 'transform', name: 'x', bones: ['b'], source: 't', additive: true, properties: { x: { to: { x: {} } } } }] }],
      ['inactive-constrained-bone', { ...base, bones: base.bones.map((b) => (b.name === 'b' ? { ...b, skinRequired: true } : b)) }],
      ['noscale-world-target', { ...base, bones: base.bones.map((b) => (b.name === 'b' ? { ...b, inheritMode: 'noScale' } : b)), constraints: [{ kind: 'transform', name: 'x', bones: ['b'], source: 't', properties: { rotate: { to: { rotate: {} } } } }] }],
      ['clipping', { ...base, attachments: { ...base.attachments, s: { p: { kind: 'clipping', vertexCount: 3, vertices: { weighted: false, xy: [0, 0, 10, 0, 0, 10] } } } } }],
      ['null-atlas-region', { ...base, attachments: { ...base.attachments, s: { p: { kind: 'region', width: 10, height: 10, atlas: null } } } }],
      ['skin-conflict', { ...base, skins: [{ name: 'extra', bones: [], constraints: {}, attachments: { s: { p: { kind: 'region', name: 'other', width: 10, height: 10, atlas: rect(10, 10) } } } }] }],
      // A transform writing into an inactive bone, and a second reading the active bone below it while it moves a posed one: the oracle refuses the pose (`unposedLeakWhy`).
      ['oracle-absent', { ...base, bones: [...base.bones, { name: 'h', parent: 'root', skinRequired: true }, { name: 'hc', parent: 'h', x: 3 }, { name: 'r', parent: 'root', x: 5 }], constraints: [{ kind: 'transform', name: 'w', bones: ['h'], source: 't', properties: { x: { to: { x: {} } } } }, { kind: 'transform', name: 'rd', bones: ['r'], source: 'hc', properties: { x: { to: { x: {} } } } }] }],
    ];
    for (const [feature, spec] of modelProbes) {
      const r = refusalOf(probeModel(spec));
      if (r.model !== null || !r.features.includes(feature)) probes.push(`${feature}: ${r.model !== null ? 'compiled' : `refused naming [${r.features.join(', ')}]`}`);
      else fired.add(feature);
    }
    // The gallery's: a path constraint, a slider and a physics constraint.
    for (const r of gallery) for (const m of r.refusedAtLoad ?? []) if (m.feature === 'path-constraint' || m.feature === 'slider-constraint' || m.feature === 'physics-constraint') fired.add(m.feature);
    // An animation's own constructs: the model compiles, the animation is refused and `animation(name)` throws naming it; `idle` is posed.
    const seqRegion = { kind: 'region', width: 10, height: 10, sequence: { count: 2, start: 0, digits: 0, setup: 0, atlas: [rect(10, 10), rect(8, 8)] } };
    const animationProbes: Array<[RuntimeFeature, ProbeSpec, Obj]> = [
      ['inherit-timeline', base, { name: 'x', bones: [{ name: 'b', timelines: [{ name: 'inherit', keys: [{ time: 0, inherit: 'onlyTranslation' }] }] }] }],
      ['deform-timeline', base, { name: 'x', attachments: [{ name: 'default', slots: [{ name: 'm', attachments: [{ name: 'mesh', deform: [{ time: 0, vertices: [1, 2, 3, 4, 5, 6] }, { time: 1 }] }] }] }] }],
      ['sequence-timeline', { ...base, attachments: { ...base.attachments, s: { p: seqRegion } } }, { name: 'x', attachments: [{ name: 'default', slots: [{ name: 's', attachments: [{ name: 'p', sequence: [{ time: 0, mode: 'loop', index: 0, delay: 0.1 }] }] }] }] }],
      ['draw-order-timeline', base, { name: 'x', drawOrder: [{ time: 0.5, offsets: [{ slot: 's', offset: 1 }] }] }],
      ['events', { ...base, events: [{ name: 'e' }] }, { name: 'x', events: [{ time: 0.5, name: 'e' }] }],
      ['dark-colour-timeline', { ...base, slots: [{ name: 's', bone: 'b', setup: 'p', dark: '000000' }, base.slots?.[1] as Obj] }, { name: 'x', slots: [{ name: 's', timelines: [{ name: 'rgba2', keys: [{ time: 0, light: 'ffffffff', dark: '102030' }] }] }] }],
      ['clipping', { ...base, attachments: { ...base.attachments, s: { ...(base.attachments?.s ?? {}), c: { kind: 'clipping', vertexCount: 3, vertices: { weighted: false, xy: [0, 0, 10, 0, 0, 10] } } } } }, { name: 'x', slots: [{ name: 's', timelines: [{ name: 'attachment', keys: [{ time: 0.5, name: 'c' }] }] }] }],
    ];
    for (const [feature, spec, animation] of animationProbes) {
      const text = probeModel({ ...spec, animations: [...(spec.animations ?? []), animation] });
      const r = refusalOf(text);
      const refusal = r.model?.refused.find((x) => x.animation === 'x');
      let thrown = '';
      try {
        r.model?.animation('x');
      } catch (err) {
        if (err instanceof RuntimeRefusal) thrown = err.message;
      }
      if (r.model === null || refusal === undefined || !refusal.missing.some((m) => m.feature === feature) || !thrown.includes(feature) || !r.model.animations.has('idle')) probes.push(`${feature}: ${r.model === null ? `the model was refused [${r.features.join(', ')}]` : `refused [${refusal?.missing.map((m) => m.feature).join(', ') ?? 'nothing'}], animation("x") threw ${JSON.stringify(thrown.slice(0, 120))}, idle ${r.model.animations.has('idle') ? 'posed' : 'not posed'}`}`);
      else fired.add(feature);
      if (feature === 'events') {
        const asked = refusalOf(text, { ignore: ['events'] });
        if (asked.model === null || !asked.model.animations.has('x')) probes.push('events: with ignore: [\'events\'] the animation was still refused');
      }
    }
    const unfired = RUNTIME_FEATURES.filter((f) => !fired.has(f));
    if (unfired.length > 0) probes.push(`no probe refused by [${unfired.join(', ')}]`);
    // A call the runtime cannot answer is refused by name too.
    const pose = plain.model === null ? null : new RuntimePose(plain.model);
    const inputError = (f: () => void, expected: string): void => {
      try {
        f();
        probes.push(`${expected}: no refusal`);
      } catch (err) {
        if (!(err instanceof RuntimeInputError) || !err.message.includes(expected)) probes.push(`${expected}: refused as ${(err as Error).message}`);
      }
    };
    if (pose !== null) {
      inputError(() => pose.apply(0), 'no animation is set');
      inputError(() => pose.setAnimation('nosuch'), '"nosuch" is not one of');
      pose.setAnimation('idle');
      inputError(() => pose.apply(Number.NaN), 'is not finite');
    }
    say(
      'RP08_EVERY_CONSTRUCT_STAGE_0_DOES_NOT_POSE_IS_REFUSED_BY_NAME_THE_MODELS_AT_LOAD_AND_AN_ANIMATIONS_ALONE',
      probes,
      `each of the ${RUNTIME_FEATURES.length} features refused by a probe naming it — ${modelProbes.length} hand-written models refused at load, the path, slider and physics constraints off the gallery, ${animationProbes.length} animations refused alone while the model's other animation is posed; events posed on request (ignore: ['events']); no animation set, an unknown animation and a time that is not finite refused by name`,
    );
  }

  // --- RP09: SKIP is never a pass — a corpus the runtime poses none of is a HOLE, a DIFF is RED --
  {
    const probes: string[] = [];
    const refusedOnly = gallery.filter((r) => r.refusedAtLoad !== null);
    const hole = runtimeLines(refusedOnly);
    if (refusedOnly.length === 0) probes.push('no gallery rig is refused at load');
    else {
      if (!hole.lines.some((l) => l.startsWith('  HOLE  runtime: the runtime poser posed nothing'))) probes.push(`a corpus of refused rows printed no HOLE: ${hole.lines.join(' | ')}`);
      if (!hole.lines[hole.lines.length - 1].includes(' 0 covered whole')) probes.push(`a corpus of refused rows counted a covered row: ${hole.lines[hole.lines.length - 1]}`);
    }
    const red = runtimeLines([...gallery, { ...gallery[0], verdict: 'DIFF', why: 'planted' }]);
    if (red.ok || !red.lines[red.lines.length - 1].startsWith('RUNTIME RED')) probes.push(`a DIFF row read ${red.lines[red.lines.length - 1]}`);
    say(
      'RP09_A_SKIP_IS_NEVER_A_PASS_A_CORPUS_POSED_BY_NONE_IS_A_HOLE_AND_A_DIFF_IS_RED',
      probes,
      `the ${refusedOnly.length} gallery rig(s) refused at load, alone: a HOLE line and 0 covered whole; a DIFF row among the gallery's: RUNTIME RED`,
    );
  }

  // --- RP11: a transform naming a bone more times than the skeleton has bones reposes every bone below the last (issue #1591's review) --
  {
    const probes: string[] = [];
    // The review's rig: a, b under the root, c under b; the transform names a four times and then b, five entries over four bones, and moves b from x 10 to 40.
    const text = probeModel({
      bones: [{ name: 'root' }, { name: 'a', parent: 'root' }, { name: 'b', parent: 'root', x: 10 }, { name: 'c', parent: 'b', x: 5 }],
      constraints: [{ kind: 'transform', name: 'move', bones: ['a', 'a', 'a', 'a', 'b'], source: 'root', properties: { x: { to: { x: { offset: 40 } } } } }],
      animations: [{ name: 'idle', bones: [{ name: 'root', timelines: [{ name: 'rotate', keys: [{ time: 0, value: 0 }, { time: 1, value: 30 }] }] }] }],
    });
    const live = runtimeOfTexts('repeated targets', text, '');
    if (live.verdict !== 'IDENTICAL') probes.push(`the rig read ${live.verdict} — ${live.why}`);
    const model = compileRuntime(readModel(text));
    const pose = new RuntimePose(model);
    pose.setupPose();
    const c = model.boneNames.indexOf('c');
    const cx = pose.world[c * WORLDS + 4];
    if (cx !== 45) probes.push(`c sits at x ${cx} at setup; the oracle puts it at 45 (b moved to 40, c 5 beyond)`);
    const short = runtimeOfTexts('repeated targets, scratch by bone count', text, '', { scratchByBones: true });
    if (short.verdict !== 'DIFF' || !(short.why ?? '').includes('"c"')) probes.push(`the scratch sized by the bone count, planted, read ${short.verdict} — ${short.why}`);
    const shortPop = pop.texts.map((t, i) => ({ t, i })).filter(({ t }) => readModel(t).constraints.some((x) => x.record?.kind === 'transform' && x.record.bones.length > readModel(t).bones.length));
    const reddened = shortPop.filter(({ t, i }) => runtimeOfTexts(`probe ${i}`, t, '', { scratchByBones: true }).verdict === 'DIFF');
    if (shortPop.length === 0) probes.push('no population probe names more targets than it has bones');
    else if (reddened.length === 0) probes.push(`the plant turned none of the ${shortPop.length} population probe(s) naming more targets than bones red`);
    say(
      'RP11_A_TRANSFORM_NAMING_A_BONE_MORE_TIMES_THAN_THE_SKELETON_HAS_BONES_REPOSES_EVERY_BONE_BELOW_THE_LAST',
      probes,
      `the review's rig — bones root, a, b, c under b; targets [a, a, a, a, b], b moved from x 10 to 40 — IDENTICAL to the oracle at tolerance 0 over ${live.poses} pose(s), c at x ${cx}; the update order's scratch sized by the bone count instead, planted: ${short.verdict} — ${short.why ?? ''}; on the ${shortPop.length} population probe(s) naming more targets than bones, ${reddened.length} red under the plant`,
    );
  }
}

/** `--alloc <model> <animation> none|object`: the allocation control's child (`allocationPerFrame`). */
function allocChild(argv: readonly string[]): number {
  const [model, animation, plant] = argv;
  const view = underNoSkin(readModel(readFileSync(model, 'utf8'), model));
  const runtime = compileRuntime(view, { ignore: ['events'] });
  const pose = new RuntimePose(runtime);
  pose.setAnimation(animation);
  pose.apply(0);
  let sink: unknown = null;
  const frame = (f: number): void => {
    pose.step(1 / 60);
    pose.computeVertices();
    if (plant === 'object') sink = { f, x: pose.world[0] };
  };
  for (let f = 0; f < 3000; f++) frame(f);
  // The least of three batches: a one-off growth of the heap's own (measured: 16 KiB once in a batch, on a loaded machine) lands in one batch, an allocation per frame in every one.
  const frames = 4000;
  let least = Infinity;
  for (let batch = 0; batch < 3; batch++) {
    const before = process.memoryUsage().heapUsed;
    for (let f = 0; f < frames; f++) frame(f);
    least = Math.min(least, (process.memoryUsage().heapUsed - before) / frames);
  }
  void sink;
  console.log(JSON.stringify({ bytesPerFrame: least, frames }));
  return 0;
}

if (import.meta.main && process.argv[2] === '--alloc') process.exit(allocChild(process.argv.slice(3)));
