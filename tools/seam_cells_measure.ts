/** Gallery byte-preservation and opt-in seam-cell timing receipt (issue #1695).
 * Run under an exclusive timing slot: bun tools/seam_cells_measure.ts <baseline-tree> <work>.
 * The baseline tree is an archived reference, with dependencies installed beside it.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { galleryRecipes, runRecipe, TREE_ROOT } from './emit_hashes.ts';
import { seamListFaults } from '../fixtures/seam_list_controls.ts';
import type { SeamFile } from '../src/seam.ts';

const [baseArg, workArg] = process.argv.slice(2);
if (!baseArg || !workArg) throw new Error('usage: seam_cells_measure.ts <baseline-tree> <work>');
const base = resolve(baseArg), work = resolve(workArg);
mkdirSync(work, { recursive: true });
const pairs: Record<string, string> = { flex: 'flag_a:flag_b', look: 'neck:head', nod: 'torso:head', portrait: 'neck:head', ride: 'torso:head', squash: 'torso:head', walk: 'thigh_f:shin_f' };
const rows: { name: string; offMs: number; onMs: number; ratio: number; sidecars: number; hits: number; cells: number; comparedFiles: number }[] = [];
const files = (root: string) => readdirSync(root, { recursive: true }).map(String).filter(f => statSync(join(root, f)).isFile()).sort();
for (const recipe of galleryRecipes(TREE_ROOT, console.log)) {
  const name = recipe.name.split('/').at(-1)!;
  const dir = join(work, name), built = join(dir, 'build');
  const build = runRecipe(recipe, built, TREE_ROOT);
  if (!build.exits.length || build.exits.some(e => e !== 0)) throw new Error(`${name}: build exits ${build.exits}`);
  const candidate = join(built, 'out');
  const run = (label: string, root: string, lists: boolean) => {
    const out = join(dir, label), args = ['render', '--candidate', candidate, '--seam', pairs[name], '--max', '128', '--geometry', '--out', out, ...(lists ? ['--seam-cells'] : [])];
    const start = performance.now();
    const result = spawnSync(process.execPath, [join(root, 'cli.ts'), ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const ms = performance.now() - start;
    writeFileSync(join(dir, `${label}.log`), `${result.stdout}\n${result.stderr}`);
    if (result.status !== 0) throw new Error(`${name} ${label}: exit ${result.status}; ${result.stderr.slice(-1000)}`);
    return { out, ms };
  };
  const old = run('base', base, false), off = run('off', TREE_ROOT, false), on = run('on', TREE_ROOT, true), again = run('again', TREE_ROOT, true);
  const paths = files(old.out);
  if (JSON.stringify(paths) !== JSON.stringify(files(off.out))) throw new Error(`${name}: default file inventory moved`);
  let sidecars = 0, hits = 0, cells = 0;
  for (const f of paths) {
    if (!readFileSync(join(old.out, f)).equals(readFileSync(join(off.out, f)))) throw new Error(`${name}: flag-off bytes moved from baseline: ${f}`);
    if (!readFileSync(join(on.out, f)).equals(readFileSync(join(again.out, f)))) throw new Error(`${name}: repeated flagged bytes differ: ${f}`);
    if (f.endsWith('/seam.json')) {
      sidecars++;
      const file = JSON.parse(readFileSync(join(on.out, f), 'utf8')) as SeamFile;
      for (const pair of file.pairs) {
        const faults = seamListFaults(pair); if (faults.length) throw new Error(`${name}: ${faults.join('; ')}`);
        for (const kind of [pair.gapOpen, pair.gapCovered]) for (const hit of kind.frames) { hits++; cells += hit.cells!.length; }
        for (const kind of [pair.gapOpen, pair.gapCovered]) {
          for (const hit of kind.frames) delete hit.cells;
          if (kind.worst) delete kind.worst.cells;
        }
      }
      if (JSON.stringify(file) !== JSON.stringify(JSON.parse(readFileSync(join(off.out, f), 'utf8')))) throw new Error(`${name}: flagged legacy sidecar fields moved`);
    } else if (!readFileSync(join(on.out, f)).equals(readFileSync(join(off.out, f)))) throw new Error(`${name}: detail flag moved ${f}`);
  }
  const row = { name, offMs: off.ms, onMs: on.ms, ratio: on.ms / off.ms, sidecars, hits, cells, comparedFiles: paths.length };
  rows.push(row); console.log(JSON.stringify(row));
  writeFileSync(join(work, 'receipt.json'), `${JSON.stringify({ max: 128, fps: 12, rows }, null, 2)}\n`);
}
const heaviest = rows.reduce((a, b) => b.offMs > a.offMs ? b : a);
console.log(`HEAVIEST ${JSON.stringify(heaviest)}`);
if (heaviest.ratio > 2) throw new Error(`STOP: ${heaviest.name} flag-on/off ${heaviest.ratio} exceeds 2`);
console.log(`IDENTICAL ${rows.length} gallery recipes; ${rows.reduce((n, r) => n + r.sidecars, 0)} sidecars; ${rows.reduce((n, r) => n + r.hits, 0)} hits; ${rows.reduce((n, r) => n + r.cells, 0)} listed cells`);
