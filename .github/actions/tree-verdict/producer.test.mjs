import { test, expect } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
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
 const event={repository:repo,number:7,pull_request:{head:{sha:'b'.repeat(40)}}};
 const eventPath=join(r.dir,'event.json');writeFileSync(eventPath,JSON.stringify(event));
 const run={id:800,run_attempt:2,workflow_id:10,path:plan.coverage.workflow,head_sha:'b'.repeat(40),event:'pull_request',status:'in_progress',conclusion:null,repository:repo,head_repository:repo};
 const env={...process.env,GITHUB_REPOSITORY:repo.full_name,GITHUB_RUN_ID:'800',GITHUB_RUN_ATTEMPT:'2',GITHUB_EVENT_NAME:'pull_request',GITHUB_EVENT_PATH:eventPath,GITHUB_SHA:r.proof.sha,GITHUB_JOB:plan.coverage.producer.job};
 const rows=Object.values(plan.coverage.jobs).flatMap(j=>j.legs).map((l,i)=>({id:100+i,name:l.apiName,run_id:800,run_attempt:2,head_sha:run.head_sha,status:'completed',conclusion:'success'}));
 rows.push({id:200,name:plan.collectorName,run_id:800,run_attempt:2,head_sha:run.head_sha,status:'in_progress',conclusion:null});
 const options={cwd:r.repo,declaration:join(r.repo,'scripts/tree-verdict.json'),out:join(r.dir,'receipt.json')};
 const state={plan,run,env,rows,options,event,calls:[]};
 state.api=async path=>{state.calls.push(path);
  if(path.endsWith('/runs/800'))return run;
  if(path.endsWith('/ci.yml'))return{id:10,path:run.path,state:'active'};
  if(path.endsWith('/pulls/7'))return{number:7,head:{sha:run.head_sha,repo},base:{ref:'main',repo}};
  if(path.includes('/jobs?'))return{total_count:state.rows.length,jobs:state.rows};
  if(path.includes('/git/commits/'))return{sha:r.proof.sha,tree:{sha:r.proof.tree}};
  throw new Error('unexpected fixture API');};return state;
}
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
