/**
 * pack_anchor — where a `polygon` pack's candidates may put a cell, measured
 * over a corpus: how many cells have an owned box inset from their cell's
 * corner, how many candidates the owned box's anchor refuses for that reason
 * alone, and what the pack finds under each footprint rule alone
 * (`FOOTPRINT_ANCHORS`: `box`, `box-or-cell`, `box-else-cell`, `best-of`) and
 * as `polygon` packs — the whole pack of least Σ page area among `rect` and
 * `POLYGON_CANDIDATE_RULES` (issue #1104).
 *
 *   bun tools/pack_anchor.ts [--recipes <recipes.json>] [--root <dir>] [--regions <set.json>]…
 *                            [--seeds <n,n,…>] [--padding <n>] [--page-size <n>] [--work <dir> | --keep-work] [--json <out.json>]
 *                            [--trace-regions <tolerance>]
 *
 * With no source flag, the tree's own: `fixtures/polypack_shapes.ts`'s two
 * seeds (`POLYPACK_SEED`, `POLYPACK_GAIN_SEED`) and `tools/emit_hashes.ts`'s
 * `treeRecipes` (every gallery rig, and every fetched editor export when
 * `examples/` is there). The sources a flag names replace that default:
 *
 *   * `--recipes` takes an `emit-hashes-recipes/1` or `emit-hashes/1` document
 *     and `--root` resolves its stages, the way `hull_ceiling` and
 *     `verdict_gate` take them — a private corpus keeps its recipes with it and
 *     only the table leaves it, which names recipes and nothing else;
 *   * `--regions` (repeatable) takes a region set as a JSON array, or an object
 *     whose `regions` is one: each entry `width` (or `w`), `height` (or `h`) and
 *     `hull` — a flat `[x0, y0, x1, y1, …]` loop in the region's own texels, x
 *     right and y down — and optionally `region` (or `name`). Each region is
 *     written as a plate opaque inside its hull, as `writePolypackInputs`
 *     writes the generated sets, and packed by that hull;
 *   * `--seeds` takes generator seeds for `polypackShapes`.
 *
 * ## What a built recipe is packed as
 *
 * Every region the build's atlas states, once by name (a later region of the
 * same name is counted, not packed), lifted off its page at its drawing's size
 * (`originalWidth x originalHeight`, `extractRegion`) — the loose part a
 * `--pack` build of that drawing would pack — with the footprint
 * `packFootprints` reads off the build's `skeleton.json`, as `build --pack
 * --pack-shape polygon` reads it. A recipe built `--atlas-in` therefore packs
 * the parts of the pack it was handed, the editor's whitespace strip undone.
 *
 * ## The row
 *
 *   * **cells**, **mesh cells** (an owned set that is not the whole cell) and
 *     **inset** — cells whose owned box does not start at the cell's corner,
 *     with the distribution of the inset `(dx, dy)` in cell texels;
 *   * **first pass**: one footprint pass of every cell on an empty
 *     `page-size x page-size` page, first anchor only, run to its end
 *     (`footprintPass`) — the candidates it refused only because the cell
 *     would leave the page (`PassTally.boxAnchorRefused`) and the cells it
 *     missed although a free rectangle held their box (`missedByAnchor`);
 *   * **pages** under `--page-edges free` and `pot`: `rect`, every rule alone and
 *     `polygon` (with the candidate it kept), each as page sizes and Σ area, a
 *     page marked `>box` where it is larger than the owned box's anchor alone
 *     and `>rect` where it is larger than `rect`'s;
 *   * **cost** (`free`): free-list splits over every search the pack ran, the
 *     spill's assignment pass included (`PackOptions.tally`) — `PK93`'s unit;
 *     `polygon`'s is its three candidate packs together;
 *   * **deterministic**: every column's pack made twice, and once more with its
 *     parts handed over reversed, byte-identical — atlas text and every page's
 *     pixels — under both edge modes.
 *
 * `--padding` and `--page-size` apply to every set of the run, generated,
 * `--regions` and recipe alike: a set with one region whose cell does not fit
 * a `--page-size` page is a refused row, so a corpus with a drawing past 2048
 * is measured with `--page-size 4096` (every set of the run then at 4096).
 *
 * ## `--trace-regions <tolerance>`: the stage-2 realised figure (issue #1115)
 *
 * Every built set is packed `polygon` twice more, with every **region-kind**
 * region (one any region attachment samples — `hull_ceiling`'s definition)
 * packed by the contour rigc's tracer states for its art, converted in memory
 * and read back through `packFootprints` (`tools/trace_footprint.ts`); mesh-kind
 * regions keep the footprint they pack by today, and nothing on disk changes.
 * `traced:0` is the corner-lattice outline at threshold 1, unsimplified and with
 * no margin — the polygon `hull_ceiling`'s *regions traced* ceiling counts;
 * `traced:t=<tolerance>` is `buildContourMesh` at that tolerance and the contour
 * generator's defaults for the rest (margin 1, maxVertices 64, alpha 1). The
 * flag's value is that tolerance because the generator has none to default to.
 * A fourth table states, per set and edge mode, Σ page area and its ratio to
 * `rect` for `polygon` and both tightnesses, and how many region-kind regions
 * packed by contour (a refused one keeps its rectangle and is counted by
 * reason); `--json` carries it per set as `traced`. Seed and `--regions` sets
 * have no build and no region attachment, and carry no reading. The seconds
 * each tightness took go to stderr. Without the flag nothing printed changes.
 *
 * ## Refused rows
 *
 * A set nothing can be measured on is a **REFUSED** row carrying the sentence
 * that refused it — a build chain that exited non-zero, an atlas the lift
 * cannot read, or the packer's own refusal (a region whose cell does not fit
 * the page: the packer cannot split one drawing across two pages, and is right
 * to refuse). Every other set is measured; the Σ rows are over the measured
 * sets and say how many were refused, as `hull_ceiling` prints its rows.
 *
 * Exit codes: 0 at least one set measured (refused rows, if any, are named in
 * the table and on stderr); 2 no set measured, or a bad input by name. The wall
 * time is printed on stderr only, so two runs print the same table.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { resolveWrittenPath } from '../src/written_path.ts';
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_PADDING,
  emptyTally,
  extractRegion,
  FOOTPRINT_ANCHORS,
  footprintCell,
  footprintPass,
  packAtlas,
  packFootprints,
  parseAtlasText,
  type FootprintAnchors,
  type PackCandidate,
  type PackInput,
  type PackResult,
  type PageEdges,
  type PassTally,
} from '../src/atlas.ts';
import { CompileError } from '../src/errors.ts';
import { readPlate } from './plate.ts';
import { HashesInputError, readRecipes, treeRecipes, TREE_ROOT, type Recipe } from './emit_hashes.ts';
import { buildRecipes } from './core_gate.ts';
import { readKeepWork, WorkDirectory } from './work_dir.ts';
import { CONTOUR_GENERATOR_DEFAULTS, tracedSet, type Tightness, type TracedSet } from './trace_footprint.ts';
import { POLYPACK_GAIN_SEED, POLYPACK_SEED, polypackShapes, writePolypackInputs, type PolypackShape } from '../fixtures/polypack_shapes.ts';

export const PACK_ANCHOR_SPEC = 'pack-anchor/1';

/** A refusal about an input — the command exits 2 on it. */
export class AnchorInputError extends Error {}

/** One pack's pages. */
export interface PageSet {
  pages: string;
  area: number;
}

/**
 * A column of the table: one footprint rule alone (`footprintAnchors` set), or
 * `polygon` as it packs — the whole pack of least Σ area among `rect` and
 * `POLYGON_CANDIDATE_RULES` (`packAtlas`).
 */
export type AnchorColumn = FootprintAnchors | 'polygon';
export const ANCHOR_COLUMNS: readonly AnchorColumn[] = [...FOOTPRINT_ANCHORS, 'polygon'];

/** What one edge mode's packs found: `rect`, and every column. */
export interface EdgeRow {
  rect: PageSet;
  polygon: Record<AnchorColumn, PageSet>;
  /** Which whole pack `polygon` kept. */
  kept: PackCandidate;
}

/** Free-list splits over every search a pack ran (`PackOptions.tally`), and what its footprint passes counted. */
export interface SearchCost {
  splits: number;
  tally: PassTally;
}

export interface AnchorRow {
  name: string;
  refused: string | null;
  cells: number;
  meshCells: number;
  /** Cells whose owned box is inset from the cell's corner, in packing order: `[dx, dy]`. */
  insets: Array<[number, number]>;
  /** Regions of the atlas skipped as a later region of a name already packed. */
  duplicates: number;
  firstPass: { refused: number; missed: number; placed: number };
  free: EdgeRow | null;
  pot: EdgeRow | null;
  cost: { rect: SearchCost; polygon: Record<AnchorColumn, SearchCost> } | null;
  deterministic: boolean | null;
  /** `--trace-regions` only (the key is absent without the flag): the set packed with its region-kind regions by their traced contour. */
  traced?: TracedRow;
}

/** One tightness's `polygon` pack with every region-kind region converted in memory (`tracedSet`). */
export interface TracedPack {
  /** Region-kind regions among the set's parts, and how many of them pack by a contour. */
  regionKind: number;
  byContour: number;
  /** Why the others keep their rectangle, by name. */
  refused: Record<string, number>;
  free: PageSet & { kept: PackCandidate };
  pot: PageSet & { kept: PackCandidate };
  /** Both packs made again, and from reversed parts, byte-identical. */
  deterministic: boolean;
}

/** `--trace-regions <tolerance>`: the two tightnesses (`Tightness`) and the mesher's parameters the second ran at. */
export interface TracedRow {
  tolerance: number;
  margin: number;
  maxVertices: number;
  lattice: TracedPack;
  mesher: TracedPack;
}

/** The packer's own order (`packOrder` in src/atlas.ts): longest side, then area, then name. */
function inPackOrder(parts: readonly PackInput[]): PackInput[] {
  return parts
    .slice()
    .sort((a, b) => Math.max(b.width, b.height) - Math.max(a.width, a.height) || b.width * b.height - a.width * a.height || (a.region < b.region ? -1 : a.region > b.region ? 1 : 0));
}

function pageSet(pack: PackResult): PageSet {
  return { pages: pack.pages.map((p) => `${p.width}x${p.height}`).join('+'), area: pack.pages.reduce((n, p) => n + p.width * p.height, 0) };
}

function samePack(a: PackResult, b: PackResult): boolean {
  if (a.atlasText !== b.atlasText || a.pages.length !== b.pages.length) return false;
  return a.pages.every((p, i) => p.plate.data.length === b.pages[i].plate.data.length && p.plate.data.every((v, k) => v === b.pages[i].plate.data[k]));
}

function costOfTally(tally: PassTally): SearchCost {
  return { splits: tally.rectPlaced + tally.bandSplits, tally };
}

/** The row for one set of pack inputs. */
export function anchorRow(name: string, inputs: readonly PackInput[], padding: number, pageSize: number, duplicates = 0): AnchorRow {
  const sorted = inPackOrder(inputs);
  const shapes = sorted.map((p) => footprintCell(p.width, p.height, padding, p.footprint));
  const insets: Array<[number, number]> = [];
  for (const s of shapes) if (s.bbox.x !== 0 || s.bbox.y !== 0) insets.push([s.bbox.x, s.bbox.y]);
  const first = footprintPass(shapes, pageSize, pageSize, 'box');
  let deterministic = true;
  const costs = { rect: emptyTally(), polygon: {} as Record<AnchorColumn, PassTally> };
  const edgeRow = (pageEdges: PageEdges): EdgeRow => {
    const base = { pageEdges, padding, pageSize };
    const counted = pageEdges === 'free';
    const rect = packAtlas(inputs.slice(), { ...base, ...(counted ? { tally: costs.rect } : {}) });
    const sets = {} as Record<AnchorColumn, PageSet>;
    let kept: PackCandidate = 'rect';
    for (const column of ANCHOR_COLUMNS) {
      const opts = { ...base, shape: 'polygon' as const, ...(column === 'polygon' ? {} : { footprintAnchors: column }) };
      const tally = emptyTally();
      const pack = packAtlas(inputs.slice(), { ...opts, ...(counted ? { tally } : {}) });
      if (counted) costs.polygon[column] = tally;
      if (!samePack(pack, packAtlas(inputs.slice(), opts)) || !samePack(pack, packAtlas(inputs.slice().reverse(), opts))) deterministic = false;
      sets[column] = pageSet(pack);
      if (column === 'polygon') kept = pack.candidate;
    }
    return { rect: pageSet(rect), polygon: sets, kept };
  };
  const free = edgeRow('free');
  const pot = edgeRow('pot');
  const polygonCost = {} as Record<AnchorColumn, SearchCost>;
  for (const column of ANCHOR_COLUMNS) polygonCost[column] = costOfTally(costs.polygon[column]);
  return {
    name,
    refused: null,
    cells: shapes.length,
    meshCells: shapes.filter((s) => !s.whole).length,
    insets,
    duplicates,
    firstPass: { refused: first.tally.boxAnchorRefused, missed: first.tally.missedByAnchor, placed: first.rects.filter((r) => r !== null).length },
    free,
    pot,
    cost: { rect: costOfTally(costs.rect), polygon: polygonCost },
    deterministic,
  };
}

/**
 * A set's row, or its REFUSED row when the packer refuses the set — the
 * packer's sentence as the reason. `refusals: 'throw'` lets the refusal
 * escape instead, which is the selftest's plant (`PK100`) and nothing else.
 */
export function measuredRow(name: string, inputs: () => readonly PackInput[], padding: number, pageSize: number, duplicates = 0, refusals: 'row' | 'throw' = 'row'): AnchorRow {
  try {
    return anchorRow(name, inputs(), padding, pageSize, duplicates);
  } catch (err) {
    if (refusals === 'row' && (err instanceof CompileError || err instanceof AnchorInputError)) return refusedRow(name, err.message);
    throw err;
  }
}

function refusedRow(name: string, why: string): AnchorRow {
  return { name, refused: why, cells: 0, meshCells: 0, insets: [], duplicates: 0, firstPass: { refused: 0, missed: 0, placed: 0 }, free: null, pot: null, cost: null, deterministic: null };
}

/** A built recipe's atlas regions, lifted to loose parts with the footprints its skeleton states — and, for `--trace-regions`, the skeleton text and each part's page `scale:`. */
export function inputsOfBuild(out: string, liftDir: string): { inputs: PackInput[]; duplicates: number; skeletonText: string; scales: Map<string, number> } {
  const atlasPath = join(out, 'skeleton.atlas');
  const skeletonPath = join(out, 'skeleton.json');
  if (!existsSync(atlasPath)) throw new AnchorInputError('the build wrote no skeleton.atlas');
  if (!existsSync(skeletonPath)) throw new AnchorInputError('the build wrote no skeleton.json');
  const atlas = parseAtlasText(readFileSync(atlasPath, 'utf8'));
  mkdirSync(liftDir, { recursive: true });
  const seen = new Set<string>();
  const lifted: Array<{ region: string; absPath: string; width: number; height: number }> = [];
  const scales = new Map<string, number>();
  let duplicates = 0;
  for (const page of atlas.pages) {
    const pagePath = isAbsolute(page.name) ? join(out, page.name) : resolveWrittenPath(out, page.name);
    if (!existsSync(pagePath)) throw new AnchorInputError(`the atlas names page ${JSON.stringify(page.name)} and the build wrote no such file`);
    const plate = readPlate(pagePath);
    for (const region of page.regions) {
      const name = region.name.trim();
      if (seen.has(name)) {
        duplicates++;
        continue;
      }
      seen.add(name);
      const absPath = join(liftDir, `${String(lifted.length).padStart(4, '0')}.png`);
      extractRegion(plate, region).writePng(absPath);
      lifted.push({ region: name, absPath, width: region.originalWidth, height: region.originalHeight });
      scales.set(name, page.scale);
    }
  }
  if (lifted.length === 0) throw new AnchorInputError('the atlas states no region');
  const sizes = new Map(lifted.map((p) => [p.region, { width: p.width, height: p.height }]));
  const skeletonText = readFileSync(skeletonPath, 'utf8');
  const footprints = packFootprints(skeletonText, (region) => sizes.get(region));
  const inputs = lifted.map((p): PackInput => {
    const footprint = footprints.get(p.region) ?? undefined;
    return footprint === undefined ? p : { ...p, footprint };
  });
  return { inputs, duplicates, skeletonText, scales };
}

/**
 * A set's parts with every region-kind region traced and converted in memory
 * (`tracedSet`) and every other region's footprint as `packFootprints` reads
 * it today — what `tracedPack` packs, and what the selftest's controls hold.
 * `drop` is `tracedSet`'s plant, for the selftest only.
 */
export function tracedInputs(
  inputs: readonly PackInput[],
  skeletonText: string,
  scales: ReadonlyMap<string, number>,
  tightness: Tightness,
  drop = false,
): { parts: PackInput[]; traced: TracedSet } {
  const traced = tracedSet(
    skeletonText,
    inputs.map((p) => ({ region: p.region, absPath: p.absPath, width: p.width, height: p.height, pageScale: scales.get(p.region) ?? 1 })),
    tightness,
    drop,
  );
  const parts = inputs.map((p): PackInput => {
    const footprint = traced.footprints.get(p.region) ?? undefined;
    const bare = { region: p.region, absPath: p.absPath, width: p.width, height: p.height };
    return footprint === undefined ? bare : { ...bare, footprint };
  });
  return { parts, traced };
}

/** One tightness's `polygon` packs of a set's `tracedInputs`, under both page edges. */
export function tracedPack(
  inputs: readonly PackInput[],
  skeletonText: string,
  scales: ReadonlyMap<string, number>,
  tightness: Tightness,
  padding: number,
  pageSize: number,
  drop = false,
): TracedPack {
  const { parts, traced } = tracedInputs(inputs, skeletonText, scales, tightness, drop);
  let deterministic = true;
  const edge = (pageEdges: PageEdges): PageSet & { kept: PackCandidate } => {
    const opts = { pageEdges, padding, pageSize, shape: 'polygon' as const };
    const pack = packAtlas(parts.slice(), opts);
    if (!samePack(pack, packAtlas(parts.slice(), opts)) || !samePack(pack, packAtlas(parts.slice().reverse(), opts))) deterministic = false;
    return { ...pageSet(pack), kept: pack.candidate };
  };
  const free = edge('free');
  const pot = edge('pot');
  return { regionKind: traced.regionKind, byContour: traced.byContour, refused: traced.refused, free, pot, deterministic };
}

/** Both tightnesses of a built set, the mesher's at `tolerance`; the seconds each took go to `warn`. */
export function tracedRow(
  name: string,
  inputs: readonly PackInput[],
  skeletonText: string,
  scales: ReadonlyMap<string, number>,
  tolerance: number,
  padding: number,
  pageSize: number,
  warn: (line: string) => void = () => {},
): TracedRow {
  const t0 = performance.now();
  const lattice = tracedPack(inputs, skeletonText, scales, { kind: 'lattice' }, padding, pageSize);
  const t1 = performance.now();
  const mesher = tracedPack(inputs, skeletonText, scales, { kind: 'mesher', tolerance }, padding, pageSize);
  const t2 = performance.now();
  warn(`pack_anchor: ${name} traced:0 ${((t1 - t0) / 1000).toFixed(1)} s, traced:t=${tolerance} ${((t2 - t1) / 1000).toFixed(1)} s`);
  return { tolerance, margin: CONTOUR_GENERATOR_DEFAULTS.margin, maxVertices: CONTOUR_GENERATOR_DEFAULTS.maxVertices, lattice, mesher };
}

/** A `--regions` document as generated-set shapes, refused by name where an entry is not one. */
export function readRegionSet(path: string): PolypackShape[] {
  if (!existsSync(path)) throw new AnchorInputError(`no such region set ${path}`);
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new AnchorInputError(`${path}: not JSON — ${(err as Error).message}`);
  }
  const list = Array.isArray(value) ? value : typeof value === 'object' && value !== null && Array.isArray((value as Record<string, unknown>).regions) ? ((value as Record<string, unknown>).regions as unknown[]) : null;
  if (list === null) throw new AnchorInputError(`${path}: neither an array of regions nor an object whose "regions" is one`);
  if (list.length === 0) throw new AnchorInputError(`${path}: no regions`);
  return list.map((entry, i): PolypackShape => {
    const e = typeof entry === 'object' && entry !== null ? (entry as Record<string, unknown>) : {};
    const width = e.width ?? e.w;
    const height = e.height ?? e.h;
    const hull = e.hull;
    const named = e.region ?? e.name;
    if (!Number.isInteger(width) || (width as number) < 1) throw new AnchorInputError(`${path}: regions[${i}] has no positive integer "width" (or "w"), got ${JSON.stringify(width)}`);
    if (!Number.isInteger(height) || (height as number) < 1) throw new AnchorInputError(`${path}: regions[${i}] has no positive integer "height" (or "h"), got ${JSON.stringify(height)}`);
    if (!Array.isArray(hull) || hull.length < 6 || hull.length % 2 !== 0 || !hull.every((n) => typeof n === 'number' && Number.isFinite(n))) {
      throw new AnchorInputError(`${path}: regions[${i}] "hull" is not a flat loop of at least three [x, y] pairs of finite numbers`);
    }
    return { region: typeof named === 'string' && named !== '' ? named : `region_${String(i).padStart(3, '0')}`, width: width as number, height: height as number, hull: hull as number[] };
  });
}

// ---------------------------------------------------------------------------
// the table
// ---------------------------------------------------------------------------

function count(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** `min / median / max` of a list of whole numbers, or `—`. */
function spread(values: readonly number[]): string {
  if (values.length === 0) return '—';
  const s = values.slice().sort((a, b) => a - b);
  return `${s[0]} / ${s[Math.floor((s.length - 1) / 2)]} / ${s[s.length - 1]}`;
}

function ratio(n: number, d: number): string {
  return d > 0 ? `${(n / d).toFixed(2)}x` : '—';
}

/** The table as markdown lines: the census, then the pages and the cost. */
export function anchorTable(rows: readonly AnchorRow[]): string[] {
  const out: string[] = [];
  out.push('| set | cells | mesh cells | inset | dx min / median / max | dy min / median / max | first pass: refused by the page edge | first pass: cells missed | duplicates |');
  out.push('| --- | ---: | ---: | ---: | --- | --- | ---: | ---: | ---: |');
  for (const r of rows) {
    if (r.refused !== null) {
      out.push(`| ${r.name} | REFUSED: ${r.refused} | | | | | | | |`);
      continue;
    }
    out.push(`| ${r.name} | ${r.cells} | ${r.meshCells} | ${r.insets.length} | ${spread(r.insets.map(([dx]) => dx))} | ${spread(r.insets.map(([, dy]) => dy))} | ${count(r.firstPass.refused)} | ${r.firstPass.missed} | ${r.duplicates} |`);
  }
  out.push('');
  out.push(`| set | edges | rect | ${ANCHOR_COLUMNS.map((a) => (a === 'polygon' ? 'polygon (kept)' : `${a} alone`)).join(' | ')} |`);
  out.push(`| --- | --- | --- | ${ANCHOR_COLUMNS.map(() => '---').join(' | ')} |`);
  const sums: Record<'free' | 'pot', { rect: number; polygon: Record<string, number> }> = { free: { rect: 0, polygon: {} }, pot: { rect: 0, polygon: {} } };
  for (const r of rows) {
    for (const edges of ['free', 'pot'] as const) {
      const e = r[edges];
      if (e === null) continue;
      sums[edges].rect += e.rect.area;
      const cells = ANCHOR_COLUMNS.map((a) => {
        const p = e.polygon[a];
        sums[edges].polygon[a] = (sums[edges].polygon[a] ?? 0) + p.area;
        const marks = [...(p.area > e.polygon.box.area ? ['>box'] : []), ...(p.area > e.rect.area ? ['>rect'] : [])];
        return `${p.pages} = ${count(p.area)}${marks.length === 0 ? '' : ` **${marks.join(' ')}**`}${a === 'polygon' ? ` (${e.kept})` : ''}`;
      });
      out.push(`| ${r.name} | ${edges} | ${e.rect.pages} = ${count(e.rect.area)} | ${cells.join(' | ')} |`);
    }
  }
  const measured = rows.filter((r) => r.refused === null).length;
  const refusedNote = `over ${measured} measured set(s); ${rows.length - measured} refused`;
  for (const edges of ['free', 'pot'] as const) out.push(`| **Σ** ${refusedNote} | ${edges} | ${count(sums[edges].rect)} | ${ANCHOR_COLUMNS.map((a) => count(sums[edges].polygon[a] ?? 0)).join(' | ')} |`);
  out.push('');
  out.push(`| set | rect splits | ${ANCHOR_COLUMNS.map((a) => `${a === 'polygon' ? 'polygon (every candidate)' : a} splits (x rect)`).join(' | ')} | deterministic |`);
  out.push(`| --- | ---: | ${ANCHOR_COLUMNS.map(() => '---:').join(' | ')} | --- |`);
  for (const r of rows) {
    if (r.cost === null) continue;
    const c = r.cost;
    out.push(`| ${r.name} | ${count(c.rect.splits)} | ${ANCHOR_COLUMNS.map((a) => `${count(c.polygon[a].splits)} (${ratio(c.polygon[a].splits, c.rect.splits)})`).join(' | ')} | ${r.deterministic === true ? 'yes' : 'NO'} |`);
  }
  if (rows.some((r) => r.traced !== undefined)) out.push('', ...tracedTable(rows));
  return out;
}

function share(n: number, d: number): string {
  return d > 0 ? (n / d).toFixed(3) : '—';
}

function refusalNote(p: TracedPack): string {
  const parts = Object.entries(p.refused).map(([why, n]) => `${n} ${why}`);
  return parts.length === 0 ? '' : ` (rect: ${parts.join(', ')})`;
}

/**
 * `--trace-regions`: per built set and edge mode, `rect`, `polygon` as it packs
 * today, and `polygon` with every region-kind region packed by its traced
 * contour at the two tightnesses — Σ page area and its ratio to `rect` — and
 * how many region-kind regions packed by contour. Σ rows over the sets that
 * carry the reading.
 */
export function tracedTable(rows: readonly AnchorRow[]): string[] {
  const withTrace = rows.filter((r) => r.traced !== undefined && r.free !== null && r.pot !== null);
  const first = withTrace[0]?.traced;
  if (first === undefined) return [];
  const t = `traced:t=${first.tolerance}`;
  const out: string[] = [
    `Region-kind regions packed by their traced contour: traced:0 = the corner-lattice outline at threshold 1, unsimplified, no margin; ${t} = buildContourMesh at tolerance ${first.tolerance}, margin ${first.margin}, maxVertices ${first.maxVertices}, alpha 1. A refused region keeps its rectangle and is counted by reason.`,
    '',
    `| set | edges | rect | polygon | ratio | traced:0 | ratio | ${t} | ratio | by contour / region-kind, traced:0 | by contour / region-kind, ${t} | deterministic |`,
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |',
  ];
  const sums = { free: { rect: 0, polygon: 0, lattice: 0, mesher: 0 }, pot: { rect: 0, polygon: 0, lattice: 0, mesher: 0 } };
  const regions = { kind: 0, lattice: 0, mesher: 0 };
  for (const r of withTrace) {
    const tr = r.traced as TracedRow;
    regions.kind += tr.lattice.regionKind;
    regions.lattice += tr.lattice.byContour;
    regions.mesher += tr.mesher.byContour;
    for (const edges of ['free', 'pot'] as const) {
      const e = r[edges] as EdgeRow;
      const rect = e.rect.area;
      const poly = e.polygon.polygon.area;
      const l = tr.lattice[edges];
      const m = tr.mesher[edges];
      sums[edges].rect += rect;
      sums[edges].polygon += poly;
      sums[edges].lattice += l.area;
      sums[edges].mesher += m.area;
      out.push(
        `| ${r.name} | ${edges} | ${count(rect)} | ${count(poly)} | ${share(poly, rect)} | ${l.pages} = ${count(l.area)} (${l.kept}) | ${share(l.area, rect)} | ${m.pages} = ${count(m.area)} (${m.kept}) | ${share(m.area, rect)} | ` +
          `${tr.lattice.byContour} / ${tr.lattice.regionKind}${refusalNote(tr.lattice)} | ${tr.mesher.byContour} / ${tr.mesher.regionKind}${refusalNote(tr.mesher)} | ${tr.lattice.deterministic && tr.mesher.deterministic ? 'yes' : 'NO'} |`,
      );
    }
  }
  for (const edges of ['free', 'pot'] as const) {
    const s = sums[edges];
    out.push(
      `| **Σ** over ${withTrace.length} built set(s) | ${edges} | ${count(s.rect)} | ${count(s.polygon)} | ${share(s.polygon, s.rect)} | ${count(s.lattice)} | ${share(s.lattice, s.rect)} | ${count(s.mesher)} | ${share(s.mesher, s.rect)} | ` +
        `${regions.lattice} / ${regions.kind} | ${regions.mesher} / ${regions.kind} | |`,
    );
  }
  const untraced = rows.filter((r) => r.refused === null && r.traced === undefined).length;
  if (untraced > 0) out.push('', `${untraced} measured set(s) have no build behind them (a generator seed or a --regions set: no region attachment, no art to trace) and carry no traced reading.`);
  return out;
}

/** The JSON document: the rows, key order fixed. */
export function anchorText(rows: readonly AnchorRow[]): string {
  return `${JSON.stringify({ spec: PACK_ANCHOR_SPEC, sets: rows }, null, 2)}\n`;
}

// ---------------------------------------------------------------------------
// the command
// ---------------------------------------------------------------------------

function parseFlags(args: readonly string[], known: readonly string[], repeatable: readonly string[]): Map<string, string[]> {
  const flags = new Map<string, string[]>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!known.includes(arg)) throw new AnchorInputError(`unknown argument ${arg}; this command takes ${known.join(', ')}`);
    const value = args[i + 1];
    if (value === undefined || value.startsWith('--')) throw new AnchorInputError(`${arg} needs a value`);
    if (flags.has(arg) && !repeatable.includes(arg)) throw new AnchorInputError(`${arg} given twice`);
    flags.set(arg, [...(flags.get(arg) ?? []), value]);
    i++;
  }
  return flags;
}

function positiveInt(flag: string, value: string | undefined, fallback: number, min: number): number {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min) throw new AnchorInputError(`${flag} must be an integer of at least ${min}, got ${JSON.stringify(value)}`);
  return n;
}

/** Every recipe built into `work` and measured, in name order. */
export function recipeRows(
  recipes: readonly Recipe[],
  work: string,
  root: string,
  padding: number,
  pageSize: number,
  progress: (line: string) => void = () => {},
  refusals: 'row' | 'throw' = 'row',
  traceTolerance: number | null = null,
): AnchorRow[] {
  const built = buildRecipes(recipes, join(work, 'build'), root, progress);
  return built.map((b, i) => {
    if (b.exits.some((e) => e !== 0)) return refusedRow(b.name, `the build chain exited ${JSON.stringify(b.exits)}`);
    let lifted: ReturnType<typeof inputsOfBuild>;
    try {
      lifted = inputsOfBuild(b.out, join(work, 'lift', String(i).padStart(3, '0')));
    } catch (err) {
      if (err instanceof AnchorInputError) return refusedRow(b.name, err.message);
      throw err;
    }
    const row = measuredRow(b.name, () => lifted.inputs, padding, pageSize, lifted.duplicates, refusals);
    if (traceTolerance === null || row.refused !== null) return row;
    return { ...row, traced: tracedRow(b.name, lifted.inputs, lifted.skeletonText, lifted.scales, traceTolerance, padding, pageSize, progress) };
  });
}

/** The command; returns the exit code. */
export function anchorMain(argv: readonly string[], print: (line: string) => void = console.log, warn: (line: string) => void = console.error, refusals: 'row' | 'throw' = 'row'): number {
  const scope = new WorkDirectory('pack_anchor');
  try {
    const { argv: args, keep } = readKeepWork(argv, [], (m) => new AnchorInputError(m));
    const flags = parseFlags(args, ['--recipes', '--root', '--regions', '--seeds', '--padding', '--page-size', '--work', '--json', '--trace-regions'], ['--regions']);
    const one = (flag: string): string | undefined => flags.get(flag)?.[0];
    const root = resolve(one('--root') ?? TREE_ROOT);
    if (!existsSync(root) || !statSync(root).isDirectory()) throw new AnchorInputError(`--root ${root} is not a directory`);
    const padding = positiveInt('--padding', one('--padding'), DEFAULT_PADDING, 0);
    const pageSize = positiveInt('--page-size', one('--page-size'), DEFAULT_PAGE_SIZE, 1);
    const traceText = one('--trace-regions');
    const traceTolerance = traceText === undefined ? null : Number(traceText);
    if (traceTolerance !== null && !(Number.isFinite(traceTolerance) && traceTolerance > 0)) {
      throw new AnchorInputError(
        `--trace-regions takes the contour mesher's simplification tolerance in pixels, a positive number, got ${JSON.stringify(traceText)} — ` +
          'the contour generator has no default tolerance (its "tolerance" is required) and the mesher refuses 0; tolerance 0 is the traced:0 column, which every run prints',
      );
    }
    const named = one('--recipes');
    const regionSets = flags.get('--regions') ?? [];
    const seedText = one('--seeds');
    const seeds =
      seedText === undefined
        ? named === undefined && regionSets.length === 0
          ? [POLYPACK_SEED, POLYPACK_GAIN_SEED]
          : []
        : seedText.split(',').map((t) => {
            const n = Number(t.trim());
            if (!Number.isInteger(n)) throw new AnchorInputError(`--seeds takes whole numbers separated by commas, got ${JSON.stringify(t)}`);
            return n;
          });
    const recipes: Recipe[] = named !== undefined ? readRecipes(named) : regionSets.length === 0 && seedText === undefined ? treeRecipes(root, warn) : [];
    const sets = regionSets.map((path) => ({ path, shapes: readRegionSet(path) }));
    const workFlag = one('--work');
    const work = scope.open(workFlag, keep, 'rigc-pack-anchor-', (m) => new AnchorInputError(m), 'set');
    warn(`pack_anchor: ${seeds.length} seed(s), ${sets.length} region set(s), ${recipes.length} recipe(s), padding ${padding}, page size ${pageSize}, work directory ${work}`);
    const started = performance.now();
    const rows: AnchorRow[] = [];
    for (const seed of seeds) rows.push(measuredRow(`seed ${seed}`, () => writePolypackInputs(join(work, 'seeds', String(seed)), polypackShapes(seed)), padding, pageSize, 0, refusals));
    sets.forEach(({ shapes }, i) => rows.push(measuredRow(`regions ${i + 1} (${shapes.length} regions)`, () => writePolypackInputs(join(work, 'regions', String(i)), shapes), padding, pageSize, 0, refusals)));
    if (recipes.length > 0) rows.push(...recipeRows(recipes, work, root, padding, pageSize, warn, refusals, traceTolerance));
    for (const line of anchorTable(rows)) print(line);
    const json = one('--json');
    if (json !== undefined) writeFileSync(json, anchorText(rows));
    const refused = rows.filter((r) => r.refused !== null);
    for (const r of refused) warn(`pack_anchor: ${r.name} REFUSED — ${r.refused}`);
    warn(`pack_anchor: wall time ${((performance.now() - started) / 1000).toFixed(1)} s`);
    if (refused.length === rows.length) {
      warn(`pack_anchor: no set measured — ${rows.length} refused`);
      return 2;
    }
    return 0;
  } catch (err) {
    if (err instanceof AnchorInputError || err instanceof HashesInputError) {
      warn(`pack_anchor: ${err.message}`);
      return 2;
    }
    throw err;
  } finally {
    scope.close(warn);
  }
}

if (import.meta.main) process.exit(anchorMain(process.argv.slice(2)));
