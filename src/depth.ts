/**
 * A **depth map** as a mesh input: a greyscale sheet, in the part's own pixel
 * grid, that says how far in front of the turn axis each pixel sits.
 *
 * ## Why this is an input and not a measurement
 *
 * `yaw` and `pitch` (`src/deformgen.ts`) turn a part by treating it as painted
 * on a cylinder: a vertex at `u` off the axis gets `z = √(radius² − u²)`, and
 * the key is that rotation projected back to the screen. One radius per
 * attachment is a whole model of a shape, and it is the right model for a
 * fringe or a plate that really does bend like a barrel.
 *
 * It is the wrong model for a face. A nose is not on the skull's cylinder, an
 * ear is behind it, and no single radius puts both where they are — the
 * cylinder answers "how far off the axis is this column" when the question is
 * "how far forward is this pixel". A depth map answers the second question
 * directly, per vertex, and the arithmetic downstream does not otherwise
 * change: the same closed form runs, with `z` read instead of derived.
 *
 * ⚠️ **The map is relative and rigc does not make it absolute.** 8 bits of
 * level say nothing about world units, so `zScale` — how far apart level 0 and
 * level 255 are — is an authored number, exactly like `radius` was. rigc
 * refuses to guess it, records the map's digest so a claim can name which sheet
 * produced it, and reports the range it actually sampled. What it will not do
 * is measure a plate and invent a depth from it.
 *
 * ## The tone curve, and why it lives here
 *
 * A consumer that renders the same sheet in a shader applies a tone curve
 * before displacing anything — gamma, contrast, bias. If rigc sampled the raw
 * level and the shader sampled a curved one, the mesh and the shader would be
 * two different surfaces and the cross-check between them (#382's positive
 * control) would compare nothing. So the curve is stated in the spec, applied
 * here, and written into the report in the form the consumer can compare
 * against.
 *
 * Order of operations, fixed and stated because every one of them is a place
 * two implementations can silently disagree:
 *
 *   1. **bilinear sample of the RAW level**, at pixel centres — this is what a
 *      GPU's linear filter does, and doing it after the curve would filter a
 *      different function;
 *   2. **`near`**, which turns a level into a nearness in 0..1;
 *   3. **the tone curve**, clamped back into 0..1;
 *   4. **`zScale`**, which is the only step carrying units.
 */
import { createHash } from 'node:crypto';

/** Which end of the range is closest to the viewer. */
export type DepthNear = 'white' | 'black';

/**
 * The curve applied between "nearness in 0..1" and the value `zScale` multiplies.
 *
 * Stated in full rather than left partly defaulted, so the report can print the
 * curve a consumer has to match without a reader having to know which fields
 * were written and which were filled in.
 */
export interface DepthTone {
  /** Applied to the 0..1 nearness. 1 is a straight line. */
  gamma: number;
  /** Fanned about 0.5. 1 leaves the range alone. */
  contrast: number;
  /** Added after the fan. 0 leaves the midpoint alone. */
  bias: number;
}

/** The curve that changes nothing — what an unstated tone block means. */
export const DEPTH_TONE_IDENTITY: DepthTone = { gamma: 1, contrast: 1, bias: 0 };

export interface DepthMap {
  width: number;
  height: number;
  /** One level per pixel, row major, y down, 0..255. */
  level: Uint8Array;
}

export class DepthError extends Error {}

/**
 * Refuse a tone block that cannot describe a curve.
 *
 * `gamma` and `contrast` at or below 0 are the two that matter: a gamma of 0
 * maps every level to 1 and a contrast of 0 maps every level to the midpoint,
 * so both turn a depth map into a constant — a flat part with a file behind it,
 * which is precisely the silence this feature exists to remove.
 */
export function checkTone(tone: DepthTone, where: string): void {
  const finite = (n: number, field: string): void => {
    if (typeof n !== 'number' || !Number.isFinite(n)) {
      throw new DepthError(`${where}: depth tone "${field}" is ${JSON.stringify(n)}; it is a finite number`);
    }
  };
  finite(tone.gamma, 'gamma');
  finite(tone.contrast, 'contrast');
  finite(tone.bias, 'bias');
  if (tone.gamma <= 0) {
    throw new DepthError(
      `${where}: depth tone "gamma" is ${tone.gamma}; a gamma at or below 0 maps every level to the same nearness, ` +
        'so the map would describe a flat part. It is a positive number, and 1 is the straight line.',
    );
  }
  if (tone.contrast <= 0) {
    throw new DepthError(
      `${where}: depth tone "contrast" is ${tone.contrast}; a contrast at or below 0 collapses the range onto the ` +
        'midpoint (or turns it inside out), so the map would describe a flat part. It is a positive number, and 1 ' +
        'leaves the range alone.',
    );
  }
}

/** Refuse a scale that carries no units. */
export function checkZScale(zScale: number, where: string): void {
  if (typeof zScale !== 'number' || !Number.isFinite(zScale)) {
    throw new DepthError(`${where}: "zScale" is ${JSON.stringify(zScale)}; it is a finite number of world units`);
  }
  if (zScale <= 0) {
    throw new DepthError(
      `${where}: "zScale" is ${zScale}; it is how many units the map's full range spans, so a positive number. ` +
        'To put the near end at the back, say "near": "black" — a negative scale states the same thing twice and ' +
        'the two can then disagree.',
    );
  }
}

/**
 * Bilinear sample of the raw level at a part-local pixel position, y down.
 *
 * Pixel `i` covers `[i, i+1)` and its centre is at `i + 0.5`, so a position is
 * converted to centre space before interpolating — sampling at `i` without that
 * shift reads a value half a pixel off, which is invisible on a smooth sheet
 * and wrong at every edge. Positions outside the map clamp to the edge texel,
 * the same as a GPU's clamp-to-edge; a vertex out there is a separate refusal
 * the caller makes, and clamping here keeps this function total.
 */
export function sampleLevel(map: DepthMap, x: number, y: number): number {
  const { width: w, height: h, level } = map;
  const u = x - 0.5;
  const v = y - 0.5;
  const x0 = Math.floor(u);
  const y0 = Math.floor(v);
  const fx = u - x0;
  const fy = v - y0;
  const cx = (i: number): number => (i < 0 ? 0 : i > w - 1 ? w - 1 : i);
  const cy = (j: number): number => (j < 0 ? 0 : j > h - 1 ? h - 1 : j);
  const x0c = cx(x0);
  const x1c = cx(x0 + 1);
  const y0c = cy(y0);
  const y1c = cy(y0 + 1);
  const l00 = level[y0c * w + x0c];
  const l10 = level[y0c * w + x1c];
  const l01 = level[y1c * w + x0c];
  const l11 = level[y1c * w + x1c];
  const top = l00 + (l10 - l00) * fx;
  const bottom = l01 + (l11 - l01) * fx;
  return top + (bottom - top) * fy;
}

/** A raw level in 0..255 to a nearness in 0..1, `near` applied and the curve run. */
export function toneLevel(rawLevel: number, near: DepthNear, tone: DepthTone): number {
  const nearness = near === 'white' ? rawLevel / 255 : 1 - rawLevel / 255;
  const curved = (Math.pow(nearness, tone.gamma) - 0.5) * tone.contrast + 0.5 + tone.bias;
  return curved < 0 ? 0 : curved > 1 ? 1 : curved;
}

/**
 * The whole chain at one position: sample, `near`, curve, scale.
 *
 * The four steps are the four places two implementations of one model can drift
 * apart, which is why the module header fixes their order and this function is
 * the only thing that runs them.
 */
export function sampleDepth(
  map: DepthMap,
  x: number,
  y: number,
  near: DepthNear,
  tone: DepthTone,
  zScale: number,
): number {
  return toneLevel(sampleLevel(map, x, y), near, tone) * zScale;
}

/**
 * A digest of the map's pixels, so a claim can name the sheet it was made from.
 *
 * Over the levels alone, not the PNG file: the same depth re-encoded at a
 * different compression level is the same map, and a digest that changed with
 * the encoder would make provenance unfalsifiable in the direction that
 * matters — two runs the reader believes differ when they do not.
 */
export function depthDigest(map: DepthMap): string {
  const h = createHash('sha256');
  const header = new Uint8Array(8);
  new DataView(header.buffer).setUint32(0, map.width);
  new DataView(header.buffer).setUint32(4, map.height);
  h.update(header);
  h.update(map.level);
  return h.digest('hex').slice(0, 16);
}

// ---------------------------------------------------------------------------
// Two evaluations of one turn, compared
// ---------------------------------------------------------------------------

/**
 * The 2.5D turn's displacement along the driving axis, for one point.
 *
 * The same closed form `evaluateDeformTransform` runs, written once more here
 * because this file compares two ways of EVALUATING it and neither may quietly
 * be a different model. `u` is the point's offset from the axis; `z` is how far
 * in front of that axis it sits.
 */
export function turnDisplacement(u: number, z: number, radians: number, narrowing = true): number {
  return (narrowing ? u * (Math.cos(radians) - 1) : 0) - z * Math.sin(radians);
}

/** What a field comparison measured. Pixels, in the part's own grid. */
export interface FieldAgreement {
  /** Pixels compared: inside the art and inside some triangle. */
  samples: number;
  /** Pixels the mesh covers that the art does not reach, or vice versa. */
  skipped: number;
  /** Mean |mesh − continuous| displacement, in part pixels. */
  mean: number;
  /** Worst |mesh − continuous| displacement, in part pixels. */
  worst: number;
}

/**
 * How closely a mesh's piecewise-linear turn reproduces the continuous one.
 *
 * ## What this measures, and what it does not
 *
 * ⚠️ It is **not** a check of the sampler. Both sides read the same sheet
 * through `sampleDepth`, deliberately — a comparison where the two sides
 * disagreed about the depth would be measuring the wrong thing. `DP01`–`DP03`
 * in `selftest.ts` are what hold the sampler honest.
 *
 * What differs is the **evaluation**. The continuous side gives every pixel its
 * own depth and displaces it by that; the mesh side gives depth to its vertices
 * only and interpolates linearly across each triangle. That is the whole
 * approximation a mesh IS, and this puts a number on it: the two agree where
 * the depth field is locally flat across a cell, and part where it curves.
 *
 * ⭐ So the figure to read is not the absolute error but **how it falls as the
 * lattice refines**. A mesh that is evaluating the same model converges on it;
 * one that is evaluating something else does not, however dense it gets.
 *
 * 🚨 And it is a different quantity from FACE §4.2's fold angle, which gets
 * WORSE as the columns refine. Both are true and they are not in tension:
 * refining the lattice buys fidelity to the model and costs the angle at which
 * a column pair inverts. This measures the first; `A39` refuses the second.
 */
export function compareTurnFields(input: {
  map: DepthMap;
  near: DepthNear;
  tone: DepthTone;
  zScale: number;
  /** One byte per pixel over the same grid; a pixel under `threshold` is not art. */
  alpha: Uint8Array;
  threshold: number;
  /** Mesh vertices in part-local pixels, y down. */
  points: ReadonlyArray<readonly [number, number]>;
  triangles: ReadonlyArray<number>;
  degrees: number;
  /** Where the axis crosses the driving coordinate, in part pixels. Default 0. */
  about?: number;
  /** 'yaw' reads x and displaces x; 'pitch' reads y and displaces y. */
  kind?: 'yaw' | 'pitch';
  /**
   * The mesh side's per-vertex `z`, when it should NOT come from the map.
   *
   * Two uses, and the second is the important one. A caller that has the
   * compiler's own sampled depths can pass them, so the comparison is against
   * what was actually emitted rather than against a re-sampling. And a NEGATIVE
   * control can pass depths from a different model entirely — a cylinder's, say
   * — which is what makes the convergence claim mean anything: a mesh
   * evaluating the same model converges on it, and one evaluating another does
   * not, however dense it gets.
   */
  vertexDepths?: readonly number[];
}): FieldAgreement {
  const { map, near, tone, zScale, alpha, threshold, points, triangles, degrees } = input;
  const about = input.about ?? 0;
  const along = (input.kind ?? 'yaw') === 'yaw' ? 0 : 1;
  const rad = (degrees * Math.PI) / 180;

  if (input.vertexDepths !== undefined && input.vertexDepths.length !== points.length) {
    throw new DepthError(
      `the mesh has ${points.length} vertices and ${input.vertexDepths.length} depths were supplied for it`,
    );
  }
  // The mesh side, per vertex, once.
  const vertexShift = points.map((p, v) =>
    turnDisplacement(
      p[along] - about,
      input.vertexDepths === undefined ? sampleDepth(map, p[0], p[1], near, tone, zScale) : input.vertexDepths[v],
      rad,
    ),
  );

  const { width: w, height: h } = map;
  // Which pixels a triangle covered, so a pixel in two triangles is counted
  // once and the untouched remainder can be reported rather than ignored.
  const seen = new Uint8Array(w * h);
  let samples = 0;
  let total = 0;
  let worst = 0;

  for (let t = 0; t < triangles.length; t += 3) {
    const [ia, ib, ic] = [triangles[t], triangles[t + 1], triangles[t + 2]];
    const [ax, ay] = points[ia];
    const [bx, by] = points[ib];
    const [cx, cy] = points[ic];
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (den === 0) continue; // a degenerate triangle covers nothing
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
    const x1 = Math.min(w - 1, Math.ceil(Math.max(ax, bx, cx)));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy)));
    const y1 = Math.min(h - 1, Math.ceil(Math.max(ay, by, cy)));
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const i = py * w + px;
        if (seen[i] || alpha[i] < threshold) continue;
        // Pixel centres, the same convention the sampler uses.
        const sx = px + 0.5;
        const sy = py + 0.5;
        const l0 = ((by - cy) * (sx - cx) + (cx - bx) * (sy - cy)) / den;
        const l1 = ((cy - ay) * (sx - cx) + (ax - cx) * (sy - cy)) / den;
        const l2 = 1 - l0 - l1;
        if (l0 < 0 || l1 < 0 || l2 < 0) continue;
        seen[i] = 1;
        const meshShift = l0 * vertexShift[ia] + l1 * vertexShift[ib] + l2 * vertexShift[ic];
        const u = (along === 0 ? sx : sy) - about;
        const exact = turnDisplacement(u, sampleDepth(map, sx, sy, near, tone, zScale), rad);
        const d = Math.abs(meshShift - exact);
        samples++;
        total += d;
        if (d > worst) worst = d;
      }
    }
  }

  let skipped = 0;
  for (let i = 0; i < alpha.length; i++) if (alpha[i] >= threshold && !seen[i]) skipped++;
  return { samples, skipped, mean: samples === 0 ? 0 : total / samples, worst };
}

// ---------------------------------------------------------------------------
// The turn a mesh can take before it folds
// ---------------------------------------------------------------------------

/**
 * The relative floor under a triangle's setup area, below which no ceiling is
 * quoted for it.
 *
 * ⚠️ **Deliberately not `deformmeasure.ts`'s `DEFORM_AREA_EPSILON`, and the two
 * must not be merged.** That one is a *shape band* on a measured reversal,
 * combined with a float32 noise bound, and it decides whether a triangle the
 * artifact already holds has turned over. This one guards a DIVISION: the
 * ceiling below is `A0 / A_axis`, and a setup triangle with no area to speak of
 * gives an angle of nearly zero that says nothing about the sheet.
 *
 * 🔒 What keeps them from drifting is not a shared constant — the compiler
 * cannot import that file without linking the runtime — but a control:
 * `TC01` in `selftest.ts` requires the ceiling reported here to be the angle
 * `A39` actually fires at, on the triangle it actually names. A disagreement
 * between these two numbers is a red test, not a silent difference.
 */
const CEILING_AREA_FLOOR = 1e-6;

/**
 * A measured figure of the fold report on the tree's six-decimal grid — the
 * rule `src/mesh.ts`'s `r6` states for the generator's measured figures, and
 * never "-0".
 *
 * ⭐ **Why the report is rounded at all (issue #942).** Every other number the
 * model document spells is on the float32 grid the Spine file is written on,
 * or on this one; these four were the only full doubles, and the one place a
 * platform's libm reached the document. `gallery/look`'s document differed
 * between macOS and the Linux runner by exactly two leaves,
 * `/meshes/0/depth/ceiling/pitch/negative/{degrees,p1}`, `26.935130523311`
 * against `26.935130523311003`: macOS's `Math.atan` returned 0.512 ulp below
 * the exact arctangent and Linux the correctly rounded double above it.
 * Measured on that rig, the nearest six-decimal boundary is at least 2.33e-8°
 * from any of its ceiling angles against a one-ulp step of about 3.6e-15°, so
 * a one-ulp difference no longer reaches a byte. What a grid cannot absorb is
 * stated rather than hidden: a value within one ulp of a rounding boundary
 * still moves. Which triangle is the minimum no longer rides on the last ulp
 * (issue #949): the choice is made on this grid too, by `foldPrecedes`.
 *
 * 🔒 Applied to the figures after the minimum is chosen and the percentile
 * ranked; `TC01` still requires the named triangle, at ±0.01°, to be one `A39`
 * fires on, and `TB03` that it is the FIRST one A39 names. A share or
 * a step is a positive number and r6 only returns 0 for one under 5e-7; `TC07`
 * reads every share it builds as `> 0`.
 */
function r6(n: number): number {
  const v = Math.round(n * 1e6) / 1e6;
  return v === 0 ? 0 : v;
}

/**
 * Whether fold `a` is the tighter of two on one axis and side: its angle is
 * smaller ON THE SIX-DECIMAL GRID THE REPORT SPELLS IT ON, or equal there and
 * `a` is the lower triangle ordinal. `degrees` are the full doubles; the grid
 * is applied here, so a caller cannot compare the doubles by accident.
 *
 * ⭐ Why the grid and not the doubles (issue #949). A minimum chosen on full
 * doubles is chosen by the platform's libm whenever two triangles fold within
 * a few ulps of each other, and a fold names its triangle with that
 * triangle's own `ids`, `depthStep` and `stepShare`, so the document moves by
 * whole fields while the angle it prints does not. Measured on
 * `gallery/look`, with every libm-backed `Math` result moved one ulp through a
 * `--preload`: mesh 0's `pitch.negative` minimum is triangles 49 and 50, both
 * at exactly `26.935130523311` unperturbed (the doubles are EQUAL, and the
 * first-found rule named 49); `Math.pow` +1 ulp made 50 the smaller by one ulp
 * (`26.935130523310995`) and −1 ulp made 49 the larger (`26.935130523311003`),
 * and the document named 50, `ids` `[60,…,80]`, `depthStep` 90.533309 for
 * 95.668608. `pow` −1 ulp also swapped `yaw.positive`'s triangles 174 and 215
 * (`19.316350434748518`, both; 7.1e-15° apart once perturbed). 5 and 10 leaves
 * moved; with this rule, 0 under `atan`, `pow` or all sixteen functions
 * together, either direction, on all seven gallery rows.
 *
 * ⭐ Why the LOWEST ordinal, and not some other tie-break: it is the order
 * `A39` names triangles in. The gate lists the triangles a key reverses by
 * ascending ordinal (`deformmeasure.ts`, `reversed`), so turned just past a
 * tied ceiling every tied triangle reverses and the first one the refusal
 * names is the lowest — the one this reports. `TB03` holds the two to it on a
 * planted tie; `TB01` holds the choice unmoved by which of two tied triangles
 * carries the larger double.
 *
 * ⚠️ What a grid cannot absorb, stated rather than hidden: two angles one ulp
 * apart that straddle a six-decimal rounding boundary are two different
 * reported values, and a one-ulp change can still pick the other one. That is
 * the value moving, not the choice, and it is the residual `r6` already names.
 */
export function foldPrecedes(
  a: { readonly degrees: number; readonly triangle: number },
  b: { readonly degrees: number; readonly triangle: number },
): boolean {
  const ra = r6(a.degrees);
  const rb = r6(b.degrees);
  return ra < rb || (ra === rb && a.triangle < b.triangle);
}

/**
 * Where one triangle turns inside out, which triangle that is — and, beside it,
 * what the REST of this axis and side's triangles do.
 *
 * Everything down to `stepShare` is about one triangle. `count` and `p1` are
 * about the population it is the minimum of, and they are here because the
 * minimum alone cannot answer the question an author actually has: `degrees` is
 * the same number whether a whole band of the mesh reaches the limit together
 * or one triangle does, and those are a form and a bad texel respectively
 * ([#412](https://github.com/rig-c/core/issues/412),
 * `bench/studies/2026-09-05-noise` §6).
 *
 * ⚠️ And a band is not sufficient evidence of a form either, which is what
 * `stepShare` is here for: an OUTLINE is a band, so a mesh whose ceiling is set
 * by the occlusion edge of a cut-out reads `p1/degrees` near 1 and a `depthStep`
 * of most of the sheet's range — both of the older figures reading *healthy* on
 * the same measurement ([#448](https://github.com/rig-c/core/issues/448)).
 *
 * ⛔ Neither figure changes `degrees`, and neither is a threshold. rigc does not
 * have the authority to guess its input away, so nothing here filters,
 * smooths or rejects a sample — the ceiling stays the raw sheet read through
 * the mesh, which is the only thing `A39` will agree with. What to read off the
 * two numbers is stated in `docs/AUTHORING.md` §3.4, not decided here.
 *
 * 🔸 `degrees`, `depthStep`, `stepShare` and `p1` are reported on the
 * six-decimal grid (`r6` above, issue #942), and the choice among triangles is
 * made on that grid with the lowest ordinal winning a tie (`foldPrecedes`,
 * issue #949).
 */
export interface FoldLimit {
  /** Degrees from setup, in (0, 90). */
  degrees: number;
  /** Which triangle: its ordinal in the triangle list, not an index into it. */
  triangle: number;
  /** Its three vertex indices, so a message can name them. */
  ids: [number, number, number];
  /**
   * The largest depth difference between two of THIS triangle's vertices, in
   * the units `z` was supplied in.
   *
   * A reading of the sheet and not a restatement of the angle: pass it through
   * `depthStepLevels` and it is the step in encoding levels, which is what says
   * whether the sheet had anything to say across this triangle at all. One
   * level is the smallest step an 8-bit sheet can carry, and at one level the
   * ceiling is exactly `atan(255·h / zScale)` — arithmetic about the encoding
   * with no form left in it (`bench/studies/2026-09-05-noise` §3).
   */
  depthStep: number;
  /**
   * `depthStep` over the depth range this mesh actually sampled — what fraction
   * of everything the sheet said across the whole part it said across the one
   * triangle that folds first.
   *
   * ⭐ The figure that tells a form from a cliff, and it is the one reading the
   * other two cannot give ([#448](https://github.com/rig-c/core/issues/448)).
   * A form has a slope, so refining the lattice halves the step and halves this
   * with it while the angle converges. A **discontinuity has no slope**: the
   * step stays the whole range however fine the lattice gets, this figure pins
   * near 1, and the ceiling halves with every doubling instead of converging —
   * `tan t ∝ h`, an angle that describes nothing at any density.
   *
   * ⚠️ **The ceiling is not wrong when this reads high; the input is not a
   * surface.** Measured on estimated sheets: reported 1.936°, and the runtime
   * admits +1° and reverses 8 triangles at +2°. The rig genuinely folds at two
   * degrees. What a `depthStep` near the whole range means is an occlusion
   * boundary — figure against background, or one part of a figure over
   * another — and a 2.5D turn does not model occlusion at all, so **no angle is
   * the right one to quote for it**. The fix is upstream of the ceiling: mesh
   * only what is continuous, or state a sheet that was authored rather than
   * estimated.
   *
   * 🔒 In (0, 1] by construction, never a division by zero. `depthStep` is a
   * difference between two of this mesh's own `z` values, so the span over all
   * of them is at least as large; and a fold only exists where the axis area
   * with `z` substituted in is non-zero, which needs two vertices of the
   * triangle at different depths — so a mesh with no span reports no fold and
   * never reaches the divide.
   *
   * ⛔ A report and never a threshold. rigc does not decide that an author's
   * sheet is the wrong kind of thing; nothing here filters, and nothing here
   * moves a ceiling. What to read off the number is stated in
   * `docs/AUTHORING.md` §3.4.
   */
  stepShare: number;
  /** How many triangles fold on this axis and side — the population below. */
  count: number;
  /**
   * The 1st percentile of those triangles' fold angles in degrees, or `null`
   * where the population is too small to have one.
   *
   * Nearest-rank on the ascending angles, the same definition the noise study
   * measured its distribution tables with: index `round(0.01·(count−1))`. That
   * index is **zero for every `count` below 51**, so on a small mesh the first
   * percentile is arithmetically the minimum and a ratio of exactly 1.000 would
   * be printed for a sheet with one bad texel in it as readily as for a form.
   *
   * ⭐ `null` rather than that number, for the reason `A21` needed a third
   * `meshKinds` state: a default is how "nothing to measure" quietly becomes a
   * measurement of the wrong thing. `count` is reported beside it so a reader
   * can see how thin a population a printed percentile came from — at 51 it is
   * the second-smallest angle, and a limit two triangles share is not yet a
   * band.
   */
  p1: number | null;
}

/**
 * A depth step in the units `z` was supplied in, restated in ENCODING LEVELS.
 *
 * One arithmetic in one place: `zScale` spans the sheet's full 0..255 range, so
 * one level is `zScale/255` world units. The CLI prints this and the controls
 * assert on it, and neither writes the division out again.
 */
export function depthStepLevels(depthStep: number, zScale: number): number {
  return (depthStep * 255) / zScale;
}

/**
 * Which index of an ascending list of `n` the nearest-rank `q` percentile is.
 *
 * The same rule `bench/studies/2026-09-05-noise` measured its distribution
 * tables with, so the figure the compiler prints and the figure that study
 * reports are one statistic. Round-half-up makes it deterministic for every
 * length, which `A18` requires. **Zero is a real answer and the caller has to
 * read it as one** — it means the percentile of this population is its own
 * minimum, which is a fact about the population and not a percentile.
 */
function nearestRankIndex(n: number, q: number): number {
  return Math.min(n - 1, Math.max(0, Math.round(q * (n - 1))));
}

/**
 * What a mesh's own geometry says about the turn it can take, per axis and per
 * direction. `null` where nothing in the mesh folds short of 90°.
 */
export interface TurnCeiling {
  yaw: { positive: FoldLimit | null; negative: FoldLimit | null };
  pitch: { positive: FoldLimit | null; negative: FoldLimit | null };
  /** Triangles with enough setup area to give an answer. */
  measured: number;
  /** Triangles already flat in setup, which no angle makes worse. */
  degenerate: number;
}

/**
 * The largest turn this mesh takes on this depth before a triangle reverses.
 *
 * ## The arithmetic, in full, because it is three lines
 *
 * A `yaw` moves each vertex to `x' = u·cos t − z·sin t` and leaves `y` alone, so
 * a triangle's doubled signed area is *linear in the two trig terms*:
 *
 *     2A(t) = cos t · [Δu_b·Δy_c − Δu_c·Δy_b] − sin t · [Δz_b·Δy_c − Δz_c·Δy_b]
 *           = 2A₀·cos t − 2A_yaw·sin t
 *
 * where `A_yaw` is the setup area with **z substituted for u**. It crosses zero
 * at `tan t = A₀ / A_yaw` — exactly, with no search and no iteration. A `pitch`
 * is the same statement with the substitution in the other slot.
 *
 * ⭐ **The sign of that ratio picks the direction.** A positive ratio folds at
 * `+atan(ratio)` and a negative one at `−atan|ratio|`, so every triangle folds
 * in exactly ONE direction and a part's two ceilings are generally different.
 * Reporting one number for both would be quoting the tighter of two answers as
 * if it were the only one — a face that turns 30° left and 18° right is the
 * ordinary case, not an anomaly.
 *
 * ## Why this is a report and not a refusal
 *
 * `A39` already refuses a key that folds, from the artifact, through the
 * runtime. This measures the same wall from the other side and *before* a key
 * is written, which is the whole of its value: the loop it replaces is "pick an
 * angle, build, read the refusal, guess again". Adding a second refusal here
 * would be the compiler inventing a policy out of a measurement.
 *
 * ## What the minimum alone cannot say (issue #412)
 *
 * The four angles are correct and, on a noisy sheet, useless on their own. A
 * clean 8-bit sheet read at 4,225 vertices reports 64.58°; move ONE texel of
 * 160,000 by 245 levels and the same sheet reports 6.08° — and `A39` refuses at
 * both, measured to 0°. So each `FoldLimit` also carries `p1`, the 1st
 * percentile of its own side's fold angles, and `depthStep`, what the sheet
 * changed across the triangle that goes first. A `p1/degrees` near 1 is a band
 * of the mesh reaching the limit together, which is a form; near 10 it is one
 * triangle, which is a texel. A `depthStep` of one level is `atan(255·h/zScale)`
 * and says nothing about the form at all.
 *
 * ## What a band cannot say either (issue #448)
 *
 * Both of those figures read *healthy* on an estimated depth sheet over cut-out
 * art, and they do not merely stay silent — they affirm it. `p1/degrees` comes
 * back at 1.02–2.17, which reads as a band; `depthStep` at 148–252 levels of
 * 255, which reads as plenty said. It **is** a band, because an outline is long,
 * and the sheet did say a great deal across that triangle — it said the whole
 * distance from the figure to the background in one step.
 *
 * So each `FoldLimit` also carries `stepShare`, the same step divided by the
 * range this mesh sampled. A form's halves per refinement while its angle
 * converges; a discontinuity's pins near 1 while the angle halves. Measured:
 * rigc's own gallery reads 0.112 and 0.468, a synthetic raised cosine 0.394
 * falling to 0.027 under refinement, the same cosine with one planted cliff a
 * flat 0.50, and estimated sheets 0.92–0.99.
 *
 * ⛔ All three are reports. Nothing here filters the sheet, and nothing here
 * moves a ceiling: a smoothed measurement would describe a surface the deform
 * key is not built from, and would part company with the gate that reads the
 * raw one.
 *
 * ## Which triangle, when two fold at the same angle (issue #949)
 *
 * The minimum is chosen on the six-decimal grid the angle is reported on, and
 * a tie there goes to the LOWEST triangle ordinal — the triangle `A39` names
 * first when a key turns just past the ceiling (`foldPrecedes`). Chosen on the
 * full doubles, it was the platform's libm that broke a tie: on
 * `gallery/look`, triangles 49 and 50 fold at exactly `26.935130523311` and a
 * one-ulp `Math.pow` perturbation (through the depth tone, into every `z`)
 * named 50 instead of 49, moving 5 leaves of the model document in one
 * direction and 10 in the other while no printed angle moved. With the rule,
 * a ±1 ulp perturbation of `atan`, `pow`, or sixteen libm functions at once
 * moves no leaf of any gallery row's document (`TB02` re-runs it in process).
 *
 * @param points Vertices in the BIND space the deform offsets are authored in.
 *   Areas are translation-invariant, so the origin does not matter; the scale
 *   and the axis directions do. A y flip alone leaves a `yaw` answer alone and
 *   SWAPS a `pitch`'s two directions, which is why the caller composes the
 *   emitter's own mapping rather than approximating it.
 * @param z One depth per vertex, in those same units.
 */
export function turnCeiling(
  points: ReadonlyArray<readonly [number, number]>,
  z: readonly number[],
  triangles: ReadonlyArray<number>,
  options?: { narrowing?: boolean | { yaw?: boolean; pitch?: boolean } },
): TurnCeiling {
  if (z.length !== points.length) {
    throw new DepthError(`the mesh has ${points.length} vertices and ${z.length} depths were supplied for it`);
  }
  const narrowingOpt = options?.narrowing;
  const narrowingByAxis = {
    yaw: typeof narrowingOpt === 'object' ? narrowingOpt.yaw !== false : narrowingOpt !== false,
    pitch: typeof narrowingOpt === 'object' ? narrowingOpt.pitch !== false : narrowingOpt !== false,
  };
  const out: TurnCeiling = {
    yaw: { positive: null, negative: null },
    pitch: { positive: null, negative: null },
    measured: 0,
    degenerate: 0,
  };
  // The floor is relative, so it needs the mesh's own scale first.
  let largest = 0;
  const areas: number[] = [];
  for (let t = 0; t < triangles.length; t += 3) {
    const [ia, ib, ic] = [triangles[t], triangles[t + 1], triangles[t + 2]];
    const a = (points[ib][0] - points[ia][0]) * (points[ic][1] - points[ia][1])
      - (points[ic][0] - points[ia][0]) * (points[ib][1] - points[ia][1]);
    areas.push(a);
    if (Math.abs(a) > largest) largest = Math.abs(a);
  }
  const floor = largest * CEILING_AREA_FLOOR;

  // The denominator `stepShare` is taken against: the depth range this mesh
  // sampled, which is `range` in the report read off the same array. Taken over
  // the WHOLE mesh rather than per triangle, because the question the figure
  // answers is how much of what the sheet said here one triangle said.
  let zLo = Infinity;
  let zHi = -Infinity;
  for (const d of z) {
    if (d < zLo) zLo = d;
    if (d > zHi) zHi = d;
  }
  const zSpan = zHi - zLo;

  // One list per axis and side, so the ceiling can say whether it is the floor
  // of a BAND or of a single triangle. Nothing here filters: every measurable
  // triangle goes in exactly once, in triangle order, and the sort below is
  // numeric — `A18` compares a second compile byte for byte.
  const angles = {
    yaw: { positive: [] as number[], negative: [] as number[] },
    pitch: { positive: [] as number[], negative: [] as number[] },
  };

  for (let t = 0, n = 0; t < triangles.length; t += 3, n++) {
    const [ia, ib, ic] = [triangles[t], triangles[t + 1], triangles[t + 2]];
    const a0 = areas[n];
    if (Math.abs(a0) <= floor) {
      out.degenerate++;
      continue;
    }
    out.measured++;
    const dyb = points[ib][1] - points[ia][1];
    const dyc = points[ic][1] - points[ia][1];
    const dxb = points[ib][0] - points[ia][0];
    const dxc = points[ic][0] - points[ia][0];
    const dzb = z[ib] - z[ia];
    const dzc = z[ic] - z[ia];
    const ids: [number, number, number] = [ia, ib, ic];
    // The sheet read through THIS triangle, in the units `z` came in. It is the
    // step, not the angle: a triangle whose three vertices sample one level
    // apart has nothing but the encoding to say, whatever angle that works out
    // to. Reported per fold below, and never used to change one.
    const depthStep = Math.max(Math.abs(dzb), Math.abs(dzc), Math.abs(dzc - dzb));
    // z in the driven axis's slot: x for a yaw, y for a pitch.
    for (const [axis, aAxis] of [
      ['yaw', dzb * dyc - dzc * dyb],
      ['pitch', dxb * dzc - dxc * dzb],
    ] as const) {
      // A zero here is a triangle the axis cannot fold at all: its area stays
      // `A₀·cos t` (or `A₀` when `narrowing` is false), which only reaches zero
      // at a right angle or never.
      if (aAxis === 0) continue;
      const ratio = a0 / aAxis;
      const narrowing = narrowingByAxis[axis];
      // With `narrowing: false`, `2A(t) = 2A₀ − 2A_axis·sin t`, which crosses
      // zero at `sin t = A₀ / A_axis = ratio`. A ratio with `|ratio| >= 1` never
      // crosses zero short of 90° (`|sin t| < 1` on `(0, 90°)`), so it is
      // skipped for the same reason `aAxis === 0` is.
      if (!narrowing && Math.abs(ratio) >= 1) continue;
      const degrees = ((narrowing ? Math.atan(Math.abs(ratio)) : Math.asin(Math.abs(ratio))) * 180) / Math.PI;
      const side = ratio > 0 ? 'positive' : 'negative';
      angles[axis][side].push(degrees);
      const held = out[axis][side];
      // `count` and `p1` are filled once the whole population is in; a minimum
      // cannot know its own percentile while it is still being found.
      // On the reported grid, lowest ordinal first — `foldPrecedes` above. The
      // walk is in ordinal order, so the ordinal clause never decides here; it is
      // stated so the rule does not depend on the walk.
      if (held === null || foldPrecedes({ degrees, triangle: n }, held)) {
        // `zSpan` cannot be zero here: `aAxis !== 0` needs two of this
        // triangle's vertices at different depths, and the span over the whole
        // mesh is at least that difference. A guard would be an unreachable
        // branch, and an unreachable branch is not a control.
        out[axis][side] = { degrees, triangle: n, ids, depthStep, stepShare: depthStep / zSpan, count: 0, p1: null };
      }
    }
  }

  for (const axis of ['yaw', 'pitch'] as const) {
    for (const side of ['positive', 'negative'] as const) {
      const held = out[axis][side];
      if (held === null) continue;
      const sorted = angles[axis][side].slice().sort((a, b) => a - b);
      const rank = nearestRankIndex(sorted.length, 0.01);
      held.count = sorted.length;
      held.p1 = rank === 0 ? null : r6(sorted[rank]);
      held.degrees = r6(held.degrees);
      held.depthStep = r6(held.depthStep);
      held.stepShare = r6(held.stepShare);
    }
  }
  return out;
}
