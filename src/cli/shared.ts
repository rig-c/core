/**
 * What every rigc entry shares (issue #1052, step 4e of #380): the argument
 * parser, the readers of the files a command line names, the helpers more
 * than one command calls, every command's documentation and the dispatch —
 * moved here unchanged from `cli.ts`, which is now one entry over it.
 *
 * ⭐ A command is documented once (`COMMANDS`), and the documentation says,
 * as data, what the command's body needs (`runtime`, `spineFormat`). An entry
 * is the documentation plus the bodies it registers (`runCli`): `cli.ts`
 * registers every command, and `cli_core.ts` registers only those whose
 * `runtime` is `false` — its set is read off this table, its `--help` prints
 * that set, and a command outside it is refused naming what it needs the
 * runtime for. Nothing in this file links spine-core, and neither does
 * anything it imports: the bodies that reach the runtime are
 * `./spine_commands.ts`'s, which only `cli.ts` imports.
 */
import { type AtlasRegion, DEFAULT_PACK_SHAPE, DEFAULT_PADDING, DEFAULT_PAGE_EDGES, DEFAULT_PAGE_SIZE, PACK_SHAPES, packAtlas, type PackInput, packFootprints, type PackShape, PAGE_EDGES, type PageEdges, pageFootprint } from '../atlas.ts';
import { copyAtlasPages, plannedPageCopies } from '../emit.ts';
import {
  BUILD_REPORT_SPEC,
  type BuildReportDocument,
  type BuildReportGate,
  type BuildReportSupplier,
  buildReportGate,
  buildReportText,
  CLI_DEFAULT_PROFILE,
  type GateHere,
  type PackPageFigures,
  profileAliasLine,
  VALIDATE_PROFILES,
} from '../assertions/report.ts';
import type { VerdictLists } from '../assertions/harness.ts';
import { PROFILE_ALIASES, type AssertionProfile } from '../assertions/kinds.ts';
import { MAX_CANDIDATES, MIN_CANDIDATES } from '../ballot.ts';
import { BONEDIST_SPEC, IDENTITY_CORRESPONDENCE } from '../correspondence.ts';
import { ANCHOR_MAX_RESIDUAL, ANCHOR_MAX_UNEXPLAINED, DEFAULT_HINGE_MAX, DEFAULT_HINGE_MIN, DEFAULT_MIN_LEVER_PX, DEFAULT_MIN_VISIBLE, DEFAULT_PASSES } from '../chainfit.ts';
import { checkAgainstFrames, type CheckOptions, CheckPlates, type CheckReport } from '../check.ts';
import { compile, CompileError, droppedStateReason, headerBoundsOf, type CompileOptions } from '../compile.ts';
import { depthStepLevels, type FoldLimit, type TurnCeiling } from '../depth.ts';
import { FOLDS_FILE } from '../folds.ts';
import { DRAWN_ALPHA, PASS_THROUGH_FILE, PASS_THROUGH_RUN } from '../passthrough.ts';
import { SEAM_FILE } from '../seam.ts';
import { readViewportBox, ViewportError } from '../viewportpin.ts';
import { parseJsonWithPosition } from '../json-position.ts';
import { RUNG_IDS } from '../ladder.ts';
import { MODEL_DOCUMENT_FILE, MODEL_DOCUMENT_SPEC, modelDocument, spineFileSha256 } from '../model.ts';
import { compileErrorLine, nearestNames } from '../guide.ts';
import { PACKAGE_ROOT, readPackageMeta, readVersion } from '../package_meta.ts';
import { DEFAULT_MAX_RESIDUAL, DEFAULT_SCALE_MAX, DEFAULT_SCALE_MIN } from '../pose.ts';
import {
  CandidateAtlasError,
  CandidatePairError,
  GEOMETRY_FILE,
  GeometryError,
  POSER_NAMES,
  PoserChoiceError,
  type PoserName,
  PROTOCOL_FPS,
  UnframeablePoseError,
} from '../render_shared.ts';
import { BallotError } from '../ballot.ts';
import { ChainFitError } from '../chainfit.ts';
import { CheckError } from '../check.ts';
import { IngestError, type IngestStage } from '../ingest.ts';
import { InspectError, DEFAULT_SHOW, DIM_KEEP, INSPECT_DEFAULT_FPS, ON_GRID_FRAMES, SHOW_SPELLINGS } from '../inspect.ts';
import { NotAPngError } from '../png.ts';
import { PoseError } from '../pose.ts';
import { RepackError } from '../repack.ts';
import { SplitError } from '../meshsplit.ts';
import { SpineRuntimeError, SPINE_SIDE_ABSENT } from '../spine_side.ts';
import type { CompileResult, DroppedState } from '../types.ts';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';


/**
 * One entry of a cuts.json, every path relative to the cuts.json file.
 *
 * `rig` is required — it is the skeleton's structure, and until it was a file
 * that structure was three hard-coded tables in the compiler. `manifest` is
 * optional: a skeleton with no measured art behind it has none, and then the rig
 * spec carries its own attachments and stage size.
 */
export interface CutEntry {
  rig: string;
  motion: string;
  out: string;
  manifest?: string;
  /** Base directory for the rig spec's `image` references, if not the rig's own. */
  images?: string;
}

export type CutTable = Record<string, CutEntry>;

export class UsageError extends Error {}

/**
 * A usage error that is one required flag missing from a spelled-out cut —
 * printed as its one line and exit 2, without the usage block under it (issue
 * #1466). The catalogue under `--out is required` buried the only line that
 * said what to add, which is `PoseError`'s reason for printing alone. Still a
 * `UsageError`, so every reader that asks whether an invocation was refused
 * reads it as one.
 */
export class MissingFlagError extends UsageError {}

/** The `<value>` each flag of a spelled-out cut takes, for the line that names a missing one. */
const CUT_FLAG_VALUES = { rig: '<rig.json>', motion: '<motion.json>', out: '<dir>' } as const;

/**
 * `explain` refusing a pair it cannot pose — a usage error in kind, printed
 * without the usage block for `PoseError`'s and `IngestError`'s reason: the
 * message names an attachment, a region and two flags, and reprinting every
 * command's usage under it buries the one line that says what to change.
 */
export class ExplainError extends Error {}

// ---------------------------------------------------------------------------
// package metadata — the installed version and repository, for `--version`
// and for naming a remedy `bench` can only give from a repo checkout.
// ---------------------------------------------------------------------------

// The reader moved to `../package_meta.ts` (issue #1230), so a library module can read
// the version without loading the CLI; every name it had here is re-exported unchanged.
export { PACKAGE_ROOT, readPackageMeta, readVersion };

// ---------------------------------------------------------------------------
// argument parsing
// ---------------------------------------------------------------------------

/**
 * The flags that are switches rather than `--flag value` pairs.
 *
 * Listed by name rather than inferred from "the next argument looks like a
 * flag": inferring it would turn `--out --json report.json` — a real typo, a
 * missing value — into a silently accepted switch plus a stray positional.
 *
 * ⚠️ This set and `FLAG_VALUES` are two halves of one statement, and they are
 * the halves a reader and the parser read separately: a flag absent from
 * `FLAG_VALUES` is printed bare in every usage line and flag table, and a flag
 * present here is the only kind the parser will accept bare. `all-bones` was in
 * one half and not the other for two releases — documented bare in `bonedist`'s
 * usage line, in the shared flag table, and in the hint `src/bonedist.ts` prints
 * under a truncated bone table, while the parser fell through to the value
 * branch and answered the caller who followed that hint with `rigc: --all-bones
 * needs a value` (issue #328). `CLI10`/`CLI11` in `selftest.ts` now hold the two
 * halves together by reading `--help` rather than by naming a flag.
 */
const BOOLEAN_FLAGS = new Set(['all', 'all-frames', 'all-bones', 'help', 'copy-images', 'again', 'pack', 'copy', 'geometry', 'folds', 'accept-skeleton-differences', 'keep-pages', 'dim']);

/**
 * The flags a command is allowed to spell more than once.
 *
 * `vote --candidate` is, because a ballot is *by definition* several
 * candidates; `preview --candidate` is, because a pane per candidate on one
 * page is what an agent otherwise builds by hand (issue #837); and `diff --as`
 * is, because a skeleton has as many shots as it has and one pairing per flag is the only spelling that keeps each pair a pair
 * (issue #720). Everywhere else a repeat is a mistake and is refused: `check
 * --candidate a --candidate b` used to take `b` silently, which is a report
 * about a rig the caller did not think they were asking about.
 */
export const REPEATABLE_FLAGS: Record<string, ReadonlySet<string>> = {
  vote: new Set(['candidate']),
  diff: new Set(['as']),
  preview: new Set(['candidate']),
};

/**
 * `--flag value` pairs plus the leftover positionals, in order.
 *
 * `lists` carries every occurrence of every flag and `flags` carries the last
 * one, so a command that wants a repeated flag reads `lists` and the ones that
 * do not are untouched by the addition.
 */
export function parseArgs(
  argv: string[],
  repeatable: ReadonlySet<string> = new Set(),
): { flags: Record<string, string>; lists: Record<string, string[]>; positional: string[] } {
  const flags: Record<string, string> = {};
  const lists: Record<string, string[]> = {};
  const positional: string[] = [];
  const take = (name: string, value: string): void => {
    if (flags[name] !== undefined && !repeatable.has(name)) {
      throw new UsageError(
        `--${name} was given more than once (${JSON.stringify(flags[name])} then ${JSON.stringify(value)}); ` +
          'this command takes it once',
      );
    }
    flags[name] = value;
    (lists[name] ??= []).push(value);
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq !== -1) {
        take(arg.slice(2, eq), arg.slice(eq + 1));
      } else if (BOOLEAN_FLAGS.has(arg.slice(2))) {
        take(arg.slice(2), 'true');
      } else {
        const next = argv[i + 1];
        if (next === undefined || next.startsWith('--')) throw new UsageError(`${arg} needs a value`);
        take(arg.slice(2), next);
        i++;
      }
    } else {
      positional.push(arg);
    }
  }
  return { flags, lists, positional };
}

/**
 * Read and parse a JSON file the caller named on the command line — a cuts
 * table, a candidate or reference skeleton to `diff`. A parse failure names the
 * file and, best-effort, where inside it the syntax broke (see
 * `parseJsonWithPosition`); left as a raw `JSON.parse`, it would surface as an
 * unhandled `SyntaxError` with a stack trace instead of a usage error.
 */
export function readJsonFile(path: string): unknown {
  return parseJsonNamed(readFileSync(path, 'utf8'), path);
}

/** `text`, read from `path`, parsed — and refused naming the file and where it broke when it is not JSON. */
export function parseJsonNamed(text: string, path: string): unknown {
  try {
    return parseJsonWithPosition(text);
  } catch (err) {
    throw new UsageError(`cannot read ${path}: ${(err as Error).message}`);
  }
}

/**
 * A skeleton a command was pointed at, as text — refused like every other JSON
 * file on the command line (`parseJsonNamed`) when it is not JSON (issue
 * #1042). `render`, `check`, `bench` and `bonedist` hand the text to a loader
 * that parses it again, and on a file that is not JSON that parse surfaced as
 * the runtime's `SyntaxError` and a stack, where `diff`, `preview`, `vote` and
 * `ingest` already said `cannot read <path>`.
 */
export function readSkeletonText(path: string): string {
  const text = readFileSync(path, 'utf8');
  parseJsonNamed(text, path);
  return text;
}

/**
 * Read a cuts.json and resolve its three paths against the file's own
 * directory. Anchoring on the table rather than on the process cwd is what lets
 * the same command work from anywhere in the owning project.
 */
function readCutTable(cutsPath: string): { dir: string; table: CutTable } {
  const abs = resolve(cutsPath);
  if (!existsSync(abs)) throw new UsageError(`no cuts file at ${abs}`);
  const parsed = readJsonFile(abs);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new UsageError(`${abs}: expected an object of cut name -> { manifest, motion, out }`);
  }
  return { dir: dirname(abs), table: parsed as CutTable };
}

function entryToOptions(dir: string, name: string, entry: CutEntry): CompileOptions {
  for (const key of ['rig', 'motion', 'out'] as const) {
    if (typeof entry?.[key] !== 'string') throw new UsageError(`cut ${JSON.stringify(name)} has no "${key}" path`);
  }
  const opts: CompileOptions = {
    rigPath: resolve(dir, entry.rig),
    motionPath: resolve(dir, entry.motion),
    outDir: resolve(dir, entry.out),
  };
  if (entry.manifest !== undefined) opts.manifestPath = resolve(dir, entry.manifest);
  if (entry.images !== undefined) opts.imagesDir = resolve(dir, entry.images);
  return opts;
}

/**
 * Resolve the cut a command was pointed at, either spelled out on the command
 * line or looked up by name in a cuts.json.
 */
export function resolveCut(flags: Record<string, string>, command: 'build' | 'explain' | 'validate'): { label: string; opts: CompileOptions } {
  const explicit =
    flags.rig !== undefined || flags.manifest !== undefined || flags.motion !== undefined || flags.out !== undefined;
  if (explicit) {
    if (flags.cut !== undefined || flags.cuts !== undefined) {
      throw new UsageError('--rig/--motion/--out and --cut/--cuts are two ways to say the same thing; pick one');
    }
    for (const key of ['rig', 'motion', 'out'] as const) {
      if (flags[key] === undefined) throw new MissingFlagError(`${command} needs --${key} ${CUT_FLAG_VALUES[key]} (or --cut <name> --cuts <cuts.json>)`);
    }
    const opts: CompileOptions = {
      rigPath: resolve(flags.rig),
      motionPath: resolve(flags.motion),
      outDir: resolve(flags.out),
    };
    if (flags.manifest !== undefined) opts.manifestPath = resolve(flags.manifest);
    if (flags.images !== undefined) opts.imagesDir = resolve(flags.images);
    if (flags['atlas-in'] !== undefined) opts.atlasInPath = resolve(flags['atlas-in']);
    return { label: flags.rig, opts };
  }
  if (flags.cut === undefined) throw new UsageError('give either --cut <name> --cuts <cuts.json>, or --rig/--motion/--out');
  if (flags.cuts === undefined) throw new UsageError('--cut needs --cuts <cuts.json> to look the name up in');
  const { dir, table } = readCutTable(flags.cuts);
  const entry = table[flags.cut];
  if (!entry) {
    throw new UsageError(
      `unknown cut ${JSON.stringify(flags.cut)} in ${resolve(flags.cuts)}. known: ${Object.keys(table).join(', ') || '(none)'}`,
    );
  }
  const opts = entryToOptions(dir, flags.cut, entry);
  // `--atlas-in` is not part of the cuts table: a cut names its rig, motion and
  // manifest, and where the pixels are delivered from is a property of the BUILD.
  // Resolved against the working directory, like every other path on the command
  // line, rather than against the table's directory.
  if (flags['atlas-in'] !== undefined) opts.atlasInPath = resolve(flags['atlas-in']);
  return { label: flags.cut, opts };
}

/**
 * One line per mesh kind on this cut, printed above the table.
 *
 * A legend rather than a heading: the heading used to describe the ring tier
 * unconditionally, so a build whose only mesh was a ribbon or a contour got a
 * sentence about a rim ring and a seam it does not have.
 */
/**
 * What a depth map and a soft region put on a mesh, when it named either.
 *
 * The digests are the reason this prints at all: a claim about a rig can name
 * WHICH sheet produced it, and two runs a reader believes differ can be shown to
 * have read the same pixels. The ranges and counts are what say the input
 * reached the geometry rather than merely being resolved — a `carried 0` never
 * gets here (it is refused) and a `ramped 0` is a hard-edged mask, which is
 * legal and usually not what somebody meant.
 */
/**
 * One axis's two ceilings, as `+31.41 / -18.03`, or what is unbounded on it.
 *
 * ⚠️ `none` and a number are different claims and are printed differently. A
 * sheet with no gradient along an axis cannot fold anything on it AT ANY ANGLE,
 * which is a fact about the sheet worth reading; printing `90` for it would be
 * a limit nothing measured.
 */
function ceilingPair(axis: { positive: FoldLimit | null; negative: FoldLimit | null }): string {
  const one = (l: FoldLimit | null, sign: string) => (l === null ? `${sign}none` : `${sign}${l.degrees.toFixed(2)}°`);
  return `${one(axis.positive, '+')} / ${one(axis.negative, '-')}`;
}

/**
 * The same axis's two 1st percentiles, each with its ratio to the ceiling above
 * it and the population it came out of — `+64.80° x1.003 of 5988`.
 *
 * ⭐ The ratio is the whole point and it is printed rather than judged. A
 * ceiling set by the FORM is the floor of a band: the steepest region of a
 * smooth sheet has area, so the 1st percentile sits a fraction of a percent
 * above the minimum. A ceiling set by one bad texel has 99 % of the mesh
 * surviving to the form's angle while the reported number collapses — 64.58°
 * against 6.08° for one texel of 160,000, with the percentile unmoved at 64.80°
 * in both ([#412](https://github.com/rig-c/core/issues/412),
 * `bench/studies/2026-09-05-noise` §6).
 *
 * Three spellings, three different claims, for the reason `ceilingPair` prints
 * `none` rather than 90: `+none` is a side nothing folds on at all, `+unranked
 * of 36` is a side whose population is too small for a first percentile to be
 * anything but the minimum itself, and a number is a measurement.
 *
 * ⛔ No threshold lives here. What ratio means what is in `docs/AUTHORING.md`
 * §3.4, because a number rigc printed an adjective beside would be a policy the
 * compiler invented out of a measurement — and `A39` would go on refusing at the
 * raw angle either way.
 */
function spreadPair(axis: { positive: FoldLimit | null; negative: FoldLimit | null }): string {
  const one = (l: FoldLimit | null, sign: string) =>
    l === null
      ? `${sign}none`
      : l.p1 === null
        ? `${sign}unranked of ${l.count}`
        : `${sign}${l.p1.toFixed(2)}° x${(l.p1 / l.degrees).toFixed(3)} of ${l.count}`;
  return `${one(axis.positive, '+')} / ${one(axis.negative, '-')}`;
}

/** The tightest of the four, so the line that names a triangle names the right one. */
function tightestFold(c: TurnCeiling): { kind: string; sign: string; limit: FoldLimit } | null {
  const all = [
    { kind: 'yaw', sign: '+', limit: c.yaw.positive },
    { kind: 'yaw', sign: '-', limit: c.yaw.negative },
    { kind: 'pitch', sign: '+', limit: c.pitch.positive },
    { kind: 'pitch', sign: '-', limit: c.pitch.negative },
  ].filter((e): e is { kind: string; sign: string; limit: FoldLimit } => e.limit !== null);
  if (all.length === 0) return null;
  return all.reduce((best, e) => (e.limit.degrees < best.limit.degrees ? e : best));
}

export function meshDepthNote(m: CompileResult['meshes'][number]): string {
  const parts: string[] = [];
  if (m.depth) {
    parts.push(
      `depth "${m.depth.image}" ${m.depth.digest} near=${m.depth.near} zScale=${m.depth.zScale} ` +
        `z=[${m.depth.range[0]}, ${m.depth.range[1]}]`,
    );
    // Directly under the sheet's own line, because it is the other half of
    // "what did this mesh read": `z=[…]` says how much of the map's range
    // reached the vertices, and this says how many of them read a texel that
    // draws nothing (issue #449). Reported only when there is something to
    // report, so a mesh whose every vertex sits on drawn art gains no line.
    //
    // ⭐ A `contour` gets the OTHER half of the sentence, because rigc built
    // that outline and knows what it is: `buildContourMesh` returns
    // `hullVertices: points.length` over `offsetPolygon(simplified, margin)`,
    // so every vertex of a contour mesh is the traced silhouette pushed out by
    // the margin — there are no interior vertices for the count to be about.
    // Nothing is derived, inferred or thresholded to say so; it is what the
    // generator returns, and `generatedHullAndEdges` already cross-checks that
    // hull against the triangulation's own outline. Without it the line reads
    // as a fault on every correct contour rig, which is a diagnostic authors
    // learn to ignore.
    // Withheld, and said where the count would have stood (issue #750): the
    // part's texels could not be located on its page, so there is no count
    // that is about this part.
    if (m.depth.unlocated !== undefined) {
      parts.push(`the count of vertices on undrawn texels is not measured: ${m.depth.unlocated}. ${PAGE_GRID_UNLOCATED}`);
    } else if (m.depth.undrawn !== null && m.depth.undrawn > 0) {
      parts.push(
        `${m.depth.undrawn} of ${m.vertices} vertices sample a texel the part image does not draw — ` +
          (m.kind === 'contour'
            ? 'a contour\'s vertices are all traced outline, pushed out by the margin, so this is the topology and not the sheet'
            : 'their z is the sheet\'s reading of somewhere the part is not'),
      );
    }
    const c = m.depth.ceiling;
    parts.push(`turn ceiling  yaw ${ceilingPair(c.yaw)}   pitch ${ceilingPair(c.pitch)}`);
    const worst = tightestFold(c);
    if (worst !== null) {
      parts.push(`  1st pct     yaw ${spreadPair(c.yaw)}   pitch ${spreadPair(c.pitch)}`);
    }
    parts.push(
      worst === null
        ? `              nothing in this sheet folds: ${c.measured} triangle(s) measured, none with a depth gradient across it`
        : `              first to fold: ${worst.kind} ${worst.sign} at ${worst.limit.degrees.toFixed(2)}°, ` +
          `triangle ${worst.limit.triangle} [${worst.limit.ids.join(',')}], the sheet steps ` +
          `${depthStepLevels(worst.limit.depthStep, m.depth.zScale).toFixed(2)} level(s) across it, ` +
          // The same step over the range the mesh sampled (issue #448). A
          // suffix and not a line of its own: it is an apposition on the step
          // beside it, and the reading that matters is the two together — a
          // discontinuity says "plenty of levels" and "nearly all of them" at
          // once, and they have to be read in one breath to say the opposite.
          `which is ${worst.limit.stepShare.toFixed(3)} of the range this mesh sampled` +
          `${c.degenerate ? `; ${c.degenerate} triangle(s) too flat in setup to measure` : ''}`,
    );
  }
  if (m.soft) {
    parts.push(
      `soft "${m.soft.mask}" ${m.soft.digest} -> ${m.soft.bone}, ${m.soft.carried} carried / ${m.soft.ramped} in the falloff`,
    );
  }
  return parts.length === 0 ? '' : `\n        ${parts.join('\n        ')}`;
}

/**
 * The line under a `segments` mesh: how its bones share the vertices.
 *
 * ⭐ The weights are this generator's whole output, and the per-vertex numbers
 * are nowhere a reader can see them — so the three figures that say whether the
 * falloff did what was meant are printed where the mesh is: the most bones any
 * vertex binds (against `maxBones`), the mean, and how many vertices a single
 * bone owns outright. A named bone no vertex binds is said by name, because it
 * is in no weight and so in no other figure either.
 */
export function meshInfluenceNote(m: CompileResult['meshes'][number]): string {
  const inf = m.influence;
  if (inf === undefined) return '';
  const unbound = m.bones.filter((b) => !inf.bound.includes(b));
  const single = m.vertices === 0 ? 0 : (inf.singleBone / m.vertices) * 100;
  const joined = inf.keptCells - inf.artCells;
  return (
    `\n        influence  max ${inf.maxBones} bone(s) per vertex, mean ${inf.meanBones.toFixed(2)}, ` +
    `${inf.singleBone} of ${m.vertices} vertices (${single.toFixed(2)}%) on a single bone` +
    (unbound.length ? `; named and bound by no vertex: ${unbound.join(', ')}` : '') +
    (inf.reach === undefined
      ? ''
      : `\n        reach      radius ${inf.reach.radius}px, ${inf.reach.shape}, ` +
        `${inf.reach.across ? 'across entries' : 'nearest entry only'}, max ${inf.reach.max}: ` +
        `${inf.reach.capped} of ${m.vertices} vertices had more links in reach than max (widest ${inf.reach.widest})`) +
    `\n        lattice    cell ${inf.cell}px, ${inf.cols}x${inf.rows} cells, ${inf.artCells} with art, ${inf.keptCells} kept` +
    (inf.islands > 1 || joined > 0
      ? ` (${inf.islands} island(s) joined into one outline, ${joined} cell(s) added that hold no art)`
      : '')
  );
}

/**
 * Why a figure taken off a part's texels is withheld on a page whose file is
 * not the size its atlas declares — the tail of every line that withholds one
 * (issue #750). The page and its ratios come first, from `pageGridSaid`; this
 * says what that does to the reading and where the repair is named.
 */
export const PAGE_GRID_UNLOCATED =
  'rigc lifts a part off its page at the coordinates the atlas states, and on this file those are not where the ' +
  "part's texels are, so a figure taken there would describe another part of the page. " +
  '`A06_ATLAS_PAGE_SIZE_MATCHES_PNG` refuses the page by the same ratio and names the `scale:` header that states it';

/**
 * What a mesh measured about its own fit against the art it names, or nothing
 * for a mesh with no art to measure against.
 *
 * Printed for authored geometry as well as for a `contour` (issue #277): the
 * figure is a measurement between the emitted triangles and the PNG, so it means
 * the same thing whoever drew the vertices, and the silence was the defect —
 * an octagon rim placed on a round part's silhouette clips its own ink outline
 * at 94.31% and used to print nothing at all.
 *
 * The hole is appended only when there is one, so the common line is unchanged.
 * It is the one figure in the report that a hole moves: `coverage` and
 * `overshoot` are both measured against the FILLED silhouette, so spanning an
 * interior hole is neither missing coverage nor reaching past anything, and an
 * unintentional hole — a gap in the art, a stroke that failed to join — bought
 * fill over transparent pixels with nothing anywhere saying so (issue #275).
 */
export function meshFit(m: CompileResult['meshes'][number]): string {
  // The fit is a measurement against the part's texels, and on a page whose
  // file is not its declared size the region lift does not have them (issue
  // #750). It printed 68.49% / 76.24px there for a mesh that measures 100.00% /
  // 16.00px on the page it was packed from — two plausible numbers about
  // another part of the picture. So the line says what was not measured and
  // why, in the place the figures stood, and prints no figure.
  if (m.fitWithheld !== undefined) return `  fit not measured: ${m.fitWithheld}. ${PAGE_GRID_UNLOCATED}`;
  if (m.coverage === undefined) return '';
  // A count of the plate's own cells, so on a `scale:` page it is texels and
  // says so rather than borrowing the overshoot's unit beside it (issue #762).
  const hole = m.holePixels ? `, enclosing ${m.holePixels}${m.pageScale === undefined ? 'px' : ' texel(s)'} of hole` : '';
  return `  covers ${(m.coverage * 100).toFixed(2)}% of the art, reaching ${m.overshoot?.toFixed(2) ?? '?'}px past it${meshFitGrid(m)}${hole}`;
}

/**
 * The grid a fit was taken on, when it is not the drawing's own (issue #762).
 *
 * The overshoot is stated in the drawing's pixels on every route — the unit an
 * attachment's size is in — and on a page that declares a `scale:` other than
 * 1 it was measured on the page's texels and divided by that scale. So it
 * carries the coarser grid's step: on `scale: 0.5` a figure moves in steps of
 * 2.00px of the drawing, and it need not equal the figure the page it was
 * packed from reads except where the distance falls on whole texels. Said
 * beside the figure, and nothing at all on a loose part or a page at scale 1,
 * where the line is the one it always was.
 */
function meshFitGrid(m: CompileResult['meshes'][number]): string {
  if (m.pageScale === undefined) return '';
  return (
    ` (the drawing's pixels, measured on the page's texels at scale: ${m.pageScale} — a texel is ` +
    `${(1 / m.pageScale).toFixed(2)}px of the drawing)`
  );
}

/**
 * The triangle budget a `MESH` line is read against: the rig's, or nothing.
 *
 * 📐 It used to be the literal `80`, which was nobody's budget — the rig quoted
 * in issue #275 declared 64, `A13_MESH_BUDGET` measured against that 64
 * correctly, and the line an author actually reads printed 80. Under the default
 * `--profile spine` `A13` is `PROF`, so the printed number is the only budget
 * figure in the output and it has to be the declared one. A rig that declares
 * none says so in the same words `A13` SKIPs in, rather than being given a wall.
 */
export function meshBudget(rig: CompileResult['rig']): string {
  return rig.meshTriangleBudget === null ? '(no budget declared)' : `(budget ${rig.meshTriangleBudget})`;
}

/**
 * What a path names as a build — the one statement of it every command that
 * takes a build resolves through (issue #1046): the Spine skeleton, the atlas
 * and the model document, each with whether it is there.
 *
 * ⭐ A build is a directory holding `skeleton.json` and `skeleton.atlas`, and
 * `skeleton.model.json` beside them when rigc wrote it — or a `.json`
 * skeleton named directly, a foreign export's. A directory holding no
 * `skeleton.json`, or a path with nothing at it, is refused here, `nothing at
 * <path>`, for every command alike: before this, `validate` read the missing
 * file unguarded and died on an ENOENT and a stack (#1046), and `diff` on a
 * directory on an EISDIR. What a command then needs beyond the skeleton is the
 * command's to say — `spinePairOf` for the atlas, `resolveDrawable` for a
 * rigc build drawn without one.
 *
 * Two shapes of target, because rigc's own output and a foreign export are
 * named differently and both have to be gateable. rigc writes
 * `skeleton.json` + `skeleton.atlas` into a directory. Everybody else writes
 * whatever the editor called the project, and the official examples are not
 * even consistent with themselves — `7-anticipation/export/` holds
 * `sack-pro.json`, `spineboy/export/` holds two skeletons and two atlases.
 *
 * ⚠️ When more than one atlas sits beside a named skeleton, the atlas is not
 * chosen: guessing by name would be wrong on the corpus that motivated it —
 * `spineboy-ess` shares a longer prefix with `spineboy-run.atlas` than with
 * the `spineboy.atlas` it actually uses, so the plausible heuristic picks the
 * wrong file and every attachment then resolves against the wrong pixels —
 * silently, which is the exact failure mode this tool exists to remove. The
 * refusal is the atlas's (`atlasRefusal`), said by a command that reads one;
 * `diff`, which reads the skeleton alone, is not refused for it.
 */
export interface BuildFiles {
  /** The Spine skeleton — `skeleton.json` in a directory, or the `.json` named — and there, or `resolveBuild` refuses. */
  skeletonPath: string;
  /** The atlas: `--atlas`, else `skeleton.atlas` in a directory, else the one `.atlas` beside a named `.json` (or `skeleton.atlas` there, when there is none). */
  atlasPath: string;
  /** `there` — a file at `atlasPath`; `absent` — none; `ambiguous` — several beside a named `.json` and no `--atlas`. */
  atlas: 'there' | 'absent' | 'ambiguous';
  /** What a command that reads the atlas says where `atlas` is not `there`. */
  atlasRefusal: string;
  /** `skeleton.model.json` beside the skeleton, or `null` where there is none (a Spine export). */
  modelPath: string | null;
}

export function resolveBuild(target: string, atlasFlag: string | undefined): BuildFiles {
  const abs = resolve(target);
  if (!existsSync(abs)) throw new UsageError(`nothing at ${abs}`);
  let skeletonPath: string;
  let atlasPath: string;
  let atlas: BuildFiles['atlas'];
  let atlasRefusal: string;
  if (statSync(abs).isDirectory()) {
    skeletonPath = join(abs, 'skeleton.json');
    atlasPath = atlasFlag ? resolve(atlasFlag) : join(abs, 'skeleton.atlas');
    atlas = existsSync(atlasPath) ? 'there' : 'absent';
    atlasRefusal = `nothing at ${atlasPath}`;
  } else {
    if (!abs.endsWith('.json')) throw new UsageError(`${abs} is neither a directory nor a .json skeleton`);
    skeletonPath = abs;
    if (atlasFlag) {
      atlasPath = resolve(atlasFlag);
      atlas = existsSync(atlasPath) ? 'there' : 'absent';
      atlasRefusal = `nothing at ${atlasPath}`;
    } else {
      const dir = dirname(abs);
      const atlases = readdirSync(dir)
        .filter((f) => f.endsWith('.atlas'))
        .sort();
      atlasPath = join(dir, atlases.length === 1 ? atlases[0] : 'skeleton.atlas');
      atlas = atlases.length === 1 ? 'there' : atlases.length === 0 ? 'absent' : 'ambiguous';
      atlasRefusal =
        atlases.length === 0
          ? `no .atlas beside ${abs}; name one with --atlas <path>`
          : `${atlases.length} atlases beside ${abs} (${atlases.join(', ')}); name the right one with --atlas <path> ` +
            '— guessing by filename is how an attachment quietly resolves against the wrong page';
    }
  }
  if (!existsSync(skeletonPath)) throw new UsageError(`nothing at ${skeletonPath}`);
  const model = join(dirname(skeletonPath), MODEL_DOCUMENT_FILE);
  return { skeletonPath, atlasPath, atlas, atlasRefusal, modelPath: existsSync(model) ? model : null };
}

/**
 * The build's Spine pair, for a command that reads both files — the round
 * trip (`validate`, `bench`), `bonedist`, `preview`, `vote` — refused naming
 * the atlas where it is not there (`atlasRefusal`); the skeleton is
 * `resolveBuild`'s.
 */
export function spinePairOf(build: BuildFiles): { skeletonPath: string; atlasPath: string; atlasDir: string } {
  if (build.atlas !== 'there') throw new UsageError(build.atlasRefusal);
  return { skeletonPath: build.skeletonPath, atlasPath: build.atlasPath, atlasDir: dirname(build.atlasPath) };
}

/**
 * check — how close does the candidate LOOK to the reference frames?
 *
 * ⭐ The gate cannot see a wrong animation. It parses, it steps, it refuses the
 * degenerate — and a rig whose easings are all reversed passes it green, which is
 * not a hypothetical: ladder rung 1's first honest run shipped exactly that build
 * and the validator was structurally incapable of noticing. `diff` cannot see it
 * either, because it compares structure and a reversed curve is the same curve
 * count. The only thing that can is a picture, so this renders the candidate into
 * the reference's own frame and compares pixels.
 *
 * 🔒 It never reads the reference skeleton — see `src/check.ts`. That is what
 * keeps it usable **inside** an authoring loop rather than at the finish line the
 * way `bench` is: an author may run it as often as they like without their run
 * stopping being an authoring run.
 *
 * There is no pass mark, for the same reason `diff` has none.
 */
function readCheckFlags(
  flags: Record<string, string>,
): Pick<CheckOptions, 'fps' | 'viewport' | 'as' | 'framing' | 'textureFrom' | 'skin'> {
  const out: Pick<CheckOptions, 'fps' | 'viewport' | 'as' | 'framing' | 'textureFrom' | 'skin'> = {};
  if (flags.framing !== undefined) {
    if (flags.framing !== 'per-shot' && flags.framing !== 'shared') {
      throw new UsageError('--framing takes per-shot (the default) or shared');
    }
    out.framing = flags.framing;
  }
  if (flags.fps !== undefined) {
    const fps = Number(flags.fps);
    if (!Number.isFinite(fps) || fps <= 0) throw new UsageError('--fps must be a positive number');
    out.fps = fps;
  }
  if (flags.viewport !== undefined) {
    try {
      out.viewport = readViewportBox(flags.viewport);
    } catch (err) {
      if (err instanceof ViewportError) throw new UsageError(err.message);
      throw err;
    }
  }
  if (flags.as !== undefined) out.as = flags.as;
  // The name is not checked against the candidate here: `check` owns that
  // refusal, because it is the side that has the skeleton open and can list the
  // skins it declares. `render` checks its own for the same reason.
  if (flags.skin !== undefined) out.skin = flags.skin;
  if (flags['texture-from'] !== undefined) {
    const path = resolve(flags['texture-from']);
    if (!existsSync(path)) {
      throw new UsageError(
        `--texture-from ${path} is not a file. It takes the ATLAS the reference frames were rendered through — the ` +
          "example's own .atlas — so check can measure how much of the MAE is texture resampling.",
      );
    }
    out.textureFrom = { atlasText: readFileSync(path, 'utf8'), atlasDir: dirname(path), label: flags['texture-from'] };
  }
  return out;
}

export function runCheck(
  candidate: string,
  atlasFlag: string | undefined,
  framesDir: string,
  flags: Record<string, string>,
  plates?: CheckPlates,
): CheckReport {
  const { skeletonPath, atlasPath, atlasText } = resolveDrawable(candidate, atlasFlag);
  // The poser is `render`'s choice, over the same two files (issue #968): the
  // paths are what `candidatePosers` looks beside for `skeleton.model.json`.
  const poser = readPoserFlag(flags);
  return checkAgainstFrames({
    skeletonText: readSkeletonText(skeletonPath),
    atlasText,
    atlasDir: dirname(atlasPath),
    framesDir,
    labels: { skeleton: skeletonPath, atlas: atlasText === null ? `${atlasPath} — not there (${ATLAS_ABSENT})` : atlasPath },
    candidatePaths: { skeleton: skeletonPath, atlas: atlasPath },
    ...(poser === undefined ? {} : { poser }),
    ...readCheckFlags(flags),
    ...(plates === undefined ? {} : { plates }),
  });
}

export function writeJson(target: string, body: unknown): void {
  const out = resolve(target);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(body, null, 2)}\n`);
  console.log(`rigc: wrote ${out}`);
}

// ---------------------------------------------------------------------------
// seeing the result — render and preview
// ---------------------------------------------------------------------------
//
// ⭐ Why two commands exist for one question. `validate` says the artifact is
// valid, `check` says how close it is to reference frames — and a first user has
// neither a reference nor any way to look at what they built. A rig whose head
// sits visibly off its torso passes the gate, loads in `spine-core` and steps
// cleanly, because the offsets are the ones the spec asked for. The only remedy
// is looking (issue #216).
//
// `render` looks with OUR rasteriser: PNGs on disk, no browser, no network, and
// the same frame geometry `check` compares against — so its output is a frame set
// like any other, sidecar included. `preview` looks with ESOTERIC'S, in one HTML
// file, which is the stronger statement of the two: a rig that plays there has
// been played by the reference implementation rather than by ours (issue #151).
//
// Both take a COMPILED artifact rather than a rig and motion spec. That is what
// `check`, `bench` and `validate` all take, it is what `build --out` leaves
// behind, and it keeps `--out` meaning one thing per command instead of naming
// the build directory on the way in and the pictures on the way out.

/** `--candidate`, the one build `preview`, `bench` and `bonedist` read the Spine pair of (`spinePairOf`). */
export function resolveViewable(flags: Record<string, string>): {
  skeletonPath: string;
  atlasPath: string;
  atlasDir: string;
} {
  if (flags.candidate === undefined) {
    throw new UsageError('needs --candidate <dir | skeleton.json> — the directory `build --out` wrote');
  }
  return spinePairOf(resolveBuild(flags.candidate, flags.atlas));
}

/** What `render` and `check` say where a rigc build's atlas is not there (issue #1020). */
export const ATLAS_ABSENT = 'a build the core poses from a rigc-compiled/2 or /3 document needs none';

/**
 * The candidate `render` and `check` draw, with its atlas text — or `null`
 * where the atlas file is not there and need not be (issue #1020).
 *
 * ⭐ A rigc build is drawn by the core from its `skeleton.model.json`, and a
 * `rigc-compiled/2` document states where each region sits on its page, so
 * the build's `skeleton.atlas` is not needed to draw it. Its absence is let
 * through here only where it can be that case — no `--atlas` named, a model
 * document beside the skeleton, and no atlas beside it at all — and the poser
 * choice decides the rest: anything that is read through an atlas after all
 * (a `rigc-compiled/1` document, a build the core refuses) is refused there
 * naming the file and why (`CandidateAtlasError`). An atlas that IS there is
 * read, as it always was: the core holds it to the document's `pages` and
 * draws through spine-core, saying why, when it is not the one the build
 * wrote (#1016), and `check` reads its `scale:` lines for the texture note.
 * Everywhere else this is `resolveViewable`'s refusal, word for word — both
 * read the build off `resolveBuild` (issue #1046).
 */
export function resolveDrawable(target: string, atlasFlag: string | undefined): { skeletonPath: string; atlasPath: string; atlasText: string | null } {
  const build = resolveBuild(target, atlasFlag);
  const { skeletonPath, atlasPath } = build;
  if (atlasFlag === undefined && build.atlas === 'absent') {
    if (build.modelPath !== null) {
      return { skeletonPath, atlasPath, atlasText: null };
    }
  }
  if (build.atlas !== 'there') throw new UsageError(build.atlasRefusal);
  return { skeletonPath, atlasPath, atlasText: readFileSync(atlasPath, 'utf8') };
}

/** `--animation`, checked against what the skeleton actually carries. */
export function readAnimationFlag(flags: Record<string, string>, available: string[]): string | undefined {
  const name = flags.animation;
  if (name === undefined) return undefined;
  if (!available.includes(name)) {
    throw new UsageError(
      `no animation ${JSON.stringify(name)} in this skeleton; it has [${available.join(', ') || 'none'}]`,
    );
  }
  return name;
}

/**
 * `--poser` as spelled, checked against the posers there are — shared by
 * `render` and `check`. On `render` it is read where its refusal has always
 * stood, after the candidate's own flags; the candidate is loaded before that
 * with the spelling as given (`posersAsked`), so a rigc build the core poses
 * is chosen without loading spine-core (issue #1014).
 */
export function readPoserFlag(flags: Record<string, string>): PoserName | undefined {
  const raw = flags.poser;
  const forced = POSER_NAMES.find((name) => name === raw);
  if (raw !== undefined && forced === undefined) {
    throw new UsageError(`--poser ${JSON.stringify(raw)}: known posers are ${POSER_NAMES.join(', ')}`);
  }
  return forced;
}

/**
 * What `render` and `preview` say of their framing on a skeleton that declares
 * no stage (issue #714).
 *
 * ⚠️ **Neither frames to a stage on ANY skeleton**, so this is not a fallback
 * being announced: `framingViewport` is the union of every animation's posed
 * bounds, and the Spine Web Player's `calculateAnimationViewport` samples the
 * playing animation's bounds whenever its config states no viewport box, which
 * `buildPreview` never does. The line is printed only where a stage is absent
 * because that is the one case where a reader can ask *what box stood in for
 * it* — and the answer has to be "none", said, rather than a rectangle that looks
 * like a default. On a staged skeleton the output is the bytes it always was.
 */
export const STAGELESS_FRAMING = {
  render:
    'framing  the posed extent of every animation, padded — this skeleton declares no stage, and nothing stands ' +
    'in for one: render frames to the posed extent whether or not a stage is declared',
  preview:
    "framing  the Spine Web Player's own: the posed extent of the animation it plays — this skeleton declares no " +
    'stage, and nothing stands in for one: the player frames that way whether or not a stage is declared',
} as const;

// ---------------------------------------------------------------------------
// reading a given condition — pose
// ---------------------------------------------------------------------------
//
// ⭐ Every other command here takes a spec and looks at what came out. This one
// runs the other way: it takes a PICTURE the user already has — a key pose — and
// reads spec coordinates out of it, so an agent can state those poses in a rig and
// a motion by construction and spend its loops on the part nobody can measure, the
// movement between them.
//
// 🚫 It grades nothing, and the distinction is load-bearing rather than modest.
// `check` and `bench` compare a build against a reference and their numbers mean
// "how close"; a pose frame is not a reference, it is an INPUT, and once the spec
// states it there is nothing left to be close to. So the residual here is a trust
// signal — how much of the frame this placement actually explains — and the only
// threshold in `src/pose.ts` is the one that decides whether to print an answer at
// all, which the caller can move.
//
//   rigc pose --images parts/ --frame poseA.png [--out pose.json]

export const DEFAULT_POSE_OUT = 'pose.json';

// ---------------------------------------------------------------------------
// reading the half a picture hides — chainfit
// ---------------------------------------------------------------------------
//
// ⭐ `pose` above reads a picture with nothing but the loose parts, and refuses
// the parts another part is drawn over — a residual measured through an occluder
// rises AT the correct placement, so the honest answer is a refusal. This reads
// those, and the whole difference is that it is also given the CANDIDATE: with a
// draw order the covered pixels can be excluded from a part's objective instead
// of charged to it, and with a hierarchy a child of a placed bone has one degree
// of freedom — the hinge about its own pivot — where `pose` has four.
//
// 🚫 Same phase and the same framing as `pose`: it reads a given condition into
// spec coordinates and grades nothing. Every residual is a trust signal, every
// threshold is reported, and `visibleShare` is how much of the part the number
// was even computed on.
//
//   rigc chainfit --candidate <dir> --images <dir> --frame poseA.png [--anchor pose.json]

export const DEFAULT_CHAINFIT_OUT = 'chainfit.json';

// ---------------------------------------------------------------------------
// choosing between results — vote
// ---------------------------------------------------------------------------
//
// ⭐ `preview` shows candidates and asks nothing; this shows two to four of them
// side by side, hides where each came from, and takes an answer back. The rest of this toolchain is instruments, and it
// should be — the vote opens only where the instruments have already run out.
// See `src/ballot.ts` for why the ballot is ordered compile-first-vote-last,
// why the labels are A and B, and why the record is hashes.
//
// Two modes on one command, because they share exactly one thing and it is the
// contract between them: the ballot manifest. Splitting them would document
// that format twice and let the halves drift.
//
//   rigc vote --candidate <a> --candidate <b> [--animation <n>] [--out ballot.html]
//   rigc vote --record <result.json> [--ballot ballot.html] [--ledger votes.jsonl] [--again]

export const DEFAULT_BALLOT = 'ballot.html';
export const DEFAULT_LEDGER = 'votes.jsonl';

// ---------------------------------------------------------------------------
// skills install — put the shipped skills where an agent host looks (issue #831)
// ---------------------------------------------------------------------------
//
// After `bun add -d rig-c` the skills sit at `node_modules/rig-c/skills/`,
// which no host reads. Codex, Gemini CLI and Antigravity all read
// `<workspace>/.agents/skills/<name>/`, so this links every `skills/<name>/` the
// package ships into one directory — `.agents/skills` under the working
// directory unless `--dir` says otherwise.
//
// ⭐ The skills are found from THIS FILE's location, never from the working
// directory: the command installs the package it is, and a cwd that happens to
// hold some other `skills/` is not a source. That is also why it lives here and
// not in `src/`: its one input is where the CLI was installed, nothing else
// calls it, and `src/` is about rigs.
//
// A RELATIVE symlink by default, so the directory survives the project being
// moved or cloned elsewhere and an upgrade of the package is seen with no second
// run. `--copy` writes the folder instead, for a host that does not follow a
// linked skill folder.
//
// 🔒 **An entry that is already there and is not what this command would write is
// refused by name, and then nothing at all is written.** The check runs over
// every skill before the first write, so a refusal never leaves half an install
// behind. The one entry that is NOT refused is the one this command would have
// made — a link that already resolves to the same skill folder, however it is
// spelled, or with `--copy` a folder whose files are byte for byte the package's
// — and a run over only those says it had nothing to do. No lifecycle script
// does this on install: a postinstall writing into a consumer's project root is
// refused as design, and Bun does not run a dependency's lifecycle scripts
// outside `trustedDependencies`, so half the installs would silently skip it.
// ---------------------------------------------------------------------------

/** The default `--dir`, resolved against the caller's working directory. */
export const DEFAULT_SKILLS_DIR = '.agents/skills';

/** An install refused before its first write — nothing to install, or an entry in the way. Exit 1. */
export class SkillsInstallError extends Error {}

/** `guide` asked for a rule or a section the guide does not have (issue #1397): a refusal by `GUIDE_RULE_KNOWN` or `GUIDE_SECTION_KNOWN`, whose message is the whole line. Exit 1. */
export class GuideError extends Error {}

/**
 * A delegating command (`CommandDoc.delegate`, issue #1457) that could not hand
 * over: the package it delegates to does not resolve, or resolves without the
 * bin it names. Nothing ran, so the exit is `status` (2) and the message is the
 * whole of what is printed after `rigc <command>: `.
 */
export class DelegateError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// usage / per-command help
// ---------------------------------------------------------------------------

/**
 * One meaning per flag name, shared by every command that takes it — the
 * single place this project states what a flag means. AUTHORING.md §0 quotes
 * this table for `build`'s `--rig`/`--motion`/`--out`/`--images`/`--manifest`/
 * `--profile`; if the two ever disagree, this is the one the code runs.
 */
const FLAG_MEANINGS: Record<string, string> = {
  rig: 'the rig spec — skeleton structure',
  motion: 'the motion spec — time',
  out: 'directory for skeleton.json + skeleton.atlas (and, from build, skeleton.model.json); atlas page paths and skeleton.images are written relative to it',
  images: "override the rig spec's own images directory (relative to your working directory)",
  manifest: 'a cut manifest, for a rig with measured art behind it; a foreign skeleton has none',
  'copy-images':
    'also copy every referenced page PNG into --out and rewrite the atlas to the copies, so the directory is ' +
    'self-contained enough to zip or commit on its own, and point skeleton.images at --out itself so the editor finds ' +
    'the parts beside the skeleton on import (default: page paths still point at the source art)',
  pack: 'arrange every part PNG onto shared atlas page(s) written into --out as real PNGs, instead of one page ' +
    'per part. Lossless: every region is a byte-for-byte copy and nothing is resampled, trimmed or rotated ' +
    '(default: one part, one page, pointing at the source art)',
  'page-size': `largest page edge, --pack only (default ${DEFAULT_PAGE_SIZE}); pages are powers of two and the ` +
    'one written is the smallest that holds the pack, spilling to more pages only when the set will not fit',
  padding: `gutter each region reserves on every side, --pack only (default ${DEFAULT_PADDING}); it is filled by ` +
    "extending the region's own edge pixels outwards, which is what stops a neighbour bleeding in",
  'page-edges': `what a page's edges may be, --pack only (default ${DEFAULT_PAGE_EDGES}): pot is a power of two on ` +
    'both; free tries every width from the widest part up, takes the height the placement needs and keeps ' +
    'the least area — a smaller page, at the cost of region attachments sampling within 1 LSB of the loose ' +
    'build rather than exactly',
  'pack-shape': `what two packed rectangles may share, --pack only (default ${DEFAULT_PACK_SHAPE}): rect keeps every ` +
    'region\'s cell apart; polygon packs a region that only meshes draw by its emitted hull, so a neighbour may ' +
    'sit inside its rectangle where the hull is not, with the padding kept between footprints (so a mesh\'s ' +
    'rectangle is its own bytes only where it can be sampled) — a region attachment stays its rectangle',
  'atlas-in':
    'resolve every part against the regions of this pre-packed .atlas instead of against loose PNGs — region ' +
    'geometry (bounds/offsets/rotate) is read from the file and the atlas is re-emitted into --out, re-anchored',
  cut: 'look up a named cut in --cuts <cuts.json>, instead of --rig/--motion/--out',
  cuts: 'the cuts.json --cut names',
  profile:
    'which rulebook to check against (default: spine) — spine = valid Spine 4.3 that any runtime plays ' +
    "correctly; rig-play = also this project's renderer/archetype policy",
  atlas: "the candidate's atlas, when it is not beside the skeleton",
  reference: 'the reference skeleton to pose beside the candidate — a directory or a skeleton.json path',
  'reference-atlas': "the reference's atlas, when it is not beside the reference skeleton",
  bones: `a bone correspondence — { "spec": "${BONEDIST_SPEC}", "bones": { "<candidate bone>": "<reference bone>" }, ` +
    '"animations"?: { … } } — or `identity` to state that the two skeletons use the same names. An INPUT, never ' +
    'derived: a candidate is entitled to its own vocabulary, so a mapping worked out here would be a guess reported ' +
    'as a measurement',
  'all-bones': 'print every bone pair, not just the worst by position',
  geometry:
    `also write ${GEOMETRY_FILE} into each frame directory: per frame, every bone's world transform and every ` +
    "slot's region or mesh vertices in world units after skinning, plus each attachment's rest geometry — on the " +
    'frames\' own grid and viewport. Not with --slot/--hide: the geometry is the whole pose whatever is drawn',
  folds:
    `also read which mesh triangles fold — turn over against the setup pose — and write ${FOLDS_FILE} into each frame ` +
    'directory: per mesh, the frames with a folded triangle, the worst frame\'s count and which triangles, by index, ' +
    'with where they are (the world box of their posed vertices) and how big (their setup-pose area, and its share of the mesh\'s). ' +
    'One line per mesh that folds; a triangle degenerate or inverted at the setup pose is said once and never counted. ' +
    'A reading, not a gate. Not with --slot/--hide: it reads every mesh the pose shows',
  'pass-through':
    `also read where a cloth slot passes through a leg slot, for each <cloth>:<leg> pair, and write ${PASS_THROUGH_FILE} into ` +
    'each frame directory: the frames where the cloth draws over the leg and its drawn side lies inside the leg\'s drawn ' +
    `outline by ${PASS_THROUGH_RUN} steps or more — rows read in the cloth's setup pose from its hem's corner up, the run stepped in ` +
    'world units, one texel of the coarser drawing to a step — each with the depth and the world box. One line per pair, and one per frame that passes through. ' +
    'The order is the declaration: the first name must draw over the second for a frame to be read. A reading, not a gate. ' +
    'An unknown slot, a slot that draws on no frame, a malformed list and a pair named twice are refused by name. Not with --slot/--hide',
  seam:
    `also read, for each <slot>:<slot> pair, where the two drawings stop meeting, and write ${SEAM_FILE} into each frame directory: ` +
    'per pair, the frames with a gap — background inside the hull of the band the two drawings share at the setup pose, carried to the frame by both — ' +
    'and the frames with a ghost — the band of one drawing showing where, from its partner\'s point of view, nothing was drawn at the setup pose — each with ' +
    `its cell count, area and world box. Cells are one texel of the coarser drawing, drawn at ${DRAWN_ALPHA} of 255 or more. One line per pair; a pair whose ` +
    'drawings share no cell at the setup pose is a SKIP. A reading, not a gate: the exit status never moves. An unknown slot, a slot with itself, ' +
    'a slot that draws on no frame, a malformed list and a pair named twice in either order are refused by name. Not with --slot/--hide',
  'angle-range':
    'also read, for each <bone>:<relative-to> pair, the range of the first bone\'s world direction against the second\'s over each set\'s ' +
    'frames — its rotationX less the other\'s, followed from frame to frame so a sweep past ±180° reads as itself — and print one line per ' +
    'pair per set: the lowest and the highest angle in degrees, the span, and the frame each was first reached on. Read on the frames\' own ' +
    'grid, so a peak between two frames is not read. A reading, not a gate: nothing is written. An unknown bone, a bone against itself, ' +
    'a malformed list and a pair named twice are refused by name, and so is a bone with no direction on a frame (a world matrix of zero)',
  'viewport-from':
    "draw on an earlier render's grid exactly — the box, the scale and the pixel size its frames.json records (the file, or the " +
    'directory `render --out` wrote it into) — so a world point lands on the same pixel in both renders. A slot that reaches past ' +
    'the box is named as under --viewport, and frames.json records the same under `pinned`. Not with --viewport, and not with --max: ' +
    'the file fixes the pixel size',
  environment:
    'the world the rig\'s physics answers, in time: a file { "spec": "rigc-environment/1", "steps": [{ "t": <seconds>, ' +
    '"wind"?: [x, y], "gravity"?: [x, y] }, …] }, x right and y down, each step holding from its t until the next and set ' +
    'before the step that poses the first frame at or after it, on either poser. Before the first step the world is the ' +
    'runtime\'s, wind [1, 0] and gravity [0, 1]. frames.json and geometry.json record it, and the framing reads it. A ' +
    'malformed file, a half no physics constraint answers, two steps on one frame and a step after every set\'s last frame ' +
    'are refused by name. An inspection of what the rig offers, not a scene',
  poser:
    "`render`, `inspect` and `check`: which implementation poses the frames (on `check`, the candidate's) — `core` (rigc's own, reading the skeleton.model.json a " +
    'build writes beside the pair) or `spine` (spine-core). Default: `core` when that document and the atlas sit ' +
    "beside the skeleton and the skeleton is the one the document records (spine.sha256), `spine` otherwise and wherever the core refuses the input by name; the `poser` " +
    'line of the render or the check report says which and why. `--poser core` on an input that cannot carry it is refused by name. ' +
    "`explain`: which reads and poses the DEFORM block's survey — `core` (the model document the compile writes, spine-core untouched) or " +
    '`spine` (the Spine skeleton parsed and posed by spine-core); default `core`, and `spine` where the core refuses the document, which the block names',
  'lever-fold':
    '`explain` only: also read, on the turn lines\' walk, the steps where a physics constraint that drives scaleX has its inertia lever ' +
    'divide by less than this fraction (above 0, at most 1) of the divisor it takes at the setup pose — the bone\'s length times its world x-axis ' +
    'length, less scaleLag × shown on a drive that does not rotate — and the steps where the scale factor it applies moves by more than the ' +
    'bone\'s setup scale in one step: each line the constraint, the steps, the extreme value and its step. No default: without it the reading ' +
    'is not taken, and says so; a value that is not such a fraction is refused by name. A reading, not a gate',
  'texture-from':
    "also measure this run through this atlas's texels, keeping the candidate's own geometry, and report how much " +
    'of the MAE is texture resampling rather than the rig — pass the atlas the reference frames were rendered ' +
    'through. ⚠️ NOT --atlas: that one names the candidate\'s own atlas and loading a foreign one there re-seats ' +
    'every region attachment on its packing, so a rotated or trimmed pack moves the geometry too',
  candidate: 'a compiled skeleton: a directory holding skeleton.json + skeleton.atlas, or a skeleton.json path',
  frames: 'a rendered reference frame set (a skeleton root, or one animation directory)',
  fps: 'frame rate, only for a frame set with no frames.json sidecar',
  viewport: "pin the candidate's world box, y up, instead of fitting it",
  framing: 'fit each frame set on its own (default) or once across all of them',
  as: 'the candidate animation to play, when it is named differently from the frame set',
  'all-frames': 'print every frame, not just the worst by MAE',
  json: 'also write the whole report to this path',
  frame: 'one pose frame — a picture of the pose to read the part placements out of',
  scale: `the scale window to search, as frame pixels per part pixel (default \`${DEFAULT_SCALE_MIN},${DEFAULT_SCALE_MAX}\`)`,
  rotation: 'the rotation window to search, in screen degrees (default `-180,180`, a full turn)',
  'max-residual':
    `above this residual a placement is refused by name instead of reported flat (default ${DEFAULT_MAX_RESIDUAL}); ` +
    'it is a reporting threshold, not a pass bar',
  anchor:
    'a `rigc pose` report for THIS frame, whose confident placements become the anchors the chains hang off ' +
    '(default: run that pass internally over exactly the parts the candidate draws)',
  hinge:
    `the window each child bone's local rotation is searched over, in Spine degrees about its setup value ` +
    `(default \`${DEFAULT_HINGE_MIN},${DEFAULT_HINGE_MAX}\`, a full turn — one degree of freedom is cheap enough not ` +
    'to risk a window that does not contain the truth)',
  stretch:
    'also search a uniform scale on every bone, over this ratio either way (e.g. 1.25). Without it the stretch ' +
    "degree of freedom is searched only where the candidate's own animations key a `scale` timeline, because a rig " +
    'that never scales a bone is a rig saying that bone does not stretch',
  'min-visible':
    `below this share of a part surviving the parts drawn over it, the placement is refused by name instead of ` +
    `reported flat (default ${DEFAULT_MIN_VISIBLE}); the best one found is still printed, and it is a reporting ` +
    'threshold, not a pass bar',
  passes:
    `how many times the occluder masks are rebuilt from the answers and the fit rerun (default ${DEFAULT_PASSES}); ` +
    "pass 1 freezes each part's visible set where the RIG predicts it, later passes where the last one landed",
  'anchor-residual':
    `the residual a \`pose\` placement must be within to anchor a chain (default ${ANCHOR_MAX_RESIDUAL}, with ` +
    `unexplained ≤ ${ANCHOR_MAX_UNEXPLAINED} and unambiguous — the 2026-09-03 measurement run's own clean-frame criterion)`,
  'inward-lever':
    `how far apart, in frame pixels, two anchored descendants have to sit before the rotation they determine is ` +
    `printed (default ${DEFAULT_MIN_LEVER_PX}); below it the bone is refused \`no-bracket\` naming the measured ` +
    'lever, because an angle read across a short lever turns a half-pixel anchor error into several degrees',
  animation: 'which animation to show; the default is every one for `render` and the first for `preview`',
  attachment:
    "the placeholder the mesh is filed under in its slot, as the rig spec's skin names it. Absent, the slot's one " +
    'authored mesh in that skin; a slot holding none or several is refused naming them',
  skin:
    'pose under this skin, by the name the skeleton declares. Without it NO skin is set — every slot resolves ' +
    'through the default skin alone, so a slot whose art lives only in a named skin draws nothing. A name the ' +
    'skeleton does not declare is refused with the ones it does. `render` records the skin in frames.json and ' +
    '`check` reads it back, so a skin-A candidate is not scored against skin-B frames in silence',
  slot:
    'draw only these slots, comma-separated, in the skeleton\'s draw order, on the SAME grid as the whole rig: the ' +
    'viewport is still fitted to every slot, so this frame overlays the full one pixel for pixel. A name the ' +
    'skeleton does not declare is refused with every one it does; a slot whose art lives only under another skin ' +
    'is refused naming that skin. frames.json records the subset, and `check` refuses such a set as a reference',
  hide:
    'draw every slot but these, comma-separated — `--slot` the other way round, on the same grid, recorded and ' +
    'refused the same way. Not with `--slot`: the two are one statement',
  max: 'longest side of a rendered frame, in pixels (default 256)',
  show:
    `what \`inspect\` draws, comma-separated, from [${SHOW_SPELLINGS.join(', ')}] (default \`${DEFAULT_SHOW.join(',')}\`): art = the ` +
    "build's own frame; grid = lines at whole multiples of a step in world units, labelled; density = each region and mesh " +
    "filled by its triangles per world unit² over the figure's, on a log ramp centred on 1x that the legend states, with the " +
    "figure's totals over every slot and each slot's row in the legend; weights:<bone> = that bone's " +
    'weight over every region and mesh it moves, as a heat on a ramp the legend states; folds = each mesh triangle turned ' +
    "over against the setup pose at the pose drawn, filled, and named by index in the legend (render --folds reads the same); mesh = each mesh's triangle edges; " +
    "hull = each mesh's hull outline; declared = each invariants.axes " +
    "line through its two bones' origins, its held bones drawn in their own colour; bones = each bone from origin to tip, " +
    'a bone of length 0 marked as one; axes = each bone\'s world x and y axes; slots = each slot\'s place in the posed ' +
    'draw order; names = the bones\' names, one label per pixel (bones sharing an origin pixel are "first +N"). Any other word ' +
    'is refused naming these',
  dim: `fade the art toward white (each channel keeps ${DIM_KEEP} of its distance from white), so what is drawn over it reads`,
  at:
    `the times of --animation to draw, in seconds, comma-separated — one is a picture, several a sheet of tiles on one ` +
    `grid in the order given. Each must be a frame of the --fps grid render draws the animation on (within ` +
    `${ON_GRID_FRAMES} of a frame), and is refused naming the frames either side otherwise; without --animation the ` +
    'picture is the setup pose and --at is refused',
  zoom:
    'frame the picture to one bone (origin to tip) or one slot (its attachment\'s vertices) over every time drawn, padded ' +
    'by <pad> world units on every side (default: a quarter of the box\'s longer side). A name that is both a bone and a ' +
    'slot is refused until written bone:<name> or slot:<name>; a name that is neither lists both rosters. `folds` frames it to ' +
    'every folded triangle of every mesh --overlay-slot keeps, at the times drawn — refused, naming the frames that do fold, ' +
    'when none is folded there. Not with --viewport',
  bone:
    "draw only the bones these globs match (`*` any run of characters, `?` one, the whole name; comma-separated) — on `inspect`, " +
    "for bones, axes and names; every bone stays in the legend, a left-out one saying why in `undrawn`. A pattern that matches no " +
    'bone is refused naming the bones there are',
  'hide-bone':
    "draw none of the bones these globs match — `--bone` the other way round, applied after it, so `--bone 'bang_*' " +
    "--hide-bone '*_ctl'` is the fringe chains without their control bones",
  'overlay-slot':
    "draw the per-slot views — mesh, hull, weights:<bone>, density and slots — only for the slots these globs match (`*` any run of " +
    "characters, `?` one, the whole name; comma-separated); the art is every slot's still, since it is what the geometry is read " +
    "against. Not `--slot`: that flag draws a subset of the art on `render`, by exact name. The legend's meshes[], slots[] and " +
    "density rows list only the slots kept — the figure's density totals stay over every slot —, a slot number stays its place in " +
    'the whole draw order, and a pattern that matches no slot is refused naming the slots there are',
  'hide-overlay-slot':
    "draw none of the per-slot views for the slots these globs match — `--overlay-slot` the other way round, applied after it, " +
    "so `--overlay-slot 'hair_*' --hide-overlay-slot hair_back` is the hair but its back layer",
  compare:
    'a second build to draw beside --candidate, the same view at the same times on one world box and one transform — the union ' +
    'of both framings unless --zoom or --viewport pins it — each half labelled with its build and the poser that posed it. A ' +
    'name, animation or skin the second build lacks is refused naming it',
  record: 'a saved vote to check against its ballot and append to the ledger, instead of writing a ballot',
  ballot: `the ballot the --record'd vote answers (default \`${DEFAULT_BALLOT}\`); its embedded manifest is what the vote is checked against`,
  ledger: `the append-only JSONL the vote lands in (default \`${DEFAULT_LEDGER}\`)`,
  again: 'record a second vote on a ballot the ledger already has; without it, a repeat is refused rather than doubled',
  all: 'guide §section only: include its subsection bodies; without it, a section with subsections prints its heading, own prose and subsection index; a leaf prints its full text either way',
  dir:
    `the directory to install into, resolved against your working directory (default \`${DEFAULT_SKILLS_DIR}\`, the ` +
    'workspace directory Codex, Gemini CLI and Antigravity read skills from)',
  copy:
    'copy each skill folder instead of linking it, for a host that does not follow a linked skill folder. A copy ' +
    'is not reached by an upgrade of the package, and one that is no longer the package\'s bytes is refused by name ' +
    'on the next run — remove it and run again (default: a relative symlink, which an upgrade reaches with no ' +
    'second run)',
  name: "the rig spec's own name, which the motion spec's archetype must match (default: the skeleton file's basename)",
  art: 'how the written spec reaches the art, which a skeleton does not encode: `loose` names an image per ' +
    "attachment, measured out of the rig spec's own images directory (--images writes it; without it, `build " +
    '--images <dir>` on every rebuild), `none` states width/height only for `build --atlas-in <pack>` to ' +
    'resolve (default: loose)',
  stage:
    'the setup bounding box — `skeleton.x,y,width,height` — to ADD to a skeleton that declares none. It cannot be ' +
    'derived: posing the rig gives the ANIMATED extent, which is a different number from the setup box, so this ' +
    "is the caller's value, and without it the absence is carried: the spec states `\"width\": null, \"height\": " +
    'null` and the rebuild declares no stage either. ⚠️ An editor export MAY ' +
    'carry none; every editor export measured for this project carries one and ingest reads it straight through, ' +
    'so the flag is for a file that really has none rather than for editor exports as a class. ⛔ Beside a ' +
    'skeleton that already declares a box it is REFUSED rather than ignored: two sources for one value, and the ' +
    'file is the record of what was measured',
  'accept-skeleton-differences':
    'write the repack even where the rebuilt skeleton.json differs from the input\'s, and print every differing path ' +
    'with both values (default: refused naming them). It says only where the two differ, never why — a build written ' +
    'before 2.2.0, whose header box was the stage, differs in those four fields and nowhere else. Region identity and ' +
    'the gate hold exactly as without it; beside an input that needs none, the check line says it accepted nothing',
  'keep-pages':
    'write skeleton.model.json alone, for the atlas and pages as they stand: nothing is lifted or packed, the build ' +
    'resolves every part against the input atlas (build --atlas-in) and the document states that atlas\'s pages and ' +
    'regions field for field, its spine.sha256 the skeleton.json beside them. Written only when the rebuilt skeleton is ' +
    'byte-identical to the input\'s and the gate is green; --out may be the build\'s own directory and must not already ' +
    'hold skeleton.model.json (refused by name, never written over). A page or region line the document has no field ' +
    'for is refused naming it. Takes none of the packing flags, nor --accept-skeleton-differences',
  'stage-box':
    'the slot whose bounding box carries the stage — what `build` writes for a rig that asks for one ' +
    '(`skeleton.stageBox`). Its four corners are read as the rebuild\'s stage in place of the header\'s box, which ' +
    'is the setup-pose bounding box, and the rebuilt spec asks for the same box rather than transcribing it. Only a ' +
    'box `build` could write back is read: anything else in that slot is refused by name, and without the flag no ' +
    'slot is read as the stage because of its name',
  report:
    `also write the gate's report as a JSON document (\`${BUILD_REPORT_SPEC}\`) to this file: every gate's PASS, SKIP and FAIL rows, ` +
    'its summary figures and stats, the supplier that judged it, and every pack line\'s figures — written when the command ' +
    'writes --out and when a gate is red, before the exit. A file already at the path is removed first, so any other ending ' +
    '(a compile error, a repack refused) leaves none rather than an earlier run\'s. Never inside --out, refused by name. ' +
    'The lines printed are the same with it and without it',
  help: "show this command's flags and exit",
};

/** The `<value>` a flag takes, for its column in a command's flag table. Absent for a boolean switch. */
const FLAG_VALUES: Record<string, string> = {
  rig: '<path>',
  motion: '<path>',
  out: '<dir>',
  images: '<dir>',
  manifest: '<path>',
  cut: '<name>',
  cuts: '<path>',
  profile: 'spine|rig-play',
  atlas: '<path>',
  'atlas-in': '<file.atlas>',
  'page-size': '<px>',
  padding: '<px>',
  'page-edges': 'pot|free',
  'pack-shape': 'rect|polygon',
  'texture-from': '<path>',
  poser: 'core|spine',
  environment: '<schedule.json>',
  'pass-through': '<cloth>:<leg>[,<cloth>:<leg>…]',
  seam: '<slot>:<slot>[,<slot>:<slot>…]',
  'angle-range': '<bone>:<relative-to>[,…]',
  'viewport-from': '<frames.json|dir>',
  reference: '<dir|skeleton.json>',
  'reference-atlas': '<path>',
  bones: `<correspondence.json|${IDENTITY_CORRESPONDENCE}>`,
  candidate: '<dir|skeleton.json>',
  frames: '<dir>',
  fps: '<n>',
  viewport: '<x,y,w,h>',
  framing: 'per-shot|shared',
  as: '<name>',
  json: '<out>',
  frame: '<path>',
  scale: '<min,max>',
  rotation: '<min,max>',
  'max-residual': '<0..1>',
  'lever-fold': '<fraction>',
  anchor: '<pose.json>',
  hinge: '<min,max>',
  stretch: '<ratio>',
  'min-visible': '<0..1>',
  passes: '<n>',
  'anchor-residual': '<0..1>',
  'inward-lever': '<px>',
  animation: '<name>',
  attachment: '<name>',
  skin: '<name>',
  slot: '<name[,name…]>',
  hide: '<name[,name…]>',
  max: '<px>',
  show: '<view[,view…]>',
  at: '<s[,s…]>',
  zoom: '<name|folds>[:<pad>]',
  bone: '<glob[,glob…]>',
  'hide-bone': '<glob[,glob…]>',
  'overlay-slot': '<glob[,glob…]>',
  'hide-overlay-slot': '<glob[,glob…]>',
  compare: '<dir|skeleton.json>',
  record: '<result.json>',
  ballot: '<ballot.html>',
  ledger: '<votes.jsonl>',
  name: '<n>',
  art: 'loose|none',
  stage: '<x,y,w,h>',
  'stage-box': '<slot>',
  dir: '<path>',
  report: '<file>',
};

/**
 * A command whose body differs by entry (issue #1060): the body the entry that
 * links none of spine-core runs under the same name, as that entry's page
 * documents it. `runtime.for` still says what the full entry's body runs
 * through the runtime for, and the full entry's page is the command's own
 * fields, unchanged; the second entry's page takes `usage`, `flags` (the
 * command's own where this states none) and `notes` from here
 * (`entryCommands`). Registered by `./core_commands.ts`'s `CORE_ENTRY_RUNS`,
 * which only the second entry registers — `RC26` holds each body to the
 * closure of the module that registers it.
 */
interface CoreBody {
  usage: string[];
  flags?: string[];
  notes: string[];
}

interface CommandDoc {
  name: string;
  /** One or more invocation forms, each already spelling the command name. */
  usage: string[];
  /** Flag names (into FLAG_MEANINGS/FLAG_VALUES), in display order. `--help` is appended automatically. */
  flags: string[];
  /**
   * Per-command wording for a flag whose value or meaning genuinely differs here.
   *
   * ⚠️ The default above it — one meaning per flag name, everywhere — is the rule
   * and this is the named exception to it, not a second table. What earns an entry
   * is the criterion rather than a headcount: the flag is **shared with another
   * command**, and it means something different in this one. Examples, and not an
   * inventory: `--out` is a directory of artifacts to `build`, a directory of specs
   * to `ingest`, a directory of pictures to
   * `render` and one file to `preview` and `vote`; `--fps` is the rate a frame set
   * was RECORDED at to `check`, which reads it off a sidecar, and the rate to
   * SAMPLE at to `render`, which is choosing it; `--candidate` is one artifact
   * everywhere except `vote`, which is the one command that takes several and is
   * the reason there is a ballot at all. Writing any of them as one sentence
   * covering every command would leave every command's own help less true.
   *
   * ⛔ The other side of the criterion, which is the one that keeps this from
   * becoming the second table it says it is not: a flag no other command takes has
   * nothing to differ FROM, so its wording belongs in `FLAG_MEANINGS` /
   * `FLAG_VALUES` above and an entry here for it buys only a second place to look.
   * Both halves are read off `--help` by `CLI71` in `selftest.ts`, which is why
   * this sentence no longer counts anything: it said *"three"* where #605 counted
   * nine, and nothing had ever compared the two.
   */
  overrides?: Record<string, { value?: string; meaning?: string }>;
  /**
   * Lines printed under the flag table: what this command's own figures mean.
   *
   * ⚠️ Not a second place to describe a flag. It exists for what is true of the
   * **command** and of no flag it takes — and the case that earned it is issue
   * #678: `pose` and `chainfit` each say *"it is a reporting threshold, not a
   * pass bar"* on the flag that carries their threshold, and `check` has no such
   * flag, so its page said nothing at all about whether any of its figures is a
   * bar to beat. An agent reading `slot drift worst 3.7 px` off a correct rig had
   * no page to consult and no exit code to read it in.
   */
  notes?: string[];
  /**
   * What the command's body reaches of spine-core, as data (issue #1052):
   * `false` when nothing — it runs in an entry that links none of the runtime
   * (`cli_core.ts`) — and otherwise what it runs through the runtime for,
   * which is what that entry says when it refuses the command. ⚠️ Not a
   * claim anybody keeps by hand: `RC26` in `selftest.ts` derives it from the
   * import graph of the module whose bodies register the command, and a
   * mark that disagrees with the graph is red by name.
   *
   * `rerunsTheGate` marks a command whose body re-runs the gate `build` ran
   * before it wrote (`validate`): refused by the entry that links none of the
   * runtime and pointed at a rigc build, its refusal says that gate already
   * ran (`gatedOnWrite`, issue #1097).
   */
  runtime: false | { for: string; core?: CoreBody; rerunsTheGate?: true };
  /**
   * Whether the command exists for the Spine format — reads, writes, compares
   * or embeds Spine skeleton data as the whole of what it does with it — so
   * the commands that are Spine's without being the runtime's (`ingest`,
   * `diff`) can be moved to another side in one place.
   */
  spineFormat: boolean;
  /**
   * A command whose body is another package's bin (issue #1457): the dispatch
   * hands it every argument after the name untouched — nothing is parsed as a
   * flag, `--help` included, so its page is the delegate's own — and the
   * delegate's exit code is the command's. `flags` is empty for that reason:
   * rigc documents no flag of a program it does not own. A control that reads
   * a command's flag table off `--help` reads it off the commands without this.
   */
  delegate?: { package: string; bin: string };
}

export const COMMANDS: CommandDoc[] = [
  {
    name: 'build',
    runtime: {
      for: 'the gate round-trips every build through it before anything is written',
      core: {
        usage: [
          'rigc build --rig <path> --motion <path> --out <dir> [--manifest <path>] [--images <dir>] [--profile spine|rig-play] [--copy-images] [--report <file>]   (the same files the round-tripped build writes; gated without spine-core — see build --help)',
          `rigc build … --pack [--page-size ${DEFAULT_PAGE_SIZE}] [--padding ${DEFAULT_PADDING}] [--page-edges pot|free] [--pack-shape rect|polygon]   (parts onto shared pages, written into --out)`,
          'rigc build … --atlas-in <skeleton.atlas>                    (resolve the parts against a pack somebody already made)',
          'rigc build --cut <name> --cuts <cuts.json>',
        ],
        notes: [
          'this entry\'s build writes what the entry that links spine-core writes — skeleton.json,',
          'skeleton.atlas, skeleton.model.json and the pages --pack or --copy-images put in',
          '--out — by the same body, and only when no assertion fails. Its gate is not the round',
          'trip through spine-core, which this entry links none of. What runs instead: the model',
          'side over the document (every assertion moved off the round trip), and the round',
          'trip\'s own rules restated over the text the emitter wrote — A01, A02, A05, A07, A16,',
          'A31, A35, A52, and A18 over a second, independent compile\'s skeleton, atlas and document.',
          'What does not run is A00_ROUNDTRIP_PARSE, spine-core\'s parse: it reports SKIP naming',
          'spine-core. The report\'s last line says which ran here and which did not. A00 runs',
          'in build and validate on the entry that links spine-core: installed, the same `rigc`',
          'runs that entry once @esotericsoftware/spine-core is installed beside the package',
          '(`rigc --version` names the entry that ran); from a source checkout, it is',
          '`bun cli.ts`.',
        ],
      },
    },
    spineFormat: true,
    usage: [
      'rigc build --rig <path> --motion <path> --out <dir> [--manifest <path>] [--images <dir>] [--profile spine|rig-play] [--copy-images] [--report <file>]',
      `rigc build … --pack [--page-size ${DEFAULT_PAGE_SIZE}] [--padding ${DEFAULT_PADDING}] [--page-edges pot|free] [--pack-shape rect|polygon]   (parts onto shared pages, written into --out)`,
      'rigc build … --atlas-in <skeleton.atlas>                    (resolve the parts against a pack somebody already made)',
      'rigc build --cut <name> --cuts <cuts.json>',
    ],
    flags: [
      'rig',
      'motion',
      'out',
      'manifest',
      'images',
      'copy-images',
      'pack',
      'page-size',
      'padding',
      'page-edges',
      'pack-shape',
      'atlas-in',
      'cut',
      'cuts',
      'profile',
      'report',
    ],
  },
  {
    name: 'repack',
    runtime: {
      for: 'the rebuild it writes is gated by build\'s gate, which round-trips it through spine-core',
      core: {
        usage: [
          `rigc repack <dir | skeleton.json> --out <dir> [--atlas <path>] [--page-size ${DEFAULT_PAGE_SIZE}] [--padding ${DEFAULT_PADDING}] [--page-edges pot|free] [--pack-shape rect|polygon] [--profile spine|rig-play] [--stage x,y,w,h] [--stage-box <slot>] [--accept-skeleton-differences] [--report <file>]   (gated without spine-core — see repack --help)`,
          `rigc repack <dir | skeleton.json> --out <dir> --keep-pages [--atlas <path>] [--profile spine|rig-play] [--stage x,y,w,h] [--stage-box <slot>] [--report <file>]   (skeleton.model.json alone, pages kept)`,
        ],
        notes: [
          'a packed build repacked from its own output — skeleton.json, skeleton.atlas and the',
          'pages: every region lifted off its page, the skeleton read back (ingest --art loose),',
          'and build --pack over the lifted parts, in a work directory under the system temp',
          'directory that is removed when the command ends. Nothing reaches --out until three',
          'things are shown, each on its own line: (a) every region lifted off the new pages is',
          'pixel-identical, by name, to the same region off the input\'s (under --pack-shape',
          'polygon, a region only meshes draw over the footprint the page keeps as its own); (b) the rebuilt',
          'skeleton.json is byte-identical to the input\'s — the pack owns the atlas and the pages',
          'and none of the skeleton; (c) the gate is green. On this entry that gate is build\'s',
          'here: the model side over the document and the round trip\'s own rules restated over',
          'the emitted text, A00_ROUNDTRIP_PARSE a SKIP naming spine-core. An atlas the lift',
          'cannot read exactly is refused by name before anything is made: docs/AUTHORING.md',
          '§0.4 lists what is accepted and what is refused, and why. --keep-pages writes',
          'skeleton.model.json alone, for the atlas and pages as they stand (see repack --help).',
        ],
      },
    },
    spineFormat: true,
    usage: [
      `rigc repack <dir | skeleton.json> --out <dir> [--atlas <path>] [--page-size ${DEFAULT_PAGE_SIZE}] [--padding ${DEFAULT_PADDING}] [--page-edges pot|free] [--pack-shape rect|polygon] [--profile spine|rig-play] [--stage x,y,w,h] [--stage-box <slot>] [--accept-skeleton-differences] [--report <file>]`,
          `rigc repack <dir | skeleton.json> --out <dir> --keep-pages [--atlas <path>] [--profile spine|rig-play] [--stage x,y,w,h] [--stage-box <slot>] [--report <file>]   (skeleton.model.json alone, pages kept)`,
    ],
    flags: ['out', 'atlas', 'page-size', 'padding', 'page-edges', 'pack-shape', 'profile', 'stage', 'stage-box', 'accept-skeleton-differences', 'keep-pages', 'report'],
    overrides: {
      out: {
        value: '<dir>',
        meaning:
          'the directory the repacked build is written into — skeleton.json, skeleton.atlas, skeleton.model.json and the ' +
          'pages, exactly what build --pack writes — absent or empty, and refused otherwise: a page an earlier pack wrote ' +
          'and this one does not would stay beside the new atlas with nothing naming it. Written only after the three checks',
      },
      atlas: { meaning: "the build's atlas, when it is not skeleton.atlas beside the skeleton (a skeleton.json path with several .atlas files beside it needs it)" },
    },
    notes: [
      'a packed build repacked from its own output — skeleton.json, skeleton.atlas and the',
      'pages: every region lifted off its page, the skeleton read back (ingest --art loose),',
      'and build --pack over the lifted parts with the packing flags above, which mean what',
      'they mean to build --pack (repack always packs). The work runs in a directory under the',
      'system temp directory that is removed when the command ends. Nothing reaches --out until',
      'three things are shown, each on its own line: (a) every region lifted off the new pages',
      'is pixel-identical, by name, to the same region off the input\'s (under --pack-shape',
      'polygon, a region only meshes draw over the footprint the page keeps as its own); (b) the rebuilt',
      'skeleton.json is byte-identical to the input\'s — the pack owns the atlas and the pages',
      'and none of the skeleton (--accept-skeleton-differences writes a rebuild that differs,',
      'every differing path printed); (c) build\'s gate is green. Under the settings the input was',
      'packed with, a line says the atlas and pages came back byte-identical; under others the',
      'pages differ by design and (a) is the guarantee. An atlas the lift cannot read exactly',
      '— a page scale, premultiplied alpha, a region named twice, a region off its page, a page',
      'that is missing — is refused by name before anything is made: docs/AUTHORING.md §0.4',
      'lists what is accepted and what is refused, and why. The stage line says which stage the',
      'rebuild declared and where it was read (--stage, the skeleton.model.json beside the',
      'pair, or the header\'s box).',
      '--keep-pages writes skeleton.model.json alone, for the atlas and pages as they stand (a',
      'player that reads the document beside pages already shipped): the same read, the same',
      'ingest and stage rules, then build --atlas-in over the input atlas, which writes no page.',
      '(a) the document states the atlas\'s pages and regions field for field; (b) the rebuilt',
      'skeleton.json is byte-identical to the input\'s, so spine.sha256 names the file on disk',
      '(no acceptance: a digest of another skeleton is the document it must not write); (c) the',
      'gate is green. A turned, trimmed, scaled or premultiplied page is stated as it is; a line',
      'the document has no field for is refused by name. Nothing in the three files records a',
      'texel, so a page edited after its pack is not seen: the document states placement only.',
    ],
  },
  {
    name: 'explain',
    runtime: false,
    spineFormat: false,
    usage: [
      'rigc explain --rig <path> --motion <path> --out <dir> [--manifest <path>] [--images <dir>] [--poser core|spine]   (it never gates, and writes nothing)',
      'rigc explain … --atlas-in <skeleton.atlas>                  (resolve the parts against a pack somebody already made, as build does)',
      'rigc explain --cut <name> --cuts <cuts.json>',
      'rigc explain … --lever-fold <fraction>                     (also name the steps a scaleX lever divides by a collapsed length)',
    ],
    flags: ['rig', 'motion', 'out', 'manifest', 'images', 'atlas-in', 'cut', 'cuts', 'poser', 'lever-fold'],
    notes: [
      'this line said "the same arguments as build, minus --profile" and was false in both',
      'directions (issue #697): --atlas-in was not listed here, so the one flag that lets this',
      'command read what `ingest --art none` writes was reachable and undocumented, while',
      '--pack, --page-size, --padding, --page-edges, --pack-shape and --copy-images are build\'s and do nothing here —',
      'they decide what is WRITTEN, and this command writes nothing. What it takes is listed',
      'above, and that is now the whole of it.',
    ],
  },
  {
    name: 'validate',
    runtime: { for: 'the gate it re-runs is the round trip through it', rerunsTheGate: true },
    spineFormat: true,
    usage: [
      'rigc validate <dir | skeleton.json> [--atlas <path>] [--profile spine|rig-play]',
      'rigc validate --cut <name> --cuts <cuts.json>   (also re-derives declared durations)',
    ],
    flags: ['atlas', 'profile', 'cut', 'cuts', 'rig', 'motion', 'out', 'manifest', 'images'],
  },
  {
    name: 'ingest',
    runtime: false,
    spineFormat: true,
    usage: ['rigc ingest <skeleton.json> --out <dir> [--name <n>] [--art loose|none] [--images <dir>] [--stage x,y,w,h] [--stage-box <slot>]'],
    flags: ['out', 'name', 'art', 'images', 'stage', 'stage-box'],
    overrides: {
      out: {
        value: '<dir>',
        meaning: 'directory to write rig.json, motion.json and findings.json into — the two specs that rebuild this skeleton',
      },
      images: {
        value: '<dir>',
        meaning:
          "WRITE the rig spec's own images directory, spelled relative to --out, so the rebuild is a plain `build " +
          '--rig … --motion … --out …` with no flag. ⚠️ The opposite direction from `build --images`, which ' +
          'OVERRIDES that field: this one fills it in. Without it the field is left out and every `image` resolves ' +
          'against --out itself. Refused together with --art none, which writes no `image` for it to be the base of',
      },
    },
  },
  {
    name: 'split',
    runtime: false,
    spineFormat: false,
    usage: ['rigc split --rig <path> --motion <path> --slot <name> [--attachment <name>] [--skin <name>] --out <dir>'],
    flags: ['rig', 'motion', 'slot', 'attachment', 'skin', 'out'],
    overrides: {
      out: {
        value: '<dir>',
        meaning:
          'directory to write the proposal into — rig.json and motion.json, the two specs with the mesh split, and ' +
          'split.json, where every original vertex and triangle went. Absent or empty, and refused otherwise: the ' +
          "proposal never lands on top of a file, the author's own specs included",
      },
      slot: {
        value: '<name>',
        meaning: 'the slot whose mesh to split, as the rig spec declares it. A name it does not declare is refused with every one it does',
      },
      skin: {
        meaning:
          'the skin the mesh is filed under in the rig spec (default: default). A name the rig spec does not declare ' +
          'is refused with the ones it does',
      },
    },
    notes: [
      'split reads the two specs — not a build: a mesh of several pieces does not build —',
      'and finds the pieces of one authored mesh: triangles that share a vertex are one piece.',
      'A mesh of one piece is said so on one line, exit 0, and nothing is written. Otherwise it',
      'writes one mesh per piece: piece 1 (the piece whose first triangle is listed first) stays',
      'in the slot, piece k gets a new slot <slot>_<k> on the same bone, after it in the draw',
      "order, under the same placeholder. Each piece carries the original's uvs and weights (or",
      'vertices) unchanged and its triangles renumbered — outline first where the hull rule',
      'needs it — and every deform key is re-sliced to the new indices; colour and attachment',
      'tracks on the slot are copied to the new slots. Nothing is invented: a deform index the',
      'original run did not cover is written 0, which is what the parser held there. What the',
      'split cannot carry is refused by name, exit 1 (docs/AUTHORING.md §3.4.11 lists it); a',
      'name the specs do not have is refused with the names they do, exit 2. Nothing is ever',
      'written over the specs it read: build the proposal, look at it, then adopt it.',
    ],
  },
  {
    name: 'diff',
    runtime: false,
    spineFormat: true,
    usage: ['rigc diff <candidate.json> <reference.json> [--as <candidate>=<reference>]… [--json <out>]'],
    flags: ['as', 'json'],
    overrides: {
      as: {
        value: '<candidate>=<reference>',
        meaning:
          'pair a candidate animation with a reference one, so the name-agnostic `animations` block can be ' +
          'measured over shots the two files call different things. Repeatable, one pair each. An INPUT and never ' +
          'derived: two skeletons cannot say which of their shots are the same shot. Without it the block appears ' +
          'only when each side has exactly one animation, which pairs by position, and is otherwise absent rather ' +
          'than guessed',
      },
    },
    notes: [
      'the `animations` block reads two figures once something has paired the shots, exactly as',
      '`bones` and `slots` do: name-matched, where `names` lives, and name-agnostic over the pair.',
      'A candidate that followed a brief withholding the animation name reads `count` 1/1 and 0.000',
      'on every other name-matched measure — including `duration` and `key_counts` it may have got',
      'exactly right — so read the pair and not the section mean.',
    ],
  },
  {
    name: 'check',
    runtime: false,
    spineFormat: false,
    usage: ['rigc check --candidate <dir | skeleton.json> --frames <dir> [flags]'],
    flags: ['candidate', 'frames', 'atlas', 'texture-from', 'fps', 'viewport', 'framing', 'as', 'skin', 'poser', 'all-frames', 'json', 'out'],
    overrides: {
      skin: {
        meaning:
          'pose the CANDIDATE under this skin, by the name it declares. Without it no skin is set and the ' +
          'default skin alone is compared, which for a multi-skin rig is a comparison that can see none of the ' +
          'contested art. The frames are checked back: a set whose frames.json records a different skin is ' +
          'REFUSED by name, and one that records none says so in the report rather than pretending to agree',
      },
      out: {
        value: '<dir>',
        meaning:
          'also write the PICTURE each listed frame\'s figures came from, as <dir>/<set>/f####.png: reference, ' +
          'candidate, difference and overlay side by side at the comparison grid\'s native size, with the table\'s ' +
          'figures burned in and one row per slot under them, beside a frames.json that says what they are pictures ' +
          'of. The frames are the ones the table lists, so --all-frames writes every compared one. Each <dir>/<set>/ ' +
          'is cleared first; a file at <dir>, or a directory that is or holds --frames, is refused. See ' +
          'docs/AUTHORING.md §9.2.1',
      },
    },
    notes: [
      'every figure here is a reporting threshold, not a pass bar. Nothing in this report',
      'grades, no number has to beat anything, and the exit code says only whether the',
      'comparison could be MADE: 0 when it ran — including the build with every easing',
      'reversed, which is the defect this command exists for — 1 when it could not (frames',
      'that are not there, a skin the frames do not record, a candidate that will not load),',
      '2 on the flags.',
      '',
      'So read a figure against a floor you measured yourself: render the first green build',
      'and keep its frames, then check every later build against them. The identity run of',
      'that pair is the floor, and it is not zero — docs/AUTHORING.md §9.2 states it, what',
      'it comes from, and which column separates a wrong curve from a moved key.',
    ],
  },
  {
    name: 'bench',
    runtime: { for: 'the gate runs before anything is measured, and --bones poses the rung\'s reference skeletons through it' },
    spineFormat: false,
    usage: [`rigc bench <${RUNG_IDS.join(' | ')}> --candidate <dir | skeleton.json> [--frames <dir>] [flags]`],
    flags: ['candidate', 'atlas', 'frames', 'profile', 'bones', 'all-frames', 'all-bones', 'json'],
    overrides: {
      bones: {
        meaning:
          'also run the stage-3 per-frame bone world-transform distance against each of the rung\'s reference ' +
          `skeletons, with this correspondence (or \`identity\`), at ${PROTOCOL_FPS} fps. Reports; gates nothing — ` +
          'for another sampling rate call `rigc bonedist` directly, where --fps means only that',
      },
    },
  },
  {
    name: 'bonedist',
    runtime: { for: 'it poses both skeletons through it, by design' },
    spineFormat: false,
    usage: [
      `rigc bonedist --candidate <dir | skeleton.json> --reference <dir | skeleton.json> --bones <path | ${IDENTITY_CORRESPONDENCE}> [--fps ${PROTOCOL_FPS}] [--all-bones] [--json <out>]`,
    ],
    flags: ['candidate', 'atlas', 'reference', 'reference-atlas', 'bones', 'fps', 'all-bones', 'json'],
    overrides: {
      fps: { meaning: `the rate both skeletons are sampled at, from t=0 over their own durations (default ${PROTOCOL_FPS})` },
    },
  },
  {
    name: 'render',
    runtime: false,
    spineFormat: false,
    usage: [
      'rigc render --candidate <dir | skeleton.json> [--animation <name>] [--skin <name>] [--fps 12] [--max 256] [--geometry] [--folds] [--poser core|spine] [--out render/]',
      'rigc render … --slot <name[,name…]> | --hide <name[,name…]>   (a subset of the slots, on the whole rig\'s grid)',
      'rigc render … --environment <schedule.json>   (the wind and gravity the physics answers, in time)',
      'rigc render … --pass-through <cloth>:<leg>[,…]   (the frames where a cloth drawn over a leg passes through it)',
      'rigc render … --seam <slot>:<slot>[,…]   (the frames where two slots that meet open a gap or show a ghost)',
      'rigc render … --angle-range <bone>:<relative-to>[,…]   (how far a bone turns against another, per animation)',
      'rigc render … --viewport <x,y,w,h> | --viewport-from <frames.json>   (a box given, not fitted: two renders on one pixel grid)',
    ],
    flags: ['candidate', 'atlas', 'animation', 'skin', 'slot', 'hide', 'fps', 'max', 'viewport', 'viewport-from', 'geometry', 'folds', 'pass-through', 'seam', 'angle-range', 'environment', 'poser', 'out'],
    overrides: {
      out: { value: '<dir>', meaning: 'directory to write the frame series into (default `render/`)' },
      fps: {
        meaning:
          `frames per second to sample the animation at (default ${PROTOCOL_FPS}). A set drawn at any rate but the default is written to ` +
          '`<anim>@<fps>fps/` rather than `<anim>/`, so two rates sit side by side: `--fps 24` writes `<anim>@24fps/`, and the default 12 writes `<anim>/`',
      },
      viewport: {
        meaning:
          'draw every frame over this world box, y up — x,y its bottom-left corner, the numbers frames.json\'s `viewport` records — ' +
          'instead of the box fitted to the rig; its pixel size follows from --max. A slot that reaches past the box is named by set and ' +
          'frame, with how far and on which side: what lies past it is not drawn, since each frame is the box. frames.json records that ' +
          'the box was given, and those slots, under `pinned`. Not with --viewport-from',
      },
    },
  },
  {
    name: 'inspect',
    runtime: false,
    spineFormat: false,
    usage: [
      'rigc inspect --candidate <dir | skeleton.json> [--show art,bones,…] [--dim] [--max 256] [--poser core|spine] [--out inspect.png]   (the setup pose)',
      'rigc inspect … --animation <name> --at <s[,s…]> [--fps 12] [--skin <name>]   (one time, or a sheet of several on one grid)',
      'rigc inspect … --zoom <bone|slot|folds>[:<pad>] | --viewport <x,y,w,h>   (a box, in world units)',
      "rigc inspect … --bone 'bang_*' --hide-bone '*_ctl'   (which bones bones, axes and names draw)",
      'rigc inspect … --overlay-slot neck --hide-overlay-slot <glob>   (which slots mesh, hull, weights, density, folds and slots draw; the art stays whole)',
      'rigc inspect … --compare <dir | skeleton.json>   (a second build beside the first, on one transform)',
    ],
    flags: ['candidate', 'atlas', 'show', 'dim', 'animation', 'at', 'fps', 'skin', 'zoom', 'viewport', 'bone', 'hide-bone', 'overlay-slot', 'hide-overlay-slot', 'compare', 'max', 'poser', 'out'],
    overrides: {
      animation: { meaning: 'the animation --at reads its times from (default: the setup pose, with no --at)' },
      fps: { meaning: `the frame grid --at is read on, which is the grid \`render --fps\` draws (default ${INSPECT_DEFAULT_FPS})` },
      viewport: { meaning: 'frame the picture to this world box, y up — x,y its bottom-left corner — instead of render\'s framing of the whole rig' },
      out: {
        value: '<file.png>',
        meaning:
          'the picture to write (default `inspect.png`; a directory means that name in it), and beside it the legend, the same ' +
          'path with .json for .png: the world-to-pixel transform both ways, what each colour means, and every bone\'s origin ' +
          'and tip in world units and in pixels',
      },
    },
    notes: [
      'inspect draws one moment of the build for an agent to read, and its legend says',
      'where every mark is in world units and in pixels. It poses through the poser',
      'render would pose the candidate with, and the poser line says which. Without',
      '--zoom or --viewport the picture is framed as render frames the build, so its',
      'art is render\'s frame at the same time and --max. Nothing in it is a score.',
    ],
  },
  {
    name: 'preview',
    runtime: { for: "its gate line is the round trip's, and it names the pages it embeds through spine-core's atlas reader" },
    spineFormat: true,
    usage: ['rigc preview --candidate <dir | skeleton.json> [--candidate <another> …] [--animation <name>] [--out preview.html]'],
    flags: ['candidate', 'atlas', 'animation', 'out'],
    overrides: {
      candidate: {
        value: '<dir|skeleton.json>',
        meaning:
          'a compiled skeleton: a directory holding skeleton.json + skeleton.atlas, or a skeleton.json path. Repeat it ' +
          'for one page with a pane per candidate, in the order given; the same skeleton twice is refused. Each ' +
          'header carries the line `rigc validate <dir>` prints for that candidate, measured when the page is written',
      },
      atlas: { meaning: "the candidate's atlas, when it is not beside the skeleton — one candidate only" },
      animation: {
        meaning:
          "the animation to start on (default: each candidate's own first). With several candidates every one of " +
          'them must have it, or the run is refused naming the one that does not',
      },
      out: {
        value: '<file>',
        meaning: 'the .html file to write (default `preview.html`); a directory means "the default name in here"',
      },
    },
  },
  {
    name: 'pose',
    runtime: false,
    spineFormat: false,
    usage: [
      `rigc pose --images <dir> --frame <path> [--scale ${DEFAULT_SCALE_MIN},${DEFAULT_SCALE_MAX}] [--rotation -180,180] [--out ${DEFAULT_POSE_OUT}]`,
    ],
    flags: ['images', 'frame', 'scale', 'rotation', 'max-residual', 'out'],
    overrides: {
      images: { value: '<dir>', meaning: 'the loose part PNGs to place; every `.png` in it is a part, in name order' },
      out: {
        value: '<file>',
        meaning: `the .json report to write (default \`${DEFAULT_POSE_OUT}\`); a directory means "the default name in here"`,
      },
    },
  },
  {
    name: 'chainfit',
    runtime: false,
    spineFormat: false,
    usage: [
      `rigc chainfit --candidate <dir | skeleton.json> --images <dir> --frame <path> [--anchor pose.json] [--out ${DEFAULT_CHAINFIT_OUT}]`,
    ],
    flags: [
      'candidate',
      'images',
      'frame',
      'anchor',
      'hinge',
      'stretch',
      'min-visible',
      'max-residual',
      'passes',
      'anchor-residual',
      'inward-lever',
      'scale',
      'rotation',
      'out',
    ],
    overrides: {
      images: {
        value: '<dir>',
        meaning:
          "where each attachment's image name resolves to a loose PNG. ⚠️ NOT a part list the way `pose --images` " +
          'is one — the candidate decides what the parts are, so extra PNGs in here are simply unused and a name ' +
          'the directory lacks is refused by name',
      },
      scale: {
        meaning:
          'the scale window the INTERNAL anchor pass searches, as frame pixels per part pixel (default ' +
          `\`${DEFAULT_SCALE_MIN},${DEFAULT_SCALE_MAX}\`). Refused together with --anchor, which means there is no internal pass`,
      },
      rotation: {
        meaning:
          'the rotation window the INTERNAL anchor pass searches, in screen degrees (default `-180,180`). Refused ' +
          'together with --anchor — the chains\' own window is --hinge',
      },
      out: {
        value: '<file>',
        meaning: `the .json report to write (default \`${DEFAULT_CHAINFIT_OUT}\`); a directory means "the default name in here"`,
      },
    },
  },
  {
    name: 'vote',
    runtime: { for: "it names each candidate's pages through spine-core's atlas reader, as preview does" },
    spineFormat: true,
    usage: [
      `rigc vote --candidate <dir | skeleton.json> --candidate <…> [--candidate …] [--animation <name>] [--out ${DEFAULT_BALLOT}]`,
      `rigc vote --record <result.json> [--ballot ${DEFAULT_BALLOT}] [--ledger ${DEFAULT_LEDGER}] [--again]`,
    ],
    flags: ['candidate', 'animation', 'out', 'record', 'ballot', 'ledger', 'again'],
    overrides: {
      candidate: {
        value: '<dir|skeleton.json>',
        meaning: `repeat it ${MIN_CANDIDATES}–${MAX_CANDIDATES} times — one compiled artifact per pane, labelled A, B, C, D in the order given`,
      },
      animation: {
        meaning:
          'the one animation every pane plays (default: the first of candidate A). A candidate that does not have ' +
          'it is refused — two panes playing two animations is not a comparison',
      },
      out: {
        value: '<file>',
        meaning: `the .html ballot to write (default \`${DEFAULT_BALLOT}\`); a directory means "the default name in here"`,
      },
    },
  },
  {
    name: 'guide',
    runtime: false,
    spineFormat: false,
    usage: [
      'rigc guide <RULE>             (the guide\'s row for the rule a failure line names — the line ends with this command)',
      'rigc guide §<n> | §<n>.<m> | §<n>.<m>.<k> [--all]    (a section\'s own prose and subsection index; --all includes their bodies)',
    ],
    flags: ['all'],
    notes: [
      'guide reads the docs/AUTHORING.md this command ships with, at the moment it runs, and',
      'prints a slice of it — the row(s) whose first cell names the rule, each under the',
      'file, section and heading it sits in, or a section\'s heading, own prose and child index.',
      '§<n> is ## <n>., §<n>.<m> the m-th ### under it, §<n>.<m>.<k> the k-th #### under that.',
      '--all includes the subsection bodies; a leaf prints its full text either way. The',
      'header and index sizes describe full ledger spans. --all with a rule is refused.',
      'An ingest finding',
      'code\'s row lives in docs/INGEST.md\'s finding-code table, and its answer names that',
      'file. A name the guide does not have is refused with the nearest real names, exit 1.',
    ],
  },
  {
    name: 'skills',
    runtime: false,
    spineFormat: false,
    usage: [`rigc skills install [--dir ${DEFAULT_SKILLS_DIR}] [--copy]   (every skill this package ships, where an agent host looks)`],
    flags: ['dir', 'copy'],
    notes: [
      'the skills installed are the skills/ directory of the package this command runs from,',
      'never whatever the working directory holds. Each becomes <dir>/<name>: a relative',
      'symlink into that folder, or with --copy a copy of it. An entry already there that',
      'is not a link to the same folder — or, with --copy, not the same bytes — is refused',
      'by name, exit 1, and nothing is written; a run over only what this command made has',
      'nothing to do and exits 0. Codex, Gemini CLI and Antigravity read',
      `<workspace>/${DEFAULT_SKILLS_DIR}; Claude Code installs the plugin instead (README,`,
      '"Install it into your agent").',
    ],
  },
  {
    name: 'review',
    runtime: false,
    spineFormat: false,
    delegate: { package: '@rig-c/review', bin: 'rig-review' },
    usage: [
      "rigc review <dir> [...]      (@rig-c/review's rig-review, installed beside: every argument handed over untouched, its exit code returned — `rigc review open <dir>` prints a loopback URL to give a person, `rigc review --help` is rig-review's own usage)",
    ],
    flags: [],
  },
];

/** Every command's name, in the order the usage lists them — what the full entry dispatches over. */
export const KNOWN_COMMANDS = COMMANDS.map((c) => c.name);

/** `rigc <command> --help`: that command's own usage line(s) and flag table, as the entry running it (`docs`) documents it. */
export function commandHelp(name: string, docs: readonly CommandDoc[] = COMMANDS): string {
  const doc = docs.find((c) => c.name === name);
  if (!doc) throw new Error(`internal: no help text for command "${name}"`);
  const keys = [...doc.flags, 'help'];
  const value = (key: string): string | undefined => doc.overrides?.[key]?.value ?? FLAG_VALUES[key];
  const meaning = (key: string): string => doc.overrides?.[key]?.meaning ?? FLAG_MEANINGS[key];
  const labels = keys.map((key) => `--${key}${value(key) ? ` ${value(key)}` : ''}`);
  const width = Math.max(...labels.map((l) => l.length)) + 2;
  return [
    'usage:',
    ...doc.usage.map((u) => `  ${u}`),
    '',
    'flags:',
    ...keys.map((key, i) => `  ${labels[i].padEnd(width)}${meaning(key)}`),
    ...(doc.notes === undefined ? [] : ['', ...doc.notes]),
  ].join('\n');
}

/**
 * The usage's paragraphs under the invocation lines, each with the commands it
 * is about (issue #1052): an entry prints a paragraph only when every command
 * it names is one the entry runs, so `cli_core.ts`'s page says nothing about a
 * command it does not have, and `cli.ts`'s — which runs every one — is the
 * page it always was, byte for byte. The `--cuts` paragraph is about a flag
 * rather than a command, and is printed wherever a command takes it. The
 * `--profile` paragraph states each profile's rule count, which only the
 * validator knows (`CliEntry.profileRules`).
 */
const USAGE_PARAGRAPHS: ReadonlyArray<{ about: readonly string[] | { flag: string }; lines: (rules: (profile: 'spine' | 'rig-play') => number) => string[] }> = [
  {
    about: ['build', 'validate', 'bench'],
    lines: (rules) => [
      'build, validate and bench take --profile spine|rig-play:',
      '  spine       is this valid Spine 4.3 that any runtime plays correctly?',
      `              THE DEFAULT — ${rules('spine')} rules, and the question the output answers when`,
      '              you import it into the Spine editor.',
      '  rig-play    the above, plus this project\'s renderer and archetype policy:',
      `              all ${rules('rig-play')} rules, opt-in. Those extra ` +
        `${rules('rig-play') - rules('spine')} fire on real, correct,`,
      '              editor-produced Spine data, so they are somebody\'s policy rather',
      '              than anybody\'s validity.',
      '',
      'Every report names the profile that judged it and lists, on PROF lines, the',
      'rules that profile left out.',
    ],
  },
  {
    about: ['repack'],
    lines: () => [
      'repack takes a packed build whose parts were not kept — skeleton.json, skeleton.atlas and',
      'the pages — and packs it again under build --pack\'s packing flags, so a packer',
      'improvement reaches a build without its parts:',
      '  rigc repack build/ --out build.free/ --page-edges free --pack-shape polygon',
      'It writes only after every region is shown pixel-identical, the skeleton byte-identical',
      'and the gate green, and refuses by name an atlas it cannot lift exactly. See',
      '`rigc repack --help`.',
    ],
  },
  {
    about: ['check'],
    lines: () => [
      'check renders the candidate onto the reference frames\' own pixel grid, fitting it',
      'there by its own drawn pixels, and compares. It reads the frames and never the',
      'reference skeleton, so it belongs INSIDE an authoring loop — the validator cannot',
      'see a wrong animation and this can. See `rigc check --help` for its flags.',
    ],
  },
  {
    about: ['render', 'preview'],
    lines: () => [
      'render and preview are how you LOOK at a build, and they need no reference at all:',
      '  rigc render  --candidate <the dir build --out wrote>    PNG frames + a contact sheet',
      '  rigc preview --candidate <the same dir>                 one .html file that plays it',
      'A rig with its head off its torso passes the gate and steps cleanly — the offsets',
      'are the ones you asked for — so looking is the only thing that catches it. render',
      'draws with rigc\'s own rasteriser; preview embeds the artifact in a page that plays',
      'it in the official Spine Web Player, which is also the interop proof.',
    ],
  },
  {
    about: ['ingest'],
    lines: () => [
      'ingest runs build backwards: it reads a Spine 4.3 skeleton.json and writes the rig',
      'spec and motion spec that rebuild it, so an existing skeleton becomes a starting',
      'point instead of something to retype:',
      '  rigc ingest hero.json --out specs/ --images parts/         rig.json + motion.json',
      'The contract is an equality, not a rulebook: build(ingest(x)) is x, byte for byte.',
      'It reads the skeleton and nothing else — no .spine project, no binary .skel, no',
      'atlas — so how the spec reaches the art is the caller\'s (--art) and is not guessed.',
      'A setup stage the skeleton states is read; one it does not state is carried as',
      'absent, and --stage is how a caller adds a box to such a file — beside a box the',
      'file states, the flag is refused rather than ignored. --images <dir> WRITES the rig',
      'spec\'s own images directory, relative to --out, so the rebuild needs no flag.',
      'Everything the spec format cannot hold is printed as a named finding and',
      'exits non-zero, with both files still written, because a spec plus a list of what',
      'is missing from it beats no spec at all.',
    ],
  },
  {
    about: ['split'],
    lines: () => [
      "split answers the refusal a mesh of several pieces meets at compile — the triangles'",
      'outline is not one closed loop — with one mesh per piece, its uvs, weights, triangles',
      'and deform keys renumbered, written beside the specs and never over them:',
      '  rigc split --rig rig.json --motion motion.json --slot legs --out split/',
      'Build what it wrote. See `rigc split --help`.',
    ],
  },
  {
    about: ['pose'],
    lines: () => [
      'pose runs the other way round from everything above: it reads a picture you already',
      'have — one key pose — and reports where each loose part PNG sits in it (x, y, rotation,',
      'scale) so an agent can state those poses in a spec by construction:',
      '  rigc pose --images parts/ --frame poseA.png       pose.json, one entry per part',
      'It grades nothing and no pass bar attaches to its numbers. The residual is a trust',
      'signal, and where two placements are equally good it reports BOTH rather than picking —',
      'two identical limbs look exactly like that. A part that matches nowhere, a part the',
      'canvas cannot contain and a part whose rotation is a free degree of freedom are each',
      'named as such. See `rigc pose --help`.',
    ],
  },
  {
    about: ['pose', 'chainfit'],
    lines: () => [
      'chainfit reads the half of that picture pose refuses. It is the same question with',
      'one more input — the candidate rig — and that input buys two things: draw order, so',
      'the pixels another part covers are EXCLUDED from a part\'s residual instead of',
      'charged to it, and hierarchy, so a child of a placed bone is searched over one hinge',
      'instead of four degrees of freedom:',
      '  rigc chainfit --candidate build/ --images parts/ --frame poseA.png',
      'Every residual is over the part\'s VISIBLE pixels and comes with the `visibleShare` it',
      'was computed on, so a mostly-hidden answer carries its own uncertainty. It grades',
      'nothing either: a part too far behind the others is refused by the visibility floor,',
      'a limb with no trusted part on it or above it is refused `no-anchor`, and two hinge',
      'answers that explain the picture equally well are both reported. See',
      '`rigc chainfit --help`.',
    ],
  },
  {
    about: ['preview', 'vote'],
    lines: () => [
      'vote is the same page with two to four builds in it and an answer coming back:',
      '  rigc vote --candidate <build A> --candidate <build B>   ballot.html, panes labelled A and B',
      '  rigc vote --record vote-<id>.json --ballot ballot.html  check it, append it to votes.jsonl',
      'Reach for it where the instruments have run out — a choice with no reference behind',
      'it, two fits that measure the same. The panes carry no paths, a tie is a recorded',
      'answer rather than a missing one, and a result whose hashes are not the ballot\'s is',
      'refused by name instead of appended.',
    ],
  },
  {
    about: ['skills'],
    lines: () => [
      'skills install puts the agent skills this package ships where an agent host looks',
      'for them, since none of them reads node_modules:',
      `  rigc skills install               relative links in ${DEFAULT_SKILLS_DIR}, which Codex, Gemini CLI`,
      '                                    and Antigravity read; --copy writes the folders instead',
      'An entry already there that this command did not make is refused by name and',
      'nothing is written; a second run has nothing to do. See `rigc skills --help`.',
    ],
  },
  {
    about: { flag: 'cuts' },
    lines: () => [
      'a cuts.json is { "<name>": { "rig": "...", "motion": "...", "out": "...",',
      '                             "manifest": "..." (optional) } }, with every path',
      'resolved relative to the cuts.json file itself.',
    
    ],
  },
];

/**
 * The usage page of an entry that runs `docs` — the commands' invocation
 * lines, then every paragraph about only those commands (`USAGE_PARAGRAPHS`).
 * `checkout` is the file a source checkout runs this entry as.
 */
export function usageText(docs: readonly CommandDoc[], checkout: string, rules: ((profile: 'spine' | 'rig-play') => number) | undefined): string {
  const names = new Set(docs.map((doc) => doc.name));
  const takes = (flag: string): boolean => docs.some((doc) => doc.flags.includes(flag));
  const lines = [
    'rigc — the rig compiler',
    '',
    checkout === 'cli.ts'
      ? '(from a source checkout: `bun cli.ts <command>` is the same as `rigc <command>`)'
      : `(installed: \`rigc\` runs this entry where @esotericsoftware/spine-core is not installed beside the package, and every command once it is; ` +
        `from a source checkout: \`bun ${checkout} <command>\` runs the commands below, which link nothing of spine-core; \`bun cli.ts <command>\` runs every command)`,
    '',
    'usage:',
    ...docs.flatMap((c) => c.usage.map((u) => `  ${u}`)),
    '',
    '  rigc <command> --help    that command\'s own flag table',
    ...HELP_DOC.usage.map((u) => `  ${u}`),
    '  rigc --version           print the installed version (-v works too)',
  ];
  // Read only by the --profile paragraph, which only an entry running a command that takes --profile prints.
  const counts =
    rules ??
    ((): number => {
      throw new Error('internal: the --profile paragraph is printed and this entry states no rule counts');
    });
  for (const paragraph of USAGE_PARAGRAPHS) {
    const about = paragraph.about;
    const shown = 'flag' in about ? takes(about.flag) : about.every((name) => names.has(name));
    if (shown) lines.push('', ...paragraph.lines(counts));
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// what both `build` bodies share (issue #1060): the flags, the header and the compile's report
// ---------------------------------------------------------------------------

/**
 * Read `--profile`, defaulting to `spine` — see `CLI_DEFAULT_PROFILE`.
 *
 * An unknown name is a usage error rather than a silent fallback, and that
 * matters in both directions: a typo used to re-apply the strictest rulebook to
 * data the caller was trying to exempt, and it would now drop the policy layer
 * from a caller who typed `--profile spine-htlm` and believes they asked for it.
 * Neither is something to discover from a green.
 */
export function readProfile(flags: Record<string, string>): AssertionProfile {
  const raw = flags.profile;
  if (raw === undefined) return CLI_DEFAULT_PROFILE;
  // A former name resolves here and nowhere else (issue #1277): past this line
  // the alias does not exist, so it cannot select a rule set of its own.
  const aliased = Object.hasOwn(PROFILE_ALIASES, raw) ? PROFILE_ALIASES[raw] : undefined;
  if (aliased !== undefined) {
    console.error(profileAliasLine(raw, aliased));
    return aliased;
  }
  const found = VALIDATE_PROFILES.find((p) => p === raw);
  if (!found) throw new UsageError(`--profile ${JSON.stringify(raw)}; known profiles: ${VALIDATE_PROFILES.join(', ')}`);
  return found;
}

/**
 * Read one non-negative integer flag, or its default.
 *
 * A usage error rather than a `NaN` that reaches the packer: `--padding two`
 * would otherwise place every region at NaN and write a blank page, which is a
 * green build and an empty picture.
 */
export function readIntFlag(flags: Record<string, string>, name: string, fallback: number): number {
  const raw = flags[name];
  if (raw === undefined) return fallback;
  if (!/^\d+$/.test(raw)) throw new UsageError(`--${name} takes a non-negative integer, got ${JSON.stringify(raw)}`);
  return Number(raw);
}

/**
 * Read `--page-edges`, or its default — `pot`.
 *
 * An unknown value is a usage error for `readProfile`'s reason: a typo that fell
 * back to `pot` would hand the caller who asked for the smaller page the bigger
 * one, green, and say nothing.
 */
export function readPageEdges(flags: Record<string, string>): PageEdges {
  const raw = flags['page-edges'];
  if (raw === undefined) return DEFAULT_PAGE_EDGES;
  const found = PAGE_EDGES.find((e) => e === raw);
  if (!found) throw new UsageError(`--page-edges ${JSON.stringify(raw)}; known values: ${PAGE_EDGES.join(', ')}`);
  return found;
}

/**
 * Read `--pack-shape`, or its default — `rect` (issue #1099).
 *
 * Refused on any other value for `readPageEdges`'s reason: a typo that fell
 * back to `rect` would hand the caller who asked for the denser page the
 * looser one, green, and say nothing.
 */
export function readPackShape(flags: Record<string, string>): PackShape {
  const raw = flags['pack-shape'];
  if (raw === undefined) return DEFAULT_PACK_SHAPE;
  const found = PACK_SHAPES.find((e) => e === raw);
  if (!found) throw new UsageError(`--pack-shape ${JSON.stringify(raw)}; known values: ${PACK_SHAPES.join(', ')}`);
  return found;
}

/**
 * The parts of a compile as `packAtlas` takes them — under `polygon` each with
 * the footprint its attachments draw, read off the skeleton text the build
 * emitted (`packFootprints`); under `rect` without, which is the input every
 * pack had before #1099.
 */
function packInputs(result: CompileResult, shape: PackShape): PackInput[] {
  const sizes = new Map(result.images.map((img) => [img.region, { width: img.width, height: img.height }]));
  const footprints = shape === 'polygon' ? packFootprints(result.skeletonText, (region) => sizes.get(region)) : null;
  return result.images.map((img) => {
    const footprint = footprints?.get(img.region) ?? undefined;
    return {
      region: img.region,
      absPath: img.absPath,
      width: img.width,
      height: img.height,
      ...(footprint === undefined ? {} : { footprint }),
    };
  });
}

/**
 * The rectangle a region occupies **on its page**, for a line that has already
 * said where the region is — and the empty string where the page rectangle is
 * the one `bounds:` already states.
 *
 * ## The fact no surface an author reads carried (issue #718)
 *
 * The atlas line beside this clause prints the DRAWING's size, because that is
 * what an attachment's width and height mean. A packer that turned the drawing a
 * quarter to fit it wrote `bounds:` in the drawing's orientation too. So an
 * author holding the pack and the build report had neither end of the rectangle
 * they have to cut out of the page to measure a part against a rendered frame —
 * and the one place rigc printed it was `A06`'s overlap text, reachable only
 * under `--profile spine-html`. The knowledge was in the tree the whole time:
 * `pageFootprint` has derived this rectangle for every reader of it since issue
 * #579, and nothing an author reads said it.
 *
 * ⚠️ **The condition is `pageFootprint`'s own answer, not a second reading of
 * `degrees`.** Re-spelling that predicate here is the exact duplication #579 was
 * filed on — four readers derived this rectangle and two derived it wrongly — so
 * the clause asks the function whether its answer differs from the `bounds:`
 * line, and prints only then.
 *
 * 🔸 A consequence worth stating rather than leaving to be discovered: a region
 * whose KEPT rectangle is square is silent here, because a quarter turn leaves
 * its footprint the same two numbers and there is nothing the pack does not
 * already say. The general rule — `bounds` is the unturned size, the footprint
 * is its transpose at `rotate: 90` and `rotate: 270`, and which way to turn the
 * rectangle to recover the drawing — belongs to an author's own reading and is
 * stated in `docs/AUTHORING.md` §0.2, which holds for every region including
 * that one.
 */
function pageRectangle(region: AtlasRegion): string {
  const foot = pageFootprint(region);
  return foot.width === region.width && foot.height === region.height
    ? ''
    : `, occupies ${foot.width}x${foot.height}`;
}

/**
 * `build`'s invocation, read and refused before anything compiles — the cut,
 * the profile, and the flag combinations that disagree about one question —
 * for both bodies of the command (issue #1060): the one that writes the Spine
 * pair (`./spine_commands.ts`) and the one that writes the model document
 * alone (`./core_commands.ts`). Moved here unchanged from `cmdBuild`.
 */
export function readBuildInvocation(flags: Record<string, string>): { label: string; opts: CompileOptions; profile: AssertionProfile; packing: boolean } {
  const { label, opts } = resolveCut(flags, 'build');
  const profile = readProfile(flags);
  const packing = flags.pack !== undefined;
  // Two combinations are refused rather than silently resolved, because in each
  // one the two flags disagree about a single question and there is no answer
  // that is not a guess about which the caller meant. (There were three until
  // issue #266 — see the note below the second.)
  if (packing && opts.atlasInPath !== undefined) {
    throw new UsageError(
      '--pack and --atlas-in are opposite directions through the same door: --pack MAKES an atlas out of the ' +
        'loose parts, --atlas-in resolves the parts against one somebody already made. Pick one',
    );
  }
  if (packing && flags['copy-images'] !== undefined) {
    throw new UsageError(
      '--pack already writes self-contained pages into --out (that is what packing is), and --copy-images copies ' +
        'the loose part PNGs, which a packed atlas does not reference. Drop --copy-images',
    );
  }
  // The copy itself happens after the gate (below). The header has to know NOW,
  // because the skeleton text the gate reads is the skeleton text that is written
  // — `skeleton.images` says where the parts will be (issue #370).
  if (flags['copy-images'] !== undefined) opts.copyImages = true;
  // `--pack --profile spine-html` used to be the third refusal here, because
  // A06's coverage clause was "one part per page" flat and a legitimate pack
  // arrived at the gate reading as a defect. Since issue #266's second follow-up
  // that clause is "one part per page OR a tiling page", so the combination is
  // now a build like any other — and it is the only one that puts the renderer's
  // own rulebook over shared-page sampling.
  if (!packing) {
    for (const name of ['page-size', 'padding', 'page-edges', 'pack-shape'] as const) {
      if (flags[name] !== undefined) throw new UsageError(`--${name} only means something with --pack`);
    }
  }
  return { label, opts, profile, packing };
}

/** The lines a build opens on: the cut, then its two input files. */
export function printBuildHeader(label: string, opts: CompileOptions): void {
  console.log(`rigc build ${label}`);
  // Named explicitly and on their own lines rather than folded into the header
  // above: with two input files, a header that names only one of them (the rig,
  // historically) reads as though it were the one at fault whenever the error
  // that follows actually comes from the other.
  console.log(`  ..    rig    ${opts.rigPath}`);
  console.log(`  ..    motion ${opts.motionPath}`);
}

/** What a compile measured, as `build` reports it before its gate: the parts, the dropped states, the absent parts, the meshes, the physics. */
export function printCompiled(opts: CompileOptions, result: Pick<CompileResult, 'images' | 'droppedStates' | 'absentParts' | 'meshes' | 'rig' | 'physics'>): void {
  if (opts.atlasInPath !== undefined) console.log(`  ..    atlas-in ${opts.atlasInPath}`);
  console.log(`  ..    ${result.images.length} part page(s):`);
  for (const img of result.images) {
    // An imported part says where on the page it came from, because "resolved
    // against a region" is the claim `--atlas-in` makes and a line that only
    // repeated the page filename would look identical for all of them. A page
    // that declares a `scale:` also says so and shows the texels it was read
    // from: the size on the left is the DRAWING's and the rectangle is the
    // pack's, and issue #267 is the report that printed the second as the first.
    //
    // `pageRectangle` closes the line's last silence (issue #718), and it is
    // placed LAST rather than beside the turn it follows from, which is where
    // the card put it. The two clauses collide nowhere else, and the collision
    // is real: `scale 0.5 (373x106 texels)` is itself a size, so
    // `rotate 90, occupies 106x373 scale 0.5 (…)` reads as though the footprint
    // were the scaled quantity. As a trailing clause of the whole location
    // phrase it is unambiguous with a `scale:` line and identical to the card's
    // wording without one, which is every pack that has no `scale:` to state.
    const where =
      img.atlas === undefined
        ? img.page
        : `${img.page} @ ${img.atlas.x},${img.atlas.y}${img.atlas.degrees ? ` rotate ${img.atlas.degrees}` : ''}` +
          (img.atlasScale === undefined
            ? ''
            : ` scale ${img.atlasScale} (${img.atlas.originalWidth}x${img.atlas.originalHeight} texels)`) +
          pageRectangle(img.atlas);
    console.log(`  ..      ${img.region.padEnd(24)} ${img.width}x${img.height}  <- ${where}`);
  }
  for (const d of result.droppedStates) console.log(dropLine(d));
  // "The optional slots are optional" is a claim about this code path, so this
  // code path says which ones it left out rather than being silently right.
  for (const a of result.absentParts) {
    console.log(`  ABSENT ${a.slot}: ${a.why} — slot not emitted`);
  }
  for (const m of result.meshes) {
    console.log(
      `  MESH  ${m.slot.padEnd(12)} ${m.kind.padEnd(8)} ${m.vertices} vertices / ${m.triangles} triangles  ` +
        `${meshBudget(result.rig)}  bones=[${m.bones.join(', ')}]  attachments=[${m.attachments.join(', ')}]${meshFit(m)}` +
        meshDepthNote(m) +
        meshInfluenceNote(m),
    );
  }
  for (const ph of result.physics) {
    console.log(
      `  PHYS  ${ph.name.padEnd(12)} bone=${ph.bone.padEnd(14)} components=[${ph.components.join(', ')}] ` +
        `mix=${ph.mix}${ph.drivesMesh ? '  <- drives a mesh: its canvas re-rasterises while the spring settles' : ''}`,
    );
  }

}

/**
 * An atlas text to gate INSTEAD of the compile's own, with the second, independent
 * emit A18 compares it against.
 *
 * `--pack` is the only caller. A packed build is gated twice on purpose — once as
 * compiled (which is the gate that reads the loose PNGs, so `A06`'s size-vs-file
 * clause still measures the art R5 measures) and once as packed (which is the pair
 * that actually ships). Handing the second pass its texts rather than re-deriving
 * them here keeps `runGate` ignorant of what a pack is.
 */
interface AtlasOverride {
  text: string;
  again: string;
}

/**
 * What one gate of `build` is handed (issue #1060): the compile, the atlas text
 * it gates (the compile's own, or the packed one), the directory its pages
 * resolve against, the document `build` writes, and a second, independent
 * compile's three texts for A18 — the same arguments `cli.ts build` has always
 * handed `validate()`, so each entry's gate reads one statement of them.
 */
export interface BuildGateInput {
  result: CompileResult;
  atlasText: string;
  atlasDir: string;
  modelText: string;
  reEmit: { skeletonText: string; atlasText: string; modelText: string };
  profile: AssertionProfile;
}

/**
 * The gate a `build` body runs, by entry (issue #1060): `cli.ts`'s is the
 * round trip through spine-core (`./spine_commands.ts`), `cli_core.ts`'s the
 * model side and the rules restated over the emitted text
 * (`./core_commands.ts`). Everything else `build` does — compile, the
 * document, `--copy-images`, `--pack`, the writes and their order — is
 * `runBuild`'s, written once, so the two entries write the same build.
 */
export interface BuildGate {
  /** Which supplier this gate is, as the `--report` document names it (issue #1213). */
  supplier: BuildReportSupplier;
  /** The line before the first gate's report, naming what judges it. */
  heading: (profile: AssertionProfile) => string;
  /** Run the gate, print its report, and return the lists it printed — and, on the core entry, its `here:` line's values. */
  run: (input: BuildGateInput) => { report: VerdictLists & { profile: AssertionProfile }; here: GateHere | null };
  /** The command a green build ends by naming, for its own `--out`. */
  look: (outDir: string) => string;
}

function runGate(
  gate: BuildGate,
  record: BuildReport | null,
  atlasKind: BuildReportGate['atlas'],
  result: CompileResult,
  modelText: string,
  opts: CompileOptions,
  profile: AssertionProfile,
  /** The atlas text `build` writes for a compile's own — `--copy-images` renames the pages — which the second compile's document is spelled from, as `modelText` was (issue #1016). */
  written: (atlasText: string) => string,
  atlas?: AtlasOverride,
): number {
  // The determinism check compares a second, independent compile — its model
  // document included, which is the text `build` writes beside the pair, and
  // which states where each region sits in the atlas written with it (`pages`,
  // issue #1016): so the second document is spelled from the second compile's
  // atlas as it would be written, or from the second, independent pack.
  const again = compile(opts);
  const { report, here } = gate.run({
    result,
    atlasText: atlas ? atlas.text : result.atlasText,
    atlasDir: opts.outDir,
    modelText,
    reEmit: { skeletonText: again.skeletonText, atlasText: atlas ? atlas.again : again.atlasText, modelText: modelDocument(again.model, again.skeletonText, atlas ? atlas.again : written(again.atlasText)) },
    profile,
  });
  record?.gates.push(buildReportGate(atlasKind, report, here));
  return report.failures.length;
}

// ---------------------------------------------------------------------------
// --report: the build's report as a document (issue #1213)
// ---------------------------------------------------------------------------

/**
 * A `--report` in the making: where it goes, and what the run has stated so
 * far — every gate's lists and every `pack:` line's figures, recorded where
 * the line is printed and from the values it is printed from. `write` spells
 * the document (`buildReportText`) and writes it; nothing else in it is read
 * off the disk, the clock or the machine.
 */
export interface BuildReport {
  path: string;
  command: BuildReportDocument['command'];
  supplier: BuildReportSupplier;
  gates: BuildReportGate[];
  pack: PackPageFigures[] | null;
}

/** The document a recorded run states, keys in the order the spec writes them. */
export function buildReportDocument(record: BuildReport): BuildReportDocument {
  return { spec: BUILD_REPORT_SPEC, command: record.command, supplier: record.supplier, gates: record.gates, pack: record.pack };
}

/** Write what the run stated to `--report`. Called when a gate has reached its verdict: before a red gate's exit, after a green build's last write. */
export function writeBuildReport(record: BuildReport): void {
  writeFileSync(record.path, buildReportText(buildReportDocument(record)));
}

/**
 * `--report <file>` read for a command whose build goes into `outDir`: the
 * file resolved against the working directory, refused by name when it is
 * inside `outDir` or is `outDir` — the build's directory holds the files A18
 * and `emit_hashes` hold byte-identical, and a report there would be a file of
 * the build that is not the build — and refused when a directory stands at the
 * path. A file already at the path is removed here, before anything is
 * compiled, so the file at `--report` is always this run's: a run that reaches
 * no gate (a usage refusal after this point, a compile error, a repack refused
 * before or after its gate) leaves no document rather than an earlier run's.
 * `null` when the flag is absent.
 */
export function readReportFlag(flags: Record<string, string>, command: BuildReport['command'], outDir: string, supplier: BuildReportSupplier): BuildReport | null {
  const raw = flags.report;
  if (raw === undefined) return null;
  const path = resolve(raw);
  const out = resolve(outDir);
  const within = relative(out, path);
  if (within === '' || (!within.startsWith('..') && !isAbsolute(within))) {
    throw new UsageError(
      `--report ${raw} is inside --out ${outDir}: the report is written beside a build, never into it — --out holds the build's own files, ` +
        'which A18 and emit_hashes hold byte-identical. Name a path outside --out',
    );
  }
  if (existsSync(path) && statSync(path).isDirectory()) throw new UsageError(`--report ${raw} is a directory; it takes the path of the file to write`);
  rmSync(path, { force: true });
  return { path, command, supplier, gates: [], pack: null };
}

/**
 * One `pack:` line's figures (issue #1213): what the line prints, as values —
 * `coveredPct` at the one decimal the line spells, so the document and the
 * line state the same number.
 */
function packPageFigures(page: { name: string; width: number; height: number; occupancy: number }, regions: number, padding: number, pageEdges: PageEdges, packShape: PackShape): PackPageFigures {
  return { page: page.name, width: page.width, height: page.height, regions, coveredPct: Number((page.occupancy * 100).toFixed(1)), padding, pageEdges, packShape };
}

/** The `pack:` line, spelled from its figures. */
function packLine(f: PackPageFigures): string {
  return (
    `  ..    pack: ${f.page} ${f.width}x${f.height}, ` +
    `${f.regions} region(s), ` +
    `${f.coveredPct.toFixed(1)}% covered, padding ${f.padding}` +
    (f.pageEdges === 'free' ? ', page edges free' : '') +
    // Appended, never inserted: a reader that takes the line whole keeps
    // every field it read before #1099, and the mode is named under the
    // default too, so no reader infers it from an absent word.
    `, shape ${f.packShape}`
  );
}

/**
 * The model document `build` wrote beside a skeleton, when the one beside it
 * is that build's: a `skeleton.model.json` in the skeleton's directory whose
 * `spine.sha256` is the digest of exactly this skeleton text (the digest the
 * core poser checks before it poses a build, issue #968). Since issue #907 a
 * rigc build's header carries the setup-pose bounding box and its stage is the
 * document's, so a gate run over a directory reads A14's and A19's stage from
 * this document, as `build`'s own gate did, and `ingest` reads the rebuild's
 * stage from it (`documentStageBeside`); a skeleton with no such document
 * beside it — an export, or a document of another skeleton — is read off its
 * header, as before.
 */
export function modelTextBeside(skeletonPath: string, skeletonText: string): string | undefined {
  const path = join(dirname(skeletonPath), MODEL_DOCUMENT_FILE);
  if (!existsSync(path)) return undefined;
  const text = readFileSync(path, 'utf8');
  let digest: unknown;
  try {
    const doc: unknown = JSON.parse(text);
    digest = typeof doc === 'object' && doc !== null ? (doc as { spine?: { sha256?: unknown } }).spine?.sha256 : undefined;
  } catch {
    return undefined;
  }
  return digest === spineFileSha256(skeletonText) ? text : undefined;
}

/**
 * The stage a rigc build's model document states, for `ingest` (issue #907):
 * the `rigc-compiled/3` document beside the skeleton whose digest is that
 * skeleton's (`modelTextBeside`) — its `stage`, four numbers or `null` for a
 * rig that declared none. `undefined` — read the header, as before — for an
 * export or a bare file (no document), a document of another skeleton, a
 * `/2` or `/1` document (written when the header still was the stage), or a
 * `stage` that is not one of those two shapes.
 *
 * ⭐ Why `ingest` needs it: since #907 a rigc build's header carries the
 * setup-pose bounding box, and the stage is only in the document. Reading the
 * header as the stage would rebuild a rig whose stage is its own bounding box
 * — gallery/nod's 640x700 stage came back 640x725 — so `A14` and `A19` on the
 * rebuild would measure against a box the author never stated.
 */
export function documentStageBeside(skeletonPath: string, skeletonText: string): IngestStage | null | undefined {
  const text = modelTextBeside(skeletonPath, skeletonText);
  if (text === undefined) return undefined;
  const doc = JSON.parse(text) as { spec?: unknown; stage?: unknown };
  if (doc.spec !== MODEL_DOCUMENT_SPEC || !('stage' in doc)) return undefined;
  const stage = doc.stage;
  if (stage === null) return null;
  if (typeof stage !== 'object') return undefined;
  const { x, y, width, height } = stage as Record<string, unknown>;
  return typeof x === 'number' && typeof y === 'number' && typeof width === 'number' && typeof height === 'number' ? { x, y, width, height } : undefined;
}

/**
 * The line `build` prints when the rig declares a stage and the header carries
 * no setup-pose bounding box (issue #907): why — nothing drawn, a region with
 * no atlas rectangle, or a setup pose rigc's core leaves out
 * (`headerBoundsOf`). Silent where the box is written, or where the rig
 * declares no stage, which asked for no box.
 */
function printHeaderBox(result: CompileResult): void {
  if (result.model.stage === null || typeof result.skeleton.skeleton.width === 'number') return;
  const { why } = headerBoundsOf(result.model, result.atlasText);
  if (why !== null) console.log(`  ..    header  no setup-pose bounding box — ${why}`);
}

/**
 * build — moved here unchanged from `./spine_commands.ts` (issue #1060) but
 * for its gate, which the entry hands in (`BuildGate`): both entries write
 * the Spine pair, the model document and the pages by this one body.
 */
export function runBuild(flags: Record<string, string>, gate: BuildGate, caller: BuildReport | null = null): void {
  const { label, opts, profile, packing } = readBuildInvocation(flags);
  // `--report` (issue #1213): `build`'s own, written by this body on either verdict — or the caller's
  // (`repack`'s), which this body writes on a red gate, since the exit leaves the caller no turn, and which the
  // caller writes when it has written its own output.
  const own = caller === null ? readReportFlag(flags, 'build', opts.outDir, gate.supplier) : null;
  const record = caller ?? own;
  printBuildHeader(label, opts);
  const result = compile(opts);
  printCompiled(opts, result);
  printHeaderBox(result);

  // The model's document is spelled before the gate, so the text A18 compares
  // is the text written, and a model the document cannot carry is refused
  // before anything is (issue #922). It states where each region sits in the
  // atlas written beside it (`pages`, issue #1016), so it is spelled from that
  // atlas: under `--copy-images` the text with the copies' page names, planned
  // here from the text alone (`plannedPageCopies`) and copied after the gate.
  // Under `--pack` the pages move again after this gate, and the document
  // written is the one the packed gate below spells and compares.
  const copying = flags['copy-images'] !== undefined;
  const writtenAtlas = (atlasText: string): string => (copying ? plannedPageCopies(atlasText, opts.outDir).atlasText : atlasText);
  let modelText = modelDocument(result.model, result.skeletonText, writtenAtlas(result.atlasText));
  console.log(gate.heading(profile));
  const failures = runGate(gate, record, 'compiled', result, modelText, opts, profile, writtenAtlas);
  if (failures > 0) {
    if (record !== null) writeBuildReport(record);
    console.error(`rigc: ${failures} assertion(s) failed — nothing written`);
    process.exit(1);
  }

  mkdirSync(opts.outDir, { recursive: true });

  // `--copy-images`: `--out` is otherwise NOT self-contained — a page's default
  // path is relative to the source art (often `../parts/foo.png`), which is
  // correct for a build sitting beside the project it came from and breaks the
  // moment the directory is zipped, committed or moved on its own (issue #217).
  // Opt-in only: the default stays exactly what it has always been.
  //
  // What is copied is what the ATLAS names, not what the image list holds: under
  // `--atlas-in` the two are different lists, and rebuilding the text from the
  // second wrote a file the pack never contained — zero bytes for a rig that
  // declares no parts, one fabricated page per part for a rig that does, both of
  // them green here because the gate above had already read the compile's own
  // text (issue #693, `src/emit.ts`).
  let atlasText = result.atlasText;
  if (flags['copy-images'] !== undefined) {
    const copied = copyAtlasPages(atlasText, opts.outDir);
    // The document's pages were spelled from the plan; the copy is held to it before anything of the pair is written.
    if (copied.atlasText !== writtenAtlas(result.atlasText)) {
      throw new Error(`internal: --copy-images wrote an atlas whose page names are not the ones ${MODEL_DOCUMENT_FILE} was spelled with — nothing of the pair was written`);
    }
    atlasText = copied.atlasText;
    console.log(`  ..    copy-images: ${copied.pages.length} page(s) copied into ${opts.outDir}`);
    for (const p of copied.pages) {
      const note = p.to === basename(p.from) ? '' : '  (renamed — basename collision)';
      console.log(`  ..      ${p.to.padEnd(24)} <- ${p.from}  (${p.regions} region(s))${note}`);
    }
  }

  // `--pack`: the parts go onto shared pages, which are written here as real
  // PNGs, so `--out` is self-contained by construction. The atlas above stays
  // the one the gate just read — packing changes only the ARRANGEMENT of the
  // bytes, and the sizes in `result.images` are still the ones measured off the
  // loose PNGs (see src/atlas.ts's header).
  if (packing) {
    const packOpts = {
      pageSize: readIntFlag(flags, 'page-size', DEFAULT_PAGE_SIZE),
      padding: readIntFlag(flags, 'padding', DEFAULT_PADDING),
      pageEdges: readPageEdges(flags),
      shape: readPackShape(flags),
      pageStem: 'skeleton',
    };
    const packed = packAtlas(packInputs(result, packOpts.shape), packOpts);
    atlasText = packed.atlasText;
    if (record !== null) record.pack = [];
    for (const page of packed.pages) {
      page.plate.writePng(join(opts.outDir, page.name));
      const figures = packPageFigures(page, packed.placements.filter((p) => packed.pages[p.page].name === page.name).length, packed.padding, packOpts.pageEdges, packed.shape);
      record?.pack?.push(figures);
      console.log(packLine(figures));
    }
    for (const place of packed.placements) {
      console.log(
        `  ..      ${place.region.padEnd(24)} ${place.width}x${place.height} -> ` +
          `${packed.pages[place.page].name} @ ${place.x},${place.y}`,
      );
    }
    // The pages are on disk now, so the packed pair can be gated as an artifact
    // rather than trusted as a construction: A17 stats every page, A06 reads its
    // IHDR back, A07 re-reads the text shape, A08 re-joins every attachment onto
    // a region, and A18 compares a second independent compile+pack. Two gates on
    // one build is the cost of shipping a second atlas shape.
    console.log('  ..    validate (packed atlas, pages on disk)');
    const packAgain = packAtlas(packInputs(compile(opts), packOpts.shape), packOpts);
    // The document written is spelled from the packed atlas, and this gate's A18 compares it with a
    // second compile's spelled from the second, independent pack (issue #1016).
    modelText = modelDocument(result.model, result.skeletonText, atlasText);
    const packFailures = runGate(gate, record, 'packed', result, modelText, opts, profile, (text) => text, { text: atlasText, again: packAgain.atlasText });
    if (packFailures > 0) {
      if (record !== null) writeBuildReport(record);
      console.error(
        `rigc: ${packFailures} assertion(s) failed on the PACKED atlas — the pages were written to ` +
          `${opts.outDir}, the skeleton/atlas pair was not`,
      );
      process.exit(1);
    }
  }

  writeFileSync(join(opts.outDir, 'skeleton.json'), result.skeletonText);
  writeFileSync(join(opts.outDir, 'skeleton.atlas'), atlasText);
  // rigc's own record of the compiled rig (`rigc-compiled/3`, issue #922;
  // its `pages` the atlas just written, issue #1016), written with the pair
  // and only after the same gate — under `--pack`, the packed one. rigc's own posing core
  // reads it (`readModel`, `src/core/index.ts`, issue #380's step 2).
  writeFileSync(join(opts.outDir, MODEL_DOCUMENT_FILE), modelText);
  console.log(`rigc: wrote ${join(opts.outDir, 'skeleton.json')}`);
  console.log(`rigc: wrote ${join(opts.outDir, 'skeleton.atlas')}`);
  console.log(`rigc: wrote ${join(opts.outDir, MODEL_DOCUMENT_FILE)}`);
  // Written after the build, and printed nowhere: the lines a build prints are the same with the flag and without it.
  if (own !== null) writeBuildReport(own);
  // The next command is part of the message (issue #837). A green build is the
  // moment somebody wants to see what came out, and the one page rigc writes
  // for that is `preview` of exactly this directory — so the line names it,
  // with the path already resolved. Printed only here: a red build wrote
  // nothing, so there is nothing to look at and no line.
  console.log(gate.look(opts.outDir));
}

/**
 * One `DROP` line, written once because two outcomes print it.
 *
 * A build that succeeds prints it in its report; a build that REFUSES prints it
 * under the refusal (issue #671), and the two have to be the same line or the
 * failing run would be quoting a different fact from the one the green run
 * shows. What it names — a file or a region — is `droppedStateReason`'s, in the
 * compiler, beside the code that decided which of the two was consulted.
 */
export function dropLine(dropped: DroppedState): string {
  return `  DROP  ${dropped.slot}/${dropped.state}: ${droppedStateReason(dropped)} (state not emitted)`;
}

// ---------------------------------------------------------------------------
// the dispatch — one for every entry (issue #1052)
// ---------------------------------------------------------------------------

/** What `rigc <command> …` hands a command's body: the flags, every occurrence of a repeatable one, and the positionals. */
export interface CommandArgs {
  flags: Record<string, string>;
  lists: Record<string, string[]>;
  positional: string[];
  /** Every argument after the command's name, as given — what a delegating command (`CommandDoc.delegate`) hands over. */
  raw: readonly string[];
}

/** One command's body, as an entry registers it. */
export type CommandRun = (args: CommandArgs) => void;

/**
 * A refusal a body throws that the shared chain below does not know, because
 * the class lives in a module only one entry links — `bonedist`'s, whose
 * module poses through spine-core. Printed as `prefix` + the message, then
 * exit `status`.
 */
export interface CliRefusal {
  is(err: unknown): boolean;
  prefix: string;
  status: number;
}

/** An entry: the bodies it registers, and what only its side of the seam knows. */
export interface CliEntry {
  /** The file a source checkout runs this entry as — what the usage's first line names. */
  checkout: string;
  /**
   * Whether this entry links spine-core: `true` runs every command `COMMANDS`
   * documents, `false` only those whose `runtime` is `false` — the set is read
   * off the table, never listed beside it.
   */
  linksRuntime: boolean;
  /** Every command this entry runs, by name — exactly its set, or the run refuses to start. */
  runs: Readonly<Record<string, CommandRun>>;
  /** Each profile's rule count, for the `--profile` paragraph; the validator's, so only an entry that links it states it. */
  profileRules?: (profile: 'spine' | 'rig-play') => number;
  /** The refusals of bodies only this entry registers (`CliRefusal`). */
  refusals?: readonly CliRefusal[];
}

/**
 * The commands an entry runs, as its page documents them: every documented
 * one, or — linking nothing of the runtime — those whose `runtime` is `false`
 * and those with a body of their own there (`runtime.core`, issue #1060),
 * documented by that body.
 */
export function entryCommands(linksRuntime: boolean): CommandDoc[] {
  if (linksRuntime) return COMMANDS;
  return COMMANDS.flatMap((doc): CommandDoc[] => {
    if (doc.runtime === false) return [doc];
    const core = doc.runtime.core;
    return core === undefined ? [] : [{ ...doc, usage: core.usage, flags: core.flags ?? doc.flags, notes: core.notes }];
  });
}

/**
 * What the refusal of a command that re-runs the gate says when its target is
 * a rigc build (issue #1097): that build already ran the gate, before it wrote
 * anything. A consumer met the refusal and read it as a gate the install could
 * not run, because the refusal said only what `validate` needs (#1095).
 *
 * ⚠️ Every clause is a fact about what the directory carries, never a reading
 * of the document: `skeleton.model.json` beside the pair is what makes it a
 * rigc build (`resolveBuild`'s `modelPath`), and emit-only-after-green is
 * what makes a rigc build gated on write. It does not say which entry wrote
 * it, which spec version the document is, or that the skeleton is still the
 * one the gate passed — nothing here reads the document, so those are said as
 * where to look (`spine.sha256`), not as findings.
 */
export function gatedOnWriteSentence(skeletonPath: string): string {
  return (
    `The target is a rigc build — ${skeletonPath} has ${MODEL_DOCUMENT_FILE} beside it — and a rigc build writes nothing until its gate is green: ` +
    `that gate ran when the pair was written, and the document is the record of what it passed, its spine.sha256 naming the skeleton bytes the gate read ` +
    "— on this entry the gate is the model side's rules over the document and the round trip's own restated over the emitted text, " +
    'with A00_ROUNDTRIP_PARSE alone reported as a SKIP.'
  );
}

/**
 * `gatedOnWriteSentence` for a refused command marked `rerunsTheGate`, or
 * `null` — the refusal then says what it always said. The target is
 * `cmdValidate`'s: the positional (`.` without one) through `resolveBuild`;
 * a `--cut` or `--rig` run derives its directory from a spec, which the
 * refusal does not compile, so it keeps the sentence it had. Arguments
 * `parseArgs` or `resolveBuild` refuses are the command's to refuse, not the
 * runtime refusal's, and leave it as it was.
 */
function gatedOnWrite(doc: CommandDoc, args: readonly string[]): string | null {
  if (doc.runtime === false || doc.runtime.rerunsTheGate !== true) return null;
  try {
    const { flags, positional } = parseArgs([...args], REPEATABLE_FLAGS[doc.name]);
    if (flags.cut !== undefined || flags.rig !== undefined) return null;
    const build = resolveBuild(positional[0] ?? '.', flags.atlas);
    return build.modelPath === null ? null : gatedOnWriteSentence(build.skeletonPath);
  } catch (err) {
    if (err instanceof UsageError) return null;
    throw err;
  }
}

/**
 * A command `COMMANDS` documents and this entry does not run, because its body
 * reaches spine-core and the entry links none of it — refused naming what the
 * command runs through the runtime for, and the commands the entry does run.
 * A `SpineRuntimeError`, so it is printed and exits as the export an entry
 * cannot pose is.
 */
function commandNeedsRuntime(doc: CommandDoc, runs: readonly string[], args: readonly string[]): SpineRuntimeError {
  const needs = doc.runtime === false ? 'nothing' : doc.runtime.for;
  const gated = gatedOnWrite(doc, args);
  return new SpineRuntimeError(
    `\`${doc.name}\` runs through spine-core (${needs}), and the runtime could not be used: ${SPINE_SIDE_ABSENT}. ` +
      (gated === null ? '' : `${gated} `) +
      `The commands this entry runs are ${runs.join(', ')}; the entry that links spine-core runs \`${doc.name}\` — ` +
      `installed, \`rigc ${doc.name}\` once @esotericsoftware/spine-core is installed beside the package; from a source checkout, \`bun cli.ts ${doc.name}\``,
  );
}

/**
 * `rigc help` documented as a command is (issue #1440): on the usage of both
 * entries, and its own page for `rigc help --help` and `rigc help help`, as
 * every listed command answers `--help`. Not a row of `COMMANDS`, because it
 * has no body of its own: it is the dispatch reading another spelling of
 * `--help` (`helpArgv`), on every entry alike.
 */
const HELP_DOC: CommandDoc = {
  name: 'help',
  usage: ['rigc help [<command>]    the same page as rigc [<command>] --help, and the same exit'],
  flags: [],
  runtime: false,
  spineFormat: false,
};

/**
 * `rigc help [<command>]` (issue #1440): the command line it stands for, which
 * the dispatch then runs in its place — `rigc --help` for `help` alone,
 * `rigc <command> --help` for a command the table documents — or `null` for
 * `help`'s own page (`help --help`, `help help`). Rewritten rather than
 * printed here, so the page and the exit code are the ones that spelling gets
 * on this entry and cannot come apart from them: a command this entry does not
 * run is refused as `<command> --help` is.
 *
 * ⚠️ A name the table does not document is refused by name with the nearest
 * one, as a `UsageError` — printed and exited as an unknown command is, exit 2
 * — and so is more than one name, rather than a guess at which was meant.
 */
export function helpArgv(rest: readonly string[]): string[] | null {
  if (rest.length === 0) return ['--help'];
  if (rest.length > 1) {
    throw new UsageError(`help takes one command name and was given ${rest.length}: ${rest.join(' ')} — \`rigc help <command>\` is \`rigc <command> --help\``);
  }
  const [name] = rest;
  if (name === HELP_DOC.name || name === '--help' || name === '-h') return null;
  if (KNOWN_COMMANDS.includes(name)) return [name, '--help'];
  const [nearest] = nearestNames(name, [...KNOWN_COMMANDS, HELP_DOC.name], 1);
  throw new UsageError(`unknown command: ${name} — the nearest command is ${nearest} (\`rigc help ${nearest}\`)`);
}

/**
 * Run `argv` (`process.argv` without the runtime and the script) through
 * `entry`: the usage, `--version`, a command's `--help`, the command, and
 * every refusal printed and mapped to its exit code — the dispatch `cli.ts`
 * always had, written once for both entries.
 */
export function runCli(entry: CliEntry, argv: readonly string[]): void {
  const docs = entryCommands(entry.linksRuntime);
  const known = docs.map((doc) => doc.name);
  const registered = Object.keys(entry.runs).sort();
  if (JSON.stringify([...known].sort()) !== JSON.stringify(registered)) {
    throw new Error(`internal: this entry runs [${known.join(', ')}] by the command table and registers [${registered.join(', ')}]`);
  }
  const USAGE = usageText(docs, entry.checkout, entry.profileRules);
  if (argv[0] === 'help') {
    let target: string[] | null;
    try {
      target = helpArgv(argv.slice(1));
    } catch (err) {
      refuse(err, 'help', USAGE, entry);
    }
    if (target === null) {
      console.log(commandHelp(HELP_DOC.name, [HELP_DOC]));
      process.exit(0);
    }
    runCli(entry, target);
    return;
  }
  const [command, ...rest] = argv;
  try {
    if (command === undefined) {
      console.error(USAGE);
      process.exit(2);
    }
    if (command === '--version' || command === '-v') {
      console.log(readVersion());
      process.exit(0);
    }
    if (command === '--help' || command === '-h') {
      console.log(USAGE);
      process.exit(0);
    }
    if (!known.includes(command)) {
      const elsewhere = COMMANDS.find((doc) => doc.name === command);
      if (elsewhere !== undefined) throw commandNeedsRuntime(elsewhere, known, rest);
      throw new UsageError(`unknown command: ${command}`);
    }
    // A delegating command reads nothing here: not a flag, not `--help` (issue #1457).
    if (docs.find((doc) => doc.name === command)?.delegate !== undefined) {
      entry.runs[command]({ flags: {}, lists: {}, positional: [], raw: rest });
      return;
    }

    const { flags, lists, positional } = parseArgs([...rest], REPEATABLE_FLAGS[command]);
    if (flags.help !== undefined) {
      console.log(commandHelp(command, docs));
      process.exit(0);
    }
    entry.runs[command]({ flags, lists, positional, raw: rest });
  } catch (err) {
    refuse(err, command, USAGE, entry);
  }
}

/**
 * Every refusal a command can end on, printed and mapped to its exit code —
 * the chain `cli.ts`'s dispatch always ended on, moved here unchanged (issue
 * #1052) but for `bonedist`'s refusal, which its entry hands over
 * (`CliEntry.refusals`). Anything else is not a refusal and is thrown on.
 */
function refuse(err: unknown, command: string | undefined, USAGE: string, entry: CliEntry): never {
  if (err instanceof MissingFlagError) {
    console.error(`rigc: ${err.message}`);
    process.exit(2);
  }
  if (err instanceof UsageError) {
    console.error(`rigc: ${err.message}\n\n${USAGE}`);
    process.exit(2);
  }
  // A ballot refuses on its arguments, like a usage error, but its messages are
  // long enough that reprinting the whole usage under them buries the reason.
  if (err instanceof BallotError) {
    console.error(`rigc vote: ${err.message}`);
    process.exit(2);
  }
  if (err instanceof CompileError) {
    // The site's code points at its one AUTHORING row; uncoded library errors keep the legacy section.
    console.error(compileErrorLine(err.message, err.code));
    // The drops the compile recorded before it stopped, in the same line the
    // green build prints (issue #671). They were reported from the compile
    // RESULT alone, so the run that failed BECAUSE a file was missing was the
    // one run that never named the file. On stderr with the refusal rather than
    // on stdout, so redirecting one stream does not separate a fact from the
    // sentence it explains.
    for (const dropped of err.droppedStates ?? []) console.error(dropLine(dropped));
    process.exit(1);
  }
  if (err instanceof CheckError) {
    console.error(`rigc check error: ${err.message}`);
    process.exit(1);
  }
  // The refusals of bodies only this entry registers — `bonedist`'s, whose module poses through spine-core — checked
  // where the chain always checked them. Every class in it is unrelated to every other, so the place is not load-bearing.
  for (const refusal of entry.refusals ?? []) {
    if (refusal.is(err)) {
      console.error(`${refusal.prefix}${(err as Error).message}`);
      process.exit(refusal.status);
    }
  }
  // Like a usage error in kind — a missing directory, an unreadable frame — but
  // its messages name a path and a reason, and reprinting the whole usage under
  // them buries that.
  if (err instanceof PoseError) {
    console.error(`rigc pose: ${err.message}`);
    process.exit(2);
  }
  // A refusal of the invocation, like the two below it, and exit 2 for the same
  // reason: nothing was posed and nothing was written, so it is the command line
  // that has to change (issue #697).
  if (err instanceof ExplainError) {
    console.error(`rigc explain: ${err.message}`);
    process.exit(2);
  }
  // Same kind as a PoseError, and printed the same way for the same reason: the
  // messages name a path, a bone or an attachment, and reprinting the whole
  // usage under them buries the one line that says what to change.
  // A view refused before anything was drawn (issue #1357): a name the build does not have, a time off render's
  // frame grid, a box with no size. The message lists what exists; the usage under it would bury that.
  if (err instanceof InspectError) {
    console.error(`rigc inspect: ${err.message}`);
    process.exit(2);
  }
  if (err instanceof ChainFitError) {
    console.error(`rigc chainfit: ${err.message}`);
    process.exit(2);
  }
  // A usage error in kind — an option that contradicts the file it was given —
  // and exit 2 for that reason rather than 1: nothing was compiled and nothing
  // was written, so it is the invocation that has to change (issue #626). It is
  // raised in `src/ingest.ts` rather than here because the library caller who
  // passes the same contradiction deserves the same refusal, and one rule in one
  // place is what stops the two from drifting apart.
  if (err instanceof IngestError) {
    console.error(`rigc ingest: ${err.message}`);
    process.exit(2);
  }
  // A repack refused (issue #1169): an atlas it cannot lift exactly, a repack that lost something, or an `--out`
  // it will not write into. The message names every reason and says that nothing was written; `status` is 1 for a
  // file that is not what a repack needs and 2 for an invocation that has to change.
  if (err instanceof RepackError) {
    console.error(`rigc repack: ${err.message}`);
    process.exit(err.status);
  }
  // A split refused (issue #1414): a name the specs do not have (2 — the invocation has to change), or something
  // the specs hold that the split cannot carry (1). The message names it, and the usage under it would bury that.
  if (err instanceof SplitError) {
    console.error(`rigc split: ${err.message}`);
    process.exit(err.status);
  }
  // A page or frame that is not a PNG rigc can read, from any command that
  // opens one (`render`, `check`, `preview`, …) — issue #732. The sentence is
  // the one reader's and already names the file, what it is and what rigc
  // reads; a stack under it is the tool describing its own internals instead.
  // Exit 1, like a compile error: the invocation was fine, a file was not.
  // A pose that is not finite (issues #864, #873): the invocation was fine and
  // the skeleton posed a NaN or an infinity, so exit 1 like a file that is not
  // a PNG. Raised by the geometry export and by the framing — the one sentence
  // naming the bone or vertex and its value — before the first file is written.
  // A pose whose every drawn vertex sits at one point (issue #997), from
  // `render` or `check`: exit 2 like *nothing to draw*, the other framing
  // refusal, because the usual fix is the invocation's — `--skin` — and nothing
  // was written. A `GeometryError` in kind, so it is caught before that.
  if (err instanceof UnframeablePoseError) {
    console.error(`rigc ${command}: ${err.message}`);
    process.exit(2);
  }
  if (err instanceof GeometryError) {
    console.error(`rigc render: ${err.message}`);
    process.exit(1);
  }
  // `--poser core` on an input the core cannot carry (issue #968): a refusal of
  // the invocation, nothing written, and the message names the input and why —
  // the usage under it would bury that. Without the flag the same refusal is a
  // fallback to spine-core, named on the render's `poser` line instead.
  if (err instanceof PoserChoiceError) {
    console.error(`rigc ${command}: ${err.message}`);
    process.exit(2);
  }
  if (err instanceof NotAPngError) {
    console.error(`rigc: ${err.message}`);
    process.exit(1);
  }
  // An input posed through spine-core — a Spine export, `--poser spine`, a
  // fallback — on a run where the runtime cannot be used (issue #1014). The
  // sentence names the input and why it needs the runtime; exit 1, like a file
  // that is not a PNG: the invocation was fine and the run could not pose it.
  // A candidate with no atlas beside it that has to be read through one (issue
  // #1020): a refusal of the invocation like a missing atlas on an export, exit
  // 2 and nothing written, and the message names the file and why it is needed.
  if (err instanceof CandidateAtlasError) {
    console.error(`rigc ${command}: ${err.message}`);
    process.exit(2);
  }
  // A skeleton spine-core could not load against the atlas beside it (issue #1033) — on a rigc build, a
  // skeleton.json or an atlas from another build beside this one's model document. The same class as the
  // missing atlas above: nothing was posed or written, and it is the directory the command was pointed at that
  // has to change. The message names both files, the reason the runtime drew them and the runtime's own words.
  // Since issue #1042 also `bonedist` and `bench --bones` on either side, and a page a candidate is drawn from that
  // is not there, whichever poser draws it.
  if (err instanceof CandidatePairError) {
    console.error(`rigc ${command}: ${err.message}`);
    process.exit(2);
  }
  if (err instanceof SpineRuntimeError) {
    console.error(`rigc ${command}: ${err.message}`);
    process.exit(1);
  }
  // An install refused before its first write (issue #831): the invocation was
  // fine and an entry on disk was not what this command would write, so exit 1
  // like a file that is not a PNG. The message names every such entry, what is
  // there and what was required; the usage under it would bury that.
  if (err instanceof SkillsInstallError) {
    console.error(`rigc skills install: ${err.message}`);
    process.exit(1);
  }
  // A rule or section the guide does not have (issue #1397): exit 1 like a lookup that found nothing, and the
  // message names what was asked and the nearest real names — the usage under it would bury them.
  if (err instanceof GuideError) {
    // The message is the whole line — `FAIL  GUIDE_RULE_KNOWN: …` or `FAIL  GUIDE_SECTION_KNOWN: …`, with its pointer.
    console.error(err.message);
    process.exit(1);
  }
  // A delegate that could not be handed the run (issue #1457): one line naming the package and what to run, nothing else —
  // the usage under it would bury the one command that fixes it.
  if (err instanceof DelegateError) {
    console.error(`rigc ${command}: ${err.message}`);
    process.exit(err.status);
  }
  throw err;
}
