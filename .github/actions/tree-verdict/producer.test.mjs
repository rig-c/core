import { test, expect } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { checkoutProof } from './checkout.mjs';
import { produce, argumentsForProducer } from './producer.mjs';
import { publishCli, publishEnvelope } from './publish.mjs';
import { lookup } from './lookup.mjs';
import { githubApi } from './api.mjs';
import { fixture } from './lookup.test.mjs';
const scratch = process.env.TMPDIR;
if (!scratch) throw new Error('dedicated TMPDIR required');
function repository() {
  const dir = mkdtempSync(join(scratch, 'producer-')), repo = join(dir, 'checkout'); mkdirSync(repo);
  const git = (...args) => {
    const r = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
    if (r.status !== 0) throw new Error('fixture git failed'); return r.stdout.trim();
  };
  git('init', '-q'); writeFileSync(join(repo, 'probe'), 'a'); git('add', 'probe');
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture');
  return { dir, repo, git, proof: checkoutProof(repo), close: () => rmSync(dir, { recursive: true }) };
}
function source(r) {
  const repo = { id: 1, full_name: 'sample/core', default_branch: 'main' };
  const event = { number: 7, repository: repo, pull_request: { head: { sha: 'b'.repeat(40) } } };
  const eventPath = join(r.dir, 'event.json'); writeFileSync(eventPath, JSON.stringify(event));
  const run = { id: 800, run_attempt: 2, workflow_id: 10, path: '.github/workflows/ci.yml', head_sha: 'b'.repeat(40),
    event: 'pull_request', status: 'in_progress', conclusion: null, repository: repo, head_repository: repo };
  const env = { ...process.env, GITHUB_REPOSITORY: repo.full_name, GITHUB_RUN_ID: '800', GITHUB_RUN_ATTEMPT: '2',
    GITHUB_EVENT_NAME: 'pull_request', GITHUB_EVENT_PATH: eventPath };
  const options = { cwd: r.repo, workflow: run.path, gate: 'full/1', out: join(r.dir, 'receipt.json'),
    command: ['node', '-e', 'require("node:fs").writeFileSync(process.argv[1],"ran")', join(r.dir, 'gate-ran')] };
  const state = { run, env, options, event };
  state.api = async path => {
    if (path.endsWith('/runs/800')) return run;
    if (path.endsWith('/ci.yml')) return { id: 10, path: run.path, state: 'active' };
    if (path.endsWith('/pulls/7')) return { number: 7, head: { sha: run.head_sha, repo }, base: { ref: 'main', repo } };
    if (path.includes('/git/commits/')) return { sha: r.proof.sha, tree: { sha: r.proof.tree } };
    throw new Error('unexpected fixture API');
  };
  return state;
}
test('producer executes a fresh full fixture gate, attests actual synthetic checkout, not API head', async () => {
  const r = repository(), s = source(r);
  try {
    expect(await produce(s.options, s.env, s.api)).toBe(0);
    const receipt = JSON.parse(readFileSync(s.options.out, 'utf8'));
    expect(receipt).toMatchObject({ schema: 'tree-verdict/1', tested_sha: r.proof.sha, tree: r.proof.tree, head_sha: s.run.head_sha,
      pr: 7, run_attempt: 2, verdict: 'success', gate: 'full/1' });
    expect(receipt.tested_sha).not.toBe(receipt.head_sha); expect(existsSync(join(r.dir, 'gate-ran'))).toBe(true);
    console.log('PLANT producer positive: fresh fixture gate exit=0; receipt written=1');
  } finally { r.close(); }
});
for (const plant of ['gate failure', 'dirty before', 'dirty after', 'untracked', 'wrong attempt', 'wrong workflow', 'API error', 'wrong tree', 'fork', 'completed reused source']) {
  test(`producer refuses ${plant}`, async () => {
    const r = repository(), s = source(r);
    try {
      if (plant === 'gate failure') s.options.command = ['node', '-e', 'process.exit(9)'];
      if (plant === 'dirty before') writeFileSync(join(r.repo, 'probe'), 'b');
      if (plant === 'untracked') writeFileSync(join(r.repo, 'untracked'), 'b');
      if (plant === 'dirty after') s.options.command = ['node', '-e', 'require("node:fs").writeFileSync("probe","b")'];
      if (plant === 'wrong attempt') s.run.run_attempt++;
      if (plant === 'wrong workflow') s.options.workflow = '.github/workflows/other.yml';
      if (plant === 'API error') s.api = async () => { throw new Error('unavailable'); };
      if (plant === 'wrong tree') r.proof.tree = 'f'.repeat(40);
      if (plant === 'fork') s.run.head_repository = { id: 2, full_name: 'fork/core' };
      if (plant === 'completed reused source') { s.run.status = 'completed'; s.run.conclusion = 'success'; }
      expect(await produce(s.options, s.env, s.api)).toBe(1);
      expect(existsSync(s.options.out)).toBe(false);
      console.log(`PLANT producer ${plant}: exit=1; receipt written=0`);
    } finally { r.close(); }
  });
}
test('producer command required; record-only and unknown flags rejected', () => {
  expect(() => argumentsForProducer(['--workflow', '.github/workflows/ci.yml'])).toThrow();
  expect(() => argumentsForProducer(['--reused', 'true', '--', 'true'])).toThrow();
  expect(argumentsForProducer(['--workflow', '.github/workflows/ci.yml', '--gate', 'full/1', '--out', 'receipt.json', '--', 'node', 'gate.mjs']).command).toEqual(['node', 'gate.mjs']);
});
test('publish CLI checks live checkout and fresh trusted runner context; nonzero means full gate', async () => {
  const r = repository(), f = fixture();
  try {
    f.c.sha = r.proof.sha; f.associated = [];
    f.commits.set(r.proof.sha, { sha: r.proof.sha, tree: { sha: r.proof.tree }, parents: [] });
    Object.assign(f.run, { head_sha: r.proof.sha, event: 'push', head_branch: 'main' }); f.direct = [f.run];
    Object.assign(f.receipt, { head_sha: r.proof.sha, tested_sha: r.proof.sha, tree: r.proof.tree, event: 'push', pr: 0 });
    const proof = join(r.dir, 'verified.json'), event = join(r.dir, 'event.json');
    writeFileSync(proof, JSON.stringify(publishEnvelope(f.c, await lookup(f.c, f.api, f.readReceipt))));
    writeFileSync(event, JSON.stringify({ repository: { full_name: f.c.repository, default_branch: 'main' } }));
    const env = { ...process.env, GITHUB_REPOSITORY: f.c.repository, GITHUB_SHA: r.proof.sha, GITHUB_RUN_ID: String(f.c.runId),
      GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_PATH: event };
    const args = ['--verdict', proof, '--workflow', f.c.workflow, '--gate', f.c.gate, '--checkout', r.repo];
    expect(await publishCli(args, env, f)).toBe(0);
    expect(await publishCli(args, { ...env, GITHUB_SHA: 'e'.repeat(40) }, f)).toBe(2);
    writeFileSync(join(r.repo, 'probe'), 'b'); expect(await publishCli(args, env, f)).toBe(2);
    writeFileSync(join(r.repo, 'probe'), 'a');
    const original = f.readReceipt; f.readReceipt = async () => { writeFileSync(join(r.repo, 'probe'), 'b'); return original(); };
    expect(await publishCli(args, env, f)).toBe(2);
    console.log('PLANT lifecycle: true exit=0; wrong checkout/dirty/race exit=2 => full gate fallback');
  } finally { r.close(); }
});

test('lifecycle CLI covers entire replaced chain; missing/invalid/noncovering verdict runs all commands and preserves failure exit', async () => {
  const { lifecycle } = await import('./lifecycle.mjs'), { readDeclaration } = await import('./declaration.mjs');
  const r = repository(), f = fixture();
  try {
    const commands = ['typecheck', 'lint', 'selftest'].map(stage => `node -e 'require("node:fs").appendFileSync(process.env.CHAIN_TRACE,"${stage}\\n");if(process.env.CHAIN_FAIL_STAGE==="${stage}")process.exit(7)'`);
    const declaration = { schema: 'tree-verdict-lifecycle/1', workflow: f.c.workflow, gate: 'fixture-full/1', commands, chain: commands.join(' && ') };
    const path = join(r.dir, 'declaration.json'), proof = join(r.dir, 'verified.json'), trace = join(r.dir, 'chain.log'), event = join(r.dir, 'event.json');
    writeFileSync(path, JSON.stringify(declaration));
    f.c.gate = readDeclaration(path).gate; f.c.sha = r.proof.sha; f.associated = [];
    f.commits.set(r.proof.sha, { sha: r.proof.sha, tree: { sha: r.proof.tree }, parents: [] });
    Object.assign(f.run, { head_sha: r.proof.sha, event: 'push', head_branch: 'main' }); f.direct = [f.run];
    Object.assign(f.receipt, { gate: f.c.gate, head_sha: r.proof.sha, tested_sha: r.proof.sha, tree: r.proof.tree, event: 'push', pr: 0 });
    const envelope = publishEnvelope(f.c, await lookup(f.c, f.api, f.readReceipt)); writeFileSync(proof, JSON.stringify(envelope));
    writeFileSync(event, JSON.stringify({ repository: { full_name: f.c.repository, default_branch: 'main' } }));
    const env = { ...process.env, CHAIN_TRACE: trace, GITHUB_REPOSITORY: f.c.repository, GITHUB_SHA: r.proof.sha, GITHUB_RUN_ID: String(f.c.runId),
      GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_PATH: event };
    const args = ['--declaration', path, '--verdict-path', proof, '--checkout', r.repo];
    expect(await lifecycle(args, env, f)).toBe(0); expect(existsSync(trace)).toBe(false);
    console.log('PLANT entire-chain positive: exit=0; commands executed=0/3');
    for (const plant of ['missing', 'invalid', 'noncovering', 'wrong gate']) {
      writeFileSync(path, JSON.stringify(plant === 'noncovering' ? { ...declaration, commands: commands.slice(1) } : declaration));
      writeFileSync(proof, plant === 'invalid' ? '{' : JSON.stringify(plant === 'wrong gate' ? { ...envelope, gate: 'wrong/1' } : envelope));
      if (plant === 'missing') rmSync(proof);
      rmSync(trace, { force: true });
      expect(await lifecycle(args, env, f)).toBe(0);
      expect(readFileSync(trace, 'utf8')).toBe('typecheck\nlint\nselftest\n');
      console.log(`PLANT entire-chain ${plant}: exit=0; commands executed=3/3`);
    }
    writeFileSync(path, JSON.stringify(declaration)); rmSync(proof, { force: true }); rmSync(trace);
    expect(await lifecycle(args, { ...env, CHAIN_FAIL_STAGE: 'lint' }, f)).toBe(7);
    expect(readFileSync(trace, 'utf8')).toBe('typecheck\nlint\n');
    console.log('PLANT entire-chain failure: exit=7 preserved; commands executed=2/3; publish blocked');
    // Producer declaration mode runs exactly the same original chain and records its effective identity.
    const s = source(r); s.env = { ...s.env, CHAIN_TRACE: trace };
    rmSync(trace);
    const options = argumentsForProducer(['--declaration', path, '--out', join(r.dir, 'fresh.json'), '--checkout', r.repo]);
    // spawn inherits the test process env, so provide the trace to this fixture-only explicit runner.
    expect(await produce(options, s.env, s.api, (cmd, cwd) => spawnSync(cmd[0], cmd.slice(1), { cwd, env: s.env }).status)).toBe(0);
    expect(JSON.parse(readFileSync(options.out, 'utf8')).gate).toBe(f.c.gate);
    expect(readFileSync(trace, 'utf8')).toBe('typecheck\nlint\nselftest\n');
  } finally { r.close(); }
});

test('exact README npm wrapper preserves local full chain without installed helper or envelope', () => {
  const r = repository();
  try {
    const readme = readFileSync(new URL('./README.md', import.meta.url), 'utf8');
    const wrapper = readme.match(/```js\n([\s\S]*?)\n```/)[1];
    const scripts = join(r.repo, 'scripts'); mkdirSync(scripts);
    const file = join(scripts, 'prepublish.cjs'), trace = join(r.dir, 'local-chain');
    writeFileSync(file, wrapper);
    const chain = 'node -e \'require("node:fs").appendFileSync(process.env.CHAIN_TRACE,"all commands ran")\'';
    writeFileSync(join(scripts, 'tree-verdict.json'), JSON.stringify({ chain }));
    const good = spawnSync('node', [file], { cwd: r.repo, env: { ...process.env, CHAIN_TRACE: trace }, encoding: 'utf8' });
    expect(good.status).toBe(0); expect(readFileSync(trace, 'utf8')).toBe('all commands ran');
    writeFileSync(join(scripts, 'tree-verdict.json'), JSON.stringify({ chain: 'node -e "process.exit(7)"' }));
    expect(spawnSync('node', [file], { cwd: r.repo }).status).toBe(7);
    console.log('PLANT README local helper absent: fullchain exit=0; failure exit=7 preserved');
  } finally { r.close(); }
});


for (const scenario of ['success', 'gate failure', 'post API failure', 'post budget exhaustion']) {
  test(`producer default transport after simulated >60s gate: ${scenario}`, async () => {
    const r = repository(), s = source(r), realNow = Date.now, realFetch = globalThis.fetch;
    let now = realNow(), gateFinished = false, postCalls = 0;
    const expiredPreGateTransport = githubApi({ token: 'fixture', temp: r.dir, fetcher: async () => Response.json({}) });
    try {
      Date.now = () => now;
      globalThis.fetch = async url => {
        if (gateFinished) {
          postCalls++;
          if (scenario === 'post API failure') return new Response('unavailable', { status: 503 });
          // The new post-gate transport still has its OWN unchanged 60s bound.
          if (scenario === 'post budget exhaustion' && postCalls === 1) now += 61000;
        }
        return Response.json(await s.api(new URL(url).pathname));
      };
      if (scenario === 'gate failure') s.options.command = ['node', '-e', 'process.exit(9)'];
      const logs = [];
      const result = await produce(s.options, s.env, undefined, (command, cwd) => {
        const exit = spawnSync(command[0], command.slice(1), { cwd }).status;
        now += 61000; gateFinished = true;
        return exit;
      }, line => logs.push(line));
      expect(result).toBe(scenario === 'success' ? 0 : 1);
      expect(existsSync(s.options.out)).toBe(scenario === 'success');
      await expect(expiredPreGateTransport.api('/repos/sample/core/actions/runs/800')).rejects.toThrow('API budget/path');
      if (scenario === 'success') {
        expect(JSON.parse(readFileSync(s.options.out, 'utf8'))).toMatchObject({ tested_sha: r.proof.sha, tree: r.proof.tree });
        expect(postCalls).toBe(4);
      } else if (scenario === 'gate failure') expect(postCalls).toBe(0);
      else if (scenario === 'post API failure') expect(postCalls).toBe(1);
      else if (scenario === 'post budget exhaustion') {
        expect(postCalls).toBe(1); expect(logs.join('\n')).toContain('API budget/path');
      }
      console.log(`PLANT default transport ${scenario}: simulated gate=61000ms; exit=${result}; receipt=${existsSync(s.options.out) ? 1 : 0}; post requests=${postCalls}`);
    } finally { Date.now = realNow; globalThis.fetch = realFetch; r.close(); }
  });
}
