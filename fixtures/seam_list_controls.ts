/** Exact gap-list controls with an independent rectangular cell oracle. */
import { Plate } from '../tools/plate.ts';
import { type Piece, type AttachmentRest } from '../src/render_shared.ts';
import { seamsOf, setupCellReader, type SeamPairReading, type SeamCell } from '../src/seam.ts';

export function seamListFaults(pair: SeamPairReading): string[] {
  const faults: string[] = [];
  for (const key of ['gapOpen', 'gapCovered'] as const) for (const hit of pair[key].frames) {
    if (hit.cells?.length !== hit.px) faults.push(`${pair.a}:${pair.b} ${key} frame ${hit.index}: cells.length=${hit.cells?.length ?? 'absent'}, required px=${hit.px}`);
    const keys = new Set<string>();
    let prev: { x: number; y: number } | undefined;
    for (const c of hit.cells ?? []) {
      const id = `${c.x},${c.y}`;
      if (keys.has(id)) faults.push(`${key} frame ${hit.index}: duplicate cell ${id}`);
      keys.add(id);
      if (prev && (c.y > prev.y || (c.y === prev.y && c.x <= prev.x))) faults.push(`${key} frame ${hit.index}: cell ${id} not descending y/ascending x`);
      prev = c;
    }
  }
  return faults;
}

export function seamListControls(): { name: string; faults: string[]; detail: string }[] {
  const rect = (slot: string, x: number, w: number): Piece => ({ kind: 'region', slot, page: slot, world: [x, 0, x, 4, x + w, 4, x + w, 0], uvs: [0, 1, 0, 0, 1, 0, 1, 1], tint: [1, 1, 1, 1] });
  const a = rect('a', 0, 4), restB = rect('b', 2, 4), b = rect('b', 6, 4), under = rect('under', 4, 1), cover = rect('cover', 4, 1);
  const setup = [under, a, restB];
  const rest: AttachmentRest[] = setup.map(p => ({ slot: p.slot, attachment: p.slot, kind: 'region', vertices: p.world, triangles: [0, 1, 2, 2, 3, 0] }));
  const pages = new Map([a, b, under, cover].map(p => {
    const plate = new Plate(p.slot === 'under' || p.slot === 'cover' ? 1 : 4, 4);
    plate.rect(0, 0, plate.width, plate.height, [255, 255, 255, 255]);
    return [p.slot, plate] as const;
  }));
  let setupCalls = 0;
  const reader = setupCellReader(() => { setupCalls++; return setup; }, pages);
  const read = (pieces: Piece[], lists = true) => seamsOf([{ a: 'a', b: 'b' }], rest, [0, 2].map(index => ({ index, time: index / 12, pieces, attachments: pieces.map(p => ({ slot: p.slot, attachment: p.slot, vertices: p.world, color: p.tint })) })), pages, {}, lists ? { cells: reader } : {})[0];
  const off = read([a, b, cover], false);
  const disabled = setupCalls === 0 && !JSON.stringify(off).includes('cells');
  const on = read([a, b, cover]);
  const faults = seamListFaults(on);
  // The chosen rectangles leave x=4.5 covered and x=5.5 open at y=.5,1.5,2.5,3.5.
  // At setup b covers both columns; only x=4.5 has a third slot underneath.
  for (const [key, x, expectedUnder] of [['gapOpen', 5.5, null], ['gapCovered', 4.5, 'under']] as const) for (const hit of on[key].frames) {
    const expected = [3.5, 2.5, 1.5, 0.5].map(y => ({ x, y, setupTop: 'b', setupUnder: expectedUnder }));
    if (JSON.stringify(hit.cells) !== JSON.stringify(expected)) faults.push(`${key} frame ${hit.index}: got ${JSON.stringify(hit.cells)}, required ${JSON.stringify(expected)}`);
  }
  if (on.gapOpen.frames.length !== 2 || on.gapCovered.frames.length !== 2) faults.push('expected two nonempty frames of both kinds');
  const again = read([a, b, cover]);
  if (JSON.stringify(on) !== JSON.stringify(again)) faults.push('repeat list bytes differ');
  if (setupCalls !== 1) faults.push(`setup sampled ${setupCalls} times, required 1 across frames and calls`);
  const stripped = JSON.parse(JSON.stringify(on)) as SeamPairReading;
  for (const key of ['gapOpen', 'gapCovered'] as const) {
    for (const hit of stripped[key].frames) delete hit.cells;
    if (stripped[key].worst) delete stripped[key].worst.cells;
  }
  if (JSON.stringify(stripped) !== JSON.stringify(off)) faults.push('list capture moved existing fields');
  const lost = structuredClone(on); lost.gapOpen.frames[0].cells?.pop();
  const duplicate = structuredClone(on); const cells = duplicate.gapCovered.frames[0].cells!; cells[1] = { ...cells[0] };
  const alphaFaults: string[] = [];
  const query: SeamCell[] = [{ x: 4.5, y: 0.5, setupTop: null, setupUnder: null }, { x: 5.5, y: 0.5, setupTop: null, setupUnder: null }, { x: 30.5, y: 0.5, setupTop: null, setupUnder: null }];
  const faint: Piece = { ...cover, tint: [1, 1, 1, 1 / 255] };
  const zero: Piece = { ...cover, slot: 'zero', tint: [1, 1, 1, 0.49 / 255] };
  const holed = new Plate(4, 4); holed.rect(0, 0, 3, 4, [255, 255, 255, 255]);
  const holedPages = new Map(pages); holedPages.set('b', holed);
  let reads = 0;
  const countedPages = new class extends Map<string, Plate> {
    override get(key: string): Plate | undefined { reads++; return super.get(key); }
  }(holedPages);
  const layers = setupCellReader(() => [under, a, restB, faint, faint, zero], countedPages);
  layers(query, 1);
  if (JSON.stringify(query.map(c => [c.setupTop, c.setupUnder])) !== '[["cover","b"],[null,null],[null,null]]') alphaFaults.push(`positive-byte, hole, fragment and outside queries: ${JSON.stringify(query)}`);
  const firstReads = reads; layers(query, 1);
  if (reads !== firstReads) alphaFaults.push('same cell side re-rasterized setup');
  layers(query, 2);
  if (reads !== firstReads * 2) alphaFaults.push(`second cell side page reads ${reads}, required ${firstReads * 2}`);
  return [
    { name: 'SE59_SETUP_ALPHA_HOLES_FRAGMENTS_AND_GRID_CACHE', faults: alphaFaults, detail: 'alpha 1 counts, byte-zero does not; texture hole and outside world return null; repeated fragments stay one slot; one traversal per distinct cell side' },
    { name: 'SE54_EXACT_GAP_LISTS_AND_SETUP_LAYERS', faults, detail: '2 sparse frames × 4 open and 4 covered cells; exact coordinates/order; third-slot under and null under; repeated bytes identical' },
    { name: 'SE55_LIST_OFF_NEVER_ENTERS_SETUP_AND_KEEPS_BYTES', faults: disabled ? [] : ['flag off entered setup or emitted cells'], detail: 'setup callback count 0 with option absent; old fields identical after stripping lists' },
    { name: 'SE56_LIST_COUNT_AND_DUPLICATE_MUTANTS_ARE_RED', faults: seamListFaults(lost).some(f => f.includes('cells.length=3, required px=4')) && seamListFaults(duplicate).some(f => f.includes('duplicate cell')) ? [] : ['missing or duplicated cell plant escaped'], detail: 'removing one cell and repeating a different cell fail by name' },
  ];
}

if (import.meta.main) {
  const rows = seamListControls();
  for (const r of rows) console.log(`${r.faults.length ? 'FAIL' : 'PASS'} ${r.name}: ${r.detail}${r.faults.length ? ` — ${r.faults.join('; ')}` : ''}`);
  process.exitCode = rows.some(r => r.faults.length) ? 1 : 0;
}
