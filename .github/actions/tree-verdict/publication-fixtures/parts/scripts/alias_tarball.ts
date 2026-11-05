/**
 * The package under another name: the same bytes as the tarball this tree
 * packs, with the `name` field of `package.json` changed and nothing else.
 *
 *     bun scripts/alias_tarball.ts pack --name <alias> --out <dir> [--tarball <tgz>]
 *     bun scripts/alias_tarball.ts compare <package.tgz> <alias.tgz>
 *
 * The package is published as `name` in `package.json` and, at every version,
 * under each of its aliases carrying the same files: the names it shipped
 * under before keep being served, so nobody who installed or depends on one is
 * stranded. rig-c does the same for its own former name (rigc#1258), and
 * this script is a port of the one it publishes with. RELEASING.md *The
 * registry side* says which name is which.
 *
 * `pack` makes one alias per call: it writes the alias tarball into `--out`
 * and prints its path as the last line of stdout, which is what each alias
 * step of `release.yml` hands to its `npm publish`. It packs this tree (or takes `--tarball`), extracts the
 * result, rewrites the one `"name": …` line of the extracted `package.json`,
 * packs the extraction again, and refuses to print a path unless `compare`
 * then reads the two tarballs as identical but for that line. Nothing is
 * written inside the repository: the tree the publish step and the
 * confirmation read is the tree that was gated.
 *
 * `compare` is the same reading on its own, for any two tarballs: the same set
 * of paths, every file byte-identical, and `package/package.json` identical
 * once the alias's `name` line is put back to the package's. It is what the
 * smoke's `--alias` runs on the two tarballs the registry served, so the
 * confirmation reads the published bytes rather than this tree's.
 *
 * ⚖️ **Not the tarball's hash.** The two tarballs cannot share a `dist.shasum`:
 * one line of one file differs by design, and the gzip stream differs with
 * it. What is promised is the unpacked content, so that is what is compared,
 * file by file, and a difference is named by path, both sizes and the first
 * byte at which they part.
 *
 * 🔒 **The alias publish runs no lifecycle script, and that is why it is sound
 * rather than a gap.** `npm publish <tarball>` runs none — `prepublishOnly`
 * exists only for a publish from a directory. Here `prepublishOnly` runs the
 * whole gate (`typecheck && lint && selftest`) over the checkout, where rig-c's
 * reads a tally its CI wrote; that difference changes nothing for the alias.
 * A second gated publish from the checkout would need the package renamed in
 * the checkout first, so the gate would run over a modified tree that is no
 * longer the commit the first gate passed, and the confirmation after it would
 * read that modified tree too. The alias is instead packed from the gated
 * commit after its own gated publish, in the same job, and `compare` holds it
 * to that commit's tarball before the path is printed.
 *
 * Exit codes: **0** the alias was written (`pack`) or the two tarballs carry
 * the same content but for the name (`compare`); **1** they do not, each
 * difference named; **2** a usage error, or a pack or an extraction that did
 * not complete, so nothing was measured.
 *
 * Not `tools/`: it does not ship, and it runs from a checkout — the same
 * reason `scripts/install_smoke.ts` lives here.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';

const ROOT = resolve(import.meta.dir, '..');

/**
 * The other names, in the order `release.yml` publishes them: `rig-parts`, the
 * package's name from 1.0.0-rc.1 to 1.5.3,
 * and the alias `spine-parts`, the name every version up to 0.16.0 shipped under.
 * Not in `package.json`, which names the package once; this is the one place in
 * the tree that names the aliases for a program to read, and the selftest's
 * `AL01` holds `release.yml`'s alias steps and its confirmations to it.
 */
export const ALIASES: readonly string[] = ['rig-parts', 'spine-parts'];

const EXIT_SAME = 0;
const EXIT_DIFFERENT = 1;
const EXIT_USAGE = 2;

/** The file whose `name` line is the one permitted difference. */
export const MANIFEST = 'package/package.json';

/** A step that did not complete, so there is no reading to report. Exit 2. */
export class AliasTarballError extends Error {}

/** An alias that was packed and reads as different from its package beyond the name. Exit 1. */
export class AliasDiffersError extends AliasTarballError {}

interface Ran {
  status: number;
  out: string;
}

function run(cmd: string, args: readonly string[], cwd: string): Ran {
  const r = spawnSync(cmd, [...args], { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const failed = r.error === undefined ? '' : `\n${r.error.message}`;
  return { status: typeof r.status === 'number' ? r.status : 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}${failed}` };
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
  if (unpacked.status !== 0) throw new AliasTarballError(`\`tar -xzf ${tgz}\` exited ${unpacked.status}: ${unpacked.out.trim().slice(0, 2000)}`);
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
  const work = mkdtempSync(join(tmpdir(), 'rig-parts-alias-compare-'));
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
    return { name, alias, files: left.length, faults };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** `npm pack` of a directory into an empty one, returning the one tarball it wrote. */
export function packInto(dir: string, into: string): string {
  mkdirSync(into, { recursive: true });
  const before = new Set(readdirSync(into));
  const packed = run('npm', ['pack', dir, '--ignore-scripts', '--pack-destination', into, '--loglevel=error'], into);
  const made = readdirSync(into).filter((f) => f.endsWith('.tgz') && !before.has(f));
  if (packed.status !== 0 || made.length !== 1) {
    throw new AliasTarballError(`\`npm pack ${dir}\` exited ${packed.status} and left ${made.length} new tarball(s); one was required. ${packed.out.trim().slice(0, 2000)}`);
  }
  return join(into, made[0]);
}

/**
 * Write the alias tarball into `out` and return its path, after holding it to
 * the package tarball it was made from. `packageTgz` is packed from this tree
 * when not given.
 */
export function packAlias(alias: string, out: string, packageTgz?: string): { tgz: string; comparison: AliasComparison } {
  mkdirSync(out, { recursive: true });
  const work = mkdtempSync(join(tmpdir(), 'rig-parts-alias-pack-'));
  try {
    const primary = packageTgz ?? packInto(ROOT, join(work, 'package'));
    const tree = join(work, 'tree');
    extract(primary, tree);
    const manifest = join(tree, MANIFEST);
    const text = readFileSync(manifest, 'utf8');
    const name = nameIn(text, `${primary}'s ${MANIFEST}`);
    if (alias === name) throw new AliasTarballError(`--name ${alias} is the package's own name, so there is no alias to make`);
    const next = renamed(text, name, alias);
    if (next === null) throw new AliasTarballError(`${primary}'s ${MANIFEST} does not carry exactly one "name": ${JSON.stringify(name)} line, so there is no one line to change`);
    writeFileSync(manifest, next);
    const tgz = packInto(join(tree, 'package'), out);
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

const HELP = `rig-parts alias tarball — the package under another name, with nothing else changed

usage:
  bun scripts/alias_tarball.ts pack --name <alias> --out <dir> [--tarball <tgz>]
  bun scripts/alias_tarball.ts compare <package.tgz> <alias.tgz>

pack     packs this tree (or takes --tarball), rewrites the one "name" line of its
         package.json to <alias>, packs it again into <dir>, holds the result to the
         package tarball with compare, and prints the alias tarball's path last
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
      console.log(`  PASS  ALIAS_SAME_CONTENT: ${reading.alias} carries the ${reading.files} file(s) of ${reading.name}, byte for byte but for the name line of ${MANIFEST}`);
      return EXIT_SAME;
    }
    if (command === 'pack') {
      const flags = new Map<string, string>();
      for (let i = 0; i < rest.length; i += 2) {
        const [flag, value] = [rest[i], rest[i + 1]];
        if (!['--name', '--out', '--tarball'].includes(flag) || value === undefined || value.startsWith('--')) {
          console.error(`alias_tarball: "${flag}" is not an argument pack takes with a value; --help lists them`);
          return EXIT_USAGE;
        }
        flags.set(flag, value);
      }
      const alias = flags.get('--name');
      const out = flags.get('--out');
      const tarball = flags.get('--tarball');
      if (alias === undefined || out === undefined) {
        console.error('alias_tarball: pack needs --name <alias> and --out <dir>');
        return EXIT_USAGE;
      }
      if (tarball !== undefined && !existsSync(tarball)) {
        console.error(`alias_tarball: --tarball ${tarball} names no file`);
        return EXIT_USAGE;
      }
      const made = packAlias(alias, resolve(out), tarball === undefined ? undefined : resolve(tarball));
      console.error(
        `alias_tarball: ${made.comparison.alias} carries the ${made.comparison.files} file(s) of ${made.comparison.name}, byte for byte but for the name line of ${MANIFEST}`,
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
