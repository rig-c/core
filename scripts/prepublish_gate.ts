/**
 * What `npm publish` runs before it packs anything — `prepublishOnly` (issue #1249).
 *
 *     bun scripts/prepublish_gate.ts
 *
 * The release workflow first verifies a current tree proof, or a complete
 * exact-commit tally together with successful typecheck/lint/merge coverage.
 * Accepted whole-chain evidence skips all three commands. Otherwise the
 * original typecheck, lint and full selftest run once, in that order.
 *
 * Ordinary folder publication retains the original flow: typecheck and lint
 * first, then one of two selftest paths:
 *
 *   - `RIGC_PREPUBLISH_TALLY` unset or empty: the full one-process selftest,
 *     `bun run selftest`, exactly what this script replaced.
 *   - `RIGC_PREPUBLISH_TALLY=<path>`: the merged tally document a sharded run
 *     wrote (`bun selftest.ts --merge <file>… --tally-out <path>`), READ and
 *     held to the tree being published. Accepted only when every clause of
 *     `tallyDecision` holds — its commit is this tree's `git rev-parse HEAD`,
 *     the tree has no change against it, the `selftest.ts` that wrote it is the
 *     one on disk, every shard of its declared count is present once and
 *     exited 2 over no failure, the merge exited 0 over no failure, and its
 *     census accounts for every registered suite exactly once. Then it prints
 *     `accepted tally <path> for <sha>: <n> suites, <m> case lines, 0 FAIL` and
 *     exits 0. ANY other state — no file, a file that is not one, another
 *     commit, a red or partial or inconsistent tally — names every reason it
 *     was refused and runs the full selftest, so the publish waits for the gate
 *     rather than skipping it.
 *
 * The legacy document is evidence that the full selftest
 * already ran over exactly this commit, in the same workflow run, as the shards
 * and the merge whose verdict `ci.yml` and `release.yml` both read; the variable
 * points at that evidence, and the evidence is checked rather than believed.
 * A tally that cannot be checked is not a pass, it is a reason to run the gate.
 *
 * `tallyDecision` is pure — the tree it holds the document to is handed in — so
 * `TY46` in `selftest.ts` drives it over a genuine document and one plant per
 * refusal without running a selftest. `selftest.ts` imports the document's
 * shape and `treeHead` from here, so the writer and this reader cannot disagree
 * about either.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** The merged tally document's format word. */
export const MERGED_TALLY_SPEC = 'selftest-merged/1';

/** The variable that names the legacy merged selftest document. */
export const PREPUBLISH_TALLY_VARIABLE = 'RIGC_PREPUBLISH_TALLY';

/** One shard as the merge read it off that shard's own document. */
export interface MergedTallyShard {
  i: number;
  n: number;
  /** The commit the shard's checkout was at (`git rev-parse HEAD`), or `null` where it could not be read. */
  commit: string | null;
  /** sha256 of the `selftest.ts` that wrote the shard's document. */
  source: string;
  /** The exit the shard wrote into its document: 2 is a green shard, never 0. */
  exit: number;
  /** How many suites it ran, and the case lines and FAIL lines over them. */
  suites: number;
  cases: number;
  fails: number;
}

/** One registered suite of the merged run: who ran it, and what it printed. */
export interface MergedTallySuite {
  suite: string;
  /** The 1-based shard that ran it, or 0 for a suite the merge ran itself (it reads the whole run). */
  shard: number;
  cases: number;
  fails: number;
}

/** What `--merge … --tally-out <file>` writes, on every way a merge that read its documents ends. */
export interface MergedTally {
  spec: string;
  /** The merge's own checkout (`git rev-parse HEAD`), or `null` where it could not be read. */
  commit: string | null;
  /** sha256 of the `selftest.ts` that merged — the shards' was held equal to it before the replay. */
  source: string;
  /** The shard count every document declared. */
  n: number;
  /** The registration list, in order: the full suite set this `selftest.ts` declares. */
  registered: string[];
  shards: MergedTallyShard[];
  /** Per registered suite, in registration order. */
  suites: MergedTallySuite[];
  /** Over every suite: the case lines and the FAIL lines. */
  cases: number;
  fails: number;
  /** The exit the merge process ended with: 0 is the verdict "green". */
  exit: number;
  platform: string;
  bun: string;
}

/** The tree a document is held to: its HEAD, its changes against HEAD, and the `selftest.ts` on its disk. */
export interface TallyTree {
  head: string | null;
  /** `git status --porcelain` lines: anything here is a tree that is not the commit. */
  dirty: string[];
  source: string;
}

export type TallyDecision = { accepted: true; line: string } | { accepted: false; reasons: string[] };

/** This checkout's commit, or `null` where git cannot say (no git, not a repository). */
export function treeHead(root: string): string | null {
  const read = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  const sha = read.status === 0 ? read.stdout.trim() : '';
  return /^[0-9a-f]{40}$/.test(sha) ? sha : null;
}

/** The tree as this script holds a document to it. */
export function treeOf(root: string): TallyTree {
  const status = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
  const dirty = status.status === 0 ? status.stdout.split('\n').filter((line) => line.trim() !== '') : ['`git status` could not be read'];
  const selftest = join(root, 'selftest.ts');
  const source = existsSync(selftest) ? createHash('sha256').update(readFileSync(selftest)).digest('hex') : '';
  return { head: treeHead(root), dirty, source };
}

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;
const short = (sha: unknown): string => (typeof sha === 'string' ? `${sha.slice(0, 12)}…` : JSON.stringify(sha ?? null));

/**
 * Whether the document at `path` stands for a green full selftest over `tree`
 * — and when it does not, every reason, each under a name. Pure.
 */
export function tallyDecision(parsed: unknown, path: string, tree: TallyTree): TallyDecision {
  const reasons: string[] = [];
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { accepted: false, reasons: [`TALLY_SPEC: ${path} is not a JSON object, so it is no "${MERGED_TALLY_SPEC}" document`] };
  }
  const doc = parsed as Partial<MergedTally>;
  if (doc.spec !== MERGED_TALLY_SPEC) {
    return { accepted: false, reasons: [`TALLY_SPEC: ${path} states the format ${JSON.stringify(doc.spec ?? null)}, where "${MERGED_TALLY_SPEC}" is required`] };
  }

  // The tree: the commit, its changes, the selftest that would run here.
  if (tree.head === null) reasons.push("TALLY_COMMIT: this tree's HEAD could not be read with `git rev-parse HEAD`, so no tally can be held to it");
  else if (doc.commit !== tree.head) reasons.push(`TALLY_COMMIT: the tally was written at commit ${short(doc.commit)} and the tree being published is ${short(tree.head)}`);
  if (tree.dirty.length > 0) {
    reasons.push(`TALLY_DIRTY: the tree being published differs from its commit in ${tree.dirty.length} path(s) — ${tree.dirty.slice(0, 3).join('; ')} — so a tally of the commit is not a tally of it`);
  }
  if (doc.source !== tree.source) reasons.push(`TALLY_SOURCE: the tally was written by a selftest.ts whose sha256 is ${short(doc.source)}, and this tree's is ${short(tree.source)}`);

  // The shards: one per index of the declared count, each green on its own record.
  const n = doc.n;
  const shards = Array.isArray(doc.shards) ? doc.shards : [];
  if (!isCount(n) || n < 1) {
    reasons.push(`TALLY_SHARD_MISSING: the tally declares the shard count ${JSON.stringify(n ?? null)}, which is not a whole number from 1`);
  } else {
    for (let i = 1; i <= n; i++) {
      const found = shards.filter((shard) => shard?.i === i);
      if (found.length === 0) reasons.push(`TALLY_SHARD_MISSING: shard ${i}/${n} is not in the tally, so the suites dealt to it were measured by nothing`);
      if (found.length > 1) reasons.push(`TALLY_SHARD_MISSING: shard ${i}/${n} is in the tally ${found.length} times`);
    }
    for (const shard of shards) {
      if (!isCount(shard?.i) || shard.i < 1 || shard.i > n || shard.n !== n) reasons.push(`TALLY_SHARD_MISSING: the tally carries a shard ${JSON.stringify(shard?.i ?? null)}/${JSON.stringify(shard?.n ?? null)} that is not one of 1..${n}`);
    }
  }
  const suites = Array.isArray(doc.suites) ? doc.suites : [];
  for (const shard of shards) {
    const label = `shard ${String(shard?.i)}/${String(shard?.n)}`;
    if (shard?.commit !== doc.commit) reasons.push(`TALLY_COMMIT: ${label} ran at commit ${short(shard?.commit)} and the merge at ${short(doc.commit)}`);
    if (shard?.source !== doc.source) reasons.push(`TALLY_SOURCE: ${label} was written by a selftest.ts whose sha256 is ${short(shard?.source)}, and the merge's is ${short(doc.source)}`);
    if (shard?.exit !== 2) reasons.push(`TALLY_SHARD_RED: ${label} exited ${JSON.stringify(shard?.exit ?? null)}, where a green shard exits 2`);
    const own = suites.filter((suite) => suite?.shard === shard?.i);
    const ownFails = own.reduce((sum, suite) => sum + (isCount(suite?.fails) ? suite.fails : 0), 0);
    const ownCases = own.reduce((sum, suite) => sum + (isCount(suite?.cases) ? suite.cases : 0), 0);
    if (shard?.fails !== 0) reasons.push(`TALLY_SHARD_RED: ${label} records ${JSON.stringify(shard?.fails ?? null)} FAIL line(s)`);
    if (shard?.fails !== ownFails || shard?.suites !== own.length || shard?.cases !== ownCases) {
      reasons.push(
        `TALLY_FORGED: ${label} records ${String(shard?.suites)} suite(s), ${String(shard?.cases)} case line(s) and ${String(shard?.fails)} FAIL, ` +
          `and the suites the tally deals to it add up to ${own.length}, ${ownCases} and ${ownFails}`,
      );
    }
  }

  // The census: every registered suite exactly once, run by a shard of the run or by the merge.
  const registered = Array.isArray(doc.registered) ? doc.registered.filter((key): key is string => typeof key === 'string') : [];
  if (registered.length === 0 || registered.length !== (doc.registered ?? []).length || new Set(registered).size !== registered.length) {
    reasons.push('TALLY_SUITE_MISSING: the tally states no registration list of distinct suite names, so the full suite set cannot be read off it');
  }
  const seen = new Map<string, number>();
  for (const suite of suites) seen.set(String(suite?.suite), (seen.get(String(suite?.suite)) ?? 0) + 1);
  const missing = registered.filter((key) => !seen.has(key));
  if (missing.length > 0) reasons.push(`TALLY_SUITE_MISSING: ${missing.length} registered suite(s) are in no shard's or the merge's record: ${missing.slice(0, 5).join(', ')}`);
  const twice = [...seen].filter(([, times]) => times > 1).map(([key]) => key);
  if (twice.length > 0) reasons.push(`TALLY_SUITE_MISSING: ${twice.length} suite(s) are recorded more than once: ${twice.slice(0, 5).join(', ')}`);
  const strangers = [...seen.keys()].filter((key) => !registered.includes(key));
  if (strangers.length > 0) reasons.push(`TALLY_SUITE_MISSING: ${strangers.length} recorded suite(s) are not registered: ${strangers.slice(0, 5).join(', ')}`);
  if (suites.length === registered.length && missing.length === 0 && twice.length === 0 && suites.some((suite, k) => suite?.suite !== registered[k])) {
    reasons.push('TALLY_SUITE_MISSING: the suites are recorded out of registration order, so the record is not the replay the merge made');
  }
  for (const suite of suites) {
    if (!isCount(suite?.shard) || (isCount(n) && suite.shard > n)) reasons.push(`TALLY_SUITE_MISSING: the suite "${String(suite?.suite)}" is dealt to ${JSON.stringify(suite?.shard ?? null)}, which is neither the merge (0) nor a shard of 1..${String(n)}`);
    if (!isCount(suite?.cases) || !isCount(suite?.fails)) reasons.push(`TALLY_FORGED: the suite "${String(suite?.suite)}" records no whole count of case lines and FAIL lines`);
  }

  // The merge: exit 0, and a record that says so.
  const totalFails = suites.reduce((sum, suite) => sum + (isCount(suite?.fails) ? suite.fails : 0), 0);
  const totalCases = suites.reduce((sum, suite) => sum + (isCount(suite?.cases) ? suite.cases : 0), 0);
  if (doc.exit !== 0) reasons.push(`TALLY_MERGE_EXIT: the merge exited ${JSON.stringify(doc.exit ?? null)}, and only 0 is a verdict that the tree is green`);
  if (doc.fails !== 0 || totalFails !== 0) reasons.push(`TALLY_MERGE_EXIT: the merge records ${JSON.stringify(doc.fails ?? null)} FAIL line(s) and its suites ${totalFails}`);
  if (doc.fails !== totalFails || doc.cases !== totalCases) {
    reasons.push(`TALLY_FORGED: the merge records ${String(doc.cases)} case line(s) and ${String(doc.fails)} FAIL, and its suites add up to ${totalCases} and ${totalFails}`);
  }
  if (totalCases === 0) reasons.push('TALLY_SUITE_MISSING: the tally records no case line at all, which is an empty gate rather than a green one');

  if (reasons.length > 0) return { accepted: false, reasons };
  return { accepted: true, line: `accepted tally ${path} for ${String(doc.commit)}: ${registered.length} suites, ${totalCases} case lines, 0 FAIL` };
}

/** The document at `path`, parsed, or the refusal for a file that is not readable JSON. */
export function readTally(path: string): unknown | TallyDecision {
  if (!existsSync(path)) return { accepted: false, reasons: [`TALLY_ABSENT: ${path} does not exist`] } satisfies TallyDecision;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch (error) {
    return { accepted: false, reasons: [`TALLY_SPEC: ${path} is not readable JSON: ${error instanceof Error ? error.message : String(error)}`] } satisfies TallyDecision;
  }
}

const isDecision = (value: unknown): value is TallyDecision =>
  value !== null && typeof value === 'object' && 'accepted' in value && (value as { accepted: unknown }).accepted === false && 'reasons' in value;

/** One `bun run <script>`, its output on this process's, and its exit (1 for a signal). */
function run(root: string, script: string): number {
  const ran = spawnSync(process.execPath, ['run', script], { cwd: root, stdio: 'inherit' });
  return ran.status ?? 1;
}

export interface TallyCoverageContext {
  repository: string;
  runId: number;
  attempt: number;
  workflow: '.github/workflows/ci.yml' | '.github/workflows/release.yml';
}

type ApiObject = Record<string, unknown>;
type ReadApi = (path: string) => Promise<ApiObject>;
const object = (value: unknown): value is ApiObject => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Full-chain evidence is separate from the legacy document's selftest-only claim. */
export async function coveredTallyDecision(
  root: string, parsed: unknown, path: string, context: TallyCoverageContext, readApi: ReadApi,
): Promise<TallyDecision> {
  const exact = tallyDecision(parsed, path, treeOf(root));
  if (!exact.accepted) return exact;
  try {
    const tally = parsed as MergedTally;
    if (!/^[\w.-]+\/[\w.-]+$/.test(context.repository) || !Number.isSafeInteger(context.runId) || context.runId < 1 ||
      !Number.isSafeInteger(context.attempt) || context.attempt < 1) throw new Error('source run identity is missing');
    const source = Bun.YAML.parse(readFileSync(join(root, context.workflow), 'utf8')) as { jobs?: Record<string, { uses?: string }> };
    const caller = context.workflow === '.github/workflows/ci.yml' ? 'selftest' : 'gate';
    if (source.jobs?.[caller]?.uses !== './.github/workflows/selftest-shards.yml') throw new Error('source does not call the common gate');
    const shards = Bun.YAML.parse(readFileSync(join(root, '.github/workflows/selftest-shards.yml'), 'utf8')) as {
      jobs: {
        shard: { name?: string; strategy?: { matrix?: Record<string, unknown> } };
        test: { steps: Array<{ name?: string; run?: string; if?: unknown; 'continue-on-error'?: unknown }> };
      };
    };
    const matrix = shards.jobs.shard.strategy?.matrix;
    const legs = matrix?.shard;
    if (!matrix || Object.keys(matrix).length !== 1 || !Array.isArray(legs) || legs.length !== tally.n ||
      new Set(legs).size !== legs.length || legs.some(value => !Number.isInteger(value) || value < 1 || value > tally.n) ||
      shards.jobs.shard.name !== 'shard ${{ matrix.shard }}') throw new Error('source static shard coverage differs from the tally');
    const steps = shards.jobs.test.steps;
    const merge = steps.findIndex(step => step.run?.startsWith('bun selftest.ts --merge '));
    const checks = ['bun run typecheck', 'bun run lint'].map(command => {
      const matches = steps.filter(step => step.run === command);
      const step = matches[0];
      if (matches.length !== 1 || !step || step.if !== undefined || step['continue-on-error'] !== undefined ||
        steps.indexOf(step) >= merge) throw new Error(`${command} is not unconditional before the merge`);
      return step.name ?? `Run ${command}`;
    });
    if (merge < 0) throw new Error('semantic merge is absent');
    const apiRoot = `/repos/${context.repository}/actions/runs/${context.runId}`;
    const run = await readApi(apiRoot);
    if (run.id !== context.runId || run.run_attempt !== context.attempt || run.path !== context.workflow || run.head_sha !== tally.commit ||
      !object(run.repository) || run.repository.full_name !== context.repository ||
      !object(run.head_repository) || run.head_repository.full_name !== context.repository ||
      !(run.status === 'completed' && run.conclusion === 'success' || run.status === 'in_progress' && run.conclusion === null)) {
      throw new Error('source run/attempt/workflow/commit differs or is unsuccessful');
    }
    const response = await readApi(`${apiRoot}/attempts/${context.attempt}/jobs?per_page=100`);
    if (!Array.isArray(response.jobs) || response.total_count !== response.jobs.length || response.jobs.length > 100) throw new Error('job inventory is incomplete');
    const jobs = response.jobs.filter(object);
    const expected = [...legs.map(value => `${caller} / shard ${String(value)}`), `${caller} / test`];
    for (const name of expected) {
      const found = jobs.filter(job => job.name === name);
      if (found.length !== 1 || found[0].run_id !== context.runId || found[0].run_attempt !== context.attempt ||
        found[0].head_sha !== tally.commit || found[0].status !== 'completed' || found[0].conclusion !== 'success') {
        throw new Error(`missing or unsuccessful source job ${name}`);
      }
    }
    const mergeJob = jobs.find(job => job.name === `${caller} / test`);
    const actual = Array.isArray(mergeJob?.steps) ? mergeJob.steps.filter(object) : [];
    const mergeName = steps[merge].name ?? `Run ${steps[merge].run}`;
    for (const name of [...checks, mergeName]) {
      const found = actual.filter(step => step.name === name);
      if (found.length !== 1 || found[0].status !== 'completed' || found[0].conclusion !== 'success') throw new Error(`source step ${name} did not execute successfully`);
    }
    const latest = await readApi(apiRoot);
    if (latest.run_attempt !== context.attempt || latest.head_sha !== tally.commit || latest.path !== context.workflow) {
      throw new Error('source run changed during verification');
    }
    const unchanged = tallyDecision(parsed, path, treeOf(root));
    if (!unchanged.accepted) return unchanged;
    return { accepted: true, line: `${exact.line}; typecheck, lint and merge covered by run ${context.runId} attempt ${context.attempt}` };
  } catch (error) {
    return { accepted: false, reasons: [`TALLY_COVERAGE: ${error instanceof Error ? error.message : String(error)}`] };
  }
}

async function verifiedTreeProof(root: string, env: NodeJS.ProcessEnv): Promise<boolean> {
  if (!env.TREE_VERDICT_TOOLS || !env.TREE_VERDICT_PATH) return false;
  try {
    const declarationModule = await import(pathToFileURL(join(env.TREE_VERDICT_TOOLS, 'declaration.mjs')).href) as {
      readDeclaration: (path: string) => { covered: boolean; workflow: string; gate: string };
    };
    const helper = await import(pathToFileURL(join(env.TREE_VERDICT_TOOLS, 'publish.mjs')).href) as {
      publishCli: (args: string[], env: NodeJS.ProcessEnv) => Promise<number>;
    };
    const declaration = declarationModule.readDeclaration(join(root, 'scripts/tree-verdict.json'));
    return declaration.covered && await helper.publishCli(['--verdict', env.TREE_VERDICT_PATH,
      '--workflow', declaration.workflow, '--gate', declaration.gate, '--checkout', root], env) === 0;
  } catch { return false; }
}

interface PrepublishServices {
  run?: (root: string, script: string) => number;
  coverage?: (root: string, parsed: unknown, path: string, env: NodeJS.ProcessEnv) => Promise<TallyDecision>;
}

async function releaseTallyCoverage(root: string, parsed: unknown, path: string, env: NodeJS.ProcessEnv): Promise<TallyDecision> {
  const readApi: ReadApi = async route => {
    const response = await fetch(`${env.GITHUB_API_URL ?? 'https://api.github.com'}${route}`, {
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${env.GITHUB_TOKEN ?? ''}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`source API HTTP ${response.status}`);
    const value: unknown = await response.json();
    if (!object(value)) throw new Error('source API returned no object');
    return value;
  };
  return coveredTallyDecision(root, parsed, path, { repository: env.GITHUB_REPOSITORY ?? '',
    runId: Number(env.GITHUB_RUN_ID), attempt: Number(env.GITHUB_RUN_ATTEMPT), workflow: '.github/workflows/release.yml' }, readApi);
}

/** The normal entry uses this checkout. A probe may supply a separate read-only validation root. */
export async function runPrepublish(root: string, env: NodeJS.ProcessEnv = process.env, services: PrepublishServices = {}): Promise<number> {
  const execute = services.run ?? run;
  const release = env.GITHUB_ACTIONS === 'true' && !!env.GITHUB_REPOSITORY &&
    env.GITHUB_WORKFLOW_REF?.startsWith(`${env.GITHUB_REPOSITORY}/.github/workflows/release.yml@`) &&
    ['push', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME ?? '');
  if (release) {
    if (await verifiedTreeProof(root, env)) {
      console.log('prepublish: accepted current tree proof; skipped typecheck, lint and selftest');
      return 0;
    }
    const named = env[PREPUBLISH_TALLY_VARIABLE];
    if (named) {
      const path = resolve(named), parsed = readTally(path);
      const decision = isDecision(parsed) ? parsed : await (services.coverage ?? releaseTallyCoverage)(root, parsed, path, env);
      if (decision.accepted) {
        console.log(`prepublish: ${decision.line}; skipped entire covered chain`);
        return 0;
      }
      for (const reason of decision.reasons) console.error(`prepublish: ${reason}`);
    }
    console.log('prepublish: no whole-chain release evidence accepted; running the full original chain');
    for (const script of ['typecheck', 'lint', 'selftest']) {
      const code = execute(root, script);
      if (code !== 0) return code;
    }
    return 0;
  }
  for (const script of ['typecheck', 'lint']) {
    const code = execute(root, script);
    if (code !== 0) {
      console.error(`prepublish: \`bun run ${script}\` exited ${code}, so nothing is published`);
      return code;
    }
  }
  const named = env[PREPUBLISH_TALLY_VARIABLE];
  if (named === undefined || named === '') {
    console.log(`prepublish: ${PREPUBLISH_TALLY_VARIABLE} is not set, so the full selftest runs`);
    return execute(root, 'selftest');
  }
  const path = resolve(named);
  const read = readTally(path);
  const decision = isDecision(read) ? read : tallyDecision(read, path, treeOf(root));
  if (decision.accepted) {
    console.log(`prepublish: ${decision.line}`);
    return 0;
  }
  console.error(`prepublish: the tally ${PREPUBLISH_TALLY_VARIABLE} names was NOT accepted, so the full selftest runs:`);
  for (const reason of decision.reasons) console.error(`  ${reason}`);
  return execute(root, 'selftest');
}

if (import.meta.main) process.exit(await runPrepublish(resolve(import.meta.dir, '..')));
