/**
 * The film's four claims, measured — three of them off the ENCODED GIF rather
 * than off the frames that went into it.
 *
 * `assemble_gif.ts` already checks that the file is the plan (frame-by-frame
 * RMSE) and that the plan is in order. What it cannot check is whether the
 * things the film SAYS are true:
 *
 *   1. "one continuous pass, nothing between them" — do the animations really
 *      hand off on the same pose, or is there a hidden cut?
 *   2. "sampled at --fps 50, played at 25" — is the slow stretch real
 *      resampling, or is it the same frames held twice?
 *   3. "the back hair goes the OTHER way" — does the silhouette actually widen,
 *      which is the only way both sides can be moving apart?
 *   4. the loop — does the last frame land back on the first?
 *
 * Claim 3 is the one worth the trouble. A yaw that merely SLID the head would
 * move the whole silhouette sideways and keep its width; a yaw with parallax
 * moves the far lock one way and the back hair the other, so the outline gets
 * WIDER at the peak. That is measurable in the delivered file.
 *
 * `--scale N` measures the file `assemble_gif.ts --scale N` wrote, on its own
 * pixel grid: the pane is N times `layout.ts`'s, and every figure below that is
 * "in final pixels" is in that file's pixels.
 */
import { mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { $ } from 'bun';
import { PANE_W as PANE_W_1, STAGE_H as STAGE_H_1 } from './layout';

const SCALE = (() => {
  const at = process.argv.indexOf('--scale');
  if (at < 0) return 1;
  const raw = process.argv[at + 1];
  const v = Number(raw);
  if (!Number.isInteger(v) || v < 1) throw new Error(`--scale takes a whole number of at least 1, got "${raw}"`);
  return v;
})();
/** The pane, on the measured file's own grid. */
const PANE_W = PANE_W_1 * SCALE;
const STAGE_H = STAGE_H_1 * SCALE;

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const GIF = `${ROOT}${SCALE === 1 ? 'rigc-scene.gif' : `rigc-scene@${SCALE}x.gif`}`;
const WORK = `${ROOT}gif/verify/`;

if (!existsSync(GIF)) throw new Error(`no ${GIF} — run gif/assemble_gif.ts${SCALE === 1 ? '' : ` --scale ${SCALE}`} first`);
console.log(`measuring ${GIF.split('/').pop()}, pane ${PANE_W}x${STAGE_H}\n`);
rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

const pad = (i: number) => String(i).padStart(4, '0');
const ae = async (a: string, b: string) => {
  const p = Bun.spawn(['magick', 'compare', '-metric', 'AE', a, b, 'null:'], { stderr: 'pipe', stdout: 'pipe' });
  await p.exited;
  return Number((await new Response(p.stderr).text()).trim().split(' ')[0]);
};
const maxdiff = async (a: string, b: string) =>
  Number(await $`magick ${a} ${b} -compose difference -composite -format ${'%[fx:maxima*255]'} info:`.text());

// ---------------------------------------------------------------------------
// 1. the hand-offs — why this film has no dissolves
// ---------------------------------------------------------------------------

const f = (dir: string, set: string, i: number) => `${ROOT}${dir}/${set}/f${pad(i)}.png`;
const PAIRS: [string, string, string][] = [
  ['idle f0000 = gaze f0000 (both rest)', f('render', 'idle@25fps', 0), f('render', 'gaze@25fps', 0)],
  ['gaze f0038 = turn f0000 (the hand-off)', f('render', 'gaze@25fps', 38), f('render', 'turn@25fps', 0)],
  ['gaze f0000 = gaze f0038 (one-shot returns)', f('render', 'gaze@25fps', 0), f('render', 'gaze@25fps', 38)],
  ['turn f0000 = turn f0055 (one-shot returns)', f('render', 'turn@25fps', 0), f('render', 'turn@25fps', 55)],
  ['idle f0000 = idle f0080 (the loop)', f('render', 'idle@25fps', 0), f('render', 'idle@25fps', 80)],
];
console.log('1. pose hand-offs, on the 1332x1782 render (the film needs no dissolve iff these are 0)');
for (const [what, a, b] of PAIRS) {
  const n = await ae(a, b);
  const m = n === 0 ? 0 : await maxdiff(a, b);
  console.log(`   ${what.padEnd(44)} ${String(n).padStart(6)} px differ${n === 0 ? '' : `, worst channel ${m}/255`}`);
}

// ---------------------------------------------------------------------------
// 2. is the 50 fps set really the same animation?
// ---------------------------------------------------------------------------

console.log('\n2. the 50 fps set against the 25 fps set, wherever their sample times coincide');
for (const j of [0, 5, 10, 16, 21, 25, 40, 55]) {
  const n = await ae(f('render', 'turn@25fps', j), f('render-slow', 'turn@50fps', j * 2));
  console.log(`   t=${(j / 25).toFixed(2)}s   25fps f${pad(j)} vs 50fps f${pad(j * 2)}   ${String(n).padStart(6)} px differ`);
}

// ---------------------------------------------------------------------------
// the silhouette, per delivered frame
// ---------------------------------------------------------------------------

console.log('\ncoalescing the GIF…');
await $`magick ${GIF} -coalesce ${WORK}co-%04d.png`.quiet();
/**
 * ⚠️ Counted on disk, not from `identify -format %n`. That format prints the
 * frame count ONCE PER FRAME with no separator, so a 198-frame GIF answers
 * `198198198…` — which parses as a number, is off by orders of magnitude, and
 * sent the first run of this script looking for `co-0198.png`.
 */
const N = readdirSync(WORK).filter((n) => /^co-\d+\.png$/.test(n)).length;

/**
 * The pane's own backdrop — the stage plate, through the film's exact window
 * and downsample, with no figure on it. `probe/plate_frame.png` is the plate on
 * the render's pixel grid (`measure_ink.ts` writes it), so the same crop and
 * resize the film uses lands it on the film's grid.
 */
const RUN = (await Bun.file(`${ROOT}run.log`).text()).split('\n');
const winLine = RUN.find((l) => l.startsWith('bust window in frame:'));
if (winLine === undefined) throw new Error('run.log has no "bust window in frame:" line');
const WINDOW = /bust window in frame: (\S+)/.exec(winLine)![1];
console.log(`   window from run.log: ${WINDOW}`);

const PANE_BG = `${WORK}pane_plate.png`;
await $`magick ${ROOT}probe/plate_frame.png -crop ${WINDOW} +repage -filter Lanczos -resize ${`${PANE_W}x${STAGE_H}!`} -alpha remove -alpha off ${PANE_BG}`.quiet();

/** The figure's bounding box inside the pane, in final pixels. */
const silhouette = async (frame: string) => {
  const args = [
    '(', PANE_BG, ')',
    '(', frame, '-crop', `${PANE_W}x${STAGE_H}+0+0`, '+repage', ')',
    '-compose', 'difference', '-composite', '-colorspace', 'Gray', '-threshold', '6%', '-format', '%@', 'info:',
  ];
  const bb = (await $`magick ${args}`.text()).trim();
  const m = /^(\d+)x(\d+)\+(\d+)\+(\d+)$/.exec(bb);
  if (m === null) throw new Error(`no silhouette in ${frame} (bbox "${bb}")`);
  return { w: Number(m[1]), x0: Number(m[3]), x1: Number(m[3]) + Number(m[1]) };
};

/** The beat table, as `assemble_gif.ts` prints it. */
const BEATS = { rest: [0, 9], idle: [10, 88], gaze: [89, 126], t25a: [127, 131], t50: [132, 162], t25b: [163, 197] };

const sil: { x0: number; x1: number; w: number }[] = [];
for (let i = 0; i < N; i += 1) sil.push(await silhouette(`${WORK}co-${pad(i)}.png`));

// ---------------------------------------------------------------------------
// 3. the parallax — does the outline widen?
// ---------------------------------------------------------------------------

const rest = sil[5];
let peak = { i: -1, w: -1 };
for (let i = BEATS.t50[0]; i <= BEATS.t25b[1]; i += 1) if (sil[i].w > peak.w) peak = { i, w: sil[i].w };
console.log('\n3. the silhouette in the delivered GIF, in final pixels');
console.log(`   at rest (frame 5)          x ${rest.x0}..${rest.x1}   width ${rest.w}`);
console.log(`   at the peak (frame ${peak.i})     x ${sil[peak.i].x0}..${sil[peak.i].x1}   width ${peak.w}`);
console.log(
  `   => far edge ${sil[peak.i].x0 - rest.x0 >= 0 ? '+' : ''}${sil[peak.i].x0 - rest.x0}px,` +
    ` near edge ${sil[peak.i].x1 - rest.x1 >= 0 ? '+' : ''}${sil[peak.i].x1 - rest.x1}px,` +
    ` width ${peak.w - rest.w >= 0 ? '+' : ''}${peak.w - rest.w}px`,
);
console.log('      a SLIDE moves both edges the same way and keeps the width; both edges moving');
console.log('      apart is the two hair depths (-55 behind the axis, +100 in front) pulling against');
console.log('      each other, which is the shot.');

// ---------------------------------------------------------------------------
// 4. half speed — the per-frame step, measured
// ---------------------------------------------------------------------------

/**
 * 🚫 The first cut of this measurement took the MEAN of the non-zero per-frame
 * steps and answered `ratio 0.848`, which is not half of anything.
 *
 * The bias is integer pixels. The silhouette's edge is a bounding box, so a
 * step is a whole number, and at 50 fps the true step over this stretch is
 * ~0.9px — which lands on 0 or 1. Filtering the zeros out as "not moving" then
 * throws away exactly the frames that make the rate half, and averages the
 * survivors up to ~1. ⇒ measure the TOTAL travel over a stretch and divide by
 * the number of frames that cover it. Both rates cross the same distance, so
 * the quantisation cancels and the frame count is the whole answer.
 */
const travel = (from: number, to: number, edges: number[]) => {
  const total = Math.abs(edges[to] - edges[from]);
  return { total, steps: to - from, per: total / (to - from) };
};

/**
 * The comparison has to be over the SAME stretch of the animation, not over
 * whole beats: the yaw's excursion is not linear, so a window of "the 50 fps
 * beat" against "the 25 fps beat" would be comparing the arrival to the
 * release. Both windows below are t = 0.20..0.64s of `turn` — 22 delivered
 * frames in the film's slow beat, and 11 in the 25 fps set.
 */
const slowFrom = BEATS.t50[0];
const slowTo = BEATS.t50[0] + 22;
const slow = travel(slowFrom, slowTo, sil.map((s) => s.x0));

/** The same 0.44s of animation as the 25 fps set renders it, straight off disk. */
const fastEdges: number[] = [];
for (let j = 5; j <= 16; j += 1) {
  const out = `${WORK}fast-${pad(j)}.png`;
  await $`magick ${f('render', 'turn@25fps', j)} -crop ${WINDOW} +repage -filter Lanczos -resize ${`${PANE_W}x${STAGE_H}!`} -alpha remove -alpha off ${out}`.quiet();
  fastEdges.push((await silhouette(out)).x0);
}
const fastT = travel(0, fastEdges.length - 1, fastEdges);

/**
 * ⚠️ A bounding-box edge is a coarse ruler here — over this stretch it travels
 * only 4px, because the edge belongs to the BACK HAIR, which is the one part
 * moving against the face and therefore the one whose travel is smallest. 4/11
 * against 4/22 is exactly 0.5 and is also two small integers, so it is reported
 * but not leaned on. The ruler leaned on is the next one: per-frame RMSE, which
 * is continuous and, for displacements this small, proportional to them.
 */
const rmse = async (a: string, b: string) => {
  const p = Bun.spawn(['magick', 'compare', '-metric', 'RMSE', a, b, 'null:'], { stderr: 'pipe', stdout: 'pipe' });
  await p.exited;
  return Number((await new Response(p.stderr).text()).trim().split(' ')[0]);
};
const paneOf = async (src: string, out: string) => {
  await $`magick ${src} -crop ${WINDOW} +repage -filter Lanczos -resize ${`${PANE_W}x${STAGE_H}!`} -alpha remove -alpha off ${out}`.quiet();
  return out;
};

/** Mean per-frame RMSE across the 25 fps set's own frames for the stretch. */
const fastR: number[] = [];
for (let j = 6; j <= 16; j += 1) {
  fastR.push(await rmse(await paneOf(f('render', 'turn@25fps', j - 1), `${WORK}fr-a.png`), await paneOf(f('render', 'turn@25fps', j), `${WORK}fr-b.png`)));
}
/** The same, on the film's delivered slow frames, cropped to the pane. */
const slowR: number[] = [];
let dupes = 0;
for (let i = slowFrom + 1; i <= slowTo; i += 1) {
  const a = `${WORK}sr-a.png`;
  const b = `${WORK}sr-b.png`;
  await $`magick ${WORK}co-${pad(i - 1)}.png -crop ${`${PANE_W}x${STAGE_H}+0+0`} +repage ${a}`.quiet();
  await $`magick ${WORK}co-${pad(i)}.png -crop ${`${PANE_W}x${STAGE_H}+0+0`} +repage ${b}`.quiet();
  slowR.push(await rmse(a, b));
  if ((await ae(a, b)) === 0) dupes += 1;
}
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const pc = (v: number) => ((v / 65535) * 100).toFixed(3);

console.log('\n4. half speed, over the SAME stretch of animation (turn t=0.20..0.64s)');
console.log(`   at 25 fps    ${fastR.length} steps cover it, mean step ${pc(mean(fastR))}% RMSE   (edge travel ${fastT.total}px => ${fastT.per.toFixed(2)} px/frame)`);
console.log(`   at 50 fps    ${slowR.length} steps cover it, mean step ${pc(mean(slowR))}% RMSE   (edge travel ${slow.total}px => ${slow.per.toFixed(2)} px/frame)`);
console.log(`   ratio        ${(mean(slowR) / mean(fastR)).toFixed(3)} by RMSE, ${(slow.per / fastT.per).toFixed(3)} by edge travel  (0.5 = half speed)`);
console.log(`   held frames  ${dupes} of ${slowR.length} consecutive pairs identical in the FIGURE PANE`);
console.log('      (the pane is what --fps 50 bought; a held frame there would be a duplicate pose)');

// ---------------------------------------------------------------------------
// 5. the loop
// ---------------------------------------------------------------------------

const loopPx = await ae(`${WORK}co-${pad(N - 1)}.png`, `${WORK}co-0000.png`);
const loopMax = loopPx === 0 ? 0 : await maxdiff(`${WORK}co-${pad(N - 1)}.png`, `${WORK}co-0000.png`);
const paneOnly = await (async () => {
  const a = `${WORK}loop-a.png`;
  const b = `${WORK}loop-b.png`;
  await $`magick ${WORK}co-${pad(N - 1)}.png -crop ${`${PANE_W}x${STAGE_H}+0+0`} +repage ${a}`.quiet();
  await $`magick ${WORK}co-0000.png -crop ${`${PANE_W}x${STAGE_H}+0+0`} +repage ${b}`.quiet();
  return { px: await ae(a, b), max: await maxdiff(a, b) };
})();
console.log('\n5. the loop, on the delivered frames');
console.log(`   whole canvas    ${loopPx} px differ${loopPx === 0 ? '' : `, worst channel ${loopMax}/255`}  (the type is mid-fade at both ends)`);
console.log(`   figure pane     ${paneOnly.px} px differ${paneOnly.px === 0 ? '' : `, worst channel ${paneOnly.max}/255`}`);
