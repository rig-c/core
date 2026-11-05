// Bun >=1.4.4 only. This exact compiler is called by BOTH collector and lint.
import { readFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalCoverage, stable, digest, gateFor, requireCoverage as need } from './coverage.mjs';
const map = v => !!v && typeof v === 'object' && !Array.isArray(v);
const condition = v => typeof v === 'string' ? v.trim().replace(/^\$\{\{\s*|\s*\}\}$/g, '').trim() : '';
const list = v => typeof v === 'string' ? [v] : Array.isArray(v) ? v : [];
function render(text, matrix = {}, inputs = {}, total = 1) {
  need(['string', 'number', 'boolean'].includes(typeof text), 'COVER_DYNAMIC', 'nonliteral expression');
  return String(text).replace(/\$\{\{\s*([^}]+?)\s*\}\}/g, (_, expression) => {
    if (/^matrix\.[\w-]+$/.test(expression)) { const key = expression.slice(7); need(Object.hasOwn(matrix, key), 'COVER_DYNAMIC', 'unresolved matrix name'); return String(matrix[key]); }
    if (/^inputs\.[\w-]+$/.test(expression)) { const key = expression.slice(7); need(Object.hasOwn(inputs, key), 'COVER_DYNAMIC', 'unresolved input'); return render(inputs[key], matrix, {}, total); }
    if (expression === 'strategy.job-total') return String(total);
    // Only checkout refs accept github.sha, through checkout() below.
    need(false, 'COVER_DYNAMIC', `unsupported expression ${expression}`);
  });
}
function matrixLegs(job) {
  if (job.strategy === undefined) return [{}];
  need(map(job.strategy) && map(job.strategy.matrix), 'COVER_DYNAMIC', 'dynamic/fromJSON matrix unsupported');
  const matrix = job.strategy.matrix;
  need(!Object.hasOwn(matrix, 'include') && !Object.hasOwn(matrix, 'exclude'), 'COVER_DYNAMIC', 'matrix include/exclude outside static Cartesian subset');
  let legs = [{}];
  for (const key of Object.keys(matrix).sort()) {
    const values = matrix[key];
    need(/^[\w-]+$/.test(key) && Array.isArray(values) && values.length > 0 && values.every(v => ['string', 'number', 'boolean'].includes(typeof v) && !String(v).includes('${{')) && new Set(values.map(stable)).size === values.length, 'COVER_DYNAMIC', 'matrix axes must be unique literal values');
    legs = legs.flatMap(l => values.map(value => ({ ...l, [key]: value })));
    need(legs.length <= 256, 'COVER_MATRIX', 'matrix expansion too large');
  }
  return legs;
}
function display(job, id, leg, inputs, count) {
  if (job.name !== undefined) {
    need(typeof job.name === 'string' && [...job.name.matchAll(/\$\{\{\s*([^}]+?)\s*\}\}/g)].every(match => /^matrix\.[\w-]+$/.test(match[1])), 'COVER_DYNAMIC', 'job names support literal matrix.* substitutions only');
    return render(job.name, leg);
  }
  if (!Object.keys(leg).length) return id;
  need(false, 'COVER_DYNAMIC', 'matrix job needs explicit static/matrix name; implicit matrix formatting is unsupported');
}
function checkout(job, inputs) {
  const steps = Array.isArray(job.steps) ? job.steps : [];
  const checkouts = steps.filter(s => typeof s.uses === 'string' && /^actions\/checkout@/.test(s.uses) && (s.with?.repository === undefined || s.with.repository === '${{ github.repository }}'));
  need(checkouts.length === 1, 'COVER_CHECKOUT', 'exactly one source-root checkout required');
  const step = checkouts[0];
  need(step.if === undefined && step['continue-on-error'] === undefined, 'COVER_CHECKOUT', 'source checkout cannot be conditional');
  let ref = step.with?.ref ?? '';
  if (/^\$\{\{\s*inputs\.[\w-]+\s*\}\}$/.test(String(ref))) { const key = String(ref).match(/inputs\.([\w-]+)/)[1]; need(Object.hasOwn(inputs,key), 'COVER_DYNAMIC', 'unresolved checkout input'); ref=inputs[key]; }
  need(ref === '' || /^\$\{\{\s*github\.sha\s*\}\}$/.test(String(ref)), 'COVER_CHECKOUT', 'source ref must resolve to event github.sha');
  need(job.container === undefined, 'COVER_DYNAMIC', 'container checkout policy unsupported');
  const path = step.with?.path ?? '.';
  need(typeof path === 'string' && (path === '.' || /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(path)), 'COVER_CHECKOUT', 'source checkout path must be static relative path');
  return path;
}
function sourceStep(job, predicate, role) {
  const found = (job.steps ?? []).filter(s => typeof s.run === 'string' && predicate(s.run, s));
  need(found.length === 1, 'COVER_COMMAND', 'expected exactly one mapped invocation');
  const step = found[0];
  const cwd = step['working-directory'] ?? job.defaults?.run?.['working-directory'] ?? job._workflowCwd ?? '.';
  need(cwd === job._sourcePath, 'COVER_CHECKOUT', 'mapped command working-directory differs from source checkout');
  need((step.if === undefined || condition(step.if) === 'success()') && (step['continue-on-error'] === undefined || step['continue-on-error'] === false || (role === 'shard' && step['continue-on-error'] === true)), 'COVER_COMMAND', 'conditional/ignored mapped command');
  return step;
}
// Deliberately bounded single-invocation lexer. Quoted path segments may be
// concatenated with literal/glob suffixes, as in "$RUNNER_TEMP"/tally/*.json.
function singleInvocation(body) {
  const text = body.trim();
  need(text.length > 0 && !/[\r\n\x00-\x08\x0b-\x1f]/.test(text), 'COVER_COMMAND', 'mapped invocation must occupy one line');
  const argv = [];
  let quote = null;
  let value = '';
  let dynamic = false;
  let started = false;
  const finish = () => {
    if (started) argv.push({ value, dynamic });
    value = ''; dynamic = false; started = false;
  };
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quote === "'") {
      if (char === "'") quote = null;
      else value += char;
      continue;
    }
    need(char !== '\\' && char !== '`', 'COVER_COMMAND', 'escapes and command substitutions unsupported');
    if (char === '$') {
      need(quote === '"' && text[index + 1] !== '(', 'COVER_COMMAND', 'only quoted simple environment references supported');
      const variable = text.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*|\{[A-Za-z_][A-Za-z0-9_]*\})/);
      need(variable, 'COVER_COMMAND', 'unsupported variable expansion/substitution');
      value += variable[0]; dynamic = true; started = true;
      index += variable[0].length - 1;
      continue;
    }
    if (quote === '"') {
      if (char === '"') quote = null;
      else value += char;
      continue;
    }
    if (char === ' ' || char === '\t') { finish(); continue; }
    need(!'|&;<>()#'.includes(char), 'COVER_COMMAND', 'shell operators, redirections and comments unsupported');
    started = true;
    if (char === "'" || char === '"') quote = char;
    else value += char;
  }
  need(quote === null, 'COVER_COMMAND', 'unterminated argument quote');
  finish();
  return argv;
}
function invocationArguments(run, prefix, matrix, inputs, total) {
  try {
    const argv = singleInvocation(render(run, matrix, inputs, total));
    const expected = singleInvocation(prefix);
    if (expected.length === 0 || argv.length < expected.length) return undefined;
    if (!expected.every((token, index) => !token.dynamic && !argv[index].dynamic && token.value === argv[index].value)) return undefined;
    return argv.slice(expected.length);
  } catch {
    // Unrelated unsupported steps cannot be mapped. A missing mapped invocation
    // is then refused by sourceStep with COVER_COMMAND.
    return undefined;
  }
}
export function compileCoverage(declaration, read, declarationPath = 'scripts/tree-verdict.json', previous) {
  need(globalThis.Bun?.YAML && /^1\.(?:[5-9]|[1-9][0-9])\.|^1\.4\.(?:[4-9]|[1-9][0-9])(?:\D|$)|^[2-9]\./.test(Bun.version), 'COVER_RUNTIME', 'Bun >=1.4.4 required');
  const coverage = canonicalCoverage(declaration), documents = new Map(), sources = [];
  const workflow = path => {
    need(/^\.github\/workflows\/[\w-]+\.ya?ml$/.test(path), 'COVER_DYNAMIC', 'only local workflow calls supported');
    if (!documents.has(path)) {
      need(documents.size < 8, 'COVER_DYNAMIC', 'workflow graph exceeds static bound');
      const text = read(path), doc = Bun.YAML.parse(text);
      need(map(doc) && map(doc.jobs), 'COVER_JOB', 'malformed workflow YAML');
      documents.set(path, doc); sources.push({ path, sha256: digest(text) });
    }
    return documents.get(path);
  };
  const root = workflow(coverage.workflow);
  const resolved = {};
  for (const [group, spec] of Object.entries(coverage.jobs)) {
    let doc = root, file = coverage.workflow, inputs = {}, prefixes = [], job;
    for (let i = 0; i < spec.path.length; i++) {
      const id = spec.path[i]; job = doc.jobs[id];
      need(map(job), 'COVER_JOB', `job ${spec.path.join('/')} missing`);
      need(job['continue-on-error'] === undefined && job.if !== false && job.if !== 'false', 'COVER_JOB', 'job cannot ignore failure/disable itself');
      if (i < spec.path.length - 1) {
        need(typeof job.uses === 'string' && job.uses.startsWith('./.github/workflows/') && job.strategy === undefined, 'COVER_DYNAMIC', 'requires local nonmatrix reusable call');
        prefixes.push(display(job, id, {}, inputs, 1)); file = job.uses.slice(2); doc = workflow(file);
        const defaults = doc.on?.workflow_call?.inputs ?? {};
        const supplied = job.with ?? {}, next = {};
        for (const [key, value] of Object.entries(defaults)) if (Object.hasOwn(value, 'default')) next[key] = value.default;
        for (const [key, value] of Object.entries(supplied)) next[key] = value === '${{ github.sha }}' ? value : render(value, {}, inputs);
        inputs = next;
      }
    }
    need(job.uses === undefined, 'COVER_JOB', 'covering path must terminate at executable job');
    const sourcePath = checkout(job, inputs);
    job = { ...job, _sourcePath: sourcePath, _workflowCwd: doc.defaults?.run?.['working-directory'] };
    const legs = matrixLegs(job), actual = legs.map(matrix => ({ matrix, apiName: [...prefixes, display(job, spec.path.at(-1), matrix, inputs, legs.length)].join(' / ') }));
    need(stable([...actual].sort((a,b) => stable(a) < stable(b) ? -1 : stable(a) > stable(b) ? 1 : 0)) === stable(spec.legs), 'COVER_MATRIX', `leg inventory differs for ${group}`);
    resolved[group] = { job, file, inputs, actual, sourcePath };
  }
  let pkg;
  const scriptFor = command => {
    const match = /^bun run ([\w:-]+)$/.exec(command);
    need(match, 'COVER_COMMAND', 'mapped commands currently require literal bun run <script>');
    pkg ??= JSON.parse(read('package.json'));
    need(typeof pkg.scripts?.[match[1]] === 'string', 'COVER_COMMAND', `script ${match[1]} missing`);
    return pkg.scripts[match[1]];
  };
  for (const command of coverage.commands) {
    const script = scriptFor(command), groups = coverage.covers[command];
    for (const group of groups) {
      const spec = coverage.jobs[group], { job, inputs } = resolved[group];
      if (spec.role === 'plain' || (spec.role === 'merge' && !groups.some(g => coverage.jobs[g].role === 'shard'))) {
        sourceStep(job, run => spec.legs.every(leg => invocationArguments(run, command, leg.matrix, inputs, spec.legs.length)?.length === 0 || invocationArguments(run, script, leg.matrix, inputs, spec.legs.length)?.length === 0), 'plain');
      } else if (spec.role === 'shard') {
        const step = sourceStep(job, (run, s) => spec.legs.every(leg => {
          const direct = invocationArguments(run, command, leg.matrix, inputs, spec.legs.length);
          const args = invocationArguments(run, script, leg.matrix, inputs, spec.legs.length);
          return (direct?.length === 0 && typeof s.env?.RIGC_SHARD === 'string') || (args?.[0]?.value === '--shard' && args.length > 1);
        }), 'shard');
        const partitions = [];
        for (const leg of spec.legs) {
          const direct = invocationArguments(step.run, command, leg.matrix, inputs, spec.legs.length);
          const args = invocationArguments(step.run, script, leg.matrix, inputs, spec.legs.length);
          const token = direct?.length === 0 ? step.env?.RIGC_SHARD : args?.[1]?.value;
          need(typeof token === 'string', 'COVER_MATRIX', 'shard partition missing');
          const value = render(token, leg.matrix, inputs, spec.legs.length).replace(/^['"]|['"]$/g, '');
          const parts = value.split('/');
          need(parts.length <= 2 && /^\d+$/.test(parts[0]) && (parts.length === 1 || Number(parts[1]) === spec.legs.length), 'COVER_MATRIX', 'invalid shard partition');
          partitions.push(Number(parts[0]));
        }
        need(stable([...partitions].sort((a,b)=>a-b)) === stable(Array.from({length:spec.legs.length},(_,i)=>i+1)), 'COVER_MATRIX', 'shard partitions omitted/duplicated');
      } else {
        sourceStep(job, run => spec.legs.every(leg => {
          const args = invocationArguments(run, script, leg.matrix, inputs, spec.legs.length);
          return args?.[0]?.value === '--merge' && args.length > 1;
        }), 'merge');
        const shards = groups.filter(g => coverage.jobs[g].role === 'shard');
        need(shards.length > 0, 'COVER_MERGE', 'merge role has no shards');
        for (const shard of shards) {
          const other = coverage.jobs[shard];
          need(resolved[shard].file === resolved[group].file && stable(other.path.slice(0,-1)) === stable(spec.path.slice(0,-1)) && list(job.needs).includes(other.path.at(-1)), 'COVER_MERGE', 'merge must directly need covering shard job in same workflow');
        }
      }
    }
  }
  const collector = root.jobs[coverage.producer.job];
  const roots = [...new Set(Object.values(coverage.jobs).map(j => j.path[0]))].sort();
  need(map(collector) && collector.uses === undefined && condition(collector.if) === 'success()' && collector['continue-on-error'] === undefined && roots.every(id => list(collector.needs).includes(id)), 'COVER_PRODUCER', 'collector needs every covering root under if: success()');
  const collectorPath = checkout(collector, {});
  need(Object.values(resolved).every(j => j.sourcePath === collectorPath), 'COVER_CHECKOUT', 'all covering jobs and collector must use same source checkout path');
  const step = (collector.steps ?? []).find(s => s.id === coverage.producer.step);
  need(step && step.if === undefined && step['continue-on-error'] === undefined && typeof step.run === 'string', 'COVER_PRODUCER', 'collector step must invoke the shared producer unconditionally');
  const collectorArgv = singleInvocation(step.run);
  need((collectorArgv.length === 6 || collectorArgv.length === 8) &&
    !collectorArgv[0].dynamic && collectorArgv[0].value === 'bun' &&
    (collectorArgv[1].value === 'producer.mjs' || collectorArgv[1].value.endsWith('/producer.mjs')) &&
    !/[?*\[\]]/.test(collectorArgv[1].value), 'COVER_PRODUCER', 'collector requires bun producer.mjs and exact declaration/out options with optional checkout');
  const collectorOptions = new Map();
  for (let index = 2; index < collectorArgv.length; index += 2) {
    const flag = collectorArgv[index];
    const value = collectorArgv[index + 1];
    need(!flag.dynamic && ['--declaration', '--out', '--checkout'].includes(flag.value) &&
      !collectorOptions.has(flag.value) && value.value.length > 0 && !value.value.startsWith('--') &&
      !/[?*\[\]]/.test(value.value), 'COVER_PRODUCER', 'collector options must be unique flag/path pairs without glob expansion');
    collectorOptions.set(flag.value, value);
  }
  need(collectorOptions.has('--out') && collectorOptions.has('--declaration') &&
    !collectorOptions.get('--declaration').dynamic && collectorOptions.get('--declaration').value === declarationPath,
    'COVER_PRODUCER', 'collector declaration must match the checked declaration path and output is required');
  const collectorCwd = step['working-directory'] ?? collector.defaults?.run?.['working-directory'] ?? root.defaults?.run?.['working-directory'] ?? '.';
  need(collectorCwd === collectorPath, 'COVER_CHECKOUT', 'collector working-directory differs from source checkout');
  const name = display(collector, coverage.producer.job, {}, {}, 1);
  need(name === coverage.producer.apiName && !Object.values(coverage.jobs).flatMap(j => j.legs).some(l => l.apiName === name), 'COVER_PRODUCER', 'collector display name overlaps covering leg');
  if (previous) {
    const old = canonicalCoverage(previous);
    if (digest({ ...old, label: '' }) !== digest({ ...coverage, label: '' })) need(Number(coverage.label.split('/')[1]) > Number(old.label.split('/')[1]), 'COVER_VERSION', 'coverage changed without label version change');
  }
  return { schema: 'tree-verdict-collector/2', compiler: 'static-coverage/2', digest: digest(coverage), coverage,
    sources: sources.sort((a,b) => a.path < b.path ? -1 : 1), collectorName: name, needs: roots, gate: gateFor(coverage) };
}
export function compileFromDisk(path, root = '.', previousPath) {
  const base = resolve(root), read = p => { const full = resolve(base,p), rel = relative(base,full); need(!rel.startsWith('..') && !rel.startsWith('/'), 'COVER_JOB', 'source outside repository'); return readFileSync(full,'utf8'); };
  const relativeDeclaration = relative(base, resolve(path));
  return compileCoverage(JSON.parse(readFileSync(path,'utf8')), read, relativeDeclaration, previousPath ? JSON.parse(readFileSync(previousPath,'utf8')) : undefined);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { const [path, root='.', previous] = process.argv.slice(2); const plan = compileFromDisk(path,root,previous); console.log(`COVER_OK: ${Object.keys(plan.coverage.jobs).length} jobs; ${Object.values(plan.coverage.jobs).reduce((n,j)=>n+j.legs.length,0)} legs; ${plan.gate}`); }
  catch(error) { console.error(error.message); process.exitCode = 1; }
}
