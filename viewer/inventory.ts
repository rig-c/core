/**
 * The dev server's half of the run viewer: what is actually on disk under
 * `bench/runs/`, resolved into URLs a browser can fetch.
 *
 * It runs in Node (the Vite config imports it), never in the browser, and it
 * only ever reads. Everything it reports is derived from the files — a run that
 * predates a convention is listed with the reason it cannot be shown, never
 * omitted, because a viewer that silently drops a run is a viewer that lies
 * about the ladder's history.
 *
 * Three run shapes exist in the tree and all three are handled:
 *
 *   bench/runs/<run>/spine/skeleton.json              rung 2–6 (one candidate)
 *   bench/runs/<run>/<candidate>/spine/skeleton.json  rung 8, spineboy
 *   bench/runs/<run>/<candidate>-spine/skeleton.json  rung 1
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { resolveWrittenPath, spelledDir } from '../src/written_path.ts';

/** Every repository file the viewer serves hangs under this URL prefix. */
export const REPO_MOUNT = '/repo';

/** Repository-relative paths the dev server can serve. */
export function isServedRepoPath(relativePath: string): boolean {
  const top = relativePath.split(path.sep)[0];
  return !relativePath.startsWith('..') && !path.isAbsolute(relativePath) && (top === 'bench' || top === 'examples');
}

export interface Viewport {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  pixelWidth: number;
  pixelHeight: number;
}

export interface FrameFile {
  /** The frame's true sample index, from its `f0000.png` name. */
  index: number;
  url: string;
}

export interface FrameSet {
  dir: string;
  animation: string;
  fps: number;
  duration: number;
  sampled: number;
  written: number;
  frames: FrameFile[];
}

export interface ReferenceInfo {
  /** Repository-relative directory the frames live in. */
  dir: string;
  skeleton: string;
  background: number[];
  viewport: Viewport;
  sets: FrameSet[];
}

/**
 * The world box `rigc check` measured this candidate in.
 *
 * ⭐ Not the same thing as the reference's box, and the difference is the point.
 * `check` frames a candidate into the frames' own box when its drawn pixels
 * already land there (`frames-viewport`), and otherwise fits a box to the
 * candidate's own pixels (`candidate-pixels`) because a rig is authored in its
 * own coordinates and a pure difference of scale or origin is not a drift. The
 * viewer draws in whichever box the run used, so the two panes are comparable
 * exactly as far as `check.txt`'s numbers are — and says which box that was.
 */
export interface FramingInfo {
  kind: string | null;
  /** The run-level box, when one framing served every set. */
  viewport: Viewport | null;
  /** Per frame-set boxes, when the framing was decided per set. */
  sets: Record<string, Viewport>;
}

export interface AtlasPage {
  name: string;
  /** null when the page's image is not on disk — see `disabled`. */
  url: string | null;
}

export interface DocFile {
  label: string;
  url: string;
}

export interface CandidateInfo {
  id: string;
  run: string;
  name: string;
  example: string | null;
  skeletonUrl: string;
  atlasUrl: string;
  pages: AtlasPage[];
  benchUrl: string | null;
  checks: DocFile[];
  docs: DocFile[];
  reference: ReferenceInfo | null;
  framing: FramingInfo | null;
  /** Why there are no reference frames, when there are none. */
  referenceNote: string | null;
  /** Non-null means "cannot be rendered", and says why. */
  disabled: string | null;
}

export interface RunInfo {
  name: string;
  docs: DocFile[];
  candidates: CandidateInfo[];
}

export interface Inventory {
  runs: RunInfo[];
}

interface SidecarSet {
  dir: string;
  animation: string;
  fps: number;
  duration: number;
  sampled: number;
  written: number;
}

interface FramesSidecar {
  example: string;
  skeleton: string;
  background: number[];
  viewport: Viewport;
  sets: SidecarSet[];
}

interface BenchCheck {
  framesDir?: string;
  framing?: string | null;
  viewport?: Viewport | null;
  animations?: { dir?: string; viewport?: Viewport | null }[];
}

interface BenchReport {
  example?: string;
  check?: BenchCheck;
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

function isDir(file: string): boolean {
  try {
    return statSync(file).isDirectory();
  } catch {
    return false;
  }
}

function listDirs(dir: string): string[] {
  if (!isDir(dir)) return [];
  return readdirSync(dir)
    .filter((name) => !name.startsWith('.') && isDir(path.join(dir, name)))
    .sort();
}

function listFiles(dir: string): string[] {
  if (!isDir(dir)) return [];
  return readdirSync(dir)
    .filter((name) => !name.startsWith('.') && !isDir(path.join(dir, name)))
    .sort();
}

/** Repository path -> the URL the dev server serves it at. */
function served(repoRoot: string, file: string): string {
  return `${REPO_MOUNT}/${path.relative(repoRoot, file).split(path.sep).join('/')}`;
}

/**
 * The page names in an atlas, by libgdx's own rule: a page header is the first
 * non-blank line of the file and every line that follows a blank one. Region
 * names sit at column zero too, so "unindented" alone would collect them.
 */
export function parseAtlasPages(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const pages: string[] = [];
  let expectPage = true;
  for (const line of lines) {
    if (line.trim() === '') {
      expectPage = true;
      continue;
    }
    if (expectPage) {
      pages.push(line.trim());
      expectPage = false;
    }
  }
  return pages;
}

/**
 * Where an atlas page's image lives.
 *
 * rigc writes the source art's own path into the atlas rather than packing a
 * page, so the names in a run's `skeleton.atlas` are relative paths that climb
 * out of `bench/runs/…` back to `examples/<example>/images/…`. Read them from
 * the directory spelling used to write them, including a pre-packed page
 * sitting next to the atlas (a bare `skeleton.png`). The `examples/<example>` lookups
 * are the fallback for a bare name that is *not* beside the atlas: the packed
 * pages of the official exports live in `export/`, the loose art in `images/`.
 */
function resolvePage(
  repoRoot: string,
  writtenRepoRoot: string,
  atlasDir: string,
  example: string | null,
  name: string,
): string | null {
  // A relative page and the repository root need the same spelling to produce
  // a serveable URL when the repository itself is reached through an alias.
  const pageRoot = path.isAbsolute(name) ? repoRoot : writtenRepoRoot;
  const tried = [path.relative(pageRoot, resolveWrittenPath(atlasDir, name))];
  if (!name.includes('/') && example) {
    tried.push(path.relative(repoRoot, path.join(repoRoot, 'examples', example, 'images', name)));
    tried.push(path.relative(repoRoot, path.join(repoRoot, 'examples', example, 'export', name)));
  }
  for (const rel of tried) {
    if (!isServedRepoPath(rel)) continue;
    const file = path.resolve(repoRoot, rel);
    if (existsSync(file)) return served(repoRoot, file);
  }
  return null;
}

/**
 * The frames a candidate was measured against.
 *
 * `bench.json` records the absolute path the run used, on whatever worktree it
 * ran in, so only the part from `bench/reference/` onwards is portable. When
 * there is no bench report (the early runs predate one) the example's own
 * reference directory is the fallback, with the candidate name picking the
 * sub-directory for the examples that ship more than one skeleton.
 */
function resolveReferenceDir(
  repoRoot: string,
  bench: BenchReport | null,
  example: string | null,
  candidate: string,
): string | null {
  const recorded = bench?.check?.framesDir;
  if (recorded) {
    const marker = recorded.replace(/\\/g, '/').indexOf('bench/reference/');
    if (marker >= 0) {
      const dir = path.join(repoRoot, recorded.replace(/\\/g, '/').slice(marker));
      if (existsSync(path.join(dir, 'frames.json'))) return dir;
    }
  }
  if (!example) return null;
  const root = path.join(repoRoot, 'bench', 'reference', example);
  if (existsSync(path.join(root, 'frames.json'))) return root;
  const named = path.join(root, candidate);
  if (existsSync(path.join(named, 'frames.json'))) return named;
  const withSidecar = listDirs(root).filter((name) =>
    existsSync(path.join(root, name, 'frames.json')),
  );
  if (withSidecar.length === 1) return path.join(root, withSidecar[0]);
  return null;
}

function framingOf(bench: BenchReport | null): FramingInfo | null {
  const check = bench?.check;
  if (!check) return null;
  const sets: Record<string, Viewport> = {};
  for (const animation of check.animations ?? []) {
    if (animation.dir && animation.viewport) sets[animation.dir] = animation.viewport;
  }
  return { kind: check.framing ?? null, viewport: check.viewport ?? null, sets };
}

function readReference(repoRoot: string, dir: string): ReferenceInfo | null {
  const sidecar = readJson<FramesSidecar>(path.join(dir, 'frames.json'));
  if (!sidecar || !sidecar.viewport || !Array.isArray(sidecar.sets)) return null;
  const sets: FrameSet[] = [];
  for (const set of sidecar.sets) {
    const setDir = path.join(dir, set.dir);
    const frames: FrameFile[] = [];
    for (const file of listFiles(setDir)) {
      // Only the indexed samples; `contact.png` is a named pose, not a sample,
      // and a strided set writes true indices with gaps between them.
      const match = /^f(\d+)\.png$/.exec(file);
      if (!match) continue;
      frames.push({ index: Number(match[1]), url: served(repoRoot, path.join(setDir, file)) });
    }
    frames.sort((a, b) => a.index - b.index);
    sets.push({
      dir: set.dir,
      animation: set.animation,
      fps: set.fps,
      duration: set.duration,
      sampled: set.sampled,
      written: set.written,
      frames,
    });
  }
  return {
    dir: path.relative(repoRoot, dir).split(path.sep).join('/'),
    skeleton: sidecar.skeleton,
    background: sidecar.background ?? [232, 232, 232, 255],
    viewport: sidecar.viewport,
    sets,
  };
}

function docsIn(repoRoot: string, dir: string, names: RegExp): DocFile[] {
  return listFiles(dir)
    .filter((name) => names.test(name))
    .map((name) => ({ label: name, url: served(repoRoot, path.join(dir, name)) }));
}

/**
 * `rigc check`'s reports for a candidate. They sit beside it once a run has a
 * per-candidate directory; the one-candidate runs keep theirs at run level.
 */
function checksFor(repoRoot: string, runDir: string, candidateDir: string): DocFile[] {
  const own = docsIn(repoRoot, candidateDir, /^check.*\.txt$/);
  if (own.length > 0 || candidateDir === runDir) return own;
  return docsIn(repoRoot, runDir, /^check.*\.txt$/);
}

/** The bench report for a candidate: beside it, or the run's, by either name. */
function findBench(runDir: string, candidateDir: string, name: string): string | null {
  const tries = [
    path.join(candidateDir, 'bench.json'),
    path.join(runDir, `bench-${name}.json`),
    path.join(runDir, 'bench.json'),
  ];
  return tries.find((file) => existsSync(file)) ?? null;
}

function buildCandidate(
  repoRoot: string,
  writtenRepoRoot: string,
  runName: string,
  runDir: string,
  candidateDir: string,
  skeletonDir: string,
): CandidateInfo {
  // `<candidate>/spine/` names the candidate; `<candidate>-spine/` is rung 1's
  // older shape, where the suffix is the marker rather than a directory.
  const name = path.basename(candidateDir).replace(/-spine$/, '');
  const skeletonFile = path.join(skeletonDir, 'skeleton.json');
  const atlasFile = path.join(skeletonDir, 'skeleton.atlas');

  const benchFile = findBench(runDir, candidateDir, name);
  const bench = benchFile ? readJson<BenchReport>(benchFile) : null;
  const example = bench?.example ?? null;

  const candidate: CandidateInfo = {
    id: `${runName}/${name}`,
    run: runName,
    name,
    example,
    skeletonUrl: served(repoRoot, skeletonFile),
    atlasUrl: served(repoRoot, atlasFile),
    pages: [],
    benchUrl: benchFile ? served(repoRoot, benchFile) : null,
    checks: checksFor(repoRoot, runDir, candidateDir),
    docs: docsIn(repoRoot, candidateDir, /^(README|LOOP)\.md$/),
    reference: null,
    framing: framingOf(bench),
    referenceNote: null,
    disabled: null,
  };

  if (!existsSync(atlasFile)) {
    candidate.disabled = 'no skeleton.atlas beside skeleton.json';
    return candidate;
  }

  const atlasText = readFileSync(atlasFile, 'utf8');
  candidate.pages = parseAtlasPages(atlasText).map((pageName) => ({
    name: pageName,
    url: resolvePage(repoRoot, writtenRepoRoot, skeletonDir, example, pageName),
  }));
  const missing = candidate.pages.filter((page) => page.url === null);
  if (candidate.pages.length === 0) {
    candidate.disabled = 'the atlas names no page';
  } else if (missing.length > 0) {
    candidate.disabled = `atlas page not on disk: ${missing
      .map((page) => page.name)
      .join(', ')} — run \`bun run fetch-examples\``;
  }

  const referenceDir = resolveReferenceDir(repoRoot, bench, example, name);
  if (referenceDir) {
    candidate.reference = readReference(repoRoot, referenceDir);
    if (!candidate.reference) candidate.referenceNote = 'frames.json could not be read';
  } else {
    candidate.referenceNote = bench
      ? 'this run recorded no frames directory, and none was found for its example'
      : 'no bench report, and no reference frames were found for this run';
  }
  return candidate;
}

/**
 * Every run under `bench/runs/`, in directory order, with each candidate
 * resolved. A run with nothing loadable still appears, carrying its reason.
 */
export function scanInventory(repoRoot: string): Inventory {
  const runsRoot = path.join(repoRoot, 'bench', 'runs');
  const writtenRepoRoot = spelledDir(repoRoot);
  const runs: RunInfo[] = [];
  for (const runName of listDirs(runsRoot)) {
    const runDir = path.join(runsRoot, runName);
    const candidates: CandidateInfo[] = [];
    for (const dirName of listDirs(runDir)) {
      const dir = path.join(runDir, dirName);
      const nested = path.join(dir, 'spine');
      const skeletonDir = existsSync(path.join(nested, 'skeleton.json'))
        ? nested
        : existsSync(path.join(dir, 'skeleton.json'))
          ? dir
          : null;
      if (!skeletonDir) continue;
      candidates.push(buildCandidate(repoRoot, writtenRepoRoot, runName, runDir, dir, skeletonDir));
    }
    if (candidates.length === 0) {
      candidates.push({
        id: `${runName}/—`,
        run: runName,
        name: '—',
        example: null,
        skeletonUrl: '',
        atlasUrl: '',
        pages: [],
        benchUrl: existsSync(path.join(runDir, 'bench.json'))
          ? served(repoRoot, path.join(runDir, 'bench.json'))
          : null,
        checks: [],
        docs: docsIn(repoRoot, runDir, /^(README|LOOP)\.md$/),
        reference: null,
        framing: null,
        referenceNote: null,
        disabled: 'no skeleton.json under this run',
      });
    }
    runs.push({
      name: runName,
      docs: docsIn(repoRoot, runDir, /^(README|LOOP)\.md$/),
      candidates,
    });
  }
  return { runs };
}
