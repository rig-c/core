#!/usr/bin/env node
'use strict';

/**
 * rigc's `bin` entry has one job: hand off to Bun.
 *
 * npm's `bin` field has to be something any installed Node can run, but rigc
 * itself is a Bun script (top-level await, Bun's own APIs) — its own shebang
 * says so. On a machine without Bun that used to fail as a bare
 * `env: bun: No such file or directory`, with no hint why. This file exists
 * so that failure explains itself: if `bun` is on PATH, run the real CLI
 * (cli.ts, next to this file) under it and disappear — argv, stdio, the exit
 * code and signals all pass straight through. If it isn't, say so once and
 * stop. No downloads, no network, no writes — just the hand-off or the
 * message.
 *
 * ## Which entry (issue #1061)
 *
 * `@esotericsoftware/spine-core` is a devDependency: a clone and CI have it, an
 * install of the package does not unless somebody adds it beside. So the
 * hand-off has two targets and one rule. When the runtime resolves from this
 * package's own location — Node's resolution, from the package root, which is
 * what an import in `cli.ts` would find — the target is `cli.ts`, every
 * command, the round trip included. When it does not, the target is
 * `cli_core.ts`, the entry that links nothing of the runtime and refuses by
 * name the commands that need it. Nothing else chooses: no environment
 * variable, no flag. `--version` says which ran and why, on stderr, so the
 * version on stdout stays one line a script can read.
 */

const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const RUNTIME = '@esotericsoftware/spine-core';

/** The runtime's version where it resolves from the package root, or null where it does not. */
function runtimeVersion() {
  let manifest;
  try {
    manifest = require.resolve(`${RUNTIME}/package.json`, { paths: [root] });
  } catch {
    return null;
  }
  try {
    const version = JSON.parse(fs.readFileSync(manifest, 'utf8')).version;
    return typeof version === 'string' ? version : '(no version field)';
  } catch {
    return '(unreadable package.json)';
  }
}

const present = runtimeVersion();
const entry = present === null ? 'cli_core.ts' : 'cli.ts';
const args = process.argv.slice(2);
const result = spawnSync('bun', [path.join(root, entry), ...args], { stdio: 'inherit' });

// ⚠️ The exit and the signal are read before `error` (issue #1488): Bun 1.2.0 —
// the declared minimum, and what runs this file as `bun bin/rigc.cjs` — sets
// `error` on every child that exits non-zero, so reading it first answered the
// CLI's own refusal (exit 2) with "could not launch bun" and exit 1. `error` is
// a launch that failed only where the child left neither a status nor a signal.
// Node never sets `error` beside a status, so under node nothing here changes.
const launched = typeof result.status === 'number' || result.signal !== null;

if (launched && result.status === 0 && args.length === 1 && (args[0] === '--version' || args[0] === '-v')) {
  process.stderr.write(
    present === null
      ? `entry: ${entry} — ${RUNTIME} absent — the round trip and the commands that need it are not available here; see --help\n`
      : `entry: ${entry} — ${RUNTIME} ${present} present\n`,
  );
}

if (typeof result.status === 'number') {
  process.exit(result.status);
} else if (result.signal !== null) {
  // A signal (e.g. Ctrl-C) killed the child — die the same way instead of
  // inventing an exit code, so the caller sees the same thing it would have
  // seen running bun directly.
  process.kill(process.pid, result.signal);
} else {
  if (result.error && result.error.code === 'ENOENT') {
    process.stderr.write('rigc runs on Bun, which was not found on PATH — install it from https://bun.sh\n');
  } else if (result.error) {
    process.stderr.write(`rigc: could not launch bun: ${result.error.message}\n`);
  }
  process.exit(1);
}
