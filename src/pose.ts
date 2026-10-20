/**
 * pose — where each loose part sits in one pose frame.
 *
 * ⭐ This is an ENTRY instrument, and the distinction decides every choice below.
 * The user hands over a condition — "here is the pose I want" as a picture — and
 * an agent has to turn it into spec coordinates. Nothing here grades anything:
 * the poses become inputs the spec then states by construction, so no pass bar
 * attaches to any number this file produces. The residual exists so the agent
 * knows **how much to trust** a placement and **where two answers are equally
 * good**, which is a different job from scoring and needs the opposite defaults.
 *
 * What that means in practice: a refusal names the part and the reason and still
 * prints the best it found, an ambiguity reports BOTH optima rather than picking,
 * and a part whose rotation genuinely does not matter is reported as having a free
 * degree of freedom instead of a bad one.
 *
 * 🔍 The estimator. For every part PNG it searches the rigid family
 * (translation, one rotation, one uniform scale) for the placement whose pixels
 * best explain the frame's pixels **inside the part's own alpha footprint**. The
 * objective is an alpha-weighted mean absolute colour error in 0..1:
 *
 *   err(part pixel) = material · |partRGB − frameRGB| / 255   +   (1 − material)
 *
 * where `material` is how much of the frame is *not* background there — so a part
 * pixel hanging over the background, or off the canvas entirely, costs the maximum
 * 1 rather than whatever colour distance the background happens to give.
 * Normalising by the part's own alpha weight is what makes residuals comparable
 * between a thumb and a torso.
 *
 * ⚠️ Measuring on the part's own footprint is also the only occlusion robustness
 * here, and it is deliberately not a solver. A part drawn *behind* another in the
 * frame has the occluder's pixels where its own should be, so its residual rises
 * even at the correct placement. `unexplained` separates the two readings: a low
 * residual is a confident placement, a middling residual with a high `unexplained`
 * is usually a correct placement seen through something else. Weigh accordingly;
 * do not read either as a verdict.
 *
 * Coordinates are the frame's own: **frame pixels, y down, origin top-left**, the
 * same convention a cut manifest uses. `rotationDeg` is screen degrees — positive
 * turns clockwise on screen — so `screenToSpineDegrees` in `src/transform.ts` is
 * the one conversion to Spine's y-up CCW world, and `cropToSpineY` the other.
 *
 * ⭐ **This file owns the objective, and `src/chainfit.ts` borrows it rather than
 * holding a second opinion about it.** The pixel machinery below — the background
 * read, the material plate, the alpha-weighted halving, the sample sets and the
 * two error functions — is exported for exactly one caller, whose whole claim is
 * that it is *this* estimator with the occluders taken out of the denominator. Two
 * implementations of "how well does this part explain these pixels" would make the
 * two instruments' residuals incomparable, which is the one thing a caller reading
 * both of them needs them not to be. What `chainfit` does NOT borrow is the search:
 * it has the candidate rig, so it searches one degree of freedom where this file
 * searches four.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { Plate, readPlate } from '../tools/plate.ts';
import { hypot2 } from './numeric.ts';
// The rasteriser's sampler rather than a second one written here: how a pixel is
// read between two pixel centres is exactly the kind of thing two
// implementations drift on.
//
// ⭐ `bilinear` — the PREMULTIPLIED tap — and the fourth channel is what makes
// that read oddly at first. `materialPlate` hands this file the frame's own RGB
// with alpha rewritten to mean "how much material is here", so the weighting is
// not a colour-space correction here: a texel with no material has no material
// COLOUR either — it carries the background's — so it must get a vote in the
// coverage and none in the colour. That is exactly what premultiplying by the
// fourth channel does, and interpolating the colours channel by channel is what
// mixed the ground into the material along every silhouette (issue #306, the
// same defect class as #292 in the instrument that prices placements).
//
// Both tap paths in this file are colour-against-colour, and neither reads a
// mask as if it were a colour:
//   • the search and `measure` sample the MATERIAL PLATE — mask fourth channel,
//     the frame's own RGB;
//   • `rotationSelfSimilarity` samples the PART plate itself, whose fourth
//     channel is the art's own straight alpha — the #292 case verbatim.
// `bilinear` computes its fourth channel with the unchanged `lerpTap`, so the
// coverage term `errBilinear` gates on is bit-identical to what the
// channel-independent tap returned; only the colour moves, and only where a tap
// straddles an edge. #301 deliberately left this call on the old arithmetic to
// hold the fitting numbers still while the from-zero run 2 was in flight; #306
// moved it, with the re-baseline of every figure that quoted a residual.
import { bilinear } from './render_shared.ts';

export class PoseError extends Error {}

/** The `spec` field every report carries, so a consumer can refuse a future shape. */
export const POSE_SPEC = 'rigc-pose/1';

// ---------------------------------------------------------------------------
// the constants the search is made of — every one of them is reported
// ---------------------------------------------------------------------------
//
// They are exported because a number that steers a refusal has to be quotable:
// the docs cite them, the selftest states its tolerances against them, and the
// report repeats the ones a caller can move.

/**
 * Longest side, in pixels, the coarse scan would like to reduce the FRAME to.
 *
 * A ceiling on the pyramid, not the level the scan runs at — `COARSE_PART_SPAN`
 * can overrule it downward, because a level that has reduced the part to three
 * pixels tells nobody anything about where the part is.
 */
export const COARSE_LONG_SIDE = 40;

/**
 * Pixels the PART must still span at the level the coarse scan runs at.
 *
 * ⚠️ The other half of choosing that level, and the half a frame-only rule gets
 * wrong. Measured: on a 1600x1200 frame the frame rule alone picks a 64x
 * reduction, at which a 120x180 part is 2x3 pixels sampled six times — no signal
 * at all, and eight such parts came back with the wrong scale and a position out
 * by seventeen pixels. The coarse level is therefore the coarser of "the frame
 * fits in COARSE_LONG_SIDE" and "the part still spans this much".
 */
export const COARSE_PART_SPAN = 10;

/**
 * Pixels the part's SHORT side must still span at the coarse level — the same
 * argument as `COARSE_PART_SPAN`, applied to the axis that rule does not read.
 *
 * ⚠️ Found by the change that tightened the coarse grid (issue #865), not by the
 * floor grid, whose parts are none of them thin enough to reach it. MOTION.md
 * §6's 60x14 signal arm is 3.5 px thick at the 4x level its length chose; on the
 * quarter-span grid an anchor cell happened to sit where refinement found its
 * truth (residual 0.0305), and on the eighth-span grid none did, so pose B
 * reported a placement 15 px down the arm at 0.1482. A part three pixels thick
 * at the coarse level has no across-the-part signal for any grid to read. 4, 5
 * and 6 were each measured to move that arm up one level and place it; 4 is the
 * least, and at 4 no trial of the floor grid moves at all.
 */
const COARSE_PART_THICKNESS = 4;

/**
 * Coarse anchor positions are stepped at a fraction of the part's own size.
 *
 * Scanning every pixel of the coarse level would make the scan's cost grow with
 * the frame's area instead of with the number of places the part could plausibly
 * be, so the anchors are strided. How far apart is the part's own business.
 *
 * ⚠️ An eighth, not the quarter it was, and the reason is measured rather than
 * assumed (issue #865). "The objective varies over distances of order the part"
 * is true of a solid part and false of a thin or holey one: a gun whose material
 * is a third of its box, or a fist with gaps between the fingers, loses most of
 * its fit a quarter-span off its truth. On `tools/pose_floor.ts`'s grid, 65
 * failed trials had a truth that scored better than the answer reported and was
 * missing from the final list; in 38 of them the truth, evaluated exactly at the
 * coarse level, beat every cell of its scale rung, and the anchor CELL holding it
 * did not — the basin fell between two anchors. A cutoff on how many minima
 * survive (3 of the 65) was not what lost them. At an eighth the grid found
 * 226 of 420 trials against 185 (with `MINIMA_PER_SCALE` still at three), and
 * the search misses fell from 65 to 15, for 10–14% more CPU over the grid.
 *
 * 🔸 Not free of losses, and they are stated rather than averaged away: 9 trials
 * that placed on the quarter grid did not on this one when it shipped. Five are
 * blurred parts at 24–96 px that came back ambiguous between two scales at the
 * same spot, or 2.0 px off against a 2 px bar — the objective's, not this
 * grid's. The other four were the refinement's, and since issue #877 all four
 * place at their truth again: the native 48 px arm (walk) at 0.07 px, 48 px
 * goggles (walk) 0.04, 96 px goggles (setup) 0.03 — three polishes stopped in a
 * scale–position valley, now left by `POLISH_SCALE_ESCAPE` — and the 24 px shin
 * (setup) 0.03, ranked 15th into full resolution, now carried by
 * `REFINE_CANDIDATES`. Of the five blurred ones, the blur2 32 px shin (setup)
 * and the blur1 24 px mouth are found again too.
 *
 * ⚠️ #877 lost two of its own, both inside the ambiguity margin rather than
 * off the truth: the blur2 24 px front shin (walk) now reports the truth as its
 * BEST (0.03 px, 0.00989) with the old 0.57 px answer 0.0094 above it, and the
 * blur1 64 px mouth (walk) keeps its best at 0.93 px and gains a second scale
 * at the same spot 0.0031 above it. Each is two readings of one place the
 * 0.01 absolute margin will not pick between — the verdict it exists to give.
 */
export const COARSE_STRIDE_FRACTION = 0.125;

/**
 * Grid cells around a coarse cell that must not beat it for it to be a minimum,
 * and the spacing kept between the minima one scale rung sends down.
 *
 * Four at an eighth-span stride is, nominally, the half-span the old two cells
 * at a quarter held (the stride is rounded to whole level pixels, so only
 * nominally). Measured on the grid: leaving it at two when the stride halved let one
 * wrong hill fill a rung's `MINIMA_PER_SCALE` with its own neighbours — 223
 * trials found rather than 226, and 12 that placed on the old grid lost rather
 * than 9 (both at three minima per rung).
 */
export const COARSE_SUPPRESSION_CELLS = 4;

/** How many scale rungs one octave gets in the coarse ladder. */
export const SCALE_STEPS_PER_OCTAVE = 3;

/**
 * The COARSEST step, in degrees, the rotation ladder is allowed to take.
 *
 * ⚠️ A ceiling on the step rather than the step itself, and the distinction is
 * the whole of issue #719. Read as "the step", a window narrower than it prints
 * a resolution the search never had: `--rotation -5,5` reported `step 15°` over
 * a ten-degree window. The ladder therefore divides the window into whole steps
 * no coarser than this — the same shape `scaleLadder` has always had for
 * octaves — and the report states the step that division produced.
 */
export const COARSE_ROTATION_STEP = 15;

/** Default scale window, as frame pixels per part pixel. */
export const DEFAULT_SCALE_MIN = 0.5;
export const DEFAULT_SCALE_MAX = 2;

/**
 * Above this residual the placement is refused by name rather than reported flat.
 *
 * ⚠️ Not a pass bar. It is where "this part is somewhere in this picture" stops
 * being a claim worth making — a foreign part scores far above it and a real one
 * far below, and the report carries the number either way so a caller who
 * disagrees can read past the refusal.
 */
export const DEFAULT_MAX_RESIDUAL = 0.25;

/** Two optima this close are reported as both, never as one. Absolute, then relative to the best. */
export const AMBIGUITY_ABSOLUTE = 0.01;
export const AMBIGUITY_RELATIVE = 0.2;

/**
 * Max self-residual under rotation, relative to the identity, for a part to be
 * called rotation-free.
 *
 * The gap it sits in is wide, which is why one number can hold it: on the
 * selftest's own art a smooth 32px ball reads 0.014 and the least distinctive
 * non-round part in the set — a two-tone head — reads 0.307. Anything with a
 * corner, a silhouette or an off-centre feature is an order of magnitude clear
 * of this line.
 */
export const ROTATION_FREE_TOLERANCE = 0.04;

/** Per-pixel error above which a pixel counts toward `unexplained`. */
export const UNEXPLAINED_TOLERANCE = 0.15;

/** Mean absolute channel distance, 0..255, within which a frame pixel counts as background. */
export const BACKGROUND_TOLERANCE = 10;

/** Share of the frame's border ring one colour must hold before it is called the background. */
export const BACKGROUND_BORDER_SHARE = 0.6;

/**
 * How many distinct places each coarse scale rung sends down for refinement.
 *
 * ⚠️ Five rather than three, and read off the grid rather than off a probe
 * (issue #865). The card's own probe raised this to ten and recovered the fist it
 * was chasing; on the full grid that bought 2 trials net (3 gained, 1 lost),
 * because only 3 of the 65 trials the search missed had their truth's basin
 * ranked under the cutoff — the rest had fallen between anchor cells, which is
 * `COARSE_STRIDE_FRACTION`'s job. With the stride fixed, one miss of that kind was
 * left (a 48 px fist, its basin fifth on its rung), and five is the count that
 * carries it: 227 trials found against 226 at three, none lost, and a CPU cost
 * inside the grid's run-to-run noise.
 */
export const MINIMA_PER_SCALE = 5;

/**
 * The three numbers that decide which basins the coarse pass sends down —
 * `COARSE_STRIDE_FRACTION`, `COARSE_SUPPRESSION_CELLS`, `MINIMA_PER_SCALE` — as
 * one value, so a control can run the search on the grid an earlier release
 * used and show what the current one buys (issue #1519). See
 * `PoseOptions.coarseGrid`.
 */
export interface PoseCoarseGrid {
  strideFraction: number;
  suppressionCells: number;
  minimaPerScale: number;
}

/** The grid every caller gets — the three constants above, unchanged. */
export const COARSE_GRID: PoseCoarseGrid = {
  strideFraction: COARSE_STRIDE_FRACTION,
  suppressionCells: COARSE_SUPPRESSION_CELLS,
  minimaPerScale: MINIMA_PER_SCALE,
};

/**
 * How many candidates survive each refinement level.
 *
 * ⚠️ Fifteen rather than twelve, and it is the smallest count the grid named
 * (issue #877). Of the 14 trials the search missed after #865, one was lost by
 * this cutoff rather than by any polish: the native 24 px front shin, whose
 * truth's candidate ranked 15th (index 14) of 28 at the 2x level — that part's
 * coarse level — and was cut on the way into full resolution, where the truth
 * scores 0.0199 against the 0.1188 reported. Fifteen is the least count that
 * carries index 14; sixteen alone was measured to place it at 0.03 px and move
 * no other trial (228 found, none lost). A band of the level's best was the
 * alternative, and it was rejected on its number: to carry that candidate it
 * would have had to reach 1.73x the best, and a band that wide carried up to 27
 * candidates (14 of 108 sampled refinement levels over twelve) — a cost set by
 * one trial and paid on all of them.
 */
const REFINE_CANDIDATES = 15;

/**
 * The factors a converged full-resolution polish tries its scale up by before it
 * stops — half a coarse scale rung, the resolution the coarse ladder itself had,
 * and a quarter of one (issue #886); the better of the two re-fits wins.
 *
 * 🔍 What the pattern search cannot do, and the trace table of issue #877 is
 * how it was seen: every probe moves ONE degree of freedom, and the objective
 * couples scale to position along a diagonal valley — a part shrunk a little
 * fits best a pixel or two off its truth, so from there every single-axis probe
 * is worse and every joint move is better. In 12 of the 14 missed trials the
 * truth's candidate reached full resolution ranked first or second, the
 * full-resolution objective preferred the truth to everything kept, and the
 * polish stopped 2–7 px off it at a scale of 0.64–0.96. Not one polish ever
 * accepted a worse residual — a polish moves only on a strictly lower probe of
 * its own level's objective, and `PO26` holds that — so the rise from one level
 * to the next is a change of objective, never a step taken uphill.
 *
 * ⭐ So the escape re-fits position at the new scale before comparing — the
 * joint move, taken one axis at a time — and a better point restarts the polish
 * there. UP only, and that is derived rather than tuned: the objective charges a
 * part pixel that lands off the figure and charges nothing for figure left
 * uncovered, so a shrunk placement is the cheap error the reduced levels make —
 * every stuck point in the table sat below scale 1, none above.
 *
 * 📏 Measured on the grid with `REFINE_CANDIDATES` at fifteen: 227 → 237 trials
 * found, 12 gained, 2 lost, search misses 14 → 8, for 43% more refinement
 * samples (the coarse pass is untouched). Both ways at twelve found 236 (12
 * gained, 3 lost) for 38% more against up only's 21%; a second step each way,
 * 237 (15, 5) for 76%. ⚠️ The two it loses are one shape, a scale twin at the
 * same spot: the blurred 64 px mouth (walk) keeps its best at 0.9 px and now
 * reports a second placement 1.8 px off at scale 0.825 within the ambiguity
 * margin, and the blurred 24 px front shin (walk) now places AT its truth
 * (0.03 px, 0.00989) where it placed 0.57 px off at 0.0191 — the old answer is
 * still reported beside it, 0.0094 above, inside the 0.01 absolute margin.
 *
 * 🔍 The quarter rung is issue #886, and the fixed-scale profile is what
 * named it. MOTION.md §6's post (14x96, pose A, `--scale 0.85,1.2`) came back
 * at scale 0.917 and residual 0.0649 where the page had recorded 0.975 at
 * 0.0589 — the old placement still scores 0.0589 on this objective, so the
 * search missed it. The trace: the coarse cell nearest the truth (2.4 px off
 * it, at the 2x level) kept a half-turned post, its polish ended 6.7 px from
 * the truth, the full-resolution rotation re-grid set it upright there, and
 * the polish climbed the scale–position valley to 0.917.
 * The half-rung escape then tried 1.029: best position there 0.0980, worse
 * than 0.0649, so it declined — while the best position at every scale
 * between 0.94 and 1.00 scores 0.0619–0.0589. A part whose material fills its
 * image pays for every pixel pushed past the figure, so its profile above the
 * truth is a cliff, and half a rung stepped over the basin onto it. A quarter
 * rung lands at 0.971 (0.0593, 0.1 px off the page's placement).
 *
 * 📏 Both, not the quarter alone, and measured on the grid rather than argued:
 * the quarter alone found 234 (3 gained, 6 lost — the native arms #877 was
 * made for need the half); half then quarter, the quarter tried only when the
 * half declines, 237 (1, 1); both, the better kept, 238 (2 gained, 1 lost) and
 * misses 8 → 6, for 16% more user CPU over the grid. The one it loses is a
 * margin reading of the kind named above: the blurred 32 px front shin (walk)
 * now reports its truth as its BEST (0.07 px, 0.00968) with the old 0.51 px
 * answer 0.0045 above it, inside the 0.01 absolute margin.
 */
const POLISH_SCALE_ESCAPES = [2 ** (1 / (4 * SCALE_STEPS_PER_OCTAVE)), 2 ** (1 / (2 * SCALE_STEPS_PER_OCTAVE))];

/** Sample budgets per stage. The reported residual uses every pixel regardless. */
const COARSE_SAMPLES = 96;
const REFINE_SAMPLES = 384;
const POLISH_SAMPLES = 2048;

/** Alternates beyond this many are not printed; the count is still stated. */
const MAX_ALTERNATES = 3;

const DEG = Math.PI / 180;

/**
 * The detail below which `pose` has been MEASURED to almost never place a part
 * — the floor a refusal or an ambiguity is read against (issue #857).
 *
 * 📏 Measured, not chosen: `tools/pose_floor.ts` builds the grid and derives
 * `detail` (`deriveFloor`: the largest rung of a fixed ladder under which at
 * most a tenth of the grid's trials were found), and `docs/AUTHORING.md` §11.5
 * carries the grid, the method and what it rejected. A part is BELOW the floor
 * when its `detail` is under `detail`, or its longest side, in its own pixels,
 * under `span` — the grid cut its parts at scale 1, so its sizes are both.
 *
 * ⚠️ Two things this is not. It is not a size found to matter: `span` is the
 * smallest size the grid measured, and over 24–192 px no texture level placed
 * measurably better when larger — a part under it is below the floor because
 * nothing was measured there, not because it was measured to fail. And it is
 * not a line above which `pose` is reliable: over it, on IDEAL cuts (parts cut
 * from the frame's own render, residual at the truth near zero), `rateAbove`
 * of the trials were found. A generated cut also disagrees with its picture,
 * which can only make that lower. So "above the floor" means "plainness does
 * not explain this refusal", which is the question the issue asked, and never
 * "this part will place".
 */
export const POSE_FLOOR = {
  material: 'examples/spineboy, cut from its own render (tools/pose_floor.ts)',
  withinPx: 2,
  span: 24,
  detail: 0.5,
  /** Found share of the grid's trials under `detail`, and over it — both measured by `deriveFloor`. */
  rateBelow: 0.066,
  rateAbove: 0.772,
};

/** Which side of `POSE_FLOOR` a part is on, from its own longest side in part pixels and its detail. */
export function floorSide(side: number, detail: number): 'below' | 'above' {
  return side >= POSE_FLOOR.span && detail >= POSE_FLOOR.detail ? 'above' : 'below';
}

/** The floor as one clause, for the sentences that cite it. */
export function floorClause(): string {
  return `detail ${POSE_FLOOR.detail}, measured from ${POSE_FLOOR.span} px up`;
}

/**
 * When an ambiguity is ONE part fitting several places at one size — the
 * reading a left/right pair cut from one drawing gives, which no window
 * resolves (issue #1519).
 *
 * Both bars are read off the measured gap between the two populations, and
 * each sits at that gap's geometric middle — the same rule for both, so neither
 * is a number chosen to make one case come out:
 *
 * - **Scale**, as `|alternate / best − 1|` and over EVERY alternate inside the
 *   margin. Same-size repeats measured 0.00001–0.00034 (a pair of legs and a pair
 *   of ears in a picture rendered from a rig), 0.0030 (the selftest's twin
 *   fixture, PO34) and 0.0055 (the pose fixture's mirrored arms, PO02). Every
 *   other ambiguous part above the floor on `tools/pose_floor.ts`'s 420 trials
 *   had an alternate at least 0.0719 off its best's scale — two scales at one
 *   spot — and so did a pair of eyes read at 1.000 and 0.922. √(0.0055 × 0.0719)
 *   ≈ 0.020.
 * - **Distance**, from the best's centre to the nearest alternate's, over the
 *   part's span at the best's scale. On that grid every other alternate above
 *   the floor sat within 0.336 span of its best — two readings of one spot — or
 *   2.26 spans or more away at a scale more than 20% off, which the scale bar
 *   already separates; the closest repeat measured was the legs at 0.603.
 *   √(0.336 × 0.603) ≈ 0.45.
 *
 * ⚠️ One grid trial above the floor takes this branch and is not a repeat: a
 * blurred 48 px shin whose four placements all stopped on the scale FLOOR of the
 * default window, at 0.5 against a truth at 1.0. Every placement on one wall has
 * one scale by construction. Its console line marks the wall beside the value,
 * which is the first thing to move; nothing in the alternates alone separates it
 * from a repeat — a pair of ears in the same picture also sat on a scale floor.
 */
export const REPEAT_SCALE_RATIO = 0.02;
export const REPEAT_DISTANCE_SPANS = 0.45;

/** How an ambiguity's placements stand to the best one, when they are one part in several places at one size. */
export interface PoseRepeat {
  /** The largest `|alternate.scale / best.scale − 1|` inside the margin. */
  scaleRatio: number;
  /** The nearest alternate's centre distance from the best's, in spans at the best's scale. */
  spans: number;
}

/**
 * Whether every alternate inside the margin is a DIFFERENT place at the SAME
 * scale as the best, against `REPEAT_SCALE_RATIO` and `REPEAT_DISTANCE_SPANS`
 * — `null` when any one is not, or there is none. `span` is the part's longest
 * material side in frame pixels at the best placement's scale.
 *
 * ⭐ Exported so the selftest can hand it a forged alternate and watch the
 * reading change branch; the search calls it with exactly what it reported.
 */
export function repeatedPlaces(best: PosePlacement, alternates: readonly PosePlacement[], span: number): PoseRepeat | null {
  if (alternates.length === 0 || !(span > 0)) return null;
  const scaleRatio = Math.max(...alternates.map((a) => Math.abs(a.scale / best.scale - 1)));
  const spans = Math.min(...alternates.map((a) => hypot2(a.x - best.x, a.y - best.y) / span));
  return scaleRatio <= REPEAT_SCALE_RATIO && spans >= REPEAT_DISTANCE_SPANS ? { scaleRatio, spans } : null;
}

/**
 * The sentence that tells "the part is wrong" from "the part is too small or too
 * plain for `pose`", with every figure it rests on (issue #857).
 *
 * ⭐ Exported for the reason `windowEdgeNote` is: the guide quotes it, and a
 * message and the document teaching it must be built from one place.
 */
export function legibilityReading(
  l: Omit<PoseLegibility, 'reading'>,
  verdict: 'refused' | 'ambiguous',
  repeat: PoseRepeat | null = null,
): string {
  const figures =
    `part is ${l.width}x${l.height} px (span ${l.span} frame px, opaque ${l.opaqueShare}) with texture ${l.texture}, ` +
    `detail ${l.detail}; ` +
    `${l.candidates} candidate(s), best ${l.best.toFixed(4)}` +
    (l.next === null || l.spread === null ? '' : `, next ${l.next.toFixed(4)}, spread ${l.spread.toFixed(4)}`);
  if (l.floor === 'below') {
    const why =
      Math.max(l.width, l.height) < POSE_FLOOR.span
        ? `smaller than the smallest size the floor was measured at, so nothing measured says pose can ` +
          `${verdict === 'refused' ? 'place' : 'separate'} it`
        : `pose placed ${Math.round(POSE_FLOOR.rateBelow * 100)}% of the measured parts this plain, so this part is too ` +
          `plain for pose to ${verdict === 'refused' ? 'place' : 'tell its placements apart'}`;
    return (
      `${figures} — below the measured floor (AUTHORING §11.5: ${floorClause()}): ${why}; that says nothing about ` +
      'whether the cut is right'
    );
  }
  // ⚠️ "Above the floor" is not "the search found the right hill". Measured on
  // the floor's own material, a part above it came back ambiguous between two
  // equally WRONG placements (residual 0.148 each, 173 px off) while the truth
  // scored 0.035 — a basin the coarse pass never sent down. Issue #865 fixed
  // that one (the coarse grid had stepped over it), and the reading still
  // occurs: on the grid after it, 10 ambiguous trials above the floor had a
  // truth scoring better than both answers — native 24 px gun and shin, 48 px
  // arm, 96 px goggles twice, and blurred gun, goggles and rear shin from 48 px
  // up. Nine of the ten sat 2–6 px from the truth rather than on another hill.
  // Issue #877's polish took that to 6 — native 24 px gun, 96 px goggles, and
  // blurred goggles and gun from 128 px and rear shin at 48 px — five of them
  // 2.1–2.7 px off, the rear shin 19 px. So the sentence names that reading
  // too, with the one remedy that separates it: a window.
  //
  // 🔀 Except when the placements are one size in different places (issue
  // #1519). Measured on a picture holding a left/right pair cut from one
  // drawing: no --scale window separated them, narrower or wider, because they
  // ARE one scale, and every --rotation window that "resolved" them did so by
  // excluding one place — after which both files placed on the other, one of
  // them 69 px off its truth and printed clean. There the window does not tell
  // the two readings apart, it picks one, so the sentence names the route that
  // does work instead.
  const ambiguity =
    repeat === null
      ? 'either the frame holds more than one place this part fits, or every candidate missed the true one — ' +
        'a narrower --scale or --rotation window around what you know of the part tells the two apart'
      : `every placement in the margin is at the best's scale (within ${(repeat.scaleRatio * 100).toFixed(2)}%, ` +
        `bar ${REPEAT_SCALE_RATIO * 100}%) and in another place (the nearest ${repeat.spans.toFixed(2)} span(s) away, ` +
        `bar ${REPEAT_DISTANCE_SPANS}), which is the part — or a near-copy, such as a left/right pair cut from one ` +
        'drawing — drawn more than once: read the placements as an unordered set and order it across frames ' +
        '(MOTION.md §2.2 🔀); a --rotation window that excludes one place chooses the answer rather than measuring it';
  return (
    `${figures} — above the measured floor (AUTHORING §11.5: ${floorClause()}), so size and texture do not explain this; ` +
    (verdict === 'refused' ? 'the cut (or the search window) is the suspect' : ambiguity)
  );
}

// ---------------------------------------------------------------------------
// the report
// ---------------------------------------------------------------------------

export interface PoseBackground {
  kind: 'transparent' | 'colour' | 'unknown';
  /** The background colour, when there is one. */
  colour: [number, number, number] | null;
  /** Share of the one-pixel border ring that agreed with the verdict, 0..1. */
  borderShare: number;
  /** Share of the frame that counts as material, 0..1. */
  materialShare: number;
}

/** One rigid placement of one part, in frame pixels, y down, origin top-left. */
export interface PosePlacement {
  /** Where the part image's own centre — `(width/2, height/2)` — lands. */
  x: number;
  y: number;
  /** Screen degrees: positive turns clockwise on screen. `screenToSpineDegrees` converts. */
  rotationDeg: number;
  /** Uniform, as frame pixels per part pixel. */
  scale: number;
  /** Alpha-weighted mean absolute error over the part's own footprint, 0..1. Lower is better explained. */
  residual: number;
  /** Share of the part's alpha weight whose per-pixel error clears `UNEXPLAINED_TOLERANCE`. Occlusion shows up here. */
  unexplained: number;
  /** Share of the part's alpha weight that lands outside the frame canvas. */
  offCanvas: number;
  /** Frame pixels of material this placement accounts for — the tie-break between equal residuals. */
  footprint: number;
  /** Axis-aligned box the placed part's material occupies, frame pixels. */
  bbox: { x: number; y: number; width: number; height: number };
}

export type PoseRefusalReason = 'empty-part' | 'larger-than-canvas' | 'no-match';

export interface PoseRefusal {
  reason: PoseRefusalReason;
  detail: string;
}

/**
 * One wall of the search window a reported placement stands ON.
 *
 * ⭐ A fact about the search, not about the picture: the refinement is clamped
 * to the window, so a value held by a wall is the bound itself — which is what
 * lets "on" be told from "near". A placement that settled inside stops short of
 * the wall by at least the polish's last step; one that was held by it sits on
 * it exactly (issue #737).
 */
export interface PoseWall {
  axis: 'scale' | 'rotation';
  edge: 'floor' | 'ceiling';
  /** The window as its flag spells it, `min,max` — `--scale 0.5,2`'s is `"0.5,2"`. */
  window: string;
}

export interface PosePart {
  /** The PNG's file name — how the report names the part everywhere. */
  part: string;
  path: string;
  width: number;
  height: number;
  /**
   * The walls of the search window `placement` stands on — empty when it settled
   * inside the window, and always empty when there is no placement.
   *
   * 🔒 Set whatever the verdict, and read by one function (`placementWalls`) for
   * both: a `no-match` quotes these in its `refusal.detail`, an accepted part
   * carries them on its console line. Until issue #737 only the refusal said so,
   * and an accepted `scale=2.000` under `--scale 0.5,2` over a part whose truth
   * was 2.30 carried no mark at all.
   *
   * ⚠️ A wall here is not a claim about which side the truth is on. Measured over
   * the rendered corpus, a floor holds two kinds of answer — a truth below the
   * window, and a part shrunk into the region it came from while its truth sits
   * inside the window — and nothing in one frame separates them. What is certain
   * is that the value is where the search was held, not where it came to rest.
   */
  walls: PoseWall[];
  /**
   * Why this part's answer should not be taken at face value, or `null`.
   *
   * ⚠️ `placement` is still filled in under a `no-match` refusal, on purpose: a
   * refusal here names why you should not trust a number, it does not hide it.
   * `empty-part` and `larger-than-canvas` leave it `null` because nothing was
   * searched.
   */
  refusal: PoseRefusal | null;
  placement: PosePlacement | null;
  /** Other optima worth reporting, best first. Non-empty means the answer was not unique. */
  alternates: PosePlacement[];
  /** True when at least one alternate sits inside the ambiguity margin. */
  ambiguous: boolean;
  /** True when the part is self-similar under rotation, so `rotationDeg` is yours to choose. */
  rotationFree: boolean;
  /**
   * Worst residual the part scores against itself over eleven rotations, 0..1.
   *
   * The number `rotationFree` is a threshold on — reported because "how round is
   * this part" is a spectrum, and a part just over the line is worth knowing about.
   */
  rotationSelfSimilarity: number;
  /**
   * The grid this part was actually looked for on: the frame reduction the
   * exhaustive pass ran at, its anchor grid, and the step between anchors in
   * those reduced pixels. A coarse grid of a handful of cells is a warning that
   * the part is small relative to the frame and the first pass had little to go on.
   */
  coarse: { reduction: number; cols: number; rows: number; stride: number } | null;
  /**
   * What the part itself gave the search to work with, and how the search's
   * answers stood against each other — `null` only when nothing was searched
   * (`empty-part`, `larger-than-canvas`). See `PoseLegibility`.
   */
  legibility: PoseLegibility | null;
  /** Plain-language versions of everything above, in the order they were found. */
  notes: string[];
}

/**
 * The facts that tell "this part is wrong" from "this part is too small or too
 * plain for `pose`" (issue #857).
 *
 * ⭐ Both readings end in the same refusal or the same ambiguity, and nothing in
 * a residual separates them: a correct cut of a plain sleeve and a foreign part
 * can print the same number. What separates them is the part's own evidence —
 * how big it is in the frame and how much pattern it carries — held against a
 * floor measured on parts whose placement was known (`POSE_FLOOR`). So every
 * searched part carries these, whatever its verdict, and a refusal or an
 * ambiguity quotes them in a sentence that says which of the two it is.
 */
export interface PoseLegibility {
  /** The part's material box, part pixels — the PNG less its transparent margin. */
  width: number;
  height: number;
  /**
   * Longest side of the material box at the best placement's scale, frame pixels.
   * ⚠️ Not what `floor` is read from — the part's own `width`/`height` are, since
   * this one moves with a placement that may be wrong.
   */
  span: number;
  /** The part's alpha weight over its material box's area, 0..1. A thin diagonal limb reads low; a filled block reads 1. */
  opaqueShare: number;
  /** Mean colour step between neighbouring material pixels, 0..1 — see `partTexture`. */
  texture: number;
  /**
   * `texture` times the material box's longest side in PART pixels: the colour
   * change a walk along the part's length accumulates. The figure the floor is
   * stated in — see `POSE_FLOOR` for why it and not `texture` alone.
   */
  detail: number;
  /** Distinct placements the search measured at full resolution, the best included. */
  candidates: number;
  /** The best placement's residual, and the second distinct one's — `null` when there was no second. */
  best: number;
  next: number | null;
  /** `next − best`: how far the search's second answer was from its first. `null` with no second. */
  spread: number | null;
  /**
   * Where the part stands against `POSE_FLOOR` — `below` when its span or its
   * detail is under the floor's. A reading of the part, not of the answer: it is set on accepted
   * parts too, and it is what a refusal's sentence is chosen by.
   */
  floor: 'below' | 'above';
  /**
   * The sentence a refused or ambiguous part carries, saying which of the two
   * readings its figures support — `null` on a part that was placed. Built by
   * `legibilityReading`, and the console prints the same text.
   */
  reading: string | null;
}

export interface PoseSearch {
  scale: { min: number; max: number; steps: number };
  /**
   * The rotation window, and the ladder it produced.
   *
   * 🔒 `stepDeg` is read off `degrees` rather than off `COARSE_ROTATION_STEP`,
   * and `degrees` is the array the coarse pass iterated — so the two cannot say
   * different things about the same run (issue #719). `steps` is how many angles
   * that is, which is `degrees.length`.
   */
  rotation: { minDeg: number; maxDeg: number; stepDeg: number; steps: number; degrees: number[] };
  /**
   * How the exhaustive first pass was sized. The level it runs at is chosen PER
   * PART — see `PosePart.coarse` — because it depends on how big the part is.
   */
  coarse: { frameLongSide: number; partSpan: number; strideFraction: number; framePyramid: number };
  maxResidual: number;
  ambiguity: { absolute: number; relative: number };
}

export interface PoseReport {
  spec: string;
  /** The coordinate contract, spelled out in the file rather than assumed. */
  space: string;
  images: string;
  frame: { path: string; width: number; height: number; background: PoseBackground };
  search: PoseSearch;
  /** What the numbers above cannot see. Read before consuming them. */
  caveats: string[];
  parts: PosePart[];
}

export interface PoseOptions {
  /** Directory of loose part PNGs. */
  imagesDir: string;
  /** One pose frame. */
  framePath: string;
  /**
   * The parts to place, when the caller already knows which they are. Default:
   * every `.png` in `imagesDir`, in name order — which is what the CLI does.
   *
   * ⭐ The one thing `src/chainfit.ts` needs from this signature. It holds a
   * candidate rig, so it knows exactly which images are parts and which of the
   * directory's PNGs the figure never draws, and searching the rest would spend
   * the pass and add refusals to read past. A directory is still the CLI's
   * contract — this narrows it, it does not replace it.
   */
  parts?: string[];
  scale?: { min: number; max: number };
  rotation?: { minDeg: number; maxDeg: number };
  maxResidual?: number;
  /**
   * An instrument's sink, never read by the search itself: when present, every
   * level of every part's refinement is appended to it. See `PoseTrace`.
   */
  trace?: PoseTrace;
  /**
   * The coarse grid to search on — default `COARSE_GRID`, which is what the CLI
   * always uses and has no flag to change.
   *
   * ⚠️ A plant, not a tuning knob. It exists so the selftest can run the search
   * on the quarter-span grid releases before 1.4.0 used and watch a control go
   * red there: two near-identical parts 0.6 of a span apart came back as ONE
   * placement on that grid, printed `PLACE` with no alternate (issue #1519). A
   * control nobody has seen fail holds nothing, and the only honest way to see
   * this one fail is to search on the grid that failed. The report states the
   * stride fraction in force in `search.coarse.strideFraction`.
   */
  coarseGrid?: PoseCoarseGrid;
}

/** A search candidate as the trace states it: where the part image's centre would land, frame pixels. */
export interface PoseTraceCandidate {
  x: number;
  y: number;
  rotationDeg: number;
  scale: number;
  /** The level's own sampled objective — not the reported, every-pixel residual. */
  residual: number;
}

/** One accepted move of a polish: the residual it moved to and the steps it moved with. */
export interface PoseTraceStep {
  residual: number;
  translate: number;
  rotate: number;
  scale: number;
  /** The accepted probe's scale or rotation was held by its window rather than taken as stepped. */
  clamped: boolean;
  /** A restart from a converged point to a different scale, rather than a step of the pattern. */
  escape: boolean;
}

export interface PoseTraceLevel {
  part: string;
  /** Pyramid index; 0 is full resolution. */
  level: number;
  reduction: number;
  /** How many of the candidates handed down this level took, before any rotation branching. */
  keep: number;
  /** The seeds this level polished, in the order they were ranked going in. */
  seeds: PoseTraceCandidate[];
  /** Per seed, this level's objective at the seed — where its polish started from. */
  starts: number[];
  /** Per seed, the moves its polish accepted, in order. */
  paths: PoseTraceStep[][];
  /** Per seed, where its polish ended. */
  polished: PoseTraceCandidate[];
  /** The candidates this level hands on, ranked and deduplicated. */
  out: PoseTraceCandidate[];
  /** This level's objective at `PoseTrace.probe`, when one was given. */
  probeResidual: number | null;
  /**
   * At the coarse level only, and `null` on every other (issue #892): the
   * rotation ladder the coarse field scanned, and per seed the field's own
   * objective at that seed's anchor cell and scale for every rung of it, in
   * ladder order — the numbers the field picked the seed's one rotation from.
   * Computed with the field's arithmetic, so the rung a seed carries reads the
   * least value of its row.
   */
  coarseRotations: { ladder: number[]; residuals: number[][] } | null;
}

/**
 * The refinement written down level by level, for an instrument that knows
 * where the truth is and needs to say where the search left it (issue #877).
 * Pure bookkeeping: a search with a trace returns the same report as one without.
 */
export interface PoseTrace {
  /** A placement, in the report's own space, to score at every level alongside the candidates. */
  probe?: { x: number; y: number; rotationDeg: number; scale: number };
  levels: PoseTraceLevel[];
  /** Per part, every candidate that reached the report, with its every-pixel residual, best first. */
  measured: { part: string; candidates: PoseTraceCandidate[] }[];
}

// ---------------------------------------------------------------------------
// pixels
// ---------------------------------------------------------------------------

/** One rung of a plate pyramid, flattened for the inner loops. */
export interface Level {
  data: Uint8Array;
  width: number;
  height: number;
  /** Full-resolution pixels per pixel of this level. */
  reduction: number;
}

export function levelOf(plate: Plate, reduction: number): Level {
  return { data: plate.data, width: plate.width, height: plate.height, reduction };
}

/**
 * Box-filter one plate down by two.
 *
 * RGB is averaged **weighted by alpha** and alpha plainly: averaging colour
 * straight would drag every edge pixel toward whatever the transparent
 * neighbour happens to store, which for a cut-out part is usually black.
 */
export function halvePlate(src: Plate): Plate {
  const w = Math.max(1, src.width >> 1);
  const h = Math.max(1, src.height >> 1);
  const out = new Plate(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sa = 0;
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let n = 0;
      for (let dy = 0; dy < 2; dy++) {
        const sy = Math.min(src.height - 1, y * 2 + dy);
        for (let dx = 0; dx < 2; dx++) {
          const sx = Math.min(src.width - 1, x * 2 + dx);
          const i = (sy * src.width + sx) * 4;
          const a = src.data[i + 3];
          sa += a;
          sr += src.data[i] * a;
          sg += src.data[i + 1] * a;
          sb += src.data[i + 2] * a;
          n++;
        }
      }
      const o = (y * w + x) * 4;
      out.data[o + 3] = Math.round(sa / n);
      if (sa > 0) {
        out.data[o] = Math.round(sr / sa);
        out.data[o + 1] = Math.round(sg / sa);
        out.data[o + 2] = Math.round(sb / sa);
      }
    }
  }
  return out;
}

/** `plate`, then every halving of it down to `minLongSide`, capped at `maxLevels`. */
function pyramid(plate: Plate, maxLevels: number, minLongSide: number): Plate[] {
  const out = [plate];
  while (out.length <= maxLevels) {
    const top = out[out.length - 1];
    if (Math.max(top.width, top.height) <= minLongSide) break;
    if (top.width < 2 || top.height < 2) break;
    out.push(halvePlate(top));
  }
  return out;
}

/**
 * What the frame's background is, read off its one-pixel border ring.
 *
 * ⭐ Why the background matters at all: without it, a grey part placed on grey
 * emptiness scores as well as a grey part placed on the grey figure, and the
 * whole silhouette signal is gone. With it, "the frame has nothing here" is the
 * maximum error rather than a lucky colour match.
 *
 * A border that is not dominated by one colour is reported `unknown` rather than
 * guessed at — the objective then reduces to plain colour matching, which is a
 * weaker instrument, and the report says so instead of quietly being weaker.
 */
export function readBackground(frame: Plate): PoseBackground {
  const w = frame.width;
  const h = frame.height;
  let ringCount = 0;
  let transparent = 0;
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  const visit = (x: number, y: number): void => {
    const i = (y * w + x) * 4;
    ringCount++;
    if (frame.data[i + 3] < 8) {
      transparent++;
      return;
    }
    const r = frame.data[i];
    const g = frame.data[i + 1];
    const b = frame.data[i + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const cell = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    cell.n++;
    cell.r += r;
    cell.g += g;
    cell.b += b;
    buckets.set(key, cell);
  };
  for (let x = 0; x < w; x++) {
    visit(x, 0);
    if (h > 1) visit(x, h - 1);
  }
  for (let y = 1; y < h - 1; y++) {
    visit(0, y);
    if (w > 1) visit(w - 1, y);
  }
  if (ringCount === 0) return { kind: 'unknown', colour: null, borderShare: 0, materialShare: 1 };
  if (transparent / ringCount >= 0.5) {
    return { kind: 'transparent', colour: null, borderShare: transparent / ringCount, materialShare: 0 };
  }
  let best: { n: number; r: number; g: number; b: number } | null = null;
  for (const cell of buckets.values()) if (best === null || cell.n > best.n) best = cell;
  if (best === null || best.n / ringCount < BACKGROUND_BORDER_SHARE) {
    return { kind: 'unknown', colour: null, borderShare: best ? best.n / ringCount : 0, materialShare: 1 };
  }
  return {
    kind: 'colour',
    colour: [Math.round(best.r / best.n), Math.round(best.g / best.n), Math.round(best.b / best.n)],
    borderShare: best.n / ringCount,
    materialShare: 0,
  };
}

/**
 * The frame as the objective reads it: the frame's own RGB, with alpha rewritten
 * to mean **how much material is here** rather than how opaque the file is.
 *
 * Keeping it in a `Plate` is what lets the pyramid, `bilinear` and the nearest
 * lookup all be the ones this repository already has.
 */
export function materialPlate(frame: Plate, background: PoseBackground): { plate: Plate; share: number } {
  const out = new Plate(frame.width, frame.height);
  let material = 0;
  const bg = background.colour;
  for (let i = 0; i < frame.data.length; i += 4) {
    const a = frame.data[i + 3];
    out.data[i] = frame.data[i];
    out.data[i + 1] = frame.data[i + 1];
    out.data[i + 2] = frame.data[i + 2];
    let m: number;
    if (background.kind === 'transparent') {
      m = a;
    } else if (background.kind === 'colour' && bg !== null) {
      const d = (Math.abs(frame.data[i] - bg[0]) + Math.abs(frame.data[i + 1] - bg[1]) + Math.abs(frame.data[i + 2] - bg[2])) / 3;
      m = d > BACKGROUND_TOLERANCE ? a : 0;
    } else {
      m = a;
    }
    out.data[i + 3] = m;
    material += m / 255;
  }
  return { plate: out, share: material / Math.max(1, frame.width * frame.height) };
}

/** The box the part's material occupies, in part pixels. `null` when there is none. */
function materialBox(part: Plate): { minX: number; minY: number; maxX: number; maxY: number; weight: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let weight = 0;
  for (let y = 0; y < part.height; y++) {
    for (let x = 0; x < part.width; x++) {
      const a = part.data[(y * part.width + x) * 4 + 3];
      if (a === 0) continue;
      weight += a / 255;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (weight === 0) return null;
  return { minX, minY, maxX: maxX + 1, maxY: maxY + 1, weight };
}

/**
 * The part's texture figure: the mean colour step between neighbouring material
 * pixels, 0..1, in the residual's own units.
 *
 * Every pair of a pixel and its right or lower neighbour, both with material,
 * contributes its mean absolute channel difference over 255, weighted by the
 * smaller of the two alphas. A part filled with one colour reads exactly 0.
 *
 * ⭐ Why this figure rather than a colour variance: it is, to first order, what a
 * one-pixel shift costs. Moving a part by a pixel inside material that continues
 * under it compares each of its pixels against its neighbour's colour, so the
 * residual rises by about this much per pixel of shift — and a part whose
 * residual cannot rise when it moves cannot be told apart from itself moved.
 * A variance does not see that: a part half one colour and half another has a
 * large variance and one edge. The silhouette is deliberately not counted — it
 * is what the material term already reads, and only where the frame is ground.
 */
export function partTexture(part: Plate): number {
  const w = part.width;
  const d = part.data;
  let weight = 0;
  let acc = 0;
  const pair = (i: number, j: number): void => {
    const k = Math.min(d[i + 3], d[j + 3]) / 255;
    if (k <= 0) return;
    weight += k;
    acc += (k * (Math.abs(d[i] - d[j]) + Math.abs(d[i + 1] - d[j + 1]) + Math.abs(d[i + 2] - d[j + 2]))) / 765;
  };
  for (let y = 0; y < part.height; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (d[i + 3] === 0) continue;
      if (x + 1 < w) pair(i, i + 4);
      if (y + 1 < part.height) pair(i, i + w * 4);
    }
  }
  return weight === 0 ? 0 : acc / weight;
}

// ---------------------------------------------------------------------------
// the objective
// ---------------------------------------------------------------------------

/**
 * The part, reduced to a list of coloured offsets from its anchor.
 *
 * Offsets are in **full-resolution part pixels** whatever mip they were read
 * from, so one sample set is valid at every search level: the level only decides
 * what the offsets get divided by on the way in.
 */
export interface Samples {
  u: Float64Array;
  v: Float64Array;
  r: Float64Array;
  g: Float64Array;
  b: Float64Array;
  w: Float64Array;
  count: number;
  weight: number;
}

const EMPTY_SAMPLES: Samples = {
  u: new Float64Array(0),
  v: new Float64Array(0),
  r: new Float64Array(0),
  g: new Float64Array(0),
  b: new Float64Array(0),
  w: new Float64Array(0),
  count: 0,
  weight: 0,
};

/**
 * Pick at most `cap` of a mip's material pixels, by a fixed stride over the
 * material list.
 *
 * Deterministic on purpose — `src/` has no randomness, and a sampler that
 * shuffled would make two runs of the same command disagree in the last decimal
 * of every residual.
 */
export function buildSamples(mip: Plate, reduction: number, anchorX: number, anchorY: number, cap: number): Samples {
  const idx: number[] = [];
  for (let y = 0; y < mip.height; y++) {
    for (let x = 0; x < mip.width; x++) {
      if (mip.data[(y * mip.width + x) * 4 + 3] > 0) idx.push(y * mip.width + x);
    }
  }
  if (idx.length === 0) return EMPTY_SAMPLES;
  const count = Math.min(cap, idx.length);
  const s: Samples = {
    u: new Float64Array(count),
    v: new Float64Array(count),
    r: new Float64Array(count),
    g: new Float64Array(count),
    b: new Float64Array(count),
    w: new Float64Array(count),
    count,
    weight: 0,
  };
  for (let k = 0; k < count; k++) {
    const at = idx[Math.floor((k * idx.length) / count)];
    const px = at % mip.width;
    const py = (at - px) / mip.width;
    const i = at * 4;
    s.u[k] = (px + 0.5) * reduction - anchorX;
    s.v[k] = (py + 0.5) * reduction - anchorY;
    s.r[k] = mip.data[i];
    s.g[k] = mip.data[i + 1];
    s.b[k] = mip.data[i + 2];
    s.w[k] = mip.data[i + 3] / 255;
    s.weight += s.w[k];
  }
  return s;
}

/** Error of one part pixel against the level, nearest neighbour. 1 outside the canvas. */
export function errNearest(level: Level, x: number, y: number, pr: number, pg: number, pb: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  if (ix < 0 || iy < 0 || ix >= level.width || iy >= level.height) return 1;
  const i = (iy * level.width + ix) * 4;
  const m = level.data[i + 3] / 255;
  if (m <= 0) return 1;
  const d = (Math.abs(level.data[i] - pr) + Math.abs(level.data[i + 1] - pg) + Math.abs(level.data[i + 2] - pb)) / 765;
  return m * d + (1 - m);
}

/**
 * Same, sampled between pixel centres — what the refinement stages measure with.
 *
 * ⭐ The two halves of the tap are read differently on purpose, and `bilinear`
 * is what supplies both: the colour is the material-weighted mean (a texel with
 * no material contributes no colour), while `fa` — the coverage this charges
 * `1 − m` for — is the plain interpolation of the fourth channel, unchanged.
 * Weighting a mask as if it were a colour is the mistake the import comment
 * warns about; weighting the colour BY the mask is the objective.
 */
export function errBilinear(level: Level, plate: Plate, x: number, y: number, pr: number, pg: number, pb: number): number {
  if (x < 0 || y < 0 || x >= level.width || y >= level.height) return 1;
  const [fr, fg, fb, fa] = bilinear(plate, x - 0.5, y - 0.5);
  const m = fa / 255;
  if (m <= 0) return 1;
  const d = (Math.abs(fr - pr) + Math.abs(fg - pg) + Math.abs(fb - pb)) / 765;
  return m * d + (1 - m);
}

/** A placement mid-search: the anchor's position at some level, plus the two other degrees of freedom. */
interface Candidate {
  /** Anchor position in the level's own pixels. */
  cx: number;
  cy: number;
  rotDeg: number;
  /** Frame pixels per part pixel, at FULL resolution — level-independent. */
  scale: number;
  residual: number;
}

function residualAt(level: Level, plate: Plate, s: Samples, cand: Candidate, smooth: boolean): number {
  if (s.count === 0) return 1;
  const k = cand.scale / level.reduction;
  const cos = Math.cos(cand.rotDeg * DEG) * k;
  const sin = Math.sin(cand.rotDeg * DEG) * k;
  let acc = 0;
  for (let i = 0; i < s.count; i++) {
    const fx = cand.cx + s.u[i] * cos - s.v[i] * sin;
    const fy = cand.cy + s.u[i] * sin + s.v[i] * cos;
    acc += s.w[i] * (smooth ? errBilinear(level, plate, fx, fy, s.r[i], s.g[i], s.b[i]) : errNearest(level, fx, fy, s.r[i], s.g[i], s.b[i]));
  }
  return acc / s.weight;
}

// ---------------------------------------------------------------------------
// the search
// ---------------------------------------------------------------------------

/**
 * Every anchor cell of the coarse level, holding the best (rotation, scale) found
 * for it.
 *
 * A per-cell best rather than a global top-K, because the thing this instrument
 * must not lose is the SECOND place a part could sit — and a global top-K fills
 * up with a hundred neighbours of the single best cell before it ever reaches it.
 *
 * 📏 ONE rotation per cell, and issue #892 measured what that costs rather than
 * assuming it. Over `tools/pose_floor.ts`'s 420 trials, the coarse seed nearest
 * the truth is within 2.4 px of it and a half-turn off on 2 of the 238 found
 * trials (both a mouth at 48 px, both found anyway) and on none of the 6
 * misses; every failed trial whose nearest seed is a quarter- or half-turn off
 * but one is a flat part, and none of those 26 is a miss: each is the objective
 * preferring another placement or the truth reported and tied. MOTION.md
 * §6's post is the one case, and a second rotation per cell would not reach it:
 * at its nearest cell the upright rung scores 0.305 against the half-turn's
 * 0.168 — 1.8 times, wider than the 1.73 band `REFINE_CANDIDATES` rejected.
 * The other two levers the card named were measured on the grid and lost found
 * trials outside the ambiguity margin: re-gridding rotation at this level
 * rather than the next (238 → 236: 7 gained, 9 lost, six of them native, three
 * guns now 37–151 px off), and suppressing minima only within a rotation family
 * (238 → 231: 2 gained, 10 lost, among them the 48 px fist `PO23` holds).
 */
interface CoarseField {
  residual: Float64Array;
  rotDeg: Float64Array;
  scale: number;
  /** Grid size, which is the LEVEL's size divided by `stride`. */
  cols: number;
  rows: number;
  /** Level pixels per grid step. */
  stride: number;
}

/**
 * One field per scale rung, and that separation is the load-bearing part.
 *
 * 🚨 A coarse level cannot compare scales. At a 4x reduction a striped torso and
 * a ringed ball are both near-uniform blobs, so the rung that scores best on one
 * is whichever fits deepest inside it — the smallest — and folding all rungs into
 * one field bakes that preference in before any level with detail gets a vote.
 * Keeping the fields apart means the coarse scan only ever answers the question it
 * CAN answer — "given this size, where and at what angle?" — and every rung sends
 * its own best guesses down to the levels that can tell them apart. Measured on
 * the fixture, folding them cost a torso its scale (0.59 against a true 1.15) and
 * cost the estimator one of two identical arms.
 */
function coarseScan(level: Level, s: Samples, scale: number, rotations: number[], stride: number): CoarseField {
  const cols = Math.max(1, Math.ceil(level.width / stride));
  const rows = Math.max(1, Math.ceil(level.height / stride));
  const field: CoarseField = {
    residual: new Float64Array(cols * rows).fill(Infinity),
    rotDeg: new Float64Array(cols * rows),
    scale,
    cols,
    rows,
    stride,
  };
  if (s.count === 0) return field;
  const k = scale / level.reduction;
  for (const rotDeg of rotations) {
    const cos = Math.cos(rotDeg * DEG) * k;
    const sin = Math.sin(rotDeg * DEG) * k;
    const dx = new Float64Array(s.count);
    const dy = new Float64Array(s.count);
    for (let i = 0; i < s.count; i++) {
      dx[i] = s.u[i] * cos - s.v[i] * sin;
      dy[i] = s.u[i] * sin + s.v[i] * cos;
    }
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        const cell = gy * cols + gx;
        // The bound is this cell's own best so far: anything that cannot beat
        // it changes nothing, so the loop may leave the moment it passes it.
        const bound = field.residual[cell] * s.weight;
        const ax = gx * stride + stride / 2;
        const ay = gy * stride + stride / 2;
        let acc = 0;
        let beaten = false;
        for (let i = 0; i < s.count; i++) {
          acc += s.w[i] * errNearest(level, ax + dx[i], ay + dy[i], s.r[i], s.g[i], s.b[i]);
          if ((i & 15) === 15 && acc >= bound) {
            beaten = true;
            break;
          }
        }
        if (beaten) continue;
        const residual = acc / s.weight;
        if (residual < field.residual[cell]) {
          field.residual[cell] = residual;
          field.rotDeg[cell] = rotDeg;
        }
      }
    }
  }
  return field;
}

/**
 * The coarse field's objective at one anchor, scale and rotation, summed in the
 * order `coarseScan` sums it and without its early exit — the trace's reading of
 * a cell, never the search's.
 */
function coarseCellResidual(level: Level, s: Samples, scale: number, rotDeg: number, ax: number, ay: number): number {
  if (s.count === 0) return Infinity;
  const k = scale / level.reduction;
  const cos = Math.cos(rotDeg * DEG) * k;
  const sin = Math.sin(rotDeg * DEG) * k;
  let acc = 0;
  for (let i = 0; i < s.count; i++) {
    const dx = s.u[i] * cos - s.v[i] * sin;
    const dy = s.u[i] * sin + s.v[i] * cos;
    acc += s.w[i] * errNearest(level, ax + dx, ay + dy, s.r[i], s.g[i], s.b[i]);
  }
  return acc / s.weight;
}

/**
 * The distinct places a part could sit, best first.
 *
 * A cell survives when nothing within `radius` beats it — the two-arms case is
 * exactly two such cells — and the accepted list then keeps them apart so the
 * refinement budget is not spent twice on one hill.
 */
function localMinima(field: CoarseField, radius: number, keep: number): Candidate[] {
  const found: Candidate[] = [];
  for (let gy = 0; gy < field.rows; gy++) {
    for (let gx = 0; gx < field.cols; gx++) {
      const here = field.residual[gy * field.cols + gx];
      if (!Number.isFinite(here)) continue;
      let minimal = true;
      for (let dy = -radius; dy <= radius && minimal; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = gx + dx;
          const ny = gy + dy;
          if (nx < 0 || ny < 0 || nx >= field.cols || ny >= field.rows) continue;
          if (field.residual[ny * field.cols + nx] < here) {
            minimal = false;
            break;
          }
        }
      }
      if (!minimal) continue;
      const cell = gy * field.cols + gx;
      found.push({
        cx: gx * field.stride + field.stride / 2,
        cy: gy * field.stride + field.stride / 2,
        rotDeg: field.rotDeg[cell],
        scale: field.scale,
        residual: here,
      });
    }
  }
  found.sort((a, b) => a.residual - b.residual);
  const accepted: Candidate[] = [];
  for (const cand of found) {
    if (accepted.length >= keep) break;
    if (accepted.some((a) => hypot2(a.cx - cand.cx, a.cy - cand.cy) <= radius * field.stride)) continue;
    accepted.push(cand);
  }
  return accepted;
}

/**
 * Pattern search on all four degrees of freedom: probe, move to the best
 * improvement, and halve the steps when none of them improves.
 *
 * Cheaper than a local grid by an order of magnitude and it is the same answer —
 * the objective is smooth at this range, and the coarse scan has already done the
 * part a local method cannot (finding the right hill).
 */
function polish(
  level: Level,
  plate: Plate,
  s: Samples,
  start: Candidate,
  step: { translate: number; rotate: number; scale: number },
  floor: { translate: number; rotate: number; scale: number },
  smooth: boolean,
  /** The scale window the report declares. A polish that walked outside it would report a scale nobody searched. */
  bounds: { min: number; max: number },
  /**
   * The rotation window the report declares, held for exactly the reason above.
   *
   * ⚠️ This argument did not exist until issue #719, and the sentence over
   * `bounds` was the whole argument for it the entire time: a polish free to
   * walk outside the window reports an answer nobody searched, and the window is
   * a field a caller is entitled to read as a promise. `src/chainfit.ts` had
   * already written that argument out for its own hinge — *"for the same reason
   * `pose`'s polish clamps its scale"* — while this file, the one it was citing,
   * clamped one of its two windows. Measured on a rotation window of `-5,5`: the
   * ladder walked its two endpoints and the report came back with 28.1°, 121.3°
   * and −122.3°.
   *
   * A full turn contains every angle, so it is left unclamped and the rotation
   * may wrap — which is what the default window is, and why nothing about a
   * default run moves.
   */
  rotationBounds: { min: number; max: number; wraps: boolean },
  /** Scale factors tried from the point the steps converged on; a better one restarts the polish there. */
  escapes: readonly number[],
  /** An instrument's record of where the polish started and the moves it accepted; the search never reads it. */
  path?: { start: number; steps: PoseTraceStep[] },
): Candidate {
  const clamp = (v: number): number => Math.min(bounds.max, Math.max(bounds.min, v));
  const hold = (v: number): number =>
    rotationBounds.wraps ? v : Math.min(rotationBounds.max, Math.max(rotationBounds.min, v));
  let cur: Candidate = { ...start, residual: residualAt(level, plate, s, start, smooth) };
  if (path !== undefined) path.start = cur.residual;
  let dt = step.translate;
  let dr = step.rotate;
  let ds = step.scale;
  for (let guard = 0; guard < 200; guard++) {
    if (dt <= floor.translate && dr <= floor.rotate && ds <= floor.scale) {
      let jump = cur;
      for (const f of escapes) {
        const scale = clamp(cur.scale * f);
        if (scale === cur.scale) continue;
        const refit = polish(
          level,
          plate,
          s,
          { ...cur, scale },
          { translate: step.translate, rotate: 0, scale: 0 },
          { translate: floor.translate, rotate: 0, scale: 0 },
          smooth,
          bounds,
          rotationBounds,
          [],
        );
        if (refit.residual < jump.residual) jump = refit;
      }
      if (jump === cur) break;
      path?.steps.push({ residual: jump.residual, translate: dt, rotate: dr, scale: jump.scale / cur.scale - 1, clamped: false, escape: true });
      cur = jump;
      dt = step.translate;
      dr = step.rotate;
      ds = step.scale;
      continue;
    }
    const probes: Candidate[] = [];
    const push = (cand: Omit<Candidate, 'residual'>): void => {
      probes.push({ ...cand, residual: residualAt(level, plate, s, { ...cand, residual: 0 }, smooth) });
    };
    if (dt > floor.translate) {
      for (const [ox, oy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]) {
        push({ cx: cur.cx + ox * dt, cy: cur.cy + oy * dt, rotDeg: cur.rotDeg, scale: cur.scale });
      }
    }
    if (dr > floor.rotate) {
      push({ cx: cur.cx, cy: cur.cy, rotDeg: hold(cur.rotDeg + dr), scale: cur.scale });
      push({ cx: cur.cx, cy: cur.cy, rotDeg: hold(cur.rotDeg - dr), scale: cur.scale });
    }
    if (ds > floor.scale) {
      push({ cx: cur.cx, cy: cur.cy, rotDeg: cur.rotDeg, scale: clamp(cur.scale * (1 + ds)) });
      push({ cx: cur.cx, cy: cur.cy, rotDeg: cur.rotDeg, scale: clamp(cur.scale * (1 - ds)) });
    }
    let best = cur;
    for (const p of probes) if (p.residual < best.residual) best = p;
    if (best === cur) {
      dt /= 2;
      dr /= 2;
      ds /= 2;
      continue;
    }
    if (path !== undefined) {
      const clamped =
        (best.scale !== cur.scale && best.scale !== cur.scale * (1 + ds) && best.scale !== cur.scale * (1 - ds)) ||
        (best.rotDeg !== cur.rotDeg && best.rotDeg !== cur.rotDeg + dr && best.rotDeg !== cur.rotDeg - dr);
      path.steps.push({ residual: best.residual, translate: dt, rotate: dr, scale: ds, clamped, escape: false });
    }
    cur = best;
  }
  return cur;
}

/** Candidates that walked to one optimum, collapsed to the best of them. Input must be sorted. */
function dedupe(sorted: Candidate[], within: number, degrees: number, scaleRatio: number): Candidate[] {
  const out: Candidate[] = [];
  for (const cand of sorted) {
    const same = out.some(
      (o) =>
        hypot2(o.cx - cand.cx, o.cy - cand.cy) <= within &&
        Math.abs(normaliseDegrees(o.rotDeg - cand.rotDeg)) <= degrees &&
        Math.abs(Math.log(o.scale / cand.scale)) <= Math.log(scaleRatio),
    );
    if (!same) out.push(cand);
  }
  return out;
}

// ---------------------------------------------------------------------------
// measuring the answer
// ---------------------------------------------------------------------------

/** The reported numbers, taken at full resolution over EVERY part pixel rather than a sample of them. */
function measure(
  level: Level,
  plate: Plate,
  part: Plate,
  anchorX: number,
  anchorY: number,
  cand: Candidate,
): Omit<PosePlacement, 'x' | 'y' | 'rotationDeg' | 'scale'> {
  const cos = Math.cos(cand.rotDeg * DEG) * cand.scale;
  const sin = Math.sin(cand.rotDeg * DEG) * cand.scale;
  let weight = 0;
  let acc = 0;
  let unexplained = 0;
  let off = 0;
  let onMaterial = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let y = 0; y < part.height; y++) {
    for (let x = 0; x < part.width; x++) {
      const i = (y * part.width + x) * 4;
      const a = part.data[i + 3];
      if (a === 0) continue;
      const w = a / 255;
      const u = x + 0.5 - anchorX;
      const v = y + 0.5 - anchorY;
      const fx = cand.cx + u * cos - v * sin;
      const fy = cand.cy + u * sin + v * cos;
      weight += w;
      if (fx < minX) minX = fx;
      if (fx > maxX) maxX = fx;
      if (fy < minY) minY = fy;
      if (fy > maxY) maxY = fy;
      const inside = fx >= 0 && fy >= 0 && fx < level.width && fy < level.height;
      if (!inside) off += w;
      const err = errBilinear(level, plate, fx, fy, part.data[i], part.data[i + 1], part.data[i + 2]);
      acc += w * err;
      if (err > UNEXPLAINED_TOLERANCE) unexplained += w;
      if (inside) {
        const ix = Math.min(level.width - 1, Math.floor(fx));
        const iy = Math.min(level.height - 1, Math.floor(fy));
        onMaterial += w * (level.data[(iy * level.width + ix) * 4 + 3] / 255);
      }
    }
  }
  if (weight === 0) {
    return { residual: 1, unexplained: 1, offCanvas: 1, footprint: 0, bbox: { x: 0, y: 0, width: 0, height: 0 } };
  }
  return {
    residual: acc / weight,
    unexplained: unexplained / weight,
    offCanvas: off / weight,
    // One part pixel covers `scale²` frame pixels, so this is the frame area the
    // placement actually accounts for — which is what separates two placements
    // whose per-pixel residuals are the same.
    footprint: onMaterial * cand.scale * cand.scale,
    bbox: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
  };
}

export function roundTo(n: number, places: number): number {
  const f = 10 ** places;
  const v = Math.round(n * f) / f;
  return v === 0 ? 0 : v;
}

/** Degrees into (-180, 180], the way an editor shows a rotation. */
export function normaliseDegrees(deg: number): number {
  let v = ((deg % 360) + 360) % 360;
  if (v > 180) v -= 360;
  return v;
}

/** A finished candidate, converted into the report's own frame of reference. */
function toPlacement(part: Plate, anchorX: number, anchorY: number, cand: Candidate, stats: ReturnType<typeof measure>): PosePlacement {
  const cos = Math.cos(cand.rotDeg * DEG) * cand.scale;
  const sin = Math.sin(cand.rotDeg * DEG) * cand.scale;
  const ou = part.width / 2 - anchorX;
  const ov = part.height / 2 - anchorY;
  return {
    x: roundTo(cand.cx + ou * cos - ov * sin, 3),
    y: roundTo(cand.cy + ou * sin + ov * cos, 3),
    rotationDeg: roundTo(normaliseDegrees(cand.rotDeg), 3),
    scale: roundTo(cand.scale, 5),
    residual: roundTo(stats.residual, 5),
    unexplained: roundTo(stats.unexplained, 4),
    offCanvas: roundTo(stats.offCanvas, 4),
    footprint: roundTo(stats.footprint, 1),
    bbox: {
      x: roundTo(stats.bbox.x, 2),
      y: roundTo(stats.bbox.y, 2),
      width: roundTo(stats.bbox.width, 2),
      height: roundTo(stats.bbox.height, 2),
    },
  };
}

/**
 * Is this part self-similar under rotation — a ball rather than an arm?
 *
 * Measured with the same objective, against the part itself: rotate it about its
 * own material centre and ask how much of it still lands on itself, in the same
 * colours. A disc answers ~0 at every angle; anything with a corner or a pattern
 * does not.
 */
function rotationSelfSimilarity(part: Plate, anchorX: number, anchorY: number): number {
  const level = levelOf(part, 1);
  const samples = buildSamples(part, 1, anchorX, anchorY, POLISH_SAMPLES);
  if (samples.count === 0) return 1;
  const at = (deg: number): number =>
    residualAt(level, part, samples, { cx: anchorX, cy: anchorY, rotDeg: deg, scale: 1, residual: 0 }, true);
  // ⚠️ Measured against the IDENTITY, not against zero. A part with a soft rim
  // scores above zero when laid over itself unrotated — every partly transparent
  // pixel pays the `1 − material` term against its own partial alpha — so an
  // absolute reading calls a perfectly round anti-aliased ball asymmetric. On the
  // fixture's 32px ball that baseline is most of a 0.033 absolute reading, which
  // sits the wrong side of a tolerance the shape plainly deserves to pass.
  //
  // 📏 Re-baselined for #306: the absolute reading was 0.034 under the
  // channel-independent tap and the BASELINE did not move at all (0.0198 both
  // ways). It could not: at zero rotation every sample lands on a texel centre,
  // where premultiplying and dividing back out is the identity. What premultiplying
  // took off is the rotated readings — worst relative 0.0143 -> 0.0129 — which is
  // the ball's own soft rim no longer being compared against black.
  const baseline = at(0);
  let worst = 0;
  for (let deg = 30; deg < 360; deg += 30) {
    const r = at(deg) - baseline;
    if (r > worst) worst = r;
  }
  return worst;
}

// ---------------------------------------------------------------------------
// arguments
// ---------------------------------------------------------------------------

function scaleLadder(min: number, max: number): number[] {
  if (max <= min) return [min];
  const octaves = Math.log2(max / min);
  const steps = Math.max(1, Math.round(octaves * SCALE_STEPS_PER_OCTAVE));
  const out: number[] = [];
  for (let i = 0; i <= steps; i++) out.push(min * (max / min) ** (i / steps));
  return out;
}

/**
 * The angles the coarse pass actually walks, evenly dividing the window.
 *
 * ⭐ `scaleLadder` above is the shape this follows, and it is the reason the
 * defect was reachable: that one takes a rung count off its window and divides,
 * so the rung it reports is the rung it walks. This one used to march
 * `COARSE_ROTATION_STEP` off the floor and then append the ceiling, which left
 * two ways for the reported step to be a different number from the applied one —
 * a window narrower than the constant got its two endpoints and a gap of the
 * window's own width, and any window whose span is not a whole number of steps
 * got a short final gap. Both printed `step 15°`.
 *
 * ⚠️ The count is a CEILING rather than a rounding, which is not tidiness: a
 * rounding down would make the applied step wider than `COARSE_ROTATION_STEP`
 * for a window like 20°, so the constant would stop being an upper bound on the
 * step. Rounding up cannot coarsen the search — measured against the old ladder,
 * every window it changes gets at least as many angles as before.
 */
export function rotationLadder(minDeg: number, maxDeg: number): number[] {
  const span = maxDeg - minDeg;
  if (span <= 0) return [minDeg];
  const steps = Math.ceil(span / COARSE_ROTATION_STEP - 1e-9);
  const out: number[] = [];
  for (let i = 0; i <= steps; i++) out.push(minDeg + (span * i) / steps);
  // A full turn's two endpoints are the same rotation, so it gets one of them.
  if (span >= 360 - 1e-9) out.pop();
  return out;
}

/** The step a ladder walks, read off the ladder rather than off the constant it was built from. */
function ladderStep(degrees: number[]): number {
  return degrees.length > 1 ? degrees[1] - degrees[0] : 0;
}

/**
 * The `search` line's rotation clause.
 *
 * ⭐ Exported for the same reason `windowEdgeNote` is: `docs/AUTHORING.md`
 * quotes this line, and a guide that spells a report's own sentence by hand is
 * a second implementation of it. `CUR47` builds the clause here and looks for it
 * in the page, so the two go stale together or not at all.
 */
export function searchRotationClause(rotation: PoseSearch['rotation']): string {
  // Rounded for the console alone — `search.rotation` in the JSON carries the
  // ladder unrounded, because a window that divides into thirds has angles no
  // decimal place holds.
  return `rotation ${rotation.minDeg}°–${rotation.maxDeg}° in ${rotation.steps} step(s) of ${roundTo(rotation.stepDeg, 3)}°`;
}

/**
 * The sentence a refusal carries when its best placement sits on a WALL of the
 * search window rather than somewhere inside it.
 *
 * ⭐ Exported because the guide quotes it and `CUR48` compares the two: a
 * message and the document that teaches it are the same interface, and the only
 * way they cannot drift is for one of them to be built from the other.
 *
 * The claim is deliberately weak — *may* lie outside — because that is all that
 * is known. The search was bounded, the optimum walked to the bound and stopped;
 * whether the truth is past it or the part simply does not appear in this frame
 * are two readings this instrument cannot separate. Naming the wall is what lets
 * an author separate them, by moving the wall.
 */
export function windowEdgeNote(axis: 'scale' | 'rotation', edge: 'floor' | 'ceiling', at: string, window: string): string {
  return (
    `best placement at ${axis} ${at}, ${wallClause(axis, edge, window)} — ` +
    `the truth may lie ${edge === 'floor' ? 'below' : 'above'} the window`
  );
}

/**
 * The wall named on its own — `the ceiling of --scale 0.5,2` — which is the part
 * of `windowEdgeNote` an ACCEPTED placement's console line carries (issue #737).
 *
 * ⭐ One clause, two sentences, so the refusal and the accepted line cannot spell
 * the same wall two ways. The accepted line carries the wall and not the "truth
 * may lie" half on purpose: measured over the corpus, a floor holds truths below
 * the window and parts shrunk into their own region alike, so which side the
 * truth is on is exactly what an accepted placement does not know.
 */
export function wallClause(axis: 'scale' | 'rotation', edge: 'floor' | 'ceiling', window: string): string {
  return `the ${edge} of --${axis} ${window}`;
}

/**
 * The walls of the window one placement stands on — the single reading both a
 * refusal and an accepted placement are marked from (issue #737).
 *
 * 🔑 Read off the UNROUNDED candidate, because the clamp writes the bound itself
 * and so "on" is an equality — while the reported `scale` is rounded to five
 * places and a window need not be: under `--scale 0.0931424…,0.3725…` the report
 * prints `0.09314`, below its own floor, for a candidate the clamp put exactly on
 * it. The `1e-9` is float slack on a ladder rung computed as `min + span·i/steps`,
 * not a notion of "near": the nearest correct placement that settled inside the
 * window was measured 0.125% off its wall, the polish's last scale step.
 *
 * A window with no interior — `min === max` — has no wall to be at: being at the
 * only value there is says nothing about where the answer is (issue #719). A
 * window spanning a full turn has none either, and neither has the rotation of a
 * `rotationFree` part, whose `0°` is a placeholder the search never moved.
 */
export function placementWalls(
  scale: number,
  rotationDeg: number,
  scaleBounds: { min: number; max: number },
  rotationBounds: { min: number; max: number; wraps: boolean },
  rotationFree: boolean,
): PoseWall[] {
  const walls: PoseWall[] = [];
  const at = (value: number, bound: number): boolean => Math.abs(value - bound) <= 1e-9 * Math.max(1, Math.abs(bound));
  if (scaleBounds.max > scaleBounds.min) {
    const window = `${scaleBounds.min},${scaleBounds.max}`;
    if (at(scale, scaleBounds.min)) walls.push({ axis: 'scale', edge: 'floor', window });
    else if (at(scale, scaleBounds.max)) walls.push({ axis: 'scale', edge: 'ceiling', window });
  }
  if (!rotationFree && !rotationBounds.wraps && rotationBounds.max > rotationBounds.min) {
    const window = `${rotationBounds.min},${rotationBounds.max}`;
    if (at(rotationDeg, rotationBounds.min)) walls.push({ axis: 'rotation', edge: 'floor', window });
    else if (at(rotationDeg, rotationBounds.max)) walls.push({ axis: 'rotation', edge: 'ceiling', window });
  }
  return walls;
}

/** The PNGs in a directory, in name order — the parts, and the order the report lists them. */
export function partFiles(imagesDir: string, exclude: string): string[] {
  const dir = resolve(imagesDir);
  if (!existsSync(dir)) throw new PoseError(`no parts directory at ${dir}`);
  if (!statSync(dir).isDirectory()) throw new PoseError(`${dir} is not a directory — --images takes the directory the part PNGs are in`);
  const excluded = resolve(exclude);
  const files = readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.png'))
    .map((f) => join(dir, f))
    .filter((f) => resolve(f) !== excluded)
    .sort();
  if (files.length === 0) throw new PoseError(`no .png files in ${dir} — there is nothing to place`);
  return files;
}

// ---------------------------------------------------------------------------
// the instrument
// ---------------------------------------------------------------------------

export function estimatePose(options: PoseOptions): PoseReport {
  const framePath = resolve(options.framePath);
  if (!existsSync(framePath)) throw new PoseError(`no pose frame at ${framePath}`);
  let frame: Plate;
  try {
    frame = readPlate(framePath);
  } catch (err) {
    throw new PoseError(`cannot read the pose frame ${framePath}: ${(err as Error).message}`);
  }
  const paths =
    options.parts === undefined
      ? partFiles(options.imagesDir, framePath)
      : options.parts.map((p) => resolve(p)).filter((p) => p !== framePath);
  if (paths.length === 0) throw new PoseError(`no parts to place — there is nothing to search for in ${framePath}`);

  const scaleMin = options.scale?.min ?? DEFAULT_SCALE_MIN;
  const scaleMax = options.scale?.max ?? DEFAULT_SCALE_MAX;
  const rotMin = options.rotation?.minDeg ?? -180;
  const rotMax = options.rotation?.maxDeg ?? 180;
  const maxResidual = options.maxResidual ?? DEFAULT_MAX_RESIDUAL;
  const scales = scaleLadder(scaleMin, scaleMax);
  const rotations = rotationLadder(rotMin, rotMax);

  const background = readBackground(frame);
  const material = materialPlate(frame, background);
  background.materialShare = roundTo(material.share, 4);
  const framePyramid = pyramid(material.plate, 6, COARSE_LONG_SIDE);
  const levels = framePyramid.map((p, i) => levelOf(p, 2 ** i));

  const report: PoseReport = {
    spec: POSE_SPEC,
    space:
      'frame pixels, y down, origin top-left. (x, y) is where the part image\'s own centre lands; rotationDeg is ' +
      'screen degrees, positive clockwise; scale is frame pixels per part pixel. Reconstruct a part pixel p as ' +
      'centre + scale * R(rotationDeg) * (p - (width/2, height/2)). src/transform.ts converts to Spine world ' +
      '(screenToSpineDegrees, cropToSpineY).',
    images: resolve(options.imagesDir),
    frame: { path: framePath, width: frame.width, height: frame.height, background },
    search: {
      scale: { min: scaleMin, max: scaleMax, steps: scales.length },
      rotation: {
        minDeg: rotMin,
        maxDeg: rotMax,
        // ⚠️ Neither of these is rounded, and every other number in this report
        // is. Rounding them would make the reported ladder a near-copy of the
        // applied one, which is the defect this field exists to close — a window
        // that divides into thirds has angles no decimal place holds. The console
        // rounds for display; the record is exact.
        stepDeg: ladderStep(rotations),
        steps: rotations.length,
        degrees: [...rotations],
      },
      coarse: {
        frameLongSide: COARSE_LONG_SIDE,
        partSpan: COARSE_PART_SPAN,
        strideFraction: (options.coarseGrid ?? COARSE_GRID).strideFraction,
        framePyramid: framePyramid.length,
      },
      maxResidual,
      ambiguity: { absolute: AMBIGUITY_ABSOLUTE, relative: AMBIGUITY_RELATIVE },
    },
    caveats: [
      'No number here is a score and none of them has a pass bar. The residual says how well the placed part ' +
        'explains the frame under it, which is a measure of how far to trust the placement.',
      'Residuals degrade under OCCLUSION. A part drawn behind another has the occluder\'s pixels where its own ' +
        'should be, so its residual rises at the correct placement; `unexplained` is the share of the part that ' +
        'disagrees, and a middling residual with a high `unexplained` usually means "right place, seen through ' +
        'something else" rather than "wrong place". Nothing here solves for depth.',
      'An `ambiguous` part has two or more placements this instrument cannot separate. Both are reported. ' +
        'Choosing between them needs something it cannot see — anatomy, the other frame, or a human.',
      'A `rotationFree` part is self-similar under rotation, so its reported rotation is a placeholder and the ' +
        'value is yours to choose.',
      'The search is bounded to the scale and rotation windows named in `search`, with the part anchor placed ' +
        'only inside the frame canvas. ⚠️ A window that does not contain the true value does NOT reliably ' +
        'refuse: a part shrunk inside the region it came from still explains those pixels, so the answer is the ' +
        'best placement available INSIDE the window and its residual can look reasonable. That is why the window ' +
        'is a reported field — if the numbers surprise you, check it before you trust them. A part whose placement ' +
        'stopped ON a wall of the window lists it in `walls`, whatever its verdict: a refused one also names it in ' +
        '`refusal.detail`, an accepted one beside the value on its console line. That value is where the search was ' +
        'held rather than where it came to rest, and the window is the first thing to move. An empty `walls` is ' +
        'not evidence the truth is inside the window — a placement can settle inside it on another optimum.',
    ],
    parts: [],
  };

  // A window spanning a whole turn contains every angle there is, so nothing is
  // outside it and nothing has to be held inside it.
  const rotationBounds = { min: rotMin, max: rotMax, wraps: rotMax - rotMin >= 360 - 1e-9 };
  for (const path of paths) {
    report.parts.push(
      placePart(
        path,
        frame,
        levels,
        framePyramid,
        scales,
        rotations,
        maxResidual,
        { min: scaleMin, max: scaleMax },
        rotationBounds,
        options.coarseGrid ?? COARSE_GRID,
        options.trace,
      ),
    );
  }
  return report;
}

function placePart(
  path: string,
  frame: Plate,
  levels: Level[],
  plates: Plate[],
  scales: number[],
  rotations: number[],
  maxResidual: number,
  scaleBounds: { min: number; max: number },
  rotationBounds: { min: number; max: number; wraps: boolean },
  coarseGrid: PoseCoarseGrid,
  trace?: PoseTrace,
): PosePart {
  const scaleMin = scaleBounds.min;
  /** The scale the sample sets are sized for — the middle of the window, and NOT the scale under test. */
  const scaleReference = Math.sqrt(scaleBounds.min * scaleBounds.max);
  const name = basename(path);
  let part: Plate;
  try {
    part = readPlate(path);
  } catch (err) {
    return {
      part: name,
      path,
      width: 0,
      height: 0,
      refusal: { reason: 'empty-part', detail: `cannot decode ${name}: ${(err as Error).message}` },
      placement: null,
      walls: [],
      alternates: [],
      ambiguous: false,
      rotationFree: false,
      rotationSelfSimilarity: 1,
      coarse: null,
      legibility: null,
      notes: [`${name} could not be decoded, so it was not placed.`],
    };
  }
  const base: PosePart = {
    part: name,
    path,
    width: part.width,
    height: part.height,
    refusal: null,
    placement: null,
    walls: [],
    alternates: [],
    ambiguous: false,
    rotationFree: false,
    rotationSelfSimilarity: 1,
    coarse: null,
    legibility: null,
    notes: [],
  };

  const box = materialBox(part);
  if (box === null) {
    base.refusal = { reason: 'empty-part', detail: `${name} is ${part.width}x${part.height} and every pixel of it is transparent` };
    base.notes.push(`${name} has no material to place.`);
    return base;
  }
  const tw = box.maxX - box.minX;
  const th = box.maxY - box.minY;
  const fitsUpright = tw * scaleMin <= frame.width && th * scaleMin <= frame.height;
  const fitsTurned = th * scaleMin <= frame.width && tw * scaleMin <= frame.height;
  if (!fitsUpright && !fitsTurned) {
    base.refusal = {
      reason: 'larger-than-canvas',
      detail:
        `${name}'s material is ${tw}x${th} part px; at the smallest tested scale ${scaleMin} that is ` +
        `${roundTo(tw * scaleMin, 1)}x${roundTo(th * scaleMin, 1)} frame px, which does not fit a ` +
        `${frame.width}x${frame.height} canvas at any rotation`,
    };
    base.notes.push(`${name} cannot be contained by this frame at any tested scale — lower --scale or check the pair.`);
    return base;
  }

  /** Longest side of the part's material, in part pixels — the yardstick "near" is measured in. */
  const span = Math.max(tw, th);
  const anchorX = (box.minX + box.maxX) / 2;
  const anchorY = (box.minY + box.maxY) / 2;

  // Rotation freedom is settled before the search, because a part it applies to
  // does not need a rotation ladder at all — and searching one would invent a
  // precise-looking angle for a quantity that has none.
  const selfSimilarity = rotationSelfSimilarity(part, anchorX, anchorY);
  const rotationFree = selfSimilarity <= ROTATION_FREE_TOLERANCE;
  base.rotationFree = rotationFree;
  base.rotationSelfSimilarity = roundTo(selfSimilarity, 5);
  const searchRotations = rotationFree ? [0] : rotations;
  if (rotationFree) {
    base.notes.push(
      `${name} is self-similar under rotation (worst self-residual ${roundTo(selfSimilarity, 4)} over 11 probes, ` +
        `tolerance ${ROTATION_FREE_TOLERANCE}), so rotation is a free degree of freedom — the reported 0° is a ` +
        'placeholder, not a measurement.',
    );
  }

  const partPyramid = pyramid(part, 6, 4);
  const samplesCache = new Map<string, Samples>();
  /**
   * The part's sample set for one search level.
   *
   * 🚨 The mip is chosen from the level and the MIDDLE of the scale window, never
   * from the scale being tried — and that is the whole reason scale is
   * identifiable at all. Sizing the sample set to each candidate scale looks
   * obviously right (sample the part as finely as the frame can resolve it) and
   * collapses the search: a small scale then gets a coarse, few-pixel mip whose
   * every sample is an average of a large patch, those samples land deep inside
   * the blob, and the residual goes to nothing. Measured on the fixture: a 22px
   * head found its optimum at scale 0.39 with residual 0.065, against 0.017 at
   * the true 1.15 — the search preferred a placement the objective itself scores
   * worse, because the two were not scored on the same pixels. One sample set per
   * level puts every candidate scale on the same material, and then a scale that
   * squeezes six samples into three frame pixels has to explain why they disagree.
   */
  const samplesFor = (levelReduction: number, cap: number): Samples => {
    const wanted = Math.max(0, Math.round(Math.log2(Math.max(1e-6, levelReduction / scaleReference))));
    const mip = Math.min(partPyramid.length - 1, wanted);
    const key = `${mip}:${cap}`;
    const hit = samplesCache.get(key);
    if (hit) return hit;
    const built = buildSamples(partPyramid[mip], 2 ** mip, anchorX, anchorY, cap);
    samplesCache.set(key, built);
    return built;
  };

  // ⭐ Which level the exhaustive pass runs at is a decision about the PART, not
  // only about the frame. The pyramid stops when the frame fits in
  // COARSE_LONG_SIDE; this then walks back UP it until the part still spans
  // COARSE_PART_SPAN pixels there, because a level that has reduced the part to
  // three pixels cannot say where the part is at any price — and until its short
  // side still spans COARSE_PART_THICKNESS, which is the same sentence about a
  // part that is long and thin.
  let coarseIndex = levels.length - 1;
  const thickness = Math.min(tw, th);
  while (
    coarseIndex > 0 &&
    ((span * scaleReference) / levels[coarseIndex].reduction < COARSE_PART_SPAN ||
      (thickness * scaleReference) / levels[coarseIndex].reduction < COARSE_PART_THICKNESS)
  ) {
    coarseIndex--;
  }
  const coarse = levels[coarseIndex];
  const spanAtCoarse = (span * scaleReference) / coarse.reduction;
  const stride = Math.max(1, Math.round(spanAtCoarse * coarseGrid.strideFraction));
  const coarseSamples = samplesFor(coarse.reduction, COARSE_SAMPLES);
  let candidates: Candidate[] = [];
  let grid = { reduction: coarse.reduction, cols: 0, rows: 0, stride };
  for (const scale of scales) {
    const field = coarseScan(coarse, coarseSamples, scale, searchRotations, stride);
    grid = { reduction: coarse.reduction, cols: field.cols, rows: field.rows, stride };
    candidates.push(...localMinima(field, coarseGrid.suppressionCells, coarseGrid.minimaPerScale));
  }
  base.coarse = grid;
  candidates.sort((a, b) => a.residual - b.residual);
  if (candidates.length === 0) {
    base.refusal = { reason: 'no-match', detail: `${name}: the coarse scan found no finite placement in this frame` };
    base.notes.push(`${name} matched nowhere in this frame.`);
    return base;
  }

  // Refine down the pyramid. Every level doubles the coordinates and halves the
  // steps; the candidate list narrows as it goes so the budget follows the
  // placements that are still plausible.
  //
  // 🚨 One level RE-GRIDS rotation instead of narrowing, for the same reason the
  // coarse fields are kept apart by scale: a blurred blob does not have a
  // measurable angle either, and the field keeps only one rotation per cell. On
  // the fixture the right arm was found at exactly the right PLACE carrying
  // rotation -122 degrees, which no 7.5 degree local step could ever leave — and
  // that arm is one half of the two-identical-limbs answer the whole instrument
  // exists to report. Re-gridding the ladder at the first level with real detail
  // brought it back at +35.
  const branchLevel = Math.max(0, coarseIndex - 1);
  /** How many rotations survive the re-grid at the branch level, per position. */
  const BRANCH_ROTATIONS = 3;
  let rotStep = rotationFree ? 0 : COARSE_ROTATION_STEP / 2;
  for (let li = coarseIndex; li >= 0; li--) {
    const level = levels[li];
    const plate = plates[li];
    const smooth = li !== coarseIndex;
    const branch = li === branchLevel;
    const keep = li === coarseIndex ? scales.length * coarseGrid.minimaPerScale : REFINE_CANDIDATES;
    const s = samplesFor(level.reduction, li === 0 ? POLISH_SAMPLES : REFINE_SAMPLES);
    // The coarse pass only sampled every `stride` pixels, so entering the
    // refinement the anchor can be half a stride out; the first polish gets a
    // step big enough to cross that rather than a step that assumes a pixel.
    const step = { translate: li === coarseIndex ? Math.max(1.5, stride) : 1.5, rotate: rotStep, scale: 0.08 };
    const floor =
      li === 0 ? { translate: 0.05, rotate: 0.1, scale: 0.001 } : { translate: 0.25, rotate: 0.5, scale: 0.01 };
    const seeds: Candidate[] = [];
    for (const start of candidates.slice(0, keep)) {
      if (branch && !rotationFree) {
        const grid: Candidate[] = [];
        for (const rotDeg of searchRotations) {
          const probe: Candidate = { ...start, rotDeg, residual: 0 };
          probe.residual = residualAt(level, plate, s, probe, smooth);
          grid.push(probe);
        }
        grid.sort((a, b) => a.residual - b.residual);
        // One position and one scale throughout, so this dedupe is a spread over
        // rotation alone: an angle within 25 degrees of one already kept is the
        // same basin under a slightly different name.
        seeds.push(...dedupe(grid, 1, 25, Infinity).slice(0, BRANCH_ROTATIONS));
        continue;
      }
      seeds.push(start);
    }
    const paths = seeds.map((): { start: number; steps: PoseTraceStep[] } => ({ start: 0, steps: [] }));
    candidates = seeds.map((seed, i) =>
      polish(level, plate, s, seed, step, floor, smooth, scaleBounds, rotationBounds, li === 0 ? POLISH_SCALE_ESCAPES : [], trace === undefined ? undefined : paths[i]),
    );
    const polished = candidates.slice();
    candidates.sort((a, b) => a.residual - b.residual);
    // ⚠️ Eight branches that walked to one optimum are one candidate, not eight —
    // and the radius has to scale with the PART rather than be a pixel count.
    // Narrowing by residual alone lets near-copies of the best hill fill the
    // budget and crowd the SECOND hill out, which is exactly the answer this
    // instrument exists to keep: with a fixed one-pixel radius the fixture lost
    // one of its two identical arms.
    candidates = dedupe(candidates, Math.max(1, (0.2 * span * scaleReference) / level.reduction), 5, 1.03);
    if (trace !== undefined) {
      const ou = part.width / 2 - anchorX;
      const ov = part.height / 2 - anchorY;
      const said = (c: Candidate): PoseTraceCandidate => {
        const cos = Math.cos(c.rotDeg * DEG) * c.scale;
        const sin = Math.sin(c.rotDeg * DEG) * c.scale;
        return {
          x: c.cx * level.reduction + ou * cos - ov * sin,
          y: c.cy * level.reduction + ou * sin + ov * cos,
          rotationDeg: normaliseDegrees(c.rotDeg),
          scale: c.scale,
          residual: c.residual,
        };
      };
      let probeResidual: number | null = null;
      if (trace.probe !== undefined) {
        const q = trace.probe;
        const cos = Math.cos(q.rotationDeg * DEG) * q.scale;
        const sin = Math.sin(q.rotationDeg * DEG) * q.scale;
        const at: Candidate = {
          cx: (q.x - (ou * cos - ov * sin)) / level.reduction,
          cy: (q.y - (ou * sin + ov * cos)) / level.reduction,
          rotDeg: q.rotationDeg,
          scale: q.scale,
          residual: 0,
        };
        probeResidual = residualAt(level, plate, s, at, smooth);
      }
      trace.levels.push({
        part: name,
        level: li,
        reduction: level.reduction,
        keep,
        seeds: seeds.map(said),
        starts: paths.map((p) => p.start),
        paths: paths.map((p) => p.steps),
        polished: polished.map(said),
        out: candidates.map(said),
        probeResidual,
        coarseRotations:
          li === coarseIndex
            ? {
                ladder: searchRotations.slice(),
                residuals: seeds.map((seed) =>
                  searchRotations.map((rotDeg) => coarseCellResidual(level, coarseSamples, seed.scale, rotDeg, seed.cx, seed.cy)),
                ),
              }
            : null,
      });
    }
    if (li > 0) {
      candidates = candidates.map((c) => ({ ...c, cx: c.cx * 2, cy: c.cy * 2 }));
      // A rotation-free part keeps its step at zero all the way down, so the
      // polish never touches an angle that means nothing and the report's 0° is
      // the placeholder it says it is rather than a wandered-to number.
      if (!rotationFree) rotStep = Math.max(1, rotStep / 2);
    }
  }

  // The one rotation family the translation scan cannot see: a part that is its
  // own mirror after a quarter or a half turn sits in the SAME place at more than
  // one angle, so the field records only whichever won. Probe them explicitly.
  //
  // 🚨 Only the turns the window contains, and this is the other half of #719's
  // measurement. A quarter turn off is a SEED, not a ladder rung — so under
  // `--rotation -5,5` it entered the answer from outside a window the report was
  // calling the search, and the candidate who ran the exam read `rot=91.2°`
  // under `rotation -5°–5°`. A caller who bounds the rotation has said the part
  // is not a quarter turn over; the honest response is not to look there rather
  // than to look and report it.
  if (!rotationFree && candidates.length > 0) {
    const primary = candidates[0];
    const s = samplesFor(1, POLISH_SAMPLES);
    for (const turn of [90, 180, 270]) {
      const turned = primary.rotDeg + turn;
      if (!rotationBounds.wraps && (turned < rotationBounds.min - 1e-9 || turned > rotationBounds.max + 1e-9)) continue;
      candidates.push(
        polish(
          levels[0],
          plates[0],
          s,
          { ...primary, rotDeg: turned },
          { translate: 1.5, rotate: 4, scale: 0.04 },
          { translate: 0.05, rotate: 0.1, scale: 0.001 },
          true,
          scaleBounds,
          rotationBounds,
          [],
        ),
      );
    }
    candidates.sort((a, b) => a.residual - b.residual);
  }

  // Measured at full resolution over every pixel, then de-duplicated: two
  // candidates that walked to the same optimum are one answer, not two.
  const measured = candidates.map((cand) => ({ cand, placement: toPlacement(part, anchorX, anchorY, cand, measure(levels[0], plates[0], part, anchorX, anchorY, cand)) }));
  measured.sort((a, b) => a.placement.residual - b.placement.residual || b.placement.footprint - a.placement.footprint);
  trace?.measured.push({
    part: name,
    candidates: measured.map((m) => ({
      x: m.placement.x,
      y: m.placement.y,
      rotationDeg: m.placement.rotationDeg,
      scale: m.placement.scale,
      residual: m.placement.residual,
    })),
  });
  const distinct: typeof measured = [];
  for (const m of measured) {
    const same = distinct.some(
      (d) =>
        hypot2(d.placement.x - m.placement.x, d.placement.y - m.placement.y) <= Math.max(1.5, 0.03 * span * m.placement.scale) &&
        Math.abs(normaliseDegrees(d.placement.rotationDeg - m.placement.rotationDeg)) <= 5 &&
        Math.abs(Math.log(d.placement.scale / m.placement.scale)) <= Math.log(1.05),
    );
    if (!same) distinct.push(m);
  }

  const best = distinct[0].placement;
  const second = distinct.length > 1 ? distinct[1].placement.residual : null;
  base.legibility = {
    width: tw,
    height: th,
    span: roundTo(span * best.scale, 1),
    opaqueShare: roundTo(box.weight / (tw * th), 4),
    texture: roundTo(partTexture(part), 4),
    detail: roundTo(partTexture(part) * span, 3),
    candidates: distinct.length,
    best: best.residual,
    next: second,
    spread: second === null ? null : roundTo(second - best.residual, 5),
    floor: 'above',
    reading: null,
  };
  // The part's OWN size, not `span`: `span` is scaled by the best placement,
  // and on the parts this reading exists for that placement is the one in
  // doubt — a gun cut at 32 px read as 16 px under the half-scale optimum it
  // wrongly settled on. The floor was measured at scale 1, where the two agree.
  base.legibility.floor = floorSide(Math.max(tw, th), base.legibility.detail);
  const margin = Math.max(AMBIGUITY_ABSOLUTE, best.residual * AMBIGUITY_RELATIVE);
  const close = distinct.slice(1).filter((d) => d.placement.residual - best.residual <= margin);
  base.placement = best;
  base.alternates = close.slice(0, MAX_ALTERNATES).map((d) => d.placement);
  base.ambiguous = close.length > 0;
  if (base.ambiguous) {
    base.notes.push(
      `${name} has ${close.length + 1} placements within ${roundTo(margin, 4)} residual of each other — all of them ` +
        'are reported and none was picked. Two identical limbs look exactly like this; so does a part that fits ' +
        'its own silhouette at more than one angle.',
    );
  }
  // 🔒 Which walls the answer stands on, read once and for every verdict — the
  // refusal below quotes them and an accepted line carries them (issue #737).
  // The candidate rather than the rounded placement, and in the window's own
  // spelling: the clamp holds `rotDeg` inside `170,190` as written, so its
  // ceiling is 190 there even though the report normalises it to −170°.
  base.walls = placementWalls(distinct[0].cand.scale, distinct[0].cand.rotDeg, scaleBounds, rotationBounds, rotationFree);
  if (best.residual > maxResidual) {
    // ⭐ The wall the answer stopped against, named in the refusal that reports
    // it (issue #719). A refusal that states only the residual and the threshold
    // sends an author to the one remedy that cannot work — every part of a frame
    // rendered below the scale floor came back refused at the floor, and the
    // window that could not reach the truth was a line further up the report
    // nobody was told to read.
    //
    // A window with no interior — `min === max` — has no wall to be at, so it
    // gets no sentence: being at the only value there is says nothing about
    // where the truth is. `placementWalls` holds that rule for both verdicts.
    const edges = base.walls.map((wall) =>
      windowEdgeNote(
        wall.axis,
        wall.edge,
        wall.axis === 'scale' ? best.scale.toFixed(3) : `${best.rotationDeg.toFixed(1)}°`,
        wall.window,
      ),
    );
    base.refusal = {
      reason: 'no-match',
      detail:
        `${name}: the best placement found has residual ${best.residual.toFixed(4)}, above --max-residual ${maxResidual}` +
        (edges.length === 0 ? '' : `; ${edges.join('; ')}`),
    };
    base.notes.push(
      `${name} matches nowhere in this frame well enough to report. The best placement found is still in ` +
        '`placement` — a refusal names why not to trust it, it does not hide it.',
    );
    if (edges.length > 0) {
      base.notes.push(
        `${name}'s best placement sits on a wall of the search window, so the window is the first thing to move: ` +
          `${edges.join('; ')}.`,
      );
    }
  } else if (base.walls.length > 0) {
    // ⭐ And an ACCEPTED placement on a wall says so too (issue #737), which
    // #719 had declined on the grounds that a window chosen to bracket the
    // answer puts correct placements near its edges. Near, measured, is not on:
    // the refinement is clamped, so a value held by a wall IS the bound, while
    // correct placements that settled inside stopped short of their wall by at
    // least the polish's last step. The mark is on the placements whose number
    // is the window's rather than the picture's, and not on the ones a
    // well-chosen window merely brackets closely.
    //
    // ⚠️ It names the wall and nothing more — not "the truth may lie beyond",
    // which a refusal says. Measured on the rendered corpus under a window
    // bracketing every truth, the floor held parts shrunk into their own region
    // whose truth was inside the window, so which side the truth is on is the one
    // thing an accepted placement on a wall does not know.
    base.notes.push(
      `${name} was accepted, but its placement stopped ON a wall of the search window rather than settling inside ` +
        'it, so that value is where the search was held and not where it came to rest: ' +
        `${base.walls.map((wall) => wallClause(wall.axis, wall.edge, wall.window)).join('; ')}.`,
    );
  }
  // ⭐ Which of the two readings a refusal or an ambiguity is (issue #857),
  // in the refusal's own detail and in a note, from the figures `legibility`
  // already carries. After the walls on purpose: a wall is the first thing to
  // move, and this sentence is about what moving it cannot change.
  if (base.refusal !== null || base.ambiguous) {
    const verdict = base.refusal !== null ? 'refused' : 'ambiguous';
    // The whole margin rather than the alternates kept, so a repeat is not
    // read off a list `MAX_ALTERNATES` truncated.
    const repeat =
      verdict === 'ambiguous'
        ? repeatedPlaces(
            best,
            close.map((d) => d.placement),
            span * best.scale,
          )
        : null;
    const reading = legibilityReading(base.legibility, verdict, repeat);
    base.legibility.reading = reading;
    if (base.refusal !== null) base.refusal.detail += `; ${reading}`;
    base.notes.push(`${name}: ${reading}.`);
  }
  if (best.unexplained > 0.25 && best.residual <= maxResidual) {
    base.notes.push(
      `${roundTo(best.unexplained * 100, 1)}% of ${name}'s material disagrees with the frame at this placement. ` +
        'Another part drawn over it is the usual reason; the placement can be right and the residual still high.',
    );
  }
  if (best.offCanvas > 0.01) {
    base.notes.push(`${roundTo(best.offCanvas * 100, 1)}% of ${name}'s material falls outside the frame canvas at this placement.`);
  }
  return base;
}

// ---------------------------------------------------------------------------
// the console report
// ---------------------------------------------------------------------------

/**
 * One placement as the console prints it, with the wall each value stands on
 * written beside that value (issue #737) — `scale=2.000 (the ceiling of --scale
 * 0.5,2)` — so the number and the fact that the window chose it are read
 * together. Only an accepted part's own placement is passed walls: a refusal
 * already prints the whole sentence on the line below it.
 */
function placementLine(p: PosePlacement, walls: readonly PoseWall[] = []): string {
  const beside = (axis: PoseWall['axis']): string =>
    walls
      .filter((wall) => wall.axis === axis)
      .map((wall) => ` (${wallClause(wall.axis, wall.edge, wall.window)})`)
      .join('');
  return (
    `x=${p.x.toFixed(1).padStart(7)}  y=${p.y.toFixed(1).padStart(7)}  rot=${p.rotationDeg.toFixed(1).padStart(7)}°${beside('rotation')}  ` +
    `scale=${p.scale.toFixed(3)}${beside('scale')}  residual=${p.residual.toFixed(4)}  unexplained=${(p.unexplained * 100).toFixed(0).padStart(3)}%`
  );
}

export function poseLines(report: PoseReport): string[] {
  const bg = report.frame.background;
  const bgText =
    bg.kind === 'colour' && bg.colour !== null
      ? `rgb(${bg.colour.join(', ')}) over ${(bg.borderShare * 100).toFixed(0)}% of the border ring`
      : bg.kind === 'transparent'
        ? `transparency over ${(bg.borderShare * 100).toFixed(0)}% of the border ring`
        : 'UNKNOWN — the border ring has no dominant colour, so every pixel counts as material and the silhouette ' +
          'signal is gone; residuals here are colour agreement only';
  const lines = [
    `  ..    frame   ${report.frame.path}  (${report.frame.width}x${report.frame.height})`,
    `  ..    ground  ${bgText}`,
    `  ..    parts   ${report.images}  (${report.parts.length} png)`,
    `  ..    search  scale ${report.search.scale.min}–${report.search.scale.max} in ${report.search.scale.steps} step(s) · ` +
      // The step is the ladder's own rather than the constant it was capped at.
      // Printing the constant here is what issue #719 was: a line that said
      // `step 15°` over a window ten degrees wide, which no run had ever walked.
      `${searchRotationClause(report.search.rotation)} · ` +
      `refuse above residual ${report.search.maxResidual}`,
  ];
  const width = Math.max(8, ...report.parts.map((p) => p.part.length));
  for (const part of report.parts) {
    const label = part.part.padEnd(width);
    if (part.placement === null) {
      lines.push(`  REFUSE ${label}  ${part.refusal?.reason ?? 'unplaced'}: ${part.refusal?.detail ?? ''}`);
      continue;
    }
    const tag = part.refusal !== null ? 'REFUSE' : part.ambiguous ? 'AMBIG ' : 'PLACE ';
    lines.push(`  ${tag} ${label}  ${placementLine(part.placement, part.refusal === null ? part.walls : [])}`);
    if (part.coarse !== null) {
      lines.push(
        `         ${' '.repeat(width)}  found on a ${part.coarse.cols}x${part.coarse.rows} anchor grid, ` +
          `step ${part.coarse.stride} at ${part.coarse.reduction}x reduction`,
      );
    }
    if (part.rotationFree) lines.push(`         ${' '.repeat(width)}  rotation is a FREE degree of freedom — the 0° above is a placeholder`);
    part.alternates.forEach((alt, i) => {
      lines.push(`         ${' '.repeat(width)}  alt ${i + 2}: ${placementLine(alt)}`);
    });
    if (part.refusal !== null) lines.push(`         ${' '.repeat(width)}  ${part.refusal.reason}: ${part.refusal.detail}`);
    else if (part.legibility?.reading) lines.push(`         ${' '.repeat(width)}  ambiguous: ${part.legibility.reading}`);
  }
  lines.push('');
  lines.push('  ..    residuals are a trust signal, not a score — nothing here has a pass bar.');
  lines.push('  ..    they degrade under occlusion: a high `unexplained` on a plausible placement usually means');
  lines.push('  ..    the part is drawn behind something, not that it is in the wrong place.');
  return lines;
}
