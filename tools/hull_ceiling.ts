/**
 * hull_ceiling — how much page area polygon packing could buy over a corpus,
 * measured before any packer is written (issue #1093).
 *
 *   bun tools/hull_ceiling.ts [--recipes <recipes.json>] [--root <dir>] [--work <dir> | --keep-work] [--json <out.json>]
 *
 * With no `--recipes`, the tree's own: `tools/emit_hashes.ts`'s `treeRecipes`
 * (every fetched editor export and every gallery rig — nineteen when
 * `examples/` is fetched), built exactly as `emit_hashes run` builds them
 * (`buildRecipes`). `--recipes` takes an `emit-hashes-recipes/1` or
 * `emit-hashes/1` document and `--root` resolves its stages, the way
 * `verdict_gate` takes them: a private corpus keeps its recipes with it and
 * only the table leaves it, which names recipes and nothing else.
 *
 * It changes nothing under `src/` and runs no packer of its own. It reads what
 * a build wrote — `skeleton.json`, `skeleton.atlas` and the pages the atlas
 * names — with rigc's own atlas reader (`parseAtlasText`) and rigc's own
 * contour tracer (`traceAlphaOutline`, the one the contour mesher runs).
 *
 * ## The unit: a packed region, in page texels
 *
 * Packing places regions, not attachments, so every figure is summed over the
 * atlas regions some attachment samples, each region once. The region an
 * attachment samples is its `path`, else its stated `name`, else its key —
 * the runtime's rule (`runtimeRegion`; `diff`'s `attachments.refs` reads the
 * same), and the per-region JSON says which of the three reached it — two region
 * attachments that share one image share one rectangle on the page. A region
 * is **mesh-kind** when every attachment that samples it is a mesh or a linked
 * mesh, and **region-kind** when any of them is a region attachment, because a
 * region attachment draws its whole quad and a neighbour's pixels inside it
 * would show. Every area is in the page's own texels, whatever `scale:` the
 * page states.
 *
 * - **rectangle** — the region's `bounds:` width × height. A region at
 *   `rotate: 90`/`270` covers `height x width` of the page (`pageFootprint`);
 *   its area is the same, and the table counts how many are turned.
 * - **mesh hull** — the polygon of a mesh's first `hull` vertices, read as
 *   given (closed from the last vertex back to the first, never re-ordered),
 *   in UV space scaled to the drawing: `u × originalWidth`, `v ×
 *   originalHeight`, which is how a mesh's UVs address a region whose
 *   whitespace the packer stripped. The polygon is then clipped to the kept
 *   rectangle (the part of the drawing that is on the page), and its area is
 *   the shoelace area of what remains. A linked mesh — a `mesh` or
 *   `linkedmesh` with a `source` — takes the hull of the attachment keyed
 *   `source` in the slot `slot` names (its own by default) of the skin `skin`
 *   names (the default skin by default), and samples its own region; a source
 *   that is not there refuses the row by name. A hull whose pruned polygon crosses or touches itself
 *   (`findSelfIntersection`) has no area to state: the region is counted as its
 *   rectangle and the row says how many. Several meshes sampling one region
 *   with hulls that are not the same polygon likewise count the rectangle, and
 *   are counted — the area to protect is their union, which this does not
 *   compute.
 * - **traced contour** — what a region-kind region would protect if it were
 *   converted to a mesh: the corner-lattice outline of its art, at threshold 1
 *   (every texel with alpha > 0 is art, the same threshold as the floor),
 *   UNSIMPLIFIED and with no margin — tolerance 0. That is the tightest polygon
 *   rigc's tracer states, so the row is a ceiling: a contour mesh an author
 *   builds simplifies and pushes out from it. On that lattice an outline
 *   encloses whole texels, so its area is a count: the texels of the art plus
 *   every transparent texel the art encloses (the tracer fills holes, 4-connected
 *   from the footprint's border). The row counts that over EVERY island of the
 *   art (`silhouetteOf`), because a packer must protect strays too.
 *
 *   `traceAlphaOutline` itself traces one island and refuses a diagonal
 *   pinch and art with no texel of alpha > 0 (`empty`), and the mesher refuses
 *   art whose largest island is under `CONTOUR_MIN_COVERAGE` of it (`islands`).
 *   **A region the tracer refuses counts as its RECTANGLE in the traced
 *   column**, because that is what a conversion does with it: no contour mesh
 *   is built, so the region attachment stays and packs by its quad
 *   (`tools/trace_footprint.ts` keeps it so, and `pack_anchor --trace-regions`
 *   — the realised figure this column is the ceiling of — packs it so). The
 *   column is therefore *what converting region attachments to their traced
 *   contour can reach*, and not the alpha's silhouette: a refused region's
 *   silhouette is area no conversion reaches, and on a page with no alpha it is
 *   0, which made a corpus whose pages carry none read a ceiling nothing could
 *   reach (issue #1157). The rejected reading — leaving refused regions out of
 *   both sides of the ratio — is a ratio over a different rectangle from the
 *   row's other ratios, so its gap to *meshes only* stops being a saving, and
 *   the realised figure it is weighed against packs every region. Each refusal is counted by reason and the texels kept
 *   as rectangles are stated beside them (`fallbacks.refusedRect`); the
 *   per-region silhouette stays in `--json`.
 *
 *   ⚠️ So the traced row can stand ABOVE the convex one, and does on public
 *   recipes whose regions the tracer refuses: the convex conversion refuses only art with no texel at all, while
 *   the tracer also refuses islands and pinches. The tracer is still the
 *   row's witness as well: on every region it traces as ONE island, its
 *   outline's shoelace area must equal `silhouetteOf`'s count to the texel,
 *   and a region where they differ refuses the row by name (`checked` in the
 *   JSON says on how many regions the two agreed).
 * - **opaque texels** — texels in the rectangle with alpha > 0, and beside
 *   them the **floor**: the opaque texels that are DRAWN — inside the hull
 *   (texel centre in the polygon) for a mesh-kind region, all of them for a
 *   region-kind one. They differ because an authored hull may leave art out:
 *   the texels outside it are never sampled, so on such rigs the raw count
 *   exceeds the hull and is no floor at all. A region with a rectangle and not
 *   one texel of alpha > 0 is legal (an empty part) and is not refused, but it
 *   is named in the row's notes by page, and so is a page with no such texel
 *   anywhere — a total of 0 never stands silently for a page that did not read.
 *
 * Turned regions are read in the drawing's orientation through `regionWindow`,
 * the index map `extractRegion` applies (HUL06 holds them equal at every
 * turn); every count is invariant under the turn. `--json` carries, per row,
 * every page (name, size, its texels of alpha > 0) and every region (name,
 * page, rotate, kind, how its name was reached, rectangle, hull, silhouette,
 * traced, convex, opaque, drawn opaque).
 *
 * Per recipe the row states Σ rectangle; Σ hull with meshes only (region-kind
 * regions counted as their rectangle); Σ hull with regions converted, once by
 * trace and once by convex hull (mesh-kind regions keep their mesh hull; a
 * region a conversion cannot make — refused by the tracer, or with no art for
 * a convex hull — keeps its rectangle, `conversionReach`); Σ
 * drawn opaque (the floor) and Σ opaque; each hull and the floor over Σ
 * rectangle; and **covered** — Σ rectangle of every region
 * on the pages over the pages' area, the figure `build --pack` prints. A
 * recipe whose atlas rigc wrote one part per page is built a second time with
 * `--pack --page-edges free` (into `{{work}}/packed`) and covered is read off
 * that atlas; a recipe built `--atlas-in` reads covered off the pack it was
 * given, whose packer (the editor, for the fetched exports) is named in the
 * row, because its whitespace strip and its rotation are in its rectangles and
 * not in rigc's.
 *
 * `--json` is `hull-ceiling/2`. Against `/1`: `hullTraced` counts a region
 * the tracer refuses as its rectangle rather than its silhouette, `hullConvex`
 * counts a region with no art as its rectangle rather than 0, and
 * `fallbacks.refusedRect` is new; every other field reads as before.
 *
 * Exit codes: 0 every recipe measured; 1 a recipe refused or unreadable (named
 * in the table and on stderr); 2 a bad input by name. The wall time is printed
 * on stderr and nowhere else, so two runs print the same table.
 */
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pageFootprint, parseAtlasText, type AtlasPage, type AtlasRegion } from '../src/atlas.ts';
import { resolveWrittenPath } from '../src/written_path.ts';
import { findSelfIntersection, prunePolygon, signedArea, type AlphaMask } from '../src/mesh.ts';
import { traceOutline } from './trace_footprint.ts';
import { readPlate, type Plate } from './plate.ts';
import { HashesInputError, readRecipes, treeRecipes, TREE_ROOT, type Recipe } from './emit_hashes.ts';
import { buildRecipes } from './core_gate.ts';
import { readKeepWork, WorkDirectory } from './work_dir.ts';

export const CEILING_SPEC = 'hull-ceiling/2';

/** A refusal about an input — the command exits 2 on it. */
export class CeilingInputError extends Error {}

type Point = [number, number];

/**
 * The concave reading of a region's alpha: a polygon's area, or the refusal
 * the tracer gave. A parameter so a control can plant a tracer that is wrong.
 */
export type ContourReader = (mask: AlphaMask) => { area: number; islands: number } | { refused: string };

/**
 * `traceAlphaOutline` at threshold 1, unsimplified: the area its corner-lattice
 * outline encloses and how many islands it saw, or why it refused — `pinch`
 * (a diagonal pinch), `empty` (no art) or `islands` (the largest island under
 * `CONTOUR_MIN_COVERAGE` of the art, which the mesher refuses).
 */
export const traceContour: ContourReader = (mask) => {
  // The outline `tools/pack_anchor.ts --trace-regions` packs by (`traceOutline`), so the ceiling and the realised figure read one polygon.
  const traced = traceOutline(mask);
  if ('refused' in traced) return { refused: traced.refused };
  return { area: Math.abs(signedArea(traced.outline)), islands: traced.islands };
};

/** How a region name was reached: the attachment's `path`, else its `name`, else its key — the runtime's order. */
export type ResolvedBy = 'path' | 'name' | 'key';

/**
 * The atlas region an attachment samples (a sequence's frames are numbered
 * after it): `path`, else the stated `name`, else the placeholder key — the
 * parser's rule, and the one `diff`'s `attachments.refs` reads
 * (`attachmentRefTokens` in src/diff.ts). A parameter so a control can plant
 * the rejected key-only reading.
 */
export type RegionResolver = (key: string, att: Record<string, unknown>) => { region: string; by: ResolvedBy };

export const runtimeRegion: RegionResolver = (key, att) =>
  typeof att.path === 'string' ? { region: att.path, by: 'path' } : typeof att.name === 'string' ? { region: att.name, by: 'name' } : { region: key, by: 'key' };

/** How one packed region is sampled and what it measures. */
export interface RegionMeasure {
  name: string;
  /** The page it sits on, as the atlas names it, and that page's place in the atlas (1-based). */
  page: string;
  pageIndex: number;
  degrees: number;
  kind: 'region' | 'mesh';
  /** How the attachments sampling it reached its name, each spelling once, sorted. */
  resolvedBy: ResolvedBy[];
  rect: number;
  /** The mesh hull's area clipped to the rectangle; null on a region-kind region. */
  meshHull: number | null;
  /** Why a mesh-kind region is counted as its rectangle, or null. */
  meshFallback: 'self-intersecting' | 'hulls differ' | null;
  /** The art's texels plus every transparent texel it encloses, over every island (`silhouetteOf`). */
  silhouette: number;
  /** The tracer's reading of the same alpha: its outline's area and islands, or its refusal. */
  traced: { area: number; islands: number } | { refused: string };
  convex: number;
  /** Texels with alpha > 0 in the rectangle. */
  opaque: number;
  /** The same, inside the area that is drawn: the hull for a mesh-kind region, the whole rectangle for a region-kind one. */
  opaqueDrawn: number;
}

/** One page of a build's atlas: its size and how many of its texels have alpha > 0. */
export interface PageMeasure {
  name: string;
  width: number;
  height: number;
  opaque: number;
}

export interface CeilingRow {
  name: string;
  /** Who placed the rectangles the row measures. */
  packer: string;
  /** Null when the row was measured; otherwise why not. */
  refused: string | null;
  attachments: { region: number; mesh: number; linked: number };
  regions: { region: number; mesh: number; rotated: number };
  rect: number;
  hullMeshes: number;
  hullTraced: number;
  hullConvex: number;
  opaque: number;
  opaqueDrawn: number;
  /**
   * Counts behind the fallbacks: regions counted as their rectangle, and why —
   * `traceRefused` by the tracer's reason, and `refusedRect` the Σ rectangle
   * of those region-kind regions, which the traced column counts as kept.
   */
  fallbacks: { selfIntersecting: number; hullsDiffer: number; traceRefused: Record<string, number>; refusedRect: number };
  /** Regions the tracer traced as one island, whose outline area equalled the silhouette to the texel. */
  checked: number;
  /** Regions with a rectangle and no texel of alpha > 0, by the 1-based index of their page. */
  emptyRegions: Record<string, number>;
  /** Pages with no texel of alpha > 0 anywhere, by 1-based index. */
  emptyPages: number[];
  /** Σ rectangle of every region on the pages over the pages' area, and whose pages; null when not read. */
  covered: { value: number; of: string } | null;
  /** Every region and page, for `--json`. */
  measures: RegionMeasure[];
  pages: PageMeasure[];
}

// ---------------------------------------------------------------------------
// geometry
// ---------------------------------------------------------------------------

/** A polygon clipped to an axis-aligned rectangle (Sutherland-Hodgman; the area is right for a concave subject). */
export function clipToRect(poly: readonly Point[], x0: number, y0: number, x1: number, y1: number): Point[] {
  const edges: Array<{ inside: (p: Point) => boolean; cut: (a: Point, b: Point) => Point }> = [
    { inside: (p) => p[0] >= x0, cut: (a, b) => [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])] },
    { inside: (p) => p[0] <= x1, cut: (a, b) => [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])] },
    { inside: (p) => p[1] >= y0, cut: (a, b) => [a[0] + ((b[0] - a[0]) * (y0 - a[1])) / (b[1] - a[1]), y0] },
    { inside: (p) => p[1] <= y1, cut: (a, b) => [a[0] + ((b[0] - a[0]) * (y1 - a[1])) / (b[1] - a[1]), y1] },
  ];
  let out: Point[] = poly.map(([x, y]) => [x, y]);
  for (const edge of edges) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const here = input[i];
      const prev = input[(i + input.length - 1) % input.length];
      if (edge.inside(here)) {
        if (!edge.inside(prev)) out.push(edge.cut(prev, here));
        out.push(here);
      } else if (edge.inside(prev)) out.push(edge.cut(prev, here));
    }
    if (out.length === 0) break;
  }
  return out;
}

/** The convex hull's area of a point set (Andrew's monotone chain). */
export function convexArea(points: Point[]): number {
  if (points.length < 3) return 0;
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Point, a: Point, b: Point): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Point[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Point[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return Math.abs(signedArea([...lower.slice(0, -1), ...upper.slice(0, -1)]));
}

/**
 * The kept rectangle of a region, in the DRAWING's orientation (`width` x
 * `height`, y down), read off its page through the same index map
 * `extractRegion` in src/atlas.ts applies at 0, 90, 180 and 270 — the inverse
 * of `MeshAttachment.computeUVs` by that function's own account. Read here
 * rather than through `extractRegion` because that lifts the whole untrimmed
 * drawing one `RGBA` array per texel; HUL06 holds the two byte for byte at all
 * four turns.
 */
export function regionWindow(page: Plate, region: AtlasRegion): AlphaMask {
  const { width: w, height: h, degrees } = region;
  const alpha = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = degrees === 90 ? region.x + y : degrees === 180 ? region.x + w - 1 - x : degrees === 270 ? region.x + h - 1 - y : region.x + x;
      const py = degrees === 90 ? region.y + w - 1 - x : degrees === 180 ? region.y + h - 1 - y : degrees === 270 ? region.y + x : region.y + y;
      alpha[y * w + x] = px >= 0 && py >= 0 && px < page.width && py < page.height ? page.data[(py * page.width + px) * 4 + 3] : 0;
    }
  }
  return { width: w, height: h, alpha };
}

/** Even-odd: is `p` inside `poly`? */
function inside(poly: readonly Point[], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/**
 * A window's opaque count, the convex hull of its art texels' squares and the
 * opaque count inside `drawn` (window coordinates; null = the whole window).
 * Per row only the leftmost and rightmost art texel matter to a convex hull,
 * so those two squares' corners are its point set. A texel is inside `drawn`
 * when its centre is, the convention `src/render.ts` rasterises by.
 */
export function windowCounts(mask: AlphaMask, drawn: readonly Point[] | null): { opaque: number; opaqueDrawn: number; convex: number; silhouette: number } {
  const { width: w, height: h, alpha } = mask;
  let opaque = 0;
  let opaqueDrawn = 0;
  const corners: Point[] = [];
  for (let j = 0; j < h; j++) {
    let lo = -1;
    let hi = -1;
    for (let i = 0; i < w; i++) {
      if (alpha[j * w + i] === 0) continue;
      opaque++;
      if (drawn === null || inside(drawn, i + 0.5, j + 0.5)) opaqueDrawn++;
      if (lo < 0) lo = i;
      hi = i;
    }
    if (lo >= 0) corners.push([lo, j], [lo, j + 1], [hi + 1, j], [hi + 1, j + 1]);
  }
  return { opaque, opaqueDrawn, convex: convexArea(corners), silhouette: silhouetteOf(mask) };
}

/**
 * Texels with alpha > 0, plus every transparent texel no 4-connected path
 * reaches from the mask's border — the fill `traceAlphaOutline` applies to its
 * one island, applied to all of them at once.
 */
export function silhouetteOf(mask: AlphaMask): number {
  const { width: w, height: h, alpha } = mask;
  const reach = new Uint8Array(w * h);
  const stack: number[] = [];
  const seed = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (alpha[i] > 0 || reach[i]) return;
    reach[i] = 1;
    stack.push(i);
  };
  for (let x = 0; x < w; x++) {
    seed(x, 0);
    seed(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    seed(0, y);
    seed(w - 1, y);
  }
  while (stack.length > 0) {
    const i = stack.pop() as number;
    const x = i % w;
    const y = (i - x) / w;
    seed(x - 1, y);
    seed(x + 1, y);
    seed(x, y - 1);
    seed(x, y + 1);
  }
  let n = 0;
  for (let i = 0; i < reach.length; i++) if (!reach[i]) n++;
  return n;
}

// ---------------------------------------------------------------------------
// reading a build
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;

function isRecord(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** One attachment that samples the atlas, with the geometry it samples it through. */
interface Sampler {
  kind: 'region' | 'mesh' | 'linked';
  regions: string[];
  by: ResolvedBy;
  /** The hull polygon in UV space, for a mesh or a linked mesh (its source's). */
  hullUv: Point[] | null;
}

/** A sequence's frame names: `path + (start + i)` padded to `digits` (start 1, digits 0 when absent — the parser's defaults). */
function sequenceRegions(path: string, seq: unknown): string[] {
  if (!isRecord(seq)) return [path];
  const count = typeof seq.count === 'number' ? seq.count : 0;
  const start = typeof seq.start === 'number' ? seq.start : 1;
  const digits = typeof seq.digits === 'number' ? seq.digits : 0;
  return Array.from({ length: count }, (_v, i) => path + String(start + i).padStart(digits, '0'));
}

function hullOf(att: Json): Point[] | null {
  const uvs = att.uvs;
  const hull = att.hull;
  if (!Array.isArray(uvs) || typeof hull !== 'number') return null;
  const out: Point[] = [];
  for (let i = 0; i < hull; i++) out.push([Number(uvs[2 * i]), Number(uvs[2 * i + 1])]);
  return out;
}

/**
 * Every attachment in every skin that samples the atlas, its region resolved
 * by `resolve`.
 *
 * A LINK is a `mesh` or `linkedmesh` carrying a non-empty `source` — the
 * parser's test, which src/ingest.ts states (`linked`, issue #691): a
 * `linkedmesh` with no `source` is read as an ordinary mesh. Its geometry is
 * the attachment keyed `source` in the slot `slot` names (default: its own) of
 * the skin `skin` names (default: the default skin, `"default"`); its region is
 * its own. A source that is not there refuses the build by name — the gate
 * resolved it, so a miss is this reader's.
 */
export function samplersOf(skeleton: Json, resolve: RegionResolver = runtimeRegion): Sampler[] {
  const skins = Array.isArray(skeleton.skins) ? skeleton.skins.filter(isRecord) : [];
  const find = (skin: string, slot: string, key: string): Json | null => {
    const s = skins.find((k) => k.name === skin);
    const atts = s !== undefined && isRecord(s.attachments) ? s.attachments[slot] : undefined;
    const att = isRecord(atts) ? atts[key] : undefined;
    return isRecord(att) ? att : null;
  };
  const out: Sampler[] = [];
  for (const skin of skins) {
    if (!isRecord(skin.attachments)) continue;
    for (const [slot, atts] of Object.entries(skin.attachments)) {
      if (!isRecord(atts)) continue;
      for (const [key, att] of Object.entries(atts)) {
        if (!isRecord(att)) continue;
        const type = typeof att.type === 'string' ? att.type : 'region';
        if (type !== 'region' && type !== 'mesh' && type !== 'linkedmesh') continue;
        const { region, by } = resolve(key, att);
        const regions = sequenceRegions(region, att.sequence);
        const linked = typeof att.source === 'string' && att.source.length > 0;
        if (type === 'region') out.push({ kind: 'region', regions, by, hullUv: null });
        else if (!linked) out.push({ kind: 'mesh', regions, by, hullUv: hullOf(att) });
        else {
          const at = { skin: typeof att.skin === 'string' ? att.skin : 'default', slot: typeof att.slot === 'string' ? att.slot : slot, key: att.source as string };
          const source = find(at.skin, at.slot, at.key);
          if (source === null) {
            throw new CeilingInputError(`linked mesh "${key}" in skin "${String(skin.name)}" slot "${slot}" takes its geometry from "${at.key}" in skin "${at.skin}" slot "${at.slot}", which is not there`);
          }
          out.push({ kind: 'linked', regions, by, hullUv: hullOf(source) });
        }
      }
    }
  }
  return out;
}

/** A mesh hull in the drawing's texels (y down from the drawing's top), pruned; null when it crosses or touches itself. */
function hullInDrawing(hullUv: Point[], r: AtlasRegion): Point[] | null {
  const poly = prunePolygon(hullUv.map(([u, v]): Point => [u * r.originalWidth, v * r.originalHeight]));
  return poly.length < 3 || findSelfIntersection(poly) !== null ? null : poly;
}

function sameHull(a: Point[], b: Point[]): boolean {
  return a.length === b.length && a.every((p, i) => p[0] === b[i][0] && p[1] === b[i][1]);
}

/** The pages of an atlas file, decoded; a refusal names the page. */
function readPages(atlasPath: string, pages: readonly AtlasPage[]): Map<string, Plate> {
  const out = new Map<string, Plate>();
  for (const page of pages) {
    const file = resolveWrittenPath(dirname(atlasPath), page.name);
    if (!existsSync(file)) throw new CeilingInputError(`page "${page.name}" is not on disk`);
    const plate = readPlate(file);
    if (plate.width !== page.width || plate.height !== page.height) {
      throw new CeilingInputError(`page "${page.name}" declares ${page.width}x${page.height} and its file is ${plate.width}x${plate.height}`);
    }
    out.set(page.name, plate);
  }
  return out;
}

/** Σ rectangle of every region on an atlas's pages over the pages' area. */
export function coveredOf(atlasPath: string): number {
  const parsed = parseAtlasText(readFileSync(atlasPath, 'utf8'));
  const area = parsed.pages.reduce((n, p) => n + p.width * p.height, 0);
  const rects = parsed.regions.reduce((n, r) => n + r.width * r.height, 0);
  return rects / area;
}

export interface MeasureOptions {
  trace?: ContourReader;
  resolve?: RegionResolver;
}

export interface BuildMeasure {
  measures: RegionMeasure[];
  pages: PageMeasure[];
  attachments: CeilingRow['attachments'];
}

/** One build's regions measured. */
export function measureBuild(out: string, opts: MeasureOptions = {}): BuildMeasure {
  const trace = opts.trace ?? traceContour;
  const skeleton = JSON.parse(readFileSync(join(out, 'skeleton.json'), 'utf8')) as Json;
  const atlasPath = join(out, 'skeleton.atlas');
  if (!existsSync(atlasPath)) throw new CeilingInputError('the build wrote no skeleton.atlas');
  const parsed = parseAtlasText(readFileSync(atlasPath, 'utf8'));
  const plates = readPages(atlasPath, parsed.pages);
  const pages: PageMeasure[] = parsed.pages.map((p) => {
    const plate = plates.get(p.name) as Plate;
    let opaque = 0;
    for (let i = 3; i < plate.data.length; i += 4) if (plate.data[i] > 0) opaque++;
    return { name: p.name, width: p.width, height: p.height, opaque };
  });
  const byName = new Map<string, { page: AtlasPage; index: number; region: AtlasRegion }>();
  parsed.pages.forEach((page, index) => {
    for (const region of page.regions) if (!byName.has(region.name.trim())) byName.set(region.name.trim(), { page, index, region });
  });

  const samplers = samplersOf(skeleton, opts.resolve ?? runtimeRegion);
  const attachments = { region: 0, mesh: 0, linked: 0 };
  const uses = new Map<string, Sampler[]>();
  for (const s of samplers) {
    attachments[s.kind]++;
    for (const name of s.regions) uses.set(name, [...(uses.get(name) ?? []), s]);
  }
  const measures: RegionMeasure[] = [];
  for (const name of [...uses.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
    const using = uses.get(name) ?? [];
    const hit = byName.get(name);
    if (hit === undefined) {
      throw new CeilingInputError(`an attachment samples region "${name}" (reached by its ${[...new Set(using.map((s) => s.by))].sort().join(', ')}), which the atlas does not list`);
    }
    const { page, index, region } = hit;
    const kind: 'region' | 'mesh' = using.every((s) => s.kind !== 'region') ? 'mesh' : 'region';
    const mask = regionWindow(plates.get(page.name) as Plate, region);
    const rect = region.width * region.height;
    const top = region.originalHeight - region.offsetY - region.height;
    let meshHull: number | null = null;
    let meshFallback: RegionMeasure['meshFallback'] = null;
    let drawn: Point[] | null = null;
    if (kind === 'mesh') {
      const hulls = using.map((s) => s.hullUv);
      const first = hulls[0];
      if (first === null || first === undefined || hulls.some((h) => h === null || !sameHull(h, first))) meshFallback = 'hulls differ';
      else {
        const poly = hullInDrawing(first, region);
        if (poly === null) meshFallback = 'self-intersecting';
        else {
          const clipped = clipToRect(poly, region.offsetX, top, region.offsetX + region.width, top + region.height);
          meshHull = clipped.length < 3 ? 0 : Math.abs(signedArea(clipped));
          drawn = poly.map(([x, y]): Point => [x - region.offsetX, y - top]);
        }
      }
    }
    const counts = windowCounts(mask, drawn);
    const traced = trace(mask);
    if ('area' in traced && traced.islands === 1 && traced.area !== counts.silhouette) {
      throw new CeilingInputError(
        `region "${name}": the tracer's outline encloses ${traced.area} texels and the silhouette counts ${counts.silhouette} — ` +
          'one island traced on the corner lattice encloses exactly its filled texels, so one of the two readings is wrong',
      );
    }
    measures.push({
      name,
      page: page.name,
      pageIndex: index + 1,
      degrees: region.degrees,
      kind,
      resolvedBy: [...new Set(using.map((s) => s.by))].sort(),
      rect,
      meshHull,
      meshFallback,
      silhouette: counts.silhouette,
      traced,
      convex: counts.convex,
      opaque: counts.opaque,
      opaqueDrawn: counts.opaqueDrawn,
    });
  }
  return { measures, pages, attachments };
}

/**
 * What a region-kind region counts in the two converted columns: its traced
 * contour and its convex hull, or — where that conversion cannot be made —
 * its rectangle. A parameter so a control can plant the arithmetic it replaced.
 */
export type ConversionReading = (m: RegionMeasure) => { traced: number; convex: number };

/**
 * A region the tracer refuses (`empty`, `pinch`, `islands`, …) is not
 * converted, so it keeps its rectangle; a region with no texel of alpha > 0
 * has no convex hull to convert to, and keeps it too. Never its silhouette,
 * which for a refused region is area no conversion reaches and for an
 * alpha-less page is 0 (issue #1157).
 */
export const conversionReach: ConversionReading = (m) => ({
  traced: 'refused' in m.traced ? m.rect : m.silhouette,
  convex: m.opaque === 0 ? m.rect : m.convex,
});

/** A build's measures summed into a row. */
export function rowOf(name: string, packer: string, measured: BuildMeasure, covered: CeilingRow['covered'], reach: ConversionReading = conversionReach): CeilingRow {
  const row: CeilingRow = {
    name,
    packer,
    refused: null,
    attachments: measured.attachments,
    regions: { region: 0, mesh: 0, rotated: 0 },
    rect: 0,
    hullMeshes: 0,
    hullTraced: 0,
    hullConvex: 0,
    opaque: 0,
    opaqueDrawn: 0,
    fallbacks: { selfIntersecting: 0, hullsDiffer: 0, traceRefused: {}, refusedRect: 0 },
    checked: 0,
    emptyRegions: {},
    emptyPages: measured.pages.flatMap((p, i) => (p.opaque === 0 ? [i + 1] : [])),
    covered,
    measures: measured.measures,
    pages: measured.pages,
  };
  for (const m of measured.measures) {
    row.regions[m.kind]++;
    if (m.degrees === 90 || m.degrees === 270) row.regions.rotated++;
    row.rect += m.rect;
    row.opaque += m.opaque;
    row.opaqueDrawn += m.opaqueDrawn;
    if (m.rect > 0 && m.opaque === 0) row.emptyRegions[String(m.pageIndex)] = (row.emptyRegions[String(m.pageIndex)] ?? 0) + 1;
    if ('area' in m.traced && m.traced.islands === 1) row.checked++;
    if ('refused' in m.traced && m.kind === 'region') {
      row.fallbacks.traceRefused[m.traced.refused] = (row.fallbacks.traceRefused[m.traced.refused] ?? 0) + 1;
      row.fallbacks.refusedRect += m.rect;
    }
    if (m.kind === 'mesh') {
      const hull = m.meshHull ?? m.rect;
      if (m.meshFallback === 'self-intersecting') row.fallbacks.selfIntersecting++;
      if (m.meshFallback === 'hulls differ') row.fallbacks.hullsDiffer++;
      row.hullMeshes += hull;
      row.hullTraced += hull;
      row.hullConvex += hull;
    } else {
      const converted = reach(m);
      row.hullMeshes += m.rect;
      row.hullTraced += converted.traced;
      row.hullConvex += converted.convex;
    }
  }
  return row;
}

// ---------------------------------------------------------------------------
// recipes
// ---------------------------------------------------------------------------

/** The last `build` of a recipe, and who packs its atlas. */
function lastBuild(recipe: Recipe): { at: number; packer: 'atlas-in' | 'pack' | 'loose' } | null {
  for (let i = recipe.commands.length - 1; i >= 0; i--) {
    const c = recipe.commands[i];
    if (c[0] !== 'build') continue;
    return { at: i, packer: c.includes('--atlas-in') ? 'atlas-in' : c.includes('--pack') ? 'pack' : 'loose' };
  }
  return null;
}

/** A loose recipe with its build repeated `--pack --page-edges free` into `{{work}}/packed`. */
export function withPackedTwin(recipe: Recipe): Recipe {
  const b = lastBuild(recipe);
  if (b === null || b.packer !== 'loose') return recipe;
  const src = recipe.commands[b.at];
  const twin: string[] = [];
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '--copy-images') continue;
    if (src[i] === '--out' || src[i] === '--page-edges') {
      i++;
      continue;
    }
    twin.push(src[i]);
  }
  twin.push('--pack', '--page-edges', 'free', '--out', '{{work}}/packed');
  return { ...recipe, commands: [...recipe.commands, twin] };
}

/** Every recipe built into `work` and measured, in name order. */
export function ceilingRows(recipes: readonly Recipe[], work: string, root: string, opts: MeasureOptions = {}, progress: (line: string) => void = () => {}): CeilingRow[] {
  const twinned = recipes.map(withPackedTwin);
  const built = buildRecipes(twinned, work, root, progress);
  return built.map((b, i): CeilingRow => {
    const kind = lastBuild(recipes[i])?.packer ?? 'loose';
    const packer = kind === 'atlas-in' ? 'the --atlas-in pack' : kind === 'pack' ? 'rigc --pack' : 'rigc --pack --page-edges free';
    const failed = (why: string): CeilingRow => ({
      name: b.name,
      packer,
      refused: why,
      attachments: { region: 0, mesh: 0, linked: 0 },
      regions: { region: 0, mesh: 0, rotated: 0 },
      rect: 0,
      hullMeshes: 0,
      hullTraced: 0,
      hullConvex: 0,
      opaque: 0,
      opaqueDrawn: 0,
      fallbacks: { selfIntersecting: 0, hullsDiffer: 0, traceRefused: {}, refusedRect: 0 },
      checked: 0,
      emptyRegions: {},
      emptyPages: [],
      covered: null,
      measures: [],
      pages: [],
    });
    if (b.exits.some((e) => e !== 0)) return failed(`the build chain exited ${JSON.stringify(b.exits)}`);
    try {
      const measured = measureBuild(b.out, opts);
      const packedAtlas = kind === 'loose' ? join(dirname(b.out), 'packed', 'skeleton.atlas') : join(b.out, 'skeleton.atlas');
      const covered = { value: coveredOf(packedAtlas), of: kind === 'loose' ? 'the packed twin' : 'the build' };
      if (kind === 'loose') {
        // The twin packs the same regions; its rectangles must sum to the loose build's.
        const twin = measureBuild(join(dirname(b.out), 'packed'), opts);
        const twinRect = twin.measures.reduce((n, m) => n + m.rect, 0);
        const rect = measured.measures.reduce((n, m) => n + m.rect, 0);
        if (twinRect !== rect) return failed(`the packed twin's rectangles sum to ${twinRect} texels and the loose build's to ${rect}`);
      }
      return rowOf(b.name, packer, measured, covered);
    } catch (err) {
      if (err instanceof CeilingInputError) return failed(err.message);
      throw err;
    }
  });
}

// ---------------------------------------------------------------------------
// the table
// ---------------------------------------------------------------------------

function ratio(n: number, d: number): string {
  return d > 0 ? (n / d).toFixed(3) : '—';
}

function count(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function fallbackNote(row: CeilingRow): string {
  const parts: string[] = [];
  const empty = Object.entries(row.emptyRegions).sort(([a], [b]) => Number(a) - Number(b));
  if (empty.length > 0) {
    const n = empty.reduce((t, [, v]) => t + v, 0);
    parts.push(`${n} region(s) with a rectangle read no texel of alpha > 0 (${empty.map(([p, v]) => `${v} on page ${p}`).join(', ')} of ${row.pages.length}; per region in --json)`);
  }
  if (row.emptyPages.length > 0) parts.push(`page(s) ${row.emptyPages.join(', ')} of ${row.pages.length} hold no texel of alpha > 0 anywhere`);
  if (row.fallbacks.selfIntersecting > 0) parts.push(`${row.fallbacks.selfIntersecting} mesh hull(s) self-intersecting, counted as the rectangle`);
  if (row.fallbacks.hullsDiffer > 0) parts.push(`${row.fallbacks.hullsDiffer} region(s) whose meshes' hulls differ, counted as the rectangle`);
  return parts.length === 0 ? '' : parts.join('; ');
}

/** How many regions the tracer agreed with, and the ones it refused by reason with the texels they keep as rectangles. */
function tracerNote(checked: number, traceRefused: Record<string, number>, refusedRect: number): string {
  const refused = Object.entries(traceRefused).sort(([a], [b]) => (a < b ? -1 : 1));
  return `${checked} = silhouette${refused.length === 0 ? '' : `; refuses ${refused.map(([why, n]) => `${n} ${why}`).join(', ')}, kept as ${count(refusedRect)} texels of rectangle`}`;
}

/** The table as markdown lines: one row per recipe, then the sums. */
export function ceilingTable(rows: readonly CeilingRow[]): string[] {
  const head = [
    'recipe',
    'packer',
    'attachments region / mesh / linked',
    'regions region-kind / mesh-kind / rotated',
    'Σ rectangle',
    'Σ hull, meshes only',
    'ratio',
    'Σ hull, regions traced (refused: rectangle)',
    'ratio',
    'Σ hull, regions convex (no art: rectangle)',
    'ratio',
    'Σ opaque, drawn',
    'floor: drawn opaque / rectangle',
    'Σ opaque, every texel',
    'covered',
    'tracer witness',
    'notes',
  ];
  const out = [`| ${head.join(' | ')} |`, `| ${head.map((_h, i) => (i < 4 || i >= head.length - 2 ? '---' : '---:')).join(' | ')} |`];
  const sum = { checked: 0, opaqueDrawn: 0, rect: 0, hullMeshes: 0, hullTraced: 0, hullConvex: 0, opaque: 0, a: [0, 0, 0], r: [0, 0, 0], refused: {} as Record<string, number>, refusedRect: 0 };
  for (const row of rows) {
    if (row.refused !== null) {
      out.push(`| ${row.name} | ${row.packer} | REFUSED: ${row.refused} |${' |'.repeat(head.length - 3)}`);
      continue;
    }
    sum.rect += row.rect;
    sum.hullMeshes += row.hullMeshes;
    sum.hullTraced += row.hullTraced;
    sum.hullConvex += row.hullConvex;
    sum.opaque += row.opaque;
    sum.opaqueDrawn += row.opaqueDrawn;
    sum.checked += row.checked;
    sum.refusedRect += row.fallbacks.refusedRect;
    for (const [why, n] of Object.entries(row.fallbacks.traceRefused)) sum.refused[why] = (sum.refused[why] ?? 0) + n;
    [row.attachments.region, row.attachments.mesh, row.attachments.linked].forEach((v, i) => (sum.a[i] += v));
    [row.regions.region, row.regions.mesh, row.regions.rotated].forEach((v, i) => (sum.r[i] += v));
    out.push(
      `| ${[
        row.name,
        row.packer,
        `${row.attachments.region} / ${row.attachments.mesh} / ${row.attachments.linked}`,
        `${row.regions.region} / ${row.regions.mesh} / ${row.regions.rotated}`,
        count(row.rect),
        count(row.hullMeshes),
        ratio(row.hullMeshes, row.rect),
        count(row.hullTraced),
        ratio(row.hullTraced, row.rect),
        count(row.hullConvex),
        ratio(row.hullConvex, row.rect),
        count(row.opaqueDrawn),
        ratio(row.opaqueDrawn, row.rect),
        count(row.opaque),
        row.covered === null ? '—' : `${(row.covered.value * 100).toFixed(1)} %`,
        tracerNote(row.checked, row.fallbacks.traceRefused, row.fallbacks.refusedRect),
        fallbackNote(row),
      ].join(' | ')} |`,
    );
  }
  out.push(
    `| **all rows** | | ${sum.a.join(' / ')} | ${sum.r.join(' / ')} | ${count(sum.rect)} | ${count(sum.hullMeshes)} | ${ratio(sum.hullMeshes, sum.rect)} | ` +
      `${count(sum.hullTraced)} | ${ratio(sum.hullTraced, sum.rect)} | ${count(sum.hullConvex)} | ${ratio(sum.hullConvex, sum.rect)} | ` +
      `${count(sum.opaqueDrawn)} | ${ratio(sum.opaqueDrawn, sum.rect)} | ${count(sum.opaque)} | | ${tracerNote(sum.checked, sum.refused, sum.refusedRect)} | |`,
  );
  return out;
}

/** The JSON document: the rows, key order fixed, areas to six decimals. */
export function ceilingText(rows: readonly CeilingRow[]): string {
  const r6 = (n: number): number => Math.round(n * 1e6) / 1e6;
  const doc = {
    spec: CEILING_SPEC,
    recipes: rows.map((row) => ({
      name: row.name,
      packer: row.packer,
      refused: row.refused,
      attachments: row.attachments,
      regionCounts: row.regions,
      rect: row.rect,
      hullMeshes: r6(row.hullMeshes),
      hullTraced: r6(row.hullTraced),
      hullConvex: r6(row.hullConvex),
      opaque: row.opaque,
      opaqueDrawn: row.opaqueDrawn,
      emptyRegions: row.emptyRegions,
      emptyPages: row.emptyPages,
      fallbacks: {
        selfIntersecting: row.fallbacks.selfIntersecting,
        hullsDiffer: row.fallbacks.hullsDiffer,
        traceRefused: Object.fromEntries(Object.entries(row.fallbacks.traceRefused).sort(([a], [b]) => (a < b ? -1 : 1))),
        refusedRect: row.fallbacks.refusedRect,
      },
      checked: row.checked,
      covered: row.covered === null ? null : { value: r6(row.covered.value), of: row.covered.of },
      pages: row.pages.map((p) => ({ name: p.name, width: p.width, height: p.height, opaque: p.opaque })),
      regions: row.measures.map((m) => ({
        name: m.name,
        page: m.page,
        pageIndex: m.pageIndex,
        rotate: m.degrees,
        kind: m.kind,
        resolvedBy: m.resolvedBy,
        rect: m.rect,
        meshHull: m.meshHull === null ? null : r6(m.meshHull),
        meshFallback: m.meshFallback,
        silhouette: m.silhouette,
        traced: 'area' in m.traced ? { area: m.traced.area, islands: m.traced.islands } : { refused: m.traced.refused },
        convex: r6(m.convex),
        opaque: m.opaque,
        opaqueDrawn: m.opaqueDrawn,
      })),
    })),
  };
  return `${JSON.stringify(doc, null, 2)}\n`;
}

function parseFlags(args: readonly string[], known: readonly string[]): Map<string, string> {
  const flags = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!known.includes(arg)) throw new CeilingInputError(`unknown argument ${arg}; this command takes ${known.join(', ')}`);
    const value = args[i + 1];
    if (value === undefined || value.startsWith('--')) throw new CeilingInputError(`${arg} needs a value`);
    if (flags.has(arg)) throw new CeilingInputError(`${arg} given twice`);
    flags.set(arg, value);
    i++;
  }
  return flags;
}

/** The command; returns the exit code. */
export function ceilingMain(argv: readonly string[], print: (line: string) => void = console.log, warn: (line: string) => void = console.error): number {
  const scope = new WorkDirectory('hull_ceiling');
  try {
    const { argv: args, keep } = readKeepWork(argv, [], (m) => new CeilingInputError(m));
    const flags = parseFlags(args, ['--recipes', '--root', '--work', '--json']);
    const root = resolve(flags.get('--root') ?? TREE_ROOT);
    if (!existsSync(root) || !statSync(root).isDirectory()) throw new CeilingInputError(`--root ${root} is not a directory`);
    const named = flags.get('--recipes');
    const recipes: Recipe[] = named === undefined ? treeRecipes(root, warn) : readRecipes(named);
    if (recipes.length === 0) throw new CeilingInputError('no recipes to run');
    const workFlag = flags.get('--work');
    const work = scope.open(workFlag, keep, 'rigc-hull-ceiling-', (m) => new CeilingInputError(m));
    warn(`hull_ceiling: ${recipes.length} recipe(s), work directory ${work}`);
    const started = performance.now();
    const rows = ceilingRows(recipes, work, root, {}, warn);
    for (const line of ceilingTable(rows)) print(line);
    const json = flags.get('--json');
    if (json !== undefined) writeFileSync(json, ceilingText(rows));
    const refused = rows.filter((r) => r.refused !== null);
    for (const r of refused) warn(`hull_ceiling: ${r.name} REFUSED — ${r.refused}`);
    warn(`hull_ceiling: wall time ${((performance.now() - started) / 1000).toFixed(1)} s`);
    return refused.length > 0 ? 1 : 0;
  } catch (err) {
    if (err instanceof CeilingInputError || err instanceof HashesInputError) {
      warn(`hull_ceiling: ${err.message}`);
      return 2;
    }
    throw err;
  } finally {
    scope.close(warn);
  }
}

if (import.meta.main) process.exit(ceilingMain(process.argv.slice(2)));
