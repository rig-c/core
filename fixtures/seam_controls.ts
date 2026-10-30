/** Cell-level seam controls. No art, runtime, filesystem or browser required. */
import { Plate } from '../tools/plate.ts';
import { renderFrame, type AttachmentRest, type Piece } from '../src/render_shared.ts';
import { seamLine, seamsOf, type SeamPairReading, type SeamPlant } from '../src/seam.ts';

export interface SeamCellControl { name: string; faults: string[]; detail: string }

export function seamCellControls(): SeamCellControl[] {
  const rows: SeamCellControl[] = [];
  const rect = (slot: string, x: number, w = 4, h = 4, page = slot): Piece => ({ kind: 'region', slot, page, world: [x, 0, x, h, x + w, h, x + w, 0], uvs: [0, 1, 0, 0, 1, 0, 1, 1], tint: [1, 1, 1, 1] });
  const plate = (w: number, h = 4, opaque: (x: number, y: number) => boolean = () => true): Plate => {
    const p = new Plate(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (opaque(x, y)) p.set(x, y, [255, 255, 255, 255]);
    return p;
  };
  const restOf = (pieces: Piece[]): AttachmentRest[] => pieces.map((p) => ({ slot: p.slot, attachment: p.slot, kind: 'region', vertices: p.world, triangles: [0, 1, 2, 2, 3, 0] }));
  const read = (pieces: Piece[], setup = [rect('a', 0), rect('b', 2)], pages = new Map([['a', plate(4)], ['b', plate(4)], ['cover', plate(2)]]), reverse = false, plant: SeamPlant = {}): SeamPairReading =>
    seamsOf([reverse ? { a: 'b', b: 'a' } : { a: 'a', b: 'b' }], restOf(setup), [{ index: 0, time: 0, pieces, attachments: pieces.map((p) => ({ slot: p.slot, attachment: p.slot, vertices: p.world, color: p.tint })) }], pages, plant)[0];
  const px = (p: SeamPairReading, key: string): number => (p as unknown as Record<string, { worst: { px: number } | null } | undefined>)[key]?.worst?.px ?? 0;
  const add = (name: string, values: Record<string, [number, number]>, extra: string[] = []): void => {
    rows.push({ name, faults: [...Object.entries(values).filter(([, [got, want]]) => got !== want).map(([k, [got, want]]) => `${k}=${got}, required ${want}`), ...extra], detail: Object.entries(values).map(([k, [got]]) => `${k}=${got}`).join(' ') });
  };
  const a = rect('a', 0), b = rect('b', 6), cover = rect('cover', 6, 2);
  const coverA = rect('cover', 2, 2);
  const open = read([a, b]), hidden = read([a, b, coverA, cover]), behind = read([coverA, cover, a, b]);
  add('SE30_VISIBLE_GHOST_RESPECTS_DRAW_ORDER', { open: [px(open, 'ghost'), 16], hidden: [px(hidden, 'ghost'), 0], behind: [px(behind, 'ghost'), 16] });
  const faint = { ...cover, tint: [1, 1, 1, 127 / 255] as [number, number, number, number] };
  const transparent = { ...cover, tint: [1, 1, 1, 0] as [number, number, number, number] };
  add('SE31_PARTIAL_ALPHA_AND_SLOT_FRAGMENTS', {
    faint: [px(read([a, b, coverA, faint]), 'ghost'), 8], transparent: [px(read([a, b, coverA, transparent]), 'ghost'), 8],
    fragments: [px(read([a, b, coverA, rect('cover', 6, 1, 4, 'cover'), rect('cover', 7, 1, 4, 'cover')]), 'ghost'), 0],
  });
  const setup = [rect('a', 0, 4, 8), rect('b', 2, 4, 8)];
  const pages = new Map([['a', plate(4, 8)], ['b', plate(4, 8, (x, y) => x >= 2 || y < 2 || y >= 6)]]);
  const mixed = read([setup[0], rect('b', 6, 4, 8)], setup, pages);
  // At rows 0,1,6,7 the opposed outlines are x=4 and x=6: exactly 8 torn cells.
  // At rows 2..5 the branch never overlaps A: the 16 cells x=4..8 are adjacent background.
  add('SE32_LOCAL_JOINT_SUPPORT_EXCLUDES_BESIDE_BACKGROUND', { mixedGap: [px(mixed, 'gap'), 8], mixedOpen: [px(mixed, 'gapOpen'), 8], rectangleTear: [px(open, 'gap'), 8] });
  const wideSetup = [rect('a', 0, 8, 8), setup[1]];
  const widePages = new Map(pages); widePages.set('a', plate(8, 8, (x, y) => x < 4 || y < 2 || y >= 6));
  const beside = read([wideSetup[0], rect('b', 6, 4, 8)], wideSetup, widePages);
  add('SE37_BACKGROUND_BESIDE_A_JOINT_IS_NOT_A_TEAR', { besideGap: [px(beside, 'gap'), 0], oldHull: [px(read([wideSetup[0], rect('b', 6, 4, 8)], wideSetup, widePages, false, { globalHull: true }), 'gap'), 16] });
  add('SE38_WRONG_VISIBILITY_AND_HULL_RULES_ARE_CAUGHT', {
    hiddenPlant: [px(read([a, b, coverA, cover], undefined, undefined, false, { hiddenGhost: true }), 'ghost'), 16],
    hullPlant: [px(read([setup[0], rect('b', 6, 4, 8)], setup, pages, false, { globalHull: true }), 'gap'), 24],
  });
  const exposure = open as SeamPairReading & { exposureA?: unknown; exposureB?: unknown };
  add('SE33_NAMED_PIECE_EXPOSURE_EXTENDS_BEYOND_BAND', {
    exposureA: [px(open, 'exposureA'), 16], exposureB: [px(open, 'exposureB'), 16],
    coveredB: [px(hidden, 'exposureB'), 8], faintB: [px(read([a, b, faint]), 'exposureB'), 8],
    atRestA: [px(read([a, rect('b', 2)]), 'exposureA'), 8], atRestB: [px(read([a, rect('b', 2)]), 'exposureB'), 8],
  }, exposure.exposureA === undefined || exposure.exposureB === undefined ? ['missing exposure fields'] : []);
  const noBand = read([a, b], [a, b]), absent = read([a]);
  add('SE34_EXPOSURE_WITHOUT_BAND_OR_PARTNER', { noBandA: [px(noBand, 'exposureA'), 16], noBandB: [px(noBand, 'exposureB'), 16], absentA: [px(absent, 'exposureA'), 16], absentB: [px(absent, 'exposureB'), 0] }, noBand.status !== 'skip' || absent.status !== 'skip' ? ['exposure changed seam SKIP'] : []);
  const clean = read([a, rect('b', 2)]), reverse = read([a, b], undefined, undefined, true);
  const empty = { frames: [], spans: [], worst: null };
  const expected = { a: 'a', b: 'b', drawn: 1, banded: 1, status: 'read', opens: [], maxPx: 0, gap: empty, ghost: empty, ghostA: empty, ghostB: empty, gapOpen: empty, gapCovered: empty };
  const old = Object.fromEntries(Object.entries(clean).filter(([k]) => !k.startsWith('exposure') && k !== 'jointContact'));
  add('SE35_CLEAN_OLD_FIELDS_AND_NAMED_REVERSAL', { cleanMax: [clean.maxPx, 0], reversedA: [px(reverse, 'exposureA'), 16], reversedGhostA: [px(reverse, 'ghostA'), 8] }, JSON.stringify(old) !== JSON.stringify(expected) ? ['clean old fields changed'] : []);
  const holePages = new Map([['a', plate(4)], ['b', plate(4)], ['cover', plate(2, 4, (x) => x === 0)], ['solid', plate(2)]]);
  const windowed: Piece = { ...cover, uvWindow: { u0: 0, v0: 0, u1: 0.5, v1: 1 } };
  const meshCover: Piece = { kind: 'mesh', slot: 'cover', page: 'cover', world: [6, 0, 6, 4, 7, 4, 7, 0], uvs: [0, 1, 0, 0, 0.5, 0, 0.5, 1], triangles: [0, 1, 2, 2, 3, 0], tint: [1, 1, 1, 1] };
  add('SE39_VISIBILITY_UVS_HOLES_MESH_AND_MULTI_FRAGMENT_EXPOSURE', {
    holes: [px(read([a, b, { ...coverA, page: 'solid' }, cover], undefined, holePages), 'ghost'), 4],
    window: [px(read([a, b, coverA, windowed]), 'ghost'), 4],
    mesh: [px(read([a, b, coverA, meshCover]), 'ghost'), 4],
    fragmentB: [px(read([a, b, rect('b', 20)]), 'exposureB'), 32],
  });
  const viewport = { minX: 0, minY: 0, maxX: 10, maxY: 4, width: 10, height: 4, scale: 1 };
  const visibleByRenderer = (pieces: Piece[]): number => {
    const colouredB = plate(4); for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) colouredB.set(x, y, [255, 0, 0, 255]);
    const pages = new Map([['a', plate(4)], ['b', colouredB], ['cover', plate(2)]]);
    const draw = (pieces: Piece[]) => renderFrame({ index: 0, time: 0, pieces }, pages, viewport, [0, 0, 0, 0]);
    const full = draw(pieces), without = draw(pieces.filter((p) => p.slot !== 'b'));
    let changed = 0;
    for (let y = 0; y < 4; y++) for (let x = 6; x < 8; x++) if (full.get(x, y).some((v, c) => v !== without.get(x, y)[c])) changed++;
    return changed;
  };
  add('SE40_GHOST_VISIBILITY_AGREES_WITH_TRANSPARENT_RENDERER', { hidden: [visibleByRenderer([a, b, cover]), 0], earlier: [visibleByRenderer([cover, a, b]), 8], partial: [visibleByRenderer([a, b, faint]), 8] });
  const lifted = (p: Piece): Piece => ({ ...p, world: p.world.map((v, i) => i % 2 ? v + 24 : v) });
  const far = read([lifted(a), lifted(b)], [lifted(a), lifted(rect('b', 2))]);
  add('SE41_GENUINE_TEAR_IS_NOT_LIMITED_TO_A_PIVOT_DISC', { farTear: [px(far, 'gap'), 8], minY: [far.gap.worst?.box[1] ?? -1, 24] });
  const sparseFrames = [0, 2, 3, 5].map((index) => ({ index, time: index / 12, pieces: [a, b], attachments: [a, b].map((p) => ({ slot: p.slot, attachment: p.slot, vertices: p.world, color: p.tint })) }));
  const sparse = seamsOf([{ a: 'a', b: 'b' }], restOf([a, rect('b', 2)]), sparseFrames, new Map([['a', plate(4)], ['b', plate(4)]]))[0];
  add('SE42_EXPOSURE_RETAINS_SPARSE_SPANS_AND_EARLIEST_WORST', { worst: [sparse.exposureB?.worst?.index ?? -1, 0] }, JSON.stringify(sparse.exposureB?.spans.map((span) => span.frames)) === '[[0,0],[2,3],[5,5]]' ? [] : ['wrong sparse exposure spans']);
  const text = seamLine(null, 12, open);
  add('SE36_PRINT_EXPOSURE_BESIDE_THE_SEAM_READING', {}, text.includes('exposure "a"') && text.includes('exposure "b"') ? [] : ['line omits named exposures']);
  return rows;
}

if (import.meta.main) {
  const rows = seamCellControls();
  for (const row of rows) console.log(`${row.faults.length ? 'FAIL' : 'PASS'} ${row.name}: ${row.detail}${row.faults.length ? ` — ${row.faults.join('; ')}` : ''}`);
  const fail = rows.filter((r) => r.faults.length).length;
  console.log(`SEAM_CELL_CONTROLS cases=${rows.length} pass=${rows.length - fail} fail=${fail}`);
  process.exitCode = fail ? 1 : 0;
}
