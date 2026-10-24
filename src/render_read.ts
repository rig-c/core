/**
 * The promised renderer reads for checked consumers (issue #1561).
 *
 * This entry registers no Spine side. Rigc builds use the official candidate
 * chooser and core poser; inputs needing Spine are refused by SpineRuntimeError
 * unless the consumer has explicitly loaded rig-c/render. That entry keeps its
 * eager runtime import and registers the same implementation this seam uses.
 * Only the agreed reads, their types and their existing failure classes belong
 * here. The broader implementation module is not the public contract.
 */
export {
  loadCandidate,
  throughPoser,
  sampleAnimation,
  sampleSetupPose,
  pageFor,
  projector,
  rasterisePiece,
  renderFrame,
  CandidateAtlasError,
  CandidatePairError,
  PoserChoiceError,
  SlotSubsetError,
} from './render_shared.ts';
export { SpineRuntimeError } from './spine_side.ts';
export { CoreInputError } from './core/index.ts';
export type {
  Candidate,
  SkeletonFacts,
  PoserChoice,
  PoserName,
  MakeCorePoser,
  Poser,
  Posed,
  PoseSource,
  PoseOptions,
  DrawOptions,
  SkinRoster,
  SlotSubset,
  Frame,
  BoneSnapshot,
  AttachmentPose,
  AttachmentRest,
  Piece,
  PieceCommon,
  PieceTexture,
  UvWindow,
  Quad,
  Mesh,
  ClipSource,
  Viewport,
  EmitPixel,
} from './render_shared.ts';
export type { Plate, RGBA } from '../tools/plate.ts';
export type { EnvironmentStep, EnvironmentChange } from './environment.ts';
