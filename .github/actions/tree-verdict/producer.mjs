import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { checkoutProof, unchangedCheckout } from './checkout.mjs';
import { githubApi } from './api.mjs';
import { readDeclaration } from './declaration.mjs';
const fullSha = x => typeof x === 'string' && /^[a-f0-9]{40}$/.test(x);
const positive = x => Number.isSafeInteger(x) && x > 0;
const need = (ok, reason) => { if (!ok) throw new Error(reason); };
export function argumentsForProducer(args) {
  const split = args.indexOf('--'), flags = split < 0 ? args : args.slice(0, split), options = {};
  need(flags.length % 2 === 0, 'invalid producer arguments');
  for (let i = 0; i < flags.length; i += 2) {
    const name = flags[i];
    need(['--workflow', '--gate', '--out', '--checkout', '--declaration'].includes(name) && !Object.hasOwn(options, name), 'invalid/duplicate producer flag');
    options[name] = flags[i + 1];
  }
  need(options['--out'], 'producer --out required');
  const common = { out: options['--out'], cwd: resolve(options['--checkout'] ?? '.') };
  if (options['--declaration']) {
    need(split < 0 && !options['--workflow'] && !options['--gate'], 'declaration owns workflow/gate/entire command chain');
    const d = readDeclaration(options['--declaration']);
    need(d.covered, 'declaration does not cover original lifecycle chain');
    const command = process.platform === 'win32' ? [process.env.ComSpec ?? 'cmd.exe', '/d', '/s', '/c', d.chain] : ['/bin/sh', '-c', d.chain];
    return { ...common, workflow: d.workflow, gate: d.gate, command };
  }
  need(options['--workflow'] && options['--gate'] && split >= 0 && args.length > split + 1, 'workflow/gate/full gate command required');
  return { ...common, workflow: options['--workflow'], gate: options['--gate'], command: args.slice(split + 1) };
}
async function identity(options, env, api) {
  const repository = env.GITHUB_REPOSITORY, runId = Number(env.GITHUB_RUN_ID), attempt = Number(env.GITHUB_RUN_ATTEMPT);
  need(/^[\w.-]+\/[\w.-]+$/.test(repository ?? '') && positive(runId) && positive(attempt), 'missing runner identity');
  need(/^\.github\/workflows\/[\w-]+\.ya?ml$/.test(options.workflow) && /^[\w./-]{1,100}$/.test(options.gate), 'invalid workflow/gate');
  const root = `/repos/${repository}`, run = await api(`${root}/actions/runs/${runId}`);
  need(run?.id === runId && run.run_attempt === attempt && positive(run.workflow_id) && fullSha(run.head_sha) &&
    run.path === options.workflow && run.repository?.full_name === repository && positive(run.repository.id) &&
    run.head_repository?.full_name === repository && run.head_repository.id === run.repository.id &&
    run.event === env.GITHUB_EVENT_NAME && ['push', 'pull_request'].includes(run.event) &&
    run.status === 'in_progress' && run.conclusion === null, 'untrusted or inactive producer run');
  const workflow = await api(`${root}/actions/workflows/${encodeURIComponent(options.workflow.split('/').at(-1))}`);
  need(workflow?.id === run.workflow_id && workflow.path === options.workflow && workflow.state === 'active', 'producer workflow mismatch');
  const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
  need(event.repository?.full_name === repository && event.repository.id === run.repository.id &&
    typeof event.repository.default_branch === 'string', 'event repository mismatch');
  let pr = 0;
  if (run.event === 'pull_request') {
    pr = event.number;
    need(positive(pr) && event.pull_request?.head?.sha === run.head_sha, 'missing PR event association');
    const pull = await api(`${root}/pulls/${pr}`);
    need(pull?.number === pr && pull.head?.sha === run.head_sha && pull.head?.repo?.id === run.repository.id &&
      pull.base?.repo?.id === run.repository.id && pull.base?.ref === event.repository.default_branch, 'producer PR mismatch');
  } else need(run.head_branch === event.repository.default_branch && env.GITHUB_REF === `refs/heads/${event.repository.default_branch}`, 'producer push is not default branch');
  return { repository, root, run, pr };
}
// This wraps and actually runs the declared FULL gate. There is no record-only/reused mode.
export async function produce(options, env = process.env, injectedApi, execute = (cmd, cwd) => spawnSync(cmd[0], cmd.slice(1), { cwd, stdio: 'inherit' }).status, log = console.log) {
  let out;
  try {
    need(options.command?.length > 0, 'full gate command required');
    const before = checkoutProof(options.cwd);
    out = resolve(options.out);
    const outside = relative(before.root, out);
    need(outside.startsWith('..') || outside.startsWith('/'), 'receipt must be outside tested checkout');
    rmSync(out, { force: true }); // An unsuccessful new attempt must not leave an old receipt.
    const freshApi = () => injectedApi ?? githubApi({ token: env.GITHUB_TOKEN, apiUrl: env.GITHUB_API_URL, temp: env.RUNNER_TEMP }).api;
    const source = await identity(options, env, freshApi());
    log(`TREE_VERDICT_PRODUCER: executing declared full gate ${options.gate}`);
    const exit = execute(options.command, options.cwd);
    need(exit === 0, `full gate exited ${exit ?? 'signal/error'}`);
    unchangedCheckout(before, options.cwd);
    // Gate time is not network time. Start a fresh bounded post-gate transport;
    // the lookup transport's 60s budget remains unchanged.
    const api = freshApi();
    const current = await identity(options, env, api);
    need(current.run.head_sha === source.run.head_sha && current.pr === source.pr, 'producer identity changed during gate');
    const tested = await api(`${source.root}/git/commits/${before.sha}`);
    need(tested?.sha === before.sha && tested.tree?.sha === before.tree, 'API tested checkout/tree mismatch');
    unchangedCheckout(before, options.cwd);
    const receipt = { schema: 'tree-verdict/1', gate: options.gate, verdict: 'success', repository: source.repository,
      workflow_path: options.workflow, workflow_id: source.run.workflow_id, run_id: source.run.id,
      run_attempt: source.run.run_attempt, head_sha: source.run.head_sha, tested_sha: before.sha, tree: before.tree,
      event: source.run.event, pr: source.pr };
    writeFileSync(out, `${JSON.stringify(receipt)}\n`, { mode: 0o600 });
    log(`TREE_VERDICT_PRODUCED: tested ${before.sha}, tree ${before.tree}, run ${source.run.id} attempt ${source.run.run_attempt}`);
    return 0;
  } catch (error) {
    if (out) rmSync(out, { force: true });
    log(`TREE_VERDICT_PRODUCER_REFUSED: ${error instanceof Error ? error.message : 'producer failed'}`);
    return 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.exitCode = await produce(argumentsForProducer(process.argv.slice(2))); }
  catch (error) { console.error(`TREE_VERDICT_PRODUCER_REFUSED: ${error.message}`); process.exitCode = 1; }
}
