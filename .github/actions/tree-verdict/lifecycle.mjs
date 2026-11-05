import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { readDeclaration } from './declaration.mjs';
import { publishCli } from './publish.mjs';
// npm invokes this IN PLACE OF the exact chain captured in declaration.chain.
// Every unproved/noncovering verdict runs that entire unchanged shell chain.
export async function lifecycle(args, env = process.env, injected, log = console.log) {
  let declaration;
  try {
    const options = {};
    if (args.length % 2) throw new Error('invalid arguments');
    for (let i = 0; i < args.length; i += 2) {
      if (!['--declaration', '--verdict-path', '--checkout'].includes(args[i]) || Object.hasOwn(options, args[i])) throw new Error('invalid arguments');
      options[args[i]] = args[i + 1];
    }
    declaration = readDeclaration(options['--declaration']);
    const verdict = options['--verdict-path'] ?? env.TREE_VERDICT_PATH;
    const cwd = options['--checkout'] ?? process.cwd();
    const verified = declaration.covered && !!verdict && await publishCli([
      '--verdict', verdict, '--workflow', declaration.workflow, '--gate', declaration.gate, '--checkout', cwd,
    ], env, injected, log) === 0;
    if (verified) {
      // publishCli already checked these fields against a fresh source receipt.
      const { readFileSync } = await import('node:fs');
      const proof = JSON.parse(readFileSync(verdict, 'utf8'));
      log(`TREE_VERDICT_LIFECYCLE_REUSED: run=${proof.run_id} testedSHA=${proof.tested_sha} gate=${declaration.gate}; skipped entire chain`);
      return 0;
    }
    log(`TREE_VERDICT_LIFECYCLE_FALLBACK: gate=${declaration.gate}; executing entire declared chain`);
    const shell = process.platform === 'win32' ? (env.ComSpec ?? 'cmd.exe') : '/bin/sh';
    const flags = process.platform === 'win32' ? ['/d', '/s', '/c', declaration.chain] : ['-c', declaration.chain];
    const result = spawnSync(shell, flags, { cwd, env, stdio: 'inherit' });
    return Number.isInteger(result.status) ? result.status : 1;
  } catch {
    // Without a readable original chain there is no safe command to invent. npm must refuse.
    log('TREE_VERDICT_LIFECYCLE_REFUSED: declaration unreadable/invalid; publishing blocked');
    return 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await lifecycle(process.argv.slice(2));
