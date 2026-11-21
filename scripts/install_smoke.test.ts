import { test, expect } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

// The fake npm is the actual child of the smoke, so POSIX SIGKILL reaches
// spawnSync as a signal rather than an intermediate shell's exit code.
for (const { name, end, status, signal } of [
  { name: 'signal', end: 'kill -KILL $$', status: null, signal: 'SIGKILL' },
  { name: 'exit', end: 'exit 17', status: 17, signal: null },
]) {
  test.skipIf(process.platform === 'win32')(`smoke records a child ${name} with separate stream tails`, () => {
    const temp = mkdtempSync(join(tmpdir(), 'rigc-smoke-child-control-'));
    try {
      writeFileSync(join(temp, 'npm'), [
        '#!/bin/sh',
        'printf "stdout head %05000d stdout tail\\n" 0',
        'printf "stderr head %05000d stderr tail\\n" 0 >&2',
        end,
        '',
      ].join('\n'), { mode: 0o755 });
      const launch = spawnSync(process.execPath, [join(import.meta.dir, 'install_smoke.ts'), '--case', 'clean', '--keep'], {
        encoding: 'utf8',
        env: { ...process.env, PATH: `${temp}${delimiter}${process.env.PATH ?? ''}`, TMPDIR: temp },
        timeout: 10_000,
      });
      expect(launch.error).toBeUndefined();
      expect(launch.status).toBe(1);
      expect(launch.stdout).toContain('FAIL  SMOKE_CASE[clean]');
      const fault = launch.stdout.split('\n').find((line) => line.includes('SMOKE_PACK_WROTE_A_TARBALL:'));
      expect(fault?.split(' left ')[0]).toContain(status === null ? 'was killed by SIGKILL' : 'exited 17');
      const prefix = '  SMOKE_CHILD[clean] ';
      const rows = launch.stdout.split('\n').filter((line) => line.startsWith(prefix));
      expect(rows).toHaveLength(1);
      const json = rows[0].slice(prefix.length);
      const child = JSON.parse(json);
      expect(child).toMatchObject({ command: 'npm', status, signal, error: null });
      expect(child.args[0]).toBe('pack');
      expect(child.stdoutTail).toMatch(/ stdout tail\n$/);
      expect(child.stderrTail).toMatch(/ stderr tail\n$/);
      expect(child.stdoutTail).toHaveLength(2_000);
      expect(child.stderrTail).toHaveLength(2_000);
      expect(child.stdoutTail).not.toMatch(/head|stderr/);
      expect(child.stderrTail).not.toMatch(/head|stdout/);
      const kept = /^ {10}kept: (.+)$/m.exec(launch.stdout)?.[1];
      expect(kept).toBeDefined();
      expect(readFileSync(join(kept!, 'child-failures.jsonl'), 'utf8')).toBe(`${json}\n`);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });
}

test('smoke records an executable missing at spawn time', async () => {
  const { caseCommandRunner } = await import('./install_smoke.ts');
  const temp = mkdtempSync(join(tmpdir(), 'rigc-smoke-child-control-'));
  try {
    const rows: string[] = [];
    const run = caseCommandRunner((row) => rows.push(row));
    const missing = join(temp, 'missing-executable');
    run(missing, [], temp);
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0])).toMatchObject({
      command: missing,
      status: null,
      signal: null,
      error: { code: 'ENOENT', message: expect.any(String) },
      stdoutTail: '',
      stderrTail: '',
    });
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test.skipIf(process.platform !== 'win32')('smoke records the Windows batch shim exit and preserves its arguments', async () => {
  const { caseCommandRunner } = await import('./install_smoke.ts');
  const temp = mkdtempSync(join(tmpdir(), 'rigc smoke child control '));
  try {
    const shim = join(temp, 'numeric exit.cmd');
    writeFileSync(shim, '@echo off\r\necho %~1\r\n>&2 echo shim stderr\r\nexit /b 17\r\n');
    const rows: string[] = [];
    const run = caseCommandRunner((row) => rows.push(row));
    expect(run(shim, ['quoted argument'], temp).status).toBe(17);
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0])).toMatchObject({
      command: shim,
      args: ['quoted argument'],
      status: 17,
      signal: null,
      error: null,
      stdoutTail: 'quoted argument\r\n',
      stderrTail: 'shim stderr\r\n',
    });
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
