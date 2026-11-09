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
 *    two outputs file by file: names, then SHA-256.
 *
 * Exit codes: **0** the candidate type-checks, both builds exit 0 and every
 * file is byte-identical; **1** any of those is not so, each named on its own
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
  0  the candidate type-checks, both builds exit 0, and every file they write is byte-identical
  1  one of those is not so — each is named
  2  a usage error, or a pack, copy or install failed, so nothing was measured
`;

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
    for (const side of sides) {
      const out = join(side.dir, '.rigc-dependant-out');
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
      const differ: string[] = [];
      for (const [file, hash] of mine) {
        const other = theirs.get(file);
        if (other === undefined) differ.push(`${file} is written on the candidate only`);
        else if (other !== hash) differ.push(`${file}: ${hash.slice(0, 16)} on the candidate, ${other.slice(0, 16)} on ${baseline}`);
      }
      for (const file of theirs.keys()) if (!mine.has(file)) differ.push(`${file} is written on ${baseline} only`);
      const digest = (files: Map<string, string>): string =>
        createHash('sha256')
          .update([...files].map(([file, hash]) => `${hash}  ${file}\n`).join(''))
          .digest('hex');
      if (differ.length > 0) {
        faults.push(`DEPENDANT_BUILD_BYTES: ${differ.length} of ${new Set([...mine.keys(), ...theirs.keys()]).size} file(s) differ from the build on ${NAME}@${baseline}:\n${differ.map((d) => `          ${d}`).join('\n')}`);
      } else {
        console.log(`  PASS  DEPENDANT_BUILD_BYTES: every one of ${mine.size} file(s) is byte-identical to the build on ${NAME}@${baseline} (listing sha256 ${digest(mine)})`);
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

process.exit(main());
