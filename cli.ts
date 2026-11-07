#!/usr/bin/env bun
/**
 * rigc — the rig compiler.
 *
 *   bun cli.ts build --rig <path> --motion <path> --out <dir> [--manifest <path>]
 *   bun cli.ts build --cut <name> --cuts <cuts.json>
 *   bun cli.ts explain --rig <path> --motion <path> --out <dir>
 *   bun cli.ts explain --cut <name> --cuts <cuts.json>
 *   bun cli.ts validate <dir>            re-run the gate on artifacts on disk
 *   bun cli.ts check --candidate <dir> --frames <dir>   compare against pictures
 *
 * `build` emits ONLY if validate is green. That ordering is the point: the
 * compiler is allowed to be wrong, it is not allowed to leave the wrong thing
 * on disk.
 *
 * ⚠️ Green is a claim about VALIDITY and about nothing else. The gate has no way
 * to know whether the animation is the one that was asked for — a build with
 * every easing reversed passes it — so `check` is the other half of the loop, and
 * it is a separate command because it needs something the gate does not have: a
 * picture of what the result is supposed to look like.
 *
 * rigc knows nothing about any particular project. A cut is a rig spec, a motion
 * spec and an output directory — plus a cut manifest when there is measured art
 * behind it — and a `cuts.json` is a named table of them:
 *
 *   {
 *     "my_cut": { "rig": "…/rigs/my_rig.rig.json", "motion": "…/my.motion.json",
 *                 "out": "…/spine", "manifest": "…/manifest.json" }
 *   }
 *
 * Its paths resolve against the cuts.json file itself, so the table travels
 * with the project that owns the art rather than with this repository.
 */
import { PROFILE_RULES, SPINE_COMMAND_REFUSALS, SPINE_COMMAND_RUNS } from './src/cli/spine_commands.ts';
import { CORE_COMMAND_RUNS } from './src/cli/core_commands.ts';
import { runCli } from './src/cli/shared.ts';
// The Spine side of the seam (issue #1052): loading the modules that link spine-core registers what they pose and read
// through it — an export's poser and loader, `--poser spine`, a fallback, the deform survey through the runtime — into
// `src/spine_side.ts`, which the commands below reach it through.
import './src/render.ts';
import './src/deformmeasure.ts';

/**
 * One entry of a cuts.json, every path relative to the cuts.json file — the
 * shape `src/cli/shared.ts` reads, re-exported where it was always declared.
 */
export type { CutEntry, CutTable } from './src/cli/shared.ts';

// ⭐ Every command, every refusal and every exit code as they always were: the dispatch, the documentation and the
// bodies moved to `src/cli/` unchanged (issue #1052), and this entry registers all of them. `cli_core.ts` registers the
// commands whose bodies reach nothing of the runtime, and links none of it.
runCli(
  {
    checkout: 'cli.ts',
    now: () => new Date().toISOString(),
    linksRuntime: true,
    runs: { ...CORE_COMMAND_RUNS, ...SPINE_COMMAND_RUNS },
    profileRules: PROFILE_RULES,
    refusals: SPINE_COMMAND_REFUSALS,
  },
  process.argv.slice(2),
);
