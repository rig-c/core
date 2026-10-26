/**
 * core_gate — the equivalence gate of issue #380 run over a corpus: every
 * recipe built through the CLI, its Spine build posed by spine-core and its
 * model document posed by rigc's own core, the two compared, and the census of
 * what the corpus reaches (issue #925, step 2a; the slots, issue #928; the
 * attachments' world vertices and the clipping polygons, issue #931).
 *
 *   bun tools/core_gate.ts [--recipes <recipes.json>] [--root <dir>] [--work <dir> | --keep-work] [--raw | --walk]
 *
 * `--raw` (issue #966) runs every dump below under `pose_oracle.ts dump
 * --raw` — full doubles, both dumpers — and every `compare` at tolerance 0
 * in ulps: the census of last-bit gaps the grid hides. The verdict line is
 * prefixed `RAW`, each row's worst deltas are in ulps, and before it one
 * `RAW` line per block (`rawCensusLines`) counts the rows exact, off and
 * skipped, the worst distance and its row, then the stepped and per-skin
 * runs the same way.
 *
 * With no `--recipes`, the tree's own: `tools/emit_hashes.ts`'s `treeRecipes`
 * (every fetched editor export and every gallery rig — nineteen when
 * `examples/` is fetched), staged and built exactly as `emit_hashes run`
 * builds them (`runRecipes`), so the same rows are measured here and there.
 * `--recipes` takes an `emit-hashes-recipes/1` or `emit-hashes/1` document and
 * `--root` resolves its stages, which is how a private corpus is run: its
 * recipes live with it and only the printed figures leave it.
 *
 * ## Per row
 *
 * `tools/pose_oracle.ts`'s two dumpers on the build in `{{out}}`: `dump` of
 * `skeleton.json` + `skeleton.atlas` (spine-core) and `dump --core` of
 * `skeleton.model.json`, both under the default options (grid, nine samples,
 * every skin, no physics), then `compare`. Each block the core poses —
 * `setup.bones`, `setup.slots`, `setup.drawOrder`, `setup.attachments`,
 * `setup.clips`, `setup.clipped`, and a sample's `bones`, `slots`,
 * `drawOrder`, `attachments`, `clips`, `clipped` and `events` (`GATE_BLOCKS`;
 * the sample's draw order, attachments, clips and events and the setup's draw
 * order since issue #955, both `clipped` blocks since issue #964, with a
 * clipping census — `CLIPPED_CENSUS_FIELDS` — off the spine-core dump; both
 * `uvs` blocks since issue #967, the core reading the build's
 * `skeleton.atlas` beside the model, judged at tolerance 0 and with a census
 * of what they reach — `UV_CENSUS_FIELDS`) — is
 * judged on its own, by a
 * `compare` of the spine-core dump against the core's with the other posed
 * blocks left out, and reads:
 *
 *   - `IDENTICAL` — the block agrees;
 *   - `SKIP` — the core left the block out, with the construct it names (a
 *     path walking a slot whose placeholder skins fill differently, or
 *     another case `src/core/constraints_path.ts` names, or a slider keying a
 *     constraint timeline, for the bones — every constraint kind is posed
 *     since issue #938; a slider keying a slot on such a row, or skins
 *     disagreeing over a placeholder — under the merged view only, and
 *     judged per skin below — for the slots; either of those, a shown
 *     region whose atlas rectangle is `null`, or a deform or sequence
 *     timeline moving a record several skins fill, for the attachments; a
 *     slider keying the draw order on a row whose bones are absent, for the
 *     draw order), so the row holds nothing about it;
 *   - `DIFF` — with the first difference.
 *
 * The row's own verdict is `DIFF` when any block is (or the whole comparison
 * is), `IDENTICAL` when every block is, `SKIP` otherwise — naming the blocks
 * skipped — and `REFUSED` when the build chain exited non-zero or a document
 * could not be read; a refused row is not measured and says why. Under the
 * row, one line per animation (issue #936): its verdict on each sample
 * block, and the first difference of a DIFF.
 *
 * ## The header's box (issue #907)
 *
 * Every row once more, in process: rigc's setup-pose bounding box over the
 * model document (`setupBounds` in `src/core/raw.ts`) against spine-core's
 * `getBounds` over the Spine pair (`spineSetupBounds` in `./pose_oracle.ts`)
 * at tolerance 0, and the header `build` wrote against that box on the
 * header's grid (`headerBoxNumber`, `boundsRow`). One `BOUNDS` line per row and a `BOUNDS GREEN|RED` verdict
 * line after the no-skin block; a DIFF or REFUSED row turns the run RED, and
 * a row the core cannot pose is SKIP, naming why, with the header carrying no
 * box.
 *
 * ## Per skin (issue #932)
 *
 * The run above poses every skin merged (`--skin all`), which is the
 * instrument's view and not a state a runtime is ever in: a placeholder
 * several skins fill shows the last of them in the Spine file's order,
 * which the model does not hold, so the core leaves such a block out. A row
 * whose model declares several skins is therefore run once more per skin,
 * both dumpers under `--skin <name>` (the named skin's record, else the
 * default skin's; the named skin's bones and constraint lists alone —
 * `src/core/skins.ts`), each block judged alone as above, the stepped run
 * too. A block the merged run leaves out and every skin's run poses is
 * judged by those runs — DIFF when any skin's is, IDENTICAL otherwise, its
 * reason saying so — and a skin's DIFF makes the row DIFF, naming the skin.
 * The merged run stays: it is what the rosters are compared on, and a
 * block it poses is judged there as before. A row declaring one skin (or
 * none) is not run again: its one skin and the merged view are the same
 * pose — measured on the nineteen tree rows, spine-core's dump under
 * `--skin <its skin>` equals its `--skin all` dump in every block
 * (`CN05`) — so the per-skin runs cost nothing on a one-skin corpus. Each
 * skin's verdict prints under its row, the verdict line counts the rows
 * declaring several skins and their runs, and a corpus with none prints a
 * `per skin` HOLE.
 *
 * ## The stepped run (issue #956)
 *
 * Every row is dumped a second time by both dumpers under `--physics step
 * --dt 1/60` (`STEPPED_OPTIONS`, the oracle's default `dt`, the same nine
 * grid samples) and its `setup.bones` and `animations.bones` judged alone,
 * the `physics` parameter block with each — both phases on every run, not a
 * flag: the stepped share of a run over the nineteen tree rows measured
 * 0.56 s and 1.67 s on two runs of a shared machine, against builds that
 * take the rest of its half-minute. A row declaring a physics constraint,
 * or one whose stepped verdict is not IDENTICAL, prints the `dt` its two
 * documents state (they must state the same one, or the row is DIFF) and,
 * per animation, the steps the schedule takes to reach each sample from the
 * one before (`stepSchedule` in `src/core/constraints_physics.ts`; the first
 * sample, at 0, takes none: it is the reset pose). A stepped DIFF turns the
 * run RED, and the verdict line counts the stepped verdicts after the rest.
 *
 * ## The census
 *
 * One line per row: bones, the inherit modes the model states (a bone that
 * states none inherits `normal`), and how many bones state each field a
 * setup pose reads — `length`, `scaleX`, `scaleY`, `shearX`, `shearY`,
 * `skinRequired` — plus three conditions: a negative scale, a rotation of 360
 * degrees or more in magnitude, and a parent whose setup world matrix
 * reflects (determinant below 0 in the spine-core dump). A mode or field no
 * row whose `setup.bones` was compared reaches is printed as a HOLE: the gate
 * held nothing about it, and that is the finding.
 *
 * And one line per row for the slots (`SLOT_CENSUS_FIELDS`, issue #928): a
 * second skin, a setup placeholder several skins fill (and those that
 * disagree), a `null` setup attachment, a placeholder no skin fills, a stated
 * colour (and one of six digits), a dark colour (and one of eight digits), a
 * stated blend mode by the mode it reads (`blendNormal`, `blendAdditive`,
 * `blendMultiply`, `blendScreen`; a slot stating none reads `Normal` and is
 * judged on every compared row), a shown record whose name is not its
 * placeholder or whose path is not its name, each kind shown at setup, a slot
 * on an inactive bone, and a slider whose animation keys a slot. Each field no
 * row whose `setup.slots` was compared reaches is a HOLE. The blend mode is
 * the slot row's last cell since issue #933, so a stated one is judged like
 * every other field.
 *
 * And one line per row for the animations (`ANIMATION_CENSUS_FIELDS`, issue
 * #936): the timelines of each bone and slot kind, the keys by the curve that
 * leaves them, the gate's sample times before a timeline's first key and after
 * its last, a bone keyed by two timelines posing one channel, and — since
 * issue #955, which replaced the one `laterTimelines` HOLE — construct 4's
 * remainder per kind: deform timelines (weighted, on a path, on a clipping
 * polygon, played by a linked mesh; Bézier and stepped segments; partial
 * runs and keys with no run; in a slider's animation), sequence timelines,
 * draw-order timelines (restores; a slider's) and events (a payload stated),
 * each judged on the block it changes (`REMAINDER_CENSUS_BLOCKS`). A field no
 * row whose block was compared reaches is a HOLE. Then one `KIND` line per
 * timeline kind — deform, sequence, draw order, events — the rows carrying
 * it that are judged on its block, and those that stay SKIP.
 *
 * And one line per row for the constraints (`CONSTRAINT_CENSUS_FIELDS`, issue
 * #938): the ik and transform constraints and what each states, their
 * timelines, and the update order's two effects — a constraint reading a bone
 * an earlier one moved, and a world-space edit a later one re-poses — each a
 * HOLE when no row whose bones were compared reaches it; the physics
 * constraints and their timelines, and the slider's forms, flags, what its
 * animation keys and its timelines, likewise; the kinds
 * no cut poses yet (`later`) a HOLE however many rows declare one, and a
 * `NONE` line saying so when no kind is left to a later cut.
 *
 * And one line per row for the stepped phase (`STEPPED_CENSUS_FIELDS`, issue
 * #956): each component a physics constraint drives, each setting it states
 * off the parser's value, each timeline kind keyed, the timeline naming no
 * constraint, a `mix` of 0, two constraints on one bone, one physics bone
 * below another and a skin-required constraint — each a HOLE when no row
 * the stepped run judged IDENTICAL reaches it, which the core suite's `CK`
 * probes hold (it replaces issue #938's `physics.stepped` HOLE).
 *
 * And one line per row for the path constraints (`PATH_CENSUS_FIELDS`, issue
 * #938's second cut): every mode and setting the walk reads, the curve each
 * walks, a percent position past an open path's ends, which slot bone the
 * offset reads, a slot showing no path, a path after a constraint that moves
 * what it reads, and the three timelines — each a HOLE when no compared row
 * reaches it, which the core suite's `CP11` holds to a probe. Then one `KIND`
 * line per constraint kind: the rows declaring it that are judged and those
 * that stay SKIP.
 *
 * And one line per row for the attachments (`ATTACHMENT_CENSUS_FIELDS`, issue
 * #931), each a count of slots whose setup attachment has it: a weighted mesh,
 * a mesh bound to several bones, a mesh bound to a bone whose setup world
 * matrix reflects or shears (off the spine-core dump), a linked mesh, a
 * trimmed region, a region with non-unit scale or a rotation, a region under
 * a negative scale or a reflecting bone, a region with a sequence, a region
 * whose rectangle is `null`, a clipping polygon and one ending at a slot, a
 * bounding box and a path attachment. Each field no row whose block was
 * compared reaches is a HOLE; ⚠️ a bounding box and a path are HOLEs on every
 * corpus, since the oracle's dump writes no vertices for either, and a trim
 * is reached only from a pack that trims, which the public examples do not.
 *
 * ## No skin set (issue #1051)
 *
 * After the census, the rows posed with no skin set — both dumpers under
 * `--skin none` (`NOSKIN_OPTIONS`; `--raw` with the run), the state `render`
 * without `--skin`, A10's walk and `validate()` pose in: each corpus row
 * whose document declares skins and no `default` one, or a `default` skin
 * naming a skin-required bone or constraint (`noSkinClass`), and three
 * hand-written probes built through `ingest` and `compile`
 * (`noSkinProbeSkeleton`: no default skin, a default skin naming members, a
 * plain default for contrast). Each prints a `NOSKIN` line — every posed
 * block judged alone, the stepped run under the same option, and every bone
 * unposed in either pose compared to the bit (`compareUnposed`, the
 * runtime's fresh reading classing HISTORY) — then a `NO SKIN` verdict line;
 * a corpus with no row in the class prints a HOLE naming the probes as the
 * only reading. A DIFF or REFUSED there turns the run RED. `--walk` walks the
 * same three probes beside the inactive-bone ones.
 *
 * ## The runtime poser (issue #1591)
 *
 * After the bounds, every built row once more through the third dumper
 * (`runtimeDump` in `./pose_oracle.ts`): the runtime poser (`src/runtime/`)
 * against the core under `--raw` at the oracle's default samples, whatever
 * flag the run was given, and compared twice at tolerance 0 — by `compare`, and
 * cell by cell over every pose block both sides carry (`strictPoseDiff`, which
 * reads the bones `compare`'s ill-conditioned rule leaves out). The page UVs
 * are the atlas's and are compared by neither. One `RUNTIME` line per row —
 * `IDENTICAL` (covered whole and equal), `SKIP` (refused at load, every
 * missing feature named with how often and where first; or covered in part,
 * every refused animation, every block the core leaves out and events not
 * fired named — the rest compared), `DIFF` with the first difference,
 * `REFUSED` — then one `RUNTIME SKIP feature` line per feature with its rows,
 * a `HOLE` line when no row is covered whole or nothing was compared, and the
 * `RUNTIME GREEN|RED` verdict line counting the rows each way and the poses and
 * values compared. A DIFF or REFUSED turns the run RED; a corpus the runtime
 * poses none of is a HOLE, not a failure — stage 0 refuses most of a
 * production corpus by design.
 *
 * ## `--walk` — A10's walk (issue #1025, cut 4c-5a)
 *
 * `bun tools/core_gate.ts --walk [--recipes …] [--root …] [--work …]` builds
 * the same rows and runs, instead of everything above, A10's walk on both
 * sides (`spineWalkDocument` and `coreWalkDocument` in `./pose_oracle.ts`):
 * the setup pose with every physics state reset, then every animation on a
 * LOOPING track stepped 120 times by `max(duration, 1) / 120`, every pose's
 * times, bone terms, drawn vertices and slot colours compared at tolerance 0
 * (`Object.is`: a NaN equals a NaN, −0 is not 0). One line per row —
 * `IDENTICAL`, `DIFF` with the first difference, `SKIP` where the core refuses
 * the document by name, `REFUSED` where the build chain failed — then a
 * `WALK` verdict line counting rows (the corpus's, then the inactive-bone
 * probes `walkProbes` builds in memory and the no-skin probes
 * `noSkinWalkProbes` builds under the work directory), poses, numbers, the steps past the
 * duration (the wrap) and the poses holding a non-finite value — and, where
 * any, the numbers on bones the view leaves inactive that a constraint writes
 * into (HISTORY, issue #979: the runtime keeps such a bone's previous step,
 * the core does not; `walkHistory` in src/core/walk.ts), counted apart with
 * their writers and how many differ only in the sign of zero, compared with
 * nothing. Exit 0 when
 * no row is DIFF or REFUSED and some pose was compared, 1 otherwise. The
 * default and `--raw` runs print what they printed before it.
 *
 * Exit codes: 0 when every row is IDENTICAL or SKIP; 1 when any row is DIFF or
 * REFUSED, or its stepped run or any skin's run is DIFF, or a no-skin row is
 * DIFF or REFUSED, or a runtime row is DIFF or REFUSED; 2 on a bad input, by name. `tools/` is not `src/`: this file runs
 * child processes (through `runRecipes`) and reads the disk.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { activeBones, CORE_INHERIT_MODES, CoreInputError, foldInheritMode, readBlend, readModel, shownAttachment, shownRow } from '../src/core/index.ts';
import { BONE_TIMELINE_KINDS, sampleTime, SLOT_TIMELINE_KINDS, type TimelinePlant } from '../src/core/animation.ts';
import { ADMITTED_CONSTRAINT_KINDS, TRANSFORM_PROPERTIES, type CoreConstraintRecord } from '../src/core/constraints.ts';
import { slotBonePlan, type CorePathRecord } from '../src/core/constraints_path.ts';
import { EVERY_GLOBAL_PHYSICS, PHYSICS_DEFAULTS, stepSchedule, type CorePhysicsRecord } from '../src/core/constraints_physics.ts';
import { CORE_CONSTRAINT_KINDS, type CompiledDocument } from '../src/core/index.ts';
import { MODEL_DOCUMENT_FILE, modelDocument } from '../src/model.ts';
import { compile, editorAnimationOrder, headerBoxNumber } from '../src/compile.ts';
import { setupBounds } from '../src/core/raw.ts';
import type { CorePlant } from '../src/core/index.ts';
import { ingest } from '../src/ingest.ts';
import { CORE_DEFAULT_SKIN } from '../src/core/skins.ts';
import { encodePng } from './plate.ts';
import { HashesInputError, readRecipes, runRecipes, TREE_ROOT, treeRecipes, type Recipe } from './emit_hashes.ts';
import { readKeepWork, WorkDirectory } from './work_dir.ts';
import { drawnRegions, shownAtSample, shownAtSetup, type DrawnRegion, type UvReading, type UvSource } from '../src/core/uvs.ts';
import {
  compareDumps,
  coreDump,
  dumpSkeleton,
  loadOracleData,
  ORACLE_BLOCKS,
  ORACLE_DEFAULT_DT,
  ORACLE_DEFAULT_SAMPLES,
  ORACLE_DEFAULT_TOL,
  OracleInputError,
  parseDt,
  uvSourceOf,
  type OracleBlock,
  type OracleComparison,
  type OracleDocument,
  type OracleOptions,
  compareWalkDocuments,
  coreWalkDocument,
  spineWalkDocument,
  type WalkComparison,
  compareUnposed,
  ORACLE_NO_SKIN,
  type SkinViewOf,
  spineSetupBounds,
} from './pose_oracle.ts';
import type { WalkPlant } from '../src/core/walk.ts';
import { runtimeDump, RUNTIME_NO_EVENTS_WHY, type RuntimeDump } from './pose_oracle.ts';
import { missingText, RuntimeRefusal, RUNTIME_STAGE, type RuntimeMissing, type RuntimePlant } from '../src/runtime/index.ts';

/** The options both dumps are taken under: the oracle's defaults. */
export const GATE_OPTIONS: OracleOptions = { phase: 'grid', samples: ORACLE_DEFAULT_SAMPLES, skin: 'all', physics: 'none', dt: null };

/** The stepped run's options (issue #956): the same samples, `--physics step` at the oracle's default `--dt`. */
export const STEPPED_OPTIONS: OracleOptions = { ...GATE_OPTIONS, physics: 'step', dt: parseDt(ORACLE_DEFAULT_DT) };

/**
 * The stepped phase's census fields (issue #956), in the order its table
 * prints them: each component a physics constraint drives (above 0), a
 * component stated below 0 (off, though a negative `rotate` or `shearX` still
 * weighs the rotation), each setting stated other than the parser's value
 * (`PHYSICS_DEFAULTS`), each timeline kind keyed, the timeline that names no
 * constraint, a constraint resting at `mix` 0 or keyed to it, two constraints
 * on one bone, a physics bone below another physics bone, and a
 * skin-required one. Each a count of physics constraints (or timelines),
 * over the document.
 */
export const STEPPED_CENSUS_FIELDS = [
  'x', 'y', 'rotate', 'scaleX', 'shearX', 'componentNegative',
  'inertia', 'strength', 'damping', 'mass', 'wind', 'gravity', 'mix', 'limit', 'fps',
  'timeline.inertia', 'timeline.strength', 'timeline.damping', 'timeline.mass', 'timeline.wind', 'timeline.gravity', 'timeline.mix', 'timeline.reset',
  'timeline.global', 'mixZero', 'sameBone', 'chain', 'skin',
] as const;
export type SteppedCensusField = (typeof STEPPED_CENSUS_FIELDS)[number];
export type SteppedCensusRow = Record<SteppedCensusField, number>;

/** One row's stepped run: its bones judged under `STEPPED_OPTIONS`, the `dt` both documents state, and the steps the walk takes between samples. */
export interface SteppedRow {
  verdict: BlockVerdict;
  why: string | null;
  /** The `options.dt` both documents carry. */
  dt: number | null;
  boneSamples: number;
  /** Per animation, the steps taken to reach each sample from the one before (the first from the reset at 0). */
  steps: Array<{ animation: string; counts: number[] }>;
  census: SteppedCensusRow;
}

/** The census's bone fields, in the order its table prints them. */
export const CENSUS_FIELDS = ['length', 'scaleX', 'scaleY', 'shearX', 'shearY', 'skinRequired', 'negativeScale', 'rotation360', 'reflectingParent'] as const;
export type CensusField = (typeof CENSUS_FIELDS)[number];

export interface CensusRow {
  bones: number;
  modes: Record<(typeof CORE_INHERIT_MODES)[number], number>;
  fields: Record<CensusField, number>;
}

/** The slots' census fields, in the order its table prints them — the header's list. */
export const SLOT_CENSUS_FIELDS = [
  'secondSkin', 'multiFilled', 'conflicting', 'nullSetup', 'unfilled', 'colour', 'colour6', 'dark', 'dark8', 'blendNormal', 'blendAdditive', 'blendMultiply', 'blendScreen',
  'nameDiffers', 'pathDiffers', 'region', 'mesh', 'linkedmesh', 'boundingbox', 'clipping', 'path', 'inactiveBone', 'sliderKeysSlot',
] as const;
export type SlotCensusField = (typeof SLOT_CENSUS_FIELDS)[number];
export type SlotCensusRow = Record<SlotCensusField, number> & { slots: number };

/**
 * The attachments' census fields (issue #931), each a count of slots shown at
 * setup, in the order its table prints them — the header's list.
 */
export const ATTACHMENT_CENSUS_FIELDS = [
  'weightedMesh', 'multiBoneMesh', 'skewedBinding', 'linkedMesh', 'trimmedRegion', 'scaledOrTurnedRegion', 'mirroredRegion', 'sequenceRegion', 'nullAtlas',
  'clipping', 'clipEnd', 'boundingbox', 'path',
] as const;
export type AttachmentCensusField = (typeof ATTACHMENT_CENSUS_FIELDS)[number];
export type AttachmentCensusRow = Record<AttachmentCensusField, number>;

/**
 * The constraints' census fields (issue #938), in the order its table prints
 * them: the ik and transform constraints and what they state, their
 * timelines, and the order effects — a constraint whose target or source is
 * a bone an earlier constraint moved or placed below one, and a bone a
 * world-space transform moved that a later constraint re-poses. Each a count
 * of constraints (or timelines), over the document.
 */
export const CONSTRAINT_CENSUS_FIELDS = [
  'ik', 'ik.oneBone', 'ik.twoBone', 'ik.mixPartial', 'ik.mixZero', 'ik.softness', 'ik.bendNegative', 'ik.compress', 'ik.stretch', 'ik.scaleYUniform', 'ik.scaleYVolume', 'ik.nonNormal', 'ik.nonUniformParent', 'ik.childOffsetY',
  'transform', ...TRANSFORM_PROPERTIES.map((p) => `transform.${p}`), 'transform.crossMapping', 'transform.localSource', 'transform.localTarget', 'transform.additive', 'transform.clamp',
  'transform.fromOffset', 'transform.toOffset', 'transform.toScale', 'transform.offsets', 'transform.mixNegative', 'transform.mixPartial', 'transform.nonNormal',
  'ik.timeline', 'ik.timelineBezier', 'ik.timelineFlags', 'ik.timelineMixPartial', 'ik.timelineSoftness', 'transform.timeline', 'transform.timelineBezier',
  'order.readsMoved', 'order.worldEditReposed', 'skin',
  'physics', 'physics.timeline',
  'slider', 'slider.boneLocal', 'slider.boneWorld', 'slider.boneless', 'slider.additive', 'slider.mixPartial', 'slider.loop', 'slider.keysBone', 'slider.keysSlot', 'slider.timeline',
  'later',
] as const;
export type ConstraintCensusField = (typeof CONSTRAINT_CENSUS_FIELDS)[number];
export type ConstraintCensusRow = Record<ConstraintCensusField, number>;

/**
 * The path constraints' census fields (issue #938, second cut), in the order
 * its table prints them: the constraints and every mode and setting the walk
 * reads, the curve each walks (open or closed, measured at constant speed or
 * off its stated `lengths`, weighted), a percent position beyond an open
 * path's ends (the walk's straight-line extension), which slot bone the
 * offset reads (brought up to date by an earlier constraint's ordering, or
 * the previous pose's), a slot showing no path at setup, and the three
 * timelines. Each a count of path constraints (or timelines), over the
 * document.
 */
export const PATH_CENSUS_FIELDS = [
  'path', 'path.oneBone', 'path.severalBones', 'path.positionFixed', 'path.positionPercent',
  'path.spacingLength', 'path.spacingFixed', 'path.spacingPercent', 'path.spacingProportional', 'path.spacingNegative',
  'path.tangent', 'path.chain', 'path.chainScale', 'path.offsetRotation', 'path.mixPartial', 'path.mixZero',
  'path.open', 'path.closed', 'path.constantSpeed', 'path.statedLengths', 'path.weighted', 'path.beyondEnds',
  'path.slotBoneEarlier', 'path.slotBonePrevious', 'path.noPathShown', 'path.afterConstraint',
  'path.timelinePosition', 'path.timelineSpacing', 'path.timelineMix', 'path.timelineBezier',
] as const;
export type PathCensusField = (typeof PATH_CENSUS_FIELDS)[number];
export type PathCensusRow = Record<PathCensusField, number>;

/** The blocks the core poses, each judged on its own, in the document's order. */
export const GATE_BLOCKS = [
  'setup.bones', 'setup.slots', 'setup.drawOrder', 'setup.attachments', 'setup.clips', 'setup.clipped', 'setup.uvs',
  'animations.bones', 'animations.slots', 'animations.drawOrder', 'animations.attachments', 'animations.clips', 'animations.clipped', 'animations.uvs', 'animations.events',
] as const;
export type GateBlock = (typeof GATE_BLOCKS)[number];

/**
 * The animations' census fields (issue #936), in the order its table prints
 * them: timelines of each bone and slot kind, keys by the curve that leaves
 * them (`linear`, `stepped`, `bezier`, for bones and for slots), the sample
 * times of the gate's options that fall before a timeline's first key and
 * after its last, a bone keyed by two timelines that pose one channel
 * (`translate` and `translatex`, …) — and, since issue #955, construct 4's
 * remainder per kind: deform timelines (weighted, on a path, on a clipping
 * polygon, played by a linked mesh; keys left by a Bézier or a hold; runs
 * that start past 0 or stop short; keys with no run; in a slider's
 * animation), sequence timelines (on a region; in a slider's animation),
 * draw-order timelines (keys restoring the setup order; in a slider's
 * animation), event timelines, and event keys or definitions stating a
 * payload.
 */
export const ANIMATION_CENSUS_FIELDS = [
  ...BONE_TIMELINE_KINDS.map((k) => `bone.${k}`),
  ...SLOT_TIMELINE_KINDS.map((k) => `slot.${k}`),
  'bone.linear', 'bone.stepped', 'bone.bezier', 'slot.linear', 'slot.stepped', 'slot.bezier',
  'beforeFirstKey', 'afterLastKey', 'overlappingBoneChannels',
  'deform', 'deformWeighted', 'deformPath', 'deformClipping', 'deformLinked', 'deformBezier', 'deformStepped', 'deformPartialRun', 'deformEmptyKey', 'deformSlider',
  'sequence', 'sequenceRegion', 'sequenceSlider', 'drawOrder', 'drawOrderEmpty', 'drawOrderSlider', 'events', 'eventPayload',
] as const;

/**
 * The block each field of construct 4's remainder (issue #955) is judged on:
 * a deform moves the attachments' vertices (a clipping polygon's the clips,
 * a walked path's the bones), a slider's deform, frame and order the setup's
 * as well; a sequence reaches the dump only through a region's corners.
 */
export const REMAINDER_CENSUS_BLOCKS: Readonly<Record<string, GateBlock>> = {
  deform: 'animations.attachments', deformWeighted: 'animations.attachments', deformPath: 'animations.bones', deformClipping: 'animations.clips', deformLinked: 'animations.attachments',
  deformBezier: 'animations.attachments', deformStepped: 'animations.attachments', deformPartialRun: 'animations.attachments', deformEmptyKey: 'animations.attachments', deformSlider: 'setup.attachments',
  sequence: 'animations.attachments', sequenceRegion: 'animations.attachments', sequenceSlider: 'setup.attachments',
  drawOrder: 'animations.drawOrder', drawOrderEmpty: 'animations.drawOrder', drawOrderSlider: 'setup.drawOrder', events: 'animations.events', eventPayload: 'animations.events',
};
export type AnimationCensusField = (typeof ANIMATION_CENSUS_FIELDS)[number];
export type AnimationCensusRow = Record<AnimationCensusField, number> & { animations: number };

/** One animation's verdict on each animation block. */
export interface AnimationVerdict {
  name: string;
  bones: BlockVerdict;
  slots: BlockVerdict;
  drawOrder: BlockVerdict;
  attachments: BlockVerdict;
  clips: BlockVerdict;
  clipped: BlockVerdict;
  uvs: BlockVerdict;
  events: BlockVerdict;
  /** The first difference, on a DIFF. */
  why: string | null;
}

/** An animation's verdicts before any block is judged: every block SKIP. */
const unjudged = (name: string): AnimationVerdict => ({ name, bones: 'SKIP', slots: 'SKIP', drawOrder: 'SKIP', attachments: 'SKIP', clips: 'SKIP', clipped: 'SKIP', uvs: 'SKIP', events: 'SKIP', why: null });

export type GateVerdict = 'IDENTICAL' | 'SKIP' | 'DIFF' | 'REFUSED';
export type BlockVerdict = 'IDENTICAL' | 'SKIP' | 'DIFF';

export interface GateRow {
  name: string;
  verdict: GateVerdict;
  /** Why: the SKIP's constructs, the DIFF's first difference, the REFUSED's cause; null on IDENTICAL. */
  why: string | null;
  /** Each posed block's own verdict and why; null on a REFUSED row. */
  blocks: Record<GateBlock, { verdict: BlockVerdict; why: string | null; worst?: number }> | null;
  /** Bone-samples `compare` compared (the setup pose's bones, when carried). */
  boneSamples: number;
  /** Slot rows compared (the setup pose's slots, when carried). */
  slotRows: number;
  worstXy: number;
  worstM: number;
  census: CensusRow | null;
  slotCensus: SlotCensusRow | null;
  /** Per animation, each animation block's verdict; empty on a REFUSED row. */
  animations: AnimationVerdict[];
  animationCensus: AnimationCensusRow | null;
  /** Attachment rows and vertices compared (the setup pose's attachments and clips, when carried). */
  attachmentRows: number;
  vertices: number;
  attachmentCensus: AttachmentCensusRow | null;
  constraintCensus: ConstraintCensusRow | null;
  pathCensus: PathCensusRow | null;
  /** The stepped run (issue #956); absent on a REFUSED row. */
  stepped?: SteppedRow;
  /** What the spine-core dump draws under a clip (issue #964); absent on a REFUSED row. */
  clippedCensus?: ClippedCensusRow;
  /** What the drawn attachments' page UVs reach (issue #967); absent on a REFUSED row. */
  uvCensus?: UvCensusRow;
  /** One run per declared skin (issue #932) on a row declaring several; empty on a row declaring one or none, absent on a REFUSED row. */
  perSkin?: SkinRun[];
}

/**
 * One skin's run of a row declaring several (issue #932): both dumps under
 * `--skin <name>`, each posed block judged alone as the merged run's are, and
 * the stepped run under the same skin.
 */
export interface SkinRun {
  skin: string;
  verdict: BlockVerdict;
  /** The DIFF's first difference, or the SKIP's blocks; null on IDENTICAL. */
  why: string | null;
  blocks: Record<GateBlock, { verdict: BlockVerdict; why: string | null; worst?: number }>;
  /** Per animation, each animation block's verdict under this skin. */
  animations: AnimationVerdict[];
  stepped: SteppedRow;
}

/**
 * The clipping census's fields (issue #964), each a count of rows of the
 * spine-core dump's `clipped` blocks — the setup and every sample: a slot
 * drawn under a clip, one the clipper left whole (`clipped` 0), one it cut,
 * and one it cut away entirely (no triangle left).
 */
export const CLIPPED_CENSUS_FIELDS = ['drawn', 'whole', 'cut', 'gone'] as const;
export type ClippedCensusRow = Record<(typeof CLIPPED_CENSUS_FIELDS)[number], number>;

/** The clipping census of one spine-core dump. */
export function clippedCensusOf(spine: OracleDocument): ClippedCensusRow {
  const out: ClippedCensusRow = { drawn: 0, whole: 0, cut: 0, gone: 0 };
  const poses = [spine.setup.clipped ?? [], ...(spine.animations ?? []).flatMap((a) => a.samples.map((x) => x.clipped ?? []))];
  for (const rows of poses) {
    for (const r of rows) {
      out.drawn++;
      if (r[2] === 0) out.whole++;
      else if (r[5].length === 0) out.gone++;
      else out.cut++;
    }
  }
  return out;
}

/**
 * One line per row drawing under a clip, then each field REACHed by a row
 * whose `animations.clipped` (or, with no animation, `setup.clipped`) was
 * compared, or a HOLE.
 */
export function clippedReachLines(rows: readonly GateRow[]): string[] {
  const out: string[] = [];
  for (const r of rows) {
    const c = r.clippedCensus;
    if (c === undefined || c.drawn === 0) continue;
    out.push(`  CLIP  ${r.name}: ${CLIPPED_CENSUS_FIELDS.map((f) => `${f} ${c[f]}`).join(', ')} — setup.clipped ${r.blocks?.['setup.clipped'].verdict}, animations.clipped ${r.blocks?.['animations.clipped'].verdict}`);
  }
  const judged = rows.filter((r) => r.blocks !== null && r.blocks['setup.clipped'].verdict === 'IDENTICAL' && r.blocks['animations.clipped'].verdict === 'IDENTICAL');
  for (const f of CLIPPED_CENSUS_FIELDS) {
    const on = judged.filter((r) => (r.clippedCensus?.[f] ?? 0) > 0).map((r) => r.name);
    out.push(on.length > 0 ? `  REACH clipped ${f}: ${on.join(', ')}` : `  HOLE  clipped ${f}: no compared row reaches it — the core suite's CL probes are its only reading`);
  }
  return out;
}

/** The page UVs judge at tolerance 0 (issue #967). */
export const UV_TOL = { xy: 0, m: 0 };

/**
 * The page UVs' census fields (issue #967), each a count of drawn rows — the
 * setup pose's and every sample's, as the core resolves them
 * (`drawnRegions` in `src/core/uvs.ts`): a region, a mesh, a linked mesh; a
 * region on the page at `rotate` 90, 180, 270 or another value; a trimmed one
 * (offsets other than 0 or an original size other than the kept one); one of
 * a series; one whose region name is not the attachment's (a `path`) — and
 * `pages`, the number of pages drawn from when it is two or more (0 on a row
 * drawing from one).
 */
export const UV_CENSUS_FIELDS = ['region', 'mesh', 'linkedmesh', 'rotate90', 'rotate180', 'rotate270', 'rotateOther', 'trimmed', 'sequence', 'pathDiffers', 'pages'] as const;
export type UvCensusRow = Record<(typeof UV_CENSUS_FIELDS)[number], number>;

/** Every drawn row the core resolves to an atlas region — the setup pose's and every sample's under `options`, as `drawnRegions` in `src/core/uvs.ts` resolves them; a pose the core leaves out contributes none. */
export function uvDrawnOf(doc: CompiledDocument, uv: UvSource, options: OracleOptions): DrawnRegion[] {
  const order = doc.slots.map((s) => s.name);
  const poses = [shownAtSetup(doc), ...doc.animations.flatMap((a) => Array.from({ length: options.samples }, (_v, i) => shownAtSample(doc, a, sampleTime(options.phase, a.timelines.duration, i, options.samples))))];
  return poses.flatMap((pose) => (pose.why.length > 0 ? [] : (drawnRegions(doc, pose.shown, order, uv).drawn ?? [])));
}

/** The page-UV census of one model and its atlas, under `options`' samples. */
export function uvCensusOf(doc: CompiledDocument, uv: UvSource, options: OracleOptions): UvCensusRow {
  const out: UvCensusRow = { region: 0, mesh: 0, linkedmesh: 0, rotate90: 0, rotate180: 0, rotate270: 0, rotateOther: 0, trimmed: 0, sequence: 0, pathDiffers: 0, pages: 0 };
  const pages = new Set<string>();
  for (const d of uvDrawnOf(doc, uv, options)) {
    out[d.kind]++;
    const g = d.found.region;
    if (g.degrees === 90) out.rotate90++;
    else if (g.degrees === 180) out.rotate180++;
    else if (g.degrees === 270) out.rotate270++;
    else if (g.degrees !== 0) out.rotateOther++;
    if (isTrimmed(g)) out.trimmed++;
    if (d.frame !== null) out.sequence++;
    if (d.region !== d.name) out.pathDiffers++;
    pages.add(d.found.page.name);
  }
  out.pages = pages.size >= 2 ? pages.size : 0;
  return out;
}

/** A region whose atlas kept less than the drawing: offsets other than 0, or an original size other than the kept one. */
export function isTrimmed(g: { offsetX: number; offsetY: number; width: number; height: number; originalWidth: number; originalHeight: number }): boolean {
  return g.offsetX !== 0 || g.offsetY !== 0 || g.originalWidth !== g.width || g.originalHeight !== g.height;
}

/** One line per row drawing a region or a mesh, then each field REACHed by a row whose both `uvs` blocks read IDENTICAL, or a HOLE. */
export function uvReachLines(rows: readonly GateRow[]): string[] {
  const out: string[] = [];
  for (const r of rows) {
    const c = r.uvCensus;
    if (c === undefined) continue;
    out.push(`  UVS   ${r.name}: ${UV_CENSUS_FIELDS.map((f) => `${f} ${c[f]}`).join(', ')} — setup.uvs ${r.blocks?.['setup.uvs'].verdict}, animations.uvs ${r.blocks?.['animations.uvs'].verdict}`);
  }
  const judged = rows.filter((r) => r.blocks !== null && r.blocks['setup.uvs'].verdict === 'IDENTICAL' && r.blocks['animations.uvs'].verdict === 'IDENTICAL');
  for (const f of UV_CENSUS_FIELDS) {
    const on = judged.filter((r) => (r.uvCensus?.[f] ?? 0) > 0).map((r) => r.name);
    out.push(on.length > 0 ? `  REACH uvs ${f}: ${on.join(', ')}` : `  HOLE  uvs ${f}: no compared row reaches it — the core suite's CU probes are its only reading`);
  }
  return out;
}

/** A refusal about an input — the command exits 2 on it. */
export class GateInputError extends Error {}

/** The census of one model document, with reflection read off the spine-core setup pose. */
export function censusOf(modelText: string, reflecting: ReadonlySet<string>): CensusRow {
  const doc = readModel(modelText);
  const modes = Object.fromEntries(CORE_INHERIT_MODES.map((m) => [m, 0])) as CensusRow['modes'];
  const fields = Object.fromEntries(CENSUS_FIELDS.map((f) => [f, 0])) as CensusRow['fields'];
  for (const bone of doc.bones) {
    const mode = bone.inheritMode === undefined ? 'normal' : foldInheritMode(bone.inheritMode);
    if (mode !== null) modes[mode]++;
    for (const f of ['length', 'scaleX', 'scaleY', 'shearX', 'shearY'] as const) if (bone[f] !== undefined) fields[f]++;
    if (bone.skinRequired !== undefined) fields.skinRequired++;
    if ((bone.scaleX ?? 1) < 0 || (bone.scaleY ?? 1) < 0) fields.negativeScale++;
    if (Math.abs(bone.rotation ?? 0) >= 360) fields.rotation360++;
    if (bone.parent !== undefined && reflecting.has(bone.parent)) fields.reflectingParent++;
  }
  return { bones: doc.bones.length, modes, fields };
}

/**
 * The slots' census of one model document — the header's fields, each a count
 * of slots (of skins, for `secondSkin`: the skins after the first). What a
 * slot shows is resolved by the core's own rule (`shownAttachment`), so a
 * field counts what the block the core poses actually carries.
 */
export function slotCensusOf(modelText: string): SlotCensusRow {
  const doc = readModel(modelText);
  const out = { slots: doc.slots.length, ...Object.fromEntries(SLOT_CENSUS_FIELDS.map((f) => [f, 0])) } as SlotCensusRow;
  out.secondSkin = Math.max(0, doc.skins.length - 1);
  const active = activeBones(doc);
  for (const slot of doc.slots) {
    if (slot.setup === null) out.nullSetup++;
    else {
      const filling = doc.skins.filter((k) => k.attachments[slot.name]?.[slot.setup as string] !== undefined).length;
      if (filling === 0) out.unfilled++;
      if (filling > 1) out.multiFilled++;
    }
    if (slot.color !== undefined) out.colour++;
    if (slot.color !== undefined && slot.color.length === 6) out.colour6++;
    if (slot.dark !== undefined) out.dark++;
    if (slot.dark !== undefined && slot.dark.length === 8) out.dark8++;
    if (slot.blend !== undefined) out[`blend${readBlend(slot)}`]++;
    if (!active.has(slot.bone)) out.inactiveBone++;
    const shown = shownAttachment(doc, slot);
    if (shown === null) continue;
    if ('conflict' in shown) {
      out.conflicting++;
      continue;
    }
    const row = shownRow(shown);
    if (row.name !== shown.placeholder) out.nameDiffers++;
    if (shown.record.path !== undefined && shown.record.path !== row.name) out.pathDiffers++;
    out[shown.record.kind]++;
  }
  out.sliderKeysSlot = doc.constraints.filter((c) => c.kind === 'slider' && (doc.animations.find((a) => a.name === c.animation)?.slots.length ?? 0) > 0).length;
  return out;
}

/**
 * The animations' census of one model document — the fields of
 * `ANIMATION_CENSUS_FIELDS`, each a count over every animation; the
 * before/after counts over the gate's sample times (`options`).
 */
export function animationCensusOf(modelText: string, options: OracleOptions = GATE_OPTIONS): AnimationCensusRow {
  const doc = readModel(modelText);
  const out = { animations: doc.animations.length, ...Object.fromEntries(ANIMATION_CENSUS_FIELDS.map((f) => [f, 0])) } as AnimationCensusRow;
  const channelsOf: Record<string, string[]> = {
    translate: ['x', 'y'], translatex: ['x'], translatey: ['y'], scale: ['sx', 'sy'], scalex: ['sx'], scaley: ['sy'],
    shear: ['hx', 'hy'], shearx: ['hx'], sheary: ['hy'], rotate: ['r'], inherit: ['mode'],
  };
  for (const anim of doc.animations) {
    const tl = anim.timelines;
    const times = Array.from({ length: options.samples }, (_v, i) => sampleTime(options.phase, tl.duration, i, options.samples));
    const each = (group: 'bone' | 'slot', kind: string, keys: ReadonlyArray<{ time: number; curve: unknown }>): void => {
      out[`${group}.${kind}` as AnimationCensusField]++;
      keys.forEach((k, i) => {
        if (i === keys.length - 1 || kind === 'attachment' || kind === 'inherit') return;
        out[`${group}.${k.curve === 'linear' ? 'linear' : k.curve === 'stepped' ? 'stepped' : 'bezier'}` as AnimationCensusField]++;
      });
      out.beforeFirstKey += times.filter((t) => t < keys[0].time).length;
      out.afterLastKey += times.filter((t) => t > keys[keys.length - 1].time).length;
    };
    for (const b of tl.bones) {
      for (const x of b.timelines) each('bone', x.kind, x.keys);
      const channels = b.timelines.flatMap((x) => channelsOf[x.kind] ?? []);
      if (new Set(channels).size < channels.length) out.overlappingBoneChannels++;
    }
    for (const sl of tl.slots) for (const x of sl.timelines) each('slot', x.kind, x.keys);
    // Construct 4's remainder (issue #955): each deform and sequence timeline by what it keys, the draw order and the events.
    const sliding = doc.constraints.some((c) => c.kind === 'slider' && c.animation === anim.name);
    for (const a of tl.attachments) {
      const record = doc.skins.find((k) => k.name === a.skin)?.attachments[a.slot]?.[a.attachment];
      const g = record?.geometry;
      const keys = a.deform;
      if (keys !== null) {
        out.deform++;
        const vertices = g !== undefined && g.kind !== 'region' && g.kind !== 'linkedmesh' ? g.vertices : null;
        if (vertices?.weighted === true) out.deformWeighted++;
        if (g?.kind === 'path') out.deformPath++;
        if (g?.kind === 'clipping') out.deformClipping++;
        if (doc.skins.some((k) => Object.values(k.attachments).some((t) => Object.values(t).some((r) => r.geometry?.kind === 'linkedmesh' && r.timelines === true && r.geometry.skin === a.skin && r.geometry.slot === a.slot && r.geometry.source === a.attachment)))) out.deformLinked++;
        const length = vertices === null ? 0 : vertices.weighted ? 2 * vertices.bindings.reduce((n, b) => n + b.length, 0) : vertices.xy.length;
        keys.forEach((k, i) => {
          if (i < keys.length - 1 && Array.isArray(k.curve)) out.deformBezier++;
          if (i < keys.length - 1 && k.curve === 'stepped') out.deformStepped++;
          if (k.vertices.length === 0) out.deformEmptyKey++;
          else if (k.offset > 0 || k.vertices.length < length) out.deformPartialRun++;
        });
        if (sliding) out.deformSlider++;
      }
      if (a.sequence !== null) {
        out.sequence++;
        if (g?.kind === 'region') out.sequenceRegion++;
        if (sliding) out.sequenceSlider++;
      }
    }
    if (tl.drawOrder.length > 0) {
      out.drawOrder++;
      out.drawOrderEmpty += tl.drawOrder.filter((k) => k.moves.length === 0).length;
      if (sliding) out.drawOrderSlider++;
    }
    if (tl.events.length > 0) out.events++;
  }
  // An event key or definition stating a payload the row carries: the int, float or string a fired row reads.
  const raw = JSON.parse(modelText) as { events?: Array<Record<string, unknown>>; animations?: Array<{ events?: Array<Record<string, unknown>> }> };
  const payload = (e: Record<string, unknown>): boolean => e.int !== undefined || e.float !== undefined || e.string !== undefined;
  out.eventPayload = (raw.events ?? []).filter(payload).length + (raw.animations ?? []).reduce((n, a) => n + (a.events ?? []).filter(payload).length, 0);
  return out;
}

/**
 * The constraints' census of one model document (issue #938) — the fields of
 * `CONSTRAINT_CENSUS_FIELDS`. The physics fields count the constraints and
 * their timelines (posed under `Physics.none`, where they apply nothing); the
 * slider fields its forms — a dial read locally or in world space, or no dial —
 * its flags, what its animation keys and its timelines. A path constraint is
 * counted in the paths' census (`pathCensusOf`) and enters the order effects
 * here. `later` counts the constraints of the kinds no cut poses yet
 * (`ADMITTED_CONSTRAINT_KINDS`; since the path cut, none).
 */
export function constraintCensusOf(modelText: string): ConstraintCensusRow {
  const doc = readModel(modelText);
  const out = Object.fromEntries(CONSTRAINT_CENSUS_FIELDS.map((f) => [f, 0])) as ConstraintCensusRow;
  const byName = new Map(doc.bones.map((b) => [b.name, b]));
  const parentOf = (n: string): string | undefined => byName.get(n)?.parent;
  const under = (n: string, top: string): boolean => {
    for (let at: string | undefined = n; at !== undefined; at = parentOf(at)) if (at === top) return true;
    return false;
  };
  const nonNormal = (n: string): boolean => (byName.get(n)?.inheritMode ?? 'normal').toLowerCase() !== 'normal';
  const moved: string[] = [];
  const inWorld: string[] = [];
  for (const c of doc.constraints) {
    const r = c.record;
    if (r === undefined || !ADMITTED_CONSTRAINT_KINDS.includes(c.kind)) {
      out.later++;
      continue;
    }
    if (r.kind === 'path') {
      // Counted in the paths' census (`pathCensusOf`); a path moves its bones in world space, which later constraints read.
      moved.push(...r.bones);
      inWorld.push(...r.bones);
      continue;
    }
    if (r.skin) out.skin++;
    if (r.kind === 'physics') {
      out.physics++;
      continue;
    }
    if (r.kind === 'slider') {
      out.slider++;
      if (r.bone === null) out['slider.boneless']++;
      else out[r.local ? 'slider.boneLocal' : 'slider.boneWorld']++;
      if (r.additive) out['slider.additive']++;
      if (r.mix !== 0 && r.mix !== 1) out['slider.mixPartial']++;
      if (r.loop) out['slider.loop']++;
      if (r.timelines.bones.length > 0) out['slider.keysBone']++;
      if (r.timelines.slots.length > 0) out['slider.keysSlot']++;
      moved.push(...r.timelines.bones.map((b) => b.name));
      continue;
    }
    const read = r.kind === 'ik' ? r.target : r.source;
    if (moved.some((m) => under(read, m))) out['order.readsMoved']++;
    if (inWorld.some((w) => r.bones.some((b) => under(w, b) && w !== b))) out['order.worldEditReposed']++;
    moved.push(...r.bones);
    if (r.kind === 'ik') {
      out.ik++;
      out[r.bones.length === 1 ? 'ik.oneBone' : 'ik.twoBone']++;
      if (r.mix === 0) out['ik.mixZero']++;
      else if (r.mix !== 1) out['ik.mixPartial']++;
      if (r.softness !== 0) out['ik.softness']++;
      if (!r.bendPositive) out['ik.bendNegative']++;
      if (r.compress) out['ik.compress']++;
      if (r.stretch) out['ik.stretch']++;
      if (r.scaleY === 'uniform') out['ik.scaleYUniform']++;
      if (r.scaleY === 'volume') out['ik.scaleYVolume']++;
      if (r.bones.some(nonNormal)) out['ik.nonNormal']++;
      if (r.bones.length === 2) {
        const p = byName.get(r.bones[0]);
        if (p !== undefined && Math.abs(Math.abs(p.scaleX ?? 1) - Math.abs(p.scaleY ?? 1)) > 0.00001) out['ik.nonUniformParent']++;
        if ((byName.get(r.bones[1])?.y ?? 0) !== 0) out['ik.childOffsetY']++;
      }
      continue;
    }
    out.transform++;
    const driven = new Set(r.properties.flatMap((f) => f.to.map((t) => t.property)));
    for (const p of driven) out[`transform.${p}` as ConstraintCensusField]++;
    if (r.properties.some((f) => f.to.some((t) => t.property !== f.property))) out['transform.crossMapping']++;
    if (r.localSource) out['transform.localSource']++;
    if (r.localTarget) out['transform.localTarget']++;
    if (r.additive) out['transform.additive']++;
    if (r.clamp) out['transform.clamp']++;
    if (r.properties.some((f) => f.offset !== 0)) out['transform.fromOffset']++;
    if (r.properties.some((f) => f.to.some((t) => t.offset !== 0))) out['transform.toOffset']++;
    if (r.properties.some((f) => f.to.some((t) => t.scale !== 1))) out['transform.toScale']++;
    if (TRANSFORM_PROPERTIES.some((p) => r.offsets[p] !== 0)) out['transform.offsets']++;
    if ([...driven].some((p) => r.mixes[p] < 0)) out['transform.mixNegative']++;
    if ([...driven].some((p) => r.mixes[p] !== 0 && r.mixes[p] !== 1)) out['transform.mixPartial']++;
    if (r.bones.some(nonNormal)) out['transform.nonNormal']++;
    if (!r.localTarget) inWorld.push(...r.bones);
  }
  for (const a of doc.animations) {
    for (const tl of a.constraints.ik) {
      out['ik.timeline']++;
      if (tl.keys.some((k, i) => i < tl.keys.length - 1 && Array.isArray(k.curve))) out['ik.timelineBezier']++;
      if (tl.keys.some((k) => JSON.stringify(k.flags) !== JSON.stringify(tl.keys[0].flags))) out['ik.timelineFlags']++;
      if (tl.keys.some((k) => k.values[0] !== 0 && k.values[0] !== 1)) out['ik.timelineMixPartial']++;
      if (tl.keys.some((k) => k.values[1] !== 0)) out['ik.timelineSoftness']++;
    }
    for (const tl of a.constraints.transform) {
      out['transform.timeline']++;
      if (tl.keys.some((k, i) => i < tl.keys.length - 1 && Array.isArray(k.curve))) out['transform.timelineBezier']++;
    }
    out['physics.timeline'] += a.constraints.physics;
    for (const tl of a.constraints.slider) out['slider.timeline'] += (tl.time === null ? 0 : 1) + (tl.mix === null ? 0 : 1);
  }
  return out;
}

/**
 * The stepped phase's census of one model document (issue #956) — the
 * fields of `STEPPED_CENSUS_FIELDS`, read off the physics records and the
 * physics timelines.
 */
export function steppedCensusOf(modelText: string): SteppedCensusRow {
  const doc = readModel(modelText);
  const out = Object.fromEntries(STEPPED_CENSUS_FIELDS.map((f) => [f, 0])) as SteppedCensusRow;
  const records = doc.constraints.flatMap((c) => (c.record?.kind === 'physics' ? [c.record as CorePhysicsRecord] : []));
  const parentOf = new Map(doc.bones.map((b) => [b.name, b.parent]));
  const bones = new Set(records.map((r) => r.bone));
  const counted = new Set<string>();
  for (const r of records) {
    for (const f of ['x', 'y', 'rotate', 'scaleX', 'shearX'] as const) if (r[f] > 0) out[f]++;
    if ((['x', 'y', 'rotate', 'scaleX', 'shearX'] as const).some((f) => r[f] < 0)) out.componentNegative++;
    for (const f of ['inertia', 'strength', 'damping', 'wind', 'gravity', 'mix', 'limit'] as const) if (r[f] !== PHYSICS_DEFAULTS[f]) out[f]++;
    if (r.massInverse !== 1 / PHYSICS_DEFAULTS.mass) out.mass++;
    if (r.step !== 1 / PHYSICS_DEFAULTS.fps) out.fps++;
    if (r.mix === 0) out.mixZero++;
    if (records.filter((q) => q.bone === r.bone).length > 1) out.sameBone++;
    for (let at = parentOf.get(r.bone); at !== undefined; at = parentOf.get(at)) {
      if (bones.has(at)) {
        out.chain++;
        break;
      }
    }
    if (r.skin) out.skin++;
  }
  for (const a of doc.animations) {
    for (const tl of a.constraints.physicsKeyed ?? []) {
      out[`timeline.${tl.kind}` as SteppedCensusField]++;
      if (tl.name === EVERY_GLOBAL_PHYSICS) out['timeline.global']++;
      const key = `${a.name}/${tl.name}`;
      if (tl.kind === 'mix' && tl.keys.some((k) => k.values[0] === 0) && !counted.has(key)) {
        counted.add(key);
        out.mixZero++;
      }
    }
  }
  return out;
}

/**
 * The path constraints' census of one model document (issue #938, second
 * cut) — the fields of `PATH_CENSUS_FIELDS`. The slot bone's reading is the
 * core's own plan (`slotBonePlan`), under every skin at once.
 */
export function pathCensusOf(modelText: string): PathCensusRow {
  const doc = readModel(modelText);
  const out = Object.fromEntries(PATH_CENSUS_FIELDS.map((f) => [f, 0])) as PathCensusRow;
  const records = doc.constraints.flatMap((c) => (c.record === undefined ? [] : [c.record]));
  const active = activeBones(doc);
  const skipped = new Set(records.flatMap((r, i) => (r.skin && !r.listedBySkin ? [i] : [])));
  const plan = slotBonePlan(doc.bones, active, records, skipped);
  const byName = new Map(doc.bones.map((b) => [b.name, b]));
  const under = (n: string, top: string): boolean => {
    for (let at: string | undefined = n; at !== undefined; at = byName.get(at)?.parent) if (at === top) return true;
    return false;
  };
  records.forEach((r, i) => {
    if (r.kind !== 'path') return;
    const c: CorePathRecord = r;
    out.path++;
    out[c.bones.length === 1 ? 'path.oneBone' : 'path.severalBones']++;
    out[c.positionMode === 'fixed' ? 'path.positionFixed' : 'path.positionPercent']++;
    out[({ length: 'path.spacingLength', fixed: 'path.spacingFixed', percent: 'path.spacingPercent', proportional: 'path.spacingProportional' } as const)[c.spacingMode]]++;
    if (c.spacing < 0) out['path.spacingNegative']++;
    out[({ tangent: 'path.tangent', chain: 'path.chain', chainScale: 'path.chainScale' } as const)[c.rotateMode]]++;
    if (c.offsetRotation !== 0) out['path.offsetRotation']++;
    const mixes = [c.mixRotate, c.mixX, c.mixY];
    if (mixes.some((m) => m !== 0 && m !== 1)) out['path.mixPartial']++;
    if (mixes.some((m) => m === 0)) out['path.mixZero']++;
    const g = c.path;
    if (g === null) out['path.noPathShown']++;
    else {
      out[g.closed ? 'path.closed' : 'path.open']++;
      out[g.constantSpeed ? 'path.constantSpeed' : 'path.statedLengths']++;
      if (g.vertices.weighted) out['path.weighted']++;
      const keyed = doc.animations.flatMap((a) => a.constraints.path.filter((t) => t.name === c.name).flatMap((t) => (t.position ?? []).map((k) => k.values[0])));
      if (!g.closed && c.positionMode === 'percent' && [c.position, ...keyed].some((v) => v < 0 || v > 1)) out['path.beyondEnds']++;
    }
    const e = plan.get(i) ?? null;
    if (c.offsetRotation !== 0 && e === null) out['path.slotBonePrevious']++;
    else if (c.offsetRotation !== 0 && e !== null && e.at !== i) out['path.slotBoneEarlier']++;
    const reads = [...c.slotDeps, c.slotBone];
    // What an earlier constraint moves: a physics constraint nothing under Physics.none, a slider the bones its animation keys.
    const movedBy = (q: CoreConstraintRecord): readonly string[] => (q.kind === 'physics' ? [] : q.kind === 'slider' ? q.timelines.bones.map((b) => b.name) : q.bones);
    if (records.slice(0, i).some((q, j) => !skipped.has(j) && movedBy(q).some((b) => reads.some((x) => under(x, b))))) out['path.afterConstraint']++;
  });
  for (const a of doc.animations) {
    for (const t of a.constraints.path) {
      if (t.position !== undefined) out['path.timelinePosition']++;
      if (t.spacing !== undefined) out['path.timelineSpacing']++;
      if (t.mix !== undefined) out['path.timelineMix']++;
      if ([t.position, t.spacing, t.mix].some((keys) => keys?.some((k, i) => i < keys.length - 1 && Array.isArray(k.curve)))) out['path.timelineBezier']++;
    }
  }
  return out;
}

/**
 * The attachments' census of one model document (issue #931) — the header's
 * fields, each a count of slots whose setup attachment (resolved by the core's
 * own `shownAttachment`) has it. `reflecting` and `sheared` are the bones
 * whose setup world matrix reflects (determinant below 0) or shears (columns
 * not at right angles), read off the spine-core dump.
 */
export function attachmentCensusOf(modelText: string, reflecting: ReadonlySet<string>, sheared: ReadonlySet<string>): AttachmentCensusRow {
  const doc = readModel(modelText);
  const out = Object.fromEntries(ATTACHMENT_CENSUS_FIELDS.map((f) => [f, 0])) as AttachmentCensusRow;
  const skewed = (bone: string): boolean => reflecting.has(bone) || sheared.has(bone);
  for (const slot of doc.slots) {
    const shown = shownAttachment(doc, slot);
    if (shown === null || 'conflict' in shown) continue;
    const g = shown.record.geometry;
    if (g === undefined) continue;
    if (g.kind === 'boundingbox' || g.kind === 'path') out[g.kind]++;
    if (g.kind === 'region') {
      const r = g.region;
      if (r.atlas === null) out.nullAtlas++;
      else if (r.atlas.offsetX !== 0 || r.atlas.offsetY !== 0 || r.atlas.width !== r.atlas.originalWidth || r.atlas.height !== r.atlas.originalHeight) out.trimmedRegion++;
      if ((r.scaleX ?? 1) !== 1 || (r.scaleY ?? 1) !== 1 || (r.rotation ?? 0) !== 0) out.scaledOrTurnedRegion++;
      if ((r.scaleX ?? 1) < 0 || (r.scaleY ?? 1) < 0 || reflecting.has(slot.bone)) out.mirroredRegion++;
      if (isSequence(modelText, shown.skin, slot.name, shown.placeholder)) out.sequenceRegion++;
    }
    let vertices = g.kind === 'mesh' || g.kind === 'clipping' ? g.vertices : null;
    if (g.kind === 'linkedmesh') {
      out.linkedMesh++;
      const source = doc.skins.find((k) => k.name === g.skin)?.attachments[g.slot]?.[g.source]?.geometry;
      vertices = source?.kind === 'mesh' ? source.vertices : null;
    }
    if (g.kind === 'clipping') {
      out.clipping++;
      if (g.end !== null) out.clipEnd++;
    }
    if (vertices === null || g.kind === 'clipping') continue;
    const bones = vertices.weighted ? [...new Set(vertices.bindings.flatMap((v) => v.map((b) => b.bone)))] : [slot.bone];
    if (vertices.weighted) out.weightedMesh++;
    if (bones.length > 1) out.multiBoneMesh++;
    if (bones.some(skewed)) out.skewedBinding++;
  }
  return out;
}

/** Whether the record at skin/slot/placeholder states a `sequence` — read off the text, since the core keeps only the setup frame's rectangle. */
function isSequence(modelText: string, skin: string, slot: string, placeholder: string): boolean {
  const doc = JSON.parse(modelText) as { skins: Array<{ name: string; attachments: Record<string, Record<string, { sequence?: unknown }>> }> };
  return doc.skins.find((k) => k.name === skin)?.attachments[slot]?.[placeholder]?.sequence !== undefined;
}

/** The core's document with every posed block but `keep` left out — so a `compare` judges that block alone. */
function only(core: OracleDocument, keep: GateBlock): OracleDocument {
  const drop = GATE_BLOCKS.filter((b) => b !== keep);
  const absent = [...(core.absent ?? [])];
  const setup = { ...core.setup };
  let animations = core.animations;
  for (const block of drop) {
    if (block === 'setup.bones') setup.bones = null;
    else if (block === 'setup.slots') setup.slots = null;
    else if (block === 'setup.drawOrder') setup.drawOrder = null;
    else if (block === 'setup.attachments') setup.attachments = null;
    else if (block === 'setup.clips') setup.clips = null;
    else if (block === 'setup.clipped') setup.clipped = null;
    else if (block === 'setup.uvs') setup.uvs = null;
    else {
      const field = block.slice('animations.'.length);
      animations = (animations ?? []).map((a) => ({ ...a, samples: a.samples.map((x) => ({ ...x, [field]: null })) }));
    }
    if (!absent.some((x) => x[0] === block)) absent.push([block, 'left out by core_gate to judge another block alone']);
  }
  absent.sort((x, y) => ORACLE_BLOCKS.indexOf(x[0] as OracleBlock) - ORACLE_BLOCKS.indexOf(y[0] as OracleBlock));
  return { ...core, absent, setup, animations };
}

/**
 * The stepped run of one build (issue #956): both dumps again under
 * `STEPPED_OPTIONS`, the setup bones and the samples' bones each judged
 * alone — the physics parameter block with them — then the whole document
 * (every block the core writes, #955's among them), the `dt` both documents
 * state, and the steps the core's schedule takes between samples.
 */
export function steppedRun(skeletonText: string, atlasText: string, skeletonPath: string, modelText: string, modelPath: string, plant: TimelinePlant, tol: { xy: number; m: number }, skin: string = STEPPED_OPTIONS.skin, uvReading?: UvReading, raw = false, view?: SkinViewOf): SteppedRow {
  const options: OracleOptions = rawOptions({ ...STEPPED_OPTIONS, skin }, raw);
  const spine = dumpSkeleton(loadOracleData(skeletonText, atlasText, skeletonPath), options);
  const doc = readModel(modelText, modelPath);
  const core = coreDump(doc, options, plant, uvSourceOf(atlasText, modelText, uvReading), view);
  const census = steppedCensusOf(modelText);
  const dt = spine.options.dt === core.options.dt ? core.options.dt : null;
  const steps = doc.animations.map((a) => ({ animation: a.name, counts: stepSchedule(STEPPED_OPTIONS.phase, a.timelines.duration, STEPPED_OPTIONS.samples, STEPPED_OPTIONS.dt as number).map((x) => x.length) }));
  if (dt === null) return { verdict: 'DIFF', why: `the two documents state dt ${spine.options.dt} and ${core.options.dt}`, dt, boneSamples: 0, steps, census };
  const skipped: string[] = [];
  let boneSamples = 0;
  for (const block of ['setup.bones', 'animations.bones'] as const) {
    const why = core.absent?.find((x) => x[0] === block)?.[1];
    if (why !== undefined) {
      skipped.push(`${block}: ${why}`);
      continue;
    }
    const alone = compareDumps(spine, only(core, block), tol);
    if (!alone.identical) return { verdict: 'DIFF', why: `${block}: ${alone.first}`, dt, boneSamples, steps, census };
    boneSamples += alone.boneSamples;
  }
  // Every other block the core writes under the step (issue #955's attachments, clips, draw order and events among them) compared whole; a block the core leaves out is SKIP there, not a difference.
  const whole = compareDumps(spine, core, tol);
  if (!whole.identical) return { verdict: 'DIFF', why: `the whole document: ${whole.first}`, dt, boneSamples, steps, census };
  return skipped.length === 0 ? { verdict: 'IDENTICAL', why: null, dt, boneSamples, steps, census } : { verdict: 'SKIP', why: skipped.join(' | '), dt, boneSamples, steps, census };
}

/** One built row: both dumps, the comparisons — whole and per block — and the census. `plant` replaces a part of the core (a control's plant), `uvReading` a rejected page-UV reading (`src/core/uvs.ts`), `raw` every dump under `--raw` (issue #966). */
export function gateBuild(name: string, outDir: string, plant: TimelinePlant = {}, uvReading?: UvReading, raw = false): GateRow {
  const skeleton = join(outDir, 'skeleton.json');
  const atlas = join(outDir, 'skeleton.atlas');
  const model = join(outDir, MODEL_DOCUMENT_FILE);
  const missing = [skeleton, atlas, model].filter((p) => !existsSync(p));
  const refused = (why: string): GateRow => ({ name, verdict: 'REFUSED', why, blocks: null, boneSamples: 0, slotRows: 0, worstXy: 0, worstM: 0, census: null, slotCensus: null, attachmentRows: 0, vertices: 0, attachmentCensus: null, constraintCensus: null, pathCensus: null, animations: [], animationCensus: null });
  if (missing.length > 0) return refused(`the build wrote no ${missing.map((p) => p.slice(outDir.length + 1)).join(', ')}`);
  let c: OracleComparison;
  let census: CensusRow;
  let slotCensus: SlotCensusRow;
  let animationCensus: AnimationCensusRow;
  const blocks = {} as Record<GateBlock, { verdict: BlockVerdict; why: string | null; worst?: number }>;
  const perAnimation = new Map<string, AnimationVerdict>();
  let slotRows = 0;
  let attachmentCensus: AttachmentCensusRow;
  let constraintCensus: ConstraintCensusRow;
  let pathCensus: PathCensusRow;
  let stepped: SteppedRow;
  let attachmentRows = 0;
  let clippedCensus: ClippedCensusRow;
  let uvCensus: UvCensusRow;
  const perSkin: SkinRun[] = [];
  // What the per-skin runs compared, added to the merged run's figures.
  const extra = { boneSamples: 0, slotRows: 0, attachmentRows: 0, worstXy: 0, worstM: 0 };
  try {
    const spine = dumpSkeleton(loadOracleData(readFileSync(skeleton, 'utf8'), readFileSync(atlas, 'utf8'), skeleton), rawOptions(GATE_OPTIONS, raw));
    const modelText = readFileSync(model, 'utf8');
    const modelDoc = readModel(modelText, model);
    // The core's page UVs read the build's own atlas beside the model (issue #967): the model carries no page layout.
    const atlasText = readFileSync(atlas, 'utf8');
    const uv = uvSourceOf(atlasText, modelText, uvReading);
    const core = coreDump(modelDoc, rawOptions(GATE_OPTIONS, raw), plant, uv);
    const tol = raw ? RAW_TOLERANCE : { xy: ORACLE_DEFAULT_TOL, m: ORACLE_DEFAULT_TOL };
    c = compareDumps(spine, core, tol);
    clippedCensus = clippedCensusOf(spine);
    uvCensus = uvCensusOf(modelDoc, uvSourceOf(atlasText, modelText), GATE_OPTIONS);
    const judged = judgeBlocks(spine, core, tol);
    Object.assign(blocks, judged.blocks);
    for (const [k, v] of judged.animations) perAnimation.set(k, v);
    // A row declaring several skins is posed once per skin as well (issue #932): the merged view is an artefact of the instrument, each skin a state a runtime is in.
    if (modelDoc.skins.length > 1) {
      for (const k of modelDoc.skins) {
        const options: OracleOptions = rawOptions({ ...GATE_OPTIONS, skin: k.name }, raw);
        const spineK = dumpSkeleton(loadOracleData(readFileSync(skeleton, 'utf8'), readFileSync(atlas, 'utf8'), skeleton), options);
        const coreK = coreDump(modelDoc, options, plant, uv);
        const whole = compareDumps(spineK, coreK, tol);
        const j = judgeBlocks(spineK, coreK, tol);
        const skippedK = GATE_BLOCKS.filter((b) => j.blocks[b].verdict === 'SKIP');
        extra.boneSamples += whole.boneSamples;
        extra.worstXy = Math.max(extra.worstXy, whole.worstXy);
        extra.worstM = Math.max(extra.worstM, whole.worstM);
        if (j.blocks['setup.slots'].verdict !== 'SKIP') extra.slotRows += coreK.setup.slots?.length ?? 0;
        if (j.blocks['setup.attachments'].verdict !== 'SKIP') extra.attachmentRows += coreK.setup.attachments?.length ?? 0;
        if (j.blocks['setup.clips'].verdict !== 'SKIP') extra.attachmentRows += coreK.setup.clips?.length ?? 0;
        const steppedK = steppedRun(readFileSync(skeleton, 'utf8'), atlasText, skeleton, modelText, model, plant, tol, k.name, uvReading, raw);
        perSkin.push({
          skin: k.name,
          verdict: !whole.identical ? 'DIFF' : skippedK.length > 0 ? 'SKIP' : 'IDENTICAL',
          why: !whole.identical ? whole.first : skippedK.length > 0 ? skippedK.map((b) => `${b}: ${j.blocks[b].why}`).join(' | ') : null,
          blocks: j.blocks,
          animations: [...j.animations.values()],
          stepped: steppedK,
        });
      }
      promotePerSkin(blocks, perAnimation, perSkin);
    }
    if (core.setup.slots !== null) slotRows = core.setup.slots.length;
    attachmentRows = (core.setup.attachments?.length ?? 0) + (core.setup.clips?.length ?? 0);
    const reflecting = new Set(spine.setup.bones.filter((b) => b[3] !== null && b[4] !== null && b[5] !== null && b[6] !== null && b[3] * b[6] - b[4] * b[5] < 0).map((b) => b[0]));
    census = censusOf(modelText, reflecting);
    slotCensus = slotCensusOf(modelText);
    animationCensus = animationCensusOf(modelText);
    const sheared = new Set(spine.setup.bones.filter((b) => b[3] !== null && b[4] !== null && b[5] !== null && b[6] !== null && Math.abs(b[3] * b[4] + b[5] * b[6]) > 1e-6).map((b) => b[0]));
    attachmentCensus = attachmentCensusOf(modelText, reflecting, sheared);
    constraintCensus = constraintCensusOf(modelText);
    pathCensus = pathCensusOf(modelText);
    stepped = steppedRun(readFileSync(skeleton, 'utf8'), atlasText, skeleton, modelText, model, plant, tol, STEPPED_OPTIONS.skin, uvReading, raw);
  } catch (err) {
    if (err instanceof OracleInputError || err instanceof CoreInputError) return refused(err.message);
    throw err;
  }
  const animations = [...perAnimation.values()];
  const setupRow = c.rows.find((x) => x.name === '(setup)');
  const base = {
    name, blocks, boneSamples: c.boneSamples + extra.boneSamples, slotRows: slotRows + extra.slotRows, worstXy: Math.max(c.worstXy, extra.worstXy), worstM: Math.max(c.worstM, extra.worstM), census, slotCensus,
    attachmentRows: attachmentRows + extra.attachmentRows, vertices: setupRow?.vertices ?? 0, attachmentCensus, constraintCensus, pathCensus, animations, animationCensus, stepped: combineStepped(stepped, perSkin), clippedCensus, uvCensus, perSkin,
  };
  if (!c.identical) return { ...base, verdict: 'DIFF', why: c.first };
  const redSkin = perSkin.find((k) => k.verdict === 'DIFF');
  if (redSkin !== undefined) return { ...base, verdict: 'DIFF', why: `--skin ${JSON.stringify(redSkin.skin)}: ${redSkin.why}` };
  const skipped = GATE_BLOCKS.filter((b) => blocks[b].verdict === 'SKIP');
  if (skipped.length > 0) return { ...base, verdict: 'SKIP', why: skipped.map((b) => `${b}: ${blocks[b].why}`).join(' | ') };
  return { ...base, verdict: 'IDENTICAL', why: null };
}

/** Each posed block of one pair of dumps judged alone — the core's side with every other posed block left out — and each animation's verdict on each sample block. */
function judgeBlocks(spine: OracleDocument, core: OracleDocument, tol: { xy: number; m: number }): { blocks: Record<GateBlock, { verdict: BlockVerdict; why: string | null; worst?: number }>; animations: Map<string, AnimationVerdict> } {
  const blocks = {} as Record<GateBlock, { verdict: BlockVerdict; why: string | null; worst?: number }>;
  const perAnimation = new Map<string, AnimationVerdict>();
  for (const block of GATE_BLOCKS) {
    const why = core.absent?.find((x) => x[0] === block)?.[1];
    if (why !== undefined) {
      blocks[block] = { verdict: 'SKIP', why };
      continue;
    }
    // The page UVs are judged at tolerance 0 on the grid (issue #967): a UV off by one grid step is a different texel on a page of 10⁶ or more.
    const alone = compareDumps(spine, only(core, block), block.endsWith('.uvs') ? UV_TOL : tol);
    const worst = Math.max(alone.worstXy, alone.worstM, alone.worstVertex);
    blocks[block] = alone.identical ? { verdict: 'IDENTICAL', why: null, worst } : { verdict: 'DIFF', why: alone.first, worst };
    if (block.startsWith('animations.')) {
      const field = block.slice('animations.'.length) as SampleField;
      for (const row of alone.rows) {
        if (row.name === '(setup)') continue;
        const v = perAnimation.get(row.name) ?? unjudged(row.name);
        const verdict: BlockVerdict = row.findings.length === 0 ? 'IDENTICAL' : 'DIFF';
        v[field] = verdict;
        if (verdict === 'DIFF' && v.why === null) v.why = row.findings[0];
        perAnimation.set(row.name, v);
      }
    }
  }
  for (const a of core.animations ?? []) if (!perAnimation.has(a.name)) perAnimation.set(a.name, unjudged(a.name));
  return { blocks, animations: perAnimation };
}

type SampleField = 'bones' | 'slots' | 'drawOrder' | 'attachments' | 'clips' | 'clipped' | 'uvs' | 'events';

/**
 * A block the merged run (`--skin all`) leaves out and EVERY per-skin run
 * poses is judged by the per-skin runs (issue #932): the merged view's
 * absence was then about merging — a placeholder several skins fill, whose
 * winner is the Spine file's skin order — and every state a runtime is
 * actually in was compared. It reads DIFF when any skin's does, else
 * IDENTICAL, and says it was judged per skin; each animation's verdict on a
 * sample block is taken the same way. A block some skin's run leaves out
 * too stays SKIP with the merged run's reason.
 */
function promotePerSkin(blocks: Record<GateBlock, { verdict: BlockVerdict; why: string | null; worst?: number }>, perAnimation: Map<string, AnimationVerdict>, runs: readonly SkinRun[]): void {
  for (const block of GATE_BLOCKS) {
    if (blocks[block].verdict !== 'SKIP' || runs.some((k) => k.blocks[block].verdict === 'SKIP')) continue;
    const red = runs.find((k) => k.blocks[block].verdict === 'DIFF');
    const judged = `judged per skin (${runs.map((k) => `${k.skin} ${k.blocks[block].verdict}`).join(', ')}); the merged view leaves it out — ${blocks[block].why}`;
    blocks[block] = red === undefined ? { verdict: 'IDENTICAL', why: judged } : { verdict: 'DIFF', why: `--skin ${JSON.stringify(red.skin)}: ${red.blocks[block].why}` };
    if (!block.startsWith('animations.')) continue;
    const field = block.slice('animations.'.length) as SampleField;
    for (const [name, v] of perAnimation) {
      const theirs = runs.map((k) => k.animations.find((a) => a.name === name));
      const diff = theirs.find((a) => a !== undefined && a[field] === 'DIFF');
      v[field] = diff !== undefined ? 'DIFF' : theirs.every((a) => a !== undefined && a[field] === 'IDENTICAL') ? 'IDENTICAL' : v[field];
      if (diff !== undefined && v.why === null) v.why = diff.why;
    }
  }
}

/**
 * The row's stepped verdict with its per-skin runs (issue #932): DIFF when any
 * skin's is; a merged SKIP every skin's run judged IDENTICAL reads IDENTICAL,
 * saying so; otherwise the merged run's.
 */
function combineStepped(merged: SteppedRow, runs: readonly SkinRun[]): SteppedRow {
  if (runs.length === 0) return merged;
  const red = runs.find((k) => k.stepped.verdict === 'DIFF');
  if (merged.verdict !== 'DIFF' && red !== undefined) return { ...merged, verdict: 'DIFF', why: `--skin ${JSON.stringify(red.skin)}: ${red.stepped.why}` };
  if (merged.verdict === 'SKIP' && runs.every((k) => k.stepped.verdict === 'IDENTICAL')) {
    return { ...merged, verdict: 'IDENTICAL', why: `judged per skin (${runs.map((k) => `${k.skin} IDENTICAL`).join(', ')}); the merged view leaves it out — ${merged.why}`, boneSamples: merged.boneSamples + runs.reduce((n, k) => n + k.stepped.boneSamples, 0) };
  }
  return merged;
}

/** One recipe built: its name, its `{{out}}` and the chain's exit codes. */
export interface BuiltRow {
  name: string;
  out: string;
  exits: Array<number | null>;
}

/** Every recipe built into `work` (`runRecipes`' layout), in name order. */
export function buildRecipes(recipes: readonly Recipe[], work: string, root: string, progress: (line: string) => void = () => {}): BuiltRow[] {
  const built = runRecipes(recipes, work, root, progress);
  const width = String(recipes.length).length;
  return built.recipes.map((r, i) => ({ name: r.name, out: join(work, String(i).padStart(width, '0'), 'out'), exits: r.exits }));
}

/** Built rows gated; `plant` replaces a part of the core on every row (a control's plant), `uvReading` a rejected page-UV reading, `raw` every dump under `--raw` (issue #966). */
export function gateBuilt(built: readonly BuiltRow[], plant: TimelinePlant = {}, uvReading?: UvReading, raw = false): GateRow[] {
  return built.map((r) =>
    r.exits.some((e) => e !== 0)
      ? { name: r.name, verdict: 'REFUSED' as const, why: `the build chain exited ${JSON.stringify(r.exits)}`, blocks: null, boneSamples: 0, slotRows: 0, worstXy: 0, worstM: 0, census: null, slotCensus: null, attachmentRows: 0, vertices: 0, attachmentCensus: null, constraintCensus: null, pathCensus: null, animations: [], animationCensus: null }
      : gateBuild(r.name, r.out, plant, uvReading, raw),
  );
}

/** Every recipe built into `work` and gated, in name order. */
export function gateRecipes(recipes: readonly Recipe[], work: string, root: string, progress: (line: string) => void = () => {}, plant: TimelinePlant = {}, raw = false): GateRow[] {
  return gateBuilt(buildRecipes(recipes, work, root, progress), plant, undefined, raw);
}

/** The census as a markdown table, one row per recipe, then the totals. */
export function censusTable(rows: readonly GateRow[]): string[] {
  const head = ['row', 'setup.bones', 'bones', ...CORE_INHERIT_MODES, ...CENSUS_FIELDS];
  const out = [`| ${head.join(' | ')} |`, `| ${head.map((_h, i) => (i < 2 ? '---' : '---:')).join(' | ')} |`];
  const total: number[] = new Array<number>(head.length - 2).fill(0);
  for (const row of rows) {
    const c = row.census;
    const cells = c === null ? head.slice(2).map(() => '—') : [c.bones, ...CORE_INHERIT_MODES.map((m) => c.modes[m]), ...CENSUS_FIELDS.map((f) => c.fields[f])].map(String);
    if (c !== null) [c.bones, ...CORE_INHERIT_MODES.map((m) => c.modes[m]), ...CENSUS_FIELDS.map((f) => c.fields[f])].forEach((v, i) => (total[i] += v));
    out.push(`| ${row.name} | ${row.blocks?.['setup.bones'].verdict ?? row.verdict} | ${cells.join(' | ')} |`);
  }
  out.push(`| **all** | | ${total.join(' | ')} |`);
  return out;
}

/** The slots' census as a markdown table, one row per recipe, then the totals. */
export function slotCensusTable(rows: readonly GateRow[]): string[] {
  const head = ['row', 'setup.slots', 'slots', ...SLOT_CENSUS_FIELDS];
  const out = [`| ${head.join(' | ')} |`, `| ${head.map((_h, i) => (i < 2 ? '---' : '---:')).join(' | ')} |`];
  const total: number[] = new Array<number>(head.length - 2).fill(0);
  for (const row of rows) {
    const c = row.slotCensus;
    const values = c === null ? null : [c.slots, ...SLOT_CENSUS_FIELDS.map((f) => c[f])];
    if (values !== null) values.forEach((v, i) => (total[i] += v));
    out.push(`| ${row.name} | ${row.blocks?.['setup.slots'].verdict ?? row.verdict} | ${(values ?? head.slice(2).map(() => '—')).map(String).join(' | ')} |`);
  }
  out.push(`| **all** | | ${total.join(' | ')} |`);
  return out;
}

/** The animations' census as a markdown table, one row per recipe, then the totals. */
export function animationCensusTable(rows: readonly GateRow[]): string[] {
  const head = ['row', 'animations.bones', 'animations.slots', 'animations', ...ANIMATION_CENSUS_FIELDS];
  const out = [`| ${head.join(' | ')} |`, `| ${head.map((_h, i) => (i < 3 ? '---' : '---:')).join(' | ')} |`];
  const total: number[] = new Array<number>(head.length - 3).fill(0);
  for (const row of rows) {
    const c = row.animationCensus;
    const values = c === null ? null : [c.animations, ...ANIMATION_CENSUS_FIELDS.map((f) => c[f])];
    if (values !== null) values.forEach((v, i) => (total[i] += v));
    out.push(`| ${row.name} | ${row.blocks?.['animations.bones'].verdict ?? row.verdict} | ${row.blocks?.['animations.slots'].verdict ?? row.verdict} | ${(values ?? head.slice(3).map(() => '—')).map(String).join(' | ')} |`);
  }
  out.push(`| **all** | | | ${total.join(' | ')} |`);
  return out;
}

/**
 * Each animation census field the compared rows reach — a bone field on a row
 * whose `animations.bones` was compared, a slot field on one whose
 * `animations.slots` was, a field of construct 4's remainder on one whose
 * block (`REMAINDER_CENSUS_BLOCKS`) was — and the HOLEs: what no compared row
 * reaches. Since issue #955 no timeline kind is left to a later construct.
 */
export function animationReachLines(rows: readonly GateRow[]): string[] {
  const out: string[] = [];
  for (const f of ANIMATION_CENSUS_FIELDS) {
    const block: GateBlock = REMAINDER_CENSUS_BLOCKS[f] ?? (f.startsWith('slot.') ? 'animations.slots' : 'animations.bones');
    const compared = comparedOn(rows, block);
    const on = compared.filter((r) => (r.animationCensus?.[f] ?? 0) > 0).map((r) => r.name);
    const anywhere = rows.filter((r) => (r.animationCensus?.[f] ?? 0) > 0).map((r) => r.name);
    const where = f in REMAINDER_CENSUS_BLOCKS ? ` (judged on ${block})` : '';
    out.push(on.length > 0 ? `  REACH animations ${f}: ${on.length} compared row(s)${where}` : `  HOLE  animations ${f}: no compared row reaches it${where}${anywhere.length > 0 ? ` (only ${anywhere.join(', ')}, which the core skips)` : ''}`);
  }
  return out;
}

/**
 * Per timeline kind of construct 4's remainder (issue #955) — deform,
 * sequence, draw order, events — the rows carrying one that are judged on
 * the block it changes, with their verdict, and those left SKIP, named: the
 * kind is admitted where every row carrying it reads IDENTICAL.
 */
export function timelineKindLines(rows: readonly GateRow[]): string[] {
  const out: string[] = [];
  for (const kind of ['deform', 'sequence', 'drawOrder', 'events'] as const) {
    const block = REMAINDER_CENSUS_BLOCKS[kind];
    const carrying = rows.filter((r) => (r.animationCensus?.[kind] ?? 0) > 0);
    const judged = carrying.filter((r) => r.blocks !== null && r.blocks[block].verdict !== 'SKIP');
    const skipped = carrying.filter((r) => !judged.includes(r));
    out.push(`  KIND  ${kind} (${block}): ${judged.length} row(s) judged${judged.length > 0 ? ` (${judged.map((r) => `${r.name} ${r.blocks?.[block].verdict}`).join(', ')})` : ''}; ${skipped.length} SKIP${skipped.length > 0 ? ` (${skipped.map((r) => r.name).join(', ')})` : ''}`);
  }
  return out;
}

/** The rows whose `block` was compared — IDENTICAL or DIFF on it. */
function comparedOn(rows: readonly GateRow[], block: GateBlock): GateRow[] {
  return rows.filter((r) => r.blocks !== null && r.blocks[block].verdict !== 'SKIP');
}

/** Each slot field the rows whose `setup.slots` was compared reach, and the HOLEs. */
export function slotReachLines(rows: readonly GateRow[]): string[] {
  const compared = comparedOn(rows, 'setup.slots');
  const out: string[] = [];
  for (const f of SLOT_CENSUS_FIELDS) {
    const on = compared.filter((r) => (r.slotCensus?.[f] ?? 0) > 0).map((r) => r.name);
    const anywhere = rows.filter((r) => (r.slotCensus?.[f] ?? 0) > 0).map((r) => r.name);
    out.push(on.length > 0 ? `  REACH slots ${f}: ${on.length} compared row(s)` : `  HOLE  slots ${f}: no compared row reaches it${anywhere.length > 0 ? ` (only ${anywhere.join(', ')}, which the core skips)` : ''}`);
  }
  return out;
}

/** The attachments' census as a markdown table, one row per recipe, then the totals. */
export function attachmentCensusTable(rows: readonly GateRow[]): string[] {
  const head = ['row', 'setup.attachments', 'setup.clips', ...ATTACHMENT_CENSUS_FIELDS];
  const out = [`| ${head.join(' | ')} |`, `| ${head.map((_h, i) => (i < 3 ? '---' : '---:')).join(' | ')} |`];
  const total: number[] = new Array<number>(ATTACHMENT_CENSUS_FIELDS.length).fill(0);
  for (const row of rows) {
    const c = row.attachmentCensus;
    const values = c === null ? null : ATTACHMENT_CENSUS_FIELDS.map((f) => c[f]);
    if (values !== null) values.forEach((v, i) => (total[i] += v));
    out.push(`| ${row.name} | ${row.blocks?.['setup.attachments'].verdict ?? row.verdict} | ${row.blocks?.['setup.clips'].verdict ?? row.verdict} | ${(values ?? ATTACHMENT_CENSUS_FIELDS.map(() => '—')).map(String).join(' | ')} |`);
  }
  out.push(`| **all** | | | ${total.join(' | ')} |`);
  return out;
}

/**
 * Each attachment field the rows whose block was compared reach, and the
 * HOLEs (issue #931): the clipping fields against `setup.clips`, the rest
 * against `setup.attachments`. A bounding box and a path attachment are HOLEs
 * however many rows show one — the oracle's dump writes no vertices for
 * either — and a `null` rectangle is never compared: the core leaves the block
 * out by name.
 */
export function attachmentReachLines(rows: readonly GateRow[]): string[] {
  const out: string[] = [];
  for (const f of ATTACHMENT_CENSUS_FIELDS) {
    const block: GateBlock = f === 'clipping' || f === 'clipEnd' ? 'setup.clips' : 'setup.attachments';
    const on = comparedOn(rows, block).filter((r) => (r.attachmentCensus?.[f] ?? 0) > 0).map((r) => r.name);
    const anywhere = rows.filter((r) => (r.attachmentCensus?.[f] ?? 0) > 0).map((r) => r.name);
    const elsewhere = anywhere.length > 0 ? ` (shown on ${anywhere.join(', ')})` : '';
    if (f === 'boundingbox' || f === 'path') out.push(`  HOLE  attachments ${f}: the oracle's dump writes no vertices for it, so none was judged${elsewhere}`);
    else if (f === 'nullAtlas') out.push(on.length > 0 ? `  REACH attachments ${f}: ${on.length} compared row(s)` : `  HOLE  attachments ${f}: no compared row carries one — the core leaves the block out by name where one is shown${elsewhere}`);
    else if (f === 'trimmedRegion' && on.length === 0) out.push(`  HOLE  attachments ${f}: no compared row reaches it — only a pack that trims does (a private corpus under --recipes)${elsewhere}`);
    else out.push(on.length > 0 ? `  REACH attachments ${f}: ${on.length} compared row(s)` : `  HOLE  attachments ${f}: no compared row reaches it${anywhere.length > 0 ? ` (only ${anywhere.join(', ')}, which the core skips)` : ''}`);
  }
  return out;
}

/** The constraints' census as a markdown table, one row per recipe, then the totals. */
export function constraintCensusTable(rows: readonly GateRow[]): string[] {
  const head = ['row', 'setup.bones', 'animations.bones', ...CONSTRAINT_CENSUS_FIELDS];
  const out = [`| ${head.join(' | ')} |`, `| ${head.map((_h, i) => (i < 3 ? '---' : '---:')).join(' | ')} |`];
  const total: number[] = new Array<number>(CONSTRAINT_CENSUS_FIELDS.length).fill(0);
  for (const row of rows) {
    const c = row.constraintCensus;
    const values = c === null ? null : CONSTRAINT_CENSUS_FIELDS.map((f) => c[f]);
    if (values !== null) values.forEach((v, i) => (total[i] += v));
    out.push(`| ${row.name} | ${row.blocks?.['setup.bones'].verdict ?? row.verdict} | ${row.blocks?.['animations.bones'].verdict ?? row.verdict} | ${(values ?? CONSTRAINT_CENSUS_FIELDS.map(() => '—')).map(String).join(' | ')} |`);
  }
  out.push(`| **all** | | | ${total.join(' | ')} |`);
  return out;
}

/**
 * Each constraint field the compared rows reach — a timeline field on a row
 * whose `animations.bones` was compared, every other on one whose
 * `setup.bones` was — and the HOLEs; `later` is a HOLE however many rows carry
 * one, since no cut judges those kinds yet, and when no kind is left to a
 * later cut it is a `NONE` line saying so. The stepped phase has its own
 * census since issue #956 (`steppedReachLines`).
 */
export function constraintReachLines(rows: readonly GateRow[]): string[] {
  const out: string[] = [];
  for (const f of CONSTRAINT_CENSUS_FIELDS) {
    const block: GateBlock = f.includes('timeline') ? 'animations.bones' : 'setup.bones';
    const on = comparedOn(rows, block).filter((r) => (r.constraintCensus?.[f] ?? 0) > 0).map((r) => r.name);
    const anywhere = rows.filter((r) => (r.constraintCensus?.[f] ?? 0) > 0).map((r) => r.name);
    if (f === 'later') {
      const laterKinds = CORE_CONSTRAINT_KINDS.filter((k) => !ADMITTED_CONSTRAINT_KINDS.includes(k));
      out.push(laterKinds.length === 0 ? `  NONE  constraints ${f}: no constraint kind is left to a later cut — ${ADMITTED_CONSTRAINT_KINDS.join(', ')} are all posed` : `  HOLE  constraints ${f}: ${anywhere.length} row(s) declare a ${laterKinds.join(', ')} constraint; those are later cuts and none was judged`);
    }
    else out.push(on.length > 0 ? `  REACH constraints ${f}: ${on.length} compared row(s)` : `  HOLE  constraints ${f}: no compared row reaches it${anywhere.length > 0 ? ` (only ${anywhere.join(', ')}, which the core skips)` : ''}`);
  }
  return out;
}

/**
 * Per constraint kind, the rows now judged — every block compared on a row
 * declaring the kind — and those that stay SKIP, named (issue #938: the
 * seven constrained rows turned green one kind at a time).
 */
export function constraintKindLines(rows: readonly GateRow[], kinds: ReadonlyMap<string, readonly string[]>): string[] {
  const out: string[] = [];
  for (const kind of ['ik', 'transform', 'path', 'physics', 'slider']) {
    const declaring = rows.filter((r) => (kinds.get(r.name) ?? []).includes(kind));
    const judged = declaring.filter((r) => r.blocks !== null && r.blocks['setup.bones'].verdict !== 'SKIP');
    const skipped = declaring.filter((r) => !judged.includes(r));
    out.push(`  KIND  ${kind}: ${judged.length} row(s) judged${judged.length > 0 ? ` (${judged.map((r) => `${r.name} ${r.blocks?.['setup.bones'].verdict}`).join(', ')})` : ''}; ${skipped.length} SKIP${skipped.length > 0 ? ` (${skipped.map((r) => r.name).join(', ')})` : ''}`);
  }
  return out;
}

/** Each mode and field the compared rows reach, and the HOLEs — what no compared row reaches. */
export function reachLines(rows: readonly GateRow[]): string[] {
  const compared = comparedOn(rows, 'setup.bones');
  const out: string[] = [];
  for (const m of CORE_INHERIT_MODES) {
    const on = compared.filter((r) => (r.census?.modes[m] ?? 0) > 0).map((r) => r.name);
    const anywhere = rows.filter((r) => (r.census?.modes[m] ?? 0) > 0).map((r) => r.name);
    out.push(on.length > 0 ? `  REACH inherit ${m}: ${on.length} compared row(s)` : `  HOLE  inherit ${m}: no compared row states it${anywhere.length > 0 ? ` (only ${anywhere.join(', ')}, which the core skips)` : ''}`);
  }
  for (const f of CENSUS_FIELDS) {
    const on = compared.filter((r) => (r.census?.fields[f] ?? 0) > 0).map((r) => r.name);
    const anywhere = rows.filter((r) => (r.census?.fields[f] ?? 0) > 0).map((r) => r.name);
    out.push(on.length > 0 ? `  REACH ${f}: ${on.length} compared row(s)` : `  HOLE  ${f}: no compared row reaches it${anywhere.length > 0 ? ` (only ${anywhere.join(', ')}, which the core skips)` : ''}`);
  }
  return out;
}

/** The path constraints' census as a markdown table, one row per recipe, then the totals. */
export function pathCensusTable(rows: readonly GateRow[]): string[] {
  const head = ['row', 'setup.bones', 'animations.bones', ...PATH_CENSUS_FIELDS];
  const out = [`| ${head.join(' | ')} |`, `| ${head.map((_h, i) => (i < 3 ? '---' : '---:')).join(' | ')} |`];
  const total: number[] = new Array<number>(PATH_CENSUS_FIELDS.length).fill(0);
  for (const row of rows) {
    const c = row.pathCensus;
    const values = c === null ? null : PATH_CENSUS_FIELDS.map((f) => c[f]);
    if (values !== null) values.forEach((v, i) => (total[i] += v));
    out.push(`| ${row.name} | ${row.blocks?.['setup.bones'].verdict ?? row.verdict} | ${row.blocks?.['animations.bones'].verdict ?? row.verdict} | ${(values ?? PATH_CENSUS_FIELDS.map(() => '—')).map(String).join(' | ')} |`);
  }
  out.push(`| **all** | | | ${total.join(' | ')} |`);
  return out;
}

/**
 * Each path field the compared rows reach — a timeline field on a row whose
 * `animations.bones` was compared, every other on one whose `setup.bones` was
 * — and the HOLEs, each covered by the core suite's `CP` probes.
 */
export function pathReachLines(rows: readonly GateRow[]): string[] {
  const out: string[] = [];
  for (const f of PATH_CENSUS_FIELDS) {
    const block: GateBlock = f.includes('timeline') ? 'animations.bones' : 'setup.bones';
    const on = comparedOn(rows, block).filter((r) => (r.pathCensus?.[f] ?? 0) > 0).map((r) => r.name);
    const anywhere = rows.filter((r) => (r.pathCensus?.[f] ?? 0) > 0).map((r) => r.name);
    out.push(on.length > 0 ? `  REACH paths ${f}: ${on.length} compared row(s)` : `  HOLE  paths ${f}: no compared row reaches it${anywhere.length > 0 ? ` (only ${anywhere.join(', ')}, which the core skips)` : ''}`);
  }
  return out;
}

/** The stepped census as a markdown table, one row per recipe, then the totals. */
export function steppedCensusTable(rows: readonly GateRow[]): string[] {
  const head = ['row', 'stepped', ...STEPPED_CENSUS_FIELDS];
  const out = [`| ${head.join(' | ')} |`, `| ${head.map((_h, i) => (i < 2 ? '---' : '---:')).join(' | ')} |`];
  const total: number[] = new Array<number>(STEPPED_CENSUS_FIELDS.length).fill(0);
  for (const row of rows) {
    const c = row.stepped?.census ?? null;
    const values = c === null ? null : STEPPED_CENSUS_FIELDS.map((f) => c[f]);
    if (values !== null) values.forEach((v, i) => (total[i] += v));
    out.push(`| ${row.name} | ${row.stepped?.verdict ?? row.verdict} | ${(values ?? STEPPED_CENSUS_FIELDS.map(() => '—')).map(String).join(' | ')} |`);
  }
  out.push(`| **all** | | ${total.join(' | ')} |`);
  return out;
}

/**
 * Each stepped field a row judged IDENTICAL under the step reaches, and the
 * HOLEs — what no such row reaches, each covered by the core suite's `CK`
 * probes (issue #956; it replaces the `physics.stepped` HOLE of issue #938).
 */
export function steppedReachLines(rows: readonly GateRow[]): string[] {
  const out: string[] = [];
  for (const f of STEPPED_CENSUS_FIELDS) {
    const on = rows.filter((r) => r.stepped?.verdict === 'IDENTICAL' && r.stepped.census[f] > 0).map((r) => r.name);
    const anywhere = rows.filter((r) => (r.stepped?.census[f] ?? 0) > 0).map((r) => r.name);
    out.push(on.length > 0 ? `  REACH stepped ${f}: ${on.length} compared row(s)` : `  HOLE  stepped ${f}: no compared row reaches it${anywhere.length > 0 ? ` (only ${anywhere.join(', ')}, which the stepped run does not judge IDENTICAL)` : ''}`);
  }
  return out;
}

/**
 * Which rows the per-skin runs judged (issue #932): each row declaring
 * several skins, with its skins, or a HOLE when none does — the merged run
 * then speaks for every row, and the core suite's `CN` probes are the only
 * reading of the per-skin rule.
 */
export function skinReachLines(rows: readonly GateRow[]): string[] {
  const several = rows.filter((r) => (r.perSkin?.length ?? 0) > 0);
  if (several.length === 0) return ['  HOLE  per skin: no row declares several skins, so no per-skin run judged anything (each row\'s one skin is its merged view)'];
  return several.map((r) => `  REACH per skin: ${r.name} — ${(r.perSkin ?? []).map((k) => `${k.skin} ${k.verdict}`).join(', ')}`);
}

// --- #966 raw: begin ---
/** Every tolerance of a `--raw` run: 0, in ulps (issue #966). */
export const RAW_TOLERANCE = { xy: 0, m: 0 } as const;

/** `options` under `--raw` (issue #966), or as they are. */
export function rawOptions(options: OracleOptions, raw: boolean): OracleOptions {
  return raw ? { ...options, raw: true } : options;
}

/**
 * The raw census (issue #966): per block, the rows exact, off and skipped
 * under the merged run, the worst distance in ulps with its row, and each
 * row off with its first difference; then the stepped run and the per-skin
 * runs the same way.
 */
export function rawCensusLines(rows: readonly GateRow[]): string[] {
  const out: string[] = ['', 'raw census (full doubles, tolerance 0; worst in ulps over the bones\' matrix and origin and every vertex):'];
  for (const block of GATE_BLOCKS) {
    const judged = rows.filter((r) => r.blocks !== null);
    const exact = judged.filter((r) => r.blocks?.[block].verdict === 'IDENTICAL');
    const off = judged.filter((r) => r.blocks?.[block].verdict === 'DIFF');
    const skip = judged.filter((r) => r.blocks?.[block].verdict === 'SKIP');
    let worst = 0;
    let at = '';
    for (const r of judged) {
      const w = r.blocks?.[block].worst ?? 0;
      if (w > worst) {
        worst = w;
        at = r.name;
      }
    }
    out.push(`  RAW   ${block}: ${exact.length} exact, ${off.length} off, ${skip.length} SKIP; worst ${worst} ulp${at === '' ? '' : ` (${at})`}${off.length === 0 ? '' : ` — off: ${off.map((r) => r.name).join(', ')}`}`);
  }
  const stepped = rows.filter((r) => r.stepped !== undefined);
  const sOff = stepped.filter((r) => r.stepped?.verdict === 'DIFF');
  out.push(`  RAW   stepped (--physics step --dt ${ORACLE_DEFAULT_DT}): ${stepped.filter((r) => r.stepped?.verdict === 'IDENTICAL').length} exact, ${sOff.length} off, ${stepped.filter((r) => r.stepped?.verdict === 'SKIP').length} SKIP${sOff.length === 0 ? '' : ` — off: ${sOff.map((r) => r.name).join(', ')}`}`);
  const runs = rows.flatMap((r) => (r.perSkin ?? []).map((k) => ({ row: r.name, k })));
  out.push(`  RAW   per skin: ${runs.length} run(s), ${runs.filter((x) => x.k.verdict === 'IDENTICAL').length} exact, ${runs.filter((x) => x.k.verdict === 'DIFF').length} off, ${runs.filter((x) => x.k.verdict === 'SKIP').length} SKIP`);
  return out;
}
// --- #966 raw: end ---

/** The verdict line. */
export function gateVerdict(rows: readonly GateRow[]): { ok: boolean; line: string } {
  const count = (v: GateVerdict): number => rows.filter((r) => r.verdict === v).length;
  const on = (block: GateBlock, v: BlockVerdict): number => rows.filter((r) => r.blocks?.[block].verdict === v).length;
  const stepped = (v: BlockVerdict): number => rows.filter((r) => r.stepped?.verdict === v).length;
  const several = rows.filter((r) => (r.perSkin?.length ?? 0) > 0);
  const runs = several.flatMap((r) => r.perSkin ?? []);
  const skin = (v: BlockVerdict): number => runs.filter((k) => k.verdict === v).length;
  const skinStepped = (v: BlockVerdict): number => runs.filter((k) => k.stepped.verdict === v).length;
  const ok = count('DIFF') === 0 && count('REFUSED') === 0 && stepped('DIFF') === 0 && skin('DIFF') === 0 && skinStepped('DIFF') === 0;
  return {
    ok,
    line:
      `${ok ? 'GREEN' : 'RED'} — ${rows.length} row(s): ` +
      GATE_BLOCKS.map((b) => `${b} ${on(b, 'IDENTICAL')} IDENTICAL, ${on(b, 'SKIP')} SKIP, ${on(b, 'DIFF')} DIFF`).join('; ') +
      `; ${count('REFUSED')} REFUSED; stepped (--physics step --dt ${ORACLE_DEFAULT_DT}) bones ${stepped('IDENTICAL')} IDENTICAL, ${stepped('SKIP')} SKIP, ${stepped('DIFF')} DIFF` +
      `; per skin (--skin <name>): ${several.length} row(s) declaring several skins, ${runs.length} skin run(s) ${skin('IDENTICAL')} IDENTICAL, ${skin('SKIP')} SKIP, ${skin('DIFF')} DIFF, stepped ${skinStepped('IDENTICAL')} IDENTICAL, ${skinStepped('SKIP')} SKIP, ${skinStepped('DIFF')} DIFF`,
  };
}

function parseFlags(args: readonly string[], known: readonly string[], switches: readonly string[] = []): Map<string, string> {
  const flags = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    // A switch takes no value (`--raw`, issue #966).
    if (switches.includes(arg)) {
      if (flags.has(arg)) throw new GateInputError(`${arg} given twice`);
      flags.set(arg, 'true');
      continue;
    }
    if (!known.includes(arg)) throw new GateInputError(`unknown argument ${arg}; this command takes ${known.join(', ')}`);
    const value = args[i + 1];
    if (value === undefined || value.startsWith('--')) throw new GateInputError(`${arg} needs a value`);
    if (flags.has(arg)) throw new GateInputError(`${arg} given twice`);
    flags.set(arg, value);
    i++;
  }
  return flags;
}

/** One built row's walk comparison (`--walk`): the comparison, or why there is none. */
export interface WalkRow {
  name: string;
  verdict: 'IDENTICAL' | 'DIFF' | 'SKIP' | 'REFUSED';
  why: string | null;
  comparison: WalkComparison | null;
}

/** A10's walk on both sides of one built row (`--walk`); `walkPlant` replaces a part of the core's walk (`CO26`). */
export function walkBuild(name: string, outDir: string, walkPlant: WalkPlant = {}): WalkRow {
  const files = ['skeleton.json', 'skeleton.atlas', MODEL_DOCUMENT_FILE].map((f) => join(outDir, f));
  const missing = files.filter((f) => !existsSync(f));
  if (missing.length > 0) return { name, verdict: 'REFUSED', why: `the build wrote no ${missing.map((f) => f.slice(outDir.length + 1)).join(', ')}`, comparison: null };
  const [skeletonText, atlasText, modelText] = files.map((f) => readFileSync(f, 'utf8'));
  return walkPair(name, skeletonText, atlasText, modelText, walkPlant);
}

/** A10's walk on both sides of one pair of texts (`walkBuild`, and the probes below). */
export function walkPair(name: string, skeletonText: string, atlasText: string, modelText: string, walkPlant: WalkPlant = {}): WalkRow {
  const spine = spineWalkDocument(loadOracleData(skeletonText, atlasText, name));
  let core;
  try {
    core = coreWalkDocument(readModel(modelText, name), undefined, {}, walkPlant);
  } catch (err) {
    if (err instanceof CoreInputError) return { name, verdict: 'SKIP', why: `the core refused it by name — ${err.message}`, comparison: null };
    throw err;
  }
  const comparison = compareWalkDocuments(spine, core);
  return { name, verdict: comparison.first === null ? 'IDENTICAL' : 'DIFF', why: comparison.first, comparison };
}

/**
 * A skeleton spelled twice — the Spine file and the model — whose four
 * skin-required bones (rotations 130.25, 69.09, 45.19 and 80.41 under a
 * swung parent) no skin activates with no skin set, all four written by a
 * transform constraint (rotate at mix 1, translate at `mix`) from a source
 * at `targetRotation` degrees, an active child under the first when `child`,
 * and a fifth skin-required bone `free` no constraint writes (the control's
 * bone: inactive and not HISTORY, so a value there is compared)
 * (issue #1025, cut 4c-5a: the production corpus's sign-of-zero rig, rebuilt
 * in public). It is the HISTORY class of `walkHistory` in src/core/walk.ts:
 * spine-core keeps each inactive bone's previous step, the core does not.
 */
export function inactiveHistoryProbe(targetRotation: number, mix: number, child: boolean): { spine: string; model: string } {
  type Obj = Record<string, unknown>;
  const kids = [130.25, 69.09, 45.19, 80.41].map((r, i) => ({ name: `k${i}`, parent: 'p', rotation: r, length: 12, x: 3 * i, skin: true }));
  const bones: Obj[] = [{ name: 'root' }, { name: 'p', parent: 'root', x: 10, y: 5, rotation: 20, length: 30 }, ...kids, ...(child ? [{ name: 'gc', parent: 'k0', x: 4, y: 2 }] : []), { name: 'free', parent: 'p', rotation: 155, length: 9, skin: true }, { name: 't', parent: 'root', x: 40, y: -20, rotation: targetRotation }];
  const { type, name, ...rest } = { type: 'transform', name: 'tc', bones: kids.map((k) => k.name), source: 't', properties: { rotate: { to: { rotate: {} } }, x: { to: { x: {} } }, y: { to: { y: {} } } }, mixRotate: 1, mixX: mix, mixY: mix };
  const keys = [{ time: 0, value: 0 }, { time: 1, value: 90 }];
  const listed = [...kids.map((k) => k.name), 'free'];
  return {
    spine: JSON.stringify({ skeleton: { spine: '4.3.13' }, bones, slots: [], constraints: [{ type, name, ...rest }], skins: [{ name: 'default', attachments: {} }, { name: 'extra', bones: listed, attachments: {} }], animations: { a: { bones: { p: { rotate: keys } } } } }),
    model: JSON.stringify({
      spec: 'rigc-compiled/1', referenceScale: 100,
      bones: bones.map(({ skin, ...b }) => ({ ...b, ...(skin === undefined ? {} : { skinRequired: skin }) })),
      slots: [], skins: [{ name: 'default', bones: [], constraints: {}, attachments: {} }, { name: 'extra', bones: listed, constraints: {}, attachments: {} }],
      constraints: [{ kind: type, name, declaredIn: 'rig', ...rest }], events: [],
      animations: [{ name: 'a', duration: 0, bones: [{ name: 'p', timelines: [{ name: 'rotate', keys }] }], slots: [], constraints: { ik: [], transform: [], path: [], physics: [], slider: [] }, attachments: [], drawOrder: [], events: [] }],
      images: [], pageGrids: [], droppedStates: [], absentParts: [], meshBones: {}, meshes: {}, physics: [], deformTransforms: [], trackDerivations: [], rig: {}, spine: { sha256: '0'.repeat(64) },
    }),
  };
}

/** The inactive-bone probes `--walk` runs beside the corpus: the sign of zero alone (130° and −150°, mix 1), a value (mix 0.5), and each with an active child. */
export const INACTIVE_HISTORY_PROBES: ReadonlyArray<readonly [number, number, boolean]> = [[130, 1, false], [-150, 1, false], [130, 0.5, false], [130, 1, true], [-150, 0.5, true]];

/** The inactive-bone probes walked (`--walk`), each a row named `probe/…`. */
export function walkProbes(walkPlant: WalkPlant = {}): WalkRow[] {
  return INACTIVE_HISTORY_PROBES.map(([r, mix, child]) => {
    const name = `probe/inactive ${r}° mix ${mix}${child ? ' child' : ''}`;
    const pair = inactiveHistoryProbe(r, mix, child);
    return walkPair(name, pair.spine, '', pair.model, walkPlant);
  });
}

/** Every built row's walk (`--walk`), a refused build chain named. */
export function walkBuilt(built: readonly BuiltRow[], walkPlant: WalkPlant = {}): WalkRow[] {
  return built.map((r) => (r.exits.some((e) => e !== 0) ? { name: r.name, verdict: 'REFUSED', why: `the build chain exited ${JSON.stringify(r.exits)}`, comparison: null } : walkBuild(r.name, r.out, walkPlant)));
}

/** The walk's lines and its verdict (`--walk`). */
export function walkLines(rows: readonly WalkRow[]): { lines: string[]; ok: boolean } {
  const lines: string[] = [];
  const sum = { poses: 0, numbers: 0, exact: 0, wrapped: 0, nonFinite: 0, wrappedAnimations: 0, historyNumbers: 0, historySignOnly: 0 };
  let historyBones = 0;
  for (const row of rows) {
    const c = row.comparison;
    if (c !== null) {
      for (const k of Object.keys(sum) as Array<keyof typeof sum>) sum[k] += c[k];
      historyBones += c.historyBones.size;
    }
    const history = c === null || c.historyNumbers === 0
      ? ''
      : `; ${c.historyNumbers} number(s) on ${c.historyBones.size} bone(s) the view leaves inactive and a constraint writes, HISTORY compared with nothing (${c.historySignOnly} of them only in the sign of zero) — ${[...new Set(c.historyBones.values())].join(', ')}`;
    lines.push(
      `  ${row.verdict.padEnd(9)} ${row.name}` +
        (c === null ? '' : `: ${c.exact} of ${c.poses} pose(s) exact over ${c.numbers} number(s), ${c.wrapped} step(s) at or past the duration in ${c.wrappedAnimations} animation(s), ${c.nonFinite} pose(s) holding a non-finite value${history}`) +
        (row.why === null ? '' : ` — ${row.why}`),
    );
  }
  const count = (v: WalkRow['verdict']): number => rows.filter((r) => r.verdict === v).length;
  const ok = count('DIFF') === 0 && count('REFUSED') === 0 && sum.poses > 0;
  lines.push(
    `WALK ${ok ? 'IDENTICAL' : sum.poses === 0 ? 'NOTHING COMPARED' : 'DIFF'} — ${rows.length} row(s): ${count('IDENTICAL')} identical, ${count('DIFF')} differing, ${count('SKIP')} refused by the core by name, ${count('REFUSED')} refused; ` +
      `${sum.exact} of ${sum.poses} pose(s) exact over ${sum.numbers} number(s); ${sum.wrapped} step(s) at or past the duration in ${sum.wrappedAnimations} animation(s); ${sum.nonFinite} pose(s) holding a non-finite value` +
      `${sum.historyNumbers > 0 ? `; ${sum.historyNumbers} number(s) on ${historyBones} bone(s) the view leaves inactive and a constraint writes, HISTORY compared with nothing (${sum.historySignOnly} of them only in the sign of zero)` : ''}`,
  );
  return { lines, ok };
}

// ---------------------------------------------------------------------------
// No skin set (issue #1051)
// ---------------------------------------------------------------------------

/** The options the no-skin run takes both dumps under: the gate's, with no skin set (`--skin none`). */
export const NOSKIN_OPTIONS: OracleOptions = { ...GATE_OPTIONS, skin: ORACLE_NO_SKIN };

/** What sets a document apart with no skin set: skins and none named `default`, or a `default` skin naming a skin-required bone or constraint — `null` for a document the default skin's view already poses. */
export function noSkinClass(doc: CompiledDocument): string | null {
  if (doc.skins.length === 0) return null;
  const fallback = doc.skins.find((k) => k.name === CORE_DEFAULT_SKIN);
  if (fallback === undefined) return 'no default skin';
  const members = fallback.bones.length + Object.values(fallback.constraints).reduce((n, names) => n + names.length, 0);
  return members > 0 ? 'a default skin naming skin-required members' : null;
}

/** The no-skin probes' one atlas page: a 20-pixel region per name. */
export const NOSKIN_PROBE_ATLAS = ['noskin.png', 'size: 128, 32', 'filter: Linear, Linear', ...['ra', 'rb', 'rc', 'rd', 're'].flatMap((n, i) => [n, `bounds: ${20 * i}, 0, 20, 20`]), ''].join('\n');

/** The three hand-written skeletons the no-skin run and walk read beside the corpus (`noSkinProbeSkeleton`). */
export const NOSKIN_PROBE_VARIANTS = ['no default skin', 'a default skin naming skin-required members', 'a plain default skin'] as const;
export type NoSkinVariant = (typeof NOSKIN_PROBE_VARIANTS)[number];

/**
 * A Spine skeleton for the no-skin rule (issue #1051), in three variants
 * that share every bone, constraint, slot and animation and differ in their
 * skins: no `default` skin at all; a `default` skin naming two skin-required
 * bones and two skin-required constraints; a `default` skin naming none.
 * It separates every question the rule answers: a skin-required bone no
 * constraint writes (`sf`), one a constraint that is not skin-required writes
 * (`sw`, written by ik `ikw` — issue #979's class), a skin-required parent of
 * a bone that is not (`sp` over `ch`) with a slot on each, a skin-required
 * bone below that one (`sd`), a skin-required ik (`iks`) and transform
 * (`tcs`) over bones that are not, and a second skin naming a different
 * subset; slots the default skin fills, slots only a named skin fills, and
 * one two named skins fill differently; an animation keying the bones, two
 * slot colours, an attachment and the draw order. The compiler refuses a
 * placeholder the default skin and a named one both fill, so in the two
 * variants with a default skin the default fills what the variant without
 * one leaves to the named skins.
 */
export function noSkinProbeSkeleton(variant: NoSkinVariant): Record<string, unknown> {
  const region = (path: string): Record<string, unknown> => ({ path, width: 20, height: 20 });
  const noDefault = variant === 'no default skin';
  const s1 = { name: 's1', bones: ['sf', 'sp'], ik: ['iks'], attachments: { s_s1: { rb: region('rb') }, s_both: { x: region('rb') }, ...(noDefault ? { s_sp: { rc: region('rc') }, s_ch: { rd: region('rd') }, s_sf: { re: region('re') } } : {}) } };
  const s2 = { name: 's2', bones: ['sd', 'sw'], transform: ['tcs'], attachments: { s_both: { x: region('re') }, ...(noDefault ? { s_def: { ra: region('ra'), rb: region('rb') } } : {}) } };
  const fills = { s_def: { ra: region('ra'), rb: region('rb') }, s_sp: { rc: region('rc') }, s_ch: { rd: region('rd') }, s_sf: { re: region('re') } };
  const skins = noDefault
    ? [s1, s2]
    : variant === 'a default skin naming skin-required members'
      ? [{ name: 'default', bones: ['sf', 'sp'], ik: ['iks'], transform: ['tcs'], attachments: fills }, s1, s2]
      : [{ name: 'default', attachments: fills }, s1, s2];
  const keys = (a: number, b: number): Array<Record<string, number>> => [{ time: 0, value: a }, { time: 1, value: b }];
  return {
    skeleton: { spine: '4.3.13' },
    bones: [
      { name: 'root' },
      { name: 'p', parent: 'root', x: 5, rotation: 10, length: 20 },
      { name: 'sf', parent: 'root', x: 20, rotation: 30, length: 10, skin: true },
      { name: 'sw', parent: 'p', x: 8, rotation: -40, length: 12, skin: true },
      { name: 'sp', parent: 'root', x: -15, rotation: 45, length: 15, skin: true },
      { name: 'ch', parent: 'sp', x: 7, rotation: 20, length: 9 },
      { name: 'sd', parent: 'ch', x: 3, rotation: 5, length: 4, skin: true },
      { name: 't', parent: 'root', x: 40, y: -20 },
      { name: 'q', parent: 'root', x: 12, y: 9, rotation: 70, length: 10 },
      { name: 'r', parent: 'root', x: -12, y: 4, rotation: -30, length: 10 },
    ],
    slots: [
      { name: 's_def', bone: 'p', attachment: 'ra' },
      { name: 's_s1', bone: 'p', attachment: 'rb' },
      { name: 's_both', bone: 'p', attachment: 'x' },
      { name: 's_sp', bone: 'sp', attachment: 'rc' },
      { name: 's_ch', bone: 'ch', attachment: 'rd' },
      { name: 's_sf', bone: 'sf', attachment: 're' },
    ],
    skins,
    constraints: [
      { type: 'ik', name: 'ikw', target: 't', bones: ['sw'] },
      { type: 'ik', name: 'iks', target: 't', bones: ['q'], skin: true },
      { type: 'transform', name: 'tcs', source: 't', bones: ['r'], skin: true, properties: { rotate: { to: { rotate: {} } }, x: { to: { x: {} } } }, mixRotate: 1, mixX: 0.5 },
    ],
    animations: {
      a: {
        bones: { p: { rotate: keys(0, 40) }, sf: { rotate: keys(0, 30) }, ch: { rotate: keys(0, -50) }, sp: { rotate: keys(0, 25) }, t: { translate: [{ time: 0, x: 0, y: 0 }, { time: 1, x: 10, y: 15 }] } },
        slots: { s_sp: { rgba: [{ time: 0, color: 'ffffffff' }, { time: 1, color: '80402010' }] }, s_def: { attachment: [{ time: 0.5, name: 'rb' }] }, s_ch: { rgba: [{ time: 0, color: 'ffffffff' }, { time: 1, color: '20408060' }] } },
        drawOrder: [{ time: 0.5, offsets: [{ slot: 's_sp', offset: -3 }] }],
      },
    },
  };
}

/**
 * A hand-written Spine skeleton built the way a foreign file is — read by
 * `ingest`, rebuilt by `compile` against `atlas` (one page of mid-grey) — so
 * the Spine pair and the model document are one build's two outputs, written
 * into `<dir>/out` as `build` writes them. A refusal on the way is the row's
 * REFUSED, by name.
 */
export function buildSpineSkeleton(name: string, skeleton: unknown, atlas: string, dir: string): BuiltRow {
  const pack = join(dir, 'pack');
  const out = join(dir, 'out');
  mkdirSync(pack, { recursive: true });
  mkdirSync(out, { recursive: true });
  const page = atlas.split('\n')[0];
  const size = /^size: (\d+), (\d+)$/m.exec(atlas);
  const [w, h] = size === null ? [1, 1] : [Number(size[1]), Number(size[2])];
  const grey = encodePng(w, h, new Uint8Array(w * h * 4).fill(128));
  writeFileSync(join(pack, 'probe.atlas'), atlas);
  writeFileSync(join(pack, page), grey);
  try {
    const specs = ingest(skeleton, { name: 'noskin_probe', art: 'none', source: `${name}.json`, version: '0' });
    writeFileSync(join(dir, 'rig.json'), `${JSON.stringify(specs.rig, null, 2)}\n`);
    writeFileSync(join(dir, 'motion.json'), `${JSON.stringify(specs.motion, null, 2)}\n`);
    const built = compile({ rigPath: join(dir, 'rig.json'), motionPath: join(dir, 'motion.json'), outDir: out, atlasInPath: join(pack, 'probe.atlas') });
    writeFileSync(join(out, 'skeleton.json'), built.skeletonText);
    writeFileSync(join(out, 'skeleton.atlas'), built.atlasText);
    writeFileSync(join(out, MODEL_DOCUMENT_FILE), modelDocument(built.model, built.skeletonText, built.atlasText));
    for (const line of built.atlasText.split('\n')) if (line.endsWith('.png')) writeFileSync(join(out, line), grey);
    return { name, out, exits: [0] };
  } catch (err) {
    writeFileSync(join(dir, 'refused.txt'), `${(err as Error).message}\n`);
    return { name, out, exits: [1] };
  }
}

/** The three no-skin probes built under `dir`, each a row named `probe/no skin, …`. */
export function noSkinProbeBuilds(dir: string): BuiltRow[] {
  return NOSKIN_PROBE_VARIANTS.map((variant, i) => buildSpineSkeleton(`probe/no skin, ${variant}`, noSkinProbeSkeleton(variant), NOSKIN_PROBE_ATLAS, join(dir, `noskin-${i}`)));
}

/** One build posed with no skin set by both dumpers (issue #1051). */
export interface NoSkinRow {
  name: string;
  /** `noSkinClass` of the document, or `null` for a probe whose view the default skin's already poses (the contrast). */
  class: string | null;
  verdict: GateVerdict;
  why: string | null;
  blocks: Record<GateBlock, { verdict: BlockVerdict; why: string | null; worst?: number }> | null;
  boneSamples: number;
  slotRows: number;
  /** The setup's drawn attachments compared, and the skin-required bones inactive at setup on the spine-core side. */
  attachmentRows: number;
  inactive: number;
  stepped: SteppedRow | null;
  /** `pose_oracle unposed`'s comparison: every bone unposed in either pose, to the bit and the sign of zero; HISTORY by the runtime's own second reading. */
  unposed: { boneSamples: number; exact: number; history: number; first: string | null } | null;
}

/**
 * Both dumpers with no skin set (`NOSKIN_OPTIONS`, `--raw` when `raw`) on one
 * build: each posed block judged alone, the stepped run under the same
 * option, and the unposed bones compared to the bit (`compareUnposed`, the
 * runtime's fresh reading classing HISTORY). A refusal is REFUSED, by name.
 */
export function noSkinRun(name: string, outDir: string, raw = false, view?: SkinViewOf): NoSkinRow {
  const skeleton = join(outDir, 'skeleton.json');
  const atlas = join(outDir, 'skeleton.atlas');
  const model = join(outDir, MODEL_DOCUMENT_FILE);
  const refused = (why: string, klass: string | null = null): NoSkinRow => ({ name, class: klass, verdict: 'REFUSED', why, blocks: null, boneSamples: 0, slotRows: 0, attachmentRows: 0, inactive: 0, stepped: null, unposed: null });
  const missing = [skeleton, atlas, model].filter((p) => !existsSync(p));
  if (missing.length > 0) return refused(`the build wrote no ${missing.map((p) => p.slice(outDir.length + 1)).join(', ')}`);
  let klass: string | null = null;
  try {
    const skeletonText = readFileSync(skeleton, 'utf8');
    const atlasText = readFileSync(atlas, 'utf8');
    const modelText = readFileSync(model, 'utf8');
    const doc = readModel(modelText, model);
    klass = noSkinClass(doc);
    const data = loadOracleData(skeletonText, atlasText, skeleton);
    const options = rawOptions(NOSKIN_OPTIONS, raw);
    const tol = raw ? RAW_TOLERANCE : { xy: ORACLE_DEFAULT_TOL, m: ORACLE_DEFAULT_TOL };
    const spine = dumpSkeleton(data, options);
    const core = coreDump(doc, options, {}, uvSourceOf(atlasText, modelText), view);
    const whole = compareDumps(spine, core, tol);
    const { blocks } = judgeBlocks(spine, core, tol);
    const stepped = steppedRun(skeletonText, atlasText, skeleton, modelText, model, {}, tol, ORACLE_NO_SKIN, undefined, raw, view);
    const signed: OracleOptions = { ...NOSKIN_OPTIONS, signed: true };
    const u = compareUnposed(dumpSkeleton(data, signed), coreDump(doc, signed, {}, null, view), dumpSkeleton(data, { ...signed, fresh: true }));
    const unposed = { boneSamples: u.boneSamples, exact: u.exact, history: u.history, first: u.findings[0] ?? null };
    const inactive = (spine.setup.bones ?? []).filter((r) => r[7] === 0).length;
    const skipped = GATE_BLOCKS.filter((b) => blocks[b].verdict === 'SKIP');
    const counts = { boneSamples: whole.boneSamples, slotRows: core.setup.slots?.length ?? 0, attachmentRows: core.setup.attachments?.length ?? 0, inactive, stepped, unposed };
    if (!whole.identical) return { name, class: klass, verdict: 'DIFF', why: whole.first, blocks, ...counts };
    if (stepped.verdict === 'DIFF') return { name, class: klass, verdict: 'DIFF', why: `stepped: ${stepped.why}`, blocks, ...counts };
    if (unposed.first !== null) return { name, class: klass, verdict: 'DIFF', why: `unposed: ${unposed.first}`, blocks, ...counts };
    if (skipped.length > 0) return { name, class: klass, verdict: 'SKIP', why: skipped.map((b) => `${b}: ${blocks[b].why}`).join(' | '), blocks, ...counts };
    return { name, class: klass, verdict: 'IDENTICAL', why: null, blocks, ...counts };
  } catch (err) {
    if (err instanceof OracleInputError || err instanceof CoreInputError) return refused(err.message, klass);
    throw err;
  }
}

/**
 * The no-skin run's rows: each built corpus row whose document is in the
 * class (`noSkinClass`), and the probes. A corpus none of whose rows is in
 * the class prints a HOLE naming the probes as the run's only reading.
 */
export function noSkinBuilt(built: readonly BuiltRow[], probes: readonly BuiltRow[], raw = false): NoSkinRow[] {
  const corpus = built.filter((r) => r.exits.every((e) => e === 0) && existsSync(join(r.out, MODEL_DOCUMENT_FILE))).filter((r) => {
    try {
      return noSkinClass(readModel(readFileSync(join(r.out, MODEL_DOCUMENT_FILE), 'utf8'))) !== null;
    } catch (err) {
      if (err instanceof CoreInputError) return false;
      throw err;
    }
  });
  return [...corpus, ...probes].map((r) => (r.exits.some((e) => e !== 0) ? { name: r.name, class: null, verdict: 'REFUSED' as const, why: `the build chain exited ${JSON.stringify(r.exits)}`, blocks: null, boneSamples: 0, slotRows: 0, attachmentRows: 0, inactive: 0, stepped: null, unposed: null } : noSkinRun(r.name, r.out, raw)));
}

/** The no-skin run's lines and its verdict. */
export function noSkinLines(rows: readonly NoSkinRow[]): { lines: string[]; ok: boolean } {
  const lines: string[] = [];
  for (const r of rows) {
    lines.push(
      `  NOSKIN ${r.verdict.padEnd(9)} ${r.name} (${r.class ?? 'the default skin\'s view'})` +
        (r.blocks === null ? '' : ` [${GATE_BLOCKS.map((b) => `${b} ${r.blocks?.[b].verdict}`).join(', ')}]`) +
        `: ${r.boneSamples} bone-sample(s), ${r.slotRows} slot row(s), ${r.attachmentRows} attachment row(s) at setup, ${r.inactive} bone(s) inactive at setup` +
        (r.stepped === null ? '' : `; stepped ${r.stepped.verdict}`) +
        (r.unposed === null ? '' : `; ${r.unposed.exact} of ${r.unposed.boneSamples} unposed bone-sample(s) equal to the bit, ${r.unposed.history} HISTORY`) +
        (r.why === null ? '' : ` — ${r.why}`),
    );
  }
  if (!rows.some((r) => !r.name.startsWith('probe/'))) lines.push('  HOLE  no skin: no corpus row declares skins and no default one, or a default skin naming a skin-required member — the probes are the run\'s only reading');
  const count = (v: GateVerdict): number => rows.filter((r) => r.verdict === v).length;
  const ok = count('DIFF') === 0 && count('REFUSED') === 0 && rows.length > 0;
  lines.push(`NO SKIN ${ok ? 'GREEN' : 'RED'} — ${rows.length} row(s) posed with no skin set (--skin none): ${count('IDENTICAL')} IDENTICAL, ${count('SKIP')} SKIP, ${count('DIFF')} DIFF, ${count('REFUSED')} REFUSED; ${rows.reduce((n, r) => n + r.boneSamples, 0)} bone-sample(s), ${rows.reduce((n, r) => n + (r.unposed?.boneSamples ?? 0), 0)} unposed bone-sample(s) to the bit`);
  return { lines, ok };
}

// --- #907 the setup-pose bounding box: begin ---
/**
 * One build's setup-pose bounding box read three ways (issue #907): rigc's
 * core over the model document (`setupBounds`, `src/core/raw.ts`),
 * spine-core's `getBounds` over the Spine pair (`spineSetupBounds` in
 * `./pose_oracle.ts`: no skin set, `Physics.none`, no clipper), and the box
 * the header of `skeleton.json` carries.
 *
 * `IDENTICAL` when the core's box equals spine-core's in full doubles —
 * tolerance 0, the four numbers compared with `===` — and the header carries
 * each one on the header's grid (`headerBoxNumber`), or, where spine-core bounded nothing or the
 * model declares no stage (issue #578), carries no box at all; `SKIP` when the
 * core leaves the setup pose out (a construct its cuts do not pose, named) and
 * the header accordingly carries no box — nothing was compared, and the row
 * says why; `DIFF` naming the first disagreement otherwise; `REFUSED` when the
 * build wrote no pair or a side could not read it.
 */
export interface BoundsRow {
  name: string;
  verdict: 'IDENTICAL' | 'SKIP' | 'DIFF' | 'REFUSED';
  why: string | null;
  core: number[] | null;
  spine: number[] | null;
  header: number[] | null;
  /** Whether the model document declares a stage — the one input that says the header carries no box (issue #578). */
  staged: boolean;
}

/** The header's four box fields, `x` and `y` read as the 0 an omission means inside a declared box (`diff`'s `headerBox` rule), or `null` with no extent. */
function headerBoxOf(skeletonText: string): number[] | null {
  const head = (JSON.parse(skeletonText) as { skeleton?: Record<string, unknown> }).skeleton ?? {};
  const n = (v: unknown): number | null => (typeof v === 'number' ? v : null);
  const width = n(head.width);
  const height = n(head.height);
  if (width === null || height === null) return null;
  return [n(head.x) ?? 0, n(head.y) ?? 0, width, height];
}

/** One built output directory's bounds row; `plant` is handed to the core's side, which is how a control plants a misreading. */
export function boundsRow(name: string, outDir: string, plant: CorePlant = {}): BoundsRow {
  const skeleton = join(outDir, 'skeleton.json');
  const atlas = join(outDir, 'skeleton.atlas');
  const model = join(outDir, MODEL_DOCUMENT_FILE);
  const missing = [skeleton, atlas, model].filter((p) => !existsSync(p));
  const refused = (why: string): BoundsRow => ({ name, verdict: 'REFUSED', why, core: null, spine: null, header: null, staged: false });
  if (missing.length > 0) return refused(`the build wrote no ${missing.map((p) => p.slice(outDir.length + 1)).join(', ')}`);
  return boundsOfTexts(name, readFileSync(skeleton, 'utf8'), readFileSync(atlas, 'utf8'), readFileSync(model, 'utf8'), plant);
}

/** `boundsRow` over the three texts, for a pair a control wrote itself. */
export function boundsOfTexts(name: string, skeletonText: string, atlasText: string, modelText: string, plant: CorePlant = {}): BoundsRow {
  let core: number[] | null;
  let spine: number[] | null;
  let staged: boolean;
  const header = headerBoxOf(skeletonText);
  try {
    const doc = readModel(modelText, `${name}: ${MODEL_DOCUMENT_FILE}`);
    staged = doc.stated?.stage != null;
    spine = spineSetupBounds(loadOracleData(skeletonText, atlasText, `${name}: skeleton.json`));
    try {
      const box = setupBounds(doc, plant);
      core = box === null ? null : [box.x, box.y, box.width, box.height];
    } catch (err) {
      if (!(err instanceof CoreInputError)) throw err;
      // The core leaves this setup pose out: nothing to compare, and the header must say nothing either (`headerBoundsOf`).
      return header === null
        ? { name, verdict: 'SKIP', why: err.message, core: null, spine, header, staged }
        : { name, verdict: 'DIFF', why: `the core does not pose this setup pose (${err.message}), and the header still carries [${header.join(', ')}]`, core: null, spine, header, staged };
    }
  } catch (err) {
    if (err instanceof OracleInputError || err instanceof CoreInputError) return { name, verdict: 'REFUSED', why: err.message, core: null, spine: null, header: null, staged: false };
    throw err;
  }
  const FIELDS = ['x', 'y', 'width', 'height'];
  const spell = (b: number[] | null): string => (b === null ? 'none' : `[${b.join(', ')}]`);
  let why: string | null = null;
  if ((core === null) !== (spine === null)) why = `rigc's core bounds ${spell(core)} and spine-core's getBounds ${spell(spine)}`;
  else if (core !== null && spine !== null) {
    const at = core.findIndex((v, i) => v !== spine?.[i]);
    if (at >= 0) why = `${FIELDS[at]}: rigc's core ${core[at]}, spine-core's getBounds ${spine[at]} (tolerance 0)`;
  }
  if (why === null) {
    const want = !staged || spine === null ? null : spine.map(headerBoxNumber);
    if ((want === null) !== (header === null)) why = `the header carries ${spell(header)} where ${want === null ? (staged ? 'nothing is drawn, so no box' : 'the model declares no stage, so no box') : `getBounds on the header's grid is ${spell(want)}`}`;
    else if (want !== null && header !== null) {
      const at = want.findIndex((v, i) => v !== header[i]);
      if (at >= 0) why = `the header's ${FIELDS[at]} is ${header[at]}, getBounds on the header's grid is ${want[at]}`;
    }
  }
  return { name, verdict: why === null ? 'IDENTICAL' : 'DIFF', why, core, spine, header, staged };
}

/** Every built row's bounds row. */
export function boundsBuilt(built: readonly BuiltRow[], plant: CorePlant = {}): BoundsRow[] {
  return built.map((b) => boundsRow(b.name, b.out, plant));
}

/** The bounds rows' lines and their verdict line: GREEN with no row DIFF or REFUSED and at least one row IDENTICAL — a run of SKIPs compared nothing. */
export function boundsLines(rows: readonly BoundsRow[]): { lines: string[]; ok: boolean } {
  const lines = rows.map(
    (r) =>
      `  BOUNDS ${r.verdict.padEnd(9)} ${r.name}: ` +
      (r.verdict === 'REFUSED' ? '' : `getBounds ${r.spine === null ? 'none' : `[${r.spine.join(', ')}]`}, header ${r.header === null ? 'no box' : `[${r.header.join(', ')}]`}${r.staged ? '' : ' (no stage declared)'}`) +
      (r.why === null ? '' : ` — ${r.why}`),
  );
  const count = (v: BoundsRow['verdict']): number => rows.filter((r) => r.verdict === v).length;
  const ok = count('IDENTICAL') > 0 && count('DIFF') === 0 && count('REFUSED') === 0;
  lines.push(
    `BOUNDS ${ok ? 'GREEN' : 'RED'} — ${rows.length} row(s): rigc's setup-pose bounding box against spine-core's getBounds at tolerance 0, and the header against it on the header's grid: ` +
      `${count('IDENTICAL')} IDENTICAL, ${count('SKIP')} SKIP, ${count('DIFF')} DIFF, ${count('REFUSED')} REFUSED (issue #907)`,
  );
  return { lines, ok };
}
// --- #907 the setup-pose bounding box: end ---

// --- #1591 the runtime poser: begin ---

/** The blocks of a pose the runtime poser writes, compared cell by cell (`strictPoseDiff`) as well as by `compare`. */
const RUNTIME_POSE_BLOCKS = ['bones', 'slots', 'drawOrder', 'attachments', 'clips', 'clipped'] as const;

/** One built row's third dumper (issue #1591): the runtime poser against the oracle at tolerance 0, or why not. */
export interface RuntimeRow {
  name: string;
  /** IDENTICAL: covered whole and equal. SKIP: refused at load, or animations or events left out, every one named. DIFF: a compared value differs. REFUSED: the build or a document could not be read. */
  verdict: GateVerdict;
  why: string | null;
  /** The model's own refusal, when it was refused at load. */
  refusedAtLoad: readonly RuntimeMissing[] | null;
  /** The animations posed and compared, and those refused with what each misses. */
  covered: string[];
  refusedAnimations: ReadonlyArray<{ animation: string; missing: readonly RuntimeMissing[] }>;
  /** Poses compared (the setup pose and every covered sample) and numbers compared in them, cell by cell. */
  poses: number;
  values: number;
  /** A covered animation keys events, which the runtime does not fire (`RUNTIME_NO_EVENTS_WHY`). */
  eventsNotFired: boolean;
}

/** Each feature once, with how often and the first object it was found on — a refusal list as a reader reads it. */
export function missingSummary(missing: readonly RuntimeMissing[]): string {
  const by = new Map<string, { n: number; first: RuntimeMissing }>();
  for (const m of missing) {
    const kept = by.get(m.feature);
    if (kept === undefined) by.set(m.feature, { n: 1, first: m });
    else kept.n++;
  }
  return [...by.values()].map(({ n, first }) => `${n > 1 ? `${first.feature} ×${n}` : first.feature} (first: ${missingText(first).slice(first.feature.length + 2)})`).join('; ');
}

/** The numbers in a value, counted — what a cell-by-cell comparison of it compared. */
function numbersIn(v: unknown): number {
  if (typeof v === 'number') return 1;
  if (Array.isArray(v)) return v.reduce((n: number, x) => n + numbersIn(x), 0);
  return 0;
}

/**
 * The first pose cell where two documents of one model differ, compared as
 * written (raw doubles, so text equality is equality of the doubles, `-0`
 * written `0`), or `null`: every block of `RUNTIME_POSE_BLOCKS` both carry, at
 * setup and at every sample of every animation the second carries. `compare`
 * leaves a bone out where either side's matrix is ill-conditioned; this reads
 * every cell, so the two together are tolerance 0 with no exception.
 */
export function strictPoseDiff(oracle: OracleDocument, runtime: OracleDocument): { first: string | null; poses: number; values: number } {
  let poses = 0;
  let values = 0;
  const pose = (where: string, a: Record<string, unknown>, b: Record<string, unknown>, fields: readonly string[]): string | null => {
    poses++;
    for (const f of fields) {
      const x = a[f];
      const y = b[f];
      if (x === null || y === null || x === undefined || y === undefined) continue;
      values += numbersIn(y);
      if (JSON.stringify(x) === JSON.stringify(y)) continue;
      if (Array.isArray(x) && Array.isArray(y)) {
        const at = x.findIndex((row, i) => JSON.stringify(row) !== JSON.stringify(y[i]));
        const k = at < 0 ? Math.min(x.length, y.length) : at;
        return `${where}.${f}[${k}]: the oracle ${JSON.stringify(x[k])?.slice(0, 160)}, the runtime ${JSON.stringify(y[k])?.slice(0, 160)}`;
      }
      return `${where}.${f}: the oracle ${JSON.stringify(x)}, the runtime ${JSON.stringify(y)}`;
    }
    return null;
  };
  const setup = pose('setup', oracle.setup as unknown as Record<string, unknown>, runtime.setup as unknown as Record<string, unknown>, RUNTIME_POSE_BLOCKS);
  if (setup !== null) return { first: setup, poses, values };
  for (const a of runtime.animations ?? []) {
    const o = oracle.animations?.find((x) => x.name === a.name);
    if (o === undefined) return { first: `animation "${a.name}": the oracle has none`, poses, values };
    if (o.duration !== a.duration || o.samples.length !== a.samples.length) return { first: `animation "${a.name}": the oracle's duration ${o.duration} over ${o.samples.length} sample(s), the runtime's ${a.duration} over ${a.samples.length}`, poses, values };
    for (let i = 0; i < a.samples.length; i++) {
      const first = pose(`animation "${a.name}" sample ${i}`, o.samples[i] as unknown as Record<string, unknown>, a.samples[i] as unknown as Record<string, unknown>, ['t', 'events', ...RUNTIME_POSE_BLOCKS]);
      if (first !== null) return { first, poses, values };
    }
  }
  return { first: null, poses, values };
}

/** The oracle's document with only the animations the runtime posed, for a like-for-like comparison. */
function coveredOf(oracle: OracleDocument, covered: ReadonlySet<string>): OracleDocument {
  return { ...oracle, animations: oracle.animations === null ? null : oracle.animations.filter((a) => covered.has(a.name)) };
}

/** One built output directory's runtime row; `plant` is handed to the runtime's load, which is how a control plants a misreading. */
export function runtimeRow(name: string, outDir: string, plant: RuntimePlant = {}): RuntimeRow {
  const model = join(outDir, MODEL_DOCUMENT_FILE);
  const atlas = join(outDir, 'skeleton.atlas');
  const missing = [atlas, model].filter((p) => !existsSync(p));
  if (missing.length > 0) return { name, verdict: 'REFUSED', why: `the build wrote no ${missing.map((p) => p.slice(outDir.length + 1)).join(', ')}`, refusedAtLoad: null, covered: [], refusedAnimations: [], poses: 0, values: 0, eventsNotFired: false };
  return runtimeOfTexts(name, readFileSync(model, 'utf8'), readFileSync(atlas, 'utf8'), plant);
}

/** `runtimeRow` over the model and atlas texts, for a document a control wrote itself (an empty atlas text: no page UVs on either side). */
export function runtimeOfTexts(name: string, modelText: string, atlasText: string, plant: RuntimePlant = {}): RuntimeRow {
  const options = rawOptions(GATE_OPTIONS, true);
  const empty = (verdict: GateVerdict, why: string, refusedAtLoad: readonly RuntimeMissing[] | null = null): RuntimeRow => ({ name, verdict, why, refusedAtLoad, covered: [], refusedAnimations: [], poses: 0, values: 0, eventsNotFired: false });
  let rt: RuntimeDump;
  let oracle: OracleDocument;
  try {
    const doc = readModel(modelText, `${name}: ${MODEL_DOCUMENT_FILE}`);
    try {
      rt = runtimeDump(doc, options, plant);
    } catch (err) {
      if (err instanceof RuntimeRefusal) return empty('SKIP', `refused at load — ${missingSummary(err.missing)}`, err.missing);
      throw err;
    }
    oracle = coreDump(doc, options, {}, atlasText === '' ? null : uvSourceOf(atlasText, modelText));
  } catch (err) {
    if (err instanceof OracleInputError || err instanceof CoreInputError) return empty('REFUSED', err.message);
    throw err;
  }
  const covered = rt.document.animations?.map((a) => a.name) ?? [];
  const eventsNotFired = (rt.document.absent ?? []).some((x) => x[0] === 'animations.events');
  const base = { name, refusedAtLoad: null, covered, refusedAnimations: rt.refused, eventsNotFired };
  const oracleSide = coveredOf(oracle, new Set(covered));
  const c = compareDumps(withoutUvs(oracleSide), withoutUvs(rt.document), RAW_TOLERANCE);
  const strict = strictPoseDiff(oracleSide, rt.document);
  const figures = { poses: strict.poses, values: strict.values };
  if (!c.identical) return { ...base, ...figures, verdict: 'DIFF', why: `compare: ${c.first}` };
  if (strict.first !== null) return { ...base, ...figures, verdict: 'DIFF', why: `cell by cell: ${strict.first}` };
  const skipped: string[] = [];
  for (const r of rt.refused) skipped.push(`animation "${r.animation}" refused — ${missingSummary(r.missing)}`);
  for (const [block, why] of oracleSide.absent ?? []) if (!block.endsWith('.uvs') && RUNTIME_POSE_BLOCKS.some((b) => block.endsWith(`.${b}`))) skipped.push(`${block} left out by the oracle — ${why}`);
  if (eventsNotFired) skipped.push(`events: not fired (${RUNTIME_NO_EVENTS_WHY})`);
  return { ...base, ...figures, verdict: skipped.length === 0 ? 'IDENTICAL' : 'SKIP', why: skipped.length === 0 ? null : skipped.join(' | ') };
}

/**
 * A document with its page UVs emptied and no longer named absent: the UVs are
 * the atlas's and the runtime writes none (`RUNTIME_NO_UVS_WHY`), so both
 * sides are handed to `compare` without them rather than as one side's SKIP.
 */
function withoutUvs(d: OracleDocument): OracleDocument {
  return {
    ...d,
    absent: (d.absent ?? []).filter((x) => !x[0].endsWith('.uvs')),
    setup: { ...d.setup, uvs: [] },
    animations: d.animations === null ? null : d.animations.map((a) => ({ ...a, samples: a.samples.map((x) => ({ ...x, uvs: [] })) })),
  };
}

/** Every built row's runtime row, a refused build chain named. */
export function runtimeBuilt(built: readonly BuiltRow[], plant: RuntimePlant = {}): RuntimeRow[] {
  return built.map((r) => (r.exits.some((e) => e !== 0) ? { name: r.name, verdict: 'REFUSED' as const, why: `the build chain exited ${JSON.stringify(r.exits)}`, refusedAtLoad: null, covered: [], refusedAnimations: [], poses: 0, values: 0, eventsNotFired: false } : runtimeRow(r.name, r.out, plant)));
}

/**
 * The runtime rows' lines and their verdict line: GREEN with no row DIFF or
 * REFUSED. A corpus the runtime poses none of compares nothing, which is a
 * HOLE line and not a pass: the count of rows covered whole, partly and
 * refused is printed beside it, and each feature that refused one, with its
 * rows.
 */
export function runtimeLines(rows: readonly RuntimeRow[]): { lines: string[]; ok: boolean } {
  const lines = rows.map(
    (r) =>
      `  RUNTIME ${r.verdict.padEnd(9)} ${r.name}: ` +
      (r.refusedAtLoad === null && r.verdict !== 'REFUSED' ? `${r.poses} pose(s) and ${r.values} value(s) compared at tolerance 0, ${r.covered.length} animation(s) posed, ${r.refusedAnimations.length} refused` : '') +
      (r.why === null ? '' : `${r.refusedAtLoad === null && r.verdict !== 'REFUSED' ? ' — ' : ''}${r.why}`),
  );
  const count = (v: GateVerdict): number => rows.filter((r) => r.verdict === v).length;
  const atLoad = rows.filter((r) => r.refusedAtLoad !== null);
  const partly = rows.filter((r) => r.verdict === 'SKIP' && r.refusedAtLoad === null);
  const poses = rows.reduce((n, r) => n + r.poses, 0);
  const values = rows.reduce((n, r) => n + r.values, 0);
  const features = new Map<string, Set<string>>();
  for (const r of rows) for (const m of [...(r.refusedAtLoad ?? []), ...r.refusedAnimations.flatMap((x) => x.missing)]) features.set(m.feature, (features.get(m.feature) ?? new Set()).add(r.name));
  for (const r of rows) if (r.eventsNotFired) features.set('events (not fired; posed)', (features.get('events (not fired; posed)') ?? new Set()).add(r.name));
  for (const [f, names] of [...features].sort((x, y) => (x[0] < y[0] ? -1 : 1))) lines.push(`  RUNTIME SKIP feature ${f}: ${names.size} row(s) — ${[...names].join(', ')}`);
  if (count('IDENTICAL') === 0) lines.push(`  HOLE  runtime: no row is posed whole by the runtime poser (stage ${RUNTIME_STAGE}), so no model was held to the oracle in full`);
  if (poses === 0) lines.push(`  HOLE  runtime: the runtime poser posed nothing in this corpus, so the third dumper compared nothing`);
  const ok = count('DIFF') === 0 && count('REFUSED') === 0;
  lines.push(
    `RUNTIME ${ok ? 'GREEN' : 'RED'} — ${rows.length} row(s): the runtime poser (stage ${RUNTIME_STAGE}) against the oracle at tolerance 0, --raw doubles, compared and cell by cell: ` +
      `${count('IDENTICAL')} covered whole and IDENTICAL, ${partly.length} covered in part (SKIP, every animation or block left out named), ${atLoad.length} refused at load (SKIP, every feature named), ${count('DIFF')} DIFF, ${count('REFUSED')} REFUSED; ` +
      `${poses} pose(s), ${values} value(s) compared (issue #1591)`,
  );
  return { lines, ok };
}
// --- #1591 the runtime poser: end ---

/** The no-skin probes walked (`--walk`): A10's walk is posed with no skin set, so each probe is a row as it stands. */
export function noSkinWalkProbes(dir: string, walkPlant: WalkPlant = {}): WalkRow[] {
  return walkBuilt(noSkinProbeBuilds(dir), walkPlant);
}

// --- #1049 slider physics: begin ---
/**
 * A slider whose animation keys physics timelines (issue #1049), spelled
 * twice — the Spine file and the model document — over one bone tree: `block`
 * under the root with `tip` and `tip2` hanging off it (the bones the physics
 * constraints drive) and two dial bones `d0`, `d1`. Bones only: no slot, no
 * atlas. Under the step a slider applies its animation's physics keys to the
 * pass's physics records at its place in the update order, and a physics
 * constraint after it steps with what it wrote (`./src/core/constraints_slider.ts`,
 * *Its physics timelines*); the shape says which constraints stand where and
 * what each animation keys, so a probe and a seeded rig are the same spelling.
 */
export interface SliderPhysicsShape {
  /** `block`'s setup rotation and `tip2`'s. */
  rotations: [number, number];
  /** Each physics constraint: its name, its bone (`tip` or `tip2`) and every field it states. */
  physics: Array<{ name: string; bone: 'tip' | 'tip2'; fields: Record<string, number | boolean> }>;
  /** Each slider: its name, its animation and every field it states (`bone` among them, or `time` for the bone-less form). */
  sliders: Array<{ name: string; animation: string; fields: Record<string, number | boolean | string> }>;
  /** Every constraint's name, in the update order. */
  order: string[];
  /** Each animation: bone keys (`rotate` `{ time, value }`, `translate` `{ time, x, y }`), physics keys by constraint (`*` the one naming none) and kind, slider keys. */
  animations: Array<{
    name: string;
    bones: Array<{ bone: string; timeline: 'rotate' | 'translate'; keys: Array<Record<string, number>> }>;
    physics: Array<{ name: string; kind: string; keys: Array<Record<string, number>> }>;
    sliders: Array<{ name: string; kind: 'time' | 'mix'; keys: Array<Record<string, number>> }>;
  }>;
}

/** The two texts of a shape (`SliderPhysicsShape`). */
export function sliderPhysicsPair(shape: SliderPhysicsShape): { spine: string; model: string } {
  type Obj = Record<string, unknown>;
  const bones: Obj[] = [
    { name: 'root' }, { name: 'block', parent: 'root', length: 12, rotation: shape.rotations[0] }, { name: 'tip', parent: 'block', x: 12, length: 8 },
    { name: 'tip2', parent: 'tip', x: 8, length: 6, rotation: shape.rotations[1] }, { name: 'd0', parent: 'root', y: 40 }, { name: 'd1', parent: 'root', x: 20, y: 40 },
  ];
  const byName = new Map<string, Obj>([
    ...shape.physics.map((p): [string, Obj] => [p.name, { type: 'physics', name: p.name, bone: p.bone, ...p.fields }]),
    ...shape.sliders.map((s): [string, Obj] => [s.name, { type: 'slider', name: s.name, animation: s.animation, ...s.fields }]),
  ]);
  const constraints = shape.order.map((n) => byName.get(n) as Obj);
  const group = <K extends { keys: Array<Record<string, number>> }>(list: readonly K[], outer: (k: K) => string, inner: (k: K) => string): Record<string, Record<string, Array<Record<string, number>>>> => {
    const out: Record<string, Record<string, Array<Record<string, number>>>> = {};
    for (const k of list) (out[outer(k)] ??= {})[inner(k)] = k.keys;
    return out;
  };
  const spineAnims: Obj = {};
  // The file lists animations in the editor's order (`editorAnimationOrder`), which is the order spine-core walks them in and `fileAnimationOrder` reads back.
  for (const a of editorAnimationOrder(shape.animations.map((x) => x.name)).map((n) => shape.animations.find((x) => x.name === n) as SliderPhysicsShape['animations'][number])) {
    const anim: Obj = {};
    if (a.bones.length > 0) anim.bones = group(a.bones, (k) => k.bone, (k) => k.timeline);
    if (a.physics.length > 0) anim.physics = group(a.physics, (k) => (k.name === EVERY_GLOBAL_PHYSICS ? '' : k.name), (k) => k.kind);
    if (a.sliders.length > 0) anim.slider = group(a.sliders, (k) => k.name, (k) => k.kind);
    spineAnims[a.name] = anim;
  }
  const listed = <K extends { keys: Array<Record<string, number>> }>(list: readonly K[], outer: (k: K) => string, inner: (k: K) => string): Array<{ name: string; timelines: Array<{ name: string; keys: Array<Record<string, number>> }> }> => {
    const out: Array<{ name: string; timelines: Array<{ name: string; keys: Array<Record<string, number>> }> }> = [];
    for (const k of list) {
      let entry = out.find((e) => e.name === outer(k));
      if (entry === undefined) out.push((entry = { name: outer(k), timelines: [] }));
      entry.timelines.push({ name: inner(k), keys: k.keys });
    }
    return out;
  };
  return {
    spine: JSON.stringify({ skeleton: { spine: '4.3.13' }, bones, slots: [], constraints, skins: [{ name: 'default', attachments: {} }], animations: spineAnims }),
    model: JSON.stringify({
      spec: 'rigc-compiled/1', referenceScale: 100, bones, slots: [], skins: [{ name: 'default', bones: [], constraints: {}, attachments: {} }],
      constraints: constraints.map(({ type, name, ...c }) => ({ kind: type, name, declaredIn: 'rig', ...c })), events: [],
      animations: shape.animations.map((a) => ({
        name: a.name, duration: 0, bones: listed(a.bones, (k) => k.bone, (k) => k.timeline), slots: [],
        constraints: { ik: [], transform: [], path: [], physics: listed(a.physics, (k) => k.name, (k) => k.kind), slider: listed(a.sliders, (k) => k.name, (k) => k.kind) },
        attachments: [], drawOrder: [], events: [],
      })),
      images: [], pageGrids: [], droppedStates: [], absentParts: [], meshBones: {}, meshes: {}, physics: [], deformTransforms: [], trackDerivations: [], rig: {}, spine: { sha256: '0'.repeat(64) },
    }),
  };
}

/** A physics constraint driving every component a probe reads, at its parameters' defaults but a stated mass and strength. */
const PROBE_JIGGLE = { x: 1, y: 1, rotate: 1, inertia: 0.5, strength: 100, damping: 0.85, mass: 1 };
/** A dial-driven slider reading `d0`'s local rotation: 0° is time 0.5. */
const probeDial = (bone: string, additive: boolean, extra: Record<string, number | boolean> = {}): Record<string, number | boolean | string> => ({ bone, property: 'rotate', local: true, additive, from: -50, scale: 0.01, ...extra });
/** The track that moves `block` — what a physics constraint integrates — and turns the dials. */
const PROBE_SWAY = { name: 'sway', bones: [{ bone: 'block', timeline: 'rotate' as const, keys: [{ time: 0, value: 0 }, { time: 0.4, value: 40 }, { time: 1, value: 0 }] }, { bone: 'd0', timeline: 'rotate' as const, keys: [{ time: 0, value: 0 }, { time: 1, value: 60 }] }], physics: [], sliders: [] };
const ramp = (from: number, to: number): Array<Record<string, number>> => [{ time: 0, value: from }, { time: 1, value: to }];

/**
 * The probe rows `core_gate` runs beside the corpus under the step and on
 * A10's walk (issue #1049): each one rule of a slider's physics keys, and
 * each its own row so a red one names the rule. No production rig is known
 * to carry the construct, so these are what the gate holds it with.
 */
export const SLIDER_PHYSICS_PROBES: ReadonlyArray<readonly [string, SliderPhysicsShape]> = [
  ['additive wind, the slider before the constraint', {
    rotations: [0, 0], physics: [{ name: 'j', bone: 'tip', fields: PROBE_JIGGLE }], sliders: [{ name: 's', animation: 's-pose', fields: probeDial('d0', true) }], order: ['s', 'j'],
    animations: [{ name: 's-pose', bones: [], physics: [{ name: 'j', kind: 'wind', keys: ramp(0, 400) }], sliders: [] }, PROBE_SWAY],
  }],
  ['non-additive gravity at mix 0.5', {
    rotations: [10, 0], physics: [{ name: 'j', bone: 'tip', fields: { ...PROBE_JIGGLE, gravity: 2 } }], sliders: [{ name: 's', animation: 's-pose', fields: probeDial('d0', false, { mix: 0.5 }) }], order: ['s', 'j'],
    animations: [{ name: 's-pose', bones: [], physics: [{ name: 'j', kind: 'gravity', keys: ramp(-200, 300) }], sliders: [] }, PROBE_SWAY],
  }],
  ['the six values a key writes, from an additive slider', {
    rotations: [-20, 30], physics: [{ name: 'j', bone: 'tip', fields: { ...PROBE_JIGGLE, wind: 1 } }, { name: 'k', bone: 'tip2', fields: { ...PROBE_JIGGLE, scaleX: 0.5, shearX: 0.5 } }], sliders: [{ name: 's', animation: 's-pose', fields: probeDial('d0', true, { mix: 0.7 }) }], order: ['s', 'j', 'k'],
    animations: [{ name: 's-pose', bones: [], physics: [{ name: 'j', kind: 'mass', keys: ramp(0.5, 3) }, { name: 'j', kind: 'strength', keys: ramp(20, 300) }, { name: 'j', kind: 'damping', keys: ramp(0.4, 1) }, { name: 'k', kind: 'inertia', keys: ramp(0.1, 1) }, { name: 'k', kind: 'mix', keys: ramp(0.2, 1.2) }, { name: 'k', kind: 'wind', keys: ramp(-100, 100) }], sliders: [] }, PROBE_SWAY],
  }],
  ['the timeline naming no constraint, two sliders', {
    rotations: [0, 15], physics: [{ name: 'j', bone: 'tip', fields: { ...PROBE_JIGGLE, windGlobal: true } }, { name: 'k', bone: 'tip2', fields: { ...PROBE_JIGGLE, windGlobal: true, gravityGlobal: true } }], sliders: [{ name: 's', animation: 's-pose', fields: probeDial('d0', true) }, { name: 't', animation: 't-pose', fields: probeDial('d1', false, { loop: true }) }], order: ['s', 'j', 't', 'k'],
    animations: [{ name: 's-pose', bones: [], physics: [{ name: EVERY_GLOBAL_PHYSICS, kind: 'wind', keys: ramp(0, 300) }], sliders: [] }, { name: 't-pose', bones: [], physics: [{ name: EVERY_GLOBAL_PHYSICS, kind: 'gravity', keys: ramp(150, -150) }], sliders: [] }, PROBE_SWAY],
  }],
  ['a constraint before the slider, and a reset key under it, write nothing', {
    rotations: [0, 0], physics: [{ name: 'j', bone: 'tip', fields: PROBE_JIGGLE }, { name: 'k', bone: 'tip2', fields: PROBE_JIGGLE }], sliders: [{ name: 's', animation: 's-pose', fields: probeDial('d0', true) }], order: ['j', 's', 'k'],
    animations: [{ name: 's-pose', bones: [], physics: [{ name: 'j', kind: 'wind', keys: ramp(0, 400) }, { name: 'k', kind: 'reset', keys: [{ time: 0 }, { time: 0.3 }] }], sliders: [] }, PROBE_SWAY],
  }],
  ['a slider whose time and mix the track keys', {
    rotations: [5, 0], physics: [{ name: 'j', bone: 'tip', fields: PROBE_JIGGLE }], sliders: [{ name: 's', animation: 's-pose', fields: { additive: true, time: 0.2 } }], order: ['s', 'j'],
    animations: [{ name: 's-pose', bones: [], physics: [{ name: 'j', kind: 'wind', keys: ramp(-300, 300) }], sliders: [] }, { ...PROBE_SWAY, sliders: [{ name: 's', kind: 'time', keys: ramp(0, 1) }, { name: 's', kind: 'mix', keys: ramp(1, 0.3) }] }],
  }],
];

/** The kinds a physics timeline keys, `reset` among them. */
const SLIDER_PHYSICS_KINDS = ['inertia', 'strength', 'damping', 'mass', 'wind', 'gravity', 'mix', 'reset'] as const;

/**
 * One seeded shape (`SliderPhysicsShape`) from `rnd`, a generator of numbers
 * in [0, 1): one or two physics constraints on `tip` and `tip2` driving
 * random components with random parameters and `…Global` flags; one or two
 * sliders, dial-driven or bone-less, additive or not, looping or not, at a
 * mix of 1 or another; every constraint in a random order; each slider's
 * animation keying one to three physics timelines of any kind on a named
 * constraint or the one naming none; and a track, `sway`, that moves `block`,
 * turns the dials and may key physics, a slider's time and its mix itself.
 * The core suite's `CO31` draws its population here.
 */
export function sliderPhysicsShape(rnd: () => number): SliderPhysicsShape {
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
  const R = (a: number, b: number): number => Math.round((a + (b - a) * rnd()) * 1000) / 1000;
  const physics: SliderPhysicsShape['physics'] = [];
  for (let i = 0, n = 1 + Math.floor(rnd() * 2); i < n; i++) {
    const fields: Record<string, number | boolean> = { x: pick([0, 0, 0.5, 1]), y: pick([0, 0, 0.5, 1]), rotate: pick([0, 0.5, 1, 1]), scaleX: pick([0, 0, 0.5]), shearX: pick([0, 0, 0.5]) };
    if (Object.values(fields).every((v) => v === 0)) fields.x = 1;
    Object.assign(fields, { inertia: R(0.1, 1), strength: R(20, 200), damping: R(0.5, 1), mass: R(0.5, 3), wind: pick([0, R(-3, 3)]), gravity: pick([0, R(-3, 3)]), mix: pick([1, R(0.3, 1)]) });
    for (const k of ['inertia', 'strength', 'damping', 'mass', 'wind', 'gravity', 'mix']) if (rnd() < 0.3) fields[`${k}Global`] = true;
    physics.push({ name: `p${i}`, bone: i === 0 ? 'tip' : 'tip2', fields });
  }
  const value = (kind: string): number =>
    kind === 'inertia' ? R(0, 1) : kind === 'strength' ? R(10, 300) : kind === 'damping' ? R(0.3, 1) : kind === 'mass' ? R(0.3, 4) : kind === 'mix' ? pick([0, R(0, 1.3), 1]) : R(-300, 300);
  const physicsKeys = (n: number): SliderPhysicsShape['animations'][number]['physics'] => {
    const out: SliderPhysicsShape['animations'][number]['physics'] = [];
    for (let k = 0; k < n; k++) {
      const kind = pick(SLIDER_PHYSICS_KINDS);
      const global = kind === 'reset' || physics.some((p) => p.fields[`${kind}Global`] === true);
      const name = global && rnd() < 0.25 ? EVERY_GLOBAL_PHYSICS : pick(physics).name;
      if (out.some((x) => x.name === name && x.kind === kind)) continue;
      const times = [...[0, R(0.2, 0.6)].filter(() => rnd() < 0.7), 1];
      out.push({ name, kind, keys: times.map((time): Record<string, number> => (kind === 'reset' ? { time } : { time, value: value(kind) })) });
    }
    return out;
  };
  const sliders: SliderPhysicsShape['sliders'] = [];
  const animations: SliderPhysicsShape['animations'] = [];
  for (let i = 0, n = 1 + Math.floor(rnd() * 2); i < n; i++) {
    const fields: Record<string, number | boolean | string> = rnd() < 0.8 ? { bone: `d${i}`, property: 'rotate', local: true, from: R(-90, 0), scale: 0.01 } : { time: R(0, 1) };
    fields.additive = rnd() < 0.6;
    if (rnd() < 0.2) fields.loop = true;
    if (rnd() < 0.4) fields.mix = pick([0.5, 0.7, -0.3, 1.4, 0.25]);
    sliders.push({ name: `s${i}`, animation: `s${i}-pose`, fields });
    animations.push({ name: `s${i}-pose`, bones: rnd() < 0.3 ? [{ bone: 'block', timeline: 'rotate', keys: [{ time: 0, value: 0 }, { time: 1, value: R(-30, 30) }] }] : [], physics: physicsKeys(1 + Math.floor(rnd() * 3)), sliders: [] });
  }
  animations.push({
    name: 'sway',
    bones: [
      { bone: 'block', timeline: 'rotate', keys: [{ time: 0, value: 0 }, { time: 0.4, value: R(-60, 60) }, { time: 1, value: 0 }] },
      { bone: 'block', timeline: 'translate', keys: [{ time: 0, x: 0, y: 0 }, { time: 0.6, x: R(-20, 20), y: R(-20, 20) }, { time: 1, x: 0, y: 0 }] },
      ...sliders.filter((x) => typeof x.fields.bone === 'string' && rnd() < 0.7).map((x) => ({ bone: x.fields.bone as string, timeline: 'rotate' as const, keys: [{ time: 0, value: 0 }, { time: 1, value: R(0, 90) }] })),
    ],
    physics: rnd() < 0.4 ? physicsKeys(1) : [],
    sliders: sliders.filter(() => rnd() < 0.25).map((x) => ({ name: x.name, kind: pick(['time', 'mix'] as const), keys: [{ time: 0, value: R(0, 1) }, { time: 1, value: R(0, 1) }] })),
  });
  const order = [...physics.map((p) => p.name), ...sliders.map((x) => x.name)].map((n) => [rnd(), n] as const).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  return { rotations: [R(-40, 40), R(-30, 30)], physics, sliders, order, animations };
}

/** Each probe walked as A10 walks it (`--walk`), a row named `probe/slider physics: …`. */
export function sliderPhysicsWalkRows(walkPlant: WalkPlant = {}): WalkRow[] {
  return SLIDER_PHYSICS_PROBES.map(([label, shape]) => {
    const pair = sliderPhysicsPair(shape);
    return walkPair(`probe/slider physics: ${label}`, pair.spine, '', pair.model, walkPlant);
  });
}

/** Each probe's stepped run (`steppedRun`) beside the corpus's, under `--raw` at tolerance 0 when `raw`. */
export function sliderPhysicsSteppedLines(raw: boolean): { lines: string[]; ok: boolean } {
  const lines: string[] = [];
  let ok = true;
  for (const [label, shape] of SLIDER_PHYSICS_PROBES) {
    const pair = sliderPhysicsPair(shape);
    const name = `probe/slider physics: ${label}`;
    const st = steppedRun(pair.spine, '', name, pair.model, name, {}, raw ? RAW_TOLERANCE : { xy: ORACLE_DEFAULT_TOL, m: ORACLE_DEFAULT_TOL }, STEPPED_OPTIONS.skin, undefined, raw);
    if (st.verdict !== 'IDENTICAL') ok = false;
    lines.push(`  ${st.verdict.padEnd(9)} ${name}: stepped (--physics step, dt ${st.dt} in both documents), ${st.boneSamples} bone-sample(s)${st.why === null ? '' : ` — ${st.why}`}`);
  }
  lines.push(`SLIDER PHYSICS PROBES ${ok ? 'IDENTICAL' : 'DIFF'} — ${SLIDER_PHYSICS_PROBES.length} probe(s) stepped${raw ? ' at tolerance 0' : ''}, beside the corpus (issue #1049)`);
  return { lines, ok };
}
// --- #1049 slider physics: end ---

/** The command; returns the exit code. */
export function gateMain(argv: readonly string[], print: (line: string) => void = console.log, warn: (line: string) => void = console.error): number {
  const scope = new WorkDirectory('core_gate');
  try {
    const { argv: args, keep } = readKeepWork(argv, ['--raw', '--walk'], (m) => new GateInputError(m));
    const flags = parseFlags(args, ['--recipes', '--root', '--work'], ['--raw', '--walk']);
    const raw = flags.has('--raw');
    const walk = flags.has('--walk');
    if (raw && walk) throw new GateInputError('--raw and --walk are two runs: --walk compares full doubles already, at tolerance 0');
    const root = resolve(flags.get('--root') ?? TREE_ROOT);
    if (!existsSync(root) || !statSync(root).isDirectory()) throw new GateInputError(`--root ${root} is not a directory`);
    const named = flags.get('--recipes');
    const recipes = named === undefined ? treeRecipes(root, warn) : readRecipes(named);
    if (recipes.length === 0) throw new GateInputError('no recipes to run');
    const workFlag = flags.get('--work');
    const work = scope.open(workFlag, keep, 'rigc-core-gate-', (m) => new GateInputError(m));
    warn(`core_gate: ${recipes.length} recipe(s), work directory ${work}`);
    if (walk) {
      const walked = walkLines([...walkBuilt(buildRecipes(recipes, work, root, warn)), ...walkProbes(), ...noSkinWalkProbes(join(work, 'noskin-probes'))]);
      for (const line of walked.lines) print(line);
      // The slider-physics probes (issue #1049), their own block after the corpus's verdict, which they do not move.
      const sliders = walkLines(sliderPhysicsWalkRows());
      for (const line of sliders.lines) print(line.startsWith('WALK ') ? `SLIDER PHYSICS PROBES ${line} (issue #1049)` : line);
      return walked.ok && sliders.ok ? 0 : 1;
    }
    const built = buildRecipes(recipes, work, root, warn);
    const rows = gateBuilt(built, {}, undefined, raw);
    for (const row of rows) {
      const blocks = row.blocks === null ? '' : ` [${GATE_BLOCKS.map((b) => `${b} ${row.blocks?.[b].verdict}`).join(', ')}]`;
      print(
        `  ${row.verdict.padEnd(9)} ${row.name}${blocks}: ${row.boneSamples} bone-sample(s), ${row.slotRows} slot row(s) and ${row.attachmentRows} attachment row(s) of ${row.vertices} vertices compared, worst Δxy ${raw ? `${row.worstXy} ulp` : row.worstXy.toFixed(6)}, worst Δabcd ${raw ? `${row.worstM} ulp` : row.worstM.toFixed(6)}` +
          (row.why === null ? '' : ` — ${row.why}`),
      );
      for (const a of row.animations) print(`              animation ${JSON.stringify(a.name)}: bones ${a.bones}, slots ${a.slots}, drawOrder ${a.drawOrder}, attachments ${a.attachments}, clips ${a.clips}, clipped ${a.clipped}, uvs ${a.uvs}, events ${a.events}${a.why === null ? '' : ` — ${a.why}`}`);
      for (const k of row.perSkin ?? []) {
        print(`              skin ${JSON.stringify(k.skin)}: ${k.verdict} [${GATE_BLOCKS.map((b) => `${b} ${k.blocks[b].verdict}`).join(', ')}], stepped bones ${k.stepped.verdict}${k.why === null ? '' : ` — ${k.why}`}${k.stepped.why === null ? '' : ` — stepped: ${k.stepped.why}`}`);
      }
      const st = row.stepped;
      if (st !== undefined && ((row.constraintCensus?.physics ?? 0) > 0 || st.verdict !== 'IDENTICAL')) {
        print(`              stepped (--physics step, dt ${st.dt} in both documents): bones ${st.verdict}, ${st.boneSamples} bone-sample(s)${st.why === null ? '' : ` — ${st.why}`}`);
        for (const a of st.steps) print(`                steps between samples, ${JSON.stringify(a.animation)}: [${a.counts.join(', ')}] (${a.counts.reduce((x, y) => x + y, 0)} in all)`);
      }
    }
    print('');
    for (const line of censusTable(rows)) print(line);
    print('');
    for (const line of slotCensusTable(rows)) print(line);
    print('');
    for (const line of attachmentCensusTable(rows)) print(line);
    print('');
    for (const line of animationCensusTable(rows)) print(line);
    print('');
    for (const line of constraintCensusTable(rows)) print(line);
    print('');
    for (const line of pathCensusTable(rows)) print(line);
    print('');
    for (const line of steppedCensusTable(rows)) print(line);
    print('');
    for (const line of reachLines(rows)) print(line);
    for (const line of slotReachLines(rows)) print(line);
    for (const line of attachmentReachLines(rows)) print(line);
    for (const line of animationReachLines(rows)) print(line);
    for (const line of constraintReachLines(rows)) print(line);
    for (const line of pathReachLines(rows)) print(line);
    for (const line of steppedReachLines(rows)) print(line);
    for (const line of clippedReachLines(rows)) print(line);
    for (const line of uvReachLines(rows)) print(line);
    for (const line of skinReachLines(rows)) print(line);
    const kinds = new Map<string, string[]>();
    for (const row of rows) {
      const path = join(work, String(rows.indexOf(row)).padStart(String(rows.length).length, '0'), 'out', MODEL_DOCUMENT_FILE);
      if (existsSync(path)) kinds.set(row.name, readModel(readFileSync(path, 'utf8')).constraints.map((c) => c.kind));
    }
    for (const line of constraintKindLines(rows, kinds)) print(line);
    for (const line of timelineKindLines(rows)) print(line);
    // --- #966 raw: begin ---
    if (raw) for (const line of rawCensusLines(rows)) print(line);
    // --- #966 raw: end ---
    // Issue #1051: the rows posed with no skin set — the corpus's in the class, and the probes.
    const noSkin = noSkinLines(noSkinBuilt(built, noSkinProbeBuilds(join(work, 'noskin-probes')), raw));
    for (const line of noSkin.lines) print(line);
    // Issue #907: the header's setup-pose bounding box, rigc's core against spine-core's getBounds.
    const bounds = boundsLines(boundsBuilt(built));
    for (const line of bounds.lines) print(line);
    // Issue #1591: the third dumper, the runtime poser, against the oracle at tolerance 0.
    const runtime = runtimeLines(runtimeBuilt(built));
    for (const line of runtime.lines) print(line);
    const verdict = gateVerdict(rows);
    print(raw ? `RAW (full doubles, tolerance 0, worst in ulps) ${verdict.line}` : verdict.line);
    // The slider-physics probes (issue #1049), their own block after the corpus's verdict, which they do not move.
    const probes = sliderPhysicsSteppedLines(raw);
    for (const line of probes.lines) print(line);
    return verdict.ok && noSkin.ok && bounds.ok && runtime.ok && probes.ok ? 0 : 1;
  } catch (err) {
    if (err instanceof GateInputError || err instanceof HashesInputError) {
      warn(`core_gate: ${err.message}`);
      return 2;
    }
    throw err;
  } finally {
    scope.close(warn);
  }
}

if (import.meta.main) process.exit(gateMain(process.argv.slice(2)));
