/**
 * The atlas as a data structure: read one, pack one, write one.
 *
 * Until issue #4 rigc had exactly one atlas shape — one part, one page, region
 * covers the page — and one function that wrote it (`buildAtlasText` in
 * [`src/compile.ts`](compile.ts)). That is why the npm keyword `atlas` set an
 * expectation the tool did not meet: nine loose PNGs compiled to `pages=9
 * regions=9`, which is correct, valid, and not what anybody means by an atlas.
 *
 * This module holds the three pieces that were missing, and nothing else:
 *
 *   * `parseAtlasText` — the format read back in, so an atlas somebody else
 *     packed can be an INPUT (`build --atlas-in`);
 *   * `packAtlas` — loose part PNGs arranged onto shared pages (`build --pack`);
 *   * `writeAtlasText` — the one emitter for both shapes, so the unpacked
 *     default and a packed page are written by the same code.
 *
 * ## 🚨 Two invariants this file exists to keep
 *
 * **Packing is an OUTPUT arrangement, never an input contract.** Sizes are still
 * measured from the loose PNGs by `readPngInfo` before anything here runs, the
 * skeleton is compiled from those measurements, and `--pack` changes only where
 * the bytes sit on a page. A packed build's `skeleton.json` is byte-identical to
 * the unpacked one's — that is a property of this split, and the selftest
 * asserts it rather than trusting it.
 *
 * **A packed region is a lossless copy.** Nothing here resamples, scales, trims
 * or rotates: a region's pixels are written to the page unchanged, and the
 * selftest lifts every region back off its page and compares it byte for byte
 * against the loose PNG (`PK02`). See `extrudeCell` for the one thing that has to
 * be ADDED to the page for the render to agree as well, and `PACK_NO_ROTATE` for
 * the field this deliberately does not use.
 *
 * Under `shape: 'polygon'` (issue #1099) the copy is lossless where a region
 * can be SAMPLED: two rectangles may overlap where neither region draws, so a
 * mesh region's rectangle outside its hull may carry a neighbour's texels, and
 * the claim the selftest holds there is that every texel within a tap of what
 * a region draws is its own (`PK79`). See `packAtlas`, *`shape: 'polygon'`*.
 *
 * ⚠️ **The rendered pictures are equal to within one least significant bit, not
 * bit-for-bit, and the difference is arithmetic rather than texels.** Measured: 0
 * to 480 channel samples of 7 to 21 million on the three public fixtures, worst
 * difference **1**, against 22,000 to 60,000 samples and a worst difference of
 * **77** when the gutter is removed — and byte-identical on eleven of the
 * repository's thirteen rigs across 1,101 frames. The two that are not are the
 * two with meshes.
 *
 * 🔬 **Where that last bit is lost, measured (issue #266, follow-up 1).** This
 * paragraph used to say the cause was rigc's own sampling coordinate — `fl(regionX
 * + fl(s · width))` failing to be exact once `regionX > 0` — and that the repair
 * was to sample in region-local coordinates and add the integer page origin to the
 * tap indices. **Both halves are wrong, and the second is unreachable.** Poses of
 * the loose and the packed build of one skeleton, compared coordinate by
 * coordinate as `u · pageWidth − regionX` against the loose `u · pageWidth`:
 *
 *   * on every **region** attachment the difference is **exactly 0**. `regionX`,
 *     `regionWidth` and `pageWidth` are integers and the page is a power of two,
 *     so `u · pageWidth` recovers `regionX + localTexel` with nothing lost —
 *     which is why the eleven region-only rigs are already byte-identical, and
 *     why `PK18` can assert exactness rather than a bound. That holds for the
 *     default power-of-two page only: `pageEdges: 'free'` gives it up, and the
 *     region attachments of a free page sit at the mesh's bound of 1 (`PK72`,
 *     and `packAtlas`, *free*);
 *   * on a **mesh** it is **not** 0 — 88 of 88 coordinates on `gallery/squash`'s
 *     ball, worst 3.15e-5 texels — because `spine-core` stores mesh page UVs in a
 *     **`Float32Array`**. `MeshAttachment.updateRegion` computes `u +
 *     regionUVs[i] · width` and rounds the whole thing to float32, so the low bits
 *     of the scaled coordinate are gone **before rigc reads the array**. The
 *     counterfactual settles which term does it: the same region at page origin
 *     `x = 0` still lands 9.5e-7 texels off the loose value, so it is the `f32(u ·
 *     regionWidth / pageWidth)` scaling and not the origin addition.
 *
 * ⇒ **No change to [`src/render.ts`](render.ts) can recover it**, because it reads
 * `piece.uvs` and the information is not in there. The only routes are for rigc to
 * re-derive mesh page UVs from `MeshAttachment.regionUVs` in double precision —
 * a second opinion about the runtime's own trim and rotation mapping, which
 * `src/render.ts` refuses by name (see `artUvsOf`) — or one part per page, which
 * is the unpacked convention. And the first would be worse than the residual: the
 * renderer is the yardstick `check` measures a candidate against *because* it
 * draws what a runtime draws, and a runtime playing this atlas gets the float32
 * numbers. Making two rigc renders agree by disagreeing with the runtime is the
 * wrong trade. So the bound stays a bound, `PK18` attributes it, and the follow-up
 * is closed as measured rather than done.
 *
 * ## Why a second parser for a format `spine-core` already parses
 *
 * `src/compile.ts` must stay independent of the runtime — that is what keeps the
 * compiler and the gate from checking each other's assumptions — so the importer
 * cannot reach for `TextureAtlas`. The reader below therefore states, for every
 * field the format has, what the runtime reads it as — the page and region
 * fields of `dist/TextureAtlas.js` — including the readings that look like
 * mistakes and are not: the page name is trimmed and a region name is the RAW
 * line, a blank line closes a page block, an entry holds at most four values,
 * and `originalWidth/Height` fall back to `width/height` only when BOTH are
 * zero.
 *
 * A second opinion about a format is a liability, so it is measured rather than
 * asserted: `PKR01` parses every `.atlas` in the example corpus with both this
 * reader and `spine-core`'s `TextureAtlas` and compares every page's name, size
 * and `pma` and every region's eleven fields — 10 atlas files, 132 regions, 3
 * of them rotated, 0 fields apart when this was written (issue #1015). If they
 * ever disagree, that control goes red and this file is wrong.
 */
import { CompileError } from './errors.ts';
import { Plate, readPlate } from '../tools/plate.ts';

// ---------------------------------------------------------------------------
// reading
// ---------------------------------------------------------------------------

/** One region of a parsed atlas, in `TextureAtlasRegion`'s own field names. */
export interface AtlasRegion {
  /**
   * The region's name, exactly as `TextureAtlas` takes it: the raw line,
   * UNTRIMMED. Every consumer that joins on a name has to trim it itself, and
   * `regionKey` in [`src/render.ts`](render.ts) is the precedent — a file
   * written with CRLF would otherwise name different regions from the same text.
   */
  name: string;
  /** Page-space left edge of the packed rectangle, x right from the page's left. */
  x: number;
  /** Page-space top edge, y DOWN from the page's top. */
  y: number;
  /**
   * The kept rectangle's width, in the DRAWING's orientation.
   *
   * ⚠️ Not the page footprint. At `rotate: 90` / `270` the rectangle on the page
   * is `height x width`; `TextureAtlas` transposes for `u2/v2` at 90 and not at
   * 270, which is a bug in the runtime and the reason every reader here derives
   * the rectangle rather than reading those two numbers. `pageFootprint` below
   * is that derivation, spelled once. This field is the atlas's own meaning of
   * `bounds`, untouched.
   */
  width: number;
  height: number;
  /** Trim offset from the drawing's LEFT edge. */
  offsetX: number;
  /** Trim offset from the drawing's BOTTOM edge — art space runs the other way. */
  offsetY: number;
  /** The untrimmed drawing's size: what an attachment's width/height means. */
  originalWidth: number;
  originalHeight: number;
  /** 0, 90, 180 or 270. A `rotate: true` line reads as 90, which is the format's older spelling. */
  degrees: number;
  /** Sequence index, or 0 for a region that is not part of one. */
  index: number;
}

/** One page of a parsed atlas, with the regions that sit on it. */
export interface AtlasPage {
  /** The page name, trimmed — the image path as seen from the atlas file. */
  name: string;
  /** Index into the text's line array of the line the name was read from. */
  nameLine: number;
  width: number;
  height: number;
  pma: boolean;
  /**
   * The page's `scale:` line — how much SMALLER these texels are than the
   * drawings they were packed from — or `1` when the page declares none.
   *
   * ⚠️ The second field on this interface that `TextureAtlas` does not have, and
   * for the same kind of reason as `nameLine`: the runtime drops `scale:` because
   * an attachment's size comes out of the skeleton JSON (`region.width =
   * map.width * scale` in `SkeletonJson`, no atlas involved), so a player never
   * needs it. An IMPORTER does. `--atlas-in` derives an attachment's size from
   * the region when the rig spec declares none, and the region's
   * `originalWidth/Height` are in the page's own texels — at `scale: 0.5` they
   * are half the drawing. Reading the line here is what lets the importer state
   * the drawing's size instead of the pack's (issue #267); dropping it is what
   * made an imported `scale: 0.5` pack halve every attachment in silence.
   *
   * `atlasScales` in [`src/render.ts`](render.ts) reads the same field off the
   * raw text for the MAE report, and the selftest holds the two readers to the
   * same answer on every corpus atlas.
   */
  scale: number;
  regions: AtlasRegion[];
}

export interface ParsedAtlas {
  pages: AtlasPage[];
  /** Every region on every page, in file order — `TextureAtlas.regions`'s order. */
  regions: AtlasRegion[];
  /** The text split the way `TextureAtlas` splits it, for `rewritePageNames`. */
  lines: string[];
}

/**
 * The rectangle a region occupies **on its page** — which is not the rectangle
 * its `bounds:` line states.
 *
 * `bounds:` is the kept rectangle in the DRAWING's orientation, so a packer that
 * turned the drawing a quarter turn to fit it wrote `width x height` for a
 * region that covers `height x width` of the page. 180 turns nothing: the
 * footprint is the drawing's own way round at 0 and at 180, and transposed at 90
 * and at 270.
 *
 * ## Why this is one function and was four (issue #579)
 *
 * Four readers in this tree want exactly this rectangle — `windowOf` in
 * [`src/render.ts`](render.ts) fences a substituted piece with it,
 * `resolveFromAtlas` in [`src/compile.ts`](compile.ts) refuses a region that
 * runs off its page by it, and `A06` and `A19` in [`src/validate.ts`](validate.ts)
 * measure a shared page's tiling and open one region's own texels with it — and
 * two of the four transposed at 90 **only**, under a comment that read *"spine-core
 * transposes a region's extent at 90 and not at 270 when it derives the UVs, so
 * the rectangle ON THE PAGE follows the same rule"*.
 *
 * The premise is true and the conclusion does not follow, because the two are
 * different quantities:
 *
 *   * what `TextureAtlas` transposes at 90 and not at 270 is `u2`/`v2`
 *     (spine-core 4.3.13, `dist/TextureAtlas.js:162-171`) — so at 270 those two
 *     numbers do describe a rectangle the page does not have;
 *   * but `MeshAttachment.computeUVs` (`dist/attachments/MeshAttachment.js:118-162`)
 *     never reads `u2`/`v2` for an atlas region. It branches on `degrees` and
 *     derives the span from `originalWidth`/`originalHeight`, transposed at 90
 *     **and** at 270 alike. That is the routine that says where a region's texels
 *     are, and `extractRegion` below is its inverse.
 *
 * ⚠️ The consequence was not confined to a printed number, which is what the
 * card assumed. A19 opens a shared page and scans one region's own rectangle for
 * a transparent texel: at 270 it scanned `width x height` where the drawing
 * occupies `height x width`, ran off the part into the transparent gutter, found
 * its texel there and **named nothing**. Two fully opaque parts on one turned
 * page — the exact defect A19 exists for — were measured green at `rotate: 270`
 * and red at 0, 90 and 180.
 *
 * Structurally typed rather than taking `AtlasRegion`, because two of the four
 * callers hold spine-core's `TextureAtlasRegion` instead and this file
 * deliberately does not link the runtime.
 */
export function pageFootprint(region: { width: number; height: number; degrees: number }): {
  width: number;
  height: number;
} {
  const turned = region.degrees === 90 || region.degrees === 270;
  return turned
    ? { width: region.height, height: region.width }
    : { width: region.width, height: region.height };
}

/**
 * `TextureAtlasReader.readEntry`, to the value.
 *
 * Returns the number of values, 0 when the line is blank or carries no colon —
 * which is the signal the caller uses to decide "this is a name line, not a
 * field". Four values maximum, because that is where the runtime stops (`if (i
 * === 4) return 4`) and a fifth would silently mean something here that it does
 * not mean there.
 *
 * Exported for `src/repack.ts` (issue #1169), which reads the keys a page and a
 * region state — the ones this parser drops (`filter`, `format`, `repeat`,
 * `split`, `pad`) included — with this function rather than a second spelling
 * of the format, and holds what it walked to `parseAtlasText`'s regions.
 */
export function readEntry(line: string | null): { key: string; values: string[] } | null {
  if (line === null) return null;
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;
  const colon = trimmed.indexOf(':');
  if (colon === -1) return null;
  const key = trimmed.slice(0, colon).trim();
  const values: string[] = [];
  let lastMatch = colon + 1;
  for (;;) {
    const comma = trimmed.indexOf(',', lastMatch);
    if (comma === -1) {
      values.push(trimmed.slice(lastMatch).trim());
      break;
    }
    values.push(trimmed.slice(lastMatch, comma).trim());
    lastMatch = comma + 1;
    if (values.length === 4) break;
  }
  return { key, values };
}

/** `parseInt` with the runtime's own tolerance: a bad number reads as NaN there too. */
function int(text: string | undefined): number {
  return parseInt(text ?? '', 10);
}

/**
 * Read an atlas file's text into pages and regions.
 *
 * The format as the runtime reads it, field for field, and deliberately a dull
 * reader — every branch below states a reading `PKR01` holds against
 * `TextureAtlas`'s parse of the corpus (see the header). Two additions, both of
 * them fields a PLAYER has no use for and an IMPORTER does: `nameLine`, which
 * `rewritePageNames` needs, and the page's `scale:`, which is what turns a
 * region's texels back into the drawing's own size (`AtlasPage.scale`).
 */
export function parseAtlasText(text: string): ParsedAtlas {
  const lines = text.split(/\r\n|\r|\n/);
  let at = 0;
  const readLine = (): string | null => (at >= lines.length ? null : lines[at++]);

  const pages: AtlasPage[] = [];
  const regions: AtlasRegion[] = [];

  let line = readLine();
  // Ignore empty lines before the first entry.
  while (line !== null && line.trim().length === 0) line = readLine();
  // Header entries, which the runtime silently ignores. A first line with no
  // colon IS the first page name and ends this loop without being consumed.
  while (line !== null && line.trim().length > 0 && readEntry(line) !== null) line = readLine();

  let page: AtlasPage | null = null;
  for (;;) {
    if (line === null) break;
    if (line.trim().length === 0) {
      page = null;
      line = readLine();
      continue;
    }
    if (!page) {
      page = { name: line.trim(), nameLine: at - 1, width: 0, height: 0, pma: false, scale: 1, regions: [] };
      for (;;) {
        line = readLine();
        const entry = readEntry(line);
        if (entry === null) break;
        if (entry.key === 'size') {
          page.width = int(entry.values[0]);
          page.height = int(entry.values[1]);
        } else if (entry.key === 'pma') {
          page.pma = entry.values[0] === 'true';
        } else if (entry.key === 'scale') {
          // The one key this reader takes that the runtime's `pageFields` does
          // not — see `AtlasPage.scale`. A value that is not a positive finite
          // number leaves the default of 1 rather than poisoning every size
          // derived from it: `scale: 0` would divide the pack into infinity, and
          // a page whose own scale line is unreadable is a page whose texels are
          // the only measurement left.
          const value = Number(entry.values[0]);
          if (Number.isFinite(value) && value > 0) page.scale = value;
        }
        // `format`, `filter` and `repeat` are read by the runtime into fields no
        // consumer here has; they pass through `rewritePageNames` untouched.
      }
      pages.push(page);
      continue;
    }
    const region: AtlasRegion = {
      name: line,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      offsetX: 0,
      offsetY: 0,
      originalWidth: 0,
      originalHeight: 0,
      degrees: 0,
      index: 0,
    };
    for (;;) {
      line = readLine();
      const entry = readEntry(line);
      if (entry === null) break;
      switch (entry.key) {
        case 'xy':
          region.x = int(entry.values[0]);
          region.y = int(entry.values[1]);
          break;
        case 'size':
          region.width = int(entry.values[0]);
          region.height = int(entry.values[1]);
          break;
        case 'bounds':
          region.x = int(entry.values[0]);
          region.y = int(entry.values[1]);
          region.width = int(entry.values[2]);
          region.height = int(entry.values[3]);
          break;
        case 'offset':
          region.offsetX = int(entry.values[0]);
          region.offsetY = int(entry.values[1]);
          break;
        case 'orig':
          region.originalWidth = int(entry.values[0]);
          region.originalHeight = int(entry.values[1]);
          break;
        case 'offsets':
          region.offsetX = int(entry.values[0]);
          region.offsetY = int(entry.values[1]);
          region.originalWidth = int(entry.values[2]);
          region.originalHeight = int(entry.values[3]);
          break;
        case 'rotate':
          if (entry.values[0] === 'true') region.degrees = 90;
          else if (entry.values[0] !== 'false') region.degrees = int(entry.values[0]);
          break;
        case 'index':
          region.index = int(entry.values[0]);
          break;
        default:
          break; // an unknown field becomes names/values in the runtime; nothing here reads them
      }
    }
    // BOTH zero, not either: a region 40 wide and 0 tall keeps its declared zero.
    if (region.originalWidth === 0 && region.originalHeight === 0) {
      region.originalWidth = region.width;
      region.originalHeight = region.height;
    }
    page.regions.push(region);
    regions.push(region);
  }

  return { pages, regions, lines };
}

/**
 * The region an attachment draws under a name, and the page it sits on —
 * `TextureAtlas.findRegion` and `region.page`, as the loader resolves a
 * region, a mesh and each frame of a series (issue #967).
 *
 * The FIRST region of that name in file order: an atlas naming two regions
 * alike draws the first (measured through spine-core 4.3.13's loader, whose
 * attachment drew the first of two regions named `seq`, and whose `index:`
 * lines did not enter the lookup — a series' frame is found by its NAME,
 * `frameRegionName` in [`src/core/uvs.ts`](core/uvs.ts)). The name is matched
 * exactly as `parseAtlasText` keeps it, the raw line: a region line `art `
 * is not found as `art`, as the runtime does not find it.
 *
 * Returned as a function over the parsed atlas so the core — which reads no
 * file and links nothing — takes it as an input (`UvLookup`); the page UVs
 * themselves are the core's (`regionPageUvs`, `computeUvs`), measured there.
 */
export function atlasRegionLookup(parsed: ParsedAtlas): (name: string) => { page: AtlasPage; region: AtlasRegion } | null {
  const first = new Map<string, { page: AtlasPage; region: AtlasRegion }>();
  for (const page of parsed.pages) {
    for (const region of page.regions) if (!first.has(region.name)) first.set(region.name, { page, region });
  }
  return (name) => first.get(name) ?? null;
}

/**
 * The same atlas text with every page's name line replaced.
 *
 * This is how `--atlas-in` emits: the imported atlas passes through verbatim —
 * every field, every region, every page, in its own order — and only the page
 * NAMES move, because they are paths and the file has been re-anchored to a new
 * directory. Its blank lines are then put in rigc's own shape by
 * `canonicalAtlasShape` (issue #803); this function leaves them as they were. Rewriting by line index rather than by
 * re-serialising is the point: a re-serialiser would have to understand every
 * field it re-emits, and the ones it did not understand would quietly vanish
 * (`scale:` is the expensive example — [`atlasScales`](render.ts) reports it, and
 * a pack that is coarser than its drawings would stop saying so).
 *
 * `rename` is handed the page's INDEX as well as its name, because a name is not
 * a key: nothing in the format forbids two pages spelling the same path, and a
 * caller that has already decided one new name per page (`copyAtlasPages` in
 * [`emit.ts`](emit.ts) assigns the copies' filenames in page order) would then
 * hand both of them the first decision. The index is the page's identity here;
 * the name is data.
 */
export function rewritePageNames(parsed: ParsedAtlas, rename: (name: string, index: number) => string): string {
  const out = parsed.lines.slice();
  parsed.pages.forEach((page, index) => {
    out[page.nameLine] = rename(page.name, index);
  });
  return out.join('\n');
}

/**
 * The same atlas text in the whitespace shape `writeAtlasText` writes: no blank
 * line before the first entry, exactly one between two blocks, none after the
 * last, and one trailing newline. Every non-blank line is kept byte for byte and
 * in its own order — only blank lines are dropped or collapsed — so a text
 * already in that shape comes back unchanged.
 *
 * This is what `--atlas-in` re-emits (issue #803). A pack's blank lines are its
 * packer's, not its content: a 3.8-era packer begins every file with one, and
 * `A07_ATLAS_TEXT_SHAPE` — which checks the text rigc writes — refuses a blank
 * line before the first page block, two side by side, and one after the last
 * page block, each by its own sentence. What makes dropping them safe is what
 * they mean to the reader that owns the format: in `TextureAtlas` a run of
 * blank lines ends a page block exactly as one blank line does, and a run before
 * the first page is read as nothing. Measured through the runtime, `"\n" + text`, `"\n\n" + text`
 * and `text` load to the same pages and regions (`PKR63`, `PKR64`).
 *
 * ⚠️ One reading is NOT the same, and it moves toward rigc's: the runtime's
 * leading-blank loop (`while (line && …)`) stops on an empty string, so a file
 * that opens `"\n"` and then a header entry (`key: value` before the first page
 * name) reads the header as a page name there, while `parseAtlasText` — which the
 * compile took its geometry from — skips the blank and reads it as a header.
 * Emitting without the blank makes the file say to the runtime what rigc measured.
 *
 * A blank line is one the runtime reads as blank: `trim()` is empty. One that
 * carries only spaces is written as the empty line, because that is the blank
 * line's one spelling in `writeAtlasText`.
 */
export function canonicalAtlasShape(text: string): string {
  const out: string[] = [];
  for (const line of text.split(/\r\n|\r|\n/)) {
    if (line.trim().length > 0) out.push(line);
    else if (out.length > 0 && out[out.length - 1] !== '') out.push('');
  }
  while (out.length > 0 && out[out.length - 1] === '') out.pop();
  return out.length === 0 ? '' : `${out.join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// writing
// ---------------------------------------------------------------------------

/** A region as the emitter states it: everything `writeAtlasText` puts on the page. */
export interface EmitRegion {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  originalWidth: number;
  originalHeight: number;
}

export interface EmitPage {
  name: string;
  width: number;
  height: number;
  regions: EmitRegion[];
}

/**
 * ⛔ The packer never rotates, so `rotate: 0` is a fact rather than a field.
 *
 * The format supports `rotate: 90` and the Spine packer uses it — every official
 * example that has a tall thin part ships one. rigc's does not, for reasons that
 * are about honesty rather than difficulty:
 *
 *   * `artUvsOf` ([`src/render.ts`](render.ts)) already refuses a rotated region,
 *     because `RegionAttachment.computeUVs` assigns a different corner order at
 *     90° and `TextureAtlas` transposes `u2/v2` at 90 and not at 270. A packer
 *     that emitted rotation would be writing atlases its own `--atlas`
 *     substitution cannot read;
 *   * the whole feature is gated on how closely the packed render matches the
 *     unpacked one, and a transposed region is sampled through a different
 *     mapping — the gate would then be measuring the mapping rather than the pack.
 *
 * Rotation buys page area on a set of parts whose aspect ratios differ a lot. It
 * is not free and it is not implemented; a page that runs out of room spills to a
 * second page instead.
 *
 * 🔬 **Measured for issue #860, and held back on the measurement.** A pack that
 * turned regions `rotate: 90` lifted every one of them back byte for byte through
 * `extractRegion` (22 of 22 and 20 of 20 on two painting rigs, 12 turned on each),
 * and rigc's renderer drew the turned region attachments with 0 differing pixels
 * against the unturned pack. But on neither rig did a turn shrink the page: both
 * were already on the smallest power-of-two page their area allows, and a turn
 * that buys no area only moves bytes. Shipping it would also need two clauses
 * changed that say rigc never turns a region — `A06`'s under `rig-play`
 * ([`src/validate.ts`](validate.ts)) and `artUvsOf`
 * ([`src/render.ts`](render.ts)), which returns no art UVs for a turned region
 * attachment, so `check`'s texture substitution would report it unmatched.
 *
 * 📏 **Measured again for issue #866, on twelve region sets, and held back again.**
 * The sets are the two painting rigs above and ten production rigs of 20 to 22
 * parts. Each was packed by this file's own search at padding 2 twice: as
 * shipped, and with every cell also tried turned under the same BSSF score
 * (ties go to the unturned cell). The shipped search reproduced the page every
 * one of the twelve atlases was written at. Area change from turning:
 *
 *   | set | `pot` | `pot` + turn | `free` | `free` + turn |
 *   | --- | --- | --- | --- | --- |
 *   | 22-part painting | 1024x2048 | 0.00 % | 1888x697 | −1.14 % |
 *   | 20-part painting | 512x2048 | 0.00 % | 480x1166 | +2.31 % |
 *   | P1 | 512x2048 | 0.00 % | 416x1633 | +1.43 % |
 *   | P2 | 1024x1024 | 0.00 % | 1184x810 | +0.70 % |
 *   | P3 | 512x1024 | 0.00 % | 480x1000 | +2.96 % |
 *   | P4 | 1024x2048 | 0.00 % | 864x1346 | −6.16 % |
 *   | P5 | 2048x2048 | 0.00 % | 1344x1768 | −13.37 % |
 *   | P6 | 1024x2048 | 0.00 % | 800x1934 | −1.62 % |
 *   | P7 | 512x2048 | 0.00 % | 1024x928 | −0.05 % |
 *   | P8 | 512x2048 | 0.00 % | 608x1250 | −4.96 % |
 *   | P9 | 1024x2048 | +100.00 % | 1024x2037 | +6.51 % |
 *   | P10 | 512x2048 | 0.00 % | 352x1433 | +0.70 % |
 *
 * Under `pot` a turn shrank no page on any set, and on P9 an ungated one doubled
 * it. Under `free` the largest gain, P5's 13.37 %, is inside the search's own
 * noise: the nearest other width on the 32-px grid the search then used moves
 * P5's unturned page by 18.13 %, and searching every width instead of every
 * 32nd finds an unturned P5 page 10.22 % smaller with nothing turned. With every
 * width searched, the largest turn gain on any set is 5.05 % (P5), then 4.96 %
 * (P8) and 4.22 % (P4). That is not a page worth two readers changing, so the
 * packer still never turns a region.
 *
 * ⚠️ The `free` column and the 18.13 % are measurements of the search as it was
 * on that day, a 32-px width grid. Issue #872 replaced it with every width (see
 * `FREE_EDGE_STEP`), so today's `free` pages for these sets are the every-width
 * ones the paragraph above compares against, and the 5.05 % is the turn gain
 * measured on the search that ships.
 */
export const PACK_NO_ROTATE = 0;

/**
 * The atlas text for these pages — the ONE emitter, for both atlas shapes.
 *
 * Two text-shape traps are load-bearing (A07 checks both): a region name is the
 * RAW line, so it carries no indentation, and a blank line closes a page block,
 * so there is none between a page header and its regions. Exactly one blank line
 * sits BETWEEN pages and none trails the last.
 *
 * The unpacked default goes through here too (`buildAtlasText` builds one page
 * per image and calls this), which is what makes "the defaults change nothing" a
 * property of one function instead of a promise made by two.
 *
 * ⭐ **No pages is the empty FILE, not a blank line** (issue #608). A compile that
 * measured no art — a rig whose skins fill no slot with anything that needs a
 * page — used to come out of here as `"\n"`, because `[].join('\n')` is `''` and
 * the trailing newline was appended unconditionally. That one byte contradicts
 * the paragraph above it: a blank line is the separator that sits BETWEEN page
 * blocks, so a file consisting of one is a separator with nothing on either side.
 * `A07_ATLAS_TEXT_SHAPE` reads a file with no non-blank line as having no page
 * block and reports SKIP, and refuses a blank line that trails a page block as
 * `the file ends with a blank line`.
 *
 * The runtime cannot tell the two apart — `new TextureAtlas('')`,
 * `new TextureAtlas('\n')` and `new TextureAtlas('\n\n')` all come back with
 * `pages.length === 0` and `regions.length === 0`, and the constructor
 * (`TextureAtlas.js:97-174`) has no `throw` in it at all — so the runtime is no
 * help in choosing, and the choice is made on what the text SAYS. Zero bytes has
 * exactly one reading; a blank line has two, and the wrong one is the one A07 was
 * built to catch.
 */
export function writeAtlasText(pages: EmitPage[]): string {
  if (pages.length === 0) return '';
  const lines: string[] = [];
  pages.forEach((page, i) => {
    if (i > 0) lines.push(''); // exactly one blank line BETWEEN pages
    lines.push(page.name);
    lines.push(`size: ${page.width}, ${page.height}`);
    lines.push('filter: Linear, Linear');
    lines.push('pma: false');
    for (const region of page.regions) {
      lines.push(region.name);
      lines.push(`bounds: ${region.x}, ${region.y}, ${region.width}, ${region.height}`);
      lines.push(`offsets: ${region.offsetX}, ${region.offsetY}, ${region.originalWidth}, ${region.originalHeight}`);
      lines.push(`rotate: ${PACK_NO_ROTATE}`);
    }
  });
  return `${lines.join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// packing
// ---------------------------------------------------------------------------

/**
 * What `--page-size` defaults to: the largest edge a page may have.
 *
 * 2048 rather than the Spine packer's 1024, and the corpus is the reason. A
 * ceiling of 1024 refuses four of the thirteen rigs in this repository whose art
 * is on disk — `1-weight-and-mass`'s `ground-bg` is 1251x394 and `6-arcs`'s
 * `platform` is 1064x396, because the shipped examples pack at `scale: 0.5` and
 * the loose sources are twice the packed size. A default that cannot pack the
 * project's own examples is the wrong default.
 *
 * It costs nothing on small rigs: this is a CEILING, and `packAtlas` writes the
 * smallest power-of-two page the set actually fits (a two-part rig gets 1024x256,
 * not 2048x2048). 2048 is also inside every GL implementation's guaranteed
 * maximum texture size that any consumer of a Spine atlas runs on.
 */
export const DEFAULT_PAGE_SIZE = 2048;
/** What `--padding` defaults to. See `extrudeCell` for why it is not 0 and not 1. */
export const DEFAULT_PADDING = 2;

/**
 * What a packed page's edges may be — `--page-edges`. See `packAtlas`, *Page size*.
 *
 * `pot` is the default and the only value until issue #860: both edges are powers
 * of two. `free` lets the width be any whole number of pixels and the height
 * whatever the placement needs. What `free` costs is measured rather than
 * conceded: a region attachment's sampling coordinate stops being exact and moves
 * to `PK05`'s bound of one least significant bit, the bound a mesh already had.
 */
export const PAGE_EDGES = ['pot', 'free'] as const;
export type PageEdges = (typeof PAGE_EDGES)[number];
export const DEFAULT_PAGE_EDGES: PageEdges = 'pot';
/**
 * The step a `free` page's width is tried on: **1, every width** (issue #872).
 * See `smallestFreePageFor` for the search and `packAtlas`, *Page size*, for
 * what it buys.
 *
 * It was 32 until #872, and the grid was the cost. On twelve region sets (two
 * painting rigs and ten production rigs of 20 to 22 parts) the 32-px grid's page
 * was larger than the every-width page on eleven, by up to 11.38 % (P5: 1344x1768
 * against 1427x1495). Finer fixed steps and coarse-to-fine searches were measured
 * against the every-width page too, and none of them is safe: the area as a
 * function of the width has minima one pixel wide, so a step-4 grid refined
 * over ±3 px of its best four widths still misses one (the fetched
 * `5-squash-and-stretch` atlas: 867x415 against 863x415), and the coarse-to-fine
 * search that was exact on all twelve sets missed by 0.82 % on the first
 * held-out atlas it met. Every width is exact by construction; what keeps it
 * cheap is the two bounds `smallestFreePageFor` prunes with, and they are exact
 * too.
 *
 * Kept as a named constant rather than deleted because it is importable, and a
 * reader of the old value should find the new one rather than a missing name.
 */
export const FREE_EDGE_STEP = 1;

/**
 * What a packed region's rectangle may share with its neighbours' — `--pack-shape`
 * (issue #1099, stage 1 of #1093). See `packAtlas`, *`shape: 'polygon'`*.
 *
 * `rect` is the default and is the packer exactly as it was before the option
 * existed: no two cells overlap. `polygon` packs every region whose every
 * attachment is a mesh by that mesh's emitted hull, so two rectangles may
 * overlap where neither region's footprint is; a region attachment's footprint
 * stays its rectangle, because it draws its whole quad.
 */
export const PACK_SHAPES = ['rect', 'polygon'] as const;
export type PackShape = (typeof PACK_SHAPES)[number];
export const DEFAULT_PACK_SHAPE: PackShape = 'rect';

/**
 * Where a `polygon` candidate may put a cell against the free rectangle it is
 * placed in (issue #1104) — `packOnePageByFootprint`, *Candidates*.
 *
 * `box` puts the cell's owned box on the free rectangle's corner — the only
 * rule before #1104. The other three may also put the cell's own corner there
 * (`packOnePageByFootprint`, *Candidates*):
 *
 *   * `box-or-cell` — on every free rectangle;
 *   * `box-else-cell` — only on a free rectangle where the owned box's anchor
 *     would put the cell off the page;
 *   * `best-of` — the footprint pass run with `box` and with `box-or-cell` on
 *     the same page and the better kept (more cells, then the higher bottom
 *     edge, then `box`), as `placePass` keeps the better of `rect` and a
 *     footprint pass.
 *
 * No single rule is never-larger than `box` — `box-or-cell` packs `PK78`'s
 * wedge set 7.2 % larger — so `polygon` does not pick one: it packs the whole
 * set as `rect`, under `box` and under `box-else-cell` and keeps the least Σ
 * page area (`POLYGON_CANDIDATE_RULES`, `packAtlas`). `box-else-cell` is the
 * third candidate on measurement: over 96 packs (seeds 1100–1124, the tree's
 * 21 sets, the wedge and spill sets, `pot` and `free`) the choice with it sums
 * to 212,607,001 texels, with `best-of` 214,407,755 and with `box-or-cell` the
 * same. `best-of` is never worse than `box` on one page, but against
 * `box-else-cell` it gives the smaller pack on 12 of the 27 sets where the two
 * differ and the larger on 15 — neither dominates, and the sum decides.
 *
 * The CLI never sets one rule; `PackOptions.footprintAnchors` is the instrument's and the plant's.
 */
export const FOOTPRINT_ANCHORS = ['box', 'box-or-cell', 'box-else-cell', 'best-of'] as const;
export type FootprintAnchors = (typeof FOOTPRINT_ANCHORS)[number];
/** The rule a footprint search uses when it is given none — `freePageSearch`'s and `footprintPass`'s callers outside `packAtlas`. */
export const DEFAULT_FOOTPRINT_ANCHORS: FootprintAnchors = 'box';
/** The footprint rules `polygon` packs under besides `rect`, in the order a tie goes to (`packAtlas`). */
export const POLYGON_CANDIDATE_RULES: readonly FootprintAnchors[] = ['box', 'box-else-cell'];
/** Which whole pack a `polygon` pack kept: `rect`'s, or one footprint rule's. */
export type PackCandidate = 'rect' | FootprintAnchors;

/**
 * The part of a region its attachments draw, in the region's own texels — x
 * right and y down from the drawing's top-left corner, so `(u · width, v ·
 * height)` for a mesh UV `(u, v)`. Each polygon is a flat `[x0, y0, x1, y1, …]`
 * loop, closed from its last vertex back to its first: a mesh's hull loop, and
 * each of its triangles. Absent on a `PackInput`, the footprint is the whole
 * rectangle, which is what every region attachment's is.
 */
export interface PackFootprint {
  polygons: ReadonlyArray<readonly number[]>;
}

/** The part a page is packed from: its region name and its pixels. */
export interface PackInput {
  region: string;
  /** Absolute path, for the message that names a part the pack could not fit. */
  absPath: string;
  width: number;
  height: number;
  /**
   * Already-drawn pixels (`render --sheet`), used in place of `readPlate(absPath)`
   * when given so an in-memory crop is not written out only to be read back in.
   */
  plate?: Plate;
  /**
   * What the region's attachments draw (`packFootprints`), read only under
   * `shape: 'polygon'`. Absent means the rectangle.
   */
  footprint?: PackFootprint;
}

export interface PackOptions {
  /** Largest page edge. The page actually written is the smallest power of two that holds the pack. */
  pageSize?: number;
  /** Gutter each region reserves on every side. */
  padding?: number;
  /** Page filenames are `<stem>.png`, `<stem>2.png`, … — libgdx's own numbering. */
  pageStem?: string;
  /** What the page's edges may be (default `pot`). See `PAGE_EDGES`. */
  pageEdges?: PageEdges;
  /** What two rectangles may share (default `rect`). See `PACK_SHAPES`. */
  shape?: PackShape;
  /**
   * One footprint rule alone instead of `polygon`'s choice between whole packs
   * (`FOOTPRINT_ANCHORS`) — for `tools/pack_anchor.ts` and the selftest's plant
   * (`PK97`); the CLI never sets it. Absent, `polygon` keeps the least Σ page
   * area of `rect` and `POLYGON_CANDIDATE_RULES`.
   */
  footprintAnchors?: FootprintAnchors;
  /** Where to count what every search the pack runs placed (`PassTally`) — the controls' and the instrument's cost reading. */
  tally?: PassTally;
  /**
   * `false` runs every footprint pass of every search to its end — issue
   * #1102's early stop off, for the selftest's plant (`PK95`) only. The pages are
   * the same either way (`PK94`); only the cost differs.
   */
  stopAtMiss?: boolean;
  /**
   * `false` splits every band of every cell a footprint pass places over the
   * whole free list — issue #1165's partition off (`splitFreeByCell`), for the
   * selftest's plant (`PK106`) only. The pages are the same either way; only
   * the cost differs.
   */
  partition?: boolean;
}

/** Where one region landed. `x`/`y` are the REGION's own corner, not its cell's. */
export interface Placement {
  region: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PackedPage {
  /** The page's filename, which is also its name in the atlas text. */
  name: string;
  width: number;
  height: number;
  /** The page's pixels, ready to `writePng`. */
  plate: Plate;
  /** Fraction of the page area the regions themselves cover, 0..1. */
  occupancy: number;
}

export interface PackResult {
  pages: PackedPage[];
  /** Every placement, in the packer's own (sorted) order. */
  placements: Placement[];
  /** The atlas text for the packed pages. */
  atlasText: string;
  padding: number;
  /** The shape the pack was made under — what the `pack:` line's last field states. */
  shape: PackShape;
  /** The whole pack that was kept: `rect` under `shape: 'rect'`, and under `polygon` the candidate of least Σ page area (`packAtlas`). */
  candidate: PackCandidate;
}

/** A free rectangle in the MaxRects free list. */
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The largest power of two that is at most `n`.
 *
 * `--page-size 1000` therefore means 512, not 1024: the flag is a ceiling the
 * page may not exceed, and page edges are powers of two (see `packAtlas`). A
 * value that is already a power of two passes through unchanged, which is every
 * value anybody types.
 */
function floorPowerOfTwo(n: number): number {
  let p = 1;
  while (p * 2 <= n) p *= 2;
  return p;
}

/**
 * The smallest power-of-two page that holds these cells, and where they land on
 * it — or `null` when they do not fit `maxEdge x maxEdge` at all.
 *
 * Every power-of-two pair up to the maximum is tried in order of increasing
 * area, then increasing width, so the answer is a total order and two packs of
 * the same set choose the same page. Powers of two are not decoration:
 * `region.x / page.width` is the coordinate every texel is read through, and a
 * power-of-two denominator makes that division exact in binary floating point.
 *
 * ⭐ One search, two callers, and that is the point. It picks the single page a
 * set that fits gets, and it picks each SPILLED page's own size — so "the page
 * written is the smallest that holds what is on it" is one rule with one
 * implementation rather than a rule and an exception.
 */
function smallestPageFor(
  cells: Array<{ w: number; h: number }>,
  maxEdge: number,
  pageEdges: PageEdges,
  shapes?: readonly CellShape[],
  anchors: FootprintAnchors = DEFAULT_FOOTPRINT_ANCHORS,
  tally?: PassTally,
  stopAtMiss = true,
  partition = true,
): { width: number; height: number; rects: Rect[] } | null {
  if (pageEdges === 'free') return smallestFreePageFor(cells, maxEdge, shapes, anchors, tally, stopAtMiss, partition);
  const edges: number[] = [];
  for (let e = 1; e <= maxEdge; e *= 2) edges.push(e);
  const candidates: Array<{ w: number; h: number }> = [];
  for (const w of edges) for (const h of edges) candidates.push({ w, h });
  candidates.sort((a, b) => a.w * a.h - b.w * b.h || a.w - b.w);
  for (const candidate of candidates) {
    const attempt = placePass(cells, shapes, candidate.w, candidate.h, Infinity, { wholeOrNothing: stopAtMiss, anchors, tally, partition });
    if (attempt.some((r) => r === null)) continue;
    return { width: candidate.w, height: candidate.h, rects: attempt as Rect[] };
  }
  return null;
}

/**
 * The smallest `free` page that holds these cells, and where they land on it —
 * or `null` when they do not fit `maxEdge x maxEdge` at all.
 *
 * The rule, which `docs/AUTHORING.md` §0.1 states in the same words:
 *
 *   * the candidate WIDTHS are every whole width from the widest cell up to
 *     `maxEdge` (`FREE_EDGE_STEP` is 1);
 *   * at each width the cells are placed by the same MaxRects pass as a `pot`
 *     page, on a page `maxEdge` tall, and the HEIGHT is the bottom edge of the
 *     lowest cell — what that placement needs, not rounded;
 *   * the page with the least area wins, then the squarer (smaller |width −
 *     height|), then the narrower. Every candidate has a distinct width, so that
 *     last key makes the order total and the answer a function of the cells.
 *
 * ⚠️ The height is read off one placement rather than searched for, and that is
 * a definition, not an approximation of one: MaxRects' success is not monotonic
 * in the page height (a shorter page changes which free rectangle scores best),
 * so "the least height that fits" is not a quantity a bisection could find, and a
 * definition that could not be computed exactly would not be deterministic.
 *
 * ⭐ **Two bounds make every width cheap, and neither can change the answer**
 * (issue #872). Both compare against the best page found so far, and both are
 * strict, so a width that could still TIE the best — and win on the squarer or
 * narrower key — is always placed to the end:
 *
 *   * a width is not placed at all when the cells' own area exceeds
 *     `width x maxEdge` (it cannot fit), or when `width x` the tallest cell
 *     already exceeds the best area (no page at that width is shorter than its
 *     tallest cell);
 *   * a placement is abandoned the moment its lowest cell's bottom edge makes
 *     `width x bottom` exceed the best area. The bottom edge only grows as cells
 *     are added, so the page that placement would have finished is larger still.
 *
 * Neither changes a placement that runs to the end — the pass is the `pot` pass,
 * on the same page, and abandoning it only stops it early — so the winner is the
 * every-width winner, and `PK75` compares the two on every set it builds. What
 * they save, measured on the twelve sets: 391,854 cell placements for an
 * unbounded every-width search, 47,978 bounded, against 12,361 for the retired
 * 32-px grid.
 */
function smallestFreePageFor(
  cells: Array<{ w: number; h: number }>,
  maxEdge: number,
  shapes?: readonly CellShape[],
  anchors: FootprintAnchors = DEFAULT_FOOTPRINT_ANCHORS,
  tally?: PassTally,
  stopAtMiss = true,
  partition = true,
): { width: number; height: number; rects: Rect[] } | null {
  const search = freePageSearch(cells, maxEdge, shapes, { anchors, stopAtMiss, partition });
  if (tally !== undefined) for (const key of Object.keys(tally) as Array<keyof PassTally>) tally[key] += search.tally[key];
  return search.page;
}

/** What one `free` page search did: the page it chose, and what each width cost. */
export interface FreePageSearch {
  page: { width: number; height: number; rects: Array<{ x: number; y: number; w: number; h: number }> } | null;
  /** Candidate widths, from the widest cell to `maxEdge`. */
  widths: number;
  /** Widths whose placement ran to the end. */
  completed: number;
  /** Widths whose placement stopped once its lowest cell made the page larger than the best so far. */
  abandoned: number;
  /** Widths never placed: too narrow for the cells' area, or wide enough that the tallest cell alone loses. */
  skipped: number;
  /** What the passes placed, by kind (`PassTally`). */
  tally: PassTally;
}

/**
 * How `freePageSearch` runs its passes — for the selftest's plants only
 * (`PK94`, `PK95`, `PK106`). Each turns one saving off: `stopAtMiss: false`
 * runs every footprint pass to its end and `edgeIndex: false` splits and
 * prunes the whole free list by scanning all of it (issue #1102's two);
 * `partition: false` splits every band over the whole list but keeps the edge
 * index (issue #1165's). The page is the same either way; only what it costs
 * differs, and the plants hold that.
 */
export interface FreePageSearchOptions {
  stopAtMiss?: boolean;
  /** `false` splits the whole free list and scans all of it for a piece's containers (`splitFree`), as the prune did before issue #1102. */
  edgeIndex?: boolean;
  /** `false` splits every band over the whole free list (`splitFreeByCell`), as before issue #1165 — the plant of `PK106`. */
  partition?: boolean;
  /** Where a candidate may anchor a cell (`FOOTPRINT_ANCHORS`) — `tools/pack_anchor.ts`'s candidate rules; default `box`. */
  anchors?: FootprintAnchors;
}

/**
 * `smallestFreePageFor`'s search with its bookkeeping — exported so the
 * selftest can compare its page against an unbounded every-width reference and
 * see that the bounds did prune (`PK75`). The page is the whole of what the
 * packer uses; the counts are for the control. `shapes`, one per cell, is
 * `shape: 'polygon'`'s placement (`placePass`); absent, the rectangle pass.
 */
export function freePageSearch(
  cells: Array<{ w: number; h: number }>,
  maxEdge: number,
  shapes?: readonly CellShape[],
  options: FreePageSearchOptions = {},
): FreePageSearch {
  const wholeOrNothing = options.stopAtMiss ?? true;
  let widest = 0;
  let tallest = 0;
  let cellArea = 0;
  for (const cell of cells) {
    widest = Math.max(widest, cell.w);
    tallest = Math.max(tallest, cell.h);
    cellArea += cell.w * cell.h;
  }
  // 🔒 Under `polygon` cells may overlap, so their area is no bound on the page;
  // what is, is the texels they OWN, which are disjoint (issue #1099). Bounding
  // by the cells' area skipped every width a polygon spill page needed, and a
  // spilled page whose cells overlapped was refused as fitting no page at all.
  if (shapes !== undefined) {
    cellArea = 0;
    for (const shape of shapes) cellArea += shape.owned;
  }
  const out: FreePageSearch = { page: null, widths: 0, completed: 0, abandoned: 0, skipped: 0, tally: emptyTally() };
  let best: { width: number; height: number; rects: Rect[] } | null = null;
  for (let width = Math.ceil(widest / FREE_EDGE_STEP) * FREE_EDGE_STEP; width <= maxEdge; width += FREE_EDGE_STEP) {
    out.widths++;
    const bestArea = best === null ? Infinity : best.width * best.height;
    if (cellArea > width * maxEdge || width * tallest > bestArea) {
      out.skipped++;
      continue;
    }
    const maxBottom = best === null ? Infinity : Math.floor(bestArea / width);
    const attempt = placePass(cells, shapes, width, maxEdge, maxBottom, { wholeOrNothing, tally: out.tally, edgeIndex: options.edgeIndex ?? true, anchors: options.anchors, partition: options.partition ?? true });
    let height = 0;
    for (const r of attempt) if (r !== null) height = Math.max(height, r.y + r.h);
    if (height > maxBottom) {
      out.abandoned++;
      continue;
    }
    out.completed++;
    if (attempt.some((r) => r === null)) continue;
    const rects = attempt as Rect[];
    if (best !== null) {
      const area = width * height;
      if (area > bestArea) continue;
      if (area === bestArea) {
        const square = Math.abs(width - height);
        const bestSquare = Math.abs(best.width - best.height);
        if (square > bestSquare) continue;
        if (square === bestSquare && width >= best.width) continue;
      }
    }
    best = { width, height, rects };
  }
  out.page = best;
  return out;
}

/**
 * One `free` candidate, unbounded: the cells placed at `width` on a page
 * `maxEdge` tall, and the height that placement needs — or `null` when they do
 * not all fit. It is the pass `freePageSearch` runs at each width with no
 * bound, exported so the selftest can rebuild a reference search from the same
 * placement (`PK74`'s 32-px grid, `PK75`'s every width, `PK76`'s `pot` search).
 */
export function placeAtWidth(
  cells: Array<{ w: number; h: number }>,
  width: number,
  height: number,
): { width: number; height: number; rects: Array<{ x: number; y: number; w: number; h: number }> } | null {
  const attempt = packOnePage(cells, width, height);
  if (attempt.some((r) => r === null)) return null;
  const rects = attempt as Rect[];
  let bottom = 0;
  for (const r of rects) bottom = Math.max(bottom, r.y + r.h);
  return { width, height: bottom, rects };
}

/**
 * MaxRects with Best Short Side Fit, no rotation.
 *
 * The free list starts as the whole page and every placement splits every free
 * rectangle it overlaps into up to four new ones, after which rectangles wholly
 * contained in another are pruned. It is the standard formulation (Jylänki 2010)
 * and it is here rather than in a dependency because rigc has one dependency and
 * a bin packer is 90 lines.
 *
 * 🔒 **Determinism.** BSSF's score can tie, and a tie broken by "whichever came
 * first in the free list" makes the output depend on the order splits happened
 * to be pushed. So the tie-break is spelled out and total — smallest long-side
 * leftover, then topmost, then leftmost — and the caller sorts its input before
 * calling. Same inputs, byte-identical page.
 *
 * `maxBottom` is the `free` search's abandon bound (see `freePageSearch`): once a
 * placed cell's bottom edge passes it the pass stops, and the cells not placed
 * are `null`. The default, `Infinity`, never stops a pass — which is every `pot`
 * call, so a `pot` page is placed exactly as it was before the bound existed.
 */
function packOnePage(
  cells: Array<{ w: number; h: number }>,
  pageW: number,
  pageH: number,
  maxBottom = Infinity,
): Array<Rect | null> {
  const free: Rect[] = [{ x: 0, y: 0, w: pageW, h: pageH }];
  const placed: Array<Rect | null> = [];

  for (const cell of cells) {
    let best: Rect | null = null;
    let bestShort = Infinity;
    let bestLong = Infinity;
    for (const fr of free) {
      if (fr.w < cell.w || fr.h < cell.h) continue;
      const leftoverW = fr.w - cell.w;
      const leftoverH = fr.h - cell.h;
      const short = Math.min(leftoverW, leftoverH);
      const long = Math.max(leftoverW, leftoverH);
      if (best !== null) {
        if (short > bestShort) continue;
        if (short === bestShort) {
          if (long > bestLong) continue;
          if (long === bestLong) {
            if (fr.y > best.y) continue;
            if (fr.y === best.y && fr.x >= best.x) continue;
          }
        }
      }
      best = fr;
      bestShort = short;
      bestLong = long;
    }
    if (best === null) {
      placed.push(null);
      continue;
    }
    const put: Rect = { x: best.x, y: best.y, w: cell.w, h: cell.h };
    placed.push(put);
    if (put.y + put.h > maxBottom) {
      while (placed.length < cells.length) placed.push(null);
      return placed;
    }

    // Split every free rectangle the placement overlaps, then prune.
    const next: Rect[] = [];
    for (const fr of free) {
      const overlaps = put.x < fr.x + fr.w && put.x + put.w > fr.x && put.y < fr.y + fr.h && put.y + put.h > fr.y;
      if (!overlaps) {
        next.push(fr);
        continue;
      }
      if (put.x > fr.x) next.push({ x: fr.x, y: fr.y, w: put.x - fr.x, h: fr.h });
      if (put.x + put.w < fr.x + fr.w) {
        next.push({ x: put.x + put.w, y: fr.y, w: fr.x + fr.w - (put.x + put.w), h: fr.h });
      }
      if (put.y > fr.y) next.push({ x: fr.x, y: fr.y, w: fr.w, h: put.y - fr.y });
      if (put.y + put.h < fr.y + fr.h) {
        next.push({ x: fr.x, y: put.y + put.h, w: fr.w, h: fr.y + fr.h - (put.y + put.h) });
      }
    }
    const contains = (a: Rect, b: Rect): boolean =>
      b.x >= a.x && b.y >= a.y && b.x + b.w <= a.x + a.w && b.y + b.h <= a.y + a.h;
    free.length = 0;
    for (let i = 0; i < next.length; i++) {
      if (next[i].w <= 0 || next[i].h <= 0) continue;
      let contained = false;
      for (let j = 0; j < next.length && !contained; j++) {
        if (i === j || next[j].w <= 0 || next[j].h <= 0) continue;
        // On a mutual containment (two identical rectangles) the later index
        // loses, so exactly one survives and it is always the same one.
        if (contains(next[j], next[i]) && (j < i || !contains(next[i], next[j]))) contained = true;
      }
      if (!contained) free.push(next[i]);
    }
  }
  return placed;
}

/**
 * One placement pass: the rectangle pass (`packOnePage`) when `shapes` is
 * absent, which is every `shape: 'rect'` call and so every pack made before the
 * option existed, and the footprint pass (`packOnePageByFootprint`) when it is
 * given.
 */
function placePass(
  cells: Array<{ w: number; h: number }>,
  shapes: readonly CellShape[] | undefined,
  pageW: number,
  pageH: number,
  maxBottom = Infinity,
  pass: PassOptions = {},
): Array<Rect | null> {
  const wholeOrNothing = pass.wholeOrNothing ?? false;
  const tally = pass.tally;
  if (shapes === undefined || shapes.every((s) => s.whole)) {
    const byRect = packOnePage(cells, pageW, pageH, maxBottom);
    if (tally !== undefined) tally.rectPlaced += placedCount(byRect);
    return byRect;
  }
  // ⭐ `wholeOrNothing` is the page searches' question (issue #1102): they keep
  // a pass only when it placed every cell, so a pass that has missed one is
  // already discarded, whatever it does next. Two savings follow, and neither
  // can change a page the search keeps:
  //
  //   * the rectangle pass is not run when the cells' own area exceeds the
  //     page — disjoint rectangles cannot all fit, so it could not place every
  //     cell, and the pass it would have lost or won against is discarded either
  //     way (a footprint pass that placed every cell beats a rectangle pass that
  //     did not, on the first key);
  //   * the footprint pass stops at its first miss (`packOnePageByFootprint`'s
  //     `stopAtMiss`), returning the cells after it as not placed.
  //
  // What is returned can then differ from the full answer only in which of two
  // failed passes it is, or in how many cells a failed pass placed — and the
  // searches read neither. The spill's assignment pass, which keeps the cells
  // a pass did place, never asks this (`packAtlas`).
  //
  // Measured on a replica of a production rig (31 meshes, a two-page `free`
  // spill at 2048, padding 2), where the pack took 260–304 s against `rect`'s
  // 0.14–0.24 s: the single-page search ran a full footprint pass at every one of its
  // 854 widths (54 % of the time), because nothing fits and so no best page
  // ever bounds a width, and the first page's own search ran one at every width
  // it did not abandon (46 %). The largest cell's owned box does not start at
  // its cell's corner, so on an empty page that cell is every footprint pass's
  // first miss — all 1,709 of them — and every one of those passes was thrown
  // away (issue #1104 measures the anchor that causes it). With the early stop the pack takes 0.15–0.7 s by the load, the
  // same pages.
  const rectCanFit = !wholeOrNothing || cellAreaOf(cells) <= pageW * pageH;
  const byRect = rectCanFit ? packOnePage(cells, pageW, pageH, maxBottom) : null;
  if (tally !== undefined && byRect !== null) tally.rectPlaced += placedCount(byRect);
  // ⭐ `polygon` never costs a page anything `rect` would have saved. Both passes
  // are run on the same page and the better one is kept: more cells placed,
  // then the higher bottom edge, then — on a tie — the rectangle pass. Two
  // disjoint cells never share a protected texel, so the rectangle pass is
  // itself a legal footprint placement, and keeping it where it is better is
  // choosing between two legal answers, not giving the mode up. Measured
  // before this rule existed: the footprint pass alone wrote larger pages
  // than `rect` on two of the five gallery rigs that carry a mesh, because a
  // greedy pass that places one cell differently places every later one
  // differently too.
  const anchors = pass.anchors ?? DEFAULT_FOOTPRINT_ANCHORS;
  let byFootprint = packOnePageByFootprint(shapes, pageW, pageH, maxBottom, wholeOrNothing, pass.edgeIndex ?? true, tally, anchors === 'best-of' ? 'box' : anchors, pass.partition ?? true);
  if (anchors === 'best-of') {
    // Issue #1104's fourth candidate: both searches on the same page, the
    // better kept and the first anchor's on a tie — so a pass is never worse
    // than the first anchor's on that page.
    if (tally !== undefined) tally.footprintPlaced += placedCount(byFootprint);
    const byTwo = packOnePageByFootprint(shapes, pageW, pageH, maxBottom, wholeOrNothing, pass.edgeIndex ?? true, tally, 'box-or-cell', pass.partition ?? true);
    const bottom = (placed: Array<Rect | null>): number => placed.reduce((n, r) => (r === null ? n : Math.max(n, r.y + r.h)), 0);
    const placedBox = placedCount(byFootprint);
    const placedTwo = placedCount(byTwo);
    if (placedTwo > placedBox || (placedTwo === placedBox && bottom(byTwo) < bottom(byFootprint))) byFootprint = byTwo;
    if (tally !== undefined) tally.footprintPlaced += placedTwo;
  } else if (tally !== undefined) tally.footprintPlaced += placedCount(byFootprint);
  if (byRect === null) return byFootprint;
  const bottomOf = (placed: Array<Rect | null>): number => placed.reduce((n, r) => (r === null ? n : Math.max(n, r.y + r.h)), 0);
  const placedRect = placedCount(byRect);
  const placedFoot = placedCount(byFootprint);
  if (placedFoot !== placedRect) return placedFoot > placedRect ? byFootprint : byRect;
  return bottomOf(byFootprint) < bottomOf(byRect) ? byFootprint : byRect;
}

/** How `placePass` runs — what the page searches ask of it (issue #1102). */
interface PassOptions {
  /** Only a pass that places every cell is kept by the caller. See `placePass`. */
  wholeOrNothing?: boolean;
  /** Where to count what the passes placed. */
  tally?: PassTally;
  /** `splitFree`'s edge index (default on); off only for the selftest's plant. */
  edgeIndex?: boolean;
  /** Where a candidate may anchor a cell (`FOOTPRINT_ANCHORS`). */
  anchors?: FootprintAnchors;
  /** `splitFreeByCell`'s partition (default on); off only for the selftest's plant. */
  partition?: boolean;
}

/** How many cells a pass placed. */
function placedCount(pass: ReadonlyArray<Rect | null>): number {
  let n = 0;
  for (const r of pass) if (r !== null) n++;
  return n;
}

/** The cells' own area — what disjoint rectangles need of a page at least. */
function cellAreaOf(cells: ReadonlyArray<{ w: number; h: number }>): number {
  let area = 0;
  for (const cell of cells) area += cell.w * cell.h;
  return area;
}

/**
 * What a page search's passes placed, by kind — the operation count a search's
 * cost is held by (`PK93`), since a footprint placement splits the free list
 * once per band of what the cell owns and a rectangle placement once.
 */
export interface PassTally {
  /** Cells placed by rectangle passes (`packOnePage`). */
  rectPlaced: number;
  /** Cells placed by footprint passes (`packOnePageByFootprint`). */
  footprintPlaced: number;
  /** Free-list splits the footprint passes made — one per band of every cell they placed (`splitFree`). */
  bandSplits: number;
  /** Containment tests the footprint passes' prune made (`splitFree`). */
  containmentTests: number;
  /**
   * Free-list entries the footprint passes' splits read: the list's length at
   * every band split, and once per placed cell the whole list the partition
   * reads (`splitFreeByCell`) — the work issue #1165 measured, held by `PK106`.
   */
  entriesRead: number;
  /**
   * Free rectangles that held a cell's owned box and were refused as its
   * first-anchor candidate only because the cell, anchored there, would leave
   * the page — at negative x or y, or past the right or bottom edge (issue
   * #1104, `tools/pack_anchor.ts`).
   */
  boxAnchorRefused: number;
  /** Cells a footprint pass missed although some free rectangle held their owned box. */
  missedByAnchor: number;
  /** Cells a footprint pass placed at the second anchor — the cell's own corner on the free rectangle's — under a candidate rule that has one (`FOOTPRINT_ANCHORS`). */
  secondAnchorPlaced: number;
}

/** A tally with nothing counted. */
export function emptyTally(): PassTally {
  return { rectPlaced: 0, footprintPlaced: 0, bandSplits: 0, containmentTests: 0, entriesRead: 0, boxAnchorRefused: 0, missedByAnchor: 0, secondAnchorPlaced: 0 };
}

// ---------------------------------------------------------------------------
// footprints — `shape: 'polygon'` (issue #1099)
// ---------------------------------------------------------------------------

/**
 * A cell as `shape: 'polygon'` places it: the region plus `padding` on every
 * side, and the cell texels the region OWNS — its protected set.
 *
 * ## The protected set, and why it is the footprint test
 *
 * A region attachment owns its whole cell, exactly the cell `shape: 'rect'`
 * keeps apart from every other: it draws its whole quad, and its gutter is what
 * makes its edge sample as the loose page's does (`extrudeCell`).
 *
 * A mesh region owns every cell texel `t` whose unit square, grown by `reach =
 * max(padding, 1)` texels on every side (a Chebyshev dilation), meets one of
 * the region's footprint polygons, closed — boundary contact counts. Then:
 *
 *   * it holds every texel the mesh can sample. A bilinear tap at a point `q`
 *     inside a triangle reads the four texels whose centres are within one
 *     texel of `q`, and each of those squares lies within half a texel of `q`;
 *     `reach` ≥ 1 covers that with room for the float32 page UVs the runtime
 *     stores (`src/atlas.ts`'s header: worst 3.15e-5 texels);
 *   * it keeps the padding the rectangle keeps. A rectangle's cell is the
 *     rectangle grown by `padding`, and this is the hull grown by `padding` —
 *     for a hull that covers its whole drawing, texel for texel the same cell,
 *     which is why such a mesh is placed exactly as a rectangle is;
 *   * it is clipped to the cell, so a region never claims a texel outside the
 *     cell its own pixels are extruded into.
 *
 * ⇒ **Two cells may be placed with their rectangles overlapping exactly when
 * their protected sets share no texel.** For two rectangles that is today's
 * rule — two cells share no texel — so a pack with no mesh region is placed
 * by `rect`'s arithmetic, decision for decision. For any two footprints it
 * means their Chebyshev distance is at least `2 · padding`: if a point of one
 * were within `2 · padding` of a point of the other, the texel under their
 * midpoint would be in both protected sets.
 *
 * ## Exactness — where it rounds, and in which direction
 *
 * The polygons are doubles: a UV as `skeleton.json` states it, times the
 * region's integer size. The set is computed row by row — the band
 * `[row − reach, row + 1 + reach]` against each polygon: every edge clipped to
 * the band, and the polygon's even-odd spans on the band's two lines, which
 * together are the polygon's exact extent inside the band — and every
 * comparison that could decide "outside" is made `FOOTPRINT_SLACK` in the
 * polygon's favour. **The only rounding grows the set**, by at most that slack
 * (1e-6 texels, against a double's 1e-13 on these magnitudes), so it can make
 * two footprints keep further apart than they had to and never lets two
 * touch.
 */
export interface CellShape {
  /** The cell: the region plus `padding` on every side. */
  width: number;
  height: number;
  /** 1 on every texel the region owns, row-major over the cell. */
  mask: Uint8Array;
  /** `mask` rounded out to bands of `FOOTPRINT_BAND_ROWS` rows, as disjoint rectangles in cell texels, top to bottom — what the free list is split by. */
  rects: Rect[];
  /** The bounding box of `mask`, in cell texels. */
  bbox: Rect;
  /** The mask is the whole cell: the region is placed exactly as `shape: 'rect'` places it. */
  whole: boolean;
  /** How many texels the mask owns — what the `free` search's area bound sums, since owned sets are disjoint and cells may not be. */
  owned: number;
}

/** How far in a polygon's favour every footprint comparison is made. See `CellShape`, *Exactness*. */
export const FOOTPRINT_SLACK = 1e-6;

/**
 * How many rows of a cell's owned set one free-list rectangle spans — the
 * resolution the footprint pass's free list keeps, not the resolution of the
 * footprint test (which is the exact set, texel by texel). Splitting the free
 * list by one rectangle per row of a curved hull made it thousands long: a
 * 60-part set of ellipse hulls ran over ten minutes on a `free` page. See
 * `packOnePageByFootprint` for what the bands cost.
 */
export const FOOTPRINT_BAND_ROWS = 8;

/**
 * The closed x-extent of one polygon inside the band `y0 ≤ y ≤ y1`, as a list
 * of closed intervals whose union is exactly that extent: each edge clipped to
 * the band, and the even-odd spans on the band's two lines (a point inside the
 * polygon and the band either reaches a band line vertically without leaving
 * the polygon, or meets an edge inside the band on the way).
 */
function bandExtent(poly: readonly number[], offset: number, y0: number, y1: number, out: Array<[number, number]>): void {
  const n = poly.length / 2;
  for (let i = 0; i < n; i++) {
    const ax = poly[2 * i] + offset;
    const ay = poly[2 * i + 1] + offset;
    const j = (i + 1) % n;
    const bx = poly[2 * j] + offset;
    const by = poly[2 * j + 1] + offset;
    if (Math.max(ay, by) < y0 || Math.min(ay, by) > y1) continue;
    if (ay === by) {
      out.push([Math.min(ax, bx), Math.max(ax, bx)]);
      continue;
    }
    let t0 = (y0 - ay) / (by - ay);
    let t1 = (y1 - ay) / (by - ay);
    if (t0 > t1) [t0, t1] = [t1, t0];
    t0 = Math.max(0, t0);
    t1 = Math.min(1, t1);
    if (t0 > t1) continue;
    const xa = ax + (bx - ax) * t0;
    const xb = ax + (bx - ax) * t1;
    out.push([Math.min(xa, xb), Math.max(xa, xb)]);
  }
  for (const y of [y0, y1]) {
    const crossings: number[] = [];
    for (let i = 0; i < n; i++) {
      const ay = poly[2 * i + 1] + offset;
      const j = (i + 1) % n;
      const by = poly[2 * j + 1] + offset;
      if ((ay <= y && y < by) || (by <= y && y < ay)) {
        const ax = poly[2 * i] + offset;
        const bx = poly[2 * j] + offset;
        crossings.push(ax + ((y - ay) * (bx - ax)) / (by - ay));
      }
    }
    crossings.sort((a, b) => a - b);
    for (let k = 0; k + 1 < crossings.length; k += 2) out.push([crossings[k], crossings[k + 1]]);
  }
}

/**
 * A region's cell and protected set (`CellShape`) — the rectangle when
 * `footprint` is absent, the dilated footprint polygons when it is given.
 * Exported so the selftest can hold the pages to the sets the packer kept
 * apart (`PK79`) without restating the rule.
 */
export function footprintCell(width: number, height: number, padding: number, footprint?: PackFootprint): CellShape {
  const cw = width + 2 * padding;
  const ch = height + 2 * padding;
  const whole = (): CellShape => {
    const cell = { x: 0, y: 0, w: cw, h: ch };
    return { width: cw, height: ch, mask: new Uint8Array(cw * ch).fill(1), rects: [cell], bbox: { ...cell }, whole: true, owned: cw * ch };
  };
  if (footprint === undefined) return whole();
  const mask = new Uint8Array(cw * ch);
  const reach = Math.max(padding, 1);
  const spans: Array<[number, number]> = [];
  for (let row = 0; row < ch; row++) {
    spans.length = 0;
    const y0 = row - reach - FOOTPRINT_SLACK;
    const y1 = row + 1 + reach + FOOTPRINT_SLACK;
    for (const poly of footprint.polygons) if (poly.length >= 6) bandExtent(poly, padding, y0, y1, spans);
    const at = row * cw;
    for (const [a, b] of spans) {
      const from = Math.max(0, Math.ceil(a - 1 - reach - FOOTPRINT_SLACK));
      const to = Math.min(cw - 1, Math.floor(b + reach + FOOTPRINT_SLACK));
      for (let x = from; x <= to; x++) mask[at + x] = 1;
    }
  }
  if (mask.every((v) => v === 1)) return whole();
  // The rectangles the free list is split by: the set rounded OUT to bands of
  // `FOOTPRINT_BAND_ROWS` rows — each band the columns any of its rows owns,
  // as runs, merged downwards while a run repeats exactly. Disjoint, a superset
  // of the set, and in a fixed order (top to bottom, then left to right), so
  // the free list is split the same way every time. Only the free list reads
  // them; what a cell owns, what is drawn and what the footprint test compares
  // is the exact set.
  const rects: Rect[] = [];
  let open = new Map<number, Rect>();
  const columns = new Uint8Array(cw);
  for (let band = 0; band < ch; band += FOOTPRINT_BAND_ROWS) {
    const rows = Math.min(FOOTPRINT_BAND_ROWS, ch - band);
    columns.fill(0);
    for (let row = band; row < band + rows; row++) for (let x = 0; x < cw; x++) if (mask[row * cw + x] === 1) columns[x] = 1;
    const next = new Map<number, Rect>();
    let x = 0;
    while (x < cw) {
      if (columns[x] === 0) {
        x++;
        continue;
      }
      const start = x;
      while (x < cw && columns[x] === 1) x++;
      const key = start * (cw + 1) + x;
      const continued = open.get(key);
      if (continued !== undefined && continued.y + continued.h === band) {
        continued.h += rows;
        next.set(key, continued);
      } else {
        const rect = { x: start, y: band, w: x - start, h: rows };
        rects.push(rect);
        next.set(key, rect);
      }
    }
    open = next;
  }
  // The bounding box is the exact set's: a candidate is placed so that box
  // lies in a free rectangle, which no other cell's bands reach.
  let minX = cw;
  let minY = ch;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      if (mask[y * cw + x] === 0) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + 1);
      maxY = Math.max(maxY, y + 1);
    }
  }
  // A footprint that owns nothing (no polygon of three vertices) still owns a
  // texel: a cell that claimed no texel could be placed on top of another and
  // the packer would have nothing to keep apart. Its top-left texel is the
  // smallest claim, and it is the cell's own.
  if (rects.length === 0) {
    mask[0] = 1;
    rects.push({ x: 0, y: 0, w: 1, h: 1 });
    minX = 0;
    minY = 0;
    maxX = 1;
    maxY = 1;
  }
  let count = 0;
  for (const v of mask) count += v;
  return { width: cw, height: ch, mask, rects, bbox: { x: minX, y: minY, w: maxX - minX, h: maxY - minY }, whole: false, owned: count };
}

/** Whether two placed cells' protected sets share a texel. */
function shapesMeet(a: CellShape, ax: number, ay: number, b: CellShape, bx: number, by: number): boolean {
  const x0 = Math.max(ax, bx);
  const y0 = Math.max(ay, by);
  const x1 = Math.min(ax + a.width, bx + b.width);
  const y1 = Math.min(ay + a.height, by + b.height);
  for (let y = y0; y < y1; y++) {
    const rowA = (y - ay) * a.width - ax;
    const rowB = (y - by) * b.width - bx;
    for (let x = x0; x < x1; x++) if (a.mask[rowA + x] === 1 && b.mask[rowB + x] === 1) return true;
  }
  return false;
}

/**
 * MaxRects' split of every free rectangle `put` overlaps, then its prune —
 * `packOnePage`'s, over the first `length` entries of `free`, written back in
 * place; returns the new length. Four savings, none of which changes a
 * rectangle or the list's order:
 *
 *   * a free rectangle the placement did not touch is never tested for
 *     containment. Before the split no free rectangle lay inside another (the
 *     prune's own postcondition), and every new piece lies inside the
 *     rectangle it was cut from, so an untouched rectangle inside a new piece
 *     would have lain inside that one — the test `packOnePage` makes for it
 *     always answers "not contained";
 *   * ⭐ (issue #1099, measured on production rigs) a free rectangle narrower
 *     than `minW` or shorter than `minH` is dropped. The caller passes the
 *     least bounding box of every cell the pass places, so such a rectangle can
 *     never be a candidate, and neither can any piece later cut from it (a
 *     piece lies inside the rectangle it was cut from); and a rectangle a
 *     dropped one contains is itself too small. So every rectangle that could
 *     ever be a candidate is kept, in the order the full prune keeps it. What
 *     it removes is the staircase of slivers an irregular hull's bands cut
 *     along its edge: on a production-shaped set (30 regions, 200 to 900 px,
 *     hulls near their rectangles, a `free` page about 2023x2046) the pack took
 *     18.5 s with the slivers kept and spent 95 % of it in this prune. A piece
 *     that would be dropped is not made at all (issue #1165): it takes part in
 *     no test and is not written back, so it changes no other entry's index
 *     order either;
 *   * the edge index (issue #1102), below;
 *   * (issue #1165) the rebuilt list, each entry's side and the edge lists are
 *     kept between calls (`splitNext` and its neighbours) and the list is
 *     written back over itself by index, never emptied and refilled: on the
 *     production rigs the emptying and the pushes that refilled it were most
 *     of this function's time, and none of it was arithmetic.
 */
function splitFree(free: Rect[], length: number, put: Rect, minW: number, minH: number, edgeIndex: boolean, tally?: PassTally): number {
  const px0 = put.x;
  const py0 = put.y;
  const px1 = put.x + put.w;
  const py1 = put.y + put.h;
  // A touched entry yields at most four pieces.
  if (splitSide.length < length * 4) {
    const capacity = Math.max(64, length * 8);
    splitSide = new Int8Array(capacity);
    splitLeft = new Int32Array(capacity);
    splitRight = new Int32Array(capacity);
    splitAbove = new Int32Array(capacity);
    splitBelow = new Int32Array(capacity);
  }
  const next = splitNext;
  const side = splitSide;
  let n = 0;
  for (let k = 0; k < length; k++) {
    const fr = free[k];
    const fx1 = fr.x + fr.w;
    const fy1 = fr.y + fr.h;
    if (!(px0 < fx1 && px1 > fr.x && py0 < fy1 && py1 > fr.y)) {
      next[n] = fr;
      side[n++] = UNTOUCHED;
      continue;
    }
    if (px0 > fr.x && px0 - fr.x >= minW && fr.h >= minH) {
      next[n] = { x: fr.x, y: fr.y, w: px0 - fr.x, h: fr.h };
      side[n++] = LEFT_OF_PUT;
    }
    if (px1 < fx1 && fx1 - px1 >= minW && fr.h >= minH) {
      next[n] = { x: px1, y: fr.y, w: fx1 - px1, h: fr.h };
      side[n++] = RIGHT_OF_PUT;
    }
    if (py0 > fr.y && fr.w >= minW && py0 - fr.y >= minH) {
      next[n] = { x: fr.x, y: fr.y, w: fr.w, h: py0 - fr.y };
      side[n++] = ABOVE_PUT;
    }
    if (py1 < fy1 && fr.w >= minW && fy1 - py1 >= minH) {
      next[n] = { x: fr.x, y: py1, w: fr.w, h: fy1 - py1 };
      side[n++] = BELOW_PUT;
    }
  }
  // ⭐ The edge index (issue #1102): a piece's containers are looked for only
  // among the entries that share the edge it was cut along. A piece cut from
  // the left of `put` ends at `put.x` and keeps its parent's rows, which meet
  // `put`'s rows (the parent overlapped `put`). A rectangle containing it covers
  // those rows from the piece's left edge to at least `put.x`; if it reached
  // past `put.x` it would overlap `put` — and no entry of `next` does (an
  // untouched rectangle by definition, a piece by construction). So every
  // container of a left piece ENDS at `put.x`; likewise a right piece's starts
  // at `put.x + put.w`, an upper piece's ends at `put.y` and a lower piece's
  // starts at `put.y + put.h`. The test is the full prune's test, asked of the
  // only entries that can answer it yes, so `contained` is the same boolean and
  // the list the same list in the same order. Measured where the footprint
  // pass does work (`fixtures/polypack_shapes.ts`, seed 1105, the searches a
  // `polygon` pack of it runs): 415,916,651 containment tests by the full scan,
  // 15,407,179 by the index, 3.2 s → 2.3 s; with the early stop off as well,
  // 11,928,721,590 → 537,215,014 and 101 s → 14.5 s. `edgeIndex: false` is
  // that scan — every usable entry in `left` — kept so the selftest can hold
  // that the index finds what the scan finds (`PK94`) and for nothing else.
  const left = splitLeft;
  const right = splitRight;
  const above = splitAbove;
  const below = splitBelow;
  let nLeft = 0;
  let nRight = 0;
  let nAbove = 0;
  let nBelow = 0;
  for (let j = 0; j < n; j++) {
    const r = next[j];
    if (r.w < minW || r.h < minH) continue;
    if (!edgeIndex) {
      left[nLeft++] = j;
      continue;
    }
    if (r.x + r.w === px0) left[nLeft++] = j;
    if (r.x === px1) right[nRight++] = j;
    if (r.y + r.h === py0) above[nAbove++] = j;
    if (r.y === py1) below[nBelow++] = j;
  }
  let w = 0;
  let tests = 0;
  for (let i = 0; i < n; i++) {
    const piece = next[i];
    if (piece.w < minW || piece.h < minH) continue;
    const cut = side[i];
    if (cut === UNTOUCHED) {
      free[w++] = piece;
      continue;
    }
    const list = !edgeIndex || cut === LEFT_OF_PUT ? left : cut === RIGHT_OF_PUT ? right : cut === ABOVE_PUT ? above : below;
    const count = !edgeIndex || cut === LEFT_OF_PUT ? nLeft : cut === RIGHT_OF_PUT ? nRight : cut === ABOVE_PUT ? nAbove : nBelow;
    let contained = false;
    for (let t = 0; t < count; t++) {
      const j = list[t];
      if (i === j) continue;
      tests++;
      const other = next[j];
      // On a mutual containment (two identical rectangles) the later index
      // loses, so exactly one survives and it is always the same one.
      if (rectContains(other, piece) && (j < i || !rectContains(piece, other))) {
        contained = true;
        break;
      }
    }
    if (!contained) free[w++] = piece;
  }
  if (tally !== undefined) {
    tally.bandSplits++;
    tally.containmentTests += tests;
    tally.entriesRead += length;
  }
  return w;
}

/** Whether `a` contains `b`. */
function rectContains(a: Rect, b: Rect): boolean {
  return b.x >= a.x && b.y >= a.y && b.x + b.w <= a.x + a.w && b.y + b.h <= a.y + a.h;
}

/**
 * `splitFree`'s working storage, kept between calls so a split allocates
 * nothing but the pieces it cuts (issue #1165). `splitFree` is never
 * re-entered and reads no entry past the `n` it wrote this call, so what an
 * earlier call left behind is never read.
 */
const splitNext: Rect[] = [];
let splitSide = new Int8Array(0);
let splitLeft = new Int32Array(0);
let splitRight = new Int32Array(0);
let splitAbove = new Int32Array(0);
let splitBelow = new Int32Array(0);
/** `splitFreeByCell`'s near list, kept between calls for the same reason. */
const splitNear: Rect[] = [];

/**
 * Every band of one placed cell split out of the first `length` entries of
 * `free` (`splitFree`, once per band, top to bottom); returns the new length.
 *
 * ⭐ **The list is split near the cell only** (issue #1165). Before a cell's
 * bands are split, the list is parted once into the entries that touch the
 * bands' bounding box — overlapping it or sharing an edge with it — and the
 * rest; every band is then split over the near part alone, and the far part is
 * written back first, the near part after it. Nothing the far part holds could
 * have been read:
 *
 *   * a far entry does not overlap any band (every band lies inside the box),
 *     so every split leaves it untouched — kept as it is, never tested;
 *   * a far entry contains no piece any band cuts. A piece cut from the left of
 *     a band ends at the band's left edge `x` and keeps a row `y` of the band
 *     (its parent overlapped the band), so a container of it holds the texel
 *     `(x − 1, y)` — inside the box or against its left edge, which an entry
 *     that neither overlaps the box nor shares an edge with it cannot hold.
 *     Likewise for the other three sides. And every piece is cut from a near
 *     entry, so it is in the near part for the next band.
 *
 * So every split makes the decisions over the near part that it makes over the
 * whole list, and the far part comes through every split unchanged. ⚠️ What
 * changes is the ORDER of the list: the far entries move ahead of the near ones.
 * That decides nothing, because nothing that reads the list reads its order:
 *
 *   * a split keeps every untouched entry, and keeps a piece unless another
 *     usable entry contains it, the later index losing only between two equal
 *     rectangles — and which of two equal rectangles survives is invisible,
 *     they are the same rectangle — so the SET of rectangles after a split is
 *     a function of the set before it;
 *   * a candidate is chosen by a total order on its score, its free
 *     rectangle's corner and its anchor (`packOnePageByFootprint`); two free
 *     rectangles that tie on all of those put the cell at the same place.
 *
 * So the placements are the ones the whole-list split makes, decision for
 * decision. What it saves: on three production rigs the near part is 10 to 22 %
 * of the list (about 90 entries of 940 on the slowest), and each of a cell's
 * 50 or so bands read the whole list. `partition: false` splits every band over
 * the whole list in order, as before — kept so the selftest can plant the
 * work back (`PK106`) and hold that the pages do not move (`PK94`, through
 * `edgeIndex: false`, which splits the whole list too).
 */
function splitFreeByCell(
  free: Rect[],
  length: number,
  cellX: number,
  cellY: number,
  rects: readonly Rect[],
  minW: number,
  minH: number,
  edgeIndex: boolean,
  partition: boolean,
  tally?: PassTally,
): number {
  if (!edgeIndex || !partition) {
    let n = length;
    for (const r of rects) n = splitFree(free, n, { x: cellX + r.x, y: cellY + r.y, w: r.w, h: r.h }, minW, minH, edgeIndex, tally);
    return n;
  }
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, cellX + r.x);
    y0 = Math.min(y0, cellY + r.y);
    x1 = Math.max(x1, cellX + r.x + r.w);
    y1 = Math.max(y1, cellY + r.y + r.h);
  }
  const near = splitNear;
  let nNear = 0;
  let nFar = 0;
  for (let k = 0; k < length; k++) {
    const fr = free[k];
    if (fr.x <= x1 && fr.x + fr.w >= x0 && fr.y <= y1 && fr.y + fr.h >= y0) near[nNear++] = fr;
    else free[nFar++] = fr;
  }
  if (tally !== undefined) tally.entriesRead += length;
  for (const r of rects) nNear = splitFree(near, nNear, { x: cellX + r.x, y: cellY + r.y, w: r.w, h: r.h }, minW, minH, true, tally);
  for (let k = 0; k < nNear; k++) free[nFar + k] = near[k];
  return nFar + nNear;
}

/** Which side of the placed rectangle a free-list piece was cut from (`splitFree`) — an index into its edge lists. */
const LEFT_OF_PUT = 0;
const RIGHT_OF_PUT = 1;
const ABOVE_PUT = 2;
const BELOW_PUT = 3;
const UNTOUCHED = -1;

/**
 * `packOnePage` with the free-space test replaced by the footprint test
 * (issue #1099) — the placement `shape: 'polygon'` makes.
 *
 * What changes is what the free list is the free space OF. `packOnePage`
 * splits it by each placed cell; this splits it by each placed cell's
 * protected set rounded out to bands of `FOOTPRINT_BAND_ROWS` rows
 * (`CellShape.rects`), so a free rectangle may lie inside an earlier cell
 * wherever that cell's region draws nothing. The bands only make the free list
 * coarser — a free rectangle is still clear of every owned texel — and they
 * are what keeps it short: per row, a 60-part set of ellipse hulls packed on a
 * `free` page in over ten minutes; in bands of 8 rows, in 14.9 s against the
 * rectangle pass's 0.6 s, the same page — and with `splitFree`'s sliver drop
 * beside them, in 5.8 s against 2.2 s (a loaded machine). Everything else is
 * MaxRects as `packOnePage` runs it:
 *
 *   * a candidate is a free rectangle that holds the cell's protected set's
 *     bounding box, anchored at its top-left corner — the cell placed so that
 *     box's corner lands there, which may put the cell's own unclaimed
 *     texels over a neighbour's — and whose cell stays on the page
 *     (*Candidates*, below, for the rules measured beside it);
 *   * the score is Best Short Side Fit over the part of the free rectangle the
 *     box uses from its corner (the box itself, under the default anchor),
 *     with the same total tie-break (smallest long-side leftover, then
 *     topmost, then leftmost, then the first anchor);
 *   * the free list is split and pruned by the same code (`splitFree`), once
 *     per rectangle of the protected set.
 *
 * ⇒ For a cell whose set is the whole cell (`CellShape.whole`), the box IS the
 * cell, the anchor IS the free rectangle's corner and the split IS the cell's:
 * a pack with no mesh region makes `packOnePage`'s decisions one for one
 * (`PK82`).
 *
 * ## Candidates — the second anchor (issue #1104)
 *
 * The first anchor puts the owned box's corner on the free rectangle's corner,
 * the cell then reaching up and left of it by the box's offset. So a cell whose
 * box is inset by `(dx, dy)` can only go where a free rectangle starts at least
 * `dx` from the page's left and `dy` from its top — on an empty page, nowhere.
 * A large region whose mesh draws a small part of it is then every footprint
 * pass's first miss: on `fixtures/polypack_shapes.ts`'s seed 1107, and on the
 * production rig it stands for, every footprint pass lost to the rectangle pass
 * and the polygon pack was the `rect` pack to the texel.
 *
 * The second anchor puts the cell's own corner there instead, the box inset by
 * its offset, and is a candidate when the free rectangle holds the box where it
 * then lies. The two coincide when the box starts at the cell's corner, so it
 * is only tried for an inset box — never for a whole cell, which is why a pack
 * with no mesh region is unchanged by it. Both keep the box inside a free
 * rectangle and the cell on the page, so no texel test, gutter or atlas field
 * changes: `bounds` stays inside `size`, as the runtime's UVs assume. Which
 * free rectangles get it is the rule (`FOOTPRINT_ANCHORS`); which rule's pack
 * is written is `packAtlas`'s choice by Σ page area.
 *
 * 🔒 **The footprint test is then stated outright rather than trusted to the
 * bookkeeping.** A candidate inside a free rectangle cannot meet a placed set,
 * because no free rectangle overlaps one; every placement is nevertheless
 * checked texel for texel against every set already placed, and a meeting is
 * an internal error, not a placement.
 *
 * It terminates and is deterministic for `packOnePage`'s reasons: one pass
 * over the cells in the caller's order, each over a finite free list, every
 * choice made by a total order, and no input but the cells and the page.
 */
function packOnePageByFootprint(
  shapes: readonly CellShape[],
  pageW: number,
  pageH: number,
  maxBottom = Infinity,
  stopAtMiss = false,
  edgeIndex = true,
  tally?: PassTally,
  anchors: FootprintAnchors = DEFAULT_FOOTPRINT_ANCHORS,
  partition = true,
): Array<Rect | null> {
  // The free list is `free`'s first `freeLength` entries (`splitFree`).
  const free: Rect[] = [{ x: 0, y: 0, w: pageW, h: pageH }];
  let freeLength = 1;
  const placed: Array<Rect | null> = [];
  const owned: Array<{ shape: CellShape; x: number; y: number }> = [];
  // The least box any cell of this pass needs — what a free rectangle must
  // hold to be a candidate for anything (`splitFree`, the second saving).
  let minW = Infinity;
  let minH = Infinity;
  for (const shape of shapes) {
    minW = Math.min(minW, shape.bbox.w);
    minH = Math.min(minH, shape.bbox.h);
  }

  for (const shape of shapes) {
    const box = shape.bbox;
    let best: { x: number; y: number; frX: number; frY: number; anchor: number } | null = null;
    let bestShort = Infinity;
    let bestLong = Infinity;
    let held = false;
    // The second anchor differs from the first only when the box is inset.
    const anchorCount = anchors !== 'box' && (box.x !== 0 || box.y !== 0) ? 2 : 1;
    for (let f = 0; f < freeLength; f++) {
      const fr = free[f];
      if (fr.w < box.w || fr.h < box.h) continue;
      held = true;
      let firstOffPage = false;
      for (let anchor = 0; anchor < anchorCount; anchor++) {
        // Anchor 0: the owned box's corner on the free corner. Anchor 1: the
        // cell's own corner there, the box then inset by its own offset.
        const x = anchor === 0 ? fr.x - box.x : fr.x;
        const y = anchor === 0 ? fr.y - box.y : fr.y;
        const usedW = anchor === 0 ? box.w : box.x + box.w;
        const usedH = anchor === 0 ? box.h : box.y + box.h;
        if (usedW > fr.w || usedH > fr.h) continue;
        const offPage = x < 0 || y < 0 || x + shape.width > pageW || y + shape.height > pageH;
        if (anchor === 0) firstOffPage = offPage;
        // `box-else-cell`: the second anchor only where the first left the page.
        if (anchor === 1 && anchors === 'box-else-cell' && !firstOffPage) continue;
        if (offPage) {
          if (anchor === 0 && tally !== undefined) tally.boxAnchorRefused++;
          continue;
        }
        const leftoverW = fr.w - usedW;
        const leftoverH = fr.h - usedH;
        const short = Math.min(leftoverW, leftoverH);
        const long = Math.max(leftoverW, leftoverH);
        if (best !== null) {
          if (short > bestShort) continue;
          if (short === bestShort) {
            if (long > bestLong) continue;
            if (long === bestLong) {
              if (fr.y > best.frY) continue;
              if (fr.y === best.frY) {
                if (fr.x > best.frX) continue;
                if (fr.x === best.frX && anchor >= best.anchor) continue;
              }
            }
          }
        }
        best = { x, y, frX: fr.x, frY: fr.y, anchor };
        bestShort = short;
        bestLong = long;
      }
    }
    if (best === null) {
      if (held && tally !== undefined) tally.missedByAnchor++;
      placed.push(null);
      // A caller that keeps only a pass placing every cell has its answer
      // (`placePass`, `wholeOrNothing`): the rest are not placed.
      if (stopAtMiss) {
        while (placed.length < shapes.length) placed.push(null);
        return placed;
      }
      continue;
    }
    if (best.anchor === 1 && tally !== undefined) tally.secondAnchorPlaced++;
    const put: Rect = { x: best.x, y: best.y, w: shape.width, h: shape.height };
    for (const other of owned) {
      // Two cells that do not overlap cannot share a texel, and that answer
      // takes no texel to read; only an overlap is scanned, and only over the
      // overlap's own box (`shapesMeet`).
      const apart =
        put.x >= other.x + other.shape.width || other.x >= put.x + put.w || put.y >= other.y + other.shape.height || other.y >= put.y + put.h;
      if (apart) continue;
      if (shapesMeet(shape, put.x, put.y, other.shape, other.x, other.y)) {
        throw new CompileError(
          `internal: the footprint pass placed a ${shape.width}x${shape.height} cell at ${put.x},${put.y} over ` +
            `the footprint of the ${other.shape.width}x${other.shape.height} cell at ${other.x},${other.y}`, 'CE_ATLAS_INTERNAL_FOOTPRINT_OVERLAP',
        );
      }
    }
    placed.push(put);
    owned.push({ shape, x: put.x, y: put.y });
    if (put.y + put.h > maxBottom) {
      while (placed.length < shapes.length) placed.push(null);
      return placed;
    }
    freeLength = splitFreeByCell(free, freeLength, put.x, put.y, shape.rects, minW, minH, edgeIndex, partition, tally);
  }
  return placed;
}

/**
 * One footprint pass on an empty `pageW x pageH` page, run to its end, with
 * what it counted — exported for `tools/pack_anchor.ts` (issue #1104).
 */
export function footprintPass(
  shapes: readonly CellShape[],
  pageW: number,
  pageH: number,
  anchors: FootprintAnchors = DEFAULT_FOOTPRINT_ANCHORS,
): { rects: Array<{ x: number; y: number; w: number; h: number } | null>; tally: PassTally } {
  const tally = emptyTally();
  const rects = packOnePageByFootprint(shapes, pageW, pageH, Infinity, false, true, tally, anchors);
  return { rects, tally };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNumberList = (v: unknown): v is number[] => Array.isArray(v) && v.every((n) => typeof n === 'number' && Number.isFinite(n));

/**
 * What every packed region's attachments draw, read off the `skeleton.json` the
 * build emitted — the footprints `shape: 'polygon'` packs by (issue #1099).
 *
 * The emitted text and not the model, because the footprint has to be what the
 * runtime will sample: the mesh's UVs as the file writes them.
 *
 *   * The region an attachment samples is its `path`, else its `name`, else its
 *     key — the runtime's rule — and a `sequence` samples `that + (start +
 *     frame)` zero-padded to `digits`, for every frame (`start` 1 and `digits` 0
 *     when the file omits them, the parser's defaults).
 *   * A **region** attachment's footprint is its rectangle (`null` here).
 *   * A **mesh**'s is the polygon of its first `hull` vertices, closed from the
 *     last back to the first, and each of its triangles — the hull is the outer
 *     loop of the triangles' union, so for a well-formed mesh the triangles add
 *     nothing, and for one whose triangles reach outside its loop they protect
 *     what is drawn. In the region's own texels: `(u · width, v · height)`.
 *   * A **linked mesh** draws its source's geometry over its own region: the
 *     mesh keyed `source` (`parent` before 4.3) in the slot `slot` names (its
 *     own by default) of the skin `skin` names (`default` by default).
 *   * A region with **any** rectangle use is a rectangle, and so is every
 *     region whose drawing cannot be read as a polygon here — a mesh whose UVs
 *     leave 0..1 (it samples outside its own rectangle, which only the
 *     rectangle keeps the same), a hull or triangle list that does not index its
 *     vertices, a link whose source is not a mesh. Several meshes over one
 *     region give it the union of their polygons.
 *
 * Returns, per region name, its footprint, or `null` for a rectangle; a region
 * no attachment names is absent, and the packer treats it as a rectangle.
 * Nothing read here can be invented: every fallback is the rectangle, which is
 * the footprint `shape: 'rect'` gives everything.
 */
export function packFootprints(
  skeletonText: string,
  sizeOf: (region: string) => { width: number; height: number } | undefined,
): Map<string, PackFootprint | null> {
  const doc: unknown = JSON.parse(skeletonText);
  const skins = isObject(doc) && Array.isArray(doc.skins) ? doc.skins : [];
  const tableOf = (skin: string, slot: string): Record<string, unknown> | undefined => {
    for (const s of skins) {
      if (!isObject(s) || s.name !== skin || !isObject(s.attachments)) continue;
      const table = s.attachments[slot];
      return isObject(table) ? table : undefined;
    }
    return undefined;
  };
  /** A mesh's UV polygons — hull loop, then triangles — or null when they cannot be read as polygons over its own rectangle. */
  const uvPolygonsOf = (mesh: Record<string, unknown>): number[][] | null => {
    const { uvs, hull, triangles } = mesh;
    if (!isNumberList(uvs) || uvs.length % 2 !== 0 || typeof hull !== 'number' || !isNumberList(triangles)) return null;
    const vertices = uvs.length / 2;
    if (!Number.isInteger(hull) || hull < 3 || hull > vertices || triangles.length % 3 !== 0) return null;
    if (uvs.some((n) => n < 0 || n > 1)) return null;
    if (triangles.some((t) => !Number.isInteger(t) || t < 0 || t >= vertices)) return null;
    const out: number[][] = [uvs.slice(0, 2 * hull)];
    for (let t = 0; t < triangles.length; t += 3) {
      const [a, b, c] = [triangles[t], triangles[t + 1], triangles[t + 2]];
      out.push([uvs[2 * a], uvs[2 * a + 1], uvs[2 * b], uvs[2 * b + 1], uvs[2 * c], uvs[2 * c + 1]]);
    }
    return out;
  };
  const uses = new Map<string, number[][][] | null>();
  const use = (region: string, polygons: number[][] | null): void => {
    const held = uses.get(region);
    if (held === null) return;
    if (polygons === null) uses.set(region, null);
    else if (held === undefined) uses.set(region, [polygons]);
    else held.push(polygons);
  };
  for (const s of skins) {
    if (!isObject(s) || !isObject(s.attachments)) continue;
    for (const [slot, table] of Object.entries(s.attachments)) {
      if (!isObject(table)) continue;
      for (const [key, att] of Object.entries(table)) {
        if (!isObject(att)) continue;
        const type = att.type ?? 'region';
        if (type !== 'region' && type !== 'mesh' && type !== 'linkedmesh') continue;
        const base = typeof att.path === 'string' ? att.path : typeof att.name === 'string' ? att.name : key;
        const regions: string[] = [];
        const seq = att.sequence;
        if (isObject(seq) && typeof seq.count === 'number') {
          const start = typeof seq.start === 'number' ? seq.start : 1;
          const digits = typeof seq.digits === 'number' ? seq.digits : 0;
          for (let f = 0; f < seq.count; f++) regions.push(base + String(start + f).padStart(digits, '0'));
        } else regions.push(base);
        let polygons: number[][] | null = null;
        if (type === 'mesh') polygons = uvPolygonsOf(att);
        else if (type === 'linkedmesh') {
          const sourceKey = typeof att.source === 'string' ? att.source : typeof att.parent === 'string' ? att.parent : null;
          const source =
            sourceKey === null
              ? undefined
              : tableOf(typeof att.skin === 'string' ? att.skin : 'default', typeof att.slot === 'string' ? att.slot : slot)?.[sourceKey];
          polygons = isObject(source) && source.type === 'mesh' ? uvPolygonsOf(source) : null;
        }
        for (const region of regions) use(region, polygons);
      }
    }
  }
  const out = new Map<string, PackFootprint | null>();
  for (const [region, held] of uses) {
    const size = sizeOf(region);
    if (held === null || size === undefined) {
      out.set(region, null);
      continue;
    }
    const polygons = held.flat().map((poly) => poly.map((n, i) => n * (i % 2 === 0 ? size.width : size.height)));
    out.set(region, { polygons });
  }
  return out;
}

/**
 * Copy the texels a region owns (`CellShape.mask`) onto a page, with the
 * values `extrudeCell` gives them — the second of `shape: 'polygon'`'s two
 * drawing passes (see `packAtlas`).
 */
function extrudeOwned(page: Plate, source: Plate, cellX: number, cellY: number, padding: number, shape: CellShape): void {
  const w = source.width;
  const h = source.height;
  const dst = page.data;
  const src = source.data;
  for (let cy = 0; cy < shape.height; cy++) {
    const sy = Math.max(0, Math.min(h - 1, cy - padding));
    const srcRow = sy * w * 4;
    const dstRow = (cellY + cy) * page.width * 4;
    for (let cx = 0; cx < shape.width; cx++) {
      if (shape.mask[cy * shape.width + cx] === 0) continue;
      const sx = Math.max(0, Math.min(w - 1, cx - padding));
      const s = srcRow + sx * 4;
      const d = dstRow + (cellX + cx) * 4;
      dst[d] = src[s];
      dst[d + 1] = src[s + 1];
      dst[d + 2] = src[s + 2];
      dst[d + 3] = src[s + 3];
    }
  }
}

/**
 * The packing order, and it is stated rather than inherited.
 *
 * Descending by long side then by area is what makes a shelf packer behave; the
 * name is the final tie-break so that two parts of identical size always pack in
 * the same order. Region names are unique within a compile (a region name IS the
 * PNG basename, and `addImage` refuses a duplicate), so this is a TOTAL order —
 * which is the property `sort` needs for its result not to depend on the order
 * it was handed. `Bun.Glob` and `readdirSync` are both unsorted; nothing here
 * relies on the caller having sorted anything.
 */
function packOrder(a: PackInput, b: PackInput): number {
  const longA = Math.max(a.width, a.height);
  const longB = Math.max(b.width, b.height);
  if (longA !== longB) return longB - longA;
  const areaA = a.width * a.height;
  const areaB = b.width * b.height;
  if (areaA !== areaB) return areaB - areaA;
  return a.region < b.region ? -1 : a.region > b.region ? 1 : 0;
}

/**
 * Copy one region's pixels onto a page, and fill its gutter by extending its
 * edges outwards.
 *
 * ⭐ **This is what makes the packed render agree with the unpacked one, and it is
 * not an optimisation.**
 * The rasteriser samples a page bilinearly and `bilinear` CLAMPS its taps to the
 * page's bounds ([`src/render.ts`](render.ts)) — so on an unpacked page, where
 * the region IS the page, a sample at the region's outer edge reads that edge
 * twice. Pack the same region into the middle of a bigger page and the clamp
 * stops happening: the second tap is now whatever is next door. Transparent
 * gutter is not a fix, it is a different wrong answer — the edge would fade.
 *
 * Extending the edge outwards reproduces the clamp exactly, because it makes the
 * neighbouring texel equal to the edge texel, which is what the clamp returned.
 * One pixel is all bilinear can reach; the gutter is `padding` pixels because a
 * consumer that mipmaps the page averages 2x2 blocks and 2 keeps that average
 * inside the region's own colours one level down. Hence `DEFAULT_PADDING = 2`:
 * 1 is the correctness floor, 2 is the floor plus one level of headroom, and 0
 * would put two unrelated drawings in adjacent texels.
 */
function extrudeCell(page: Plate, source: Plate, cellX: number, cellY: number, padding: number): void {
  const w = source.width;
  const h = source.height;
  // Straight into the two buffers: a 1024x1024 page is a million pixels and
  // `Plate.get` allocates a tuple per read.
  const dst = page.data;
  const src = source.data;
  for (let cy = 0; cy < h + 2 * padding; cy++) {
    const sy = Math.max(0, Math.min(h - 1, cy - padding));
    const srcRow = sy * w * 4;
    const dstRow = (cellY + cy) * page.width * 4;
    for (let cx = 0; cx < w + 2 * padding; cx++) {
      const sx = Math.max(0, Math.min(w - 1, cx - padding));
      const s = srcRow + sx * 4;
      const d = dstRow + (cellX + cx) * 4;
      dst[d] = src[s];
      dst[d + 1] = src[s + 1];
      dst[d + 2] = src[s + 2];
      dst[d + 3] = src[s + 3];
    }
  }
}

/** Where every part lands and the size each page is written at — one candidate's whole pack, before anything is drawn. */
interface PackLayout {
  /** page index -> the placements on it, in packing order. */
  perPage: Placement[][];
  /** page index -> the size that page is written at. */
  pageSizes: Array<{ width: number; height: number }>;
  placements: Placement[];
}

/**
 * One whole pack's layout under one placement rule: the single-page search,
 * or — when the set does not fit one page — the spill, each page then shrunk
 * to the smallest that holds it. `shapes` absent is the rectangle pass
 * throughout (`rect`, and the first of `polygon`'s candidates); given, the
 * footprint pass under `anchors`.
 */
function layoutPack(
  sorted: readonly PackInput[],
  cells: Array<{ w: number; h: number }>,
  shapes: readonly CellShape[] | undefined,
  maxEdge: number,
  pageEdges: PageEdges,
  padding: number,
  anchors: FootprintAnchors,
  tally?: PassTally,
  stopAtMiss = true,
  partition = true,
): PackLayout {
  const single = smallestPageFor(cells, maxEdge, pageEdges, shapes, anchors, tally, stopAtMiss, partition);

  /** page index -> the placements on it, in packing order. */
  const perPage: Placement[][] = [];
  /** page index -> the size that page is written at. */
  const pageSizes: Array<{ width: number; height: number }> = [];
  const placements: Placement[] = [];
  if (single !== null) {
    perPage.push([]);
    pageSizes.push({ width: single.width, height: single.height });
    single.rects.forEach((rect, i) => {
      const place: Placement = {
        region: sorted[i].region,
        page: 0,
        x: rect.x + padding,
        y: rect.y + padding,
        width: sorted[i].width,
        height: sorted[i].height,
      };
      perPage[0].push(place);
      placements.push(place);
    });
  } else {
    // Spill. Which parts share a page is decided at the MAXIMUM size — that is
    // what makes the boundary deterministic and independent of the shrink below
    // — and parts are taken in packing order, whatever will not fit the current
    // page opening the next one.
    let remaining = sorted.map((input, i) => ({ input, cell: cells[i], shape: shapes?.[i] }));
    const shapesOf = (list: typeof remaining): CellShape[] | undefined =>
      shapes === undefined ? undefined : list.map((r) => r.shape ?? footprintCell(r.input.width, r.input.height, padding));
    while (remaining.length > 0) {
      const pageIndex = perPage.length;
      const attempt = placePass(
        remaining.map((r) => r.cell),
        shapesOf(remaining),
        maxEdge,
        maxEdge,
        Infinity,
        { anchors, tally, partition },
      );
      const onPage: typeof remaining = [];
      const leftOver: typeof remaining = [];
      attempt.forEach((rect, i) => {
        if (rect === null) leftOver.push(remaining[i]);
        else onPage.push(remaining[i]);
      });
      if (onPage.length === 0) {
        // Unreachable: every cell was proven to fit an empty page above. Kept as
        // a named stop rather than an infinite loop if that ever stops holding.
        throw new CompileError(
          `packing stalled with ${remaining.length} region(s) left and an empty ${maxEdge}x${maxEdge} page`, 'CE_ATLAS_PACKING_STALLED',
        );
      }
      // ⭐ Then the page is written at the smallest power-of-two pair that holds
      // the cells assigned to it, not at the maximum (issue #266, follow-up 3).
      // A spill used to write `pageSize x pageSize` for every page, so a set that
      // overflowed by one small part paid for a second full page of transparency
      // — 4 MiB of decoded RAM at the 2048 default for a part that might be
      // 64x64. Re-packing through the same search the single-page case uses is
      // what keeps "the page written is the smallest that holds what is on it"
      // one rule; a page whose own cells need the maximum simply gets it back.
      const shrunk = smallestPageFor(
        onPage.map((r) => r.cell),
        maxEdge,
        pageEdges,
        shapesOf(onPage),
        anchors,
        tally,
        stopAtMiss,
        partition,
      );
      if (shrunk === null) {
        // Unreachable for the same reason as the stall above: these cells were
        // just placed on a maxEdge page.
        throw new CompileError(`page ${pageIndex + 1} of the spill holds ${onPage.length} region(s) that no page fits`, 'CE_ATLAS_SPILL_UNPACKABLE');
      }
      const onThisPage: Placement[] = [];
      shrunk.rects.forEach((rect, i) => {
        const place: Placement = {
          region: onPage[i].input.region,
          page: pageIndex,
          x: rect.x + padding,
          y: rect.y + padding,
          width: onPage[i].input.width,
          height: onPage[i].input.height,
        };
        onThisPage.push(place);
        placements.push(place);
      });
      perPage.push(onThisPage);
      pageSizes.push({ width: shrunk.width, height: shrunk.height });
      remaining = leftOver;
    }
  }

  return { perPage, pageSizes, placements };
}

/**
 * Pack these parts onto shared pages.
 *
 * ## Page size
 *
 * `pageSize` is a MAXIMUM, not the size written. Both page edges are powers of
 * two and the pack is tried at every power-of-two pair up to that maximum, in
 * order of increasing area, so a four-part rig gets a 128x64 page rather than a
 * megabyte of transparency. Powers of two are not decoration: `region.x /
 * page.width` is the sampling coordinate every texel is read through, and a
 * power-of-two denominator makes that division exact in binary floating point —
 * which is what keeps a packed region's samples on the same grid as the unpacked
 * page's. With a non-power-of-two page the region origin itself would round, and
 * the one-bit residual described in this file's header would be two roundings
 * deep instead of one.
 *
 * Only when the whole set will not fit one page at the maximum does it spill.
 * **Which parts share a page is then decided at the maximum size** — that is what
 * makes the boundary deterministic — **and each page is written at the smallest
 * power-of-two pair that holds the cells assigned to it** (issue #266). So the
 * rule is the same one either way: the page written is the smallest that holds
 * what is on it. A spill used to write `pageSize x pageSize` for every page,
 * which charged a set that overflowed by one small part a second full page of
 * transparency — 4 MiB of decoded RAM at the 2048 default. A single part whose
 * cell is bigger than the maximum is refused by name — silently splitting one
 * drawing across two pages is not a thing the format can express.
 *
 * ## `pageEdges: 'free'` — a page sized to the parts rather than to a power of two (issue #860)
 *
 * Opt-in, and the default stays `pot`: every runtime accepts a power-of-two page
 * and the editor's own packer writes one by default — 9 of the 10 atlases in the
 * fetched `examples/` corpus are power-of-two on both edges. Under `free` the
 * search is `smallestFreePageFor`: every width from the widest cell up (issue
 * #872; a 32-px grid until then), the height the placement needs, least area
 * first, then squarer, then narrower, with two exact bounds that keep it cheap. Everything
 * else is shared — the MaxRects pass, the packing order, the spill rule (which
 * parts share a page is still decided at `maxEdge x maxEdge`) and `--page-size`
 * as the ceiling on both edges, floored to a power of two exactly as under `pot`.
 *
 * What it buys and what it costs, observed on two 20- and 22-part painting rigs:
 * the page goes from 1024x2048 to 967x1338 (2,097,152 to 1,293,846 texels,
 * -38.3 %) and from 512x2048 to 479x1166 (1,048,576 to 558,514, -46.7 %). Under
 * the 32-px grid #860 shipped with they were 1888x697 (-37.3 %) and 480x1166
 * (-46.6 %). The cost is the exactness the paragraph above describes:
 * `x / pageWidth` is no longer exact, so a REGION attachment's sampling
 * coordinate joins a mesh's at `PK05`'s bound of one least significant bit
 * against the loose build. It does not go past it, and no region's bytes change
 * (`PK02`'s lift-back holds under both).
 *
 * ## `shape: 'polygon'` — rectangles that overlap where nothing is drawn (issue #1099)
 *
 * Opt-in, and the default stays `rect`, which is this function exactly as it
 * was before the option: under `rect` no footprint is computed and every pass
 * is `packOnePage`. Under `polygon` every input carries the footprint its
 * attachments draw (`packFootprints`: a mesh's emitted hull, a region
 * attachment's rectangle), and:
 *
 *   * **what a cell owns** is `footprintCell`'s set — the footprint grown by the
 *     padding, clipped to the cell; two cells may overlap when they own no texel
 *     in common, which between two rectangles is `rect`'s rule and between any
 *     two footprints keeps them `2 · padding` apart (`CellShape`);
 *   * **the placement** is `packOnePageByFootprint`, MaxRects with the free list
 *     split by what each cell owns, run beside the rectangle pass on every page
 *     tried and kept only when it is better (`placePass`);
 *   * **the pack written** is the least Σ page area — over every page, a spill's
 *     included — of three whole packs: `rect`'s, the footprint pack under the
 *     owned box's anchor, and under `box-else-cell` (issue #1104), the earlier
 *     on a tie. So a `polygon` pack is never larger in page area than `rect`'s
 *     on any set, by construction, and a set with no mesh footprint is `rect`'s
 *     pack to the byte (`PK82`). The per-page rule alone never promised that
 *     across a spill: seed 1105 under `pot` packed 8,388,608 texels against
 *     `rect`'s 6,291,456 before it (`PK96`). It costs the three packs' searches
 *     — no search is shared, since a free search's bounds depend on the best
 *     page its own passes found;
 *   * **the pixels** are drawn in two passes: every cell whole in packing order,
 *     as under `rect`, then every region's owned texels again with its own
 *     values. The owned sets are disjoint, so the second pass's order decides
 *     nothing and every texel a region can sample is its own (`PK79`); a texel
 *     nobody owns carries the last cell drawn over it, which nothing samples.
 *
 * What it costs is measured, not conceded: a region that moves samples through
 * a different `x / pageWidth`, so on the two gallery rigs whose pack moved,
 * 207 and 36 channel samples differ from the `rect` render, every one by 1 —
 * the bit two `rect` packs of the same rig differ by when one is `pot` and one
 * `free` (155 and 44). `--page-edges`, the width search and the spill rule are
 * unchanged.
 *
 * ⚠️ `pot` is not the smaller answer's poor relation, and its search was never
 * "double until it fits": it tries every power-of-two pair in order of area.
 * On both rigs above the cells' own area (1,206,755 and 540,793 texels at
 * padding 2) already exceeds the next power-of-two page down, so no `pot`
 * packer could do better; the only lever left was the power of two itself.
 */
export function packAtlas(inputs: PackInput[], opts: PackOptions = {}): PackResult {
  const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;
  const padding = opts.padding ?? DEFAULT_PADDING;
  const stem = opts.pageStem ?? 'skeleton';
  const pageEdges = opts.pageEdges ?? DEFAULT_PAGE_EDGES;
  if (!PAGE_EDGES.includes(pageEdges)) {
    throw new CompileError(`--page-edges ${JSON.stringify(String(opts.pageEdges))}; known values: ${PAGE_EDGES.join(', ')}`, 'CE_ATLAS_PAGE_EDGES_VALUE');
  }
  const shape = opts.shape ?? DEFAULT_PACK_SHAPE;
  if (!PACK_SHAPES.includes(shape)) {
    throw new CompileError(`--pack-shape ${JSON.stringify(String(opts.shape))}; known values: ${PACK_SHAPES.join(', ')}`, 'CE_ATLAS_PACK_SHAPE_VALUE');
  }
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new CompileError(`--page-size must be a positive integer, got ${String(opts.pageSize)}`, 'CE_ATLAS_PAGE_SIZE_POSITIVE_INTEGER');
  }
  if (!Number.isInteger(padding) || padding < 0) {
    throw new CompileError(`--padding must be a non-negative integer, got ${String(opts.padding)}`, 'CE_ATLAS_PADDING_NONNEGATIVE_INTEGER');
  }
  if (inputs.length === 0) throw new CompileError('nothing to pack: this compile emitted no images', 'CE_ATLAS_IMAGES_REQUIRED');

  const maxEdge = floorPowerOfTwo(pageSize);

  const sorted = inputs.slice().sort(packOrder);
  const cells = sorted.map((input) => ({ w: input.width + 2 * padding, h: input.height + 2 * padding }));

  for (let i = 0; i < sorted.length; i++) {
    if (cells[i].w <= maxEdge && cells[i].h <= maxEdge) continue;
    throw new CompileError(
      `"${sorted[i].region}" is ${sorted[i].width}x${sorted[i].height} and with --padding ${padding} needs a ` +
        `${cells[i].w}x${cells[i].h} cell, which does not fit a ${maxEdge}x${maxEdge} page ` +
        `(${sorted[i].absPath}). Raise --page-size, lower --padding, or leave this build unpacked — a packer ` +
        'cannot split one drawing across two pages.', 'CE_ATLAS_REGION_EXCEEDS_PAGE',
    );
  }

  // `polygon` only: every cell's protected set. Under `rect` there are none and
  // every pass below is the rectangle pass, the code it was before #1099.
  const shapes =
    shape === 'polygon' ? sorted.map((input) => footprintCell(input.width, input.height, padding, input.footprint)) : undefined;

  // ⭐ `polygon` is a choice between whole packs (issue #1104), made on the
  // one figure the mode exists to lower — the sum of the pages' areas — and
  // made over every page, a spill's included. The candidates, in order: the
  // rectangle pack (`rect`'s own, to the byte); the footprint pack with the
  // owned box's anchor (`box`); and the footprint pack that may also put a
  // cell's own corner where the first anchor would leave the page
  // (`box-else-cell`). The least Σ area wins, the earlier candidate on a tie.
  // So a `polygon` pack is never larger than `rect`'s, nor than the one-anchor
  // pack, on any set — by construction, across a spill as well as on one page,
  // which no single greedy rule gives: one more candidate position placed
  // PK78's gem differently and every tile after it (one page 7.2 % larger),
  // and the first page of a spill choosing differently left seed 1105 under
  // `pot` on two 2048x2048 pages against `rect`'s 2048x2048 + 1024x2048.
  // `footprintAnchors` names one rule alone instead (the instrument, the plant).
  const candidates: Array<{ name: PackCandidate; layout: PackLayout }> = [];
  if (shapes === undefined) candidates.push({ name: 'rect', layout: layoutPack(sorted, cells, undefined, maxEdge, pageEdges, padding, 'box', opts.tally, opts.stopAtMiss ?? true, opts.partition ?? true) });
  else if (opts.footprintAnchors !== undefined) candidates.push({ name: opts.footprintAnchors, layout: layoutPack(sorted, cells, shapes, maxEdge, pageEdges, padding, opts.footprintAnchors, opts.tally, opts.stopAtMiss ?? true, opts.partition ?? true) });
  else {
    candidates.push({ name: 'rect', layout: layoutPack(sorted, cells, undefined, maxEdge, pageEdges, padding, 'box', opts.tally, opts.stopAtMiss ?? true, opts.partition ?? true) });
    for (const rule of POLYGON_CANDIDATE_RULES) candidates.push({ name: rule, layout: layoutPack(sorted, cells, shapes, maxEdge, pageEdges, padding, rule, opts.tally, opts.stopAtMiss ?? true, opts.partition ?? true) });
  }
  const areaOf = (layout: PackLayout): number => layout.pageSizes.reduce((n, p) => n + p.width * p.height, 0);
  let chosen = candidates[0];
  for (const c of candidates) if (areaOf(c.layout) < areaOf(chosen.layout)) chosen = c;
  const { perPage, pageSizes, placements } = chosen.layout;

  // Draw. Reading each source once, in packing order, keeps the decode count at
  // one per part whatever the page layout turned out to be.
  const byRegion = new Map(sorted.map((input) => [input.region, input]));
  const shapeByRegion = new Map<string, CellShape>();
  if (shapes !== undefined) sorted.forEach((input, i) => shapeByRegion.set(input.region, shapes[i]));
  const pages: PackedPage[] = [];
  const emitPages: EmitPage[] = [];
  perPage.forEach((onPage, index) => {
    const { width: pageW, height: pageH } = pageSizes[index];
    const plate = new Plate(pageW, pageH);
    let covered = 0;
    /** `polygon` only: each region's source and protected set, for the second pass. */
    const owners: Array<{ source: Plate; place: Placement; shape: CellShape }> = [];
    for (const place of onPage) {
      const input = byRegion.get(place.region)!;
      const source = input.plate ?? readPlate(input.absPath);
      if (source.width !== input.width || source.height !== input.height) {
        // The size in the atlas came from the PNG's IHDR (`readPngInfo`); this is
        // the decoded image. They disagreeing means the file changed between the
        // two reads, or one of the two readers is wrong about it.
        throw new CompileError(
          `"${place.region}" measured ${input.width}x${input.height} from its PNG header and decodes to ` +
            `${source.width}x${source.height} (${input.absPath})`, 'CE_ATLAS_IMAGE_DIMENSIONS_CHANGED',
        );
      }
      extrudeCell(plate, source, place.x - padding, place.y - padding, padding);
      covered += place.width * place.height;
      const owned = shapeByRegion.get(place.region);
      if (owned !== undefined) owners.push({ source, place, shape: owned });
    }
    // `polygon`'s second pass. The first wrote every cell whole, in packing
    // order, so where two cells overlap the later one's texels lie on top; this
    // one writes each region's protected set again, with its own values. The
    // sets are pairwise disjoint (the footprint test), so the order of this pass
    // decides nothing, and every texel a region owns ends as its own: a texel
    // under some region's footprint carries that region's value, and a texel
    // under none carries the last cell drawn over it.
    // Every region, a whole cell's included: a rectangle's texels are what a
    // later mesh's cell is most likely to have been drawn over. A page whose
    // every cell is whole had no overlap to undo and is left as the first pass
    // drew it, which is `rect`'s page.
    if (owners.some((o) => !o.shape.whole)) {
      for (const { source, place, shape: owned } of owners) extrudeOwned(plate, source, place.x - padding, place.y - padding, padding, owned);
    }
    const name = index === 0 ? `${stem}.png` : `${stem}${index + 1}.png`;
    pages.push({ name, width: pageW, height: pageH, plate, occupancy: covered / (pageW * pageH) });
    emitPages.push({
      name,
      width: pageW,
      height: pageH,
      // Within a page, regions are listed by name. Placement order is equally
      // deterministic; a name order makes two packs of the same set diffable
      // even when a part changed size and moved.
      regions: onPage
        .slice()
        .sort((a, b) => (a.region < b.region ? -1 : a.region > b.region ? 1 : 0))
        .map((place) => ({
          name: place.region,
          x: place.x,
          y: place.y,
          width: place.width,
          height: place.height,
          // No trim: `offsets` states the drawing's full size and a zero inset,
          // which is what makes a region's own width/height the attachment's.
          offsetX: 0,
          offsetY: 0,
          originalWidth: place.width,
          originalHeight: place.height,
        })),
    });
  });

  return { pages, placements, atlasText: writeAtlasText(emitPages), padding, shape, candidate: chosen.name };
}

// ---------------------------------------------------------------------------
// reading one region back out of a page
// ---------------------------------------------------------------------------

/**
 * One region's drawing, lifted off its page.
 *
 * Two callers, and they are the reason this is a function rather than two loops:
 * the compiler needs a part's own pixel grid when a generator measures the art
 * (a contour mesh traces its alpha), and the selftest needs it to assert that a
 * packed region is a LOSSLESS copy of the loose PNG it came from. One extractor
 * means the proof and the use cannot drift.
 *
 * The result is `originalWidth x originalHeight` — the untrimmed drawing — with
 * the kept rectangle placed at its trim offset and the rest left transparent.
 * `offsetY` is measured from the drawing's BOTTOM (the format's convention) and
 * a plate's rows run downwards, so the kept rectangle's top row is
 * `originalHeight - offsetY - height`.
 *
 * ## A rotated region is MEASURED, not guessed at (issue #570)
 *
 * This refused a rotated region until 2026-09-17, on the argument that the
 * runtime holds "three opinions" about the mapping. Measurement refutes the
 * argument: the three are not three readings of one mapping, they are one
 * mapping and two places that do not implement it.
 *
 *   * `MeshAttachment.computeUVs` (spine-core 4.3.13,
 *     `dist/attachments/MeshAttachment.js:126-162`) is the one routine that
 *     states where a region's texels are for **all four** `degrees`, and it is
 *     the routine `substituteTexture` in [`src/render.ts`](render.ts) already
 *     goes through. The loop below inverts what it samples: `PKR02` asks it,
 *     for every texel of every region of the corpus atlases, which page texel
 *     the runtime samples and compares the lift — 132 regions, 2,848,402
 *     texels, 0 apart, three of them turned (90 twice, 270 once) and each of
 *     those lifting differently with the turn ignored; `PK29` lifts the
 *     packer's fixture at each of 0, 90, 180 and 270 back to its PNG byte for
 *     byte;
 *   * `TextureAtlas`'s `u2`/`v2` (`dist/TextureAtlas.js:164-171`) transpose the
 *     rectangle at 90 and not at 270, so at 270 they describe a rectangle the
 *     page does not have — but `MeshAttachment.computeUVs` never reads them for
 *     an atlas region, and neither does this;
 *   * `RegionAttachment.computeUVs` (`dist/attachments/RegionAttachment.js:156-167`)
 *     assigns the turned corner order at 90 and at nothing else, which is a
 *     region-attachment rendering defect (issue #199) and not a statement about
 *     where the drawing sits.
 *
 * On texel centres — at 90 and 270 measured against the runtime's sampling
 * (`PKR02`), at 180 against the packer fixture's turn (`PK29`) — the mapping
 * puts kept-rectangle pixel `(x, y)` — `x` from the drawing's left, `y` down from `top` — at page
 * pixel `(X + x, Y + y)` unturned, `(X + y, Y + width - 1 - x)` at 90,
 * `(X + width - 1 - x, Y + height - 1 - y)` at 180 and
 * `(X + height - 1 - y, Y + x)` at 270, writing `X`/`Y` for the region's own
 * `x`/`y`; the packed footprint is `height x width` for the two quarter turns
 * and `width x height` for the other two. `repackRotatedTrimmed` in
 * `selftest.ts` derived the same 270 mapping for issue #199's fixture, and had
 * been shipping it green, while this comment claimed the mapping was unknowable.
 *
 * ⚠️ Any other `degrees` takes the unturned branch, because that is what the
 * runtime does with it: `regionFields.rotate` (`dist/TextureAtlas.js:87-93`)
 * `parseInt`s the value without checking it, and `computeUVs` falls to
 * `default:` for everything that is not 90, 180 or 270. Reading such a region
 * unturned is not a guess, it is agreement with the thing that will draw it.
 *
 * rigc's own packer still never rotates (`PACK_NO_ROTATE`), so only a foreign
 * atlas reaches any branch but the first.
 */
export function extractRegion(page: Plate, region: AtlasRegion): Plate {
  const out = new Plate(region.originalWidth, region.originalHeight);
  const top = region.originalHeight - region.offsetY - region.height;
  const { degrees } = region;
  for (let y = 0; y < region.height; y++) {
    for (let x = 0; x < region.width; x++) {
      const px =
        degrees === 90
          ? region.x + y
          : degrees === 180
            ? region.x + region.width - 1 - x
            : degrees === 270
              ? region.x + region.height - 1 - y
              : region.x + x;
      const py =
        degrees === 90
          ? region.y + region.width - 1 - x
          : degrees === 180
            ? region.y + region.height - 1 - y
            : degrees === 270
              ? region.y + x
              : region.y + y;
      out.set(region.offsetX + x, top + y, page.get(px, py));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// a page against the file it names
// ---------------------------------------------------------------------------

/**
 * The one page rectangle every region on a page shares: the size the atlas
 * declares for it against the size of the file it names.
 *
 * ⭐ **What a size that disagrees with the file is and is not**, measured rather
 * than assumed (issue #715). `TextureAtlas` computes every region's UVs as a
 * fraction of the DECLARED size — `region.u = region.x / page.width`, spine-core
 * 4.3.13 `dist/TextureAtlas.js:162-171` — `MeshAttachment.computeUVs` takes its
 * `textureWidth` from the same field (`dist/attachments/MeshAttachment.js:125`),
 * `RegionAttachment.computeUVs` reads nothing but `u/v/u2/v2`
 * (`dist/attachments/RegionAttachment.js:152-167`), and `TextureAtlasPage.setTexture`
 * never writes `width`/`height`. So **nothing in the region mapping reads the
 * texture's own size**, and a page whose PNG is the declared page RESCALED is
 * addressed at the same fraction of the picture whatever size the file is:
 * measured on a coordinate-ramp page where every texel names its own position,
 * rigc's own rasteriser drew 116,480 pixels in both and 0 in exactly one at a
 * uniform 0.5.
 *
 * ⇒ That is why this is a clause about **texel** readers rather than about
 * drawing, and why it is nevertheless not renderer policy. Three readers address
 * the page at the coordinates the atlas states, and two of them are rigc's own:
 * `A19`'s alpha scan in [`src/validate.ts`](validate.ts), the region lift
 * `partPlate` traces a mesh generator over in [`src/compile.ts`](compile.ts), and `spine-html`'s region tier, which
 * cuts each part with `drawImage(image, x, y, w, h, …)` and says in its own
 * comment that it tests against the image rather than the `size:` line. Measured
 * on the same page: the lift returned 768 of 768 texels from somewhere else.
 *
 * 🔑 And the format already states coarser texels honestly — `scale:`, which
 * rigc reads (`AtlasPage.scale`) and `--atlas-in` divides by. The same art
 * declared that way builds green and renders identically, so this refusal names
 * a repair the format provides rather than one rigc invented.
 */
export interface PageGridReading {
  /** file width / declared width, and the same for height. Both 1 when they agree. */
  readonly x: number;
  readonly y: number;
  /** One ratio for both axes — the only relation a `scale:` line can state. */
  readonly uniform: boolean;
}

/** `null` when the page declares no positive size for the ratios to divide by. */
export function pageGridReading(
  declared: { width: number; height: number },
  file: { width: number; height: number },
): PageGridReading | null {
  if (declared.width <= 0 || declared.height <= 0) return null;
  return {
    x: file.width / declared.width,
    y: file.height / declared.height,
    // Cross-multiplied rather than compared as two divisions: the question is
    // whether one rational number describes both axes, and two floats that
    // round to the same digits are not that.
    uniform: file.width * declared.height === file.height * declared.width,
  };
}

/** A ratio, printed the one way every message here prints one. */
function gridRatio(n: number): string {
  return n.toFixed(4);
}

/**
 * The first number on this page that a `scale:` re-declaration could not carry,
 * or `null` when every one of them lands on a whole texel of the file.
 *
 * Every number in a region block is in the page's own texel units — `bounds` and
 * `offsets` alike — so re-declaring the page at the file's size means scaling all
 * eight by the same ratio, and a region that then lands between texels is one no
 * reader could cut out. Stated as integer arithmetic (`n * file % declared`)
 * rather than as a float test, so the answer does not depend on how the ratio
 * rounded. ⚠️ One ratio for both axes, so this is the UNIFORM case's question
 * and is only ever asked there — a page whose two axes differ has no `scale:`
 * line to be re-declared with at all.
 */
function firstNumberOffTheCoarseGrid(
  regions: ReadonlyArray<{
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
    originalWidth: number;
    originalHeight: number;
  }>,
  declared: number,
  file: number,
): string | null {
  for (const region of regions) {
    const numbers: Array<[string, number]> = [
      ['bounds x', region.x],
      ['bounds y', region.y],
      ['bounds width', region.width],
      ['bounds height', region.height],
      ['offsets offsetX', region.offsetX],
      ['offsets offsetY', region.offsetY],
      ['offsets originalWidth', region.originalWidth],
      ['offsets originalHeight', region.originalHeight],
    ];
    for (const [field, value] of numbers) {
      if ((value * file) % declared === 0) continue;
      return (
        `region ${JSON.stringify(region.name.trim())}'s \`${field}\` of ${value} becomes ` +
        `${((value * file) / declared).toFixed(4)} on the file's own grid, which is not a whole texel`
      );
    }
  }
  return null;
}

/** What every size-mismatch sentence says before it says what to do about it. */
const PAGE_GRID_PREAMBLE =
  'A runtime does not read the file\'s own size anywhere in the region mapping — `TextureAtlas` computes every ' +
  "region's UVs as a fraction of the DECLARED size (`region.u = region.x / page.width`, spine-core " +
  '`dist/TextureAtlas.js:162-171`) — so a page whose PNG is the declared page RESCALED draws the same picture at ' +
  "the file's resolution, and one whose PNG is anything else draws whatever sits at those fractions. What a " +
  'declared size that disagrees with the file breaks is every reader that addresses the page in TEXELS: this ' +
  "validator's own `A19` alpha scan, the region lift rigc's mesh generators trace, and a canvas renderer that " +
  'cuts each part out of the page by source rectangle.';

/**
 * What a page that is not its declared size is, stated as the page, both sizes
 * and the two ratios — the clause every message about it opens with.
 *
 * `A06`'s refusal starts with it, and so does every line in which a reader that
 * addresses the page in texels declines to (issue #750): `explain` and `build`
 * print it where they withhold a mesh's fit, and the contour generator's refusal
 * carries the whole of `pageGridSentence` below. One derivation, so a page is
 * never described two ways by the two halves of one run.
 */
export function pageGridSaid(
  page: { name: string; width: number; height: number },
  file: { width: number; height: number },
): string {
  const said = `page "${page.name}" declares ${page.width}x${page.height} and its PNG is ${file.width}x${file.height}`;
  const grid = pageGridReading(page, file);
  return grid === null
    ? said
    : `${said} — ${gridRatio(grid.x)} of the declared width and ${gridRatio(grid.y)} of the declared height`;
}

/**
 * `A06`'s whole sentence for a page whose file is not its declared size, or
 * `null` when the two agree: the page and its ratios (`pageGridSaid`), why a
 * runtime still draws it and which readers it breaks, and the repair the format
 * offers — or why it offers none.
 *
 * It lives here rather than in [`src/validate.ts`](validate.ts) because the
 * compiler states it too, and `src/compile.ts` must not link the runtime that
 * file links. `regions` is the page's own regions; only the uniform case reads
 * them, to find a number a `scale:` re-declaration could not carry.
 */
export function pageGridSentence(
  page: { name: string; width: number; height: number },
  file: { width: number; height: number },
  regions: Parameters<typeof firstNumberOffTheCoarseGrid>[0],
): string | null {
  if (page.width === file.width && page.height === file.height) return null;
  const said = pageGridSaid(page, file);
  const grid = pageGridReading(page, file);
  if (grid === null) return `${said}. ${PAGE_GRID_PREAMBLE}`;
  const off = grid.uniform ? firstNumberOffTheCoarseGrid(regions, page.width, file.width) : null;
  const repair = !grid.uniform
    ? 'The `scale:` header states one ratio for both axes, so a page whose axes differ cannot be ' +
      `declared honestly at all: re-export the page at ${page.width}x${page.height}, or repack it.`
    : off !== null
      ? 'The format states coarser texels with the `scale:` header, but this page cannot be re-declared ' +
        `that way: ${off}. Re-export the page at ${page.width}x${page.height}, or repack it.`
      : 'The format states coarser texels with the `scale:` header and rigc builds that: declare ' +
        `\`size: ${file.width}, ${file.height}\` with \`scale: ${gridRatio(grid.x)}\` and multiply every ` +
        `\`bounds\`/\`offsets\` on this page by ${gridRatio(grid.x)}, and every part keeps the size it ` +
        'has now.';
  return `${said}. ${PAGE_GRID_PREAMBLE} ${repair}`;
}
