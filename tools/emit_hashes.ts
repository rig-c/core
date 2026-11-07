/**
 * emit_hashes — every build in every corpus hashed, and two such hash documents
 * compared across commits (issue #914, step 1a of issue #380).
 *
 *   bun tools/emit_hashes.ts recipes --out <recipes.json>
 *   bun tools/emit_hashes.ts run --recipes <recipes.json> --out <hashes.json>
 *                                [--work <dir> | --keep-work] [--root <dir>]
 *   bun tools/emit_hashes.ts compare <a.json> <b.json>
 *   bun tools/emit_hashes.ts base [--check] [--file <hashes.json>]
 *                                 [--work <dir> | --keep-work] [--root <dir>]
 *
 * ⭐ Why this exists. Step 1 of issue #380 constructs a compiled model before
 * the Spine emitter, and it is gated by byte identity: every build in every
 * corpus writes the same bytes before and after each cut. `A18_DETERMINISTIC_EMIT`
 * compares two compiles inside ONE run of ONE commit; nothing compared a build
 * across two commits. This tool is that instrument, and it is measurement only:
 * it changes nothing under `src/` and nothing in `cli.ts`.
 *
 * The wall-clock producer receipt `run.json` is excluded. Every other file is compared.
 *
 * ⚠️ It hashes what lands on disk through the CLI, not what `compile()` returns.
 * `build --pack` and `build --copy-images` write atlas text after `compile` has
 * returned (docs/COMPILED_MODEL.md §5, third bullet), so a gate on the return
 * value would be blind to exactly the emission a refactor is likeliest to move.
 * That is also why this file starts child processes: it runs `bun cli.ts …` as a
 * caller does. `tools/` is not `src/`, so the purity rule does not reach it, and
 * no other module here spawns anything.
 *
 * ## A recipe, and why its inputs are staged
 *
 * A recipe is an ordered list of CLI commands with two placeholders, `{{work}}`
 * (a fresh directory of its own) and `{{out}}` (`{{work}}/out`), plus a list of
 * inputs to copy into `{{work}}` before the first command runs:
 *
 *   { "name": "gallery/flex",
 *     "stage": [{ "from": "gallery/flex", "to": "gallery/flex" }],
 *     "commands": [["build", "--rig", "{{work}}/gallery/flex/rig.json", …,
 *                   "--out", "{{out}}"]] }
 *
 * The last command's `--out` must be `{{out}}`, and the files under it are what
 * gets hashed. A chain stops at the first command that exits non-zero: a
 * `build` over specs an `ingest` refused to finish would measure nothing.
 *
 * 🔒 **The inputs are copied, not read in place, and that is measured rather
 * than tidy.** `build` spells `skeleton.images` and every atlas page name as a
 * path relative to `--out`. A gallery rig built in place into two temp
 * directories one level apart wrote two different skeleton files: its `images`
 * read `../../(nine of them)/Users/…/gallery/look/parts/` in one and ten `../`
 * in the other, and the atlas's page line differed the same way. So a build
 * read in place hashes the location of the checkout and of the work directory,
 * and two commits in two worktrees would read DIFF on every recipe. Staged, the
 * spelling is `../gallery/look/parts/` wherever `{{work}}` is.
 *
 * `from` is resolved against `--root` (default: the checkout this file is in)
 * when relative, taken as given when absolute; `to` is a relative path that
 * stays inside `{{work}}`. `--root` is also how a private corpus is run: its
 * recipes file is written wherever that corpus lives and nothing about it
 * enters this tree — this file needs no code for it.
 *
 * `--recipes` also takes an `emit-hashes/1` document and runs its recipes (its
 * `name`, `stage` and `commands`), so the run after a cut repeats exactly the
 * recipes of the base it will be compared with, without a second file.
 *
 * The CLI that runs is always the one beside this file (`../cli.ts`), with its
 * working directory set to the recipe's `{{work}}`.
 *
 * ## `run` — the document, `"spec": "emit-hashes/1"`
 *
 * `JSON.stringify(doc, null, 2)` and a newline. Key order is fixed and is the
 * order written here; recipes are sorted by `name` and files by `path`, both by
 * UTF-16 code unit (not locale). Two runs of one recipes file write
 * byte-identical documents: nothing about time, the work directory or the host
 * is in it. The run's wall time is printed to stderr and nowhere else.
 *
 * - `spec` — `"emit-hashes/1"`.
 * - `recipes` — one object per recipe:
 *   - `name`, `stage`, `commands` — the recipe exactly as the recipes file
 *     states it, placeholders UNRESOLVED (a resolved command line carries the
 *     work directory, which differs on every run);
 *   - `exits` — the exit code of each command that ran, in order (`null` for a
 *     child ended by a signal); shorter than `commands` when the chain stopped;
 *   - `files` — `{ "path", "size", "sha256" }` for every file under `{{out}}`
 *     after the last command, `path` relative to `{{out}}` with `/`
 *     separators, `sha256` lower-case hex. Empty when nothing was written — a
 *     refused build writes nothing, and that is recorded, not dropped.
 *
 * The per-recipe work directories are kept (numbered in name order, each with a
 * `log-<i>.txt` of every command's output beside `out/`) so a difference can be
 * opened; the root is named on stderr.
 *
 * ## `compare`
 *
 * IDENTICAL (exit 0) when every recipe has the same exits and the same file set
 * with the same sizes and hashes. Otherwise (exit 1), per recipe that differs:
 * exits that differ, each file whose hash differs (with the size on both
 * sides), each file on one side only; and every recipe on one side only. A
 * refused recipe is compared like any other — its exit code is data.
 *
 * Exit 2, by name, when the pair cannot be compared: a missing file, a file
 * that is not an `emit-hashes/1` document, or two documents from different
 * recipe sets — the same recipe name standing for a different `stage` or
 * `commands` on the two sides. A recipe present on one side only is not that:
 * a corpus that grew is a difference to report, while one name meaning two
 * builds would turn every verdict under it into a statement about the recipes.
 *
 * ## `recipes`
 *
 * The recipes for this tree's own corpora, generated from the tree:
 *
 * - every `examples/<ex>/export/<file>.json` — the fetched editor exports —
 *   rebuilt the way docs/COMPILED_MODEL.md §4 built them and the pose oracle's
 *   corpus rows pair them: `ingest --art none` into `{{work}}/specs`, then
 *   `build --atlas-in <pack>` into `{{out}}`, the export directory staged as
 *   `{{work}}/export`. The pack is resolved, not guessed: a directory with one
 *   `.atlas` uses it; a directory with several tries each in file-name order
 *   and takes the first whose chain exits 0 on every command. If none does,
 *   every candidate is written as its own recipe (`<name> [<pack>]`) and
 *   stderr says so, because picking one would be a guess.
 * - every `gallery/<name>/` that has a `rig.json`, with the `build` command its
 *   own README states (the first `bun cli.ts build` line whose `--rig` is that
 *   example's `rig.json`), each `gallery/<name>/…` path moved under
 *   `{{work}}` and the stated `--out` replaced by `{{out}}`. A README that
 *   states no such line is a FINDING printed on stderr, and the recipe takes
 *   the form `gallery/README.md` states for every example.
 *
 * An absent `examples/` is printed as a HOLE on stderr, never silently empty.
 *
 * ## `base` — the tracked base, `tools/emit_hashes.base.json` (issue #930)
 *
 * The five step-1 gates in `selftest.ts` (`MB07`, `MV09`, `MS12`, `MA12`,
 * `MD07`) hold this tree's builds to a base hash document. CI names none, so
 * until #930 each of them printed SKIP and a HOLE on every CI run. The tracked
 * base is what they read when `RIGC_EMIT_HASHES_BASE` is unset; the variable
 * still overrides it with a fuller document (the fetched exports' rows).
 *
 * ⚠️ **That file is a plain `emit-hashes/1` document and nothing else** — JSON
 * carries no comment, so this paragraph is its header. It holds the gallery's
 * rows only: every `gallery/<name>/` with a `rig.json`, built the way its README
 * states (the same recipes `recipes` writes for the gallery). The fetched
 * exports are left out because `examples/` is gitignored and absent in CI, so a
 * row for them would be a row no CI run can build.
 *
 * 🔸 **It carries the Spine files only — `skeleton.json` and the atlas — and
 * leaves `skeleton.model.json` out of every row**, because the model document
 * is measured NOT to be machine-independent. The base taken on the machine it
 * was written on read STALE on the first Linux CI run (PR #941, run
 * 36548303780) on exactly one row and one file: `gallery/look`'s
 * `skeleton.model.json`, 394523 bytes `6e0960b0a4c2` in the file against 394529
 * bytes `e15d81552ae1` on CI, while `skeleton.json` and `skeleton.atlas` were
 * identical on all seven rows. The field #942 found is not a six-decimal one:
 * it is a carried report, `meshes[].depth.ceiling.*.degrees`/`p1`, spelled as a
 * full double from `Math.atan` until #942's closing cut put it on the r6 grid
 * (macOS's atan sits 0.512 ulp below the correctly rounded value Linux
 * returns); every r6 field of the 19 recipes moved by no byte under a ±1 ulp
 * perturbation of every libm function. So the base
 * holds the Spine files only on every machine, and a fuller document named by
 * `RIGC_EMIT_HASHES_BASE` still
 * holds every file, the model document included. `MD07` reads this base in its
 * original sense: every row differs from it by exactly the added document.
 *
 * 🔒 **It is written by one command and never by hand**: `bun tools/emit_hashes.ts
 * base` regenerates it in place, and `--file` writes it elsewhere. A gallery row
 * that exits non-zero is refused by name and nothing is written, because a base
 * is a record of green builds. `base --check` builds the same rows afresh and
 * compares the result with the file BYTE for byte: CURRENT exits 0; STALE exits
 * 1 with each differing row and file and the command that refreshes it. A file
 * whose hashes all agree but whose bytes do not is STALE too — that is a file
 * somebody edited, which is the one way it may not change. `selftest.ts`'s
 * `EH06` runs the check on the tree and `EH07` plants a moved gallery build.
 *
 * Exit codes throughout: 0 done (or IDENTICAL, or CURRENT), 1 DIFF (or STALE),
 * 2 a bad input by name.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { RUN_STAMP_FILE } from '../src/cli/run_stamp.ts';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';
import { MODEL_DOCUMENT_FILE } from '../src/model.ts';
import { readKeepWork, WorkDirectory } from './work_dir.ts';

export const HASHES_SPEC = 'emit-hashes/1';
export const RECIPES_SPEC = 'emit-hashes-recipes/1';

/** The checkout this file belongs to: the default `--root`, and where `cli.ts` is. */
export const TREE_ROOT = resolve(import.meta.dir, '..');
const CLI = join(TREE_ROOT, 'cli.ts');

/** The tracked base's place in the checkout, and the one command that writes it (issue #930). */
export const BASE_FILE = 'tools/emit_hashes.base.json';
export const BASE_COMMAND = 'bun tools/emit_hashes.ts base';

/** A gallery run as the tracked base records it: every row without the model document (see `## base`). */
export function spineFilesOnly(doc: HashesDocument): HashesDocument {
  return { ...doc, recipes: doc.recipes.map((r) => ({ ...r, files: r.files.filter((f) => f.path !== MODEL_DOCUMENT_FILE) })) };
}

/** A refusal about an input — the command exits 2 on it. */
export class HashesInputError extends Error {}

export interface StageEntry {
  from: string;
  to: string;
}

export interface Recipe {
  name: string;
  stage: StageEntry[];
  commands: string[][];
}

export interface HashedFile {
  path: string;
  size: number;
  sha256: string;
}

export interface HashedRecipe extends Recipe {
  exits: Array<number | null>;
  files: HashedFile[];
}

export interface HashesDocument {
  spec: string;
  recipes: HashedRecipe[];
}

export interface RecipesDocument {
  spec: string;
  recipes: Recipe[];
}

/** UTF-16 code-unit order, never the locale's. */
function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// ---------------------------------------------------------------------------
// reading a recipes file, refusing every malformed field by name
// ---------------------------------------------------------------------------

const PLACEHOLDER = /\{\{([^}]*)\}\}/g;

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

/** One recipe checked field by field; every problem is pushed, none thrown. */
function recipeProblems(value: unknown, where: string): { recipe: Recipe | null; problems: string[] } {
  const problems: string[] = [];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return { recipe: null, problems: [`${where} is not an object`] };
  const record = value as Record<string, unknown>;
  const name = record.name;
  if (typeof name !== 'string' || name === '') problems.push(`${where}.name is not a non-empty string`);
  const label = typeof name === 'string' ? `recipe ${JSON.stringify(name)}` : where;
  const stage: StageEntry[] = [];
  if (!Array.isArray(record.stage)) problems.push(`${label}: stage is not an array`);
  else {
    record.stage.forEach((entry, i) => {
      const e = entry as Record<string, unknown>;
      if (typeof entry !== 'object' || entry === null || typeof e.from !== 'string' || typeof e.to !== 'string') {
        problems.push(`${label}: stage[${i}] is not { "from": <string>, "to": <string> }`);
        return;
      }
      const to = e.to;
      if (to === '' || isAbsolute(to) || normalize(to).split(sep).includes('..')) {
        problems.push(`${label}: stage[${i}].to ${JSON.stringify(to)} is not a relative path inside {{work}}`);
      }
      stage.push({ from: e.from, to });
    });
  }
  const commands: string[][] = [];
  if (!Array.isArray(record.commands) || record.commands.length === 0) problems.push(`${label}: commands is not a non-empty array`);
  else {
    record.commands.forEach((command, i) => {
      if (!isStringArray(command) || command.length === 0) {
        problems.push(`${label}: commands[${i}] is not a non-empty array of strings`);
        return;
      }
      for (const arg of command) {
        for (const m of arg.matchAll(PLACEHOLDER)) {
          if (m[1] !== 'work' && m[1] !== 'out') problems.push(`${label}: commands[${i}] names {{${m[1]}}}; the placeholders are {{work}} and {{out}}`);
        }
      }
      commands.push(command);
    });
    const last = commands[commands.length - 1];
    if (last !== undefined && commands.length === record.commands.length) {
      const at = last.indexOf('--out');
      if (at < 0 || last[at + 1] !== '{{out}}') {
        problems.push(`${label}: the last command's --out is ${at < 0 ? 'absent' : JSON.stringify(last[at + 1])}; it must be {{out}}, the directory that is hashed`);
      }
    }
  }
  for (const key of Object.keys(record)) {
    if (key !== 'name' && key !== 'stage' && key !== 'commands') problems.push(`${label}: unknown key ${JSON.stringify(key)}`);
  }
  return { recipe: problems.length === 0 ? { name: name as string, stage, commands } : null, problems };
}

/** A recipes file, read whole; every problem named in one refusal. */
export function readRecipes(path: string): Recipe[] {
  if (!existsSync(path)) throw new HashesInputError(`no such recipes file ${path}`);
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new HashesInputError(`${path}: not JSON — ${(err as Error).message}`);
  }
  const record = value as Record<string, unknown>;
  const spec = typeof value === 'object' && value !== null ? record.spec : undefined;
  if (spec !== RECIPES_SPEC && spec !== HASHES_SPEC) {
    throw new HashesInputError(`${path}: spec is ${JSON.stringify(spec ?? value)}, not ${JSON.stringify(RECIPES_SPEC)} or ${JSON.stringify(HASHES_SPEC)}`);
  }
  return recipesOfValue(record.recipes, path, spec === HASHES_SPEC);
}

/**
 * A recipes array as a recipes file or a hash document holds it, checked field
 * by field and refused whole (every problem named). `measured` says the entries
 * carry what a run measured beside their `name`, `stage` and `commands`, which
 * is not read back as an input. Exported so `tools/render_hashes.ts` reads the
 * recipes of its own documents with this reader rather than a second one.
 */
export function recipesOfValue(value: unknown, path: string, measured: boolean): Recipe[] {
  if (!Array.isArray(value) || value.length === 0) throw new HashesInputError(`${path}: recipes is not a non-empty array`);
  const problems: string[] = [];
  const recipes: Recipe[] = [];
  value.forEach((entry, i) => {
    const e = entry as Record<string, unknown>;
    const r = recipeProblems(
      measured && typeof entry === 'object' && entry !== null ? { name: e.name, stage: e.stage, commands: e.commands } : entry,
      `recipes[${i}]`,
    );
    problems.push(...r.problems);
    if (r.recipe !== null) recipes.push(r.recipe);
  });
  const seen = new Set<string>();
  for (const r of recipes) {
    if (seen.has(r.name)) problems.push(`recipe ${JSON.stringify(r.name)} is named twice`);
    seen.add(r.name);
  }
  if (problems.length > 0) throw new HashesInputError(`${path}: ${problems.length} problem(s): ${problems.join('; ')}`);
  return recipes.sort((a, b) => byCodeUnit(a.name, b.name));
}

// ---------------------------------------------------------------------------
// running recipes
// ---------------------------------------------------------------------------

/** Every file under `dir`, relative, `/`-separated, in code-unit order. */
function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (at: string): void => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const full = join(at, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (relative(dir, full) !== RUN_STAMP_FILE) out.push(relative(dir, full).split(sep).join('/'));
    }
  };
  walk(dir);
  return out.sort(byCodeUnit);
}

function resolveArg(arg: string, work: string, out: string): string {
  return arg.split('{{work}}').join(work).split('{{out}}').join(out);
}

/**
 * One recipe into `work`, which must not exist yet: stage, run the chain,
 * hash `{{out}}`. The logs are written beside `out/`, never under it.
 */
export function runRecipe(recipe: Recipe, work: string, root: string): HashedRecipe {
  const out = join(work, 'out');
  mkdirSync(work, { recursive: true });
  for (const entry of recipe.stage) {
    const from = isAbsolute(entry.from) ? entry.from : join(root, entry.from);
    if (!existsSync(from)) throw new HashesInputError(`recipe ${JSON.stringify(recipe.name)}: stage from ${JSON.stringify(entry.from)} — nothing at ${from}`);
    cpSync(from, join(work, entry.to), { recursive: true, dereference: true });
  }
  const exits: Array<number | null> = [];
  recipe.commands.forEach((command, i) => {
    if (exits.some((code) => code !== 0)) return;
    const args = command.map((arg) => resolveArg(arg, work, out));
    const result = spawnSync(process.execPath, [CLI, ...args], { cwd: work, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    writeFileSync(join(work, `log-${i}.txt`), `$ rigc ${args.join(' ')}\n${result.stdout}\n--- stderr ---\n${result.stderr}`);
    exits.push(result.status);
  });
  const files = filesUnder(out).map((path): HashedFile => {
    const bytes = readFileSync(join(out, path));
    return { path, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  });
  return { name: recipe.name, stage: recipe.stage, commands: recipe.commands, exits, files };
}

export function hashesText(doc: HashesDocument): string {
  const ordered: HashesDocument = {
    spec: doc.spec,
    recipes: doc.recipes.map((r) => ({
      name: r.name,
      stage: r.stage.map((s) => ({ from: s.from, to: s.to })),
      commands: r.commands,
      exits: r.exits,
      files: r.files.map((f) => ({ path: f.path, size: f.size, sha256: f.sha256 })),
    })),
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

/** Every recipe, each in `<work>/<NNN>` (name order), into one document. */
export function runRecipes(recipes: readonly Recipe[], work: string, root: string, progress: (line: string) => void): HashesDocument {
  const width = String(recipes.length).length;
  const hashed = recipes.map((recipe, i) => {
    const r = runRecipe(recipe, join(work, String(i).padStart(width, '0')), root);
    const code = r.exits.find((e) => e !== 0);
    progress(`  exit ${code === undefined ? 0 : code}  ${String(r.files.length).padStart(3)} file(s)  ${r.name}`);
    return r;
  });
  return { spec: HASHES_SPEC, recipes: hashed };
}

// ---------------------------------------------------------------------------
// comparing two documents
// ---------------------------------------------------------------------------

function asHashesDocument(value: unknown, path: string): HashesDocument {
  const record = value as Record<string, unknown>;
  if (typeof value !== 'object' || value === null || record.spec !== HASHES_SPEC) {
    throw new HashesInputError(`${path}: spec is ${JSON.stringify(typeof value === 'object' && value !== null ? record.spec : value)}, not ${JSON.stringify(HASHES_SPEC)}`);
  }
  if (!Array.isArray(record.recipes)) throw new HashesInputError(`${path}: recipes is not an array`);
  const problems: string[] = [];
  const recipes: HashedRecipe[] = [];
  record.recipes.forEach((entry, i) => {
    const e = entry as Record<string, unknown>;
    const base = recipeProblems(
      typeof entry === 'object' && entry !== null ? { name: e.name, stage: e.stage, commands: e.commands } : entry,
      `recipes[${i}]`,
    );
    problems.push(...base.problems);
    const exitsOk = Array.isArray(e?.exits) && e.exits.every((x) => x === null || Number.isInteger(x));
    if (!exitsOk) problems.push(`recipes[${i}].exits is not an array of integers or null`);
    const files: HashedFile[] = [];
    if (!Array.isArray(e?.files)) problems.push(`recipes[${i}].files is not an array`);
    else {
      e.files.forEach((f, j) => {
        const file = f as Record<string, unknown>;
        if (typeof f !== 'object' || f === null || typeof file.path !== 'string' || !Number.isInteger(file.size) || typeof file.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(file.sha256)) {
          problems.push(`recipes[${i}].files[${j}] is not { path, size, sha256 }`);
          return;
        }
        files.push({ path: file.path, size: file.size as number, sha256: file.sha256 });
      });
    }
    if (base.recipe !== null && exitsOk) recipes.push({ ...base.recipe, exits: e.exits as Array<number | null>, files });
  });
  if (problems.length > 0) throw new HashesInputError(`${path}: not an ${HASHES_SPEC} document — ${problems.join('; ')}`);
  return { spec: HASHES_SPEC, recipes };
}

export function readHashes(path: string): HashesDocument {
  if (!existsSync(path)) throw new HashesInputError(`compare: no such file ${path}`);
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new HashesInputError(`${path}: not JSON — ${(err as Error).message}`);
  }
  return asHashesDocument(value, path);
}

export interface RecipeDifference {
  name: string;
  findings: string[];
}

export interface HashesComparison {
  identical: boolean;
  recipes: number;
  files: number;
  onlyA: string[];
  onlyB: string[];
  differ: RecipeDifference[];
}

/** Two documents; throws HashesInputError when a name means two recipes. */
export function compareHashes(a: HashesDocument, b: HashesDocument): HashesComparison {
  const inB = new Map(b.recipes.map((r) => [r.name, r]));
  const inA = new Map(a.recipes.map((r) => [r.name, r]));
  const mismatched: string[] = [];
  for (const ra of a.recipes) {
    const rb = inB.get(ra.name);
    if (rb === undefined) continue;
    if (JSON.stringify([ra.stage, ra.commands]) !== JSON.stringify([rb.stage, rb.commands])) {
      mismatched.push(`recipe ${JSON.stringify(ra.name)} runs ${JSON.stringify(ra.commands)} over ${JSON.stringify(ra.stage)} in A and ${JSON.stringify(rb.commands)} over ${JSON.stringify(rb.stage)} in B`);
    }
  }
  if (mismatched.length > 0) {
    throw new HashesInputError(`the two documents come from different recipe sets — ${mismatched.length} name(s) stand for different builds: ${mismatched.join('; ')}`);
  }
  const onlyA = a.recipes.filter((r) => !inB.has(r.name)).map((r) => r.name);
  const onlyB = b.recipes.filter((r) => !inA.has(r.name)).map((r) => r.name);
  const differ: RecipeDifference[] = [];
  let files = 0;
  for (const ra of a.recipes) {
    const rb = inB.get(ra.name);
    if (rb === undefined) continue;
    files += ra.files.length;
    const findings: string[] = [];
    if (JSON.stringify(ra.exits) !== JSON.stringify(rb.exits)) findings.push(`exit codes ${JSON.stringify(ra.exits)} in A, ${JSON.stringify(rb.exits)} in B`);
    const fb = new Map(rb.files.map((f) => [f.path, f]));
    const fa = new Map(ra.files.map((f) => [f.path, f]));
    for (const f of ra.files) {
      const g = fb.get(f.path);
      if (g === undefined) findings.push(`${f.path} only in A (${f.size} bytes)`);
      else if (f.sha256 !== g.sha256 || f.size !== g.size) findings.push(`${f.path} differs: ${f.size} bytes ${f.sha256.slice(0, 12)} in A, ${g.size} bytes ${g.sha256.slice(0, 12)} in B`);
    }
    for (const g of rb.files) if (!fa.has(g.path)) findings.push(`${g.path} only in B (${g.size} bytes)`);
    if (findings.length > 0) differ.push({ name: ra.name, findings });
  }
  const identical = onlyA.length === 0 && onlyB.length === 0 && differ.length === 0;
  return { identical, recipes: a.recipes.length - onlyA.length, files, onlyA, onlyB, differ };
}

export function comparisonLines(c: HashesComparison): string[] {
  const lines: string[] = [];
  for (const d of c.differ) {
    lines.push(`  DIFF  ${d.name}`);
    for (const f of d.findings) lines.push(`          ${f}`);
  }
  for (const name of c.onlyA) lines.push(`  ONLY-A  ${name}`);
  for (const name of c.onlyB) lines.push(`  ONLY-B  ${name}`);
  if (c.identical) lines.push(`IDENTICAL — ${c.recipes} recipe(s), ${c.files} file(s), every exit code, size and hash equal`);
  else {
    const parts = [
      `${c.differ.length} of ${c.recipes} shared recipe(s) differ${c.differ.length > 0 ? ` (${c.differ.map((d) => d.name).join(', ')})` : ''}`,
      ...(c.onlyA.length > 0 ? [`${c.onlyA.length} only in A`] : []),
      ...(c.onlyB.length > 0 ? [`${c.onlyB.length} only in B`] : []),
    ];
    lines.push(`DIFF — ${parts.join('; ')}`);
  }
  return lines;
}

// ---------------------------------------------------------------------------
// the tree's own recipes
// ---------------------------------------------------------------------------

/** A README's shell lines with `\` continuations joined, fenced or not. */
function joinedLines(text: string): string[] {
  const out: string[] = [];
  let pending = '';
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (line.endsWith('\\')) {
      pending += `${line.slice(0, -1)} `;
      continue;
    }
    out.push(pending + line);
    pending = '';
  }
  if (pending !== '') out.push(pending);
  return out;
}

function tokens(line: string): string[] {
  const hash = line.search(/\s#\s/);
  return (hash < 0 ? line : line.slice(0, hash)).trim().split(/\s+/);
}

/**
 * The `build` a gallery example's README states, as a recipe; `finding` is
 * set when the README states none and the gallery index's form was used.
 */
export function galleryRecipe(root: string, name: string): { recipe: Recipe; finding: string | null } {
  const dir = `gallery/${name}`;
  const own = existsSync(join(root, dir, 'README.md')) ? readFileSync(join(root, dir, 'README.md'), 'utf8') : '';
  const isOwn = (t: string[]): boolean => t[0] === 'bun' && t[1] === 'cli.ts' && t[2] === 'build' && t[t.indexOf('--rig') + 1] === `${dir}/rig.json`;
  let stated = joinedLines(own).map(tokens).find(isOwn);
  let finding: string | null = null;
  if (stated === undefined) {
    const index = readFileSync(join(root, 'gallery/README.md'), 'utf8');
    stated = joinedLines(index)
      .map((l) => tokens(l.split('<name>').join(name)))
      .find(isOwn);
    finding = `${dir}/README.md states no \`bun cli.ts build --rig ${dir}/rig.json\` line; the recipe takes gallery/README.md's form`;
    if (stated === undefined) throw new HashesInputError(`neither ${dir}/README.md nor gallery/README.md states a build for ${dir}`);
  }
  const args = stated.slice(2);
  const outAt = args.indexOf('--out');
  if (outAt < 0) throw new HashesInputError(`${dir}: the stated build has no --out`);
  const command = args.map((arg, i) => (i === outAt + 1 ? '{{out}}' : arg.startsWith(`${dir}/`) ? `{{work}}/${arg}` : arg));
  return { recipe: { name: dir, stage: [{ from: dir, to: dir }], commands: [command] }, finding };
}

function exportRecipe(name: string, dir: string, file: string, pack: string): Recipe {
  return {
    name,
    stage: [{ from: dir, to: 'export' }],
    commands: [
      ['ingest', `{{work}}/export/${file}`, '--art', 'none', '--out', '{{work}}/specs'],
      ['build', '--rig', '{{work}}/specs/rig.json', '--motion', '{{work}}/specs/motion.json', '--atlas-in', `{{work}}/export/${pack}`, '--out', '{{out}}'],
    ],
  };
}

/** Every recipe this tree's corpora carry, and what stderr has to say about them. */
export function treeRecipes(root: string, note: (line: string) => void): Recipe[] {
  const recipes: Recipe[] = [];
  const examples = join(root, 'examples');
  // The trial builds' directory is this function's own and is removed however it ends (issue #1140).
  const trialScope = new WorkDirectory('emit_hashes');
  let trial: string | null = null;
  try {
    if (!existsSync(examples)) {
      note(`HOLE: no ${examples} — run \`bun run fetch-examples\`; the editor exports are not in these recipes`);
    } else {
      for (const ex of readdirSync(examples).sort(byCodeUnit)) {
        const dir = `examples/${ex}/export`;
        if (!existsSync(join(root, dir))) continue;
        const files = readdirSync(join(root, dir)).sort(byCodeUnit);
        const packs = files.filter((f) => f.endsWith('.atlas'));
        for (const file of files.filter((f) => f.endsWith('.json'))) {
          const name = `examples/${ex}/${file}`;
          if (packs.length === 0) {
            note(`FINDING: ${name} has no .atlas beside it; no recipe written`);
            continue;
          }
          if (packs.length === 1) {
            recipes.push(exportRecipe(name, dir, file, packs[0]));
            continue;
          }
          trial ??= trialScope.open(undefined, false, 'rigc-emit-hashes-trial-', (m) => new HashesInputError(m));
          const trialDir = trial;
          const green = packs.find((pack, i) => {
            const r = runRecipe(exportRecipe(name, dir, file, pack), join(trialDir, `${recipes.length}-${i}`), root);
            return r.exits.length === 2 && r.exits.every((e) => e === 0);
          });
          if (green !== undefined) {
            note(`  ${name}: ${packs.length} packs beside it; ${green} is the first whose chain exits 0`);
            recipes.push(exportRecipe(name, dir, file, green));
          } else {
            note(`FINDING: ${name}: none of ${packs.join(', ')} builds green; each is written as its own recipe`);
            for (const pack of packs) recipes.push(exportRecipe(`${name} [${pack}]`, dir, file, pack));
          }
        }
      }
    }
  } finally {
    trialScope.close(note);
  }
  recipes.push(...galleryRecipes(root, note));
  return recipes.sort((a, b) => byCodeUnit(a.name, b.name));
}

/** Every `gallery/<name>/` with a `rig.json`, as `galleryRecipe` states it — the tracked base's recipes. */
export function galleryRecipes(root: string, note: (line: string) => void): Recipe[] {
  const recipes: Recipe[] = [];
  const gallery = join(root, 'gallery');
  if (!existsSync(gallery)) throw new HashesInputError(`no gallery at ${gallery}`);
  for (const name of readdirSync(gallery).sort(byCodeUnit)) {
    if (!existsSync(join(gallery, name, 'rig.json'))) continue;
    const { recipe, finding } = galleryRecipe(root, name);
    if (finding !== null) note(`FINDING: ${finding}`);
    recipes.push(recipe);
  }
  if (recipes.length === 0) throw new HashesInputError(`no gallery/<name>/rig.json under ${root}`);
  return recipes.sort((a, b) => byCodeUnit(a.name, b.name));
}

export interface BaseVerdict {
  current: boolean;
  lines: string[];
}

/**
 * The file at `file` against `fresh`, a run of the gallery's recipes on this
 * tree: CURRENT only when the file is byte-identical to what `base` writes.
 * `shown` is how the file is named in the lines.
 */
export function baseVerdict(file: string, shown: string, fresh: HashesDocument, command: string = BASE_COMMAND): BaseVerdict {
  const files = fresh.recipes.reduce((n, r) => n + r.files.length, 0);
  const refresh = `regenerate it with \`${command}\` in the same change, and say in the pull request which rows moved and why`;
  if (!existsSync(file)) return { current: false, lines: [`STALE — there is no base at ${shown}; ${refresh}`] };
  if (readFileSync(file, 'utf8') === hashesText(fresh)) {
    return { current: true, lines: [`CURRENT — ${shown} is byte-identical to a fresh run of the gallery's ${fresh.recipes.length} recipe(s), ${files} file(s)`] };
  }
  const lines: string[] = [];
  try {
    const c = compareHashes(readHashes(file), fresh);
    if (c.identical) lines.push(`  ${shown} agrees with this tree on every exit code, size and hash, but not in its bytes: it was not written by \`${command}\``);
    else lines.push(...comparisonLines(c).filter((l) => l.startsWith('  ')));
  } catch (err) {
    if (!(err instanceof HashesInputError)) throw err;
    lines.push(`  ${err.message}`);
  }
  lines.push(`STALE — ${shown} is not what \`${command}\` writes on this tree (A = the file, B = this tree); a change that moves a gallery build's bytes on purpose must ${refresh}`);
  return { current: false, lines };
}

export function recipesText(recipes: readonly Recipe[]): string {
  const doc: RecipesDocument = {
    spec: RECIPES_SPEC,
    recipes: recipes.map((r) => ({ name: r.name, stage: r.stage.map((s) => ({ from: s.from, to: s.to })), commands: r.commands })),
  };
  return `${JSON.stringify(doc, null, 2)}\n`;
}

// ---------------------------------------------------------------------------
// the command
// ---------------------------------------------------------------------------

const USAGE = [
  'usage:',
  '  bun tools/emit_hashes.ts recipes --out <recipes.json>',
  '  bun tools/emit_hashes.ts run --recipes <recipes.json> --out <hashes.json> [--work <dir> | --keep-work] [--root <dir>]',
  '  bun tools/emit_hashes.ts compare <a.json> <b.json>',
  '  bun tools/emit_hashes.ts base [--check] [--file <hashes.json>] [--work <dir> | --keep-work] [--root <dir>]',
  '  (a work directory made without --work is removed when the command ends; --keep-work keeps it and names it)',
].join('\n');

function parseFlags(args: readonly string[], known: readonly string[], switches: readonly string[] = []): { positional: string[]; flags: Map<string, string> } {
  const positional: string[] = [];
  const flags = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    if (switches.includes(arg)) {
      if (flags.has(arg)) throw new HashesInputError(`${arg} given twice`);
      flags.set(arg, '');
      continue;
    }
    if (!known.includes(arg)) throw new HashesInputError(`unknown flag ${arg}; this command takes ${[...known, ...switches].join(', ')}`);
    const value = args[i + 1];
    if (value === undefined || value.startsWith('--')) throw new HashesInputError(`${arg} needs a value`);
    if (flags.has(arg)) throw new HashesInputError(`${arg} given twice`);
    flags.set(arg, value);
    i++;
  }
  return { positional, flags };
}

/** The command; returns the exit code. */
export function hashesMain(argv: readonly string[], print: (line: string) => void = console.log, warn: (line: string) => void = console.error): number {
  const [command, ...args] = argv;
  const scope = new WorkDirectory('emit_hashes');
  try {
    // `--keep-work` is read only where a work directory is made; elsewhere the parser refuses it as unknown.
    const { argv: rest, keep } = command === 'run' || command === 'base' ? readKeepWork(args, ['--check'], (m) => new HashesInputError(m)) : { argv: args, keep: false };
    if (command === 'recipes') {
      const { positional, flags } = parseFlags(rest, ['--out']);
      if (positional.length > 0) throw new HashesInputError(`recipes takes no path, got ${positional.join(' ')}`);
      const out = flags.get('--out');
      if (out === undefined) throw new HashesInputError('recipes: --out <recipes.json> is required');
      const recipes = treeRecipes(TREE_ROOT, warn);
      writeFileSync(out, recipesText(recipes));
      print(`emit_hashes: ${recipes.length} recipe(s) from ${TREE_ROOT} → ${out}`);
      return 0;
    }
    if (command === 'run') {
      const { positional, flags } = parseFlags(rest, ['--recipes', '--out', '--work', '--root']);
      if (positional.length > 0) throw new HashesInputError(`run takes no path, got ${positional.join(' ')}`);
      const recipesPath = flags.get('--recipes');
      const out = flags.get('--out');
      if (recipesPath === undefined) throw new HashesInputError('run: --recipes <recipes.json> is required');
      if (out === undefined) throw new HashesInputError('run: --out <hashes.json> is required');
      const root = resolve(flags.get('--root') ?? TREE_ROOT);
      if (!existsSync(root) || !statSync(root).isDirectory()) throw new HashesInputError(`--root ${root} is not a directory`);
      const recipes = readRecipes(recipesPath);
      const unstaged = recipes.flatMap((r) =>
        r.stage.filter((e) => !existsSync(isAbsolute(e.from) ? e.from : join(root, e.from))).map((e) => `recipe ${JSON.stringify(r.name)} stages ${JSON.stringify(e.from)}, and nothing is at ${isAbsolute(e.from) ? e.from : join(root, e.from)}`),
      );
      if (unstaged.length > 0) throw new HashesInputError(`${unstaged.length} input(s) missing before anything ran: ${unstaged.join('; ')}`);
      const work = scope.open(flags.get('--work'), keep, 'rigc-emit-hashes-', (m) => new HashesInputError(m));
      warn(`emit_hashes: ${recipes.length} recipe(s), work directory ${work}`);
      const started = performance.now();
      const doc = runRecipes(recipes, work, root, print);
      const seconds = (performance.now() - started) / 1000;
      writeFileSync(out, hashesText(doc));
      const refused = doc.recipes.filter((r) => r.exits.some((e) => e !== 0)).length;
      print(`emit_hashes: ${doc.recipes.length} recipe(s), ${doc.recipes.length - refused} exit 0, ${refused} refused → ${out}`);
      warn(`emit_hashes: wall time ${seconds.toFixed(1)} s`);
      return 0;
    }
    if (command === 'base') {
      const { positional, flags } = parseFlags(rest, ['--file', '--work', '--root'], ['--check']);
      if (positional.length > 0) throw new HashesInputError(`base takes no path, got ${positional.join(' ')}`);
      const check = flags.has('--check');
      const file = resolve(flags.get('--file') ?? join(TREE_ROOT, BASE_FILE));
      const shown = flags.has('--file') ? file : BASE_FILE;
      const root = resolve(flags.get('--root') ?? TREE_ROOT);
      if (!existsSync(root) || !statSync(root).isDirectory()) throw new HashesInputError(`--root ${root} is not a directory`);
      const recipes = galleryRecipes(root, warn);
      const work = scope.open(flags.get('--work'), keep, 'rigc-emit-hashes-base-', (m) => new HashesInputError(m));
      warn(`emit_hashes: ${recipes.length} gallery recipe(s), work directory ${work}`);
      const started = performance.now();
      const doc = spineFilesOnly(runRecipes(recipes, work, root, print));
      warn(`emit_hashes: wall time ${((performance.now() - started) / 1000).toFixed(1)} s`);
      if (check) {
        const verdict = baseVerdict(file, shown, doc, flags.has('--file') ? `${BASE_COMMAND} --file ${file}` : BASE_COMMAND);
        for (const line of verdict.lines) print(line);
        return verdict.current ? 0 : 1;
      }
      const refused = doc.recipes.filter((r) => r.exits.some((e) => e !== 0));
      if (refused.length > 0) {
        throw new HashesInputError(
          `${refused.length} gallery build(s) refused, and a base is a record of green builds — nothing written: ` +
            refused.map((r) => `${r.name} exited ${JSON.stringify(r.exits)} (log beside ${work}${scope.removalNote()})`).join('; '),
        );
      }
      writeFileSync(file, hashesText(doc));
      print(`emit_hashes: base of ${doc.recipes.length} gallery recipe(s), ${doc.recipes.reduce((n, r) => n + r.files.length, 0)} file(s) → ${shown}`);
      return 0;
    }
    if (command === 'compare') {
      const { positional } = parseFlags(rest, []);
      if (positional.length !== 2) throw new HashesInputError(`compare: expected <a.json> <b.json>, got ${positional.length} path(s)`);
      const a = readHashes(positional[0]);
      const b = readHashes(positional[1]);
      const c = compareHashes(a, b);
      print(`emit_hashes compare A=${positional[0]} B=${positional[1]}`);
      for (const line of comparisonLines(c)) print(line);
      return c.identical ? 0 : 1;
    }
    throw new HashesInputError(command === undefined ? 'no command' : `unknown command ${JSON.stringify(command)}`);
  } catch (err) {
    if (err instanceof HashesInputError) {
      warn(`emit_hashes: ${err.message}`);
      if (err.message.startsWith('no command') || err.message.startsWith('unknown command')) warn(USAGE);
      return 2;
    }
    throw err;
  } finally {
    scope.close(warn);
  }
}

if (import.meta.main) process.exit(hashesMain(process.argv.slice(2)));
