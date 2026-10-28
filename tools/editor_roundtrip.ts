/**
 * The editor round trip, as a tool (issue #374).
 *
 * `build` → import into the Spine editor → export back to JSON → gate, `diff`,
 * `render` and `check` the export against the build it came from — the last two
 * **once per skin both files declare** (issue #571; see `skinBlocks`), with a
 * skin only one of them declares named as lost or added by the export and
 * rendered on neither side (issue #801; see `skinRoster`). It is the
 * one measurement that answers *"does the editor accept what rigc wrote, and does
 * what comes back still play the same"*, and on its first run it found three
 * emitter defects (#368 `hull`/`edges`, #369 hold curves, #370
 * `skeleton.images`) before proving that a human edit survives the trip.
 *
 * ⭐ Every step quotes what its child said when that child did not do what it was
 * for (#541, and step 5 since #621). A skin NEITHER side can draw is a SKIP
 * naming that rather than a red — `check` had nothing to compare, and `validate`
 * and `diff` have already measured the rig — while a skin only ONE side draws is
 * the divergence this whole file exists to find and stays a failure.
 *
 * It ran from a shell script in a local scratch directory. A tool nobody can
 * find is not a tool, hence this file.
 *
 * ## Which editor the report names
 *
 * Step 0's version line is the one place the report says which editor the trip
 * ran on. It is read from the editor's `--version` started with the SAME `-u`
 * the import and the export carry (`--editor-version`), so a pinned run names
 * the pinned editor, and says so on that line: `(read from --version under -u
 * <v>, …)`. An unpinned run prints the line alone, read from `--version` with no
 * `-u` — the editor the launcher starts by default. Once the export exists,
 * step 2 holds that version against the export's own `skeleton.spine`, prints
 * one line saying which it read and that the two agree, and when they DISAGREE
 * prints a `FAIL` naming both values and ends the run non-zero: a version line
 * that names an editor the trip did not export on is a fault in the instrument,
 * and a green run carrying it would be a measurement naming the wrong
 * instrument (issue #1199, where a bare `--version` named the launcher's
 * default, 4.3.26, on a trip pinned to and exported by 4.3.23).
 *
 * ## What it is not
 *
 * 🔒 **It is not a way to get Spine data without the editor** — it is the
 * opposite, a harness that requires one. It drives only the documented command
 * line (https://esotericsoftware.com/spine-command-line-interface), never the
 * UI, and it produces nothing the editor did not produce. rigc links
 * `spine-core` and is covered by the Spine Runtimes License; this tool needs a
 * licensed *editor* on the machine as well, by construction.
 *
 * ⛔ **The round trip can never be a selftest control.** The suite is
 * self-contained and CI has no editor; a control that needs one would report
 * SKIP forever, which is how a gate comes to look kept while checking nothing.
 * When the editor is absent, or is the trial, this tool REFUSES by name and
 * exits non-zero — the honest answer, and never a pass.
 *
 * ⭐ Those REFUSALS are gated, and they are the half of this file a machine with
 * no editor can answer for (issue #410). The `ERT` suite in `selftest.ts` points
 * the tool at stubs in a temp directory and reads what comes back; it needs no
 * editor, because the question is whether the refusal fires and what it says.
 * The no-editor branch had never executed anywhere until 2026-09-05 — it was
 * written on the machine that has the editor — which is precisely the shape of
 * a gate nobody has seen fail.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

/** Where the editor lives, per platform, from Esoteric's own CLI page. */
export const EDITOR_DEFAULTS: Record<string, string> = {
  darwin: '/Applications/Spine.app/Contents/MacOS/Spine',
  win32: 'C:\\Program Files\\Spine\\Spine.com',
  linux: '/opt/Spine/Spine',
};

/**
 * Every editor call is bounded.
 *
 * ⚠️ Not defensive tidiness: on the first run the trial launcher opened a
 * WINDOW and waited for someone to click it, with the harness holding the
 * terminal. A round trip that hangs forever is indistinguishable from one that
 * is working, so the wall clock is part of the measurement.
 */
const DEFAULT_TIMEOUT_S = 600;

/**
 * The tail both refusals end on.
 *
 * ⭐ Named once because the second clause is the point of it (issue #410): the
 * person reading either refusal has just found out they cannot run the round
 * trip, and `--exported` is the one thing they *can* run — its own usage text
 * says it exists "so the measuring half can be exercised on a machine with no
 * editor installed", and the refusals were the only place that never said so.
 */
const NO_EDITOR_HINT =
  'Pass --editor <path to a licensed editor>, or run this on a machine that has one installed. ' +
  'What you can still do here: --exported <file> measures an export the editor ALREADY made, skips steps 1-2 ' +
  'and runs every measurement below. ' +
  'See https://esotericsoftware.com/spine-command-line-interface';

/**
 * A name that reads "Spine Trial" — the executable's, the bundle's, or the one
 * the bundle declares.
 *
 * ⚠️ Anchored, not a substring search. `spine-trial-comparison/Spine` is a
 * directory somebody named, not a trial, and refusing it would lock out exactly
 * the caller `--editor` exists for.
 */
const TRIAL_NAME = /^spine[\s_-]*trial$/i;

/**
 * The launcher banner the trial prints, as MEASURED on this machine 2026-09-05:
 *
 *     Spine Launcher 4.3.06 Trial (macOS Apple Silicon)
 *
 * ⚠️ What the LICENSED editor prints on that line has not been measured here —
 * there is no licensed editor on the machine this was written on. So the match
 * is anchored to the launcher's own banner line and to `Trial` standing alone
 * inside it, rather than to "trial appears somewhere in the output": a build
 * path with the word in it must not be able to refuse a real editor.
 */
const TRIAL_BANNER = /^[^\n]*\bSpine Launcher\b[^\n]*\bTrial\b[^\n]*$/im;

/**
 * Everything about this path that says it is the Spine TRIAL, phrased as what
 * was found and where.
 *
 * 🔒 Read off the FILE SYSTEM, never by running it — running it is the hazard
 * this exists to avoid. `--version` on
 * `/Applications/SpineTrial.app/Contents/MacOS/Spine Trial` (4.3.06, macOS)
 * prints its banner and then does not return: measured 2026-09-05 and killed at
 * a 20 s bound, and the first attempt at this round trip on 2026-09-04 held the
 * terminal for over three minutes.
 *
 * ⚠️ Ambiguity is not a signal. A path that is neither obviously the trial nor
 * obviously the licensed editor comes back with an EMPTY list and the run
 * proceeds to fail — or succeed — on its own merits. rigc does not have the
 * authority to guess its input away, and a false refusal here would lock out
 * someone with a perfectly good editor at a nonstandard path.
 */
function trialSignalsFromPath(editor: string): string[] {
  const found: string[] = [];
  const exe = editor.split(/[/\\]/).filter((s) => s !== '').pop() ?? '';
  if (TRIAL_NAME.test(exe.replace(/\.(exe|com|bat|cmd)$/i, ''))) found.push(`its executable is named "${exe}"`);

  // The application bundle it sits in, and what that bundle says it is. Both are
  // macOS shapes; on a platform with no bundle neither fires and neither lies.
  const bundleDir = /^(.*?\.app)(?:[/\\]|$)/i.exec(editor)?.[1];
  if (bundleDir !== undefined) {
    const bundle = bundleDir.split(/[/\\]/).pop() ?? '';
    if (TRIAL_NAME.test(bundle.replace(/\.app$/i, ''))) found.push(`it sits inside the bundle "${bundle}"`);
    const declared = bundleName(join(bundleDir, 'Contents', 'Info.plist'));
    if (declared !== null && TRIAL_NAME.test(declared)) {
      found.push(`its bundle's Info.plist declares CFBundleName "${declared}"`);
    }
  }
  return found;
}

/**
 * `CFBundleName` out of an XML `Info.plist`, or null when there is nothing
 * readable there. A plist this cannot read is not a signal — it is silence, and
 * silence lets the run proceed.
 */
function bundleName(plist: string): string | null {
  if (!existsSync(plist)) return null;
  try {
    const m = /<key>\s*CFBundleName\s*<\/key>\s*<string>([^<]*)<\/string>/i.exec(readFileSync(plist, 'utf8'));
    return m === null ? null : m[1].trim();
  } catch {
    return null;
  }
}

/**
 * The editor naming its own version, as MEASURED on a licensed 4.3 editor on
 * macOS 2026-10-02 (issue #1077). `--version` printed nine lines on stdout and
 * none on stderr, in this shape:
 *
 *     the launcher's banner        `Spine Launcher <x.y.z> (<platform>)`
 *     the copyright line
 *     the operating system and its version
 *     `Starting: Spine <x.y.z> Professional`
 *     `Spine <x.y.z> Professional`             <- this line
 *     `Licensed to:`
 *     the licensee's name
 *     the licensee's e-mail address
 *     `Complete.`
 *
 * 🚨 The tool used to print the last three of those, which are the licensee's
 * name, e-mail and `Complete.` — personal data in a log that gets pasted into
 * PR bodies and cards, and no version at all (issue #1040 found it). So the
 * report keeps ONE line, the one the editor starts with its own name and a
 * version, and nothing else from that output.
 *
 * ⚠️ Anchored at the start of the line and to a version straight after the
 * word, which is what separates it from its neighbours: the launcher's banner
 * has `Launcher` there (and is a different version), and the `Starting:` line
 * does not start with `Spine`. A line that merely contains a version somewhere —
 * the operating system's — is not the editor's.
 */
const EDITOR_VERSION_LINE = /^Spine[ \t]+\d+\.\d+\.\d+\b[^\n]*$/m;

/**
 * What step 0 prints for the editor's version — its own line, or a sentence
 * saying it was not there — and the `x.y.z` that line names, which is what the
 * export's own `skeleton.spine` is checked against once the export exists
 * (issue #1199). `version` is null exactly when `line` is the absence.
 */
function editorVersion(output: string): { line: string; version: string | null } {
  const found = EDITOR_VERSION_LINE.exec(output);
  if (found === null) return { line: 'editor version: not found in --version output', version: null };
  return { line: found[0].trim(), version: /^Spine[ \t]+(\d+\.\d+\.\d+)/.exec(found[0])?.[1] ?? null };
}

/**
 * Where step 0 read the editor's version, in the words the report prints it in
 * (issue #1199): the `--version` call, and the `-u` it carried or the absence of
 * one — which on an unpinned run means the editor the launcher starts by default.
 */
function versionSource(pinned: string | null): string {
  return pinned === null
    ? "read from --version with no -u: the editor the launcher starts by default"
    : `read from --version under -u ${pinned}, the pin every editor call of this trip carries`;
}

/**
 * The `skeleton.spine` an export declares, or null when it declares none or the
 * file cannot be read as a skeleton — read off the FILE, as `shapeOf` reads it,
 * because it is the editor's own statement of the data version it exported.
 * Null is not swallowed: the caller states that nothing was there to check.
 */
function declaredSpineVersion(path: string): string | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (!isRecord(parsed) || !isRecord(parsed.skeleton)) return null;
    const spine = parsed.skeleton.spine;
    return typeof spine === 'string' ? spine : null;
  } catch {
    return null;
  }
}

/**
 * The line step 2 prints once the export exists: the version step 0 read held
 * against the export's own `skeleton.spine` (issue #1199). `fail` is true only
 * when both are there and differ — a disagreement is a finding about the
 * INSTRUMENT, not a pass, so it fails the trip; a side with nothing to compare is
 * stated and fails nothing, the way an absent version line has never been a
 * refusal (#1077).
 */
export function versionAgreement(
  read: string | null,
  pinned: string | null,
  declared: string | null,
): { line: string; fail: boolean } {
  const source = versionSource(pinned);
  if (declared === null) {
    return {
      line: `  the export declares no skeleton.spine, so the version step 0 ${read === null ? 'did not find' : `read (${read}, ${source})`} is not checked against it`,
      fail: false,
    };
  }
  if (read === null) {
    return {
      line: `  the export declares skeleton.spine "${declared}"; step 0 found no version line (${source}) to check it against`,
      fail: false,
    };
  }
  if (read === declared) {
    return { line: `  the export declares skeleton.spine "${declared}", the version step 0 read (${source})`, fail: false };
  }
  return {
    line:
      `  FAIL  step 0 read the editor as ${read} (${source}) and the export declares skeleton.spine "${declared}" — ` +
      'the version line names an editor this trip did not export on, which is a fault in the instrument rather ' +
      'than in the rig, so the trip is not green',
    fail: true,
  };
}

/** The trial naming itself in its own `--version` output, or null. */
function trialSignalFromVersion(output: string): string | null {
  const banner = TRIAL_BANNER.exec(output);
  return banner === null ? null : `it introduces itself as "${banner[0].trim()}"`;
}

/**
 * The refusal, in the doctrine's shape: the object, what was found, what is
 * required, and what the reader can do instead.
 */
function trialRefusal(editor: string, signals: string[]): string {
  return (
    `the editor at ${editor} is the Spine TRIAL, not a licensed editor — ${signals.join('; ')}. ` +
    'The trial cannot save projects or export animation data, which is the whole of what steps 1-2 do, so ' +
    'there is no round trip to be had on it; worse, it does not fail cleanly — a trial call with no export ' +
    'verb has been measured opening a window and never returning. This tool needs the licensed editor, whose ' +
    'bundle and executable are named "Spine". ' +
    NO_EDITOR_HINT
  );
}

interface Options {
  build: string;
  out: string;
  name: string;
  editor: string;
  editorVersion: string | null;
  fps: number;
  timeoutS: number;
  /** Measure an export the editor already made, instead of making one. */
  exported: string | null;
}

function usage(): never {
  console.error(
    [
      'usage: bun tools/editor_roundtrip.ts --build <dir> [flags]',
      '',
      '  --build <dir>        a rigc build directory (skeleton.json + atlas + pages)   REQUIRED',
      '  --out <dir>          where the round trip writes            (default <build>/../roundtrip)',
      '  --name <name>        skeleton name given to the import      (default the build dir\'s name)',
      `  --editor <path>      the Spine editor executable            (default ${EDITOR_DEFAULTS[process.platform] ?? '(unknown for this platform)'})`,
      '  --editor-version <v> pin the editor with -u, e.g. 4.3.xx    (default: let the editor choose)',
      '  --fps <n>            render rate for the check              (default 12)',
      '  --timeout <s>        bound on each editor call              (default 600)',
      '  --exported <file>    measure an export the editor ALREADY made and skip steps 1-2.',
      '                       Not a bypass: the editor still produced the file, and every',
      '                       measurement below still runs. It exists so the measuring half',
      '                       can be exercised on a machine with no editor installed.',
      '',
      'Step 5 renders and checks once per skin BOTH files declare; a skin only one of them',
      'declares is a FAIL naming it as lost (or added) by the export, and is rendered on',
      'neither side.',
      '',
      'Requires a licensed Spine editor on this machine. It drives the documented command',
      'line only, and refuses by name when the editor is not there.',
    ].join('\n'),
  );
  process.exit(2);
}

function parseArgs(argv: string[]): Options {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) usage();
    const key = a.slice(2);
    const value = argv[++i];
    if (value === undefined || value.startsWith('--')) {
      console.error(`rigc editor_roundtrip: --${key} needs a value`);
      process.exit(2);
    }
    flags.set(key, value);
  }
  const build = flags.get('build');
  if (build === undefined) usage();
  const known = new Set(['build', 'out', 'name', 'editor', 'editor-version', 'fps', 'timeout', 'exported']);
  for (const key of flags.keys()) {
    if (!known.has(key)) {
      console.error(`rigc editor_roundtrip: unknown flag --${key}`);
      process.exit(2);
    }
  }
  const buildDir = resolve(build);
  return {
    build: buildDir,
    out: resolve(flags.get('out') ?? join(buildDir, '..', 'roundtrip')),
    name: flags.get('name') ?? basename(buildDir),
    editor: flags.get('editor') ?? EDITOR_DEFAULTS[process.platform] ?? '',
    editorVersion: flags.get('editor-version') ?? null,
    fps: Number(flags.get('fps') ?? 12),
    timeoutS: Number(flags.get('timeout') ?? DEFAULT_TIMEOUT_S),
    exported: flags.get('exported') === undefined ? null : resolve(flags.get('exported')!),
  };
}

/**
 * The lines of a rigc report worth putting in the round-trip table: its verdict,
 * and anything that failed.
 *
 * ⚠️ Written after the first version took `stdout.slice(-6)`, which on `check`
 * lands in the middle of the block explaining what a column MEANS — six lines of
 * correct prose where the reader wanted one number. A tail is not a summary.
 */
function verdictLines(out: string): string[] {
  const lines = out.trim().split('\n');
  const kept = lines.filter((l) => /^\s*(FAIL|rigc:)/.test(l) || /\bexit=\d/.test(l));
  const last = lines[lines.length - 1];
  if (kept.length === 0 && last !== undefined) return [last];
  return kept.slice(-6);
}

interface Ran {
  status: number | null;
  stdout: string;
  stderr: string;
  /** The bound fired: the call is not a result, it is a hang. */
  timedOut: boolean;
}

/**
 * The indices of the lines in one stream of editor output that carry the
 * licence holder, and nothing else (issue #1082).
 *
 * Measured on a licensed 4.3 editor on macOS 2026-10-02, through this tool, on
 * four failing calls. Every one exited 1, wrote everything to stdout and nothing
 * to stderr, and printed one of two shapes:
 *
 *   an input path that does not exist (import, and export) — refused by the
 *   LAUNCHER before the editor starts, and no licence line at all:
 *
 *     the launcher's banner, the copyright line, the operating system
 *     (blank)  `Parameter: --input <path>`  (blank)
 *     `ERROR: Input path does not exist:`
 *     the path
 *
 *   a file the editor cannot read (a skeleton JSON naming a parent bone it does
 *   not declare; a `.spine` that is not a project) — the editor starts, names
 *   itself and its licence holder, and then the failure:
 *
 *     the launcher's banner, the copyright line, the operating system
 *     `Starting: Spine <x.y.z> Professional`
 *     `Spine <x.y.z> Professional`
 *     `Licensed to: <name> <<e-mail>>`         <- ONE line, withheld
 *     import: `Project import: …`, `ERROR: Unable to import skeleton.`, then
 *     export: `ERROR: Unable to export.`, then
 *     `[error] …` lines, a stack, and `Cause: …` lines
 *
 * 🚨 So on a failure the block is one line, not the three `--version` prints
 * (`Licensed to:` alone, then the name, then the e-mail — issue #1077), and
 * the lines straight after it are the editor's own error: a rule that took
 * "the header and the two lines after it" would have quoted the licence holder
 * not at all and the reason for the failure not at all either.
 *
 * ⚠️ Both shapes are held, each by what bounds it. A header with a value on the
 * same line is that one line. A bare header takes the two lines after it only
 * when the second of them is an e-mail (`@`), which is the `--version` shape;
 * anything else after a bare header is the editor talking and is quoted.
 */
function licenceLines(lines: readonly string[]): Set<number> {
  const withheld = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    const header = /^[ \t]*Licensed to:(.*)$/.exec(lines[i]);
    if (header === null) continue;
    withheld.add(i);
    if (header[1].trim() !== '') continue;
    if (i + 2 < lines.length && lines[i + 2].includes('@')) {
      withheld.add(i + 1);
      withheld.add(i + 2);
      i += 2;
    }
  }
  return withheld;
}

/**
 * Everything the editor printed on a step that did not do what it was for.
 *
 * 🚨 This is the defect issue #541 is half about, and it was this tool's. A
 * four-skin rig would not import; the report said
 *
 *     ## 1 import  (json -> project)
 *       exit=1
 *     rigc editor_roundtrip: the editor wrote no project file; the import did not happen
 *
 * and the card was filed as *"the editor refuses it without a word"*. The editor
 * had not been silent at all — it named the section, the attachment and the rule:
 *
 *     ERROR: Unable to import skeleton.
 *     [error] Error reading skeleton: skins
 *     Cause: [error] Error reading attachment: patch (MOw)
 *     Cause: [error] Multiple attachments have the same name: patch patch
 *
 * `run` captured both streams and the report printed neither. A day of bisecting
 * the emitted file rediscovered what one of those lines says outright, and the
 * repository whose whole doctrine is *convert silence into a named failure* had
 * manufactured the silence.
 *
 * ⭐ The refusal is unchanged and stays unchanged: a step that did not produce
 * its artifact is still a refusal by name, and this adds the reason rather than
 * softening the verdict. What it prints is the editor's own words, quoted and
 * attributed to the stream they came off, and never rewritten — a harness that
 * summarised them would be the same defect with a smaller radius.
 *
 * 🚨 With one exception, which is not the editor's words but the licence
 * holder's (issue #1082): the licence line, which `licenceLines` names and
 * which is replaced by one line saying it was withheld. Every other line is
 * quoted as printed, in order.
 */
function editorSaid(ran: Ran): string[] {
  const lines: string[] = [];
  for (const [stream, text] of [
    ['stdout', ran.stdout],
    ['stderr', ran.stderr],
  ] as const) {
    const body = text.replace(/\s+$/, '');
    if (body === '') continue;
    lines.push(`  the editor's ${stream}:`);
    const printed = body.split('\n');
    const withheld = licenceLines(printed);
    for (let i = 0; i < printed.length; i++) {
      if (!withheld.has(i)) {
        lines.push(`    | ${printed[i]}`);
        continue;
      }
      // One note per run of withheld lines, in the place they were printed, so
      // the quotation still reads in the editor's order and the omission is
      // stated rather than left to look like an editor that said less.
      let span = 1;
      while (withheld.has(i + span)) span++;
      lines.push(`    ~ ${span} line(s) withheld here: the editor's licence block names the licence holder (issue #1082)`);
      i += span - 1;
    }
  }
  // Silence is a finding too, and it has to be stated rather than left to look
  // like a harness that forgot to print. The card above is what an unstated one
  // costs.
  if (lines.length === 0) lines.push('  the editor printed nothing on stdout or stderr');
  return lines;
}

/**
 * The line a rigc child REFUSED on, out of the stream it printed it on.
 *
 * ⚠️ Not `editorSaid`, which quotes both streams whole. A rigc refusal is a
 * `UsageError` and `cli.ts` prints the entire usage under one — some sixty lines
 * of correct prose that would bury the one sentence somebody needs. Every
 * refusal rigc prints starts, at column zero, with its own name and a colon:
 * `rigc:`, `rigc check error:`, `rigc compile error:`. The usage block has
 * neither shape — its `rigc <command> …` lines are indented, and its unindented
 * ones carry no colon — so none of them is mistaken for one.
 */
function refusalLines(text: string): string[] {
  return text.split('\n').filter((line) => /^rigc\b[^\n]*:/.test(line));
}

/**
 * What one rigc child said, under the step that ran it.
 *
 * 🚨 Issue #621, and it is `editorSaid`'s defect one surface over. Step 5 was
 * the one step that printed a child's exit code and threw its words away: on a
 * rig whose only attachment is a `boundingbox` it reported a bare `exit=1`, and
 * the renderer's own refusal — *"posed no drawable attachment in any animation
 * or in its setup pose — there is nothing to draw"* — reached nobody. A reader
 * of that log cannot tell a crashed renderer from a rig with no frames, which is
 * the same silence this file already has a judgment about.
 *
 * ⭐ The fallback is the half that keeps the fix from being the defect again one
 * level down: a child that dies with a stack trace prints no `rigc…:` line at
 * all, so when nothing matched, the tail of stderr is quoted rather than
 * nothing.
 */
function rigcSaid(what: string, ran: Ran): string[] {
  const said = [
    ...refusalLines(ran.stderr),
    // `check` reports its failures on stdout, in the FAIL lines `verdictLines`
    // keeps for the green path.
    ...ran.stdout.split('\n').filter((line) => /^\s*FAIL/.test(line)),
  ];
  if (said.length === 0) {
    said.push(...ran.stderr.replace(/\s+$/, '').split('\n').slice(-6).filter((line) => line !== ''));
  }
  const head = `  ${what}  exit=${String(ran.status)}${ran.timedOut ? '  TIMED OUT' : ''}`;
  // Silence is a finding, for the reason `editorSaid` states: "it said nothing"
  // and "this harness threw its words away" look identical from the outside.
  if (said.length === 0) return [head, '    | it printed nothing on stdout or stderr'];
  return [head, ...said.map((line) => `    | ${line.trimEnd()}`)];
}

/**
 * The clause `rigc render` refuses on when the skeleton draws nothing, and the
 * exit code it leaves it with.
 *
 * ⚠️ The clause is the part of that message that does not move: `cli.ts` splices
 * ` under skin "x"` in after "setup pose" when `--skin` was passed, and ends on
 * `— there is nothing to draw` either way.
 */
const NOTHING_TO_DRAW = 'posed no drawable attachment in any animation or in its setup pose';

/** `cli.ts` exits 2 on a `UsageError`, which is what that refusal is. */
const RIGC_USAGE_EXIT = 2;

/**
 * Did this `render` call refuse because there was nothing to draw?
 *
 * 🔒 **Both signals, and the second one is why** (issue #621). The exit code
 * alone is every `UsageError` there is — an unknown flag, a candidate that is
 * not there, a `--skin` the skeleton does not declare — so reading a 2 as
 * "nothing to draw" would turn the export dropping a skin the build declares
 * into a SKIP, which is the one outcome this must never produce. The sentence
 * alone is a string found on a stream however the child exited, including a path
 * that echoed it and then did something else.
 *
 * ⛔ What was rejected: reading the two skeletons here and deciding for
 * ourselves whether either draws. That is a second implementation of
 * `framingViewport` — atlas resolution, the setup pose and every animation — and
 * two answers that need not agree is a checker agreeing with itself. The verdict
 * belongs to the child that refused.
 *
 * ⛔ Also rejected, and it is the more structural signal: an exit code of its own
 * from `cli.ts` for this refusal. `src/render.ts` emits no code at all —
 * `framingViewport` returns null and `cli.ts` turns that into a `UsageError` — so
 * that is a change to rigc's CLI contract rather than to this harness, and it is
 * wider than the card it would be landing under.
 */
function nothingToDraw(ran: Ran): boolean {
  return !ran.timedOut && ran.status === RIGC_USAGE_EXIT && ran.stderr.includes(NOTHING_TO_DRAW);
}

/**
 * Step 5's verdict when NEITHER side draws (issue #621).
 *
 * The question this step asks is *does what comes back still play the same*. A
 * rig that draws nothing on both sides gives `check` nothing to compare, and the
 * honest answer to a question with no measurement behind it is the one this file
 * gives everywhere else: SKIP by name, never a pass and never a red. `validate`
 * and `diff` have already measured the rig — this is the shape #608 removed from
 * `build`, one tool further out.
 */
const NOTHING_MEASURED =
  'neither side draws a frame, so the check is not measured; `diff` and `validate` carry this rig';

function run(cmd: string, args: string[], timeoutS: number): Ran {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: timeoutS * 1000 });
  return {
    status: r.status,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
    timedOut: r.error !== undefined && (r.error as NodeJS.ErrnoException).code === 'ETIMEDOUT',
  };
}

/**
 * How to invoke rigc: this checkout's `cli.ts` when the tool is running inside
 * the repository, and the installed `rigc` otherwise. Named rather than guessed
 * once, because a report that says "validate passed" has to say which binary
 * said so.
 */
function rigcCommand(): { cmd: string; prefix: string[]; how: string } {
  const local = join(import.meta.dir, '..', 'cli.ts');
  if (existsSync(local)) return { cmd: process.execPath, prefix: [local], how: `${process.execPath} ${local}` };
  return { cmd: 'rigc', prefix: [], how: 'rigc (installed)' };
}

/**
 * What `diff` reported about the export, read out of its own JSON: every
 * measure that is not a perfect match, named by the measure that saw it and by
 * the block it sits in.
 *
 * A round trip through a correct editor moves nothing, so an empty list is the
 * result and a populated one is the finding. Silence is not reported as a
 * match: a report that could not be read says so.
 *
 * 🚨 **Every block, and that is the whole of issue #597.** This walked
 * `sections[].measures` alone, so it read the measures that go into a section
 * mean and nothing else — while a `diff` report also carries each section's
 * `nameAgnostic` comparison, its `reported` block, and since #578 a top-level
 * `header` block holding the two stage measures. A round trip that changed or
 * dropped the stage therefore printed *"every one a perfect match"*, which is
 * the strongest sentence this file can print, about a question it had not
 * asked. The stage is the sharpest case because a header field is exactly the
 * kind of thing an editor rewrites on import and export, but it was never only
 * the stage: `attachments.mesh_edges`, `animations.key_density` and
 * `animations.curve_kinds` predate #578 in the same silence.
 *
 * ⭐ The headings carry `diff`'s own words rather than a paraphrase, because
 * these measures gate nothing and a summary that let them read as failures
 * would be inventing a verdict `diff` refuses to state. `ERT63` asserts the
 * distinguishing clause of each heading against what `diffLines` actually
 * prints, so a re-wording there cannot leave two documents disagreeing here.
 *
 * ⚠️ An absent `header` is a finding and not a perfect match. `DiffReport`
 * declares that block non-optional for exactly this reason — over an absent
 * one the empty list is indistinguishable from one that is all 1.000 — and
 * this tool can reach one anyway: `rigcCommand()` falls back to the INSTALLED
 * `rigc` when the file is not running inside the repository, and an install
 * predating #578 writes a report with no header in it.
 */
export function diffSummaryLines(reportPath: string): string[] {
  if (!existsSync(reportPath)) return ['(no diff report was written, so nothing was read from one)'];
  interface Measure { id: string; what: string; matched: number; total: number; ratio: number }
  interface Block { measures?: Measure[] }
  interface Section { name?: string; measures?: Measure[]; nameAgnostic?: Block; reported?: Block }
  interface Report { sections?: Section[]; header?: Block }
  const report = JSON.parse(readFileSync(reportPath, 'utf8')) as Report;
  const sections = report.sections ?? [];
  const headerMeasures = report.header?.measures ?? [];
  // Read in the order `diff` prints them, so a row here can be found in the
  // report it came from without translating between two orderings.
  const blocks: Array<{ heading: string | null; measures: Measure[] }> = [
    { heading: null, measures: sections.flatMap((s) => s.measures ?? []) },
    {
      heading: '  name-agnostic — the same two skeletons compared with names thrown away',
      measures: sections.flatMap((s) => s.nameAgnostic?.measures ?? []),
    },
    {
      heading: '  reported — unobservable from the frames, so reported and folded into nothing',
      measures: [...sections.flatMap((s) => s.reported?.measures ?? []), ...headerMeasures],
    },
  ];
  const measured = blocks.reduce((n, block) => n + block.measures.length, 0);
  if (measured === 0) return ['(the diff report carried no measures — read it before believing this run)'];

  const lines: string[] = [];
  for (const block of blocks) {
    const moved = block.measures.filter((m) => m.ratio !== 1);
    if (moved.length === 0) continue;
    if (block.heading !== null) lines.push(block.heading);
    const indent = block.heading === null ? '  ' : '    ';
    for (const m of moved) {
      lines.push(`${indent}moved  ${m.id}  ${m.matched}/${m.total} (${(m.ratio * 100).toFixed(2)}%) — ${m.what}`);
    }
  }
  if (headerMeasures.length === 0) {
    lines.push(
      '  the report carries no `skeleton` header block, so the header\'s box was never compared — the `rigc` that wrote ' +
        'it predates the header measures (issue #578), and an absent block must not read here like one that is ' +
        'all 1.000',
    );
  }
  if (lines.length > 0) return lines;
  // The counts are derived from the same three walks the rows come from, so the
  // one sentence that claims everything held names how much everything was.
  const [gating, agnostic, reported] = blocks.map((block) => block.measures.length);
  return [
    `  ${measured} measure(s) — ${gating} in the sections, ${agnostic} name-agnostic, ${reported} reported ` +
      'and never gating — every one a perfect match',
  ];
}

/**
 * `check`'s per-animation figures: how far the export's drawing moved from the
 * build's own frames.
 *
 * `meanMae` is the headline; `worstDrift` is the one that catches a single slot
 * in a single frame, which a mean over a whole animation hides.
 */
function checkFigures(reportPath: string): string[] {
  if (!existsSync(reportPath)) return ['(no check report was written, so nothing was read from one)'];
  interface Anim {
    /**
     * `null` on the row `check` writes for the SETUP pose (`dir: "setup"`) — which
     * is the only row a rig with no animations gets. Read as a string, that report
     * threw at step 5 on every animation-less build (issue #796's two editor fixtures).
     */
    animation: string | null;
    dir?: string;
    compared: number;
    meanMae: number;
    worstMae: number;
    worstDrift: number;
    worstDriftSlot: string | null;
    worstDriftFrame: number;
  }
  const report = JSON.parse(readFileSync(reportPath, 'utf8')) as { animations?: Anim[] };
  const animations = report.animations ?? [];
  if (animations.length === 0) return ['(the check report carried no animations — read it before believing this run)'];
  return animations.map(
    (a) =>
      `  ${(a.animation ?? `(${a.dir ?? 'setup'})`).padEnd(12)} ${a.compared} frame(s)  mean MAE ${a.meanMae.toFixed(4)}  worst ${a.worstMae.toFixed(4)}` +
      `  worst drift ${a.worstDrift.toFixed(3)}px${a.worstDriftSlot ? ` on ${a.worstDriftSlot} @ f${a.worstDriftFrame}` : ''}`,
  );
}

/**
 * The largest per-animation `meanMae` in one check report, or `null` when there
 * is no report to read one from.
 *
 * ⚠️ `check`'s exit code is not a verdict — there is no pass mark in it, by
 * design, any more than there is one in `diff` — so a per-skin roll-up built on
 * exit codes alone reports every skin as fine and reports it in the column a
 * reader looks at. This is the figure that actually moves when one skin's art
 * comes back wrong, which is what makes the roll-up a roll-up (issue #571).
 */
function worstMeanMae(reportPath: string): number | null {
  if (!existsSync(reportPath)) return null;
  const report = JSON.parse(readFileSync(reportPath, 'utf8')) as { animations?: Array<{ meanMae?: number }> };
  const values = (report.animations ?? []).map((a) => a.meanMae).filter((v): v is number => typeof v === 'number');
  return values.length === 0 ? null : Math.max(...values);
}

// ---------------------------------------------------------------------------
// step 5's per-skin plan (issue #571)
// ---------------------------------------------------------------------------
//
// 🚨 Step 5 used to render and check ONCE, with no skin, which draws the default
// skin and nothing else. On a rig whose named skins carry the contested art that
// is a comparison of blank against blank: the ninth round trip read `check`
// 0.0000 on a rig where the construct under test lives in a named skin, and the
// zero was true and empty at once. So the plan below is one block PER DECLARED
// SKIN, and a skin whose art the editor moved is a red row with its own name on
// it rather than a figure nobody rendered.
//
// ⭐ Split out as pure functions for the reason `shapeOf`/`shapeDiff` are: the
// `ERT` suite has no editor and never will, and a loop that can only be read by
// driving one is a loop nobody has seen work.

/**
 * The skins a skeleton file declares, in the order the file lists them.
 *
 * ⚠️ Off the FILE rather than off `spine-core`: this is the build's own
 * `skeleton.json`, read before any of it is loaded, and the tool's other summary
 * (`shapeOf`) reads the same file the same way. A skeleton with no `skins` array
 * at all comes back empty, which is a different fact from `["default"]` and is
 * carried as one — see `skinBlocks`.
 */
export function skinsDeclaredBy(path: string): string[] {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as { skins?: Array<{ name?: unknown }> };
  const out: string[] = [];
  for (const skin of parsed.skins ?? []) {
    // A skin with no usable name is counted under one rather than dropped: a
    // block that vanished would be a skin nobody rendered and nobody missed.
    out.push(typeof skin?.name === 'string' && skin.name !== '' ? skin.name : '(unnamed)');
  }
  return out;
}

/**
 * How one step-5 block ended (issue #621).
 *
 * Three states rather than an exit code, because `check` not having run and
 * `check` having returned 0 are different facts and used to print the same:
 * `measured` is the only one that carries a figure, and `not measured` is the
 * only one that does not fail the run.
 */
export type BlockVerdict = 'measured' | 'not measured' | 'no frames';

/** One render-and-check block of step 5: which skin, where its frames go. */
export interface SkinBlock {
  /** The skin this block poses under — `null` when the skeleton declares none. */
  skin: string | null;
  /** The heading printed above the block, which is where the skin's name is read. */
  heading: string;
  /** `--skin <name>`, or nothing at all when there is no skin to name. */
  args: string[];
  buildFrames: string;
  exportFrames: string;
  checkJson: string;
}

/**
 * A directory name for one skin's frames: its index, then what of its name is a
 * filename.
 *
 * The index leads because **a skin name is not a path**. The Spine editor writes
 * folders into skin names with `/`, so `goblins/green` would land two levels
 * down or collide with a sibling, and any scheme that replaces the offending
 * characters can map two distinct skins onto one directory. The index cannot
 * collide, and it is the skeleton's own ordering rather than a number invented
 * here.
 */
function skinDirName(name: string, index: number): string {
  return `${index}-${name.replace(/[^A-Za-z0-9._-]+/g, '_')}`;
}

/**
 * Step 5's plan: one block per declared skin, or exactly one block when the
 * skeleton declares no skin at all.
 *
 * ⭐ The no-skin case keeps the old paths (`render-build`, `render-export`,
 * `check.json`) because for such a skeleton there is nothing to distinguish, and
 * a run whose output moved would be a run whose ledgers all have to be re-read
 * for no measurement gained. A skinned skeleton files each block under its own
 * directory, so the frames of two skins can never overwrite each other — which
 * is the failure that would turn "one block per skin" back into one block.
 */
export function skinBlocks(skins: string[], out: string, fps: number): SkinBlock[] {
  if (skins.length === 0) {
    return [
      {
        skin: null,
        heading: `## 5 render both @${fps}fps, check the export against the build's own frames (no skin declared)`,
        args: [],
        buildFrames: join(out, 'render-build'),
        exportFrames: join(out, 'render-export'),
        checkJson: join(out, 'check.json'),
      },
    ];
  }
  return skins.map((skin, i) => ({
    skin,
    heading:
      `## 5.${i + 1}/${skins.length} skin "${skin}" — render both @${fps}fps, check the export against the ` +
      "build's own frames",
    args: ['--skin', skin],
    buildFrames: join(out, 'render-build', skinDirName(skin, i)),
    exportFrames: join(out, 'render-export', skinDirName(skin, i)),
    checkJson: join(out, `check-${skinDirName(skin, i)}.json`),
  }));
}

/**
 * The two sides' skin rosters, split into the skins both declare and the ones
 * only one side does (issue #801).
 *
 * 🚨 A skin one side does not declare is the finding, not a render. Before this,
 * step 5 planned its blocks off the build alone and asked the export for a skin
 * it no longer had: the card's rig — `default` empty, two named skins — came
 * back from 4.3.26 with `skins: [alt, base]`, and step 5 then printed two
 * DIFFERENT refusals for the one absent skin (`no skin "default" in this
 * skeleton` from the export's side, `posed no drawable attachment` from the
 * build's), so the skin read red for a reason neither line named. A render of a
 * skin that is not there measures nothing on either side, so a skin only one
 * side declares is named here, by name, and is rendered on neither.
 *
 * Both directions, because they are the same fact about a round trip: a skin
 * the export ADDS is as much a divergence as one it drops.
 */
export function skinRoster(
  build: string[],
  exported: string[],
): { both: string[]; lostByExport: string[]; addedByExport: string[] } {
  const inExport = new Set(exported);
  const inBuild = new Set(build);
  return {
    both: build.filter((skin) => inExport.has(skin)),
    lostByExport: build.filter((skin) => !inExport.has(skin)),
    addedByExport: exported.filter((skin) => !inBuild.has(skin)),
  };
}

/** An attachment's declaration key, kept separate from its skin and slot. */
interface ClipFlagSkin {
  name: string;
  attachments?: Record<string, Record<string, { type?: string; convex?: boolean; end?: string }>>;
}

/** Reflex turns of the world's own doubles, winding independent; straight turns are not reflex. */
function reflexVertices(polygon: readonly number[]): number {
  const n = polygon.length / 2;
  let area2 = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area2 += polygon[2 * i] * polygon[2 * j + 1] - polygon[2 * j] * polygon[2 * i + 1];
  }
  const winding = Math.sign(area2);
  if (winding === 0) return 0; // Degenerate geometry is the validator's refusal.
  let count = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const k = (i + 2) % n;
    const turn =
      (polygon[2 * j] - polygon[2 * i]) * (polygon[2 * k + 1] - polygon[2 * j + 1]) -
      (polygon[2 * j + 1] - polygon[2 * i + 1]) * (polygon[2 * k] - polygon[2 * j]);
    if (turn !== 0 && Math.sign(turn) !== winding) count++;
  }
  return count;
}

/**
 * An editor-added convex flag changes a concave clip's meaning (issue #1630).
 * Compare the same skin/slot/attachment, then read the BUILD's posed authored
 * setup polygon. Weighted runs are not points; an animation deform is not the
 * authored setup shape. Empty deform follows the renderer's `restOf` convention.
 * Imports are lazy so the existing no-editor/trial/read refusals need no runtime.
 */
async function addedConvexClipFailures(build: string, exported: string, buildDir: string): Promise<string[]> {
  const before = (JSON.parse(readFileSync(build, 'utf8')) as { skins?: ClipFlagSkin[] }).skins;
  const after = (JSON.parse(readFileSync(exported, 'utf8')) as { skins?: ClipFlagSkin[] }).skins;
  const candidates: Array<{ skin: string; slot: string; attachment: string; end: string | null }> = [];
  for (const skin of Array.isArray(after) ? after : []) {
    const originalSkin = (Array.isArray(before) ? before : []).find((s) => s.name === skin.name);
    for (const [slot, attachments] of Object.entries(skin.attachments ?? {})) {
      for (const [attachment, clip] of Object.entries(attachments)) {
        const original = originalSkin?.attachments?.[slot]?.[attachment];
        if (clip.type === 'clipping' && clip.convex === true && original?.type === 'clipping' && original.convex !== true) {
          candidates.push({ skin: skin.name, slot, attachment, end: original.end ?? null });
        }
      }
    }
  }
  if (candidates.length === 0) return [];
  const { posableFromText, setupClipPolygon } = await import('../src/render.ts');
  const atlas = readdirSync(buildDir).find((name) => name.endsWith('.atlas'))!;
  const { data } = posableFromText(readFileSync(build, 'utf8'), readFileSync(join(buildDir, atlas), 'utf8'), buildDir);
  const lines: string[] = [];
  for (const candidate of candidates) {
    const polygon = setupClipPolygon(data, candidate.skin, candidate.slot, candidate.attachment);
    const reflex = reflexVertices(polygon);
    if (reflex > 0) {
      lines.push(
        `  FAIL  EDITOR_ADDED_CONVEX_ON_CONCAVE_CLIP skin ${JSON.stringify(candidate.skin)} slot ${JSON.stringify(candidate.slot)} ` +
          `attachment ${JSON.stringify(candidate.attachment)} end ${JSON.stringify(candidate.end)}: export convex=true, build convex is not true; ` +
          `setup reflex vertices=${reflex}; the editor's export clips with the convex hull of the authored concave polygon`,
      );
    }
  }
  return lines;
}

/**
 * One measure of a `diff --json` report as `matched/total (ratio)`, or `null`
 * when the report or the measure is not there — read off the report for the
 * reason `diffSummaryLines` is.
 */
function diffFigure(reportPath: string, id: string): string | null {
  if (!existsSync(reportPath)) return null;
  interface Measure { id: string; matched: number; total: number; ratio: number }
  const report = JSON.parse(readFileSync(reportPath, 'utf8')) as { sections?: Array<{ measures?: Measure[] }> };
  const found = (report.sections ?? []).flatMap((s) => s.measures ?? []).find((m) => m.id === id);
  return found === undefined ? null : `${found.matched}/${found.total} (${found.ratio.toFixed(3)})`;
}

/** The shape of a skeleton file, for the field-by-field comparison. */
export interface Shape {
  spine: string;
  bones: number;
  slots: number;
  attachments: number;
  constraints: Record<string, number>;
  animations: string[];
  timelineKinds: string[];
  images: string | null;
}

/**
 * How many constraints of each `type`, read out of 4.3's single array.
 *
 * 🚨 This used to count four FIXED keys off the 4.1-era top-level arrays —
 * `d.ik`, `d.transform`, `d.path`, `d.physics` — none of which a 4.3 file has
 * (issue #561). Every row therefore read `0 -> 0` on every trip this tool has
 * ever run, so the summary's answer to *"did the editor drop a constraint"* was
 * a constant, printed with the same confidence as the rows that measure
 * something. Measured on `round6/out/pathmodes/build/skeleton.json`, whose
 * top-level keys are `skeleton, bones, slots, skins, animations, constraints`:
 * the old reads returned `{ik: 0, transform: 0, path: 0, physics: 0}` beside one
 * path constraint named `ride`.
 *
 * ⭐ The keys are now the types actually **present**, which is why `shapeDiff`
 * unions them: a type that vanishes has a key on one side only, and a fixed key
 * list would have to be kept by hand against a format that added `slider` in
 * 4.3 and can add another.
 */
function constraintsByType(list: ReadonlyArray<{ type?: unknown }>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const c of list) {
    // A constraint with no usable `type` is what `A01` exists to catch, so it is
    // counted under a name rather than dropped — a row nobody can read beats a
    // row nobody gets.
    const type = typeof c?.type === 'string' && c.type !== '' ? c.type : '(no type)';
    counts[type] = (counts[type] ?? 0) + 1;
  }
  return counts;
}

export function shapeOf(path: string): Shape {
  interface Skel {
    skeleton?: { spine?: string; images?: string };
    bones?: unknown[];
    slots?: unknown[];
    skins?: Array<{ attachments?: Record<string, Record<string, unknown>> }>;
    constraints?: Array<{ type?: unknown }>;
    animations?: Record<string, Record<string, unknown>>;
  }
  const d = JSON.parse(readFileSync(path, 'utf8')) as Skel;
  const kinds = new Set<string>();
  for (const anim of Object.values(d.animations ?? {})) for (const k of Object.keys(anim)) kinds.add(k);
  return {
    spine: d.skeleton?.spine ?? '(none)',
    bones: (d.bones ?? []).length,
    slots: (d.slots ?? []).length,
    attachments: (d.skins ?? []).reduce(
      (n, s) => n + Object.values(s.attachments ?? {}).reduce((m, v) => m + Object.keys(v).length, 0),
      0,
    ),
    constraints: constraintsByType(d.constraints ?? []),
    animations: Object.keys(d.animations ?? {}).sort(),
    timelineKinds: [...kinds].sort(),
    images: d.skeleton?.images ?? null,
  };
}

/** The rows where the two shapes disagree — what the editor rewrote. */
export function shapeDiff(before: Shape, after: Shape): string[] {
  const rows: string[] = [];
  const cmp = (field: string, a: unknown, b: unknown): void => {
    const x = JSON.stringify(a);
    const y = JSON.stringify(b);
    if (x !== y) rows.push(`${field}: build ${x} -> export ${y}`);
  };
  cmp('skeleton.spine', before.spine, after.spine);
  cmp('skeleton.images', before.images, after.images);
  cmp('bones', before.bones, after.bones);
  cmp('slots', before.slots, after.slots);
  cmp('attachments', before.attachments, after.attachments);
  // The UNION of both sides' types, not the build's: a constraint type the build
  // has and the export does not is the case this row exists for, and iterating
  // one side's keys would also miss a type only the export carries. Absent reads
  // as 0 so the row says `build 1 -> export 0` rather than naming `undefined`.
  for (const k of [...new Set([...Object.keys(before.constraints), ...Object.keys(after.constraints)])].sort()) {
    cmp(`${k} constraints`, before.constraints[k] ?? 0, after.constraints[k] ?? 0);
  }
  cmp('animations', before.animations, after.animations);
  cmp('timeline kinds', before.timelineKinds, after.timelineKinds);
  return rows;
}

/** What a JSON value is, in the words a refusal names it by: `null`, `an array`, `a number`, … */
function jsonKind(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  return typeof value === 'object' ? 'an object' : `a ${typeof value}`;
}

/** True for the one JSON kind a skeleton file and each of its records is: a plain object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The build's `skeleton.json`, read and parsed once, or the sentence the tool
 * refuses it with (issue #1090).
 *
 * 🚨 The `skeleton.images` probe in `main` used to be the first thing that read
 * this file, and it read it with a bare `JSON.parse`. A file that was not JSON,
 * or was JSON holding `null`, therefore left the tool as an uncaught
 * `SyntaxError` / `TypeError` and its stack — before the editor, so with nothing
 * of the editor's to quote, and in a shape no other refusal in this file has.
 * And a file holding `[]` or `7` did not stop at all: the probe found no
 * `skeleton.images` on it and the run went on to hand the editor a file that is
 * not a skeleton, minutes of import for a refusal this could state for free.
 *
 * ⭐ So this is the one reader of the build's skeleton text before step 1, and
 * it refuses by the file's path and what it found there: a directory, the
 * parser's own message, or the JSON kind that is not an object. What it hands
 * back is the value the probe reads, so a readable build is parsed exactly as
 * it was and every line after this prints as it did.
 */
function readBuildSkeleton(source: string): { skeleton: Record<string, unknown> } | { refusal: string } {
  return readSkeletonObject(
    source,
    "the build's skeleton.json",
    'The round trip imports that file into the editor, so it has to be one skeleton JSON object — `skeleton`, ' +
      '`bones`, `slots`, … — which is what `rigc build` writes there.',
  );
}

/**
 * One skeleton file read and parsed, with its bytes — or the sentence the tool
 * refuses it with, naming `what` it is, its path, what was found there and the
 * `required` sentence. The one body behind `readBuildSkeleton` and the
 * `--exported` read (issue #1107), so the two files are refused in one shape.
 *
 * The bytes are handed back because the `--exported` file is written into the
 * candidate from them: the file step 3 measures is then the file this parsed,
 * byte for byte, rather than whatever is at the path by the time step 3 runs.
 */
function readSkeletonObject(
  path: string,
  what: string,
  required: string,
): { skeleton: Record<string, unknown>; bytes: Buffer } | { refusal: string } {
  let bytes: Buffer;
  try {
    bytes = readFileSync(path);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EISDIR') return { refusal: `${what} at ${path} is a directory, not a file. ${required}` };
    return { refusal: `${what} at ${path} could not be read (${code ?? String(err)}). ${required}` };
  }
  const text = bytes.toString('utf8');
  if (text.trim() === '') {
    return { refusal: `${what} at ${path} is empty (${text.length} byte(s), no JSON value in them). ${required}` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    const said = err instanceof Error ? err.message : String(err);
    return { refusal: `${what} at ${path} is not JSON — the parser stopped with "${said}". ${required}` };
  }
  if (!isRecord(parsed)) {
    return { refusal: `${what} at ${path} is JSON, but it holds ${jsonKind(parsed)} rather than an object. ${required}` };
  }
  return { skeleton: parsed, bytes };
}

/**
 * The build's atlas, read once before step 1, or the sentence the tool refuses
 * it with (issue #1107): its name and the page names it lists.
 *
 * 🚨 This read used to sit at step 3, after the editor had imported and
 * exported. So a build with no atlas was refused by name only after a licensed
 * editor had spent an import and an export on it, and a directory named
 * `*.atlas` beside the build threw `EISDIR` there as a stack. Neither needs the
 * editor to answer: the atlas is rigc's input to step 3, not the editor's.
 *
 * ⭐ Every `*.atlas` entry is read, not only the one whose pages are listed,
 * because step 3 copies every one of them beside the export, and a directory
 * among them throws at that copy. The first entry is the atlas, as it always was.
 *
 * ⚠️ "Read" is all this can mean. The tool's own reader of an atlas is the line
 * filter below, which accepts any text, so there is no malformed atlas for it to
 * refuse; what the atlas SAYS is the gate's to judge at step 3 (`A08`, `A17`).
 */
function readBuildAtlas(build: string): { pageNames: string[] } | { refusal: string } {
  const atlases = readdirSync(build).filter((f) => f.endsWith('.atlas'));
  if (atlases.length === 0) return { refusal: `no .atlas in the build directory ${build}` };
  const required =
    'Step 3 copies the build\'s atlas and pages beside the export so the export can be loaded and measured, so ' +
    'every `.atlas` there has to be a file — the one `rigc build` writes.';
  let first: string | null = null;
  for (const name of atlases) {
    const path = join(build, name);
    try {
      const text = readFileSync(path, 'utf8');
      if (first === null) first = text;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'EISDIR') return { refusal: `the build's atlas at ${path} is a directory, not a file. ${required}` };
      return { refusal: `the build's atlas at ${path} could not be read (${code ?? String(err)}). ${required}` };
    }
  }
  const pageNames = (first ?? '')
    .split('\n')
    .filter((line) => /\.(png|jpg|jpeg)\s*$/i.test(line.trim()) && !line.startsWith(' ') && !line.startsWith('\t'))
    .map((line) => line.trim());
  return { pageNames };
}

/**
 * The field of the build's skeleton the images probe would have thrown on, as a
 * sentence naming it and what it holds — or null when every field the probe
 * dereferences is the kind it reads (issue #1090).
 *
 * ⚠️ Only those fields, and only on the path that reads them: the walk below
 * runs when `skeleton.images` is declared, and a field this does not read is the
 * gate's to judge after the import, not a precondition of the editor's. Asking
 * more here would be a second validator in front of the first.
 */
function imagesProbeFault(skeleton: Record<string, unknown>): string | null {
  const head = skeleton.skeleton;
  if (!isRecord(head)) return null;
  const images = head.images;
  if (images === undefined) return null;
  if (typeof images !== 'string') return `\`skeleton.images\` holds ${jsonKind(images)}, not a path string`;
  if (images === '') return null;
  const skins = skeleton.skins;
  if (skins === undefined) return null;
  if (!Array.isArray(skins)) return `\`skins\` holds ${jsonKind(skins)}, not an array`;
  for (let i = 0; i < skins.length; i++) {
    const skin: unknown = skins[i];
    if (!isRecord(skin)) return `\`skins[${i}]\` holds ${jsonKind(skin)}, not an object`;
    const attachments = skin.attachments;
    if (attachments === undefined) continue;
    if (!isRecord(attachments)) return `\`skins[${i}].attachments\` holds ${jsonKind(attachments)}, not an object`;
    for (const [slot, entries] of Object.entries(attachments)) {
      if (!isRecord(entries)) return `\`skins[${i}].attachments.${slot}\` holds ${jsonKind(entries)}, not an object`;
      for (const [placeholder, att] of Object.entries(entries)) {
        if (!isRecord(att)) {
          return `\`skins[${i}].attachments.${slot}.${placeholder}\` holds ${jsonKind(att)}, not an object`;
        }
      }
    }
  }
  return null;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const rigc = rigcCommand();

  const source = join(opts.build, 'skeleton.json');
  const log: string[] = [];
  const emit = (line: string): void => {
    console.log(line);
    log.push(line);
  };
  const logPath = join(opts.out, 'roundtrip.log');
  /**
   * Write what the run has said so far, wherever it stops.
   *
   * ⚠️ `roundtrip.log` used to be written on the last line of `main`, so a run
   * that REFUSED wrote none — and issue #541's card cites the log as the place to
   * read the editor's output, which on a failed import was a file that did not
   * exist. A record kept only for the runs that went well is not a record.
   */
  const keepLog = (): void => {
    // Nothing said, nothing to keep: the refusals that fire before the first
    // `emit` (no build directory) would otherwise leave an empty file and a
    // directory the run never used.
    if (log.length === 0) return;
    try {
      mkdirSync(opts.out, { recursive: true });
      writeFileSync(logPath, `${log.join('\n')}\n`);
    } catch {
      // A log this cannot write is not worth failing a refusal over; the same
      // lines already went to stdout.
    }
  };
  const fail = (message: string): never => {
    keepLog();
    console.error(`rigc editor_roundtrip: ${message}`);
    process.exit(1);
  };

  if (!existsSync(source)) fail(`no skeleton.json in the build directory ${opts.build}`);
  // 🔒 Read and parsed HERE, once, before anything else reads it (issue #1090):
  // a build whose skeleton is not one JSON object is refused by name rather than
  // thrown as a stack by the probe below, or handed to the editor.
  const read = readBuildSkeleton(source);
  if ('refusal' in read) return fail(read.refusal);
  const probeFault = imagesProbeFault(read.skeleton);
  if (probeFault !== null) {
    fail(
      `the build's skeleton.json at ${source} is an object, but ${probeFault} — one of the fields read before ` +
        "step 1 to check that every image the editor's import will look for is there. A skeleton `rigc build` " +
        'wrote never carries that; rebuild the directory with `rigc build … --copy-images`.',
    );
  }

  // 🚨 The art the EDITOR will look for, checked before the editor is started —
  // issue #562. The editor's JSON import reads `skeleton.images` and finds each
  // attachment's file by name under it; it never reads an atlas (#370, measured
  // at the MISSING wall). So a build whose `images` no longer resolves imports
  // as a skeleton with no pixels, and the run goes on to gate, `diff`, render
  // and `check` a candidate whose every region is blank — a green-looking
  // measurement of nothing, or a red one blaming the editor.
  //
  // ⚠️ This is a `--pack` build's ordinary shape, not a corner case. `--pack`
  // writes ONE shared page into `--out` and no loose parts at all (measured:
  // `round6/out/packed/build/` holds `skeleton.json`, `skeleton.atlas`,
  // `skeleton.png` and nothing else), so `skeletonImagesPath` falls through to
  // the loose parts directory and `images` necessarily points OUT of the build
  // — `"../../../rigs/packed/parts/"` on that run. The build is self-contained
  // for a runtime and is not for the editor, and the two directories go their
  // separate ways the moment anybody moves either.
  //
  // 🔒 Why this refuses rather than pointing `images` inside `--out`: there is
  // nothing in there to point AT. The editor would look for `crown.png` beside
  // the skeleton and find one packed page, so the "fix" turns a path that
  // resolves while the parts are in place into one that can never resolve at
  // all. What the editor needs is loose files, which is what `--copy-images`
  // makes — and `--pack --copy-images` is refused by `cli.ts`, correctly,
  // because a packed atlas does not reference loose parts.
  //
  // ⛔ It is checked HERE, before step 1, because it matters to the editor's
  // import in step 1. The atlas and an `--exported` file are read before step 1
  // as well, just below, although nothing before step 3 uses them (issue #1107):
  // they are rigc's inputs and not the editor's, so reading them first costs the
  // editor nothing and refuses before a licensed editor is started on a trip
  // that cannot finish — the reason `readBuildSkeleton` reads the build's
  // skeleton first (#1090). So the order is: every input rigc reads is read
  // before the editor starts, and only what the editor writes is read after it.
  {
    interface ImagesProbe {
      skeleton?: { images?: string };
      skins?: Array<{ attachments?: Record<string, Record<string, { type?: string; name?: string; path?: string }>> }>;
    }
    // The value `readBuildSkeleton` parsed, and the fields this walk reads are
    // the ones `imagesProbeFault` has already held to their kinds.
    const probe = read.skeleton as ImagesProbe;
    const declared = probe.skeleton?.images;
    if (declared !== undefined && declared !== '') {
      const imagesDir = resolve(opts.build, declared);
      // Only the two attachment types that read a texture. A boundingbox,
      // clipping or path attachment names no image and would be a false
      // refusal — `src/types.ts` says so for each of them.
      const wanted = new Set<string>();
      for (const skin of probe.skins ?? []) {
        for (const slot of Object.values(skin.attachments ?? {})) {
          for (const [placeholder, att] of Object.entries(slot)) {
            if (att.type !== undefined && att.type !== 'mesh') continue;
            // The parser's own defaults: `path`, else the attachment's `name`,
            // else its placeholder (`SkeletonJson.js:526`, `:529`, `:560`) — a
            // stated `name` is the file the editor looks for (issue #796).
            wanted.add(att.path ?? att.name ?? placeholder);
          }
        }
      }
      const EXTENSIONS = ['.png', '.jpg', '.jpeg'];
      const missing = [...wanted]
        .sort()
        .filter((name) => !EXTENSIONS.some((ext) => existsSync(join(imagesDir, `${name}${ext}`))));
      if (!existsSync(imagesDir)) {
        fail(
          `the build's skeleton.images is "${declared}", which resolves to ${imagesDir} — and there is no ` +
            'directory there. The editor finds a JSON import\'s art by that path and never by the atlas, so the ' +
            'import would produce a skeleton with no pixels and every measurement after it would be of nothing. ' +
            'A `--pack` build is a runtime artifact: its pages are in --out and its `images` names the loose parts ' +
            'it was packed from, so it round-trips only while those parts are where they were at build time. ' +
            'Rebuild with `--copy-images` (which puts the parts beside the skeleton), or put that directory back.',
        );
      }
      if (missing.length > 0) {
        fail(
          `the build's skeleton.images is "${declared}" (${imagesDir}) and ${missing.length} of ${wanted.size} ` +
            `attachment image(s) are not under it — the first is "${missing[0]}". The editor resolves each ` +
            'attachment by name against that directory and never through the atlas, so those attachments would ' +
            'import with no pixels. If this is a `--pack` build, its one packed page is in --out and its parts are ' +
            'not: rebuild with `--copy-images`, which is the shape whose art travels with the skeleton.',
        );
      }
    }
  }

  // The export is a skeleton only; it needs the build's atlas and pages beside
  // it to be a candidate anything can load — so the atlas is step 3's, and it is
  // read here, before step 1, for the reason the sentence above gives.
  //
  // 🚨 Which is why the build has to be SELF-CONTAINED, and this refuses when it
  // is not. An ordinary build's atlas names its pages by a relative path back to
  // the art directory; copy that atlas to a directory at another depth and every
  // page name resolves to nothing. Found by running this tool — it reported four
  // `A17_ATLAS_PAGE_FILES_EXIST` failures that were the harness's fault and not
  // the editor's, which is the worst kind of red: a real assertion, correctly
  // fired, pointing at the wrong culprit.
  const atlas = readBuildAtlas(opts.build);
  if ('refusal' in atlas) return fail(atlas.refusal);
  const wandering = atlas.pageNames.filter((n) => n.includes('/'));
  if (wandering.length > 0) {
    fail(
      `the build's atlas names its pages by path, not by filename — the first is "${wandering[0]}". ` +
        'The round trip copies the atlas beside the export, at a different depth, so every one of those ' +
        `${wandering.length} page name(s) would resolve to nothing and A17 would blame the editor for it. ` +
        'Rebuild with `--copy-images`, which puts the pages beside the skeleton and names them plainly.',
    );
  }

  // 🔒 The `--exported` file, read and parsed here for the same reason (issue
  // #1107): one skeleton JSON object, in `readBuildSkeleton`'s shape, or refused
  // by name. It used to be read first by step 4's `skinsDeclaredBy`, bare, so a
  // file that was not JSON was gated and diffed by steps 3–4 and then left the
  // tool as a `SyntaxError` stack. Step 3's candidate is written from these
  // bytes, so what is measured is what was parsed.
  let exportedBytes: Buffer | null = null;
  if (opts.exported !== null) {
    if (!existsSync(opts.exported)) fail(`no such export: ${opts.exported}`);
    const got = readSkeletonObject(
      opts.exported,
      'the --exported file',
      'Steps 3-6 measure that file as the editor\'s JSON export of this build, so it has to be one skeleton JSON ' +
        'object — `skeleton`, `bones`, `slots`, … — which is what the editor\'s `-e json` export writes.',
    );
    if ('refusal' in got) return fail(got.refusal);
    exportedBytes = got.bytes;
  }

  rmSync(opts.out, { recursive: true, force: true });
  mkdirSync(join(opts.out, 'export'), { recursive: true });
  mkdirSync(join(opts.out, 'export-cand'), { recursive: true });

  emit(`## 0 versions`);
  emit(`  rigc     ${rigc.how}`);
  emit(`  ${run(rigc.cmd, [...rigc.prefix, '--version'], 60).stdout.trim()}`);

  let exportedJson: string;
  /** The `x.y.z` step 0 read off the editor, held against the export at step 2 (issue #1199). */
  let editorRead: string | null = null;
  /** True when the export's `skeleton.spine` and step 0's version both exist and differ. */
  let versionDisagrees = false;
  if (opts.exported !== null) {
    exportedJson = opts.exported;
    emit(`  editor   NOT RUN — measuring an export the editor already made: ${opts.exported}`);
    emit('');
    emit('## 1-2 import / export  SKIPPED (--exported)');
  } else {
    // 🔒 The refusal, and it is the whole licence posture in one branch: with no
    // editor there is no round trip, and the tool says so rather than measuring
    // something else and calling it one.
    if (opts.editor === '' || !existsSync(opts.editor)) {
      fail(
        `Spine editor not found at ${opts.editor || '(no default known for platform ' + process.platform + ')'}. ` +
          'This tool round-trips through a LICENSED Spine editor and has nothing to measure without one. ' +
          NO_EDITOR_HINT,
      );
    }
    // 🔒 The trial, refused BEFORE it is run (issue #410). The refusal above used
    // to invite `--editor <path>` on a machine whose only Spine is the trial,
    // which cannot export and does not fail cleanly — so a path that names itself
    // a trial is answered here, off the file system, without a process starting.
    const named = trialSignalsFromPath(opts.editor);
    if (named.length > 0) fail(trialRefusal(opts.editor, named));

    const pin = opts.editorVersion === null ? [] : ['-u', opts.editorVersion];
    // 🚨 Under the same `-u` the import and the export carry (issue #1199). The
    // call used to be a bare `--version`, which names the editor the LAUNCHER
    // starts by default: measured 2026-10-07 on a launcher whose default is
    // 4.3.26, a trip pinned with `-u 4.3.23` exported `"spine": "4.3.23"` and
    // step 0 printed `Spine 4.3.26 Professional` — the one line that says which
    // editor the trip ran on, naming one it did not run on.
    const ver = run(opts.editor, [...pin, '--version'], 60);
    emit(`  editor   ${opts.editor}`);
    // One line, never the output's tail: the tail is the licensee's (issue #1077).
    // A pinned run says where the line came from; an unpinned run prints the line
    // alone, as it always has, and step 2 states its source beside the export's.
    const stated = editorVersion(`${ver.stdout}\n${ver.stderr}`);
    editorRead = stated.version;
    emit(`           ${stated.line}${opts.editorVersion === null ? '' : `  (${versionSource(opts.editorVersion)})`}`);
    // The second signal, and the only one that works on a platform whose trial
    // path this repository has never seen: the binary's own banner. It costs no
    // extra call — `--version` above is one the tool already made.
    const introduced = trialSignalFromVersion(`${ver.stdout}\n${ver.stderr}`);
    if (introduced !== null) fail(trialRefusal(opts.editor, [introduced]));

    emit('');
    emit('## 1 import  (json -> project)');
    const project = join(opts.out, `${opts.name}.spine`);
    const imported = run(opts.editor, [...pin, '-i', source, '-o', project, '-r', opts.name], opts.timeoutS);
    emit(`  exit=${imported.status}${imported.timedOut ? `  TIMED OUT after ${opts.timeoutS}s` : ''}`);
    // A step "went wrong" if it reported failure OR did not leave the artifact
    // it exists to leave. Both are cases where the editor's own words are the
    // next thing anybody needs, and both used to print only `exit=`.
    const importWrong = imported.status !== 0 || imported.timedOut || !existsSync(project);
    if (importWrong) for (const line of editorSaid(imported)) emit(line);
    if (imported.timedOut) fail(`the editor did not return within ${opts.timeoutS}s on import — that is a hang, not a result`);
    if (!existsSync(project)) {
      fail(`the editor wrote no project file; the import did not happen — what it printed is above and in ${logPath}`);
    }

    emit('');
    emit('## 2 export  (project -> json, default settings)');
    const exported = run(opts.editor, [...pin, '-i', project, '-o', join(opts.out, 'export'), '-e', 'json'], opts.timeoutS);
    emit(`  exit=${exported.status}${exported.timedOut ? `  TIMED OUT after ${opts.timeoutS}s` : ''}`);
    const written = existsSync(join(opts.out, 'export'))
      ? readdirSync(join(opts.out, 'export')).filter((f) => f.endsWith('.json'))
      : [];
    if (exported.status !== 0 || exported.timedOut || written.length === 0) {
      for (const line of editorSaid(exported)) emit(line);
    }
    if (exported.timedOut) fail(`the editor did not return within ${opts.timeoutS}s on export — that is a hang, not a result`);
    if (written.length === 0) {
      fail(
        'the editor wrote no json; stopping before the re-gate rather than measuring nothing — what it printed ' +
          `is above and in ${logPath}`,
      );
    }
    exportedJson = join(opts.out, 'export', written[0]);
    // 🔒 The version line checked against what the trip measured, once there is
    // an export to read (issue #1199): the editor's own `skeleton.spine`.
    const agreement = versionAgreement(editorRead, opts.editorVersion, declaredSpineVersion(exportedJson));
    emit(agreement.line);
    versionDisagrees = agreement.fail;
  }

  // The candidate: the export beside the build's atlas and pages, which were
  // read before step 1 (see `readBuildAtlas`). An `--exported` file is written
  // from the bytes parsed there; the editor's own export is copied from disk.
  const cand = join(opts.out, 'export-cand');
  if (exportedBytes !== null) writeFileSync(join(cand, 'skeleton.json'), exportedBytes);
  else copyFileSync(exportedJson, join(cand, 'skeleton.json'));
  for (const f of readdirSync(opts.build)) {
    if (f.endsWith('.atlas') || f.endsWith('.png')) copyFileSync(join(opts.build, f), join(cand, f));
  }

  emit('');
  emit('## 3 validate --profile spine  (the export)');
  const gate = run(rigc.cmd, [...rigc.prefix, 'validate', cand, '--profile', 'spine'], 600);
  emit(`  exit=${gate.status}`);
  for (const line of verdictLines(gate.stdout)) emit(`  ${line}`);

  emit('');
  emit('## 4 diff  (export against the build)');
  const diffJson = join(opts.out, 'diff.json');
  const diff = run(rigc.cmd, [...rigc.prefix, 'diff', join(cand, 'skeleton.json'), source, '--json', diffJson], 600);
  emit(`  exit=${diff.status}`);
  for (const line of verdictLines(diff.stdout)) emit(`  ${line}`);
  // Read the numbers out of the REPORT rather than off stdout: the measures
  // that moved are the answer to "what did the editor change", and scraping a
  // console layout for them would break the first time that layout is tidied.
  for (const line of diffSummaryLines(diffJson)) emit(`  ${line}`);

  // Report the changed meaning without skipping any later per-skin figures.
  let clipFailures: string[];
  try {
    // An unreadable export has no semantic comparison. Leave its established
    // gate/read failure intact (including the late-read planted controls).
    clipFailures = gate.status === 0 ? await addedConvexClipFailures(source, join(cand, 'skeleton.json'), opts.build) : [];
  } catch (error) {
    return fail(`could not measure clipping setup geometry: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (clipFailures.length > 0) {
    emit('');
    emit('## 4.1 clipping semantics');
    for (const line of clipFailures) emit(line);
  }

  // 🔒 The skins come off BOTH files, compared before anything is rendered
  // (issue #801). A skin the export dropped is named here as LOST BY THE EXPORT
  // and fails the run; enumerating the export's skins alone would quietly stop
  // looking for it, and enumerating the build's alone rendered a skin that was
  // not there and reported two unrelated refusals for it.
  const buildSkins = skinsDeclaredBy(source);
  const roster = skinRoster(buildSkins, skinsDeclaredBy(join(cand, 'skeleton.json')));
  const skinsFigure = diffFigure(diffJson, 'attachments.skins') ?? '(no `attachments.skins` measure in the diff report)';
  for (const [side, lost] of [
    ['lost by the export: the build declares it and the export does not', roster.lostByExport],
    ['added by the export: the export declares it and the build does not', roster.addedByExport],
  ] as const) {
    for (const skin of lost) {
      emit(
        `  FAIL  skin ${JSON.stringify(skin)} is ${side} (diff attachments.skins ${skinsFigure}) — it is rendered ` +
          'on neither side, because a render of a skin one file does not have measures nothing',
      );
    }
  }
  const rosterClean = roster.lostByExport.length === 0 && roster.addedByExport.length === 0;
  // The no-skin block is for a skeleton pair that declares no skin on EITHER
  // side; a build whose every skin the export dropped has nothing left to
  // render, and that is said above rather than drawn here with no skin set.
  const blocks = buildSkins.length > 0 && roster.both.length === 0 ? [] : skinBlocks(roster.both, opts.out, opts.fps);
  const checks: Array<{ skin: string | null; verdict: BlockVerdict; status: number | null; mae: number | null }> = [];
  for (const block of blocks) {
    emit('');
    emit(block.heading);
    const args = ['--fps', String(opts.fps), ...block.args];
    const drawBuild = run(rigc.cmd, [...rigc.prefix, 'render', '--candidate', opts.build, ...args, '--out', block.buildFrames], 900);
    const drawExport = run(rigc.cmd, [...rigc.prefix, 'render', '--candidate', cand, ...args, '--out', block.exportFrames], 900);
    // 🚨 Both renderers are quoted the moment either did not do what it was for
    // (issue #621) — the rule steps 1 and 2 have followed since #541, and step 5
    // was the one step that did not.
    for (const [what, ran] of [
      ['render (the build)', drawBuild],
      ['render (the export)', drawExport],
    ] as const) {
      if (ran.status !== 0 || ran.timedOut) for (const line of rigcSaid(what, ran)) emit(line);
    }
    const buildBlank = nothingToDraw(drawBuild);
    const exportBlank = nothingToDraw(drawExport);
    const buildDrew = drawBuild.status === 0 && !drawBuild.timedOut;
    const exportDrew = drawExport.status === 0 && !drawExport.timedOut;

    if (buildBlank && exportBlank) {
      emit(`  SKIP  ${NOTHING_MEASURED}`);
      checks.push({ skin: block.skin, verdict: 'not measured', status: null, mae: null });
      continue;
    }
    // 🔒 One side only, and it stays red. "Nothing to draw" is an honest answer
    // about a RIG; about one side of a round trip it is the loss the trip exists
    // to find, so the SKIP above is guarded by `&&` and never by `||`.
    if ((buildBlank && exportDrew) || (exportBlank && buildDrew)) {
      const blank = buildBlank ? 'the build' : 'the export';
      const drawn = buildBlank ? 'the export' : 'the build';
      emit(
        `  FAIL  ${blank} has nothing to draw and ${drawn} draws — one side drawing where the other does not IS ` +
          'the divergence this step measures, so it is a failure and never a SKIP',
      );
      checks.push({ skin: block.skin, verdict: 'no frames', status: null, mae: null });
      continue;
    }
    if (!buildDrew || !exportDrew) {
      emit(
        '  FAIL  a render did not do what it was for, so there is no frame set to compare — `check` is not run, ' +
          'because with a frame set missing its message would name the directory rather than the refusal above',
      );
      checks.push({ skin: block.skin, verdict: 'no frames', status: null, mae: null });
      continue;
    }
    const check = run(
      rigc.cmd,
      [...rigc.prefix, 'check', '--candidate', cand, '--frames', block.buildFrames, ...block.args, '--json', block.checkJson],
      900,
    );
    emit(`  exit=${check.status}`);
    if (check.status !== 0 || check.timedOut) for (const line of rigcSaid('check', check)) emit(line);
    for (const line of verdictLines(check.stdout)) emit(`  ${line}`);
    for (const line of checkFigures(block.checkJson)) emit(`  ${line}`);
    checks.push({ skin: block.skin, verdict: 'measured', status: check.status, mae: worstMeanMae(block.checkJson) });
  }
  // The roll-up, so a loss in one skin of many is a line somebody reads rather
  // than a row buried in the block above it. The mark is on the LARGEST figure
  // and only where the skins disagree: `check` has no pass mark to compare
  // against and this tool does not get to invent one, but "these skins did not
  // come back the same" is a fact the run itself produced.
  if (blocks.length > 1) {
    // ⚠️ Off the MEASURED blocks only (issue #621). A skin nobody could render
    // has no figure, and folding it in as one would put a number in the column a
    // reader looks at for a block where nothing was compared.
    const figures = checks.filter((c) => c.verdict === 'measured').map((c) => c.mae).filter((v): v is number => v !== null);
    const worst = figures.length === 0 ? null : Math.max(...figures);
    const agreed = figures.length === checks.length && new Set(figures).size === 1;
    emit('');
    emit(`  per skin  ${checks.length} block(s)`);
    for (const { skin, verdict, status, mae } of checks) {
      // 🔒 Never a pass and never an MAE of 0: a block that measured nothing
      // says so in the column the figures would have been in.
      if (verdict !== 'measured') {
        emit(
          `    ${String(skin).padEnd(20)} ` +
            (verdict === 'not measured'
              ? 'NOT MEASURED — neither side draws a frame under this skin'
              : '⚠️ NOT MEASURED — a render did not do what it was for, and this skin is red for it'),
        );
        continue;
      }
      emit(
        `    ${String(skin).padEnd(20)} check exit=${status}  worst mean MAE ` +
          `${mae === null ? '(no report)' : mae.toFixed(4)}` +
          `${status === 0 ? '' : '   ⚠️ this skin did not come back'}` +
          // The mark compares figures, so it needs two of them: crowning the one
          // skin that WAS measured "the worst" says nothing and reads as a loss.
          `${!agreed && figures.length > 1 && mae !== null && mae === worst ? `   ⚠️ the worst of the ${figures.length} measured skins` : ''}`,
      );
    }
    if (agreed) emit(`    ⤷ every skin came back at the same figure, so no skin is carrying a difference the others are not.`);
  }
  // 🔒 `not measured` is the one verdict that does not fail the run: nothing was
  // compared, and a round trip that ends red on a correct rig is the shape #608
  // removed from `build` (issue #621).
  const checksClean = checks.every((c) => c.verdict === 'not measured' || (c.verdict === 'measured' && c.status === 0));

  emit('');
  emit('## 6 what the editor rewrote');
  const rows = shapeDiff(shapeOf(source), shapeOf(join(cand, 'skeleton.json')));
  if (rows.length === 0) emit('  nothing at this resolution: same version, counts, animations and timeline kinds');
  for (const row of rows) emit(`  ${row}`);

  keepLog();
  emit('');
  emit(`log: ${logPath}`);
  // The verdict is the gate's and EVERY skin's check, not this tool's opinion of
  // them: one skin coming back wrong is the whole run coming back wrong, which
  // is the half a single un-skinned check could not say.
  // A version line that disagrees with the export is red too (issue #1199): the
  // report would otherwise name an editor the trip did not run on, green.
  process.exit(gate.status === 0 && checksClean && rosterClean && !versionDisagrees && clipFailures.length === 0 ? 0 : 1);
}

// ⭐ Guarded so `shapeOf`, `shapeDiff`, `skinsDeclaredBy` and `skinBlocks` can be
// READ by a control that has no editor (issues #561, #571). Every other `ERT`
// case drives this file as a subprocess, which is the right shape for a refusal;
// step 6's summary is a pure function of two skeleton files and step 5's plan is
// a pure function of one, and driving an editor — or four rigc subcommands — to
// reach either would be paying for a round trip to test arithmetic. Run as a
// program this is unchanged: `bun tools/editor_roundtrip.ts …` makes this module
// the entry, so `import.meta.main` is true.
if (import.meta.main) await main();
