/**
 * rigc validate — the other half of the tool.
 *
 * The parser is forgiving, and that is the danger: there are at least six ways
 * to write a wrong skeleton that loads with no error at all. So this stage has
 * two layers:
 *
 *   A. Round-trip through the REAL spine-core. If TextureAtlas or SkeletonJson
 *      throws, the artifact is dead on arrival — those are the two failures the
 *      parser does report.
 *   B. Assertions we make ourselves, because the parser will not. Every silent
 *      failure becomes one named machine check here.
 *
 * A failure is a named assertion, and a named assertion is a nonzero exit.
 */
import { dirname, resolve } from 'node:path';
import {
  type Animation,
  AnimationState,
  AnimationStateData,
  AtlasAttachmentLoader,
  BoundingBoxAttachment,
  ClippingAttachment,
  type ConstraintTimeline,
  type CurveTimeline,
  DeformTimeline,
  IkConstraintData,
  Inherit,
  isBoneTimeline,
  isConstraintTimeline,
  isSlotTimeline,
  MeshAttachment,
  MixFrom,
  PathAttachment,
  PathConstraintData,
  PathConstraintMixTimeline,
  Physics,
  PhysicsConstraintData,
  PhysicsConstraintPose,
  PhysicsConstraintResetTimeline,
  PhysicsConstraintTimeline,
  Property,
  RegionAttachment,
  SequenceTimeline as RuntimeSequenceTimeline,
  Skeleton,
  SkeletonJson,
  SliderData,
  TextureAtlas,
  type TextureAtlasRegion,
  type Timeline,
  ToRotate,
  ToScaleX,
  ToScaleY,
  ToShearY,
  ToX,
  ToY,
  TransformConstraintData,
} from '@esotericsoftware/spine-core';
// ⚠️ `src/` reaches outside itself for exactly two modules and this is one of
// them, so it is already on `package.json`'s `files` allowlist — see CLAUDE.md.
// A19 needs the DECODED page, not its header, to measure one region's own
// rectangle on a shared page.
import { BEZIER_POINTS, curveStorage, surveyDeformKeys } from './deformmeasure.ts';
import {
  LEGACY_BONE_INHERIT_KEY,
  spineGeneration,
  TOPLEVEL_CONSTRAINT_ARRAYS,
  type SpineGeneration,
} from './generation.ts';
import { posedNumbersOf } from './render.ts';
import { MODEL_DOCUMENT_SPEC } from './model.ts';
import { BONE_INHERIT_KNOWN } from './rig.ts';
import {
  CHANNELS_BY_KIND,
  physicsRuleFor,
  SLOT_COLOR_CHANNELS,
  walkTimelines,
} from './timelines.ts';
import type { RigInfo } from './types.ts';
import { ASSERTION_KIND, kindRunsUnder, resolveProfile, type AssertionProfile } from './assertions/kinds.ts';
import { verdictHarness, type Failure } from './assertions/harness.ts';
import { isObj, type Json } from './assertions/values.ts';
import type { SkinEntryFacts } from './assertions/facts/skin_entries.ts';
import type { AtlasPageFacts } from './assertions/facts/atlas_pages.ts';
import type { SlotColourFacts, SlotTimelines } from './assertions/facts/slot_colour.ts';
import { a03RegionWidthHeightFinite } from './assertions/bodies/a03.ts';
import { a17AtlasPageFilesExist } from './assertions/bodies/a17.ts';
import { a18DeterministicEmit } from './assertions/bodies/a18.ts';
import { a45SeparableColorTimelinesOwnTheirChannelsAndPoseAsWritten } from './assertions/bodies/a45.ts';
import { attachmentRegionLookups, type AttachmentRegionJoin } from './assertions/region_lookups.ts';
import { attachmentRegionJoins } from './region_joins.ts';
import type { AnimatedBoneFacts } from './assertions/facts/animated_bones.ts';
import type { RegionJoinFacts } from './assertions/facts/region_joins.ts';
import type { StageFacts } from './assertions/facts/stage.ts';
import type { AtlasRegionFacts } from './assertions/facts/atlas_regions.ts';
import type { SkinMemberFacts } from './assertions/facts/skin_members.ts';
import { a08RegionNamesMatchAttachments } from './assertions/bodies/a08.ts';
import { a13MeshBudget } from './assertions/bodies/a13.ts';
import { a14NoFullFrameMesh } from './assertions/bodies/a14.ts';
import { a15IdleNoMeshBoneKeys } from './assertions/bodies/a15.ts';
import { a22MeshUvsInUnitRange } from './assertions/bodies/a22.ts';
import { a38SkinMembersAreSkinRequired } from './assertions/bodies/a38.ts';
import { a06AtlasPageSizeMatchesPng } from './assertions/bodies/a06.ts';
import { a19OverlayPngsHaveAlpha } from './assertions/bodies/a19.ts';
import { a49PackedFootprintsDoNotOverlap } from './assertions/bodies/a49.ts';
import { a50StageBoxIsTheStage } from './assertions/bodies/a50.ts';
import { a51BonesLieAlongTheirDeclaredAxis } from './assertions/bodies/a51.ts';
import { inactiveAtSetup, type SetupWorldFacts } from './assertions/facts/setup_world.ts';
import { SKIP_NO_STAGE_BOX, type StageBoxFacts } from './assertions/facts/stage_box.ts';
import type { MeshEntry as MeshAttachmentEntry, MeshFacts } from './assertions/facts/mesh_attachments.ts';
import type { ClipEnd, PolygonEntry, PolygonFacts } from './assertions/facts/vertex_polygons.ts';
import type { LinkEntry, LinkFacts } from './assertions/facts/linked_meshes.ts';
import type { ConstraintEntry, ConstraintFacts, ConstraintTimeline as ConstraintTimelineFact } from './assertions/facts/constraints.ts';
import { switchedOn } from './assertions/constraint_words.ts';
import { a04MeshTrianglesAndEncoding } from './assertions/bodies/a04.ts';
import { a20MeshWeightsCoherent } from './assertions/bodies/a20.ts';
import { a21MeshRimPinned } from './assertions/bodies/a21.ts';
import { a23PhysicsConstraintEffective } from './assertions/bodies/a23.ts';
import { a28RibbonRowsShareWeights } from './assertions/bodies/a28.ts';
import { a33VertexAttachmentGeometry } from './assertions/bodies/a33.ts';
import { a36PathConstraintEffective } from './assertions/bodies/a36.ts';
import { a37SliderConstraintEffective } from './assertions/bodies/a37.ts';
import { a42DrivenConstraintsUpdateAfterTheirDriver } from './assertions/bodies/a42.ts';
import { a44LinkedMeshStatesNoGeometryOfItsOwn } from './assertions/bodies/a44.ts';
import { a47IkConstraintNotMutedThroughout } from './assertions/bodies/a47.ts';
import { a48TransformConstraintNotMutedThroughout } from './assertions/bodies/a48.ts';
import type { RosterBone, RosterSlot, SkeletonRosterFacts } from './assertions/facts/skeleton_roster.ts';
import type { BoneTimelineFacts, BoneTimelines } from './assertions/facts/bone_timelines.ts';
import type { EventKeyEntry, EventKeyFacts } from './assertions/facts/event_keys.ts';
import { a12NoDarkColor } from './assertions/bodies/a12.ts';
import { a24AxisSpaceStroke } from './assertions/bodies/a24.ts';
import { a25DetachedBoneParentage } from './assertions/bodies/a25.ts';
import { a26SlotDrawOrder } from './assertions/bodies/a26.ts';
import { a29StrokeWithinContactDepth } from './assertions/bodies/a29.ts';
import { a30StrokeWithinCapContainment } from './assertions/bodies/a30.ts';
import { a32EventKeysResolve, eventKeyAt } from './assertions/bodies/a32.ts';
import {
  SKIP_NO_ANIMATION,
  SKIP_NO_ATLAS,
  SKIP_NO_ATLAS_PAGE,
  SKIP_NO_MESH_ATTACHMENT,
  SKIP_NO_POSE,
  SKIP_NO_SKELETON,
  SKIP_NO_TIMELINE,
} from './assertions/reasons.ts';
import type { DeformSurveyFacts } from './assertions/facts/deform_survey.ts';
import type { AnimationDurationFacts } from './assertions/facts/animation_durations.ts';
import type { TwoColourFacts } from './assertions/facts/two_colour.ts';
import { entryAddress, type EntryAddress, type SequenceFacts, type SequenceSkinEntry, type SequenceTimeline } from './assertions/facts/sequences.ts';
import { a39DeformKeepsTriangleWinding } from './assertions/bodies/a39.ts';
import { a09AnimationDurationMatchesSpec } from './assertions/bodies/a09.ts';
import { a43TwoColorTintLoadsAndPosesAsWritten } from './assertions/bodies/a43.ts';
import { a46SequenceAttachmentsShowTheFrameTheFileStates } from './assertions/bodies/a46.ts';
import type { SliderCompositionFacts, SliderFact, SliderTimelineFact } from './assertions/facts/slider_composition.ts';
import type { ConstraintTargetFacts, TargetAnimation, TargetKeyArray } from './assertions/facts/constraint_targets.ts';
import { a34ConstraintTimelineTargets } from './assertions/bodies/a34.ts';
import { a40SlidersComposeOnASharedTarget } from './assertions/bodies/a40.ts';
import { a10NoNanAfterStepping } from './assertions/bodies/a10.ts';
import { a52WeightedVerticesShareOneBoneOrder } from './assertions/bodies/a52.ts';
import type { SteppedFrame, SteppedPoseFacts } from './assertions/facts/stepped_poses.ts';

export type { Failure } from './assertions/harness.ts';

/**
 * Which body of rules to hold the artifact to.
 *
 * ⭐ The distinction this draws is the difference between "wrong" and "not how we
 * do it here", and conflating the two is how a validator stops being usable on
 * anybody else's data. Fifteen of the 40 assertions are policy — seven for one
 * renderer (`rig-play`) and one project's canvas budget, eight for rigc's own
 * formations — and every one of them fires
 * on real, correct, editor-produced Spine data — the official example projects
 * carry clipping attachments, unweighted meshes, 116-triangle meshes and packed
 * atlases, all of which are perfectly valid and none of which spine-html likes.
 *
 * - `spine`      — is this valid Spine 4.3 that any runtime will play correctly?
 * - `rig-play`   — the above, plus this project's renderer and archetype policy.
 *
 * ⚠️ `validate()` has NO default profile — `ValidateInput.profile` is required,
 * and that is deliberate. A silent default here can only be wrong in one of two
 * directions: loosen it and a caller who did not ask gets a weaker gate than the
 * one they think they ran; tighten it and foreign data is refused by a policy the
 * caller has no stake in. Issue #221 flipped the CLI to `spine` while several
 * internal callers still wanted `spine-html`, at which point one constant could
 * no longer honestly serve both — so the choice is made at every call site now,
 * by the caller who knows which question they are asking.
 */
export type ValidateProfile = AssertionProfile;

// The profiles, the CLI's default and the report printer — `./assertions/report.ts` since issue #1060, so the
// entry that links none of spine-core gates and prints with them; every one is re-exported from here.
export { CLI_DEFAULT_PROFILE, reportLines, VALIDATE_PROFILES } from './assertions/report.ts';

// What kind of rule each assertion is — `./assertions/kinds.ts` since issue
// #1025, where the model side's harness reads the same table.

/**
 * Every assertion this validator knows, in registry order.
 *
 * Exported so a control can count them instead of quoting a number that goes
 * stale the next time one is added — two selftest cases used to assert `39` and
 * `14` as literals, which is a guardrail that has to be remembered rather than
 * one that holds.
 */
export const ASSERTION_NAMES: readonly string[] = Object.keys(ASSERTION_KIND);

/** How many assertions this profile applies, by the kinds it carries. */
export function assertionCountForProfile(profile: ValidateProfile): number {
  if (profile === 'rig-play') return ASSERTION_NAMES.length;
  return ASSERTION_NAMES.filter((name) => ASSERTION_KIND[name] === 'validity').length;
}

// What a SKIP says, by what the assertion was denied — `./assertions/reasons.ts`
// since issue #1025, so the assertion bodies that moved out of this file print
// the same sentences on both sides; every one is re-exported from here.
export {
  SKIP_NO_ANIMATION,
  SKIP_NO_ATLAS,
  SKIP_NO_ATLAS_PAGE,
  SKIP_NO_ATLAS_REGION,
  SKIP_NO_ATTACHMENT_REGION_JOIN,
  SKIP_NO_DECLARED_DURATION,
  SKIP_NO_LINKED_MESH,
  SKIP_NO_MESH_ATTACHMENT,
  SKIP_NO_PHYSICS_CONSTRAINT,
  SKIP_NO_POSE,
  SKIP_NO_REGION_ATTACHMENT,
  SKIP_NO_SEPARABLE_COLOR,
  SKIP_NO_SEQUENCE,
  SKIP_NO_SKELETON,
  SKIP_NO_TIMELINE,
  SKIP_NO_TWO_COLOR_TINT,
} from './assertions/reasons.ts';

export interface ValidateInput {
  skeletonText: string;
  atlasText: string;
  /** Directory the atlas lives in; page names resolve against it. */
  atlasDir: string;
  /** Declared durations from the motion spec. */
  declaredDurations?: Record<string, number>;
  /**
   * The compiled model's document (`modelDocument`, `rigc-compiled/1`) — the
   * third file `build` writes. Required whenever `reEmit` is given, since `A18`
   * compares it with the second compile's (issue #922).
   */
  modelText?: string;
  /** Re-emitted artifacts, for the determinism check: a second, independent compile's three texts. */
  reEmit?: { skeletonText: string; atlasText: string; modelText: string };
  /**
   * Structural expectations the artifact cannot state about itself: which mesh is
   * a ribbon, which bone carries the axis, which parentage is forbidden, what the
   * canonical draw order is. Absent when `validate <dir>` is pointed at a bare
   * directory, and the assertions that need it then SKIP rather than guess — the
   * stats line says `rig=absent` so a green run cannot be mistaken for a full one.
   */
  rig?: RigInfo;
  /**
   * Which body of rules to apply. Required, and deliberately so — there is no
   * default to fall into. See ValidateProfile.
   */
  profile: ValidateProfile;
}

export interface ValidateReport {
  failures: Failure[];
  /** Assertions that ran and passed, in order. */
  passed: string[];
  /**
   * Assertions that had no data to run against, with the reason.
   *
   * ⚠️ Not cosmetic. An assertion whose subject is a per-cut MEASUREMENT (a
   * contact depth, a containment ceiling) is vacuous on a cut that never measured
   * one, and reporting that as PASS is this project's favourite false green: a
   * gate that says it checked something it never looked at. So the report says
   * SKIP and why, and `passed` does not count it.
   */
  skipped: Array<{ assertion: string; reason: string }>;
  /** Which body of rules ran. */
  profile: ValidateProfile;
  /**
   * Assertions this profile does not apply, with their kind.
   *
   * Kept separate from `skipped` on purpose: a SKIP means "there was nothing to
   * look at", a profile skip means "this rule was deliberately out of scope".
   * Reading a `--profile spine` green as though the renderer policy had passed
   * is exactly the misreading the two lists exist to prevent.
   */
  profileSkipped: Array<{ assertion: string; kind: 'renderer' | 'archetype' }>;
  stats: Record<string, number | string>;
}

// The four sentences A39 prints a frame, a dial's reach, a dispute and a tie
// with, and A09's one-frame slack, are `./assertions/bodies/a39.ts`'s and
// `./assertions/bodies/a09.ts`'s since issue #1025 (cut 4c-3).

/**
 * The constraint groups that spell `group.<constraint>.<timeline>` — a
 * constraint name, then named timelines under it (A34's second shape).
 *
 * A constant rather than a literal in the loop because the same three names
 * have to pick the timeline vocabulary out of `CHANNELS_BY_KIND` for A34's
 * message, and a group listed in one place and not the other is a group whose
 * constraint nobody resolves. `ik` and `transform` are the other shape — one
 * unnamed timeline per constraint — and are enumerated separately there.
 */
const NAMED_TIMELINE_GROUPS = ['path', 'physics', 'slider'] as const;

// The physics components, the muted-at-rest sentences and `SETUP_POSE_SAYS`
// that stood here are `./assertions/constraint_words.ts`'s and
// `./assertions/bodies/a23.ts`'s since issue #1025 (cut 4c-2): every rule
// that read them moved there.

/**
 * Every value one channel of a curve timeline can pose while it plays: each
 * key's own value, and every sample of each Bezier segment the parser built
 * between two keys (issue #752).
 *
 * ⚠️ The samples are the half a reading of the keys alone misses. The runtime
 * interpolates a Bezier segment between the points `setBezier` stored
 * (`Animation.js:257-298`), not between the two keys, so two keys of 0 joined
 * by a curve whose handles lie above 0 pose values above 0 in between.
 * [measured] on generated fixtures, a `mix` pair of 0 → 0 with its handles at
 * 0.8 poses a path constraint's bone up to 32.69 away from the flat pair, a
 * slider's by 0.54 and a physics constraint's by 3.81. Between two stored
 * points the runtime is linear, so nothing it poses lies outside this list's
 * range — which is what makes "is any of these above 0" the whole question.
 *
 * Channel `c` of frame `f` is `frames[f * entries + 1 + c]`. `curves[f]` is 0
 * for linear, 1 for stepped and `2 + i` for a Bezier whose points start at `i`
 * (`Animation.js:259-261`); `readCurve` stores one segment per channel in
 * order, so channel `c`'s points start `2 * BEZIER_POINTS * c` further on, as
 * `(time, value)` pairs. The storage is read through `curveStorage`, the one
 * reach into that protected array, which `deformmeasure.ts` owns.
 */
function curveChannelValues(timeline: CurveTimeline, channel: number): number[] {
  const entries = timeline.getFrameEntries();
  const curves = curveStorage(timeline);
  const values: number[] = [];
  for (let i = 0, frame = 0; i < timeline.frames.length; i += entries, frame++) {
    values.push(timeline.frames[i + 1 + channel]);
    const code = curves[frame];
    if (!(code >= 2)) continue;
    const start = code - 2 + 2 * BEZIER_POINTS * channel;
    for (let point = 0; point < BEZIER_POINTS; point++) values.push(curves[start + 2 * point + 1]);
  }
  return values;
}

/** `physicsTimelineNames`' table, once it has been built. */
let physicsTimelineNamesTable: Record<number, string> | null = null;

/**
 * The skeleton-JSON name of each physics timeline, keyed by the runtime's own
 * `Property` id.
 *
 * ⚠️ Derived from the enum rather than from `timeline instanceof
 * PhysicsConstraintMassTimeline` and rather than from a list of digits: the ids
 * are what `ConstraintTimeline1` puts in its propertyId (`<Property>|<index>`),
 * and a renumbering of the enum moves both sides of this map at once. The names
 * on the right are the ones `SkeletonJson`'s physics branch reads
 * (`SkeletonJson.js:1063-1094`), which is also what a motion spec's `property`
 * says.
 *
 * ⚠️ Built on first use, not while the module loads (issue #1014): the
 * computed keys read the runtime's `Property` enum, and seven reads of it at
 * load time were the only spine-core access a module made before a command
 * ran — so `--help`, `render` and `check` on a rigc build all touched the
 * runtime for a table only the gate's physics rules consult.
 */
export function physicsTimelineNames(): Record<number, string> {
  physicsTimelineNamesTable ??= {
    [Property.physicsConstraintInertia]: 'inertia',
    [Property.physicsConstraintStrength]: 'strength',
    [Property.physicsConstraintDamping]: 'damping',
    [Property.physicsConstraintMass]: 'mass',
    [Property.physicsConstraintWind]: 'wind',
    [Property.physicsConstraintGravity]: 'gravity',
    [Property.physicsConstraintMix]: 'mix',
  };
  return physicsTimelineNamesTable;
}

/**
 * Which physics constraints a physics timeline that names NO constraint writes
 * into — the one reading of the unnamed form, for every rule that has to answer
 * it (`A23`, `A34`, `A42`; issue #726).
 *
 * `SkeletonJson` gives a physics group keyed by the empty name `constraintIndex
 * -1` (`SkeletonJson.js:1048-1054`), and the runtime reads that two ways. A
 * value timeline writes every active physics constraint whose own data declares
 * that property global — `PhysicsConstraintTimeline.apply` asks each subclass's
 * `global` (`Animation.js:2067-2075`). `reset` resets every active one and asks
 * no flag at all (`:2234-2238`). Activity is a skin question and is not asked
 * here: a constraint a skin switches on is still one the timeline can reach.
 *
 * 🔑 `constraints` may be the FILE's objects rather than loaded data, and that
 * is what makes this one reading rather than two: `SkeletonJson` copies each
 * `…Global` field onto the data verbatim (`:313-319`), so the runtime's own
 * `global`, asked of the raw object, reads exactly what it would read of the
 * loaded one — a string `"false"` included, which is truthy to both. A rule that
 * spelled `<property>Global` itself would be a second copy of the runtime's
 * table, free to disagree with it.
 */
export function unnamedPhysicsReach<C extends object>(timeline: Timeline, constraints: readonly C[]): C[] {
  if (timeline instanceof PhysicsConstraintResetTimeline) return [...constraints];
  if (!(timeline instanceof PhysicsConstraintTimeline)) return [];
  return constraints.filter((one) => Boolean(timeline.global(one as unknown as PhysicsConstraintData)));
}

/**
 * The timeline the runtime builds for one physics timeline NAME, read by the
 * runtime's own parser off a skeleton that holds nothing else — or null for a
 * name its physics branch skips (`SkeletonJson.js:1094`).
 *
 * ⚠️ This is how a raw-JSON rule gets the runtime's class for a name without a
 * table of the eight: a hand-kept map from `"strength"` to
 * `PhysicsConstraintStrengthTimeline` is the copy this avoids, and the parser's
 * `switch` is already that map. The probe skeleton declares no constraint, so
 * the only group it can carry is the unnamed one, and one key is all
 * `readTimeline1` needs to build the object.
 */
export function unnamedPhysicsTimeline(name: string): Timeline | null {
  const probe = new SkeletonJson(new AtlasAttachmentLoader(new TextureAtlas(''))).readSkeletonData({
    skeleton: {},
    animations: { probe: { physics: { '': { [name]: [{}] } } } },
  });
  return probe.animations[0]?.timelines[0] ?? null;
}

/**
 * The generation `A16` demands, which is the whole of what that assertion is
 * about: the MAJOR.MINOR pair.
 *
 * ⭐ **The reading itself moved to [`generation.ts`](generation.ts)** with issue
 * #706 — one reader of `skeleton.spine` for the whole repository, because
 * `ingest` has to ask the same question of a file somebody else wrote and two
 * regexes would answer it two ways. What did NOT move is the accepted set:
 * `4.3`, `4.3.<patch>` and `4.3.<patch>-<suffix>`, the last of which is what the
 * editor writes for a pre-release (`"4.3.75-beta"` in all twelve official
 * example exports, and the string the original `/^4\.3(\.\d+)?$/` rejected —
 * blocker B2). `GN05` holds that set against the old regex, which survives in
 * `selftest.ts` and nowhere else, for exactly that comparison.
 */
const SPINE_4_3: SpineGeneration = '4.3';

// `Json`, `isObj` and `atStoredKey` are `./assertions/values.ts`'s since issue
// #1025: the bodies that moved out of this file read values the same way.

// `attachmentRegionLookups` and `AttachmentRegionJoin` are
// `./assertions/region_lookups.ts`'s since issue #1025: A08's body runs on both
// sides, and the model side links nothing from the runtime. Re-exported here.
export { attachmentRegionLookups, type AttachmentRegionJoin };

// `attachmentRegionJoins` is `./region_joins.ts`'s since issue #1052: `explain` reads it, and an entry that links
// nothing of the runtime has to be able to load what `explain` reads. Re-exported here.
export { attachmentRegionJoins };

/**
 * The mesh keys the `source` branch never reaches — the geometry a linked mesh
 * may state and nothing reads (issue #710).
 *
 * Derived from the branch rather than chosen. `readAttachment` returns at
 * `SkeletonJson.js:586` as soon as `source` is truthy, and everything below that
 * return reads `map.uvs` (twice: as the length handed to `readVertices` and as
 * `regionUVs`), `map.triangles`, `map.edges` and `map.hull`. `vertices` is on the
 * list because `readVertices` reads `map.vertices` and nothing else (`:654`), so
 * it goes unread with the call that would have read it.
 *
 * ⚠️ `width` and `height` are NOT on this list, although `setSourceMesh`
 * overwrites both with the source's (`MeshAttachment.js:102-103`). The branch
 * reads them at `:569-570`, the format carries them on a link and rigc emits
 * them (#691). A key the parser reads is not a key the parser ignores, whatever
 * a later pass does with the value.
 */
const LINKED_MESH_UNREAD_KEYS = ['uvs', 'triangles', 'vertices', 'hull', 'edges'] as const;

/** One linked mesh as the FILE spells it, before the loader has resolved anything. */
interface RawLinkedMesh {
  /** The placeholder of the mesh whose geometry this attachment draws. */
  source: string;
  /**
   * The `skin` the entry states, or `undefined` for the parser's default — which
   * is the DEFAULT skin and never the skin the link is written in (`:429`).
   */
  skin?: string;
  /** The `slot` the entry states, or `undefined` for the parser's default: this attachment's own slot (`:573-579`). */
  slot?: string;
  /** Which of `LINKED_MESH_UNREAD_KEYS` this entry states, in that order. */
  geometry: string[];
  /**
   * How big a mesh those keys describe — `uvs.length / 2` and
   * `triangles.length / 3` — when the entry states them as arrays.
   *
   * Read so that the failure can put the shape the author wrote beside the shape
   * the runtime draws. `undefined` where the file states the key as something
   * other than an array, which is a file this rule refuses for the key rather
   * than for its length.
   */
  statedVertices?: number;
  statedTriangles?: number;
}

/**
 * `"<skin>\0<slot>\0<placeholder>" -> source` for every linked mesh the raw
 * skeleton declares, with what the file says about each one (issues #691, #710).
 *
 * 🔑 The format decides it, and not by `type`: `type: "mesh"` and
 * `type: "linkedmesh"` share one branch of the reader and a truthy `source` is
 * what decides between them (`SkeletonJson.js:568-569`, `:582`). An empty
 * `source` is falsy there, so it is not a link here either — that map is read
 * as an ordinary mesh, which is exactly what the runtime does with it.
 */
function rawLinkedMeshes(raw: unknown): Map<string, RawLinkedMesh> {
  const links = new Map<string, RawLinkedMesh>();
  if (!isObj(raw) || !Array.isArray(raw.skins)) return links;
  for (const skin of raw.skins as unknown[]) {
    if (!isObj(skin) || !isObj(skin.attachments)) continue;
    const skinName = typeof skin.name === 'string' ? skin.name : '(unnamed)';
    for (const [slot, entries] of Object.entries(skin.attachments)) {
      if (!isObj(entries)) continue;
      for (const [placeholder, entry] of Object.entries(entries)) {
        if (!isObj(entry)) continue;
        const type = entry.type === undefined ? 'region' : entry.type;
        if (type !== 'mesh' && type !== 'linkedmesh') continue;
        const source = entry.source;
        if (typeof source !== 'string' || source.length === 0) continue;
        links.set(`${skinName}\u0000${slot}\u0000${placeholder}`, {
          source,
          skin: typeof entry.skin === 'string' ? entry.skin : undefined,
          slot: typeof entry.slot === 'string' ? entry.slot : undefined,
          geometry: LINKED_MESH_UNREAD_KEYS.filter((key) => entry[key] !== undefined),
          statedVertices: Array.isArray(entry.uvs) ? entry.uvs.length / 2 : undefined,
          statedTriangles: Array.isArray(entry.triangles) ? entry.triangles.length / 3 : undefined,
        });
      }
    }
  }
  return links;
}

/**
 * How long the array a deform key edits is, read off one raw attachment — or
 * `null` when the file does not say.
 *
 * The rule is `readVertices`' own: the attachment's `vertices` is coordinates
 * when its length equals `worldVerticesLength`, and a weight run otherwise. A
 * deform array is therefore one `x, y` pair per **vertex** in the first case and
 * one per **bone influence** (`vertices.length / 3`) in the second — the same
 * count with two different meanings, which is exactly why this measures rather
 * than assumes.
 *
 * `null` for the two shapes that cannot be measured from this object alone: a
 * type with no vertices at all (nothing to deform, and the parser throws on it),
 * and a `linkedmesh`, whose geometry belongs to another attachment.
 */
function deformArrayLength(att: Json): number | null {
  const type = typeof att.type === 'string' ? att.type : 'region';
  let worldVerticesLength: number;
  if (type === 'mesh') {
    if (!Array.isArray(att.uvs)) return null;
    worldVerticesLength = att.uvs.length;
  } else if (type === 'boundingbox' || type === 'clipping' || type === 'path') {
    if (typeof att.vertexCount !== 'number') return null;
    worldVerticesLength = att.vertexCount * 2;
  } else {
    return null;
  }
  if (!Array.isArray(att.vertices)) return null;
  const vertices = att.vertices as unknown[];
  if (vertices.length === worldVerticesLength) return worldVerticesLength;
  // ⚠️ Weighted, and the length is the INFLUENCE COUNT — which is the sum of the
  // per-vertex bone counts, not a division of this array's length. The file
  // holds `boneCount` followed by `boneIndex, x, y, weight` per influence, so a
  // one-bone vertex is FIVE numbers; `readVertices` unpacks that into three
  // numbers per influence, which is where the parser's own `/3*2` comes from and
  // exactly why it cannot be applied to the raw form. Applied here it measured
  // `gallery/flex`'s 77-vertex leaf at 256.667 against its true 154 and put
  // A35's bar two thirds too wide on every weighted mesh — the silence A35
  // exists to break, arriving inside A35.
  //
  // Derived here rather than shared with `src/compile.ts`'s own walk on purpose:
  // the gate re-derives from the emitted file so that it is not checking the
  // compiler's assumptions with the compiler's code. Both had this wrong, which
  // is an argument for a control on each and not for one implementation.
  let influences = 0;
  for (let i = 0; i < vertices.length; ) {
    const n = vertices[i++];
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) return null;
    influences += n;
    i += n * 4;
    if (i > vertices.length) return null;
  }
  return influences * 2;
}

/**
 * What one timeline's own `apply` does with the `add` argument.
 *
 * - `accumulates` — a second application adds to the first, so two sliders both
 *   `additive` compose on it.
 * - `overwrites` — it writes its value whatever `add` says, so the later slider
 *   owns the property and `"additive": true` is not the repair.
 * - `inert` — applied with the arguments a slider passes it changes nothing a
 *   pose holds, so there is nothing for a second slider to erase.
 */
export type TimelineAddBehaviour = 'accumulates' | 'overwrites' | 'inert';

/**
 * The displacement the second start state carries, chosen to be exact in binary
 * floating point so the probe adds no rounding of its own.
 */
const PROBE_DISPLACEMENT = 0.375;

/** Every own value of a pose object a timeline could have written, each as its key and its text. */
function poseParts(pose: object): Array<[string, string]> {
  const parts: Array<[string, string]> = [];
  for (const key of Object.keys(pose).sort()) {
    const value = (pose as Record<string, unknown>)[key];
    if (value === null || value === undefined || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
      parts.push([key, String(value)]);
      continue;
    }
    if (Array.isArray(value)) {
      const entries: unknown[] = value;
      if (entries.every((one) => typeof one === 'number')) parts.push([key, `[${entries.join(',')}]`]);
      continue;
    }
    if (typeof value !== 'object') continue;
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    // A colour, or anything else built only of numbers. Everything with a
    // structure — a bone back-reference, a slot's data — is either an identity
    // (read by name below) or something no timeline writes.
    if (keys.length > 0 && keys.every((one) => typeof record[one] === 'number')) {
      parts.push([key, `{${keys.map((one) => `${one}:${String(record[one])}`).join(',')}}`]);
    } else if (typeof record.name === 'string') {
      parts.push([key, `@${record.name}`]);
    }
  }
  return parts;
}

/** Every own value of a pose object a timeline could have written, as text. */
function poseReading(pose: object): string {
  return poseParts(pose).map(([key, text]) => `${key}=${text}`).join(',');
}

/** The whole of what a timeline could have changed, in one comparable string. */
function skeletonReading(skeleton: Skeleton): string {
  const parts: string[] = [];
  for (const bone of skeleton.bones) parts.push(poseReading(bone.appliedPose));
  for (const slot of skeleton.slots) parts.push(poseReading(slot.appliedPose));
  for (const constraint of skeleton.constraints) parts.push(poseReading(constraint.appliedPose as object));
  parts.push(skeleton.drawOrder.appliedPose.map((slot) => slot.data.name).join('>'));
  return parts.join('|');
}

/**
 * The two start states a probe is taken from, in order: the setup pose, and the
 * setup pose displaced.
 *
 * ⚠️ Both are needed and neither is redundant. From the **setup** pose a
 * `DeformTimeline` is live, because its `apply` is gated on the slot still
 * holding the attachment the timeline names. From the **displaced** pose a
 * timeline whose every key states its target's own setup value is still seen to
 * write, which from the setup pose alone would read as `inert` — a later slider
 * keying a slot's colour to exactly the colour it already has erases an earlier
 * one just the same.
 */
function probeStartStates(skeleton: Skeleton): Array<() => void> {
  return [
    () => undefined,
    () => {
      for (const bone of skeleton.bones) displacePose(bone.appliedPose);
      for (const slot of skeleton.slots) {
        displacePose(slot.appliedPose);
        slot.appliedPose.setAttachment(null);
      }
      for (const constraint of skeleton.constraints) displacePose(constraint.appliedPose as object);
      skeleton.drawOrder.appliedPose.push(...skeleton.drawOrder.appliedPose.splice(0, 1));
    },
  ];
}

/** Move every number a pose holds, so "it wrote nothing" cannot mean "it wrote what was there". */
function displacePose(pose: object): void {
  for (const key of Object.keys(pose)) {
    const value = (pose as Record<string, unknown>)[key];
    if (typeof value === 'number') {
      (pose as Record<string, number>)[key] = value + PROBE_DISPLACEMENT;
      continue;
    }
    if (value === null || typeof value !== 'object' || Array.isArray(value)) continue;
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    if (keys.length > 0 && keys.every((one) => typeof record[one] === 'number')) {
      for (const one of keys) (record as Record<string, number>)[one] += PROBE_DISPLACEMENT;
    }
  }
}

/** Every time the timeline's own frames name, the midpoints between them, and one past the end. */
function probeTimes(timeline: Timeline): number[] {
  const stride = timeline.getFrameEntries();
  const frames = timeline.frames;
  const at: number[] = [];
  for (let i = 0; i < frames.length; i += stride) at.push(frames[i]);
  const between: number[] = [];
  for (let i = 1; i < at.length; i++) between.push((at[i - 1] + at[i]) / 2);
  return [...at, ...between, (at.length ? at[at.length - 1] : 0) + 1];
}

/**
 * 🚨 **What `apply` does with `add`, posed rather than read off a flag.**
 *
 * `Timeline.additive` is the runtime's own declaration that a class "supports
 * being applied additively", and for two classes it is not what the class does:
 * `PathConstraintMixTimeline` and `SliderTimeline` declare `false` and pass the
 * `add` argument straight through anyway. A40 read the flag, so it refused two
 * correct rigs with a sentence about the runtime the runtime does not perform
 * (issue #655, measured by `PS143` over all thirty spellings of the motion
 * vocabulary).
 *
 * So the answer is taken from the object instead. The timeline is applied with
 * exactly the arguments `Slider.update` passes — `firedEvents` null, `alpha` 1,
 * `MixFrom.current`, `appliedPose` true — **twice**, at every time its own
 * frames name. A second application that moves the pose again is a class that
 * honours `add`; one that lands on the same value is a class that writes
 * outright; one that never moves the pose at all writes nothing a second slider
 * could erase, which is what an events timeline under a slider *is*.
 *
 * ⛔ Rejected: reading the source of `apply` (not a measurement of anything, and
 * a class whose body changes under a runtime bump would still read the old
 * answer), and a table of the two disagreeing classes written here (the same
 * hand-kept list this repository has a judgment about — it would have been
 * written after the census found two and been wrong at the third).
 *
 * ⚠️ **The skeleton wears every skin in turn, and that is not thoroughness.**
 * `Skeleton.updateCache` leaves a `skinRequired` constraint inactive under the
 * skins that do not list it, and an inactive target makes ANY timeline read
 * `inert` — a fact about that skin, not about the class. Reading one skin would
 * put a whole class in the third state and quietly stop refusing pairs that
 * share it, which is this repository's worst failure shape: a gate that looks
 * kept while checking nothing. The strongest verdict any skin produces wins.
 */
export function timelineAddBehaviour(data: ReturnType<SkeletonJson['readSkeletonData']>, timeline: Timeline): TimelineAddBehaviour {
  let wrote = false;
  for (const skin of [null, ...data.skins]) {
    const skeleton = new Skeleton(data);
    if (skin !== null) skeleton.setSkin(skin);
    for (const displace of probeStartStates(skeleton)) {
      for (const time of probeTimes(timeline)) {
        skeleton.setupPose();
        for (const bone of skeleton.bones) bone.resetConstrained();
        for (const slot of skeleton.slots) slot.resetConstrained();
        for (const constraint of skeleton.constraints) constraint.resetConstrained();
        skeleton.drawOrder.resetConstrained();
        displace();
        const before = skeletonReading(skeleton);
        timeline.apply(skeleton, time, time, null, 1, MixFrom.current, true, false, true);
        const once = skeletonReading(skeleton);
        timeline.apply(skeleton, time, time, null, 1, MixFrom.current, true, false, true);
        if (skeletonReading(skeleton) !== once) return 'accumulates';
        if (once !== before) wrote = true;
      }
    }
  }
  return wrote ? 'overwrites' : 'inert';
}

/** One skin under one start state of `timelineAddBehaviour`'s probe: what the cell reads, and every pose field the applications moved. */
export interface TimelineAddCell {
  /** The skin worn, `(none)` for no skin set. */
  view: string;
  state: 'setup' | 'displaced';
  /** `A` a second application moved the pose at some time, `W` only the first did, `-` neither ever did. */
  letter: 'A' | 'W' | '-';
  /** Each field the first or the second application moved, at each time: `bone:<name>.<key>`, `slot:<name>.<key>` or `constraint:<name>.<key>`, with its three readings. */
  changed: Array<{ field: string; t: number; before: string; once: string; twice: string }>;
}

/**
 * `timelineAddBehaviour`'s probe, every cell kept: the same skins, start states,
 * times and arguments, read per field rather than as one string — what the
 * core suite's `CO27` holds the core's additive probe (`src/core/additive.ts`)
 * to, cell by cell and value by value (issue #1025, cut 4c-5). The class the
 * cells read is held to `timelineAddBehaviour`'s own answer on every timeline
 * there, so the two cannot drift.
 */
export function timelineAddCells(data: ReturnType<SkeletonJson['readSkeletonData']>, timeline: Timeline): TimelineAddCell[] {
  const fields = (skeleton: Skeleton): Map<string, string> => {
    const out = new Map<string, string>();
    const take = (kind: string, name: string, pose: object): void => {
      for (const [key, text] of poseParts(pose)) out.set(`${kind}:${name}.${key}`, text);
    };
    for (const bone of skeleton.bones) take('bone', bone.data.name, bone.appliedPose);
    for (const slot of skeleton.slots) take('slot', slot.data.name, slot.appliedPose);
    for (const constraint of skeleton.constraints) take('constraint', constraint.data.name, constraint.appliedPose as object);
    out.set('drawOrder', skeleton.drawOrder.appliedPose.map((slot) => slot.data.name).join('>'));
    return out;
  };
  const cells: TimelineAddCell[] = [];
  for (const skin of [null, ...data.skins]) {
    const skeleton = new Skeleton(data);
    if (skin !== null) skeleton.setSkin(skin);
    probeStartStates(skeleton).forEach((displace, at) => {
      const cell: TimelineAddCell = { view: skin?.name ?? '(none)', state: at === 0 ? 'setup' : 'displaced', letter: '-', changed: [] };
      for (const time of probeTimes(timeline)) {
        skeleton.setupPose();
        for (const bone of skeleton.bones) bone.resetConstrained();
        for (const slot of skeleton.slots) slot.resetConstrained();
        for (const constraint of skeleton.constraints) constraint.resetConstrained();
        skeleton.drawOrder.resetConstrained();
        displace();
        const before = fields(skeleton);
        timeline.apply(skeleton, time, time, null, 1, MixFrom.current, true, false, true);
        const once = fields(skeleton);
        timeline.apply(skeleton, time, time, null, 1, MixFrom.current, true, false, true);
        const twice = fields(skeleton);
        let wrote = false;
        let again = false;
        for (const [field, b] of before) {
          const o = once.get(field) ?? '';
          const w = twice.get(field) ?? '';
          if (o !== b) wrote = true;
          if (w !== o) again = true;
          if (o !== b || w !== o) cell.changed.push({ field, t: time, before: b, once: o, twice: w });
        }
        if (again) cell.letter = 'A';
        else if (wrote && cell.letter === '-') cell.letter = 'W';
      }
      cells.push(cell);
    });
  }
  return cells;
}

/**
 * The runtime's supply of `SkinEntryFacts` (issue #1025): every skin of the
 * loaded skeleton in the loaded order, and each skin's entries as
 * `getAttachments()` lists them — the walk this file's prelude makes for its
 * own lists, made once more here so the facts the moved bodies read are a
 * value the selftest can compare with the model side's, order included.
 */
export function spineSkinEntries(data: ReturnType<SkeletonJson['readSkeletonData']>): SkinEntryFacts {
  const regionAttachments: RegionAttachment[] = [];
  for (const skin of data.skins) {
    for (const entry of skin.getAttachments()) {
      if (entry.attachment instanceof RegionAttachment) regionAttachments.push(entry.attachment);
    }
  }
  return { regionAttachments };
}

/**
 * The facts the moved bodies read, as `validate()` supplies them from a pair
 * spine-core loads — or `null` when the load throws, which is A00's failure
 * and `validate()`'s to name. For the selftest and `tools/verdict_gate.ts`,
 * which compare these with the model side's fact by fact, where a verdict
 * line would hide a difference (an order nothing failed on, a name no line
 * printed); `validate()` itself builds them from its own round trip.
 */
export function runtimeFacts(skeletonText: string, atlasText: string, modelText?: string): {
  skinEntries: SkinEntryFacts;
  atlasPages: AtlasPageFacts;
  slotColour: SlotColourFacts;
  animatedBones: AnimatedBoneFacts;
  skinMembers: SkinMemberFacts;
  regionJoins: RegionJoinFacts;
  atlasRegions: AtlasRegionFacts;
  stage: StageFacts;
  skeletonRoster: SkeletonRosterFacts;
  boneTimelines: BoneTimelineFacts;
  eventKeys: EventKeyFacts;
} | null {
  let atlas: TextureAtlas;
  let data: ReturnType<SkeletonJson['readSkeletonData']>;
  try {
    atlas = new TextureAtlas(atlasText);
    data = new SkeletonJson(new AtlasAttachmentLoader(atlas)).readSkeletonData(JSON.parse(skeletonText));
  } catch {
    return null;
  }
  const raw = JSON.parse(skeletonText) as Json;
  return {
    skinEntries: spineSkinEntries(data),
    atlasPages: { atlas },
    slotColour: spineSlotColourFacts(raw, data),
    animatedBones: spineAnimatedBones(raw),
    skinMembers: data,
    regionJoins: spineRegionJoins(atlasText, raw),
    atlasRegions: { atlas },
    stage: spineStage(data, modelText),
    skeletonRoster: rawSkeletonRoster(raw),
    boneTimelines: rawBoneTimelines(raw),
    eventKeys: rawEventKeys(raw),
  };
}

/**
 * The runtime's supply of `SkeletonRosterFacts` (issue #1025, cut 4c-4): the
 * skeleton JSON's `bones` and `slots`, read as A12, A25 and A26 always read
 * them — a slot is any object in the array, named `String(name)`, dark where
 * the key is present; a bone is an object with a string name, its parent the
 * string the file states or `null`. Off the raw JSON because those three run
 * whatever the round trip did. The model side's supply is
 * `./assertions/model/skeleton_roster.ts`.
 */
export function rawSkeletonRoster(raw: Json | null): SkeletonRosterFacts {
  const bones: RosterBone[] = [];
  for (const bone of Array.isArray(raw?.bones) ? (raw.bones as unknown[]) : []) {
    if (isObj(bone) && typeof bone.name === 'string') bones.push({ name: bone.name, parent: typeof bone.parent === 'string' ? bone.parent : null });
  }
  const slots: RosterSlot[] = (Array.isArray(raw?.slots) ? (raw.slots as unknown[]) : []).filter(isObj).map((s) => ({ name: String(s.name), dark: 'dark' in s }));
  return { bones, slots };
}

/**
 * The slot timelines of the skeleton JSON in the file's order — every
 * animation that is an object, every slot entry that is an object — the walk
 * `walkTimelines` made for A12 (issue #1025, cut 4c-4), and the same walk
 * A45's supply makes (`spineSlotColourFacts`), here without the loaded
 * skeleton because A12 runs whatever the round trip did. The model side
 * supplies the same list (`fileSlotTimelines`).
 */
export function rawSlotTimelines(raw: Json | null): SlotTimelines[] {
  const out: SlotTimelines[] = [];
  const rawAnimations = isObj(raw) && isObj(raw.animations) ? raw.animations : {};
  for (const [animation, anim] of Object.entries(rawAnimations)) {
    if (!isObj(anim) || !isObj(anim.slots)) continue;
    for (const [slot, timelines] of Object.entries(anim.slots)) {
      if (!isObj(timelines)) continue;
      out.push({ animation, slot, timelines });
    }
  }
  return out;
}

/**
 * The runtime's supply of `BoneTimelineFacts` (issue #1025, cut 4c-4): every
 * (animation, bone) pair of the skeleton JSON, in the file's order — every
 * animation that is an object with a `bones` object, every bone entry,
 * whatever it holds — the walk A24, A29 and A30 made over the raw JSON. The
 * model side's supply is `./assertions/model/bone_timelines.ts`.
 */
export function rawBoneTimelines(raw: Json | null): BoneTimelineFacts {
  const boneTimelines: BoneTimelines[] = [];
  const anims = isObj(raw?.animations) ? (raw.animations as Json) : {};
  for (const [animation, anim] of Object.entries(anims)) {
    if (!isObj(anim) || !isObj(anim.bones)) continue;
    for (const [bone, timelines] of Object.entries(anim.bones as Json)) boneTimelines.push({ animation, bone, timelines });
  }
  return { boneTimelines };
}

/**
 * The runtime's supply of `EventKeyFacts` (issue #1025, cut 4c-4) — and the
 * four clauses of A32 that stay with the round trip.
 *
 * Every event key of the skeleton JSON, in the file's order, with what the
 * body's one moved clause reads (the fields the key states, whether its event
 * declares an audio path). The four clauses below run here, over the raw JSON,
 * exactly as they ran in A32's body, and hand their findings in as `kept`, in
 * the order they printed, with `stopped` where the clause ended the key's
 * reading (the body prints them at the same place). They stay because each is
 * a state the model document's reader refuses by name (`readEventKeys` in
 * `src/core/events.ts`): a key with no string name, an event the skeleton
 * does not declare, a time that is not a finite number, a time before the key
 * before it — measured on forged documents, each refused at the key's
 * address, so no readable document reaches them and the model side has no
 * input to print them from.
 */
export function rawEventKeys(raw: Json | null): EventKeyFacts {
  if (!raw) return { parsed: false, animations: false, timelines: 0, keys: [] };
  if (!isObj(raw.animations)) return { parsed: true, animations: false, timelines: 0, keys: [] };
  const declared = isObj(raw.events) ? (raw.events as Json) : {};
  const known = Object.keys(declared);
  const keys: EventKeyEntry[] = [];
  let timelines = 0;
  for (const [animName, anim] of Object.entries(raw.animations as Json)) {
    if (!isObj(anim) || !Array.isArray(anim.events)) continue;
    timelines++;
    let previous = -Infinity;
    (anim.events as unknown[]).forEach((key, k) => {
      const at = eventKeyAt(animName, k);
      const kept: string[] = [];
      const stop = (name: string): void => void keys.push({ animation: animName, index: k, kept, stopped: true, name, sets: { volume: false, balance: false }, audio: false });
      if (!isObj(key) || typeof key.name !== 'string') {
        kept.push(`${at}: an event key needs a string "name"`);
        return stop('');
      }
      const definition = declared[key.name];
      if (definition === undefined) {
        kept.push(
          `${at}: fires "${key.name}", which the skeleton's events block does not declare` +
            (known.length ? ` (declared: ${known.join(', ')})` : ' (that block is empty or absent)'),
        );
        return stop(key.name);
      }
      // `time` defaults to 0 when absent (`:1247`), which is what the editor
      // writes for a firing on frame 0.
      const time = key.time === undefined ? 0 : key.time;
      if (typeof time !== 'number' || !Number.isFinite(time)) {
        kept.push(`${at}: time is ${JSON.stringify(key.time)}, not a finite number`);
        return stop(key.name);
      }
      if (time < previous) {
        kept.push(
          `${at}: "${key.name}" is at t=${time}, after a key at t=${previous} — the parser fills frames in ` +
            'array order and never sorts them, so the earlier firing is unreachable',
        );
      }
      previous = Math.max(previous, time);
      keys.push({
        animation: animName,
        index: k,
        kept,
        stopped: false,
        name: key.name,
        sets: { volume: key.volume !== undefined, balance: key.balance !== undefined },
        audio: isObj(definition) && typeof definition.audio === 'string',
      });
    });
  }
  return { parsed: true, animations: true, timelines, keys };
}

/**
 * The runtime's supply of A45's facts (issue #1025): the slot timelines read
 * off the skeleton JSON in the file's order — every animation the file keys,
 * every slot an animation keys, skipping what is not an object, as A45's walk
 * always read them — whether the loaded skeleton holds an animation, and a
 * slot's colour posed on a fresh, non-looping track by spine-core: setup pose,
 * `update(0)`, `updateWorldTransform(Physics.reset)`, then the track stepped to
 * the time and applied. The model side's supply is
 * `./assertions/model/slot_colour.ts`; the selftest holds the two to the same
 * lines.
 */
function spineSlotColourFacts(raw: Json | null, data: ReturnType<SkeletonJson['readSkeletonData']>): SlotColourFacts {
  const slotTimelines: SlotTimelines[] = [];
  const rawAnimations = isObj(raw) && isObj(raw.animations) ? raw.animations : {};
  for (const [animation, anim] of Object.entries(rawAnimations)) {
    if (!isObj(anim) || !isObj(anim.slots)) continue;
    for (const [slot, timelines] of Object.entries(anim.slots)) {
      if (!isObj(timelines)) continue;
      slotTimelines.push({ animation, slot, timelines });
    }
  }
  return {
    slotTimelines,
    hasAnimation: (name) => Boolean(data.findAnimation(name)),
    posedSlot: (animName, slotName, time) => {
      const skeleton = new Skeleton(data);
      const state = new AnimationState(new AnimationStateData(data));
      state.setAnimation(0, animName, false);
      skeleton.setupPose();
      skeleton.update(0);
      skeleton.updateWorldTransform(Physics.reset);
      state.update(time);
      state.apply(skeleton);
      return skeleton.slots.find((s) => s.data.name === slotName)?.appliedPose;
    },
  };
}

/**
 * The runtime's supply of A39's fact (issue #1025, cut 4c-3): the survey of
 * the loaded skeleton, read and posed by spine-core (`surveyDeformKeys`) — the
 * call A39 always made. The model side's supply is
 * `./assertions/model/deform_survey.ts`.
 */
export function spineDeformSurvey(data: ReturnType<SkeletonJson['readSkeletonData']>): DeformSurveyFacts {
  return { survey: (exempt) => surveyDeformKeys(data, exempt) };
}

/**
 * The runtime's supply of A09's facts (issue #1025, cut 4c-3): the loaded
 * animations in the loaded order — the file's — each with its duration and
 * every loaded timeline's `getDuration()`, as A09 always read them. The model
 * side's supply is `./assertions/model/animation_durations.ts`.
 */
export function spineAnimationDurations(data: ReturnType<SkeletonJson['readSkeletonData']>): AnimationDurationFacts {
  return { animations: data.animations.map((anim) => ({ name: anim.name, duration: anim.duration, timelineDurations: anim.timelines.map((t) => t.getDuration()) })) };
}

/**
 * The runtime's supply of A43's facts (issue #1025, cut 4c-3): the stated dark
 * colours read off the skeleton JSON in the file's slot order, each slot named
 * as A43's walk always named it; the setup dark colour the loaded slot holds;
 * A45's walk of the file's slot timelines; whether an animation loaded; and a
 * slot's two colours posed on a fresh, non-looping track by spine-core — setup
 * pose, `update(0)`, `updateWorldTransform(Physics.reset)`, the track stepped
 * to the time and applied, then `update` and `updateWorldTransform
 * (Physics.update)` by the same time, A43's recipe unchanged. The model side's
 * supply is `./assertions/model/two_colour.ts`.
 */
export function spineTwoColourFacts(raw: Json | null, data: ReturnType<SkeletonJson['readSkeletonData']>): TwoColourFacts {
  const slotDarks: Array<{ slot: string; dark: string }> = [];
  for (const slot of Array.isArray(raw?.slots) ? (raw.slots as unknown[]) : []) {
    if (isObj(slot) && typeof slot.dark === 'string') slotDarks.push({ slot: String(slot.name), dark: slot.dark });
  }
  return {
    slotDarks,
    loadedDark: (name) => data.findSlot(name)?.setupPose.darkColor ?? null,
    slotTimelines: spineSlotColourFacts(raw, data).slotTimelines,
    hasAnimation: (name) => Boolean(data.findAnimation(name)),
    posedTint: (animName, slotName, time) => {
      const skeleton = new Skeleton(data);
      const state = new AnimationState(new AnimationStateData(data));
      state.setAnimation(0, animName, false);
      skeleton.setupPose();
      skeleton.update(0);
      skeleton.updateWorldTransform(Physics.reset);
      state.update(time);
      state.apply(skeleton);
      skeleton.update(time);
      skeleton.updateWorldTransform(Physics.update);
      const posed = skeleton.slots.find((s) => s.data.name === slotName)?.appliedPose;
      if (posed === undefined) return undefined;
      return { light: posed.color, dark: posed.darkColor ?? null };
    },
  };
}

/**
 * The runtime's supply of A46's facts (issue #1025, cut 4c-3): the skin
 * entries and sequence timelines read off the skeleton JSON as A46's walks
 * always read them — the skins, a skin's slot keys and a slot's placeholders in
 * the file's order, an entry with no `type` a region, an entry of another kind
 * left out, a timeline whose `sequence` is not a list left out — each entry
 * marked loaded where the slot exists and the loaded skin of that name holds an
 * attachment at it; and what a slot shows on a fresh, non-looping track posed
 * by spine-core — setup pose, `update(0)`, `updateWorldTransform
 * (Physics.reset)`, the track stepped to the time and applied, A46's recipe
 * unchanged. The loaded attachment is answered by its address: every loaded
 * skin's `getAttachments()` gives each attachment object the skin, slot and
 * placeholder it is filed under, and the object a linked mesh plays its
 * timelines as (`timelineAttachment`) is answered the same way. The model
 * side's supply is `./assertions/model/sequences.ts`.
 */
export function spineSequenceFacts(raw: Json | null, data: ReturnType<SkeletonJson['readSkeletonData']>): SequenceFacts {
  const entries: SequenceSkinEntry[] = [];
  for (const skin of isObj(raw) && Array.isArray(raw.skins) ? (raw.skins as unknown[]) : []) {
    if (!isObj(skin) || !isObj(skin.attachments)) continue;
    const skinName = typeof skin.name === 'string' ? skin.name : '(unnamed)';
    const loadedSkin = data.findSkin(skinName);
    for (const [slotName, perSlot] of Object.entries(skin.attachments)) {
      if (!isObj(perSlot)) continue;
      const slotIndex = data.findSlot(slotName)?.index;
      for (const [placeholder, entry] of Object.entries(perSlot)) {
        if (!isObj(entry)) continue;
        const type = entry.type === undefined ? 'region' : entry.type;
        if (type !== 'region' && type !== 'mesh' && type !== 'linkedmesh') continue;
        const loaded = slotIndex === undefined ? null : loadedSkin?.getAttachment(slotIndex, placeholder) ?? null;
        entries.push({ skin: skinName, slot: slotName, placeholder, name: entry.name, path: entry.path, sequence: entry.sequence, loaded: loaded !== null });
      }
    }
  }
  const timelines: SequenceTimeline[] = [];
  const rawAnimations = isObj(raw) && isObj(raw.animations) ? raw.animations : {};
  for (const [animation, anim] of Object.entries(rawAnimations)) {
    if (!isObj(anim) || !isObj(anim.attachments)) continue;
    for (const [skin, perSkin] of Object.entries(anim.attachments)) {
      if (!isObj(perSkin)) continue;
      for (const [slot, perSlot] of Object.entries(perSkin)) {
        if (!isObj(perSlot)) continue;
        for (const [placeholder, perAttachment] of Object.entries(perSlot)) {
          if (!isObj(perAttachment) || !Array.isArray(perAttachment.sequence)) continue;
          timelines.push({ animation, skin, slot, placeholder, keys: perAttachment.sequence as unknown[] });
        }
      }
    }
  }
  /** Every loaded attachment object -> the address it is filed under, first filing kept. */
  let addressOf: Map<object, EntryAddress> | null = null;
  const address = (attachment: object): EntryAddress => {
    if (addressOf === null) {
      addressOf = new Map();
      for (const skin of data.skins) {
        for (const entry of skin.getAttachments()) {
          if (!addressOf.has(entry.attachment)) addressOf.set(entry.attachment, entryAddress(skin.name, data.slots[entry.slotIndex].name, entry.placeholder));
        }
      }
    }
    // An attachment no skin files has no address: it can match no timeline's.
    return addressOf.get(attachment) ?? '';
  };
  return {
    entries,
    timelines,
    hasSlot: (slot) => data.findSlot(slot) !== null,
    duration: (animation) => data.findAnimation(animation)?.duration ?? null,
    posedFrame: (animName, slotName, time) => {
      const slotIndex = data.findSlot(slotName)?.index;
      if (slotIndex === undefined) return null;
      const skeleton = new Skeleton(data);
      const state = new AnimationState(new AnimationStateData(data));
      state.setAnimation(0, animName, false);
      skeleton.setupPose();
      skeleton.update(0);
      skeleton.updateWorldTransform(Physics.reset);
      state.update(time);
      state.apply(skeleton);
      const pose = skeleton.slots[slotIndex].appliedPose;
      const shown = pose.attachment;
      if (shown === null) return null;
      // The object it plays timelines as — `applyToSlot`'s second test — where the attachment carries one.
      const playsAs = shown.timelineAttachment ?? shown;
      const sequence = shown instanceof RegionAttachment || shown instanceof MeshAttachment ? shown.sequence : null;
      const region = sequence === null ? null : ((sequence.regions[sequence.resolveIndex(pose)] as TextureAtlasRegion | null | undefined)?.name ?? null);
      return { shown: address(shown), playsAs: address(playsAs), region };
    },
  };
}

/**
 * The runtime's supply of `AnimatedBoneFacts` (issue #1025, cut 4c-1): read
 * off the skeleton JSON, as A15 always read the bones `idle` keys — an
 * animation that is not an object is no animation, a `bones` group that is not
 * an object is no bone timeline. The model side's supply is
 * `./assertions/model/animated_bones.ts`.
 */
export function spineAnimatedBones(raw: Json | null): AnimatedBoneFacts {
  return {
    bonesKeyedBy: (name) => {
      const animation = isObj(raw?.animations) ? (raw.animations as Json)[name] : undefined;
      if (!isObj(animation)) return undefined;
      if (!isObj(animation.bones)) return null;
      return Object.keys(animation.bones as Json);
    },
  };
}

/**
 * The runtime's supply of `StageFacts` (issue #1025, cut 4c-1): the stage A14
 * and A19 measure against.
 *
 * 🔸 **A rigc build's stage is its model document's, not its header's**
 * (issue #907). Since then the header of a rigc build carries the setup-pose
 * bounding box — what the format says it is — and the stage, the working
 * area the art was painted in, is stated by the `rigc-compiled/3` document
 * written beside the pair (`stage`, issue #1026). So where the caller hands a
 * `/3` document (`modelText`), its `stage` is read: the two extents, or both
 * `undefined` where it states `null`. Everywhere else — an editor export, a
 * bare directory with no document, a `/2` or `/1` document, written when the
 * header still was the stage — it is the loaded skeleton's `width` and
 * `height`, as spine-core holds them (`undefined` where the header states
 * none), or both absent with no skeleton. An export carries no other box, so
 * on an export the rules measure against its bounding box, as they always
 * did.
 */
export function spineStage(data: ReturnType<SkeletonJson['readSkeletonData']> | null, modelText?: string): StageFacts {
  return documentStage(modelText) ?? { width: data?.width, height: data?.height };
}

/** The stage a `rigc-compiled/3` document states, or `undefined` where there is no such document (`spineStage`). */
function documentStage(modelText: string | undefined): StageFacts | undefined {
  if (modelText === undefined) return undefined;
  let doc: unknown;
  try {
    doc = JSON.parse(modelText);
  } catch {
    return undefined;
  }
  if (!isObj(doc) || doc.spec !== MODEL_DOCUMENT_SPEC || !('stage' in doc)) return undefined;
  const stage = doc.stage;
  if (stage === null) return { width: undefined, height: undefined };
  if (isObj(stage) && typeof stage.width === 'number' && typeof stage.height === 'number') return { width: stage.width, height: stage.height };
  return undefined;
}

/**
 * The runtime's supply of `StageBoxFacts` (issue #1168): the box a
 * `rigc-compiled/3` document's `stage.box` asks for — nothing asks without
 * one, and an export has none — and what the loaded skeleton holds there: the
 * `default` skin's attachment of that name on that slot, its vertices as
 * loaded, and its world vertices on a fresh skeleton at the setup pose —
 * `setupPose()`, `updateWorldTransform(Physics.none)`, no skin set — which
 * is the pose `getBounds` reads for the header and the one a consumer that
 * loads the files and asks for the box sees.
 */
export function spineStageBox(data: ReturnType<SkeletonJson['readSkeletonData']>, modelText?: string): StageBoxFacts {
  const asked = documentStageBox(modelText);
  if (typeof asked === 'string') return { asked: null, why: asked, slot: false, held: null };
  const slotData = data.findSlot(asked.slot);
  if (slotData === null) return { asked, why: '', slot: false, held: null };
  const attachment = data.defaultSkin?.getAttachment(slotData.index, asked.attachment) ?? null;
  if (attachment === null) return { asked, why: '', slot: true, held: null };
  if (!(attachment instanceof BoundingBoxAttachment)) {
    const type =
      attachment instanceof RegionAttachment ? 'region' : attachment instanceof MeshAttachment ? 'mesh' : attachment instanceof ClippingAttachment ? 'clipping' : attachment instanceof PathAttachment ? 'path' : 'point';
    return { asked, why: '', slot: true, held: { type, weighted: false, stored: [], world: '' } };
  }
  const weighted = attachment.bones !== null && attachment.bones !== undefined;
  const stored = weighted ? [] : [...attachment.vertices];
  const skeleton = new Skeleton(data);
  skeleton.setupPose();
  skeleton.updateWorldTransform(Physics.none);
  const slot = skeleton.slots[slotData.index];
  let world: number[] | string;
  if (!slot.bone.active) world = `its bone "${slot.bone.data.name}" is inactive with no skin set, so nothing poses it`;
  else {
    const out = new Array<number>(attachment.worldVerticesLength).fill(0);
    attachment.computeWorldVertices(skeleton, slot, 0, attachment.worldVerticesLength, out, 0, 2);
    world = out;
  }
  return { asked, why: '', slot: true, held: { type: 'boundingbox', weighted, stored, world } };
}

/**
 * The runtime's supply of `SetupWorldFacts` (issue #1351): each bone's world
 * frame on a fresh skeleton at the setup pose — `setupPose()`,
 * `updateWorldTransform(Physics.none)`, no skin set, the pose `spineStageBox`
 * reads for A50 — posed once, on the first question.
 */
export function spineSetupWorld(data: ReturnType<SkeletonJson['readSkeletonData']>): SetupWorldFacts {
  let skeleton: Skeleton | null = null;
  return {
    frameOf: (name) => {
      if (data.findBone(name) === null) return null;
      if (skeleton === null) {
        skeleton = new Skeleton(data);
        skeleton.setupPose();
        skeleton.updateWorldTransform(Physics.none);
      }
      const bone = skeleton.findBone(name);
      if (bone === null) return null;
      if (!bone.active) return inactiveAtSetup(name);
      const { a, c, worldX, worldY } = bone.appliedPose;
      return { worldX, worldY, a, c };
    },
  };
}

/** The box a `rigc-compiled/3` document's stage asks for, with that stage — or the SKIP's reason where nothing asks (`spineStageBox`). */
function documentStageBox(modelText: string | undefined): StageBoxFacts['asked'] & object | string {
  if (modelText === undefined) return SKIP_NO_STAGE_BOX;
  let doc: unknown;
  try {
    doc = JSON.parse(modelText);
  } catch {
    return SKIP_NO_STAGE_BOX;
  }
  if (!isObj(doc) || doc.spec !== MODEL_DOCUMENT_SPEC || !isObj(doc.stage)) return SKIP_NO_STAGE_BOX;
  const { x, y, width, height, box } = doc.stage;
  if (typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number' || typeof height !== 'number') return SKIP_NO_STAGE_BOX;
  if (!isObj(box)) return SKIP_NO_STAGE_BOX;
  if (typeof box.slot !== 'string' || typeof box.attachment !== 'string') return SKIP_NO_STAGE_BOX;
  return { slot: box.slot, attachment: box.attachment, stage: { x, y, width, height } };
}

/**
 * The runtime's supply of `RegionJoinFacts` (issue #1025, cut 4c-1), read
 * before the round trip as A08 always read it: the region names of a
 * `TextureAtlas` built from the atlas text for this alone (`null` when that
 * throws), and `attachmentRegionJoins` over the raw JSON (`null` when it did
 * not parse). The model side's supply is `./assertions/model/region_joins.ts`.
 */
export function spineRegionJoins(atlasText: string, raw: Json | null): RegionJoinFacts {
  let regionNames: string[] | null;
  try {
    regionNames = new TextureAtlas(atlasText).regions.map((r) => r.name);
  } catch {
    regionNames = null;
  }
  return { regionNames, joins: raw ? attachmentRegionJoins(raw) : null };
}

/**
 * The runtime's supply of `MeshFacts` (issue #1025, cut 4c-2): every mesh
 * attachment of every loaded skin, in `getAttachments()`'s walk — the walk
 * the prelude makes for its own lists — with the geometry and the weights
 * spine-core holds (`meshWeightsOf` decodes the run), each mesh's link as the
 * FILE spells it (`rawLinkedMeshes`, joined by skin, slot and placeholder, the
 * parser's own key), and the findings of the clauses that stayed here
 * because their subject is the encoding:
 *
 * - `A04`: a weighted run whose length is not a multiple of three, and an
 *   unweighted array of another length than the `uvs` — the flat run's own
 *   coherence, which a document stating the weighted form outright cannot
 *   spell. [measured] neither is reachable through spine-core's parser (it
 *   reads three numbers per binding, and decides weighted by that very length
 *   comparison), so neither has a mutant; they are kept as the round trip's
 *   statement of what it read, not moved to a side with no run to read.
 * - `A20`: a binding's index past the bone array. The document names a
 *   binding's bone; the index is the emitter's (`emitVertices`).
 */
export function spineMeshFacts(data: ReturnType<SkeletonJson['readSkeletonData']>, raw: Json | null): MeshFacts {
  const rawLinks = rawLinkedMeshes(raw);
  const meshes: MeshAttachmentEntry[] = [];
  for (const skin of data.skins) {
    for (const entry of skin.getAttachments()) {
      const att = entry.attachment;
      if (!(att instanceof MeshAttachment)) continue;
      const slot = data.slots[entry.slotIndex];
      const link = rawLinks.get(`${skin.name}\u0000${slot.name}\u0000${entry.placeholder}`);
      const weights = att.bones
        ? meshWeightsOf(att).map((vertex, i) =>
            vertex.map(({ bone, weight }) => ({
              bone,
              weight,
              ...(bone >= 0 && bone < data.bones.length ? {} : { encoding: `mesh "${att.name}" vertex ${i} references bone index ${bone}` }),
            })),
          )
        : null;
      const encoding: string[] = [];
      // Weighted vs unweighted is decided by a length comparison alone — a
      // coincidental match reads weight data as coordinates.
      const weighted = !!att.bones;
      if (weighted && att.vertices.length % 3 !== 0) encoding.push(`mesh "${att.name}" weighted vertex run is not a multiple of 3`);
      if (!weighted && att.vertices.length !== att.worldVerticesLength) encoding.push(`mesh "${att.name}" unweighted vertices disagree with uvs`);
      meshes.push({
        name: att.name,
        skin: skin.name,
        slot: slot.name,
        slotBone: slot.boneData.name,
        placeholder: entry.placeholder,
        link: link === undefined ? null : { source: link.source },
        triangles: att.triangles ?? [],
        worldVerticesLength: att.worldVerticesLength,
        regionUVs: Array.from(att.regionUVs ?? []),
        hullLength: att.hullLength,
        width: att.width,
        height: att.height,
        weights,
        encoding,
      });
    }
  }
  return { bones: data.bones.map((b) => b.name), meshes };
}

/**
 * The runtime's supply of `PolygonFacts` (issue #1025, cut 4c-2): every
 * bounding box, clipping attachment and path of every loaded skin, as A33
 * walked them, and every clipping attachment the FILE gives an `end`, read off
 * the skeleton JSON as A33 always read it — a `null` end slot and an `end`
 * never written are the same loaded object. Each polygon carries the findings
 * of the clauses that stayed here because their subject is the encoding: a
 * weighted run's decode (a vertex claiming no bone, an index past the bone
 * array, a run decoding to another vertex count, a weight array of the wrong
 * length) and an unweighted array of the wrong length. A document states the
 * weighted form outright and names bones, so none of those has a subject
 * there.
 */
export function spinePolygonFacts(data: ReturnType<SkeletonJson['readSkeletonData']>, raw: Json | null): PolygonFacts {
  const polygons: PolygonEntry[] = [];
  for (const skin of data.skins) {
    for (const entry of skin.getAttachments()) {
      const att = entry.attachment;
      let what: string;
      if (att instanceof BoundingBoxAttachment) what = `bounding box "${att.name}"`;
      else if (att instanceof ClippingAttachment) what = `clipping attachment "${att.name}"`;
      // A path is the same shape with one more rule on top: its vertices
      // are knots AND handles, walked in groups of three.
      else if (att instanceof PathAttachment) what = `path "${att.name}"`;
      else continue;
      polygons.push({
        what,
        worldVerticesLength: att.worldVerticesLength,
        path: att instanceof PathAttachment ? { closed: att.closed, lengths: Array.from(att.lengths) } : null,
        encoding: polygonRunFindings(what, att, data.bones.length),
      });
    }
  }
  const clipEnds: ClipEnd[] = [];
  if (raw && Array.isArray(raw.skins)) {
    for (const skin of raw.skins as unknown[]) {
      if (!isObj(skin) || !isObj(skin.attachments)) continue;
      for (const [slotName, perSlot] of Object.entries(skin.attachments as Json)) {
        if (!isObj(perSlot)) continue;
        for (const [placeholder, att] of Object.entries(perSlot)) {
          if (!isObj(att) || att.type !== 'clipping' || att.end === undefined) continue;
          clipEnds.push({ placeholder, slot: slotName, end: att.end });
        }
      }
    }
  }
  return { polygons, clipEnds, slots: data.slots.map((s) => s.name) };
}

/** A33's kept clauses over one polygon's vertex run, in the order it printed them (`spinePolygonFacts`). */
function polygonRunFindings(what: string, att: BoundingBoxAttachment | ClippingAttachment | PathAttachment, bones: number): string[] {
  const out: string[] = [];
  const length = att.worldVerticesLength;
  const vertexCount = length / 2;
  if (!att.bones) {
    if (att.vertices.length !== length) {
      out.push(
        `${what} declares ${vertexCount} vertices but holds ${att.vertices.length} unweighted numbers ` +
          `(expected ${length}); the parser reads that mismatch as a weighted run`,
      );
    }
    return out;
  }
  // Weighted: `bones` is boneCount, (index × boneCount), repeated, and
  // `vertices` holds x, y, weight per binding.
  let decoded = 0;
  let bindings = 0;
  let ok = true;
  for (let i = 0; i < att.bones.length; decoded++) {
    const count = att.bones[i++];
    if (!Number.isInteger(count) || count < 1 || i + count > att.bones.length) {
      out.push(`${what} vertex ${decoded} claims ${count} bone(s); the run is malformed`);
      ok = false;
      break;
    }
    for (let k = 0; k < count; k++, i++) {
      const index = att.bones[i];
      if (index < 0 || index >= bones) {
        out.push(`${what} vertex ${decoded} references bone index ${index}`);
        ok = false;
      }
    }
    bindings += count;
  }
  if (!ok) return out;
  if (decoded !== vertexCount) out.push(`${what} declares ${vertexCount} vertices and its weighted run decodes to ${decoded}`);
  if (att.vertices.length !== bindings * 3) out.push(`${what} has ${bindings} binding(s) and ${att.vertices.length} weight numbers (expected ${bindings * 3})`);
  return out;
}

/**
 * The runtime's supply of `LinkFacts` (issue #1025, cut 4c-2): every link the
 * FILE declares (`rawLinkedMeshes`), and — the clause that stayed here,
 * because a link record holds no geometry field and so the subject exists
 * only in the Spine text — the finding about each link that states geometry
 * of its own, with what the runtime made of it (the loaded attachment joined
 * by skin, slot and placeholder, the parser's own key).
 */
export function spineLinkFacts(data: ReturnType<SkeletonJson['readSkeletonData']>, raw: Json | null): LinkFacts {
  const rawLinks = rawLinkedMeshes(raw);
  /**
   * The pairing the other way round — join key -> the attachment the loader
   * produced for it. A link whose region is missing loads as `null` and is in
   * no skin at all (`A08` names that), so its join key is absent here while
   * the file still declares it.
   */
  const loadedLinks = new Map<string, MeshAttachment>();
  for (const skin of data.skins) {
    for (const entry of skin.getAttachments()) {
      if (!(entry.attachment instanceof MeshAttachment)) continue;
      const join = `${skin.name}\u0000${data.slots[entry.slotIndex].name}\u0000${entry.placeholder}`;
      if (rawLinks.has(join)) loadedLinks.set(join, entry.attachment);
    }
  }
  const links: LinkEntry[] = [];
  for (const [join, link] of rawLinks) {
    const [skinName, slotName, placeholder] = join.split('\u0000');
    links.push({ skin: skinName, slot: slotName, placeholder, source: link.source, encoding: link.geometry.length === 0 ? [] : [linkGeometryFinding(join, link, loadedLinks.get(join))] });
  }
  return { links };
}

/**
 * A44's kept clause: a link that states geometry of its own. 🚨 The one shape
 * the parser reads in SILENCE. `readAttachment` returns from the `source`
 * branch at `SkeletonJson.js:586`, before `map.uvs` is touched at all, so
 * `uvs`, `triangles`, `vertices`, `hull` and `edges` written on a link are read
 * by nothing — and `setSourceMesh` then fills the attachment with the SOURCE's
 * arrays. The file says one mesh and every runtime draws another.
 */
function linkGeometryFinding(join: string, link: RawLinkedMesh, drawn: MeshAttachment | undefined): string {
  const [skinName, slotName, placeholder] = join.split('\u0000');
  const at = `skin ${JSON.stringify(skinName)} slot ${JSON.stringify(slotName)} placeholder ${JSON.stringify(placeholder)}`;
  const keys = link.geometry.map((key) => JSON.stringify(key)).join(', ');
  // Where the parser looks for `source`, with the two defaults spelled out:
  // an omitted `skin` is the DEFAULT skin rather than this attachment's own
  // (`:429`), and an omitted `slot` IS this attachment's own (`:573-579`).
  const where =
    `skin ${JSON.stringify(link.skin ?? 'default')}${link.skin === undefined ? ' (the default skin, because no "skin" was stated — never the skin this attachment is written in)' : ''} ` +
    `slot ${JSON.stringify(link.slot ?? slotName)}${link.slot === undefined ? ' (this attachment\'s own, because no "slot" was stated)' : ''}`;
  // What the author's own keys describe, printed only when both are
  // readable — the shape the file states, beside the shape it draws.
  const states =
    link.statedVertices === undefined || link.statedTriangles === undefined
      ? ''
      : ` (${link.statedVertices} vertices and ${link.statedTriangles} triangles)`;
  const loaded =
    drawn === undefined
      ? 'what it loaded is not shown here because the round trip produced no attachment for it (A00 owns that)'
      : `it loaded ${drawn.worldVerticesLength / 2} vertices and ${drawn.triangles.length / 3} triangles`;
  return (
    `${at} links to ${JSON.stringify(link.source)} and states ${keys}${states}, and a linked mesh has no geometry of ` +
    'its own. The parser returns from the `source` branch before `readVertices` ' +
    `(\`SkeletonJson.ts:582-586\`), so ${link.geometry.length === 1 ? 'that key is' : 'those keys are'} read by ` +
    `nothing at all: what this attachment draws is the geometry of ${JSON.stringify(link.source)} in ${where}, and ` +
    `${loaded}. Remove ${link.geometry.length === 1 ? 'it' : 'them'}, or remove "source" and author this as a ` +
    'mesh of its own.'
  );
}

/** A transform timeline's six channels, in frame order, and the `to` kind each one is the mix of. */
const TRANSFORM_MIXES = [
  ['mixRotate', ToRotate],
  ['mixX', ToX],
  ['mixY', ToY],
  ['mixScaleX', ToScaleX],
  ['mixScaleY', ToScaleY],
  ['mixShearY', ToShearY],
] as const;

/**
 * The motion spec's word for what a constraint timeline keys, off the
 * runtime's own `Property` name: `physicsConstraintWind` -> `wind`,
 * `pathConstraintMix` -> `mix`, `sliderTime` -> `time`, `ikConstraint` ->
 * `ik` — the name with the constraint kind taken off the front. Derived
 * rather than tabulated: a table here would be one more hand-kept list of the
 * runtime's enum.
 */
function keyedWord(property: string, kind: string): string {
  const rest = property.replace(/^(ik|transform|path|physics|slider)(Constraint)?/, '');
  return rest === '' ? kind : rest.charAt(0).toLowerCase() + rest.slice(1);
}

/**
 * The runtime's supply of `ConstraintFacts` (issue #1025, cut 4c-2): the
 * loaded constraints in update order, each as the bodies read it, and every
 * constraint timeline of every loaded animation in the order the runtime
 * built it — its kind and word off the runtime's own `Property` name, the
 * constraint it names, whom it writes (`unnamedPhysicsReach` for a physics
 * timeline naming none), its frames, every value a channel poses
 * (`curveChannelValues`, the Bézier samples the parser stored included), and,
 * on a physics timeline `PHYSICS_POSE_RULES` bounds, the pose field the
 * runtime's own `set` writes a keyed value into.
 */
export function spineConstraintFacts(data: ReturnType<SkeletonJson['readSkeletonData']>): ConstraintFacts {
  const constraints: ConstraintEntry[] = data.constraints.map((c): ConstraintEntry => {
    // Taken structurally rather than through `ConstraintData<T, P>`, whose two
    // type arguments the runtime itself fills with `any` — which `src/` may not write.
    const runtimeClass = (c as { constructor: { name: string } }).constructor.name.replace(/Data$/, '');
    if (c instanceof PhysicsConstraintData) {
      const pose = c.setupPose;
      return {
        kind: 'physics',
        name: c.name,
        runtimeClass,
        physics: {
          bone: c.bone.name,
          boneLength: c.bone.length,
          components: { x: c.x, y: c.y, rotate: c.rotate, scaleX: c.scaleX, shearX: c.shearX },
          setup: { mix: pose.mix, massInverse: pose.massInverse, strength: pose.strength, damping: pose.damping },
          step: c.step,
        },
      };
    }
    if (c instanceof PathConstraintData) {
      const pose = c.setupPose;
      return { kind: 'path', name: c.name, runtimeClass, path: { bones: c.bones.map((b) => b.name), slot: c.slot.name, setup: { mixRotate: pose.mixRotate, mixX: pose.mixX, mixY: pose.mixY } } };
    }
    if (c instanceof SliderData) {
      const animation = c.animation;
      return {
        kind: 'slider',
        name: c.name,
        runtimeClass,
        slider: {
          animation: animation ? { name: animation.name, timelines: animation.timelines.length, duration: animation.duration } : null,
          bone: c.bone ? c.bone.name : null,
          loop: c.loop,
          scale: c.scale,
          mix: c.setupPose.mix,
        },
      };
    }
    if (c instanceof IkConstraintData) {
      const secondAncestors: string[] = [];
      if (c.bones.length === 2) for (let at = c.bones[1].parent; at !== null; at = at.parent) secondAncestors.push(at.name);
      return { kind: 'ik', name: c.name, runtimeClass, ik: { bones: c.bones.map((b) => b.name), target: c.target.name, mix: c.setupPose.mix, secondAncestors } };
    }
    if (c instanceof TransformConstraintData) {
      const pose = c.setupPose;
      return {
        kind: 'transform',
        name: c.name,
        runtimeClass,
        transform: {
          bones: c.bones.map((b) => b.name),
          mixes: TRANSFORM_MIXES.map(([field, kind]) => (c.properties.some((from) => from.to.some((to) => to instanceof kind)) ? { field, setup: pose[field] } : null)),
        },
      };
    }
    throw new Error(`a constraint of class ${runtimeClass} is none of the five kinds`);
  });
  const physicsData = data.constraints.filter((one) => one instanceof PhysicsConstraintData);
  const timelines: ConstraintTimelineFact[] = [];
  for (const animation of data.animations) {
    for (const timeline of animation.timelines) {
      if (!isConstraintTimeline(timeline)) continue;
      const property = String(Property[Number(timeline.propertyIds[0].split('|')[0])] ?? timeline.propertyIds[0]);
      const kind = (/^(ik|transform|path|physics|slider)/.exec(property)?.[1] ?? '') as ConstraintFacts['constraints'][number]['kind'];
      const word = keyedWord(property, kind);
      const reset = timeline instanceof PhysicsConstraintResetTimeline;
      const frames: Array<{ time: number; value: number }> = [];
      if (!reset) {
        const entries = timeline.getFrameEntries();
        for (let i = 0; i < timeline.frames.length; i += entries) frames.push({ time: timeline.frames[i], value: timeline.frames[i + 1] });
      }
      const rule = timeline instanceof PhysicsConstraintTimeline ? physicsRuleFor(word) : undefined;
      const probe = new PhysicsConstraintPose();
      timelines.push({
        animation: animation.name,
        kind,
        word,
        constraint: timeline.constraintIndex,
        reach: timeline.constraintIndex >= 0 ? [timeline.constraintIndex] : unnamedPhysicsReach(timeline, physicsData).map((one) => data.constraints.indexOf(one)),
        frames,
        channelValues: (channel) => (reset ? [] : curveChannelValues(timeline as CurveTimeline & ConstraintTimeline, channel)),
        ...(rule === undefined || !(timeline instanceof PhysicsConstraintTimeline)
          ? {}
          : {
              posed: (value: number): number => {
                timeline.set(probe, value);
                return probe[rule.field];
              },
            }),
      });
    }
  }
  const pathSlots: string[] = [];
  for (const skin of data.skins) {
    for (const entry of skin.getAttachments()) {
      if (!(entry.attachment instanceof PathAttachment)) continue;
      const name = data.slots[entry.slotIndex].name;
      if (!pathSlots.includes(name)) pathSlots.push(name);
    }
  }
  return { animations: data.animations.length, constraints, timelines, pathSlots };
}

/**
 * The runtime's supply of `ConstraintTargetFacts` (issue #1025, cut 4c-5):
 * A34's walk of the raw JSON, as A34 always walked it — the `constraints`
 * array's objects, then each animation (`Object.entries`, the file's order)
 * that is an object, its `ik` and `transform` groups (each entry ONE key
 * array) and its `path`, `physics` and `slider` groups (each entry an object
 * of named key arrays, or a bare value), each where the group is an object.
 * `reach` builds the timeline the parser builds for a physics timeline NAME
 * (`unnamedPhysicsTimeline`) and asks it of the file's physics constraint
 * objects (`unnamedPhysicsReach`). The model side's supply is
 * `./assertions/model/constraint_targets.ts`.
 */
export function rawConstraintTargets(raw: Json): ConstraintTargetFacts {
  const objects = (Array.isArray(raw.constraints) ? (raw.constraints as unknown[]) : []).filter((entry): entry is Json => isObj(entry));
  const constraints = objects.map((entry) => ({ name: typeof entry.name === 'string' ? entry.name : null, type: String(entry.type), spelled: String(entry.name) }));
  const rawPhysics = objects.filter((entry) => entry.type === 'physics');
  const keyArray = (timeline: string, keys: unknown): TargetKeyArray => ({ timeline, keys: Array.isArray(keys) ? { count: keys.length } : { spelled: `${JSON.stringify(keys)}` } });
  let animations: TargetAnimation[] | null = null;
  if (isObj(raw.animations)) {
    animations = [];
    for (const [name, anim] of Object.entries(raw.animations)) {
      if (!isObj(anim)) continue;
      const groups: TargetAnimation['groups'][number][] = [];
      for (const group of ['ik', 'transform'] as const) {
        if (!isObj(anim[group])) continue;
        groups.push({ group, entries: Object.entries(anim[group] as Json).map(([target, keys]) => ({ name: target, bare: null, keyArrays: [keyArray('', keys)] })) });
      }
      for (const group of NAMED_TIMELINE_GROUPS) {
        if (!isObj(anim[group])) continue;
        groups.push({
          group,
          entries: Object.entries(anim[group] as Json).map(([target, timelines]) =>
            isObj(timelines) ? { name: target, bare: null, keyArrays: Object.entries(timelines).map(([timeline, keys]) => keyArray(timeline, keys)) } : { name: target, bare: JSON.stringify(timelines), keyArrays: [] },
          ),
        });
      }
      animations.push({ name, groups });
    }
  }
  return {
    constraints,
    groupsByAnimation: animations,
    reach: (name) => {
      const timeline = unnamedPhysicsTimeline(name);
      if (timeline === null) return null;
      return { resets: timeline instanceof PhysicsConstraintResetTimeline, reached: unnamedPhysicsReach(timeline, rawPhysics).map((one) => String(one.name)) };
    },
  };
}

/**
 * The runtime's supply of `SliderCompositionFacts` (issue #1025, cut 4c-5):
 * the loaded sliders in the `constraints` array's order, and each animation's
 * loaded timelines in the order the runtime built them, each with its class
 * name and its `propertyIds` — spelled as the facts spell an id (the property's
 * name off `Property`, the index after it as loaded, and a deform or sequence
 * timeline's attachment OBJECT replaced by the address a skin files it under,
 * first filing kept, as `spineSequenceFacts` maps it) — and the sentence's
 * words for each, `describe` as A40 always wrote it. `behaviour` is today's
 * probe, `timelineAddBehaviour`. The model side's supply is
 * `./assertions/model/slider_composition.ts`.
 */
export function spineSliderComposition(data: ReturnType<SkeletonJson['readSkeletonData']>): SliderCompositionFacts {
  let addressOf: Map<object, string> | null = null;
  const address = (attachment: object): string => {
    if (addressOf === null) {
      addressOf = new Map();
      for (const skin of data.skins) {
        for (const entry of skin.getAttachments()) {
          if (!addressOf.has(entry.attachment)) addressOf.set(entry.attachment, entryAddress(skin.name, data.slots[entry.slotIndex].name, entry.placeholder));
        }
      }
    }
    return addressOf.get(attachment) ?? '';
  };
  /** What a property id points at, in the words the rig spec uses — A40's `describe`. */
  const describe = (timeline: Timeline, id: string): string => {
    const property = Property[Number(id.split('|')[0])] ?? id;
    if (isBoneTimeline(timeline)) return `bone "${data.bones[timeline.boneIndex]?.name ?? timeline.boneIndex}" ${property}`;
    if (timeline instanceof DeformTimeline) {
      return `slot "${data.slots[timeline.slotIndex]?.name ?? timeline.slotIndex}" deform of "${timeline.attachment.name}"`;
    }
    if (isSlotTimeline(timeline)) return `slot "${data.slots[timeline.slotIndex]?.name ?? timeline.slotIndex}" ${property}`;
    if (isConstraintTimeline(timeline) && timeline.constraintIndex >= 0) {
      return `constraint "${data.constraints[timeline.constraintIndex]?.name ?? timeline.constraintIndex}" ${property}`;
    }
    return `the skeleton's ${property}`;
  };
  /** An id as the facts spell it: the property's name in place of its number, an attachment's address in place of its serial. */
  const idOf = (timeline: Timeline, id: string): string => {
    const [head, ...rest] = id.split('|');
    const named = [Property[Number(head)] ?? head, ...rest];
    if (timeline instanceof DeformTimeline || timeline instanceof RuntimeSequenceTimeline) named[2] = address(timeline.attachment);
    return named.join('|');
  };
  const timelinesOf = (animation: Animation): SliderTimelineFact[] =>
    animation.timelines.map((timeline) => ({
      runtimeClass: timeline.constructor.name,
      properties: timeline.propertyIds.map((id) => ({ id: idOf(timeline, id), property: Property[Number(id.split('|')[0])] ?? id, names: describe(timeline, id) })),
    }));
  const sliders: SliderFact[] = [];
  data.constraints.forEach((c, index) => {
    if (!(c instanceof SliderData)) return;
    sliders.push({
      name: c.name,
      index,
      mix: c.setupPose.mix,
      additive: c.additive,
      skinRequired: c.skinRequired,
      skins: data.skins.filter((skin) => skin.constraints.includes(c)).map((skin) => skin.name),
      animation: c.animation === null ? null : { name: c.animation.name, timelines: timelinesOf(c.animation) },
    });
  });
  return {
    sliders,
    behaviour: (animationName, at) => {
      const timeline = data.findAnimation(animationName)?.timelines[at];
      if (timeline === undefined) throw new Error(`internal: animation "${animationName}" has no timeline ${at}`);
      return timelineAddBehaviour(data, timeline);
    },
  };
}

/**
 * The facts cut 4c-2's bodies read, as `validate()` supplies them from a pair
 * spine-core loads — or `null` when the load throws (A00's failure). For the
 * selftest and `tools/verdict_gate.ts`, which compare them with the model
 * side's fact by fact, where a verdict line would hide a difference.
 */
export function runtimeRigFacts(skeletonText: string, atlasText: string): { meshes: MeshFacts; polygons: PolygonFacts; links: LinkFacts; constraints: ConstraintFacts } | null {
  let data: ReturnType<SkeletonJson['readSkeletonData']>;
  let raw: Json;
  try {
    raw = JSON.parse(skeletonText) as Json;
    data = new SkeletonJson(new AtlasAttachmentLoader(new TextureAtlas(atlasText))).readSkeletonData(JSON.parse(skeletonText));
  } catch {
    return null;
  }
  return { meshes: spineMeshFacts(data, raw), polygons: spinePolygonFacts(data, raw), links: spineLinkFacts(data, raw), constraints: spineConstraintFacts(data) };
}

/**
 * Cut 4c-3's facts (issue #1025) as `validate()` supplies them from a pair
 * spine-core loads — A39's survey, A09's durations, A43's tint and A46's series
 * — or `null` when the load throws. For the selftest's `VF12` and
 * `tools/verdict_gate.ts`, which hand them to the bodies and ask the model
 * side's suppliers the same questions, value by value.
 */
/**
 * The runtime's supply of A10's facts (issue #1025, cut 4c-5a): every pose A10
 * reads, posed by spine-core exactly as A10 always posed it.
 *
 * - The setup pose: `setupPose()`, `update(0)`,
 *   `updateWorldTransform(Physics.reset)`, no animation set.
 * - Each animation's walk: `setAnimation(0, name, true)` — a LOOPING track —
 *   over a fresh skeleton posed as above, then per step `AnimationState.update
 *   (step)`, `apply`, `Skeleton.update(step)`, `updateWorldTransform
 *   (Physics.update)`, one pose read after each.
 * - A bone's mode at a key: a fresh, non-looping track, the setup pose reset,
 *   the track stepped to the key's time and applied, then `update` and
 *   `updateWorldTransform(Physics.update)` by the same time.
 *
 * A pose is read as `posedNumbersOf` reads it for `render` (every bone's world
 * transform, every shown region's and mesh's world vertices), with each bone's
 * `appliedPose.inherit` — `null` where it is a value `updateWorldTransform`'s
 * switch has a case for, read off the runtime's own enum — and every slot's
 * light and dark colour. The model side's supply is
 * `./assertions/model/stepped_poses.ts`.
 */
export function spineSteppedPoses(raw: Json | null, data: ReturnType<SkeletonJson['readSkeletonData']>): SteppedPoseFacts {
  /** Is this a mode `updateWorldTransform`'s switch has a case for? Read off the runtime's own enum. */
  const isMode = (inherit: unknown): boolean => typeof inherit === 'number' && Inherit[inherit] !== undefined;
  const frameOf = (skeleton: Skeleton): SteppedFrame => {
    const { bones, drawn } = posedNumbersOf(skeleton);
    return {
      bones: bones.map((b, i) => {
        const inherit = skeleton.bones[i].appliedPose.inherit;
        return { ...b, inherit: isMode(inherit) ? null : String(inherit) };
      }),
      drawn,
      slots: skeleton.slots.map((slot) => {
        const c = slot.appliedPose.color;
        const d = slot.appliedPose.darkColor;
        return { name: slot.data.name, colour: [c.r, c.g, c.b, c.a] as const, dark: d === null ? null : ([d.r, d.g, d.b] as const) };
      }),
    };
  };
  return {
    boneCount: data.bones.length,
    steppedAnimations: data.animations.map((anim) => ({ name: anim.name, duration: anim.duration })),
    hasAnimation: (name) => Boolean(data.findAnimation(name)),
    hasBone: (name) => Boolean(data.findBone(name)),
    posedInherit: (animName, boneName, time) => {
      const skeleton = new Skeleton(data);
      const state = new AnimationState(new AnimationStateData(data));
      state.setAnimation(0, animName, false);
      skeleton.setupPose();
      skeleton.update(0);
      skeleton.updateWorldTransform(Physics.reset);
      state.update(time);
      state.apply(skeleton);
      skeleton.update(time);
      skeleton.updateWorldTransform(Physics.update);
      const bone = skeleton.findBone(boneName);
      if (bone === null) return undefined;
      const posed = bone.appliedPose.inherit;
      return isMode(posed) ? null : String(posed);
    },
    statedInherit: (name) => {
      const rawBone = Array.isArray(raw?.bones) ? (raw.bones as unknown[]).find((b) => isObj(b) && b.name === name) : undefined;
      return `${JSON.stringify(isObj(rawBone) ? rawBone.inherit : undefined)}`;
    },
    setup: () => {
      const atRest = new Skeleton(data);
      atRest.setupPose();
      atRest.update(0);
      atRest.updateWorldTransform(Physics.reset);
      return frameOf(atRest);
    },
    walk: (animName, step, frames) => {
      const skeleton = new Skeleton(data);
      const state = new AnimationState(new AnimationStateData(data));
      state.setAnimation(0, animName, true);
      skeleton.setupPose();
      skeleton.update(0);
      skeleton.updateWorldTransform(Physics.reset);
      const out: SteppedFrame[] = [];
      for (let i = 0; i < frames; i++) {
        state.update(step);
        state.apply(skeleton);
        skeleton.update(step);
        skeleton.updateWorldTransform(Physics.update);
        out.push(frameOf(skeleton));
      }
      return out;
    },
  };
}

export function runtimePosedFacts(skeletonText: string, atlasText: string): { deformSurvey: DeformSurveyFacts; animationDurations: AnimationDurationFacts; twoColour: TwoColourFacts; sequences: SequenceFacts; steppedPoses: SteppedPoseFacts; boneTimelines: BoneTimelineFacts } | null {
  let data: ReturnType<SkeletonJson['readSkeletonData']>;
  let raw: Json;
  try {
    raw = JSON.parse(skeletonText) as Json;
    data = new SkeletonJson(new AtlasAttachmentLoader(new TextureAtlas(atlasText))).readSkeletonData(JSON.parse(skeletonText));
  } catch {
    return null;
  }
  return { deformSurvey: spineDeformSurvey(data), animationDurations: spineAnimationDurations(data), twoColour: spineTwoColourFacts(raw, data), sequences: spineSequenceFacts(raw, data), steppedPoses: spineSteppedPoses(raw, data), boneTimelines: rawBoneTimelines(raw) };
}

/**
 * Cut 4c-5's facts (issue #1025) as `validate()` supplies them from a pair
 * spine-core loads — A40's sliders and A34's constraint groups, with the
 * constraint facts A40 reads beside them — or `null` when the load throws.
 * For the selftest's `VF14` and `tools/verdict_gate.ts`, which hand them to
 * the bodies and ask the model side's suppliers the same questions.
 */
export function runtimeCut4c5Facts(skeletonText: string, atlasText: string): { sliderComposition: SliderCompositionFacts; constraintTargets: ConstraintTargetFacts; constraints: ConstraintFacts } | null {
  let data: ReturnType<SkeletonJson['readSkeletonData']>;
  let raw: Json;
  try {
    raw = JSON.parse(skeletonText) as Json;
    data = new SkeletonJson(new AtlasAttachmentLoader(new TextureAtlas(atlasText))).readSkeletonData(JSON.parse(skeletonText));
  } catch {
    return null;
  }
  return { sliderComposition: spineSliderComposition(data), constraintTargets: rawConstraintTargets(raw), constraints: spineConstraintFacts(data) };
}

/** A fact supply computed on first use and kept: a supplier that throws throws inside the `check` that asked, as the body it feeds always did. */
function once<T>(supply: () => T): () => T {
  let held: { value: T } | null = null;
  return () => {
    held ??= { value: supply() };
    return held.value;
  };
}

export function validate(input: ValidateInput): ValidateReport {
  // Refuse unknown and removed profiles before choosing policy or writing a report (issue #1668).
  const profile = resolveProfile(input.profile, 'validate');
  /** True when this profile's rulebook includes the policy layer. */
  const policy = profile === 'rig-play';
  // The harness — `check`, `fail`, `skip` and the lists they fill — is
  // `./assertions/harness.ts`'s since issue #1025, and the rule is the one it
  // always was: the model side runs the bodies that moved there in the same
  // harness, so a verdict cannot be decided two ways.
  const { failures, passed, skipped, profileSkipped, stats, fail, skip, check, verdicts } = verdictHarness(profile, ASSERTION_KIND, 'validate');

  // -------------------------------------------------------------------------
  // Raw text / raw JSON assertions (they must run even if the parser is happy)
  // -------------------------------------------------------------------------

  let raw: Json | null = null;
  try {
    raw = JSON.parse(input.skeletonText) as Json;
  } catch (err) {
    fail('A00_ROUNDTRIP_PARSE', `skeleton JSON is not parseable: ${(err as Error).message}`);
  }

  // --- A07: atlas text shape ------------------------------------------------
  // Two traps, both measured: a region name is the RAW
  // line (only the page name is trimmed), and a blank line closes the page
  // block, so a blank line between a page header and its regions turns the
  // regions into pages.
  //
  // 🚨 Both traps are about a page BLOCK, and an atlas can honestly have none
  // (issue #608). A rig whose skins fill no slot with anything that needs art —
  // a hit-box skeleton carrying only a `boundingbox`, a clipping polygon, a
  // path — measures no pages, and `writeAtlasText` now spells that as the empty
  // file. Before this skip existed the walk below read it as one malformed page
  // block and printed two findings whose SUBJECTS DO NOT EXIST: there are no
  // consecutive blank lines in a file with no lines, and no last page block to
  // declare a region. `''.split('\n')` is `['']` rather than `[]`, so a
  // zero-byte atlas and a one-newline atlas both arrived here as a single blank
  // line, and the compiler's own output was refused by name for a shape nobody
  // had written.
  //
  // ⇒ Nothing to measure is a SKIP, and the sibling rule already settled this
  // for the same file: A08 skips with "this atlas declares no region and the
  // skeleton names no attachment that resolves through one". The protection is
  // not lost, because the case where an empty atlas MATTERS is an attachment
  // that wanted a region, and that is A08's failure by name (measured: a spec
  // built with `ingest --art none` and no `--atlas-in` fails A08 twice and A00
  // once, each naming the skin, the slot and the placeholder).
  const atlasLines = input.atlasText.replace(/\n$/, '').split('\n');
  const atlasPageLines = atlasLines.filter((line) => line.trim().length > 0).length;
  check('A07_ATLAS_TEXT_SHAPE', () => {
    if (atlasPageLines === 0) {
      // One of the exported reason constants, not a sentence of its own: the
      // static-rig suite's arithmetic (S50, #580) counts a rule as skipped
      // for want of a SUBJECT only when its reason is one of those constants.
      return skip('A07_ATLAS_TEXT_SHAPE', SKIP_NO_ATLAS_PAGE);
    }
    // A blank line at either END of the file is named as that end (issues #803,
    // #810), and a run of them is one finding stating its length. They are taken
    // off both ends before the walk below, so the walk sees the page blocks and
    // the blank lines between them and nothing else: a blank line after the last
    // region is not a page block, and "consecutive blank lines" and "the last
    // page block declares no region" are about blocks. `TextureAtlas` reads a
    // blank at either end as nothing (`TextureAtlas.js:98-100` skips the leading
    // run, `:116-118` ends a page block on each blank line), and rigc writes
    // neither (`writeAtlasText`, and `--atlas-in` through `canonicalAtlasShape`),
    // so a file that has one was written by something else and is refused.
    let leading = 0;
    while (leading < atlasLines.length && atlasLines[leading].trim().length === 0) leading++;
    if (leading > 0) {
      fail('A07_ATLAS_TEXT_SHAPE', `line 1: the file begins with ${leading === 1 ? 'a blank line' : `${leading} blank lines`}`);
    }
    let trailing = 0;
    while (trailing < atlasLines.length - leading && atlasLines[atlasLines.length - 1 - trailing].trim().length === 0) trailing++;
    const blockEnd = atlasLines.length - trailing;
    let expectPage = true;
    let sawRegionForPage = false;
    for (let i = leading; i < blockEnd; i++) {
      const line = atlasLines[i];
      if (line.trim().length === 0) {
        if (expectPage) fail('A07_ATLAS_TEXT_SHAPE', `line ${i + 1}: consecutive blank lines`);
        else if (!sawRegionForPage) {
          fail('A07_ATLAS_TEXT_SHAPE', `line ${i + 1}: blank line before this page had any region`);
        }
        expectPage = true;
        sawRegionForPage = false;
        continue;
      }
      if (expectPage) {
        expectPage = false;
        continue; // page name line
      }
      if (line.includes(':')) continue; // key: value line
      // A bare non-key line is a region name, and it is used untrimmed.
      if (line !== line.trim()) {
        fail('A07_ATLAS_TEXT_SHAPE', `line ${i + 1}: region name has stray whitespace: ${JSON.stringify(line)}`);
      }
      sawRegionForPage = true;
    }
    if (!sawRegionForPage) fail('A07_ATLAS_TEXT_SHAPE', 'the last page block declares no region');
    if (trailing > 0) {
      fail('A07_ATLAS_TEXT_SHAPE', `line ${blockEnd + 1}: the file ends with ${trailing === 1 ? 'a blank line' : `${trailing} blank lines`}`);
    }
  });

  // --- A08: every attachment path resolves to a region the atlas has -------
  //
  // 🚨 This runs on the RAW file, before the round trip, and that placement is
  // the whole of issue #589. Two of the three clauses below used to sit behind
  // A00 and could not be reached by any input: `lookup` was the path spine-core
  // had already resolved, and `AtlasAttachmentLoader.findRegion`
  // (`dist/AtlasAttachmentLoader.js:55-59`) throws
  // `Region not found in atlas: <path> (attachment: <name>)` for a path naming
  // no region and for one padded with whitespace alike, so the skeleton never
  // finished loading and A08's body never ran. Measured on three weakenings of
  // `examples/spineboy` × both profiles: every one printed A00 FAIL and A08
  // SKIP. An assertion that names the defect only when the defect is absent is
  // the silence this tool exists to convert.
  //
  // ⇒ The join is re-derived here from the raw JSON, where it is visible before
  // the loader is asked, so the miss is refused by its own sentence naming the
  // attachment, the placeholder and the path as THREE THINGS. The loader's
  // message names none of them: `(attachment: crosshair)` is the attachment's
  // `name`, never the placeholder or the skin, it never says which of the two
  // files moved, and for a padded path it prints the string unquoted —
  // `Region not found in atlas:  crosshair  (attachment: crosshair)` — where the
  // defect is literally invisible. `JSON.stringify` below is why A08 can show it.
  //
  // 🔒 The round trip is NOT suppressed by any of this, and that is deliberate:
  // it is the oracle, and gating it on rigc's own re-derivation would mean a
  // wrong join here could silence the parser rigc did not write. Because it
  // still runs, the two are a permanent two-sided cross-check — A08 refusing a
  // path A00 then loads, or A00 throwing `Region not found` over a green A08,
  // is a visible contradiction in one report. What A00 does instead of throwing
  // twice about one fact is defer: see its own body.
  //
  // 🗑️ A08 used to be MIXED: the join is validity, and a second clause gated on
  // `spine-html` required the skin entry's PLACEHOLDER to be spelled exactly
  // like the region it resolves to ("v0 requires them identical"). That clause
  // is retired (issue #574), and the reason is that the renderer it was profiled
  // under never performed the join it described.
  //
  // `spine-html@0.4.1` resolves art in two steps and the placeholder is in
  // neither. `DomTexture.js:78,102` builds the image map with
  // `put(atlasRegion.name, …)` over every region of the atlas, and
  // `SpineHtmlRenderer.js:172` reads it back as
  // `const regionImage = region && this.regionImages.get(region.name)`, where
  // `region` came off the attachment — which `AtlasAttachmentLoader` resolved
  // through `path`. Every published version of that renderer keys the same way
  // (checked 0.1.0 through 0.4.1, the whole series). Nothing in it reads an
  // attachment's name, let alone its placeholder.
  //
  // ⚠️ It was not merely inert, either: it refused rigs on both sides of the
  // convention it was written for. `path` exists precisely so a placeholder
  // may differ from the PNG basename (R5), and since issue #567 a placeholder
  // two named skins share is emitted as `<skin>/<placeholder>` with `path`
  // restated to the basename — the only spelling the Spine editor holds. Under
  // the old clause that shape, and any rig that merely named a part something
  // other than its placeholder, was red under `spine-html` while the editor
  // imported it and the renderer drew it.
  /**
   * Every attachment path A08 refused because the atlas holds no region of that
   * name — which is exactly the set `AtlasAttachmentLoader.findRegion` throws
   * on. A00 reads it so that its own row can point at A08 rather than restate
   * the miss in the loader's poorer words.
   */
  const pathsWithNoRegion = new Set<string>();
  check('A08_REGION_NAMES_MATCH_ATTACHMENTS', () => a08RegionNamesMatchAttachments(verdicts, spineRegionJoins(input.atlasText, raw), pathsWithNoRegion));

  // --- A31: every draw-order offset lands on a real place -------------------
  //
  // 🚨 This one runs BEFORE the round trip, and with A08 above it that is now
  // two assertions that do so for a reason other than "the parser is happy
  // about it" — A08 because the loader refuses the file before it can name what
  // is wrong with it, this one because the loader does not come back. A draw-order
  // key whose offsets are not in ascending slot order does not load wrong — it
  // does not load at all. `readDrawOrder` (SkeletonJson.ts:1336-1374) walks a
  // forward-only cursor:
  //
  //   while (originalIndex !== index) unchanged[unchangedIndex++] = originalIndex++;
  //
  // and an entry naming an EARLIER slot than the one before it makes that
  // condition unreachable, so the loader spins and grows an array until the
  // process dies. So the check has to happen first, and when it finds that shape
  // the round trip is not attempted at all — reported as such, not as a pass.
  //
  // The other two shapes are the format's usual silence. An offset that puts a
  // slot outside the array writes past the end, leaves a −1 hole in the
  // permutation, and the fill loop reads `unchanged[-1]` — `undefined` where a
  // slot index belongs, with nothing thrown. Two entries for one slot write
  // twice at one cursor position and the first move is simply lost.
  let drawOrderIsUnparseable: string | null = null;
  check('A31_DRAW_ORDER_OFFSETS_RESOLVE', () => {
    if (!raw) return skip('A31_DRAW_ORDER_OFFSETS_RESOLVE', 'the skeleton JSON did not parse (A00 owns that failure)');
    if (!Array.isArray(raw.slots) || !isObj(raw.animations)) {
      return skip('A31_DRAW_ORDER_OFFSETS_RESOLVE', 'the skeleton declares no slots or no animations');
    }
    const slotIndex = new Map<string, number>();
    (raw.slots as unknown[]).forEach((slot, i) => {
      if (isObj(slot) && typeof slot.name === 'string') slotIndex.set(slot.name, i);
    });
    const slotCount = (raw.slots as unknown[]).length;
    let sawATimeline = false;
    for (const [animName, anim] of Object.entries(raw.animations as Json)) {
      if (!isObj(anim) || !Array.isArray(anim.drawOrder)) continue;
      sawATimeline = true;
      (anim.drawOrder as unknown[]).forEach((key, k) => {
        const at = `animation "${animName}" drawOrder key ${k}`;
        if (!isObj(key) || !Array.isArray(key.offsets)) return; // no offsets = setup order
        let previous = -1;
        for (const entry of key.offsets as unknown[]) {
          if (!isObj(entry) || typeof entry.slot !== 'string' || typeof entry.offset !== 'number') {
            fail('A31_DRAW_ORDER_OFFSETS_RESOLVE', `${at}: an offset is not { slot: string, offset: number }`);
            continue;
          }
          const index = slotIndex.get(entry.slot);
          if (index === undefined) {
            fail('A31_DRAW_ORDER_OFFSETS_RESOLVE', `${at}: slot "${entry.slot}" is not in the skeleton`);
            continue;
          }
          if (index <= previous) {
            const detail =
              `${at}: slot "${entry.slot}" is at index ${index}, after an entry at index ${previous} — ` +
              'offsets must be in ascending slot order or the loader never finishes reading them';
            fail('A31_DRAW_ORDER_OFFSETS_RESOLVE', detail);
            drawOrderIsUnparseable ??= detail;
            continue;
          }
          previous = index;
          const landing = index + entry.offset;
          if (!Number.isInteger(entry.offset) || landing < 0 || landing >= slotCount) {
            fail(
              'A31_DRAW_ORDER_OFFSETS_RESOLVE',
              `${at}: slot "${entry.slot}" is at index ${index} and offset ${entry.offset} puts it at ${landing}, ` +
                `outside the ${slotCount} slots`,
            );
          }
        }
      });
    }
    if (!sawATimeline) return skip('A31_DRAW_ORDER_OFFSETS_RESOLVE', 'no animation carries a drawOrder timeline');
  });

  // --- A32: every event key fires a declared event, in order ----------------
  //
  // The event timeline's three failure modes, and only the first is loud:
  //
  //   1. **An undeclared name.** `findEvent` returns null and `readAnimation`
  //      throws `Event not found` (SkeletonJson.ts:1244). A00 would catch it, but
  //      as a parser message about a name with no context; this one says which
  //      animation, which key, and what the skeleton does declare.
  //   2. **Times out of order.** `readAnimation` writes frame `i` from key `i` in
  //      ARRAY order and never sorts, so a decreasing time builds an
  //      `EventTimeline` whose frames run backwards. It loads clean, and the
  //      firings behind the fold simply never come out. Equal times are fine —
  //      two events on one frame is ordinary — so this is non-decreasing.
  //   3. **`volume`/`balance` on a silent event.** `:1254-1257` reads them only
  //      inside `if (event.data.audioPath)`, so on an event with no `audio` they
  //      are two numbers in the file that no runtime will ever read.
  //
  // It runs on the raw JSON rather than on the loaded data because the loaded
  // `Event` no longer remembers which fields the file wrote: an override that was
  // dropped and an override that matched the default are the same object.
  //
  // ✂️ Split per clause since issue #1025 (cut 4c-4): the third mode is the
  // rig's — a readable model document states a key's `volume` and the event's
  // `audio` — and its clause is the body's (`./assertions/bodies/a32.ts`); the
  // first two, with "no string name" and "a time that is not a finite number",
  // are states the document's reader refuses by name, so they stay here, in
  // `rawEventKeys`, and the body prints what they found at their place.
  check('A32_EVENT_KEYS_RESOLVE', () => a32EventKeysResolve(verdicts, rawEventKeys(raw)));

  // --- A34: a constraint timeline aims at a constraint of that type ---------
  //
  // Five groups, in two shapes. `ik` and `transform` are ONE unnamed timeline
  // per constraint (`animations.<a>.ik.<name>` is the key array itself); `path`,
  // `physics` and `slider` put named timelines under the constraint
  // (`animations.<a>.path.<name>.position`). Both
  // shapes resolve the constraint by name AND by type —
  // `findConstraint(name, IkConstraintData)` returns null for a transform
  // constraint that happens to share the name, and `readAnimation` then throws
  // `IK Constraint not found`. That one is loud — A00 reports it, as a parser
  // message about a name with no context — so this assertion exists for the
  // second failure, which is silent:
  //
  //   **An empty key array.** `let keyMap = constraintMap[0]; if (!keyMap)
  //   continue;` — the group is read, the timeline is skipped, and nothing is
  //   said. `"ik": { "leg-ik": [] }` is a timeline that does not exist, written
  //   by a generator that thought it wrote one. Every one of the five groups has
  //   that line.
  //
  // Reporting both from here also means a candidate with a misspelled constraint
  // gets told which constraints it does have, rather than being handed the
  // loader's own sentence.
  //
  // ⚠️ `physics` was NOT in the named-timeline loop until issue #593, and the
  // comment above it named the shape after the group it left out. It cost
  // nothing while the motion spec could state two physics timelines and both
  // came from `compileValueTrack`; a spec that can state six more is a spec
  // that can aim them at a constraint that is not there. The group list is a
  // constant now, and the message that names the timelines a group takes reads
  // them off `CHANNELS_BY_KIND` — it used to be a ternary over two groups,
  // which is a sentence that cannot be extended without being rewritten.
  //
  // ✂️ Moved whole since issue #1025 (cut 4c-5): the body is
  // `./assertions/bodies/a34.ts`, over this file's constraint groups as the
  // raw JSON states them (`rawConstraintTargets`), and whom a physics timeline
  // naming no constraint reaches is still the parser's timeline asked of the
  // file's constraint objects, through the facts.
  check('A34_CONSTRAINT_TIMELINE_TARGETS', () =>
    raw ? a34ConstraintTimelineTargets(verdicts, rawConstraintTargets(raw)) : skip('A34_CONSTRAINT_TIMELINE_TARGETS', 'the skeleton JSON did not parse (A00 owns that failure)'),
  );

  // --- A35: a deform key's run lands inside the attachment it edits ---------
  //
  // 🚨 The nastiest silent failure in the animation half of this format. A deform
  // key is a sparse edit of a vertex array whose length comes from the attachment,
  // and the parser applies it with
  //
  //   Utils.arrayCopy(verticesValue, 0, deform, start, verticesValue.length)
  //
  // into a `Float32Array`. Writing past the end of a typed array in JavaScript is
  // a **no-op** — no throw, no warning, no NaN — so a run one pair too long, or a
  // run aimed at an attachment with fewer vertices than the author thought, loses
  // its tail and deforms the rest correctly. The result looks nearly right, which
  // is worse than looking wrong.
  //
  // One more shape, equally quiet: a **non-finite value** in `vertices` reaches
  // `computeWorldVertices` and turns the vertex into NaN, which A10 would only
  // catch if the deformed slot's BONE went non-finite, and it does not.
  //
  // The length depends on the encoding and the two are the same split
  // `readVertices` makes: unweighted is one pair per vertex, weighted is one pair
  // per bone influence (`vertices.length / 3 * 2`). Deriving it here rather than
  // assuming either is the whole point — assuming would produce a confident,
  // wrong bound on half the meshes in the world.
  //
  // ## ⛔ What this rule must NOT require: pair alignment (issue #262)
  //
  // It used to refuse an odd `offset` and an odd-length run, on the reading that
  // "the array is x, y pairs, so a run has to start and end on one". The array is
  // pairs; the RUN is not, and the parser above is the whole argument — `start` is
  // a raw index into the deform array, `arrayCopy` copies `verticesValue.length`
  // floats from it, and the element-wise `deform[i] += vertices[i]` that follows
  // walks the entire array rather than the run. There is no pair arithmetic
  // anywhere in that path, so a run may begin and end mid-pair, and every slot the
  // run does not cover keeps the zero the fresh `Float32Array` came with — which
  // is the identity delta, i.e. exactly the setup vertex.
  //
  // 🚨 That made the rule refuse legitimate editor output. Spine trims leading
  // zeros off a delta run, and a trim lands wherever the zeros stop: the official
  // `spineboy-pro` export keys `hoverboard-board` (an unweighted mesh, 148 floats)
  // with `offset: 1` and 147 values, covering `1..148`. A35 was the only assertion
  // that failed it — `A00` round-trips it and `A10` steps it clean — and it is a
  // `'validity'` rule, so it fired in every profile and told an agent holding a
  // file that every Spine runtime plays to go and change correct data.
  //
  // ⭐ The bound that survives is the one the runtime actually has: the run has to
  // FIT (`offset + vertices.length <= deformLength`). That is the quiet defect the
  // rule exists for and it is unaffected by where the run starts.
  check('A35_DEFORM_KEYS_FIT_THE_ATTACHMENT', () => {
    if (!raw) return skip('A35_DEFORM_KEYS_FIT_THE_ATTACHMENT', 'the skeleton JSON did not parse (A00 owns that failure)');
    if (!isObj(raw.animations)) return skip('A35_DEFORM_KEYS_FIT_THE_ATTACHMENT', 'the skeleton declares no animations');
    /** skin name -> slot -> attachment, straight off the raw JSON. */
    const skins = new Map<string, Json>();
    for (const skin of Array.isArray(raw.skins) ? (raw.skins as unknown[]) : []) {
      if (isObj(skin) && typeof skin.name === 'string' && isObj(skin.attachments)) {
        skins.set(skin.name, skin.attachments as Json);
      }
    }
    let sawATimeline = false;
    let measured = 0;
    for (const [animName, anim] of Object.entries(raw.animations as Json)) {
      if (!isObj(anim) || !isObj(anim.attachments)) continue;
      for (const [skinName, slotMap] of Object.entries(anim.attachments as Json)) {
        if (!isObj(slotMap)) continue;
        for (const [slotName, attMap] of Object.entries(slotMap)) {
          if (!isObj(attMap)) continue;
          for (const [attName, timelines] of Object.entries(attMap)) {
            if (!isObj(timelines) || !Array.isArray(timelines.deform)) continue;
            sawATimeline = true;
            const at = `animation "${animName}" deform ${skinName}/${slotName}/${attName}`;
            const attachment = isObj(skins.get(skinName)?.[slotName])
              ? ((skins.get(skinName)![slotName] as Json)[attName] as unknown)
              : undefined;
            if (!isObj(attachment)) {
              fail(
                'A35_DEFORM_KEYS_FIT_THE_ATTACHMENT',
                `${at}: skin "${skinName}" has no attachment "${attName}" on slot "${slotName}"; the parser throws ` +
                  '`Timeline attachment not found`',
              );
              continue;
            }
            const length = deformArrayLength(attachment);
            if (length === null) {
              // A linked mesh takes its geometry from another attachment, so the
              // raw file cannot state this one's length. Saying nothing beats
              // inventing a bound: an assertion with a default is how "nothing to
              // measure" becomes a measurement of the wrong thing.
              continue;
            }
            measured++;
            const keys = timelines.deform as unknown[];
            if (keys.length === 0) {
              fail('A35_DEFORM_KEYS_FIT_THE_ATTACHMENT', `${at}: the key array is empty; the parser skips the timeline in silence`);
              continue;
            }
            keys.forEach((key, k) => {
              if (!isObj(key)) {
                fail('A35_DEFORM_KEYS_FIT_THE_ATTACHMENT', `${at} key ${k}: not an object`);
                return;
              }
              const vertices = key.vertices;
              if (vertices === undefined || vertices === null) return; // "back to setup" — nothing to fit
              if (!Array.isArray(vertices)) {
                fail('A35_DEFORM_KEYS_FIT_THE_ATTACHMENT', `${at} key ${k}: vertices is ${JSON.stringify(vertices)}, not an array`);
                return;
              }
              const offset = key.offset === undefined ? 0 : key.offset;
              if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0) {
                fail('A35_DEFORM_KEYS_FIT_THE_ATTACHMENT', `${at} key ${k}: offset is ${JSON.stringify(key.offset)}`);
                return;
              }
              // ⛔ No parity clause here, and the header says why: an odd `offset`
              // and an odd-length run are both what a trimmed editor export looks
              // like, and the parser has no pair arithmetic to be misaligned
              // against (#262).
              if (offset + vertices.length > length) {
                fail(
                  'A35_DEFORM_KEYS_FIT_THE_ATTACHMENT',
                  `${at} key ${k}: the run covers ${offset}..${offset + vertices.length} of a ${length}-long deform ` +
                    'array; everything past the end is copied into a Float32Array and dropped without a word',
                );
              }
              for (const n of vertices as unknown[]) {
                if (typeof n !== 'number' || !Number.isFinite(n)) {
                  fail('A35_DEFORM_KEYS_FIT_THE_ATTACHMENT', `${at} key ${k}: the run holds a non-finite value ${JSON.stringify(n)}`);
                  break;
                }
              }
            });
          }
        }
      }
    }
    if (!sawATimeline) return skip('A35_DEFORM_KEYS_FIT_THE_ATTACHMENT', 'no animation carries a deform timeline');
    if (measured === 0) {
      return skip(
        'A35_DEFORM_KEYS_FIT_THE_ATTACHMENT',
        'every deform timeline here keys an attachment whose vertex count the raw file does not state (a linked mesh)',
      );
    }
  });

  // A52 (issue #1407) reads the raw text as A31 and A35 do: the order a weighted
  // run lists its bones in is a fact of the file the Spine editor refuses and
  // spine-core loads, so it runs whether or not the round trip does.
  check('A52_WEIGHTED_VERTICES_SHARE_ONE_BONE_ORDER', () => a52WeightedVerticesShareOneBoneOrder(verdicts, raw));

  // --- A: the round trip ----------------------------------------------------
  // The two loaded objects come back OUT of the assertion rather than being
  // assigned into it. Everything below reads them, and a `let` written inside a
  // callback is a value the type checker cannot see being set: it narrows to
  // `null` at the first guard and to `never` inside it, so `atlas.pages` stops
  // type-checking while working perfectly at runtime.
  const roundTrip = check('A00_ROUNDTRIP_PARSE', () => {
    if (drawOrderIsUnparseable !== null) {
      throw new Error(`not attempted — the loader would not return: ${drawOrderIsUnparseable}`);
    }
    const parsedAtlas = new TextureAtlas(input.atlasText);
    const json = new SkeletonJson(new AtlasAttachmentLoader(parsedAtlas));
    try {
      return { atlas: parsedAtlas, data: json.readSkeletonData(JSON.parse(input.skeletonText)) };
    } catch (err) {
      // 📌 The round trip is still ATTEMPTED — always, and A08 above cannot
      // stop it (issue #589). What changes here is only what A00 SAYS when the
      // loader refuses a region A08 has already refused by name: it defers
      // instead of printing the same fact a second time, in words that name
      // neither the placeholder nor the skin and that cannot show whitespace.
      //
      // ⚠️ The deference is conditional on the two agreeing about the exact
      // path, so the case A08 is wrong about stays loud: a `Region not found`
      // throw over a path A08 did NOT refuse prints verbatim, and A08 refusing
      // a path the loader then resolves leaves a FAIL beside a green A00. This
      // is the one clause that would hide either, and it is written so it
      // cannot.
      const wanted = /^Region not found in atlas: (.*) \(attachment: .+\)$/.exec((err as Error).message);
      if (wanted !== null && pathsWithNoRegion.has(wanted[1])) {
        throw new Error(
          'the loader refused the file at the first attachment path this atlas has no region for — ' +
            'A08_REGION_NAMES_MATCH_ATTACHMENTS names it, with the skin, the slot and the placeholder that wanted it',
        );
      }
      throw err;
    }
  });
  const atlas: TextureAtlas | null = roundTrip?.atlas ?? null;
  const skeletonData: ReturnType<SkeletonJson['readSkeletonData']> | null = roundTrip?.data ?? null;

  if (atlas) {
    stats.pages = atlas.pages.length;
    stats.regions = atlas.regions.length;
  }
  if (skeletonData) {
    stats.bones = skeletonData.bones.length;
    stats.slots = skeletonData.slots.length;
    stats.animations = skeletonData.animations.length;
    stats.version = skeletonData.version ?? '(none)';
  }

  // --- A16: version label ---------------------------------------------------
  //
  // The label must be on the 4.3 line, and the line includes its pre-releases:
  // every one of the nine official example exports declares "4.3.75-beta", which
  // the original `/^4\.3(\.\d+)?$/` rejected. That made the first file of the
  // benchmark ladder fail on a cosmetic string. What the assertion is actually
  // for is the MAJOR.MINOR pair — a 4.2 or 5.x label is portable-fragile because
  // some runtimes refuse a version mismatch outright (spine-runtimes CHANGELOG
  // line 1678), while spine-ts stores the string and never compares it. So the
  // patch component and any pre-release suffix after it are free, and 4.2/5.x
  // stay rejected.
  check('A16_SKELETON_VERSION_4_3', () => {
    const declared = isObj(raw?.skeleton) ? (raw.skeleton as Json).spine : undefined;
    if (typeof declared !== 'string' || spineGeneration(declared) !== SPINE_4_3) {
      fail(
        'A16_SKELETON_VERSION_4_3',
        `skeleton.spine is ${JSON.stringify(declared)}, expected 4.3, 4.3.<patch> or 4.3.<patch>-<suffix>`,
      );
    }
  });

  // --- A01: no legacy top-level constraint arrays ---------------------------
  // 4.3 folds every constraint into one `constraints` array with a `type`.
  // A 4.1/4.2-shaped `physics` array loads clean and the constraint just
  // vanishes. ⭐ The list is `generation.ts`'s since #706, because `ingest` has
  // to count the same arrays in a file it did not emit, and two copies of five
  // names is how one of them comes to be four.
  check('A01_NO_LEGACY_TOPLEVEL_CONSTRAINT_ARRAYS', () => {
    for (const key of TOPLEVEL_CONSTRAINT_ARRAYS) {
      if (raw && key in raw) {
        fail(
          'A01_NO_LEGACY_TOPLEVEL_CONSTRAINT_ARRAYS',
          `top-level "${key}" array present; 4.3 wants it inside "constraints" with type:"${key}"`,
        );
      }
    }
  });

  // --- A02: no bone.transform key ------------------------------------------
  // 4.2 renamed it to `inherit`, and 4.3 kept that spelling; the old key loads
  // and silently falls back to Normal inheritance (case 6b). The key itself is `generation.ts`'s, for
  // A01's reason.
  check('A02_NO_BONE_TRANSFORM_KEY', () => {
    const bones = Array.isArray(raw?.bones) ? (raw.bones as unknown[]) : [];
    for (const bone of bones) {
      if (isObj(bone) && LEGACY_BONE_INHERIT_KEY in bone) {
        fail('A02_NO_BONE_TRANSFORM_KEY', `bone "${String(bone.name)}" uses "transform", the key 4.0 and 4.1 spelled; 4.2 and 4.3 spell it "inherit"`);
      }
    }
  });

  // --- A12: no dark / two-colour tint --------------------------------------
  // Parsed, then ignored by rig-play's DOM mode.
  check('A12_NO_DARK_COLOR', () => a12NoDarkColor(verdicts, rawSkeletonRoster(raw), rawSlotTimelines(raw)));

  // --- A05: curve arrays are 4 numbers per value channel --------------------
  check('A05_CURVE_ARRAY_LENGTH', () => {
    // Two clauses, so the SKIP needs both to be empty (#580). The vocabulary
    // clause below measures every timeline it is handed — an unchecked name is a
    // finding whether or not any key on it carries a curve — so a skeleton with
    // timelines and no curve at all has still been measured. What measures
    // nothing is a skeleton `walkTimelines` never calls back on.
    let timelines = 0;
    walkTimelines(raw, (path, kind, name, keys) => {
      timelines++;
      const table = CHANNELS_BY_KIND[kind];
      if (!(name in table)) {
        fail('A05_CURVE_ARRAY_LENGTH', `${path}: unchecked ${kind} timeline "${name}" — extend the validator`);
        return;
      }
      const channels = table[name];
      for (const key of keys) {
        if (!isObj(key) || !('curve' in key)) continue;
        const curve = key.curve;
        if (channels === null) {
          fail('A05_CURVE_ARRAY_LENGTH', `${path}: timeline "${name}" cannot carry a curve`);
          continue;
        }
        if (curve === 'stepped') continue;
        if (!Array.isArray(curve)) {
          fail('A05_CURVE_ARRAY_LENGTH', `${path}: curve is ${JSON.stringify(curve)}, expected "stepped" or an array`);
          continue;
        }
        if (curve.length !== channels * 4) {
          fail(
            'A05_CURVE_ARRAY_LENGTH',
            `${path} (t=${String(key.time ?? 0)}): curve has ${curve.length} numbers, "${name}" needs ${channels} channels x 4 = ${channels * 4}`,
          );
        }
        for (const n of curve) {
          if (typeof n !== 'number' || !Number.isFinite(n)) {
            fail('A05_CURVE_ARRAY_LENGTH', `${path}: curve holds a non-finite value ${JSON.stringify(n)}`);
          }
        }
      }
    });
    if (timelines === 0) return skip('A05_CURVE_ARRAY_LENGTH', SKIP_NO_TIMELINE);
  });

  // -------------------------------------------------------------------------
  // Loaded-data assertions
  // -------------------------------------------------------------------------

  const regionAttachments: RegionAttachment[] = [];
  const meshAttachments: MeshAttachment[] = [];
  const meshSlots = new Set<number>();
  /**
   * What cut 4c-2's bodies read (issue #1025), each supplied off the loaded
   * skeleton the first time a body asks for it — so a supplier that throws
   * throws inside the `check` that asked, as the body it feeds always did.
   * Every mesh's link is read off the raw JSON and joined by (skin, slot,
   * placeholder) rather than asked of the loaded object, because
   * `MeshAttachment.sourceMesh` is **private with no accessor**
   * (`MeshAttachment.d.ts:50`) and `as any` is not available in `src/`; the
   * join is the parser's own (`spineMeshFacts`, `spineLinkFacts`).
   */
  const loadedMeshFacts = once(() => spineMeshFacts(skeletonData as NonNullable<typeof skeletonData>, raw));

  if (skeletonData) {
    const data = skeletonData as NonNullable<typeof skeletonData>;
    for (const skin of data.skins) {
      for (const entry of skin.getAttachments()) {
        const att = entry.attachment;
        if (att instanceof RegionAttachment) regionAttachments.push(att);
        else if (att instanceof MeshAttachment) {
          meshAttachments.push(att);
          meshSlots.add(entry.slotIndex);
        }
      }
    }
    const polygonFacts = once(() => spinePolygonFacts(data, raw));
    const linkFacts = once(() => spineLinkFacts(data, raw));
    const constraintFacts = once(() => spineConstraintFacts(data));
    stats.regionAttachments = regionAttachments.length;
    stats.meshAttachments = meshAttachments.length;
    // What the bodies that moved to `./assertions/bodies/` read of the skins —
    // the runtime's supply of `SkinEntryFacts`, in the loaded skins' own order
    // (issue #1025).
    const skinEntries = spineSkinEntries(data);
    // What the mesh rules that moved read of the skins (issue #1025, cut 4c-1) is the one family of the meshes since issue #1054, `loadedMeshFacts`.

    // --- A03: every region has finite width/height (case 6c) ---------------
    check('A03_REGION_WIDTH_HEIGHT_FINITE', () => a03RegionWidthHeightFinite(verdicts, skinEntries));

    // --- A04: mesh triangles + encoding coherence (case 6f) ----------------
    check('A04_MESH_TRIANGLES_AND_ENCODING', () => a04MeshTrianglesAndEncoding(verdicts, loadedMeshFacts()));

    // --- A33: bounding boxes and clipping polygons hold a real polygon -------
    // The body, its three silent failures and the clauses that stayed here
    // (the vertex run's decode, `polygonRunFindings`) are
    // `./assertions/bodies/a33.ts` (issue #1025, cut 4c-2).
    check('A33_VERTEX_ATTACHMENT_GEOMETRY', () => a33VertexAttachmentGeometry(verdicts, polygonFacts()));

    // --- A13 / A14: canvas budgets ----
    // A11 stood here until issue #1404 retired it: the player `rig-play` names
    // draws a clipping attachment in both of its modes.
    // 📐 The two numbers come from the rig spec's `invariants`, never from here.
    // A mesh budget is one consumer's frame time written down — the editor's own
    // example projects ship meshes many times denser and they are valid — so a
    // constant in the validator would fail correct foreign data in the name of
    // somebody else's canvas. A rig that declares no budget has nothing to be
    // measured against, and the assertion says so instead of inventing a wall.
    check('A13_MESH_BUDGET', () => a13MeshBudget(verdicts, loadedMeshFacts(), input));
    check('A14_NO_FULL_FRAME_MESH', () => a14NoFullFrameMesh(verdicts, loadedMeshFacts(), spineStage(data, input.modelText)));

    // --- A15: idle must not key a mesh-driving bone (dirty-skip lever) -----
    //
    // 🔑 The rule assumes meshes are mostly static: the renderer it serves skips
    // redrawing a mesh nothing moved, and an `idle` keying one of its bones spends
    // that skip on every frame. A painting rig is the genre where the assumption
    // is false by design (issues #855, #858) — one illustration in layers, most
    // of them weighted meshes, and an `idle` whose job is to move them — so the
    // rig can say so in `invariants.idleDrivesMeshes`, and the rule then reports
    // what the declaration costs instead of refusing each bone.
    check('A15_IDLE_NO_MESH_BONE_KEYS', () => a15IdleNoMeshBoneKeys(verdicts, loadedMeshFacts(), spineAnimatedBones(raw), input));

    // --- A20/A21/A22: the mesh checks the parser will never make ------------
    //
    // A mesh is the one attachment type where every mistake is silent. Bad
    // weights do not throw, they skew; a uv outside the region samples the
    // wrong pixels; and an unpinned rim moves the seam, which is the single
    // thing the whole generated-parts approach depends on not happening.
    // A20 and A21 read their meshes through `MeshFacts` since issue #1025
    // (cut 4c-2): what built a mesh is `./assertions/mesh_kinds.ts`, the
    // decoded weights `spineMeshFacts`, and both bodies `./assertions/bodies/`.
    check('A20_MESH_WEIGHTS_COHERENT', () => a20MeshWeightsCoherent(verdicts, loadedMeshFacts(), policy, input.rig));

    check('A21_MESH_RIM_PINNED', () => a21MeshRimPinned(verdicts, loadedMeshFacts(), input.rig));

    check('A22_MESH_UVS_IN_UNIT_RANGE', () => a22MeshUvsInUnitRange(verdicts, loadedMeshFacts()));

    // --- A39: a deform key that turns a triangle inside out ------------------
    //
    // 🚨 The animation half of this format had NO geometric measurement at all.
    // `A35` measures a deform run's LENGTH and its finiteness, and is silent on
    // whether the numbers in it mean anything: a key whose offsets are the wrong
    // sign, the wrong magnitude, or geometrically degenerate is green. Issue
    // #296 is that asymmetry, measured — three builds of `gallery/portrait`, one
    // correct, one with a band inverted and one folded at 40°, gate green with
    // the same 26 PASS / 13 SKIP and a byte-identical `MESH` coverage line,
    // because that line reports the SETUP pose (docs/FACE.md §9.2).
    //
    // What this measures is the one deformed-geometry fault that has a
    // reference-free answer: a triangle whose winding REVERSES draws its texture
    // backwards, and a mesh with one in it has locally turned inside out.
    //
    // ## The frame, and why it is the posed one
    //
    // Both sides of the comparison are taken at the key's OWN time, with the
    // animation applied — the deformed mesh against the same posed bones with
    // the deform cleared. Holding the bones at SETUP instead was tried and is
    // wrong in principle: a weighted mesh's offsets are authored in bone space
    // against the pose they land in, so setup bones measure a pose that never
    // occurs. (Measured, on this corpus the two frames agree to ~0.001 px² —
    // the fold is in the deform data either way — but the principle decides it,
    // not the agreement.) Sharing the bones between the two sides is also what
    // makes a MIRRORED slot bone a non-event: a negative determinant flips every
    // triangle on both sides and cancels.
    //
    // 🚨 **And "applied" means applied the way the animation is reached** (issue
    // #407). An animation a slider applies is never played on a track — the dial
    // selects the time, so the key's time and the applied time are the same
    // number by construction — and posing it on a track while its own slider
    // applies it at the neutral is the same error as setup bones, one level up:
    // a frame no playthrough contains. It reported a fold on a correct rig, and
    // the slot-colour half of the neutral apply undid the very alpha-0 key the
    // exemption below reads. So the survey inverts the slider's own mapping and
    // drives its bone until the runtime selects this key's time; the frame it
    // used is on every `DEFORM` line and on the stats line here.
    //
    // ## ⚠️ Why this is `archetype` and not `validity`
    //
    // Because the issue's premise — "it has no legitimate counter-example" — is
    // false on this repository's own corpus, and that was found by running it:
    //
    //   - `spineboy-pro`, an official Spine editor export, flips 1 of the 101
    //     triangles of `hoverboard-board` at key 1 (area −31.53 → +8.48, 2.5e-3
    //     of that mesh's largest triangle).
    //   - `gallery/flex` flipped up to 7 of the 75 triangles of its `leaf`, and
    //     that one WAS a defect — visible tearing at the gust peak. Repaired in
    //     issue #313: its exemption is gone and it gates green here now, which
    //     leaves the editor export as the only standing counter-example.
    //
    // A `validity` rule would therefore tell an author holding correct editor
    // output to go and change it, which is what issues #44 and #262 already
    // cost this file twice. `archetype` says what is true: *rigc's own
    // formations do not fold*, judged under the profile where rigc's own policy
    // lives, and never on a skeleton rigc did not compile.
    //
    // A magnitude threshold was considered as the way to keep it `validity` —
    // exempt spineboy's 2.5e-3 sliver, catch the rest — and declined: the
    // smallest genuine defect the corpus then held (`flex` at 5.4e-3) and that
    // sliver were within a factor of two, so the wall would have been calibrated
    // on two points and separated nothing. Repairing `flex` does not revive the
    // idea: it removes the only point that was on the other side of the wall.
    // `invariants.deformMayFold` is the escape hatch instead, because *the
    // author* knows whether the page is turning over — and as of #313 nothing in
    // this repository uses it.
    //
    // ## The keys it reads no winding off at all (issue #401)
    //
    // One whose slot draws **no pixels** at that key's own time: faded to alpha
    // exactly 0, or showing another attachment. The message below states the
    // harm as "draws its texture backwards there", and that sentence is false
    // when nothing of the mesh lands — so the key is measured, printed, counted
    // on the stats line and then passed over. A triangle that draws no pixels
    // cannot draw them backwards.
    //
    // 🚨 **Exactly 0, and per key.** At alpha 0.5 a reversed triangle is plainly
    // visible at half strength and this goes on refusing it, with the alpha in
    // the message; any floor above 0 would be this repository choosing a
    // visibility policy, which is the thing an archetype rule exists not to do.
    // And a slot keyed to 0 in ONE animation is still gated in every other,
    // because the measurement is of a time and not of a slot — which is the
    // whole difference between this and `deformMayFold`, and why widening that
    // field was the wrong fix: it would have bought the fade at the price of a
    // blind spot at every angle where the part is fully visible.
    //
    // ## And the times NO key lands on (issue #403)
    //
    // The keys are where the data is; they are not where the runtime is. A deform
    // inside its fold angle at every key can be past it in between, and the
    // exemption above makes that easy to build into rather than merely possible:
    // land the alpha-0 key ON the folding key and the frames just before it are
    // drawn, nearly folded and — until this — unmeasured. Measured on the turn
    // probe: eight reversed triangles at alpha 0.20, gating green.
    //
    // So the survey also scans every SPAN between two consecutive keys. Its
    // arithmetic is a closed form rather than a subdivision count (the derivation
    // is on `wrongSignFractions`), and what it names is then *measured* at that
    // real posed time, alpha included — so a span refusal below is the same
    // measurement as a key refusal, taken at a time no key lands on.
    //
    // ⭐ **A span refusal is suppressed when either of its own two keys is
    // already refused.** The span check exists to say what the keys cannot; when
    // a key has already said it, a second and third message about one defect is
    // noise, and the build is refused either way.
    //
    // ## Where the arithmetic lives
    //
    // In [`src/deformmeasure.ts`](src/deformmeasure.ts), not here — because issue
    // #316's `DEFORM` report block prints the same reversal count this assertion
    // refuses on, and two derivations of one number drift. The survey measures
    // every key of every timeline and every span between them; this reads the
    // reversals out of it and the report prints the rest. What stays here is the
    // SEVERITY and the exemption: the survey has no opinion about either, which
    // is what lets a report run it with no exemption at all.
    //
    // Since issue #1025 (cut 4c-3) "here" is `./assertions/bodies/a39.ts`, which
    // takes the survey as a fact: `spineDeformSurvey` hands it spine-core's, and
    // the model side the core's over the model document — the same body, and the
    // survey the two hand it held to one by `tools/survey_hashes.ts`.
    check('A39_DEFORM_KEEPS_TRIANGLE_WINDING', () => a39DeformKeepsTriangleWinding(verdicts, spineDeformSurvey(data), input.rig));

    // --- A23, A36, A37, A47, A48: a constraint that does nothing, quietly -
    //
    // Their bodies, the reasoning each states and the one reading of "does an
    // animation switch this on" they share (`switchedOn`, which replaced the
    // loaded-timeline `keyedLive` that stood here) moved to
    // `./assertions/bodies/` and `./assertions/constraint_words.ts` with issue
    // #1025 (cut 4c-2): every clause is about the rig, and each reads
    // `ConstraintFacts`, which `spineConstraintFacts` supplies here.
    check('A23_PHYSICS_CONSTRAINT_EFFECTIVE', () => a23PhysicsConstraintEffective(verdicts, constraintFacts(), loadedMeshFacts()));

    check('A36_PATH_CONSTRAINT_EFFECTIVE', () => a36PathConstraintEffective(verdicts, constraintFacts()));

    check('A37_SLIDER_CONSTRAINT_EFFECTIVE', () => a37SliderConstraintEffective(verdicts, constraintFacts()));

    // --- A47 / A48: an ik or a transform constraint muted for good ----------
    //
    // The question A23, A36 and A37 ask of their own kinds, asked of the two
    // kinds editor exports use most (issue #765): a constraint that rests muted
    // and that no animation switches on parses, sits in the update cache and
    // moves nothing. [measured] on generated fixtures, 61 steps at 60 fps: an ik
    // at `mix` 0 that nothing keys, one keyed to 0 only, a transform at every mix
    // 0 that nothing keys and one keyed to 0 only each pose every bone exactly
    // where the same rig with no constraint does (max |Δ| 0.000000), and all four
    // gated green with 0 failures before these two existed. What is live
    // (`ikLive`), which transform mix is read and the third door
    // (`invariants.consumerDrivenMix`) are argued where they now live,
    // `./assertions/constraint_words.ts` and `./assertions/bodies/a48.ts`.
    check('A47_IK_CONSTRAINT_NOT_MUTED_THROUGHOUT', () => a47IkConstraintNotMutedThroughout(verdicts, constraintFacts(), input.rig));

    check('A48_TRANSFORM_CONSTRAINT_NOT_MUTED_THROUGHOUT', () => a48TransformConstraintNotMutedThroughout(verdicts, constraintFacts(), input.rig));

    // --- A40: two sliders on one property, and the later one erases the other -
    //
    // 🚨 The hole A37 leaves. Every clause above is INTRA-slider — it asks
    // whether one slider applies anything at all — so nothing in the gate had an
    // opinion about two of them meeting, which is the shape a parameter-driven
    // face IS: one slider per axis, all of them on the same bones.
    //
    // `Slider.update` ends with
    //
    //   animation.apply(skeleton, p.time, p.time, data.loop, null, p.mix,
    //                   MixFrom.current, data.additive, false, true)
    //
    // and `additive` defaults to **false** (`SkeletonJson.js`: `getValue(map,
    // "additive", false)`). With `add` false and `alpha` 1 every value function
    // in `Animation.js` drops the pose it was handed — `getRelativeValue`
    // returns `setup + value`, `getAbsoluteValue` and `getScaleValue` return
    // `value` — so whatever an earlier slider wrote to that property is gone,
    // and the sliders run in the order the `constraints` array puts them in
    // (`Skeleton.updateCache` walks that array and each `Slider.sort` pushes
    // itself onto the update cache as it is reached).
    //
    // [measured, issue #402, and reproduced by the controls in `selftest.ts`]
    // Two dials on one bone contributing 7.50° and 18.75°: both at the default
    // pose the bone at **18.7498°** — the later one alone; the same pair with
    // the array order swapped poses **7.4999°** — the other one alone; both
    // `additive: true` pose **26.2497°**, the sum. On a three-axis face two axes
    // are silently dead, the rig builds, and every other assertion is green.
    //
    // ## ⚠️ Why this is `validity`
    //
    // Because the claim is Spine's own arithmetic and not this project's taste:
    // a skeleton shaped this way is wrong for every runtime that plays it, so a
    // `renderer` or `archetype` kind would exclude the rule from `--profile
    // spine` — the CLI default — and the rig the issue is about would build
    // green for exactly the stranger it was written for.
    //
    // The counter-question is the one issues #44 and #262 cost this file twice:
    // can correct editor output trip it? Three shapes could, and each is
    // excluded STRUCTURALLY rather than by a threshold:
    //
    //   1. **Authority below 1.** At `mix < 1` the apply is a lerp from the
    //      current pose (`current + (value + setup - current) * alpha`), so the
    //      earlier slider still contributes and a chain of partial mixes is a
    //      legitimate — if order-dependent — weighting. A slider whose setup mix
    //      is under 1, or whose `mix` any animation keys, is dropped before the
    //      comparison. This assertion has no opinion below full authority.
    //   2. **A skin switch.** `Skeleton.updateCache` makes a `skinRequired`
    //      constraint active only while `skin.constraints.includes(data)`, and a
    //      skeleton wears one skin, so two sliders listed by disjoint skins can
    //      never be active in the same frame and cannot erase each other.
    //   3. **Different properties.** The unit compared is spine-core's own
    //      `Timeline.propertyIds`, so two sliders on one bone that key different
    //      properties — a yaw that rotates and a lift that translates — are not
    //      a finding, and a partial overlap is refused only on the properties
    //      that actually overlap.
    //
    // What is left is not a judgement call. At full authority, with both sliders
    // active, there is no value of the erased slider's dial at which it changes
    // that property: it is dead weight on every frame. That is also why this
    // rule has no `invariants` escape hatch where A39 needs one — there is
    // nothing an author could be preserving.
    //
    // ⚠️ Unmeasured, and stated as such: no editor export in this repository
    // carries a slider AT ALL — it is 4.3's newest constraint — so unlike A39
    // the "correct editor output" question rests on the runtime's arithmetic
    // rather than on a counter-example anybody has held. If an export ever
    // trips it, this paragraph is the one to reread.
    //
    // ## The second clause: `additive: true` is not always available
    //
    // A slot colour, an attachment swap, a draw order, an ik mix and a path's
    // spacing IGNORE the `add` argument entirely (`RGBATimeline.apply1` takes it
    // and never reads it), so two sliders sharing one of those overwrite each
    // other whatever the flags say. Refusing that case too is what keeps this
    // message from teaching a fix that does not work: an author told to set
    // `additive: true` on a shared rgba would get a green gate over the same
    // dead axis.
    //
    // 🚨 **Which class is which is MEASURED, and reading the flag was wrong.**
    // This clause used to ask `Timeline.additive`, the runtime's own declaration
    // that a class supports additive application — and two classes declare
    // `false` and honour `add` anyway. `PathConstraintMixTimeline` and
    // `SliderTimeline` pass the argument straight through, so two additive
    // sliders keying one path constraint's `mix`, or one bone-less slider's
    // `time`, **do** compose as the plain sum, and this assertion refused them
    // by name with a sentence about the runtime the runtime does not perform
    // (issue #655; `PS143` poses all thirty spellings of the motion vocabulary
    // and `PS140` holds the `time` case to a grid). `timelineAddBehaviour`
    // above poses each shared timeline instead, so what is compared is what the
    // class does rather than what it says about itself.
    //
    // ## The events clause, removed rather than narrowed
    //
    // The same reading refused two sliders whose animations both fire events,
    // and that refusal was over a property no pose can distinguish: `Slider`
    // applies its animation with `firedEvents` **null**
    // (`Slider.js`: `animation.apply(skeleton, p.time, p.time, data.loop, null,
    // …)`), and `EventTimeline.apply` opens with `if (!firedEvents) return`, so
    // a slider fires no event at all. Neither slider has anything on that
    // property for the other to erase. The same is true of a physics `reset`
    // under a slider, where `lastTime === time` leaves its window empty.
    //
    // ⭐ Neither is named here, and that is the point: the probe's third state
    // is **a timeline that writes nothing at all**, so both fall out of one
    // measurement instead of two exceptions. A list of unobservable spellings
    // written into this file would have been the hand-kept table that produced
    // the defect above.
    //
    // ✂️ Moved whole since issue #1025 (cut 4c-5): the body is
    // `./assertions/bodies/a40.ts`, over the sliders and their animations'
    // timelines (`spineSliderComposition`) and the constraint facts, and what a
    // timeline does with `add` is still this probe, `timelineAddBehaviour`,
    // asked by the body through the facts.
    check('A40_SLIDERS_COMPOSE_ON_A_SHARED_TARGET', () => a40SlidersComposeOnASharedTarget(verdicts, spineSliderComposition(data), constraintFacts()));

    // --- A42: a dial that drives a constraint the array already ran ---------
    //
    // 🚨 The hole A40 leaves, and it leaves it BY CONSTRUCTION. A40's population
    // is the sliders at full authority whose own `mix` nothing keys, so the one
    // pair this rule is about — a slider whose `mix` IS keyed — is excluded
    // before any timeline is looked at. Between them the two rules ask different
    // questions about the same array: A40 asks who writes a shared property
    // last, this asks whether anybody reads what was written at all.
    //
    // `Skeleton.updateCache` walks `constraints` in order and each constraint's
    // `sort` pushes itself onto the update cache as it is reached — `sortBone`
    // pushes bones and never a constraint — so the array IS the update order,
    // for every kind. Every constraint then opens its `update` by reading its
    // own applied pose: `Slider.update` takes `mix` and `time` off it before
    // applying its animation, `PhysicsConstraint.update` returns on `mix === 0`
    // before reading `inertia`, `wind` and the rest, and the ik, transform and
    // path constraints read their mixes the same way. So a slider that keys any
    // property of a constraint is read by that constraint only when it comes
    // LATER in the array; written the other way round the value lands in a pose
    // whose only reader has already run, and `Skeleton.updateWorldTransform`
    // opens the next frame by putting `Posed.resetConstrained` over it.
    //
    // [measured, issue #665] One dial and one constraint, in both array orders,
    // read at 6 positions of the dial. The constraint's own pose holds the same
    // ramp in BOTH orders — the write happens either way — and what the
    // constraint drives is dead in one of them:
    //
    //   ik         shin worldY   0.000e+0 against 1.662e+1 the other way round
    //   transform  shin world x-angle 0.000e+0 against 4.000e+1
    //   path       rider worldX  0.000e+0 against 1.620e+2
    //   physics    tip worldX    0.000e+0 against 4.256e+2, over 30 frames, so
    //              the one kind with state of its own is not rescued by it
    //   slider     flag rotate   0.000e+0 against 4.000e+1
    //
    // ⭐ The runtime repairs this for BONES and not for constraints, which is
    // why an author cannot reason it out from the bone case. `Slider.sort`
    // clears `sorted` on every bone its animation keys and re-sorts them, so
    // those bones always update after the slider; for a constraint it calls
    // `skeleton.constrained(constraints[t.constraintIndex])`, which only swaps
    // the pose the constraint will be read through and moves nothing in the
    // update cache.
    //
    // 🔒 Keying its OWN `mix` or `time` is the same failure with the indices
    // equal, and it is the one A37 cannot see: A37 asks whether any animation
    // keys the slider's `mix` and the slider's own animation is one of them, so
    // a slider muted at setup that keys its own `mix` up reports green and is
    // dead forever — `update` returns on `mix === 0` before the animation that
    // would raise it is ever applied. Only a slider can reach that shape: the
    // constraint at the driver's own index IS the driver.
    //
    // ⚠️ `physics` `reset` is NOT in this population, and the measurement is why
    // the card that asked for "every constraint a slider's animation keys" is
    // refused here on one spelling. `PhysicsConstraintResetTimeline` writes no
    // pose at all — `constraint.reset()` sets fields on the constraint object,
    // which `resetConstrained` does not touch — and it fires only when a frame
    // time is CROSSED. A slider applies its animation with `p.time` as both
    // `lastTime` and `time`, so nothing is ever crossed: [measured] 0 calls to
    // `PhysicsConstraint.reset` at 6 dial readings x 4 frames in BOTH array
    // orders, against 1 call when the same animation is applied over a span.
    // Refusing it would name a reorder that repairs nothing, so the SKIP says
    // what was found instead.
    check('A42_DRIVEN_CONSTRAINTS_UPDATE_AFTER_THEIR_DRIVER', () => a42DrivenConstraintsUpdateAfterTheirDriver(verdicts, constraintFacts()));

    // --- A38: a per-skin member list and its `skin: true` flag agree --------
    //
    // 🚨 Two halves of one switch, and either half alone is dead data in silence.
    // `Skeleton.updateCache` (`:191-217`) starts every bone `active` unless it is
    // `skinRequired`, then activates the current skin's `bones` **and their whole
    // ancestor chain**; a constraint is `active` unless `skinRequired`, and then
    // only while `skin.constraints.includes(data)`. So:
    //
    //   * listed without `skin: true` — the object is active under every skin,
    //     and the list changes nothing at all;
    //   * `skin: true` and listed nowhere — the object is inactive under every
    //     skin there is: a bone that never poses, a constraint that never runs.
    //
    // Both load. Both animate. Neither is what the author wrote, and no other
    // check in this file can see either one, because the artifact is internally
    // consistent — it is the PAIRING that is wrong.
    check('A38_SKIN_MEMBERS_ARE_SKIN_REQUIRED', () => a38SkinMembersAreSkinRequired(verdicts, data));

    // --- A09: compiled duration == declared duration (rule 4) --------------
    //
    // The body is `./assertions/bodies/a09.ts` since issue #1025 (cut 4c-3);
    // what it reads off the loaded skeleton is `spineAnimationDurations`.
    check('A09_ANIMATION_DURATION_MATCHES_SPEC', () => a09AnimationDurationMatchesSpec(verdicts, spineAnimationDurations(data), input.declaredDurations));

    // --- A10: step every animation and look for NaN ------------------------
    // The body is `./assertions/bodies/a10.ts` since issue #1025 (cut 4c-5a); what it
    // reads off the loaded skeleton is `spineSteppedPoses` (and the raw JSON's bone
    // timelines, `rawBoneTimelines`). The argument for each clause, as it stood
    // inside the body:
    //
    // Two clauses, and since issue #902 each is read on its own subject. The
    // SETUP POSE is posed from the bones, so it has something to read on any
    // skeleton that carries one; the STEPPED FRAMES are posed once per
    // animation, so a skeleton with none has nothing to step. This used to
    // skip the whole rule on the second fact alone, which was A15's pattern
    // (#580) for a rule whose only clause was the stepping — and #882 gave it
    // the setup clause without moving the skip. Measured on the static probe
    // with a leaf bone at `rotation: 1e309` in its emitted file: `validate`
    // printed this rule as SKIP and the run green under both profiles, and
    // `render` refused the same file by the bone. A static rig's setup pose
    // is the whole of what it shows, so that was the one pose nothing read.
    //
    // ⇒ The multi-clause rule of #580 now governs, the shape A09, A13, A33
    // and A38 carry: the rule SKIPs only when neither clause has anything to
    // measure, the clause that ran decides PASS or FAIL, and the clause that
    // had nothing is named on the stats line (`nanStepping=skipped`, beside
    // `animations=0`) the way A47 names a constraint it did not measure. A
    // PASS row carries no detail, which is why the stats line is where.
    //
    // ⚠️ A09 does not follow, and that is its own name read at its word: a
    // declared duration is a fact about an animation and nothing else, so a
    // static rig still gives it nothing at all.
    //
    // -- the bone's inheritance mode, posed at every `inherit` key ---------
    //
    // 🚨 The one bone timeline whose value is a NAME, and the only one that
    // can pose a NaN with a finite world: `SkeletonJson` resolves a key's mode
    // through `Utils.enumValue`, which folds the first letter's case and
    // nothing else, so `"NOSCALE"` resolves to `undefined` and the timeline's
    // `Float32Array` frame stores NaN. `InheritTimeline.apply` then sets
    // `pose.inherit = NaN`, `updateWorldTransform`'s switch matches no case,
    // and the bone keeps whatever world matrix it had — measured on a forged
    // two-bone chain: at the key the child's `a,b,c,d` equal the setup
    // Normal-mode pose to the last digit while the file says `noScale`. The
    // world position stays finite, so the loop below never saw it (#733).
    //
    // ⚠️ Posed AT each key rather than read off the stepping loop, because a
    // stepped value lives from its key to the next one and a sampling grid
    // can step over a short span entirely. What is judged is whether the
    // posed value IS a mode — which is this assertion's name exactly — and
    // not which mode: for any spelling the lookup resolves, the mode posed
    // is the mode written by construction of the same lookup, so an equality
    // here would be the parser agreeing with itself.
    //
    // -- the whole world transform, at the setup pose and every stepped frame
    //
    // 🚨 Read through `firstNonFinite` (`./nonfinite.ts`) over `posedNumbersOf`,
    // the scan `render` refuses on, and not a second opinion of it (issue #882). This loop read `worldX` and
    // `worldY` alone until then, and a bone at `rotation: 1e309` — in its setup
    // pose or as a `rotate` key — poses a finite position over a NaN `a`, `b`,
    // `c` and `d` whenever it has no child offset from it: measured on every
    // leaf bone of the three generated probes, 20 of 20 green through the whole
    // gate, and `render` then refused the same file by the bone. So the gate
    // said the skeleton was fine and the renderer said it was not, which is two
    // definitions of one word. The scan reads the six terms of every bone, then
    // the vertices of every region and mesh shown — because a bone can be
    // finite over a vertex that is not (a `scaleX` chain whose product stays
    // under the largest double while every corner of the child's region
    // passes it) — and names the bone or the vertex, the term and the frame.
    //
    // ⚠️ The setup pose is its own surface and is read as such: every frame
    // below is posed AFTER `state.apply`, so a bone the animation keys from
    // t=0 never shows its setup value to the loop, and a runtime that shows
    // the rig at rest does show it.
    //
    // 🔸 Posed once, before any animation is set, rather than once per
    // animation as it was until #902: `setAnimation` does not touch the
    // skeleton, so every animation's copy of this pose was the same pose, and
    // the first of them was the only one ever read.
    //
    // The setup half of the inherit-key clause above: a bone's own
    // `inherit` goes through the same lookup, and a miss there loads
    // `undefined` into the setup pose, which every frame copies. Only
    // reachable on a file rigc did not write — `parseRigSpec` refuses the
    // spelling.
    //
    // The other colour a slot poses, and it was outside this loop until
    // issue #690 for the reason every gap here has: nothing emitted one.
    // `null` is the ordinary case — a slot with no `dark` allocates no
    // dark colour at all — and is not a reading to make, so it is
    // skipped rather than treated as zero.
    //
    // The stepping half, and on a static rig there is nothing to step: the
    // setup pose is then the only frame the skeleton has, and the two readings
    // a stepped frame gets are made on it instead, so a colour or an
    // inheritance mode the rig shows at rest is not left to `render`.
    check('A10_NO_NAN_AFTER_STEPPING', () => a10NoNanAfterStepping(verdicts, rawBoneTimelines(raw), spineSteppedPoses(raw, data)));

    // --- A43: the two-colour tint, read back off the runtime ----------------
    //
    // ⭐ **Why this is its own rule and not a clause on `A10`.** A10 steps every
    // animation already and now reads `darkColor` for NaN, which is squarely its
    // own name; what is below is an EQUALITY — the colour in the file against the
    // colour the runtime holds — and a failure of it printed under
    // `A10_NO_NAN_AFTER_STEPPING` would be a verdict whose name contradicts its
    // own detail. The rule this repository applies to a suite's summary figure
    // applies to an assertion's name: it may not say less than what it decides.
    //
    // 🚨 **And the subject is real silence, measured rather than supposed.** Three
    // shapes load with no complaint:
    //
    //   1. A `dark` the parser drops. `SkeletonJson` reads `getValue(slotMap,
    //      "dark", null)` and then `if (dark)`, so `""` is discarded without a
    //      word and the slot renders as though the field had never been written.
    //   2. A `dark` that is not six hex digits. `Color.setFromString` runs
    //      `parseInt` over fixed offsets and stores whatever comes back, so
    //      `"4020"` loads `b = NaN` — a colour that is neither the author's nor
    //      an error.
    //   3. An `rgba2` (or, since issue #730, `rgb2`) timeline on a slot with no
    //      `dark` at all. `Slot`'s
    //      constructor allocates `SlotPose.darkColor` only `if
    //      (data.setupPose.darkColor != null)`, and `RGBA2Timeline.apply1` then
    //      writes `dark.r` unconditionally — so the file parses, and the first
    //      `state.apply` throws `TypeError: null is not an object` in the
    //      consumer's process. `compile.ts` refuses that pairing outright; this
    //      is the same fact held against a skeleton the compiler never saw, and
    //      it is a named failure here rather than A10's `threw:` line, which
    //      names neither the slot nor the timeline.
    //
    // ⚠️ The hex is parsed HERE rather than through `Color.fromString`, and that
    // is the point of the clause: a check that read the required value out of the
    // same parser it is checking would agree with it whatever it did.
    //
    // The body is `./assertions/bodies/a43.ts` since issue #1025 (cut 4c-3);
    // what it reads off the skeleton JSON and the loaded skeleton is
    // `spineTwoColourFacts`.
    check('A43_TWO_COLOR_TINT_LOADS_AND_POSES_AS_WRITTEN', () => a43TwoColorTintLoadsAndPosesAsWritten(verdicts, spineTwoColourFacts(raw, data)));

    // --- A45: the separable colour timelines own their channels ------------
    //
    // The body, and the argument for the rule, are `./assertions/bodies/a45.ts`
    // since issue #1025: the same body runs over the model document. What it
    // reads off spine-core's loaded skeleton is `spineSlotColourFacts`.
    check('A45_SEPARABLE_COLOR_TIMELINES_OWN_THEIR_CHANNELS_AND_POSE_AS_WRITTEN', () => a45SeparableColorTimelinesOwnTheirChannelsAndPoseAsWritten(verdicts, spineSlotColourFacts(raw, data)));

    // --- A44: a linked mesh states no geometry of its own ------------------
    //
    // 🚨 The one shape the parser reads in SILENCE. `readAttachment` returns from
    // the `source` branch at `SkeletonJson.js:586`, before `map.uvs` is touched
    // at all, so `uvs`, `triangles`, `vertices`, `hull` and `edges` written on a
    // link are read by nothing — and `setSourceMesh` then fills the attachment
    // with the SOURCE's arrays. The file says one mesh and every runtime draws
    // another, which is why this is `validity` and not one renderer's policy.
    //
    // ⭐ **It is a separate assertion rather than a clause on A04, and the reason
    // is measurable both ways.** A04 reads the LOADED attachment —
    // `mesh.triangles`, `mesh.worldVerticesLength`, `mesh.vertices` — which on a
    // link are the source's after `setSourceMesh`: measured on a forged link
    // declaring 5 uvs and 3 triangles beside a 4-vertex source, A04 PASSED
    // having read 8 and 2, the source's own. The keys this rule is about are not
    // in the data A04 holds, so the clause would have had to reach for the raw
    // file, and a verdict line reading A04's name would then be naming a
    // measurement of the loaded geometry while deciding about file keys nothing
    // read. The SKIP is the sharper half: A04's subject is mesh attachments, so
    // on a rig with meshes and no link its subject is PRESENT and it passes —
    // there is no verdict left for "this rig has no link to measure", and a
    // clause that cannot report SKIP reports a pass for an absent subject, which
    // this repository already has a judgment about.
    //
    // ⚠️ The subject is the FILE's links and not the loaded ones. A link whose
    // region is missing loads as `null` and is in no skin (`A08` names it), so
    // walking the loaded attachments would let the whole rule vanish on exactly
    // the file that is already wrong.
    //
    // 🔒 Since issue #1025 (cut 4c-2) the roster — which links the file
    // declares, and the SKIP over none — is `./assertions/bodies/a44.ts`'s, and
    // the clause that refuses a link's own geometry stays here
    // (`linkGeometryFinding`): a link record has no geometry field, so the keys
    // exist only in the Spine text.
    check('A44_LINKED_MESH_STATES_NO_GEOMETRY_OF_ITS_OWN', () => a44LinkedMeshStatesNoGeometryOfItsOwn(verdicts, linkFacts()));

    // --- A46: a numbered series shows the frame the file states ------------
    //
    // 🚨 Every way this goes wrong loads without a word (issue #729, measured on
    // spine-core 4.3.13): a `sequence` block with no `count` loads a series of
    // no region; a `setup` past the end is clamped to the last frame; a key's
    // `mode` outside the seven loads as `hold`; an `index` past the end is
    // clamped and a fraction truncated; an advancing mode at an effective delay
    // of 0 never advances; and a `sequence` timeline on an attachment with no
    // block steps a one-region series and shows that region under every mode.
    //
    // ⭐ Two halves, and the second is the one only posing can see. The first
    // reads each of those off the FILE and names the value. The second POSES
    // every key at sampled times — mid-frame, so a float32 key time cannot land
    // a sample on a frame boundary — and compares the region the slot shows
    // against the one the file's own statement gives: the frame the key's mode,
    // index and delay give (`frameOf` in the body), and the frame names
    // `attachmentRegionLookups` derives (the core's `frameRegionName`). Neither is
    // read off the loaded timeline, so the check is not the runtime agreeing
    // with itself.
    //
    // ⚠️ A sample where the slot shows some other attachment is not compared —
    // `applyToSlot` returns there, and a series that is hidden is not a series
    // showing the wrong frame. A timeline with no comparable sample at all is
    // counted in `stats.sequenceSamplesUnshown` rather than failed.
    //
    // The body is `./assertions/bodies/a46.ts` since issue #1025 (cut 4c-3);
    // what it reads off the skeleton JSON and the loaded skeleton is
    // `spineSequenceFacts`, which answers an attachment by its address.
    check('A46_SEQUENCE_ATTACHMENTS_SHOW_THE_FRAME_THE_FILE_STATES', () => a46SequenceAttachmentsShowTheFrameTheFileStates(verdicts, spineSequenceFacts(raw, data)));
  }

  // --- A06 / A17 / A19: the atlas against the PNGs on disk ------------------
  // Case 6h: a `size:` that disagrees with the file loads fine and collapses
  // every UV — rigid stays correct, meshes sample a corner scrap.
  //
  // 🚨 The guard is a SKIP and never a bare `return` (issue #568). A `return`
  // inside `check()` leaves the failure count and the skip count where they
  // were, which is precisely how that function decides an assertion PASSED — so
  // for as long as this line read `if (!atlas) return;` a candidate whose atlas
  // the round trip could not load was reported green by the two rules whose only
  // subject IS the atlas. It was measured on a fixture carrying a page that
  // declares twice the size of its PNG, the exact defect A06 names when the
  // parse succeeds: with a region also removed so the round trip threw, A06
  // printed `PASS`. Everything below reads `atlas.pages`, so a report of "held"
  // here is a report about zero pages.
  //
  // ⚠️ That last sentence was the whole of the next defect (issue #608). The
  // guard caught the atlas that would not PARSE and left the one that parses to
  // NO PAGES, which reaches these four loops as an empty array and walks out of
  // them with the failure and skip counts untouched — a PASS. It stayed
  // invisible only because a zero-page atlas was itself refused by A07, so no
  // green build had ever contained one; making that state legal is exactly what
  // #608 does, so the same state has to stop printing four passes about nothing.
  // `SKIP_NO_ATLAS_PAGE` is one string for all four because it is one condition.
  check('A17_ATLAS_PAGE_FILES_EXIST', () => a17AtlasPageFilesExist(verdicts, { atlas }, input));
  check('A06_ATLAS_PAGE_SIZE_MATCHES_PNG', () => a06AtlasPageSizeMatchesPng(verdicts, { atlas }, input, policy));
  // An overlay part must be able to draw a transparent pixel or it cannot be an
  // overlay: it would paint a solid rectangle over the untouched base, and an
  // overlay formation's whole claim is that the still frame has no seam. The base
  // plate itself is the one page allowed to be opaque: the one the rig names
  // (a cut manifest's part whose window is the crop), or, when the build names
  // none, the region that covers the whole stage.
  //
  // ⭐ Transparency is not the same thing as an alpha CHANNEL, and this assertion
  // used to conflate them (#215). Colour types 4 and 6 store alpha per pixel;
  // types 0, 2 and 3 store it in a `tRNS` chunk instead, and indexed+tRNS is the
  // ordinary output of ImageMagick, Photoshop's PNG-8 export, GIMP's indexed
  // mode, aseprite and pngquant. Judging on the colour type alone refused art
  // that was never broken — seven of one author's nine hand-drawn parts, on their
  // first build — and told them, untruthfully, that the file held no transparency
  // at all. That audit is also why the CLI's default is now `spine`, which does
  // not run this rule at all (#221): a stranger reaches this refusal only by
  // asking for `rig-play`. It still has to be both TRUE and actionable when it
  // fires, and it now has to name the profile it belongs to as well as the one
  // that does not ask — the reader opted in, and the message is where they find
  // out what they opted into.
  check('A19_OVERLAY_PNGS_HAVE_ALPHA', () => a19OverlayPngsHaveAlpha(verdicts, { atlas }, spineStage(skeletonData, input.modelText), { regionAttachments }, input));
  // Two regions on one page whose rectangles overlap and whose footprints do
  // too — a mesh's hull, else the rectangle (issue #1099). The clause A06 held
  // about two rectangles over the same texels, read over what each region
  // draws; the argument and the footprint are `./assertions/bodies/a49.ts` and
  // `./assertions/footprints.ts`. The meshes are the loaded skeleton's, and
  // where it did not load every footprint is the rectangle A06 read.
  check('A49_PACKED_FOOTPRINTS_DO_NOT_OVERLAP', () => a49PackedFootprintsDoNotOverlap(verdicts, { atlas }, spineRegionJoins(input.atlasText, raw), skeletonData === null ? null : loadedMeshFacts()));
  // The stage box a rig asked for (issue #1168): the slot's bounding box,
  // loaded and posed at setup by spine-core, against the stage the document
  // states. The argument and both readings are `./assertions/bodies/a50.ts`.
  check('A50_STAGE_BOX_IS_THE_STAGE', () => (skeletonData === null ? skip('A50_STAGE_BOX_IS_THE_STAGE', SKIP_NO_SKELETON) : a50StageBoxIsTheStage(verdicts, spineStageBox(skeletonData, input.modelText))));

  // -------------------------------------------------------------------------
  // Archetype assertions — the invariants the RIG declares about itself.
  //
  // These need `input.rig`, because skeleton JSON does not record which bone
  // carries the axis, which parentage is forbidden, what the canonical draw
  // order is, or which mesh is a ribbon. Every one of them reads the rig spec's
  // `invariants` block ([`src/rig.ts`](rig.ts)) and every one of them SKIPs when
  // the field it needs is absent — a rig that declares nothing is not thereby
  // certified, it is unmeasured, and the two must never print the same.
  // -------------------------------------------------------------------------
  stats.rig = input.rig ? input.rig.archetype : 'absent';
  stats.profile = profile;

  // --- A24: motion under the axis bone stays in AXIS space -----------------
  //
  // ⭐ The keystone of an articulated cut, and it exists because of a real bug:
  // a generator wrote its travel as screen-space x/y pairs (`x: 30, y: 8` ->
  // `x: -45, y: -12`), so every key had to be re-recorded for a cut framed at a
  // different camera angle — and sibling variants of ONE cut can differ by tens
  // of degrees. Put the direction in the axis bone's setup rotation instead and
  // the keys become translateX along it, reusable across every variant. A
  // screen-space y component on any bone in that subtree therefore means
  // somebody has put the direction back into the keys.
  //
  // The axis bone itself must carry no keys at all: `invariants.axisBone` names
  // a per-cut SETUP value, and animating it swings the whole formation.
  check('A24_AXIS_SPACE_STROKE', () => a24AxisSpaceStroke(verdicts, rawBoneTimelines(raw), input));

  // --- A25: parentage that must never happen -------------------------------
  //
  // ⚠️ Some bones are detached ON PURPOSE. An emitter that releases something
  // into the world must not ride the part that released it, or what it emits
  // gets dragged along with every stroke instead of staying where it left and
  // taking gravity. The rig states each such pair in `invariants.detached`, with
  // the reason it is tempting, because the wrong parentage still loads and still
  // animates — it just lies. That is exactly the class of invariant that belongs
  // in a machine guard rather than in prose.
  check('A25_DETACHED_BONE_PARENTAGE', () => a25DetachedBoneParentage(verdicts, rawSkeletonRoster(raw), input));

  // --- A26: the slots array IS the rig's slot table ------------------------
  //
  // The slots array IS the draw order (z-index = array index), so a formation
  // whose illusion depends on one part occluding another depends on one
  // adjacency in that array — and nothing in the file objects to the wrong
  // order. On a still frame it can even look plausible. The rig's own slot list
  // is the canonical table, and this checks the emitted array against it in
  // both directions: nothing out of order, and nothing missing.
  //
  // ⚠️ The second half is new with issue #575 and the first half is why it had
  // to be. This clause used to accept any SUBSEQUENCE of the table, because the
  // compiler dropped a slot no skin filled and the gate was written around that
  // — so the defect #575 filed was licensed by the assertion that was supposed
  // to catch it: two production exports declaring 53 and 61 slots built green
  // at 51 and 57. `compile` now emits every declared slot, empty if nothing
  // fills it, so a shorter array is a loss and is named as one here. A slot
  // missing from the array moves every slot below it up one index, which is
  // what a `drawOrder` key's offsets are counted against.
  check('A26_SLOT_DRAW_ORDER', () => a26SlotDrawOrder(verdicts, rawSkeletonRoster(raw), input));

  // A27 stood here until issue #1404 retired it. It held a page's only region
  // to the page's file basename, a join no reader makes: spine-core and the
  // player `rig-play` names both take a region off the page record the atlas
  // states it under, and the player draws a region on a page named for
  // something else in both of its modes.

  // --- A28: a ribbon's rows share their weights ----------------------------
  //
  // This is what makes "length without width" a property of the file rather than
  // a hope. Both vertices of a row carry the same bones at the same weights, so
  // whatever the chain does to one it does to the other and their separation can
  // only rotate — the strip curves and stretches, and never gets fatter. Give one
  // side a different weight and the strip develops a taper that grows with its
  // travel, which is the sort of thing that reads as bad art rather than as a bug.
  check('A28_RIBBON_ROWS_SHARE_WEIGHTS', () => a28RibbonRowsShareWeights(verdicts, skeletonData === null ? null : loadedMeshFacts(), input.rig));

  // --- A29: inward travel stops where the two masses meet ------------------
  //
  // 🎯 The rule: inward travel goes at most as far as the point where the moving
  // mass touches the part that occludes it. That distance is MEASURED off the two
  // plates (`tools/measure_contact_depth.ts`) and recorded in the manifest as
  // `stroke.contact_depth`, so the ceiling is a fact about the art rather than a
  // number somebody picked. Drive past it and the frame renders two bodies
  // interpenetrating — and NOTHING in skeleton JSON objects: the animation loads,
  // plays, and is simply wrong. Exactly the shape of silent wrongness this
  // validator exists for.
  //
  // Two things spend the same clearance and so are added together:
  //   * the travel itself, a translateX on a bone in the axis subtree (A24
  //     guarantees there is no hidden screen-space component to miss); and
  //   * the mass bone's own inward keys. `invariants.massBone` typically hangs
  //     outside the axis subtree, so its keys are screen-space by design — they
  //     get projected onto the axis rather than read as axis coordinates.
  //     Ignoring them would let a rig pass while a recoil key closed the last few
  //     pixels of the gap.
  check('A29_STROKE_WITHIN_CONTACT_DEPTH', () => a29StrokeWithinContactDepth(verdicts, rawBoneTimelines(raw), input));

  // --- A30: inward travel stops where the drawn cover runs out -------------
  //
  // 🎯 The second ceiling, and it is NOT a restatement of A29. Contact asks when
  // two masses collide; containment asks when the moving part's leading contour
  // stops being covered by the occluder's opaque footprint. Past that point the
  // part is drawn in a place the art says is hidden — and like every failure in
  // this family it is completely silent: the animation loads, plays, and shows
  // one plate passing through another.
  //
  // A cut can have either ceiling without the other, which is why they are two
  // manifest fields and two assertions. Two plates cut from ONE piece of art are
  // adjacent at rest and never "meet", so that cut has no contact ceiling at all
  // and only a containment one.
  //
  // ⚠️ Second half, and it is what keeps the first half true: the ceiling is
  // measured on the UNDEFORMED contour, by translating the plate along the axis.
  // A scale key on any bone in the axis subtree changes the contour itself, so the
  // measured number stops describing the rig — quietly, because the file still
  // validates. Rather than assert a number that no longer means anything, refuse
  // the deformation. A cut that wants squash under a declared ceiling has to
  // re-measure containment for the scaled contour and say so.
  check('A30_STROKE_WITHIN_CAP_CONTAINMENT', () => a30StrokeWithinCapContainment(verdicts, rawBoneTimelines(raw), input));

  // --- A51: the bones a rig declares to share an axis lie along it ---------
  //
  // ⭐ A `scaleY` key squashes along the bone's own y axis and a `translateY`
  // key moves along it, so on a face painted tilted with its bones at rotation
  // 0 a blink squashes the eye along the page's vertical rather than across the
  // eye line — measured on a seated rig whose eye line is 23.7° off the page,
  // where all five face bones sat at 0 and the closed eyes came out level on a
  // tilted face (issue #1351). The file loads, every other rule passes, and the
  // picture is wrong: the author cannot see it, which is the case this gate is
  // for. The rig declares the line (`invariants.axes`) and the bones held to
  // it; this measures their setup-pose world x axes against it, as A50 poses
  // the setup pose.
  //
  // 🔒 **Validity, not archetype.** It fires only on a declaration, so it
  // cannot fire on foreign data — the reason archetype rules leave the default
  // profile — and a declaration the default profile never read would be one
  // nothing reads. And it holds every declared bone, keyed or not: a consumer
  // writes them at run time (`openTrack({ adjust })`), which no animation shows.
  check('A51_BONES_LIE_ALONG_THEIR_DECLARED_AXIS', () =>
    skeletonData === null ? skip('A51_BONES_LIE_ALONG_THEIR_DECLARED_AXIS', SKIP_NO_SKELETON) : a51BonesLieAlongTheirDeclaredAxis(verdicts, spineSetupWorld(skeletonData), input),
  );

  // --- A18: determinism ----------------------------------------------------
  // The body is `./assertions/bodies/a18.ts` (issue #1060): the model document's clause, which the model side
  // runs too, and the Spine pair's two clauses handed to it as this side's encoding findings, in their order.
  // Same vacuous-pass trap as A09: re-gating artifacts already on disk hands this assertion no second compile.
  check('A18_DETERMINISTIC_EMIT', () => {
    const again = input.reEmit;
    const encoding =
      again === undefined
        ? []
        : [
            ...(again.skeletonText !== input.skeletonText ? ['recompiling produced a different skeleton.json'] : []),
            ...(again.atlasText !== input.atlasText ? ['recompiling produced a different skeleton.atlas'] : []),
          ];
    a18DeterministicEmit(verdicts, { again: again !== undefined, encoding, first: input.modelText, second: again?.modelText ?? '' });
  });

  // --- every assertion leaves a row ----------------------------------------
  //
  // 🔒 **A missing row is the vacuous pass one level up** (issue #568). Twenty
  // assertions live inside `if (skeletonData) {` above, so a round trip that
  // throws does not skip them — it never reaches them, and they appear in none
  // of the four lists. Measured on a fixture whose atlas was missing a region
  // the skeleton names: 13 of 42 printed a verdict, 9 more printed `PROF`, and
  // 20 printed nothing at all. The run exits 1 and the reader is right to fix
  // A00 first, which is exactly why the silence survives — nobody counts the
  // rows on a red run. A report that names 22 of 42 and says nothing about the
  // rest is telling a reader that those rules are fine, in the only way a
  // report can: by not mentioning them.
  //
  // ⚠️ The sweep DERIVES its list rather than keeping one, because a hand-kept
  // roster of "assertions behind the round trip" is a second place to update
  // and would be wrong the first time somebody moved a `check` call. Anything
  // `ASSERTION_NAMES` knows that reached here with no row did not run, and what
  // it is honest to say about it is decided by the state:
  //
  //   * the profile does not carry that kind of rule — `PROF`, the same verdict
  //     `check()`'s own guard would have recorded had the call been reached;
  //   * the round trip produced nothing — `SKIP`, naming that;
  //   * anything else — a FAIL, **by name**. An assertion that vanished while
  //     the skeleton was loaded is a defect in this file, and inventing a SKIP
  //     for it would be the same silence one ring further out. The one state
  //     the sweep is allowed to explain is the one it can prove.
  const reported = new Set<string>([
    ...passed,
    ...failures.map((f) => f.assertion),
    ...skipped.map((s) => s.assertion),
    ...profileSkipped.map((p) => p.assertion),
  ]);
  for (const name of ASSERTION_NAMES) {
    if (reported.has(name)) continue;
    const kind = ASSERTION_KIND[name];
    if (kind !== 'validity' && !kindRunsUnder(kind, profile)) profileSkipped.push({ assertion: name, kind });
    else if (!roundTrip) skip(name, SKIP_NO_SKELETON);
    else {
      fail(
        name,
        'the assertion left no row: its body was never reached, and the round trip that would explain that ' +
          'succeeded. A guard above returned before the call — find it and make it a SKIP naming what was absent',
      );
    }
  }

  return { failures, passed, skipped, profileSkipped, profile, stats };
}

/**
 * Decode a weighted mesh's `vertices` run into per-vertex (boneIndex, weight).
 *
 * The encoding carries no marker at all — weighted versus unweighted is decided
 * by a length comparison — so every assertion that talks
 * about weights has to walk the run itself.
 */
function meshWeightsOf(mesh: MeshAttachment): Array<Array<{ bone: number; weight: number }>> {
  const out: Array<Array<{ bone: number; weight: number }>> = [];
  if (!mesh.bones) return out;
  let bi = 0;
  let vi = 0;
  while (bi < mesh.bones.length) {
    const boneCount = mesh.bones[bi++];
    const vertex: Array<{ bone: number; weight: number }> = [];
    for (let n = 0; n < boneCount; n++, bi++, vi += 3) {
      vertex.push({ bone: mesh.bones[bi], weight: mesh.vertices[vi + 2] });
    }
    out.push(vertex);
  }
  return out;
}

export function atlasDirOf(atlasPath: string): string {
  return dirname(resolve(atlasPath));
}

// ---------------------------------------------------------------------------
// skeletonValues — the round trip read as VALUES rather than as assertions
// ---------------------------------------------------------------------------

/**
 * One value the parser read out of a skeleton file, at a path that names it.
 *
 * `bones/hip/setup/rotation`, `skins/default/head/head/regionUVs/12`,
 * `animations/walk/RotateTimeline/bone:hip/key/3/v1`. Numbers stay numbers so
 * that a comparison can state a tolerance; everything else — a blend mode the
 * runtime holds as an enum, an attachment name, a boolean, an absent object —
 * is a string, and is compared exactly.
 */
export interface SkeletonValue {
  /** Stable, name-keyed, and never an index into an emitted array (issue #45). */
  path: string;
  value: number | string;
}

/**
 * Keys the walk below does not read, each with the reason it is not a value the
 * file carries. It is a SKIP list rather than an include list on purpose: the
 * field names come from the parser, so a field spine-core starts reading is
 * compared the day it starts reading it, and the only hand-kept part is the
 * short list of things that are demonstrably not in the file.
 *
 * ⚠️ `id` is the sharp one. `VertexAttachment.id` is a process-wide counter, so
 * two parses in one process disagree about it by construction — and it reaches
 * `DeformTimeline.getPropertyIds()`, which is why the timeline key below is
 * built from the resolved owner rather than from the property ids.
 */
const NOT_A_VALUE_IN_THE_FILE: Record<string, string> = {
  a: 'the derived world matrix',
  b: 'the derived world matrix',
  c: 'the derived world matrix',
  d: 'the derived world matrix',
  world: 'derived by the runtime',
  local: 'derived by the runtime',
  worldX: 'derived by the runtime',
  worldY: 'derived by the runtime',
  region: 'the atlas, which is not the skeleton',
  regions: 'the atlas, which is not the skeleton',
  uvs: 'computed from the region',
  offsets: 'computed from the region',
  tempColor: 'runtime scratch',
  deform: 'runtime scratch on the setup pose',
  id: 'a process-wide counter, not a value in the file',
  index: 'the array position this walk already iterates by name',
  timelineIds: 'derived from the timelines',
  timelineSlots: 'derived from the skin',
  propertyIds: 'carries an attachment id, which is a counter (see above)',
};

/**
 * The keys above that ARE a value the file carries on these owners, by the
 * owner's class name (issue #1084).
 *
 * The skip list is keyed by field name alone, and four of its names are also
 * the name of a field the parser reads off the file on a different class. Each
 * owner below was found by walking the parsed form of the twelve editor exports
 * and the seven gallery builds for every class carrying a key the list names,
 * and each field was planted and posed before it was let back in:
 *
 * - `a`, `b` — a `Color`'s alpha and blue channels, which share their names with
 *   two entries of a bone's world matrix. Every slot colour, dark colour, bone
 *   colour and attachment colour lost half its channels to that: a slot's alpha
 *   `ff` → `80` moved no value at all, and posed, it changes every slot row.
 * - `local` — a slider's `local` flag, which shares its name with a bone pose's
 *   derived `local`. Flipped on `gallery/look`'s `yaw`, it moves the posed bones.
 * - `offsets` — a transform constraint's six offsets (`rotation`, `x`, `y`,
 *   `scaleX`, `scaleY`, `shearY` in the file), which share their name with a
 *   sequence's region offsets. A `y` offset moved on `6-arcs-pro`'s `tail`
 *   moved no value and moves the posed bones.
 *
 * A fifth entry, `properties` (*derived from the constraint*), is gone rather
 * than excepted: the one class measured carrying it is the transform constraint,
 * where it is the file's from/to map, so the reason was not true of anything.
 *
 * ⚠️ An exception rather than a rewrite of the list: the list's design — a
 * field the parser starts reading is compared the day it starts — is right,
 * and what was wrong was that a name stood for every class carrying it.
 */
const VALUE_ON_THESE_OWNERS: Record<string, readonly string[]> = {
  a: ['Color'],
  b: ['Color'],
  local: ['SliderData'],
  offsets: ['TransformConstraintData'],
};

/** Whether the walk leaves `key` out on an object of class `owner`. */
function notAValue(owner: string, key: string): boolean {
  return key in NOT_A_VALUE_IN_THE_FILE && !(VALUE_ON_THESE_OWNERS[key] ?? []).includes(owner);
}

/**
 * The class an object was parsed into when that class is one of several sharing
 * a shape — it extends another class — or `null`.
 *
 * Reflection reads fields, and two classes with the same fields are the same
 * object to it: a slider reading `rotate` holds a `FromRotate` and one reading
 * `x` a `FromX`, both `{ offset, to }`, so moving a slider to another property
 * moved no value (issue #1084). Measured over the parsed corpus, the only
 * unnamed objects the walk expands whose class extends another are the
 * transform and slider property classes (`From*`, `To*`); a pose, a colour and a
 * sequence are classes of their own, so this adds nothing under them.
 */
function sharedShapeKind(obj: object): string | null {
  const proto = Object.getPrototypeOf(obj) as object | null;
  if (proto === null || proto === Object.prototype) return null;
  const parent = Object.getPrototypeOf(proto) as object | null;
  if (parent === null || parent === Object.prototype) return null;
  return (obj.constructor as { name?: string } | undefined)?.name ?? null;
}

/** How deep a chain of unnamed objects may go before the walk says so and stops. */
const VALUE_WALK_DEPTH = 10;

/**
 * Reflection over the parsed form: numbers and strings as they are, arrays by
 * index, objects by their own keys in **sorted** order, and any nested object
 * that carries a `name` by that name rather than by expansion — which is what
 * makes a cross-reference (`parent`, `boneData`, `endSlot`, a constraint's
 * `bones`) a name and terminates every cycle the runtime's back-references
 * would otherwise walk forever.
 *
 * Sorted rather than insertion-ordered because `A18_DETERMINISTIC_EMIT`'s rule
 * applies here too: nothing whose order is the runtime's business may decide
 * what this function emits.
 */
function pushValue(value: unknown, path: string, out: SkeletonValue[], depth: number): void {
  if (value === null || value === undefined) {
    out.push({ path, value: '(none)' });
    return;
  }
  if (typeof value === 'number' || typeof value === 'string') {
    out.push({ path, value });
    return;
  }
  if (typeof value === 'boolean') {
    out.push({ path, value: value ? 'true' : 'false' });
    return;
  }
  if (typeof value === 'function') return;
  if (ArrayBuffer.isView(value) || Array.isArray(value)) {
    const list = value as ArrayLike<unknown>;
    // A list whose every entry is an unnamed object of its own shared-shape
    // class — a transform's `properties` and each one's `to` — is keyed by those
    // classes rather than by position: the file writes them as an object keyed
    // by property name, any writer may key it in its own order, and the
    // parser's list follows that order. By position, the same map written
    // backwards would read as every property moved (issue #1084).
    const kinds: string[] = [];
    for (let i = 0; i < list.length; i++) {
      const entry = list[i];
      const kind =
        typeof entry === 'object' && entry !== null && typeof (entry as Record<string, unknown>).name !== 'string'
          ? sharedShapeKind(entry)
          : null;
      if (kind === null || kinds.includes(kind)) break;
      kinds.push(kind);
    }
    const byKind = list.length > 0 && kinds.length === list.length;
    for (let i = 0; i < list.length; i++) pushValue(list[i], `${path}/${byKind ? kinds[i] : i}`, out, depth + 1);
    return;
  }
  if (typeof value !== 'object') return;
  const obj = value as Record<string, unknown>;
  if (depth > 0 && typeof obj.name === 'string') {
    out.push({ path, value: obj.name });
    return;
  }
  if (depth > VALUE_WALK_DEPTH) {
    out.push({ path, value: '(deeper than the walk goes)' });
    return;
  }
  const owner = (obj.constructor as { name?: string } | undefined)?.name ?? '';
  // The class, where it is the one thing the fields cannot say — see `sharedShapeKind`.
  const kind = depth > 0 ? sharedShapeKind(obj) : null;
  if (kind !== null) out.push({ path: `${path}/kind`, value: kind });
  for (const key of Object.keys(obj).sort()) {
    if (notAValue(owner, key)) continue;
    pushValue(obj[key], `${path}/${key}`, out, depth + 1);
  }
}

/**
 * Which timeline this is, in words that both sides of a comparison can reach.
 *
 * The class name and the OWNER'S NAME — never the property ids, which carry
 * array indices and, for a deform timeline, a counter. A rig that reorders its
 * bones is a structural finding `diff` already makes; it must not also arrive
 * here as a timeline nobody can pair.
 */
function timelineKey(timeline: Timeline, data: ReturnType<SkeletonJson['readSkeletonData']>): string {
  const kind = timeline.constructor?.name ?? 'Timeline';
  const asBone = timeline as Timeline & Partial<{ boneIndex: number }>;
  if (isBoneTimeline(asBone)) return `${kind}/bone:${data.bones[asBone.boneIndex]?.name ?? `#${asBone.boneIndex}`}`;
  const asSlot = timeline as Timeline & Partial<{ slotIndex: number }>;
  if (isSlotTimeline(asSlot)) {
    const slot = data.slots[asSlot.slotIndex]?.name ?? `#${asSlot.slotIndex}`;
    const attachment = (timeline as Timeline & Partial<{ attachment: { name: string } }>).attachment;
    return `${kind}/slot:${slot}${attachment === undefined ? '' : `:${attachment.name}`}`;
  }
  const asConstraint = timeline as Timeline & Partial<{ constraintIndex: number }>;
  if (isConstraintTimeline(asConstraint)) {
    return `${kind}/constraint:${data.constraints[asConstraint.constraintIndex]?.name ?? `#${asConstraint.constraintIndex}`}`;
  }
  return `${kind}/skeleton`;
}

/**
 * Every value a skeleton file carries, as the **parser** understands it.
 *
 * ## Why this is here and not in `diff.ts`
 *
 * `diff` compares structure over raw JSON and says so in its own header:
 * *"Pure JSON reading — no spine-core, no filesystem."* Comparing the values
 * inside that structure needs the format's per-field defaults — `time` absent
 * is 0, `scaleX` absent is 1, a physics key's `value` absent is 0 but its `mix`
 * is 1 — and a second spelling of those inside the gate is exactly what this
 * repository refuses (CLAUDE.md, *The compiler never invents a value*). So the
 * defaults are taken from the one reader that owns them, which means the
 * runtime, which means this file: `CLAUDE.md`'s *Conventions* names the three
 * modules allowed to link spine-core and `src/validate.ts` is the one that
 * "owns the round trip". `src/bonedist.ts` is the precedent for the other half
 * — an instrument that needs the runtime and reaches it through `render.ts`
 * rather than linking it itself. `diff.ts` compares what this returns.
 *
 * ## What it covers
 *
 * Everything on `SkeletonData` that is not on the skip list above: the header
 * and stage, every bone's setup pose and `length`, every slot's colours, blend
 * and setup attachment, every attachment in every skin (a region's offsets,
 * rotation, scale and size; a mesh's vertices, weights, `regionUVs`,
 * triangles, hull and edges; a bounding box's, path's and clipping shape's
 * vertices), every constraint's pose, flags and modes — a transform's offsets
 * and its property map, each entry by its class, and a slider's property by its
 * class (issue #1084) — every event's payload, and for
 * every timeline every frame — time and values, from the runtime's own
 * `getFrameEntries()` — its curve type and Bezier samples, and its deform
 * vertices, attachment names, draw orders and event payloads.
 *
 * ## What it does not
 *
 * - **`version` and `hash`.** The rig spec has no field for either; `ingest`
 *   reports them as `HEADER_REDERIVED` and `HEADER_BOOKKEEPING` findings, and
 *   a rebuild restating the runtime rigc links is the whole reason the corpus
 *   gate is `diff` at 1.000 rather than a byte comparison (`docs/INGEST.md`
 *   §2.3). They are named here so that skipping them is a decision a reader
 *   can see rather than an omission.
 * - **Anything below one float32 step.** `spine-core` stores frames, curves and
 *   vertices in `Float32Array`, so two values that round to the same float32
 *   are equal to this walk whatever the file says. The comparison's tolerance
 *   states that bound rather than hiding it.
 * - **A Bezier's control points as such.** The parser samples them into
 *   `curves` (`setBezier`), so what is compared is the sampled curve; a moved
 *   handle moves the samples, but by a different amount than it moved the
 *   handle.
 */
export function skeletonValues(skeletonText: string, atlasText: string): SkeletonValue[] {
  const data = new SkeletonJson(new AtlasAttachmentLoader(new TextureAtlas(atlasText))).readSkeletonData(
    JSON.parse(skeletonText),
  );
  const out: SkeletonValue[] = [];
  const header = data as unknown as Record<string, unknown>;
  for (const field of ['x', 'y', 'width', 'height', 'referenceScale', 'fps', 'imagesPath', 'audioPath', 'name']) {
    pushValue(header[field], `skeleton/${field}`, out, 1);
  }
  for (const bone of data.bones) {
    const at = `bones/${bone.name}`;
    const rec = bone as unknown as Record<string, unknown>;
    for (const key of Object.keys(rec).sort()) {
      if (notAValue('BoneData', key) || key === 'name') continue;
      pushValue(rec[key], `${at}/${key === 'setupPose' ? 'setup' : key}`, out, 1);
    }
  }
  for (const slot of data.slots) {
    const at = `slots/${slot.name}`;
    const rec = slot as unknown as Record<string, unknown>;
    for (const key of Object.keys(rec).sort()) {
      if (notAValue('SlotData', key) || key === 'name') continue;
      pushValue(rec[key], `${at}/${key === 'setupPose' ? 'setup' : key}`, out, 1);
    }
  }
  for (const skin of data.skins) {
    const at = `skins/${skin.name}`;
    pushValue(skin.color, `${at}/color`, out, 1);
    pushValue(skin.bones, `${at}/bones`, out, 1);
    pushValue(skin.constraints, `${at}/constraints`, out, 1);
    for (const [slotIndex, held] of skin.attachments.entries()) {
      if (held === undefined || held === null) continue;
      const slot = data.slots[slotIndex]?.name ?? `#${slotIndex}`;
      const byName = held as unknown as Record<string, unknown>;
      for (const placeholder of Object.keys(byName).sort()) {
        const attachment = byName[placeholder] as Record<string, unknown>;
        const where = `${at}/${slot}/${placeholder}`;
        // The attachment's TYPE, which is the one thing reflection cannot see:
        // a region and a mesh differ in their fields, and a walk that only read
        // the fields would call a swap a pile of unpaired paths rather than a
        // kind that changed.
        pushValue(attachment.constructor?.name ?? '(unknown)', `${where}/kind`, out, 1);
        pushValue(attachment, where, out, 0);
      }
    }
  }
  for (const constraint of data.constraints) {
    // The KIND is part of the path, not just a value under it (issue #692):
    // `leg` may be an ik constraint and a transform constraint at once, and a
    // path keyed on the name alone pairs the first of one file with the second
    // of the other. Measured on the export that made the card: a rebuild
    // carrying both, correctly, reported `values.constraints` 197/199 with
    // `constraints/<name>/kind "IkConstraintData" vs "TransformConstraintData"`
    // as the difference — the comparison contradicting itself rather than the
    // file. The class name is the same string `/kind` already carries, so the
    // two sides pair wherever they agree about what the constraint is.
    const at = `constraints/${constraint.constructor?.name ?? '(unknown)'}:${constraint.name}`;
    pushValue(constraint.constructor?.name ?? '(unknown)', `${at}/kind`, out, 1);
    pushValue(constraint, at, out, 0);
  }
  for (const event of data.events) pushValue(event, `events/${event.name}`, out, 0);
  for (const animation of data.animations) {
    const at = `animations/${animation.name}`;
    pushValue(animation.duration, `${at}/duration`, out, 1);
    // Timelines are grouped by their key and numbered within the group, so that
    // two timelines a runtime distinguishes by object identity — one deform per
    // skin over the same slot and attachment — still pair up in file order
    // rather than colliding on one path.
    const grouped = new Map<string, Timeline[]>();
    for (const timeline of animation.timelines) {
      const key = timelineKey(timeline, data);
      const held = grouped.get(key);
      if (held === undefined) grouped.set(key, [timeline]);
      else held.push(timeline);
    }
    for (const key of [...grouped.keys()].sort()) {
      const group = grouped.get(key) ?? [];
      for (const [n, timeline] of group.entries()) {
        const where = `${at}/${key}${group.length > 1 ? `#${n}` : ''}`;
        // The frames, split into time and values by the runtime's own count of
        // entries per frame rather than by a table of what each timeline kind
        // keys. Entry 0 is the time for every timeline spine-core defines.
        const entries = timeline.getFrameEntries();
        for (let i = 0; i < timeline.frames.length; i++) {
          const slot = i % entries;
          pushValue(timeline.frames[i], `${where}/key/${Math.floor(i / entries)}/${slot === 0 ? 'time' : `v${slot}`}`, out, 1);
        }
        const rec = timeline as unknown as Record<string, unknown>;
        for (const field of Object.keys(rec).sort()) {
          if (notAValue(timeline.constructor?.name ?? '', field) || field === 'frames') continue;
          // The owner is in the path already; comparing the index as well would
          // report one reordering twice, in a measure that is not about order.
          if (field === 'boneIndex' || field === 'slotIndex' || field === 'constraintIndex') continue;
          pushValue(rec[field], `${where}/${field}`, out, 1);
        }
      }
    }
  }
  return out;
}
