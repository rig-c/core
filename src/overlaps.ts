/**
 * Which slot a frame drew over which — the reading behind `rigc render --overlaps`
 * (issue #1480).
 *
 * ⭐ **A reading, not a gate**, as `--folds` and `--pass-through` are. An agent
 * authoring a motion cannot see its frames: an arm the draw order puts behind
 * the torso simply vanishes from them, on a build that passes everything, and
 * nothing names it. This names it — **who covers whom, on which frames, by how
 * many pixels** — and decides nothing. Who *should* be in front is the author's,
 * stated in the motion's draw-order keys; the render says what was drawn.
 *
 * ## What "covers" means here
 *
 * Per frame, every piece is rasterised **in the frame's own draw order** (the
 * order `Frame.pieces` lists them in, which both posers return in applied draw
 * order, so a draw-order key is honoured) on the render's own viewport, so a
 * pixel here is a pixel of `f<NNNN>.png`. A pixel is **drawn** by a piece when
 * the renderer's own traversal (`rasterisePiece`) paints it at `DRAWN_ALPHA` of
 * 255 or more — the half-opacity line every other reading draws outlines at; no
 * other threshold enters.
 *
 * Each pixel keeps the slots that have drawn it so far, in draw order. When a
 * slot draws a pixel that earlier slots already drew, it **covers** each of them
 * there: pair (earlier, later) gains one pixel, and its box grows to hold it.
 * `under` is the earlier-drawn slot, `over` the later-drawn one — the slot drawn
 * later covers the earlier one, whatever either looks like. Pairs are keyed by
 * slot name, so `a` under `b` and `b` under `a` — one draw-order key apart —
 * are two pairs, never one.
 *
 * ## Layering the motion does not move
 *
 * A pair that covers on **every** frame of the set, and on each either by the
 * **same** pixel count or with the slot in front drawn **wholly on** the one
 * behind (every pixel `over` draws is one `under` drew first — `inside`), is
 * **static layering** (`varies: false`): a backdrop under a part that never
 * leaves it, a face drawn over the head that carries it. It is counted, listed
 * in the file and not printed pair by pair. Every other pair that covers
 * anything is printed (`varies: true`).
 *
 * ⚠️ The pixel count alone was the first rule, and it was measured not to hold
 * its own examples (issue #1480): on `gallery/walk`, a part turning over the
 * backdrop changes its pixel count from frame to frame by rasterisation alone,
 * so no pair of its 35 read as static, and 14 backdrop lines
 * buried the one that mattered. Containment is what "layering" means there.
 *
 * Known blind spots, stated rather than discovered: a pixel is drawn or not at
 * the half-opacity line, so a fringe painted fainter than that covers nothing
 * here although it tints the frame; a slot that draws more than one piece on a
 * frame is one slot, entered at a pixel by the first of its pieces to draw there;
 * and the count is of pixels at the
 * render's `--max`, so the same motion at another size reads other numbers —
 * quote the size beside a figure. A slot in front that lies wholly on the one
 * behind on every frame is layering, however it moves across it — an arm swung
 * over the torso without ever leaving it reads as static.
 *
 * Pure: no clock, no randomness, no runtime. The pieces and pages are handed in
 * by whichever poser drew the frames.
 */

import { GLYPH_H, textWidth } from '../tools/font5x7.ts';
import { Plate, type RGBA } from '../tools/plate.ts';
import { DRAWN_ALPHA } from './passthrough.ts';
import { type Piece, projector, rasterisePiece, type Viewport } from './render_shared.ts';

/** The reading's file name inside a set's frame directory, and its format tag. */
export const OVERLAPS_FILE = 'overlaps.json';
export const OVERLAPS_SPEC = 'rigc-overlaps/1';

/** An outline plate's file name for frame `index`: `overlaps-f0007.png`, zero-padded as the frames are. */
export function overlapsPlateFile(index: number): string {
  return `overlaps-f${String(index).padStart(4, '0')}.png`;
}

/** A covered area's pixel box `[x0, y0, x1, y1]`: frame pixels, x right, y down, both ends inclusive. */
export type OverlapBox = [number, number, number, number];

/** One sampled frame: its index, its time and the pieces it draws, in draw order. */
export interface OverlapFrame {
  index: number;
  time: number;
  pieces: readonly Piece[];
}

/** One pair's figures on one frame. */
export interface FramePair {
  under: string;
  over: string;
  /** Pixels `over` drew where `under` had already drawn. */
  px: number;
  box: OverlapBox;
}

/** One pair's figures over a set. */
export interface PairTotal {
  under: string;
  over: string;
  /** Frames on which `over` covers `under` by one pixel or more. */
  frames: number;
  /** Frames in the set. */
  of: number;
  /** Those frames as inclusive runs of indices, ascending. */
  runs: Array<[number, number]>;
  /** The frame it covers the most pixels on — the earliest on a tie. */
  most: { index: number; px: number };
  /** Whether, on every frame it covers on, every pixel `over` draws is a pixel `under` drew first: the slot in front lies wholly on the one behind. */
  inside: boolean;
  /**
   * `false` for layering the motion does not move: it covers on every frame of
   * the set, and either by one pixel count on each or with `inside` true.
   */
  varies: boolean;
}

/** `overlaps.json`: one frame set's reading. */
export interface OverlapsFile {
  spec: typeof OVERLAPS_SPEC;
  /** The animation, or `null` for a skeleton with none (its one frame is the setup pose). */
  animation: string | null;
  skin?: string;
  fps: number;
  /** What the numbers mean, stated in the file so a reader does not need this module. */
  reading: { drawnAlpha: number; unit: 'frame pixels'; rule: string };
  frames: Array<{ index: number; time: number; pairs: FramePair[] }>;
  pairs: PairTotal[];
}

/** A page a piece samples that is not among the pages — said by name. */
export class OverlapError extends Error {}

/**
 * A planted defect, for the suite's mutants only (`OX` controls in
 * `selftest.ts`). Production passes none.
 */
export interface OverlapPlant {
  /** Rasterise the pieces in reverse draw order, so the earlier-drawn slot reads as the one in front. */
  reverse?: boolean;
  /** Count a pixel drawn at any painted alpha rather than at `DRAWN_ALPHA`. */
  anyAlpha?: boolean;
  /** Read every pair as varying, so static layering prints pair by pair. */
  noStatic?: boolean;
}

/** One frame's per-pixel lists of the slots that drew there, in draw order — what both the counts and the plate read. */
interface FrameDraw {
  /** Slot names, in the order they first drew on this frame. */
  slots: string[];
  /** Per pixel, row major, the indices into `slots` that drew it, in draw order; `null` where nothing did. */
  lists: Array<number[] | null>;
}

/** Code-unit order, so one build orders one way on every machine and locale. */
const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Pairs in one order everywhere: by `under`, then by `over`, in code-unit order. */
const pairOrder = (a: { under: string; over: string }, b: { under: string; over: string }): number => byCodeUnit(a.under, b.under) || byCodeUnit(a.over, b.over);

function drawFrame(frame: OverlapFrame, pages: ReadonlyMap<string, Plate>, viewport: Viewport, plant: OverlapPlant): FrameDraw {
  const slots: string[] = [];
  const lists: Array<number[] | null> = new Array<number[] | null>(viewport.width * viewport.height).fill(null);
  const project = projector(viewport);
  const need = plant.anyAlpha ? 1 : DRAWN_ALPHA;
  const pieces = plant.reverse ? [...frame.pieces].reverse() : frame.pieces;
  for (const piece of pieces) {
    const page = pages.get(piece.page);
    if (page === undefined) throw new OverlapError(`frame ${frame.index}: slot "${piece.slot}" samples atlas page "${piece.page}", which is not among [${[...pages.keys()].join(', ')}]`);
    let id = slots.indexOf(piece.slot);
    if (id < 0) id = slots.push(piece.slot) - 1;
    rasterisePiece(page, piece, project, viewport, (px, py, _r, _g, _b, a) => {
      if (a < need) return;
      const at = py * viewport.width + px;
      const list = lists[at];
      if (list === null) lists[at] = [id];
      else if (!list.includes(id)) list.push(id);
    });
  }
  return { slots, lists };
}

/** Every slot's drawn pixel count on one frame, by name. */
function drawnPx(draw: FrameDraw): Map<string, number> {
  const counts = new Array<number>(draw.slots.length).fill(0);
  for (const list of draw.lists) if (list !== null) for (const id of list) counts[id]++;
  return new Map(draw.slots.map((name, id) => [name, counts[id]]));
}

/** One frame's pairs, off its per-pixel lists: each slot covers every slot listed before it at a pixel. */
function framePairs(draw: FrameDraw, width: number): FramePair[] {
  const found = new Map<string, FramePair>();
  for (let at = 0; at < draw.lists.length; at++) {
    const list = draw.lists[at];
    if (list === null || list.length < 2) continue;
    const x = at % width;
    const y = (at - x) / width;
    for (let j = 1; j < list.length; j++) {
      for (let i = 0; i < j; i++) {
        const under = draw.slots[list[i]];
        const over = draw.slots[list[j]];
        const key = `${under}\u0000${over}`;
        const pair = found.get(key);
        if (pair === undefined) found.set(key, { under, over, px: 1, box: [x, y, x, y] });
        else {
          pair.px++;
          pair.box = [Math.min(pair.box[0], x), Math.min(pair.box[1], y), Math.max(pair.box[2], x), Math.max(pair.box[3], y)];
        }
      }
    }
  }
  return [...found.values()].sort(pairOrder);
}

/** Ascending indices as inclusive runs: `[3, 4, 5, 9]` → `[[3, 5], [9, 9]]`. */
function runsOf(indices: readonly number[]): Array<[number, number]> {
  const runs: Array<[number, number]> = [];
  for (const i of indices) {
    const last = runs[runs.length - 1];
    if (last !== undefined && i === last[1] + 1) last[1] = i;
    else runs.push([i, i]);
  }
  return runs;
}

/** What `overlaps.json` states its numbers mean — the one wording the file and the docs share. */
export const OVERLAPS_RULE =
  "the slot drawn later covers the earlier one: per frame every piece is rasterised in that frame's draw order on the render's own viewport, and a pixel a slot draws where earlier slots already drew counts one for each (earlier, later) pair; under is the earlier-drawn slot, over the later";

/** One set's reading, plus what the plates need: the frames' per-pixel lists, kept only for frames a plate is drawn of. */
export interface OverlapReading {
  frames: OverlapsFile['frames'];
  pairs: PairTotal[];
  /** Per plated frame index, its draw — the frames with a varying pair covering. */
  plated: Map<number, FrameDraw>;
}

/**
 * One set's reading: `frames` as the sampler returned them (pieces in draw
 * order), `pages` the atlas pages the pieces sample, `viewport` the render's.
 */
export function overlapsOf(frames: readonly OverlapFrame[], pages: ReadonlyMap<string, Plate>, viewport: Viewport, plant: OverlapPlant = {}): OverlapReading {
  const draws: FrameDraw[] = [];
  const perFrame: OverlapsFile['frames'] = [];
  const seen = new Map<string, { under: string; over: string; on: Array<{ index: number; px: number; inside: boolean }> }>();
  for (const frame of frames) {
    const draw = drawFrame(frame, pages, viewport, plant);
    draws.push(draw);
    const pairs = framePairs(draw, viewport.width);
    perFrame.push({ index: frame.index, time: frame.time, pairs });
    const drawn = drawnPx(draw);
    for (const p of pairs) {
      const key = `${p.under}\u0000${p.over}`;
      const entry = seen.get(key) ?? { under: p.under, over: p.over, on: [] };
      entry.on.push({ index: frame.index, px: p.px, inside: p.px === drawn.get(p.over) });
      seen.set(key, entry);
    }
  }
  const pairs: PairTotal[] = [...seen.values()]
    .map(({ under, over, on }) => {
      let most = on[0];
      for (const o of on) if (o.px > most.px) most = o;
      const inside = on.every((o) => o.inside);
      const still = on.length === frames.length && (inside || on.every((o) => o.px === on[0].px));
      return {
        under,
        over,
        frames: on.length,
        of: frames.length,
        runs: runsOf(on.map((o) => o.index)),
        most: { index: most.index, px: most.px },
        inside,
        varies: plant.noStatic === true || !still,
      };
    })
    .sort(pairOrder);
  const moving = new Set(pairs.filter((p) => p.varies).map((p) => `${p.under}\u0000${p.over}`));
  const plated = new Map<number, FrameDraw>();
  perFrame.forEach((f, i) => {
    if (f.pairs.some((p) => moving.has(`${p.under}\u0000${p.over}`))) plated.set(f.index, draws[i]);
  });
  return { frames: perFrame, pairs, plated };
}

/** The file for one frame set. */
export function overlapsFileOf(animation: string | null, fps: number, skin: string | undefined, reading: OverlapReading): OverlapsFile {
  return {
    spec: OVERLAPS_SPEC,
    animation,
    ...(skin === undefined ? {} : { skin }),
    fps,
    reading: { drawnAlpha: DRAWN_ALPHA, unit: 'frame pixels', rule: OVERLAPS_RULE },
    frames: reading.frames,
    pairs: reading.pairs,
  };
}

/** The file's text: two-space JSON and a newline, so one build and one request are one byte sequence. */
export function overlapsText(file: OverlapsFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

/** `n` with a comma between thousands, written out rather than asked of a locale: `1840` → `1,840`. */
export function groupedPx(n: number): string {
  const digits = String(n);
  let out = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ',';
    out += digits[i];
  }
  return out;
}

/** Inclusive runs as the line prints them: `12–41, 50`. */
function runsText(runs: ReadonlyArray<[number, number]>): string {
  return runs.map(([a, b]) => (a === b ? String(a) : `${a}–${b}`)).join(', ');
}

/** Where a line is: the animation, or the setup pose for a skeleton with none. */
const whereOf = (animation: string | null): string => (animation === null ? 'the setup pose' : JSON.stringify(animation));

/** The line for one varying pair: `OVERLAP "<under>" under "<over>": frames 12–41 (30 of 224), covered up to 1,840 px at frame 27`. */
export function overlapLine(animation: string | null, pair: PairTotal): string {
  return (
    `${whereOf(animation)}: OVERLAP "${pair.under}" under "${pair.over}": frames ${runsText(pair.runs)} (${pair.frames} of ${pair.of}), ` +
    `covered up to ${groupedPx(pair.most.px)} px at frame ${pair.most.index}`
  );
}

/** The one line for a set's static layering, or `null` when it has none. */
export function staticLine(animation: string | null, pairs: readonly PairTotal[]): string | null {
  const k = pairs.filter((p) => !p.varies).length;
  if (k === 0) return null;
  return (
    `${whereOf(animation)}: ${k} pair(s) cover on every frame by the same pixels, or with the slot in front drawn wholly on the one behind — ` +
    `layering the motion does not move; ${OVERLAPS_FILE} lists them`
  );
}

// ---------------------------------------------------------------------------
// the outline plate
// ---------------------------------------------------------------------------

/** The plate's background: plain white, so every contour colour reads against it. */
export const PLATE_BACKGROUND: RGBA = [255, 255, 255, 255];

/**
 * The contour colours, by a slot's place in its set's participants (every slot
 * in a varying pair, in code-unit order), modulo the table's length — so one
 * slot keeps one colour across a set's plates. Eight saturated hues far apart
 * on the wheel and none near the white background; the table means nothing
 * beyond "a different slot", and the name at each contour says which.
 */
export const PLATE_COLOURS: readonly RGBA[] = [
  [214, 39, 40, 255],
  [31, 119, 180, 255],
  [44, 160, 44, 255],
  [148, 103, 189, 255],
  [255, 127, 14, 255],
  [23, 190, 207, 255],
  [140, 86, 75, 255],
  [227, 119, 194, 255],
];

/**
 * A covered contour pixel is drawn when `(x + y) % 4 < 2`: on two, off two,
 * along the diagonals — a dash the eye and a pixel count both tell from a solid
 * line. An uncovered contour pixel is always drawn.
 */
export const dashOn = (x: number, y: number): boolean => (x + y) % 4 < 2;

/** Whether two label boxes `[x, y, w, h]` touch or sit within one pixel. */
const crowds = (a: [number, number, number, number], b: [number, number, number, number]): boolean =>
  a[0] < b[0] + b[2] + 1 && b[0] < a[0] + a[2] + 1 && a[1] < b[1] + b[3] + 1 && b[1] < a[1] + a[3] + 1;

/**
 * The outline plate of one frame: on `PLATE_BACKGROUND`, every slot of
 * `participants` that draws on the frame as its mask boundary — a drawn pixel
 * with an undrawn 4-neighbour, or on the plate's edge — in its colour, in the
 * frame's draw order; a boundary pixel some slot drawn later also drew is
 * covered, and drawn dashed (`dashOn`). Each slot's name sits above its
 * contour's topmost pixel (the leftmost on a tie), moved down a text line at a
 * time while an earlier label crowds it, in draw order.
 */
export function overlapPlate(reading: OverlapReading, index: number, participants: readonly string[], viewport: Viewport): Plate | null {
  const draw = reading.plated.get(index);
  if (draw === undefined) return null;
  const { width, height } = viewport;
  const plate = new Plate(width, height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) plate.set(x, y, PLATE_BACKGROUND);
  const labels: Array<{ name: string; colour: RGBA; x: number; y: number }> = [];
  for (let id = 0; id < draw.slots.length; id++) {
    const name = draw.slots[id];
    const place = participants.indexOf(name);
    if (place < 0) continue;
    const colour = PLATE_COLOURS[place % PLATE_COLOURS.length];
    const has = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < width && y < height && (draw.lists[y * width + x]?.includes(id) ?? false);
    let top: [number, number] | null = null;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const list = draw.lists[y * width + x];
        if (list === null) continue;
        const k = list.indexOf(id);
        if (k < 0) continue;
        if (has(x - 1, y) && has(x + 1, y) && has(x, y - 1) && has(x, y + 1)) continue;
        top ??= [x, y];
        const covered = k < list.length - 1;
        if (!covered || dashOn(x, y)) plate.set(x, y, colour);
      }
    }
    if (top !== null) labels.push({ name, colour, x: top[0], y: top[1] });
  }
  const taken: Array<[number, number, number, number]> = [];
  for (const label of labels) {
    const w = textWidth(label.name, 1);
    const x = Math.max(0, Math.min(width - w, label.x));
    let box: [number, number, number, number] = [x, Math.max(0, label.y - GLYPH_H - 1), w, GLYPH_H];
    for (let step = 0; step < 8 && taken.some((t) => crowds(t, box)); step++) box = [box[0], box[1] + GLYPH_H + 2, box[2], box[3]];
    taken.push(box);
    plate.text(label.name, box[0], box[1], 1, label.colour);
  }
  return plate;
}

/** A set's participants: every slot in a varying pair, in code-unit order — what the plate colours index. */
export function plateParticipants(pairs: readonly PairTotal[]): string[] {
  const names = new Set<string>();
  for (const p of pairs) {
    if (!p.varies) continue;
    names.add(p.under);
    names.add(p.over);
  }
  return [...names].sort(byCodeUnit);
}
