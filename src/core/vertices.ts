/**
 * The core's third construct: every drawn attachment's world vertices at the
 * setup pose (issue #931, step 2c of issue #380) — the oracle's
 * `setup.attachments` block, a region's four corners and a mesh's vertices,
 * and its `setup.clips` block, a clipping polygon and the slot its clip ends
 * at. It is the first construct where the core's arithmetic meets geometry the
 * compiler measured, so exact equivalence here is also a check on the model.
 *
 * ## How every rule below was fixed
 *
 * By posing hand-written skeletons through `tools/pose_oracle.ts dump`
 * (spine-core 4.3.13, `--skin all`, `--physics none`) and comparing a formula
 * over the core's own world transforms (`./world.ts`) with the rows the dump
 * printed, at tolerance 0 on the oracle's six-decimal grid. The runtime's
 * source was not read. The bone rows read exact in every probe, so every
 * residual below belongs to the attachment rule. The core suite's `CO17`
 * holds a hand-written skeleton of every case against the core at tolerance 0.
 *
 * ## A region's four corners
 *
 * Let `W, H` be the record's `width, height`, `sx, sy` its `scaleX, scaleY`
 * (1 unstated), and `ox, oy, w, h, ow, oh` its atlas rectangle's `offsetX,
 * offsetY, width, height, originalWidth, originalHeight` (`ModelAtlasRect`,
 * issue #935). With `kx = W/ow·sx` and `ky = H/oh·sy`:
 *
 *   x1 = −W/2·sx + ox·kx,   y1 = −H/2·sy + oy·ky,   x2 = x1 + w·kx,   y2 = y1 + h·ky
 *
 * and the corners, in this order, are `(x1,y1) (x1,y2) (x2,y2) (x2,y1)` —
 * bottom-left, upper-left, upper-right, bottom-right, as the oracle's header
 * words them. Each is turned by the record's `rotation` (degrees, pi written
 * as `./world.ts`'s `RUNTIME_PI`), moved by its `x, y` (0 unstated), and
 * carried through the slot bone's world matrix: `a·x + b·y + worldX`,
 * `c·x + d·y + worldY`. Every record field is read as the double the document
 * spells.
 *
 * Measured on 6000 hand-written regions — 70% of them trimmed, atlas `rotate`
 * 0, 90, 180 or 270, placement in ±50, rotation in ±180 and scale in ±2 —
 * each on one of ten bones rotated, scaled, sheared and reflecting, posed
 * four times: field values float32-exact and spelled with five non-float32
 * decimals, each on a page of `scale:` 1 and 0.37 (1500 each):
 *
 * | reading | exact |
 * | --- | ---: |
 * | the rule above, fields as doubles | 6000 of 6000 |
 * | the trim ignored (`w, h` for `ow, oh`, offsets 0) | 1796 of 6000, worst 335.43 units |
 * | the fields read through `Math.fround`, on the non-float32 spellings | 13 of 3000, worst 41 millionths |
 * | the atlas `bounds` taken as transposed at 90 and 270 | 3007 of 6000, worst 1634.26 units |
 *
 * So the page's `scale:` and the atlas's `rotate` do not enter the corners;
 * the rectangle's `width` and `height` are in the drawing's orientation, as
 * `AtlasRegion` in `src/atlas.ts` states.
 *
 * - **A region with a `sequence` draws its setup frame's rectangle.** Four
 *   probes of one three-frame sequence whose frames differ in their trims:
 *   `setup` unstated and `setup: 0` matched frame 0's corners, `setup: 1`
 *   frame 1's and `setup: 2` frame 2's, and no other frame's. The frame is
 *   the model's `sequence.atlas[setup ?? 0]`.
 * - ⛔ **A region whose rectangle is `null` leaves the whole block out, by
 *   name.** `null` is the model's statement that the build had no source for
 *   that region (`ModelRegionAttachment.atlas`); posing it at a trim of 0
 *   would be inventing the four numbers the corners read — the build pair of
 *   issue #931 posed one such document 11.925 world units apart. A block
 *   with one row missing would read as a roster difference, not an absence,
 *   so the block is absent and every such slot is named.
 *
 * ## A mesh's vertices, and a clipping polygon's
 *
 * - Unweighted: each local `x, y` through the slot bone's world matrix plus
 *   its origin.
 * - Weighted: per vertex, the sum over its bindings in order of
 *   `(x·a + y·b + worldX)·weight` and `(x·c + y·d + worldY)·weight`, each
 *   binding's bone looked up BY NAME (`ModelBinding`) — its world, not the
 *   slot bone's.
 * - ⚠️ **Every vertex coordinate, bind coordinate and weight is read through
 *   `Math.fround` first**: the runtime stores a vertex attachment's array as
 *   float32, while it reads a bone's and a region's numbers as the doubles
 *   the text spells (`src/model.ts`'s 🔸). Measured on 1200 meshes over the
 *   ten bones (60% weighted over one to four of them): float32-exact inputs
 *   600 of 600 either way; inputs with five non-float32 decimals 600 of 600
 *   through `Math.fround`, 0 of 600 as doubles (worst 11 millionths). On the
 *   corpus, `gallery/flex`'s weighted meshes and `gallery/squash`'s ball read
 *   1 to 3 millionths off as doubles and exact through `Math.fround`.
 * - A linked mesh is written by the oracle as kind `mesh` under its own name,
 *   and its vertices are its SOURCE mesh's (`skin`, `slot`, `source` in the
 *   model) through the linked mesh's own slot bone: a linked mesh on a
 *   rotated, reflected and sheared bone, sourced from a mesh in another slot
 *   of another skin, read exact.
 * - The atlas does not enter a mesh's vertices, and a mesh's `sequence`
 *   changes none of them.
 * - A clipping polygon follows the mesh rule, and its row's `end` is the
 *   model's `end` slot or `null`: 1200 polygons drawn as the meshes above,
 *   half of them ending at a slot, read exact and with the right end through
 *   `Math.fround` (600 of 600 on each spelling), and 0 of 600 as doubles on
 *   the non-float32 spelling (worst 11 millionths).
 *
 * ## Which slots, and in what order
 *
 * A slot is listed when what it shows at setup (`shownAttachment`, issue
 * #928) is a region, a mesh or a linked mesh (`setup.attachments`) or a
 * clipping polygon (`setup.clips`), whether or not its bone is active — an
 * inactive bone's world is all zeros, and the oracle's ill-conditioned rule
 * excludes it. Rows are in the model's slot order, which is the setup draw
 * order (`ModelSlot`): measured the same order as spine-core's on 19 of 19
 * recipes. A bounding box and a path attachment have no row: the oracle's
 * dump writes no vertices for either, so neither can be posed against it.
 *
 * ## At a sample, and under a deform or a sequence (issue #955)
 *
 * `poseGeometry` poses a sample's attachments the same way, through the
 * sample's bones and in its draw order. A slot a deform timeline moved
 * carries its deform array (`ShownGeometry.deform`): the vertices are the
 * array's (`deformedVertices` in `./deform.ts`) and their coordinates are read
 * AS THEY ARE, not through `Math.fround` again — a lerped deform is a double
 * the runtime does not round (`./deform.ts`'s header: the lerped positions
 * rounded to float32 missed 791 of 800 samples). A region a sequence
 * timeline stepped carries its frame (`ShownGeometry.frame`), and its corners
 * read that frame's rectangle (`CoreRegionGeometry.frames`).
 */
import type { ModelAtlasRect, ModelBinding, ModelVertices } from '../model.ts';
import { RUNTIME_PI, type CoreWorld } from './world.ts';
import { deformedVertices } from './deform.ts';
import { poseClipped, REGION_TRIANGLES, REGION_UVS, type CoreClippedRow, type DrawStep, type ShapeClipper, type TriangleClipper } from './clipping.ts';

const RAD = RUNTIME_PI / 180;

/** What a region record carries for its corners — `atlas` already the rectangle of the frame shown at setup. */
export interface CoreRegionGeometry {
  x?: number;
  y?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  width: number;
  height: number;
  /** The rectangle drawn at setup, or `null` when the model states the build had none. */
  atlas: ModelAtlasRect | null;
  /** A sequence's rectangles, one per frame (`sequence.atlas`) — what a sequence timeline's frame draws (`./deform.ts`). */
  frames?: ModelAtlasRect[];
}

/** The geometry a record carries, by kind, as far as the construct reads it. */
export type CoreGeometry =
  | { kind: 'region'; region: CoreRegionGeometry }
  | { kind: 'mesh'; vertices: ModelVertices; uvs: number[]; triangles: number[]; hull?: number }
  | { kind: 'linkedmesh'; skin: string; slot: string; source: string }
  | { kind: 'clipping'; end: string | null; vertices: ModelVertices; inverse: boolean; convex: boolean }
  | { kind: 'boundingbox'; vertices: ModelVertices }
  | { kind: 'path'; vertices: ModelVertices; closed: boolean; constantSpeed: boolean; lengths: number[] };

/** A mesh's geometry as the document view files it — what `meshArraysOf` keys on. */
export type CoreMeshGeometry = Extract<CoreGeometry, { kind: 'mesh' }>;

/** A mesh's UVs and triangles as a pose hands them out: read-only, and the same arrays on every pose. */
export interface MeshArrays {
  readonly uvs: readonly number[];
  readonly triangles: readonly number[];
}

/** What hands out a mesh's `MeshArrays`: `meshArraysOf` unless a control passes another (the core suite's shared-array control). */
export type MeshArraysOf = (mesh: CoreMeshGeometry) => MeshArrays;

/** Each mesh geometry's frozen arrays, keyed on the document view's own geometry object, which no reader writes. */
const meshArraysByGeometry = new WeakMap<CoreMeshGeometry, MeshArrays>();

/**
 * A mesh's UVs and triangles, copied once per geometry object and frozen
 * (issue #1530). The raw entry used to spread both into new arrays on every
 * pose for every drawn mesh, so that a consumer writing into a pose's arrays
 * could not reach the document's; frozen, a write throws instead, and every
 * pose of every walk and track over the same document view hands out the
 * same two arrays — so a consumer keyed on them by identity reuses what it
 * built from them. The copy is what keeps the document's own arrays out of a
 * consumer's hands: they are the reader's, and freezing them would write to
 * a value the caller passed in.
 */
export function meshArraysOf(mesh: CoreMeshGeometry): MeshArrays {
  let kept = meshArraysByGeometry.get(mesh);
  if (kept === undefined) {
    kept = Object.freeze({ uvs: Object.freeze([...mesh.uvs]), triangles: Object.freeze([...mesh.triangles]) });
    meshArraysByGeometry.set(mesh, kept);
  }
  return kept;
}

/** One row of `setup.attachments`: `[slot, attachment, kind, vertices]`, the oracle's row. */
export type CoreAttachmentRow = [string, string, 'region' | 'mesh', Array<number | null>];
/** One row of `setup.clips`: `[slot, attachment, end, polygon]`, the oracle's row. */
export type CoreClipRow = [string, string, string | null, Array<number | null>];

/** What computes a region's corners in the slot bone's world: `regionCorners` unless a caller passes another. */
export type RegionPoser = (region: CoreRegionGeometry & { atlas: ModelAtlasRect }, bone: CoreWorld) => number[];
/** What computes a vertex array's world positions: `worldVertices` unless a caller passes another. */
export type VertexPoser = (vertices: ModelVertices, bone: CoreWorld, world: ReadonlyMap<string, CoreWorld>, coords?: (v: number) => number) => number[];

/** A deformed array's coordinates are read as they are (`./deform.ts`, `deformedVertices`): they are not the stored float32s. */
export const EXACT_COORDS = (v: number): number => v;

/** A region's four corners in world units — the header's rule. */
export function regionCorners(region: CoreRegionGeometry & { atlas: ModelAtlasRect }, bone: CoreWorld): number[] {
  const { width: W, height: H } = region;
  const sx = region.scaleX ?? 1;
  const sy = region.scaleY ?? 1;
  const r = region.atlas;
  const kx = (W / r.originalWidth) * sx;
  const ky = (H / r.originalHeight) * sy;
  const x1 = (-W / 2) * sx + r.offsetX * kx;
  const y1 = (-H / 2) * sy + r.offsetY * ky;
  const x2 = x1 + r.width * kx;
  const y2 = y1 + r.height * ky;
  const angle = (region.rotation ?? 0) * RAD;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const x = region.x ?? 0;
  const y = region.y ?? 0;
  const out: number[] = [];
  for (const [px, py] of [[x1, y1], [x1, y2], [x2, y2], [x2, y1]]) {
    // The operation order is measured to the bit (issue #966): the placement is added to the cosine term before the sine term is taken off — `px·cos − py·sin + x` reads 1 ulp off on 748 attachment-samples of six corpus rows.
    const lx = px * cos + x - py * sin;
    const ly = py * cos + y + px * sin;
    out.push(bone.a * lx + bone.b * ly + bone.worldX, bone.c * lx + bone.d * ly + bone.worldY);
  }
  return out;
}

/**
 * A vertex array's world positions — the header's mesh rule, every stored
 * number through `Math.fround`; with `coords`, the coordinates through it
 * instead (a deformed array's are read as they are, `EXACT_COORDS`), the
 * weights through `Math.fround` still.
 */
export function worldVertices(vertices: ModelVertices, bone: CoreWorld, world: ReadonlyMap<string, CoreWorld>, coords: (v: number) => number = Math.fround): number[] {
  const out: number[] = [];
  if (!vertices.weighted) {
    for (let i = 0; i + 1 < vertices.xy.length; i += 2) {
      const x = coords(vertices.xy[i]);
      const y = coords(vertices.xy[i + 1]);
      out.push(x * bone.a + y * bone.b + bone.worldX, x * bone.c + y * bone.d + bone.worldY);
    }
    return out;
  }
  for (const influences of vertices.bindings) {
    let wx = 0;
    let wy = 0;
    for (const binding of influences) {
      const t = world.get(binding.bone);
      if (t === undefined) throw new Error(`a binding names bone "${binding.bone}", which has no world transform (readModel refuses it first)`);
      const x = coords(binding.x);
      const y = coords(binding.y);
      const weight = Math.fround(binding.weight);
      wx += (x * t.a + y * t.b + t.worldX) * weight;
      wy += (x * t.c + y * t.d + t.worldY) * weight;
    }
    out.push(wx, wy);
  }
  return out;
}

/**
 * `worldVertices(deformedVertices(vertices, deform), bone, world, EXACT_COORDS)`
 * in one pass (issue #1530): the same operations on the same numbers in the
 * same order — an unweighted vertex's coordinates are the deform array's,
 * read as they are; a weighted binding's are its float32 coordinate plus the
 * deform's pair, its weight through `Math.fround` — without building the
 * deformed array (and, weighted, one binding record per influence) on every
 * pose only to map it again. A planted vertex poser still reads the deformed
 * array (`poseGeometry`). Posed output is held equal by the core gate's
 * sample attachments and by `tools/posed_frames.ts` across the change.
 */
export function deformedWorldVertices(vertices: ModelVertices, deform: readonly number[], bone: CoreWorld, world: ReadonlyMap<string, CoreWorld>): number[] {
  const out: number[] = [];
  if (!vertices.weighted) {
    for (let i = 0; i + 1 < deform.length; i += 2) {
      const x = deform[i];
      const y = deform[i + 1];
      out.push(x * bone.a + y * bone.b + bone.worldX, x * bone.c + y * bone.d + bone.worldY);
    }
    return out;
  }
  let k = 0;
  for (const influences of vertices.bindings) {
    let wx = 0;
    let wy = 0;
    for (const binding of influences) {
      const t = world.get(binding.bone);
      if (t === undefined) throw new Error(`a binding names bone "${binding.bone}", which has no world transform (readModel refuses it first)`);
      const x = Math.fround(binding.x) + deform[k];
      const y = Math.fround(binding.y) + deform[k + 1];
      k += 2;
      const weight = Math.fround(binding.weight);
      wx += (x * t.a + y * t.b + t.worldX) * weight;
      wy += (x * t.c + y * t.d + t.worldY) * weight;
    }
    out.push(wx, wy);
  }
  return out;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const RECT_FIELDS = ['width', 'height', 'offsetX', 'offsetY', 'originalWidth', 'originalHeight'] as const;

function readRect(value: unknown, where: string, problems: string[]): ModelAtlasRect | undefined {
  if (!isRecord(value)) {
    problems.push(`${where} is ${JSON.stringify(value)}, not an atlas rectangle`);
    return undefined;
  }
  const before = problems.length;
  for (const key of Object.keys(value)) if (!(RECT_FIELDS as readonly string[]).includes(key)) problems.push(`${where}: field "${key}" is not one this reader knows; it reads [${RECT_FIELDS.join(', ')}]`);
  for (const key of RECT_FIELDS) if (!finite(value[key])) problems.push(`${where}: ${key} is ${JSON.stringify(value[key]) ?? 'absent'}, not a finite number`);
  return problems.length === before ? (value as unknown as ModelAtlasRect) : undefined;
}

/** A `ModelVertices`, checked: an even run of finite numbers, or per vertex a non-empty list of bindings each naming a bone of the document. */
function readVertices(value: unknown, where: string, bones: ReadonlySet<string>, problems: string[]): ModelVertices | undefined {
  if (!isRecord(value) || typeof value.weighted !== 'boolean') {
    problems.push(`${where} is not { weighted: false, xy } or { weighted: true, bindings }`);
    return undefined;
  }
  const before = problems.length;
  if (!value.weighted) {
    const xy = value.xy;
    if (!Array.isArray(xy) || xy.length % 2 !== 0 || !xy.every(finite)) problems.push(`${where}.xy is not an even-length list of finite numbers`);
    return problems.length === before ? { weighted: false, xy: xy as number[] } : undefined;
  }
  const bindings = value.bindings;
  if (!Array.isArray(bindings)) {
    problems.push(`${where}.bindings is not a list`);
    return undefined;
  }
  bindings.forEach((influences, i) => {
    if (!Array.isArray(influences) || influences.length === 0) {
      problems.push(`${where}.bindings[${i}] is not a non-empty list of bindings`);
      return;
    }
    influences.forEach((b: unknown, j) => {
      const at = `${where}.bindings[${i}][${j}]`;
      if (!isRecord(b)) {
        problems.push(`${at} is not an object`);
        return;
      }
      if (typeof b.bone !== 'string' || !bones.has(b.bone)) problems.push(`${at}: bone ${JSON.stringify(b.bone)} is not a bone of this document`);
      for (const key of ['x', 'y', 'weight'] as const) if (!finite(b[key])) problems.push(`${at}: ${key} is ${JSON.stringify(b[key]) ?? 'absent'}, not a finite number`);
    });
  });
  return problems.length === before ? { weighted: true, bindings: bindings as ModelBinding[][] } : undefined;
}

/**
 * The geometry of one attachment record, read and checked field by field —
 * called by `readModel` for every record of every skin. Returns `undefined`
 * when something was refused (the problem is pushed, naming the path). What is
 * refused mirrors the writer (`attachmentOf` in `src/model.ts`): a region
 * carrying neither a rectangle nor a sequence, or both; a sequence whose
 * `atlas` is not one rectangle per frame, or whose setup frame is not one of
 * them; and a binding, a linked mesh's link or a clip's `end` naming nothing.
 * A linked mesh's source is resolved later, once every skin is read.
 */
export function readGeometry(raw: Record<string, unknown>, kind: CoreGeometry['kind'], where: string, bones: ReadonlySet<string>, slots: ReadonlySet<string>, problems: string[]): CoreGeometry | undefined {
  const before = problems.length;
  switch (kind) {
    case 'region': {
      for (const key of ['x', 'y', 'rotation', 'scaleX', 'scaleY'] as const) if (raw[key] !== undefined && !finite(raw[key])) problems.push(`${where}: ${key} is ${JSON.stringify(raw[key])}, not a finite number`);
      for (const key of ['width', 'height'] as const) if (!finite(raw[key])) problems.push(`${where}: ${key} is ${JSON.stringify(raw[key]) ?? 'absent'}, not a finite number`);
      const hasRect = raw.atlas !== undefined;
      const hasSequence = raw.sequence !== undefined;
      let atlas: ModelAtlasRect | null | undefined;
      let frames: ModelAtlasRect[] | undefined;
      if (hasRect === hasSequence) {
        problems.push(`${where}: the region carries ${hasRect ? 'both an atlas rectangle and a sequence' : 'neither an atlas rectangle nor a sequence'}; the writer states exactly one of the two, and a sequence holds a rectangle per frame (issue #935)`);
      } else if (hasRect) {
        // `readModel` has read the rectangle itself (`readAtlasRect`); here only its value is taken.
        atlas = raw.atlas === null ? null : isRecord(raw.atlas) ? (raw.atlas as unknown as ModelAtlasRect) : undefined;
      } else {
        const seq = raw.sequence;
        if (!isRecord(seq)) problems.push(`${where}.sequence is not an object`);
        else {
          const count = seq.count;
          const setup = seq.setup ?? 0;
          if (typeof count !== 'number' || !Number.isInteger(count) || count < 1) problems.push(`${where}.sequence: count is ${JSON.stringify(count)}, not a whole number of at least 1`);
          else if (typeof setup !== 'number' || !Number.isInteger(setup) || setup < 0 || setup >= count) problems.push(`${where}.sequence: setup is ${JSON.stringify(seq.setup)}, not a frame of the ${count}`);
          if (!Array.isArray(seq.atlas) || seq.atlas.length !== count) problems.push(`${where}.sequence: atlas is not a list of ${JSON.stringify(count)} rectangle(s), one per frame`);
          else {
            const rects = seq.atlas.map((r, i) => readRect(r, `${where}.sequence.atlas[${i}]`, problems));
            if (typeof setup === 'number' && Number.isInteger(setup) && setup >= 0 && setup < rects.length) atlas = rects[setup];
            if (rects.every((r) => r !== undefined)) frames = rects as ModelAtlasRect[];
          }
        }
      }
      if (problems.length !== before || atlas === undefined) return undefined;
      const pick = (key: 'x' | 'y' | 'rotation' | 'scaleX' | 'scaleY'): { [k: string]: number } => (raw[key] === undefined ? {} : { [key]: raw[key] as number });
      return {
        kind: 'region',
        region: { ...pick('x'), ...pick('y'), ...pick('rotation'), ...pick('scaleX'), ...pick('scaleY'), width: raw.width as number, height: raw.height as number, atlas, ...(frames === undefined ? {} : { frames }) },
      };
    }
    case 'linkedmesh': {
      for (const key of ['skin', 'slot', 'source'] as const) if (typeof raw[key] !== 'string' || raw[key] === '') problems.push(`${where}: ${key} is ${JSON.stringify(raw[key]) ?? 'absent'}, not a non-empty string`);
      if (typeof raw.slot === 'string' && !slots.has(raw.slot)) problems.push(`${where}: slot "${raw.slot}" is not a slot of this document`);
      if (problems.length !== before) return undefined;
      return { kind: 'linkedmesh', skin: raw.skin as string, slot: raw.slot as string, source: raw.source as string };
    }
    case 'mesh':
    case 'clipping':
    case 'boundingbox':
    case 'path': {
      const vertices = readVertices(raw.vertices, `${where}.vertices`, bones, problems);
      if (kind === 'clipping' && raw.end !== undefined && (typeof raw.end !== 'string' || !slots.has(raw.end))) problems.push(`${where}: end is ${JSON.stringify(raw.end)}, not a slot of this document`);
      if (kind === 'clipping') for (const key of ['inverse', 'convex'] as const) if (raw[key] !== undefined && typeof raw[key] !== 'boolean') problems.push(`${where}: ${key} is ${JSON.stringify(raw[key])}, not a boolean`);
      const mesh = kind === 'mesh' && vertices !== undefined ? readMeshTriangles(raw, vertices, where, problems) : undefined;
      if (vertices === undefined || problems.length !== before) return undefined;
      if (kind === 'mesh') return mesh === undefined ? undefined : { kind, vertices, ...mesh };
      if (kind === 'clipping') return { kind, end: typeof raw.end === 'string' ? raw.end : null, vertices, inverse: raw.inverse === true, convex: raw.convex === true };
      if (kind === 'boundingbox') return { kind, vertices };
      return readPathGeometry(raw, vertices, where, problems);
    }
  }
}

/**
 * A mesh's `uvs` and `triangles`, what the clipper reads besides its vertices
 * (issue #964, `./clipping.ts`): one finite pair per vertex, and whole
 * indices into the vertices in threes — as the writer writes them.
 */
function readMeshTriangles(raw: Record<string, unknown>, vertices: ModelVertices, where: string, problems: string[]): { uvs: number[]; triangles: number[]; hull?: number } | undefined {
  const before = problems.length;
  const count = vertices.weighted ? vertices.bindings.length : vertices.xy.length / 2;
  const uvs = raw.uvs;
  const triangles = raw.triangles;
  if (!Array.isArray(uvs) || !uvs.every(finite) || uvs.length !== 2 * count) problems.push(`${where}.uvs is not ${2 * count} finite numbers, one pair per vertex`);
  if (!Array.isArray(triangles) || triangles.length % 3 !== 0 || !triangles.every((i) => Number.isInteger(i) && i >= 0 && i < count)) problems.push(`${where}.triangles is not a list of whole indices below ${count}, in threes`);
  // The hull's vertex count (issue #966, retained for the raw entry): a whole number no larger than the vertices.
  const hull = raw.hull;
  if (hull !== undefined && !(typeof hull === 'number' && Number.isInteger(hull) && hull >= 0 && hull <= count)) problems.push(`${where}.hull is ${JSON.stringify(hull)}, not a whole number of vertices from 0 to ${count}`);
  return problems.length === before ? { uvs: uvs as number[], triangles: triangles as number[], ...(hull === undefined ? {} : { hull: hull as number }) } : undefined;
}

/**
 * A path attachment's own fields past its vertices (construct 5's second cut,
 * `./constraints_path.ts`): `closed` and `constantSpeed` as the writer states
 * them — absent reads the parser's `false` and `true` (the `pathAttachments`
 * block of a dump of a record stating neither) — and `lengths`, one finite
 * entry per three points, as the writer always writes it (`buildRigPath` in
 * `src/compile.ts`). `vertexCount` must be the vertices' own count and a
 * multiple of 3: the writer refuses any other, and the curve walk reads
 * groups of three.
 */
function readPathGeometry(raw: Record<string, unknown>, vertices: ModelVertices, where: string, problems: string[]): CoreGeometry | undefined {
  const before = problems.length;
  for (const key of ['closed', 'constantSpeed'] as const) if (raw[key] !== undefined && typeof raw[key] !== 'boolean') problems.push(`${where}: ${key} is ${JSON.stringify(raw[key])}, not a boolean`);
  const count = vertices.weighted ? vertices.bindings.length : vertices.xy.length / 2;
  if (raw.vertexCount !== count) problems.push(`${where}: vertexCount is ${JSON.stringify(raw.vertexCount) ?? 'absent'}, and the vertices hold ${count} point(s)`);
  else if (count % 3 !== 0 || count < (raw.closed === true ? 3 : 6)) problems.push(`${where}: vertexCount is ${count}, not a multiple of 3 of at least ${raw.closed === true ? 3 : 6} — the curve walk reads knots and handles in threes`);
  const lengths = raw.lengths;
  if (!Array.isArray(lengths) || !lengths.every(finite)) problems.push(`${where}: lengths is not a list of finite numbers`);
  else if (lengths.length !== count / 3) problems.push(`${where}: lengths has ${lengths.length} entry(ies) where the vertices make ${count / 3}`);
  if (problems.length !== before) return undefined;
  return { kind: 'path', vertices, closed: raw.closed === true, constantSpeed: raw.constantSpeed !== false, lengths: lengths as number[] };
}

/** One slot as the construct reads it: its name and bone, and what it shows — the record's name, kind and geometry — or nothing. */
export interface ShownGeometry {
  slot: string;
  bone: string;
  /** The name the oracle's row carries (`shownRow`). */
  name: string;
  placeholder: string;
  skin: string;
  geometry: CoreGeometry;
  /** The deform array a deform timeline set on the slot (`./deform.ts`), or none. */
  deform?: readonly number[];
  /** The frame a sequence timeline set on a region's series (`./deform.ts`), or none: the setup frame. */
  frame?: number;
}

/**
 * A row's numbers: `values` through `round`, as `values.map(round)` writes
 * them — and `values` itself, not a copy, where `round` leaves every one of
 * them the same number (`Object.is`, so a `-0` the round writes as `0` is a
 * change). Issue #1530: the raw entry's `rawNumber` is the identity on every
 * finite double but `-0`, so on every pose that drew a finite attachment the
 * map was a second array of the same numbers, per attachment per pose. The
 * array handed in is the poser's own (`regionCorners` and `worldVertices`
 * build a fresh one per call, and so does the deform path's
 * `deformedWorldVertices`), held by nothing but this call, so the row may own it; the
 * draw walk's step reads the same array and writes nothing into it
 * (`DrawStep`'s arrays are readonly). A planted poser that hands out an array
 * it keeps is the shape the core suite's retained-frame control plants.
 */
export function roundedRow(values: number[], round: (v: number) => number | null): Array<number | null> {
  for (let i = 0; i < values.length; i++) {
    const r = round(values[i]);
    if (Object.is(r, values[i])) continue;
    const out: Array<number | null> = values.slice(0, i);
    out.push(r);
    for (let j = i + 1; j < values.length; j++) out.push(round(values[j]));
    return out;
  }
  return values;
}

/** Resolves a linked mesh's source to its vertex array, or names why not. */
export type SourceOf = (skin: string, slot: string, source: string) => ModelVertices | string;

/**
 * What the draw walk of `./clipping.ts` needs past the shown records: the
 * draw order (every slot, showing something or not — a clip ends at a slot
 * whatever it shows), the active bones, and a mesh's `uvs` and `triangles`
 * by where a linked mesh's source is filed.
 */
export interface DrawWalk {
  order: readonly string[];
  active: ReadonlySet<string>;
  meshOf: (skin: string, slot: string, source: string) => { uvs: readonly number[]; triangles: readonly number[] } | undefined;
  clip?: TriangleClipper;
  /** What the drawn rows are cut through (`clipThrough`), replaceable by the render suite's plants. */
  through?: ShapeClipper;
}

/**
 * The two blocks from the slots' shown records, in slot order, every number
 * through `round` (the oracle's, `gridRound` in `./index.ts`), or — for
 * `attachments` — the reason it is absent: a shown region whose rectangle is
 * `null` (the header's ⛔), every one named. With `draw`, also the `clipped`
 * block (issue #964, `./clipping.ts`) from the unrounded geometry, or why it
 * is absent.
 */
export function poseGeometry(
  shown: readonly ShownGeometry[],
  world: ReadonlyMap<string, CoreWorld>,
  sourceOf: SourceOf,
  round: (v: number) => number | null,
  plant: { region?: RegionPoser; vertices?: VertexPoser } = {},
  draw?: DrawWalk,
): { attachments: CoreAttachmentRow[] | null; attachmentsWhy: string | null; clips: CoreClipRow[]; clipped: CoreClippedRow[] | null; clippedWhy: string | null; drawnClipped: CoreClippedRow[] | null; drawnClippedWhy: string | null } {
  const region = plant.region ?? regionCorners;
  const vertices = plant.vertices ?? worldVertices;
  const attachments: CoreAttachmentRow[] = [];
  const clips: CoreClipRow[] = [];
  const nulls: string[] = [];
  // Issue #1530: the draw walk cuts drawn attachments through the clips the pose shows, and with none shown it cuts nothing — `poseClipped`
  // over a walk with no clip step returns no row and no reason — so the walk's steps are built only where a clip is shown.
  const walked = draw !== undefined && shown.some((s) => s.geometry.kind === 'clipping');
  const steps = new Map<string, DrawStep>();
  for (const s of shown) {
    const bone = world.get(s.bone);
    if (bone === undefined) throw new Error(`slot "${s.slot}": bone "${s.bone}" has no world transform`);
    const g = s.geometry;
    // A deform array replaces the stored vertices, its coordinates read as they are (`./deform.ts`).
    // Unplanted, the deformed positions are read in one pass (`deformedWorldVertices`, issue #1530) rather than through a deformed copy of the array.
    const deform = s.deform;
    const drawn = (v: ModelVertices): number[] => (deform === undefined ? vertices(v, bone, world) : plant.vertices === undefined ? deformedWorldVertices(v, deform, bone, world) : vertices(deformedVertices(v, deform), bone, world, EXACT_COORDS));
    if (g.kind === 'region') {
      const rect = s.frame === undefined ? g.region.atlas : (g.region.frames?.[s.frame] ?? g.region.atlas);
      if (rect === null) {
        nulls.push(`slot "${s.slot}" shows region "${s.name}" (skin "${s.skin}", placeholder "${s.placeholder}")`);
        continue;
      }
      // The record's own geometry wherever the rectangle drawn is its own (no series frame): the same fields, without a copy per pose.
      const corners = region(rect === g.region.atlas ? (g.region as CoreRegionGeometry & { atlas: ModelAtlasRect }) : { ...g.region, atlas: rect }, bone);
      attachments.push([s.slot, s.name, 'region', roundedRow(corners, round)]);
      if (walked) steps.set(s.slot, { slot: s.slot, kind: 'draw', attachment: s.name, vertices: corners, triangles: REGION_TRIANGLES, uvs: REGION_UVS });
    } else if (g.kind === 'mesh') {
      const world = drawn(g.vertices);
      attachments.push([s.slot, s.name, 'mesh', roundedRow(world, round)]);
      if (walked) steps.set(s.slot, { slot: s.slot, kind: 'draw', attachment: s.name, vertices: world, triangles: g.triangles, uvs: g.uvs });
    } else if (g.kind === 'linkedmesh') {
      const source = sourceOf(g.skin, g.slot, g.source);
      if (typeof source === 'string') throw new Error(`slot "${s.slot}": ${source} (readModel refuses it first)`);
      const world = drawn(source);
      attachments.push([s.slot, s.name, 'mesh', roundedRow(world, round)]);
      // A linked mesh draws its source's triangles over its source's UVs.
      const mesh = draw?.meshOf(g.skin, g.slot, g.source);
      if (draw !== undefined && mesh === undefined) throw new Error(`slot "${s.slot}": the linked mesh's source "${g.source}" carries no triangles (readModel refuses it first)`);
      if (walked && mesh !== undefined) steps.set(s.slot, { slot: s.slot, kind: 'draw', attachment: s.name, vertices: world, triangles: mesh.triangles, uvs: mesh.uvs });
    } else if (g.kind === 'clipping') {
      const polygon = drawn(g.vertices);
      clips.push([s.slot, s.name, g.end, roundedRow(polygon, round)]);
      steps.set(s.slot, { slot: s.slot, kind: 'clip', attachment: s.name, active: draw?.active.has(s.bone) ?? false, end: g.end, polygon, inverse: g.inverse, convex: g.convex });
    }
  }
  const attachmentsWhy = nulls.length === 0
    ? null
    : `${nulls.join('; ')} — the model states the build had no atlas rectangle for it (atlas: null), and its corners read the trim and original size; a trim of 0 is not assumed`;
  let clipped: CoreClippedRow[] | null = null;
  let clippedWhy: string | null = draw === undefined ? 'the draw order was not given' : attachmentsWhy;
  let drawnClipped: CoreClippedRow[] | null = null;
  let drawnClippedWhy: string | null = clippedWhy;
  if (draw !== undefined && attachmentsWhy === null && !walked) {
    clipped = [];
    clippedWhy = null;
    drawnClipped = [];
    drawnClippedWhy = null;
  } else if (draw !== undefined && attachmentsWhy === null) {
    const walk = draw.order.map((slot): DrawStep => steps.get(slot) ?? { slot, kind: 'none' });
    const posed = poseClipped(walk, round, draw.clip, draw.through);
    clipped = posed.rows;
    clippedWhy = posed.why;
    drawnClipped = posed.drawn;
    drawnClippedWhy = posed.drawnWhy;
  }
  return { attachments: attachmentsWhy === null ? attachments : null, attachmentsWhy, clips, clipped, clippedWhy, drawnClipped, drawnClippedWhy };
}
