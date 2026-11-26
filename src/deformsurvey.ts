/**
 * The deform survey, with nothing of the runtime in it (issue #1025, cut 4c-3
 * of step 4c of #380): every measurement `src/deformmeasure.ts`'s header
 * describes, the interface its two posers stand behind, the core's poser, and
 * the survey off a model document alone (`surveyOfModel`).
 *
 * ⭐ **Why the survey is its own module.** `A39_DEFORM_KEEPS_TRIANGLE_WINDING`
 * is written once, against the survey as a fact (`src/assertions/bodies/a39.ts`),
 * and its model-side supplier has to reach the survey without reaching
 * spine-core — the condition under which the model side can load at all, held
 * by the selftest's `VF01` over every module `src/assertions/` reaches by value.
 * The survey was always two halves behind one seam (#969): the arithmetic and
 * the interface, which name no runtime class, and spine-core's reader and
 * poser, which are nothing else. This file is the first half, moved out of
 * `src/deformmeasure.ts` unchanged — every statement byte for byte, the ones a
 * caller there reads now exported, and the two comment lines that said where
 * spine-core's half is now saying it — and that file keeps the second half and
 * re-exports every name it exported before, so no caller changed an import.
 *
 * What a survey measures and why is `src/deformmeasure.ts`'s header; it is not
 * restated here.
 *
 * Links nothing from the runtime, directly or through what it imports.
 */
import { CoreInputError, underSkin, type CompiledDocument } from './core/index.ts';
import { float32Rows, meshWorld, poseDial as corePoseDial, poseDialCombination, poseJump, recordIdentity, sliderRecordOf, slotDraw, type CoreSurveyPose } from './core/hooks.ts';
import { modelStructure, type SurveyAnimation, type SurveyDeformTimeline, type SurveyMesh, type SurveySkin, type SurveySlider, type SurveyStructure } from './deformstructure.ts';
import { areaBand, DEFORM_AREA_EPSILON, float32AreaNoise, stretchSingularValues, triangleAreas } from './areaband.ts';
import { hypot2 } from './numeric.ts';
import type { DeformSliderCombination } from './types.ts';

// The area band lives in `src/areaband.ts` (moved unchanged, issue #1224) so the
// geometry entry can read it without reaching the compiler, and
// `stretchSingularValues` joined it (moved unchanged, issue #1230) so the motion
// comparison can too; every name this module exported before is exported from
// here still.
export { DEFORM_AREA_EPSILON, float32AreaNoise, stretchSingularValues, triangleAreas };

/** A quantity's worst triangle on one key, and which triangle it was. */
export interface DeformExtreme {
  triangle: number;
  value: number;
}

/** One reversed triangle, with everything A39's message names about it. */
export interface DeformReversal {
  triangle: number;
  ids: [number, number, number];
  before: number;
  after: number;
}

/**
 * What the slot is doing with this mesh at one key's own time (issue #401).
 *
 * ⭐ Read off the SAME posed skeleton the geometry came from, one key at a time,
 * so the two halves cannot disagree about which frame they describe.
 */
export interface DeformKeyDraw {
  /** The attachment the slot shows at that time, or `null` when it shows none. */
  shown: string | null;
  /**
   * Whether `shown` IS this timeline's mesh — compared the way spine-core
   * compares it (`Attachment.timelineAttachment`), so a linked mesh counts as
   * the mesh it links to. When this is false the runtime applies no deform to
   * this slot at all (`DeformTimeline.applyToSlot` returns early), which is why
   * the geometry below is the cleared pose and says nothing about the key.
   */
  showsThisMesh: boolean;
  /**
   * `slot.color.a × attachment.color.a` at that time — the product
   * [`src/render.ts`](src/render.ts) tints a piece with, which is what decides
   * whether a texel lands. 0 when the slot shows something else, because then
   * none of this mesh is drawn.
   */
  alpha: number;
  /**
   * The skin the skeleton was **wearing** when all of the above was read, off
   * `Skeleton.skin` itself — the skin that holds this timeline's attachment
   * (issue #583) — or `null` when it wore none.
   *
   * ⭐ Read off the posed skeleton rather than passed in beside it, so it cannot
   * disagree with what was actually set. It is what makes `blank` a statement
   * about a pose instead of a verdict on the rig: "the slot shows nothing" and
   * "the slot shows nothing in the dress this mesh lives in" are different
   * claims, and only the second is measurable.
   */
  under: string | null;
  /**
   * Why this mesh puts no pixels on the screen at that time, in the words the
   * `DEFORM` block and A39's stats line both print — or `null` when it puts some
   * there and every figure below is gated normally.
   *
   * ⚠️ The bar is **exactly** 0 and nothing above it. At alpha 0.5 a reversed
   * triangle is plainly visible at half strength, and a floor above 0 would be
   * this repository picking a visibility policy, which is the thing an archetype
   * rule exists not to do.
   */
  blank: string | null;
}

/**
 * How an animation is reached, which is the frame its keys are posed in (#407).
 *
 * ⭐ One per way in. An animation nothing applies has exactly one — the track —
 * and an animation two sliders apply has two, both measured, because a fold only
 * one dial can reach is still a fold.
 */
export interface DeformReach {
  /** `track` — played on track 0; `slider` — applied by the named constraint. */
  kind: 'track' | 'slider';
  /** The slider that applies it, or `null` on the track. */
  slider: string | null;
  /** The slider's driving bone. `null` on the track, and on a bone-less slider. */
  bone: string | null;
  /**
   * The transform property the slider reads off that bone, as a rig spec spells
   * it (`rotate`, `x`, `y`, `scaleX`, …), or `null` when there is no bone.
   *
   * 🚨 Off the **artifact** since issue #419 — spine-core's own `FromProperty`
   * subclass, which is what the parser built out of the rig spec's `property`
   * field. It used to be whichever local field the probe below found first, and
   * float noise makes `rotation` move a world `sqrt(a² + c²)` reading, so every
   * world `scaleX` / `scaleY` / `shearY` slider was reported as `rotate`.
   */
  property: string | null;
  /**
   * The bone field the solve actually drives, when that is **not** the one
   * `property` names; `null` when they are the same, which is every rig that has
   * a plain parent.
   *
   * They come apart under `local: false`, where the reader goes through the world
   * transform: a `FromX` slider on a bone whose parent is at 90° reads a world x
   * that local `x` does not move at all and local `y` moves entirely.
   */
  drive: string | null;
  /** `SliderData.local` — whether the property is read local or world. */
  local: boolean;
  /** The clause the `DEFORM` block and A39's stats line print. */
  label: string;
}

/** The span of one animation's own `0..duration` a dial can select, in seconds. */
export interface DialSpan {
  lo: number;
  hi: number;
}

/**
 * A dial whose probe **tied** and whose artifact broke the tie (issue #419).
 *
 * 🔒 **Not a disagreement, and it must never be reported as one.** There is one
 * belief here, not two: the probe measured two fields moving the reading by the
 * same amount, named neither, and the skeleton's own reader said which of them
 * the author wrote. A `FromX` slider under `local: false` on a bone whose parent
 * is at 45° is exactly that, and it is legitimate geometry. So there is no second
 * answer, no second reach and nothing to compare — which is why this is a type of
 * its own and not a `verdict` field on the one below.
 */
export interface DeformDialTie {
  /** The slider whose dial this is. */
  slider: string;
  /** Its driving bone. */
  bone: string;
  /** The field the artifact named, which is therefore the one the survey drives. */
  drive: string;
  /** What one step of it moved the reading by. */
  driveResponse: number;
  /** The other fields inside `DIAL_PROBE_MARGIN` of it, and what each moved it by. */
  rivals: Array<{ field: string; response: number }>;
}

/**
 * A dial the artifact and the probe name **differently**, with the span each of
 * their answers can select (issues #419, #427).
 *
 * ⭐ Structured, and on the survey rather than only inside `DeformReach.label`,
 * because that label is prose only `explain` prints. A `build`-only run is the
 * loop an agent that cannot see the rig actually runs, and until this existed the
 * fact that rigc's two halves disagreed about which dial was turned reached that
 * run not at all.
 *
 * 🚨 **What the two reaches settle.** The property's name is not what makes this
 * survey trustworthy — the set of frames it poses is. So both answers are turned
 * into the span of the animation each can select, and `outside` is the part of
 * what was posed that the artifact's answer could not have reached. Measured
 * (issue #427): under a disagreement `driveReach` **always contains**
 * `statedReach`, because the driven field is the largest response the probe found
 * and a disagreement needs it to clear the artifact's field by
 * `DIAL_PROBE_MARGIN`. So the survey never poses fewer frames than the artifact's
 * answer would have, and `outside` is what the artifact's answer would have
 * MISSED — never what this one invented.
 */
export interface DeformDialDispute {
  /** The slider whose dial this is. */
  slider: string;
  /** Its driving bone. */
  bone: string;
  /**
   * The field the artifact names, rig-spec spelled — or the reader's class name
   * when it is one this file does not know.
   */
  stated: string;
  /** What one step of the artifact's field moves the reading by. */
  statedResponse: number | null;
  /**
   * The part of the animation's own `0..duration` the artifact's field can
   * select, or `null` when it can select none of it — and on the one reader
   * this file cannot name, where there is no field to probe.
   */
  statedReach: DialSpan | null;
  /** The field the survey drives, which is the one that measurably moves the reading. */
  drive: string;
  /** What one step of THAT moves the reading by. */
  driveResponse: number;
  /** The part of `0..duration` the drive can select, or `null` when it can select none. */
  driveReach: DialSpan | null;
  /**
   * The deform key times this survey posed through `drive` that no settable value
   * of the artifact's field reaches, in ascending order.
   *
   * ⭐ Empty is a **reading**, not an absence: it says both answers pose the same
   * frames, so the disagreement changed nothing about what was measured. A39
   * prints `outside:none` for it rather than omitting the field, because a
   * comparison that was made and came out equal must not look like one nobody
   * made.
   */
  outside: number[];
}

/** The reach every animation has when no slider applies it. */
const TRACK_REACH: DeformReach = {
  kind: 'track',
  slider: null,
  bone: null,
  property: null,
  drive: null,
  local: false,
  label: 'played on a track',
};

/**
 * What the slider's dial had to be set to for this key's time to be the one the
 * runtime applies — and whether it worked (issue #407).
 *
 * `null` on a track frame, where there is no dial and the time is the time.
 */
export interface DeformDial {
  /**
   * The property value the mapping inversion asks for.
   *
   * `Slider.update` computes `time = offset + (value − property.offset) · scale`
   * — `to`, `from` and `scale` in a rig spec — so this is that line solved for
   * `value`: `property.offset + (time − offset) / scale`. On a bone-less slider
   * the "value" IS the time and this is the time.
   */
  value: number;
  /**
   * What the driving bone's own LOCAL field was set to so that spine-core's
   * reader returns `value`. The same number under `local: true`, where the
   * reader is `source.rotation` and nothing intervenes; a different one under
   * `local: false`, where the reader goes through the world transform.
   */
  driven: number;
  /**
   * The drive the mapping asked for when it was past `DIAL_DRIVE_LIMIT` and the
   * bone was therefore stopped at the bound instead — `null` on every dial that
   * stayed inside it, which is every correct rig (issue #419).
   *
   * 🚨 The runaway made visible. Before #419 a world scale slider was solved
   * through `rotation`, whose response to it is float noise, and the drive ran to
   * 4.9e9 with nothing saying so. Now the ask is carried here, the bone is not
   * posed there, and the key is reported unreachable naming both numbers.
   */
  beyondLimit: number | null;
  /** `SliderPose.time` the runtime then computed, read off the posed skeleton. */
  applied: number;
  /** What `Slider.update` would have stored for this key's own time. */
  wanted: number;
  /**
   * `applied` is not `wanted`: **no dial value selects this key's time.**
   *
   * The reachable one, and it is not hypothetical: `FromRotate.value` ends
   * `if (value < 0) value += 360` over an `atan2`, so `[0, 360)` is the whole of
   * what a `rotate` slider reading a WORLD rotation can be driven to, and
   * everything the inversion asks for outside it arrives 360° away — below 0°
   * (issue #405) and at or above 360° (issue #417) alike. `Math.max(0, time)` is
   * the other.
   *
   * ⚠️ A key like that is measured — at the frame the runtime does land on, which
   * the report names — and then left OUT of the gate's counts, because the
   * geometry there belongs to some other time. Never silent: A39 puts it on the
   * stats line and the `DEFORM` block gives it a line of its own.
   */
  unreachable: boolean;
}

/**
 * What one deform timeline is doing to one attachment's geometry at **one posed
 * time**, whatever that time is.
 *
 * ⭐ A key and a between-keys probe (issue #403) are the same measurement taken
 * at two kinds of time, so they are one interface and one function
 * (`measurePosed`). Giving the span scan its own arithmetic would be the second
 * derivation this file's opening paragraph exists to forbid — the count A39
 * refuses on between two keys has to be the count it refuses on at one.
 */
export interface DeformFrameMeasure {
  /** Vertices in the attachment. */
  vertices: number;
  /**
   * How many of them this key moves at all, and the largest world displacement.
   *
   * `moved` counts an exact difference rather than one past an epsilon, and can:
   * both sides come off the same `computeWorldVertices` call with the same bones,
   * so a vertex the key does not touch is bit-identical on the two.
   */
  moved: number;
  maxDisplacement: number;
  maxDisplacementVertex: number;
  /** Triangles compared. `reversed` and `collapsed` are A39's own two counts. */
  triangles: number;
  reversed: DeformReversal[];
  collapsed: number;
  /** Triangles with no area at the cleared pose: no winding, no ratio, no stretch. */
  degenerate: number;
  /**
   * `after / before`, signed. **A negative ratio IS a reversal** — the sign is
   * the same fact `reversed` counts, which is why the two can never disagree.
   */
  areaRatioMin: DeformExtreme | null;
  areaRatioMax: DeformExtreme | null;
  /** Worst stretch and worst squash, over the triangles that have a map. */
  stretchMax: DeformExtreme | null;
  stretchMin: DeformExtreme | null;
  /** The dead band every count above was taken against, in px². */
  band: number;
  /** What the slot draws of this mesh at this time (issue #401). */
  draw: DeformKeyDraw;
  /** How the animation was reached, which is the frame this was posed in (#407). */
  reach: DeformReach;
  /** The dial that selected this time, or `null` on a track frame (#407). */
  dial: DeformDial | null;
}

/** What one deform key does to one attachment's geometry. */
export interface DeformKeyMeasure extends DeformFrameMeasure {
  animation: string;
  skin: string;
  slot: string;
  /** The attachment the timeline resolved to — the name A39's message carries. */
  attachment: string;
  /** The placeholder it sits behind in `skin`, which is what the spec wrote. */
  placeholder: string;
  /** Index into the timeline's own frames, which is the index A39's message names. */
  key: number;
  time: number;
}

/**
 * How the runtime gets from one deform key's geometry to the next one's.
 *
 * The three the format has, and what each does to the span scan below:
 *
 * - `linear` — the interpolation fraction sweeps `[0, 1]` affinely in time, so a
 *   fraction the closed form names converts to a time exactly;
 * - `stepped` — the fraction is **0 for the whole span**: the runtime does not
 *   interpolate, it holds the earlier key's geometry. So the span introduces no
 *   geometry the key survey has not already measured — but it holds that
 *   geometry across times whose *alpha* differs from the key's, which is the
 *   same hole in another coat and is checked (`DW15`);
 * - `bezier` — the fraction is the stored curve, which spine-core evaluates as a
 *   **polyline** of ten points (`DeformTimeline.getCurvePercent`). The scan reads
 *   that polyline rather than the cubic, so it is exact about the thing the
 *   runtime actually does, overshoot past 0 or 1 included.
 */
export type DeformSpanCurve = 'linear' | 'stepped' | 'bezier';

/**
 * The interval between two consecutive deform keys, scanned (issue #403).
 *
 * ⚠️ A span is recorded whether or not anything was found, because "the scan ran
 * and said nothing" and "the scan did not run" are the two things a gate must
 * never print the same way.
 */
export interface DeformSpan {
  animation: string;
  skin: string;
  slot: string;
  attachment: string;
  placeholder: string;
  /** The frame its two keys were posed in, which is the frame it probes (#407). */
  reach: DeformReach;
  /** The two keys it lies between, by the index A39's own message uses. */
  fromKey: number;
  toKey: number;
  fromTime: number;
  toTime: number;
  curve: DeformSpanCurve;
  /** Triangles the closed form says reverse somewhere strictly inside the span. */
  predicted: number;
  /**
   * Times the closed form named and the scan then measured at, in probe order.
   * **Empty is the ordinary case** — a span nothing is predicted to fold in
   * costs no posed measurement at all.
   */
  probed: number[];
  /** The probe that found a reversal on a frame the mesh DRAWS, or `null`. */
  fold: { time: number; percent: number; measure: DeformFrameMeasure } | null;
  /**
   * Probes that found the predicted reversal at a time the mesh draws no pixels
   * — issue #401's exemption, applied at a time no key lands on, which is what
   * keeps this from refusing a rig that fades out *before* the fold.
   */
  notDrawn: number;
  /**
   * The closed form predicted a fold and no probe reproduced one.
   *
   * Not a failure — refusing on a prediction nothing measured would be the false
   * red this repository has paid for twice (issues #44, #262) — and not a
   * silence either: it is on A39's stats line, because the one case that reaches
   * it is a weighted mesh whose BONES move across the span, and that is a limit
   * a reader has to be able to see.
   */
  unconfirmed: boolean;
}

/** Every deform key in a skeleton, measured — and what was passed over. */
export interface DeformSurvey {
  keys: DeformKeyMeasure[];
  /** Deform timelines seen, whether or not any of them could be measured. */
  timelines: number;
  /** Slots the caller's `exempt` set held, quoted. */
  exempted: string[];
  /** Slots whose attachment has a vertex array and no triangles, quoted. */
  notAMesh: string[];
  /**
   * Triangle samples across every key that draws — one mesh's triangles counted
   * once per key. ⚠️ A key whose `draw.blank` is set is NOT in this figure: it
   * is the sample the gate ran, and the gate does not run on those.
   */
  trianglesMeasured: number;
  /** Triangles pinched onto zero, summed over the same keys. A real idiom, never a bar. */
  collapsed: number;
  /**
   * Keys in `keys` whose `draw.blank` is set — measured, then passed over
   * because the mesh draws no pixels at that time (issue #401).
   *
   * ⚠️ Carried rather than left implicit because an exemption nobody can see is
   * how a gate comes to look kept while checking nothing. Both consumers print
   * it: A39 on its stats line, the `DEFORM` block per key and in its rollup.
   */
  notDrawn: number;
  /** Reversed triangles found on those keys, which nothing gates. */
  notDrawnReversed: number;
  /**
   * Keys whose `dial.unreachable` is set — no value of the slider's driving bone
   * selects that key's time, so the frame posed is not the key's (issue #407).
   *
   * ⚠️ Out of `trianglesMeasured` for the same reason `notDrawn` is: those totals
   * are what the gate ran on, and the gate does not run on these.
   */
  notReachable: number;
  /** Reversed triangles found on those keys, which nothing gates. */
  notReachableReversed: number;
  /**
   * Spans not scanned because one of the two keys bounding them is unreachable.
   *
   * A scan that did not run and a scan that found nothing must never print the
   * same way, and the span list only holds the ones that ran.
   */
  spansNotScanned: number;
  /**
   * Every interval between two consecutive keys, scanned (issue #403).
   *
   * One entry per consecutive pair per timeline, including the pairs where
   * nothing was predicted — a scan that ran and found nothing has to be
   * distinguishable from a scan that never ran.
   */
  spans: DeformSpan[];
  /** Spans whose predicted fold was measured at a time the mesh draws. */
  spanFolds: number;
  /** Spans whose predicted fold landed only where the mesh draws nothing. */
  spansNotDrawn: number;
  /** Spans that predicted a fold no probe reproduced. See `DeformSpan.unconfirmed`. */
  spansUnconfirmed: number;
  /**
   * Extra posed measurements the span scan took — **the cost figure**, and 0 on
   * a rig the closed form flags nothing in, which is every green rig. `CUR`-style
   * accounting rather than a timing: a wall clock in a gate is not reproducible
   * and this is (`DW16`).
   */
  spanProbes: number;
  /**
   * Dials whose probe tied and whose artifact broke the tie, in the skeleton's
   * own constraint order (issue #419). Empty on every rig where it did not.
   */
  dialTies: DeformDialTie[];
  /**
   * Dials the artifact and the probe name differently, in the same order, each
   * carrying both answers, both reaches and the frames the artifact's answer
   * could not have posed (issues #419, #427).
   */
  dialDisputes: DeformDialDispute[];
  /**
   * Which poser the survey posed through, and why when it is not the one
   * asked for (issue #969): `model` — rigc's own core over the model document;
   * `spine-core` — the runtime over the Spine skeleton. Every other field is
   * the same survey whichever it was; `tools/survey_hashes.ts` holds that.
   */
  source: DeformSurveyRecord;
}

/** The survey's record of its poser (`DeformSurvey.source`). */
export interface DeformSurveyRecord {
  used: DeformSurveySource;
  why: string | null;
}

/**
 * Why no dial value selects this key's time, in the one sentence A39's stats
 * line, its SKIP reason and the `DEFORM` block all print (issue #407).
 *
 * ⭐ One sentence, three readers, for the reason the whole of this file is one
 * survey: a report and a gate that describe the same key differently are two
 * derivations, and the one that drifts is the one nobody exits non-zero on.
 * Empty on a key that IS reachable, so a caller cannot print it by accident.
 */
export function unreachableWhy(key: DeformKeyMeasure): string {
  const dial = key.dial;
  if (dial === null || !dial.unreachable) return '';
  const driven =
    key.reach.bone === null
      ? `slider "${key.reach.slider}"'s own time`
      : `${key.reach.bone}.${key.reach.property} (${key.reach.local ? 'local' : 'world'})`;
  // 🚨 The runaway, named with both numbers instead of printed as a dial (issue
  // #419). This comes first because it is a different fact from the one below: the
  // bone was never put where the mapping asked, so what the runtime applied is the
  // clamp's time and says nothing about whether the key is otherwise reachable.
  if (dial.beyondLimit !== null) {
    const field = key.reach.drive ?? key.reach.property;
    return (
      `the dial for t=${key.time}s is out of bounds: slider "${key.reach.slider}" maps that time back to ` +
      `${dial.value.toFixed(6)}, which needs ${key.reach.bone}.${field} at ${dial.beyondLimit.toExponential(4)} — ` +
      `past the ±${DIAL_DRIVE_LIMIT} this solve will drive a bone field to. Past 2^24 a float32 no longer holds ` +
      'two consecutive integers apart, so a figure up there is not a value anybody can set and read back. The ' +
      'bone was left at its setup value rather than driven there, so what was posed is the setup frame and not ' +
      `the one that mapping names — the runtime applied ${dial.applied.toFixed(6)}s against the ` +
      `${dial.wanted.toFixed(6)}s wanted`
    );
  }
  // The one reader that cannot produce a value it is asked for, named where an
  // author will meet it: a WORLD rotation is an `atan2` ending in
  // `if (value < 0) value += 360`, so **[0, 360) is the whole of its range** and
  // `"local": true` is the fix (issue #405).
  //
  // ⚠️ Both ends, not just the low one — a range running past 360° dies in
  // exactly the way one dipping below 0° does. The compiler refuses both since
  // issue #417 (it refused only the low end when #405 landed), so a rig spec in
  // this repository cannot ask for either. This clause is still not redundant:
  // an artifact reaching the gate from the editor, a hand edit or an older rigc
  // can carry a dead range, and the artifact is what this file reads.
  const wrap =
    key.reach.property === 'rotate' && !key.reach.local && (dial.value < 0 || dial.value >= 360)
      ? '. A world rotation is read through `FromRotate.value`, an `atan2` ending `if (value < 0) value += 360`, ' +
        'so its whole range is [0, 360) and a driving value outside that is one the runtime never produces — ' +
        '`"local": true` on the slider reads the bone\'s own rotation signed and unwrapped'
      : '';
  return (
    `no value of ${driven} selects t=${key.time}s: slider "${key.reach.slider}" maps that time back to ` +
    `${dial.value.toFixed(6)}, and driven there the runtime applies the animation at ${dial.applied.toFixed(6)}s ` +
    `rather than ${dial.wanted.toFixed(6)}s${wrap}`
  );
}

/**
 * The survey through one reader and one poser (issues #969, #1019):
 * `surveyDeformKeys`' whole body, with the skeleton's structure — its
 * timelines, keys, curves, sliders and skins — read through `structure`
 * (`./deformstructure.ts`), and every pose taken through `poser`. The two come
 * in pairs: spine-core's reading of the Spine skeleton with spine-core's
 * poses, or the model document's with the core's.
 */
export function surveyWith(structure: SurveyStructure, exempt: ReadonlySet<string>, poser: SurveyPoser): Omit<DeformSurvey, 'source'> {
  const keys: DeformKeyMeasure[] = [];
  const spans: DeformSpan[] = [];
  const exempted = new Set<string>();
  const notAMesh = new Set<string>();
  let timelines = 0;
  let trianglesMeasured = 0;
  let collapsedTotal = 0;
  let notDrawn = 0;
  let notDrawnReversed = 0;
  let notReachable = 0;
  let notReachableReversed = 0;
  let spansNotScanned = 0;
  const dialTies: DeformDialTie[] = [];
  const dialDisputes: DeformDialDispute[] = [];
  /**
   * `reachesOf` under one skin, computed once per skin the survey reaches.
   *
   * ⚠️ Keyed on the skin's HANDLE, which is what `placementOf` recovered — one
   * per skin, whichever reader made it. A map keyed on the name would fold two
   * same-named skins into one entry and hand the second one the first's plans
   * (#583).
   */
  const reachCache = new Map<SurveySkin | null, Map<string, Array<DialPlan | null>>>();
  const reachesUnder = (skin: SurveySkin | null): Map<string, Array<DialPlan | null>> => {
    const already = reachCache.get(skin);
    if (already !== undefined) return already;
    const built = reachesOf(structure, skin, poser);
    reachCache.set(skin, built);
    return built;
  };
  /**
   * Sliders whose tie or dispute is already in the rollup, by name.
   *
   * A slider used to be planned once per animation and therefore reported once.
   * It is now planned once per (animation, skin) — so the guard keeps the rollup
   * at one line per slider, and it loses nothing: a slider the skins do not
   * touch (`skinRequired` false, and a driving bone that is active under every
   * skin) probes identically under all of them, and one they do touch is
   * `active` under exactly the one skin that lists it, because a rig spec is
   * refused for putting a constraint or a bone in two skins.
   */
  const dialsReported = new Set<string>();
  for (const anim of structure.animations) {
    /**
     * What each of this animation's deform timelines is, and which skin holds
     * its attachment — settled in one pass, BEFORE the frames loop (issue #583).
     *
     * 🚨 Once per timeline, not once per (timeline, skin, way-in). `timelines`,
     * `notAMesh` and `exempted` are counts of the animation's own contents, and
     * a skeleton with meshes in two skins would report each of them twice if the
     * tally sat inside the loops below.
     */
    const placed: Array<{
      timeline: SurveyDeformTimeline;
      attachment: SurveyMesh;
      triangles: ArrayLike<number>;
      slotName: string;
      placement: ReturnType<SurveyDeformTimeline['placement']>;
    }> = [];
    for (const timeline of anim.deforms) {
      timelines++;
      const attachment = timeline.mesh;
      const slotName = structure.slotName(timeline.slotIndex);
      // A bounding box, a clipping polygon and a path all have a vertex array
      // and NO triangles, so they have no winding to keep and no area to take a
      // ratio of. Saying nothing about them beats inventing a measurement.
      if (attachment === null) {
        notAMesh.add(`"${slotName}"`);
        continue;
      }
      if (exempt.has(slotName)) {
        exempted.add(`"${slotName}"`);
        continue;
      }
      const triangles = attachment.triangles;
      if (!triangles || triangles.length < 3) continue; // A04 owns a mesh with no triangles
      placed.push({
        timeline,
        attachment,
        triangles,
        slotName,
        placement: timeline.placement(),
      });
    }
    if (placed.length === 0) continue;
    // One pass per skin the animation's meshes live in, in the order its
    // timelines name them. Every rig rigc compiles today has exactly one, and
    // then this loop runs once and the keys come out in timeline order as they
    // always have.
    for (const skin of new Set(placed.map((p) => p.placement.holder))) {
      // One pass per way in (issue #407). The animations nothing applies get the
      // single track pass this loop has always been.
      for (const dials of reachesUnder(skin).get(anim.name) ?? [null]) {
        const poseFrame = (time: number): PoseOfFrame =>
          dials === null
            ? { posed: poser.track(skin, anim.name, time), dial: null }
            : poseDial(poser, skin, dials, time);
        const reach = dials === null ? TRACK_REACH : dials.reach;
        /**
         * The key times this plan actually **reached**, for the reach comparison
         * below (#427).
         *
         * ⚠️ A key the drive itself could not select is not in here. It is already
         * named on the stats line as `deformKeysUnreachable`, with the ask and the
         * bound, and the artifact's answer cannot reach it either — so listing it
         * as something the artifact's answer missed would count one defect twice
         * and inflate a disagreement with a frame the disagreement did not cost.
         */
        const posedTimes = new Set<number>();
        for (const { timeline, attachment, triangles, slotName, placement } of placed) {
          // Measured in the dress the format keys this timeline on, and only
          // there: a mesh in another skin is another skin's pose (issue #583).
          if (placement.holder !== skin) continue;
          const named = {
            animation: anim.name,
            skin: placement.skin,
            slot: slotName,
            attachment: attachment.name,
            placeholder: placement.placeholder,
          };
          /** The previous key's posed frame, kept so the span between them can be scanned. */
          let previous: PosedFrame | null = null;
          for (let frame = 0; frame < timeline.frames.length; frame++) {
            const time = timeline.frames[frame];
            const at = poseFrame(time);
            const frameMeasure = measurePosed(at.posed, time, timeline.slotIndex, attachment, triangles, reach, at.dial);
            // A key that draws no pixels — or one at a time no dial can select —
            // is measured and then left out of the totals, because those totals
            // are "what the gate ran on": A39 reads them onto its stats line and
            // the report's rollup has to match them.
            if (at.dial?.unreachable === true) {
              notReachable++;
              notReachableReversed += frameMeasure.measure.reversed.length;
            } else if (frameMeasure.measure.draw.blank === null) {
              trianglesMeasured += frameMeasure.measure.triangles;
              collapsedTotal += frameMeasure.measure.collapsed;
            } else {
              notDrawn++;
              notDrawnReversed += frameMeasure.measure.reversed.length;
            }
            keys.push({ ...named, key: frame, time, ...frameMeasure.measure });
            if (at.dial?.unreachable !== true) posedTimes.add(time);
            if (previous !== null) {
              // ⚠️ A span whose end is a frame the runtime cannot reach has no
              // interpolation to scan: the anchors it would solve the quadratic
              // over are two poses of some other time. Counted, never silent.
              if (at.dial?.unreachable === true || previous.measure.dial?.unreachable === true) {
                spansNotScanned++;
              } else {
                spans.push(
                  scanDeformSpan(
                    anim,
                    timeline,
                    attachment,
                    triangles,
                    named,
                    frame - 1,
                    previous,
                    frameMeasure,
                    poseFrame,
                  ),
                );
              }
            }
            previous = frameMeasure;
          }
        }
        // --- what the artifact's own answer could NOT have posed (issue #427) ---
        //
        // ⭐ Posed, not predicted. The survey builds a second plan out of the field
        // the SKELETON names and runs it through the same `poseDial` every real
        // frame goes through, so each entry is spine-core saying "no settable value
        // of this field lands me on that time" rather than this file inferring it
        // off an interval. Measured (#427): the list is empty whenever the two
        // answers reach the same span, and empty is the reading that says the
        // disagreement changed nothing about which frames were measured.
        //
        // 🚨 And nothing is reported at all about a dial that posed NOTHING — a
        // slider whose animation carries no deform timeline. `outside` would be
        // empty there for the one reason that must never print as agreement:
        // there were no frames to disagree about. A comparison of nothing and a
        // comparison that came out equal are the vacuous pass this file exists
        // to keep apart.
        if (posedTimes.size === 0) continue;
        // A plan is visited once per (animation, skin) — see `dialsReported` for
        // why one line per slider is the whole of it — so the two lists come out
        // in the skeleton's own constraint order.
        const alreadyReported = dials !== null && dialsReported.has(dials.slider.name);
        if (dials !== null) dialsReported.add(dials.slider.name);
        if (dials?.tie && !alreadyReported) dialTies.push(dials.tie);
        if (dials?.dispute && !alreadyReported) dialDisputes.push(dials.dispute);
        if (dials?.dispute && dials.statedMap !== null) {
          const shadow: DialPlan = {
            ...dials,
            field: dials.statedMap.field,
            u0: dials.statedMap.u0,
            v0: dials.statedMap.v0,
            u1: dials.statedMap.u1,
            v1: dials.statedMap.v1,
          };
          // ⚠️ The one time posing cannot answer: a field that moves the reading by
          // NOTHING has no map to invert, so `poseDial` divides by zero and calls
          // every time out of bounds — including the setup time, which that field
          // reaches by being left alone. The reach says which one that is, and it
          // is a single point. Nothing in spine-core 4.3 has been measured getting
          // here (a parent at exactly 90° still moves a world x reading by 2.3e-8),
          // and a report that over-stated a disagreement by one key would be the
          // false red this file has paid for twice.
          const flat = dials.statedMap.v1 === dials.statedMap.v0;
          const only = dials.dispute.statedReach;
          const outside = [...posedTimes]
            .filter((time) =>
              flat
                ? only === null || Math.abs(time - only.lo) > DIAL_TIME_EPSILON
                : poseDial(poser, skin, shadow, time).dial?.unreachable === true,
            )
            .sort((a, b) => a - b);
          dials.dispute.outside.push(...outside);
        }
      }
    }
  }
  let spanProbes = 0;
  let spanFolds = 0;
  let spansNotDrawn = 0;
  let spansUnconfirmed = 0;
  for (const span of spans) {
    spanProbes += span.probed.length;
    if (span.fold !== null) spanFolds++;
    if (span.notDrawn > 0) spansNotDrawn++;
    if (span.unconfirmed) spansUnconfirmed++;
  }
  return {
    keys,
    timelines,
    exempted: [...exempted],
    notAMesh: [...notAMesh],
    trianglesMeasured,
    collapsed: collapsedTotal,
    notDrawn,
    notDrawnReversed,
    notReachable,
    notReachableReversed,
    spans,
    spanFolds,
    spansNotDrawn,
    spansUnconfirmed,
    spansNotScanned,
    spanProbes,
    dialTies,
    dialDisputes,
  };
}

// ---------------------------------------------------------------------------
// Which frame a key is posed in — issue #407
// ---------------------------------------------------------------------------

/**
 * The six local fields of a `BonePose` a `FromProperty` can be made to read.
 *
 * In `SkeletonJson.fromProperty`'s own order, and the property name a reach
 * reports is this list's entry rather than a second table: `rotation` is spelled
 * `rotate` in a rig spec and the rest are spelled as they are here.
 */
const DIAL_FIELDS = ['rotation', 'x', 'y', 'scaleX', 'scaleY', 'shearY'] as const;
export type DialField = (typeof DIAL_FIELDS)[number];

/** The rig-spec spelling of one of those, which is the name a report prints. */
const DIAL_PROPERTY: Record<DialField, string> = {
  rotation: 'rotate',
  x: 'x',
  y: 'y',
  scaleX: 'scaleX',
  scaleY: 'scaleY',
  shearY: 'shearY',
};

/**
 * How far a field is nudged to find out whether it moves the slider's time.
 *
 * A scale is a multiplier around 1 and the others are degrees or units around 0,
 * so one step of each is a different size. The number only has to be large enough
 * that the resulting change in the property is not float noise and small enough
 * not to wrap a rotation: any value in between gives the same answer, because
 * every one of these readers is affine in its own field at a fixed parent pose.
 */
function dialStep(field: DialField): number {
  return field === 'scaleX' || field === 'scaleY' ? 0.25 : 1;
}

/**
 * How the artifact's answer and the probe's answer settled (issue #419).
 *
 * - `agreed` — one field responds decisively and it is the reader's own. Every
 *   rig in the gallery and every `local: true` slider.
 * - `settled` — the probe was **not** decisive (two or more fields within
 *   `DIAL_PROBE_MARGIN` of each other) and the reader's own field is one of them,
 *   so the artifact broke the tie. Real: a `FromX` slider under `local: false` on
 *   a bone whose parent is at 45° is driven exactly equally by local `x` and
 *   local `y`, and letting list order decide between them would be the same
 *   silent arbitrariness #419 was filed on.
 * - `disagreed` — the field that moves the reading is not the reader's own field.
 *   Also real: the same slider with the parent at 90° is moved by local `y` alone
 *   and not at all by local `x`. The probe wins the drive, because it is the one
 *   that measured something, and the disagreement is printed rather than resolved.
 */
type DialVerdict = 'agreed' | 'settled' | 'disagreed';

/** The two answers, what they were, and how they settled. */
interface DialDiscovery {
  /** The reader's own field, off the artifact. `null` on a reader not known here. */
  stated: DialField | null;
  /** What the artifact's reader is called, for a report that has to name it. */
  reader: string;
  /** The field the solve drives. Always one the probe measured a response on. */
  drive: DialField;
  /** What one step of that field moved the reading by. */
  driveResponse: number;
  /**
   * The other fields inside `DIAL_PROBE_MARGIN` of the winner — the ones that
   * stopped the probe being decisive. Empty whenever it was.
   */
  rivals: Array<{ field: DialField; response: number }>;
  /** What the reader's OWN field responded, when it is not the one driven. */
  statedResponse: number | null;
  verdict: DialVerdict;
}

/**
 * A slider whose animation is being posed, with everything the inversion needs
 * measured off the runtime rather than assumed.
 */
interface DialPlan {
  slider: SurveySlider;
  reach: DeformReach;
  /**
   * The probe's tie, when it had one — the survey collects these so a `build`
   * sees them and not only `explain` (issues #419, #427).
   */
  tie: DeformDialTie | null;
  /** The two answers and their two reaches, when they named different fields. */
  dispute: DeformDialDispute | null;
  /**
   * The bone field that drives it, or `null` on a bone-less slider — whose time
   * IS its pose value and is set directly.
   */
  field: DialField | null;
  /** Two points of the affine map `local field -> property value`, from probes. */
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  /**
   * The ARTIFACT's own field as a map of its own, kept only on a disputed dial
   * (issue #427).
   *
   * ⭐ It is what lets `DeformDialDispute.outside` be **posed** rather than
   * predicted: the survey builds a second plan out of it and runs the same
   * `poseDial` the real frames go through, so "no settable value of `knob.x`
   * reaches t=0.5s" is a measurement taken against spine-core and not an
   * inference off an interval.
   */
  statedMap: DialProbe | null;
}

/**
 * One field's probe: how far one step of it moved the reading, and the two points
 * of the affine map that step traced.
 */
interface DialProbe {
  field: DialField;
  response: number;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

/**
 * How near the wanted time the runtime has to land before the dial is called
 * good, in seconds.
 *
 * Nothing is being tuned here: on an affine reader the residual is float64 noise
 * — 1e-15 on `gallery/look` — and the two failures this separates it from are
 * both *gross*. `FromRotate`'s wrap moves the value by 360, so the time moves by
 * `360 · scale`; `Math.max(0, time)` moves it by the whole of whatever was
 * negative. There is nothing measured between the two.
 */
const DIAL_TIME_EPSILON = 1e-6;

/** How many secant steps the solve takes before it calls a time unreachable. */
const DIAL_SOLVE_STEPS = 4;

/**
 * How far the largest probe response has to clear the runner-up before the probe
 * alone is allowed to name the field the solve drives (issue #419).
 *
 * ⭐ **A ratio, so it carries no units and no fixture's scale.** What it separates
 * was measured rather than assumed, on this file's own probe:
 *
 * | reading | field | response to one step | ratio to the winner |
 * | --- | --- | --- | --- |
 * | `FromScaleX`, world, plain parent | `scaleX` | 2.5e-1 | — |
 * | | `rotation` | 4.0e-10 (float noise in `sqrt(a²+c²)`) | 6.2e8 |
 * | `FromX`, world, parent at 90° | `y` | 1.0 | — |
 * | | `x` | 4.6e-8 (float noise) | 2.2e7 |
 * | `FromScaleX`, world, parent scaled 2×1 | `scaleX` | 5.0e-1 | — |
 * | | `rotation` | 2.3e-4 (**real**, not noise) | 2.2e3 |
 * | `FromX`, world, parent at 45° | `x` | 7.07e-1 | — |
 * | | `y` | 7.07e-1 (**real**, and exactly equal) | 1.0 |
 *
 * So 1e3 sits between the smallest genuine secondary dependency measured (2.2e3)
 * and the largest float-noise ratio (2.2e7), with four orders of headroom on the
 * side that matters. ⚠️ It is not a noise threshold and must not be read as one:
 * a rig with a heavier parent scale pushes that 2.2e3 down through it, and what
 * happens then is not a wrong answer but an *ambiguous* one — which this file
 * reports and the artifact settles, below.
 */
const DIAL_PROBE_MARGIN = 1e3;

/**
 * The largest magnitude the solve will drive a bone field to (issue #419).
 *
 * 🚨 **This is the bound that replaces "gave up at 4.9e9".** A dial figure is an
 * instruction — *set `knob.scaleX` to this* — and past 2²⁴ a float32 cannot hold
 * two consecutive integers apart, so a number up there is not one an author can
 * set and read back; the emitted skeleton, which rounds to six decimals, has lost
 * the precision long before. A drive the mapping asks for beyond this is
 * therefore **not posed**: the bone stops at the bound, the runtime lands on some
 * other time, and the key is reported unreachable with the ask and the bound both
 * named — never printed as if it were advice.
 *
 * The runaway #419 was filed on reached 1.2e9, 2.5e9 and 4.9e9, all two orders
 * above this, and every dial `gallery/look` and the DW fixtures ask for is under
 * 200.
 */
const DIAL_DRIVE_LIMIT = 2 ** 24;

/**
 * Every way each animation is reached, keyed by animation name.
 *
 * A `null` entry in the returned list is the track — the frame every animation
 * had before #407 — and it is what an animation NO slider applies gets. An
 * animation a slider applies gets one plan per slider and no track entry, on
 * spine-core's own statement that *"slider animations are designed to be applied
 * by slider constraints rather than on their own"*
 * (`SkeletonData.findSliderAnimations`).
 *
 * ⚠️ A slider **muted at setup** applies nothing: `Slider.update` returns before
 * it reads the bone when `mix` is 0. So it is not a way in, and its animation
 * keeps the track frame — which is the older idiom of muting at setup and keying
 * `slider.<name>.mix` from a playing animation, where the frame the deform keys
 * actually occur in is that playing animation's, and rigc has no way to know
 * which one that is.
 *
 * ⚠️ **Per skin, because whether a slider runs at all is per skin** (#583). A
 * `skinRequired` slider is out of the update cache under every skin that does
 * not list it, and a slider on a `skinRequired` bone reads a world property that
 * nothing moves there — so the same constraint plans differently depending on
 * what the skeleton is wearing, and the answer that matters is the one under the
 * skin holding the mesh being measured.
 */
function reachesOf(structure: SurveyStructure, skin: SurveySkin | null, poser: SurveyPoser): Map<string, Array<DialPlan | null>> {
  const out = new Map<string, Array<DialPlan | null>>();
  for (const anim of structure.animations) out.set(anim.name, []);
  for (const slider of structure.sliders) {
    if (slider.mix === 0) continue;
    const list = out.get(slider.animation);
    if (list === undefined) continue;
    const plan = planDial(poser, skin, slider);
    if (plan !== null) list.push(plan);
  }
  for (const list of out.values()) if (list.length === 0) list.push(null);
  return out;
}

/**
 * Find which local field of the driving bone moves a slider's time, and read the
 * affine map from that field to the property value off two probes.
 *
 * ⭐ **Probed rather than tabulated.** How a `FromProperty` turns a bone into a
 * number is spine-core's business, and under `local: false` it goes through the
 * world transform — so a table of that here would be a second copy of the
 * runtime's arithmetic AND a claim about parents this file has no business
 * making. Calls to `data.property.value` — the same call `Slider.update` makes,
 * with the same all-zero offsets — say it instead, and every one of the six
 * readers is affine in its own field at a fixed parent pose, so two points of the
 * winner are the whole map.
 *
 * 🚨 **What the probe is NOT allowed to do is stop at the first field that
 * moves** (issue #419). A world scale is read as `sqrt(a² + c²)`; perturbing
 * `rotation` changes `a` and `c` by amounts that do not cancel in floating point,
 * `rotation` is probed first, and every world `scaleX` / `scaleY` / `shearY`
 * slider was therefore reported as `rotate` — and then solved through a field
 * whose response to it is 4e-10, which is how a drive reached 4.9e9. So:
 *
 *  1. **every** field is probed and they are ranked by response;
 *  2. the winner has to clear the runner-up by `DIAL_PROBE_MARGIN` to be called
 *     decisive — a tie is a real thing (a `FromX` slider on a bone whose parent
 *     is at 45° is moved exactly equally by local `x` and local `y`) and letting
 *     `DIAL_FIELDS`'s order settle it silently is the same defect one step over;
 *  3. and the answer is cross-checked against the **artifact** — spine-core's own
 *     reader class, which is what the parser built out of the rig spec's
 *     `property`. That is what the report names, it settles a tie the probe could
 *     not, and where the two genuinely differ the report says so by name.
 *
 * ⛔ Nothing here falls back to `rotation`, or to any field, when the search does
 * not settle. Two answers that disagree are two answers, printed.
 */
function planDial(poser: SurveyPoser, skin: SurveySkin | null, slider: SurveySlider, requireSettled = false): DialPlan | null {
  const boneName = slider.bone ?? '?';
  const where = slider.local ? ' (local)' : ' (world)';
  const reach = (discovery: DialDiscovery | null): DeformReach => {
    if (discovery === null) {
      return {
        kind: 'slider',
        slider: slider.name,
        bone: slider.bone,
        property: null,
        drive: null,
        local: slider.local,
        label: `applied by slider "${slider.name}" at its own time`,
      };
    }
    // The name comes off the artifact whenever the artifact has one. A reader
    // this file does not know is named by its class rather than by a guess.
    const property = discovery.stated === null ? discovery.reader : DIAL_PROPERTY[discovery.stated];
    const drive = discovery.stated === discovery.drive ? null : DIAL_PROPERTY[discovery.drive];
    return {
      kind: 'slider',
      slider: slider.name,
      bone: slider.bone,
      property,
      drive,
      local: slider.local,
      label:
        `applied by slider "${slider.name}" off ${boneName}.${property}${where}` +
        dialDiscoveryClause(discovery, boneName),
    };
  };
  // The bone-less form: `Slider.update` leaves `p.time` alone, so the dial IS the
  // pose value and the map is the identity.
  if (slider.bone === null) {
    return { slider, reach: reach(null), tie: null, dispute: null, field: null, u0: 0, v0: 0, u1: 1, v1: 1, statedMap: null };
  }
  const session = poser.dial(skin, slider);
  if (session === null || !session.hasBone) return null;
  // ⚠️ Every field is kept, the dead ones included, because the ARTIFACT may name
  // one of them: a reach comparison needs the map of the field the skeleton
  // declares even when that field moves the reading by nothing at all (#427).
  const all: DialProbe[] = [];
  for (const field of DIAL_FIELDS) {
    const step = dialStep(field);
    const base = session.base(field);
    const v0 = session.at(field, base).read;
    const v1 = session.at(field, base + step).read;
    all.push({ field, response: Math.abs(v1 - v0), u0: base, v0, u1: base + step, v1 });
  }
  const probes = all.filter((p) => Number.isFinite(p.response) && p.response !== 0);
  // Nothing moves it: a bone another constraint pins, or a reader that cannot see
  // this bone at all. A37 owns the `scale: 0` shape of the same silence.
  if (probes.length === 0) return null;
  // ⚠️ A stable sort on a strict comparison, so an exact tie keeps `DIAL_FIELDS`'s
  // order and the tie is DETECTED below rather than decided here. A comparator
  // that broke ties would put the arbitrary choice back where nothing sees it.
  probes.sort((a, b) => b.response - a.response);
  const winner = probes[0];
  const stated = slider.stated;
  const leaders = probes.filter((p) => p.response * DIAL_PROBE_MARGIN >= winner.response);
  const decisive = leaders.length === 1;
  if (requireSettled && !decisive && !leaders.some((p) => p.field === stated)) return null;
  const chosen = decisive || stated === null ? winner : (leaders.find((p) => p.field === stated) ?? winner);
  const verdict: DialVerdict = chosen.field === stated ? (decisive ? 'agreed' : 'settled') : 'disagreed';
  const discovery: DialDiscovery = {
    stated,
    reader: slider.reader,
    drive: chosen.field,
    driveResponse: chosen.response,
    rivals: leaders.filter((p) => p.field !== chosen.field).map((p) => ({ field: p.field, response: p.response })),
    statedResponse:
      stated === null || stated === chosen.field ? null : (all.find((p) => p.field === stated)?.response ?? 0),
    verdict,
  };
  // 🔒 A tie and a disagreement are built as two different things, because they
  // ARE two different things: a tie has one belief the artifact broke, and a
  // disagreement has two that have to be compared. Folding them into one record
  // with a `verdict` field is how a report comes to say "disagreed" about
  // legitimate geometry (issues #419, #427).
  const statedMap = stated === null ? null : (all.find((p) => p.field === stated) ?? null);
  const tie: DeformDialTie | null =
    verdict !== 'settled'
      ? null
      : {
          slider: slider.name,
          bone: boneName,
          drive: DIAL_PROPERTY[chosen.field],
          driveResponse: chosen.response,
          rivals: discovery.rivals.map((r) => ({ field: DIAL_PROPERTY[r.field], response: r.response })),
        };
  const dispute: DeformDialDispute | null =
    verdict !== 'disagreed'
      ? null
      : {
          slider: slider.name,
          bone: boneName,
          stated: stated === null ? discovery.reader : DIAL_PROPERTY[stated],
          statedResponse: discovery.statedResponse,
          statedReach: statedMap === null ? null : dialReachOf(slider, statedMap),
          drive: DIAL_PROPERTY[chosen.field],
          driveResponse: chosen.response,
          driveReach: dialReachOf(slider, chosen),
          outside: [],
        };
  return {
    slider,
    reach: reach(discovery),
    tie,
    dispute,
    field: chosen.field,
    u0: chosen.u0,
    v0: chosen.v0,
    u1: chosen.u1,
    v1: chosen.v1,
    statedMap: dispute === null ? null : statedMap,
  };
}

/**
 * The part of an animation's own `0..duration` one field of the driving bone can
 * select, or `null` when it can select none of it (issue #427).
 *
 * ⭐ **Closed form, and exact against the thing that decides.** `poseDial` refuses
 * outright a drive whose magnitude exceeds `DIAL_DRIVE_LIMIT`, and the two maps
 * between a field and a time are both affine — the probe's `field -> value`, and
 * `Slider.update`'s own `value -> time` inverted. So the times a *settable* value
 * of this field asks for are an interval, and its two ends are `±DIAL_DRIVE_LIMIT`
 * put through both. A field that moves the reading by nothing gives a single
 * point, which is the honest answer for it: the setup time and no other.
 *
 * ⚠️ It is a statement about what can be **asked for**, not about what the runtime
 * then does with it — `FromRotate`'s `[0, 360)` wrap can refuse a time this
 * interval contains. That is why the frames a disputed dial could not have posed
 * are POSED rather than read off here.
 */
function dialReachOf(slider: SurveySlider, map: DialProbe): DialSpan | null {
  const timeAt = (u: number): number => {
    const value = map.v0 + ((u - map.u0) * (map.v1 - map.v0)) / (map.u1 - map.u0);
    return slider.to + (value - slider.from) * slider.scale;
  };
  const ends = [timeAt(-DIAL_DRIVE_LIMIT), timeAt(DIAL_DRIVE_LIMIT)];
  if (!ends.every((t) => Number.isFinite(t))) return null;
  const lo = Math.max(0, Math.min(ends[0], ends[1]));
  const hi = Math.min(slider.duration, Math.max(ends[0], ends[1]));
  return lo <= hi ? { lo, hi } : null;
}

/**
 * The clause the frame line carries when the two answers did not simply agree —
 * empty on every rig where they did, which is every one in the gallery.
 *
 * ⭐ It names both answers and both responses, because "the probe and the file
 * disagree" without the numbers is a sentence an author cannot act on.
 */
function dialDiscoveryClause(discovery: DialDiscovery, bone: string): string {
  if (discovery.verdict === 'agreed') return '';
  const drive = `${bone}.${DIAL_PROPERTY[discovery.drive]} ${discovery.driveResponse.toExponential(3)}`;
  if (discovery.verdict === 'settled') {
    const rivals = discovery.rivals
      .map((r) => `${bone}.${DIAL_PROPERTY[r.field]} ${r.response.toExponential(3)}`)
      .join(', ');
    return (
      `, driven through ${bone}.${DIAL_PROPERTY[discovery.drive]} — the probe did not settle that on its own ` +
      `(${drive} against ${rivals}, inside the ${DIAL_PROBE_MARGIN}x margin), so the skeleton's own reader broke ` +
      'the tie'
    );
  }
  const statedName = discovery.stated === null ? discovery.reader : `${bone}.${DIAL_PROPERTY[discovery.stated]}`;
  const statedAt =
    discovery.statedResponse === null ? 'which this file does not know' : `which moves it by ${discovery.statedResponse.toExponential(3)}`;
  return (
    `, driven through ${bone}.${DIAL_PROPERTY[discovery.drive]} — the probe moves the reading by ${drive} while ` +
    `the skeleton says the reader is ${statedName}, ${statedAt}. The two disagree and both are reported: the ` +
    'drive is the one that measurably moves the reading'
  );
}

/** A posed frame and the dial that selected it, or `null` on a track frame. */
interface PoseOfFrame {
  posed: SurveyPose;
  dial: DeformDial | null;
}

/**
 * What `Slider.update` stores in `SliderPose.time` for a wanted animation time.
 *
 * On a slider driven by a bone: the time wrapped into the animation under
 * `loop`, else held at 0 or above. Not assumed — `poseDial`'s step 3 reads
 * `SliderPose.time` off the skeleton each time it poses a dial and compares
 * it with this, and a disagreement is reported, never absorbed. It is stated at all because that
 * verification compares against what the runtime STORED and not against what
 * was asked for. ⚠️ `loop` on a zero-length animation gives NaN here exactly
 * as it does there, which is `A37_SLIDER_CONSTRAINT_EFFECTIVE`'s refusal.
 */
function sliderTimeFor(slider: SurveySlider, time: number): number {
  if (slider.bone === null) return time;
  if (slider.loop) return slider.duration + (time % slider.duration);
  return Math.max(0, time);
}

/**
 * The skeleton of `data` with `plan`'s slider applying its animation at `time`.
 *
 * Three steps, and each is answerable on its own:
 *
 *  1. **invert the mapping.** `Slider.update` computes
 *     `time = offset + (value − property.offset) · scale`, so the value that
 *     selects `time` is `property.offset + (time − offset) / scale`. This is the
 *     step the whole change is, and it is load-bearing rather than a hint —
 *     everything below aims at the `value` it names and nothing corrects it.
 *  2. **drive the bone until spine-core's own reader returns that value.**
 *     Through the affine map `planDial` measured; a secant closes any residual.
 *     ⚠️ It converges on the VALUE and never on the time, which is what keeps
 *     step 1 checkable: a solve aimed at the time would quietly absorb a wrong
 *     sign or a dropped offset in the inversion and pose the right frame off the
 *     wrong arithmetic — measured, it does exactly that — so the dial the report
 *     prints would be a number no author could use. Aimed at the value, a wrong
 *     inversion drives the bone somewhere else and step 3 says so.
 *  3. **check the runtime agrees.** `SliderPose.time` off the posed skeleton
 *     against `sliderTimeFor` — spine-core's answer, not this function's. A time
 *     no dial value selects is reported and never guessed at.
 */
function poseDial(poser: SurveyPoser, skin: SurveySkin | null, plan: DialPlan, time: number): PoseOfFrame {
  const slider = plan.slider;
  const wanted = sliderTimeFor(slider, time);
  const value = plan.field === null ? time : slider.from + (time - slider.to) / slider.scale;
  const session = poser.dial(skin, slider);
  if (session === null) return { posed: poser.track(skin, slider.animation, time), dial: null };
  /** Pose with the driving field at `candidate`, and read both sides back. */
  const field = session.hasBone ? plan.field : null;
  const at = (candidate: number): { read: number; applied: number } => session.at(field, candidate);
  /** The affine first guess, and what it is judged against. */
  const asked = plan.u0 + ((value - plan.v0) * (plan.u1 - plan.u0)) / (plan.v1 - plan.v0);
  // 🚨 The bound, and it is on the drive the answer is READ off, not on the
  // arithmetic that got there (issue #419). Two different things wanted bounding
  // and they want it differently:
  //
  //  - **the mapping's own ask.** A map measured through a field the reading
  //    barely moves inverts to nonsense — this is #419's own case, where a world
  //    scale solved through `rotation` asked for 4.9e9 — and that is the frame
  //    the report would print as advice. Out of bounds, it is not posed at all:
  //    the bone stays at the setup value of its field, the key is unreachable,
  //    and `unreachableWhy` names the ask and the bound.
  //  - **a secant step.** The loop below is a search and a search may step
  //    anywhere; a step out of bounds is a step this stops taking, not a verdict.
  //    `FromRotate`'s wrap sends one there routinely on a rig whose real defect is
  //    the wrap, and reporting the bound instead of the wrap would swap a
  //    diagnosis for a symptom.
  const runaway = !Number.isFinite(asked) || Math.abs(asked) > DIAL_DRIVE_LIMIT;
  const first = runaway ? plan.u0 : asked;
  const near = 1e-9 * (1 + Math.abs(value));
  let u = first;
  let got = at(u);
  // Zero iterations on every affine reader, which is all six of them at a fixed
  // parent pose. The loop is here for the one that is not — `FromRotate` under
  // `local: false`, whose `[0, 360)` wrap is a step in the middle of the range —
  // and where it fails to close, the naive drive is what gets posed and reported,
  // because "the bone put where the mapping says" is the frame an author can act
  // on and a wandered secant point is not.
  let pu = first === plan.u0 ? plan.u1 : plan.u0;
  let pv = Number.NaN;
  for (let step = 0; !runaway && step < DIAL_SOLVE_STEPS && Math.abs(got.read - value) > near; step++) {
    if (!Number.isFinite(pv)) pv = at(pu).read;
    if (pv === got.read || !Number.isFinite(pv) || !Number.isFinite(got.read)) break;
    const next = u + ((value - got.read) * (u - pu)) / (got.read - pv);
    if (!Number.isFinite(next) || Math.abs(next) > DIAL_DRIVE_LIMIT) break;
    pu = u;
    pv = got.read;
    u = next;
    got = at(u);
  }
  if (Math.abs(got.read - value) > near && u !== first) {
    u = first;
    got = at(u);
  }
  return {
    posed: session.pose(),
    dial: {
      value,
      driven: u,
      beyondLimit: runaway ? asked : null,
      applied: got.applied,
      wanted,
      // ⚠️ A drive the bound refused is unreachable WHATEVER the runtime then
      // landed on. Nothing was posed where the mapping asked, so a time that
      // happens to match is a coincidence of the setup pose and not a measurement.
      unreachable: runaway || !(Math.abs(got.applied - wanted) <= DIAL_TIME_EPSILON),
    },
  };
}

/** One posed time, measured — and the two world arrays it was measured from. */
interface PosedFrame {
  time: number;
  posed: SurveyPose;
  /** The mesh as the runtime deformed it there. */
  deformed: Float32Array;
  /** The same bones with the deform cleared. The denominator, by construction 1.000. */
  plain: Float32Array;
  /** `triangleAreas(plain)`, kept so the span scan does not take it a second time. */
  plainAreas: number[];
  measure: DeformFrameMeasure;
}

/**
 * Everything this file says about one attachment at whatever time a skeleton is
 * already posed at.
 *
 * ⚠️ It **clears the slot's deform array** to take the plain side, so the
 * skeleton it is handed is spent for any purpose that wanted the runtime's own
 * deform back. The span scan below relies on that: it writes its own arrays into
 * the emptied slot to evaluate the two keys' geometry at one pose.
 */
function measurePosed(
  posed: SurveyPose,
  time: number,
  slotIndex: number,
  attachment: SurveyMesh,
  triangles: ArrayLike<number>,
  reach: DeformReach,
  dial: DeformDial | null,
): PosedFrame {
  const count = attachment.worldVerticesLength;
  // Read BEFORE the deform is cleared below, and off the same posed skeleton:
  // what the slot shows here and at what alpha is the other half of what this
  // frame does (issue #401).
  const draw = drawOfKey(posed, slotIndex, attachment);
  const deformed = posed.deformed(slotIndex, attachment);
  // The same bones, with the deform taken away. `computeWorldVertices` reads the
  // array off the slot, so emptying it is the whole control.
  const plain = posed.plain(slotIndex, attachment);

  const before = triangleAreas(plain, triangles);
  const after = triangleAreas(deformed, triangles);
  const band = areaBand(before, plain, deformed);

  let moved = 0;
  let maxDisplacement = 0;
  let maxDisplacementVertex = -1;
  for (let v = 0; v * 2 + 1 < count; v++) {
    const dx = deformed[v * 2] - plain[v * 2];
    const dy = deformed[v * 2 + 1] - plain[v * 2 + 1];
    if (dx === 0 && dy === 0) continue;
    moved++;
    const distance = hypot2(dx, dy);
    if (distance > maxDisplacement) {
      maxDisplacement = distance;
      maxDisplacementVertex = v;
    }
  }

  const reversed: DeformReversal[] = [];
  let collapsed = 0;
  let degenerate = 0;
  let areaRatioMin: DeformExtreme | null = null;
  let areaRatioMax: DeformExtreme | null = null;
  let stretchMax: DeformExtreme | null = null;
  let stretchMin: DeformExtreme | null = null;
  for (let t = 0; t < before.length; t++) {
    // A triangle with no area at the cleared pose has no winding to keep and no
    // map to take singular values of.
    if (Math.abs(before[t]) <= band) {
      degenerate++;
      continue;
    }
    const ratio = after[t] / before[t];
    if (areaRatioMin === null || ratio < areaRatioMin.value) areaRatioMin = { triangle: t, value: ratio };
    if (areaRatioMax === null || ratio > areaRatioMax.value) areaRatioMax = { triangle: t, value: ratio };
    const stretch = stretchSingularValues(plain, deformed, triangles, t);
    if (stretch !== null) {
      if (stretchMax === null || stretch.max > stretchMax.value) stretchMax = { triangle: t, value: stretch.max };
      if (stretchMin === null || stretch.min < stretchMin.value) stretchMin = { triangle: t, value: stretch.min };
    }
    // A triangle the key collapses ONTO zero has been pinched rather than turned
    // over — a real idiom, counted and never a bar. Its ratio and its stretch are
    // kept above, because a triangle crushed to nothing IS the worst compression
    // on that key and hiding it would flatter the report.
    if (Math.abs(after[t]) <= band) {
      collapsed++;
      continue;
    }
    if (Math.sign(before[t]) !== Math.sign(after[t])) {
      reversed.push({
        triangle: t,
        ids: [triangles[t * 3], triangles[t * 3 + 1], triangles[t * 3 + 2]],
        before: before[t],
        after: after[t],
      });
    }
  }
  return {
    time,
    posed,
    deformed,
    plain,
    plainAreas: before,
    measure: {
      vertices: count / 2,
      moved,
      maxDisplacement,
      maxDisplacementVertex,
      triangles: before.length,
      reversed,
      collapsed,
      degenerate,
      areaRatioMin,
      areaRatioMax,
      stretchMax,
      stretchMin,
      band,
      draw,
      reach,
      dial,
    },
  };
}

// ---------------------------------------------------------------------------
// Between two keys — issue #403
// ---------------------------------------------------------------------------

/**
 * A closed interval, in whatever the caller is measuring. Empty when `hi < lo`.
 */
interface Interval {
  lo: number;
  hi: number;
}

/** One straight piece of the curve the runtime reads a span's fraction off. */
interface CurveLeg {
  t0: number;
  p0: number;
  t1: number;
  p1: number;
}

/**
 * The runtime's own interpolation fraction over one span, as a polyline in
 * `(time, fraction)`.
 *
 * ⭐ **The points the runtime stores, not the cubic.**
 * `DeformTimeline.getCurvePercent` evaluates a bezier by walking the points the
 * parser sampled into its curve storage and interpolating *linearly* between
 * them — so the polyline below is not an approximation of what the runtime does,
 * it is what the runtime does. A curve that overshoots (a fraction below 0 or
 * above 1, which the format allows and `back`-style easings produce) is therefore
 * inside this rather than assumed away. Which reader supplies the points is the
 * structure's (`SurveyCurve`, issue #1019): spine-core's reads that storage
 * (`curveStorage`); the model document's computes the same nine from the key's
 * handles with the core's deform curve (`./deformstructure.ts`), measured equal
 * point for point on every corpus Bézier.
 */
function curveLegs(timeline: SurveyDeformTimeline, frame: number): { kind: DeformSpanCurve; legs: CurveLeg[] } {
  const t0 = timeline.frames[frame];
  const t1 = timeline.frames[frame + 1];
  const curve = timeline.curve(frame);
  // STEPPED: `getCurvePercent` returns a flat 0 across the whole span, so the
  // runtime holds the earlier key's geometry and interpolates nothing.
  if (curve.kind === 'stepped') return { kind: 'stepped', legs: [{ t0, p0: 0, t1, p1: 0 }] };
  if (curve.kind === 'linear') return { kind: 'linear', legs: [{ t0, p0: 0, t1, p1: 1 }] };
  // BEZIER: nine sampled points are stored; the runtime ramps into the first
  // from (t0, 0) and out of the last to (t1, 1), which is the two legs added
  // either side.
  const points = curve.points;
  const legs: CurveLeg[] = [];
  let x = t0;
  let y = 0;
  for (let i = 0; i < BEZIER_POINTS * 2; i += 2) {
    legs.push({ t0: x, p0: y, t1: points[i], p1: points[i + 1] });
    x = points[i];
    y = points[i + 1];
  }
  legs.push({ t0: x, p0: y, t1, p1: 1 });
  return { kind: 'bezier', legs };
}

/** Points `CurveTimeline.setBezier` stores per curve — `BEZIER_SIZE / 2`. */
export const BEZIER_POINTS = 9;

/** The fractions this span's curve actually reaches, overshoot included. */
function reachedFractions(legs: readonly CurveLeg[]): Interval {
  let lo = Infinity;
  let hi = -Infinity;
  for (const leg of legs) {
    lo = Math.min(lo, leg.p0, leg.p1);
    hi = Math.max(hi, leg.p0, leg.p1);
  }
  return { lo, hi };
}

/**
 * The times at which the curve's fraction is inside `window`, as intervals.
 *
 * Every leg is straight, so each contributes one interval and the answer is
 * exact — a non-monotone curve simply contributes more than one.
 */
function timesAtFractions(legs: readonly CurveLeg[], window: Interval): Interval[] {
  const out: Interval[] = [];
  for (const leg of legs) {
    if (leg.p0 === leg.p1) {
      if (leg.p0 >= window.lo && leg.p0 <= window.hi) out.push({ lo: leg.t0, hi: leg.t1 });
      continue;
    }
    const at = (p: number): number => leg.t0 + ((leg.t1 - leg.t0) * (p - leg.p0)) / (leg.p1 - leg.p0);
    const a = at(window.lo);
    const b = at(window.hi);
    const lo = Math.max(Math.min(leg.t0, leg.t1), Math.min(a, b));
    const hi = Math.min(Math.max(leg.t0, leg.t1), Math.max(a, b));
    if (hi >= lo) out.push({ lo, hi });
  }
  return out;
}

/** The fraction the curve is at, at one time. */
function fractionAt(legs: readonly CurveLeg[], time: number): number {
  for (const leg of legs) {
    if (time < Math.min(leg.t0, leg.t1) || time > Math.max(leg.t0, leg.t1)) continue;
    if (leg.t1 === leg.t0) return leg.p0;
    return leg.p0 + ((leg.p1 - leg.p0) * (time - leg.t0)) / (leg.t1 - leg.t0);
  }
  return legs[legs.length - 1].p1;
}

/** Overlapping intervals folded into the maximal ones they cover. */
function mergeIntervals(intervals: readonly Interval[]): Interval[] {
  const sorted = [...intervals].filter((i) => i.hi > i.lo).sort((a, b) => a.lo - b.lo || a.hi - b.hi);
  const out: Interval[] = [];
  for (const interval of sorted) {
    const last = out[out.length - 1];
    if (last !== undefined && interval.lo <= last.hi) last.hi = Math.max(last.hi, interval.hi);
    else out.push({ ...interval });
  }
  return out;
}

/**
 * Where a triangle's area has the **wrong sign** over one span, in the
 * interpolation fraction — the closed form, and the whole reason this scan needs
 * no subdivision count.
 *
 * ## The arithmetic, in full, because it is four lines
 *
 * `DeformTimeline.applyToSlot` writes `v1 + (v2 − v1)·p` into the slot's deform
 * array, and a world vertex is an **affine** function of that array at a fixed
 * pose — unweighted, the array *is* the local positions; weighted, each pair is
 * added in a bone's bind space and summed with fixed weights. So over one span
 * every vertex travels a straight line, `W(p) = A + p·(B − A)`, and a triangle's
 * doubled signed area is a cross product of two such lines:
 *
 *     2A(p) = (e₁ + p·d₁) × (e₂ + p·d₂)
 *           = e₁×e₂  +  p·(e₁×d₂ + d₁×e₂)  +  p²·(d₁×d₂)
 *
 * — a **quadratic in p, exactly**, with `e` the edges at `p = 0` and `d` the
 * edges of the displacement to `p = 1`. The reversal condition is therefore two
 * roots of a quadratic, not a search, and there is no sample spacing to defend.
 *
 * ⭐ Compare `turnCeiling` in [`src/depth.ts`](src/depth.ts), which is the same
 * move on the other side of the wall: there a yaw makes the area linear in
 * `cos t` and `sin t` and the fold angle is `atan(A₀/A_axis)`; here the runtime's
 * own interpolation makes it quadratic in `p` and the fold fraction is a root.
 * Both replace "build, read the refusal, guess again" with arithmetic.
 *
 * 🚨 **What is NOT closed-form is the pose.** `A(p)` above holds the bones still.
 * The bones move across a span too, and on a WEIGHTED mesh their motion changes
 * the map from offsets to world — so this is evaluated at both of the span's own
 * key poses and the union taken, and whatever it names is then *measured* at the
 * real posed time before anything is refused. On an unweighted mesh the question
 * does not arise at all: one bone matrix multiplies every vertex, so its
 * determinant factors out of both sides of the comparison and the reversal is a
 * property of the offsets alone.
 */
function wrongSignFractions(
  c0: number,
  c1: number,
  c2: number,
  plainArea: number,
  band: number,
  reach: Interval,
): Interval[] {
  // g(p) < 0 is "reversed by more than the band", with the sign folded in so the
  // question is the same one whichever way the mesh is wound.
  const s = plainArea > 0 ? 1 : -1;
  const a = s * c2;
  const b = s * c1;
  const c = s * c0 + band;
  const clip = (lo: number, hi: number): Interval[] => {
    const out = { lo: Math.max(lo, reach.lo), hi: Math.min(hi, reach.hi) };
    return out.hi >= out.lo ? [out] : [];
  };
  if (a === 0) {
    // Degenerate to a straight line, which is what a deform that moves one axis
    // only comes to — a `yaw` leaves y alone, so its areas are affine in `p` and
    // two unfolded keys cannot fold between them at all (`DW14`).
    if (b === 0) return c < 0 ? [{ ...reach }] : [];
    const root = -c / b;
    return b > 0 ? clip(-Infinity, root) : clip(root, Infinity);
  }
  const discriminant = b * b - 4 * a * c;
  // No crossing: the sign of `a` is the sign of `g` everywhere.
  if (discriminant <= 0) return a < 0 ? [{ ...reach }] : [];
  const sq = Math.sqrt(discriminant);
  const left = Math.min((-b - sq) / (2 * a), (-b + sq) / (2 * a));
  const right = Math.max((-b - sq) / (2 * a), (-b + sq) / (2 * a));
  // ⚠️ An upward parabola is wrong-signed BETWEEN its roots; a downward one is
  // wrong-signed OUTSIDE them, and those are two disjoint windows with a
  // correctly-wound middle. Merging them into one — which this did until it was
  // read back — would put the probe's midpoint in that middle and report a fold
  // nothing reproduced.
  return a > 0 ? clip(left, right) : [...clip(-Infinity, left), ...clip(right, Infinity)];
}

/*
 * The times at which the slot's **visibility** can change across a span.
 *
 * ⚠️ This is the half of issue #403 that is about the fade rather than the fold,
 * and getting it wrong in either direction is a defect: read the alpha only at
 * the keys and a correct rig that fades out over the fold is refused (undoing
 * issue #401); probe one arbitrary time inside the fold window and a fold that is
 * drawn for only part of that window is missed.
 *
 * ⭐ The way out needs no threshold. A slot's alpha and its attachment are
 * piecewise functions of time whose pieces are **the slot timelines' own key
 * times**, so `alpha == 0` can start or stop only there. Splitting the fold
 * window at those times leaves pieces on which "does this draw?" has one answer,
 * and the probe inside a piece is representative of the whole piece.
 *
 * Every timeline filed under this slot, or under any other slot the deform
 * reaches (`timelineSlots`), counts — `SurveyAnimation.slotKeyTimes`, which each
 * reader answers (`visibilityKeyTimes` below for spine-core's; the model
 * document's slot and attachment timelines for the core's).
 */

/**
 * Scan the interval between two consecutive deform keys (issue #403).
 *
 * ## What it does, in order
 *
 * 1. **Solve.** At each of the span's two key poses, take every triangle's
 *    quadratic (`wrongSignFractions`) and collect the fractions at which it is
 *    reversed. Nothing is measured here and nothing is refused here.
 * 2. **Convert.** Map those fractions to times through the runtime's own curve
 *    polyline (`timesAtFractions`), keep only what is **strictly inside** the
 *    span — the two ends are the keys, and the key survey owns those — and merge
 *    the overlaps.
 * 3. **Split.** Cut each merged window at the slot's own visibility key times, so
 *    no piece straddles a change in what is drawn.
 * 4. **Measure.** Pose the skeleton at one time inside each piece and take this
 *    file's ordinary measurement there, alpha included, in time order. Stop at
 *    the first piece that comes back with a reversal on a frame that draws.
 *
 * ⇒ Nothing is refused on a prediction. What A39 reads is step 4's measurement,
 * at a real time, through the real runtime — the closed form only decides *where
 * to look*, which is exactly the part a subdivision count would have been
 * guessing at.
 *
 * ## Cost — measured, because the multiplier had to be chosen rather than assumed
 *
 * Step 1 is **one** extra `computeWorldVertices` per span per anchor (the other
 * end of the line is the anchor key's own `deformed` array) plus three cross
 * products per triangle; steps 2–3 are interval arithmetic, `O(triangles)`.
 * **Step 4 costs nothing at all on a span nothing is predicted in**, which is
 * every span of every green rig, and that is what keeps the whole figure a
 * fraction rather than a multiple. Against the same survey with this function
 * switched off, same process, alternated, on the `2026-09-05-density` study's
 * own grid ladder and on the four gallery rigs that carry a deform timeline:
 *
 * | fixture | keys | spans | triangle samples | keys only | + spans |
 * | --- | ---: | ---: | ---: | ---: | ---: |
 * | `grid-129`, weighted, 32,768 triangles | 4 | 3 | 131,072 | 5.5 ms | **8.1 ms (×1.47)** |
 * | `grid-97`, weighted, 18,432 triangles | 4 | 3 | 73,728 | 3.4 ms | 4.7 ms (×1.40) |
 * | `gallery/flex`, weighted, 75 triangles | 8 | 6 | 600 | 0.16 ms | 0.30 ms (×1.9) |
 * | `gallery/nod` | 36 | 30 | 624 | 0.34 ms | 0.46 ms (×1.37) |
 * | `gallery/portrait`, unweighted | 8 | 6 | 192 | 0.22 ms | 0.25 ms (×1.12) |
 *
 * ⇒ **The survey costs about half as much again**, and where in that range a rig
 * lands is set by two things and not by the triangle count: how many spans it
 * has per key (a timeline of two keys has one span; `nod`'s 36 keys have 30),
 * and whether the mesh is weighted — an unweighted one takes a single anchor for
 * the reason above and a much cheaper `computeWorldVertices` with it. ⚠️ Read
 * the ratio at `grid-129` and treat the sub-millisecond rows as noisy: they move
 * ±15% between runs, which is the caveat the density study's README already
 * carries about single readings. On a rig that DOES fold, add one posed
 * measurement — the cost of one key — per predicted window, and the build is
 * being refused anyway.
 */
function scanDeformSpan(
  anim: SurveyAnimation,
  timeline: SurveyDeformTimeline,
  attachment: SurveyMesh,
  triangles: ArrayLike<number>,
  named: { animation: string; skin: string; slot: string; attachment: string; placeholder: string },
  /** The index of the key the span starts at — `frame + 1` is the one it ends at. */
  frame: number,
  from: PosedFrame,
  to: PosedFrame,
  /**
   * The same frame the two keys were posed in, at a time between them (#407).
   * A probe taken on a track while a slider applies the animation elsewhere is
   * the frame that never occurs, one interpolation step further in.
   */
  poseFrame: (time: number) => PoseOfFrame,
): DeformSpan {
  const { kind, legs } = curveLegs(timeline, frame);
  const span: DeformSpan = {
    ...named,
    reach: from.measure.reach,
    fromKey: frame,
    toKey: frame + 1,
    fromTime: from.time,
    toTime: to.time,
    curve: kind,
    predicted: 0,
    probed: [],
    fold: null,
    notDrawn: 0,
    unconfirmed: false,
  };
  const reach = reachedFractions(legs);
  const v1 = timeline.vertices(frame);
  const v2 = timeline.vertices(frame + 1);
  if (!v1 || !v2) return span;

  const windows: Interval[] = [];
  const flagged = new Set<number>();
  // ⭐ **One anchor on an unweighted attachment, and it costs nothing to be
  // sure of.** Every vertex of one is transformed by the SAME bone matrix `M`,
  // so a triangle's world area is `det M` times its local area on both sides of
  // the comparison and the factor cancels: whether the deform reverses a
  // winding is then a property of the offsets alone, identical at every pose,
  // and the second anchor would recompute the same answer. A WEIGHTED
  // attachment blends a different matrix per vertex, `det` does not factor out,
  // and the fixed-pose quadratic is only exact where the bones hold still — so
  // both of the span's own key poses are taken and the union used. `DW17` is
  // the control for the claim: a bone rotation across the span moves nothing
  // about where an unweighted mesh is found to fold.
  for (const anchor of attachment.weighted ? [from, to] : [from]) {
    // The two ends of the straight line every vertex travels, evaluated at THIS
    // anchor's bones. `measurePosed` has already emptied the slot's deform array
    // to take its plain side, so writing into it is how the two are posed.
    //
    // ⭐ Half of these four are already in hand. At a key's own time the
    // runtime's interpolation fraction is 0, so `applyToSlot` copies that key's
    // array verbatim — which makes the anchor's own `deformed` exactly the end
    // of the line that belongs to it, provided the slot was showing the mesh
    // there for the runtime to have applied anything at all.
    const own = anchor.measure.draw.showsThisMesh;
    const a =
      own && anchor === from ? from.deformed : anchor.posed.withDeform(timeline.slotIndex, attachment, v1);
    const b =
      own && anchor === to ? to.deformed : anchor.posed.withDeform(timeline.slotIndex, attachment, v2);
    // The anchor's own plain areas, taken once when it was measured as a key —
    // the same numbers, so the span cannot disagree with the key about which
    // triangles have a winding to keep.
    const plainAreas = anchor.plainAreas;
    const band = areaBand(plainAreas, anchor.plain, a, b);
    for (let t = 0; t < plainAreas.length; t++) {
      if (Math.abs(plainAreas[t]) <= band) continue; // no winding to keep
      const i0 = triangles[t * 3] * 2;
      const i1 = triangles[t * 3 + 1] * 2;
      const i2 = triangles[t * 3 + 2] * 2;
      const e1x = a[i1] - a[i0];
      const e1y = a[i1 + 1] - a[i0 + 1];
      const e2x = a[i2] - a[i0];
      const e2y = a[i2 + 1] - a[i0 + 1];
      const d1x = b[i1] - b[i0] - e1x;
      const d1y = b[i1 + 1] - b[i0 + 1] - e1y;
      const d2x = b[i2] - b[i0] - e2x;
      const d2y = b[i2 + 1] - b[i0 + 1] - e2y;
      const c0 = 0.5 * (e1x * e2y - e2x * e1y);
      const c1 = 0.5 * (e1x * d2y - d2x * e1y + d1x * e2y - e2x * d1y);
      const c2 = 0.5 * (d1x * d2y - d2x * d1y);
      for (const wrong of wrongSignFractions(c0, c1, c2, plainAreas[t], band, reach)) {
        const inside = timesAtFractions(legs, wrong)
          .map((i) => ({ lo: Math.max(i.lo, from.time), hi: Math.min(i.hi, to.time) }))
          .filter((i) => i.hi > i.lo);
        if (inside.length === 0) continue;
        flagged.add(t);
        windows.push(...inside);
      }
    }
  }
  span.predicted = flagged.size;
  if (windows.length === 0) return span;

  // Split each merged window at the slot's own visibility keys, so no piece
  // straddles a change in what is drawn. Every point of a merged window is
  // inside at least one triangle's window, so its middle is a fold and not a gap.
  const slots = new Set<number>([timeline.slotIndex, ...attachment.timelineSlots]);
  const cuts = anim.slotKeyTimes(slots);
  const pieces: Interval[] = [];
  for (const window of mergeIntervals(windows)) {
    const inner = [...new Set(cuts.filter((t) => t > window.lo && t < window.hi))].sort((x, y) => x - y);
    let lo = window.lo;
    for (const cut of [...inner, window.hi]) {
      if (cut > lo) pieces.push({ lo, hi: cut });
      lo = cut;
    }
  }
  for (const piece of pieces) {
    const time = (piece.lo + piece.hi) / 2;
    const at = poseFrame(time);
    // A probe the dial cannot select is no probe: it would be measuring some
    // other time. Both keys bounding this span were reachable, and the map from
    // dial to time is affine, so this is a shape nothing in the corpus reaches —
    // which is exactly why it must not be recorded as a probe that ran.
    if (at.dial?.unreachable === true) continue;
    span.probed.push(time);
    const probe = measurePosed(
      at.posed,
      time,
      timeline.slotIndex,
      attachment,
      triangles,
      from.measure.reach,
      at.dial,
    );
    if (probe.measure.reversed.length === 0) continue;
    if (probe.measure.draw.blank !== null) {
      span.notDrawn++;
      continue;
    }
    span.fold = { time, percent: fractionAt(legs, time), measure: probe.measure };
    return span;
  }
  span.unconfirmed = span.fold === null && span.notDrawn === 0;
  return span;
}

/**
 * Whether this key's mesh draws any pixels at this key's own time, and if not,
 * the sentence that says why (issue #401).
 *
 * ## The two ways a key draws nothing, and the one bar
 *
 * - **The slot shows something else** — or nothing. The runtime then applies no
 *   deform to the slot at all, so the mesh is neither on screen nor deformed.
 * - **The slot's alpha is exactly 0.** Every blend mode the format has multiplies
 *   the source by that alpha, so no channel of the destination moves.
 *
 * 🚨 **Exactly 0.** Not "small", not "below a floor". At 0.5 a reversed triangle
 * is visible at half strength and A39 goes on refusing it, with the alpha in the
 * message.
 *
 * ⚠️ **A deform reaches more than its own slot.** `Attachment.timelineSlots` (4.3)
 * lists the other slots a deform timeline is applied to, and spine-core applies
 * it to every one of them. So a mesh the timeline's own slot has swapped away may
 * still be drawn — and folded — in another slot, and the exemption is refused
 * unless NONE of the slots the deform reaches draws it. rigc emits no
 * `timelineSlots` of its own, so on a rigc-compiled skeleton the list is empty
 * and this loop runs zero times; it is here because a foreign skeleton reaching
 * `explain` is exactly where a silent false green would be unnoticeable.
 *
 * 🚨 **Every sentence here is about ONE skin — the one the skeleton is wearing**
 * (issue #583), which `under` names off `Skeleton.skin` rather than off whatever
 * the caller believes it set. That matters most in the loop below: a slot the
 * deform reaches through `timelineSlots` carries a LINKED mesh, a separate
 * attachment object that lives in a skin of its own, and `setSkin` dresses the
 * whole skeleton at once — so a linked copy whose skin is not the one worn here
 * resolves to nothing and `shownAt` reports alpha 0 for it, exactly as the
 * runtime would with that same skin on.
 *
 * ⛔ Not a reason to pose the key again under each of those other skins. Which
 * skin is worn is the consumer's, and a measurement taken under a skin the
 * timeline is not keyed on would be rigc composing a scene to make its own gate
 * green. What it must not do is leave the reader guessing which dress the
 * verdict was taken in, so the skin is in the sentence.
 */
function drawOfKey(posed: SurveyPose, slotIndex: number, attachment: SurveyMesh): DeformKeyDraw {
  const own = posed.shownAt(slotIndex, attachment);
  const under = posed.under();
  const draw = { shown: own.shown, showsThisMesh: own.showsThisMesh, alpha: own.alpha, under };
  // 🔒 On the "shows something else" branch ONLY, because that is the one branch
  // the skin decides: what a slot shows is resolved through the worn skin and
  // then `defaultSkin`, while an alpha is read off the pose and has no skin in
  // it. Before #583 the pose wore no skin at all, so a mesh in a named skin was
  // reported as a slot showing nothing — a true sentence about a pose nobody
  // would ever play, read as a claim about the rig. A clause on every branch
  // would be noise on the branch it cannot explain.
  const dress = under === null ? ', with no skin worn' : `, with skin "${under}" worn`;
  for (const other of attachment.timelineSlots) {
    if (other === slotIndex) continue;
    const there = posed.shownAt(other, attachment);
    if (there.alpha > 0) {
      // Drawn somewhere the deform reaches, so there is nothing to exempt — and
      // the geometry above was measured on a slot that is not the one drawing
      // it, which the report says out loud rather than passing over.
      return { ...draw, blank: null };
    }
  }
  if (!own.showsThisMesh) {
    const instead = own.shown === null ? 'no attachment at all' : `attachment "${own.shown}"`;
    return {
      ...draw,
      blank:
        `the slot shows ${instead} at this time${dress}, not this mesh, so the runtime applies no deform to it ` +
        'here and draws none of it',
    };
  }
  if (own.alpha === 0) {
    return {
      ...draw,
      blank:
        `the slot's alpha is exactly 0 at this time (slot ${own.slotAlpha.toFixed(4)} x attachment ` +
        `${own.attachmentAlpha.toFixed(4)}), so this key draws no pixels`,
    };
  }
  return { ...draw, blank: null };
}

// --- #969 the seam (spine-core's side of it is `./deformmeasure.ts`'s) ---
//
// The survey poses a skeleton and reads four things off it; everything else it
// does is arithmetic over those readings and over the skeleton's structure. So
// the seam is those poses and readings, and there are two posers behind it:
// spine-core over the Spine skeleton (the survey as it always was, and
// `validate.ts`'s A39, which hands it the SkeletonData it round-tripped), and
// rigc's own core over the model document (`./core/hooks.ts`, issue #969),
// which a build carries and `explain` hands in. Since issue #1019 the
// structure comes in the same two kinds, paired with the posers: spine-core's
// parse read by `runtimeSide` (`./deformmeasure.ts`), and the model document read by
// `modelStructure` (`./deformstructure.ts`) — so a build the core poses is
// surveyed without touching the runtime at all. The survey's record names which
// pair it used (`DeformSurvey.source`), and `tools/survey_hashes.ts` holds the
// two to one survey, byte for byte, on every corpus.

/** Which poser a survey used (`DeformSurvey.source`). */
export type DeformSurveySource = 'spine-core' | 'model';

/** What one slot shows of a mesh at one pose, and at what alpha — `shownAt`'s reading. */
export interface ShownReading {
  /** The shown attachment's name, or `null` when the slot shows none. */
  shown: string | null;
  showsThisMesh: boolean;
  slotAlpha: number;
  attachmentAlpha: number;
  alpha: number;
}

/**
 * One posed skeleton as the survey reads it.
 *
 * ⚠️ spine-core's side is a live skeleton: `plain` empties the slot's deform
 * array for good and `withDeform` writes one and empties it again, exactly as
 * the survey always did — the survey reads `deformed` before `plain` on a pose
 * and never after, so the core's side, which holds no state, reads the same.
 */
export interface SurveyPose {
  /** The skin the skeleton wears, off the pose itself (`DeformKeyDraw.under`). */
  under(): string | null;
  shownAt(slotIndex: number, attachment: SurveyMesh): ShownReading;
  /** The mesh's world vertices with the slot's deform as posed. */
  deformed(slotIndex: number, attachment: SurveyMesh): Float32Array;
  /** The same bones with the slot's deform cleared. */
  plain(slotIndex: number, attachment: SurveyMesh): Float32Array;
  /** The same bones with `deform` written into the slot. */
  withDeform(slotIndex: number, attachment: SurveyMesh, deform: ArrayLike<number>): Float32Array;
  /**
   * The doubles those three are stored from — the slot's deform as posed,
   * cleared, or replaced — leaving the pose as it found it. The survey reads
   * the float32 rows; this is what measures the rows' source (`tools/survey_hashes.ts hooks`).
   */
  rows(slotIndex: number, attachment: SurveyMesh, deform: 'posed' | 'cleared' | ArrayLike<number>): number[];
}

/** One slider's dial, posed again and again (`planDial`'s probe, `poseDial`'s solve). */
export interface DialSession {
  /** Whether the slider has a driving bone — `false` on the bone-less form, whose dial is its time. */
  hasBone: boolean;
  /** The driving bone's setup value of `field`. */
  base(field: DialField): number;
  /** Posed with `field` at `candidate` (the slider's time when `field` is `null`): the property read, and `SliderPose.time`. */
  at(field: DialField | null, candidate: number): { read: number; applied: number };
  /** The pose the last `at` left. */
  pose(): SurveyPose;
}

/** The two ways the survey poses: a jump on a track, and a slider's dial. */
export interface SurveyPoser {
  track(skin: SurveySkin | null, animation: string, time: number): SurveyPose;
  /** `null` when the skeleton carries no such slider. */
  dial(skin: SurveySkin | null, slider: SurveySlider): DialSession | null;
}

/** One input write, after resolving the local driver field. A bone-less slider writes its time. */
interface CombinedDialInput {
  slider: SurveySlider;
  field: DialField | null;
  value: number;
}

export interface CombinedSurveyPoser extends SurveyPoser {
  combination(skin: SurveySkin | null, inputs: readonly CombinedDialInput[]): { pose: SurveyPose; applied: ReadonlyMap<string, number> };
}

interface CombinedTarget {
  mesh: SurveyMesh;
  slotIndex: number;
  timelines: Map<string, SurveyDeformTimeline>;
}

interface CombinedSample {
  slider: string;
  value: number;
  animation: string;
  time: number | undefined;
  /** The key at or before time and, between keys, the next key. No key before the first. */
  keys: Array<{ index: number; time: number }>;
}

interface CombinedReversal {
  combination: number;
  skin: string | null;
  slot: string;
  attachment: string;
  samples: CombinedSample[];
  triangles: number;
  reversed: DeformReversal[];
}

export interface CombinedDeformSurvey {
  measured: number;
  unmeasured: number[];
  reversals: CombinedReversal[];
}

function combinedTargets(structure: SurveyStructure, sliders: readonly SurveySlider[], exempt: ReadonlySet<string>) {
  const holders = new Map<SurveySkin | null, Map<SurveyMesh, Map<number, CombinedTarget>>>();
  for (const slider of sliders) {
    const animation = structure.animations.find((a) => a.name === slider.animation);
    if (animation === undefined) throw new CoreInputError(`slider "${slider.name}" has no animation "${slider.animation}" to pose`);
    for (const timeline of animation.deforms) {
      if (timeline.mesh === null || timeline.mesh.triangles.length === 0) continue;
      const { holder } = timeline.placement();
      let meshes = holders.get(holder);
      if (meshes === undefined) holders.set(holder, meshes = new Map());
      let targets = meshes.get(timeline.mesh);
      if (targets === undefined) meshes.set(timeline.mesh, targets = new Map());
      for (const slotIndex of new Set([timeline.slotIndex, ...timeline.mesh.timelineSlots])) {
        if (exempt.has(structure.slotName(slotIndex))) continue;
        let target = targets.get(slotIndex);
        if (target === undefined) targets.set(slotIndex, target = { mesh: timeline.mesh, slotIndex, timelines: new Map() });
        target.timelines.set(slider.name, timeline);
      }
    }
  }
  const groups = new Map<SurveySkin | null, CombinedTarget[]>();
  for (const [holder, meshes] of holders) {
    const targets = [...meshes.values()].flatMap((mesh) => [...mesh.values()]);
    if (targets.length > 0) groups.set(holder, targets);
  }
  return groups;
}

function sampleKeys(frames: ArrayLike<number> | undefined, time: number | undefined): CombinedSample['keys'] {
  if (frames === undefined || time === undefined || frames.length === 0 || time < frames[0]) return [];
  let index = 0;
  while (index + 1 < frames.length && frames[index + 1] <= time) index++;
  const key = { index, time: frames[index] };
  return key.time === time || index === frames.length - 1 ? [key] : [key, { index: index + 1, time: frames[index + 1] }];
}

/** Read explicitly offered poses without changing A39's single-dial survey. */
export function surveyCombinationsWith(structure: SurveyStructure, poser: CombinedSurveyPoser, combinations: readonly DeformSliderCombination[], exempt: ReadonlySet<string>): CombinedDeformSurvey {
  const survey: CombinedDeformSurvey = { measured: 0, unmeasured: [], reversals: [] };
  const sliders = new Map(structure.sliders.map((slider) => [slider.name, slider]));
  const plans = new Map<SurveySkin | null, Map<SurveySlider, DialPlan | null>>();
  for (const [combination, { inputs }] of combinations.entries()) {
    const named = inputs.map(({ slider: name, value }) => {
      const slider = sliders.get(name);
      if (slider === undefined) throw new CoreInputError(`combination ${combination + 1} names unknown slider "${name}"`);
      return { slider, value };
    });
    let measured = false;
    for (const [holder, targets] of combinedTargets(structure, named.map(({ slider }) => slider), exempt)) {
      const skin = holder?.name ?? null;
      let skinPlans = plans.get(holder);
      if (skinPlans === undefined) plans.set(holder, skinPlans = new Map());
      const writes = new Map<string, CombinedDialInput>();
      for (const { slider, value } of named) {
        let plan = skinPlans.get(slider);
        if (plan === undefined) {
          plan = planDial(poser, holder, slider, true);
          skinPlans.set(slider, plan);
        }
        if (plan === null) {
          throw new CoreInputError(`combination ${combination + 1} cannot resolve the driving field of slider "${slider.name}" under skin ${JSON.stringify(skin)}`);
        }
        const key = JSON.stringify(slider.bone === null ? [slider.name] : [slider.bone, plan.field]);
        const prior = writes.get(key);
        if (prior !== undefined && prior.value !== value) {
          throw new CoreInputError(`combination ${combination + 1} gives shared input ${slider.bone}.${plan.field} two values: "${prior.slider.name}"=${prior.value}, "${slider.name}"=${value}`);
        }
        writes.set(key, { slider, field: plan.field, value });
      }
      const { pose, applied } = poser.combination(holder, [...writes.values()]);
      for (const { slider } of named) {
        const time = applied.get(slider.name);
        if (time !== undefined && !Number.isFinite(time)) throw new CoreInputError(`combination ${combination + 1} yields non-finite sample time ${time} for slider "${slider.name}"`);
      }
      for (const { mesh, slotIndex, timelines } of targets) {
        const draw = pose.shownAt(slotIndex, mesh);
        if (!draw.showsThisMesh || draw.alpha === 0) continue;
        const samples = named.map(({ slider, value }): CombinedSample => {
          const time = applied.get(slider.name);
          return { slider: slider.name, value, animation: slider.animation, time, keys: sampleKeys(timelines.get(slider.name)?.frames, time) };
        });
        if (!samples.some((sample) => sample.keys.length > 0)) continue;
        // The rows seam preserves the slot deform for another target read.
        const posed = float32Rows(pose.rows(slotIndex, mesh, 'posed'));
        const cleared = float32Rows(pose.rows(slotIndex, mesh, 'cleared'));
        const before = triangleAreas(cleared, mesh.triangles);
        const after = triangleAreas(posed, mesh.triangles);
        const band = areaBand(before, cleared, posed);
        const slot = structure.slotName(slotIndex);
        const attachment = draw.shown ?? mesh.name;
        if (!Number.isFinite(band)) throw new CoreInputError(`combination ${combination + 1} yields non-finite world geometry for ${slot}/${attachment}`);
        const reversed: DeformReversal[] = [];
        for (const [triangle, area] of before.entries()) {
          if (Math.abs(area) <= band) continue;
          measured = true;
          const end = after[triangle];
          if (Math.abs(end) <= band || Math.sign(area) === Math.sign(end)) continue;
          const t = triangle * 3;
          reversed.push({ triangle, ids: [mesh.triangles[t], mesh.triangles[t + 1], mesh.triangles[t + 2]], before: area, after: end });
        }
        if (reversed.length > 0) survey.reversals.push({ combination: combination + 1, skin, slot, attachment, samples, triangles: before.length, reversed });
      }
    }
    if (measured) survey.measured++;
    else survey.unmeasured.push(combination + 1);
  }
  return survey;
}

/** A pose of the core's, read through the structure's slot names and each mesh's model record. */
function corePose(pose: CoreSurveyPose, structure: SurveyStructure): SurveyPose {
  const slotName = (slotIndex: number): string => {
    const name = structure.slotName(slotIndex);
    if (name === `#${slotIndex}`) throw new CoreInputError(`slot #${slotIndex} is not a slot of the skeleton`);
    return name;
  };
  const recordOf = (attachment: SurveyMesh): { skin: string; slot: string; placeholder: string } => {
    const r = attachment.record;
    if (r === null) throw new CoreInputError(`mesh "${attachment.name}" is in no skin of the skeleton, so it names no model record`);
    return r;
  };
  const world = (slotIndex: number, attachment: SurveyMesh, deform: 'posed' | 'cleared' | ArrayLike<number>): Float32Array =>
    float32Rows(meshWorld(pose, slotName(slotIndex), recordOf(attachment), deform));
  return {
    under: () => pose.doc.skin,
    shownAt: (slotIndex, attachment) => {
      const d = slotDraw(pose, slotName(slotIndex));
      const r = recordOf(attachment);
      const showsThisMesh = d.identity !== null && d.identity === recordIdentity(r.skin, r.slot, r.placeholder);
      return { shown: d.shown, showsThisMesh, slotAlpha: d.slotAlpha, attachmentAlpha: d.attachmentAlpha, alpha: showsThisMesh ? d.slotAlpha * d.attachmentAlpha : 0 };
    },
    deformed: (slotIndex, attachment) => world(slotIndex, attachment, 'posed'),
    plain: (slotIndex, attachment) => world(slotIndex, attachment, 'cleared'),
    withDeform: (slotIndex, attachment, deform) => world(slotIndex, attachment, deform),
    rows: (slotIndex, attachment, deform) => meshWorld(pose, slotName(slotIndex), recordOf(attachment), deform),
  };
}

/**
 * The survey's poses through rigc's own core over the model document
 * (`./core/hooks.ts`). A skin is worn by name — the core's view of one skin
 * (`underSkin`) — so a skeleton declaring two skins of one name, and a pose
 * wearing none, are refused by name: neither reaches the survey through
 * `SkeletonJson` (`placementOf`'s note), and neither has a view to pose.
 * `structure` is whichever reader's: the model document's on a build the core
 * poses, the runtime's where the hooks are held to spine-core's.
 */
export function corePoser(structure: SurveyStructure, doc: CompiledDocument): CombinedSurveyPoser {
  const views = new Map<string, CompiledDocument>();
  const viewOf = (skin: SurveySkin | null): CompiledDocument => {
    if (skin === null) throw new CoreInputError('the survey asked for a pose wearing no skin, and the core poses one skin\'s view');
    if (structure.skinsNamed(skin.name) > 1) throw new CoreInputError(`the skeleton declares two skins named "${skin.name}", and the model names a skin by its name`);
    const cached = views.get(skin.name);
    if (cached !== undefined) return cached;
    const view = underSkin(doc, skin.name);
    views.set(skin.name, view);
    return view;
  };
  return {
    track: (skin, animation, time) => corePose(poseJump(viewOf(skin), animation, time), structure),
    combination: (skin, inputs) => {
      const { pose, applied } = poseDialCombination(viewOf(skin), inputs.map(({ slider, field, value }) =>
        field === null || slider.bone === null ? { slider: slider.name, time: value } : { bone: slider.bone, field, value },
      ));
      return { pose: corePose(pose, structure), applied };
    },
    dial: (skin, slider) => {
      const view = viewOf(skin);
      const record = sliderRecordOf(view, slider.name);
      const boneName = record.bone;
      let last: CoreSurveyPose | null = null;
      return {
        hasBone: boneName !== null,
        base: (field) => {
          const bone = view.bones.find((b) => b.name === boneName);
          if (bone === undefined) throw new CoreInputError(`slider "${slider.name}"'s bone is not a bone of the model document`);
          const v = bone[field];
          return v ?? (field === 'scaleX' || field === 'scaleY' ? 1 : 0);
        },
        at: (field, candidate) => {
          const posed = corePoseDial(view, field === null || boneName === null ? { slider: slider.name, time: candidate } : { bone: boneName, field, value: candidate }, slider.name);
          last = posed;
          return { read: field === null || posed.read === null ? candidate : posed.read, applied: posed.applied };
        },
        pose: () => {
          if (last === null) throw new CoreInputError(`slider "${slider.name}"'s dial was asked for its pose before it was posed`);
          return corePose(last, structure);
        },
      };
    },
  };
}

/**
 * The survey off a model document alone: its structure read by `read` —
 * `modelStructure` unless a control plants a misreading (`DM13`) — and posed
 * through the core, as `surveyOfBuild`'s model path takes it.
 */
export function surveyOfModel(doc: CompiledDocument, exempt: ReadonlySet<string>, read: (doc: CompiledDocument) => SurveyStructure = modelStructure): DeformSurvey {
  const structure = read(doc);
  return { ...surveyWith(structure, exempt, corePoser(structure, doc)), source: { used: 'model', why: null } };
}

export function surveyModelDeformCombinations(doc: CompiledDocument, combinations: readonly DeformSliderCombination[], exempt: ReadonlySet<string>): CombinedDeformSurvey {
  const structure = modelStructure(doc);
  return surveyCombinationsWith(structure, corePoser(structure, doc), combinations, exempt);
}
