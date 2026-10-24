import { createHash } from 'node:crypto';
import { basename, dirname } from 'node:path';
import { Plate, type RGBA } from '../tools/plate.ts';
import {
  DEFAULT_PADDING,
  DEFAULT_PAGE_EDGES,
  DEFAULT_PAGE_SIZE,
  PAGE_EDGES,
  packAtlas,
  type PackInput,
  type PageEdges,
} from './atlas.ts';
import type { EnvironmentStep } from './environment.ts';
import {
  projector,
  renderFrame,
  sidecarViewport,
  TRANSPARENT_BACKGROUND,
  type Frame,
  type FrameSet,
  type PinnedViewport,
  type SlotSubset,
  type Viewport,
} from './render_shared.ts';

/** Supported `--sheet-format` values on `rigc render --sheet`. */
export const SHEET_FORMATS = ['json-hash'] as const;
export type SheetFormat = (typeof SHEET_FORMATS)[number];
export const DEFAULT_SHEET_FORMAT: SheetFormat = 'json-hash';

/** File names and format tags written by `rigc render --sheet`. */
export const SHEET_PAGE_STEM = 'sheet';
export const SHEET_MANIFEST_FILE = 'sheet-manifest.json';
export const SHEET_MANIFEST_SPEC = 'rigc-sheet/1';
export const SHEET_PAGE_SIZE = DEFAULT_PAGE_SIZE;
export const SHEET_PADDING = DEFAULT_PADDING;

/** Refusal of a `--sheet` invocation whose frame dimensions or flags cannot be packed. */
export class SheetUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SheetUsageError';
  }
}

/** Failure of the pre-write spritesheet self-check (`verifySheetPack`). */
export class SheetInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SheetInvariantError';
  }
}

/** One entry in a `sheet*.json` TexturePacker-style `frames` hash table. */
export interface SheetJsonFrameEntry {
  frame: { x: number; y: number; w: number; h: number };
  rotated: false;
  trimmed: boolean;
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
  anchor: { x: number; y: number };
}

/** Per-page `sheet*.json` document (`json-hash`), shared by PixiJS `Spritesheet` and Phaser 3 `JSONHash`. */
export interface SheetJsonHashDocument {
  frames: Record<string, SheetJsonFrameEntry>;
  animations: Record<string, string[]>;
  meta: {
    app: 'rig-c';
    format: 'RGBA8888';
    image: string;
    size: { w: number; h: number };
    scale: '1';
    related_multi_packs?: string[];
  };
}

/** Per-page summary in `sheet-manifest.json`. */
export interface SheetManifestPage {
  index: number;
  image: string;
  table: string;
  width: number;
  height: number;
  occupancy: number;
  frames: string[];
}

/** Per-frame record in `sheet-manifest.json`, ordered by chronological frame index `0..sampled - 1`. */
export interface SheetManifestFrame {
  index: number;
  key: string;
  time: number;
  page: number;
  image: string;
  table: string;
  empty: boolean;
  frame: { x: number; y: number; w: number; h: number };
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
  anchor: { x: number; y: number };
}

/** The per-set `sheet-manifest.json` (`rigc-sheet/1`) document. */
export interface SheetManifest {
  spec: typeof SHEET_MANIFEST_SPEC;
  format: SheetFormat;
  namespace: string;
  animation: string | null;
  skin?: string;
  slots?: string[];
  hidden?: string[];
  environment?: EnvironmentStep[];
  pinned?: PinnedViewport;
  fps: number;
  duration: number;
  sampled: number;
  endpointPolicy: 'inclusive-grid';
  alphaMode: 'straight';
  filterPolicy: {
    recommended: 'linear';
    paddingPx: number;
    extrusion: 'clamp-edge';
  };
  pageEdges: PageEdges;
  pageSize: number;
  padding: number;
  sourceSize: { w: number; h: number };
  viewport: ReturnType<typeof sidecarViewport>;
  pivot: {
    world: [0, 0];
    canvasPx: { x: number; y: number };
    anchor: { x: number; y: number };
  };
  pages: SheetManifestPage[];
  frames: SheetManifestFrame[];
}

/** One packed page of a rendered set's spritesheet, ready to write after `verifySheetPack`. */
export interface SheetPackedPage {
  index: number;
  image: string;
  table: string;
  plate: Plate;
  json: SheetJsonHashDocument;
  jsonText: string;
  occupancy: number;
}

/** Complete in-memory result for one animation set's spritesheet export. */
export interface SheetSetPack {
  setName: string;
  namespace: string;
  format: SheetFormat;
  pageEdges: PageEdges;
  pages: SheetPackedPage[];
  manifest: SheetManifest;
  manifestText: string;
  untrimmedPlates: Plate[];
}

/** Options for building one animation set's spritesheet pack. */
export interface BuildSheetSetOptions {
  rigName: string;
  setName: string;
  animation: string | null;
  fps: number;
  maxSide: number;
  viewport: Viewport;
  frames: readonly Frame[];
  atlasPages: Map<string, Plate>;
  format?: SheetFormat;
  pageEdges?: PageEdges;
  skin?: string;
  subset?: SlotSubset;
  environment?: EnvironmentStep[];
  pinned?: PinnedViewport;
  /** For negative-control testing in `selftest.ts` only: reverse the input order handed to `packAtlas`. */
  reversePackInputs?: boolean;
}

/** Normalize `-0` to `0` so JSON serialization never carries sign noise. */
function cleanZero(n: number): number {
  return n === 0 ? 0 : n;
}

/**
 * Derive the deterministic `<rig>` identifier for frame keys from the compiled
 * model document's `rig.skeleton.name` when present, or from the skeleton path's
 * stem/directory when rendering a foreign Spine export.
 */
export function sheetRigNameOf(skeletonPath: string, modelText: string | null): string {
  if (modelText !== null) {
    try {
      const parsed = JSON.parse(modelText) as { rig?: { name?: unknown; skeleton?: { name?: unknown } } };
      const name = parsed.rig?.name ?? parsed.rig?.skeleton?.name;
      if (typeof name === 'string' && name.trim().length > 0) {
        return sanitizeNamespaceSegment(name.trim());
      }
    } catch {
      // Fall back to path stem when model JSON is absent or unparseable.
    }
  }
  const stem = basename(skeletonPath, '.json');
  const raw = stem !== 'skeleton' && stem.length > 0 ? stem : basename(dirname(skeletonPath));
  return sanitizeNamespaceSegment(raw.length > 0 ? raw : 'rig');
}

function sanitizeNamespaceSegment(segment: string): string {
  return segment.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '') || 'rig';
}

/**
 * Build the collision-free frame-key namespace `<rig>/<anim>[/<variant>]` for a
 * rendered set. Non-default skin, slot subset, or environment schedule are
 * encoded in `<variant>` in fixed order so multiple exports loaded into a shared
 * texture cache cannot collide on frame keys.
 */
export function sheetNamespaceOf(opts: {
  rigName: string;
  setName: string;
  skin?: string;
  subset?: SlotSubset;
  environment?: EnvironmentStep[];
}): string {
  const rig = sanitizeNamespaceSegment(opts.rigName);
  const anim = sanitizeNamespaceSegment(opts.setName);
  const variants: string[] = [];
  if (opts.skin !== undefined) variants.push(`skin=${opts.skin}`);
  if (opts.subset !== undefined) variants.push(`${opts.subset.mode}=${opts.subset.names.join(',')}`);
  if (opts.environment !== undefined) {
    const digest = createHash('sha256').update(JSON.stringify(opts.environment)).digest('hex').slice(0, 8);
    variants.push(`env=${digest}`);
  }
  return variants.length === 0 ? `${rig}/${anim}` : `${rig}/${anim}/${variants.join('+')}`;
}

/** Zero-padded frame key `<namespace>/f<NNNN>` in chronological order. */
export function sheetFrameKey(namespace: string, index: number): string {
  return `${namespace}/f${String(index).padStart(4, '0')}`;
}

/** Result of alpha-byte `> 0` minimal bounding-box trimming on one rendered frame. */
export interface TrimmedFrame {
  plate: Plate;
  trimX: number;
  trimY: number;
  width: number;
  height: number;
  trimmed: boolean;
  empty: boolean;
}

/**
 * Compute the minimal bounding box of pixels with `alpha > 0` (straight RGBA8
 * alpha byte `>= 1`).
 *
 * When every pixel has `alpha === 0`, returns a `1x1` transparent `[0, 0, 0, 0]`
 * sentinel at `(0, 0)` with `empty: true` and `trimmed: true` so the frame's
 * index, timestamp, and original `sourceSize` stay intact in the animation
 * sequence without wasting atlas area.
 */
export function trimTransparentFrame(source: Plate): TrimmedFrame {
  const sw = source.width;
  const sh = source.height;
  const data = source.data;
  let minX = sw;
  let minY = sh;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < sh; y++) {
    const rowOffset = y * sw * 4;
    for (let x = 0; x < sw; x++) {
      if (data[rowOffset + x * 4 + 3] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    const sentinel = new Plate(1, 1);
    return {
      plate: sentinel,
      trimX: 0,
      trimY: 0,
      width: 1,
      height: 1,
      trimmed: true,
      empty: true,
    };
  }

  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const trimmed = minX !== 0 || minY !== 0 || width !== sw || height !== sh;
  const cropped = new Plate(width, height);
  for (let y = 0; y < height; y++) {
    const srcStart = ((minY + y) * sw + minX) * 4;
    const dstStart = y * width * 4;
    cropped.data.set(data.subarray(srcStart, srcStart + width * 4), dstStart);
  }
  return {
    plate: cropped,
    trimX: minX,
    trimY: minY,
    width,
    height,
    trimmed,
    empty: false,
  };
}

/**
 * Project world origin `(0, 0)` into the untrimmed `viewport` canvas and return
 * both its pixel coordinates and normalized `anchor` (`{ x, y }`).
 *
 * Values are never clamped to `[0, 1]`, so a viewport that does not contain
 * world `(0, 0)` still places the rig's world origin at the exact same point.
 */
export function sheetPivotOf(viewport: Viewport): {
  canvasPx: { x: number; y: number };
  anchor: { x: number; y: number };
} {
  const [px, py] = projector(viewport)(0, 0);
  const canvasX = cleanZero(px);
  const canvasY = cleanZero(py);
  return {
    canvasPx: { x: canvasX, y: canvasY },
    anchor: {
      x: cleanZero(canvasX / viewport.width),
      y: cleanZero(canvasY / viewport.height),
    },
  };
}

/**
 * Reconstruct the full `sourceSize.w x sourceSize.h` transparent frame `Plate`
 * from a packed page `Plate` and a `SheetJsonFrameEntry`.
 */
export function reconstructSheetFrame(page: Plate, entry: SheetJsonFrameEntry): Plate {
  const out = new Plate(entry.sourceSize.w, entry.sourceSize.h);
  const { x: fx, y: fy, w: fw, h: fh } = entry.frame;
  const { x: sx, y: sy } = entry.spriteSourceSize;
  for (let dy = 0; dy < fh; dy++) {
    const py = fy + dy;
    const ty = sy + dy;
    if (py < 0 || py >= page.height || ty < 0 || ty >= out.height) continue;
    for (let dx = 0; dx < fw; dx++) {
      const px = fx + dx;
      const tx = sx + dx;
      if (px < 0 || px >= page.width || tx < 0 || tx >= out.width) continue;
      const srcIdx = (py * page.width + px) * 4;
      const dstIdx = (ty * out.width + tx) * 4;
      out.data[dstIdx] = page.data[srcIdx];
      out.data[dstIdx + 1] = page.data[srcIdx + 1];
      out.data[dstIdx + 2] = page.data[srcIdx + 2];
      out.data[dstIdx + 3] = page.data[srcIdx + 3];
    }
  }
  return out;
}

function isPowerOfTwo(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && (n & (n - 1)) === 0;
}

function rgbaString(data: Uint8Array, idx: number): string {
  return `[${data[idx]}, ${data[idx + 1]}, ${data[idx + 2]}, ${data[idx + 3]}]`;
}

/**
 * Verify every structural, packing, extrusion, ordering, and pixel-reconstruction
 * invariant of a packed spritesheet set against the expected untrimmed transparent
 * frames. Returns a list of named faults (empty when green).
 */
export function sheetPackFaults(
  pages: ReadonlyArray<{ image: string; table: string; plate: Plate; json: SheetJsonHashDocument }>,
  manifest: SheetManifest,
  expectedUntrimmed: readonly Plate[],
): string[] {
  const faults: string[] = [];
  if (manifest.spec !== SHEET_MANIFEST_SPEC) {
    faults.push(`manifest.spec is ${JSON.stringify(manifest.spec)}, required ${JSON.stringify(SHEET_MANIFEST_SPEC)}`);
  }
  if (manifest.format !== 'json-hash') {
    faults.push(`manifest.format is ${JSON.stringify(manifest.format)}, required "json-hash"`);
  }
  if (manifest.alphaMode !== 'straight') {
    faults.push(`manifest.alphaMode is ${JSON.stringify(manifest.alphaMode)}, required "straight"`);
  }
  if (manifest.endpointPolicy !== 'inclusive-grid') {
    faults.push(`manifest.endpointPolicy is ${JSON.stringify(manifest.endpointPolicy)}, required "inclusive-grid"`);
  }
  if (pages.length === 0) {
    faults.push('sheet pack has 0 pages');
    return faults;
  }
  if (manifest.pages.length !== pages.length) {
    faults.push(`manifest.pages has ${manifest.pages.length} page(s) where ${pages.length} page(s) were packed`);
  }
  if (manifest.frames.length !== expectedUntrimmed.length) {
    faults.push(`manifest.frames has ${manifest.frames.length} frame(s), required ${expectedUntrimmed.length}`);
  }

  const padding = manifest.padding;
  const maxEdge = manifest.pageSize;

  // Check each page's dimensions, metadata, chronological key order, cell bounds, non-overlap, and 2-px extrusion.
  const seenInTables = new Map<string, { pageIndex: number; entry: SheetJsonFrameEntry }>();
  for (let p = 0; p < pages.length; p++) {
    const page = pages[p];
    const pw = page.plate.width;
    const ph = page.plate.height;
    const metaSize = page.json.meta?.size as unknown;
    if (
      typeof metaSize !== 'object' ||
      metaSize === null ||
      Array.isArray(metaSize) ||
      (metaSize as { w?: unknown }).w !== pw ||
      (metaSize as { h?: unknown }).h !== ph
    ) {
      faults.push(
        `page ${p} (${page.table}): meta.size is ${JSON.stringify(metaSize)}, required single size object {"w":${pw},"h":${ph}}`,
      );
    }
    if (page.json.meta.image !== page.image) {
      faults.push(`page ${p} (${page.table}): meta.image is ${JSON.stringify(page.json.meta.image)}, required ${JSON.stringify(page.image)}`);
    }
    if (pw > maxEdge || ph > maxEdge || pw < 1 || ph < 1) {
      faults.push(`page ${p} (${page.image}): size ${pw}x${ph} exceeds max edge ${maxEdge}`);
    }
    if (manifest.pageEdges === 'pot' && (!isPowerOfTwo(pw) || !isPowerOfTwo(ph))) {
      faults.push(`page ${p} (${page.image}): size ${pw}x${ph} is not a power of two under --page-edges pot`);
    }
    const wantRelated = pages.length > 1 ? pages.filter((_, i) => i !== p).map((other) => other.table) : undefined;
    if (JSON.stringify(page.json.meta.related_multi_packs) !== JSON.stringify(wantRelated)) {
      faults.push(
        `page ${p} (${page.table}): meta.related_multi_packs is ${JSON.stringify(page.json.meta.related_multi_packs)}, required ${JSON.stringify(wantRelated)}`,
      );
    }

    const keys = Object.keys(page.json.frames);
    const animKeys = page.json.animations[manifest.namespace] ?? [];
    if (JSON.stringify(keys) !== JSON.stringify(animKeys)) {
      faults.push(
        `page ${p} (${page.table}): animations[${JSON.stringify(manifest.namespace)}] lists [${animKeys.join(', ')}], which differs from frames keys [${keys.join(', ')}]`,
      );
    }
    const indices = keys.map((k) => {
      const m = /\/f(\d+)$/.exec(k);
      return m === null ? -1 : Number(m[1]);
    });
    for (let i = 1; i < indices.length; i++) {
      if (indices[i] <= indices[i - 1]) {
        faults.push(
          `page ${p} (${page.table}): frame keys out of chronological order at ${JSON.stringify(keys[i - 1])} -> ${JSON.stringify(keys[i])}`,
        );
      }
    }

    const placedOnPage: Array<{ key: string; x: number; y: number; w: number; h: number }> = [];
    for (const key of keys) {
      const entry = page.json.frames[key];
      if (seenInTables.has(key)) {
        faults.push(`frame ${JSON.stringify(key)} appears on both page ${seenInTables.get(key)!.pageIndex} and page ${p}`);
      }
      seenInTables.set(key, { pageIndex: p, entry });
      const { x, y, w, h } = entry.frame;
      if (x - padding < 0 || y - padding < 0 || x + w + padding > pw || y + h + padding > ph) {
        faults.push(
          `page ${p} (${page.image}) frame ${JSON.stringify(key)}: padded cell [${x - padding}, ${y - padding}, ${w + 2 * padding}, ${h + 2 * padding}] lies outside ${pw}x${ph} page`,
        );
      } else if (padding > 0) {
        // Verify 2-px clamped edge extrusion around the placed rectangle.
        let extrusionFault: string | null = null;
        for (let py = y - padding; py < y + h + padding && extrusionFault === null; py++) {
          for (let px = x - padding; px < x + w + padding; px++) {
            if (px >= x && px < x + w && py >= y && py < y + h) continue;
            const cx = Math.max(x, Math.min(x + w - 1, px));
            const cy = Math.max(y, Math.min(y + h - 1, py));
            const gotIdx = (py * pw + px) * 4;
            const wantIdx = (cy * pw + cx) * 4;
            if (
              page.plate.data[gotIdx] !== page.plate.data[wantIdx] ||
              page.plate.data[gotIdx + 1] !== page.plate.data[wantIdx + 1] ||
              page.plate.data[gotIdx + 2] !== page.plate.data[wantIdx + 2] ||
              page.plate.data[gotIdx + 3] !== page.plate.data[wantIdx + 3]
            ) {
              extrusionFault =
                `page ${p} (${page.image}) frame ${JSON.stringify(key)}: extruded gutter pixel (${px}, ${py}) is ` +
                `${rgbaString(page.plate.data, gotIdx)}, required clamped edge (${cx}, ${cy}) ${rgbaString(page.plate.data, wantIdx)}`;
              break;
            }
          }
        }
        if (extrusionFault !== null) faults.push(extrusionFault);
      }
      placedOnPage.push({ key, x, y, w, h });
    }

    // Check pairwise non-overlap of padded cells on this page.
    for (let i = 0; i < placedOnPage.length; i++) {
      const a = placedOnPage[i];
      const ax0 = a.x - padding;
      const ay0 = a.y - padding;
      const ax1 = a.x + a.w + padding;
      const ay1 = a.y + a.h + padding;
      for (let j = i + 1; j < placedOnPage.length; j++) {
        const b = placedOnPage[j];
        const bx0 = b.x - padding;
        const by0 = b.y - padding;
        const bx1 = b.x + b.w + padding;
        const by1 = b.y + b.h + padding;
        if (ax0 < bx1 && ax1 > bx0 && ay0 < by1 && ay1 > by0) {
          faults.push(
            `page ${p} (${page.image}): padded cells overlap between ${JSON.stringify(a.key)} ([${ax0},${ay0}..${ax1},${ay1}]) and ${JSON.stringify(b.key)} ([${bx0},${by0}..${bx1},${by1}])`,
          );
        }
      }
    }
  }

  // Check chronological manifest frames and full-canvas RGBA reconstruction.
  for (let i = 0; i < manifest.frames.length; i++) {
    const mf = manifest.frames[i];
    const wantKey = sheetFrameKey(manifest.namespace, i);
    if (mf.index !== i || mf.key !== wantKey) {
      faults.push(
        `manifest.frames[${i}] has index ${mf.index} key ${JSON.stringify(mf.key)}, required index ${i} key ${JSON.stringify(wantKey)}`,
      );
    }
    const found = seenInTables.get(mf.key);
    if (found === undefined) {
      faults.push(`manifest frame ${JSON.stringify(mf.key)} is missing from all sheet*.json tables`);
      continue;
    }
    if (found.pageIndex !== mf.page) {
      faults.push(`manifest frame ${JSON.stringify(mf.key)} states page ${mf.page}, found on page ${found.pageIndex}`);
    }
    const entry = found.entry;
    if (
      JSON.stringify(entry.frame) !== JSON.stringify(mf.frame) ||
      JSON.stringify(entry.spriteSourceSize) !== JSON.stringify(mf.spriteSourceSize) ||
      JSON.stringify(entry.sourceSize) !== JSON.stringify(mf.sourceSize) ||
      JSON.stringify(entry.anchor) !== JSON.stringify(mf.anchor)
    ) {
      faults.push(`manifest frame ${JSON.stringify(mf.key)} disagrees with ${pages[found.pageIndex].table}`);
    }
    if (
      entry.spriteSourceSize.x < 0 ||
      entry.spriteSourceSize.y < 0 ||
      entry.spriteSourceSize.w !== entry.frame.w ||
      entry.spriteSourceSize.h !== entry.frame.h ||
      entry.spriteSourceSize.x + entry.spriteSourceSize.w > entry.sourceSize.w ||
      entry.spriteSourceSize.y + entry.spriteSourceSize.h > entry.sourceSize.h
    ) {
      faults.push(
        `frame ${JSON.stringify(mf.key)}: spriteSourceSize ${JSON.stringify(entry.spriteSourceSize)} is incompatible with frame ${JSON.stringify(entry.frame)} and sourceSize ${JSON.stringify(entry.sourceSize)}`,
      );
    }
    const pivotErrX = Math.abs(entry.anchor.x * entry.sourceSize.w - manifest.pivot.canvasPx.x);
    const pivotErrY = Math.abs(entry.anchor.y * entry.sourceSize.h - manifest.pivot.canvasPx.y);
    if (pivotErrX > 1e-6 || pivotErrY > 1e-6) {
      faults.push(
        `frame ${JSON.stringify(mf.key)}: anchor (${entry.anchor.x}, ${entry.anchor.y}) * sourceSize (${entry.sourceSize.w}x${entry.sourceSize.h}) drifts from world-(0,0) canvasPx (${manifest.pivot.canvasPx.x}, ${manifest.pivot.canvasPx.y}) by (${pivotErrX}, ${pivotErrY})`,
      );
    }

    const expected = expectedUntrimmed[i];
    if (expected === undefined) continue;
    if (entry.sourceSize.w !== expected.width || entry.sourceSize.h !== expected.height) {
      faults.push(
        `frame ${JSON.stringify(mf.key)}: sourceSize ${entry.sourceSize.w}x${entry.sourceSize.h} differs from rendered canvas ${expected.width}x${expected.height}`,
      );
      continue;
    }
    const reconstructed = reconstructSheetFrame(pages[found.pageIndex].plate, entry);
    for (let y = 0; y < expected.height; y++) {
      let pixelFault: string | null = null;
      for (let x = 0; x < expected.width; x++) {
        const idx = (y * expected.width + x) * 4;
        if (
          reconstructed.data[idx] !== expected.data[idx] ||
          reconstructed.data[idx + 1] !== expected.data[idx + 1] ||
          reconstructed.data[idx + 2] !== expected.data[idx + 2] ||
          reconstructed.data[idx + 3] !== expected.data[idx + 3]
        ) {
          pixelFault =
            `frame ${JSON.stringify(mf.key)} reconstruction mismatch at canvas pixel (${x}, ${y}): ` +
            `got ${rgbaString(reconstructed.data, idx)}, expected ${rgbaString(expected.data, idx)}`;
          break;
        }
      }
      if (pixelFault !== null) {
        faults.push(pixelFault);
        break;
      }
    }
  }

  return faults;
}

/** Throw `SheetInvariantError` if `sheetPackFaults` finds any fault. */
export function verifySheetPack(
  pages: ReadonlyArray<{ image: string; table: string; plate: Plate; json: SheetJsonHashDocument }>,
  manifest: SheetManifest,
  expectedUntrimmed: readonly Plate[],
  setName: string,
): void {
  const faults = sheetPackFaults(pages, manifest, expectedUntrimmed);
  if (faults.length > 0) {
    throw new SheetInvariantError(`sheet self-check failed on ${JSON.stringify(setName)}: ${faults[0]}`);
  }
}

/**
 * Render, trim, pack, format, and self-check one animation set's spritesheet
 * in memory before any file is written to disk.
 */
export function buildSheetSet(opts: BuildSheetSetOptions): SheetSetPack {
  const format = opts.format ?? DEFAULT_SHEET_FORMAT;
  if (!SHEET_FORMATS.includes(format)) {
    throw new SheetUsageError(`--sheet-format ${JSON.stringify(String(opts.format))}; known formats: ${SHEET_FORMATS.join(', ')}`);
  }
  const pageEdges = opts.pageEdges ?? DEFAULT_PAGE_EDGES;
  if (!PAGE_EDGES.includes(pageEdges)) {
    throw new SheetUsageError(`--page-edges ${JSON.stringify(String(opts.pageEdges))}; known values: ${PAGE_EDGES.join(', ')}`);
  }

  const namespace = sheetNamespaceOf({
    rigName: opts.rigName,
    setName: opts.setName,
    skin: opts.skin,
    subset: opts.subset,
    environment: opts.environment,
  });

  const padding = SHEET_PADDING;
  const maxEdge = SHEET_PAGE_SIZE;
  const sourceSize = { w: opts.viewport.width, h: opts.viewport.height };
  const pivot = sheetPivotOf(opts.viewport);

  const untrimmedPlates: Plate[] = [];
  const trimmedFrames: Array<{
    index: number;
    key: string;
    time: number;
    trimmed: TrimmedFrame;
  }> = [];

  for (let i = 0; i < opts.frames.length; i++) {
    const frame = opts.frames[i];
    const key = sheetFrameKey(namespace, i);
    const untrimmed = renderFrame(frame, opts.atlasPages, opts.viewport, TRANSPARENT_BACKGROUND);
    const trimmed = trimTransparentFrame(untrimmed);
    const cellW = trimmed.width + 2 * padding;
    const cellH = trimmed.height + 2 * padding;
    if (cellW > maxEdge || cellH > maxEdge) {
      throw new SheetUsageError(
        `--sheet, ${JSON.stringify(opts.setName)} frame ${JSON.stringify(key)} (f${String(i).padStart(4, '0')}, t=${frame.time.toFixed(4)}s) ` +
          `trims to ${trimmed.width}x${trimmed.height}px and with padding ${padding}px needs a ${cellW}x${cellH}px cell, ` +
          `which does not fit a ${maxEdge}x${maxEdge}px page. Lower --max (currently ${opts.maxSide}) or render a smaller --viewport`,
      );
    }
    untrimmedPlates.push(untrimmed);
    trimmedFrames.push({ index: i, key, time: cleanZero(frame.time), trimmed });
  }

  const packInputs: PackInput[] = trimmedFrames.map((item) => ({
    region: item.key,
    absPath: item.key,
    width: item.trimmed.width,
    height: item.trimmed.height,
    plate: item.trimmed.plate,
  }));
  if (opts.reversePackInputs === true) packInputs.reverse();

  const packed = packAtlas(packInputs, {
    pageSize: maxEdge,
    padding,
    pageStem: SHEET_PAGE_STEM,
    pageEdges,
    shape: 'rect',
  });

  const placementByKey = new Map(packed.placements.map((pl) => [pl.region, pl]));
  const pageTableNames = packed.pages.map((_, idx) => (idx === 0 ? `${SHEET_PAGE_STEM}.json` : `${SHEET_PAGE_STEM}${idx + 1}.json`));

  const pages: SheetPackedPage[] = [];
  const manifestPages: SheetManifestPage[] = [];

  for (let p = 0; p < packed.pages.length; p++) {
    const packedPage = packed.pages[p];
    const imageName = packedPage.name;
    const tableName = pageTableNames[p];
    // Collect frames on this page in strict chronological index order (`0 .. sampled - 1`).
    const onPageChronological = trimmedFrames.filter((item) => placementByKey.get(item.key)?.page === p);
    const framesObj: Record<string, SheetJsonFrameEntry> = {};
    const animList: string[] = [];
    for (const item of onPageChronological) {
      const place = placementByKey.get(item.key)!;
      framesObj[item.key] = {
        frame: { x: place.x, y: place.y, w: place.width, h: place.height },
        rotated: false,
        trimmed: item.trimmed.trimmed,
        spriteSourceSize: {
          x: item.trimmed.trimX,
          y: item.trimmed.trimY,
          w: item.trimmed.width,
          h: item.trimmed.height,
        },
        sourceSize: { w: sourceSize.w, h: sourceSize.h },
        anchor: { x: pivot.anchor.x, y: pivot.anchor.y },
      };
      animList.push(item.key);
    }
    const related = packed.pages.length > 1 ? pageTableNames.filter((_, idx) => idx !== p) : undefined;
    const json: SheetJsonHashDocument = {
      frames: framesObj,
      animations: { [namespace]: animList },
      meta: {
        app: 'rig-c',
        format: 'RGBA8888',
        image: imageName,
        size: { w: packedPage.width, h: packedPage.height },
        scale: '1',
        ...(related === undefined ? {} : { related_multi_packs: related }),
      },
    };
    const jsonText = `${JSON.stringify(json, null, 2)}\n`;
    const occupancy = cleanZero(Number(packedPage.occupancy.toFixed(6)));
    pages.push({
      index: p,
      image: imageName,
      table: tableName,
      plate: packedPage.plate,
      json,
      jsonText,
      occupancy,
    });
    manifestPages.push({
      index: p,
      image: imageName,
      table: tableName,
      width: packedPage.width,
      height: packedPage.height,
      occupancy,
      frames: animList,
    });
  }

  const manifestFrames: SheetManifestFrame[] = trimmedFrames.map((item) => {
    const place = placementByKey.get(item.key)!;
    const pageIdx = place.page;
    return {
      index: item.index,
      key: item.key,
      time: item.time,
      page: pageIdx,
      image: packed.pages[pageIdx].name,
      table: pageTableNames[pageIdx],
      empty: item.trimmed.empty,
      frame: { x: place.x, y: place.y, w: place.width, h: place.height },
      spriteSourceSize: {
        x: item.trimmed.trimX,
        y: item.trimmed.trimY,
        w: item.trimmed.width,
        h: item.trimmed.height,
      },
      sourceSize: { w: sourceSize.w, h: sourceSize.h },
      anchor: { x: pivot.anchor.x, y: pivot.anchor.y },
    };
  });

  const duration = opts.frames.length > 0 ? cleanZero(opts.frames[opts.frames.length - 1].time) : 0;
  const manifest: SheetManifest = {
    spec: SHEET_MANIFEST_SPEC,
    format,
    namespace,
    animation: opts.animation,
    ...(opts.skin === undefined ? {} : { skin: opts.skin }),
    ...(opts.subset === undefined
      ? {}
      : opts.subset.mode === 'slots'
        ? { slots: [...opts.subset.names] }
        : { hidden: [...opts.subset.names] }),
    ...(opts.environment === undefined ? {} : { environment: opts.environment }),
    ...(opts.pinned === undefined ? {} : { pinned: opts.pinned }),
    fps: opts.fps,
    duration,
    sampled: opts.frames.length,
    endpointPolicy: 'inclusive-grid',
    alphaMode: 'straight',
    filterPolicy: {
      recommended: 'linear',
      paddingPx: padding,
      extrusion: 'clamp-edge',
    },
    pageEdges,
    pageSize: maxEdge,
    padding,
    sourceSize,
    viewport: sidecarViewport(opts.viewport),
    pivot: {
      world: [0, 0],
      canvasPx: pivot.canvasPx,
      anchor: pivot.anchor,
    },
    pages: manifestPages,
    frames: manifestFrames,
  };

  verifySheetPack(pages, manifest, untrimmedPlates, opts.setName);

  return {
    setName: opts.setName,
    namespace,
    format,
    pageEdges,
    pages,
    manifest,
    manifestText: `${JSON.stringify(manifest, null, 2)}\n`,
    untrimmedPlates,
  };
}

/** `frames.json`'s per-set record of a spritesheet export (`FrameSet['sheet']`). */
export function sheetSidecarRecord(pack: SheetSetPack): NonNullable<FrameSet['sheet']> {
  return {
    manifest: SHEET_MANIFEST_FILE,
    format: pack.format,
    pageEdges: pack.pageEdges,
    pages: pack.pages.length,
    frames: pack.manifest.frames.length,
    emptyFrames: pack.manifest.frames.filter((f) => f.empty).length,
  };
}
