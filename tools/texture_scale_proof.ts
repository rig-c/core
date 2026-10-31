/** Reproducible corpus census + native minification fixture. Run on the render pool. */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Plate } from './plate.ts';
import { galleryRecipes, runRecipe } from './emit_hashes.ts';
import { loadCandidate, renderFrame, throughPoser, type Frame } from '../src/render.ts';
import { textureScaleReading, textureScaleLines } from '../src/texture_scale.ts';

const root = resolve(import.meta.dir, '..');
const hash = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');
const json = (p: string, v: unknown): void => writeFileSync(p, JSON.stringify(v, null, 2) + '\n');

/** Exact box integration over a piecewise constant source, independent of the rasteriser's bilinear taps. */
function areaAt(p: Plate, x0: number, y0: number, x1: number, y1: number): number {
  let sum = 0;
  for (let y = Math.floor(y0); y < Math.ceil(y1); y++) for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
    const area = Math.max(0, Math.min(x + 1, x1) - Math.max(x, x0)) * Math.max(0, Math.min(y + 1, y1) - Math.max(y, y0));
    sum += p.data[(Math.min(p.height - 1, Math.max(0, y)) * p.width + Math.min(p.width - 1, Math.max(0, x))) * 4] * area;
  }
  return sum / ((x1 - x0) * (y1 - y0));
}
export function ditherProof(out: string): unknown {
  mkdirSync(out, { recursive: true });
  const source = new Plate(730, 400);
  for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
    const v = (x + y) % 2 * 255; source.set(x, y, [v, v, v, 255]);
  }
  const reduced = new Plate(122, 67);
  for (let y = 0; y < reduced.height; y++) for (let x = 0; x < reduced.width; x++) {
    const v = Math.round(areaAt(source, x * 730 / 122, y * 400 / 67, (x + 1) * 730 / 122, (y + 1) * 400 / 67));
    reduced.set(x, y, [v, v, v, 255]);
  }
  const width = 730 * .167, height = 400 * .167;
  const phases = [0, .25, .5, .75];
  const series = [source, reduced].map(page => phases.map(phase => {
    const frame: Frame = { index: 0, time: 0, pieces: [{ kind: 'region', slot: 'fixture', page: 'source', tint: [1, 1, 1, 1],
      world: [10 + phase, 10, 10 + phase, 10 + height, 10 + phase + width, 10 + height, 10 + phase + width, 10],
      uvs: [0, 1, 0, 0, 1, 0, 1, 1] }] };
    return renderFrame(frame, new Map([['source', page]]), { minX: 0, minY: 0, maxX: 160, maxY: 100, scale: 1, width: 160, height: 100 }, [255, 255, 255, 255]);
  }));
  const metrics = series.map(images => {
    let error = 0, variation = 0, n = 0;
    for (let y = 12; y < 74; y++) for (let x = 12; x < 130; x++) {
      const values = images.map(p => p.data[((99 - y) * p.width + x) * 4]);
      for (let i = 0; i < phases.length; i++) {
        const want = areaAt(source, (x - 10 - phases[i]) / .167, 400 - (y + 1 - 10) / .167,
          (x + 1 - 10 - phases[i]) / .167, 400 - (y - 10) / .167);
        error += Math.abs(values[i] - want); n++;
      }
      variation += Math.max(...values) - Math.min(...values);
    }
    return { areaReferenceMAE: error / n, temporalRangeMean: variation / (n / phases.length), pixelsPerPhase: n / phases.length };
  });
  series[0][0].writePng(join(out, 'native-original.png'));
  series[1][0].writePng(join(out, 'native-area-downsampled.png'));
  // One native comparison strip, with each phase in its own 160x100 tile: original top, resized below.
  const strip = new Plate(640, 200);
  for (let row = 0; row < 2; row++) for (let phase = 0; phase < 4; phase++) for (let y = 0; y < 100; y++) for (let x = 0; x < 160; x++) {
    const p = series[row][phase], o = (y * p.width + x) * 4;
    strip.set(phase * 160 + x, row * 100 + y, Array.from(p.data.slice(o, o + 4)) as [number, number, number, number]);
  }
  strip.writePng(join(out, 'native-comparison.png'));
  const reading = { source: [730, 400], reduced: [122, 67], world: [width, height], phases, viewport: [0, 0, 160, 100],
    roiWorld: [12, 12, 130, 74], original: metrics[0], downsampled: metrics[1],
    reducedMinimumScale: Math.min(width / 122, height / 67),
    interpretation: 'Synthetic one-texel checkerboard, bilinear consumer without mipmaps. A bounded reproduction of alias reduction; not the private source artwork or a universal zero-dither guarantee.' };
  json(join(out, 'dither.json'), reading);
  if (!(metrics[1].areaReferenceMAE < metrics[0].areaReferenceMAE && metrics[1].temporalRangeMean < metrics[0].temporalRangeMean)) throw new Error('dither hypothesis rejected by fixture');
  return reading;
}

export function corpusProof(out: string): unknown {
  const results: unknown[] = [];
  const collect = (name: string, skeletonPath: string, atlasPath: string): void => {
    const skeletonText = readFileSync(skeletonPath, 'utf8'), atlasText = readFileSync(atlasPath, 'utf8');
    const candidate = loadCandidate({ skeletonText, atlasText, atlasDir: dirname(atlasPath), label: name }, { skeleton: skeletonPath, atlas: atlasPath }, undefined);
    for (const skin of [undefined, ...candidate.facts.skins]) {
      const read = throughPoser(candidate.choice, poser => textureScaleReading(poser, candidate.pages, skeletonText, 60, skin));
      const other = throughPoser(candidate.choice, poser => textureScaleReading(poser, candidate.pages, skeletonText, 60, skin));
      if (JSON.stringify(read.value.report) !== JSON.stringify(other.value.report)) throw new Error(`${name}: nondeterministic report`);
      // An oracle comparison on every gallery build, including the irregular schedule and physics.
      let oracleMaxDelta = 0;
      if (read.poser === 'core') {
        const oracle = textureScaleReading(candidate.choice.spine, candidate.pages, skeletonText, 60, skin);
        for (const region of read.value.regions) {
          const mate = oracle.regions.find(r => r.slot === region.slot && r.attachment === region.attachment && r.region === region.region);
          if (mate === undefined) throw new Error(`${name}: oracle missing ${region.slot}/${region.attachment}`);
          oracleMaxDelta = Math.max(oracleMaxDelta, Math.abs(mate.smallestSampledScale - region.smallestSampledScale));
        }
        const identities = (warnings: typeof oracle.report.warnings): string => JSON.stringify(warnings.map(r => [r.slot, r.attachment, r.region, r.index]));
        if (identities(oracle.report.warnings) !== identities(read.value.report.warnings)) throw new Error(`${name}: oracle warning identities differ`);
        if (oracle.regions.length !== read.value.regions.length || oracleMaxDelta > 1e-6) throw new Error(`${name}: oracle parity delta ${oracleMaxDelta}`);
      }
      results.push({ name, skin: skin ?? null, poser: read.poser, oracleMaxDelta, drawn: read.value.regions.length,
        under025: read.value.regions.filter(r => r.smallestSampledScale < .25).length,
        under05: read.value.report.warnings.length, under075: read.value.regions.filter(r => r.smallestSampledScale < .75).length,
        warnings: read.value.report.warnings });
      console.log(`${name} skin=${skin ?? '(none)'}: ${read.value.report.warnings.length}/${read.value.report.drawnRegions}, ${read.poser}, oracle delta ${oracleMaxDelta}`);
    }
  };
  for (const recipe of galleryRecipes(root, console.log)) {
    const work = join(out, 'builds', recipe.name);
    const build = runRecipe(recipe, work, root);
    if (build.exits.some(e => e !== 0) || build.exits.length !== recipe.commands.length) throw new Error(`${recipe.name}: build refused: ${JSON.stringify(build.exits)}`);
    const before = build.files.map(f => [f.path, f.sha256]);
    const sk = join(work, 'out/skeleton.json'), at = join(work, 'out/skeleton.atlas');
    collect(recipe.name, sk, at);
    for (const [p, digest] of before) if (hash(readFileSync(join(work, 'out', p))) !== digest) throw new Error(`${recipe.name}: reading changed ${p}`);
    // Exercise both command entries, exact stdout and JSON determinism and malformed-flag refusal on a real build.
    if (results.length <= 2) {
      const reports: string[] = [];
      for (const entry of ['cli.ts', 'cli.ts', 'cli_core.ts']) {
        const target = join(work, 'reading.json');
        const run = spawnSync(process.execPath, [join(root, entry), 'texture-scale', '--candidate', join(work, 'out'), '--json', target], { encoding: 'utf8' });
        if (run.status !== 0) throw new Error(`texture-scale CLI ${entry}: ${run.stderr}`);
        reports.push(run.stdout + readFileSync(target, 'utf8'));
      }
      if (!reports.every(r => r === reports[0])) throw new Error('CLI entry/text/JSON determinism differs');
      console.log(textureScaleLines(JSON.parse(readFileSync(join(work, 'reading.json'), 'utf8'))).join('\n'));
    }
  }
  const examples = join(root, 'examples');
  if (!existsSync(examples)) throw new Error('example corpus absent: run bun run fetch-examples');
  for (const dir of readdirSync(examples).sort()) {
    const exports = join(examples, dir, 'export');
    if (!existsSync(exports)) continue;
    const files = readdirSync(exports).sort();
    for (const file of files.filter(f => f.endsWith('.json'))) {
      const packs = files.filter(f => f.endsWith('.atlas'));
      // Prefer the exact stem's pack, otherwise the shared project pack; never silently ignore an export.
      const stem = file.replace(/-(ess|pro)(-.*)?\.json$/, '').replace(/\.json$/, '');
      const atlas = packs.find(p => p === `${stem}.atlas`) ?? (packs.length === 1 ? packs[0] : undefined);
      if (atlas === undefined) throw new Error(`${dir}/${file}: atlas ambiguous: ${packs.join(', ')}`);
      collect(`examples/${dir}/${file}`, join(exports, file), join(exports, atlas));
    }
  }
  json(join(out, 'corpus.json'), results);
  return results;
}
if (import.meta.main) {
  const out = resolve(process.argv[2] ?? 'texture-scale-proof'); mkdirSync(out, { recursive: true });
  console.log(JSON.stringify(ditherProof(out)));
  corpusProof(out);
}
