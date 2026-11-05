/**
 * Ported from @rig-c/pose: pack the gated checkout under its convenience name.
 * Only package.json's name line changes; compare reads every unpacked byte.
 * No lifecycle scripts run and the source checkout is never renamed.
 * npm publish <tarball> uses these already-gated files.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';

const ROOT = resolve(import.meta.dir, '..');

/** The convenience install name, published after the scoped package. */
export const ALIASES: readonly string[] = ['rig-review'];

const EXIT_SAME = 0;
const EXIT_DIFFERENT = 1;
const EXIT_USAGE = 2;

/** The file whose `name` line is the one permitted difference. */
export const MANIFEST = 'package/package.json';

/** A step that did not complete, so there is no reading to report. Exit 2. */
export class AliasTarballError extends Error {}

/** An alias that was packed and reads as different from its package beyond the name. Exit 1. */
export class AliasDiffersError extends AliasTarballError {}

/** Per-process bounds; the CLI may pack twice and extract three times. */
export const PACK_TIMEOUT_MS = 15_000;
/** Explicit release override: at most five minutes for each of the two packs. */
export const MAX_PACK_TIMEOUT_MS = 300_000;
const TAR_TIMEOUT_MS = 5_000;
export const ALIAS_COMMAND_TIMEOUT_MS = 2 * PACK_TIMEOUT_MS + 3 * TAR_TIMEOUT_MS + 5_000;

function validatePackTimeout(timeoutMs: number): void {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_PACK_TIMEOUT_MS) {
    throw new AliasTarballError(`--pack-timeout-ms must be an integer in 1..${MAX_PACK_TIMEOUT_MS} ms`);
  }
}

interface Ran {
  status: number;
  out: string;
  timedOut: boolean;
  signal: string | null;
  elapsedMs: number;
}

function run(cmd: string, args: readonly string[], cwd: string, timeout = TAR_TIMEOUT_MS): Ran {
  const started = performance.now();
  const r = spawnSync(cmd, [...args], { cwd, timeout, killSignal: 'SIGKILL', encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const failed = r.error === undefined ? '' : `\n${r.error.message}`;
  return {
    status: typeof r.status === 'number' ? r.status : 1,
    out: `${r.stdout ?? ''}${r.stderr ?? ''}${failed}`,
    timedOut: (r.error as NodeJS.ErrnoException | undefined)?.code === 'ETIMEDOUT',
    signal: r.signal,
    elapsedMs: Math.round(performance.now() - started),
  };
}

/** Every file under a directory, by its path relative to it, sorted so two listings compare line for line. */
function filesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (at: string): void => {
    for (const name of readdirSync(at).sort()) {
      const path = join(at, name);
      if (statSync(path).isDirectory()) walk(path);
      else out.push(relative(dir, path).split(sep).join('/'));
    }
  };
  walk(dir);
  return out;
}

function extract(tgz: string, into: string): void {
  mkdirSync(into, { recursive: true });
  const unpacked = run('tar', ['-xzf', tgz, '-C', into], into);
  if (unpacked.status !== 0) throw new AliasTarballError(`\`tar -xzf ${tgz}\` exited ${unpacked.status}; elapsed=${unpacked.elapsedMs} ms; limit=${TAR_TIMEOUT_MS} ms; signal=${unpacked.signal ?? 'none'}${unpacked.timedOut ? '; TIMEOUT' : ''}: ${unpacked.out.trim().slice(0, 2000) || '(no output)'}`);
  if (!existsSync(join(into, MANIFEST))) throw new AliasTarballError(`${tgz} holds no ${MANIFEST}, so it is not an npm package tarball`);
}

/** The `name` a package.json declares, read as JSON rather than as text. */
function nameIn(manifestText: string, where: string): string {
  let parsed: { name?: unknown };
  try {
    parsed = JSON.parse(manifestText) as { name?: unknown };
  } catch (error) {
    throw new AliasTarballError(`${where} is not JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (typeof parsed.name !== 'string' || parsed.name === '') throw new AliasTarballError(`${where} declares no name`);
  return parsed.name;
}

/** The manifest's text with its one `"name": "<from>"` line rewritten to `<to>`, or null if there is not exactly one. */
export function renamed(text: string, from: string, to: string): string | null {
  const line = new RegExp(`^(\\s*"name"\\s*:\\s*)${JSON.stringify(from).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s*,?\\s*)$`, 'gm');
  const hits = [...text.matchAll(line)];
  if (hits.length !== 1) return null;
  return text.replace(line, (_all, head: string, tail: string) => `${head}${JSON.stringify(to)}${tail}`);
}

/** Where two byte strings first part, or -1 when one is the other. */
function firstDifference(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return a.length === b.length ? -1 : n;
}

export interface AliasComparison {
  /** The package's name and the alias's, as their manifests declare them. */
  name: string;
  alias: string;
  /** Files the package tarball holds. */
  files: number;
  version: string;
  aliasVersion: string;
  /** One line per difference, each naming the path; empty when the alias is the package under another name. */
  faults: string[];
}

/**
 * Hold `aliasTgz` to `packageTgz`: the same paths, every file the same bytes,
 * and the manifest the same text once the alias's `name` line reads the
 * package's name. Throws `AliasTarballError` only when a tarball cannot be
 * read at all; every difference between two readable tarballs is a fault.
 */
export function compareTarballs(packageTgz: string, aliasTgz: string): AliasComparison {
  const work = mkdtempSync(join(tmpdir(), 'rig-review-alias-compare-'));
  try {
    const a = join(work, 'package');
    const b = join(work, 'alias');
    extract(packageTgz, a);
    extract(aliasTgz, b);
    const aText = readFileSync(join(a, MANIFEST), 'utf8');
    const bText = readFileSync(join(b, MANIFEST), 'utf8');
    const name = nameIn(aText, `${packageTgz}'s ${MANIFEST}`);
    const alias = nameIn(bText, `${aliasTgz}'s ${MANIFEST}`);
    const faults: string[] = [];
    const left = filesUnder(a);
    const right = filesUnder(b);
    const rightSet = new Set(right);
    const leftSet = new Set(left);
    for (const path of left) if (!rightSet.has(path)) faults.push(`${path} is in ${name}'s tarball and not in ${alias}'s`);
    for (const path of right) if (!leftSet.has(path)) faults.push(`${path} is in ${alias}'s tarball and not in ${name}'s`);
    if (alias === name) faults.push(`${MANIFEST} names the alias ${JSON.stringify(alias)}, the package's own name, so the second tarball is not under another name`);
    for (const path of left) {
      if (!rightSet.has(path)) continue;
      let mine: Uint8Array = readFileSync(join(a, path));
      let theirs: Uint8Array = readFileSync(join(b, path));
      if (path === MANIFEST && alias !== name) {
        const back = renamed(bText, alias, name);
        if (back === null) {
          faults.push(`${MANIFEST} of ${alias} does not carry exactly one "name": ${JSON.stringify(alias)} line, so its one permitted difference cannot be read as the only one`);
          continue;
        }
        mine = new TextEncoder().encode(aText);
        theirs = new TextEncoder().encode(back);
      }
      const at = firstDifference(mine, theirs);
      if (at !== -1) {
        faults.push(
          `${path} differs${path === MANIFEST ? ' beyond its name line' : ''}: ${mine.length} byte(s) in ${name}'s tarball and ${theirs.length} in ${alias}'s, first parting at byte ${at}`,
        );
      }
    }
    const version = (JSON.parse(aText) as { version: string }).version;
    const aliasVersion = (JSON.parse(bText) as { version: string }).version;
    return { name, alias, version, aliasVersion, files: left.length, faults };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/**
 * Read the tarball npm actually wrote, independent of its stdout JSON shape.
 * A publish dry-run still needs private test tarballs; override only that pack
 * setting, keeping the caller's registry, authentication and cache configuration.
 * npm 10's directory fetcher runs prepare even with ignore-scripts. Give this
 * pack alone an empty script shell as well: lifecycle text is never evaluated,
 * including on that path. The manifest and installed npm stay untouched.
 */
export function packInto(dir: string, into: string, timeoutMs = PACK_TIMEOUT_MS): string {
  validatePackTimeout(timeoutMs);
  const source = resolve(dir);
  const destination = resolve(into);
  mkdirSync(destination, { recursive: true });
  const before = new Set(readdirSync(destination));
  const shellDir = mkdtempSync(join(tmpdir(), 'rig-review-pack-shell-'));
  try {
    const shell = join(shellDir, 'skip-lifecycle');
    writeFileSync(shell, '#!/bin/sh\nexit 0\n', { mode: 0o700 });
    const packed = run('npm', ['pack', '.', '--ignore-scripts', '--dry-run=false', '--script-shell', shell, '--pack-destination', destination, '--loglevel=error'], source, timeoutMs);
    const made = readdirSync(destination).filter((f) => f.endsWith('.tgz') && !before.has(f));
    if (packed.timedOut || packed.status !== 0 || made.length !== 1) {
      const diagnostic = `cwd=${source}; destination=${destination}; elapsed=${packed.elapsedMs} ms; limit=${timeoutMs} ms; signal=${packed.signal ?? 'none'}${packed.timedOut ? '; TIMEOUT' : ''}`;
      throw new AliasTarballError(`\`npm pack ${dir}\` exited ${packed.status} and left ${made.length} new tarball(s); one was required. ${diagnostic}. ${packed.out.trim().slice(0, 2000) || '(no output)'}`);
    }
    return join(destination, made[0]);
  } finally {
    rmSync(shellDir, { recursive: true, force: true });
  }
}

/**
 * Write the alias tarball into `out` and return its path, after holding it to
 * the package tarball it was made from. `packageTgz` is packed from this tree
 * when not given.
 */
export function packAlias(alias: string, out: string, packageTgz?: string, timeoutMs = PACK_TIMEOUT_MS): { tgz: string; comparison: AliasComparison } {
  validatePackTimeout(timeoutMs);
  if (!ALIASES.includes(alias)) throw new AliasTarballError(`--name ${JSON.stringify(alias)} is not the convenience name ${ALIASES.join(', ')}`);
  mkdirSync(out, { recursive: true });
  const work = mkdtempSync(join(tmpdir(), 'rig-review-alias-pack-'));
  try {
    const primary = packageTgz ?? packInto(ROOT, join(work, 'package'), timeoutMs);
    const tree = join(work, 'tree');
    extract(primary, tree);
    const manifest = join(tree, MANIFEST);
    const text = readFileSync(manifest, 'utf8');
    const name = nameIn(text, `${primary}'s ${MANIFEST}`);
    if (alias === name) throw new AliasTarballError(`--name ${alias} is the package's own name, so there is no alias to make`);
    const next = renamed(text, name, alias);
    if (next === null) throw new AliasTarballError(`${primary}'s ${MANIFEST} does not carry exactly one "name": ${JSON.stringify(name)} line, so there is no one line to change`);
    writeFileSync(manifest, next);
    const tgz = packInto(join(tree, 'package'), out, timeoutMs);
    const comparison = compareTarballs(primary, tgz);
    if (comparison.faults.length > 0) {
      rmSync(tgz, { force: true });
      throw new AliasDiffersError(`the alias packed from ${primary} differs from it beyond the name:\n  ${comparison.faults.join('\n  ')}`);
    }
    return { tgz, comparison };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

const HELP = `rig-review alias tarball — the package under another name, with nothing else changed

usage:
  bun scripts/alias_tarball.ts pack --name <alias> --out <dir> [--tarball <tgz>] [--pack-timeout-ms <ms>]
  bun scripts/alias_tarball.ts compare <package.tgz> <alias.tgz>

pack     packs this tree (or takes --tarball), rewrites the one "name" line of its
         package.json to <alias>, packs it again into <dir>, holds the result to the
         package tarball with compare, and prints the alias tarball's path last
         --pack-timeout-ms bounds each npm pack (default ${PACK_TIMEOUT_MS} ms,
         maximum ${MAX_PACK_TIMEOUT_MS} ms); release opts into the larger bound
compare  the same paths, every file the same bytes, and package.json the same once
         the alias's name line reads the package's name

exit codes:
  0  the alias was written, or the two carry the same content but for the name
  1  they do not — each difference is named
  2  a usage error, or a pack or an extraction did not complete
`;

function main(): number {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    console.log(HELP);
    return argv.length === 0 ? EXIT_USAGE : EXIT_SAME;
  }
  const [command, ...rest] = argv;
  try {
    if (command === 'compare') {
      if (rest.length !== 2 || rest.some((path) => !existsSync(path))) {
        console.error('alias_tarball: compare takes two tarballs that exist; --help shows the form');
        return EXIT_USAGE;
      }
      const reading = compareTarballs(resolve(rest[0]), resolve(rest[1]));
      if (reading.faults.length > 0) {
        console.log(`  FAIL  ALIAS_SAME_CONTENT: ${reading.alias} differs from ${reading.name} beyond its name:`);
        for (const fault of reading.faults) console.log(`          ${fault}`);
        return EXIT_DIFFERENT;
      }
      console.log(`  PASS  ALIAS_SAME_CONTENT: ${reading.alias}@${reading.aliasVersion} carries the ${reading.files} file(s) of ${reading.name}@${reading.version}, byte for byte but for the name line of ${MANIFEST}`);
      return EXIT_SAME;
    }
    if (command === 'pack') {
      const flags = new Map<string, string>();
      for (let i = 0; i < rest.length; i += 2) {
        const [flag, value] = [rest[i], rest[i + 1]];
        if (!['--name', '--out', '--tarball', '--pack-timeout-ms'].includes(flag) || value === undefined || value.startsWith('--')) {
          console.error(`alias_tarball: "${flag}" is not an argument pack takes with a value; --help lists them`);
          return EXIT_USAGE;
        }
        flags.set(flag, value);
      }
      const alias = flags.get('--name');
      const out = flags.get('--out');
      const tarball = flags.get('--tarball');
      const timeoutText = flags.get('--pack-timeout-ms');
      if (timeoutText !== undefined && !/^[1-9]\d*$/.test(timeoutText)) {
        throw new AliasTarballError(`--pack-timeout-ms must be an integer in 1..${MAX_PACK_TIMEOUT_MS} ms`);
      }
      const timeoutMs = timeoutText === undefined ? PACK_TIMEOUT_MS : Number(timeoutText);
      validatePackTimeout(timeoutMs);
      if (alias === undefined || out === undefined) {
        console.error('alias_tarball: pack needs --name <alias> and --out <dir>');
        return EXIT_USAGE;
      }
      if (tarball !== undefined && !existsSync(tarball)) {
        console.error(`alias_tarball: --tarball ${tarball} names no file`);
        return EXIT_USAGE;
      }
      const made = packAlias(alias, resolve(out), tarball === undefined ? undefined : resolve(tarball), timeoutMs);
      console.error(
        `alias_tarball: ${made.comparison.alias}@${made.comparison.aliasVersion} carries the ${made.comparison.files} file(s) of ${made.comparison.name}@${made.comparison.version}, byte for byte but for the name line of ${MANIFEST}`,
      );
      console.log(made.tgz);
      return EXIT_SAME;
    }
    console.error(`alias_tarball: "${command}" is not a command; --help lists them`);
    return EXIT_USAGE;
  } catch (error) {
    if (error instanceof AliasTarballError) {
      console.error(`alias_tarball: ${error.message}`);
      return error instanceof AliasDiffersError ? EXIT_DIFFERENT : EXIT_USAGE;
    }
    throw error;
  }
}

if (import.meta.main) process.exit(main());
