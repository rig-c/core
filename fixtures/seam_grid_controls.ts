/** Pair-grid controls, including a bandless touching pair and unequal texels. */
import { Plate } from '../tools/plate.ts';
import { seamGridOf, seamsOf, type SeamGrid, type SeamFrame } from '../src/seam.ts';
import { projector, rasterisePiece, type Piece, type AttachmentRest } from '../src/render_shared.ts';

export function seamGridControls(): { name: string; faults: string[]; detail: string }[] {
  const rect = (slot: string, x: number, y = 0): Piece => ({ kind: 'region', slot, page: slot, world: [x, y, x, y + 4, x + 4, y + 4, x + 4, y], uvs: [0, 1, 0, 0, 1, 0, 1, 1], tint: [1, 1, 1, 1] });
  const pages = new Map(['a', 'b'].map(slot => { const p = new Plate(slot === 'a' ? 4 : 2, slot === 'a' ? 4 : 2); p.rect(0, 0, p.width, p.height, [255, 255, 255, 255]); return [slot, p] as const; }));
  const faults: string[] = [], mutantFaults: string[] = [];
  let cases = 0;
  for (const setupB of [2, 4]) for (const shift of [0, 6]) {
    const setup = [rect('a', 0), rect('b', setupB)];
    const rest: AttachmentRest[] = setup.map(p => ({ slot: p.slot, attachment: p.slot, kind: 'region', vertices: p.world, triangles: [0, 1, 2, 2, 3, 0] }));
    const pieces = [rect('a', shift, shift), rect('b', setupB + shift, shift)];
    const frame: SeamFrame = { index: shift, time: shift / 12, pieces, attachments: pieces.map(p => ({ slot: p.slot, attachment: p.slot, vertices: p.world, color: p.tint })) };
    const pair = { a: 'a', b: 'b' };
    const grid = seamGridOf(pair, rest, frame, pages);
    const reading = seamsOf([pair], rest, [frame], pages)[0];
    const check = (g: SeamGrid | null): string[] => {
      if (g === null) return ['grid absent'];
      const bad: string[] = [];
      // Rectangles have texels of 1 and 2 world units. Bounds include BOTH
      // setup and moved art, padded one cell, even when setup has no band.
      const expected = { cell: 2, viewport: { minX: -2, minY: -2, maxX: setupB + shift + 6, maxY: shift + 6, scale: 0.5, width: (setupB + shift + 8) / 2, height: (shift + 8) / 2 } };
      if (JSON.stringify(g) !== JSON.stringify({ viewport: expected.viewport, cell: expected.cell })) bad.push('grid differs from independent rectangle bounds/texel oracle');
      const masks = pieces.map(p => {
        const cells = new Set<string>();
        rasterisePiece(pages.get(p.page)!, p, projector(g.viewport), g.viewport, (x, y, _r, _g, _b, alpha) => { if (alpha > 0) cells.add(`${x},${y}`); });
        return cells;
      });
      for (const [i, key] of [[0, 'exposureA'], [1, 'exposureB']] as const) {
        const own = [...masks[i]].filter(k => !masks[1 - i].has(k)).map(k => k.split(',').map(Number));
        const hit = reading[key].worst;
        const box = own.length ? [Math.min(...own.map(([x]) => g.viewport.minX + x * g.cell)), Math.min(...own.map(([, y]) => g.viewport.maxY - (y + 1) * g.cell)), Math.max(...own.map(([x]) => g.viewport.minX + (x + 1) * g.cell)), Math.max(...own.map(([, y]) => g.viewport.maxY - y * g.cell))] : null;
        if ((hit?.px ?? 0) !== own.length || (hit && (hit.cell !== g.cell || JSON.stringify(hit.box) !== JSON.stringify(box)))) bad.push(`${key}: helper raster cells differ from seamsOf`);
      }
      if (setupB === 4 && (reading.status !== 'skip' || reading.gap.frames.length || reading.ghost.frames.length || masks[0].size !== 4 || masks[1].size !== 4 || [...masks[0]].some(k => masks[1].has(k)))) bad.push('touching pair must have zero gap and no overlap, but still rasterise both slots');
      return bad;
    };
    faults.push(...check(grid).map(f => `setupB=${setupB}, shift=${shift}: ${f}`));
    if (grid) {
      for (const mutant of [{ ...grid, cell: 1 }, { ...grid, viewport: { ...grid.viewport, minX: grid.viewport.minX + 1 } }, { ...grid, viewport: { ...grid.viewport, width: 1 } }]) if (check(mutant).length === 0) mutantFaults.push('wrong cell/origin/dimensions escaped');
    }
    cases++;
  }
  const empty: SeamFrame = { index: 0, time: 0, pieces: [], attachments: [] };
  if (seamGridOf({ a: 'a', b: 'b' }, [], empty, pages) !== null) faults.push('empty pair must return null');
  return [
    { name: 'SE60_PAIR_GRID_MATCHES_STOCK_RASTER', faults, detail: `${cases} setup/moved × overlapping/touching readings; unequal setup texels; exact bounds, cell counts and world boxes; empty pair null` },
    { name: 'SE61_PAIR_GRID_MUTANTS_ARE_RED', faults: mutantFaults, detail: 'wrong cell side, origin and width each rejected on all four readings' },
  ];
}

if (import.meta.main) {
  const rows = seamGridControls();
  for (const r of rows) console.log(`${r.faults.length ? 'FAIL' : 'PASS'} ${r.name}: ${r.detail} ${r.faults.join('; ')}`);
  process.exitCode = rows.some(r => r.faults.length) ? 1 : 0;
}
