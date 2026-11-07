import { test, expect } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { inspectPublication } from './publication.mjs';
import { publicationFixture, mixedPublicationFixture, partsMainFixture, reviewMainFixture, wireCollectorUpload, hash } from './publication-fixtures.mjs';
import { stable } from './coverage.mjs';
import { compileCoverage } from './planner.mjs';
import { lintWorkflows } from '../../../scripts/lint_workflows.ts';
const lint = fileURLToPath(new URL('../../../scripts/lint_workflows.ts', import.meta.url));
function cli(f, label) {
  if (!process.env.TMPDIR) throw new Error('dedicated TMPDIR required');
  const root = mkdtempSync(join(process.env.TMPDIR, 'publication-'));
  for (const [path, text] of Object.entries(f.files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  const config = join(root, 'inventory.json');
  writeFileSync(config, JSON.stringify(f.declaration));
  const result = spawnSync(process.execPath, [lint, config, root], { encoding: 'utf8' });
  writeFileSync(join(root, 'stdout.log'), result.stdout);
  writeFileSync(join(root, 'stderr.log'), result.stderr);
  console.log(`PUBLICATION ${label}: CLI exit=${result.status}`);
  return result;
}
for (const repo of ['parts', 'review']) {
  test(`${repo} immutable SHAPE recognizes real bodies and refuses only missing wiring`, () => {
    const f = publicationFixture(repo, false);
    expect(f.files['.github/workflows/release.yml']).toBe(f.originals['.github/workflows/release.yml']);
    const errors = lintWorkflows(f.declaration, f.read);
    expect(errors.length).toBeGreaterThan(0);
    for (const error of errors) expect(error).toMatch(/: (PUBLICATION_READER_WIRING|PUBLISH_PROOF_WIRING|PUBLISH_HOOK_WIRING):/);
    const result = cli(f, `${repo} raw SHAPE`);
    expect(result.status).toBe(1);
    expect(result.stderr).not.toContain('PUBLICATION_SYNTAX');
  });
  test(`${repo} prospective split-job publication lint is green with byte-identical helpers and publish bodies`, () => {
    const f = publicationFixture(repo);
    const original = Bun.YAML.parse(f.originals['.github/workflows/release.yml']);
    const before = original.jobs.release.steps.filter(step => step.name?.startsWith('Publish')).map(step => step.run);
    expect(f.publishSteps.map(step => step.run)).toEqual(before);
    const serialized = Bun.YAML.parse(f.files['.github/workflows/release.yml']);
    expect(serialized.jobs.publish.steps.filter(step => step.name?.startsWith('Publish')).map(step => step.run)).toEqual(before);
    expect(stable(serialized)).toBe(stable(f.doc));
    const comments = text => text.split('\n').filter(line => line.trimStart().startsWith('#'));
    expect(comments(f.files['.github/workflows/release.yml'])).toEqual(comments(f.originals['.github/workflows/release.yml']));
    expect(hash(f.files['scripts/alias_tarball.ts'])).toBe(hash(f.originals['scripts/alias_tarball.ts']));
    expect(lintWorkflows(f.declaration, f.read)).toEqual([]);
    expect(cli(f, `${repo} FULLY WIRED publication scope`).status).toBe(0);
    const job = f.doc.jobs.publish;
    expect(job.if).toBe("${{ needs.release.outputs.publish == 'true' }}");
    const reader = job.steps.find(step => step.id === 'publication-reader');
    expect(reader.if).toBeUndefined();
    for (const step of job.steps.filter(step => step.uses === 'actions/checkout@v4' || step.uses === 'oven-sh/setup-bun@v2' || step.name === 'Install dependencies')) expect(step.if).toBeUndefined();
    // A no-cut output skips the whole job. No reader/gate execution is claimed.
    const selected = new Function(`return (${job.if.slice(3, -2).replace('needs.release.outputs.publish', "'false'")});`)();
    expect({ status: selected ? 'run' : 'skipped', readerRuns: Number(selected) }).toEqual({ status: 'skipped', readerRuns: 0 });
  });
}
const reader = f => f.doc.jobs.publish.steps.find(step => step.id === 'publication-reader');
const alias = f => f.publishSteps.at(-1);
const entry = f => f.declaration.workflows[0].publishes.at(-1);

function coreReaderFixture() {
  const f = publicationFixture('parts');
  f.pkg.scripts.prepublishOnly = 'bun scripts/prepublish_gate.ts';
  f.declaration.workflows[0].publicationReaders[0].kind = 'core-prepublish';
  reader(f).run = 'bun scripts/prepublish_gate.ts';
  for (const item of f.declaration.workflows[0].publishes) {
    item.lifecycle = 'prepublishOnly';
    item.readerCommand = 'bun scripts/prepublish_gate.ts';
  }
  f.refresh();
  return f;
}

test('core-prepublish named reader accepts its exact unconditional hook before every publication', () => {
  const f = coreReaderFixture();
  expect(lintWorkflows(f.declaration, f.read)).toEqual([]);
  expect(cli(f, 'core named reader').status).toBe(0);
});

test('core-prepublish refuses a consistently substituted valid secondary declaration', () => {
  for (const path of ['scripts/secondary-verdict.json', 'scripts/tree-verdict.json']) {
    const f = mixedPublicationFixture('parts');
    const inventory = f.declaration.workflows[0];
    const secondary = f.files['scripts/secondary-verdict.json'];
    f.files[path] = secondary;
    if (path === 'scripts/tree-verdict.json') {
      const workflow = Bun.YAML.parse(f.files['.github/workflows/secondary-ci.yml']);
      workflow.jobs['secondary-receipt'].steps[1].run = workflow.jobs['secondary-receipt'].steps[1].run.replace(
        'scripts/secondary-verdict.json', path);
      f.files['.github/workflows/secondary-ci.yml'] = Bun.YAML.stringify(workflow);
    }
    const proof = f.doc.jobs.publish.steps.find(step => step.id === 'reuse-secondary');
    proof.with.declaration = path;
    inventory.publicationReaders[0] = { ...inventory.publicationReaders[0], kind: 'core-prepublish',
      declaration: path, verdictStep: 'reuse-secondary' };
    f.pkg.scripts.prepublishOnly = 'bun scripts/prepublish_gate.ts';
    reader(f).run = 'bun scripts/prepublish_gate.ts';
    reader(f).env = { TREE_VERDICT_TOOLS: '${{ steps.reuse-secondary.outputs.tooling-path }}',
      TREE_VERDICT_PATH: '${{ steps.reuse-secondary.outputs.verdict-path }}' };
    for (const item of inventory.publishes) {
      item.declaration = path; item.verdictStep = 'reuse-secondary';
      item.lifecycle = 'prepublishOnly'; item.readerCommand = 'bun scripts/prepublish_gate.ts';
    }
    for (const step of f.publishSteps) step.env.TREE_VERDICT_PATH = '${{ steps.reuse-secondary.outputs.verdict-path }}';
    f.refresh();
    const result = cli(f, `core substituted contract ${path}`);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('CORE_READER_CONTRACT');
    expect(result.stderr).not.toContain('COVER_');
  }
});

for (const [name, plant] of Object.entries({
  conditional: f => { reader(f).if = '${{ success() }}'; },
  'ignored failure': f => { reader(f)['continue-on-error'] = true; },
  'extra argument': f => { reader(f).run += ' --skip'; },
  'swallowed nonzero': f => { reader(f).run += ' || true'; },
  'after pack or publish': f => { const steps = f.doc.jobs.publish.steps; const before = reader(f); steps.splice(steps.indexOf(before), 1); steps.push(before); },
  'wrong named kind': f => { f.declaration.workflows[0].publicationReaders[0].kind = 'other'; },
  'mixed hook contracts': f => { entry(f).readerCommand = 'bun scripts/other.ts'; },
})) test(`core-prepublish named reader refuses ${name}`, () => {
  const f = coreReaderFixture();
  plant(f); f.refresh();
  expect(lintWorkflows(f.declaration, f.read).join('\n')).toContain('PUBLICATION_READER_WIRING');
});

test('helper admits a fixed scoped literal and refuses variables, substitutions and malformed scoped names', () => {
  for (const name of ['@sample/parts', '"$ALIAS"', '@sample/$ALIAS', '"$(echo alias)"', '@sample/parts/extra', '@/parts']) {
    const f = publicationFixture('parts');
    const step = alias(f), producer = entry(f).invocations[0].producer;
    const actual = /--name ([\w-]+)/.exec(step.run)?.[1];
    expect(actual).toBeDefined();
    step.run = step.run.replace(`--name ${actual}`, `--name ${name}`);
    producer.command = producer.command.replace(`--name ${actual}`, `--name ${name}`);
    f.refresh();
    const faults = lintWorkflows(f.declaration, f.read);
    if (name === '@sample/parts') expect(faults).toEqual([]);
    else expect(faults.join('\n')).toContain('PUBLICATION_SYNTAX');
  }
});

const plants = {
  'reader after publication': f => { const all = f.doc.jobs.publish.steps, step = reader(f); all.splice(all.indexOf(step), 1); all.push(step); },
  'conditional reader': f => { reader(f).if = "${{ steps.target.outputs.publish == 'true' }}"; },
  'reader ignored failure': f => { reader(f)['continue-on-error'] = true; },
  'reader argument differs': f => { reader(f).run = reader(f).run.replace('--verdict-path', '--verdict'); },
  'reader tool module differs': f => { reader(f).run = reader(f).run.replace('lifecycle.mjs', 'publish.mjs'); },
  'tarball job lacks reader': f => { f.doc.jobs.publish.steps = f.doc.jobs.publish.steps.filter(step => step.id !== 'publication-reader'); },
  'reader only in another job': f => { const step = reader(f); f.doc.jobs.publish.steps.splice(f.doc.jobs.publish.steps.indexOf(step), 1); f.doc.jobs.other = { if: 'false', steps: [step] }; f.declaration.workflows[0].publicationReaders[0].job = 'other'; },
  'proof action absent': f => { f.doc.jobs.publish.steps = f.doc.jobs.publish.steps.filter(step => step.id !== 'reuse'); },
  'proof action untrusted module': f => { f.doc.jobs.publish.steps.find(step => step.id === 'reuse').uses = entry(f).actionUses = 'other/action@pin'; },
  'reader environment differs': f => { reader(f).env.TREE_VERDICT_TOOLS = '/fake'; },
  'reader proof follows reader': f => { const all = f.doc.jobs.publish.steps; const proof = all.find(step => step.id === 'reuse'); all.splice(all.indexOf(proof), 1); all.splice(all.indexOf(reader(f)) + 1, 0, proof); },
  'uninventoried extra publish': f => { alias(f).run += '\nnpm publish --access public\n'; },
  'uninventoried inline branch': f => { alias(f).run += '\nif true; then npm publish --access public; fi\n'; },
  'unknown publish operand': f => { alias(f).run += '\nnpm publish unknown.tgz --access public\n'; },
  'nested publish substitution': f => { alias(f).run += '\necho "$(npm publish --access public)"\n'; },
  'nonliteral publish condition': f => { alias(f).if = "${{ startsWith(steps.target.outputs.publish, 'true') }}"; },
  'other-job publish condition': f => { alias(f).if = "${{ needs.release.outputs.publish == 'true' }}"; },
  'forward step condition': f => { alias(f).if = "${{ steps.later.outputs.publish == 'true' }}"; f.doc.jobs.publish.steps.push({ id: 'later', run: 'true' }); },
  'job condition step context': f => { f.doc.jobs.publish.if = "${{ steps.target.outputs.publish == 'true' }}"; },
  'job always condition': f => { f.doc.jobs.publish.if = '${{ always() }}'; },
  'job condition nonexistent dependency': f => { f.doc.jobs.publish.if = "${{ needs.other.outputs.publish == 'true' }}"; },
  'job output missing needs edge': f => { delete f.doc.jobs.publish.needs; },
  'publish ignored failure': f => { alias(f)['continue-on-error'] = false; },
  'variable reassignment': f => { alias(f).run = alias(f).run.replace('npm publish', 'alias_tgz="evil.tgz"\nnpm publish'); },
  'read variable write': f => { alias(f).run = alias(f).run.replace('npm publish', 'read alias_tgz\nnpm publish'); },
  'printf variable write': f => { alias(f).run = alias(f).run.replace('npm publish', 'printf -v alias_tgz evil\nnpm publish'); },
  'wrong producer command': f => { entry(f).invocations[0].producer.command += ' --unknown'; },
  'other-job producer': f => { entry(f).invocations[0].producer.step = 'other-job/pack'; },
  'duplicate step name': f => { f.doc.jobs.publish.steps.push({ name: alias(f).name, run: 'echo duplicate' }); },
  'invalid folder hook': f => { f.declaration.workflows[0].publishes[0].lifecycle = 'verify-publish'; f.pkg.scripts['verify-publish'] = 'node scripts/prepublish.cjs'; },
  'folder hook still raw chain': f => { f.pkg.scripts.prepublishOnly = f.files['fixture-original-hook.txt']; },
  'pack step before reader': f => { f.doc.jobs.publish.steps.unshift({ id: 'pack', run: 'npm pack . --pack-destination "$RUNNER_TEMP/extra"' }); },
  'pack ignored failure': f => { f.doc.jobs.publish.steps.push({ id: 'pack', 'continue-on-error': true, run: 'npm pack . --pack-destination "$RUNNER_TEMP/extra"' }); },
  'arbitrary unquoted tag': f => { f.publishSteps[0].run = f.publishSteps[0].run.replace('tag=""', 'tag="evil.tgz"'); },
};
for (const [name, plant] of Object.entries(plants)) test(`publication CLI plant ${name}`, () => {
  const f = publicationFixture('parts');
  plant(f); f.refresh();
  const errors = lintWorkflows(f.declaration, f.read);
  expect(errors.join('\n')).toContain('WFL002_PUBLISH_SUITE_WITHOUT_VERDICT');
  const result = cli(f, name);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('WFL002_PUBLISH_SUITE_WITHOUT_VERDICT');
  const reason = name.startsWith('reader') || name === 'tarball job lacks reader' ? 'PUBLICATION_READER_WIRING' : {
    'conditional reader': 'PUBLICATION_READER_WIRING',
    'proof action absent': 'PUBLISH_PROOF_WIRING',
    'proof action untrusted module': 'PUBLISH_PROOF_WIRING',
    'uninventoried extra publish': 'PUBLISH_INVENTORY',
    'uninventoried inline branch': 'PUBLISH_INVENTORY',
    'nonliteral publish condition': 'PUBLISH_CONDITION',
    'other-job publish condition': 'PUBLISH_CONDITION',
    'forward step condition': 'PUBLISH_CONDITION',
    'job condition step context': 'PUBLISH_PROOF_WIRING',
    'job always condition': 'PUBLISH_PROOF_WIRING',
    'job condition nonexistent dependency': 'PUBLISH_PROOF_WIRING',
    'job output missing needs edge': 'PUBLISH_PROOF_WIRING',
    'publish ignored failure': 'PUBLISH_IGNORED_FAILURE',
    'variable reassignment': 'PUBLISH_PRODUCER',
    'wrong producer command': 'PUBLISH_PRODUCER',
    'other-job producer': 'PUBLISH_PRODUCER',
    'duplicate step name': 'PUBLISH_INVENTORY',
    'invalid folder hook': 'PUBLISH_HOOK_WIRING',
    'folder hook still raw chain': 'PUBLISH_HOOK_WIRING',
    'pack step before reader': 'PUBLICATION_READER_WIRING',
    'pack ignored failure': 'PUBLISH_IGNORED_FAILURE',
  }[name] ?? 'PUBLICATION_SYNTAX';
  expect(result.stderr).toContain(reason);
});
test('lexical inventory keeps whole-line comments and guards quoted publication text', () => {
  expect(inspectPublication('# npm publish bad.tgz\necho "release diagnostic"').publishes).toEqual([]);
  expect(inspectPublication('n\\pm publish --access public').publishes.length).toBe(1);
  for (const body of [
    'echo "npm publish bad.tgz"', "printf '%s' 'npm publish bad.tgz'",
    "'if' npm publish", '\\if npm publish', 'echo "$(npm publish --access public)"',
    "bash -c 'npm publish --access public'",
  ]) expect(() => inspectPublication(body)).toThrow('PUBLICATION_SYNTAX: line 1:');
});
test('bounded producer capture rejects output transforms and additional substitution commands', () => {
  const body = 'alias_tgz="$(echo poison; bun scripts/alias_tarball.ts pack --name rig-parts --out "$RUNNER_TEMP/alias")"\nnpm publish "$alias_tgz" --access public';
  const f = publicationFixture('parts'); alias(f).run = body; entry(f).invocations[0].producer.command = 'bun scripts/alias_tarball.ts pack --name rig-parts --out "$RUNNER_TEMP/alias"';
  f.refresh(); expect(lintWorkflows(f.declaration, f.read).join('\n')).toContain('PUBLISH_PRODUCER');
});

test('generated multi-command body inventories folder and tarball invocations together', () => {
  const f = publicationFixture('review');
  const first = f.publishSteps[0], producer = entry(f).invocations[0].producer;
  first.run += '\n' + alias(f).run;
  f.declaration.workflows[0].publishes[0].invocations.push({ ordinal: 1, kind: 'tarball', producer: { ...producer, step: { name: first.name } } });
  f.refresh();
  expect(lintWorkflows(f.declaration, f.read)).toEqual([]);
  expect(cli(f, 'generated mixed body').status).toBe(0);
});
for (const [name, transform] of Object.entries({
  'conditional producer': body => body.replace('alias_tgz=', 'if false; then alias_tgz=').replace('npm publish', 'fi\nnpm publish'),
  'prefixed producer output': body => body.replace('alias_tgz="$(','alias_tgz="prefix$('),
  'append write': body => body.replace('npm publish', 'alias_tgz+=evil\nnpm publish'),
  'arithmetic write': body => body.replace('npm publish', '((alias_tgz=1))\nnpm publish'),
  'array write': body => body.replace('npm publish', 'alias_tgz[0]=evil\nnpm publish'),
  'export write': body => body.replace('npm publish', 'export alias_tgz=evil\nnpm publish'),
  'command wrapper': body => body.replace('npm publish', 'command npm publish'),
  'dynamic npm subcommand': body => body.replace('npm publish', 'npm "$SUBCOMMAND"'),
})) test(`publication CLI conservative plant ${name}`, () => {
  const f = publicationFixture('parts'); alias(f).run = transform(alias(f).run); f.refresh();
  expect(cli(f, name).status).toBe(1);
});
test('publication token pairs in npm script names and packument fields refuse', () => {
  for (const body of ['npm run publish', 'npm view package publish']) {
    expect(() => inspectPublication(body)).toThrow('PUBLICATION_SYNTAX: line 1:');
  }
  expect(inspectPublication('npm view package version').publishes).toEqual([]);
  expect(() => inspectPublication('cat <<EOF\nnpm publish\nEOF')).toThrow('PUBLICATION_SYNTAX');
});
test('modern folder hook refuses an inherited ignore-scripts override', () => {
  const f = publicationFixture('parts');
  f.doc.env = { NPM_CONFIG_IGNORE_SCRIPTS: 'true' }; f.refresh();
  expect(cli(f, 'inherited ignore scripts').stderr).toContain('PUBLISH_HOOK_WIRING');
});
test('pack conditions obey the same earlier same-job literal subset', () => {
  const f = publicationFixture('review');
  f.doc.jobs.publish.steps.push({ if: '${{ always() }}', run: 'npm pack . --pack-destination "$RUNNER_TEMP/pack"' }); f.refresh();
  expect(cli(f, 'pack bad condition').stderr).toContain('PUBLISH_CONDITION');
});

test('portable lifecycle tool preflight isolates npm configuration and closes loopback server', async () => {
  const parent = mkdtempSync(join(process.env.TMPDIR, 'lifecycle-tool-'));
  const out = join(parent, 'measurement');
  const tool = fileURLToPath(new URL('./measure-publication.py', import.meta.url));
  const result = spawnSync('python3', [tool, '--out', out, '--only', 'pack'], {
    encoding: 'utf8', env: { ...process.env, NPM_CONFIG_REGISTRY: 'https://invalid.example', NPM_TOKEN: 'UNUSED_SENTINEL' },
  });
  writeFileSync(join(parent, 'stdout.log'), result.stdout);
  writeFileSync(join(parent, 'stderr.log'), result.stderr);
  expect(result.status).toBe(0);
  const summary = JSON.parse(result.stdout);
  expect(summary.commands).toBe(1);
  expect(summary.puts).toBe(0);
  expect(summary.versions[0].npm).toMatch(/^\d+\.\d+\.\d+/);
  const runtime = JSON.parse(readFileSync(join(out, 'runtime.json'), 'utf8'));
  expect(runtime.registryClosed).toBe(true);
  const { createConnection } = await import('node:net');
  const listening = await new Promise(resolve => {
    const socket = createConnection({ host: '127.0.0.1', port: Number(new URL(runtime.registry).port) });
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('error', () => resolve(false));
  });
  expect(listening).toBe(false);
});

test('generated literal same-step pack may ignore scripts because the job reader gates first', () => {
  const f = publicationFixture('review');
  const command = 'npm pack . --ignore-scripts --pack-destination .';
  alias(f).run = `set -euo pipefail\nalias_tgz="$(${command})"\nnpm publish "$alias_tgz" --provenance --access public\n`;
  entry(f).invocations[0].producer.command = command;
  f.refresh(); expect(cli(f, 'literal pack with reader').status).toBe(0);
});
for (const [name, plant] of Object.entries({
  'reader alternate cwd': f => { reader(f)['working-directory'] = 'other'; },
  'publisher alternate cwd': f => { alias(f)['working-directory'] = 'other'; },
  'inherited alternate cwd': f => { f.doc.defaults = { run: { 'working-directory': 'other' } }; },
  'publisher shell override': f => { alias(f).shell = 'python'; },
})) test(`publication context plant ${name}`, () => {
  const f = publicationFixture('parts'); plant(f); f.refresh();
  expect(cli(f, name).status).toBe(1);
});

for (const [name, workflowDefaults, jobDefaults] of [
  ['cwd through empty job defaults', { 'working-directory': 'other' }, {}],
  ['shell through job cwd override', { shell: 'python' }, { 'working-directory': '.' }],
]) test(`publication defaults inheritance ${name}`, () => {
  const f = publicationFixture('parts');
  f.doc.defaults = { run: workflowDefaults };
  f.doc.jobs.publish.defaults = { run: jobDefaults };
  f.refresh();
  expect(cli(f, name).stderr).toContain('PUBLISH_PROOF_WIRING');
});
test('publication source-root job cwd overrides workflow cwd', () => {
  const f = publicationFixture('parts');
  f.doc.defaults = { run: { 'working-directory': 'other' } };
  f.doc.jobs.publish.defaults = { run: { 'working-directory': '.' } };
  f.refresh();
  expect(cli(f, 'job root cwd override').status).toBe(0);
});

const unsupportedWrapperBodies = [
  'npx npm publish --access public',
  'npx -- npm publish --access public',
  '/usr/bin/env npm publish --access public',
  '/usr/bin/command npm publish --access public',
  'pnpm exec npm publish --access public',
  'unsupported-runner npm publish --access public',
  'bash -c "npm publish --access public"',
  "sh -c 'npm publish --access public'",
  'eval "npm publish --access public"',
  'echo ready # npm publish diagnostic',
  'echo "npm publish diagnostic"',
  "printf '%s' 'npm publish diagnostic'",
  'npm run publish',
  'npm view package publish',
  '$(command -v npm) publish --access public',
  'npm_command=publish\nnpm "$npm_command" --access public',
  'echo harmless\n/usr/bin/env npm publish --access public',
];
for (const repo of ['parts', 'review']) {
  for (const body of unsupportedWrapperBodies) test(`${repo} unsupported executable form ${body}`, () => {
    const f = publicationFixture(repo);
    f.doc.jobs.publish.steps.push({ id: 'unsupported-executable', run: body });
    f.refresh();
    const line = body.includes('\n') ? 2 : 1;
    expect(() => inspectPublication(body)).toThrow(`PUBLICATION_SYNTAX: line ${line}:`);
    const result = cli(f, `${repo} executable guard ${body}`);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`PUBLICATION_SYNTAX: line ${line}:`);
  });
  test(`${repo} no-pair queries, canonical pack and whole-line comments remain admitted`, () => {
    const f = publicationFixture(repo);
    f.doc.jobs.publish.steps.push({ id: 'queries', run: [
      '# npx npm publish is an example',
      'npm view package version',
      'npm --version',
      'echo "release diagnostic"',
    ].join('\n') });
    f.doc.jobs.publish.steps.push({ id: 'canonical-pack',
      run: 'npm pack . --pack-destination "$RUNNER_TEMP/wrapper-probe"' });
    f.refresh();
    expect(cli(f, `${repo} guard positive controls`).status).toBe(0);
  });
}

function addUninventoriedJob(f, body) {
  f.doc.jobs['uninventoried-publication'] = { 'runs-on': 'ubuntu-latest', steps: [{ run: body }] };
  f.refresh();
}
for (const subcommand of ['pub', 'publ', 'publi', 'publis', 'pa', 'pac']) test(`A1 npm prefix ${subcommand} refuses in a new job`, () => {
  const f = publicationFixture('parts');
  addUninventoriedJob(f, `npm ${subcommand}`);
  const result = cli(f, `A1 npm ${subcommand}`);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('PUBLICATION_SYNTAX');
});
test('A1 abbreviated tarball producer and publish in a new ungated job refuse', () => {
  const f = publicationFixture('parts');
  addUninventoriedJob(f, 'set -euo pipefail\nt="$(npm pac . --ignore-scripts --pack-destination .)"\nnpm pub "$t" --provenance --access public');
  const result = cli(f, 'A1 abbreviated new ungated job');
  expect(result.status).toBe(1); expect(result.stderr).toContain('PUBLICATION_SYNTAX');
});
for (const repo of ['parts', 'review']) test(`A2 ${repo} every tarball must share the job reader contract`, () => {
  const f = mixedPublicationFixture(repo);
  const first = compileCoverage(JSON.parse(f.files['scripts/tree-verdict.json']), f.read, 'scripts/tree-verdict.json');
  const second = compileCoverage(JSON.parse(f.files['scripts/secondary-verdict.json']), f.read, 'scripts/secondary-verdict.json');
  expect(first.gate).not.toBe(second.gate);
  const result = cli(f, `A2 ${repo} mixed valid contracts`);
  expect(result.status).toBe(1); expect(result.stderr).toContain('PUBLICATION_READER_WIRING');
});
for (const manager of ['bun', 'yarn', 'pnpm']) {
  for (const subcommand of ['pub', 'publ', 'publi', 'publis', 'publish']) test(`A3 ${manager} ${subcommand} refuses in a new job`, () => {
    const f = publicationFixture('parts'); addUninventoriedJob(f, `${manager} ${subcommand} --access public`);
    const result = cli(f, `A3 ${manager} ${subcommand}`);
    expect(result.status).toBe(1); expect(result.stderr).toContain('PUBLICATION_SYNTAX');
  });
}
test('A4 immutable actual parts CI lints green with its explicit empty heavy inventory', () => {
  const f = publicationFixture('parts');
  const actual = f.originals['.github/workflows/ci.yml'];
  expect(hash(actual)).toBe('fa6209d489aab894a55f4dea4f500ce9eebc745a2a5bd52a7c24df1cdf86bdb4');
  f.files['.github/workflows/ci.yml'] = actual;
  f.declaration = { schema: 'workflow-verdict-lint/1', defaultBranch: 'main', workflows: [{ path: '.github/workflows/ci.yml', heavyJobs: [] }] };
  expect(cli(f, 'A4 immutable actual parts CI').status).toBe(0);
});
for (const body of [
  'echo "npm pack --dry-run failed"',
  'cat <<EOF\nordinary CI data\nEOF',
  'echo `date`',
  'npx npm pack .',
  'bash -c "npm pack ."',
]) test(`A4 no-publish-pair syntax remains outside publication refusal ${body}`, () => {
  const f = publicationFixture('parts'); addUninventoriedJob(f, body);
  expect(cli(f, `A4 no publish pair ${body}`).status).toBe(0);
});
const capture = 'alias_tgz="$(npm pack . --ignore-scripts --pack-destination .)"';
for (const [position, producer] of [
  ['false-and', `false && ${capture}`],
  ['true-or', `true || ${capture}`],
  ['and-continuation', `false &&\n${capture}`],
  ['or-suffix', `${capture} || true`],
  ['subshell', `(${capture})`],
  ['conditional-group', `false && {\n${capture}\n}`],
]) test(`A5 capture ${position} refuses with an inherited unrelated path`, () => {
  const f = publicationFixture('parts');
  alias(f).run = `set -euo pipefail\n${producer}\nnpm publish "$alias_tgz" --access public\n`;
  alias(f).env.alias_tgz = 'unrelated-inherited.tgz';
  entry(f).invocations[0].producer.command = 'npm pack . --ignore-scripts --pack-destination .';
  f.refresh();
  const result = cli(f, `A5 ${position}`);
  expect(result.status).toBe(1); expect(result.stderr).toContain('PUBLISH_PRODUCER');
});
for (const [name, plant] of Object.entries({
  'publish always': f => { alias(f).if = '${{ always() }}'; },
  'publish always conjunction': f => { alias(f).if = "${{ always() && steps.target.outputs.publish == 'true' }}"; },
  'publish uncancelled conjunction': f => { alias(f).if = "${{ !cancelled() && steps.target.outputs.publish == 'true' }}"; },
  'publish failure': f => { alias(f).if = '${{ failure() }}'; },
  'job always conjunction': f => { f.doc.jobs.publish.if = "${{ always() && needs.release.outputs.publish == 'true' }}"; },
  'job ignored failure': f => { f.doc.jobs.publish['continue-on-error'] = true; },
})) test(`HQ checked sound ${name}`, () => {
  const f = publicationFixture('parts'); plant(f); f.refresh();
  expect(cli(f, `checked sound ${name}`).status).toBe(1);
});
for (const body of [
  'cat <<EOF\nnpm publish\nEOF',
  'echo "$(npm publish --access public)"',
  'npx npm@latest publish',
  'corepack npm publish',
  'yarn npm publish',
  'npm \\\n publish --access public',
  'echo ordinary; npm publish --access public',
]) test(`HQ checked sound new-job publication ${body}`, () => {
  const f = publicationFixture('parts'); addUninventoriedJob(f, body);
  const result = cli(f, `checked sound ${body}`);
  expect(result.status).toBe(1); expect(result.stderr).toContain('WFL002_PUBLISH_SUITE_WITHOUT_VERDICT');
});

for (const subcommand of ['pa', 'pac']) test(`A1 global-option pack prefix ${subcommand} refuses in a new job`, () => {
  const f = publicationFixture('parts');
  addUninventoriedJob(f, `npm --silent ${subcommand}`);
  const result = cli(f, `A1 npm --silent ${subcommand}`);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('PUBLICATION_SYNTAX: line 1: abbreviated npm publication command unsupported');
});

for (const repo of ['parts', 'review']) {
  for (const uses of ['JS-DevTools/npm-publish@v3', './.github/actions/publisher',
    'unknown/action@v1', 'actions/checkout@unknown', 'oven-sh/setup-bun-extra@v2',
    'rig-c/core/.github/actions/tree-verdict@main']) {
    test(`${repo} unrelated action ${uses} follows global publisher denylist scope`, () => {
      const f = publicationFixture(repo);
      f.doc.jobs.other = { steps: [{ uses, with: { package: 'unverified.tgz' } }] };
      f.refresh();
      const result = cli(f, `${repo} action inventory ${uses}`);
      expect(result.status).toBe(uses === 'JS-DevTools/npm-publish@v3' ? 1 : 0);
      if (uses === 'JS-DevTools/npm-publish@v3') expect(result.stderr).toContain(`ACTION_INVENTORY: found publisher action ${uses}`);
    });
    test(`${repo} protected job refuses uninventoried action ${uses}`, () => {
      const f = publicationFixture(repo);
      f.doc.jobs.publish.steps.unshift({ uses });
      f.refresh();
      const result = cli(f, `${repo} protected action inventory ${uses}`);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('ACTION_INVENTORY');
      expect(result.stderr).toContain(uses);
      expect(result.stderr).toMatch(/[Rr]equires/);
    });
  }
  for (const uses of ['actions/checkout@v4', 'actions/download-artifact@v4',
    'actions/setup-node@v4', 'oven-sh/setup-bun@v2', './.github/actions/reference-video-tools']) {
    test(`${repo} admitted tree writer ${uses} refuses after reader`, () => {
      const f = publicationFixture(repo), steps = f.doc.jobs.publish.steps;
      f.files['.github/actions/reference-video-tools/action.yml'] =
        reviewMainFixture().files['.github/actions/reference-video-tools/action.yml'];
      steps.splice(steps.indexOf(reader(f)) + 1, 0, { uses });
      f.refresh();
      const result = cli(f, `${repo} tree writer ${uses}`);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(`PUBLICATION_TREE_CHANGED: tree-rewriting action ${uses}`);
    });
  }
  test(`${repo} known setup and checkout before reader remain admitted`, () => {
    const f = publicationFixture(repo), steps = f.doc.jobs.publish.steps;
    steps.splice(steps.indexOf(reader(f)), 0, { uses: 'actions/download-artifact@v4' });
    f.refresh();
    expect(cli(f, `${repo} preparation before reader`).status).toBe(0);
  });
  for (const run of ['printf changed > src/probe.ts', 'sed -i s/old/new/ src/probe.ts',
    'bun run rewrite-source', 'node -e "require(\'fs\').writeFileSync(\'src/probe.ts\',\'changed\')"']) {
    test(`${repo} unmodeled source-writing step before alias refuses ${run}`, () => {
      const f = publicationFixture(repo), steps = f.doc.jobs.publish.steps;
      steps.splice(steps.indexOf(alias(f)), 0, { id: 'edit-source', run });
      f.refresh();
      const result = cli(f, `${repo} source write`);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('PUBLICATION_TREE_CHANGED: unmodeled run step edit-source');
    });
  }
}
for (const body of ['npx @jsdevtools/npm-publish --token "$T"',
  'npx --yes @jsdevtools/npm-publish@3 --token "$T"',
  '/usr/bin/npx -- @jsdevtools/npm-publish --token "$T"',
  'npm exec --package=@jsdevtools/npm-publish -- npm-publish',
  'bunx @jsdevtools/npm-publish', 'pnpm dlx @jsdevtools/npm-publish@latest',
  'env TOKEN="$T" /usr/bin/npm-publish', 'command npm-publish --token "$T"',
  'false || npx @jsdevtools/npm-publish', 'true && npm-publish',
  'npx @jsdevtools/npm-pu\\blish', 'bash -c "npx @jsdevtools/npm-publish"']) {
  test(`publisher CLI in new declared job refuses ${body}`, () => {
    const f = publicationFixture('parts'); addUninventoriedJob(f, body);
    const result = cli(f, `publisher CLI ${body}`);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('PUBLICATION_SYNTAX');
  });
}
for (const destination of ['.', '"."', '"$RUNNER_TEMP/output"', 'output', '"$DESTINATION"', './']) {
  test(`captured npm pack destination ${destination} binds only a dot basename`, () => {
    const f = publicationFixture('parts'), step = alias(f);
    const command = `npm pack . --ignore-scripts --pack-destination ${destination}`;
    step.run = `set -euo pipefail\nalias_tgz="$(${command})"\nnpm publish "$alias_tgz" --access public`;
    entry(f).invocations[0].producer.command = command;
    f.refresh();
    const result = cli(f, `pack destination ${destination}`);
    const admitted = destination === '.' || destination === '"."';
    expect(result.status).toBe(admitted ? 0 : 1);
    if (!admitted) expect(result.stderr).toContain('captured npm pack destination must be literal dot');
  });
}
test('a pack command cannot disguise an intervening arbitrary Bun script as publication activity', () => {
  const f = publicationFixture('parts'), steps = f.doc.jobs.publish.steps;
  steps.splice(steps.indexOf(alias(f)), 0, { run: 'npm pack . --pack-destination .\nbun run rewrite-source' });
  f.refresh();
  const result = cli(f, 'disguised source mutation');
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('unsupported Bun publication command');
});

for (const repo of ['parts', 'review']) test(`${repo} frozen raw collector is RED; prospective guard changes only one upload condition`, () => {
  const f = repo === 'parts' ? partsMainFixture() : reviewMainFixture();
  expect(lintWorkflows(f.declaration, f.read).join('\n')).toContain('COVER_PRODUCER:');
  const raw = cli(f, `${repo} immutable raw unconditional collector`);
  expect(raw.status).toBe(1);
  expect(raw.stderr).toContain('COVER_PRODUCER:');
  const originals = { ...f.files };
  const migration = wireCollectorUpload(f);
  const expected = Bun.YAML.parse(originals[migration.path]);
  const coverage = JSON.parse(f.files['scripts/tree-verdict.json']);
  const upload = expected.jobs[coverage.producer.job].steps.find(step => step.uses?.startsWith('actions/upload-artifact@'));
  upload.if = `\${{ steps.${coverage.producer.step ?? 'receipt'}.outputs.receipt-created == 'true' }}`;
  expect(Bun.YAML.parse(f.files[migration.path])).toEqual(expected);
  expect(f.files[migration.path].replace(`        if: \${{ ${migration.condition} }}\n`, '')).toBe(originals[migration.path]);
  expect(migration.beforeSha256).toBe(hash(originals[migration.path]));
  expect(migration.afterSha256).toBe(hash(f.files[migration.path]));
  for (const path of Object.keys(originals).filter(path => path !== migration.path)) expect(f.files[path]).toBe(originals[path]);
  expect(compileCoverage(coverage, f.read).collectorName).toBe('tree-verdict-receipt');
  if (repo === 'review') expect(cli(f, 'review full prospective collector guard').status).toBe(0);
  const frozen = repo === 'parts' ? partsMainFixture() : reviewMainFixture();
  expect(frozen.files).toEqual(originals);
});
test('actual full parts main needs both the collector guard and smoke-before-reader rollout reorder', () => {
  const f = partsMainFixture(), path = '.github/workflows/release.yml';
  expect(f.source.repo).toBe('rig-c/parts');
  expect(f.source.sha).toBe('6d0bb3dfaa22fced86cfb07252226509c2c71ae7');
  wireCollectorUpload(f);
  const original = f.files[path], before = Bun.YAML.parse(original);
  const expected = 'WFL002_PUBLISH_SUITE_WITHOUT_VERDICT: .github/workflows/release.yml jobs.publish: ' +
    'PUBLICATION_TREE_CHANGED: unmodeled run step Gate parts output through @rig-c/play follows the publication reader';
  expect(lintWorkflows(f.declaration, f.read)).toEqual([expected]);
  const red = cli(f, 'actual full parts main before rollout');
  expect(red.status).toBe(1);
  expect(red.stderr.trim()).toBe(expected);

  // Move the complete original smoke step and its comments as source text.
  // The collector guard is already wired. Every release byte outside this move
  // and every publication body/declaration stays in the snapshot.
  const startMarker = '      # Cross-package release gate (#741):';
  const endMarker = '      # The publication reader gates this checkout before packing.';
  const readerMarker = '      - name: Gate every publication through the lifecycle reader\n';
  for (const marker of [startMarker, endMarker, readerMarker]) {
    expect(original.indexOf(marker)).toBeGreaterThan(-1);
    expect(original.indexOf(marker)).toBe(original.lastIndexOf(marker));
  }
  const start = original.indexOf(startMarker), end = original.indexOf(endMarker);
  expect(end).toBeGreaterThan(start);
  expect(start).toBeGreaterThan(original.indexOf(readerMarker));
  const block = original.slice(start, end);
  expect(block).toContain('        run: bun run smoke -- --case clean\n');
  const withoutSmoke = original.slice(0, start) + original.slice(end);
  const insertion = withoutSmoke.indexOf(readerMarker);
  const reordered = withoutSmoke.slice(0, insertion) + block + withoutSmoke.slice(insertion);
  expect(reordered).not.toBe(original);

  // Independently compare the whole parsed workflow to a one-step list move.
  const steps = before.jobs.publish.steps;
  const matches = steps.filter(step => step.run === 'bun run smoke -- --case clean');
  expect(matches).toHaveLength(1);
  const smoke = matches[0];
  steps.splice(steps.indexOf(smoke), 1);
  steps.splice(steps.findIndex(step => step.id === 'publication-reader'), 0, smoke);
  expect(Bun.YAML.parse(reordered)).toEqual(before);
  const unguarded = partsMainFixture();
  unguarded.files[path] = reordered;
  const reorderOnly = cli(unguarded, 'parts smoke reorder alone still refuses unconditional collector');
  expect(reorderOnly.status).toBe(1);
  expect(reorderOnly.stderr).toContain('COVER_PRODUCER:');
  const planBefore = compileCoverage(JSON.parse(f.files['scripts/tree-verdict.json']), f.read);
  f.files[path] = reordered;
  expect(lintWorkflows(f.declaration, f.read)).toEqual([]);
  expect(cli(f, 'actual full parts main smoke-before-reader rollout').status).toBe(0);
  expect(compileCoverage(JSON.parse(f.files['scripts/tree-verdict.json']), f.read)).toEqual(planBefore);
});

// These full consumer inputs and literal plants are independent of the shell reader.
function actualPublicationFixture(repo) {
  const source = repo === 'parts' ? partsMainFixture() : repo === 'review' ? reviewMainFixture() : undefined;
  if (source) wireCollectorUpload(source);
  const files = source?.files ?? {};
  const read = source?.read ?? (path => files[path] ??= readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8'));
  const declaration = JSON.parse(read('scripts/lint_workflows.declarations.json'));
  if (!source) {
    for (const workflow of declaration.workflows) read(workflow.path);
    for (const path of declaration.coverageDeclarations ?? []) compileCoverage(JSON.parse(read(path)), read, path);
  }
  const doc = Bun.YAML.parse(read('.github/workflows/release.yml'));
  if (repo === 'parts') {
    const steps = doc.jobs.publish.steps, smoke = steps.find(step => step.run === 'bun run smoke -- --case clean');
    steps.splice(steps.indexOf(smoke), 1);
    steps.splice(steps.findIndex(step => step.id === 'publication-reader'), 0, smoke);
  }
  const pkg = JSON.parse(read('package.json'));
  return { repo, files, read, declaration, doc, pkg,
    refresh() { files['.github/workflows/release.yml'] = Bun.YAML.stringify(doc); files['package.json'] = JSON.stringify(pkg); } };
}
const localToolsPath = '.github/actions/reference-video-tools/action.yml';
const localToolsUses = './.github/actions/reference-video-tools';
function insertLocalTools(f) {
  const steps = f.doc.jobs.publish.steps;
  if (!steps.some(step => step.uses === localToolsUses)) {
    steps.splice(steps.findIndex(step => step.id === 'publication-reader'), 0, { uses: localToolsUses });
  }
  f.files[localToolsPath] = reviewMainFixture().files[localToolsPath];
}
for (const repo of ['core', 'parts', 'review']) {
  test(`${repo} actual reader/tarball job remains green with auth env`, () => {
    const f = actualPublicationFixture(repo);
    f.doc.jobs.publish.env = { NODE_AUTH_TOKEN: '${{ secrets.NPM_TOKEN }}', NPM_TOKEN: '${{ secrets.NPM_TOKEN }}' };
    f.refresh();
    expect(cli(f, `${repo} real full auth positive`).status).toBe(0);
  });
  for (const hook of ['prepack', 'prepare', 'postpack']) {
    for (const ignoreScripts of [false, true]) test(`${repo} P1 refuses defined scripts.${hook} even with ignore-scripts=${ignoreScripts}`, () => {
      const f = actualPublicationFixture(repo);
      f.pkg.scripts[hook] = 'node scripts/mutate.cjs';
      if (ignoreScripts) {
        const step = f.doc.jobs.publish.steps.find(step => step.run?.includes('npm pack . --pack-destination .'));
        step.run = step.run.replace('npm pack . --pack-destination .', 'npm pack . --ignore-scripts --pack-destination .');
        const entry = f.declaration.workflows.flatMap(workflow => workflow.publishes ?? [])
          .find(entry => entry.invocations?.some(item => item.producer?.command === 'npm pack . --pack-destination .'));
        entry.invocations[0].producer.command = 'npm pack . --ignore-scripts --pack-destination .';
      }
      f.refresh();
      const result = cli(f, `${repo} P1 ${hook}`);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(`PUBLISH_PACK_HOOK: found package.json scripts.${hook}="node scripts/mutate.cjs"`);
      expect(result.stderr).toContain('Requires this field absent');
    });
  }
  for (const position of ['before publish', 'after last publish']) test(`${repo} P2-1 refuses another tree-verdict SHA ${position}`, () => {
    const f = actualPublicationFixture(repo), steps = f.doc.jobs.publish.steps;
    const uses = 'rig-c/core/.github/actions/tree-verdict@' + 'd'.repeat(40);
    const at = position === 'before publish' ? steps.findIndex(step => step.id === 'publication-reader') + 1 : steps.length;
    steps.splice(at, 0, { uses }); f.refresh();
    const result = cli(f, `${repo} different action SHA`);
    const required = steps.find(step => step.id === 'reuse').uses;
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`PUBLICATION_ACTION_REF: found uses ${uses}`);
    expect(result.stderr).toContain(`Requires exactly steps.reuse.uses=${required}`);
  });
  test(`${repo} P2-1 admits the reader's exact tree-verdict source after reader`, () => {
    const f = actualPublicationFixture(repo), steps = f.doc.jobs.publish.steps;
    steps.splice(steps.findIndex(step => step.id === 'publication-reader') + 1, 0,
      { uses: steps.find(step => step.id === 'reuse').uses });
    f.refresh(); expect(cli(f, `${repo} exact action SHA`).status).toBe(0);
  });
  for (const scenario of ['real', 'publish', 'unknown action', 'missing', 'malformed', 'cycle', 'noncomposite', 'oversized']) {
    test(`${repo} P2-2 local composite inventory ${scenario}`, () => {
      const f = actualPublicationFixture(repo); insertLocalTools(f);
      if (scenario === 'publish') f.files[localToolsPath] = 'runs:\n  using: composite\n  steps:\n    - run: npm publish "$GITHUB_WORKSPACE/unverified.tgz"\n';
      if (scenario === 'unknown action') f.files[localToolsPath] = 'runs:\n  using: composite\n  steps:\n    - uses: unknown/inner@v1\n';
      if (scenario === 'missing') delete f.files[localToolsPath];
      if (scenario === 'malformed') f.files[localToolsPath] = 'runs: [';
      if (scenario === 'cycle') f.files[localToolsPath] = `runs:\n  using: composite\n  steps:\n    - uses: ${localToolsUses}\n`;
      if (scenario === 'noncomposite') f.files[localToolsPath] = 'runs:\n  using: node20\n  main: hidden.js\n';
      if (scenario === 'oversized') f.files[localToolsPath] = 'runs:\n  using: composite\n  steps:\n' + '    - run: echo ordinary\n'.repeat(257);
      f.refresh();
      const readPaths = [];
      const errors = lintWorkflows(f.declaration, path => { readPaths.push(path); return f.read(path); });
      expect(readPaths).toContain(localToolsPath);
      if (scenario === 'real') {
        expect(errors).toEqual([]);
        expect(f.files[localToolsPath]).toContain('actions/cache/restore@v4');
        expect(cli(f, `${repo} actual local composite`).status).toBe(0);
      } else {
        const result = cli(f, `${repo} local composite ${scenario}`);
        expect(result.status).toBe(1);
        const reason = scenario === 'publish' ? 'PUBLISH_INVENTORY' : scenario === 'unknown action' ? 'ACTION_INVENTORY' : 'ACTION_BODY';
        expect(result.stderr).toContain(reason);
        expect(result.stderr).toMatch(/[Rr]equires/);
      }
    });
  }
  for (const body of ['npx lerna publish from-package --yes', 'npx changeset publish', 'npx lerna-lite publish']) {
    test(`${repo} P2-3 raw unadmitted argv publish refuses ${body}`, () => {
      const f = actualPublicationFixture(repo);
      f.doc.jobs.extra = { steps: [{ run: body }] }; f.refresh();
      const result = cli(f, `${repo} unadmitted argv publish`);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('argv word publish. Requires an admitted direct npm publish invocation');
    });
  }
  for (const scope of ['workflow', 'job', 'reader', 'publish', 'preparation', 'after publish']) {
    test(`${repo} P2-4 refuses env at ${scope} scope`, () => {
      const f = actualPublicationFixture(repo), job = f.doc.jobs.publish;
      const env = { NODE_OPTIONS: '--require ./scripts/mutate.cjs', npm_config_ignore_scripts: 'false' };
      if (scope === 'workflow') f.doc.env = env;
      if (scope === 'job') job.env = env;
      if (scope === 'reader') Object.assign(job.steps.find(step => step.id === 'publication-reader').env, env);
      if (scope === 'publish') Object.assign(job.steps.find(step => step.name?.startsWith('Publish')).env, env);
      if (scope === 'preparation') job.steps.unshift({ run: 'echo preparation', env });
      if (scope === 'after publish') job.steps.push({ run: 'echo finished', env });
      f.refresh();
      const result = cli(f, `${repo} forbidden publication env ${scope}`);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('PUBLICATION_ENV');
      for (const key of Object.keys(env)) expect(result.stderr).toContain(`found ${key} present. Requires this variable absent`);
    });
  }
}
for (const hook of ['prepack', 'prepare', 'postpack']) test(`P1 rejects any present scripts.${hook} value`, () => {
  for (const value of ['', null, false, 0]) {
    const f = actualPublicationFixture('core'); f.pkg.scripts[hook] = value; f.refresh();
    expect(lintWorkflows(f.declaration, f.read).join('\n')).toContain(`scripts.${hook}=${JSON.stringify(value)}. Requires this field absent`);
  }
});
for (const key of ['npm_config_script_shell', 'NPM_CONFIG_SCRIPT_SHELL', 'Npm_Config_Script_Shell',
  'npm_CONFIG_script_shell', 'npm_config_userconfig', 'npm_config_registry', 'npm_config_', 'node_options']) {
  test(`P2-4 case-insensitive forbidden env key ${key}`, () => {
    const f = actualPublicationFixture('core'); f.doc.jobs.publish.env = { [key]: 'fixture-value' }; f.refresh();
    const result = cli(f, `case-insensitive env ${key}`);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`found ${key} present. Requires this variable absent`);
    expect(result.stderr).not.toContain('fixture-value');
  });
}
for (const body of ['npx --yes lerna "publish" from-package', '/usr/bin/npx lerna publish',
  'env TOKEN="$T" npx changeset publish', 'false || npx lerna-lite publish']) {
  test(`P2-3 independent executable/options/list form ${body}`, () => {
    expect(() => inspectPublication(body)).toThrow('argv word publish. Requires an admitted direct npm publish invocation');
  });
}
for (const body of ['npm exec -- clean-publish', 'semantic-release', 'np', 'release-it',
  'node scripts/publish.mjs', 'gh release upload v1.0.0 package.tgz', 'curl -X PUT https://registry.example.invalid/package']) {
  test(`bounded semantic limit has no argv word publish ${body}`, () => {
    const f = actualPublicationFixture('core'); f.doc.jobs.extra = { steps: [{ run: body }] }; f.refresh();
    expect(lintWorkflows(f.declaration, f.read)).toEqual([]);
  });
}
for (const uses of ['actions/checkout@v5', 'actions/setup-node@v4.1.0', 'actions/cache@v4', 'unknown/action@v1', './.github/actions/unknown']) {
  test(`P2-5 CI-only action admits ${uses} while protected job names its requirement`, () => {
    const f = actualPublicationFixture('core');
    f.doc.jobs.extra = { steps: [{ uses }] }; f.refresh();
    expect(lintWorkflows(f.declaration, f.read)).toEqual([]);
    delete f.doc.jobs.extra; f.doc.jobs.publish.steps.unshift({ uses }); f.refresh();
    const result = cli(f, `protected action requirement ${uses}`);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(uses);
    expect(result.stderr).toContain('requires');
    if (uses.startsWith('actions/checkout@') || uses.startsWith('actions/setup-node@')) {
      expect(result.stderr).toContain('requires @v4 or a full 40-hex SHA');
    }
  });
}

test('npm config independently reads lowercase uppercase and mixed-case config prefixes', () => {
  const dir = mkdtempSync(join(process.env.TMPDIR, 'config-'));
  const userconfig = join(dir, 'user.npmrc'), globalconfig = join(dir, 'global.npmrc');
  writeFileSync(userconfig, ''); writeFileSync(globalconfig, '');
  const clean = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toLowerCase().startsWith('npm_config_')));
  for (const key of ['npm_config_script_shell', 'NPM_CONFIG_SCRIPT_SHELL', 'Npm_Config_Script_Shell', 'npm_CONFIG_script_shell']) {
    const result = spawnSync('npm', ['--cache', join(dir, 'cache'), '--userconfig', userconfig,
      '--globalconfig', globalconfig, 'config', 'get', 'script-shell'], {
      cwd: dir, env: { ...clean, [key]: 'fixture-script-shell' }, encoding: 'utf8', timeout: 10000,
    });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('fixture-script-shell');
  }
});

for (const repo of ['core', 'parts', 'review']) test(`${repo} P2-4 includes nested local composite step env`, () => {
  const f = actualPublicationFixture(repo); insertLocalTools(f);
  const body = Bun.YAML.parse(f.files[localToolsPath]);
  body.runs.steps[1].env.nPm_CoNfIg_userconfig = 'private-fixture-value';
  f.files[localToolsPath] = Bun.YAML.stringify(body); f.refresh();
  const result = cli(f, `${repo} nested composite env`);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain(`${localToolsPath} runs steps.1 env: PUBLICATION_ENV: found nPm_CoNfIg_userconfig present`);
  expect(result.stderr).not.toContain('private-fixture-value');
});
for (const uses of ['js-devtools/NPM-PUBLISH@v3', 'JS-DevTools/npm-publish/subaction@v3']) {
  test(`P2-5 publisher repo identity stays denied outside protected jobs ${uses}`, () => {
    const f = actualPublicationFixture('core'); f.doc.jobs.extra = { steps: [{ uses }] }; f.refresh();
    const result = cli(f, 'publisher identity denylist');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`found publisher action ${uses}. Requires declared direct npm publication`);
  });
}

for (const scope of ['workflow', 'job', 'reader']) test(`P2-4 opaque env mapping refuses at ${scope} scope`, () => {
  const f = actualPublicationFixture('core');
  const value = '${{ fromJSON(inputs.environment) }}';
  if (scope === 'workflow') f.doc.env = value;
  if (scope === 'job') f.doc.jobs.publish.env = value;
  if (scope === 'reader') f.doc.jobs.publish.steps.find(step => step.id === 'publication-reader').env = value;
  f.refresh();
  expect(lintWorkflows(f.declaration, f.read).join('\n')).toContain('found nonmapping env (string). Requires an explicit environment mapping');
});
for (const body of ['echo "$RUNNER_TEMP/fake-bin" >> "$GITHUB_PATH"', 'nohup node scripts/mutate.cjs &']) {
  test(`pre-reader side-effect boundary remains explicit ${body}`, () => {
    const f = actualPublicationFixture('core'), steps = f.doc.jobs.publish.steps;
    steps.splice(steps.findIndex(step => step.id === 'publication-reader'), 0, { run: body });
    f.refresh();
    expect(lintWorkflows(f.declaration, f.read)).toEqual([]);
  });
}

for (const body of ['echo `date`\nnpx lerna publish from-package --yes',
  'cat <<EOF\nordinary CI data\nEOF\nnpx changeset publish']) {
  test(`P2-3 unreadable shell cannot hide a later literal publish command ${body}`, () => {
    const f = actualPublicationFixture('core'); f.doc.jobs.extra = { steps: [{ run: body }] }; f.refresh();
    const result = cli(f, 'unreadable shell publication marker');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('found publication marker in unreadable shell. Requires supported command syntax');
  });
}
