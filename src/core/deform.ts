/**
 * Construct 4 of the core, its remainder (issue #955, step 2f of issue #380):
 * the two timelines an attachment carries — `deform`, a vertex attachment's
 * vertices keyed over time, and `sequence`, the frame a region's series shows
 * — at a sample time, and under a slider at the time and mix it was applied
 * with.
 *
 * Every rule below was measured by posing hand-written skeletons through
 * `tools/pose_oracle.ts dump` (spine-core 4.3.13, `--skin all`,
 * `--physics none`) and comparing a formula over the core's own world
 * transforms (`./world.ts`, exact on every probe) with the rows the dump
 * printed, at the oracle's six-decimal rounding. Nothing here was written
 * from the runtime's source. The core suite's `CD` controls hold the same
 * skeletons against the core at tolerance 0.
 *
 * ## Deform: what a key holds
 *
 * A key states a run — `vertices`, starting at `offset` (0 unstated) — into
 * the attachment's deform array: one `x, y` pair per vertex of an unweighted
 * attachment, one pair per BINDING of a weighted one (in vertex order, then
 * binding order). What the run does not cover is an offset of 0, and a key
 * with no `vertices` is all zeros — the setup geometry.
 *
 * - **Unweighted, the runtime holds the key as positions, each the float32 sum
 *   `fround(fround(setup) + fround(offset))`.** Over 800 samples of 40
 *   random meshes on rotated, scaled bones, five-decimal numbers: that
 *   reading 0 misses; the double sum lerped 788, the lerped positions
 *   rounded to float32 791, the offsets lerped and then added 788.
 * - **Weighted, the runtime holds the key as offsets** (`fround(offset)`) and
 *   adds each to its binding's float32 coordinate when the world vertices
 *   are computed: `(fround(bx) + dx)·a + (fround(by) + dy)·b + worldX`, times
 *   the weight, summed. Over 1,600 samples of 80 random meshes over one to
 *   three of three bones: 0 misses; the float32 sum held as a position 775
 *   and 780, the lerped offset rounded to float32 711 and 716.
 *
 * ## Deform: at a sample time
 *
 * The key search is construct 4's (the last key at or before `t`, key times
 * float32). Before the first key the setup geometry; at or after the last
 * key, and on a `stepped` segment, that key; between two keys the lerp
 * `a + (b − a)·p` of the two held arrays, in double — measured above, and on
 * 7,200 samples of 180 random multi-key timelines (runs short and offset,
 * keys without vertices, stepped, linear and Bézier segments): 0 misses with
 * the Bézier rule below, 114 with the far end 1, every one on a Bézier
 * piece next to the eighth or ninth point. The form `a·(1 − p) + b·p` read
 * the same 0: the two differ below the oracle's grid, so which one the
 * runtime writes is not measurable here, and the first is taken.
 *
 * - **Linear**: `p = (t − t0) / (t1 − t0)`, the key times float32 (a float32
 *   `p` missed 341 of 2,400).
 * - **Bézier**: one channel whose value axis runs from 0 to 1 — the fraction
 *   of the way from one key's geometry to the next — shaped as a bone
 *   channel's is (`bezierPolyline` in `./animation.ts`: the polyline through
 *   the cubic's nine points at tenths of its parameter, stated numbers,
 *   float32 points) with ONE measured difference: ⚠️ **the recurrence runs to
 *   a far end of `0.99999999`, not 1, while the polyline's last point is the
 *   next key at 1.** Read off 126 curves, each point fixed by intersecting
 *   the two pieces meeting at it (a 10⁵-unit run makes `p` legible to 1e-11):
 *   with the far end 1 the points missed 64 of 1,134; with `0.99999999`, 1 —
 *   a first point whose piece held too few samples to fit — and every other
 *   far end tried missed more (1 − 2⁻²⁷ 17, 0.999999989 10, 0.99999998 68;
 *   the exact one-sixth with the far end 1, 68). On the 1,080 points of the
 *   120 random curves among them, the other readings of the recurrence
 *   missed more still: float32 handles 222, float32 running sums or
 *   constants 258 and more (1,024 combinations tried), the cubic evaluated
 *   directly 67. The residual the far end 1 leaves is one float32 step,
 *   always downward, growing with the point's index. A bone
 *   channel shaped by the same handles read the far end 1 (`CD02` holds
 *   both): the deform curve is its own reading. The last piece, from the
 *   ninth point to the next key, read exact.
 *   ⚠️ **Which form each piece takes (issue #975)**: the first piece, from
 *   the key to the first point, is `y1·(t − x0) / (x1 − x0)`; the last, from
 *   the ninth point to the next key, `y0 + (1 − y0)·(t − x0) / (x1 − x0)`
 *   (each product before its division); the eight between are the bone
 *   channel's `y0 + (t − x0) / (x1 − x0) · (y1 − y0)`. A bone channel reads
 *   all ten pieces in the between form (`channelAt`, bit-exact at a 1e9
 *   amplifier, `CR08`). The forms differ below the oracle's six-decimal grid,
 *   so they were read off `pose_oracle --raw` at tolerance 0 on `CR09`'s
 *   cells (60 five-vertex meshes, one deform segment each, 40 irrational
 *   samples; five-decimal keys / float32-exact keys): every piece in the
 *   between form 30 / 31 of 60 exact; the first piece's product alone 52 /
 *   53; the last piece's alone 37 / 37; both 60 / 60 (and 60 / 60 on another
 *   seed at 200 samples, where the between form read 14 / 14). The far end
 *   stays `0.99999999`: with both forms and the far end 1, 38 / 38.
 *
 * ## Under a slider
 *
 * A slider applies its animation's deforms after the sample's own, at its
 * time, from the CURRENT deform — the sample's, or the setup geometry where
 * the sample set none (the setup positions unweighted, zero offsets
 * weighted) — with alpha its mix: `current + (target − current)·mix`, and
 * `additive` `current + (target − setup)·mix` (the setup positions
 * unweighted, zeros weighted). ⚠️ At mix exactly 1, not additive, it IS the
 * target: `current + (target − current)·1` read 1 ulp off spine-core on 27
 * of 2,790 posed rows of issue #969's hand-written population (`DM01`, the
 * survey's doubles), the target on none. ⚠️ **Additive at mix exactly 1
 * over NO current deform** — at the setup pose, or at a sample whose own
 * animation set none on that slot — **it is the target too**, not
 * `setup + (target − setup)·1` (issue #993, read off `pose_oracle --raw` at
 * tolerance 0; weighted, the setup is zeros and the two agree to the bit).
 * On 1,000 rigs of `CD05`'s generator: that rule 1,000 exact; the stated
 * blend everywhere 985 (15 misses, every one unweighted, additive, mix 1,
 * with no current deform, 1–16 ulp on a vertex). Read at every additive
 * mix 1, current deform or not: `current + target − setup` 917,
 * `current − setup + target` and `target + (current − setup)` 951 each (with
 * no current deform both are the target to the bit — they miss over one),
 * the target itself 850. So over a current deform the stated blend stands:
 * the 107 additive mix-1 rigs whose sample animation keys a deform of its
 * own read exact at every sample with it. Before the timeline's first key it
 * writes nothing. Measured on 300 samples of 60 random rigs — weighted and not,
 * additive and not, mix 1, 0.5 and in [−1, 2], with and without a deform in
 * the sample's own animation: 0 misses; reading the non-additive blend from
 * the setup geometry missed 45, reading additive as the key's positions
 * added missed 100.
 *
 * ## Which slot a deform timeline moves
 *
 * The timeline names a skin, a slot and a placeholder: a RECORD. It moves
 * every slot whose shown record at that moment — after the attachment
 * timelines and the sliders — is that record, or a linked mesh that plays
 * that record's timelines (`timelines` true), whichever slot the timeline is
 * filed under. Measured (`CD07`): a deform keyed on mesh `m` of slot `y`
 * moved a linked mesh of `m` in slot `x` and another in slot `z`, and moved
 * `x` while `y` showed another mesh and while `y` showed nothing; a linked
 * mesh with `timelines` false did not move; a deform keyed on an attachment
 * the slot shows only between two attachment keys moved it there alone.
 *
 * ## A switch
 *
 * The sample's own attachment timelines are applied before its deform and
 * sequence timelines, so those are matched against what the slot shows after
 * the sample's switches. A slider applies its animation after the sample —
 * its attachment key, then its deform and sequence keys — and ⚠️ **a slider
 * switching the slot to ANOTHER attachment clears the deform and the frame
 * the sample set**, while one naming the attachment already shown keeps
 * them. Measured on two meshes `m`, `n` and on two series `r` (setup frame 1)
 * and `q` (setup frame 2) (`CD14`): a slider switching `m` to `n` over a
 * sample deforming `m` drew `n` undeformed, and over a sample deforming `n`
 * drew `n` undeformed too (the sample's deform of `n` found `m` shown); a
 * slider naming `m` over a sample deforming `m` kept the deform; a slider
 * switching to `n` and deforming it drew its own deform; the series alike —
 * `q` at its setup frame after the switch, `r` at the sample's frame 3 when
 * the slider named `r`. ⚠️ Under
 * `--skin all` a placeholder several skins fill shows the LAST of them in the
 * Spine file's skin order, which the model does not hold (the slots' ⚠️ in
 * `./index.ts`), so a timeline keyed on such a placeholder is not posed: the
 * block is absent, naming it. Under `--skin <name>` one record resolves —
 * the named skin's, else the default's (`./skins.ts`) — and a timeline
 * moves it exactly when it is keyed under that record's skin (`CN01`).
 *
 * ## Sequence
 *
 * A region's series shows its setup frame (`sequence.setup`, 0 unstated)
 * until a sequence timeline's first key. From a key — `mode` (`hold`
 * unstated), `index` (0 unstated), `delay` (⚠️ unstated, the key before
 * it's, 0 on the first key) — the frame is `index` plus
 * `floor((t − time) / delay + 0.00001)` steps when `delay` is above 0 (no
 * step otherwise, and none in `hold`), then per mode over `count` frames:
 * `hold` the index held at the last frame, `once` the same, `loop` modulo
 * `count`, `pingpong` modulo `2·(count − 1)` folded back, and each
 * `…Reverse` mode the forward mode's frame `f` read as `count − 1 − f`. The
 * key time and `delay` are float32. Measured on 74,041 samples of 380
 * random timelines, 300 of them with delays built to put the quotient within
 * 1e-6 to 4e-5 of a whole step (52,768 samples): the epsilon 0.00001 missed
 * 0; no epsilon 440, 0.0001 1,266, a float32 quotient 306; on the 52,768,
 * 0.000005 148 and 0.00002 248. ⚠️ **A key stating no
 * delay steps by the key before it's**, carried through keys that state
 * none: a hold with delay 0.2, then a hold at index 1, then a loop at index 0
 * stating no delay stepped every 0.2 from the third key; a delay of 0 stated
 * after one of 0.2 held; the index and the mode are not carried (a key
 * stating no index after one at 3 showed frame 0; one stating no mode
 * after a loop held). A slider applies a
 * sequence key at any mix but 0. Only a region's corners read the frame (its
 * rectangle, `sequence.atlas[frame]`); a mesh's vertices read no atlas.
 *
 * ## Purity
 *
 * As the rest of the core: nothing from the Spine runtime package, nothing
 * from `src/transform.ts`, no clock, no randomness, no I/O.
 */
import type { ModelSlot, ModelVertices } from '../model.ts';
import { bezierPolyline, keyIndexAt, type CoreAnimationTimelines, type CoreCurve } from './animation.ts';
import { activeBones, shownAttachment, shownRow, type CompiledDocument, type CoreShown, type CoreSkin, type ShownResolution } from './index.ts';
import { fillingSkins, slotTimelinesApply, type SlotTimelineGate } from './skins.ts';
import type { ShownGeometry } from './vertices.ts';

/** The far end the deform curve's recurrence runs to — the header's measurement. */
export const DEFORM_CURVE_END = 0.99999999;

/** A sequence timeline's modes, as the model spells them. */
export const SEQUENCE_MODES = ['hold', 'once', 'loop', 'pingpong', 'onceReverse', 'loopReverse', 'pingpongReverse'] as const;
export type SequenceMode = (typeof SEQUENCE_MODES)[number];

/** The step a sequence adds to its quotient before flooring it — the header's measurement. */
export const SEQUENCE_EPSILON = 0.00001;

/** One deform key, as read: its time float32 and as stated, its curve, and its run. */
export interface CoreDeformKey {
  time: number;
  stated: number;
  curve: CoreCurve;
  offset: number;
  /** The run as the document states it; the runtime stores each float32. */
  vertices: number[];
}

/** One sequence key, as read — each field the parser's value where unstated. */
export interface CoreSequenceKey {
  time: number;
  mode: SequenceMode;
  index: number;
  /** Float32, as the runtime stores it. */
  delay: number;
}

/** One attachment's timelines in one animation: the skin, slot and placeholder it names, and its deform and sequence keys. */
export interface CoreAttachmentTimeline {
  skin: string;
  slot: string;
  attachment: string;
  deform: CoreDeformKey[] | null;
  sequence: CoreSequenceKey[] | null;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** How long the deform array of a vertex array is: a pair per vertex, or per binding when weighted. */
export function deformLength(vertices: ModelVertices): number {
  return vertices.weighted ? 2 * vertices.bindings.reduce((n, b) => n + b.length, 0) : vertices.xy.length;
}

function keyTimes(list: unknown[], at: string, problems: string[]): void {
  let last = -Infinity;
  list.forEach((k, i) => {
    if (!isRecord(k)) return;
    const t = k.time;
    if (!finite(t) || t < 0) problems.push(`${at}[${i}]: time is ${JSON.stringify(t)}, not a finite time at or after 0`);
    else if (t <= last) problems.push(`${at}[${i}]: time ${t} is not after the key before it — the writer refuses key times that do not strictly increase`);
    if (finite(t)) last = Math.max(last, t);
  });
}

function readDeformKeys(value: unknown, at: string, vertices: ModelVertices, problems: string[]): CoreDeformKey[] {
  if (!Array.isArray(value) || value.length === 0) {
    problems.push(`${at}: keys is not a non-empty list`);
    return [];
  }
  keyTimes(value, at, problems);
  const length = deformLength(vertices);
  const out: CoreDeformKey[] = [];
  value.forEach((k, i) => {
    const kat = `${at}[${i}]`;
    if (!isRecord(k)) {
      problems.push(`${kat} is not an object`);
      return;
    }
    for (const key of Object.keys(k)) if (!['time', 'offset', 'vertices', 'curve'].includes(key)) problems.push(`${kat}: field "${key}" is not one a deform key carries; it carries [time, offset, vertices, curve]`);
    const run = k.vertices;
    let vertexRun: number[] = [];
    if (run !== undefined) {
      if (!Array.isArray(run) || run.length === 0 || !run.every(finite)) problems.push(`${kat}: vertices is not a non-empty list of finite numbers (omit it for the setup geometry)`);
      else vertexRun = run as number[];
    }
    let offset = 0;
    if (k.offset !== undefined) {
      if (run === undefined) problems.push(`${kat}: offset ${JSON.stringify(k.offset)} with no vertices — a key with no run is the setup geometry, and the writer states no start for it`);
      else if (typeof k.offset !== 'number' || !Number.isInteger(k.offset) || k.offset < 0) problems.push(`${kat}: offset is ${JSON.stringify(k.offset)}, not a whole index at or after 0`);
      else offset = k.offset;
    }
    if (offset + vertexRun.length > length) problems.push(`${kat}: the run starts at ${offset} and is ${vertexRun.length} long, past the ${length} numbers of the attachment's deform array`);
    let curve: CoreCurve = 'linear';
    if (k.curve !== undefined) {
      if (i === value.length - 1) problems.push(`${kat}: the last key carries a curve, which eases to no key — the writer refuses it`);
      else if (k.curve === 'stepped') curve = 'stepped';
      else if (Array.isArray(k.curve) && k.curve.length === 4 && k.curve.every(finite)) curve = k.curve as number[];
      else problems.push(`${kat}: curve is ${JSON.stringify(k.curve)}, not "stepped" nor 4 finite numbers (a deform key's curve is one channel)`);
    }
    const time = finite(k.time) ? k.time : 0;
    out.push({ time: Math.fround(time), stated: time, curve, offset, vertices: vertexRun });
  });
  return out;
}

function readSequenceKeys(value: unknown, at: string, count: number, problems: string[]): CoreSequenceKey[] {
  if (!Array.isArray(value) || value.length === 0) {
    problems.push(`${at}: keys is not a non-empty list`);
    return [];
  }
  keyTimes(value, at, problems);
  const out: CoreSequenceKey[] = [];
  value.forEach((k, i) => {
    const kat = `${at}[${i}]`;
    if (!isRecord(k)) {
      problems.push(`${kat} is not an object`);
      return;
    }
    for (const key of Object.keys(k)) if (!['time', 'mode', 'index', 'delay'].includes(key)) problems.push(`${kat}: field "${key}" is not one a sequence key carries; it carries [time, mode, index, delay]`);
    let mode: SequenceMode = 'hold';
    if (k.mode !== undefined) {
      const m = SEQUENCE_MODES.find((x) => x === k.mode);
      if (m === undefined) problems.push(`${kat}: mode is ${JSON.stringify(k.mode)}, none of ${SEQUENCE_MODES.join(', ')}`);
      else mode = m;
    }
    let index = 0;
    if (k.index !== undefined) {
      if (typeof k.index !== 'number' || !Number.isInteger(k.index) || k.index < 0 || k.index >= count) problems.push(`${kat}: index is ${JSON.stringify(k.index)}, not a frame of the series' ${count} — the writer refuses an index past the last frame`);
      else index = k.index;
    }
    // Unstated, the key before it's (the header's ⚠️).
    let delay = out.length === 0 ? 0 : out[out.length - 1].delay;
    if (k.delay !== undefined) {
      // A negative delay steps backwards through a floor this cut never measured; the writer states none.
      if (!finite(k.delay) || k.delay < 0) problems.push(`${kat}: delay is ${JSON.stringify(k.delay)}, not a finite number of seconds at or above 0`);
      else delay = Math.fround(k.delay);
    }
    out.push({ time: Math.fround(finite(k.time) ? k.time : 0), mode, index, delay });
  });
  return out;
}

/**
 * An animation record's `attachments` group, read: each skin, slot and
 * placeholder one of the document's records, a `deform` only on a vertex
 * attachment (mesh, bounding box, clipping, path — the four the writer keys)
 * with every run fitting its deform array, a `sequence` only on a record with
 * a series, and every key checked field by field. Every problem is named.
 */
export function readAttachmentTimelines(value: unknown, label: string, skins: readonly CoreSkin[], problems: string[]): CoreAttachmentTimeline[] {
  const out: CoreAttachmentTimeline[] = [];
  const where = `${label}.attachments`;
  if (!Array.isArray(value)) {
    problems.push(`${where} is not a list`);
    return out;
  }
  value.forEach((skinEntry, i) => {
    const sat = `${where}[${i}]`;
    if (!isRecord(skinEntry) || typeof skinEntry.name !== 'string') {
      problems.push(`${sat} names no skin`);
      return;
    }
    const skin = skins.find((k) => k.name === skinEntry.name);
    if (skin === undefined) problems.push(`${sat}: "${skinEntry.name}" is not a skin of this document`);
    if (!Array.isArray(skinEntry.slots)) {
      problems.push(`${sat}: slots is not a list`);
      return;
    }
    skinEntry.slots.forEach((slotEntry: unknown, j: number) => {
      const lat = `${sat}.slots[${j}]`;
      if (!isRecord(slotEntry) || typeof slotEntry.name !== 'string') {
        problems.push(`${lat} names no slot`);
        return;
      }
      if (!Array.isArray(slotEntry.attachments)) {
        problems.push(`${lat}: attachments is not a list`);
        return;
      }
      const slot = slotEntry.name;
      slotEntry.attachments.forEach((attEntry: unknown, m: number) => {
        const aat = `${lat}.attachments[${m}]`;
        if (!isRecord(attEntry) || typeof attEntry.name !== 'string') {
          problems.push(`${aat} names no attachment`);
          return;
        }
        for (const key of Object.keys(attEntry)) if (!['name', 'deform', 'sequence'].includes(key)) problems.push(`${aat}: field "${key}" is not one this reader knows; it reads [name, deform, sequence]`);
        const record = skin?.attachments[slot]?.[attEntry.name];
        const label2 = `${aat} "${skinEntry.name}/${slot}/${attEntry.name}"`;
        if (skin !== undefined && record === undefined) problems.push(`${label2}: skin "${skin.name}" files no attachment "${attEntry.name}" under slot "${slot}"`);
        const timeline: CoreAttachmentTimeline = { skin: skinEntry.name as string, slot, attachment: attEntry.name, deform: null, sequence: null };
        if (attEntry.deform !== undefined && record !== undefined) {
          const g = record.geometry;
          if (g === undefined || (g.kind !== 'mesh' && g.kind !== 'clipping' && g.kind !== 'boundingbox' && g.kind !== 'path')) problems.push(`${label2}: a deform keys the vertices of a mesh, bounding box, clipping or path attachment, and this one is a ${record.kind}`);
          else timeline.deform = readDeformKeys(attEntry.deform, `${label2}.deform`, g.vertices, problems);
        }
        if (attEntry.sequence !== undefined && record !== undefined) {
          const count = record.sequenceCount;
          if (count === undefined) problems.push(`${label2}: a sequence timeline steps a series, and this ${record.kind} carries no sequence`);
          else timeline.sequence = readSequenceKeys(attEntry.sequence, `${label2}.sequence`, count, problems);
        }
        if (attEntry.deform === undefined && attEntry.sequence === undefined) problems.push(`${label2}: carries neither a deform nor a sequence timeline`);
        out.push(timeline);
      });
    });
  });
  return out;
}

// ---------------------------------------------------------------------------
// evaluation
// ---------------------------------------------------------------------------

/** The array a key holds — the header's *what a key holds*: positions unweighted, offsets weighted. */
export function heldArray(vertices: ModelVertices, key: CoreDeformKey): number[] {
  const out = setupArray(vertices);
  key.vertices.forEach((v, i) => {
    const at = key.offset + i;
    out[at] = vertices.weighted ? Math.fround(v) : Math.fround(out[at] + Math.fround(v));
  });
  return out;
}

/** The deform array of no deform: the setup positions (float32) unweighted, zero offsets weighted. */
export function setupArray(vertices: ModelVertices): number[] {
  return vertices.weighted ? new Array<number>(deformLength(vertices)).fill(0) : vertices.xy.map((v) => Math.fround(v));
}

/** The fraction of the way from key `a` to key `b` at `t` — the header's two curves. */
export function deformPercent(a: CoreDeformKey, b: CoreDeformKey, t: number): number {
  if (a.curve === 'stepped') return 0;
  if (a.curve === 'linear') return (t - a.time) / (b.time - a.time);
  const c = a.curve;
  const inner = bezierPolyline(a.stated, 0, c[0], c[1], c[2], c[3], b.stated, DEFORM_CURVE_END);
  const points = [a.time, 0, ...inner, b.time, 1];
  let i = 2;
  while (i < points.length - 2 && points[i] < t) i += 2;
  const [x0, y0, x1, y1] = [points[i - 2], points[i - 1], points[i], points[i + 1]];
  // The two end pieces multiply before they divide — the header's *which form each piece takes*.
  if (i === 2) return (y1 * (t - x0)) / (x1 - x0);
  if (i === points.length - 2) return y0 + ((1 - y0) * (t - x0)) / (x1 - x0);
  return y0 + ((t - x0) / (x1 - x0)) * (y1 - y0);
}

/** What evaluates a deform timeline at `t`: `deformAt` unless a plant passes another. */
export type DeformEvaluator = (vertices: ModelVertices, keys: readonly CoreDeformKey[], t: number) => number[] | null;

/** The deform array a timeline sets at `t`, or `null` before its first key — the header's *at a sample time*. */
export function deformAt(vertices: ModelVertices, keys: readonly CoreDeformKey[], t: number): number[] | null {
  const i = keyIndexAt(keys, t);
  if (i < 0) return null;
  const a = keys[i];
  const held = heldArray(vertices, a);
  const b = keys[i + 1];
  if (b === undefined || a.curve === 'stepped') return held;
  const next = heldArray(vertices, b);
  const p = deformPercent(a, b, t);
  return held.map((v, k) => v + (next[k] - v) * p);
}

/** What blends a slider's deform over the current one: `blendDeform` unless a plant passes another. */
export type DeformBlender = (vertices: ModelVertices, current: readonly number[] | null, target: readonly number[], alpha: number, additive: boolean) => number[];

/** A slider's deform over the current one — the header's *under a slider*. */
export function blendDeform(vertices: ModelVertices, current: readonly number[] | null, target: readonly number[], alpha: number, additive: boolean): number[] {
  const setup = setupArray(vertices);
  const from = current ?? setup;
  // #969: non-additive at mix 1 the target itself, not `c + (target − c)·1`, which is last-bit off it (measured, `./hooks.ts`' DM01).
  if (!additive && alpha === 1) return [...target];
  // #993: additive at mix 1 over no current deform the target too, not `setup + (target − setup)·1` (measured, the core suite's CR10).
  if (additive && alpha === 1 && current === null) return [...target];
  return from.map((c, k) => (additive ? c + (target[k] - setup[k]) * alpha : c + (target[k] - c) * alpha));
}

/**
 * The vertex array a deform array draws: unweighted the positions
 * themselves, weighted each binding's float32 coordinate plus its offset —
 * numbers the world-vertex computation reads as they are, not through
 * `Math.fround` again (`worldVertices`' `coords`).
 */
export function deformedVertices(vertices: ModelVertices, deform: readonly number[]): ModelVertices {
  if (!vertices.weighted) return { weighted: false, xy: [...deform] };
  let k = 0;
  return {
    weighted: true,
    bindings: vertices.bindings.map((influences) => influences.map((b) => {
      const x = Math.fround(b.x) + deform[k];
      const y = Math.fround(b.y) + deform[k + 1];
      k += 2;
      return { ...b, x, y };
    })),
  };
}

/** The frame a sequence timeline shows at `t`, or `null` before its first key — the header's *Sequence*. */
export function sequenceFrameAt(keys: readonly CoreSequenceKey[], count: number, t: number): number | null {
  const i = keyIndexAt(keys, t);
  if (i < 0) return null;
  const k = keys[i];
  let n = k.index;
  if (k.mode !== 'hold' && k.delay > 0) n += Math.floor((t - k.time) / k.delay + SEQUENCE_EPSILON);
  const reverse = k.mode.endsWith('Reverse');
  const base = reverse ? k.mode.slice(0, -'Reverse'.length) : k.mode;
  let f: number;
  if (base === 'hold' || base === 'once') f = Math.min(n, count - 1);
  else if (base === 'loop') f = n % count;
  else {
    const period = 2 * (count - 1);
    f = period === 0 ? 0 : n % period;
    if (f >= count) f = period - f;
  }
  return reverse ? count - 1 - f : f;
}

// ---------------------------------------------------------------------------
// the slots' attachments at a pose
// ---------------------------------------------------------------------------

/** What evaluates a sequence timeline at `t`: `sequenceFrameAt` unless a plant passes another. */
export type SequenceEvaluator = (keys: readonly CoreSequenceKey[], count: number, t: number) => number | null;

/** The applications this module reads off a slider (`SliderApplication` in `./constraints_slider.ts`). */
export interface AttachmentApplication {
  name: string;
  timelines: { attachments: readonly CoreAttachmentTimeline[]; slots: ReadonlyArray<{ name: string; timelines: ReadonlyArray<{ kind: string; keys?: ReadonlyArray<{ time: number; name?: string | null }> }> }> };
  at: number;
  alpha: number;
  additive: boolean;
}

/** The skin, slot and placeholder a slot's shown record plays timelines as — the header's *which slot* — or null when none can key it. */
export function timelineIdentity(slot: string, shown: CoreShown): string | null {
  const g = shown.record.geometry;
  if (g?.kind === 'linkedmesh') return shown.record.timelines === true ? `${g.skin}/${g.slot}/${g.source}` : null;
  return `${shown.skin}/${slot}/${shown.placeholder}`;
}

const nameOf = (a: CoreAttachmentTimeline): string => `${a.skin}/${a.slot}/${a.attachment}`;

/** The part of an attachment state that depends only on the document view and placeholder. */
interface AttachmentIdentity {
  readonly entry: ShownGeometry;
  readonly identity: string | null;
  readonly vertices: ModelVertices | null;
  readonly count: number | undefined;
  readonly fillers: readonly string[];
}

/** Like shownAttachment's cache, scoped to the view; a new skin view resolves its own records. */
const identitiesOfView = new WeakMap<CompiledDocument, Map<string, Map<string, AttachmentIdentity | null>>>();

function readIdentity(doc: CompiledDocument, resolve: (doc: CompiledDocument, slot: ModelSlot) => ShownResolution, slot: ModelSlot, placeholder: string): AttachmentIdentity | null {
  const s = resolve(doc, { ...slot, setup: placeholder });
  if (s === null || 'conflict' in s || s.record.geometry === undefined) return null;
  const g = s.record.geometry;
  const source = g.kind === 'linkedmesh' ? doc.skins.find((k) => k.name === g.skin)?.attachments[g.slot]?.[g.source] : s.record;
  const sg = source?.geometry;
  return Object.freeze({
    entry: Object.freeze({ slot: slot.name, bone: slot.bone, name: shownRow(s).name, placeholder: s.placeholder, skin: s.skin, geometry: g }),
    identity: timelineIdentity(slot.name, s),
    vertices: sg !== undefined && sg.kind !== 'region' && sg.kind !== 'linkedmesh' ? sg.vertices : null,
    count: source?.sequenceCount,
    fillers: Object.freeze(fillingSkins(doc, slot.name, s.placeholder).map((k) => `"${k}"`)),
  });
}

function identityOf(doc: CompiledDocument, resolve: (doc: CompiledDocument, slot: ModelSlot) => ShownResolution, slot: ModelSlot, placeholder: string | null): AttachmentIdentity | null {
  if (placeholder === null) return null;
  // A planted resolver may read changing state outside the document. Only the document's own reader is immutable.
  if (resolve !== shownAttachment) return readIdentity(doc, resolve, slot, placeholder);
  let slots = identitiesOfView.get(doc);
  if (slots === undefined) identitiesOfView.set(doc, slots = new Map());
  let placeholders = slots.get(slot.name);
  if (placeholders === undefined) slots.set(slot.name, placeholders = new Map());
  if (placeholders.has(placeholder)) return placeholders.get(placeholder) as AttachmentIdentity | null;
  const identity = readIdentity(doc, resolve, slot, placeholder);
  placeholders.set(placeholder, identity);
  return identity;
}

/** Index only immutable timeline identity. Times, mixes and the values they compute are never cached. */
const attachmentsByIdentity = new WeakMap<readonly CoreAttachmentTimeline[], ReadonlyMap<string, readonly CoreAttachmentTimeline[]>>();
type AttachmentSlots = AttachmentApplication['timelines']['slots'];
type AttachmentSwitch = NonNullable<AttachmentSlots[number]['timelines'][number]['keys']>;
const switchesBySlot = new WeakMap<AttachmentSlots, ReadonlyMap<string, readonly AttachmentSwitch[]>>();

function matchingAttachments(timelines: readonly CoreAttachmentTimeline[], identity: string): readonly CoreAttachmentTimeline[] | undefined {
  let index = attachmentsByIdentity.get(timelines);
  if (index === undefined) {
    const rows = new Map<string, CoreAttachmentTimeline[]>();
    for (const a of timelines) {
      const name = nameOf(a);
      const found = rows.get(name);
      if (found === undefined) rows.set(name, [a]);
      else found.push(a);
    }
    attachmentsByIdentity.set(timelines, index = rows);
  }
  return index.get(identity);
}

function slotSwitches(slots: AttachmentSlots, slot: string): readonly AttachmentSwitch[] | undefined {
  let index = switchesBySlot.get(slots);
  if (index === undefined) {
    const rows = new Map<string, AttachmentSwitch[]>();
    for (const target of slots) {
      for (const tl of target.timelines) {
        if (tl.kind !== 'attachment' || tl.keys === undefined) continue;
        const found = rows.get(target.name);
        if (found === undefined) rows.set(target.name, [tl.keys]);
        else found.push(tl.keys);
      }
    }
    switchesBySlot.set(slots, index = rows);
  }
  return index.get(slot);
}

/** Allocated only when a matching timeline or a mixed deform actually has per-pose state. */
interface AttachmentValues {
  deform: number[] | null;
  frame: number | null;
  seen: string[];
}

function applyAttachment(now: AttachmentIdentity | null, values: AttachmentValues | null, timelines: readonly CoreAttachmentTimeline[], t: number, blend: AttachmentApplication | null, evalDeform: DeformEvaluator, blendOf: DeformBlender, evalFrame: SequenceEvaluator): AttachmentValues | null {
  if (now === null || now.identity === null) return values;
  const matching = matchingAttachments(timelines, now.identity);
  if (matching === undefined) return values;
  values ??= { deform: null, frame: null, seen: [] };
  if (!values.seen.includes(now.identity)) values.seen.push(now.identity);
  for (const a of matching) {
    if (a.deform !== null && now.vertices !== null) {
      const target = evalDeform(now.vertices, a.deform, t);
      if (target !== null) values.deform = blend === null ? target : blendOf(now.vertices, values.deform, target, blend.alpha, blend.additive);
    }
    if (a.sequence !== null && now.count !== undefined) {
      const f = evalFrame(a.sequence, now.count, t);
      if (f !== null) values.frame = f;
    }
  }
  return values;
}

/**
 * Every slot's shown geometry at one pose — the setup's (`sample` null) or a
 * sample's — with the deform array and the series' frame its attachment
 * timelines set, stage by stage as the header's *A switch* states: from what
 * the slot shows after the sample's own timelines (`placeholders`; the setup
 * placeholder at setup), the sample's deform and sequence timelines at `t`;
 * then each slider in order — its attachment key (a switch to another record
 * clears the deform and the frame), then its deform and sequence timelines at
 * the time and mix it was applied with. Slots in the model's order, showing a
 * record that carries geometry; a slot whose placeholder skins fill
 * differently is left to the slots' own absence. `why` names what the core
 * does not pose: a timeline moving a record whose placeholder several skins
 * fill (the header's ⚠️).
 *
 * Identity is kept per document view, slot and placeholder, and timelines
 * indexed by their record identity. A slot with no per-pose values reuses its
 * frozen entry; deform arrays and sequence frames are evaluated afresh.
 * Sliders select identities in application order, never a cached posed value.
 */
export function attachmentStates(
  doc: CompiledDocument,
  resolve: (doc: CompiledDocument, slot: ModelSlot) => ShownResolution,
  placeholders: ReadonlyMap<string, string | null>,
  sample: { timelines: CoreAnimationTimelines; t: number } | null,
  sliders: readonly AttachmentApplication[],
  plant: { deform?: DeformEvaluator; deformBlend?: DeformBlender; sequence?: SequenceEvaluator; slotTimelines?: SlotTimelineGate } = {},
  /**
   * The live tracks' deforms (`./tracks.ts`, issue #1336), in place of a
   * sample's: each slot's deform array as the mixed entries left it (`null`
   * none) and the records their deform timelines keyed on it — what the
   * sample's own timelines would have set and seen. Absent on every other
   * caller.
   */
  mixed?: ReadonlyMap<string, { deform: number[] | null; seen: readonly string[] }>,
): { shown: ShownGeometry[]; why: string[] } {
  const evalDeform = plant.deform ?? deformAt;
  const blendOf = plant.deformBlend ?? blendDeform;
  const evalFrame = plant.sequence ?? sequenceFrameAt;
  const shown: ShownGeometry[] = [];
  const why: string[] = [];
  const active = activeBones(doc);
  const gate = plant.slotTimelines ?? slotTimelinesApply;
  for (const slot of doc.slots) {
    // A slot on a bone the skin leaves inactive is not animated: no deform, no frame, no slider switch (`./skins.ts`).
    const live = gate(doc, slot, active);
    let placeholder = placeholders.get(slot.name) ?? null;
    const base = live ? mixed?.get(slot.name) : undefined;
    let values: AttachmentValues | null = base === undefined || (base.deform === null && base.seen.length === 0) ? null : { deform: base.deform, frame: null, seen: [...base.seen] };
    let now = identityOf(doc, resolve, slot, placeholder);
    if (sample !== null && live) values = applyAttachment(now, values, sample.timelines.attachments, sample.t, null, evalDeform, blendOf, evalFrame);
    if (live) for (const app of sliders) {
      // Each slider switches first, clearing only the per-pose values; then its attachment timelines apply to the new identity.
      const switches = slotSwitches(app.timelines.slots, slot.name);
      if (switches !== undefined) for (const keys of switches) {
        const i = keyIndexAt(keys, app.at);
        if (i < 0) continue;
        const next = keys[i].name ?? null;
        if (next !== placeholder) {
          if (values !== null) {
            values.deform = null;
            values.frame = null;
          }
          placeholder = next;
          now = identityOf(doc, resolve, slot, placeholder);
        }
      }
      values = applyAttachment(now, values, app.timelines.attachments, app.at, app, evalDeform, blendOf, evalFrame);
    }
    if (now === null) continue;
    // The cached entry is frozen. A pose with a deform/frame owns its wrapper and values; later poses cannot write into it.
    const entry = values === null || (values.deform === null && values.frame === null) ? now.entry : { ...now.entry };
    shown.push(entry);
    if (values !== null && values.seen.length > 0 && now.fillers.length > 1) {
      why.push(`slot "${slot.name}" shows placeholder "${now.entry.placeholder}", which skins ${now.fillers.join(', ')} fill, and ${values.seen.map((x) => `"${x}"`).join(', ')} key(s) it — which record --skin all shows, and so whether the timeline moves it, is the Spine file's skin order, not the model's`);
      continue;
    }
    if (values !== null) {
      if (values.deform !== null) entry.deform = values.deform;
      if (values.frame !== null) entry.frame = values.frame;
    }
  }
  return { shown, why };
}
