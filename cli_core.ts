#!/usr/bin/env bun
/**
 * rigc's second entry: the commands that reach nothing of spine-core (issue
 * #1052, step 4e of #380).
 *
 *   bun cli_core.ts render --candidate <dir> [flags]
 *   bun cli_core.ts check --candidate <dir> --frames <dir> [flags]
 *   bun cli_core.ts --help                 the commands this entry runs
 *
 * Which commands those are is not listed here: it is every command whose
 * `runtime` is `false` in the one command table (`src/cli/shared.ts`), and
 * every one whose `runtime` states a second body (`runtime.core`, below), and
 * `--help` prints exactly that set. This file imports nothing that links the
 * runtime — no module it reaches, statically, imports
 * `@esotericsoftware/spine-core` — so it runs with the package absent
 * (`RC24`/`RC25` in `selftest.ts` build that state and hold it). Each command
 * prints and writes what `cli.ts` prints and writes for it.
 *
 * 📦 It is also what an install runs (issue #1061): `bin/rigc.cjs` hands `rigc`
 * to this file wherever `@esotericsoftware/spine-core` does not resolve from the
 * package — a devDependency, so every install until somebody adds it beside —
 * and to `cli.ts` wherever it does. So the texts this entry prints are read in a
 * clone and in an install alike, and where one names the entry that links the
 * runtime it names both routes to it (issue #1072): installed, the same `rigc`
 * once the runtime is installed beside the package; from a source checkout,
 * `bun cli.ts`.
 *
 * ⚠️ What it cannot do, and refuses by name rather than reaching for: an input
 * only the runtime reads — a Spine export, `--poser spine`, a fallback the
 * poser line names, the deform survey of a build the core refuses — and a
 * command whose body is the runtime's (`validate`, `bench`, `bonedist`,
 * `preview`, `vote`). Both say what they needed spine-core for and that this
 * entry links none of it; the command's refusal also names the two routes to
 * the entry that runs it.
 *
 * `build` is the one name with a body here of its own (issue #1060,
 * `CORE_ENTRY_RUNS`): `cli.ts build`'s body (`runBuild`), writing the same
 * files, with another gate — the model side over the document and the round
 * trip's own rules restated over the emitted text, A00 (spine-core's parse) a
 * SKIP naming it. `--help` and `build --help` say so; the command table states
 * it (`runtime.core` in `src/cli/shared.ts`).
 */
import { CORE_COMMAND_RUNS, CORE_ENTRY_RUNS } from './src/cli/core_commands.ts';
import { runCli } from './src/cli/shared.ts';

runCli({ checkout: 'cli_core.ts', now: () => new Date().toISOString(), linksRuntime: false, runs: { ...CORE_COMMAND_RUNS, ...CORE_ENTRY_RUNS } }, process.argv.slice(2));
