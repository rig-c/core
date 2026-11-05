/** Explicit declarations are the inventory. This checks YAML structure, not arbitrary shell semantics. */
import { readFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { compileCoverage } from '../.github/actions/tree-verdict/planner.mjs';

const PUBLISH_LIFECYCLE_HOOKS: readonly string[] = ['prepublishOnly', 'prepare', 'prepack'];

export interface WorkflowDeclaration {
  path: string;
  heavyJobs: string[];
  guard?: { job: string; step: string; uses: string; sourceWorkflow: string; declaration?: string; declarationInput?: string };
  publishes?: ({
    job: string; step: string; gateJob: string; verdictOutput: string; passedValue: string;
    downloadStep: string; artifact: string; evidenceEnv: string; evidenceValue: string;
    lifecycle: string; readerCommand: string; suiteScripts: string[];
  } | {
    job: string; step: string; verdictStep: string; declaration: string; declarationInput?: string; actionUses: string;
    lifecycle: string; readerCommand: string; evidenceEnv: string;
  })[];
}
export interface Declarations {
  schema: 'workflow-verdict-lint/1';
  defaultBranch: string;
  coverageDeclarations?: string[];
  workflows: WorkflowDeclaration[];
}
type Mapping = Record<string, unknown>;
const map = (v: unknown): v is Mapping => !!v && typeof v === 'object' && !Array.isArray(v);
const condition = (v: unknown) => typeof v === 'string' ? v.trim().replace(/^\$\{\{\s*|\s*\}\}$/g, '').trim() : '';
const needs = (job: Mapping, target: string) => job.needs === target || (Array.isArray(job.needs) && job.needs.includes(target));
const steps = (job: Mapping) => Array.isArray(job.steps) ? job.steps.filter(map) : [];
const active = (step: Mapping | undefined) => !!step && step.if === undefined && step['continue-on-error'] === undefined;
const expr = (s: string) => `\$\{\{ ${s} \}\}`;
function defaultPush(on: unknown, branch: string): boolean {
  if (typeof on === 'string') return on === 'push';
  if (Array.isArray(on)) return on.includes('push');
  if (!map(on) || !Object.hasOwn(on, 'push')) return false;
  const push = on.push;
  if (!map(push)) return true;
  // Tags-only pushes cannot run on the default branch.
  if (push.tags !== undefined && push.branches === undefined && push['branches-ignore'] === undefined) return false;
  // Negation/order/expression ambiguity is treated as potentially including default.
  if (Array.isArray(push.branches) && push.branches.every(x => typeof x === 'string' && !x.startsWith('!') && !x.includes('${{'))) {
    return push.branches.some(p => new Bun.Glob(p as string).match(branch));
  }
  return true;
}
export function lintWorkflows(declarations: Declarations, read: (path: string) => string): string[] {
  const errors: string[] = [];
  const error = (code: string, location: string, why: string) => errors.push(`${code}: ${location}: ${why}`);
  try {
    if (declarations.schema !== 'workflow-verdict-lint/1' || !declarations.defaultBranch ||
      !Array.isArray(declarations.workflows) || !declarations.workflows.length) throw new Error('missing inventory');
    for (const path of declarations.coverageDeclarations ?? []) compileCoverage(JSON.parse(read(path)), read, path);
    const paths = new Set<string>();
    for (const d of declarations.workflows) {
      if (!/^\.github\/workflows\/[\w-]+\.ya?ml$/.test(d.path) || paths.has(d.path) || !Array.isArray(d.heavyJobs) ||
        new Set(d.heavyJobs).size !== d.heavyJobs.length || d.heavyJobs.some(x => typeof x !== 'string' || !x)) throw new Error('invalid workflow inventory');
      paths.add(d.path);
      // Native YAML handles flow mappings, anchors, quoting and block scalars. No line-regex parser.
      const doc: unknown = Bun.YAML.parse(read(d.path));
      if (!map(doc) || !map(doc.jobs) || !Object.hasOwn(doc, 'on') ||
        !(typeof doc.on === 'string' || Array.isArray(doc.on) || map(doc.on))) throw new Error(`${d.path}: malformed workflow`);
      const jobs = doc.jobs;
      for (const heavy of d.heavyJobs) {
        if (!map(jobs[heavy])) throw new Error(`${d.path}: declared heavy job ${heavy} missing`);
        if (!defaultPush(doc.on, declarations.defaultBranch)) continue;
        const g = d.guard, job = jobs[heavy] as Mapping;
        const guard = g && map(jobs[g.job]) ? jobs[g.job] as Mapping : undefined;
        const lookup = guard && g ? steps(guard).find(s => s.id === g.step) : undefined;
        const output = guard && map(guard.outputs) ? guard.outputs.reused : undefined;
        let sourceMatches = !!g && map(lookup?.with) && lookup.with.workflow === g.sourceWorkflow;
        if (g?.declaration && map(lookup?.with) && lookup.with.declaration === (g.declarationInput ?? g.declaration)) {
          const declared: unknown = JSON.parse(read(g.declaration));
          sourceMatches = map(declared) && declared.workflow === g.sourceWorkflow;
        }
        if (!g || !guard || guard.if !== undefined || guard['continue-on-error'] !== undefined || !active(lookup) ||
          lookup?.uses !== g.uses || !sourceMatches ||
          output !== expr(`steps.${g.step}.outputs.reused`) || !needs(job, g.job) ||
          condition(job.if) !== `needs.${g.job}.outputs.reused != 'true'`) {
          error('WFL001_DEFAULT_PUSH_HEAVY_UNGUARDED', `${d.path} jobs.${heavy}`, 'declared heavy job needs a fail-closed tree-verdict guard');
        }
      }
      // Inventory is explicit, but adding a direct npm publish step cannot silently opt out.
      const declaredPublishes = d.publishes ?? [];
      const publishKeys = declaredPublishes.map(p => `${p.job}/${p.step}`);
      if (new Set(publishKeys).size !== publishKeys.length) throw new Error('duplicate publish declaration');
      for (const [jobId, job] of Object.entries(jobs)) {
        if (!map(job)) throw new Error(`${d.path}: malformed job ${jobId}`);
        for (const step of steps(job)) {
          if (typeof step.run === 'string' && /\bnpm\s+(?:--\S+\s+)*publish\b/.test(step.run) &&
            (typeof step.id !== 'string' || !declaredPublishes.some(p => p.job === jobId && p.step === step.id))) {
            error('WFL002_PUBLISH_SUITE_WITHOUT_VERDICT', `${d.path} jobs.${jobId}`, 'npm publish step missing explicit publishes declaration');
          }
        }
      }
      for (const p of d.publishes ?? []) {
        const job = map(jobs[p.job]) ? jobs[p.job] as Mapping : undefined;
        const gate = !('verdictStep' in p) && map(jobs[p.gateJob]) ? jobs[p.gateJob] as Mapping : undefined;
        const all = job ? steps(job) : [], publish = all.find(s => s.id === p.step);
        const pkg: unknown = JSON.parse(read('package.json'));
        const scripts = map(pkg) && map(pkg.scripts) ? pkg.scripts : {};
        if ('verdictStep' in p) {
          const proof = all.find(s => s.id === p.verdictStep);
          const declared: unknown = JSON.parse(read(p.declaration));
          let covering = true;
          try { compileCoverage(declared, read, p.declaration); } catch (error) { covering = false; errors.push(error instanceof Error ? error.message : 'COVER_SCHEMA'); }
          if (!PUBLISH_LIFECYCLE_HOOKS.includes(p.lifecycle) || !covering || scripts[p.lifecycle] !== p.readerCommand || !active(publish) ||
            typeof publish?.run !== 'string' || !/^npm publish(?:\s+--[a-z-]+(?:\s+[\w-]+)?)*$/.test(publish.run.trim()) ||
            publish.run.includes('--ignore-scripts') || !map(publish.env) ||
            publish.env[p.evidenceEnv] !== expr(`steps.${p.verdictStep}.outputs.verdict-path`) ||
            !active(proof) || proof?.uses !== p.actionUses || !map(proof.with) ||
            proof.with.declaration !== (p.declarationInput ?? p.declaration) || proof.with.purpose !== 'publish' ||
            all.indexOf(proof) >= all.indexOf(publish) || job?.['continue-on-error'] !== undefined) {
            error('WFL002_PUBLISH_SUITE_WITHOUT_VERDICT', `${d.path} jobs.${p.job} steps.${p.step}`, 'publish needs covering lifecycle declaration and the live verdict reader evidence');
          }
          continue;
        }
        const download = all.find(s => s.id === p.downloadStep);
        // The reader is an explicitly reviewed consumer, not inferred from its filename.
        // Direct suite hooks cannot be declared as readers; no environment switch may bypass lifecycle.
        const directSuites = p.suiteScripts.flatMap(s => [scripts[s], `bun run ${s}`, `npm run ${s}`]).filter(x => typeof x === 'string');
        if (!p.suiteScripts.length || p.suiteScripts.some(s => typeof scripts[s] !== 'string') ||
          typeof p.readerCommand !== 'string' || !p.readerCommand.trim() || directSuites.includes(p.readerCommand) ||
          scripts[p.lifecycle] !== p.readerCommand || !PUBLISH_LIFECYCLE_HOOKS.includes(p.lifecycle) ||
          !job || !gate || !map(gate.outputs) || typeof gate.outputs[p.verdictOutput] !== 'string' ||
          !condition(gate.outputs[p.verdictOutput]).startsWith('steps.') ||
          !needs(job, p.gateJob) || condition(job.if) !== `needs.${p.gateJob}.outputs.${p.verdictOutput} == '${p.passedValue}'` ||
          job['continue-on-error'] !== undefined || !active(publish) ||
          typeof publish?.run !== 'string' || !/^npm publish(?:\s+--[a-z-]+(?:\s+[\w-]+)?)*$/.test(publish.run.trim()) ||
          publish.run.includes('--ignore-scripts') || !map(publish.env) || publish.env[p.evidenceEnv] !== p.evidenceValue ||
          !active(download) || download?.uses !== 'actions/download-artifact@v4' || !map(download.with) ||
          download.with.name !== p.artifact || all.indexOf(download) >= all.indexOf(publish)) {
          error('WFL002_PUBLISH_SUITE_WITHOUT_VERDICT', `${d.path} jobs.${p.job} steps.${p.step}`, 'suite lifecycle needs a passed full-gate verdict and its declared evidence reader/download');
        }
      }
    }
  } catch (e) { error('WFL000_DECLARATION_OR_YAML', 'inventory', e instanceof Error ? e.message : 'invalid input'); }
  return errors;
}
if (import.meta.main) {
  const [config, root = '.'] = process.argv.slice(2);
  try {
    if (!config) throw new Error('usage: bun scripts/lint_workflows.ts <declarations.json> [repository-root]');
    const declarations = JSON.parse(readFileSync(config, 'utf8')) as Declarations;
    const errors = lintWorkflows(declarations, path => {
      const full = resolve(root, path), rel = relative(resolve(root), full);
      if (rel.startsWith('..') || rel.startsWith('/')) throw new Error('path outside repository');
      return readFileSync(full, 'utf8');
    });
    errors.forEach(e => console.error(e));
    if (!errors.length) console.log(`workflow lint: ${declarations.workflows.length} declared workflows passed (declared scope only)`);
    process.exitCode = errors.length ? 1 : 0;
  } catch (e) { console.error(`WFL000_DECLARATION_OR_YAML: ${e instanceof Error ? e.message : 'invalid input'}`); process.exitCode = 1; }
}
