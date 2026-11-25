/** Core's rigc-run/1 receipt follows rig-run/1 with a complete input array. */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { CompileError } from '../errors.ts';
import { readPackageMeta } from '../package_meta.ts';

export const RUN_STAMP_FILE = 'run.json';
export type RunInputRole = 'rig' | 'motion' | 'manifest' | 'cuts';
export interface RunInput { role: RunInputRole; path: string; sha256: string }

export function runStampPackage(): { name: string; version: string } {
  const meta = readPackageMeta();
  if (typeof meta?.name !== 'string' || meta.name.trim() === '' || typeof meta.version !== 'string' || meta.version.trim() === '') {
    throw new CompileError('RUN_STAMP_PACKAGE: package.json must supply a non-empty name and version', 'CE_RUN_STAMP_PACKAGE');
  }
  return { name: meta.name, version: meta.version };
}

function sha256(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

export function readRunInputs(files: readonly { role: RunInputRole; path: string }[]): RunInput[] {
  const roles: RunInputRole[] = ['rig', 'motion', 'manifest', 'cuts'];
  return files.map((file) => ({ ...file, sha256: sha256(file.path) })).sort((a, b) =>
    roles.indexOf(a.role) - roles.indexOf(b.role) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** The variable a caller sets to fix both stamp times: the reproducible-builds convention, read by the entries only. */
export const SOURCE_DATE_EPOCH = 'SOURCE_DATE_EPOCH';

/** 9999-12-31T23:59:59Z: the last second whose `toISOString()` keeps the stamp's four-digit year. */
export const LAST_SOURCE_DATE_EPOCH = 253402300799;

/**
 * The stamp's clock. Unset, it is the entry's own wall clock, untouched. Set, both `started_at` and
 * `finished_at` are that one instant. A value that is not a whole number of seconds in decimal digits
 * from 0 to `LAST_SOURCE_DATE_EPOCH` is refused by name, never replaced by the wall clock: a typo
 * would quietly bring back the non-determinism the caller asked to remove. The entry reads the
 * environment and hands the raw text here, so nothing under `src/` reads it.
 */
export function runStampClock(epoch: string | undefined, wall: () => string): () => string {
  if (epoch === undefined) return wall;
  const seconds = /^(0|[1-9][0-9]*)$/.test(epoch) ? Number(epoch) : Number.NaN;
  if (!(seconds <= LAST_SOURCE_DATE_EPOCH)) {
    throw new CompileError(`RUN_STAMP_EPOCH: ${SOURCE_DATE_EPOCH} is ${JSON.stringify(epoch)}, and it must be a whole number of seconds from 0 to ${LAST_SOURCE_DATE_EPOCH}, written in decimal digits only with no leading zero — set it to such a value, or unset it to stamp the wall clock`, 'CE_RUN_STAMP_EPOCH');
  }
  const instant = new Date(seconds * 1000).toISOString();
  return () => instant;
}

/** Refuse a path on another volume before a build writes or removes any output. */
export function runStampPath(out: string, file: string): string {
  const path = relative(resolve(out), resolve(file));
  if (isAbsolute(path)) {
    throw new CompileError(`run stamp file "${file}" relative to output "${out}" produced absolute path "${path}" — keep recipe and report files on the output volume`, 'CE_RUN_STAMP_PATH_VOLUME');
  }
  return path.split(sep).join('/');
}

/** `render`'s own receipt, at the root of `--out`: a name no `build` writes, so a render into a build's directory leaves its `run.json` alone. */
export const RENDER_RUN_FILE = 'render-run.json';
export const RENDER_RUN_SPEC = 'rigc-run/2';
/** The temporary name the record is written under and renamed from, beside it. */
export const RENDER_RUN_TEMP_FILE = `${RENDER_RUN_FILE}.tmp`;

/**
 * Whether a path relative to a render's `--out` is its receipt — the one file every byte comparison of a render
 * leaves out, because it holds wall-clock times. One predicate, so no comparison spells the exclusion its own way.
 */
export function isRenderRunRecord(relativePath: string): boolean {
  return relativePath === RENDER_RUN_FILE;
}

/**
 * The frame-set directory, if any, that would be the record's path or its temporary one on a case-insensitive
 * filesystem — refused before anything is written, since the rename after the frames would otherwise fail on it.
 */
export function frameSetDirOnRecord(dirs: readonly string[]): string | undefined {
  const reserved = [RENDER_RUN_FILE, RENDER_RUN_TEMP_FILE];
  return dirs.find((dir) => reserved.includes(dir.toLowerCase()));
}
/** The `render` flags whose value is a path, so `argv` writes it relative to the output directory. `render` takes no positional. */
export const RENDER_PATH_FLAGS: readonly string[] = ['candidate', 'atlas', 'environment', 'viewport-from', 'boundary-from', 'out'];
export type RenderInputRole = 'skeleton' | 'atlas' | 'model' | 'environment' | 'viewport' | 'boundary';
export interface RenderInput { role: RenderInputRole; path: string; sha256: string }

/** A directory through every link, so a rerun whose working directory the process reports by its real path agrees. */
function realDir(path: string): string {
  return existsSync(path) ? realpathSync(path) : resolve(path);
}

/**
 * A directory through every link; a file through the links of its directory only, keeping its own name. Measured
 * (issue #1770, review): a `--candidate` naming a linked `skeleton.json` was followed to its target, and the rerun
 * looked for the atlas and model beside the target rather than beside the link.
 */
function realKeepingName(path: string): string {
  const absolute = resolve(path);
  if (!existsSync(absolute) || statSync(absolute).isDirectory()) return realDir(absolute);
  return join(realDir(dirname(absolute)), basename(absolute));
}

/**
 * `path` relative to the output directory, `/`-separated (`.` for the directory itself) — or, when no relative
 * spelling exists (another volume), `path` as the command line gave it: a receipt never refuses the render it records.
 *
 * ⚠️ Both ends are resolved through the filesystem's links when they exist. Measured (issue #1770): with the output
 * given through a linked directory (`/var` → `/private/var` on macOS) and the candidate relative to a working
 * directory the process reports by its real path, the textual difference climbed out through the link and named a
 * path that, run from the output directory, resolved nowhere.
 */
function relativeToOut(outRoot: string, path: string): string {
  const rel = relative(realDir(outRoot), realKeepingName(path));
  if (isAbsolute(rel)) return path;
  return rel === '' ? '.' : rel.split(sep).join('/');
}

/**
 * The tokens `render` received after its name, in their order, with one change: the value of every flag in
 * `RENDER_PATH_FLAGS`, spelled `--flag value` or `--flag=value`, is rewritten relative to the output directory. Nothing
 * is added: an option not given is not written. `booleanFlags` is the parser's set of flags that take no value, so a
 * token after one is read as the parser reads it.
 */
export function renderRunArgv(raw: readonly string[], outRoot: string, booleanFlags: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const token = raw[i];
    if (!token.startsWith('--')) {
      out.push(token);
      continue;
    }
    const eq = token.indexOf('=');
    if (eq !== -1) {
      const name = token.slice(2, eq);
      out.push(RENDER_PATH_FLAGS.includes(name) ? `--${name}=${relativeToOut(outRoot, token.slice(eq + 1))}` : token);
      continue;
    }
    out.push(token);
    const name = token.slice(2);
    if (booleanFlags.has(name) || i + 1 >= raw.length) continue;
    const value = raw[++i];
    out.push(RENDER_PATH_FLAGS.includes(name) ? relativeToOut(outRoot, value) : value);
  }
  return out;
}

/** The files a render read, hashed before it poses anything; a path the command did not reach is left out. */
export function readRenderInputs(files: readonly { role: RenderInputRole; path: string }[]): RenderInput[] {
  return files.map((file) => ({ ...file, sha256: sha256(file.path) }));
}

/**
 * Every file under `dir`, for the output inventory of a frame-set directory this render cleared and rewrote. The
 * record itself is never in it.
 */
export function filesWrittenUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (at: string): void => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const full = join(at, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(full);
    }
  };
  if (existsSync(dir)) walk(dir);
  return out;
}

/** Write `render-run.json` (`rigc-run/2`) at the root of `out`, after every output of this render is on disk. */
export function writeRenderRunStamp(
  out: string,
  argv: readonly string[],
  inputs: readonly RenderInput[],
  outputs: readonly string[],
  pkg: { name: string; version: string },
  startedAt: string,
  now: () => string,
): void {
  const pathOf = (file: string): string => relativeToOut(resolve(out), file);
  const rows = [...new Set(outputs.map((file) => resolve(file)))]
    .filter((file) => file !== resolve(out, RENDER_RUN_FILE))
    .map((file) => ({ path: pathOf(file), sha256: sha256(file) }))
    .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const stamp = {
    spec: RENDER_RUN_SPEC,
    package: pkg,
    command: 'render',
    argv: [...argv],
    started_at: startedAt,
    finished_at: now(),
    inputs: inputs.map((input) => ({ role: input.role, path: pathOf(input.path), sha256: input.sha256 })),
    outputs: rows,
  };
  const target = resolve(out, RENDER_RUN_FILE);
  const temporary = resolve(out, RENDER_RUN_TEMP_FILE);
  try {
    writeFileSync(temporary, JSON.stringify(stamp, null, 2) + '\n', { flag: 'wx' });
    renameSync(temporary, target);
  } finally {
    rmSync(temporary, { force: true });
  }
}

/** Hash only the returned output inventory, after every output has been written. */
export function writeRunStamp(out: string, inputs: readonly RunInput[], outputs: readonly string[], pkg: { name: string; version: string }, startedAt: string, now: () => string): void {
  const pathOf = (file: string): string => runStampPath(out, file);
  for (const input of inputs) {
    if (sha256(input.path) !== input.sha256) throw new CompileError(`RUN_STAMP_INPUT_CHANGED: ${input.role} input changed during build; rerun with fixed inputs`, 'CE_RUN_STAMP_INPUT_CHANGED');
  }
  const rows = [...new Set(outputs)].map((file) => ({ path: pathOf(file), sha256: sha256(file) }))
    .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const stamp = {
    spec: 'rigc-run/1',
    package: pkg,
    command: 'build',
    started_at: startedAt,
    finished_at: now(),
    inputs: inputs.map((input) => ({ role: input.role, path: pathOf(input.path), sha256: input.sha256 })),
    outputs: rows,
  };
  const target = resolve(out, RUN_STAMP_FILE);
  const temporary = target + '.tmp';
  try {
    writeFileSync(temporary, JSON.stringify(stamp, null, 2) + '\n', { flag: 'wx' });
    renameSync(temporary, target);
  } finally {
    rmSync(temporary, { force: true });
  }
}
