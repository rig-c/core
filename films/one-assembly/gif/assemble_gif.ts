/**
 * Turns rigc's rendered frame sets into the finished GIF.
 *
 * Nothing here touches the animation: the film is CUT here, not authored here.
 * What this does is (1) crop rigc's frames back to the stage plate, using the
 * viewport rigc itself wrote into `frames.json` rather than a second copy of
 * the arithmetic, (2) downsample the 2x supersample once, (3) draw the two
 * things that are captions rather than art — the loose-PNG filenames and the
 * bottom band — and (4) splice the sets into one loop.
 *
 * `--scale N` writes the same film at N times the size (issue #1503): the
 * layout below is solved once in the 600 px picture's own pixels, and only the
 * drawing — the resize, every type size, every position — is multiplied, so
 * the larger file is the same picture with more pixels in it rather than a
 * second layout. `bun gif/assemble_gif.ts` is scale 1, the shipped size.
 */
import { mkdirSync, rmSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { $ } from 'bun';
import { PLATE_W, PLATE_H } from '../art/layout';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const RENDER = `${ROOT}render/`;
const WORK = `${ROOT}gif/frames/`;

/**
 * The output scale, read off `--scale` (default 1).
 *
 * It multiplies the drawing and nothing else. The ceiling is not a number typed
 * here: a scale that would make the resize ENLARGE the crop is refused below,
 * once the crop is known, because pixels the render did not sample would be
 * invented by the filter rather than drawn by rigc.
 */
const SCALE = (() => {
  const at = process.argv.indexOf('--scale');
  if (at < 0) return 1;
  const raw = process.argv[at + 1];
  const v = Number(raw);
  if (!Number.isInteger(v) || v < 1) throw new Error(`--scale takes a whole number of at least 1, got "${raw}"`);
  return v;
})();
const OUT = `${ROOT}${SCALE === 1 ? 'rigc-demo.gif' : `rigc-demo@${SCALE}x.gif`}`;

/** GIF frame delay in centiseconds. 5 cs is exactly 20 fps — the render rate. */
const DELAY = 5;
/**
 * The long side at scale 1, which is the unit every layout number below is in.
 * The 2x supersample halves to exactly this; at `--scale 2` it is not resized.
 */
const GIF_W = 600;

// ---------------------------------------------------------------------------
// where the stage sits in rigc's frames
// ---------------------------------------------------------------------------

interface Sidecar {
  viewport: { x: number; y: number; width: number; height: number; scale: number };
  sets: { dir: string; animation: string; fps: number; written: number }[];
}
const side: Sidecar = await Bun.file(`${RENDER}frames.json`).json();
const vp = side.viewport;

/** World → frame pixel, y down, straight out of the sidecar's contract. */
const px = (wx: number) => (wx - vp.x) * vp.scale;
const py = (wy: number) => (vp.y + vp.height - wy) * vp.scale;

const cropX = Math.round(px(0));
const cropY = Math.round(py(PLATE_H));
const cropW = Math.round(px(PLATE_W)) - cropX;
const cropH = Math.round(py(0)) - cropY;
const shrink = GIF_W / cropW;
const GIF_H = Math.round(cropH * shrink);
/** The written file's size: the scale-1 picture, times the scale. */
const OUT_W = GIF_W * SCALE;
const OUT_H = GIF_H * SCALE;
/** Scale-1 pixels → written pixels. Every coordinate and type size goes through it. */
const S = (v: number) => v * SCALE;

console.log(`stage in frame: ${cropW}x${cropH}+${cropX}+${cropY} -> ${OUT_W}x${OUT_H}`);
if (Math.abs(shrink - 0.5) > 1e-9) {
  console.log(`⚠️  downsample is ${shrink.toFixed(4)}, not the intended 0.5`);
}
if (OUT_W > cropW || OUT_H > cropH) {
  throw new Error(
    `--scale ${SCALE} writes ${OUT_W}x${OUT_H} from a ${cropW}x${cropH} crop — that enlarges the render, ` +
      'so the extra pixels would be the filter\'s, not rigc\'s; render with a larger --max instead',
  );
}

/** World → final GIF pixel. */
const fx = (wx: number) => (px(wx) - cropX) * shrink;
const fy = (wy: number) => (py(wy) - cropY) * shrink;

// ---------------------------------------------------------------------------
// the two pieces of type
// ---------------------------------------------------------------------------

const MONO = 'Andale-Mono';
const DIM = '#79839224';
const LABEL_FILL = '#93a0b0';
const HEAD_FILL = '#f2d49c';
const BODY_FILL = '#aeb9c8';
const CMD_FILL = '#7b8695';

/** Andale-Mono's advance, measured rather than assumed. */
const advance = async (pt: number) => {
  const one = Number(
    await $`magick -size 900x60 xc:none -font ${MONO} -pointsize ${pt} -fill white -annotate +2+40 ${'M'.repeat(10)} -trim -format %w info:`.text(),
  );
  const two = Number(
    await $`magick -size 900x60 xc:none -font ${MONO} -pointsize ${pt} -fill white -annotate +2+40 ${'M'.repeat(50)} -trim -format %w info:`.text(),
  );
  return (two - one) / 40;
};

const ADV_LABEL = await advance(11);
const ADV_HEAD = await advance(15);
const ADV_CMD = await advance(10);

/**
 * The scatter layout's filenames, at the place the plate actually lies.
 *
 * Read out of the rig and motion specs rather than restated, so a scatter the
 * spec moves takes its label with it.
 */
const rigSpec = await Bun.file(`${ROOT}spec/rigby.rig.json`).json();
const specSrc = await Bun.file(`${ROOT}spec/make_specs.ts`).text();

/** The SCATTER table, lifted out of the generator's source. */
const scatterRows = [...specSrc.matchAll(/\{ slot: '(\w+)', cx: (-?[\d.]+), cy: (-?[\d.]+)/g)].map(
  (m) => ({ slot: m[1], cx: Number(m[2]), cy: Number(m[3]) }),
);
if (scatterRows.length === 0) throw new Error('could not read the SCATTER table');

const imageOf = new Map<string, string>();
for (const [slot, holders] of Object.entries(
  rigSpec.skins.default as Record<string, Record<string, { image: string }>>,
)) {
  const first = holders[slot];
  if (first !== undefined) imageOf.set(slot, first.image);
}

const sizeOf = new Map<string, [number, number]>();
for (const [, image] of imageOf) {
  const wh = (
    await $`magick identify -format "%w %h" ${ROOT}art/parts/${image}`.text()
  ).split(' ');
  sizeOf.set(image, [Number(wh[0]), Number(wh[1])]);
}

/** An axis-aligned box in final GIF pixels. */
interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
const hits = (a: Box, b: Box, pad = 3) =>
  a.x0 < b.x1 + pad && a.x1 + pad > b.x0 && a.y0 < b.y1 + pad && a.y1 + pad > b.y0;

/** Where the plates lie, and how big their labels are. */
const plates = scatterRows
  .map((row) => {
    const image = imageOf.get(row.slot);
    if (image === undefined) return null;
    const [w, h] = sizeOf.get(image)!;
    const r = (Number(specSrc.match(new RegExp(`cx: ${row.cx}[^}]*rotation: (-?[\\d.]+)`))?.[1]) || 0) * (Math.PI / 180);
    const halfW = ((Math.abs(w * Math.cos(r)) + Math.abs(h * Math.sin(r))) / 2) * vp.scale * shrink;
    const halfH = ((Math.abs(w * Math.sin(r)) + Math.abs(h * Math.cos(r))) / 2) * vp.scale * shrink;
    const cx = fx(row.cx);
    const cy = fy(row.cy);
    return {
      image,
      cx,
      cy,
      halfW,
      halfH,
      area: halfW * halfH,
      box: { x0: cx - halfW, y0: cy - halfH, x1: cx + halfW, y1: cy + halfH } as Box,
    };
  })
  .filter((p): p is NonNullable<typeof p> => p !== null);

/**
 * Label placement, solved once rather than eyeballed.
 *
 * Twelve filenames on a 600 px frame collide if each one just goes under its
 * own plate — the first cut had `hand_f.png` written through `eyes.png` and
 * `scarf_tail.png` through `scarf_knot.png`. So: try eight positions per
 * label, take the first that clears every plate, every label already placed,
 * the caption band and the frame edge. Biggest plates first, because they have
 * the fewest free sides.
 */
const BAND_TOP = 62;
const labelPlan = (() => {
  const placed: Box[] = [];
  const out: { image: string; x: number; y: number }[] = [];
  const frame: Box = { x0: 0, y0: 0, x1: GIF_W, y1: GIF_H };
  for (const p of [...plates].sort((a, b) => b.area - a.area)) {
    const textW = p.image.length * ADV_LABEL;
    const textH = 11;
    const cand: [number, number][] = [
      [p.cx - textW / 2, p.cy + p.halfH + 13],
      [p.cx - textW / 2, p.cy - p.halfH - 5],
      [p.cx + p.halfW + 8, p.cy + 4],
      [p.cx - p.halfW - 8 - textW, p.cy + 4],
      [p.cx - textW / 2 + p.halfW, p.cy + p.halfH + 13],
      [p.cx - textW / 2 - p.halfW, p.cy + p.halfH + 13],
      [p.cx - textW / 2 + p.halfW, p.cy - p.halfH - 5],
      [p.cx - textW / 2 - p.halfW, p.cy - p.halfH - 5],
    ];
    let best: [number, number] | null = null;
    for (const [tx, ty] of cand) {
      const box: Box = { x0: tx - 2, y0: ty - textH, x1: tx + textW + 2, y1: ty + 3 };
      if (box.x0 < 5 || box.x1 > GIF_W - 5 || box.y0 < 5 || box.y1 > GIF_H - BAND_TOP) continue;
      if (plates.some((q) => hits(box, q.box, 2))) continue;
      if (placed.some((q) => hits(box, q))) continue;
      best = [tx, ty];
      placed.push(box);
      break;
    }
    if (best === null) {
      console.log(`⚠️  no clear spot for ${p.image}; parked under its plate`);
      best = [p.cx - textW / 2, p.cy + p.halfH + 13];
    }
    out.push({ image: p.image, x: Math.round(best[0]), y: Math.round(best[1]) });
  }
  void frame;
  return out;
})();

/** One `-annotate` triple per filename, at the solved position. */
function labelArgs(alpha: number): string[] {
  if (alpha <= 0.001) return [];
  const hex = Math.round(Math.min(1, alpha) * 255)
    .toString(16)
    .padStart(2, '0');
  const args = ['-font', MONO, '-pointsize', String(S(11)), '-fill', `${LABEL_FILL}${hex}`];
  for (const l of labelPlan) args.push('-annotate', `+${S(l.x)}+${S(l.y)}`, l.image);
  return args;
}

/**
 * The persistent bottom band: what the thing is, and the two commands.
 *
 * ⚠️ The name is drawn a second time OVER the full line rather than offset
 * after it. `-annotate` drops leading spaces, so an offset built from the
 * name's own advance ran `spine-rigc` into the em-dash; over-drawing the same
 * glyphs in a second colour cannot misalign.
 */
const CAP_NAME = 'rig-c';
const CAP_LINE = 'rig-c  —  loose PNGs → a living Spine rig';
const CAP_CMD = 'rigc build --rig rigby.rig.json --motion rigby.motion.json --images parts --out build';
const CAP_CMD2 = 'rigc render --candidate build --fps 20';

const bandArgs: string[] = [
  '-font',
  MONO,
  '-pointsize',
  String(S(15)),
  '-fill',
  BODY_FILL,
  '-annotate',
  `+${S(24)}+${S(GIF_H - 46)}`,
  CAP_LINE,
  '-fill',
  HEAD_FILL,
  '-annotate',
  `+${S(24)}+${S(GIF_H - 46)}`,
  CAP_NAME,
  '-pointsize',
  String(S(10)),
  '-fill',
  CMD_FILL,
  '-annotate',
  `+${S(24)}+${S(GIF_H - 26)}`,
  CAP_CMD,
  '-annotate',
  `+${S(24)}+${S(GIF_H - 12)}`,
  CAP_CMD2,
];
void ADV_HEAD;
void DIM;

// ---------------------------------------------------------------------------
// the cut
// ---------------------------------------------------------------------------

const setDir = (animation: string) => {
  const found = side.sets.find((s) => s.animation === animation);
  if (found === undefined) throw new Error(`no rendered set for "${animation}"`);
  return `${RENDER}${found.dir}/`;
};
const frameCount = (dir: string) =>
  readdirSync(dir).filter((f) => /^f\d+\.png$/.test(f)).length;

const A = setDir('assemble');
const I = setDir('idle');
const W = setDir('wave');
const nA = frameCount(A);
const nI = frameCount(I);
const nW = frameCount(W);
const src = (dir: string, i: number) => `${dir}f${String(i).padStart(4, '0')}.png`;

/**
 * The shot list.
 *
 * ⭐ Every set's LAST sampled frame is dropped where the next set starts from
 * the same pose: `assemble`'s last frame IS the setup pose, which is `idle`'s
 * t=0, and `idle`'s last frame at t=duration is its own t=0 again because it
 * loops. Keeping them would hold two identical frames at every join — visible
 * as a hitch at exactly the moments the film is trying to flow.
 */
const holdFrames = 10;
const labelFade = [1, 1, 1, 1, 1, 1, 0.8, 0.55, 0.3, 0.12];

interface Shot {
  file: string;
  labels: number;
}
const shots: Shot[] = [];
for (let i = 0; i < holdFrames; i += 1) shots.push({ file: src(A, 0), labels: labelFade[i] });
for (let i = 0; i < nA - 1; i += 1) shots.push({ file: src(A, i), labels: 0 });
for (let i = 0; i < nI - 1; i += 1) shots.push({ file: src(I, i), labels: 0 });
for (let i = 0; i < nW; i += 1) shots.push({ file: src(W, i), labels: 0 });

console.log(
  `shots: hold ${holdFrames} + assemble ${nA - 1} + idle ${nI - 1} + wave ${nW} = ${shots.length}`,
);

// ---------------------------------------------------------------------------
// composite every frame
// ---------------------------------------------------------------------------

rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

const pad = (i: number) => String(i).padStart(4, '0');

for (let i = 0; i < shots.length; i += 1) {
  const shot = shots[i];
  await $`magick ${shot.file} -crop ${`${cropW}x${cropH}+${cropX}+${cropY}`} +repage -filter Lanczos -resize ${`${OUT_W}x${OUT_H}!`} -alpha remove -alpha off ${bandArgs} ${labelArgs(shot.labels)} ${WORK}s${pad(i)}.png`.quiet();
}

/**
 * The loop seam. `wave` ends at the rest pose and the film restarts on the
 * scatter, so the join is a real cut — and a cross-dissolve there is not just
 * damage control, it is the film's own metaphor running backwards: the figure
 * comes apart into the plates it was built from.
 *
 * Five steps rather than one hard cut, because the step SIZE is what reads as
 * a cut: a straight join puts 21 % of the frame RMSE into one hop, against 1.4 %
 * for a normal frame-to-frame step. Five keeps the last hop near the others,
 * and stays short enough that the two-figures-at-once middle goes by fast.
 */
const DISSOLVE = [14, 30, 50, 72, 90];
const last = `${WORK}s${pad(shots.length - 1)}.png`;
const first = `${WORK}s${pad(0)}.png`;
for (let i = 0; i < DISSOLVE.length; i += 1) {
  await $`magick ${last} ${first} -compose blend -define compose:args=${String(DISSOLVE[i])} -composite ${WORK}s${pad(shots.length + i)}.png`.quiet();
}
const total = shots.length + DISSOLVE.length;
console.log(`+ ${DISSOLVE.length} dissolve = ${total} frames (${(total / 20).toFixed(2)}s)`);

// ---------------------------------------------------------------------------
// the GIF
// ---------------------------------------------------------------------------

/**
 * The encode, and the two things measurement changed about it.
 *
 * 1. 🚨 The frame list is built and SORTED here, not left to a glob. Bun's
 *    shell expands `s*.png` in directory order, not lexicographic order —
 *    measured: `s0002 s0016 s0017 s0003 s0029 s0015 …` — so the GIF came out
 *    with its frames shuffled. It played as a valid 136-frame animation of the
 *    right size and duration, and the damage was invisible in the file's own
 *    stats. What caught it was diffing the written GIF, coalesced, against the
 *    frames it was supposedly made from: 10–24 % RMSE from frame ~50 on, and
 *    frame 135 reconstructing as a mid-assembly pose. ⚠️ It also produced a
 *    convincing WRONG diagnosis first — shuffled frames make consecutive-frame
 *    differencing produce nonsense, so `-layers Optimize` looked like the
 *    culprit and dropping it looked like the fix. With the order corrected,
 *    `-layers Optimize` is exact (0.49 % mean, all palette) and `-coalesce`
 *    ahead of it changes neither the bytes nor the error.
 *
 * 2. `+dither` — dithering OFF — measured, not assumed. On these exact frames:
 *      -colors 128 -layers Optimize                     3.53 MiB
 *      -colors 256 -layers Optimize      (dithered)     3.36 MiB, RMSE 0.77 %
 *      +dither -colors 256 -layers Optimize             2.85 MiB, RMSE 0.49 %
 *      +dither -colors 256 -layers OptimizeTransparency 3.08 MiB, RMSE 0.45 %
 *      +dither -colors 256 -fuzz 2% -layers Optimize    1.27 MiB, RMSE 0.53 %
 *    A smaller palette is BIGGER, because dither noise costs more than the
 *    colours it saves. And the two cheapest-looking options are both worse in
 *    ways an RMSE does not catch: the dithered one lays a visible crosshatch
 *    over the background, and `-fuzz` leaves ghost arcs where the figure has
 *    been, because a fuzzed frame-difference stops updating pixels that drift
 *    slowly. Dithering the gradient by hand with a static noise overlay was
 *    tried too: 7.87 MiB — the noise defeats the frame differencing.
 *
 * 3. `OptimizeTransparency` rather than the full `Optimize`, for 0.23 MiB.
 *    `Optimize` also does frame cropping, and it pays for that with
 *    `dispose=Previous` on 18 of the 134 frames plus 7 different page
 *    geometries. `OptimizeTransparency` leaves every frame full-canvas with a
 *    single dispose mode — measured: `{Undefined: 134}`, one page geometry —
 *    which is the encoding least able to go wrong in somebody else's viewer.
 *    Neither carries `dispose=Background`, the mode that flashes.
 */
const files = readdirSync(WORK)
  .filter((f) => /^s\d+\.png$/.test(f))
  .sort()
  .map((f) => `${WORK}${f}`);
if (files.length !== total) throw new Error(`expected ${total} frames on disk, found ${files.length}`);
await $`magick -delay ${DELAY} -loop 0 ${files} +dither -colors 256 -layers OptimizeTransparency ${OUT}`;

// ---------------------------------------------------------------------------
// verify: dimensions, count, rate, loop flag, fidelity, and the seam
// ---------------------------------------------------------------------------

const bytes = (await Bun.file(OUT).arrayBuffer()).byteLength;
const rows = (await $`magick identify -format "%wx%h %T %g\n" ${OUT}`.text()).trim().split('\n');
const delays = new Set(rows.map((r) => r.split(' ')[1]));
/** The loop count lives in the Netscape extension; only -verbose names it. */
const verbose = await $`magick identify -verbose ${OUT}`.text();
const iterations = /Iterations:\s*(\d+)/.exec(verbose)?.[1] ?? '(absent)';

/**
 * Fidelity, per frame, against the composited source.
 *
 * ⚠️ Every frame, not a sample of seven. The broken `-layers Optimize` above
 * was clean at frames 0 and 10 and only went wrong from ~50 on, so a spot check
 * would have shipped it.
 */
await $`magick ${OUT} -coalesce ${WORK}co-%04d.png`.quiet();
const co = (i: number) => `${WORK}co-${pad(i)}.png`;
const rmse = async (a: string, b: string) => {
  const proc = Bun.spawn(['magick', 'compare', '-metric', 'RMSE', a, b, 'null:'], {
    stderr: 'pipe',
    stdout: 'pipe',
  });
  await proc.exited;
  return Number((await new Response(proc.stderr).text()).trim().split(' ')[0]);
};

let sum = 0;
let worst = { v: -1, i: -1 };
for (let i = 0; i < rows.length; i += 1) {
  const v = await rmse(co(i), `${WORK}s${pad(i)}.png`);
  sum += v;
  if (v > worst.v) worst = { v, i };
}
const pc = (v: number) => `${((v / 65535) * 100).toFixed(2)}%`;

/**
 * The seam, measured against a normal frame-to-frame step so the number means
 * something. The film restarts on the scatter, so the join is a real cut and
 * the dissolve's job is to make the last hop no bigger than the others.
 */
const seam = await rmse(co(rows.length - 1), co(0));
const typical = await rmse(co(60), co(61));

console.log(`\n${OUT}`);
console.log(`  frames      ${rows.length}`);
console.log(`  canvas      ${[...new Set(rows.map((r) => r.split(' ')[2].split('+')[0]))].join(', ')}`);
console.log(
  `  delay       ${[...delays].join(', ')} cs  (= ${(100 / Number([...delays][0])).toFixed(0)} fps, ${(rows.length * Number([...delays][0])) / 100}s)`,
);
console.log(`  loop        Iterations: ${iterations}  (0 = forever)`);
console.log(`  bytes       ${bytes.toLocaleString()}  (${(bytes / 1024 / 1024).toFixed(2)} MiB)`);
console.log(`  fidelity    mean ${pc(sum / rows.length)}, worst ${pc(worst.v)} at frame ${worst.i}`);
console.log(`  seam        ${pc(seam)} last->first, against ${pc(typical)} for a mid-shot step`);
void ADV_CMD;
