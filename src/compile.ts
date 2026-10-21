/**
 * rigc compile — rig spec + motion spec (+ an optional cut manifest) -> Spine 4.3
 * skeleton JSON and a one-part-per-page atlas. Pure data assembly: no spine-core
 * here (that is the validator's job), no clock, no randomness.
 *
 * Three inputs, one domain each — [`src/rig.ts`](rig.ts) states the split in
 * full. In one line: the **manifest** owns measured art, the **rig spec** owns
 * skeleton structure, the **motion spec** owns time.
 *
 * ⭐ The rig spec is what this file used to hard-code. Until it existed the bone
 * tree and the slot table were three tables in `src/archetype.ts`, a slot outside
 * them was a compile error, and no skeleton anybody else owns could be stated at
 * all (blocker B1). The two things that were genuinely code and stayed code are
 * the **mesh generators** (`src/mesh.ts` — they encode a deformation model, not a
 * table of numbers) and the **coordinate contract** (`src/transform.ts`).
 *
 * Determinism is a contract, not a habit: `validate` re-runs this and compares
 * the two emits byte for byte (assertion A18).
 */
import { basename, dirname, join, relative, resolve } from 'node:path';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { readPngHeader, readPngInfo } from './png.ts';
import {
  DEPTH_TONE_IDENTITY,
  DepthError,
  checkTone,
  checkZScale,
  depthDigest,
  sampleLevel,
  toneLevel,
  turnCeiling,
  type DepthMap,
  type DepthNear,
  type DepthTone,
} from './depth.ts';
import { CompileError, NotImplementedError } from './errors.ts';
import { parseJsonWithPosition } from './json-position.ts';
import { hypot2 } from './numeric.ts';
// The "did you mean" list on a missing atlas region, from the one implementation
// of it — the same search serves `refuseUnknownKeys`, and a second copy here with
// a threshold edited is how such a pair drifts apart.
import { dottedPath, nearMisses, refuseNumbersTheFileCannotCarry, refuseValuesOfTheWrongType, refuseValuesOutsideTheirSet } from './keys.ts';
import type { ShapeVisit } from './keys.ts';
import { MANIFEST_ENUMS, MANIFEST_TYPES } from './types.ts';
import { EVERY_GLOBAL_PHYSICS, parseMotionSpec } from './motion.ts';
import {
  BONE_INHERIT_KNOWN,
  constraintAt,
  declaresNoStage,
  parseRigSpec,
  RIG_FROM_PROPERTIES,
  RIG_PATH_POSITION_MODES,
  RIG_PATH_ROTATE_MODES,
  RIG_PATH_SPACING_MODES,
  RIG_SCALE_Y_MODES,
  RIG_SKIN_CONSTRAINT_KEYS,
  resolveBoneInherit,
  splitRigSkin,
  type RigAttachment,
  type RigBone,
  type RigBoundingBoxAttachment,
  type RigClippingAttachment,
  type RigEvent,
  type RigLinkedMeshAttachment,
  type RigMeshAttachment,
  type RigSegmentsFalloff,
  RIG_INFLUENCE_SHAPES,
  type RigMeshBinding,
  type RigPathAttachment,
  type RigRegionAttachment,
  type RigSequence,
  type RigSkinParts,
  type RigSpec,
  type RigVertexGeometry,
  type RigDepthMap,
  type RigSoftRegion,
} from './rig.ts';
import {
  buildContourMesh,
  buildGridMesh,
  buildRibbonMesh,
  buildRingMesh,
  checkHullOrder,
  bindWeightedVertices,
  formatWalk,
  measureAuthoredMeshFit,
  meshEdges,
  MeshError,
  ringControlAngles,
  buildSegmentsLattice,
  segmentShares,
  influenceShares,
  traceOutline,
  type MeshBoneRef,
  type EntrySegment,
  type SegmentsInfluence,
  type SegmentsFalloff,
  type MeshFitReport,
  type MeshGeometry,
  type MeshVertexWeight,
} from './mesh.ts';
import { meshPieces, shellWord } from './meshsplit.ts';
import { Plate, readPlate } from '../tools/plate.ts';
import {
  extractRegion,
  pageFootprint,
  pageGridSaid,
  pageGridSentence,
  canonicalAtlasShape,
  parseAtlasText,
  rewritePageNames,
  writeAtlasText,
  type AtlasRegion,
  type ParsedAtlas,
} from './atlas.ts';
import {
  float32Step,
  physicsKeyRefusal,
  physicsRuleFor,
  SLOT_COLOR_CHANNELS,
  type PhysicsPoseRule,
  type SlotColorChannel,
} from './timelines.ts';
import { evaluateDeformTransform, type DeformSoftMask } from './deformgen.ts';
import { evaluateTrackDerive, TRACK_DERIVE_PROJECTIONS, type TrackDeriveMember } from './trackgen.ts';
import {
  computeExactFrameTransforms,
  computeWorldTransforms,
  cropToSpineY,
  normaliseDegrees,
  screenToSpineDegrees,
  toBoneLocal,
  toBoneLocalVector,
  toWorld,
  TransformError,
  type BoneTransform,
} from './transform.ts';
import { emitSkeleton, type SkeletonHeader } from './emit_spine.ts';
import { PHYSICS_PARAMS, UNSTATED_REFERENCE_SCALE } from './keyorder.ts';
import { curveLengthTable } from './core/constraints_path.ts';
import { frameRegionName } from './core/uvs.ts';
import { setupBounds, type CoreBounds } from './core/raw.ts';
import { CoreInputError, readModel } from './core/index.ts';
import {
  isModelVertexAttachment,
  modelDocument,
  type CarriedFromCompileResult,
  type CompiledAnimation,
  type CompiledModel,
  type ModelAttachmentTimelines,
  type ModelBinding,
  type ModelBone,
  type ModelBoundingBoxAttachment,
  type ModelClippingAttachment,
  type ModelConstraint,
  type ModelConstraintKind,
  type ModelEditorOrder,
  type ModelEvent,
  type ModelKey,
  type ModelLinkedMeshAttachment,
  type ModelMeshAttachment,
  type ModelPathAttachment,
  type ModelAtlasRect,
  type ModelRegionAttachment,
  type ModelRegionSequence,
  type ModelSequence,
  type ModelSkin,
  type ModelSlot,
  type ModelStage,
  type ModelTimelines,
  type ModelVertexAttachment,
  type ModelVertices,
  type SkinTable,
  type SkinTableEntry,
} from './model.ts';
import type {
  CompileResult,
  CompiledImage,
  DroppedState,
  EasingHandles,
  FaceManifest,
  FaceManifestPart,
  MotionDeformTrack,
  MotionDrawOrderKey,
  MotionEventKey,
  MotionIkTrack,
  MotionMemberValues,
  MotionSequenceTrack,
  MotionSpec,
  MotionTrack,
  MotionTransformTrack,
  MotionValueKey,
  MotionValueTrack,
  RigInfo,
} from './types.ts';

export { CompileError, NotImplementedError };

/** The spine-core line the validator round-trips through. */
export const SPINE_VERSION = '4.3.13';

const FRAME = 1 / 60;

/**
 * The order the emitted `animations` object is keyed in: **the Spine editor's own
 * comparator, read off five JSON round trips through a licensed 4.3.26 editor**
 * (issue #728) — with a name set refused only where those round trips leave the
 * pair's order open.
 *
 * ⚠️ This emitted **codepoint** order until issue #543 and a *family* of natural
 * case-insensitive comparators until #728, and both refusals were the thing that
 * made the emitted order agree with the editor: every pair the candidates could
 * order differently was a `CompileError`. That is sound and it over-refuses by
 * construction, because the quantifier stands in for a measurement — so a rig
 * with a folder in a name, an accent, a capital or a space in it was refused
 * rather than emitted in the order the editor returns. Measuring the comparator
 * instead moves the refusal onto what is still open, and moves no byte: on every
 * set the old rule accepted, the two orders are the same, which is why this is
 * invisible to every rig in the tree.
 *
 * ## Why the emitter has an opinion about this at all
 *
 * A `slider` constraint names the animation it applies, and in JSON that is a
 * name on both sides. The **binary** format is where the same reference is an
 * ordinal — `SkeletonBinary.js`: `constraint.animation = animations[readInt()]`
 * — and an editor whose own model holds that ordinal reads the name at import
 * and writes back whatever now stands at that position. Round-tripped through a
 * licensed editor (data version 4.3.26), `gallery/look` went in as
 * `turn, tilt, sweep` with `yaw -> "turn"` and came back as `sweep, tilt, turn`
 * with **`yaw -> "sweep"`** (issue #535). Nothing in the returned file says so;
 * it parses, it validates, and it applies the wrong animation.
 *
 * ⭐ The second slider is the control that names the mechanism rather than a
 * second victim: `tilt` survived because it sat at index 1 in *both* orderings
 * and index 1 is called `tilt` in both.
 *
 * ⇒ Emitting in the editor's own order makes its re-sort a no-op, so no index
 * moves and no reference is repointed. Measured on the same rig through the
 * same editor: mean absolute error over the re-rendered frames fell from
 * 10.4655 / 8.4961 / 8.7140 to 0.3035 / 0.0769 / 0.0588, and `yaw -> "turn"`
 * came back intact.
 *
 * ## What the editor's comparator is, and which parts of it are known
 *
 * ⚠️ This comment used to say that codepoint order "is what every editor-authored
 * file on hand is in", and that sentence was false when it was written. The
 * counterexample ships with the tests: `examples/spineboy/export/spineboy-pro.json`
 * keys `portal-flare9` **before** `portal-flare10` — in its default skin's
 * attachment map and in two of `portal`'s timeline maps — and no codepoint sort
 * produces that.
 *
 * 🔢 The survey behind that, stated so it can be re-taken rather than believed:
 * over the 12 skeletons in `examples/`, take **every object the format keys by a
 * NAME that carries more than one key** — `animations` and `events`; each skin's
 * `attachments` map and each per-slot map inside it; each animation's `bones`,
 * `slots`, `ik`, `transform`, `path`, `physics`, `events`, and its deform
 * `attachments` at **all three** of its levels (skin, then slot, then attachment
 * name). Arrays are excluded because the editor leaves them alone. That is
 * **105** collections, of which **102** are consistent with a codepoint sort and
 * **3** are not; all 12 natural comparators and all 8 `Intl.Collator`
 * configurations tried reproduce every one of the 105.
 *
 * ⚠️ The deform clause is the whole of what makes it 105 rather than 104, and it
 * is one collection: `animations.hoverboard.attachments.default` in
 * `spineboy-pro.json`, whose four keys are slot names. Counting the skin level
 * of a deform block and stopping there needs an exception the sentence above
 * cannot state — every level of it is keyed by a name, and the editor re-keys
 * each one — so the rule is "every level", and that collection is in.
 *
 * The editor was then measured directly (issue #539). Two rigs, each varying one
 * axis: `Turn, sweep, wave` came back `sweep, Turn, wave`, and
 * `turn10, turn2, zoom` came back `turn2, turn10, zoom`. The intersection leaves
 * one hypothesis — **natural order, case-insensitive** — and that is a *family*
 * of comparators rather than one, which is why #543 refused every pair the family
 * could disagree about rather than choosing a member of it.
 *
 * ⇒ 🔑 **Issue #728 replaced the quantifier with an oracle.** Five name sets went
 * through the licensed 4.3.26 editor as JSON and came back as JSON, and they are
 * in the tree: `fixtures/editor-order/probe{1..5}.{in,out}.json`. They are the
 * only source of what follows, and nothing here is typed from memory —
 * `editorNameOrder` reproduces every one of the ten orders they hold (five skin
 * lists, five animation lists), which the selftest re-derives from the files.
 *
 * What the ten orders establish, each clause with the pair that shows it:
 *
 * - **Case is folded, and folded UP.** `_x` comes back after `z` (`_` is 0x5F —
 *   above `Z`, below `a`), and `ä, é, ß` in that order (0xC4 < 0xC9 < 0xDF). The
 *   fold is per character and only where the character has a single-character
 *   upper case: `ß` is returned at 0xDF, which is where it sorts unfolded, and
 *   **not** among the `S`s — so `toUpperCase()` on the whole string, which writes
 *   `SS`, is refuted.
 * - **A run of digits compares as a number**, at any position and after any
 *   script: `x2 < x10`, `2 < 10`, `中2 < 中10`.
 * - **Two runs that are the same number are deferred, not decided.** `a01` comes
 *   back before `a1b`, so the comparison walked past the equal runs; and `a1`
 *   before `a01`, so the deferred difference — leading zeros later — is what
 *   breaks the tie at the end.
 * - **A space is skipped for the comparison** and the name with fewer of them
 *   wins the tie: `bc < b c = B C < b  c`. The tie-break ORDER is measured too:
 *   `a 1` comes back before `a01`, which fewer-spaces-first would reverse.
 * - **Everything else is code point order after folding**, and punctuation is not
 *   ignorable: `a-1, a.1, a1 … a1b, a_1` places three separate marks by their own
 *   code points, which no punctuation-ignoring collator produces.
 * - **A remaining tie keeps FILE ORDER** (`turn, Turn, TURN`; `b c, B C`; `e, E`;
 *   `x2, X2`; `Mango, mango`). ⭐ So a pair the comparator cannot separate is
 *   *known* rather than ambiguous: the emitted order is the spec's own
 *   declaration order and the editor keeps it, which is why a case-only pair is
 *   no longer refused.
 * - **Folders**: at the root, leaves then folders; inside a folder, sub-folders
 *   then leaves; siblings at every level by the rule above. `h` comes back before
 *   `f/sub1/…`, and `f/sub1/x` before `f/leafA`.
 * - **`skins` and `animations` came back in the same order** — probes 4 and 5
 *   carried one name list as both collections, and both came back identically.
 *   One comparator, measured, which is what lets the two share one certificate.
 *
 * 🔒 The emitted key order is still the one claim in the emitter no gate can see.
 * spine-core reads back everything else rigc writes; it does not sort. What
 * replaces an oracle here is a stored one: the editor's own outputs, in the tree.
 *
 * ⭐ The two-sided result is on editor-written data. Sorting each of the 105
 * collections above by `editorNameOrder` reproduces **105 of 105** — including
 * the three no codepoint sort can — and refuses **none** of them.
 *
 * The comparator is hand-rolled and locale-independent, which `A18` requires:
 * `localeCompare` would make the emitted bytes a property of the machine.
 *
 * Handed to the Spine emitter as its `AnimationOrder` (issue #921): it takes
 * the model's names and `emitAnimations` keys the object in the order this
 * returns, so the refusal below is raised there, inside `compile`, in these
 * words. Exported so the selftest hands it to the emitter the way the assembly
 * does (`MA03`, `MA08`).
 *
 * 🔢 **It returns the order the FILE keys, which is the comparator's order
 * with every integer-like name first** (issue #1034). `animations` is a JSON
 * object, and an object lists a key that is an array index (`5`, `10` — not
 * `01`, `-a` or `2b`) before every other key, in ascending order, whatever
 * order it was filled in. Measured on a probe keying `5, -a, 10, 2b, 01`: the
 * comparator orders `-a, 01, 2b, 5, 10`, and `skeleton.json`, spine-core's
 * `animations` and the `/3` document's `editorOrder` all list
 * `5, 10, -a, 01, 2b`. The emitter keys the object either way, so no byte
 * moves; what moves is every READER of a `rigc-compiled/2` or `/1` document,
 * which derives the file's order by calling this function and was handed the
 * comparator's list (`fileAnimationOrder` below). The comparator's own list is
 * `editorNamesInOrder(names, 'animations')`. Skins are an array and keep the
 * comparator's order (`editorSkinOrder`), and a skin's slot keys come back as
 * an object's keys (`editorSlotKeyOrder`), which are the file's already.
 */
export function editorAnimationOrder(names: readonly string[]): string[] {
  return keyedOrder(editorNamesInOrder(names, 'animations'));
}

/** Where a slider's animation stands in the file and after the editor's re-sort, when the two differ (`sliderAnimationTheEditorRepoints`). */
interface RepointedSlider {
  /** The animation's index in the order the file keys (`editorAnimationOrder`). */
  fileIndex: number;
  /** Its index in the comparator's order, which the editor re-sorts the object into. */
  editorIndex: number;
  /** The animation the editor puts at `fileIndex` — the one the slider comes back naming. */
  becomes: string;
  /** The array-index names the file lists ahead of the comparator's order. */
  indexNames: string[];
}

/**
 * Whether an editor import moves a slider off `animation` — `null` when it does
 * not (issue #1040).
 *
 * 🔁 **Measured, not inferred.** The editor holds a slider's animation by its
 * INDEX in the text's order and re-sorts the `animations` object into its
 * comparator's order (#535). Since #1034 the file's order is the comparator's
 * with every array-index name (`5`, `10`) first, because a JSON object lists
 * those keys first however it was filled. On 2026-10-02 a build keying
 * `5, 10, -a, 01, 2b` went through Spine 4.3.26 and came back
 * `-a, 01, 2b, 5, 10`, with `yaw -> "5"` returned as `yaw -> "-a"` (index 0
 * before and after) and `tilt -> "-a"` as `tilt -> "2b"` (index 2). So the
 * slider moves exactly when its animation's index differs between the two
 * orders, and only then: an array-index name elsewhere in the list repoints
 * nothing, and is not refused.
 *
 * A name set the comparator cannot order is R10's refusal, raised when the
 * animations are emitted; this check has no order to read there and says
 * nothing rather than raising it a second time in other words.
 */
function sliderAnimationTheEditorRepoints(animation: string, names: readonly string[]): RepointedSlider | null {
  let sorted: string[];
  try {
    sorted = editorNamesInOrder(names, 'animations');
  } catch (err) {
    if (err instanceof CompileError) return null;
    throw err;
  }
  const file = keyedOrder(sorted);
  const fileIndex = file.indexOf(animation);
  if (sorted[fileIndex] === animation) return null;
  // An array-index name is one an object lists ahead of a key it was given first — the language's rule, not a restatement of it.
  const indexNames = file.filter((name) => keyedOrder(['\u0000', name])[0] === name);
  return { fileIndex, editorIndex: sorted.indexOf(animation), becomes: sorted[fileIndex], indexNames };
}

/**
 * The order the editor writes a list of skin or animation names in, refusing by
 * name every pair the five round trips leave open.
 *
 * ⭐ The sort is the refusal's own OUTPUT rather than a second reading of the
 * same names: the walk visits every pair and hands back the verdict it certified
 * for each, so "the order rigc emits" and "the order rigc checked" cannot drift
 * into two readings the way a shared comparator still can. The verdict map is
 * nested rather than keyed on a joined string — any character it could join on is
 * one a name is allowed to contain, and two pairs that collided would silently
 * share one verdict.
 *
 * 🔒 Exported because it is what the stored probes are re-derived against. Both
 * emitters are this function with a collection's own sentence attached, so a
 * control that sorts a probe's input list with it is measuring the emit rather
 * than a second implementation of it.
 */
export function editorNamesInOrder(names: readonly string[], collection: 'animations' | 'skins'): string[] {
  const verdicts = refuseNamesTheEditorCouldKeyDifferently(
    names,
    collection === 'skins' ? SKIN_ORDER : ANIMATION_ORDER,
  );
  return [...names].sort((a, b) => verdicts.get(a)?.get(b) ?? 0);
}

/**
 * The skin the editor keeps at index 0 whatever its name sorts as — and the one
 * skin that may not share a placeholder with a named skin
 * (`refuseDefaultSkinContest`).
 *
 * Not exported since #796: `ingest` read it to know which contested entries got
 * no composed name, and nothing is composed any more.
 */
const DEFAULT_SKIN = 'default';

/**
 * The order the emitted `skins` array is written in: **`default` first, then the
 * rest in the order the editor was measured returning them** — with every pair
 * refused on which a comparator consistent with that measurement could disagree.
 *
 * ## Why the emitter has an opinion about this at all
 *
 * The same reason it has one about `animations` (#535), in the collection nobody
 * had checked. `SkeletonBinary` addresses skins by ORDINAL — `skins[readInt()]`
 * for an attachment timeline, `skins[linkedMesh.skinIndex]` for a linked mesh —
 * so an editor that writes this array in another order repoints every such
 * reference, silently, in a file that still parses.
 *
 * ⚠️ `src/types.ts` said for two releases that `skins` was one of the arrays an
 * editor leaves alone, and #544 softened that to *unmeasured* rather than
 * retracting it. Issue #541 measured it: a rig built `default, zulu, mike,
 * alpha` exported `default, alpha, mike, zulu`. Three arrays — `bones` (30),
 * `slots` (24), `constraints` (3) — had come back element for element, and the
 * belief was a generalisation off those three.
 *
 * ## What is measured, and it is two separate facts
 *
 * - **`default` is pinned, not sorted.** `alpha` sorts before `default` under
 *   every candidate comparator and came back *after* it (#541). The stored
 *   probes say it again on names nothing else could explain: probe 1 declares the
 *   skins `2` and `10` and probe 3 declares `A`, each of which folds to a
 *   character below `D`, and all three came back **after** `default`. `default`
 *   is a fixed name in the format — the runtime's own `defaultSkin` is index 0 —
 *   so a skin renamed away from it is an ordinary name and sorts as one.
 * - **The rest are ordered by the same comparator `animations` uses.** ⚠️ This
 *   was the open question until #728, and the answer is measured rather than
 *   inferred: probes 4 and 5 carried one name list as both collections and both
 *   came back in one order. `measuredSkinOrder`, which certified a skin pair only
 *   where the natural family and plain codepoint agreed — because nothing had
 *   ruled codepoint out for skins — is retired by that, together with the two
 *   refusals it alone raised.
 *
 * ⇒ Every skin name in this tree is lower-case ASCII without digits, so no
 * emitted byte moves and no rig is refused. What moves is the claim, and what
 * stops being refused is a rig with capitals, folders or digits in its skins.
 *
 * Exported, with `editorSlotKeyOrder`, because the Spine emitter applies both
 * (`emitSkins` takes them as its `EditorOrder`, issue #919) and the selftest
 * hands them to it the way the assembly does (`MS07`, `MS08`).
 */
export function editorSkinOrder<T extends { name: string }>(skins: readonly T[]): T[] {
  const pinned = skins.filter((skin) => skin.name === DEFAULT_SKIN);
  const rest = skins.filter((skin) => skin.name !== DEFAULT_SKIN);
  // Ranked rather than looked up by name: two skins answering to one name are a
  // defect another check names, and a lookup would silently drop one of them.
  // Equal ranks leave the pair where the spec put it, which is what a tie means.
  const rank = new Map(editorNamesInOrder(rest.map((skin) => skin.name), 'skins').map((name, at) => [name, at]));
  return [...pinned, ...[...rest].sort((a, b) => (rank.get(a.name) ?? 0) - (rank.get(b.name) ?? 0))];
}

/**
 * A skin's `attachments` map keyed in the editor's order of its SLOT names —
 * the comparator `animations` and `skins` use — rather than the draw order the
 * table is built in (issue #716).
 *
 * 🔬 Measured twice, from both directions. The editor's export of a rigc build
 * (`gallery/look`, 4.3.26) returned a skin's 24 slot keys sorted (§10.1 of the
 * guide), and over the twelve exports under `examples/` every skin's slot keys
 * are in this comparator's order — 12 of 12, `spineboy-pro`'s
 * `portal-flare9, portal-flare10` among them, which codepoint would reverse.
 * rigc wrote draw order, and 11 of the twelve rebuilds keyed a skin differently
 * from the export they were rebuilt from.
 *
 * ⚠️ **Unlike `skins` and `animations`, nothing here is refused.** Those two are
 * ordinals in the binary half, so an order rigc cannot certify is a reference it
 * cannot certify. A slot key is read by name (`SkeletonJson` resolves each one
 * with `findSlot`) and is no reference at all, so an order the comparator leaves
 * open is a text rigc cannot promise, not a rig that is wrong — and a key's
 * position is never a verdict. Such a map keeps rigc's order WHOLE, never
 * partly sorted:
 *
 * - a pair the comparator leaves open (`editorNameOrder`'s number, separator and
 *   folder cases). Since #791 a name carrying U+3000 or a full-width digit is
 *   not one: the comparator folds both first (`EDITOR_NAME_FOLD`), which is
 *   what a production map of 95 slot keys was measured to need, so such a map
 *   is sorted where it used to be kept whole — or, with only full-width digits
 *   in it, sorted with the digits at their code points;
 * - any slot name holding `/`. The folder rule was measured on skin and
 *   animation names, which the editor files in folders; slots it files under
 *   bones, and no round trip carried a slot name with a `/` in it.
 *
 * The per-slot maps inside are left as built: their order is the rig's own, the
 * twelve rebuilds already match the exports there (0 of 141 differ), and an
 * attachment name holding `/` is the common case the folder question would
 * have to answer first.
 */
export function editorSlotKeyOrder<T>(attachments: Record<string, T>): Record<string, T> {
  const names = Object.keys(attachments);
  if (names.some((name) => name.includes(NAME_FOLDER))) return attachments;
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      if (typeof editorNameOrder(names[i], names[j]) !== 'number') return attachments;
    }
  }
  const ordered: Record<string, T> = {};
  for (const name of [...names].sort((a, b) => editorNameOrder(a, b) as number)) ordered[name] = attachments[name];
  return ordered;
}

/** What separates a folder from what it holds, in a skin or an animation name. */
const NAME_FOLDER = '/';

/** An ASCII digit — the characters a run of which the editor reads as a number. */
const DIGIT = /[0-9]/;

/** The one whitespace character the round trips measured the editor skipping. */
const MEASURED_SPACE = / /;

/** The reading the round trips leave standing beside it: skip every whitespace. */
const WIDER_SPACE = /\s/;

/** What made a pair's order a matter of opinion, and what the author has to do. */
interface Ambiguity {
  kind: 'number' | 'separator' | 'folder';
  because: string;
  repair: string;
}

/**
 * One name folded the way the round trips returned it, as code points.
 *
 * ⚠️ Per character and UP, and only where the character has a single-character
 * upper case. `'ß'.toUpperCase()` is `'SS'`, and the editor returned `ß` at its
 * own code point rather than among the `S`s — so whole-string `toUpperCase` is
 * refuted and this leaves such a character alone.
 */
function foldUp(name: string): string[] {
  const out: string[] = [];
  for (const char of name) {
    const up = char.toUpperCase();
    out.push([...up].length === 1 ? up : char);
  }
  return out;
}

/** What one reading of the comparison skipped, and what it had left to compare. */
interface ReadName {
  chars: string[];
  skipped: number;
}

/**
 * The characters the editor folds before it compares two names, as
 * `[first, last, to]` code point ranges: each of `first`…`last` is read as
 * `to` plus its offset from `first` (issue #791).
 *
 * 🔬 **Measured on a production set, not on the probes or `examples/`.** One
 * skin's `attachments` map of 95 slot keys, 7 of them carrying U+3000
 * IDEOGRAPHIC SPACE or a full-width digit (U+FF12, U+FF14), came back in an
 * order this comparator reproduces **95 of 95** once U+3000 is read as U+0020
 * and U+FF10–U+FF19 as `0`–`9` — an order neither a plain codepoint sort nor a
 * case-insensitive sort without the fold reproduces. No name in the five probes, the
 * twelve exports or any spec in this tree carries either character, so the set
 * is the only measurement of them there is.
 *
 * ⚠️ **Exactly those two classes, and not `normalize('NFKC')`, although NFKC
 * folds both the same way.** Three readings reproduce the measurement and
 * disagree past it: NFKC (which also turns `ﬁ` into `fi`, `²` and `①` into
 * digits, U+00A0 and U+2000–U+200A into a space, and composes `e` + U+0301
 * into `é`); a classifier that reads every Unicode decimal digit as a digit and
 * every space separator as a space (which also reads `٣` as 3, and does none
 * of NFKC's other folds); and a width fold alone (which also reads `Ａ` as `A`,
 * and folds no other space). What all three agree on is exactly U+3000 and the
 * ten full-width digits — the ten are one class under every reading, so the
 * eight the set did not carry are folded with the two it did — and that
 * intersection is what is applied. Every other character is compared at its own
 * code point as before, and a whitespace character that is not a space is still
 * `leafOrder`'s `separator`.
 *
 * One comparator (#728), so the fold reaches `skins` and `animations` too: an
 * animation name with a full-width digit was compared at the digit's code point,
 * the order the only measurement of such a name contradicts, and a pair that
 * U+3000 decided was refused as `separator` and is now ordered.
 */
export const EDITOR_NAME_FOLD: ReadonlyArray<readonly [number, number, number]> = [
  [0x3000, 0x3000, 0x0020],
  [0xff10, 0xff19, 0x0030],
];

/** `name` with every character `EDITOR_NAME_FOLD` covers read as the character it folds to. */
function foldBeforeComparing(name: string): string {
  let out = '';
  for (const char of name) {
    const code = char.codePointAt(0) ?? 0;
    const range = EDITOR_NAME_FOLD.find(([first, last]) => code >= first && code <= last);
    out += range === undefined ? char : String.fromCodePoint(range[2] + code - range[0]);
  }
  return out;
}

function readName(name: string, skip: RegExp): ReadName {
  const chars: string[] = [];
  let skipped = 0;
  for (const char of foldUp(foldBeforeComparing(name))) {
    if (skip.test(char)) skipped++;
    else chars.push(char);
  }
  return { chars, skipped };
}

/**
 * The editor's order for two names that hold no folder separator, under ONE
 * reading of which characters the comparison skips.
 *
 * `'deferred'` is the one thing this cannot answer: two names whose only
 * difference is several digit runs that are each the same number written two
 * ways, pointing opposite ways. The round trips measured the deferral (`a01`
 * before `a1b`) and the direction (`a1` before `a01`) over ONE such run, and a
 * comparator that keeps the first deferred difference and one that keeps the
 * last are both consistent with that.
 */
function compareLeaf(a: string, b: string, skip: RegExp): number | 'deferred' {
  const ra = readName(a, skip);
  const rb = readName(b, skip);
  const deferred: number[] = [];
  let i = 0;
  let j = 0;
  while (i < ra.chars.length && j < rb.chars.length) {
    const x = ra.chars[i];
    const y = rb.chars[j];
    if (DIGIT.test(x) && DIGIT.test(y)) {
      let ei = i;
      while (ei < ra.chars.length && DIGIT.test(ra.chars[ei])) ei++;
      let ej = j;
      while (ej < rb.chars.length && DIGIT.test(rb.chars[ej])) ej++;
      const runA = ra.chars.slice(i, ei).join('');
      const runB = rb.chars.slice(j, ej).join('');
      const na = BigInt(runA);
      const nb = BigInt(runB);
      if (na !== nb) return na < nb ? -1 : 1;
      // One number written two ways. The editor walked PAST it — `a01` came back
      // before `a1b`, which deciding here would reverse — and settled it at the
      // end, leading zeros later.
      if (runA.length !== runB.length) deferred.push(runA.length < runB.length ? -1 : 1);
      i = ei;
      j = ej;
      continue;
    }
    if (x !== y) return (x.codePointAt(0) ?? 0) < (y.codePointAt(0) ?? 0) ? -1 : 1;
    i++;
    j++;
  }
  if (i < ra.chars.length) return 1;
  if (j < rb.chars.length) return -1;
  // The two tie-breaks, in the order the round trips put them: `a 1` came back
  // before `a01`, which the skipped-character count alone would reverse.
  if (deferred.length > 0) {
    if (deferred.some((one) => one !== deferred[0])) return 'deferred';
    return deferred[0];
  }
  if (ra.skipped !== rb.skipped) return ra.skipped < rb.skipped ? -1 : 1;
  return 0;
}

/**
 * How the editor orders two names that sit in one folder — or what is still open
 * about the pair, and what the author has to do about it.
 *
 * Two readings are compared rather than one chosen, which is the one thing #543's
 * shape got right and is kept: the probes measured the space and nothing else
 * about whitespace, so a pair a tab or a no-break space decides is a pair two
 * readings of the same measurement order differently.
 */
function leafOrder(a: string, b: string): number | Ambiguity {
  const measured = compareLeaf(a, b, MEASURED_SPACE);
  const wider = compareLeaf(a, b, WIDER_SPACE);
  if (measured === 'deferred' || wider === 'deferred') {
    return {
      kind: 'number',
      because:
        `"${a}" and "${b}" hold more than one digit run that is the same number written two ways, and those runs ` +
        'point opposite ways — the round trips measured the editor deferring one such run and never two',
      repair: 'write each number one way — rename so no digit run in either name has a second spelling',
    };
  }
  if (measured !== wider) {
    return {
      kind: 'separator',
      because:
        `the order of "${a}" and "${b}" turns on a whitespace character that is not a space, and the round trips ` +
        'measured the editor skipping the space alone',
      repair: 'rename so the only whitespace in either name is a space',
    };
  }
  return measured;
}

/**
 * How the editor orders two skin or animation names, folders and all — or what
 * the five round trips leave open about the pair.
 *
 * ## It is a certificate, not a hazard list
 *
 * Issue #539 proposed checking for "two names differing only in case, or sharing
 * a prefix followed by digit runs of unequal length". **That list misses the rig
 * that produced the measurement**: `Turn` and `sweep` differ in much more than
 * case and carry no digits, and they are the pair the editor reordered. A list of
 * hazards is open-ended — one was missing the day it was written — so what is
 * implemented is the other direction: an order is returned where the round trips
 * settle the pair, and everything else stops the build.
 *
 * ## The two things they do not settle, and why each is genuinely open
 *
 * - **number** — several digit runs that are each one number written two ways,
 *   disagreeing. `compareLeaf` says why.
 * - **separator** — a whitespace character that is not a space. `leafOrder` says
 *   why.
 * - **folder** — two sibling FOLDERS whose names the comparator cannot separate.
 *   A tie between two leaves is settled (file order), but a tie between two
 *   folders is not the same fact: the editor holds folders as objects and keeps
 *   each one's entries together, and a pairwise verdict of "file order" cannot
 *   express that. No round trip carried two folders one fold apart.
 *
 * ⚠️ What is deliberately NOT refused is a character no probe carried. The
 * alternative would be an allowlist of characters kept by hand — the shape this
 * file already rejects — and the competing reading it would be defending against,
 * a collator that treats punctuation as ignorable, is refuted three times over by
 * probe 4: `a-1`, `a.1` and `a_1` came back placed by `-`, `.` and `_` at their
 * own code points, on either side of the digits.
 */
function editorNameOrder(a: string, b: string): number | Ambiguity {
  const pa = a.split(NAME_FOLDER);
  const pb = b.split(NAME_FOLDER);
  const depth = Math.min(pa.length, pb.length);
  let level = 0;
  while (level < depth && pa[level] === pb[level]) level++;
  if (level === depth) {
    // One name's whole path is the start of the other's: at that level one is a
    // LEAF and the other is the FOLDER of the same name. `x` against `x/y`.
    if (pa.length === pb.length) return 0;
    const shorterLeads = depth === 1;
    return (pa.length < pb.length) === shorterLeads ? -1 : 1;
  }
  // Both sit in the same parent. Which side of the parent they sit on comes
  // first, and only then their names: at the root leaves lead, inside a folder
  // sub-folders do.
  const aIsLeaf = level === pa.length - 1;
  const bIsLeaf = level === pb.length - 1;
  const leavesLead = level === 0;
  if (aIsLeaf !== bIsLeaf) return aIsLeaf === leavesLead ? -1 : 1;
  const verdict = leafOrder(pa[level], pb[level]);
  if (typeof verdict !== 'number' || verdict !== 0) return verdict;
  if (aIsLeaf) return 0;
  return {
    kind: 'folder',
    because:
      `"${a}" and "${b}" sit in the sibling folders "${pa[level]}" and "${pb[level]}", which the comparator ` +
      'leaves in one place — and a tie is kept in file order, which orders two entries but does not say the ' +
      "editor keeps either folder's entries together",
    repair: 'rename one of the two folders so they differ by more than letter case, spacing or a leading zero',
  };
}

/** How many pairs a refusal spells out before it starts counting them instead. */
const PAIRS_SPELLED_OUT = 8;

/**
 * What one collection's order refusal has to say that the others' do not: what
 * it is counting pairs of, and what an order rigc got wrong would cost.
 *
 * Two collections share the walk below because they share the defect — a
 * name-keyed collection whose ORDINAL is a reference in the format's binary half
 * — and they must not share the sentence, because the stakes are different and a
 * reader acts on both.
 *
 * ⚠️ They DO share the certificate, and that is a measurement rather than a
 * convenience: `order` was a field here until issue #728, because `skins` and
 * `animations` had been measured to different depths. Probes 4 and 5 carried one
 * name list as both collections and both came back in one order, so a second
 * comparator would now be a second reading of one measured fact.
 */
interface OrderedCollection {
  /** Plural, for "N pair(s) of …": `animation names`, `skin names`. */
  noun: string;
  /** Why rigc has an opinion, and what the probes leave open. Ends on a space. */
  why: string;
}

const ANIMATION_ORDER: OrderedCollection = {
  noun: 'animation names',
  why:
    'rigc keys the emitted "animations" object in ' +
    "the Spine editor's own comparator, read off five round trips through a licensed 4.3.26 editor (#728) — " +
    'case folded upward, digit runs read as numbers, spaces skipped, leaves before folders at the root and ' +
    'folders before leaves inside one, and a remaining tie left in the order this spec declares. Each pair ' +
    'below is one those round trips leave open. A ' +
    "slider's animation is an ORDINAL in the format's binary half, and an editor that keys these differently " +
    'repoints every slider whose animation moves index — silently, in a file that still parses (#535). ',
};

const SKIN_ORDER: OrderedCollection = {
  noun: 'skin names',
  why:
    'rigc writes the emitted "skins" array with "default" first and the rest in the same comparator the ' +
    '"animations" object is keyed in — one comparator, measured on round trips that carried one name list as ' +
    'both collections (#728) — and each pair below is one those round trips leave open. A skin is an ORDINAL ' +
    "in the format's binary half — " +
    '`skins[readInt()]` for an attachment timeline, `skins[skinIndex]` for a linked mesh — so an editor that ' +
    'writes them in another order repoints every such reference, silently, in a file that still parses. ',
};

/**
 * Refuse a set of names the editor could write in an order rigc did not emit,
 * and hand back the verdict for every pair that survived — the check that lets
 * `editorAnimationOrder` and `editorSkinOrder` sort by a measured family without
 * choosing a member of it.
 *
 * It is deliberately **not** conditional on anything: not on the rig declaring a
 * slider, and not on whether the editor is downstream of it, which a rig spec
 * does not state (the one declaration that did, `invariants.editorRoundTrip`,
 * was retired in issue #1196). A slider is what makes the difference bite today,
 * but the emitted order is a claim about the editor either way, and a check that
 * only ran for some rigs would make the claim hold for some and not others with
 * nothing in the file saying which — adding the slider would then be the edit
 * that refuses a rig that built yesterday. What issue #543 changed is the size of what is claimed, not who it is
 * claimed for.
 *
 * ⚠️ `what` is a parameter and not a second copy of this walk because issue #541
 * found the same defect in a second collection, and a copied loop is how the two
 * come to check different things. It carries the SENTENCE and no longer the
 * comparator: #728 measured that one comparator orders both collections, so the
 * certificate below is one function and there is nowhere left for two readings of
 * it to diverge.
 */
function refuseNamesTheEditorCouldKeyDifferently(
  names: readonly string[],
  what: OrderedCollection,
): Map<string, Map<string, number>> {
  const verdicts = new Map<string, Map<string, number>>();
  const put = (x: string, y: string, v: number): void => {
    const row = verdicts.get(x) ?? new Map<string, number>();
    row.set(y, v);
    verdicts.set(x, row);
  };
  const found: string[] = [];
  for (let i = 0; i < names.length; i++) {
    put(names[i], names[i], 0);
    for (let j = i + 1; j < names.length; j++) {
      const verdict = editorNameOrder(names[i], names[j]);
      if (typeof verdict === 'number') {
        put(names[i], names[j], verdict);
        put(names[j], names[i], -verdict);
      } else {
        found.push(`"${names[i]}" / "${names[j]}" (${verdict.kind}) — ${verdict.because}; ${verdict.repair}`);
      }
    }
  }
  if (!found.length) return verdicts;
  const spelled = found.slice(0, PAIRS_SPELLED_OUT);
  throw new CompileError(
    `${found.length} pair(s) of ${what.noun} have no one order: ${what.why}` +
      `${spelled.join('. ')}` +
      (found.length > spelled.length ? `. …and ${found.length - spelled.length} more pair(s)` : ''), 'CE_COMPILE_EDITOR_NAME_ORDER_AMBIGUOUS',
  );
}

// ---------------------------------------------------------------------------
// number formatting — deterministic, and free of "-0"
// ---------------------------------------------------------------------------

/** Scratch for the two float32 helpers below: one float, and its bits. Written and read within one call. */
const FLOAT32_SCRATCH = new Float32Array(1);
const FLOAT32_BITS = new Uint32Array(FLOAT32_SCRATCH.buffer);

/**
 * Every emitted number: the double whose text is the **shortest decimal that
 * names the number's float32** — the precision the format carries and the text
 * the editor writes — and never `-0`.
 *
 * ## Why float32 and not a decimal grid
 *
 * `spine-core` keeps every number it samples per frame — key times, curve
 * points, vertices, uvs — in a `Float32Array` (`Utils.newFloatArray`), and the
 * editor that defines the format writes each number as the shortest decimal
 * that parses back to its float (`1.0185547`, `0.20835066`, `1.4333333`). Six
 * fixed decimals — this function's predecessor, `r6` — is neither. Below 16 it
 * keeps less than a float holds (`0.2897798` came back as `0.28978`), so a
 * rebuild of an editor export was not the export and `ingest → build → ingest`
 * did not have to be a fixed point: issue #716 measured 16,134 of the 61,645
 * numbers in the twelve example exports rewritten, by up to 7e-7 each, with no
 * `LOSS` line. Above 16 it keeps more than a float holds, text the parser
 * discards on read. Emitting the float's own name loses nothing the runtime can
 * see and states nothing it cannot.
 *
 * ## The text, and why this returns a number
 *
 * `JSON.stringify` prints a double as the shortest text naming THAT double, so
 * the job is to find the double whose text is the float's shortest name: the
 * fewest significant digits (1–9) whose decimal parses back through `JSON.parse`
 * and `Math.fround` — the runtime's own read — to the same float, and among the
 * candidates of that length the one closest to the float, a tie going to the
 * even last digit. That is `Float.toString`'s rule, and it is measured rather
 * than assumed: over the twelve example exports a rebuild reproduces the
 * editor's text on every number (`IG73` in `selftest.ts` holds it there), and
 * the two a round-half-up tie-break gets wrong (`-1897.4062`, `-1.6289062`,
 * both exactly half-way between two candidates) are why the tie clause is here. The distance is compared in exact
 * integer arithmetic, because two decimals equidistant from a float are not
 * reliably equidistant once each has been rounded to a double.
 *
 * ⚠️ **A computed value takes this too, not only a carried one.** `55 / 0.4` is
 * `137.49999999999997` in doubles and is emitted as the float it lands on,
 * `137.5`. What this does NOT do is snap a double's residue to zero: `r6`'s grid
 * was absolute and swallowed anything under 5e-7, a float's is relative, so a
 * residue of 1e-15 is a float in its own right and is emitted as one.
 *
 * 🔒 Exported for one reader: `MX01` in `selftest.ts` defines "on the float32
 * grid" as a fixed point of this function, `f32(x) === x`, and holds every
 * number the model document spells to it or to the six-decimal grid (issue
 * #942). `Math.fround(x) === x` is not that test: this writes `0.2`, whose
 * float is 0.20000000298023224, so it would refuse the emitter's own output.
 */
export function f32(n: number): number {
  const f = Math.fround(n);
  if (f === 0 || !Number.isFinite(f)) return f === 0 ? 0 : f;
  const magnitude = Math.abs(f);
  const sign = f < 0 ? '-' : '';
  for (let p = 1; p <= 9; p++) {
    const [mantissa, exponent] = magnitude.toExponential(p - 1).split('e');
    const nearest = BigInt(mantissa.replace('.', ''));
    const scale = Number(exponent) - (p - 1);
    // The nearest p-digit decimal and its two neighbours: a float's interval is
    // asymmetric at a power of two, so the nearest can miss where a neighbour
    // lands, and a neighbour can land beside it for a tie.
    const named = [nearest - 1n, nearest, nearest + 1n].filter(
      (digits) => digits > 0n && Math.fround(Number(`${digits}e${scale}`)) === magnitude,
    );
    if (named.length === 0) continue;
    const chosen = named.reduce((a, b) => closerDecimal(a, b, scale, magnitude));
    return Number(`${sign}${chosen}e${scale}`);
  }
  // Unreachable — nine significant digits name every float32. Stated rather than
  // assumed, because a fallback here would be a number nobody chose.
  throw new CompileError(`no decimal of at most 9 significant digits names the float32 of ${n}`, 'CE_COMPILE_FLOAT32_DECIMAL_UNREPRESENTABLE');
}

/**
 * A closed-form model's own resolution: 1e-6 in the model's unit. The rounder
 * the two evaluators are handed (`evaluateDeformTransform`,
 * `evaluateTrackDerive`), and nothing else.
 *
 * ⭐ **It is not the file's precision**, which is `f32` and only `f32`: this
 * ends in `f32`, so what a model evaluates to is a float's shortest name like
 * every other emitted number, and the audit a model prints is the file's number
 * to the digit. What the grid does is one step earlier.
 * The models are trigonometry — a sinusoid, a turn, `cos t − 1`, `sin t` — and
 * their identities are exact values float64 misses by ~1e-16: a wave sampled on
 * its zero crossings, a whole revolution (`sin 2π` is −2.4e−16), a pitch of 0.
 * The refusal issue #350 added, *a stated model that evaluates to an all-zero
 * run*, and the identity it is held apart from are both statements about that
 * zero, so the model needs a resolution at which a zero IS a zero.
 *
 * Measured, because the brief for #716 retired this with `r6` and it did not
 * survive contact: handed `f32` instead, the `gallery/nod` build emitted **90**
 * deform offsets like `-1.2246468e-15` on its ears where the model meant 0, and
 * `DT07`/`DT08` in `selftest.ts` went red — the zero-crossing wave and the
 * too-short bend were no longer refused, and `degrees: 360` no longer emitted
 * the identity. A float32 grid is relative and has no zero to land on; this
 * one is absolute, and 1e-6 of a pixel or a degree is below anything the art
 * or the pose can state.
 */
function onModelGrid(n: number): number {
  return f32(Math.round(n * 1e6) / 1e6);
}

/**
 * One number of the header's setup-pose bounding box as `build` writes it
 * (issue #907): the double rigc's core computed — equal to spine-core's
 * `getBounds` at tolerance 0 (`tools/core_gate.ts`'s bounds rows) — on the
 * model's 1e-6 grid at float32 (`onModelGrid`).
 *
 * ⭐ **Why the grid and not the bare float32.** A box edge that sits at the
 * setup pose's origin lands on the residue of a cancellation: gallery/flex's
 * and gallery/ride's lower edge is 1.1368683772161603e-13 — one ulp of 720 —
 * in rigc's core and in `getBounds` alike. A float32 keeps that residue (it is
 * a float in its own right), so the written header followed the platform's
 * libm to the last bit: with every libm-backed `Math` function nudged one ulp,
 * the header of those two rows moved, and with it their documents'
 * `spine.sha256` (`TB02`, which the gallery bases on two machines stand on).
 * On the grid the residue is the 0 it is, and the box is otherwise the box to
 * within half a millionth of a unit — three orders below the 0.0071 by which
 * the editor's own header differs from `getBounds` on the twelve example
 * exports. Exported for the two readers that hold a header to `getBounds`:
 * `tools/core_gate.ts` and the corpus suite (`withRuntimeBox`).
 */
export function headerBoxNumber(n: number): number {
  return onModelGrid(n);
}

/**
 * Of the decimals `a·10^scale` and `b·10^scale` (`a < b`), the one closer to
 * the positive float `f`, compared exactly; a tie goes to the even digit.
 */
function closerDecimal(a: bigint, b: bigint, scale: number, f: number): bigint {
  FLOAT32_SCRATCH[0] = f;
  const bits = FLOAT32_BITS[0];
  const biased = (bits >>> 23) & 0xff;
  const fraction = BigInt(bits & 0x7fffff);
  const significand = biased === 0 ? fraction : fraction | 0x800000n;
  // f = significand·2^power, so the midpoint (a + b)·10^scale / 2 compares with
  // f exactly as (a + b)·10^scale compares with significand·2^(power + 1).
  const doubled = (biased === 0 ? -149 : biased - 150) + 1;
  let midpoint = a + b;
  let float = significand;
  if (scale >= 0) midpoint *= 10n ** BigInt(scale);
  else float *= 10n ** BigInt(-scale);
  if (doubled >= 0) float <<= BigInt(doubled);
  else midpoint <<= BigInt(-doubled);
  if (midpoint < float) return b;
  if (midpoint > float) return a;
  return a % 2n === 0n ? a : b;
}

/** The largest float32 below the float `f`. */
function float32Below(f: number): number {
  FLOAT32_SCRATCH[0] = f;
  if (f > 0) FLOAT32_BITS[0] -= 1;
  else if (f < 0) FLOAT32_BITS[0] += 1;
  else FLOAT32_BITS[0] = 0x80000001;
  return FLOAT32_SCRATCH[0];
}

/**
 * A **key time**, on the same float32 grid — but never rounded UP.
 *
 * ## Why key times get their own quantiser
 *
 * Every other emitted number is a quantity, and for a quantity nearest is the
 * least wrong answer. A key time is not a quantity: it is a **position against a
 * sample grid a player will step**, and the two directions of a half-step error
 * are not equally wrong. Stored below its time, a key fires on the sample it was
 * written for, a float step early, and nothing can see it. Stored above, it
 * fires on the NEXT sample — a whole frame late — and on a stepped timeline that
 * is the wrong picture rather than a slightly wrong value.
 *
 * The arithmetic is not exotic, it is the common case: `2/12 s` and `5/30 s` are
 * both 0.16666666…, the nearest float to that is 0.1666666716337204, and that is
 * larger than either. On the old 1e-6 grid the same thing happened one digit
 * sooner — `r6` emitted 0.166667 — and the spineboy run's muzzle flare fired one
 * 12 fps frame late for exactly that, with no error and no warning, until the
 * run's own frame self-check caught it (issue #99). ⚠️ An attachment timeline is
 * inherently stepped, so it is where this surfaces first — but a rotate key
 * stored late is a frame late too; it just hides inside the interpolation.
 *
 * ## The two cases
 *
 * - **A time that already names a float** — `f32(n) === n`, the text of `n` is a
 *   float's shortest name — is emitted unchanged. That is every key time an
 *   editor export carries (`1.4333333`), so a rebuild writes back the bytes it
 *   read, and every round time an author types (`0.5`, `0.2`). ⚠️ Unchanged is
 *   not the same as stored below: `0.2` is stored at 0.20000000298023224, later
 *   than 0.2, exactly as it is when the editor writes it. That is the format's
 *   own spelling of a round time, and stepping it down would rewrite the
 *   editor's bytes to repair a difference no rigc-built sample grid has at that
 *   time (`S91` in `selftest.ts` is where the gate learned to pose such a key).
 * - **A time off that grid** — `2/12` computed in doubles, a lag or stagger
 *   added to a key — steps to the **largest float32 not above it**, and is
 *   emitted as that float's name. So the float the runtime stores is never
 *   later than the time the author meant. The text may read a hair above the
 *   double it came from (the shortest name of a float is anywhere in its
 *   interval); what is stored is the float, which is below.
 *
 * This is not a second rounding of an emitted number: a time is quantised here
 * once, and `f32` of the result returns it unchanged.
 *
 * ## What it means for Rule 4
 *
 * `checkKeyTime` compares the float a key is stored at, and its tolerance is
 * one float32 step at the duration — `float32Step`, the same function `A09`
 * adds when it re-checks the rule on an emitted file. The fixed 1e-6 epsilon
 * that stood here was a step of `r6`'s grid, and that grid is gone.
 */
function keyTime(n: number): number {
  const named = f32(n);
  if (named === n) return named;
  let f = Math.fround(n);
  if (f > n) f = float32Below(f);
  return f32(f);
}

/**
 * Rule 4, per timeline: no key may land past the animation's declared duration.
 *
 * Rule 4 itself compares one number per animation — the largest key time across
 * every track — so a single track sitting on the declared duration answers for
 * all of them, and a key past the end on some *other* track is invisible to it.
 * That is exactly how rung 6 lost a one-frame attachment reveal.
 *
 * ⚠️ It compares the float a key is **stored** at, not the authored time and not
 * the emitted double: the stored float is the one a player samples. A key that
 * names a float can be stored up to half a step past its own double — `0.2` is
 * — so the tolerance is one float32 step at the duration (`float32Step`), which
 * is the most a correct key placed ON the duration can overshoot it by. Anything
 * further past was authored there: rung 6's 4 dp rounding put a key 3.3e-5 s
 * past a 68/12 s duration, about 70 steps of the float at 5.67 s.
 *
 * This is a refusal rather than an assertion because the key is the thing to
 * change and the motion spec is the file it lives in: the message has to name
 * the track and the key, and by gate time both are gone — the emitted skeleton
 * carries no declared duration at all, which is why Rule 4 exists.
 */
function checkKeyTime(where: string, time: number, authored: number, duration: number): void {
  const past = Math.fround(time) - duration;
  if (past <= float32Step(duration)) return;
  const at = time === authored ? `${time}s` : `t=${authored}, ${time}s after lag/stagger`;
  throw new CompileError(
    `${where}: key at ${at} is ${f32(past)}s past the declared duration ${duration}s — nothing that plays this ` +
      `animation for the duration it declares ever reaches it. Move the key to ${duration}, or declare the ` +
      `duration you meant.`, 'CE_COMPILE_KEY_AFTER_DURATION',
  );
}

/**
 * The one refusal for a key that does not come after the key before it, for
 * every timeline kind (issue #1506) — six call sites used to spell it six times.
 *
 * It names both keys by index and authored time, because the time alone does
 * not say which pair to look at: a generated phrase of four one-second cycles,
 * each written t = 0…1, collides at every cycle boundary, and `(at t=1)` read
 * the same as an ordinary slip. When the two keys share a time AND the keys
 * after the pair repeat the spacing of the keys before it, the period is read
 * off the keys themselves — the second key's time less the first key's — and
 * the message says that the closing key of one cycle is the opening key of the
 * next. Nothing else is inferred: a duplicate with no keys after it, or with
 * keys that do not repeat, carries the pair alone, and the declared `loop` is
 * not consulted because it is a player hint (§4.1) and the boundary is the same
 * either way. The fix is phrased from the runtime rather than from taste:
 * `Animation.apply` wraps a looping time as `time % duration` and the last
 * frame of every curve timeline is stepped, so a track that stops short of its
 * period holds its last key until the wrap rather than easing into t = 0.
 *
 * ⚠️ The repetition is compared in authored seconds within one float32 step of
 * the later key (`float32Step`) — `lag`/`stagger` shift every key of a track by
 * the same amount, so the spacing is the same before and after them.
 *
 * 🔒 **Every key after the pair is held to its periodic position, not a window
 * of them** (issue #1525). The cycle is the `i` keys before the opening key —
 * key 0 through the closing key `i − 1` — and the key `j` places after the
 * opening one must sit at `keys[j mod i].t + period × (1 + floor(j / i))`. A
 * window of `min(i − 1, keys.length − 1 − i)` keys read a phrase of two keys,
 * a duplicate, then one key on the spacing and one off it — the shape
 * `0, a, a, 2a, 2a + b` with `b` not `a` — as a cycle, because the key off the
 * spacing sat past the window. The exam's shape — four cycles of five keys,
 * each written from its start to its end, so the boundary key repeats at keys
 * 4/5, 9/10 and 14/15 — still reads as one: the duplicates further on are the
 * same rule at `j mod i = 0`.
 *
 * 🔒 **The cycle sentence needs the two keys to share an AUTHORED time** (issue
 * #1525), not a stored one: `keyTime` puts a key on the largest float32 not
 * above its time, so two times the author wrote apart can be stored as the
 * same float, or the later one below the earlier. That pair is not a boundary
 * the author repeated, so it gets the clause that says what did happen — the
 * two authored values, the stored ones, and the float32 step there — and never
 * the cycle sentence. "Within two steps" rather than one is measured, not
 * rounded: a time that names its own float (`0.2`) is stored at that float,
 * which can sit up to half a step above it, so a later time up to one and a
 * half steps after it is stored at the same float.
 */
function refuseKeyOrder(
  where: string,
  keys: ReadonlyArray<{ t: number }>,
  i: number,
  stored: number,
  storedBefore: number,
): never {
  const at = keys[i].t;
  const before = keys[i - 1].t;
  const period = at - keys[0].t;
  let repeats = at === before && period > 0 && i + 1 < keys.length;
  for (let j = 1; repeats && i + j < keys.length; j++) {
    const expected = keys[j % i].t + period * (1 + Math.floor(j / i));
    if (Math.abs(keys[i + j].t - expected) > float32Step(keys[i + j].t)) repeats = false;
  }
  const boundary = repeats
    ? `. The keys from t=${keys[0].t} repeat every ${period}s, so key ${i - 1} closes one cycle and key ${i} opens ` +
      `the next at the same time: a phrase that repeats every ${period}s ends one key before its period. Generate ` +
      'each cycle without its closing key and keep that key on the last cycle only — a looping player wraps from ' +
      'it to t=0, and a track that stops short holds its last key until the wrap'
    : '';
  const step = float32Step(stored);
  const quantised =
    at > before
      ? `. The two were written ${at - before}s apart, within two float32 steps of each other (one step at ` +
        `t=${stored} is ${step}s), and a key's time is stored as a float32 no later than the time written: ` +
        (stored === storedBefore ? `both are stored at t=${stored}` : `key ${i} is stored at t=${stored}, before key ${i - 1} at t=${storedBefore}`) +
        `. Separate them by at least ${2 * step}s`
      : '';
  throw new CompileError(
    `${where}: key times must strictly increase — key ${i} at t=${at} does not come after key ${i - 1} at ` +
      `t=${before} (keys counted from 0)${boundary}${quantised}`,
    'CE_COMPILE_KEY_TIMES_NOT_INCREASING',
  );
}

function channelHex(v: number): string {
  const clamped = Math.max(0, Math.min(1, v));
  return Math.round(clamped * 255)
    .toString(16)
    .padStart(2, '0');
}

function rgbaHex(v: number[]): string {
  if (v.length !== 4) throw new CompileError(`rgba value needs 4 channels, got ${v.length}`, 'CE_COMPILE_RGBA_CHANNEL_COUNT');
  return v.map(channelHex).join('');
}

/**
 * A two-colour key's seven channels, as the pair of hex strings the format
 * carries: `light` is `rrggbbaa`, `dark` is `rrggbb`.
 *
 * ⚠️ **Seven and not eight**, and the asymmetry is the format's rather than a
 * simplification here. `RGBA2Timeline.setFrame(frame, time, r, g, b, a, r2, g2,
 * b2)` stores three dark channels and no fourth, and `SkeletonJson`'s `rgba2`
 * branch reads `Color.fromString(keyMap.dark)` into a colour whose alpha it then
 * never passes on. `Color.setFromString` does fill one — `a = hex.length !== 8 ?
 * 1 : …` — so a `dark` written with eight digits loads without complaint and the
 * eighth pair is dropped one line later. Emitting six is emitting what is read.
 *
 * The channel ORDER is the format's too, and it is what a curve array indexes
 * by: `readCurve(…, 0..3, light r/g/b/a)` then `readCurve(…, 4..6, dark r/g/b)`.
 */
function rgba2Hex(v: number[]): { light: string; dark: string } {
  if (v.length !== 7) throw new CompileError(`rgba2 value needs 7 channels, got ${v.length}`, 'CE_COMPILE_RGBA2_CHANNEL_COUNT');
  return { light: v.slice(0, 4).map(channelHex).join(''), dark: v.slice(4, 7).map(channelHex).join('') };
}

/** The five slot colour timelines, which are every `SLOT_TRACKS` shape but `attachment`. */
type SlotColourShape = 'rgba' | 'rgb' | 'alpha' | 'rgba2' | 'rgb2';

/**
 * How one colour key is written, per timeline: how many channels its `v`
 * carries, how the refusal spells that `v`, and the JSON fields the emitted key
 * states them as.
 *
 * ⭐ **Every row is the parser's own reading, and the `v` is always the
 * channels in the order `readCurve` indexes a curve array by** — which is what
 * keeps a key and its raw curve parallel on every shape:
 *
 * - `rgba` → `color: "rrggbbaa"`, four channels (`RGBATimeline`, `frames << 2`).
 * - `rgb` → `color: "rrggbb"`, three. `SkeletonJson`'s `rgb` branch reads the
 *   same `Color.fromString(keyMap.color)` and hands `setFrame` r, g and b alone,
 *   so an alpha pair written there would be read into a colour and dropped one
 *   line later — six digits is emitting what is read.
 * - `alpha` → `value: a`, one channel, read by `readTimeline1` with a per-key
 *   default of **0**. It is a number rather than hex because the format stores
 *   it as one, so it is not quantised onto a byte the way the four hex shapes
 *   are.
 * - `rgba2` → `light: "rrggbbaa"`, `dark: "rrggbb"`, seven (see `rgba2Hex`).
 * - `rgb2` → `light: "rrggbb"`, `dark: "rrggbb"`, six: `RGB2Timeline.setFrame`
 *   takes r g b and r2 g2 b2, and neither colour's alpha.
 *
 * The count is checked before anything is written, with one sentence for all
 * five (`rgba value needs 4 channels, got 3`), because `rgbaHex` and `rgba2Hex`
 * already said exactly that for their two and a family whose members refuse in
 * different words is a family an author has to learn twice.
 */
const COLOUR_KEYS: Record<SlotColourShape, { channels: number; spelling: string; write: (v: number[]) => Record<string, string | number> }> = {
  rgba: { channels: 4, spelling: '[r,g,b,a]', write: (v) => ({ color: rgbaHex(v) }) },
  rgb: { channels: 3, spelling: '[r,g,b]', write: (v) => ({ color: v.map(channelHex).join('') }) },
  alpha: { channels: 1, spelling: '[a]', write: (v) => ({ value: f32(v[0]) }) },
  rgba2: { channels: 7, spelling: '[lr,lg,lb,la,dr,dg,db]', write: (v) => rgba2Hex(v) },
  rgb2: {
    channels: 6,
    spelling: '[lr,lg,lb,dr,dg,db]',
    write: (v) => ({ light: v.slice(0, 3).map(channelHex).join(''), dark: v.slice(3, 6).map(channelHex).join('') }),
  },
};

/** The colour of one key, as its timeline writes it — after the channel count the whole family refuses in one sentence. */
function colourKey(shape: SlotColourShape, v: number[]): Record<string, string | number> {
  const { channels, write } = COLOUR_KEYS[shape];
  if (v.length !== channels) {
    throw new CompileError(`${shape} value needs ${channels} channel${channels === 1 ? '' : 's'}, got ${v.length}`, 'CE_COMPILE_COLOUR_CHANNEL_COUNT');
  }
  return write(v);
}

/** A slot colour channel as a sentence names it. */
const CHANNEL_WORDS: Record<SlotColorChannel, string> = { rgb: 'light rgb', alpha: 'alpha', dark: 'dark colour' };

/**
 * One timeline a `MotionValueTrack` can name: the JSON fields a key carries, the
 * per-key default the parser uses for each, and — where the runtime has one — the
 * bound each field is held to.
 *
 * ⚠️ `bounds` is parallel to `fields`, not keyed by name, because a shape's
 * channels are positional everywhere else in this file (a curve array indexes by
 * channel) and a second addressing scheme for one table is how the two go out of
 * step. `null` in a slot is "the runtime bounds this field nowhere", which is the
 * value for every field of every shape but four of `PHYSICS_TRACKS`'.
 *
 * This is the `compileValueTrack` equivalent of `ConstraintTimelineShape.range`,
 * and the reason it took a change rather than a table entry is that the
 * ik/transform pair never shared this type: they carry named fields per key and
 * go through `compileConstraintTrack`, where `range` already lived (issue #610).
 */
interface ValueTrackShape {
  fields: string[];
  identity: number[];
  bounds?: Array<PhysicsPoseRule | null>;
  /**
   * A timeline whose key holds one NAMED value instead of numbers — the JSON
   * field it is written as, and the resolver that turns a spelling into the
   * name the file carries (or `undefined` for one the runtime cannot resolve).
   *
   * ⚠️ Such a timeline is stepped by the format rather than by choice: its
   * reader builds no curve at all, so an `ease` or a `curve` on its key would be
   * accepted by the parser and never read. `compileValueTrack` refuses both.
   * One entry has it — the bone's `inherit` (issue #733).
   */
  named?: { field: string; resolve: (value: unknown) => string | undefined; known: string };
}

/**
 * Bone timeline shapes: which JSON fields a key carries, and their defaults.
 *
 * The defaults matter more than they look: Spine omits a field that equals the
 * setup value, and `scale` defaults to 1 while `translate` defaults to 0. Emit
 * `x: 0` on a scale key and the bone collapses to nothing, silently.
 *
 * ⭐ **The table IS the dispatch**, the same way `SLOT_TRACKS` is: `resolveTargets`
 * asks `property in BONE_TRACKS` to decide the family, `compileValueTrack` writes
 * a key out of the shape it finds here, and the refusal for a property that is not
 * in it prints `Object.keys` of the same object — so the ten an author is handed
 * cannot disagree with the ten the emitter has, because there is only one list.
 *
 * 🚨 It printed nothing until issue #656. The dispatch was already this table, but
 * a bone track whose property missed it was refused as *"bone X cannot take slot
 * property Y"* — the wrong family for a spelling that usually belongs to none, and
 * the one target family whose refusal offered no way forward. That is also why the
 * selftest's spelling census had to STATE these ten (`PS143`, `PS144`): four
 * families printed their own vocabulary in their refusals and the bone family
 * printed nothing, so there was nothing to read it off.
 */
const BONE_TRACKS: Record<string, ValueTrackShape> = {
  translate: { fields: ['x', 'y'], identity: [0, 0] },
  translatex: { fields: ['value'], identity: [0] },
  translatey: { fields: ['value'], identity: [0] },
  scale: { fields: ['x', 'y'], identity: [1, 1] },
  scalex: { fields: ['value'], identity: [1] },
  scaley: { fields: ['value'], identity: [1] },
  shear: { fields: ['x', 'y'], identity: [0, 0] },
  shearx: { fields: ['value'], identity: [0] },
  sheary: { fields: ['value'], identity: [0] },
  rotate: { fields: ['value'], identity: [0] },
  // The eleventh case of the runtime's bone switch, and the one that keys no
  // number: `InheritTimeline` sets `pose.inherit` at the key and
  // `updateWorldTransform` reads it that frame. Resolved by the SAME call the
  // setup field is (`resolveBoneInherit`), so the five a key may name are the
  // five a bone may rest in and a refusal prints the one list (issue #733).
  inherit: { fields: [], identity: [], named: { field: 'inherit', resolve: resolveBoneInherit, known: BONE_INHERIT_KNOWN } },
};

/**
 * Physics timelines — the eight `SkeletonJson`'s physics branch reads
 * (`SkeletonJson.js:1063-1094`), in the order it reads them. `mix` is the
 * constraint's authority; `reset` is an event with no value — one key at the
 * entry frame stops the constraint from flying in from whatever pose the
 * previous animation left — solved in DATA rather than in caller glue.
 *
 * 🚨 **`identity` here is the PER-KEY default, and for six of the eight it is
 * not the constraint's own default.** The parser sets `defaultValue = 0` at
 * `:1062` and only `mix` reassigns it (`:1090`), so an `inertia` key that omits
 * `value` reads **0** — not the 0.5 that `:306` gives a constraint that states
 * no `inertia`. Two different tables of defaults sit forty lines apart in one
 * file (`PHYSICS_PARAMS` in `src/keyorder.ts` holds the other one), and reading the setup
 * column into this one would emit a `damping` timeline whose omitted keys mean
 * 0.85 to the author and 0 to the runtime. Nothing here depends on the number,
 * because `compileValueTrack` writes every field explicitly — it is recorded
 * because a reader checking rigc against the parser will trip over it.
 *
 * ⚠️ `mass` is the one whose keyed value is not what the runtime stores:
 * `PhysicsConstraintMassTimeline.set` is `pose.massInverse = 1 / value`
 * (`Animation.js:2132-2145`, "The timeline values are not inverted"), so the
 * key states a mass and the pose holds its reciprocal. A `mass` key of 0 is an
 * infinite `massInverse`, and `bounds` below is what refuses it here.
 *
 * ⭐ **`bounds` is not a second opinion about the same numbers.** Each entry is
 * a `PHYSICS_POSE_RULES` row — the one table `A23` judges a setup pose with —
 * and the rule is applied to the POSE FIELD the key becomes rather than to the
 * key, so `mass` is judged as `1 / value` on both sides of the tool. Four of the
 * seven have a rule and three deliberately do not: the runtime bounds `inertia`,
 * `wind` and `gravity` nowhere, and inventing one would refuse correct data
 * (issue #610 — the corpus keys `wind` negative on all 48 of its wind keys).
 */
const PHYSICS_TRACKS: Record<string, ValueTrackShape> = {
  inertia: { fields: ['value'], identity: [0], bounds: [physicsRuleFor('inertia') ?? null] },
  strength: { fields: ['value'], identity: [0], bounds: [physicsRuleFor('strength') ?? null] },
  damping: { fields: ['value'], identity: [0], bounds: [physicsRuleFor('damping') ?? null] },
  mass: { fields: ['value'], identity: [0], bounds: [physicsRuleFor('mass') ?? null] },
  wind: { fields: ['value'], identity: [0], bounds: [physicsRuleFor('wind') ?? null] },
  gravity: { fields: ['value'], identity: [0], bounds: [physicsRuleFor('gravity') ?? null] },
  mix: { fields: ['value'], identity: [1], bounds: [physicsRuleFor('mix') ?? null] },
  reset: { fields: [], identity: [] },
};

/**
 * Path constraint timelines (`animations.<a>.path.<constraint>.<timeline>`).
 *
 * ⭐ Same shape as the physics group — a constraint name, a timeline name under
 * it — which is why they share `compileValueTrack` and a `MotionTrack` rather
 * than getting the `ik`/`transform` treatment: those two are ONE unnamed
 * timeline per constraint and needed a key type of their own, and these are not.
 *
 * `mix` is the exception inside the group: one timeline, three values in a key,
 * three curve channels, in the order the parser reads them (`:1027-1029`). ⚠️ Its
 * `mixY` defaults to the same key's `mixX` in the file, so rigc writes all three
 * out — `compileValueTrack` never omits a field, which is what keeps "the author
 * wrote mixY" and "mixY happened to equal mixX" from emitting the same file.
 */
const PATH_TRACKS: Record<string, ValueTrackShape> = {
  position: { fields: ['value'], identity: [0] },
  spacing: { fields: ['value'], identity: [0] },
  mix: { fields: ['mixRotate', 'mixX', 'mixY'], identity: [1, 1, 1] },
};

/**
 * Slider timelines (`animations.<a>.slider.<constraint>.<timeline>`).
 *
 * ⚠️ `time`'s per-key default is **1**, not 0 (`:1121` passes `defaultValue` 1
 * to `readTimeline1` for both timelines). Nothing here depends on that, because
 * `compileValueTrack` writes every field explicitly — it is recorded because it
 * is the one timeline in the format whose default is neither its own identity nor
 * a copy of a neighbour, and a reader checking rigc against the parser will trip
 * over it.
 */
const SLIDER_TRACKS: Record<string, ValueTrackShape> = {
  time: { fields: ['value'], identity: [1] },
  mix: { fields: ['value'], identity: [1] },
};

/**
 * Slot timelines (`animations.<a>.slots.<slot>.<timeline>`): the two
 * `compileTrack` writes, and which key shape each one is written with.
 *
 * ⭐ **The table IS the dispatch.** `compileTrack` reads the shape out of here
 * to pick its branch, and the refusal for a property that is not in it prints
 * `Object.keys` of the same object — so the list an author is given cannot
 * disagree with the list the emitter has, because there is only one.
 *
 * 🚨 It exists because the dispatch used to be one `if` on `attachment` and a
 * fall-through to rgba, which made **every** other property name a legal
 * spelling of an rgba timeline: `{"slot": "x", "property": "sequence", "v": [0,
 * 0, 0, 0]}` compiled and wrote `slots.x.sequence` with rgba-shaped keys. The
 * gate caught the file (`A00_ROUNDTRIP_PARSE: threw: Invalid timeline type for
 * a slot`, and `A05_CURVE_ARRAY_LENGTH`) and the one-channel spelling of the
 * same mistake was refused at compile as *"rgba value needs 4 channels, got
 * 1"* — a message about a key nobody wrote. It is the shape `A21`'s
 * `meshKinds[slot] || 'ring'` had (issue #44): a default that turns "nothing to
 * emit" into an emission of the wrong thing (issue #650).
 *
 * ⚠️ The KEY is the timeline name as the file carries it, and the VALUE names
 * the branch below that writes its keys — so an entry added here without a
 * branch to write it is an entry emitted in some other timeline's shape, which
 * is the defect this table closed rather than a new affordance.
 *
 * 🎨 `rgb`, `alpha` and `rgb2` joined in issue #730, which makes this the
 * format's whole slot switch (`SkeletonJson.readAnimation`'s six cases, in its
 * order). They are the SEPARABLE colour timelines — each poses a subset of the
 * slot's channels and leaves the rest where they were (`SLOT_COLOR_CHANNELS`)
 * — and they are not spellings of `rgba`. Folding an `rgb` and an `alpha` with
 * their own key times into one `rgba` would have to state each channel at the
 * other's key times, which is a value nobody keyed; and a lone `alpha` has no
 * `rgba` spelling at all, because an `rgba` key poses the light rgb too. So
 * each is emitted as itself, and two tracks of one slot that pose a shared
 * channel are refused rather than layered (see the claim check in `compile`).
 *
 * 🎨 `rgba2` joined in issue #690, and what it adds is the half of the two-colour
 * tint that moves: a slot's `dark` has been an emitted setup field all along
 * (`RigSlot.dark`, step 4 below), with no way to key it. 🚫 Both halves are still
 * refused by `A12_NO_DARK_COLOR`, and that is not a contradiction — A12 is filed
 * `renderer` in `ASSERTION_KIND`, so it states what ONE renderer ignores rather
 * than what is wrong. The `spine` profile `build` runs reports it `PROF` and
 * never applies it; `--profile rig-play` is where it fires. Emitting a
 * construct one consumer drops is exactly what a profile is for.
 */
export const SLOT_TRACKS: Record<string, 'attachment' | SlotColourShape> = {
  attachment: 'attachment',
  rgba: 'rgba',
  rgb: 'rgb',
  alpha: 'alpha',
  rgba2: 'rgba2',
  rgb2: 'rgb2',
};

/**
 * The three constraint families a `MotionTrack` can target, and the table of
 * timelines each one accepts.
 *
 * 🚨 The key here is the field a track names its target with, NOT the property.
 * All three families have a timeline called `mix`, so dispatching on `property`
 * — which is what this file did while `physics` was the only such family — would
 * send a path constraint's mix keys into the physics group, where the parser
 * would look for a physics constraint of that name and throw.
 */
const CONSTRAINT_TRACK_FAMILIES = {
  physics: { tracks: PHYSICS_TRACKS, label: 'physics constraint' },
  path: { tracks: PATH_TRACKS, label: 'path constraint' },
  slider: { tracks: SLIDER_TRACKS, label: 'slider' },
} as const;

type ConstraintTrackFamily = keyof typeof CONSTRAINT_TRACK_FAMILIES;

const CONSTRAINT_TRACK_TARGETS = Object.keys(CONSTRAINT_TRACK_FAMILIES) as ConstraintTrackFamily[];

/**
 * Which family a track belongs to, from the target it names — or null for the
 * slot and bone tracks that name none.
 *
 * The `group` form is physics-only and stays that way: a group of physics
 * constraints is how the ring's four grips are tuned in one track, and no path
 * constraint or slider in this format is ever authored in bulk. A `group` track
 * whose property is one of theirs is refused below rather than silently read as
 * a slot track.
 */
function constraintFamilyOf(track: MotionTrack): ConstraintTrackFamily | null {
  for (const family of CONSTRAINT_TRACK_TARGETS) {
    if (track[family] !== undefined) return family;
  }
  if (track.group !== undefined && track.property in PHYSICS_TRACKS) return 'physics';
  return null;
}

/**
 * One numeric channel of a constraint timeline: the JSON field, the value the
 * parser uses when a key omits it, and — for `mixY` alone — the field it takes
 * that default FROM.
 *
 * Channel order is load-bearing twice over. `readCurve` indexes a curve array by
 * channel (`curve[value << 2]`), so the order here is the order four-number
 * groups concatenate in; and the parser reads the fields in this order, so
 * emitting them in it keeps the file readable against an editor export.
 */
interface ConstraintChannel {
  field: string;
  dflt: number;
  /** `mixY` defaults to the SAME key's `mixX`, not to 1 (`:988`). */
  inheritsFrom?: string;
}

/** A stepped-by-nature boolean on a constraint key. Never a curve channel. */
interface ConstraintFlag {
  field: string;
  dflt: boolean;
}

interface ConstraintTimelineShape {
  channels: ConstraintChannel[];
  flags: ConstraintFlag[];
  /** Per-field bounds, where the runtime documents one. */
  range: Record<string, [number, number]>;
}

/**
 * The two constraint groups that are ONE unnamed timeline per constraint
 * (`animations.<a>.ik.<name>`, `animations.<a>.transform.<name>`).
 *
 * ⚠️ Every field is optional in the file and every one has a per-key default, so
 * omitting a field on one key of a track does not carry the previous key's value
 * forward — it snaps to the default. `compileConstraintTrack` refuses a track
 * whose keys disagree about which fields they name, because that is the shape
 * that loads clean and plays something nobody wrote.
 *
 * The bounds: `IkConstraintPose.mix` is documented as a percentage 0-1 and
 * `softness` as a distance, while every transform mix is documented **unbounded**
 * — so only the IK pair carries a range, and refusing a transform mix above 1
 * would refuse correct data (an over-mix is a real editor idiom).
 */
const CONSTRAINT_TIMELINES: Record<'ik' | 'transform', ConstraintTimelineShape> = {
  ik: {
    channels: [
      { field: 'mix', dflt: 1 },
      { field: 'softness', dflt: 0 },
    ],
    flags: [
      { field: 'bendPositive', dflt: true },
      { field: 'compress', dflt: false },
      { field: 'stretch', dflt: false },
    ],
    range: { mix: [0, 1], softness: [0, Infinity] },
  },
  transform: {
    channels: [
      { field: 'mixRotate', dflt: 1 },
      { field: 'mixX', dflt: 1 },
      { field: 'mixY', dflt: 1, inheritsFrom: 'mixX' },
      { field: 'mixScaleX', dflt: 1 },
      { field: 'mixScaleY', dflt: 1 },
      { field: 'mixShearY', dflt: 1 },
    ],
    flags: [],
    range: {},
  },
};

/**
 * The five components a physics constraint drives. The parameters and their
 * parser defaults are `PHYSICS_PARAMS`, which moved to `src/emit_spine.ts` with
 * the omission it decides (issue #919) and to `src/keyorder.ts`, beside the
 * parser's other defaults, when the compiler stopped importing the emitter for
 * it (issue #1026).
 *
 * `PHYSICS_COMPONENTS` is exported for `ingest.ts`, which omits a constraint that
 * drives none of them (issue #731) and must read "drives" off the same five
 * names this module refuses an empty constraint with, not off a copy.
 */
export const PHYSICS_COMPONENTS = ['x', 'y', 'rotate', 'scaleX', 'shearX'] as const;

// ---------------------------------------------------------------------------
// curves
// ---------------------------------------------------------------------------

/**
 * Graph-view handles -> ABSOLUTE (time, value) control points.
 *
 * `Animation.setBezier` samples the cubic in the (time, value) plane, so the
 * normalised handles an editor shows are NOT what the JSON holds. Writing the
 * handles straight into the file loads without error and produces a different
 * curve.
 *
 * Four numbers PER VALUE CHANNEL, concatenated in channel order. A short array
 * multiplies `undefined` and yields a NaN curve, silently (case 6g).
 */
export function bezierForChannel(
  handles: EasingHandles,
  t1: number,
  t2: number,
  v1: number,
  v2: number,
): [number, number, number, number] {
  const [hx1, hy1, hx2, hy2] = handles;
  return [
    f32(t1 + (t2 - t1) * hx1),
    f32(v1 + (v2 - v1) * hy1),
    f32(t1 + (t2 - t1) * hx2),
    f32(v1 + (v2 - v1) * hy2),
  ];
}

/**
 * True when a key's value channels, AS EMITTED, equal the next key's — a hold.
 *
 * The comparison is on the values the file will hold (`f32`, each number's
 * float32), not on the authored numbers: two values that land on the same float
 * are one value in the file, and the file is what the runtime interpolates and what the editor
 * compares. A multi-channel key holds only when EVERY channel does — a `translate`
 * whose x moves and whose y does not is a moving key.
 */
function isHold(from: number[], to: number[]): boolean {
  return from.length === to.length && from.every((v, c) => f32(v) === f32(to[c]));
}

/**
 * The curve a NAMED easing emits between a key and the next: the bezier its
 * handles describe, or `stepped` when the segment is a hold.
 *
 * A curve over a flat segment draws nothing — the cubic runs from a value to the
 * same value — so the two encodings are one animation, and the editor writes the
 * second: its export rewrites a bezier on a hold as `"curve": "stepped"` (issue
 * #369; 14 keys on the nod example alone, every rendered frame byte-identical
 * either way). Emitting what the editor writes keeps `diff`'s
 * `animations.curve_kinds` from reporting a difference where the animation has
 * none — the same "one meaning, one file" rule under which an authored
 * `offset: 0` on a deform key and an absent one emit the same bytes.
 *
 * ⚠️ Only a NAMED easing takes this path; `rawCurve` does not. A raw `curve` is
 * the escape hatch that states the file's own numbers verbatim, and the editor's
 * own exports DO carry beziers over holds (18 keys across the reference corpus —
 * spineboy-pro, sack-pro, squash-and-stretch), so a transcription has to be able
 * to write one back. Rewriting those would make rigc unable to state what the
 * format holds, which is the blocker `rawCurve` exists to remove. An easing names
 * a SHAPE, and on a hold the editor's encoding of that shape is `stepped`.
 *
 * `hold` is a parameter because "as emitted" is not always `f32` of a number: an
 * rgba key emits a hex string and a deform key emits a run, and each site says
 * what its file value is.
 */
function easingCurve(
  handles: EasingHandles,
  t1: number,
  t2: number,
  from: number[],
  to: number[],
  hold: boolean = isHold(from, to),
): number[] | 'stepped' {
  if (hold) return 'stepped';
  const curve: number[] = [];
  for (let c = 0; c < from.length; c++) curve.push(...bezierForChannel(handles, t1, t2, from[c], to[c]));
  return curve;
}

// ---------------------------------------------------------------------------
// inputs
// ---------------------------------------------------------------------------

/**
 * Which input a JSON path was given as, for the refusal a directory gets: the
 * flag that named it, the file it wants, and whether a file's contents read as
 * one (`null` where no parser exists here — the manifest is cast, not parsed).
 */
interface JsonInputRole {
  flag: '--rig' | '--motion' | '--manifest';
  wants: string;
  reads: ((raw: unknown, where: string) => unknown) | null;
}

const RIG_INPUT: JsonInputRole = { flag: '--rig', wants: 'the rig spec file', reads: parseRigSpec };
const MOTION_INPUT: JsonInputRole = { flag: '--motion', wants: 'the motion spec file', reads: parseMotionSpec };
const MANIFEST_INPUT: JsonInputRole = { flag: '--manifest', wants: 'the cut manifest file', reads: null };

/** The most `.json` names a directory refusal lists before it says how many there are. */
const LISTED_JSON_NAMES = 8;

/**
 * The refusal for an input flag that names a directory (issue #1466): what the
 * flag wants, and what the directory holds — the one file there that reads as
 * that input, named by its path, or every `.json` there when that is not
 * exactly one. Nothing is accepted on the strength of it: the caller is told
 * the path, and the compile still reads only what it was given. The names are
 * sorted, so the sentence is the same on every machine.
 */
function directoryInputRefusal(dir: string, role: JsonInputRole): string {
  const head = `${role.flag} names a directory; it wants ${role.wants} —`;
  const names = readdirSync(dir)
    .filter((name) => name.endsWith('.json') && statSync(join(dir, name)).isFile())
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (names.length === 0) return `${head} ${dir} holds no .json file`;
  const reading = names.filter((name) => {
    if (role.reads === null) return true;
    const file = join(dir, name);
    try {
      role.reads(parseJsonWithPosition(readFileSync(file, 'utf8')), file);
      return true;
    } catch {
      return false;
    }
  });
  if (reading.length === 1) return `${head} ${join(dir, reading[0])} exists there`;
  const listed = (list: string[]): string =>
    list.slice(0, LISTED_JSON_NAMES).join(', ') + (list.length > LISTED_JSON_NAMES ? `, … ${list.length} in all` : '');
  if (reading.length === 0) {
    return `${head} ${dir} holds ${names.length} .json file(s) and none reads as one: ${listed(names)}`;
  }
  return `${head} ${reading.length} .json files in ${dir} read as one, so name it: ${listed(reading)}`;
}

function readJson<T>(path: string, role: JsonInputRole): T {
  let text: string;
  if (existsSync(path) && statSync(path).isDirectory()) {
    throw new CompileError(directoryInputRefusal(path, role), 'CE_COMPILE_JSON_READ_FAILED');
  }
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    throw new CompileError(`cannot read ${path}: ${(err as Error).message}`, 'CE_COMPILE_JSON_READ_FAILED');
  }
  try {
    // A parse failure gets a line/column appended to the runtime's own
    // message — see `parseJsonWithPosition` for why `JSON.parse` alone
    // cannot say where.
    return parseJsonWithPosition(text) as T;
  } catch (err) {
    throw new CompileError(`cannot read ${path}: ${(err as Error).message}`, 'CE_COMPILE_JSON_READ_FAILED');
  }
}

function partWindow(part: FaceManifestPart, manifest: FaceManifest): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  const [x, y] = part.offset;
  const size = part.size ?? [manifest.crop.w, manifest.crop.h];
  return { x, y, w: size[0], h: size[1] };
}

/**
 * The base plate is the part whose window IS the crop, and that is a structural
 * fact rather than a naming convention.
 *
 * It matters twice. A full-frame mesh is a full-frame canvas that can never
 * dirty-skip, so the base must never be
 * a mesh — and the validator recognises the same shape from the other side, which
 * is why assertion A14 already covers this without a new check. And a full-frame
 * region is the one page allowed to be opaque (A19).
 */
function isBasePlate(part: FaceManifestPart, manifest: FaceManifest): boolean {
  const win = partWindow(part, manifest);
  return win.x === 0 && win.y === 0 && win.w === manifest.crop.w && win.h === manifest.crop.h;
}

/** The rig slot a manifest part joins on. See the `parts` mapping below. */
function rigSlotOf(part: FaceManifestPart): string {
  return part.rig_slot ?? part.slot;
}

/** The control bones a mesh part drives, in declaration order. */
function meshControlBones(part: FaceManifestPart): string[] {
  const spec = part.mesh;
  if (!spec) return [];
  const kind = spec.kind ?? 'ring';
  if (kind === 'ribbon') return spec.chain ?? [];
  if (spec.control_bones?.length) return spec.control_bones;
  return spec.control_bone ? [spec.control_bone] : [];
}

// ---------------------------------------------------------------------------
// compile
// ---------------------------------------------------------------------------

export interface CompileOptions {
  /** The rig spec. Required: it is the skeleton's structure. */
  rigPath: string;
  motionPath: string;
  /** Directory the atlas + skeleton will be written to (page names are relative to it). */
  outDir: string;
  /** The cut manifest. Absent for a skeleton with no measured art behind it. */
  manifestPath?: string;
  /** Overrides the rig spec's own `images` directory (CLI `--images <dir>`). */
  imagesDir?: string;
  /**
   * A pre-packed atlas to resolve `image` entries against, instead of loose PNGs
   * (CLI `--atlas-in <file>`). Every region a part names is looked up in this
   * file and its geometry read from it; the emitted atlas is this one, re-anchored
   * to `outDir`. See `resolveFromAtlas`.
   */
  atlasInPath?: string;
  /**
   * `build --copy-images` is copying every page PNG into `outDir` (`src/emit.ts`),
   * so the header's `images` path names `outDir` itself — the parts will sit
   * beside the skeleton file, wherever the rig's own images directory is. The copy
   * itself stays in `cli.ts`; this only tells `skeletonImagesPath` where the parts
   * will be.
   */
  copyImages?: boolean;
}

/**
 * `skeleton.images` — where the editor's import looks for the part images, as a
 * path from the skeleton file (issue #370).
 *
 * The editor reads a build with this field absent, shows every attachment
 * missing, and prints `Images path not found` on the way out, because nothing
 * told it where the parts are — and under `--copy-images` they are RIGHT BESIDE
 * `skeleton.json`, one PNG per part, named as the attachments are. So the field
 * states a fact about the build's own layout, the same fact the atlas's page
 * names already state, and it is derived the same way they are (`relative` from
 * `outDir`, POSIX separators — so two checkouts of one tree emit one file and
 * A18 holds). In precedence order:
 *
 *   1. `--copy-images` → the output directory itself, spelled from the skeleton's
 *      own point of view as `../<its basename>/`. The flag moved the pages next to
 *      the skeleton, and a declared path would be a claim about a layout the flag
 *      replaced — exactly as the flag rewrites the atlas's page names.
 *   2. A declared `skeleton.images` → verbatim. R1: a field the author wrote is
 *      emitted as written.
 *   3. Otherwise the relative path from `outDir` to the ONE directory the spec
 *      names every part PNG in — the rig's images directory, or the manifest's
 *      plates. `partDirs` is that set: read from the spec's own paths, so a
 *      `--atlas-in` build names the same directory its loose twin does (the pack
 *      changed the pixel source, not the rig) and the two skeletons stay
 *      byte-identical. Parts spread over more than one directory have no single
 *      path that is true of all of them, and a rig with no parts has nothing to
 *      point at: neither writes the field. An absence is a fact; a guess is not.
 *
 * ⚠️ Why `../build/` and never `./` for "this very directory": the editor was
 * measured (Spine 4.3.23, CLI import then export, issue #370). It resolves
 * `images` against the skeleton file's directory and re-anchors it to the project
 * on export — `./images` and `../parts/` both come back as a path to the same
 * directory with every part found — but it collapses `./` and `.` to no path at
 * all, after which the parts are found only if the project happens to be saved
 * beside the skeleton. Naming the directory says the same thing in the one
 * spelling the editor keeps.
 *
 * A trailing `/` throughout, as the format page's own example (`"./images/"`)
 * spells it, so `../build/` and `../parts/` read alike.
 */
function skeletonImagesPath(
  declared: string | undefined,
  opts: CompileOptions,
  outDir: string,
  partDirs: Set<string>,
): string | undefined {
  // `outDir` named from inside itself. The filesystem root has no basename to
  // name it by; `./` is the only spelling left there, and nobody builds into `/`.
  const self = basename(outDir) === '' ? './' : `../${basename(outDir)}/`;
  if (opts.copyImages) return self;
  if (declared !== undefined) return declared;
  if (partDirs.size !== 1) return undefined;
  const [partsDir] = partDirs;
  const spelled = relativeImagesPath(outDir, partsDir);
  // `./` is the one spelling the editor collapses to nothing (see above), so
  // "the parts are in this very directory" is said the way the editor keeps.
  // That substitution is the ONLY thing this path does that a rig spec's own
  // `images` does not, which is why the rest of the spelling is one function.
  return spelled === './' ? self : spelled;
}

/**
 * An images directory spelled as a path from the directory of the file that
 * names it — the one convention this repository has for saying where the parts
 * are, in one function rather than in each of its callers (issue #595).
 *
 * Three rules, and each is load-bearing: POSIX separators, so two checkouts of
 * one tree emit one file and `A18` holds; a trailing `/`, as the format page's
 * own example (`"./images/"`) spells it; and `./` on a descendant, so the value
 * reads as a relative path rather than as a bare name.
 *
 * ⚠️ `./` for "the very directory the file is in" is returned rather than
 * decided here, because who reads the field differs. `skeletonImagesPath`
 * replaces it — the editor was measured collapsing a literal `./` to no path at
 * all (issue #370) — while a rig spec's own `images` is read by rigc, which
 * resolves `./` against the spec's own directory and finds the parts.
 *
 * Both callers pass two ABSOLUTE directories, and `relative` reads neither of
 * them off disk — which is what lets `cli.ts` spell a rig spec's `images` for
 * `ingest` here, rather than `src/ingest.ts` growing a notion of an output
 * directory it otherwise has none of.
 */
export function relativeImagesPath(from: string, to: string): string {
  const rel = relative(from, to).split('\\').join('/');
  if (rel === '') return './';
  return rel.startsWith('..') ? `${rel}/` : `./${rel}/`;
}

/**
 * One part = one page. No packer in this shape, so no PMA trap, no rotation, no
 * strip offsets. Region covers the page exactly => u2=v2=1.
 *
 * ⭐ The BODY of the emit moved to [`src/atlas.ts`](atlas.ts) in issue #4, and
 * that is the whole point of the move: `--pack` writes a different arrangement
 * through the same `writeAtlasText`, so "the defaults change nothing" is a
 * property of one function rather than a promise made by two that look alike.
 * The two text-shape traps A07 checks (a region name is the RAW line; a blank
 * line closes a page block) live there now.
 *
 * Exported (rather than inlined into `compile`) so `--copy-images` can call it a
 * second time with `page` rewritten to the copies' filenames, after the copy
 * itself has happened — see [`src/emit.ts`](emit.ts). Everything else about an
 * image (`region`, `width`, `height`) is unchanged by that rewrite; only where the
 * bytes live moved.
 */
export function buildAtlasText(images: CompiledImage[]): string {
  return writeAtlasText(
    images.map((img) => ({
      name: img.page,
      width: img.width,
      height: img.height,
      regions: [
        {
          name: img.region,
          x: 0,
          y: 0,
          width: img.width,
          height: img.height,
          offsetX: 0,
          offsetY: 0,
          originalWidth: img.width,
          originalHeight: img.height,
        },
      ],
    })),
  );
}

// ---------------------------------------------------------------------------
// where a part's pixels come from: a loose PNG, or a region of a packed atlas
// ---------------------------------------------------------------------------

/** One part resolved out of a loose PNG on disk — the default, and unchanged. */
function fromLoosePng(
  relPath: string,
  absPath: string,
  region: string,
  isBase: boolean,
  outDir: string,
): CompiledImage {
  if (!existsSync(absPath)) {
    // Left to `readFileSync` this arrives as a raw ENOENT with a stack, which
    // is the tool telling an agent about its own internals instead of about
    // the rig. The validator's messages are the UI, and so are these.
    throw new CompileError(`image "${relPath}" is not on disk at ${absPath}`, 'CE_COMPILE_IMAGE_MISSING');
  }
  // A loose part IS a page of the atlas this route emits, so it is refused the
  // way a pack's page is (issue #732): by the one reader's sentence, as a
  // CompileError, rather than as that reader's throw with a stack under it.
  const header = readPngHeader(absPath);
  if (header.problem !== null) throw new CompileError(`image "${relPath}": ${header.problem}`, 'CE_COMPILE_IMAGE_PNG_INVALID');
  const info = header.info;
  // Page name is the PNG path *relative to the atlas file*, so the viewer
  // resolves it the way every Spine consumer does: against the atlas URL.
  // The PNGs are not copied: they pass through untouched, and the atlas points
  // at wherever they already live.
  const page = relative(outDir, absPath).split('\\').join('/');
  return { region, page, absPath, width: info.width, height: info.height, hasAlpha: info.hasAlpha, isBase };
}

/** A pre-packed atlas plus where it was read from, so messages can name it. */
interface AtlasSource {
  path: string;
  dir: string;
  parsed: ParsedAtlas;
  /** Trimmed region name -> the region, first occurrence wins (as `findRegion` does). */
  byName: Map<string, { region: AtlasRegion; page: ParsedAtlas['pages'][number] }>;
  /**
   * Page name -> what its file is against what the atlas declares, for every
   * page on disk whose PNG is not the declared size, in page order (issue #750).
   */
  grids: Map<string, NonNullable<CompiledImage['pageGrid']>>;
}

function readAtlasIn(path: string): AtlasSource {
  if (!existsSync(path)) throw new CompileError(`--atlas-in names ${path}, which is not on disk`, 'CE_COMPILE_ATLAS_INPUT_MISSING');
  const parsed = parseAtlasText(readFileSync(path, 'utf8'));
  const byName = new Map<string, { region: AtlasRegion; page: ParsedAtlas['pages'][number] }>();
  for (const page of parsed.pages) {
    for (const region of page.regions) {
      const key = region.name.trim();
      // `TextureAtlas.findRegion` returns the FIRST match, so a sequence's later
      // indices are not separately addressable by name. Mirrored rather than
      // improved on: the runtime is what will resolve these at load time.
      if (!byName.has(key)) byName.set(key, { region, page });
    }
  }
  if (byName.size === 0) throw new CompileError(`--atlas-in ${path} declares no regions`, 'CE_COMPILE_ATLAS_INPUT_EMPTY');
  // 🔒 **What each page IS, where the pack is opened** (issue #732). Every page
  // the pack names reaches the gate — the atlas this build emits is the pack's
  // own text — so a page no reader can open is refused here, all of them in
  // one sentence, rather than one region at a time or at `A06` after the whole
  // compile. A page that is not on disk is left to the region that sits on it,
  // which already names it; saying so twice would be two refusals of one fact.
  //
  // 📐 **What each page MEASURES, read in the same pass and not refused here**
  // (issue #750). A page whose PNG is not the size the atlas declares is a
  // file every runtime still draws — the region mapping is a fraction of the
  // declared size — and the only readers it breaks are the ones that address
  // it in texels. Refusing it here would refuse every pack that has one,
  // including a pack of region attachments nothing reads a texel of, and on
  // `build` it would replace `A06`'s verdict with a compile error for the same
  // fact: `A06` already refuses the pack, names the ratio and prints the
  // `scale:` repair, before anything is written. So the page is RECORDED, as
  // `pageGridSentence` states it, and the readers that would take a figure off
  // its texels decline to on the part that asks (`partTexels` below).
  const unread: string[] = [];
  const grids: AtlasSource['grids'] = new Map();
  for (const page of parsed.pages) {
    const abs = resolve(dirname(path), page.name);
    if (!existsSync(abs)) continue;
    const { info, problem } = readPngHeader(abs);
    if (problem !== null) unread.push(`page "${page.name}": ${problem}`);
    if (info === null) continue;
    const sentence = pageGridSentence(page, info, page.regions);
    if (sentence !== null) grids.set(page.name, { said: pageGridSaid(page, info), sentence });
  }
  if (unread.length > 0) {
    throw new CompileError(
      `--atlas-in ${path}: ${unread.length} of its ${parsed.pages.length} page(s) cannot be read as PNG, and ` +
        `nothing was compiled against the pack — ${unread.join('; ')}`, 'CE_COMPILE_ATLAS_PAGES_UNREADABLE',
    );
  }
  return { path, dir: dirname(path), parsed, byName, grids };
}

/**
 * One part resolved out of a region of a pre-packed atlas — CLI `--atlas-in`.
 *
 * ## What comes from where
 *
 * The join key is the region NAME, which rigc already equates with the PNG
 * basename everywhere else (`addImage`), so a rig spec written against loose
 * parts resolves against a pack of the same parts with no edit. The geometry —
 * `x`/`y`/`width`/`height`/`offsets`/`rotate` — is the atlas's, read rather than
 * invented, and `width`/`height` on the resulting image are the region's
 * `originalWidth`/`originalHeight` **divided by the page's `scale:`**: the
 * UNTRIMMED drawing at its own size, which is what an attachment's width and
 * height mean and therefore what every downstream measurement in this file
 * already expects.
 *
 * ## 🚨 Why the `scale:` divide is not a refinement (issue #267)
 *
 * A region's `originalWidth/Height` are in the PAGE's texels, and a page that
 * declares `scale: 0.5` holds texels half the size of the drawings it was packed
 * from — the field says so in as many words, and `atlasScales`
 * ([`src/render.ts`](render.ts)) already reported it. An attachment's `width` is
 * in world units, and `SkeletonJson` reads it straight out of the JSON
 * (`region.width = map.width * scale`) with the atlas nowhere in the expression,
 * so nothing downstream of rigc will ever undo a scale rigc failed to apply.
 * Taking the texel count as the world size therefore produced a valid skeleton
 * drawn at half size, green, with nothing in the report saying so — and NINE of
 * the ten atlases in the example corpus declare a `scale:`, because an editor
 * pack is routinely coarser than its art.
 *
 * ⚠️ **The divide recovers the drawing to within the pack's own quantisation, not
 * exactly.** The packer wrote `round(drawing x scale)`, so a region 373 texels
 * wide at `scale: 0.5` is consistent with a 745- and a 746-pixel drawing and the
 * pack does not say which. `originalWidth / scale` is the midpoint of that
 * interval — the unbiased estimate — and it is off by at most `0.5 / scale`
 * source pixels (one pixel at `scale: 0.5`). That residual is information the
 * pack destroyed; the only way to be exact is to be handed the loose art, which
 * is the default route. What the divide removes is the factor-of-two error.
 *
 * ## Three refusals, and why none of them can be a warning
 *
 *   * a name the atlas does not carry — the attachment would resolve to no
 *     region, `AtlasAttachmentLoader` returns null and the part silently does
 *     not draw. Refused with the near misses, because the commonest cause is one
 *     character;
 *   * a page the atlas names and the disk does not have — the same silence, one
 *     step further along;
 *   * a rectangle that runs off its page — `region.x + width > page.width` makes
 *     `u2 > 1`, which samples whatever the wrap mode does and is never what the
 *     pack meant. A16-style validity, caught at the point the number is read.
 */
function resolveFromAtlas(
  relPath: string,
  region: string,
  isBase: boolean,
  outDir: string,
  atlas: AtlasSource,
): CompiledImage {
  const found = atlas.byName.get(region);
  if (!found) {
    const near = nearMisses(region, atlas.byName.keys());
    const known = [...atlas.byName.keys()].sort();
    throw new CompileError(
      `image "${relPath}" resolves to region "${region}", which the atlas at ${atlas.path} does not have. ` +
        (near.length ? `Did you mean ${near.map((n) => JSON.stringify(n)).join(', ')}? ` : '') +
        `The atlas declares ${known.length} region(s): ${known.join(', ')}`, 'CE_COMPILE_ATLAS_REGION_UNKNOWN',
    );
  }
  const absPath = resolve(atlas.dir, found.page.name);
  if (!existsSync(absPath)) {
    throw new CompileError(
      `region "${region}" sits on page "${found.page.name}" of ${atlas.path}, which is not on disk at ${absPath}`, 'CE_COMPILE_ATLAS_REGION_PAGE_MISSING',
    );
  }
  // The rectangle ON THE PAGE, which at a quarter turn is not the one `bounds:`
  // states — `pageFootprint` owns that derivation for every reader of it.
  const { width: rectW, height: rectH } = pageFootprint(found.region);
  if (
    found.region.x < 0 ||
    found.region.y < 0 ||
    found.region.x + rectW > found.page.width ||
    found.region.y + rectH > found.page.height
  ) {
    throw new CompileError(
      `region "${region}" is at ${found.region.x},${found.region.y} sized ${rectW}x${rectH} on a ` +
        `${found.page.width}x${found.page.height} page in ${atlas.path}; the rectangle runs off the page, so its ` +
        'UVs would leave the texture', 'CE_COMPILE_ATLAS_REGION_OUTSIDE_PAGE',
    );
  }
  const info = readPngInfo(absPath);
  const page = relative(outDir, absPath).split('\\').join('/');
  const scale = found.page.scale;
  const grid = atlas.grids.get(found.page.name);
  return {
    region,
    page,
    absPath,
    // `f32` for the same reason every other emitted number takes it: 55 / 0.4 is
    // 137.49999999999997 in binary floating point, and the float it lands on is
    // 137.5 — a size is a number the artifact states rather than one it
    // accumulates.
    width: f32(found.region.originalWidth / scale),
    height: f32(found.region.originalHeight / scale),
    hasAlpha: info.hasAlpha,
    isBase,
    atlas: found.region,
    ...(scale === 1 ? {} : { atlasScale: scale }),
    ...(grid === undefined ? {} : { pageGrid: grid }),
  };
}

/**
 * A part's own pixel grid, wherever its bytes live.
 *
 * The only reader of pixels in the compiler is the contour generator, which
 * traces a part's alpha — and a part imported from a pack has no file of its
 * own, only a rectangle of somebody's page. `extractRegion` lifts the drawing
 * back out, so the generator sees the same grid either way and its output does
 * not depend on how the art was delivered.
 *
 * ⭐ *Either way* was not true for a pack that turns a region until issue #570:
 * `extractRegion` refused a `rotate: 90`, so how the art was delivered decided
 * whether a measurement could be taken at all — on a foreign pack, where turning
 * is the norm rather than the exception. It now lifts every rotation, measured
 * as `extractRegion` states (`PKR02` against the runtime's own sampling, `PK29`
 * against the packer's fixture), which is what makes the sentence above a
 * description rather than an aspiration.
 */
function partPlate(img: CompiledImage): Plate {
  const page = readPlate(img.absPath);
  return img.atlas === undefined ? page : extractRegion(page, img.atlas);
}

/**
 * A part's alpha channel on its own grid — where the drawing is, and where it
 * is not.
 *
 * Two readers want exactly this and they used to be one inline loop and one
 * absence: the contour generator traces it, and `sampleMeshDepth` counts the
 * vertices whose depth came from outside it (issue #449). One function so the
 * two cannot come to mean different things by "the part draws here".
 */
function plateAlpha(plate: Plate): Uint8Array {
  const alpha = new Uint8Array(plate.width * plate.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = plate.data[i * 4 + 3];
  return alpha;
}

/**
 * What a dropped state says was consulted and came up empty.
 *
 * ⭐ One renderer, because two printers and a refusal all say this same fact and
 * they used to be three separate expressions. The `--atlas-in` half is the
 * reason it matters: a build that resolved parts against a pack opened no PNG,
 * so "no PNG at parts/x.png" would be a false statement about it and would send
 * the reader to a directory instead of to the pack that is short a region.
 */
export function droppedStateReason(dropped: DroppedState): string {
  return dropped.why ?? `no PNG at ${dropped.path}`;
}

/**
 * Every node of a cut manifest that `MANIFEST_TYPES` has a row for, in document
 * order, named by its dotted path (`parts[2].mesh.center[1]`). A node that is
 * not an object is skipped: whether it should have been one is the reader's
 * refusal, and the rows below it have nothing to type.
 */
function manifestShapeVisits(manifest: unknown): ShapeVisit[] {
  const visits: ShapeVisit[] = [];
  const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
  const at = (node: unknown, shape: keyof typeof MANIFEST_TYPES, path: Array<string | number>): void => {
    if (isRecord(node)) visits.push({ node, shape, name: (tail) => dottedPath([...path, ...tail]) });
  };
  if (!isRecord(manifest)) return visits;
  at(manifest, 'FaceManifest', []);
  for (const field of ['crop', 'axis', 'stroke', 'roi'] as const) at(manifest[field], `FaceManifest.${field}`, [field]);
  for (const [i, part] of (Array.isArray(manifest.parts) ? manifest.parts : []).entries()) {
    at(part, 'FaceManifestPart', ['parts', i]);
    if (!isRecord(part)) continue;
    at(part.mesh, 'FaceManifestMesh', ['parts', i, 'mesh']);
    if (isRecord(part.mesh)) at(part.mesh.bias, 'FaceManifestMesh.bias', ['parts', i, 'mesh', 'bias']);
  }
  return visits;
}

/**
 * Compile a rig spec and a motion spec into Spine 4.3 skeleton data.
 *
 * `compileModel` followed by the emission (issue #1026): the model and what
 * goes beside it come from the one entry that does not call the Spine
 * emitter, and this function hands that model to `emitSkeleton` once. Its
 * result is the shape it always had. Both run under `withDroppedStates`, so a
 * refusal raised after a dropped state was recorded names the missing file
 * (issue #671).
 */
export function compile(opts: CompileOptions): CompileResult {
  return withDroppedStates((droppedStates) => {
    const { model, header, atlasText, declaredDurations } = compileInto(opts, droppedStates);
    // The skeleton: the Spine emitter's one entry (issue #922), which writes
    // every section from the model, in the order and under the spellings the
    // file has, and runs the parser-default and key-order passes on the
    // finished object. What it is handed besides the model is what the model
    // does not hold — the rest of the header — and the editor's orders, the
    // same functions `compileModel` stated the model's `editorOrder` with: the
    // sorts are applied at emission, so the model's `skins` and `animations`
    // keep the spec's own order. The header's box is the setup-pose bounding
    // box rigc's core computes over the model (issue #907, `headerBoundsOf`),
    // never the stage.
    const skeleton = emitSkeleton(model, { ...header, bounds: headerBoundsOf(model, atlasText).box }, EDITOR_ORDERS);
    return {
      skeleton,
      skeletonText: `${JSON.stringify(skeleton, null, 2)}\n`,
      atlasText,
      declaredDurations,
      ...carriedOf(model),
      model,
    };
  });
}

/**
 * The box the Spine header carries (issue #907): the setup-pose bounding box
 * — what the format says `skeleton.x`, `y`, `width`, `height` are — computed
 * by rigc's own core over the model (`setupBounds` in `src/core/raw.ts`,
 * whose header states each measured rule), each of the four on the model's
 * 1e-6 grid at float32 (`headerBoxNumber`).
 *
 * ⭐ **The stage is not this value and does not move.** `model.stage` — the
 * rig spec's `skeleton.width`/`height` or the manifest's crop, the working
 * area the coordinate transform reads (`src/transform.ts`) — stays the
 * model's and the document's; until issue #907 the emitter copied it into the
 * header, which is the defect the issue names: a reader who takes the header
 * for what the format says it is got the crop.
 *
 * `null` — no box in the header — in two cases, each a statement rather than
 * a number nobody measured:
 *
 *   - the rig declares no stage (`"width": null, "height": null`, issue
 *     #578): the header carried no box before, and the input that asked for
 *     none keeps getting none;
 *   - nothing is drawn at the setup pose: a box around no vertex does not
 *     exist (`getBounds` returns an infinite offset and a negative-infinite
 *     size for it);
 *   - a region the build has no atlas rectangle for (`atlas: null`,
 *     `ModelRegionAttachment.atlas`): its corners read the trim and original
 *     size, which nobody measured, and the build is refused by name anyway —
 *     the emitted atlas has no such region, and
 *     `A08_REGION_NAMES_MATCH_ATTACHMENTS` names it. Refusing the compile
 *     here instead would replace that named failure with a different one;
 *   - a setup pose rigc's core leaves out (`CoreInputError` — measured on the
 *     tree: a slider whose animation keys an ik constraint's timelines, which
 *     the core's constraint cut does not pose). The entry without spine-core
 *     has no other poser, and both entries must write the same bytes, so the
 *     box is absent on both rather than present on one; refusing the compile
 *     would refuse a rig the gate passes. `tools/core_gate.ts` reports such a
 *     row SKIP naming the reason, never IDENTICAL.
 *
 * Every case but the first comes back with `why`, the sentence `build` prints
 * beside its output (`printHeaderBox` in `src/cli/shared.ts`), so an absent
 * box is never silent.
 *
 * The core poses the model through its document — the text `build` writes
 * beside the pair, read back by `readModel` — so the box is of the document a
 * reader holds, not of an object only this process saw. The document's
 * `spine.sha256` names the skeleton written beside it, which does not exist
 * yet; the digest of an empty text stands in for it here, and nothing the box
 * depends on reads it.
 */
export function headerBoundsOf(model: CompiledModel, atlasText: string): { box: ModelStage | null; why: string | null } {
  if (model.stage === null) return { box: null, why: null };
  const unplaced = model.skins.flatMap((skin) =>
    Object.entries(skin.attachments).flatMap(([slot, table]) =>
      Object.entries(table).flatMap(([placeholder, entry]) => (entry.kind === 'region' && entry.atlas === null ? [`skin "${skin.name}" slot "${slot}" region "${placeholder}"`] : [])),
    ),
  );
  if (unplaced.length > 0) return { box: null, why: `${unplaced[0]} has no atlas rectangle, so its corners are not known — A08_REGION_NAMES_MATCH_ATTACHMENTS names it` };
  let box: CoreBounds | null;
  try {
    box = setupBounds(readModel(modelDocument(model, '', atlasText), 'the compiled model'));
  } catch (err) {
    if (err instanceof CoreInputError) return { box: null, why: `rigc's core does not pose this setup pose — ${err.message}` };
    throw err;
  }
  if (box === null) return { box: null, why: 'the setup pose draws nothing, and a box around no vertex does not exist' };
  return { box: { x: headerBoxNumber(box.x), y: headerBoxNumber(box.y), width: headerBoxNumber(box.width), height: headerBoxNumber(box.height) }, why: null };
}

/**
 * What `compileModel` returns: the compiled model, and what a caller needs
 * beside it to gate it, write its document and — if it asks — emit it.
 */
export interface CompiledBuild {
  /** The compiled model (`src/model.ts`), `stage` and `editorOrder` included (issue #1026). */
  model: CompiledModel;
  /** The rest of the Spine header the model does not hold (`SkeletonHeader`): what `compile` hands the emitter beside the model. */
  header: Omit<SkeletonHeader, 'bounds'>;
  /** The atlas text the compile measured its art against — `CompileResult.atlasText`. */
  atlasText: string;
  /** Declared durations, carried into the validator (rule 4) — `CompileResult.declaredDurations`. */
  declaredDurations: Record<string, number>;
}

/**
 * Compile a rig spec and a motion spec into the compiled model WITHOUT calling
 * the Spine emitter (issue #1026, step 4a of #380): everything `compile` does
 * up to the one `emitSkeleton` call, and nothing after it. `compile` is this
 * entry followed by the emission, so the model a caller gets here is the model
 * `compile` emits from — the same refusals, in the same order, raised from the
 * same place (the editor's orders included: `editorOrder` is computed here, by
 * the functions the emitter is then handed).
 *
 * What it does not return is what only the emission makes: the Spine skeleton
 * and its text, and with them the digest a model document records of the
 * skeleton written beside it (`spine.sha256`). A command that writes a build
 * with no Spine pair is not this entry's: `build` still emits (issue #1026).
 */
export function compileModel(opts: CompileOptions): CompiledBuild {
  return withDroppedStates((droppedStates) => compileInto(opts, droppedStates));
}

/**
 * Run a compile, annotating whatever it throws with the states a manifest
 * listed and the art was missing for (`CompileError.droppedStates`): the
 * whole of issue #671's second half — those states are reported from the
 * compile RESULT, which a throw never returns, so the run whose refusal was
 * caused by a missing file was the one run that never named the file.
 * Annotating rather than re-wrapping keeps a `NotImplementedError` its class.
 * A refusal the emission raises after the drop was recorded is annotated too.
 */
function withDroppedStates<T>(run: (droppedStates: DroppedState[]) => T): T {
  const droppedStates: DroppedState[] = [];
  try {
    return run(droppedStates);
  } catch (err) {
    if (err instanceof CompileError && droppedStates.length > 0) err.droppedStates = [...droppedStates];
    throw err;
  }
}

function compileInto(opts: CompileOptions, droppedStates: DroppedState[]): CompiledBuild {
  const rigPath = resolve(opts.rigPath);
  const motionPath = resolve(opts.motionPath);
  const outDir = resolve(opts.outDir);
  const manifestPath = opts.manifestPath === undefined ? null : resolve(opts.manifestPath);
  const manifestDir = manifestPath === null ? null : dirname(manifestPath);

  const rig = parseRigSpec(readJson<unknown>(rigPath, RIG_INPUT), rigPath);
  // Parsed, not cast, since issue #307 — `src/motion.ts` states what it proves
  // and which refusals it deliberately leaves in this file.
  const motion = parseMotionSpec(readJson<unknown>(motionPath, MOTION_INPUT), motionPath);
  const manifest = manifestPath === null ? null : readJson<FaceManifest>(manifestPath, MANIFEST_INPUT);
  // The manifest is the record of what was measured, and its numbers become
  // bone positions and the stage: a `crop.h` of 1e309 built as `"height": null`
  // before issue #881. The rig spec's walk is `parseRigSpec`'s; this is the
  // same rule over the other file whose numbers reach the skeleton.
  // Its values of the wrong type first (issue #890): `crop.h: "806"` built
  // green, the string coerced by whatever arithmetic read it.
  if (manifest !== null && manifestPath !== null) {
    const visits = manifestShapeVisits(manifest);
    refuseValuesOfTheWrongType(visits, MANIFEST_TYPES, manifestPath);
    // Then a name outside a stated set (issue #900): `mesh.kind: "foo"` was
    // read as a ribbon by one reader and a ring by two others.
    refuseValuesOutsideTheirSet(visits, MANIFEST_TYPES, MANIFEST_ENUMS, manifestPath);
  }
  if (manifest !== null && manifestPath !== null) refuseNumbersTheFileCannotCarry(manifest, manifestPath, dottedPath);

  // The rig spec names its own path in every message `parseRigSpec` throws (its
  // `where` argument, above). The motion spec gets no such treatment below —
  // every "animation … bone … property" refusal is built from data alone — so a
  // reader with two input files and one error has no way to tell which one is at
  // fault. This wraps the motion-only regions (the version/archetype check right
  // below, the physics table and the animation loop further down) and prefixes
  // the motion path onto any `CompileError` that escapes them, unless the
  // message already names it.
  const withMotionSource = <T>(fn: () => T): T => {
    try {
      return fn();
    } catch (err) {
      if (err instanceof CompileError && !err.message.includes(motionPath)) {
        throw new CompileError(`${motionPath}: ${err.message}`, err.code);
      }
      throw err;
    }
  };

  withMotionSource(() => {
    // The version tag is `parseMotionSpec`'s, and so is every shape under it.
    // What is left in this block is the one question the motion file cannot
    // answer on its own.
    // The motion spec was authored against one formation. Pairing it with another
    // rig would aim its keys at bones whose names happen to match and whose meaning
    // does not — the class of wrongness that loads, plays and lies.
    if (motion.archetype !== rig.name) {
      throw new CompileError(
        `motion spec names archetype "${motion.archetype}" but the rig spec at ${rigPath} is called "${rig.name}"`, 'CE_COMPILE_MOTION_ARCHETYPE_MISMATCH',
      );
    }
  });

  // The stage. The rig may state it outright (a foreign skeleton has no crop);
  // otherwise the manifest's crop is it. With neither there is nothing to
  // measure a full-frame mesh against, so the compile stops rather than guess.
  //
  // ⭐ The third state is the rig saying there is no stage at all — `width` and
  // `height` stated `null` (issue #578). That is a claim rather than a silence,
  // so it beats the manifest's crop the way a stated number already does, and
  // the header below emits none of the four fields. Omitting them is still the
  // refusal underneath: a transcriber who has no stage to copy can now say so,
  // and one who simply has not looked still cannot.
  const noStage = declaresNoStage(rig.skeleton);
  const stageWidth = noStage ? undefined : (rig.skeleton?.width ?? manifest?.crop.w);
  const stageHeight = noStage ? undefined : (rig.skeleton?.height ?? manifest?.crop.h);
  if (!noStage && (stageWidth === undefined || stageHeight === undefined)) {
    throw new CompileError(
      'no stage size: give the rig spec a `skeleton.width`/`skeleton.height`, or compile against a cut manifest whose `crop` states them, ' +
        'or state `"width": null, "height": null` for a skeleton that declares no stage', 'CE_COMPILE_STAGE_SIZE_MISSING',
    );
  }
  /**
   * Crop height, for the y-down -> y-up flip. Only manifest data uses it, and
   * `cropPointOf` refuses every bone that asks for manifest data when there is
   * no manifest — so the two states that can be read here both have one, or a
   * stage.
   *
   * ⚠️ `NaN` for the third, unreachable state (no manifest and a rig that
   * declares no stage) rather than 0. A plausible number is the failure this
   * compiler exists to refuse; if the guard above it ever moved, a NaN
   * coordinate is a named failure and an origin-flipped bone is not.
   */
  const cropH = manifest?.crop.h ?? stageHeight ?? Number.NaN;
  const imagesDir = opts.imagesDir !== undefined ? resolve(opts.imagesDir) : resolve(dirname(rigPath), rig.images ?? '.');

  // -- 1. gather images ------------------------------------------------------
  // Region name = attachment name = PNG basename.
  const images: CompiledImage[] = [];
  // `droppedStates` is the caller's array rather than a local one, so a refusal
  // raised further down still leaves the drops somewhere `compile` can read.
  const seenRegions = new Set<string>();
  /**
   * Region name -> the absolute path of the file whose pixels that region holds.
   *
   * ⭐ A region is named by its PNG's **basename**, so two files in two
   * directories can want one name, and the loser draws the winner's art with
   * nothing said (issue #555). `seenRegions` answers "is this name taken"; this
   * answers "by what", which is the half a refusal has to name — and it is the
   * same record that lets one PNG legitimately serve two skins.
   */
  const regionSource = new Map<string, string>();
  /**
   * Every directory the spec names a part PNG in — `skeletonImagesPath` reads it.
   * Recorded from the spec's own path whether or not the pixels came from there:
   * `--atlas-in` changes the pixel source, not where the rig says its parts are,
   * and the skeleton has to stay byte-identical between the two (PK11).
   */
  const partDirs = new Set<string>();

  /** The pre-packed atlas `--atlas-in` named, parsed once, or null. */
  const atlasIn = opts.atlasInPath === undefined ? null : readAtlasIn(resolve(opts.atlasInPath));

  const addImage = (
    relPath: string,
    baseDir: string,
    isBase: boolean,
    region: string = basename(relPath, '.png'),
    /**
     * The directory this part counts as named in, for `skeletonImagesPath`, or
     * `null` for none. Default: the file's own directory, as it always was.
     */
    partDir: string | null = dirname(resolve(baseDir, relPath)),
  ): CompiledImage => {
    if (seenRegions.has(region)) {
      throw new CompileError(`duplicate region name "${region}" (${relPath})`, 'CE_COMPILE_REGION_NAME_DUPLICATE');
    }
    const loosePath = resolve(baseDir, relPath);
    const img =
      atlasIn === null
        ? fromLoosePng(relPath, loosePath, region, isBase, outDir)
        : resolveFromAtlas(relPath, region, isBase, outDir, atlasIn);
    seenRegions.add(region);
    regionSource.set(region, loosePath);
    if (partDir !== null) partDirs.add(partDir);
    images.push(img);
    return img;
  };

  /**
   * Measure and atlas the art ONE skin attachment names — once per file, not
   * once per placeholder (issue #555).
   *
   * 🚨 The defect this replaces. The gather loop below deduplicated the slot's
   * attachment NAMES, and the call to `addImage` stood behind that `continue`,
   * so a placeholder two skins fill reached the atlas with the FIRST skin's art
   * and every later skin's PNG was never opened. Measured on a two-skin rig
   * before the repair: without stated sizes the compile refused with *a region
   * needs width and height — give them, or give an "image" and rigc will measure
   * the PNG*, which is the message telling the author to give the image they
   * gave; with sizes stated it built and `A00_ROUNDTRIP_PARSE` refused the
   * skeleton with *Region not found in atlas: patch_b*. Neither names the cause,
   * and both are the doctrine's own second bullet inverted — a miss refused
   * under somebody else's name.
   *
   * ⚠️ Two skins may legitimately share one PNG, which is why this is not simply
   * `addImage` unguarded: `addImage` refuses any repeat of a region name, and a
   * placeholder both skins point at the SAME file is one region on purpose. The
   * distinction is the FILE, so that is what is compared — and two different
   * files whose basenames collide are refused here by name rather than aliased,
   * because the loser silently draws the winner's pixels at the winner's size
   * and the whole gate stays green (measured: 15 assertions passed on exactly
   * that rig).
   */
  const addSkinImage = (relPath: string, where: string): void => {
    const region = basename(relPath, '.png');
    const already = regionSource.get(region);
    if (already === undefined) {
      addImage(relPath, imagesDir, false);
      return;
    }
    const wanted = resolve(imagesDir, relPath);
    if (already === wanted) return; // one file, two attachments: one region, deliberately
    throw new CompileError(
      `${where}: "${relPath}" and the art already atlased as region "${region}" are two different files — ` +
        `${wanted} and ${already}. An atlas region is named by its PNG's basename, so only one of the two can ` +
        'hold that name and this attachment would draw the other file\'s pixels. Rename one of the PNGs.', 'CE_COMPILE_REGION_FILE_CONFLICT',
    );
  };

  /**
   * Measure and atlas every frame of one attachment's `sequence` — by NAME, the
   * way the loader will ask for them (issue #729).
   *
   * Frame `i` is the region `sequenceFrameRegion(stem, …, i)`; on the loose
   * route its pixels are the PNG of that name under the images directory, and
   * under `--atlas-in` they are the pack's region of that name. A frame that is
   * not there is refused with its number and the name looked for: the loader's
   * own miss is `Region not found in atlas: <name> (attachment: <name>)`, which
   * says neither that the region was frame 3 of a series nor which series.
   *
   * ⚠️ The region is the frame's FULL name, not a basename — an editor names a
   * series in an images subfolder `fx/flame_0001`, and that string is what the
   * loader looks up. A frame another attachment already atlased from the same
   * file is the same region on purpose, as `addSkinImage` allows for one PNG.
   */
  const addSequenceFrames = (stem: string, seq: RigSequence, where: string): void => {
    for (let i = 0; i < seq.count; i++) {
      const region = sequenceFrameRegion(stem, seq, i);
      const relPath = `${region}.png`;
      const wanted = resolve(imagesDir, relPath);
      const frame = `frame ${i} of ${seq.count} (number ${(seq.start ?? 1) + i})`;
      if (atlasIn === null && !existsSync(wanted)) {
        throw new CompileError(
          `${where}: sequence ${frame} is the region "${region}", and there is no PNG for it at ${wanted}. A ` +
            `sequence's frames are the regions "<stem><start + i>", zero-padded to "digits" — here stem ` +
            `${JSON.stringify(stem)}, start ${seq.start ?? 1}, digits ${seq.digits ?? 0} — and the compiler draws ` +
            'no frame in place of another. Add the file, or state the "count" the series really has.', 'CE_COMPILE_SEQUENCE_FRAME_PNG_MISSING',
        );
      }
      if (atlasIn !== null && !atlasIn.byName.has(region)) {
        const near = nearMisses(region, atlasIn.byName.keys());
        throw new CompileError(
          `${where}: sequence ${frame} is the region "${region}", which the atlas at ${atlasIn.path} does not have. ` +
            (near.length ? `Did you mean ${near.map((n) => JSON.stringify(n)).join(', ')}? ` : '') +
            `A sequence's frames are the regions "<stem><start + i>", zero-padded to "digits" — here stem ` +
            `${JSON.stringify(stem)}, start ${seq.start ?? 1}, digits ${seq.digits ?? 0} — and the compiler draws ` +
            'no frame in place of another.', 'CE_COMPILE_SEQUENCE_FRAME_REGION_MISSING',
        );
      }
      const already = regionSource.get(region);
      if (already === wanted) continue;
      if (already !== undefined) {
        throw new CompileError(
          `${where}: sequence ${frame} is the region "${region}", and the art already atlased under that name is ` +
            `${already}, not ${wanted}. One region name is one set of pixels, so this frame would draw the other ` +
            "file's. Rename one of them.", 'CE_COMPILE_SEQUENCE_FRAME_FILE_CONFLICT',
        );
      }
      // The directory the frame NAMES are relative to — the images root, not
      // the frame's own subfolder, because the region name carries the folder —
      // and only on the loose route: under `--atlas-in` the spec names no file
      // for a frame, where an `image` is still a file the spec names.
      addImage(relPath, imagesDir, false, region, atlasIn === null ? imagesDir : null);
    }
  };

  // A manifest may name a part the cut does not carry. A formation can declare
  // more slots than any one cut fills, and a cut that shares a sprite with the
  // scene around it has no plate of its own to point at — the manifest then
  // records the part as `image: null` with no window at all. That entry is a
  // documented ABSENCE, not a part — and it used to crash the compiler on its
  // missing `offset` rather than being tolerated, so "the optional slots are
  // optional" needed this line to actually be true.
  const absentParts: CompileResult['absentParts'] = [];
  const declaredParts = (manifest?.parts ?? []).filter((part) => {
    if (part.image === null && !part.states) {
      absentParts.push({ slot: rigSlotOf(part), why: 'manifest declares `image: null` and no states' });
      return false;
    }
    return true;
  });
  // ⚠️ `rig_slot` is the join key, not `slot`. A cut manifest that doubles as the
  // art pipeline's record carries slot names of its own and that pipeline's
  // scripts select on them; the rig's slot table is what the runtime, the tooling
  // and the viewer join on. So the mapping is manifest data, and the rig's table
  // stays single-valued — one name per slot, which is the only way A26 and a
  // "hide this slot" probe can mean the same thing on every cut.
  const parts = declaredParts
    .map((part) => (part.rig_slot && part.rig_slot !== part.slot ? { ...part, slot: part.rig_slot } : part))
    .sort((a, b) => a.draw_order - b.draw_order);

  const rigSlotIndex = new Map(rig.slots.map((slot, i) => [slot.name, i]));
  for (const part of parts) {
    if (!rigSlotIndex.has(part.slot)) {
      throw new CompileError(
        `the manifest binds a part to slot "${part.slot}" (via rig_slot), which the rig "${rig.name}" does not declare — add the slot to the rig rather than inventing one here`, 'CE_COMPILE_MANIFEST_SLOT_UNKNOWN',
      );
    }
  }
  // 🔑 Two files now state a draw order — the manifest's `draw_order` numbers and
  // the rig's slot array — and two sources for one fact is how they come to
  // disagree. The rig's array wins (it IS the emitted order, which is Spine's own
  // semantics), and a manifest that orders its parts differently is refused here
  // rather than silently overruled.
  let orderCursor = -1;
  for (const part of parts) {
    const at = rigSlotIndex.get(part.slot)!;
    if (at < orderCursor) {
      throw new CompileError(
        `the manifest draws "${part.slot}" (draw_order ${part.draw_order}) out of the rig's slot order; the rig's slots array IS the draw order`, 'CE_COMPILE_MANIFEST_DRAW_ORDER_MISMATCH',
      );
    }
    orderCursor = at;
  }

  /** slot -> [attachment names], in the order the manifest lists the states. */
  const slotAttachments = new Map<string, string[]>();

  // Mesh parts, checked against the rig's budget before any geometry runs.
  const meshBudget = rig.invariants?.meshSlots ?? 0;
  const meshParts = parts.filter((part) => part.mesh);
  if (meshParts.length > meshBudget) {
    throw new CompileError(
      `${meshParts.length} mesh slot(s) declared but the rig "${rig.name}" allows ${meshBudget}` +
        ' — raise `invariants.meshSlots` in the rig spec if that budget is the thing being changed', 'CE_COMPILE_MANIFEST_MESH_SLOT_BUDGET',
    );
  }
  for (const part of meshParts) {
    if (isBasePlate(part, manifest!)) {
      // A base plate mesh is a full-frame canvas every frame.
      throw new CompileError(`slot "${part.slot}" is the base plate; it must never be a mesh`, 'CE_COMPILE_BASE_PLATE_MESH');
    }
    const spec = part.mesh!;
    const kind = spec.kind ?? 'ring';
    if (kind === 'ring') {
      if (!part.polygon?.length) {
        throw new CompileError(`slot "${part.slot}" declares a ring mesh but has no polygon to use as its rim`, 'CE_COMPILE_RING_POLYGON_MISSING');
      }
      if (spec.hull !== 'polygon') {
        throw new CompileError(`slot "${part.slot}": mesh.hull must be "polygon", got ${JSON.stringify(spec.hull)}`, 'CE_COMPILE_RING_HULL_INVALID');
      }
      if (!spec.center || spec.inner === undefined) {
        throw new CompileError(`slot "${part.slot}": a ring mesh needs mesh.center and mesh.inner`, 'CE_COMPILE_RING_PARAMETERS_MISSING');
      }
    } else {
      if (!spec.rows || !spec.chain?.length) {
        throw new CompileError(`slot "${part.slot}": a ribbon mesh needs mesh.rows and a mesh.chain`, 'CE_COMPILE_RIBBON_PARAMETERS_MISSING');
      }
    }
    if (!meshControlBones(part).length) {
      throw new CompileError(`slot "${part.slot}": a mesh with no control bone deforms nothing`, 'CE_COMPILE_MESH_CONTROL_BONE_MISSING');
    }
  }

  /**
   * How to name the thing whose size disagreed with the spec.
   *
   * ⭐ The message has to say which of the two it MEASURED, because the remedy is
   * different: a loose PNG is re-exported, an atlas region is repacked or the
   * spec is wrong about which region it wanted. Reading "torso.png is 40x80 but
   * the window is 40x81" while no torso.png was ever opened is the sort of
   * message that sends an author to the wrong file.
   */
  const measuredFrom = (img: CompiledImage, relPath: string): string =>
    img.atlas === undefined
      ? relPath
      : `region "${img.region}" of ${opts.atlasInPath!} (declared ${img.atlas.originalWidth}x${img.atlas.originalHeight} ` +
        `by its offsets${img.atlasScale === undefined ? '' : `, at scale: ${img.atlasScale}`})`;

  for (const part of parts) {
    const win = partWindow(part, manifest!);
    if (part.image) {
      // One unconditional attachment: the base plate, and every joint part.
      const img = addImage(part.image, manifestDir!, isBasePlate(part, manifest!));
      if (img.width !== win.w || img.height !== win.h) {
        throw new CompileError(
          `${measuredFrom(img, part.image)} is ${img.width}x${img.height} but the manifest window for "${part.slot}" is ${win.w}x${win.h}`, 'CE_COMPILE_MANIFEST_WINDOW_SIZE_MISMATCH',
        );
      }
      slotAttachments.set(part.slot, [img.region]);
      continue;
    }
    const names: string[] = [];
    for (const [state, relPath] of Object.entries(part.states ?? {})) {
      if (relPath === null) continue; // base pixels show through; nothing to emit
      // A manifest can outlive a state whose art was dropped. It still lists
      // it, so the compiler reports the gap rather than pretending either way —
      // and under `--atlas-in` the same question is asked of the atlas, because
      // there the pack IS where the art either is or is not. An OPTIONAL state
      // absent from the pack is that same documented gap; the unconditional
      // `part.image` above is the one that refuses by name (`resolveFromAtlas`).
      const absPath = resolve(manifestDir!, relPath);
      const present = atlasIn === null ? existsSync(absPath) : atlasIn.byName.has(basename(relPath, '.png'));
      if (!present) {
        droppedStates.push({
          slot: part.slot,
          state,
          path: relPath,
          // The DROP line has to name what was CONSULTED. "no PNG at
          // parts/iris_open.png" is a lie about an `--atlas-in` build, which
          // opened no such file, and it sends the reader to a directory instead
          // of to the pack that is missing the region.
          ...(atlasIn === null
            ? {}
            : { why: `no region "${basename(relPath, '.png')}" in ${atlasIn.path}` }),
        });
        continue;
      }
      const img = addImage(relPath, manifestDir!, false);
      if (img.width !== win.w || img.height !== win.h) {
        throw new CompileError(
          `${measuredFrom(img, relPath)} is ${img.width}x${img.height} but slot "${part.slot}" declares ${win.w}x${win.h}`, 'CE_COMPILE_SLOT_IMAGE_SIZE_MISMATCH',
        );
      }
      names.push(img.region);
    }
    slotAttachments.set(part.slot, names);
  }

  // Attachments the RIG declares. A cut with a manifest leaves `skins` empty and
  // gets its attachments from the parts above; a foreign skeleton has no manifest
  // and states them here. A slot filled from both is a compile error, because the
  // two would then be two records of one thing.
  const skinNames = Object.keys(rig.skins ?? {});
  // The two spellings of a skin entry, normalised once — every reader below takes
  // its attachments and its member lists from here rather than re-deciding which
  // form the spec used.
  const skinParts = new Map(
    skinNames.map((skinName) => [skinName, splitRigSkin(rig.skins![skinName], `rig skin "${skinName}"`)] as const),
  );
  const rigAttachmentNames = new Map<string, string[]>();
  for (const skinName of skinNames) {
    for (const [slotName, placeholders] of Object.entries(skinParts.get(skinName)!.attachments)) {
      if (!rigSlotIndex.has(slotName)) {
        throw new CompileError(`rig skin "${skinName}" gives attachments to slot "${slotName}", which the rig does not declare`, 'CE_COMPILE_SKIN_SLOT_UNKNOWN');
      }
      if (slotAttachments.has(slotName)) {
        throw new CompileError(
          `slot "${slotName}" is filled by a manifest part AND by rig skin "${skinName}"; one slot, one source of attachments`, 'CE_COMPILE_SLOT_ATTACHMENT_SOURCES_CONFLICT',
        );
      }
      const names = rigAttachmentNames.get(slotName) ?? [];
      for (const [placeholder, att] of Object.entries(placeholders)) {
        // Two concerns, two conditions. The list is the slot's PLACEHOLDER list
        // and a placeholder several skins fill belongs in it once; the art is
        // per ATTACHMENT, and there are as many of those as there are skins
        // filling it. Standing behind one `continue`, the second was the first's
        // arithmetic (issue #555).
        if (!names.includes(placeholder)) names.push(placeholder);
        const image = (att as RigRegionAttachment).image;
        if (typeof image === 'string') {
          addSkinImage(image, `skin "${skinName}" slot "${slotName}" attachment "${placeholder}"`);
        }
        // `parseRigSpec` has refused a sequence on any kind but these three and
        // proved its shape, so what is left is whether its frames exist. The stem
        // is the region `path` the attachment resolves through, which with no
        // `path` stated is the attachment's NAME — its stated `name`, else the
        // placeholder (`path = getValue(map, "path", name)`, issue #796).
        const sequence = (att as RigRegionAttachment).sequence;
        if (sequence !== undefined) {
          addSequenceFrames(
            (att as RigRegionAttachment).path ?? (att as RigRegionAttachment).name ?? placeholder,
            sequence,
            `skin "${skinName}" slot "${slotName}" attachment "${placeholder}"`,
          );
        }
      }
      rigAttachmentNames.set(slotName, names);
    }
  }
  // The one contested shape the editor cannot hold — a placeholder the default
  // skin shares with a named skin — refused here, off the normalised skin
  // table, before anything is built. Every other contested placeholder is
  // emitted exactly as the spec states it (issue #796).
  refuseDefaultSkinContests(skinNames, skinParts);

  // -- 2. atlas --------------------------------------------------------------
  //
  // Two shapes. The default builds one page per part out of what was measured.
  // `--atlas-in` emits the imported atlas itself, verbatim except for its page
  // NAMES, which are paths and have to be re-anchored to `outDir`. Re-serialising
  // it from the parse would silently drop every field this compiler has no reader
  // for — `scale:` most expensively — so the text passes through by line and only
  // the name lines are replaced (`rewritePageNames`).
  //
  // 🔸 Its BLANK lines are the one thing put into rigc's shape
  // (`canonicalAtlasShape`, issue #803): none before the first entry, one between
  // blocks, one trailing newline. The runtime reads any run of blank lines as
  // one, and a 3.8-era packer opens every file with one, which `A07` read at
  // `line 1` and refused — the gate refusing a whitespace choice of a packer
  // rigc re-anchored, on a pack every 4.x runtime loads. Non-blank lines are
  // untouched, so a pack already in that shape is emitted byte for byte as before.
  //
  // ⚠️ Regions the rig does not use stay in the emitted atlas. They are not a
  // defect: a real pack is shared between cuts, an unused region costs a consumer
  // nothing, and dropping them would make `--out` disagree with the pack it was
  // built from — which is the one thing an importer must not do.
  const atlasText =
    atlasIn === null
      ? buildAtlasText(images)
      : canonicalAtlasShape(
          rewritePageNames(atlasIn.parsed, (name) => relative(outDir, resolve(atlasIn.dir, name)).split('\\').join('/')),
        );

  // -- 3. bones --------------------------------------------------------------
  //
  // One path for every rig, because the two the archetype tables used to have
  // (an explicit tree placed by manifest anchors, and one bone per slot at the
  // part window's centre) are the same operation over a different crop point.
  // What the rig spec chooses is WHERE the point comes from; the flip into Spine
  // world and the inverse into the parent's local space are the same either way.
  if (manifest) checkAxisSelfConsistency(manifest);
  const axisSpineDeg = manifest?.axis ? screenToSpineDegrees(manifest.axis.deg) : null;
  const partBySlot = new Map(parts.map((part) => [part.slot, part]));

  const bones: ModelBone[] = [];
  for (const spec of rig.bones) {
    bones.push(buildBone(spec, bones, { rig, manifest, cropH, axisSpineDeg, partBySlot }));
  }
  const boneNames = new Set(bones.map((b) => b.name));
  let transforms: Map<string, BoneTransform>;
  // The frames a depth turn ceiling is measured in — the same bones without the
  // runtime's last bits (`computeExactFrameTransforms`, issue #1021). Nothing is
  // bound through them.
  let exactFrames: Map<string, BoneTransform>;
  try {
    transforms = computeWorldTransforms(bones);
    exactFrames = computeExactFrameTransforms(bones);
  } catch (err) {
    if (err instanceof TransformError) throw new CompileError(err.message, 'CE_COMPILE_SETUP_TRANSFORM_INVALID');
    throw err;
  }

  for (const part of parts) {
    for (const name of meshControlBones(part)) {
      if (!boneNames.has(name)) {
        throw new CompileError(
          `slot "${part.slot}" drives control bone "${name}", which the rig "${rig.name}" does not declare`, 'CE_COMPILE_CONTROL_BONE_UNKNOWN',
        );
      }
    }
  }

  // -- 4. slots + skins ------------------------------------------------------
  // Draw order IS the slots array order. No separate field,
  // and the rig's array is that order.
  const slots: ModelSlot[] = [];
  // Every attachment is a model record (`SkinTableEntry`); the emitter turns the
  // tables into Spine's at assembly, and `CompiledModel.skins` holds them.
  const skinTables = new Map<string, SkinTable>();
  const tableFor = (skinName: string): SkinTable => {
    let table = skinTables.get(skinName);
    if (!table) {
      table = {};
      skinTables.set(skinName, table);
    }
    return table;
  };
  /** Linked meshes to resolve once every skin exists — see `resolveLinkedMeshes`. */
  const pendingLinks: PendingLink[] = [];
  // 🔑 **A `default` skin is emitted exactly when the spec has one** (issue #801):
  // the rig spec's `skins` carries the key — empty or not — or a manifest part
  // files its states under it (the loop below). Otherwise there is none, which is
  // the shape the editor's own export has: a rig whose art all lives in named
  // skins came back from 4.3.26 with `skins` 3 → 2, the empty `default` gone,
  // and `SkeletonBinary.readSkin` returns null for a default skin with no slots,
  // so the binary half cannot even hold one. The runtime treats the two
  // spellings alike — `SkeletonData.defaultSkin` is null or an empty skin, and
  // `Skeleton.getAttachment` finds nothing in either (`Skeleton.js:335-346`).
  // This line used to create it unconditionally, "even when it is empty", which
  // made every rebuild of such an export differ from it by one skin — a value
  // the spec never stated.
  //
  // Created HERE, before the slot loop, rather than lazily by the first part
  // that fills it, so `skinTables` keeps `default` first whichever of the two
  // put it there, and every refusal that lists the emitted skins lists them in
  // the order it did before.
  const partsFillDefault = rig.slots.some(
    (rigSlot) =>
      partBySlot.has(rigSlot.name) &&
      (slotAttachments.get(rigSlot.name) ?? rigAttachmentNames.get(rigSlot.name) ?? []).length > 0,
  );
  // The stage box (issue #1168): resolved before the slots, so every refusal
  // names the field before any slot is built — and a `default` skin is one it
  // files the box under, so it is created here with the others.
  const stageBox = resolveStageBox(rig, { stageWidth, stageHeight, bones, partBySlot, slotAttachments, rigAttachmentNames });
  if (skinNames.includes(DEFAULT_SKIN) || partsFillDefault || stageBox !== null) tableFor(DEFAULT_SKIN);
  // ...and every skin the rig declares: a skin can carry `bones`/constraint lists
  // with no attachments at all, and a skin that only switches bones on would
  // otherwise never reach the emitted array.
  for (const skinName of skinNames) tableFor(skinName);
  const meshBones = new Set<string>();
  const meshes: CompileResult['meshes'] = [];
  // `skin/slot/attachment` -> per-vertex z, for the attachments that named a
  // depth map. Read at deform-key time; never emitted. See `AttachmentContext`.
  const attachmentDepths = new Map<string, number[]>();
  // The same for a `soft` mask's per-vertex level, which a deform envelope's
  // `mask` reads (issue #1413). Never emitted either.
  const attachmentSoftMasks = new Map<string, DeformSoftMask>();

  for (const rigSlot of rig.slots) {
    const part = partBySlot.get(rigSlot.name);
    const boxHere = stageBox !== null && stageBox.slot === rigSlot.name;
    const names = boxHere ? [stageBox.attachment] : (slotAttachments.get(rigSlot.name) ?? rigAttachmentNames.get(rigSlot.name) ?? []);
    // 🔑 A slot nothing fills is EMITTED, empty — it is not dropped (issue #575).
    // A `continue` stood here instead, and what it bought was the format's own
    // silence: the emitted array came back a slot short with no line saying
    // which, and every slot after it moved down one. That index is what a
    // `drawOrder` key's offsets are counted against and what an index-keyed
    // consumer splits on, so the drop is not a smaller file, it is a different
    // rig. Two production exports declaring 53 and 61 slots built green at 51
    // and 57 and read 0.962 / 0.934 against the file they were transcribed from.
    //
    // The shape emitted here is the editor's own: `SkeletonJson`'s slot reader
    // takes `attachment` with a `null` default, so a slot with no `attachment`
    // key is a slot that shows nothing — 34 of the 52 slots in the official
    // `spineboy-pro` export omit the key.
    const empty = names.length === 0;

    const setup = motion.setup?.[rigSlot.name];
    // ⚠️ The entry's SHAPE is `parseMotionSpec`'s now (issue #307), and it had to
    // move: this loop used to `continue` past a slot with no attachments before
    // reaching here, so the #293 shapes — `"lid_l": null` and, far worse,
    // `"lid_l": "plate"`, which reads `.attachment` off a string as `undefined`
    // and hides the slot in silence — stayed GREEN for exactly the slots a
    // reader is most likely to be halfway through wiring up. Everything from
    // here down is the half that needs the rig in front of it.
    if (setup !== undefined && rigSlot.attachment !== undefined) {
      throw new CompileError(
        `slot "${rigSlot.name}" has a setup attachment in the rig spec AND in the motion spec; the setup pose has one author`, 'CE_COMPILE_SETUP_ATTACHMENT_AUTHORS_CONFLICT',
      );
    }
    let setupAttachment: string | null;
    if (setup !== undefined) setupAttachment = setup.attachment ?? null;
    else if (rigSlot.attachment !== undefined) setupAttachment = rigSlot.attachment;
    // Nothing fills the slot, so there is nothing to choose between and nothing
    // to guess: the setup pose of an empty slot is "show nothing", which is the
    // one value the format can express for it. The refusal below stays exactly
    // where it was for a slot that HAS attachments and states no setup pose.
    else if (empty) setupAttachment = null;
    else {
      throw new CompileError(
        `no setup pose for slot "${rigSlot.name}": give the motion spec a \`setup\` entry or the rig slot an \`attachment\` — the compiler will not guess one`, 'CE_COMPILE_SETUP_ATTACHMENT_MISSING',
      );
    }
    if (setupAttachment !== null && !names.includes(setupAttachment)) {
      // 🚨 The slot can be empty for two different reasons and the sentence
      // below used to state only one of them (issue #671). "no skin and no
      // manifest part fills it" is FALSE when a manifest part does fill it and
      // its art was not found: every art-bearing state of that part was
      // dropped, which is why `names` came back empty, and the drop record is
      // the only place the path lives. An author handed the old sentence
      // applied its remedy — setup pose `null` — and shipped a rig with the
      // part missing, green, because the compiler had described the wrong
      // object. `empty` with no drops keeps that sentence: there the claim is
      // true.
      const dropped = droppedStates.filter((d) => d.slot === rigSlot.name);
      let message: string;
      if (!empty) {
        message = `setup attachment "${setupAttachment}" for slot "${rigSlot.name}" is not one of [${names.join(', ')}]`;
      } else if (dropped.length === 0) {
        message =
          `the setup pose shows attachment "${setupAttachment}" on slot "${rigSlot.name}", which no skin and no ` +
          'manifest part fills — the slot is emitted empty, so there is no such attachment to show. Give the ' +
          'slot an attachment, or state the setup pose as null';
      } else {
        // Every state listed here has no art AND the slot is empty, which is
        // not a coincidence: a state whose art WAS found puts a region in
        // `names`, so a slot reaching this branch has had all of them dropped.
        // That is what lets the sentence quantify rather than hedge.
        const many = dropped.length > 1;
        const found = dropped.map((d) => `"${d.state}" (${droppedStateReason(d)})`).join(', ');
        // ⚠️ The remedy is read off the DELIVERY, not off the shape of the
        // message: an `--atlas-in` build opened no file, so "restore the file"
        // would be advice about a directory nobody consulted — the same wrong
        // subject one step further on. It is `atlasIn` that decides, because
        // `atlasIn` is also what decided the `why` above.
        const supply =
          atlasIn === null
            ? many
              ? 'restore the files'
              : 'restore the file'
            : many
              ? 'add the regions to the pack'
              : 'add the region to the pack';
        message =
          `the setup pose shows attachment "${setupAttachment}" on slot "${rigSlot.name}", and the slot is emitted ` +
          `empty because ${many ? `all ${dropped.length} manifest states that fill it have` : 'the one manifest state that fills it has'} ` +
          `no art: ${found} — ${supply}, ${many ? 'fix the paths' : 'fix the path'} in the manifest, or state the ` +
          'setup pose as null';
      }
      throw new CompileError(message, 'CE_COMPILE_SETUP_ATTACHMENT_UNAVAILABLE');
    }
    if (setup?.color && rigSlot.color !== undefined) {
      throw new CompileError(`slot "${rigSlot.name}" has a setup colour in the rig spec AND in the motion spec`, 'CE_COMPILE_SETUP_COLOUR_AUTHORS_CONFLICT');
    }
    // The setup attachment is held as the value it is, `null` included; leaving
    // the key out for `null` is the emitter's (`emitSlots`).
    const slot: ModelSlot = { name: rigSlot.name, bone: rigSlot.bone, setup: setupAttachment };
    if (setup?.color) slot.color = rgbaHex(setup.color);
    else if (rigSlot.color !== undefined) slot.color = rigSlot.color;
    if (rigSlot.dark !== undefined) slot.dark = rigSlot.dark;
    // As stated: `parseRigSpec` refused every spelling the runtime would read as no mode (issue #946).
    if (rigSlot.blend !== undefined) slot.blend = rigSlot.blend;
    slots.push(slot);
    // The stage box is the slot's one attachment, in the `default` skin (issue #1168).
    if (boxHere) {
      tableFor(DEFAULT_SKIN)[rigSlot.name] = { [stageBox.attachment]: stageBox.record };
      continue;
    }
    // ...and nothing below this line has anything to build. An empty entry in a
    // skin's attachment table would be rigc writing a key the editor does not,
    // so the skins array is left exactly as it was before #575 for every slot
    // that IS filled, and gains nothing for one that is not.
    if (empty) continue;

    if (part) {
      const perSlot: Record<string, SkinTableEntry> = {};
      const mesh = part.mesh ? buildMesh(part, manifest!, bones, transforms, exactFrames, rigSlot.bone) : null;
      for (const name of names) {
        const img = images.find((im) => im.region === name);
        if (!img) throw new CompileError(`internal: no image for attachment ${name}`, 'CE_COMPILE_INTERNAL_ATTACHMENT_IMAGE_MISSING');
        if (mesh) {
          // Every state of a mesh slot gets the SAME geometry. That is what makes
          // an attachment swap mid-deform safe: the control bone's pose means the
          // same thing under all of them, so the swap and the deform do not fight.
          perSlot[name] = { ...mesh.attachment };
          continue;
        }
        perSlot[name] = placeRegion(part, manifest!, transforms.get(rigSlot.bone)!, img);
      }
      if (mesh) {
        const controls = meshControlBones(part);
        meshBones.add(rigSlot.bone);
        for (const name of controls) meshBones.add(name);
        meshes.push({
          slot: rigSlot.name,
          kind: mesh.kind,
          attachments: names,
          vertices: mesh.attachment.uvs.length / 2,
          triangles: mesh.attachment.triangles.length / 3,
          bones: [rigSlot.bone, ...controls],
        });
      }
      tableFor('default')[rigSlot.name] = perSlot;
      continue;
    }

    for (const skinName of skinNames) {
      const placeholders = skinParts.get(skinName)!.attachments[rigSlot.name];
      if (!placeholders) continue;
      const perSlot: Record<string, SkinTableEntry> = {};
      for (const [placeholder, att] of Object.entries(placeholders)) {
        const where = `skin "${skinName}" slot "${rigSlot.name}" attachment "${placeholder}"`;
        const built = buildRigAttachment(att, placeholder, where, {
          images,
          bones,
          transforms,
          exactFrames,
          meshBones,
          meshes,
          slotName: rigSlot.name,
          anchorBone: rigSlot.bone,
          skinName,
          imagesDir,
          depths: attachmentDepths,
          softMasks: attachmentSoftMasks,
          slotNames: new Set(rig.slots.map((s) => s.name)),
          atlasRegions: atlasIn === null ? null : atlasIn.byName,
          links: pendingLinks,
        });
        // The name is put on AFTER the builder rather than inside it: six
        // builders write six shapes, the rule is one rule, and a rule that has
        // to be remembered in six places is a rule that will be kept in five.
        // It is the spec's own `name`, or nothing (issue #796).
        perSlot[placeholder] = withStatedName(built, att);
      }
      tableFor(skinName)[rigSlot.name] = perSlot;
    }
  }
  // Every skin is built, so every `source` can now be looked up — and until this
  // line a linked mesh is the one construct in a rig spec whose name has not been
  // resolved yet.
  resolveLinkedMeshes(pendingLinks, skinTables);
  // 📐 The implicit budget of 0 is a statement about rigc's own GENERATORS:
  // geometry rigc built is geometry rigc will not ship unmeasured, and
  // `A13_MESH_BUDGET` has nothing to measure a generated mesh against until the
  // rig states a budget out loud. It is not a statement about geometry somebody
  // else drew — `RigInvariants.meshTriangles` says the same thing in words:
  // a number baked in here would be one project's frame time masquerading as a
  // property of the format. So authored meshes count against a budget the rig
  // states out loud, and against nothing when it states none: rigc did not draw
  // them, so leaving them unmeasured is the author's call (issue #44's rule).
  // #277's coverage report splits the same way and lands on the other side of it:
  // both kinds are MEASURED, and only rigc's own output gets a wall.
  //
  // ⚠️ The message has to name the field, because the three doc places a reader
  // checks all read as "you do not need this" and one of them is §3.4's own
  // worked example (issue #274).
  const budgeted = rig.invariants?.meshSlots === undefined ? meshes.filter((m) => m.kind !== 'authored') : meshes;
  if (budgeted.length > meshBudget) {
    throw new CompileError(
      `${budgeted.length} mesh slot(s) emitted but the rig "${rig.name}" allows ${meshBudget}` +
        (rig.invariants?.meshSlots === undefined
          ? ' — a mesh rigc GENERATED counts against `invariants.meshSlots`, and this rig declares none, which is a ' +
            'budget of 0. Add `"invariants": { "meshSlots": ' +
            `${budgeted.length}, "meshTriangles": <triangles one mesh may carry> }\` to the rig spec: geometry rigc ` +
            'built is geometry it will not ship unmeasured, and `A13_MESH_BUDGET` has nothing to measure against ' +
            'until that budget is stated. (Authored geometry is exempt — rigc did not draw it.)'
          : ' — raise `invariants.meshSlots` in the rig spec if that budget is the thing being changed'), 'CE_COMPILE_GENERATED_MESH_SLOT_BUDGET',
    );
  }

  // -- 4b. constraints -------------------------------------------------------
  // One top-level `constraints` array, `type` per entry. Rig-declared first
  // (structure), then the motion spec's physics table (tuning). A name in both is
  // refused: `mix` timelines resolve by name, and two constraints answering to
  // one name is a timeline driving something nobody chose.
  const constraints: ModelConstraint[] = [];
  const physicsReport: CompileResult['physics'] = [];
  // Deform keys that stated a model instead of a run (issue #294). Declared here
  // rather than inside the animation loop because `explain` reports it across
  // every animation, and appended in emit order so the report reads in the order
  // the file does.
  const deformTransforms: CompileResult['deformTransforms'] = [];
  /** Group-track keys whose per-member values were stated or derived (issue #295). */
  const trackDerivations: CompileResult['trackDerivations'] = [];
  // `ik` and `transform` timelines resolve their target by name AND by type —
  // `findConstraint(name, IkConstraintData)` returns null for a transform
  // constraint of the same name and the parser then throws. So the table this
  // compiler resolves against is keyed by BOTH (issue #692): a name alone is not
  // a constraint in this format, and a rig may declare `leg` once per kind.
  /** `<kind> constraint "<name>"` -> declared. The key is the format's namespace. */
  const constraintDeclared = new Set<string>();
  /** name -> the kinds that declare it, for the refusal that has to say which. */
  const constraintKinds = new Map<string, string[]>();
  /** kind -> the names it declares, for the "the rig declares: …" half of one. */
  const constraintNamesOfKind = new Map<string, string[]>();
  const declareConstraint = (name: string, type: string): void => {
    // Reserved, because a track's `"physics": "*"` is the timeline that names no
    // constraint (issue #726): a physics constraint of that name is one no track
    // could key by name without meaning every global one instead.
    if (type === 'physics' && name === EVERY_GLOBAL_PHYSICS) {
      throw new CompileError(
        `physics constraint "${EVERY_GLOBAL_PHYSICS}": the name is reserved — a motion spec's \`"physics": ` +
          `"${EVERY_GLOBAL_PHYSICS}"\` is the timeline that names no constraint and drives every physics constraint ` +
          'declaring the keyed property global, so a constraint called that could not be keyed by name. Rename it', 'CE_COMPILE_PHYSICS_NAME_RESERVED',
      );
    }
    constraintDeclared.add(constraintAt(type, name));
    constraintKinds.set(name, [...(constraintKinds.get(name) ?? []), type]);
    constraintNamesOfKind.set(type, [...(constraintNamesOfKind.get(type) ?? []), name]);
  };
  /**
   * ik constraint -> its three booleans IN EFFECT: the value it declares, or
   * the parser's default where it declares none. Issue #273.
   *
   * 🚨 `SkeletonJson` reads `bendPositive`, `compress` and `stretch` in TWO
   * places with the same defaults: once on the constraint (`:155`) and once on
   * **every timeline key** (`:912`). A key that omits one does not inherit the
   * constraint's value — it asserts the parser's default. So a rig that declares
   * `bendPositive: false` and an `ik` timeline that keys only `mix` produce a
   * constraint that bends the other way for the whole animation, with the field
   * still in the file and inert: four builds differing only in these flags posed
   * one pose. So a key that states no flag takes the constraint's from this
   * map, and the model's ik key holds all three flags in effect (`ModelKey`).
   * Which of them the file carries is the Spine emitter's: only those that
   * differ from the per-key default (`emitAnimations`, issue #921), which is
   * what this map held before — a rig that says nothing and a key that says
   * nothing already agree, so nothing is written for them.
   */
  const ikFlagsInEffect = new Map<string, Record<string, boolean>>();
  // Which slots can actually show a path, for the path constraint's own check.
  // Read off the skin tables — the model records the file is emitted from —
  // rather than the spec, so it answers the question the runtime asks: is
  // there an attachment of that kind on that slot? (By `kind` since issue #919.)
  const pathSlots = new Map<string, string[]>();
  for (const [skinName, table] of skinTables) {
    for (const [slotName, perSlot] of Object.entries(table)) {
      for (const att of Object.values(perSlot)) {
        if (att.kind !== 'path') continue;
        pathSlots.set(slotName, [...(pathSlots.get(slotName) ?? []), skinName]);
        break;
      }
    }
  }
  const constraintCtx: ConstraintContext = {
    boneNames,
    slotNames: new Set(rig.slots.map((s) => s.name)),
    pathSlots,
    animationNames: new Set(Object.keys(motion.animations ?? {})),
    animationDurations: new Map(Object.entries(motion.animations ?? {}).map(([name, anim]) => [name, anim.duration])),
  };
  // Read as the raw records they are on disk: `buildRigConstraint` checks every
  // field itself, because a spec that came off a file has whatever the author
  // wrote in it and the union above is a claim about a correct one.
  for (const spec of (rig.constraints ?? []) as unknown as RigConstraintInput[]) {
    constraints.push(buildRigConstraint(spec, constraintCtx));
    declareConstraint(spec.name, spec.type);
    if (spec.type === 'ik') {
      // `flag.dflt` is the per-key default, and the constraint's own parser
      // default is the same value for each of the three
      // (`PARSER_DEFAULTS['ik constraint']` and `['ik key']` in keyorder.ts).
      const inEffect: Record<string, boolean> = {};
      for (const flag of CONSTRAINT_TIMELINES.ik.flags) {
        const declared = spec[flag.field];
        inEffect[flag.field] = typeof declared === 'boolean' ? declared : flag.dflt;
      }
      ikFlagsInEffect.set(spec.name, inEffect);
    }
  }
  withMotionSource(() => {
    for (const [name, spec] of Object.entries(motion.physics ?? {})) {
      // Per kind, like everything else about a constraint name: a rig-declared
      // `ik` and a tuned `physics` constraint of one name are two objects, and
      // two PHYSICS constraints of one name are the pair no timeline can tell
      // apart.
      if (constraintDeclared.has(constraintAt('physics', name))) {
        throw new CompileError(
          `physics constraint "${name}" is declared in both the rig spec and the motion spec's physics table`, 'CE_COMPILE_PHYSICS_DECLARATION_DUPLICATE',
        );
      }
      declareConstraint(name, 'physics');
      if (!boneNames.has(spec.bone)) {
        throw new CompileError(`physics constraint "${name}" targets unknown bone "${spec.bone}"`, 'CE_COMPILE_PHYSICS_BONE_UNKNOWN');
      }
      // A stop's copy and clamps sit right after the rig constraint that swings
      // each link (`src/stop.ts`); this table is emitted after every rig
      // constraint, so a swing here would run after the clamp meant to hold it.
      const stop = (rig.stops ?? []).find((s) => s.links.includes(spec.bone));
      if (stop !== undefined) {
        throw new CompileError(
          `physics constraint "${name}" drives "${spec.bone}", a link stop "${stop.chain}" holds, from the physics table — ` +
            "the table is emitted after every rig constraint, past the stop's copy and clamp, which would read the link " +
            'before this swings it; declare the constraint in the rig spec\'s "constraints"', 'CE_COMPILE_PHYSICS_STOP_ORDER_INVALID',
        );
      }
      // Every component and parameter the table states is held, 0 and the
      // parser's default included; which of them Spine leaves out is the
      // emitter's (`emitConstraint`). `components` is the report's list of the
      // ones that DRIVE, as it always was.
      const entry: ModelConstraint = { kind: 'physics', name, declaredIn: 'motion', bone: spec.bone };
      const components: string[] = [];
      for (const comp of PHYSICS_COMPONENTS) {
        const v = spec[comp];
        if (v === undefined) continue;
        entry[comp] = f32(v);
        if (v !== 0) components.push(comp);
      }
      if (!components.length) {
        // The parser is happy with this and the constraint does nothing at all.
        // A23 catches it too; refusing here means it never reaches the gate.
        throw new CompileError(
          `physics constraint "${name}" drives no component — set at least one of ${PHYSICS_COMPONENTS.join('/')}`, 'CE_COMPILE_PHYSICS_COMPONENTS_EMPTY',
        );
      }
      for (const [param] of PHYSICS_PARAMS) {
        const v = spec[param as keyof typeof spec] as number | undefined;
        if (v === undefined) continue;
        entry[param] = f32(v);
      }
      constraints.push(entry);
      physicsReport.push({
        name,
        bone: spec.bone,
        components,
        mix: spec.mix ?? 1,
        drivesMesh: meshBones.has(spec.bone),
      });
    }
  });

  // -- 5. animations ---------------------------------------------------------
  //
  // 🔑 What an attachment key is allowed to name, per slot: the UNION of every
  // emitted skin's placeholders for it. An attachment timeline is not keyed on a
  // skin — the format gives it a slot and a name, and `Skeleton.getAttachment`
  // resolves that name through the skin the skeleton is WEARING and then through
  // `defaultSkin` (spine-core 4.3.13 `Skeleton.js:335-346`). So the set a key can
  // legally draw from is every skin's, and which of them is showing is the
  // consumer's to decide by dressing the skeleton.
  //
  // ⚠️ A name some skins hold and others do not is therefore ACCEPTED, and that
  // is the format's own semantics rather than a gap in the check: under a skin
  // that lacks it the slot shows nothing, which is the same thing a `null` key
  // says and a thing a rig may well mean.
  //
  // Derived from `skinTables` rather than re-read off the rig spec, because what
  // a key can resolve to at runtime is what was EMITTED — a manifest state whose
  // art was dropped is in the spec and in no skin, and a key naming it has to
  // stay refused (issue #695).
  const attachmentsBySlot = new Map<string, Set<string>>();
  for (const table of skinTables.values()) {
    for (const [slotName, perSlot] of Object.entries(table)) {
      let known = attachmentsBySlot.get(slotName);
      if (!known) attachmentsBySlot.set(slotName, (known = new Set<string>()));
      for (const placeholder of Object.keys(perSlot)) known.add(placeholder);
    }
  }
  // `default` first, then the rig's own order — `skinTables`' insertion order,
  // which is the order the tables were made in (`:1990` and `:1994`). It is what
  // the refusal below reports as the skins it looked in, so it is read from the
  // map rather than restated.
  const attachmentIndex: SlotAttachmentIndex = { bySlot: attachmentsBySlot, searched: [...skinTables.keys()] };
  // The model's animations, in the motion spec's order; `emitAnimations` keys
  // them in the editor's at assembly.
  const animations = new Map<string, CompiledAnimation>();
  const declaredDurations: Record<string, number> = {};
  const slotNames = new Set(slots.map((s) => s.name));
  // Which slots an `rgba2` timeline may be keyed on: the model slots with a
  // `dark` — the slots the file is emitted from, which `emitSlots` writes each
  // `dark` of (issue #919) — for the same reason `attachmentIndex` is built off
  // the skin tables: what the runtime does with a timeline depends on the file,
  // not on the spec that produced it. A slot whose `dark` never reached the
  // artifact is a slot the runtime allocates no dark colour for (issue #690).
  const darkSlots = new Set(slots.filter((s) => s.dark !== undefined).map((s) => s.name));

  withMotionSource(() => {
    checkMotionGroups(motion);
    for (const [animName, anim] of Object.entries(motion.animations)) {
      declaredDurations[animName] = anim.duration;
      const slotTimelines = new Map<string, ModelTimelines>();
      const boneTimelines = new Map<string, ModelTimelines>();
      /**
       * One table per constraint family, target -> timelines. The physics
       * timeline that names no constraint is filed under its own target,
       * `EVERY_GLOBAL_PHYSICS`, in the position its track holds among the
       * named ones (`CompiledAnimation`).
       */
      const familyTimelines: Record<ConstraintTrackFamily, Map<string, ModelTimelines>> = {
        physics: new Map(),
        path: new Map(),
        slider: new Map(),
      };
      /** `targets.get(target)`, made on first use — the map keeps the order targets are first keyed in. */
      const timelinesOf = (targets: Map<string, ModelTimelines>, target: string): ModelTimelines => {
        let timelines = targets.get(target);
        if (timelines === undefined) targets.set(target, (timelines = new Map()));
        return timelines;
      };
      const claimed = new Set<string>();
      let compiledDuration = 0;

      for (const track of anim.tracks) {
        const family = constraintFamilyOf(track);
        const isBoneTrack = family === null && track.property in BONE_TRACKS;
        const targets = resolveTargets(track, motion, animName);
        // Per-member values are one statement about every member, so they are
        // resolved for the whole track before any target is compiled — and the
        // resolved keys are what everything below sees, which is why `v` means
        // one thing from here down (`MotionValueTrack`).
        const perMember = resolveMemberTrack(track, animName, targets, bones, trackDerivations);
        targets.forEach((target, index) => {
          const resolved = perMember.get(target)!;
          // The timeline that names no constraint (issue #726). Resolved against
          // the constraints' own `…Global` flags rather than a name, and refused
          // when it reaches none — the runtime would walk every physics
          // constraint, skip each one, and the file would parse and do nothing.
          const everyGlobal = family === 'physics' && target === EVERY_GLOBAL_PHYSICS;
          if (everyGlobal && track.physics === undefined) {
            throw new CompileError(
              `animation "${animName}": group "${String(track.group)}" lists "${EVERY_GLOBAL_PHYSICS}", which is not a ` +
                `constraint but the target that names none — write it as the track's \`"physics": "${EVERY_GLOBAL_PHYSICS}"\``, 'CE_COMPILE_PHYSICS_GLOBAL_GROUP_MEMBER',
            );
          }
          if (everyGlobal) {
            const physics = constraints.filter((one) => one.kind === 'physics');
            const flag = `${track.property}Global`;
            const reached =
              track.property === 'reset'
                ? physics
                : physics.filter((one) => one[flag] === true);
            if (reached.length === 0) {
              throw new CompileError(
                `animation "${animName}" keys physics "${EVERY_GLOBAL_PHYSICS}" ${track.property}, the timeline that ` +
                  `names no constraint and drives every physics constraint ` +
                  (track.property === 'reset' ? 'the rig has' : `declaring "${flag}": true`) +
                  ', and ' +
                  (physics.length === 0
                    ? 'the rig declares no physics constraint'
                    : `none of ${physics.map((one) => `"${one.name}"`).join(', ')} does`) +
                  ' — it would parse and move nothing. ' +
                  (track.property === 'reset'
                    ? 'Declare a physics constraint, or remove the track'
                    : `Set "${flag}": true on the constraints it is for, or key one by name`), 'CE_COMPILE_PHYSICS_GLOBAL_TRACK_INERT',
              );
            }
          } else if (family !== null) {
            const label = CONSTRAINT_TRACK_FAMILIES[family].label;
            // Resolved by name AND by type in the parser
            // (`findConstraint(name, PathConstraintData)`), which returns null on
            // a type mismatch and makes `readAnimation` throw in the consumer's
            // process. Named here instead, where the motion file can be named too
            // — and looked up the same way, so a rig that declares `leg` under two
            // kinds sends each track to its own constraint.
            if (!constraintDeclared.has(constraintAt(family, target))) {
              const kinds = constraintKinds.get(target) ?? [];
              if (kinds.length > 0) {
                throw new CompileError(
                  `animation "${animName}" keys "${target}" as a ${label}, but the rig declares it as a "${kinds.join('"/"')}" ` +
                    'constraint — a timeline group resolves its target by name AND type, misses, and the loader throws', 'CE_COMPILE_CONSTRAINT_TRACK_TYPE_MISMATCH',
                );
              }
              const known = constraintNamesOfKind.get(family) ?? [];
              throw new CompileError(
                `animation "${animName}" keys unknown ${label} "${target}"` +
                  (known.length ? ` (the rig declares: ${known.join(', ')})` : `, and the rig declares no ${family} constraint at all`), 'CE_COMPILE_CONSTRAINT_TRACK_TARGET_UNKNOWN',
              );
            }
          } else if (isBoneTrack) {
            if (!boneNames.has(target)) {
              throw new CompileError(`animation "${animName}" keys unknown bone "${target}"`, 'CE_COMPILE_ANIMATION_BONE_UNKNOWN');
            }
          } else if (!slotNames.has(target)) {
            throw new CompileError(`animation "${animName}" targets unknown slot "${target}"`, 'CE_COMPILE_ANIMATION_SLOT_UNKNOWN');
          }
          // A timeline is a kind, a name and a property — `physics.leg.mix` and
          // `path.leg.mix` are two timelines on two constraints, so the claim
          // carries the family the target was resolved in (issue #692). The
          // sentence still names the pair the author wrote.
          const claim = `${family ?? (isBoneTrack ? 'bone' : 'slot')} ${target}.${track.property}`;
          if (claimed.has(claim)) {
            throw new CompileError(
              `animation "${animName}" has two tracks on ${target}.${track.property}; merge them into one track`, 'CE_COMPILE_ANIMATION_TRACK_DUPLICATE',
            );
          }
          claimed.add(claim);
          // Two colour timelines of one slot that pose a shared channel are not
          // two layers of it: each poses its channels at every time, the setup
          // value before its first key included, so the one the file states
          // later overwrites the other everywhere (`SLOT_COLOR_CHANNELS`). The
          // claim above cannot see it — `rgba` and `alpha` are two properties —
          // and before issue #730 nothing could reach it, because `rgba` and
          // `rgba2` were the only two and a slot keying both was already a
          // slot keying its light colour twice. Raised before any key is shaped:
          // the fault is the pair, not a key.
          if (family === null && !isBoneTrack) {
            const mine = SLOT_COLOR_CHANNELS[track.property] ?? [];
            for (const other of slotTimelines.get(target)?.keys() ?? []) {
              const shared = (SLOT_COLOR_CHANNELS[other] ?? []).filter((channel) => mine.includes(channel));
              if (shared.length === 0) continue;
              throw new CompileError(
                `animation "${animName}" slot "${target}": tracks "${other}" and "${track.property}" both key the slot's ` +
                  `${shared.map((channel) => CHANNEL_WORDS[channel]).join(' and ')} — a colour timeline poses its ` +
                  'channels at every time, its setup value before its first key included, so the one the file states ' +
                  'later overwrites the other everywhere and the first one\'s keys there are read by nothing. Key each ' +
                  'channel once: "rgb" and "alpha" move the light colour\'s two halves on their own key times, "rgba" ' +
                  'moves them together, and "rgb2" / "rgba2" add the dark colour', 'CE_COMPILE_COLOUR_TRACK_CHANNEL_OVERLAP',
              );
            }
          }

          const shift = (track.lag ?? 0) + (track.stagger ?? 0) * index;
          const keys =
            family !== null
              ? compileValueTrack(
                  resolved,
                  motion,
                  animName,
                  anim.duration,
                  target,
                  shift,
                  CONSTRAINT_TRACK_FAMILIES[family].tracks,
                  CONSTRAINT_TRACK_FAMILIES[family].label,
                )
              : isBoneTrack
                ? compileValueTrack(resolved, motion, animName, anim.duration, target, shift, BONE_TRACKS, 'bone')
                : compileTrack(resolved, motion, animName, anim.duration, target, shift, attachmentIndex, darkSlots);
          for (const key of keys) compiledDuration = Math.max(compiledDuration, key.time);
          // The every-global physics timeline under its own target, `*`
          // (`everyGlobal`); the empty name is the Spine emitter's spelling.
          if (family !== null) timelinesOf(familyTimelines[family], target).set(track.property, keys);
          else if (isBoneTrack) timelinesOf(boneTimelines, target).set(track.property, keys);
          else timelinesOf(slotTimelines, target).set(track.property, keys);
        });
      }

      // -- constraint timelines: one unnamed timeline per constraint ---------
      //
      // `ik` and `transform` sit beside `tracks` rather than in it because their
      // keys carry named fields instead of one `v` — see `MotionAnimation.ik`.
      // The target is resolved by name AND by type: `findConstraint(name,
      // IkConstraintData)` misses a transform constraint of the same name and the
      // parser throws in the consumer's process, so the mismatch is named here.
      const constraintTimelines: Record<'ik' | 'transform', Map<string, ModelKey[]>> = {
        ik: new Map(),
        transform: new Map(),
      };
      for (const group of ['ik', 'transform'] as const) {
        // The array, the entries and their `constraint` names are shapes, so
        // they are `parseMotionSpec`'s; what is left here needs the rig's
        // constraint table.
        const tracks: Array<MotionIkTrack | MotionTransformTrack> = anim[group] ?? [];
        for (const track of tracks) {
          const name = track.constraint;
          if (!constraintDeclared.has(constraintAt(group, name))) {
            const kinds = constraintKinds.get(name) ?? [];
            if (kinds.length > 0) {
              throw new CompileError(
                `animation "${animName}" keys "${name}" as ${group === 'ik' ? 'an' : 'a'} ${group} constraint, but the rig declares it as a ` +
                  `"${kinds.join('"/"')}" constraint — the parser looks a timeline's target up by name AND type, misses, and throws`, 'CE_COMPILE_CONSTRAINT_TIMELINE_TYPE_MISMATCH',
              );
            }
            const known = constraintNamesOfKind.get(group) ?? [];
            throw new CompileError(
              `animation "${animName}" keys unknown ${group} constraint "${name}"; ` +
                (known.length
                  ? `the rig declares ${group} constraint(s): ${known.join(', ')}`
                  : `the rig declares no ${group} constraint at all`), 'CE_COMPILE_CONSTRAINT_TIMELINE_TARGET_UNKNOWN',
            );
          }
          if (constraintTimelines[group].has(name)) {
            throw new CompileError(
              `animation "${animName}" has two ${group} timelines on constraint "${name}"; ` +
                'the group holds one timeline per constraint, so merge them into one', 'CE_COMPILE_CONSTRAINT_TIMELINE_DUPLICATE',
            );
          }
          const keys = compileConstraintTrack(
            group,
            track,
            motion,
            animName,
            anim.duration,
            // The ik table, asked only by the ik group: `leg` may also be a
            // transform constraint, and a transform key set carries no flag for
            // the rig's booleans to be stamped onto (issue #692).
            group === 'ik' ? (ikFlagsInEffect.get(name) ?? {}) : {},
          );
          for (const key of keys) compiledDuration = Math.max(compiledDuration, key.time);
          constraintTimelines[group].set(name, keys);
        }
      }

      // -- deform timelines: keyed on a skin/slot/attachment triple ----------
      // skin -> slot -> attachment -> its `deform` and `sequence` keys: the two
      // timelines an attachment can carry, which is why the last level exists.
      const deformTimelines = new Map<string, Map<string, Map<string, ModelAttachmentTimelines>>>();
      /** The triple's entry, made on first use in the order triples are first keyed. */
      const attachmentTimelinesOf = (skin: string, slot: string): Map<string, ModelAttachmentTimelines> => {
        let bySlot = deformTimelines.get(skin);
        if (bySlot === undefined) deformTimelines.set(skin, (bySlot = new Map()));
        let byAttachment = bySlot.get(slot);
        if (byAttachment === undefined) bySlot.set(slot, (byAttachment = new Map()));
        return byAttachment;
      };
      const deformTracks: MotionDeformTrack[] = anim.deform ?? [];
      for (const track of deformTracks) {
        const skinName = track.skin ?? 'default';
        const at = `animation "${animName}" deform ${skinName}/${String(track.slot)}/${String(track.attachment)}`;
        const table = skinTables.get(skinName);
        if (!table) {
          throw new CompileError(
            `${at}: this rig emits no skin called "${skinName}" (it emits: ${[...skinTables.keys()].join(', ')})`, 'CE_COMPILE_ATTACHMENT_TIMELINE_SKIN_UNKNOWN',
          );
        }
        const perSlot = table[track.slot];
        if (!perSlot) {
          throw new CompileError(
            `${at}: skin "${skinName}" gives slot "${String(track.slot)}" no attachments` +
              (slotNames.has(track.slot) ? '' : ', and this rig does not declare that slot at all'), 'CE_COMPILE_ATTACHMENT_TIMELINE_SLOT_EMPTY',
          );
        }
        const attachment = perSlot[track.attachment];
        if (!attachment) {
          throw new CompileError(
            `${at}: slot "${track.slot}" in skin "${skinName}" has no attachment "${String(track.attachment)}" ` +
              `(it has: ${Object.keys(perSlot).join(', ')})`, 'CE_COMPILE_ATTACHMENT_TIMELINE_ATTACHMENT_UNKNOWN',
          );
        }
        if (deformTimelines.get(skinName)?.get(track.slot)?.has(track.attachment)) {
          throw new CompileError(`${at}: two deform timelines on one attachment; merge them into one`, 'CE_COMPILE_DEFORM_TIMELINE_DUPLICATE');
        }
        const keys = compileDeformTrack(
          track,
          motion,
          animName,
          anim.duration,
          {
            ...deformGeometryOf(attachment, at, transforms),
            depth: attachmentDepths.get(`${skinName}/${track.slot}/${track.attachment}`) ?? null,
            soft: attachmentSoftMasks.get(`${skinName}/${track.slot}/${track.attachment}`) ?? null,
          },
          deformTransforms,
        );
        for (const key of keys) compiledDuration = Math.max(compiledDuration, key.time);
        attachmentTimelinesOf(skinName, track.slot).set(track.attachment, { deform: keys });
      }

      // -- sequence timelines: the other attachment timeline (issue #729) -----
      // Same triple, same table: `readAnimation` reads both names out of one
      // attachment map, and one attachment may carry both. `deform` is written
      // first where both exist, which is the order the parser tests them in.
      const sequenceTracks: MotionSequenceTrack[] = anim.sequence ?? [];
      for (const track of sequenceTracks) {
        const skinName = track.skin ?? 'default';
        const at = `animation "${animName}" sequence ${skinName}/${String(track.slot)}/${String(track.attachment)}`;
        const table = skinTables.get(skinName);
        if (!table) {
          throw new CompileError(
            `${at}: this rig emits no skin called "${skinName}" (it emits: ${[...skinTables.keys()].join(', ')})`, 'CE_COMPILE_ATTACHMENT_TIMELINE_SKIN_UNKNOWN',
          );
        }
        const perSlot = table[track.slot];
        if (!perSlot) {
          throw new CompileError(
            `${at}: skin "${skinName}" gives slot "${String(track.slot)}" no attachments` +
              (slotNames.has(track.slot) ? '' : ', and this rig does not declare that slot at all'), 'CE_COMPILE_ATTACHMENT_TIMELINE_SLOT_EMPTY',
          );
        }
        const attachment = perSlot[track.attachment];
        if (!attachment) {
          throw new CompileError(
            `${at}: slot "${track.slot}" in skin "${skinName}" has no attachment "${String(track.attachment)}" ` +
              `(it has: ${Object.keys(perSlot).join(', ')})`, 'CE_COMPILE_ATTACHMENT_TIMELINE_ATTACHMENT_UNKNOWN',
          );
        }
        const keys = compileSequenceTrack(track, anim.duration, attachment, at);
        for (const key of keys) compiledDuration = Math.max(compiledDuration, key.time);
        const slot = attachmentTimelinesOf(skinName, track.slot);
        if (slot.get(track.attachment)?.sequence) {
          throw new CompileError(`${at}: two sequence timelines on one attachment; merge them into one`, 'CE_COMPILE_SEQUENCE_TIMELINE_DUPLICATE');
        }
        slot.set(track.attachment, { ...(slot.get(track.attachment) ?? {}), sequence: keys });
      }

      const drawOrder = anim.drawOrder ? compileDrawOrder(anim.drawOrder, animName, anim.duration, slots) : [];
      for (const key of drawOrder) compiledDuration = Math.max(compiledDuration, key.time);

      const eventKeys = anim.events ? compileEvents(anim.events, animName, anim.duration, rig.events ?? {}) : [];
      // An event timeline counts towards the animation's length the same as any
      // other: `readAnimation` takes the duration from the longest timeline it
      // built, and `EventTimeline.getDuration()` is its last frame like the rest.
      for (const key of eventKeys) compiledDuration = Math.max(compiledDuration, key.time);

      // Rule 4: the declared duration is verified, because skeleton JSON does not
      // carry one — the loader takes the max key time.
      //
      // This arm is about the DECLARED DURATION being wrong, so it compares one
      // number per animation and tolerates a frame of it. The other arm —
      // `checkKeyTime`, above, per key — is about a key landing past the end, and
      // a frame is 16,667 times too coarse to see one. Both are needed: this one
      // catches an animation that stops a second early, and only that one catches
      // a key on a track whose neighbour already sits on the declared duration.
      if (Math.abs(compiledDuration - anim.duration) > FRAME) {
        throw new CompileError(
          `animation "${animName}" declares duration ${anim.duration}s but its last key is at ${compiledDuration}s`, 'CE_COMPILE_ANIMATION_DURATION_MISMATCH',
        );
      }
      // The model's record of the animation. Which groups the file carries, in
      // what order and under what spelling is the Spine emitter's
      // (`emitAnimation`: `readAnimation`'s reading order, each group only when
      // non-empty).
      animations.set(animName, {
        duration: anim.duration,
        bones: boneTimelines,
        slots: slotTimelines,
        constraints: {
          ik: constraintTimelines.ik,
          transform: constraintTimelines.transform,
          path: familyTimelines.path,
          physics: familyTimelines.physics,
          slider: familyTimelines.slider,
        },
        attachments: deformTimelines,
        drawOrder,
        events: eventKeys,
      });
    }
  });

  // -- 6. assemble -----------------------------------------------------------
  //
  // The stage is four fields or none of them — `x`/`y` are the origin of the
  // box `width`/`height` give an extent to, so a header carrying an origin for
  // a box it does not declare would be a shape no export has (issue #578). The
  // model holds it since issue #1026 (`ModelStage`), and the emitter writes the
  // model's value into the header, as it writes `referenceScale`.
  const stage: ModelStage | null =
    stageWidth !== undefined && stageHeight !== undefined
      ? { x: rig.skeleton?.x ?? 0, y: rig.skeleton?.y ?? 0, width: stageWidth, height: stageHeight, ...(stageBox === null ? {} : { box: { slot: stageBox.slot, attachment: stageBox.attachment } }) }
      : null;
  // What the skeleton carries that the model does not hold: the rest of the header.
  const header: Omit<SkeletonHeader, 'bounds'> = {
    spine: SPINE_VERSION,
    fps: rig.skeleton?.fps,
    images: skeletonImagesPath(rig.skeleton?.images, opts, outDir, partDirs),
    audio: rig.skeleton?.audio,
  };

  // Event definitions, in the order the rig spec declares them — the map's
  // insertion order is the spec's, not a set's, so A18 stays a contract.
  const events = new Map<string, ModelEvent>();
  for (const [name, def] of Object.entries(rig.events ?? {})) {
    const entry: ModelEvent = {};
    if (def.int !== undefined) entry.int = def.int;
    if (def.float !== undefined) entry.float = f32(def.float);
    if (def.string !== undefined) entry.string = def.string;
    if (def.audio !== undefined) entry.audio = def.audio;
    if (def.volume !== undefined) entry.volume = f32(def.volume);
    if (def.balance !== undefined) entry.balance = f32(def.balance);
    events.set(name, entry);
  }
  // Every skin with what it activates and its table, in the spec's order: the
  // model's record of it. `splitRigSkin`'s lists, or none for a skin the spec
  // does not declare (a manifest's `default`).
  const skins: ModelSkin[] = [...skinTables].map(([name, attachments]) => {
    const parts = skinParts.get(name);
    return {
      name,
      bones: parts?.bones ?? [],
      constraints: Object.fromEntries(RIG_SKIN_CONSTRAINT_KEYS.map((key) => [key, parts?.constraints[key] ?? []])) as ModelSkin['constraints'],
      attachments,
    };
  });

  // The skeleton's reference scale, which wind and gravity act over (issue
  // #958): the rig's stated number as it is, or the value the parser reads a
  // header stating none as. The model holds it; the emitter writes it into the
  // header, where the parser-default pass drops it at 100 as before.
  const referenceScale = rig.skeleton?.referenceScale ?? UNSTATED_REFERENCE_SCALE;
  // The editor's orders (issue #1026, `ModelEditorOrder`): the three functions
  // `compile` hands the Spine emitter (`EDITOR_ORDERS`), run here over the same
  // model, so the order the document states and the order `skeleton.json` keys
  // are one computation. Skins first and animations second, as the emitter
  // applies them, so a name pair the editor could key two ways is refused here
  // in the order it was refused at emission before this entry existed.
  //
  // ⚠️ A name list the file KEYS is the keys of an object filled in that
  // order: an object lists an integer-like key ("2", "10") before every other
  // key. Since issue #1034 that is `editorAnimationOrder`'s own result rather
  // than a step applied here, so a reader deriving the order of a `/2` document
  // (`fileAnimationOrder`) is handed the same list this states.
  const editorOrder: ModelEditorOrder = editorOrderOver(skins, [...animations.keys()]);

  for (const slot of slots) {
    if (!boneNames.has(slot.bone)) throw new CompileError(`slot "${slot.name}" has no bone`, 'CE_COMPILE_SLOT_BONE_MISSING');
  }

  // One bone order per weighted attachment (issue #1407), on the finished
  // model, so the document, both posers and the Spine file read one order.
  oneBoneOrderPerAttachment(bones, skins, animations, deformTransforms);

  // The fields the model carries as `CompileResult` carries them, by reference:
  // one object, so the result and its model cannot say two different things.
  const carried: CarriedFromCompileResult = {
    images,
    pageGrids: atlasIn === null ? [] : [...atlasIn.grids].map(([page, grid]) => ({ page, said: grid.said })),
    droppedStates,
    absentParts,
    meshBones: [...meshBones],
    meshes,
    physics: physicsReport,
    deformTransforms,
    trackDerivations,
    rig: buildRigInfo(rig, bones, meshes, manifest, images),
  };
  return {
    model: { referenceScale, stage, bones, setupWorld: transforms, slots, skins, constraints, events, animations, editorOrder, ...carried },
    header,
    atlasText,
    declaredDurations,
  };
}

/**
 * The editor's orders, as `compile` hands them to the Spine emitter and as
 * `compileModel` states them in the model (`editorOrder`, issue #1026) — one
 * object, so the two cannot be handed different functions.
 */
const EDITOR_ORDERS = { skins: editorSkinOrder, slotKeys: editorSlotKeyOrder, animations: editorAnimationOrder } as const;

/**
 * The order an object filled with `names`, in that order, lists its keys in —
 * the order a JSON object keyed by them is spelled in, and the order
 * spine-core reads it in: every array-index name (`5`, `10`; not `01`, `-a`,
 * `2b`) first, ascending, then the rest as filled (issue #1034).
 *
 * ⭐ It is the rule for EVERY object the Spine file keys by a name, not only
 * `animations`: the emitter fills each such object in the model's order — an
 * animation's `slots`, `bones`, `ik`, `transform`, `path`, `physics` and
 * `slider` groups and its `attachments` at all three levels (skin, slot,
 * attachment) — so a reader walking one of them in the file's order walks
 * this over the model's order (`src/deformstructure.ts`'s deform timelines,
 * `src/assertions/model/constraints.ts`'s constraint timelines). Measured on a
 * build whose `ik` group keys `leg_f_ik` then `5`: the file and spine-core list
 * `5, leg_f_ik`.
 */
export function keyedOrder(names: readonly string[]): string[] {
  const keyed: Record<string, true> = {};
  for (const name of names) keyed[name] = true;
  return Object.keys(keyed);
}

/** A skin as far as its order reads it: its name and its table, keyed by slot. */
interface OrderedSkin {
  name: string;
  attachments: Readonly<Record<string, unknown>>;
}

/**
 * The orders the Spine file lists `skins`, each skin's slot keys and
 * `animations` in, over a model's skins and animation names: `EDITOR_ORDERS`,
 * the functions `compile` hands the emitter, so this is the emitted order by
 * construction rather than a second statement of it (issue #1034). `compileModel`
 * states it in the model (`editorOrder`); `fileAnimationOrder` and `fileSkinOrder` derive it for a
 * document that does not state it. A name set the editor could key two ways is
 * refused here by name, as at emission.
 */
export function editorOrderOver(skins: readonly OrderedSkin[], animations: readonly string[]): ModelEditorOrder {
  return { skins: editorSkinsOver(skins), animations: EDITOR_ORDERS.animations(animations) };
}

/** `editorOrderOver`'s skins alone: each skin's name and slot keys, in the file's order. */
function editorSkinsOver(skins: readonly OrderedSkin[]): ModelEditorOrder['skins'] {
  return EDITOR_ORDERS.skins(skins).map((skin) => ({ name: skin.name, slots: Object.keys(EDITOR_ORDERS.slotKeys(skin.attachments)) }));
}

/** What a reader of a model document holds that the file's orders are read or derived from: `CompiledDocument`'s fields. */
export interface OrderedDocument {
  skins: readonly OrderedSkin[];
  animations: readonly { name: string }[];
  stated: { editorOrder: ModelEditorOrder } | null;
}

/**
 * The order the Spine file lists a model document's animations in — the one
 * place a reader of the document gets it (issue #1034), with
 * `fileSkinOrder` its sibling for the skins and their slot keys.
 *
 * - A `rigc-compiled/3` document STATES it (`editorOrder`, issue #1026), and
 *   that statement is the one source: nothing derives it beside the document.
 * - A `/2` or `/1` document does not, and it is derived by the emitter's own
 *   rule over the document's names (`EDITOR_ORDERS`, as `editorOrderOver`
 *   runs it) — the file's order for every name, integer-like ones included
 *   (`editorAnimationOrder`'s 🔢). A name set the editor could key two ways is
 *   refused by name (`CompileError`), as at emission.
 */
export function fileAnimationOrder(doc: OrderedDocument): readonly string[] {
  return doc.stated !== null ? doc.stated.editorOrder.animations : EDITOR_ORDERS.animations(doc.animations.map((a) => a.name));
}

/** `fileAnimationOrder`'s sibling: the skins, each with its slot keys, in the order the Spine file lists them — stated by a `/3` document, derived for a `/2` or `/1` one. */
export function fileSkinOrder(doc: OrderedDocument): ModelEditorOrder['skins'] {
  return doc.stated !== null ? doc.stated.editorOrder.skins : editorSkinsOver(doc.skins);
}

/**
 * `skins` in the order `order` lists them (`fileSkinOrder`), each
 * with its slot keys in that order. The k-th entry of a name is the k-th skin
 * of that name, so two skins answering to one name — a defect another check
 * names — are neither merged nor dropped. A skin `order` does not list, or an
 * entry naming no skin left, is this caller's defect (`readModel` refuses an
 * `editorOrder` that is not a permutation of the document's skins), so it
 * throws rather than walking a guess.
 */
export function skinsInFileOrder<T extends { name: string }>(skins: readonly T[], order: ModelEditorOrder['skins']): Array<{ skin: T; slots: readonly string[] }> {
  const left = [...skins];
  const out: Array<{ skin: T; slots: readonly string[] }> = [];
  for (const entry of order) {
    const at = left.findIndex((skin) => skin.name === entry.name);
    if (at < 0) throw new Error(`internal: the file's skin order names skin "${entry.name}", which no skin left in the walk answers to`);
    out.push({ skin: left[at], slots: entry.slots });
    left.splice(at, 1);
  }
  if (left.length > 0) throw new Error(`internal: the file's skin order leaves out skin(s) ${left.map((skin) => `"${skin.name}"`).join(', ')}`);
  return out;
}

/**
 * The fields `CompileResult` carries from the model, in the order it has
 * always carried them (`CarriedFromCompileResult`), by reference.
 */
function carriedOf(model: CompiledModel): CarriedFromCompileResult {
  return {
    images: model.images,
    pageGrids: model.pageGrids,
    droppedStates: model.droppedStates,
    absentParts: model.absentParts,
    meshBones: model.meshBones,
    meshes: model.meshes,
    physics: model.physics,
    deformTransforms: model.deformTransforms,
    trackDerivations: model.trackDerivations,
    rig: model.rig,
  };
}

// ---------------------------------------------------------------------------
// bones
// ---------------------------------------------------------------------------

interface BoneContext {
  rig: RigSpec;
  manifest: FaceManifest | null;
  cropH: number;
  axisSpineDeg: number | null;
  partBySlot: Map<string, FaceManifestPart>;
}

/**
 * One rig bone -> one model bone (`ModelBone`); `emitBones` writes it as Spine's.
 *
 * 🔑 A field is emitted exactly when the spec declared it. That is not Spine's
 * own exporter convention (it omits anything equal to the default) and the
 * difference is deliberate: a formation may need to say `x: 0` out loud, and
 * deciding emission from the arithmetic rather than from the author's text makes
 * the file depend on a rounding.
 */
function buildBone(spec: RigBone, soFar: ModelBone[], ctx: BoneContext): ModelBone {
  const bone: ModelBone = { name: spec.name };
  if (spec.parent !== undefined) bone.parent = spec.parent;
  if (spec.length !== undefined) bone.length = f32(spec.length);

  const crop = cropPointOf(spec, ctx);
  if (crop) {
    // Crop pixels (y down) -> Spine world (y up) -> the parent's local space. The
    // inverse is the same one the mesh binder uses, so a rotated parent (the axis
    // bone, a grip) is handled once rather than per call site.
    const world: [number, number] = [crop[0], cropToSpineY(crop[1], ctx.cropH)];
    if (spec.parent === undefined) {
      bone.x = f32(world[0]);
      bone.y = f32(world[1]);
    } else {
      const parent = computeWorldTransforms(soFar).get(spec.parent);
      if (!parent) throw new CompileError(`bone "${spec.name}" names parent "${spec.parent}", which is declared after it`, 'CE_COMPILE_BONE_PARENT_ORDER');
      const [lx, ly] = toBoneLocal(parent, world[0], world[1]);
      bone.x = f32(lx);
      bone.y = f32(ly);
    }
  } else {
    if (spec.x !== undefined) bone.x = f32(spec.x);
    if (spec.y !== undefined) bone.y = f32(spec.y);
  }

  const rotation = rotationOf(spec, ctx);
  if (rotation !== null) bone.rotation = f32(rotation);
  if (spec.scaleX !== undefined) bone.scaleX = f32(spec.scaleX);
  if (spec.scaleY !== undefined) bone.scaleY = f32(spec.scaleY);
  if (spec.shearX !== undefined) bone.shearX = f32(spec.shearX);
  if (spec.shearY !== undefined) bone.shearY = f32(spec.shearY);
  if (spec.inherit !== undefined) bone.inheritMode = spec.inherit;
  if (spec.skin !== undefined) bone.skinRequired = spec.skin;
  if (spec.color !== undefined || spec.icon !== undefined) {
    bone.editor = {};
    if (spec.color !== undefined) bone.editor.color = spec.color;
    if (spec.icon !== undefined) bone.editor.icon = spec.icon;
  }
  return bone;
}

/** The crop-pixel point a bone's `from` names, or null when it declares none. */
function cropPointOf(spec: RigBone, ctx: BoneContext): [number, number] | null {
  const from = spec.from;
  if (!from) return null;
  const needManifest = (what: string): FaceManifest => {
    if (!ctx.manifest) {
      throw new CompileError(`bone "${spec.name}" takes its position from ${what}, which needs a cut manifest`, 'CE_COMPILE_BONE_POSITION_MANIFEST_REQUIRED');
    }
    return ctx.manifest;
  };
  if (from.anchor !== undefined) {
    const manifest = needManifest(`the manifest anchor "${from.anchor}"`);
    const anchor = manifest.anchors?.[from.anchor];
    if (!anchor || anchor.length < 2) {
      throw new CompileError(
        `manifest anchors has no [x, y] for "${from.anchor}" (bone "${spec.name}" of rig "${ctx.rig.name}")`, 'CE_COMPILE_BONE_ANCHOR_MISSING',
      );
    }
    return [anchor[0], anchor[1]];
  }
  if (from.slotWindow !== undefined) {
    const manifest = needManifest(`the window of slot "${from.slotWindow}"`);
    const part = ctx.partBySlot.get(from.slotWindow);
    if (!part) {
      throw new CompileError(
        `bone "${spec.name}" sits at the centre of slot "${from.slotWindow}", which this cut's manifest carries no part for`, 'CE_COMPILE_BONE_SLOT_WINDOW_MISSING',
      );
    }
    const win = partWindow(part, manifest);
    return [win.x + win.w / 2, win.y + win.h / 2];
  }
  if (from.meshCenter !== undefined) {
    needManifest(`the mesh centre of slot "${from.meshCenter}"`);
    const centre = ctx.partBySlot.get(from.meshCenter)?.mesh?.center;
    if (!centre) {
      throw new CompileError(
        `bone "${spec.name}" sits on the mesh centre of slot "${from.meshCenter}", which declares no mesh.center`, 'CE_COMPILE_BONE_MESH_CENTER_MISSING',
      );
    }
    return [centre[0], centre[1]];
  }
  return null;
}

/** The setup rotation a bone declares, in Spine degrees, or null for none. */
function rotationOf(spec: RigBone, ctx: BoneContext): number | null {
  const source = spec.from?.rotation;
  if (source === 'axis') {
    if (ctx.axisSpineDeg === null) {
      throw new CompileError(`bone "${spec.name}" takes its rotation from the cut axis, which the manifest does not declare`, 'CE_COMPILE_BONE_ROTATION_AXIS_MISSING');
    }
    return ctx.axisSpineDeg;
  }
  if (source === 'anchor') {
    const key = spec.from!.anchor!;
    const anchor = ctx.manifest?.anchors?.[key];
    if (!anchor || anchor.length < 3) {
      throw new CompileError(
        `bone "${spec.name}" takes its rotation from anchor "${key}", which has no third element (a screen-space facing angle)`, 'CE_COMPILE_BONE_ANCHOR_ROTATION_MISSING',
      );
    }
    return screenToSpineDegrees(anchor[2]);
  }
  return spec.rotation ?? null;
}

// ---------------------------------------------------------------------------
// attachment names, and the one placeholder shape the editor cannot hold
// ---------------------------------------------------------------------------

/**
 * An attachment as the builder made it, with the spec's own `name` put on it —
 * or unchanged, where the spec states none.
 *
 * ## rigc derives no name (issue #796)
 *
 * `readAttachment` reads `name = getValue(map, "name", placeholder)`
 * (`SkeletonJson.js:526`), so an entry that states no `name` is named by its
 * placeholder and one that states a name is named by it: the runtime's
 * `Attachment.name`, which a consumer reads off `slot.attachment.name`. That is
 * the whole of what the field does. Nothing in the format resolves by it — a
 * skin's table, a slot's setup `attachment`, an attachment or deform timeline and
 * a linked mesh's `source` are keyed by the placeholder (`:415-418`, `:433`,
 * `:1140`) — so the field is emitted exactly when the spec states it, verbatim,
 * and never composed.
 *
 * 🚨 **It used to be composed, and the composition was measured wrong on
 * production data.** Issue #541 (landed by #552) wrote `"<skin>/<placeholder>"`
 * for every placeholder more than one skin fills, on the reading that *"the
 * editor requires attachment names to be unique — because a linked mesh resolves
 * its parent by name"*. Both halves fail a measurement:
 *
 * - **A linked mesh resolves its source by skin, slot and KEY.** Measured through
 *   spine-core 4.3.13: two skins each fill placeholder `C` with a different mesh
 *   and no `name`, both load named `C`, and a link in the second skin with
 *   `source: "C", skin: <second>` binds the SECOND skin's mesh; the same link
 *   with `skin: <first>` binds the first. A link whose `source` spells its
 *   source's stated name rather than its key throws `Source mesh not found`.
 * - **The editor imports the uncomposed shape.** A production rig whose
 *   placeholders are each filled by two named skins, meshes and linked meshes
 *   among them, imported through Spine 4.3.26 with every composed name stripped
 *   — exit 0 and a project written (#796). It is the shape that editor exported
 *   in the first place.
 *
 * What #541 actually bisected was a rig whose DEFAULT skin filled the contested
 * placeholder beside the named ones (`default` + one named skin was its smallest
 * refusing variant), and that shape is refused here on its own measurement —
 * `refuseDefaultSkinContest` — which never depended on the composition.
 *
 * ⚠️ `path` is not touched. It stays the builder's — stated, or derived from
 * `image` against the name the attachment will carry (`attachmentPath`) — and
 * its default is the parser's, `path = getValue(map, "path", name)`
 * (`:529`, `:560`), so a stated name with no `path` resolves the region that
 * name spells.
 *
 * 🔸 `name` is written FIRST: the editor writes it ahead of `type` on every
 * named attachment of the production set #796 was measured on (all of them
 * meshes), and it is the key the parser reads first. No region, polygon or link
 * with a name was in that set, so for those types the position is the same
 * choice rather than a second measurement.
 */
function withStatedName(att: SkinTableEntry, stated: RigAttachment): SkinTableEntry {
  const name = (stated as { name?: string }).name;
  return name === undefined ? att : { name, ...att };
}

/**
 * Refuse a placeholder that the **default** skin and a named skin both fill.
 *
 * 🚨 This is issue #567 and it is not a naming problem, which took two editor
 * round trips to establish because each of them looked like one.
 *
 * ## What the editor's model is, bracketed by two trips
 *
 * Both on Spine **4.3.26**, on a rig whose three skins fill one placeholder
 * `patch` from three PNGs of three sizes, with a second slot `block` that one
 * skin fills as the fixed point.
 *
 * **Trip 7 — the default skin's attachment given a name of its own**
 * (`"name": "default/patch"`, as issue #552 emitted it). The editor IMPORTS it,
 * and exports the default skin's entry re-keyed by that name:
 *
 *     built     "default": { "patch": { "patch":         { "name": "default/patch", … } } }
 *     exported  "default": { "patch": { "default/patch": {                          … } } }
 *
 * The editor's default skin holds no skin placeholders — an attachment there
 * hangs on the slot and is known by its name alone — so the name becomes the
 * key. The slot's setup `attachment: "patch"` then resolves in no default-skin
 * key and the default skin draws NOTHING: `check` read mean MAE 98.52 with
 * `drewSlots: 0` on the `patch` chain while `validate --profile spine` stayed
 * green, because the file is well-formed and only the editor's model says what
 * a key means.
 *
 * **Trip 8 — the default skin's attachment left as its placeholder** (no `name`,
 * the obvious repair). The editor REFUSES the import:
 *
 *     ERROR: Unable to import skeleton.
 *     Cause: [error] Error reading attachment: mike/patch (nSX)
 *     Cause: [error] Multiple attachments have the same name:
 *     patch
 *     patch
 *
 * The default skin's attachment `patch` hangs on the slot; the named skins'
 * placeholder `patch` is that slot's other child. **In one slot, a default-skin
 * attachment name and a named skin's placeholder name are the same namespace.**
 *
 * ⇒ The two trips close the case: name it and the setup attachment resolves
 * nowhere, do not name it and the import is refused. **The editor has no
 * representation for a placeholder the default skin and a named skin both
 * fill** — its own convention is shared art in the default skin, per-skin art in
 * placeholders, and a slot's one setup `attachment` string naming one or the
 * other. There is no third spelling to find, so this is a `CompileError` and not
 * a scheme, in the shape issue #543 used: refuse by name and say what to do.
 *
 * 🔒 **Why it outlived the composition it was written beside (#796).** Both
 * trips are about the default skin's entry, and neither needs a name to be
 * composed for anything to fail: trip 8 is the uncomposed spelling, and trip 7
 * is exactly what a spec stating a `name` on that entry would now emit. So the
 * refusal stands on its own two measurements, and a stated `name` does not lift
 * it. What it never covered — two or more NAMED skins filling one placeholder —
 * is the shape the editor exports itself, and it is emitted as stated.
 */
function refuseDefaultSkinContest(slotName: string, placeholder: string, skins: readonly string[]): never {
  const named = skins.filter((skin) => skin !== DEFAULT_SKIN);
  throw new CompileError(
    `slot "${slotName}": placeholder "${placeholder}" is filled by the "${DEFAULT_SKIN}" skin AND by ` +
      `${named.length === 1 ? 'skin' : 'skins'} ${named.map((skin) => `"${skin}"`).join(', ')}, and the Spine ` +
      'editor has no way to hold that. Measured on 4.3.26 in both spellings: give the default skin\'s attachment a ' +
      'name of its own and the editor re-keys it by that name on export, so the slot\'s setup attachment ' +
      `"${placeholder}" resolves in no default-skin key and the default skin draws nothing; leave it as the ` +
      'placeholder and the import is refused outright with ' +
      `"Multiple attachments have the same name: ${placeholder} ${placeholder}", because a default-skin attachment ` +
      "hangs on the slot beside the named skins' placeholder of that name. Move the default skin's entry for this " +
      `slot into a named skin — call it "base" — so every skin filling "${placeholder}" is a named one. Two or more ` +
      'named skins sharing a placeholder is the shape the editor exports itself, and it needs no `name` (#796).', 'CE_COMPILE_DEFAULT_SKIN_PLACEHOLDER_CONFLICT',
  );
}

/**
 * Walk every `(slot, placeholder)` pair more than one skin fills, and refuse the
 * one shape among them the editor has no representation for: a pair the
 * **default** skin is one of the fillers of (`refuseDefaultSkinContest`).
 *
 * Every other contested pair is legal as it stands and is emitted exactly as
 * the spec states it — the same placeholder key in each skin, each entry named
 * by its own `name` or by that key (issue #796). This function decides nothing
 * about names; until #796 it also composed and collision-checked
 * `<skin>/<placeholder>`, and both went with the composition.
 */
function refuseDefaultSkinContests(skinNames: readonly string[], skinParts: Map<string, RigSkinParts>): void {
  /** slot -> placeholder -> the skins that fill it, in declaration order. */
  const fillers = new Map<string, Map<string, string[]>>();
  for (const skinName of skinNames) {
    for (const [slotName, placeholders] of Object.entries(skinParts.get(skinName)!.attachments)) {
      const perSlot = fillers.get(slotName) ?? new Map<string, string[]>();
      for (const placeholder of Object.keys(placeholders)) {
        perSlot.set(placeholder, [...(perSlot.get(placeholder) ?? []), skinName]);
      }
      fillers.set(slotName, perSlot);
    }
  }
  for (const [slotName, perSlot] of fillers) {
    for (const [placeholder, skins] of perSlot) {
      if (skins.length > 1 && skins.includes(DEFAULT_SKIN)) refuseDefaultSkinContest(slotName, placeholder, skins);
    }
  }
}

// ---------------------------------------------------------------------------
// rig-declared attachments
// ---------------------------------------------------------------------------

interface AttachmentContext {
  images: CompiledImage[];
  bones: ModelBone[];
  transforms: Map<string, BoneTransform>;
  /** The same bones in `computeExactFrameTransforms`' frames: what a depth turn ceiling is measured in, and nothing else (issue #1021). */
  exactFrames: Map<string, BoneTransform>;
  meshBones: Set<string>;
  meshes: CompileResult['meshes'];
  slotName: string;
  anchorBone: string;
  /** Which skin this attachment is being built for — half of a `depths` key. */
  skinName: string;
  /**
   * Where a file the spec names is resolved from. A depth map is read from here
   * and never packed, so it is the one input path that does not go through
   * `images`.
   */
  imagesDir: string;
  /**
   * Per-vertex `z` for the attachments that named a depth map, keyed by
   * `skin/slot/attachment`.
   *
   * ⭐ It rides beside the emitted attachment rather than on it. A `z` written
   * into the mesh would be a field the Spine format has no room for — the
   * parser drops what it does not know, so it would survive exactly until the
   * round trip and then vanish — and the whole point of this table is to be
   * read by `evaluateDeformTransform` at key time and never emitted at all.
   */
  depths: Map<string, number[]>;
  /**
   * A `soft` mask's file and its sampled level per vertex, keyed like `depths`
   * — what a deform envelope's `mask` reads at key time (issue #1413). Never
   * emitted, for `depths`' reason.
   */
  softMasks: Map<string, DeformSoftMask>;
  /** Every slot the rig declares — a clipping attachment's `end` resolves here. */
  slotNames: Set<string>;
  /**
   * The `--atlas-in` pack's regions by trimmed name, first match — the map
   * `resolveFromAtlas` reads — or `null` on the loose route, where the regions
   * are `images`. A region record's rectangle is looked up here (`regionAtlasRect`).
   */
  atlasRegions: ReadonlyMap<string, { region: AtlasRegion }> | null;
  /**
   * Linked meshes whose `source` is still unresolved — `resolveLinkedMeshes`
   * empties it once every skin has been built.
   *
   * ⭐ Deferred because the format resolves a link only once every skin is
   * read — the reader queues each one (`this.linkedMeshes`, `SkeletonJson.js:56`
   * filled at `:581`) and resolves the queue after the skins (`:427-449`) — so
   * a link may name a source in a skin or a slot this loop has not reached yet,
   * and resolving it in place would refuse a correct rig on nothing but
   * declaration order.
   */
  links: PendingLink[];
}

/** One linked mesh, with everything a refusal has to name once the skins exist. */
interface PendingLink {
  where: string;
  /** What it asked for, the parser's defaults already applied. */
  skin: string;
  slot: string;
  source: string;
  /**
   * Whether the author wrote `skin`/`slot` or is taking the parser's default —
   * which is the half of the refusal that says where a name came from, and the
   * one an author who wrote neither key needs most.
   */
  skinStated: boolean;
  slotStated: boolean;
}

/**
 * The seven `type` values `readAttachment` has a branch for (`:540-651`), and
 * the six rigc emits.
 *
 * ⚠️ The lists are separate because the refusals are separate. A `point` is a
 * name the format HAS and rigc has not built; `sequence` is not a type at all —
 * it is a key on a region or a mesh (SPEC_COVERAGE part 1-6) — and telling an
 * author that it "is in the Spine 4.3 format and rigc does not emit it yet"
 * promises work that will never be done, on a spelling that is simply wrong.
 * One message said exactly that about every string it did not recognise.
 */
const SPINE_ATTACHMENT_TYPES = ['region', 'mesh', 'linkedmesh', 'boundingbox', 'path', 'point', 'clipping'] as const;
const EMITTED_ATTACHMENT_TYPES = ['region', 'mesh', 'linkedmesh', 'boundingbox', 'clipping', 'path'] as const;

/**
 * What each deferred type is and what it would carry — `docs/SPEC_COVERAGE.md`
 * part 1-6's row, restated where the refusal can print it.
 *
 * ⭐ The construct, not just its name. "attachment type X is in the Spine 4.3
 * format and rigc does not emit it yet" tells an author who already knows what a
 * point is that rigc will not do it, and tells an author who does not know
 * nothing at all — and the second is the reader this repository writes for.
 *
 * ⚠️ `linkedmesh` was the other entry until issue #691 emitted it. The sentence
 * below no longer says *"neither a point nor a linked mesh appears anywhere in
 * the benchmark corpus"*, because half of that is now a statement about a type
 * rigc writes, and a refusal that argues from a construct it has since built is
 * a refusal nobody can act on.
 */
const DEFERRED_ATTACHMENTS: Record<string, string> = {
  point:
    'a position and an angle with no geometry at all — "x", "y", "rotation" and "color", posed by its bone and ' +
    'drawn by nothing; what reads it is game code asking where a muzzle or a hand is',
};

/**
 * Build one attachment a rig spec authored, as opposed to one a manifest part
 * produced.
 *
 * The types this refuses are refused BY NAME. The parser's own behaviour on an
 * attachment type it does not know is to return null and drop it
 * (`SkeletonJson.ts:653`), so passing an unimplemented type through would produce
 * a skeleton missing an attachment nobody was told about.
 *
 * 🚨 **`?? 'region'` is not the parser's default, and that gap was the one real
 * fall-through here** (issue #577). `getValue(map, "type", "region")` returns the
 * default only when the key is **missing** (`SkeletonJson.ts:527`, `getValue` at
 * `:1390`), so `"type": null` is a type the parser HAS and matches no case: the
 * switch falls off the end, `readAttachment` returns null, and the attachment
 * disappears. `att.type ?? 'region'` read that same map as a region and compiled
 * one, which is the compiler inventing a value the spec did not state. Measured
 * before the repair: `{"type": null, "image": "marker.png"}` compiled and gated
 * green; `{"type": null}` was refused as *a region needs width and height*, which
 * is the message the card for this issue quoted and the reason it read as a
 * `linkedmesh` fault. `"type": "linkedmesh"` itself was always refused by name.
 */
function buildRigAttachment(
  att: RigAttachment,
  placeholder: string,
  where: string,
  ctx: AttachmentContext,
): SkinTableEntry {
  const stated = (att as { type?: unknown }).type;
  if (stated !== undefined && typeof stated !== 'string') {
    throw new CompileError(
      `${where}: "type" is ${JSON.stringify(stated) ?? String(stated)}, which is not a name. An attachment's type ` +
        `is one of ${SPINE_ATTACHMENT_TYPES.join(', ')}, or the key is absent and reads as "region". ` +
        'PRESENT-and-null is not absent: `getValue(map, "type", "region")` takes the default only when the key is ' +
        'missing (`SkeletonJson.ts:527`), so this map matches no case, `readAttachment` returns null (`:653`), and ' +
        'the attachment is dropped from the skeleton without a word. Remove the key, or name a type.', 'CE_COMPILE_ATTACHMENT_TYPE_NOT_NAME',
    );
  }
  const type = stated ?? 'region';
  // `name` is the runtime's `Attachment.name` and, on a type that draws, what
  // `path` defaults to — so it is written verbatim and has to be a string the
  // parser can hold as one (issue #796). An empty string is a string: it names
  // the attachment "" and, with no `path`, asks the atlas for region "", which
  // `A08` names by region like any other miss.
  const statedName = (att as { name?: unknown }).name;
  if (statedName !== undefined && typeof statedName !== 'string') {
    throw new CompileError(
      `${where}: "name" is ${JSON.stringify(statedName) ?? String(statedName)}, which is not a string. An ` +
        "attachment's name is the runtime's `Attachment.name` — `getValue(map, \"name\", placeholder)`, " +
        '`SkeletonJson.js:526` — and on a region, mesh or linked mesh it is also what `path` defaults to. Write it ' +
        'as a string, or leave the key out and the attachment is named by its placeholder.', 'CE_COMPILE_ATTACHMENT_NAME_NOT_STRING',
    );
  }
  // A linked mesh in the format's OTHER spelling. `type: "mesh"` and `type:
  // "linkedmesh"` share one branch and the `source` key is what decides between
  // them (`:568-569`, `:582`; SPEC_COVERAGE part 1-6) — so a mesh carrying
  // `source` is a linked mesh whatever its `type` says, and refusing it as "two
  // keys this compiler does not read: source, skin" sent the author to delete
  // the one key that made it linked. Both spellings reach one builder for the
  // same reason they reach one parser branch.
  if (type === 'linkedmesh' || (type === 'mesh' && (att as { source?: unknown }).source !== undefined)) {
    return buildRigLinkedMesh(att as RigLinkedMeshAttachment, placeholder, where, ctx);
  }
  if (type === 'region') return buildRigRegion(att as RigRegionAttachment, placeholder, where, ctx);
  if (type === 'mesh') return buildRigMesh(att as RigMeshAttachment, placeholder, where, ctx);
  if (type === 'boundingbox') return buildRigBoundingBox(att as RigBoundingBoxAttachment, where, ctx);
  if (type === 'clipping') return buildRigClipping(att as RigClippingAttachment, where, ctx);
  if (type === 'path') return buildRigPath(att as RigPathAttachment, where, ctx);
  if (DEFERRED_ATTACHMENTS[type] !== undefined) throw new NotImplementedError(deferredAttachmentRefusal(type, where, ''), 'CE_COMPILE_ATTACHMENT_TYPE_DEFERRED');
  const near = nearMisses(type, SPINE_ATTACHMENT_TYPES);
  throw new CompileError(
    `${where}: attachment type "${type}" is not one of the ${SPINE_ATTACHMENT_TYPES.length} the Spine 4.3 format ` +
      `defines (${SPINE_ATTACHMENT_TYPES.join(', ')}). ` +
      (near.length ? `Did you mean ${near.map((n) => JSON.stringify(n)).join(' or ')}? ` : '') +
      'The parser matches no case for it, `readAttachment` returns null (`SkeletonJson.ts:653`), and the ' +
      'attachment is dropped from the skeleton without a word.' +
      // The one near-miss worth naming outright, because it is a real word in
      // this format standing one level up from where it was written.
      (type === 'sequence'
        ? ' "sequence" is a KEY on a region or a mesh rather than a type of its own (docs/SPEC_COVERAGE.md part 1-6).'
        : ''), 'CE_COMPILE_ATTACHMENT_TYPE_UNKNOWN',
  );
}

/** The refusal for a type the format has and rigc has not built. */
function deferredAttachmentRefusal(type: string, where: string, how: string): string {
  return (
    `${where}: this attachment is a "${type}"${how} — ${DEFERRED_ATTACHMENTS[type]}. ` +
    `rigc does not emit it yet, deliberately: it emits ${EMITTED_ATTACHMENT_TYPES.join(', ')}, and a point ` +
    'appears nowhere in the benchmark corpus, so it is not on the ' +
    "ladder's critical path. docs/SPEC_COVERAGE.md part 1-6 is the row this sentence reads " +
    'from, and it is what an implementation would have to carry.'
  );
}

/**
 * The polygon a bounding box, a clipping attachment or a path carries, as the
 * model's `ModelVertices`.
 *
 * 🚨 `vertexCount` is required, and everything else here is a cross-check of it.
 * The parser reads `map.vertexCount << 1` and hands that to `readVertices` as the
 * length to expect (`:552`, `:632`) — so with the field absent it expects 0,
 * takes the weighted branch, decodes the coordinate list as
 * `boneCount, (index, x, y, weight) × n`, and returns an attachment holding
 * whatever that garbage produced. It loads. It draws nothing (a bounding box
 * never did) and clips nothing, or clips the wrong shape, in complete silence.
 *
 * The two encodings are the mesh's — `bindNamedWeights` is the same function —
 * because they are the same field with the same trap: `readVertices` decides
 * weighted vs unweighted by a length comparison alone, and a coincidental match
 * reads weight data as coordinates. The model says which one it is outright.
 */
function buildVertexGeometry(att: RigVertexGeometry, where: string, ctx: AttachmentContext): ModelVertices {
  const count = att.vertexCount;
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 3) {
    throw new CompileError(
      `${where}: vertexCount is ${JSON.stringify(count)}; a polygon needs at least 3 vertices, stated outright — ` +
        'the field has no parser default, and an absent one reads as 0 and takes the polygon with it', 'CE_COMPILE_POLYGON_VERTEX_COUNT_INVALID',
    );
  }
  if (att.vertices && att.weights) {
    throw new CompileError(
      `${where}: geometry comes as "vertices" or as "weights", never both — "weights" is the by-name form of the same data`, 'CE_COMPILE_VERTEX_GEOMETRY_SOURCES_CONFLICT',
    );
  }
  if (att.weights) {
    if (att.boneIndexing === 'raw') {
      throw new CompileError(`${where}: "boneIndexing": "raw" describes a "vertices" run; "weights" always binds by name`, 'CE_COMPILE_NAMED_WEIGHTS_RAW_INDEXING');
    }
    if (att.weights.length !== count) {
      throw new CompileError(`${where}: weights cover ${att.weights.length} vertices but vertexCount is ${count}`, 'CE_COMPILE_POLYGON_WEIGHT_VERTEX_COUNT');
    }
    return { weighted: true, bindings: bindNamedWeights(att.weights, where, ctx) };
  }
  const raw = att.vertices;
  if (!raw || raw.length === 0) {
    throw new CompileError(`${where}: needs geometry — "vertices" (x, y per vertex) or "weights" (bound by name)`, 'CE_COMPILE_POLYGON_GEOMETRY_MISSING');
  }
  const unweighted = raw.length === count * 2;
  if (!unweighted) {
    if (att.boneIndexing !== 'raw') {
      throw new CompileError(
        `${where}: vertexCount ${count} wants ${count * 2} unweighted numbers and "vertices" holds ${raw.length}. ` +
          'The parser reads that as a WEIGHTED run, whose bone INDEXES point into the emitted bone array — a list ' +
          'the spec never writes, so inserting a bone rebinds every vertex in silence. ' +
          'Give the bindings by name as "weights": [[{ "bone": …, "x": …, "y": …, "weight": … }, …], …], ' +
          'fix vertexCount, or say "boneIndexing": "raw" on this attachment to keep the index form deliberately.', 'CE_COMPILE_POLYGON_WEIGHTED_RUN_IMPLICIT',
      );
    }
    // A raw run still has to decode to exactly `vertexCount` vertices, or the
    // count and the polygon disagree and the parser believes the count.
    checkRawRunShape(raw, count, `vertexCount is ${count}`, where);
  }
  for (const n of raw) {
    if (!Number.isFinite(n)) throw new CompileError(`${where}: the vertex array holds a non-finite value ${String(n)}`, 'CE_COMPILE_VERTEX_VALUE_NONFINITE');
  }
  if (unweighted) return { weighted: false, xy: raw.map(f32) };
  const bindings = bindRawRun(raw.map(f32), ctx.bones, where);
  // Register the bones it binds so the mesh-bone reports stay complete.
  for (const vertex of bindings) for (const binding of vertex) ctx.meshBones.add(binding.bone);
  return { weighted: true, bindings };
}

/**
 * Refuse a raw weighted run whose shape is not `vertices` vertices of
 * `boneCount, (boneIndex, x, y, weight) × boneCount` each. `countSays` is the
 * clause naming where the expected count came from.
 */
function checkRawRunShape(raw: readonly number[], vertices: number, countSays: string, where: string): void {
  let decoded = 0;
  for (let i = 0; i < raw.length; decoded++) {
    const bones = raw[i++];
    if (!Number.isInteger(bones) || bones < 1) {
      throw new CompileError(`${where}: the raw weighted run has a bone count of ${String(bones)} at index ${i - 1}`, 'CE_COMPILE_RAW_WEIGHT_BONE_COUNT_INVALID');
    }
    i += bones * 4;
    if (i > raw.length) {
      throw new CompileError(
        `${where}: the raw weighted run is truncated — vertex ${decoded} claims ${bones} bone(s) and the array ends first`, 'CE_COMPILE_RAW_WEIGHT_RUN_TRUNCATED',
      );
    }
  }
  if (decoded !== vertices) {
    throw new CompileError(`${where}: the raw weighted run decodes to ${decoded} vertices but ${countSays}`, 'CE_COMPILE_RAW_WEIGHT_VERTEX_COUNT_MISMATCH');
  }
}

/**
 * Decode an authored raw run (`"boneIndexing": "raw"`) to bindings by name, ONCE,
 * at intake, against the model's bone order — the order the emitter writes the
 * indexes back in, so the emitted run is the run the spec stated.
 *
 * The shape is already checked (`checkRawRunShape`). An index that names no bone
 * — past the end of the list, negative, fractional — is refused here with the
 * sentence the path-length measurement used to raise for it; before issue #917
 * every other reader of the run skipped it at compile time and left it to the
 * gate (`A20` on a mesh, `A33` on the other three).
 */
function bindRawRun(run: readonly number[], bones: readonly ModelBone[], where: string): ModelBinding[][] {
  const out: ModelBinding[][] = [];
  for (let i = 0; i < run.length; ) {
    const count = run[i++];
    const vertex: ModelBinding[] = [];
    for (let k = 0; k < count; k++, i += 4) {
      const bone = bones[run[i]];
      if (bone === undefined) {
        throw new CompileError(`${where}: vertex ${out.length} binds bone index ${run[i]}, which is not in the bone list`, 'CE_COMPILE_RAW_WEIGHT_BONE_INDEX_UNKNOWN');
      }
      vertex.push({ bone: bone.name, x: run[i + 1], y: run[i + 2], weight: run[i + 3] });
    }
    out.push(vertex);
  }
  return out;
}

/**
 * Whether one bone order fits every vertex of a weighted attachment: no vertex
 * lists a bone twice, and no two vertices — directly or through a chain of
 * others — list two bones in opposite orders. Read off the bindings by name;
 * `A52_WEIGHTED_VERTICES_SHARE_ONE_BONE_ORDER` re-derives the same question
 * from the emitted indices, on purpose with its own code.
 */
function bindingsShareOneBoneOrder(bindings: readonly ModelBinding[][]): boolean {
  const after = new Map<string, Set<string>>();
  for (const vertex of bindings) {
    if (new Set(vertex.map((b) => b.bone)).size !== vertex.length) return false;
    for (let i = 1; i < vertex.length; i++) {
      const from = vertex[i - 1].bone;
      if (!after.has(from)) after.set(from, new Set());
      after.get(from)!.add(vertex[i].bone);
    }
  }
  const state = new Map<string, 'open' | 'done'>();
  const acyclicFrom = (bone: string): boolean => {
    state.set(bone, 'open');
    for (const next of after.get(bone) ?? []) {
      const seen = state.get(next);
      if (seen === 'open') return false;
      if (seen === undefined && !acyclicFrom(next)) return false;
    }
    state.set(bone, 'done');
    return true;
  };
  for (const bone of after.keys()) if (!state.has(bone) && !acyclicFrom(bone)) return false;
  return true;
}

/**
 * Write every weighted attachment whose vertices admit no single bone order
 * with each vertex's influences in ascending bone order (issue #1407) — the
 * one rewrite of a spec's binding order the compiler makes, and the reason it
 * makes it.
 *
 * ⭐ **What the Spine editor refuses is a cycle, not a descending pair.**
 * Measured with Spine 4.3.26 Professional through `tools/editor_roundtrip.ts`:
 * an attachment where one vertex lists bones `a, b` and another `b, a` — or
 * three vertices `a, b` · `b, c` · `c, a`, or one vertex `a, a` — is refused
 * on import (`Error reading attachment: <name>` · `Index -2 out of bounds`),
 * on a mesh, a bounding box, a clipping polygon and a path alike; the same
 * rig with every vertex in DESCENDING order imports, exports and checks, and
 * four of the twelve editor exports in this tree's example corpus list bones
 * out of ascending order, every one of them in a single order per attachment.
 * So an attachment that already has one order keeps the spec's, and its bytes
 * do not move; one that has none takes ascending order, which every vertex
 * shares by construction.
 *
 * 🔒 **On the model, not in the emitter.** The document, rigc's poser and the
 * Spine file must read one order: a weighted vertex is `Σ wᵢ·Mᵢ·bindᵢ`, and
 * summed in two orders its last bits differ — sorting in the emitter alone
 * was measured to put the two posers 1–2 ulp apart on a parts-built rig.
 *
 * 🔸 A deform key on such an attachment is one `x, y` per INFLUENCE, in the
 * influences' order, so each key's run is moved with them: spread over the
 * deform array, permuted pair by pair, and cut back to the first and last
 * index it covers, an index it does not cover written as the 0 the runtime
 * reads there. The report of a generated run (`expanded`) is moved the same
 * way, so it still carries what was emitted.
 */
function oneBoneOrderPerAttachment(
  bones: readonly ModelBone[],
  skins: readonly ModelSkin[],
  animations: ReadonlyMap<string, CompiledAnimation>,
  deformTransforms: CompileResult['deformTransforms'],
): void {
  const position = new Map(bones.map((bone, i) => [bone.name, i] as const));
  /** Per reordered attachment record: where each influence went, old influence index -> new. */
  const moved = new Map<ModelVertexAttachment, number[]>();
  for (const skin of skins) {
    for (const perSlot of Object.values(skin.attachments)) {
      for (const record of Object.values(perSlot)) {
        if (!isModelVertexAttachment(record) || !record.vertices.weighted || moved.has(record)) continue;
        if (bindingsShareOneBoneOrder(record.vertices.bindings)) continue;
        const to: number[] = [];
        let at = 0;
        const bindings = record.vertices.bindings.map((vertex) => {
          const order = vertex.map((_, i) => i).sort((p, q) => position.get(vertex[p].bone)! - position.get(vertex[q].bone)! || p - q);
          const rank = new Array<number>(vertex.length);
          order.forEach((from, k) => (rank[from] = k));
          for (let i = 0; i < vertex.length; i++) to.push(at + rank[i]);
          at += vertex.length;
          return order.map((i) => vertex[i]);
        });
        record.vertices = { weighted: true, bindings };
        moved.set(record, to);
      }
    }
  }
  if (moved.size === 0) return;
  /** A run moved with its influences: `start` and `run` over a deform array of `to.length` pairs. */
  const movedRun = (start: number, run: readonly number[], to: readonly number[]): { start: number; run: number[] } => {
    const spread = new Map<number, number>();
    run.forEach((value, i) => {
      const index = start + i;
      spread.set(to[index >> 1] * 2 + (index & 1), value);
    });
    const indices = [...spread.keys()];
    const first = Math.min(...indices);
    const last = Math.max(...indices);
    const out: number[] = [];
    for (let i = first; i <= last; i++) out.push(spread.get(i) ?? 0);
    return { start: first, run: out };
  };
  const recordOf = (skin: string, slot: string, placeholder: string): ModelVertexAttachment | undefined => {
    const record = skins.find((s) => s.name === skin)?.attachments[slot]?.[placeholder];
    return record !== undefined && isModelVertexAttachment(record) && moved.has(record) ? record : undefined;
  };
  for (const animation of animations.values()) {
    for (const [skin, bySlot] of animation.attachments) {
      for (const [slot, byPlaceholder] of bySlot) {
        for (const [placeholder, timelines] of byPlaceholder) {
          const record = recordOf(skin, slot, placeholder);
          if (record === undefined || timelines.deform === undefined) continue;
          const to = moved.get(record)!;
          timelines.deform = timelines.deform.map((key) => {
            if (!Array.isArray(key.vertices) || key.vertices.length === 0) return key;
            const { start, run } = movedRun(typeof key.offset === 'number' ? key.offset : 0, key.vertices as number[], to);
            // The key's fields in the order `compileDeformTrack` inserts them: `time`, `offset`, `vertices`, then the curve.
            const rest = Object.fromEntries(Object.entries(key).filter(([field]) => field !== 'time' && field !== 'offset' && field !== 'vertices'));
            return { time: key.time, ...(start !== 0 ? { offset: start } : {}), vertices: run, ...rest };
          });
        }
      }
    }
  }
  for (const report of deformTransforms) {
    const record = recordOf(report.skin, report.slot, report.attachment);
    if (record === undefined || report.expanded === undefined) continue;
    report.expanded = movedRun(0, report.expanded, moved.get(record)!).run;
  }
}

/** Every number of a weighted binding list on the float32 grid — what `.map(f32)` did to the run. */
function bindingsOnF32(vertices: Extract<ModelVertices, { weighted: true }>): Extract<ModelVertices, { weighted: true }> {
  return {
    weighted: true,
    bindings: vertices.bindings.map((vertex) => vertex.map((b) => ({ bone: b.bone, x: f32(b.x), y: f32(b.y), weight: f32(b.weight) }))),
  };
}

/**
 * The stage box a rig asked for (`skeleton.stageBox`, issue #1168), resolved:
 * its slot and attachment name, and the bounding box `compile` files under
 * them — or `null` for a rig that did not ask.
 *
 * ⭐ **Its numbers are the stage's and nobody else's.** The four vertices are
 * the stage's corners in Spine world — `(x, y)`, `(x + w, y)`, `(x + w, y + h)`,
 * `(x, y + h)`, the bottom-left first and counter-clockwise — the same four
 * fields `ModelStage` holds and the coordinate transform reads, each written on
 * the float32 grid every other emitted vertex is on. Nothing in the rig spec
 * states them, so nothing can disagree with the stage.
 *
 * 🔒 **The box hangs on the root, and the root states no setup transform —
 * or the box is refused.** Two readings were weighed. Computing local vertices
 * through the inverse of any bone's setup transform would admit every bone,
 * and the posed box would land on the stage only to within the float32
 * rounding of those local numbers, a tolerance of the gate's own. Requiring an
 * unmoved root makes the stored vertices the stage's numbers exactly —
 * readable straight off the attachment by a consumer that poses nothing — and
 * the posed box is those numbers through the runtime's frame of an unrotated
 * root, whose `b` is cos 90° at the runtime's pi (−2.3e-8, measured: the
 * compiler's own world transform of `gallery/nod`'s root, and the `-0.000016`
 * of that build's header `x`), which `A50_STAGE_BOX_IS_THE_STAGE` holds on the
 * header's grid with no new tolerance. A bone below the root is refused even
 * when it states nothing, because that residue is taken once per level. A
 * constraint that moves the root at setup is not seen here — the compiler
 * poses no constraint — and is A50's to name, through the runtime.
 *
 * Refused by name: a slot `slots` does not declare; a slot something else
 * fills (a skin entry, a manifest part); a slot on a bone below the root, or
 * on a root that states a setup transform; a rig with no stage, which `parseRigSpec` already refuses
 * for a stated absence and which cannot reach here otherwise.
 */
function resolveStageBox(
  rig: RigSpec,
  ctx: {
    stageWidth: number | undefined;
    stageHeight: number | undefined;
    bones: readonly ModelBone[];
    partBySlot: ReadonlyMap<string, unknown>;
    slotAttachments: ReadonlyMap<string, readonly string[]>;
    rigAttachmentNames: ReadonlyMap<string, readonly string[]>;
  },
): { slot: string; attachment: string; record: ModelBoundingBoxAttachment } | null {
  const asked = rig.skeleton?.stageBox;
  if (asked === undefined) return null;
  const field = `skeleton.stageBox (slot "${asked.slot}", attachment "${asked.attachment}")`;
  if (ctx.stageWidth === undefined || ctx.stageHeight === undefined) {
    throw new CompileError(`${field}: the rig declares no stage, so there is no box to write — state skeleton.width and skeleton.height`, 'CE_COMPILE_STAGE_BOX_STAGE_MISSING');
  }
  const rigSlot = rig.slots.find((s) => s.name === asked.slot);
  if (rigSlot === undefined) {
    throw new CompileError(
      `${field}: slot "${asked.slot}" is not one the rig declares. Declare it in "slots" — where it stands in the ` +
        `array is its place in the draw order, and its "bone" is the box's bone — e.g. { "name": "${asked.slot}", "bone": "root", "attachment": "${asked.attachment}" }`, 'CE_COMPILE_STAGE_BOX_SLOT_UNKNOWN',
    );
  }
  const filledBy = [
    ...(ctx.partBySlot.has(asked.slot) ? ['a cut manifest part'] : []),
    ...((ctx.slotAttachments.get(asked.slot) ?? ctx.rigAttachmentNames.get(asked.slot) ?? []).length > 0
      ? [`the attachment(s) [${(ctx.slotAttachments.get(asked.slot) ?? ctx.rigAttachmentNames.get(asked.slot) ?? []).join(', ')}]`]
      : []),
  ];
  if (filledBy.length > 0) {
    throw new CompileError(
      `${field}: slot "${asked.slot}" is also filled by ${filledBy.join(' and ')}. The stage box is its slot's one ` +
        'attachment, so a reader of that slot finds the stage and nothing else: give the box a slot of its own', 'CE_COMPILE_STAGE_BOX_SLOT_CONFLICT',
    );
  }
  // The box's bone: the root, stating no setup transform — as built, so a root placed `from` the manifest is read as placed.
  const bone = ctx.bones.find((b) => b.name === rigSlot.bone);
  if (bone === undefined) {
    throw new CompileError(`${field}: slot "${asked.slot}" names bone "${rigSlot.bone}", which the rig does not declare`, 'CE_COMPILE_STAGE_BOX_BONE_UNKNOWN');
  }
  if (bone.parent !== undefined) {
    throw new CompileError(
      `${field}: slot "${asked.slot}" hangs on bone "${rigSlot.bone}", which is not the root. The box's vertices are ` +
        "the stage's corners in world space, written as they are, and the gate holds them on the header's grid " +
        "through the runtime's own frame of an unrotated root; every bone below it adds that frame's residue once " +
        "more (the runtime spells an unrotated b as cos 90° at its pi, -2.3e-8 per level). Put the slot on the root " +
        `("${ctx.bones[0]?.name ?? 'root'}")`, 'CE_COMPILE_STAGE_BOX_BONE_NOT_ROOT',
    );
  }
  const stated = [
    ...(['x', 'y', 'rotation', 'shearX', 'shearY'] as const).filter((key) => (bone[key] ?? 0) !== 0).map((key) => `${key} ${bone[key]}`),
    ...(['scaleX', 'scaleY'] as const).filter((key) => (bone[key] ?? 1) !== 1).map((key) => `${key} ${bone[key]}`),
  ];
  if (stated.length > 0) {
    throw new CompileError(
      `${field}: slot "${asked.slot}" hangs on the root "${bone.name}", which states a setup transform (${stated.join(', ')}). ` +
        "The box's vertices are the stage's corners in world space, written as they are, so the root must not move, " +
        'turn, scale or shear at setup — move what the root carries onto a bone below it, or drop stageBox', 'CE_COMPILE_STAGE_BOX_ROOT_TRANSFORMED',
    );
  }
  const x = rig.skeleton?.x ?? 0;
  const y = rig.skeleton?.y ?? 0;
  const right = x + ctx.stageWidth;
  const top = y + ctx.stageHeight;
  const record: ModelBoundingBoxAttachment = {
    kind: 'boundingbox',
    vertexCount: 4,
    vertices: { weighted: false, xy: [x, y, right, y, right, top, x, top].map(f32) },
  };
  return { slot: asked.slot, attachment: asked.attachment, record };
}

function buildRigBoundingBox(
  att: RigBoundingBoxAttachment,
  where: string,
  ctx: AttachmentContext,
): ModelBoundingBoxAttachment {
  const out: ModelBoundingBoxAttachment = {
    kind: 'boundingbox',
    vertexCount: att.vertexCount,
    vertices: buildVertexGeometry(att, where, ctx),
  };
  if (att.color !== undefined) out.editorColor = att.color;
  return out;
}

function buildRigClipping(
  att: RigClippingAttachment,
  where: string,
  ctx: AttachmentContext,
): ModelClippingAttachment {
  if (att.end !== undefined) {
    // `skeletonData.findSlot` returns null on a miss and the parser assigns that
    // null (`:626-627`), so a typo does not fail — the clip simply never ends and
    // takes every slot below it out of the frame.
    if (typeof att.end !== 'string' || !ctx.slotNames.has(att.end)) {
      throw new CompileError(
        `${where}: end names slot ${JSON.stringify(att.end)}, which this rig does not declare; ` +
          'a miss loads as null and the clip then runs to the bottom of the draw order', 'CE_COMPILE_CLIPPING_END_SLOT_UNKNOWN',
      );
    }
  }
  // Field order is the emitter's (`emitClipping`); a present key here is one the
  // spec declared.
  const out: ModelClippingAttachment = {
    kind: 'clipping',
    ...(att.end !== undefined ? { end: att.end } : {}),
    ...(att.convex !== undefined ? { convex: att.convex } : {}),
    ...(att.inverse !== undefined ? { inverse: att.inverse } : {}),
    vertexCount: att.vertexCount,
    vertices: buildVertexGeometry(att, where, ctx),
  };
  if (att.color !== undefined) out.editorColor = att.color;
  return out;
}

/**
 * Setup-pose world position of every vertex of a model vertex attachment.
 *
 * The two encodings again, and the same split `readVertices` makes: an unweighted
 * attachment is one `x, y` in the SLOT BONE's space; a weighted one binds each
 * vertex to its bones by name, and the vertex is the weighted sum of each
 * influence's bind point taken to world through its own bone. This is
 * `VertexAttachment.computeWorldVertices` at setup, restated in the compiler
 * because the compiler must not link the runtime.
 */
function setupWorldVertices(
  vertices: ModelVertices,
  anchor: BoneTransform,
  transforms: Map<string, BoneTransform>,
  where: string,
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  if (!vertices.weighted) {
    for (let i = 0; i < vertices.xy.length; i += 2) out.push(toWorld(anchor, vertices.xy[i], vertices.xy[i + 1]));
    return out;
  }
  for (const vertex of vertices.bindings) {
    let x = 0;
    let y = 0;
    for (const binding of vertex) {
      const m = transforms.get(binding.bone);
      if (!m) throw new CompileError(`${where}: vertex ${out.length} binds bone "${binding.bone}", which has no setup transform`, 'CE_COMPILE_VERTEX_BIND_TRANSFORM_MISSING');
      const [wx, wy] = toWorld(m, binding.x, binding.y);
      x += wx * binding.weight;
      y += wy * binding.weight;
    }
    out.push([x, y]);
  }
  return out;
}

/**
 * The knot-and-handle chain a path attachment's vertices actually form, in the
 * runtime's own order (`PathConstraint.computeWorldPositions`).
 *
 * ⭐ This is the part of the format a reader guesses wrong. The vertices are NOT
 * `3K + 1` Bezier points: the parser hands them to `readVertices` untouched, and
 * the constraint then **drops the first and last** on an open path (it computes
 * world vertices from offset 2 for `verticesLength - 4` numbers) because those
 * two are the outer control handles of the end knots, which no curve uses. A
 * closed path instead rotates by one and repeats the first knot at the end.
 * Either way what comes out is a `3K + 1` chain: knot, handle, handle, knot, …
 *
 * ⭐ **`lengths` is measured over the CLOSED chain whether the path is closed or
 * not** (issue #804), because that is the array the format holds: the parser
 * sizes it `vertexCount / 3` on both (`SkeletonJson.js:601`), which on an open
 * path is one more than its curves, and the editor fills that last entry with
 * the wrap-around curve's cumulative — measured on a 4.3 production export, all
 * four of whose entries the closed chain over the runtime's own posed vertices
 * reproduces to the digit it prints. The open chain is the closed chain's
 * prefix, so the entries the runtime reads are the same numbers either way; the
 * trailing one is read by nothing, and is written so a rebuild is the file the
 * editor writes rather than one entry short of it.
 *
 * Exported, with `pathCurveLengths`, for the selftest alone: `MV07` measures a
 * decode of the emitted run through the two and compares.
 */
export function pathChain(points: Array<[number, number]>, closed: boolean): Array<[number, number]> {
  if (!closed) return points.slice(1, points.length - 1);
  return [...points.slice(1), points[0], points[1]];
}

/**
 * Cumulative length at the end of each curve of the chain, in world units —
 * **the core's curve table** (`curveLengthTable` in
 * [`src/core/constraints_path.ts`](core/constraints_path.ts), issue #1015), the
 * one the core's path constraint walks at constant speed. This function only
 * flattens the chain and counts its curves.
 *
 * One entry per curve, which is what `lengths[curve]` indexes: the parser walks
 * curves with `if (p > lengths[curve]) continue`, and reads `lengths[curveCount]`
 * — where `curveCount` is the LAST curve's index — as the total path length.
 *
 * ⭐ **What this is not: an approximation of the arc length.** `lengths` is not a
 * fact about the Bezier, it is the number the consumer of the field computes for
 * itself when it is not given one. `PathConstraint.computeWorldPositions`
 * (`PathConstraint.js:289-324` in `@esotericsoftware/spine-core` 4.3.13) measures
 * a `constantSpeed` path for itself, and the Spine editor's exported `lengths`
 * are the same number. What that number is was measured, not read: the core's
 * table — four forward-difference steps per curve at `t = 1/4` (`0.1875`,
 * `0.09375`, `0.75`, `0.16666667`), four `Math.sqrt` terms accumulated into a
 * running total carried across curves — is the rule its header states with the
 * readings that missed beside it, and `PS67`, `PS68` and `PS186` in
 * `selftest.ts` hold this function to `PathConstraint`'s own `curves` array read
 * off a posed skeleton, **bit for bit**. Since issue #1015 the core suite also
 * holds the swap: 100,000 seeded chains through this function and through the
 * arithmetic it replaced, 0 differing.
 *
 * 🚨 **What that computation is fed decides the number, and this comment once
 * claimed more than was measured** (issue #804). It said the loop matched the
 * editor to every digit it printed — true on the two exports it was measured on,
 * one open and one closed path on unweighted, unscaled, unconstrained rigs, and
 * false in production on two counts:
 *
 *   - **Geometry.** The editor measures the world positions of the posed
 *     vertices. rigc blends weighted vertices through its own setup transforms,
 *     which until #804 ignored bone scale, shear and `inherit` — 2.35× the
 *     runtime's own `curves` on a production rig's weighted path, 0.752× on a
 *     50/50 probe over a bone at scale 2. `computeWorldTransforms` honours all
 *     three now, and the gap is gone on both.
 *   - **Constraints.** The runtime measures the pose its update order hands the
 *     path constraint at the first `updateWorldTransform`: a transform
 *     constraint on the path's slot bone ordered BEFORE the path constraint
 *     moves the curves (416.14 → 551.59 on a probe), one ordered after does
 *     not. A production 4.2 export's four numbers are the constrained pose's to
 *     the digit, and its unconstrained setup measures 76.08 against 76.65 on the
 *     first curve. Reproducing that means solving every constraint type in
 *     update order, which is posing — and `src/compile.ts` does not pose. ⇒
 *     **An omitted `lengths` is measured on the unconstrained setup pose**, and
 *     a path whose bones a constraint moves at rest gets that figure. What
 *     closes the gap for an editor export is not measuring at all: a stated
 *     `lengths` is carried (`buildRigPath`).
 *
 * ⚠️ rigc measured this with a 64-chord sum until issue #560, and the comment
 * that stood here argued the difference was inside anything's tolerance. It was
 * not: 0.70 % high, uniformly, worth **4.96 px mean MAE** on the round trip of a
 * rig whose path constraint reads the field. A 4-chord sum is *also* not the
 * repair — it agrees with the forward difference only to about nine significant
 * digits, which is below what float32 can hold, so no editor export can tell the
 * two apart and since issue #716 rigc's own file can only where the two land on
 * either side of a float's boundary. Under the six-decimal rounding that stood
 * until then it could: on both measured rigs the two spellings differed on the
 * LAST curve, where the accumulated difference is largest.
 *
 * 🔒 The spelling is load-bearing: `Math.sqrt(dx * dx + dy * dy)` rather than
 * `Math.hypot`, `0.16666667` rather than `1 / 6`, and the running total carried
 * across curves rather than restarted. Each of those is a place where a more
 * accurate line would emit a different file.
 */
export function pathCurveLengths(chain: Array<[number, number]>): number[] {
  const flat: number[] = [];
  for (const [x, y] of chain) flat.push(x, y);
  return curveLengthTable(flat, Math.max(0, Math.floor((chain.length - 1) / 3)));
}

/**
 * `type: "path"` — the curve a path constraint slides bones along.
 *
 * Three things happen here that the parser will not do:
 *
 *   1. **`vertexCount` is checked against the group-of-three structure.** A count
 *      that is not a multiple of 3 does not throw anywhere:
 *      `Utils.newArray(vertexCount / 3, 0)` takes a fractional size happily, the
 *      groups of six then straddle the knots, and bones slide along a curve
 *      nobody drew. Too few points is the same failure with fewer symptoms — an
 *      open path needs 6 for one curve, a closed one 3.
 *   2. **A stated `lengths` is carried as stated** (issue #804), and checked for
 *      the one shape the parser cannot hold: `vertexCount / 3` entries, each
 *      finite and none below the one before it. The file is the record of what
 *      was measured, and the number an editor export states is the editor's
 *      measurement of a pose rigc cannot reproduce without posing (see
 *      `pathCurveLengths`) — so re-deriving it moved a production rig's bones by
 *      up to 0.0054 in issue #804's pose comparison, where carrying it moved none.
 *   3. **An omitted one is measured**, `vertexCount / 3` entries over the closed
 *      chain (`pathChain`), on the unconstrained setup pose.
 */
function buildRigPath(att: RigPathAttachment, where: string, ctx: AttachmentContext): ModelPathAttachment {
  const vertices = buildVertexGeometry(att, where, ctx);
  const count = att.vertexCount;
  const closed = att.closed === true;
  if (count % 3 !== 0) {
    throw new CompileError(
      `${where}: vertexCount is ${count}, which is not a multiple of 3. A path's vertices are knots AND their ` +
        'Bezier handles, read in groups of three; the parser sizes its lengths array with `vertexCount / 3` and ' +
        'accepts a fractional size without a word, so the curves would straddle the knots.', 'CE_COMPILE_PATH_VERTEX_COUNT_MULTIPLE',
    );
  }
  const minimum = closed ? 3 : 6;
  if (count < minimum) {
    throw new CompileError(
      `${where}: vertexCount is ${count} and ${closed ? 'a closed' : 'an open'} path needs at least ${minimum} — ` +
        `${closed ? 'a closed path of K curves carries 3K points' : 'an open one carries 3(K + 1), the first and last being the end knots\' outer handles'}`, 'CE_COMPILE_PATH_VERTEX_COUNT_MINIMUM',
    );
  }
  const entries = count / 3;
  let lengths: number[];
  if (att.lengths !== undefined) {
    lengths = statedPathLengths(att.lengths, entries, closed, where);
  } else {
    const anchor = ctx.transforms.get(ctx.anchorBone);
    if (!anchor) throw new CompileError(`${where}: slot bone "${ctx.anchorBone}" has no setup transform`, 'CE_COMPILE_SLOT_SETUP_TRANSFORM_MISSING');
    const points = setupWorldVertices(vertices, anchor, ctx.transforms, where);
    lengths = pathCurveLengths(pathChain(points, true));
    // The total the runtime reads is the last CURVE's entry, `lengths[vertexCount
    // / 3 - (closed ? 1 : 2)]` (`PathConstraint.js:204-206`) — on an open path
    // the one before the trailing wrap-around entry, which nothing reads.
    const total = lengths[closed ? entries - 1 : entries - 2];
    if (lengths.length !== entries || !lengths.every((n) => Number.isFinite(n)) || !(total > 0)) {
      throw new CompileError(
        `${where}: the geometry measures ${lengths.length} entry(ies) where the parser sizes ${entries}, of total ` +
          `length ${String(total)}; a path of zero length divides by zero the first time a bone is placed on it`, 'CE_COMPILE_PATH_GEOMETRY_LENGTH_INVALID',
      );
    }
  }
  // Each optional key is present exactly when the spec declared it — the rule
  // the whole rig spec follows, so Spine's own defaults stand for the rest. The
  // field order (the parser's reading order, `:606-623`) is `emitPath`'s.
  return {
    kind: 'path',
    ...(att.closed !== undefined ? { closed: att.closed } : {}),
    ...(att.constantSpeed !== undefined ? { constantSpeed: att.constantSpeed } : {}),
    vertexCount: count,
    vertices,
    lengths: lengths.map(f32),
    ...(att.color !== undefined ? { editorColor: att.color } : {}),
  };
}

/**
 * A stated `lengths`, checked for the shape the parser needs and returned as
 * stated (issue #804).
 *
 * 🔒 **The count is the parser's, not the constraint's.** `SkeletonJson.js:601`
 * allocates `vertexCount / 3` entries on an open path and a closed one alike and
 * copies what the file gives: a SHORT array leaves zeros the constraint then
 * reads as a curve's end (a position divided by 0, in silence), and a LONG one
 * grows the array past what the attachment's own geometry has. Both are refused
 * with the two counts rather than trimmed or padded, because either repair is a
 * value the spec did not state.
 *
 * ⚠️ Equal neighbours are accepted here and refused by `A33` where the runtime
 * reads them — a zero-length curve is a fact about the pose, which the gate
 * measures; a DECREASING entry is not a cumulative length at all, on any pose.
 */
function statedPathLengths(stated: unknown, entries: number, closed: boolean, where: string): number[] {
  if (!Array.isArray(stated)) {
    throw new CompileError(`${where}: "lengths" is ${JSON.stringify(stated)}; it is an array of ${entries} number(s)`, 'CE_COMPILE_PATH_LENGTHS_NOT_ARRAY');
  }
  if (stated.length !== entries) {
    throw new CompileError(
      `${where}: "lengths" has ${stated.length} entry(ies) where the parser sizes ${entries} — vertexCount / 3 on ` +
        `${closed ? 'a closed' : 'an open'} path${closed ? '' : ', one more than its curves: the editor writes the wrap-around curve\'s cumulative last and nothing reads it'}. ` +
        'Give the array the source states, or leave the field out and rigc measures it', 'CE_COMPILE_PATH_LENGTHS_COUNT',
    );
  }
  let previous = 0;
  for (let i = 0; i < stated.length; i++) {
    const value: unknown = stated[i];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new CompileError(`${where}: "lengths"[${i}] is ${JSON.stringify(value)}; every entry is a finite cumulative length`, 'CE_COMPILE_PATH_LENGTH_NONFINITE');
    }
    if (value < previous) {
      throw new CompileError(
        `${where}: "lengths"[${i}] is ${value}, below ${i === 0 ? '0' : `the ${previous} before it`}. The array is CUMULATIVE — the length at ` +
          'the end of each curve — so no entry is below its predecessor', 'CE_COMPILE_PATH_LENGTHS_DESCENDING',
      );
    }
    previous = value;
  }
  return stated as number[];
}

/**
 * The compiled image an attachment's `image` names — or a refusal that names the
 * file and says what is actually wrong with it.
 *
 * 🚨 This exists because of what the four call sites used to do instead, which
 * was nothing (issue #555). `ctx.images.find(...)` returning `undefined` fell
 * through to the size branch, so an attachment that named a PNG rigc had not
 * atlased was refused with *a region needs width and height — give them, or give
 * an "image" and rigc will measure the PNG*: the remedy sentence handed to the
 * one author who had already done both halves of it. The two mesh generators
 * said `no compiled image for "x.png"`, which names the file and not the fault.
 *
 * ⭐ What the message may not do is guess at the spec. Every image a skin
 * attachment names is measured and atlased, one per file, so an attachment
 * standing in front of a region that does not exist is rigc having skipped a
 * measurement — the author cannot repair it by writing anything. Saying so is
 * the whole difference between a message that ends a session and one that starts
 * a bug report, and it is why this refusal reads as an invariant rather than as
 * advice. The near-miss list is `resolveFromAtlas`'s, for the case where the
 * spec did misspell a name in a way something upstream let through.
 */
function atlasedImage(image: string, where: string, ctx: AttachmentContext): CompiledImage {
  const region = basename(image, '.png');
  const img = ctx.images.find((im) => im.region === region);
  if (img) return img;
  const near = nearMisses(region, ctx.images.map((im) => im.region));
  const built = ctx.images.map((im) => im.region).sort();
  throw new CompileError(
    `${where}: the image "${image}" was never added to the atlas, so there is no region "${region}" for this ` +
      'attachment to draw and no measurement of it to take a size from. Every image an attachment names is ' +
      'measured and atlased — one per file, whichever skin names it (issue #555) — so reaching this means rigc ' +
      'skipped one, not that the spec left anything out. ' +
      (near.length ? `The nearest region(s) built are ${near.map((n) => JSON.stringify(n)).join(', ')}. ` : '') +
      `The atlas holds ${built.length} region(s): ${built.join(', ')}`, 'CE_COMPILE_INTERNAL_IMAGE_NOT_ATLASED',
  );
}

/**
 * The atlas region this attachment resolves its art from — **one rule for every
 * attachment kind that has art**, which is region and mesh (the parser's own two
 * `getValue(map, "path", name)` sites, `:541` and `:570`).
 *
 * `path` defaults to the attachment's NAME, not to the placeholder, so a
 * placeholder called anything other than its PNG's basename resolves a region no
 * atlas has. Stating it is therefore not decoration: without it the loader
 * throws `Region not found in atlas`, which `A00_ROUNDTRIP_PARSE` reports in the
 * parser's own words.
 *
 * 🚨 The tree answered this in three different ways until issue #577, and
 * `docs/AUTHORING.md` §3.4 documented only one of them — *"rigc sets it for you
 * when the PNG basename differs from the placeholder"*. A region derived it, the
 * `contour` and `grid` generators derived it (one of them with a comment reading
 * "Same rule a region attachment follows"), and an authored mesh and the
 * `ring`/`ribbon` generators wrote `path` only when the spec stated one.
 * Measured on the probe rig: a region with `image: hair_short.png` under
 * placeholder `hair` gated green with `"path": "hair_short"`; the same image on
 * an authored mesh emitted no `path` and failed `A00_ROUNDTRIP_PARSE: threw:
 * Region not found in atlas: hair (attachment: hair)`. The asymmetry had already
 * been paid for by hand — `selftest.ts`'s own `TIMELINE_RIG` restates
 * `path: "block"` and `path: "marker"` on two authored meshes for no other
 * reason.
 *
 * ⭐ Deriving is the reading that was already written down, in the doc and in
 * two of the five emit sites. The alternative — document the asymmetry and
 * refuse a mesh whose basename differs without a `path` — was rejected because
 * it makes a hand-kept exception out of a rule the format applies to both kinds
 * through one line of parser, and it would have had to contradict §3.4 rather
 * than satisfy it.
 */
function attachmentPath(att: { name?: string; path?: string; image?: string }, placeholder: string): string | undefined {
  if (att.path !== undefined) return att.path;
  if (att.image === undefined) return undefined;
  const region = basename(att.image, '.png');
  // Against the NAME the attachment will carry, because that is what `path`
  // defaults to — the stated `name`, else the placeholder (issue #796). Read
  // against the placeholder alone, an image named after a stated name would
  // restate it as `path`, a field the source never wrote.
  return region === (att.name ?? placeholder) ? undefined : region;
}

/**
 * A mesh attachment's `path` and `color` — the two values every mesh builder
 * spreads into its record, and which `emitMesh` (`src/emit_spine.ts`) writes
 * right after `type` (issue #791; the position moved to the emitter with #917).
 *
 * 🔬 The editor writes a mesh `type, path, color, uvs, …`: right after `type`,
 * `path` before `color` — measured on a production set (#791), not on
 * `examples/`. There 18 meshes whose `path` differs from their name wrote it
 * second and 1 mesh with a `color` wrote that second; no object carried both, so
 * `path` before `color` is the order the two measured positions leave, not a
 * third measurement. The twelve exports carry neither key on a mesh, which is
 * why `EDITOR_KEY_ORDER`'s `mesh attachment` row does not list them: an unlisted
 * key keeps its constructor's index, so the position is stated in the one
 * constructor that writes the bytes, `emitMesh`, and the row stays what the
 * public exports derive.
 *
 * ⚠️ Not a linked mesh's, and not a region's. Neither was in the measured set —
 * a region's `path` stays where `buildRigRegion` puts it, a linked mesh's
 * keys where `buildRigLinkedMesh` does — because the analogy to a mesh is
 * obvious and it is not a measurement.
 */
function meshTextureKeys(att: { name?: string; path?: string; image?: string; color?: string }, placeholder: string): Pick<ModelMeshAttachment, 'path' | 'color'> {
  const out: Pick<ModelMeshAttachment, 'path' | 'color'> = {};
  const path = attachmentPath(att, placeholder);
  if (path !== undefined) out.path = path;
  if (att.color !== undefined) out.color = att.color;
  return out;
}

/**
 * The atlas region frame `i` of a sequence resolves to — the core's
 * `frameRegionName` (`src/core/uvs.ts`, issue #1015): the stem, then `start + i`
 * left-padded with zeros to `digits`. `start` and `digits` take the parser's
 * defaults when the spec leaves them out (`readSequence`: 1 and 0).
 *
 * ⚠️ The same name is derived in `validate.ts` (`attachmentRegionLookups`, the
 * walk `A08` joins the atlas with) through the same function. What holds it to
 * the loader is a measurement, not this sentence: the core suite reads
 * `Sequence.getPath` and the parser's defaults off spine-core over 7,680 cases
 * and compares this function, the core's and A08's walk with them, and `A00`'s
 * round trip asks the runtime's own `getPath` for every frame a build emits.
 *
 * Exported for the selftest alone.
 */
export function sequenceFrameRegion(stem: string, seq: RigSequence, i: number): string {
  return frameRegionName(stem, { count: seq.count, start: seq.start ?? 1, digits: seq.digits ?? 0, setup: seq.setup ?? 0 }, i);
}

/** The model's `sequence` record: the four fields exactly as the spec stated them. */
function buildSequence(seq: RigSequence): ModelSequence {
  const out: ModelSequence = { count: seq.count };
  if (seq.start !== undefined) out.start = seq.start;
  if (seq.digits !== undefined) out.digits = seq.digits;
  if (seq.setup !== undefined) out.setup = seq.setup;
  return out;
}

/**
 * What a sequence attachment's frames measure, for the `width`/`height` a spec
 * leaves out — or the refusal when they do not agree.
 *
 * An attachment has ONE size and every frame is mapped into it
 * (`RegionAttachment.computeUVs(regions[i], … width, height …)` for each `i` in
 * `Sequence.update`), so an omitted size is derivable only when every frame
 * measures the same: that is the one number the frames state. Frames of
 * different sizes state several, and picking one — the first, the setup frame,
 * the largest — would be the compiler choosing a value the spec did not.
 *
 * ⭐ A STATED size is emitted as stated and compared with no frame, on either
 * route. It is the quad, and the frames are what is drawn into it:
 * `computeUVs` scales each region by `width / region.originalWidth`, so a frame
 * of another size is drawn at the attachment's size, filling it (issue #795,
 * measured on spine-core 4.3.13: frames of 40, 60 and 80 under a stated 40 give
 * every frame the same ±20 quad, each with its own region's UVs). That is the
 * shape an editor exports whenever a series mixes image sizes — it writes the
 * setup frame's size and leaves the others as they are.
 *
 * ⚠️ The single-region rule in `buildRigRegion` does not transfer, though it
 * reads the same. There the attachment has one region, the editor always writes
 * that region's own size, and a spec stating another is contradicting the pack
 * it is resolved against. Here the attachment has `count` regions and one size,
 * so every frame but the setup frame differing from it is the ordinary case, and
 * refusing it refused correct editor exports.
 */
function sequenceFrameSize(
  frames: readonly CompiledImage[],
  stated: { width?: number; height?: number },
  where: string,
): { width?: number; height?: number } {
  const out: { width?: number; height?: number } = {};
  for (const field of ['width', 'height'] as const) {
    const sizes = [...new Set(frames.map((img) => img[field]))];
    if (stated[field] !== undefined) {
      out[field] = stated[field];
    } else if (sizes.length === 1) {
      out[field] = sizes[0];
    } else {
      throw new CompileError(
        `${where}: the ${frames.length} frames of this sequence measure ${sizes.join(', ')} in ${field} ` +
          `(${frames.map((img) => `"${img.region}" ${img[field]}`).join(', ')}), and an attachment has one ` +
          `${field} every frame is drawn into. State "${field}" — the frames do not agree on one`, 'CE_COMPILE_SEQUENCE_FRAME_SIZE_AMBIGUOUS',
      );
    }
  }
  return out;
}

/** Every frame of `att`'s sequence, already atlased by the gather pass. */
function sequenceFrames(att: { path?: string; sequence?: RigSequence }, placeholder: string, where: string, ctx: AttachmentContext): CompiledImage[] {
  const seq = att.sequence!;
  // `path`, else what `path` defaults to: the stated `name`, else the placeholder (issue #796).
  const stem = att.path ?? (att as { name?: string }).name ?? placeholder;
  const frames: CompiledImage[] = [];
  for (let i = 0; i < seq.count; i++) {
    // By the frame's FULL region name — `atlasedImage` takes a basename, and a
    // series in an images subfolder is named `fx/flame_0001`.
    const region = sequenceFrameRegion(stem, seq, i);
    const img = ctx.images.find((im) => im.region === region);
    if (img === undefined) {
      // Unreachable while the gather pass atlases every frame of every sequence
      // or refuses the missing one by name; stated so that a gather that stops
      // doing so is a sentence rather than a quad with no region.
      throw new CompileError(
        `${where}: sequence frame ${i} is the region "${region}", which was never added to the atlas — every frame ` +
          'of a sequence is atlased or refused by name before any attachment is built, so reaching this means rigc ' +
          'skipped one', 'CE_COMPILE_INTERNAL_SEQUENCE_FRAME_NOT_ATLASED',
      );
    }
    frames.push(img);
  }
  return frames;
}

function buildRigRegion(
  att: RigRegionAttachment,
  placeholder: string,
  where: string,
  ctx: AttachmentContext,
): ModelRegionAttachment {
  if (att.sequence !== undefined) {
    const frames = sequenceFrames(att, placeholder, where, ctx);
    const size = sequenceFrameSize(frames, att, where);
    const out: ModelRegionAttachment = { kind: 'region', width: f32(size.width!), height: f32(size.height!) };
    if (att.path !== undefined) out.path = att.path;
    if (att.x !== undefined) out.x = f32(att.x);
    if (att.y !== undefined) out.y = f32(att.y);
    if (att.rotation !== undefined) out.rotation = f32(att.rotation);
    if (att.scaleX !== undefined) out.scaleX = f32(att.scaleX);
    if (att.scaleY !== undefined) out.scaleY = f32(att.scaleY);
    if (att.color !== undefined) out.color = att.color;
    // Each frame draws through its own rectangle (`Sequence.apply`), in frame order.
    const sequence: ModelRegionSequence = { ...buildSequence(att.sequence), atlas: frames.map(imageAtlasRect) };
    out.sequence = sequence;
    return out;
  }
  const img = att.image === undefined ? null : atlasedImage(att.image, where, ctx);
  // ⭐ An IMPORTED region's size is not a default the spec may override. On the
  // loose path `att.width` and the PNG's width are two legitimate numbers — "draw
  // this drawing at this size" is a scale, and the region covers its page either
  // way. A packed region's rectangle is already fixed in the atlas, so a spec that
  // states a different size is stating a disagreement with the file it is being
  // resolved against, and the two would produce a quad the pack cannot fill.
  if (img?.atlas !== undefined) {
    for (const [field, stated, measured] of [
      ['width', att.width, img.width],
      ['height', att.height, img.height],
    ] as const) {
      if (stated !== undefined && stated !== measured) {
        throw new CompileError(
          `${where}: the spec says ${field} ${stated} and region "${img.region}" of the imported atlas is ` +
            `${measured} (bounds ${img.atlas.width}x${img.atlas.height}, offsets state a ` +
            `${img.atlas.originalWidth}x${img.atlas.originalHeight} drawing` +
            // The descaled number is in neither file, so the message says how it
            // was reached — otherwise "the spec says 745 and the region is 746"
            // reads as an off-by-one in the spec rather than as the pack's own
            // rounding, and the remedy is the opposite one.
            (img.atlasScale === undefined
              ? ''
              : ` in the page's texels, which its scale: ${img.atlasScale} makes a ` +
                `${img.width}x${img.height} drawing (+/- ${f32(0.5 / img.atlasScale)}px, the pack's rounding)`) +
            ')', 'CE_COMPILE_REGION_ATLAS_SIZE_MISMATCH',
        );
      }
    }
  }
  const width = att.width ?? img?.width;
  const height = att.height ?? img?.height;
  if (width === undefined || height === undefined) {
    // No parser default: an omission loads as NaN and every UV collapses, with
    // no error at all. So it is this or nothing.
    throw new CompileError(
      `${where}: a region needs width and height — give them, or give an "image" and rigc will measure the PNG`, 'CE_COMPILE_REGION_SIZE_MISSING',
    );
  }
  const out: ModelRegionAttachment = { kind: 'region', width: f32(width), height: f32(height) };
  const path = attachmentPath(att, placeholder);
  if (path !== undefined) out.path = path;
  if (att.x !== undefined) out.x = f32(att.x);
  if (att.y !== undefined) out.y = f32(att.y);
  if (att.rotation !== undefined) out.rotation = f32(att.rotation);
  if (att.scaleX !== undefined) out.scaleX = f32(att.scaleX);
  if (att.scaleY !== undefined) out.scaleY = f32(att.scaleY);
  if (att.color !== undefined) out.color = att.color;
  // The region the runtime asks the atlas for: `path`, else the name
  // (`getValue(map, "path", name)`), which is the stated `name`, else the placeholder.
  out.atlas = regionAtlasRect(path ?? att.name ?? placeholder, ctx.images, ctx.atlasRegions);
  return out;
}

/**
 * The rectangle a region draws through, as the atlas states it — the six
 * fields `ModelAtlasRect` holds, copied, nothing derived.
 */
function atlasRectOf(region: AtlasRegion): ModelAtlasRect {
  return {
    width: region.width,
    height: region.height,
    offsetX: region.offsetX,
    offsetY: region.offsetY,
    originalWidth: region.originalWidth,
    originalHeight: region.originalHeight,
  };
}

/**
 * The rectangle an atlased image draws through: the pack's region under
 * `--atlas-in`, else the loose PNG as its own page, which is exactly the region
 * `buildAtlasText` writes for it — kept size and original size the PNG's,
 * offsets 0.
 */
function imageAtlasRect(img: CompiledImage): ModelAtlasRect {
  if (img.atlas !== undefined) return atlasRectOf(img.atlas);
  return { width: img.width, height: img.height, offsetX: 0, offsetY: 0, originalWidth: img.width, originalHeight: img.height };
}

/**
 * The rectangle of the region named `name` in the build's one atlas source —
 * the `--atlas-in` pack when there is one, else the images atlased from loose
 * PNGs — or `null` when that source has no region of the name (issue #935).
 *
 * `null` is the build saying it has no source, never a guessed trim of 0: the
 * atlas this build emits is that same source, so the region is missing from it
 * too, and `A08_REGION_NAMES_MATCH_ATTACHMENTS` refuses the build by the name.
 */
function regionAtlasRect(
  name: string,
  images: readonly CompiledImage[],
  atlasRegions: ReadonlyMap<string, { region: AtlasRegion }> | null,
): ModelAtlasRect | null {
  if (atlasRegions !== null) {
    const found = atlasRegions.get(name);
    return found === undefined ? null : atlasRectOf(found.region);
  }
  const img = images.find((im) => im.region === name);
  return img === undefined ? null : imageAtlasRect(img);
}

/**
 * Resolve an authored attachment's by-name weights into the model's bindings.
 *
 * 🚨 This is the whole point of the `weights` form. Spine's run is
 * `boneCount, (boneIndex, bindX, bindY, weight) x n` per vertex and those
 * indices are positions in the emitted bone array — a thing the rig spec never
 * writes. Keeping the NAME here, and letting the emitter write the index from
 * the model's bone order (`emitVertices`), is what makes "insert a bone" a
 * renumbering rather than a rebinding: the names still point at the same bones,
 * so the emitted indices move and the mesh does not.
 *
 * An unknown name is a `CompileError`, the same as a bone's `parent`, a slot's
 * `bone` or a constraint's `target`. The alternative — the raw form — cannot
 * refuse a rebind, because an index has no name to be wrong.
 */
function bindNamedWeights(weights: RigMeshBinding[][], where: string, ctx: AttachmentContext): ModelBinding[][] {
  return weights.map((vertex, i) => {
    if (!Array.isArray(vertex) || vertex.length === 0) {
      throw new CompileError(`${where}: vertex ${i} has no bone bindings; a weighted vertex names at least one bone`, 'CE_COMPILE_VERTEX_BINDINGS_EMPTY');
    }
    return vertex.map((binding) => {
      if (!ctx.bones.some((b) => b.name === binding.bone)) {
        throw new CompileError(
          `${where}: vertex ${i} binds bone ${JSON.stringify(binding.bone)}, which the rig does not declare as a bone`, 'CE_COMPILE_VERTEX_BIND_BONE_UNKNOWN',
        );
      }
      return { bone: binding.bone, x: f32(binding.x), y: f32(binding.y), weight: f32(binding.weight) };
    });
  });
}

/**
 * Measure an authored mesh against the art it names, or report nothing.
 *
 * 🚨 A measurement, never a refusal — and that asymmetry with `contour` is the
 * whole decision (issue #277). A contour mesh is refused under 99.5% because rigc
 * GENERATED that geometry as a claim about the art: below the bar, rigc's own
 * arithmetic clipped the drawing. Authored geometry is the author's intent, and a
 * mesh that sits inside its art is a legitimate thing to draw — a soft feather, a
 * deliberately trimmed hull, a mesh meant to bend a core while its edges stretch.
 * Refusing those would be #44's mistake in a new place. So the figure is printed
 * and the decision stays with the author.
 *
 * Nothing is reported in the two cases where there is nothing to compare:
 * an attachment with no `image` (there is no PNG the mesh is a claim about), and
 * a part with no art at all (0 of 0 pixels is not a percentage). Neither is an
 * error here — a mesh with no image is ordinary data, and an all-transparent part
 * is somebody else's assertion to make.
 *
 * 🚨 The asymmetry was a promise this function could not keep, and nothing here
 * said so (issue #570). `partPlate` three frames down called `extractRegion`,
 * which refused a region a foreign pack had turned — so an authored mesh naming
 * an `image` under `--atlas-in` ENDED the build, by a refusal raised inside a
 * measurement, on 36 of 42 atlases of the pack the card was filed from. The
 * repair was to make the refusal unnecessary rather than to catch it: reading a
 * turned region is now what `extractRegion` does, measured against
 * `MeshAttachment.computeUVs` (`PKR02`), so there is no unmeasurable case left for this
 * function to report and no catch here to keep reachable.
 */
function measureAuthoredFit(
  att: RigMeshAttachment,
  ctx: AttachmentContext,
): (MeshFitReport & { pageScale: number | undefined }) | { withheld: string } | null {
  if (att.image === undefined || att.uvs === undefined || att.triangles === undefined) return null;
  const region = basename(att.image, '.png');
  const img = ctx.images.find((im) => im.region === region);
  if (!img) return null;
  // A third case, and neither of the two above (issue #750): there IS art to
  // compare against, and its texels cannot be located, because its page's file
  // is not the size the atlas declares. Withheld and said, rather than measured
  // over whatever the declared coordinates land on — on a half-resolution pack
  // that read 68.49% where the page it was packed from reads 100.00%.
  if (img.pageGrid !== undefined) return { withheld: img.pageGrid.said };
  const plate = partPlate(img);
  const alpha = new Uint8Array(plate.width * plate.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = plate.data[i * 4 + 3];
  // uvs are the part window in 0..1 — the same normalisation `buildContourMesh`
  // emits — so the pixel grid they land on is the PLATE's, which is the grid the
  // alpha was read off. On an imported page that declares a `scale:` the
  // drawing's size and the plate's differ, and it is the plate that has pixels.
  const points = [] as Array<[number, number]>;
  for (let i = 0; i + 1 < att.uvs.length; i += 2) {
    points.push([att.uvs[i] * plate.width, att.uvs[i + 1] * plate.height]);
  }
  const fit = measureAuthoredMeshFit({ width: plate.width, height: plate.height, alpha }, 1, points, att.triangles);
  return fit.artPixels === 0 ? null : { ...fit, pageScale: img.atlasScale };
}

/**
 * A mesh's overshoot in the drawing's pixels, and the page grid it was taken on.
 *
 * 📐 Both fit readers measure on the grid the part's alpha is read off — the
 * plate — and on a page that declares a `scale:` other than 1 that grid is the
 * page's texels, not the drawing's pixels (issue #762). Coverage is a share and
 * carries no unit; the overshoot is a distance, and it was printed as `px` in
 * whatever grid it was taken on: 16.00px on the declared-size page, 8.00px on
 * its `scale: 0.5` restatement, 32.00px on a `scale: 2` one, for one mesh over
 * one drawing. Divided by the scale the atlas STATES it is the drawing's figure
 * on all three, which is the unit `CompiledImage.width` and every attachment
 * size is already in. The stated scale travels with it, because a distance
 * taken on a coarser grid carries that grid's step and the report says so.
 *
 * On a loose part and a page at scale 1 nothing is divided — the plate IS the
 * drawing — so the figure is the one it always was, to the bit.
 */
function drawingOvershoot(overshoot: number, pageScale: number | undefined): { overshoot: number; pageScale?: number } {
  return pageScale === undefined ? { overshoot } : { overshoot: f32(overshoot / pageScale), pageScale };
}

/**
 * The `hull` and `edges` an authored mesh's triangles state (issue #368).
 *
 * `hull` is derived, never defaulted: the outline is the set of edges used by
 * exactly one triangle, and Spine needs its vertices first in the list and in
 * order, so a list that is not arranged that way is refused with the walk to
 * renumber along — writing 0 instead would hand the editor a mesh it rebuilds
 * the outline of on import (every vertex, in list order, with a WARNING). A
 * stated `hull` is checked against the same derivation, because the binary
 * reader turns a wrong one into a wrong triangle count. Stated `edges` are the
 * author's (an export carries only the edges somebody drew) and pass through;
 * absent ones are every triangle edge, which is what "internal edges lost" is
 * about.
 */
function authoredHullAndEdges(
  att: Pick<RigMeshAttachment, 'hull' | 'edges'>,
  vertexCount: number,
  triangles: number[],
  where: string,
  named: { skin: string; slot: string; placeholder: string },
): { hull: number; edges: number[] } {
  try {
    const outline = traceOutline(vertexCount, triangles);
    if (att.hull !== undefined && att.hull !== outline.hull) {
      throw new MeshError(
        `hull ${att.hull} disagrees with the triangles, whose outline has ${outline.hull} vertices ` +
          `(${formatWalk(outline.walk)}). Delete "hull" and rigc derives it, or state ${outline.hull}`,
      );
    }
    checkHullOrder(outline, vertexCount);
    return { hull: outline.hull, edges: att.edges ?? meshEdges(vertexCount, triangles, outline.hull) };
  } catch (err) {
    if (err instanceof MeshError) throw new CompileError(`${where}: ${err.message}${splitPointer(vertexCount, triangles, named)}`, 'CE_COMPILE_AUTHORED_MESH_OUTLINE_INVALID');
    throw err;
  }
}

/**
 * The command that answers an outline refusal whose cause is pieces that share
 * no vertex (issue #1414): one mesh is one outline, so the fix is one mesh per
 * piece, and `rigc split` writes that proposal. Empty for every other cause —
 * a pinch, a hole, a doubled triangle — whose fix is the triangles, and for a
 * list the refusal is about because its indices are not vertices at all.
 */
function splitPointer(vertexCount: number, triangles: readonly number[], named: { skin: string; slot: string; placeholder: string }): string {
  if (triangles.length % 3 !== 0 || triangles.some((v) => !Number.isInteger(v) || v < 0 || v >= vertexCount)) return '';
  const count = meshPieces(vertexCount, triangles).pieces.length;
  if (count < 2) return '';
  // Each name one shell word (issue #1442): the command is copied into a shell, and a bare `left legs` is two arguments.
  const skin = named.skin === 'default' ? '' : ` --skin ${shellWord(named.skin)}`;
  return (
    ` — the triangles are ${count} pieces that share no vertex, and one mesh is one outline: ` +
    `\`rigc split --rig <rig> --motion <motion> --slot ${shellWord(named.slot)} --attachment ${shellWord(named.placeholder)}${skin} --out <dir>\` ` +
    'writes one mesh per piece, its deform keys renumbered (AUTHORING §3.4.11)'
  );
}

/**
 * The same two fields for geometry rigc built. The generators already put the
 * outline first and in order — a contour is all outline, a ring's outer ring
 * comes first, a ribbon runs in perimeter order — so this is a self-check on
 * that promise rather than a rule the author can break, and the message says so.
 */
function generatedHullAndEdges(geometry: MeshGeometry, where: string): { hull: number; edges: number[] } {
  const vertexCount = geometry.uvs.length / 2;
  try {
    const outline = traceOutline(vertexCount, geometry.triangles);
    if (outline.hull !== geometry.hullVertices) {
      throw new MeshError(`it declares hull ${geometry.hullVertices} and its triangles outline ${outline.hull} vertices`);
    }
    checkHullOrder(outline, vertexCount);
  } catch (err) {
    if (err instanceof MeshError) {
      throw new CompileError(`${where}: internal: the ${geometry.kind} generator built an inconsistent mesh — ${err.message}`, 'CE_COMPILE_INTERNAL_GENERATED_MESH_OUTLINE_INVALID');
    }
    throw err;
  }
  return { hull: geometry.hullVertices, edges: meshEdges(vertexCount, geometry.triangles, geometry.hullVertices) };
}

function buildRigMesh(
  att: RigMeshAttachment,
  placeholder: string,
  where: string,
  ctx: AttachmentContext,
): ModelMeshAttachment {
  const authored =
    att.uvs !== undefined || att.triangles !== undefined || att.vertices !== undefined || att.weights !== undefined;
  if (authored && att.generator) {
    throw new CompileError(`${where}: a mesh is either authored geometry or a generator, never both`, 'CE_COMPILE_MESH_AUTHORED_AND_GENERATED');
  }
  if (att.generator) return buildGeneratedMesh(att, att.generator, placeholder, where, ctx);
  if (att.vertices && att.weights) {
    throw new CompileError(
      `${where}: a mesh gives geometry as "vertices" or as "weights", never both — "weights" is the by-name form of the same data`, 'CE_COMPILE_MESH_GEOMETRY_SOURCES_CONFLICT',
    );
  }
  if (!att.uvs || !att.triangles || !(att.vertices || att.weights)) {
    throw new CompileError(`${where}: an authored mesh needs uvs, triangles and vertices or weights (or a "generator")`, 'CE_COMPILE_MESH_GEOMETRY_MISSING');
  }
  const uvCount = att.uvs.length;
  let vertices: ModelVertices;
  let boundBones: string[] = [];
  if (att.weights) {
    if (att.boneIndexing === 'raw') {
      throw new CompileError(`${where}: "boneIndexing": "raw" describes a "vertices" run; "weights" always binds by name`, 'CE_COMPILE_NAMED_WEIGHTS_RAW_INDEXING');
    }
    if (att.weights.length !== uvCount / 2) {
      throw new CompileError(
        `${where}: weights cover ${att.weights.length} vertices but there are ${uvCount / 2} uv pairs`, 'CE_COMPILE_MESH_WEIGHT_UV_COUNT',
      );
    }
    vertices = { weighted: true, bindings: bindNamedWeights(att.weights, where, ctx) };
    boundBones = [...new Set(att.weights.flat().map((b) => b.bone))];
  } else {
    const raw = att.vertices!;
    // An unweighted mesh is one x,y per uv pair. It names no bone, so there is
    // nothing here to rebind and nothing to opt into.
    const weighted = raw.length !== uvCount;
    if (weighted && att.boneIndexing !== 'raw') {
      throw new CompileError(
        `${where}: this mesh's "vertices" is a weighted run, whose bone INDEXES point into the emitted bone array — ` +
          'a list the spec never writes, so inserting a bone rebinds every vertex in silence. ' +
          'Give the bindings by name as "weights": [[{ "bone": …, "x": …, "y": …, "weight": … }, …], …], ' +
          'or say "boneIndexing": "raw" on this attachment to keep the index form deliberately.', 'CE_COMPILE_MESH_WEIGHTED_RUN_IMPLICIT',
      );
    }
    if (weighted) {
      // Decoded to names once, here, against the model's bone order — which is
      // the order the emitter writes the indexes back in, so the emitted run is
      // the run the spec stated. A run the model cannot hold is refused by name
      // rather than left to `A20` at the gate (issue #917).
      checkRawRunShape(raw, uvCount / 2, `there are ${uvCount / 2} uv pairs`, where);
      const bindings = bindRawRun(raw.map(f32), ctx.bones, where);
      vertices = { weighted: true, bindings };
      boundBones = [...new Set(bindings.flat().map((b) => b.bone))];
    } else {
      vertices = { weighted: false, xy: raw.map(f32) };
    }
  }
  const { hull, edges } = authoredHullAndEdges(att, uvCount / 2, att.triangles, where, { skin: ctx.skinName, slot: ctx.slotName, placeholder });
  // `width`/`height` are the size of the image the mesh is drawn on. Stated
  // wins; otherwise the PNG the attachment names, already measured for the
  // atlas — the same `CompiledImage.width` a region reads, so a page with a
  // `scale:` yields the drawing's size and not its texels. With neither stated
  // nor measurable it is a refusal, as it is for a region: 0 is not a size the
  // spec stated, and the editor shows whatever is written here as the image's
  // dimensions (it showed 32x32, its missing-image placeholder, for a 0x0 mesh).
  const img = att.image === undefined ? undefined : atlasedImage(att.image, where, ctx);
  const seqSize = att.sequence === undefined ? null : sequenceFrameSize(sequenceFrames(att, placeholder, where, ctx), att, where);
  const width = seqSize !== null ? seqSize.width : (att.width ?? img?.width);
  const height = seqSize !== null ? seqSize.height : (att.height ?? img?.height);
  if (width === undefined || height === undefined) {
    throw new CompileError(
      `${where}: a mesh needs width and height — give them, or give an "image" and rigc will measure the PNG`, 'CE_COMPILE_MESH_SIZE_MISSING',
    );
  }
  const out: ModelMeshAttachment = {
    kind: 'mesh',
    ...meshTextureKeys(att, placeholder),
    uvs: att.uvs.map(f32),
    triangles: att.triangles,
    vertices,
    hull,
    edges,
    width: f32(width),
    height: f32(height),
  };
  if (att.sequence !== undefined) out.sequence = buildSequence(att.sequence);
  // Register it as `authored`: geometry rigc did not build and whose topology it
  // therefore gets to assume nothing about. The generator-topology assertions
  // read this and skip rather than measuring a ring that was never a ring.
  ctx.meshBones.add(ctx.anchorBone);
  for (const name of boundBones) ctx.meshBones.add(name);
  const measured = measureAuthoredFit(att, ctx);
  const fit = measured === null || 'withheld' in measured ? null : measured;
  ctx.meshes.push({
    slot: ctx.slotName,
    kind: 'authored',
    attachments: [ctx.slotName],
    vertices: uvCount / 2,
    triangles: att.triangles.length / 3,
    bones: boundBones.length ? boundBones : [ctx.anchorBone],
    coverage: fit === null ? undefined : f32(fit.coverage),
    ...(fit === null ? {} : drawingOvershoot(fit.overshoot, fit.pageScale)),
    ...(measured !== null && 'withheld' in measured ? { fitWithheld: measured.withheld } : {}),
  });
  return out;
}

/**
 * A mesh that borrows another mesh's geometry. `type: "linkedmesh"`, or
 * `type: "mesh"` carrying `source` — one parser branch, one builder.
 *
 * 🚨 **Everything this refuses, the parser reads in silence**, which is the whole
 * reason the refusals exist. Measured on forged skeletons through spine-core
 * 4.3.13:
 *
 *   - Geometry beside `source`: the branch returns at `:586`, BEFORE
 *     `readVertices`. A link declaring 5 uvs, 3 triangles, `hull: 5` and
 *     `edges: [0, 2]` beside a 4-vertex source loaded with the source's 8-long
 *     `worldVerticesLength`, 6 triangles, `hullLength` 8 and 10 edges. Nothing
 *     the author wrote was read and nothing said so.
 *   - A chain — a link whose source is itself a link — resolves in the order
 *     `linkedMeshes` was FILLED, which is the order the skins' JSON keys are
 *     iterated in. Source-first, the chained link loaded the full geometry; with
 *     the two keys swapped in the same file it loaded `worldVerticesLength` 0,
 *     0 triangles, 0 bones and a 0x0 size, silently. A construct whose meaning
 *     depends on key order is a construct rigc will not write.
 *   - A link to itself is that chain at length one, and loads the same nothing.
 *
 * What is NOT refused here is `source` naming something in a skin or a slot this
 * builder has not reached yet: that is `resolveLinkedMeshes`' job, and doing it
 * here would refuse a correct rig on declaration order — the very thing the
 * chain measurement above condemns.
 */
function buildRigLinkedMesh(
  att: RigLinkedMeshAttachment,
  placeholder: string,
  where: string,
  ctx: AttachmentContext,
): ModelLinkedMeshAttachment {
  // The mesh keys the parser does not reach on this branch. Named one by one,
  // because "remove what does not belong" is not an instruction an author can
  // act on and the remedy for each of these is the same single sentence.
  const geometry = (['uvs', 'triangles', 'vertices', 'weights', 'boneIndexing', 'hull', 'edges', 'generator'] as const)
    .filter((key) => att[key] !== undefined);
  if (geometry.length > 0) {
    throw new CompileError(
      `${where}: a linked mesh states ${geometry.map((k) => JSON.stringify(k)).join(', ')}, and a linked mesh has ` +
        'no geometry of its own — it draws the geometry of the attachment "source" names. The parser returns from ' +
        'the `source` branch before `readVertices` (`SkeletonJson.ts:582-586`), so these keys are read by nothing ' +
        "at all: a link declaring 5 uvs beside a 4-vertex source loads the SOURCE's 4 vertices and says nothing. " +
        `Remove ${geometry.length === 1 ? 'it' : 'them'}, or remove "source" and author this as a mesh of its own.`, 'CE_COMPILE_LINKED_MESH_GEOMETRY_IGNORED',
    );
  }
  const source = att.source;
  if (typeof source !== 'string' || source.length === 0) {
    throw new CompileError(
      `${where}: a linked mesh needs "source" — the PLACEHOLDER of the mesh whose geometry it draws (the key that ` +
        `attachment is filed under in its skin, not its "name"), and this one states ${JSON.stringify(source) ?? String(source)}. ` +
        '"source" is what MAKES a mesh linked: `getValue(map, "source", null)` is falsy-tested ' +
        '(`SkeletonJson.ts:582`), so an absent or empty one is read as an ordinary mesh, whose `uvs` this ' +
        'attachment does not have — the parser dereferences `map.uvs.length` and throws.', 'CE_COMPILE_LINKED_MESH_SOURCE_MISSING',
    );
  }
  if (att.slot !== undefined && !ctx.slotNames.has(att.slot)) {
    throw new CompileError(
      `${where}: "slot" is ${JSON.stringify(att.slot)}, which the rig does not declare as a slot. It names where ` +
        'the source lives and is resolved through `skeletonData.findSlot` (`SkeletonJson.ts:575`), which throws ' +
        `\`Source mesh slot not found\` on a miss. The rig's slots are ${[...ctx.slotNames].sort().map((s) => JSON.stringify(s)).join(', ')}. ` +
        "Leave it out and the source is looked for in this attachment's own slot, which is the parser's default.", 'CE_COMPILE_LINKED_MESH_SLOT_UNKNOWN',
    );
  }
  ctx.links.push({
    where,
    skin: att.skin ?? 'default',
    slot: att.slot ?? ctx.slotName,
    source,
    skinStated: att.skin !== undefined,
    slotStated: att.slot !== undefined,
  });
  // The art side is a mesh's, unchanged: a link draws its OWN region, which is
  // the reason the type exists — one triangulation, one outfit's pixels each.
  const img = att.image === undefined ? undefined : atlasedImage(att.image, where, ctx);
  const seqSize = att.sequence === undefined ? null : sequenceFrameSize(sequenceFrames(att, placeholder, where, ctx), att, where);
  const width = seqSize !== null ? seqSize.width : (att.width ?? img?.width);
  const height = seqSize !== null ? seqSize.height : (att.height ?? img?.height);
  if (width === undefined || height === undefined) {
    throw new CompileError(
      `${where}: a linked mesh needs width and height — give them, or give an "image" and rigc will measure the PNG`, 'CE_COMPILE_LINKED_MESH_SIZE_MISSING',
    );
  }
  // The link in full — skin, slot and `timelines` as the parser resolves them.
  // Writing each only where it differs from the parser's own default (a
  // `timelines: true` or a `skin` of "default" would be a byte the editor's own
  // export does not carry) is the emitter's (`emitLinkedMesh`).
  const out: ModelLinkedMeshAttachment = {
    kind: 'linkedmesh',
    source,
    skin: att.skin ?? 'default',
    slot: att.slot ?? ctx.slotName,
    timelines: att.timelines !== false,
    width: f32(width),
    height: f32(height),
  };
  const path = attachmentPath(att, placeholder);
  if (path !== undefined) out.path = path;
  if (att.color !== undefined) out.color = att.color;
  if (att.sequence !== undefined) out.sequence = buildSequence(att.sequence);
  // 🚫 NOT registered in `ctx.meshes`, and that is a decision rather than an
  // omission. `meshKinds` is keyed by SLOT and the commonest linked mesh shares
  // its source's slot from another skin, so an entry here would overwrite the
  // source's own `ring`/`ribbon`/`contour` kind and silence `A21_MESH_RIM_PINNED`
  // on the mesh rigc actually built — a gate turned off by a feature, which is
  // the failure mode issue #44 is about, pointed the other way. The validator
  // tells a link apart from the ARTIFACT instead — off the file's own `source`
  // keys, joined to the loaded attachment by (skin, slot, placeholder) — which
  // is the archetype rule's own words: an assertion reads the rig, never a name.
  return out;
}

/**
 * Resolve every `source` against the skins that were built, and refuse a miss by
 * name.
 *
 * Three of the four refusals are one per throw the runtime would have made
 * (`SkeletonJson.js:427-436`) — `Skin not found`, `Source mesh slot not found`,
 * `Source mesh not found`. Those are thrown `Error`s, so left to the round trip
 * they arrive as `A00_ROUNDTRIP_PARSE`'s report of the runtime's sentence, which
 * names neither the attachment that asked nor the skin and slot it searched. The
 * fourth has no runtime throw behind it at all: a source that is not a mesh is
 * read field by field off whatever was found, and `undefined` is not an error.
 */
function resolveLinkedMeshes(
  links: readonly PendingLink[],
  tables: ReadonlyMap<string, SkinTable>,
): void {
  const skinNames = [...tables.keys()];
  for (const link of links) {
    // ⚠️ An omitted `skin` can miss here too since issue #801: rigc emits a
    // `default` skin only when the spec has one, and the parser's default for a
    // link is `skeletonData.defaultSkin`, which is then null — the runtime reads
    // `getAttachment` off it and throws a `TypeError` naming neither. So the
    // omitted case is said separately, because "the skin is default" would be a
    // sentence about a value nobody wrote.
    const table = tables.get(link.skin);
    if (table === undefined && !link.skinStated) {
      throw new CompileError(
        `${link.where}: no "skin" is stated, so the parser looks for the source "${link.source}" in the default ` +
          `skin — and this rig declares no default skin. The rig's skins are ${skinNames.map((s) => JSON.stringify(s)).join(', ')}. ` +
          'State the skin the source is filed under. Left to the round trip this is a `TypeError` off the null ' +
          '`SkeletonData.defaultSkin`, which names neither this attachment nor where it was looking.', 'CE_COMPILE_LINKED_MESH_DEFAULT_SKIN_MISSING',
      );
    }
    if (table === undefined) {
      throw new CompileError(
        `${link.where}: "skin" is ${JSON.stringify(link.skin)}, and the rig declares no such skin. The rig's skins ` +
          `are ${skinNames.map((s) => JSON.stringify(s)).join(', ')}. ` +
          "Left to the round trip this is the runtime's `Skin not found`, which names neither this attachment nor " +
          'where it was looking.', 'CE_COMPILE_LINKED_MESH_SKIN_UNKNOWN',
      );
    }
    const slot = table[link.slot];
    const held = slot === undefined ? [] : Object.keys(slot).sort();
    const found = slot?.[link.source];
    if (found === undefined) {
      throw new CompileError(
        `${link.where}: "source" is ${JSON.stringify(link.source)}, and skin ${JSON.stringify(link.skin)}` +
          `${link.skinStated ? '' : ' (the default skin, because no "skin" was stated — never the skin this attachment is written in)'}` +
          ` slot ${JSON.stringify(link.slot)}${link.slotStated ? '' : ' (this attachment\'s own slot, because no "slot" was stated)'} ` +
          `holds ${held.length === 0 ? 'no attachment at all' : `${held.length}: ${held.map((k) => JSON.stringify(k)).join(', ')}`}. ` +
          '"source" is the PLACEHOLDER the source is filed under — `skin.getAttachment(slotIndex, source)` ' +
          "(`SkeletonJson.ts:433`), whose table is keyed by the JSON key, not by the attachment's `name`. " +
          "Left to the round trip this is the runtime's `Source mesh not found`.", 'CE_COMPILE_LINKED_MESH_SOURCE_UNKNOWN',
      );
    }
    const type = found.kind;
    if (type === 'linkedmesh') {
      throw new CompileError(
        `${link.where}: "source" is ${JSON.stringify(link.source)}, which is itself a linked mesh, and a chain of ` +
          'them is refused. Measured through spine-core: the runtime resolves links in the order they were read, ' +
          "so a link whose source is a link loads the source's geometry when the source comes first in the file " +
          'and loads NOTHING — `worldVerticesLength` 0, 0 triangles, a 0x0 size — when the two are swapped, in ' +
          'silence either way. Point "source" at the mesh itself.', 'CE_COMPILE_LINKED_MESH_SOURCE_IS_LINK',
      );
    }
    if (type !== 'mesh') {
      throw new CompileError(
        `${link.where}: "source" is ${JSON.stringify(link.source)}, which is a ${JSON.stringify(type)} attachment ` +
          "and not a mesh. A linked mesh takes another MESH's `uvs`, `triangles`, `vertices`, `hull` and `edges` " +
          '(`MeshAttachment.setSourceMesh`); the runtime casts whatever it finds and reads those fields off it, ' +
          'which on any other type is `undefined` and no error.', 'CE_COMPILE_LINKED_MESH_SOURCE_NOT_MESH',
      );
    }
  }
}

/**
 * Invoke a `src/mesh.ts` builder from rig-spec data.
 *
 * ⚠️ This is the path a skeleton with NO cut manifest takes. A cut that has one
 * invokes the same builders through the manifest's `mesh` block instead, because
 * everything the builders need — the mask contour, the aperture centre, the part
 * window — is measured art, and measured art has exactly one home.
 */
function buildGeneratedMesh(
  att: RigMeshAttachment,
  generator: NonNullable<RigMeshAttachment['generator']>,
  placeholder: string,
  where: string,
  ctx: AttachmentContext,
): ModelMeshAttachment {
  if (generator.kind === 'contour') return buildContourAttachment(att, generator, placeholder, where, ctx);
  if (generator.kind === 'grid') return buildGridAttachment(att, generator, placeholder, where, ctx);
  if (generator.kind === 'segments') return buildSegmentsAttachment(att, generator, placeholder, where, ctx);
  const controls = generator.kind === 'ring' ? generator.controls : generator.chain;
  // Resolving the bone and its setup transform is one step with two named
  // refusals, because the ring's control angles need the transform and the bind
  // needs the bone — and the two must refuse a bone the rig lacks in the same
  // words whichever of them asks for it first.
  // Two readings of one bone (issue #1021): the runtime's matrices to bind
  // through, and the exact frame to measure the control angles in.
  const resolve = (name: string, frames: Map<string, BoneTransform> = ctx.transforms): BoneTransform => {
    if (!ctx.bones.some((b) => b.name === name)) throw new CompileError(`${where}: mesh bone "${name}" is not in the rig's bone list`, 'CE_COMPILE_MESH_BONE_UNKNOWN');
    const transform = frames.get(name);
    if (!transform) throw new CompileError(`${where}: no setup transform for mesh bone "${name}"`, 'CE_COMPILE_MESH_BONE_TRANSFORM_MISSING');
    return transform;
  };
  const refFor = (name: string): MeshBoneRef => {
    const transform = resolve(name);
    return { name, toBind: (wx, wy) => toBoneLocal(transform, wx, wy) };
  };
  // The generator works in part-local pixels, y down. Without a manifest there is
  // no crop to flip against, so the part window is centred on its own slot bone.
  // `place` is that placement and `toPartLocal` is its inverse — which is the
  // conversion a control bone's own position has to come back through before its
  // angle about the aperture means anything (issue #684).
  const [w, h] = generator.size;
  const anchor = ctx.transforms.get(ctx.anchorBone);
  if (!anchor) throw new CompileError(`${where}: slot bone "${ctx.anchorBone}" has no setup transform`, 'CE_COMPILE_SLOT_SETUP_TRANSFORM_MISSING');
  const place = (px: number, py: number): [number, number] => [anchor.worldX + px - w / 2, anchor.worldY + h / 2 - py];
  // The inverse a control angle is measured through, in the exact frame: the
  // anchor's and the control's positions as the spec put them, not as the
  // runtime's last bits put them (issue #1021).
  const exactAnchor = resolve(ctx.anchorBone, ctx.exactFrames);
  const toPartLocal = (wx: number, wy: number): [number, number] => [wx - exactAnchor.worldX + w / 2, exactAnchor.worldY + h / 2 - wy];
  let geometry;
  try {
    geometry =
      generator.kind === 'ribbon'
        ? buildRibbonMesh({ size: generator.size, rows: generator.rows, chainCount: generator.chain.length })
        : buildRingMesh({
            hull: generator.hull,
            center: generator.center,
            inner: generator.inner,
            size: generator.size,
            bias: generator.bias,
            controlAngles: ringControlAngles(controls, generator.center, (name) => {
              const transform = resolve(name, ctx.exactFrames);
              return toPartLocal(transform.worldX, transform.worldY);
            }),
          });
  } catch (err) {
    if (err instanceof MeshError) throw new CompileError(`${where}: ${err.message}`, 'CE_COMPILE_RING_RIBBON_GENERATOR_INVALID');
    throw err;
  }
  const vertices = bindWeightedVertices(
    geometry,
    // The world point is an INTERMEDIATE — `toBind` makes it local and the
    // result is what is emitted, through `f32` below — so it carries the double.
    // Quantising it here rounded a point near 300 world units to its float, 4
    // float steps of the LOCAL coordinate emitted from it (issue #716).
    (px, py) => place(px, py),
    { anchor: refFor(ctx.anchorBone), controls: controls.map(refFor) },
  );
  ctx.meshBones.add(ctx.anchorBone);
  for (const name of controls) ctx.meshBones.add(name);
  ctx.meshes.push({
    slot: ctx.slotName,
    kind: geometry.kind,
    attachments: [ctx.slotName],
    vertices: geometry.uvs.length / 2,
    triangles: geometry.triangles.length / 3,
    bones: [ctx.anchorBone, ...controls],
  });
  const out: ModelMeshAttachment = {
    kind: 'mesh',
    ...meshTextureKeys(att, placeholder),
    uvs: geometry.uvs.map(f32),
    triangles: geometry.triangles,
    vertices: bindingsOnF32(vertices),
    ...generatedHullAndEdges(geometry, where),
    width: f32(w),
    height: f32(h),
  };
  return out;
}

/**
 * Read a depth map, check it against the part it claims to describe, and put a
 * `z` on every vertex.
 *
 * ## The three refusals, and why each one is a refusal
 *
 * **A size that is not the part's.** The map is sampled in part-local pixels,
 * so a sheet of a different size is a different coordinate system; sampling it
 * anyway would read the right shape from the wrong place and produce a turn
 * that is subtly, plausibly wrong everywhere.
 *
 * **A colour image.** A depth map is one channel. Silently taking red from an
 * RGB file works right up until somebody hands over a normal map or a tinted
 * preview, and then the part turns by whatever the red channel happened to say.
 *
 * **A vertex the map does not cover.** This is the one that is easy to miss and
 * ruins the result. A `contour` mesh's vertices are ALL on the silhouette, and
 * the outline is pushed `margin` pixels OUTSIDE it — while a depth sheet is
 * usually cut to the art's own alpha. Sample naively and every vertex reads the
 * sheet's transparent background, the whole rim takes the background depth, and
 * the silhouette folds away from the turn. Nothing about that is detectable
 * downstream: the arithmetic is correct and the numbers are plausible. So a
 * sheet that carries an alpha channel is held to it, and the fix — dilate the
 * sheet past the mesh margin — is named in the message.
 *
 * ## The count beside the third refusal, and why it is a count (issue #449)
 *
 * A sheet with no transparent texel anywhere covers its whole grid by
 * construction, so the third refusal has nothing to hold it to and skips. That
 * is the encoding a monocular depth estimator produces — a full-frame opaque
 * render with the background in it — and it is a legitimate statement, so
 * skipping the refusal is right. What was wrong is that nothing took its place:
 * measured on one cell and one depth field, the same 54 %-background mesh is a
 * named refusal when the sheet's alpha is cut to the art and a green build when
 * it is 255 everywhere.
 *
 * ⚠️ **`range` is not where that shows up**, and this header said it was until
 * #449 measured it. On the build above `range` reads `[0, 223.97]` of a stated
 * 224 — full, healthy — because the background is a legitimate depth value and
 * a map that is half background has exactly as full a range as one that is all
 * subject. "Covers its whole grid" is true and about the wrong grid: the
 * question was never coverage of the *sheet*, it was whether the mesh is
 * sampling **art**.
 *
 * ⇒ what shows it is `undrawn`: how many of the mesh's vertices take their
 * depth from a texel **the part image does not draw**, over the same four
 * bilinear taps the refusal walks. That is a measurement, not a guess, so it is
 * reported and never refused — a full-frame sheet is a statement rigc has no
 * authority to guess away.
 *
 * 🔸 It is a raw count with no reach subtracted from it, which is why a
 * `contour` mesh reports most or all of its vertices: its outline is pushed
 * `margin` pixels outside the silhouette by design, and out there the part
 * draws nothing. That is the true reading of that geometry rather than a defect
 * in the count — the rim's depth really did come from off the art, which is
 * benign on a sheet dilated past the margin and is the whole failure on a
 * full-frame estimate. Discounting the margin would be borrowing a number
 * authored for the trace to mean "close enough" for the sheet, and rigc does
 * not invent tolerances.
 */
function sampleMeshDepth(
  spec: NonNullable<Extract<NonNullable<RigMeshAttachment['generator']>, { kind: 'contour' }>['depth']>,
  kind: 'contour' | 'grid',
  points: ReadonlyArray<readonly [number, number]>,
  /** The mesh's own triangle list, for the turn ceiling. */
  triangles: ReadonlyArray<number>,
  /**
   * A part-local pixel to the BIND space this mesh's vertices are emitted in —
   * the same composition `bindWeightedVertices` applies, handed in rather than
   * rebuilt so the two cannot diverge — taken in the slot bone's exact frame
   * (`computeExactFrameTransforms`) rather than the runtime's. The two differ
   * in the last bits only, and those bits are the runtime's π rather than the
   * mesh: an unrotated bone reads `b = −2.3e-8` there, which turns the exact
   * zero this ceiling reads as "this axis cannot fold" into a fold at
   * 89.99997° (issue #1021; `TC03` and `TC06` are that claim).
   *
   * 🚨 The ceiling has to be taken in bind space and in no other. A deform
   * offset is authored there, so a rotated slot bone MIXES the two axes: a
   * ceiling measured in part-aligned pixels would report the yaw limit of a
   * turn nobody is taking. It is also scale-sensitive — a ratio of an area to
   * an area with a depth substituted into it — so part pixels have to reach the
   * units `z` is already in before it is taken.
   */
  toBind: (px: number, py: number) => readonly [number, number],
  /**
   * The PART's own alpha channel, in the same grid the sheet is sampled in —
   * what the drawing actually covers, as against what the sheet covers.
   *
   * The two are different questions and the header says why. This one has no
   * refusal behind it: it is counted, reported, and left to the author.
   *
   * `unlocated` in its place when the part's texels cannot be located — a
   * region lifted off a page whose file is not its declared size (issue #750),
   * carrying `pageGridSaid`'s clause — and the count is then `null` with that
   * clause beside it: withheld, rather than taken off another part of the page.
   */
  partAlpha: Uint8Array | { unlocated: string },
  /** The plate's grid the points and `partAlpha` are in, and on a `scale:` page the drawing's the sheet is in. */
  grid: SheetGrid,
  where: string,
  ctx: AttachmentContext,
): {
  z: number[];
  /** The tone-curved 0..1 nearness per vertex, which `bind` thresholds. */
  nearness: number[];
  summary: NonNullable<CompileResult['meshes'][number]['depth']>;
} {
  if (typeof spec.image !== 'string' || spec.image.length === 0) {
    throw new CompileError(`${where}: the depth block has no "image"; it is the sheet to sample, relative to the rig's images directory`, 'CE_COMPILE_DEPTH_IMAGE_MISSING');
  }
  if (spec.near !== 'white' && spec.near !== 'black') {
    throw new CompileError(
      `${where}: the depth block says "near": ${JSON.stringify(spec.near)}; it is "white" or "black". Both ` +
        'conventions are in use, and a sheet read with the wrong one turns the part inside out with every gate green.', 'CE_COMPILE_DEPTH_NEAR_INVALID',
    );
  }
  const tone: DepthTone = {
    gamma: spec.gamma ?? DEPTH_TONE_IDENTITY.gamma,
    contrast: spec.contrast ?? DEPTH_TONE_IDENTITY.contrast,
    bias: spec.bias ?? DEPTH_TONE_IDENTITY.bias,
  };
  try {
    checkTone(tone, where);
    checkZScale(spec.zScale, where);
  } catch (err) {
    if (err instanceof DepthError) throw new CompileError(err.message, 'CE_COMPILE_DEPTH_TONE_SCALE_INVALID');
    throw err;
  }

  const { map, cover, opaqueEverywhere } = readGreySheet(spec.image, 'depth', grid, where, ctx);
  const { partWidth, partHeight } = grid;
  // Where each vertex lands on the sheet: its own position, or on a `scale:`
  // page the same point of the drawing (issue #762). `[1, 1]` everywhere else,
  // and a product with 1 is the operand, so those routes read what they read.
  const [toSheetX, toSheetY] = sheetRatio(grid);

  // Every texel a bilinear tap touches has to be covered, not just the nearest
  // one: a vertex half a pixel outside the sheet blends real depth with the
  // background and lands somewhere neither states.
  //
  // 🔒 One walk, one footprint, two readings. `cover` is the SHEET's alpha and
  // decides a refusal; `partAlpha` is the PART's and decides a count. They are
  // deliberately the same four taps and the same clamp — the second is the
  // first's instinct applied to the other input (issue #449), and writing it as
  // a second loop is how the two would come to disagree about which texels a
  // vertex reads. On a `scale:` page the two inputs are on two grids (#762),
  // so the one footprint is placed on each: the sheet's at the vertex's
  // drawing position, the part's at its texel position — the same point of
  // the picture. Everywhere else the two placements are one.
  const sheetWidth = map.width;
  const sheetHeight = map.height;
  const clampTo = (n: number) => (i: number): number => (i < 0 ? 0 : i > n - 1 ? n - 1 : i);
  const cx = clampTo(partWidth);
  const cy = clampTo(partHeight);
  const sx = clampTo(sheetWidth);
  const sy = clampTo(sheetHeight);
  const uncovered: number[] = [];
  let undrawn = 0;
  for (let v = 0; v < points.length; v++) {
    const x0 = Math.floor(points[v][0] - 0.5);
    const y0 = Math.floor(points[v][1] - 0.5);
    const sx0 = Math.floor(points[v][0] * toSheetX - 0.5);
    const sy0 = Math.floor(points[v][1] * toSheetY - 0.5);
    let covered = true;
    let drawn = true;
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
      const at = cy(y0 + dy) * partWidth + cx(x0 + dx);
      if (cover[sy(sy0 + dy) * sheetWidth + sx(sx0 + dx)] !== 255) covered = false;
      // Zero, not a threshold: "the part image draws nothing here" is a fact
      // about the file, and any other cut-off would be rigc deciding how faint
      // a texel has to be before it stops counting as art.
      if (partAlpha instanceof Uint8Array && partAlpha[at] === 0) drawn = false;
    }
    if (!opaqueEverywhere && !covered) uncovered.push(v);
    if (!drawn) undrawn++;
  }
  if (uncovered.length > 0) {
    const first = uncovered[0];
    // The two topologies run out of sheet for different reasons, and a message
    // that explains the wrong one sends the author to the wrong fix.
    const why =
      kind === 'contour'
        ? 'A contour mesh puts every vertex ON the silhouette and pushes it out by the margin, so a sheet cut to ' +
          'the art stops short of every one of them. Dilate the sheet past the mesh margin, or lower the margin.'
        : 'A grid spans the whole part window, corners included, while a sheet is usually cut to the art — so the ' +
          'lattice reaches past it wherever the art does not fill the window. Dilate the sheet to the window, or ' +
          'state "us"/"vs" that keep the lattice inside the art.';
    throw new CompileError(
      `${where}: the depth map "${spec.image}" does not cover ${uncovered.length} of the mesh's ${points.length} ` +
        `vertices — the first is vertex ${first} at (${points[first][0]}, ${points[first][1]})` +
        // On a `scale:` page that position is in the page's texels and the sheet
        // is the drawing's (issue #762), so the pixel of the sheet is named too.
        (grid.scaled === undefined
          ? ''
          : ` in the page's texels, pixel (${f32(points[first][0] * toSheetX)}, ${f32(points[first][1] * toSheetY)}) of ` +
            'the drawing-sized sheet') +
        `. ${why} ` +
        'Sampling anyway would give those vertices the sheet\'s background depth and fold them away from the turn.', 'CE_COMPILE_DEPTH_COVERAGE_INCOMPLETE',
    );
  }

  const z: number[] = [];
  const nearness: number[] = [];
  let lo = Infinity;
  let hi = -Infinity;
  for (const [x, y] of points) {
    const n = toneLevel(sampleLevel(map, x * toSheetX, y * toSheetY), spec.near as DepthNear, tone);
    const d = n * spec.zScale;
    nearness.push(n);
    z.push(d);
    if (d < lo) lo = d;
    if (d > hi) hi = d;
  }
  return {
    z,
    nearness,
    summary: {
      image: spec.image,
      digest: depthDigest(map),
      near: spec.near,
      zScale: spec.zScale,
      tone,
      range: [f32(lo), f32(hi)],
      ...(partAlpha instanceof Uint8Array ? { undrawn } : { undrawn: null, unlocated: partAlpha.unlocated }),
      ceiling: turnCeiling(
        points.map(([px, py]) => toBind(px, py)),
        z,
        triangles,
      ),
    },
  };
}

/** One bone of the rig as `bindWeightedVertices` wants it: by name, with its setup inverse. */
function meshBoneRef(name: string, where: string, ctx: AttachmentContext): MeshBoneRef {
  const transform = ctx.transforms.get(name);
  if (!transform) throw new CompileError(`${where}: bone "${name}" has no setup transform`, 'CE_COMPILE_MESH_BONE_SETUP_TRANSFORM_MISSING');
  if (!ctx.bones.some((b) => b.name === name)) throw new CompileError(`${where}: bone "${name}" is not in the rig's bone list`, 'CE_COMPILE_MESH_BONE_NOT_DECLARED');
  return { name, toBind: (wx, wy) => toBoneLocal(transform, wx, wy) };
}

/**
 * The grid a mesh's vertices are in, and the grid a sheet made for its part is in.
 *
 * The vertices are in the PLATE's grid — the texels the part's alpha is read
 * off (`partPlate`). A sheet is made beside the art, at the drawing's size,
 * which is what `CompiledImage.width/height` are on every route. The two are
 * one grid on a loose part and on a page at scale 1; on a page that declares a
 * `scale:` other than 1 the plate is the drawing times that scale, and `scaled`
 * carries the drawing's size and the stated scale (issue #762).
 */
interface SheetGrid {
  /** The plate's size, in the grid the vertices are in. */
  partWidth: number;
  partHeight: number;
  /** The drawing's size and the page's stated `scale:`, when that is not 1. */
  scaled?: { width: number; height: number; scale: number };
}

/** The grid a sheet for this part is read in: the plate's, and the drawing's beside it on a `scale:` page. */
function sheetGridOf(img: CompiledImage, plate: Plate): SheetGrid {
  return img.atlasScale === undefined
    ? { partWidth: plate.width, partHeight: plate.height }
    : { partWidth: plate.width, partHeight: plate.height, scaled: { width: img.width, height: img.height, scale: img.atlasScale } };
}

/**
 * Where a vertex at a plate position lands on a sheet read in `grid` — the
 * position itself, or on a `scale:` page the same point of the drawing: the
 * texel position times the ratio of the drawing to the plate, which is the
 * atlas's stated scale undone. Two numbers the compiler was handed, divided;
 * nothing resampled, nothing chosen.
 */
function sheetRatio(grid: SheetGrid): readonly [number, number] {
  return grid.scaled === undefined
    ? [1, 1]
    : [grid.scaled.width / grid.partWidth, grid.scaled.height / grid.partHeight];
}

/**
 * Read a one-channel sheet in a part's own pixel grid.
 *
 * Two callers want the same three refusals — the depth map and the soft-region
 * mask — and both are a greyscale image that has to line up with the art. What
 * they do with the levels differs; that a colour file or a mismatched size is a
 * refusal by name does not.
 *
 * `purpose` only spells the messages. It is not a mode: the checks are the same
 * either way, and a reader has to be told which of their inputs is at fault.
 *
 * 📐 **The part's own pixel grid is the drawing's** (issue #762). On a page
 * that declares a `scale:` it used to be the page's texels, so a sheet made at
 * the art's size — the size this attachment's loose `image` is, and the one
 * `docs/AUTHORING.md` asks for — was refused on the restatement `A06` itself
 * prints (`is 96x64 and the part is 48x32`), and the same rig spec stopped
 * resolving against a pack of the same parts. The sheet is now compared to the
 * drawing and read at each vertex's drawing position (`sheetRatio`), so one
 * sheet serves every route. A drawing whose descaled size is not whole — the
 * pack's rounding — has no sheet of its size, and the refusal says both sizes.
 */
function readGreySheet(
  image: string,
  purpose: 'depth' | 'soft',
  grid: SheetGrid,
  where: string,
  ctx: AttachmentContext,
): { map: DepthMap; cover: Uint8Array; opaqueEverywhere: boolean } {
  const { scaled } = grid;
  const sheetWidth = scaled === undefined ? grid.partWidth : scaled.width;
  const sheetHeight = scaled === undefined ? grid.partHeight : scaled.height;
  const noun = purpose === 'depth' ? 'depth map' : 'soft mask';
  if (typeof image !== 'string' || image.length === 0) {
    throw new CompileError(`${where}: the "${purpose}" block has no image to read`, 'CE_COMPILE_GREY_SHEET_IMAGE_MISSING');
  }
  const path = join(ctx.imagesDir, image);
  if (!existsSync(path)) {
    throw new CompileError(`${where}: the ${noun} "${image}" is not at ${relative(process.cwd(), path)}`, 'CE_COMPILE_GREY_SHEET_IMAGE_NOT_FOUND');
  }
  const sheet = readPlate(path);
  if (sheet.width !== sheetWidth || sheet.height !== sheetHeight) {
    throw new CompileError(
      scaled === undefined
        ? `${where}: the ${noun} "${image}" is ${sheet.width}x${sheet.height} and the part is ` +
            `${grid.partWidth}x${grid.partHeight}. It is sampled in the part's own pixel grid, so the two are the same size — ` +
            'resample the sheet, or point at the one that was made for this part.'
        : `${where}: the ${noun} "${image}" is ${sheet.width}x${sheet.height} and the part is a ` +
            `${scaled.width}x${scaled.height} drawing — ${grid.partWidth}x${grid.partHeight} texels on a page that ` +
            `declares scale: ${scaled.scale}, which makes a texel ${f32(1 / scaled.scale)}px of the drawing. It is ` +
            "sampled in the part's own pixel grid, which is the drawing's, at each vertex's texel position over " +
            `that scale — so the sheet is ${scaled.width}x${scaled.height}, the size of the loose art, whatever the ` +
            'page holds. Resample the sheet, or point at the one that was made for this part.', 'CE_COMPILE_GREY_SHEET_SIZE_MISMATCH',
    );
  }
  // One channel, proved rather than assumed.
  const level = new Uint8Array(sheet.width * sheet.height);
  const cover = new Uint8Array(sheet.width * sheet.height);
  let opaqueEverywhere = true;
  for (let i = 0; i < level.length; i++) {
    const r = sheet.data[i * 4];
    const g = sheet.data[i * 4 + 1];
    const b = sheet.data[i * 4 + 2];
    if (r !== g || g !== b) {
      throw new CompileError(
        `${where}: the ${noun} "${image}" is not greyscale — pixel (${i % sheet.width}, ${Math.floor(i / sheet.width)}) ` +
          `is rgb(${r}, ${g}, ${b}). It is one channel; reading red out of a colour file would use whatever that ` +
          'channel happened to hold.', 'CE_COMPILE_GREY_SHEET_NOT_GREYSCALE',
      );
    }
    level[i] = r;
    const a = sheet.data[i * 4 + 3];
    cover[i] = a;
    if (a !== 255) opaqueEverywhere = false;
  }
  return { map: { width: sheet.width, height: sheet.height, level }, cover, opaqueEverywhere };
}

/**
 * Read a soft-region mask and turn it into mesh weights on a second bone.
 *
 * ⭐ The level IS the weight — black still, white carried — sampled at each
 * vertex with the same bilinear the depth map uses, so a painted falloff
 * reaches the mesh as a painted falloff. The remainder always stays on the slot
 * bone, so every vertex closes at 1 by construction rather than by A20 catching
 * it later.
 *
 * 🚨 This was a DEPTH THRESHOLD for one day and that was wrong: softness and
 * prominence are different properties, the most prominent thing on a face is
 * the nose, and a nose does not wobble. See `RigSoftRegion` for the whole of
 * that correction.
 */
function softRegionWeights(
  spec: RigSoftRegion,
  points: ReadonlyArray<readonly [number, number]>,
  grid: SheetGrid,
  where: string,
  ctx: AttachmentContext,
): { weights: MeshVertexWeight[][]; levels: number[]; bone: string; mask: string; digest: string; carried: number; ramped: number } {
  const { bone } = spec;
  if (typeof bone !== 'string' || bone.length === 0) {
    throw new CompileError(`${where}: the "soft" block has no "bone"; it is the bone the soft region is carried by`, 'CE_COMPILE_SOFT_BONE_MISSING');
  }
  if (!ctx.bones.some((b) => b.name === bone)) {
    throw new CompileError(
      `${where}: "soft" names bone "${bone}", which this rig does not declare. rigc binds a region to a bone that ` +
        'already exists rather than creating one — a bone a physics constraint has to target is part of the ' +
        'skeleton, not a side effect of a mesh.', 'CE_COMPILE_SOFT_BONE_UNKNOWN',
    );
  }
  if (bone === ctx.anchorBone) {
    throw new CompileError(
      `${where}: "soft" names "${bone}", which is this slot's own bone. Carrying the region with the bone the rest ` +
        'of the mesh is already pinned to moves nothing — a soft region needs a bone that can move independently, ' +
        'which is what a physics constraint is put on.', 'CE_COMPILE_SOFT_BONE_IS_ANCHOR',
    );
  }
  const { map: sheet } = readGreySheet(spec.mask, 'soft', grid, where, ctx);
  // Read at the drawing's position on a `scale:` page, as the depth map is (issue #762).
  const [toSheetX, toSheetY] = sheetRatio(grid);
  let carried = 0;
  let ramped = 0;
  const levels: number[] = [];
  const weights = points.map(([x, y]) => {
    const w = sampleLevel(sheet, x * toSheetX, y * toSheetY) / 255;
    levels.push(w);
    if (w >= 1) carried++;
    else if (w > 0) ramped++;
    if (w <= 0) return [{ bone: 'anchor', weight: 1 }] as MeshVertexWeight[];
    if (w >= 1) return [{ bone: 'control', control: 0, weight: 1 }] as MeshVertexWeight[];
    return [
      { bone: 'anchor', weight: 1 - w },
      { bone: 'control', control: 0, weight: w },
    ] as MeshVertexWeight[];
  });
  if (carried === 0 && ramped === 0) {
    throw new CompileError(
      `${where}: the soft mask "${spec.mask}" carries no vertex of this mesh — every one of its ${points.length} ` +
        'vertices samples black. A region that moves nothing is a physics constraint with nothing on the end of it; ' +
        'check that the mask is painted where the mesh actually is, and that it is white where the art is soft.', 'CE_COMPILE_SOFT_MASK_INERT',
    );
  }
  return { weights, levels, bone, mask: spec.mask, digest: depthDigest(sheet), carried, ramped };
}

/**
 * Build a `grid` mesh: a lattice over the part window, at stated positions.
 *
 * It shares `contour`'s placement and weighting exactly — the window is the
 * PNG's own size, the mesh is centred on its slot bone, and every vertex is
 * pinned to that bone at weight 1 — and differs only in where the vertices go.
 * The two are kept as separate functions rather than one with a branch because
 * what they measure is different: a contour asks the art where its edge is and
 * reports how well it covered it, and a grid asks nothing of the art at all.
 *
 * ⭐ Why this exists at all: the lattice was being written BY HAND. The worked
 * portrait shipped 25 vertex pairs, 32 triangles and a perimeter numbered in
 * the one order the loader accepts — all of it a person's arithmetic, on the
 * one topology whose correctness is least visible. A hand-numbered hull that
 * lists an interior vertex first loads, draws and deforms wrong.
 */
function buildGridAttachment(
  att: RigMeshAttachment,
  generator: Extract<NonNullable<RigMeshAttachment['generator']>, { kind: 'grid' }>,
  placeholder: string,
  where: string,
  ctx: AttachmentContext,
): ModelMeshAttachment {
  if (att.image === undefined) {
    throw new CompileError(
      `${where}: a "grid" generator lays its lattice over the part's own window, so the attachment needs an ` +
        '"image" — there is nothing else here that says how big that window is', 'CE_COMPILE_GRID_IMAGE_MISSING',
    );
  }
  const stated = generator.us !== undefined || generator.vs !== undefined;
  const even = generator.cols !== undefined || generator.rows !== undefined;
  if (stated && even) {
    throw new CompileError(
      `${where}: the "grid" generator states both positions ("us"/"vs") and a count ("cols"/"rows"). They are two ` +
        'answers to where the columns go, and a spec carrying both leaves a reader unable to say which one built ' +
        'the mesh. Drop one — positions are the more precise of the two.', 'CE_COMPILE_GRID_POSITIONS_AND_COUNT',
    );
  }
  if (!stated && !even) {
    throw new CompileError(
      `${where}: the "grid" generator says neither where its columns go ("us"/"vs", fractions of the window) nor ` +
        'how many there are ("cols"/"rows"). A lattice is not a default.', 'CE_COMPILE_GRID_POSITION_AND_COUNT_MISSING',
    );
  }
  const spread = (n: unknown, name: string): number[] => {
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 2) {
      throw new CompileError(`${where}: "${name}" is ${JSON.stringify(n)}; it is a whole number of at least 2`, 'CE_COMPILE_GRID_COUNT_INVALID');
    }
    // An even division spans the whole window. A lattice that should sit inside
    // it states its own positions — which is what `us`/`vs` are for.
    return Array.from({ length: n }, (_, i) => i / (n - 1));
  };
  const us = stated ? generator.us : spread(generator.cols, 'cols');
  const vs = stated ? generator.vs : spread(generator.rows, 'rows');
  if (us === undefined || vs === undefined) {
    throw new CompileError(
      `${where}: the "grid" generator states ${us === undefined ? '"vs"' : '"us"'} and not ` +
        `${us === undefined ? '"us"' : '"vs"'}; a lattice needs both axes`, 'CE_COMPILE_GRID_AXIS_MISSING',
    );
  }

  const img = atlasedImage(att.image, where, ctx);
  const plate = partPlate(img);

  let geometry;
  try {
    geometry = buildGridMesh({ size: [plate.width, plate.height], us, vs });
  } catch (err) {
    if (err instanceof MeshError) throw new CompileError(`${where}: ${err.message}`, 'CE_COMPILE_GRID_GENERATOR_INVALID');
    throw err;
  }

  const w = img.width;
  const h = img.height;
  const toArt = w / plate.width;
  if (att.width !== undefined && att.width !== w) {
    throw new CompileError(`${where}: the spec says width ${att.width} and "${att.image}" measures ${w}`, 'CE_COMPILE_GENERATED_IMAGE_WIDTH_MISMATCH');
  }
  if (att.height !== undefined && att.height !== h) {
    throw new CompileError(`${where}: the spec says height ${att.height} and "${att.image}" measures ${h}`, 'CE_COMPILE_GENERATED_IMAGE_HEIGHT_MISMATCH');
  }
  const anchor = ctx.transforms.get(ctx.anchorBone);
  const frame = ctx.exactFrames.get(ctx.anchorBone);
  if (!anchor || !frame) throw new CompileError(`${where}: slot bone "${ctx.anchorBone}" has no setup transform`, 'CE_COMPILE_SLOT_SETUP_TRANSFORM_MISSING');
  if (!ctx.bones.some((b) => b.name === ctx.anchorBone)) {
    throw new CompileError(`${where}: slot bone "${ctx.anchorBone}" is not in the rig's bone list`, 'CE_COMPILE_SLOT_BONE_NOT_DECLARED');
  }
  // Sampled BEFORE the encode, because `bind` rewrites the weights the encode
  // then writes out.
  const depth =
    generator.depth === undefined
      ? undefined
      :
        sampleMeshDepth(
          generator.depth,
          'grid',
          geometry.points,
          geometry.triangles,
          (px, py) => toBoneLocal(frame, frame.worldX + px * toArt - w / 2, frame.worldY + h / 2 - py * toArt),
          // The lattice's geometry takes nothing off the texels — its window is
          // the plate's size, which is the atlas's own `offsets` — so a page
          // whose file is not its declared size costs a grid only this one
          // count, and the count is what is withheld (issue #750).
          img.pageGrid === undefined ? plateAlpha(plate) : { unlocated: img.pageGrid.said },
          sheetGridOf(img, plate),
          where,
          ctx,
        );
  const bound =
    generator.soft === undefined
      ? undefined
      : softRegionWeights(generator.soft, geometry.points, sheetGridOf(img, plate), where, ctx);
  if (bound) geometry = { ...geometry, weights: bound.weights };
  const vertices = bindWeightedVertices(
    geometry,
    (px, py) => [anchor.worldX + px * toArt - w / 2, anchor.worldY + h / 2 - py * toArt],
    {
      anchor: { name: ctx.anchorBone, toBind: (wx, wy) => toBoneLocal(anchor, wx, wy) },
      controls: bound ? [meshBoneRef(bound.bone, where, ctx)] : [],
    },
  );
  ctx.meshBones.add(ctx.anchorBone);
  if (bound) ctx.meshBones.add(bound.bone);
  if (depth !== undefined) ctx.depths.set(`${ctx.skinName}/${ctx.slotName}/${placeholder}`, depth.z);
  if (bound) ctx.softMasks.set(`${ctx.skinName}/${ctx.slotName}/${placeholder}`, { mask: bound.mask, levels: bound.levels });
  ctx.meshes.push({
    slot: ctx.slotName,
    kind: 'grid',
    attachments: [placeholder],
    vertices: geometry.uvs.length / 2,
    triangles: geometry.triangles.length / 3,
    bones: bound ? [ctx.anchorBone, bound.bone] : [ctx.anchorBone],
    depth: depth?.summary,
    soft:
      bound === undefined
        ? undefined
        : { mask: bound.mask, digest: bound.digest, bone: bound.bone, carried: bound.carried, ramped: bound.ramped },
  });
  const out: ModelMeshAttachment = {
    kind: 'mesh',
    ...meshTextureKeys(att, placeholder),
    uvs: geometry.uvs.map(f32),
    triangles: geometry.triangles,
    vertices: bindingsOnF32(vertices),
    ...generatedHullAndEdges(geometry, where),
    width: f32(w),
    height: f32(h),
  };
  return out;
}

/**
 * Defaults for the `segments` generator's optional parameters, stated once.
 *
 * `power`, `maxBones` and `minWeight` are the constants the algorithm was
 * ported with, and `alpha` is `contour`'s own. `cell` and `falloff.radius` have
 * none: both are lengths on this part's art, and a length rigc chose would be a
 * judgement about a drawing it has not been told anything about.
 */
const SEGMENTS_DEFAULTS = { power: 2, maxBones: 4, minWeight: 0.03, alpha: 1 } as const;

/** The smallest share a `minWeight` may keep: one step of the 6-decimal grid weights are written on. */
const SEGMENTS_WEIGHT_STEP = 0.000001;

/** `[x, y]` as two finite numbers, or null. */
function finitePair(v: unknown): [number, number] | null {
  return Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number' && Number.isFinite(n))
    ? [v[0] as number, v[1] as number]
    : null;
}

/** The `falloff` block's four numbers, each refused by name when it cannot be one. */
function segmentsFalloffOf(f: RigSegmentsFalloff, where: string): SegmentsFalloff {
  if (typeof f.radius !== 'number' || !Number.isFinite(f.radius) || !(f.radius > 0)) {
    throw new CompileError(
      `${where}: "falloff.radius" is ${JSON.stringify(f.radius)}; it is added to every distance before the power is ` +
        "taken, a positive number of the part's pixels — at 0 a vertex on a segment would carry an infinite pull", 'CE_COMPILE_SEGMENTS_FALLOFF_RADIUS_INVALID',
    );
  }
  const power = f.power ?? SEGMENTS_DEFAULTS.power;
  if (typeof power !== 'number' || !Number.isFinite(power) || !(power > 0)) {
    throw new CompileError(
      `${where}: "falloff.power" is ${JSON.stringify(power)}; it is the exponent a pull falls off with distance by, ` +
        'a positive number — at 0 or below the far segment pulls as hard as the near one, or harder', 'CE_COMPILE_SEGMENTS_FALLOFF_POWER_INVALID',
    );
  }
  const maxBones = f.maxBones ?? SEGMENTS_DEFAULTS.maxBones;
  if (typeof maxBones !== 'number' || !Number.isInteger(maxBones) || maxBones < 1) {
    throw new CompileError(
      `${where}: "falloff.maxBones" is ${JSON.stringify(maxBones)}; it is how many bones may pull one vertex, a ` +
        'whole number of at least 1', 'CE_COMPILE_SEGMENTS_FALLOFF_MAX_BONES_INVALID',
    );
  }
  const minWeight = f.minWeight ?? SEGMENTS_DEFAULTS.minWeight;
  if (typeof minWeight !== 'number' || !Number.isFinite(minWeight) || minWeight < SEGMENTS_WEIGHT_STEP || minWeight >= 1) {
    throw new CompileError(
      `${where}: "falloff.minWeight" is ${JSON.stringify(minWeight)}; it is the share under which a bone's pull ` +
        `is dropped, so it lies in ${SEGMENTS_WEIGHT_STEP}..1 with 1 excluded — at 1 or above every share is dropped, ` +
        `and under ${SEGMENTS_WEIGHT_STEP}, one step of the 6-decimal grid weights are written on, a kept binding ` +
        'could be written as 0', 'CE_COMPILE_SEGMENTS_FALLOFF_MIN_WEIGHT_INVALID',
    );
  }
  return { power, radius: f.radius, maxBones, minWeight };
}

/**
 * The `influence` block's four fields (issue #1415), each refused by name: none
 * has a default, because the reach and the cap are judgements about this
 * cloth and the shape decides how a link enters a vertex's blend. Stated
 * beside `falloff` it is refused too — the two are two models of one share.
 */
function segmentsInfluenceOf(
  generator: Extract<NonNullable<RigMeshAttachment['generator']>, { kind: 'segments' }>,
  where: string,
): SegmentsInfluence {
  const spec: unknown = generator.influence;
  if (generator.falloff !== undefined) {
    throw new CompileError(
      `${where}: the "segments" generator states both "falloff" and "influence". Both turn a distance into a ` +
        'share — "falloff" as 1 / (d + radius)^power over every segment, "influence" as a pull that reaches zero at ' +
        'its "radius" — and a mesh is weighted by one of them: remove the other', 'CE_COMPILE_SEGMENTS_WEIGHT_MODE_CONFLICT',
    );
  }
  if (typeof spec !== 'object' || spec === null || Array.isArray(spec)) {
    throw new CompileError(
      `${where}: "influence" is ${JSON.stringify(spec)}; it is { "radius", "across", "max", "shape" }, every one required`, 'CE_COMPILE_SEGMENTS_INFLUENCE_INVALID',
    );
  }
  const i = spec as Partial<Record<keyof SegmentsInfluence, unknown>>;
  if (typeof i.radius !== 'number' || !Number.isFinite(i.radius) || !(i.radius > 0)) {
    throw new CompileError(
      `${where}: "influence.radius" is ${JSON.stringify(i.radius) ?? 'absent'}; it is how far a link reaches, in ` +
        "the part's pixels, a positive number with no default — a length on this art: a link whose segment is that " +
        'far from a vertex or farther never pulls it', 'CE_COMPILE_SEGMENTS_INFLUENCE_RADIUS_INVALID',
    );
  }
  if (typeof i.across !== 'boolean') {
    throw new CompileError(
      `${where}: "influence.across" is ${JSON.stringify(i.across) ?? 'absent'}; it is true (every link within ` +
        '"radius" pulls, across the entries of "bones") or false (only the links of the entry nearest the vertex), ' +
        "with no default — whether a chain may pull its neighbour's cloth is the decision this field is", 'CE_COMPILE_SEGMENTS_INFLUENCE_ACROSS_INVALID',
    );
  }
  if (typeof i.max !== 'number' || !Number.isInteger(i.max) || i.max < 1) {
    throw new CompileError(
      `${where}: "influence.max" is ${JSON.stringify(i.max) ?? 'absent'}; it is how many links may pull one vertex, ` +
        'the strongest kept, a whole number of at least 1 with no default', 'CE_COMPILE_SEGMENTS_INFLUENCE_MAX_INVALID',
    );
  }
  const shape = RIG_INFLUENCE_SHAPES.find((name) => name === i.shape);
  if (shape === undefined) {
    throw new CompileError(
      `${where}: "influence.shape" is ${JSON.stringify(i.shape) ?? 'absent'}; one of ` +
        `${RIG_INFLUENCE_SHAPES.map((name) => JSON.stringify(name)).join(', ')} — how a pull falls from 1 on a link ` +
        'to 0 at "radius", with no default: "linear" is 1 - d/radius, "smooth" arrives at both ends with zero slope', 'CE_COMPILE_SEGMENTS_INFLUENCE_SHAPE_INVALID',
    );
  }
  return { radius: i.radius, across: i.across, max: i.max, shape };
}

/**
 * Build a `segments` mesh: a lattice over the part's alpha, weighted by distance
 * to the bone segments `bones` names.
 *
 * ⭐ `bones` is the one decision the author makes, and everything else is read
 * off something already in front of the compiler: the lattice off the image's
 * alpha, each segment off the skeleton's setup pose (a bone's origin, the next
 * chain link's origin, a bone's `length` tip) or off the two points a span
 * states, and every weight off the distance between a vertex and those
 * segments. No segment is invented — a bone with no `length` and no next link
 * has an origin and no segment, and is refused by name.
 *
 * The placement is the one every generator on this route uses — the slot bone
 * at the window's centre — unless `anchor` says where in the part's pixels the
 * slot bone sits, which is what a part drawn somewhere other than centred on
 * its bone needs, because unlike a pinned generator this one's weights depend
 * on where the art is relative to the bones.
 */
function buildSegmentsAttachment(
  att: RigMeshAttachment,
  generator: Extract<NonNullable<RigMeshAttachment['generator']>, { kind: 'segments' }>,
  placeholder: string,
  where: string,
  ctx: AttachmentContext,
): ModelMeshAttachment {
  if (att.image === undefined) {
    throw new CompileError(
      `${where}: a "segments" generator lays its lattice over the part's own alpha, so the attachment needs an ` +
        '"image" — there is nothing else here that says which pixels are art', 'CE_COMPILE_SEGMENTS_IMAGE_MISSING',
    );
  }
  const img = atlasedImage(att.image, where, ctx);
  if (img.pageGrid !== undefined) {
    throw new CompileError(
      `${where}: a "segments" generator lays its lattice over the part's own alpha, and "${att.image}" is lifted ` +
        'off a packed page at the coordinates the atlas states, which on this file are not where its texels are — ' +
        `so there is no art here to cover, only another part of the page. ${img.pageGrid.sentence}`, 'CE_COMPILE_SEGMENTS_ATLAS_GRID_UNSUPPORTED',
    );
  }
  if (img.atlasScale !== undefined) {
    throw new CompileError(
      `${where}: a "segments" generator measures its "cell" and its falloff "radius" in the part's pixels, and ` +
        `"${att.image}" sits on a page that declares scale: ${img.atlasScale}, where a pixel of the drawing is not a ` +
        'texel of the page. This generator does not convert between the two; build it from the loose part, or ' +
        'from a pack at scale 1', 'CE_COMPILE_SEGMENTS_ATLAS_SCALE_UNSUPPORTED',
    );
  }

  // -- the influence (issue #1415), or else the falloff ----------------------
  const influence = generator.influence === undefined ? null : segmentsInfluenceOf(generator, where);
  const falloffSpec: unknown = generator.falloff;
  if (influence === null && (typeof falloffSpec !== 'object' || falloffSpec === null || Array.isArray(falloffSpec))) {
    throw new CompileError(
      `${where}: the "segments" generator states no "falloff" block. Its "radius" — added to every distance, in ` +
        "the part's pixels — has no default, because it is a length on this art: " +
        '"falloff": { "radius": <pixels> } is the least it takes (or an "influence" block, whose pull reaches zero ' +
        'at its own "radius")', 'CE_COMPILE_SEGMENTS_WEIGHT_MODE_MISSING',
    );
  }
  const falloff = influence === null ? segmentsFalloffOf(generator.falloff!, where) : null;
  const threshold = generator.alpha ?? SEGMENTS_DEFAULTS.alpha;

  // -- the lattice -----------------------------------------------------------
  const plate = partPlate(img);
  let lattice;
  try {
    lattice = buildSegmentsLattice({
      mask: { width: plate.width, height: plate.height, alpha: plateAlpha(plate) },
      threshold,
      cell: generator.cell,
    });
  } catch (err) {
    if (err instanceof MeshError) throw new CompileError(`${where}: ${err.message}`, 'CE_COMPILE_SEGMENTS_LATTICE_INVALID');
    throw err;
  }
  const w = img.width;
  const h = img.height;
  if (att.width !== undefined && att.width !== w) {
    throw new CompileError(`${where}: the spec says width ${att.width} and "${att.image}" measures ${w}`, 'CE_COMPILE_GENERATED_IMAGE_WIDTH_MISMATCH');
  }
  if (att.height !== undefined && att.height !== h) {
    throw new CompileError(`${where}: the spec says height ${att.height} and "${att.image}" measures ${h}`, 'CE_COMPILE_GENERATED_IMAGE_HEIGHT_MISMATCH');
  }

  // -- the placement ---------------------------------------------------------
  const slotBone = ctx.transforms.get(ctx.anchorBone);
  // The exact frame (issue #1021) is what the segments and the vertices are
  // MEASURED in — distances, falloff, `minWeight`, the shared-origin refusal —
  // and the runtime's is what the vertices are BOUND through (`place`).
  const exactSlotBone = ctx.exactFrames.get(ctx.anchorBone);
  if (!slotBone || !exactSlotBone) throw new CompileError(`${where}: slot bone "${ctx.anchorBone}" has no setup transform`, 'CE_COMPILE_SLOT_SETUP_TRANSFORM_MISSING');
  let anchorAt: [number, number] = [w / 2, h / 2];
  if (generator.anchor !== undefined) {
    const stated = finitePair(generator.anchor);
    if (stated === null) {
      throw new CompileError(
        `${where}: "anchor" is ${JSON.stringify(generator.anchor)}; it is where the slot bone sits in the part's ` +
          'pixels, y down, as [x, y] — two finite numbers', 'CE_COMPILE_SEGMENTS_ANCHOR_INVALID',
      );
    }
    anchorAt = stated;
  }
  const [ax, ay] = anchorAt;
  const placeIn = (bone: BoneTransform) => (px: number, py: number): [number, number] => [
    bone.worldX + (px - ax),
    bone.worldY + (cropToSpineY(py, h) - cropToSpineY(ay, h)),
  ];
  const place = placeIn(slotBone);
  const measuredAt = placeIn(exactSlotBone);

  // -- the segments ----------------------------------------------------------
  if (!Array.isArray(generator.bones) || generator.bones.length === 0) {
    throw new CompileError(
      `${where}: the "segments" generator names no bones. "bones" is the one decision this generator takes — which ` +
        'segments may pull the part — so it lists at least one: a bone name, a chain as a list of bone names, or ' +
        '{ "bone", "from", "to" }', 'CE_COMPILE_SEGMENTS_BONES_EMPTY',
    );
  }
  const parentOf = new Map(ctx.bones.map((b) => [b.name, b.parent ?? null]));
  const named: string[] = [];
  const refs: MeshBoneRef[] = [];
  const segments: EntrySegment[] = [];
  const boneOf = (name: unknown, at: string): { index: number; transform: BoneTransform } => {
    if (typeof name !== 'string' || !parentOf.has(name)) {
      throw new CompileError(`${where}: ${at} names mesh bone ${JSON.stringify(name)}, which is not in the rig's bone list`, 'CE_COMPILE_SEGMENTS_BONE_UNKNOWN');
    }
    let index = named.indexOf(name);
    if (index < 0) {
      index = named.length;
      named.push(name);
      refs.push(meshBoneRef(name, where, ctx));
    }
    return { index, transform: ctx.exactFrames.get(name)! };
  };
  const tipOf = (name: string, transform: BoneTransform, at: string, chained: boolean): [number, number] => {
    const length = ctx.bones.find((b) => b.name === name)?.length ?? 0;
    if (!(length > 0)) {
      throw new CompileError(
        `${where}: ${at} names bone "${name}", which has no "length"${chained ? ' and is the last link of its chain' : ''}, ` +
          'so it has an origin and no segment. Give the bone a "length" (its segment runs from its origin to that ' +
          'tip, along its setup rotation), ' +
          (chained ? 'end the chain on a bone that has one, ' : 'name it inside a chain whose next link says where it ends, ') +
          'or state the segment outright as { "bone", "from", "to" }', 'CE_COMPILE_SEGMENTS_BONE_LENGTH_MISSING',
      );
    }
    return toWorld(transform, length, 0);
  };
  generator.bones.forEach((entry: unknown, i: number) => {
    const at = `"bones"[${i}]`;
    if (typeof entry === 'string') {
      const { index, transform } = boneOf(entry, at);
      segments.push({ bone: index, entry: i, a: [transform.worldX, transform.worldY], b: tipOf(entry, transform, at, false) });
      return;
    }
    if (Array.isArray(entry)) {
      if (entry.length === 0) {
        throw new CompileError(`${where}: ${at} is an empty chain; a chain lists its bones root first, at least one`, 'CE_COMPILE_SEGMENTS_CHAIN_EMPTY');
      }
      const links = entry.map((name: unknown, k: number) => ({ name, ...boneOf(name, `${at}[${k}]`) }));
      links.forEach((link, k) => {
        const name = link.name as string;
        const origin: [number, number] = [link.transform.worldX, link.transform.worldY];
        if (k === links.length - 1) {
          segments.push({ bone: link.index, entry: i, a: origin, b: tipOf(name, link.transform, `${at}[${k}]`, true) });
          return;
        }
        const next = links[k + 1];
        const nextName = next.name as string;
        let cursor = parentOf.get(nextName) ?? null;
        while (cursor !== null && cursor !== name) cursor = parentOf.get(cursor) ?? null;
        if (cursor === null) {
          throw new CompileError(
            `${where}: ${at} chains "${name}" to "${nextName}", and "${nextName}" is not under "${name}" in the bone ` +
              `tree — a chain runs down the skeleton, each link a descendant of the one before it. List the chain ` +
              'root first, or name the two bones as separate entries', 'CE_COMPILE_SEGMENTS_CHAIN_ORDER_INVALID',
          );
        }
        const b: [number, number] = [next.transform.worldX, next.transform.worldY];
        if (b[0] === origin[0] && b[1] === origin[1]) {
          throw new CompileError(
            `${where}: ${at} chains "${name}" to "${nextName}", and the two bones share their setup origin ` +
              `(${origin[0]}, ${origin[1]}), so the link has no length and no direction to weight along. Give ` +
              `"${nextName}" its own position, or name "${name}" alone with a "length"`, 'CE_COMPILE_SEGMENTS_CHAIN_ZERO_LENGTH',
          );
        }
        segments.push({ bone: link.index, entry: i, a: origin, b });
      });
      return;
    }
    if (typeof entry === 'object' && entry !== null) {
      const span = entry as { bone?: unknown; from?: unknown; to?: unknown };
      const { index } = boneOf(span.bone, `${at}.bone`);
      const from = finitePair(span.from);
      const to = finitePair(span.to);
      if (from === null || to === null) {
        throw new CompileError(
          `${where}: ${at} states a segment whose ${from === null ? '"from"' : '"to"'} is ` +
            `${JSON.stringify(from === null ? span.from : span.to)}; both ends are [x, y] in the part's pixels, y down`, 'CE_COMPILE_SEGMENTS_ENDPOINT_INVALID',
        );
      }
      segments.push({ bone: index, entry: i, a: measuredAt(from[0], from[1]), b: measuredAt(to[0], to[1]) });
      return;
    }
    throw new CompileError(
      `${where}: ${at} is ${JSON.stringify(entry)}; an entry is a bone name, a chain as a list of bone names, or ` +
        '{ "bone", "from", "to" }', 'CE_COMPILE_SEGMENTS_ENTRY_INVALID',
    );
  });

  // -- the weights -----------------------------------------------------------
  let capped = 0;
  let widest = 0;
  const weights: MeshVertexWeight[][] = lattice.points.map(([px, py], v) => {
    if (influence !== null) {
      const reached = influenceShares(measuredAt(px, py), segments, influence);
      if ('weights' in reached) {
        if (reached.inReach > influence.max) capped++;
        widest = Math.max(widest, reached.inReach);
        return reached.weights;
      }
      throw new CompileError(
        `${where}: vertex ${v}, at (${px}, ${py}) in the part's pixels, is reached by no link — the nearest is ` +
          `"${named[reached.nearest.bone]}" at ${reached.nearest.distance.toFixed(4)}, and "influence.radius" is ` +
          `${influence.radius}${influence.across ? '' : ' (with "across": false, the nearest entry\'s links only)'}. ` +
          'A vertex needs a link, and rigc will not hand it one the reach does not: raise "radius" over that distance, ' +
          'or name a segment nearer this part of the art', 'CE_COMPILE_SEGMENTS_VERTEX_UNREACHED',
      );
    }
    const got = segmentShares(measuredAt(px, py), segments, falloff!);
    if ('weights' in got) return got.weights;
    const { maxBones, minWeight } = falloff!;
    throw new CompileError(
      `${where}: vertex ${v}, at (${px}, ${py}) in the part's pixels, keeps no bone — the ${got.dropped.length} ` +
        `strongest pull(s) share it as ${got.dropped.map((d) => `"${named[d.bone]}" ${d.share.toFixed(4)}`).join(', ')}, ` +
        `and every one is under "minWeight" ${minWeight}. A vertex needs a bone, and rigc will not pick one the ` +
        `falloff dropped: lower "minWeight" to ${(1 / maxBones).toFixed(4)} or under (1 / "maxBones", which the ` +
        'strongest share can never fall below), or name a segment nearer this part of the art', 'CE_COMPILE_SEGMENTS_VERTEX_WEIGHTS_DROPPED',
    );
  });
  const geometry: MeshGeometry = {
    kind: 'segments',
    points: lattice.points,
    uvs: lattice.uvs,
    triangles: lattice.triangles,
    weights,
    hullVertices: lattice.hullVertices,
  };
  const vertices = bindWeightedVertices(geometry, place, {
    anchor: meshBoneRef(ctx.anchorBone, where, ctx),
    controls: refs,
  });

  // -- the report ------------------------------------------------------------
  let maxInfluence = 0;
  let totalInfluence = 0;
  let singleBone = 0;
  const bound = new Set<number>();
  for (const vertex of weights) {
    maxInfluence = Math.max(maxInfluence, vertex.length);
    totalInfluence += vertex.length;
    if (vertex.length === 1) singleBone++;
    for (const e of vertex) bound.add(e.control ?? 0);
  }
  const fit = measureAuthoredMeshFit(
    { width: plate.width, height: plate.height, alpha: plateAlpha(plate) },
    threshold,
    lattice.points,
    lattice.triangles,
  );
  ctx.meshBones.add(ctx.anchorBone);
  for (const k of [...bound].sort((a, b) => a - b)) ctx.meshBones.add(named[k]);
  ctx.meshes.push({
    slot: ctx.slotName,
    kind: 'segments',
    attachments: [placeholder],
    vertices: lattice.points.length,
    triangles: lattice.triangles.length / 3,
    bones: [...named],
    coverage: f32(fit.coverage),
    overshoot: fit.overshoot,
    influence: {
      maxBones: maxInfluence,
      meanBones: f32(totalInfluence / weights.length),
      singleBone,
      bound: named.filter((_, k) => bound.has(k)),
      cell: generator.cell,
      cols: lattice.report.cols,
      rows: lattice.report.rows,
      artCells: lattice.report.artCells,
      keptCells: lattice.report.keptCells,
      islands: lattice.report.islands,
      ...(influence === null ? {} : { reach: { ...influence, capped, widest } }),
    },
  });
  return {
    kind: 'mesh',
    ...meshTextureKeys(att, placeholder),
    uvs: geometry.uvs.map(f32),
    triangles: geometry.triangles,
    vertices: bindingsOnF32(vertices),
    ...generatedHullAndEdges(geometry, where),
    width: f32(w),
    height: f32(h),
  };
}

/** Defaults for the `contour` generator's optional parameters, stated once. */
const CONTOUR_DEFAULTS = { margin: 1, maxVertices: 64, alpha: 1 } as const;

/**
 * Build a `contour` mesh: measure the attachment's own PNG, trace it, mesh it.
 *
 * ## Why this branch does not share the one above
 *
 * A `ring` or a `ribbon` takes its window size from the spec and its authority
 * from control bones. A contour takes both from the art: the size is the PNG's
 * own (so there is no number to disagree with the pixels), and there are no
 * control bones at all, because every vertex is pinned to the slot bone —
 * `buildContourMesh`'s header says why that is the whole weighting model.
 *
 * ⚠️ It reads PIXELS, which nothing else in this compiler does. `src/png.ts`
 * deliberately stops at the header, so the decode comes from
 * [`tools/plate.ts`](../tools/plate.ts) — the same codec `render` and `check`
 * already sample pages with, so "what alpha does this file have" has one answer
 * in this repository rather than two.
 *
 * The placement is the one the generator path documents: no manifest means no
 * crop to flip against, so the part window is centred on its own slot bone —
 * which is also what puts an undeformed contour mesh exactly where the plain
 * region attachment would have drawn it.
 */
function buildContourAttachment(
  att: RigMeshAttachment,
  generator: Extract<NonNullable<RigMeshAttachment['generator']>, { kind: 'contour' }>,
  placeholder: string,
  where: string,
  ctx: AttachmentContext,
): ModelMeshAttachment {
  if (att.image === undefined) {
    throw new CompileError(
      `${where}: a "contour" generator traces the part's own alpha, so the attachment needs an "image" — ` +
        'there is nothing else here that says which pixels to measure', 'CE_COMPILE_CONTOUR_IMAGE_MISSING',
    );
  }
  const img = atlasedImage(att.image, where, ctx);
  // 🔒 **A trace needs the part's texels, and on a page that is not its
  // declared size the lift does not have them** (issue #750). `extractRegion`
  // addresses the page at the coordinates the atlas states; on a file of any
  // other size those are a different part of the picture — measured on a
  // half-resolution pack, the lift came back with no pixel above alpha 0 and
  // the build refused with "there is no silhouette to trace", a true sentence
  // about the wrong texels. Unlike an authored mesh's fit, which is a
  // measurement and is withheld, this outline IS the geometry: there is no mesh
  // to build without it, and the compiler invents none. So it is refused, with
  // `A06`'s own sentence, which names the ratio and the repair — on `build`
  // this refusal arrives before the gate, where `A06` would have said it.
  if (img.pageGrid !== undefined) {
    throw new CompileError(
      `${where}: a "contour" generator traces the part's own alpha, and "${att.image}" is lifted off a packed ` +
        'page at the coordinates the atlas states, which on this file are not where its texels are — so there is ' +
        `no silhouette here to trace, only another part of the page. ${img.pageGrid.sentence}`, 'CE_COMPILE_CONTOUR_ATLAS_GRID_UNSUPPORTED',
    );
  }
  // ⚠️ Nothing here reads the PNG's colour type. `hasAlpha` answers "where does
  // this file keep its alpha", not "is any pixel of it transparent" — a tRNS
  // chunk is real transparency (issue #215) and an all-255 alpha channel is
  // none — so "this part has no silhouette to trace" is a question about pixels,
  // and `buildContourMesh` refuses it by counting them.
  const plate = partPlate(img);
  const alpha = plateAlpha(plate);

  const margin = generator.margin ?? CONTOUR_DEFAULTS.margin;
  const maxVertices = generator.maxVertices ?? CONTOUR_DEFAULTS.maxVertices;
  const threshold = generator.alpha ?? CONTOUR_DEFAULTS.alpha;
  let geometry;
  try {
    geometry = buildContourMesh({
      mask: { width: plate.width, height: plate.height, alpha },
      threshold,
      tolerance: generator.tolerance,
      margin,
      maxVertices,
      // The spec's two distances are the drawing's pixels; on a `scale:` page
      // the trace runs on texels, and the STATED scale is what converts them
      // (issue #779). Off one, `atlasScale` is absent and nothing is multiplied.
      ...(img.atlasScale === undefined ? {} : { pageScale: img.atlasScale }),
    });
  } catch (err) {
    if (err instanceof MeshError) throw new CompileError(`${where}: ${err.message}`, 'CE_COMPILE_CONTOUR_GENERATOR_INVALID');
    throw err;
  }

  // Two grids, and they are the same one except on an imported page that
  // declares a `scale:`. The trace happens on the pixels that exist — the
  // plate's — and the mapping into world units below is the DRAWING's, which is
  // what `img.width/height` are (`resolveFromAtlas`). Keeping them apart is what
  // stops a contour mesh and a plain region attachment of the same imported art
  // from landing in different units (#267); on the loose path and on any pack at
  // `scale: 1` the two are equal and `toArt` is 1, so nothing moves.
  const w = img.width;
  const h = img.height;
  const toArt = w / plate.width;
  if (att.width !== undefined && att.width !== w) {
    throw new CompileError(`${where}: the spec says width ${att.width} and "${att.image}" measures ${w}`, 'CE_COMPILE_GENERATED_IMAGE_WIDTH_MISMATCH');
  }
  if (att.height !== undefined && att.height !== h) {
    throw new CompileError(`${where}: the spec says height ${att.height} and "${att.image}" measures ${h}`, 'CE_COMPILE_GENERATED_IMAGE_HEIGHT_MISMATCH');
  }
  const anchor = ctx.transforms.get(ctx.anchorBone);
  const frame = ctx.exactFrames.get(ctx.anchorBone);
  if (!anchor || !frame) throw new CompileError(`${where}: slot bone "${ctx.anchorBone}" has no setup transform`, 'CE_COMPILE_SLOT_SETUP_TRANSFORM_MISSING');
  if (!ctx.bones.some((b) => b.name === ctx.anchorBone)) {
    throw new CompileError(`${where}: slot bone "${ctx.anchorBone}" is not in the rig's bone list`, 'CE_COMPILE_SLOT_BONE_NOT_DECLARED');
  }
  const vertices = bindWeightedVertices(
    geometry,
    (px, py) => [anchor.worldX + px * toArt - w / 2, anchor.worldY + h / 2 - py * toArt],
    { anchor: { name: ctx.anchorBone, toBind: (wx, wy) => toBoneLocal(anchor, wx, wy) }, controls: [] },
  );
  ctx.meshBones.add(ctx.anchorBone);
  // The vertices are on the TRACED grid — the plate's — and the depth map is
  // read at the same point of the drawing, which on a `scale:` page is that
  // position over the stated scale (`sheetRatio`, issue #762). `toArt` scales
  // positions into world units afterwards and does not touch `z`, which
  // carries its own stated scale.
  const depth =
    generator.depth === undefined
      ? undefined
      :
        sampleMeshDepth(
          generator.depth,
          'contour',
          geometry.points,
          geometry.triangles,
          (px, py) => toBoneLocal(frame, frame.worldX + px * toArt - w / 2, frame.worldY + h / 2 - py * toArt),
          alpha,
          sheetGridOf(img, plate),
          where,
          ctx,
        );
  if (depth !== undefined) ctx.depths.set(`${ctx.skinName}/${ctx.slotName}/${placeholder}`, depth.z);
  ctx.meshes.push({
    slot: ctx.slotName,
    kind: 'contour',
    attachments: [placeholder],
    vertices: geometry.uvs.length / 2,
    triangles: geometry.triangles.length / 3,
    bones: [ctx.anchorBone],
    coverage: geometry.contour?.coverage,
    // In the drawing's pixels, like the authored fit's (issue #762). The trace
    // runs on the plate's grid with the spec's margin and tolerance converted
    // onto it by the stated scale (issue #779), and its refusals state both.
    ...(geometry.contour === undefined ? {} : drawingOvershoot(geometry.contour.overshoot, img.atlasScale)),
    holePixels: geometry.contour?.holePixels,
    depth: depth?.summary,
  });
  // Same rule a region attachment follows: the atlas region is the PNG's
  // basename, so a placeholder named anything else needs `path` written down or
  // the loader resolves nothing. Stated once in `attachmentPath` since #577 —
  // this comment used to be the rule's only statement, beside four emit sites
  // that disagreed with it — and spread right after `type` by
  // `meshTextureKeys` since #791.
  const out: ModelMeshAttachment = {
    kind: 'mesh',
    ...meshTextureKeys(att, placeholder),
    uvs: geometry.uvs.map(f32),
    triangles: geometry.triangles,
    vertices: bindingsOnF32(vertices),
    ...generatedHullAndEdges(geometry, where),
    width: f32(w),
    height: f32(h),
  };
  return out;
}

// ---------------------------------------------------------------------------
// rig-declared constraints
// ---------------------------------------------------------------------------

/** The rig-constraint shape as this file consumes it: a name, a type, and fields. */
type RigConstraintInput = { name: string; type: string } & Record<string, unknown>;

/** The six property names a transform constraint may map between (`:241`, `:521`). */
const TRANSFORM_PROPERTIES = ['rotate', 'x', 'y', 'scaleX', 'scaleY', 'shearY'];

/**
 * How far past a boundary an end of a `rotate` slider's driving range may sit
 * before the refusal below fires, in degrees.
 *
 * ⭐ **Outward at both ends**, which is the whole reason it is named: 0° and 360°
 * are the two values an author of a face axis or a full-circle dial actually aims
 * at, and `from − to / scale` is three authored numbers and a division, so an
 * intended 0° can arrive as `-1e-13` and an intended 360° as `360.0000000001`.
 * The slack exists so arithmetic noise around either aim is not a refusal.
 *
 * Nothing is tuned. The failure it separates from is gross: a wrapped reading
 * moves the applied time by `360 · scale`.
 */
const SLIDER_WRAP_SLACK = 1e-6;

/** What a constraint's names resolve against. */
interface ConstraintContext {
  boneNames: Set<string>;
  slotNames: Set<string>;
  /** slot -> the skins whose table gives that slot a path attachment. */
  pathSlots: Map<string, string[]>;
  /** Animations the motion spec declares — a slider names one of them. */
  animationNames: Set<string>;
  /**
   * The duration each of those declares, which is what turns a slider's
   * `from`/`to`/`scale` into the range of driving values that can reach a frame.
   * Only the slider's 360° refusal reads it.
   */
  animationDurations: Map<string, number>;
}

/**
 * 4.3 puts every constraint in one array and branches on `type`. An entry whose
 * type matches no case is dropped with no error and no `default:` branch, so an
 * unimplemented type is refused here by name rather than emitted and lost.
 */
function buildRigConstraint(spec: RigConstraintInput, ctx: ConstraintContext): ModelConstraint {
  const where = `rig constraint "${spec.name}"`;
  const boneNames = ctx.boneNames;
  const needBone = (name: unknown, field: string): string => {
    if (typeof name !== 'string' || !boneNames.has(name)) {
      throw new CompileError(`${where}: ${field} names ${JSON.stringify(name)}, which the rig does not declare as a bone`, 'CE_COMPILE_CONSTRAINT_BONE_UNKNOWN');
    }
    return name;
  };
  /**
   * One of the enum names the parser's `Utils.enumValue` can resolve.
   *
   * The rule is exactly `enumValue`'s own: only the first letter's case is free,
   * because that is the single character it normalises. Anything else resolves to
   * `undefined` and is assigned without a word, and the constraint then runs a
   * mode nobody chose — see `RIG_PATH_POSITION_MODES`.
   */
  const needEnum = (value: unknown, field: string, allowed: readonly string[]): string => {
    if (typeof value !== 'string' || !allowed.includes(value.charAt(0).toUpperCase() + value.slice(1))) {
      throw new CompileError(
        `${where}: ${field} is ${JSON.stringify(value)}; known: ${allowed.join(', ')} (only the first letter's case is ` +
          "free — the parser's enumValue uppercases that one character and nothing else, and an unresolved name " +
          'becomes undefined without an error)', 'CE_COMPILE_CONSTRAINT_ENUM_UNKNOWN',
      );
    }
    return value;
  };
  const needNumber = (value: unknown, field: string): number => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new CompileError(`${where}: ${field} is ${JSON.stringify(value)}, which is not a finite number`, 'CE_COMPILE_CONSTRAINT_NUMBER_NONFINITE');
    }
    return value;
  };
  // The constraint's fields under their spec names; `made` puts the kind the
  // branch has established and the name on them. `name, type` first and each
  // kind's field order are the emitter's (`emitConstraint`).
  const out: Record<string, unknown> = {};
  const made = (kind: ModelConstraintKind): ModelConstraint => ({ kind, name: spec.name, declaredIn: 'rig', ...out });
  const copy = (fields: readonly string[]) => {
    for (const field of fields) {
      const v = spec[field];
      if (v !== undefined) out[field] = typeof v === 'number' ? f32(v) : v;
    }
  };
  const boneList = (): string[] => {
    const list = spec.bones;
    if (!Array.isArray(list) || list.length === 0) {
      throw new CompileError(`${where}: a ${spec.type} constraint needs a non-empty "bones" array`, 'CE_COMPILE_CONSTRAINT_BONES_EMPTY');
    }
    return list.map((name, i) => needBone(name, `bones[${i}]`));
  };

  if (spec.type === 'ik') {
    out.bones = boneList();
    out.target = needBone(spec.target, 'target');
    // `scaleY` is the `ScaleYMode` enum, not a number or a flag: the parser runs
    // it through `Utils.enumValue` (`:150`), which resolves an unknown name to
    // `undefined` and assigns it without a word. Out of `copy` for that reason —
    // see `RIG_SCALE_Y_MODES`.
    if (spec.scaleY !== undefined) out.scaleY = needEnum(spec.scaleY, 'scaleY', RIG_SCALE_Y_MODES);
    copy(['mix', 'softness', 'bendPositive', 'compress', 'stretch', 'skin']);
    return made('ik');
  }
  if (spec.type === 'transform') {
    out.bones = boneList();
    out.source = needBone(spec.source, 'source');
    const properties = spec.properties as Record<string, { to?: Record<string, unknown> }> | undefined;
    for (const [from, entry] of Object.entries(properties ?? {})) {
      // The parser THROWS on a name outside the six, which is one of the few
      // places in this format that does not fail silently — but it throws at load
      // time, in the consumer's process, and that is late.
      if (!TRANSFORM_PROPERTIES.includes(from)) {
        throw new CompileError(`${where}: properties has "${from}"; known: ${TRANSFORM_PROPERTIES.join(', ')}`, 'CE_COMPILE_TRANSFORM_PROPERTY_UNKNOWN');
      }
      for (const to of Object.keys(entry?.to ?? {})) {
        if (!TRANSFORM_PROPERTIES.includes(to)) {
          throw new CompileError(`${where}: properties.${from}.to has "${to}"; known: ${TRANSFORM_PROPERTIES.join(', ')}`, 'CE_COMPILE_TRANSFORM_TO_PROPERTY_UNKNOWN');
        }
      }
    }
    if (properties !== undefined) out.properties = properties;
    copy([
      'localSource',
      'localTarget',
      'additive',
      'clamp',
      'rotation',
      'x',
      'y',
      'scaleX',
      'scaleY',
      'shearY',
      'mixRotate',
      'mixX',
      'mixY',
      'mixScaleX',
      'mixScaleY',
      'mixShearY',
      'skin',
    ]);
    return made('transform');
  }
  if (spec.type === 'path') {
    out.bones = boneList();
    // The parser throws `Couldn't find slot X for path constraint Y` on a miss —
    // loud, but in the consumer's process. The silent half is the one below it.
    const slot = spec.slot;
    if (typeof slot !== 'string' || !ctx.slotNames.has(slot)) {
      throw new CompileError(`${where}: slot names ${JSON.stringify(slot)}, which the rig does not declare as a slot`, 'CE_COMPILE_CONSTRAINT_SLOT_UNKNOWN');
    }
    if (!ctx.pathSlots.has(slot)) {
      // `PathConstraint.update` opens with
      // `if (!(attachment instanceof PathAttachment)) return`, so a constraint
      // aimed at a slot that never shows a path does nothing whatsoever — no
      // error, no warning, and every mix in the file still says it is on.
      throw new CompileError(
        `${where}: slot "${slot}" has no path attachment in any skin, so the constraint has no curve to follow — ` +
          'PathConstraint.update returns immediately unless the slot\'s attachment is a path, which means this ' +
          'constraint would load, report every mix it was given, and move nothing. ' +
          'Give that slot an attachment with "type": "path".', 'CE_COMPILE_PATH_CONSTRAINT_SLOT_NO_PATH',
      );
    }
    out.slot = slot;
    for (const [field, allowed] of [
      ['positionMode', RIG_PATH_POSITION_MODES],
      ['spacingMode', RIG_PATH_SPACING_MODES],
      ['rotateMode', RIG_PATH_ROTATE_MODES],
    ] as const) {
      if (spec[field] !== undefined) out[field] = needEnum(spec[field], field, allowed);
    }
    for (const field of ['rotation', 'position', 'spacing', 'mixRotate', 'mixX', 'mixY'] as const) {
      if (spec[field] !== undefined) out[field] = f32(needNumber(spec[field], field));
    }
    copy(['skin']);
    return made('path');
  }
  if (spec.type === 'slider') {
    // ⭐ The one field in a rig spec that points at the MOTION spec. It is
    // resolved in a second pass over the constraints array once the animations
    // are read (`:495-507`) and a miss throws `Slider animation not found`, so
    // the refusal here is what turns that into a message naming both files.
    const animation = spec.animation;
    if (typeof animation !== 'string' || animation.length === 0) {
      throw new CompileError(
        `${where}: a slider needs an "animation" — the animation it applies. Without one the parser's second pass ` +
          'over the constraints array throws `Slider animation not found`.', 'CE_COMPILE_SLIDER_ANIMATION_MISSING',
      );
    }
    if (!ctx.animationNames.has(animation)) {
      const known = [...ctx.animationNames];
      throw new CompileError(
        `${where}: applies animation "${animation}", which the motion spec does not declare` +
          (known.length ? ` (it declares: ${known.join(', ')})` : ' (it declares none at all)'), 'CE_COMPILE_SLIDER_ANIMATION_UNKNOWN',
      );
    }
    // 🔁 The editor keeps a slider's animation by index and re-sorts the object
    // the file lists array-index names first in (issue #1040, measured).
    const repointed = sliderAnimationTheEditorRepoints(animation, [...ctx.animationNames]);
    if (repointed !== null) {
      const spelled = repointed.indexNames.map((name) => `"${name}"`).join(', ');
      throw new CompileError(
        `${where}: applies animation "${animation}", which the Spine file lists at index ${repointed.fileIndex} of ` +
          `its animations and the Spine editor sorts to index ${repointed.editorIndex} — so an editor import ` +
          `repoints this slider to "${repointed.becomes}", in a file that still parses and gates green. A JSON object ` +
          `lists every array-index key (${spelled} here) before the rest, the editor re-sorts the animations into its ` +
          'own order on import, and a slider holds its animation by index (measured on Spine 4.3.26; AUTHORING R10). ' +
          `Rename ${spelled} so no animation name is a plain non-negative integer — a prefix or a leading zero ` +
          `("a${repointed.indexNames[0]}", "0${repointed.indexNames[0]}") puts the file's order and the editor's in step.`, 'CE_COMPILE_SLIDER_ANIMATION_EDITOR_ORDER',
      );
    }
    out.animation = animation;
    for (const field of ['additive', 'loop'] as const) {
      if (spec[field] !== undefined) out[field] = spec[field];
    }
    if (spec.mix !== undefined) out.mix = f32(needNumber(spec.mix, 'mix'));
    // `bone` is the switch between the two models, so the fields of the model
    // that was NOT chosen are refused rather than emitted: the parser reads
    // `time` only in the `else` branch and the property fields only in the `if`,
    // so the losing half is data no runtime will ever look at.
    const timeSide = ['time'] as const;
    const boneSide = ['property', 'from', 'to', 'scale', 'max', 'local'] as const;
    if (spec.bone !== undefined) {
      out.bone = needBone(spec.bone, 'bone');
      const property = spec.property;
      if (typeof property !== 'string' || !RIG_FROM_PROPERTIES.includes(property as (typeof RIG_FROM_PROPERTIES)[number])) {
        throw new CompileError(
          `${where}: drives off bone "${String(spec.bone)}" but its property is ${JSON.stringify(property)}; ` +
            `known: ${RIG_FROM_PROPERTIES.join(', ')} (the parser throws on anything else)`, 'CE_COMPILE_SLIDER_BONE_PROPERTY_UNKNOWN',
        );
      }
      out.property = property;
      for (const field of ['from', 'to', 'scale', 'max'] as const) {
        if (spec[field] !== undefined) out[field] = f32(needNumber(spec[field], field));
      }
      if (spec.local !== undefined) out.local = spec.local;
      if (spec.scale !== undefined && spec.scale === 0) {
        // time = to + (value - from) * 0, so the slider holds one frame forever.
        throw new CompileError(`${where}: scale is 0, so the bone's property cannot move the slider's time at all`, 'CE_COMPILE_SLIDER_SCALE_ZERO');
      }
      // The window of driving values that can reach a frame at all, and the two
      // functions every figure in the two reader clauses below comes off.
      //
      // ⭐ **One copy, read by both readers** (issue #657). The circle owned
      // this arithmetic while it was the only reader with a bound; the world
      // `scale` readers have a floor at 0 and the same mapping carries them
      // there, so the second clause reads these numbers instead of computing its
      // own. That is the rule this clause has already paid for twice — #417
      // tested one end because its fixture only left the circle at that end, and
      // #431 wrapped by one subtraction because every fixture sat within a turn
      // — and a second copy with a sign edited is exactly the shape both took.
      const fromValue = spec.from === undefined ? 0 : needNumber(spec.from, 'from');
      const toTime = spec.to === undefined ? 0 : needNumber(spec.to, 'to');
      const perUnit = spec.scale === undefined ? 1 : needNumber(spec.scale, 'scale');
      const duration = ctx.animationDurations.get(animation) ?? 0;
      /** The driving value that maps to the animation's first frame, and to its last. */
      const atStart = fromValue - toTime / perUnit;
      const atEnd = fromValue + (duration - toTime) / perUnit;
      const lowest = Math.min(atStart, atEnd);
      const highest = Math.max(atStart, atEnd);
      /**
       * The time this mapping puts a driving value at, before the runtime
       * touches it — the one arithmetic every figure below comes off.
       *
       * ⚠️ **Computed, not asserted** (issue #423). The circle's clause used to
       * end *"— outside the animation's Ds. With `loop`: false that is
       * `Math.max(0, time)` holding the last frame; with `loop`: true it wraps
       * to some other frame"*, which states a consequence rather than measuring
       * one — and is flatly false for a range spanning a full turn, where the
       * wrapped reading lands INSIDE the animation. It also printed both loop
       * modes and left the reader to pick. A message that hedges is a message
       * that has not measured.
       */
      const timeAt = (value: number): number => toTime + (value - fromValue) * perUnit;
      /** That time clamped into the animation — the frame a pose actually holds. */
      const intoFrame = (time: number): number => Math.min(Math.max(time, 0), duration);
      // ⚠️ `local: false` reads the bone's WORLD rotation, and `FromRotate.value`
      // (`TransformConstraintData.js`) ends
      //
      //   let value = Math.atan2(source.c / sy, source.a / sx) * radDeg + …;
      //   if (value < 0) value += 360;
      //
      // `Math.atan2` returns `(-180, 180]` and the `offsets` a slider hands that
      // reader are `Slider.offsets`, a private all-zero array — so **`[0, 360)`
      // is the whole of what it can ever produce**. A driving value outside that
      // is one the runtime never returns: it arrives 360° away, and
      // `time = to + (value - from) * scale` then lands far outside the
      // animation. A yaw axis with its neutral at 0° — the natural way to author
      // a face — therefore has its entire negative half pinned to one frame, and
      // nothing anywhere says so (issue #402).
      //
      // ⭐ Refused here rather than documented, and rather than left to the gate,
      // for three reasons. The failure is invisible AND total, so a note in a
      // guide is read after the loss rather than before it. The fix is one field
      // in the rig spec, which is the file this message can name — an artifact
      // -side assertion would have to name the emitted `local`/`offset` fields the
      // author never typed. And the arithmetic that proves it needs the
      // animation's declared DURATION, which is a motion-spec fact the compiler
      // has in front of it: the range of driving values that can reach a frame is
      // exactly `[to, to + duration]` mapped back through `scale`.
      //
      // ⚠️ **Both ends, out of one piece of arithmetic** (issue #417). As #405
      // landed it, `highest` was computed and never tested, so a range running
      // PAST 360° — `"from": 300, "scale": 0.005` over a 1 s animation asks for
      // 300°..500° — compiled clean with everything above 360° just as dead: turn
      // the bone to 500° and its world rotation is 140°, read as 140°, mapped to
      // a time nowhere near the one the author meant. A copy-pasted second branch
      // with a sign edited is how such a pair drifts apart, so the two ends share
      // `dead` below and every number in the message comes off it.
      //
      // ⭐ **And the line is PAST 360°, not at it** — measured before it was
      // written, because the two are one degree of arc apart and only one of them
      // costs an author anything. A range ending exactly on 360° misses exactly
      // one value, its own supremum, and that value is not a dial position: a
      // bone at 360° IS a bone at 0°, reads within 5.3e-6° of it and poses the
      // skeleton identically. Swept through spine-core over 0°..360° at 0.1°, a
      // `from: 0, scale: 0.0025` dial on a 0.9 s animation lands every reading
      // within **1.7e-8 s** of the time the mapping asks for, and on `loop: true`
      // the endpoint is not even distinct — the circle closes on 0.900000 s
      // exactly. Above 360° the dead set has width instead: 300°..500° reaches
      // only 0.000 s..0.2995 s of its own 1 s animation, and the dial positions
      // an author would set for the top 140° of it are read as something else and
      // land on a wrong frame. That silent wrong answer is the hazard, and it
      // starts strictly above 360.
      //
      // The refusal is deliberately narrow: `rotate` only, because `FromRotate` is
      // the one property whose reader wraps, and only when the range actually
      // runs outside `[0, 360]`, because a dial inside that circle — 20°..340°,
      // or the whole turn 0°..360° — is how you write this axis under
      // `local: false` and it works.
      if (property === 'rotate' && spec.local !== true) {
        // Which end of the circle the range leaves. One record, so the end, its
        // reading, the time it lands on and the two clauses that name the side
        // are derived once rather than twice.
        //
        // The two tests ARE each other's mirror, and that is deliberate: each
        // gives its own boundary — 0° and 360°, the two values an author aims at
        // — the same outward slack, so only a range that genuinely leaves the
        // closed circle `[0, 360]` is refused.
        const dead =
          lowest < -SLIDER_WRAP_SLACK
            ? {
                end: lowest,
                side: 'below 0°',
                repair: 'move the range so it does not cross 0°',
              }
            : highest > 360 + SLIDER_WRAP_SLACK
              ? {
                  end: highest,
                  side: 'past 360°',
                  repair: 'move the range so it does not run past 360°',
                }
              : null;
        if (dead !== null) {
          /**
           * What `FromRotate.value` actually returns for a bone at that end: a
           * MODULO, not one subtraction (issue #431).
           *
           * 🚨 `lowest + 360` / `highest - 360` is right only while the range
           * stays within one turn of the circle, which every fixture in this
           * tree happened to be. Further out it printed a number the reader
           * cannot return, inside a refusal whose entire subject is which
           * readings the reader CAN return: `from: -500, scale: 0.005` over a
           * 1 s animation said *"the bone at -500.000° is read as -140.000° and
           * maps to time 1.800s"*, and -140° is not in `[0, 360)` at all. Both
           * figures in that sentence were wrong. Measured through spine-core,
           * a bone parked at -500° drives `Slider.appliedPose.time` to
           * 3.600000s — the same six decimals a bone parked at 220° drives it
           * to — so the reading is 220° and the time is 3.600s.
           *
           * ⭐ Derived off `dead.end` rather than inside the two branches, so
           * the wrap is written ONCE. That is what #424 collapsed the two ends
           * into one record for, and a second copy of `% 360` with a sign
           * edited is how the pair drifts apart again.
           *
           * ⚠️ The consequence clause below does NOT go through here and does
           * not need to: `reachLo`/`reachHi` intersect the driving window with
           * `[0, 360)` directly, which is the same set however many turns out
           * the window sits. Swept through spine-core at 0.1° over the whole
           * circle on both a beyond-a-turn low range (-500°..-300°) and a
           * beyond-`+720°` high one (100°..900°), the held fraction and the
           * frame the held arc pins to are the ones this clause names — 100.0%
           * at 1.000s and 27.8% at 0.000s — and the runtime's own applied time
           * tracks the closed form to 3.3e-8s.
           */
          const readAs = ((dead.end % 360) + 360) % 360;
          const lands = timeAt(readAs);
          // `[0, 360)` is the whole of what `FromRotate.value` returns (issue
          // #417), so the readings that reach the animation at all are that
          // circle met with the driving window `lowest`..`highest` the range
          // clause above already prints. A second derivation beside these two
          // numbers is exactly how a pair drifts, which is why #417 collapsed
          // the two ends into one `dead` record in the first place.
          const reachLo = Math.max(0, lowest);
          const reachHi = Math.min(360, highest);
          const reaches = reachLo <= reachHi;
          const reachA = intoFrame(timeAt(reachLo));
          const reachB = intoFrame(timeAt(reachHi));
          const span = `${Math.min(reachA, reachB).toFixed(3)}s..${Math.max(reachA, reachB).toFixed(3)}s`;
          // ⭐ Exactly ONE arc of the circle is ever left over, and that is what
          // lets the message name one bound and one frame instead of a set: the
          // refusal means `[lowest, highest]` already runs off one end of
          // `[0, 360)`, so the part of the circle outside it is a single run.
          // (Both ends outside means the whole circle reaches — `dead` is 0° wide
          // — and neither end outside is not a refusal at all.)
          const dark = reaches ? 360 - (reachHi - reachLo) : 360;
          const heldAt = intoFrame(timeAt(reachLo > 0 ? 0 : 360));
          const arc = !reaches
            ? 'every reading'
            : reachLo > 0
              ? `every reading below ${reachLo.toFixed(3)}°`
              : `every reading above ${reachHi.toFixed(3)}°`;
          /**
           * How much of the range is a bone position no reader ever returns:
           * the WIDTH of `[lowest, highest]` lying outside `[0, 360]` (issue
           * #434).
           *
           * 🚨 `-lowest` / `highest - 360` is the distance from the boundary to
           * the FAR end, and that equals the dead width only while the range
           * STRADDLES the boundary. A range lying wholly outside had the gap
           * between the boundary and its NEAR end counted too: `400°..500°` —
           * inside one turn and reachable today — was told `140.000°` of it is
           * dead, wider than the 100° range itself, and `-500°..-300°` was told
           * `500.000°` against a true 200°. Clamping the near end to the
           * boundary is the whole of the fix, and it moves ONLY the ranges that
           * lie wholly outside: measured, a range straddling either boundary, a
           * range ending exactly on one, and a range hanging off both at once
           * all print what they printed before. `PS45` is the two that move and
           * `PS46` is the four that must not.
           *
           * ⭐ **Third instance of one shape in this clause.** #417 tested one
           * end of the range because its fixture only ever left the circle at
           * that end; #431 wrapped by a single subtraction because every
           * fixture sat within one turn; this measured to the far end because
           * `PS42` — the only control that reads this string — straddles 360°,
           * where the two arithmetics agree to the bit. Every time, a
           * computation right about the case its fixture happened to be and
           * silent about the case beside it, with no second fixture standing
           * anywhere else to say so.
           *
           * ⭐ Why it read as a measurement rather than as a bug: the wrong
           * figure is always a number ALREADY IN THE SENTENCE. Past 360°,
           * `highest - 360` reproduces `readAs` — `400°..500°` printed the same
           * `140.000°` twice, once as the reading and once as a width. Below 0°,
           * `-lowest` reproduces `dead.end` with its sign dropped.
           *
           * ⚠️ Each term stays BEHIND the test that says its side is the one
           * that crossed, and those guards are load-bearing rather than tidy —
           * measured, not argued. Drop `lowest < 0` and the low term on
           * `400°..500°` is `Math.min(0, 500) - 400 = -400`, a negative
           * contribution to a width: the refusal prints `-300.000°`, and
           * `300°..500°` and `100°..900°` move to `-160.000°` and `440.000°`.
           * Drop `highest > 360` and `-340°..-305°` prints `-630.000°`. Neither
           * is a width, and a width is what the sentence says it is.
           */
          const outside =
            (lowest < 0 ? Math.min(0, highest) - lowest : 0) + (highest > 360 ? highest - Math.max(360, lowest) : 0);
          // ⚠️ WHICH consequence the runtime produces is the slider's own `loop`,
          // read rather than guessed: `Slider.js:63-66` is
          // `p.time = duration + (p.time % duration)` when it is true and
          // `Math.max(0, p.time)` when it is false, so a reading held on one
          // frame under the second is replayed from elsewhere under the first and
          // nothing is dead in time at all. Swept through spine-core at 0.1° over
          // the whole circle before this was written, both ways.
          const consequence =
            spec.loop === true
              ? `Nothing is held: "loop": true wraps the time as \`duration + (time % duration)\`, so the ` +
                `${outside.toFixed(3)}° of the range ${dead.side} selects nothing a reading inside the circle does ` +
                'not already select.'
              : !reaches
                ? `This dial reaches none of the animation's ${duration}s — the whole circle is held on the frame at ` +
                  `${heldAt.toFixed(3)}s.`
                : dark === 0
                  ? `This dial reaches only ${span} of the animation's ${duration}s, and no reading of the circle ` +
                    'reaches the rest of it.'
                  : `This dial reaches only ${span} of the animation's ${duration}s, and ` +
                    `${((dark / 360) * 100).toFixed(1)}% of the circle — ${arc} — is held on the frame at ` +
                    `${heldAt.toFixed(3)}s.`;
          throw new CompileError(
            `${where}: drives off bone "${String(spec.bone)}" rotate with "local": false, and the driving values ` +
              `that reach animation "${animation}" (0s..${duration}s) run from ${lowest.toFixed(3)}° to ${highest.toFixed(3)}°. ` +
              'A world rotation is read through `FromRotate.value`, which ends `if (value < 0) value += 360`, so the bone ' +
              `at ${dead.end.toFixed(3)}° is read as ${readAs.toFixed(3)}° and maps to time ${lands.toFixed(3)}s. ` +
              `${consequence} The whole part of the range ${dead.side} is dead and ` +
              'nothing at runtime reports it. Add `"local": true` to read the bone\'s own rotation signed and unwrapped — ' +
              `that is the form a face axis wants — or ${dead.repair}.`, 'CE_COMPILE_SLIDER_WORLD_ROTATION_DEAD_RANGE',
          );
        }
      }
      // ⚠️ `local: false` reads the bone's WORLD scale, and `FromScaleX.value`
      // / `FromScaleY.value` (`TransformConstraintData.js`) are
      //
      //   const a = source.a / skeleton.scaleX, c = source.c / skeleton.scaleY;
      //   return Math.sqrt(a * a + c * c) + offsets[TransformConstraintData.SCALEX];
      //
      // — a MAGNITUDE. The driven field is in both terms, so the reading is
      // `|value|` and `[0, ∞)` is the whole of what that reader can return. The
      // floor is REACHED rather than approached (a bone whose own scale, or
      // whose parent's, is 0 reads exactly 0), which is why a range whose bottom
      // is exactly 0 stays legal and only one that dips below it is refused.
      //
      // 🚨 **Below the floor the axis does not go dead, it FOLDS** (issue #657),
      // and that is why this is a second clause rather than the circle with
      // another property name in it. A reading the range cannot reach is one
      // frame pinned; a reading it reaches TWICE is two dial positions posing
      // the same face, so the message has to name the mirror rather than a dead
      // arc. Measured through spine-core on `from: 0, to: 0.5, scale: 0.25` over
      // a 1 s animation — driving window −2..+2 — the applied time at −2.000,
      // −1.500, −1.000 and −0.500 is 1.000000s, 0.875000s, 0.750000s and
      // 0.625000s: the same six decimals the dial at +2.000, +1.500, +1.000 and
      // +0.500 applies, with the posed bone matching to the digit. The same rig
      // read `local: true` sweeps −2 → +2 monotonically from 0.000000s, which is
      // what makes that repair worth naming.
      //
      // ⭐ **No loop branch, and that is measured rather than economised.** The
      // circle's consequence turns on `Slider.loop` because a held frame is held
      // only under `Math.max(0, time)`; a fold is not a clamp, so `loop: true`
      // cannot undo it — the same ±1.500 pair applies 1.875000s either way.
      if ((property === 'scaleX' || property === 'scaleY') && spec.local !== true && lowest < -SLIDER_WRAP_SLACK) {
        /** What the reader returns for a bone parked at the bottom of the range: the magnitude. */
        const readAs = Math.abs(lowest);
        const lands = timeAt(readAs);
        // The readings that reach the animation are `[0, ∞)` met with the
        // driving window — the circle's `reachLo`/`reachHi` with the ceiling
        // taken out, off the same two numbers the message has already printed.
        const reaches = highest >= 0;
        /**
         * How much of the range lies below the floor: the WIDTH of
         * `[lowest, highest]` under 0, not the distance to its far end.
         *
         * 🚨 `-lowest` is that distance, and the two are equal only while the
         * range STRADDLES the floor — the same trap issue #434 paid for one
         * reader over, where a range lying wholly outside was told a width wider
         * than itself. A `-6..-2` window is 4.000 below the floor and `-lowest`
         * would print 6.000, which is `readAs` again with a different name on it.
         */
        const below = Math.min(0, highest) - lowest;
        // The arc an author writes twice: the part of the range above 0 that the
        // part below 0 mirrors onto. Both ends are inside `[lowest, highest]` —
        // 0 because the range straddles it and this is the `reaches` branch, the
        // top because it is `highest` or less — so both map INTO the animation
        // and neither needs clamping.
        const mirrorTop = Math.min(highest, -lowest);
        const mirrorA = timeAt(0);
        const mirrorB = timeAt(mirrorTop);
        const consequence = reaches
          ? `${below.toFixed(3)} of the range below 0 repeats 0.000..${mirrorTop.toFixed(3)}, which is ` +
            `${Math.min(mirrorA, mirrorB).toFixed(3)}s..${Math.max(mirrorA, mirrorB).toFixed(3)}s of the animation, in reverse.`
          : `the whole ${below.toFixed(3)} of this range is below 0, so it reaches none of the animation's ${duration}s — ` +
            `every value the reader can return maps past it and the pose holds the frame at ${intoFrame(timeAt(0)).toFixed(3)}s.`;
        throw new CompileError(
          `${where}: drives off bone "${String(spec.bone)}" ${property} with "local": false, and the driving values ` +
            `that reach animation "${animation}" (0s..${duration}s) run from ${lowest.toFixed(3)} to ${highest.toFixed(3)}. ` +
            `A world scale is read through \`From${property === 'scaleX' ? 'ScaleX' : 'ScaleY'}.value\` as ` +
            `\`Math.sqrt(${property === 'scaleX' ? 'a² + c²' : 'b² + d²'})\`, a magnitude, so the bone at ` +
            `${lowest.toFixed(3)} is read as ${readAs.toFixed(3)} and maps to time ${lands.toFixed(3)}s — the time the ` +
            `bone at ${readAs.toFixed(3)} maps to. Positions below 0 read as the mirror of positions above it: ` +
            `${consequence} Nothing at runtime reports it. Add \`"local": true\` to read the bone's own scale signed and ` +
            'unfolded — that is the form a squash axis wants — or move the range so it does not dip below 0.', 'CE_COMPILE_SLIDER_WORLD_SCALE_FOLDED',
        );
      }
      for (const field of timeSide) {
        if (spec[field] !== undefined) {
          throw new CompileError(
            `${where}: declares both a "bone" and "${field}". A slider with a bone takes its time from that bone's ` +
              `property; "${field}" is read only by the bone-less form (\`:361\`), so it would be dropped in silence.`, 'CE_COMPILE_SLIDER_BONELESS_FIELD_WITH_BONE',
          );
        }
      }
    } else {
      if (spec.time !== undefined) out.time = f32(needNumber(spec.time, 'time'));
      for (const field of boneSide) {
        if (spec[field] !== undefined) {
          throw new CompileError(
            `${where}: declares "${field}" but no "bone". Every one of ${boneSide.join('/')} is read only inside the ` +
              "parser's `if (boneName)` branch (`:350-360`), so it would be dropped in silence. Name the driving bone, " +
              'or key `slider.<name>.time` in the motion spec instead.', 'CE_COMPILE_SLIDER_BONE_FIELD_WITHOUT_BONE',
          );
        }
      }
    }
    copy(['skin']);
    return made('slider');
  }
  if (spec.type === 'physics') {
    out.bone = needBone(spec.bone, 'bone');
    // The same `ScaleYMode` enum an ik constraint carries, under the same key
    // and through the same silent `Utils.enumValue` (`:301`).
    if (spec.scaleY !== undefined) out.scaleY = needEnum(spec.scaleY, 'scaleY', RIG_SCALE_Y_MODES);
    copy([
      'x',
      'y',
      'rotate',
      'scaleX',
      'shearX',
      'limit',
      'fps',
      'inertia',
      'strength',
      'damping',
      'mass',
      'wind',
      'gravity',
      'mix',
      'inertiaGlobal',
      'strengthGlobal',
      'dampingGlobal',
      'massGlobal',
      'windGlobal',
      'gravityGlobal',
      'mixGlobal',
      'skin',
    ]);
    return made('physics');
  }
  // Every type 4.3 has is implemented, so this is now only reachable from a typo
  // — and a typo is exactly what the parser drops in silence (no `default:`
  // branch, `:148-367`), which is why the refusal stays.
  throw new NotImplementedError(
    `${where}: constraint type ${JSON.stringify(spec.type)} is not one Spine 4.3 knows. ` +
      'The five are: ik, transform, path, physics, slider. An unrecognised type matches no case in the parser and ' +
      'the constraint is dropped without a word.', 'CE_COMPILE_CONSTRAINT_TYPE_UNKNOWN',
  );
}

/**
 * Collect what the artifact cannot say about itself.
 *
 * Nothing in skeleton JSON records that a mesh is a ribbon, that a bone's
 * subtree is authored in axis space, or that one parentage is forbidden. Those
 * are rig facts, so the compiler hands them to the validator instead of letting
 * it guess — and a mutant stays honest because it edits the artifact while this
 * block keeps saying what the rig was supposed to be.
 */
function buildRigInfo(
  rig: RigSpec,
  bones: ModelBone[],
  meshes: CompileResult['meshes'],
  manifest: FaceManifest | null,
  images: CompiledImage[],
): RigInfo {
  const axisBone = rig.invariants?.axisBone ?? null;
  if (axisBone !== null && !bones.some((b) => b.name === axisBone)) {
    throw new CompileError(`rig "${rig.name}" names "${axisBone}" as its axis bone, which it does not declare`, 'CE_COMPILE_AXIS_BONE_UNKNOWN');
  }
  const axisSubtree: string[] = [];
  if (axisBone) {
    const parentOf = new Map(bones.map((b) => [b.name, b.parent ?? null]));
    for (const bone of bones) {
      for (let cursor: string | null = bone.name; cursor; cursor = parentOf.get(cursor) ?? null) {
        if (cursor !== axisBone) continue;
        axisSubtree.push(bone.name);
        break;
      }
    }
  }
  const meshKinds: RigInfo['meshKinds'] = {};
  for (const mesh of meshes) meshKinds[mesh.slot] = mesh.kind;
  const meshDeclaredBones: RigInfo['meshDeclaredBones'] = {};
  for (const mesh of meshes) meshDeclaredBones[mesh.slot] = mesh.bones;
  const meshSoftBones: RigInfo['meshSoftBones'] = {};
  for (const mesh of meshes) if (mesh.soft !== undefined) meshSoftBones[mesh.slot] = mesh.soft.bone;
  // A fold exemption on a slot that carries no mesh cannot exempt anything —
  // A39 reads triangles, and only a mesh has them. `parseRigSpec` already
  // refused a name that is not a SLOT; this is the second half, and it needs
  // the compiled meshes so it lives here rather than there.
  const deformMayFold = (rig.invariants?.deformMayFold ?? []).map((e) => e.slot);
  for (const slot of deformMayFold) {
    if (meshKinds[slot] === undefined) {
      throw new CompileError(
        `rig "${rig.name}" exempts slot "${slot}" from A39_DEFORM_KEEPS_TRIANGLE_WINDING, but that slot carries no ` +
          'mesh — winding is a property of triangles, so there is nothing there to exempt', 'CE_COMPILE_WINDING_EXEMPTION_NOT_MESH',
      );
    }
  }
  // Inward, in Spine world. Off-axis keys (the mass bone usually hangs outside
  // the axis subtree) have to be projected onto it before they can be compared
  // with travel along the axis.
  const spineDeg = manifest?.axis ? screenToSpineDegrees(manifest.axis.deg) : null;
  const inwardUnit: [number, number] | null =
    // Not quantised: a direction the checks below project onto, never emitted.
    spineDeg === null ? null : [Math.cos((spineDeg * Math.PI) / 180), Math.sin((spineDeg * Math.PI) / 180)];
  const contactDepth = manifest?.stroke?.contact_depth ?? null;
  if (contactDepth !== null && !(contactDepth > 0)) {
    throw new CompileError(`manifest stroke.contact_depth is ${contactDepth}; it must be a positive number of axis pixels`, 'CE_COMPILE_CONTACT_DEPTH_INVALID');
  }
  const capCeiling = manifest?.stroke?.cap_containment_ceiling ?? null;
  if (capCeiling !== null && !(capCeiling > 0)) {
    throw new CompileError(
      `manifest stroke.cap_containment_ceiling is ${capCeiling}; it must be a positive number of axis pixels (use null for "not measurable on this cut")`, 'CE_COMPILE_CONTAINMENT_CEILING_INVALID',
    );
  }
  return {
    archetype: rig.name,
    axisBone,
    axisSubtree,
    detached: (rig.invariants?.detached ?? []).map((d) => [d.bone, d.notUnder] as [string, string]),
    slotOrder: rig.slots.length ? rig.slots.map((s) => s.name) : null,
    meshKinds,
    meshDeclaredBones,
    meshSoftBones,
    deformMayFold,
    // `parseRigSpec` resolved every entry against the rig's own constraints.
    consumerDrivenMix: (rig.invariants?.consumerDrivenMix ?? []).map((e) => ({ type: e.type, constraint: e.constraint, why: e.why })),
    // `parseRigSpec` refused every shape but a non-blank `why`.
    idleDrivesMeshes: rig.invariants?.idleDrivesMeshes?.why ?? null,
    // `parseRigSpec` resolved every name and refused every shape (issue #1351).
    axes: (rig.invariants?.axes ?? []).map((e) => ({ name: e.name, through: [e.through[0], e.through[1]] as [string, string], bones: [...e.bones], tolerance: e.tolerance })),
    // `isBase` is set on the manifest route only; every other image says false.
    basePlates: images.filter((img) => img.isBase).map((img) => img.region),
    meshSlotBudget: rig.invariants?.meshSlots ?? null,
    meshTriangleBudget: rig.invariants?.meshTriangles ?? null,
    contactDepth,
    capContainmentCeiling: capCeiling,
    massBone: rig.invariants?.massBone ?? null,
    inwardUnit,
  };
}

/**
 * A manifest that disagrees with itself is the cheapest bug to catch and the
 * worst to debug three files later, so the axis unit vector is checked against
 * the axis angle before anything is built from either.
 */
function checkAxisSelfConsistency(manifest: FaceManifest): void {
  if (!manifest.axis) return;
  const { deg, unit } = manifest.axis;
  if (!Array.isArray(unit) || unit.length !== 2) {
    throw new CompileError(`manifest axis.unit must be [x, y], got ${JSON.stringify(unit)}`, 'CE_COMPILE_AXIS_UNIT_INVALID');
  }
  const ex = Math.cos((deg * Math.PI) / 180);
  const ey = Math.sin((deg * Math.PI) / 180);
  if (hypot2(unit[0] - ex, unit[1] - ey) > 1e-3) {
    throw new CompileError(
      `manifest axis.unit [${unit[0]}, ${unit[1]}] does not match axis.deg ${deg} (expected [${f32(ex)}, ${f32(ey)}])`, 'CE_COMPILE_AXIS_UNIT_DEG_MISMATCH',
    );
  }
}

/**
 * Place a rigid region on its bone.
 *
 * Two offsets are folded in here. The attachment is centred on the part window
 * rather than on the bone, because several slots may share one bone — a part and
 * its motion-blur variant, an occluder and what pools against it — while their
 * windows sit in different places. And the attachment's own `rotation` cancels
 * the bone's world rotation, because a plate is authored in screen space:
 * without it every slot hanging off a rotated axis bone would render tilted by
 * the cut's axis angle.
 *
 * On an unrotated bone sitting at its window centre both terms are zero, and the
 * emitter leaves a zero out, which is why a formation with no axis emits the
 * same bytes it always did.
 */
function placeRegion(
  part: FaceManifestPart,
  manifest: FaceManifest,
  bone: BoneTransform,
  img: CompiledImage,
): ModelRegionAttachment {
  const win = partWindow(part, manifest);
  // width/height are NOT optional: omitting them loads as NaN with no error.
  // The compiler fills them from the PNG.
  const [ax, ay] = toBoneLocal(bone, win.x + win.w / 2, cropToSpineY(win.y + win.h / 2, manifest.crop.h)).map(f32);
  const rotation = f32(normaliseDegrees(-bone.worldRotation));
  // All three held, 0 included: leaving a 0 out is the emitter's (`emitRegion`).
  return { kind: 'region', width: img.width, height: img.height, x: ax, y: ay, rotation, atlas: imageAtlasRect(img) };
}

/**
 * Build one mesh for a manifest part and encode its weighted vertices.
 *
 * Two generators, one call site. A `ring` pins its two outer rings and moves only
 * the aperture; a `ribbon` pins its entry row and lets the chain stretch the rest.
 * Which one a part gets is manifest data, not a guess — the compiler will not
 * infer a deformation model from a polygon's shape.
 */
function buildMesh(
  part: FaceManifestPart,
  manifest: FaceManifest,
  bones: ModelBone[],
  transforms: Map<string, BoneTransform>,
  /** The same bones in the exact frame (`computeExactFrameTransforms`): what the control angles are measured in. */
  exactFrames: Map<string, BoneTransform>,
  anchorName: string,
): { attachment: ModelMeshAttachment; kind: 'ring' | 'ribbon' } {
  const spec = part.mesh!;
  const kind = spec.kind ?? 'ring';
  const win = partWindow(part, manifest);
  const cropH = manifest.crop.h;
  const controls = meshControlBones(part);

  const refFor = (name: string): MeshBoneRef => {
    if (!bones.some((b) => b.name === name)) throw new CompileError(`internal: mesh bone "${name}" is not in the bone list`, 'CE_COMPILE_INTERNAL_MESH_BONE_UNKNOWN');
    const m = transforms.get(name);
    if (!m) throw new CompileError(`internal: no setup transform for mesh bone "${name}"`, 'CE_COMPILE_INTERNAL_MESH_BONE_TRANSFORM_MISSING');
    return { name, toBind: (wx, wy) => toBoneLocal(m, wx, wy) };
  };

  let geometry;
  try {
    if (kind === 'ribbon') {
      geometry = buildRibbonMesh({ size: [win.w, win.h], rows: spec.rows!, chainCount: controls.length });
    } else {
      const centre: [number, number] = [spec.center![0] - win.x, spec.center![1] - win.y];
      // Control bones enter the ring builder as ANGLES about the aperture, taken
      // from where the rig actually put them. The alternative — a per-bone angle
      // in the manifest — would let the declared angle drift away from the
      // declared position, and then the ring would deform toward a bone that is
      // somewhere else.
      //
      // The angle itself is `ringControlAngles`, shared with the rig-spec route
      // (issue #684). What stays here is this route's own conversion: a manifest
      // measures in crop pixels, y down, and Spine world is that crop flipped, so
      // `cropH - worldY` is the whole of it. `spec.center` is in the same crop
      // pixels, which is why the centre passed here is not the window-local
      // `centre` two lines up. The positions are read in the exact frame
      // (issue #1021): an angle is a statement about where the spec put the
      // bone, it orders the split and refuses a tie, and the runtime's last
      // bits turned an authored 90 into 89.99999734089101 in that refusal.
      const controlAngles = ringControlAngles(controls, spec.center!, (name) => {
        const m = exactFrames.get(name);
        if (!m) throw new CompileError(`internal: no setup transform for control bone "${name}"`, 'CE_COMPILE_INTERNAL_CONTROL_BONE_TRANSFORM_MISSING');
        return [m.worldX, cropH - m.worldY];
      });
      geometry = buildRingMesh({
        hull: (part.polygon ?? []).map(([x, y]) => [x - win.x, y - win.y] as [number, number]),
        center: centre,
        inner: spec.inner!,
        size: [win.w, win.h],
        bias: spec.bias ? { axis_deg: spec.bias.axis_deg, ramp: spec.bias.ramp } : undefined,
        controlAngles,
      });
    }
  } catch (err) {
    if (err instanceof MeshError) throw new CompileError(`slot "${part.slot}" mesh: ${err.message}`, 'CE_COMPILE_MANIFEST_RING_RIBBON_INVALID');
    throw err;
  }

  const vertices = bindWeightedVertices(
    geometry,
    (px, py) => [win.x + px, cropToSpineY(win.y + py, cropH)],
    { anchor: refFor(anchorName), controls: controls.map(refFor) },
  );

  return {
    // `kind` is what chose the builder above, so it is the claim; `geometry.kind`
    // is the wider `MeshKind`, which a strict tsc refuses here (and a dependant
    // with `strict: true` reads this file through `src/render.ts`).
    kind,
    attachment: {
      kind: 'mesh',
      uvs: geometry.uvs.map(f32),
      triangles: geometry.triangles,
      vertices: bindingsOnF32(vertices),
      ...generatedHullAndEdges(geometry, `slot "${part.slot}" mesh`),
      width: win.w,
      height: win.h,
    },
  };
}

/**
 * The raw-curve escape hatch: absolute (time, value) control points, verbatim.
 *
 * ⭐ Named easings stay the recommended path: a handle set with
 * a name is reusable, reviewable and retargetable, and it is what makes a motion
 * spec readable as intent rather than as numbers. But a named easing can only say
 * "the same shape, everywhere", and an editor export says a different shape per
 * key per channel — rung 3 of the benchmark ladder carries 54 bezier keys and no
 * two of them share handles. Refusing to express that would not make rigc's
 * output better; it would make rigc unable to state what Spine's format holds,
 * which is the same blocker as the bone tree being code, one layer down.
 *
 * So this is the escape hatch, and it is shaped like one: the numbers are the
 * file's own, checked for length and finiteness and passed through. What it is
 * NOT is a second way to write an easing — a key may carry `ease` or `curve`,
 * never both.
 *
 * ⚠️ These are ABSOLUTE (time, value) points, not the normalised graph-view
 * handles an editor shows. Writing the handles here would load without error and
 * produce a different curve, which is exactly the
 * trap `bezierForChannel` exists to keep authors out of.
 */
function rawCurve(curve: number[] | 'stepped', channels: number, where: string, at: string): number[] | 'stepped' {
  if (curve === 'stepped') return 'stepped';
  if (!Array.isArray(curve)) throw new CompileError(`${where} (t=${at}): curve must be an array or "stepped"`, 'CE_COMPILE_CURVE_NOT_ARRAY');
  if (curve.length !== channels * 4) {
    // A short array multiplies `undefined` into the cubic and yields NaN with no
    // error at all — case 6g, and the reason A05 exists.
    throw new CompileError(
      `${where} (t=${at}): raw curve has ${curve.length} numbers, this timeline needs ${channels} channel(s) x 4 = ${channels * 4}`, 'CE_COMPILE_CURVE_CHANNEL_COUNT',
    );
  }
  for (const n of curve) {
    if (typeof n !== 'number' || !Number.isFinite(n)) {
      throw new CompileError(`${where} (t=${at}): raw curve holds a non-finite value ${JSON.stringify(n)}`, 'CE_COMPILE_CURVE_VALUE_NONFINITE');
    }
  }
  return curve.map(f32);
}

/**
 * Bone timelines. Same curve rule as the slot tracks — four numbers per value
 * channel, in field order — but the identity value differs per property, so a
 * key that matches setup is still emitted explicitly rather than omitted. An
 * omitted field is not "no change"; it is "the setup value", which is the same
 * thing only by accident.
 */
function compileValueTrack(
  track: MotionValueTrack,
  motion: MotionSpec,
  animName: string,
  duration: number,
  target: string,
  shift: number,
  shapes: Record<string, ValueTrackShape>,
  kind: string,
): ModelKey[] {
  const shape = shapes[track.property];
  if (!shape) throw new CompileError(`animation "${animName}": ${kind} "${target}" has no property "${track.property}"`, 'CE_COMPILE_VALUE_TIMELINE_PROPERTY_UNKNOWN');
  const where = `animation "${animName}" ${kind} "${target}" ${track.property}`;
  if (!track.keys.length) throw new CompileError(`${where}: no keys`, 'CE_COMPILE_TIMELINE_KEYS_EMPTY');

  const out: ModelKey[] = [];
  for (let i = 0; i < track.keys.length; i++) {
    const key = track.keys[i];
    const next = track.keys[i + 1];
    const time = keyTime(key.t + shift);
    if (i > 0 && time <= (out[i - 1].time as number)) refuseKeyOrder(where, track.keys, i, time, out[i - 1].time as number);
    checkKeyTime(where, time, key.t, duration);
    // A named-value timeline (`inherit`): the key's `v` is one name, stepped by
    // the format. The name is resolved rather than copied, and what is WRITTEN
    // is the resolver's spelling — so `NoScale`, which the runtime also reads,
    // emits as the `noScale` an editor writes, and a spelling the runtime
    // cannot resolve never reaches the file at all.
    if (shape.named !== undefined) {
      if (key.ease !== undefined || key.curve !== undefined) {
        throw new CompileError(
          `${where} key at t=${key.t} carries ${key.ease !== undefined ? `an easing ("${key.ease}")` : 'a curve'}, and ` +
            `this timeline is stepped by the format — its reader builds no curve, so the mode changes AT the key and ` +
            'holds until the next one. Remove it', 'CE_COMPILE_STEPPED_TIMELINE_EASING',
        );
      }
      const mode = shape.named.resolve(key.v);
      if (mode === undefined) {
        throw new CompileError(`${where} key at t=${key.t} names mode ${JSON.stringify(key.v)}; ${shape.named.known}`, 'CE_COMPILE_TIMELINE_MODE_UNKNOWN');
      }
      out.push({ time, [shape.named.field]: mode });
      continue;
    }
    // A no-field timeline (`reset`) is an event: the key IS the value, so it
    // carries none. Anything else must match the field count exactly.
    if (shape.fields.length === 0) {
      if (key.v !== null) throw new CompileError(`${where}: this timeline takes no value; use null`, 'CE_COMPILE_VALUELESS_TIMELINE_VALUE');
      if (key.ease) throw new CompileError(`${where}: an event timeline cannot carry an easing`, 'CE_COMPILE_EVENT_TIMELINE_EASING');
      out.push({ time });
      continue;
    }
    if (!Array.isArray(key.v) || key.v.length !== shape.fields.length) {
      throw new CompileError(`${where}: key value must be an array of ${shape.fields.length} number(s)`, 'CE_COMPILE_TIMELINE_VALUE_CHANNEL_COUNT');
    }
    const entry: ModelKey = { time };
    shape.fields.forEach((field, c) => {
      const v = key.v as number[];
      if (!Number.isFinite(v[c])) throw new CompileError(`${where}: non-finite value ${String(v[c])}`, 'CE_COMPILE_TIMELINE_VALUE_NONFINITE');
      // The bound, where the runtime has one. Refused here rather than left to
      // `A23` because this is a spec somebody wrote and the key is the thing to
      // change — the same division `compileConstraintTrack`'s `range` makes for
      // an ik mix, and the same criterion `A23` applies to a file rigc did not
      // write (issue #610). Note the value is judged BEFORE `f32`: a number
      // rounding onto a bound would be refused for the rounding rather than for
      // what the author wrote.
      const bound = shape.bounds?.[c];
      if (bound) {
        const refusal = physicsKeyRefusal(bound, v[c]);
        // `where` already ends in the property, so the JSON field is named only
        // on a shape that has more than one of them — otherwise the message
        // reads "… mass: value is 0", which says the property twice and the
        // second time under the wrong name.
        const at = shape.fields.length > 1 ? `${field} at t=${key.t}` : `key at t=${key.t}`;
        if (refusal !== null) throw new CompileError(`${where} ${at} is ${refusal}`, 'CE_COMPILE_PHYSICS_KEY_RANGE_INVALID');
      }
      entry[field] = f32(v[c]);
    });
    if (key.ease !== undefined && key.curve !== undefined) {
      throw new CompileError(`${where}: a key carries both a named easing and a raw curve; pick one`, 'CE_COMPILE_KEY_EASING_AND_CURVE');
    }
    if (key.curve !== undefined) {
      if (!next) throw new CompileError(`${where}: last key carries a curve but has nothing to ease to`, 'CE_COMPILE_LAST_KEY_CURVE');
      entry.curve = rawCurve(key.curve, shape.fields.length, where, String(key.t));
    } else if (key.ease && next) {
      if (key.ease === 'stepped') {
        entry.curve = 'stepped';
      } else {
        const handles = motion.easings?.[key.ease];
        if (!handles) throw new CompileError(`${where}: unknown easing "${key.ease}"`, 'CE_COMPILE_KEY_EASING_UNKNOWN');
        if (!Array.isArray(next.v)) throw new CompileError(`${where}: next key value must be an array`, 'CE_COMPILE_NEXT_KEY_VALUE_NOT_ARRAY');
        const t2 = keyTime(next.t + shift);
        entry.curve = easingCurve(handles, time, t2, key.v as number[], next.v as number[]);
      }
    } else if (key.ease && !next) {
      throw new CompileError(`${where}: last key carries an easing but has nothing to ease to`, 'CE_COMPILE_LAST_KEY_EASING');
    }
    out.push(entry);
  }
  return out;
}

/**
 * The whole-animation draw-order timeline (`animations.<a>.drawOrder`).
 *
 * ⭐ Four refusals here, and three of them exist because `readDrawOrder`
 * (SkeletonJson.ts:1336-1374) rebuilds the permutation with a **forward-only**
 * cursor over the setup order:
 *
 * ```
 * while (originalIndex !== index) unchanged[unchangedIndex++] = originalIndex++;
 * drawOrder[originalIndex + offsetMap.offset] = originalIndex++;
 * ```
 *
 *   1. **Offsets are emitted in slot order.** An entry whose slot sits EARLIER
 *      than the previous entry's can never make `originalIndex` equal `index`
 *      again, so that loop runs away — an artifact that hangs the loader rather
 *      than loading wrong. The author states a set of moves; the array order in
 *      the file is the parser's requirement and not a decision, so rigc sorts
 *      rather than making every caller remember. Deterministic: the key is the
 *      emitted slot index. The model holds the moves as stated and the Spine
 *      emitter sorts them (`emitDrawOrderKey`, issue #921).
 *   2. **One slot per key.** Two entries for the same slot means two writes at
 *      one cursor position; the second silently wins and the first slot's place
 *      is left to the unchanged-fill.
 *   3. **The destination must be inside the array.** `originalIndex + offset`
 *      out of range writes past the end (or at −1), leaves a −1 hole behind, and
 *      the fill loop then reads `unchanged[-1]` = `undefined`. Nothing throws:
 *      the animation simply draws a slot that is not a slot.
 *   4. A slot the skeleton does not have IS caught by the parser (`Draw order
 *      slot not found`) — but in the consumer's process, which is late, so it is
 *      refused here too.
 *
 * `A31_DRAW_ORDER_OFFSETS_RESOLVE` checks the same four properties from the
 * other side, on the emitted file, because a hand-written or foreign skeleton
 * never passed through this function.
 */
function compileDrawOrder(
  keys: MotionDrawOrderKey[],
  animName: string,
  duration: number,
  slots: readonly ModelSlot[],
): ModelKey[] {
  const where = `animation "${animName}" drawOrder`;
  if (!keys.length) throw new CompileError(`${where}: no keys`, 'CE_COMPILE_TIMELINE_KEYS_EMPTY');
  const indexOf = new Map(slots.map((s, i) => [s.name, i]));

  const out: ModelKey[] = [];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const time = keyTime(key.t);
    if (i > 0 && time <= (out[i - 1].time as number)) refuseKeyOrder(where, keys, i, time, out[i - 1].time as number);
    checkKeyTime(where, time, key.t, duration);
    // No offsets = "back to the setup draw order", which is the parser's own
    // encoding for it. An empty array means the same thing and is written the
    // same way, so that two spellings cannot emit two different files.
    if (!key.offsets?.length) {
      out.push({ time });
      continue;
    }
    const seen = new Set<string>();
    const entries: Array<{ slot: string; offset: number }> = [];
    for (const off of key.offsets) {
      const index = indexOf.get(off.slot);
      if (index === undefined) {
        throw new CompileError(`${where} at t=${key.t}: slot "${off.slot}" is not one this rig emits`, 'CE_COMPILE_DRAW_ORDER_SLOT_UNKNOWN');
      }
      if (seen.has(off.slot)) {
        throw new CompileError(`${where} at t=${key.t}: slot "${off.slot}" is offset twice in one key`, 'CE_COMPILE_DRAW_ORDER_SLOT_DUPLICATE');
      }
      if (!Number.isInteger(off.offset)) {
        throw new CompileError(`${where} at t=${key.t}: slot "${off.slot}" offset ${off.offset} is not a whole number`, 'CE_COMPILE_DRAW_ORDER_OFFSET_NONINTEGER');
      }
      const landing = index + off.offset;
      if (landing < 0 || landing >= slots.length) {
        throw new CompileError(
          `${where} at t=${key.t}: slot "${off.slot}" is at index ${index} and offset ${off.offset} puts it at ` +
            `${landing}, outside the ${slots.length} emitted slots`, 'CE_COMPILE_DRAW_ORDER_OFFSET_OUTSIDE_SLOTS',
        );
      }
      seen.add(off.slot);
      entries.push({ slot: off.slot, offset: off.offset });
    }
    // In the order the spec states the moves: the setup-order sort the parser
    // needs is the Spine emitter's (`emitDrawOrderKey`, issue #921).
    out.push({ time, offsets: entries });
  }
  return out;
}

/**
 * The whole-animation event timeline (`animations.<a>.events`).
 *
 * Four refusals, and the reason each one is here is a different failure mode of
 * `readAnimation`'s event branch (SkeletonJson.ts:1238-1261):
 *
 *   1. **The name must be declared.** `skeletonData.findEvent` returns null and
 *      the parser throws `Event not found` — one of the format's few loud
 *      failures, but it throws in the CONSUMER's process, which is late. Refused
 *      here so the message can name the rig spec's `events` block instead.
 *   2. **Key times must not go backwards.** The loop writes frame `i` from key
 *      `i` in ARRAY order and never sorts, so a time that decreases produces an
 *      `EventTimeline` whose frames are out of order. Nothing throws; the
 *      timeline's search simply stops finding the firings behind the fold. Equal
 *      times are legal and deliberate — two different events on the same frame is
 *      an ordinary thing to want — so this is non-decreasing, not the strictly
 *      increasing rule a value track lives under (a value track has one value per
 *      time and two keys at one time is a contradiction; two firings are not).
 *   3. **`volume`/`balance` need the event to carry `audio`.** `:1254-1257` reads
 *      them only inside `if (event.data.audioPath)`, so on a silent event they
 *      are dropped without a word.
 *   4. **A key past the declared duration.** The same `checkKeyTime` every other
 *      timeline goes through: a firing after the end never fires (issue #54 was
 *      exactly this shape on an attachment reveal).
 */
function compileEvents(
  keys: MotionEventKey[],
  animName: string,
  duration: number,
  events: Record<string, RigEvent>,
): ModelKey[] {
  const where = `animation "${animName}" events`;
  if (!keys.length) throw new CompileError(`${where}: no keys`, 'CE_COMPILE_TIMELINE_KEYS_EMPTY');

  const out: ModelKey[] = [];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (typeof key.name !== 'string' || key.name.length === 0) {
      throw new CompileError(`${where}: key ${i} has no "name"; an event key fires an event by name`, 'CE_COMPILE_EVENT_KEY_NAME_MISSING');
    }
    const declared = events[key.name];
    if (declared === undefined) {
      const known = Object.keys(events);
      throw new CompileError(
        `${where} at t=${key.t}: event "${key.name}" is not declared in the rig spec's "events" block; ` +
          (known.length ? `declared: ${known.join(', ')}` : 'that block is empty or absent'), 'CE_COMPILE_EVENT_KEY_EVENT_UNKNOWN',
      );
    }
    const time = keyTime(key.t);
    if (i > 0 && time < (out[i - 1].time as number)) {
      throw new CompileError(
        `${where}: key times must not go backwards (at t=${key.t}, after t=${String(out[i - 1].time)}) — ` +
          'the parser writes frames in array order and never sorts them', 'CE_COMPILE_EVENT_KEY_TIMES_BACKWARDS',
      );
    }
    checkKeyTime(where, time, key.t, duration);

    const entry: ModelKey = { time, name: key.name };
    if (key.int !== undefined) {
      if (!Number.isInteger(key.int)) {
        throw new CompileError(`${where} at t=${key.t}: int ${String(key.int)} is not an integer`, 'CE_COMPILE_EVENT_KEY_INT_INVALID');
      }
      entry.int = key.int;
    }
    if (key.float !== undefined) {
      if (!Number.isFinite(key.float)) {
        throw new CompileError(`${where} at t=${key.t}: float ${String(key.float)} is not finite`, 'CE_COMPILE_EVENT_KEY_FLOAT_NONFINITE');
      }
      entry.float = f32(key.float);
    }
    if (key.string !== undefined) {
      if (typeof key.string !== 'string') {
        throw new CompileError(`${where} at t=${key.t}: string ${JSON.stringify(key.string)} is not a string`, 'CE_COMPILE_EVENT_KEY_STRING_INVALID');
      }
      entry.string = key.string;
    }
    for (const field of ['volume', 'balance'] as const) {
      const v = key[field];
      if (v === undefined) continue;
      if (declared.audio === undefined) {
        throw new CompileError(
          `${where} at t=${key.t}: ${field} is set but event "${key.name}" declares no "audio"; ` +
            `the parser reads ${field} only for an event with an audio path, so it would be dropped in silence`, 'CE_COMPILE_EVENT_AUDIO_OVERRIDE_NO_AUDIO',
        );
      }
      if (!Number.isFinite(v)) throw new CompileError(`${where} at t=${key.t}: ${field} ${String(v)} is not finite`, 'CE_COMPILE_EVENT_AUDIO_NUMBER_NONFINITE');
      entry[field] = f32(v);
    }
    out.push(entry);
  }
  return out;
}

/**
 * An IK or transform constraint keyed over time — `animations.<a>.<group>.<name>`.
 *
 * One function for both because the two differ only in their field table: the
 * group is one unnamed timeline per constraint, every field is optional with a
 * per-key default, and the curve concatenates four numbers per channel in field
 * order. `CONSTRAINT_TIMELINES` holds what differs.
 *
 * 🚨 The refusal that is not obvious is the **uniform field set**. In this format
 * a key does not inherit anything from the key before it: `getValue(keyMap,
 * "softness", 0)` is read fresh per key, so a track written as
 *
 * ```
 * { "t": 0, "mix": 1, "softness": 20 },  { "t": 1, "mix": 0 }
 * ```
 *
 * does not hold softness at 20 and fade the mix out — it snaps softness to 0 at
 * t=1 and interpolates from 20 down to 0 on the way, which is a thing the author
 * did not write and cannot see. It loads, it plays, and it is wrong. So every key
 * of a track has to name the same fields; stating the default explicitly is the
 * way to opt in.
 *
 * ⚠️ The values a curve is built between are the **effective** ones — the
 * author's number where there is one, the parser's default where there is not.
 * That is reading the format, not inventing a value: it is exactly what the
 * runtime will interpolate, and a bezier built against anything else would
 * describe a curve the player does not play.
 *
 * 🚨 `rigFlags` is the same reading applied one level up, for the three ik
 * booleans (issue #273). The parser reads them per KEY as well as on the
 * constraint, with the same defaults in both places, so an ik timeline whose keys
 * omit `bendPositive` does not inherit the rig's — it asserts `true`, and a rig
 * that declared `false` bends the other way for the whole animation with the
 * field still sitting in the file. Every key therefore carries the EFFECTIVE
 * direction: the motion's where the motion states one, and the rig's where it
 * does not.
 *
 * **A motion key may still override.** The format keys these per key on purpose
 * — they are stepped by nature, and a bend that flips partway through an
 * animation is a real thing to write — so a track that states a flag on every key
 * is honoured as written, whatever the rig says. That is also what the editor's
 * own export does: spineboy-pro declares `bendPositive: false` on both leg chains
 * and restates it on every key of all six ik timelines that touch them. What
 * changes here is only the silent case.
 */
function compileConstraintTrack(
  group: 'ik' | 'transform',
  track: MotionIkTrack | MotionTransformTrack,
  motion: MotionSpec,
  animName: string,
  duration: number,
  /** The ik constraint's three booleans in effect, by field. Empty for `transform`. */
  rigFlags: Record<string, boolean>,
): ModelKey[] {
  const shape = CONSTRAINT_TIMELINES[group];
  const article = group === 'ik' ? 'an' : 'a';
  const where = `animation "${animName}" ${group} constraint "${track.constraint}"`;
  const keys = track.keys;
  // An array by the time this runs (`parseMotionSpec`); an EMPTY one is a
  // format rule rather than a shape — the parser reads key 0, finds nothing and
  // skips the timeline, which is assertion A34's silent case.
  if (keys.length === 0) throw new CompileError(`${where}: no keys`, 'CE_COMPILE_TIMELINE_KEYS_EMPTY');

  const read = (key: MotionIkTrack['keys'][number] | MotionTransformTrack['keys'][number], field: string): unknown =>
    (key as unknown as Record<string, unknown>)[field];
  const named = (key: MotionIkTrack['keys'][number] | MotionTransformTrack['keys'][number]): string[] =>
    [...shape.channels, ...shape.flags].map((c) => c.field).filter((field) => read(key, field) !== undefined);

  // The uniform-field-set rule, checked against key 0 so the message can name the
  // key that differs rather than "some key".
  const first = named(keys[0]);
  const firstSet = new Set(first);
  keys.forEach((key, i) => {
    if (i === 0) return;
    const here = named(key);
    for (const field of here) {
      if (firstSet.has(field)) continue;
      throw new CompileError(
        `${where}: key ${i} (t=${key.t}) names "${field}" and key 0 does not. Every key of ${article} ${group} timeline ` +
          'is read with its own default, so a field stated on some keys and not others snaps to the default on ' +
          'the rest — state it on every key or on none.', 'CE_COMPILE_CONSTRAINT_KEY_FIELD_ADDED',
      );
    }
    for (const field of first) {
      if (here.includes(field)) continue;
      throw new CompileError(
        `${where}: key 0 names "${field}" and key ${i} (t=${key.t}) does not. Every key of ${article} ${group} timeline ` +
          `is read with its own default, so "${field}" would snap to ` +
          `${JSON.stringify(defaultOf(shape, field))} at t=${key.t} — state it on every key or on none.`, 'CE_COMPILE_CONSTRAINT_KEY_FIELD_OMITTED',
      );
    }
  });

  /** The value the runtime will see for `field` on this key: authored, or default. */
  const effective = (key: MotionIkTrack['keys'][number] | MotionTransformTrack['keys'][number], channel: ConstraintChannel): number => {
    const v = read(key, channel.field);
    if (v !== undefined) return v as number;
    if (channel.inheritsFrom === undefined) return channel.dflt;
    const inherited = read(key, channel.inheritsFrom);
    return inherited === undefined ? channel.dflt : (inherited as number);
  };

  const out: ModelKey[] = [];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const next = keys[i + 1];
    const time = keyTime(key.t);
    if (i > 0 && time <= (out[i - 1].time as number)) refuseKeyOrder(where, keys, i, time, out[i - 1].time as number);
    checkKeyTime(where, time, key.t, duration);

    const entry: ModelKey = { time };
    for (const channel of shape.channels) {
      const v = read(key, channel.field);
      if (v === undefined) continue;
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        throw new CompileError(`${where} (t=${key.t}): ${channel.field} is ${JSON.stringify(v)}, not a finite number`, 'CE_COMPILE_CONSTRAINT_KEY_NUMBER_NONFINITE');
      }
      const bounds = shape.range[channel.field];
      if (bounds && (v < bounds[0] || v > bounds[1])) {
        throw new CompileError(
          `${where} (t=${key.t}): ${channel.field} is ${v}, outside ${bounds[0]}..${
            bounds[1] === Infinity ? '∞' : bounds[1]
          } — the runtime documents it as ${channel.field === 'mix' ? 'a percentage 0-1' : 'a distance'}`, 'CE_COMPILE_CONSTRAINT_KEY_RANGE_INVALID',
        );
      }
      entry[channel.field] = f32(v);
    }
    for (const flag of shape.flags) {
      const v = read(key, flag.field);
      if (v === undefined) {
        // The constraint's flag in effect, held on this key because the parser
        // reads the flag per key and does not inherit it. The model key holds
        // every flag in effect; the Spine emitter writes one only where it
        // differs from the per-key default (`emitAnimations`, issue #921).
        const carried = rigFlags[flag.field];
        if (carried !== undefined) entry[flag.field] = carried;
        continue;
      }
      if (typeof v !== 'boolean') {
        throw new CompileError(`${where} (t=${key.t}): ${flag.field} is ${JSON.stringify(v)}, not true or false`, 'CE_COMPILE_CONSTRAINT_KEY_FLAG_NOT_BOOLEAN');
      }
      entry[flag.field] = v;
    }

    if (key.ease !== undefined && key.curve !== undefined) {
      throw new CompileError(`${where}: a key carries both a named easing and a raw curve; pick one`, 'CE_COMPILE_KEY_EASING_AND_CURVE');
    }
    if (key.curve !== undefined) {
      if (!next) throw new CompileError(`${where}: last key carries a curve but has nothing to ease to`, 'CE_COMPILE_LAST_KEY_CURVE');
      entry.curve = rawCurve(key.curve, shape.channels.length, where, String(key.t));
    } else if (key.ease !== undefined && next) {
      if (key.ease === 'stepped') {
        entry.curve = 'stepped';
      } else {
        const handles = motion.easings?.[key.ease];
        if (!handles) throw new CompileError(`${where}: unknown easing "${key.ease}"`, 'CE_COMPILE_KEY_EASING_UNKNOWN');
        const t2 = keyTime(next.t);
        entry.curve = easingCurve(
          handles,
          time,
          t2,
          shape.channels.map((channel) => effective(key, channel)),
          shape.channels.map((channel) => effective(next, channel)),
        );
      }
    } else if (key.ease !== undefined && !next) {
      throw new CompileError(`${where}: last key carries an easing but has nothing to ease to`, 'CE_COMPILE_LAST_KEY_EASING');
    }
    out.push(entry);
  }
  return out;
}

/** The parser default for one field of a constraint timeline, for a message. */
function defaultOf(shape: ConstraintTimelineShape, field: string): number | boolean {
  const channel = shape.channels.find((c) => c.field === field);
  if (channel) return channel.dflt;
  return shape.flags.find((f) => f.field === field)?.dflt ?? 0;
}

/**
 * What a deform key is editing: the array the parser builds for one attachment.
 *
 * The two encodings are the reason this is derived rather than assumed, and they
 * are the same split `readVertices` makes when it decides whether a `vertices`
 * array is coordinates or a weight run:
 *
 *   unweighted — `deformLength = vertices.length`, one `x, y` pair per vertex;
 *   weighted   — `deformLength = vertices.length / 3 * 2`, one pair per bone
 *                INFLUENCE, because the loaded `vertices` is `x, y, weight` per
 *                influence.
 *
 * Same shape, two meanings, and picking the wrong one writes a run that silently
 * lands on the wrong vertices.
 */
export interface DeformGeometry {
  weighted: boolean;
  /** How long the array the key edits is. */
  deformLength: number;
  vertexCount: number;
  /** Bone influences per vertex, in vertex order. Null on an unweighted attachment. */
  boneCounts: number[] | null;
  /**
   * Setup `x, y` per vertex, for a `transform` key to evaluate a model over
   * (issue #294).
   *
   * ⚠️ **Two spaces, and `influenceBones` is which.** Where every vertex of
   * the attachment occupies exactly one pair of one bone's bind space — an
   * unweighted run, or a weighted one whose every vertex is a single influence
   * of a single bone — this is that space, the model's output IS the deform
   * array, and `influenceBones` is null. Where it is not, this is the
   * vertex's setup **world** position, `Σ wᵢ · Mᵢ · bindᵢ`, which is defined for
   * any weighting; the model's output is then a world displacement that the
   * caller pushes into each influence through `influenceBones`.
   *
   * That seam is deliberate and it is the reason the field is documented rather
   * than named: keeping the first case in its own space is what makes the
   * change to the second byte-for-byte invisible to every rig that already
   * compiles (issue #389's own gate). It does mean a `radius` or an `about` is
   * read in world units the moment a second bone touches any vertex, so the
   * report says which space it evaluated in whenever it is not the first one.
   *
   * Null only in the one case that has no identity behind it: weights that do
   * not close at 1. `setupWhy` then says so.
   */
  setup: number[] | null;
  /**
   * The setup world transform of the bone behind each influence, in the deform
   * array's **own order** — one entry per pair — or null when `setup` is
   * already the space the array is in.
   *
   * Non-null is the multi-influence path: a vertex's world displacement `D`
   * becomes `Mᵢ⁻¹ · D` in every one of its influences (`toBoneLocalVector`), so
   * the runtime's `Σ wᵢ · Mᵢ · Mᵢ⁻¹ · D` collapses to `D · Σ wᵢ = D` at setup,
   * and to the same blend that carries the vertex once a bone moves.
   */
  influenceBones: BoneTransform[] | null;
  /** Why `setup` is null, phrased for the refusal. Null when it is not. */
  setupWhy: string | null;
  /**
   * Per-vertex `z`, when this attachment's generator named a depth map.
   *
   * Not measured from the attachment like everything else here — there
   * is nowhere in the format to measure it FROM, which is the whole reason the
   * sampler keeps it beside the skeleton instead of in it. Filled in by the
   * caller, which is where the skin, slot and attachment names live.
   */
  depth: readonly number[] | null;
  /**
   * The attachment's `soft` mask and its level per vertex, when its generator
   * named one — what a deform envelope's `mask` reads (issue #1413). Filled in
   * by the caller, as `depth` is, and for the same reason.
   */
  soft: DeformSoftMask | null;
}

/**
 * Measure one attachment's deform array, off its model record (issue #917): the
 * bindings name their bones, so each influence's setup transform is looked up by
 * name and no index into any bone array is read.
 *
 * A region attachment is refused rather than measured: it has no `vertices` at
 * all, so `attachment.vertices.length` throws inside the parser — one of the very
 * few places this format fails loudly, and it fails in the consumer's process.
 * A linked mesh is refused the same way, by its type.
 *
 * Exported for the selftest alone: `MV06` holds it to the decoder of the emitted
 * run it replaced, to the bit.
 */
export function deformGeometryOf(
  att: SkinTableEntry,
  where: string,
  /** Every bone's setup world transform, by name. */
  transforms: Map<string, BoneTransform>,
): DeformGeometry {
  const type = att.kind;
  let worldVerticesLength: number;
  if (!isModelVertexAttachment(att)) {
    throw new CompileError(
      `${where}: a deform timeline keys the vertices of an attachment, and this one is a "${type}" — ` +
        'it has no vertex array to deform. Deformable types: mesh, boundingbox, clipping, path.', 'CE_COMPILE_DEFORM_ATTACHMENT_TYPE_INVALID',
    );
  }
  if (att.kind === 'mesh') {
    worldVerticesLength = att.uvs.length;
  } else {
    // ⭐ A `path` reaches this line as of issue #696, and it is the SAME line the
    // other two vertex-and-no-triangles types take: the array the parser sizes
    // is `vertexCount * 2`, the two encodings below are the mesh's own, and a
    // path's vertices are its control points.
    //
    // ⚠️ What stood here was a `NotImplementedError` — *a path attachment does
    // have a vertex array, and rigc does not key it yet* — whose stated reason
    // was that a deformed path invalidates the `lengths` the attachment carries.
    // The reason is measured and it does not belong to rigc:
    //
    //   - `lengths` is a field of the ATTACHMENT. The format has nowhere to put
    //     a per-key length, so no export of any tool carries a re-measured one;
    //     the editor's own is the setup measurement, which a stated array
    //     carries and `pathCurveLengths` measures when none is stated.
    //   - `PathConstraint.computeWorldPositions` reads that field only under
    //     `constantSpeed: false` (`PathConstraint.js:205`). Under the parser's
    //     default, `true`, it re-measures the curve from the posed world
    //     vertices every frame — and those come through
    //     `VertexAttachment.computeWorldVertices`, which uses
    //     `slot.appliedPose.deform` when the array is non-empty
    //     (`attachments/Attachment.js:97-115`). So the constraint follows the
    //     DEFORMED spline, and the stale field is not read at all.
    //
    // ⇒ refusing it was refusing correct data for behaviour the format has and
    // every runtime shares — the shape issues #44 and #262 already cost this
    // file twice. `docs/AUTHORING.md` §4.11 states the `constantSpeed: false`
    // reading instead, which is the honest home for it: a fact about the format
    // the author is choosing, not a fault rigc can measure.
    worldVerticesLength = att.vertexCount * 2;
  }
  const vertices = att.vertices;
  const weighted = vertices.weighted;
  if (!vertices.weighted) {
    return {
      weighted,
      deformLength: worldVerticesLength,
      vertexCount: worldVerticesLength / 2,
      boneCounts: null,
      // An unweighted attachment IS its own space: the array is one `x, y` per
      // vertex in the slot bone's space, which is the space the offsets are in.
      setup: vertices.xy.slice(),
      influenceBones: null,
      setupWhy: null,
      // Filled in by the caller; `deformGeometryOf` reads the attachment's
      // record, and the depth is deliberately not in it — nor the soft mask.
      depth: null,
      soft: null,
    };
  }
  // Walk the bindings for the per-vertex influence counts. Their shape is
  // already assured by the attachment builders and by A33/A04; this only counts,
  // and a vertex with no binding stops rather than producing a plausible number
  // — at the index its count would hold in the emitted run, as it was worded
  // when this walked the run.
  const boneCounts: number[] = [];
  const bindSpace: number[] = [];
  const bones = new Set<string>();
  for (let v = 0, at = 0; v < vertices.bindings.length; v++) {
    const vertex = vertices.bindings[v];
    const n = vertex.length;
    if (n < 1) {
      throw new CompileError(`${where}: the attachment's weighted vertex run has a bone count of ${String(n)} at index ${at}`, 'CE_COMPILE_DEFORM_WEIGHT_BONE_COUNT_INVALID');
    }
    if (n === 1) {
      bones.add(vertex[0].bone);
      bindSpace.push(vertex[0].x, vertex[0].y);
    }
    boneCounts.push(n);
    at += 1 + n * 4;
  }
  // ⚠️ The influence count is the SUM of the per-vertex counts, not a division
  // of the emitted JSON array's length. The emitted array is `boneCount` followed by
  // `boneIndex, x, y, weight` per influence — five numbers for a single-bone
  // vertex, not three — so `vertices.length / 3` overstated the deform array by
  // two thirds on a one-bone-per-vertex mesh (`gallery/flex`'s 77-vertex leaf
  // measured 256.667 against its true 154) and made A35's own overrun bar too
  // wide by that much. `readVertices` stores three numbers per influence in the
  // LOADED attachment, which is where the `/3*2` in the parser comes from.
  let influences = 0;
  for (const n of boneCounts) influences += n;
  const common = { weighted, deformLength: influences * 2, vertexCount: boneCounts.length, boneCounts, depth: null, soft: null };
  // -- one bind space, unchanged -------------------------------------------
  //
  // Every vertex a single influence of a single bone: the run IS that bone's
  // bind space, a model evaluated over it lands straight in the deform array,
  // and not one byte of this path moved for issue #389. Keeping it separate is
  // what makes that provable — the alternative, folding it into the world path
  // below, would re-evaluate every existing `transform` key at world
  // coordinates and emit a different file for a spec nobody edited.
  //
  // 🔸 Issue #1021: this reads the runtime's frame, not the exact one. The
  // offsets are added by the runtime to exactly these numbers, so the model is
  // evaluated on what the file holds; a compiler-bound vertex therefore carries
  // the runtime's last bits (`b = −2.3e-8` on an unrotated bone) into its
  // offset, about 1e-6 on gallery/look's hair locks. Evaluating on the authored
  // positions instead would need them carried here from the binder.
  if (boneCounts.every((n) => n === 1) && bones.size === 1) {
    return { ...common, setup: bindSpace, influenceBones: null, setupWhy: null };
  }
  // -- several influences, evaluated in world (issue #389) -------------------
  //
  // The refusal that used to stand here was right about the ARRAY and wrong
  // about the MODEL. There is no single space the array lives in, true; but the
  // vertex has one setup world position whatever its weighting —
  // `Σ wᵢ · Mᵢ · bindᵢ` — and a world displacement `D` written into influence
  // `i` as `Mᵢ⁻¹ · D` moves it by `D · Σ wᵢ`. So the model is evaluated once, in
  // world, and pushed into each bind space rather than guessed at in one of
  // them.
  //
  // ⭐ The one case with no identity behind it is a vertex whose weights do not
  // close at 1, because that is the `Σ wᵢ` the arithmetic cancels against.
  // `A20_MESH_WEIGHTS_COHERENT` is the assertion that requires it and 1e-3 is
  // the tolerance it uses, quoted here rather than chosen again.
  const setupWorld: number[] = [];
  const influenceBones: BoneTransform[] = [];
  let openWeights: string | null = null;
  for (let v = 0; v < boneCounts.length; v++) {
    let wx = 0;
    let wy = 0;
    let sum = 0;
    for (const binding of vertices.bindings[v]) {
      const m = transforms.get(binding.bone);
      if (!m) throw new CompileError(`${where}: vertex ${v} binds bone "${binding.bone}", which has no setup transform`, 'CE_COMPILE_VERTEX_BIND_TRANSFORM_MISSING');
      const weight = binding.weight;
      const [x, y] = toWorld(m, binding.x, binding.y);
      wx += x * weight;
      wy += y * weight;
      sum += weight;
      influenceBones.push(m);
    }
    setupWorld.push(wx, wy);
    if (openWeights === null && Math.abs(sum - 1) > 1e-3) {
      openWeights =
        `vertex ${v}'s ${boneCounts[v]} weights sum to ${sum.toFixed(4)} rather than 1. A stated model becomes a deform ` +
        'run by writing each vertex\'s world displacement D into every influence as Mᵢ⁻¹·D, which moves the vertex by ' +
        'D·Σwᵢ — so a sum that is not 1 has no displacement that lands it where the model says. ' +
        'A20_MESH_WEIGHTS_COHERENT is the assertion that requires that sum, at the same 1e-3';
    }
  }
  return {
    ...common,
    setup: openWeights === null ? setupWorld : null,
    influenceBones: openWeights === null ? influenceBones : null,
    setupWhy: openWeights,
  };
}

/**
 * One attachment's geometry keyed over time —
 * `animations.<a>.attachments.<skin>.<slot>.<attachment>.deform`.
 *
 * ⭐ Every refusal below is a silent failure of the parser's own deform branch,
 * and the first is the one that matters most:
 *
 *   1. **A run that does not fit.** The parser copies with
 *      `Utils.arrayCopy(vertices, 0, deform, start, vertices.length)` into a
 *      `Float32Array` sized from the attachment. Writing past the end of a typed
 *      array is a **no-op in JavaScript** — no throw, no warning — so a run one
 *      pair too long, or aimed at the wrong attachment, loses its tail and
 *      deforms part of the mesh correctly. That is the worst possible failure
 *      shape: it looks almost right.
 *   2. **`fromVertex` where a vertex is not one pair.** See below.
 *   3. **A key that carries both a run and no room for one**, or a non-finite
 *      offset — a NaN in the deform array propagates into world vertices.
 *
 * ⛔ What is **not** refused, and was until issue #576: an odd `offset` or an odd
 * run length. Both are raw copies at raw indices in both readers, both are what a
 * trimmed editor delta looks like, and neither has a second spelling — see the
 * clause in the loop below and the one in `deformStart`.
 *
 * `fromVertex` is rigc's own field and the reason it exists is issue #89's
 * observation: a deform key is the only key in the format whose meaning depends
 * on the attachment it is attached to, and an author reasons in vertices while
 * the array is indexed in influences. On an **unweighted** attachment the two
 * coincide, so the translation is exact. On a **weighted** one it is exact only
 * where each vertex the run covers has exactly ONE bone on it; with two bones a
 * vertex occupies two pairs and "move vertex 3 by (dx, dy)" is not a statement
 * the array can hold — the world offset would be
 * `Σ weightᵦ · Mᵦ · (dx, dy)`, which equals `(dx, dy)` only if every influencing
 * bone happens to share one world matrix. So that case is refused by name and
 * `offset` stays available for an author who really is writing bind-space
 * offsets per influence.
 *
 * ⭐ **A `transform` key is not in that bind, and since issue #389 it is not
 * refused for it.** The difference is where the numbers come from: `fromVertex`
 * hands rigc a pair the AUTHOR wrote, in a space only the author knows, and
 * rigc will not guess which. A model states a displacement rigc evaluates
 * itself, so it can put that displacement in world and push it into each
 * influence through that bone's own inverse — `Σ wᵢ · Mᵢ · Mᵢ⁻¹ · D = D`, with
 * nothing guessed. What survives is the one case the identity does not cover: a
 * vertex whose weights do not close at 1.
 */
/**
 * One sequence timeline — `animations.<a>.attachments.<skin>.<slot>.<attachment>.sequence`
 * — keyed on an attachment that carries a numbered series (issue #729).
 *
 * The key's own shape (`mode` among the seven, a whole `index`, a delay the
 * parser will not divide by zero) is `parseMotionSpec`'s; what is refused here
 * needs the emitted attachment:
 *
 *   - an attachment with no `sequence` block. The parser gives every region and
 *     mesh a one-region series (`readSequence(null)` is `new Sequence(1,
 *     false)`), so the timeline loads and every mode shows that one region —
 *     measured: a `loop` key on a plain region showed it at every time.
 *   - an `index` at or past the series' `count`. `Sequence.resolveIndex` clamps
 *     it to the last frame (measured: `hold` at index 5 of 4 showed frame 4).
 *   - a linked mesh that plays its source's timelines (`timelines` absent or
 *     true). Its `timelineAttachment` is the SOURCE (`SkeletonJson.js:437-448`),
 *     and `SequenceTimeline.applyToSlot` returns unless the slot's attachment's
 *     `timelineAttachment` is the one the timeline was built for — so a key
 *     aimed at the link itself is applied to nothing.
 *
 * Fields are emitted exactly as stated: an omitted `mode` is the parser's
 * `"hold"`, an omitted `index` its 0, an omitted `delay` the previous key's —
 * none of which the compiler writes for the spec.
 */
function compileSequenceTrack(
  track: MotionSequenceTrack,
  duration: number,
  attachment: SkinTableEntry,
  where: string,
): ModelKey[] {
  const series =
    attachment.kind === 'region' || attachment.kind === 'mesh' || attachment.kind === 'linkedmesh' ? attachment.sequence : undefined;
  if (series === undefined) {
    throw new CompileError(
      `${where}: attachment "${track.attachment}" carries no "sequence" block, so there is no series to step. The ` +
        'parser gives every region and mesh a series of ONE region (`readSequence(null)` is `new Sequence(1, ' +
        'false)`), so this timeline would load and show that region under every mode at every time. Give the ' +
        'attachment a "sequence" in the rig spec, or remove the track.', 'CE_COMPILE_SEQUENCE_ATTACHMENT_NO_SERIES',
    );
  }
  if (attachment.kind === 'linkedmesh' && attachment.timelines) {
    const source = attachment.source;
    throw new CompileError(
      `${where}: attachment "${track.attachment}" is a linked mesh that plays its source's timelines ("timelines" ` +
        `is not false), so its \`timelineAttachment\` is "${source}" (\`SkeletonJson.js:437-448\`) and ` +
        '`SequenceTimeline` applies only where the slot\'s attachment\'s `timelineAttachment` is the one it was ' +
        `built for — a key aimed at the link is applied to nothing. Key "${source}" instead (the link steps its own ` +
        'series by it), or set "timelines": false on the link.', 'CE_COMPILE_SEQUENCE_LINK_TIMELINE_INERT',
    );
  }
  if (track.keys.length === 0) throw new CompileError(`${where}: no keys`, 'CE_COMPILE_TIMELINE_KEYS_EMPTY');
  const out: ModelKey[] = [];
  for (let i = 0; i < track.keys.length; i++) {
    const key = track.keys[i];
    const time = keyTime(key.t);
    if (i > 0 && time <= (out[i - 1].time as number)) refuseKeyOrder(where, track.keys, i, time, out[i - 1].time as number);
    checkKeyTime(where, time, key.t, duration);
    if (key.index !== undefined && key.index >= series.count) {
      throw new CompileError(
        `${where} (t=${key.t}): index ${key.index} is past the end of a ${series.count}-frame series (frames 0 to ` +
          `${series.count - 1}). \`Sequence.resolveIndex\` clamps it to the last frame, so the key would start on a ` +
          'frame it does not name. `index` is 0-based.', 'CE_COMPILE_SEQUENCE_KEY_INDEX_OUTSIDE_SERIES',
      );
    }
    const entry: ModelKey = { time };
    if (key.mode !== undefined) entry.mode = key.mode;
    if (key.index !== undefined) entry.index = key.index;
    if (key.delay !== undefined) entry.delay = f32(key.delay);
    out.push(entry);
  }
  return out;
}

function compileDeformTrack(
  track: MotionDeformTrack,
  motion: MotionSpec,
  animName: string,
  duration: number,
  geometry: DeformGeometry,
  generated: CompileResult['deformTransforms'],
): ModelKey[] {
  const skin = track.skin ?? 'default';
  const where = `animation "${animName}" deform ${skin}/${track.slot}/${track.attachment}`;
  const keys = track.keys;
  // An array by the time this runs (`parseMotionSpec`); an EMPTY one is a
  // format rule rather than a shape — the parser reads key 0, finds nothing and
  // skips the timeline, which is assertion A34's silent case.
  if (keys.length === 0) throw new CompileError(`${where}: no keys`, 'CE_COMPILE_TIMELINE_KEYS_EMPTY');

  const out: ModelKey[] = [];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const time = keyTime(key.t);
    if (i > 0 && time <= (out[i - 1].time as number)) refuseKeyOrder(where, keys, i, time, out[i - 1].time as number);
    checkKeyTime(where, time, key.t, duration);
    // -- a key that states a MODEL rather than a run (issue #294) ------------
    //
    // Handled before everything below, because a transform key carries no
    // `vertices` and would otherwise be read as the format's "back to the setup
    // pose". The three refusals are the bounds the issue drew: a key states one
    // or the other, never both; a model covers every vertex, so a start index
    // has nothing to mean; and a model has to land each vertex somewhere
    // definite, which the arithmetic does for any weighting that closes at 1 and
    // for no weighting that does not (issue #389).
    if (key.transform !== undefined) {
      if (key.vertices !== undefined && key.vertices !== null) {
        throw new CompileError(
          `${where} (t=${key.t}): the key carries both a "transform" and a "vertices" run, and they are two answers to ` +
            'one question. Authored offsets and a stated model do not combine, for the same reason a mesh cannot carry ' +
            'both a "generator" and authored geometry — drop one.', 'CE_COMPILE_DEFORM_TRANSFORM_AND_VERTICES',
        );
      }
      if (key.offset !== undefined || key.fromVertex !== undefined) {
        throw new CompileError(
          `${where} (t=${key.t}): the key states a "transform" and a start index. A transform is a model of the whole ` +
            `attachment and is evaluated over all ${geometry.vertexCount} of its vertices, so it always starts at deform ` +
            'index 0. A model applied to part of a run leaves a step at the run\'s edge — write the partial run by hand ' +
            'if that is what you mean.', 'CE_COMPILE_DEFORM_TRANSFORM_START_INDEX',
        );
      }
      if (geometry.setup === null) {
        throw new CompileError(
          `${where} (t=${key.t}): a "transform" states where every vertex of this attachment goes, and this one has a ` +
            `vertex the arithmetic cannot place — ${geometry.setupWhy}. Fix the weights, or write the bind-space pairs ` +
            'yourself and start the run with "offset".', 'CE_COMPILE_DEFORM_TRANSFORM_SETUP_UNRESOLVED',
        );
      }
      const report = evaluateDeformTransform(
        key.transform,
        geometry.setup,
        onModelGrid,
        `${where} (t=${key.t})`,
        geometry.depth,
        geometry.soft,
      );
      if (report.offsets.length !== geometry.vertexCount * 2) {
        // Unreachable while `setup` is one pair per vertex, which is the whole
        // reason both are derived from the same walk. Stated rather than
        // assumed: a silent mismatch here is the overrun A35 exists for.
        throw new CompileError(
          `${where} (t=${key.t}): the transform produced ${report.offsets.length} numbers for ` +
            `${geometry.vertexCount} vertices`, 'CE_COMPILE_DEFORM_TRANSFORM_OFFSET_COUNT',
        );
      }
      // -- one displacement per vertex -> one pair per influence (issue #389) -
      //
      // On a single-space attachment the two are the same array and this is a
      // no-op by construction. On a multi-influence one the model's output is a
      // WORLD displacement, and it reaches the deform array through each
      // influencing bone's own inverse: `Σ wᵢ · Mᵢ · Mᵢ⁻¹ · D = D`. The
      // displacement it expands is the ROUNDED one the report prints, so a
      // reader can reproduce every emitted pair from the audit rather than from
      // a second evaluation.
      const run = expandDeformToInfluences(report.offsets, geometry);
      if (run.length !== geometry.deformLength) {
        throw new CompileError(
          `${where} (t=${key.t}): the transform expanded to ${run.length} numbers and this attachment's deform ` +
            `array is ${geometry.deformLength} long`, 'CE_COMPILE_DEFORM_TRANSFORM_RUN_LENGTH',
        );
      }
      generated.push({
        animation: animName,
        skin,
        slot: track.slot,
        attachment: track.attachment,
        time,
        ...report,
        // ⚠️ Which space the model was read in is not a detail: `radius`,
        // `about`, `from` and `to` all mean something different in world
        // coordinates, and a reader comparing two keys on two attachments has no
        // other way to know they were not evaluated alike. Said only on the path
        // where it is not the attachment's own space, so every existing report
        // prints exactly the lines it printed before.
        ...(geometry.influenceBones === null
          ? {}
          : {
              expanded: run,
              derived: [
                ...report.derived,
                `evaluated at setup WORLD positions, because ${geometry.vertexCount} vertices carry ` +
                  `${geometry.deformLength / 2} influences; each displacement D is written into every influence as ` +
                  'Mᵢ⁻¹·D, so the runtime composes Σwᵢ·Mᵢ·Mᵢ⁻¹·D = D',
              ],
            }),
      });
      out.push({ time, vertices: run });
      continue;
    }
    if (key.offset !== undefined && key.fromVertex !== undefined) {
      throw new CompileError(
        `${where} (t=${key.t}): a key gives its start as "offset" (an index into the deform array) or as ` +
          '"fromVertex" (a vertex index rigc translates), never both', 'CE_COMPILE_DEFORM_START_SOURCES_CONFLICT',
      );
    }
    const run = key.vertices ?? null;
    if (run === null) {
      // The parser's own encoding for "no edit": with no `vertices` the deform is
      // the setup pose. `offset`/`fromVertex` would be pointing into nothing, and
      // two spellings of one key must not emit two different files.
      if (key.offset !== undefined || key.fromVertex !== undefined) {
        throw new CompileError(
          `${where} (t=${key.t}): the key has no "vertices", which is the format's way of saying "back to the ` +
            'setup pose" — so there is nothing for a start index to point at. Drop the offset, or give it a run.', 'CE_COMPILE_DEFORM_SETUP_KEY_START_INDEX',
        );
      }
      out.push({ time });
      continue;
    }
    if (!Array.isArray(run) || run.length === 0) {
      throw new CompileError(
        `${where} (t=${key.t}): "vertices" is ${JSON.stringify(key.vertices)}; give an array of x, y offsets, ` +
          'or omit it entirely for "back to the setup pose"', 'CE_COMPILE_DEFORM_VERTICES_NOT_ARRAY',
      );
    }
    // ⛔ No parity clause here, and its absence is the rule (issue #576).
    //
    // A run is copied, not decoded. `SkeletonJson`'s deform branch does
    // `Utils.arrayCopy(verticesValue, 0, deform, start, verticesValue.length)`
    // with `start` the key's own `offset`, and `SkeletonBinary` reads a count and
    // a start and fills `for (let v = start; v < end; v++) deform[v] = ...`.
    // Neither has any pair arithmetic to be misaligned against, so an ODD run is
    // legal, deterministic data: it writes the x and y of one vertex and the x of
    // the next, and that next y stays at its setup value.
    //
    // 🔒 The reason this cannot be "refused in THIS spec anyway" is that there is
    // no other spelling of it. Padding a `0` to make the run even is a different
    // animation wherever the setup y it lands on is non-zero, so a spec that
    // refuses an odd run is a spec no transcription of such a file can be written
    // in — and one is in this repository's own example corpus (`spineboy-pro`,
    // `hoverboard` / `hoverboard-board`: `offset: 1` and 147 numbers into a
    // 148-long array, the whole delta minus the leading zero the editor trimmed).
    //
    // What replaces it is the bound the runtime really has, below: the run has to
    // FIT. That one is the quiet defect — a copy past the end of a `Float32Array`
    // is a no-op in JavaScript — and it is unaffected by where a run starts or
    // how long it is. `A35_DEFORM_KEYS_FIT_THE_ATTACHMENT` measures the same
    // bound on the emitted file and has had no parity clause since issue #262;
    // until this was removed the two halves of rigc disagreed about what the
    // format holds, and the half that refused was the authoring half.
    for (const n of run) {
      if (typeof n !== 'number' || !Number.isFinite(n)) {
        throw new CompileError(`${where} (t=${key.t}): "vertices" holds a non-finite value ${JSON.stringify(n)}`, 'CE_COMPILE_DEFORM_VERTEX_VALUE_NONFINITE');
      }
    }
    const start = deformStart(key, run.length, geometry, where);
    if (start + run.length > geometry.deformLength) {
      throw new CompileError(
        `${where} (t=${key.t}): the run starts at deform index ${start} and is ${run.length} long, which ends at ` +
          `${start + run.length}; this attachment's deform array is ${geometry.deformLength} long ` +
          `(${geometry.weighted ? `${geometry.deformLength / 2} bone influences` : `${geometry.vertexCount} vertices`}). ` +
          'The parser copies into a Float32Array, so everything past the end is dropped without a word.', 'CE_COMPILE_DEFORM_RUN_OUTSIDE_ATTACHMENT',
      );
    }
    const entry: ModelKey = { time };
    // `offset` defaults to 0 in the parser and the editor omits it there, so an
    // authored 0, an authored `fromVertex: 0` and an absent start all emit the
    // same bytes — one meaning, one file.
    if (start !== 0) entry.offset = start;
    entry.vertices = run.map(f32);
    out.push(entry);
  }
  // Curves go on in a second pass because a key's curve depends on the NEXT key's
  // emitted geometry — a named easing over a hold is `stepped` — and that
  // geometry is only known once the next key has been through the checks above.
  for (let i = 0; i < out.length; i++) deformKeyCurve(out[i], keys[i], keys, i, motion, where, out[i + 1]);
  return out;
}

/**
 * A stated model's per-vertex displacement, as the deform array holds it.
 *
 * Two encodings once more, and the caller does not choose between them —
 * `influenceBones` does, because it is null exactly when `setup` was already the
 * array's own space:
 *
 *   one space  — the displacements ARE the array, returned untouched. This is
 *                every `transform` key that compiled before issue #389, and
 *                returning the same array object is what makes that visibly
 *                true rather than arithmetically true.
 *   several    — `D` is in world, and influence `i` of a vertex gets
 *                `Mᵢ⁻¹ · D` (rotation and scale, no translation), which the
 *                runtime sums back to `D · Σ wᵢ = D`.
 *
 * ⚠️ `toBoneLocalVector` and not `toBoneLocal`: a displacement has no origin to
 * subtract, and subtracting one would move the vertex by the bone's own
 * position. The coordinate contract lives in `src/transform.ts` and this reads
 * it rather than restating it.
 */
function expandDeformToInfluences(displacements: number[], geometry: DeformGeometry): number[] {
  const perInfluence = geometry.influenceBones;
  if (perInfluence === null) return displacements;
  const counts = geometry.boneCounts ?? [];
  const out: number[] = [];
  for (let v = 0, k = 0; v < counts.length; v++) {
    const dx = displacements[2 * v];
    const dy = displacements[2 * v + 1];
    for (let n = 0; n < counts[v]; n++, k++) {
      const [bx, by] = toBoneLocalVector(perInfluence[k], dx, dy);
      out.push(f32(bx), f32(by));
    }
  }
  return out;
}

/**
 * Where in the deform array this key's run begins.
 *
 * `offset` is that index outright — any index the array holds, odd ones included
 * (issue #576). `fromVertex` is a vertex index, and turning one into the other is
 * exact only where a vertex occupies exactly one pair — which is every vertex of
 * an unweighted attachment and only the single-bone vertices of a weighted one.
 */
function deformStart(
  key: MotionDeformTrack['keys'][number],
  runLength: number,
  geometry: DeformGeometry,
  where: string,
): number {
  if (key.offset !== undefined) {
    if (!Number.isInteger(key.offset) || key.offset < 0) {
      throw new CompileError(
        `${where} (t=${key.t}): offset is ${JSON.stringify(key.offset)}; it is an index into the deform array, so a whole number ≥ 0`, 'CE_COMPILE_DEFORM_OFFSET_INVALID',
      );
    }
    // ⛔ An odd `offset` is not refused either, and it went the same way as the
    // run's own length (issue #576). The refusal that stood here read an odd
    // start as a `fromVertex` typed into the wrong field — a real mistake, but
    // this caught exactly the half of it whose index happens to be odd:
    // `offset: 4` meant as vertex 4 is the same mistake, lands on vertex 2, and
    // was always accepted. What it did refuse was every faithful transcription of
    // a trimmed editor run, one of which ships in `examples/` — `spineboy-pro`'s
    // `hoverboard-board` starts at 1. A rule that filters one parity of a
    // confusion it cannot see, at the price of a construct the format holds, is
    // the wrong instrument; `A35` dropped the same clause in issue #262.
    return key.offset;
  }
  if (key.fromVertex === undefined) return 0;
  const from = key.fromVertex;
  if (!Number.isInteger(from) || from < 0) {
    throw new CompileError(`${where} (t=${key.t}): fromVertex is ${JSON.stringify(from)}; it is a vertex index, so a whole number ≥ 0`, 'CE_COMPILE_DEFORM_FROM_VERTEX_INVALID');
  }
  // ⌈⌉ rather than ÷, because an odd run REACHES a last vertex without covering
  // it: its final number is that vertex's x and the y beside it stays at setup
  // (issue #576). The bound below is about which vertices the run reaches, so the
  // half-reached one counts — and on a weighted attachment its influence count is
  // checked with the rest.
  const covered = Math.ceil(runLength / 2);
  if (from + covered > geometry.vertexCount) {
    throw new CompileError(
      `${where} (t=${key.t}): fromVertex ${from} plus ${covered} vertex offset(s) runs to vertex ${from + covered}, ` +
        `and the attachment has ${geometry.vertexCount}`, 'CE_COMPILE_DEFORM_FROM_VERTEX_OUTSIDE_ATTACHMENT',
    );
  }
  if (!geometry.weighted) return from * 2;
  const counts = geometry.boneCounts!;
  for (let v = from; v < from + covered; v++) {
    if (counts[v] === 1) continue;
    throw new CompileError(
      `${where} (t=${key.t}): "fromVertex" counts VERTICES, and this attachment is weighted — its deform array ` +
        `holds one x, y pair per bone INFLUENCE, and vertex ${v} has ${counts[v]} of them. One offset per vertex ` +
        'is not a thing that array can hold: the world offset of a multi-bone vertex is the weighted sum of a ' +
        'per-bone offset in each bone\'s own bind space, so rigc will not guess one for you. Either key the ' +
        'control bone instead, or write the bind-space pairs yourself and start the run with "offset" ' +
        `(vertex ${from} starts at deform index ${2 * counts.slice(0, from).reduce((a, b) => a + b, 0)}).`, 'CE_COMPILE_DEFORM_WEIGHTED_FROM_VERTEX_AMBIGUOUS',
    );
  }
  let start = 0;
  for (let v = 0; v < from; v++) start += counts[v];
  return start * 2;
}

/**
 * A deform key's curve.
 *
 * One channel, and it is not any value in `vertices`: `readCurve(curve, timeline,
 * bezier, frame, 0, time, time2, 0, 1, 1)` builds the cubic between **0 and 1**,
 * the fraction of the way from this key's geometry to the next one's. So a named
 * easing here is the same shape it would be anywhere, applied to the blend rather
 * than to a coordinate, and a raw curve is four numbers whose value axis is 0..1.
 */
function deformKeyCurve(
  entry: ModelKey,
  key: MotionDeformTrack['keys'][number],
  keys: MotionDeformTrack['keys'],
  index: number,
  motion: MotionSpec,
  where: string,
  /** The next key AS EMITTED, or undefined on the last key. */
  next: ModelKey | undefined,
): ModelKey {
  if (key.ease !== undefined && key.curve !== undefined) {
    throw new CompileError(`${where}: a key carries both a named easing and a raw curve; pick one`, 'CE_COMPILE_KEY_EASING_AND_CURVE');
  }
  if (key.curve !== undefined) {
    if (next === undefined) throw new CompileError(`${where}: last key carries a curve but has nothing to ease to`, 'CE_COMPILE_LAST_KEY_CURVE');
    entry.curve = rawCurve(key.curve, 1, where, String(key.t));
    return entry;
  }
  if (key.ease === undefined) return entry;
  if (next === undefined) throw new CompileError(`${where}: last key carries an easing but has nothing to ease to`, 'CE_COMPILE_LAST_KEY_EASING');
  if (key.ease === 'stepped') {
    entry.curve = 'stepped';
    return entry;
  }
  const handles = motion.easings?.[key.ease];
  if (!handles) throw new CompileError(`${where}: unknown easing "${key.ease}"`, 'CE_COMPILE_KEY_EASING_UNKNOWN');
  // The one channel runs 0 -> 1; the VALUE being held is the geometry, so the
  // hold test compares the two keys' runs rather than those two constants.
  entry.curve = easingCurve(handles, entry.time as number, keyTime(keys[index + 1].t), [0], [1], sameDeform(entry, next));
  return entry;
}

/**
 * True when two deform keys, AS EMITTED, describe one geometry.
 *
 * A deform key's value is its run — `vertices` starting at `offset` — and the
 * parser reads everything outside the run, and a key with no `vertices` at all,
 * as zero offset from the setup pose. So a run of zeros, a shorter run and no run
 * are three spellings of one geometry, and the comparison expands both keys onto
 * the same index range before reading them. The runs are already `f32`'d.
 */
function sameDeform(a: ModelKey, b: ModelKey): boolean {
  const runOf = (k: ModelKey): { start: number; run: number[] } => ({
    start: typeof k.offset === 'number' ? k.offset : 0,
    run: Array.isArray(k.vertices) ? (k.vertices as number[]) : [],
  });
  const at = (r: { start: number; run: number[] }, i: number): number =>
    i >= r.start && i < r.start + r.run.length ? r.run[i - r.start] : 0;
  const ra = runOf(a);
  const rb = runOf(b);
  const end = Math.max(ra.start + ra.run.length, rb.start + rb.run.length);
  for (let i = 0; i < end; i++) if (at(ra, i) !== at(rb, i)) return false;
  return true;
}

function resolveTargets(track: MotionTrack, motion: MotionSpec, animName: string): string[] {
  const targetFields = ['slot', 'group', 'bone', ...CONSTRAINT_TRACK_TARGETS] as const;
  const named = targetFields.filter((field) => track[field] !== undefined);
  if (named.length > 1) {
    throw new CompileError(
      `animation "${animName}": a track names more than one target (${named.join(', ')}); the list is ` +
        `${targetFields.join('/')} and a track names exactly one`, 'CE_COMPILE_TRACK_TARGETS_MULTIPLE',
    );
  }
  const family = constraintFamilyOf(track);
  if (family) {
    const { tracks, label } = CONSTRAINT_TRACK_FAMILIES[family];
    const direct = track[family];
    const who = direct === undefined ? `group "${String(track.group)}"` : `${label} "${direct}"`;
    if (!(track.property in tracks)) {
      throw new CompileError(
        `animation "${animName}": ${who} has no timeline "${track.property}" (it has: ${Object.keys(tracks).join(', ')})`, 'CE_COMPILE_CONSTRAINT_TRACK_PROPERTY_UNKNOWN',
      );
    }
    if (direct !== undefined) return [direct];
    const members = motion.groups?.[String(track.group)];
    if (!members) throw new CompileError(`animation "${animName}": unknown group "${String(track.group)}"`, 'CE_COMPILE_ANIMATION_GROUP_UNKNOWN');
    return members;
  }
  // A constraint timeline with no constraint named. Worth its own refusal: the
  // property names a family, so the message can say which field would carry it
  // rather than leaving the track to be read as a slot track and refused for
  // targeting a slot nobody declared.
  const owning = CONSTRAINT_TRACK_TARGETS.filter((f) => track.property in CONSTRAINT_TRACK_FAMILIES[f].tracks);
  if (owning.length) {
    throw new CompileError(
      `animation "${animName}": "${track.property}" is a ${owning.map((f) => CONSTRAINT_TRACK_FAMILIES[f].label).join(' / ')} ` +
        `timeline, and this track names no constraint — put the name in "${owning.join('" or "')}"`, 'CE_COMPILE_CONSTRAINT_TRACK_TARGET_MISSING',
    );
  }
  const isBoneTrack = track.property in BONE_TRACKS;
  if (isBoneTrack && !track.bone && !track.group) {
    throw new CompileError(`animation "${animName}": "${track.property}" is a bone track but no bone is named`, 'CE_COMPILE_BONE_TRACK_TARGET_MISSING');
  }
  if (!isBoneTrack && track.bone) {
    // The bone family's sibling of `compileTrack`'s slot refusal, raised here for
    // the same reason it is raised there: before any key is shaped, and printed
    // from the dispatch table itself. What it replaces named the SLOT family for
    // a property that is usually in no family at all, and enumerated nothing
    // (issue #656). The tail clause is the one case where the old sentence was
    // true — `rgba` and `attachment` really are slot timelines — so the redirect
    // survives as a clause instead of as the whole message, and it is read off
    // `SLOT_TRACKS` rather than spelled again. A constraint property never
    // reaches here: `owning` above refuses it with the field that carries it.
    throw new CompileError(
      `animation "${animName}" bone "${track.bone}" has no timeline "${track.property}" ` +
        `(it has: ${Object.keys(BONE_TRACKS).join(', ')})` +
        (track.property in SLOT_TRACKS ? `. "${track.property}" is a slot timeline — put the name in "slot"` : ''), 'CE_COMPILE_BONE_TRACK_PROPERTY_UNKNOWN',
    );
  }
  if (track.bone) return [track.bone];
  if (track.slot) return [track.slot];
  if (track.group) {
    // A group's members are bones, slots or physics constraints depending on the
    // property, which is what lets `stagger` express a lag across them: four
    // members, one track, a few frames apart — the difference between a ring
    // following the part and two objects moving together, which reads as a
    // composite.
    const members = motion.groups?.[track.group];
    if (!members) throw new CompileError(`animation "${animName}": unknown group "${track.group}"`, 'CE_COMPILE_ANIMATION_GROUP_UNKNOWN');
    // 🚨 The group is the one target shape whose FAMILY is decided by the
    // property, and three tables decide it: `constraintFamilyOf` asks
    // `property in PHYSICS_TRACKS`, this function asks `property in BONE_TRACKS`,
    // and what neither claims falls through to the slot branch. So a property in
    // no table left the dispatch with no family at all and the track was read as
    // a slot track — the first member was then refused for not being a slot
    // (`animation "A" targets unknown slot "rim_grip_a"` on a group of bones and
    // a misspelled bone property), or, when the members really were slots, with
    // the slot table alone on a family nothing had determined (issue #661).
    //
    // Raised AFTER the group's own existence check, because "group G has no
    // timeline P" would otherwise assert a group the file does not declare, and
    // BEFORE the members are resolved against the rig or any key is shaped: the
    // property is what the dispatch reads first, so it is what the refusal is
    // about. All three lists come from the objects the dispatch reads, so none
    // of them can drift from the emitter that owns it. A property that IS in
    // `PHYSICS_TRACKS` never reaches this line — `constraintFamilyOf` returns
    // `physics` for a group track that names one, and the family branch above
    // has already returned — and a path or slider property is refused further up
    // with the field its constraint's name goes in.
    if (!(track.property in BONE_TRACKS) && !(track.property in SLOT_TRACKS)) {
      throw new CompileError(
        `animation "${animName}" group "${track.group}" has no timeline "${track.property}" ` +
          `(a bone group has: ${Object.keys(BONE_TRACKS).join(', ')}; ` +
          `a slot group has: ${Object.keys(SLOT_TRACKS).join(', ')}; ` +
          `a ${CONSTRAINT_TRACK_FAMILIES.physics.label} group has: ${Object.keys(PHYSICS_TRACKS).join(', ')})`, 'CE_COMPILE_GROUP_TRACK_PROPERTY_UNKNOWN',
      );
    }
    return members;
  }
  throw new CompileError(`animation "${animName}": a track targets neither slot nor group`, 'CE_COMPILE_TRACK_TARGET_MISSING');
}

/**
 * The `groups` table itself, checked once before any animation reads it.
 *
 * ⭐ **A member named twice is refused here and nowhere else.** JSON collapses a
 * repeated object key silently, so a repeat inside a `v` map or a `depth` map is
 * unreachable by the time `JSON.parse` is done with it — the group declaration
 * is the one place a repeated member survives into the data, and it is also the
 * place that decides `stagger`'s member order. A duplicate there used to reach
 * the per-target loop and come back as *"animation X has two tracks on
 * eye_l.translatex; merge them"* — true of nothing the author wrote, and it
 * names the wrong file.
 *
 * An **empty** group is refused for the reason a vacuous assertion is: a track
 * naming one compiles no timeline at all, reports nothing, and gates green.
 */
function checkMotionGroups(motion: MotionSpec): void {
  for (const [name, members] of Object.entries(motion.groups ?? {})) {
    if (!Array.isArray(members)) {
      throw new CompileError(`group "${name}" is ${JSON.stringify(members)}; it is an array of member names`, 'CE_COMPILE_GROUP_MEMBERS_NOT_ARRAY');
    }
    if (members.length === 0) {
      throw new CompileError(
        `group "${name}" declares no members, so every track naming it would compile no timeline and gate green`, 'CE_COMPILE_GROUP_MEMBERS_EMPTY',
      );
    }
    const seen = new Set<string>();
    members.forEach((member, i) => {
      if (typeof member !== 'string' || member.length === 0) {
        throw new CompileError(`group "${name}" member ${i} is ${JSON.stringify(member)}; it is a bone or slot name`, 'CE_COMPILE_GROUP_MEMBER_NOT_NAME');
      }
      if (seen.has(member)) {
        throw new CompileError(
          `group "${name}" names member "${member}" twice (at index ${members.indexOf(member)} and ${i}). ` +
            'Member order is what `stagger` counts and what a per-member value map is read against, so a repeat is ' +
            'two different delays and two different values for one bone.', 'CE_COMPILE_GROUP_MEMBER_DUPLICATE',
        );
      }
      seen.add(member);
    });
  }
}

/** Is this `v` the per-member map rather than one value? */
function isMemberValues(v: unknown): v is MotionMemberValues {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Resolve a track's values **per target**: a plain `v` unchanged, a stated `v`
 * map split up, or a `derive` model evaluated — plus the report `explain` prints
 * (issue #295).
 *
 * Every track goes through here, and a track with no per-member value in it
 * comes out holding exactly the keys it went in with. That is deliberate: it
 * makes "`v` means one thing below this line" a property of the type
 * (`MotionValueTrack`) rather than of a branch somebody has to remember.
 *
 * ## Why the whole track is resolved at once
 *
 * Because a model is **one statement about all the members**, and the report has
 * to be able to print them side by side. Evaluating per target would run the
 * closed form once per member, produce N reports of one row each, and lose the
 * only arrangement in which a wrong sign is visible.
 */
function resolveMemberTrack(
  track: MotionTrack,
  animName: string,
  targets: readonly string[],
  bones: readonly ModelBone[],
  derivations: CompileResult['trackDerivations'],
): Map<string, MotionValueTrack> {
  const carriesMap = track.keys.some((key) => isMemberValues(key.v));
  const carriesModel = track.keys.some((key) => key.derive !== undefined);

  const targetKind: 'group' | 'bone' = track.group === undefined ? 'bone' : 'group';
  const target = track.group ?? track.bone ?? String(targets[0]);
  const at = `animation "${animName}" ${targetKind} "${target}" ${track.property}`;
  if ((carriesMap || carriesModel) && track.group === undefined && track.bone === undefined) {
    throw new CompileError(
      `${at}: per-member values need a target whose members are named — put them on a track that names a "group", or ` +
        'a "bone" for the one-member case', 'CE_COMPILE_MEMBER_VALUES_TARGET_UNNAMED',
    );
  }
  if (carriesMap && targetKind === 'bone') {
    throw new CompileError(
      `${at}: a per-member "v" map names members, and a bone track has one target rather than members. Write the ` +
        'value directly, or move the track onto a group.', 'CE_COMPILE_BONE_MEMBER_VALUE_MAP',
    );
  }

  // The setup coordinate a `derive` kind reads, and the parent it is measured in.
  // Resolved here rather than in `src/trackgen.ts` because the rig is the
  // compiler's to read: the model gets numbers that already mean one thing.
  const boneOf = new Map(bones.map((b) => [b.name, b]));
  const perTarget = new Map<string, MotionValueKey[]>();
  for (const name of targets) perTarget.set(name, []);

  for (const key of track.keys) {
    const where = `${at} (t=${key.t})`;
    if (key.derive !== undefined && isMemberValues(key.v)) {
      throw new CompileError(
        `${where}: this key carries both a "derive" model and a per-member "v" map — two answers to one question. ` +
          'The model states the arithmetic and the depths that produced the numbers; the map states the numbers. ' +
          'Pick one.', 'CE_COMPILE_MEMBER_DERIVE_AND_VALUE_MAP',
      );
    }
    if (key.derive === undefined) {
      // Either a plain value (every member gets it, as today) or a stated map.
      if (!isMemberValues(key.v)) {
        for (const name of targets) perTarget.get(name)!.push({ ...key, v: key.v as number[] | string | null });
        continue;
      }
      const table = key.v;
      const known = new Set(targets);
      for (const named of Object.keys(table)) {
        if (!known.has(named)) {
          throw new CompileError(
            `${where}: the value map names "${named}", which group "${target}" does not declare ` +
              `(its members are: ${targets.join(', ')})`, 'CE_COMPILE_MEMBER_VALUE_NAME_UNKNOWN',
          );
        }
      }
      const row: Array<{ member: string; value: number[] | string | null }> = [];
      for (const name of targets) {
        if (!(name in table)) {
          throw new CompileError(
            `${where}: the value map states no value for member "${name}" ` +
              `(it states: ${Object.keys(table).join(', ') || 'nothing'}). ` +
              'A member is refused rather than defaulted: an absent value is exactly the thing a map of six is ' +
              'written to make visible, and defaulting it to the identity would key that one bone with a different ' +
              'motion in silence.', 'CE_COMPILE_MEMBER_VALUE_MISSING',
          );
        }
        const value = table[name];
        perTarget.get(name)!.push({ ...key, v: value });
        row.push({ member: name, value });
      }
      derivations.push({
        animation: animName,
        target,
        targetKind,
        property: track.property,
        time: keyTime(key.t + (track.lag ?? 0)),
        authoredTime: key.t,
        model: null,
        members: row,
      });
      continue;
    }

    // A stated model. The members' setup coordinates come off the rig, and the
    // one thing that makes them comparable is that they are measured in the SAME
    // space — see the refusal below.
    const kind = (key.derive as { kind?: unknown }).kind;
    const coordinate =
      typeof kind === 'string' && kind in TRACK_DERIVE_PROJECTIONS
        ? TRACK_DERIVE_PROJECTIONS[kind as keyof typeof TRACK_DERIVE_PROJECTIONS].coordinate
        : 'x';
    const members: TrackDeriveMember[] = [];
    const parents = new Set<string>();
    for (const name of targets) {
      const bone = boneOf.get(name);
      if (!bone) {
        throw new CompileError(
          `${where}: derive reads member "${name}"'s setup position, and this rig declares no such bone. ` +
            'A model over a group of slots or constraints has no coordinate to be evaluated at — state the values ' +
            'as a "v" map.', 'CE_COMPILE_MEMBER_DERIVE_TARGET_NOT_BONE',
        );
      }
      parents.add(bone.parent ?? '(root)');
      members.push({ name, at: coordinate === 'x' ? (bone.x ?? 0) : (bone.y ?? 0) });
    }
    if (parents.size > 1) {
      throw new CompileError(
        `${where}: derive measures every member's "${coordinate}" from its parent's origin and "about" says where the ` +
          `axis crosses it, so one space is what makes the members comparable. These members sit under ` +
          `${parents.size} different parents (${[...parents].join(', ')}), and their coordinates are therefore ` +
          'measured from different origins. Split the track by parent, or state the values as a "v" map.', 'CE_COMPILE_MEMBER_DERIVE_PARENTS_DIFFER',
      );
    }
    const report = evaluateTrackDerive(key.derive, track.property, members, onModelGrid, where);
    const row: Array<{ member: string; value: number[] | string | null }> = [];
    report.members.forEach((m, i) => {
      perTarget.get(members[i].name)!.push({ ...key, v: [m.value] });
      row.push({ member: m.member, value: [m.value] });
    });
    derivations.push({
      animation: animName,
      target,
      targetKind,
      property: track.property,
      time: keyTime(key.t + (track.lag ?? 0)),
      authoredTime: key.t,
      model: report,
      members: row,
    });
  }

  const out = new Map<string, MotionValueTrack>();
  for (const name of targets) out.set(name, { ...track, keys: perTarget.get(name)! });
  return out;
}

/**
 * What an attachment key may name, per slot, and where the compiler looked.
 *
 * An attachment timeline names a slot and a placeholder and no skin — the skin
 * is the consumer's, applied at run time — so the names a key may draw from are
 * every emitted skin's placeholders for that slot, `default` included. Built in
 * `compileInto` off `skinTables`, under the `-- 5. animations` banner; see the
 * comment there for why it is the emitted tables rather than the spec that decides.
 */
interface SlotAttachmentIndex {
  /** slot -> every placeholder any emitted skin fills it with. */
  bySlot: Map<string, Set<string>>;
  /** The skins consulted, in emit order (`default` first), for the refusal to name. */
  searched: string[];
}

function compileTrack(
  track: MotionValueTrack,
  motion: MotionSpec,
  animName: string,
  duration: number,
  target: string,
  shift: number,
  attachments: SlotAttachmentIndex,
  darkSlots: ReadonlySet<string>,
): ModelKey[] {
  const where = `animation "${animName}" slot "${target}" ${track.property}`;
  // Before any key is shaped, and before the empty-track refusal: a property
  // the emitter has no branch for is the fault, and a track that names one has
  // no shape to be missing keys from (issue #650).
  const shape = SLOT_TRACKS[track.property];
  if (shape === undefined) {
    throw new CompileError(
      `animation "${animName}" slot "${target}" has no timeline "${track.property}" ` +
        `(it has: ${Object.keys(SLOT_TRACKS).join(', ')})`, 'CE_COMPILE_SLOT_TRACK_PROPERTY_UNKNOWN',
    );
  }
  // 🚨 Raised here, with the target and before the keys, for the same reason as
  // the refusal above: the fault is in the pairing of timeline and slot, not in
  // any key. A two-colour timeline poses `SlotPose.darkColor`, and the runtime
  // creates that object only for a slot whose setup pose HAS one — `Slot`'s
  // constructor reads `if (data.setupPose.darkColor != null)` before allocating
  // it. Measured on the emitted file with the refusal removed: `SkeletonJson`
  // loads it in silence, `SlotData.setupPose.darkColor` is `null`, and the first
  // `state.apply` throws `TypeError: null is not an object (evaluating 'dark.r =
  // …')` inside `RGBA2Timeline.apply1`. That is a crash in the consumer's
  // process, from a file every parser accepts — the exact silence this compiler
  // exists to convert into a name (issue #690).
  //
  // `rgb2` is the same pairing and was measured the same way before it joined
  // this refusal (issue #730): the forged file loads, `setupPose.darkColor` is
  // `null`, and `state.apply` throws `TypeError: null is not an object
  // (evaluating 'dark.r = …')` inside `RGB2Timeline.apply1`. The way out it
  // names is its own light-only sibling, which for `rgb2` is `rgb`.
  if ((shape === 'rgba2' || shape === 'rgb2') && !darkSlots.has(target)) {
    throw new CompileError(
      `${where}: slot "${target}" declares no setup "dark", and an "${shape}" timeline poses a slot's dark colour — ` +
        'the runtime allocates one only for a slot whose setup pose has it, so applying this animation throws ' +
        `instead of tinting. Give slot "${target}" a \`dark\` in the rig spec (the colour it holds at rest), or ` +
        `key "${shape === 'rgba2' ? 'rgba' : 'rgb'}" if only the light colour moves`, 'CE_COMPILE_DARK_TIMELINE_SETUP_DARK_MISSING',
    );
  }
  if (!track.keys.length) throw new CompileError(`${where}: no keys`, 'CE_COMPILE_TIMELINE_KEYS_EMPTY');

  const out: ModelKey[] = [];
  for (let i = 0; i < track.keys.length; i++) {
    const key = track.keys[i];
    const next = track.keys[i + 1];
    const time = keyTime(key.t + shift);
    if (i > 0 && time <= (out[i - 1].time as number)) refuseKeyOrder(where, track.keys, i, time, out[i - 1].time as number);
    checkKeyTime(where, time, key.t, duration);

    if (shape === 'attachment') {
      if (key.v !== null && typeof key.v !== 'string') {
        throw new CompileError(`${where}: attachment key value must be a string or null`, 'CE_COMPILE_ATTACHMENT_KEY_VALUE_INVALID');
      }
      // Resolved against every skin, not just `default` — see `SlotAttachmentIndex`.
      const known = attachments.bySlot.get(target);
      if (key.v !== null && !(known?.has(key.v) === true)) {
        // Both halves are the message's work. "searched" answers *where did you
        // look*, which is the question a four-skin rig's author actually has and
        // the one a bare "is not in slot" left them guessing at; the list of
        // placeholders is the value REQUIRED, which the doctrine asks of every
        // failure detail and which the deform refusal above already prints.
        throw new CompileError(
          `${where}: attachment "${key.v}" is not in slot "${target}" under any skin ` +
            `(searched: ${attachments.searched.join(', ')}) — ` +
            (known === undefined || known.size === 0
              ? 'the slot has no attachments at all'
              : `the slot has: ${[...known].join(', ')}`), 'CE_COMPILE_ATTACHMENT_KEY_UNKNOWN',
        );
      }
      if (key.ease) throw new CompileError(`${where}: attachment keys cannot carry an easing`, 'CE_COMPILE_ATTACHMENT_KEY_EASING');
      // Attachment timelines are inherently stepped — exactly what lip-sync wants.
      out.push({ time, name: key.v });
      continue;
    }

    // The five colour shapes `SLOT_TRACKS` names, and between them the only ways
    // left to reach here: `attachment` returned above and a property the table
    // does not carry was refused before any key was shaped.
    //
    // ⚠️ The five differ in three places and nowhere else, so they are read out
    // of `COLOUR_KEYS` rather than forked into five loops: how many channels a
    // `v` carries, which FIELDS the emitted key spells them as (`color`,
    // `value`, or `light` + `dark`), and therefore how long a raw curve array
    // is. Everything else — the ease/curve exclusivity, the stepped case, the
    // hold test, the last-key refusals — is one rule, and a second copy of it is
    // a second thing to keep in step.
    const { spelling, channels } = COLOUR_KEYS[shape];
    const colourOf = (v: number[]): Record<string, string | number> => colourKey(shape, v);
    if (!Array.isArray(key.v)) throw new CompileError(`${where}: ${shape} key value must be ${spelling}`, 'CE_COMPILE_SLOT_KEY_VALUE_SHAPE');
    if (shape === 'alpha' && key.v.length === 1 && !(Number.isFinite(key.v[0]) && key.v[0] >= 0 && key.v[0] <= 1)) {
      // The one colour shape written as a number rather than a byte, so the one
      // that is not clamped onto 0..1 by `channelHex` on the way out. The
      // runtime clamps the POSED alpha (`AlphaTimeline.apply`: `color.a = a < 0
      // ? 0 : a > 1 ? 1 : a`) but interpolates the stored value first, so a key
      // of 1.5 reaches 1 at a different time from a key of 1 — a curve nobody
      // keyed, from a value no pose ever holds. Refused rather than clamped:
      // clamping is choosing the value.
      throw new CompileError(
        `${where}: key at t=${key.t} is ${String(key.v[0])}; an alpha is a number from 0 to 1 — the runtime clamps ` +
          'the posed alpha to that range after interpolating, so a value outside it is one no pose ever holds', 'CE_COMPILE_ALPHA_KEY_RANGE_INVALID',
      );
    }
    const entry: ModelKey = { time, ...colourOf(key.v) };
    if (key.ease !== undefined && key.curve !== undefined) {
      throw new CompileError(`${where}: a key carries both a named easing and a raw curve; pick one`, 'CE_COMPILE_KEY_EASING_AND_CURVE');
    }
    if (key.curve !== undefined) {
      if (!next) throw new CompileError(`${where}: last key carries a curve but has nothing to ease to`, 'CE_COMPILE_LAST_KEY_CURVE');
      entry.curve = rawCurve(key.curve, channels, where, String(key.t));
      out.push(entry);
      continue;
    }
    if (key.ease && next) {
      if (key.ease === 'stepped') {
        entry.curve = 'stepped';
      } else {
        const handles = motion.easings?.[key.ease];
        if (!handles) throw new CompileError(`${where}: unknown easing "${key.ease}"`, 'CE_COMPILE_KEY_EASING_UNKNOWN');
        if (!Array.isArray(next.v)) {
          throw new CompileError(`${where}: ${shape} key value must be ${spelling}`, 'CE_COMPILE_SLOT_KEY_VALUE_SHAPE');
        }
        const t2 = keyTime(next.t + shift);
        // 4 numbers per channel, in the format's own channel order — 16 for
        // `rgba` (r g b a), 12 for `rgb`, 4 for `alpha`, 28 for `rgba2` (light r
        // g b a, then dark r g b, which is the order `readCurve` indexes them in)
        // and 24 for `rgb2`. Short arrays become NaN
        // curves with no error. The hold test reads the emitted hex rather than
        // the authored floats: two colours that quantise to one byte are one
        // colour in the file, and for `rgba2` that has to be true of BOTH — a key
        // whose light holds while its dark moves is not a hold.
        const held = JSON.stringify(colourOf(key.v)) === JSON.stringify(colourOf(next.v));
        entry.curve = easingCurve(handles, time, t2, key.v, next.v, held);
      }
    } else if (key.ease && !next) {
      throw new CompileError(`${where}: last key carries an easing but has nothing to ease to`, 'CE_COMPILE_LAST_KEY_EASING');
    }
    out.push(entry);
  }
  return out;
}
