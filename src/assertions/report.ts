/**
 * The profiles a gate judges under, the one the CLI uses when `--profile` is
 * absent, and the printer of a gate's report — moved here unchanged from
 * `src/validate.ts` (issue #1060), which re-exports all three: the entry that
 * links none of spine-core gates a build on the model side
 * (`./model/index.ts`) and prints its report with the same printer, and
 * `src/validate.ts` links the runtime. Nothing here links it.
 */
import type { AssertionProfile } from './kinds.ts';
import type { VerdictLists } from './harness.ts';
import { failLine } from '../guide.ts';

export const VALIDATE_PROFILES: readonly AssertionProfile[] = ['spine', 'rig-play'];

/**
 * What the CLI uses when `--profile` is absent — and ONLY the CLI. This is not
 * `validate()`'s default; that function has none (`ValidateProfile` in
 * `src/validate.ts` says why).
 *
 * `spine` since issue #221. The published package's pitch is "the output imports
 * into the Spine editor", which is exactly the question `spine` asks, and a
 * stranger's first build was being judged instead against one renderer's policy
 * and one project's canvas budget — 14 rules they have no stake in, with the
 * escape hatch documented only in prose. Defaults beat prose. `rig-play` is
 * still one flag away, and every report names the profile that judged it.
 */
export const CLI_DEFAULT_PROFILE: AssertionProfile = 'spine';

export function reportLines(report: VerdictLists & { profile: AssertionProfile }): string[] {
  const lines: string[] = [];
  // The profile goes FIRST and names what it left out. A report that says
  // "green" without saying which rulebook produced it is the one thing this
  // switch could make worse than no switch: `--profile spine` green means
  // "valid Spine", never "passes the renderer policy".
  const renderer = report.profileSkipped.filter((p) => p.kind === 'renderer').length;
  const archetype = report.profileSkipped.filter((p) => p.kind === 'archetype').length;
  lines.push(
    report.profileSkipped.length === 0
      ? `  ..    profile ${report.profile} — every assertion applies`
      : `  ..    profile ${report.profile} — ${renderer} renderer-policy and ${archetype} archetype assertion(s) do not apply`,
  );
  for (const name of report.passed) lines.push(`  PASS  ${name}`);
  for (const s of report.skipped) lines.push(`  SKIP  ${s.assertion}: ${s.reason}`);
  for (const p of report.profileSkipped) lines.push(`  PROF  ${p.assertion}: ${p.kind} rule, not in profile "${report.profile}"`);
  // Each FAIL line ends with the command that prints the rule's row of the guide (issue #1397): `failLine`.
  for (const f of report.failures) lines.push(failLine(f.assertion, f.detail));
  // How many of them MEASURED anything, which is the figure the rows above do
  // not hand a reader (issue #568). Counting `PASS` lines answers a different
  // question — before the sweep that closed #568 a run could print seven of
  // them over a candidate on which five rules had not executed at all.
  //
  // ⚠️ Every figure here is a count of ASSERTIONS and not of rows, which is why
  // the failed side is a Set: `fail()` is called once per finding, so one
  // assertion can print six `FAIL` lines, and a line-count would report 47 of
  // 42. The four buckets partition `ASSERTION_NAMES`, so the total is derived
  // by adding them rather than stated — a `42` written here would be the one
  // number in the report that no run could contradict.
  //
  // The figures are `gateSummary`'s, the one computation the line and the
  // `--report` document (`buildReportGate`) both spell (issue #1213).
  const s = gateSummary(report);
  lines.push(
    `  ..    ${s.assertions} assertions: ${s.measured} measured (${s.passed} passed, ${s.failed} failed), ` +
      `${s.skipped} skipped, ${s.notInProfile} not in profile "${s.profile}"`,
  );
  return lines;
}

/**
 * The figures the summary line states, as values: what `reportLines` prints
 * as its last line and what the `--report` document carries as a gate's
 * `summary` — one computation, so the two cannot disagree. Every figure counts
 * assertions, not rows (the comment in `reportLines` says why `failed` is a
 * set), and `assertions` is the sum of the four buckets, never a constant.
 */
export interface GateSummary {
  assertions: number;
  measured: number;
  passed: number;
  failed: number;
  skipped: number;
  notInProfile: number;
  profile: AssertionProfile;
}

export function gateSummary(report: VerdictLists & { profile: AssertionProfile }): GateSummary {
  const failed = new Set(report.failures.map((f) => f.assertion)).size;
  const measured = report.passed.length + failed;
  return {
    assertions: measured + report.skipped.length + report.profileSkipped.length,
    measured,
    passed: report.passed.length,
    failed,
    skipped: report.skipped.length,
    notInProfile: report.profileSkipped.length,
    profile: report.profile,
  };
}

// ---------------------------------------------------------------------------
// the build report document (`--report <file>`, issue #1213)
// ---------------------------------------------------------------------------

/**
 * The `spec` of the document `build --report` and `repack --report` write.
 * Versioned and additive: a field is added under the same spec, and one that
 * changes meaning or goes away moves the spec — a dependant that read `/1`
 * keeps reading what `/1` promised.
 */
export const BUILD_REPORT_SPEC = 'build-report/1';

/** Which supplier judged the gates: the round trip through spine-core (`cli.ts`) or the model side and the rules restated over the emitted text (`cli_core.ts`). */
export type BuildReportSupplier = 'round-trip' | 'model';

/**
 * The core entry's `here:` line as values: how many rules ran on the model
 * side over the document, how many of the round trip's own were restated over
 * the emitted text, and the codes that did not run. `null` on the round trip,
 * which prints no such line.
 */
export interface GateHere {
  modelSide: number;
  restated: number;
  notRun: string[];
}

/**
 * What one gate's report states, as values: the rows a reader takes off the
 * `PASS`, `SKIP` and `FAIL` lines (the rule names, the SKIP reasons, the FAIL
 * details, each in the order printed), the summary line's figures, the stats
 * line's keys and values, and the core entry's `here:` line. A `PROF` row is
 * counted in `summary.notInProfile` and not listed: nothing reads its row.
 */
export interface BuildReportGate {
  /** `compiled` for the gate over the compile, `packed` for `--pack`'s second gate over the pages on disk. */
  atlas: 'compiled' | 'packed';
  passed: string[];
  skipped: Array<{ code: string; reason: string }>;
  failures: Array<{ code: string; detail: string }>;
  summary: GateSummary;
  stats: Record<string, number | string>;
  here: GateHere | null;
}

/**
 * One `pack:` line as values. `coveredPct` is the figure the line prints, at
 * its one decimal; `pageEdges` is the `--page-edges` the build packed under,
 * which the line states as `, page edges free` or by its absence.
 */
export interface PackPageFigures {
  page: string;
  width: number;
  height: number;
  regions: number;
  coveredPct: number;
  padding: number;
  pageEdges: 'pot' | 'free';
  packShape: 'rect' | 'polygon';
}

/** The document, keys in the order written. Nothing in it is a time, a path or a machine's: two reports of one build are byte-identical. */
export interface BuildReportDocument {
  spec: typeof BUILD_REPORT_SPEC;
  command: 'build' | 'repack';
  supplier: BuildReportSupplier;
  gates: BuildReportGate[];
  /** Every `pack:` line, in the order printed; `null` for a build that did not pack. */
  pack: PackPageFigures[] | null;
}

/** One gate's report as the document carries it — read off the lists `reportLines` prints, so a row is in the document exactly when its line is printed. */
export function buildReportGate(
  atlas: BuildReportGate['atlas'],
  report: VerdictLists & { profile: AssertionProfile },
  here: GateHere | null,
): BuildReportGate {
  return {
    atlas,
    passed: [...report.passed],
    skipped: report.skipped.map((s) => ({ code: s.assertion, reason: s.reason })),
    failures: report.failures.map((f) => ({ code: f.assertion, detail: f.detail })),
    summary: gateSummary(report),
    stats: { ...report.stats },
    here,
  };
}

/** The document's text: two-space JSON and a final newline, keys in the order `BuildReportDocument` states them. */
export function buildReportText(doc: BuildReportDocument): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}
