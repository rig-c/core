/**
 * The core's sixth construct: clipping applied to the draw (issue #964, §5
 * item 6 of the design on issue #380) — the oracle's `clipped` block, the
 * triangles every region and mesh drawn while a clip is active hands to the
 * runtime's clipper, as the clipper returns them.
 *
 * ## How every rule below was fixed
 *
 * By running spine-core 4.3.13's `SkeletonClipping` — `clipStart`,
 * `clipEnd(slot)`, `clipEnd()`, `isClipping` and `clipTrianglesUnpacked`, the
 * calls `src/render.ts` makes, in the order it makes them — on hand-written
 * skeletons and on random triangles and polygons, and reading what it
 * returned: the return value, `clippedVerticesTyped`, `clippedUVsTyped`,
 * `clippedTrianglesTyped`. The runtime's source was not read. Each rule is a
 * reading that reproduced every case measured, next to the readings the
 * measurements rejected. The core suite's `CL` controls hold a hand-written
 * skeleton of every case against the runtime at tolerance 0.
 *
 * ## When a clip is active — the draw walk
 *
 * The walk is `src/render.ts`'s `piecesOf`: slots in the posed draw order; at
 * a clipping attachment, end the clip if this slot is its end, then start
 * this clip if its slot's bone is active and no clip is active; at every
 * other slot, clip what it draws while a clip is active, then end the clip
 * if this slot is its end. Measured on one hand-written skeleton per case:
 *
 * | case | read |
 * | --- | --- |
 * | a clip ending at a slot | that slot is clipped, the one after it is not |
 * | ending at a slot that shows nothing | ends there all the same |
 * | ending at a slot drawn BEFORE the clip, or at its own slot | never ends: every later slot is clipped |
 * | no end slot | every later slot is clipped |
 * | a second clip while the first is active | ignored: a region inside the second and outside the first read wholly cut |
 * | a second clip after the first ended | applies |
 * | a clip ending at the slot of the next clip | the next clip starts there |
 * | a clip on an inactive bone | starts nothing |
 * | a region on an inactive bone under a clip | clipped like any other |
 *
 * ## What one triangle becomes
 *
 * The clip polygon is the clipping attachment's world polygon (the `clips`
 * row, `./vertices.ts`), unrounded. When its signed area is positive (counter
 * clockwise, y up) its vertices are reversed, so it is walked clockwise, and
 * its edges are taken from vertex 0: `(v0, v1), (v1, v2), …, (vn-1, v0)`.
 * A point is inside an edge `(p, q)` when `(q.x − p.x)(y − p.y) − (q.y −
 * p.y)(x − p.x) < 0`, strictly.
 *
 * Each triangle `(a, b, c)` of the attachment, in its own order, is clipped
 * edge by edge (Sutherland–Hodgman): walking the current polygon's sides
 * `(s, e)` from `(v0, v1)` round to `(vk, v0)`, an inside `s` with an inside
 * `e` keeps `e`; inside to outside adds the intersection; outside to inside
 * adds the intersection and then `e`; outside to outside adds nothing. The
 * intersection is `s + t·(e − s)` with `t = ((q.x − p.x)(s.y − p.y) − (q.y −
 * p.y)(s.x − p.x)) / ((q.y − p.y)(e.x − s.x) − (q.x − p.x)(e.y − s.y))`, in
 * doubles. A triangle no side of which was outside any edge is returned as it
 * came, `a, b, c` — not the rotation the walk leaves it in. A result of fewer
 * than three points adds nothing; otherwise its points are appended and fanned
 * from the first: `(0, 1, 2), (0, 2, 3), …` offset by the vertices already
 * written. The clipper stores vertices and UVs as float32: every number
 * written goes through `Math.fround`.
 *
 * A triangle no side of which was outside any edge keeps its corners' own
 * UVs (through `Math.fround`) rather than weighing them — the two agree on
 * the grid, and on three rows of `spineboy-pro`'s portal the weighed UV of a
 * corner at 0 read `2e-17` where the runtime holds 0 (issue #966, `dump
 * --raw`). Each point of a triangle that was cut has a UV barycentric over
 * the source triangle, from the unrounded
 * point: with `d = 1 / ((b.y − c.y)(a.x − c.x) + (c.x − b.x)(a.y − c.y))`,
 * `wa = ((b.y − c.y)(x − c.x) + (c.x − b.x)(y − c.y))·d`,
 * `wb = ((c.y − a.y)(x − c.x) + (a.x − c.x)(y − c.y))·d`, `wc = 1 − wa − wb`,
 * and `uv = ua·wa + ub·wb + uc·wc`, the corner UVs read through
 * `Math.fround`.
 *
 * The clipper returns `true` when any triangle had a point outside any edge,
 * else `false` — and `src/render.ts` then draws the attachment's own geometry.
 *
 * Measured on 2641 random cases, every polygon strictly convex, both
 * windings, one to three triangles of both windings each: 400 against
 * polygons of three to seven vertices, 600 whose intersections fall near the
 * origin, 1200 with corner UVs chosen so the weights' rounding shows, 300
 * cutting one edge once, and 141 random star polygons that came out convex —
 * the vertex list, the UVs, the triangle list and the return value exact on
 * 2641 of 2641. On the public corpus, `spineboy-pro`'s portal animation
 * (a three-vertex clip ending at a slot) reads IDENTICAL at tolerance 0 on
 * 4338 rows drawn under it (241 dense samples; 2653 left whole, 106 cut,
 * 1579 cut away). Rejected readings, each with what it read:
 *
 * | reading | read |
 * | --- | --- |
 * | the polygon's own winding, edges from vertex 0 | triangle lists 219 of 400; vertices 36 |
 * | the polygon made counter-clockwise, inside on the left | triangle lists 400; vertices in order 130 of 400 |
 * | a triangle wholly inside returned as the walk leaves it | 396 of 400 in order — the four wholly inside rotated |
 * | the polygon as its JSON spells it, through `Math.fround` | 79 of 400 exact: the world polygon carries the bone's matrix (`b` is `cos 90°` at the runtime's pi, −2.3e-8) |
 * | the intersection from the clip edge, `p + u·(q − p)` | 228 of 300 on a horizontal edge at y = 0, where `s + t·(e − s)` read 300 |
 * | the UV weights by a division rather than a reciprocal | 586 of 600 |
 * | the UV weights relative to `a` (`wb, wc` solved, `wa = 1 − wb − wc`) | 105 of 600 |
 *
 * ## What is not posed, and why
 *
 * The block is left out, naming the slot, when a clip that starts is one of:
 *
 * - ⚠️ **not strictly convex** — a reflex vertex, three collinear vertices or
 *   a repeated one. The runtime decomposes such a polygon into convex pieces
 *   and clips each triangle against each piece in turn: a covering triangle
 *   read the pieces (a notched square into three triangles, an L into two
 *   quads; a collinear vertex dropped; a repeated vertex clipped everything
 *   away). Which pieces, in which order and from which vertex is the
 *   runtime's own decomposition, and the dump alone did not fix it (issue
 *   #964's report). Posing it would be guessing an algorithm.
 * - **`inverse`** — the clip keeps what is outside the polygon, through a
 *   decomposition of the triangle around it (a covering triangle came back as
 *   fifteen vertices in five fans). Not measured past that.
 *
 * What the core DRAWS under such a clip — a decomposition of its own, the
 * `clipped` block still left out — is the last section of this file
 * (`clipThrough`, issue #964).
 *
 * `convex: true` on a strictly convex polygon changes nothing: 400 of 400
 * cases byte-identical with and without it. On a polygon that is not, the
 * runtime clips against its convex hull (a notched square with `convex` read
 * as the square); that is the first case above and is left out.
 */
/** One row of `clipped`: `[slot, attachment, clipped, vertices, uvs, triangles]`, the oracle's row. */
export type CoreClippedRow = [string, string, 0 | 1, Array<number | null>, Array<number | null>, number[]];

/** What the clipper returns for one attachment: the return value and the three arrays, unrounded to the oracle's grid. */
export interface ClipResult {
  clipped: boolean;
  vertices: number[];
  uvs: number[];
  triangles: number[];
  /** The source triangle (an index into the attachment's triangles by threes) each returned triangle was cut from — what the render samples it at (issue #964). */
  sources: number[];
}

type Pt = [number, number];

/**
 * The readings the header's table rejected, each a switch — what the core
 * suite's `CL` plants pass to show the gate names it. `clipTriangles` with
 * none set is the rule measured; nothing but a plant sets one.
 */
export interface ClipReading {
  /** Walk the polygon in its own winding, not clockwise. */
  ownWinding?: boolean;
  /** Walk the polygon counter-clockwise — the runtime's winding flipped. */
  flippedWinding?: boolean;
  /** Return a triangle wholly inside as the walk leaves it. */
  insideRotated?: boolean;
  /** Take the intersection from the clip edge, `p + u·(q − p)`. */
  fromClipEdge?: boolean;
  /** Divide the UV weights by the determinant rather than multiply by its reciprocal. */
  uvByDivision?: boolean;
}

/** A world polygon's signed area, doubled: positive when counter-clockwise (y up). */
export function signedArea2(polygon: readonly number[]): number {
  let a = 0;
  const n = polygon.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += polygon[2 * i] * polygon[2 * j + 1] - polygon[2 * j] * polygon[2 * i + 1];
  }
  return a;
}

/** Why a world polygon is not one the core clips against — not strictly convex — or null. */
export function convexWhy(polygon: readonly number[]): string | null {
  const n = polygon.length / 2;
  if (n < 3) return `it has ${n} vertex(es)`;
  let sign = 0;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = [polygon[2 * i], polygon[2 * i + 1]];
    const j = (i + 1) % n;
    const k = (i + 2) % n;
    const cross = (polygon[2 * j] - ax) * (polygon[2 * k + 1] - polygon[2 * j + 1]) - (polygon[2 * j + 1] - ay) * (polygon[2 * k] - polygon[2 * j]);
    if (cross === 0) return `vertices ${i}, ${j} and ${k} are collinear or repeated`;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return `vertex ${j} turns against the others (a reflex vertex)`;
  }
  return null;
}

/** The polygon walked clockwise, as the clipper walks it (the header). */
function clockwise(polygon: readonly number[], reading: ClipReading): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i + 1 < polygon.length; i += 2) pts.push([polygon[i], polygon[i + 1]]);
  if (reading.ownWinding === true) return pts;
  const cw = signedArea2(polygon) > 0 ? pts.reverse() : pts;
  return reading.flippedWinding === true ? cw.reverse() : cw;
}

function intersectFromClipEdge(s: Pt, e: Pt, p: Pt, q: Pt): Pt {
  const dx = e[0] - s[0];
  const dy = e[1] - s[1];
  const ex = q[0] - p[0];
  const ey = q[1] - p[1];
  const u = (dx * (s[1] - p[1]) - dy * (s[0] - p[0])) / (ey * dx - ex * dy);
  return [p[0] + u * ex, p[1] + u * ey];
}

function intersect(s: Pt, e: Pt, p: Pt, q: Pt): Pt {
  const dx = e[0] - s[0];
  const dy = e[1] - s[1];
  const ex = q[0] - p[0];
  const ey = q[1] - p[1];
  const t = (ex * (s[1] - p[1]) - ey * (s[0] - p[0])) / (ey * dx - ex * dy);
  return [s[0] + t * dx, s[1] + t * dy];
}

/** One triangle against the clockwise polygon: the points, and whether any side was outside any edge. */
function clipTriangle(tri: readonly Pt[], poly: readonly Pt[], reading: ClipReading): { points: Pt[]; cut: boolean } {
  const cross = reading.fromClipEdge === true ? intersectFromClipEdge : intersect;
  let input: Pt[] = [...tri];
  let cut = false;
  for (let i = 0; i < poly.length && input.length > 0; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const inside = (v: Pt): boolean => (q[0] - p[0]) * (v[1] - p[1]) - (q[1] - p[1]) * (v[0] - p[0]) < 0;
    const out: Pt[] = [];
    for (let k = 0; k < input.length; k++) {
      const s = input[k];
      const e = input[(k + 1) % input.length];
      const si = inside(s);
      const ei = inside(e);
      if (si) {
        if (ei) out.push(e);
        else {
          out.push(cross(s, e, p, q));
          cut = true;
        }
      } else {
        cut = true;
        if (ei) out.push(cross(s, e, p, q), e);
      }
    }
    input = out;
  }
  return { points: cut || reading.insideRotated === true ? input : [...tri], cut };
}

/**
 * An attachment's triangles clipped against a strictly convex world polygon —
 * the header's rule. `vertices` are the attachment's world vertices, `uvs`
 * one pair per vertex, `triangles` indices into them.
 */
export function clipTriangles(polygon: readonly number[], vertices: readonly number[], triangles: readonly number[], uvs: readonly number[], reading: ClipReading = {}): ClipResult {
  const poly = clockwise(polygon, reading);
  const f = Math.fround;
  const outV: number[] = [];
  const outUv: number[] = [];
  const outT: number[] = [];
  const sources: number[] = [];
  let clipped = false;
  for (let k = 0; k + 2 < triangles.length; k += 3) {
    const idx = [triangles[k], triangles[k + 1], triangles[k + 2]];
    const tri = idx.map((i): Pt => [vertices[2 * i], vertices[2 * i + 1]]);
    const tuv = idx.map((i): Pt => [f(uvs[2 * i]), f(uvs[2 * i + 1])]);
    const { points, cut } = clipTriangle(tri, poly, reading);
    for (let j = 1; j + 1 < points.length; j++) sources.push(k / 3);
    clipped ||= cut;
    if (points.length < 3) continue;
    const [a, b, c] = tri;
    const d0 = b[1] - c[1];
    const d1 = c[0] - b[0];
    const d2 = a[0] - c[0];
    const d4 = c[1] - a[1];
    const det = d0 * d2 + d1 * (a[1] - c[1]);
    const d = 1 / det;
    const weigh = (v: number): number => (reading.uvByDivision === true ? v / det : v * d);
    const base = outV.length / 2;
    // A triangle no side of which was outside any edge keeps its own corner UVs (issue #966): weighed barycentrically, a corner's UV of 0 reads 2e-17 off it, 3 rows of `spineboy-pro`'s portal.
    if (!cut && reading.insideRotated !== true) {
      tri.forEach(([x, y], k2) => {
        outV.push(f(x), f(y));
        outUv.push(tuv[k2][0], tuv[k2][1]);
      });
      for (let j = 1; j + 1 < points.length; j++) outT.push(base, base + j, base + j + 1);
      continue;
    }
    for (const [x, y] of points) {
      const wa = weigh(d0 * (x - c[0]) + d1 * (y - c[1]));
      const wb = weigh(d4 * (x - c[0]) + d2 * (y - c[1]));
      const wc = 1 - wa - wb;
      outV.push(f(x), f(y));
      outUv.push(f(tuv[0][0] * wa + tuv[1][0] * wb + tuv[2][0] * wc), f(tuv[0][1] * wa + tuv[1][1] * wb + tuv[2][1] * wc));
    }
    for (let j = 1; j + 1 < points.length; j++) outT.push(base, base + j, base + j + 1);
  }
  return { clipped, vertices: outV, uvs: outUv, triangles: outT, sources };
}

/** The clipper's reading of one attachment, replaceable by the suite's plants. */
export type TriangleClipper = (polygon: readonly number[], vertices: readonly number[], triangles: readonly number[], uvs: readonly number[]) => ClipResult;

/** One step of the draw walk: a slot, what its bone's activity is, and what it shows as the walk reads it. */
export type DrawStep =
  | { slot: string; kind: 'clip'; attachment: string; active: boolean; end: string | null; polygon: number[]; inverse: boolean; convex: boolean }
  | { slot: string; kind: 'draw'; attachment: string; vertices: readonly number[]; triangles: readonly number[]; uvs: readonly number[] }
  | { slot: string; kind: 'none' };

/**
 * The local UVs the oracle hands a region's four corners to the clipper with, in the corner order (bottom-left, upper-left, upper-right, bottom-right).
 * Frozen (issue #1530): every drawn region of every pose hands out this one array (`rawDrawn` in `./raw.ts`), so a write to it would reach every
 * frame a consumer holds — frozen, the write throws instead.
 */
export const REGION_UVS: readonly number[] = Object.freeze([0, 1, 0, 0, 1, 0, 1, 1]);
/** A region's two triangles over its four corners — the runtime's quad triangulation (`src/render.ts`'s `QUAD_TRIANGLES`). Frozen, as `REGION_UVS` is and for its reason. */
export const REGION_TRIANGLES: readonly number[] = Object.freeze([0, 1, 2, 2, 3, 0]);

/** `clipThrough`'s shape, replaceable by the render suite's plants (`RC08`'s dropped region). */
export type ShapeClipper = (shape: ClipShape, vertices: readonly number[], triangles: readonly number[], uvs: readonly number[]) => ClipResult | null;

/**
 * The `clipped` block from the draw walk (the header's first table), every
 * number through `round`, or why it is absent: a clip that starts over a
 * polygon the core does not reproduce the runtime's triangle list for (not
 * strictly convex, or inverse), each named.
 *
 * Beside it, `drawn`: the same walk's rows as the core DRAWS them — the block's
 * own rows wherever the block is posed, and, where a clip that is not strictly
 * convex or is inverse starts, that clip cut through `clipThrough` (a
 * decomposition of the core's own, held to the runtime by the render's pixels,
 * issue #964). `drawnWhy` names a clip the core does not draw at all (a
 * polygon that is not simple).
 */
export function poseClipped(
  walk: readonly DrawStep[],
  round: (v: number) => number | null,
  clip: TriangleClipper = clipTriangles,
  through: ShapeClipper = (shape, v, t, uv) => clipThrough(shape, v, t, uv, clip),
): { rows: CoreClippedRow[] | null; why: string | null; drawn: CoreClippedRow[] | null; drawnWhy: string | null } {
  const rows: CoreClippedRow[] = [];
  const refused: string[] = [];
  const undrawn: string[] = [];
  let active: { end: string | null; shape: ClipShape } | null = null;
  for (const step of walk) {
    if (step.kind === 'clip') {
      if (active !== null && active.end === step.slot) active = null;
      if (step.active && active === null) {
        const why = step.inverse ? 'it is inverse' : convexWhy(step.polygon);
        if (why !== null) refused.push(`slot "${step.slot}" starts clip "${step.attachment}", and ${why}`);
        const shape: ClipShape = { polygon: step.polygon, inverse: step.inverse, convex: step.convex };
        const plan = clipShapeOf(shape);
        if (plan.kind === 'refused') undrawn.push(`slot "${step.slot}" starts clip "${step.attachment}", and ${plan.why}`);
        active = { end: step.end, shape };
      }
      continue;
    }
    if (step.kind === 'draw' && active !== null) {
      const r = through(active.shape, step.vertices, step.triangles, step.uvs);
      if (r !== null) rows.push([step.slot, step.attachment, r.clipped ? 1 : 0, r.vertices.map(round), r.uvs.map(round), r.triangles]);
    }
    if (active !== null && active.end === step.slot) active = null;
  }
  const drawnWhy = undrawn.length === 0
    ? null
    : `${undrawn.join('; ')} — the runtime's coverage of a polygon that is not simple is its own triangulation's, measured not to be the polygon's area (src/core/clipping.ts)`;
  const drawn = drawnWhy === null ? rows : null;
  if (refused.length > 0) {
    return { rows: null, why: `${refused.join('; ')} — the runtime decomposes such a polygon into convex pieces of its own choosing, or clips the outside of an inverse one, and neither was reproduced from the dump (src/core/clipping.ts)`, drawn, drawnWhy };
  }
  return { rows, why: null, drawn, drawnWhy };
}

// ---------------------------------------------------------------------------
// #964 what the core draws under a concave or inverse clip
// ---------------------------------------------------------------------------
//
// The oracle's `clipped` block under such a clip is the runtime's own triangle list and stays
// absent by name (above). What the core DRAWS there is a decomposition of its own, and the claim
// it makes is coverage, not the list: the union of the pieces is the polygon whatever the pieces
// are. Every reading below was fixed by running spine-core 4.3.13's `SkeletonClipping` (the calls
// `src/render.ts` makes) and reading the area it returned; the source was not read, and the
// runtime's decomposition was not reconstructed. The runtime's documentation of the two flags
// (`ClippingAttachment.convex` / `.inverse` in its public type declarations) says `convex` clips
// by the convex hull of a polygon that is not convex, and that inverse clipping is always convex.
//
// | polygon | the core | measured against spine-core |
// | --- | --- | --- |
// | strictly convex, not inverse | the measured rule above, one piece: the oracle's rows | the header's 2641 cases |
// | simple, a reflex or a collinear vertex | collinear vertices dropped, ear clipping from vertex 0, pieces merged while strictly convex (Hertel–Mehlhorn); each triangle clipped against each piece in turn by the rule above | area and return value equal on every case of `CL05` |
// | `convex: true`, simple | its convex hull, one piece | area equal (`CL05`); the hull is the documented reading |
// | `inverse: true`, simple | the triangle outside the hull: for each hull edge in the walk, the part outside it and inside every edge before it | area and return value equal (`CL05`): the return value is `true` for every triangle, cut or not, as the runtime's was |
// | an otherwise strictly convex polygon with a repeated vertex, not inverse | the rule above as it stands: its zero-length edge has no inside, so nothing is drawn | the runtime drew nothing on 141 of 141 random cases |
// | a repeated vertex anywhere else | **refused**, naming the vertices | the runtime drew nothing on 11 of 159 random non-convex cases and the polygon's area on the other 148 — which, is its decomposition's |
// | not simple (edges crossing or touching) | **refused**, naming the edges | a self-overlapping six-vertex fan read an area of 2.67 where its even-odd fill is 26.7, its non-zero fill 29.4 and its shoelace area 32; its `convex` and `inverse` readings used the same 2.67 |
//
// ⭐ The render draws through this pixel for pixel as spine-core draws (`RC08`), because the
// rasteriser samples each drawn triangle at its SOURCE triangle's affine UV (`Mesh.source` in
// `src/render.ts`, the source index being `ClipResult.sources`): before that, a pixel falling in
// a sub-triangle other than the runtime's was sampled at a UV a few float32 steps off, and one
// level of one channel moved on up to 50 pixels of a probe's frame set — as much as the runtime's
// own render moved when the same polygon was spelled from another start vertex.

/**
 * A clip as the draw reads it: its world polygon and its two flags. Which
 * reading `clipThrough` takes is `clipShapeOf`'s (the table in this section's
 * header, `clipThrough`).
 */
export interface ClipShape {
  polygon: readonly number[];
  inverse: boolean;
  convex: boolean;
}

/**
 * How a clip is drawn through the core: `convex` — the measured rule above,
 * one piece, the oracle's `clipped` block reproduced to the bit; `pieces` —
 * a simple polygon that is not strictly convex, cut into convex pieces of the
 * core's own choosing; `inverse` — the outside of the polygon's convex hull;
 * `empty` — an otherwise strictly convex polygon with a repeated vertex, which
 * the measured rule itself clips everything away against. `refused` names why
 * the core does not draw it.
 */
export type ClipPlan =
  | { kind: 'convex'; polygon: readonly number[] }
  | { kind: 'pieces'; pieces: Pt[][] }
  | { kind: 'inverse'; hull: Pt[] }
  | { kind: 'refused'; why: string };

function pointsOf(polygon: readonly number[]): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i + 1 < polygon.length; i += 2) pts.push([polygon[i], polygon[i + 1]]);
  return pts;
}

function cross3(o: Pt, a: Pt, b: Pt): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

/** Whether segments `ab` and `cd` meet, touching included (exact arithmetic on the doubles given). */
function segmentsMeet(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const d1 = cross3(c, d, a);
  const d2 = cross3(c, d, b);
  const d3 = cross3(a, b, c);
  const d4 = cross3(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  const on = (p: Pt, q: Pt, r: Pt): boolean => Math.min(p[0], q[0]) <= r[0] && r[0] <= Math.max(p[0], q[0]) && Math.min(p[1], q[1]) <= r[1] && r[1] <= Math.max(p[1], q[1]);
  return (d1 === 0 && on(c, d, a)) || (d2 === 0 && on(c, d, b)) || (d3 === 0 && on(a, b, c)) || (d4 === 0 && on(a, b, d));
}

/** Why a polygon of distinct vertices is not simple — two edges that are not neighbours meet, or a neighbour folds back over its edge — or null. */
function selfCrossingWhy(pts: readonly Pt[]): string | null {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    // A neighbour folding back: the next edge runs back along this one.
    const c = pts[(i + 2) % n];
    if (cross3(a, b, c) === 0 && (c[0] - b[0]) * (a[0] - b[0]) + (c[1] - b[1]) * (a[1] - b[1]) > 0) return `edges ${i} and ${(i + 1) % n} fold back over each other at vertex ${(i + 1) % n}`;
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segmentsMeet(a, b, pts[j], pts[(j + 1) % n])) return `edges ${i} and ${j} cross or touch (the polygon is not simple)`;
    }
  }
  return null;
}

/** The polygon with every vertex dropped that lies on the line through its two neighbours — the area is the same. */
function withoutCollinear(pts: readonly Pt[]): Pt[] {
  let out = [...pts];
  for (let changed = true; changed && out.length > 3; ) {
    changed = false;
    for (let i = 0; i < out.length; i++) {
      const prev = out[(i + out.length - 1) % out.length];
      const next = out[(i + 1) % out.length];
      if (cross3(prev, out[i], next) === 0) {
        out = [...out.slice(0, i), ...out.slice(i + 1)];
        changed = true;
        break;
      }
    }
  }
  return out;
}

/** The convex hull (Andrew's monotone chain), counter-clockwise, no collinear vertex, from the lowest-leftmost point. */
function convexHull(pts: readonly Pt[]): Pt[] {
  const sorted = [...pts].sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const half = (list: readonly Pt[]): Pt[] => {
    const h: Pt[] = [];
    for (const p of list) {
      while (h.length >= 2 && cross3(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop();
      h.push(p);
    }
    h.pop();
    return h;
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

function ccw(pts: readonly Pt[]): Pt[] {
  const flat = pts.flat();
  return signedArea2(flat) < 0 ? [...pts].reverse() : [...pts];
}

/**
 * A simple counter-clockwise polygon with no collinear vertex cut into convex
 * pieces: ear clipping into triangles (the first ear from vertex 0, walking
 * forward), then every diagonal removed whose two pieces merge into a strictly
 * convex polygon (Hertel–Mehlhorn), in the order the diagonals were cut. Each
 * piece is counter-clockwise, over the polygon's own vertices — none added,
 * every one used.
 */
export function convexPieces(polygon: readonly number[]): number[][] {
  return piecesOf(ccw(withoutCollinear(pointsOf(polygon)))).map((piece) => piece.flat());
}

function piecesOf(pts: readonly Pt[]): Pt[][] {
  const n = pts.length;
  const idx = pts.map((_, i) => i);
  const tris: number[][] = [];
  const inTri = (p: Pt, a: Pt, b: Pt, c: Pt): boolean => cross3(a, b, p) >= 0 && cross3(b, c, p) >= 0 && cross3(c, a, p) >= 0;
  while (idx.length > 3) {
    let cut = false;
    for (let k = 0; k < idx.length; k++) {
      const i0 = idx[(k + idx.length - 1) % idx.length];
      const i1 = idx[k];
      const i2 = idx[(k + 1) % idx.length];
      if (cross3(pts[i0], pts[i1], pts[i2]) <= 0) continue;
      if (idx.some((j) => j !== i0 && j !== i1 && j !== i2 && inTri(pts[j], pts[i0], pts[i1], pts[i2]))) continue;
      tris.push([i0, i1, i2]);
      idx.splice(k, 1);
      cut = true;
      break;
    }
    if (!cut) throw new Error(`convexPieces: no ear left among vertices [${idx.join(', ')}] of a polygon the caller held simple — a defect in src/core/clipping.ts`);
  }
  tris.push([...idx]);
  // Hertel–Mehlhorn: merge across a shared edge while the union stays strictly convex.
  let pieces = tris.map((t) => [...t]);
  const strictlyConvex = (ring: readonly number[]): boolean => ring.every((v, i) => cross3(pts[ring[(i + ring.length - 1) % ring.length]], pts[v], pts[ring[(i + 1) % ring.length]]) > 0);
  for (let merged = true; merged; ) {
    merged = false;
    search: for (let a = 0; a < pieces.length; a++) {
      for (let b = a + 1; b < pieces.length; b++) {
        const A = pieces[a];
        const B = pieces[b];
        for (let i = 0; i < A.length; i++) {
          const u = A[i];
          const v = A[(i + 1) % A.length];
          const j = B.indexOf(v);
          if (j < 0 || B[(j + 1) % B.length] !== u) continue;
          // A walks u→v, B walks v→u: splice B's other vertices in between.
          const rest: number[] = [];
          for (let k = (j + 2) % B.length; k !== j; k = (k + 1) % B.length) rest.push(B[k]);
          const ring = [...A.slice(0, i + 1), ...rest, ...A.slice(i + 1)];
          if (!strictlyConvex(ring)) continue;
          pieces = [...pieces.slice(0, a), ring, ...pieces.slice(a + 1, b), ...pieces.slice(b + 1)];
          merged = true;
          break search;
        }
      }
    }
  }
  if (n !== new Set(pieces.flat()).size) throw new Error('convexPieces: a vertex is in no piece — a defect in src/core/clipping.ts');
  return pieces.map((ring) => ring.map((v) => pts[v]));
}

/**
 * Which reading a clip is drawn through (this section's `ClipPlan`), from its
 * world polygon and flags. A strictly convex polygon (`convexWhy` null) is the
 * measured rule whatever its flags say but `inverse`; `convex` on any other
 * simple polygon, and `inverse` always, read its convex hull, as the
 * runtime's own documentation of the two flags states.
 */
export function clipShapeOf(shape: ClipShape): ClipPlan {
  const pts = pointsOf(shape.polygon);
  if (pts.length < 3) return { kind: 'refused', why: `it has ${pts.length} vertex(es)` };
  const repeated: string[] = [];
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) if (pts[i][0] === pts[j][0] && pts[i][1] === pts[j][1]) repeated.push(`${i} and ${j}`);
  if (repeated.length > 0) {
    // Consecutive repeats of an otherwise strictly convex polygon: the measured rule, whose zero-length edge has no inside.
    const distinct = pts.filter((p, i) => { const q = pts[(i + 1) % pts.length]; return p[0] !== q[0] || p[1] !== q[1]; });
    if (!shape.inverse && distinct.length === pts.length - repeated.length && distinct.length >= 3 && convexWhy(distinct.flat()) === null) return { kind: 'convex', polygon: shape.polygon };
    return { kind: 'refused', why: `vertices ${repeated.join(', ')} are the same point` };
  }
  const crossing = selfCrossingWhy(pts);
  if (crossing !== null) return { kind: 'refused', why: crossing };
  const simple = withoutCollinear(pts);
  if (cross3(simple[0], simple[1], simple[2]) === 0 && simple.length === 3) return { kind: 'refused', why: 'every vertex lies on one line' };
  if (shape.inverse) return { kind: 'inverse', hull: convexHull(simple) };
  if (convexWhy(shape.polygon) === null) return { kind: 'convex', polygon: shape.polygon };
  if (shape.convex) return { kind: 'convex', polygon: convexHull(simple).flat() };
  const pieces = piecesOf(ccw(simple));
  return pieces.length === 1 ? { kind: 'convex', polygon: pieces[0].flat() } : { kind: 'pieces', pieces };
}

/** Clip `input` to the inside of the edge `(p, q)` — one Sutherland–Hodgman step of `clipTriangle`, the same inside test and intersection. */
function clipHalf(input: readonly Pt[], p: Pt, q: Pt): { points: Pt[]; cut: boolean } {
  const inside = (v: Pt): boolean => (q[0] - p[0]) * (v[1] - p[1]) - (q[1] - p[1]) * (v[0] - p[0]) < 0;
  const out: Pt[] = [];
  let cut = false;
  for (let k = 0; k < input.length; k++) {
    const s = input[k];
    const e = input[(k + 1) % input.length];
    const si = inside(s);
    const ei = inside(e);
    if (si) {
      if (ei) out.push(e);
      else {
        out.push(intersect(s, e, p, q));
        cut = true;
      }
    } else {
      cut = true;
      if (ei) out.push(intersect(s, e, p, q), e);
    }
  }
  return { points: out, cut };
}

/**
 * An attachment's triangles clipped against any clip the core draws
 * (`clipShapeOf`): the measured convex rule for a strictly convex polygon —
 * `clipTriangles` itself, so the oracle's rows stand — and otherwise, triangle
 * by triangle in the attachment's order, each convex region of the plan in
 * turn, every region cut exactly as a convex clip cuts it (a region a triangle
 * lies wholly inside keeps its corners and their UVs; a cut one is weighed and
 * fanned from its first point). `null` where the plan is refused.
 *
 * `inverse`: the regions are the triangle's parts outside the clockwise hull,
 * one per hull edge in the walk's order — outside edge `i` and inside every
 * edge before it — so they tile the triangle minus the hull without overlap.
 */
export function clipThrough(
  shape: ClipShape,
  vertices: readonly number[],
  triangles: readonly number[],
  uvs: readonly number[],
  clip: TriangleClipper = clipTriangles,
  reading: { dropRegion?: number } = {},
): ClipResult | null {
  let plan = clipShapeOf(shape);
  // CO11/CL01/CN06 and portal's convex rows need the original world doubles.
  // Two 66-point region/authored up_minus15 pieces witnesses went from 2 to 0
  // rendered pixel differences with Float32 input; SDK clipper storage was not observed.
  if (plan.kind === 'pieces') plan = clipShapeOf({ ...shape, polygon: shape.polygon.map(Math.fround) });
  if (plan.kind === 'refused') return null;
  if (plan.kind === 'convex') return clip(plan.polygon, vertices, triangles, uvs);
  const f = Math.fround;
  const outV: number[] = [];
  const outUv: number[] = [];
  const outT: number[] = [];
  const sources: number[] = [];
  let clipped = false;
  const regions = plan.kind === 'pieces' ? plan.pieces.map((piece) => clockwise(piece.flat(), {})) : null;
  const hull = plan.kind === 'inverse' ? clockwise(plan.hull.flat(), {}) : [];
  for (let k = 0; k + 2 < triangles.length; k += 3) {
    const idx = [triangles[k], triangles[k + 1], triangles[k + 2]];
    const tri = idx.map((i): Pt => [vertices[2 * i], vertices[2 * i + 1]]);
    const tuv = idx.map((i): Pt => [f(uvs[2 * i]), f(uvs[2 * i + 1])]);
    const parts: Array<{ points: Pt[]; cut: boolean }> = [];
    if (regions !== null) for (const poly of regions) parts.push(clipTriangle(tri, poly, {}));
    else {
      let remaining: Pt[] = [...tri];
      let cutSoFar = false;
      for (let i = 0; i < hull.length && remaining.length > 0; i++) {
        const p = hull[i];
        const q = hull[(i + 1) % hull.length];
        const outside = clipHalf(remaining, q, p);
        parts.push({ points: outside.cut || cutSoFar ? outside.points : [...tri], cut: outside.cut || cutSoFar });
        const inside = clipHalf(remaining, p, q);
        cutSoFar ||= inside.cut;
        remaining = inside.points;
      }
      clipped = true;
    }
    const [a, b, c] = tri;
    const d0 = b[1] - c[1];
    const d1 = c[0] - b[0];
    const d2 = a[0] - c[0];
    const d4 = c[1] - a[1];
    const d = 1 / (d0 * d2 + d1 * (a[1] - c[1]));
    for (const [r, { points, cut }] of parts.entries()) {
      clipped ||= cut;
      // `CL05`'s plant: one region of the plan dropped. Nothing but a plant sets it.
      if (r === reading.dropRegion) continue;
      if (points.length < 3) continue;
      const base = outV.length / 2;
      if (!cut) {
        tri.forEach(([x, y], k2) => {
          outV.push(f(x), f(y));
          outUv.push(tuv[k2][0], tuv[k2][1]);
        });
      } else {
        for (const [x, y] of points) {
          const wa = (d0 * (x - c[0]) + d1 * (y - c[1])) * d;
          const wb = (d4 * (x - c[0]) + d2 * (y - c[1])) * d;
          const wc = 1 - wa - wb;
          outV.push(f(x), f(y));
          outUv.push(f(tuv[0][0] * wa + tuv[1][0] * wb + tuv[2][0] * wc), f(tuv[0][1] * wa + tuv[1][1] * wb + tuv[2][1] * wc));
        }
      }
      for (let j = 1; j + 1 < points.length; j++) {
        outT.push(base, base + j, base + j + 1);
        sources.push(k / 3);
      }
    }
  }
  return { clipped, vertices: outV, uvs: outUv, triangles: outT, sources };
}
