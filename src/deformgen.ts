/**
 * A `deform` key's offsets, evaluated from a transform the spec states.
 *
 * ## Why this module exists
 *
 * A `deform` timeline was the one place in a rig spec where an author was still
 * transcribing arithmetic. `gallery/portrait`'s held 12° head yaw is **160
 * vertex offsets across 8 keys**, and not one of them is a judgement: every one
 * is `x·(cos t − 1) − z·sin t` evaluated at a different column
 * (docs/FACE.md §1). A second angle is a second full table, which is why that
 * example's own angle sweep needed a throwaway script that was never in the
 * repository — *the measurement existed and the reproduction did not*
 * (issue #294).
 *
 * rigc already had this shape of answer for **geometry**:
 * `generator: { kind: "contour" | "ring" | "ribbon" }` exists because "a table
 * of numbers is the wrong way to say a deformation model" (AUTHORING §3.4).
 * This is the same move on the animation half. **The spec states the model and
 * the compiler states the numbers**, so `explain` can print what a key does, an
 * author can sweep a parameter, and a reviewer can check a claim instead of a
 * transcription.
 *
 * ## What this is NOT, and the three rules that keep it that way
 *
 * 1. **It never authors.** Every parameter arrives from the spec — the angle,
 *    the radius, the amplitude, the point a scale is about. Nothing here has a
 *    default measured off the art, and a missing number is a `CompileError`
 *    naming the field, exactly as everywhere else in the compiler.
 * 2. **It generates no in-betweens.** MOTION §7 refuses a `rigc tween`, and
 *    this is not one: a transform is evaluated **at one key**, from parameters
 *    that key states, and the blend between two keys is still the deform
 *    timeline's own single 0..1 channel. Sweeping an angle is editing one number
 *    per key, never asking the compiler to interpolate a model.
 * 3. **A parameter that cannot mean what it says is refused by name**, on the
 *    principle that a parameter changing nothing is a reader's false lead about
 *    which model produced the numbers: `wavelength: 0`, a determinant at or
 *    below 0, a radius that falls inside the part. Since issue #350 that extends
 *    one step later, to a model whose parameters are each legal and whose
 *    *evaluation* is an all-zero run — the refusal at the bottom of
 *    `evaluateDeformTransform`, whose whole difficulty is telling that apart
 *    from a key that means the identity and says so.
 *
 * ## Determinism
 *
 * Every closed form below is a fixed sequence of float64 operations over
 * numbers read from the spec, in vertex order, with no iteration over an
 * unordered set. The caller quantises with the compiler's `onModelGrid` — a
 * model's own 1e-6 resolution, ending in the float32 name every emitted number
 * takes — so the same spec emits the same bytes, which `A18_DETERMINISTIC_EMIT`
 * proves on a second independent compile. The grid is absolute on purpose: a
 * closed form's identities (a zero crossing, a whole revolution) are exact
 * zeros float64 misses by ~1e-16, and a float32 grid alone has no zero to land
 * on. The runtime then loads the numbers into a `Float32Array`, which is the
 * reason the offsets are reported in the units they are emitted in rather than
 * at full float64 width.
 */

import { CompileError } from './errors.ts';
import { hypot2 } from './numeric.ts';
import { RIG_INFLUENCE_SHAPES } from './rig.ts';

/** Which coordinate a bend or a wave reads, and which one it displaces. */
export type DeformAxis = 'x' | 'y';

/**
 * A **2.5D turn**: the part is treated as painted on a cylinder standing on
 * `about`, and the key is that rotation projected back onto the screen.
 *
 * `yaw` stands the cylinder vertically and moves vertices horizontally; `pitch`
 * is the same expression with the axes swapped.
 *
 * ## Why there is no separate `parallax` kind
 *
 * A pure depth slide — `d = z · offset`, no angle — was written and then taken
 * out again (2026-09-05), for two reasons and the second is the one that
 * settles it.
 *
 * ⭐ **It is this form with a term dropped.** Subtract them and the whole
 * remainder is `u · (cos t − 1)`, independent of the depth, so the slide is
 * `yaw` at a small angle and nothing else: at 16° the gap is 2.32px, at 1°
 * 0.0091px, quartering with each halving. A second kind for the same model
 * evaluated less accurately is a second answer to one question.
 *
 * 🚨 **And what it was for is not rigc's to state.** A depth slide is a CAMERA
 * move — the viewer shifts and the near parts lag — driven by a pointer, not by
 * a clock. This spec is a timeline. Baking a pointer-driven parameter into time
 * keys is a category error, and it bakes what a runtime should be evaluating.
 *
 * ⇒ What rigc states about a raised surface is the ANGLE it may turn through
 * (here) and, for a soft one, how it answers an impact (a physics constraint on
 * a bone the mesh is bound to). The camera belongs to whatever draws the
 * result. docs/FACE.md §1 is the whole
 * derivation, and §4.2 is the angle past which any given column pair folds —
 * this evaluates the projection and says nothing about whether the angle is
 * sane. `A39_DEFORM_KEEPS_TRIANGLE_WINDING` is what catches a fold.
 */
export interface DeformTurn {
  kind: 'yaw' | 'pitch';
  /**
   * The cylinder's radius, in the attachment's own units.
   *
   * ⚠️ **Not the plate's half-width.** For `gallery/portrait`'s head plate the
   * two coincide (340/2 = 170); for its fringe they do not — 372 wide and
   * `radius` 196, because 196 is where the fringe *sits*, 26 in front of the
   * skull. Read it off the depth table, never off the PNG (FACE §4).
   */
  radius?: number;
  /**
   * Read `z` per vertex from the attachment's depth map instead of deriving it
   * from a cylinder — the same closed form with a measured surface under it.
   *
   * ⭐ It replaces `radius`, and stating both is refused: they are two answers
   * to "how far forward is this vertex", and a spec that carries both leaves a
   * reader unable to tell which one the output came from. The map itself is
   * named on the attachment's `generator` ([`src/rig.ts`](rig.ts)), because it
   * is a property of the art rather than of this key — every key that turns
   * this part reads the same surface.
   */
  depth?: boolean;
  /** The turn, in degrees. Positive yaws toward −x, which is FACE §1's sign. */
  degrees: number;
  /** Where the axis crosses the driving coordinate. Default 0. */
  about?: number;
  /**
   * Whether the displacement includes the foreshortening of the vertex's setup
   * position `(u − about)·(cos t − 1)`. Default `true`.
   *
   * When `false`, each vertex moves by `−z·sin t` alone — for a rig whose plate
   * proportions are held at their front-view width across the turn and whose
   * triangles therefore fold at `sin t = A₀ / A_axis` (`asin`) rather than
   * `tan t = A₀ / A_axis` (`atan`) (issue #1584).
   */
  narrowing?: boolean;
  /** Scales each vertex's offset by a weight in [0, 1] — see `DeformEnvelope`. */
  envelope?: DeformEnvelope;
}

/**
 * A **scale about a point** — `gallery/squash`'s two shapes, which its README
 * already writes out as `sx`/`sy` about a point.
 *
 * The point is fixed by construction, which is the property that makes the
 * example's claim checkable: the ball's contact vertex sits at the contact
 * point, so its offset is `(0, 0)` and the ball flattens against the ground
 * rather than sinking through it — with no key anywhere that has to be tuned to
 * make that true.
 *
 * ⭐ `det = sx · sy` is refused at or below 0, and above 0 it is a **proof**
 * rather than a report: an affine map with a positive determinant preserves
 * every triangle's winding, so a key of this kind cannot be the fold A39 hunts.
 * A shear belongs to `bend` with `power: 1`.
 */
export interface DeformAffine {
  kind: 'affine';
  /** `[sx, sy]`. 1 is unchanged; both are required, because a guessed one is a value the spec did not state. */
  scale: [number, number];
  /** The fixed point, in the attachment's own units. Default `[0, 0]`. */
  about?: [number, number];
  /** Scales each vertex's offset by a weight in [0, 1] — see `DeformEnvelope`. */
  envelope?: DeformEnvelope;
}

/**
 * A sinusoid of one coordinate, displacing along another.
 *
 * ⚠️ **A wavelength is only as real as the geometry that samples it.** The mesh
 * carries the wave at the coordinates it happens to have, so a period short
 * against the spacing of those coordinates does not make a smaller ripple — it
 * makes a different model. Against a spacing of `s`: `wavelength ≥ 4s` to read
 * as a wave at all and `≥ 8s` to read as a curve; at `2s` every sample lands on
 * the same pair of phases, which is a zigzag, and at that pair's zero crossings
 * it is nothing at all. The last of those is refused (issue #350) because it
 * emits an all-zero run while claiming an amplitude; the zigzag is not, because
 * it is a bad wave rather than an absent one and that is authoring judgement.
 */
export interface DeformWave {
  kind: 'wave';
  /** Peak displacement, in the attachment's own units. */
  amplitude: number;
  /** One period, in the same units as the coordinate `along` reads. Sampled by the geometry — see the note above. */
  wavelength: number;
  /** Phase at `along = 0`, in degrees. Default 0. */
  phase?: number;
  /** The coordinate the sinusoid reads. */
  along: DeformAxis;
  /** The coordinate it displaces. */
  axis: DeformAxis;
  /** Scales each vertex's offset by a weight in [0, 1] — see `DeformEnvelope`. */
  envelope?: DeformEnvelope;
}

/**
 * A **polynomial bend**: displacement rising as a power of how far along the
 * part a vertex is.
 *
 * `power: 1` is an affine shear, and every higher power is a curve no bone
 * transform can produce — which is the whole reason a `deform` timeline is
 * worth its numbers on a mesh whose vertices are pinned to one bone.
 * `power: 2` is a cantilever: zero displacement **and zero slope** at `from`,
 * so a part held at one end bends rather than tilting.
 */
export interface DeformBend {
  kind: 'bend';
  /** Displacement at `to`, in the attachment's own units. */
  amount: number;
  /** Where the bend is anchored — displacement is 0 here. */
  from: number;
  /** Where it reaches `amount`. */
  to: number;
  /** The exponent. A whole number ≥ 1; default 2. */
  power?: number;
  /** The coordinate that measures how far along a vertex is. */
  along: DeformAxis;
  /** The coordinate it displaces. */
  axis: DeformAxis;
  /** Scales each vertex's offset by a weight in [0, 1] — see `DeformEnvelope`. */
  envelope?: DeformEnvelope;
}

export type DeformTransform = DeformTurn | DeformAffine | DeformWave | DeformBend;

/**
 * The two curves an envelope rises along: the names `influence.shape` gives its
 * pull (issue #1415), and the same two curves read from the other end — a pull
 * falls from 1 to 0, a weight rises from 0 to 1, and each is `1 − the other`
 * at the same `u`. One vocabulary, so `"smooth"` means one curve in this tree.
 */
export const DEFORM_ENVELOPE_SHAPES = RIG_INFLUENCE_SHAPES;

/**
 * **Which vertices a transform moves, and how much** (issue #1413) — a weight
 * in [0, 1] per vertex that each vertex's offset is multiplied by before it is
 * written, so "only the hem ripples" is a model rather than a table.
 *
 * Two forms, and a key states exactly one:
 *
 * - **a ramp** — `axis`, `from`, `to`, `shape`. A vertex's position is read
 *   along `axis` (`p = axis · position`), `u = (p − from) / (to − from)` is
 *   clamped to [0, 1], and the weight is `u` (`"linear"`) or `u²(3 − 2u)`
 *   (`"smooth"`). So the weight is 0 at `from` and everywhere before it, 1 at
 *   `to` and everywhere past it.
 * - **a mask** — `mask`, the file name of this attachment's own `soft` mask
 *   (AUTHORING §3.4.6). The weight is the level that mask was sampled to at the
 *   vertex when the mesh was built, black 0 and white 1 — the same number the
 *   soft region's binding carries.
 *
 * ⭐ **The ramp is read in the space the transform is evaluated in**, and that
 * is the only space it could be read in: the weight multiplies the offset the
 * model produced at a vertex, so the position that picks the weight has to be
 * the position the model read. That is the attachment's own space while every
 * vertex is one pair of one bone, and setup WORLD past that (§4.11.1) — so
 * `from` and `to` change units exactly when `radius`, `about` and a bend's
 * `from` do, and the report's `derived` line says which.
 *
 * 🔒 **It is baked, not played.** The weighted offsets are the deform table the
 * file carries, so the runtime is asked to do nothing it did not already do and
 * every poser sees the same numbers. Every number here is a field the spec
 * states; none has a default.
 */
export interface DeformEnvelope {
  /**
   * The unit direction a vertex's position is read along — `[0, 1]` reads `y`,
   * `[1, 0]` reads `x`, and a diagonal reads across both. Its length is 1 on
   * the model's own 1e-6 grid, or the key is refused: a longer one would scale
   * the positions `from` and `to` are compared with.
   */
  axis?: [number, number];
  /** The position along `axis` where the weight is 0 — and before which it stays 0. */
  from?: number;
  /** The position along `axis` where the weight is 1 — and past which it stays 1. Differs from `from`. */
  to?: number;
  /** How the weight rises between them: `"linear"` is `u`, `"smooth"` is `u²(3 − 2u)`, flat at both ends. */
  shape?: (typeof DEFORM_ENVELOPE_SHAPES)[number];
  /** The file name of this attachment's own `soft` mask; the weight is its sampled level. Never beside the ramp's fields. */
  mask?: string;
}

/**
 * A `soft` mask as the mesh builder sampled it: the file the generator named
 * and its level at each vertex, `0..1`, in the emitted vertex order — what a
 * `mask` envelope reads. Kept beside the attachment rather than in it, as a
 * depth map's `z` is, because the format has nowhere to carry it.
 */
export interface DeformSoftMask {
  mask: string;
  levels: readonly number[];
}

/** What an envelope did, for `explain` to print beside the model. */
export interface DeformEnvelopeReport {
  /** The envelope as the spec states it. */
  stated: string;
  /** How a vertex's weight is computed, written out. */
  formula: string;
  /**
   * Each vertex's weight, on the model's 1e-6 grid — the number its offset was
   * multiplied by. Every emitted offset is `round(weight × the un-enveloped
   * offset)`, so a reader reproduces the run from this and the model.
   */
  weights: number[];
  /** How many vertices took weight 0, and how many weight 1. */
  zero: number;
  full: number;
}

/** The kinds this module evaluates, in the order the docs list them. */
export const DEFORM_TRANSFORM_KINDS = ['yaw', 'pitch', 'affine', 'wave', 'bend'] as const;

/**
 * What one evaluation did, for `explain` to print and a reviewer to check.
 *
 * `stated` is the spec's own parameters and `derived` the scalars the closed
 * form got out of them — the two lines that let somebody re-derive a column by
 * hand. `offsets` is the emitted run, so the report and the artifact cannot
 * disagree (`explain`'s `DEFORM` block, issue #316, quotes this rather than
 * re-evaluating it — see `src/deformmeasure.ts`).
 */
export interface DeformTransformReport {
  kind: DeformTransform['kind'];
  /** The transform as the spec states it. */
  stated: string;
  /** The scalars the closed form derived, e.g. `cos t − 1 = −0.021852`. */
  derived: string[];
  /** The closed form, written out. */
  formula: string;
  vertexCount: number;
  /** Largest offset magnitude in the run, and the vertex carrying it. */
  maxOffset: number;
  maxOffsetVertex: number;
  /**
   * The displacement the model states: `x, y` per vertex, already quantised by
   * the caller's rounder.
   *
   * On an attachment whose deform array is one pair per vertex this IS the
   * emitted run, which is the case every report printed before issue #389. On a
   * multi-influence one it is one WORLD displacement per vertex, and the array
   * the caller wrote from it is `expanded` on the compile result — the report
   * still quotes what was emitted rather than re-evaluating anything.
   *
   * Under an envelope these are the WEIGHTED displacements — what was emitted
   * — and `envelope` carries the weights.
   */
  offsets: number[];
  /** Present only on a key that states an `envelope` (issue #1413). */
  envelope?: DeformEnvelopeReport;
}

/** The compiler's `onModelGrid` (1e-6, then float32), passed in so the quantiser stays in one place. */
export type Rounder = (n: number) => number;

/**
 * Evaluate one transform over an attachment's setup geometry.
 *
 * `setup` is `x, y` per vertex, and what comes back is **one displacement per
 * vertex in the same space** — this function neither knows nor needs to know
 * which space that is. The caller owns it, and since issue #389 there are two:
 * the deform array's own space, where every vertex is one pair of one bone's
 * bind space and the result IS the array; and setup **world**, where a vertex
 * has several influences and the caller pushes each displacement into every one
 * of them through that bone's inverse. Either way the array handed in means one
 * thing all the way down it, which is the precondition the closed forms need.
 *
 * Returns a run as long as `setup`, so it always starts at deform index 0 and
 * covers the whole attachment. That is deliberate and it is not a convenience:
 * a transform is a model of the geometry rather than an edit of part of it, and
 * a partially applied model leaves a **step discontinuity at the end of the
 * run** — which is exactly one half of the defect issue #313 records, where a
 * 20-vertex run of a hand-authored ripple began 6.3px away from the unkeyed
 * vertex before it.
 */
export function evaluateDeformTransform(
  transform: DeformTransform,
  setup: readonly number[],
  round: Rounder,
  where: string,
  /**
   * Per-vertex `z` for this attachment, when its generator named a depth map.
   * Null when it named none — which is what makes `"depth": true` refusable by
   * name rather than silently falling back to a cylinder.
   */
  depth: readonly number[] | null = null,
  /**
   * The attachment's `soft` mask as its builder sampled it, or null when its
   * generator named none — what makes a `mask` envelope that names nothing
   * refusable by name (issue #1413).
   */
  soft: DeformSoftMask | null = null,
): DeformTransformReport {
  if (transform === null || typeof transform !== 'object' || Array.isArray(transform)) {
    throw new CompileError(`${where}: "transform" is ${JSON.stringify(transform)}; it is an object with a "kind"`, 'CE_DEFORM_TRANSFORM_OBJECT');
  }
  const kind = (transform as { kind?: unknown }).kind;
  if (typeof kind !== 'string' || !(DEFORM_TRANSFORM_KINDS as readonly string[]).includes(kind)) {
    throw new CompileError(
      `${where}: "transform" has kind ${JSON.stringify(kind)}; this spec evaluates ${DEFORM_TRANSFORM_KINDS.join(', ')}. ` +
        'A model that is none of those is still authorable as a "vertices" run.', 'CE_DEFORM_TRANSFORM_KIND',
    );
  }
  const count = setup.length / 2;
  const offsets = new Array<number>(setup.length);
  // An envelope scales each vertex by its own weight, so a proof that holds of
  // the model — an affine's positive determinant, a power-1 bend's shear —
  // says nothing about the enveloped key, and the derived line must not claim it.
  const envelope = (transform as { envelope?: unknown }).envelope;
  let derived: string[];
  let stated: string;
  let formula: string;
  // -- the three values the all-zero refusal at the bottom reads (issue #350) -
  //
  // `identity` is whether the transform's own scalars state the identity, and it
  // is judged on the ROUNDED scalars rather than in float64 — a `degrees: 360`
  // turn leaves `sin t` at −2.4e−16, which is 0 on the grid a model is evaluated
  // on (`onModelGrid`), so a spec that states a whole revolution states the identity as
  // surely as `degrees: 0` does. `band` is the largest magnitude the closed form
  // reached *before* quantising, which is what separates a model that is
  // arithmetically zero (a band of float noise, ~1e−15) from one that is real
  // and smaller than that grid. `sampledTo` is the per-kind diagnosis.
  let identity: boolean;
  let identitySpelling: string;
  let band = 0;
  let sampledTo = '';
  const widen = (d: number): number => {
    const m = Math.abs(d);
    if (m > band) band = m;
    return d;
  };

  switch (kind) {
    case 'yaw':
    case 'pitch': {
      const t = transform as DeformTurn;
      const degrees = num(t.degrees, 'degrees', where);
      const about = t.about === undefined ? 0 : num(t.about, 'about', where);
      // -- which surface the turn is projected off (issue #382) --------------
      //
      // Two models, one closed form. A cylinder derives `z` from how far off
      // the axis a vertex sits; a depth map states it per vertex. Everything
      // below is shared, and the only difference is where `z` comes from — the
      // reason this is a branch on the input and not a second transform kind.
      const fromDepth = t.depth === true;
      if (fromDepth && t.radius !== undefined) {
        throw new CompileError(
          `${where}: transform ${kind} states both "depth": true and a radius ${JSON.stringify(t.radius)}. They are ` +
            'two answers to how far forward each vertex sits — a cylinder derives it, a map states it — and a key ' +
            'carrying both leaves a reader unable to say which one the output came from. Drop one.', 'CE_DEFORM_DEPTH_RADIUS_CONFLICT',
        );
      }
      if (fromDepth && depth === null) {
        throw new CompileError(
          `${where}: transform ${kind} says "depth": true and this attachment has no depth map. The map is named on ` +
            'the attachment\'s generator, as `"depth": { "image": …, "near": …, "zScale": … }`, because it describes ' +
            'the art rather than this key. Name it there, or give this key a radius.', 'CE_DEFORM_DEPTH_MAP_REQUIRED',
        );
      }
      if (fromDepth && depth !== null && depth.length !== count) {
        // Unreachable while the sampler walks the same vertex list the mesh
        // emitted; stated because a silent mismatch here would turn into a turn
        // evaluated against another vertex's depth.
        throw new CompileError(
          `${where}: transform ${kind} has ${depth.length} sampled depths for ${count} vertices`, 'CE_DEFORM_DEPTH_SAMPLE_COUNT',
        );
      }
      const radius = fromDepth ? 0 : num(t.radius, 'radius', where);
      if (!fromDepth && radius <= 0) {
        throw new CompileError(`${where}: transform ${kind} has radius ${radius}; it is the radius of the cylinder the part is painted on, so a positive number`, 'CE_DEFORM_RADIUS_POSITIVE');
      }
      const rad = (degrees * Math.PI) / 180;
      const cosMinus1 = Math.cos(rad) - 1;
      const sin = Math.sin(rad);
      const narrowing = t.narrowing !== false;
      // The driving coordinate is the one the axis is perpendicular to: x for a
      // yaw (a vertical axis), y for a pitch (a horizontal one). The other
      // component of every pair is 0, because a turn about an axis moves
      // nothing along it.
      const along = kind === 'yaw' ? 0 : 1;
      for (let v = 0; v < count; v++) {
        const u = setup[2 * v + along] - about;
        // A vertex outside the cylinder has no surface to be painted on, and
        // clamping its depth to 0 would silently evaluate a DIFFERENT model
        // there — a flat edge on a curved part. Refused by name instead: this is
        // FACE §4's "read R off the depth table, never off the PNG" as a check.
        if (!fromDepth && Math.abs(u) > radius) {
          throw new CompileError(
            `${where}: transform ${kind} has radius ${radius}, and vertex ${v} sits at ${kind === 'yaw' ? 'x' : 'y'}=` +
              `${setup[2 * v + along]}, which is ${round(Math.abs(u) - radius)} past it (about=${about}). The cylinder has no ` +
              'surface there, so its depth would be 0 and the projection would be a different model at that vertex. ' +
              'Raise the radius to where the part actually sits, or move the vertex.', 'CE_DEFORM_VERTEX_OUTSIDE_CYLINDER',
          );
        }
        // A depth map needs no such check: it states a surface everywhere it
        // covers, and a vertex it does NOT cover was already refused when the
        // mesh was built (`sampleContourDepth`) rather than here, where the
        // sheet is long out of reach.
        const z = fromDepth ? (depth as readonly number[])[v] : Math.sqrt(radius * radius - u * u);
        const d = (narrowing ? u * cosMinus1 : 0) - z * sin;
        offsets[2 * v + along] = round(widen(d));
        offsets[2 * v + (1 - along)] = 0;
      }
      identity = (narrowing ? round(cosMinus1) === 0 : true) && round(sin) === 0;
      identitySpelling = 'degrees 0';
      sampledTo = fromDepth
        ? `The turn is ${degrees}°, and a projection of it can only vanish where every vertex shares one ` +
          `${kind === 'yaw' ? 'x' : 'y'} AND one depth — check the depth map's sampled range in the mesh report, ` +
          'which is 0 wide when the sheet is flat where this part sits'
        : `The turn is ${degrees}°, and a projection of it can only vanish where every vertex shares one ` +
          `${kind === 'yaw' ? 'x' : 'y'} — check that this attachment's setup geometry is the shape the radius says it is`;
      const c = kind === 'yaw' ? 'x' : 'y';
      const narrowingNote = narrowing ? '' : ' narrowing=false';
      stated = fromDepth
        ? `depth=true degrees=${degrees}${t.about === undefined ? '' : ` about=${about}`}${narrowingNote}`
        : `radius=${radius} degrees=${degrees}${t.about === undefined ? '' : ` about=${about}`}${narrowingNote}`;
      formula = fromDepth
        ? narrowing
          ? `d${c} = (${c}−about)·(cos t − 1) − z·sin t,   z = the vertex's sampled depth`
          : `d${c} = −z·sin t,   z = the vertex's sampled depth`
        : narrowing
          ? `d${c} = (${c}−about)·(cos t − 1) − z·sin t,   z = √(radius² − (${c}−about)²)`
          : `d${c} = −z·sin t,   z = √(radius² − (${c}−about)²)`;
      derived = [
        `t = ${round(rad)} rad`,
        ...(narrowing ? [`cos t − 1 = ${round(cosMinus1)}`] : []),
        `sin t = ${round(sin)}`,
      ];
      if (fromDepth) {
        const zs = depth as readonly number[];
        let zlo = Infinity;
        let zhi = -Infinity;
        for (const z of zs) {
          if (z < zlo) zlo = z;
          if (z > zhi) zhi = z;
        }
        // The depth range is what a reader checks the amplitude against: the
        // deepest vertex moves `−zhi·sin t`, and that number is the one that
        // either matches the art or does not.
        derived.push(`z ∈ [${round(zlo)}, ${round(zhi)}] over ${zs.length} vertices`);
        derived.push(`deepest shift = −z_max·sin t = ${round(-zhi * sin)}`);
      } else {
        derived.push(`centre shift = −radius·sin t = ${round(-radius * sin)}`);
      }
      break;
    }
    case 'affine': {
      const a = transform as DeformAffine;
      const scale = pair(a.scale, 'scale', where);
      const about = a.about === undefined ? ([0, 0] as [number, number]) : pair(a.about, 'about', where);
      const det = scale[0] * scale[1];
      if (det <= 0) {
        throw new CompileError(
          `${where}: transform affine has scale [${scale[0]}, ${scale[1]}], whose determinant is ${round(det)}. ` +
            'At or below zero the map mirrors or collapses the geometry and EVERY triangle reverses its winding, ' +
            'which is the fold A39_DEFORM_KEEPS_TRIANGLE_WINDING refuses. A positive determinant is what makes this ' +
            'kind incapable of folding a mesh.', 'CE_DEFORM_AFFINE_DETERMINANT',
        );
      }
      for (let v = 0; v < count; v++) {
        offsets[2 * v] = round(widen((scale[0] - 1) * (setup[2 * v] - about[0])));
        offsets[2 * v + 1] = round(widen((scale[1] - 1) * (setup[2 * v + 1] - about[1])));
      }
      identity = round(scale[0] - 1) === 0 && round(scale[1] - 1) === 0;
      identitySpelling = 'scale [1, 1]';
      sampledTo =
        `A scale about a fixed point moves nothing that SITS on it, so every vertex this attachment has lies at ` +
        `about=[${about[0]}, ${about[1]}] on the axis the scale changes — the geometry has collapsed onto the point ` +
        'the key holds still';
      stated = `scale=[${scale[0]}, ${scale[1]}]${a.about === undefined ? '' : ` about=[${about[0]}, ${about[1]}]`}`;
      formula = 'dx = (sx − 1)·(x − ax),   dy = (sy − 1)·(y − ay)';
      derived = [
        `sx − 1 = ${round(scale[0] - 1)}`,
        `sy − 1 = ${round(scale[1] - 1)}`,
        envelope === undefined
          ? `det = sx·sy = ${round(det)} > 0, so no triangle can reverse`
          : `det = sx·sy = ${round(det)} > 0 un-enveloped; the envelope weighs each vertex alone, so the keyed map is not affine and A39 measures it`,
      ];
      break;
    }
    case 'wave': {
      const w = transform as DeformWave;
      const amplitude = num(w.amplitude, 'amplitude', where);
      const wavelength = num(w.wavelength, 'wavelength', where);
      const phase = w.phase === undefined ? 0 : num(w.phase, 'phase', where);
      if (wavelength === 0) {
        throw new CompileError(`${where}: transform wave has wavelength 0; one period cannot be zero long`, 'CE_DEFORM_WAVELENGTH_ZERO');
      }
      const [along, axis] = axes(w.along, w.axis, 'wave', where);
      const phaseRad = (phase * Math.PI) / 180;
      const k = (2 * Math.PI) / wavelength;
      for (let v = 0; v < count; v++) {
        const d = amplitude * Math.sin(k * setup[2 * v + along] + phaseRad);
        offsets[2 * v + axis] = round(widen(d));
        offsets[2 * v + (1 - axis)] = 0;
      }
      const an = along === 0 ? 'x' : 'y';
      identity = round(amplitude) === 0;
      identitySpelling = 'amplitude 0';
      // The sampling fact, measured off the array this call was handed rather
      // than inferred from a topology the compiler does not have: it knows which
      // coordinates it read, not where anybody's rows are. The smallest gap
      // between two distinct ones is the finest detail the geometry can carry,
      // and the ratio to it is the rule `gallery/nod`'s README states.
      const distinct = [...new Set(Array.from({ length: count }, (_, v) => setup[2 * v + along]))].sort((p, q) => p - q);
      let gap = Infinity;
      for (let i = 1; i < distinct.length; i++) gap = Math.min(gap, distinct[i] - distinct[i - 1]);
      sampledTo =
        distinct.length < 2
          ? `Every vertex sits at ${an}=${distinct[0]}, so one value of the sinusoid covers the whole attachment and ` +
            'this phase is where that one value crosses zero. A wave needs the coordinate it reads to VARY across the ' +
            'geometry; a part that displaces as a whole is a bone, not a deform'
          : `The closest two distinct ${an} coordinates in this attachment are ${round(gap)} apart, and a sinusoid has ` +
            `to be sampled to exist: a wavelength of at least 4x that (${round(4 * gap)}) to read as a wave at all and ` +
            `8x (${round(8 * gap)}) to read as a curve, where this key states ${round(wavelength / gap)}x. At 2x every ` +
            'sample lands on the same pair of phases, and at the zero crossings that pair is (0, 0). `gallery/nod`\'s ' +
            'README carries that rule and the measured table behind it';
      stated = `amplitude=${amplitude} wavelength=${wavelength} phase=${phase} along=${an} axis=${axis === 0 ? 'x' : 'y'}`;
      formula = `d${axis === 0 ? 'x' : 'y'} = amplitude · sin(2π·${an}/wavelength + phase)`;
      derived = [`2π/wavelength = ${round(k)} rad per unit`, `phase = ${round(phaseRad)} rad`];
      break;
    }
    default: {
      const b = transform as DeformBend;
      const amount = num(b.amount, 'amount', where);
      const from = num(b.from, 'from', where);
      const to = num(b.to, 'to', where);
      const power = b.power === undefined ? 2 : num(b.power, 'power', where);
      if (!Number.isInteger(power) || power < 1) {
        throw new CompileError(
          `${where}: transform bend has power ${power}; it is a whole number ≥ 1 (1 is an affine shear, 2 a cantilever ` +
            'that is flat at "from"). A fractional power is not evaluated because it has no value on the side of "from" ' +
            'the part does not reach.', 'CE_DEFORM_BEND_POWER_WHOLE',
        );
      }
      if (to === from) {
        throw new CompileError(`${where}: transform bend has from ${from} and to ${to}; they are the two ends of the bend, so they differ`, 'CE_DEFORM_BEND_ENDS_EQUAL');
      }
      const [along, axis] = axes(b.along, b.axis, 'bend', where);
      const span = to - from;
      let reach = 0;
      for (let v = 0; v < count; v++) {
        const u = (setup[2 * v + along] - from) / span;
        if (Math.abs(u) > reach) reach = Math.abs(u);
        offsets[2 * v + axis] = round(widen(amount * u ** power));
        offsets[2 * v + (1 - axis)] = 0;
      }
      const an = along === 0 ? 'x' : 'y';
      identity = round(amount) === 0;
      identitySpelling = 'amount 0';
      // `u` is 0 at `from` and 1 at `to`, so the two ways a stated bend vanishes
      // are both statements about where the geometry sits in that span — and
      // both are measured here rather than guessed.
      sampledTo =
        reach === 0
          ? `Every vertex sits at ${an}=${from}, which is "from" — the end the bend is anchored at, where the ` +
            'displacement is 0 by construction. The span the key names does not cross the part it is keyed on'
          : `The furthest any vertex reaches into the span is u=${round(reach)} of 1, and u^${power} of that is ` +
            `${(reach ** power).toExponential(3)} — so the part occupies only the flat end of the curve. Move "to" to ` +
            'where the geometry actually ends, or lower the power';
      stated = `amount=${amount} from=${from} to=${to} power=${power} along=${an} axis=${axis === 0 ? 'x' : 'y'}`;
      formula = `d${axis === 0 ? 'x' : 'y'} = amount · u^${power},   u = (${an} − from) / (to − from)`;
      derived = [
        `span = to − from = ${round(span)}`,
        power === 1 && envelope === undefined
          ? 'power 1 is an affine shear (det = 1), so no triangle can reverse'
          : power === 1
            ? 'power 1 is an affine shear (det = 1) un-enveloped; the envelope weighs each vertex alone, so the keyed map is not affine and A39 measures it'
          : `power ${power} is not affine — the gradient at u is ${power}·amount·u^${power - 1}/span, so it is 0 at "from"`,
      ];
      break;
    }
  }

  // -- a model the geometry sampled to nothing (issue #350) ------------------
  //
  // The three refusals above catch a parameter that cannot mean what it says —
  // `wavelength: 0`, a determinant at or below 0, a radius inside the part. This
  // is the same principle one step later: every parameter is individually legal,
  // and the model still evaluates to a run of zeros. The key then claims a
  // deformation, emits nothing, and *gates green* — `A35` is right that the run
  // fits and `A39` is right that no triangle moved, so neither can see it and
  // this is the only place it can be said.
  //
  // ⭐ **The distinguishing condition is where the identity is stated.** A key
  // that MEANS the setup pose says so in its own parameters — `degrees: 0` (or
  // any whole revolution), `amplitude: 0`, `amount: 0`, `scale: [1, 1]` — or
  // carries no run at all, which is the format's own `{ "t": … }`. Those pass.
  // What is refused is the pair that cannot both be true: parameters that state
  // a deformation, and an evaluation that is the identity. The two are not the
  // same event, and before this they printed the same line.
  //
  // `count > 0` is not defensive noise: `every` on an empty array is `true`, so
  // an attachment with no vertices would otherwise be refused with a message
  // about arithmetic that never ran.
  if (count > 0 && !identity && offsets.every((d) => d === 0)) {
    throw new CompileError(
      `${where}: transform ${kind} states ${stated}, and every one of this attachment's ${count} vertices evaluates ` +
        `to an offset of 0 — the largest value the closed form reached at any of them is ${band.toExponential(3)}, ` +
        'which quantises to 0 on the 1e-6 grid a model is evaluated on. So the key states a deformation and ' +
        `emits the identity, and nothing downstream can tell it apart from a key that meant the setup pose. ` +
        `${sampledTo}. A key that MEANS the identity states it in its own parameters (${identitySpelling}) or carries ` +
        'no run at all.', 'CE_DEFORM_TRANSFORM_QUANTISED_IDENTITY',
    );
  }

  // -- the envelope (issue #1413) --------------------------------------------
  //
  // Applied to the run the model emits un-enveloped — the ROUNDED offsets, the
  // ones a key without the envelope writes — and rounded again, so every
  // emitted offset is `round(weight × that offset)` and a reader reproduces it
  // from the report's weights and the model. Applied after the refusal above,
  // so a model the geometry sampled to nothing keeps that refusal's diagnosis,
  // and before the two below, which are the envelope's own.
  let envelopeReport: DeformEnvelopeReport | undefined;
  if (envelope !== undefined) {
    const weighed = evaluateDeformEnvelope(envelope, setup, soft, round, where);
    const plain = offsets.slice();
    for (let v = 0; v < count; v++) {
      offsets[2 * v] = round(weighed.weights[v] * plain[2 * v]);
      offsets[2 * v + 1] = round(weighed.weights[v] * plain[2 * v + 1]);
    }
    envelopeReport = weighed;
    const moving = plain.some((d) => d !== 0);
    // ⭐ The same principle as the refusal above, one step on: every field is
    // legal and the envelope still makes the key mean something other than it
    // says. Weighing every moving vertex 0 states a deformation and emits the
    // identity; leaving every emitted number where it was is a field that
    // changes nothing — a reader's false lead about which model produced the
    // run. A key whose model states the identity is exempt from both: the
    // envelope multiplies the zeros it already said.
    if (count > 0 && !identity && moving && offsets.every((d) => d === 0)) {
      throw new CompileError(
        `${where}: transform ${kind} states ${stated} and moves ${plain.filter((d, i) => i % 2 === 0 && (d !== 0 || plain[i + 1] !== 0)).length} ` +
          `of ${count} vertices, and envelope ${weighed.stated} weighs every one of them 0 — so the key states a ` +
          `deformation and emits the identity. ${weighed.reach}`, 'CE_DEFORM_ENVELOPE_ZERO_WEIGHT',
      );
    }
    if (count > 0 && !identity && moving && offsets.every((d, i) => d === plain[i])) {
      throw new CompileError(
        `${where}: transform ${kind} states envelope ${weighed.stated}, and it changes no emitted number: every vertex ` +
          `the model moves takes weight 1 (${weighed.full} of ${count} vertices at 1, ${weighed.zero} at 0), so the run ` +
          `is the un-enveloped one and the envelope is a field a reader would credit for an output it did not shape. ` +
          `${weighed.reach}`, 'CE_DEFORM_ENVELOPE_NO_EFFECT',
      );
    }
    stated = `${stated} envelope(${weighed.stated})`;
  }

  let maxOffset = 0;
  let maxOffsetVertex = 0;
  for (let v = 0; v < count; v++) {
    const m = hypot2(offsets[2 * v], offsets[2 * v + 1]);
    if (m > maxOffset) {
      maxOffset = m;
      maxOffsetVertex = v;
    }
  }
  return {
    kind: kind as DeformTransform['kind'],
    stated,
    derived,
    formula,
    vertexCount: count,
    maxOffset: round(maxOffset),
    maxOffsetVertex,
    offsets,
    ...(envelopeReport === undefined
      ? {}
      : {
          envelope: {
            stated: envelopeReport.stated,
            formula: envelopeReport.formula,
            weights: envelopeReport.weights,
            zero: envelopeReport.zero,
            full: envelopeReport.full,
          },
        }),
  };
}

/** The fields of the two envelope forms, in the order a refusal names them. */
const ENVELOPE_RAMP_FIELDS = ['axis', 'from', 'to', 'shape'] as const;

/**
 * Each vertex's envelope weight (issue #1413), refused by field name wherever
 * the envelope cannot mean what it says.
 *
 * `setup` is the array the model was evaluated over, so a ramp reads the same
 * positions in the same space the model did; `soft` is the attachment's
 * sampled mask, or null. Returns the weights on the model's grid with the
 * audit `explain` prints and the reach the two envelope refusals in
 * `evaluateDeformTransform` quote.
 */
export function evaluateDeformEnvelope(
  envelope: unknown,
  setup: readonly number[],
  soft: DeformSoftMask | null,
  round: Rounder,
  where: string,
): DeformEnvelopeReport & { reach: string } {
  if (envelope === null || typeof envelope !== 'object' || Array.isArray(envelope)) {
    throw new CompileError(
      `${where}: transform field "envelope" is ${JSON.stringify(envelope)}; it is an object — a ramp ` +
        '`{ "axis", "from", "to", "shape" }` or a mask `{ "mask" }`', 'CE_DEFORM_ENVELOPE_OBJECT',
    );
  }
  const e = envelope as DeformEnvelope;
  const count = setup.length / 2;
  const rampStated = ENVELOPE_RAMP_FIELDS.filter((f) => e[f] !== undefined);
  if (e.mask !== undefined && rampStated.length > 0) {
    throw new CompileError(
      `${where}: transform field "envelope" states "mask" ${JSON.stringify(e.mask)} beside the ramp's ` +
        `${rampStated.map((f) => `"${f}"`).join(', ')}. They are two answers to one question — what weight each vertex ` +
        'takes — and a key carrying both leaves a reader unable to say which one the output came from. Drop one.', 'CE_DEFORM_ENVELOPE_MASK_RAMP_CONFLICT',
    );
  }
  if (e.mask === undefined && rampStated.length === 0) {
    throw new CompileError(
      `${where}: transform field "envelope" is ${JSON.stringify(envelope)}, which states no weight at all. It is a ramp ` +
        '`{ "axis", "from", "to", "shape" }` or a mask `{ "mask" }`; a key that weighs every vertex 1 carries no envelope.', 'CE_DEFORM_ENVELOPE_WEIGHT_UNSTATED',
    );
  }

  let weights: number[];
  let stated: string;
  let formula: string;
  let reach: string;
  if (e.mask !== undefined) {
    const mask = e.mask;
    if (soft === null) {
      throw new CompileError(
        `${where}: transform field "envelope.mask" is ${JSON.stringify(mask)}, and this attachment has no "soft" block, ` +
          'so the mask names nothing. An envelope\'s mask is the attachment\'s own soft mask (AUTHORING §3.4.6), the ' +
          'one its generator sampled at every vertex when the mesh was built; give the generator a "soft" block, or ' +
          'state a ramp instead.', 'CE_DEFORM_ENVELOPE_SOFT_REQUIRED',
      );
    }
    if (soft.mask !== mask) {
      throw new CompileError(
        `${where}: transform field "envelope.mask" is ${JSON.stringify(mask)}, and this attachment's soft mask is ` +
          `${JSON.stringify(soft.mask)}, so the mask names nothing it was built with. An envelope reads the mask the ` +
          'generator sampled at every vertex, and only that one.', 'CE_DEFORM_ENVELOPE_MASK_MISMATCH',
      );
    }
    if (soft.levels.length !== count) {
      // Unreachable while the sampler walks the same vertex list the mesh
      // emitted, as for a depth map; stated because a silent mismatch would
      // weigh one vertex by another's level.
      throw new CompileError(`${where}: the soft mask "${mask}" has ${soft.levels.length} sampled levels for ${count} vertices`, 'CE_DEFORM_SOFT_SAMPLE_COUNT');
    }
    weights = soft.levels.map((level) => round(level));
    stated = `mask=${mask}`;
    formula = 'w = the soft mask\'s level at the vertex, black 0 and white 1';
    const carried = weights.filter((w) => w > 0).length;
    reach = `The mask "${mask}" weighs ${carried} of ${count} vertices above 0.`;
  } else {
    const axis = pair(e.axis, 'envelope.axis', where);
    const from = num(e.from, 'envelope.from', where);
    const to = num(e.to, 'envelope.to', where);
    const shape = DEFORM_ENVELOPE_SHAPES.find((name) => name === e.shape);
    if (shape === undefined) {
      throw new CompileError(
        `${where}: transform field "envelope.shape" is ${JSON.stringify(e.shape)}; it is one of ` +
          `${DEFORM_ENVELOPE_SHAPES.map((name) => JSON.stringify(name)).join(', ')} — how the weight rises from 0 at ` +
          '"from" to 1 at "to": "linear" is u, "smooth" is u²(3 − 2u)', 'CE_DEFORM_ENVELOPE_SHAPE',
      );
    }
    const length = hypot2(axis[0], axis[1]);
    // The model's own resolution decides "unit", rather than a tolerance chosen
    // here: the diagonal written to seven places, `[0.7071068, 0.7071068]`, is
    // 1.0000000266 long and is the unit direction it says, and a length the
    // 1e-6 grid tells apart from 1 would scale every position the ramp
    // compares with `from` and `to`.
    if (round(length - 1) !== 0) {
      throw new CompileError(
        `${where}: transform field "envelope.axis" is [${axis[0]}, ${axis[1]}], whose length is ${round(length)}; it is a ` +
          'unit direction, length 1 on the model\'s 1e-6 grid. A longer or shorter one would scale every position the ' +
          'ramp compares with "from" and "to" — divide it by its length, and state "from" and "to" along the unit one.', 'CE_DEFORM_ENVELOPE_AXIS_UNIT',
      );
    }
    if (from === to) {
      throw new CompileError(
        `${where}: transform fields "envelope.from" and "envelope.to" are both ${from}; they are where the weight is 0 ` +
          'and where it is 1, so they differ — a ramp of no length is a step, and a step is the edge a model exists not to leave.', 'CE_DEFORM_ENVELOPE_ENDS_EQUAL',
      );
    }
    const span = to - from;
    let lo = Infinity;
    let hi = -Infinity;
    weights = new Array<number>(count);
    for (let v = 0; v < count; v++) {
      const p = axis[0] * setup[2 * v] + axis[1] * setup[2 * v + 1];
      if (p < lo) lo = p;
      if (p > hi) hi = p;
      const u = Math.min(1, Math.max(0, (p - from) / span));
      weights[v] = round(shape === 'linear' ? u : u * u * (3 - 2 * u));
    }
    stated = `axis=[${axis[0]}, ${axis[1]}] from=${from} to=${to} shape=${shape}`;
    formula =
      `w = ${shape === 'linear' ? 'u' : 'u²(3 − 2u)'},   u = clamp((axis · position − from) / (to − from), 0, 1)`;
    reach =
      count === 0
        ? 'The attachment has no vertices.'
        : `Along [${axis[0]}, ${axis[1]}] this attachment's vertices sit at ${round(lo)} to ${round(hi)}, and the ramp ` +
          `rises from ${from} (weight 0) to ${to} (weight 1) — move "from" and "to" onto the part.`;
  }
  checkEnvelopeWeights(weights, e.mask === undefined ? 'envelope.shape' : 'envelope.mask', where);
  return {
    stated,
    formula,
    weights,
    zero: weights.filter((w) => w === 0).length,
    full: weights.filter((w) => w === 1).length,
    reach,
  };
}

/**
 * Refuse a weight outside [0, 1], naming the field that produced it, the vertex
 * and the value (issue #1413, Bar 2).
 *
 * ⚠️ Nothing a spec states can reach this, and that is stated rather than left
 * to be inferred: a ramp clamps `u` to [0, 1] and both shapes map [0, 1] onto
 * itself, and a mask's level is a sample of a greyscale sheet. It stands
 * because the multiplication is the whole of the envelope's effect and a
 * weight of 1.2 would push a vertex past the model — the shape of defect a
 * later shape or a later mask reader would bring in silently. Exported so the
 * selftest can hand it the weight no envelope produces and see it refuse.
 */
export function checkEnvelopeWeights(weights: readonly number[], field: string, where: string): void {
  for (let v = 0; v < weights.length; v++) {
    const w = weights[v];
    if (!(w >= 0 && w <= 1)) {
      throw new CompileError(
        `${where}: transform field "${field}" weighs vertex ${v} at ${w}; an envelope's weight is in [0, 1] — 0 leaves ` +
          'the vertex where it is and 1 moves it the whole way the model says, and nothing past either end is a weight.', 'CE_DEFORM_ENVELOPE_WEIGHT_RANGE',
      );
    }
  }
}

/** One required finite number, refused by field name rather than compiled as a NaN. */
function num(value: unknown, field: string, where: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new CompileError(`${where}: transform field "${field}" is ${JSON.stringify(value)}; it is a finite number the spec has to state`, 'CE_DEFORM_FIELD_NUMBER_FINITE');
  }
  return value;
}

/** One required `[a, b]`. */
function pair(value: unknown, field: string, where: string): [number, number] {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new CompileError(`${where}: transform field "${field}" is ${JSON.stringify(value)}; it is a pair, [x, y]`, 'CE_DEFORM_FIELD_PAIR');
  }
  return [num(value[0], `${field}[0]`, where), num(value[1], `${field}[1]`, where)];
}

/**
 * The two axis fields, as indices into an `x, y` pair.
 *
 * `along === axis` is refused: a displacement of x driven by x is a stretch
 * along one axis, which `affine` states as a scale — and states with a
 * determinant, so it carries the proof that this kind cannot.
 */
function axes(along: unknown, axis: unknown, kind: string, where: string): [0 | 1, 0 | 1] {
  for (const [name, value] of [
    ['along', along],
    ['axis', axis],
  ] as const) {
    if (value !== 'x' && value !== 'y') {
      throw new CompileError(`${where}: transform ${kind} has ${name}=${JSON.stringify(value)}; it is "x" or "y"`, 'CE_DEFORM_COORDINATE_NAME');
    }
  }
  if (along === axis) {
    throw new CompileError(
      `${where}: transform ${kind} reads ${String(along)} and displaces ${String(axis)} — the same coordinate, which is a ` +
        'stretch rather than a bend or a wave. An affine scale states that, and states the determinant that proves it ' +
        'keeps every triangle\'s winding.', 'CE_DEFORM_SAME_READ_DISPLACE_AXIS',
    );
  }
  return [along === 'x' ? 0 : 1, axis === 'x' ? 0 : 1];
}
