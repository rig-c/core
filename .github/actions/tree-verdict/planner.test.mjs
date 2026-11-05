import { test, expect } from 'bun:test';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { workflowFixture } from './fixtures.mjs';
import { compileCoverage } from './planner.mjs';
function refresh(f) { for(const [path,doc] of Object.entries(f.documents)) f.files[path]=Bun.YAML.stringify(doc); f.files['scripts/tree-verdict.json']=JSON.stringify(f.declaration); }
for(const style of ['core','parts']) test(`${style} literal shard display names expand and merge proves full gate`,()=>{
 const f=workflowFixture(style),plan=compileCoverage(f.declaration,f.read);
 expect(plan.coverage.jobs.shards.legs.length).toBe(style==='core'?6:4);
 expect(plan.needs).toEqual(style==='core'?['selftest']:['shard','test']);
 console.log(`COVER positive ${style}: expected legs=${style==='core'?7:5}; chain execution=0`);
});
test('actual immutable core reusable source + hypothetical collector compiles without workflow edits',()=>{
 const f=workflowFixture('core');
 f.documents['.github/workflows/ci.yml']=Bun.YAML.parse(readFileSync(new URL('../../workflows/ci.yml',import.meta.url),'utf8'));
 f.documents['.github/workflows/ci.yml'].jobs['tree-verdict-receipt']=workflowFixture('core').documents['.github/workflows/ci.yml'].jobs['tree-verdict-receipt'];
 f.documents['.github/workflows/selftest-shards.yml']=Bun.YAML.parse(readFileSync(new URL('../../workflows/selftest-shards.yml',import.meta.url),'utf8'));
 refresh(f); expect(compileCoverage(f.declaration,f.read).coverage.jobs.shards.legs.length).toBe(6);
});
const plants={
 'COVER_JOB missing job':f=>{delete f.documents['.github/workflows/ci.yml'].jobs.shard;},
 'COVER_COMMAND missing mapped script':f=>{f.documents['.github/workflows/ci.yml'].jobs.test.steps[1].run='echo no typecheck';},
 'COVER_MATRIX omitted leg':f=>{f.declaration.jobs.shards.legs.pop();},
 'COVER_MATRIX duplicate partition':f=>{f.documents['.github/workflows/ci.yml'].jobs.shard.steps[1].run='bun selftest.ts --shard 1';},
 'COVER_MERGE missing semantic merge':f=>{f.declaration.covers['bun run selftest']=['shards'];delete f.declaration.jobs.merge;f.declaration.covers['bun run typecheck']=['shards'];f.declaration.covers['bun run lint']=['shards'];},
 'COVER_MERGE dependency missing':f=>{delete f.documents['.github/workflows/ci.yml'].jobs.test.needs;},
 'COVER_COMMAND skipped merge':f=>{f.documents['.github/workflows/ci.yml'].jobs.test.steps[3].if=false;},
 'COVER_COMMAND tolerated merge failure':f=>{f.documents['.github/workflows/ci.yml'].jobs.test.steps[3]['continue-on-error']=true;},
 'COVER_COMMAND skipped typecheck':f=>{f.documents['.github/workflows/ci.yml'].jobs.test.steps[1].if='${{ false }}';},
 'COVER_COMMAND merge failure masked by OR':f=>{f.documents['.github/workflows/ci.yml'].jobs.test.steps[3].run='bun selftest.ts --merge shards || true';},
 'COVER_COMMAND merge flag on unrelated line':f=>{f.documents['.github/workflows/ci.yml'].jobs.test.steps[3].run='bun selftest.ts --only foo\necho --merge shards';},
 'COVER_COMMAND quoted merge string is not flag':f=>{f.documents['.github/workflows/ci.yml'].jobs.test.steps[3].run='bun selftest.ts "--merge shards"';},
 'COVER_COMMAND shard failure masked by OR':f=>{f.documents['.github/workflows/ci.yml'].jobs.shard.steps[1].run='bun selftest.ts --shard ${{ matrix.shard }} || true';},
 'COVER_COMMAND shard flag on unrelated line':f=>{f.documents['.github/workflows/ci.yml'].jobs.shard.steps[1].run='bun selftest.ts --only foo\necho --shard ${{ matrix.shard }}';},
 'COVER_COMMAND merge redirected':f=>{f.documents['.github/workflows/ci.yml'].jobs.test.steps[3].run='bun selftest.ts --merge shards > output';},
 'COVER_COMMAND merge pipeline':f=>{f.documents['.github/workflows/ci.yml'].jobs.test.steps[3].run='bun selftest.ts --merge shards | cat';},
 'COVER_COMMAND merge background':f=>{f.documents['.github/workflows/ci.yml'].jobs.test.steps[3].run='bun selftest.ts --merge shards &';},
 'COVER_COMMAND merge extra command':f=>{f.documents['.github/workflows/ci.yml'].jobs.test.steps[3].run='bun selftest.ts --merge shards; true';},
 'COVER_COMMAND double quoted substitution':f=>{f.documents['.github/workflows/ci.yml'].jobs.test.steps[3].run='bun selftest.ts --merge "$(echo shards)"';},
 'COVER_COMMAND backtick substitution':f=>{f.documents['.github/workflows/ci.yml'].jobs.test.steps[3].run='bun selftest.ts --merge `echo shards`';},
 'COVER_DYNAMIC strategy name':f=>{f.documents['.github/workflows/ci.yml'].jobs.test.name='${{ strategy.job-total }}';f.declaration.jobs.merge.legs[0].apiName='1';},
 'COVER_COMMAND merge invocation missing':f=>{f.documents['.github/workflows/ci.yml'].jobs.test.steps[3].run='echo no merge';},
 'COVER_COMMAND collector OR hides failure':f=>{f.documents['.github/workflows/ci.yml'].jobs['tree-verdict-receipt'].steps[1].run='bun "$TOOLS/producer.mjs" --declaration scripts/tree-verdict.json --out "$RUNNER_TEMP/receipt.json" || true';},
 'COVER_COMMAND collector second command':f=>{f.documents['.github/workflows/ci.yml'].jobs['tree-verdict-receipt'].steps[1].run='bun "$TOOLS/producer.mjs" --declaration scripts/tree-verdict.json --out "$RUNNER_TEMP/receipt.json" ; bun run selftest';},
 'COVER_PRODUCER collector extra positional':f=>{f.documents['.github/workflows/ci.yml'].jobs['tree-verdict-receipt'].steps[1].run+=' extra';},
 'COVER_PRODUCER collector duplicate output':f=>{f.documents['.github/workflows/ci.yml'].jobs['tree-verdict-receipt'].steps[1].run+=' --out second.json';},
 'COVER_PRODUCER collector missing output':f=>{f.documents['.github/workflows/ci.yml'].jobs['tree-verdict-receipt'].steps[1].run='bun "$TOOLS/producer.mjs" --declaration scripts/tree-verdict.json';},
 'COVER_PRODUCER incomplete needs':f=>{f.documents['.github/workflows/ci.yml'].jobs['tree-verdict-receipt'].needs=['test'];},
 'COVER_PRODUCER always collector':f=>{f.documents['.github/workflows/ci.yml'].jobs['tree-verdict-receipt'].if='always()';},
 'COVER_DYNAMIC github name':f=>{f.documents['.github/workflows/ci.yml'].jobs.shard.name='${{ github.ref }}';},
 'COVER_DYNAMIC fromJSON matrix':f=>{f.documents['.github/workflows/ci.yml'].jobs.shard.strategy.matrix='${{ fromJSON(inputs.matrix) }}';},
 'COVER_CHECKOUT overridden ref':f=>{f.documents['.github/workflows/ci.yml'].jobs.test.steps[0].with={ref:'other'};},
 'COVER_CHECKOUT fromJSON ref':f=>{f.documents['.github/workflows/ci.yml'].jobs.test.steps[0].with={ref:'${{ fromJSON(inputs.ref) }}'};},
};
for(const [label,plant]of Object.entries(plants))test(`actual lint CLI plant ${label}`,()=>{
 const f=workflowFixture('parts');plant(f);refresh(f);
 const root=mkdtempSync(join(process.env.TMPDIR,'coverage-cli-'));
 for(const [path,text]of Object.entries(f.files)){mkdirSync(join(root,path,'..'),{recursive:true});writeFileSync(join(root,path),text);}
 const inventory={schema:'workflow-verdict-lint/1',defaultBranch:'main',coverageDeclarations:['scripts/tree-verdict.json'],workflows:[{path:'.github/workflows/ci.yml',heavyJobs:[],publishes:[]}]};
 const config=join(root,'inventory.json');writeFileSync(config,JSON.stringify(inventory));
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('../../../scripts/lint_workflows.ts',import.meta.url)),config,root],{encoding:'utf8'});
 writeFileSync(join(root,'stdout.log'),result.stdout);writeFileSync(join(root,'stderr.log'),result.stderr);
 expect(result.status).toBe(1);expect(result.stderr).toContain(label.split(' ')[0]);
 console.log(`PLANT ${label}: lint CLI exit=${result.status}; refused=1`);
});
test('canonical covers edit changes gate; optional previous declaration refuses unchanged version',()=>{
 const f=workflowFixture('parts'),old=structuredClone(f.declaration),before=compileCoverage(f.declaration,f.read);
 f.declaration.producer.step='record';f.documents['.github/workflows/ci.yml'].jobs['tree-verdict-receipt'].steps[1].id='record';refresh(f);
 expect(compileCoverage(f.declaration,f.read).gate).not.toBe(before.gate);
 expect(()=>compileCoverage(f.declaration,f.read,'scripts/tree-verdict.json',old)).toThrow('COVER_VERSION');
 f.declaration.gate='parts-full/3';refresh(f);expect(compileCoverage(f.declaration,f.read,'scripts/tree-verdict.json',old).gate).toContain('parts-full/3/');
});

test('same explicit source checkout path and command cwd with sibling pinned tooling are supported',()=>{
 const f=workflowFixture('parts');
 for(const j of Object.values(f.documents['.github/workflows/ci.yml'].jobs)){
  j.steps[0].with={path:'consumer'};j.defaults={run:{'working-directory':'consumer'}};
  j.steps.splice(1,0,{uses:'actions/checkout@v4',with:{repository:'rig-c/core',ref:'fixed-pin',path:'helper'}});
 }
 refresh(f);expect(compileCoverage(f.declaration,f.read).needs).toEqual(['shard','test']);
});
test('pinned action tooling output supports collector without an untracked helper checkout',()=>{
 const f=workflowFixture('core'),j=f.documents['.github/workflows/ci.yml'].jobs['tree-verdict-receipt'];
 j.steps.splice(1,0,{id:'tools',uses:'rig-c/core/.github/actions/tree-verdict@FULL_PIN'});
 j.steps[2].run='bun "$TREE_VERDICT_TOOLS/producer.mjs" --declaration scripts/tree-verdict.json --out "$RUNNER_TEMP/receipt.json"';
 j.steps[2].env={TREE_VERDICT_TOOLS:'${{ steps.tools.outputs.tooling-path }}'};
 refresh(f);expect(compileCoverage(f.declaration,f.read).collectorName).toBe('tree-verdict-receipt');
});


test('ordinary and merge steps permit explicit success() and continue-on-error false',()=>{
 const f=workflowFixture('parts');
 for(const step of f.documents['.github/workflows/ci.yml'].jobs.test.steps.slice(1)){step.if='${{ success() }}';step['continue-on-error']=false;}
 refresh(f);expect(compileCoverage(f.declaration,f.read).needs).toEqual(['shard','test']);
});


test('single mapped argv accepts quoted flags and quoted RUNNER_TEMP glob arguments',()=>{
 const f=workflowFixture('parts');
 f.documents['.github/workflows/ci.yml'].jobs.test.steps[3].run='bun selftest.ts "--merge" "$RUNNER_TEMP"/tally/*.json';
 f.documents['.github/workflows/ci.yml'].jobs.shard.steps[1].run="bun selftest.ts '--shard' '${{ matrix.shard }}' --record shard.json";
 refresh(f);expect(compileCoverage(f.declaration,f.read).needs).toEqual(['shard','test']);
});


test('collector argv accepts known dynamic quoted path and optional checkout in either option order',()=>{
 const f=workflowFixture('core'),step=f.documents['.github/workflows/ci.yml'].jobs['tree-verdict-receipt'].steps[1];
 step.run='bun "$TOOLS/producer.mjs" --out "$RUNNER_TEMP/receipt.json" --checkout . --declaration "scripts/tree-verdict.json"';
 refresh(f);expect(compileCoverage(f.declaration,f.read).collectorName).toBe('tree-verdict-receipt');
});

function plainMatrixFixture(osOnly = false) {
  const f = workflowFixture('parts');
  const root = f.documents['.github/workflows/ci.yml'];
  const axis = osOnly ? 'os' : 'shard';
  const values = osOnly ? ['ubuntu-latest', 'windows-latest'] : [1, 2, 3, 4, 5, 6];
  const job = root.jobs.test;
  delete job.needs;
  delete job.if;
  job.name = `full \${{ matrix.${axis} }}`;
  job.strategy = { matrix: { [axis]: values } };
  job['runs-on'] = osOnly ? '${{ matrix.os }}' : 'ubuntu-latest';
  job.steps[3] = { run: 'bun run selftest' };
  root.jobs = { test: job, 'tree-verdict-receipt': root.jobs['tree-verdict-receipt'] };
  root.jobs['tree-verdict-receipt'].needs = ['test'];
  f.declaration.jobs = { full: { path: ['test'], role: 'plain', legs: values.map(value => ({ matrix: { [axis]: value }, apiName: `full ${value}` })) } };
  f.declaration.covers = Object.fromEntries(f.declaration.commands.map(command => [command, ['full']]));
  return f;
}
for (const scope of ['step', 'job', 'workflow', 'argv', 'OS only']) test(`plain mapped matrix dependency ${scope}: actual CLI result`, () => {
  const f = plainMatrixFixture(scope === 'OS only');
  const root = f.documents['.github/workflows/ci.yml'];
  const job = root.jobs.test;
  const env = { RIGC_SHARD: '${{ matrix.shard }}/7' };
  if (scope === 'step') job.steps[3].env = env;
  if (scope === 'job') job.env = env;
  if (scope === 'workflow') root.env = env;
  if (scope === 'argv') {
    job.strategy.matrix.command = ['selftest'];
    for (const leg of f.declaration.jobs.full.legs) leg.matrix.command = 'selftest';
    job.steps[3].run = 'bun run ${{ matrix.command }}';
  }
  refresh(f);
  const dir = mkdtempSync(join(process.env.TMPDIR, 'plain-matrix-cli-'));
  for (const [path, text] of Object.entries(f.files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  const inventory = { schema: 'workflow-verdict-lint/1', defaultBranch: 'main', coverageDeclarations: ['scripts/tree-verdict.json'], workflows: [{ path: '.github/workflows/ci.yml', heavyJobs: [], publishes: [] }] };
  const config = join(dir, 'inventory.json');
  writeFileSync(config, JSON.stringify(inventory));
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../../../scripts/lint_workflows.ts', import.meta.url)), config, dir], { encoding: 'utf8' });
  writeFileSync(join(dir, 'stdout.log'), result.stdout);
  writeFileSync(join(dir, 'stderr.log'), result.stderr);
  expect(result.status).toBe(scope === 'OS only' ? 0 : 1);
  if (scope !== 'OS only') expect(result.stderr).toContain('COVER_COMMAND');
  console.log(`PLANT plain matrix ${scope}: lint CLI exit=${result.status}`);
});
