/**
 * CPU-only per-stage pose microbenchmark (`rig-c/core#1589`).
 *
 * Poses `spineboy` and `raptor` (`walk`, looping) at `1` and `100` instances
 * for `N` frames in Bun with no renderer:
 * - Default `--interleave frame` (same-frame AB: `AB, BA, AB, ...` per frame)
 *   so machine-state drift hits both arms equally every frame and alternating
 *   order cancels cache-warming bias.
 * - Optional `--interleave batch` (batch `ABAB` rounds).
 * - Reference arm: `@esotericsoftware/spine-core` 4.3.13 timed across its
 *   stages (`timeline apply`, `world update`, `vertex compute`).
 * - Card comparisons: `--card core#1580`, `--card play#199`, `--card self`,
 *   or `--card vs-spine` (default).
 * - Dedicated child-process allocation pass (`BUN_JSC_useGC=0` +
 *   `process.memoryUsage().heapUsed`) separate from CPU timing so every
 *   allocated byte (including unretained temporaries) is measured.
 * - Verification bars: `Object.is` bit-equality against uninstrumented walk,
 *   planted busy-loop, unretained temporary allocation, and per-stage relative
 *   drift controls (`--verify-controls`), and two-invocation repeatability
 *   check (`--repeat 2`).
 */
import * as jsc from 'bun:jsc';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AnimationState,
  AnimationStateData,
  AtlasAttachmentLoader,
  ClippingAttachment,
  MeshAttachment,
  Physics,
  RegionAttachment,
  Skeleton,
  SkeletonClipping,
  SkeletonJson,
  TextureAtlas,
} from '@esotericsoftware/spine-core';
import {
  activeBones,
   CORE_BLEND_MODES,
  CoreInputError,
  documentPageLookup,
  drawnRegions,
  meshPageUvs,
  openTrack,
  readModel,
  readUvSequences,
  regionPageUvs,
  underSkin,
  type CompiledDocument,
  type CoreBlendMode,
  type CoreSlotRow,
  type DrawnRegion,
  type LiveTrack,
  type ModelPage,
  type RawDrawn,
  type RawPose,
  type UvSource,
} from '../src/core/entry.ts';
import type { CorePlant, CoreStage, StageHooks } from '../src/core/index.ts';
import { worldTransforms, type CoreWorld } from '../src/core/world.ts';
import type { ModelVertices } from '../src/model.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');

export const RIG_STAGES = ['timeline', 'world', 'constraints', 'geometry', 'readout', 'frame'] as const;
export type RigStage = (typeof RIG_STAGES)[number];

export const SPINE_STAGES = ['timeline', 'world', 'geometry'] as const;
export type SpineStage = (typeof SPINE_STAGES)[number];

export const MAPPED_GROUPS = ['timeline', 'world+constraints', 'geometry+readout+frame', 'total'] as const;
export type MappedGroup = (typeof MAPPED_GROUPS)[number];

export type InterleaveMode = 'frame' | 'batch';
export type BenchCard = 'vs-spine' | 'core#1580' | 'play#199' | 'self';
export type SkeletonName = 'spineboy' | 'raptor';

const DT = 1 / 60;

// ---------------------------------------------------------------------------
// Frame assembly (`frameOf` from `@rig-c/play` `src/posedFrame.ts`)
// ---------------------------------------------------------------------------

export interface PosedClip {
  polygon: number[];
  inverse: boolean;
  convex: boolean;
}

interface PosedSlotCommon {
  slot: string;
  z: number;
  blend: CoreBlendMode;
  tint: [number, number, number, number];
  dark?: [number, number, number];
  clip?: PosedClip;
}

export interface PosedRegion extends PosedSlotCommon {
  kind: 'region';
  region: string;
  corners: number[];
  page: string;
  pma: boolean;
  uvs: number[];
}

export interface PosedMesh extends PosedSlotCommon {
  kind: 'mesh';
  page: string;
  pma: boolean;
  vertices: number[];
  uvs: number[];
  triangles: number[];
  sequence: number;
}

export type PosedSlot = PosedRegion | PosedMesh;

export interface PosedFrame {
  order: PosedSlot[];
}

interface TriangleCache {
  byRef: WeakMap<readonly number[], number[]>;
  lists: number[][];
}

export interface FrameSource {
  doc: CompiledDocument;
  uv: UvSource;
  pages: ReadonlyMap<string, ModelPage>;
  active: ReadonlySet<string>;
  boneOf: ReadonlyMap<string, string>;
  slotIndex: ReadonlyMap<string, number>;
  uvs: WeakMap<object, Map<readonly number[], number[]>>;
  regionUvs: WeakMap<object, number[]>;
  trianglesPost199: Map<string, Map<string, TriangleCache>>;
  trianglesPre199: Map<string, number[][]>;
}

export function buildFrameSource(doc: CompiledDocument, parsed: unknown): FrameSource {
  if (doc.pages === null) throw new CoreInputError(`a ${doc.spec} document has no pages section`);
  const pages = new Map(doc.pages.map((p) => [p.name, p]));
  const boneOf = new Map<string, string>();
  const slotIndex = new Map<string, number>();
  for (let i = 0; i < doc.slots.length; i++) {
    const slot = doc.slots[i];
    boneOf.set(slot.name, slot.bone);
    slotIndex.set(slot.name, i);
  }
  return {
    doc,
    uv: { lookup: documentPageLookup(doc.pages), sequences: readUvSequences(parsed) },
    pages,
    active: activeBones(doc),
    boneOf,
    slotIndex,
    uvs: new WeakMap(),
    regionUvs: new WeakMap(),
    trianglesPost199: new Map(),
    trianglesPre199: new Map(),
  };
}

function channel(value: number | null, slot: string): number {
  if (value === null) throw new CoreInputError(`slot "${slot}": non-finite colour channel`);
  return value;
}

function meshUvs(source: FrameSource, found: DrawnRegion): number[] {
  const art = found.art as readonly number[];
  let byArt = source.uvs.get(found.found);
  if (byArt === undefined) {
    byArt = new Map();
    source.uvs.set(found.found, byArt);
  }
  let kept = byArt.get(art);
  if (kept === undefined) {
    kept = meshPageUvs(found.found.region, found.found.page, art);
    byArt.set(art, kept);
  }
  return kept;
}

function regionUvs(source: FrameSource, found: DrawnRegion): number[] {
  let kept = source.regionUvs.get(found.found);
  if (kept === undefined) {
    kept = regionPageUvs(found.found.region, found.found.page);
    source.regionUvs.set(found.found, kept);
  }
  return kept;
}

function trianglesPost199(source: FrameSource, drawn: RawDrawn): number[] {
  let byAttachment = source.trianglesPost199.get(drawn.slot);
  if (byAttachment === undefined) {
    byAttachment = new Map();
    source.trianglesPost199.set(drawn.slot, byAttachment);
  }
  let cache = byAttachment.get(drawn.attachment);
  if (cache === undefined) {
    cache = { byRef: new WeakMap(), lists: [] };
    byAttachment.set(drawn.attachment, cache);
  }
  const wanted = drawn.triangles;
  const fast = cache.byRef.get(wanted);
  if (fast !== undefined) return fast;
  const frozen = Object.isFrozen(wanted);
  let kept = cache.lists.find((list) => list.length === wanted.length && list.every((v, i) => v === wanted[i]));
  if (kept === undefined) {
    kept = frozen ? (wanted as number[]) : (Object.freeze([...wanted]) as number[]);
    cache.lists.push(kept);
    cache.byRef.set(kept, kept);
  }
  if (frozen) cache.byRef.set(wanted, kept);
  return kept;
}

function trianglesPre199(source: FrameSource, drawn: RawDrawn): number[] {
  const key = `${drawn.slot}\u0000${drawn.attachment}`;
  let lists = source.trianglesPre199.get(key);
  if (lists === undefined) {
    lists = [];
    source.trianglesPre199.set(key, lists);
  }
  const wanted = drawn.triangles;
  let kept = lists.find((list) => list.length === wanted.length && list.every((v, i) => v === wanted[i]));
  if (kept === undefined) {
    kept = [...wanted];
    lists.push(kept);
  }
  return kept;
}

function clipCoverPost199(pose: Pick<RawPose, 'clips' | 'shown' | 'drawOrder'>, active: ReadonlySet<string>): Map<string, PosedClip> {
  const cover = new Map<string, PosedClip>();
  if (pose.clips.length === 0) return cover;
  const polygons = new Map<string, { end: string | null; polygon: number[] }>();
  for (let i = 0; i < pose.clips.length; i++) {
    const c = pose.clips[i];
    polygons.set(c[0], { end: c[2], polygon: c[3] });
  }
  const shownOf = new Map<string, RawPose['shown'][number]>();
  for (let i = 0; i < pose.shown.length; i++) {
    const s = pose.shown[i];
    shownOf.set(s.slot, s);
  }
  let current: { end: string | null; clip: PosedClip } | null = null;
  for (const slot of pose.drawOrder) {
    const shown = shownOf.get(slot);
    const g = shown?.geometry;
    const clip = g?.kind === 'clipping' ? polygons.get(slot) : undefined;
    if (shown !== undefined && g?.kind === 'clipping' && clip !== undefined) {
      if (current !== null && current.end === slot) current = null;
      if (active.has(shown.bone) && current === null) {
        current = { end: clip.end, clip: { polygon: clip.polygon, inverse: g.inverse, convex: g.convex } };
      }
      continue;
    }
    if (current !== null) cover.set(slot, current.clip);
    if (current !== null && current.end === slot) current = null;
  }
  return cover;
}

function clipCoverPre199(pose: Pick<RawPose, 'clips' | 'shown' | 'drawOrder'>, active: ReadonlySet<string>): Map<string, PosedClip> {
  const polygons = new Map(pose.clips.map((c) => [c[0], { end: c[2], polygon: c[3] }]));
  const shownOf = new Map(pose.shown.map((s) => [s.slot, s]));
  const cover = new Map<string, PosedClip>();
  let current: { end: string | null; clip: PosedClip } | null = null;
  for (const slot of pose.drawOrder) {
    const shown = shownOf.get(slot);
    const g = shown?.geometry;
    const clip = g?.kind === 'clipping' ? polygons.get(slot) : undefined;
    if (shown !== undefined && g?.kind === 'clipping' && clip !== undefined) {
      if (current !== null && current.end === slot) current = null;
      if (active.has(shown.bone) && current === null) {
        current = { end: clip.end, clip: { polygon: clip.polygon, inverse: g.inverse, convex: g.convex } };
      }
      continue;
    }
    if (current !== null) cover.set(slot, current.clip);
    if (current !== null && current.end === slot) current = null;
  }
  return cover;
}

/** Current `@rig-c/play` `frameOf` (`play#199`). */
export function frameOfPost199(source: FrameSource, pose: RawPose): PosedFrame {
  const { drawn: regions, why } = drawnRegions(source.doc, pose.shown, pose.drawOrder, source.uv);
  if (regions === null) throw new CoreInputError(`the page UVs are not posed: ${why}`);
  let regionOf: Map<string, DrawnRegion> | null = null;
  let rows: Map<string, CoreSlotRow> | null = null;
  let z: Map<string, number> | null = null;
  const cover = pose.clips.length === 0 ? null : clipCoverPost199(pose, source.active);
  const order: PosedSlot[] = [];
  const drawnList = pose.drawn;
  const slotsList = pose.slots;
  const drawOrderList = pose.drawOrder;
  let regionCursor = 0;
  for (let i = 0; i < drawnList.length; i++) {
    const d = drawnList[i];
    const bone = source.boneOf.get(d.slot);
    if (bone === undefined || !source.active.has(bone)) continue;
    let found: DrawnRegion | undefined;
    if (regionCursor < regions.length && regions[regionCursor].slot === d.slot) {
      found = regions[regionCursor];
      regionCursor++;
    } else {
      if (regionOf === null) {
        regionOf = new Map();
        for (let k = 0; k < regions.length; k++) regionOf.set(regions[k].slot, regions[k]);
      }
      found = regionOf.get(d.slot);
    }
    if (found === undefined) throw new CoreInputError(`slot "${d.slot}" drew "${d.attachment}", and no atlas region was resolved for it`);
    const slotIdx = source.slotIndex.get(d.slot);
    let row: CoreSlotRow | undefined = slotIdx !== undefined && slotIdx < slotsList.length && slotsList[slotIdx][0] === d.slot ? slotsList[slotIdx] : undefined;
    if (row === undefined) {
      if (rows === null) {
        rows = new Map();
        for (let k = 0; k < slotsList.length; k++) rows.set(slotsList[k][0], slotsList[k]);
      }
      row = rows.get(d.slot);
    }
    if (row === undefined) throw new CoreInputError(`slot "${d.slot}" drew and has no slot row`);
    let slotZ: number | undefined = slotIdx !== undefined && slotIdx < drawOrderList.length && drawOrderList[slotIdx] === d.slot ? slotIdx : undefined;
    if (slotZ === undefined) {
      if (z === null) {
        z = new Map();
        for (let k = 0; k < drawOrderList.length; k++) z.set(drawOrderList[k], k);
      }
      slotZ = z.get(d.slot);
    }
    const tint: [number, number, number, number] = [
      channel(row[2], d.slot) * d.colour[0],
      channel(row[3], d.slot) * d.colour[1],
      channel(row[4], d.slot) * d.colour[2],
      channel(row[5], d.slot) * d.colour[3],
    ];
    const darkRow = row[6];
    const clip = cover === null ? undefined : cover.get(d.slot);
    const common = {
      slot: d.slot,
      z: slotZ as number,
      blend: (row[8] ?? CORE_BLEND_MODES[0]) as CoreBlendMode,
      tint,
      ...(darkRow === null ? {} : { dark: [channel(darkRow[0], d.slot), channel(darkRow[1], d.slot), channel(darkRow[2], d.slot)] as [number, number, number] }),
      ...(clip === undefined ? {} : { clip }),
    };
    const page = source.pages.get(found.found.page.name);
    if (d.kind === 'region') {
      order.push({
        ...common,
        kind: 'region',
        region: found.region,
        corners: d.vertices,
        page: found.found.page.name,
        pma: page?.pma === true,
        uvs: regionUvs(source, found),
      });
    } else {
      order.push({
        ...common,
        kind: 'mesh',
        page: found.found.page.name,
        pma: page?.pma === true,
        vertices: d.vertices,
        uvs: meshUvs(source, found),
        triangles: trianglesPost199(source, d),
        sequence: d.sequenceIndex,
      });
    }
  }
  return { order };
}

/** Pre-`play#199` `frameOf` (`@rig-c/play` before PR `#199`). */
export function frameOfPre199(source: FrameSource, pose: RawPose): PosedFrame {
  const { drawn: regions, why } = drawnRegions(source.doc, pose.shown, pose.drawOrder, source.uv);
  if (regions === null) throw new CoreInputError(`the page UVs are not posed: ${why}`);
  const regionOf = new Map(regions.map((r) => [r.slot, r]));
  const rows = new Map<string, CoreSlotRow>(pose.slots.map((row) => [row[0], row]));
  const z = new Map(pose.drawOrder.map((slot, index) => [slot, index]));
  const cover = clipCoverPre199(pose, source.active);
  const order: PosedSlot[] = [];
  for (const d of pose.drawn) {
    const bone = source.boneOf.get(d.slot);
    if (bone === undefined || !source.active.has(bone)) continue;
    const found = regionOf.get(d.slot);
    if (found === undefined) throw new CoreInputError(`slot "${d.slot}" drew "${d.attachment}", and no atlas region was resolved for it`);
    const row = rows.get(d.slot);
    if (row === undefined) throw new CoreInputError(`slot "${d.slot}" drew and has no slot row`);
    const tint: [number, number, number, number] = [
      channel(row[2], d.slot) * d.colour[0],
      channel(row[3], d.slot) * d.colour[1],
      channel(row[4], d.slot) * d.colour[2],
      channel(row[5], d.slot) * d.colour[3],
    ];
    const darkRow = row[6];
    const common = {
      slot: d.slot,
      z: z.get(d.slot) as number,
      blend: (row[8] ?? CORE_BLEND_MODES[0]) as CoreBlendMode,
      tint,
      ...(darkRow === null ? {} : { dark: [channel(darkRow[0], d.slot), channel(darkRow[1], d.slot), channel(darkRow[2], d.slot)] as [number, number, number] }),
      ...(cover.has(d.slot) ? { clip: cover.get(d.slot) as PosedClip } : {}),
    };
    const page = source.pages.get(found.found.page.name);
    if (d.kind === 'region') {
      order.push({
        ...common,
        kind: 'region',
        region: found.region,
        corners: d.vertices,
        page: found.found.page.name,
        pma: page?.pma === true,
        uvs: regionUvs(source, found),
      });
    } else {
      order.push({
        ...common,
        kind: 'mesh',
        page: found.found.page.name,
        pma: page?.pma === true,
        vertices: d.vertices,
        uvs: meshUvs(source, found),
        triangles: trianglesPre199(source, d),
        sequence: d.sequenceIndex,
      });
    }
  }
  return { order };
}

// ---------------------------------------------------------------------------
// Pre-`core#1580` vertex posers (uncompiled per-influence Map.get)
// ---------------------------------------------------------------------------

export function worldVerticesPre1580(
  vertices: ModelVertices,
  bone: CoreWorld,
  world: ReadonlyMap<string, CoreWorld>,
  coords: (v: number) => number = Math.fround,
): number[] {
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
      if (t === undefined) throw new Error(`a binding names bone "${binding.bone}", which has no world transform`);
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

export function deformedWorldVerticesPre1580(
  vertices: ModelVertices,
  deform: readonly number[],
  bone: CoreWorld,
  world: ReadonlyMap<string, CoreWorld>,
): number[] {
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
      if (t === undefined) throw new Error(`a binding names bone "${binding.bone}", which has no world transform`);
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

// ---------------------------------------------------------------------------
// Reference arm: `@esotericsoftware/spine-core` 4.3.13
// ---------------------------------------------------------------------------

interface SpineInstance {
  skeleton: Skeleton;
  state: AnimationState;
  clipper: SkeletonClipping;
  scratch: Float32Array;
}

const QUAD_TRIANGLES = [0, 1, 2, 2, 3, 0];
const QUAD_UVS = new Float32Array([0, 1, 0, 0, 1, 0, 1, 1]);

export function createSpineInstances(spineJsonText: string, atlasText: string, count: number, animation = 'walk'): SpineInstance[] {
  const atlas = new TextureAtlas(atlasText);
  const loader = new AtlasAttachmentLoader(atlas);
  const reader = new SkeletonJson(loader);
  const data = reader.readSkeletonData(JSON.parse(spineJsonText));
  const defaultSkin = data.findSkin('default');
  const instances: SpineInstance[] = [];
  for (let i = 0; i < count; i++) {
    const skeleton = new Skeleton(data);
    if (defaultSkin !== null) skeleton.setSkin(defaultSkin);
    skeleton.setupPose();
    const stateData = new AnimationStateData(data);
    const state = new AnimationState(stateData);
    state.setAnimation(0, animation, true);
    const offset = (i * 0.07) % 1.0;
    state.update(offset);
    state.apply(skeleton);
    skeleton.update(offset);
    skeleton.updateWorldTransform(Physics.update);
    instances.push({
      skeleton,
      state,
      clipper: new SkeletonClipping(),
      scratch: new Float32Array(2048),
    });
  }
  return instances;
}

export function stepSpineArm(
  instances: readonly SpineInstance[],
  dt: number,
  outUs: Record<SpineStage, number>,
  subSteps = 1,
): number {
  let timelineNs = 0;
  let worldNs = 0;
  let geometryNs = 0;
  let vertexSink = 0;
  for (let rep = 0; rep < subSteps; rep++) {
    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i];
      const { skeleton, state, clipper } = inst;
      let scratch = inst.scratch;

      const t0 = Bun.nanoseconds();
      state.update(dt);
      state.apply(skeleton);
      const t1 = Bun.nanoseconds();
      timelineNs += t1 - t0;

      skeleton.update(dt);
      skeleton.updateWorldTransform(Physics.update);
      const t2 = Bun.nanoseconds();
      worldNs += t2 - t1;

      const drawOrder = skeleton.drawOrder.appliedPose;
      for (let s = 0, n = drawOrder.length; s < n; s++) {
        const slot = drawOrder[s];
        if (!slot.bone.active) {
          clipper.clipEnd(slot);
          continue;
        }
        const att = slot.appliedPose.attachment;
        if (att instanceof RegionAttachment) {
          att.computeWorldVertices(slot, att.getOffsets(slot.appliedPose), scratch, 0, 2);
          if (clipper.isClipping()) {
            clipper.clipTrianglesUnpacked(scratch, 0, QUAD_TRIANGLES, 6, QUAD_UVS, 2);
            vertexSink += clipper.clippedVerticesTyped.length;
          } else {
            vertexSink += scratch[0];
          }
        } else if (att instanceof MeshAttachment) {
          const len = att.worldVerticesLength;
          if (scratch.length < len) {
            scratch = new Float32Array(len);
            inst.scratch = scratch;
          }
          att.computeWorldVertices(skeleton, slot, 0, len, scratch, 0, 2);
          if (clipper.isClipping()) {
            clipper.clipTrianglesUnpacked(scratch, 0, att.triangles, att.triangles.length, att.regionUVs, 2);
            vertexSink += clipper.clippedVerticesTyped.length;
          } else {
            vertexSink += scratch[0];
          }
        } else if (att instanceof ClippingAttachment) {
          clipper.clipEnd(slot);
          clipper.clipStart(skeleton, slot, att);
          continue;
        }
        clipper.clipEnd(slot);
      }
      clipper.clipEnd();
      const t3 = Bun.nanoseconds();
      geometryNs += t3 - t2;
    }
  }
  const scale = 1000 * subSteps;
  outUs.timeline = timelineNs / scale;
  outUs.world = worldNs / scale;
  outUs.geometry = geometryNs / scale;
  return vertexSink;
}

// ---------------------------------------------------------------------------
// `rig-c` arm setup & stepping
// ---------------------------------------------------------------------------

export interface RigArmConfig {
  label: string;
  plant?: Omit<CorePlant, 'stage'>;
  frameFn?: (source: FrameSource, pose: RawPose) => PosedFrame;
}

export interface RigArmState {
  label: string;
  source: FrameSource;
  tracks: LiveTrack[];
  frameFn: (source: FrameSource, pose: RawPose) => PosedFrame;
  stageNs: Record<CoreStage, number>;
  tStart: number;
  active: boolean;
}

export function createRigArm(
  modelText: string,
  parsedModel: unknown,
  count: number,
  config: RigArmConfig,
  animation = 'walk',
): RigArmState {
  const doc = readModel(modelText);
  const view = underSkin(doc, 'default');
  const source = buildFrameSource(view, parsedModel);
  const stageNs: Record<CoreStage, number> = {
    timeline: 0,
    world: 0,
    constraints: 0,
    geometry: 0,
    readout: 0,
  };
  const state: RigArmState = {
    label: config.label,
    source,
    tracks: [],
    frameFn: config.frameFn ?? frameOfPost199,
    stageNs,
    tStart: 0,
    active: false,
  };
  const hooks: StageHooks = {
    begin(_stage) {
      if (!state.active) return;
      state.tStart = Bun.nanoseconds();
    },
    end(stage) {
      if (!state.active) return;
      state.stageNs[stage] += Bun.nanoseconds() - state.tStart;
    },
  };
  const plant: CorePlant = { ...config.plant, stage: hooks };
  for (let i = 0; i < count; i++) {
    const track = openTrack(view, animation, { loop: true, reset: 'setup' }, plant);
    const offset = (i * 0.07) % 1.0;
    if (offset > 0) track.step(offset);
    state.tracks.push(track);
  }
  return state;
}

export function stepRigArm(arm: RigArmState, dt: number, outUs: Record<RigStage, number>, subSteps = 1): number {
  arm.stageNs.timeline = 0;
  arm.stageNs.world = 0;
  arm.stageNs.constraints = 0;
  arm.stageNs.geometry = 0;
  arm.stageNs.readout = 0;
  arm.active = true;
  let frameNs = 0;
  let slotSink = 0;
  const { tracks, source, frameFn } = arm;
  for (let rep = 0; rep < subSteps; rep++) {
    for (let i = 0; i < tracks.length; i++) {
      const pose = tracks[i].step(dt);
      const f0 = Bun.nanoseconds();
      const frame = frameFn(source, pose);
      frameNs += Bun.nanoseconds() - f0;
      slotSink += frame.order.length;
    }
  }
  arm.active = false;
  const scale = 1000 * subSteps;
  outUs.timeline = arm.stageNs.timeline / scale;
  outUs.world = arm.stageNs.world / scale;
  outUs.constraints = arm.stageNs.constraints / scale;
  outUs.geometry = arm.stageNs.geometry / scale;
  outUs.readout = arm.stageNs.readout / scale;
  outUs.frame = frameNs / scale;
  return slotSink;
}

// ---------------------------------------------------------------------------
// Verification Bar 1: `Object.is` bit-equality against uninstrumented path
// ---------------------------------------------------------------------------

function sameBits(a: unknown, b: unknown, path: string): string | null {
  if (Object.is(a, b)) return null;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') {
    return `${path}: ${String(a)} !== ${String(b)}`;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return `${path}: array length mismatch`;
    }
    for (let i = 0; i < a.length; i++) {
      const diff = sameBits(a[i], b[i], `${path}[${i}]`);
      if (diff !== null) return diff;
    }
    return null;
  }
  const recA = a as Record<string, unknown>;
  const recB = b as Record<string, unknown>;
  const keysA = Object.keys(recA);
  const keysB = Object.keys(recB);
  if (keysA.length !== keysB.length) return `${path}: key count mismatch (${keysA.join(',')} vs ${keysB.join(',')})`;
  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(recB, key)) return `${path}: missing key "${key}"`;
    const diff = sameBits(recA[key], recB[key], `${path}.${key}`);
    if (diff !== null) return diff;
  }
  return null;
}

export function verifyBitEquality(
  skeletonName: string,
  modelText: string,
  parsedModel: unknown,
  candidateConfig?: RigArmConfig,
  frames = 60,
): { ok: boolean; checkedFrames: number; detail: string } {
  const docA = readModel(modelText);
  const viewA = underSkin(docA, 'default');
  const sourceA = buildFrameSource(viewA, parsedModel);
  const trackUninstrumented = openTrack(viewA, 'walk', { loop: true, reset: 'setup' });

  const docB = readModel(modelText);
  const viewB = underSkin(docB, 'default');
  const sourceB = buildFrameSource(viewB, parsedModel);
  let stageCalls = 0;
  const hooks: StageHooks = {
    begin() {
      stageCalls++;
    },
    end() {
      stageCalls++;
    },
  };
  const trackInstrumented = openTrack(viewB, 'walk', { loop: true, reset: 'setup' }, {
    ...candidateConfig?.plant,
    stage: hooks,
  });
  const frameFn = candidateConfig?.frameFn ?? frameOfPost199;

  for (let f = 0; f < frames; f++) {
    const poseA = f === 0 ? trackUninstrumented.first : trackUninstrumented.step(DT);
    const poseB = f === 0 ? trackInstrumented.first : trackInstrumented.step(DT);
    const frameA = frameOfPost199(sourceA, poseA);
    const frameB = frameFn(sourceB, poseB);
    const poseDiff = sameBits(poseA, poseB, `${skeletonName}@frame${f}.pose`);
    if (poseDiff !== null) return { ok: false, checkedFrames: f, detail: poseDiff };
    const frameDiff = sameBits(frameA, frameB, `${skeletonName}@frame${f}.frame`);
    if (frameDiff !== null) return { ok: false, checkedFrames: f, detail: frameDiff };
  }
  if (stageCalls === 0) {
    return { ok: false, checkedFrames: frames, detail: `${skeletonName}: stage hooks never fired` };
  }
  return {
    ok: true,
    checkedFrames: frames,
    detail: `${skeletonName}: ${frames} frames bit-identical (Object.is) across RawPose and PosedFrame (${stageCalls} hook transitions)`,
  };
}

// ---------------------------------------------------------------------------
// Dedicated per-stage allocated-bytes pass (`BUN_JSC_useGC=0` child process)
// ---------------------------------------------------------------------------

export interface StageAllocationReport {
  perStageBytes: Record<RigStage, number>;
  totalBytes: number;
}

export type AllocWorkerMode = 'default' | 'pre1580' | 'pre199' | 'planted-unretained';

export const UNRETAINED_TEMP_ARRAY_COUNT = 256; // 256 × 64 B (4-element JSArray cell + butterfly) = 16,384 B/frame

export function touchUnretainedTemp(v: unknown): number {
  return Array.isArray(v) ? v.length : typeof v === 'object' && v !== null ? 1 : 0;
}
(jsc as unknown as { noInline?: (fn: (v: unknown) => number) => void }).noInline?.(touchUnretainedTemp);

export function configForAllocWorkerMode(mode: AllocWorkerMode): RigArmConfig {
  switch (mode) {
    case 'pre1580':
      return {
        label: 'pre-#1580',
        plant: { vertices: worldVerticesPre1580, deformedVertices: deformedWorldVerticesPre1580 },
      };
    case 'pre199':
      return { label: 'pre-#199', frameFn: frameOfPre199 };
    case 'planted-unretained':
      return {
        label: 'alloc-constraints-unretained',
        plant: {
          constraints: (records) => {
            for (let i = 0; i < UNRETAINED_TEMP_ARRAY_COUNT; i++) {
              // Allocate a 4-element temporary array (same shape as `valuesAt`
              // in `src/core/animation.ts`), pass it to a `noInline` consumer
              // that only reads `.length`, and do NOT retain the array anywhere.
              touchUnretainedTemp([i, i + 1, i + 2, i + 3]);
            }
            return records;
          },
        },
      };
    case 'default':
      return { label: 'rig-c', frameFn: frameOfPost199 };
  }
}

function workerModeForConfig(config: RigArmConfig): AllocWorkerMode | null {
  if (config.frameFn === frameOfPre199 || config.label === 'pre-#199') return 'pre199';
  if (config.plant?.vertices === worldVerticesPre1580 || config.label === 'pre-#1580') return 'pre1580';
  if (config.label === 'alloc-constraints-unretained') return 'planted-unretained';
  if (config.plant === undefined || Object.keys(config.plant).length === 0) return 'default';
  return null;
}

export function measureStageAllocationsInProcess(
  modelText: string,
  parsedModel: unknown,
  config: RigArmConfig,
  instances = 10,
  warmupFrames = 45,
  sampleFrames = 160,
): StageAllocationReport {
  const doc = readModel(modelText);
  const view = underSkin(doc, 'default');
  const source = buildFrameSource(view, parsedModel);
  const frameFn = config.frameFn ?? frameOfPost199;

  const cur: Record<RigStage, number> = {
    timeline: 0,
    world: 0,
    constraints: 0,
    geometry: 0,
    readout: 0,
    frame: 0,
  };

  let active = false;
  let m0 = 0;
  const hooks: StageHooks = {
    begin(_s) {
      if (!active) return;
      m0 = process.memoryUsage().heapUsed;
    },
    end(s) {
      if (!active) return;
      cur[s] += process.memoryUsage().heapUsed - m0;
    },
  };

  const tracks: LiveTrack[] = [];
  for (let i = 0; i < instances; i++) {
    const t = openTrack(view, 'walk', { loop: true, reset: 'setup' }, { ...config.plant, stage: hooks });
    const offset = (i * 0.07) % 1.0;
    if (offset > 0) t.step(offset);
    tracks.push(t);
  }

  const warmupPoses: RawPose[] = [];
  for (let w = 0; w < warmupFrames; w++) {
    for (let i = 0; i < tracks.length; i++) {
      warmupPoses.push(tracks[i].step(DT));
    }
  }

  const totalSteps = instances * sampleFrames;
  const poses = new Array<RawPose>(totalSteps);
  let pIdx = 0;
  active = true;
  for (let f = 0; f < sampleFrames; f++) {
    for (let i = 0; i < tracks.length; i++) {
      poses[pIdx++] = tracks[i].step(DT);
    }
  }
  active = false;

  for (let k = 0; k < warmupPoses.length; k++) {
    touchUnretainedTemp(frameFn(source, warmupPoses[k]));
  }
  const fm0 = process.memoryUsage().heapUsed;
  for (let k = 0; k < poses.length; k++) {
    touchUnretainedTemp(frameFn(source, poses[k]));
  }
  cur.frame = process.memoryUsage().heapUsed - fm0;

  const perStageBytes = {} as Record<RigStage, number>;
  let totalBytes = 0;
  for (const s of RIG_STAGES) {
    const val = Math.round(cur[s] / totalSteps);
    perStageBytes[s] = val;
    totalBytes += val;
  }
  return { perStageBytes, totalBytes };
}

export function measureStageAllocations(
  modelText: string,
  parsedModel: unknown,
  config: RigArmConfig,
  instances = 10,
  warmupFrames = 45,
  sampleFrames = 160,
): StageAllocationReport {
  const mode = workerModeForConfig(config);
  if (process.env.BUN_JSC_useGC === '0' || mode === null) {
    return measureStageAllocationsInProcess(modelText, parsedModel, config, instances, warmupFrames, sampleFrames);
  }
  const res = spawnSync(
    process.execPath,
    [fileURLToPath(import.meta.url), '--alloc-worker', mode],
    {
      cwd: REPO_ROOT,
      input: modelText,
      encoding: 'utf8',
      env: { ...process.env, BUN_JSC_useGC: '0' },
      maxBuffer: 32 * 1024 * 1024,
    },
  );
  if (res.status !== 0) {
    throw new Error(`--alloc-worker (${mode}) failed: ${res.stderr || res.stdout}`);
  }
  return JSON.parse(res.stdout.trim()) as StageAllocationReport;
}

// ---------------------------------------------------------------------------
// Statistics & Paired AB / ABAB Runner
// ---------------------------------------------------------------------------

export interface StageStats {
  p50: number;
  p95: number;
  mean: number;
  iqr: number;
}

export interface PairedStageRow {
  stage: string;
  armA: StageStats;
  armB: StageStats;
  delta: StageStats;
  pctP50: number;
}

export function percentile(values: readonly number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function computeStats(values: readonly number[]): StageStats {
  if (values.length === 0) return { p50: 0, p95: 0, mean: 0, iqr: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const p50 = percentile(sorted, 0.5);
  const p95 = percentile(sorted, 0.95);
  const p25 = percentile(sorted, 0.25);
  const p75 = percentile(sorted, 0.75);
  let sum = 0;
  for (let i = 0; i < sorted.length; i++) sum += sorted[i];
  return { p50, p95, mean: sum / sorted.length, iqr: p75 - p25 };
}

export function buildPairedRows<S extends string>(
  stages: readonly S[],
  seriesA: Record<S, number[]>,
  seriesB: Record<S, number[]>,
): PairedStageRow[] {
  return stages.map((stage) => {
    const a = seriesA[stage];
    const b = seriesB[stage];
    const diffs = a.map((va, i) => b[i] - va);
    const armA = computeStats(a);
    const armB = computeStats(b);
    const delta = computeStats(diffs);
    const pctP50 = armA.p50 === 0 ? 0 : (delta.p50 / armA.p50) * 100;
    return { stage, armA, armB, delta, pctP50 };
  });
}

export interface RigVsRigResult {
  skeleton: SkeletonName;
  instances: number;
  frames: number;
  interleave: InterleaveMode;
  armALabel: string;
  armBLabel: string;
  rows: PairedStageRow[];
  allocA?: StageAllocationReport;
  allocB?: StageAllocationReport;
}

export function runRigVsRigBench(
  skeleton: SkeletonName,
  modelText: string,
  parsedModel: unknown,
  instances: number,
  frames: number,
  warmup: number,
  interleave: InterleaveMode,
  configA: RigArmConfig,
  configB: RigArmConfig,
  includeAlloc = true,
  subStepsOverride?: number,
): RigVsRigResult {
  Bun.gc(true);
  const subSteps = subStepsOverride ?? (instances < 16 ? Math.ceil(16 / instances) : 1);
  const armA = createRigArm(modelText, parsedModel, instances, configA);
  const armB = createRigArm(modelText, parsedModel, instances, configB);
  const scratchA: Record<RigStage, number> = { timeline: 0, world: 0, constraints: 0, geometry: 0, readout: 0, frame: 0 };
  const scratchB: Record<RigStage, number> = { timeline: 0, world: 0, constraints: 0, geometry: 0, readout: 0, frame: 0 };

  for (let w = 0; w < warmup; w++) {
    stepRigArm(armA, DT, scratchA, subSteps);
    stepRigArm(armB, DT, scratchB, subSteps);
  }
  Bun.gc(true);
  Bun.gc(true);

  const keys = [...RIG_STAGES, 'total'] as const;
  type Key = (typeof keys)[number];
  const seriesA: Record<Key, number[]> = { timeline: [], world: [], constraints: [], geometry: [], readout: [], frame: [], total: [] };
  const seriesB: Record<Key, number[]> = { timeline: [], world: [], constraints: [], geometry: [], readout: [], frame: [], total: [] };

  const recordA = (): void => {
    let sum = 0;
    for (const s of RIG_STAGES) {
      seriesA[s].push(scratchA[s]);
      sum += scratchA[s];
    }
    seriesA.total.push(sum);
  };
  const recordB = (): void => {
    let sum = 0;
    for (const s of RIG_STAGES) {
      seriesB[s].push(scratchB[s]);
      sum += scratchB[s];
    }
    seriesB.total.push(sum);
  };

  let sink = 0;
  if (interleave === 'frame') {
    for (let f = 0; f < frames; f++) {
      if ((f & 1) === 0) {
        sink += stepRigArm(armA, DT, scratchA, subSteps);
        sink += stepRigArm(armB, DT, scratchB, subSteps);
      } else {
        sink += stepRigArm(armB, DT, scratchB, subSteps);
        sink += stepRigArm(armA, DT, scratchA, subSteps);
      }
      recordA();
      recordB();
    }
  } else {
    const rounds = 6;
    const perRound = Math.max(1, Math.floor(frames / rounds));
    for (let r = 0; r < rounds; r++) {
      if ((r & 1) === 0) {
        for (let f = 0; f < perRound; f++) {
          sink += stepRigArm(armA, DT, scratchA, subSteps);
          recordA();
        }
        for (let f = 0; f < perRound; f++) {
          sink += stepRigArm(armB, DT, scratchB, subSteps);
          recordB();
        }
      } else {
        for (let f = 0; f < perRound; f++) {
          sink += stepRigArm(armB, DT, scratchB, subSteps);
          recordB();
        }
        for (let f = 0; f < perRound; f++) {
          sink += stepRigArm(armA, DT, scratchA, subSteps);
          recordA();
        }
      }
    }
  }
  if (sink === -1) console.error(sink);
  armA.tracks.length = 0;
  armB.tracks.length = 0;
  Bun.gc(true);
  Bun.gc(true);

  const rows = buildPairedRows(keys, seriesA, seriesB);
  const allocA = includeAlloc ? measureStageAllocations(modelText, parsedModel, configA) : undefined;
  const allocB = includeAlloc ? measureStageAllocations(modelText, parsedModel, configB) : undefined;

  return {
    skeleton,
    instances,
    frames: seriesA.total.length,
    interleave,
    armALabel: configA.label,
    armBLabel: configB.label,
    rows,
    allocA,
    allocB,
  };
}

export interface SpineVsRigResult {
  skeleton: SkeletonName;
  instances: number;
  frames: number;
  interleave: InterleaveMode;
  rigStages: Record<RigStage | 'total', StageStats>;
  spineStages: Record<SpineStage | 'total', StageStats>;
  mappedRows: PairedStageRow[];
  allocRig?: StageAllocationReport;
}

export function runSpineVsRigBench(
  skeleton: SkeletonName,
  modelText: string,
  parsedModel: unknown,
  spineJsonText: string,
  atlasText: string,
  instances: number,
  frames: number,
  warmup: number,
  interleave: InterleaveMode,
  includeAlloc = true,
  subStepsOverride?: number,
): SpineVsRigResult {
  Bun.gc(true);
  const subSteps = subStepsOverride ?? (instances < 16 ? Math.ceil(16 / instances) : 1);
  const spineArm = createSpineInstances(spineJsonText, atlasText, instances);
  const rigArm = createRigArm(modelText, parsedModel, instances, { label: 'rig-c' });
  const scratchSpine: Record<SpineStage, number> = { timeline: 0, world: 0, geometry: 0 };
  const scratchRig: Record<RigStage, number> = { timeline: 0, world: 0, constraints: 0, geometry: 0, readout: 0, frame: 0 };

  for (let w = 0; w < warmup; w++) {
    stepSpineArm(spineArm, DT, scratchSpine, subSteps);
    stepRigArm(rigArm, DT, scratchRig, subSteps);
  }
  Bun.gc(true);
  Bun.gc(true);

  const rigKeys = [...RIG_STAGES, 'total'] as const;
  const spineKeys = [...SPINE_STAGES, 'total'] as const;
  const rigSeries: Record<(typeof rigKeys)[number], number[]> = {
    timeline: [],
    world: [],
    constraints: [],
    geometry: [],
    readout: [],
    frame: [],
    total: [],
  };
  const spineSeries: Record<(typeof spineKeys)[number], number[]> = {
    timeline: [],
    world: [],
    geometry: [],
    total: [],
  };
  const mappedSpine: Record<MappedGroup, number[]> = {
    timeline: [],
    'world+constraints': [],
    'geometry+readout+frame': [],
    total: [],
  };
  const mappedRig: Record<MappedGroup, number[]> = {
    timeline: [],
    'world+constraints': [],
    'geometry+readout+frame': [],
    total: [],
  };

  const recordSpine = (): void => {
    const total = scratchSpine.timeline + scratchSpine.world + scratchSpine.geometry;
    spineSeries.timeline.push(scratchSpine.timeline);
    spineSeries.world.push(scratchSpine.world);
    spineSeries.geometry.push(scratchSpine.geometry);
    spineSeries.total.push(total);
    mappedSpine.timeline.push(scratchSpine.timeline);
    mappedSpine['world+constraints'].push(scratchSpine.world);
    mappedSpine['geometry+readout+frame'].push(scratchSpine.geometry);
    mappedSpine.total.push(total);
  };

  const recordRig = (): void => {
    let total = 0;
    for (const s of RIG_STAGES) {
      rigSeries[s].push(scratchRig[s]);
      total += scratchRig[s];
    }
    rigSeries.total.push(total);
    mappedRig.timeline.push(scratchRig.timeline);
    mappedRig['world+constraints'].push(scratchRig.world + scratchRig.constraints);
    mappedRig['geometry+readout+frame'].push(scratchRig.geometry + scratchRig.readout + scratchRig.frame);
    mappedRig.total.push(total);
  };

  let sink = 0;
  if (interleave === 'frame') {
    for (let f = 0; f < frames; f++) {
      if ((f & 1) === 0) {
        sink += stepSpineArm(spineArm, DT, scratchSpine, subSteps);
        sink += stepRigArm(rigArm, DT, scratchRig, subSteps);
      } else {
        sink += stepRigArm(rigArm, DT, scratchRig, subSteps);
        sink += stepSpineArm(spineArm, DT, scratchSpine, subSteps);
      }
      recordSpine();
      recordRig();
    }
  } else {
    const rounds = 6;
    const perRound = Math.max(1, Math.floor(frames / rounds));
    for (let r = 0; r < rounds; r++) {
      if ((r & 1) === 0) {
        for (let f = 0; f < perRound; f++) {
          sink += stepSpineArm(spineArm, DT, scratchSpine, subSteps);
          recordSpine();
        }
        for (let f = 0; f < perRound; f++) {
          sink += stepRigArm(rigArm, DT, scratchRig, subSteps);
          recordRig();
        }
      } else {
        for (let f = 0; f < perRound; f++) {
          sink += stepRigArm(rigArm, DT, scratchRig, subSteps);
          recordRig();
        }
        for (let f = 0; f < perRound; f++) {
          sink += stepSpineArm(spineArm, DT, scratchSpine, subSteps);
          recordSpine();
        }
      }
    }
  }
  if (sink === -1) console.error(sink);
  spineArm.length = 0;
  rigArm.tracks.length = 0;
  Bun.gc(true);
  Bun.gc(true);

  const rigStages = {} as Record<RigStage | 'total', StageStats>;
  for (const k of rigKeys) rigStages[k] = computeStats(rigSeries[k]);
  const spineStages = {} as Record<SpineStage | 'total', StageStats>;
  for (const k of spineKeys) spineStages[k] = computeStats(spineSeries[k]);

  const mappedRows = buildPairedRows(MAPPED_GROUPS, mappedSpine, mappedRig);
  const allocRig = includeAlloc ? measureStageAllocations(modelText, parsedModel, { label: 'rig-c' }) : undefined;

  return {
    skeleton,
    instances,
    frames: rigSeries.total.length,
    interleave,
    rigStages,
    spineStages,
    mappedRows,
    allocRig,
  };
}

// ---------------------------------------------------------------------------
// Verification Bar 2: Planted Controls (`--verify-controls`)
// ---------------------------------------------------------------------------

export interface PlantedControlsReport {
  busyLoopStage: RigStage;
  busyLoopTargetUs: number;
  busyLoopDeltaUsByStage: Record<RigStage, number>;
  busyLoopPassed: boolean;
  allocStage: RigStage;
  allocUnretainedArrays: number;
  allocExpectedBytes: number;
  allocDeltaBytesByStage: Record<RigStage, number>;
  allocPassed: boolean;
  driftControlStage: RigStage;
  driftControlRun1Us: number;
  driftControlRun2Us: number;
  driftControlTotalUs: number;
  driftControlDiffPct: number;
  driftControlShareDeltaPct: number;
  driftControlWithin2Pct: boolean;
  driftControlPassed: boolean;
}

export function verifyPlantedControls(modelText: string, parsedModel: unknown): PlantedControlsReport {
  // 1. Busy-loop control planted in `world` (`plant.evaluate`)
  const busyLoopTargetUs = 120;
  const busyConfig: RigArmConfig = {
    label: 'busy-world',
    plant: {
      evaluate: (bones, active) => {
        const deadline = Bun.nanoseconds() + busyLoopTargetUs * 1000;
        while (Bun.nanoseconds() < deadline) {
          // deliberate busy wait inside `world`
        }
        return worldTransforms(bones, active);
      },
    },
  };
  const busyRun = runRigVsRigBench(
    'spineboy',
    modelText,
    parsedModel,
    1,
    120,
    200,
    'frame',
    { label: 'base' },
    busyConfig,
    false,
    1,
  );
  const busyLoopDeltaUsByStage = {} as Record<RigStage, number>;
  for (const s of RIG_STAGES) {
    const row = busyRun.rows.find((r) => r.stage === s);
    busyLoopDeltaUsByStage[s] = row?.delta.p50 ?? 0;
  }
  const worldDelta = busyLoopDeltaUsByStage.world;
  const otherMaxBusyDelta = Math.max(
    ...RIG_STAGES.filter((s) => s !== 'world').map((s) => Math.abs(busyLoopDeltaUsByStage[s])),
  );
  const busyLoopPassed = worldDelta >= busyLoopTargetUs * 0.8 && otherMaxBusyDelta < 10;

  // 2. Unretained temporary per-frame allocation control planted in `constraints`
  // (`plant.constraints` allocates 256 4-element `[i, i+1, i+2, i+3]` temporary
  // arrays per frame — 16,384 B theoretical — passes each to `noInline`
  // `touchUnretainedTemp` and retains NOTHING). Measured in a child process with
  // `BUN_JSC_useGC=0`.
  const allocUnretainedArrays = UNRETAINED_TEMP_ARRAY_COUNT;
  const allocExpectedBytes = allocUnretainedArrays * 64; // 16,384 B
  const baseAlloc = measureStageAllocations(modelText, parsedModel, configForAllocWorkerMode('default'));
  const plantedAlloc = measureStageAllocations(modelText, parsedModel, configForAllocWorkerMode('planted-unretained'));
  const allocDeltaBytesByStage = {} as Record<RigStage, number>;
  for (const s of RIG_STAGES) {
    allocDeltaBytesByStage[s] = plantedAlloc.perStageBytes[s] - baseAlloc.perStageBytes[s];
  }
  const constraintsAllocDelta = allocDeltaBytesByStage.constraints;
  const otherMaxAllocDelta = Math.max(
    ...RIG_STAGES.filter((s) => s !== 'constraints').map((s) => Math.abs(allocDeltaBytesByStage[s])),
  );
  const allocPassed =
    constraintsAllocDelta >= allocExpectedBytes * 0.88 &&
    otherMaxAllocDelta <= allocExpectedBytes * 0.1;

  // 3. Per-stage relative repeatability drift control (`1 µs → 2 µs` inside a `1000 µs` total):
  // `world` doubles from `1.00 µs` to `2.00 µs` (`+100.00%` relative stage drift) while its
  // share of `total` (`1000.00 µs`) only moves from `0.10%` to `0.20%` (`shareDeltaPct = +0.10%`).
  // `compareRepeatability` must apply the 2% threshold to each stage's own relative drift
  // (`Math.abs(diffPct) <= 2.0`) and therefore mark `world` as `within2Pct === false`.
  const stat = (p50: number): StageStats => ({ p50, p95: p50, mean: p50, iqr: 0 });
  const syntheticRun = (worldUs: number, readoutUs: number): SpineVsRigResult => ({
    skeleton: 'spineboy',
    instances: 100,
    frames: 240,
    interleave: 'frame',
    rigStages: {
      timeline: stat(200),
      world: stat(worldUs),
      constraints: stat(200),
      geometry: stat(200),
      readout: stat(readoutUs),
      frame: stat(100),
      total: stat(200 + worldUs + 200 + 200 + readoutUs + 100),
    },
    spineStages: { timeline: stat(200), world: stat(400), geometry: stat(400), total: stat(1000) },
    mappedRows: [],
  });
  const synthRows = compareRepeatability([syntheticRun(1, 299)], [syntheticRun(2, 298)]);
  const worldDriftRow = synthRows.find((r) => r.stage === 'world')!;
  const driftControlPassed =
    Math.abs(worldDriftRow.diffPct - 100) < 1e-9 &&
    Math.abs(worldDriftRow.shareDeltaPct - 0.1) < 1e-9 &&
    worldDriftRow.within2Pct === false;

  return {
    busyLoopStage: 'world',
    busyLoopTargetUs,
    busyLoopDeltaUsByStage,
    busyLoopPassed,
    allocStage: 'constraints',
    allocUnretainedArrays,
    allocExpectedBytes,
    allocDeltaBytesByStage,
    allocPassed,
    driftControlStage: 'world',
    driftControlRun1Us: worldDriftRow.run1P50Us,
    driftControlRun2Us: worldDriftRow.run2P50Us,
    driftControlTotalUs: 1000,
    driftControlDiffPct: worldDriftRow.diffPct,
    driftControlShareDeltaPct: worldDriftRow.shareDeltaPct,
    driftControlWithin2Pct: worldDriftRow.within2Pct,
    driftControlPassed,
  };
}

// ---------------------------------------------------------------------------
// Asset resolution & automatic preparation (works locally and on `nova`)
// ---------------------------------------------------------------------------

interface SkeletonAssets {
  name: SkeletonName;
  modelText: string;
  parsedModel: unknown;
  spineJsonText: string;
  atlasText: string;
}

const RAW_SPINE_EXAMPLES = 'https://raw.githubusercontent.com/EsotericSoftware/spine-runtimes/4.3/examples';

async function fetchFileIfMissing(url: string, dest: string): Promise<void> {
  if (existsSync(dest)) return;
  mkdirSync(dirname(dest), { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to fetch ${url}: HTTP ${res.status}`);
  writeFileSync(dest, new Uint8Array(await res.arrayBuffer()));
}

export async function ensureBenchAssets(benchDir?: string): Promise<Record<SkeletonName, SkeletonAssets>> {
  const fallbackTmpDir = join(tmpdir(), 'rigc-pose-bench-assets');
  const candidates = [
    ...(benchDir === undefined ? [] : [resolve(benchDir)]),
    resolve(REPO_ROOT, '..', 'rig-adapters', 'public', 'bench'),
    resolve(REPO_ROOT, '..', '..', '..', 'rig-adapters', 'public', 'bench'),
    fallbackTmpDir,
  ];
  let chosenDir = candidates.find((dir) =>
    existsSync(join(dir, 'spineboy', 'skeleton.model.json')) &&
    existsSync(join(dir, 'raptor', 'skeleton.model.json')),
  );

  if (chosenDir === undefined) {
    chosenDir = fallbackTmpDir;
    for (const name of ['spineboy', 'raptor'] as const) {
      const workDir = join(chosenDir, '_src', name);
      const specDir = join(workDir, 'ingested');
      const outDir = join(chosenDir, name);
      mkdirSync(specDir, { recursive: true });
      mkdirSync(outDir, { recursive: true });
      const jsonFile = `${name}-pro.json`;
      const atlasFile = `${name}.atlas`;
      const pngFile = `${name}.png`;
      await fetchFileIfMissing(`${RAW_SPINE_EXAMPLES}/${name}/export/${jsonFile}`, join(workDir, jsonFile));
      await fetchFileIfMissing(`${RAW_SPINE_EXAMPLES}/${name}/export/${atlasFile}`, join(workDir, atlasFile));
      await fetchFileIfMissing(`${RAW_SPINE_EXAMPLES}/${name}/export/${pngFile}`, join(workDir, pngFile));
      writeFileSync(join(outDir, jsonFile), readFileSync(join(workDir, jsonFile)));
      writeFileSync(join(outDir, atlasFile), readFileSync(join(workDir, atlasFile)));
      writeFileSync(join(outDir, pngFile), readFileSync(join(workDir, pngFile)));

      const ingest = spawnSync(
        process.execPath,
        [join(REPO_ROOT, 'cli.ts'), 'ingest', join(workDir, jsonFile), '--out', specDir, '--art', 'none'],
        { cwd: REPO_ROOT, encoding: 'utf8' },
      );
      if (ingest.status !== 0 && !existsSync(join(specDir, 'rig.json'))) {
        throw new Error(`ingest ${name} failed: ${ingest.stderr || ingest.stdout}`);
      }

      writeFileSync(join(outDir, 'rig.json'), readFileSync(join(specDir, 'rig.json')));
      writeFileSync(join(outDir, 'motion.json'), readFileSync(join(specDir, 'motion.json')));
      if (existsSync(join(specDir, 'findings.json'))) {
        writeFileSync(join(outDir, 'findings.json'), readFileSync(join(specDir, 'findings.json')));
      }

      const build = spawnSync(
        process.execPath,
        [
          join(REPO_ROOT, 'cli.ts'),
          'build',
          '--rig',
          'rig.json',
          '--motion',
          'motion.json',
          '--atlas-in',
          atlasFile,
          '--out',
          '.',
        ],
        { cwd: outDir, encoding: 'utf8' },
      );
      if (build.status !== 0) throw new Error(`build ${name} failed: ${build.stderr || build.stdout}`);
    }
  }

  const loadOne = (name: SkeletonName): SkeletonAssets => {
    const dir = join(chosenDir as string, name);
    const modelText = readFileSync(join(dir, 'skeleton.model.json'), 'utf8');
    const spineJsonText = readFileSync(join(dir, `${name}-pro.json`), 'utf8');
    const atlasText = readFileSync(join(dir, `${name}.atlas`), 'utf8');
    return {
      name,
      modelText,
      parsedModel: JSON.parse(modelText),
      spineJsonText,
      atlasText,
    };
  };

  return {
    spineboy: loadOne('spineboy'),
    raptor: loadOne('raptor'),
  };
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function fmtUs(v: number): string {
  return `${v.toFixed(2)} µs`;
}

function fmtSignedUs(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)} µs`;
}

function fmtPct(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
}

function formatRigVsRigMarkdown(res: RigVsRigResult): string {
  const lines: string[] = [];
  lines.push(`#### \`${res.skeleton}\` × \`${res.instances}\` (${res.frames} frames, \`--interleave ${res.interleave}\`, A = \`${res.armALabel}\`, B = \`${res.armBLabel}\`)`);
  lines.push('');
  lines.push(`| Stage | ${res.armALabel} p50 (p95) | ${res.armBLabel} p50 (p95) | Paired Δ p50 (p95) | Paired Δ mean (IQR) | Δ % (p50) | Alloc A → B (Δ B/frame) |`);
  lines.push('|---|---:|---:|---:|---:|---:|---:|');
  for (const r of res.rows) {
    const isTotal = r.stage === 'total';
    const stageName = isTotal ? '**total**' : `\`${r.stage}\``;
    let allocCell = '—';
    if (res.allocA !== undefined && res.allocB !== undefined) {
      const aBytes = isTotal ? res.allocA.totalBytes : res.allocA.perStageBytes[r.stage as RigStage];
      const bBytes = isTotal ? res.allocB.totalBytes : res.allocB.perStageBytes[r.stage as RigStage];
      const dBytes = bBytes - aBytes;
      allocCell = `${aBytes} → ${bBytes} (${dBytes >= 0 ? '+' : ''}${dBytes} B)`;
    }
    lines.push(
      `| ${stageName} | ${fmtUs(r.armA.p50)} (${fmtUs(r.armA.p95)}) | ${fmtUs(r.armB.p50)} (${fmtUs(r.armB.p95)}) | ${fmtSignedUs(r.delta.p50)} (${fmtSignedUs(r.delta.p95)}) | ${fmtSignedUs(r.delta.mean)} (${fmtUs(r.delta.iqr)}) | ${fmtPct(r.pctP50)} | ${allocCell} |`,
    );
  }
  return lines.join('\n');
}

function formatSpineVsRigMarkdown(res: SpineVsRigResult): string {
  const lines: string[] = [];
  lines.push(`#### \`${res.skeleton}\` × \`${res.instances}\` (${res.frames} frames, \`--interleave ${res.interleave}\`, A = \`spine-core 4.3.13\`, B = \`rig-c\`)`);
  lines.push('');
  lines.push('**`rig-c` 6-stage breakdown (per frame):**');
  lines.push('');
  lines.push('| Stage | `rig-c` p50 | `rig-c` p95 | `rig-c` IQR | Alloc (1× B/frame) |');
  lines.push('|---|---:|---:|---:|---:|');
  for (const s of [...RIG_STAGES, 'total'] as const) {
    const st = res.rigStages[s];
    const label = s === 'total' ? '**total**' : `\`${s}\``;
    const alloc = res.allocRig === undefined ? '—' : `${s === 'total' ? res.allocRig.totalBytes : res.allocRig.perStageBytes[s]} B`;
    lines.push(`| ${label} | ${fmtUs(st.p50)} | ${fmtUs(st.p95)} | ${fmtUs(st.iqr)} | ${alloc} |`);
  }
  lines.push('');
  lines.push('**Paired stage-group comparison vs `spine-core 4.3.13` (per frame):**');
  lines.push('');
  lines.push('| Stage Group | `spine-core` p50 (p95) | `rig-c` p50 (p95) | Paired Δ (rig − spine) p50 (IQR) | Ratio (`rig / spine` p50) |');
  lines.push('|---|---:|---:|---:|---:|');
  for (const r of res.mappedRows) {
    const label = r.stage === 'total' ? '**total**' : `\`${r.stage}\``;
    const ratio = r.armA.p50 === 0 ? '—' : `${(r.armB.p50 / r.armA.p50).toFixed(2)}×`;
    lines.push(
      `| ${label} | ${fmtUs(r.armA.p50)} (${fmtUs(r.armA.p95)}) | ${fmtUs(r.armB.p50)} (${fmtUs(r.armB.p95)}) | ${fmtSignedUs(r.delta.p50)} (${fmtUs(r.delta.iqr)}) | ${ratio} |`,
    );
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Repeatability comparison between two invocations (`<= 2%` per stage bar)
// ---------------------------------------------------------------------------

export interface RepeatabilityRow {
  caseKey: string;
  stage: string;
  run1P50Us: number;
  run2P50Us: number;
  diffPct: number;
  share1Pct: number;
  share2Pct: number;
  shareDeltaPct: number;
  within2Pct: boolean;
}

export function compareRepeatability(run1: SpineVsRigResult[], run2: SpineVsRigResult[]): RepeatabilityRow[] {
  const out: RepeatabilityRow[] = [];
  for (let i = 0; i < Math.min(run1.length, run2.length); i++) {
    const a = run1[i];
    const b = run2[i];
    const caseKey = `${a.skeleton}×${a.instances}`;
    const tot1 = a.rigStages.total.p50;
    const tot2 = b.rigStages.total.p50;
    for (const s of [...RIG_STAGES, 'total'] as const) {
      const p1 = a.rigStages[s].p50;
      const p2 = b.rigStages[s].p50;
      const diffPct = p1 === 0 ? 0 : ((p2 - p1) / p1) * 100;
      const share1Pct = tot1 === 0 ? 0 : (p1 / tot1) * 100;
      const share2Pct = tot2 === 0 ? 0 : (p2 / tot2) * 100;
      const shareDeltaPct = s === 'total' ? diffPct : share2Pct - share1Pct;
      out.push({
        caseKey,
        stage: s,
        run1P50Us: p1,
        run2P50Us: p2,
        diffPct,
        share1Pct,
        share2Pct,
        shareDeltaPct,
        within2Pct: Math.abs(diffPct) <= 2.0,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

interface CliOptions {
  skeletons: SkeletonName[];
  instances: number[];
  frames: number;
  warmup: number;
  interleave: InterleaveMode;
  card: BenchCard;
  verifyControls: boolean;
  repeat: number;
  benchDir?: string;
  jsonOut?: string;
}

function parseCli(argv: readonly string[]): CliOptions {
  let skeletons: SkeletonName[] = ['spineboy', 'raptor'];
  let instances: number[] = [1, 100];
  let frames = 240;
  let warmup = 60;
  let interleave: InterleaveMode = 'frame';
  let card: BenchCard = 'vs-spine';
  let verifyControls = false;
  let repeat = 1;
  let benchDir: string | undefined;
  let jsonOut: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--skeleton') {
      const v = argv[++i];
      if (v === 'spineboy' || v === 'raptor') skeletons = [v];
      else if (v === 'both') skeletons = ['spineboy', 'raptor'];
      else throw new Error(`--skeleton: expected spineboy|raptor|both, got ${JSON.stringify(v)}`);
    } else if (arg === '--instances') {
      const v = argv[++i];
      instances = v.split(',').map((s) => Number.parseInt(s.trim(), 10));
      if (instances.some((n) => !Number.isInteger(n) || n < 1)) throw new Error(`--instances: invalid ${JSON.stringify(v)}`);
    } else if (arg === '--frames') {
      frames = Number.parseInt(argv[++i], 10);
    } else if (arg === '--warmup') {
      warmup = Number.parseInt(argv[++i], 10);
    } else if (arg === '--interleave') {
      const v = argv[++i];
      if (v !== 'frame' && v !== 'batch') throw new Error(`--interleave: expected frame|batch, got ${JSON.stringify(v)}`);
      interleave = v;
    } else if (arg === '--card') {
      const v = argv[++i];
      if (v !== 'vs-spine' && v !== 'core#1580' && v !== 'play#199' && v !== 'self') {
        throw new Error(`--card: expected vs-spine|core#1580|play#199|self, got ${JSON.stringify(v)}`);
      }
      card = v;
    } else if (arg === '--verify-controls') {
      verifyControls = true;
    } else if (arg === '--repeat') {
      repeat = Number.parseInt(argv[++i], 10);
    } else if (arg === '--bench-dir') {
      benchDir = argv[++i];
    } else if (arg === '--json-out') {
      jsonOut = argv[++i];
    } else {
      throw new Error(`unknown argument: ${JSON.stringify(arg)}`);
    }
  }
  return { skeletons, instances, frames, warmup, interleave, card, verifyControls, repeat, benchDir, jsonOut };
}

async function main(): Promise<void> {
  if (process.argv[2] === '--alloc-worker') {
    const mode = (process.argv[3] ?? 'default') as AllocWorkerMode;
    const modelText = readFileSync(0, 'utf8');
    const parsedModel: unknown = JSON.parse(modelText);
    const report = measureStageAllocationsInProcess(modelText, parsedModel, configForAllocWorkerMode(mode));
    process.stdout.write(`${JSON.stringify(report)}\n`);
    return;
  }

  const opts = parseCli(process.argv.slice(2));
  const assets = await ensureBenchAssets(opts.benchDir);

  console.log(`### \`tools/pose_bench.ts\` — \`--card ${opts.card}\` (\`--interleave ${opts.interleave}\`, ${opts.frames} frames, warmup ${opts.warmup}, Bun ${Bun.version})\n`);

  // 1. Always verify bit-equality (`Object.is`) against uninstrumented walk
  const candidateForBitCheck: RigArmConfig | undefined =
    opts.card === 'core#1580'
      ? { label: 'pre-#1580', plant: { vertices: worldVerticesPre1580, deformedVertices: deformedWorldVerticesPre1580 } }
      : opts.card === 'play#199'
        ? { label: 'pre-#199', frameFn: frameOfPre199 }
        : undefined;

  for (const skel of opts.skeletons) {
    const a = assets[skel];
    const check = verifyBitEquality(skel, a.modelText, a.parsedModel, candidateForBitCheck, 60);
    if (!check.ok) {
      throw new Error(`Bit-equality check failed: ${check.detail}`);
    }
    console.log(`- **Bit-equality (\`Object.is\`)**: ${check.detail}`);
  }
  console.log('');

  // 2. Run CPU timing benchmark arm(s); dedicated allocation pass runs in a
  // separate child process with `BUN_JSC_useGC=0`.
  const jsonPayload: Record<string, unknown> = {
    bun: Bun.version,
    options: opts,
  };

  if (opts.card === 'vs-spine') {
    // One-time FTL + heap steady-state pre-warm across every configured
    // `(skeleton, instances)` pair so Pass 1 and Pass 2 run at identical FTL
    // tiering and steady-state heap capacity.
    for (const skel of opts.skeletons) {
      const a = assets[skel];
      for (const count of opts.instances) {
        runSpineVsRigBench(skel, a.modelText, a.parsedModel, a.spineJsonText, a.atlasText, count, 120, 40, opts.interleave, false);
      }
    }

    const allPasses: SpineVsRigResult[][] = [];
    for (let pass = 0; pass < opts.repeat; pass++) {
      const results: SpineVsRigResult[] = [];
      for (const skel of opts.skeletons) {
        const a = assets[skel];
        for (const count of opts.instances) {
          const res = runSpineVsRigBench(
            skel,
            a.modelText,
            a.parsedModel,
            a.spineJsonText,
            a.atlasText,
            count,
            opts.frames,
            opts.warmup,
            opts.interleave,
            false,
          );
          results.push(res);
        }
      }
      allPasses.push(results);
    }

    const selfRepeatResults: RigVsRigResult[] = [];
    if (opts.repeat >= 2) {
      for (const skel of opts.skeletons) {
        const a = assets[skel];
        for (const count of opts.instances) {
          selfRepeatResults.push(
            runRigVsRigBench(
              skel,
              a.modelText,
              a.parsedModel,
              count,
              opts.frames,
              opts.warmup,
              'frame',
              { label: 'rig-c (A)' },
              { label: 'rig-c (B)' },
              false,
            ),
          );
        }
      }
    }

    // Dedicated child-process allocation pass (`BUN_JSC_useGC=0`)
    if (allPasses.length > 0) {
      for (const res of allPasses[0]) {
        if (res.instances === 1) {
          const a = assets[res.skeleton];
          res.allocRig = measureStageAllocations(a.modelText, a.parsedModel, { label: 'rig-c' });
        }
      }
    }

    let controlsReport: PlantedControlsReport | undefined;
    if (opts.verifyControls) {
      controlsReport = verifyPlantedControls(assets.spineboy.modelText, assets.spineboy.parsedModel);
      jsonPayload.controls = controlsReport;
      console.log('#### Planted Controls (`--verify-controls` on `spineboy` × 1)');
      console.log('');
      console.log(`- **Busy-loop control (\`+${controlsReport.busyLoopTargetUs} µs\` planted in \`${controlsReport.busyLoopStage}\`)**: **${controlsReport.busyLoopPassed ? 'PASS' : 'FAIL'}**`);
      console.log(
        `  - Per-stage Δ p50: ${RIG_STAGES.map((s) => `\`${s}\`: ${fmtSignedUs(controlsReport!.busyLoopDeltaUsByStage[s])}`).join(', ')}`,
      );
      console.log(`- **Unretained temporary allocation control (\`${controlsReport.allocUnretainedArrays} × 4-element arrays\` = \`${controlsReport.allocExpectedBytes} B\` unretained temporaries planted in \`${controlsReport.allocStage}\`, measured in child process with \`BUN_JSC_useGC=0\`)**: **${controlsReport.allocPassed ? 'PASS' : 'FAIL'}**`);
      console.log(
        `  - Per-stage Δ bytes/frame: ${RIG_STAGES.map((s) => `\`${s}\`: ${controlsReport!.allocDeltaBytesByStage[s] >= 0 ? '+' : ''}${controlsReport!.allocDeltaBytesByStage[s]} B`).join(', ')}`,
      );
      console.log(`- **Repeatability per-stage relative drift control (\`1.00 µs → 2.00 µs\` in \`${controlsReport.driftControlStage}\` inside \`${controlsReport.driftControlTotalUs.toFixed(2)} µs\` total)**: **${controlsReport.driftControlPassed ? 'PASS (correctly flagged within2Pct: false)' : 'FAIL'}**`);
      console.log(
        `  - \`${controlsReport.driftControlStage}\`: \`${fmtUs(controlsReport.driftControlRun1Us)} → ${fmtUs(controlsReport.driftControlRun2Us)}\`, relative \`diffPct = ${fmtPct(controlsReport.driftControlDiffPct)}\`, context \`shareDeltaPct = ${fmtPct(controlsReport.driftControlShareDeltaPct)}\`, \`within2Pct = ${controlsReport.driftControlWithin2Pct}\` (\`FAIL\` as required)`,
      );
      console.log('');
      if (!controlsReport.busyLoopPassed || !controlsReport.allocPassed || !controlsReport.driftControlPassed) {
        throw new Error('Planted controls verification failed');
      }
    }

    if (allPasses.length > 0) {
      for (const res of allPasses[0]) {
        console.log(formatSpineVsRigMarkdown(res));
        console.log('');
      }
    }
    jsonPayload.passes = allPasses;

    if (allPasses.length >= 2) {
      console.log('#### Repeatability — Same-Frame A vs B on Same Tree (`rig-c (A)` vs `rig-c (B)`, `2%` bar per stage)');
      console.log('');
      console.log('| Case | Stage | `rig-c (A)` p50 | `rig-c (B)` p50 | Paired Δ p50 | Drift % | Within 2% |');
      console.log('|---|---|---:|---:|---:|---:|---|');
      for (const sr of selfRepeatResults) {
        const caseKey = `${sr.skeleton}×${sr.instances}`;
        for (const r of sr.rows) {
          const within = Math.abs(r.pctP50) <= 2.0;
          console.log(
            `| \`${caseKey}\` | \`${r.stage}\` | ${fmtUs(r.armA.p50)} | ${fmtUs(r.armB.p50)} | ${fmtSignedUs(r.delta.p50)} | ${fmtPct(r.pctP50)} | ${within ? 'YES (≤2%)' : 'NO (>2%)'} |`,
          );
        }
      }
      console.log('');

      const repRows = compareRepeatability(allPasses[0], allPasses[1]);
      jsonPayload.repeatability = repRows;
      jsonPayload.selfRepeatability = selfRepeatResults;
      console.log('#### Repeatability — Back-to-Back Invocations (Pass 1 vs Pass 2, `2%` bar on each stage\'s own relative drift; share reported as context)');
      console.log('');
      console.log('| Case | Stage | Pass 1 p50 (Share) | Pass 2 p50 (Share) | Stage Relative Drift % | Share Δ % (context) | Within 2% (`|Drift %| ≤ 2%`) |');
      console.log('|---|---|---:|---:|---:|---:|---|');
      for (const r of repRows) {
        const sh1 = r.stage === 'total' ? '100.0%' : `${r.share1Pct.toFixed(1)}%`;
        const sh2 = r.stage === 'total' ? '100.0%' : `${r.share2Pct.toFixed(1)}%`;
        const shDelta = r.stage === 'total' ? '—' : fmtPct(r.shareDeltaPct);
        console.log(
          `| \`${r.caseKey}\` | \`${r.stage}\` | ${fmtUs(r.run1P50Us)} (${sh1}) | ${fmtUs(r.run2P50Us)} (${sh2}) | ${fmtPct(r.diffPct)} | ${shDelta} | ${r.within2Pct ? 'YES (≤2%)' : 'NO (>2%)'} |`,
        );
      }
      console.log('');
    }
  } else {
    const configA: RigArmConfig =
      opts.card === 'core#1580'
        ? { label: 'pre-#1580', plant: { vertices: worldVerticesPre1580, deformedVertices: deformedWorldVerticesPre1580 } }
        : opts.card === 'play#199'
          ? { label: 'pre-#199', frameFn: frameOfPre199 }
          : { label: 'rig-c (A)' };
    const configB: RigArmConfig =
      opts.card === 'core#1580'
        ? { label: 'post-#1580' }
        : opts.card === 'play#199'
          ? { label: 'post-#199', frameFn: frameOfPost199 }
          : { label: 'rig-c (B)' };

    // One-time FTL + heap steady-state pre-warm (100 instances × 180 frames)
    for (const skel of opts.skeletons) {
      const a = assets[skel];
      runRigVsRigBench(skel, a.modelText, a.parsedModel, 100, 180, 60, opts.interleave, configA, configB, false);
    }

    const results: RigVsRigResult[] = [];
    for (const skel of opts.skeletons) {
      const a = assets[skel];
      for (const count of opts.instances) {
        const res = runRigVsRigBench(
          skel,
          a.modelText,
          a.parsedModel,
          count,
          opts.frames,
          opts.warmup,
          opts.interleave,
          configA,
          configB,
          false,
        );
        results.push(res);
      }
    }

    // Dedicated child-process allocation pass (`BUN_JSC_useGC=0`)
    for (const res of results) {
      if (res.instances === 1) {
        const a = assets[res.skeleton];
        res.allocA = measureStageAllocations(a.modelText, a.parsedModel, configA);
        res.allocB = measureStageAllocations(a.modelText, a.parsedModel, configB);
      }
    }

    if (opts.verifyControls) {
      const controlsReport = verifyPlantedControls(assets.spineboy.modelText, assets.spineboy.parsedModel);
      jsonPayload.controls = controlsReport;
      if (!controlsReport.busyLoopPassed || !controlsReport.allocPassed || !controlsReport.driftControlPassed) {
        throw new Error('Planted controls verification failed');
      }
    }

    for (const res of results) {
      console.log(formatRigVsRigMarkdown(res));
      console.log('');
    }
    jsonPayload.results = results;
  }

  if (opts.jsonOut !== undefined) {
    writeFileSync(opts.jsonOut, JSON.stringify(jsonPayload, null, 2));
  }
}

if (import.meta.main) {
  if (process.argv[2] === '--apply-only') {
    const { applyBenchMain } = await import('./pose_apply_bench.ts');
    await applyBenchMain(process.argv.slice(3));
  } else {
    await main();
  }
}
