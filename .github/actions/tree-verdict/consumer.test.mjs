import { test, expect } from 'bun:test';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fixture } from './lookup.test.mjs';
import { lookup } from './lookup.mjs';
import { publishEnvelope, readPublishVerdict } from './publish.mjs';
const actionPath = fileURLToPath(new URL('.', import.meta.url));
const scratch = process.env.TMPDIR;
if (!scratch) throw new Error('TMPDIR must name dedicated external scratch');
const archive = text => execFileSync('python3', ['-c', 'import io,sys,zipfile; b=io.BytesIO(); z=zipfile.ZipFile(b,"w",zipfile.ZIP_DEFLATED); z.writestr("receipt.json",sys.stdin.buffer.read()); z.close(); sys.stdout.buffer.write(b.getvalue())'], { input: text });
const preload = `import { readFileSync } from 'node:fs';
const f = JSON.parse(readFileSync(process.env.TV_FIXTURE, 'utf8'));
globalThis.fetch = async function(url) {
  if(f.apiError) return new Response('unavailable', {status:503});
  const u = new URL(url), p=u.pathname;
  if(p.endsWith('/ci.yml')) return Response.json(f.workflow);
  if(p.includes('/git/commits/')) return Response.json(f.commits[p.split('/').at(-1)]);
  if(p.includes('/git/trees/')) return Response.json({sha:p.split('/').at(-1),truncated:false,tree:[]});
  if(p.endsWith('/pulls')) return Response.json(f.associated);
  if(p.endsWith('/pulls/7')) return Response.json(f.pr);
  if(p.endsWith('/runs')) {const rows=u.searchParams.get('head_sha')===f.c.sha?[]:[f.run];return Response.json({total_count:rows.length,workflow_runs:rows});}
  if(p.endsWith('/jobs')) return Response.json({total_count:f.jobRows.length,jobs:f.jobRows});
  if(p.endsWith('/runs/800')) return Response.json(f.run);
  if(p.endsWith('/artifacts')) return Response.json({total_count:1,artifacts:[f.artifact]});
  if(p.endsWith('/zip')) return new Response(Buffer.from(f.zip,'base64'));
  throw new Error('unexpected fixture route');
};`;
for (const scenario of ['positive', 'one-byte mismatch', 'API error', 'fork PR', 'fork run']) test(`fixture workflow real composite process: ${scenario}`, () => {
  const dir = mkdtempSync(join(scratch, 'consumer-'));
  try {
    const f = fixture(), repo = join(dir, 'consumer-git'); mkdirSync(repo);
    const git = (...args) => { const r=spawnSync('git',args,{cwd:repo,encoding:'utf8'}); expect(r.status).toBe(0); return r.stdout.trim(); };
    git('init','-q'); const probe=join(repo,'probe'); writeFileSync(probe,'a');git('add','probe');
    git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','fixture');
    const currentSha=git('rev-parse','HEAD'),sourceTree=git('rev-parse','HEAD^{tree}');
    const oldCurrent=f.commits.get(f.c.sha);f.commits.delete(f.c.sha);f.c.sha=currentSha;f.pr.merge_commit_sha=currentSha;
    f.commits.set(currentSha,{...oldCurrent,sha:currentSha});
    for(const c of f.commits.values())c.tree.sha=sourceTree;f.receipt.tree=sourceTree;
    if (scenario === 'fork PR' || scenario === 'fork run') {
      const fork = { id: 2, full_name: 'contributor/core' };
      f.run.head_repository = fork;
      if (scenario === 'fork PR') {
        f.pr.head.repo = fork;
        f.run.pull_requests[0].head.repo = fork;
      }
    }
    if (scenario === 'one-byte mismatch') {
      const before=readFileSync(probe);writeFileSync(probe,'b');const after=readFileSync(probe);git('add','probe');const changedTree=git('write-tree');
      git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','one byte changed');
      const changedSha=git('rev-parse','HEAD');expect(git('rev-parse','HEAD^{tree}')).toBe(changedTree);
      f.c.sha=changedSha;f.pr.merge_commit_sha=changedSha;f.commits.set(changedSha,{...oldCurrent,sha:changedSha,tree:{sha:changedTree}});
      expect(before.length).toBe(1);expect(after.length).toBe(1);const changedBytes=[...before].filter((v,i)=>v!==after[i]).length;
      expect(changedBytes).toBe(1);expect(changedTree).not.toBe(sourceTree);
      f.commits.get(f.c.sha).tree.sha=changedTree;
      console.log(`PLANT one-byte Git evidence: file bytes=1->1; changed bytes=${changedBytes}; source tree=${sourceTree}; current tree=${changedTree}; unequal=true`);
    }
    const zip = archive(JSON.stringify(f.receipt));
    const config = { ...f, commits: Object.fromEntries(f.commits), zip: zip.toString('base64'), apiError: scenario === 'API error',
      artifact: { id: 9, name: 'tree-verdict-receipt', expired: false, size_in_bytes: zip.length,
        workflow_run: { id: 800, head_sha: f.run.head_sha }, digest: `sha256:${createHash('sha256').update(zip).digest('hex')}` } };
    const configPath = join(dir, 'fixture.json'), modulePath = join(dir, 'network.mjs'), output = join(dir, 'outputs');
    writeFileSync(configPath, JSON.stringify(config)); writeFileSync(modulePath, preload);
    const env = { ...process.env, TV_FIXTURE: configPath, NODE_OPTIONS: `--import=${modulePath}`, GITHUB_ACTION_PATH: actionPath,
      GITHUB_OUTPUT: output, RUNNER_TEMP: dir, TV_TOKEN: 'fixture-only', TV_WORKFLOW: f.c.workflow, TV_REPOSITORY: f.c.repository,
      TV_GATE: f.c.gate, TV_SHA: f.c.sha, TV_RUN_ID: String(f.c.runId), TV_EVENT: f.c.event, TV_REF: f.c.ref,
      TV_DEFAULT_BRANCH: f.c.defaultBranch, TV_PURPOSE: 'publish', TV_VERDICT_PATH: join(dir, 'verified.json'),
      FIXTURE_GATE_SENTINEL: join(dir, 'gate'), FIXTURE_PUBLISH_SENTINEL: join(dir, 'published'), FIXTURE_GATE_EXIT: '19' };
    const action = Bun.YAML.parse(readFileSync(join(actionPath, 'action.yml'), 'utf8'));
    writeFileSync(env.TV_VERDICT_PATH, JSON.stringify({ schema: 'previous-proof' }));
    const run = spawnSync('bash', ['-c', action.runs.steps[0].run], { env, cwd: repo, encoding: 'utf8', timeout: 10000 });
    expect(run.status).toBe(0);
    const outputs = Object.fromEntries(readFileSync(output, 'utf8').trim().split('\n').map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }));
    const positive = scenario === 'positive'; expect(outputs.reused).toBe(String(positive));
    const workflow = Bun.YAML.parse(readFileSync(join(actionPath, 'fixture-workflow.yml'), 'utf8'));
    const gate = workflow.jobs.fixture.steps[1], publish = workflow.jobs.fixture.steps[2];
    expect(gate.if).toBe("${{ steps.reuse.outputs.reused != 'true' }}");
    let gateExit = 0;
    if (outputs.reused !== 'true') gateExit = spawnSync('bash', ['-c', gate.run], { env }).status;
    if (gateExit === 0) expect(spawnSync('bash', ['-c', publish.run], { env }).status).toBe(0);
    expect(existsSync(env.FIXTURE_GATE_SENTINEL)).toBe(!positive);
    expect(existsSync(env.FIXTURE_PUBLISH_SENTINEL)).toBe(positive);
    expect(gateExit).toBe(positive ? 0 : 19);
    expect(outputs['verdict-path']).toBe(positive ? env.TV_VERDICT_PATH : '');
    if (scenario === 'fork PR' || scenario === 'fork run') {
      const reason = scenario === 'fork PR' ? 'untrusted PR repository/base' : 'untrusted run repository';
      expect(run.stdout).toContain(`TREE_VERDICT_MISS: ${reason}; run the full gate`);
      expect(JSON.parse(readFileSync(env.TV_VERDICT_PATH, 'utf8')).schema).toBe('tree-verdict-unavailable/1');
    }
    console.log(`PLANT composite ${scenario}: lookup exit=${run.status}; full-fixture-gate executed=${positive ? 0 : 1}; gate exit=${gateExit}; publish reached=${positive ? 1 : 0}`);
  } finally { rmSync(dir, { recursive: true }); }
});
test('publish lifecycle reader validates proof against fresh source receipt; absence/tampering/rerun runs fallback', async () => {
  const dir = mkdtempSync(join(scratch, 'reader-')), path = join(dir, 'proof.json');
  try {
    const f = fixture(), result = await lookup(f.c, f.api, f.readReceipt);
    const envelope = publishEnvelope(f.c, result); writeFileSync(path, JSON.stringify(envelope));
    expect(await readPublishVerdict(path, f.c, f.api, f.readReceipt)).toBe(true);
    for (const plant of ['target_sha', 'tree', 'gate', 'consumer_run_id', 'run_attempt']) {
      writeFileSync(path, JSON.stringify({ ...envelope, [plant]: 'tampered' }));
      let fullGates = 0;
      if (!await readPublishVerdict(path, f.c, f.api, f.readReceipt)) fullGates++;
      expect(fullGates).toBe(1);
    }
    expect(await readPublishVerdict(join(dir, 'missing'), f.c, f.api, f.readReceipt)).toBe(false);
    writeFileSync(path, JSON.stringify(envelope)); f.run.run_attempt++;
    expect(await readPublishVerdict(path, f.c, f.api, f.readReceipt)).toBe(false);
  } finally { rmSync(dir, { recursive: true }); }
});

test('overall failed source remains ineligible even when all substantive legs and its receipt are green', async () => {
  const f = fixture();
  expect(f.receipt.verdict).toBe('success');
  expect(f.jobRows.every(row => row.conclusion === 'success')).toBe(true);
  f.run.conclusion = 'failure';
  const result = await lookup(f.c, f.api, f.readReceipt);
  expect(result.reused).toBe(false);
  expect(f.receiptCalls).toBe(0);
});

test('collector tooling-only composite preserves fail-closed outputs and explicitly skips lookup', () => {
  const dir = mkdtempSync(join(scratch, 'tooling-'));
  try {
    const action = Bun.YAML.parse(readFileSync(join(actionPath, 'action.yml'), 'utf8'));
    for (const scenario of ['collector', 'partial lookup', 'publish', 'invalid purpose']) {
      const output = join(dir, scenario);
      const env = { ...process.env, GITHUB_OUTPUT: output, GITHUB_ACTION_PATH: actionPath,
        TV_DECLARATION: '', TV_WORKFLOW: '', TV_GATE: '', TV_PURPOSE: 'ci',
        // Any accidental Node invocation in collector mode is observable.
        NODE_OPTIONS: '--import=/nonexistent-tree-verdict-probe.mjs' };
      if (scenario === 'partial lookup') env.TV_GATE = 'full/1';
      if (scenario === 'publish') env.TV_PURPOSE = 'publish';
      if (scenario === 'invalid purpose') env.TV_PURPOSE = 'other';
      const run = spawnSync('bash', ['-c', action.runs.steps[0].run], { env, encoding: 'utf8' });
      expect(run.status).toBe(0);
      expect(readFileSync(output, 'utf8')).toBe(
        `reused=false\nrun-id=\nhead-sha=\npr=\ntested-sha=\nverdict-path=\ntooling-path=${actionPath}\n`);
      if (scenario === 'collector') {
        expect(run.stdout).toBe('TREE_VERDICT_COLLECTOR: tooling only; no lookup expected\n');
        expect(run.stderr).toBe('');
      } else {
        expect(run.stdout).toContain('TREE_VERDICT_MISS: lookup process failed; run the full gate');
        expect(run.stdout).not.toContain('TREE_VERDICT_COLLECTOR');
      }
    }
  } finally { rmSync(dir, { recursive: true }); }
});
