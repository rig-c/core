import { appendFileSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { lookup } from './lookup.mjs';
import { githubApi } from './api.mjs';
import { publishEnvelope } from './publish.mjs';
import { readDeclaration } from './declaration.mjs';
export async function main(env = process.env, log = console.log) {
  let result = { reused: false }, verdictPath;
  const context = {
    repository: env.TV_REPOSITORY, sha: env.TV_SHA, runId: Number(env.TV_RUN_ID),
    event: env.TV_EVENT, ref: env.TV_REF, defaultBranch: env.TV_DEFAULT_BRANCH,
    workflow: env.TV_WORKFLOW, receiptName: env.TV_RECEIPT, gate: env.TV_GATE,
  };
  try {
    if (env.TV_DECLARATION) {
      const d = readDeclaration(env.TV_DECLARATION);
      if (!d.covered || (env.TV_WORKFLOW && env.TV_WORKFLOW !== d.workflow) || (env.TV_GATE && env.TV_GATE !== d.gate)) throw new Error('declaration mismatch');
      context.workflow = d.workflow; context.gate = d.gate;
    }
    if (!['ci', 'publish'].includes(env.TV_PURPOSE ?? 'ci')) throw new Error('invalid purpose');
    if (env.TV_PURPOSE === 'publish') {
      if (!env.RUNNER_TEMP || !env.TV_VERDICT_PATH || /[\r\n]/.test(env.TV_VERDICT_PATH)) throw new Error('missing verdict path');
      verdictPath = resolve(env.TV_VERDICT_PATH);
      const rel = relative(resolve(env.RUNNER_TEMP), verdictPath);
      if (!rel || rel.startsWith('..') || rel.startsWith('/')) throw new Error('verdict path outside RUNNER_TEMP');
      // Invalidate a prior invocation before doing any network I/O; stale evidence is never retained.
      writeFileSync(verdictPath, '{"schema":"tree-verdict-unavailable/1"}\n', { mode: 0o600 });
    }
    const transport = githubApi({ token: env.TV_TOKEN, apiUrl: env.GITHUB_API_URL, temp: env.RUNNER_TEMP });
    result = await lookup(context, transport.api, transport.readReceipt, log);
    if (!result.reused) log(`TREE_VERDICT_MISS: ${result.reason}; run the full gate`);
    if (result.reused && verdictPath) writeFileSync(verdictPath, `${JSON.stringify(publishEnvelope(context, result))}\n`, { mode: 0o600 });
  } catch { result = { reused: false }; log('TREE_VERDICT_MISS: lookup unavailable; run the full gate'); }
  if (result.reused) {
    appendFileSync(env.GITHUB_OUTPUT,
      `reused=true\nrun-id=${result.runId}\nhead-sha=${result.headSha}\npr=${result.pr}\ntested-sha=${result.testedSha}\nverdict-path=${verdictPath ?? ''}\n`);
    log(`TREE_VERDICT_REUSED: run ${result.runId}, head ${result.headSha}, tested ${result.testedSha}, PR ${result.pr}`);
  }
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
