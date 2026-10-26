/**
 * rigc's own core: it reads the compiled model as `build` writes it
 * (`rigc-compiled/3`, and `/2` before issue #1026 and `/1` before issue #1016;
 * `skeleton.model.json`)
 * and poses it (issue #925, step 2a
 * of issue #380). It is the second dumper `tools/pose_oracle.ts` was shaped
 * for: what it poses is written into the same `pose-oracle/2` document the
 * runtime's dump is, and `compare` holds the two to each other.
 *
 * ## What it poses, and what it does not yet
 *
 * Three constructs are here, in the runtime's own order (§5 of the design on
 * issue #380): **the setup pose of every bone** — its world origin and matrix,
 * its active flag and its parent (issue #925) — **the slots at the setup
 * pose** — what each shows, its colour and dark colour, the region path
 * the shown attachment names (issue #928, below) and its blend mode (issue
 * #933) — and **every drawn
 * attachment's world vertices at the setup pose** — a region's corners, a
 * mesh's vertices and a clipping polygon (issue #931, `./vertices.ts`, whose
 * header states each measured rule). All are rounded as the oracle rounds
 * (`gridRound`). A fourth, **every animation's bone and slot timelines at the
 * oracle's sample times** (issue #936), is its own module, `./animation.ts`,
 * which this reader calls for each animation record. Its remainder (issue
 * #955) — the draw order at setup and at a sample (`./draw_order.ts`), the
 * deform and sequence timelines, which move what the attachments and clips
 * draw at setup (under a slider) and at a sample (`./deform.ts`), and the
 * events a sample fires (`./events.ts`) — is posed too. With the physics
 * parameters (issue #956, `./constraints_physics.ts`) no block of the
 * oracle's document is left: `NOT_ADMITTED` is empty. The `clipped` block
 * (issue #964, `./clipping.ts`) — the triangles drawn under a clip, as the
 * runtime's clipper returns them — is posed at setup and at every sample,
 * and left out by name where a clip that is not strictly convex, or an
 * inverse one, starts.
 *
 * **Constraints (construct 5, issue #938, `./constraints.ts`).** The oracle
 * poses the setup pose with every constraint applied, so a bone a constraint
 * moves is not where its hierarchy alone puts it. The core applies the ik,
 * transform, path, physics and slider constraints in the document's order
 * after the hierarchy, as the runtime's update order does (`./constraints.ts`'s
 * header states it with its measurements, `./constraints_path.ts`'s the
 * path's; a physics constraint under `Physics.none` applies nothing, and
 * under the stepped phase — `poseSetup`'s `physics` context, the reset —
 * integrates, `./constraints_physics.ts`, whose `poseSteppedAnimations`
 * walks the oracle's `--physics step` schedule; a slider applies an animation,
 * `./constraints_slider.ts`); a path the core cannot pose exactly (skins
 * that disagree over the curve it walks) leaves the setup bones out naming
 * it (`constraintsAbsentWhy`). Before issue #938, measured over the nineteen
 * recipes `tools/emit_hashes.ts` generates: seven declared a constraint, and
 * on each the runtime's setup pose differed from the hierarchy's alone; all
 * seven read IDENTICAL now. The `paths` and `pathAttachments` blocks — each
 * path constraint's settings and each path attachment's flags and
 * `lengths`, as the runtime reads them — are written from the model
 * (`pathRows`, `pathAttachmentRows`).
 *
 * 🔸 **Active** is measured rather than assumed. Posed through the runtime by
 * `tools/pose_oracle.ts dump` on a hand-written skeleton (issue #925's
 * report; held by the core suite's `CO07`): a bone that is not skin-required
 * is active; a skin-required bone is active exactly when the applied skin
 * names it or names a bone below it — a skin-required parent of a named bone
 * is active, and a bone that is not skin-required stays active under an
 * inactive parent. The oracle's `--skin all` applies every skin at once, so
 * under it `active` means: not skin-required, or named — itself or a bone
 * below it — by ANY skin's `bones` list. Under `--skin <name>` (issue #932,
 * `underSkin`) it is the named skin's list alone — the default skin's does
 * not count (`./skins.ts`, measured). An inactive bone is not posed
 * (`worldTransforms` in `./world.ts`).
 *
 ## The slots at the setup pose (issue #928)
 *
 * Every rule below was measured by posing a hand-written skeleton through
 * `tools/pose_oracle.ts dump` (spine-core 4.3.13, `--skin all`) and reading
 * the slot rows it printed; the core suite's `CO11` holds the same skeleton
 * against the core at tolerance 0.
 *
 * - **Which attachment a slot shows.** A slot whose setup placeholder is
 *   `null` shows nothing (`null`). Otherwise the placeholder is looked up in
 *   every skin; one skin filling it — the default or a named one alone —
 *   shows that record. A placeholder no skin fills shows nothing: the row
 *   reads `null` for the attachment and for the path, not the placeholder's
 *   name.
 * - ⚠️ **Several skins filling one placeholder: the LAST in the Spine FILE's
 *   skin order wins — and the model does not hold that order.** Three skins
 *   filling one placeholder with three names, in three file orders
 *   (`default, s1, s2`; `s2, s1, default`; `s1, default, s2`), showed `s2`,
 *   `default` and `s2`'s name: the last one listed, every time — the oracle's
 *   `--skin all` merges the skins in file order, a later one replacing an
 *   earlier one's entry. The file's order is not the model's: the Spine
 *   emitter writes `default` first and the rest in the editor's order
 *   (`editorSkinOrder` in `src/compile.ts`), so a rig built with skins
 *   `default, zulu, alpha` has a model listing them so and a file listing
 *   `default, alpha, zulu`; with `zulu` and `alpha` filling one placeholder,
 *   spine-core showed `zulu`'s attachment, and "last in the model's order"
 *   would have shown `alpha`'s (measured through `ingest` and `build`; the
 *   core suite's `CO12` builds it). That order is a Spine spelling the model
 *   rightly does not carry (census §4's class), so the core does not guess it:
 *   where every skin filling a slot's setup placeholder gives the same row —
 *   the same shown name and path — the order cannot matter and the row is
 *   posed; where they differ, the whole `setup.slots` block is absent, naming
 *   the slot, the placeholder and the skins. Posing one skin at a time
 *   (`--skin <name>`, `underSkin`, issue #932) has no order to know — the
 *   named skin's record, else the default skin's (`./skins.ts`) — so the
 *   per-skin dumps judge what the merged view leaves out, and
 *   `tools/core_gate.ts` runs one per skin on a row declaring several.
 * - **The name shown** is the record's own `name` where the model states one,
 *   else the placeholder: a region filed under `p` with `path: "other"` shows
 *   `p`; one stating `name: "n"` shows `n`.
 * - **The region path** is the record's `path` where stated, else the name
 *   shown — for a region, a mesh and a linked mesh (a region stating
 *   `name: "n"` and no path reads path `n`; a linked mesh stating
 *   `path: "lm"` reads `lm`; a region or mesh with a `sequence` reads its
 *   stated `path` as written, `seq` and not a numbered frame). A bounding
 *   box, a clipping polygon and a path attachment read `null`, as does a
 *   point, which rigc does not emit.
 * - **Colour.** No colour stated reads `1, 1, 1, 1`. A stated colour reads
 *   each channel as its two hex digits over 255 (`ff800040` reads
 *   `1, 0.501961, 0, 0.25098`; upper case reads the same); six digits read
 *   an alpha of 1. The attachment's own colour does not enter the slot's row
 *   (a region tinted `00000080` under an unstated slot colour read white).
 *   Every one of the 256 byte values in every channel is held by `CO11`.
 * - **Dark colour** is `null` when the slot states none, else its first
 *   three channels read the same way; eight digits read the same three, the
 *   fourth unread.
 * - 🚫 **Any other spelling is refused by `readModel`, by name.** The
 *   runtime's reading of one is not a colour: `ff80004` (seven digits) read
 *   alpha 1, `zz800040` read a red of NaN, `f` read red 0.058824 and green
 *   NaN, and an empty colour read white while an empty dark colour read none.
 *   Reproducing that would be copying a parser's accidents, not posing a slot.
 * - **A slot on an inactive bone still shows its attachment** (a slot on a
 *   skin-required bone no skin names read its region and path).
 * - ⚠️ **A slider poses slots at setup; the other four constraint kinds do
 *   not.** A slider applies an animation, and the oracle's setup applies
 *   constraints: a hand-written slider whose animation keys a slot's `rgba`
 *   to `ff000080` and its attachment to `q` turned that slot's setup row from
 *   `r, 1, 1, 1, 1` to `q, 1, 0, 0, 0.501961`, with its dial bone and without
 *   one. Issue #928 left `setup.slots` absent wherever a slider keys a slot;
 *   since issue #938 each slider's slot timelines are applied after the
 *   bones, in constraint order, at the time and mix it was applied with
 *   (`applySliderSlots` in `./constraints_slider.ts`, which states the blend).
 *   The slots are still absent, naming the slider, where the bones its time
 *   is read from are absent. An ik, transform, path or physics constraint
 *   moves bones only.
 * - **The blend mode** (issue #933) is the row's last cell, as the runtime's
 *   enum names it: `Normal`, `Additive`, `Multiply`, `Screen`. A slot that
 *   states none reads `Normal`. The runtime reads a stated blend by
 *   upper-casing its first letter and looking the result up: `additive` and
 *   `Additive` both read `Additive`, while `ADDITIVE` and `mUlTiPlY` read no
 *   mode at all (the dump's `null`) and an empty string threw on load. So the
 *   core reads exactly the eight spellings whose first letter folds to one of
 *   the four names and `readModel` refuses every other by name. The mode is
 *   the slot's data, not its pose: an animation keying the slot's colour left
 *   it where setup put it, so a sample's row carries the setup's mode.
 *
 * ## The evaluator
 *
 * World transforms come from the core's own evaluator, `worldTransforms` in
 * `./world.ts`, written from what a bone's fields mean and from measurement
 * against the runtime's dump; its header states each measured choice. It is
 * not reached through `src/transform.ts`'s `computeWorldTransforms`: that is
 * the compiler's adapter over this same evaluator (issues #1015 and #1021 —
 * the same arithmetic since #1021), and the core importing the compiler would
 * be a cycle. The compiler's evaluator before #1015, called as it was, read
 * IDENTICAL on 1 of the 12 recipes the core poses (DIFF on 11, worst 61
 * millionths against a tolerance of one — issue #925's report). The owner's
 * decision is recorded on issue #380. `poseSetup` takes a
 * `CorePlant` — the evaluator, the skin resolution, the colour and blend readings — so
 * the suite's plants can pass a copy of one of them; nothing else passes one.
 *
 * ## Purity
 *
 * `src/` is pure and this directory is held to it by the core suite's tree
 * rule (`selftest.ts`, band `CO`): no clock, no randomness, no network, no
 * child process, no file system — `readModel` takes the document's TEXT — and
 * nothing from the Spine runtime package, as a value or as a type.
 */
import type { ModelAtlasRect, ModelBone, ModelEditorOrder, ModelPage, ModelPageRegion, ModelSlot, ModelStage, ModelVertices, SkinTableEntry } from '../model.ts';
import { worldTransforms, type CoreWorld } from './world.ts';
import { readAnimationTimelines, type CoreAnimationTimelines } from './animation.ts';
import { readEventDefs, type CoreEventDef } from './events.ts';
import { poseGeometry, readGeometry, type CoreAttachmentRow, type CoreClipRow, type CoreGeometry, type DeformedVertexPoser, type DrawWalk, type MeshArraysOf, type RegionPoser, type ShownGeometry, type VertexPoser } from './vertices.ts';
import type { CoreClippedRow, ShapeClipper, TriangleClipper } from './clipping.ts';
import { applyConstraints, constraintsAbsentWhy, readConstraintRecord, readConstraintTimelines, solverRules, type ConstraintPlant, type CoreConstraintRecord, type CoreConstraintTimelines, type SolverRules } from './constraints.ts';
import { readPathRecord } from './constraints_path.ts';
import { readPhysicsRecord, type PhysicsStepContext, type PhysicsStepper } from './constraints_physics.ts';
import { appliedSkins, CORE_ALL_SKINS, fillingSkins, listedByAppliedSkin, lookupSkins, slotTimelinesApply, type SlotTimelineGate } from './skins.ts';
import { applySliderSlots, readSliderRecord, type SliderApplication, type SlotPoseState } from './constraints_slider.ts';
import { attachmentStates, type DeformBlender, type DeformEvaluator, type SequenceEvaluator } from './deform.ts';
import { drawOrderAt, type DrawOrderEvaluator } from './draw_order.ts';
import type { EventsFired } from './events.ts';

/**
 * The document spec `build` writes today (issue #1026): the `pages` section
 * (issue #1016) with each page's `pma` and `scale`, and the `stage` and
 * `editorOrder` sections — what only the Spine files beside a `/2` document
 * state.
 */
export const CORE_DOCUMENT_SPEC = 'rigc-compiled/3';

/**
 * The spec before issue #1026: `/3` without `stage`, `editorOrder` and the
 * pages' `pma` and `scale`. Read as before, with `stated` null — a reader that
 * needs those reads them off the Spine files beside the document, and says so
 * (`src/render.ts`'s poser line, the survey's order).
 */
export const CORE_DOCUMENT_SPEC_2 = 'rigc-compiled/2';

/**
 * The spec before issue #1016: `/2` without `pages`. Read as before — the
 * draw then takes where each region sits from the atlas beside the document
 * (`corePoser` in `src/render_core.ts` says so by name), because a `/1`
 * document does not state it.
 */
export const CORE_DOCUMENT_SPEC_1 = 'rigc-compiled/1';

/** Every spec this reader takes, newest first. */
export const CORE_DOCUMENT_SPECS: readonly string[] = [CORE_DOCUMENT_SPEC, CORE_DOCUMENT_SPEC_2, CORE_DOCUMENT_SPEC_1];

/** Who posed a dump the core wrote — the oracle document's `dumper`. */
export const CORE_DUMPER = 'rigc-core';

/** A refusal about the document read. Every problem is collected and named in one throw. */
export class CoreInputError extends Error {}

/** The document's sections after `spec`, in its key order (`modelDocument` in `src/model.ts`). */
export const CORE_SECTIONS = [
  // Issue #1026: `stage` (the header's setup-pose box, or null) and `editorOrder` (the order the Spine file lists skins, slot keys and animations in). `/3` only.
  'referenceScale', 'stage', 'bones', 'slots', 'skins', 'constraints', 'events', 'animations', 'editorOrder',
  'images', 'pageGrids', 'droppedStates', 'absentParts', 'meshBones', 'meshes', 'physics', 'deformTransforms', 'trackDerivations', 'rig',
  // Issue #1016: where each region sits on its page, in the atlas written beside the document (`pagesOfAtlas` in `src/model.ts`). `/2` only.
  'pages',
  // Issue #968: the digest of the `skeleton.json` written beside the document (`spineFileSha256` in `src/model.ts`).
  'spine',
] as const;

/** The sections of a `rigc-compiled/2` document: `CORE_SECTIONS` without `stage` and `editorOrder`. */
export const CORE_SECTIONS_2: readonly string[] = CORE_SECTIONS.filter((key) => key !== 'stage' && key !== 'editorOrder');

/** The sections of a `rigc-compiled/1` document: `CORE_SECTIONS_2` without `pages`. */
export const CORE_SECTIONS_1: readonly string[] = CORE_SECTIONS_2.filter((key) => key !== 'pages');

/** The fields of a page and of a region in the `pages` section, as the writer lists them (`MODEL_PAGE_FIELDS`, `MODEL_PAGE_REGION_FIELDS` in `src/model.ts`, mirrored). */
export const CORE_PAGE_FIELDS = ['name', 'width', 'height', 'pma', 'scale', 'regions'] as const;
/** A `rigc-compiled/2` page's fields: `CORE_PAGE_FIELDS` without `pma` and `scale` (issue #1026). */
export const CORE_PAGE_FIELDS_2: readonly string[] = CORE_PAGE_FIELDS.filter((key) => key !== 'pma' && key !== 'scale');
/** The stage's fields, as the writer lists them (`MODEL_STAGE_FIELDS` in `src/model.ts`, mirrored). */
export const CORE_STAGE_FIELDS = ['x', 'y', 'width', 'height'] as const;
/** The stage box's fields (issue #1168), as the writer lists them (`MODEL_STAGE_BOX_FIELDS` in `src/model.ts`, mirrored). */
export const CORE_STAGE_BOX_FIELDS = ['slot', 'attachment'] as const;
export const CORE_PAGE_REGION_FIELDS = ['name', 'x', 'y', 'width', 'height', 'offsetX', 'offsetY', 'originalWidth', 'originalHeight', 'degrees', 'index'] as const;

/** The fields a bone record may carry, as the writer lists them. A field outside this list is refused. */
export const CORE_BONE_FIELDS = ['name', 'parent', 'length', 'x', 'y', 'rotation', 'scaleX', 'scaleY', 'shearX', 'shearY', 'inheritMode', 'skinRequired', 'editor'] as const;
const BONE_NUMBERS = ['length', 'x', 'y', 'rotation', 'scaleX', 'scaleY', 'shearX', 'shearY'] as const;
/** The fields a slot record may carry. */
export const CORE_SLOT_FIELDS = ['name', 'bone', 'setup', 'color', 'dark', 'blend'] as const;
/** The fields a skin record may carry. */
export const CORE_SKIN_FIELDS = ['name', 'bones', 'constraints', 'attachments'] as const;
/**
 * The fields each attachment kind's record may carry, as the writer lists them
 * (`ATTACHMENT_FIELDS` in `src/model.ts`, mirrored as the bone and slot lists
 * are). A field outside its kind's list is refused.
 */
export const CORE_ATTACHMENT_FIELDS: Readonly<Record<SkinTableEntry['kind'], readonly string[]>> = {
  mesh: ['kind', 'name', 'path', 'color', 'uvs', 'triangles', 'vertices', 'hull', 'edges', 'width', 'height', 'sequence'],
  boundingbox: ['kind', 'name', 'vertexCount', 'vertices', 'editorColor'],
  clipping: ['kind', 'name', 'end', 'convex', 'inverse', 'vertexCount', 'vertices', 'editorColor'],
  path: ['kind', 'name', 'closed', 'constantSpeed', 'vertexCount', 'vertices', 'lengths', 'editorColor'],
  region: ['kind', 'name', 'path', 'x', 'y', 'rotation', 'scaleX', 'scaleY', 'width', 'height', 'color', 'sequence', 'atlas'],
  linkedmesh: ['kind', 'name', 'path', 'source', 'skin', 'slot', 'timelines', 'width', 'height', 'color', 'sequence'],
};
/** The kinds whose shown record names an atlas region — the ones the oracle's row gives a path (the header's measurement). */
export const CORE_REGION_KINDS: ReadonlySet<SkinTableEntry['kind']> = new Set(['region', 'mesh', 'linkedmesh']);
/** A colour the core reads: six or eight hex digits, either case (the header's measurement; anything else is refused). */
const HEX_COLOUR = /^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;
/** The blend modes, as the runtime's enum names them (the header's measurement). */
export const CORE_BLEND_MODES = ['Normal', 'Additive', 'Multiply', 'Screen'] as const;
export type CoreBlendMode = (typeof CORE_BLEND_MODES)[number];
/** A stated blend's reading: its first letter upper-cased, when that is one of the four names; `null` otherwise. */
export function foldBlend(stated: string): CoreBlendMode | null {
  const folded = `${stated.slice(0, 1).toUpperCase()}${stated.slice(1)}`;
  return (CORE_BLEND_MODES as readonly string[]).includes(folded) ? (folded as CoreBlendMode) : null;
}
/** The five constraint kinds a document names. */
export const CORE_CONSTRAINT_KINDS = ['ik', 'transform', 'path', 'physics', 'slider'] as const;
export type CoreConstraintKind = (typeof CORE_CONSTRAINT_KINDS)[number];
/** The five inherit modes, as the rig spec spells them once its first letter is lower-cased. */
export const CORE_INHERIT_MODES = ['normal', 'onlyTranslation', 'noRotationOrReflection', 'noScale', 'noScaleOrReflection'] as const;

/**
 * The fields of a region's atlas rectangle (`ModelAtlasRect` in `src/model.ts`,
 * issue #935), every one required and a finite number.
 */
export const CORE_ATLAS_RECT_FIELDS = ['width', 'height', 'offsetX', 'offsetY', 'originalWidth', 'originalHeight'] as const;

/**
 * One attachment record, as far as the slots read it: its kind, and its own
 * name and region path where stated — and a region's atlas rectangle where the
 * record carries one, `null` where the build had no source for it (issue #935);
 * and, for the world vertices (issue #931, `./vertices.ts`), the geometry the
 * record carries, checked field by field (`readGeometry`).
 */
export interface CoreAttachment {
  kind: SkinTableEntry['kind'];
  name?: string;
  path?: string;
  atlas?: ModelAtlasRect | null;
  geometry?: CoreGeometry;
  /** How many frames the record's series holds, where it states a `sequence` — what a sequence key's index is checked against (`./deform.ts`). */
  sequenceCount?: number;
  /** A linked mesh's `timelines`: whether it plays its source's deform and sequence timelines (`./deform.ts`). */
  timelines?: boolean;
  /** The record's `color`, six or eight hex digits, where stated (issue #966): what the raw entry's attachment colour reads (`./raw.ts`); white where unstated. */
  color?: string;
  /** The frame its `sequence` shows at setup (`sequence.setup`, 0 unstated), where it states one (issue #966): the raw entry's sequence index when no timeline set another. */
  sequenceSetup?: number;
}

/** One skin, as far as these constructs read it: its name, the bones and constraints it activates, and its table — slot, then placeholder. */
export interface CoreSkin {
  name: string;
  bones: string[];
  /** The constraints it activates, by kind — a kind the document leaves out lists none (issue #932, `./skins.ts`). */
  constraints: Record<CoreConstraintKind, string[]>;
  attachments: Record<string, Record<string, CoreAttachment>>;
}

/** One constraint, as far as these constructs read it: its kind and name, a slider's animation, and an ik or transform constraint's record (`./constraints.ts`). */
export interface CoreConstraint {
  kind: CoreConstraintKind;
  name: string;
  /** The animation a slider applies — the one constraint kind measured to pose a slot (the slots' ⚠️). */
  animation?: string;
  /** The constraint read field by field (construct 5, issue #938): ik and transform (`./constraints.ts`), physics (`./constraints_physics.ts`), slider (`./constraints_slider.ts`). */
  record?: CoreConstraintRecord;
}

/** One animation: its name, the slots its timelines key, its timelines as construct 4 reads them (`./animation.ts`), and its constraint timelines (`./constraints.ts`). */
export interface CoreAnimation {
  name: string;
  slots: string[];
  timelines: CoreAnimationTimelines;
  constraints: CoreConstraintTimelines;
  /** Every attachment a `deform` timeline keys, as `skin/slot/attachment` — what a path constraint walking a deformed path needs to know (`./constraints_path.ts`). */
  deforms: string[];
}

/**
 * A `rigc-compiled/3` (or `/2`, or `/1`) document, read. `bones` and `slots` are checked field by
 * field against the writer's own records; skins and constraints are read as
 * far as their names and memberships, and every other section is only
 * required to be present — no construct this card admits reads it.
 */
export interface CompiledDocument {
  spec: string;
  /**
   * The skin the document is posed under (issue #932, `./skins.ts`): `all` —
   * every skin merged, the oracle's `--skin all` and `readModel`'s reading —
   * one skin's name, `underSkin`'s, or `null` — no skin set, the runtime's
   * `Skeleton.skin` before `setSkin` is called (`underNoSkin`, issue #1051).
   */
  skin: string | null;
  /** The skeleton's reference scale (issue #958), which every physics record carries too (`CorePhysicsRecord.referenceScale`). */
  referenceScale: number;
  bones: ModelBone[];
  slots: ModelSlot[];
  skins: CoreSkin[];
  constraints: CoreConstraint[];
  animations: CoreAnimation[];
  /** The digest of the `skeleton.json` `build` wrote beside the document (issue #968) — what a render holds the file beside it to before posing it here. */
  spine: { sha256: string };
  /**
   * Every page of the atlas `build` wrote beside the document and every region
   * on it, in file order (issue #1016) — where each drawing sits, which the
   * draw's page UVs read. `null` for a `rigc-compiled/1` document, which does
   * not state it. A `rigc-compiled/3` document's pages carry `pma` and `scale`
   * too (issue #1026); a `/2` document's carry neither.
   */
  pages: ModelPage[] | null;
  /**
   * What a `rigc-compiled/3` document states that only the Spine files beside
   * a `/2` or `/1` document hold (issue #1026): the setup-pose box the header
   * declares, or `null` for none, and the order the editor lists skins, their
   * slot keys and animations in. `null` for a `/2` or `/1` document.
   */
  stated: CoreStated | null;
}

/** A `rigc-compiled/3` document's `stage` and `editorOrder`, read (`CompiledDocument.stated`). */
export interface CoreStated {
  stage: ModelStage | null;
  editorOrder: ModelEditorOrder;
}

/**
 * The `pages` section, checked: a list of pages, each holding exactly
 * `CORE_PAGE_FIELDS` — a non-empty name, a size of two positive finite
 * numbers, a list of at least one region (issue #1054) — and each region exactly
 * `CORE_PAGE_REGION_FIELDS`, a non-empty name and nine finite numbers. Every
 * fault is named by its path. Nothing is defaulted: a field the writer always
 * writes is required here.
 */
function readPages(value: unknown, problems: string[], flags: boolean): ModelPage[] {
  if (!Array.isArray(value)) {
    problems.push(`pages is ${JSON.stringify(value) ?? 'absent'}, not a list of pages`);
    return [];
  }
  const out: ModelPage[] = [];
  value.forEach((raw, i) => {
    const where = `pages[${i}]`;
    if (!isRecord(raw)) {
      problems.push(`${where} is not an object`);
      return;
    }
    const before = problems.length;
    const label = typeof raw.name === 'string' ? `${where} "${raw.name}"` : where;
    unknownFields(raw, flags ? CORE_PAGE_FIELDS : CORE_PAGE_FIELDS_2, label, problems);
    if (typeof raw.name !== 'string' || raw.name === '') problems.push(`${where}: name is ${JSON.stringify(raw.name) ?? 'absent'}, not a non-empty string`);
    for (const key of ['width', 'height'] as const) {
      const v = raw[key];
      if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) problems.push(`${label}: ${key} is ${JSON.stringify(v) ?? 'absent'}, not a positive finite number — a page UV divides by it`);
    }
    // Issue #1026: a /3 page states its `pma:` as the runtime reads it and the number its own `scale:` line states, or null for none.
    if (flags) {
      if (typeof raw.pma !== 'boolean') problems.push(`${label}: pma is ${JSON.stringify(raw.pma) ?? 'absent'}, not true or false — whether the page's texels are premultiplied`);
      if (raw.scale !== null && (typeof raw.scale !== 'number' || !Number.isFinite(raw.scale))) problems.push(`${label}: scale is ${JSON.stringify(raw.scale) ?? 'absent'}, not a finite number or null — the number the page's scale: line states, null where it has none`);
    }
    const regions: ModelPageRegion[] = [];
    if (!Array.isArray(raw.regions)) problems.push(`${label}: regions is not a list`);
    // Issue #1054: a page holding no region is one no build writes — the atlas text's block for it would end before any region line, which
    // the round trip refuses (A07_ATLAS_TEXT_SHAPE: "the last page block declares no region") — so a document stating one is refused here by
    // the page's name rather than read, where nothing on the model side would name it.
    else if (raw.regions.length === 0) problems.push(`${label}: regions is an empty list — a page holds at least one region; the atlas text cannot state a page with none (its block would end before a region line, which A07_ATLAS_TEXT_SHAPE refuses), so no build writes one`);
    else {
      raw.regions.forEach((region, j) => {
        const at = `${label}.regions[${j}]`;
        if (!isRecord(region)) {
          problems.push(`${at} is not an object`);
          return;
        }
        const named = typeof region.name === 'string' ? `${at} "${region.name}"` : at;
        unknownFields(region, CORE_PAGE_REGION_FIELDS, named, problems);
        if (typeof region.name !== 'string' || region.name === '') problems.push(`${at}: name is ${JSON.stringify(region.name) ?? 'absent'}, not a non-empty string`);
        for (const key of CORE_PAGE_REGION_FIELDS) {
          if (key === 'name') continue;
          const v = region[key];
          if (typeof v !== 'number' || !Number.isFinite(v)) problems.push(`${named}: ${key} is ${JSON.stringify(v) ?? 'absent'}, not a finite number`);
        }
        regions.push(region as unknown as ModelPageRegion);
      });
    }
    if (problems.length === before) {
      out.push(
        flags
          ? { name: raw.name as string, width: raw.width as number, height: raw.height as number, pma: raw.pma as boolean, scale: raw.scale as number | null, regions }
          : { name: raw.name as string, width: raw.width as number, height: raw.height as number, regions },
      );
    }
  });
  return out;
}

/** The `spine` section's value, checked: `{ "sha256": <64 lowercase hex> }` and nothing else, each fault named by path (issue #968). */
function readSpineDigest(value: unknown, problems: string[]): string {
  if (value === undefined) return '';
  if (!isRecord(value)) {
    problems.push(`spine is ${JSON.stringify(value)}, not { "sha256": "<64 lowercase hex digits>" }`);
    return '';
  }
  for (const key of Object.keys(value)) if (key !== 'sha256') problems.push(`spine: field "${key}" is not one this reader knows; it reads [sha256]`);
  const sha = value.sha256;
  if (typeof sha !== 'string' || !/^[0-9a-f]{64}$/.test(sha)) {
    problems.push(`spine.sha256 is ${JSON.stringify(sha) ?? 'absent'}, not 64 lowercase hex digits — the SHA-256 of the skeleton.json written beside the document`);
    return '';
  }
  return sha;
}

/**
 * The `stage` section, checked (issue #1026): `null` — the header declares no
 * stage — or exactly `CORE_STAGE_FIELDS`, four finite numbers, each fault
 * named by path. Nothing is defaulted: the writer always writes all four.
 */
function readStage(value: unknown, problems: string[]): ModelStage | null {
  if (value === null) return null;
  if (!isRecord(value)) {
    problems.push(`stage is ${JSON.stringify(value) ?? 'absent'}, not null or { x, y, width, height } — the setup-pose box the Spine header declares`);
    return null;
  }
  const before = problems.length;
  unknownFields(value, [...CORE_STAGE_FIELDS, 'box'], 'stage', problems);
  for (const key of CORE_STAGE_FIELDS) {
    const v = value[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) problems.push(`stage: ${key} is ${JSON.stringify(v) ?? 'absent'}, not a finite number`);
  }
  // The stage box (issue #1168): written only where the rig asked for one, and then exactly its two names.
  const box = value.box;
  if (box !== undefined) {
    if (!isRecord(box)) problems.push(`stage.box is ${JSON.stringify(box)}, not { slot, attachment }`);
    else {
      unknownFields(box, CORE_STAGE_BOX_FIELDS, 'stage.box', problems);
      for (const key of CORE_STAGE_BOX_FIELDS) if (typeof box[key] !== 'string' || box[key] === '') problems.push(`stage.box: ${key} is ${JSON.stringify(box[key]) ?? 'absent'}, not a non-empty string`);
    }
  }
  if (problems.length !== before) return null;
  const stage: ModelStage = { x: value.x as number, y: value.y as number, width: value.width as number, height: value.height as number };
  if (isRecord(box)) stage.box = { slot: box.slot as string, attachment: box.attachment as string };
  return stage;
}

/**
 * The `editorOrder` section, checked against the records the document holds
 * (issue #1026): `skins`, every skin exactly once as `{ name, slots }` with
 * `slots` its table's slot keys exactly once each, and `animations`, every
 * animation's name exactly once. An order naming a skin, slot key or
 * animation the document does not hold, or leaving one out, is refused by
 * path — it would be another rig's order.
 */
function readEditorOrder(value: unknown, skins: readonly CoreSkin[], animations: readonly CoreAnimation[], problems: string[]): ModelEditorOrder {
  const out: ModelEditorOrder = { skins: [], animations: [] };
  if (!isRecord(value)) {
    problems.push(`editorOrder is ${JSON.stringify(value) ?? 'absent'}, not { skins, animations }`);
    return out;
  }
  unknownFields(value, ['skins', 'animations'], 'editorOrder', problems);
  const names = (list: unknown, where: string): string[] | null => {
    if (!Array.isArray(list) || list.some((n) => typeof n !== 'string')) {
      problems.push(`${where} is ${JSON.stringify(list) ?? 'absent'}, not a list of names`);
      return null;
    }
    return list as string[];
  };
  /** `stated` lists exactly the names of `held`, each once — else one problem naming the first difference. */
  const permutation = (stated: readonly string[], held: readonly string[], where: string, what: string): void => {
    const seen = new Set<string>();
    for (const name of stated) {
      if (seen.has(name)) return void problems.push(`${where} lists ${what} "${name}" twice`);
      seen.add(name);
      if (!held.includes(name)) return void problems.push(`${where} lists ${what} "${name}", which the document does not hold`);
    }
    const missing = held.find((name) => !seen.has(name));
    if (missing !== undefined) problems.push(`${where} leaves out ${what} "${missing}"`);
  };
  if (!Array.isArray(value.skins)) problems.push(`editorOrder.skins is ${JSON.stringify(value.skins) ?? 'absent'}, not a list`);
  else {
    value.skins.forEach((entry, i) => {
      const at = `editorOrder.skins[${i}]`;
      if (!isRecord(entry) || typeof entry.name !== 'string') return void problems.push(`${at} is not { name, slots }`);
      unknownFields(entry, ['name', 'slots'], at, problems);
      const slots = names(entry.slots, `${at}.slots`);
      const skin = skins.find((k) => k.name === entry.name);
      if (slots !== null && skin !== undefined) permutation(slots, Object.keys(skin.attachments), `${at}.slots`, 'slot key');
      out.skins.push({ name: entry.name, slots: slots ?? [] });
    });
    permutation(out.skins.map((k) => k.name), skins.map((k) => k.name), 'editorOrder.skins', 'skin');
  }
  const order = names(value.animations, 'editorOrder.animations');
  if (order !== null) {
    permutation(order, animations.map((a) => a.name), 'editorOrder.animations', 'animation');
    out.animations = order;
  }
  return out;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The mode a stated `inheritMode` folds to — the first letter lower-cased and nothing else — or null. */
export function foldInheritMode(value: string): (typeof CORE_INHERIT_MODES)[number] | null {
  const folded = value.length === 0 ? value : value[0].toLowerCase() + value.slice(1);
  return CORE_INHERIT_MODES.find((m) => m === folded) ?? null;
}

function unknownFields(record: Record<string, unknown>, known: readonly string[], where: string, problems: string[]): void {
  for (const key of Object.keys(record)) {
    if (!known.includes(key)) problems.push(`${where}: field "${key}" is not one this reader knows; it reads [${known.join(', ')}]`);
  }
}

function readBones(value: unknown, problems: string[]): ModelBone[] {
  if (!Array.isArray(value)) {
    problems.push('bones is not a list');
    return [];
  }
  const out: ModelBone[] = [];
  const seen = new Set<string>();
  value.forEach((raw, i) => {
    const where = `bones[${i}]`;
    if (!isRecord(raw)) {
      problems.push(`${where} is not an object`);
      return;
    }
    const label = typeof raw.name === 'string' ? `${where} "${raw.name}"` : where;
    unknownFields(raw, CORE_BONE_FIELDS, label, problems);
    if (typeof raw.name !== 'string' || raw.name === '') problems.push(`${where}: name is ${JSON.stringify(raw.name)}, not a non-empty string`);
    else if (seen.has(raw.name)) problems.push(`${label}: the name is declared twice`);
    if (raw.parent !== undefined) {
      if (typeof raw.parent !== 'string') problems.push(`${label}: parent is ${JSON.stringify(raw.parent)}, not a bone name`);
      else if (!seen.has(raw.parent)) problems.push(`${label}: parent "${raw.parent}" is not declared before it; bones are parents first`);
    }
    for (const key of BONE_NUMBERS) {
      const v = raw[key];
      if (v !== undefined && (typeof v !== 'number' || !Number.isFinite(v))) problems.push(`${label}: ${key} is ${JSON.stringify(v)}, not a finite number`);
    }
    if (raw.inheritMode !== undefined) {
      if (typeof raw.inheritMode !== 'string' || foldInheritMode(raw.inheritMode) === null) {
        problems.push(`${label}: inheritMode is ${JSON.stringify(raw.inheritMode)}, which folds to none of ${CORE_INHERIT_MODES.join(', ')}`);
      }
    }
    if (raw.skinRequired !== undefined && typeof raw.skinRequired !== 'boolean') problems.push(`${label}: skinRequired is ${JSON.stringify(raw.skinRequired)}, not a boolean`);
    if (raw.editor !== undefined) {
      if (!isRecord(raw.editor)) problems.push(`${label}: editor is not an object`);
      else {
        unknownFields(raw.editor, ['color', 'icon'], `${label}.editor`, problems);
        for (const key of ['color', 'icon'] as const) {
          if (raw.editor[key] !== undefined && typeof raw.editor[key] !== 'string') problems.push(`${label}.editor: ${key} is not a string`);
        }
      }
    }
    if (typeof raw.name === 'string' && raw.name !== '') seen.add(raw.name);
    out.push(raw as unknown as ModelBone);
  });
  return out;
}

function readSlots(value: unknown, bones: ReadonlySet<string>, problems: string[]): ModelSlot[] {
  if (!Array.isArray(value)) {
    problems.push('slots is not a list');
    return [];
  }
  const out: ModelSlot[] = [];
  value.forEach((raw, i) => {
    const where = `slots[${i}]`;
    if (!isRecord(raw)) {
      problems.push(`${where} is not an object`);
      return;
    }
    const label = typeof raw.name === 'string' ? `${where} "${raw.name}"` : where;
    unknownFields(raw, CORE_SLOT_FIELDS, label, problems);
    if (typeof raw.name !== 'string' || raw.name === '') problems.push(`${where}: name is ${JSON.stringify(raw.name)}, not a non-empty string`);
    if (typeof raw.bone !== 'string') problems.push(`${label}: bone is ${JSON.stringify(raw.bone)}, not a bone name`);
    else if (!bones.has(raw.bone)) problems.push(`${label}: bone "${raw.bone}" is not a bone of this document`);
    if (raw.setup !== null && typeof raw.setup !== 'string') problems.push(`${label}: setup is ${JSON.stringify(raw.setup)}, not a placeholder name or null`);
    for (const key of ['color', 'dark', 'blend'] as const) {
      if (raw[key] !== undefined && typeof raw[key] !== 'string') problems.push(`${label}: ${key} is ${JSON.stringify(raw[key])}, not a string`);
    }
    for (const key of ['color', 'dark'] as const) {
      const v = raw[key];
      if (typeof v === 'string' && !HEX_COLOUR.test(v)) problems.push(`${label}: ${key} is ${JSON.stringify(v)}, not six or eight hex digits (rrggbb or rrggbbaa) — the only spellings whose reading was measured to be a colour`);
    }
    if (typeof raw.blend === 'string' && foldBlend(raw.blend) === null) {
      problems.push(`${label}: blend is ${JSON.stringify(raw.blend)}, which the runtime reads as no mode — one of ${CORE_BLEND_MODES.join(', ')}, first letter in either case, is the only spelling measured to be one`);
    }
    out.push(raw as unknown as ModelSlot);
  });
  return out;
}

function readAttachments(value: Record<string, unknown>, bones: ReadonlySet<string>, slots: ReadonlySet<string>, label: string, problems: string[]): Record<string, Record<string, CoreAttachment>> {
  const out: Record<string, Record<string, CoreAttachment>> = {};
  for (const [slot, table] of Object.entries(value)) {
    const at = `${label}.attachments["${slot}"]`;
    if (!slots.has(slot)) problems.push(`${at}: "${slot}" is not a slot of this document`);
    if (!isRecord(table)) {
      problems.push(`${at} is not an object`);
      continue;
    }
    const entries: Record<string, CoreAttachment> = {};
    for (const [placeholder, raw] of Object.entries(table)) {
      const where = `${at}["${placeholder}"]`;
      if (!isRecord(raw)) {
        problems.push(`${where} is not an object`);
        continue;
      }
      const kinds = Object.keys(CORE_ATTACHMENT_FIELDS) as Array<SkinTableEntry['kind']>;
      const kind = kinds.find((k) => k === raw.kind);
      if (kind === undefined) {
        problems.push(`${where}: kind is ${JSON.stringify(raw.kind)}, none of ${kinds.join(', ')}`);
        continue;
      }
      unknownFields(raw, CORE_ATTACHMENT_FIELDS[kind], where, problems);
      const record: CoreAttachment = { kind };
      for (const key of ['name', 'path'] as const) {
        const v = raw[key];
        if (v === undefined) continue;
        if (typeof v !== 'string' || v === '') problems.push(`${where}: ${key} is ${JSON.stringify(v)}, not a non-empty string`);
        else record[key] = v;
      }
      if (kind === 'region' && raw.atlas !== undefined) {
        const rect = readAtlasRect(raw.atlas, `${where}.atlas`, problems);
        if (rect !== undefined) record.atlas = rect;
      }
      const geometry = readGeometry(raw, kind, where, bones, slots, problems);
      if (geometry !== undefined) record.geometry = geometry;
      // The series' length, whatever the kind: a sequence key's index is a frame of it (`./deform.ts`).
      if (isRecord(raw.sequence)) {
        const count = raw.sequence.count;
        if (typeof count === 'number' && Number.isInteger(count) && count >= 1) record.sequenceCount = count;
        else if (kind !== 'region') problems.push(`${where}.sequence: count is ${JSON.stringify(count)}, not a whole number of at least 1`);
        const setupFrame = raw.sequence.setup ?? 0;
        if (typeof setupFrame === 'number' && Number.isInteger(setupFrame) && setupFrame >= 0 && (typeof count !== 'number' || setupFrame < count)) record.sequenceSetup = setupFrame;
        else if (kind !== 'region') problems.push(`${where}.sequence: setup is ${JSON.stringify(raw.sequence.setup)}, not a frame of the ${JSON.stringify(count)}`);
      }
      // The attachment's own colour (issue #966): the raw entry forms the tint from it and the slot's.
      if (raw.color !== undefined) {
        if (typeof raw.color !== 'string' || !HEX_COLOUR.test(raw.color)) problems.push(`${where}: color is ${JSON.stringify(raw.color)}, not six or eight hex digits`);
        else record.color = raw.color;
      }
      if (kind === 'linkedmesh') {
        if (typeof raw.timelines !== 'boolean') problems.push(`${where}: timelines is ${JSON.stringify(raw.timelines) ?? 'absent'}, not a boolean — the writer states whether the link plays its source's timelines`);
        else record.timelines = raw.timelines;
      }
      entries[placeholder] = record;
    }
    out[slot] = entries;
  }
  return out;
}

/** A region's `atlas`: `null`, or an object holding exactly the six fields, each a finite number. `undefined` when refused. */
function readAtlasRect(value: unknown, where: string, problems: string[]): ModelAtlasRect | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) {
    problems.push(`${where} is ${JSON.stringify(value)}, neither null nor an object`);
    return undefined;
  }
  const before = problems.length;
  unknownFields(value, CORE_ATLAS_RECT_FIELDS, where, problems);
  for (const key of CORE_ATLAS_RECT_FIELDS) {
    const v = value[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) problems.push(`${where}: ${key} is ${JSON.stringify(v) ?? 'absent'}, not a finite number`);
  }
  return problems.length === before ? (value as unknown as ModelAtlasRect) : undefined;
}

function readSkins(value: unknown, bones: ReadonlySet<string>, slots: ReadonlySet<string>, problems: string[]): CoreSkin[] {
  if (!Array.isArray(value)) {
    problems.push('skins is not a list');
    return [];
  }
  const out: CoreSkin[] = [];
  value.forEach((raw, i) => {
    const where = `skins[${i}]`;
    if (!isRecord(raw)) {
      problems.push(`${where} is not an object`);
      return;
    }
    const label = typeof raw.name === 'string' ? `${where} "${raw.name}"` : where;
    unknownFields(raw, CORE_SKIN_FIELDS, label, problems);
    if (typeof raw.name !== 'string' || raw.name === '') problems.push(`${where}: name is ${JSON.stringify(raw.name)}, not a non-empty string`);
    const members: string[] = [];
    if (!Array.isArray(raw.bones)) problems.push(`${label}: bones is not a list`);
    else {
      raw.bones.forEach((b, j) => {
        if (typeof b !== 'string') problems.push(`${label}: bones[${j}] is not a bone name`);
        else if (!bones.has(b)) problems.push(`${label}: bones[${j}] "${b}" is not a bone of this document`);
        else members.push(b);
      });
    }
    const lists = Object.fromEntries(CORE_CONSTRAINT_KINDS.map((k) => [k, [] as string[]])) as Record<CoreConstraintKind, string[]>;
    if (!isRecord(raw.constraints)) problems.push(`${label}: constraints is not an object`);
    else {
      for (const [kind, list] of Object.entries(raw.constraints)) {
        const known = CORE_CONSTRAINT_KINDS.find((k) => k === kind);
        if (known === undefined) problems.push(`${label}.constraints: "${kind}" is not a constraint kind; a skin lists ${CORE_CONSTRAINT_KINDS.join(', ')}`);
        else if (!Array.isArray(list) || list.some((n) => typeof n !== 'string')) problems.push(`${label}.constraints.${kind} is not a list of constraint names`);
        else lists[known] = list as string[];
      }
    }
    let attachments: Record<string, Record<string, CoreAttachment>> = {};
    if (!isRecord(raw.attachments)) problems.push(`${label}: attachments is not an object`);
    else attachments = readAttachments(raw.attachments, bones, slots, label, problems);
    out.push({ name: typeof raw.name === 'string' ? raw.name : '', bones: members, constraints: lists, attachments });
  });
  return out;
}

function readAnimations(value: unknown, bones: ReadonlySet<string>, slotRecords: readonly ModelSlot[], skins: readonly CoreSkin[], events: ReadonlyMap<string, CoreEventDef>, problems: string[]): CoreAnimation[] {
  const slots = new Set(slotRecords.map((s) => s.name));
  if (!Array.isArray(value)) {
    problems.push('animations is not a list');
    return [];
  }
  const out: CoreAnimation[] = [];
  value.forEach((raw, i) => {
    const where = `animations[${i}]`;
    if (!isRecord(raw)) {
      problems.push(`${where} is not an object`);
      return;
    }
    if (typeof raw.name !== 'string' || raw.name === '') problems.push(`${where}: name is ${JSON.stringify(raw.name)}, not a non-empty string`);
    const label = typeof raw.name === 'string' ? `${where} "${raw.name}"` : where;
    const keyed: string[] = [];
    if (!Array.isArray(raw.slots)) problems.push(`${label}: slots is not a list`);
    else {
      raw.slots.forEach((entry, j) => {
        if (!isRecord(entry) || typeof entry.name !== 'string') problems.push(`${label}: slots[${j}] names no slot`);
        else if (!slots.has(entry.name)) problems.push(`${label}: slots[${j}] "${entry.name}" is not a slot of this document`);
        else keyed.push(entry.name);
      });
    }
    const deforms: string[] = [];
    // The structure is checked with the key times (`laterKeyTimes` in `./animation.ts`); here only the names are taken.
    const list = (v: unknown): Array<Record<string, unknown>> => (Array.isArray(v) ? v.filter(isRecord) : []);
    for (const skin of list(raw.attachments)) for (const slot of list(skin.slots)) for (const att of list(slot.attachments)) if (att.deform !== undefined) deforms.push(`${String(skin.name)}/${String(slot.name)}/${String(att.name)}`);
    out.push({ name: typeof raw.name === 'string' ? raw.name : '', slots: keyed, timelines: readAnimationTimelines(raw, label, bones, slotRecords, problems, { skins, events }), constraints: { ik: [], transform: [], path: [], physics: 0, slider: [] }, deforms });
  });
  return out;
}

function readConstraints(value: unknown, animations: readonly CoreAnimation[], bones: readonly ModelBone[], slots: readonly ModelSlot[], referenceScale: number, problems: string[]): CoreConstraint[] {
  const names = new Set(bones.map((b) => b.name));
  const slotBones = new Map(slots.map((s) => [s.name, s.bone]));
  const parents = new Map(bones.map((b) => [b.name, b.parent]));
  if (!Array.isArray(value)) {
    problems.push('constraints is not a list');
    return [];
  }
  const out: CoreConstraint[] = [];
  value.forEach((raw, i) => {
    const where = `constraints[${i}]`;
    if (!isRecord(raw)) {
      problems.push(`${where} is not an object`);
      return;
    }
    const kind = CORE_CONSTRAINT_KINDS.find((k) => k === raw.kind);
    if (kind === undefined) problems.push(`${where}: kind is ${JSON.stringify(raw.kind)}, none of ${CORE_CONSTRAINT_KINDS.join(', ')}`);
    if (typeof raw.name !== 'string' || raw.name === '') problems.push(`${where}: name is ${JSON.stringify(raw.name)}, not a non-empty string`);
    if (raw.declaredIn !== 'rig' && raw.declaredIn !== 'motion') problems.push(`${where}: declaredIn is ${JSON.stringify(raw.declaredIn)}, not "rig" or "motion"`);
    const at = `${where} "${String(raw.name)}"`;
    let record: CoreConstraintRecord | undefined;
    if (typeof raw.name === 'string') {
      if (kind === 'ik' || kind === 'transform') record = readConstraintRecord(raw, kind, raw.name, at, names, parents, problems);
      else if (kind === 'path') record = readPathRecord(raw, raw.name, at, names, slotBones, problems);
      else if (kind === 'physics') record = readPhysicsRecord(raw, raw.name, at, names, referenceScale, problems);
      else if (kind === 'slider') record = readSliderRecord(raw, raw.name, at, bones, animations, problems);
    }
    if (kind !== undefined && typeof raw.name === 'string') out.push({ kind, name: raw.name, ...(kind === 'slider' && typeof raw.animation === 'string' ? { animation: raw.animation } : {}), ...(record !== undefined ? { record } : {}) });
  });
  return out;
}

/**
 * Read a `rigc-compiled/3` document — or a `rigc-compiled/2` one, which has
 * no `stage`, `editorOrder` or page `pma`/`scale` and is read with `stated:
 * null`, or a `rigc-compiled/1` one, which has no `pages` either and is read
 * with `pages: null` — from its text, refusing by name a text
 * that is not JSON, a wrong `spec`, a missing section (`referenceScale`
 * among them, issue #958), a section the document does not have, a
 * `referenceScale` that is not a finite number, and — in the records these constructs read (bones, slots,
 * skins and their attachment tables) — a field the writer does not write (the
 * writer's own rule, `ordered` in `src/model.ts`, mirrored), a value of the
 * wrong type, a colour spelled other than six or eight hex digits, a parent
 * declared after its child and a name that resolves to nothing. Every problem
 * is collected and thrown once.
 */
export function readModel(text: string, where = 'the model document'): CompiledDocument {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (err) {
    throw new CoreInputError(`${where}: not JSON — ${(err as Error).message}`);
  }
  if (!isRecord(value)) throw new CoreInputError(`${where}: not a JSON object`);
  if (typeof value.spec !== 'string' || !CORE_DOCUMENT_SPECS.includes(value.spec)) {
    throw new CoreInputError(
      `${where}: spec is ${JSON.stringify(value.spec)}, not "${CORE_DOCUMENT_SPEC}" (or "${CORE_DOCUMENT_SPEC_2}", read without its stage, editor order and page flags, or "${CORE_DOCUMENT_SPEC_1}", read without its pages too)`,
    );
  }
  const spec = value.spec;
  const sections: readonly string[] = spec === CORE_DOCUMENT_SPEC ? CORE_SECTIONS : spec === CORE_DOCUMENT_SPEC_2 ? CORE_SECTIONS_2 : CORE_SECTIONS_1;
  const problems: string[] = [];
  for (const key of sections) if (!(key in value)) problems.push(`section "${key}" is missing`);
  for (const key of Object.keys(value)) {
    if (key !== 'spec' && !sections.includes(key)) problems.push(`section "${key}" is not one a ${spec} document has`);
  }
  const pages = spec !== CORE_DOCUMENT_SPEC_1 && 'pages' in value ? readPages(value.pages, problems, spec === CORE_DOCUMENT_SPEC) : null;
  const stage = spec === CORE_DOCUMENT_SPEC && 'stage' in value ? readStage(value.stage, problems) : null;
  // The skeleton's reference scale (issue #958): wind and gravity act over it, so a missing one is the section refusal above, and a value the runtime could not read as a number is refused here by name.
  const referenceScale = typeof value.referenceScale === 'number' && Number.isFinite(value.referenceScale) ? value.referenceScale : NaN;
  if ('referenceScale' in value && Number.isNaN(referenceScale)) problems.push(`referenceScale is ${JSON.stringify(value.referenceScale)}, not a finite number — wind and gravity act over it`);
  const spine = readSpineDigest(value.spine, problems);
  const bones = readBones(value.bones, problems);
  const names = new Set(bones.map((b) => b.name));
  const slots = readSlots(value.slots, names, problems);
  const slotNames = new Set(slots.map((x) => x.name));
  const skins = readSkins(value.skins, names, slotNames, problems);
  problems.push(...linkProblems(skins));
  const events = readEventDefs(value.events, problems);
  const animations = readAnimations(value.animations, names, slots, skins, events, problems);
  const constraints = readConstraints(value.constraints, animations, bones, slots, referenceScale, problems);
  // Each skin's constraint lists name a constraint of that kind: the runtime's loader refuses any other name (`./skins.ts`).
  for (const skin of skins) {
    for (const kind of CORE_CONSTRAINT_KINDS) {
      for (const name of skin.constraints[kind]) {
        if (!constraints.some((c) => c.kind === kind && c.name === name)) problems.push(`skin "${skin.name}".constraints.${kind}: "${name}" is not a ${kind} constraint of this document — the runtime refuses the file ("Couldn't find … constraint ${name} for skin ${skin.name}.")`);
      }
    }
  }
  if (Array.isArray(value.animations)) {
    value.animations.forEach((raw, i) => {
      if (isRecord(raw) && animations[i] !== undefined) animations[i].constraints = readConstraintTimelines(raw.constraints, `animations[${i}] "${animations[i].name}"`, constraints, problems);
    });
  }
  // A slider's physics timelines are its animation's (issue #1049), read only now.
  for (const c of constraints) {
    const r = c.record;
    if (r?.kind === 'slider') r.physics = animations.find((a) => a.name === r.animation)?.constraints.physicsKeyed ?? [];
  }
  const editorOrder = spec === CORE_DOCUMENT_SPEC && 'editorOrder' in value ? readEditorOrder(value.editorOrder, skins, animations, problems) : null;
  if (problems.length > 0) throw new CoreInputError(`${where}: ${problems.length} problem(s): ${problems.join('; ')}`);
  const stated: CoreStated | null = editorOrder === null ? null : { stage, editorOrder };
  const doc: CompiledDocument = { spec, skin: CORE_ALL_SKINS, referenceScale, bones, slots, skins, constraints, animations, spine: { sha256: spine }, pages, stated };
  resolveSkinView(doc);
  return doc;
}

/**
 * The document posed under one skin (issue #932): `name` is `all` — every
 * skin merged, `readModel`'s reading — or a skin of the document, refused by
 * name otherwise. The skins, rosters and records are the document's own; the
 * constraint records are copied, so each view carries its own reading of
 * which constraints apply and what a path walks (`resolveSkinView`).
 */
export function underSkin(doc: CompiledDocument, name: string): CompiledDocument {
  if (name !== CORE_ALL_SKINS && !doc.skins.some((k) => k.name === name)) {
    throw new CoreInputError(`--skin ${JSON.stringify(name)}: no such skin; this document declares [${doc.skins.map((k) => k.name).join(', ') || 'none'}] (or pass ${CORE_ALL_SKINS})`);
  }
  const view: CompiledDocument = { ...doc, skin: name, constraints: doc.constraints.map((c) => (c.record === undefined ? c : { ...c, record: { ...c.record } as CoreConstraintRecord })) };
  resolveSkinView(view);
  return view;
}

/**
 * The document posed with no skin set (issue #1051): no skin's `bones` or
 * constraint lists applied — the default skin's included — and every slot
 * resolved through the default skin alone, or through nothing where the
 * document declares none (`./skins.ts`, *No skin set*, for the measurement).
 * The view a fresh skeleton is in: `render` without `--skin`, A10's walk and
 * `validate()`'s poses (`noSkinView` in `src/render_core.ts`).
 */
export function underNoSkin(doc: CompiledDocument): CompiledDocument {
  const view: CompiledDocument = { ...doc, skin: null, constraints: doc.constraints.map((c) => (c.record === undefined ? c : { ...c, record: { ...c.record } as CoreConstraintRecord })) };
  resolveSkinView(view);
  return view;
}

/**
 * What a skin view decides on the constraint records: whether an applied
 * skin's list names each (`listedBySkin`, `./skins.ts`), and what each path
 * constraint walks — the curve its slot shows at setup, or why that cannot
 * be told (`unresolved`) — and which bones its slot reads (`slotDeps`).
 */
function resolveSkinView(doc: CompiledDocument): void {
  for (const c of doc.constraints) if (c.record !== undefined) c.record.listedBySkin = listedByAppliedSkin(doc, c.kind, c.name);
  // A path constraint walks what its slot shows at setup (construct 5's second cut, `./constraints_path.ts`).
  for (const c of doc.constraints) {
    const r = c.record;
    if (r?.kind !== 'path') continue;
    r.path = null;
    r.unresolved = null;
    const slot = doc.slots.find((s) => s.name === r.slot) as ModelSlot;
    const shown = shownAttachment(doc, slot);
    // Under `all`, every skin filling the slot's setup placeholder: the curve walked is the LAST of them in the Spine file's skin order, which the model does not hold (the slots' ⚠️), so skins stating two curves leave it unresolved. Under a named skin one resolves (`fillingSkins`).
    const fills = slot.setup === null ? [] : fillingSkins(doc, slot.name, slot.setup).flatMap((name) => {
      const g = doc.skins.find((k) => k.name === name)?.attachments[slot.name]?.[slot.setup as string]?.geometry;
      return g === undefined ? [] : [{ skin: name, g: JSON.stringify(g) }];
    });
    if (fills.length > 1 && fills.some((f) => f.g !== fills[0].g)) r.unresolved = `path constraint "${r.name}" walks slot "${r.slot}", whose placeholder "${slot.setup}" skins ${fills.map((x) => `"${x.skin}"`).join(', ')} fill differently — which one --skin all shows is the Spine file's skin order, not the model's; the per-skin dumps (--skin <name>) judge it`;
    else if (shown !== null && 'conflict' in shown) r.unresolved = `path constraint "${r.name}" walks slot "${r.slot}", whose placeholder "${slot.setup}" skins ${shown.conflict.map((x) => `"${x.skin}"`).join(', ')} fill differently — which one --skin all shows is the Spine file's skin order, not the model's; the per-skin dumps (--skin <name>) judge it`;
    else if (shown !== null && shown.record.geometry?.kind === 'path') {
      const g = shown.record.geometry;
      r.path = { vertices: g.vertices, closed: g.closed, constantSpeed: g.constantSpeed, lengths: g.lengths };
    }
    const deps: string[] = [];
    for (const skin of lookupSkins(doc)) {
      for (const record of Object.values(skin.attachments[r.slot] ?? {})) {
        const g = record.geometry;
        if (g?.kind !== 'path') continue;
        for (const b of g.vertices.weighted ? g.vertices.bindings.flatMap((v) => v.map((x) => x.bone)) : [r.slotBone]) if (!deps.includes(b)) deps.push(b);
      }
    }
    r.slotDeps = deps;
  }
}

/** Every linked mesh whose `skin`, `slot` and `source` do not resolve to a mesh record, named — the runtime refuses such a file too. */
function linkProblems(skins: readonly CoreSkin[]): string[] {
  const out: string[] = [];
  skins.forEach((skin, i) => {
    for (const [slot, table] of Object.entries(skin.attachments)) {
      for (const [placeholder, record] of Object.entries(table)) {
        const g = record.geometry;
        if (g?.kind !== 'linkedmesh') continue;
        const why = sourceProblem(skins, g.skin, g.slot, g.source);
        if (why !== null) out.push(`skins[${i}] "${skin.name}".attachments["${slot}"]["${placeholder}"]: ${why}`);
      }
    }
  });
  return out;
}

/** Why a linked mesh's source does not resolve, or null when it is a mesh record. */
function sourceProblem(skins: readonly CoreSkin[], skin: string, slot: string, source: string): string | null {
  const found = skins.find((k) => k.name === skin);
  if (found === undefined) return `the linked mesh's skin "${skin}" is not a skin of this document`;
  const record = found.attachments[slot]?.[source];
  if (record === undefined) return `the linked mesh's source "${source}" is not in skin "${skin}" slot "${slot}"`;
  if (record.kind !== 'mesh') return `the linked mesh's source "${source}" in skin "${skin}" slot "${slot}" is a ${record.kind}, not a mesh`;
  return null;
}

/**
 * The oracle's rounding, stated in its header: six decimals, half up
 * (`Math.round(v * 1e6) / 1e6`), `null` for a value that is not finite, and a
 * `-0` written as `0`. `tools/pose_oracle.ts` rounds with this function, so the
 * two dumpers cannot round two ways.
 */
export function gridRound(v: number): number | null {
  if (!Number.isFinite(v)) return null;
  const out = Math.round(v * 1e6) / 1e6;
  return out === 0 ? 0 : out;
}

/**
 * The raw entry's number (issue #966): the double as computed, `null` for a
 * value that is not finite, and a `-0` written as `0` — what `JSON.stringify`
 * writes for it anyway, so an in-process row and its document agree. No grid:
 * `pose_oracle.ts dump --raw` writes both dumpers' numbers through this.
 */
export function rawNumber(v: number): number | null {
  if (!Number.isFinite(v)) return null;
  return v === 0 ? 0 : v;
}

/** One bone of a posed setup: `[name, worldX, worldY, a, b, c, d, active, parent]`, the oracle's row. */
export type CoreBoneRow = [string, number | null, number | null, number | null, number | null, number | null, number | null, 0 | 1, string | null];

/** What computes the world transforms: the core's own `worldTransforms` (`./world.ts`) unless a caller passes another. */
export type SetupEvaluator = (bones: readonly ModelBone[], active: ReadonlySet<string>) => Map<string, CoreWorld>;

/** One slot of a posed setup: `[name, attachment, r, g, b, a, dark, path, blend]`, the oracle's row. */
export type CoreSlotRow = [string, string | null, number | null, number | null, number | null, number | null, [number | null, number | null, number | null] | null, string | null, string | null];

/** The record a slot's setup placeholder resolves to, and the skin whose table holds it. */
export interface CoreShown {
  skin: string;
  placeholder: string;
  record: CoreAttachment;
}

/**
 * What a slot shows at setup: `null` for nothing, the record shown, or — when
 * the skins filling its placeholder disagree about the row — `conflict`,
 * naming each skin with the name it would show (the header's ⚠️).
 */
export type ShownResolution = CoreShown | null | { conflict: Array<{ skin: string; shown: string; path: string | null }> };

/** What resolves a slot's setup attachment: `shownAttachment` unless a caller passes another. */
export type ShownResolver = (doc: CompiledDocument, slot: ModelSlot) => ShownResolution;

/** What reads a slot's blend mode: `readBlend` unless a caller passes another. */
export type BlendReader = (slot: ModelSlot) => CoreBlendMode;

/** What reads a stated light colour into its four channels: `readColour` unless a caller passes another. */
export type ColourReader = (hex: string) => [number, number, number, number];

/**
 * The five pose stages a step passes through when instrumented (`StageHooks`,
 * issue #1589):
 * - `timeline`: timeline evaluation, animated bone local copy, attachment/deform/sequence timeline states
 * - `world`: bone hierarchy world-transform composition (`worldTransforms`)
 * - `constraints`: constraint record posing, physics step, and constraint solver orchestration (`applyConstraints`)
 * - `geometry`: region corners, mesh/deformed world vertices, and triangle clipping (`drawnGeometry`)
 * - `readout`: slot rows, draw-order resolution/sorting, bone rows, drawn row packaging, and events
 */
export type CoreStage = 'timeline' | 'world' | 'constraints' | 'geometry' | 'readout';

/** Zero-cost-when-absent per-stage instrumentation callbacks on `CorePlant` (issue #1589). */
export interface StageHooks {
  begin(stage: CoreStage): void;
  end(stage: CoreStage): void;
}

/**
 * What the core poses with, each part replaceable. The core suite's plants
 * pass a copy of one of them — a mode's sign flipped, the wrong skin, a
 * channel misread — and nothing else passes any.
 */
export interface CorePlant {
  evaluate?: SetupEvaluator;
  shown?: ShownResolver;
  colour?: ColourReader;
  /** A slot's blend mode (`readBlend`). */
  blend?: BlendReader;
  /** A region's corners (`regionCorners` in `./vertices.ts`). */
  region?: RegionPoser;
  /** A vertex array's world positions (`worldVertices` in `./vertices.ts`). */
  vertices?: VertexPoser;
  /** A deformed vertex array's world positions (`deformedWorldVertices` in `./vertices.ts`). */
  deformedVertices?: DeformedVertexPoser;
  /** A drawn mesh's read-only UVs and triangles (`meshArraysOf` in `./vertices.ts`) — the raw entry's `drawn`; nothing but a control passes one. */
  meshArrays?: MeshArraysOf;
  /** The ik, transform and path constraints as posed, rewritten before they are applied (`./constraints.ts`). */
  constraints?: ConstraintPlant;
  /** Issue #979's solver rules, one planted back to the reading before it (`RUNTIME_SOLVER_RULES` in `./constraints.ts`). */
  solver?: Partial<SolverRules>;
  /** A deform timeline's array at a time (`deformAt` in `./deform.ts`). */
  deform?: DeformEvaluator;
  /** A slider's deform over the current one (`blendDeform` in `./deform.ts`). */
  deformBlend?: DeformBlender;
  /** A sequence timeline's frame at a time (`sequenceFrameAt` in `./deform.ts`). */
  sequence?: SequenceEvaluator;
  /** A draw-order timeline's order at a time (`drawOrderAt` in `./draw_order.ts`). */
  drawOrder?: DrawOrderEvaluator;
  /** The events fired between two samples (`eventsFired` in `./events.ts`). */
  events?: EventsFired;
  /** The stepped phase's step of one physics constraint (`stepPhysics` in `./constraints_physics.ts`). */
  physicsStep?: PhysicsStepper;
  /** One attachment's triangles against a clip polygon (`clipTriangles` in `./clipping.ts`). */
  clip?: TriangleClipper;
  /** One attachment's triangles against any clip the core draws (`clipThrough` in `./clipping.ts`) — the drawn rows the raw entry hands the render. */
  through?: ShapeClipper;
  /** Whether a slot's timelines apply (`slotTimelinesApply` in `./skins.ts`). */
  slotTimelines?: SlotTimelineGate;
  /**
   * Not a plant: what every number of a row is written as — `gridRound` (the
   * oracle's grid) unless the raw entry (`./raw.ts`, issue #966) passes
   * `rawNumber`, the unrounded double.
   */
  round?: (v: number) => number | null;
  /** Per-stage instrumentation callbacks for `tools/pose_bench.ts` (issue #1589); absent on every uninstrumented walk. */
  stage?: StageHooks;
}

/** The document's ik, transform and path constraint records, in its order — what `applyConstraints` runs. */
export function constraintRecords(doc: CompiledDocument): CoreConstraintRecord[] {
  return doc.constraints.flatMap((c) => (c.record === undefined ? [] : [c.record]));
}

/**
 * The blocks of the oracle's document the core does not produce, each with the
 * construct that has to be admitted first (§5 of the design on issue #380), in the
 * document's key order. Empty since issue #956 wrote the `physics` block, the
 * last one; kept so a block left to a later construct has one place to be
 * named. `setup.*` blocks are not here: each is produced, or absent for the
 * reason `poseSetup` gives.
 */
export const NOT_ADMITTED: ReadonlyArray<readonly [string, string]> = [];

/** The setup blocks the core poses, in the document's order. */
const POSED_BLOCKS = ['setup.bones', 'setup.slots', 'setup.drawOrder', 'setup.attachments', 'setup.clips', 'setup.clipped'] as const;

/** Each view's active bones, kept for the view (`activeBones`). */
const activeOfView = new WeakMap<CompiledDocument, ReadonlySet<string>>();

/**
 * Bones active under the skin view posed — the rule measured in the header
 * (`all`) and in `./skins.ts` (a named skin). Derived once per view object and
 * kept with it (issue #1134): the answer reads the view's bones and skins
 * only, a view is never written once it is posed, and every pose of a walk
 * asked again. Read-only to every caller; a view built anew (`underSkin`,
 * `underNoSkin`, a plant's) derives its own.
 */
export function activeBones(doc: CompiledDocument): ReadonlySet<string> {
  const kept = activeOfView.get(doc);
  if (kept !== undefined) return kept;
  const made = deriveActiveBones(doc);
  activeOfView.set(doc, made);
  return made;
}

function deriveActiveBones(doc: CompiledDocument): ReadonlySet<string> {
  const named = new Set(appliedSkins(doc).flatMap((s) => s.bones));
  const parentOf = new Map(doc.bones.map((b) => [b.name, b.parent]));
  const reached = new Set<string>();
  for (const name of named) {
    for (let at: string | undefined = name; at !== undefined && !reached.has(at); at = parentOf.get(at)) reached.add(at);
  }
  return new Set(doc.bones.filter((b) => b.skinRequired !== true || reached.has(b.name)).map((b) => b.name));
}

/**
 * A stated light colour's four channels: each pair of hex digits over 255,
 * and an alpha of 1 when six digits are stated (the header's measurement).
 * `readModel` has already refused every other spelling.
 */
export function readColour(hex: string): [number, number, number, number] {
  const channel = (i: number): number => Number.parseInt(hex.slice(2 * i, 2 * i + 2), 16) / 255;
  return [channel(0), channel(1), channel(2), hex.length === 8 ? channel(3) : 1];
}

/** A stated colour's channels, read once and shared (`viewColours`): read, or copied before a write — never handed out. */
export type StatedColour = Readonly<[number, number, number, number]>;

/** Each view's stated colours, by spelling, read once (`viewColours`). */
const coloursOfView = new WeakMap<CompiledDocument, Map<string, StatedColour>>();

/**
 * The view's reader of a stated colour: `readColour(hex)` read the first time
 * the view meets that spelling and kept, frozen, for every pose after it. The
 * slot rows read every slot's colours on every pose, and a drawn row its
 * record's (the parse was a measured share of a step). The reading is the
 * spelling's alone, so the cache is keyed on the spelling rather than on a
 * slot or a record — a colour respelled in place reads its new spelling, and
 * a view built anew starts its own. The tuple is shared by every pose, so no
 * caller hands it out or writes it (`StatedColour` is read-only): a pose's
 * channels are copied out of it. It is not frozen because a frozen array is
 * read several times slower under JavaScriptCore, measured on Bun 1.4.4, and
 * the read is the whole of what the cache is for. The core suite's `CO63`
 * holds a pose's colours to their spelling and to the pose.
 */
export function viewColours(doc: CompiledDocument): (hex: string) => StatedColour {
  let kept = coloursOfView.get(doc);
  if (kept === undefined) {
    kept = new Map();
    coloursOfView.set(doc, kept);
  }
  const colours = kept;
  return (hex) => {
    let c = colours.get(hex);
    if (c === undefined) {
      c = readColour(hex);
      colours.set(hex, c);
    }
    return c;
  };
}

/** A slot or record that states no light colour: white, opaque. */
export const WHITE: StatedColour = [1, 1, 1, 1];

/**
 * A slot's blend mode: `Normal` when it states none, else the stated
 * spelling folded (the header's measurement). `readModel` has already refused
 * every spelling that folds to no mode.
 */
export function readBlend(slot: ModelSlot): CoreBlendMode {
  if (slot.blend === undefined) return 'Normal';
  const mode = foldBlend(slot.blend);
  if (mode === null) throw new CoreInputError(`slot "${slot.name}": blend ${JSON.stringify(slot.blend)} is no mode the runtime reads`);
  return mode;
}

/** The name a record shows and the region path it names — the header's two measured rules. */
export function shownRow(shown: CoreShown): { name: string; path: string | null } {
  const name = shown.record.name ?? shown.placeholder;
  return { name, path: CORE_REGION_KINDS.has(shown.record.kind) ? (shown.record.path ?? name) : null };
}

/** Each view's resolutions, by slot and placeholder, kept for the view (`shownAttachment`). */
const shownOfView = new WeakMap<CompiledDocument, Map<string, Map<string, ShownResolution>>>();

/**
 * What a slot shows at setup under every skin at once — the header's rule:
 * nothing for a `null` placeholder or one no skin fills; the one record where
 * every skin filling the placeholder gives the same row; a `conflict`, naming
 * each skin in the model's order, where they differ.
 *
 * The answer reads the view's skins and the slot's name and placeholder only,
 * so it is resolved once per view, slot and placeholder and kept (issue
 * #1134: every sample of a walk resolved every slot again). Read-only to every
 * caller; a view built anew resolves its own. An explicit placeholder reads
 * another table key without changing the slot (issue #1538).
 */
export function shownAttachment(doc: CompiledDocument, slot: ModelSlot, placeholder: string | null = slot.setup): ShownResolution {
  if (placeholder === null) return null;
  let bySlot = shownOfView.get(doc);
  if (bySlot === undefined) {
    bySlot = new Map();
    shownOfView.set(doc, bySlot);
  }
  let byPlaceholder = bySlot.get(slot.name);
  if (byPlaceholder === undefined) {
    byPlaceholder = new Map();
    bySlot.set(slot.name, byPlaceholder);
  }
  if (byPlaceholder.has(placeholder)) return byPlaceholder.get(placeholder) as ShownResolution;
  const resolved = resolveShown(doc, slot.name, placeholder);
  byPlaceholder.set(placeholder, resolved);
  return resolved;
}

function resolveShown(doc: CompiledDocument, slotName: string, placeholder: string): ShownResolution {
  // Under a named skin: that skin's record, else the default skin's, else nothing (`./skins.ts`).
  if (doc.skin !== CORE_ALL_SKINS) {
    for (const skin of lookupSkins(doc)) {
      const record = skin.attachments[slotName]?.[placeholder];
      if (record !== undefined) return { skin: skin.name, placeholder, record };
    }
    return null;
  }
  const filling: CoreShown[] = [];
  for (const skin of doc.skins) {
    const record = skin.attachments[slotName]?.[placeholder];
    if (record !== undefined) filling.push({ skin: skin.name, placeholder, record });
  }
  if (filling.length === 0) return null;
  const rows = filling.map((f) => ({ skin: f.skin, ...shownRow(f) }));
  const agree = rows.every((r) => r.name === rows[0].name && r.path === rows[0].path);
  return agree ? filling[0] : { conflict: rows.map((r) => ({ skin: r.skin, shown: r.name, path: r.path })) };
}

/** The oracle's `setup` block as the core writes it: bones, slots, attachments and clips posed or absent, the draw order absent. */
export interface CoreSetup {
  bones: CoreBoneRow[] | null;
  slots: CoreSlotRow[] | null;
  drawOrder: string[] | null;
  attachments: CoreAttachmentRow[] | null;
  clips: CoreClipRow[] | null;
  /** The triangles drawn under a clip, as the clipper returns them (issue #964, `./clipping.ts`). */
  clipped: CoreClippedRow[] | null;
}

/**
 * The setup pose of every bone and every slot, in the oracle's row shapes and
 * rounding, and every block the core leaves absent with its reason (`absent`,
 * in document order). Bones are absent when the document declares a
 * constraint (the header's ⚠️), with the kinds and counts named; slots are
 * absent when a slot's setup placeholder is filled by skins that disagree
 * (the slots' ⚠️), with each such slot named. The attachments' world vertices
 * and the clipping polygons (`./vertices.ts`, issue #931) are absent when
 * either of those is — they go through the bones' world matrices and follow
 * what each slot shows — and the attachments also when a shown region's atlas
 * rectangle is `null`, every such slot named.
 */
export function poseSetup(doc: CompiledDocument, plant: CorePlant = {}, physics?: PhysicsStepContext): { setup: CoreSetup; absent: Array<[string, string]>; world: Map<string, CoreWorld> | null; shown: ShownGeometry[] | null } {
  const evaluate = plant.evaluate ?? worldTransforms;
  const resolve = plant.shown ?? shownAttachment;
  const colour = plant.colour ?? readColour;
  const blend = plant.blend ?? readBlend;
  const round = plant.round ?? gridRound;
  const bonesWhy = constraintsAbsentWhy(doc, solverRules(plant.solver));
  let bones: CoreBoneRow[] | null = null;
  let setupWorld: Map<string, CoreWorld> | null = null;
  // Each slider as it was applied, in constraint order — what the slots are posed from (`./constraints_slider.ts`).
  const applied: SliderApplication[] = [];
  if (bonesWhy === null) {
    const active = activeBones(doc);
    const records = constraintRecords(doc);
    setupWorld = applyConstraints(doc.bones, evaluate(doc.bones, active), active, plant.constraints ? plant.constraints(records) : records, null, applied, physics, undefined, solverRules(plant.solver));
    const world = setupWorld;
    bones = doc.bones.map((b): CoreBoneRow => {
      const t = world.get(b.name);
      if (t === undefined) throw new CoreInputError(`the evaluator returned no transform for bone "${b.name}"`);
      return [b.name, round(t.worldX), round(t.worldY), round(t.a), round(t.b), round(t.c), round(t.d), active.has(b.name) ? 1 : 0, b.parent ?? null];
    });
  }
  const conflicts: string[] = [];
  const slotRows: CoreSlotRow[] = [];
  const liveBones = activeBones(doc);
  const slotGate = plant.slotTimelines ?? slotTimelinesApply;
  for (const slot of doc.slots) {
    const pose: SlotPoseState = {
      placeholder: slot.setup,
      light: slot.color === undefined ? [1, 1, 1, 1] : [...colour(slot.color)],
      dark: slot.dark === undefined ? null : readColour(slot.dark).slice(0, 3),
    };
    // A slot on an inactive bone is not animated, by a slider either (`./skins.ts`).
    if (slotGate(doc, slot, liveBones)) applySliderSlots(slot.name, pose, applied);
    const posedRecord: ModelSlot = { ...slot, setup: pose.placeholder };
    const shown = pose.placeholder === null ? null : resolve(doc, posedRecord);
    if (shown !== null && 'conflict' in shown) {
      conflicts.push(`slot "${slot.name}" placeholder "${pose.placeholder}" is filled by skins ${shown.conflict.map((c) => `"${c.skin}" (shows ${JSON.stringify(c.shown)}, path ${JSON.stringify(c.path)})`).join(', ')}`);
      continue;
    }
    const row = shown === null ? null : shownRow(shown);
    const [r, g, b, a] = pose.light;
    const dark = pose.dark;
    slotRows.push([
      slot.name,
      row === null ? null : row.name,
      round(r), round(g), round(b), round(a),
      dark === null ? null : [round(dark[0]), round(dark[1]), round(dark[2])],
      row === null ? null : row.path,
      blend(slot),
    ]);
  }
  const slotsWhy = (bonesWhy === null ? null : slidersWhy(doc)) ?? (conflicts.length === 0
    ? null
    : `${conflicts.join('; ')} — under --skin all the LAST of them in the Spine file's skin order wins, and that order is the emitter's (default first, the rest in the editor's order), not the model's; the per-skin dumps (--skin <name>) judge it`);
  const slots = slotsWhy === null ? slotRows : null;
  const upstream = [bonesWhy === null ? null : `setup.bones is absent (${bonesWhy}), and every vertex goes through a bone's world matrix`, slotsWhy === null ? null : 'setup.slots is absent, so what a slot shows is not posed'].filter((x): x is string => x !== null);
  // The draw order: the slot order, then each slider's draw-order key (`./draw_order.ts`), which needs the sliders' times, read off the bones.
  const orderWhy = bonesWhy === null ? null : slidersKeyingWhy(doc, 'drawOrder');
  let drawOrder: string[] | null = null;
  if (orderWhy === null) {
    let order: number[] = doc.slots.map((_s, i) => i);
    for (const app of applied) order = (plant.drawOrder ?? drawOrderAt)(doc.slots.length, app.timelines.drawOrder, app.at) ?? order;
    drawOrder = order.map((i) => doc.slots[i].name);
  }
  let attachments: CoreAttachmentRow[] | null = null;
  let clips: CoreClipRow[] | null = null;
  let clipsWhy: string | null = upstream.length === 0 ? null : upstream.join('; ');
  let attachmentsWhy: string | null = clipsWhy;
  let clipped: CoreClippedRow[] | null = null;
  let clippedWhy: string | null = clipsWhy ?? orderWhy;
  // What the raw entry reads past the rows (issue #966, `./raw.ts`): the unrounded world transforms and the shown records in draw order.
  let shownInOrder: ShownGeometry[] | null = null;
  if (clipsWhy === null && setupWorld !== null && drawOrder !== null) {
    const world = setupWorld;
    // Each slot's shown record, with what the sliders' deform and sequence timelines set on it (`./deform.ts`), in the draw order.
    // From the setup placeholders; `attachmentStates` applies each slider's attachment key, then its deform and sequence keys, in order.
    const placeholders = new Map(doc.slots.map((sl) => [sl.name, sl.setup]));
    const states = attachmentStates(doc, resolve, placeholders, null, applied, plant);
    const rank = new Map(drawOrder.map((n, i) => [n, i]));
    const shown = [...states.shown].sort((a, b) => (rank.get(a.slot) ?? 0) - (rank.get(b.slot) ?? 0));
    shownInOrder = states.why.length === 0 ? shown : null;
    const posed = poseGeometry(shown, world, sourceOfDoc(doc), round, { region: plant.region, vertices: plant.vertices }, drawWalkOf(doc, drawOrder, plant));
    const stateWhy = states.why.length === 0 ? null : `${states.why.join('; ')}`;
    attachments = stateWhy === null ? posed.attachments : null;
    attachmentsWhy = stateWhy ?? posed.attachmentsWhy;
    clips = stateWhy === null ? posed.clips : null;
    clipsWhy = stateWhy;
    clipped = stateWhy === null ? posed.clipped : null;
    clippedWhy = stateWhy ?? posed.clippedWhy;
  }
  // `NOT_ADMITTED` is in document order; bones and slots stand before `setup.drawOrder`, attachments and clips after it.
  const why: Record<(typeof POSED_BLOCKS)[number], string | null> = { 'setup.bones': bonesWhy, 'setup.slots': slotsWhy, 'setup.drawOrder': orderWhy, 'setup.attachments': attachmentsWhy, 'setup.clips': clipsWhy, 'setup.clipped': clippedWhy };
  // `NOT_ADMITTED` (empty since issue #956) stands before the setup blocks in the document's order.
  const absent: Array<[string, string]> = NOT_ADMITTED.map(([block, reason]): [string, string] => [block, reason]);
  for (const block of POSED_BLOCKS) if (why[block] !== null) absent.push([block, why[block] as string]);
  return { setup: { bones, slots, drawOrder, attachments, clips, clipped }, absent, world: setupWorld, shown: shownInOrder };
}

/** What the clipped block's draw walk reads (`DrawWalk` in `./vertices.ts`): the draw order, the active bones, and a linked mesh's source triangles. */
export function drawWalkOf(doc: CompiledDocument, order: readonly string[], plant: CorePlant = {}): DrawWalk {
  const active = activeBones(doc);
  return {
    order,
    active,
    meshOf: (skin, slot, source) => {
      const g = doc.skins.find((k) => k.name === skin)?.attachments[slot]?.[source]?.geometry;
      return g?.kind === 'mesh' ? { uvs: g.uvs, triangles: g.triangles } : undefined;
    },
    ...(plant.clip === undefined ? {} : { clip: plant.clip }),
    ...(plant.through === undefined ? {} : { through: plant.through }),
  };
}

/** A linked mesh's source vertices, or why they do not resolve — what `poseGeometry` reads a linked mesh through. */
export function sourceOfDoc(doc: CompiledDocument): (skin: string, slot: string, source: string) => ModelVertices | string {
  return (skin, slot, source) => {
    const g = doc.skins.find((k) => k.name === skin)?.attachments[slot]?.[source]?.geometry;
    return g?.kind === 'mesh' ? g.vertices : (sourceProblem(doc.skins, skin, slot, source) ?? `the linked mesh's source "${source}" carries no vertices`);
  };
}

/** Why a block a slider's animation keys cannot be posed because the bones its time is read from are absent, or null: `drawOrder` for the draw order. */
export function slidersKeyingWhy(doc: CompiledDocument, group: 'drawOrder'): string | null {
  const keyed = doc.constraints.flatMap((c) => {
    if (c.kind !== 'slider') return [];
    const anim = doc.animations.find((a) => a.name === c.animation);
    return anim !== undefined && anim.timelines[group].length > 0 ? [`slider "${c.name}" applies animation "${c.animation}", which keys the draw order`] : [];
  });
  return keyed.length === 0 ? null : `${keyed.join('; ')} — a slider's time is read off the bones, which are absent`;
}

/** Why the setup slots cannot be posed because a slider poses them and the bones its time is read from are absent, or null when no slider's animation keys a slot. */
function slidersWhy(doc: CompiledDocument): string | null {
  const keyed = doc.constraints.flatMap((c) => {
    if (c.kind !== 'slider') return [];
    const slots = doc.animations.find((a) => a.name === c.animation)?.slots ?? [];
    return slots.length === 0 ? [] : [`slider "${c.name}" applies animation "${c.animation}", which keys slot(s) ${slots.map((x) => `"${x}"`).join(', ')}`];
  });
  return keyed.length === 0 ? null : `${keyed.join('; ')} — the oracle's setup applies sliders, and a slider poses the slots its animation keys at a time read off the bones, which are absent`;
}
