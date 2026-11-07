/** Core's rigc-run/1 receipt follows rig-run/1 with a complete input array. */
import { createHash } from 'node:crypto';
import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { CompileError } from '../errors.ts';
import { readPackageMeta } from '../package_meta.ts';

export const RUN_STAMP_FILE = 'run.json';
export type RunInputRole = 'rig' | 'motion' | 'manifest' | 'cuts';
export interface RunInput { role: RunInputRole; path: string; sha256: string }

export function runStampPackage(): { name: string; version: string } {
  const meta = readPackageMeta();
  if (typeof meta?.name !== 'string' || meta.name.trim() === '' || typeof meta.version !== 'string' || meta.version.trim() === '') {
    throw new CompileError('RUN_STAMP_PACKAGE: package.json must supply a non-empty name and version');
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

/** Hash only the returned output inventory, after every output has been written. */
export function writeRunStamp(out: string, inputs: readonly RunInput[], outputs: readonly string[], pkg: { name: string; version: string }, startedAt: string, now: () => string): void {
  const pathOf = (file: string): string => relative(resolve(out), resolve(file)).split(sep).join('/');
  for (const input of inputs) {
    if (sha256(input.path) !== input.sha256) throw new CompileError(`RUN_STAMP_INPUT_CHANGED: ${input.role} input changed during build; rerun with fixed inputs`);
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
