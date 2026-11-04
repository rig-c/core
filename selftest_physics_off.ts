/** Closed physics-off and same-grid boundary controls for issue #1690. */
import { mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { galleryRecipes, runRecipe } from './tools/emit_hashes.ts';
import { loadPosable, spinePoser, sampleAll, type Poser, type FramesSidecar } from './src/render.ts';
import { corePoser } from './src/render_core.ts';
import { boundaryDistance, boundaryComparison } from './src/boundary.ts';
import { Plate } from './tools/plate.ts';

type Say = (name: string, ok: boolean, detail: string, why: string) => number;
type Constraint = { name: string; type?: string; kind?: string; mix?: number };
type Document = { constraints: Constraint[]; animations: Record<string, { physics?: unknown; constraints?: { physics?: unknown } }>; editorOrder?: { constraints?: unknown } };
export function runPhysicsOffSuite(report?: Say): number {
  console.log('\n── render-physics-off: animated-pose oracle and visible boundaries (issue #1690) ──');
  let bad = 0;
  const say = (name: string, ok: boolean, detail: string): void => {
    bad += report ? report(name, ok, detail, 'Physics off leaves the animated pose exact. A reading requires matching grids and non-vacuous controls') : (console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}  (${detail})`), ok ? 0 : 1);
  };
  const work = mkdtempSync(join(tmpdir(), 'rigc-physics-off-'));
  const cli = (args: string[]) => spawnSync(process.execPath, [join(import.meta.dir, 'cli.ts'), ...args], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  try {
    const recipe = galleryRecipes(import.meta.dir, console.log).find((r) => r.name === 'gallery/look');
    if (!recipe) throw new Error('public gallery/look recipe missing');
    const built = runRecipe(recipe, join(work, 'recipe'), import.meta.dir);
    if (built.exits.some((exit) => exit !== 0)) throw new Error(`gallery build exits ${built.exits}`);
    const out = join(work, 'recipe', 'out');
    const atlas = readFileSync(join(out, 'skeleton.atlas'), 'utf8');
    const modelText = readFileSync(join(out, 'skeleton.model.json'), 'utf8');
    const spineText = readFileSync(join(out, 'skeleton.json'), 'utf8');
    const reference = (text: string, mixZero: boolean, keepOne = false): string => {
      const doc = JSON.parse(text) as Document;
      if (mixZero) for (const c of doc.constraints) { if ((c.kind ?? c.type) === 'physics') c.mix = 0; }
      else {
        const first = keepOne ? doc.constraints.find((c) => (c.kind ?? c.type) === 'physics') : undefined;
        doc.constraints = doc.constraints.filter((c) => (c.kind ?? c.type) !== 'physics' || c === first);
        for (const animation of Object.values(doc.animations)) { delete animation.physics; if (animation.constraints) animation.constraints.physics = []; }
      }
      return JSON.stringify(doc);
    };
    const make = (text: string, core: boolean): Poser => core ? corePoser(text, atlas) : spinePoser(loadPosableFromText(text));
    const loadPosableFromText = (text: string) => {
      const path = join(work, 'reference.json');
      writeFileSync(path, text);
      return loadPosable(path, join(out, 'skeleton.atlas'), out).data;
    };
    for (const core of [true, false]) {
      const label = core ? 'core' : 'spine';
      const text = core ? modelText : spineText;
      const poses = (poser: Poser, off = false) => [...sampleAll(poser, 12, { bones: true, ...(off ? { physicsMode: 'off' as const } : {}) })].map(([name, frames]) => [name, frames.map((f) => f.bones)]);
      const original = make(text, core);
      say(`PO00_PHYSICS_PRESENT[${label}]`, (JSON.parse(text) as Document).constraints.some((c) => (c.kind ?? c.type) === 'physics'), 'public recipe declares physics');
      const animated = JSON.stringify(poses(make(reference(text, false), core)));
      const off = JSON.stringify(poses(original, true));
      say(`PO01B_SETUP_POSE[${label}]`, JSON.stringify(original.setup(undefined, false, 'off').bones()) === JSON.stringify(make(reference(text, false), core).setup(undefined).bones()), 'setup world transforms at tolerance 0');
      const on = JSON.stringify(poses(make(reference(text, false, true), core)));
      const mixZero = JSON.stringify(poses(make(reference(text, true), core)));
      say(`PO01_EXACT_ANIMATED_POSE[${label}]`, off === animated, `${original.bones.length} bones, ${original.animations.length} animations, tolerance 0`);
      say(`PO02_ACTIVE_PHYSICS_PLANT[${label}]`, on !== animated, 'same comparison rejects exactly one physics constraint left active');
      say(`PO03_MIX_ZERO_MEASUREMENT[${label}]`, mixZero === animated, `setup mix 0 ${mixZero === animated ? 'equals' : 'differs from'} removed-constraint reference on public recipe`);
      const keyed = JSON.parse(reference(text, true)) as Document;
      const constraint = keyed.constraints.find((c) => (c.kind ?? c.type) === 'physics')!;
      for (const animation of Object.values(keyed.animations)) {
        if (core && animation.constraints) animation.constraints.physics = [{ name: constraint.name, timelines: [{ name: 'mix', keys: [{ time: 0, value: 1 }] }] }];
        else animation.physics = { [constraint.name]: { mix: [{ time: 0, value: 1 }] } };
      }
      const keyedText = JSON.stringify(keyed);
      say(`PO03B_MIX_TIMELINE_OVERRIDES_SETUP_ZERO[${label}]`, JSON.stringify(poses(make(keyedText, core))) !== animated && JSON.stringify(poses(make(keyedText, core), true)) === animated, 'mix keyed to 1 restores motion after setup mix 0, while physics off remains exact');
      const warm = (poser: Poser, off = false) => JSON.stringify([...sampleAll(poser, 12, { bones: true, preroll: 1, ...(off ? { physicsMode: 'off' as const } : {}) })].map(([name, frames]) => [name, frames.map((f) => f.bones)]));
      say(`PO03C_PREROLL_EXACT[${label}]`, warm(original, true) === warm(make(reference(text, false), core)), 'physics off remains exact across a looping pre-roll');

    }
    const on = join(work, 'on'), off = join(work, 'off'), same = join(work, 'same');
    const render = (dir: string, flags: string[]) => cli(['render', '--candidate', out, '--max', '256', '--out', dir, ...flags]);
    const a = render(on, []);
    const b = cli(['render', '--candidate', out, '--viewport-from', on, '--physics', 'off', '--boundary-from', on, '--geometry', '--sheet', '--out', off]);
    const c = cli(['render', '--candidate', out, '--viewport-from', on, '--boundary-from', on, '--out', same]);
    if (a.status !== 0 || b.status !== 0 || c.status !== 0) throw new Error(`render exits ${a.status}/${b.status}/${c.status}: ${a.stderr}${b.stderr}${c.stderr}`);
    const side = (dir: string) => JSON.parse(readFileSync(join(dir, 'frames.json'), 'utf8')) as FramesSidecar;
    const reading = (dir: string) => JSON.parse(readFileSync(join(dir, 'boundary.json'), 'utf8')) as { status: string; maxPixels: number };
    say('PO04A_NO_PHYSICS_STEPS', side(off).sets.every((set) => set.physics?.stepped === 0) && b.stdout.includes('--physics off suppresses every physics constraint'), 'all sets report zero stepped constraints and name the off mode');
    say('PO04_GRID_AND_MODE', JSON.stringify(side(on).viewport) === JSON.stringify(side(off).viewport) && side(off).physicsMode === 'off' && side(on).physicsMode === undefined, 'same viewport, explicit off, legacy on');
    const firstSet = side(off).sets[0].dir;
    const geometry = JSON.parse(readFileSync(join(off, firstSet, 'geometry.json'), 'utf8')) as { physicsMode: string };
    const sheet = JSON.parse(readFileSync(join(off, firstSet, 'sheet-manifest.json'), 'utf8')) as { physicsMode: string; namespace: string };
    say('PO04B_EXPORT_MODE', geometry.physicsMode === 'off' && sheet.physicsMode === 'off' && sheet.namespace.endsWith('/physics=off'), 'geometry and sheet identity record off');
    say('PO05_OPAQUE_STAGE_BOUNDARY', reading(same).status === 'READ' && reading(same).maxPixels === 0 && reading(off).status === 'READ' && reading(off).maxPixels === 0, `on/on ${reading(same).maxPixels}, on/off ${reading(off).maxPixels} L-infinity px`);
    const figureOn = join(work, 'figure-on'), figureOff = join(work, 'figure-off');
    const figureA = render(figureOn, ['--hide', 'plate']);
    const figureB = cli(['render', '--candidate', out, '--hide', 'plate', '--physics', 'off', '--viewport-from', figureOn, '--boundary-from', figureOn, '--out', figureOff]);
    if (figureA.status !== 0 || figureB.status !== 0) throw new Error(`figure renders exit ${figureA.status}/${figureB.status}: ${figureA.stderr}${figureB.stderr}`);
    say('PO05B_CHARACTER_BOUNDARY', reading(figureOff).status === 'READ' && reading(figureOff).maxPixels > 0, `same explicit hide plate on both sides: ${reading(figureOff).maxPixels} L-infinity px`);
    const mismatch = boundaryComparison(figureOn, off, side(off)) as { status: string; reason: string };
    say('PO05C_UNEQUAL_SELECTION_REFUSED', mismatch.status === 'SKIP' && mismatch.reason.includes('selection differs'), JSON.stringify(mismatch));
    const wrongGrid = { ...side(off), viewport: { ...side(off).viewport, x: side(off).viewport.x + 1 } };
    const mismatchGrid = boundaryComparison(on, off, wrongGrid) as { status: string; reason: string };
    say('PO05D_UNEQUAL_GRID_REFUSED', mismatchGrid.status === 'SKIP' && mismatchGrid.reason.includes('pixel grid differs'), JSON.stringify(mismatchGrid));
    const check = cli(['check', '--candidate', out, '--frames', off]);
    say('PO06_CHECK_MODE_REFUSAL', check.status !== 0 && check.stderr.includes('physicsMode off'), `exit ${check.status}: ${check.stderr.slice(-400)}`);
    const alias = join(work, 'reference-alias');
    symlinkSync(on, alias, 'dir');
    const beforeAlias = readFileSync(join(on, 'frames.json'), 'utf8');
    const selfReference = cli(['render', '--candidate', out, '--out', alias, '--boundary-from', on, '--physics', 'off']);
    say('PO06B_SELF_REFERENCE_ALIAS_REFUSED', selfReference.status === 2 && selfReference.stderr.includes('different from --out') && readFileSync(join(on, 'frames.json'), 'utf8') === beforeAlias, 'a directory alias cannot overwrite the reference before comparing it');
    const wrong = render(join(work, 'wrong'), ['--physics', 'invalid']);
    say('PO07_FLAG_REFUSAL', wrong.status === 2 && wrong.stderr.includes('required on or off'), `exit ${wrong.status}`);
    const plate = (x: number): Plate => { const p = new Plate(12, 12); p.blend(x, 5, [255, 0, 0, 255]); return p; };
    const shifted = boundaryDistance(plate(4), plate(7), [0, 0, 0, 0]);
    say('PO08_PLANTED_BOUNDARY_SHIFT', shifted.status === 'READ' && shifted.maxPixels === 3, JSON.stringify(shifted));
    const empty = boundaryDistance(new Plate(12, 12), plate(7), [0, 0, 0, 0]);
    say('PO09_EMPTY_IS_SKIP', empty.status === 'SKIP', JSON.stringify(empty));
    const oldBoundary = readFileSync(join(off, 'boundary.json'), 'utf8');
    const reuse = render(off, []);
    say('PO10_REUSED_OUTPUT_REMOVES_OLD_BOUNDARY', reuse.status === 0 && !existsSync(join(off, 'boundary.json')), `plain render exit ${reuse.status}, old boundary present ${existsSync(join(off, 'boundary.json'))}`);
    writeFileSync(join(off, 'boundary.json'), oldBoundary);
    const only = cli(['render', '--candidate', out, '--out', off, '--extremes-only']);
    say('PO11_EXTREMES_ONLY_REMOVES_OLD_BOUNDARY', only.status === 0 && !existsSync(join(off, 'boundary.json')), `extremes-only exit ${only.status}, old boundary present ${existsSync(join(off, 'boundary.json'))}`);
  } catch (error) { say('PO00_MEASUREMENT_AVAILABLE', false, error instanceof Error ? error.stack ?? error.message : String(error)); }
  finally { rmSync(work, { recursive: true, force: true }); }
  return bad;
}
if (import.meta.main) process.exit(runPhysicsOffSuite() === 0 ? 0 : 1);
