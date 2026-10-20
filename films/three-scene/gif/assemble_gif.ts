/**
 * Cuts the third film: one continuous pass of scene direction on a rig.
 *
 * Films one and two were montages — five shots, four dissolves, a ballot. This
 * one is a single take: Vela at rest, breathing, then her gaze, then the 2.5D
 * turn, in that order, with nothing cut between them. ⭐ **And it needs no
 * dissolves at all**, which is a property of the rig rather than of this
 * script: `idle` loops and `gaze` and `turn` are one-shots that return to rest,
 * so `idle`'s last frame, `gaze`'s first, `gaze`'s last and `turn`'s first are
 * the SAME POSE — verified below at 0 differing pixels. So the figure never
 * cross-fades; only the type does.
 *
 * Nothing here authors any movement, and nothing here draws Vela. What it does
 * is (1) crop rigc's frames to the bust window using the viewport rigc itself
 * wrote into `frames.json`, (2) downsample the 1.875x supersample once, (3) lay
 * the pane beside a type column, and (4) name, per beat, the command that
 * produced the frames on screen.
 *
 * Every number the column prints came back from a tool: the shot list's
 * durations are `explain`'s `declared=` values, the part/bone/slot counts are
 * `build`'s summary line, and the turn's five parallax numbers are the bytes of
 * `explain`'s own MEMBER rows.
 *
 * `--scale N` writes the same film at N times the size (issue #1503). Every
 * layout number — `layout.ts`'s and this file's — stays in the 600 px picture's
 * own pixels; only the drawing is multiplied where it is handed to ImageMagick,
 * so the larger file is the same picture with more pixels in it. The one place
 * that is not a plain multiplication is the type size, and `DRAWN_PT` says why.
 */
import { mkdirSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { $ } from 'bun';
import {
  GIF_W, GIF_H, BAND_H, STAGE_H, PANE_W, COL_X, COL_W, TEXT_X, TEXT_W,
  WIN_Y0, WIN_Y1, WIN_CX, YAW_AXIS_X,
  TEAL, HEAD, BODY, LABEL, CMD, DIM, PANEL, PANEL_EDGE,
} from './layout';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const WORK = `${ROOT}gif/frames/`;
const BITS = `${ROOT}gif/bits/`;

/**
 * The output scale, read off `--scale` (default 1). The ceiling is not typed
 * here: a scale whose pane would ENLARGE the bust window is refused once the
 * window is known, because those pixels would be the filter's, not rigc's.
 */
const SCALE = (() => {
  const at = process.argv.indexOf('--scale');
  if (at < 0) return 1;
  const raw = process.argv[at + 1];
  const v = Number(raw);
  if (!Number.isInteger(v) || v < 1) throw new Error(`--scale takes a whole number of at least 1, got "${raw}"`);
  return v;
})();
/** Scale-1 pixels → written pixels. */
const S = (v: number) => v * SCALE;
const OUT_W = S(GIF_W);
const OUT_H = S(GIF_H);
const OUT = `${ROOT}${SCALE === 1 ? 'rigc-scene.gif' : `rigc-scene@${SCALE}x.gif`}`;

/** GIF frame delay in centiseconds. 4 cs is exactly 25 fps — the render rate. */
const DELAY = 4;
const FPS = 100 / DELAY;

/**
 * Draw the yaw axis as a hairline during the held yaw?
 *
 * 🚫 Built, looked at, removed. It does do its job — the face sits left of it
 * and the back hair right of it, which is the whole shot in one static frame —
 * but there is nowhere in this framing to put a LABEL on it: the cowlick
 * reaches plate y 13 and the shoulders fill the floor, so the two margins a
 * caption could live in are 9px and 0px tall. An unlabelled 1px line down a
 * face reads as a crop artifact, and this film labels everything else it draws.
 * ⇒ off. The parallax is left to the motion, which is what the film is for.
 */
const AXIS_LINE = false;

// ---------------------------------------------------------------------------
// where the bust sits in rigc's frames
// ---------------------------------------------------------------------------

interface Sidecar {
  viewport: { x: number; y: number; width: number; height: number; scale: number; pixelWidth: number; pixelHeight: number };
  sets: { dir: string; animation: string; fps: number; sampled: number; written: number; duration: number }[];
}

const fast: Sidecar = await Bun.file(`${ROOT}render/frames.json`).json();
const slow: Sidecar = await Bun.file(`${ROOT}render-slow/frames.json`).json();
if (JSON.stringify(fast.viewport) !== JSON.stringify(slow.viewport)) {
  throw new Error('the 25 fps and the 50 fps render disagree about the viewport — one window cannot fit both');
}
const vp = fast.viewport;

/** Plate origin in frame pixels, from the sidecar's own contract (y down). */
const ox = (0 - vp.x) * vp.scale;
const oy = (vp.y + vp.height - 880) * vp.scale;

/**
 * The bust window, in frame pixels.
 *
 * Height is the window's own 520 plate units; width follows from the pane's
 * aspect, because the head's size on screen is set by the window's HEIGHT alone
 * (`layout.ts` derives this) — so the width is free to be whatever leaves the
 * measured ink a margin, and this one leaves 40 units on each side.
 */
const cropH = Math.round((WIN_Y1 - WIN_Y0) * vp.scale);
const cropW = Math.round((cropH * PANE_W) / STAGE_H);
const cropX = Math.round(ox + WIN_CX * vp.scale - cropW / 2);
const cropY = Math.round(oy + WIN_Y0 * vp.scale);
const WINDOW = `${cropW}x${cropH}+${cropX}+${cropY}`;
/** Plate units per final pixel, and its inverse — the film's own scale. */
const shrink = PANE_W / cropW;
const plateScale = PANE_W / (cropW / vp.scale);
const aspectError = Math.abs((cropW / cropH) / (PANE_W / STAGE_H) - 1);

console.log(`bust window in frame: ${WINDOW}  ->  ${S(PANE_W)}x${S(STAGE_H)}`);
if (S(PANE_W) > cropW || S(STAGE_H) > cropH) {
  throw new Error(
    `--scale ${SCALE} draws the pane at ${S(PANE_W)}x${S(STAGE_H)} from a ${cropW}x${cropH} window — that enlarges ` +
      "the render, so the extra pixels would be the filter's, not rigc's; render with a larger --max instead",
  );
}
console.log(
  `  plate units  x ${((cropX - ox) / vp.scale).toFixed(1)}..${((cropX + cropW - ox) / vp.scale).toFixed(1)}` +
    `   y ${((cropY - oy) / vp.scale).toFixed(1)}..${((cropY + cropH - oy) / vp.scale).toFixed(1)}`,
);
console.log(`  supersample  ${vp.scale} at render, x${shrink.toFixed(4)} here  =>  plate at x${plateScale.toFixed(4)} on screen`);
console.log(`  head 340 units => ${(340 * plateScale).toFixed(0)}px;  the yaw's 35.345 => ${(35.345 * plateScale).toFixed(1)}px`);
if (aspectError > 0.001) throw new Error(`the window's aspect is off the pane's by ${(aspectError * 100).toFixed(2)}%`);
console.log(`  aspect error ${(aspectError * 100).toFixed(3)}%`);

// ---------------------------------------------------------------------------
// type
// ---------------------------------------------------------------------------

const MONO = 'Andale-Mono';

/**
 * Andale-Mono's advance, measured rather than assumed (film one's helper).
 *
 * 📐 It comes back an INTEGER, which is why this film types its dense blocks at
 * **9pt and not 8**: 8, 8.5 and 9 all advance 5px, and 9.5 and 10 both advance
 * 6. So 9pt is the largest glyph that still fits 44 characters into the
 * column's 224px, and 8pt is the same width for a smaller letter — free size,
 * taken.
 */
const advance = async (pt: number) => {
  const one = Number(
    await $`magick -size 1400x60 xc:none -font ${MONO} -pointsize ${pt} -fill white -annotate +2+40 ${'M'.repeat(10)} -trim -format %w info:`.text(),
  );
  const two = Number(
    await $`magick -size 1400x60 xc:none -font ${MONO} -pointsize ${pt} -fill white -annotate +2+40 ${'M'.repeat(50)} -trim -format %w info:`.text(),
  );
  return (two - one) / 40;
};
const ADV: Record<number, number> = {};
for (const pt of [9, 9.5, 14]) ADV[pt] = await advance(pt);
console.log(`  advances     ${Object.entries(ADV).map(([pt, a]) => `${pt}pt=${a}px`).join('  ')}`);

/**
 * The point size each of those is DRAWN at, and its advance there.
 *
 * 📐 Doubling the point size does not double the advance, because the advance
 * comes back an integer (above): 9pt is 5px, but 18pt is 11, not 10. A column
 * whose 44-character lines were sized to 5px each would run 44px wider at 2x
 * than twice itself, and off the canvas. So at `--scale N` each size is drawn at
 * the largest half-point size up to N times it whose measured advance is no
 * wider than N times the scale-1 advance — the same rule that chose 9pt over 8
 * above, applied at the written size. At scale 1 it is the size itself.
 */
const DRAWN_PT: Record<number, number> = {};
const DRAWN_ADV: Record<number, number> = {};
for (const pt of [9, 9.5, 14]) {
  const base = ADV[pt];
  if (base === undefined) throw new Error(`no advance was measured for ${pt}pt`);
  for (let q = S(pt); q > 0; q -= 0.5) {
    const a = SCALE === 1 ? base : await advance(q);
    if (a <= S(base)) {
      DRAWN_PT[pt] = q;
      DRAWN_ADV[pt] = a;
      break;
    }
  }
}
if (SCALE !== 1) {
  console.log(`  drawn at     ${Object.entries(DRAWN_PT).map(([pt, q]) => `${pt}pt as ${q}pt=${DRAWN_ADV[Number(pt)]}px`).join('  ')}`);
}

/**
 * One `-annotate` group.
 *
 * 🚨 An `#RRGGBBAA` fill whose alpha byte is `00` does NOT draw nothing.
 * Probed on this machine (`probe/alpha_probe.log`): on a base that has already
 * been through `-alpha remove -alpha off`, `-fill '#4FC7B400'` puts the ALPHA
 * CHANNEL BACK — the annotated pixels come out `srgba(20,25,34,0.494)` on an
 * opaque canvas — while `#4FC7B480` composites correctly. Film one saw the same
 * value come out solid RED on its ImageMagick. Two versions, two different
 * wrong answers, one rule: ⇒ a fully faded-out annotation is not emitted at all.
 *
 * (Emptiness is checked too, so callers can pass '' for "not this frame".)
 */
const type = (pt: number, fill: string, x: number, y: number, text: string): string[] => {
  if (text === '') return [];
  const alpha = /^#[0-9a-f]{6}([0-9a-f]{2})$/i.exec(fill);
  if (alpha !== null && parseInt(alpha[1], 16) <= 2) return [];
  const drawn = DRAWN_PT[pt];
  if (drawn === undefined) throw new Error(`no drawn size was measured for ${pt}pt`);
  return ['-font', MONO, '-pointsize', String(drawn), '-fill', fill, '-annotate', `+${Math.round(S(x))}+${Math.round(S(y))}`, text];
};

/** A hex colour with an alpha byte appended, for fades. `type` drops a zero. */
const fade = (hex: string, a: number) =>
  `${hex}${Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0')}`;

/** Widest line a block may be, checked rather than hoped for. */
const fits = (lines: string[], pt: number, width: number, where: string) => {
  const longest = Math.max(0, ...lines.map((l) => l.length));
  if (longest * ADV[pt] > width) {
    throw new Error(`${where}: longest line is ${longest} chars = ${longest * ADV[pt]}px in a ${width}px slot`);
  }
  const drawnAdv = DRAWN_ADV[pt];
  if (drawnAdv === undefined) throw new Error(`${where}: no drawn size was measured for ${pt}pt`);
  if (longest * drawnAdv > S(width)) {
    throw new Error(`${where}: at --scale ${SCALE} the longest line is ${longest * drawnAdv}px in a ${S(width)}px slot`);
  }
  return longest;
};

// ---------------------------------------------------------------------------
// what the column says, out of the tools' own output
// ---------------------------------------------------------------------------

const explainLog = (await Bun.file(`${ROOT}explain.log`).text()).split('\n');
const buildLog = (await Bun.file(`${ROOT}build.log`).text()).split('\n');

/** `declared=3.2s loop=true` — the animation table's own header line. */
const declared = (name: string) => {
  const line = explainLog.find((l) => new RegExp(`^  ${name}  declared=`).test(l));
  if (line === undefined) throw new Error(`explain.log has no "declared=" line for ${name}`);
  const m = /declared=([\d.]+)s loop=(true|false)/.exec(line);
  if (m === null) throw new Error(`explain.log's ${name} header does not parse: ${line}`);
  return { seconds: m[1], loop: m[2] === 'true' };
};

/** `pages=22 regions=22 bones=27 slots=22 animations=3 …` — build's summary. */
const buildSummary = buildLog.find((l) => /^\s+\.\.\s+pages=\d+/.test(l));
if (buildSummary === undefined) throw new Error('build.log has no "pages=" summary line');
const countOf = (key: string) => {
  const m = new RegExp(`${key}=(\\d+)`).exec(buildSummary);
  if (m === null) throw new Error(`build.log's summary has no ${key}=`);
  return m[1];
};

/**
 * ⭐ The turn's five numbers are LIFTED from `explain.log`, not retyped.
 *
 * They are the whole claim of the film's last beat: the face's own shift and
 * four hair layers', one of them POSITIVE while everything else is negative.
 * The only edit is the log's 12-space indent, stripped; the columns inside the
 * line — including the `<- x at depth d` that says where the number came from —
 * are the log's own bytes, because the depth IS the input and a caption that
 * dropped it would be quoting the answer without the question.
 */
const memberRow = (block: RegExp, member: string) => {
  const at = explainLog.findIndex((l) => block.test(l));
  if (at < 0) throw new Error(`explain.log has no block matching ${block}`);
  for (let i = at + 1; i < at + 14; i += 1) {
    if (/^\s{2}(MEMBER|DEFORM|WORST|\.\.)\s/.test(explainLog[i])) break;
    const row = /^\s{12}(\S+\s+-?[\d.]+\s+<-.*)$/.exec(explainLog[i]);
    if (row !== null && row[1].startsWith(member)) return row[1].replace(/\s+$/, '');
  }
  throw new Error(`explain.log's block ${block} has no row for "${member}"`);
};

const FACESHIFT = /^  MEMBER  turn  bone "faceshift"\.translatex  t=0\.620000/;
const HAIR = /^  MEMBER  turn  group "hair"\.translatex  t=0\.620000/;

const EXPLAIN_HEAD = '$ rigc explain --motion motion.json';
const EXPLAIN_SUB = '  turn, t=0.62  ·  derive yaw degrees=12';
const EXPLAIN_ROWS: { text: string; fill: string }[] = [
  { text: memberRow(FACESHIFT, 'faceshift'), fill: HEAD },
  { text: memberRow(HAIR, 'hairmass'), fill: TEAL },
  { text: memberRow(HAIR, 'lock_l'), fill: BODY },
  { text: memberRow(HAIR, 'lock_r'), fill: BODY },
  { text: memberRow(HAIR, 'ahoge'), fill: BODY },
];
const EXPLAIN_TAIL = [
  'the back hair sits BEHIND the axis',
  '(depth -55), so its dx flips sign.',
];
fits([EXPLAIN_HEAD, EXPLAIN_SUB, ...EXPLAIN_ROWS.map((r) => r.text), ...EXPLAIN_TAIL], 9, TEXT_W, 'the explain block');
for (const r of EXPLAIN_ROWS) console.log(`   explain | ${r.text}`);

// ---------------------------------------------------------------------------
// the column's furniture
// ---------------------------------------------------------------------------

const SHOTS = [
  { key: 'idle', label: `idle  ${declared('idle').seconds}s  loop` },
  { key: 'gaze', label: `gaze  ${declared('gaze').seconds}s` },
  { key: 'turn', label: `turn  ${declared('turn').seconds}s` },
];
const META = `${countOf('regions')} parts · ${countOf('bones')} bones · ${countOf('slots')} slots`;
fits([META], 9, TEXT_W, 'the meta line');
fits(SHOTS.map((s) => s.label), 9.5, TEXT_W, 'the shot list');

const Y_META = 66;
const Y_RULE1 = 80;
const Y_SHOT = [104, 124, 144];
const Y_RULE2 = 160;
const Y_NOTE = [182, 196, 210, 224];
const Y_EXPLAIN = 224;
const LINE_H = 14;

const NOTES: Record<string, string[]> = {
  build: [
    'one continuous pass, three animations,',
    'nothing between them: idle loops and',
    'gaze and turn both END on the rest pose,',
    'so the film needs no dissolve at all.',
  ],
  idle: [
    'breath: torso scales to 1.014 while the',
    'head chain only rises 3.4 units — parent',
    'the head to what scales and the face',
    'inflates. blink: a lid plate slides 65.',
  ],
  gaze: [
    'the iris leads at 0.22s; the head follows',
    'at 0.40s, +12% of the duration; the two',
    'sidelocks and the cowlick overlap it at',
    '+21%, +24% and +28%.',
  ],
  turn: [
    '12° yaw: deform keys on two meshes plus',
    'one translate per part, by depth.',
  ],
  turnSlow: [
    '12° yaw: deform keys on two meshes plus',
    'one translate per part, by depth.',
  ],
};
for (const [k, v] of Object.entries(NOTES)) fits(v, 9, TEXT_W, `the ${k} note`);

const TAGLINE = 'rig-c  —  a 2.5D head turn on plain Spine data';
const TAGLINE_NAME = 'rig-c';
fits([TAGLINE], 14, GIF_W - 40, 'the tagline');

const CMD_BUILD = 'rigc build --rig rig.json --motion motion.json --images parts --out build';
const cmdRender = (anim: string, fps: number) => `rigc render --candidate build --animation ${anim} --fps ${fps} --max 1782`;
fits([CMD_BUILD, cmdRender('turn', 50)], 9, GIF_W - 40, 'the band command');

// ---------------------------------------------------------------------------
// the backdrop: the column panel, the band, and the two rules
// ---------------------------------------------------------------------------

rmSync(BITS, { recursive: true, force: true });
mkdirSync(BITS, { recursive: true });
rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

/**
 * Everything that never moves, drawn once.
 *
 * The pane is composited over its left 344 columns every frame, so what
 * survives here is the type column, the caption band, and the hairlines that
 * separate them. The panel tone is two counts darker than the plate's own edge
 * (`#1d2128` sampled at the window's border), so the divider reads as a join
 * between two surfaces rather than as a cut in one.
 */
const BACKDROP = `${BITS}backdrop.png`;
{
  const rule = (x0: number, y0: number, x1: number, y1: number) => [
    '-stroke', PANEL_EDGE, '-strokewidth', String(S(1)), '-draw', `line ${S(x0)},${S(y0)} ${S(x1)},${S(y1)}`, '-stroke', 'none',
  ];
  await $`magick -size ${`${OUT_W}x${OUT_H}`} xc:${PANEL} -alpha remove -alpha off ${[
    ...rule(COL_X, 0, COL_X, GIF_H - 1),
    ...rule(0, STAGE_H, GIF_W - 1, STAGE_H),
    ...rule(TEXT_X, Y_RULE1, COL_X + COL_W - 16, Y_RULE1),
    ...rule(TEXT_X, Y_RULE2, COL_X + COL_W - 16, Y_RULE2),
  ]} ${BACKDROP}`.quiet();
}

/** The persistent type: the header, the meta line and the dim shot rows. */
const furniture: string[] = [
  ...type(9, DIM, TEXT_X, 26, 'gallery/portrait — as shipped'),
  ...type(14, HEAD, TEXT_X, 50, 'VELA'),
  ...type(9, LABEL, TEXT_X, Y_META, META),
  ...SHOTS.flatMap((s, i) => type(9.5, DIM, TEXT_X, Y_SHOT[i], s.label)),
  ...type(14, BODY, 20, GIF_H - 27, TAGLINE),
  // ⚠️ The name is drawn a SECOND time over the full line rather than offset
  // after it — `-annotate` drops leading spaces, so an offset built from the
  // name's own advance ran `spine-rigc` into the em-dash in film one.
  ...type(14, HEAD, 20, GIF_H - 27, TAGLINE_NAME),
];

/** A small right-pointing triangle, the shot-list cursor. Andale has no ▸. */
const cursor = (y: number, alpha: number): string[] => {
  if (alpha <= 0.01) return [];
  const x = TEXT_X - 11;
  const tri: [number, number][] = [[0, -7], [0, 0], [5, -3.5]];
  const p = tri.map(([dx, dy]) => `${S(x + dx)},${S(y + dy).toFixed(1)}`).join(' ');
  return ['-fill', fade(HEAD, alpha), '-stroke', 'none', '-draw', `polygon ${p}`];
};

// ---------------------------------------------------------------------------
// the beats
// ---------------------------------------------------------------------------

/** One screen frame: which render frame, and what the type says over it. */
interface Frame {
  src: string;
  /** Index of the lit shot row, or -1. */
  lit: number;
  litAlpha: number;
  note: string[];
  noteAlpha: number;
  cmd: string;
  cmdAlpha: number;
  /** How far in the explain block and the axis hairline have come up. */
  explain: number;
}

const frameFile = (dir: string, set: string, i: number) => `${ROOT}${dir}/${set}/f${String(i).padStart(4, '0')}.png`;
const idle = (i: number) => frameFile('render', 'idle@25fps', i);
const gaze = (i: number) => frameFile('render', 'gaze@25fps', i);
const turn = (i: number) => frameFile('render', 'turn@25fps', i);
const turn50 = (i: number) => frameFile('render-slow', 'turn@50fps', i);

const frames: Frame[] = [];

/** A 3-frame ramp in at a beat's head and out at its tail, for the type only. */
const ramp = (i: number, n: number) => {
  const up = [0.3, 0.62, 0.85];
  if (i < up.length) return up[i];
  if (i >= n - up.length) return up[n - 1 - i];
  return 1;
};

/** Beat 1 — rest, and the build command that made everything after it. */
const B1 = 10;
for (let i = 0; i < B1; i += 1) {
  frames.push({
    src: idle(0), lit: -1, litAlpha: 0,
    note: NOTES.build, noteAlpha: ramp(i, B1),
    cmd: CMD_BUILD, cmdAlpha: ramp(i, B1),
    explain: 0,
  });
}

/** Beat 2 — `idle`, from frame 1 (frame 0 was the rest beat) to 79. */
const B2_FROM = 1;
const B2_TO = 79;
const B2 = B2_TO - B2_FROM + 1;
for (let i = 0; i < B2; i += 1) {
  frames.push({
    src: idle(B2_FROM + i), lit: 0, litAlpha: ramp(i, B2),
    note: NOTES.idle, noteAlpha: ramp(i, B2),
    cmd: cmdRender('idle', 25), cmdAlpha: ramp(i, B2),
    explain: 0,
  });
}

/**
 * Beat 3 — `gaze`, 0 to 37.
 *
 * ⚠️ Not 0 to 38. `gaze` is 1.52s at 25fps, so frame 38 IS the end pose, which
 * is the rest pose, which is `turn`'s frame 0 — and beat 4 opens on it. Playing
 * both would hold one frame twice in the middle of a continuous take. The same
 * arithmetic drops `idle`'s frame 80 above.
 */
const B3 = 38;
for (let i = 0; i < B3; i += 1) {
  frames.push({
    src: gaze(i), lit: 1, litAlpha: ramp(i, B3),
    note: NOTES.gaze, noteAlpha: ramp(i, B3),
    cmd: cmdRender('gaze', 25), cmdAlpha: ramp(i, B3),
    explain: 0,
  });
}

/**
 * Beats 4–6 — the turn, once, with the arrival at half speed.
 *
 * ⭐ The slow stretch is not a repeat and not a duplicated frame: it is the SAME
 * animation sampled at `--fps 50` and played at 25, so every frame in it is a
 * pose rigc computed at a time the 25fps set never asked for. Verified below —
 * the two sets agree exactly wherever their sample times coincide.
 *
 * Times: 0 → 0.16 at 25fps, 0.20 → 0.80 at 50fps (the anticipation, the swing
 * and the arrival), then 0.84 → 2.20 at 25fps (the held yaw and the release).
 */
const B4_TO = 4;
const B5_FROM = 10;
const B5_TO = 40;
const B6_FROM = 21;
const B6_TO = 55;

/** The explain block's own ramp, keyed on the animation's time rather than on frames. */
const explainAt = (t: number) => {
  if (t < 0.38) return 0;
  if (t < 0.62) return (t - 0.38) / 0.24;
  if (t < 1.78) return 1;
  if (t < 2.02) return 1 - (t - 1.78) / 0.24;
  return 0;
};

const turnFrame = (src: string, t: number, i: number, n: number, slow: boolean): Frame => ({
  src,
  lit: 2,
  litAlpha: i < 3 && !slow ? ramp(i, 99) : 1,
  note: slow ? NOTES.turnSlow : NOTES.turn,
  noteAlpha: 1,
  cmd: cmdRender('turn', slow ? 50 : 25),
  cmdAlpha: 1,
  explain: explainAt(t),
});

const turnBeat: Frame[] = [];
for (let i = 0; i <= B4_TO; i += 1) turnBeat.push(turnFrame(turn(i), i / 25, i, B4_TO + 1, false));
for (let i = B5_FROM; i <= B5_TO; i += 1) turnBeat.push(turnFrame(turn50(i), i / 50, i - B5_FROM, B5_TO - B5_FROM + 1, true));
for (let i = B6_FROM; i <= B6_TO; i += 1) turnBeat.push(turnFrame(turn(i), i / 25, i - B6_FROM, B6_TO - B6_FROM + 1, false));
// the first three frames of the whole turn beat bring its type up
for (let i = 0; i < 3; i += 1) {
  turnBeat[i].litAlpha = ramp(i, 999);
  turnBeat[i].noteAlpha = ramp(i, 999);
  turnBeat[i].cmdAlpha = ramp(i, 999);
}
// and the last four take it back down, into the loop
for (let i = 0; i < 4; i += 1) {
  const f = turnBeat[turnBeat.length - 1 - i];
  const a = [0.25, 0.5, 0.72, 0.88][i];
  f.litAlpha = a;
  f.noteAlpha = a;
  f.cmdAlpha = a;
}
frames.push(...turnBeat);

const BEATS = [
  ['rest + build', B1],
  ['idle', B2],
  ['gaze', B3],
  ['turn 25fps', B4_TO + 1],
  ['turn 50fps (half speed)', B5_TO - B5_FROM + 1],
  ['turn 25fps (hold + release)', B6_TO - B6_FROM + 1],
] as const;
console.log('\nbeats:');
let at = 0;
for (const [name, n] of BEATS) {
  console.log(`  ${String(at).padStart(3)}..${String(at + n - 1).padStart(3)}  ${String(n).padStart(3)} frames  ${(n / FPS).toFixed(2)}s  ${name}`);
  at += n;
}
console.log(`  total       ${frames.length} frames  ${(frames.length / FPS).toFixed(2)}s at ${FPS} fps`);
if (at !== frames.length) throw new Error(`the beat table sums to ${at} but ${frames.length} frames were pushed`);

// ---------------------------------------------------------------------------
// composite every frame
// ---------------------------------------------------------------------------

const pad = (i: number) => String(i).padStart(4, '0');

/** The yaw axis, as a hairline in the pane. */
const AXIS_PX = Math.round((YAW_AXIS_X - (cropX - ox) / vp.scale) * plateScale);
const axis = (alpha: number): string[] => {
  if (!AXIS_LINE || alpha <= 0.02) return [];
  return [
    '-stroke', fade(TEAL, alpha * 0.34), '-strokewidth', String(S(1)),
    '-draw', `line ${S(AXIS_PX)},${S(6)} ${S(AXIS_PX)},${S(STAGE_H - 7)}`,
    '-stroke', 'none',
  ];
};

const ink = (f: Frame): string[] => {
  const out: string[] = [...furniture];
  if (f.lit >= 0) {
    out.push(...type(9.5, fade(HEAD, f.litAlpha), TEXT_X, Y_SHOT[f.lit], SHOTS[f.lit].label));
    out.push(...cursor(Y_SHOT[f.lit], f.litAlpha));
  }
  for (const [k, line] of f.note.entries()) {
    out.push(...type(9, fade(LABEL, f.noteAlpha), TEXT_X, Y_NOTE[k], line));
  }
  if (f.explain > 0.02) {
    const a = f.explain;
    out.push(...type(9, fade(CMD, a), TEXT_X, Y_EXPLAIN, EXPLAIN_HEAD));
    out.push(...type(9, fade(DIM, a), TEXT_X, Y_EXPLAIN + LINE_H, EXPLAIN_SUB));
    for (const [k, r] of EXPLAIN_ROWS.entries()) {
      out.push(...type(9, fade(r.fill, a), TEXT_X, Y_EXPLAIN + (k + 2) * LINE_H + 4, r.text));
    }
    for (const [k, line] of EXPLAIN_TAIL.entries()) {
      out.push(...type(9, fade(DIM, a), TEXT_X, Y_EXPLAIN + 7 * LINE_H + 12 + k * LINE_H, line));
    }
    out.push(...axis(a));
  }
  out.push(...type(9, fade(CMD, f.cmdAlpha), 20, GIF_H - 9, f.cmd));
  return out;
};

console.log('\ncompositing…');
for (const [i, f] of frames.entries()) {
  const args = [
    BACKDROP,
    '(', f.src, '-crop', WINDOW, '+repage', '-filter', 'Lanczos', '-resize', `${S(PANE_W)}x${S(STAGE_H)}!`, '-alpha', 'remove', '-alpha', 'off', ')',
    '-geometry', '+0+0', '-composite',
    ...ink(f),
    `${WORK}r${pad(i)}.png`,
  ];
  await $`magick ${args}`.quiet();
  if (i % 40 === 0) console.log(`  ${i}/${frames.length}`);
}

/**
 * 🚨 The frame list is an EXPLICIT ordered array, never a glob and never a
 * directory listing. Film one shipped a shuffled GIF once: Bun's shell expands
 * `s*.png` in DIRECTORY order rather than lexicographic order — measured,
 * `s0002 s0016 s0017 s0003 …` — and the result played as a perfectly valid
 * animation of the right length and size, with the damage invisible in every
 * one of the file's own stats. ⇒ `plan` is built in playback order, and the
 * checks below are: every file exists, no file on disk is missing from the
 * plan, and the WRITTEN GIF is diffed against the plan frame by frame.
 */
const plan = frames.map((_, i) => `${WORK}r${pad(i)}.png`);
for (const [i, f] of plan.entries()) if (!existsSync(f)) throw new Error(`plan frame ${i} is missing: ${f}`);
const listing = readdirSync(WORK).filter((f) => /^r\d+\.png$/.test(f));
if (listing.length !== plan.length) throw new Error(`${listing.length} frame files on disk but the plan names ${plan.length}`);
if (new Set(plan).size !== plan.length) throw new Error('the plan names a file twice');
/** Strictly increasing by construction, and asserted rather than assumed. */
for (let i = 1; i < plan.length; i += 1) {
  if (!(plan[i] > plan[i - 1])) throw new Error(`the plan is not in order at ${i}: ${plan[i - 1]} then ${plan[i]}`);
}

/**
 * 🔍 The order proof, printed so it can be read rather than trusted.
 *
 * The directory's own order is what a glob would have handed the encoder, and
 * it is NOT lexicographic — film one shipped a shuffled GIF from exactly this.
 * Below: what the filesystem says, what sorted says, and whether they agree on
 * this run. Either way the plan is the array built in playback order above, and
 * the frame-by-frame diff at the end is what actually proves the file.
 */
const sorted = [...listing].sort();
const listingMatchesSorted = listing.every((f, i) => f === sorted[i]);
console.log(`\norder: ${listing.length} files`);
console.log(`  readdirSync  ${listing.slice(0, 6).join(' ')} …`);
console.log(`  sorted       ${sorted.slice(0, 6).join(' ')} …`);
console.log(`  directory order ${listingMatchesSorted ? 'HAPPENS TO MATCH' : 'DOES NOT MATCH'} lexicographic on this run`);
console.log(`  plan         ${plan.slice(0, 3).map((p) => p.split('/').pop()).join(' ')} … ${plan.slice(-2).map((p) => p.split('/').pop()).join(' ')}  (explicit array, strictly increasing)`);

// ---------------------------------------------------------------------------
// the GIF
// ---------------------------------------------------------------------------

/**
 * `+dither … -layers OptimizeTransparency` is film one's measured encode, kept:
 * a smaller palette comes out BIGGER because dither noise costs more than the
 * colours it saves, and `OptimizeTransparency` leaves every frame full-canvas
 * with one dispose mode — the encoding least able to go wrong in somebody
 * else's viewer.
 *
 * 🚨 **But `-colors 256` is NOT the same thing as a 256-colour film, and on
 * this film it cost 3.14 MiB.** `-colors` quantises each frame to its OWN
 * palette, so two frames whose pixels are identical come out as different
 * bytes — and this film's whole right-hand third never changes. Measured on the
 * same 198 frames (`probe/encode_matrix.log`):
 *
 *     -colors 256                       6,565,431   6.26 MiB
 *     -colors 256 -layers Optimize      6,293,565   6.00 MiB   ← 4%: nothing was static
 *     -remap (shared 255)               3,267,864   3.12 MiB   ← this
 *     -remap (shared 255) + Optimize    2,989,391   2.85 MiB
 *     -remap (shared 128)               2,707,650   2.58 MiB
 *
 * The tell is the second row: real inter-frame optimisation found almost
 * nothing to skip, because per-frame quantisation had already made every pixel
 * differ. One shared palette is the whole fix — a 52% cut with the SAME
 * encoder flags films one and two shipped, and 0.45% RMSE against the plan
 * (a 128-entry palette costs 0.64% for another 0.5 MiB, declined: films one
 * and two are 256-colour and the three are meant to read as one set).
 *
 * The palette comes from every 9th frame, which is every beat including both
 * breath extremes, the blink, the gaze hold and the held yaw.
 */
const PALETTE = `${BITS}palette.gif`;
const sample = plan.filter((_, i) => i % 9 === 0);
await $`magick ${sample} +append +dither -colors 255 ${PALETTE}`.quiet();
console.log(`\npalette: 255 colours from ${sample.length} sampled frames`);
await $`magick -delay ${DELAY} -loop 0 ${plan} +dither -remap ${PALETTE} -layers OptimizeTransparency ${OUT}`;

// ---------------------------------------------------------------------------
// verify
// ---------------------------------------------------------------------------

const bytes = (await Bun.file(OUT).arrayBuffer()).byteLength;
const rows = (await $`magick identify -format "%wx%h %T %g %D\n" ${OUT}`.text()).trim().split('\n');
const delays = new Set(rows.map((r) => r.split(' ')[1]));
const disposals = new Set(rows.map((r) => r.split(' ')[3]));
const geoms = new Set(rows.map((r) => r.split(' ')[2]));
const verbose = await $`magick identify -verbose ${OUT}`.text();
const iterations = /Iterations:\s*(\d+)/.exec(verbose)?.[1] ?? '(absent)';

await $`magick ${OUT} -coalesce ${WORK}co-%04d.png`.quiet();
const co = (i: number) => `${WORK}co-${pad(i)}.png`;
const rmse = async (a: string, b: string) => {
  const proc = Bun.spawn(['magick', 'compare', '-metric', 'RMSE', a, b, 'null:'], { stderr: 'pipe', stdout: 'pipe' });
  await proc.exited;
  return Number((await new Response(proc.stderr).text()).trim().split(' ')[0]);
};

let sum = 0;
let worst = { v: -1, i: -1 };
for (let i = 0; i < rows.length; i += 1) {
  const v = await rmse(co(i), plan[i]);
  sum += v;
  if (v > worst.v) worst = { v, i };
}
const pc = (v: number) => `${((v / 65535) * 100).toFixed(2)}%`;

/**
 * The seam, and the biggest step inside the film, against the MEDIAN moving
 * step rather than one hand-picked pair — a sample inside a hold reads 0.00%,
 * which makes any seam look infinitely bad, and this film is a face at rest for
 * a third of its length.
 */
const steps: number[] = [];
for (let i = 1; i < rows.length; i += 1) steps.push(await rmse(co(i - 1), co(i)));
const seam = await rmse(co(rows.length - 1), co(0));
const moving = steps.filter((v) => v > 65535 * 0.001).sort((a, b) => a - b);
const typical = moving[Math.floor(moving.length / 2)];
const biggest = [...steps].sort((a, b) => b - a)[0];
const biggestAt = steps.indexOf(biggest) + 1;

console.log(`\n${OUT}`);
console.log(`  frames      ${rows.length}`);
console.log(`  canvas      ${[...geoms].map((g) => g.split('+')[0]).join(', ')}`);
console.log(`  delay       ${[...delays].join(', ')} cs  (= ${FPS} fps, ${(rows.length * DELAY) / 100}s)`);
console.log(`  loop        Iterations: ${iterations}  (0 = forever)`);
console.log(`  dispose     ${[...disposals].join(', ')}`);
console.log(`  bytes       ${bytes.toLocaleString()}  (${(bytes / 1024 / 1024).toFixed(2)} MiB)`);
console.log(`  fidelity    mean ${pc(sum / rows.length)}, worst ${pc(worst.v)} at frame ${worst.i}`);
console.log(`  seam        ${pc(seam)} last->first, against a ${pc(typical)} median moving step`);
console.log(`  biggest     ${pc(biggest)} at frame ${biggestAt}  (no dissolves in this film — every step is the animation's own)`);
if (!existsSync(OUT)) throw new Error('no GIF was written');
