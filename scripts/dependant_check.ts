/**
 * Does a DEPENDANT still type-check and build on a candidate of this package —
 * and does its build write the same bytes as it does on the last release?
 *
 *     bun scripts/dependant_check.ts --dependant <dir> -- <build command…>
 *     bun scripts/dependant_check.ts --dependant <dir> --patch <file> -- <build command…>
 *
 * `bun run smoke` holds what a dependant was SEEN importing — every symbol in
 * `OBSERVED_SYMBOLS`, read and called from an install (issue #1212). What it
 * cannot hold is the dependant itself: its types (the smoke has no `tsc`, and
 * deliberately), and whether its own build, run on its own inputs, still
 * writes what it wrote. This asks that question of one dependant's checkout,
 * before a release pull request is approved: RELEASING.md *Cutting a release*
 * names the step and the command.
 *
 * What it does, in a temp directory and nowhere else:
 *
 * 1. Packs this tree (`npm pack`, as the smoke does) — or takes `--tarball`.
 * 2. Copies the dependant's checkout twice, leaving out `node_modules`, `.git`
 *    and `.claude`. 🔒 **Nothing is written under `--dependant`**: both copies
 *    are made before anything runs, every command runs in a copy, and the run
 *    refuses to start if the temp directory is inside the dependant.
 * 3. `--patch <file>`, if given, is applied to the CANDIDATE copy with
 *    `patch -p1` — the dependant's own change not yet landed (a switch of its
 *    imports, say), verified here before it is theirs to land.
 * 4. Installs each copy's dependencies with `bun install`, then this package
 *    into it, under the name the dependant declares — the package's own,
 *    `@rig-c/core`, or one of the aliases it is also published as, `ALIASES` in
 *    `scripts/alias_tarball.ts` (`rig-c` and `spine-rigc`, issues #1258, #1347,
 *    #1728): the candidate tarball into one (repacked under the alias by
 *    `scripts/alias_tarball.ts` when that is the name declared, the files
 *    unchanged), and `<name>@<baseline>` from the registry into the other. The baseline is `--baseline <version>`, or
 *    `latest` — the registry's own answer to "the last release", read at the
 *    moment of the run and printed as the version it installed. Not this
 *    tree's `package.json` version: on a release pull request that is the
 *    version being cut, which the registry does not serve yet.
 * 5. Runs the dependant's own `typecheck` script in the candidate copy — read
 *    from its `package.json`, never assumed; a dependant with none is reported
 *    as such and is not a pass.
 * 6. Runs the build command after `--` in both copies, with every `{out}` in
 *    it replaced by an output directory of that copy's own, and compares the
 *    two outputs file by file: every non-receipt file (rig files, atlas pages,
 *    build reports, gate text) by SHA-256; every shared recognised run receipt
 *    (`rigc-run/1`, `rigc-run/2`, `rig-run/1`, `rig-run/2`, `rig-run/3`, read
 *    by `spec`) by field outside `started_at`, `finished_at` and
 *    `package.version`, with every exclusion printed by file and key; and any
 *    candidate-only recognised run receipt named by path and `spec` as an
 *    addition. An unknown `spec` is never treated as a receipt: it stays
 *    byte-compared and is named when it differs or appears on one side only.
 *
 * Exit codes: **0** the candidate type-checks, both builds exit 0, every
 * non-receipt file is byte-identical, every shared recognised run receipt is
 * equal outside the three excluded keys, and every candidate-only file is a
 * recognised run receipt; **1** any of those is not so, each named on its own
 * line; **2** a usage error, or nothing could run (a pack, a copy or an install
 * that failed is not a verdict on the dependant).
 *
 * ⚖️ A difference in the bytes is a fact, not automatically a defect: a release
 * whose notes take the negative form ("`build`'s output is not
 * byte-identical…") moved them on purpose, and the files this names are what
 * moved for that dependant. It still exits 1, because "identical" is the one
 * reading a release can be approved on without reading further.
 *
 * Not `tools/`: it does not ship, and it runs from a checkout — the same reason
 * `scripts/install_smoke.ts` lives here.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';

import { ALIASES, packAlias } from './alias_tarball.ts';

const ROOT = resolve(import.meta.dir, '..');
/** The package's own name, read from the tree this packs rather than written here. */
const PACKAGE = (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { name?: string }).name ?? '';

const EXIT_GREEN = 0;
const EXIT_RED = 1;
const EXIT_USAGE = 2;

const HELP = `rigc dependant check — does a dependant type-check and build on a candidate of this package, writing what it wrote on the last release?

usage:
  bun scripts/dependant_check.ts --dependant <dir> [--tarball <tgz>] [--patch <file>] [--baseline <version>] [--keep] -- <build command…>

  --dependant <dir>     the dependant's checkout; read and copied, never written
  --tarball <tgz>       the candidate; default: \`npm pack\` of this tree
  --patch <file>        a patch (-p1) applied to the candidate copy only
  --baseline <version>  the release the bytes are compared with; default: latest, as the registry serves it
  --keep                leave the temp directory and name it

Every {out} in the build command is replaced by an output directory of each copy's own.

exit codes:
  0  the candidate type-checks, both builds exit 0, every non-receipt file they write is byte-identical, every shared recognised run receipt (rigc-run/1, rigc-run/2, rig-run/1, rig-run/2, rig-run/3) is equal outside started_at, finished_at and package.version, and any candidate-only file is a recognised run receipt
  1  one of those is not so — each is named
  2  a usage error, or a pack, copy or install failed, so nothing was measured
`;

/**
 * Run-receipt `spec` families and the schema versions read for field comparison
 * (issue #1778): core's `rigc-run/1` and `rigc-run/2`, and a dependant's
 * `rig-run/1`, `rig-run/2` and `rig-run/3`. An unread version or another `spec`
 * (including `build-report/1`, whose companion `gate_spine-html.txt` keeps only
 * summary counts and whose SHA-256 is pinned inside `rig-run/3` `outputs`) is
 * refused receipt treatment, stays byte-compared, and has its `spec` named.
 */
export const RECEIPT_SPEC_FAMILIES: Readonly<Record<string, readonly number[]>> = {
  'rigc-run': [1, 2],
  'rig-run': [1, 2, 3],
};

export const RECOGNISED_RECEIPT_SPECS: readonly string[] = Object.entries(RECEIPT_SPEC_FAMILIES).flatMap(
  ([family, versions]) => versions.map((version) => `${family}/${version}`),
);

const RECOGNISED_RECEIPT_SET: ReadonlySet<string> = new Set(RECOGNISED_RECEIPT_SPECS);

/** The only receipt fields excluded from equality; none of the five specs nests another package version or a path here. */
export const EXCLUDED_RECEIPT_KEYS = ['started_at', 'finished_at', 'package.version'] as const;
export type ExcludedReceiptKey = (typeof EXCLUDED_RECEIPT_KEYS)[number];

export interface ReceiptExclusion {
  file: string;
  spec: string;
  key: ExcludedReceiptKey;
  candidate: string;
  baseline: string;
}

export interface ReceiptAddition {
  file: string;
  spec: string;
}

type ReceiptReading =
  | { kind: 'non-spec' }
  | { kind: 'unknown-spec'; spec: string }
  | { kind: 'malformed-receipt'; spec: string; reason: string }
  | { kind: 'receipt'; spec: string; doc: Record<string, unknown> };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJsonObject(bytes: Buffer): Record<string, unknown> | null {
  let at = 0;
  while (at < bytes.length && (bytes[at] === 0x20 || bytes[at] === 0x09 || bytes[at] === 0x0a || bytes[at] === 0x0d)) at++;
  if (at >= bytes.length || bytes[at] !== 0x7b) return null;
  try {
    const parsed: unknown = JSON.parse(bytes.toString('utf8'));
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readReceiptCandidate(bytes: Buffer): ReceiptReading {
  const doc = parseJsonObject(bytes);
  if (doc === null || typeof doc.spec !== 'string') return { kind: 'non-spec' };
  const spec = doc.spec;
  if (!RECOGNISED_RECEIPT_SET.has(spec)) return { kind: 'unknown-spec', spec };
  if (typeof doc.started_at !== 'string' || doc.started_at.trim() === '') {
    return { kind: 'malformed-receipt', spec, reason: 'started_at must be a non-empty string' };
  }
  if (typeof doc.finished_at !== 'string' || doc.finished_at.trim() === '') {
    return { kind: 'malformed-receipt', spec, reason: 'finished_at must be a non-empty string' };
  }
  if (
    !isPlainObject(doc.package) ||
    typeof doc.package.name !== 'string' ||
    doc.package.name.trim() === '' ||
    typeof doc.package.version !== 'string' ||
    doc.package.version.trim() === ''
  ) {
    return { kind: 'malformed-receipt', spec, reason: 'package must hold non-empty string name and version' };
  }
  return { kind: 'receipt', spec, doc };
}

function summarizeValue(value: unknown): string {
  const text = JSON.stringify(value);
  if (text === undefined) return String(value);
  return text.length <= 96 ? text : `${text.slice(0, 93)}...`;
}

function isExcludedReceiptKey(key: string): key is ExcludedReceiptKey {
  return (EXCLUDED_RECEIPT_KEYS as readonly string[]).includes(key);
}

function compareReceiptFields(
  file: string,
  spec: string,
  candidateDoc: Record<string, unknown>,
  baselineDoc: Record<string, unknown>,
  baselineLabel: string,
): { exclusions: ReceiptExclusion[]; diffs: string[] } {
  const exclusions: ReceiptExclusion[] = [];
  const diffs: string[] = [];
  const walk = (cand: unknown, base: unknown, at: string, rowHint: string): void => {
    if (isExcludedReceiptKey(at)) {
      const c = cand as string;
      const b = base as string;
      if (c !== b) exclusions.push({ file, spec, key: at, candidate: c, baseline: b });
      return;
    }
    if (Array.isArray(cand) && Array.isArray(base)) {
      if (cand.length !== base.length) {
        diffs.push(`${at}: length ${cand.length} on the candidate, ${base.length} on ${baselineLabel}`);
      }
      const shared = Math.min(cand.length, base.length);
      for (let i = 0; i < shared; i++) {
        const ci: unknown = cand[i];
        const bi: unknown = base[i];
        const hint =
          isPlainObject(ci) && isPlainObject(bi) && typeof ci.path === 'string' && ci.path === bi.path
            ? ` (path ${JSON.stringify(ci.path)})`
            : '';
        walk(ci, bi, `${at}[${i}]`, hint);
      }
      return;
    }
    if (isPlainObject(cand) && isPlainObject(base)) {
      const keys = [...new Set([...Object.keys(cand), ...Object.keys(base)])].sort();
      for (const key of keys) {
        const child = at === '' ? key : `${at}.${key}`;
        if (!(key in base)) diffs.push(`${child}${rowHint}: ${summarizeValue(cand[key])} on the candidate, absent on ${baselineLabel}`);
        else if (!(key in cand)) diffs.push(`${child}${rowHint}: absent on the candidate, ${summarizeValue(base[key])} on ${baselineLabel}`);
        else walk(cand[key], base[key], child, rowHint);
      }
      return;
    }
    if (!Object.is(cand, base)) {
      diffs.push(`${at}${rowHint}: ${summarizeValue(cand)} on the candidate, ${summarizeValue(base)} on ${baselineLabel}`);
    }
  };
  walk(candidateDoc, baselineDoc, '', '');
  return { exclusions, diffs };
}

function unknownSpecClause(reading: ReceiptReading): string {
  if (reading.kind === 'unknown-spec') {
    return ` (spec ${JSON.stringify(reading.spec)}, not a recognised run receipt; byte-compared — recognised: ${RECOGNISED_RECEIPT_SPECS.join(', ')})`;
  }
  if (reading.kind === 'malformed-receipt') {
    return ` (spec ${JSON.stringify(reading.spec)}, malformed run receipt: ${reading.reason}; byte-compared)`;
  }
  if (reading.kind === 'receipt') {
    return ` (spec ${JSON.stringify(reading.spec)})`;
  }
  return '';
}

export interface DependantOutputComparison {
  byteIdentical: number;
  receiptEqual: number;
  exclusions: ReceiptExclusion[];
  additions: ReceiptAddition[];
  differ: string[];
  notes: string[];
}

export function compareDependantOutputs(
  candidateOut: string,
  baselineOut: string,
  mine: ReadonlyMap<string, string>,
  theirs: ReadonlyMap<string, string>,
  baseline: string,
): DependantOutputComparison {
  let byteIdentical = 0;
  let receiptEqual = 0;
  const exclusions: ReceiptExclusion[] = [];
  const additions: ReceiptAddition[] = [];
  const differ: string[] = [];

  for (const [file, hash] of mine) {
    const other = theirs.get(file);
    const candPath = join(candidateOut, ...file.split('/'));
    if (other === undefined) {
      const cand = readReceiptCandidate(readFileSync(candPath));
      if (cand.kind === 'receipt') additions.push({ file, spec: cand.spec });
      else differ.push(`${file}${unknownSpecClause(cand)} is written on the candidate only`);
      continue;
    }
    if (other === hash) {
      byteIdentical++;
      continue;
    }
    const basePath = join(baselineOut, ...file.split('/'));
    const cand = readReceiptCandidate(readFileSync(candPath));
    const base = readReceiptCandidate(readFileSync(basePath));
    if (cand.kind === 'receipt' && base.kind === 'receipt' && cand.spec === base.spec) {
      const compared = compareReceiptFields(file, cand.spec, cand.doc, base.doc, baseline);
      if (compared.diffs.length === 0 && compared.exclusions.length > 0) {
        receiptEqual++;
        exclusions.push(...compared.exclusions);
      } else if (compared.diffs.length === 0) {
        differ.push(`${file} (spec ${JSON.stringify(cand.spec)}): ${hash.slice(0, 16)} on the candidate, ${other.slice(0, 16)} on ${baseline} (every field value equal; formatting or key order differs)`);
      } else {
        differ.push(`${file} (spec ${JSON.stringify(cand.spec)}): ${compared.diffs.join('; ')}`);
      }
      continue;
    }
    if (cand.kind === 'unknown-spec' && base.kind === 'unknown-spec' && cand.spec === base.spec) {
      differ.push(`${file}${unknownSpecClause(cand)}: ${hash.slice(0, 16)} on the candidate, ${other.slice(0, 16)} on ${baseline}`);
    } else if (cand.kind !== 'non-spec' || base.kind !== 'non-spec') {
      const candLabel = cand.kind === 'non-spec' ? 'no spec' : `spec ${JSON.stringify(cand.spec)}${cand.kind === 'unknown-spec' ? ' (not a recognised run receipt)' : cand.kind === 'malformed-receipt' ? ` (malformed: ${cand.reason})` : ''}`;
      const baseLabel = base.kind === 'non-spec' ? 'no spec' : `spec ${JSON.stringify(base.spec)}${base.kind === 'unknown-spec' ? ' (not a recognised run receipt)' : base.kind === 'malformed-receipt' ? ` (malformed: ${base.reason})` : ''}`;
      differ.push(`${file} (${candLabel} on the candidate, ${baseLabel} on ${baseline}; byte-compared): ${hash.slice(0, 16)} on the candidate, ${other.slice(0, 16)} on ${baseline}`);
    } else {
      differ.push(`${file}: ${hash.slice(0, 16)} on the candidate, ${other.slice(0, 16)} on ${baseline}`);
    }
  }

  for (const file of theirs.keys()) {
    if (mine.has(file)) continue;
    const base = readReceiptCandidate(readFileSync(join(baselineOut, ...file.split('/'))));
    differ.push(`${file}${unknownSpecClause(base)} is written on ${baseline} only`);
  }

  const notes: string[] = [
    ...exclusions.map(
      (ex) => `excluded ${ex.file} (spec ${JSON.stringify(ex.spec)}) ${ex.key}: ${JSON.stringify(ex.candidate)} on the candidate, ${JSON.stringify(ex.baseline)} on ${baseline}`,
    ),
    ...additions.map((add) => `addition ${add.file} (spec ${JSON.stringify(add.spec)}): written on the candidate only`),
  ];

  return { byteIdentical, receiptEqual, exclusions, additions, differ, notes };
}

interface Ran {
  status: number;
  out: string;
}

function run(cmd: string, args: readonly string[], cwd: string): Ran {
  const r = spawnSync(cmd, [...args], { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const failed = r.error === undefined ? '' : `\n${r.error.message}`;
  return { status: typeof r.status === 'number' ? r.status : 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}${failed}` };
}

/** The last lines a command printed, indented under the line that names it. */
function tail(out: string, lines: number): string {
  return out
    .trim()
    .split('\n')
    .slice(-lines)
    .map((line) => `          ${line}`)
    .join('\n');
}

/** Every file under a directory, by its path relative to it, with its SHA-256 — sorted, so two listings compare line for line. */
function hashTree(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (at: string): void => {
    for (const name of readdirSync(at).sort()) {
      const path = join(at, name);
      if (statSync(path).isDirectory()) walk(path);
      else out.set(relative(dir, path).split(sep).join('/'), createHash('sha256').update(readFileSync(path)).digest('hex'));
    }
  };
  if (existsSync(dir)) walk(dir);
  return out;
}

/** Copy a checkout, leaving out what an install or a VCS puts there. */
function copyCheckout(from: string, to: string): void {
  const skip = new Set(['node_modules', '.git', '.claude']);
  cpSync(from, to, {
    recursive: true,
    filter: (src) => {
      const rel = relative(from, src);
      return rel === '' || !skip.has(rel.split(sep)[0]);
    },
  });
}

function main(): number {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(HELP);
    return EXIT_GREEN;
  }
  const dash = argv.indexOf('--');
  const own = dash === -1 ? argv : argv.slice(0, dash);
  const build = dash === -1 ? [] : argv.slice(dash + 1);
  const known = new Set(['--dependant', '--tarball', '--patch', '--baseline']);
  const flags = new Map<string, string>();
  let keep = false;
  for (let i = 0; i < own.length; i++) {
    const flag = own[i];
    if (flag === '--keep') {
      keep = true;
      continue;
    }
    if (!known.has(flag)) {
      console.log(`  FAIL  DEPENDANT_USAGE: "${flag}" is not an argument this takes; --help lists them`);
      return EXIT_USAGE;
    }
    const value = own[i + 1];
    if (value === undefined || value.startsWith('--')) {
      console.log(`  FAIL  DEPENDANT_USAGE: ${flag} needs a value`);
      return EXIT_USAGE;
    }
    flags.set(flag, value);
    i += 1;
  }
  const dependantFlag = flags.get('--dependant');
  if (dependantFlag === undefined || build.length === 0) {
    console.log('  FAIL  DEPENDANT_USAGE: --dependant <dir> and a build command after `--` are both required; --help shows the form');
    return EXIT_USAGE;
  }
  if (!build.some((arg) => arg.includes('{out}'))) {
    console.log(`  FAIL  DEPENDANT_USAGE: the build command ${JSON.stringify(build.join(' '))} names no {out}, so there is no output of its own to compare`);
    return EXIT_USAGE;
  }
  if (!existsSync(join(dependantFlag, 'package.json'))) {
    console.log(`  FAIL  DEPENDANT_USAGE: ${dependantFlag} holds no package.json, so it is not a dependant's checkout`);
    return EXIT_USAGE;
  }
  const dependant = realpathSync(dependantFlag);
  const patchFlag = flags.get('--patch');
  const patch = patchFlag === undefined ? null : resolve(patchFlag);
  if (patch !== null && !existsSync(patch)) {
    console.log(`  FAIL  DEPENDANT_USAGE: --patch ${patchFlag} names no file`);
    return EXIT_USAGE;
  }
  const tarballFlag = flags.get('--tarball');
  if (tarballFlag !== undefined && !existsSync(tarballFlag)) {
    console.log(`  FAIL  DEPENDANT_USAGE: --tarball ${tarballFlag} names no file`);
    return EXIT_USAGE;
  }
  const baseline = flags.get('--baseline') ?? 'latest';
  const manifest = JSON.parse(readFileSync(join(dependant, 'package.json'), 'utf8')) as {
    name?: string;
    version?: string;
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  // The name the dependant imports the package by is the one it declares; a
  // dependant declaring neither is measured under the package's own name, and
  // its type check is what then says so.
  const declares = (name: string): string | undefined => manifest.dependencies?.[name] ?? manifest.devDependencies?.[name];
  const NAME = [PACKAGE, ...ALIASES].find((name) => declares(name) !== undefined) ?? PACKAGE;

  const work = realpathSync(mkdtempSync(join(tmpdir(), 'rigc-dependant-')));
  if (`${work}${sep}`.startsWith(`${dependant}${sep}`)) {
    console.log(`  FAIL  DEPENDANT_USAGE: the temp directory ${work} is inside the dependant ${dependant}, and nothing may be written there; set TMPDIR elsewhere`);
    rmSync(work, { recursive: true, force: true });
    return EXIT_USAGE;
  }
  console.log(
    `rigc dependant check — ${manifest.name ?? '(unnamed)'} ${manifest.version ?? ''} (declares ${NAME} ${declares(NAME) ?? 'not at all'}) ` +
      `on ${tarballFlag === undefined ? `a tarball packed from ${ROOT}` : tarballFlag}, against ${NAME}@${baseline}`,
  );

  const faults: string[] = [];
  const holes: string[] = [];
  try {
    // 1. The candidate.
    let tgz = tarballFlag === undefined ? '' : resolve(tarballFlag);
    if (tgz === '') {
      const packDir = join(work, 'pack');
      mkdirSync(packDir);
      const packed = run('npm', ['pack', ROOT, '--pack-destination', packDir, '--silent'], work);
      const made = readdirSync(packDir).filter((f) => f.endsWith('.tgz'));
      if (packed.status !== 0 || made.length !== 1) {
        holes.push(`DEPENDANT_PACK: \`npm pack\` exited ${packed.status} and left ${made.length} tarball(s); one was required\n${tail(packed.out, 12)}`);
        return report(faults, holes, keep, work);
      }
      tgz = join(packDir, made[0]);
    }
    if (NAME !== PACKAGE) {
      tgz = packAlias(NAME, join(work, 'alias'), tgz).tgz;
      console.log(`  the dependant declares ${NAME}, the alias: the candidate repacked under that name, its files unchanged`);
    }
    console.log(`  candidate ${tgz} (sha256 ${createHash('sha256').update(readFileSync(tgz)).digest('hex')})`);

    // 2–4. Two copies, each installed.
    const sides = [
      { label: 'candidate', dir: join(work, 'candidate'), install: tgz },
      { label: `${NAME}@${baseline}`, dir: join(work, 'baseline'), install: `${NAME}@${baseline}` },
    ];
    for (const side of sides) copyCheckout(dependant, side.dir);
    if (patch !== null) {
      const applied = run('patch', ['-p1', '--forward', '--input', patch], sides[0].dir);
      if (applied.status !== 0) {
        holes.push(`DEPENDANT_PATCH: \`patch -p1\` of ${patch} exited ${applied.status} in the candidate copy\n${tail(applied.out, 12)}`);
        return report(faults, holes, keep, work);
      }
      console.log(`  patched the candidate copy: ${applied.out.trim().split('\n').length} line(s) from patch`);
    }
    for (const side of sides) {
      const deps = run('bun', ['install'], side.dir);
      const added = deps.status === 0 ? run('bun', ['add', side.install], side.dir) : deps;
      const installed = join(side.dir, 'node_modules', NAME, 'package.json');
      if (added.status !== 0 || !existsSync(installed)) {
        holes.push(`DEPENDANT_INSTALL: installing ${side.install} into the ${side.label} copy exited ${added.status}\n${tail(added.out, 12)}`);
        return report(faults, holes, keep, work);
      }
      const version = (JSON.parse(readFileSync(installed, 'utf8')) as { version?: string }).version ?? '';
      console.log(`  ${side.label} copy: ${NAME} ${version} installed`);
    }

    // 5. The dependant's own type check, on the candidate.
    if (manifest.scripts?.typecheck === undefined) {
      faults.push('DEPENDANT_TYPECHECKS: the dependant declares no `typecheck` script, so its types were not checked against the candidate — not a pass');
    } else {
      const typed = run('bun', ['run', 'typecheck'], sides[0].dir);
      if (typed.status !== 0) faults.push(`DEPENDANT_TYPECHECKS: \`bun run typecheck\` (${manifest.scripts.typecheck}) exited ${typed.status} on the candidate\n${tail(typed.out, 40)}`);
      else console.log(`  PASS  DEPENDANT_TYPECHECKS: \`bun run typecheck\` (${manifest.scripts.typecheck}) exited 0 on the candidate`);
    }

    // 6. The build, both sides, and the bytes.
    const outs: Array<Map<string, string>> = [];
    const outDirs: string[] = [];
    for (const side of sides) {
      const out = join(side.dir, '.rigc-dependant-out');
      outDirs.push(out);
      const args = build.map((arg) => arg.split('{out}').join(out));
      const built = run(args[0], args.slice(1), side.dir);
      const files = hashTree(out);
      if (built.status !== 0 || files.size === 0) {
        faults.push(`DEPENDANT_BUILDS: \`${build.join(' ')}\` exited ${built.status} in the ${side.label} copy and wrote ${files.size} file(s)\n${tail(built.out, 20)}`);
      } else {
        console.log(`  PASS  DEPENDANT_BUILDS: \`${build.join(' ')}\` exited 0 in the ${side.label} copy, ${files.size} file(s)`);
      }
      outs.push(files);
    }
    const [mine, theirs] = outs;
    if (mine.size > 0 && theirs.size > 0) {
      const compared = compareDependantOutputs(outDirs[0], outDirs[1], mine, theirs, baseline);
      const digest = (files: Map<string, string>): string =>
        createHash('sha256')
          .update([...files].map(([file, hash]) => `${hash}  ${file}\n`).join(''))
          .digest('hex');
      if (compared.differ.length > 0) {
        for (const note of compared.notes) console.log(`  ..    ${note}`);
        faults.push(`DEPENDANT_BUILD_BYTES: ${compared.differ.length} of ${new Set([...mine.keys(), ...theirs.keys()]).size} file(s) differ from the build on ${NAME}@${baseline}:\n${compared.differ.map((d) => `          ${d}`).join('\n')}`);
      } else if (compared.receiptEqual === 0 && compared.additions.length === 0) {
        console.log(`  PASS  DEPENDANT_BUILD_BYTES: every one of ${mine.size} file(s) is byte-identical to the build on ${NAME}@${baseline} (listing sha256 ${digest(mine)})`);
      } else {
        console.log(
          `  PASS  DEPENDANT_BUILD_BYTES: ${compared.byteIdentical} of ${mine.size} file(s) byte-identical to the build on ${NAME}@${baseline}, ` +
            `${compared.receiptEqual} run receipt(s) equal by field (${compared.exclusions.length} excluded key(s)), ` +
            `${compared.additions.length} candidate-only run receipt addition(s) ` +
            `(recognised specs: ${RECOGNISED_RECEIPT_SPECS.join(', ')}; listing sha256 ${digest(mine)})`,
        );
        for (const note of compared.notes) console.log(`          ${note}`);
      }
    }
    return report(faults, holes, keep, work);
  } catch (e) {
    holes.push(`DEPENDANT_RUN: ${e instanceof Error ? e.message : String(e)}`);
    return report(faults, holes, keep, work);
  }
}

function report(faults: string[], holes: string[], keep: boolean, work: string): number {
  for (const f of [...holes, ...faults]) console.log(`  FAIL  ${f}`);
  if (keep) console.log(`  kept: ${work}`);
  else rmSync(work, { recursive: true, force: true });
  if (holes.length > 0) {
    console.log('rigc dependant check: nothing was measured — a pack, copy or install did not complete');
    return EXIT_USAGE;
  }
  console.log(faults.length === 0 ? 'rigc dependant check: green' : `rigc dependant check: ${faults.length} fault(s)`);
  return faults.length === 0 ? EXIT_GREEN : EXIT_RED;
}

if (import.meta.main) process.exit(main());
