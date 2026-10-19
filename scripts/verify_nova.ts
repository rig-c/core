/**
 * The full selftest, sent to a remote job pool with the tree it needs (issue #1474).
 *
 *     bun run verify:nova -- --label "<issue + purpose>" --owner "<who>" --session "<session id>"
 *
 * A pool job runs on an upload of the working tree, and that upload is not a
 * clone: it carries no `.git`, so the selftest's `git ls-files` throws before
 * the cli suite reads a file, and no `examples/` (gitignored), so the suites
 * that measure the editor's example corpus stop on it. Both are measured: the
 * first full run sent as `bun run selftest` died on the first and, given a
 * `.git`, went red on the second (RC18, RC20, RC22). This hand prepares the
 * upload the way the selftest needs and then runs it, unchanged:
 *
 *   1. where the upload has no `.git`, a throwaway repository over it — one
 *      commit, a placeholder identity — so `git ls-files` lists what was sent;
 *   2. `bun run fetch-examples`;
 *   3. `bun run selftest`, whose exit is the job's, and the pool runner's is this.
 *
 * ⚠️ The selftest is not taught to tolerate either absence. A missing `.git`
 * and a missing corpus stay what they are on every other machine — a crash and
 * a HOLE — because a run that measured less must not print what a whole run
 * prints. This changes what is uploaded, not what is measured.
 *
 * The runner is `NOVA_RUN`, or `nova-run.sh` on `PATH`; neither is refused by
 * name. `--label`, `--owner` and `--session` are passed through and required:
 * the pool refuses a job without them after the upload, and this refuses it
 * before anything is sent. `unknown` and a blank value are refused as missing,
 * as the pool does.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';

/** What runs on the upload, in its root. */
export const VERIFY_NOVA_REMOTE =
  'set -e; ' +
  'if [ ! -e .git ]; then git init -q && git add -A && git -c user.name=verify-nova -c user.email=verify-nova@invalid commit -q -m "verify:nova upload"; fi; ' +
  'bun run fetch-examples; ' +
  'bun run selftest';

const FIELDS = ['label', 'owner', 'session'] as const;

/** The three pass-through values, or the refusal naming what is missing. */
export function readVerifyNovaArgs(argv: readonly string[]): { label: string; owner: string; session: string } | string {
  const got: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const field = FIELDS.find((f) => flag === `--${f}`);
    if (field === undefined) return `unknown argument ${JSON.stringify(flag)} — this takes --label, --owner and --session, and nothing else`;
    if (i + 1 >= argv.length) return `--${field} needs a value`;
    got[field] = argv[++i];
  }
  const missing = FIELDS.filter((f) => got[f] === undefined || got[f].trim() === '' || got[f].trim() === 'unknown');
  if (missing.length > 0) {
    return `${missing.map((f) => `--${f}`).join(', ')} ${missing.length === 1 ? 'is' : 'are'} missing, blank or "unknown" — the pool records who sent each job, and refuses it without all three: --label "<issue + purpose>" --owner "<who>" --session "<session id>"`;
  }
  return { label: got.label, owner: got.owner, session: got.session };
}

/** The pool runner: `NOVA_RUN`, else `nova-run.sh` on `PATH`, else `null`. */
export function findNovaRunner(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.NOVA_RUN !== undefined && env.NOVA_RUN !== '') return existsSync(env.NOVA_RUN) ? env.NOVA_RUN : null;
  for (const dir of (env.PATH ?? '').split(delimiter)) {
    if (dir !== '' && existsSync(join(dir, 'nova-run.sh'))) return join(dir, 'nova-run.sh');
  }
  return null;
}

if (import.meta.main) {
  const read = readVerifyNovaArgs(process.argv.slice(2));
  if (typeof read === 'string') {
    console.error(`verify:nova: ${read}`);
    process.exit(2);
  }
  const runner = findNovaRunner();
  if (runner === null) {
    const named = process.env.NOVA_RUN;
    console.error(
      named !== undefined && named !== ''
        ? `verify:nova: NOVA_RUN names ${named}, and nothing is there`
        : 'verify:nova: no pool runner — set NOVA_RUN to the path of nova-run.sh, or put nova-run.sh on PATH',
    );
    process.exit(2);
  }
  const ran = spawnSync(runner, ['--label', read.label, '--owner', read.owner, '--session', read.session, '--', 'bash', '-c', VERIFY_NOVA_REMOTE], { stdio: 'inherit' });
  if (typeof ran.status === 'number') process.exit(ran.status);
  console.error(`verify:nova: could not run ${runner}: ${ran.error?.message ?? (ran.signal === null ? 'it left no exit status' : `it died by ${ran.signal}`)}`);
  process.exit(1);
}
