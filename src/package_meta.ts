/**
 * The package's own metadata — its installed version and repository — read
 * once from the `package.json` beside the code.
 *
 * Moved here unchanged from `src/cli/shared.ts` (issue #1230), which imports
 * these back and re-exports every name it exported before, so no caller
 * changed an import. They moved because the motion comparison
 * (`src/meshcompare.ts`) records the version of the poser that ran
 * (`MeshQualityReport.poser`, P2 of docs/MESH_REDUCTION.md), and a library
 * module that read it through `src/cli/shared.ts` would load the whole CLI —
 * the compiler, `check` and every command body — to read one string. One
 * reader, in the one place both can reach.
 *
 * Imports nothing but `node:fs` and `node:path`: no clock, no runtime.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface PackageMeta {
  name?: string;
  version?: string;
  repository?: string | { url?: string };
}

let packageMeta: PackageMeta | null | undefined;

/**
 * The directory `cli.ts` sits in: `package.json`, `skills/` and, in a
 * checkout, `examples/` and `scripts/` are beside it, in the repository and
 * once installed. One level above this file (`src/`) — the same directory
 * `src/cli/shared.ts` reached two levels above itself before the reader moved.
 */
export const PACKAGE_ROOT = join(import.meta.dir, '..');

/** `package.json` sits next to `cli.ts` both in the repo and once installed (`PACKAGE_ROOT`). */
export function readPackageMeta(): PackageMeta | null {
  if (packageMeta === undefined) {
    try {
      packageMeta = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')) as PackageMeta;
    } catch {
      packageMeta = null;
    }
  }
  return packageMeta;
}

export function readVersion(): string {
  return readPackageMeta()?.version ?? 'unknown';
}
