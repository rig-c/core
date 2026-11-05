// Static, cheap test workflows only. No production workflow is modified or executed.
export function workflowFixture(style = 'parts') {
  const checkout = { uses: 'actions/checkout@v4' };
  const shard = { 'runs-on': 'ubuntu-latest', name: 'selftest shard ${{ matrix.shard }}', strategy: { matrix: { shard: ['1','2','3','4'] } }, steps: [checkout, { run: 'bun selftest.ts --shard ${{ matrix.shard }} --record shards/shard-${{ matrix.shard }}.json', 'continue-on-error': true }] };
  const merge = { 'runs-on': 'ubuntu-latest', needs: 'shard', if: '${{ always() }}', steps: [checkout, { run: 'bun run typecheck' }, { run: 'bun run lint' }, { run: 'bun selftest.ts --merge "$RUNNER_TEMP"/tally/*.json' }] };
  const collector = { 'runs-on': 'ubuntu-latest', needs: ['shard','test'], if: '${{ success() }}', steps: [checkout, { id: 'receipt', run: 'bun helper/.github/actions/tree-verdict/producer.mjs --declaration scripts/tree-verdict.json --out "$RUNNER_TEMP/receipt.json"' }] };
  const root = { name: 'ci', on: { push: { branches: ['main'] }, pull_request: null }, jobs: { shard, test: merge, 'tree-verdict-receipt': collector } };
  const prefix = style === 'core' ? ['selftest'] : [];
  if (style === 'core') {
    root.jobs = { selftest: { uses: './.github/workflows/selftest-shards.yml' }, 'tree-verdict-receipt': { ...collector, needs: ['selftest'] } };
    shard.name = 'shard ${{ matrix.shard }}'; shard.strategy.matrix.shard = [1,2,3,4,5,6];
    shard.steps = [{ ...checkout, with: { ref: '${{ inputs.ref }}' } }, { run: 'bun run selftest', 'continue-on-error': true, env: { RIGC_SHARD: '${{ matrix.shard }}/${{ strategy.job-total }}' } }];
    merge.steps[0] = { ...checkout, with: { ref: '${{ inputs.ref }}' } }; merge.if = '${{ !cancelled() }}';
  }
  const declaration = { schema: 'tree-verdict-lifecycle/2', workflow: '.github/workflows/ci.yml', gate: `${style}-full/2`,
    chain: 'bun run typecheck && bun run lint && bun run selftest', commands: ['bun run typecheck','bun run lint','bun run selftest'],
    covers: { 'bun run typecheck': ['merge'], 'bun run lint': ['merge'], 'bun run selftest': ['shards','merge'] },
    jobs: { shards: { path: [...prefix,'shard'], role: 'shard', legs: shard.strategy.matrix.shard.map(value => ({ matrix: { shard: value }, apiName: `${style === 'core' ? 'selftest / shard' : 'selftest shard'} ${value}` })) },
      merge: { path: [...prefix,'test'], role: 'merge', legs: [{ matrix: {}, apiName: style === 'core' ? 'selftest / test' : 'test' }] } },
    producer: { job: 'tree-verdict-receipt' }, checkoutPolicy: 'event-sha' };
  const documents = { '.github/workflows/ci.yml': root };
  if (style === 'core') documents['.github/workflows/selftest-shards.yml'] = { on: { workflow_call: { inputs: { ref: { default: '', type: 'string' } } } }, jobs: { shard, test: merge } };
  const files = { 'package.json': JSON.stringify({ scripts: { typecheck: 'tsc --noEmit', lint: 'eslint .', selftest: 'bun selftest.ts' } }), 'scripts/tree-verdict.json': JSON.stringify(declaration) };
  for (const [path, doc] of Object.entries(documents)) files[path] = Bun.YAML.stringify(doc);
  return { declaration, documents, files, read: path => { if (!(path in files)) throw new Error(`missing fixture ${path}`); return files[path]; } };
}
