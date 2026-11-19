#!/usr/bin/env bun
/**
 * Render a rung's OFFICIAL export to PNG frames — the reference an authoring
 * agent is allowed to look at.
 *
 * ⭐ Why this exists. `docs/LADDER.md`'s honesty rule keeps the reference
 * `skeleton.json` away from the authoring agent, because an agent that has seen
 * the answer is being measured on transcription rather than on authoring. But a
 * human animator would be shown the shot, so withholding *what it looks like*
 * measures nothing except whether the agent can guess. Frames are the honest
 * middle: they are exactly what a client watching the animation could see, and
 * they carry no bone name, no key time and no curve handle.
 *
 * ⚠️ The frames must come from the **official export**, never from a
 * transcription or from a candidate — that is the whole point of a reference —
 * so this reads `examples/<rung>/export/` and nothing else.
 *
 * ## One example renders local-only, and the rest keep the refusal
 *
 * A rendered frame carries the example's own pixels, so writing one redistributes
 * the images — which every example's `license.txt` grants only while that file
 * travels alongside. `7-anticipation` has no `license.txt` upstream at all, and
 * this script used to refuse it outright and for every output path. That refusal
 * left rung 7 with no obtainable frames, and so — under the honesty rule, where a
 * brief is written by somebody *watching the frames* — with no writable brief
 * either. The owner ruled on 2026-08-26 (issue #3, raised by the
 * brief-verification pass on issue #14) that #3's rule, *"never vendor, commit,
 * publish or ship"*, does not forbid a render that never leaves the local disk.
 *
 * So that one example may be rendered, **only** to a path this repository ignores
 * or does not contain, and every other case keeps the unconditional refusal
 * exactly as it was. See `LOCAL_ONLY_EXAMPLES` below for what holds the exception
 * narrow.
 *
 * ## Why not spine-html, and why no browser at all
 *
 * The obvious route is the sibling `spine-html` renderer under Playwright. It
 * would work, and it costs a vite build, a preview server and one browser
 * screenshot per frame. Nothing here needs a browser: `spine-core` computes the
 * world vertices on the CPU — for a region and, since #27, for a weighted or
 * deformed mesh — and `tools/plate.ts` already reads and writes PNGs. The
 * rasteriser itself lives in [`src/render.ts`](../src/render.ts), which `rigc
 * check` shares — a candidate has to be drawn by the same code that drew the
 * reference or every number `check` reports carries the difference between two
 * renderers on top of the difference between two rigs.
 *
 * Region **and** mesh attachments; a mesh's triangles are filled with
 * barycentric UV interpolation and no perspective divide, which is what a flat
 * 2D deformation is. An attachment type that draws nothing — a bounding box, a
 * point, a clipping shape — is skipped rather than refused.
 *
 * ```
 * bun bench/render_reference.ts --rung 3 [--fps 12] [--max 256] [--tile 128]
 *                                        [--stride 1] [--out <dir>]
 * ```
 *
 * ## Where the frames land
 *
 * ```
 * <out>/[<skeleton label>/]frames.json
 * <out>/[<skeleton label>/]<animation>[@<fps>fps]/f0000.png…, contact.png
 * ```
 *
 * The two optional segments are there only when they carry information, so that
 * the common case stays the short path it already is:
 *
 * - the **label** segment appears when the rung has more than one skeleton (rungs
 *   1 and 8 do). Two skeletons of one rung are two different shots that happen to
 *   share an atlas, and they get their own viewports — pooling their frames in one
 *   directory would say they were comparable;
 * - the **rate** suffix appears at any rate other than the 12 fps protocol, so a
 *   second pass at another rate sits beside the first instead of replacing it.
 *
 * `--stride N` writes every Nth sampled frame while keeping its true index in the
 * name, and the contact sheet still shows **every** sampled frame. That splits two
 * costs a long shot conflates: the frames are what you measure and they are dear
 * (a still of a busy scene is tens of kilobytes, and most of those bytes are the
 * static set redrawn), while the sheet is what you flip through and it is cheap
 * (one file, so deflate finds the redrawn set again in the next tile).
 *
 * ## `frames.json` — the sidecar
 *
 * ⭐ A frame set is a picture of a world box, and until this file was written the
 * box was nowhere: an author could measure a distance in pixels and had no way to
 * turn it into the units a rig is authored in except by finding something of a
 * known size in the shot. Worse, `rigc check` cannot render a candidate *into the
 * same frame* without it, and re-deriving the framing from the candidate would
 * frame the candidate to its own extent — which is precisely the error the
 * reference renderer avoids by measuring the box once, densely, per skeleton.
 *
 * So each skeleton root carries one `frames.json`: the world box, the scale, the
 * background colour, and one entry per frame directory with its rate and count.
 * It is written **beside** the frames rather than inside each directory because
 * the box is a property of the shot and every rate of one skeleton shares it.
 * Sidecars accumulate across runs at different rates; a run whose framing differs
 * from the one on disk replaces the file outright and says which sets it dropped,
 * because those sets are at a scale this file can no longer describe.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { findRung, RUNG_IDS } from '../src/ladder.ts';
import {
  BACKGROUND,
  contactSheet,
  FRAMES_SIDECAR,
  FRAMES_SPEC,
  framingViewport,
  loadPosable,
  PROTOCOL_FPS,
  renderFrame,
  sampleAll,
  SETUP_POSE_DIR,
  SHEET_FILE,
  SHEET_TILE,
  type FramesSidecar,
  type FrameSet,
} from '../src/render.ts';
import { frameSetDir, FrameSetDirError, frameSetDirs } from '../src/render_shared.ts';

/**
 * 🔓 The examples that may be rendered **local-only** — one name, and it is a set
 * rather than a flag on purpose.
 *
 * ⚖️ Ruled by the owner on **2026-08-26**, on
 * [issue #3](https://github.com/rig-c/core/issues/3) (*"Rung 7
 * (`7-anticipation`) has no upstream license.txt — local-only, never
 * redistribute"*), after the brief-verification pass on
 * [issue #14](https://github.com/rig-c/core/issues/14) found that this
 * script's refusal, not the licence, was what made rung 7 unattemptable: with no
 * frames obtainable there is no honest input for either the writing pass or the
 * verifying pass, and a brief written from `sack-pro.json` would be a
 * transcription of the answer. The ruling: #3's rule — *"never vendor, commit,
 * publish or ship"* — does not forbid a render that stays on this disk, so the
 * refusal takes a deliberate, narrow exception for this one example.
 *
 * Three things keep it narrow, and each is **checked** rather than documented:
 *
 * 1. the exception is this set — one example, edited on a ruling — and not a
 *    `--force`, `--yes-i-know` or `--local-only` flag somebody can pass by
 *    accident or in a copied command line;
 * 2. the output path must be one `git check-ignore` accepts, or lie outside the
 *    repository altogether. So the default lands in `bench/reference-local/`
 *    (which `.gitignore` covers) and `--out bench/reference/7-anticipation`
 *    **refuses** — a frame of this example cannot reach a commit by mistake,
 *    which is the part of #3's rule that has teeth;
 * 3. the guard **fails closed**. No `git`, a broken `git`, or a checkout that is
 *    not a repository refuses too, because *"I could not check"* is not *"it is
 *    ignored"*.
 *
 * 🚫 What the ruling does **not** grant: committing, publishing or shipping these
 * frames, in any artefact, ever. The notice written beside them says so, in the
 * place the missing `license.txt` would have occupied.
 */
const LOCAL_ONLY_EXAMPLES = new Set(['7-anticipation']);

/** Where a local-only render lands by default. `.gitignore` covers it, and the
 *  guard below is what makes that coverage load-bearing rather than a habit. */
const LOCAL_ONLY_DIR = join('bench', 'reference-local');

/** Written beside a local-only render, in place of the `license.txt` that does not
 *  exist upstream — so the constraint is a property of the output rather than of
 *  somebody remembering it, which is what the licence copy does for every other
 *  rung. */
const LOCAL_ONLY_NOTICE = 'LOCAL-ONLY.txt';
const LOCAL_ONLY_TEXT = `LOCAL ONLY — DO NOT COMMIT, PUBLISH, SHIP OR REDISTRIBUTE

These frames are rendered from a Spine example that ships NO license.txt upstream,
so its images carry no redistribution grant of any kind. They were written here
under the owner's ruling of 2026-08-26 on https://github.com/rig-c/core/issues/3,
which allows a LOCAL render — reading and drawing on this disk — and nothing more.

  - never commit them, and never include them in a released artefact;
  - never copy them to a path this repository does not ignore;
  - re-render them instead of moving them.

See docs/LADDER.md, "Licence, per rung".
`;

function usage(message: string): never {
  console.error(`rigc render_reference: ${message}

usage:
  bun bench/render_reference.ts --rung <${RUNG_IDS.join(' | ')}>
      [--fps ${PROTOCOL_FPS}] [--max 256] [--tile ${SHEET_TILE}] [--stride 1] [--out <dir>]

  --fps     frames per second to sample each animation at (default ${PROTOCOL_FPS}, the ladder protocol)
  --max     longest side of a frame in pixels (default 256)
  --tile    longest side of one contact-sheet tile (default ${SHEET_TILE})
  --stride  write every Nth frame; the contact sheet still shows every one (default 1)
  --out     output root; defaults to bench/reference/<example>/ — or, for a local-only
            example, to ${LOCAL_ONLY_DIR}/<example>/, and then only a path git ignores`);
  process.exit(2);
}

function parseArgs(argv: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) usage(`unexpected argument ${JSON.stringify(arg)}`);
    const eq = arg.indexOf('=');
    if (eq !== -1) {
      flags[arg.slice(2, eq)] = arg.slice(eq + 1);
      continue;
    }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) usage(`${arg} needs a value`);
    flags[arg.slice(2)] = next;
    i++;
  }
  return flags;
}

/**
 * Merge this run's sets into whatever sidecar is already on disk.
 *
 * Same framing ⇒ the two runs describe one shot at two rates and both belong in
 * the file. Different framing ⇒ the sets already there are at a scale this run's
 * numbers do not describe, so they are dropped by name rather than left to be
 * read against the wrong viewport.
 */
function writeSidecar(root: string, next: FramesSidecar): void {
  const path = join(root, FRAMES_SIDECAR);
  let sets = next.sets;
  if (existsSync(path)) {
    const previous = JSON.parse(readFileSync(path, 'utf8')) as FramesSidecar;
    const same =
      previous.spec === next.spec &&
      previous.viewport.width === next.viewport.width &&
      previous.viewport.height === next.viewport.height &&
      previous.viewport.scale === next.viewport.scale &&
      previous.viewport.x === next.viewport.x &&
      previous.viewport.y === next.viewport.y;
    const fresh = new Set(next.sets.map((s) => s.dir));
    const kept = (previous.sets ?? []).filter((s) => !fresh.has(s.dir));
    if (same) {
      sets = [...kept, ...next.sets];
    } else if (kept.length > 0) {
      console.log(
        `    ⚠️ framing changed — dropping ${kept.length} stale set(s) from ${FRAMES_SIDECAR}: ` +
          `${kept.map((s) => s.dir).join(', ')} (they are on disk at another scale and this file can no longer describe them)`,
      );
    }
  }
  sets.sort((a, b) => a.dir.localeCompare(b.dir));
  writeFileSync(path, `${JSON.stringify({ ...next, sets }, null, 2)}\n`);
}

/**
 * `resolve`, but with symlinks followed through the part of the path that exists.
 *
 * The guard below asks *"could a file written here be committed?"*, and a symlink
 * makes a path that is lexically outside the repository name a place that is
 * inside it. Only the existing prefix can be resolved — the frames' own directory
 * is usually not there yet — and that is enough, because the segments this script
 * creates are created by this script.
 */
function realResolve(path: string): string {
  let head = resolve(path);
  const tail: string[] = [];
  while (!existsSync(head)) {
    const parent = dirname(head);
    if (parent === head) return resolve(path);
    tail.unshift(basename(head));
    head = parent;
  }
  return join(realpathSync(head), ...tail);
}

/** Does `git` ignore a file written at `path`? Exit 0 means "ignored"; a 1, a
 *  fatal 128 or no `git` at all all mean "no", so the caller refuses. */
function gitIgnores(root: string, path: string): boolean {
  const probe = spawnSync('git', ['-C', root, 'check-ignore', '-q', '--', path], { stdio: 'ignore' });
  return probe.error === undefined && probe.status === 0;
}

/**
 * 🔒 The local-only guard: refuse any output path a frame of this example could be
 * committed from. See `LOCAL_ONLY_EXAMPLES` for the ruling this implements.
 *
 * Outside the repository is fine — nothing there is committable *by this
 * repository*, and what somebody does with their own disk is beyond a script.
 * Inside it, `git` decides, and it decides against a path it does not ignore.
 */
function refuseCommittableOut(root: string, example: string, out: string): void {
  const realRoot = realResolve(root);
  const realOut = realResolve(out);
  const rel = relative(realRoot, realOut);
  const inside = rel === '' || (!rel.startsWith('..') && !rel.startsWith('/'));
  if (!inside) return;
  if (gitIgnores(realRoot, realOut)) return;
  usage(
    `${example} ships no license.txt, so its frames are local-only (docs/LADDER.md, Licence per rung; issue #3) — ` +
      `and --out ${out} is inside this repository at a path git does not ignore, so a frame written there could be ` +
      `committed. Point --out at ${LOCAL_ONLY_DIR}/ (which .gitignore covers), at another ignored path, or at a ` +
      'path outside the repository. If git could not answer at all, that is this refusal too: the guard fails closed.',
  );
}

// ---------------------------------------------------------------------------

const flags = parseArgs(process.argv.slice(2));
const rungId = flags.rung;
if (!rungId) usage(`--rung is required (${RUNG_IDS.join(' | ')})`);
const rung = findRung(rungId);
if (!rung) usage(`unknown rung ${JSON.stringify(rungId)}; known: ${RUNG_IDS.join(', ')}`);
const fps = Number(flags.fps ?? PROTOCOL_FPS);
const maxSide = Number(flags.max ?? 256);
const tile = Number(flags.tile ?? SHEET_TILE);
const stride = Number(flags.stride ?? 1);
if (!Number.isFinite(fps) || fps <= 0) usage('--fps must be a positive number');
if (!Number.isFinite(maxSide) || maxSide < 16) usage('--max must be at least 16');
if (!Number.isFinite(tile) || tile < 16) usage('--tile must be at least 16');
if (!Number.isInteger(stride) || stride < 1) usage('--stride must be a whole number of 1 or more');

const repoRoot = resolve(import.meta.dir, '..');
const exportDir = join(repoRoot, 'examples', rung.example, 'export');
if (!existsSync(exportDir)) {
  usage(`no example corpus at ${exportDir} — run \`bun run fetch-examples\` first (examples/ is gitignored)`);
}
// 🔒 A rendered frame carries the example's own pixels, so writing one is
// redistribution of the images. Every example's `license.txt` grants that only
// "as long as they are accompanied by this license file" — and `7-anticipation`
// has no `license.txt` upstream at all, so for that one the grant does not
// exist. Refusing here, and copying the file next to the frames, makes the
// licence a property of the output rather than of somebody remembering.
//
// 🔓 The one exception, ruled by the owner on 2026-08-26 on issue #3: an example
// on `LOCAL_ONLY_EXAMPLES` renders to a path this repository cannot commit from,
// and to nothing else. The reasoning, and the three checks that keep it narrow,
// are on that constant. Every other missing licence keeps the refusal below
// exactly as it stood.
const licencePath = join(repoRoot, 'examples', rung.example, 'license.txt');
const licensed = existsSync(licencePath);
const localOnly = !licensed && LOCAL_ONLY_EXAMPLES.has(rung.example);
if (!licensed && !localOnly) {
  usage(
    `${rung.example} ships no license.txt, so its images carry no redistribution grant — ` +
      'rendered frames of it must not be written anywhere, let alone committed (see docs/LADDER.md, Licence per rung)',
  );
}

const outRoot = flags.out
  ? resolve(flags.out)
  : join(repoRoot, ...(localOnly ? [LOCAL_ONLY_DIR] : ['bench', 'reference']), rung.example);
if (localOnly) refuseCommittableOut(repoRoot, rung.example, outRoot);

console.log(`rigc render_reference rung ${rung.id} — ${rung.example}`);
console.log(`  source     ${exportDir}`);
console.log(`  out        ${outRoot}`);
console.log(`  sampling   ${fps} fps, longest side ${maxSide}px, sheet tile ${tile}px`);
if (localOnly) {
  console.log(`  🔒 LOCAL ONLY — ${rung.example} ships no upstream license.txt, so these frames carry no`);
  console.log('     redistribution grant. Owner ruling 2026-08-26 (issue #3) allows the render and nothing');
  console.log(`     more: never commit, publish or ship them. git ignores the path above, and ${LOCAL_ONLY_NOTICE}`);
  console.log('     lands beside the frames saying the same.');
}
if (stride > 1) {
  console.log(`  ⚠️ stride  every ${stride}th frame is written; the contact sheet still shows all of them`);
}

for (const skeletonEntry of rung.skeletons) {
  const skeletonPath = join(exportDir, skeletonEntry.file);
  const { data, pages } = loadPosable(skeletonPath, join(exportDir, skeletonEntry.atlas), exportDir);

  // Pass 1: pose everything at the framing rate and take the union of the posed
  // vertices, so that every animation of one skeleton — at every output rate —
  // shares a viewport. Framing each animation to its own extent would rescale
  // the motion between them, which is the one thing a timing-and-spacing
  // reference must not do. A skeleton with no animation contributes its setup
  // pose instead, under the reserved name `setup`.
  const viewport = framingViewport(data, maxSide);
  if (!viewport) usage(`${skeletonPath} posed no drawable attachment in any animation or in its setup pose`);

  // Pass 2: the frames that actually get written.
  const sampled = sampleAll(data, fps);

  const what = data.animations.length === 0 ? 'no animation — setup pose only' : `${sampled.size} animation(s)`;
  console.log(`  ${skeletonEntry.label}: ${viewport.width}x${viewport.height}px, ${what}`);
  // Every set's directory refused as one scope before anything is written, as `render` refuses it (issue #1744).
  try {
    frameSetDirs([...sampled.keys()], fps);
  } catch (err) {
    if (err instanceof FrameSetDirError) usage(err.message);
    throw err;
  }
  mkdirSync(outRoot, { recursive: true });
  // The licence travels with the frames — or, for the one local-only example that
  // has no licence to travel, the notice that says why it does not and what that
  // forbids. Either way the constraint is a file in the output directory rather
  // than something the next reader has to already know.
  if (licensed) copyFileSync(licencePath, join(outRoot, 'license.txt'));
  else writeFileSync(join(outRoot, LOCAL_ONLY_NOTICE), LOCAL_ONLY_TEXT);
  // Two skeletons of one rung are two shots that share an atlas and nothing else
  // — they were framed to their own viewports a few lines up — so they do not
  // pool their frames in one directory. A rung with one skeleton keeps the short
  // path it already had, and rung 3's committed frames still land where they are.
  const skeletonRoot = rung.skeletons.length > 1 ? join(outRoot, skeletonEntry.label) : outRoot;
  const sets: FrameSet[] = [];
  for (const [name, frames] of sampled) {
    const dirName = frameSetDir(name, fps);
    const dir = join(skeletonRoot, dirName);
    if (existsSync(dir)) rmSync(dir, { recursive: true });
    mkdirSync(dir, { recursive: true });
    const written: number[] = [];
    for (let i = 0; i < frames.length; i++) {
      // The last frame is always written whatever the stride: it is where the
      // animation ENDS, which is the one frame a brief states outright.
      if (i % stride !== 0 && i !== frames.length - 1) continue;
      renderFrame(frames[i], pages, viewport, BACKGROUND).writePng(join(dir, `f${String(i).padStart(4, '0')}.png`));
      written.push(i);
    }
    // One contact sheet beside the frames, of EVERY sampled frame — including
    // the ones the stride did not write out. Spacing (how far the thing moves
    // between two frames) is a comparison across frames, and it is visible in a
    // grid in a way it is not in 65 separate files.
    //
    // A single frame has nothing to compare itself against, so it gets no sheet:
    // the sheet would be that same frame with a border and a "0" on it, and the
    // reader would have opened a second file to learn nothing.
    if (frames.length > 1) contactSheet(frames, pages, viewport, tile).writePng(join(dir, SHEET_FILE));
    const last = frames[frames.length - 1].time;
    sets.push({
      dir: dirName,
      animation: name === SETUP_POSE_DIR && data.animations.length === 0 ? null : name,
      fps,
      sampled: frames.length,
      written: written.length,
      stride,
      duration: last,
    });
    const how = frames.length === 1 ? 'a single pose' : `${last.toFixed(3)}s at ${fps} fps`;
    const kept = written.length === frames.length ? '' : ` (${written.length} written, stride ${stride})`;
    console.log(`    ${name.padEnd(16)} ${frames.length} frame(s)${kept}, ${how} -> ${dir}`);
  }

  writeSidecar(skeletonRoot, {
    spec: FRAMES_SPEC,
    example: rung.example,
    rung: rung.id,
    skeleton: skeletonEntry.label,
    background: BACKGROUND,
    viewport: {
      x: viewport.minX,
      y: viewport.minY,
      width: viewport.maxX - viewport.minX,
      height: viewport.maxY - viewport.minY,
      scale: viewport.scale,
      pixelWidth: viewport.width,
      pixelHeight: viewport.height,
    },
    sets,
  });
  console.log(`    ${FRAMES_SIDECAR.padEnd(16)} viewport ${viewport.width}x${viewport.height}px, ${viewport.scale.toFixed(6)} px per unit -> ${join(skeletonRoot, FRAMES_SIDECAR)}`);
}
