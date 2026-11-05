import { test, expect } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { inspectPublication } from './publication.mjs';
import { publicationFixture, hash } from './publication-fixtures.mjs';
import { stable } from './coverage.mjs';
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
  'npx npm pack .',
  '/usr/bin/env npm pack .',
  'pnpm exec npm pack .',
  'bash -c "npm publish --access public"',
  "sh -c 'npm publish --access public'",
  'eval "npm publish --access public"',
  'bash -c "npm pack ."',
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
