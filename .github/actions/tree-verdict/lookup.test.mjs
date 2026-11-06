import { test, expect } from 'bun:test';
import { createHash } from 'node:crypto';
import { lookup, pages } from './lookup.mjs';
import { workflowFixture } from './fixtures.mjs';
import { compileCoverage } from './planner.mjs';
const h = c => c.repeat(40);
// Real Git object identity calculation, without a git command or mutable fixture repository.
function tree(byte) {
  const blob = Buffer.from(byte), object = (type, data) => createHash('sha1').update(`${type} ${data.length}\0`).update(data).digest();
  const entry = Buffer.concat([Buffer.from('100644 probe\0'), object('blob', blob)]);
  return object('tree', entry).toString('hex');
}
function fixture() {
  const fixtureSource = workflowFixture('parts');
  const plan = compileCoverage(fixtureSource.declaration, fixtureSource.read);
  const c = { repository: 'sample/core', sha: h('a'), runId: 900, event: 'push', ref: 'refs/heads/main', defaultBranch: 'main', workflow: '.github/workflows/ci.yml', gate: plan.gate, coverage: plan.coverage };
  const repo = { id: 1, full_name: c.repository }, currentTree = tree('a');
  const workflow = { id: 10, path: c.workflow, state: 'active' };
  const run = { id: 800, run_number: 8, run_attempt: 1, workflow_id: 10, path: c.workflow, head_sha: h('b'), status: 'completed', conclusion: 'success', event: 'pull_request', head_branch: 'feature', repository: repo, head_repository: repo,
    pull_requests: [{ number: 7, head: { sha: h('b'), repo }, base: { repo } }] };
  const pr = { number: 7, state: 'closed', merged: true, merge_commit_sha: c.sha, head: { sha: h('b'), repo }, base: { ref: 'main', repo } };
  const receipt = { schema: 'tree-verdict/2', gate: plan.gate, verdict: 'success', repository: c.repository, workflow_path: c.workflow, workflow_id: 10, run_id: 800, run_attempt: 1, head_sha: h('b'), tested_sha: h('c'), tree: currentTree, event: 'pull_request', pr: 7 };
  const jobRows = Object.entries(plan.coverage.jobs).flatMap(([group, job]) => job.legs.map(leg => ({ name: leg.apiName, matrix: leg.matrix, group, run_id: 800, run_attempt: 1, head_sha: h('b'), status: 'completed', conclusion: 'success' }))).map((r,i)=>({...r,id:100+i}));
  receipt.jobs = jobRows.map(({matrix,group,...r}) => ({...r,group,matrix}));
  receipt.collector = { ...plan, jobId: 200 };
  jobRows.push({id:200,name:plan.collectorName,run_id:800,run_attempt:1,head_sha:h('b'),status:'completed',conclusion:'success'});
  const commits = new Map([c.sha, h('b'), h('c')].map(hash => [hash, { sha: hash, tree: { sha: currentTree }, parents: [{ sha: h('d') }] }]));
  const state = { c, run, pr, receipt, commits, workflow, listings: [run], direct: [], associated: [{ number: 7 }], calls: [], logs: [], receiptCalls: 0, jobRows };
  state.api = async path => {
    state.calls.push(path);
    if (state.override) { const v = await state.override(path); if (v !== undefined) return structuredClone(v); }
    if (path.includes('/git/commits/')) return structuredClone(commits.get(path.split('/').at(-1)));
    if (path.endsWith('/actions/workflows/ci.yml')) return workflow;
    if (path.includes(`/commits/${c.sha}/pulls?`)) return structuredClone(state.associated);
    if (path.endsWith('/pulls/7')) return structuredClone(pr);
    if (path.includes('/runs?head_sha=')) {
      const rows = path.includes(`head_sha=${c.sha}`) ? state.direct : state.listings;
      return structuredClone({ total_count: rows.length, workflow_runs: rows });
    }
    if (path.includes('/attempts/') && path.includes('/jobs?')) return structuredClone({total_count:state.jobRows.length,jobs:state.jobRows});
    if (path.endsWith('/actions/runs/800')) return structuredClone(run);
    if (path.includes('/git/trees/')) return { sha: path.split('/').at(-1).split('?')[0], truncated: false, tree: [] };
    throw new Error('unexpected route');
  };
  state.readReceipt = async () => { state.receiptCalls++; return structuredClone(state.receipt); };
  return state;
}
async function drive(s) {
  const result = await lookup(s.c, s.api, s.readReceipt, line => s.logs.push(line));
  // Consumer harness: a miss MUST execute the gate; a failed gate MUST block publication.
  let gates = 0, published = false;
  const gate = () => { gates++; return false; };
  const passed = result.reused === true || gate();
  if (passed) published = true;
  expect(gates).toBe(result.reused ? 0 : 1);
  expect(published).toBe(result.reused);
  return result;
}
test('equal tree, distinct current/head/synthetic commits with mandatory receipt reuses', async () => {
  const s = fixture(), r = await drive(s);
  expect(r).toMatchObject({ reused: true, runId: 800, headSha: h('b'), testedSha: h('c'), pr: 7 });
  expect(s.c.sha).not.toBe(r.headSha); expect(r.headSha).not.toBe(r.testedSha);
});
test('direct commit successful default-branch push reuses with PR 0', async () => {
  const s = fixture(); s.associated = []; s.run.event = 'push'; s.run.head_sha = s.c.sha; s.run.head_branch = 'main'; s.direct = [s.run];
  Object.assign(s.receipt, { event: 'push', head_sha: s.c.sha, pr: 0 });
  for (const r of [...s.jobRows,...s.receipt.jobs]) r.head_sha=s.c.sha;
  expect(await drive(s)).toMatchObject({ reused: true, pr: 0 });
});
test('authentic fork PR and fork run candidates refuse by name before reading any receipt', async () => {
  for (const kind of ['fork PR', 'fork run', 'mixed runs', 'same-name fork ID']) {
    const s = fixture(), fork = { id: 2, full_name: 'contributor/core' };
    if (kind === 'fork PR') {
      s.pr.head.repo = fork;
      s.run.head_repository = fork;
      s.run.pull_requests[0].head.repo = fork;
    } else {
      const run = structuredClone(s.run);
      run.id = 801; run.run_number = 9;
      run.head_repository = kind === 'same-name fork ID' ? { ...fork, full_name: s.c.repository } : fork;
      s.listings = kind === 'mixed runs' ? [s.run, run] : [run];
    }
    const reason = kind === 'fork PR' ? 'untrusted PR repository/base' :
      kind === 'same-name fork ID' ? 'fork run' : 'untrusted run repository';
    expect(await drive(s)).toEqual({ reused: false, reason });
    expect(s.receiptCalls).toBe(0);
  }
});
test('one-byte file mutation changes real tree identity and executes fallback', async () => {
  const s = fixture(); expect(tree('a')).not.toBe(tree('b'));
  s.commits.get(s.c.sha).tree.sha = tree('b');
  expect((await drive(s)).reused).toBe(false);
  expect(s.logs.join('\n')).toContain(`TREE_VERDICT_MISS: tree ${tree('b')} != PR head tree ${tree('a')}`);
});
test('ordinary merge with intervening base changes reports exact leaf paths, not three-dot compare', async () => {
  const s = fixture(); s.commits.get(s.c.sha).tree.sha = tree('b'); s.commits.get(s.c.sha).parents[0].sha = h('e');
  s.override = path => path.includes('/git/trees/') ? { sha: path.includes(tree('b')) ? tree('b') : tree('a'), truncated: false,
    tree: [{ path: '.github/workflows/ci.yml', mode: '100644', type: 'blob', sha: path.includes(tree('b')) ? h('e') : h('f') }] } : undefined;
  expect((await drive(s)).reused).toBe(false);
  expect(s.logs.join('\n')).toContain('differing paths=[".github/workflows/ci.yml"]');
  expect(s.logs.join('\n')).toContain('PR head parent was base tip=false');
  expect(s.calls.some(p => p.includes('/compare/'))).toBe(false);
});
test('diagnostic tree API error/truncation does not change fallback', async () => {
  for (const value of [null, { truncated: true }]) {
    const s = fixture(); s.commits.get(s.c.sha).tree.sha = tree('b');
    s.override = path => { if (path.includes('/git/trees/')) { if (value === null) throw new Error('API error'); return value; } };
    expect((await drive(s)).reused).toBe(false); expect(s.logs.join('')).toContain('differing paths unavailable');
  }
});
const mutants = {
  'API error': s => { s.override = () => { throw new Error('HTTP 403'); }; },
  'missing run': s => { s.listings = []; },
  'failure': s => { s.run.conclusion = 'failure'; },
  'cancelled': s => { s.run.conclusion = 'cancelled'; },
  'skipped': s => { s.run.conclusion = 'skipped'; },
  'queued': s => { s.run.status = 'queued'; s.run.conclusion = null; },
  'current run excluded': s => { s.c.runId = s.run.id; },
  'missing receipt (historic run)': s => { s.receipt = undefined; },
  'malformed receipt': s => { s.receipt.tree = 'not-a-sha'; },
  'receipt lies about actual tested tree': s => { s.commits.get(h('c')).tree.sha = tree('b'); },
  'wrong receipt attempt': s => { s.receipt.run_attempt = 2; },
  'wrong receipt source head': s => { s.receipt.head_sha = h('f'); },
  'wrong receipt repo': s => { s.receipt.repository = 'sample/pose'; },
  'wrong receipt workflow': s => { s.receipt.workflow_id = 11; },
  'wrong receipt verdict': s => { s.receipt.verdict = 'skipped'; },
  'wrong receipt PR': s => { s.receipt.pr = 8; },
  'fork run': s => { s.run.head_repository = { id: 2, full_name: 'fork/core' }; },
  'fork PR': s => { s.pr.head.repo = { id: 2, full_name: 'fork/core' }; },
  'pull_request_target': s => { s.run.event = 'pull_request_target'; },
  'source dispatch': s => { s.run.event = 'workflow_dispatch'; },
  'republish dispatch': s => { s.c.event = 'workflow_dispatch'; },
  'consumer PR': s => { s.c.event = 'pull_request'; },
  'consumer tag push': s => { s.c.ref = 'refs/tags/v1'; },
  'wrong workflow path': s => { s.workflow.path = '.github/workflows/other.yml'; },
  'wrong run workflow': s => { s.run.workflow_id = 11; },
  'short commit SHA': s => { s.c.sha = 'aaaaaaa'; },
  'missing commit': s => { s.commits.delete(h('c')); },
  'conflicting PR run association': s => { s.run.pull_requests[0].number = 99; },
  'malformed PR': s => { delete s.pr.head; },
  'malformed response': s => { s.override = path => path.includes('/runs?') ? {} : undefined; },
  'malformed associated list': s => { s.associated = {}; },
  'duplicate runs': s => { s.listings = [s.run, s.run]; },
  'newer failure supersedes green': s => { s.listings = [s.run, { ...s.run, id: 801, run_number: 9, conclusion: 'failure' }]; },
  'rerun begins during receipt download': s => { s.readReceipt = async () => { s.run.run_attempt++; s.run.status = 'in_progress'; return s.receipt; }; },
  'new run appears during receipt download': s => { s.readReceipt = async () => { s.listings.push({ ...s.run, id: 801, run_number: 9, status: 'queued', conclusion: null }); return s.receipt; }; },
};
for (const [name, mutate] of Object.entries(mutants)) test(`${name}: full gate fallback, no publish`, async () => {
  const s = fixture(); mutate(s); expect((await drive(s)).reused).toBe(false);
});
test('all four repository consumers use identical interface', async () => {
  for (const name of ['core', 'parts', 'pose', 'review']) {
    const s = fixture(); s.c.repository = `sample/${name}`;
    s.run.repository.full_name = s.c.repository; s.receipt.repository = s.c.repository;
    expect((await drive(s)).reused).toBe(true);
  }
});
test('run pagination reaches page two before choosing verdict', async () => {
  const rows = Array.from({ length: 101 }, (_, i) => ({ id: i }));
  const calls = [];
  const result = await pages(async path => { calls.push(path); return { total_count: rows.length, workflow_runs: path.includes('page=2') ? rows.slice(100) : rows.slice(0, 100) }; }, '/runs', 'workflow_runs');
  expect(result).toHaveLength(101); expect(calls).toHaveLength(2);
});
test('incomplete, oversized and shifting pagination refuse', async () => {
  for (const value of [{ total_count: 101, workflow_runs: [] }, { total_count: 1001, workflow_runs: [] }, { workflow_runs: [] }]) {
    await expect(pages(async () => value, '/runs', 'workflow_runs')).rejects.toThrow();
  }
});

export { fixture, drive, tree };


test('eligible PR source is not shadowed by newer current-main CI without fresh receipt', async () => {
  const s = fixture(); s.direct = [{...s.run,id:899,run_number:99,event:'push',head_sha:s.c.sha,head_branch:'main'}];
  expect((await drive(s)).reused).toBe(true);
  expect(s.calls.some(p=>p.includes(`/runs?head_sha=${s.c.sha}`))).toBe(false);
});
for (const plant of ['missing leg','cancelled leg','duplicate name','duplicate ID','wrong attempt','old receipt','missing collector','changed collected IDs']) test(`coverage ${plant} => full fallback`,async()=>{
  const s=fixture();
  if(plant==='missing leg')s.jobRows.shift();
  if(plant==='cancelled leg')s.jobRows[0].conclusion='cancelled';
  if(plant==='duplicate name')s.jobRows.push({...s.jobRows[0],id:999});
  if(plant==='duplicate ID')s.jobRows.push({...s.jobRows[0],name:'unrelated'});
  if(plant==='wrong attempt')s.jobRows[0].run_attempt=2;
  if(plant==='old receipt')s.receipt.schema='tree-verdict/1';
  if(plant==='missing collector')s.jobRows.pop();
  if(plant==='changed collected IDs')s.receipt.jobs[0].id=999;
  expect((await drive(s)).reused).toBe(false);
});

for (const phase of ['initial', 'relist']) test(`newer dispatch beside valid PR in ${phase} listing does not shadow source`, async () => {
  const state = fixture();
  const dispatch = { ...state.run, id: 801, run_number: 99, event: 'workflow_dispatch' };
  if (phase === 'initial') state.listings.push(dispatch);
  else {
    const readReceipt = state.readReceipt;
    state.readReceipt = async () => { state.listings.push(dispatch); return readReceipt(); };
  }
  expect((await drive(state)).reused).toBe(true);
  console.log(`PLANT dispatch ${phase}: reused=true; newer non-source ignored=1`);
});
test('only dispatch source rows fall back', async () => {
  const state = fixture();
  state.listings = [{ ...state.run, event: 'workflow_dispatch' }];
  expect((await drive(state)).reused).toBe(false);
});
test('candidate PR ignores a push row from the same head', async () => {
  const state = fixture();
  state.listings.push({ ...state.run, id: 801, run_number: 99, event: 'push', head_branch: 'feature' });
  expect((await drive(state)).reused).toBe(true);
});
for (const phase of ['initial', 'relist']) test(`malformed event type in ${phase} listing still falls back`, async () => {
  const state = fixture();
  const malformed = { ...state.run, id: 801, run_number: 99, event: null };
  if (phase === 'initial') state.listings.push(malformed);
  else {
    const readReceipt = state.readReceipt;
    state.readReceipt = async () => { state.listings.push(malformed); return readReceipt(); };
  }
  expect((await drive(state)).reused).toBe(false);
});
