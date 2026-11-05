import { readFileSync } from 'node:fs';
import { lookup } from './lookup.mjs';
import { checkoutProof, unchangedCheckout } from './checkout.mjs';
import { githubApi } from './api.mjs';
import { pathToFileURL } from 'node:url';
// A lifecycle reader takes trusted CURRENT context, not context copied out of this file.
// False means run the consumer's full gate; never interpret this as permission to ignore scripts.
export async function readPublishVerdict(path, context, api, readReceipt) {
  try {
    const text = readFileSync(path, 'utf8');
    if (text.length > 65536) return false;
    const doc = JSON.parse(text);
    if (doc.schema !== 'tree-verdict-verified/2' || doc.target_sha !== context.sha ||
      doc.consumer_run_id !== context.runId || doc.repository !== context.repository || doc.gate !== context.gate) return false;
    const fresh = await lookup(context, api, readReceipt);
    return fresh.reused === true && fresh.runId === doc.run_id && fresh.headSha === doc.head_sha &&
      fresh.testedSha === doc.tested_sha && fresh.tree === doc.tree &&
      fresh.receipt.run_attempt === doc.run_attempt && fresh.pr === doc.pr;
  } catch { return false; }
}
export function publishEnvelope(context, result) {
  if (result.reused !== true) throw new Error('no passed verdict');
  return { schema: 'tree-verdict-verified/2', repository: context.repository, target_sha: context.sha,
    consumer_run_id: context.runId, gate: context.gate, tree: result.tree,
    run_id: result.runId, run_attempt: result.receipt.run_attempt, head_sha: result.headSha,
    tested_sha: result.testedSha, pr: result.pr };
}

// Lifecycle CLI: 0 = verified reuse, 2 = unavailable/refused; every nonzero runs the full gate.
// Runner context is read afresh; live HEAD/tree/dirty proof brackets the network lookup.
export async function publishCli(args, env = process.env, injected, log = console.log) {
  try {
    const options = {};
    if (args.length % 2) throw new Error('invalid flags');
    for (let i = 0; i < args.length; i += 2) {
      if (!['--verdict', '--workflow', '--gate', '--checkout'].includes(args[i]) || Object.hasOwn(options, args[i])) throw new Error('invalid flags');
      options[args[i]] = args[i + 1];
    }
    if (!options['--verdict'] || !options['--workflow'] || !options['--gate']) throw new Error('missing reader flags');
    const cwd = options['--checkout'] ?? process.cwd(), before = checkoutProof(cwd);
    const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
    if (event.repository?.full_name !== env.GITHUB_REPOSITORY || before.sha !== env.GITHUB_SHA) throw new Error('actual checkout differs from runner context');
    const context = { repository: env.GITHUB_REPOSITORY, sha: before.sha, runId: Number(env.GITHUB_RUN_ID),
      event: env.GITHUB_EVENT_NAME, ref: env.GITHUB_REF, defaultBranch: event.repository.default_branch,
      workflow: options['--workflow'], gate: options['--gate'], receiptName: env.TV_RECEIPT ?? 'tree-verdict-receipt' };
    const proof = JSON.parse(readFileSync(options['--verdict'], 'utf8'));
    if (proof.tree !== before.tree) throw new Error('actual checkout tree differs from proof');
    const transport = injected ?? githubApi({ token: env.GITHUB_TOKEN, apiUrl: env.GITHUB_API_URL, temp: env.RUNNER_TEMP });
    if (!await readPublishVerdict(options['--verdict'], context, transport.api, transport.readReceipt)) throw new Error('verdict unavailable/refused');
    unchangedCheckout(before, cwd);
    log('TREE_VERDICT_PUBLISH_TRUE: live clean checkout and source receipt verified');
    return 0;
  } catch {
    log('TREE_VERDICT_PUBLISH_FALSE: run the consumer full gate');
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await publishCli(process.argv.slice(2));
