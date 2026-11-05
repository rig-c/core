import { test, expect } from 'bun:test';
import { lintWorkflows, type Declarations } from './lint_workflows.ts';
import { workflowFixture } from '../.github/actions/tree-verdict/fixtures.mjs';
function fixture(suite = 'selftest') {
  const declaration: Declarations = { schema: 'workflow-verdict-lint/1', defaultBranch: 'main', workflows: [{
    path: '.github/workflows/ci.yml', heavyJobs: ['suite'],
    guard: { job: 'tree-verdict', step: 'lookup', uses: './.github/actions/tree-verdict', sourceWorkflow: '.github/workflows/ci.yml' },
    publishes: [{ job: 'publish', step: 'publish', gateJob: 'gate', verdictOutput: 'verdict', passedValue: 'green',
      downloadStep: 'download', artifact: 'suite-proof', evidenceEnv: 'SUITE_RECEIPT', evidenceValue: '${{ runner.temp }}/proof/receipt.json',
      lifecycle: 'prepublishOnly', readerCommand: 'bun scripts/check-publish.ts', suiteScripts: [suite] }],
  }] };
  const doc = { name: 'fixture', on: { push: { branches: ['main'] }, pull_request: null }, jobs: {
    'tree-verdict': { 'runs-on': 'ubuntu-latest', outputs: { reused: '${{ steps.lookup.outputs.reused }}' }, steps: [
      { id: 'lookup', uses: './.github/actions/tree-verdict', with: { workflow: '.github/workflows/ci.yml' } } ] },
    suite: { needs: 'tree-verdict', if: "${{ needs.tree-verdict.outputs.reused != 'true' }}", uses: './.github/workflows/suite.yml' },
    gate: { 'runs-on': 'ubuntu-latest', outputs: { verdict: '${{ steps.proof.outputs.verdict }}' }, steps: [{ id: 'proof', run: 'bun scripts/prove.ts' }] },
    publish: { needs: 'gate', if: "${{ needs.gate.outputs.verdict == 'green' }}", 'runs-on': 'ubuntu-latest', steps: [
      { id: 'download', uses: 'actions/download-artifact@v4', with: { name: 'suite-proof', path: '${{ runner.temp }}/proof' } },
      { id: 'publish', run: 'npm publish --provenance --access public', env: { SUITE_RECEIPT: '${{ runner.temp }}/proof/receipt.json' } },
    ] },
  } };
  const pkg = { scripts: { [suite]: 'bun suite.ts', prepublishOnly: 'bun scripts/check-publish.ts' } };
  const read = (path: string) => path === 'package.json' ? JSON.stringify(pkg) : Bun.YAML.stringify(doc);
  return { declaration, doc, pkg, read };
}
test('positive declarations green for core/parts/pose/review script names', () => {
  for (const suite of ['selftest', 'selftest:pre', 'test:all', 'verify:unit']) {
    const f = fixture(suite); expect(lintWorkflows(f.declaration, f.read)).toEqual([]);
  }
});
test('WFL001 planted default-branch heavy job without guard is red', () => {
  const f = fixture(); f.doc.jobs.suite.if = '${{ always() }}';
  expect(lintWorkflows(f.declaration, f.read).join('')).toContain('WFL001_DEFAULT_PUSH_HEAVY_UNGUARDED');
  console.log('PLANT WFL001_DEFAULT_PUSH_HEAVY_UNGUARDED: exit=1; unguarded heavy rejected=1');
});

function partsMergeFixture(prefix = 'always() && ') {
  const f = fixture();
  f.declaration.workflows[0].heavyJobs = ['test'];
  f.declaration.workflows[0].publishes = [];
  // rig-c/parts f06f270dde2f53a0dd5f8e9fce71bb5fd9e4c950 jobs.test,
  // with only the adoption guard dependency and condition added.
  const doc = { on: f.doc.on, jobs: {
    'tree-verdict': f.doc.jobs['tree-verdict'],
    test: {
      needs: ['shard', 'tree-verdict'],
      if: `\${{ ${prefix}needs.tree-verdict.outputs.reused != 'true' }}`,
      'runs-on': 'ubuntu-latest', 'timeout-minutes': 25,
      steps: [
        { uses: 'actions/checkout@v4' },
        { uses: 'oven-sh/setup-bun@v2' },
        { run: 'bun install --frozen-lockfile' },
        { name: 'Check README scope and planted failures', run: 'bun run check:readme' },
        { run: 'bun run typecheck' },
        { run: 'bun run lint' },
        { uses: 'actions/download-artifact@v4', with: {
          pattern: 'selftest-shard-*', path: 'shards', 'merge-multiple': true,
        } },
        { name: 'Merge the shards into one selftest run', run: 'bun selftest.ts --merge shards' },
      ],
    },
  } };
  return { ...f, doc, read: () => Bun.YAML.stringify(doc) };
}

test('WFL001 parts merge accepts exactly the three guarded status forms', () => {
  for (const prefix of ['', 'always() && ', '!cancelled() && ']) {
    const f = partsMergeFixture(prefix);
    expect(lintWorkflows(f.declaration, f.read)).toEqual([]);
    // The bare expression is also valid without an Actions wrapper.
    f.doc.jobs.test.if = f.doc.jobs.test.if.slice(3, -2).trim();
    expect(lintWorkflows(f.declaration, f.read)).toEqual([]);
  }
});

test('WFL001 parts merge refuses every extra or alternative boolean clause by name', () => {
  const guard = "needs.tree-verdict.outputs.reused != 'true'";
  for (const expression of [
    `always() || ${guard}`, `!cancelled() || ${guard}`, `success() && ${guard}`,
    `${guard} && always()`, `always() && ${guard} && true`,
    `!cancelled() && ${guard} || true`, `${guard} || false`,
    "always() && needs.other.outputs.reused != 'true'",
  ]) {
    const f = partsMergeFixture();
    f.doc.jobs.test.if = `\${{ ${expression} }}`;
    expect(lintWorkflows(f.declaration, f.read)).toEqual([
      'WFL001_DEFAULT_PUSH_HEAVY_UNGUARDED: .github/workflows/ci.yml jobs.test: declared heavy job needs a fail-closed tree-verdict guard',
    ]);
  }
});

test('WFL001 always conjunction dispatches merge for missing or empty runtime reuse output', () => {
  const f = partsMergeFixture();
  expect(lintWorkflows(f.declaration, f.read)).toEqual([]);
  const merge = f.doc.jobs.test.steps.at(-1);
  expect(merge?.run).toBe('bun selftest.ts --merge shards');
  for (const output of [undefined, '', 'false', 'true']) {
    // Execute the fixture's actual accepted expression with the Actions missing
    // string value and status function supplied. This models job selection,
    // including failed shard needs; it does not run the parts selftest.
    const expression = f.doc.jobs.test.if.slice(3, -2).replace(
      'needs.tree-verdict.outputs.reused', JSON.stringify(output ?? ''),
    );
    const selected = new Function('always', `return (${expression});`)(() => true);
    const dispatched = selected ? [merge?.run] : [];
    expect(dispatched).toEqual(output === 'true' ? [] : ['bun selftest.ts --merge shards']);
  }
});

test('WFL001 status conjunction still requires the declared output and direct guard dependency', () => {
  const missingOutput = partsMergeFixture();
  missingOutput.doc.jobs['tree-verdict'].outputs.reused = '';
  expect(lintWorkflows(missingOutput.declaration, missingOutput.read).join('')).toContain('WFL001_DEFAULT_PUSH_HEAVY_UNGUARDED');
  const missingDependency = partsMergeFixture('!cancelled() && ');
  missingDependency.doc.jobs.test.needs = ['shard'];
  expect(lintWorkflows(missingDependency.declaration, missingDependency.read).join('')).toContain('WFL001_DEFAULT_PUSH_HEAVY_UNGUARDED');
});

test('WFL002 planted npm publish lifecycle without passed verdict is red', () => {
  const f = fixture(); f.doc.jobs.publish.if = '${{ always() }}';
  expect(lintWorkflows(f.declaration, f.read).join('')).toContain('WFL002_PUBLISH_SUITE_WITHOUT_VERDICT');
  console.log('PLANT WFL002_PUBLISH_SUITE_WITHOUT_VERDICT: exit=1; ungated publish rejected=1');
});
test('YAML flow mappings, aliases and block scripts parsed by native YAML', () => {
  const f = fixture(); f.declaration.workflows[0].publishes = [];
  const yaml = `on: [push, pull_request]\nx: &lookup {id: lookup, uses: './.github/actions/tree-verdict', with: {workflow: '.github/workflows/ci.yml'}}\njobs:\n  tree-verdict:\n    outputs: {reused: '\${{ steps.lookup.outputs.reused }}'}\n    steps: [*lookup]\n  suite:\n    needs: [tree-verdict]\n    if: "\${{ needs.tree-verdict.outputs.reused != 'true' }}"\n    steps:\n      - run: |\n          echo 'if: misleading text'\n`;
  expect(lintWorkflows(f.declaration, () => yaml)).toEqual([]);
});
test('malformed YAML, multi-document YAML and missing declarations fail closed', () => {
  const f = fixture();
  for (const yaml of ['jobs: [', 'on: push\n---\njobs: {}', 'jobs: {}']) expect(lintWorkflows(f.declaration, () => yaml)[0]).toContain('WFL000');
  f.declaration.workflows = []; expect(lintWorkflows(f.declaration, f.read)[0]).toContain('WFL000');
});
test('tag-only workflow excludes WFL001; default wildcard includes it', () => {
  const f = fixture(); f.doc.jobs.suite.if = 'false';
  expect(lintWorkflows(f.declaration, path => path === 'package.json' ? JSON.stringify(f.pkg) : Bun.YAML.stringify({ ...f.doc, on: { push: { tags: ['v*'] } } }))).toEqual([]);
  expect(lintWorkflows(f.declaration, path => path === 'package.json' ? JSON.stringify(f.pkg) : Bun.YAML.stringify({ ...f.doc, on: { push: { branches: ['m*'] } } }))[0]).toContain('WFL001');
});
test('missing receipt environment, direct suite hook, ignored lifecycle and download failure refuse', () => {
  for (const plant of ['env', 'hook', 'ignore-scripts', 'download', 'needs']) {
    const f = fixture();
    if (plant === 'env') f.doc.jobs.publish.steps[1].env = { SUITE_RECEIPT: '' };
    if (plant === 'hook') f.pkg.scripts.prepublishOnly = 'bun run selftest';
    if (plant === 'ignore-scripts') f.doc.jobs.publish.steps[1] = { id: 'publish', run: 'npm publish --ignore-scripts', env: { SUITE_RECEIPT: '${{ runner.temp }}/proof/receipt.json' } };
    if (plant === 'download') f.doc.jobs.publish.steps.reverse();
    if (plant === 'needs') f.doc.jobs.publish.needs = 'other';
    expect(lintWorkflows(f.declaration, f.read).join('')).toContain('WFL002');
  }
});
test('missing heavy job and empty output are refused', () => {
  const f = fixture(); f.declaration.workflows[0].heavyJobs = ['missing'];
  expect(lintWorkflows(f.declaration, f.read)[0]).toContain('WFL000');
  const g = fixture(); g.doc.jobs['tree-verdict'].outputs.reused = '';
  expect(lintWorkflows(g.declaration, g.read)[0]).toContain('WFL001');
});


test('new npm publish step cannot omit publishes inventory', () => {
  const f = fixture(); f.declaration.workflows[0].publishes = [];
  expect(lintWorkflows(f.declaration, f.read).join('')).toContain('npm publish step missing explicit publishes declaration');
  console.log('PLANT omitted publish declaration: exit=1; rejected=1');
});

test('covering lifecycle consumer with compiled source and live action proof is green; dropped proof or commands is red', () => {
  const f = fixture(), source = workflowFixture('parts');
  source.declaration.workflow = '.github/workflows/source.yml';
  f.declaration.workflows[0].publishes = [{ job: 'publish', step: 'publish', verdictStep: 'download',
    declaration: 'scripts/tree-verdict.json', actionUses: './pinned/.github/actions/tree-verdict', lifecycle: 'prepublishOnly',
    readerCommand: 'node scripts/prepublish.cjs', evidenceEnv: 'TREE_VERDICT_PATH' }];
  Object.assign(f.pkg.scripts, JSON.parse(source.files['package.json']).scripts, { prepublishOnly: 'node scripts/prepublish.cjs' });
  const doc = structuredClone(f.doc) as unknown as Record<string, unknown>;
  const jobs = doc.jobs as Record<string, { steps: Record<string, unknown>[] }>;
  jobs.publish.steps[0] = { id: 'download', uses: './pinned/.github/actions/tree-verdict', with: { declaration: 'scripts/tree-verdict.json', purpose: 'publish' } };
  jobs.publish.steps[1].env = { TREE_VERDICT_PATH: '${{ steps.download.outputs.verdict-path }}' };
  const read = (p: string) => p === 'scripts/tree-verdict.json' ? JSON.stringify(source.declaration) : p === 'package.json' ? JSON.stringify(f.pkg) : p === '.github/workflows/source.yml' ? source.files['.github/workflows/ci.yml'] : Bun.YAML.stringify(doc);
  expect(lintWorkflows(f.declaration, read)).toEqual([]);
  const commands = source.declaration.commands as string[];
  commands.pop(); expect(lintWorkflows(f.declaration, read).join('')).toContain('COVER_COMMAND');
  commands.push('bun run selftest'); jobs.publish.steps[0].if = '${{ false }}';
  expect(lintWorkflows(f.declaration, read).join('')).toContain('WFL002');
});

test('real lint CLI positive and named red plants report actual exits', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const { spawnSync } = await import('node:child_process');
  if (!process.env.TMPDIR) throw new Error('dedicated TMPDIR required');
  for (const plant of ['positive', 'always', 'uncancelled', 'or', 'heavy', 'publish', 'omitted']) {
    const f = fixture(), root = mkdtempSync(join(process.env.TMPDIR, 'workflow-cli-'));
    if (plant === 'heavy') f.doc.jobs.suite.if = '${{ always() }}';
    if (plant === 'always') f.doc.jobs.suite.if = "${{ always() && needs.tree-verdict.outputs.reused != 'true' }}";
    if (plant === 'uncancelled') f.doc.jobs.suite.if = "${{ !cancelled() && needs.tree-verdict.outputs.reused != 'true' }}";
    if (plant === 'or') f.doc.jobs.suite.if = "${{ always() || needs.tree-verdict.outputs.reused != 'true' }}";
    if (plant === 'publish') f.doc.jobs.publish.if = '${{ always() }}';
    if (plant === 'omitted') f.declaration.workflows[0].publishes = [];
    mkdirSync(join(root, '.github/workflows'), { recursive: true });
    writeFileSync(join(root, '.github/workflows/ci.yml'), Bun.YAML.stringify(f.doc));
    writeFileSync(join(root, 'package.json'), JSON.stringify(f.pkg));
    const config = join(root, 'declarations.json'); writeFileSync(config, JSON.stringify(f.declaration));
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('./lint_workflows.ts', import.meta.url)), config, root], { encoding: 'utf8' });
    writeFileSync(join(root, 'stdout.log'), result.stdout); writeFileSync(join(root, 'stderr.log'), result.stderr);
    const accepted = ['positive', 'always', 'uncancelled'].includes(plant);
    expect(result.status).toBe(accepted ? 0 : 1);
    if (plant === 'heavy' || plant === 'or') expect(result.stderr).toContain('WFL001_DEFAULT_PUSH_HEAVY_UNGUARDED');
    if (plant === 'publish' || plant === 'omitted') expect(result.stderr).toContain('WFL002_PUBLISH_SUITE_WITHOUT_VERDICT');
    console.log(`PLANT workflow-lint CLI ${plant}: exit=${result.status}; rejected=${accepted ? 0 : 1}`);
  }
});

test('modern publish requires real npm hook: actual CLI positive and ordinary-script negative', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const { spawnSync } = await import('node:child_process');
  if (!process.env.TMPDIR) throw new Error('dedicated TMPDIR required');
  for (const lifecycle of ['prepublishOnly', 'verify-publish']) {
    const source = workflowFixture('parts');
    const readerCommand = 'node scripts/prepublish.cjs';
    const doc = Bun.YAML.parse(source.files['.github/workflows/ci.yml']) as { jobs: Record<string, unknown> };
    doc.jobs.publish = { 'runs-on': 'ubuntu-latest', steps: [
      { id: 'reuse', uses: './pinned/.github/actions/tree-verdict', with: { declaration: 'scripts/tree-verdict.json', purpose: 'publish' } },
      { id: 'publish', run: 'npm publish --provenance --access public', env: { TREE_VERDICT_PATH: '${{ steps.reuse.outputs.verdict-path }}' } },
    ] };
    const pkg = JSON.parse(source.files['package.json']) as { scripts: Record<string, string> };
    pkg.scripts[lifecycle] = readerCommand;
    source.files['package.json'] = JSON.stringify(pkg);
    source.files['.github/workflows/ci.yml'] = Bun.YAML.stringify(doc);
    const inventory: Declarations = { schema: 'workflow-verdict-lint/1', defaultBranch: 'main', workflows: [{
      path: '.github/workflows/ci.yml', heavyJobs: [], publishes: [{
        job: 'publish', step: 'publish', verdictStep: 'reuse', declaration: 'scripts/tree-verdict.json',
        actionUses: './pinned/.github/actions/tree-verdict', lifecycle, readerCommand, evidenceEnv: 'TREE_VERDICT_PATH',
      }],
    }] };
    const dir = mkdtempSync(join(process.env.TMPDIR, 'npm-hook-cli-'));
    for (const [path, text] of Object.entries(source.files)) {
      mkdirSync(join(dir, path, '..'), { recursive: true });
      writeFileSync(join(dir, path), text);
    }
    const config = join(dir, 'lint-declarations.json');
    writeFileSync(config, JSON.stringify(inventory));
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('./lint_workflows.ts', import.meta.url)), config, dir], { encoding: 'utf8' });
    writeFileSync(join(dir, 'stdout.log'), result.stdout);
    writeFileSync(join(dir, 'stderr.log'), result.stderr);
    const hooks = ['prepublishOnly', 'prepare', 'prepack'].filter(hook => Object.hasOwn(pkg.scripts, hook));
    console.log(`PLANT modern hook ${lifecycle}: CLI exit=${result.status}; actual hooks=${JSON.stringify(hooks)}`);
    expect(hooks).toEqual(lifecycle === 'prepublishOnly' ? ['prepublishOnly'] : []);
    expect(result.status).toBe(lifecycle === 'prepublishOnly' ? 0 : 1);
    if (lifecycle === 'verify-publish') expect(result.stderr).toContain('WFL002_PUBLISH_SUITE_WITHOUT_VERDICT');
  }
});
