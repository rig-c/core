import { execFileSync } from 'node:child_process';
// Inspect the actual working copy. Runner GITHUB_SHA alone is not checkout evidence.
export function checkoutProof(cwd = process.cwd()) {
  const env = { ...process.env };
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE']) delete env[key];
  const git = (...args) => execFileSync('git', ['--no-optional-locks', ...args], {
    cwd, env, encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  const sha = git('rev-parse', 'HEAD'), tree = git('rev-parse', 'HEAD^{tree}');
  if (!/^[a-f0-9]{40}$/.test(sha) || !/^[a-f0-9]{40}$/.test(tree)) throw new Error('invalid checkout identity');
  if (git('status', '--porcelain=v1', '--untracked-files=normal')) throw new Error('checkout is dirty');
  return { sha, tree, root: git('rev-parse', '--show-toplevel') };
}
export function unchangedCheckout(before, cwd) {
  const after = checkoutProof(cwd);
  if (before.sha !== after.sha || before.tree !== after.tree) throw new Error('checkout changed during verification');
  return after;
}
