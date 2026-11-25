/**
 * render_hashes — every render of every build in every corpus hashed, and two
 * such documents compared across commits (issue #965, step 3a of issue #380).
 *
 *   bun tools/render_hashes.ts run --recipes <recipes.json> --out <hashes.json>
 *                                  [--work <dir> | --keep-work] [--root <dir>]
 *   bun tools/render_hashes.ts compare <a.json> <b.json>
 *   bun tools/render_hashes.ts base [--check] [--file <hashes.json>]
 *                                   [--work <dir> | --keep-work] [--root <dir>]
 *
 * ⭐ Why this exists. Step 3 of issue #380 moves `src/render.ts` from posing
 * through spine-core to posing through rigc's own core, and its gate is "the
 * same renders, bit-identical, on every corpus". Before this file nothing held
 * a render's bytes: the selftest's render controls compare a run against itself
 * (two exports in one run) or against a reference within a tolerance, and
 * `tools/emit_hashes.ts` stops at the Spine files. This tool is the render
 * half of that instrument, and it is measurement only: it changes nothing under
 * `src/` and nothing in `cli.ts`.
 *
 * ## A row
 *
 * The recipes are `tools/emit_hashes.ts`'s, read by its own reader: an
 * `emit-hashes-recipes/1` file (`bun tools/emit_hashes.ts recipes --out …`
 * writes the tree's 19), an `emit-hashes/1` document, or a `render-hashes/1`
 * document, whose recipes are then re-run exactly. `--root` is how a private
 * corpus is run, as there. Each recipe's build chain runs through
 * `emit_hashes.ts`'s `runRecipe` into `{{work}}`, and then, when it exited 0:
 *
 * 1. **the CLI's render**, `RENDER_COMMAND` below, as a caller runs it: every
 *    animation at the protocol rate (12 fps, the CLI's default), each set's
 *    frames, its contact sheet and its `geometry.json`, and `frames.json`,
 *    whose `viewport` is the framing box. Hashed as `render/<path>`. The
 *    wall-clock receipt `render-run.json` beside them is excluded, as
 *    `emit_hashes` excludes `run.json`; every other file is compared.
 * 2. **what the CLI does not write and the posing seam still produces**, in
 *    this process through `src/render.ts`: the setup pose drawn over the same
 *    viewport (`extra/setup.png` — a skeleton with animations never writes it),
 *    and every bone snapshot of every sampled frame with the fields no file
 *    carries (`rotationX/Y`, `scaleX/Y`, which `bonedist` reads), one JSON
 *    line per frame (`extra/bones/<set>.jsonl`). Hashed as `extra/<path>`.
 *
 * The framing box's numbers are recorded in the row as well (`framing`), off
 * `frames.json` — a box that moved is named by the number that moved rather
 * than by every frame it re-seated.
 *
 * ## `run` — the document, `"spec": "render-hashes/1"`
 *
 * `JSON.stringify(doc, null, 2)` and a newline; key order fixed as written
 * here; recipes sorted by `name` and files by `path`, both by UTF-16 code
 * unit. Nothing about time, the work directory or the host is in it; the wall
 * time goes to stderr only.
 *
 * - `spec`; `render` — the render command, placeholders unresolved;
 * - `recipes[]` — `name`, `stage`, `commands` as the recipes state them;
 *   `exits` — the build chain's exit codes; `renderExit` — the render's (`null`
 *   when the chain refused and nothing was rendered); `framing` —
 *   `frames.json`'s viewport, or `null`; `files` — `{ path, size, sha256 }`,
 *   and on every PNG also `pixels` — `{ width, height, sha256 }` over the
 *   image as `tools/plate.ts`'s `decodePng` reads it (see *Two hashes*).
 *
 * ### Two hashes per PNG, and which one is the render
 *
 * The file's bytes are the PNG encoder's output as much as the renderer's,
 * and the encoder is not the same on every machine: the first Linux CI run
 * of this tool (PR #972) read `gallery/flex`'s `gust/contact.png` as 24,444
 * bytes in the macOS base and 24,541 on Linux, and every gallery row DIFF, on
 * a tree whose renderer had not moved. A render is its pixels, so a PNG also
 * carries `pixels.sha256`: SHA-256 over the width and the height (4 bytes
 * each, big-endian) and then the RGBA rows top to bottom as `decodePng`
 * returns them. Re-encoding one frame at deflate level 1 instead of 9, on the
 * machine this was written on, changed its bytes and not that hash; moving one
 * pixel's red by one changed it.
 *
 * The work directories are kept (numbered in name order, each with the build
 * logs, `log-render.txt`, `out/`, `render/` and `extra/`) and named on stderr.
 *
 * ## `compare`
 *
 * IDENTICAL (exit 0) when every row has the same exits, framing numbers and
 * files. When the only files whose bytes differ are PNGs whose pixels agree,
 * the verdict is **IDENTICAL IN PIXELS** (exit 0), naming each such file under
 * a `BYTES` line — an encoder difference, not a render difference, and said
 * rather than folded into either of the other two answers. Otherwise DIFF
 * (exit 1), naming per row the exits, each framing number and each file that
 * differs — a PNG by its pixel hashes whenever both sides carry them, anything
 * else by its bytes — and every row on one side only. Exit 2
 * when the pair cannot be compared: not a `render-hashes/1` document, two
 * different render commands, or one recipe name standing for two builds.
 *
 * ## `base` — `tools/render_hashes.base.json`
 *
 * The gallery's rows, rendered on this tree — every `gallery/<name>/` with a
 * `rig.json`, built the way its README states (`emit_hashes.ts`'s
 * `galleryRecipes`). The fetched exports are left out because a tracked base
 * must be reproducible from a fresh checkout with no network; CI uploads a run
 * over all nineteen rows as the `render-hashes-linux` artifact instead.
 *
 * 🔸 **It holds the PNGs' PIXEL hashes only** — each file as `{ path, pixels }`
 * with no `size` or `sha256` — **with `framing` null in every row**, because
 * those are the files measured to survive a change of libm and the rest are
 * measured not to. With every transcendental `Math` function's result moved by
 * one ulp (either direction, chosen per input), over the 19 recipes on the
 * machine this was written on: 0 of 2,681 PNGs moved, and every `geometry.json`
 * (54), every `frames.json` (19), every bone snapshot file (73) and all 19
 * framing boxes moved — they carry full doubles off `Math.cos`/`Math.sin`, and
 * macOS's and Linux's libm were measured apart once already (`Math.atan`,
 * `tools/emit_hashes.ts` `## base`). So the tracked base is the half a second
 * machine can be held to, and a `run` document — every file and number — is
 * the gate between two commits on ONE machine. What the perturbation did not
 * reach was the PNG encoder, and CI measured it: the file bytes differ between
 * macOS and Linux (*Two hashes*), so the base holds pixels and `base --check`
 * compares pixels. It is
 * written by one command (`base`) and never by hand; `base --check` renders the
 * rows afresh and compares the file BYTE for byte: CURRENT exits 0, STALE exits
 * 1 naming each differing row and file and the command that rewrites it. A
 * gallery row that does not render green is refused and nothing is written.
 *
 * Exit codes throughout: 0 done (or IDENTICAL, or CURRENT), 1 DIFF (or STALE),
 * 2 a bad input by name.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { decodePng } from './plate.ts';
import {
  BACKGROUND,
  candidatePosers,
  loadPosable,
  PROTOCOL_FPS,
  renderFrame,
  sampleAll,
  sampleSetupPose,
  throughPoser,
  viewportOfSize,
  type FramesSidecar,
} from '../src/render.ts';
import { galleryRecipes, HashesInputError, readRecipes, recipesOfValue, runRecipe, TREE_ROOT, type Recipe, type StageEntry } from './emit_hashes.ts';
import { readKeepWork, WorkDirectory } from './work_dir.ts';
import { isRenderRunRecord } from '../src/cli/run_stamp.ts';

export const RENDER_HASHES_SPEC = 'render-hashes/1';
const CLI = join(TREE_ROOT, 'cli.ts');

/** The render every row runs after its build, placeholders as the recipes spell them. */
export const RENDER_COMMAND: readonly string[] = ['render', '--candidate', '{{out}}', '--geometry', '--out', '{{work}}/render'];

/** The tracked base's place in the checkout, and the one command that writes it. */
export const RENDER_BASE_FILE = 'tools/render_hashes.base.json';
export const RENDER_BASE_COMMAND = 'bun tools/render_hashes.ts base';

export type Framing = FramesSidecar['viewport'];

/** A PNG's decoded image, hashed — see *Two hashes per PNG*. */
export interface PixelHash {
  width: number;
  height: number;
  sha256: string;
}

/**
 * One hashed file. `size`/`sha256` are the bytes and `pixels` the decoded
 * image; a run carries both on a PNG and the bytes alone on anything else, and
 * the tracked base carries `pixels` alone.
 */
export interface RenderFile {
  path: string;
  size?: number;
  sha256?: string;
  pixels?: PixelHash;
}

/** SHA-256 over width, height (u32 big-endian each) and the RGBA rows `decodePng` returns. */
export function pixelHash(png: Uint8Array): PixelHash {
  const plate = decodePng(png);
  const head = new Uint8Array(8);
  const view = new DataView(head.buffer);
  view.setUint32(0, plate.width);
  view.setUint32(4, plate.height);
  return { width: plate.width, height: plate.height, sha256: createHash('sha256').update(head).update(plate.data).digest('hex') };
}

export interface RenderRow extends Recipe {
  exits: Array<number | null>;
  renderExit: number | null;
  framing: Framing | null;
  files: RenderFile[];
}

export interface RenderHashesDocument {
  spec: string;
  render: string[];
  recipes: RenderRow[];
}

/** A run as the tracked base records it: every PNG's pixel hash alone, the framing numbers left out (see `## base`). */
export function pixelsOnly(doc: RenderHashesDocument): RenderHashesDocument {
  return {
    ...doc,
    recipes: doc.recipes.map((r) => ({
      ...r,
      framing: null,
      files: r.files.flatMap((f): RenderFile[] => (f.pixels === undefined ? [] : [{ path: f.path, pixels: f.pixels }])),
    })),
  };
}

/** UTF-16 code-unit order, never the locale's. */
function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

const FRAMING_KEYS = ['x', 'y', 'width', 'height', 'scale', 'pixelWidth', 'pixelHeight'] as const;

// ---------------------------------------------------------------------------
// one row
// ---------------------------------------------------------------------------

/** Every file under `dir` but the render receipt at its root, relative, `/`-separated, in code-unit order. */
export function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (at: string): void => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const full = join(at, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (!isRenderRunRecord(relative(dir, full).split(sep).join('/'))) out.push(relative(dir, full).split(sep).join('/'));
    }
  };
  walk(dir);
  return out.sort(byCodeUnit);
}

function hashed(dir: string, prefix: string): RenderFile[] {
  return filesUnder(dir).map((path): RenderFile => {
    const bytes = readFileSync(join(dir, path));
    const file: RenderFile = { path: `${prefix}/${path}`, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    return path.endsWith('.png') ? { ...file, pixels: pixelHash(bytes) } : file;
  });
}

/**
 * What the CLI does not write, posed in this process through `src/render.ts`
 * over the viewport the CLI framed — see the header's second item.
 */
function writeExtras(out: string, framing: Framing, extra: string): string {
  const { data, pages } = loadPosable(join(out, 'skeleton.json'), join(out, 'skeleton.atlas'), out);
  const viewport = viewportOfSize(framing.x, framing.y, framing.width, framing.height, framing.scale, framing.pixelWidth, framing.pixelHeight);
  // The poser `rigc render` chose for the same input (issue #968), by the same
  // rule, so the extras measure what the CLI's frames were drawn through.
  const posed = throughPoser(candidatePosers(data, join(out, 'skeleton.json'), join(out, 'skeleton.atlas'), undefined), (poser) => {
    const setup = sampleSetupPose(poser, { bones: true });
    return { setup, all: sampleAll(poser, PROTOCOL_FPS, { bones: true }) };
  });
  const { setup, all } = posed.value;
  mkdirSync(join(extra, 'bones'), { recursive: true });
  renderFrame(setup[0], pages, viewport, BACKGROUND).writePng(join(extra, 'setup.png'));
  const sets = new Map<string, typeof setup>([['setup-pose', setup], ...all]);
  for (const [name, frames] of sets) {
    const lines = frames.map((f) => JSON.stringify({ index: f.index, time: f.time, bones: f.bones ?? null }));
    // A set name is an animation name, which may hold any character; the
    // file name is its UTF-8 bytes in hex, so no two names collide.
    const file = name === 'setup-pose' ? 'setup-pose' : `animation-${Buffer.from(name, 'utf8').toString('hex')}`;
    writeFileSync(join(extra, 'bones', `${file}.jsonl`), `${lines.join('\n')}\n`);
  }
  return posed.note;
}

function resolveArg(arg: string, work: string, out: string): string {
  return arg.split('{{work}}').join(work).split('{{out}}').join(out);
}

/** One recipe into `work`, which must not exist yet: build, render, extras, hash. */
export function renderRow(recipe: Recipe, work: string, root: string): RenderRow {
  const built = runRecipe(recipe, work, root);
  const row: RenderRow = { name: recipe.name, stage: recipe.stage, commands: recipe.commands, exits: built.exits, renderExit: null, framing: null, files: [] };
  if (built.exits.length !== recipe.commands.length || built.exits.some((e) => e !== 0)) return row;
  const out = join(work, 'out');
  const args = RENDER_COMMAND.map((arg) => resolveArg(arg, work, out));
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd: work, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  writeFileSync(join(work, 'log-render.txt'), `$ rigc ${args.join(' ')}\n${result.stdout}\n--- stderr ---\n${result.stderr}`);
  row.renderExit = result.status;
  const renderDir = join(work, 'render');
  const sidecar = join(renderDir, 'frames.json');
  if (result.status === 0 && existsSync(sidecar)) {
    const viewport = (JSON.parse(readFileSync(sidecar, 'utf8')) as FramesSidecar).viewport;
    row.framing = { x: viewport.x, y: viewport.y, width: viewport.width, height: viewport.height, scale: viewport.scale, pixelWidth: viewport.pixelWidth, pixelHeight: viewport.pixelHeight };
    try {
      const note = writeExtras(out, row.framing, join(work, 'extra'));
      writeFileSync(join(work, 'log-extra.txt'), `poser ${note}\n`);
    } catch (err) {
      throw new Error(`recipe ${JSON.stringify(recipe.name)}: \`rigc render\` exited 0 and posing it again in this process threw — ${(err as Error).message}`);
    }
  }
  row.files = [...hashed(renderDir, 'render'), ...hashed(join(work, 'extra'), 'extra')];
  return row;
}

/** One file with its keys in the fixed order, and only the ones it carries. */
function fileText(f: RenderFile): RenderFile {
  return {
    path: f.path,
    ...(f.size === undefined ? {} : { size: f.size }),
    ...(f.sha256 === undefined ? {} : { sha256: f.sha256 }),
    ...(f.pixels === undefined ? {} : { pixels: { width: f.pixels.width, height: f.pixels.height, sha256: f.pixels.sha256 } }),
  };
}

export function renderHashesText(doc: RenderHashesDocument): string {
  const ordered: RenderHashesDocument = {
    spec: doc.spec,
    render: doc.render,
    recipes: doc.recipes.map((r) => ({
      name: r.name,
      stage: r.stage.map((s: StageEntry) => ({ from: s.from, to: s.to })),
      commands: r.commands,
      exits: r.exits,
      renderExit: r.renderExit,
      framing: r.framing === null ? null : { x: r.framing.x, y: r.framing.y, width: r.framing.width, height: r.framing.height, scale: r.framing.scale, pixelWidth: r.framing.pixelWidth, pixelHeight: r.framing.pixelHeight },
      files: r.files.map(fileText),
    })),
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

/** Every recipe, each in `<work>/<NNN>` (name order), into one document. */
export function renderRows(recipes: readonly Recipe[], work: string, root: string, progress: (line: string) => void): RenderHashesDocument {
  const width = String(recipes.length).length;
  const rows = [...recipes]
    .sort((a, b) => byCodeUnit(a.name, b.name))
    .map((recipe, i) => {
      const r = renderRow(recipe, join(work, String(i).padStart(width, '0')), root);
      const code = r.exits.find((e) => e !== 0);
      progress(`  build ${code === undefined ? 0 : code}  render ${r.renderExit === null ? '-' : r.renderExit}  ${String(r.files.length).padStart(4)} file(s)  ${r.name}`);
      return r;
    });
  return { spec: RENDER_HASHES_SPEC, render: [...RENDER_COMMAND], recipes: rows };
}

// ---------------------------------------------------------------------------
// reading and comparing documents
// ---------------------------------------------------------------------------

/** A `render-hashes/1` document, every malformed field named in one refusal. */
export function readRenderHashes(path: string): RenderHashesDocument {
  if (!existsSync(path)) throw new HashesInputError(`no such file ${path}`);
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new HashesInputError(`${path}: not JSON — ${(err as Error).message}`);
  }
  const record = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  if (record.spec !== RENDER_HASHES_SPEC) throw new HashesInputError(`${path}: spec is ${JSON.stringify(record.spec ?? value)}, not ${JSON.stringify(RENDER_HASHES_SPEC)}`);
  const problems: string[] = [];
  if (!Array.isArray(record.render) || !record.render.every((a) => typeof a === 'string')) problems.push('render is not an array of strings');
  if (!Array.isArray(record.recipes)) problems.push('recipes is not an array');
  // The recipes half is `emit_hashes.ts`'s reader, so one name cannot mean two
  // shapes of recipe in the two tools.
  let recipes: Recipe[] = [];
  if (problems.length === 0) {
    try {
      recipes = recipesOfValue(record.recipes, path, true);
    } catch (err) {
      if (!(err instanceof HashesInputError)) throw err;
      problems.push(err.message);
    }
  }
  const rows: RenderRow[] = [];
  (Array.isArray(record.recipes) ? record.recipes : []).forEach((entry, i) => {
    const e = (typeof entry === 'object' && entry !== null ? entry : {}) as Record<string, unknown>;
    const recipe = recipes.find((r) => r.name === e.name);
    const exitsOk = Array.isArray(e.exits) && e.exits.every((x) => x === null || Number.isInteger(x));
    if (!exitsOk) problems.push(`recipes[${i}].exits is not an array of integers or null`);
    if (!(e.renderExit === null || Number.isInteger(e.renderExit))) problems.push(`recipes[${i}].renderExit is not an integer or null`);
    const f = e.framing as Record<string, unknown> | null | undefined;
    const framingOk = f === null || (typeof f === 'object' && f !== undefined && FRAMING_KEYS.every((k) => typeof f[k] === 'number'));
    if (!framingOk) problems.push(`recipes[${i}].framing is not null or { ${FRAMING_KEYS.join(', ')} }`);
    const files: RenderFile[] = [];
    const isHash = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
    if (!Array.isArray(e.files)) problems.push(`recipes[${i}].files is not an array`);
    else {
      e.files.forEach((x, j) => {
        const file = (typeof x === 'object' && x !== null ? x : {}) as Record<string, unknown>;
        const px = (typeof file.pixels === 'object' && file.pixels !== null ? file.pixels : null) as Record<string, unknown> | null;
        const bytesOk = file.size === undefined && file.sha256 === undefined ? null : Number.isInteger(file.size) && isHash(file.sha256);
        const pixelsOk = file.pixels === undefined ? null : px !== null && Number.isInteger(px.width) && Number.isInteger(px.height) && isHash(px.sha256);
        if (typeof file.path !== 'string' || bytesOk === false || pixelsOk === false || (bytesOk === null && pixelsOk === null)) {
          problems.push(`recipes[${i}].files[${j}] is not { path, size, sha256 } and/or { path, pixels: { width, height, sha256 } }`);
          return;
        }
        files.push({
          path: file.path,
          ...(bytesOk === true ? { size: file.size as number, sha256: file.sha256 as string } : {}),
          ...(pixelsOk === true && px !== null ? { pixels: { width: px.width as number, height: px.height as number, sha256: px.sha256 as string } } : {}),
        });
      });
    }
    if (recipe !== undefined && exitsOk && framingOk) {
      rows.push({ ...recipe, exits: e.exits as Array<number | null>, renderExit: (e.renderExit as number | null) ?? null, framing: (f as Framing | null) ?? null, files });
    }
  });
  if (problems.length > 0) throw new HashesInputError(`${path}: not a ${RENDER_HASHES_SPEC} document — ${problems.join('; ')}`);
  return { spec: RENDER_HASHES_SPEC, render: record.render as string[], recipes: rows.sort((a, b) => byCodeUnit(a.name, b.name)) };
}

/** The recipes a `run` executes: a recipes file, an `emit-hashes/1` document, or a `render-hashes/1` one. */
export function recipesFrom(path: string): Recipe[] {
  if (existsSync(path)) {
    let spec: unknown;
    try {
      spec = (JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>).spec;
    } catch {
      spec = undefined;
    }
    if (spec === RENDER_HASHES_SPEC) return readRenderHashes(path).recipes.map(({ name, stage, commands }) => ({ name, stage, commands }));
  }
  return readRecipes(path);
}

export interface RenderComparison {
  identical: boolean;
  /** Per row, the PNGs whose bytes differ while their pixels agree — the encoder, not the render. */
  encodingOnly: Array<{ name: string; files: string[] }>;
  recipes: number;
  files: number;
  onlyA: string[];
  onlyB: string[];
  differ: Array<{ name: string; findings: string[] }>;
}

/** Two documents; throws HashesInputError when they cannot be compared. */
export function compareRenderHashes(a: RenderHashesDocument, b: RenderHashesDocument): RenderComparison {
  if (JSON.stringify(a.render) !== JSON.stringify(b.render)) {
    throw new HashesInputError(`the two documents ran different renders — ${JSON.stringify(a.render)} in A, ${JSON.stringify(b.render)} in B`);
  }
  const inA = new Map(a.recipes.map((r) => [r.name, r]));
  const inB = new Map(b.recipes.map((r) => [r.name, r]));
  const mismatched = a.recipes
    .filter((ra) => {
      const rb = inB.get(ra.name);
      return rb !== undefined && JSON.stringify([ra.stage, ra.commands]) !== JSON.stringify([rb.stage, rb.commands]);
    })
    .map((ra) => `recipe ${JSON.stringify(ra.name)}`);
  if (mismatched.length > 0) {
    throw new HashesInputError(`the two documents come from different recipe sets — ${mismatched.length} name(s) stand for different builds: ${mismatched.join(', ')}`);
  }
  const onlyA = a.recipes.filter((r) => !inB.has(r.name)).map((r) => r.name);
  const onlyB = b.recipes.filter((r) => !inA.has(r.name)).map((r) => r.name);
  const differ: RenderComparison['differ'] = [];
  const encodingOnly: RenderComparison['encodingOnly'] = [];
  let files = 0;
  for (const ra of a.recipes) {
    const rb = inB.get(ra.name);
    if (rb === undefined) continue;
    files += ra.files.length;
    const findings: string[] = [];
    const encoded: string[] = [];
    if (JSON.stringify(ra.exits) !== JSON.stringify(rb.exits)) findings.push(`build exit codes ${JSON.stringify(ra.exits)} in A, ${JSON.stringify(rb.exits)} in B`);
    if (ra.renderExit !== rb.renderExit) findings.push(`render exit ${String(ra.renderExit)} in A, ${String(rb.renderExit)} in B`);
    if ((ra.framing === null) !== (rb.framing === null)) findings.push(`framing ${JSON.stringify(ra.framing)} in A, ${JSON.stringify(rb.framing)} in B`);
    else if (ra.framing !== null && rb.framing !== null) {
      for (const k of FRAMING_KEYS) {
        if (!Object.is(ra.framing[k], rb.framing[k])) findings.push(`framing ${k} ${ra.framing[k]} in A, ${rb.framing[k]} in B`);
      }
    }
    const fa = new Map(ra.files.map((f) => [f.path, f]));
    const fb = new Map(rb.files.map((f) => [f.path, f]));
    for (const f of ra.files) {
      const g = fb.get(f.path);
      if (g === undefined) findings.push(`${f.path} only in A${f.size === undefined ? '' : ` (${f.size} bytes)`}`);
      else {
        const verdict = fileVerdict(f, g);
        if (verdict === 'encoding') encoded.push(`${f.path}: bytes differ (${f.size} bytes ${short(f.sha256)} in A, ${g.size} bytes ${short(g.sha256)} in B), pixels identical`);
        else if (verdict !== null) findings.push(verdict);
      }
    }
    for (const g of rb.files) if (!fa.has(g.path)) findings.push(`${g.path} only in B${g.size === undefined ? '' : ` (${g.size} bytes)`}`);
    if (findings.length > 0) differ.push({ name: ra.name, findings });
    if (encoded.length > 0) encodingOnly.push({ name: ra.name, files: encoded });
  }
  const identical = onlyA.length === 0 && onlyB.length === 0 && differ.length === 0;
  return { identical, encodingOnly, recipes: a.recipes.length - onlyA.length, files, onlyA, onlyB, differ };
}

function short(hash: string | undefined): string {
  return hash === undefined ? '(none)' : hash.slice(0, 12);
}

/**
 * One file present on both sides: `null` when they agree on every hash they
 * both carry, `'encoding'` when the bytes differ and the pixels agree, else
 * the finding. Pixels decide a PNG whenever both sides carry them.
 */
function fileVerdict(f: RenderFile, g: RenderFile): string | 'encoding' | null {
  const bytesBoth = f.sha256 !== undefined && g.sha256 !== undefined;
  const bytesDiffer = bytesBoth && (f.sha256 !== g.sha256 || f.size !== g.size);
  if (f.pixels !== undefined && g.pixels !== undefined) {
    const p = f.pixels;
    const q = g.pixels;
    if (p.width !== q.width || p.height !== q.height || p.sha256 !== q.sha256) {
      return `${f.path} differs: pixels ${p.width}x${p.height} ${short(p.sha256)} in A, ${q.width}x${q.height} ${short(q.sha256)} in B`;
    }
    return bytesDiffer ? 'encoding' : null;
  }
  if (!bytesBoth) return `${f.path} carries no hash both sides hold (bytes on one, pixels on the other) — nothing to compare`;
  return bytesDiffer ? `${f.path} differs: ${f.size} bytes ${short(f.sha256)} in A, ${g.size} bytes ${short(g.sha256)} in B` : null;
}

/** A DIFF row names at most this many files, then says how many more; the framing and exit lines are never cut. */
const FILES_SHOWN = 12;

export function renderComparisonLines(c: RenderComparison): string[] {
  const lines: string[] = [];
  for (const d of c.differ) {
    lines.push(`  DIFF  ${d.name}`);
    const fileLines = d.findings.filter((f) => f.startsWith('render/') || f.startsWith('extra/'));
    const other = d.findings.filter((f) => !fileLines.includes(f));
    for (const f of other) lines.push(`          ${f}`);
    for (const f of fileLines.slice(0, FILES_SHOWN)) lines.push(`          ${f}`);
    if (fileLines.length > FILES_SHOWN) lines.push(`          … and ${fileLines.length - FILES_SHOWN} more file(s) that differ`);
  }
  for (const e of c.encodingOnly) {
    lines.push(`  BYTES  ${e.name}`);
    for (const f of e.files.slice(0, FILES_SHOWN)) lines.push(`          ${f}`);
    if (e.files.length > FILES_SHOWN) lines.push(`          … and ${e.files.length - FILES_SHOWN} more PNG(s) whose bytes differ and pixels agree`);
  }
  for (const name of c.onlyA) lines.push(`  ONLY-A  ${name}`);
  for (const name of c.onlyB) lines.push(`  ONLY-B  ${name}`);
  const encoded = c.encodingOnly.reduce((n, e) => n + e.files.length, 0);
  if (c.identical && encoded === 0) lines.push(`IDENTICAL — ${c.recipes} recipe(s), ${c.files} file(s), every exit code, framing number, size and hash equal`);
  else if (c.identical) {
    lines.push(
      `IDENTICAL IN PIXELS — ${c.recipes} recipe(s), ${c.files} file(s): every exit code, framing number and pixel equal; ` +
        `${encoded} PNG(s) in ${c.encodingOnly.length} recipe(s) differ in their bytes only — the encoder, not the render`,
    );
  }
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

/** The file at `file` against `fresh` (a `pixelsOnly` run): CURRENT only when byte-identical to what `base` writes, which holds pixel hashes alone. */
export function renderBaseVerdict(file: string, shown: string, fresh: RenderHashesDocument, command: string = RENDER_BASE_COMMAND): { current: boolean; lines: string[] } {
  const files = fresh.recipes.reduce((n, r) => n + r.files.length, 0);
  const refresh = `regenerate it with \`${command}\` in the same change, and say in the pull request which rows moved and why`;
  if (!existsSync(file)) return { current: false, lines: [`STALE — there is no base at ${shown}; ${refresh}`] };
  if (readFileSync(file, 'utf8') === renderHashesText(fresh)) {
    return { current: true, lines: [`CURRENT — ${shown} is byte-identical to a fresh render of the gallery's ${fresh.recipes.length} recipe(s): ${files} PNG(s), every pixel hash equal`] };
  }
  const lines: string[] = [];
  try {
    const c = compareRenderHashes(readRenderHashes(file), fresh);
    if (c.identical) lines.push(`  ${shown} agrees with this tree on every exit code and pixel hash, but not in its bytes: it was not written by \`${command}\``);
    else lines.push(...renderComparisonLines(c).filter((l) => l.startsWith('  ')));
  } catch (err) {
    if (!(err instanceof HashesInputError)) throw err;
    lines.push(`  ${err.message}`);
  }
  lines.push(`STALE — ${shown} is not what \`${command}\` writes on this tree (A = the file, B = this tree); a change that moves a gallery render's bytes on purpose must ${refresh}`);
  return { current: false, lines };
}

// ---------------------------------------------------------------------------
// the command
// ---------------------------------------------------------------------------

export const RENDER_HASHES_USAGE = [
  'usage:',
  '  bun tools/render_hashes.ts run --recipes <recipes.json> --out <hashes.json> [--work <dir> | --keep-work] [--root <dir>]',
  '  bun tools/render_hashes.ts compare <a.json> <b.json>',
  '  bun tools/render_hashes.ts base [--check] [--file <hashes.json>] [--work <dir> | --keep-work] [--root <dir>]',
  '  (a work directory made without --work is removed when the command ends; --keep-work keeps it and names it)',
  '  (the tree\'s 19 recipes: bun tools/emit_hashes.ts recipes --out <recipes.json>)',
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
    if (!known.includes(arg)) throw new HashesInputError(`unknown flag ${arg}; this command takes ${[...known, ...switches].join(', ') || 'no flag'}`);
    const value = args[i + 1];
    if (value === undefined || value.startsWith('--')) throw new HashesInputError(`${arg} needs a value`);
    if (flags.has(arg)) throw new HashesInputError(`${arg} given twice`);
    flags.set(arg, value);
    i++;
  }
  return { positional, flags };
}

function rootOf(flags: Map<string, string>): string {
  const root = resolve(flags.get('--root') ?? TREE_ROOT);
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new HashesInputError(`--root ${root} is not a directory`);
  return root;
}

/** The command; returns the exit code. */
export function renderHashesMain(argv: readonly string[], print: (line: string) => void = console.log, warn: (line: string) => void = console.error): number {
  const [command, ...args] = argv;
  const scope = new WorkDirectory('render_hashes');
  try {
    // `--keep-work` is read only where a work directory is made; elsewhere the parser refuses it as unknown.
    const { argv: rest, keep } = command === 'run' || command === 'base' ? readKeepWork(args, ['--check'], (m) => new HashesInputError(m)) : { argv: args, keep: false };
    if (command === 'run') {
      const { positional, flags } = parseFlags(rest, ['--recipes', '--out', '--work', '--root']);
      if (positional.length > 0) throw new HashesInputError(`run takes no path, got ${positional.join(' ')}`);
      const recipesPath = flags.get('--recipes');
      const out = flags.get('--out');
      if (recipesPath === undefined) throw new HashesInputError('run: --recipes <recipes.json> is required');
      if (out === undefined) throw new HashesInputError('run: --out <hashes.json> is required');
      const root = rootOf(flags);
      const recipes = recipesFrom(recipesPath);
      const unstaged = recipes.flatMap((r) =>
        r.stage.filter((e) => !existsSync(resolve(root, e.from))).map((e) => `recipe ${JSON.stringify(r.name)} stages ${JSON.stringify(e.from)}, and nothing is at ${resolve(root, e.from)}`),
      );
      if (unstaged.length > 0) throw new HashesInputError(`${unstaged.length} input(s) missing before anything ran: ${unstaged.join('; ')}`);
      const work = scope.open(flags.get('--work'), keep, 'rigc-render-hashes-', (m) => new HashesInputError(m));
      warn(`render_hashes: ${recipes.length} recipe(s), work directory ${work}`);
      const started = performance.now();
      const doc = renderRows(recipes, work, root, print);
      const seconds = (performance.now() - started) / 1000;
      writeFileSync(out, renderHashesText(doc));
      const green = doc.recipes.filter((r) => r.renderExit === 0).length;
      print(`render_hashes: ${doc.recipes.length} recipe(s), ${green} rendered, ${doc.recipes.length - green} refused → ${out}`);
      warn(`render_hashes: wall time ${seconds.toFixed(1)} s`);
      return 0;
    }
    if (command === 'base') {
      const { positional, flags } = parseFlags(rest, ['--file', '--work', '--root'], ['--check']);
      if (positional.length > 0) throw new HashesInputError(`base takes no path, got ${positional.join(' ')}`);
      const file = resolve(flags.get('--file') ?? join(TREE_ROOT, RENDER_BASE_FILE));
      const shown = flags.has('--file') ? file : RENDER_BASE_FILE;
      const root = rootOf(flags);
      const recipes = galleryRecipes(root, warn);
      const work = scope.open(flags.get('--work'), keep, 'rigc-render-hashes-base-', (m) => new HashesInputError(m));
      warn(`render_hashes: ${recipes.length} gallery recipe(s), work directory ${work}`);
      const started = performance.now();
      const doc = pixelsOnly(renderRows(recipes, work, root, print));
      warn(`render_hashes: wall time ${((performance.now() - started) / 1000).toFixed(1)} s`);
      if (flags.has('--check')) {
        const verdict = renderBaseVerdict(file, shown, doc, flags.has('--file') ? `${RENDER_BASE_COMMAND} --file ${file}` : RENDER_BASE_COMMAND);
        for (const line of verdict.lines) print(line);
        return verdict.current ? 0 : 1;
      }
      const refused = doc.recipes.filter((r) => r.renderExit !== 0);
      if (refused.length > 0) {
        throw new HashesInputError(
          `${refused.length} gallery row(s) did not render, and a base is a record of green renders — nothing written: ` +
            refused.map((r) => `${r.name} build exits ${JSON.stringify(r.exits)}, render exit ${String(r.renderExit)} (logs beside ${work}${scope.removalNote()})`).join('; '),
        );
      }
      writeFileSync(file, renderHashesText(doc));
      print(`render_hashes: base of ${doc.recipes.length} gallery recipe(s), ${doc.recipes.reduce((n, r) => n + r.files.length, 0)} file(s) → ${shown}`);
      return 0;
    }
    if (command === 'compare') {
      const { positional } = parseFlags(rest, []);
      if (positional.length !== 2) throw new HashesInputError(`compare: expected <a.json> <b.json>, got ${positional.length} path(s)`);
      const c = compareRenderHashes(readRenderHashes(positional[0]), readRenderHashes(positional[1]));
      print(`render_hashes compare A=${positional[0]} B=${positional[1]}`);
      for (const line of renderComparisonLines(c)) print(line);
      return c.identical ? 0 : 1;
    }
    throw new HashesInputError(command === undefined ? 'no command' : `unknown command ${JSON.stringify(command)}`);
  } catch (err) {
    if (err instanceof HashesInputError) {
      warn(`render_hashes: ${err.message}`);
      if (err.message.startsWith('no command') || err.message.startsWith('unknown command')) warn(RENDER_HASHES_USAGE);
      return 2;
    }
    throw err;
  } finally {
    scope.close(warn);
  }
}

if (import.meta.main) process.exit(renderHashesMain(process.argv.slice(2)));
