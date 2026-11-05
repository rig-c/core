import { readFileSync, writeFileSync, appendFileSync, rmSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkoutProof, unchangedCheckout } from './checkout.mjs';
import { githubApi } from './api.mjs';
import { attemptJobs, collectorRow, stable } from './coverage.mjs';
const fullSha = x => typeof x === 'string' && /^[a-f0-9]{40}$/.test(x);
const positive = x => Number.isSafeInteger(x) && x > 0;
const need = (ok, reason) => { if (!ok) throw new Error(reason); };
const repositoryIdentity = repo => positive(repo?.id) && typeof repo.full_name === 'string' && /^[\w.-]+\/[\w.-]+$/.test(repo.full_name);
const sameRepository = (a, b) => repositoryIdentity(a) && a.id === b.id && a.full_name === b.full_name;
export function argumentsForProducer(args) {
  const options = {};
  need(args.length % 2 === 0, 'COVER_PRODUCER: invalid collector arguments');
  for (let i=0;i<args.length;i+=2) {
    need(['--declaration','--out','--checkout'].includes(args[i]) && !Object.hasOwn(options,args[i]), 'COVER_PRODUCER: only declaration/out/checkout flags accepted; collector executes no chain');
    options[args[i]]=args[i+1];
  }
  need(options['--declaration'] && options['--out'], 'COVER_PRODUCER: declaration/out required');
  return { declaration: resolve(options['--declaration']), out: options['--out'], cwd: resolve(options['--checkout'] ?? '.') };
}
async function identity(options, env, api) {
  const repository = env.GITHUB_REPOSITORY, runId = Number(env.GITHUB_RUN_ID), attempt = Number(env.GITHUB_RUN_ATTEMPT);
  need(/^[\w.-]+\/[\w.-]+$/.test(repository ?? '') && positive(runId) && positive(attempt), 'missing runner identity');
  need(/^\.github\/workflows\/[\w-]+\.ya?ml$/.test(options.workflow) && /^[\w./-]{1,100}$/.test(options.gate), 'invalid workflow/gate');
  const root = `/repos/${repository}`, run = await api(`${root}/actions/runs/${runId}`);
  need(run?.id === runId && run.run_attempt === attempt && positive(run.workflow_id) && fullSha(run.head_sha) &&
    run.path === options.workflow && run.repository?.full_name === repository && positive(run.repository.id) &&
    repositoryIdentity(run.head_repository) &&
    run.event === env.GITHUB_EVENT_NAME && ['push', 'pull_request', 'workflow_dispatch'].includes(run.event) &&
    run.status === 'in_progress' && run.conclusion === null, 'untrusted or inactive producer run');
  const workflow = await api(`${root}/actions/workflows/${encodeURIComponent(options.workflow.split('/').at(-1))}`);
  need(workflow?.id === run.workflow_id && workflow.path === options.workflow && workflow.state === 'active', 'producer workflow mismatch');
  const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
  need(event.repository?.full_name === repository && event.repository.id === run.repository.id &&
    typeof event.repository.default_branch === 'string', 'event repository mismatch');
  const sameHead = sameRepository(run.head_repository, run.repository);
  need(sameHead || (run.event === 'pull_request' && run.head_repository.id !== run.repository.id &&
    run.head_repository.full_name !== repository), 'untrusted or inactive producer run');
  let pr = 0;
  if (run.event === 'pull_request') {
    pr = event.number;
    need(positive(pr) && event.pull_request?.head?.sha === run.head_sha, 'missing PR event association');
    const pull = await api(`${root}/pulls/${pr}`);
    need(pull?.number === pr && pull.head?.sha === run.head_sha && pull.head?.repo?.id === run.head_repository.id &&
      pull.base?.repo?.id === run.repository.id && pull.base?.ref === event.repository.default_branch, 'producer PR mismatch');
    if (!sameHead) {
      need(event.repository.default_branch.length > 0 &&
        sameRepository(pull.head.repo, run.head_repository) && sameRepository(pull.base.repo, run.repository) &&
        sameRepository(event.pull_request.head.repo, run.head_repository) &&
        sameRepository(event.pull_request.base?.repo, run.repository) &&
        event.pull_request.base.ref === event.repository.default_branch, 'producer fork PR identity mismatch');
    }
  } else if (run.event === 'push') need(run.head_branch === event.repository.default_branch && env.GITHUB_REF === `refs/heads/${event.repository.default_branch}`, 'producer push is not default branch');
  return { repository, root, run, pr };
}
// Bun collector only: compile the source graph here, then record completed covering jobs.
// No full-chain execution or caller-supplied 'compiled' shortcut exists.
export async function produce(options, env = process.env, injectedApi, log = console.log) {
  let out;
  try {
    if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, 'receipt-created=false\n');
    const { compileFromDisk } = await import('./planner.mjs');
    const plan = compileFromDisk(options.declaration, options.cwd);
    const before = checkoutProof(options.cwd);
    need(env.GITHUB_SHA === before.sha && env.GITHUB_JOB === plan.coverage.producer.job, 'COVER_CHECKOUT: collector must be actual event-sha checkout and declared collector job');
    out = resolve(options.out);
    const outside = relative(before.root,out);
    need(outside.startsWith('..') || outside.startsWith('/'), 'receipt must be outside tested checkout');
    rmSync(out,{force:true});
    const selected = { ...options, workflow: plan.coverage.workflow, gate: plan.gate };
    const api = injectedApi ?? githubApi({ token: env.GITHUB_TOKEN, apiUrl: env.GITHUB_API_URL, temp: env.RUNNER_TEMP }).api;
    const source = await identity(selected,env,api);
    if (source.run.head_repository.id !== source.run.repository.id) {
      log('TREE_VERDICT_PRODUCER_NOT_ELIGIBLE: fork pull request');
      return 0;
    }
    const live = await attemptJobs(source.root,source.run,plan.coverage,api,true);
    const collector = collectorRow(live.rows,plan.collectorName,true);
    const tested = await api(`${source.root}/git/commits/${before.sha}`);
    need(tested?.sha === before.sha && tested.tree?.sha === before.tree, 'API tested checkout/tree mismatch');
    const current = await identity(selected,env,api);
    need(current.run.head_sha === source.run.head_sha && current.pr === source.pr &&
      current.run.head_repository.id === current.run.repository.id, 'producer identity changed');
    unchangedCheckout(before,options.cwd);
    // Recompile after API reads too; evidence must refer to exactly the frozen source graph.
    need(stable(compileFromDisk(options.declaration,options.cwd)) === stable(plan), 'COVER_PRODUCER: source graph changed');
    const receipt = { schema: 'tree-verdict/2', gate: plan.gate, verdict: 'success', repository: source.repository,
      workflow_path: selected.workflow, workflow_id: source.run.workflow_id, run_id: source.run.id,
      run_attempt: source.run.run_attempt, head_sha: source.run.head_sha, tested_sha: before.sha, tree: before.tree,
      event: source.run.event, pr: source.pr, jobs: live.jobs, collector: { ...plan, jobId: collector.id } };
    writeFileSync(out,`${JSON.stringify(receipt)}\n`,{mode:0o600});
    log(`TREE_VERDICT_PRODUCED: collected ${live.jobs.length} successful legs; tested ${before.sha}, run ${source.run.id} attempt ${source.run.run_attempt}; executed chain=0`);
    if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, 'receipt-created=true\n');
    return 0;
  } catch(error) {
    if (out) rmSync(out,{force:true});
    log(`TREE_VERDICT_PRODUCER_REFUSED: ${error instanceof Error ? error.message : 'collector failed'}`);
    return 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.exitCode = await produce(argumentsForProducer(process.argv.slice(2))); }
  catch (error) {
    process.exitCode = 1;
    console.error(`TREE_VERDICT_PRODUCER_REFUSED: ${error.message}`);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, 'receipt-created=false\n');
  }
}
