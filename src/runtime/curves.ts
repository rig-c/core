/**
 * A keyed timeline compiled once for the runtime poser (issue #1591): its key
 * times and channel values as the oracle stores them (float32, `CoreKey.time`
 * and `.values`), each segment's curve kind, and every Bézier segment's
 * polyline evaluated at load by the oracle's own `bezierPolyline`, so that a
 * pose evaluates the segment the oracle evaluates and nothing else.
 *
 * The two reads a pose makes are the oracle's (`keyIndexAt` and `channelAt`
 * in `src/core/animation.ts`), operation for operation:
 *
 * - **The key at `t`** is the last key whose time is at or before `t`, −1
 *   before the first. The oracle scans from key 0 every time; the runtime
 *   walks a per-pose cursor from where the previous pose left it, backwards
 *   while the key's time is after `t` and forwards while the next one's is
 *   not. Over key times that never decrease (the reader refuses a key not
 *   after the one before, and float32 can only make two equal), both find the
 *   same key for every finite `t`. A `t` that is not finite is refused before
 *   any search (`RuntimeInputError`): the scan reads −1 for NaN and the
 *   cursor would read wherever it stood.
 * - **A channel's value** on the segment from key `i`: the key's own value on
 *   the last key and after a hold; `v0 + ((t − t0) / (t1 − t0)) · (v1 − v0)`
 *   on a linear segment; and on a Bézier segment the linear piece of the
 *   polyline whose end is the first point at or after `t`.
 *
 * Nothing here allocates once compiled.
 */
import { bezierPolyline, BEZIER_PIECES, type CoreKey } from '../core/animation.ts';

/** A segment's curve, per key. */
export const CURVE_LINEAR = 0;
export const CURVE_STEPPED = 1;
export const CURVE_BEZIER = 2;

/** Numbers in one channel's polyline: the segment's two ends and the nine interior points, each a time and a value. */
export const POLYLINE = 2 * (BEZIER_PIECES + 1);

/** One compiled timeline. `values` and `polylines` are by key, then by channel. */
export interface RuntimeCurve {
  readonly keys: number;
  readonly channels: number;
  readonly times: Float64Array;
  readonly values: Float64Array;
  readonly kinds: Uint8Array;
  /** `POLYLINE` numbers per key and channel; filled only where the key starts a Bézier segment. */
  readonly polylines: Float64Array;
}

/** A timeline's keys compiled; `channels` is how many values each key carries (0 for an attachment timeline). */
export function compileCurve(keys: readonly CoreKey[], channels: number): RuntimeCurve {
  const n = keys.length;
  const times = new Float64Array(n);
  const values = new Float64Array(n * channels);
  const kinds = new Uint8Array(n);
  const polylines = new Float64Array(n * channels * POLYLINE);
  for (let i = 0; i < n; i++) {
    const a = keys[i];
    times[i] = a.time;
    for (let c = 0; c < channels; c++) values[i * channels + c] = a.values[c];
    const curve = a.curve;
    kinds[i] = curve === 'linear' ? CURVE_LINEAR : curve === 'stepped' ? CURVE_STEPPED : CURVE_BEZIER;
    if (typeof curve === 'string' || i + 1 >= n) continue;
    const b = keys[i + 1];
    for (let c = 0; c < channels; c++) {
      // The oracle's polyline (`channelAt`): the segment's float32 ends around the recurrence over the numbers as the document states them.
      const inner = bezierPolyline(a.stated.time, a.stated.values[c], curve[c * 4], curve[c * 4 + 1], curve[c * 4 + 2], curve[c * 4 + 3], b.stated.time, b.stated.values[c]);
      const o = (i * channels + c) * POLYLINE;
      polylines[o] = a.time;
      polylines[o + 1] = a.values[c];
      for (let q = 0; q < inner.length; q++) polylines[o + 2 + q] = inner[q];
      polylines[o + POLYLINE - 2] = b.time;
      polylines[o + POLYLINE - 1] = b.values[c];
    }
  }
  return { keys: n, channels, times, values, kinds, polylines };
}

/** The last key at or before `t` (−1 before the first), found from `cursors[slot]` and left there — the header's first read. */
export function keyAt(curve: RuntimeCurve, cursors: Int32Array, slot: number, t: number): number {
  const times = curve.times;
  let i = cursors[slot];
  while (i >= 0 && times[i] > t) i--;
  while (i + 1 < curve.keys && times[i + 1] <= t) i++;
  cursors[slot] = i;
  return i;
}

/** Channel `c` of the segment starting at key `i` (at or after 0), at `t` — the header's second read. */
export function channelValue(curve: RuntimeCurve, i: number, c: number, t: number): number {
  const ch = curve.channels;
  const values = curve.values;
  const v0 = values[i * ch + c];
  if (i + 1 >= curve.keys) return v0;
  const kind = curve.kinds[i];
  if (kind === CURVE_STEPPED) return v0;
  if (kind === CURVE_LINEAR) {
    const t0 = curve.times[i];
    return v0 + ((t - t0) / (curve.times[i + 1] - t0)) * (values[(i + 1) * ch + c] - v0);
  }
  const p = curve.polylines;
  const o = (i * ch + c) * POLYLINE;
  let q = 2;
  while (q < POLYLINE - 2 && p[o + q] < t) q += 2;
  const x0 = p[o + q - 2];
  const y0 = p[o + q - 1];
  return y0 + ((t - x0) / (p[o + q] - x0)) * (p[o + q + 1] - y0);
}
