/** Bounded publication shell reader. It never executes a workflow or a helper. */
export const PUBLISH_LIFECYCLE_HOOKS = Object.freeze(['prepublishOnly', 'prepare', 'prepack']);
// Admission is by exact action identity and reviewed major (or immutable SHA).
// Tree writers are preparation only, before the publication reader.
const actions = new Map([
  ['actions/checkout', { major: 'v4', rewritesTree: true }],
  ['actions/setup-node', { major: 'v4', rewritesTree: true }],
  ['oven-sh/setup-bun', { major: 'v2', rewritesTree: true }],
  ['actions/upload-artifact', { major: 'v4', rewritesTree: false }],
  ['actions/download-artifact', { major: 'v4', rewritesTree: true }],
  ['actions/cache/restore', { major: 'v4', rewritesTree: true }],
  ['actions/cache/save', { major: 'v4', rewritesTree: false }],
  ['googleapis/release-please-action', { major: 'v4', rewritesTree: true }],
  ['rig-c/core/.github/actions/tree-verdict', { rewritesTree: false }],
]);
function admittedAction(uses) {
  // Review's checked-in tool installer is preparation, before the reader.
  if (uses === './.github/actions/reference-video-tools') return { rewritesTree: true };
  if (typeof uses !== 'string') return undefined;
  const match = /^([^@]+)@([^@]+)$/.exec(uses);
  const action = match && actions.get(match[1]);
  return action && (match[2] === action.major || /^[a-f0-9]{40}$/.test(match[2])) ? action : undefined;
}
function actionRequirement(uses) {
  const identity = typeof uses === 'string' ? uses.split('@')[0] : '';
  const action = actions.get(identity);
  if (action) return action.major ? `requires @${action.major} or a full 40-hex SHA` : 'requires a full 40-hex SHA';
  return 'requires an explicitly allowlisted action identity and admitted ref';
}
const publisherAction = uses => typeof uses === 'string' && /^js-devtools\/npm-publish(?:\/|@|$)/i.test(uses);
const fail = reason => { throw new Error(`PUBLICATION_SYNTAX: ${reason}`); };
const tagSetup = 'tag=""\ncase "$(node -p "require(\'./package.json\').version")" in *-*) tag="--tag rc";; esac';

// Quotes keep inert text out of command inventory. Substitutions are recursively
// tokenized, including substitutions inside double quotes. Offsets are absolute.
function lex(text, start = 0, substitution = false) {
  const tokens = [];
  let index = start;
  while (index < text.length) {
    const char = text[index];
    if (char === ')' && substitution) return { tokens, end: index + 1 };
    if (char === ' ' || char === '\t' || char === '\r') { index++; continue; }
    if (char === '#') { while (index < text.length && text[index] !== '\n') index++; continue; }
    if ('\n;|&()<>'.includes(char)) {
      const pair = text.slice(index, index + 2);
      const value = ['&&', '||', ';;', '>>', '<<'].includes(pair) ? pair : char;
      tokens.push({ value, operator: true, start: index, end: index + value.length });
      index += value.length;
      continue;
    }
    const begin = index;
    let value = '', quote = '', dynamic = false, quoted = false;
    const children = [];
    while (index < text.length) {
      const c = text[index];
      if (!quote && /[\s;|&()<>]/.test(c)) break;
      if (c === '\\' && quote !== "'") {
        if (index + 1 >= text.length) fail('trailing escape');
        if (text[index + 1] !== '\n') value += text[index + 1];
        index += 2;
        continue;
      }
      if (c === "'" && quote !== '"' || c === '"' && quote !== "'") {
        quoted = true;
        quote = quote ? '' : c;
        index++;
        continue;
      }
      if (c === '`' && quote !== "'") fail('backtick substitution unsupported');
      if (c === '$' && quote !== "'") {
        dynamic = true;
        if (text[index + 1] === '(') {
          const child = lex(text, index + 2, true);
          children.push({ ...child, start: index });
          value += text.slice(index, child.end);
          index = child.end;
          continue;
        }
        const variable = text.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*|\{[A-Za-z_][A-Za-z0-9_]*\}|\?)/);
        if (variable) { value += variable[0]; index += variable[0].length; continue; }
      }
      value += c;
      index++;
    }
    if (quote) fail('unterminated quote');
    if (index === begin) fail('unreadable shell token');
    tokens.push({ value, raw: text.slice(begin, index), dynamic, quoted, children, start: begin, end: index });
  }
  if (substitution) fail('unterminated command substitution');
  return { tokens, end: index };
}
function commands(tokens, depth = 0) {
  const result = [];
  let words = [];
  const finish = () => {
    while (words.length && words[0].raw === words[0].value && ['if', 'then', 'else', 'elif', 'fi', 'do', '!', '{', '}'].includes(words[0].value)) words.shift();
    if (words.length) result.push({ words, depth, start: words[0].start, end: words.at(-1).end });
    words = [];
  };
  for (const token of tokens) {
    if (token.operator) { finish(); continue; }
    words.push(token);
    for (const child of token.children) result.push(...commands(child.tokens, depth + 1));
  }
  finish();
  return result.sort((a, b) => a.start - b.start);
}
function assignment(token) {
  const match = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(token.raw);
  return match && { name: match[1], token };
}
function executable(command) {
  return command.words.findIndex(token => !assignment(token));
}
// HQ's conservative guard also reads text inside arguments and inline comments.
// Canonical invocation admission remains the separate shell lexer above.
function publishPrefix(value) {
  return value.length >= 3 && 'publish'.startsWith(value);
}
function packPrefix(value) {
  return value.length >= 2 && 'pack'.startsWith(value);
}
function publisherWord(value) {
  const name = value.split('/').at(-1);
  return name.endsWith('npm') || name === 'bun' || name === 'yarn';
}
function publicationWords(text) {
  if (!/\bpub(?:l(?:i(?:s(?:h)?)?)?)?\b/.test(text)) return [];
  return [...text.matchAll(/[A-Za-z0-9_./-]+/g)].map(match => ({
    value: match[0], start: match.index, end: match.index + match[0].length,
  }));
}
function hasPublicationPair(words) {
  return words.some(word => word.value.split('/').at(-1) === 'npm-publish') ||
    words.some(word => publisherWord(word.value)) &&
    words.some(word => publishPrefix(word.value));
}
function refusePublicationLine(body, offset, reason) {
  const line = body.slice(0, offset).split('\n').length;
  fail(`line ${line}: ${reason}`);
}
function guardPublicationText(body, calls, admitted) {
  for (const call of calls) {
    const position = executable(call), argv = position < 0 ? [] : call.words.slice(position);
    if (argv.some(word => word.value === 'publish') && !admitted.some(command => command.start === call.start)) {
      refusePublicationLine(body, call.start, `found command ${argv[0].value} with argv word publish. Requires an admitted direct npm publish invocation`);
    }
    const words = publicationWords(call.words.map(word => word.value).join(' '));
    if (hasPublicationPair(words) && !admitted.some(command => command.start === call.start)) {
      refusePublicationLine(body, call.start, 'unsupported publication executable form');
    }
  }
  let offset = 0;
  for (const line of body.split('\n')) {
    if (!/^\s*#/.test(line)) {
      const words = publicationWords(line);
      if (hasPublicationPair(words)) {
        const relevant = words.filter(word => publisherWord(word.value) || publishPrefix(word.value));
        if (relevant.some(word => !admitted.some(command =>
          offset + word.start >= command.start && offset + word.end <= command.end))) {
          refusePublicationLine(body, offset, 'unsupported publication executable form');
        }
      }
    }
    offset += line.length + 1;
  }
}
export function inspectPublication(body) {
  const text = body.split('\n').filter(line => !/^\s*#/.test(line)).join('\n').replace(/[\\'"]/g, '');
  const words = publicationWords(text);
  const carriesPublish = hasPublicationPair(words);
  const carriesLiteralPublish = words.some(word => word.value === 'publish');
  let tokens;
  try {
    tokens = lex(body).tokens;
    if (tokens.some(token => token.operator && token.value === '<<')) fail('heredoc publication inventory unsupported');
  } catch (error) {
    if (carriesPublish || carriesLiteralPublish) refusePublicationLine(body, 0,
      `found publication marker in unreadable shell. Requires supported command syntax (${error.message})`);
    return { tokens: [], calls: [], publishes: [], packs: [], writes: [] };
  }
  if (carriesPublish && /\\\r?\n/.test(body)) refusePublicationLine(body, body.indexOf('\\'), 'publication continuation unsupported');
  const calls = commands(tokens);
  const publishes = [], packs = [], writes = [];
  for (const call of calls) {
    const position = executable(call);
    for (const token of position < 0 ? call.words : call.words.slice(0, position)) {
      const write = assignment(token);
      if (write) writes.push({ ...write, start: token.start });
    }
    if (position < 0) continue;
    const argv = call.words.slice(position), first = argv[0].value;
    if (['echo', 'printf', '[', 'test'].includes(first)) continue;
    if (first === 'npm' || first.endsWith('/npm')) {
      if (argv[1]?.dynamic) refusePublicationLine(body, call.start, 'dynamic npm subcommand unsupported');
      const subcommand = argv[1]?.value ?? '';
      if (publishPrefix(subcommand) && subcommand !== 'publish' || packPrefix(subcommand) && subcommand !== 'pack') {
        refusePublicationLine(body, call.start, 'abbreviated npm publication command unsupported');
      }
      const mode = argv[1]?.value.startsWith('-') ?
        argv.findIndex((token, index) => index > 0 && (publishPrefix(token.value) || packPrefix(token.value))) :
        ['publish', 'pack'].includes(argv[1]?.value) ? 1 : -1;
      if (mode > 0) {
        if (!['publish', 'pack'].includes(argv[mode].value)) {
          refusePublicationLine(body, call.start, 'abbreviated npm publication command unsupported');
        }
        const found = { ...call, argv, mode };
        (argv[mode].value === 'publish' ? publishes : packs).push(found);
      }
    } else if (first === 'bun' && argv[2]?.value === 'pack') {
      packs.push({ ...call, argv, mode: 2, helper: true });
    } else if (argv[0].dynamic && argv.some(token => ['publish', 'pack'].includes(token.value))) {
      refusePublicationLine(body, call.start, 'dynamic publication executable unsupported');
    }
  }
  for (const pack of packs) {
    const owners = writes.filter(write => write.token.children.some(child => child.start < pack.start && child.end >= pack.end));
    pack.variable = owners.length === 1 ? owners[0].name : undefined;
    pack.command = body.slice(pack.start, pack.end);
    const owner = owners[0];
    pack.directCapture = owners.length === 1 && owner.token.children.length === 1 &&
      [owner.name + '="$(' + pack.command + ')"', owner.name + '=$(' + pack.command + ')'].includes(owner.token.raw);
  }
  const admitted = [...publishes, ...packs].filter(command =>
    command.argv[0].value === 'npm' && command.mode === 1 && command.words[0] === command.argv[0] &&
    (command.depth === 0 || command.directCapture));
  const captures = packs.filter(command => command.directCapture && admitted.includes(command)).map(command => {
    const owner = writes.find(write => write.name === command.variable && write.token.children.some(child => child.start < command.start && child.end >= command.end));
    return { start: owner.token.start, end: owner.token.end };
  });
  guardPublicationText(body, calls, [...admitted, ...captures]);
  return { tokens, calls, publishes, packs, writes };
}
export function publicationCondition(value, scope, all, index) {
  if (value === undefined) return true;
  if (typeof value !== 'string') return false;
  const text = value.trim().replace(/^\$\{\{\s*|\s*\}\}$/g, '').trim();
  const match = /^(steps|needs)\.([\w-]+)\.outputs\.([\w-]+)\s*(==|!=)\s*('(?:[^'\r\n]|'')*'|true|false|null|-?\d+(?:\.\d+)?)$/.exec(text);
  if (!match || match[1] !== scope) return false;
  if (scope === 'needs') return Object.hasOwn(all, match[2]);
  const found = all.filter(step => step.id === match[2]);
  return found.length === 1 && all.indexOf(found[0]) < index;
}
export function selectStep(all, selector) {
  const found = typeof selector === 'string' ? all.filter(step => step.id === selector) :
    selector && typeof selector.name === 'string' && selector.name.trim().length > 0 && Object.keys(selector).length === 1 && !selector.name.includes('${{') ?
      all.filter(step => step.name === selector.name && typeof step.name === 'string') : [];
  return found.length === 1 ? found[0] : undefined;
}
function topLevelAt(tokens, offset) {
  let depth = 0, groups = 0, beginning = true;
  for (const token of tokens) {
    if (token.start >= offset) break;
    if (token.operator) {
      if (token.value === '(') groups++;
      if (token.value === ')' && groups > 0) groups--;
      beginning = true;
      continue;
    }
    if (!token.quoted && beginning) {
      if (['if', 'case', 'for', 'while', 'until', 'select', '{'].includes(token.value)) depth++;
      if (['fi', 'esac', 'done', '}'].includes(token.value)) depth--;
    }
    beginning = !token.quoted && ['then', 'else', 'do', 'fi', 'esac', 'done'].includes(token.value);
  }
  return depth === 0 && groups === 0;
}
function unconditionalCapture(analysis, write) {
  if (!write || !topLevelAt(analysis.tokens, write.start)) return false;
  let start = 0, conditional = false, previous;
  for (const token of analysis.tokens) {
    if (['&&', '||', '!'].includes(token.value) && !token.quoted) conditional = true;
    if (token.operator && (token.value === ';' || token.value === '\n')) {
      if (token.value === '\n' && ['&&', '||'].includes(previous?.value)) continue;
      if (write.start >= start && write.start < token.end) return !conditional;
      start = token.end;
      conditional = false;
    }
    previous = token;
  }
  return !conditional;
}
export function validatePublicationBody(body, analysis) {
  if (analysis.tokens.some(token => token.operator && ['<', '>', '<<', '>>', '&', '|'].includes(token.value))) fail('publication body redirects, pipelines or background execution unsupported');
  const folderOnly = analysis.publishes.length > 0 && analysis.packs.length === 0 &&
    analysis.publishes.every(publish => !publish.argv.slice(2).some(token => /^"\$/.test(token.raw)));
  for (const call of analysis.calls) {
    const index = executable(call);
    if (index < 0) continue;
    const argv = call.words.slice(index), name = argv[0].value;
    if (['read', 'export', 'unset', 'declare', 'typeset', 'local', 'eval', 'source', '.', 'printf'].includes(name)) fail('unmodeled variable write or shell evaluation');
    if (!['set', '[', 'echo', 'exit', 'case', 'esac', 'bun', 'npm', 'node', 'true', 'false'].includes(name)) fail(`unsupported publication command ${name}`);
    if (name === 'node' && !(argv.length === 3 && argv[1].value === '-p' && argv[2].value === "require('./package.json').version")) fail('unsupported node substitution');
    if (name === 'bun' && !(argv[1]?.value === 'scripts/alias_tarball.ts' && argv[2]?.value === 'pack' ||
      folderOnly && argv.length === 3 && argv[1].value === 'run' && ['typecheck', 'lint', 'selftest'].includes(argv[2].value))) fail('unsupported Bun publication command');
    if (name === 'npm' && !['publish', 'pack'].includes(argv[1]?.value)) fail('npm subcommand must be literal publish or pack');
    if (call.words.slice(0, index).length) fail('inline publication environment overrides unsupported');
  }
  for (const publish of analysis.publishes) {
    if (publish.depth !== 0 || publish.argv[0].value !== 'npm' || publish.mode !== 1) fail('publish must be a direct npm invocation');
    const argv = publish.argv.slice(2);
    let operand;
    for (let index = 0; index < argv.length; index++) {
      const token = argv[index];
      if (token.raw === '$tag' && token.dynamic && !token.quoted) {
        const writes = analysis.writes.filter(write => write.name === 'tag');
        const setup = body.indexOf(tagSetup);
        if (writes.length !== 2 || setup < 0 || setup + tagSetup.length > publish.start ||
          !topLevelAt(analysis.tokens, setup) || writes.some(write => write.start < setup || write.start >= setup + tagSetup.length)) fail('unquoted tag must be the literal empty-or---tag-rc setup');
        continue;
      }
      if (!token.dynamic && ['--provenance', '--dry-run'].includes(token.value)) continue;
      if (!token.dynamic && ['--access', '--tag'].includes(token.value)) {
        const argument = argv[++index];
        if (!argument || argument.dynamic || !/^[\w-]+$/.test(argument.value)) fail('publish option requires a literal value');
        continue;
      }
      if (token.value.startsWith('-')) fail(`unsupported publish flag ${token.value}`);
      if (operand) fail('multiple publish operands');
      const variable = /^"\$(?:([A-Za-z_][A-Za-z0-9_]*)|\{([A-Za-z_][A-Za-z0-9_]*)\})"$/.exec(token.raw);
      if (!variable) fail('tarball operand must be a quoted simple variable');
      operand = variable[1] ?? variable[2];
    }
    publish.variable = operand;
  }
  for (const pack of analysis.packs) {
    const argv = pack.argv;
    if (pack.helper) {
      if (argv[1]?.value !== 'scripts/alias_tarball.ts') fail('unsupported pack helper invocation');
      const flags = argv.slice(3);
      const names = new Set();
      for (let index = 0; index < flags.length; index += 2) {
        const flag = flags[index].value, value = flags[index + 1];
        if (!['--name', '--out', '--pack-timeout-ms'].includes(flag) || names.has(flag) || !value || value.children.length) fail('unsupported helper arguments');
        names.add(flag);
        if (flag === '--name' && (value.dynamic || !/^(?:@[\w-]+\/)?[\w-]+$/.test(value.value))) fail('helper name must be literal');
        if (flag === '--out' && !/^"\$RUNNER_TEMP\/[\w/-]+"$/.test(value.raw)) fail('helper out must be a quoted runner-temp path');
        if (flag === '--pack-timeout-ms' && (value.dynamic || !/^[1-9]\d*$/.test(value.value))) fail('helper timeout must be literal');
      }
      if (!names.has('--name') || !names.has('--out')) fail('helper name/out missing');
    } else {
      if (argv[0].value !== 'npm' || pack.mode !== 1) fail('pack must be a direct npm invocation');
      const args = argv.slice(2);
      if (args[0]?.value === '.') args.shift();
      let destination = false;
      for (let index = 0; index < args.length; index++) {
        const token = args[index];
        if (!token.dynamic && token.value === '--ignore-scripts') continue;
        if (token.value !== '--pack-destination' || destination) fail('unsupported npm pack argument');
        const value = args[++index];
        if (!value || !(value.value === '.' && !value.dynamic || !pack.directCapture && /^"\$RUNNER_TEMP\/[\w/-]+"$/.test(value.raw))) fail('captured npm pack destination must be literal dot; stdout captures only the basename');
        destination = true;
      }
      if (!destination) fail('npm pack requires literal pack destination');
    }
  }
  for (const write of analysis.writes) {
    if (!['tag', ...analysis.packs.map(pack => pack.variable)].includes(write.name)) fail(`unmodeled publication variable write ${write.name}`);
    if (write.name === 'tag' && !body.includes(tagSetup)) fail('unmodeled tag assignment');
  }
}
const expression = text => `\${{ ${text} }}`;
const mapping = value => value && typeof value === 'object' && !Array.isArray(value);
const stepList = job => Array.isArray(job?.steps) ? job.steps.filter(mapping) : [];
const noFailure = step => step && step['continue-on-error'] === undefined;
const unconditional = step => noFailure(step) && step.if === undefined;
function rootShell(job, step, context) {
  const cwd = step?.['working-directory'] ?? job.defaults?.run?.['working-directory'] ??
    context?.defaults?.run?.['working-directory'] ?? '.';
  const shell = step?.shell ?? job.defaults?.run?.shell ?? context?.defaults?.run?.shell;
  return cwd === '.' && shell === undefined;
}
function proofWired(job, proof, entry) {
  return /^rig-c\/core\/\.github\/actions\/tree-verdict@[a-f0-9]{40}$/.test(entry.actionUses) &&
    unconditional(proof) && proof.uses === entry.actionUses &&
    mapping(proof.with) && proof.with.purpose === 'publish' &&
    proof.with.declaration === (entry.declarationInput ?? entry.declaration) &&
    (proof.with.checkout === undefined || proof.with.checkout === '.') &&
    job['continue-on-error'] === undefined;
}
/** Validate additive publication declarations; coverage stays the shared planner. */
export function validatePublications(workflow, jobs, scripts, read, compileCoverage, context) {
  const errors = [];
  const report = (reason, location, detail) => errors.push(`WFL002_PUBLISH_SUITE_WITHOUT_VERDICT: ${location}: ${reason}: ${detail}`);
  const entries = workflow.publishes ?? [], readers = workflow.publicationReaders ?? [];
  const located = new Set();
  function checkEnvironment(env, location) {
    if (env !== undefined && !mapping(env)) {
      report('PUBLICATION_ENV', location, `found nonmapping env (${env === null ? 'null' : typeof env}). Requires an explicit environment mapping for a reader/tarball job`);
      return;
    }
    for (const key of Object.keys(mapping(env) ? env : {})) {
      if (key.toLowerCase() === 'node_options' || key.toLowerCase().startsWith('npm_config_')) {
        report('PUBLICATION_ENV', location, `found ${key} present. Requires this variable absent in a reader/tarball job`);
      }
    }
  }
  function inventoryActions(all, location, protectedJob, guardedEnvironment, parents = []) {
    for (const [index, step] of all.entries()) {
      const here = `${location} steps.${step.id ?? step.name ?? index}`;
      if (guardedEnvironment && parents.length) checkEnvironment(step.env, `${here} env`);
      if (parents.length && typeof step.run === 'string') {
        try {
          const analysis = inspectPublication(step.run);
          if (analysis.publishes.length) report('PUBLISH_INVENTORY', here, 'found publish in local preparation action. Requires publication in a declared job with its reader and invocation inventory');
        } catch (error) { report('PUBLICATION_SYNTAX', here, error.message); }
      }
      if (step.uses === undefined) continue;
      if (publisherAction(step.uses)) {
        report('ACTION_INVENTORY', here, `found publisher action ${step.uses}. Requires declared direct npm publication with its reader`);
      } else if (protectedJob && !admittedAction(step.uses)) {
        report('ACTION_INVENTORY', here, `unsupported action ${String(step.uses)}. ${actionRequirement(step.uses)}`);
      }
      if (step.uses !== './.github/actions/reference-video-tools') continue;
      const path = '.github/actions/reference-video-tools/action.yml';
      if (parents.includes(path) || parents.length >= 8) {
        report('ACTION_BODY', here, `found recursive local action ${path}. Requires acyclic local composites within depth 8`);
        continue;
      }
      let body;
      try { body = Bun.YAML.parse(read(path)); }
      catch { report('ACTION_BODY', here, `found missing, unreadable or malformed ${path}. Requires readable composite action.yml`); continue; }
      if (body?.runs?.using !== 'composite' || !Array.isArray(body.runs.steps) || !body.runs.steps.length ||
        body.runs.steps.length > 256 || body.runs.steps.some(inner => !mapping(inner))) {
        report('ACTION_BODY', here, `found unsupported runs in ${path}. Requires composite runs.steps with 1 to 256 step mappings`);
        continue;
      }
      inventoryActions(body.runs.steps, `${here} ${path} runs`, true, guardedEnvironment, [...parents, path]);
    }
  }
  for (const [jobId, job] of Object.entries(jobs)) {
    if (!mapping(job)) continue;
    const all = stepList(job), analyses = new Map();
    const location = `${workflow.path} jobs.${jobId}`;
    for (const step of all) {
      if (typeof step.run !== 'string') continue;
      try {
        const analysis = inspectPublication(step.run);
        analyses.set(step, analysis);
        if ((analysis.publishes.length || analysis.packs.length) && !noFailure(step)) report('PUBLISH_IGNORED_FAILURE', `${workflow.path} jobs.${jobId}`, 'pack/publish step may not ignore failure');
      }
      catch (error) { report('PUBLICATION_SYNTAX', `${workflow.path} jobs.${jobId}`, error.message); }
    }
    const jobEntries = entries.filter(entry => entry.job === jobId);
    const jobReaders = readers.filter(reader => reader.job === jobId);
    const publishing = [...analyses.values()].some(analysis => analysis.publishes.length);
    const tarballs = [...analyses.values()].some(analysis => analysis.publishes.some(publish => publish.argv.slice(2).some(token => /^"\$/.test(token.raw))));
    const declaredTarballs = jobEntries.some(entry => entry.invocations?.some(item => item.kind === 'tarball'));
    const guardedEnvironment = tarballs || declaredTarballs || jobReaders.length > 0;
    const protectedJob = jobEntries.length > 0 || jobReaders.length > 0 || publishing;
    if (publisherAction(job.uses)) report('ACTION_INVENTORY', location, `found publisher action ${job.uses}. Requires declared direct npm publication with its reader`);
    else if (protectedJob && job.uses !== undefined && job.uses !== './.github/workflows/selftest-shards.yml') {
      report('ACTION_INVENTORY', location, `found workflow action ${String(job.uses)}. Requires ./.github/workflows/selftest-shards.yml`);
    }
    inventoryActions(all, location, protectedJob, guardedEnvironment);
    const modern = jobEntries.some(entry => entry.invocations !== undefined) || jobReaders.length > 0;
    for (const [step, analysis] of analyses) {
      if (!analysis.publishes.length) continue;
      const matched = jobEntries.filter(entry => selectStep(all, entry.step) === step);
      const location = `${workflow.path} jobs.${jobId} steps.${step.id ?? step.name ?? all.indexOf(step)}`;
      if (matched.length !== 1) { report('PUBLISH_INVENTORY', location, 'npm publish step missing explicit publishes declaration or ambiguous selector'); continue; }
      located.add(matched[0]);
      if (!modern) continue;
      const entry = matched[0];
      try { validatePublicationBody(step.run, analysis); }
      catch (error) { report('PUBLICATION_SYNTAX', location, error.message); continue; }
      if (!noFailure(step) || !publicationCondition(step.if, 'steps', all, all.indexOf(step))) report('PUBLISH_CONDITION', location, 'publish requires a literal earlier same-job step output condition and no ignored failure');
      const inventory = entry.invocations ?? [{ ordinal: 0, kind: 'folder' }];
      if (inventory.length !== analysis.publishes.length || inventory.some((item, index) => item.ordinal !== index || !['folder', 'tarball'].includes(item.kind))) report('PUBLISH_INVENTORY', location, 'every npm publish invocation must be inventoried exactly once in source order');
      let covering = true;
      try { compileCoverage(JSON.parse(read(entry.declaration)), read, entry.declaration); }
      catch (error) { covering = false; errors.push(error.message); }
      const proof = selectStep(all, entry.verdictStep);
      if (!covering || !proofWired(job, proof, entry) || all.indexOf(proof) >= all.indexOf(step) ||
        !mapping(step.env) || step.env[entry.evidenceEnv] !== expression(`steps.${entry.verdictStep}.outputs.verdict-path`)) report('PUBLISH_PROOF_WIRING', location, 'covering declaration, earlier action and exact evidence environment required');
      for (const [index, publish] of analysis.publishes.entries()) {
        const item = inventory[index];
        if (!item) continue;
        if (!publish.variable) {
          if (item.kind !== 'folder') report('PUBLISH_INVENTORY', location, 'folder invocation kind differs');
          const hookOverride = [context?.env, job.env, step.env].some(env => mapping(env) && Object.entries(env).some(([key, value]) =>
            key.toLowerCase() === 'npm_config_script_shell' || key.toLowerCase() === 'npm_config_ignore_scripts' && value !== false && value !== 'false'));
          if (hookOverride || !PUBLISH_LIFECYCLE_HOOKS.includes(entry.lifecycle) || typeof entry.readerCommand !== 'string' || !entry.readerCommand.trim() || scripts[entry.lifecycle] !== entry.readerCommand) report('PUBLISH_HOOK_WIRING', location, 'actual allowlisted npm lifecycle must equal the declared reader command');
          continue;
        }
        if (item.kind !== 'tarball') { report('PUBLISH_INVENTORY', location, 'tarball invocation kind differs'); continue; }
        const producer = item.producer, packStep = producer && selectStep(all, producer.step), packed = analyses.get(packStep);
        const candidates = packed?.packs.filter(pack => pack.variable === publish.variable && pack.command === producer.command) ?? [];
        const writes = analysis.writes.filter(write => write.name === publish.variable);
        if (!producer || producer.variable !== publish.variable || packStep !== step || candidates.length !== 1 ||
          !candidates[0].directCapture || !unconditionalCapture(analysis, writes[0]) || candidates[0].start >= publish.start || writes.length !== 1 || !noFailure(packStep)) report('PUBLISH_PRODUCER', location, 'tarball needs its declared same-job producer and a single preceding assignment in this run-step scope');
      }
    }
    if (!modern) continue;
    if (!publicationCondition(job.if, 'needs', jobs) || job['continue-on-error'] !== undefined) report('PUBLISH_PROOF_WIRING', location, 'publishing job requires a literal same-workflow needs output condition and no ignored failure');
    if (job.if !== undefined) {
      const ref = String(job.if).match(/needs\.([\w-]+)\.outputs\./)?.[1];
      if (ref === jobId || !(job.needs === ref || Array.isArray(job.needs) && job.needs.includes(ref))) report('PUBLISH_PROOF_WIRING', location, 'output producer must be a direct job dependency');
    }
    const activity = [...analyses].filter(([, analysis]) => analysis.publishes.length || analysis.packs.length);
    if (guardedEnvironment) {
      const environments = [[`${workflow.path} env`, context?.env], [`${location} env`, job.env],
        ...all.map((step, index) => [`${location} steps.${step.id ?? step.name ?? index} env`, step.env])];
      for (const [where, env] of environments) {
        checkEnvironment(env, where);
      }
    }
    if (jobReaders.length && (tarballs || declaredTarballs)) {
      for (const hook of ['prepack', 'prepare', 'postpack']) {
        if (Object.hasOwn(scripts, hook)) report('PUBLISH_PACK_HOOK', location,
          `found package.json scripts.${hook}=${JSON.stringify(scripts[hook])}. Requires this field absent for reader-gated tarball publication, including --ignore-scripts`);
      }
    }
    for (const [step, analysis] of activity) {
      if (!rootShell(job, step, context)) report('PUBLISH_PROOF_WIRING', location, 'publication commands require the source-root default shell context');
      if (!publicationCondition(step.if, 'steps', all, all.indexOf(step))) report('PUBLISH_CONDITION', location, 'pack/publish condition must compare an earlier same-job output to a literal');
      if (analysis.packs.length && !analysis.publishes.length) {
        try { validatePublicationBody(step.run, analysis); }
        catch (error) { report('PUBLICATION_SYNTAX', location, error.message); }
      }
    }
    if (!tarballs && !readers.some(reader => reader.job === jobId)) continue;
    const declaredReaders = readers.filter(reader => reader.job === jobId);
    const reader = declaredReaders[0], step = reader && selectStep(all, reader.step);
    if (declaredReaders.length !== 1 || !step) { report('PUBLICATION_READER_WIRING', location, 'tarball job needs its own declared lifecycle reader step'); continue; }
    const lastPublication = Math.max(...activity.filter(([, analysis]) => analysis.publishes.length).map(([candidate]) => all.indexOf(candidate)));
    const proof = selectStep(all, reader.verdictStep);
    for (const after of all.slice(all.indexOf(step) + 1)) {
      if (typeof after.uses === 'string' && after.uses.startsWith('rig-c/core/.github/actions/tree-verdict@') && after.uses !== proof?.uses) {
        report('PUBLICATION_ACTION_REF', location, `found uses ${after.uses} after reader. Requires exactly steps.${reader.verdictStep}.uses=${String(proof?.uses)}`);
      }
    }
    for (const between of all.slice(all.indexOf(step) + 1, lastPublication + 1)) {
      if (between.uses !== undefined && admittedAction(between.uses)?.rewritesTree) {
        report('PUBLICATION_TREE_CHANGED', location, `tree-rewriting action ${between.uses} follows the publication reader`);
      }
      if (typeof between.run === 'string' && !activity.some(([candidate]) => candidate === between)) {
        report('PUBLICATION_TREE_CHANGED', location, `unmodeled run step ${between.id ?? between.name ?? all.indexOf(between)} follows the publication reader`);
      }
    }
    const readerEntry = jobEntries.find(entry => entry.verdictStep === reader.verdictStep && entry.declaration === reader.declaration);
    const tarballEntries = jobEntries.filter(entry => entry.invocations?.some(item => item.kind === 'tarball'));
    const oneContract = tarballEntries.every(entry => entry.declaration === reader.declaration &&
      entry.verdictStep === reader.verdictStep && entry.actionUses === readerEntry?.actionUses &&
      (entry.declarationInput ?? entry.declaration) === (readerEntry?.declarationInput ?? readerEntry?.declaration));
    if (!oneContract) report('PUBLICATION_READER_WIRING', location, 'every tarball entry must match the job reader declaration and proof step/source');
    const coreReader = reader.kind === 'core-prepublish';
    if (coreReader) {
      const commands = ['bun run typecheck', 'bun run lint', 'bun run selftest'];
      const declaration = JSON.parse(read(reader.declaration));
      if (reader.declaration !== 'scripts/tree-verdict.json' || declaration.chain !== commands.join(' && ') ||
        JSON.stringify(declaration.commands) !== JSON.stringify(commands) ||
        jobEntries.some(entry => (entry.declarationInput ?? entry.declaration) !== 'scripts/tree-verdict.json')) {
        report('CORE_READER_CONTRACT', location, 'core-prepublish requires scripts/tree-verdict.json and the exact typecheck/lint/selftest chain');
      }
    }
    const expected = coreReader ? 'bun scripts/prepublish_gate.ts' :
      `node "$TREE_VERDICT_TOOLS/lifecycle.mjs" --declaration ${reader.declaration} --verdict-path "$TREE_VERDICT_PATH"`;
    const readerKindValid = reader.kind === undefined || coreReader &&
      scripts.prepublishOnly === expected && jobEntries.every(entry =>
        entry.lifecycle === 'prepublishOnly' && entry.readerCommand === expected);
    if (!readerKindValid || !/^[\w-]+(?:\/[\w.-]+)*\.json$/.test(reader.declaration) || !readerEntry || !unconditional(step) || !rootShell(job, step, context) || step.run?.trim() !== expected || !proofWired(job, proof, readerEntry) ||
      all.indexOf(proof) >= all.indexOf(step) || activity.some(([candidate]) => all.indexOf(step) >= all.indexOf(candidate)) ||
      !mapping(step.env) || step.env.TREE_VERDICT_TOOLS !== expression(`steps.${reader.verdictStep}.outputs.tooling-path`) ||
      step.env.TREE_VERDICT_PATH !== expression(`steps.${reader.verdictStep}.outputs.verdict-path`)) report('PUBLICATION_READER_WIRING', location, 'unconditional exact lifecycle CLI, live action/env and order before every pack/publish required');
  }
  for (const reader of readers) if (!mapping(jobs[reader.job])) report('PUBLICATION_READER_WIRING', workflow.path, 'reader job does not exist');
  for (const entry of entries) if (entry.invocations !== undefined && !located.has(entry)) report('PUBLISH_INVENTORY', `${workflow.path} jobs.${entry.job}`, 'declared publish selector missing or not an executable npm publish');
  return errors;
}
