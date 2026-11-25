/**
 * repack — a packed build's own output lifted back into parts, and the two
 * comparisons that say a repack of it lost nothing (issue #1169).
 *
 * `rigc repack <build>` (`src/cli/repack.ts`) is three steps a consumer that
 * keeps only `skeleton.json`, `skeleton.atlas` and the page PNGs worked out by
 * hand: cut every region off its page by its atlas bounds, `ingest` the
 * skeleton with `--art loose`, `build --pack` from the two specs and the cut
 * parts. This module is the half of that which is not a command: what the
 * atlas has to look like for the cut to be exact (`atlasRefusals`), the cut
 * itself (`liftAtlas`, which is `extractRegion` per region), and the two
 * comparisons the command makes before it writes anything — every region
 * lifted off the NEW pages against the same region lifted off the OLD ones
 * (`regionDifferences`), and the rebuilt skeleton against the input's
 * (`skeletonDifferences`). The third check is the gate, which is `build`'s and
 * is not restated here.
 *
 * ## What "exact" means, and why each refusal is one
 *
 * A region is lifted to `originalWidth x originalHeight` with its kept
 * rectangle at its trim offset and the rest transparent (`extractRegion`), so
 * a turned region (`rotate: 90`, `180`, `270`) and a region trimmed of
 * whitespace (`offsets:`) come off the page as the drawing the runtime draws —
 * `PKR02` holds that mapping against spine-core's sampling on every corpus
 * region. rigc's packer then places that drawing unturned and untrimmed, which
 * is a change of PLACEMENT only: the pack owns placement.
 *
 * What it cannot carry is anything the repacked atlas would state differently
 * besides placement, because `writeAtlasText` writes exactly `size`, `filter:
 * Linear, Linear` and `pma: false` per page and `bounds`, `offsets` and
 * `rotate: 0` per region. So a page that states anything else — `scale:` other
 * than 1 (the texels are coarser than the drawings, and the repacked page would
 * say they are not), `pma: true` (the texels are premultiplied, and the
 * repacked page would say they are straight), another `filter`, a `format` or
 * a `repeat` — and a region that states `index`, `split` or `pad` are refused
 * by name: the repack would drop or contradict a fact the input states. A
 * region the atlas names twice, or two names one case-insensitive file system
 * writes to one file, cannot be lifted to one part per name. A region whose
 * rectangle leaves its page, whose offsets leave its drawing, or whose page
 * PNG is missing or not the size the atlas declares, would be lifted from
 * texels the atlas does not describe.
 *
 * `repack --keep-pages` (issue #1339) asks another question of the same
 * atlas — not "can it be repacked?" but "can the model document state it as
 * it stands?" — and `keptPageRefusals` is its list.
 *
 * 🔒 Every refusal is collected before the first file is written, and the
 * command writes nothing when there is one. Nothing here guesses: there is no
 * "close enough" cut.
 *
 * No clock, no randomness, no network, no spine-core. It reads the pages it is
 * pointed at (`readPlate`), as `compile` reads the parts.
 */
import { type AtlasPage, type AtlasRegion, extractRegion, footprintCell, packFootprints, pageFootprint, type ParsedAtlas, readEntry } from './atlas.ts';
import { Plate, readPlate } from '../tools/plate.ts';
import { MODEL_DOCUMENT_FILE } from './model.ts';
import { readPngHeader } from './png.ts';
import { resolveWrittenPath } from './written_path.ts';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';

/**
 * A repack refused: an input it cannot lift exactly, a repack that lost
 * something, or an invocation that contradicts itself. `status` is the exit
 * code: 1 when a file was not what a repack needs (the invocation was fine),
 * 2 when the invocation has to change.
 */
export class RepackError extends Error {
  constructor(
    message: string,
    readonly status: 1 | 2 = 1,
  ) {
    super(message);
    this.name = 'RepackError';
  }
}

/** The `mkdtemp` prefix of a repack's work directory under `tmpdir()`. */
export const REPACK_WORK_PREFIX = 'rigc-repack-';

/** One `key: values` line, as `readEntry` reads it. */
interface Entry {
  key: string;
  values: string[];
}

/** One page's field lines and its regions' — the keys `parseAtlasText` drops included. */
interface PageFields {
  page: AtlasPage;
  fields: Entry[];
  regions: Array<{ raw: string; fields: Entry[] }>;
}

/**
 * Every page's and every region's field lines, walked the way `parseAtlasText`
 * walks them — from each page's name line, entries until one that is not, then
 * a region per name line until a blank line — with its `readEntry`. Held to
 * the parse: a page whose walked regions are not the parsed ones, by count and
 * raw name, is an internal error rather than a reading.
 */
function atlasFields(parsed: ParsedAtlas): PageFields[] {
  const { lines } = parsed;
  const at = (i: number): string | null => (i < lines.length ? lines[i] : null);
  return parsed.pages.map((page) => {
    let i = page.nameLine + 1;
    const fields: Entry[] = [];
    for (let e = readEntry(at(i)); e !== null; e = readEntry(at(++i))) fields.push(e);
    const regions: PageFields['regions'] = [];
    for (;;) {
      const line = at(i);
      if (line === null || line.trim().length === 0) break;
      const regionFields: Entry[] = [];
      for (let e = readEntry(at(++i)); e !== null; e = readEntry(at(++i))) regionFields.push(e);
      regions.push({ raw: line, fields: regionFields });
    }
    const walked = regions.map((r) => r.raw).join('\n');
    if (regions.length !== page.regions.length || walked !== page.regions.map((r) => r.name).join('\n')) {
      throw new Error(`internal: page "${page.name}" walked ${regions.length} region(s) and parsed ${page.regions.length}`);
    }
    return { page, fields, regions };
  });
}

/** What `writeAtlasText` states on every page, beside `size`: a page stating these and nothing else is one rigc's packer could have written. */
const PAGE_FIELDS_WRITTEN: Readonly<Record<string, string>> = { filter: 'Linear, Linear', pma: 'false' };

/** The region keys whose values are placement or the drawing's own size — the pack's to change. */
const REGION_PLACEMENT_KEYS = new Set(['bounds', 'xy', 'size', 'offsets', 'offset', 'orig', 'rotate']);

/** The `rotate:` values the format defines, and the reading `extractRegion` gives each. */
const ROTATE_VALUES = new Set(['true', 'false', '0', '90', '180', '270']);

/** Why a page field is refused, or null when the repacked atlas states the same thing. */
function pageFieldRefusal(page: AtlasPage, entry: Entry): string | null {
  const value = entry.values.join(', ');
  if (entry.key === 'size') return null;
  if (entry.key === 'scale') {
    return Number(entry.values[0]) === 1
      ? null
      : `page "${page.name}" states scale: ${value} — its texels are coarser than the drawings the skeleton sizes, and rigc's packer writes every page at scale 1, so the repacked atlas would state that they are not; the format's scale line has no spelling in a rigc pack`;
  }
  if (entry.key === 'pma') {
    return entry.values[0] === 'false'
      ? null
      : `page "${page.name}" states pma: ${value} — its texels are premultiplied by alpha, and rigc's packer writes pma: false, so the same bytes on a repacked page would be read as straight colour and blended differently`;
  }
  const written = PAGE_FIELDS_WRITTEN[entry.key];
  if (written !== undefined && written === value) return null;
  return written !== undefined
    ? `page "${page.name}" states ${entry.key}: ${value}, and rigc's packer writes ${entry.key}: ${written} — the repacked atlas would state another ${entry.key}`
    : `page "${page.name}" states ${entry.key}: ${value}, a line rigc's packer does not write — the repacked atlas would drop it`;
}

/** Why a region field is refused, or null when it is placement the pack owns. */
function regionFieldRefusal(page: AtlasPage, name: string, entry: Entry): string | null {
  const value = entry.values.join(', ');
  if (entry.key === 'rotate') {
    return ROTATE_VALUES.has(entry.values[0] ?? '')
      ? null
      : `region "${name}" on page "${page.name}" states rotate: ${value}, which is not one of true, false, 0, 90, 180, 270 — the turns the lift is measured at`;
  }
  if (REGION_PLACEMENT_KEYS.has(entry.key)) return null;
  if (entry.key === 'index') {
    return `region "${name}" on page "${page.name}" states index: ${value} — a frame of a numbered series, and rigc's packer writes no index line, so the repacked atlas would drop which frame it is`;
  }
  return `region "${name}" on page "${page.name}" states ${entry.key}: ${value}, a line rigc's packer does not write${entry.key === 'split' || entry.key === 'pad' ? ' (a nine-patch region)' : ''} — the repacked atlas would drop it`;
}

/**
 * Why a region name cannot be the file a lifted part is written to, or null.
 * The part is `<lift>/<name>.png`, which is the `image` `ingest --art loose`
 * names for the attachment that draws the region, so the name is a relative
 * path below the lift directory and nothing else.
 */
function nameRefusal(raw: string, page: AtlasPage): string | null {
  const name = raw.trim();
  if (raw !== name) return `region ${JSON.stringify(raw)} on page "${page.name}" carries whitespace around its name, which the runtime keeps and an attachment's path does not`;
  const segments = name.split('/');
  if (name.includes('\\') || name.startsWith('/') || segments.some((s) => s === '' || s === '.' || s === '..')) {
    return `region "${name}" on page "${page.name}" is not a relative file name below the lift directory (an empty, "." or ".." segment, a leading "/" or a "\\"), so its part has no file to be written to`;
  }
  return null;
}

/** Why a region's rectangle cannot be lifted off `plate` exactly, or null. */
function geometryRefusal(page: AtlasPage, region: AtlasRegion): string | null {
  const name = region.name.trim();
  const foot = pageFootprint(region);
  const where = `region "${name}" on page "${page.name}"`;
  if (region.width <= 0 || region.height <= 0) return `${where} keeps no texel: bounds ${region.width}x${region.height}`;
  if (region.x < 0 || region.y < 0 || region.x + foot.width > page.width || region.y + foot.height > page.height) {
    return (
      `${where} occupies ${foot.width}x${foot.height} at ${region.x},${region.y}, which leaves the ${page.width}x${page.height} page ` +
      `(right edge ${region.x + foot.width}, bottom edge ${region.y + foot.height}) — the lift would read texels the page does not have`
    );
  }
  if (region.offsetX < 0 || region.offsetY < 0 || region.offsetX + region.width > region.originalWidth || region.offsetY + region.height > region.originalHeight) {
    return (
      `${where} keeps ${region.width}x${region.height} at offset ${region.offsetX},${region.offsetY} of a ${region.originalWidth}x${region.originalHeight} drawing, ` +
      'which does not fit inside it — the lifted part would lose the texels that fall outside'
    );
  }
  return null;
}

/** A page of an input atlas: where its PNG is, and the texels — `null` where the refusal says why. */
export interface InputPage {
  page: AtlasPage;
  path: string;
  plate: Plate | null;
}

/**
 * Every reason this atlas cannot be lifted exactly, in file order — empty when
 * it can — and the pages it read. `atlasDir` is the directory page names
 * resolve against. Reads every page PNG once (a missing one is a refusal), so
 * the lift that follows reuses `pages`.
 */
export function atlasRefusals(parsed: ParsedAtlas, atlasDir: string): { refusals: string[]; pages: InputPage[] } {
  const refusals: string[] = [];
  if (parsed.regions.length === 0) refusals.push('the atlas names no region, so there is nothing to lift or pack');
  const pages: InputPage[] = [];
  const firstPage = new Map<string, string>();
  const folded = new Map<string, string>();
  for (const { page, fields, regions } of atlasFields(parsed)) {
    const path = resolveWrittenPath(atlasDir, page.name);
    let plate: Plate | null = null;
    if (!existsSync(path)) refusals.push(`page "${page.name}" is not on disk: nothing at ${path}`);
    else {
      plate = readPlate(path);
      if (plate.width !== page.width || plate.height !== page.height) {
        refusals.push(
          `page "${page.name}" declares size ${page.width}x${page.height} and ${path} is ${plate.width}x${plate.height} — ` +
            'the atlas addresses its regions on the declared grid, so the lift would read other texels',
        );
      }
    }
    pages.push({ page, path, plate });
    for (const entry of fields) {
      const why = pageFieldRefusal(page, entry);
      if (why !== null) refusals.push(why);
    }
    regions.forEach(({ raw, fields: regionFields }, k) => {
      const region = page.regions[k];
      const name = raw.trim();
      const unsafe = nameRefusal(raw, page);
      if (unsafe !== null) refusals.push(unsafe);
      const before = firstPage.get(name);
      if (before !== undefined) {
        refusals.push(`region "${name}" is named twice — on page "${before}" and on page "${page.name}" — so one part per name cannot carry both`);
      } else {
        firstPage.set(name, page.name);
        const lower = name.toLowerCase();
        const other = folded.get(lower);
        if (other !== undefined) {
          refusals.push(`regions "${other}" and "${name}" differ only in case, and a case-insensitive file system writes their two parts to one file`);
        } else folded.set(lower, name);
      }
      for (const entry of regionFields) {
        const why = regionFieldRefusal(page, name, entry);
        if (why !== null) refusals.push(why);
      }
      const geometry = geometryRefusal(page, region);
      if (geometry !== null) refusals.push(geometry);
    });
  }
  return { refusals, pages };
}

/**
 * The page lines `skeleton.model.json` states (issue #1339): `size` as the
 * page's `width`/`height`, `pma`, and `scale` as the number written
 * (`pagesOfAtlas`). `filter: Linear, Linear` is the one sampling the document
 * implies by leaving filters out — the core's draw is bilinear on every path
 * (`src/render.ts`'s header) — so a page stating it states nothing the document
 * drops.
 */
const PAGE_FIELDS_STATED = new Set(['size', 'pma', 'scale']);

/** The region lines the document states: placement, the drawing's own size and turn, and `index`. */
const REGION_FIELDS_STATED = new Set([...REGION_PLACEMENT_KEYS, 'index']);

/**
 * Every reason a model document cannot be written for this atlas AS IT STANDS
 * — `repack --keep-pages`, issue #1339 — in file order, empty when it can be.
 *
 * The question is not `atlasRefusals`' (can it be lifted and repacked?) but
 * whether the document's `pages` section can say everything the atlas says.
 * So a turned region, a trimmed region, a page `scale:`, `pma: true`, an
 * `index:` and a name the atlas spells twice are not refused here — the
 * document states each of them (`ModelPage`, `ModelPageRegion`) and the core
 * reads them (`./core/uvs.ts`); whether the skeleton still rebuilds byte for
 * byte against them is the command's check (b), not a guess made here. Every
 * line the document has no field for is refused naming its page or region: a
 * player reading only the document would draw without it. The page PNGs are
 * checked as `atlasRefusals` checks them — on disk, the size the atlas
 * declares, every rectangle on its page — because the document is written to
 * sit beside them; and a page name that is not a relative path below the
 * atlas's directory is refused, because the document's page names are paths
 * from the directory it sits in.
 *
 * ⚠️ What no refusal here can see is a texel. Nothing in the three files
 * records one — the atlas states rectangles, not contents — so a page edited
 * after it was packed is a page the atlas still describes, and the document
 * written beside it is the same bytes. That is a limit of the inputs, stated
 * rather than papered over.
 */
export function keptPageRefusals(parsed: ParsedAtlas, atlasDir: string): string[] {
  const refusals: string[] = [];
  if (parsed.regions.length === 0) refusals.push('the atlas names no region, so the document would state no placement');
  for (const { page, fields, regions } of atlasFields(parsed)) {
    const segments = page.name.split('/');
    if (page.name.includes('\\') || isAbsolute(page.name) || segments.some((s) => s === '' || s === '.' || s === '..')) {
      refusals.push(
        `page "${page.name}" is not a relative path below the atlas's directory (an empty, "." or ".." segment, a leading "/" or a "\\"), ` +
          `and ${MODEL_DOCUMENT_FILE}'s page names are paths from the directory it sits in`,
      );
    } else {
      const path = resolveWrittenPath(atlasDir, page.name);
      if (!existsSync(path)) refusals.push(`page "${page.name}" is not on disk: nothing at ${path}`);
      else {
        const header = readPngHeader(path);
        if (header.info === null) refusals.push(`page "${page.name}" cannot be read as PNG: ${header.problem}`);
        else if (header.info.width !== page.width || header.info.height !== page.height) {
          refusals.push(
            `page "${page.name}" declares size ${page.width}x${page.height} and ${path} is ${header.info.width}x${header.info.height} — ` +
              'the document would state the declared grid beside a page that is not on it',
          );
        }
      }
    }
    for (const entry of fields) {
      const value = entry.values.join(', ');
      if (PAGE_FIELDS_STATED.has(entry.key) || (entry.key === 'filter' && value === PAGE_FIELDS_WRITTEN.filter)) continue;
      refusals.push(
        entry.key === 'filter'
          ? `page "${page.name}" states filter: ${value} — ${MODEL_DOCUMENT_FILE} states no filter and the core samples every page bilinearly (filter: ${PAGE_FIELDS_WRITTEN.filter}), so a player reading the document would draw this page otherwise than the atlas asks`
          : `page "${page.name}" states ${entry.key}: ${value}, a line ${MODEL_DOCUMENT_FILE} has no field for — a player reading only the document would draw without it`,
      );
    }
    regions.forEach(({ raw, fields: regionFields }, k) => {
      const name = raw.trim();
      for (const entry of regionFields) {
        if (entry.key === 'rotate') {
          if (!ROTATE_VALUES.has(entry.values[0] ?? '')) {
            refusals.push(`region "${name}" on page "${page.name}" states rotate: ${entry.values.join(', ')}, which is not one of true, false, 0, 90, 180, 270 — the turns the document's degrees can state`);
          }
          continue;
        }
        if (REGION_FIELDS_STATED.has(entry.key)) continue;
        refusals.push(
          `region "${name}" on page "${page.name}" states ${entry.key}: ${entry.values.join(', ')}, a line ${MODEL_DOCUMENT_FILE} has no field for` +
            `${entry.key === 'split' || entry.key === 'pad' ? ' (a nine-patch region)' : ''} — a player reading only the document would draw without it`,
        );
      }
      const geometry = geometryRefusal(page, page.regions[k]);
      if (geometry !== null) refusals.push(geometry);
    });
  }
  return refusals;
}

/** Every region the atlas names, lifted, in file order, by its (trimmed) name. */
export interface Lift {
  parts: Map<string, Plate>;
  /** How many were turned on their page, and how many were trimmed of whitespace — what the command line says it read. */
  turned: number;
  trimmed: number;
}

/**
 * Lift every region off `pages` — `atlasRefusals`' pages, which it found
 * nothing wrong with — and, when `liftDir` is given, write each part to
 * `<liftDir>/<name>.png`. One `extractRegion` per region, and nothing else.
 */
export function liftAtlas(pages: readonly InputPage[], liftDir?: string): Lift {
  const parts = new Map<string, Plate>();
  let turned = 0;
  let trimmed = 0;
  for (const { page, plate } of pages) {
    if (plate === null) throw new Error(`internal: page "${page.name}" was lifted with no texels; atlasRefusals names it`);
    for (const region of page.regions) {
      const name = region.name.trim();
      const part = extractRegion(plate, region);
      parts.set(name, part);
      if (region.degrees !== 0) turned++;
      if (region.width !== region.originalWidth || region.height !== region.originalHeight) trimmed++;
      if (liftDir !== undefined) {
        const file = join(liftDir, `${name}.png`);
        mkdirSync(dirname(file), { recursive: true });
        part.writePng(file);
      }
    }
  }
  return { parts, turned, trimmed };
}

/**
 * The texels of a region a page keeps as that region's own, as a test over
 * the region's drawing (x right, y down from its top-left) — or `null` for
 * every texel of its rectangle. Under `--pack-shape polygon` a region only
 * meshes draw owns its footprint (the mesh's hull and triangles, dilated by
 * the padding) and a neighbour may sit in the rest of its rectangle by design;
 * every other region owns its rectangle.
 */
export type OwnedTexels = (region: string) => ((x: number, y: number) => boolean) | null;

/**
 * The owned texels of a `polygon` pack, by the packer's own two functions:
 * `packFootprints` over the skeleton the pack was made for, and `footprintCell`
 * at the pack's padding — the set `packAtlas` wrote each region's values into
 * last (`extrudeOwned`), so nothing else on the page is that region's.
 */
export function polygonOwnedTexels(skeletonText: string, parts: ReadonlyMap<string, Plate>, padding: number): OwnedTexels {
  const footprints = packFootprints(skeletonText, (region) => {
    const part = parts.get(region);
    return part === undefined ? undefined : { width: part.width, height: part.height };
  });
  return (region) => {
    const footprint = footprints.get(region);
    const part = parts.get(region);
    if (footprint === undefined || footprint === null || part === undefined) return null;
    const cell = footprintCell(part.width, part.height, padding, footprint);
    if (cell.whole) return null;
    return (x, y) => cell.mask[(y + padding) * cell.width + (x + padding)] === 1;
  };
}

/**
 * Every region of `before` against the region of the same name in `after`,
 * over the texels `owned` says the new page keeps as its own (every texel when
 * it is not given): the count of identical ones, how many were compared over
 * a footprint rather than the whole rectangle, and every difference — a name
 * one side lacks, another size, or the first texel apart with both values —
 * in `before`'s order.
 */
export function regionDifferences(
  before: ReadonlyMap<string, Plate>,
  after: ReadonlyMap<string, Plate>,
  owned?: OwnedTexels,
): { identical: number; byFootprint: number; differences: string[] } {
  const differences: string[] = [];
  let identical = 0;
  let byFootprint = 0;
  for (const [name, old] of before) {
    const next = after.get(name);
    if (next === undefined) {
      differences.push(
        `region "${name}" is not in the repacked atlas — a rebuild packs the regions this skeleton's attachments draw and no other, so a region ` +
          'nothing here draws (an atlas several skeletons share, a leftover) does not come back',
      );
      continue;
    }
    if (old.width !== next.width || old.height !== next.height) {
      differences.push(`region "${name}" lifts ${old.width}x${old.height} off the input's pages and ${next.width}x${next.height} off the repacked ones`);
      continue;
    }
    const own = owned?.(name) ?? null;
    if (own !== null) byFootprint++;
    const at = firstTexelApart(old, next, own);
    if (at === null) {
      identical++;
      continue;
    }
    const [x, y] = at;
    differences.push(
      `region "${name}": texel ${x},${y}${own === null ? '' : ' (inside the footprint it owns)'} is ${old.get(x, y).join(',')} off the input's pages and ${next.get(x, y).join(',')} off the repacked ones`,
    );
  }
  for (const name of after.keys()) if (!before.has(name)) differences.push(`region "${name}" is in the repacked atlas and not in the input's`);
  return { identical, byFootprint, differences };
}

/** The first texel (x, y) at which two plates of one size differ, in row order, among those `own` keeps (all, when null), or null. */
function firstTexelApart(a: Plate, b: Plate, own: ((x: number, y: number) => boolean) | null): [number, number] | null {
  for (let i = 0; i < a.data.length; i++) {
    if (a.data[i] !== b.data[i]) {
      const texel = Math.floor(i / 4);
      const x = texel % a.width;
      const y = Math.floor(texel / a.width);
      if (own === null || own(x, y)) return [x, y];
    }
  }
  return null;
}

/** A JSON path as the skeleton spells it: `skeleton.x`, `bones[3].rotation`, `skins[0].attachments["a b"]`. */
function pathOf(parent: string, key: string | number): string {
  if (typeof key === 'number') return `${parent}[${key}]`;
  const plain = /^[A-Za-z_$][\w$-]*$/.test(key);
  return parent === '' ? (plain ? key : `[${JSON.stringify(key)}]`) : plain ? `${parent}.${key}` : `${parent}[${JSON.stringify(key)}]`;
}

/** A value for a difference line, short. */
function shown(value: unknown): string {
  const text = JSON.stringify(value);
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

/**
 * Where two parsed skeletons differ, as `path: X in the input, Y in the
 * rebuild` lines — at most `limit` of them, and the total. Objects by key
 * (a key one side lacks is a difference, and so is the same keys in another
 * order, because the order is in the bytes), arrays by index, numbers and
 * strings by value.
 */
export function skeletonDifferences(input: unknown, rebuilt: unknown, limit: number): { total: number; lines: string[] } {
  const lines: string[] = [];
  let total = 0;
  const note = (line: string): void => {
    total++;
    if (lines.length < limit) lines.push(line);
  };
  const walk = (a: unknown, b: unknown, path: string): void => {
    const at = path === '' ? 'the top level' : path;
    if (Array.isArray(a) && Array.isArray(b)) {
      for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if (i >= a.length) note(`${pathOf(path, i)}: absent from the input, ${shown(b[i])} in the rebuild`);
        else if (i >= b.length) note(`${pathOf(path, i)}: ${shown(a[i])} in the input, absent from the rebuild`);
        else walk(a[i], b[i], pathOf(path, i));
      }
      return;
    }
    if (isObject(a) && isObject(b)) {
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);
      for (const key of keysA) {
        if (!(key in b)) note(`${pathOf(path, key)}: ${shown(a[key])} in the input, absent from the rebuild`);
        else walk(a[key], b[key], pathOf(path, key));
      }
      for (const key of keysB) if (!(key in a)) note(`${pathOf(path, key)}: absent from the input, ${shown(b[key])} in the rebuild`);
      const shared = keysA.filter((k) => k in b);
      const sharedB = keysB.filter((k) => k in a);
      if (shared.join('\n') !== sharedB.join('\n')) note(`${at}: keys in the order ${shown(shared)} in the input and ${shown(sharedB)} in the rebuild`);
      return;
    }
    if (!Object.is(a, b) && JSON.stringify(a) !== JSON.stringify(b)) note(`${at}: ${shown(a)} in the input, ${shown(b)} in the rebuild`);
  };
  walk(input, rebuilt, '');
  return { total, lines };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** The first line two texts differ on, 1-based, with both lines — for two skeletons whose values agree and whose bytes do not. */
export function firstLineApart(a: string, b: string): string {
  const la = a.split('\n');
  const lb = b.split('\n');
  for (let i = 0; i < Math.max(la.length, lb.length); i++) {
    if (la[i] !== lb[i]) return `line ${i + 1}: ${shown(la[i] ?? '(end of file)')} in the input, ${shown(lb[i] ?? '(end of file)')} in the rebuild`;
  }
  return 'no line differs';
}

/** The region fields the model document's `pages` and the parsed atlas both state, compared one by one. */
const DOCUMENT_REGION_FIELDS = ['x', 'y', 'width', 'height', 'offsetX', 'offsetY', 'originalWidth', 'originalHeight', 'degrees'] as const;

/**
 * Where the atlas disagrees with the `pages` of the model document `build`
 * wrote beside it — the record of where each region was placed, written with
 * the pair and only after the same gate. `null` when the document states no
 * `pages` array; otherwise the regions compared and every disagreement.
 */
export function documentDisagreements(pagesValue: unknown, parsed: ParsedAtlas): { regions: number; lines: string[] } | null {
  if (!Array.isArray(pagesValue)) return null;
  const lines: string[] = [];
  let regions = 0;
  if (pagesValue.length !== parsed.pages.length) lines.push(`the document states ${pagesValue.length} page(s) and the atlas ${parsed.pages.length}`);
  parsed.pages.forEach((page, p) => {
    const docPage: unknown = pagesValue[p];
    if (!isObject(docPage)) return;
    if (docPage.name !== page.name) lines.push(`page ${p + 1} is "${page.name}" in the atlas and ${shown(docPage.name)} in the document`);
    for (const key of ['width', 'height'] as const) {
      if (docPage[key] !== page[key]) lines.push(`page "${page.name}" ${key}: ${page[key]} in the atlas, ${shown(docPage[key])} in the document`);
    }
    const docRegions = Array.isArray(docPage.regions) ? docPage.regions : [];
    if (docRegions.length !== page.regions.length) lines.push(`page "${page.name}" holds ${page.regions.length} region(s) in the atlas and ${docRegions.length} in the document`);
    page.regions.forEach((region, k) => {
      const docRegion: unknown = docRegions[k];
      if (!isObject(docRegion)) return;
      regions++;
      const name = region.name.trim();
      if (typeof docRegion.name !== 'string' || docRegion.name.trim() !== name) {
        lines.push(`page "${page.name}" region ${k + 1} is "${name}" in the atlas and ${shown(docRegion.name)} in the document`);
        return;
      }
      for (const field of DOCUMENT_REGION_FIELDS) {
        if (docRegion[field] !== region[field]) lines.push(`region "${name}" ${field}: ${region[field]} in the atlas, ${shown(docRegion[field])} in the document`);
      }
    });
  });
  return { regions, lines };
}
