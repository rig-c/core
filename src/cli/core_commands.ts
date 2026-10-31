import { textureScaleReading, textureScaleLines, TEXTURE_SCALE_FPS } from '../texture_scale.ts';
import { extremesOf, extremesText, extremesPlate, extremesLine, extremesRefusal } from '../extremes.ts';
/**
 * The bodies of the commands that reach nothing of spine-core — `explain`,
 * `ingest`, `diff`, `check`, `render`, `inspect`, `pose`, `chainfit` and `skills` —
 * moved here unchanged from `cli.ts` (issue #1052, step 4e of #380), with the
 * helpers only they call. Both entries register them (`CORE_COMMAND_RUNS`):
 * `cli.ts` beside the runtime's, `cli_core.ts` alone. And the body
 * `cli_core.ts` runs as `build` (`CORE_ENTRY_RUNS`, issue #1060): `runBuild`
 * with a gate that links none of the runtime.
 *
 * Which commands these are is not a list kept here: it is `COMMANDS`'s
 * `runtime` field (`./shared.ts`), which `RC26` in `selftest.ts` holds to the
 * import graph of this module. A body here that reaches the runtime turns it
 * red naming the chain, and `cli_core.ts` would stop linking with the package
 * absent, which `RC24` runs.
 */
import { parseAtlasText } from '../atlas.ts';
import { validateEmittedText } from '../assertions/emitted/index.ts';
import { validateModel } from '../assertions/model/index.ts';
import { reportLines } from '../assertions/report.ts';
import { chainFitLines, type ChainFitOptions, estimateChainFit } from '../chainfit.ts';
import { checkLines, CheckPlates } from '../check.ts';
import { writeCheckPictures } from '../checkpics.ts';
import { compile, type CompileOptions, droppedStateReason, relativeImagesPath } from '../compile.ts';
import { CoreInputError, readModel } from '../core/index.ts';
import { leverFractionWhy, leverHeader, leverLines, leverReading, type LeverReading, type WhirlAnimation, WHIRL_HEADER, whirlLines, whirlReading } from '../whirl.ts';
import { surveyOfBuild } from '../deformbuild.ts';
import type { DeformSurvey } from '../deformsurvey.ts';
import { deformReportBlock } from '../deformreport.ts';
import { type DiffAnimationPair, diffLines, diffSkeletons } from '../diff.ts';
import { findingLine, ingest, type IngestFinding, IngestSpecRefused, type IngestStage } from '../ingest.ts';
import { PARSER_DEFAULTS, parserReading } from '../keyorder.ts';
import { MODEL_DOCUMENT_FILE, modelDocument } from '../model.ts';
import { parseMotionSpec } from '../motion.ts';
import { splitMesh, SplitError } from '../meshsplit.ts';
import { parseRigSpec } from '../rig.ts';
import { type InspectCompare, type InspectFrame, InspectError, inspectCandidate, INSPECT_DEFAULT_FPS, legendText, readBonePatterns, readShow, readTimes, readZoom } from '../inspect.ts';
import { FOLDS_FILE, foldLine, foldsFileOf, foldsOf, foldsText, setupFaultLine } from '../folds.ts';
import { AngleRangeError, angleRangeLine, type AngleRangeReading, angleRangesOf, type BonePair, readBonePairs } from '../anglerange.ts';
import { outsideLine, outsideViewport, pinnedRecord, readViewportBox, viewportOfFramesFile, ViewportError } from '../viewportpin.ts';
import { PASS_THROUGH_FILE, passFrameLine, type PassPair, passSummaryLine, passThroughFileOf, passThroughOf, passThroughText, PassThroughError, readPassPairs } from '../passthrough.ts';
import type { Plate } from '../../tools/plate.ts';
import { OVERLAPS_FILE, OverlapError, overlapLine, overlapPlate, overlapsFileOf, overlapsOf, overlapsPlateFile, overlapsText, plateParticipants, staticLine } from '../overlaps.ts';
import { buildSheetSet, SHEET_MANIFEST_FILE, type SheetSetPack, SheetUsageError, sheetRigNameOf, sheetSidecarRecord, sheetSourceOf } from '../sheet.ts';
import { readSeamPairs, SEAM_FILE, seamFileOf, seamLine, SeamError, type SeamPair, seamsOf, seamText } from '../seam.ts';
import { environmentCollisions, environmentFrame, EnvironmentError, environmentResponse, readEnvironmentSchedule, type EnvironmentStep } from '../environment.ts';
import { estimatePose, poseLines, type PoseOptions } from '../pose.ts';
import { BACKGROUND, contactSheet, type Frame, FRAMES_SIDECAR, FRAMES_SPEC, frameSetDir, type FrameSet, type FramesSidecar, framingViewport, GEOMETRY_FILE, geometryFileOf, geometryText, loadCandidate, POSER_NAMES, type PoserName, PROTOCOL_FPS, refuseUnchosen, renderFrame, sampleAll, sampleAnimation, sampleSetupPose, SETUP_POSE_DIR, SHEET_FILE, SHEET_TILE, sidecarViewport, type SkeletonFacts, type SlotSubset, SlotSubsetError, throughPoser, type Viewport, viewportFor } from '../render_shared.ts';
import { type CompileResult } from '../types.ts';
import { attachmentRegionJoins } from '../region_joins.ts';
import { cmdRepack } from './repack.ts';
import { writeWhole } from './write_whole.ts';
import { GUIDE_FILE, GUIDE_RULE_TABLES_ELSEWHERE, guideAnswer, refusalLine } from '../guide.ts';
import { ATLAS_ABSENT, COMMANDS, type CommandRun, DelegateError, modelTextBeside, resolveBuild, type BuildGate, runBuild, PACKAGE_ROOT, DEFAULT_CHAINFIT_OUT, DEFAULT_POSE_OUT, DEFAULT_SKILLS_DIR, ExplainError, GuideError, printAlphaClips, meshBudget, meshDepthNote, meshFit, meshInfluenceNote, PAGE_GRID_UNLOCATED, readAnimationFlag, readJsonFile, readPageEdges, readPoserFlag, readSheetFormat, readSkeletonText, readVersion, resolveCut, resolveDrawable, runCheck, SkillsInstallError, STAGELESS_FRAMING, UsageError, writeJson, documentStageBeside } from './shared.ts';
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';


const MESH_KIND_NOTES: Record<CompileResult['meshes'][number]['kind'], string> = {
  ring: 'ring      rim ring pinned on the window edge, seam ring pinned on the mask contour, aperture moves',
  ribbon: 'ribbon    entry row pinned, rows share their weights so the strip lengthens without widening',
  contour: 'contour   the art\'s own silhouette, every vertex pinned to the slot bone (geometry, not a deformation)',
  grid: 'grid      a lattice over the part window at stated column and row positions, every vertex pinned to the slot bone',
  segments: 'segments  a lattice over the part\'s alpha, every vertex weighted by distance to the bone segments it names',
  authored: 'authored  geometry rigc did not build; it assumes nothing about the topology',
};

/**
 * The `MEMBER` report block — a group track's per-member values, side by side
 * (issue #295).
 *
 * ## Why side by side is the whole point
 *
 * The complaint that filed #295 was not the line count. `gallery/portrait`'s
 * held yaw put six sibling bones' `translatex` in six separate tracks, and the
 * reason that is bad is that **nobody can see a wrong sign in a column that is
 * eighty lines from its neighbours.** FACE §3 makes the same argument from the
 * other side: a residual is 1–6 units where a total is 30–40, and the split is
 * *an auditing decision before it is a rigging one*. So the report's job is to
 * put the numbers in the arrangement the audit needs — one row per member, one
 * block per key — which is exactly the arrangement the emitted format cannot
 * have, because Spine keys one bone per timeline.
 *
 * ## It quotes; it does not re-derive
 *
 * The same rule as the `DEFORM` block. Every value here is the one the compiler
 * **emitted**, carried on `result.trackDerivations`, so the block and the
 * artifact cannot disagree. `derived` and `formula` are the model's own strings
 * from `src/trackgen.ts`, so the block names the closed form the spec stated
 * rather than a second reading of it.
 *
 * ## What it deliberately does not print
 *
 * **Tracks whose members all share one value** — the ordinary `groups` entry.
 * There is one number there and the timelines above already show it on every
 * member; a table of six identical rows would be a tautology, and the block
 * exists to make a *difference* visible. `look_l`/`look_r` in the worked example
 * are exactly that case and they are right to be absent from here.
 *
 * **`stagger`.** A per-member time offset is printed as it always was — on each
 * member's own timeline, where the shifted key times are. Repeating it here
 * would put one lag in two places.
 */
function memberReportLines(result: CompileResult): string[] {
  if (result.trackDerivations.length === 0) return [];
  const out: string[] = [
    '',
    'group members  (the per-member values of one track, side by side — issue #295)',
    '  ..    a row per member and a block per key, because a wrong sign is visible in a column of six and',
    '  ..    invisible in six tracks. Values are the EMITTED ones, so this and the artifact cannot disagree',
    '  ..    a group whose members all share one value is not here: there is one number and the timelines',
    '  ..    above already carry it. `stagger` is not here either — the shifted key times are on those timelines',
  ];
  for (const entry of result.trackDerivations) {
    const states =
      entry.model === null
        ? 'stated per member'
        : `derive ${entry.model.kind}  ${entry.model.stated}  -> ${entry.model.projection === 'shift' ? 'the displacement' : 'the narrowing'}`;
    out.push(
      `  MEMBER  ${entry.animation}  ${entry.targetKind} "${entry.target}".${entry.property}  ` +
        `t=${entry.time.toFixed(6)}  ${entry.members.length} member(s)  ${states}`,
    );
    if (entry.model !== null) {
      out.push(`          ${entry.model.formula}`);
      for (const line of entry.model.derived) out.push(`            ${line}`);
    }
    const width = Math.max(6, ...entry.members.map((m) => m.member.length));
    for (let i = 0; i < entry.members.length; i++) {
      const m = entry.members[i];
      const value = Array.isArray(m.value) ? m.value.join(', ') : JSON.stringify(m.value);
      // The model's own row carries the two inputs that produced the value — the
      // coordinate it read off the rig and the depth the spec stated — because
      // "5.513" alone is a number a reader can only take on trust, and `−62` and
      // `150` beside it are a claim they can check.
      const from = entry.model === null ? '' : `  <- ${entry.model.members[i].at >= 0 ? ' ' : ''}${entry.model.members[i].at} at depth ${entry.model.members[i].depth}`;
      out.push(`            ${m.member.padEnd(width)}  ${value.padStart(12)}${from}`);
    }
  }
  return out;
}

/**
 * The `DEFORM` report block — what each deform key does to the geometry, per key
 * and then per animation (issue #316).
 *
 * ## Why this is a report and not an assertion
 *
 * Because a 3× stretch is a real thing to author, for the same reason issue #277
 * settled mesh coverage as a printed figure on authored geometry rather than a
 * bar. The one deformed-geometry fault that has no legitimate counter-example is
 * the fold, and that one already IS an assertion —
 * `A39_DEFORM_KEEPS_TRIANGLE_WINDING`. What this block adds is **the approach to
 * that wall**: FACE §4.2's table of ratios down to the fold at 31.37° was
 * measured by rendering seven variants of `gallery/portrait` and looking at them,
 * and `0.637` was a number an author derived from the closed form rather than one
 * the tool printed.
 *
 * ## It quotes; it does not re-derive
 *
 * - the reversal and collapse counts are the **survey's**, which is A39's own
 *   survey ([`src/deformmeasure.ts`](src/deformmeasure.ts)) — one measurement,
 *   two readers, so the block and the gate cannot disagree about a fold;
 * - 🔒 and so is **the frame each key was posed in** (issue #407), which every
 *   `DEFORM` line now names: `on a track`, or the slider that applies the
 *   animation and the dial value its own mapping had to be inverted to. The
 *   derivation moved and the report had to move with it — a block that went on
 *   printing the same figures under a changed meaning would be worse than the
 *   red it replaced;
 * - a key's model is the **compiler's** `transform` report (§4.11.1), so the
 *   block names the same `kind` and parameters the spec stated;
 * - the fold ANGLE is nowhere here. It is A39's, derived at run time from the
 *   grid, and a second copy of it printed beside a ratio would be a number that
 *   goes stale when somebody moves a column;
 * - and a key the gate read **no winding** off — because the slot draws no pixels
 *   of the mesh at that key's own time (issue #401) — says so on a `skipped` line
 *   with the survey's own sentence, and is kept out of the rollup's counts,
 *   because that line ends by claiming A39 reads the same two;
 * - the **spans** between the keys are the survey's too (issue #403). A `BETWEEN`
 *   line appears wherever the closed form found a fold at a time no key lands
 *   on, whether the gate refuses it or passes it over because nothing is drawn
 *   there — and a `spans` line says how many were scanned even when nothing was
 *   found, because a scan that ran and found nothing has to be distinguishable
 *   from a scan that never ran.
 *
 * ## And what it deliberately does not print
 *
 * **Deformed coverage**, which #296 asked for. The coverage figure is rasterised
 * from the attachment's **uvs** against the part's alpha, and a deform moves
 * positions and never uvs — so it is identical at every key by construction, and
 * a `coverage 100.00% (setup 100.00%)` line would be a tautology wearing a
 * measurement's clothes. The header line says so and points at `meshes`, because
 * an author who came here asking whether their deform broke the coverage
 * deserves the answer rather than a silence. What does move is the stretch.
 */
function deformReportLines(result: CompileResult, exempt: ReadonlySet<string>, poser: PoserName | undefined, label: string): string[] {
  // Read and posed through rigc's own core over the model document the build carries (issues #969, #1019) —
  // spine-core is not touched — and through spine-core under `--poser spine` or when the core refuses the
  // document, which the block then names; `tools/survey_hashes.ts` holds the two to one block. The block
  // itself is `deformReportBlock` (`src/deformreport.ts`), so a control renders it off either reader's survey.
  const input = { skeletonText: result.skeletonText, atlasText: result.atlasText, modelText: modelDocument(result.model, result.skeletonText, result.atlasText), label: `the deform survey of ${label}` };
  let survey: DeformSurvey;
  try {
    survey = surveyOfBuild(input, new Set(), poser === undefined ? 'auto' : poser === 'core' ? 'model' : 'spine-core');
  } catch (err) {
    // `--poser core` on a build the core refuses: a refusal of the invocation, as `render` and `check` give it.
    if (poser === 'core' && err instanceof CoreInputError) throw new ExplainError(`--poser core: the core refused to pose the deform survey's model document — ${err.message}`);
    throw err;
  }
  return deformReportBlock(survey, result.deformTransforms, exempt);
}

/**
 * The header the `scale` rows carry, because the figure beside them lies without
 * it.
 *
 * ⛔ Three things it has to say, and each one is a way the number is wrong if
 * taken at face value:
 *   - it is the key's OWN factor. A nonuniform parent shears its children, so
 *     the drawn area is not this product;
 *   - a key that moved only one axis has no product to state, and gets none
 *     rather than an invented 1 on the other;
 *   - a uniform scale has a product too, and it is a zoom rather than a squash.
 */
const SCALE_PRODUCT_NOTE =
  '..  x·y is the key\'s own local area factor: ~1.00 is the volume kept, and it is a READING, never a rule — ' +
  'a nonuniform parent shears this, and a uniform scale has a product without being a squash';

/**
 * `x·y` for a `scale` key that states both, and nothing otherwise.
 *
 * ⭐ Why it is here at all: `explain` ALREADY prints this reading for the other
 * spelling of squash and stretch. A `transform: affine` deform key reports
 * `area x1.020800`, which is exactly its own `0.88 × 1.16` — so the author who
 * reaches for the advanced spelling is told whether the volume held and the
 * author who reaches for the cheap one is not, while `docs/MOTION.md` §7 points
 * a first candidate at the cheap one on purpose. That asymmetry is the defect;
 * this is not a new kind of number (issue #377).
 *
 * 🔒 A reading and never an assertion. `deformReportLines` states the test a
 * geometric figure has to pass to become a gate — no legitimate counter-example
 * — and this fails it in quantity: a shadow, a zoom, a cartoon squash that
 * gains mass on purpose. Volume preservation is a style commitment no spec can
 * declare, so a bar here would be one consumer's house style failing correct
 * foreign data. There is no honest SKIP either: an absent declaration is not
 * "nothing to measure", it is "no way to know what was meant".
 */
/**
 * An emitted key as the 4.3 parser reads it: every field its kind's
 * `PARSER_DEFAULTS` row lists and the key leaves out, at the row's value, then
 * the key's own fields. The emitter leaves a field at its parser default out
 * (issue #716), so a report that reads the file needs the row to say what the
 * runtime reads there — and reads it from the one table the emitter used.
 */
function asParsed(kind: string, key: Record<string, unknown>): Record<string, unknown> {
  const row = PARSER_DEFAULTS[kind];
  if (row === undefined) return key;
  const site = { object: key, previous: () => null };
  const filled: Record<string, unknown> = {};
  for (const field of Object.keys(row)) {
    const value = parserReading(row, site, field);
    if (value !== undefined) filled[field] = value;
  }
  return { ...filled, ...key };
}

/** An emitted key's time as the parser reads it — `0` where the key leaves it out. */
function keyTimeOf(kind: string, key: Record<string, unknown>): unknown {
  return asParsed(kind, key).time;
}

function scaleProduct(timelineName: string, key: Record<string, unknown>): string {
  if (timelineName !== 'scale') return '';
  const x = key.x;
  const y = key.y;
  // Both axes, or nothing: a key that moved one axis has no area factor, and
  // defaulting the other to 1 would invent the very number being reported.
  if (typeof x !== 'number' || typeof y !== 'number') return '';
  return `  x·y=${(x * y).toFixed(4)}`;
}

/**
 * `--as <candidate>=<reference>`, one pair per occurrence.
 *
 * ⚠️ Spelled with a pair where `check --as <name>` takes one name, and the
 * difference is in what the two commands have on the other side. `check`
 * measures against a rendered frame SET, which already carries the reference
 * animation's name in its own directory, so one name closes the gap. `diff` has
 * two skeletons and either may have its own vocabulary, so one name says which
 * shot on which side and leaves the other unanswered. The direction — candidate
 * first — is the one `bonedist`'s correspondence file already writes its
 * `animations` map in.
 *
 * Every refusal here is a UsageError because every one of them is about the
 * flag's own value, and each names what it read: a value with no `=`, an empty
 * side, a name repeated on either side, and a name no animation on that side
 * answers to. ⛔ The last of those is a refusal rather than a dropped pair for
 * the reason a miss is refused by name everywhere else in this tool — a typo
 * that quietly measured less would be a report about a pairing the caller did
 * not ask for.
 */
function readAnimationPairs(values: string[], candidate: unknown, reference: unknown): DiffAnimationPair[] {
  const animationsOf = (root: unknown): string[] => {
    const anims = (root as { animations?: unknown } | null)?.animations;
    return typeof anims === 'object' && anims !== null && !Array.isArray(anims) ? Object.keys(anims) : [];
  };
  const have = { candidate: animationsOf(candidate), reference: animationsOf(reference) };
  const pairs: DiffAnimationPair[] = [];
  for (const value of values) {
    const at = value.indexOf('=');
    if (at < 0) {
      throw new UsageError(
        `--as ${JSON.stringify(value)} is not a pair. It takes <candidate>=<reference> — two animation names joined ` +
          'by `=`, because diff compares two skeletons and either may have its own name for the shot. The candidate ' +
          `has [${have.candidate.join(', ') || 'none'}] and the reference has [${have.reference.join(', ') || 'none'}].`,
      );
    }
    const pair = { candidate: value.slice(0, at), reference: value.slice(at + 1) };
    if (pair.candidate === '' || pair.reference === '') {
      throw new UsageError(
        `--as ${JSON.stringify(value)} leaves the ${pair.candidate === '' ? 'candidate' : 'reference'} side empty; ` +
          'it takes <candidate>=<reference>, a name on each side',
      );
    }
    for (const side of ['candidate', 'reference'] as const) {
      if (!have[side].includes(pair[side])) {
        throw new UsageError(
          `--as ${JSON.stringify(value)} names no ${side} animation: the ${side} has ` +
            `[${have[side].join(', ') || 'none'}] and not ${JSON.stringify(pair[side])}`,
        );
      }
      if (pairs.some((p) => p[side] === pair[side])) {
        throw new UsageError(
          `--as pairs the ${side} animation ${JSON.stringify(pair[side])} twice; each animation may be in one pair, ` +
            'or the block would compare one shot against two',
        );
      }
    }
    pairs.push(pair);
  }
  return pairs;
}

export function cmdDiff(flags: Record<string, string>, lists: Record<string, string[]>, positional: string[]): void {
  const [candidate, reference] = positional;
  if (!candidate || !reference) throw new UsageError('diff takes two paths: <candidate.json> <reference.json>');
  // A file is read as the JSON it is; a directory is a build, and its skeleton is what is compared — through the one
  // statement of a build (issue #1046), which refuses a directory holding none. A directory used to reach the JSON
  // reader and die on an EISDIR and a stack.
  const skeletonAt = (path: string): string => {
    const at = resolve(path);
    if (existsSync(at) && statSync(at).isDirectory()) return resolveBuild(at, undefined).skeletonPath;
    if (!existsSync(at)) throw new UsageError(`nothing at ${at}`);
    return at;
  };
  const candidatePath = skeletonAt(candidate);
  const referencePath = skeletonAt(reference);
  const candidateJson = readJsonFile(candidatePath);
  const referenceJson = readJsonFile(referencePath);
  const animationPairs = readAnimationPairs(lists.as ?? [], candidateJson, referenceJson);
  const report = diffSkeletons(candidateJson, referenceJson, { animationPairs });
  console.log('rigc diff');
  for (const line of diffLines(report, { candidate: candidatePath, reference: referencePath })) console.log(line);
  if (flags.json !== undefined) {
    // ⚠️ `...report` carries its OWN `candidate` and `reference` — the raw
    // per-side counts. Spelling the paths under those two names put them on
    // the losing side of the spread, so the written report named neither file
    // it compared. The paths get their own keys.
    writeJson(flags.json, { candidatePath, referencePath, ...report });
  }
}

/**
 * `check --out <dir>`, refused before anything is compared when it cannot be
 * written — see `src/checkpics.ts` for what goes there.
 *
 * Two refusals and no others. A **file** at the path is not a directory of
 * pictures, and saying so beats the `ENOTDIR` a write would throw after the
 * whole comparison had run. And a directory that **is `--frames` or holds it**
 * is refused because `<out>/<set>/` is cleared and `<out>/frames.json` written,
 * as `render` does to its own: there, that is the reference set being deleted by
 * the command that reads it — `check --frames render --out render` would clear
 * `render/heavy` and put a picture sidecar where the frames' own was. A fresh
 * path, and an existing directory anywhere else, are written to.
 */
function readCheckOut(outFlag: string, framesFlag: string): string {
  const out = resolve(outFlag);
  if (existsSync(out) && !statSync(out).isDirectory()) {
    throw new UsageError(`check: --out ${out} is a file; it names a directory`);
  }
  const frames = resolve(framesFlag);
  const within = relative(out, frames);
  if (within === '' || (!within.startsWith('..') && !isAbsolute(within))) {
    throw new UsageError(
      `check: --out ${out} ${within === '' ? 'is' : 'holds'} --frames ${frames}; the pictures would be written ` +
        'over the frames they are pictures of (each set directory under --out is cleared first) — name a directory ' +
        'outside it',
    );
  }
  return out;
}

export function cmdCheck(flags: Record<string, string>): void {
  if (flags.candidate === undefined) throw new UsageError('check needs --candidate <dir | skeleton.json>');
  if (flags.frames === undefined) throw new UsageError('check needs --frames <dir> — a rendered reference frame set');
  const out = flags.out === undefined ? null : readCheckOut(flags.out, flags.frames);
  const allFrames = flags['all-frames'] !== undefined;
  // Only asked for when there is somewhere to put the pictures: without --out
  // nothing is kept, and the run is the run it was before --out existed.
  const plates = out === null ? undefined : new CheckPlates({ allFrames });
  const report = runCheck(flags.candidate, flags.atlas, flags.frames, flags, plates);
  console.log('rigc check');
  for (const line of checkLines(report, { allFrames })) console.log(line);
  if (flags.json !== undefined) writeJson(flags.json, report);
  if (out !== null && plates !== undefined) {
    for (const set of writeCheckPictures(out, report, plates, { allFrames })) {
      const which = set.frames.length === 0 ? 'nothing compared' : set.every ? 'every compared frame' : 'the frames worth reading';
      console.log(`  ..    ${set.dir.padEnd(16)} ${set.frames.length} picture(s), ${which} -> ${set.path}`);
    }
    console.log(`rigc: wrote ${join(out, FRAMES_SIDECAR)}`);
  }
}

/**
 * `--skin`, checked against what the skeleton actually declares.
 *
 * ⭐ Absent is not `default`: it is "set no skin at all", which is what every
 * render did before issue #571 and what `spine-core` starts a skeleton in. The
 * distinction is the whole of the default path's byte-identity — see
 * `FramesSidecar.skin`.
 *
 * The miss is refused by name with the declared names beside it, the way
 * `--animation` is: a skin name is the one place a typo draws a whole rig's
 * worth of the wrong art and reports a number about it.
 */
function readSkinFlag(flags: Record<string, string>, declared: string[]): string | undefined {
  const name = flags.skin;
  if (name === undefined) return undefined;
  if (!declared.includes(name)) {
    throw new UsageError(
      `no skin ${JSON.stringify(name)} in this skeleton; it declares [${declared.join(', ') || 'none'}]`,
    );
  }
  return name;
}

/**
 * `--slot` / `--hide`, resolved against the skeleton under the skin this run
 * poses it in — or refused as a usage error, nothing written (issue #835).
 *
 * The rule itself is `slotSubsetOf`'s in `src/render.ts`, which `piecesOf`
 * applies too: it is read here only so a miss exits 2 with the usage beside
 * it before a directory is created, rather than surfacing from the sampler.
 */
function readSlotSubsetFlags(
  flags: Record<string, string>,
  facts: SkeletonFacts,
  skin: string | undefined,
): SlotSubset | undefined {
  const list = (raw: string | undefined): string[] | undefined =>
    raw === undefined ? undefined : raw.split(',').map((name) => name.trim()).filter((name) => name !== '');
  try {
    return facts.subset({ slots: list(flags.slot), hidden: list(flags.hide) }, skin);
  } catch (err) {
    if (err instanceof SlotSubsetError) throw new UsageError(err.message);
    throw err;
  }
}

/** `--poser` as the candidate is loaded with: a known spelling, or the input's own choice — the spelling is refused later, by `readPoserFlag`. */
function posersAsked(flags: Record<string, string>): PoserName | undefined {
  return POSER_NAMES.find((name) => name === flags.poser);
}

/** A resolved subset as the one field it is spelled as, in `PoseOptions` and in `frames.json` alike. */
function subsetFields(subset: SlotSubset | undefined): { slots?: string[]; hidden?: string[] } {
  if (subset === undefined) return {};
  return subset.mode === 'slots' ? { slots: subset.names } : { hidden: subset.names };
}

function readPositiveNumber(flags: Record<string, string>, key: string, fallback: number, least: number): number {
  const raw = flags[key];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < least) throw new UsageError(`--${key} must be a number of at least ${least}`);
  return value;
}

/**
 * `--environment <schedule.json>` read (issue #1416, `../environment.ts`), or
 * refused as a usage error before anything is read off the candidate: a path
 * with nothing at it, a file that is not a schedule, and every malformed entry,
 * by its index, its field, the value found and what is required.
 */
function readEnvironmentFlag(flags: Record<string, string>): { path: string; steps: EnvironmentStep[] } | undefined {
  const given = flags.environment;
  if (given === undefined) return undefined;
  const path = resolve(given);
  if (!existsSync(path) || !statSync(path).isFile()) throw new UsageError(`--environment ${given}: nothing at ${path} — it takes a schedule file { "spec": "rigc-environment/1", "steps": [...] }`);
  try {
    return { path, steps: readEnvironmentSchedule(readFileSync(path, 'utf8'), given) };
  } catch (err) {
    if (err instanceof EnvironmentError) throw new UsageError(err.message);
    throw err;
  }
}

/**
 * The refusals of a well-formed schedule that this candidate, at this rate,
 * would quietly not draw (issue #1416) — each one a render that would print a
 * plausible frame set showing nothing the schedule asked for:
 *
 * - a skeleton with no animation, whose one frame is the setup pose, where no
 *   physics step runs;
 * - a half the schedule changes that no physics constraint answers — none
 *   states it non-zero and no animation keys it — so every frame would draw as
 *   without the flag;
 * - two steps on one frame of the render's grid, the first never posed;
 * - a step after the last frame of every set drawn.
 *
 * `durations` are the poser's, of the sets this run draws.
 */
function environmentRefusal(given: string, steps: readonly EnvironmentStep[], skeletonText: string, fps: number, durations: ReadonlyArray<{ name: string; duration: number }>): string | null {
  if (durations.length === 0) return `--environment ${given}: the skeleton has no animation — its one frame is the setup pose, where no physics step runs, so no environment moves it`;
  const response = environmentResponse(skeletonText);
  if (response.declared.length === 0) return `--environment ${given}: the skeleton declares no physics constraint, so no environment moves anything in it`;
  for (const half of ['wind', 'gravity'] as const) {
    const changing = steps.map((step, i) => (step[half] === undefined ? -1 : i)).filter((i) => i >= 0);
    if (changing.length > 0 && response[half].length === 0) {
      return (
        `--environment ${given}: entry ${changing[0]} changes ${half}, and no physics constraint answers it — [${response.declared.map((n) => JSON.stringify(n)).join(', ')}] each state ${half} 0 and no animation keys it — ` +
        `so every frame would draw as it does without the schedule. A constraint's own ${half} is its response (AUTHORING §4.6)`
      );
    }
  }
  const collision = environmentCollisions(steps, fps)[0];
  if (collision !== undefined) {
    return (
      `--environment ${given}: entries [${collision.entries.join(', ')}] (t ${collision.entries.map((i) => steps[i].t).join(', ')}) land on one frame at ${fps} fps — frame ${collision.frame}, ` +
      `t=${(collision.frame / fps).toFixed(4)}s — so entry ${collision.entries[0]} would never be posed. Raise --fps, or merge them`
    );
  }
  const lastFrames = durations.map(({ name, duration }) => ({ name, last: Math.round(duration * fps) }));
  const longest = lastFrames.reduce((a, b) => (b.last > a.last ? b : a));
  const late = steps.findIndex((step) => environmentFrame(step.t, fps) > longest.last);
  if (late >= 0) {
    return (
      `--environment ${given}: entry ${late}'s t ${steps[late].t} falls after the last frame of every set drawn — the longest, "${longest.name}", ends at frame ${longest.last}, ` +
      `t=${(longest.last / fps).toFixed(4)}s at ${fps} fps — so it would change nothing`
    );
  }
  return null;
}

/**
 * `--pass-through <cloth>:<leg>[,…]` read against the skeleton's slots (issue
 * #1413, `../passthrough.ts`), or refused as a usage error before anything is
 * posed: a malformed list, an empty name, a slot the skeleton does not have, a
 * pair named twice — each by its entry. `undefined` without the flag.
 */
function readPassThroughFlag(raw: string | undefined, facts: SkeletonFacts): PassPair[] | undefined {
  if (raw === undefined) return undefined;
  try {
    return readPassPairs(raw, facts.slots.map((slot) => slot.name));
  } catch (err) {
    if (err instanceof PassThroughError) throw new UsageError(err.message);
    throw err;
  }
}

/**
 * `--seam <a>:<b>[,…]` read against the skeleton's slots (issue #1456,
 * `../seam.ts`), or refused as a usage error before anything is posed: a
 * malformed list, an empty name, a slot the skeleton does not have, a slot paired
 * with itself, a pair named twice in either order — each by its entry.
 * `undefined` without the flag.
 */
function readSeamFlag(raw: string | undefined, facts: SkeletonFacts): SeamPair[] | undefined {
  if (raw === undefined) return undefined;
  try {
    return readSeamPairs(raw, facts.slots.map((slot) => slot.name));
  } catch (err) {
    if (err instanceof SeamError) throw new UsageError(err.message);
    throw err;
  }
}

/**
 * `--angle-range`'s pairs, read against the skeleton's bones (issue #1414,
 * `../anglerange.ts`), or refused as a usage error before anything is posed: a
 * malformed list, an empty name, a bone the skeleton does not have, a bone read
 * against itself, a pair named twice — each by its entry. `undefined` without the flag.
 */
function readAngleRangeFlag(raw: string | undefined, facts: SkeletonFacts): BonePair[] | undefined {
  if (raw === undefined) return undefined;
  try {
    return readBonePairs(raw, facts.bones.map((bone) => bone.name));
  } catch (err) {
    if (err instanceof AngleRangeError) throw new UsageError(err.message);
    throw err;
  }
}

/** A box `render` was given rather than fitting one (issue #1414): the box flag's numbers, or an earlier render's grid. */
type GivenViewport =
  | { by: '--viewport'; box: { x: number; y: number; width: number; height: number } }
  | { by: '--viewport-from'; path: string; viewport: Viewport };

/**
 * `--viewport` and `--viewport-from`, read before anything is read off the
 * candidate (`../viewportpin.ts`): the two together are refused, and so is
 * `--max` beside `--viewport-from`, whose file already fixes the pixel size; a
 * malformed box, a path with no `frames.json` and a file whose grid is not one
 * are refused by name. `undefined` without either flag.
 */
function readGivenViewport(flags: Record<string, string>): GivenViewport | undefined {
  const box = flags.viewport;
  const from = flags['viewport-from'];
  if (box !== undefined && from !== undefined) {
    throw new UsageError('--viewport and --viewport-from both give the box the frames are of; give one of them');
  }
  try {
    if (box !== undefined) return { by: '--viewport', box: readViewportBox(box) };
    if (from === undefined) return undefined;
    if (flags.max !== undefined) {
      throw new UsageError(
        `--viewport-from takes no --max: the frames.json it reads fixes the pixel size as well as the box, so --max ${flags.max} ` +
          'would put this render on another grid. Give --viewport <x,y,w,h> with --max for a box at another size',
      );
    }
    const given = resolve(from);
    const path = existsSync(given) && statSync(given).isDirectory() ? join(given, FRAMES_SIDECAR) : given;
    if (!existsSync(path)) throw new UsageError(`--viewport-from ${from}: no ${FRAMES_SIDECAR} at ${path} — it takes an earlier render's ${FRAMES_SIDECAR}, or the directory \`render --out\` wrote it into`);
    return { by: '--viewport-from', path, viewport: viewportOfFramesFile(readJsonFile(path), path) };
  } catch (err) {
    if (err instanceof ViewportError) throw new UsageError(err.message);
    throw err;
  }
}

/**
 * render — the frame series, drawn by the same rasteriser `check` measures with.
 *
 * The framing is measured across EVERY animation at `FRAMING_FPS` and not across
 * the one being written, which is `src/render.ts`'s own invariant: the viewport is
 * a property of the shot, so two animations of one rig — and the same animation at
 * two rates — land on one pixel grid and stay comparable.
 */
export function cmdRender(flags: Record<string, string>): void {
  if (flags.candidate === undefined) {
    throw new UsageError('needs --candidate <dir | skeleton.json> — the directory `build --out` wrote');
  }
  const { skeletonPath, atlasPath, atlasText } = resolveDrawable(flags.candidate, flags.atlas);
  const atlasDir = dirname(atlasPath);
  const fps = readPositiveNumber(flags, 'fps', PROTOCOL_FPS, 1);
  // Read before anything is read off the candidate, so a malformed schedule is refused before a line is printed.
  const environment = readEnvironmentFlag(flags);
  const maxSide = readPositiveNumber(flags, 'max', 256, 16);
  // A box given rather than fitted (issue #1414), read before a line is printed, so a malformed one is refused first.
  const given = readGivenViewport(flags);
  const extremesOnly = flags['extremes-only'] !== undefined;
  if (extremesOnly) {
    for (const flag of ['sheet', 'sheet-format', 'page-edges', 'geometry', 'folds', 'pass-through', 'seam', 'overlaps', 'angle-range']) {
      if (flags[flag] !== undefined) {
        throw new UsageError(`--extremes-only takes no --${flag}: it writes only extremes.json and, when readable, extremes.png. Drop --${flag}, or use --extremes for ordinary frames and additional outputs`);
      }
    }
  }
  const wantsSheet = flags.sheet !== undefined;
  if (flags['sheet-format'] !== undefined && !wantsSheet) {
    throw new UsageError('--sheet-format takes --sheet: pass --sheet alongside --sheet-format <format>, or drop --sheet-format');
  }
  if (flags['page-edges'] !== undefined && !wantsSheet) {
    throw new UsageError(
      '--page-edges on render takes --sheet: without --sheet, render writes loose f####.png frames and contact.png, ' +
        'which have no packed atlas pages. Pass --sheet or drop --page-edges',
    );
  }
  const sheetFormat = wantsSheet ? readSheetFormat(flags) : undefined;
  const sheetPageEdges = wantsSheet ? readPageEdges(flags) : undefined;
  const outRoot = resolve(flags.out ?? 'render');
  const geometry = flags.geometry !== undefined;
  const extremes = extremesOnly || flags.extremes !== undefined;
  // The fold reading (issue #1383) is its own flag rather than a part of --geometry, so a caller that asked for
  // neither, or for --geometry alone, gets the bytes it always got: geometry.json is the pose, and a reading derived
  // from it is a second file beside it, written only when asked for.
  const folds = flags.folds !== undefined;
  // Refused together rather than one of them ignored (issue #864). The export
  // records every slot's whole geometry, because a subset is a statement about
  // which pixels are DRAWN and the pose is the same whatever a picture leaves
  // out — so a geometry.json beside a subset's frames would describe slots
  // those frames do not draw, and one that dropped them would stop being the
  // pose. The whole-rig run writes the same file either way.
  if (geometry) {
    for (const flag of ['slot', 'hide'] as const) {
      if (flags[flag] !== undefined) {
        throw new UsageError(
          `--geometry takes no --${flag}: it records every slot's whole geometry, which a subset of the drawn slots ` +
            `does not change. Run \`rigc render --geometry\` on the whole rig for the file, and --${flag} ` +
            `${flags[flag]} without --geometry for the pictures — both land on the same grid`,
        );
      }
    }
  }
  // The pass-through reading (issue #1413) is its own flag for --folds' reason: without it, every file is the bytes it was.
  const passThrough = flags['pass-through'];
  // The same refusal for the same reason: the reading is of every mesh the pose shows, whatever a picture leaves out.
  if (folds) {
    for (const flag of ['slot', 'hide'] as const) {
      if (flags[flag] !== undefined) {
        throw new UsageError(
          `--folds takes no --${flag}: it reads every mesh the pose shows, which a subset of the drawn slots does not ` +
            `change. Run \`rigc render --folds\` on the whole rig for the reading, and --${flag} ${flags[flag]} ` +
            'without --folds for the pictures — both land on the same grid',
        );
      }
    }
  }

  // And for the pass-through reading: it reads the two slots as the frame draws them, and a subset changes which draw.
  if (passThrough !== undefined) {
    for (const flag of ['slot', 'hide'] as const) {
      if (flags[flag] !== undefined) {
        throw new UsageError(
          `--pass-through takes no --${flag}: it reads the cloth and the leg as the whole rig draws them, which a subset of the ` +
            `drawn slots would change. Run \`rigc render --pass-through\` on the whole rig for the reading, and --${flag} ${flags[flag]} ` +
            'without --pass-through for the pictures — both land on the same grid',
        );
      }
    }
  }

  // The overlap reading (issue #1480) is its own flag for --folds' reason, and refused beside a subset for
  // --pass-through's: who covers whom is a fact of every slot the rig draws, and a subset drops some of them — a slot
  // left out covers nothing, so the pairs it is in would vanish and the reading would describe a picture of part of the rig.
  const overlaps = flags.overlaps !== undefined;
  if (overlaps) {
    for (const flag of ['slot', 'hide'] as const) {
      if (flags[flag] !== undefined) {
        throw new UsageError(
          `--overlaps takes no --${flag}: it reads which slot covers which as the whole rig draws them, and a subset of the ` +
            `drawn slots would drop the pairs the slots left out are in. Run \`rigc render --overlaps\` on the whole rig for the reading, and --${flag} ${flags[flag]} ` +
            'without --overlaps for the pictures — both land on the same grid',
        );
      }
    }
  }

  // The seam reading (issue #1456) is its own flag for --folds' reason, and refused beside a subset for --pass-through's:
  // it reads the two slots as the whole rig draws them.
  const seam = flags.seam;
  if (seam !== undefined) {
    for (const flag of ['slot', 'hide'] as const) {
      if (flags[flag] !== undefined) {
        throw new UsageError(
          `--seam takes no --${flag}: it reads the two slots as the whole rig draws them, which a subset of the drawn slots ` +
            `would change. Run \`rigc render --seam\` on the whole rig for the reading, and --${flag} ${flags[flag]} ` +
            'without --seam for the pictures — both land on the same grid',
        );
      }
    }
  }

  console.log('rigc render');
  console.log(`  ..    skeleton ${skeletonPath}`);
  console.log(`  ..    atlas    ${atlasPath}${atlasText === null ? ` — not there (${ATLAS_ABSENT})` : ''}`);
  // Which implementation of the posing seam draws this (issue #968), chosen
  // before anything is read off the candidate (issue #1014): a rigc build the
  // core poses — `skeleton.model.json` beside the pair — reads its names, its
  // subset roster and its pages without loading spine-core at all, and with a
  // rigc-compiled/2 document without its atlas either (issue #1020).
  const skeletonText = readSkeletonText(skeletonPath);
  const { choice, facts, pages } = loadCandidate(
    { skeletonText, atlasText, atlasDir, label: skeletonPath },
    { skeleton: skeletonPath, atlas: atlasPath },
    posersAsked(flags),
  );
  const only = readAnimationFlag(flags, [...facts.animations]);
  const skin = readSkinFlag(flags, [...facts.skins]);
  const subset = readSlotSubsetFlags(flags, facts, skin);
  // The physics constraints the skeleton declares, off the Spine file both posers read (issue #1467).
  const physicsDeclared = environmentResponse(skeletonText).declared;
  const passPairs = readPassThroughFlag(passThrough, facts);
  const seamPairs = readSeamFlag(seam, facts);
  // The angle reading (issue #1414) reads bones, which a subset of the drawn slots does not change, so it takes --slot/--hide.
  const anglePairs = readAngleRangeFlag(flags['angle-range'], facts);
  // One object, so the framing and the frames cannot be posed under two
  // different skins — which would frame one shot with another shot's box.
  // Not annotated `PoseOptions`: that name is `src/pose.ts`'s in this file, and
  // `src/render.ts` has one of its own. The inferred shape is the render one.
  // The subset rides on the same object and `framingViewport` takes it off, so
  // the frames draw the subset and the box is still the whole rig's.
  // The environment rides on the same object for the same reason (issue #1416): the framing reads it, so the box holds
  // what the frames under it draw.
  const pose =
    skin === undefined && subset === undefined && environment === undefined
      ? undefined
      : { ...(skin === undefined ? {} : { skin }), ...subsetFields(subset), ...(environment === undefined ? {} : { environment: environment.steps }) };
  if (skin !== undefined) console.log(`  ..    skin     ${skin}`);
  if (subset !== undefined) console.log(`  ..    ${subset.mode.padEnd(8)} ${subset.names.join(', ')}`);
  if (environment !== undefined && facts.animations.length === 0) {
    throw new UsageError(environmentRefusal(flags.environment, environment.steps, skeletonText, fps, []) ?? '');
  }

  // Rigc's own core when the candidate is a rigc build, and spine-core
  // otherwise, or where the core refuses the input by name. Never silently:
  // the `poser` line below says which, and why. `--poser` is refused here, where
  // it always was: a spelling there is no poser for, then `core` on an input
  // that cannot carry it.
  readPoserFlag(flags);
  refuseUnchosen(choice);

  // Everything is posed before anything is written, so a core refusal partway
  // re-poses the whole input on spine-core rather than leaving half of a frame
  // set drawn by each.
  const posed = throughPoser(choice, (poser, roster) => {
    // A schedule this candidate would not draw is refused before anything is posed, off the durations of the poser that
    // poses it (issue #1416) — a fallback re-runs this with the other poser's, which the core holds equal.
    if (environment !== undefined) {
      const drawn = poser.animations.filter((a) => only === undefined || a.name === only);
      const refusal = environmentRefusal(flags.environment, environment.steps, skeletonText, fps, drawn);
      if (refusal !== null) throw new UsageError(refusal);
    }
    // `null` is a skeleton that posed no vertex at all. One that posed a vertex
    // it cannot frame — Infinity or NaN — is thrown from the framing as a
    // `GeometryError` naming the number (issue #873), and one whose every vertex
    // sits at one point — every drawn bone unposed by the skin, or collapsed — as
    // an `UnframeablePoseError` (issue #997); neither reaches this. The roster is what
    // lets the second name the skins that pose a bone, whichever poser draws.
    const fitted = framingViewport(poser, maxSide, pose, roster);
    if (!fitted) {
      throw new UsageError(
        `${skeletonPath} posed no drawable attachment in any animation or in its setup pose${
          skin === undefined ? '' : ` under skin ${JSON.stringify(skin)}`
        } — there is nothing to draw`,
      );
    }
    // ⭐ A given box replaces the fitted one, and the framing still runs: it is what refuses a pose with nothing to draw,
    // one that is not finite and one with no extent, and a box given over such a pose would draw it in silence.
    const viewport =
      given === undefined
        ? fitted
        : given.by === '--viewport'
          ? viewportFor(given.box.x, given.box.y, given.box.x + given.box.width, given.box.y + given.box.height, maxSide)
          : given.viewport;

    // `sampleAll` covers the skeleton with no animation at all, which files its one
    // setup-pose frame under the reserved name. Narrowing to one animation reuses
    // the same sampler rather than a second path through it.
    //
    // `--geometry` rides on the SAME call (issue #864): the bones and the whole
    // attachments are read off the skeleton at the step that drew each frame, so
    // the export's grid is this frame set's by construction.
    // The bones ride along for --geometry and --angle-range, the whole attachments for --geometry and the two readings off them.
    const wantsBones = geometry || anglePairs !== undefined;
    const wantsGeometry = extremes || geometry || folds || passPairs !== undefined || seamPairs !== undefined;
    // The physics constraints each frame's step stepped ride along whenever the rig declares one (issue #1467): the
    // `physics:` line and frames.json's `physics` field are read off them.
    const sampling = {
      ...pose,
      ...(extremes ? { channels: true } : {}),
      ...(wantsBones ? { bones: true } : {}),
      ...(wantsGeometry ? { geometry: true } : {}),
      ...(physicsDeclared.length > 0 ? { physics: true } : {}),
    };
    const sampled: Map<string, Frame[]> =
      only === undefined
        ? sampleAll(poser, fps, sampling)
        : new Map([[only, sampleAnimation(poser, only, fps, sampling)]]);
    const extremeReadings = new Map<string, { reading: ReturnType<typeof extremesOf>; plate: Plate | null }>();
    if (extremes) {
      // Setup is an optional observation too: a failed extra read cannot turn a drawable set into a gate failure.
      let setup: Frame | undefined;
      let setupFailure: string | undefined;
      for (const [name, frames] of sampled) {
        let reading: ReturnType<typeof extremesOf> | undefined;
        try {
          reading = extremesOf(name === SETUP_POSE_DIR && facts.animations.length === 0 ? null : name, fps, frames, pose);
          let plate: Plate | null = null;
          if (reading.geometryPair !== null) {
            if (setupFailure !== undefined) throw new Error(setupFailure);
            if (setup === undefined) {
              try {
                setup = sampleSetupPose(poser, pose)[0];
                if (setup === undefined) throw new Error('setup pose sample is absent');
              } catch (err) {
                setupFailure = `setup pose observation failed: ${err instanceof Error ? err.message : String(err)}`;
                throw new Error(setupFailure);
              }
            }
            plate = extremesPlate(reading, setup, frames, pages, viewport);
          }
          extremeReadings.set(name, { reading, plate });
        } catch (err) {
          const refused = extremesRefusal(name === SETUP_POSE_DIR && facts.animations.length === 0 ? null : name, fps, frames, err instanceof Error ? err.message : String(err), reading);
          extremeReadings.set(name, { reading: refused, plate: null });
        }
      }
    }
    // Every file's text before the first write, so a refused number leaves the
    // output directory as it was rather than half of a frame set behind it.
    const geometryTexts = new Map<string, string>();
    if (geometry) {
      for (const [name, frames] of sampled) {
        const animation = name === SETUP_POSE_DIR && facts.animations.length === 0 ? null : name;
        geometryTexts.set(name, geometryText(geometryFileOf(poser, animation, fps, frames, viewport, skin, environment?.steps)));
      }
    }
    // The fold reading, off the very attachments the frames were drawn from, against the rest table the geometry
    // export writes — one per set, every mesh any of its frames shows.
    const foldReadings = new Map<string, ReturnType<typeof foldsFileOf>>();
    if (folds) {
      for (const [name, frames] of sampled) {
        const animation = name === SETUP_POSE_DIR && facts.animations.length === 0 ? null : name;
        const shown = frames.map((frame) => frame.attachments ?? []);
        const read = frames.map((frame) => ({ index: frame.index, time: frame.time, attachments: frame.attachments ?? [] }));
        foldReadings.set(name, foldsFileOf(animation, fps, skin, foldsOf(poser.rest(skin, shown), read)));
      }
    }
    // The pass-through reading, off the very pieces the frames are drawn from, in their draw order — one per set, every
    // pair the flag names. A pair whose slot draws on no frame of any set drawn is refused rather than read as 0.
    const passReadings = new Map<string, ReturnType<typeof passThroughFileOf>>();
    if (passPairs !== undefined) {
      const draws = new Set<string>();
      for (const frames of sampled.values()) for (const frame of frames) for (const piece of frame.pieces) draws.add(piece.slot);
      for (const pair of passPairs) {
        for (const slot of [pair.cloth, pair.leg]) {
          if (!draws.has(slot)) {
            throw new UsageError(
              `--pass-through: slot ${JSON.stringify(slot)} draws on no frame of [${[...sampled.keys()].join(', ')}]${skin === undefined ? '' : ` under skin ${JSON.stringify(skin)}`} ` +
                '— it shows no region or mesh there, so it has no drawn outline to read',
            );
          }
        }
      }
      for (const [name, frames] of sampled) {
        const animation = name === SETUP_POSE_DIR && facts.animations.length === 0 ? null : name;
        const shown = frames.map((frame) => frame.attachments ?? []);
        const read = frames.map((frame) => ({ index: frame.index, time: frame.time, pieces: frame.pieces, attachments: frame.attachments ?? [] }));
        try {
          passReadings.set(name, passThroughFileOf(animation, fps, skin, passThroughOf(passPairs, poser.rest(skin, shown), read, pages)));
        } catch (err) {
          if (err instanceof PassThroughError) throw new UsageError(`--pass-through, ${JSON.stringify(name)}: ${err.message}`);
          throw err;
        }
      }
    }
    // The seam reading, off the very pieces the frames are drawn from — one per set, every pair the flag names. A pair
    // whose slot draws on no frame of any set drawn is refused, as --pass-through refuses it, rather than read as a SKIP.
    const seamReadings = new Map<string, ReturnType<typeof seamFileOf>>();
    if (seamPairs !== undefined) {
      const draws = new Set<string>();
      for (const frames of sampled.values()) for (const frame of frames) for (const piece of frame.pieces) draws.add(piece.slot);
      for (const pair of seamPairs) {
        for (const slot of [pair.a, pair.b]) {
          if (!draws.has(slot)) {
            throw new UsageError(
              `--seam: slot ${JSON.stringify(slot)} draws on no frame of [${[...sampled.keys()].join(', ')}]${skin === undefined ? '' : ` under skin ${JSON.stringify(skin)}`} ` +
                '— it shows no region or mesh there, so it has no drawing to read a seam of',
            );
          }
        }
      }
      for (const [name, frames] of sampled) {
        const animation = name === SETUP_POSE_DIR && facts.animations.length === 0 ? null : name;
        const shown = frames.map((frame) => frame.attachments ?? []);
        const read = frames.map((frame) => ({ index: frame.index, time: frame.time, pieces: frame.pieces, attachments: frame.attachments ?? [] }));
        try {
          seamReadings.set(name, seamFileOf(animation, fps, skin, seamsOf(seamPairs, poser.rest(skin, shown), read, pages)));
        } catch (err) {
          if (err instanceof SeamError) throw new UsageError(`--seam, ${JSON.stringify(name)}: ${err.message}`);
          throw err;
        }
      }
    }
    // The angle reading, off the very bones the frames were posed with — one per set, every pair the flag names.
    const angleReadings = new Map<string, AngleRangeReading[]>();
    if (anglePairs !== undefined) {
      for (const [name, frames] of sampled) {
        const read = frames.map((frame) => ({ index: frame.index, time: frame.time, bones: frame.bones ?? [] }));
        try {
          angleReadings.set(name, angleRangesOf(anglePairs, read, JSON.stringify(name)));
        } catch (err) {
          if (err instanceof AngleRangeError) throw new UsageError(err.message);
          throw err;
        }
      }
    }
    // The overlap reading, off the very pieces the frames are drawn from, in their draw order, on the frames' own
    // viewport — one per set — and its outline plates, drawn here so a refusal leaves nothing written.
    const overlapReadings = new Map<string, { file: ReturnType<typeof overlapsFileOf>; plates: Map<number, Plate> }>();
    if (overlaps) {
      for (const [name, frames] of sampled) {
        const animation = name === SETUP_POSE_DIR && facts.animations.length === 0 ? null : name;
        try {
          const reading = overlapsOf(frames, pages, viewport);
          const participants = plateParticipants(reading.pairs);
          const plates = new Map<number, Plate>();
          for (const index of reading.plated.keys()) {
            const plate = overlapPlate(reading, index, participants, viewport);
            if (plate !== null) plates.set(index, plate);
          }
          overlapReadings.set(name, { file: overlapsFileOf(animation, fps, skin, reading), plates });
        } catch (err) {
          if (err instanceof OverlapError) throw new UsageError(`--overlaps, ${JSON.stringify(name)}: ${err.message}`);
          throw err;
        }
      }
    }
    const sheetPacks = new Map<string, SheetSetPack>();
    if (wantsSheet) {
      const modelDocText = modelTextBeside(skeletonPath, skeletonText) ?? null;
      const rigName = sheetRigNameOf(skeletonPath, modelDocText, skeletonText);
      const source = sheetSourceOf(skeletonPath, skeletonText, modelDocText);
      const pinned = given === undefined ? undefined : pinnedRecord(given.by, outsideViewport(sampled, viewport));
      for (const [name, frames] of sampled) {
        const animation = name === SETUP_POSE_DIR && facts.animations.length === 0 ? null : name;
        const setName = frameSetDir(name, fps);
        try {
          sheetPacks.set(
            name,
            buildSheetSet({
              rigName,
              setName,
              animation,
              fps,
              maxSide,
              viewport,
              frames,
              atlasPages: pages,
              source,
              format: sheetFormat,
              pageEdges: sheetPageEdges,
              skin,
              subset,
              environment: environment?.steps,
              pinned,
            }),
          );
        } catch (err) {
          if (err instanceof SheetUsageError) throw new UsageError(err.message);
          throw err;
        }
      }
    }
    return { viewport, fitted, sampled, extremeReadings, geometryTexts, foldReadings, passReadings, seamReadings, angleReadings, overlapReadings, sheetPacks };
  });
  const { viewport, fitted, sampled, extremeReadings, geometryTexts, foldReadings, passReadings, seamReadings, angleReadings, overlapReadings, sheetPacks } = posed.value;
  console.log(`  ..    poser    ${posed.note}`);
  if (environment !== undefined) {
    const response = environmentResponse(skeletonText);
    console.log(
      `  ..    world    ${environment.steps.length} step(s) from ${environment.path} (x right, y down; the runtime's wind [1, 0] and gravity [0, 1] before the first) — ` +
        `wind answered by ${response.wind.join(', ') || 'none'}; gravity by ${response.gravity.join(', ') || 'none'}`,
    );
  }
  console.log(`  ..    ${viewport.width}x${viewport.height}px at ${fps} fps, ${sampled.size} set(s) -> ${outRoot}`);
  // Whether physics ran (issue #1467): said once for a rig with nothing to step, and per set below for one with.
  if (physicsDeclared.length === 0) console.log(`  ..    ${PHYSICS_NONE_LINE}`);
  if (!facts.declaresStage) console.log(`  ..    ${STAGELESS_FRAMING.render}`);
  // A given box (issue #1414): said with the box it replaced, and every slot it leaves part of out, by set and frame.
  const outside = given === undefined ? [] : outsideViewport(sampled, viewport);
  if (given !== undefined) {
    const f = (n: number): string => String(Number(n.toFixed(4)));
    const box = (v: Viewport): string => `world x ${f(v.minX)}..${f(v.maxX)}, y ${f(v.minY)}..${f(v.maxY)}`;
    console.log(
      `  ..    viewport given by ${given.by}${given.by === '--viewport-from' ? ` ${given.path}` : ''}: ${box(viewport)} at ${f(viewport.scale)} px per unit, y up ` +
        `(fitted, the box would be ${box(fitted)}) — ${outside.length === 0 ? 'every drawn piece of every frame is inside it' : `${outside.length} slot(s) reach past it, named below`}`,
    );
    for (const reading of outside) console.log(`  ..    outside  ${outsideLine(reading, fps)}`);
  }

  mkdirSync(outRoot, { recursive: true });
  if (extremesOnly) {
    // Reuse the same posed grid and plates; selecting extremes needs no ordinary pixels.
    // Clear only the selected sets, just as the ordinary render does. No frames.json
    // is written: this output is an observation, not a frame set consumable by check.
    for (const [name, extreme] of extremeReadings) {
      const dir = join(outRoot, frameSetDir(name, fps));
      if (existsSync(dir)) rmSync(dir, { recursive: true });
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'extremes.json'), extremesText(extreme.reading));
      if (extreme.plate !== null) extreme.plate.writePng(join(dir, 'extremes.png'));
      console.log(`  ..    ${extremesLine(extreme.reading)}`);
    }
    // A prior ordinary render's index would falsely advertise now-removed frames.
    rmSync(join(outRoot, FRAMES_SIDECAR), { force: true });
    return;
  }
  const sets: FrameSet[] = [];
  // A mesh's setup faults are a property of the mesh, not of an animation: said once, the first time a set shows it.
  const faultsSaid = new Set<string>();
  for (const [name, frames] of sampled) {
    // Same naming as a reference render: the protocol rate says nothing, any
    // other rate says itself, so two rates of one animation sit side by side.
    const dirName = frameSetDir(name, fps);
    const dir = join(outRoot, dirName);
    // Cleared rather than written over: a shorter animation would otherwise leave
    // the tail of a longer previous run on disk, and stale frames in a frame set
    // are indistinguishable from real ones.
    if (existsSync(dir)) rmSync(dir, { recursive: true });
    mkdirSync(dir, { recursive: true });
    for (let i = 0; i < frames.length; i++) {
      renderFrame(frames[i], pages, viewport, BACKGROUND).writePng(join(dir, `f${String(i).padStart(4, '0')}.png`));
    }
    // One frame has nothing to compare itself against, so it gets no sheet — it
    // would be the same picture with a border and a "0" on it.
    const sheet = frames.length > 1;
    if (sheet) contactSheet(frames, pages, viewport, SHEET_TILE).writePng(join(dir, SHEET_FILE));
    const geometryOut = geometryTexts.get(name);
    if (geometryOut !== undefined) writeFileSync(join(dir, GEOMETRY_FILE), geometryOut);
    const foldReading = foldReadings.get(name);
    if (foldReading !== undefined) writeFileSync(join(dir, FOLDS_FILE), foldsText(foldReading));
    const passReading = passReadings.get(name);
    if (passReading !== undefined) writeFileSync(join(dir, PASS_THROUGH_FILE), passThroughText(passReading));
    const extreme = extremeReadings.get(name);
    if (extreme !== undefined) {
      writeFileSync(join(dir, 'extremes.json'), extremesText(extreme.reading));
      if (extreme.plate === null) rmSync(join(dir, 'extremes.png'), { force: true });
      else extreme.plate.writePng(join(dir, 'extremes.png'));
      console.log(`  ..    ${extremesLine(extreme.reading)}`);
    }
    const seamReading = seamReadings.get(name);
    if (seamReading !== undefined) writeFileSync(join(dir, SEAM_FILE), seamText(seamReading));
    const overlapReading = overlapReadings.get(name);
    if (overlapReading !== undefined) {
      writeFileSync(join(dir, OVERLAPS_FILE), overlapsText(overlapReading.file));
      for (const [index, plate] of overlapReading.plates) plate.writePng(join(dir, overlapsPlateFile(index)));
    }
    const sheetPack = sheetPacks.get(name);
    if (sheetPack !== undefined) {
      for (const page of sheetPack.pages) {
        page.plate.writePng(join(dir, page.image));
        writeFileSync(join(dir, page.table), page.jsonText);
      }
      writeFileSync(join(dir, SHEET_MANIFEST_FILE), sheetPack.manifestText);
    }
    const duration = frames[frames.length - 1].time;
    const physics = physicsDeclared.length === 0 ? undefined : physicsSteppedOf(frames, fps);
    sets.push({
      dir: dirName,
      animation: name === SETUP_POSE_DIR && facts.animations.length === 0 ? null : name,
      fps,
      sampled: frames.length,
      written: frames.length,
      stride: 1,
      duration,
      ...(physics === undefined ? {} : { physics: { stepped: physics.stepped.length, fps } }),
      ...(overlapReading === undefined ? {} : { overlaps: overlapsRecord(overlapReading.file, overlapReading.plates.size) }),
      ...(sheetPack === undefined ? {} : { sheet: sheetSidecarRecord(sheetPack) }),
    });
    const how = frames.length === 1 ? 'a single pose' : `${duration.toFixed(3)}s`;
    const folding = foldReading?.meshes.filter((m) => m.worst !== null).length ?? 0;
    const foldNote = foldReading === undefined ? '' : ` + ${FOLDS_FILE} (${folding} of ${foldReading.meshes.length} mesh(es) fold)`;
    const passing = passReading?.pairs.filter((p) => p.frames.length > 0).length ?? 0;
    const passNote = passReading === undefined ? '' : ` + ${PASS_THROUGH_FILE} (${passing} of ${passReading.pairs.length} pair(s) pass through)`;
    const opening = seamReading?.pairs.filter((p) => p.opens.length > 0).length ?? 0;
    const seamNote = seamReading === undefined ? '' : ` + ${SEAM_FILE} (${opening} of ${seamReading.pairs.length} pair(s) open)`;
    const overlapNote =
      overlapReading === undefined
        ? ''
        : ` + ${OVERLAPS_FILE} (${overlapReading.file.pairs.filter((p) => p.varies).length} moving pair(s), ${overlapReading.plates.size} outline plate(s))`;
    const sheetNote =
      sheetPack === undefined
        ? ''
        : ` + ${sheetPack.pages.map((p) => `${p.image} + ${p.table}`).join(' + ')} + ${SHEET_MANIFEST_FILE} (${sheetPack.pages.length} page(s), ${sheetPack.pageEdges})`;
    const extras = `${sheet ? ` + ${SHEET_FILE}` : ''}${sheetNote}${geometryOut === undefined ? '' : ` + ${GEOMETRY_FILE}`}${foldNote}${passNote}${seamNote}${overlapNote}`;
    console.log(`  ..    ${name.padEnd(16)} ${frames.length} frame(s), ${how}${extras} -> ${dir}`);
    if (physics !== undefined) console.log(`  ..    ${physicsLine(physics.stepped, physicsDeclared, fps, frames.length)}`);
    for (const mesh of foldReading?.meshes ?? []) {
      const key = `${mesh.slot}\u0000${mesh.attachment}`;
      const fault = faultsSaid.has(key) ? null : setupFaultLine(mesh);
      faultsSaid.add(key);
      if (fault !== null) console.log(`  ..    setup    ${fault}`);
      const line = foldLine(foldReading?.animation ?? null, fps, mesh);
      if (line !== null) console.log(`  ..    folds    ${line}`);
    }
    for (const pair of passReading?.pairs ?? []) {
      console.log(`  ..    pass     ${passSummaryLine(passReading?.animation ?? null, fps, pair)}`);
      for (const frame of pair.frames) console.log(`  ..    pass     ${passFrameLine(passReading?.animation ?? null, pair, frame)}`);
    }
    for (const pair of seamReading?.pairs ?? []) console.log(`  ..    seam     ${seamLine(seamReading?.animation ?? null, fps, pair)}`);
    if (overlapReading !== undefined) {
      const still = staticLine(overlapReading.file.animation, overlapReading.file.pairs);
      if (still !== null) console.log(`  ..    overlap  ${still}`);
      for (const pair of overlapReading.file.pairs) if (pair.varies) console.log(`  ..    overlap  ${overlapLine(overlapReading.file.animation, pair)}`);
    }
    for (const reading of angleReadings.get(name) ?? []) {
      console.log(`  ..    angle    ${angleRangeLine(name === SETUP_POSE_DIR && facts.animations.length === 0 ? null : name, fps, reading)}`);
    }
  }

  // The sidecar is what makes this a frame SET rather than a pile of pictures:
  // the world box every frame is a picture of, so a distance measured in pixels
  // converts back to the units the rig is authored in — and so `rigc check` can
  // render something else into the same grid later.
  const sidecar: FramesSidecar = {
    spec: FRAMES_SPEC,
    // Written only when a skin was asked for: absent says "no skin was set",
    // which is both what this run did and what every frame set written before
    // #571 did. See `FramesSidecar.skin`.
    ...(skin === undefined ? {} : { skin }),
    // Written only when a subset was asked for, for the same reason: a render of
    // every slot says nothing and stays the bytes it always was (issue #835).
    ...subsetFields(subset),
    // Written only when a schedule was given (issue #1416): a render without one says nothing and stays the bytes it was.
    ...(environment === undefined ? {} : { environment: environment.steps }),
    // Written only when the box was given (issue #1414): a fitted render says nothing and stays the bytes it was.
    ...(given === undefined ? {} : { pinned: pinnedRecord(given.by, outside) }),
    background: BACKGROUND,
    // The one spelling `geometry.json` repeats, so the two files cannot state
    // two boxes for one grid.
    viewport: sidecarViewport(viewport),
    sets: [...sets].sort((a, b) => a.dir.localeCompare(b.dir)),
  };
  writeFileSync(join(outRoot, FRAMES_SIDECAR), `${JSON.stringify(sidecar, null, 2)}\n`);
  console.log(`rigc: wrote ${join(outRoot, FRAMES_SIDECAR)}`);
}

/**
 * `frames.json`'s record of one set's overlap reading (issue #1480), so a reader that cannot open a plate still has
 * the figures: the file, how many pairs cover anything, how many of them are static layering, how many plates were
 * drawn, and every pair that moves with its frame count and its most pixels — the figures its line prints.
 */
export function overlapsRecord(file: ReturnType<typeof overlapsFileOf>, plates: number): NonNullable<FrameSet['overlaps']> {
  return {
    file: OVERLAPS_FILE,
    pairs: file.pairs.length,
    static: file.pairs.filter((p) => !p.varies).length,
    plates,
    moving: file.pairs.filter((p) => p.varies).map((p) => ({ under: p.under, over: p.over, frames: p.frames, most: p.most })),
  };
}

/** `render`'s line for a rig that declares no physics constraint (issue #1467): nothing was stepped because nothing could be. */
export const PHYSICS_NONE_LINE = 'physics: none in this rig — it declares no physics constraint, so no frame steps one';

/** The physics constraints any frame of a set stepped (issue #1467), by name in code-unit order. */
export function physicsSteppedOf(frames: readonly Frame[], fps: number): { stepped: string[]; fps: number } {
  const names = new Set<string>();
  for (const frame of frames) for (const name of frame.physics ?? []) names.add(name);
  return { stepped: [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)), fps };
}

/**
 * `render`'s `physics:` line for one set (issue #1467): how many constraints were stepped at the set's rate, and — when
 * fewer than the rig declares — the ones that took no step, by name, with why a constraint takes none.
 */
export function physicsLine(stepped: readonly string[], declared: readonly string[], fps: number, frames: number): string {
  const head = `physics: ${stepped.length} constraint(s) stepped at ${fps} fps`;
  const idle = declared.filter((name) => !stepped.includes(name));
  if (idle.length === 0) return head;
  const why = frames === 1 ? 'a single pose takes no step' : 'inactive, or a mix of 0, on every frame';
  return `${head} — ${idle.length} of the ${declared.length} declared took none: ${idle.map((n) => JSON.stringify(n)).join(', ')} (${why})`;
}

/** Warning-only reading, independent of build and of raster output. */
export function cmdTextureScale(flags: Record<string, string>): void {
  const accepted = ['candidate', 'atlas', 'skin', 'fps', 'poser', 'json', 'help'];
  const stray = Object.keys(flags).filter(k => !accepted.includes(k));
  if (stray.length > 0) throw new UsageError(`texture-scale takes no --${stray.join(', --')}; use texture-scale --help`);
  if (flags.candidate === undefined) throw new UsageError('texture-scale needs --candidate <dir | skeleton.json>');
  const fps = readPositiveNumber(flags, 'fps', TEXTURE_SCALE_FPS, 1);
  const { skeletonPath, atlasPath, atlasText } = resolveDrawable(flags.candidate, flags.atlas);
  if (flags.json !== undefined) {
    const target = realpathAhead(flags.json);
    const within = relative(realpathSync(dirname(skeletonPath)), target);
    if (within === '' || (within !== '..' && !within.startsWith(`..${sep}`) && !isAbsolute(within))) {
      throw new UsageError('--json must name a report outside the candidate directory; texture-scale never writes into a build');
    }
    if (existsSync(target)) {
      let isReport = false;
      if (statSync(target).isFile()) {
        try { isReport = (JSON.parse(readFileSync(target, 'utf8')) as { spec?: unknown }).spec === 'rigc-texture-scale/1'; } catch { /* An existing non-report is never replaced. */ }
      }
      if (!isReport) throw new UsageError('--json target exists and is not a rigc-texture-scale/1 report; name a new file outside the candidate directory');
    }
  }
  const skeletonText = readSkeletonText(skeletonPath);
  const candidate = loadCandidate({ skeletonText, atlasText, atlasDir: dirname(atlasPath), label: skeletonPath },
    { skeleton: skeletonPath, atlas: atlasPath }, posersAsked(flags));
  readPoserFlag(flags);
  const skin = readSkinFlag(flags, [...candidate.facts.skins]);
  refuseUnchosen(candidate.choice);
  const read = throughPoser(candidate.choice, poser => textureScaleReading(poser, candidate.pages, skeletonText, fps, skin));
  console.log(`poser: ${read.note}`);
  for (const line of textureScaleLines(read.value.report)) console.log(line);
  if (flags.json !== undefined) writeJson(flags.json, read.value.report);
}

/** Where `inspect` writes when `--out` is not given, and the name it takes inside a directory `--out` names. */
export const DEFAULT_INSPECT_OUT = 'inspect.png';

/**
 * inspect — one moment of a build drawn for an agent to read, and the legend
 * that turns its pixels back into world units (issue #1357). The view is
 * `src/inspect.ts`'s; this reads the flags, loads the candidate the way
 * `render` loads it and writes the two files.
 *
 * ⚠️ A flag this command does not take is refused by name here rather than
 * ignored: the parser accepts any `--word value`, and a view asked for with a
 * flag that does nothing would be a picture of something other than what the
 * caller asked about.
 */
export function cmdInspect(flags: Record<string, string>): void {
  const doc = COMMANDS.find((c) => c.name === 'inspect');
  const accepted = [...(doc?.flags ?? []), 'help'];
  const stray = Object.keys(flags).filter((name) => !accepted.includes(name));
  if (stray.length > 0) {
    throw new InspectError(`inspect takes no --${stray.join(', --')}; it takes --${accepted.filter((f) => f !== 'help').join(', --')}`);
  }
  if (flags.candidate === undefined) {
    throw new UsageError('inspect needs --candidate <dir | skeleton.json> — the directory `build --out` wrote');
  }
  if (flags.zoom !== undefined && flags.viewport !== undefined) {
    throw new InspectError('--zoom and --viewport both choose the box the picture is of; give one of them');
  }
  const { show, weightsBone } = readShow(flags.show);
  const include = readBonePatterns('bone', flags.bone);
  const exclude = readBonePatterns('hide-bone', flags['hide-bone']);
  const boneFilter = include === undefined && exclude === undefined ? undefined : { ...(include === undefined ? {} : { include }), ...(exclude === undefined ? {} : { exclude }) };
  const slotInclude = readBonePatterns('overlay-slot', flags['overlay-slot'], 'neck,hair_*');
  const slotExclude = readBonePatterns('hide-overlay-slot', flags['hide-overlay-slot'], 'neck,hair_*');
  const slotFilter =
    slotInclude === undefined && slotExclude === undefined
      ? undefined
      : { ...(slotInclude === undefined ? {} : { include: slotInclude }), ...(slotExclude === undefined ? {} : { exclude: slotExclude }) };
  const times = readTimes(flags.at);
  const fps = readPositiveNumber(flags, 'fps', INSPECT_DEFAULT_FPS, 1);
  const maxSide = readPositiveNumber(flags, 'max', 256, 16);
  let frame: InspectFrame = { kind: 'shot' };
  if (flags.zoom !== undefined) frame = { kind: 'zoom', ...readZoom(flags.zoom) };
  if (flags.viewport !== undefined) {
    try {
      frame = { kind: 'viewport', ...readViewportBox(flags.viewport) };
    } catch (err) {
      if (err instanceof ViewportError) throw new UsageError(err.message);
      throw err;
    }
  }
  const target = resolve(flags.out ?? DEFAULT_INSPECT_OUT);
  const out = existsSync(target) && statSync(target).isDirectory() ? join(target, DEFAULT_INSPECT_OUT) : target;
  if (!out.endsWith('.png')) throw new InspectError(`--out ${flags.out}: the picture is a PNG, so --out names a .png file (its legend is written beside it as .json)`);
  const legendPath = `${out.slice(0, -'.png'.length)}.json`;

  const { skeletonPath, atlasPath, atlasText } = resolveDrawable(flags.candidate, flags.atlas);
  const skeletonText = readSkeletonText(skeletonPath);
  console.log('rigc inspect');
  console.log(`  ..    skeleton ${skeletonPath}`);
  console.log(`  ..    atlas    ${atlasPath}${atlasText === null ? ` — not there (${ATLAS_ABSENT})` : ''}`);
  // `render`'s loading, in `render`'s order (issue #1014): the poser is chosen before anything is read off the candidate.
  const candidate = loadCandidate(
    { skeletonText, atlasText, atlasDir: dirname(atlasPath), label: skeletonPath },
    { skeleton: skeletonPath, atlas: atlasPath },
    posersAsked(flags),
  );
  const animation = readAnimationFlag(flags, [...candidate.facts.animations]) ?? null;
  readPoserFlag(flags);
  refuseUnchosen(candidate.choice);
  // `--compare`: the second build, loaded the way the first was — its own poser chosen by what it carries, and said.
  let compare: InspectCompare | undefined;
  if (flags.compare !== undefined) {
    const other = resolveDrawable(flags.compare, undefined);
    const otherText = readSkeletonText(other.skeletonPath);
    console.log(`  ..    compare  ${other.skeletonPath}`);
    const otherCandidate = loadCandidate(
      { skeletonText: otherText, atlasText: other.atlasText, atlasDir: dirname(other.atlasPath), label: other.skeletonPath },
      { skeleton: other.skeletonPath, atlas: other.atlasPath },
      posersAsked(flags),
    );
    refuseUnchosen(otherCandidate.choice);
    compare = { candidate: otherCandidate, texts: { skeletonText: otherText, modelText: modelTextBeside(other.skeletonPath, otherText) } };
  }
  const result = inspectCandidate(
    candidate,
    { skeletonText, modelText: modelTextBeside(skeletonPath, skeletonText) },
    {
      show,
      ...(weightsBone === undefined ? {} : { weightsBone }),
      ...(boneFilter === undefined ? {} : { boneFilter }),
      ...(slotFilter === undefined ? {} : { slotFilter }),
      dim: flags.dim !== undefined,
      animation,
      times,
      fps,
      skin: flags.skin,
      frame,
      maxSide,
    },
    {},
    compare,
  );
  const { legend } = result;
  console.log(`  ..    poser    ${compare === undefined ? '' : 'A: '}${result.poserNote}`);
  if (result.comparePoserNote !== undefined) console.log(`  ..    poser    B: ${result.comparePoserNote}`);
  const when = animation === null ? 'the setup pose' : `${animation} at ${legend.tiles.filter((t) => t.build !== 'B').map((t) => `${t.time.toFixed(4)}s (frame ${t.frame})`).join(', ')}, ${fps} fps grid`;
  console.log(`  ..    view     ${legend.show.join(',')}${legend.dim ? ' over dimmed art' : ''} — ${when}`);
  const v = legend.viewport;
  // Four places for reading; the legend carries every number exactly.
  const f = (n: number): string => String(Number(n.toFixed(4)));
  console.log(`  ..    box      world x ${f(v.minX)}..${f(v.maxX)}, y ${f(v.minY)}..${f(v.maxY)} at ${f(v.scale)} px per unit — ${legend.tiles.length} tile(s) of ${v.width}x${v.height}px (exact in the legend)`);
  for (const note of result.notes) console.log(`  ..    ${note}`);
  mkdirSync(dirname(out), { recursive: true });
  result.plate.writePng(out);
  writeFileSync(legendPath, legendText(legend));
  console.log(`rigc: wrote ${out}`);
  console.log(`rigc: wrote ${legendPath}`);
}

/** `--scale 0.5,2` / `--rotation -30,30` — a pair of numbers, low first. */
function readRange(flags: Record<string, string>, key: string): { low: number; high: number } | undefined {
  const raw = flags[key];
  if (raw === undefined) return undefined;
  const parts = raw.split(',').map((s) => Number(s.trim()));
  if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n))) {
    throw new UsageError(`--${key} takes two numbers: <min>,<max>`);
  }
  if (parts[1] < parts[0]) throw new UsageError(`--${key} ${JSON.stringify(raw)}: the minimum must not exceed the maximum`);
  return { low: parts[0], high: parts[1] };
}

export function cmdPose(flags: Record<string, string>): void {
  if (flags.images === undefined) throw new UsageError('pose needs --images <dir> — the directory the loose part PNGs are in');
  if (flags.frame === undefined) throw new UsageError('pose needs --frame <path> — one pose frame to read the placements out of');
  const options: PoseOptions = { imagesDir: flags.images, framePath: flags.frame };
  const scale = readRange(flags, 'scale');
  if (scale) {
    if (scale.low <= 0) throw new UsageError('--scale minimum must be greater than zero');
    options.scale = { min: scale.low, max: scale.high };
  }
  const rotation = readRange(flags, 'rotation');
  if (rotation) {
    if (rotation.high - rotation.low > 360) throw new UsageError('--rotation cannot span more than a full turn');
    options.rotation = { minDeg: rotation.low, maxDeg: rotation.high };
  }
  if (flags['max-residual'] !== undefined) {
    const value = Number(flags['max-residual']);
    if (!Number.isFinite(value) || value <= 0 || value > 1) throw new UsageError('--max-residual must be a number in (0, 1]');
    options.maxResidual = value;
  }

  console.log('rigc pose');
  const report = estimatePose(options);
  for (const line of poseLines(report)) console.log(line);

  // Same `--out` shape as `preview` and `vote`: one file, and a directory means
  // "the default name in here" rather than a report written over a directory.
  const target = resolve(flags.out ?? DEFAULT_POSE_OUT);
  const out = existsSync(target) && statSync(target).isDirectory() ? join(target, DEFAULT_POSE_OUT) : target;
  writeJson(out, report);
}

export function cmdChainFit(flags: Record<string, string>): void {
  if (flags.candidate === undefined) {
    throw new UsageError('chainfit needs --candidate <dir | skeleton.json> — the compiled rig to read the frame through');
  }
  if (flags.images === undefined) {
    throw new UsageError("chainfit needs --images <dir> — where the candidate's attachment image names resolve to PNGs");
  }
  if (flags.frame === undefined) throw new UsageError('chainfit needs --frame <path> — one pose frame to read the placements out of');
  // Refused rather than ignored. Every other --candidate command takes --atlas, so
  // passing it here is a reasonable thing to try — and a flag that silently does
  // nothing is worse than one that says why it cannot.
  if (flags.atlas !== undefined) {
    throw new UsageError(
      'chainfit reads no atlas: the part art comes from --images, one PNG per attachment image name, and the ' +
        'skeleton is all it needs of the candidate. Drop --atlas',
    );
  }
  // The candidate through the one statement of a build (issue #1046): a path, or a directory holding no skeleton.json,
  // is refused here as by every command that takes a build, rather than by `src/chainfit.ts`'s own reader in its own words.
  resolveBuild(flags.candidate, undefined);
  const options: ChainFitOptions = {
    candidatePath: flags.candidate,
    imagesDir: flags.images,
    framePath: flags.frame,
  };
  if (flags.anchor !== undefined) options.anchorPath = flags.anchor;
  const hinge = readRange(flags, 'hinge');
  if (hinge) {
    if (hinge.high - hinge.low > 360) throw new UsageError('--hinge cannot span more than a full turn');
    options.hinge = { minDeg: hinge.low, maxDeg: hinge.high };
  }
  if (flags.stretch !== undefined) {
    const value = Number(flags.stretch);
    if (!Number.isFinite(value) || value < 1) throw new UsageError('--stretch must be a ratio of 1 or more, e.g. 1.25');
    options.stretch = value;
  }
  if (flags['min-visible'] !== undefined) {
    const value = Number(flags['min-visible']);
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new UsageError('--min-visible must be a number in [0, 1]');
    options.minVisible = value;
  }
  if (flags['max-residual'] !== undefined) {
    const value = Number(flags['max-residual']);
    if (!Number.isFinite(value) || value <= 0 || value > 1) throw new UsageError('--max-residual must be a number in (0, 1]');
    options.maxResidual = value;
  }
  if (flags.passes !== undefined) {
    const value = Number(flags.passes);
    if (!Number.isInteger(value) || value < 1 || value > 8) throw new UsageError('--passes must be a whole number in 1..8');
    options.passes = value;
  }
  if (flags['inward-lever'] !== undefined) {
    const value = Number(flags['inward-lever']);
    if (!Number.isFinite(value) || value < 0) throw new UsageError('--inward-lever must be a number of frame pixels, 0 or more');
    options.minLeverPx = value;
  }
  if (flags['anchor-residual'] !== undefined) {
    const value = Number(flags['anchor-residual']);
    if (!Number.isFinite(value) || value <= 0 || value > 1) throw new UsageError('--anchor-residual must be a number in (0, 1]');
    options.anchorMaxResidual = value;
  }
  const scale = readRange(flags, 'scale');
  if (scale) {
    if (scale.low <= 0) throw new UsageError('--scale minimum must be greater than zero');
    options.scale = { min: scale.low, max: scale.high };
  }
  const rotation = readRange(flags, 'rotation');
  if (rotation) {
    if (rotation.high - rotation.low > 360) throw new UsageError('--rotation cannot span more than a full turn');
    options.rotation = { minDeg: rotation.low, maxDeg: rotation.high };
  }

  console.log('rigc chainfit');
  const report = estimateChainFit(options);
  for (const line of chainFitLines(report)) console.log(line);

  const target = resolve(flags.out ?? DEFAULT_CHAINFIT_OUT);
  const out = existsSync(target) && statSync(target).isDirectory() ? join(target, DEFAULT_CHAINFIT_OUT) : target;
  writeJson(out, report);
}

/**
 * Refuse a compiled pair whose art `explain` cannot pose through, by name.
 *
 * 🚨 `explain` poses the rig — `deformReportLines` measures what each deform key
 * did — and spine-core's reading of the pair resolves EVERY attachment against
 * the atlas, whether or not anything deforms it. (Since issue #1019 a build's
 * survey is read off its model document and posed by the core, which resolves
 * nothing against the atlas; spine-core reads it under `--poser spine` and on a
 * fallback, and this refusal is unchanged and comes before either.) On the specs
 * `ingest --art none` writes there is nothing to resolve against: the entries
 * state a size and name no `image`, so the compile atlases nothing, and the load
 * threw the runtime's own `Region not found in atlas: rear-upper-arm (attachment:
 * rear-upper-arm)` with a spine-core stack trace under it and exit 1 (measured on
 * `examples/spineboy/export/spineboy-ess.json`, issue #697). That is the tool
 * telling an agent about its own internals instead of about the rig, on the one
 * input `docs/INGEST.md` §2.0 documents as the route through a foreign skeleton.
 *
 * ⭐ Both halves of the join are rigc's own readers rather than a second opinion
 * on somebody else's format: the walk is `attachmentRegionJoins`, which `PS127`
 * measures against the loader's own `findRegion` calls, and the region names come
 * from `parseAtlasText`, which is what `--atlas-in` already resolves against.
 * Names are compared EXACTLY — as `A08` compares them and as `findRegion`
 * matches them — so a padded region name is a miss on both sides.
 *
 * ⚠️ What it deliberately does not do is catch the pose. A blanket `try` around
 * `skeletonDataFromText` would convert any exception the runtime raises into a
 * sentence claiming the cause is missing art, and a rigc defect reported under
 * somebody else's name is the doctrine's second bullet inverted. This refuses
 * the case it can NAME, before a line of the report is printed, and leaves
 * anything else to arrive as itself.
 */
function refuseUnposableArt(result: CompileResult, opts: CompileOptions): void {
  const regionNames = parseAtlasText(result.atlasText).pages.flatMap((page) => page.regions.map((region) => region.name));
  const have = new Set(regionNames);
  const misses: Array<{ at: string; attachment: string; lookup: string }> = [];
  let lookups = 0;
  for (const join of attachmentRegionJoins(JSON.parse(result.skeletonText))) {
    // A `sequence` this walk will not guess at names no region it can check, and
    // `A08` passes over it for the same reason.
    if (join.lookups === null) continue;
    for (const lookup of join.lookups) {
      lookups++;
      if (!have.has(lookup)) {
        misses.push({
          at: `skin "${join.skin}" slot "${join.slot}" placeholder "${join.placeholder}"`,
          attachment: join.name,
          lookup,
        });
      }
    }
  }
  if (misses.length === 0) return;
  const first = misses[0];
  // Reported because it was measured, and absent where there is none — `A08`'s
  // own near-miss clause, in `A08`'s own words.
  const near = regionNames.find((region) => region.trim().toLowerCase() === first.lookup.toLowerCase());
  const has =
    regionNames.length === 0
      ? 'it declares no region at all'
      : `it declares ${regionNames.length} region(s) and none of them is that${
          near === undefined ? '' : `, though it does have ${JSON.stringify(near)}`
        }`;
  const remedy =
    opts.atlasInPath === undefined
      ? 'Art reaches a compile two ways and this run took neither: `--atlas-in <pack.atlas>` resolves the parts ' +
        'against a pack somebody already made, and an "image" per attachment resolves them as loose PNGs under ' +
        '`--images <dir>` — a spec that states a size and names no image is what `ingest --art none` writes, and ' +
        '`--atlas-in` is what reads it'
      : `Either the spec's region name or ${opts.atlasInPath} is the one that moved: fix the name, or point ` +
        '`--atlas-in` at the pack that has it';
  throw new ExplainError(
    `${first.at}: attachment ${JSON.stringify(first.attachment)} wants region ${JSON.stringify(first.lookup)}, ` +
      `which this build's atlas does not have (${has}). \`explain\` poses the rig to measure its deform keys and a ` +
      `pose resolves every attachment against the atlas, so there is nothing to pose it against. ${remedy}. ` +
      `${misses.length} of ${lookups} attachment lookup(s) here resolve to no region.`,
  );
}

export function cmdExplain(flags: Record<string, string>): void {
  // `--poser` is refused by its spelling before anything compiles (issue #1019): it chooses the deform survey's reader and poser.
  const poser = readPoserFlag(flags);
  // `--lever-fold` is refused by its value before anything compiles, too (issue #1427): the fraction is the caller's and
  // has no default, so a value that is not one is a usage error rather than a reading taken at a guess.
  const leverFold = flags['lever-fold'] === undefined ? null : Number(flags['lever-fold']);
  const leverWhy = leverFold === null ? null : leverFractionWhy(leverFold);
  if (leverWhy !== null) throw new UsageError(`--lever-fold ${JSON.stringify(flags['lever-fold'])}: ${leverWhy}`);
  const { label, opts } = resolveCut(flags, 'explain');
  console.log(`rigc explain ${label}`);
  // See the identical pair of lines in `cmdBuild` for why both paths are named
  // here rather than only the one the header's `label` happens to carry.
  console.log(`  ..    rig    ${opts.rigPath}`);
  console.log(`  ..    motion ${opts.motionPath}`);
  const result = compile(opts);
  // Before a line of the report, rather than at the pose two hundred lines in:
  // the blocks that need the art — DEFORM, meshes, dropped states — all sit
  // BELOW the pose, so a run that printed the bone and timeline dump and then
  // refused would be a report missing everything the missing art decides, with
  // the sentence saying so scrolled off the top. It is the invocation that has
  // to change, so it is refused before the report it cannot finish (issue #697).
  refuseUnposableArt(result, opts);
  // 📐 **A page whose file is not its declared size is said where the report
  // starts, and nothing is refused for it** (issue #750). `explain` never
  // gates, so on such a pack nothing stood between the region lift and the
  // figures it fed: the mesh block printed a fit taken off another part of the
  // page. The pack still compiles — a runtime draws it, and most of this report
  // (bones, slots, timelines) reads no texel at all — so the page is named
  // here, once, with the ratio `A06` refuses it by, and every figure that WOULD
  // have been taken off its texels is withheld on its own line and says so.
  // `build` prints no such line: `A06` is its statement of the same fact.
  for (const grid of result.pageGrids) {
    console.log(
      `  ..    ${grid.said}: every figure below taken off this page's texels is withheld, and says so where it ` +
        `would have stood. ${PAGE_GRID_UNLOCATED}`,
    );
  }
  // `compile` has already parsed this file, so the read below cannot fail — but
  // it goes through the same parser rather than a cast, because the cast was the
  // last one in the repository and issue #307 was about exactly that.
  const motion = parseMotionSpec(readJsonFile(opts.motionPath), opts.motionPath);

  // A rig may state that it has no stage at all (issue #578), and the two must
  // not print alike: `undefined x undefined` is what a template does with an
  // absence, and it reads like a defect in the tool rather than a claim in the
  // spec. The stage is the model's (issue #907): the header's box is the
  // setup-pose bounding box, which is not the stage and is not printed as it.
  const stage = result.model.stage === null ? 'none declared' : `${result.model.stage.width} x ${result.model.stage.height}`;
  console.log(`\nstage  ${stage}  (spine ${result.skeleton.skeleton.spine})`);

  // The crop note describes where the numbers CAME from, and without a manifest
  // they came from the rig spec's own literals — there is no crop to be relative
  // to. Printing it anyway told a rung-3 author their bone positions were in a
  // coordinate system that did not exist in their rig.
  const frame = opts.manifestPath ? '  (crop y-down -> spine y-up, origin at the bottom-left of the crop)' : '  (spine world: y up)';
  console.log(`\nbones${frame}`);
  for (const b of result.skeleton.bones) {
    // `rotation` is the axis keystone and the grips' radial facing, so it earns
    // a column even though it is absent on most bones.
    const rot = b.rotation === undefined ? '' : `  rotation=${b.rotation}`;
    console.log(`  ${b.name.padEnd(12)} parent=${(b.parent ?? '-').padEnd(10)} x=${b.x ?? 0} y=${b.y ?? 0}${rot}`);
  }

  console.log('\nslots  (array order IS the draw order)');
  // The DEFAULT skin's placeholders, resolved by name. It was `skins[0]` until
  // issue #541, which is the same thing only because rigc pins `default` at
  // index 0 — a property of the emitter that this report should not be quietly
  // relying on. Reading it by name means a change to the skins ORDER cannot turn
  // this line into a report about some other skin.
  const defaultSkin = result.skeleton.skins.find((skin) => skin.name === 'default');
  // ...and a skeleton may declare none (issue #801), in which case every
  // `attachments=[]` below is true and says nothing — so the line above the
  // column says where the placeholders are instead of letting it read as
  // "this rig has no art".
  if (defaultSkin === undefined) {
    const names = result.skeleton.skins.map((skin) => JSON.stringify(skin.name));
    console.log(
      `  (this skeleton declares no default skin, so the attachments column lists none; its placeholders are in ` +
        `${names.length === 0 ? 'no skin at all' : `the named skin(s) ${names.join(', ')}`})`,
    );
  }
  for (const s of result.skeleton.slots) {
    const atts = Object.keys(defaultSkin?.attachments[s.name] ?? {});
    console.log(
      `  ${s.name.padEnd(12)} bone=${s.bone.padEnd(12)} setup=${(s.attachment ?? 'null').padEnd(22)} color=${s.color ?? 'ffffffff'}  attachments=[${atts.join(', ')}]`,
    );
  }

  console.log('\nanimations');
  for (const [animName, anim] of Object.entries(result.skeleton.animations)) {
    const spec = motion.animations[animName];
    console.log(`  ${animName}  declared=${spec.duration}s loop=${spec.loop}`);
    for (const [boneName, timelines] of Object.entries(anim.bones ?? {})) {
      // "(mesh tier)" is a claim about what the bone DRIVES, and it was printed
      // on every bone track regardless — which reads, on a rig with no mesh in
      // it at all, as though the track were deforming one.
      const drives = result.meshBones.includes(boneName) ? '  <- drives a mesh' : '';
      for (const [timelineName, keys] of Object.entries(timelines)) {
        console.log(`    ${boneName}.${timelineName}  ${keys.length} key(s)${drives}`);
        if (timelineName === 'scale') console.log(`      ${SCALE_PRODUCT_NOTE}`);
        for (const emitted of keys) {
          // Every channel, as the parser reads it: a channel at its parser
          // default is not in the file (issue #716), and this list shows the
          // value a reader has to reason about rather than the bytes.
          const key = asParsed(`bone ${timelineName} key`, emitted);
          const fields = Object.entries(key)
            .filter(([k]) => k !== 'time' && k !== 'curve')
            .map(([k, v]) => `${k}=${String(v)}`)
            .join(' ');
          const curve = Array.isArray(key.curve)
            ? `bezier[${key.curve.length}]`
            : key.curve === 'stepped'
              ? 'stepped'
              : 'linear';
          console.log(`      t=${String(key.time).padEnd(7)} ${fields.padEnd(30)} ${curve}${scaleProduct(timelineName, key)}`);
        }
      }
    }
    for (const [slotName, timelines] of Object.entries(anim.slots ?? {})) {
      for (const [timelineName, keys] of Object.entries(timelines)) {
        console.log(`    ${slotName}.${timelineName}  ${keys.length} key(s)`);
        for (const emitted of keys) {
          const key = asParsed(`slot ${timelineName} key`, emitted);
          const curve = key.curve;
          const shape = Array.isArray(curve)
            ? `bezier[${curve.length}] ${curve.slice(12).join(', ')}  <- alpha channel, absolute (t,v)`
            : curve === 'stepped'
              ? 'stepped'
              : timelineName === 'attachment'
                ? 'stepped (attachment timelines always are)'
                : 'linear';
          const value = 'color' in key ? `#${String(key.color)}` : `attachment=${String(key.name)}`;
          console.log(`      t=${String(key.time).padEnd(7)} ${value.padEnd(30)} ${shape}`);
        }
      }
    }
    // The two constraint groups: one unnamed timeline per constraint, so the
    // name printed is the constraint's and there is no timeline name to print
    // beside it. Every field a key carries is shown, because each one is
    // optional in the file and the ABSENT ones are what a reader has to see —
    // an omitted `softness` is 0, not "unchanged".
    for (const group of ['ik', 'transform'] as const) {
      for (const [name, keys] of Object.entries(anim[group] ?? {})) {
        console.log(`    ${group}.${name}  ${keys.length} key(s)  <- one timeline per constraint`);
        for (const key of keys) {
          const fields = Object.entries(key)
            .filter(([k]) => k !== 'time' && k !== 'curve')
            .map(([k, v]) => `${k}=${String(v)}`)
            .join(' ');
          const curve = Array.isArray(key.curve) ? `bezier[${key.curve.length}]` : key.curve === 'stepped' ? 'stepped' : 'linear';
          console.log(`      t=${String(keyTimeOf(`${group} key`, key)).padEnd(7)} ${(fields || '(all defaults)').padEnd(46)} ${curve}`);
        }
      }
    }
    // The other two constraint groups. These DO carry a timeline name under the
    // constraint (`path.<name>.position`), which is the physics shape rather
    // than the ik/transform one, so the name printed is both.
    for (const group of ['path', 'slider'] as const) {
      for (const [name, timelines] of Object.entries(anim[group] ?? {})) {
        for (const [timelineName, keys] of Object.entries(timelines)) {
          console.log(`    ${group}.${name}.${timelineName}  ${keys.length} key(s)`);
          for (const key of keys) {
            const fields = Object.entries(key)
              .filter(([k]) => k !== 'time' && k !== 'curve')
              .map(([k, v]) => `${k}=${String(v)}`)
              .join(' ');
            const curve = Array.isArray(key.curve) ? `bezier[${key.curve.length}]` : key.curve === 'stepped' ? 'stepped' : 'linear';
            console.log(`      t=${String(keyTimeOf(`${group} ${timelineName} key`, key)).padEnd(7)} ${(fields || '(all defaults)').padEnd(46)} ${curve}`);
          }
        }
      }
    }
    // Deform timelines are keyed on a skin/slot/attachment triple, and the run
    // is printed as its span rather than its numbers: `offset` plus a length is
    // what tells a reader whether the key lands where they meant, and a hundred
    // vertex offsets on one line tells them nothing.
    for (const [skinName, slotMap] of Object.entries(anim.attachments ?? {})) {
      for (const [slotName, attMap] of Object.entries(slotMap)) {
        for (const [attName, timelines] of Object.entries(attMap)) {
          for (const [timelineName, keys] of Object.entries(timelines)) {
            console.log(`    ${skinName}/${slotName}/${attName}.${timelineName}  ${keys.length} key(s)`);
            for (const emitted of keys) {
              const key = asParsed(`attachment ${timelineName} key`, emitted);
              const run = Array.isArray(key.vertices) ? (key.vertices as number[]) : null;
              const offset = typeof key.offset === 'number' ? key.offset : 0;
              const span = run
                ? `deform[${offset}..${offset + run.length}]  ${run.length / 2} pair(s)`
                : 'back to the setup pose';
              const curve = Array.isArray(key.curve) ? `bezier[${key.curve.length}]` : key.curve === 'stepped' ? 'stepped' : 'linear';
              console.log(`      t=${String(key.time).padEnd(7)} ${span.padEnd(46)} ${curve}`);
              // A generated key prints its MODEL and then every offset the model
              // produced (issue #294). Both halves are the point: the model is
              // what a reviewer checks a claim against, and the offsets are what
              // reaches the file — printing only the first would ask a reader to
              // trust an evaluation they cannot see, which is the gap FACE §9.3
              // records. The numbers are the emitted ones, not a second
              // evaluation, so this block and the artifact cannot disagree.
              const gen = result.deformTransforms.find(
                (g) => g.animation === animName && g.skin === skinName && g.slot === slotName && g.attachment === attName && g.time === key.time,
              );
              if (gen === undefined) continue;
              console.log(`               transform ${gen.kind}  ${gen.stated}`);
              console.log(`               ${gen.formula}`);
              for (const line of gen.derived) console.log(`                 ${line}`);
              // The envelope's weights, one per vertex, because they are half
              // of every number below (issue #1413): each offset is
              // round(w × the un-enveloped offset), and a reader holding these
              // and the model reproduces the run without a second evaluation.
              if (gen.envelope !== undefined) {
                const env = gen.envelope;
                console.log(`               envelope  ${env.stated}`);
                console.log(`               ${env.formula}`);
                console.log(
                  `                 each offset below is round(w × the un-enveloped offset): ${env.zero} vertex(es) at w 0, ` +
                    `${env.full} at 1, ${gen.vertexCount - env.zero - env.full} between`,
                );
                for (let v = 0; v < env.weights.length; v += 8) {
                  const ws: string[] = [];
                  for (let k = v; k < Math.min(v + 8, env.weights.length); k++) ws.push(`v${String(k).padStart(3)} ${env.weights[k]}`);
                  console.log(`                 w  ${ws.join('  ')}`);
                }
              }
              console.log(
                `               ${gen.vertexCount} vertices, largest offset ${gen.maxOffset}px at vertex ${gen.maxOffsetVertex}`,
              );
              for (let v = 0; v < gen.vertexCount; v += 4) {
                const pairs: string[] = [];
                for (let k = v; k < Math.min(v + 4, gen.vertexCount); k++) {
                  pairs.push(`v${String(k).padStart(3)} (${gen.offsets[2 * k]}, ${gen.offsets[2 * k + 1]})`);
                }
                console.log(`                 ${pairs.join('  ')}`);
              }
              // On a multi-influence attachment those pairs are the model's
              // WORLD displacements, and the file holds one `Mᵢ⁻¹·D` pair per
              // influence instead (issue #389). Printing the first without the
              // second would put numbers on the screen that are nowhere in the
              // artifact — the exact gap this block exists to close.
              if (gen.expanded !== undefined) {
                console.log(
                  `               written as ${gen.expanded.length / 2} per-influence pair(s), each vertex's D through ` +
                    'its own bone inverse',
                );
                for (let i = 0; i < gen.expanded.length / 2; i += 4) {
                  const pairs: string[] = [];
                  for (let k = i; k < Math.min(i + 4, gen.expanded.length / 2); k++) {
                    pairs.push(`i${String(k).padStart(3)} (${gen.expanded[2 * k]}, ${gen.expanded[2 * k + 1]})`);
                  }
                  console.log(`                 ${pairs.join('  ')}`);
                }
              }
            }
          }
        }
      }
    }
    // The draw-order timeline names no target, so it hangs off the animation
    // rather than off a slot — and a timeline `explain` did not print would be a
    // timeline nobody could check without reading the emitted JSON.
    if (anim.drawOrder) {
      console.log(`    drawOrder  ${anim.drawOrder.length} key(s)  <- whole animation, offsets against the SETUP order`);
      for (const key of anim.drawOrder) {
        const offsets = Array.isArray(key.offsets)
          ? (key.offsets as Array<{ slot: string; offset: number }>)
              .map((o) => `${o.slot}${o.offset >= 0 ? '+' : ''}${o.offset}`)
              .join(' ')
          : 'back to the setup order';
        console.log(`      t=${String(keyTimeOf('drawOrder key', key)).padEnd(7)} ${offsets}`);
      }
    }
  }

  // The `MEMBER` block sits beside the `DEFORM` one and for the same reason:
  // both re-print timelines the reader has just read, in the arrangement the
  // question needs rather than the one the format has.
  for (const line of memberReportLines(result)) console.log(line);

  // The `DEFORM` block goes after the timelines and before the constraints,
  // because it is a measurement OF the deform timelines printed above — the keys
  // it names are the keys the reader has just read, by the same index.
  for (const line of deformReportLines(result, new Set(result.rig.deformMayFold), poser, label)) console.log(line);

  if (result.physics.length) {
    console.log('\nphysics constraints (4.3 top-level `constraints` array, type per entry)');
    for (const ph of result.physics) {
      console.log(`  ${ph.name.padEnd(12)} bone=${ph.bone.padEnd(14)} components=[${ph.components.join(', ')}] mix=${ph.mix} drivesMesh=${ph.drivesMesh}`);
    }
    // The whirl reading (issue #1423): how far each constraint's bone turns in one step, walked by the core from the
    // setup pose — `src/whirl.ts` says why that walk and not render's. It decides nothing, so it sits in the report
    // rather than in the gate, and explain's exit is the same whatever it prints.
    console.log(`\n${WHIRL_HEADER}`);
    let reading: WhirlAnimation[] | null = null;
    try {
      reading = whirlReading(readModel(modelDocument(result.model, result.skeletonText, result.atlasText), `the whirl reading of ${label}`));
    } catch (err) {
      if (!(err instanceof CoreInputError)) throw err;
      console.log(`  ..    turn     not read — the core refused the model document: ${err.message}`);
    }
    if (reading !== null && reading.length === 0) console.log('  ..    turn     not read — the skeleton declares no animation to walk');
    for (const line of whirlLines(reading ?? [])) console.log(`  ..    turn     ${line}`);
    // The lever reading (issue #1427): on the same walk, the steps a scaleX drive's inertia lever divides by a collapsed
    // divisor, and the steps its scale factor jumps. Only when asked for, because its fraction has no default —
    // and said so when not asked, rather than left out in silence.
    if (leverFold === null) {
      console.log('\n  ..    lever    not read — `--lever-fold <fraction>` states the fraction of its setup divisor a scaleX lever is named for dividing below, and it has no default');
    } else {
      console.log(`\n${leverHeader(leverFold)}`);
      let levers: LeverReading | null = null;
      try {
        levers = leverReading(readModel(modelDocument(result.model, result.skeletonText, result.atlasText), `the lever reading of ${label}`), leverFold);
      } catch (err) {
        if (!(err instanceof CoreInputError)) throw err;
        console.log(`  ..    lever    not read — the core refused the model document: ${err.message}`);
      }
      if (levers !== null && levers.animations.length === 0 && levers.unread.length < result.physics.length) console.log('  ..    lever    not read — the skeleton declares no animation to walk');
      for (const line of levers === null ? [] : leverLines(levers)) console.log(`  ..    lever    ${line}`);
    }
  }

  // Path constraints, with the curve each one follows MEASURED — its length and
  // its curve count are the two numbers an author cannot get from the spec, and
  // `position` means nothing without the first of them under `positionMode:
  // "percent"`. Read off the emitted attachment rather than recomputed here.
  const constraintsOf = (type: string) => (result.skeleton.constraints ?? []).filter((c) => c.type === type);
  const pathConstraints = constraintsOf('path');
  if (pathConstraints.length) {
    console.log('\npath constraints  (position is a fraction of the measured length under positionMode "percent")');
    for (const c of pathConstraints) {
      const slot = String(c.slot);
      const attachments = result.skeleton.skins.flatMap((skin) => Object.values(skin.attachments[slot] ?? {}));
      const curve = attachments.find((att) => (att as { type?: string }).type === 'path') as
        | { lengths?: number[]; closed?: boolean; constantSpeed?: boolean }
        | undefined;
      // `vertexCount / 3` entries on both shapes since issue #804, so an open
      // path's curves are one fewer than its entries and its length is the last
      // CURVE's entry — the trailing one is the wrap-around curve nothing reads.
      const lengths = (curve?.lengths ?? []).slice(0, curve?.closed ? undefined : -1);
      console.log(
        `  ${c.name.padEnd(12)} slot=${slot.padEnd(12)} bones=[${(c.bones as string[]).join(', ')}] ` +
          `position=${c.position ?? 0} ${String(c.positionMode ?? 'percent')}/${String(c.spacingMode ?? 'length')}/${String(c.rotateMode ?? 'tangent')}`,
      );
      console.log(
        `  ${''.padEnd(12)} curve: ${lengths.length} curve(s), ${lengths[lengths.length - 1] ?? 0} long, ` +
          `${curve?.closed ? 'closed' : 'open'}, constantSpeed=${curve?.constantSpeed ?? true}`,
      );
    }
  }

  const sliders = constraintsOf('slider');
  if (sliders.length) {
    console.log('\nsliders  (each applies one animation at a time it chooses)');
    for (const c of sliders) {
      const driver = c.bone === undefined ? `time=${c.time ?? 0} (keyed by slider.${c.name}.time)` : `bone=${String(c.bone)}.${String(c.property)}`;
      console.log(
        `  ${c.name.padEnd(12)} applies=${String(c.animation).padEnd(14)} ${driver}  ` +
          `mix=${c.mix ?? 1} loop=${c.loop ?? false} additive=${c.additive ?? false}`,
      );
    }
  }

  // Which bones and constraints a skin switches on. Printed because the pairing
  // with `skin: true` is invisible in the emitted file: a member list and a
  // skinRequired flag are two keys in two places, and only together do they mean
  // "this bone belongs to this skin".
  const skinMembers = result.skeleton.skins.filter((skin) => skin.bones?.length || skin.ik?.length || skin.transform?.length || skin.path?.length || skin.physics?.length || skin.slider?.length);
  if (skinMembers.length) {
    console.log('\nskin members  (skinRequired bones and constraints, active only under their own skin)');
    for (const skin of skinMembers) {
      const lists = (['bones', 'ik', 'transform', 'path', 'physics', 'slider'] as const)
        .filter((key) => skin[key]?.length)
        .map((key) => `${key}=[${skin[key]!.join(', ')}]`)
        .join(' ');
      console.log(`  ${skin.name.padEnd(12)} ${lists}`);
    }
  }

  printAlphaClips(result);
  if (result.meshes.length) {
    console.log('\nmeshes');
    for (const kind of new Set(result.meshes.map((m) => m.kind))) console.log(`  ${MESH_KIND_NOTES[kind]}`);
    for (const m of result.meshes) {
      // The depth block belongs here more than it belongs in `build`: `explain`
      // is the command that says what a spec MEANS, and the turn ceiling is the
      // number an author needs before writing a key rather than after a refusal.
      // It was absent, while `docs/AUTHORING.md` said both commands printed it.
      console.log(
        `  ${m.slot.padEnd(12)} ${m.kind.padEnd(8)} ${m.vertices} vertices / ${m.triangles} triangles  ` +
          `${meshBudget(result.rig)}  bones=[${m.bones.join(', ')}]${meshFit(m)}` +
          meshDepthNote(m) +
          meshInfluenceNote(m),
      );
    }
  }

  if (result.droppedStates.length) {
    // The heading said "no PNG on disk" and the line printed the path, on a
    // command that takes `--atlas-in` like `build` does — so an explain of a
    // pack build named a file it never opened. Same renderer as the other two
    // printers now, for the same reason they share one (issue #671).
    console.log('\ndropped states (listed in the manifest, no art behind them)');
    for (const d of result.droppedStates) console.log(`  ${d.slot}/${d.state}  ${droppedStateReason(d)}`);
  }

  console.log('\nmix table (player config, not skeleton JSON)');
  console.log(`  default=${motion.mix?.default ?? 0} pairs=${JSON.stringify(motion.mix?.pairs ?? [])}`);
}

/**
 * ingest — a skeleton back into the two specs that rebuild it.
 *
 * The only command that runs against `build`'s direction, and the contract is an
 * equality rather than a rulebook: `build(ingest(A))` is `A`. Everything it
 * cannot carry is a **finding** printed here with its code, because those lines
 * are what tells an author what the rebuilt rig will not have — they are this
 * command's whole UI, exactly as the validator's messages are `build`'s.
 *
 * ⚠️ It writes both specs even when a blocker was found, and then exits
 * non-zero: a blocker means the rebuild will not be the file that was read, and
 * the useful thing at that point is the spec plus the list of what is missing
 * from it. `build`'s "nothing written" rule is not this rule — that one is about
 * a **gated artifact** on disk, and these two files are inputs to the gate
 * rather than output of it.
 */
export function cmdIngest(flags: Record<string, string>, positional: string[]): void {
  const [source] = positional;
  if (!source) throw new UsageError('ingest takes one path: <skeleton.json>');
  const skeletonPath = resolve(source);
  if (!existsSync(skeletonPath)) throw new UsageError(`nothing at ${skeletonPath}`);
  // The same sentence `resolveArtifacts` refuses a `.spine` with, for the same
  // reason (docs/INGEST.md §5): this reads Spine 4.3 skeleton JSON and nothing
  // else — not a project file, not a binary `.skel`, not the atlas.
  if (!skeletonPath.endsWith('.json')) {
    throw new UsageError(
      `${skeletonPath} is not a .json skeleton — ingest reads Spine 4.3 skeleton JSON and nothing else: not a ` +
        '.spine project, not a binary .skel, not an atlas. Re-export as JSON',
    );
  }
  if (flags.out === undefined) throw new UsageError('ingest needs --out <dir> — the directory to write rig.json and motion.json into');
  const art = flags.art ?? 'loose';
  if (art !== 'loose' && art !== 'none') {
    throw new UsageError(
      `--art is ${JSON.stringify(art)}; it is "loose" (name an image per attachment, for \`build --images <dir>\`) ` +
        'or "none" (state width/height only, for `build --atlas-in <pack>`). A skeleton encodes neither, which is ' +
        'why this is a flag',
    );
  }
  let stage: IngestStage | undefined;
  if (flags.stage !== undefined) {
    const parts = flags.stage.split(',').map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
      throw new UsageError(`--stage is ${JSON.stringify(flags.stage)}; give four numbers, x,y,width,height`);
    }
    stage = { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
  }
  const outDir = resolve(flags.out);
  /**
   * The rig spec's own `images`, spelled from `--out` the way `build` spells
   * `skeleton.images` from its own output directory — the SAME function, so the
   * two conventions cannot drift (issue #595). Without it the field is left out,
   * an `image` name resolves against the spec's own directory, and every rebuild
   * of the spec has to carry `build --images <dir>`.
   */
  let specImages: string | undefined;
  if (flags.images !== undefined) {
    // Refused rather than ignored, for the reason `chainfit` refuses `--atlas`:
    // a flag that silently does nothing is worse than one that says why it
    // cannot. Measured — an `--art none` spec rebuilt with `--images` naming a
    // directory that does not exist is byte-identical to one rebuilt without
    // it, because no attachment carries an `image` for that directory to be the
    // base of.
    if (art === 'none') {
      throw new UsageError(
        '--images <dir> and --art none contradict: `none` writes width/height and no `image` at all, so the rig ' +
          "spec's `images` directory would be the base of nothing and no rebuild would read it. Use --art loose to " +
          'name an image per attachment, or drop --images — an `--art none` spec rebuilds with `build --atlas-in ' +
          '<pack.atlas>`',
      );
    }
    // Not checked for existence, deliberately: `ingest` reads the skeleton and
    // nothing else, so the parts may well be extracted AFTER the specs are
    // written, and refusing a directory this command never opens would refuse a
    // legitimate order of work. `build` is where a missing PNG is named.
    specImages = relativeImagesPath(outDir, resolve(flags.images));
  }
  console.log(`rigc ingest ${skeletonPath}`);
  console.log(`  ..    out  ${outDir}`);
  console.log(`  ..    art  ${art}`);
  if (specImages !== undefined) console.log(`  ..    images ${specImages}  (the rig spec's own, from ${outDir})`);

  /**
   * What the run has to report, however the parse went.
   *
   * 🔒 A spec the tree's own parser refuses is a **finding**, not an escape
   * (issue #692): the three files are written, the coded `BLOCK` line is
   * printed, and the exit code comes off the findings like every other run's.
   * The two specs are read as `unknown` because that is all this function does
   * with them — `JSON.stringify` — and a cast to `RigSpec` here would be this
   * file claiming a parse that did not happen.
   */
  // A rigc build's stage is the model document's beside it, when that document is this skeleton's (issue #907): its header is the
  // setup-pose bounding box. An export, or a skeleton with no such document, is read off its header.
  const documentStage = documentStageBeside(skeletonPath, readFileSync(skeletonPath, 'utf8'));
  if (documentStage !== undefined) {
    console.log(`  ..    stage  ${documentStage === null ? 'none declared' : `${documentStage.width} x ${documentStage.height}`} — read from the ${MODEL_DOCUMENT_FILE} beside it (its spine.sha256 is this skeleton's); the header's box is the setup-pose bounding box`);
  }
  if (flags['stage-box'] !== undefined) console.log(`  ..    stage  read from the bounding box in slot "${flags['stage-box']}" (--stage-box); the header's box is the setup-pose bounding box`);
  let result: { rig: unknown; motion: unknown; findings: IngestFinding[] };
  try {
    result = ingest(readJsonFile(skeletonPath), {
      ...(documentStage === undefined ? {} : { documentStage }),
      name: flags.name ?? basename(skeletonPath, '.json'),
      art,
      images: specImages,
      stage,
      ...(flags['stage-box'] === undefined ? {} : { stageBox: flags['stage-box'] }),
      source: basename(skeletonPath),
      version: readVersion(),
    });
  } catch (err) {
    if (!(err instanceof IngestSpecRefused)) throw err;
    result = { rig: err.rig, motion: err.motion, findings: err.findings };
  }

  mkdirSync(outDir, { recursive: true });
  // Indent 2, which is what `compile` writes the skeleton with. One emitter
  // convention, so a spec and the skeleton it came from read the same way.
  writeFileSync(join(outDir, 'rig.json'), `${JSON.stringify(result.rig, null, 2)}\n`);
  writeFileSync(join(outDir, 'motion.json'), `${JSON.stringify(result.motion, null, 2)}\n`);
  writeFileSync(join(outDir, 'findings.json'), `${JSON.stringify(result.findings, null, 2)}\n`);

  // Grouped by kind rather than printed in discovery order: a blocker is what
  // decides the exit code, and a reader scanning for one should not have to
  // read past a hundred DURATION lines to find it.
  // The gutter words are `INGEST_GUTTERS`, which is also the column
  // `docs/INGEST.md` §2.0's finding-code table is keyed on (issue #675); the
  // line, its pad and its pointer to the code's row are `findingLine`'s (#1397).
  for (const kind of ['blocker', 'judgement', 'lossy'] as const) {
    for (const finding of result.findings.filter((f) => f.kind === kind)) console.log(findingLine(finding));
  }
  console.log(`rigc: wrote ${join(outDir, 'rig.json')}`);
  console.log(`rigc: wrote ${join(outDir, 'motion.json')}`);
  console.log(`rigc: wrote ${join(outDir, 'findings.json')}`);
  // The hint is the command the caller will actually run, so it drops `--images`
  // exactly when the spec now carries the directory itself — a hint that asks for
  // a flag the spec made unnecessary is the defect issue #595 is about, printed.
  const artFlag = art === 'none' ? ' --atlas-in <pack.atlas>' : specImages === undefined ? ' --images <dir>' : '';
  console.log(
    `rigc: build it with  rigc build --rig ${join(outDir, 'rig.json')} --motion ${join(outDir, 'motion.json')}` +
      `${artFlag} --out <dir>`,
  );

  const blockers = result.findings.filter((f) => f.kind === 'blocker');
  if (blockers.length > 0) {
    console.error(
      `rigc: ${blockers.length} blocker(s) — both specs were written, and a build from them will NOT be the ` +
        `skeleton that was read (${[...new Set(blockers.map((f) => f.code))].join(', ')})`,
    );
    process.exit(1);
  }
}

/** What `rigc skills` offers. One today; the list is what the refusal of any other word prints. */
const SKILLS_SUBCOMMANDS = ['install'];

type SkillsInstallAction = 'linked' | 'copied' | 'already linked' | 'already copied';

interface SkillsInstallEntry {
  /** `<dir>/<name>`. */
  target: string;
  /** `<package>/skills/<name>`. */
  source: string;
  action: SkillsInstallAction;
  /** The link text, relative to the directory it sits in, when the entry is a link. */
  link: string;
}

/** Every `<name>/` under `source` that holds a `SKILL.md`, in name order, so two runs print the same lines. */
function shippedSkills(source: string): string[] {
  if (!existsSync(source) || !statSync(source).isDirectory()) return [];
  return readdirSync(source)
    .filter((name) => statSync(join(source, name)).isDirectory() && existsSync(join(source, name, 'SKILL.md')))
    .sort();
}

/**
 * The real path of `path` whether or not it exists yet: the real path of its
 * nearest existing ancestor with the rest appended. A relative link has to be
 * computed between two paths spelled the same way, and on macOS the temp
 * directory alone is reached as `/var/…` and is really `/private/var/…`.
 */
function realpathAhead(path: string): string {
  const rest: string[] = [];
  let at = resolve(path);
  while (!existsSync(at)) {
    const up = dirname(at);
    if (up === at) break;
    rest.unshift(basename(at));
    at = up;
  }
  return join(realpathSync(at), ...rest);
}

/** Every file under `root`, relative and sorted, so two trees compare in one order. */
function filesUnder(root: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(root, prefix)).sort()) {
    const rel = prefix === '' ? name : `${prefix}/${name}`;
    if (lstatSync(join(root, rel)).isDirectory()) out.push(...filesUnder(root, rel));
    else out.push(rel);
  }
  return out;
}

/** The first way `copy` differs from `original`, or null when every file is the same bytes. */
function firstDifference(copy: string, original: string): string | null {
  const theirs = filesUnder(copy);
  const ours = filesUnder(original);
  for (const rel of ours) {
    if (!theirs.includes(rel)) return `${rel} is missing from it`;
    if (!readFileSync(join(copy, rel)).equals(readFileSync(join(original, rel)))) return `${rel} differs`;
  }
  for (const rel of theirs) if (!ours.includes(rel)) return `${rel} is in it and not in the package`;
  return null;
}

/**
 * Install every shipped skill into `dir`, or refuse and write nothing.
 *
 * The plan is made in full before the first write: every entry is classified as
 * absent, already this command's, or in the way, and one entry in the way
 * refuses the whole call with every such entry named.
 */
function installSkills(source: string, dir: string, copy: boolean): SkillsInstallEntry[] {
  const names = shippedSkills(source);
  if (names.length === 0) {
    throw new SkillsInstallError(
      `no skill to install: ${source} ${existsSync(source) ? 'holds no <name>/SKILL.md' : 'is not there'}, and it is ` +
        'the skills/ directory of the package this command ran from; nothing was written',
    );
  }
  if (existsSync(dir) && !statSync(dir).isDirectory()) {
    throw new SkillsInstallError(`${dir} exists and is not a directory, so no skill can be installed into it; nothing was written`);
  }
  const realDir = realpathAhead(dir);
  const planned: SkillsInstallEntry[] = [];
  const refused: string[] = [];
  for (const name of names) {
    const target = join(dir, name);
    const from = join(source, name);
    const realFrom = realpathSync(from);
    const link = relative(realDir, realFrom);
    let action: SkillsInstallAction = copy ? 'copied' : 'linked';
    let found: string | null = null;
    const stat = existsSync(target) || isLink(target) ? lstatSync(target) : null;
    if (stat === null) {
      // absent: this command writes it
    } else if (stat.isSymbolicLink()) {
      const text = readlinkSync(target);
      const pointsAt = resolve(realDir, text);
      const lands = existsSync(pointsAt) ? realpathSync(pointsAt) : null;
      if (lands === realFrom && !copy) action = 'already linked';
      else if (lands === realFrom) found = `a symlink to ${text}, the package's own folder, and --copy asks for a directory in its place`;
      else found = `a symlink to ${text}, ${lands === null ? 'which resolves to nothing' : `which resolves to ${lands}`}`;
    } else if (stat.isDirectory()) {
      const difference = copy ? firstDifference(target, from) : null;
      if (!copy) found = 'a directory';
      else if (difference === null) action = 'already copied';
      else found = `a directory that is not the package's copy (${difference})`;
    } else {
      found = 'a plain file';
    }
    if (found !== null) refused.push(`${target} is ${found}; ${copy ? `a copy of ${from}` : `a symlink to ${link}`} was required`);
    else planned.push({ target, source: from, action, link });
  }
  if (refused.length > 0) {
    throw new SkillsInstallError(
      `${refused.length} of the ${names.length} skill(s) cannot be installed into ${dir}, and nothing was written:\n` +
        refused.map((line) => `  ${line}`).join('\n') +
        '\nRemove the entries named above, or pass --dir to install somewhere else.',
    );
  }
  mkdirSync(dir, { recursive: true });
  for (const entry of planned) {
    if (entry.action === 'linked') symlinkSync(entry.link, entry.target, 'dir');
    else if (entry.action === 'copied') cpSync(entry.source, entry.target, { recursive: true, errorOnExist: true, force: false });
  }
  return planned;
}

/** A dangling link is not `existsSync`, and is still an entry in the way. */
function isLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

export function cmdSkills(flags: Record<string, string>, positional: string[]): void {
  const [sub, ...extra] = positional;
  if (sub === undefined) {
    throw new UsageError(
      `skills takes a subcommand: ${SKILLS_SUBCOMMANDS.join(', ')} — \`rigc skills install\` links every skill this ` +
        `package ships into ${DEFAULT_SKILLS_DIR}`,
    );
  }
  if (!SKILLS_SUBCOMMANDS.includes(sub)) {
    throw new UsageError(`unknown skills subcommand: ${sub} (rigc skills offers ${SKILLS_SUBCOMMANDS.join(', ')})`);
  }
  if (extra.length > 0) {
    throw new UsageError(
      `skills install takes no positional argument, and ${JSON.stringify(extra[0])} was given — the directory is --dir <path>`,
    );
  }
  const takes = COMMANDS.find((c) => c.name === 'skills')?.flags ?? [];
  const foreign = Object.keys(flags).filter((flag) => !takes.includes(flag));
  if (foreign.length > 0) {
    throw new UsageError(
      `skills install takes ${takes.map((flag) => `--${flag}`).join(' and ')}; ` +
        `${foreign.map((flag) => `--${flag}`).join(', ')} is not one of them`,
    );
  }
  const copy = flags.copy !== undefined;
  const dir = resolve(process.cwd(), flags.dir ?? DEFAULT_SKILLS_DIR);
  const entries = installSkills(join(PACKAGE_ROOT, 'skills'), dir, copy);
  for (const entry of entries) {
    const ends = entry.action.endsWith('linked') ? `${entry.target} -> ${entry.link}  (${entry.source})` : `${entry.target} <- ${entry.source}`;
    console.log(`  ${entry.action.padEnd(14)}  ${ends}`);
  }
  const wrote = entries.filter((entry) => entry.action === 'linked' || entry.action === 'copied').length;
  const verb = copy ? 'copied' : 'linked';
  console.log(
    wrote === 0
      ? `rigc skills install: nothing to do — all ${entries.length} skill(s) are already ${verb} into ${dir}`
      : `rigc skills install: ${wrote} of ${entries.length} skill(s) ${verb} into ${dir}` +
          (wrote < entries.length ? `, ${entries.length - wrote} already there` : ''),
  );
}

// ---------------------------------------------------------------------------
// guide — the row a failure line names, or one section (issue #1397)
// ---------------------------------------------------------------------------

/**
 * `rigc guide <RULE>` / `rigc guide §<n>[.<m>[.<k>]] [--all]`: a slice of the `docs/AUTHORING.md`
 * this package ships, read now — never a copy (`src/guide.ts` says why). A
 * finding code's table is read from the shipped document it lives in, and the
 * answer names that file.
 */
export function cmdGuide(flags: Record<string, string>, positional: string[]): void {
  const flagged = Object.keys(flags).filter((flag) => flag !== 'all');
  if (flagged.length > 0) throw new UsageError(`guide takes only --all, and ${flagged.map((f) => `--${f}`).join(', ')} was given — name one rule or one §section`);
  if (positional.length !== 1) {
    throw new UsageError(
      positional.length === 0
        ? 'guide takes one rule name — the one a failure line names before its colon — or one §<n> / §<n>.<m> / §<n>.<m>.<k>'
        : `guide takes one rule name or one §section, and ${positional.length} were given: ${positional.map((p) => JSON.stringify(p)).join(', ')}`,
    );
  }
  if (flags.all !== undefined && !positional[0].startsWith('§')) throw new UsageError(`guide --all takes a §section, and ${JSON.stringify(positional[0])} is a rule name — omit --all to read its row`);
  const elsewhere: Record<string, string> = {};
  for (const table of GUIDE_RULE_TABLES_ELSEWHERE) {
    const path = join(PACKAGE_ROOT, table.file);
    if (existsSync(path)) elsewhere[table.file] = readFileSync(path, 'utf8');
  }
  const answer = guideAnswer(positional[0], { guide: readFileSync(join(PACKAGE_ROOT, GUIDE_FILE), 'utf8'), elsewhere }, { all: flags.all !== undefined });
  if (!answer.ok) throw new GuideError(refusalLine(answer.rule, answer.detail));
  // One write of the whole answer, not `console.log`: a §section with `--all` runs past 64 KiB, which Bun 1.2.0's
  // console corrupts at a chunk boundary and a non-blocking pipe cuts short on every Bun (issue #1487, `writeWhole`).
  writeWhole(1, answer.lines.map((line) => `${line}\n`).join(''));
}

// ---------------------------------------------------------------------------
// build — the second entry's gate (issue #1060, step 4e of #380)
// ---------------------------------------------------------------------------

/**
 * The gate `cli_core.ts build` runs (`BuildGate`), where `cli.ts build` runs
 * the round trip: the model side over the document (`validateModel`), and the
 * round trip's own rules restated over the text the emitter wrote
 * (`validateEmittedText`) — A18 among them, comparing a second, independent
 * compile's skeleton, atlas and document byte for byte — with A00, spine-core's
 * parse, a SKIP naming it. One report, printed by the printer `cli.ts build`
 * prints with, and a line saying which rules ran here and which did not.
 *
 * ⚠️ The document the model side reads is the one this gate judges: spelled
 * from the atlas text the gate is handed, so under `--copy-images` it names
 * the pages where the compile measured them — the files the round trip's own
 * A17 reads on `cli.ts` — and A18 compares the documents as written, the
 * copies' names in them. Under `--pack` the two are one text.
 *
 * Exported for the selftest's `RPK` plants (issue #1169), which run `repack`
 * through this entry's dispatch with a hook between the lift and the build.
 */
export const MODEL_AND_TEXT_GATE: BuildGate = {
  supplier: 'model',
  heading: (profile) =>
    `  ..    validate (the model side over the document + the round trip's rules restated over the emitted text, profile ${profile}; this entry links no spine-core, so the round trip does not run)`,
  run: ({ result, atlasText, atlasDir, modelText, reEmit, profile }) => {
    const model = validateModel({ modelText: modelDocument(result.model, result.skeletonText, atlasText), atlasDir, profile });
    const text = validateEmittedText({ skeletonText: result.skeletonText, atlasText, modelText, reEmit, profile });
    const report = {
      failures: [...model.failures, ...text.failures],
      passed: [...model.passed, ...text.passed],
      skipped: [...model.skipped, ...text.skipped],
      profileSkipped: [...model.profileSkipped, ...text.profileSkipped],
      // The emitted text's figures first: they are the pair's (`pages` … `version`), which `validate()` writes
      // before any other, and the model side's follow in its order — one line, keyed and ordered as `cli.ts build`'s (issue #1114, `RC39`).
      stats: { ...text.stats, ...model.stats },
      profile,
    };
    for (const line of reportLines(report)) console.log(line);
    console.log(
      `  ..    ${Object.entries(report.stats)
        .map(([k, v]) => `${k}=${v}`)
        .join(' ')}`,
    );
    const ran = (r: { passed: string[]; failures: Array<{ assertion: string }>; skipped: Array<{ assertion: string }>; profileSkipped: Array<{ assertion: string }> }): number =>
      new Set([...r.passed, ...r.failures.map((f) => f.assertion), ...r.skipped.map((x) => x.assertion), ...r.profileSkipped.map((x) => x.assertion)]).size;
    const notRun = text.skipped.filter((x) => x.assertion === 'A00_ROUNDTRIP_PARSE').map((x) => x.assertion);
    // The line is spelled from the values the `--report` document carries as the gate's `here` (issue #1213).
    const here = { modelSide: ran(model), restated: ran(text) - notRun.length, notRun };
    console.log(
      `  ..    here: ${here.modelSide} rule(s) on the model side over the document, ${here.restated} of the round trip's own restated over the emitted text; ` +
        `not run: ${here.notRun.join(', ') || 'none'} — spine-core's parse, which only the entry that links spine-core runs, on build and validate: ` +
        `installed, the same \`rigc\` once @esotericsoftware/spine-core is installed beside the package; from a source checkout, \`bun cli.ts\``,
    );
    return { report, here };
  },
  look: (outDir) => `rigc: look at it: rigc render --candidate ${outDir}`,
};

/**
 * Where a delegated package's `package.json` resolves, or `null` (issue #1457).
 *
 * ⚖️ Node's `node_modules` lookup — `<dir>/node_modules/<package>` for the
 * directory and then each of its ancestors, nearest first — from two places in
 * this order, the first answer winning:
 *
 *   1. the working directory — the project `npm i -D <package>` installed it
 *      into, which is what the refusal tells a caller to run, so a project's
 *      own install is the one its command line reaches;
 *   2. this package's root — where an install of rig-c sits beside it in the
 *      same `node_modules` and the command was run from somewhere else.
 *
 * 🚨 Walked here rather than asked of the runtime's resolver: Bun's resolves a
 * package it cannot find, from a directory with no `node_modules` above it, by
 * installing it on demand into its global cache — measured, a directory with
 * none resolved `@rig-c/review` there — so "not installed" would never be
 * refused, and asking would reach the network. `NODE_PATH` and the global
 * folders are not read: what the refusal tells a caller to run never puts a
 * package there. The bin is read off the `package.json` found, not resolved.
 */
function resolveDelegate(name: string): string | null {
  for (const from of [process.cwd(), PACKAGE_ROOT]) {
    for (let dir = resolve(from); ; dir = dirname(dir)) {
      const manifest = join(dir, 'node_modules', name, 'package.json');
      if (existsSync(manifest)) return manifest;
      if (dirname(dir) === dir) break;
    }
  }
  return null;
}

/**
 * Whether the Bun running this hands an empty argument to a process it starts
 * (issue #1465). Bun 1.2.0 (then the declared minimum) does not: `["a", "", "b"]`
 * reaches the child as `["a", "b"]`, through `spawnSync` and `Bun.spawnSync`
 * alike and whatever the child is; 1.4.2 hands it over. That is measured here
 * rather than read off a version number, by starting this Bun twice with
 * `-e` and comparing how many arguments arrived: `[pad, "x"]` and
 * `[pad, "", "x"]` differ by one exactly where the empty one survives. The pad
 * is there because 1.2.0's `-e` also swallows the first argument after the
 * script; it is the same on both runs, so the difference is the empty one's.
 */
export function spawnKeepsEmptyArguments(): boolean {
  const count = (args: string[]): string =>
    spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.argv.length))', ...args], { encoding: 'utf8' }).stdout;
  return Number(count(['pad', '', 'x'])) === Number(count(['pad', 'x'])) + 1;
}

/**
 * The refusal for a delegated command line this Bun cannot hand over whole, or
 * `null` (issue #1465): an empty argument, under a Bun that drops one, would
 * reach the package with the others and nothing would say so. `keeps` is asked
 * only when there is an empty argument, so a command line without one never
 * starts the probe.
 */
export function emptyArgumentRefusal(pkg: string, raw: readonly string[], keeps: () => boolean, bun: string): string | null {
  const at = raw.indexOf('');
  if (at < 0 || keeps()) return null;
  return (
    `argument ${at + 1} is empty, and Bun ${bun}, the Bun running this, drops an empty argument when it starts a process — ` +
    `${pkg} would receive the others without it, and nothing would say so. Give it a value, or run rigc under a Bun that keeps it`
  );
}

/**
 * One argument as a POSIX shell reads it back (issue #1486): left bare when it is made only of characters no shell
 * treats specially, otherwise single-quoted with each `'` spelled `'\''`. The empty argument is `''`. Deterministic
 * — the same argument always prints the same word — so a guidance line naming the flags a caller gave is one string.
 */
export function shellWord(arg: string): string {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(arg)) return arg;
  return `'${arg.replaceAll("'", "'\\''")}'`;
}

/**
 * What a delegating command hands its bin, and the build directory it was pointed at (issue #1486). A delegate that
 * names a `bareTarget` subcommand treats a first argument that is none of its `subcommands` and does not start with
 * `-` (`--help`, `-h`, `--` and every flag pass through) as a target: `rigc review <dir> …` hands over
 * `open <dir> …`. Every other command line — no argument at all, an empty first argument, or a subcommand — is handed
 * over as given, and `target` is `null`.
 */
export function delegateArguments(delegate: { subcommands?: readonly string[]; bareTarget?: string }, raw: readonly string[]): { argv: string[]; target: string | null } {
  const first = raw[0];
  if (delegate.bareTarget === undefined || first === undefined || first === '' || first.startsWith('-') || (delegate.subcommands ?? []).includes(first)) {
    return { argv: [...raw], target: null };
  }
  return { argv: [delegate.bareTarget, ...raw], target: first };
}

/**
 * The refusal for a delegated package that does not resolve (issue #1486): `REVIEW_NOT_INSTALLED` and two guidance
 * lines — the command that installs it, and the one that runs it once without installing, carrying `argv` (what the
 * bin would have been handed, a bare target already spelled `open <dir>`) word for word. With nothing to carry, the
 * second line names the target it needs as `<output>`. Nothing reads the terminal, so it is the same on a TTY and
 * off one, and rigc runs neither line: an install and a one-off fetch both change state the caller did not ask for.
 */
export function notInstalledRefusal(pkg: string, argv: readonly string[]): string {
  const words = argv.length === 0 ? ['open', '<output>'] : argv.map(shellWord);
  return (
    `REVIEW_NOT_INSTALLED: ${pkg} is not installed beside this project or beside rig-c, and rigc does not install it — ` +
    `install it, or run it once without installing:\n` +
    `bun add -d ${pkg}\n` +
    `bunx ${pkg} ${words.join(' ')}`
  );
}

/**
 * The refusal for a delegated package whose manifest declares a Bun floor the running Bun is under, or `null`
 * (issue #1486). The floor is read off the resolved package's own `engines.bun`, never written here: a package that
 * declares none has no floor to hold. Only `>=X.Y.Z` is read; any other range shape is refused by name rather than
 * guessed at (`REVIEW_BUN_RANGE_UNREAD`). A running version with a pre-release tag is below its own release, as
 * semver orders them.
 */
export function bunFloorRefusal(pkg: string, engines: unknown, running: string): string | null {
  if (engines === undefined) return null;
  const isObject = typeof engines === 'object' && engines !== null && !Array.isArray(engines);
  const range = isObject ? (engines as Record<string, unknown>).bun : undefined;
  if (isObject && range === undefined) return null;
  const floor = typeof range === 'string' ? /^\s*>=\s*(\d+)\.(\d+)\.(\d+)\s*$/.exec(range) : null;
  if (floor === null) {
    const what = isObject ? `engines.bun ${JSON.stringify(range)}` : `engines ${JSON.stringify(engines)}`;
    return `REVIEW_BUN_RANGE_UNREAD: ${pkg} declares ${what}, and rigc reads only ">=X.Y.Z" — it did not guess whether Bun ${running} satisfies it`;
  }
  const found = /^(\d+)\.(\d+)\.(\d+)(-\S*)?/.exec(running);
  const below = ((): boolean => {
    if (found === null) return true;
    for (let i = 1; i <= 3; i++) {
      const a = Number(found[i]);
      const b = Number(floor[i]);
      if (a !== b) return a < b;
    }
    return found[4] !== undefined;
  })();
  return below ? `REVIEW_BUN_TOO_OLD: Bun ${running}, ${pkg} needs ${range as string}` : null;
}

/**
 * A delegating command's body (`CommandDoc.delegate`, issue #1457): resolve the
 * package's bin and run it under the Bun running this — the bin is a Bun script
 * — with stdio inherited, then exit with its code, or die by its signal the way
 * `bin/rigc.cjs` does, so a caller reads what it would have read running the bin
 * itself: stdout is the bin's byte for byte, stderr the bin's plus only the
 * launcher's own refusals, the exit code the bin's.
 *
 * Issue #1486 put four things in front of the spawn, in this order, each a
 * refusal by name with exit 2 and nothing on stdout: a bare target that is not a
 * directory (`REVIEW_OUTPUT_MISSING <path>`, read before the install because a
 * guidance line pointing at nothing is no guidance); the package absent
 * (`REVIEW_NOT_INSTALLED` and two guidance lines — never an install, never a
 * `bunx`); a Bun below the package's declared floor (`REVIEW_BUN_TOO_OLD`); an
 * empty argument this Bun would drop (issue #1465). The argument list is the
 * caller's, a bare target prefixed with `open`, and nothing else: no
 * `--reference` is derived, because no build rigc writes records the clip it was
 * retargeted from.
 */
function cmdDelegate(command: string, raw: readonly string[]): void {
  const delegate = COMMANDS.find((c) => c.name === command)?.delegate;
  if (delegate === undefined) throw new Error(`internal: ${command} names no delegate`);
  const { argv, target } = delegateArguments(delegate, raw);
  if (target !== null && !(existsSync(target) && statSync(target).isDirectory())) {
    throw new DelegateError(
      `REVIEW_OUTPUT_MISSING ${target}: ${existsSync(target) ? 'it is not a directory' : 'nothing is there'} — \`rigc review <dir>\` opens a build's output directory, ` +
        `and the first argument is read as one because it is none of ${(delegate.subcommands ?? []).join(', ')} and does not start with "-" (\`rigc review -- <arg>\` hands it over as it is)`,
      2,
    );
  }
  const manifest = resolveDelegate(delegate.package);
  if (manifest === null) throw new DelegateError(notInstalledRefusal(delegate.package, argv), 2);
  const read = readJsonFile(manifest) as { bin?: unknown; engines?: unknown };
  const bins = read.bin;
  const relativeBin = typeof bins === 'object' && bins !== null ? (bins as Record<string, unknown>)[delegate.bin] : undefined;
  const bin = typeof relativeBin === 'string' ? join(dirname(manifest), relativeBin) : null;
  if (bin === null || !existsSync(bin)) {
    throw new DelegateError(
      `${delegate.package} at ${dirname(manifest)} ${bin === null ? `declares no "${delegate.bin}" bin` : `declares the "${delegate.bin}" bin ${String(relativeBin)}, which is not there`} — bun add -d ${delegate.package}`,
      2,
    );
  }
  const old = bunFloorRefusal(delegate.package, read.engines, process.versions.bun ?? 'unknown');
  if (old !== null) throw new DelegateError(old, 2);
  const dropped = emptyArgumentRefusal(delegate.package, argv, spawnKeepsEmptyArguments, process.versions.bun ?? 'unknown');
  if (dropped !== null) throw new DelegateError(dropped, 2);
  // 🔒 The `--` is Bun's, not the bin's: Bun 1.2.0 and 1.4.2 alike drop one `--` standing right after the script, so
  // `rigc review -- <dir>` reached the bin as `<dir>` (measured, issue #1486). One given here is the one dropped, and
  // the arguments after it arrive as they were.
  const ran = spawnSync(process.execPath, [bin, '--', ...argv], { stdio: 'inherit' });
  // ⚠️ The exit and the signal are read before `error`: Bun 1.2.0 (then the declared minimum) sets `error` on every
  // child that exits non-zero, so reading it first refused review's own exit 7 as "could not run". `error` is a
  // launch that failed only where the child left neither a status nor a signal.
  if (typeof ran.status === 'number') process.exit(ran.status);
  if (ran.signal !== null) {
    process.kill(process.pid, ran.signal);
    return;
  }
  throw new DelegateError(`could not run ${bin}: ${ran.error?.message ?? 'it left no exit status and no signal'}`, 1);
}

/**
 * split — one authored mesh's pieces, proposed as one mesh each (issue #1414).
 *
 * Reads the two spec files and nothing else: a mesh of several pieces does not
 * compile, so there is no build to read. Writes the proposal — both specs and
 * `split.json` — into an `--out` that is absent or empty, which is the whole of
 * how it never overwrites anything: there is no in-place flag, because the
 * specs it read are the only statement of what the proposal must reproduce,
 * and a proposal nobody has built yet is not something to put over them.
 */
function cmdSplit(flags: Record<string, string>): void {
  for (const flag of ['rig', 'motion', 'slot', 'out'] as const) {
    if (flags[flag] === undefined) throw new UsageError(`split needs --${flag}`);
  }
  const rigPath = resolve(flags.rig);
  const motionPath = resolve(flags.motion);
  const outDir = resolve(flags.out);
  for (const [flag, path] of [['rig', rigPath], ['motion', motionPath]] as const) {
    if (!existsSync(path) || !statSync(path).isFile()) throw new SplitError(`--${flag} ${path}: no file there`, 2);
  }
  if (existsSync(outDir) && (!statSync(outDir).isDirectory() || readdirSync(outDir).length > 0)) {
    throw new SplitError(
      `--out ${outDir} ${statSync(outDir).isDirectory() ? `holds ${readdirSync(outDir).length} entr${readdirSync(outDir).length === 1 ? 'y' : 'ies'}` : 'is a file'}; ` +
        'the proposal is written into an absent or empty directory only, so it never lands on top of a file — the specs it read included',
      2,
    );
  }
  const rig = parseRigSpec(readJsonFile(rigPath), rigPath);
  const motion = parseMotionSpec(readJsonFile(motionPath), motionPath);
  // The rig spec's `images` is relative to the rig file, and the proposal is written somewhere else: restate it from
  // there, so every `image` resolves to the file it resolved to before.
  const imagesDir = resolve(dirname(rigPath), rig.images ?? '.');
  const images = relativeImagesPath(outDir, imagesDir);
  console.log(`rigc split ${rigPath}`);
  console.log(`  ..    motion   ${motionPath}`);
  const result = splitMesh({ rig, motion, slot: flags.slot, ...(flags.attachment === undefined ? {} : { attachment: flags.attachment }), ...(flags.skin === undefined ? {} : { skin: flags.skin }), images });
  if (result.kind === 'whole') {
    console.log(`rigc split: ${result.line}`);
    return;
  }
  for (const line of result.lines) console.log(`  ..    ${line}`);
  console.log(`  ..    images   ${images}  (the rig spec's own, restated from ${outDir} — it resolves to ${imagesDir})`);
  mkdirSync(outDir, { recursive: true });
  writeJson(join(outDir, 'rig.json'), result.rig);
  writeJson(join(outDir, 'motion.json'), result.motion);
  writeJson(join(outDir, 'split.json'), result.record);
  console.log(`rigc: build it with  rigc build --rig ${join(outDir, 'rig.json')} --motion ${join(outDir, 'motion.json')} --out <dir>`);
}

/**
 * The bodies the second entry runs under a name whose full-entry body is the
 * runtime's (`runtime.core` in `COMMANDS`, issue #1060) — registered by
 * `cli_core.ts` alone, beside `CORE_COMMAND_RUNS`. `build` is `runBuild` with
 * this entry's gate: it writes what `cli.ts build` writes. `repack` (issue
 * #1169) is `./repack.ts`'s body with the same gate, for the same reason: it
 * is `build --pack` run over a build's own lifted regions.
 */
export const CORE_ENTRY_RUNS: Readonly<Record<string, CommandRun>> = {
  build: ({ flags }) => runBuild(flags, MODEL_AND_TEXT_GATE),
  repack: (args) => cmdRepack(args, MODEL_AND_TEXT_GATE),
};

/**
 * The bodies of every command whose `runtime` is `false` (`COMMANDS`), by
 * name — what both entries register. Nothing this module imports links
 * spine-core; `RC25` in `selftest.ts` follows its imports off the disk.
 */
export const CORE_COMMAND_RUNS: Readonly<Record<string, CommandRun>> = {
  explain: ({ flags }) => cmdExplain(flags),
  ingest: ({ flags, positional }) => cmdIngest(flags, positional),
  split: ({ flags }) => cmdSplit(flags),
  diff: ({ flags, lists, positional }) => cmdDiff(flags, lists, positional),
  check: ({ flags }) => cmdCheck(flags),
  render: ({ flags }) => cmdRender(flags),
  inspect: ({ flags }) => cmdInspect(flags),
  'texture-scale': ({ flags }) => cmdTextureScale(flags),
  pose: ({ flags }) => cmdPose(flags),
  chainfit: ({ flags }) => cmdChainFit(flags),
  guide: ({ flags, positional }) => cmdGuide(flags, positional),
  skills: ({ flags, positional }) => cmdSkills(flags, positional),
  review: ({ raw }) => cmdDelegate('review', raw),
};
