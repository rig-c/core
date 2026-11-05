import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pages } from './lookup.mjs';
const MAX_JSON = 4 * 1024 * 1024, MAX_ZIP = 1024 * 1024;
const requireData = (ok, reason) => { if (!ok) throw new Error(reason); };
async function bytes(response, limit) {
  requireData(response.ok, `API HTTP ${response.status}`);
  const chunks = []; let size = 0;
  for await (const chunk of response.body ?? []) {
    size += chunk.length;
    requireData(size <= limit, 'API body limit');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
// Runtime boundary: Node >=20 and unzip; no checkout, git, npm or write API calls.
export function githubApi({ token, apiUrl = 'https://api.github.com', temp, fetcher = fetch }) {
  const origin = new URL(apiUrl);
  requireData(origin.protocol === 'https:' && !origin.username && !origin.password && !origin.search && !origin.hash, 'invalid API origin');
  const deadline = Date.now() + 60_000;
  const request = async (path, accept = 'application/vnd.github+json') => {
    requireData(Date.now() < deadline && /^\/repos\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\//.test(path), 'API budget/path');
    try {
      return await fetcher(`${apiUrl.replace(/\/$/, '')}${path}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: accept, 'X-GitHub-Api-Version': '2022-11-28' },
        redirect: 'manual', signal: AbortSignal.timeout(Math.min(10_000, deadline - Date.now())),
      });
    } catch { throw new Error('API request failed'); }
  };
  const api = async path => {
    const data = await bytes(await request(path), MAX_JSON);
    try { return JSON.parse(data.toString('utf8')); }
    catch { throw new Error('API JSON malformed'); }
  };
  const readReceipt = async (root, run, name = 'tree-verdict-receipt') => {
    requireData(typeof name === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(name), 'invalid receipt artifact name');
    const all = await pages(api, `${root}/actions/runs/${run.id}/artifacts`, 'artifacts');
    const found = all.filter(a => a?.name === name);
    requireData(found.length === 1, 'receipt missing or ambiguous');
    const a = found[0];
    requireData(Number.isSafeInteger(a.id) && a.id > 0 && a.expired === false &&
      Number.isSafeInteger(a.size_in_bytes) && a.size_in_bytes > 0 && a.size_in_bytes <= MAX_ZIP &&
      a.workflow_run?.id === run.id && a.workflow_run?.head_sha === run.head_sha &&
      /^sha256:[a-f0-9]{64}$/.test(a.digest), 'receipt artifact metadata invalid');
    let response = await request(`${root}/actions/artifacts/${a.id}/zip`, 'application/vnd.github+json');
    if (response.status === 302) {
      const location = new URL(response.headers.get('location') ?? '');
      requireData(location.protocol === 'https:' && !location.username && !location.password && Date.now() < deadline, 'invalid archive redirect');
      // Signed storage redirect: NEVER forward the repository token.
      try { response = await fetcher(location.href, { redirect: 'error', signal: AbortSignal.timeout(Math.min(10_000, deadline - Date.now())) }); }
      catch { throw new Error('archive download failed'); }
    }
    const zip = await bytes(response, MAX_ZIP);
    requireData(`sha256:${createHash('sha256').update(zip).digest('hex')}` === a.digest, 'receipt artifact digest mismatch');
    requireData(typeof temp === 'string' && temp.length > 0, 'RUNNER_TEMP missing');
    const dir = mkdtempSync(join(temp, 'tree-verdict-'));
    try {
      const path = join(dir, 'receipt.zip'); writeFileSync(path, zip);
      const options = { encoding: 'utf8', maxBuffer: 64 * 1024, timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] };
      requireData(execFileSync('unzip', ['-Z1', path], options).trim() === 'receipt.json', 'archive must contain only receipt.json');
      const text = execFileSync('unzip', ['-p', path, 'receipt.json'], options);
      try { return JSON.parse(text); } catch { throw new Error('receipt JSON malformed'); }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  };
  return { api, readReceipt };
}
