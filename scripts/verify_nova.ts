/**
 * The full selftest, sent to a remote job pool with the tree it needs (issue #1474).
 *
 *     bun run verify:nova -- --label "<issue + purpose>" --owner "<who>" --session "<session id>" [--bun <version>]
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
const BUN_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?![\s\S])/;
// Nova's runner executes bash on its Linux x64 WSL host; it has no --bun
// switch. The baseline build also runs on hosts without AVX2. Versions come
// from Bun's release manifest, never a list maintained by this repository.
const BUN_ARCHIVE = 'bun-linux-x64-baseline.zip';

interface VerifyNovaArgs { label: string; owner: string; session: string; bun?: string }
export interface VerifyNovaBun { version: string; url: string; sha256: string }
type ReleaseFetch = (url: string, init: { method: 'GET' | 'HEAD'; signal: AbortSignal }) => Promise<Pick<Response, 'ok' | 'status' | 'text'>>;

/** Resolve the exact official release BEFORE calling the runner (which uploads). */
export async function resolveVerifyNovaBun(version: string, request: ReleaseFetch = fetch): Promise<VerifyNovaBun | string> {
  const refusal = (why: string): string => `--bun ${JSON.stringify(version)}: ${why}`;
  if (!BUN_VERSION.test(version)) return refusal('expected an exact stable version X.Y.Z, e.g. --bun 1.4.0 (no alias, prefix or range)');
  const base = `https://github.com/oven-sh/bun/releases/download/bun-v${version}/`;
  try {
    const manifest = await request(`${base}SHASUMS256.txt`, { method: 'GET', signal: AbortSignal.timeout(30_000) });
    if (!manifest.ok) return refusal(`cannot fetch Bun release manifest ${base}SHASUMS256.txt (HTTP ${manifest.status}) — choose a published stable Bun release or retry the fetch`);
    const rows = (await manifest.text()).split(/\r?\n/).filter((line) => line.trim().split(/\s+/).at(-1)?.replace(/^\*/, '') === BUN_ARCHIVE);
    const checksum = rows.length === 1 ? /^([a-fA-F0-9]{64})\s+\*?bun-linux-x64-baseline\.zip\s*$/.exec(rows[0])?.[1] : undefined;
    if (checksum === undefined) return refusal(`Bun's SHASUMS256.txt must name exactly one SHA-256 for ${BUN_ARCHIVE}; found ${rows.length} row(s), no unambiguous valid checksum — choose a release with that asset`);
    const url = `${base}${BUN_ARCHIVE}`;
    const archive = await request(url, { method: 'HEAD', signal: AbortSignal.timeout(30_000) });
    if (!archive.ok) return refusal(`cannot fetch ${url} (HTTP ${archive.status}) — choose a published release with that asset or retry the fetch`);
    return { version, url, sha256: checksum.toLowerCase() };
  } catch (error) {
    return refusal(`cannot fetch the official release: ${error instanceof Error ? error.message : String(error)} — retry with network access to github.com`);
  }
}

/** Pin the manifest's digest in the job, install privately, and verify the runtime before any test. */
export function verifyNovaRemote(bun?: VerifyNovaBun): string {
  if (bun === undefined) return VERIFY_NOVA_REMOTE;
  // All shell substitutions below are either fixed text or constrained release
  // metadata. Do not let a future caller turn metadata into shell source.
  if (!BUN_VERSION.test(bun.version) || !/^[a-f0-9]{64}$/.test(bun.sha256) ||
      bun.url !== `https://github.com/oven-sh/bun/releases/download/bun-v${bun.version}/${BUN_ARCHIVE}`) {
    throw new Error(`--bun ${JSON.stringify(bun.version)}: invalid pinned Bun release metadata`);
  }
  const fail = `echo 'verify:nova: --bun ${bun.version}: pinned runtime preparation failed; selftest was not started' >&2; exit 2;`;
  return 'set -e; ' +
    `if [ "$(uname -s)/$(uname -m)" != Linux/x86_64 ]; then ${fail} fi; ` +
    `toolchain=$(mktemp -d "\${TMPDIR:-/tmp}/verify-nova-bun.XXXXXXXX") || { ${fail} }; ` +
    'trap \'rm -rf "$toolchain"\' EXIT; ' +
    `curl -fsSL --retry 2 '${bun.url}' -o "$toolchain/bun.zip" || { ${fail} }; ` +
    `printf '%s  %s\\n' '${bun.sha256}' "$toolchain/bun.zip" | sha256sum -c - >/dev/null || { ${fail} }; ` +
    `python3 -c 'import pathlib,sys,zipfile; root=pathlib.Path(sys.argv[1]); binary=root/"bun-linux-x64-baseline"/"bun"; binary.parent.mkdir(); binary.write_bytes(zipfile.ZipFile(root/"bun.zip").read("bun-linux-x64-baseline/bun")); binary.chmod(0o755)' "$toolchain" || { ${fail} }; ` +
    'export PATH="$toolchain/bun-linux-x64-baseline:$PATH"; hash -r; ' +
    `found=$(bun --version) || { ${fail} }; if [ "$found" != '${bun.version}' ]; then echo "verify:nova: --bun ${bun.version}: downloaded Bun reports $found; selftest was not started" >&2; exit 2; fi; ` +
    'printf \'verify:nova: Bun %s\\n\' "$found"; ' + VERIFY_NOVA_REMOTE;
}

/** The three pass-through values, or the refusal naming what is missing. */
export function readVerifyNovaArgs(argv: readonly string[]): VerifyNovaArgs | string {
  const got: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const field = flag === '--bun' ? 'bun' : FIELDS.find((f) => flag === `--${f}`);
    if (field === undefined) return `unknown argument ${JSON.stringify(flag)} — this takes --label, --owner, --session and optional --bun <version>`;
    if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) return `--${field} needs a value`;
    if (field === 'bun' && got.bun !== undefined) return '--bun was given more than once — name one exact stable Bun version';
    got[field] = argv[++i];
    if (field === 'bun' && !BUN_VERSION.test(got.bun)) return `--bun ${JSON.stringify(got.bun)}: expected an exact stable version X.Y.Z, e.g. --bun 1.4.0 (no alias, prefix or range)`;
  }
  const missing = FIELDS.filter((f) => got[f] === undefined || got[f].trim() === '' || got[f].trim() === 'unknown');
  if (missing.length > 0) {
    return `${missing.map((f) => `--${f}`).join(', ')} ${missing.length === 1 ? 'is' : 'are'} missing, blank or "unknown" — the pool records who sent each job, and refuses it without all three: --label "<issue + purpose>" --owner "<who>" --session "<session id>"`;
  }
  return { label: got.label, owner: got.owner, session: got.session, ...(got.bun === undefined ? {} : { bun: got.bun }) };
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
  const bun = read.bun === undefined ? undefined : await resolveVerifyNovaBun(read.bun);
  if (typeof bun === 'string') {
    console.error(`verify:nova: ${bun}`);
    process.exit(2);
  }
  const ran = spawnSync(runner, ['--label', read.label, '--owner', read.owner, '--session', read.session, '--', 'bash', '-c', verifyNovaRemote(bun)], { stdio: 'inherit' });
  if (typeof ran.status === 'number') process.exit(ran.status);
  console.error(`verify:nova: could not run ${runner}: ${ran.error?.message ?? (ran.signal === null ? 'it left no exit status' : `it died by ${ran.signal}`)}`);
  process.exit(1);
}
