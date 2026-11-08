/** Core's rigc-run/1 receipt follows rig-run/1 with a complete input array. */
import { createHash } from 'node:crypto';
import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
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
  const seconds = /^[0-9]+$/.test(epoch) ? Number(epoch) : Number.NaN;
  if (!(seconds <= LAST_SOURCE_DATE_EPOCH)) {
    throw new CompileError(`RUN_STAMP_EPOCH: ${SOURCE_DATE_EPOCH} is ${JSON.stringify(epoch)}, and it must be a whole number of seconds from 0 to ${LAST_SOURCE_DATE_EPOCH}, written in decimal digits only — set it to such a value, or unset it to stamp the wall clock`, 'CE_RUN_STAMP_EPOCH');
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
