import { test, expect } from 'bun:test';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { workflowFixture } from './fixtures.mjs';
import { compileCoverage } from './planner.mjs';
import { actionUses } from './publication-fixtures.mjs';
function refresh(f) { for(const [path,doc] of Object.entries(f.documents)) f.files[path]=Bun.YAML.stringify(doc); f.files['scripts/tree-verdict.json']=JSON.stringify(f.declaration); }
function uploadFixture(style = 'parts') {
 const f = workflowFixture(style), collector = f.documents['.github/workflows/ci.yml'].jobs['tree-verdict-receipt'];
 const upload = collector.steps.at(-1);
 upload.if = "${{ steps.receipt.outputs.receipt-created == 'true' }}";
 return { f, collector, upload };
}
function lintFixture(f) {
 refresh(f);
 const dir = mkdtempSync(join(process.env.TMPDIR, 'upload-'));
 for (const [path, text] of Object.entries(f.files)) {
  mkdirSync(join(dir, path, '..'), { recursive: true }); writeFileSync(join(dir, path), text);
 }
 const config = join(dir, 'inventory.json');
 writeFileSync(config, JSON.stringify({ schema: 'workflow-verdict-lint/1', defaultBranch: 'main',
  coverageDeclarations: ['scripts/tree-verdict.json'], workflows: [{ path: '.github/workflows/ci.yml', heavyJobs: [] }] }));
 const result = spawnSync(process.execPath, [fileURLToPath(new URL('../../../scripts/lint_workflows.ts', import.meta.url)), config, dir], { encoding: 'utf8' });
 writeFileSync(join(dir, 'stdout.log'), result.stdout); writeFileSync(join(dir, 'stderr.log'), result.stderr);
 return result;
}
for (const style of ['core', 'parts']) test(`${style} upload lint CLI accepts exact producer output condition and legacy erroring upload`, () => {
 for (const form of ['wrapped', 'bare', 'custom ID', 'legacy']) {
  const s = uploadFixture(style);
  if (form === 'bare') s.upload.if = "steps.receipt.outputs.receipt-created == 'true'";
  if (form === 'custom ID') {
   s.f.declaration.producer.step = 'record'; s.collector.steps[1].id = 'record';
   s.upload.if = "${{ steps.record.outputs.receipt-created == 'true' }}";
  }
  if (form === 'legacy') delete s.upload.if;
  s.upload['continue-on-error'] = false;
  const result = lintFixture(s.f);
  expect(result.status).toBe(0);
  expect(compileCoverage(s.f.declaration, s.f.read).collectorName).toBe('tree-verdict-receipt');
 }
});
const uploadPlants = {
 'no upload': s => { s.collector.steps.pop(); },
 'two exact uploads': s => { s.collector.steps.push(structuredClone(s.upload)); },
 'exact plus unconditional upload': s => { const other = structuredClone(s.upload); delete other.if; s.collector.steps.push(other); },
 'two legacy uploads': s => { delete s.upload.if; s.collector.steps.push(structuredClone(s.upload)); },
 'wrong upload name': s => { s.upload.with.name = 'nope'; },
 'dynamic upload name': s => { s.upload.with.name = '${{ env.RECEIPT_NAME }}'; },
 'upload runner temp directory': s => { s.upload.with.path = '${{ runner.temp }}'; },
 'upload wrong file': s => { s.upload.with.path = '${{ runner.temp }}/other.json'; },
 'upload path prefix lookalike': s => { s.upload.with.path = '${{ runner.temp }}/receipt.json.extra'; },
 'upload multiline paths': s => { s.upload.with.path += '\n${{ runner.temp }}/other.json'; },
 'upload unsupported context': s => { s.upload.with.path = '${{ env.RUNNER_TEMP }}/receipt.json'; },
 'output variable prefix lookalike': s => { s.collector.steps[1].run = 'bun helper/producer.mjs --declaration scripts/tree-verdict.json --out "$RUNNER_TEMP_EXTRA/receipt.json"'; },
 'literal output is not runner temp': s => { s.collector.steps[1].run = "bun helper/producer.mjs --declaration scripts/tree-verdict.json --out '$RUNNER_TEMP/receipt.json'"; },
 'producer output env override': s => { s.collector.steps[1].env = { GITHUB_TOKEN: '${{ github.token }}', GITHUB_OUTPUT: '/dev/null' }; },
 'empty producer output env override': s => { s.collector.steps[1].env = { GITHUB_OUTPUT: '' }; },
 'null producer output env override': s => { s.collector.steps[1].env = { GITHUB_OUTPUT: null }; },
 'wrong producer ID': s => { s.upload.if = "${{ steps.other.outputs.receipt-created == 'true' }}"; },
 'wrong output': s => { s.upload.if = "${{ steps.receipt.outputs.reused == 'true' }}"; },
 'dynamic step index': s => { s.upload.if = "${{ steps[env.PRODUCER].outputs.receipt-created == 'true' }}"; },
 'bracket step syntax': s => { s.upload.if = "${{ steps['receipt'].outputs.receipt-created == 'true' }}"; },
 'extra conjunct': s => { s.upload.if = "${{ steps.receipt.outputs.receipt-created == 'true' && true }}"; },
 'extra disjunct': s => { s.upload.if = "${{ steps.receipt.outputs.receipt-created == 'true' || false }}"; },
 'success conjunct': s => { s.upload.if = "${{ success() && steps.receipt.outputs.receipt-created == 'true' }}"; },
 'always bypass': s => { s.upload.if = "${{ always() || steps.receipt.outputs.receipt-created == 'true' }}"; },
 'literal bypass': s => { s.upload.if = '${{ true }}'; },
 'boolean bypass': s => { s.upload.if = true; },
 'boolean comparison': s => { s.upload.if = '${{ steps.receipt.outputs.receipt-created == true }}'; },
 'inequality': s => { s.upload.if = "${{ steps.receipt.outputs.receipt-created != 'false' }}"; },
 'empty condition': s => { s.upload.if = ''; },
 'malformed wrapper': s => { s.upload.if = "${{ steps.receipt.outputs.receipt-created == 'true'"; },
 'warn with condition': s => { s.upload.with['if-no-files-found'] = 'warn'; },
 'ignore with condition': s => { s.upload.with['if-no-files-found'] = 'ignore'; },
 'default warn with condition': s => { delete s.upload.with['if-no-files-found']; },
 'warn without condition': s => { delete s.upload.if; s.upload.with['if-no-files-found'] = 'warn'; },
 'ignore without condition': s => { delete s.upload.if; s.upload.with['if-no-files-found'] = 'ignore'; },
 'default warn without condition': s => { delete s.upload.if; delete s.upload.with['if-no-files-found']; },
 'ignored upload failure': s => { s.upload['continue-on-error'] = true; },
 'upload before producer': s => { s.collector.steps.splice(1, 0, s.collector.steps.pop()); },
 'condition on another step': s => { s.collector.steps.push({ run: 'echo cleanup', if: s.upload.if }); },
 'condition in another job': s => { s.f.documents['.github/workflows/ci.yml'].jobs.other = { steps: [{ run: 'echo cleanup', if: s.upload.if }] }; },
 'aliased upload in another job': s => { s.f.documents['.github/workflows/ci.yml'].jobs.other = { steps: [s.upload] }; },
 'duplicate producer ID': s => { s.collector.steps.push({ id: 'receipt', run: 'echo replaced' }); },
};
for (const [name, plant] of Object.entries(uploadPlants)) test(`upload lint CLI refuses ${name} by name`, () => {
 const s = uploadFixture(); plant(s);
 const result = lintFixture(s.f);
 expect(result.status).toBe(1);
 expect(result.stderr).toContain('COVER_PRODUCER:');
 expect(() => compileCoverage(s.f.declaration, s.f.read)).toThrow('COVER_PRODUCER:');
});
test('upload lint CLI binds normalized runner temp and literal paths to producer --out exactly', () => {
 const pairs = [
  ['"${RUNNER_TEMP}/receipt.json"', '${{ runner.temp }}/receipt.json'],
  ['"$RUNNER_TEMP"/receipt.json', '${{runner.temp}}/receipt.json'],
  ['"/fixed/receipt.json"', '/fixed/receipt.json'],
  ['"../receipt.json"', '../receipt.json'],
 ];
 for (const [output, path] of pairs) {
  const s = uploadFixture();
  s.collector.steps[1].run = `bun helper/producer.mjs --declaration scripts/tree-verdict.json --out ${output}`;
  s.upload.with.path = path;
  expect(lintFixture(s.f).status).toBe(0);
 }
});
test('upload lint CLI accounts for the producer working directory in relative paths', () => {
 for (const wrongPath of [false, true]) {
  const s = uploadFixture();
  for (const job of Object.values(s.f.documents['.github/workflows/ci.yml'].jobs)) {
   job.steps[0].with = { path: 'consumer' }; job.defaults = { run: { 'working-directory': 'consumer' } };
  }
  s.collector.steps[1].run = 'bun helper/producer.mjs --declaration scripts/tree-verdict.json --out "../receipt.json"';
  s.upload.with.path = wrongPath ? '../receipt.json' : 'receipt.json';
  const result = lintFixture(s.f);
  expect(result.status).toBe(wrongPath ? 1 : 0);
  if (wrongPath) expect(result.stderr).toContain('COVER_PRODUCER:');
 }
});
test('upload lint CLI refuses matched wildcard paths and wildcard segments before normalization', () => {
 for (const pattern of ['*', '?', '[ab]', '**']) {
  for (const matched of [false, true]) {
   const s = uploadFixture();
   const output = matched ? `/fixed/receipt${pattern}.json` : '/fixed/receipt.json';
   s.collector.steps[1].run = `bun helper/producer.mjs --declaration scripts/tree-verdict.json --out "${output}"`;
   s.upload.with.path = matched ? output : `/fixed/${pattern}/../receipt.json`;
   const result = lintFixture(s.f);
   expect(result.status).toBe(1); expect(result.stderr).toContain('COVER_PRODUCER:');
  }
 }
 const s = uploadFixture();
 s.collector.steps[1].run = 'bun helper/producer.mjs --declaration scripts/tree-verdict.json --out "$RUNNER_TEMP/receipt*.json"';
 s.upload.with.path = '${{ runner.temp }}/receipt*.json';
 const result = lintFixture(s.f);
 expect(result.status).toBe(1); expect(result.stderr).toContain('COVER_PRODUCER:');
});
test('upload lint CLI rejects exclusion syntax while permitting literal braces and exclamation characters', () => {
 const literal = uploadFixture();
 literal.collector.steps[1].run = 'bun helper/producer.mjs --declaration scripts/tree-verdict.json --out "/fixed/receipt{a,b}!.json"';
 literal.upload.with.path = '/fixed/receipt{a,b}!.json';
 expect(lintFixture(literal.f).status).toBe(0);
 for (const exclusion of [false, true]) {
  const s = uploadFixture();
  for (const job of Object.values(s.f.documents['.github/workflows/ci.yml'].jobs)) {
   job.steps[0].with = { path: 'consumer' }; job.defaults = { run: { 'working-directory': 'consumer' } };
  }
  s.collector.steps[1].run = 'bun helper/producer.mjs --declaration scripts/tree-verdict.json --out "../!receipt.json"';
  s.upload.with.path = exclusion ? '!receipt.json' : './!receipt.json';
  const result = lintFixture(s.f);
  expect(result.status).toBe(exclusion ? 1 : 0);
  if (exclusion) expect(result.stderr).toContain('COVER_PRODUCER:');
 }
});
for (const reverse of [false, true]) test(`upload lint CLI checks mixed valid/invalid uploads, reverse=${reverse}`, () => {
 const s = uploadFixture(), invalid = structuredClone(s.upload);
 invalid.if = "${{ steps.other.outputs.receipt-created == 'true' }}";
 s.collector.steps.splice(reverse ? 2 : 3, 0, invalid);
 const result = lintFixture(s.f);
 expect(result.status).toBe(1); expect(result.stderr).toContain('COVER_PRODUCER:');
});
test('upload lint CLI refuses the output condition on another step in a traversed reusable workflow', () => {
 const s = uploadFixture('core');
 s.f.documents['.github/workflows/selftest-shards.yml'].jobs.shard.steps.push({ run: 'echo cleanup', if: s.upload.if });
 const result = lintFixture(s.f);
 expect(result.status).toBe(1); expect(result.stderr).toContain('COVER_PRODUCER:');
});
test('README collector YAML runs through lint CLI and its wrong producer binding refuses', () => {
 const text = readFileSync(new URL('./README.md', import.meta.url), 'utf8');
 const yaml = text.match(/## Collector:[\s\S]*?```yaml\n([\s\S]*?)\n```/)?.[1];
 expect(typeof yaml).toBe('string');
 for (const wrongID of [false, true]) {
  const f = workflowFixture('core'), collector = Bun.YAML.parse(yaml)['tree-verdict-receipt'];
  const tooling = collector.steps.find(step => step.id === 'tools');
  expect(tooling.uses).toBe('rig-c/core/.github/actions/tree-verdict@FULL_MERGED_CORE_SHA');
  tooling.uses = actionUses;
  f.documents['.github/workflows/ci.yml'].jobs['tree-verdict-receipt'] = collector;
  if (wrongID) collector.steps.find(step => step.uses === 'actions/upload-artifact@v4').if =
   "${{ steps.other.outputs.receipt-created == 'true' }}";
  const result = lintFixture(f);
  expect(result.status).toBe(wrongID ? 1 : 0);
  if (wrongID) expect(result.stderr).toContain('COVER_PRODUCER:');
 }
});
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
test('parts merge API name follows the YAML display name and excludes the required-check aggregator', () => {
 const f = workflowFixture('parts'), root = f.documents['.github/workflows/ci.yml'];
 root.jobs.test.name = 'selftest merge';
 root.jobs['test-status'] = { name: 'test', needs: ['test', 'tree-verdict-receipt'],
  if: '${{ always() }}', 'runs-on': 'ubuntu-latest', steps: [{ run: 'true' }] };
 f.declaration.jobs.merge.legs[0].apiName = 'selftest merge';
 refresh(f);
 expect(compileCoverage(f.declaration, f.read).coverage.jobs.merge.legs[0].apiName).toBe('selftest merge');
 expect(lintFixture(f).status).toBe(0);
 f.declaration.jobs.merge.legs[0].apiName = 'test';
 const result = lintFixture(f);
 expect(result.status).toBe(1);
 expect(result.stderr).toContain('COVER_MATRIX: leg inventory differs for merge');
});
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
