import { createHash } from 'node:crypto';
import { pages } from './lookup.mjs';
export const stable = value => JSON.stringify(sort(value));
function sort(v) { return Array.isArray(v) ? v.map(sort) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sort(v[k])])) : v; }
export const digest = value => createHash('sha256').update(typeof value === 'string' ? value : stable(value)).digest('hex');
const object = v => !!v && typeof v === 'object' && !Array.isArray(v);
export function requireCoverage(ok, code, reason) { if (!ok) throw new Error(`${code}: ${reason}`); }
const need = requireCoverage;
export function canonicalCoverage(d) {
  need(d?.schema === 'tree-verdict-lifecycle/2', 'COVER_SCHEMA', 'requires lifecycle/2');
  need(/^\.github\/workflows\/[\w-]+\.ya?ml$/.test(d.workflow) && /^[a-z][a-z0-9-]{0,19}\/[1-9][0-9]*$/.test(d.gate), 'COVER_SCHEMA', 'workflow/gate invalid');
  need(typeof d.chain === 'string' && d.chain.length > 0 && d.chain.length < 16384 && Array.isArray(d.commands) && d.commands.length > 0 &&
    d.commands.every(c => typeof c === 'string' && !!c.trim()) && d.commands.join(' && ') === d.chain && new Set(d.commands).size === d.commands.length, 'COVER_COMMAND', 'commands must cover exact original chain once');
  need(object(d.covers) && object(d.jobs) && d.checkoutPolicy === 'event-sha' && /^[\w-]+$/.test(d.producer?.job), 'COVER_SCHEMA', 'covers/jobs/producer/checkout policy required');
  need(stable(Object.keys(d.covers).sort()) === stable([...d.commands].sort()), 'COVER_COMMAND', 'covers keys differ from full command inventory');
  const groups = Object.keys(d.jobs).sort();
  need(groups.length > 0 && groups.length <= 32, 'COVER_JOB', 'empty/oversized job inventory');
  const jobs = {}, names = new Set(), paths = new Set();
  for (const group of groups) {
    const j = d.jobs[group];
    need(Array.isArray(j?.path) && j.path.length > 0 && j.path.length <= 5 && j.path.every(x => typeof x === 'string' && /^[\w-]+$/.test(x)) && ['plain', 'shard', 'merge'].includes(j.role), 'COVER_JOB', 'invalid job path/role');
    need(!paths.has(j.path.join('/')) && j.path[0] !== d.producer.job, 'COVER_JOB', 'duplicate/self covering job'); paths.add(j.path.join('/'));
    need(Array.isArray(j.legs) && j.legs.length > 0 && j.legs.length <= 256, 'COVER_MATRIX', 'missing/oversized legs');
    const legs = j.legs.map(l => {
      need(object(l?.matrix) && Object.values(l.matrix).every(v => ['string', 'number', 'boolean'].includes(typeof v)) && typeof l.apiName === 'string' && l.apiName.length > 0 && l.apiName.length < 256, 'COVER_MATRIX', 'invalid leg selector');
      need(!names.has(l.apiName), 'COVER_MATRIX', 'duplicate expected API name'); names.add(l.apiName);
      return { matrix: sort(l.matrix), apiName: l.apiName };
    }).sort((a, b) => stable(a) < stable(b) ? -1 : stable(a) > stable(b) ? 1 : 0);
    jobs[group] = { path: [...j.path], role: j.role, legs };
  }
  const used = new Set(); const covers = {};
  for (const command of [...d.commands].sort()) {
    const refs = d.covers[command];
    need(Array.isArray(refs) && refs.length > 0 && refs.every(g => groups.includes(g)) && new Set(refs).size === refs.length, 'COVER_JOB', 'unknown/duplicate covering group');
    refs.forEach(g => used.add(g)); covers[command] = [...refs].sort();
    if (refs.some(g => jobs[g].role === 'shard')) need(refs.some(g => jobs[g].role === 'merge'), 'COVER_MERGE', 'sharded command must cover a merge');
  }
  need(used.size === groups.length, 'COVER_JOB', 'unreferenced job group');
  const producer = { job: d.producer.job, step: d.producer.step ?? 'receipt', apiName: d.producer.apiName ?? d.producer.job };
  need(typeof producer.apiName === 'string' && producer.apiName.length > 0 && !names.has(producer.apiName) && /^[\w-]+$/.test(producer.step), 'COVER_PRODUCER', 'invalid collector step');
  return { schema: d.schema, workflow: d.workflow, label: d.gate, chain: d.chain, commands: [...d.commands], covers, jobs, producer, checkoutPolicy: d.checkoutPolicy };
}
export function gateFor(coverage) { return `${coverage.label}/sha256-${digest(coverage)}`; }
export function validateCollectorProof(proof, coverage) {
  need(proof?.schema === 'tree-verdict-collector/2' && proof.compiler === 'static-coverage/2' && stable(proof.coverage) === stable(coverage) && proof.digest === digest(coverage) && proof.collectorName === coverage.producer.apiName, 'COVER_PRODUCER', 'missing/different compiled collector proof');
  need(Array.isArray(proof.sources) && proof.sources.length > 0 && proof.sources.length <= 8 &&
    proof.sources.every(s => /^\.github\/workflows\/[\w-]+\.ya?ml$/.test(s.path) && /^[a-f0-9]{64}$/.test(s.sha256)) && new Set(proof.sources.map(s => s.path)).size === proof.sources.length && proof.sources.some(s => s.path === coverage.workflow), 'COVER_PRODUCER', 'incomplete compiler source inventory');
}
export async function attemptJobs(root, run, coverage, api, collecting = false) {
  const rows = await pages(api, `${root}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs`, 'jobs');
  const ids = new Set(), names = new Set();
  for (const row of rows) {
    need(Number.isSafeInteger(row?.id) && row.id > 0 && !ids.has(row.id), 'COVER_API_JOBS', 'duplicate/malformed job ID'); ids.add(row.id);
    need(typeof row.name === 'string' && !names.has(row.name), 'COVER_API_JOBS', 'ambiguous duplicate display name'); names.add(row.name);
    need(row.run_id === run.id && row.run_attempt === run.run_attempt && row.head_sha === run.head_sha, 'COVER_API_JOBS', 'job run/attempt/head mismatch');
  }
  const result = [];
  for (const [group, job] of Object.entries(coverage.jobs)) for (const leg of job.legs) {
    const found = rows.filter(r => r.name === leg.apiName);
    need(found.length === 1 && found[0].status === 'completed' && found[0].conclusion === 'success', 'COVER_API_JOBS', `missing/non-success leg ${leg.apiName}`);
    result.push({ group, matrix: leg.matrix, id: found[0].id, name: found[0].name, run_id: run.id, run_attempt: run.run_attempt, head_sha: run.head_sha, status: 'completed', conclusion: 'success' });
  }
  return { rows, jobs: result };
}
export function collectorRow(rows, name, collecting) {
  const matches = rows.filter(r => r.name === name);
  need(matches.length === 1 && matches[0].status === (collecting ? 'in_progress' : 'completed') && matches[0].conclusion === (collecting ? null : 'success'), 'COVER_PRODUCER', 'collector job missing/not successful');
  return { id: matches[0].id, name };
}
