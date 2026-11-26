/**
 * What a `deform` key does to the geometry, measured once.
 *
 * ⭐ **One survey, two consumers.** `A39_DEFORM_KEEPS_TRIANGLE_WINDING` reads the
 * reversals out of it and refuses a build; `explain`'s `DEFORM` block prints the
 * whole of it and refuses nothing. That split is issue
 * [#296](https://github.com/rig-c/core/issues/296)'s two halves —
 * [#314](https://github.com/rig-c/core/pull/314) landed the assertion and
 * [#316](https://github.com/rig-c/core/issues/316) the report — and the reason
 * they share this file rather than each posing the skeleton themselves is that
 * the report's `winding 32 of 32 kept` and A39's `8 of 32 reverse` are **the same
 * count**. Two derivations of one number drift, and the one that drifts silently
 * is the one nobody exits non-zero on.
 *
 * ## The frame, and why it is the posed one
 *
 * Both sides of every comparison here are taken at the key's OWN time with the
 * animation applied: the deformed mesh against **the same posed bones with the
 * deform cleared**. Holding the bones at setup instead was tried in #314 and is
 * wrong in principle — a weighted mesh's offsets are authored in bone space
 * against the pose they land in, so setup bones measure a pose that never occurs.
 * Sharing the bones between the two sides is also what makes a MIRRORED slot bone
 * a non-event: a negative determinant flips every triangle on both sides and
 * cancels.
 *
 * ⇒ So every ratio on a key is *the deform's own contribution*, and the
 * denominator is 1.000 by construction rather than by measurement. A block that
 * printed `(setup 1.000)` beside it would be printing the definition.
 *
 * ## What is deliberately NOT here
 *
 * **Deformed coverage.** #296 asked for it and it does not exist: `coverage` is
 * rasterised from the attachment's **uvs** against the part's alpha
 * (`measureAuthoredMeshFit`, called from `src/compile.ts`), and a deform moves
 * positions and never uvs. The figure is therefore identical at every key of
 * every timeline, so a `coverage 100.00% (setup 100.00%)` line would be a
 * tautology dressed as a measurement. What actually moves — how much art each
 * drawn pixel now carries — is the stretch below, and `DR04` in `selftest.ts` is
 * the control that says the coverage figure cannot move.
 *
 * ## What the geometry is not enough to say (issue #401)
 *
 * A winding is a claim about **drawn** pixels: A39's own message says the mesh
 * "draws its texture backwards there", and that sentence is false when the slot
 * draws nothing at that time. So each key also carries `draw` — the attachment
 * the slot actually shows and the alpha it shows it at, both read off the same
 * posed skeleton the geometry came from. A key whose `draw.blank` is set is
 * measured and then **passed over by name**: a triangle that draws no pixels
 * cannot draw them backwards. It is per key and per time, never per slot —
 * `invariants.deformMayFold` is the per-slot instrument and it is a declaration,
 * not a measurement.
 *
 * ## And what a key is not enough to say either (issue #403)
 *
 * The keys are where the data is; they are not where the runtime is. Between two
 * of them it interpolates, so a deform inside its fold angle at every key can be
 * past it in between and no key-time measurement looks there. `scanDeformSpan`
 * closes that, and the derivation is in its own comment: the reversal condition
 * over a span has a **closed form** — a quadratic in the interpolation fraction —
 * so the time is solved for rather than searched, and the measurement taken there
 * is this file's ordinary one, at a time no key lands on.
 *
 * ## And WHICH frame, when the animation is never on a track (issue #407)
 *
 * Everything above says *at the key's own time*, and until #407 that meant one
 * thing: the animation played on track 0. An animation a **slider** applies is
 * never played that way — spine-core says so itself, in
 * `SkeletonData.findSliderAnimations`: *"Slider animations are designed to be
 * applied by slider constraints rather than on their own."* The slider picks the
 * time out of a bone property, so **the key's time and the applied time are the
 * same number by construction**; posing the animation on a track while its own
 * slider applies it at the neutral is a frame no playthrough contains, and it
 * reported a fold on a rig that is correct.
 *
 * ⇒ So a deform key is posed at the **reach** its animation actually has
 * (`DeformReach`): on a track when nothing applies it, and otherwise once per
 * slider, with that slider's own mapping inverted and its driving bone moved
 * until the runtime selects this key's time. Inverting the constraint away
 * instead was considered and refused for A39's own reason — a slider's animation
 * may carry bone tracks that move the very bones the offsets are authored
 * against, so dropping it reintroduces "setup bones measure a pose that never
 * occurs" one level up.
 *
 * ⚠️ **What the artifact cannot say, and this therefore does not:** whether a
 * slider's animation is ALSO played on a track somewhere. Nothing in skeleton
 * data records that, so a slider-applied animation is measured in its slider
 * frames only. Two sliders on one animation are two frames and both are measured
 * — one frame's pass never hides another's fold — but a consumer that plays a
 * slider animation on a track as well is outside what this can see.
 *
 * ## Where the halves live (issue #1025, cut 4c-3)
 *
 * Everything above that names no runtime class — the measurements, the
 * survey's interface to its posers, the core's poser and the survey off a
 * model document — is `./deformsurvey.ts`, moved there unchanged so that
 * A39's model-side supplier can reach the survey without reaching spine-core.
 * This file is spine-core's reader and poser and the entries that choose
 * between the two, and re-exports every name it exported before.
 */
import {
  AnimationState,
  AnimationStateData,
  type Attachment,
  AtlasAttachmentLoader,
  type Bone,
  type CurveTimeline,
  DeformTimeline,
  FromProperty,
  FromRotate,
  FromScaleX,
  FromScaleY,
  FromShearY,
  FromX,
  FromY,
  MeshAttachment,
  Physics,
  Skeleton,
  type SkeletonData,
  SkeletonJson,
  type Skin,
  Slider,
  SliderData,
  TextureAtlas,
  type Timeline,
} from '@esotericsoftware/spine-core';
// #969: the core's side of the seam — the model document read.
import { readModel } from './core/index.ts';
// #1019: what the survey reads of the skeleton's structure, and the model document's reading of it.
import {
  modelStructure,
  type SurveyAnimation,
  type SurveyCurve,
  type SurveyDeformTimeline,
  type SurveyMesh,
  type SurveySkin,
  type SurveySlider,
  type SurveyStructure,
} from './deformstructure.ts';
// Issue #1025 (cut 4c-3): the half of the survey that names no runtime class.
import { BEZIER_POINTS, corePoser, surveyCombinationsWith, surveyWith, type CombinedSurveyPoser, type DeformSurvey, type DialField, type ShownReading, type SurveyPose } from './deformsurvey.ts';
import type { DeformSliderCombination } from './types.ts';
// Issue #1052: the choice of reader and poser over a build is `./deformbuild.ts`'s, where an entry that links nothing of
// the runtime can load it; this file's half of it — the survey through spine-core — is registered into the seam below.
import type { DeformSurveyInput } from './deformbuild.ts';
import { registerSpineSurvey, SpineRuntimeError, spineRuntimeSentence, SURVEY_RUNTIME_TAIL } from './spine_side.ts';

export { BEZIER_POINTS, DEFORM_AREA_EPSILON, float32AreaNoise, stretchSingularValues, surveyOfModel, triangleAreas, unreachableWhy } from './deformsurvey.ts';
export { surveyOfBuild } from './deformbuild.ts';
export type { DeformSurveyInput } from './deformbuild.ts';
export type {
  DeformDial,
  DeformDialDispute,
  DeformDialTie,
  DeformExtreme,
  DeformFrameMeasure,
  DeformKeyDraw,
  DeformKeyMeasure,
  DeformReach,
  DeformReversal,
  DeformSpan,
  DeformSpanCurve,
  DeformSurvey,
  DeformSurveyRecord,
  DeformSurveySource,
  DialSession,
  DialSpan,
  ShownReading,
  SurveyPose,
  SurveyPoser,
} from './deformsurvey.ts';


/**
 * Load an emitted pair through the real spine-core, without touching the pages.
 *
 * `TextureAtlas` needs only the atlas TEXT — the page sizes and region rectangles
 * are in it — so this runs on a build whose `--out` was never written, which is
 * what `explain` is. Reading the PNGs is `posableFromText`'s job and it needs
 * them because it rasterises.
 */
export function skeletonDataFromText(skeletonText: string, atlasText: string): SkeletonData {
  const atlas = new TextureAtlas(atlasText);
  return new SkeletonJson(new AtlasAttachmentLoader(atlas)).readSkeletonData(JSON.parse(skeletonText));
}

/**
 * Measure every deform key of every animation.
 *
 * `exempt` holds slot names to pass over — A39 hands it `invariants.deformMayFold`
 * so a declared fold is not measured at all. ⚠️ The **report** hands it an empty
 * set on purpose: an exempted slot is the one an author most wants figures for,
 * and a report that went quiet where the gate does would leave the only surface
 * that can say anything about a declared fold saying nothing.
 *
 * ⭐ Not the same thing as `draw.blank` on a key, and the difference is the whole
 * of issue #401: `exempt` is a **declaration** about a slot for all time and is
 * not measured, `draw.blank` is a **measurement** of one key at one time and
 * cannot be declared. A key that draws nothing is still surveyed and still
 * printed; what it is not is gated.
 */
export function surveyDeformKeys(data: SkeletonData, exempt: ReadonlySet<string> = new Set()): DeformSurvey {
  const side = runtimeSide(data);
  return { ...surveyWith(side.structure, exempt, side.poser), source: { used: 'spine-core', why: null } };
}

export function surveySpineDeformCombinations(data: SkeletonData, combinations: readonly DeformSliderCombination[], exempt: ReadonlySet<string>) {
  const { structure, poser } = runtimeSide(data);
  return surveyCombinationsWith(structure, poser, combinations, exempt);
}

/**
 * Which `BonePose` field spine-core's own reader is named for — off the ARTIFACT,
 * which is the second, independent answer the probe below is checked against
 * (issue #419).
 *
 * ⭐ This is an identity, not a dispatch table. `SliderData.property` is one of
 * six classes the parser built out of the rig spec's `property` field, so asking
 * which class it is asks the file what the author wrote; it says nothing about
 * *how* the value is computed, which is the part #407 was careful never to
 * transcribe and which the probe still measures.
 *
 * `null` for a reader this file does not know — unreachable against spine-core
 * 4.3, which has exactly these six, and deliberately not folded into a default:
 * a seventh reader in some later runtime must be **named** in the report, not
 * silently mapped to whatever the probe happened to find.
 */
function readerField(property: FromProperty): DialField | null {
  if (property instanceof FromRotate) return 'rotation';
  if (property instanceof FromX) return 'x';
  if (property instanceof FromY) return 'y';
  if (property instanceof FromScaleX) return 'scaleX';
  if (property instanceof FromScaleY) return 'scaleY';
  if (property instanceof FromShearY) return 'shearY';
  return null;
}

/**
 * A fresh skeleton with `skin` worn, which is what every pose below starts from.
 *
 * ## Why a skin, and why this one
 *
 * A deform timeline is keyed on a `skin / slot / attachment` triple, so the mesh
 * it deforms belongs to exactly one skin — and a skeleton nobody dressed shows
 * only what `SkeletonData.defaultSkin` holds. Posing with no skin therefore read
 * a slot that showed **nothing** for every mesh an author had moved into a named
 * skin, and the whole survey then reported the rig as undrawn: `A39` went from
 * PASS to SKIP with a sentence that blamed the rig for what the measurement was
 * doing (issue #583). `placementOf` already recovers which skin holds a
 * timeline's attachment, so the pose can wear it.
 *
 * ## What `setSkin` changes, off the runtime rather than from memory
 *
 * `Skeleton.setSkinBySkin` (spine-core 4.3.13 `Skeleton.js:292-313`) puts the
 * skin's art into each slot's pose and calls `updateCache`, and `updateCache`
 * (`Skeleton.js:142-187`) is where the other two thirds live: a `skinRequired`
 * bone is `active` only if the worn skin lists it, and a `skinRequired`
 * constraint only if `skin.constraints` includes it. Both were measured on this
 * fixture before the repair and both were silent in their own way —
 *
 *  - a slider whose driving bone is skin-required reads a world property that
 *    **nothing moves** while the bone is inactive, so `planDial` found no
 *    responding field, returned `null`, and the animation was reported as
 *    *"played on a track"* — an animation only a slider ever applies;
 *  - a skin-required slider **constraint** is left out of the update cache, so
 *    `SliderPose.time` never leaves its setup value and every key came back as
 *    *"at a time no dial selects"*.
 *
 * Each pose below then calls `setupPose()`, which re-resolves every slot's setup
 * attachment through `Skeleton.getAttachment` — the worn skin first, then
 * `defaultSkin` (`Skeleton.js:335-346`) — so wearing the skin before the pose is
 * the whole of what is needed and nothing has to be re-attached afterwards.
 *
 * ⭐ It takes the `Skin` **object**, not its name. `placementOf` found it by
 * identity, and `findSkin` resolves a name to the FIRST skin that carries it —
 * so a round trip through the name would hand the runtime a different skin on a
 * skeleton that declares two of one name, and there would be nothing in the
 * output to say so. `src/render.ts`'s `skeletonUnderSkin` takes a name because
 * its name came from `--skin` on the command line and refusing an unknown one
 * **by name, with the names that would have worked** is the whole of its job;
 * here there is no name to refuse and no lookup that can fail.
 */
function skeletonUnderSkin(data: SkeletonData, skin: Skin | null): Skeleton {
  const skeleton = new Skeleton(data);
  if (skin !== null) skeleton.setSkin(skin);
  return skeleton;
}

/** The `Slider` on `skeleton` that `data` describes, or `null`. */
function sliderOn(skeleton: Skeleton, data: SliderData): Slider | null {
  for (const constraint of skeleton.constraints) {
    if (constraint instanceof Slider && constraint.data === data) return constraint;
  }
  return null;
}

/**
 * The `offsets` argument every `FromProperty.value` takes.
 *
 * `Slider.offsets` is a private all-zero array — a slider has no per-property
 * offset the way a transform constraint does — so this is that constant, spelled
 * out because it cannot be imported.
 */
const DIAL_ZERO_OFFSETS = [0, 0, 0, 0, 0, 0];

/**
 * The skeleton of `data`, posed by `animation` at `time`.
 *
 * By the same route A10 steps an animation, and with a fresh state every call:
 * that is what lands the sample exactly ON `time` rather than one update short of
 * it, and it is why a probe between two keys is as trustworthy as a key.
 */
function poseAt(data: SkeletonData, skin: Skin | null, animation: string, time: number): Skeleton {
  const posed = skeletonUnderSkin(data, skin);
  const state = new AnimationState(new AnimationStateData(data));
  state.setAnimation(0, animation, false);
  posed.setupPose();
  posed.update(0);
  posed.updateWorldTransform(Physics.reset);
  state.update(time);
  state.apply(posed);
  posed.update(time);
  posed.updateWorldTransform(Physics.update);
  return posed;
}

/**
 * `CurveTimeline.curves`, which is `protected` and is read anyway.
 *
 * ⚠️ A deliberate reach into the runtime's own storage, in the one file whose
 * whole job is reading what the runtime will do. The public surface is
 * `getCurvePercent(time, frame)` — a fraction at a time — and the scan needs the
 * inverse and the reachable range, which no sequence of forward evaluations
 * gives exactly: the breakpoints of the polyline it interpolates over are
 * precisely what this array holds, and any other route to them would be sampling
 * with a spacing to defend. The alternative considered and rejected was
 * re-deriving the sampling from the four bezier handles in the emitted JSON,
 * which would be a **second** derivation of the runtime's own arithmetic — the
 * thing this file's opening paragraph forbids — and would then be checking
 * rigc's copy of spine-core's maths rather than spine-core's.
 *
 * ⚠️ That alternative is what the model document's reader does since issue
 * #1019, and the objection does not reach it, because it is not a copy written
 * here: it is the core's own deform curve (`bezierPolyline` with
 * `DEFORM_CURVE_END`, `./core/deform.ts`), the one the core POSES with, measured
 * against the runtime there. On a build the core poses, the pose and the span
 * scan read one derivation rather than two, and `DM12` (the gallery) and
 * `tools/survey_hashes.ts structure` (every corpus row) hold its points to this
 * array's. What spine-core's reader of the survey reads
 * is still this array.
 *
 * `A05` already gates the emitted curve arrays, and `DW18` is the control that
 * the reading here matches what the runtime does with them.
 *
 * Exported for `validate.ts`'s `curveChannelValues` (issue #752), which asks the
 * same array what values a constraint's `mix` timeline poses between its keys —
 * so the reach into protected storage stays one reach, in this file.
 */
export function curveStorage(timeline: CurveTimeline): ArrayLike<number> {
  return (timeline as unknown as { curves: ArrayLike<number> }).curves;
}

/**
 * The mesh's world vertices with one deform array written into the slot.
 *
 * The array is copied rather than aliased: for an unweighted attachment with no
 * `vertices` on its key, `SkeletonJson` stores the ATTACHMENT'S OWN setup array
 * as that key's deform, and handing the runtime a live reference to it would let
 * a later write edit the mesh itself.
 */
function worldWithDeform(
  posed: Skeleton,
  slotIndex: number,
  attachment: MeshAttachment,
  deform: ArrayLike<number>,
): Float32Array {
  const count = attachment.worldVerticesLength;
  const slot = posed.slots[slotIndex];
  const array = slot.appliedPose.deform;
  array.length = deform.length;
  for (let i = 0; i < deform.length; i++) array[i] = deform[i];
  const world = new Float32Array(count);
  attachment.computeWorldVertices(posed, slot, 0, count, world, 0, 2);
  array.length = 0;
  return world;
}

/**
 * What one slot shows of one mesh at the pose it is currently in, and at what
 * alpha — with no opinion about whether that is a reason for anything.
 *
 * `alpha` is `slot.color.a × attachment.color.a`, which is the product
 * `src/render.ts` builds a piece's tint from; it is 0 when the slot shows some
 * other attachment, because then none of this mesh is on screen. The skeleton's
 * own colour is deliberately not a factor: it is runtime state a consumer sets,
 * not something the skeleton data can say, and `src/render.ts` does not read it
 * either.
 */
function shownAt(posed: Skeleton, slotIndex: number, attachment: MeshAttachment): ShownReading {
  const pose = posed.slots[slotIndex]?.appliedPose;
  const shown: Attachment | null = pose?.attachment ?? null;
  // The same comparison `DeformTimeline.applyToSlot` makes before it writes
  // anything, so "shown" here means exactly "the runtime deforms it here".
  const showsThisMesh = shown !== null && shown.timelineAttachment === attachment;
  const slotAlpha = pose?.color.a ?? 0;
  const attachmentAlpha = shown instanceof MeshAttachment ? shown.color.a : 1;
  return {
    shown: shown?.name ?? null,
    showsThisMesh,
    slotAlpha,
    attachmentAlpha,
    alpha: showsThisMesh ? slotAlpha * attachmentAlpha : 0,
  };
}

/**
 * Which skin holds this attachment, and under which placeholder — the other two
 * thirds of the `skin/slot/attachment` triple the format keys a deform timeline
 * on, and the triple `explain` already prints for the timeline itself.
 *
 * ⚠️ Recovered by identity rather than by name. A `DeformTimeline` carries the
 * attachment it RESOLVED to and neither the skin it came out of nor the
 * placeholder it was written as, and those two are not the same string in
 * general: a skin puts its own attachment behind a shared placeholder, which is
 * the whole point of skins. So the scan compares the attachment object, and the
 * placeholder printed is the one the spec wrote.
 *
 * ⭐ The `Skin` it found comes back with the name, because that object is what
 * the pose wears (`skeletonUnderSkin`, issue #583). Handing the pose the name
 * instead would resolve it again through `SkeletonData.findSkin`, which returns
 * the FIRST skin of that name — a second resolution that can land somewhere else
 * on a skeleton declaring two, and land there silently.
 *
 * `holder` is `null` only when no skin carries this attachment at all. Nothing
 * reaches that through `SkeletonJson`, which resolves a deform timeline's
 * attachment out of a skin before it can build the timeline, so it is the
 * defensive branch and not a case: the pose then wears nothing and behaves
 * exactly as every pose here did before #583.
 */
function placementOf(
  data: SkeletonData,
  slotIndex: number,
  attachment: Attachment,
): { skin: string; holder: Skin | null; placeholder: string } {
  for (const skin of [data.defaultSkin, ...data.skins]) {
    if (!skin) continue;
    const entries: Array<{ placeholder: string; attachment: unknown }> = [];
    skin.getAttachmentsForSlot(slotIndex, entries as Parameters<typeof skin.getAttachmentsForSlot>[1]);
    for (const entry of entries) {
      if (entry.attachment === attachment) return { skin: skin.name, holder: skin, placeholder: entry.placeholder };
    }
  }
  return { skin: 'default', holder: null, placeholder: attachment.name };
}

// --- #1019 the runtime's reading of the structure: begin ---
//
// `src/deformstructure.ts` states what the survey reads of a skeleton's
// structure and gives the model document's reading of it. This is the other
// one — the survey's reads as they always were, off spine-core's parsed
// `SkeletonData`, moved behind the interface unchanged — and the spine-core
// poser over the same objects. The two are made together because the poser
// needs the parsed objects the handles stand for: a handle the model
// document's reader made carries none, and is refused here by name.

/** The parsed objects behind the runtime reader's handles — what spine-core's poser is handed. */
interface RuntimeLinks {
  skin(handle: SurveySkin | null): Skin | null;
  mesh(handle: SurveyMesh): MeshAttachment;
  slider(handle: SurveySlider): SliderData;
}

/**
 * The slot timelines' key times on `slots` — every timeline carrying a
 * `slotIndex`, duck-typed (see `scanDeformSpan`'s visibility split).
 *
 * ⭐ Duck-typed rather than matched against a list of classes, because a list
 * is a thing that goes stale when the format grows a timeline and the failure
 * would be silent.
 */
function visibilityKeyTimes(timelines: readonly Timeline[], slots: ReadonlySet<number>): number[] {
  const times: number[] = [];
  for (const timeline of timelines) {
    const carrier = timeline as unknown as { slotIndex?: unknown };
    if (typeof carrier.slotIndex !== 'number' || !slots.has(carrier.slotIndex)) continue;
    const entries = timeline.getFrameEntries();
    for (let i = 0; i < timeline.getFrameCount(); i++) times.push(timeline.frames[i * entries]);
  }
  return times;
}

/**
 * spine-core's parsed skeleton read as the survey's structure, and posed by
 * spine-core — the survey as it always was (the section's note).
 */
function runtimeSide(data: SkeletonData): { structure: SurveyStructure; poser: CombinedSurveyPoser; links: RuntimeLinks } {
  const skins = new Map<Skin, SurveySkin>();
  const skinBack = new Map<SurveySkin, Skin>();
  const skinOf = (skin: Skin | null): SurveySkin | null => {
    if (skin === null) return null;
    let handle = skins.get(skin);
    if (handle === undefined) {
      handle = { name: skin.name };
      skins.set(skin, handle);
      skinBack.set(handle, skin);
    }
    return handle;
  };
  const meshes = new Map<MeshAttachment, SurveyMesh>();
  const meshBack = new Map<SurveyMesh, MeshAttachment>();
  const meshOf = (attachment: MeshAttachment, slotIndex: number): SurveyMesh => {
    const already = meshes.get(attachment);
    if (already !== undefined) return already;
    const placed = placementOf(data, slotIndex, attachment);
    const handle: SurveyMesh = {
      name: attachment.name,
      triangles: attachment.triangles,
      worldVerticesLength: attachment.worldVerticesLength,
      weighted: attachment.bones !== null,
      timelineSlots: attachment.timelineSlots,
      record: placed.holder === null ? null : { skin: placed.skin, slot: data.slots[slotIndex]?.name ?? `#${slotIndex}`, placeholder: placed.placeholder },
    };
    meshes.set(attachment, handle);
    meshBack.set(handle, attachment);
    return handle;
  };
  const deformOf = (timeline: DeformTimeline): SurveyDeformTimeline => {
    const attachment = timeline.attachment;
    const mesh = attachment instanceof MeshAttachment ? meshOf(attachment, timeline.slotIndex) : null;
    return {
      slotIndex: timeline.slotIndex,
      mesh,
      frames: timeline.frames,
      vertices: (frame) => timeline.vertices[frame],
      curve: (frame): SurveyCurve => {
        const curves = curveStorage(timeline);
        const code = curves[frame];
        // 1 is STEPPED and 0 LINEAR; 2 + i is BEZIER, its sampled points starting at `i`.
        if (code === 1) return { kind: 'stepped' };
        if (code === 0) return { kind: 'linear' };
        const points: number[] = [];
        for (let i = code - 2, n = code - 2 + BEZIER_POINTS * 2; i < n; i++) points.push(curves[i]);
        return { kind: 'bezier', points };
      },
      placement: () => {
        const placed = placementOf(data, timeline.slotIndex, attachment);
        return { skin: placed.skin, holder: skinOf(placed.holder), placeholder: placed.placeholder };
      },
    };
  };
  const animations: SurveyAnimation[] = data.animations.map((anim) => ({
    name: anim.name,
    deforms: anim.timelines.flatMap((timeline) => (timeline instanceof DeformTimeline ? [deformOf(timeline)] : [])),
    slotKeyTimes: (slots) => visibilityKeyTimes(anim.timelines, slots),
  }));
  const sliderBack = new Map<SurveySlider, SliderData>();
  const sliders: SurveySlider[] = [];
  for (const constraint of data.constraints) {
    if (!(constraint instanceof SliderData)) continue;
    // The animation and the property are read when they are used, as they always were: only a slider with an
    // animation is planned, and only one with a bone has a property — a bone-less one's is not set at all.
    const handle: SurveySlider = {
      name: constraint.name,
      mix: constraint.setupPose.mix,
      animation: constraint.animation?.name ?? '',
      get duration() {
        return constraint.animation.duration;
      },
      bone: constraint.bone?.name ?? null,
      local: constraint.local,
      get stated() {
        return readerField(constraint.property);
      },
      get reader() {
        return constraint.property.constructor.name;
      },
      get from() {
        return constraint.property.offset;
      },
      to: constraint.offset,
      scale: constraint.scale,
      loop: constraint.loop,
    };
    sliders.push(handle);
    sliderBack.set(handle, constraint);
  }
  const structure: SurveyStructure = {
    skins: [data.defaultSkin, ...data.skins].flatMap((k, i, all) => (k !== null && all.indexOf(k) === i ? [skinOf(k) as SurveySkin] : [])),
    animations,
    sliders,
    slotName: (index) => data.slots[index]?.name ?? `#${index}`,
    skinsNamed: (name) => data.skins.filter((k) => k.name === name).length,
  };
  const foreign = (what: string): Error => new Error(`internal: spine-core's poser was handed a ${what} another reader made — it poses the parsed skeleton's own objects`);
  const links: RuntimeLinks = {
    skin: (handle) => {
      if (handle === null) return null;
      const skin = skinBack.get(handle);
      if (skin === undefined) throw foreign(`skin "${handle.name}"`);
      return skin;
    },
    mesh: (handle) => {
      const mesh = meshBack.get(handle);
      if (mesh === undefined) throw foreign(`mesh "${handle.name}"`);
      return mesh;
    },
    slider: (handle) => {
      const slider = sliderBack.get(handle);
      if (slider === undefined) throw foreign(`slider "${handle.name}"`);
      return slider;
    },
  };
  return { structure, poser: spinePoser(data, links), links };
}
// --- #1019 the runtime's reading of the structure: end ---

/** A live spine-core skeleton, read the way the survey always read it. */
function spinePose(skeleton: Skeleton, links: RuntimeLinks): SurveyPose {
  return {
    under: () => skeleton.skin?.name ?? null,
    shownAt: (slotIndex, handle) => shownAt(skeleton, slotIndex, links.mesh(handle)),
    deformed: (slotIndex, handle) => {
      const attachment = links.mesh(handle);
      const count = attachment.worldVerticesLength;
      const world = new Float32Array(count);
      attachment.computeWorldVertices(skeleton, skeleton.slots[slotIndex], 0, count, world, 0, 2);
      return world;
    },
    plain: (slotIndex, handle) => {
      const attachment = links.mesh(handle);
      const count = attachment.worldVerticesLength;
      const slot = skeleton.slots[slotIndex];
      slot.appliedPose.deform.length = 0;
      const world = new Float32Array(count);
      attachment.computeWorldVertices(skeleton, slot, 0, count, world, 0, 2);
      return world;
    },
    withDeform: (slotIndex, handle, deform) => worldWithDeform(skeleton, slotIndex, links.mesh(handle), deform),
    rows: (slotIndex, handle, deform) => {
      const attachment = links.mesh(handle);
      const slot = skeleton.slots[slotIndex];
      const array = slot.appliedPose.deform;
      const kept = [...array];
      if (deform === 'cleared') array.length = 0;
      else if (deform !== 'posed') {
        array.length = deform.length;
        for (let i = 0; i < deform.length; i++) array[i] = deform[i];
      }
      const out = new Array<number>(attachment.worldVerticesLength);
      attachment.computeWorldVertices(skeleton, slot, 0, attachment.worldVerticesLength, out, 0, 2);
      array.length = kept.length;
      for (let i = 0; i < kept.length; i++) array[i] = kept[i];
      return out;
    },
  };
}

/** The survey's poses through spine-core — the recipes the survey has always taken (`poseAt`; the dial below). */
function spinePoser(data: SkeletonData, links: RuntimeLinks): CombinedSurveyPoser {
  return {
    track: (skin, animation, time) => spinePose(poseAt(data, links.skin(skin), animation, time), links),
    combination: (skin, inputs) => {
      const skeleton = skeletonUnderSkin(data, links.skin(skin));
      skeleton.setupPose();
      skeleton.update(0);
      for (const { slider, field, value } of inputs) {
        const instance = sliderOn(skeleton, links.slider(slider));
        if (instance === null) throw new Error(`the skeleton has no slider "${slider.name}" to pose`);
        if (field === null) instance.pose.time = value;
        else {
          if (instance.bone === null) throw new Error(`slider "${slider.name}" has no driving bone`);
          instance.bone.pose[field] = value;
        }
      }
      skeleton.updateWorldTransform(Physics.reset);
      const applied = new Map<string, number>();
      for (const instance of skeleton.constraints) {
        if (!(instance instanceof Slider) || !instance.active || instance.bone?.active === false || instance.appliedPose.mix === 0) continue;
        const { animation, loop, name } = instance.data;
        const { time } = instance.appliedPose;
        // A bone-driven, zero-duration loop has all its keys at zero. The
        // runtime reaches those keys even when Slider.update produced NaN.
        const sample = loop && animation.duration === 0 && instance.bone !== null ? 0 : time;
        applied.set(name, loop && animation.duration !== 0 ? sample % animation.duration : sample);
      }
      return { pose: spinePose(skeleton, links), applied };
    },
    dial: (skin, handle) => {
      const slider = links.slider(handle);
      const skeleton = skeletonUnderSkin(data, links.skin(skin));
      const instance = sliderOn(skeleton, slider);
      if (instance === null) return null;
      const bone = instance.bone;
      return {
        hasBone: bone !== null,
        base: (field) => {
          skeleton.setupPose();
          return (bone as Bone).pose[field];
        },
        // `Slider.update`'s own reading, at its own point in the update: the
        // setup pose, `update(0)`, the field (or the time) written, `Physics.reset`.
        at: (field, candidate) => {
          skeleton.setupPose();
          skeleton.update(0);
          if (field !== null && bone !== null) bone.pose[field] = candidate;
          else instance.pose.time = candidate;
          skeleton.updateWorldTransform(Physics.reset);
          if (field === null || bone === null) return { read: candidate, applied: instance.appliedPose.time };
          if (slider.local) bone.appliedPose.validateLocalTransform(skeleton);
          return { read: slider.property.value(skeleton, bone.appliedPose, slider.local, DIAL_ZERO_OFFSETS), applied: instance.appliedPose.time };
        },
        pose: () => spinePose(skeleton, links),
      };
    },
  };
}

/**
 * Both readers and both posers over one build, for measurement:
 * `tools/survey_hashes.ts` holds every hook of the core's poser to
 * spine-core's at tolerance 0 over the runtime's structure (`hooks`), and the
 * model document's structure to the runtime's (`structure`); the selftest's
 * `DM` controls hold the same. `spine` and `core` both pose `structure`'s
 * handles; `model` is the model document's reading, which only `core` and the
 * model's own poser can pose.
 */
export function deformPosers(input: DeformSurveyInput & { modelText: string }): { data: SkeletonData; structure: SurveyStructure; model: SurveyStructure; spine: CombinedSurveyPoser; core: CombinedSurveyPoser } {
  const data = skeletonDataFromText(input.skeletonText, input.atlasText);
  const side = runtimeSide(data);
  const doc = readModel(input.modelText);
  return { data, structure: side.structure, model: modelStructure(doc), spine: side.poser, core: corePoser(side.structure, doc) };
}

/**
 * Touch the runtime once, before the skeleton is parsed through it, and refuse
 * by name when it cannot be used (issue #1019) — the sentence `render` and
 * `check` give a run that needs the runtime and cannot use it
 * (`SpineRuntimeError`, issue #1014). A survey whose input the core poses
 * never comes here.
 */
function requireSpineRuntime(label: string, why: string): void {
  try {
    // A property read on the class the parse starts from: no runtime code runs, and a runtime that cannot be used throws here.
    void TextureAtlas.prototype;
  } catch (err) {
    // The sentence an entry that registered no Spine side is refused in too (`./spine_side.ts`), with the runtime's own words as the reason.
    throw new SpineRuntimeError(spineRuntimeSentence(label, why, (err as Error).message, SURVEY_RUNTIME_TAIL));
  }
}

/**
 * The survey through spine-core — the half of `surveyOfBuild`
 * (`./deformbuild.ts`, moved there unchanged in issue #1052) that names the
 * runtime, registered into the seam when this file is loaded: it touches the
 * runtime once (`requireSpineRuntime`), then reads and poses the Spine
 * skeleton and names `why` as the survey's source. Every program that imports
 * this file surveys as before; one that does not refuses this half by name.
 */
registerSpineSurvey({
  throughSpine: (label, why, input, exempt) => {
    requireSpineRuntime(label, why ?? '--poser spine');
    const side = runtimeSide(skeletonDataFromText(input.skeletonText, input.atlasText));
    return { ...surveyWith(side.structure, exempt, side.poser), source: { used: 'spine-core', why } };
  },
});
