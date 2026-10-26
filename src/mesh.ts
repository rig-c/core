/**
 * Procedural mesh geometry — three builders, two different jobs.
 *
 * `buildRingMesh` and `buildRibbonMesh` build the shape a DEFORMATION asks for,
 * and the long note below is theirs: what is pinned, what may move, how
 * authority falls off. `buildContourMesh` builds the shape the ART already is —
 * it traces a part's own alpha and triangulates it, and its own section further
 * down says why that makes it a shape rather than a deformation model.
 *
 * ## The ring and the ribbon
 *
 * The shape they build is the one a deformable aperture asks for: **the rim is
 * nailed down and only the inside moves.** For a face cut that ring is the mouth
 * aperture, and the rim already exists as data — the mask polygon in the cut
 * manifest is exactly the contour where the generated part fades into untouched
 * base pixels. Pin those vertices to the slot bone at weight 1 and the seam
 * cannot move, which is the whole reason a mesh is safe here at all.
 *
 * Three rings and a hub:
 *
 *     rim ring    = the part WINDOW edge            weight 1.0 -> anchor bone
 *     seam ring   = the manifest polygon            weight 1.0 -> anchor bone
 *     inner ring  = the polygon scaled toward the   weight w   -> control bone
 *                   aperture centre by `inner`
 *     hub         = the aperture centre             weight 1.0 -> control bone
 *
 * The rim ring is not decoration and the first cut of this code did not have it.
 * A generated part carries alpha well OUTSIDE its mask polygon — thousands of
 * pixels of it, on the one this was measured against — and that band is the
 * feather, the soft ramp that makes generated pixels blend into the base at all.
 * A mesh whose outer ring is the polygon simply does not draw them, and a render
 * probe caught exactly that: a halo of difference reaching several pixels past
 * the polygon, versus the rigid build of the same part. So the
 * mesh covers the whole region (rim ring on the window edge, uv 0 and 1) and the
 * polygon becomes an interior ring — pinned, because it is still the seam.
 *
 * The control bone carries every key, so key count is independent of vertex
 * count and a physics constraint could later be hung on the same bone for free.
 * There are no deform timelines: deforming the vertices directly is the fallback
 * for when procedural weighting fails, and it has not.
 *
 * Everything here is pure and integer-stable: same manifest in, same floats out
 * (assertion A18 recompiles and compares bytes).
 */
import type { ModelBinding, ModelVertices } from './model.ts';
import { hypot2 } from './numeric.ts';

// The mesh-quality measurement and its report (issue #1224) live in their own
// module and reach a dependant through this file, which is what
// `rig-c/mesh` names. That module imports helpers from this one, so the
// two form an import cycle: safe only because neither reads the other's
// bindings while it is being evaluated — every use is inside a function.
// The reduction (`reduceMesh`, stage B2 of #1224) sits in the same cycle, by
// the same rule. So does the skinning residual and its envelope helper
// (`src/meshskinning.ts`, issue #1294), which the measurement reads.
export * from './meshquality.ts';
export * from './meshreduce.ts';
export * from './meshskinning.ts';

export interface MeshSpecInput {
  /** Polygon in part-local pixels, y down, in manifest order. */
  hull: Array<[number, number]>;
  /** Aperture centre in part-local pixels, y down. */
  center: [number, number];
  /** Inner ring position: 0 = at the centre, 1 = on the hull. */
  inner: number;
  /** Part window size in pixels, for UVs. */
  size: [number, number];
  /** Optional directional weighting across the mouth line — see `sideWeight`. */
  bias?: { axis_deg: number; ramp: [number, number] };
  /**
   * Screen-space angle of each control bone as seen from the aperture centre, in
   * control-bone order. One entry keeps the single-bone behaviour exactly; more
   * than one splits the ring's authority by angular position, which is how four
   * grips make a ring expand unevenly without a key per vertex.
   */
  controlAngles?: number[];
}

/**
 * A lattice over the part window — the topology `docs/FACE.md` §4 turns a plate
 * into so that a `yaw` has somewhere to put its columns.
 *
 * ⭐ It exists because that lattice was being written BY HAND. `gallery/portrait`
 * shipped a 5x5 grid as 25 authored vertex pairs, 32 triangles and a perimeter
 * numbered in the one order Spine accepts, and every one of those numbers was
 * a person's arithmetic. A grid is the least interesting geometry in the format
 * and the easiest to get subtly wrong: the hull has to come first, in walk
 * order, or the loader silently treats interior vertices as the outline.
 *
 * ⚠️ `us` and `vs` are POSITIONS, not a count, and that is the point of the
 * shape. FACE §4.1 places columns where the drawing needs them — the worked
 * example's are 0.0235, 0.1471, 0.5, 0.8529, 0.9765, which is dense at the
 * silhouette and sparse across the middle — and a generator that could only
 * divide evenly would be a step backwards from the hand-written table it
 * replaces. Nor do they have to reach the window edge: that example's do not.
 */
export interface GridSpecInput {
  /** Part window size in pixels, for UVs and positions. */
  size: [number, number];
  /** Column positions across the window, 0..1, ascending. At least 2. */
  us: number[];
  /** Row positions down the window, 0..1, ascending. At least 2. */
  vs: number[];
}

export interface MeshVertexWeight {
  /** 'anchor' pins to the slot bone, 'control' to a control/chain bone. */
  bone: 'anchor' | 'control';
  /** Index into the control-bone list. Absent means 0. */
  control?: number;
  weight: number;
}

/** Which builder in this file made a mesh's geometry. */
export type MeshKind = 'ring' | 'ribbon' | 'contour' | 'grid' | 'segments';

export interface MeshGeometry {
  kind: MeshKind;
  /** Vertex positions in part-local pixels, y down. */
  points: Array<[number, number]>;
  /** Normalised region UVs, v measured from the top edge. */
  uvs: number[];
  /**
   * Triangle indices, counter-clockwise in Spine world (y up) — every builder
   * here, measured on spine-core's posed world by `CT15` in `selftest.ts`
   * (issue #1236: `contour` and `ring` wound the other way until then).
   */
  triangles: number[];
  /** Per-vertex weights, parallel to `points`. */
  weights: MeshVertexWeight[][];
  /** Hull vertex count — emitted as `hull`, which the loader doubles. */
  hullVertices: number;
  /** What the contour builder measured about its own fit. Only `contour` has one. */
  contour?: ContourReport;
}

/**
 * A two-wide strip along a bone chain — a trickle, a strap, a tail. It changes
 * length without changing width and its path curves; region scale cannot express
 * either, because scaling a region longer also makes it fatter.
 *
 * The width guarantee is structural, not a hope: the two vertices of a row carry
 * IDENTICAL weights, so whatever the chain does to one it does to the other, and
 * their separation can only rotate. Assertion A28 checks exactly that, which
 * turns "length without width" from a claim into a property of the file.
 */
export interface RibbonSpecInput {
  /** Part window size in pixels. The strip spans it, so uv 0 and 1 are covered. */
  size: [number, number];
  /** Cross rows, entry first. Triangles = 2 * (rows - 1). */
  rows: number;
  /** Number of chain bones after the anchor. */
  chainCount: number;
}

export class MeshError extends Error {}

/**
 * A refusal of the mesh-quality operations (`src/meshquality.ts`, issue #1224),
 * by code: a `MeshError`, so a dependant that already catches `MeshError` keeps
 * catching it, and `code` for one that wants to know which refusal it was. The
 * codes are listed in docs/MESH_REDUCTION.md beside the section that defines
 * each.
 *
 * ⚠️ Defined here and not in `src/meshquality.ts`, because that module imports
 * this one and this one re-exports it: a class that extends `MeshError` at the
 * top of the importing module would read `MeshError` before this module had
 * run, and every import of `rig-c/mesh` would throw.
 */
export class MeshReductionError extends MeshError {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.code = code;
    this.name = 'MeshReductionError';
  }
}

/**
 * The generator's own grid: 6 decimals, never "-0". Its rows, weights and
 * shares are built on it, and what it produces reaches the file through the
 * compiler's `f32` at emission (issue #716), so the emitted text is still each
 * number's float32 name — this is the generator's resolution, not the file's.
 */
export function r6(n: number): number {
  const v = Math.round(n * 1e6) / 1e6;
  return v === 0 ? 0 : v;
}

/**
 * Smoothstep falloff from the hub (r=0, full control) to the hull (r=1, none).
 *
 * A linear ramp puts a visible crease on the inner ring because the second
 * derivative jumps there; smoothstep is flat at both ends, so the deformation
 * dies into the pinned rim instead of hitting it.
 */
export function falloff(r: number): number {
  const t = Math.max(0, Math.min(1, r));
  return r6(1 - (3 * t * t - 2 * t * t * t));
}

/**
 * Directional authority across an axis: 0 on the negative side, 1 on the
 * positive side, smoothstep over `ramp`.
 *
 * This is what makes a jaw read as a jaw. A radial falloff alone deforms the
 * ring symmetrically, so opening the mouth drags the upper lip down with the
 * lower one and takes the upper teeth with it — measured on this art, the teeth
 * sit 15px on the negative side of the mouth line, squarely inside the moving
 * zone. Ramping authority across the line leaves everything above it pinned.
 */
export function sideWeight(signedDistance: number, ramp: [number, number]): number {
  const [d0, d1] = ramp;
  if (!(d1 > d0)) throw new MeshError(`bias ramp must increase, got [${d0}, ${d1}]`);
  const t = Math.max(0, Math.min(1, (signedDistance - d0) / (d1 - d0)));
  return r6(3 * t * t - 2 * t * t * t);
}

/** Signed area of a polygon in the given (y-down) coordinates. */
export function signedArea(poly: Array<[number, number]>): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

/**
 * Turn a triangle list built ALONG `poly` — every triple carrying the
 * polygon's own winding, as an ear-clip of it or a ring strip around it does —
 * counter-clockwise in Spine world, the winding `MeshGeometry.triangles`
 * promises. `poly` is in part-local pixels, y down.
 *
 * Counter-clockwise in Spine world (y up) is a NEGATIVE shoelace area in y-down
 * pixels: the flip changes the sign of the area and not the direction the loop
 * turns as drawn. So a polygon whose y-down area is positive — clockwise on
 * screen, and therefore clockwise in Spine world — has each triangle's last two
 * corners swapped, the way `buildSegmentsLattice` does per triangle; one with a
 * negative area is already right and is returned as it came. The triangle SET
 * is unchanged either way: only the order of two indices inside a triple moves.
 *
 * The decision is the polygon's, not each triangle's, so a near-collinear ear
 * whose own sign is rounding noise is turned with its neighbours rather than
 * read on its own (issue #1236 — `contour` and `ring` emitted every triangle
 * clockwise in Spine world before this existed, under comments that derived the
 * opposite from the y flip).
 */
export function windCounterClockwiseInSpineWorld(poly: Array<[number, number]>, triangles: readonly number[]): number[] {
  const out = triangles.slice();
  if (signedArea(poly) <= 0) return out;
  for (let t = 0; t + 2 < out.length; t += 3) [out[t + 1], out[t + 2]] = [out[t + 2], out[t + 1]];
  return out;
}

/**
 * Is every hull edge visible from `center`? If not, scaling the polygon toward
 * the centre can fold the inner ring through the rim and the triangles cross —
 * a mesh that loads with no error and renders as folded meat. Better to refuse.
 */
export function isStarShaped(poly: Array<[number, number]>, center: [number, number]): boolean {
  const area = signedArea(poly);
  const [cx, cy] = center;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    const cross = (x1 - x0) * (cy - y0) - (y1 - y0) * (cx - x0);
    if (cross * area <= 0) return false;
  }
  return true;
}

/**
 * Cast a ray from `center` through `through` and return the point where it
 * leaves the [0,w]x[0,h] window. The polygon lives inside the window, so the
 * ray always exits after it — this is what keeps the rim ring in 1:1
 * correspondence with the seam ring, and a clean quad strip between them.
 */
export function rayToWindowEdge(
  center: [number, number],
  through: [number, number],
  size: [number, number],
): [number, number] {
  const [cx, cy] = center;
  const [px, py] = through;
  const [w, h] = size;
  const dx = px - cx;
  const dy = py - cy;
  if (dx === 0 && dy === 0) throw new MeshError('a polygon vertex sits exactly on the aperture centre');
  let t = Infinity;
  if (dx > 0) t = Math.min(t, (w - cx) / dx);
  if (dx < 0) t = Math.min(t, (0 - cx) / dx);
  if (dy > 0) t = Math.min(t, (h - cy) / dy);
  if (dy < 0) t = Math.min(t, (0 - cy) / dy);
  if (!Number.isFinite(t) || t <= 0) throw new MeshError('ray to the window edge did not converge');
  return [r6(cx + dx * t), r6(cy + dy * t)];
}

export function buildRingMesh(input: MeshSpecInput): MeshGeometry {
  const { hull, center, inner, size } = input;
  const n = hull.length;
  if (n < 6) throw new MeshError(`hull needs at least 6 points, got ${n}`);
  if (!(inner > 0 && inner < 1)) throw new MeshError(`inner must be in (0,1), got ${inner}`);
  const [w, h] = size;
  if (!(w > 0 && h > 0)) throw new MeshError(`bad part size ${w}x${h}`);

  for (const [x, y] of hull) {
    if (x < 0 || y < 0 || x > w || y > h) {
      throw new MeshError(`hull point (${x},${y}) is outside the ${w}x${h} part window`);
    }
  }
  if (!isStarShaped(hull, center)) {
    throw new MeshError('hull is not star-shaped about the aperture centre; the inner ring would fold');
  }
  const [cx, cy] = center;
  if (cx < 0 || cy < 0 || cx > w || cy > h) {
    throw new MeshError(`aperture centre (${cx},${cy}) is outside the ${w}x${h} part window`);
  }

  const points: Array<[number, number]> = [];
  const weights: MeshVertexWeight[][] = [];
  const pin = (x: number, y: number) => {
    points.push([r6(x), r6(y)]);
    weights.push([{ bone: 'anchor', weight: 1 }]);
  };

  // ring 0 — the window edge. Covers the feather, so nothing the part draws is
  // outside the mesh; pinned, so uv 0/1 stay put.
  for (const [x, y] of hull) {
    const [ex, ey] = rayToWindowEdge(center, [x, y], size);
    pin(ex, ey);
  }
  // ring 1 — the mask contour. This IS the seam: pinned at weight 1.
  for (const [x, y] of hull) pin(x, y);
  // ring 2 — the aperture ring, shared between the two bones by the falloff and,
  // when a bias axis is declared, by which side of the mouth line it lands on.
  const wInner = falloff(inner);
  const axis = input.bias
    ? ([Math.cos((input.bias.axis_deg * Math.PI) / 180), Math.sin((input.bias.axis_deg * Math.PI) / 180)] as const)
    : null;
  // Normal of the mouth line, pointing to the jaw side (screen y down).
  const normal = axis ? ([-axis[1], axis[0]] as const) : null;
  const sideOf = (x: number, y: number): number => {
    if (!normal || !input.bias) return 1;
    return sideWeight((x - cx) * normal[0] + (y - cy) * normal[1], input.bias.ramp);
  };
  // Angular split across several control bones. With one control this collapses
  // to "all authority to control 0", which is the single-bone path byte for byte.
  const controlAngles = input.controlAngles ?? [0];
  if (controlAngles.length < 1) throw new MeshError('a ring mesh needs at least one control bone');
  const sorted = controlAngles
    .map((deg, index) => ({ index, deg: ((deg % 360) + 360) % 360 }))
    .sort((p, q) => (p.deg === q.deg ? p.index - q.index : p.deg - q.deg));
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].deg === sorted[i - 1].deg) {
      throw new MeshError(`two control bones share the angle ${sorted[i].deg} degrees about the aperture centre`);
    }
  }
  /** Which controls own the authority at this angle, and in what proportion. */
  const splitByAngle = (x: number, y: number): Array<{ index: number; share: number }> => {
    if (sorted.length === 1) return [{ index: sorted[0].index, share: 1 }];
    const deg = ((Math.atan2(y - cy, x - cx) * 180) / Math.PI + 360) % 360;
    let k = sorted.length - 1; // the wrap-around arc, unless we find a better one
    for (let i = 0; i < sorted.length; i++) {
      const next = (i + 1) % sorted.length;
      const from = sorted[i].deg;
      const to = sorted[next].deg + (next === 0 ? 360 : 0);
      const d = deg < from ? deg + 360 : deg;
      if (d >= from && d < to) {
        k = i;
        break;
      }
    }
    const next = (k + 1) % sorted.length;
    const from = sorted[k].deg;
    const to = sorted[next].deg + (next === 0 ? 360 : 0);
    const d = deg < from ? deg + 360 : deg;
    const t = to === from ? 0 : (d - from) / (to - from);
    // Smoothstep for the same reason the radial falloff uses it: a linear blend
    // puts a crease exactly on the bone's angle.
    const s = r6(3 * t * t - 2 * t * t * t);
    const out: Array<{ index: number; share: number }> = [];
    if (s < 1) out.push({ index: sorted[k].index, share: r6(1 - s) });
    if (s > 0) out.push({ index: sorted[next].index, share: s });
    return out;
  };
  const share = (x: number, y: number, base: number) => {
    const w = r6(base * sideOf(x, y));
    points.push([r6(x), r6(y)]);
    // A zero weight is not a weight: the validator rejects it (A20), and the
    // loader would happily read it as a bone that owns nothing.
    if (w <= 0) {
      weights.push([{ bone: 'anchor', weight: 1 }]);
      return;
    }
    const parts = splitByAngle(x, y);
    const vertex: MeshVertexWeight[] = [];
    if (w < 1) vertex.push({ bone: 'anchor', weight: r6(1 - w) });
    for (const part of parts) {
      const weight = r6(w * part.share);
      if (weight > 0) vertex.push({ bone: 'control', control: part.index, weight });
    }
    weights.push(vertex);
  };
  for (const [x, y] of hull) {
    share(cx + (x - cx) * inner, cy + (y - cy) * inner, wInner);
  }
  // hub — at the centre of the aperture, so the bias ramp decides its share too.
  share(cx, cy, 1);

  const uvs: number[] = [];
  for (const [x, y] of points) uvs.push(r6(x / w), r6(y / h));

  // Each triple below runs along the hull's own list order, so it carries the
  // hull's winding; `windCounterClockwiseInSpineWorld` then turns the list to
  // the winding every generator here emits (issue #1236).
  const along: number[] = [];
  const hub = 3 * n;
  const strip = (outerBase: number, innerBase: number) => {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      along.push(outerBase + i, outerBase + j, innerBase + j);
      along.push(outerBase + i, innerBase + j, innerBase + i);
    }
  };
  strip(0, n); // window edge -> seam
  strip(n, 2 * n); // seam -> aperture ring
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    along.push(2 * n + i, 2 * n + j, hub);
  }
  const triangles = windCounterClockwiseInSpineWorld(hull, along);

  return { kind: 'ring', points, uvs, triangles, weights, hullVertices: n };
}

/**
 * The angles `buildRingMesh` splits a ring's authority by, measured from where
 * the rig actually put each control bone.
 *
 * ⚠️ It is a function because it was a copy, and only one of the two callers had
 * it (issue #684). The manifest route measured these angles; the rig-spec route
 * passed none, so `controlAngles ?? [0]` collapsed the split and a rig naming two
 * grips got the single-bone geometry — the second bone on the `MESH` line, bound
 * by no vertex, and the whole gate green. What the two routes still do for
 * themselves is turn a bone's WORLD position into the part-local pixels this ring
 * is built in, because that is the part that genuinely differs: a manifest has a
 * crop to flip against, and a rig spec centres the window on its own slot bone.
 * Everything from the subtraction on is here.
 *
 * `positionOf` is a callback rather than an array so that the single-control rule
 * below is the only thing that decides whether a position is needed at all.
 *
 * One control needs no angle: it owns the whole ring, and a face rig deliberately
 * puts it ON the aperture centre, where a radial direction does not exist. That
 * is `undefined` rather than `[0]`, so the single-bone path stays byte for byte
 * what it was — and it is why the refusal below cannot fire on a ring with one
 * control, whose bone is *expected* to sit there.
 */
export function ringControlAngles(
  controls: readonly string[],
  center: readonly [number, number],
  positionOf: (name: string) => readonly [number, number],
): number[] | undefined {
  if (controls.length <= 1) return undefined;
  return controls.map((name) => {
    const [x, y] = positionOf(name);
    const dx = x - center[0];
    const dy = y - center[1];
    if (hypot2(dx, dy) < 1e-6) {
      throw new MeshError(`control bone "${name}" sits on the aperture centre, so it has no radial direction`);
    }
    return (Math.atan2(dy, dx) * 180) / Math.PI;
  });
}

/**
 * Build a ribbon strip.
 *
 * Vertices run in PERIMETER order — left side entry-to-tip, then right side
 * tip-to-entry — so the emitted `hull` is the real outline rather than a
 * convenient prefix. That matters because `hull` is data other tools read, and a
 * strip's outline genuinely is all of its vertices.
 *
 * Weights: knot 0 is the anchor bone at the entry point, knots 1..C are the chain
 * bones, spaced evenly along the strip. A row between two knots blends linearly
 * between them, and BOTH vertices of the row get the same blend. The entry row is
 * pinned to the anchor at weight 1, which is what keeps the drip's origin at the
 * entry point while the rest of it falls — assertion A21's ribbon branch.
 */
export function buildRibbonMesh(input: RibbonSpecInput): MeshGeometry {
  const { rows, chainCount } = input;
  const [w, h] = input.size;
  if (!(w > 0 && h > 0)) throw new MeshError(`bad part size ${w}x${h}`);
  if (!Number.isInteger(rows) || rows < 3) throw new MeshError(`ribbon needs at least 3 rows, got ${rows}`);
  if (!Number.isInteger(chainCount) || chainCount < 1) {
    throw new MeshError(`ribbon needs at least one chain bone, got ${chainCount}`);
  }

  const points: Array<[number, number]> = [];
  const weights: MeshVertexWeight[][] = [];
  const rowWeights: MeshVertexWeight[][] = [];
  for (let i = 0; i < rows; i++) {
    // s runs 0 at the entry to 1 at the tip; knots sit at k / chainCount.
    const s = (i / (rows - 1)) * chainCount;
    const lo = Math.min(Math.floor(s), chainCount - 1);
    const t = r6(s - lo);
    const vertex: MeshVertexWeight[] = [];
    // knot index 0 is the anchor bone; 1..chainCount are chain[0..chainCount-1].
    const push = (knot: number, weight: number) => {
      if (weight <= 0) return;
      if (knot === 0) vertex.push({ bone: 'anchor', weight: r6(weight) });
      else vertex.push({ bone: 'control', control: knot - 1, weight: r6(weight) });
    };
    push(lo, 1 - t);
    push(lo + 1, t);
    rowWeights.push(vertex);
  }
  const rowY = (i: number) => r6((i / (rows - 1)) * h);
  // left side, entry -> tip
  for (let i = 0; i < rows; i++) {
    points.push([0, rowY(i)]);
    weights.push(rowWeights[i]);
  }
  // right side, tip -> entry
  for (let i = rows - 1; i >= 0; i--) {
    points.push([r6(w), rowY(i)]);
    weights.push(rowWeights[i]);
  }

  const uvs: number[] = [];
  for (const [x, y] of points) uvs.push(r6(x / w), r6(y / h));

  // Quad strip. Left row i is index i; right row i is index (2*rows - 1 - i).
  const triangles: number[] = [];
  const L = (i: number) => i;
  const R = (i: number) => 2 * rows - 1 - i;
  for (let i = 0; i < rows - 1; i++) {
    triangles.push(L(i), L(i + 1), R(i + 1));
    triangles.push(L(i), R(i + 1), R(i));
  }

  return { kind: 'ribbon', points, uvs, triangles, weights, hullVertices: 2 * rows };
}

// ---------------------------------------------------------------------------
// contour — a mesh cut to the part's own alpha silhouette
// ---------------------------------------------------------------------------
//
// The ring and the ribbon build a shape the DEFORMATION wants. This one builds
// the shape the ART already is: trace the alpha mask, simplify the outline,
// push it out by a margin, triangulate. What it is for is the case those two
// cannot express — a part whose outline is the interesting thing, where a
// rectangle of region is either too much geometry (a whole quad of transparent
// pixels to blend) or too little (no vertices to move where the silhouette is).
//
// 🚨 **It is geometry, not a deformation model.** Every vertex is pinned to the
// slot bone at weight 1, so a contour mesh at rest draws what the region drew
// and a bone cannot bend it. What it gains over a region is a real outline and
// real triangles: a `deform` timeline has somewhere to push, `hull` states the
// silhouette other tools can read, and the shape is measured rather than
// declared. Bone-driven interior motion is what `ring` is for, and authored
// `weights` is what an editor's own auto-weighting arrives as.
//
// Every claim this builder makes about its own output it MEASURES:
// `measureContourFit` rasterises the emitted triangles against the very mask
// they were traced from and the build is refused unless the triangles cover
// `CONTOUR_MIN_COVERAGE` of the art and stay within the margin the author asked
// for. A mesh that clips the art is the one failure mode that cannot be seen in
// the numbers of a skeleton file, so it is not left to a reader to notice.

/** One part's alpha channel, as the tracer wants it. */
/**
 * Build the lattice: perimeter first in walk order, then the interior.
 *
 * The numbering is not a preference. Spine's `hull` is a COUNT — the first
 * `hull` entries of the vertex array are the outline — so the perimeter has to
 * be listed first and in the order it is walked, or the runtime reads an
 * interior vertex as a boundary one. `checkHullOrder` says the same thing from
 * the other side, and this builder is written to satisfy it by construction
 * rather than to be checked against it afterwards.
 *
 * Winding is read off the worked example rather than derived here: its first
 * two triangles are `[0, 15, 16]` and `[0, 16, 1]`, which is
 * `[top-left, bottom-left, bottom-right]` and `[top-left, bottom-right,
 * top-right]` per cell — counter-clockwise in Spine world once y is flipped up.
 */
export function buildGridMesh(input: GridSpecInput): MeshGeometry {
  const { size, us, vs } = input;
  const [w, h] = size;
  const axis = (values: number[], name: string): void => {
    if (!Array.isArray(values) || values.length < 2) {
      throw new MeshError(`"${name}" has ${Array.isArray(values) ? values.length : 0} positions; a grid needs at least 2 on each axis`);
    }
    values.forEach((t, i) => {
      if (typeof t !== 'number' || !Number.isFinite(t)) throw new MeshError(`"${name}"[${i}] is ${JSON.stringify(t)}; positions are finite numbers`);
      if (t < 0 || t > 1) throw new MeshError(`"${name}"[${i}] is ${t}; positions are fractions of the part window, 0..1`);
      // Equal neighbours would put two vertices in one place and collapse a
      // whole row or column of triangles to zero area — a mesh that loads,
      // draws and cannot be deformed, which is the silence this refuses.
      if (i > 0 && !(t > values[i - 1])) {
        throw new MeshError(`"${name}" is not ascending: [${i - 1}]=${values[i - 1]} and [${i}]=${t}`);
      }
    });
  };
  axis(us, 'us');
  axis(vs, 'vs');
  if (!(w > 0) || !(h > 0)) throw new MeshError(`the part window is ${w}x${h}; a grid needs a positive size`);

  const cols = us.length;
  const rows = vs.length;
  // Grid coordinate -> vertex index, filled as the two passes below number them.
  const index: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(-1));
  const points: Array<[number, number]> = [];
  const place = (i: number, j: number): void => {
    index[j][i] = points.length;
    points.push([r6(us[i] * w), r6(vs[j] * h)]);
  };

  // 1. the perimeter, clockwise in part-local space (y down).
  for (let i = 0; i < cols; i++) place(i, 0);
  for (let j = 1; j < rows; j++) place(cols - 1, j);
  for (let i = cols - 2; i >= 0; i--) place(i, rows - 1);
  for (let j = rows - 2; j >= 1; j--) place(0, j);
  const hullVertices = points.length;
  // 2. the interior, row major.
  for (let j = 1; j < rows - 1; j++) for (let i = 1; i < cols - 1; i++) place(i, j);

  const triangles: number[] = [];
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const tl = index[j][i];
      const tr = index[j][i + 1];
      const bl = index[j + 1][i];
      const br = index[j + 1][i + 1];
      triangles.push(tl, bl, br, tl, br, tr);
    }
  }

  const uvs: number[] = [];
  for (const [x, y] of points) uvs.push(r6(x / w), r6(y / h));
  // Every vertex on the slot bone at weight 1, the same weighting model a
  // `contour` has: the lattice is geometry to deform, not an authority split.
  const weights: MeshVertexWeight[][] = points.map(() => [{ bone: 'anchor', weight: 1 }]);

  return { kind: 'grid', points, uvs, triangles, weights, hullVertices };
}

export interface AlphaMask {
  width: number;
  height: number;
  /** One byte per pixel, row major, y down. `width * height` long. */
  alpha: Uint8Array;
}

export interface ContourSpecInput {
  mask: AlphaMask;
  /** Alpha at or above this counts as art. 1 means "any pixel that is not fully transparent". */
  threshold: number;
  /** Douglas-Peucker tolerance, in the drawing's pixels. */
  tolerance: number;
  /** How far the outline is pushed out past the traced silhouette, in the drawing's pixels. */
  margin: number;
  /** Refuse rather than emit more outline vertices than this. */
  maxVertices: number;
  /**
   * The `scale:` the page the mask was lifted off STATES, when that is not 1 —
   * texels per pixel of the drawing. Absent, the mask is the drawing and
   * `tolerance` and `margin` are applied as they are.
   *
   * 📐 Present, the mask is the page's texels, and the two distances are
   * applied as `value × pageScale` texels (issue #779): they are the author's
   * statement, written in the unit every other size in the spec is in, and
   * applying them on a finer or coarser grid unconverted asked a different
   * question of each page — one spec traced 15, 11 and 66 vertices on the
   * declared-size, `scale: 0.5` and `scale: 2` restatements of one drawing.
   * Never a measured ratio: the page's header is what says how big a texel is.
   */
  pageScale?: number;
}

/** What the contour builder measured while building — reported, not asserted in prose. */
export interface ContourReport {
  /** Pixels at or above the threshold. */
  artPixels: number;
  /** Pixels in the largest 4-connected island of art. */
  islandPixels: number;
  /** How many 4-connected islands of art the mask holds. */
  islands: number;
  /** Transparent pixels the traced outline encloses — inside the mesh, drawing nothing. */
  holePixels: number;
  /** Corner-lattice vertices the trace produced, before simplification. */
  tracedVertices: number;
  /** Fraction of art pixels the emitted triangles cover, 0..1. */
  coverage: number;
  /** Furthest a covered pixel sits outside the filled silhouette, in pixels. */
  overshoot: number;
}

/**
 * The share of the art the triangles must cover, or the build is refused.
 *
 * Not 1. The outline is simplified, and a simplification that could never cut a
 * corner is not a simplification — so the guarantee is a stated fraction and the
 * measured number goes in the report, rather than an exactness nobody can hold.
 */
export const CONTOUR_MIN_COVERAGE = 0.995;

/**
 * How far a mitred corner may travel, as a multiple of `margin`.
 *
 * A sharp spike's angle bisector runs away to infinity — `margin / sin(θ/2)` —
 * and an unlimited miter turns a 5-degree point into a vertex hundreds of pixels
 * off the art. Clamping the travel gives that corner a slightly cut tip instead,
 * which the coverage measurement then either accepts or refuses.
 */
export const CONTOUR_MITER_LIMIT = 4;

/**
 * The furthest a contour mesh CAN reach past the filled silhouette, in pixels,
 * derived rather than chosen.
 *
 * Three terms, and each one is a step of the build: the offset moves a vertex at
 * most `margin * CONTOUR_MITER_LIMIT` (the miter clamp is what makes that a
 * bound at all), simplification can bow an edge `tolerance` outward, and a pixel
 * whose CENTRE lands inside a triangle can sit up to one pixel from the shape's
 * true edge. So a build that exceeds this is not an author's margin being
 * generous — it is this file's arithmetic being wrong, and `buildContourMesh`
 * refuses it in those words.
 *
 * ⭐ It is a ceiling, not a forecast. The number a given part actually measures
 * is in its `ContourReport.overshoot`, which is where to read "how closely does
 * this mesh hug this art": the selftest's blob measures 3.16px against a ceiling
 * of 10.50px at the same settings.
 */
export function contourOvershootBound(margin: number, tolerance: number): number {
  return margin * CONTOUR_MITER_LIMIT + tolerance + 1;
}

/** Cracks run clockwise on screen (y down): +x, +y, -x, -y. */
const CRACK_DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

/** Perpendicular distance from `p` to the segment `a`-`b`, clamped to its ends. */
export function distanceToSegment(
  p: readonly [number, number],
  a: readonly [number, number],
  b: readonly [number, number],
): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  if (len === 0) return hypot2(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len;
  t = Math.max(0, Math.min(1, t));
  return hypot2(p[0] - (a[0] + dx * t), p[1] - (a[1] + dy * t));
}

/**
 * Douglas-Peucker over one open polyline, returning the indices it keeps.
 *
 * Iterative rather than recursive: a 4000-vertex staircase (a 1000x1000 part
 * traced on the corner lattice) recurses deeper than is comfortable, and the
 * stack version is the same algorithm with the frames written down.
 */
function simplifyRun(points: Array<[number, number]>, from: number, to: number, tolerance: number): number[] {
  const keep = new Uint8Array(to - from + 1);
  keep[0] = 1;
  keep[to - from] = 1;
  const stack: Array<[number, number]> = [[from, to]];
  while (stack.length) {
    const [lo, hi] = stack.pop()!;
    if (hi <= lo + 1) continue;
    let worst = -1;
    let worstAt = -1;
    for (let i = lo + 1; i < hi; i++) {
      const d = distanceToSegment(points[i], points[lo], points[hi]);
      if (d > worst) {
        worst = d;
        worstAt = i;
      }
    }
    if (worst <= tolerance || worstAt < 0) continue;
    keep[worstAt - from] = 1;
    stack.push([lo, worstAt], [worstAt, hi]);
  }
  const out: number[] = [];
  for (let i = 0; i < keep.length; i++) if (keep[i]) out.push(from + i);
  return out;
}

/**
 * Douglas-Peucker over a CLOSED ring.
 *
 * The algorithm is defined for a polyline with two fixed ends, and a ring has
 * none — so the ring is cut at its first vertex and at the vertex furthest from
 * it, and the two arcs are simplified independently. Cutting at the diameter
 * rather than at an arbitrary second point is what keeps the two arcs from being
 * a long one and a stub, whose simplification would then be lopsided.
 */
export function simplifyClosedPolygon(poly: Array<[number, number]>, tolerance: number): Array<[number, number]> {
  const n = poly.length;
  if (n < 4 || !(tolerance > 0)) return poly.slice();
  let far = 1;
  let farD = -1;
  for (let i = 1; i < n; i++) {
    const d = hypot2(poly[i][0] - poly[0][0], poly[i][1] - poly[0][1]);
    if (d > farD) {
      farD = d;
      far = i;
    }
  }
  const rotated = [...poly.slice(0), poly[0]]; // one open run 0..far, one far..n
  const first = simplifyRun(rotated, 0, far, tolerance);
  const second = simplifyRun(rotated, far, n, tolerance);
  const out: Array<[number, number]> = [];
  for (const i of first) out.push(poly[i]);
  for (const i of second.slice(1, second.length - 1)) out.push(poly[i % n]);
  return out;
}

/**
 * Push a simple polygon out along its own vertex bisectors.
 *
 * ⭐ The traced outline runs on the corner lattice, so it already encloses every
 * art pixel WHOLE and a margin of 0 clips nothing. What the margin is actually
 * for is the simplification: Douglas-Peucker moves a vertex up to `tolerance` in
 * either direction, and the inward half of that is a bite out of the art. So the
 * useful setting is `margin >= tolerance`, and the coverage measurement is what
 * says whether a given pair got there.
 *
 * `poly` must be clockwise on screen (positive `signedArea` in y-down pixels),
 * which is what the tracer produces; outward is then to the left of travel.
 */
export function offsetPolygon(poly: Array<[number, number]>, margin: number): Array<[number, number]> {
  const n = poly.length;
  if (margin === 0) return poly.map(([x, y]) => [x, y] as [number, number]);
  const out: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const prev = poly[(i + n - 1) % n];
    const here = poly[i];
    const next = poly[(i + 1) % n];
    const e1 = unit(here[0] - prev[0], here[1] - prev[1]);
    const e2 = unit(next[0] - here[0], next[1] - here[1]);
    // Outward normal of an edge running (dx, dy) on a clockwise screen polygon.
    const n1: [number, number] = [e1[1], -e1[0]];
    const n2: [number, number] = [e2[1], -e2[0]];
    let bx = n1[0] + n2[0];
    let by = n1[1] + n2[1];
    let len = hypot2(bx, by);
    if (len < 1e-9) {
      // A 180-degree turn: the two edges double back, so there is no bisector.
      // The incoming edge's own normal is the only direction that is outward for
      // both, and a spike this thin is a candidate for the coverage refusal.
      bx = n1[0];
      by = n1[1];
      len = 1;
    }
    bx /= len;
    by /= len;
    const project = Math.max(bx * n1[0] + by * n1[1], 1 / CONTOUR_MITER_LIMIT);
    out.push([here[0] + (bx * margin) / project, here[1] + (by * margin) / project]);
  }
  return out;
}

function unit(dx: number, dy: number): [number, number] {
  const len = hypot2(dx, dy);
  return len < 1e-12 ? [0, 0] : [dx / len, dy / len];
}

/** Drop repeated and exactly collinear vertices, so no ear can have zero area. */
export function prunePolygon(poly: Array<[number, number]>): Array<[number, number]> {
  const dedup: Array<[number, number]> = [];
  for (const p of poly) {
    const last = dedup[dedup.length - 1];
    if (last && Math.abs(last[0] - p[0]) < 1e-9 && Math.abs(last[1] - p[1]) < 1e-9) continue;
    dedup.push([p[0], p[1]]);
  }
  while (dedup.length > 1) {
    const a = dedup[0];
    const b = dedup[dedup.length - 1];
    if (Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9) dedup.pop();
    else break;
  }
  // Collinear runs, repeatedly: removing one vertex can make its neighbours
  // collinear in turn, and a single pass would leave those behind.
  let changed = true;
  while (changed && dedup.length > 3) {
    changed = false;
    for (let i = 0; i < dedup.length; i++) {
      const p = dedup[(i + dedup.length - 1) % dedup.length];
      const h = dedup[i];
      const q = dedup[(i + 1) % dedup.length];
      const cross = (h[0] - p[0]) * (q[1] - h[1]) - (h[1] - p[1]) * (q[0] - h[0]);
      if (Math.abs(cross) < 1e-9) {
        dedup.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return dedup;
}

/** Do two segments share a point? Touching counts — an ear needs strict simplicity. */
export function segmentsMeet(
  a: readonly [number, number],
  b: readonly [number, number],
  c: readonly [number, number],
  d: readonly [number, number],
): boolean {
  const o = (p: readonly [number, number], q: readonly [number, number], r: readonly [number, number]): number => {
    const v = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    return Math.abs(v) < 1e-9 ? 0 : Math.sign(v);
  };
  const onSegment = (p: readonly [number, number], q: readonly [number, number], r: readonly [number, number]): boolean =>
    o(p, q, r) === 0 &&
    Math.min(p[0], q[0]) - 1e-9 <= r[0] &&
    r[0] <= Math.max(p[0], q[0]) + 1e-9 &&
    Math.min(p[1], q[1]) - 1e-9 <= r[1] &&
    r[1] <= Math.max(p[1], q[1]) + 1e-9;
  const o1 = o(a, b, c);
  const o2 = o(a, b, d);
  const o3 = o(c, d, a);
  const o4 = o(c, d, b);
  // An epsilon-zero orientation is not a strict side of a line. In that case
  // only the endpoint tests below can establish contact (including the bounds).
  if (o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0 && o1 !== o2 && o3 !== o4) return true;
  return onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b);
}

/**
 * The first pair of non-adjacent edges that meet, or null when the polygon is
 * strictly simple.
 *
 * "Meet" includes touching at a point, and that strictness is load-bearing: the
 * two-ears theorem holds for a strictly simple polygon, so an ear-clipper that
 * runs on one cannot stall. Accepting a polygon that touches itself would trade a
 * named refusal for a build that either stalls or emits a fan of slivers.
 */
export function findSelfIntersection(poly: Array<[number, number]>): [number, number] | null {
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue;
      if (segmentsMeet(a, b, poly[j], poly[(j + 1) % n])) return [i, j];
    }
  }
  return null;
}

/** Is `p` inside (or on) the triangle `a,b,c` wound in `orient`? */
function pointInTriangle(
  p: readonly [number, number],
  a: readonly [number, number],
  b: readonly [number, number],
  c: readonly [number, number],
  orient: number,
): boolean {
  const side = (u: readonly [number, number], v: readonly [number, number]): number =>
    ((v[0] - u[0]) * (p[1] - u[1]) - (v[1] - u[1]) * (p[0] - u[0])) * orient;
  return side(a, b) >= -1e-9 && side(b, c) >= -1e-9 && side(c, a) >= -1e-9;
}

/**
 * Ear clipping over one strictly simple polygon, concave welcome.
 *
 * ## What it does
 *
 * Repeatedly find a vertex whose two edges make a convex turn in the polygon's
 * own winding and whose triangle holds no other vertex, emit it as a triangle,
 * and remove it. The emitted triples carry the polygon's own winding — the
 * order its list runs in — and nothing else decides it: clipping the same
 * outline mirrored picks the same ears in the same order and writes the same
 * triples. ⚠️ A y flip does NOT turn that winding over. Flipping y changes the
 * sign of a signed area, but the y-up frame is drawn with y up, so the loop
 * turns the same way on screen as it does in Spine world: an outline that is
 * clockwise on screen (positive `signedArea` in y-down pixels) yields
 * triangles that are clockwise in Spine world. A caller that emits them turns
 * them with `windCounterClockwiseInSpineWorld` (issue #1236: this paragraph
 * said the opposite, and `contour` emitted clockwise for that reason).
 *
 * ## What it refuses, and why by name
 *
 * - **Holes.** There is no bridging step here, so a polygon is an outline and
 *   nothing else. `traceAlphaOutline` therefore hands over the OUTER boundary and
 *   reports the enclosed transparent area rather than cutting it out; those
 *   pixels are inside the mesh and draw nothing, because their alpha is still 0.
 * - **Self-intersection**, including a polygon that merely touches itself:
 *   refused upstream by `findSelfIntersection`, because the two-ears theorem — the
 *   guarantee that this loop terminates — is a statement about a strictly simple
 *   polygon.
 * - **No ear found** while three or more vertices remain. On a strictly simple
 *   polygon that cannot happen, so reaching it means an input this function was
 *   promised it would not get, and it says so instead of emitting a fan of
 *   slivers that would load and render as folded art.
 *
 * O(n²) per ear, O(n³) overall, and deliberately so: `maxVertices` bounds n at
 * the tens, an outline that needs thousands of vertices is not a mesh anybody
 * wants in a runtime's inner loop, and a sweep-line would be a second geometry
 * kernel to be wrong in.
 */
export function earClip(poly: Array<[number, number]>): number[] {
  const n = poly.length;
  if (n < 3) throw new MeshError(`a polygon needs at least 3 vertices to triangulate, got ${n}`);
  const area = signedArea(poly);
  if (Math.abs(area) < 1e-9) throw new MeshError('the polygon encloses no area, so it has no triangles');
  const orient = area > 0 ? 1 : -1;
  const live: number[] = [];
  for (let i = 0; i < n; i++) live.push(i);
  const triangles: number[] = [];
  while (live.length > 3) {
    let clipped = false;
    for (let k = 0; k < live.length; k++) {
      const ia = live[(k + live.length - 1) % live.length];
      const ib = live[k];
      const ic = live[(k + 1) % live.length];
      const a = poly[ia];
      const b = poly[ib];
      const c = poly[ic];
      const turn = ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])) * orient;
      if (turn <= 1e-12) continue; // reflex or straight: not an ear
      let blocked = false;
      for (const j of live) {
        if (j === ia || j === ib || j === ic) continue;
        if (pointInTriangle(poly[j], a, b, c, orient)) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      triangles.push(ia, ib, ic);
      live.splice(k, 1);
      clipped = true;
      break;
    }
    if (!clipped) {
      throw new MeshError(
        `ear clipping stalled with ${live.length} of ${n} vertices left: every remaining corner is reflex or ` +
          'covers another vertex, which a strictly simple polygon cannot be — the outline is degenerate',
      );
    }
  }
  triangles.push(live[0], live[1], live[2]);
  return triangles;
}

/** Which pixels of a mask are art, as 1/0 bytes. */
export function artOf(mask: AlphaMask, threshold: number): Uint8Array {
  const out = new Uint8Array(mask.width * mask.height);
  for (let i = 0; i < out.length; i++) out[i] = mask.alpha[i] >= threshold ? 1 : 0;
  return out;
}

/** 4-connected island labels, 1-based; 0 is background. */
export function labelIslands(art: Uint8Array, w: number, h: number): { label: Int32Array; sizes: number[] } {
  const label = new Int32Array(w * h);
  const sizes: number[] = [];
  const stack: number[] = [];
  for (let start = 0; start < art.length; start++) {
    if (!art[start] || label[start]) continue;
    const id = sizes.length + 1;
    let size = 0;
    label[start] = id;
    stack.push(start);
    while (stack.length) {
      const at = stack.pop()!;
      size++;
      const x = at % w;
      const y = (at - x) / w;
      const push = (nx: number, ny: number): void => {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) return;
        const to = ny * w + nx;
        if (!art[to] || label[to]) return;
        label[to] = id;
        stack.push(to);
      };
      push(x - 1, y);
      push(x + 1, y);
      push(x, y - 1);
      push(x, y + 1);
    }
    sizes.push(size);
  }
  return { label, sizes };
}

/**
 * Trace the outer boundary of the largest island of art, on the pixel-CORNER
 * lattice.
 *
 * ## Why the corner lattice and not the pixel centres
 *
 * A contour through pixel centres runs half a pixel inside the art all the way
 * round, so the outermost row of every edge falls outside the mesh — a mesh that
 * clips the art by half a pixel everywhere, which is exactly the defect this
 * whole builder has to not have. On the corner lattice the traced polygon
 * encloses every art pixel's full square, so the raw trace clips nothing at all
 * and everything after it is a controlled retreat from that.
 *
 * ## The walk
 *
 * Each art pixel whose neighbour is background contributes one directed "crack"
 * along the shared edge, wound so that the art stays on the walker's right: top
 * edge to +x, right edge to +y, bottom to -x, left to -y. Those cracks form
 * closed loops. Starting at the first art pixel in row order — whose top
 * neighbour is background by construction — and always taking the sharpest
 * clockwise turn available walks the island's outer loop.
 *
 * ⚠️ The clockwise rule is not a preference. At a corner where two art pixels
 * meet diagonally, two cracks leave the same point and the choice decides whether
 * the walk treats the diagonal as connected. Clockwise keeps it disconnected,
 * which is the same 4-connectivity `labelIslands` used — the alternative would
 * trace a boundary for an island the labelling says is two.
 */
export function traceAlphaOutline(
  mask: AlphaMask,
  threshold: number,
): {
  outline: Array<[number, number]>;
  artPixels: number;
  islandPixels: number;
  islands: number;
  holePixels: number;
  /** The filled silhouette: the island plus every transparent pixel it encloses. */
  filled: Uint8Array;
} {
  const { width: w, height: h } = mask;
  if (!(w > 0 && h > 0)) throw new MeshError(`bad part size ${w}x${h}`);
  if (mask.alpha.length !== w * h) {
    throw new MeshError(`the alpha mask holds ${mask.alpha.length} bytes for a ${w}x${h} part`);
  }
  const art = artOf(mask, threshold);
  let artPixels = 0;
  for (const bit of art) artPixels += bit;
  if (artPixels === 0) {
    throw new MeshError(`no pixel of the ${w}x${h} part reaches alpha ${threshold}; there is no silhouette to trace`);
  }
  const { label, sizes } = labelIslands(art, w, h);
  let biggest = 1;
  for (let i = 0; i < sizes.length; i++) if (sizes[i] > sizes[biggest - 1]) biggest = i + 1;
  const inside = new Uint8Array(w * h);
  for (let i = 0; i < inside.length; i++) inside[i] = label[i] === biggest ? 1 : 0;

  // The silhouette the walk traces is the island WITH ITS HOLES FILLED, and it is
  // built before the pinch scan because the scan has to read the same pixels the
  // walk does. A corner where two holes meet diagonally is inside the filled
  // silhouette, and the outer outline never visits it; scanning the island
  // before the fill refused such a part for a pinch no outline passes through
  // (issue #1209).
  //
  // ⚠️ A hole is background that no 8-connected path of background reaches from
  // the border, not merely no 4-connected one. The island is 4-connected, so two
  // background pixels that touch only at a corner are connected through it — the
  // same duality the walk's clockwise rule keeps. With a 4-connected flood a
  // transparent pixel that touches the outside only diagonally would read as a
  // hole, the fill would close the pinch at that corner, and the part would trace
  // a region the art does not enclose: that is filling a pinch, not a hole. On
  // every part this function accepts the two floods fill the same pixels — they
  // can only differ across a corner the scan below refuses.
  const { filled, holePixels } = fillEnclosed(inside, w, h, 8);
  const at = (x: number, y: number): number => (x < 0 || y < 0 || x >= w || y >= h ? 0 : filled[y * w + x]);
  /** Outgoing cracks at one lattice corner, as direction indices. */
  const outgoing = (cx: number, cy: number): number[] => {
    const dirs: number[] = [];
    if (at(cx, cy) && !at(cx, cy - 1)) dirs.push(0); // this pixel's top edge
    if (at(cx - 1, cy) && !at(cx, cy)) dirs.push(1); // left neighbour's right edge
    if (at(cx - 1, cy - 1) && !at(cx - 1, cy)) dirs.push(2); // upper-left's bottom edge
    if (at(cx, cy - 1) && !at(cx - 1, cy - 1)) dirs.push(3); // upper's left edge
    return dirs;
  };

  // A DIAGONAL PINCH is refused before the walk, not during it. At a corner where
  // two pixels of the filled silhouette meet diagonally with background on the
  // other diagonal, two cracks leave the same point — so the boundary is not a
  // set of simple loops any more, and whichever pairing the walk chooses it
  // either passes through one point twice or leaves part of the outline
  // untraced. Both are silent: the second one produces a perfectly valid mesh of
  // the wrong region. Scanning for it costs one pass and names the pixel corner.
  // Background here is what the fill left, so both pixels on that diagonal are
  // reached from outside the part: the corner is on the outer outline itself.
  // The remedy names a direction for each outcome because a threshold moves art
  // one way only: raising it removes pixels, which can open a pinch and never
  // close one, and lowering it adds them.
  for (let cy = 0; cy <= h; cy++) {
    for (let cx = 0; cx <= w; cx++) {
      const tl = at(cx - 1, cy - 1);
      const tr = at(cx, cy - 1);
      const bl = at(cx - 1, cy);
      const br = at(cx, cy);
      if ((tl && br && !tr && !bl) || (tr && bl && !tl && !br)) {
        throw new MeshError(
          `the alpha silhouette pinches to a single point at pixel corner (${cx},${cy}), where two parts of the art ` +
            'meet diagonally — one outline cannot pass through one point twice. Move the alpha threshold so the ' +
            'pinch opens (raise it) or closes (lower it), or author the geometry as weights',
        );
      }
    }
  }

  // The first filled pixel in row order is an island pixel: a hole's upper
  // neighbour is never background the border reaches, so no hole sits on the
  // silhouette's top row.
  let startAt = -1;
  for (let i = 0; i < filled.length; i++) {
    if (filled[i]) {
      startAt = i;
      break;
    }
  }
  const sx = startAt % w;
  const sy = (startAt - sx) / w;
  // With no pinch anywhere, every corner has at most one outgoing crack, so the
  // boundary is a simple loop and this walk traces it. The holes have no loop
  // of their own to enter, because the walk reads the filled silhouette: their
  // pixels are inside the outline and draw nothing, and `holePixels` counts them.
  const outline: Array<[number, number]> = [];
  let cx = sx;
  let cy = sy;
  let dir = 0;
  const limit = 2 * (w + 1) * (h + 1) + 8;
  for (let step = 0; ; step++) {
    if (step > limit) throw new MeshError('the alpha trace did not close; the mask is not a closed region');
    outline.push([cx, cy]);
    cx += CRACK_DIRS[dir][0];
    cy += CRACK_DIRS[dir][1];
    if (cx === sx && cy === sy) break;
    const dirs = outgoing(cx, cy);
    // Sharpest clockwise turn first: right, straight, left. A reversal is not
    // reachable on a crack set, so its absence is not a case to handle.
    const next = [(dir + 1) % 4, dir, (dir + 3) % 4].find((d) => dirs.includes(d));
    if (next === undefined) {
      throw new MeshError(`the alpha trace reached a dead end at corner (${cx},${cy}); the mask is not a closed region`);
    }
    dir = next;
  }

  return { outline, artPixels, islandPixels: sizes[biggest - 1], islands: sizes.length, holePixels, filled };
}

/**
 * A set of pixels plus every background pixel it encloses.
 *
 * Flooded from outside the part, so "enclosed" is decided by REACHABILITY rather
 * than by a winding rule — which is what makes it answer the same question for a
 * mask of one island and a mask of several, and is why the authored-mesh
 * measurement can pass it all the art where the trace passes it one island.
 *
 * `background` is how the flood steps: 4 through edges, 8 through corners too.
 * The trace floods 8 — the dual of its 4-connected island, so background that
 * meets the outside at a corner is outside — and says why where it calls this.
 * The authored-mesh measurement floods 4 by default, as it always has, and 8
 * when its caller asks (issue #1262); the two agree on every mask the trace
 * accepts.
 */
export function fillEnclosed(
  inside: Uint8Array,
  w: number,
  h: number,
  background: 4 | 8,
): { filled: Uint8Array; holePixels: number } {
  const outsideReach = new Uint8Array(w * h);
  const queue: number[] = [];
  const seed = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (inside[i] || outsideReach[i]) return;
    outsideReach[i] = 1;
    queue.push(i);
  };
  for (let x = 0; x < w; x++) {
    seed(x, 0);
    seed(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    seed(0, y);
    seed(w - 1, y);
  }
  while (queue.length) {
    const i = queue.pop()!;
    const x = i % w;
    const y = (i - x) / w;
    seed(x - 1, y);
    seed(x + 1, y);
    seed(x, y - 1);
    seed(x, y + 1);
    if (background === 8) {
      seed(x - 1, y - 1);
      seed(x + 1, y - 1);
      seed(x - 1, y + 1);
      seed(x + 1, y + 1);
    }
  }
  const filled = new Uint8Array(w * h);
  let holePixels = 0;
  for (let i = 0; i < filled.length; i++) {
    if (inside[i]) filled[i] = 1;
    else if (!outsideReach[i]) {
      filled[i] = 1;
      holePixels++;
    }
  }
  return { filled, holePixels };
}

/**
 * Which pixels of a `w`x`h` grid a triangle set draws over.
 *
 * A pixel counts as covered when its CENTRE is in or on a triangle, which is the
 * same convention `src/render.ts` rasterises by. A degenerate triangle — zero
 * doubled area — is skipped rather than given an orientation it does not have.
 */
export function rasteriseTriangles(points: Array<[number, number]>, triangles: number[], w: number, h: number): Uint8Array {
  const covered = new Uint8Array(w * h);
  for (let t = 0; t + 2 < triangles.length; t += 3) {
    const a = points[triangles[t]];
    const b = points[triangles[t + 1]];
    const c = points[triangles[t + 2]];
    const box = triangleRasterBox(a, b, c, w, h);
    if (box === null) continue;
    for (let y = box.minY; y <= box.maxY; y++) {
      for (let x = box.minX; x <= box.maxX; x++) {
        if (covered[y * w + x]) continue;
        if (pixelCentreInTriangle(x, y, a, b, c, box.orient)) covered[y * w + x] = 1;
      }
    }
  }
  return covered;
}

/**
 * The pixels of a `w`x`h` grid one triangle can cover under `rasteriseTriangles`'s
 * rule — the box of its corners widened by a pixel and clamped to the grid —
 * and the orientation its centre test reads; null for a degenerate triangle
 * (zero doubled area), which covers nothing. `rasteriseTriangles` and the
 * per-step coverage of `src/meshrasters.ts` both read the rule from here and
 * from `pixelCentreInTriangle`, so the two cannot drift apart.
 */
export function triangleRasterBox(
  a: readonly [number, number],
  b: readonly [number, number],
  c: readonly [number, number],
  w: number,
  h: number,
): { orient: number; minX: number; maxX: number; minY: number; maxY: number } | null {
  const twice = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  if (Math.abs(twice) < 1e-12) return null;
  return {
    orient: twice > 0 ? 1 : -1,
    minX: Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]) - 1)),
    maxX: Math.min(w - 1, Math.ceil(Math.max(a[0], b[0], c[0]) + 1)),
    minY: Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]) - 1)),
    maxY: Math.min(h - 1, Math.ceil(Math.max(a[1], b[1], c[1]) + 1)),
  };
}

/**
 * Is the centre of pixel (`x`, `y`) in or on the triangle — `rasteriseTriangles`'s
 * test, with the orientation `triangleRasterBox` gave. `pointInTriangle` at
 * `[x + 0.5, y + 0.5]`, written out without the point array: the same three
 * products, in the same order, against the same tolerance.
 */
export function pixelCentreInTriangle(x: number, y: number, a: readonly [number, number], b: readonly [number, number], c: readonly [number, number], orient: number): boolean {
  const px = x + 0.5;
  const py = y + 0.5;
  return (
    ((b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0])) * orient >= -1e-9 &&
    ((c[0] - b[0]) * (py - b[1]) - (c[1] - b[1]) * (px - b[0])) * orient >= -1e-9 &&
    ((a[0] - c[0]) * (py - c[1]) - (a[1] - c[1]) * (px - c[0])) * orient >= -1e-9
  );
}

/**
 * Rasterise a triangle set over the part's pixel grid and measure two things the
 * skeleton file cannot say: how much of the art the mesh covers, and how far past
 * the silhouette it reaches.
 *
 * Coverage is against the ART (every pixel at or above the threshold, on any
 * island), so a second island the outline could never reach shows up as missing
 * coverage rather than as a passing build. Overshoot is against the FILLED
 * silhouette — the island plus the transparent pixels it encloses — because a
 * hole the mesh spans is not the mesh reaching past the art, it is the mesh
 * spanning a gap in it, and those pixels draw nothing either way.
 *
 * A pixel counts as covered when its CENTRE is in or on a triangle, which is the
 * same convention `src/render.ts` rasterises by. `radius` bounds the distance
 * search: nothing beyond it needs a number, because a mesh that reaches that far
 * out is refused whatever the exact figure is.
 */
export function measureContourFit(
  mask: AlphaMask,
  threshold: number,
  filled: Uint8Array,
  points: Array<[number, number]>,
  triangles: number[],
  radius: number,
): { coverage: number; overshoot: number; artPixels: number; coveredArt: number } {
  const { width: w, height: h } = mask;
  const art = artOf(mask, threshold);
  const covered = rasteriseTriangles(points, triangles, w, h);
  let artPixels = 0;
  let coveredArt = 0;
  for (let i = 0; i < art.length; i++) {
    if (!art[i]) continue;
    artPixels++;
    if (covered[i]) coveredArt++;
  }
  const reach = Math.max(1, Math.ceil(radius));
  let overshoot = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!covered[i] || filled[i]) continue;
      let best = reach + 1;
      for (let dy = -reach; dy <= reach; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -reach; dx <= reach; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          if (!filled[ny * w + nx]) continue;
          const d = hypot2(dx, dy);
          if (d < best) best = d;
        }
      }
      if (best > overshoot) overshoot = best;
    }
  }
  return {
    coverage: artPixels === 0 ? 0 : coveredArt / artPixels,
    overshoot: r6(overshoot),
    artPixels,
    coveredArt,
  };
}

/** What a mesh's triangles measure against the art the attachment names. */
export interface MeshFitReport {
  /** Pixels at or above the threshold. */
  artPixels: number;
  /** How many of them a triangle covers. */
  coveredArt: number;
  /** `coveredArt / artPixels`, 0..1. */
  coverage: number;
  /** Furthest a covered pixel sits outside the filled silhouette, in pixels. */
  overshoot: number;
}

/**
 * The same measurement for geometry rigc did NOT build — issue #277.
 *
 * ## Why an authored mesh can be measured at all
 *
 * Issue #44's lesson was that rigc must not apply a GENERATOR's topology rules to
 * authored geometry: where a rim is, how rows pair, which edge is pinned. It did
 * not build the mesh, so it cannot know any of that. Coverage is not topology.
 * It is a number between two things the compiler has in front of it — the emitted
 * triangles, and the PNG the attachment names with `image` — and it assumes
 * nothing whatever about how the vertices are arranged. The defect it catches is
 * the renderer's, not the author's: texture outside the triangles is not drawn,
 * so art outside the mesh disappears on every runtime. A 9-vertex fan whose 8 rim
 * vertices sit exactly on a round part's silhouette loses its whole ink outline
 * between the spokes — an octagon's sides pass `R·cos(π/8)` from its centre — and
 * measured 94.31%, five points under the bar the same art would have been refused
 * at as a `contour`, with nothing in the report saying so.
 *
 * ## Two differences from `measureContourFit`, both deliberate
 *
 * **The filled silhouette is ALL the art plus what it encloses**, not the largest
 * island plus what that encloses. A contour is one traced loop and can only ever
 * enclose one island; an authored mesh over a part drawn as several islands is
 * ordinary, correct data.
 *
 * **The overshoot search has no radius.** `measureContourFit` bounds it because a
 * contour past its bound is refused and needs no exact figure. An authored mesh
 * is never refused, so every figure needs a number — hence the exact distance
 * transform below rather than a neighbourhood search that would have to stop
 * somewhere.
 *
 * ## Which background is enclosed — `connectivity` (issue #1262)
 *
 * The background is flooded 4-connected by default, as it always has been, so
 * every call that passes four arguments reads exactly what it read before.
 * `8` floods through corners too — the fill `measureMeshQuality`'s
 * `MQ_OVERSHOOT` and `MQ_HOLES` rows are taken against (P12), by the same
 * `fillEnclosed` call — so a background pocket joined to the outside only
 * diagonally is read as outside, and a caller gating with this figure reads
 * the number the rows read. The two fills agree on every mask without such a
 * pocket. Any other value is refused by name: a silent fallback to one of the
 * two would answer a question the caller did not ask.
 */
export function measureAuthoredMeshFit(
  mask: AlphaMask,
  threshold: number,
  points: Array<[number, number]>,
  triangles: number[],
  connectivity: 4 | 8 = 4,
): MeshFitReport {
  return authoredMeshFitOf(mask, threshold, points, triangles, connectivity, null).report;
}

/**
 * A fault planted on purpose in `authoredMeshFitOf`, for the mesh-quality
 * suite's negative control: `'fill-4-under-8'` takes the connectivity it is
 * passed and floods 4 whatever it was. `measureAuthoredMeshFit` plants none.
 */
export type AuthoredFitPlant = 'fill-4-under-8';

/**
 * `measureAuthoredMeshFit`'s measurement, with the pixel its overshoot is
 * read at — the first covered pixel outside the filled silhouette at the
 * largest distance, by the tie rule `MQ_OVERSHOOT` names its pixel with, or
 * -1 when no covered pixel lies outside — so a control can name where two
 * readings part.
 */
export function authoredMeshFitOf(
  mask: AlphaMask,
  threshold: number,
  points: Array<[number, number]>,
  triangles: number[],
  connectivity: 4 | 8,
  plant: AuthoredFitPlant | null,
): { report: MeshFitReport; overshootAt: number } {
  if (connectivity !== 4 && connectivity !== 8) {
    throw new MeshError(`measureAuthoredMeshFit: connectivity is ${JSON.stringify(connectivity)}; required 4 (the default, the legacy fill) or 8 (the fill MQ_OVERSHOOT reads, P12)`);
  }
  const { width: w, height: h } = mask;
  const art = artOf(mask, threshold);
  const { filled } = fillEnclosed(art, w, h, plant === 'fill-4-under-8' ? 4 : connectivity);
  const covered = rasteriseTriangles(points, triangles, w, h);
  let artPixels = 0;
  let coveredArt = 0;
  for (let i = 0; i < art.length; i++) {
    if (!art[i]) continue;
    artPixels++;
    if (covered[i]) coveredArt++;
  }
  const squared = squaredDistanceToSet(filled, w, h);
  let worst = 0;
  let overshootAt = -1;
  for (let i = 0; i < covered.length; i++) {
    if (!covered[i] || filled[i]) continue;
    if (overshootAt === -1 || squared[i] > worst) {
      overshootAt = i;
      worst = squared[i];
    }
  }
  return {
    report: {
      artPixels,
      coveredArt,
      coverage: artPixels === 0 ? 0 : coveredArt / artPixels,
      overshoot: r6(Math.sqrt(worst)),
    },
    overshootAt,
  };
}

/**
 * Exact squared Euclidean distance from every pixel to the nearest set pixel of
 * `inside`, by the two-pass lower-envelope transform (Felzenszwalb-Huttenlocher).
 *
 * Two one-dimensional passes — down each column, then along each row of the
 * result — because the squared Euclidean distance separates across axes:
 * `min_p (x-px)² + (y-py)²` is the lower envelope of one parabola per candidate,
 * and a pass builds that envelope in one sweep. Exact, and linear in the number
 * of pixels, which is the reason it is here at all: the bounded neighbourhood
 * search `measureContourFit` uses costs `radius²` per pixel and has to be told
 * where to stop, and the authored path has nowhere to stop.
 *
 * `INF` is one past the furthest two pixels of this grid can be, so a column with
 * no set pixel survives the first pass as "nothing in this column" rather than as
 * a distance. A grid with no set pixel at all comes back all `INF`; the one caller
 * never asks (a mask with no art has no covered-outside pixel to ask about).
 */
export function squaredDistanceToSet(inside: Uint8Array, w: number, h: number): Float64Array {
  const passes = distancePassesOf(w, h);
  const dist = new Float64Array(w * h);
  for (let x = 0; x < w; x++) {
    const out = passes.column(inside, x);
    for (let y = 0; y < h; y++) dist[y * w + x] = out[y];
  }
  for (let y = 0; y < h; y++) {
    const out = passes.row(dist, y);
    for (let x = 0; x < w; x++) dist[y * w + x] = out[x];
  }
  return dist;
}

/**
 * `squaredDistanceToSet`'s two passes over one `w`x`h` grid, one column or one
 * row per call, so a caller holding the previous grid's passes can redo only
 * the columns whose set changed and the rows whose column values changed.
 * `column(inside, x)` is column `x`'s pass over the set (`INF` where the
 * column has no set pixel); `row(columns, y)` is row `y`'s pass over the
 * column results. Each returns a scratch array whose first `h` (column) or
 * `w` (row) entries are the result, valid until the next call. A column's
 * result depends on that column of `inside` alone and a row's on that row of
 * `columns` alone, which is what makes redoing a subset exact: every output
 * is this one function of the same input.
 */
export function distancePassesOf(w: number, h: number): { column(inside: Uint8Array, x: number): Float64Array; row(columns: Float64Array, y: number): Float64Array } {
  const INF = w * w + h * h + 1;
  const span = Math.max(w, h);
  const f = new Float64Array(span);
  const out = new Float64Array(span);
  /** The parabolas still on the envelope, as the sample index each rises from. */
  const v = new Int32Array(span);
  /** Where consecutive envelope parabolas cross. One longer than `v` by nature. */
  const z = new Float64Array(span + 1);
  const envelope = (n: number): void => {
    let k = 0;
    v[0] = 0;
    z[0] = -Infinity;
    z[1] = Infinity;
    for (let q = 1; q < n; q++) {
      let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) {
        k--;
        s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
      while (z[k + 1] < q) k++;
      out[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
    }
  };

  return {
    column: (inside, x) => {
      for (let y = 0; y < h; y++) f[y] = inside[y * w + x] ? 0 : INF;
      envelope(h);
      return out;
    },
    row: (columns, y) => {
      for (let x = 0; x < w; x++) f[x] = columns[y * w + x];
      envelope(w);
      return out;
    },
  };
}

/**
 * Build a mesh cut to the part's own alpha silhouette.
 *
 * Trace, simplify, push out, clamp to the window, triangulate, and then MEASURE
 * the result against the mask it came from. Every vertex is pinned to the slot
 * bone at weight 1 — see the section header for why that is the whole weighting
 * model and what to reach for instead when a bone has to bend the art.
 */
export function buildContourMesh(input: ContourSpecInput): MeshGeometry {
  const { mask, threshold, tolerance, margin, maxVertices, pageScale } = input;
  const [w, h] = [mask.width, mask.height];
  // The grid the trace runs on, and what the spec's two distances are on it.
  // Off a `scale:` page nothing is multiplied — the mask IS the drawing — so
  // the operands below are the spec's own numbers, to the bit.
  const onGrid = (value: number): number => (pageScale === undefined ? value : value * pageScale);
  const texelTolerance = onGrid(tolerance);
  const texelMargin = onGrid(margin);
  /**
   * The texel figures the trace actually ran at, for a refusal to say beside the spec's own. Handed the operands
   * themselves rather than recomputing them, so the clause cannot state a conversion the trace did not make.
   */
  const applied = (texels: readonly number[]): string =>
    pageScale === undefined
      ? ''
      : ` (the drawing's pixels — applied as ${texels.map((v) => String(r6(v))).join(' and ')} texel(s) of ` +
        `this page, whose scale: ${pageScale} makes a texel ${(1 / pageScale).toFixed(2)}px of the drawing)`;
  /** A count of mask cells: pixels of the drawing, or texels of a `scale:` page. */
  const cells = pageScale === undefined ? 'px' : 'texels';
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > 255) {
    throw new MeshError(`the alpha threshold must be a whole number in 1..255, got ${threshold}`);
  }
  if (!(tolerance > 0) || !Number.isFinite(tolerance)) {
    throw new MeshError(`the simplification tolerance must be a positive number of pixels, got ${tolerance}`);
  }
  if (!(margin >= 0) || !Number.isFinite(margin)) throw new MeshError(`the margin must be 0 or more pixels, got ${margin}`);
  if (!Number.isInteger(maxVertices) || maxVertices < 3) {
    throw new MeshError(`maxVertices must be a whole number of at least 3, got ${maxVertices}`);
  }

  const traced = traceAlphaOutline(mask, threshold);
  // ⭐ A part with no transparent pixel at all, MEASURED rather than read off the
  // PNG's colour type. A truecolour+alpha file whose alpha is 255 everywhere has
  // an alpha channel and no transparency, so the header answers the wrong
  // question — and the silhouette of such a part is the part window, which makes
  // a contour mesh of it a region attachment with extra vertices to pose.
  if (traced.artPixels === w * h) {
    throw new MeshError(
      `every pixel of the ${w}x${h} part reaches alpha ${threshold}, so its silhouette IS the part window and a ` +
        'contour mesh of it is a region attachment with extra vertices — give the art a transparent margin, ' +
        'raise the alpha threshold, or use a region',
    );
  }
  // Islands, named before anything is triangulated. One outline encloses one
  // region, so art scattered over several would come out as missing coverage
  // further down — a true refusal with a message about margins, which is not
  // the thing to change.
  if (traced.islandPixels / traced.artPixels < CONTOUR_MIN_COVERAGE) {
    throw new MeshError(
      `the art is ${traced.islands} separate islands and one outline can only enclose the largest ` +
        `(${traced.islandPixels} of ${traced.artPixels} px, ` +
        `${((traced.islandPixels / traced.artPixels) * 100).toFixed(2)}%) — raise the alpha threshold if the ` +
        'strays are feathering, or give each island its own slot',
    );
  }
  const simplified = simplifyClosedPolygon(traced.outline, texelTolerance);
  const pushed = offsetPolygon(simplified, texelMargin);
  // Clamped to the part window, because a uv outside 0..1 is a different failure
  // (A22) and because there is no art out there to reach for anyway.
  const clamped = pushed.map(
    ([x, y]) => [Math.min(w, Math.max(0, x)), Math.min(h, Math.max(0, y))] as [number, number],
  );
  const points = prunePolygon(clamped).map(([x, y]) => [r6(x), r6(y)] as [number, number]);
  if (points.length < 3) {
    throw new MeshError(
      `the ${w}x${h} silhouette simplified to ${points.length} distinct vertices at tolerance ${tolerance}` +
        `${applied([texelTolerance])}; lower the tolerance`,
    );
  }
  if (points.length > maxVertices) {
    throw new MeshError(
      `the silhouette simplified to ${points.length} vertices at tolerance ${tolerance}${applied([texelTolerance])}, ` +
        `past the ${maxVertices} this mesh allows — raise the tolerance to spend fewer vertices, or raise ` +
        'maxVertices if the shape needs them',
    );
  }
  const crossing = findSelfIntersection(points);
  if (crossing) {
    throw new MeshError(
      `the outline crosses itself: edge ${crossing[0]} meets edge ${crossing[1]} after a margin of ${margin}px` +
        `${applied([texelMargin])} was pushed out of a silhouette narrower than that — lower the margin, or the art ` +
        'has a neck too thin to mesh',
    );
  }
  const triangles = windCounterClockwiseInSpineWorld(points, earClip(points));

  // The bound on the grid the fit is measured on: its last term is one cell of
  // that grid, which is why it is derived from the texel figures rather than
  // converted from the drawing's bound afterwards.
  const allowed = contourOvershootBound(texelMargin, texelTolerance);
  const fit = measureContourFit(mask, threshold, traced.filled, points, triangles, allowed + 1);
  if (fit.coverage < CONTOUR_MIN_COVERAGE) {
    throw new MeshError(
      `the mesh covers ${(fit.coverage * 100).toFixed(2)}% of the art (${fit.coveredArt} of ${fit.artPixels} ${cells}), ` +
        `under the ${(CONTOUR_MIN_COVERAGE * 100).toFixed(1)}% a contour mesh guarantees — raise the margin ` +
        `(now ${margin}px) above the tolerance (${tolerance}px), which is how far simplification is allowed to ` +
        `cut inward, or lower the tolerance${applied([texelMargin, texelTolerance])}`,
    );
  }
  if (fit.overshoot > allowed) {
    throw new MeshError(
      `the mesh reaches ${(pageScale === undefined ? fit.overshoot : fit.overshoot / pageScale).toFixed(2)}px past ` +
        `the silhouette, past the ${(pageScale === undefined ? allowed : allowed / pageScale).toFixed(2)}px that a ` +
        `margin of ${margin} and a tolerance of ${tolerance}${applied([texelMargin, texelTolerance])} can produce — the ` +
        'outline is not the one this builder promises, which is a defect in the builder rather than in the art',
    );
  }

  const uvs: number[] = [];
  for (const [x, y] of points) uvs.push(r6(x / w), r6(y / h));
  const weights: MeshVertexWeight[][] = points.map(() => [{ bone: 'anchor', weight: 1 }]);

  return {
    kind: 'contour',
    points,
    uvs,
    triangles,
    weights,
    hullVertices: points.length,
    contour: {
      artPixels: fit.artPixels,
      islandPixels: traced.islandPixels,
      islands: traced.islands,
      holePixels: traced.holePixels,
      tracedVertices: traced.outline.length,
      coverage: r6(fit.coverage),
      overshoot: fit.overshoot,
    },
  };
}

/**
 * One bone a weighted vertex can bind to: its NAME, and its world inverse.
 *
 * It carried the bone's index into the emitted bone array until issue #917; the
 * index is the Spine emitter's now (`emitVertices` in `src/emit_spine.ts`), so a
 * binding made here names its bone and survives a bone inserted ahead of it.
 */
export interface MeshBoneRef {
  name: string;
  /** Spine world point -> this bone's local space, at the setup pose. */
  toBind: (worldX: number, worldY: number) => [number, number];
}

/**
 * Bind a generated mesh's vertices to their bones by name: per vertex, one
 * `{ bone, x, y, weight }` per influence, `x, y` the vertex in that bone's LOCAL
 * setup space and `weight` on the generator's grid (`r6`).
 *
 * Bind coordinates are in each bone's LOCAL space, so a rotated bone needs a real
 * inverse transform — see `src/transform.ts` for why the old "world minus origin"
 * shortcut had to go and what it would have failed like.
 *
 * Returned as the model's `ModelVertices`, weighted, and not as Spine's run: the
 * run's bone INDEX is written by the Spine emitter at emission (issue #917), and
 * the encoding it chooses by a length comparison alone is said here outright.
 * The caller puts the numbers on the float32 grid, as it did the run's.
 */
export function bindWeightedVertices(
  geometry: MeshGeometry,
  /** Part-local pixel -> Spine world. */
  toWorld: (x: number, y: number) => [number, number],
  bones: { anchor: MeshBoneRef; controls: MeshBoneRef[] },
): Extract<ModelVertices, { weighted: true }> {
  const bindings: ModelBinding[][] = [];
  geometry.points.forEach(([px, py], i) => {
    const [wx, wy] = toWorld(px, py);
    const vertex: ModelBinding[] = [];
    for (const { bone, control, weight } of geometry.weights[i]) {
      const ref = bone === 'anchor' ? bones.anchor : bones.controls[control ?? 0];
      if (!ref) throw new MeshError(`vertex ${i} binds to control bone ${control ?? 0}, which the rig does not have`);
      const [bx, by] = ref.toBind(wx, wy);
      vertex.push({ bone: ref.name, x: bx, y: by, weight: r6(weight) });
    }
    bindings.push(vertex);
  });
  return { weighted: true, bindings };
}

// ---------------------------------------------------------------------------
// the outline a triangulation already states — `hull` and `edges` (issue #368)
// ---------------------------------------------------------------------------
//
// Spine's `hull` is not a free field: it is the number of vertices, FIRST in the
// vertex list and IN ORDER, that make up the mesh's outline polygon. Everything
// that reads it assumes exactly that — the editor draws the outline by joining
// hull vertex i to i+1 and constrains its triangulation to those segments, the
// runtime's debug renderer does the same, and `SkeletonBinary` does not even
// store a triangle count: it reads `(vertices.length - hullLength - 2) * 3`
// shorts, Euler's count for a hole-free triangulation whose boundary has `hull`
// vertices. So a hull that disagrees with the triangles is not cosmetic, it is a
// mesh that cannot be read back from a `.skel`, and a hull of 0 hands the editor
// a mesh it has to guess an outline for — which it does by declaring EVERY
// vertex a hull vertex, in list order, and saying so in a WARNING on import.
//
// The triangles already fix the outline: an edge used by exactly one triangle
// is on it, an edge shared by two is interior. `traceOutline` reads that off,
// `checkHullOrder` asks whether the vertex list is arranged the way `hull` needs
// it to be, and `meshEdges` writes the edge list the editor otherwise reports
// lost. None of this invents a value — every number comes out of `triangles`,
// and a list the rule cannot be applied to is refused with the fix spelled out.

/** What the triangles say the outline is. */
export interface MeshOutline {
  /** Boundary vertex count — the `hull` a consistent list declares. */
  hull: number;
  /**
   * The outline as one closed walk, starting at its lowest-numbered vertex and
   * heading for the smaller of that vertex's two neighbours. Deterministic, so a
   * refusal can print it as the order to renumber along.
   */
  walk: number[];
}

/** `0 → 5 → 10 → …`, the shape every outline message prints. */
export function formatWalk(walk: readonly number[]): string {
  return walk.join(' → ');
}

/**
 * Read the outline off a triangulation, or refuse a triangulation that has none.
 *
 * Refused here, each by name: an index outside the vertex list, a triangle that
 * repeats a vertex, a boundary that is not one closed loop (a pinched vertex, a
 * hole, two islands), and a triangle count that is not Euler's for that outline
 * — which is what an unused vertex or a doubled triangle looks like, and what
 * the binary reader would choke on.
 */
export function traceOutline(vertexCount: number, triangles: readonly number[]): MeshOutline {
  if (triangles.length % 3 !== 0) throw new MeshError(`triangle count ${triangles.length} is not a multiple of 3`);
  const key = (a: number, b: number): number => (a < b ? a * vertexCount + b : b * vertexCount + a);
  const uses = new Map<number, number>();
  for (let i = 0; i < triangles.length; i += 3) {
    const tri = [triangles[i], triangles[i + 1], triangles[i + 2]];
    for (const idx of tri) {
      if (!Number.isInteger(idx) || idx < 0 || idx >= vertexCount) {
        throw new MeshError(`triangle ${i / 3} names vertex ${idx}, and the mesh has vertices 0..${vertexCount - 1}`);
      }
    }
    if (tri[0] === tri[1] || tri[1] === tri[2] || tri[2] === tri[0]) {
      throw new MeshError(`triangle ${i / 3} (${tri.join(', ')}) repeats a vertex, so it has no area`);
    }
    for (const [a, b] of [[tri[0], tri[1]], [tri[1], tri[2]], [tri[2], tri[0]]]) {
      const k = key(a, b);
      uses.set(k, (uses.get(k) ?? 0) + 1);
    }
  }
  // Boundary edges, as adjacency. A vertex on a closed outline has exactly two.
  const next = new Map<number, number[]>();
  for (const [k, count] of uses) {
    if (count !== 1) continue;
    const a = Math.floor(k / vertexCount);
    const b = k % vertexCount;
    next.set(a, [...(next.get(a) ?? []), b]);
    next.set(b, [...(next.get(b) ?? []), a]);
  }
  if (next.size === 0) throw new MeshError('the triangles have no outline: every edge is shared by two triangles');
  for (const [v, ns] of [...next.entries()].sort((p, q) => p[0] - q[0])) {
    if (ns.length !== 2) {
      throw new MeshError(`the triangles' outline is not one closed loop: vertex ${v} has ${ns.length} boundary edges`);
    }
  }
  const start = Math.min(...next.keys());
  const walk = [start];
  let prev = -1;
  let at = start;
  for (;;) {
    const [n0, n1] = next.get(at)!;
    const to = prev === -1 ? Math.min(n0, n1) : n0 === prev ? n1 : n0;
    if (to === start) break;
    walk.push(to);
    prev = at;
    at = to;
  }
  if (walk.length !== next.size) {
    throw new MeshError(
      `the triangles' outline is not one closed loop: the walk from vertex ${start} closes after ` +
        `${walk.length} of ${next.size} boundary vertices`,
    );
  }
  const hull = walk.length;
  const euler = 2 * vertexCount - hull - 2;
  if (triangles.length / 3 !== euler) {
    throw new MeshError(
      `the triangles do not tile the outline: ${vertexCount} vertices with a ${hull}-vertex outline tile as ` +
        `${euler} triangles and there are ${triangles.length / 3} — Spine's binary reader derives the triangle ` +
        'count from exactly that, so a mesh that breaks it cannot be read back from a .skel',
    );
  }
  return { hull, walk };
}

/**
 * Is the vertex list arranged the way `hull` needs it — outline first, in order?
 *
 * Two refusals, both with the walk printed, because the walk IS the fix: the
 * outline vertices are not the first `hull` of the list (a row-major grid: its
 * perimeter is 16 of 25 and interleaved with the interior), or they are but out
 * of order (a two-column strip: every vertex is on the outline, and the outline
 * runs down one side and up the other while the list zigzags across). Either
 * direction around the loop is accepted — it is the same polygon.
 */
export function checkHullOrder(outline: MeshOutline, vertexCount: number): void {
  const { hull, walk } = outline;
  const onOutline = new Set(walk);
  const outside = walk.filter((v) => v >= hull).sort((a, b) => a - b)[0];
  if (outside !== undefined) {
    const inside = [...Array(hull).keys()].find((v) => !onOutline.has(v))!;
    throw new MeshError(
      `hull vertices must come first; vertex ${outside} is on the boundary and vertex ${inside} is not. ` +
        `The triangles' outline runs ${formatWalk(walk)}: list those ${hull} vertices first, in that order, ` +
        `then the ${vertexCount - hull} interior vertices`,
    );
  }
  const forward = walk.every((v, i) => v === i);
  const backward = walk.every((v, i) => v === (i === 0 ? 0 : hull - i));
  if (forward || backward) return;
  // Report along whichever direction keeps vertex 1 next to vertex 0 when it
  // can, so the printed order changes as little of the author's list as possible.
  const oriented = walk[1] <= walk[hull - 1] ? walk : [walk[0], ...walk.slice(1).reverse()];
  const at = oriented.findIndex((v, i) => v !== i);
  throw new MeshError(
    `hull vertices must trace the outline in order; the triangles' outline runs ${formatWalk(oriented)}, ` +
      `so vertex ${oriented[at]} has to follow vertex ${oriented[at - 1]} in the list, and vertex ${at} does. ` +
      'Renumber the vertices along that walk',
  );
}

/**
 * The mesh's edge list, in the encoding the editor writes.
 *
 * ⚠️ Each entry is a vertex index TIMES TWO — an offset into the flat x,y array,
 * the same convention the loader applies to `hull` when it stores it doubled.
 * Read off the editor's own exports rather than assumed: a 22-vertex mesh's list
 * tops out at 42, every pair is an edge of some triangle, the outline loop is
 * always present, and the spineboy example's meshes carry their interior edges
 * the same way. The format page says "vertex index pairs" and leaves the factor
 * to the reader.
 *
 * Every triangle edge is written — the outline loop first, `(0,1) … (hull-1,0)`,
 * then the interior edges sorted — so the editor's constrained triangulation has
 * every segment it needs to reproduce these exact triangles instead of reporting
 * the interior ones lost. The order is fixed so A18's byte comparison holds.
 */
export function meshEdges(vertexCount: number, triangles: readonly number[], hull: number): number[] {
  const key = (a: number, b: number): number => (a < b ? a * vertexCount + b : b * vertexCount + a);
  const seen = new Set<number>();
  const out: number[] = [];
  for (let i = 0; i < hull; i++) {
    const j = (i + 1) % hull;
    seen.add(key(i, j));
    out.push(2 * i, 2 * j);
  }
  const interior: Array<[number, number]> = [];
  for (let i = 0; i < triangles.length; i += 3) {
    const tri = [triangles[i], triangles[i + 1], triangles[i + 2]];
    for (const [a, b] of [[tri[0], tri[1]], [tri[1], tri[2]], [tri[2], tri[0]]]) {
      const k = key(a, b);
      if (seen.has(k)) continue;
      seen.add(k);
      interior.push(a < b ? [a, b] : [b, a]);
    }
  }
  interior.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  for (const [a, b] of interior) out.push(2 * a, 2 * b);
  return out;
}

// ---------------------------------------------------------------------------
// segments — a lattice over the part's alpha, weighted by distance to bones
// ---------------------------------------------------------------------------
//
// The generator for "an arbitrary layer pulled by a chosen set of bones". Its
// one authored input is WHICH segments may pull the part; the geometry is read
// off the art and the weights off the distance between the two, so a pipeline
// that used to re-implement distance weighting outside the compiler states the
// segment list and nothing else.
//
// The algorithm is a port of `rig-parts`' lattice mesh and segment weights
// (MIT, same owner). What it does, in order:
//
//   1. **Cells.** A square lattice of `cell`-pixel squares over the part; the
//      last column and row are clipped to the image. A cell is kept when any
//      pixel inside it reaches the alpha threshold, so the triangles cover
//      every art pixel by construction.
//   2. **One loop.** Spine's `hull` is one closed outline, and a layer is often
//      two islands or has a hole. So the kept cells are made one simply
//      connected region: holes filled, every other island bridged to the
//      largest by a straight run of cells, every diagonal pinch filled, and the
//      three repeated until a pass changes nothing. Every pass that does not
//      settle adds at least one cell, so the loop is bounded by the lattice and
//      needs no pass limit of its own. The added cells hold no art.
//   3. **Triangles.** Vertices numbered in the order the kept cells first touch
//      them (cells row-major; corners top-left, top-right, bottom-right,
//      bottom-left), each cell two triangles with the diagonal alternating by
//      `(i + j) % 2`, so the lattice has no preferred shear. Emitted
//      counter-clockwise in Spine world, the winding every generator here
//      writes (GR02 holds the grid to it, CT15 every generator).
//   4. **Outline first.** The boundary is walked from the edges used by exactly
//      one triangle, in first-seen order, and every interior vertex follows in
//      index order — the arrangement `checkHullOrder` requires.
//   5. **Weights.** Per vertex and per candidate segment, `w = 1 / (d + r)^p`
//      where `d` is the distance to the segment's nearest point; a bone two
//      segments name keeps the larger; the strongest `maxBones` are kept and
//      normalised, a share under `minWeight` is dropped, and the rest are
//      normalised again. Ties keep the order the bones first appear in.

/** What the lattice step did, for the report and for the refusals. */
export interface SegmentsLatticeReport {
  /** Cells across and down. */
  cols: number;
  rows: number;
  /** Cells holding an art pixel, and cells kept after the one-loop passes. */
  artCells: number;
  keptCells: number;
  /** Passes of hole-fill, island-join and pinch-fill until one changed nothing. */
  passes: number;
  /** 4-connected islands of art cells before the joins. */
  islands: number;
}

export interface SegmentsLattice {
  /** Vertex positions in part-local pixels, y down, outline first. */
  points: Array<[number, number]>;
  uvs: number[];
  /** Counter-clockwise in Spine world. */
  triangles: number[];
  hullVertices: number;
  report: SegmentsLatticeReport;
}

/** `np.rint`: to the nearest integer, exact halves to even — the bridge's rounding. */
function rintEven(x: number): number {
  const f = Math.floor(x);
  const frac = x - f;
  if (frac < 0.5) return f;
  if (frac > 0.5) return f + 1;
  return f % 2 === 0 ? f : f + 1;
}

/** Fill every background cell the lattice border cannot reach through 4-connected background. */
function fillCellHoles(cells: Uint8Array, nx: number, ny: number): Uint8Array {
  const outside = new Uint8Array(nx * ny);
  const stack: number[] = [];
  const seed = (i: number): void => {
    if (cells[i] === 0 && outside[i] === 0) {
      outside[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < nx; x++) {
    seed(x);
    seed((ny - 1) * nx + x);
  }
  for (let y = 0; y < ny; y++) {
    seed(y * nx);
    seed(y * nx + nx - 1);
  }
  while (stack.length > 0) {
    const i = stack.pop()!;
    const x = i % nx;
    const y = (i - x) / nx;
    if (x > 0) seed(i - 1);
    if (x < nx - 1) seed(i + 1);
    if (y > 0) seed(i - nx);
    if (y < ny - 1) seed(i + nx);
  }
  const out = new Uint8Array(nx * ny);
  for (let i = 0; i < out.length; i++) out[i] = outside[i] === 1 ? 0 : 1;
  return out;
}

/**
 * 4-connected components of the kept cells, numbered in raster order of each
 * component's first cell, each with its cells in raster order.
 */
function cellIslands(cells: Uint8Array, nx: number, ny: number): Array<Array<[number, number]>> {
  const label = new Int32Array(nx * ny).fill(-1);
  const islands: Array<Array<[number, number]>> = [];
  for (let start = 0; start < cells.length; start++) {
    if (cells[start] === 0 || label[start] >= 0) continue;
    const id = islands.length;
    const stack = [start];
    label[start] = id;
    while (stack.length > 0) {
      const i = stack.pop()!;
      const x = i % nx;
      const y = (i - x) / nx;
      const visit = (j: number): void => {
        if (cells[j] !== 0 && label[j] < 0) {
          label[j] = id;
          stack.push(j);
        }
      };
      if (x > 0) visit(i - 1);
      if (x < nx - 1) visit(i + 1);
      if (y > 0) visit(i - nx);
      if (y < ny - 1) visit(i + nx);
    }
    islands.push([]);
  }
  for (let i = 0; i < cells.length; i++) if (label[i] >= 0) islands[label[i]].push([(i - (i % nx)) / nx, i % nx]);
  return islands;
}

/**
 * The lattice over one part's alpha: cells, one loop, triangles, outline first.
 * Promised through `rig-c/mesh` (issue #1450). `mask.alpha` is one byte per
 * source pixel, `threshold` is an alpha byte in 1..255, and `cell` is a whole
 * number of part-local pixels. Returns `SegmentsLattice`: points in part-local
 * pixels (y down), dimensionless UVs rounded to six decimals, triangle indices,
 * the outline vertex count and cell/pass/island counts. No weights are built.
 *
 * Refuses a part that keeps no cell and a cell that is not a whole number of
 * pixels of at least 1; everything else about the geometry follows from the art.
 */
export function buildSegmentsLattice(input: { mask: AlphaMask; threshold: number; cell: number }): SegmentsLattice {
  const { mask, threshold, cell } = input;
  const { width: w, height: h } = mask;
  if (!Number.isInteger(cell) || cell < 1) {
    throw new MeshError(`"cell" is ${JSON.stringify(cell)}; it is the lattice's square, a whole number of pixels of at least 1`);
  }
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > 255) {
    throw new MeshError(`the alpha threshold must be a whole number in 1..255, got ${threshold}`);
  }
  const nx = Math.ceil(w / cell);
  const ny = Math.ceil(h / cell);
  const xs = Array.from({ length: nx + 1 }, (_, i) => Math.min(i * cell, w));
  const ys = Array.from({ length: ny + 1 }, (_, j) => Math.min(j * cell, h));
  let cells: Uint8Array = new Uint8Array(nx * ny);
  let artCells = 0;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      let any = 0;
      for (let y = ys[j]; y < ys[j + 1] && any === 0; y++) {
        for (let x = xs[i]; x < xs[i + 1]; x++) {
          if (mask.alpha[y * w + x] >= threshold) {
            any = 1;
            break;
          }
        }
      }
      cells[j * nx + i] = any;
      artCells += any;
    }
  }
  if (artCells === 0) {
    throw new MeshError(
      `no pixel of the ${w}x${h} part reaches alpha ${threshold}, so a lattice at cell ${cell} keeps no cell — ` +
        'there is no art to cover. Lower "alpha", or point at the image this mesh is meant to draw',
    );
  }
  const islands = cellIslands(cells, nx, ny).length;

  // 2. one loop, until a pass changes nothing.
  let passes = 0;
  for (;;) {
    passes++;
    cells = fillCellHoles(cells, nx, ny);
    const found = cellIslands(cells, nx, ny);
    if (found.length > 1) {
      let main = 0;
      for (let k = 1; k < found.length; k++) if (found[k].length > found[main].length) main = k;
      const mainCells = found[main];
      for (let k = 0; k < found.length; k++) {
        if (k === main) continue;
        const other = found[k];
        let best = Infinity;
        let a = 0;
        let b = 0;
        for (let p = 0; p < other.length; p++) {
          for (let q = 0; q < mainCells.length; q++) {
            const dj = other[p][0] - mainCells[q][0];
            const di = other[p][1] - mainCells[q][1];
            const d = dj * dj + di * di;
            if (d < best) {
              best = d;
              a = p;
              b = q;
            }
          }
        }
        const [j0, i0] = other[a];
        const [j1, i1] = mainCells[b];
        const steps = 2 * (Math.abs(j1 - j0) + Math.abs(i1 - i0)) + 2;
        const stride = 1 / (steps - 1);
        for (let s = 0; s < steps; s++) {
          const t = s === steps - 1 ? 1 : s * stride;
          cells[rintEven(j0 + (j1 - j0) * t) * nx + i0] = 1;
          cells[j1 * nx + rintEven(i0 + (i1 - i0) * t)] = 1;
          cells[rintEven(j0 + (j1 - j0) * t) * nx + rintEven(i0 + (i1 - i0) * t)] = 1;
        }
      }
      continue;
    }
    const snap = new Uint8Array(cells);
    const at = (j: number, i: number): number => snap[j * nx + i];
    let pinch = false;
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        if (at(j, i) && at(j + 1, i + 1) && !at(j, i + 1) && !at(j + 1, i)) {
          cells[j * nx + i + 1] = 1;
          pinch = true;
        } else if (at(j, i + 1) && at(j + 1, i) && !at(j, i) && !at(j + 1, i + 1)) {
          cells[j * nx + i] = 1;
          pinch = true;
        }
      }
    }
    if (!pinch) break;
  }

  // 3. triangles, in the lattice's own winding (top-left, top-right, bottom-right).
  const vid = new Int32Array((nx + 1) * (ny + 1)).fill(-1);
  const pts: Array<[number, number]> = [];
  const tri: number[] = [];
  let keptCells = 0;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      if (cells[j * nx + i] === 0) continue;
      keptCells++;
      const c: number[] = [];
      for (const [jj, ii] of [
        [j, i],
        [j, i + 1],
        [j + 1, i + 1],
        [j + 1, i],
      ]) {
        const k = jj * (nx + 1) + ii;
        if (vid[k] < 0) {
          vid[k] = pts.length;
          pts.push([xs[ii], ys[jj]]);
        }
        c.push(vid[k]);
      }
      if ((i + j) % 2 === 0) tri.push(c[0], c[1], c[2], c[0], c[2], c[3]);
      else tri.push(c[0], c[1], c[3], c[1], c[2], c[3]);
    }
  }

  // 4. the outline, walked from the boundary edges in first-seen order.
  const edgeUses = new Map<number, { a: number; b: number; n: number }>();
  const V = pts.length;
  for (let t = 0; t < tri.length; t += 3) {
    for (const [p, q] of [
      [tri[t], tri[t + 1]],
      [tri[t + 1], tri[t + 2]],
      [tri[t + 2], tri[t]],
    ]) {
      const a = Math.min(p, q);
      const b = Math.max(p, q);
      const key = a * V + b;
      const e = edgeUses.get(key);
      if (e === undefined) edgeUses.set(key, { a, b, n: 1 });
      else e.n++;
    }
  }
  const adj = new Map<number, number[]>();
  const link = (p: number, q: number): void => {
    const list = adj.get(p);
    if (list === undefined) adj.set(p, [q]);
    else list.push(q);
  };
  for (const { a, b, n } of edgeUses.values()) {
    if (n !== 1) continue;
    link(a, b);
    link(b, a);
  }
  const order: number[] = [];
  const seen = new Set<number>();
  for (const s of adj.keys()) {
    if (seen.has(s)) continue;
    let cur = s;
    let prev = -1;
    while (!seen.has(cur)) {
      seen.add(cur);
      order.push(cur);
      const next = (adj.get(cur) ?? []).filter((v) => v !== prev && !seen.has(v));
      if (next.length === 0) break;
      prev = cur;
      cur = next[0];
    }
  }
  const hullVertices = order.length;
  for (let v = 0; v < V; v++) if (!seen.has(v)) order.push(v);
  const remap = new Int32Array(V);
  order.forEach((v, i) => (remap[v] = i));
  const points = order.map((v) => pts[v]);
  // Emitted counter-clockwise in Spine world: the lattice's corners were taken
  // clockwise on the y-down page, so each triangle's last two are swapped.
  const triangles: number[] = [];
  for (let t = 0; t < tri.length; t += 3) triangles.push(remap[tri[t]], remap[tri[t + 2]], remap[tri[t + 1]]);
  const uvs: number[] = [];
  for (const [x, y] of points) uvs.push(r6(x / w), r6(y / h));
  return {
    points,
    uvs,
    triangles,
    hullVertices,
    report: { cols: nx, rows: ny, artCells, keptCells, passes, islands },
  };
}

/** One candidate segment, in Spine world, and which of the mesh's bones it belongs to. */
export interface WorldSegment {
  /** Index into the mesh's distinct bone list. */
  bone: number;
  a: readonly [number, number];
  b: readonly [number, number];
}

/** The four numbers the falloff reads, every one of them from the spec. */
export interface SegmentsFalloff {
  power: number;
  radius: number;
  maxBones: number;
  minWeight: number;
}

/**
 * Distance from `p` to the segment `a -> b`, a zero-length segment being its point.
 * Promised through `rig-c/mesh` (issue #1450). All three points must use the
 * same coordinate frame and length unit; the returned non-negative distance
 * uses that unit. The segments compiler supplies setup-world points in part
 * pixels, measured through its exact setup frame.
 *
 * `sqrt(dx*dx + dy*dy)` rather than `Math.hypot`, whose last bit can differ:
 * a weight is written on a 6-decimal grid, and that is where one ulp becomes a
 * different number in the file.
 */
export function segmentDistance(p: readonly [number, number], a: readonly [number, number], b: readonly [number, number]): number {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const len2 = abx * abx + aby * aby;
  let t = 0;
  if (len2 > 0) {
    t = ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
  }
  const dx = p[0] - (a[0] + t * abx);
  const dy = p[1] - (a[1] + t * aby);
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * The shares on one vertex, strongest first and closing at exactly 1 on the
 * generator's 6-decimal grid — or, when every share the kept bones carry is
 * under `minWeight`, the unrounded shares that were dropped, for the refusal to
 * print. A vertex is never given a bone the falloff did not choose.
 */
export function segmentShares(
  p: readonly [number, number],
  segments: readonly WorldSegment[],
  falloff: SegmentsFalloff,
): { weights: MeshVertexWeight[] } | { dropped: Array<{ bone: number; share: number }> } {
  const byBone = new Map<number, number>();
  for (const s of segments) {
    const reach = segmentDistance(p, s.a, s.b) + falloff.radius;
    const w = 1 / Math.pow(reach, falloff.power);
    const was = byBone.get(s.bone);
    byBone.set(s.bone, was === undefined ? w : Math.max(was, w));
  }
  // `sort` is stable, so equal pulls keep the order the bones first appeared in.
  const top = [...byBone.entries()].sort((x, y) => y[1] - x[1]).slice(0, falloff.maxBones);
  let sum = 0;
  for (const [, v] of top) sum += v;
  const shares = top.map(([bone, v]) => ({ bone, share: v / sum }));
  const kept = shares.filter((e) => e.share >= falloff.minWeight);
  if (kept.length === 0) return { dropped: shares };
  let sum2 = 0;
  for (const e of kept) sum2 += e.share;
  const weights: MeshVertexWeight[] = [];
  let others = 0;
  kept.forEach((e, k) => {
    const weight = k === kept.length - 1 ? r6(1 - others) : r6(e.share / sum2);
    others += weight;
    weights.push({ bone: 'control', control: e.bone, weight });
  });
  return { weights };
}

// ---------------------------------------------------------------------------
// influence — a falloff that reaches zero at a stated distance (issue #1415)
// ---------------------------------------------------------------------------
//
// `segmentShares` above never lets a segment go: `1 / (d + r)^p` is positive at
// every distance, so the only way to widen a blend is a larger `r`, which
// flattens it everywhere at once, and the only way to end one is `minWeight`,
// a share rather than a distance. A cloth surface wants the other model: a
// vertex follows every link NEAR it, by a pull that falls to exactly zero at a
// stated reach, so a link enters and leaves a vertex's blend continuously.
//
//   1. **Distance.** `d` is the distance from the vertex to each link's
//      segment — its nearest point, `segmentDistance`, the same reading the
//      falloff takes — at the setup pose. To the segment rather than to the
//      bone's origin: a vertex on the middle of a link IS on that link, and an
//      origin metric would put it half a link away while handing the joint at
//      the link's tip to the child whose origin sits there.
//   2. **Across.** With `across: false` only the entry (a chain, a bone, a
//      span) holding the nearest link is kept — the earlier entry on a tie.
//   3. **Reach.** A link with `d < radius` pulls `shape(d / radius)`, and one
//      whose pull is not above 0 — a hair inside the reach, in doubles — pulls
//      nothing and is out of reach; a bone two segments name keeps the nearer.
//      A vertex no link reaches is refused by the caller, naming the nearest
//      distance.
//   4. **Cap.** The strongest `max` pulls are kept — equal pulls in the order
//      the bones were first named — and normalised; a share the 6-decimal grid
//      would write as 0 is dropped and the rest normalised again.
//   5. **Order.** The kept bones are written in the order they were first
//      named, on every vertex, so an attachment has one bone order by
//      construction (`A52_WEIGHTED_VERTICES_SHARE_ONE_BONE_ORDER`); the
//      strongest closes the vertex at exactly 1 on the grid.

/** One candidate segment with the `bones` entry it came from — what `across: false` chooses between. */
export interface EntrySegment extends WorldSegment {
  /** Index of the `bones` entry this segment belongs to. */
  entry: number;
}

/** The four fields an `influence` block states — every one of them required by the caller. */
export interface SegmentsInfluence {
  radius: number;
  across: boolean;
  max: number;
  shape: 'linear' | 'smooth';
}

/** A pull at `x = d / radius` in `[0, 1]`: 1 at the segment, 0 at the reach. */
export function influencePull(shape: SegmentsInfluence['shape'], x: number): number {
  return shape === 'linear' ? 1 - x : 1 - x * x * (3 - 2 * x);
}

/** The steps a selftest plant may switch off, one key each — never passed by a build. */
export interface InfluencePlant {
  ignoreCap?: true;
  ignoreReach?: true;
  ignoreAcross?: true;
  skipNormalise?: true;
}

/** What `influenceShares` found at one vertex. */
export type InfluenceShares =
  | {
      /** The bindings, in first-named bone order, closing at exactly 1 on the 6-decimal grid. */
      weights: MeshVertexWeight[];
      /** How many bones were in reach before the cap — over `max` means the cap dropped some. */
      inReach: number;
    }
  | {
      /** No link is within `radius`: the nearest one's distance, and its bone. */
      nearest: { bone: number; distance: number };
    };

/**
 * The shares on one vertex under an `influence` block — see the section header.
 * The three-argument call is promised through `rig-c/mesh` (issue #1450). `p`
 * and every segment endpoint share one frame; `radius` uses that frame's length
 * unit. `bone` indexes the caller's distinct mesh-bone list and `entry` indexes
 * its authored segment entries. Returned mesh weights use `bone: 'control'`
 * and `control` for that same distinct-bone index. Returns weights closing at one
 * on the six-decimal grid, with the pre-cap in-reach bone count; or the nearest
 * bone and its distance in the input unit when no link reaches the vertex.
 * The compiler uses exact setup-world positions measured in part pixels.
 * `plant` exists for the selftest's negative controls: each key switches one
 * step off, so a control can show its own check going red on weights that
 * break exactly that step. A build never passes it.
 */
export function influenceShares(
  p: readonly [number, number],
  segments: readonly EntrySegment[],
  influence: SegmentsInfluence,
  plant: InfluencePlant = {},
): InfluenceShares {
  const distances = segments.map((s) => segmentDistance(p, s.a, s.b));
  let home = -1;
  let homeD = Infinity;
  let nearestBone = 0;
  distances.forEach((d, i) => {
    if (d < homeD) {
      homeD = d;
      home = segments[i].entry;
      nearestBone = segments[i].bone;
    }
  });
  const byBone = new Map<number, number>();
  segments.forEach((s, i) => {
    if (!influence.across && plant.ignoreAcross === undefined && s.entry !== home) return;
    const d = distances[i];
    if (!(d < influence.radius) && plant.ignoreReach === undefined) return;
    const was = byBone.get(s.bone);
    if (was === undefined || d < was) byBone.set(s.bone, d);
  });
  // Strongest first; equal pulls by the order the bones were first named. A link a hair inside the reach can
  // pull 0 — or a rounding's worth under it — in doubles (`1 - x²(3 - 2x)` at x one ulp under 1): it pulls
  // nothing, so it is out of reach like the links past it, and no share is ever made up for it.
  const pulls = [...byBone.entries()]
    .map(([bone, d]) => ({ bone, pull: influencePull(influence.shape, Math.min(d / influence.radius, 1)) }))
    .filter((e) => e.pull > 0 || plant.ignoreReach !== undefined)
    .sort((x, y) => y.pull - x.pull || x.bone - y.bone);
  if (pulls.length === 0) return { nearest: { bone: nearestBone, distance: homeD } };
  const inReach = pulls.length;
  const capped = plant.ignoreCap === undefined ? pulls.slice(0, influence.max) : pulls;
  // Only the planted `ignoreReach` keeps a pull of 0 (a link at or past the reach): it is given one grid step,
  // so the plant still binds that link, which is the plant's whole point.
  const raw = capped.map((e) => ({ bone: e.bone, pull: e.pull > 0 ? e.pull : 0.000001 }));
  let sum = 0;
  for (const e of raw) sum += e.pull;
  const normalise = plant.skipNormalise === undefined;
  const first = raw.map((e) => ({ bone: e.bone, share: normalise ? e.pull / sum : e.pull }));
  const kept = first.filter((e) => r6(e.share) !== 0);
  let sum2 = 0;
  for (const e of kept) sum2 += e.share;
  const rounded = kept.map((e) => r6(normalise ? e.share / sum2 : e.share));
  // `kept[0]` is the strongest — the filter keeps the order — and it closes the vertex at exactly 1.
  if (normalise) {
    let others = 0;
    for (let k = 1; k < rounded.length; k++) others += rounded[k];
    rounded[0] = r6(1 - others);
  }
  const weights: MeshVertexWeight[] = kept
    .map((e, k) => ({ bone: 'control' as const, control: e.bone, weight: rounded[k] }))
    .sort((x, y) => x.control - y.control);
  return { weights, inReach };
}
