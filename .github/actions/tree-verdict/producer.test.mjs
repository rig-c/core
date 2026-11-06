import { test, expect } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, copyFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { workflowFixture } from './fixtures.mjs';
import { compileCoverage } from './planner.mjs';
import { checkoutProof } from './checkout.mjs';
import { produce, argumentsForProducer } from './producer.mjs';
import { publishEnvelope } from './publish.mjs';
import { lifecycle } from './lifecycle.mjs';
import { lookup } from './lookup.mjs';
import { fixture } from './lookup.test.mjs';
const scratch=process.env.TMPDIR;
if(!scratch)throw new Error('dedicated TMPDIR required');
function repository(style='parts') {
 const dir=mkdtempSync(join(scratch,'collector-')),repo=join(dir,'checkout');mkdirSync(repo);
 const f=workflowFixture(style);
 for(const[path,text]of Object.entries(f.files)){mkdirSync(join(repo,path,'..'),{recursive:true});writeFileSync(join(repo,path),text);}
 const git=(...args)=>{const r=spawnSync('git',args,{cwd:repo,encoding:'utf8'});if(r.status!==0)throw new Error('fixture Git failed');return r.stdout.trim();};
 git('init','-q');writeFileSync(join(repo,'probe'),'a');git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','fixture');
 return{dir,repo,git,f,proof:checkoutProof(repo),close:()=>rmSync(dir,{recursive:true})};
}
function source(r){
 const plan=compileCoverage(r.f.declaration,r.f.read),repo={id:1,full_name:'sample/core',default_branch:'main'};
 const pull={number:7,head:{sha:'b'.repeat(40),repo},base:{ref:'main',repo}};
 const event={repository:repo,number:7,pull_request:structuredClone(pull)};
 const eventPath=join(r.dir,'event.json');writeFileSync(eventPath,JSON.stringify(event));
 const run={id:800,run_attempt:2,workflow_id:10,path:plan.coverage.workflow,head_sha:'b'.repeat(40),event:'pull_request',status:'in_progress',conclusion:null,repository:repo,head_repository:repo};
 const env={...process.env,GITHUB_REPOSITORY:repo.full_name,GITHUB_RUN_ID:'800',GITHUB_RUN_ATTEMPT:'2',GITHUB_EVENT_NAME:'pull_request',GITHUB_EVENT_PATH:eventPath,GITHUB_SHA:r.proof.sha,GITHUB_JOB:plan.coverage.producer.job,GITHUB_OUTPUT:join(r.dir,'github-output')};
 const rows=Object.values(plan.coverage.jobs).flatMap(j=>j.legs).map((l,i)=>({id:100+i,name:l.apiName,run_id:800,run_attempt:2,head_sha:run.head_sha,status:'completed',conclusion:'success'}));
 rows.push({id:200,name:plan.collectorName,run_id:800,run_attempt:2,head_sha:run.head_sha,status:'in_progress',conclusion:null});
 const options={cwd:r.repo,declaration:join(r.repo,'scripts/tree-verdict.json'),out:join(r.dir,'receipt.json')};
 const state={plan,run,env,rows,options,event,pull,calls:[]};
 state.api=async path=>{state.calls.push(path);
  if(path.endsWith('/runs/800'))return run;
  if(path.endsWith('/ci.yml'))return{id:10,path:run.path,state:'active'};
  if(path.endsWith('/pulls/7'))return state.pull;
  if(path.includes('/jobs?'))return{total_count:state.rows.length,jobs:state.rows};
  if(path.includes('/git/commits/'))return{sha:r.proof.sha,tree:{sha:r.proof.tree}};
  throw new Error('unexpected fixture API');};return state;
}
function forkSource(r) {
 const s = source(r);
 const head = { id: 2, full_name: 'contributor/core', fork: false };
 s.run.head_repository = structuredClone(head);
 s.event.pull_request.head.repo = structuredClone(head);
 s.pull.head.repo = structuredClone(head);
 return s;
}
// Replace only the transport in the child. The real producer CLI parses arguments,
// compiles on-disk workflows, reads the event and checkout, and manages its output.
function producerCLI(s) {
 writeFileSync(s.env.GITHUB_EVENT_PATH, JSON.stringify(s.event));
 const statePath = join(s.options.cwd, '..', 'api.json');
 const preload = join(s.options.cwd, '..', 'fetch.mjs');
 const calls = join(s.options.cwd, '..', 'api-calls.log');
 writeFileSync(calls, '');
 writeFileSync(statePath, JSON.stringify({ run: s.run, pull: s.pull, rows: s.rows,
  sha: s.env.GITHUB_SHA, tree: checkoutProof(s.options.cwd).tree }));
 writeFileSync(preload, `
import { readFileSync, appendFileSync } from 'node:fs';
const data = JSON.parse(readFileSync(${JSON.stringify(statePath)}, 'utf8'));
globalThis.fetch = async url => {
 const target = new URL(url);
 if (target.origin !== 'https://fixture.invalid') throw new Error('unexpected fixture origin');
 const path = target.pathname;
 appendFileSync(${JSON.stringify(calls)}, path + '\\n');
 let response;
 if (path.endsWith('/runs/800')) response = data.run;
 else if (path.endsWith('/ci.yml')) response = { id: 10, path: data.run.path, state: 'active' };
 else if (path.endsWith('/pulls/7')) response = data.pull;
 else if (path.endsWith('/jobs')) response = { total_count: data.rows.length, jobs: data.rows };
 else if (path.includes('/git/commits/')) response = { sha: data.sha, tree: { sha: data.tree } };
 else throw new Error('unexpected fixture route');
 return Response.json(response);
};
`);
 const command = readFileSync(new URL('./README.md', import.meta.url), 'utf8')
  .match(/Exact producer command:\n\n```sh\n([^\n]+)\n```/)?.[1];
 if (!command) throw new Error('README producer command missing');
 const result = spawnSync('bash', ['-c', 'bun() { command bun --preload "$FIXTURE_PRELOAD" "$@"; }\n' + command], {
  env: { ...s.env, GITHUB_API_URL: 'https://fixture.invalid', GITHUB_TOKEN: 'fixture', FIXTURE_PRELOAD: preload,
   TREE_VERDICT_TOOLS: fileURLToPath(new URL('.', import.meta.url)), RUNNER_TEMP: dirname(s.options.out) },
  cwd: s.options.cwd, encoding: 'utf8', timeout: 10_000,
 });
 return { ...result, apiCalls: readFileSync(calls, 'utf8').trim().split('\n'),
  outputText: s.env.GITHUB_OUTPUT ? readFileSync(s.env.GITHUB_OUTPUT, 'utf8') : '' };
}
test('README entry CLI authentic fork exits zero by name with no receipt, including a reused output path', () => {
 const r = repository(), s = forkSource(r);
 s.env.GITHUB_ACTIONS = 'true';
 try {
  for (const stale of [false, true]) {
   if (stale) {
    expect(producerCLI(source(r)).status).toBe(0);
    expect(JSON.parse(readFileSync(s.options.out, 'utf8')).schema).toBe('tree-verdict/2');
   }
   const result = producerCLI(s);
   expect(result.status).toBe(0);
   expect(result.stdout.trim()).toBe('TREE_VERDICT_PRODUCER_NOT_ELIGIBLE: fork pull request');
   expect(existsSync(s.options.out)).toBe(false);
   expect(result.outputText.trim().split('\n').at(-1)).toBe('receipt-created=false');
   expect(result.apiCalls).toEqual(['/repos/sample/core/actions/runs/800',
    '/repos/sample/core/actions/workflows/ci.yml', '/repos/sample/core/pulls/7']);
  }
 } finally { r.close(); }
});
test('README entry CLI same-repository PR and default push replace stale output with actual receipts', () => {
 const r = repository(), s = source(r);
 s.env.GITHUB_ACTIONS = 'true';
 try {
  // A caller-supplied fork boolean cannot turn same-repository evidence into a skip.
  s.run.head_repository.fork = true;
  for (const event of ['pull_request', 'push']) {
   s.run.event = event; s.env.GITHUB_EVENT_NAME = event;
   s.run.head_branch = 'main'; s.env.GITHUB_REF = 'refs/heads/main';
   if (event === 'push') {
    s.run.head_sha = r.proof.sha;
    for (const row of s.rows) row.head_sha = r.proof.sha;
   }
   writeFileSync(s.options.out, 'previous receipt');
   const result = producerCLI(s);
   expect(result.status).toBe(0);
   expect(result.stdout).toContain('TREE_VERDICT_PRODUCED:');
   const receipt = JSON.parse(readFileSync(s.options.out, 'utf8'));
   expect(receipt).toMatchObject({ schema: 'tree-verdict/2', event, pr: event === 'push' ? 0 : 7,
    head_sha: s.run.head_sha, tested_sha: r.proof.sha, tree: r.proof.tree });
   expect(receipt.jobs).toHaveLength(5);
   expect(result.outputText.trim().split('\n').slice(-2)).toEqual(['receipt-created=false', 'receipt-created=true']);
  }
 } finally { r.close(); }
});
for (const scenario of ['fork', 'eligible PR', 'producer failure', 'missing receipt']) test(`core collector job fixture ${scenario}: real producer CLI and simulated hosted upload`, () => {
 const r = repository('core'), s = scenario === 'fork' ? forkSource(r) : source(r);
 s.env.GITHUB_ACTIONS = 'true';
 try {
  const workflow = Bun.YAML.parse(readFileSync(new URL('../../workflows/ci.yml', import.meta.url), 'utf8'));
  const declaration = JSON.parse(readFileSync(new URL('../../../scripts/tree-verdict.json', import.meta.url), 'utf8'));
  const collector = workflow.jobs[declaration.producer.job];
  const producerID = declaration.producer.step ?? 'receipt';
  const uploads = collector.steps.filter(step => step.uses?.startsWith('actions/upload-artifact@'));
  expect(uploads).toHaveLength(1);
  const upload = uploads[0];
  expect(upload.if).toBe(`\${{ steps.${producerID}.outputs.receipt-created == 'true' }}`);
  expect(upload.with).toEqual({ name: 'tree-verdict-receipt', path: '${{ runner.temp }}/receipt.json', 'if-no-files-found': 'error' });
  expect(upload['continue-on-error']).toBeUndefined();
  const producer = collector.steps.find(step => step.id === producerID);
  expect(producer.run).toBe('bun "$TREE_VERDICT_TOOLS/producer.mjs" --declaration scripts/tree-verdict.json --out "$RUNNER_TEMP/receipt.json"');
  if (scenario === 'producer failure') s.rows.shift();
  const result = producerCLI(s);
  const outputs = Object.fromEntries(result.outputText.trim().split('\n').map(line => line.split('=')));
  if (scenario === 'missing receipt') rmSync(s.options.out);
  // Local upload model. The actual Actions upload-artifact implementation and
  // a hosted fork run are outside this fixture. Apply the checked YAML guard,
  // copy its exact file on true, and preserve the strict missing-file failure.
  const path = upload.with.path.replace('${{ runner.temp }}', dirname(s.options.out));
  const artifact = join(r.dir, upload.with.name);
  let uploadResult = 'skipped';
  if (result.status === 0 && outputs['receipt-created'] === 'true') {
   uploadResult = existsSync(path) ? 'success' : 'failure';
   if (uploadResult === 'success') copyFileSync(path, artifact);
  }
  const jobResult = result.status === 0 && uploadResult !== 'failure' ? 'success' : 'failure';
  expect(result.status).toBe(scenario === 'producer failure' ? 1 : 0);
  expect(uploadResult).toBe(scenario === 'eligible PR' ? 'success' : scenario === 'missing receipt' ? 'failure' : 'skipped');
  expect(jobResult).toBe(scenario === 'fork' || scenario === 'eligible PR' ? 'success' : 'failure');
  expect(existsSync(artifact)).toBe(scenario === 'eligible PR');
  if (scenario === 'fork') {
   expect(result.stdout.trim()).toBe('TREE_VERDICT_PRODUCER_NOT_ELIGIBLE: fork pull request');
   expect(outputs['receipt-created']).toBe('false');
   expect(existsSync(path)).toBe(false);
  }
  if (scenario === 'eligible PR') expect(JSON.parse(readFileSync(artifact, 'utf8')).verdict).toBe('success');
  console.log('COLLECTOR_JOB_FIXTURE ' + JSON.stringify({ scenario, hostedRun: false, producerExit: result.status,
   producerLine: result.stdout.trim(), receiptCreated: outputs['receipt-created'], upload: uploadResult, job: jobResult }));
 } finally { r.close(); }
});
const forkPlants = {
 'missing run head repository': s => { delete s.run.head_repository; },
 'blank run source name': s => { s.run.head_repository.full_name = ''; },
 'invalid run source ID': s => { s.run.head_repository.id = 0; },
 'same source ID, different name': s => { s.run.head_repository.id = 1; },
 'same source name, different ID': s => { s.run.head_repository.full_name = s.run.repository.full_name; },
 'wrong event source ID': s => { s.event.pull_request.head.repo.id = 3; },
 'wrong event source name': s => { s.event.pull_request.head.repo.full_name = 'another/core'; },
 'missing event source repository': s => { delete s.event.pull_request.head.repo; },
 'missing event base': s => { delete s.event.pull_request.base; },
 'wrong event base repository': s => { s.event.pull_request.base.repo.id = 3; },
 'wrong event base name': s => { s.event.pull_request.base.repo.full_name = 'another/core'; },
 'wrong event base branch': s => { s.event.pull_request.base.ref = 'other'; },
 'blank default branch': s => { s.event.repository = { ...s.event.repository, default_branch: '' };
  s.event.pull_request.base.ref = s.pull.base.ref = ''; },
 'wrong event head SHA': s => { s.event.pull_request.head.sha = 'e'.repeat(40); },
 'wrong event repository': s => { s.event.repository = { ...s.event.repository, id: 3 }; },
 'missing event PR number': s => { delete s.event.number; },
 'wrong API source ID': s => { s.pull.head.repo.id = 3; },
 'wrong API source name': s => { s.pull.head.repo.full_name = 'another/core'; },
 'missing API source repository': s => { delete s.pull.head.repo; },
 'wrong API base repository': s => { s.pull.base.repo = { id: 3, full_name: 'another/core' }; },
 'wrong API base name': s => { s.pull.base.repo = { id: 1, full_name: 'another/core' }; },
 'wrong API base branch': s => { s.pull.base.ref = 'other'; },
 'wrong API PR number': s => { s.pull.number = 8; },
 'wrong API head SHA': s => { s.pull.head.sha = 'e'.repeat(40); },
 'inactive run': s => { s.run.status = 'completed'; },
 'wrong workflow': s => { s.run.path = '.github/workflows/other.yml'; },
 'fork push': s => { s.run.event = s.env.GITHUB_EVENT_NAME = 'push'; },
 'fork dispatch': s => { s.run.event = s.env.GITHUB_EVENT_NAME = 'workflow_dispatch'; },
 'pull_request_target': s => { s.run.event = s.env.GITHUB_EVENT_NAME = 'pull_request_target'; },
};
for (const [name, plant] of Object.entries(forkPlants)) test(`entry CLI malformed fork ${name} still refuses`, () => {
 const r = repository(), s = forkSource(r);
 try {
  plant(s);
  writeFileSync(s.options.out, 'previous receipt');
  const result = producerCLI(s);
  expect(result.status).toBe(1);
  expect(result.stdout).toContain('TREE_VERDICT_PRODUCER_REFUSED:');
  expect(result.stdout).not.toContain('TREE_VERDICT_PRODUCER_NOT_ELIGIBLE:');
  expect(existsSync(s.options.out)).toBe(false);
  expect(result.outputText.trim().split('\n').at(-1)).toBe('receipt-created=false');
 } finally { r.close(); }
});
test('receipt-created stays false until the eligible receipt has been written', async () => {
 const r = repository(), s = source(r);
 try {
  expect(await produce(s.options, s.env, s.api, line => {
   expect(line).toContain('TREE_VERDICT_PRODUCED:');
   expect(JSON.parse(readFileSync(s.options.out, 'utf8')).verdict).toBe('success');
   expect(readFileSync(s.env.GITHUB_OUTPUT, 'utf8')).toBe('receipt-created=false\n');
  })).toBe(0);
  expect(readFileSync(s.env.GITHUB_OUTPUT, 'utf8')).toBe('receipt-created=false\nreceipt-created=true\n');
 } finally { r.close(); }
});
for (const failure of ['missing leg', 'receipt write', 'malformed arguments']) test(`entry CLI eligible ${failure} resets reused output to false and fails`, () => {
 const r = repository(), s = source(r);
 try {
  expect(producerCLI(s).status).toBe(0);
  let result;
  if (failure === 'malformed arguments') {
   result = spawnSync(process.execPath, [fileURLToPath(new URL('./producer.mjs', import.meta.url)), '--out', s.options.out],
    { env: s.env, encoding: 'utf8', timeout: 10_000 });
  } else {
   if (failure === 'missing leg') s.rows.shift();
   else s.options.out = join(r.dir, 'absent', 'receipt.json');
   result = producerCLI(s);
   expect(existsSync(s.options.out)).toBe(false);
  }
  expect(result.status).toBe(1);
  expect(readFileSync(s.env.GITHUB_OUTPUT, 'utf8').trim().split('\n').at(-1)).toBe('receipt-created=false');
 } finally { r.close(); }
});
test('entry CLI outside Actions still writes an eligible receipt without GITHUB_OUTPUT', () => {
 const r = repository(), s = source(r);
 try {
  delete s.env.GITHUB_OUTPUT;
  delete s.env.GITHUB_ACTIONS;
  expect(producerCLI(s).status).toBe(0);
  expect(JSON.parse(readFileSync(s.options.out, 'utf8')).verdict).toBe('success');
 } finally { r.close(); }
});
for (const kind of ['same PR', 'fork', 'push']) for (const missing of [true, false]) test(`Actions entry CLI ${kind} refuses ${missing ? 'missing' : 'empty'} GITHUB_OUTPUT by name`, () => {
 const r = repository(), s = kind === 'fork' ? forkSource(r) : source(r);
 try {
  s.env.GITHUB_ACTIONS = 'true';
  if (missing) delete s.env.GITHUB_OUTPUT; else s.env.GITHUB_OUTPUT = '';
  if (kind === 'push') {
   s.run.event = s.env.GITHUB_EVENT_NAME = 'push'; s.run.head_branch = 'main'; s.env.GITHUB_REF = 'refs/heads/main';
   s.run.head_sha = r.proof.sha; for (const row of s.rows) row.head_sha = r.proof.sha;
  }
  const result = producerCLI(s);
  expect(result.status).toBe(1);
  expect(result.stdout.trim()).toBe('TREE_VERDICT_PRODUCER_REFUSED: COVER_PRODUCER: GITHUB_OUTPUT required on Actions');
  expect(existsSync(s.options.out)).toBe(false);
  expect(result.apiCalls).toEqual(['']);
 } finally { r.close(); }
});
test('output write failure after receipt creation refuses and clears the candidate receipt', async () => {
 const r = repository(), s = source(r), output = s.env.GITHUB_OUTPUT, blocked = join(r.dir, 'blocked-output');
 mkdirSync(blocked);
 try {
  const result = await produce(s.options, s.env, s.api, line => {
   if (line.startsWith('TREE_VERDICT_PRODUCED:')) {
    expect(existsSync(s.options.out)).toBe(true);
    s.env.GITHUB_OUTPUT = blocked;
   }
  });
  expect(result).toBe(1);
  expect(existsSync(s.options.out)).toBe(false);
  expect(readFileSync(output, 'utf8')).toBe('receipt-created=false\n');
 } finally { r.close(); }
});
test('producer becoming a fork during receipt collection refuses without writing evidence', async () => {
 const r = repository(), s = source(r);
 try {
  const original = s.api;
  let reads = 0;
  s.api = async path => {
   if (path.endsWith('/runs/800') && ++reads === 2) {
    s.run.head_repository = { id: 2, full_name: 'contributor/core' };
    s.pull.head.repo = s.event.pull_request.head.repo = s.run.head_repository;
    writeFileSync(s.env.GITHUB_EVENT_PATH, JSON.stringify(s.event));
   }
   return structuredClone(await original(path));
  };
  expect(await produce(s.options, s.env, s.api)).toBe(1);
  expect(existsSync(s.options.out)).toBe(false);
 } finally { r.close(); }
});
for(const style of ['parts','core'])test(`${style} collector compiles checked source, collects every successful leg, executes no chain`,async()=>{
 const r=repository(style),s=source(r);try{
 expect(await produce(s.options,s.env,s.api)).toBe(0);
 const receipt=JSON.parse(readFileSync(s.options.out,'utf8'));
 expect(receipt.schema).toBe('tree-verdict/2');expect(receipt.jobs).toHaveLength(style==='core'?7:5);
 expect(receipt.tested_sha).toBe(r.proof.sha);expect(receipt.tested_sha).not.toBe(receipt.head_sha);
 expect(receipt.collector.compiler).toBe('static-coverage/2');expect(s.calls.some(p=>p.includes('/attempts/2/jobs?'))).toBe(true);
 expect(existsSync(join(r.repo,'chain-ran'))).toBe(false);
 console.log(`PLANT collector ${style}: exit=0; successful legs=${receipt.jobs.length}; executed chain=0`);
 }finally{r.close();}
});
for(const plant of ['missing leg','cancelled leg','duplicate name','duplicate ID','wrong attempt','dirty checkout','wrong checkout','wrong workflow','API error','invalid source graph','changed attempt'])test(`collector ${plant} refuses receipt`,async()=>{
 const r=repository(),s=source(r);try{
 if(plant==='missing leg')s.rows.shift();if(plant==='cancelled leg')s.rows[0].conclusion='cancelled';
 if(plant==='duplicate name')s.rows.push({...s.rows[0],id:999});if(plant==='duplicate ID')s.rows.push({...s.rows[0],name:'unrelated'});
 if(plant==='wrong attempt')s.rows[0].run_attempt=1;
 if(plant==='dirty checkout')writeFileSync(join(r.repo,'probe'),'b');
 if(plant==='wrong checkout')s.env.GITHUB_SHA='e'.repeat(40);
 if(plant==='wrong workflow')s.run.path='.github/workflows/other.yml';
 if(plant==='API error')s.api=async()=>{throw new Error('unavailable');};
 if(plant==='invalid source graph'){
  const doc=Bun.YAML.parse(readFileSync(join(r.repo,'.github/workflows/ci.yml'),'utf8'));delete doc.jobs.test.needs;writeFileSync(join(r.repo,'.github/workflows/ci.yml'),Bun.YAML.stringify(doc));
 }
 if(plant==='changed attempt'){const api=s.api;s.api=async p=>{if(p.includes('/git/commits/'))s.run.run_attempt++;return api(p);};}
 expect(await produce(s.options,s.env,s.api)).toBe(1);expect(existsSync(s.options.out)).toBe(false);
 if(plant==='invalid source graph')expect(s.calls).toHaveLength(0);
 console.log(`PLANT collector ${plant}: exit=1; receipt=0`);
 }finally{r.close();}
});
test('fresh dispatch CI collector succeeds but dispatch is never a reusable source',async()=>{
 const r=repository(),s=source(r);try{
 s.run.event='workflow_dispatch';s.env.GITHUB_EVENT_NAME='workflow_dispatch';
 expect(await produce(s.options,s.env,s.api)).toBe(0);expect(JSON.parse(readFileSync(s.options.out,'utf8')).event).toBe('workflow_dispatch');
 const f=fixture();f.c.event='workflow_dispatch';expect((await lookup(f.c,f.api,f.readReceipt)).reused).toBe(false);
 console.log('PLANT dispatch: collector exit=0; consumer reused=false; original full chain required');
 }finally{r.close();}
});
test('collector CLI refuses old chain-execution grammar and requires declaration',()=>{
 expect(()=>argumentsForProducer(['--gate','old/1','--','true'])).toThrow();
 expect(()=>argumentsForProducer(['--out','receipt.json'])).toThrow();
 expect(argumentsForProducer(['--declaration','scripts/tree-verdict.json','--out','receipt.json']).declaration).toContain('scripts/tree-verdict.json');
});
// Exercise the entire-chain fallback, not only the low-level false verdict.
test('lifecycle covers every command; tested-tree difference with equal PR head, no fresh main receipt, and broken evidence execute entire original chain',async()=>{
 const r=repository(),f=fixture();try{
 const commands=['typecheck','lint','selftest'].map(stage=>`node -e 'require("node:fs").appendFileSync(process.env.CHAIN_TRACE,"${stage}\\n");if(process.env.CHAIN_FAIL_STAGE==="${stage}")process.exit(7)'`);
 const d=structuredClone(r.f.declaration);d.chain=commands.join(' && ');d.commands=commands;d.covers=Object.fromEntries(commands.map(c=>[c,['merge']]));d.jobs={merge:{...d.jobs.merge,role:'plain'}};
 // Node canonical consumer validation binds the complete command inventory; producer cannot compile this fabricated workflow map.
 const declaration=join(r.dir,'lifecycle.json');writeFileSync(declaration,JSON.stringify(d));
 const {readDeclaration}=await import('./declaration.mjs');const normalized=readDeclaration(declaration);
 f.c.coverage=normalized.coverage;f.c.gate=normalized.gate;f.c.sha=r.proof.sha;
 f.commits.set(r.proof.sha,{sha:r.proof.sha,tree:{sha:r.proof.tree},parents:[]});
 for(const c of f.commits.values())c.tree.sha=r.proof.tree;
 f.pr.merge_commit_sha=r.proof.sha;
 const plan={schema:'tree-verdict-collector/2',compiler:'static-coverage/2',coverage:normalized.coverage,digest:(await import('./coverage.mjs')).digest(normalized.coverage),sources:f.receipt.collector.sources,collectorName:'tree-verdict-receipt',jobId:200};
 const leg=f.jobRows.find(j=>j.name==='test');f.jobRows=[leg,f.jobRows.at(-1)];
 f.receipt.jobs=[{group:'merge',matrix:{},...leg}];
 Object.assign(f.receipt,{gate:f.c.gate,tree:r.proof.tree,collector:plan});
 const proof=join(r.dir,'verified.json'),event=join(r.dir,'consumer-event.json'),trace=join(r.dir,'chain.log');
 writeFileSync(event,JSON.stringify({repository:{full_name:f.c.repository,default_branch:'main'}}));
 const env={...process.env,CHAIN_TRACE:trace,GITHUB_REPOSITORY:f.c.repository,GITHUB_SHA:r.proof.sha,GITHUB_RUN_ID:String(f.c.runId),GITHUB_EVENT_NAME:'push',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_PATH:event};
 const args=['--declaration',declaration,'--verdict-path',proof,'--checkout',r.repo];
 const result=await lookup(f.c,f.api,f.readReceipt);expect(result.reused).toBe(true);
 const envelope=publishEnvelope(f.c,result);writeFileSync(proof,JSON.stringify(envelope));
 expect(await lifecycle(args,env,f)).toBe(0);expect(existsSync(trace)).toBe(false);
 const originalReceipt=structuredClone(f.receipt),originalRows=structuredClone(f.jobRows);
 // Independent actual Git tree B from a one-byte tracked edit, then restore clean tree A.
 writeFileSync(join(r.repo,'probe'),'b');r.git('add','probe');const otherTree=r.git('write-tree');r.git('reset','-q','HEAD','--','probe');writeFileSync(join(r.repo,'probe'),'a');expect(otherTree).not.toBe(r.proof.tree);
 for(const plant of ['missing','invalid','noncovering','tested tree differs','main reused without receipt']){
  writeFileSync(proof,plant==='invalid'?'{':JSON.stringify(envelope));if(plant==='missing')rmSync(proof);
  writeFileSync(declaration,JSON.stringify(plant==='noncovering'?{...d,commands:commands.slice(1)}:d));
  f.receipt=structuredClone(originalReceipt);f.jobRows=structuredClone(originalRows);f.associated=[{number:7}];
  if(plant==='tested tree differs'){f.receipt.tree=otherTree;f.commits.get(f.receipt.tested_sha).tree.sha=otherTree;expect(f.commits.get(f.pr.head.sha).tree.sha).toBe(r.proof.tree);}
  else f.commits.get(originalReceipt.tested_sha).tree.sha=r.proof.tree;
  if(plant==='main reused without receipt'){
   f.associated=[];Object.assign(f.run,{event:'push',head_sha:f.c.sha,head_branch:'main'});f.direct=[f.run];f.receipt=undefined;
  }
  rmSync(trace,{force:true});expect(await lifecycle(args,env,f)).toBe(0);expect(readFileSync(trace,'utf8')).toBe('typecheck\nlint\nselftest\n');
  console.log(`PLANT full lifecycle ${plant}: commands=3/3; chain exit=0`);
 }
 rmSync(proof,{force:true});rmSync(trace);writeFileSync(declaration,JSON.stringify(d));
 expect(await lifecycle(args,{...env,CHAIN_FAIL_STAGE:'lint'},f)).toBe(7);expect(readFileSync(trace,'utf8')).toBe('typecheck\nlint\n');
 }finally{r.close();}
});
