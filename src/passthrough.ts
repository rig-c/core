/**
 * Where a cloth slot passes through a leg slot — the reading behind
 * `rigc render --pass-through <cloth>:<leg>[,…]` (issue #1413).
 *
 * ⭐ **A reading, not a gate**, as `--folds` is. A skirt drawn over a thigh can
 * swing its side straight through the thigh on a build that passes every
 * assertion and every check, and until this it was found by a person looking at
 * the right frame. A real skirt cannot do that while it is in front of the leg:
 * the leg is inside it and leaves through the hem. So this names the frames where
 * the cloth's drawn side lies inside the leg's drawn outline, and decides nothing.
 *
 * ## What "passes through" means here
 *
 * At a frame where both slots draw and the cloth slot draws **over** the leg slot
 * (the frame's own draw order, so a draw-order key is honoured — a leg drawn over
 * the cloth is not read at that frame):
 *
 * 1. **The cloth's rows are its setup pose's.** The cloth is drawn onto a grid in
 *    its own setup-pose geometry (the rest table's vertices: the setup pose's
 *    bones, no deform), at the frame's page UVs and tint. A cell is drawn when the
 *    renderer's own traversal (`rasterisePiece`) paints its centre at half
 *    opacity or more — the half-opacity line is where an antialiased edge sits.
 *    The cell is one texel of the cloth's drawing as the setup pose lays it out
 *    (`texelSize`), so the grid is the drawing's own resolution, not a number
 *    chosen here. Reading the rows in the setup pose's frame rather than the
 *    world's is what keeps a cloth swung or bent by the pose readable: its side
 *    is still its side. Read in world rows, a waist or hem the pose tilts becomes
 *    a "side" on the rows it spans, and a leg under it reads as passing through —
 *    measured on the suite's probe, where a 2.5° swing read a run of 16 off the
 *    tilted waist (`PX11`).
 * 2. **The hem's corner bounds the rows.** On each side, the corner is the
 *    outermost drawn cell in the lower half of the cloth's drawn rows, the lowest
 *    on a tie. Rows from the corner up to the cloth's top are read; rows below it
 *    are the hem's own curve, under which a leg is meant to show.
 * 3. **The run.** On a read row, from the centre of the outermost drawn cell as
 *    the frame poses it, step outward in **world units** — along the setup pose's
 *    outward direction carried to the frame by the affine map of the cloth
 *    triangle that holds that centre, normalised — one step at a time, and count
 *    the steps whose world point the leg's drawing covers at half opacity, until
 *    the first it does not. A step is one texel of the **coarser** of the two
 *    drawings at the setup pose, so the run is in the outlines' own resolution
 *    and in the units the picture shows. That count is how far the leg's outline
 *    passes the cloth's outline on that row, in steps.
 * 4. **A frame passes through** when some read row's run is more than one step
 *    (`PASS_THROUGH_RUN` = 2): one step is the resolution of the outlines themselves.
 *
 * ⚠️ The run is in world steps, not in the cloth's setup-pose cells, for a
 * reason that was measured (issue #1413). Stepped in setup cells, a cloth
 * squashed at a frame reads a longer run than the picture holds: the line
 * printed a depth in units over a box narrower than that depth. The rows are the
 * setup pose's because they say *which* part of the cloth is its side; the run
 * is the world's because it says *how far* the leg shows.
 *
 * Its known blind spots, stated rather than discovered: a cloth whose side widens
 * all the way to its waist has its corner at mid-height and the rows below it
 * unread; a leg the cloth's side never meets on a read row (the leg wholly beside
 * the cloth, entering above its top) has no run to count; and the rows are the
 * setup pose's, so a cloth authored lying on its side reads its side as a hem.
 *
 * Pure: no clock, no randomness, no runtime. The pieces, the attachments and the
 * rest table are handed in by whichever poser drew the frames.
 */

import type { Plate } from '../tools/plate.ts';
import { type AttachmentPose, type AttachmentRest, type Piece, projector, rasterisePiece, type Viewport } from './render_shared.ts';
import { hypot2 } from './numeric.ts';

/** The reading's file name inside an animation's frame directory, and its format tag. */
export const PASS_THROUGH_FILE = 'pass-through.json';
export const PASS_THROUGH_SPEC = 'rigc-pass-through/1';

/**
 * How many steps a run must reach for a frame to pass through: more than one.
 * One step is the outlines' own resolution — the cloth's outermost drawn cell and
 * the leg's first covered step can sit one step apart on two edges that only
 * touch — so a run of one is the outlines meeting, and two is the leg showing.
 */
export const PASS_THROUGH_RUN = 2;

/**
 * The opacity, of 255, a cell's centre must be painted at to count as drawn: the
 * half-opacity line, where an antialiased edge is. The renderer paints anything
 * above 0.5 of 255, which would put the outline on the faintest fringe of the
 * art; `rasterisePiece` reports the painted alpha rounded, and this reads it.
 */
export const DRAWN_ALPHA = 128;

/** One pair as the flag names it: the cloth that should hold the leg, and the leg. */
export interface PassPair {
  cloth: string;
  leg: string;
}

/** A malformed `--pass-through` value, or a pair the poses cannot be read for — said by name. */
export class PassThroughError extends Error {}

/**
 * `--pass-through`'s value — `<cloth>:<leg>[,<cloth>:<leg>…]` — read against
 * the skeleton's slots, or refused naming the entry: an empty entry, one without
 * exactly one `:`, an empty name, a slot the skeleton does not have (with the
 * slots it does), and a pair named twice. A cloth paired with itself is read, not
 * refused: a slot never draws over itself, so it reads 0 frames and says why.
 *
 * The order is the declaration: the first name is the cloth, which must draw over
 * the second for a frame to be read. `a:b` and `b:a` are two readings, never one
 * read both ways.
 */
export function readPassPairs(raw: string, slots: readonly string[]): PassPair[] {
  const form = '<cloth slot>:<leg slot>[,<cloth slot>:<leg slot>…]';
  const pairs: PassPair[] = [];
  const entries = raw.split(',');
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i].trim();
    if (entry === '') throw new PassThroughError(`--pass-through ${JSON.stringify(raw)}: entry ${i} is empty — it takes ${form}`);
    const parts = entry.split(':');
    if (parts.length !== 2) {
      throw new PassThroughError(`--pass-through: entry ${i} ${JSON.stringify(entry)} has ${parts.length - 1} ":" — it takes ${form}, one ":" per pair`);
    }
    const [cloth, leg] = parts.map((p) => p.trim());
    for (const [role, name] of [['cloth', cloth], ['leg', leg]] as const) {
      if (name === '') throw new PassThroughError(`--pass-through: entry ${i} ${JSON.stringify(entry)} names no ${role} slot — it takes ${form}`);
      if (!slots.includes(name)) {
        throw new PassThroughError(`--pass-through: entry ${i} names ${role} slot ${JSON.stringify(name)}, which this skeleton does not have; its slots are [${slots.join(', ')}]`);
      }
    }
    const again = pairs.findIndex((p) => p.cloth === cloth && p.leg === leg);
    if (again >= 0) throw new PassThroughError(`--pass-through: entry ${i} names "${cloth}:${leg}" again — entry ${again} already reads it`);
    pairs.push({ cloth, leg });
  }
  return pairs;
}

/** One sampled frame: its index, its time, the pieces it draws in draw order, and every slot's whole attachment. */
export interface PassFrame {
  index: number;
  time: number;
  pieces: readonly Piece[];
  attachments: readonly AttachmentPose[];
}

/** A world box `[minX, minY, maxX, maxY]`, world units, y up. */
export type PassBox = [number, number, number, number];

/** The side of the cloth a run is read on — its setup pose's left (−x) or right (+x). */
export type PassSide = 'left' | 'right';

/** One read frame's figures. */
export interface PassDepth {
  index: number;
  time: number;
  /** The longest run on the frame, in steps. */
  cells: number;
  /** `cells` in world units: `cells × cell`. */
  depth: number;
  /** The step: one texel of the coarser of the two drawings at the setup pose, world units. */
  cell: number;
  /** The side the longest run is on; the left on a tie. */
  side: PassSide;
}

/** A frame on which the cloth passes through the leg. */
export interface PassFrameReading extends PassDepth {
  /** The cloth's attachment at the frame. */
  attachment: string;
  /** Read rows whose run reaches `PASS_THROUGH_RUN`, over both sides. */
  rows: number;
  /** The world box of every run of a row whose run reaches `PASS_THROUGH_RUN`: from the cloth's outline to the run's far end. */
  box: PassBox;
}

/** One pair's reading over one frame set. */
export interface PairReading {
  cloth: string;
  leg: string;
  /** Frames on which both slots draw. */
  drawn: number;
  /** Of those, frames on which the cloth draws over the leg — the frames read. */
  over: number;
  /** Every frame that passes through, in frame order; empty when none does. */
  frames: PassFrameReading[];
  /** The read frame with the longest run — the earliest on a tie — or `null` when no frame is read. */
  deepest: PassDepth | null;
}

/** `pass-through.json`: one frame set's reading, every pair the flag names, in the flag's order. */
export interface PassThroughFile {
  spec: typeof PASS_THROUGH_SPEC;
  /** The animation, or `null` for a skeleton with none (its one frame is the setup pose). */
  animation: string | null;
  skin?: string;
  fps: number;
  /** What the numbers mean, stated in the file so a reader does not need this module. */
  reading: { read: string; drawn: string; rows: string; run: string; passes: string; box: string };
  pairs: PairReading[];
}

/**
 * A planted defect, for the suite's mutants only (`PT` controls in
 * `selftest.ts`). Production passes none.
 */
export interface PassPlant {
  /** Read a frame whichever slot draws over the other. */
  ignoreDrawOrder?: boolean;
  /** The run a frame needs to pass through, in steps, rather than `PASS_THROUGH_RUN`. */
  run?: number;
  /** Read the cloth's rows in the frame's world rather than in its setup pose. */
  rowsInWorld?: boolean;
  /** Step the run in the cloth's setup-pose cells carried to the frame, rather than in world units. */
  cellSteps?: boolean;
}

/** Twice the signed area of triangle (a, b, c) of `xy`. */
function cross(xy: ArrayLike<number>, a: number, b: number, c: number): number {
  return (xy[2 * b] - xy[2 * a]) * (xy[2 * c + 1] - xy[2 * a + 1]) - (xy[2 * c] - xy[2 * a]) * (xy[2 * b + 1] - xy[2 * a + 1]);
}

/** A piece's triangles: a mesh's own, a region's the runtime's `0 1 2 2 3 0`. */
function trianglesOf(piece: Piece): ArrayLike<number> {
  return piece.kind === 'mesh' ? piece.triangles : [0, 1, 2, 2, 3, 0];
}

/**
 * One texel of a drawing as `vertices` lay it out, in world units: the square
 * root of the drawing's world area over its texel area, summed over its
 * triangles — the page UVs times the page's size. `null` when either is 0.
 */
export function texelSize(piece: Piece, vertices: ArrayLike<number>, page: Plate): number | null {
  const triangles = trianglesOf(piece);
  let world = 0;
  let texels = 0;
  for (let t = 0; t + 2 < triangles.length; t += 3) {
    const [a, b, c] = [triangles[t], triangles[t + 1], triangles[t + 2]];
    world += Math.abs(cross(vertices, a, b, c));
    texels += Math.abs(cross(piece.uvs, a, b, c)) * page.width * page.height;
  }
  if (!(world > 0) || !(texels > 0)) return null;
  return Math.sqrt(world / texels);
}

/** The cells `piece` draws at half opacity or more over `viewport`, row major, 1 where drawn. */
export function drawnCells(piece: Piece, page: Plate, viewport: Viewport): Uint8Array {
  const cells = new Uint8Array(viewport.width * viewport.height);
  rasterisePiece(page, piece, projector(viewport), viewport, (px, py, _r, _g, _b, a) => {
    if (a >= DRAWN_ALPHA) cells[py * viewport.width + px] = 1;
  });
  return cells;
}

/**
 * Whether `piece` draws the world point (x, y) at half opacity or more — the
 * renderer's own traversal over a one-cell grid centred on the point, so the
 * test is the frame's pixel test and nothing re-derived beside it.
 */
export function drawsAt(piece: Piece, page: Plate, x: number, y: number, cell: number): boolean {
  const viewport: Viewport = { minX: x - cell / 2, minY: y - cell / 2, maxX: x + cell / 2, maxY: y + cell / 2, scale: 1 / cell, width: 1, height: 1 };
  let drawn = false;
  rasterisePiece(page, piece, projector(viewport), viewport, (_px, _py, _r, _g, _b, a) => {
    if (a >= DRAWN_ALPHA) drawn = true;
  });
  return drawn;
}

/** The world box of `xy`. */
function boxOf(xy: ArrayLike<number>): PassBox {
  const box: PassBox = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i + 1 < xy.length; i += 2) {
    box[0] = Math.min(box[0], xy[i]);
    box[1] = Math.min(box[1], xy[i + 1]);
    box[2] = Math.max(box[2], xy[i]);
    box[3] = Math.max(box[3], xy[i + 1]);
  }
  return box;
}

/**
 * The affine map of the cloth triangle holding the setup-pose point (x, y):
 * setup pose → frame, extended past the triangle's edges by the same map. The
 * triangle is the first, by index, whose barycentric weights are all at least
 * −1e-9 — a point on a shared edge is in both, and the lower index is chosen so
 * one build reads one way. `null` when no triangle holds it, or the one that does
 * has collapsed at the setup pose or at the frame.
 */
function mapAt(
  triangles: ArrayLike<number>,
  rest: ArrayLike<number>,
  posed: ArrayLike<number>,
  x: number,
  y: number,
): ((px: number, py: number) => [number, number]) | null {
  for (let t = 0; t + 2 < triangles.length; t += 3) {
    const [a, b, c] = [triangles[t], triangles[t + 1], triangles[t + 2]];
    const area = cross(rest, a, b, c);
    if (area === 0) continue;
    const weights = (px: number, py: number): [number, number, number] => {
      const wa = ((rest[2 * b] - px) * (rest[2 * c + 1] - py) - (rest[2 * c] - px) * (rest[2 * b + 1] - py)) / area;
      const wb = ((rest[2 * c] - px) * (rest[2 * a + 1] - py) - (rest[2 * a] - px) * (rest[2 * c + 1] - py)) / area;
      return [wa, wb, 1 - wa - wb];
    };
    const [wa, wb, wc] = weights(x, y);
    if (wa < -1e-9 || wb < -1e-9 || wc < -1e-9) continue;
    if (cross(posed, a, b, c) === 0) return null;
    return (px, py) => {
      const [ka, kb, kc] = weights(px, py);
      return [ka * posed[2 * a] + kb * posed[2 * b] + kc * posed[2 * c], ka * posed[2 * a + 1] + kb * posed[2 * b + 1] + kc * posed[2 * c + 1]];
    };
  }
  return null;
}

/** What one read frame found: its longest run, its side, and the runs that reach the line. */
interface FrameRuns {
  cells: number;
  side: PassSide;
  rows: number;
  box: PassBox | null;
}

/**
 * One frame's runs: `cloth` drawn over `leg`, `rest` the cloth attachment's
 * setup-pose vertices, `cell` its texel at the setup pose. See the module comment.
 */
function runsAt(
  cloth: Piece,
  clothPage: Plate,
  rest: ArrayLike<number>,
  cell: number,
  stepSize: number,
  leg: Piece,
  legPage: Plate,
  need: number,
  plant: PassPlant,
): FrameRuns {
  const [x0, y0, x1, y1] = boxOf(rest);
  // On multiples of the cell from the world origin, one cell of margin all round, so one build grids one way.
  const minX = (Math.floor(x0 / cell) - 1) * cell;
  const maxY = (Math.ceil(y1 / cell) + 1) * cell;
  const width = Math.ceil((x1 - minX) / cell) + 1;
  const height = Math.ceil((maxY - y0) / cell) + 1;
  const viewport: Viewport = { minX, minY: maxY - height * cell, maxX: minX + width * cell, maxY, scale: 1 / cell, width, height };
  const drawn = drawnCells({ ...cloth, world: Array.from(rest) }, clothPage, viewport);
  const extent: Array<[number, number] | null> = [];
  let top = -1;
  let bottom = -1;
  for (let py = 0; py < height; py++) {
    let lo = -1;
    let hi = -1;
    for (let px = 0; px < width; px++) {
      if (drawn[py * width + px] === 0) continue;
      if (lo < 0) lo = px;
      hi = px;
    }
    extent.push(lo < 0 ? null : [lo, hi]);
    if (lo >= 0) {
      if (top < 0) top = py;
      bottom = py;
    }
  }
  const found: FrameRuns = { cells: 0, side: 'left', rows: 0, box: null };
  if (top < 0) return found;
  const triangles = trianglesOf(cloth);
  const legBox = boxOf(leg.world);
  const reach = hypot2(legBox[2] - legBox[0], legBox[3] - legBox[1]);
  let box: PassBox | null = null;
  const take = (p: [number, number]): void => {
    box ??= [Infinity, Infinity, -Infinity, -Infinity];
    box[0] = Math.min(box[0], p[0]);
    box[1] = Math.min(box[1], p[1]);
    box[2] = Math.max(box[2], p[0]);
    box[3] = Math.max(box[3], p[1]);
  };
  const runs: Record<PassSide, Array<{ cells: number; ends: [[number, number], [number, number]] }>> = { left: [], right: [] };
  for (const side of ['left', 'right'] as const) {
    const out = side === 'left' ? -1 : 1;
    // The corner: the outermost drawn cell in the lower half of the drawn rows, the lowest on a tie.
    const half = bottom - 0.5 * (bottom - top);
    let corner = -1;
    for (let py = bottom; py >= top && py >= half; py--) {
      const row = extent[py];
      if (row === null) continue;
      const edge = side === 'left' ? row[0] : row[1];
      const best = corner < 0 ? null : (extent[corner] as [number, number]);
      if (best === null || (side === 'left' ? edge < best[0] : edge > best[1])) corner = py;
    }
    for (let py = corner; py >= top; py--) {
      const row = extent[py];
      if (row === null) continue;
      const cx = minX + ((side === 'left' ? row[0] : row[1]) + 0.5) * cell;
      const cy = maxY - (py + 0.5) * cell;
      const map = mapAt(triangles, rest, cloth.world, cx, cy);
      if (map === null) continue;
      const [ox, oy] = map(cx, cy);
      const [sx, sy] = map(cx + out * cell, cy);
      const length = hypot2(sx - ox, sy - oy);
      if (!(length > 0)) continue;
      // Step k's world point: `stepSize` world units at a time along the outward direction, normalised — or, planted,
      // one setup-pose cell at a time through the triangle's map, which a squashed cloth shortens.
      const at = (k: number): [number, number] =>
        plant.cellSteps ? map(cx + out * k * cell, cy) : [ox + ((sx - ox) / length) * k * stepSize, oy + ((sy - oy) / length) * k * stepSize];
      const stride = plant.cellSteps ? length : stepSize;
      const limit = Math.ceil(reach / stride) + 1;
      let k = 0;
      while (k < limit) {
        const [wx, wy] = at(k + 1);
        if (!drawsAt(leg, legPage, wx, wy, stride)) break;
        k++;
      }
      runs[side].push({ cells: k, ends: [map(cx + out * 0.5 * cell, cy), at(k + 0.5)] });
    }
  }
  for (const side of ['left', 'right'] as const) {
    for (const run of runs[side]) {
      if (run.cells > found.cells) {
        found.cells = run.cells;
        found.side = side;
      }
      if (run.cells >= need) {
        found.rows++;
        take(run.ends[0]);
        take(run.ends[1]);
      }
    }
  }
  found.box = box;
  return found;
}

const restKey = (slot: string, attachment: string): string => `${slot}\u0000${attachment}`;

/** Whether two vertex lists are the same numbers — a piece drawn from its attachment whole, not cut by a clip. */
export function sameVertices(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Every pair's reading over one frame set: `rest` the rest table, `frames` the
 * frames as the sampler returned them (pieces in draw order, attachments whole),
 * `pages` the atlas pages the pieces sample. Refused by name: a cloth a clip cuts
 * at a frame, whose outline is no longer its attachment's, and a cloth whose
 * drawing has no area.
 */
export function passThroughOf(
  pairs: readonly PassPair[],
  rest: readonly AttachmentRest[],
  frames: readonly PassFrame[],
  pages: ReadonlyMap<string, Plate>,
  plant: PassPlant = {},
): PairReading[] {
  const restOf = new Map(rest.map((r) => [restKey(r.slot, r.attachment), r]));
  const need = plant.run ?? PASS_THROUGH_RUN;
  const pageOf = (piece: Piece): Plate => {
    const page = pages.get(piece.page);
    if (page === undefined) throw new PassThroughError(`slot "${piece.slot}" samples atlas page "${piece.page}", which is not among [${[...pages.keys()].join(', ')}]`);
    return page;
  };
  return pairs.map(({ cloth, leg }) => {
    const reading: PairReading = { cloth, leg, drawn: 0, over: 0, frames: [], deepest: null };
    for (const frame of frames) {
      const ci = frame.pieces.findIndex((p) => p.slot === cloth);
      const li = frame.pieces.findIndex((p) => p.slot === leg);
      if (ci < 0 || li < 0) continue;
      reading.drawn++;
      if (!plant.ignoreDrawOrder && ci <= li) continue;
      reading.over++;
      const piece = frame.pieces[ci];
      const pose = frame.attachments.find((a) => a.slot === cloth);
      if (pose === undefined) throw new PassThroughError(`frame ${frame.index}: slot "${cloth}" draws, and the frame records no attachment for it`);
      if (!sameVertices(piece.world, pose.vertices)) {
        throw new PassThroughError(
          `frame ${frame.index}: a clip cuts cloth slot "${cloth}" (attachment "${pose.attachment}"), so its drawn outline is no longer its attachment's and its rows cannot be read in its setup pose`,
        );
      }
      const restEntry = restOf.get(restKey(cloth, pose.attachment));
      if (restEntry === undefined) throw new PassThroughError(`frame ${frame.index}: the rest table has no entry for slot "${cloth}" attachment "${pose.attachment}"`);
      const restVertices = plant.rowsInWorld ? piece.world : restEntry.vertices;
      const clothPage = pageOf(piece);
      const cell = texelSize(piece, restVertices, clothPage);
      if (cell === null) throw new PassThroughError(`frame ${frame.index}: cloth slot "${cloth}" (attachment "${pose.attachment}") draws no area at its setup pose, so it has no texel to grid its rows by`);
      // The leg's texel at its setup pose, off its own rest entry — so a leg a clip cuts is refused as the cloth is.
      const legPiece = frame.pieces[li];
      const legPose = frame.attachments.find((a) => a.slot === leg);
      if (legPose === undefined) throw new PassThroughError(`frame ${frame.index}: slot "${leg}" draws, and the frame records no attachment for it`);
      if (!sameVertices(legPiece.world, legPose.vertices)) {
        throw new PassThroughError(`frame ${frame.index}: a clip cuts leg slot "${leg}" (attachment "${legPose.attachment}"), so its drawing's texel cannot be read off its setup pose`);
      }
      const legRest = restOf.get(restKey(leg, legPose.attachment));
      if (legRest === undefined) throw new PassThroughError(`frame ${frame.index}: the rest table has no entry for slot "${leg}" attachment "${legPose.attachment}"`);
      const legPage = pageOf(legPiece);
      const legCell = texelSize(legPiece, legRest.vertices, legPage);
      if (legCell === null) throw new PassThroughError(`frame ${frame.index}: leg slot "${leg}" (attachment "${legPose.attachment}") draws no area at its setup pose, so it has no texel to step by`);
      const step = Math.max(cell, legCell);
      const runs = runsAt(piece, clothPage, restVertices, cell, step, legPiece, legPage, need, plant);
      const depth: PassDepth = { index: frame.index, time: frame.time, cells: runs.cells, depth: runs.cells * step, cell: step, side: runs.side };
      if (reading.deepest === null || depth.cells > reading.deepest.cells) reading.deepest = depth;
      if (runs.cells >= need && runs.box !== null) reading.frames.push({ ...depth, attachment: pose.attachment, rows: runs.rows, box: runs.box });
    }
    return reading;
  });
}

/** What `pass-through.json` states its numbers mean — the one wording the file and the docs share. */
export const PASS_THROUGH_READING: PassThroughFile['reading'] = {
  read: "a frame is read when both slots draw and the cloth slot draws over the leg slot in that frame's draw order; a frame where the leg draws over the cloth is not read",
  drawn: `a point is drawn when the renderer paints it at ${DRAWN_ALPHA} of 255 or more (half opacity) — the slot's art through its page, tint included`,
  rows:
    "the cloth's rows are cells of one texel of its drawing at its setup pose (the rest table's vertices), on multiples of that texel from the world origin; on each side its corner is the outermost drawn cell in the lower half of its drawn rows, the lowest on a tie, and the rows from the corner up to its top are read",
  run: "on a read row, the number of steps outward from the outermost drawn cell's centre as the frame poses it — in world units, along the setup pose's outward direction carried to the frame by the cloth triangle holding that centre — whose world point the leg draws, up to the first it does not: how far the leg's outline passes the cloth's. A step (cell) is one texel of the coarser of the two drawings at the setup pose, in world units; depth is the run times the step",
  passes: `a frame passes through when some read row's run is ${PASS_THROUGH_RUN} steps or more — more than the one step an outline is resolved to`,
  box: "a passing frame's box is [minX, minY, maxX, maxY] in world units (y up) over both ends of every run of that frame that reaches the line — the cloth's outline and the run's far end",
};

/** The file for one frame set. */
export function passThroughFileOf(animation: string | null, fps: number, skin: string | undefined, pairs: PairReading[]): PassThroughFile {
  return { spec: PASS_THROUGH_SPEC, animation, ...(skin === undefined ? {} : { skin }), fps, reading: PASS_THROUGH_READING, pairs };
}

/** The file's text: two-space JSON and a newline, so one build and one request are one byte sequence. */
export function passThroughText(file: PassThroughFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

/** Ascending indices as runs: `[3, 4, 5, 9]` → `3-5, 9`. */
function indexRuns(indices: readonly number[]): string {
  const out: string[] = [];
  for (let i = 0; i < indices.length; ) {
    let j = i;
    while (j + 1 < indices.length && indices[j + 1] === indices[j] + 1) j++;
    out.push(j === i ? String(indices[i]) : `${indices[i]}-${indices[j]}`);
    i = j + 1;
  }
  return out.join(', ');
}

/** `x` rounded to hundredths away from the box's inside, so the printed box holds what the exact one does. */
const outward = (x: number, up: boolean): string => ((up ? Math.ceil(x * 100) : Math.floor(x * 100)) / 100).toFixed(2);

/** A box as the lines print it, rounded outward to hundredths: `x [x0, x1] y [y0, y1] (w × h)`. */
function boxText([x0, y0, x1, y1]: PassBox): string {
  return `x [${outward(x0, false)}, ${outward(x1, true)}] y [${outward(y0, false)}, ${outward(y1, true)}] (${(x1 - x0).toFixed(2)} × ${(y1 - y0).toFixed(2)})`;
}

/** A depth as the lines print it: `D units (C cells of T)`. */
function depthText(d: PassDepth): string {
  return `${d.depth.toFixed(2)} units (${d.cells} step(s) of ${d.cell.toFixed(4)}) on its ${d.side} side`;
}

/**
 * The summary line for one pair over one set — printed for every pair, so a pair
 * that reads 0 says so and says whether it was read at all.
 */
export function passSummaryLine(animation: string | null, fps: number, pair: PairReading): string {
  const where = animation === null ? 'the setup pose' : JSON.stringify(animation);
  const head = `${where}: cloth "${pair.cloth}" over leg "${pair.leg}"`;
  if (pair.drawn === 0) return `${head}: the two slots draw together on no frame — nothing read`;
  if (pair.over === 0) {
    const why = pair.cloth === pair.leg ? 'a slot does not draw over itself' : `"${pair.leg}" draws over "${pair.cloth}" wherever both draw`;
    return `${head}: the cloth draws over the leg on 0 of ${pair.drawn} frame(s) both draw (${why}) — nothing read`;
  }
  const frames = pair.frames.map((f) => f.index);
  const deepest = pair.deepest as PassDepth;
  return (
    `${head} passes through on ${frames.length} of ${pair.over} frame(s) read${frames.length === 0 ? '' : ` [${indexRuns(frames)}]`} at ${fps} fps; ` +
    `deepest frame ${deepest.index} (t=${deepest.time.toFixed(4)}s): ${depthText(deepest)}`
  );
}

/** The line for one frame that passes through: the frame, the pair, the depth and the world box. */
export function passFrameLine(animation: string | null, pair: PairReading, frame: PassFrameReading): string {
  const where = animation === null ? 'the setup pose' : JSON.stringify(animation);
  return (
    `${where} frame ${frame.index} (t=${frame.time.toFixed(4)}s): cloth "${pair.cloth}" over leg "${pair.leg}" by ${depthText(frame)}, ` +
    `${frame.rows} row(s), in world box ${boxText(frame.box)}`
  );
}
