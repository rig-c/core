/**
 * The model side of the validator (issue #1025, step 4c of #380): the
 * assertions that moved out of `src/validate.ts`, run over the model document
 * and rigc's core instead of over what spine-core loaded.
 *
 * ⭐ **One body, two suppliers.** Every moved assertion is one function under
 * `../bodies/`, written against a fact interface under `../facts/`.
 * `validate()` supplies the facts from spine-core's loaded objects and calls
 * the body inside its own `check`; this entry supplies them from the document
 * (`./parse.ts`, `./skin_entries.ts`, `./atlas_pages.ts`, `./slot_colour.ts`;
 * cut 4c-2's `./mesh_attachments.ts`, `./vertex_polygons.ts`,
 * `./linked_meshes.ts`, `./constraints.ts`; cut 4c-4's
 * `./skeleton_roster.ts`, `./bone_timelines.ts`, `./event_keys.ts`; cut
 * 4c-3's `./deform_survey.ts`, `./animation_durations.ts`, `./two_colour.ts`,
 * `./sequences.ts`; cut 4c-5's `./slider_composition.ts`,
 * `./constraint_targets.ts`; cut 4c-5a's `./stepped_poses.ts`)
 * and calls the same body inside the same harness (`../harness.ts`). The
 * selftest holds the two to the same lines on every call it makes with a
 * model in hand, and `tools/verdict_gate.ts` on every recipe.
 *
 * 🔸 **What the entry is given.** The document's text, the directory its
 * pages resolve against, and the profile — and nothing read off a Spine file:
 * a model-side verdict that read `skeleton.json` would be a second reading of
 * the encoding, which is the round trip's subject and not the rig's. In
 * `given`, the two values a `rigc-compiled/2` or `/1` document does not hold —
 * the stage and each page's `pma` (`./given.ts`); a `/3` document states both
 * (issue #1026) and is read for them, and `given` beside one is refused by
 * name. The rig info and the declared durations are the document's on every
 * spec (issue #1054, `./declared.ts`): cuts 4c-1 to 4c-3 took them from the
 * caller, as `validate()` does, and the verdict moved with what the caller
 * handed over — now either one given beside the document is refused by name.
 *
 * ⛔ **Not wired into any command.** `build` keeps the round trip and its
 * fifty lines; this entry is what the selftest and the instrument call
 * until every moved assertion is on it (the card's design, point 7).
 *
 * Links nothing from the runtime, directly or through what it imports — held
 * by the selftest's `VF` controls.
 */
import { ASSERTION_KIND, resolveProfile, type AssertionProfile } from '../kinds.ts';
import { verdictHarness, type VerdictHarness, type Verdicts, type VerdictLists } from '../harness.ts';
import { SKIP_NO_ATLAS, SKIP_NO_MODEL } from '../reasons.ts';
import { a03RegionWidthHeightFinite } from '../bodies/a03.ts';
import { a17AtlasPageFilesExist } from '../bodies/a17.ts';
import { a45SeparableColorTimelinesOwnTheirChannelsAndPoseAsWritten } from '../bodies/a45.ts';
import { A00_MODEL_READ, A00_MODEL_REGIONS_ON_PAGES, MODEL_PARSE_KIND, modelRead, modelRegionsOnPages, SKIP_NO_MODEL_DOCUMENT, SKIP_NO_MODEL_PAGES, type ReadDocument } from './parse.ts';
import { fileOrderedEntries, modelSkinEntries } from './skin_entries.ts';
import { modelAtlasPages } from './atlas_pages.ts';
import { modelSlotColour } from './slot_colour.ts';
import type { SkinEntryFacts } from '../facts/skin_entries.ts';
import type { AtlasPageFacts } from '../facts/atlas_pages.ts';
import type { SlotColourFacts } from '../facts/slot_colour.ts';
import type { RigInfo } from '../../types.ts';
import type { ModelGiven } from './given.ts';
import { modelDeclaredDurations, modelRigInfo, refuseDeclaredBeside } from './declared.ts';
import { a08RegionNamesMatchAttachments } from '../bodies/a08.ts';
import { a13MeshBudget } from '../bodies/a13.ts';
import { a14NoFullFrameMesh } from '../bodies/a14.ts';
import { a15IdleNoMeshBoneKeys } from '../bodies/a15.ts';
import { a22MeshUvsInUnitRange } from '../bodies/a22.ts';
import { a38SkinMembersAreSkinRequired } from '../bodies/a38.ts';
import { a06AtlasPageSizeMatchesPng } from '../bodies/a06.ts';
import { a19OverlayPngsHaveAlpha } from '../bodies/a19.ts';
import { a49PackedFootprintsDoNotOverlap } from '../bodies/a49.ts';
import { a50StageBoxIsTheStage } from '../bodies/a50.ts';
import { a51BonesLieAlongTheirDeclaredAxis } from '../bodies/a51.ts';
import { modelSetupWorld } from './setup_world.ts';
import type { SetupWorldFacts } from '../facts/setup_world.ts';
import { modelStageBox } from './stage_box.ts';
import type { StageBoxFacts } from '../facts/stage_box.ts';
import { modelAnimatedBones } from './animated_bones.ts';
import { modelSkinMembers } from './skin_members.ts';
import { modelRegionJoins } from './region_joins.ts';
import { modelAtlasRegions } from './atlas_regions.ts';
import { modelStage } from './stage.ts';
import type { AnimatedBoneFacts } from '../facts/animated_bones.ts';
import type { SkinMemberFacts } from '../facts/skin_members.ts';
import type { RegionJoinFacts } from '../facts/region_joins.ts';
import type { AtlasRegionFacts } from '../facts/atlas_regions.ts';
import type { StageFacts } from '../facts/stage.ts';
import { a04MeshTrianglesAndEncoding } from '../bodies/a04.ts';
import { a20MeshWeightsCoherent } from '../bodies/a20.ts';
import { a21MeshRimPinned } from '../bodies/a21.ts';
import { a23PhysicsConstraintEffective } from '../bodies/a23.ts';
import { a28RibbonRowsShareWeights } from '../bodies/a28.ts';
import { a33VertexAttachmentGeometry } from '../bodies/a33.ts';
import { a36PathConstraintEffective } from '../bodies/a36.ts';
import { a37SliderConstraintEffective } from '../bodies/a37.ts';
import { a42DrivenConstraintsUpdateAfterTheirDriver } from '../bodies/a42.ts';
import { a44LinkedMeshStatesNoGeometryOfItsOwn } from '../bodies/a44.ts';
import { a47IkConstraintNotMutedThroughout } from '../bodies/a47.ts';
import { a48TransformConstraintNotMutedThroughout } from '../bodies/a48.ts';
import { modelMeshFacts } from './mesh_attachments.ts';
import { modelPolygonFacts } from './vertex_polygons.ts';
import { modelLinkFacts } from './linked_meshes.ts';
import { modelConstraintFacts } from './constraints.ts';
import type { MeshFacts } from '../facts/mesh_attachments.ts';
import type { PolygonFacts } from '../facts/vertex_polygons.ts';
import type { LinkFacts } from '../facts/linked_meshes.ts';
import type { ConstraintFacts } from '../facts/constraints.ts';
import { a12NoDarkColor } from '../bodies/a12.ts';
import { a24AxisSpaceStroke } from '../bodies/a24.ts';
import { a25DetachedBoneParentage } from '../bodies/a25.ts';
import { a26SlotDrawOrder } from '../bodies/a26.ts';
import { a29StrokeWithinContactDepth } from '../bodies/a29.ts';
import { a30StrokeWithinCapContainment } from '../bodies/a30.ts';
import { a32EventKeysResolve } from '../bodies/a32.ts';
import { modelSkeletonRoster } from './skeleton_roster.ts';
import { modelBoneTimelines } from './bone_timelines.ts';
import { modelEventKeys } from './event_keys.ts';
import type { SkeletonRosterFacts } from '../facts/skeleton_roster.ts';
import type { BoneTimelineFacts } from '../facts/bone_timelines.ts';
import type { EventKeyFacts } from '../facts/event_keys.ts';
import { a39DeformKeepsTriangleWinding } from '../bodies/a39.ts';
import { a09AnimationDurationMatchesSpec } from '../bodies/a09.ts';
import { a43TwoColorTintLoadsAndPosesAsWritten } from '../bodies/a43.ts';
import { a46SequenceAttachmentsShowTheFrameTheFileStates } from '../bodies/a46.ts';
import { modelDeformSurvey } from './deform_survey.ts';
import { modelAnimationDurations } from './animation_durations.ts';
import { modelTwoColour } from './two_colour.ts';
import { modelSequences } from './sequences.ts';
import type { DeformSurveyFacts } from '../facts/deform_survey.ts';
import type { AnimationDurationFacts } from '../facts/animation_durations.ts';
import type { TwoColourFacts } from '../facts/two_colour.ts';
import type { SequenceFacts } from '../facts/sequences.ts';
import { a40SlidersComposeOnASharedTarget } from '../bodies/a40.ts';
import { modelSliderComposition } from './slider_composition.ts';
import type { SliderCompositionFacts } from '../facts/slider_composition.ts';
import { a34ConstraintTimelineTargets } from '../bodies/a34.ts';
import { modelConstraintTargets } from './constraint_targets.ts';
import type { ConstraintTargetFacts } from '../facts/constraint_targets.ts';
import { a10NoNanAfterStepping } from '../bodies/a10.ts';
import { modelSteppedPoses } from './stepped_poses.ts';
import type { SteppedPoseFacts } from '../facts/stepped_poses.ts';

/** What the model side is given. */
export interface ModelValidateInput {
  /** The document `build` writes beside the Spine pair (`skeleton.model.json`). */
  modelText: string;
  /** The directory the document's page names resolve against — the build's `--out`. */
  atlasDir: string;
  profile: AssertionProfile;
  /**
   * Refused (issue #1054): every document states the rig info in its `rig`
   * section, and the model side reads it there (`./declared.ts`). A caller
   * that gives it anyway is a second source for one fact, and each rule that
   * reads the declarations refuses the call by name rather than reading
   * either. Kept on the type so a caller still handing it over is named, not
   * silently ignored.
   */
  rig?: RigInfo;
  /**
   * The stage and the pages' `pma`, for a `rigc-compiled/2` or `/1` document,
   * which does not hold them (`./given.ts`). A06, A14 and A19 read them; a
   * caller that gives none there has those three refuse by name rather than
   * read a value nobody stated. A `/3` document states both (issue #1026), and
   * `given` beside it is refused by name.
   */
  given?: ModelGiven;
  /** Refused, as `rig` is (issue #1054): every document states each animation's declared duration, and A09 reads them there. */
  declaredDurations?: Record<string, number>;
}

/** The model side's report: `validate()`'s shape, over the moved assertions and the two parse rules. */
export interface ModelReport extends VerdictLists {
  profile: AssertionProfile;
}

/**
 * The fact families, composed: one supplier per family under `./`, each a
 * function of the read document. A body names the family it reads, so a later
 * cut that moves an assertion over an existing family adds a body file and a
 * row below, and one over a new family adds a facts file, a supplier file and
 * a field here.
 */
export interface ModelSupply {
  skinEntries: (read: ReadDocument) => SkinEntryFacts;
  atlasPages: (read: ReadDocument) => AtlasPageFacts;
  slotColour: (read: ReadDocument) => SlotColourFacts;
  animatedBones: (read: ReadDocument) => AnimatedBoneFacts;
  skinMembers: (read: ReadDocument) => SkinMemberFacts;
  regionJoins: (read: ReadDocument) => RegionJoinFacts;
  atlasRegions: (read: ReadDocument, input: ModelValidateInput) => AtlasRegionFacts;
  stage: (read: ReadDocument, input: ModelValidateInput) => StageFacts;
  meshes: (read: ReadDocument) => MeshFacts;
  polygons: (read: ReadDocument) => PolygonFacts;
  links: (read: ReadDocument) => LinkFacts;
  constraints: (read: ReadDocument) => ConstraintFacts;
  skeletonRoster: (read: ReadDocument) => SkeletonRosterFacts;
  boneTimelines: (read: ReadDocument) => BoneTimelineFacts;
  eventKeys: (read: ReadDocument) => EventKeyFacts;
  deformSurvey: (read: ReadDocument) => DeformSurveyFacts;
  animationDurations: (read: ReadDocument) => AnimationDurationFacts;
  twoColour: (read: ReadDocument) => TwoColourFacts;
  sequences: (read: ReadDocument) => SequenceFacts;
  sliderComposition: (read: ReadDocument) => SliderCompositionFacts;
  constraintTargets: (read: ReadDocument) => ConstraintTargetFacts;
  steppedPoses: (read: ReadDocument) => SteppedPoseFacts;
  /** The stage box the document asks for and what its default skin holds there (issue #1168, `./stage_box.ts`). */
  stageBox: (read: ReadDocument) => StageBoxFacts;
  /** Each bone's world frame at the setup pose, A50's pose (issue #1351, `./setup_world.ts`). */
  setupWorld: (read: ReadDocument) => SetupWorldFacts;
  /** The rig info the document declares (issue #1054, `./declared.ts`); a caller's `rig` beside it is refused by name. */
  rigInfo: (read: ReadDocument, input: ModelValidateInput) => RigInfo;
  /** Each animation's declared duration as the document states it (issue #1054); a caller's `declaredDurations` beside it is refused by name. */
  declaredDurations: (read: ReadDocument, input: ModelValidateInput) => Record<string, number>;
}

/** The suppliers the model side runs on. */
export const MODEL_SUPPLY: ModelSupply = {
  skinEntries: modelSkinEntries,
  atlasPages: modelAtlasPages,
  slotColour: modelSlotColour,
  animatedBones: modelAnimatedBones,
  skinMembers: modelSkinMembers,
  regionJoins: modelRegionJoins,
  atlasRegions: (read, input) => modelAtlasRegions(read, input.given),
  stage: (read, input) => modelStage(read, input.given),
  meshes: modelMeshFacts,
  polygons: modelPolygonFacts,
  links: modelLinkFacts,
  constraints: modelConstraintFacts,
  skeletonRoster: modelSkeletonRoster,
  boneTimelines: modelBoneTimelines,
  eventKeys: modelEventKeys,
  deformSurvey: modelDeformSurvey,
  animationDurations: modelAnimationDurations,
  twoColour: modelTwoColour,
  sequences: modelSequences,
  sliderComposition: modelSliderComposition,
  constraintTargets: modelConstraintTargets,
  steppedPoses: modelSteppedPoses,
  stageBox: modelStageBox,
  setupWorld: modelSetupWorld,
  rigInfo: (read, input) => {
    refuseDeclaredBeside(read, input, 'rig');
    return modelRigInfo(read);
  },
  declaredDurations: (read, input) => {
    refuseDeclaredBeside(read, input, 'declaredDurations');
    return modelDeclaredDurations(read);
  },
};

/**
 * One moved assertion: its code, and how the model side runs its body once the
 * document is read. The list is the registry of what has moved — a later cut
 * puts its rows where `validate()` runs those rules, not at the end — and the
 * selftest reads it for the codes it compares.
 */
export interface MovedAssertion {
  code: string;
  /** The body, over the document. Not called when the model side read no document. */
  run: (verdicts: Verdicts, read: ReadDocument, input: ModelValidateInput, supply: ModelSupply) => void;
  /** What the body SKIPs with when there is no document — the model side's counterpart of the reason `validate()` gives when the round trip produced nothing. */
  unread: string;
  /**
   * The body runs behind the reader alone, not behind the region rule — the
   * model side's place for a rule `validate()` runs BEFORE its round trip
   * (A08, issue #589), so that a region miss is named by the rule's own
   * sentence on both sides while the parse beside it refuses the file.
   *
   * Since cut 4c-4 also every rule `validate()` runs over the skeleton JSON
   * whatever its round trip did (A12, A24, A25, A26, A29, A30, and A32, which
   * runs before it; since cut 4c-5 A34): on the runtime's side their verdict does not wait on the
   * load, so on this side it does not wait on the region rule, and where both
   * parses refuse a build the two sides' lines of these rules are still
   * compared.
   */
  beforeTheParse?: boolean;
}

/**
 * The moved assertions, in `validate()`'s report order — the order its `check`
 * calls stand in, so a model-side report lists its PASS, SKIP and FAIL lines in
 * the order the round trip's does. The seven cuts of issue #1025 appended their
 * rows in landing order; issue #1054 put them back, and the selftest's `VF16`
 * names a row that stands out of that order. `SKIP_NO_ATLAS` for
 * A17 rather than `SKIP_NO_MODEL` because that is what A17 says over a missing
 * atlas on either side: its body reads only the pages, and on this side no
 * document means no pages.
 */
export const MOVED_ASSERTIONS: readonly MovedAssertion[] = [
  { code: 'A08_REGION_NAMES_MATCH_ATTACHMENTS', run: (v, read, _input, supply) => (read.doc.pages === null ? v.skip('A08_REGION_NAMES_MATCH_ATTACHMENTS', SKIP_NO_MODEL_PAGES) : a08RegionNamesMatchAttachments(v, supply.regionJoins(read), new Set<string>())), unread: SKIP_NO_MODEL, beforeTheParse: true },
  { code: 'A32_EVENT_KEYS_RESOLVE', run: (v, read, _input, supply) => a32EventKeysResolve(v, supply.eventKeys(read)), unread: SKIP_NO_MODEL, beforeTheParse: true },
  { code: 'A34_CONSTRAINT_TIMELINE_TARGETS', run: (v, read, _input, supply) => a34ConstraintTimelineTargets(v, supply.constraintTargets(read)), unread: SKIP_NO_MODEL, beforeTheParse: true },
  { code: 'A12_NO_DARK_COLOR', run: (v, read, _input, supply) => a12NoDarkColor(v, supply.skeletonRoster(read), supply.slotColour(read).slotTimelines), unread: SKIP_NO_MODEL, beforeTheParse: true },
  { code: 'A03_REGION_WIDTH_HEIGHT_FINITE', run: (v, read, _input, supply) => a03RegionWidthHeightFinite(v, supply.skinEntries(read)), unread: SKIP_NO_MODEL },
  { code: 'A04_MESH_TRIANGLES_AND_ENCODING', run: (v, read, _input, supply) => a04MeshTrianglesAndEncoding(v, supply.meshes(read)), unread: SKIP_NO_MODEL },
  { code: 'A33_VERTEX_ATTACHMENT_GEOMETRY', run: (v, read, _input, supply) => a33VertexAttachmentGeometry(v, supply.polygons(read)), unread: SKIP_NO_MODEL },
  { code: 'A13_MESH_BUDGET', run: (v, read, input, supply) => a13MeshBudget(v, supply.meshes(read), { rig: supply.rigInfo(read, input) }), unread: SKIP_NO_MODEL },
  { code: 'A14_NO_FULL_FRAME_MESH', run: (v, read, input, supply) => a14NoFullFrameMesh(v, supply.meshes(read), supply.stage(read, input)), unread: SKIP_NO_MODEL },
  { code: 'A15_IDLE_NO_MESH_BONE_KEYS', run: (v, read, input, supply) => a15IdleNoMeshBoneKeys(v, supply.meshes(read), supply.animatedBones(read), { rig: supply.rigInfo(read, input) }), unread: SKIP_NO_MODEL },
  { code: 'A20_MESH_WEIGHTS_COHERENT', run: (v, read, input, supply) => a20MeshWeightsCoherent(v, supply.meshes(read), input.profile === 'rig-play', supply.rigInfo(read, input)), unread: SKIP_NO_MODEL },
  { code: 'A21_MESH_RIM_PINNED', run: (v, read, input, supply) => a21MeshRimPinned(v, supply.meshes(read), supply.rigInfo(read, input)), unread: SKIP_NO_MODEL },
  { code: 'A22_MESH_UVS_IN_UNIT_RANGE', run: (v, read, _input, supply) => a22MeshUvsInUnitRange(v, supply.meshes(read)), unread: SKIP_NO_MODEL },
  { code: 'A39_DEFORM_KEEPS_TRIANGLE_WINDING', run: (v, read, input, supply) => a39DeformKeepsTriangleWinding(v, supply.deformSurvey(read), supply.rigInfo(read, input)), unread: SKIP_NO_MODEL },
  { code: 'A23_PHYSICS_CONSTRAINT_EFFECTIVE', run: (v, read, _input, supply) => a23PhysicsConstraintEffective(v, supply.constraints(read), supply.meshes(read)), unread: SKIP_NO_MODEL },
  { code: 'A36_PATH_CONSTRAINT_EFFECTIVE', run: (v, read, _input, supply) => a36PathConstraintEffective(v, supply.constraints(read)), unread: SKIP_NO_MODEL },
  { code: 'A37_SLIDER_CONSTRAINT_EFFECTIVE', run: (v, read, _input, supply) => a37SliderConstraintEffective(v, supply.constraints(read)), unread: SKIP_NO_MODEL },
  { code: 'A47_IK_CONSTRAINT_NOT_MUTED_THROUGHOUT', run: (v, read, input, supply) => a47IkConstraintNotMutedThroughout(v, supply.constraints(read), supply.rigInfo(read, input)), unread: SKIP_NO_MODEL },
  { code: 'A48_TRANSFORM_CONSTRAINT_NOT_MUTED_THROUGHOUT', run: (v, read, input, supply) => a48TransformConstraintNotMutedThroughout(v, supply.constraints(read), supply.rigInfo(read, input)), unread: SKIP_NO_MODEL },
  { code: 'A40_SLIDERS_COMPOSE_ON_A_SHARED_TARGET', run: (v, read, _input, supply) => a40SlidersComposeOnASharedTarget(v, supply.sliderComposition(read), supply.constraints(read)), unread: SKIP_NO_MODEL },
  { code: 'A42_DRIVEN_CONSTRAINTS_UPDATE_AFTER_THEIR_DRIVER', run: (v, read, _input, supply) => a42DrivenConstraintsUpdateAfterTheirDriver(v, supply.constraints(read)), unread: SKIP_NO_MODEL },
  { code: 'A38_SKIN_MEMBERS_ARE_SKIN_REQUIRED', run: (v, read, _input, supply) => a38SkinMembersAreSkinRequired(v, supply.skinMembers(read)), unread: SKIP_NO_MODEL },
  { code: 'A09_ANIMATION_DURATION_MATCHES_SPEC', run: (v, read, input, supply) => a09AnimationDurationMatchesSpec(v, supply.animationDurations(read), supply.declaredDurations(read, input)), unread: SKIP_NO_MODEL },
  { code: 'A10_NO_NAN_AFTER_STEPPING', run: (v, read, _input, supply) => a10NoNanAfterStepping(v, supply.boneTimelines(read), supply.steppedPoses(read)), unread: SKIP_NO_MODEL },
  { code: 'A43_TWO_COLOR_TINT_LOADS_AND_POSES_AS_WRITTEN', run: (v, read, _input, supply) => a43TwoColorTintLoadsAndPosesAsWritten(v, supply.twoColour(read)), unread: SKIP_NO_MODEL },
  { code: 'A45_SEPARABLE_COLOR_TIMELINES_OWN_THEIR_CHANNELS_AND_POSE_AS_WRITTEN', run: (v, read, _input, supply) => a45SeparableColorTimelinesOwnTheirChannelsAndPoseAsWritten(v, supply.slotColour(read)), unread: SKIP_NO_MODEL },
  { code: 'A44_LINKED_MESH_STATES_NO_GEOMETRY_OF_ITS_OWN', run: (v, read, _input, supply) => a44LinkedMeshStatesNoGeometryOfItsOwn(v, supply.links(read)), unread: SKIP_NO_MODEL },
  { code: 'A46_SEQUENCE_ATTACHMENTS_SHOW_THE_FRAME_THE_FILE_STATES', run: (v, read, _input, supply) => a46SequenceAttachmentsShowTheFrameTheFileStates(v, supply.sequences(read)), unread: SKIP_NO_MODEL },
  { code: 'A17_ATLAS_PAGE_FILES_EXIST', run: (v, read, input, supply) => a17AtlasPageFilesExist(v, supply.atlasPages(read), input), unread: SKIP_NO_ATLAS },
  { code: 'A06_ATLAS_PAGE_SIZE_MATCHES_PNG', run: (v, read, input, supply) => a06AtlasPageSizeMatchesPng(v, supply.atlasRegions(read, input), input, input.profile === 'rig-play'), unread: SKIP_NO_ATLAS },
  { code: 'A19_OVERLAY_PNGS_HAVE_ALPHA', run: (v, read, input, supply) => a19OverlayPngsHaveAlpha(v, supply.atlasRegions(read, input), supply.stage(read, input), supply.skinEntries(read), { atlasDir: input.atlasDir, rig: supply.rigInfo(read, input) }), unread: SKIP_NO_ATLAS },
  { code: 'A49_PACKED_FOOTPRINTS_DO_NOT_OVERLAP', run: (v, read, input, supply) => a49PackedFootprintsDoNotOverlap(v, supply.atlasRegions(read, input), supply.regionJoins(read), supply.meshes(read)), unread: SKIP_NO_ATLAS },
  { code: 'A50_STAGE_BOX_IS_THE_STAGE', run: (v, read, _input, supply) => a50StageBoxIsTheStage(v, supply.stageBox(read)), unread: SKIP_NO_MODEL },
  { code: 'A24_AXIS_SPACE_STROKE', run: (v, read, input, supply) => a24AxisSpaceStroke(v, supply.boneTimelines(read), { rig: supply.rigInfo(read, input) }), unread: SKIP_NO_MODEL, beforeTheParse: true },
  { code: 'A25_DETACHED_BONE_PARENTAGE', run: (v, read, input, supply) => a25DetachedBoneParentage(v, supply.skeletonRoster(read), { rig: supply.rigInfo(read, input) }), unread: SKIP_NO_MODEL, beforeTheParse: true },
  { code: 'A26_SLOT_DRAW_ORDER', run: (v, read, input, supply) => a26SlotDrawOrder(v, supply.skeletonRoster(read), { rig: supply.rigInfo(read, input) }), unread: SKIP_NO_MODEL, beforeTheParse: true },
  { code: 'A28_RIBBON_ROWS_SHARE_WEIGHTS', run: (v, read, input, supply) => a28RibbonRowsShareWeights(v, supply.meshes(read), supply.rigInfo(read, input)), unread: SKIP_NO_MODEL },
  { code: 'A29_STROKE_WITHIN_CONTACT_DEPTH', run: (v, read, input, supply) => a29StrokeWithinContactDepth(v, supply.boneTimelines(read), { rig: supply.rigInfo(read, input) }), unread: SKIP_NO_MODEL, beforeTheParse: true },
  { code: 'A30_STROKE_WITHIN_CAP_CONTAINMENT', run: (v, read, input, supply) => a30StrokeWithinCapContainment(v, supply.boneTimelines(read), { rig: supply.rigInfo(read, input) }), unread: SKIP_NO_MODEL, beforeTheParse: true },
  { code: 'A51_BONES_LIE_ALONG_THEIR_DECLARED_AXIS', run: (v, read, input, supply) => a51BonesLieAlongTheirDeclaredAxis(v, supply.setupWorld(read), { rig: supply.rigInfo(read, input) }), unread: SKIP_NO_MODEL },
];

/** The codes the model side prints: its two parse rules, then the moved assertions. */
export const MODEL_SIDE_CODES: readonly string[] = [A00_MODEL_READ, A00_MODEL_REGIONS_ON_PAGES, ...MOVED_ASSERTIONS.map((m) => m.code)];

/**
 * The parse: the reader, then the region rule. Returns what the reader read
 * (`null` when it refused) and whether the region rule held too — a
 * `beforeTheParse` body needs only the first.
 */
function parse(h: VerdictHarness, modelText: string): { read: ReadDocument | null; held: boolean } {
  const read = h.check(A00_MODEL_READ, () => modelRead(h.verdicts, modelText)) ?? null;
  if (read === null) {
    h.check(A00_MODEL_REGIONS_ON_PAGES, () => h.skip(A00_MODEL_REGIONS_ON_PAGES, SKIP_NO_MODEL_DOCUMENT));
    return { read: null, held: false };
  }
  return { read, held: h.check(A00_MODEL_REGIONS_ON_PAGES, () => modelRegionsOnPages(h.verdicts, read)) === true };
}

/**
 * The row the rig's two figures are written before (issue #1114): `validate()`
 * sets `rig` and `profile` where its archetype assertions begin, after every
 * figure the bodies above them write and before A29's and A30's, so the figures
 * line lists them in that place on both entries. `RC39` in `selftest.ts`
 * compares the two lines key by key.
 */
const RIG_FIGURES_BEFORE = 'A24_AXIS_SPACE_STROKE';
if (!MOVED_ASSERTIONS.some((m) => m.code === RIG_FIGURES_BEFORE)) throw new Error(`internal: the model side writes the rig's figures before ${RIG_FIGURES_BEFORE}, which it no longer runs`);

/**
 * The attachment figures `validate()` counts over the skins it loaded (issue
 * #1114), counted over the document's skins in the file's walk order: a
 * `region` record is a region attachment, and a `mesh` or `linkedmesh` record
 * a mesh attachment — the runtime loads a linked mesh as a mesh. Written only
 * where the document read and its regions held, as the round trip writes them
 * only where it loaded the skeleton, and before any body's figure, which is
 * where `validate()` writes them.
 */
function attachmentFigures(stats: Record<string, number | string>, read: ReadDocument): void {
  const kinds = fileOrderedEntries(read).map((entry) => entry.record.kind);
  stats.regionAttachments = kinds.filter((kind) => kind === 'region').length;
  stats.meshAttachments = kinds.filter((kind) => kind === 'mesh' || kind === 'linkedmesh').length;
}

/**
 * `rig` — the archetype the document's rig section states (`validate()` prints
 * its caller's; the model side reads the document's, issue #1054 — read
 * directly rather than through `supply.rigInfo`, whose refusal of a caller's
 * `rig` beside the document is the rules' line to print, not this figure's),
 * left out where there is no document to state one — and `profile`, the profile this
 * run was handed: the same argument both entries read off `--profile`.
 */
function rigFigures(stats: Record<string, number | string>, read: ReadDocument | null, input: ModelValidateInput): void {
  if (read !== null) stats.rig = modelRigInfo(read).archetype;
  stats.profile = input.profile;
}

/**
 * Run the model side: the parse, then every moved assertion — each over the
 * document, or skipped naming the parse when there is none — and return the
 * report in `validate()`'s shape, which `reportLines` in `src/validate.ts`
 * prints. `plant` replaces a family's supplier; only the selftest's plants
 * pass one.
 */
export function validateModel(given: ModelValidateInput, plant: Partial<ModelSupply> = {}): ModelReport {
  // Refuse unknown and removed profiles before choosing policy or writing a report (issue #1668).
  const input: ModelValidateInput = { ...given, profile: resolveProfile(given.profile, 'the model side') };
  const supply: ModelSupply = { ...MODEL_SUPPLY, ...plant };
  const h = verdictHarness(input.profile, { ...ASSERTION_KIND, ...MODEL_PARSE_KIND }, 'the model side');
  const { read, held } = parse(h, input.modelText);
  if (read !== null && held) attachmentFigures(h.stats, read);
  for (const moved of MOVED_ASSERTIONS) {
    if (moved.code === RIG_FIGURES_BEFORE) rigFigures(h.stats, read, input);
    const doc = read !== null && (held || moved.beforeTheParse === true) ? read : null;
    h.check(moved.code, () => (doc === null ? h.skip(moved.code, moved.unread) : moved.run(h.verdicts, doc, input, supply)));
  }
  const { failures, passed, skipped, profileSkipped, stats } = h;
  return { failures, passed, skipped, profileSkipped, stats, profile: input.profile };
}

