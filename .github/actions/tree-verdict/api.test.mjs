import { test, expect } from 'bun:test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { githubApi } from './api.mjs';
const temp = process.env.TMPDIR;
if (!temp) throw new Error('TMPDIR must name dedicated external scratch');
const zipOf = (name, text) => execFileSync('python3', ['-c', 'import io,sys,zipfile; b=io.BytesIO(); z=zipfile.ZipFile(b,"w",zipfile.ZIP_DEFLATED); z.writestr(sys.argv[1],sys.stdin.buffer.read()); z.close(); sys.stdout.buffer.write(b.getvalue())', name], { input: text });
const run = { id: 8, head_sha: 'a'.repeat(40) };
function setup({ name = 'receipt.json', text = '{"schema":"tree-verdict/1"}', edit = () => {}, redirect = false } = {}) {
  const zip = zipOf(name, text), calls = [], scratch = mkdtempSync(join(temp, 'transport-'));
  const artifact = { id: 9, name: 'tree-verdict-receipt', expired: false, size_in_bytes: zip.length,
    workflow_run: { id: run.id, head_sha: run.head_sha }, digest: `sha256:${createHash('sha256').update(zip).digest('hex')}` };
  edit(artifact);
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/artifacts?')) return Response.json({ total_count: 1, artifacts: [artifact] });
    if (url.endsWith('/zip') && redirect) return new Response(null, { status: 302, headers: { location: 'https://storage.example/receipt' } });
    return new Response(zip);
  };
  return { ...githubApi({ token: 'secret-test-token', temp: scratch, fetcher }), calls, scratch };
}
test('real ZIP extraction, digest, bounded cleanup and token-free signed redirect', async () => {
  const s = setup({ redirect: true });
  try {
    expect(await s.readReceipt('/repos/sample/core', run)).toEqual({ schema: 'tree-verdict/1' });
    expect(s.calls.at(-1).options.headers).toBeUndefined();
    expect(s.calls.at(-1).options.redirect).toBe('error');
    expect(readdirSync(s.scratch)).toEqual([]);
  } finally { rmSync(s.scratch, { recursive: true }); }
});
for (const [name, options] of Object.entries({
  'expired': { edit: a => { a.expired = true; } },
  'wrong run': { edit: a => { a.workflow_run.id++; } },
  'wrong digest': { edit: a => { a.digest = `sha256:${'f'.repeat(64)}`; } },
  'missing digest': { edit: a => { delete a.digest; } },
  'oversize': { edit: a => { a.size_in_bytes = 2000000; } },
  'path traversal member': { name: '../receipt.json' },
  'malformed JSON': { text: '{' },
  'decompression ceiling': { text: ' '.repeat(100000) },
})) test(`artifact ${name} refuses`, async () => {
  const s = setup(options);
  try { await expect(s.readReceipt('/repos/sample/core', run)).rejects.toThrow(); expect(readdirSync(s.scratch)).toEqual([]); }
  finally { rmSync(s.scratch, { recursive: true }); }
});
test('HTTP errors, invalid JSON, network failures and response ceilings refuse', async () => {
  for (const fetcher of [async () => new Response('private failure', { status: 403 }), async () => new Response('{'),
    async () => { throw new Error('secret-test-token'); }, async () => new Response(' '.repeat(5 * 1024 * 1024))]) {
    const s = githubApi({ token: 'secret-test-token', temp, fetcher });
    await expect(s.api('/repos/sample/core/actions/runs')).rejects.toThrow();
  }
});
test('composite initializes false outputs before lookup and fallback is explicit', () => {
  const yaml = Bun.YAML.parse(readFileSync(new URL('./action.yml', import.meta.url), 'utf8'));
  const step = yaml.runs.steps[0];
  expect(step.run.indexOf('reused=false')).toBeLessThan(step.run.indexOf('node '));
  expect(step.run).toContain('|| echo');
  expect(step.env.TV_EVENT).toBe('${{ github.event_name }}');
});
