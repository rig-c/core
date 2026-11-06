import { test, expect } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { inspectPublication } from './publication.mjs';
import { publicationFixture, mixedPublicationFixture, partsMainFixture, hash } from './publication-fixtures.mjs';
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
    test(`${repo} uninventoried action ${uses} refuses even in a new job`, () => {
      const f = publicationFixture(repo);
      f.doc.jobs.other = { steps: [{ uses, with: { package: 'unverified.tgz' } }] };
      f.refresh();
      const result = cli(f, `${repo} action inventory ${uses}`);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(`ACTION_INVENTORY: unsupported action ${uses}`);
    });
  }
  for (const uses of ['actions/checkout@v4', 'actions/download-artifact@v4',
    'actions/setup-node@v4', 'oven-sh/setup-bun@v2', './.github/actions/reference-video-tools']) {
    test(`${repo} admitted tree writer ${uses} refuses after reader`, () => {
      const f = publicationFixture(repo), steps = f.doc.jobs.publish.steps;
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

test('actual full parts main refuses post-reader smoke and admits its smoke-before-reader rollout reorder', () => {
  const f = partsMainFixture(), path = '.github/workflows/release.yml';
  expect(f.source.repo).toBe('rig-c/parts');
  expect(f.source.sha).toBe('6d0bb3dfaa22fced86cfb07252226509c2c71ae7');
  const original = f.files[path], before = Bun.YAML.parse(original);
  const expected = 'WFL002_PUBLISH_SUITE_WITHOUT_VERDICT: .github/workflows/release.yml jobs.publish: ' +
    'PUBLICATION_TREE_CHANGED: unmodeled run step Gate parts output through @rig-c/play follows the publication reader';
  expect(lintWorkflows(f.declaration, f.read)).toEqual([expected]);
  const red = cli(f, 'actual full parts main before rollout');
  expect(red.status).toBe(1);
  expect(red.stderr.trim()).toBe(expected);

  // Move the complete original smoke step and its comments as source text.
  // Every other byte, publication body and declaration stays in the snapshot.
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
  const planBefore = compileCoverage(JSON.parse(f.files['scripts/tree-verdict.json']), f.read);
  f.files[path] = reordered;
  expect(lintWorkflows(f.declaration, f.read)).toEqual([]);
  expect(cli(f, 'actual full parts main smoke-before-reader rollout').status).toBe(0);
  expect(compileCoverage(JSON.parse(f.files['scripts/tree-verdict.json']), f.read)).toEqual(planBefore);
});
