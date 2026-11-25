/**
 * verdict_gate — the validator's two suppliers held to the same lines over a
 * corpus (issue #1025, step 4c of #380): every recipe built through the CLI,
 * its Spine pair gated by `validate()` over what spine-core loaded and its
 * model document gated by the model side (`src/assertions/model/index.ts`)
 * over the document and rigc's core, and every moved assertion's lines
 * compared, under both profiles.
 *
 *   bun tools/verdict_gate.ts [--recipes <recipes.json>] [--root <dir>] [--work <dir> | --keep-work]
 *
 * With no `--recipes`, the tree's own: `tools/emit_hashes.ts`'s `treeRecipes`
 * (every fetched editor export and every gallery rig — nineteen when
 * `examples/` is fetched), built exactly as `emit_hashes run` and
 * `core_gate` build them (`buildRecipes`). `--recipes` takes an
 * `emit-hashes-recipes/1` or `emit-hashes/1` document and `--root` resolves its
 * stages, which is how a private corpus is run: its recipes live with it and
 * only the printed lines leave it.
 *
 * ## Per row
 *
 * The build's `skeleton.json`, `skeleton.atlas` and `skeleton.model.json`,
 * read from `{{out}}`. `validate()` runs over the pair with `atlasDir` the
 * output directory and the rig info the document's own `rig` section states
 * (`documentRig`) and the declared durations it states (`documentDurations`,
 * since cut 4c-3: A09 reads them) — and the model side over the document with
 * the same directory, reading the rig info and the durations off the document
 * itself (issue #1054), under `spine` and again under `rig-play` (the
 * renderer rules — A13 and A19 among them — and the archetype rules A21 and
 * A28 run only under `rig-play`, and `spine` never runs them). For each moved
 * assertion and
 * profile the row prints `IDENTICAL` or `DIFFERING` with both sides' lines.
 *
 * Beside the lines, the one fact a line cannot show: **the order** the skins'
 * entries are walked in (the region attachments' names and sizes), read off
 * both suppliers (`runtimeFacts`, `modelSkinEntries`)
 * and compared whole — an A03 that fails twice prints its two lines in that
 * order, and a rig no line fails on still has one. And since cut 4c-1, every
 * fact family that cut added, read off both suppliers and spelled whole
 * (`factSpellings`) — the meshes, the bones an animation keys, the skin
 * members, the region joins, the atlas's pages and regions, the stage and the
 * region paths — so a value no line printed on this row is still compared.
 * Cut 4c-4 added its three (the skeleton's bones and slots, every
 * animation's bone timelines, every event key) and the slot timelines A12
 * reads beside A45 to the same set.
 *
 * ## What the model side is given
 *
 * The stage and each page's `pma`: a `rigc-compiled/3` document states both
 * (issue #1026) and is given neither (`modelGivenOf`); for a `/2` or `/1`
 * document, which does not hold them (`src/assertions/model/given.ts`), they
 * are read off the build this row gates by `modelGivenOfBuild`: the stage the
 * skeleton header states and each page's `pma` as `parseAtlasText` reads the
 * atlas. The selftest's supplier check gives them the same way. The rig info
 * and the declared durations are the document's own on every spec: the model
 * side reads them there and refuses them given beside it (issue #1054), and
 * `validate()` is handed the same statement, read by the model side's readers
 * (`documentRig`, `documentDurations`).
 *
 * Since cut 4c-2, beside the walk: the four families that cut added, compared
 * fact by fact, and every derivation the model side makes counted against the
 * runtime's value (`tools/rig_facts.ts`) — printed as one `cut 4c-2's facts`
 * line per row and one `DERIVED` line per derivation before the verdict.
 *
 * Since cut 4c-3, the four families the posed assertions read (A39's survey,
 * A09's durations, A43's tint, A46's series), compared question by question
 * (`comparePosedFacts`): each body runs over spine-core's facts, every call it
 * makes is asked of the model side's supplier with the same arguments, and the
 * answers are compared at tolerance 0 — the times A43 and A46 pose at are
 * times no grid or raw frame lands on, so no other gate holds those readings.
 * One `cut 4c-3's facts` line per row, a `REFUSED` line per question the core
 * refused by name, and one `POSED` line per family before the verdict.
 *
 * A row whose build chain exited non-zero, or that wrote no model document, or
 * whose parse both sides refused, is `REFUSED` with the reason, and compares
 * nothing. A row one side reads and the other refuses is `DIFFERING` on "the
 * parse": that is the one disagreement the region rule exists to prevent.
 *
 * Since cut 4c-5a, the stepped poses A10 reads — the setup pose, every
 * animation's LOOPING walk at A10's step, a bone's mode at each `inherit` key —
 * compared the same way (`compareSteppedPoses`, through `askFamilies`), every
 * number of every pose at tolerance 0 with a non-finite value spelled as what
 * it is: one `cut 4c-5a's facts` line per row and one `POSED` line for the
 * family.
 *
 * ## The verdict
 *
 * The last line counts what was compared, off the rows. Exit codes as
 * `emit_hashes compare`: 0 when every line set and every walk compared is
 * identical, 1 when any differs, 2 when the input is bad by name — or when the
 * run compared nothing at all, which is no verdict.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { MODEL_DOCUMENT_FILE, MODEL_DOCUMENT_SPEC } from '../src/model.ts';
import { parseAtlasText } from '../src/atlas.ts';
import { spelledDir } from '../src/written_path.ts';
import { CoreInputError, readModel } from '../src/core/index.ts';
import { reportLines, runtimeCut4c5Facts, runtimeFacts, runtimePosedFacts, validate, type ValidateProfile, type ValidateReport } from '../src/validate.ts';
import { MODEL_SUPPLY, MOVED_ASSERTIONS, validateModel, type ModelReport, type ModelSupply, type ModelValidateInput } from '../src/assertions/model/index.ts';
import type { Verdicts } from '../src/assertions/harness.ts';
import { a39DeformKeepsTriangleWinding } from '../src/assertions/bodies/a39.ts';
import { a09AnimationDurationMatchesSpec } from '../src/assertions/bodies/a09.ts';
import { a43TwoColorTintLoadsAndPosesAsWritten } from '../src/assertions/bodies/a43.ts';
import { a46SequenceAttachmentsShowTheFrameTheFileStates } from '../src/assertions/bodies/a46.ts';
import { a10NoNanAfterStepping } from '../src/assertions/bodies/a10.ts';
import type { SteppedFrame, SteppedPoseFacts } from '../src/assertions/facts/stepped_poses.ts';
import { walkHistory } from '../src/core/walk.ts';
import { noSkinView } from '../src/render_core.ts';
import type { BoneTimelineFacts } from '../src/assertions/facts/bone_timelines.ts';
import type { DeformSurveyFacts } from '../src/assertions/facts/deform_survey.ts';
import type { AnimationDurationFacts } from '../src/assertions/facts/animation_durations.ts';
import type { TwoColourFacts } from '../src/assertions/facts/two_colour.ts';
import type { SequenceFacts } from '../src/assertions/facts/sequences.ts';
import { a40SlidersComposeOnASharedTarget } from '../src/assertions/bodies/a40.ts';
import { a34ConstraintTimelineTargets } from '../src/assertions/bodies/a34.ts';
import type { SliderCompositionFacts } from '../src/assertions/facts/slider_composition.ts';
import type { ConstraintTargetFacts } from '../src/assertions/facts/constraint_targets.ts';
import type { ModelGiven } from '../src/assertions/model/given.ts';
import type { ReadDocument } from '../src/assertions/model/parse.ts';
import { A00_MODEL_READ, A00_MODEL_REGIONS_ON_PAGES } from '../src/assertions/model/parse.ts';
import { modelDeclaredDurations, rigSectionProblems } from '../src/assertions/model/declared.ts';
import { modelSkinEntries } from '../src/assertions/model/skin_entries.ts';
import type { SkinEntryFacts } from '../src/assertions/facts/skin_entries.ts';
import type { RigInfo } from '../src/types.ts';
import { RIG_FACT_FAMILIES, rigFactsDerivationsOf, rigFactsSpelling, spineRigFacts, sumTallies, type DerivationTally, type RigFactFamily } from './rig_facts.ts';
import { HashesInputError, readRecipes, treeRecipes, TREE_ROOT, type Recipe } from './emit_hashes.ts';
import { buildRecipes, type BuiltRow } from './core_gate.ts';
import { readKeepWork, WorkDirectory } from './work_dir.ts';

/** The profiles a row is gated under: `spine` runs the validity rules, `rig-play` every rule. */
export const VERDICT_PROFILES: readonly ValidateProfile[] = ['spine', 'rig-play'];

/** A refusal about an input — the command exits 2 on it. */
export class VerdictInputError extends Error {}

/** One moved assertion under one profile: both sides' lines, and whether they are the same. */
export interface VerdictCell {
  code: string;
  profile: ValidateProfile;
  spine: string[];
  model: string[];
  identical: boolean;
  /** Where the lines differ because the core refused the build by name in a documented class (`coreRefusalOf`): the class and the sentence. */
  refused?: { why: string; route: string };
}

/**
 * The classes of input the core documents refusing by name (issue #1025, cut
 * 4c-5a), each a sentence's opening and the place that writes it and says why
 * — with the issue that owns the gap where one does. A line set whose model
 * side is one thrown refusal of one of these classes is counted apart — by
 * this instrument (`verdictRow`) and by the selftest's supplier check (`VF02`),
 * which call the one function below — and is neither IDENTICAL nor
 * DIFFERING. A `CoreInputError` opening as none of them stays a difference,
 * so a refusal cannot hide a wrong line by being new: a class joins this list
 * by name, in a reviewed change.
 */
export const DOCUMENTED_CORE_REFUSALS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^the raw setup pose leaves setup\.bones out \(/, 'a block the oracle\'s core dump names absent at setup (`poseRawSetup` in src/core/raw.ts, `constraintsAbsentWhy`)'],
  [/^the raw walk leaves the bones out: /, 'a block the core leaves out of a walk (`walkIn` in src/core/raw.ts)'],
];

/** The documented class a core refusal's sentence belongs to, or `null` for one no class documents. */
export function documentedCoreRefusal(sentence: string): string | null {
  return DOCUMENTED_CORE_REFUSALS.find(([opening]) => opening.test(sentence))?.[1] ?? null;
}

/**
 * The refusal behind a model-side line set, or `null`: only where `code`'s
 * lines are exactly one `FAIL <code>: threw: …`, the body run again over the
 * same document throws a `CoreInputError` (not any error), and its sentence
 * opens as a `DOCUMENTED_CORE_REFUSALS` class. Anything else is `null`, and
 * the caller keeps the line set a difference.
 */
export function coreRefusalOf(code: string, modelLines: readonly string[], modelText: string, input: ModelValidateInput): { why: string; route: string } | null {
  if (modelLines.length !== 1 || !modelLines[0].startsWith(`  FAIL  ${code}: threw: `)) return null;
  const moved = MOVED_ASSERTIONS.find((m) => m.code === code);
  if (moved === undefined) return null;
  try {
    const read = { doc: readModel(modelText), json: JSON.parse(modelText) as Record<string, unknown> };
    moved.run({ fail: () => {}, skip: () => {}, stats: {} }, read, input, MODEL_SUPPLY);
  } catch (err) {
    if (!(err instanceof CoreInputError)) return null;
    const route = documentedCoreRefusal(err.message);
    return route === null ? null : { why: err.message, route };
  }
  return null;
}

/** One recipe: refused with the reason, or every cell and the walk comparison. */
export interface VerdictRow {
  name: string;
  refused: string | null;
  cells: VerdictCell[];
  /** The skins' walk on both sides, as one string each, or null for a refused row. */
  walk: { spine: string; model: string; identical: boolean } | null;
  /** Each fact family cut 4c-1 added, spelled on both sides (`factSpellings`); absent on a refused row. */
  facts?: Array<{ family: string; spine: string; model: string; identical: boolean }>;
  /**
   * Cut 4c-2's families compared fact by fact (`tools/rig_facts.ts`): the
   * families whose spellings differ, and each derivation's tally — absent on a
   * refused row, or where a row was built by hand.
   */
  rigFacts?: { differing: Array<{ family: string; spine: string; model: string }>; derivations: DerivationTally[] } | null;
  /** Cut 4c-3's families compared question by question (`comparePosedFacts`) — absent on a refused row, or where a row was built by hand. */
  posedFacts?: PosedFactTally[] | null;
  /** Cut 4c-5's families compared the same way (`compareCut4c5Facts`) — absent on a refused row, or where a row was built by hand. */
  cut4c5Facts?: PosedFactTally[] | null;
  /** Cut 4c-5a's family compared the same way (`compareSteppedPoses`) — absent on a refused row, or where a row was built by hand. */
  steppedFacts?: PosedFactTally[] | null;
}

/** A report line's code. */
const lineCode = (line: string): string | null => /^ {2}(?:PASS|SKIP|PROF|FAIL) {2}([A-Z0-9_]+)/.exec(line)?.[1] ?? null;

/** One code's lines in a report, as `reportLines` prints them. */
export function codeLines(report: ValidateReport | ModelReport, code: string): string[] {
  return reportLines(report as ValidateReport).filter((line) => lineCode(line) === code);
}

/** A walk of the skins as one string: every region's name and size in order. */
export function walkSpelling(facts: SkinEntryFacts): string {
  return JSON.stringify(facts.regionAttachments.map((r) => [r.name, r.width, r.height]));
}

/**
 * What the model side is given beside a build's document (issue #1025, cut
 * 4c-1; `src/assertions/model/given.ts`), read off the build itself: the stage
 * its skeleton header states — each extent where the header states a number,
 * `null` where it states neither — and each atlas page's `pma` as rigc's own
 * reader takes it (`parseAtlasText`, which `PKR01` holds field for field to
 * spine-core's). The one function both the selftest and this tool give it by.
 */
export function modelGivenOfBuild(skeletonText: string, atlasText: string): ModelGiven {
  const parsed: unknown = JSON.parse(skeletonText);
  const header = typeof parsed === 'object' && parsed !== null ? (parsed as { skeleton?: unknown }).skeleton : undefined;
  const stated = (key: 'width' | 'height'): number | undefined => {
    const value = typeof header === 'object' && header !== null ? (header as Record<string, unknown>)[key] : undefined;
    return typeof value === 'number' ? value : undefined;
  };
  const width = stated('width');
  const height = stated('height');
  return {
    stage: width === undefined && height === undefined ? null : { ...(width === undefined ? {} : { width }), ...(height === undefined ? {} : { height }) },
    pma: parseAtlasText(atlasText).pages.map((page) => page.pma),
  };
}

/**
 * What the model side is to be given beside `modelText` (issue #1026): nothing
 * for a `rigc-compiled/3` document, which states the stage and each page's
 * `pma` itself and is refused `given` beside it (`refuseGivenBeside` in
 * `src/assertions/model/given.ts`); for a `/2` or `/1` document — or a text
 * that is not a document, which the model side refuses at its parse — the
 * build's own, `modelGivenOfBuild`.
 */
export function modelGivenOf(modelText: string, skeletonText: string, atlasText: string): ModelGiven | undefined {
  let spec: unknown;
  try {
    spec = (JSON.parse(modelText) as { spec?: unknown }).spec;
  } catch {
    spec = undefined;
  }
  return spec === MODEL_DOCUMENT_SPEC ? undefined : modelGivenOfBuild(skeletonText, atlasText);
}

/** The fact families cut 4c-1 added, as one supplier states them — `runtimeFacts`'s, or the model side's (`modelFactSet`). */
export interface FactSet {
  skinEntries: SkinEntryFacts;
  animatedBones: ReturnType<ModelSupplyOf<'animatedBones'>>;
  skinMembers: ReturnType<ModelSupplyOf<'skinMembers'>>;
  regionJoins: ReturnType<ModelSupplyOf<'regionJoins'>>;
  atlasRegions: ReturnType<ModelSupplyOf<'atlasRegions'>>;
  stage: ReturnType<ModelSupplyOf<'stage'>>;
  /** Cut 4c-4's families, and the slot timelines A12 reads beside A45 — added to this set so `VF09` and every row compare them too. */
  slotColour: ReturnType<ModelSupplyOf<'slotColour'>>;
  skeletonRoster: ReturnType<ModelSupplyOf<'skeletonRoster'>>;
  boneTimelines: ReturnType<ModelSupplyOf<'boneTimelines'>>;
  eventKeys: ReturnType<ModelSupplyOf<'eventKeys'>>;
}
type ModelSupplyOf<K extends keyof typeof MODEL_SUPPLY> = (typeof MODEL_SUPPLY)[K];

/** The model side's `FactSet` over a document and what it is given — the suppliers `validateModel` runs, called the same way. */
export function modelFactSet(modelText: string, given: ModelGiven | undefined, supply: typeof MODEL_SUPPLY = MODEL_SUPPLY): FactSet {
  const read: ReadDocument = { doc: readModel(modelText), json: JSON.parse(modelText) as Record<string, unknown> };
  const input: ModelValidateInput = { modelText, atlasDir: '', profile: 'spine', given };
  return {
    skinEntries: supply.skinEntries(read),
    animatedBones: supply.animatedBones(read),
    skinMembers: supply.skinMembers(read),
    regionJoins: supply.regionJoins(read),
    atlasRegions: supply.atlasRegions(read, input),
    stage: supply.stage(read, input),
    slotColour: supply.slotColour(read),
    skeletonRoster: supply.skeletonRoster(read),
    boneTimelines: supply.boneTimelines(read),
    eventKeys: supply.eventKeys(read),
  };
}

/**
 * Each family of a `FactSet` as one string, every value a body can read and
 * the order it reads them in — and where a body asks by identity (a skin's
 * constraint, a region's page, `findRegion`'s answer), the position of the
 * entry it is handed. `animations` are the names `bonesKeyedBy` is asked for.
 */
export function factSpellings(f: FactSet, animations: readonly string[]): Record<string, string> {
  const atlas = f.atlasRegions.atlas;
  const members = f.skinMembers;
  const names = atlas === null ? [] : [...new Set(atlas.regions.map((r) => r.name)), '\u0000no such region'];
  return {
    'region paths': JSON.stringify(f.skinEntries.regionAttachments.map((r) => [r.name, r.path ?? null])),
    // The meshes A13, A14, A15 and A22 read are cut 4c-2's family since issue #1054, spelled with it (`rigFactsSpelling`, tools/rig_facts.ts).
    'animated bones': JSON.stringify(animations.map((name) => [name, f.animatedBones.bonesKeyedBy(name) ?? (f.animatedBones.bonesKeyedBy(name) === null ? 'no bone timeline' : 'no such animation')])),
    'skin members': JSON.stringify([
      members.skins.map((s) => [s.name, s.bones.map((b) => members.bones.indexOf(b)), s.constraints.map((c) => members.constraints.indexOf(c))]),
      members.bones.map((b) => [b.name, b.skinRequired, b.parent === null ? null : members.bones.indexOf(b.parent)]),
      members.constraints.map((c) => [c.name, c.skinRequired]),
    ]),
    'region joins': JSON.stringify(f.regionJoins),
    atlas:
      atlas === null
        ? 'null'
        : JSON.stringify([
            atlas.pages.map((p) => [p.name, p.width, p.height, p.pma]),
            atlas.regions.map((r) => [r.name, atlas.pages.indexOf(r.page), r.x, r.y, r.width, r.height, r.degrees, r.offsetX, r.offsetY, r.originalWidth, r.originalHeight]),
            names.map((name) => {
              const found = atlas.findRegion(name);
              return found === null ? -1 : atlas.regions.indexOf(found);
            }),
          ]),
    stage: JSON.stringify([f.stage.width ?? null, f.stage.height ?? null]),
    // Cut 4c-4's: every value A12, A24–A26, A29, A30 and A32 read, in the order they read it.
    'slot timelines': JSON.stringify(f.slotColour.slotTimelines.map((s) => [s.animation, s.slot, s.timelines])),
    roster: JSON.stringify([f.skeletonRoster.bones.map((b) => [b.name, b.parent]), f.skeletonRoster.slots.map((s) => [s.name, s.dark])]),
    'bone timelines': JSON.stringify(f.boneTimelines.boneTimelines.map((b) => [b.animation, b.bone, b.timelines])),
    'event keys': JSON.stringify([f.eventKeys.parsed, f.eventKeys.animations, f.eventKeys.timelines, f.eventKeys.keys.map((k) => [k.animation, k.index, k.kept, k.stopped, k.name, k.sets.volume, k.sets.balance, k.audio])]),
  };
}

/** The animation names a row's `bonesKeyedBy` is asked for: the document's, then `idle` (A15's), then one no skeleton holds. */
export function askedAnimations(modelText: string): string[] {
  const doc = JSON.parse(modelText) as { animations?: Array<{ name?: unknown }> };
  const named = (doc.animations ?? []).map((a) => String(a.name));
  return [...new Set([...named, 'idle', '\u0000no such animation'])];
}

/** Both sides' `factSpellings` over one build, family by family — cut 4c-1's part of the one walk (`compareFactFamilies`). */
export function compareFacts(skeletonText: string, atlasText: string, modelText: string): Array<{ family: string; spine: string; model: string; identical: boolean }> | null {
  const walked = compareFactFamilies(skeletonText, atlasText, modelText, {}, {}, ['4c-1']);
  return walked === null ? null : walked.map(wholeFamilyReading);
}

/** One family read whole (cuts 4c-1 and 4c-2): identical where its one question was answered alike, else both spellings — a refusal by name spelled as one. */
export function wholeFamilyReading(t: FamilyTally): { family: string; spine: string; model: string; identical: boolean } {
  const d = t.differing[0];
  const r = t.refused[0];
  if (d !== undefined) return { family: t.family, spine: d.spine, model: d.model, identical: false };
  if (r !== undefined) return { family: t.family, spine: '(answered)', model: `refused by the core by name: ${r.why}`, identical: false };
  return { family: t.family, spine: '', model: '', identical: true };
}

/**
 * The rig info the build's own document states (its `rig` section,
 * `CompileResult.rig` as `modelDocument` wrote it), handed to `validate()` —
 * read by the model side's own reader (`modelRigInfo`), which the model side
 * reads its declarations through (issue #1054), so the two sides read one
 * statement and a difference in a line is the suppliers' and never the
 * inputs'. `undefined` for a document that does not parse or whose rig section
 * does not read, which the model side refuses by name at its parse.
 */
export function documentRig(modelText: string): RigInfo | undefined {
  try {
    const json = JSON.parse(modelText) as Record<string, unknown>;
    return rigSectionProblems(json).length === 0 ? (json.rig as RigInfo) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The declared durations the build's own document states (each animation's
 * `duration`, the motion spec's, which `compile` verified and handed to the
 * gate as `CompileResult.declaredDurations`), handed to `validate()` so A09 is
 * measured on every row rather than skipping as "no motion spec supplied" — read
 * as the model side reads them (`modelDeclaredDurations`, issue #1054). In the
 * document's order, which is the motion spec's, as `declaredDurations` is
 * keyed. `undefined` for a document the reader refuses.
 */
export function documentDurations(modelText: string): Record<string, number> | undefined {
  try {
    return modelDeclaredDurations({ doc: readModel(modelText), json: JSON.parse(modelText) as Record<string, unknown> });
  } catch (err) {
    if (err instanceof CoreInputError || err instanceof SyntaxError) return undefined;
    throw err;
  }
}

/** Cut 4c-3's four families (issue #1025): the facts a posed assertion reads, each named for the body that reads it. */
export const POSED_FACT_FAMILIES = ['deform survey', 'animation durations', 'two-colour tint', 'sequences'] as const;
export type PosedFactFamily = (typeof POSED_FACT_FAMILIES)[number];

/** Cut 4c-5's two families (issue #1025): A40's sliders, whose additive behaviour is posed, and A34's constraint groups, whose unnamed physics reach is. */
export const CUT_4C5_FAMILIES = ['slider composition', 'constraint targets'] as const;
export type Cut4c5Family = (typeof CUT_4C5_FAMILIES)[number];

/**
 * Cut 4c-5a's family (issue #1025): the stepped poses A10 reads — the setup
 * pose, each animation's looping walk, a bone's mode at a key — compared the
 * way the others are (`compareSteppedPoses`), and counted apart from them.
 */
export const STEPPED_FACT_FAMILIES = ['stepped poses'] as const;
export type SteppedFactFamily = (typeof STEPPED_FACT_FAMILIES)[number];

/** A family whose facts are compared question by question. */
export type QuestionFamily = PosedFactFamily | Cut4c5Family | SteppedFactFamily;

/**
 * Cut 4c-1's families, as `factSpellings` names them — each read whole, one
 * question per build. The meshes it added are cut 4c-2's family since issue
 * #1054 (`RIG_FACT_FAMILIES`).
 */
export const CUT_4C1_FAMILIES = ['region paths', 'animated bones', 'skin members', 'region joins', 'atlas', 'stage', 'slot timelines', 'roster', 'bone timelines', 'event keys'] as const;
export type Cut4c1Family = (typeof CUT_4C1_FAMILIES)[number];

/** Every family the one walk asks (issue #1054), and the cut that added it — the figure each cut's control prints is read off its own. */
export type FactFamily = Cut4c1Family | RigFactFamily | QuestionFamily;
export const FACT_CUTS = ['4c-1', '4c-2', '4c-3', '4c-5', '4c-5a'] as const;
export type FactCut = (typeof FACT_CUTS)[number];
export const FAMILIES_BY_CUT: Readonly<Record<FactCut, readonly FactFamily[]>> = {
  '4c-1': CUT_4C1_FAMILIES,
  '4c-2': RIG_FACT_FAMILIES,
  '4c-3': POSED_FACT_FAMILIES,
  '4c-5': CUT_4C5_FAMILIES,
  '4c-5a': STEPPED_FACT_FAMILIES,
};

/** One family's comparison over one build: every question the body asked, how many numbers the answers held, and what differed or was refused. */
export interface PosedFactTally {
  family: FactFamily;
  /** Questions asked of both sides — a value a body reads whole, or one call it made. */
  questions: number;
  /** Of those, the calls a body made (cut 4c-5: a family whose every question is a whole value posed nothing). */
  calls?: number;
  /** How many methods spine-core's facts of this family answer — a family that answers calls is asked one, or it is held by nothing (the one floor, issue #1054). */
  methods?: number;
  /** Leaf values in spine-core's answers — numbers, strings and booleans, at any depth: what a family whose facts hold no number is measured by. */
  leaves?: number;
  /** Numbers in spine-core's answers, each compared at tolerance 0. */
  values: number;
  /** Questions both sides answered alike. */
  equal: number;
  /** Questions the core refused by name (a `CoreInputError`), with the sentence. */
  refused: Array<{ question: string; why: string }>;
  /** Questions answered differently. */
  differing: Array<{ question: string; spine: string; model: string }>;
}

/** One family's tally on the one walk, with the cut that added it. */
export interface FamilyTally extends PosedFactTally {
  cut: FactCut;
}

/** A number as JSON cannot lose it: NaN, the infinities and −0 spelled out (`tools/rig_facts.ts`' reading). */
const exactNumber = (_key: string, value: unknown): unknown => {
  if (value instanceof Set) return [...value].map(String).sort();
  if (typeof value !== 'number') return value;
  if (Number.isNaN(value)) return 'NaN';
  if (Object.is(value, -0)) return '-0';
  return Number.isFinite(value) ? value : String(value);
};
const spellExact = (value: unknown): string => JSON.stringify(value, exactNumber) ?? 'undefined';

/** How many leaf values — numbers, strings, booleans — a value holds, at any depth. */
function leavesIn(value: unknown): number {
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return 1;
  if (value === null || typeof value !== 'object') return 0;
  let n = 0;
  for (const v of Object.values(value)) n += leavesIn(v);
  return n;
}

/** How many methods an object of facts answers: its own function-valued properties and its prototype's. */
function methodsOf(facts: object): number {
  const own = Object.keys(facts).filter((k) => typeof Reflect.get(facts, k) === 'function');
  const proto = Object.getPrototypeOf(facts) as object | null;
  const inherited = proto === null || proto === Object.prototype ? [] : Object.getOwnPropertyNames(proto).filter((k) => k !== 'constructor' && typeof Reflect.get(proto, k) === 'function');
  return new Set([...own, ...inherited]).size;
}

/** How many numbers a value holds, at any depth. */
function numbersIn(value: unknown): number {
  if (typeof value === 'number') return 1;
  if (value === null || typeof value !== 'object') return 0;
  let n = 0;
  for (const v of Object.values(value)) n += numbersIn(v);
  return n;
}

/** What each family's answers are spelled as — the values a body reads, and nothing it does not. */
const ANSWER_SPELLING: Readonly<Record<string, (value: unknown) => unknown>> = {
  // The survey's record of which poser drew it is the one field that differs by design and that no body reads.
  survey: (v) => (typeof v === 'object' && v !== null ? { ...(v as Record<string, unknown>), source: '(the poser that drew it)' } : v),
  posedTint: (v) => {
    if (typeof v !== 'object' || v === null) return v;
    const t = v as { light: { r: number; g: number; b: number; a: number }; dark: { r: number; g: number; b: number } | null };
    return { light: [t.light.r, t.light.g, t.light.b, t.light.a], dark: t.dark === null ? null : [t.dark.r, t.dark.g, t.dark.b] };
  },
  loadedDark: (v) => (typeof v === 'object' && v !== null ? [(v as { r: number }).r, (v as { g: number }).g, (v as { b: number }).b] : v),
  animations: (v) => (Array.isArray(v) ? (v as Array<{ name: string; duration: number; timelineDurations: readonly number[] }>).map((a) => [a.name, a.duration, [...a.timelineDurations].sort((x, y) => x - y)]) : v),
};
const answerOf = (name: string, value: unknown): unknown => (ANSWER_SPELLING[name] ?? ((v: unknown) => v))(value);

/** The verdict hooks a body is handed when only its questions matter: a fresh set per body, so no stats line carries over. */
const silentVerdicts = (): Verdicts => ({ fail: () => {}, skip: () => {}, stats: {} });

/** One family to ask both sides: spine-core's facts, the model side's (supplied on demand), the values compared whole, and the body that asks the rest. */
interface AskedFamily {
  family: FactFamily;
  spine: object;
  model: () => object;
  whole: string[];
  ask: (facts: object) => void;
  /** How this build's answers to a method are spelled where the family's own reading differs from `answerOf`'s (cut 4c-5a: the stepped poses' HISTORY bones). */
  spelling?: Readonly<Record<string, (value: unknown) => unknown>>;
}

/**
 * The comparison every family is put through (`compareFactFamilies`, issue #1054): each body
 * runs over spine-core's facts with every method call recorded, the model
 * side's supplier is asked the same question with the same arguments, and
 * every value read whole is compared whole, spelled exactly.
 */
function askFamilies(families: readonly AskedFamily[]): PosedFactTally[] {
  const out: PosedFactTally[] = [];
  for (const { family, spine, model: modelFacts, whole, ask, spelling } of families) {
    const spellAnswer = (name: string, value: unknown): unknown => (spelling?.[name] ?? ((v: unknown) => answerOf(name, v)))(value);
    const tally: PosedFactTally = { family, questions: 0, methods: methodsOf(spine), leaves: 0, values: 0, equal: 0, refused: [], differing: [] };
    out.push(tally);
    const asked: Array<{ name: string; args: unknown[]; answer: unknown }> = [];
    // The body over spine-core's facts, every method call recorded with its answer.
    const recording = new Proxy(spine, {
      get(target, prop, receiver) {
        const value: unknown = Reflect.get(target, prop, receiver);
        if (typeof value !== 'function') return value;
        return (...args: unknown[]): unknown => {
          const answer: unknown = Reflect.apply(value, target, args);
          asked.push({ name: String(prop), args, answer });
          return answer;
        };
      },
    });
    ask(recording);
    let facts: object;
    try {
      facts = modelFacts();
    } catch (err) {
      if (!(err instanceof CoreInputError)) throw err;
      tally.questions++;
      tally.refused.push({ question: '(the supplier)', why: err.message });
      continue;
    }
    const compare = (question: string, name: string, spineAnswer: unknown, answer: () => unknown): void => {
      tally.questions++;
      const a = spellAnswer(name, spineAnswer);
      tally.values += numbersIn(a);
      tally.leaves = (tally.leaves ?? 0) + leavesIn(a);
      let b: unknown;
      try {
        b = spellAnswer(name, answer());
      } catch (err) {
        if (!(err instanceof CoreInputError)) throw err;
        tally.refused.push({ question, why: err.message });
        return;
      }
      const sa = spellExact(a);
      const sb = spellExact(b);
      if (sa === sb) tally.equal++;
      else tally.differing.push({ question, spine: sa, model: sb });
    };
    for (const name of whole) compare(name, name, Reflect.get(spine, name), () => Reflect.get(facts, name));
    tally.calls = asked.length;
    for (const { name, args, answer } of asked) {
      compare(`${name}(${spellExact(args).slice(1, -1)})`, name, answer, () => {
        const method: unknown = Reflect.get(facts, name);
        if (typeof method !== 'function') throw new Error(`internal: the model side's ${family} facts have no ${name}`);
        return Reflect.apply(method, facts, args);
      });
    }
  }
  return out;
}

/**
 * The one walk (issue #1054): every fact family the moved bodies read, over one
 * build, put through `askFamilies` — cut 4c-1's and 4c-2's families read whole
 * (one question each, the family's spelling), cut 4c-3's, 4c-5's and 4c-5a's
 * question by question as each body asks. Before this the seven cuts compared
 * their families five ways — two spellings compared as strings, three walks
 * through `askFamilies` — each with its own floor; now every family is asked
 * the same way, and one floor (the selftest's `VF09`) reads every family's
 * tally. `cuts` narrows the walk to the cuts a caller reads; `supply` plants a
 * model supplier on every family that reads it.
 *
 * - **Cut 4c-1** (`factSpellings`): the region paths, the bones an animation
 *   keys, the skin members, the region joins, the atlas, the stage, and cut
 *   4c-4's slot timelines, roster, bone timelines and event keys.
 * - **Cut 4c-2** (`rigFactsSpelling`, tools/rig_facts.ts): the meshes — every
 *   mesh rule's, A13, A14, A15 and A22 included since #1054 — the polygons,
 *   the links, the constraints and their timelines.
 * - **Cut 4c-3**: each body runs over spine-core's facts as `validate()` hands
 *   them, with every call it makes recorded — a survey, a posed tint, a posed
 *   frame, a loaded dark colour — and the model side's supplier is asked the
 *   same question with the same arguments; the durations, the stated darks,
 *   the slot and sequence timelines are compared whole. `declared` is what the
 *   runtime's bodies are handed (A39 reads the rig info, A09 the durations).
 * - **Cut 4c-5**: A40's body over spine-core's sliders, every timeline's
 *   additive behaviour asked of the core's (`src/core/additive.ts`); A34's over
 *   the raw JSON's constraint groups, every unnamed physics reach asked.
 * - **Cut 4c-5a**: A10's body over spine-core's stepped poses, every pose asked
 *   of the core's looping walk (`src/core/walk.ts`), a HISTORY bone (issue
 *   #979, `walkHistory`) spelled by name and compared with nothing.
 *
 * Answers are spelled exactly (`spellExact`), so two numbers one ulp apart
 * differ, and a NaN where the other side has an Infinity. A model-side answer
 * the core refuses by name (`CoreInputError`) is counted as refused with its
 * sentence, never as an answer. `null` where spine-core refuses the pair or the
 * reader refuses the document.
 */
export function compareFactFamilies(
  skeletonText: string,
  atlasText: string,
  modelText: string,
  declared: { rig?: RigInfo; declaredDurations?: Record<string, number> },
  supply: Partial<ModelSupply> = {},
  cuts: readonly FactCut[] = FACT_CUTS,
): FamilyTally[] | null {
  let read: ReadDocument;
  try {
    read = { doc: readModel(modelText), json: JSON.parse(modelText) as Record<string, unknown> };
  } catch {
    return null;
  }
  const model: ModelSupply = { ...MODEL_SUPPLY, ...supply };
  const asked: Array<{ cut: FactCut; family: AskedFamily }> = [];
  /** A family read whole: its spelling parsed back, so its numbers and leaves are counted, one question per build. */
  const whole = (cut: FactCut, family: FactFamily, spine: string, modelSpelling: () => string): void =>
    void asked.push({ cut, family: { family, spine: { reading: JSON.parse(spine) as unknown }, model: () => ({ reading: JSON.parse(modelSpelling()) as unknown }), whole: ['reading'], ask: () => {} } });
  if (cuts.includes('4c-1')) {
    const runtime = runtimeFacts(skeletonText, atlasText, modelText);
    if (runtime === null) return null;
    const animations = askedAnimations(modelText);
    const spine = factSpellings(runtime, animations);
    let spelled: Record<string, string> | null = null;
    const modelSpelling = (): Record<string, string> => (spelled ??= factSpellings(modelFactSet(modelText, modelGivenOf(modelText, skeletonText, atlasText), model), animations));
    for (const family of CUT_4C1_FAMILIES) whole('4c-1', family, spine[family], () => modelSpelling()[family]);
  }
  if (cuts.includes('4c-2')) {
    const runtime = spineRigFacts(skeletonText, atlasText);
    if (runtime === null) return null;
    const spine = rigFactsSpelling(runtime);
    let spelled: Record<RigFactFamily, string> | null = null;
    const modelSpelling = (): Record<RigFactFamily, string> => (spelled ??= rigFactsSpelling({ meshes: model.meshes(read), polygons: model.polygons(read), links: model.links(read), constraints: model.constraints(read) }));
    for (const family of RIG_FACT_FAMILIES) whole('4c-2', family, spine[family], () => modelSpelling()[family]);
  }
  if (cuts.includes('4c-3') || cuts.includes('4c-5a')) {
    const runtime = runtimePosedFacts(skeletonText, atlasText);
    if (runtime === null) return null;
    if (cuts.includes('4c-3')) {
      const { rig, declaredDurations } = declared;
      asked.push(
        { cut: '4c-3', family: { family: 'deform survey', spine: runtime.deformSurvey, model: () => model.deformSurvey(read), whole: [], ask: (f) => a39DeformKeepsTriangleWinding(silentVerdicts(), f as DeformSurveyFacts, rig) } },
        { cut: '4c-3', family: { family: 'animation durations', spine: runtime.animationDurations, model: () => model.animationDurations(read), whole: ['animations'], ask: (f) => a09AnimationDurationMatchesSpec(silentVerdicts(), f as AnimationDurationFacts, declaredDurations) } },
        { cut: '4c-3', family: { family: 'two-colour tint', spine: runtime.twoColour, model: () => model.twoColour(read), whole: ['slotDarks', 'slotTimelines'], ask: (f) => a43TwoColorTintLoadsAndPosesAsWritten(silentVerdicts(), f as TwoColourFacts) } },
        { cut: '4c-3', family: { family: 'sequences', spine: runtime.sequences, model: () => model.sequences(read), whole: ['entries', 'timelines'], ask: (f) => a46SequenceAttachmentsShowTheFrameTheFileStates(silentVerdicts(), f as SequenceFacts) } },
      );
    }
    if (cuts.includes('4c-5a')) {
      const timelines: BoneTimelineFacts = runtime.boneTimelines;
      // A bone the view leaves inactive that a constraint writes into holds the runtime's previous step (HISTORY, issue #979;
      // `walkHistory` in src/core/walk.ts): its numbers, and its slots' vertices, are spelled by name and compared with nothing.
      let history: ReturnType<typeof walkHistory> = { bones: new Map(), slots: new Map() };
      try {
        history = walkHistory(noSkinView(read.doc));
      } catch (err) {
        if (!(err instanceof CoreInputError)) throw err;
      }
      const frame = (f: SteppedFrame): unknown => ({
        ...f,
        bones: f.bones.map((b) => (history.bones.has(b.name) ? { name: b.name, inherit: b.inherit, history: history.bones.get(b.name) } : b)),
        drawn: f.drawn.map((d) => (history.slots.has(d.slot) ? { slot: d.slot, attachment: d.attachment, history: history.bones.get(history.slots.get(d.slot) ?? '') } : d)),
      });
      const spelling = history.bones.size === 0 ? undefined : { setup: (v: unknown) => frame(v as SteppedFrame), walk: (v: unknown) => (v as SteppedFrame[]).map(frame) };
      asked.push({ cut: '4c-5a', family: { family: 'stepped poses', spine: runtime.steppedPoses, model: () => model.steppedPoses(read), whole: ['boneCount', 'steppedAnimations'], ask: (f) => a10NoNanAfterStepping(silentVerdicts(), timelines, f as SteppedPoseFacts), ...(spelling === undefined ? {} : { spelling }) } });
    }
  }
  if (cuts.includes('4c-5')) {
    const runtime = runtimeCut4c5Facts(skeletonText, atlasText);
    if (runtime === null) return null;
    asked.push(
      { cut: '4c-5', family: { family: 'slider composition', spine: runtime.sliderComposition, model: () => model.sliderComposition(read), whole: ['sliders'], ask: (f) => a40SlidersComposeOnASharedTarget(silentVerdicts(), f as SliderCompositionFacts, runtime.constraints) } },
      { cut: '4c-5', family: { family: 'constraint targets', spine: runtime.constraintTargets, model: () => model.constraintTargets(read), whole: ['constraints', 'groupsByAnimation'], ask: (f) => a34ConstraintTimelineTargets(silentVerdicts(), f as ConstraintTargetFacts) } },
    );
  }
  // The walk's own order: the cuts as FACT_CUTS lists them, whatever order the runtime's facts were loaded in.
  const ordered = FACT_CUTS.flatMap((cut) => asked.filter((a) => a.cut === cut));
  const tallies = askFamilies(ordered.map((a) => a.family));
  return tallies.map((t, i) => ({ ...t, cut: ordered[i].cut }));
}

/** Cut 4c-3's part of the one walk (`compareFactFamilies`). `supply` plants a model supplier (`VF12`). */
export function comparePosedFacts(skeletonText: string, atlasText: string, modelText: string, rig: RigInfo | undefined, declaredDurations: Record<string, number> | undefined, supply: Partial<ModelSupply> = {}): FamilyTally[] | null {
  return compareFactFamilies(skeletonText, atlasText, modelText, { rig, declaredDurations }, supply, ['4c-3']);
}

/** Cut 4c-5's part of the one walk (`compareFactFamilies`). `supply` plants a model supplier (`VF14`). */
export function compareCut4c5Facts(skeletonText: string, atlasText: string, modelText: string, supply: Partial<ModelSupply> = {}): FamilyTally[] | null {
  return compareFactFamilies(skeletonText, atlasText, modelText, {}, supply, ['4c-5']);
}

/** Cut 4c-5a's part of the one walk (`compareFactFamilies`). `supply` plants a model supplier (`VF13`). */
export function compareSteppedPoses(skeletonText: string, atlasText: string, modelText: string, supply: Partial<ModelSupply> = {}): FamilyTally[] | null {
  return compareFactFamilies(skeletonText, atlasText, modelText, {}, supply, ['4c-5a']);
}

/** Tallies of one family, summed across builds. */
export function sumPosedTallies<T extends PosedFactTally>(into: Map<string, T>, more: readonly T[]): void {
  for (const t of more) {
    const held: T = into.get(t.family) ?? { ...t, questions: 0, calls: 0, leaves: 0, values: 0, equal: 0, refused: [], differing: [] };
    held.questions += t.questions;
    held.calls = (held.calls ?? 0) + (t.calls ?? 0);
    held.methods = Math.max(held.methods ?? 0, t.methods ?? 0);
    held.leaves = (held.leaves ?? 0) + (t.leaves ?? 0);
    held.values += t.values;
    held.equal += t.equal;
    held.refused.push(...t.refused);
    held.differing.push(...t.differing);
    into.set(t.family, held);
  }
}

/**
 * A row's facts, off the one walk (`compareFactFamilies`, issue #1054): every
 * family asked once, then read back per cut into the fields the row has always
 * printed — cut 4c-1's families one line each, cut 4c-2's as one line with the
 * derivations beside it (`rigFactsDerivationsOf`), and the question families'
 * tallies per cut.
 */
function walkedFacts(skeletonText: string, atlasText: string, modelText: string, rig: RigInfo | undefined, declaredDurations: Record<string, number> | undefined): Pick<VerdictRow, 'facts' | 'rigFacts' | 'posedFacts' | 'cut4c5Facts' | 'steppedFacts'> {
  const walked = compareFactFamilies(skeletonText, atlasText, modelText, { rig, declaredDurations });
  if (walked === null) return { facts: [], rigFacts: null, posedFacts: null, cut4c5Facts: null, steppedFacts: null };
  const of = (cut: FactCut): FamilyTally[] => walked.filter((t) => t.cut === cut);
  const derivations = rigFactsDerivationsOf(skeletonText, atlasText, modelText);
  return {
    facts: of('4c-1').map(wholeFamilyReading),
    rigFacts: derivations === null ? null : { differing: of('4c-2').map(wholeFamilyReading).filter((r) => !r.identical), derivations },
    posedFacts: of('4c-3'),
    cut4c5Facts: of('4c-5'),
    steppedFacts: of('4c-5a'),
  };
}

/** One built output directory, gated both ways. */
export function verdictRow(name: string, outDir: string): VerdictRow {
  const files = ['skeleton.json', 'skeleton.atlas', MODEL_DOCUMENT_FILE].map((f) => join(outDir, f));
  const missing = files.filter((f) => !existsSync(f));
  if (missing.length > 0) return { name, refused: `the build wrote no ${missing.map((f) => f.slice(outDir.length + 1)).join(', ')}`, cells: [], walk: null };
  const [skeletonText, atlasText, modelText] = files.map((f) => readFileSync(f, 'utf8'));
  const atlasDir = spelledDir(outDir);
  const cells: VerdictCell[] = [];
  const rig = documentRig(modelText);
  const declaredDurations = documentDurations(modelText);
  const inputs = { ...(rig === undefined ? {} : { rig }), ...(declaredDurations === undefined ? {} : { declaredDurations }) };
  for (const profile of VERDICT_PROFILES) {
    // The document beside the pair is handed over as `build` hands it: since issue #907 it is where A14 and A19 read a rigc build's stage.
    const spine = validate({ skeletonText, atlasText, atlasDir, profile, modelText, ...inputs });
    // The model side reads the rig info and the durations off the document itself, and refuses either given beside it (issue #1054).
    const modelInput: ModelValidateInput = { modelText, atlasDir, profile, given: modelGivenOf(modelText, skeletonText, atlasText) };
    const model = validateModel(modelInput);
    const spineParse = spine.failures.find((f) => f.assertion === 'A00_ROUNDTRIP_PARSE');
    const modelParse = model.failures.find((f) => f.assertion === A00_MODEL_READ || f.assertion === A00_MODEL_REGIONS_ON_PAGES);
    if (spineParse !== undefined && modelParse !== undefined) {
      return { name, refused: `both parses refused it — spine-core: ${spineParse.detail}; model: ${modelParse.assertion}: ${modelParse.detail}`, cells: [], walk: null };
    }
    if (spineParse !== undefined || modelParse !== undefined) {
      // One side read what the other refused: that is a difference, never a refusal to compare.
      const spineSaid = spineParse === undefined ? ['(read)'] : [`  FAIL  A00_ROUNDTRIP_PARSE: ${spineParse.detail}`];
      const modelSaid = modelParse === undefined ? ['(read)'] : [`  FAIL  ${modelParse.assertion}: ${modelParse.detail}`];
      cells.push({ code: 'the parse', profile, spine: spineSaid, model: modelSaid, identical: false });
      continue;
    }
    for (const { code } of MOVED_ASSERTIONS) {
      const a = codeLines(spine, code);
      const b = codeLines(model, code);
      const identical = a.join('\n') === b.join('\n');
      const refused = identical ? null : coreRefusalOf(code, b, modelText, modelInput);
      cells.push({ code, profile, spine: a, model: b, identical, ...(refused === null ? {} : { refused }) });
    }
  }
  // One side refused the parse: the cells above hold that as a difference, and there is no pair of walks to read.
  if (cells.some((c) => c.code === 'the parse')) return { name, refused: null, cells, walk: null };
  const runtime = runtimeFacts(skeletonText, atlasText);
  if (runtime === null) throw new Error(`internal: ${name}: spine-core refused a pair the gate's own round trip loaded`);
  const spineWalk = walkSpelling(runtime.skinEntries);
  const modelWalk = walkSpelling(modelSkinEntries({ doc: readModel(modelText), json: JSON.parse(modelText) as Record<string, unknown> }));
  return {
    name,
    refused: null,
    cells,
    walk: { spine: spineWalk, model: modelWalk, identical: spineWalk === modelWalk },
    ...walkedFacts(skeletonText, atlasText, modelText, rig, declaredDurations),
  };
}

/** Built rows gated, in name order; a row whose chain exited non-zero is refused by that. */
export function verdictRows(built: readonly BuiltRow[]): VerdictRow[] {
  return built.map((r) => (r.exits.some((e) => e !== 0) ? { name: r.name, refused: `the build chain exited ${JSON.stringify(r.exits)}`, cells: [], walk: null } : verdictRow(r.name, r.out)));
}

/** Every row's lines, then the verdict line; `ok` is the exit-0 reading, `empty` the exit-2 one. */
export function verdictLines(rows: readonly VerdictRow[]): { lines: string[]; ok: boolean; empty: boolean; refusedByCore: number } {
  const lines: string[] = [];
  let cells = 0;
  let differing = 0;
  /** Line sets the core refused by name in a documented class, by class (`coreRefusalOf`). */
  const refusedByCore = new Map<string, number>();
  let walks = 0;
  let walksDiffering = 0;
  let facts = 0;
  let factsDiffering = 0;
  let factRows = 0;
  let factRowsDiffering = 0;
  const derivations = new Map<string, DerivationTally>();
  const posed = new Map<string, PosedFactTally>();
  let posedRows = 0;
  let posedRowsDiffering = 0;
  let cut4c5Rows = 0;
  let cut4c5RowsDiffering = 0;
  let steppedRows = 0;
  let steppedRowsDiffering = 0;
  for (const row of rows) {
    if (row.refused !== null) {
      lines.push(`  REFUSED    ${row.name} — ${row.refused}`);
      continue;
    }
    for (const cell of row.cells) {
      cells++;
      if (cell.identical) lines.push(`  IDENTICAL  ${row.name}  ${cell.code} [${cell.profile}]  ${cell.spine.length} line(s)`);
      else if (cell.refused !== undefined) {
        refusedByCore.set(cell.refused.route, (refusedByCore.get(cell.refused.route) ?? 0) + 1);
        lines.push(`  REFUSED    ${row.name}  ${cell.code} [${cell.profile}] — the core refused it by name, ${cell.refused.route}: ${cell.refused.why.slice(0, 300)}`);
        lines.push(`               spine-core: ${JSON.stringify(cell.spine)}`);
      } else {
        differing++;
        lines.push(`  DIFFERING  ${row.name}  ${cell.code} [${cell.profile}]`);
        lines.push(`               spine-core: ${JSON.stringify(cell.spine)}`);
        lines.push(`               model:      ${JSON.stringify(cell.model)}`);
      }
    }
    if (row.walk !== null) {
      walks++;
      if (row.walk.identical) lines.push(`  IDENTICAL  ${row.name}  the skins' walk`);
      else {
        walksDiffering++;
        lines.push(`  DIFFERING  ${row.name}  the skins' walk`);
        lines.push(`               spine-core: ${row.walk.spine.slice(0, 400)}`);
        lines.push(`               model:      ${row.walk.model.slice(0, 400)}`);
      }
    }
    for (const fact of row.facts ?? []) {
      facts++;
      if (fact.identical) lines.push(`  IDENTICAL  ${row.name}  the facts: ${fact.family}`);
      else {
        factsDiffering++;
        lines.push(`  DIFFERING  ${row.name}  the facts: ${fact.family}`);
        lines.push(`               spine-core: ${fact.spine.slice(0, 400)}`);
        lines.push(`               model:      ${fact.model.slice(0, 400)}`);
      }
    }
    if (row.rigFacts !== undefined && row.rigFacts !== null) {
      factRows++;
      sumTallies(derivations, row.rigFacts.derivations);
      if (row.rigFacts.differing.length === 0) lines.push(`  IDENTICAL  ${row.name}  cut 4c-2's facts`);
      else {
        factRowsDiffering++;
        for (const d of row.rigFacts.differing) {
          lines.push(`  DIFFERING  ${row.name}  cut 4c-2's facts: ${d.family}`);
          lines.push(`               spine-core: ${d.spine.slice(0, 400)}`);
          lines.push(`               model:      ${d.model.slice(0, 400)}`);
        }
      }
    }
    if (row.posedFacts !== undefined && row.posedFacts !== null) {
      posedRows++;
      sumPosedTallies(posed, row.posedFacts);
      const differing = row.posedFacts.filter((t) => t.differing.length > 0);
      if (differing.length === 0) lines.push(`  IDENTICAL  ${row.name}  cut 4c-3's facts: ${row.posedFacts.map((t) => `${t.family} ${t.equal}/${t.questions}`).join(', ')}`);
      else {
        posedRowsDiffering++;
        for (const t of differing) {
          const d = t.differing[0];
          lines.push(`  DIFFERING  ${row.name}  cut 4c-3's facts: ${t.family}: ${t.differing.length} question(s), the first ${d.question.slice(0, 200)}`);
          lines.push(`               spine-core: ${d.spine.slice(0, 400)}`);
          lines.push(`               model:      ${d.model.slice(0, 400)}`);
        }
      }
      for (const t of row.posedFacts) for (const r of t.refused) lines.push(`  REFUSED    ${row.name}  cut 4c-3's facts: ${t.family}: ${r.question.slice(0, 200)} — the core: ${r.why.slice(0, 300)}`);
    }
    if (row.cut4c5Facts !== undefined && row.cut4c5Facts !== null) {
      cut4c5Rows++;
      sumPosedTallies(posed, row.cut4c5Facts);
      const differing = row.cut4c5Facts.filter((t) => t.differing.length > 0);
      if (differing.length === 0) lines.push(`  IDENTICAL  ${row.name}  cut 4c-5's facts: ${row.cut4c5Facts.map((t) => `${t.family} ${t.equal}/${t.questions}`).join(', ')}`);
      else {
        cut4c5RowsDiffering++;
        for (const t of differing) {
          const d = t.differing[0];
          lines.push(`  DIFFERING  ${row.name}  cut 4c-5's facts: ${t.family}: ${t.differing.length} question(s), the first ${d.question.slice(0, 200)}`);
          lines.push(`               spine-core: ${d.spine.slice(0, 400)}`);
          lines.push(`               model:      ${d.model.slice(0, 400)}`);
        }
      }
      for (const t of row.cut4c5Facts) for (const r of t.refused) lines.push(`  REFUSED    ${row.name}  cut 4c-5's facts: ${t.family}: ${r.question.slice(0, 200)} — the core: ${r.why.slice(0, 300)}`);
    }
    if (row.steppedFacts !== undefined && row.steppedFacts !== null) {
      steppedRows++;
      sumPosedTallies(posed, row.steppedFacts);
      const differing = row.steppedFacts.filter((t) => t.differing.length > 0);
      if (differing.length === 0) lines.push(`  IDENTICAL  ${row.name}  cut 4c-5a's facts: ${row.steppedFacts.map((t) => `${t.family} ${t.equal}/${t.questions}`).join(', ')}`);
      else {
        steppedRowsDiffering++;
        for (const t of differing) {
          const d = t.differing[0];
          lines.push(`  DIFFERING  ${row.name}  cut 4c-5a's facts: ${t.family}: ${t.differing.length} question(s), the first ${d.question.slice(0, 200)}`);
          lines.push(`               spine-core: ${d.spine.slice(0, 400)}`);
          lines.push(`               model:      ${d.model.slice(0, 400)}`);
        }
      }
      for (const t of row.steppedFacts) for (const r of t.refused) lines.push(`  REFUSED    ${row.name}  cut 4c-5a's facts: ${t.family}: ${r.question.slice(0, 200)} — the core: ${r.why.slice(0, 300)}`);
    }
  }
  const refused = rows.filter((r) => r.refused !== null).length;
  const empty = cells === 0;
  const refusedCells = [...refusedByCore.values()].reduce((x, y) => x + y, 0);
  const ok = !empty && differing === 0 && walksDiffering === 0 && factsDiffering === 0 && factRowsDiffering === 0 && posedRowsDiffering === 0 && cut4c5RowsDiffering === 0 && steppedRowsDiffering === 0;
  for (const row of derivations.values()) {
    lines.push(`  DERIVED    ${row.derivation} — ${row.equal} of ${row.values} equal the runtime's${row.statedAlone === null ? '' : `, the stated number alone ${row.statedAlone}`}`);
  }
  for (const t of posed.values()) {
    lines.push(`  POSED      ${t.family} — ${t.equal} of ${t.questions} question(s) answered alike, ${t.values} number(s) in spine-core's answers, ${t.refused.length} refused by the core by name, ${t.differing.length} differing`);
  }
  lines.push(
    `${empty ? 'NOTHING COMPARED' : !ok ? 'DIFFERING' : refusedCells > 0 ? 'IDENTICAL BUT FOR REFUSALS BY NAME' : 'IDENTICAL'} — ${rows.length} recipe(s), ${refused} refused; ` +
      `${cells} line set(s) compared (${MOVED_ASSERTIONS.length} moved assertion(s) × ${VERDICT_PROFILES.length} profile(s)), ${cells - differing - refusedCells} identical, ${differing} differing` +
      `${refusedCells > 0 ? `, ${refusedCells} refused by the core by name (${[...refusedByCore].map(([route, n]) => `${n} × ${route}`).join('; ')})` : ''}; ` +
      `${walks} skins' walk(s) compared, ${walks - walksDiffering} identical, ${walksDiffering} differing; ` +
      `${facts} fact family reading(s) compared, ${facts - factsDiffering} identical, ${factsDiffering} differing; ` +
      `${factRows} build(s)' cut 4c-2 facts compared, ${factRows - factRowsDiffering} identical, ${factRowsDiffering} differing; ` +
      `${posedRows} build(s)' cut 4c-3 facts compared, ${posedRows - posedRowsDiffering} identical, ${posedRowsDiffering} differing; ` +
      `${cut4c5Rows} build(s)' cut 4c-5 facts compared, ${cut4c5Rows - cut4c5RowsDiffering} identical, ${cut4c5RowsDiffering} differing; ` +
      `${steppedRows} build(s)' cut 4c-5a facts compared, ${steppedRows - steppedRowsDiffering} identical, ${steppedRowsDiffering} differing`,
  );
  return { lines, ok, empty, refusedByCore: refusedCells };
}

function parseFlags(args: readonly string[], known: readonly string[]): Map<string, string> {
  const flags = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!known.includes(arg)) throw new VerdictInputError(`unknown argument ${arg}; this command takes ${known.join(', ')}`);
    const value = args[i + 1];
    if (value === undefined || value.startsWith('--')) throw new VerdictInputError(`${arg} needs a value`);
    if (flags.has(arg)) throw new VerdictInputError(`${arg} given twice`);
    flags.set(arg, value);
    i++;
  }
  return flags;
}

/** The command; returns the exit code. */
export function verdictMain(argv: readonly string[], print: (line: string) => void = console.log, warn: (line: string) => void = console.error): number {
  const scope = new WorkDirectory('verdict_gate');
  try {
    const { argv: args, keep } = readKeepWork(argv, [], (m) => new VerdictInputError(m));
    const flags = parseFlags(args, ['--recipes', '--root', '--work']);
    const root = resolve(flags.get('--root') ?? TREE_ROOT);
    if (!existsSync(root) || !statSync(root).isDirectory()) throw new VerdictInputError(`--root ${root} is not a directory`);
    const named = flags.get('--recipes');
    const recipes: Recipe[] = named === undefined ? treeRecipes(root, warn) : readRecipes(named);
    if (recipes.length === 0) throw new VerdictInputError('no recipes to run');
    const workFlag = flags.get('--work');
    const work = scope.open(workFlag, keep, 'rigc-verdict-gate-', (m) => new VerdictInputError(m));
    warn(`verdict_gate: ${recipes.length} recipe(s), work directory ${work}`);
    const verdict = verdictLines(verdictRows(buildRecipes(recipes, work, root, warn)));
    for (const line of verdict.lines) print(line);
    return verdict.empty ? 2 : !verdict.ok ? 1 : verdict.refusedByCore > 0 ? 3 : 0;
  } catch (err) {
    if (err instanceof VerdictInputError || err instanceof HashesInputError) {
      warn(`verdict_gate: ${err.message}`);
      return 2;
    }
    throw err;
  } finally {
    scope.close(warn);
  }
}

if (import.meta.main) process.exit(verdictMain(process.argv.slice(2)));
