/**
 * Where two slots that meet stop meeting — the reading behind
 * `rigc render --seam <a>:<b>[,…]` (issue #1456).
 *
 * ⭐ **A reading, not a gate**, as `--folds` and `--pass-through` are. A cut rig
 * can tear in motion: two pieces that meet at a joint pull apart and the
 * background shows between them, or one piece swings clear of the piece it was
 * painted to tuck under and the overlap band it carries shows where nothing was.
 * Either can be intended, so this names the frames and decides nothing — it
 * never changes an exit code.
 *
 * ## The frame of reference
 *
 * A seam cannot be read in the world: a limb that swings moves both of its pieces
 * away from where they were at the setup pose, and that is motion, not a tear.
 * It is read **from each piece's own point of view**. A world point `q` of a
 * frame is carried back into a piece's setup pose by the affine map of that
 * piece's triangle holding `q` as the frame poses it — so the point a piece
 * draws at `q` at the frame is the point it drew at the carried-back position at
 * the setup pose, by construction. Outside the piece's mesh the map of the
 * triangle `q` is least outside of (the largest smallest barycentric weight,
 * the lowest index on a tie) is extended to it: exact for a region and for any
 * mesh one bone moves, and the nearest affine piece of a skinned one.
 *
 * Two pieces that move together carry `q` back to one point, so whatever the
 * pose does to the pair as a whole reads nothing.
 *
 * ## What the reading counts
 *
 * Every number is a cell of one world grid per frame: cells one texel of the
 * coarser of the two drawings at the setup pose (`texelSize`, the step
 * `--pass-through` already steps by), on multiples of that texel from the world
 * origin. A cell is drawn by a piece when the renderer's own traversal paints
 * its centre at `DRAWN_ALPHA` or more — the half-opacity line the pass-through
 * reading draws outlines at; no other threshold enters.
 *
 * - **The band** is the cells both drawings draw at the setup pose — where the
 *   two were painted to overlap. A frame where the band is empty has no seam to
 *   read, and a pair whose band is empty on every frame both draw is a **SKIP**,
 *   never a pass. The band has no width of its own: it is the overlap the art
 *   states, dilated by nothing.
 * - **gap** — background appears in the joint. The band's cells, carried to the
 *   frame by each piece (its centre through that piece's setup-pose triangle),
 *   span a convex hull: the region the joint occupies now, as both pieces place
 *   it. A cell inside that hull is a gap cell when neither piece draws it at the
 *   frame and at least one piece, carrying it back, finds it drawn by either
 *   drawing at the setup pose — the two no longer cover what they covered
 *   together. The hull is the joint's own extent, so a piece's far end swinging
 *   away from where it was is not read; the rest test is what keeps a band that
 *   is concave at the setup pose from reading its own notch on every frame.
 * - **ghost** — alpha appears where the rest composite had none. A cell one
 *   piece draws at the frame and the other does not is a ghost cell when the
 *   drawing piece, carrying it back, lands it in the band, and the other piece,
 *   carrying it back, finds neither drawing there at the setup pose — the
 *   overlap band swung clear of its partner.
 *
 * Each frame's figures are the cell counts (`px`), the cell size, their area,
 * and the world box of the counted cells (each cell's whole square).
 * The pair's gap is partitioned into gapOpen (the transparent skeleton frame
 * has alpha 0 there) and gapCovered (positive rendered alpha from any piece,
 * including a faint pair member). This does not change the half-opacity pair
 * predicate: another drawing can cover what the pair no longer covers.
 *
 * Known reach, stated rather than discovered: a piece folded right back over its
 * partner carries the band across the region it vacated, so a hull that wide
 * reads the vacated cells its partner's view still finds drawn; a mesh whose
 * vertices stretch the art the band lies in reads the stretched band, which is
 * what it draws. Draw order does not enter: a cell is covered or bare whichever
 * piece is in front.
 *
 * Pure: no clock, no randomness, no runtime. The pieces, the attachments and the
 * rest table are handed in by whichever poser drew the frames.
 */

import type { Plate } from '../tools/plate.ts';
import { indexRuns } from './folds.ts';
import { DRAWN_ALPHA, drawnCells, drawsAt, sameVertices, texelSize } from './passthrough.ts';
import { type AttachmentPose, type AttachmentRest, type Piece, projector, rasterisePiece, type Viewport } from './render_shared.ts';

/** The reading's file name inside an animation's frame directory, and its format tag. */
export const SEAM_FILE = 'seam.json';
export const SEAM_SPEC = 'rigc-seam/1';

/** One pair as the flag names it. Reversing it preserves the union and exchanges the ghost owners. */
export interface SeamPair {
  a: string;
  b: string;
}

/** A malformed `--seam` value, or a pair the poses cannot be read for — said by name. */
export class SeamError extends Error {}

/**
 * `--seam`'s value — `<slot>:<slot>[,<slot>:<slot>…]` — read against the
 * skeleton's slots, or refused naming the entry: an empty entry, one without
 * exactly one `:`, an empty name, a slot the skeleton does not have (with the
 * slots it does), a slot paired with itself (a seam is between two drawings), and
 * a pair named twice in either order (the reading is symmetric, so `b:a` is the
 * pair `a:b` again).
 */
export function readSeamPairs(raw: string, slots: readonly string[]): SeamPair[] {
  const form = '<slot>:<slot>[,<slot>:<slot>…]';
  const pairs: SeamPair[] = [];
  const entries = raw.split(',');
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i].trim();
    if (entry === '') throw new SeamError(`--seam ${JSON.stringify(raw)}: entry ${i} is empty — it takes ${form}`);
    const parts = entry.split(':');
    if (parts.length !== 2) throw new SeamError(`--seam: entry ${i} ${JSON.stringify(entry)} has ${parts.length - 1} ":" — it takes ${form}, one ":" per pair`);
    const [a, b] = parts.map((p) => p.trim());
    for (const [role, name] of [['first', a], ['second', b]] as const) {
      if (name === '') throw new SeamError(`--seam: entry ${i} ${JSON.stringify(entry)} names no ${role} slot — it takes ${form}`);
      if (!slots.includes(name)) throw new SeamError(`--seam: entry ${i} names slot ${JSON.stringify(name)}, which this skeleton does not have; its slots are [${slots.join(', ')}]`);
    }
    if (a === b) throw new SeamError(`--seam: entry ${i} pairs slot "${a}" with itself — a seam is between two slots' drawings`);
    const again = pairs.findIndex((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a));
    if (again >= 0) throw new SeamError(`--seam: entry ${i} names "${a}:${b}" again — entry ${again} already reads "${pairs[again].a}:${pairs[again].b}", and the reading is the same both ways`);
    pairs.push({ a, b });
  }
  return pairs;
}

/** One sampled frame: its index, its time, the pieces it draws, and every slot's whole attachment. */
export interface SeamFrame {
  index: number;
  time: number;
  pieces: readonly Piece[];
  attachments: readonly AttachmentPose[];
}

/** A world box `[minX, minY, maxX, maxY]`, world units, y up. */
export type SeamBox = [number, number, number, number];

/** What one frame reads of one kind. */
export interface SeamHit {
  index: number;
  /** Seconds. */
  time: number;
  /** Cells counted: one cell is one texel of the coarser drawing at the setup pose. */
  px: number;
  /** The cell's side, world units. */
  cell: number;
  /** `px × cell²`, world units². */
  area: number;
  /** The counted cells' whole squares, world units, y up. */
  box: SeamBox;
}

/** A run of consecutive frames of one kind — first and last frame, their times, the most cells on any of them. */
export interface SeamSpan {
  frames: [number, number];
  /** Seconds. */
  times: [number, number];
  maxPx: number;
}

/** One kind over one frame set. */
export interface SeamKindReading {
  /** Every frame with a cell of this kind, in frame order; empty when none has. */
  frames: SeamHit[];
  /** `frames` as runs of consecutive frame indices. */
  spans: SeamSpan[];
  /** The frame with the most cells — the earliest on a tie — or `null` when none has any. */
  worst: SeamHit | null;
}

/** One pair's reading over one frame set. */
export interface SeamPairReading {
  a: string;
  b: string;
  /** Frames on which both slots draw. */
  drawn: number;
  /** Of those, frames whose two drawings overlap at the setup pose — the frames read. */
  banded: number;
  /** `skip` when no frame is read: nothing to measure, which is not a pass. */
  status: 'read' | 'skip';
  /** Every frame with a gap or a ghost, ascending. */
  opens: number[];
  /** The most cells of either kind on any frame; 0 when none opens. */
  maxPx: number;
  gap: SeamKindReading;
  ghost: SeamKindReading;
  /** Ghost cells drawn by `a` only; together with ghostB, an exact partition of ghost. */
  ghostA: SeamKindReading;
  /** Ghost cells drawn by `b` only. Ownership is the flag's order, not draw order. */
  ghostB: SeamKindReading;
  /** Gap cells whose skeleton composite has no rendered alpha at the cell centre. */
  gapOpen: SeamKindReading;
  /** Gap cells whose skeleton composite has positive rendered alpha, even below half opacity. */
  gapCovered: SeamKindReading;
}

/** `seam.json`: one frame set's reading, every pair the flag names, in the flag's order. */
export interface SeamFile {
  spec: typeof SEAM_SPEC;
  /** The animation, or `null` for a skeleton with none (its one frame is the setup pose). */
  animation: string | null;
  skin?: string;
  fps: number;
  /** What the numbers mean, stated in the file so a reader does not need this module. */
  reading: { read: string; cell: string; drawn: string; band: string; carried: string; gap: string; ghost: string; box: string; status: string; ghostA: string; ghostB: string; gapOpen: string; gapCovered: string };
  pairs: SeamPairReading[];
}

/** Hit, miss and live-entry counters for `seamsOf`'s single-entry `readFrame` cache controls. */
export interface SeamCacheStats {
  hits: number;
  misses: number;
  maxEntries: number;
}

/** Opaque holder used only by the `cross-call` negative control in `selftest.ts`. */
export interface SeamCrossCallSlot {
  entry: CachedFrameRead | null;
}

/**
 * A planted defect, for the suite's mutants only (`SE` controls in
 * `selftest.ts`). Production passes none.
 */
export interface SeamPlant {
  /** Compare the frame with the setup pose in the world, carrying nothing back. */
  world?: boolean;
  /** Read gap cells anywhere on the grid, not only inside the band's hull. */
  noHull?: boolean;
  /** Count a gap cell only when BOTH pieces' views find it drawn at the setup pose, rather than either. */
  bothViews?: boolean;
  /** Count a ghost cell wherever a piece draws what its partner's view had none of, not only from the band. */
  ghostAnyArt?: boolean;
  /** Attribute every ghost to a, regardless of which piece draws it. */
  ghostOnlyA?: boolean;
  /** Wrong composite readings: half opacity, only the pair, or every gap forced to one kind. */
  gapCoverage?: 'half' | 'pair' | 'open' | 'covered';
  /** Report a pair with no band as read, rather than as a SKIP. */
  skipAsRead?: boolean;
  /** Count nothing. */
  never?: boolean;
  /** Disable `readFrame` reuse or plant a defective cache key/retention mode (`SE30`–`SE33`). */
  cacheKey?: 'off' | 'rest-only' | 'unbounded' | 'cross-call';
  /** Shared slot for the `cross-call` negative control (`SE31`). */
  crossCallSlot?: SeamCrossCallSlot;
  /** Skip reading a frame index (`SE32`). */
  skipFrame?: number;
  /** Skip reading a `"<a>:<b>"` pair (`SE32`). */
  skipPair?: string;
  /** Record cache hits, misses and maximum live entries (`SE30`–`SE33`). */
  cacheStats?: SeamCacheStats;
}

/** Twice the signed area of (a, b, c), each a point index into `xy`. */
function cross(xy: ArrayLike<number>, a: number, b: number, c: number): number {
  return (xy[2 * b] - xy[2 * a]) * (xy[2 * c + 1] - xy[2 * a + 1]) - (xy[2 * c] - xy[2 * a]) * (xy[2 * b + 1] - xy[2 * a + 1]);
}

/** Twice the signed area of (a, b, q), a and b point indices into `xy`, q a point. */
function crossAt(xy: ArrayLike<number>, a: number, b: number, qx: number, qy: number): number {
  return (xy[2 * b] - xy[2 * a]) * (qy - xy[2 * a + 1]) - (qx - xy[2 * a]) * (xy[2 * b + 1] - xy[2 * a + 1]);
}

/** The world grid one frame of one pair is read on. */
interface Grid {
  viewport: Viewport;
  cell: number;
}

const centreX = (g: Grid, px: number): number => g.viewport.minX + (px + 0.5) * g.cell;
const centreY = (g: Grid, py: number): number => g.viewport.maxY - (py + 0.5) * g.cell;

/**
 * For every cell of `grid`, the lowest-index triangle of `triangles` over `xy`
 * holding the cell's centre (on an edge counts), or -1. A triangle with no area
 * holds nothing.
 */
function triangleIds(triangles: readonly number[], xy: ArrayLike<number>, grid: Grid): Int32Array {
  const { width, height, minX, maxY } = grid.viewport;
  const ids = new Int32Array(width * height).fill(-1);
  for (let t = 0; 3 * t + 2 < triangles.length; t++) {
    const [a, b, c] = [triangles[3 * t], triangles[3 * t + 1], triangles[3 * t + 2]];
    const area = cross(xy, a, b, c);
    if (area === 0) continue;
    const xs = [xy[2 * a], xy[2 * b], xy[2 * c]];
    const ys = [xy[2 * a + 1], xy[2 * b + 1], xy[2 * c + 1]];
    const px0 = Math.max(0, Math.floor((Math.min(...xs) - minX) / grid.cell));
    const px1 = Math.min(width - 1, Math.floor((Math.max(...xs) - minX) / grid.cell));
    const py0 = Math.max(0, Math.floor((maxY - Math.max(...ys)) / grid.cell));
    const py1 = Math.min(height - 1, Math.floor((maxY - Math.min(...ys)) / grid.cell));
    for (let py = py0; py <= py1; py++) {
      for (let px = px0; px <= px1; px++) {
        const k = py * width + px;
        if (ids[k] >= 0) continue;
        const qx = centreX(grid, px);
        const qy = centreY(grid, py);
        const s = [crossAt(xy, a, b, qx, qy), crossAt(xy, b, c, qx, qy), crossAt(xy, c, a, qx, qy)];
        if (area > 0 ? s.every((v) => v >= 0) : s.every((v) => v <= 0)) ids[k] = t;
      }
    }
  }
  return ids;
}

/** The barycentric weights of (qx, qy) in triangle `t` over `xy`, or `null` when it has no area. */
function weightsIn(triangles: readonly number[], xy: ArrayLike<number>, t: number, qx: number, qy: number): [number, number, number] | null {
  const [a, b, c] = [triangles[3 * t], triangles[3 * t + 1], triangles[3 * t + 2]];
  const area = cross(xy, a, b, c);
  if (area === 0) return null;
  return [crossAt(xy, b, c, qx, qy) / area, crossAt(xy, c, a, qx, qy) / area, crossAt(xy, a, b, qx, qy) / area];
}

/**
 * Carry the point (qx, qy) from `from` to `to` — the same vertices in two poses —
 * by the affine map of the `from` triangle `id` names, or, when `id` is -1, of
 * the triangle the point is least outside of (the largest smallest weight, the
 * lowest index on a tie). `null` when every triangle has collapsed in `from`.
 */
export function carry(triangles: readonly number[], from: ArrayLike<number>, to: ArrayLike<number>, id: number, qx: number, qy: number): [number, number] | null {
  let best = id;
  let w = id >= 0 ? weightsIn(triangles, from, id, qx, qy) : null;
  if (w === null) {
    best = -1;
    let most = -Infinity;
    for (let t = 0; 3 * t + 2 < triangles.length; t++) {
      const k = weightsIn(triangles, from, t, qx, qy);
      if (k === null) continue;
      const least = Math.min(k[0], k[1], k[2]);
      if (least > most) {
        most = least;
        best = t;
        w = k;
      }
    }
  }
  if (w === null || best < 0) return null;
  const [a, b, c] = [triangles[3 * best], triangles[3 * best + 1], triangles[3 * best + 2]];
  // #1568: stationary and translated pieces must carry without barycentric round-trip drift.
  const dxa = to[2 * a] - from[2 * a], dya = to[2 * a + 1] - from[2 * a + 1];
  const dxb = to[2 * b] - from[2 * b], dyb = to[2 * b + 1] - from[2 * b + 1];
  const dxc = to[2 * c] - from[2 * c], dyc = to[2 * c + 1] - from[2 * c + 1];
  return [qx + dxc + w[0] * (dxa - dxc) + w[1] * (dxb - dxc), qy + dyc + w[0] * (dya - dyc) + w[1] * (dyb - dyc)];
}

/** The convex hull of `points`, counter-clockwise, collinear points dropped (Andrew's monotone chain). */
function hullOf(points: Array<[number, number]>): Array<[number, number]> {
  const sorted = [...points].sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const turn = (o: [number, number], a: [number, number], b: [number, number]): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: Array<[number, number]>): Array<[number, number]> => {
    const out: Array<[number, number]> = [];
    for (const p of list) {
      while (out.length >= 2 && turn(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    return out;
  };
  if (sorted.length <= 1) return sorted;
  const lower = half(sorted);
  const upper = half([...sorted].reverse());
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Whether (qx, qy) is inside or on the counter-clockwise hull `h`; a hull of one point or two holds the point or the segment. */
function inHull(h: ReadonlyArray<[number, number]>, qx: number, qy: number): boolean {
  if (h.length === 0) return false;
  if (h.length === 1) return h[0][0] === qx && h[0][1] === qy;
  if (h.length === 2) {
    const [[x0, y0], [x1, y1]] = h;
    if ((x1 - x0) * (qy - y0) - (qx - x0) * (y1 - y0) !== 0) return false;
    return qx >= Math.min(x0, x1) && qx <= Math.max(x0, x1) && qy >= Math.min(y0, y1) && qy <= Math.max(y0, y1);
  }
  for (let i = 0; i < h.length; i++) {
    const [x0, y0] = h[i];
    const [x1, y1] = h[(i + 1) % h.length];
    if ((x1 - x0) * (qy - y0) - (qx - x0) * (y1 - y0) < 0) return false;
  }
  return true;
}

/** One side of the pair at one frame: its piece as drawn, its setup-pose vertices, its triangles and its page. */
interface Side {
  piece: Piece;
  rest: readonly number[];
  triangles: readonly number[];
  page: Plate;
}

/** The cells counted of one kind on one frame, before they become a hit. */
interface Cells {
  px: number;
  box: SeamBox | null;
}

const restPiece = (side: Side): Piece => ({ ...side.piece, world: Array.from(side.rest) });

/**
 * Positive alpha of the transparent skeleton composite, on the pair's cell grid.
 * The renderer emits rounded alpha bytes through this same traversal, including
 * tint, UV windows and already-clipped pieces. Source-over cannot erase positive
 * alpha: OR of positive emissions is exactly composite alpha > 0. No background
 * enters, and the pair's half-opacity outline is not this test.
 */
function frameAlphaCells(pieces: readonly Piece[], pages: ReadonlyMap<string, Plate>, viewport: Viewport, half: boolean): Uint8Array {
  const cells = new Uint8Array(viewport.width * viewport.height);
  const project = projector(viewport);
  for (const piece of pieces) {
    const page = pages.get(piece.page);
    if (page === undefined) throw new SeamError(`slot "${piece.slot}" samples atlas page "${piece.page}", which is not among [${[...pages.keys()].join(', ')}]`);
    rasterisePiece(page, piece, project, viewport, (x, y, _r, _g, _b, alpha) => {
      if (half ? alpha >= DRAWN_ALPHA : alpha > 0) cells[y * viewport.width + x] = 1;
    });
  }
  return cells;
}

/** One frame's counts, or `null` when the two drawings share no cell at the setup pose. See the module comment. */
function readFrame(A: Side, B: Side, cell: number, plant: SeamPlant, frame: SeamFrame, pages: ReadonlyMap<string, Plate>): { gap: Cells; ghost: Cells; ghostA: Cells; ghostB: Cells; gapOpen: Cells; gapCovered: Cells } | null {
  // One grid over both drawings at the setup pose and at the frame, on multiples of the cell from the world origin.
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const xy of [A.rest, B.rest, A.piece.world, B.piece.world]) {
    for (let i = 0; i + 1 < xy.length; i += 2) {
      x0 = Math.min(x0, xy[i]);
      y0 = Math.min(y0, xy[i + 1]);
      x1 = Math.max(x1, xy[i]);
      y1 = Math.max(y1, xy[i + 1]);
    }
  }
  const minX = (Math.floor(x0 / cell) - 1) * cell;
  const maxY = (Math.ceil(y1 / cell) + 1) * cell;
  const width = Math.ceil((x1 - minX) / cell) + 1;
  const height = Math.ceil((maxY - y0) / cell) + 1;
  const grid: Grid = { viewport: { minX, minY: maxY - height * cell, maxX: minX + width * cell, maxY, scale: 1 / cell, width, height }, cell };
  const restA = restPiece(A);
  const restB = restPiece(B);
  const bandA = drawnCells(restA, A.page, grid.viewport);
  const bandB = drawnCells(restB, B.page, grid.viewport);
  // The band: both drawings at the setup pose. Carried to the frame by each piece, its centres span the joint's hull.
  const restIdsA = triangleIds(A.triangles, A.rest, grid);
  const restIdsB = triangleIds(B.triangles, B.rest, grid);
  const carried: Array<[number, number]> = [];
  let band = 0;
  let [bx0, by0, bx1, by1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const k = py * width + px;
      if (bandA[k] === 0 || bandB[k] === 0) continue;
      band++;
      const qx = centreX(grid, px);
      const qy = centreY(grid, py);
      [bx0, by0, bx1, by1] = [Math.min(bx0, qx), Math.min(by0, qy), Math.max(bx1, qx), Math.max(by1, qy)];
      for (const [side, ids] of [[A, restIdsA], [B, restIdsB]] as const) {
        const p = plant.world ? ([qx, qy] as [number, number]) : carry(side.triangles, side.rest, side.piece.world, ids[k], qx, qy);
        if (p !== null) carried.push(p);
      }
    }
  }
  if (band === 0) return null;
  const hull = hullOf(carried);
  const drawnA = drawnCells(A.piece, A.page, grid.viewport);
  const drawnB = drawnCells(B.piece, B.page, grid.viewport);
  const posedIdsA = triangleIds(A.triangles, A.piece.world, grid);
  const posedIdsB = triangleIds(B.triangles, B.piece.world, grid);
  // A frame point carried back into a side's setup pose.
  const back = (side: Side, ids: Int32Array, k: number, qx: number, qy: number): [number, number] | null =>
    plant.world ? [qx, qy] : carry(side.triangles, side.piece.world, side.rest, ids[k], qx, qy);
  const drawnAtRest = (p: [number, number] | null, which: Piece, page: Plate): boolean => p !== null && drawsAt(which, page, p[0], p[1], cell);
  const composite = (p: [number, number] | null): boolean => drawnAtRest(p, restA, A.page) || drawnAtRest(p, restB, B.page);
  const gap: Cells = { px: 0, box: null };
  const ghost: Cells = { px: 0, box: null };
  const ghostA: Cells = { px: 0, box: null };
  const ghostB: Cells = { px: 0, box: null };
  const gapOpen: Cells = { px: 0, box: null };
  const gapCovered: Cells = { px: 0, box: null };
  let alphaCells: Uint8Array | null = null;
  const take = (into: Cells, qx: number, qy: number): void => {
    into.px++;
    const h = cell / 2;
    into.box ??= [Infinity, Infinity, -Infinity, -Infinity];
    into.box[0] = Math.min(into.box[0], qx - h);
    into.box[1] = Math.min(into.box[1], qy - h);
    into.box[2] = Math.max(into.box[2], qx + h);
    into.box[3] = Math.max(into.box[3], qy + h);
  };
  if (plant.never) return { gap, ghost, ghostA, ghostB, gapOpen, gapCovered };
  const inBand = (p: [number, number] | null): boolean => p !== null && p[0] >= bx0 - cell / 2 && p[0] <= bx1 + cell / 2 && p[1] >= by0 - cell / 2 && p[1] <= by1 + cell / 2;
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const k = py * width + px;
      const qx = centreX(grid, px);
      const qy = centreY(grid, py);
      const a = drawnA[k] !== 0;
      const b = drawnB[k] !== 0;
      if (!a && !b) {
        if (!plant.noHull && !inHull(hull, qx, qy)) continue;
        const fromA = composite(back(A, posedIdsA, k, qx, qy));
        const fromB = composite(back(B, posedIdsB, k, qx, qy));
        if (plant.bothViews ? fromA && fromB : fromA || fromB) {
          take(gap, qx, qy);
          const covered = plant.gapCoverage === 'covered' || (plant.gapCoverage !== 'open' &&
            (alphaCells ??= frameAlphaCells(plant.gapCoverage === 'pair' ? [A.piece, B.piece] : frame.pieces, pages, grid.viewport, plant.gapCoverage === 'half'))[k] !== 0);
          take(covered ? gapCovered : gapOpen, qx, qy);
        }
        continue;
      }
      if (a && b) continue;
      // One piece draws the cell and its partner does not.
      const [mine, myIds, myRest, other, otherIds] = a ? [A, posedIdsA, restA, B, posedIdsB] : [B, posedIdsB, restB, A, posedIdsA];
      const otherRest = a ? restB : restA;
      const p = back(mine, myIds, k, qx, qy);
      if (!plant.ghostAnyArt && !(inBand(p) && drawnAtRest(p, myRest, mine.page) && drawnAtRest(p, otherRest, other.page))) continue;
      if (!composite(back(other, otherIds, k, qx, qy))) {
        take(ghost, qx, qy);
        take(a || plant.ghostOnlyA ? ghostA : ghostB, qx, qy);
      }
    }
  }
  return { gap, ghost, ghostA, ghostB, gapOpen, gapCovered };
}

interface FrameRead {
  gap: Cells;
  ghost: Cells;
  ghostA: Cells;
  ghostB: Cells;
  gapOpen: Cells;
  gapCovered: Cells;
}

interface PieceSnapshot {
  kind: Piece['kind'];
  slot: string;
  page: string;
  world: number[];
  uvs: number[];
  tint: [number, number, number, number];
  dark: [number, number, number] | undefined;
  uvWindow: { u0: number; v0: number; u1: number; v1: number } | undefined;
  triangles: number[] | undefined;
  source: { world: number[]; uvs: number[] } | undefined;
}

interface SideSnapshot {
  piece: PieceSnapshot;
  rest: number[];
  triangles: number[];
  page: Plate;
  pageWidth: number;
  pageHeight: number;
  pageData: Uint8Array;
  pageByteLength: number;
}

interface FramePieceSnapshot {
  piece: PieceSnapshot;
  page: Plate | undefined;
  pageWidth: number;
  pageHeight: number;
  pageData: Uint8Array | undefined;
  pageByteLength: number;
}

/** One single-entry exact-input `readFrame` snapshot scoped to one `seamsOf` call. */
export interface CachedFrameRead {
  a: string;
  b: string;
  cell: number;
  plant: SeamPlant;
  A: SideSnapshot;
  B: SideSnapshot;
  framePieces: FramePieceSnapshot[] | null;
  read: FrameRead | null;
}

function sameNumbers(a: ArrayLike<number>, b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!Object.is(a[i], b[i])) return false;
  }
  return true;
}

function sameOptionalNumbers(a: ArrayLike<number> | undefined, b: readonly number[] | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return sameNumbers(a, b);
}

function sameUvWindow(
  a: { u0: number; v0: number; u1: number; v1: number } | undefined,
  b: { u0: number; v0: number; u1: number; v1: number } | undefined,
): boolean {
  if (a === undefined || b === undefined) return a === b;
  return Object.is(a.u0, b.u0) && Object.is(a.v0, b.v0) && Object.is(a.u1, b.u1) && Object.is(a.v1, b.v1);
}

function sameClipSource(
  a: { world: number[]; uvs: number[] } | undefined,
  b: { world: number[]; uvs: number[] } | undefined,
): boolean {
  if (a === undefined || b === undefined) return a === b;
  return sameNumbers(a.world, b.world) && sameNumbers(a.uvs, b.uvs);
}

function snapshotPiece(piece: Piece): PieceSnapshot {
  return {
    kind: piece.kind,
    slot: piece.slot,
    page: piece.page,
    world: Array.from(piece.world),
    uvs: Array.from(piece.uvs),
    tint: [piece.tint[0], piece.tint[1], piece.tint[2], piece.tint[3]],
    dark: piece.dark === undefined ? undefined : [piece.dark[0], piece.dark[1], piece.dark[2]],
    uvWindow:
      piece.uvWindow === undefined
        ? undefined
        : { u0: piece.uvWindow.u0, v0: piece.uvWindow.v0, u1: piece.uvWindow.u1, v1: piece.uvWindow.v1 },
    triangles: piece.kind === 'mesh' ? Array.from(piece.triangles) : undefined,
    source:
      piece.kind === 'mesh' && piece.source !== undefined
        ? { world: Array.from(piece.source.world), uvs: Array.from(piece.source.uvs) }
        : undefined,
  };
}

function samePiece(piece: Piece, snap: PieceSnapshot, ignorePosed: boolean): boolean {
  if (piece.kind !== snap.kind || piece.slot !== snap.slot || piece.page !== snap.page) return false;
  if (ignorePosed) return true;
  if (!sameNumbers(piece.uvs, snap.uvs)) return false;
  if (piece.kind === 'mesh') {
    if (snap.triangles === undefined || !sameNumbers(piece.triangles, snap.triangles)) return false;
    if (!sameClipSource(piece.source, snap.source)) return false;
  } else if (snap.triangles !== undefined || snap.source !== undefined) {
    return false;
  }
  if (!sameNumbers(piece.world, snap.world)) return false;
  if (!sameNumbers(piece.tint, snap.tint)) return false;
  if (!sameOptionalNumbers(piece.dark, snap.dark)) return false;
  if (!sameUvWindow(piece.uvWindow, snap.uvWindow)) return false;
  return true;
}

function snapshotSide(side: Side): SideSnapshot {
  return {
    piece: snapshotPiece(side.piece),
    rest: Array.from(side.rest),
    triangles: Array.from(side.triangles),
    page: side.page,
    pageWidth: side.page.width,
    pageHeight: side.page.height,
    pageData: side.page.data,
    pageByteLength: side.page.data.byteLength,
  };
}

function sameSide(side: Side, snap: SideSnapshot, mode: SeamPlant['cacheKey']): boolean {
  if (mode === 'cross-call') {
    return sameNumbers(side.piece.world, snap.piece.world);
  }
  if (
    side.page !== snap.page ||
    side.page.width !== snap.pageWidth ||
    side.page.height !== snap.pageHeight ||
    side.page.data !== snap.pageData ||
    side.page.data.byteLength !== snap.pageByteLength
  ) {
    return false;
  }
  if (!sameNumbers(side.rest, snap.rest) || !sameNumbers(side.triangles, snap.triangles)) return false;
  return samePiece(side.piece, snap.piece, mode === 'rest-only');
}

function snapshotFramePieces(pieces: readonly Piece[], pages: ReadonlyMap<string, Plate>): FramePieceSnapshot[] {
  return pieces.map((piece) => {
    const page = pages.get(piece.page);
    return {
      piece: snapshotPiece(piece),
      page,
      pageWidth: page?.width ?? 0,
      pageHeight: page?.height ?? 0,
      pageData: page?.data,
      pageByteLength: page?.data.byteLength ?? 0,
    };
  });
}

function sameFramePieces(
  pieces: readonly Piece[],
  pages: ReadonlyMap<string, Plate>,
  snaps: readonly FramePieceSnapshot[],
): boolean {
  if (pieces.length !== snaps.length) return false;
  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i];
    const snap = snaps[i];
    const page = pages.get(piece.page);
    if (
      page !== snap.page ||
      (page?.width ?? 0) !== snap.pageWidth ||
      (page?.height ?? 0) !== snap.pageHeight ||
      page?.data !== snap.pageData ||
      (page?.data.byteLength ?? 0) !== snap.pageByteLength
    ) {
      return false;
    }
    if (!samePiece(piece, snap.piece, false)) return false;
  }
  return true;
}

function samePlant(a: SeamPlant, b: SeamPlant): boolean {
  return (
    a.world === b.world &&
    a.noHull === b.noHull &&
    a.bothViews === b.bothViews &&
    a.ghostAnyArt === b.ghostAnyArt &&
    a.ghostOnlyA === b.ghostOnlyA &&
    a.gapCoverage === b.gapCoverage &&
    a.skipAsRead === b.skipAsRead &&
    a.never === b.never &&
    a.cacheKey === b.cacheKey &&
    a.skipFrame === b.skipFrame &&
    a.skipPair === b.skipPair
  );
}

function needsFramePieces(read: FrameRead | null, plant: SeamPlant): boolean {
  return (
    read !== null &&
    read.gap.px > 0 &&
    plant.gapCoverage !== 'covered' &&
    plant.gapCoverage !== 'open' &&
    plant.gapCoverage !== 'pair'
  );
}

function cloneCells(c: Cells): Cells {
  return { px: c.px, box: c.box === null ? null : [c.box[0], c.box[1], c.box[2], c.box[3]] };
}

function cloneFrameRead(r: FrameRead | null): FrameRead | null {
  if (r === null) return null;
  return {
    gap: cloneCells(r.gap),
    ghost: cloneCells(r.ghost),
    ghostA: cloneCells(r.ghostA),
    ghostB: cloneCells(r.ghostB),
    gapOpen: cloneCells(r.gapOpen),
    gapCovered: cloneCells(r.gapCovered),
  };
}

function snapshotCachedFrameRead(
  a: string,
  b: string,
  A: Side,
  B: Side,
  cell: number,
  plant: SeamPlant,
  pieces: readonly Piece[],
  pages: ReadonlyMap<string, Plate>,
  read: FrameRead | null,
): CachedFrameRead {
  return {
    a,
    b,
    cell,
    plant: { ...plant },
    A: snapshotSide(A),
    B: snapshotSide(B),
    framePieces: needsFramePieces(read, plant) ? snapshotFramePieces(pieces, pages) : null,
    read: cloneFrameRead(read),
  };
}

function matchesCachedFrameRead(
  entry: CachedFrameRead,
  a: string,
  b: string,
  A: Side,
  B: Side,
  cell: number,
  plant: SeamPlant,
  pieces: readonly Piece[],
  pages: ReadonlyMap<string, Plate>,
): boolean {
  if (entry.a !== a || entry.b !== b) return false;
  if (!Object.is(cell, entry.cell) || !samePlant(plant, entry.plant)) return false;
  const mode = plant.cacheKey;
  if (!sameSide(A, entry.A, mode) || !sameSide(B, entry.B, mode)) return false;
  if (mode !== 'rest-only' && mode !== 'cross-call' && entry.framePieces !== null) {
    if (!sameFramePieces(pieces, pages, entry.framePieces)) return false;
  }
  return true;
}

const restKey = (slot: string, attachment: string): string => `${slot}\u0000${attachment}`;

/** `frames` as spans of consecutive indices, each with its first and last time and its most cells. */
function spansOf(frames: readonly SeamHit[]): SeamSpan[] {
  const spans: SeamSpan[] = [];
  for (const f of frames) {
    const last = spans[spans.length - 1];
    if (last !== undefined && last.frames[1] === f.index - 1) {
      last.frames[1] = f.index;
      last.times[1] = f.time;
      last.maxPx = Math.max(last.maxPx, f.px);
    } else spans.push({ frames: [f.index, f.index], times: [f.time, f.time], maxPx: f.px });
  }
  return spans;
}

function kindOf(frames: SeamHit[]): SeamKindReading {
  let worst: SeamHit | null = null;
  for (const f of frames) if (worst === null || f.px > worst.px) worst = f;
  return { frames, spans: spansOf(frames), worst };
}

/**
 * Every pair's reading over one frame set: `rest` the rest table, `frames` the
 * frames as the sampler returned them (pieces in draw order, attachments whole),
 * `pages` the atlas pages the pieces sample. Refused by name: a slot a clip cuts
 * at a frame, whose drawing is no longer its attachment's, and a drawing with no
 * area at its setup pose, which has no texel to grid by.
 */
export function seamsOf(
  pairs: readonly SeamPair[],
  rest: readonly AttachmentRest[],
  frames: readonly SeamFrame[],
  pages: ReadonlyMap<string, Plate>,
  plant: SeamPlant = {},
): SeamPairReading[] {
  const restOf = new Map(rest.map((r) => [restKey(r.slot, r.attachment), r]));
  const sideOf = (frame: SeamFrame, slot: string): Side | null => {
    const piece = frame.pieces.find((p) => p.slot === slot);
    if (piece === undefined) return null;
    const pose = frame.attachments.find((p) => p.slot === slot);
    if (pose === undefined) throw new SeamError(`frame ${frame.index}: slot "${slot}" draws, and the frame records no attachment for it`);
    if (!sameVertices(piece.world, pose.vertices)) {
      throw new SeamError(`frame ${frame.index}: a clip cuts slot "${slot}" (attachment "${pose.attachment}"), so its drawing is no longer its attachment's and cannot be carried back to its setup pose`);
    }
    const entry = restOf.get(restKey(slot, pose.attachment));
    if (entry === undefined) throw new SeamError(`frame ${frame.index}: the rest table has no entry for slot "${slot}" attachment "${pose.attachment}"`);
    const page = pages.get(piece.page);
    if (page === undefined) throw new SeamError(`slot "${slot}" samples atlas page "${piece.page}", which is not among [${[...pages.keys()].join(', ')}]`);
    return { piece, rest: entry.vertices, triangles: entry.triangles, page };
  };
  // Issue #1574: single-entry exact-input readFrame reuse scoped to one seamsOf call (local variable, never module state).
  let cached: CachedFrameRead | null = plant.cacheKey === 'cross-call' ? (plant.crossCallSlot?.entry ?? null) : null;
  const unbounded: CachedFrameRead[] = [];
  const stats = plant.cacheStats;
  const activePairs = plant.skipPair === undefined ? pairs : pairs.filter(({ a, b }) => `${a}:${b}` !== plant.skipPair);
  return activePairs.map(({ a, b }) => {
    if (plant.cacheKey !== 'unbounded' && plant.cacheKey !== 'cross-call') cached = null;
    let drawn = 0;
    let banded = 0;
    const gaps: SeamHit[] = [];
    const ghosts: SeamHit[] = [];
    const ghostsA: SeamHit[] = [];
    const ghostsB: SeamHit[] = [];
    const openGaps: SeamHit[] = [];
    const coveredGaps: SeamHit[] = [];
    for (const frame of frames) {
      if (plant.skipFrame !== undefined && frame.index === plant.skipFrame) continue;
      const A = sideOf(frame, a);
      const B = sideOf(frame, b);
      if (A === null || B === null) {
        if (plant.cacheKey !== 'unbounded' && plant.cacheKey !== 'cross-call') cached = null;
        continue;
      }
      drawn++;
      const cellA = texelSize(A.piece, A.rest, A.page);
      const cellB = texelSize(B.piece, B.rest, B.page);
      const flat = cellA === null ? a : cellB === null ? b : null;
      if (cellA === null || cellB === null) throw new SeamError(`frame ${frame.index}: slot "${flat}" draws no area at its setup pose, so it has no texel to grid the seam by`);
      const cell = Math.max(cellA, cellB);
      let read: FrameRead | null;
      if (plant.cacheKey === 'off') {
        if (stats !== undefined) stats.misses++;
        read = readFrame(A, B, cell, plant, frame, pages);
      } else if (plant.cacheKey === 'unbounded') {
        const hit = unbounded.find((entry) => matchesCachedFrameRead(entry, a, b, A, B, cell, plant, frame.pieces, pages));
        if (hit !== undefined) {
          if (stats !== undefined) stats.hits++;
          read = cloneFrameRead(hit.read);
        } else {
          if (stats !== undefined) stats.misses++;
          read = readFrame(A, B, cell, plant, frame, pages);
          unbounded.push(snapshotCachedFrameRead(a, b, A, B, cell, plant, frame.pieces, pages, read));
          if (stats !== undefined) stats.maxEntries = Math.max(stats.maxEntries, unbounded.length);
        }
      } else if (cached !== null && matchesCachedFrameRead(cached, a, b, A, B, cell, plant, frame.pieces, pages)) {
        if (stats !== undefined) stats.hits++;
        read = cloneFrameRead(cached.read);
      } else {
        if (stats !== undefined) stats.misses++;
        read = readFrame(A, B, cell, plant, frame, pages);
        cached = snapshotCachedFrameRead(a, b, A, B, cell, plant, frame.pieces, pages, read);
        if (plant.cacheKey === 'cross-call' && plant.crossCallSlot !== undefined) plant.crossCallSlot.entry = cached;
        if (stats !== undefined) stats.maxEntries = Math.max(stats.maxEntries, 1);
      }
      if (read === null) continue;
      banded++;
      for (const [cells, into] of [[read.gap, gaps], [read.ghost, ghosts], [read.ghostA, ghostsA], [read.ghostB, ghostsB], [read.gapOpen, openGaps], [read.gapCovered, coveredGaps]] as const) {
        if (cells.px > 0 && cells.box !== null) into.push({ index: frame.index, time: frame.time, px: cells.px, cell, area: cells.px * cell * cell, box: cells.box });
      }
    }
    const gap = kindOf(gaps);
    const ghost = kindOf(ghosts);
    const opens = [...new Set([...gaps, ...ghosts].map((f) => f.index))].sort((x, y) => x - y);
    const maxPx = Math.max(0, ...gaps.map((f) => f.px), ...ghosts.map((f) => f.px));
    const status = banded === 0 && !plant.skipAsRead ? 'skip' : 'read';
    return { a, b, drawn, banded, status, opens, maxPx, gap, ghost, ghostA: kindOf(ghostsA), ghostB: kindOf(ghostsB), gapOpen: kindOf(openGaps), gapCovered: kindOf(coveredGaps) };
  });
}

/** What `seam.json` states its numbers mean — the one wording the file and the docs share. */
export const SEAM_READING: SeamFile['reading'] = {
  read: 'a frame is read when both slots draw and their two drawings share a cell at the setup pose (the band); draw order does not enter',
  cell: "every count is of cells one texel of the coarser of the two drawings at the setup pose (the rest table's vertices), in world units, on multiples of that texel from the world origin; px is a count of cells, cell the cell's side in world units, area px × cell² in world units²",
  drawn: `a cell is drawn by a piece when the renderer paints its centre at ${DRAWN_ALPHA} of 255 or more (half opacity) — the slot's art through its page, the frame's tint included, at the setup pose drawn at the same tint`,
  band: "the band is the cells both drawings draw at the setup pose — where the two were painted to overlap, dilated by nothing",
  carried:
    "a frame point is carried into a piece's setup pose by the affine map of the piece's triangle holding it as the frame poses it, or, outside the piece's mesh, of the triangle it is least outside of (the largest smallest barycentric weight, the lowest index on a tie); a band cell is carried to the frame the other way",
  gap: "a gap cell lies inside the convex hull of the band's cell centres carried to the frame by both pieces, is drawn by neither piece at the frame, and at least one piece, carrying it back, finds it drawn by either drawing at the setup pose",
  ghost: "a ghost cell is drawn at the frame by one piece and not the other; the drawing piece, carrying it back, lands it in the band, and the other piece, carrying it back, finds neither drawing there at the setup pose",
  box: "a frame's box is [minX, minY, maxX, maxY] in world units (y up) over the whole squares of that kind's counted cells",
  status: 'a pair is skip when no frame is read — the two never draw together, or never share a cell at the setup pose — which is nothing measured, not a seam that held',
  ghostA: 'the ghost cells drawn by a only, with the same frames, spans and worst shape as ghost; ghostA and ghostB partition ghost on every frame',
  ghostB: 'the ghost cells drawn by b only; a and b are the named pair order, not which piece is in front — reversing the pair exchanges ghostA and ghostB',
  gapOpen: 'the gap cells whose centre has alpha 0 in the transparent frame composite of every skeleton drawing, using the renderer on the same cell grid; gapOpen and gapCovered partition gap',
  gapCovered: 'the gap cells whose centre has positive rendered alpha from any skeleton drawing, including the pair; alpha 1..127 covers too — this is not the pair\'s half-opacity test, and no presentation background enters',
};

/** The file for one frame set. */
export function seamFileOf(animation: string | null, fps: number, skin: string | undefined, pairs: SeamPairReading[]): SeamFile {
  return { spec: SEAM_SPEC, animation, ...(skin === undefined ? {} : { skin }), fps, reading: SEAM_READING, pairs };
}

/** The file's text: two-space JSON and a newline, so one build and one request are one byte sequence. */
export function seamText(file: SeamFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

/** `x` rounded to hundredths away from the box's inside, so the printed box holds what the exact one does. */
const outward = (x: number, up: boolean): string => ((up ? Math.ceil(x * 100) : Math.floor(x * 100)) / 100).toFixed(2);

/** One kind's clause: `gap on N frame(s) [runs], worst frame i (t=…s): P px (A units² at C units a px) in world box …`, or `no gap`. */
function kindText(kind: 'gap' | 'ghost', reading: SeamKindReading): string {
  const w = reading.worst;
  if (w === null) return `no ${kind}`;
  const [x0, y0, x1, y1] = w.box;
  return (
    `${kind} on ${reading.frames.length} frame(s) [${indexRuns(reading.frames.map((f) => f.index))}], worst frame ${w.index} (t=${w.time.toFixed(4)}s): ` +
    `${w.px} px (${w.area.toFixed(2)} units² at ${w.cell.toFixed(4)} units a px) in world box x [${outward(x0, false)}, ${outward(x1, true)}] y [${outward(y0, false)}, ${outward(y1, true)}] ` +
    `(${(x1 - x0).toFixed(2)} × ${(y1 - y0).toFixed(2)})`
  );
}

/**
 * The line for one pair over one set — printed for every pair, so a pair that
 * stays closed says so, and a pair with nothing to read says SKIP and why.
 */
export function seamLine(animation: string | null, fps: number, pair: SeamPairReading): string {
  const where = animation === null ? 'the setup pose' : JSON.stringify(animation);
  const head = `${where}: seam "${pair.a}" | "${pair.b}"`;
  if (pair.drawn === 0) return `${head}: SKIP — the two slots draw together on no frame, so there is no seam to read`;
  if (pair.status === 'skip') return `${head}: SKIP — the two drawings share no cell at the setup pose on any of the ${pair.drawn} frame(s) both draw, so there is no band to read`;
  if (pair.opens.length === 0) return `${head} stays closed on all ${pair.banded} frame(s) read at ${fps} fps — no gap, no ghost`;
  return (
    `${head} opens on ${pair.opens.length} of ${pair.banded} frame(s) read [${indexRuns(pair.opens)}] at ${fps} fps, max ${pair.maxPx} px — ` +
    `${kindText('gap', pair.gap)}; ${kindText('ghost', pair.ghost)}`
  );
}
