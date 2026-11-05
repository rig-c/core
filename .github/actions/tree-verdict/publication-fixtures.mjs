/** Prospective publication wiring only. Source snapshots retain their full SHA. */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { workflowFixture } from './fixtures.mjs';
import { inspectPublication } from './publication.mjs';
const path = '.github/workflows/release.yml';
export const actionUses = 'rig-c/core/.github/actions/tree-verdict@4abdcdd0dacba90a4f57f08ef9b06390e915aa50';
export const hash = text => createHash('sha256').update(text).digest('hex');
const output = (id, name) => `\${{ steps.${id}.outputs.${name} }}`;
// Preserve snapshot comments, quoting and script bytes. Only the new wiring is
// rendered; existing steps move as source text. Mutant fixtures use refresh().
function wiredReleaseText(original, release, publishing, relay, proof, reader, publishSteps) {
  const checkout = original.indexOf("      - uses: actions/checkout@v4\n        if: ${{ steps.target.outputs.publish == 'true' }}");
  const boundary = original.lastIndexOf('      # Everything below', checkout);
  if (checkout < 0 || boundary < 0) throw new Error('snapshot publication boundary missing');
  const nextJob = original.indexOf('  # The same confirmation, on demand', checkout);
  const end = nextJob < 0 ? original.length : nextJob;
  let moved = original.slice(boundary, end);
  const firstPublish = moved.indexOf('      - name: ' + publishSteps[0].name + '\n');
  if (firstPublish < 0) throw new Error('snapshot publish step missing');
  // Insert the new steps before the existing publication commentary.
  const insertion = moved.lastIndexOf('\n\n', firstPublish) + 2;
  const preparation = moved.slice(0, insertion)
    .replaceAll("        if: ${{ steps.target.outputs.publish == 'true' }}\n", '')
    .replace(/          ref: \$\{\{ steps\.target\.outputs\.sha(?: \|\| steps\.target\.outputs\.tag)? \}\}/,
      '          ref: ${{ needs.release.outputs.sha }}');
  const wiring = Bun.YAML.stringify({ steps: [relay, proof, reader] }, null, 2).split('\n').slice(1)
    .filter((line, index, lines) => index < lines.length - 1 || line.length)
    .map(line => '    ' + line).join('\n') + '\n\n';
  moved = preparation + wiring + moved.slice(insertion);
  for (const step of publishSteps) {
    const marker = '      - name: ' + step.name + '\n';
    const start = moved.indexOf(marker);
    if (start < 0) throw new Error('snapshot publish name missing');
    const next = moved.indexOf('\n      - ', start + marker.length);
    const stop = next < 0 ? moved.length : next + 1;
    let block = moved.slice(start, stop);
    block = block.replace(marker, marker + '        id: ' + step.id + '\n');
    const env = '          TREE_VERDICT_PATH: ${{ steps.reuse.outputs.verdict-path }}\n' +
      '          TREE_VERDICT_TOOLS: ${{ steps.reuse.outputs.tooling-path }}\n';
    block = block.includes('        env:\n') ? block.replace('        env:\n', '        env:\n' + env) :
      block.replace('        run:', '        env:\n' + env + '        run:');
    moved = moved.slice(0, start) + block + moved.slice(stop);
  }
  let target = original.slice(0, boundary);
  const stepHeader = target.indexOf('    steps:\n', target.indexOf('\n  release:\n'));
  const outputs = Bun.YAML.stringify({ outputs: release.outputs }, null, 2).trimEnd().split('\n').map(line => '    ' + line).join('\n') + '\n';
  target = target.slice(0, stepHeader) + outputs + target.slice(stepHeader);
  const { steps, ...jobHeader } = publishing;
  const header = Bun.YAML.stringify({ publish: jobHeader }, null, 2).trimEnd().split('\n').map(line => '  ' + line).join('\n');
  return target + header + '\n    steps:\n' + moved + original.slice(end);
}
export function publicationFixture(repo, wired = true) {
  const sources = JSON.parse(readFileSync(new URL('./publication-fixtures/sources.json', import.meta.url), 'utf8')).filter(row => row.repo === repo);
  const originals = Object.fromEntries(sources.map(row => {
    const text = readFileSync(new URL(`./publication-fixtures/${repo}/${row.path}`, import.meta.url), 'utf8');
    if (hash(text) !== row.sha256) throw new Error(`immutable source differs: ${repo}/${row.path}`);
    return [row.path, text];
  }));
  const raw = Bun.YAML.parse(originals[path]), pkg = JSON.parse(originals['package.json']);
  const release = raw.jobs.release;
  const publishSteps = release.steps.filter(step => typeof step.run === 'string' && inspectPublication(step.run).publishes.length);
  // The CI below is explicitly generated fixture coverage, NOT either raw CI.
  // Review adoption (#407) must provide real wrapped literal scripts and coverage.
  const source = workflowFixture('parts');
  const coverage = source.declaration;
  const fixtureScripts = JSON.parse(source.files['package.json']).scripts;
  if (repo === 'review') {
    fixtureScripts['fixture-test'] = 'bun test';
    fixtureScripts['fixture-check'] = 'bun run check -- examples/demo/review.json';
    fixtureScripts['fixture-build'] = 'bun run build';
    fixtureScripts['fixture-smoke'] = 'bun run smoke';
    const commands = ['bun run typecheck', 'bun run fixture-test', 'bun run fixture-build', 'bun run fixture-check', 'bun run fixture-smoke'];
    coverage.commands = commands; coverage.chain = commands.join(' && ');
    coverage.covers = Object.fromEntries(commands.map(command => [command, ['merge']]));
    coverage.jobs = { merge: coverage.jobs.merge };
    delete source.documents['.github/workflows/ci.yml'].jobs.shard;
    delete source.documents['.github/workflows/ci.yml'].jobs.test.needs;
    source.documents['.github/workflows/ci.yml'].jobs['tree-verdict-receipt'].needs = ['test'];
    source.documents['.github/workflows/ci.yml'].jobs.test.steps = [
      { uses: 'actions/checkout@v4' }, ...commands.map(command => ({ run: command })),
    ];
  }
  const files = { ...originals, '.github/workflows/ci.yml': Bun.YAML.stringify(source.documents['.github/workflows/ci.yml']),
    'scripts/tree-verdict.json': JSON.stringify(coverage) };
  let jobId = 'release';
  if (wired) {
    jobId = 'publish';
    const firstCheckout = release.steps.findIndex(step => step.uses === 'actions/checkout@v4' && step.if?.includes('steps.target.outputs.publish'));
    const moved = release.steps.splice(firstCheckout);
    const preparation = moved.filter(step => !publishSteps.includes(step));
    for (const step of preparation) {
      if (!step.name?.startsWith('Confirm')) delete step.if;
      if (step.uses === 'actions/checkout@v4') step.with.ref = '${{ needs.release.outputs.sha }}';
    }
    const outputNames = ['publish', 'sha', 'tag', 'canonical', 'rig_parts', 'spine_parts'];
    release.outputs = Object.fromEntries(outputNames.map(name => [name, output('target', name)]));
    const relay = { id: 'target', env: Object.fromEntries(outputNames.map(name => [name.toUpperCase(), `\${{ needs.release.outputs.${name} }}`])),
      run: outputNames.map(name => `echo "${name}=$${name.toUpperCase()}" >> "$GITHUB_OUTPUT"`).join('\n') };
    const proof = { id: 'reuse', uses: actionUses, with: { declaration: 'scripts/tree-verdict.json', purpose: 'publish' } };
    const reader = { id: 'publication-reader', env: { TREE_VERDICT_TOOLS: output('reuse', 'tooling-path'), TREE_VERDICT_PATH: output('reuse', 'verdict-path') },
      run: 'node "$TREE_VERDICT_TOOLS/lifecycle.mjs" --declaration scripts/tree-verdict.json --verdict-path "$TREE_VERDICT_PATH"' };
    for (const [index, step] of publishSteps.entries()) {
      step.id = `publish-${index}`;
      step.env = { ...step.env, TREE_VERDICT_PATH: output('reuse', 'verdict-path'), TREE_VERDICT_TOOLS: output('reuse', 'tooling-path') };
    }
    // Confirmation retains its body and output conditions but runs after publish.
    const after = preparation.filter(step => step.name?.startsWith('Confirm'));
    raw.jobs.publish = { 'runs-on': release['runs-on'], 'timeout-minutes': release['timeout-minutes'],
      permissions: { ...release.permissions, actions: 'read' }, needs: 'release',
      if: "${{ needs.release.outputs.publish == 'true' }}", steps: [
        ...preparation.filter(step => !after.includes(step)), relay, proof, reader, ...publishSteps, ...after,
      ] };
    // The original hook chain is retained as metadata. Review's wrapped chain is
    // a prospective adoption input and differs explicitly from the raw chain.
    files['fixture-original-hook.txt'] = pkg.scripts.prepublishOnly;
    Object.assign(pkg.scripts, fixtureScripts, { prepublishOnly: 'node scripts/prepublish.cjs' });
    files['scripts/prepublish.cjs'] = `const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const declaration = path.join(__dirname, 'tree-verdict.json');
const d = JSON.parse(fs.readFileSync(declaration, 'utf8'));
if (typeof d.chain !== 'string' || !d.chain.trim()) process.exit(1);
const helper = process.env.TREE_VERDICT_TOOLS && path.join(process.env.TREE_VERDICT_TOOLS, 'lifecycle.mjs');
const result = helper && fs.existsSync(helper)
  ? spawnSync('node', [helper, '--declaration', declaration], {stdio: 'inherit'})
  : spawnSync('/bin/sh', ['-c', d.chain], {stdio: 'inherit'});
process.exit(Number.isInteger(result.status) ? result.status : 1);
`;
    files['package.json'] = JSON.stringify(pkg);
    files[path] = wiredReleaseText(originals[path], release, raw.jobs.publish, relay, proof, reader, publishSteps);
  } else {
    // Coverage is prospective fixture input even for SHAPE; hook/proof/reader
    // wiring remains absent. This isolates syntax findings from adoption work.
    Object.assign(pkg.scripts, fixtureScripts);
    files['package.json'] = JSON.stringify(pkg);
  }
  const publishes = publishSteps.map(step => {
    const analysis = inspectPublication(step.run);
    return { job: jobId, step: { name: step.name }, verdictStep: 'reuse', declaration: 'scripts/tree-verdict.json', actionUses,
      lifecycle: 'prepublishOnly', readerCommand: 'node scripts/prepublish.cjs', evidenceEnv: 'TREE_VERDICT_PATH',
      invocations: analysis.publishes.map((publish, ordinal) => {
        const pack = analysis.packs.find(candidate => candidate.variable);
        return pack ? { ordinal, kind: 'tarball', producer: { step: { name: step.name }, variable: pack.variable, command: pack.command } } : { ordinal, kind: 'folder' };
      }) };
  });
  const declaration = { schema: 'workflow-verdict-lint/1', defaultBranch: 'main', workflows: [{ path, heavyJobs: [], publishes,
    publicationReaders: [{ job: jobId, step: 'publication-reader', verdictStep: 'reuse', declaration: 'scripts/tree-verdict.json' }] }] };
  return { repo, sources, originals, files, doc: raw, pkg, declaration, publishSteps,
    refresh() { files[path] = Bun.YAML.stringify(raw); files['package.json'] = JSON.stringify(pkg); },
    read(file) { if (!(file in files)) throw new Error(`fixture input missing: ${file}`); return files[file]; } };
}

/** Two valid prospective contracts; the second lacks its own job reader. */
export function mixedPublicationFixture(repo) {
  const f = publicationFixture(repo);
  const command = 'bun run secondary-check';
  f.pkg.scripts['secondary-check'] = 'node -e "process.exit(19)"';
  const declaration = { schema: 'tree-verdict-lifecycle/2', workflow: '.github/workflows/secondary-ci.yml', gate: 'secondary-full/2',
    chain: command, commands: [command], covers: { [command]: ['secondary'] },
    jobs: { secondary: { path: ['validate-secondary'], role: 'plain', legs: [{ matrix: {}, apiName: 'validate-secondary' }] } },
    producer: { job: 'secondary-receipt', step: 'receipt' }, checkoutPolicy: 'event-sha' };
  const checkout = { uses: 'actions/checkout@v4' };
  const doc = { on: { push: { branches: ['main'] } }, jobs: {
    'validate-secondary': { 'runs-on': 'ubuntu-latest', steps: [checkout, { run: command }] },
    'secondary-receipt': { 'runs-on': 'ubuntu-latest', if: '${{ success() }}', needs: 'validate-secondary', steps: [checkout,
      { id: 'receipt', run: 'bun helper/.github/actions/tree-verdict/producer.mjs --declaration scripts/secondary-verdict.json --out "$RUNNER_TEMP/secondary-receipt.json"' }] },
  } };
  f.files[declaration.workflow] = Bun.YAML.stringify(doc);
  f.files['scripts/secondary-verdict.json'] = JSON.stringify(declaration);
  const entry = f.declaration.workflows[0].publishes.at(-1);
  const proof = { id: 'reuse-secondary', uses: entry.actionUses, with: { purpose: 'publish', declaration: 'scripts/secondary-verdict.json' } };
  f.doc.jobs.publish.steps.splice(f.doc.jobs.publish.steps.findIndex(step => step.id === 'publication-reader'), 0, proof);
  entry.verdictStep = 'reuse-secondary'; entry.declaration = 'scripts/secondary-verdict.json';
  const alias = f.publishSteps.at(-1);
  alias.env.TREE_VERDICT_PATH = '${{ steps.reuse-secondary.outputs.verdict-path }}';
  alias.env.TREE_VERDICT_TOOLS = '${{ steps.reuse-secondary.outputs.tooling-path }}';
  f.refresh();
  return f;
}
