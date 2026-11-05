import { canonicalCoverage, gateFor, stable, validateCollectorProof, attemptJobs, collectorRow } from './coverage.mjs';
// Network-free decision engine. Every exception is a miss, including malformed API data.
const sha = x => typeof x === 'string' && /^[0-9a-f]{40}$/.test(x);
const id = x => Number.isSafeInteger(x) && x > 0;
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
function need(ok, reason) { if (!ok) throw new Error(reason); }
const sameRepo = (x, name) => object(x) && x.full_name === name && id(x.id);
const miss = reason => ({ reused: false, reason });

// Enumerate to the declared total, not the first green page. Bounded ambiguity refuses.
async function pages(api, route, key, limit = 10) {
  const rows = [];
  let total;
  for (let page = 1; page <= limit; page++) {
    const data = await api(`${route}${route.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    const batch = key ? data?.[key] : data;
    need(Array.isArray(batch) && batch.length <= 100, 'malformed pagination');
    if (key) {
      need(Number.isSafeInteger(data.total_count) && data.total_count >= 0, 'missing total_count');
      total ??= data.total_count;
      need(total === data.total_count && total <= limit * 100, 'incomplete or changing pagination');
    }
    rows.push(...batch);
    if (key ? rows.length === total : batch.length < 100) return rows;
    need(batch.length === 100 && (total === undefined || rows.length < total), 'inconsistent pagination');
  }
  throw new Error('pagination limit');
}
function runShape(run, c, workflow) {
  need(object(run) && id(run.id) && id(run.run_number) && id(run.run_attempt), 'malformed run identity');
  need(run.workflow_id === workflow.id && run.path === workflow.path, 'wrong workflow identity');
  need(sameRepo(run.repository, c.repository) && sameRepo(run.head_repository, c.repository), 'untrusted run repository');
  need(run.repository.id === run.head_repository.id, 'fork run');
  need(sha(run.head_sha) && typeof run.status === 'string' &&
    (run.conclusion === null || typeof run.conclusion === 'string') && Array.isArray(run.pull_requests), 'malformed run');
  need(['push', 'pull_request'].includes(run.event), 'untrusted source event');
  if (run.event === 'push') need(run.head_branch === c.defaultBranch, 'source push is not default branch');
  return run;
}
async function commit(api, root, hash) {
  const data = await api(`${root}/git/commits/${hash}`);
  need(data?.sha === hash && sha(data?.tree?.sha) && Array.isArray(data.parents) &&
    data.parents.every(p => sha(p?.sha)), 'malformed commit');
  return data;
}
// Exact tree-entry comparison, NEVER GitHub's three-dot compare. Diagnostic only.
async function differences(api, root, a, b) {
  const read = async tree => {
    const data = await api(`${root}/git/trees/${tree}?recursive=1`);
    need(data?.sha === tree && data.truncated === false && Array.isArray(data.tree), 'tree listing unavailable/truncated');
    const map = new Map();
    for (const entry of data.tree) {
      need(typeof entry?.path === 'string' && entry.path.length <= 1024 && sha(entry.sha) &&
        typeof entry.mode === 'string' && ['blob', 'tree', 'commit'].includes(entry.type), 'malformed tree entry');
      need(!map.has(entry.path), 'duplicate tree path');
      // Directories would duplicate every changed child; leaf identity includes mode.
      if (entry.type !== 'tree') map.set(entry.path, `${entry.mode}:${entry.type}:${entry.sha}`);
    }
    return map;
  };
  const left = await read(a), right = await read(b);
  const paths = [...new Set([...left.keys(), ...right.keys()])].filter(p => left.get(p) !== right.get(p)).sort();
  return `differing paths=${JSON.stringify(paths.slice(0, 20))}; total=${paths.length}; shown<=20`;
}

export async function lookup(c, api, readReceipt, log = () => {}) {
  try {
    need(c.event === 'push' && c.ref === `refs/heads/${c.defaultBranch}`, 'only a default-branch push can reuse; dispatch runs the full gate');
    need(typeof c.repository === 'string' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(c.repository) &&
      sha(c.sha) && id(c.runId) && typeof c.defaultBranch === 'string' && c.defaultBranch.length > 0, 'malformed context');
    need(/^\.github\/workflows\/[A-Za-z0-9_-]+\.ya?ml$/.test(c.workflow), 'workflow must be an exact path');
    need(typeof c.gate === 'string' && /^[A-Za-z0-9_./-]{1,100}$/.test(c.gate), 'missing gate contract');
    const root = `/repos/${c.repository}`;
    const workflow = await api(`${root}/actions/workflows/${encodeURIComponent(c.workflow.split('/').at(-1))}`);
    need(id(workflow?.id) && workflow.path === c.workflow && workflow.state === 'active', 'workflow unavailable or wrong path');
    const current = await commit(api, root, c.sha);
    const associated = await pages(api, `${root}/commits/${c.sha}/pulls`);
    const candidates = [{ head: c.sha, pr: 0 }];
    for (const row of associated) {
      need(id(row?.number), 'malformed associated PR');
      const pr = await api(`${root}/pulls/${row.number}`);
      need(pr?.number === row.number && sha(pr?.head?.sha) && sha(pr?.merge_commit_sha) &&
        typeof pr.merged === 'boolean' && typeof pr.state === 'string' && object(pr.base), 'malformed PR');
      // Only merged PRs associated with THIS merge, in THIS repository, on the default branch.
      if (!pr.merged || pr.state !== 'closed' || pr.merge_commit_sha !== c.sha) continue;
      need(sameRepo(pr.base.repo, c.repository) && pr.base.ref === c.defaultBranch &&
        sameRepo(pr.head.repo, c.repository) && pr.head.repo.id === pr.base.repo.id, 'untrusted PR repository/base');
      const head = await commit(api, root, pr.head.sha);
      if (current.tree.sha !== head.tree.sha) {
        let detail;
        try { detail = await differences(api, root, current.tree.sha, head.tree.sha); }
        catch { detail = 'differing paths unavailable (bounded exact tree lookup failed)'; }
        log(`TREE_VERDICT_MISS: tree ${current.tree.sha} != PR head tree ${head.tree.sha}; ${detail}; PR head parent was base tip=${head.parents[0]?.sha === current.parents[0]?.sha && !!head.parents[0]}`);
        continue;
      }
      candidates.push({ head: pr.head.sha, pr: pr.number });
    }
    const eligiblePRs = candidates.filter(candidate => candidate.pr !== 0);
    need(eligiblePRs.length <= 1, 'ambiguous eligible merged PR source');
    const sources = eligiblePRs.length ? eligiblePRs : candidates.slice(0, 1);
    const runs = new Map();
    for (const candidate of sources) {
      const rows = await pages(api, `${root}/actions/workflows/${workflow.id}/runs?head_sha=${candidate.head}`, 'workflow_runs');
      for (const row of rows) {
        const run = runShape(row, c, workflow);
        need(run.head_sha === candidate.head, 'head_sha query returned another head');
        if (run.id === c.runId) continue;
        if (candidate.pr) {
          // PR metadata describes association only; it does NOT attest the tested checkout.
          if (run.event !== 'pull_request') continue;
          need(run.pull_requests.length === 0 || run.pull_requests.some(p => p?.number === candidate.pr && p?.head?.sha === candidate.head &&
            p?.head?.repo?.id === run.repository.id && p?.base?.repo?.id === run.repository.id), 'missing PR run association');
        } else if (run.event !== 'push') continue;
        need(!runs.has(run.id), 'duplicate run or ambiguous PR association');
        runs.set(run.id, { run, candidate });
      }
    }
    // The latest run within the chosen source head must succeed; never substitute an older green.
    const selected = [...runs.values()].sort((a, b) => b.run.run_number - a.run.run_number || b.run.id - a.run.id)[0];
    need(selected, 'no associated source run');
    const { candidate } = selected;
    const fresh = async () => {
      const run = runShape(await api(`${root}/actions/runs/${selected.run.id}`), c, workflow);
      need(run.id === selected.run.id && run.run_number === selected.run.run_number && run.head_sha === selected.run.head_sha &&
        run.run_attempt === selected.run.run_attempt && run.event === selected.run.event, 'run changed or rerun started');
      need(run.status === 'completed' && run.conclusion === 'success', 'latest source run is not successful/completed');
      return run;
    };
    const run = await fresh();
    const receipt = await readReceipt(root, run, c.receiptName);
    need(object(receipt) && receipt.schema === 'tree-verdict/2' && receipt.gate === c.gate && receipt.verdict === 'success' &&
      receipt.repository === c.repository && receipt.workflow_path === workflow.path && receipt.workflow_id === workflow.id &&
      receipt.run_id === run.id && receipt.run_attempt === run.run_attempt && receipt.head_sha === run.head_sha &&
      receipt.event === run.event && receipt.pr === candidate.pr && sha(receipt.tested_sha) && sha(receipt.tree), 'missing or malformed tested-tree receipt');
    const coverage = canonicalCoverage({ ...receipt.collector?.coverage, gate: receipt.collector?.coverage?.label });
    need(gateFor(coverage) === c.gate && (!c.coverage || stable(coverage) === stable(c.coverage)), 'coverage gate mismatch');
    validateCollectorProof(receipt.collector, coverage);
    const liveJobs = await attemptJobs(root, run, coverage, api);
    need(stable(liveJobs.jobs) === stable(receipt.jobs), 'covering job evidence changed');
    const collectedBy = collectorRow(liveJobs.rows, receipt.collector.collectorName, false);
    need(collectedBy.id === receipt.collector.jobId, 'collector job identity changed');
    const tested = await commit(api, root, receipt.tested_sha);
    need(tested.tree.sha === receipt.tree && receipt.tree === current.tree.sha, 'tested checkout tree mismatch');
    await fresh();
    // Re-list before granting reuse, so a new run appearing during the lookup invalidates it.
    let stillListed = false;
    for (const entry of sources) {
      const latest = await pages(api, `${root}/actions/workflows/${workflow.id}/runs?head_sha=${entry.head}`, 'workflow_runs');
      for (const row of latest) {
        const r = runShape(row, c, workflow);
        need(r.head_sha === entry.head, 'changed run listing');
        need(r.id === c.runId || r.run_number <= run.run_number, 'newer source run appeared');
        if (r.id === run.id) { stillListed = true; need(r.run_attempt === run.run_attempt && r.status === 'completed' && r.conclusion === 'success', 'source rerun changed'); }
      }
    }
    need(stillListed, 'source run disappeared');
    return { reused: true, runId: run.id, headSha: run.head_sha, pr: candidate.pr, testedSha: receipt.tested_sha, tree: receipt.tree, receipt };
  } catch (error) {
    // API errors can contain remote text or credentials: expose only our reason/error class in the adapter.
    return miss(error instanceof Error ? error.message : 'lookup failed');
  }
}
export { pages };
