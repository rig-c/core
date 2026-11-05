import { test, expect } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runPrepublish } from './prepublish_gate.ts';

const releaseEnvironment: NodeJS.ProcessEnv = {
  GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'sample/core', GITHUB_EVENT_NAME: 'push',
  GITHUB_WORKFLOW_REF: 'sample/core/.github/workflows/release.yml@refs/heads/main',
};

test('release evidence unset, empty or absent executes each original command once', async () => {
  const root = mkdtempSync(join(tmpdir(), 'prepublish-fallback-'));
  try {
    for (const tally of [undefined, '', join(root, 'absent.json')]) {
      const commands: string[] = [];
      const code = await runPrepublish(root, { ...releaseEnvironment, RIGC_PREPUBLISH_TALLY: tally }, {
        run: (_root, script) => { commands.push(script); return 0; },
      });
      expect({ code, commands }).toEqual({ code: 0, commands: ['typecheck', 'lint', 'selftest'] });
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('release fallback preserves the first failure and blocks subsequent publication', async () => {
  for (const failing of ['typecheck', 'lint', 'selftest']) {
    const commands: string[] = [];
    let folderEntered = false;
    const code = await runPrepublish('.', releaseEnvironment, {
      run: (_root, script) => { commands.push(script); return script === failing ? 19 : 0; },
    });
    if (code === 0) folderEntered = true;
    expect(code).toBe(19);
    expect(folderEntered).toBe(false);
    expect(commands).toEqual(['typecheck', 'lint', 'selftest'].slice(0, ['typecheck', 'lint', 'selftest'].indexOf(failing) + 1));
  }
});

test('ordinary local entry retains its original typecheck, lint and unset-tally selftest order', async () => {
  const commands: string[] = [];
  expect(await runPrepublish('.', {}, { run: (_root, script) => { commands.push(script); return 0; } })).toBe(0);
  expect(commands).toEqual(['typecheck', 'lint', 'selftest']);
});
