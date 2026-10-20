/**
 * Cuts the second film: two pictures in → the motion between them → you choose.
 *
 * Nothing here authors any movement. What it does is (1) crop rigc's frames
 * back to the stage plate using the viewport rigc itself wrote into
 * `frames.json` rather than a second copy of the arithmetic, (2) downsample the
 * 2x supersample once, (3) lay out the five shots, and (4) splice them into one
 * loop. Every number it prints on screen was printed first by a tool — the pose
 * report in shot 2 comes out of `pose/poseB.log`, and the ballot in shot 4 is a
 * screenshot of the real page with the ledger's own winner line under it.
 *
 * The crop arithmetic is film one's, unchanged, and it transfers exactly because
 * the plate pins rigc's framing box: `check_framing.ts` verifies that all three
 * builds come out with the same viewport as each other, and it is the same
 * viewport film one had (x −51.2, 1382.4 wide, scale 0.9375) — so the plate is
 * 1200x810 in the frame and the downsample to 600 is exactly 0.5.
 *
 * `--scale N` writes the same film at N times the size (issue #1503). Every
 * layout number below stays in the 600 px picture's own pixels; only the
 * drawing — each resize, type size, position, stroke and border — is multiplied
 * at the point it is handed to ImageMagick, so the larger file is the same
 * picture with more pixels in it rather than a second layout.
 */
import { mkdirSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { $ } from 'bun';
import { PLATE_W, PLATE_H, BAND_H, TEAL } from '../art/layout';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const WORK = `${ROOT}gif/frames/`;
const BITS = `${ROOT}gif/bits/`;

/**
 * The output scale, read off `--scale` (default 1). The ceiling is not typed
 * here: a scale whose plate resize would ENLARGE the crop is refused once the
 * crop is known, because those pixels would be the filter's, not rigc's.
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
const OUT = `${ROOT}${SCALE === 1 ? 'rigc-keypose.gif' : `rigc-keypose@${SCALE}x.gif`}`;

/** GIF frame delay in centiseconds. 5 cs is exactly 20 fps — the render rate. */
const DELAY = 5;
/**
 * The long side at scale 1, the unit every layout number below is in. The 2x
 * supersample halves to exactly this; at `--scale 2` the plate is not resized.
 */
const GIF_W = 600;

// ---------------------------------------------------------------------------
// where the stage sits in rigc's frames
// ---------------------------------------------------------------------------

interface Sidecar {
  viewport: { x: number; y: number; width: number; height: number; scale: number };
  sets: { dir: string; animation: string; fps: number; written: number }[];
}

const sidecars: Record<string, Sidecar> = {};
for (const build of ['poses', 'cheer-a', 'cheer-b']) {
  sidecars[build] = await Bun.file(`${ROOT}render-${build}/frames.json`).json();
}
const vp = sidecars['cheer-b'].viewport;
for (const [name, s] of Object.entries(sidecars)) {
  if (JSON.stringify(s.viewport) !== JSON.stringify(vp)) {
    throw new Error(`render-${name} has a different viewport — one crop cannot fit every shot`);
  }
}

/** World → frame pixel, y down, straight out of the sidecar's contract. */
const px = (wx: number) => (wx - vp.x) * vp.scale;
const py = (wy: number) => (vp.y + vp.height - wy) * vp.scale;

const cropX = Math.round(px(0));
const cropY = Math.round(py(PLATE_H));
const cropW = Math.round(px(PLATE_W)) - cropX;
const cropH = Math.round(py(0)) - cropY;
const shrink = GIF_W / cropW;
const GIF_H = Math.round(cropH * shrink);
const PLATE_CROP = `${cropW}x${cropH}+${cropX}+${cropY}`;
/** The written file's size: the scale-1 picture, times the scale. */
const OUT_W = S(GIF_W);
const OUT_H = S(GIF_H);

console.log(`stage in frame: ${PLATE_CROP} -> ${OUT_W}x${OUT_H}`);
if (Math.abs(shrink - 0.5) > 1e-9) console.log(`⚠️  downsample is ${shrink.toFixed(4)}, not the intended 0.5`);
if (OUT_W > cropW || OUT_H > cropH) {
  throw new Error(
    `--scale ${SCALE} writes ${OUT_W}x${OUT_H} from a ${cropW}x${cropH} crop — that enlarges the render, ` +
      "so the extra pixels would be the filter's, not rigc's; render with a larger --max instead",
  );
}

/** The caption band, in final pixels, out of the one place the stage is written. */
const BAND_TOP = GIF_H - Math.round(BAND_H * vp.scale * shrink);

// ---------------------------------------------------------------------------
// type
// ---------------------------------------------------------------------------

const MONO = 'Andale-Mono';
const HEAD = '#f2d49c';
const BODY = '#aeb9c8';
const LABEL = '#93a0b0';
const CMD = '#7b8695';
const DIM = '#5c6672';
const PANEL = '#111620';
const PANEL_EDGE = '#2b3341';
const OK = TEAL;

/** Andale-Mono's advance, measured rather than assumed (film one's helper). */
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
for (const pt of [9.5, 11, 12, 14, 15, 40]) ADV[pt] = await advance(pt);

/** Centre a string of `pt`-point mono on `cx`. */
const centre = (s: string, pt: number, cx: number) => Math.round(cx - (s.length * ADV[pt]) / 2);

/**
 * One `-annotate` group.
 *
 * 🚨 An `#RRGGBBAA` fill whose alpha byte is `00` does NOT draw nothing — it
 * draws RED. Probed directly: `-fill '#4FC7B400'` renders solid red with the
 * alpha channel off AND on, while `#4FC7B480` composites correctly as
 * half-strength teal. So the one value a fade passes through on its way in from
 * invisible is the one value ImageMagick mis-parses, and it shipped: the film's
 * first frame carried a red-grey `?` that was supposed to be absent, and shot
 * five's opening frames carried a stray `candidate B`. ⇒ a fully faded-out
 * annotation is not emitted at all.
 *
 * (Emptiness is checked too, so callers can pass '' for "not this frame".)
 */
const type = (pt: number, fill: string, x: number, y: number, text: string): string[] => {
  if (text === '') return [];
  const alpha = /^#[0-9a-f]{6}([0-9a-f]{2})$/i.exec(fill);
  if (alpha !== null && parseInt(alpha[1], 16) <= 2) return [];
  return ['-font', MONO, '-pointsize', String(S(pt)), '-fill', fill, '-annotate', `+${Math.round(S(x))}+${Math.round(S(y))}`, text];
};

/** A hex colour with an alpha byte appended, for fades. `type` drops a zero. */
const fade = (hex: string, a: number) =>
  `${hex}${Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0')}`;

// ---------------------------------------------------------------------------
// the persistent caption band
// ---------------------------------------------------------------------------

const TAGLINE_NAME = 'rig-c';
const TAGLINE = 'rig-c  —  two pictures in → the motion between them → you choose';

/**
 * The band's second line names the command that made the shot above it, which
 * is the film's own claim to being a proof rather than an advert: every one of
 * these was run, in this order, and the numbers on screen came back from it.
 */
const bandArgs = (command: string): string[] => [
  // ⚠️ The name is drawn a SECOND time over the full line rather than offset
  // after it — `-annotate` drops leading spaces, so an offset built from the
  // name's own advance ran `spine-rigc` into the em-dash in film one.
  ...type(14, BODY, 24, GIF_H - 33, TAGLINE),
  ...type(14, HEAD, 24, GIF_H - 33, TAGLINE_NAME),
  ...type(9.5, CMD, 24, GIF_H - 13, command),
];

// ---------------------------------------------------------------------------
// the pieces every shot draws on
// ---------------------------------------------------------------------------

rmSync(BITS, { recursive: true, force: true });
mkdirSync(BITS, { recursive: true });
rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

/**
 * The backdrop: the stage plate and nothing on it.
 *
 * Taken from `art/parts/plate.png` directly rather than from a rendered frame,
 * because no render has the figure absent — and it lands on the same pixels
 * either way: the plate is 1280 wide, the frame puts it at 0.9375 and the film
 * halves that, so 0.46875 of the plate's own PNG *is* the film's ground.
 */
const BACKDROP = `${BITS}backdrop.png`;
await $`magick ${ROOT}art/parts/plate.png -filter Lanczos -resize ${`${OUT_W}x${OUT_H}!`} -alpha remove -alpha off ${BACKDROP}`.quiet();

/** The figure crop shared by the picture cards and the A/B panes. */
const FIG_CROP = '640x720+391+0';
const FIG_W = 240;
const FIG_H = 270;

/** One figure-sized view of a rigc frame, cropped to the plate then to the figure. */
async function figView(src: string, out: string) {
  await $`magick ${src} -crop ${PLATE_CROP} +repage -crop ${FIG_CROP} +repage -filter Lanczos -resize ${`${S(FIG_W)}x${S(FIG_H)}!`} -alpha remove -alpha off ${out}`.quiet();
}

/** The same, framed in a hairline so it reads as a separate view. */
async function framed(src: string, out: string) {
  await figView(src, `${out}.raw.png`);
  await $`magick ${out}.raw.png -bordercolor ${'#38414f'} -border ${S(1)} ${out}`.quiet();
}

const frameFile = (build: string, anim: string, i: number) =>
  `${ROOT}render-${build}/${anim}@${build === 'poses' ? 20 : 20}fps/f${String(i).padStart(4, '0')}.png`;

// the two picture cards
await framed(`${ROOT}render-poses/poseA@20fps/f0000.png`, `${BITS}cardA.png`);
await framed(`${ROOT}render-poses/poseB@20fps/f0000.png`, `${BITS}cardB.png`);

// the A/B pane views, one per candidate per sampled frame
const N = 12;
for (const c of ['cheer-a', 'cheer-b']) {
  for (let i = 0; i < N; i += 1) {
    await framed(frameFile(c, 'cheer', i), `${BITS}pane-${c}-${String(i).padStart(2, '0')}.png`);
  }
  // the three blend steps that walk a pane back from pose B to pose A, so the
  // comparison can loop without a hard cut from the end pose to the start one.
  const last = `${BITS}pane-${c}-${String(N - 1).padStart(2, '0')}.png`;
  const first = `${BITS}pane-${c}-00.png`;
  for (const [k, mix] of [30, 62, 86].entries()) {
    await $`magick ${last} ${first} -compose blend -define compose:args=${String(mix)} -composite ${BITS}pane-${c}-b${k}.png`.quiet();
  }
}

/** The ballot screenshot, scaled once, plus where its B button landed. */
const SHOT_SCALE = 0.7;
const shotBoxes: { deviceScaleFactor: number; buttons: { choice: string; x: number; y: number; w: number; h: number }[] } =
  await Bun.file(`${ROOT}vote/ballot-winner-row.boxes.json`).json();
const shotSize = (await $`magick identify -format "%w %h" ${ROOT}vote/ballot-winner-row.png`.text()).split(' ').map(Number);
const SHOT_W = Math.round(shotSize[0] * SHOT_SCALE);
const SHOT_H = Math.round(shotSize[1] * SHOT_SCALE);
/**
 * Both states of the real page: B unpressed, and B pressed. The film cuts from
 * one to the other on the frame the pointer lands, so the click is a real state
 * change in real screenshots rather than a ring drawn over a button that was
 * already dark.
 */
for (const [k, src] of [['pre', 'ballot-winner-row-pre.png'], ['post', 'ballot-winner-row.png']] as const) {
  await $`magick ${ROOT}vote/${src} -filter Lanczos -resize ${`${S(SHOT_W)}x${S(SHOT_H)}!`} -bordercolor ${'#8c96a4'} -border ${S(1)} ${BITS}ballot-${k}.png`.quiet();
}
const SHOT_X = Math.round((GIF_W - SHOT_W) / 2);
const SHOT_Y = 100;
const bBtn = shotBoxes.buttons.find((b) => b.choice === 'B');
if (bBtn === undefined) throw new Error('the ballot shot has no B button box');
/** The B button, in final film pixels. */
const BBOX = {
  x0: SHOT_X + bBtn.x * SHOT_SCALE,
  y0: SHOT_Y + bBtn.y * SHOT_SCALE,
  x1: SHOT_X + (bBtn.x + bBtn.w) * SHOT_SCALE,
  y1: SHOT_Y + (bBtn.y + bBtn.h) * SHOT_SCALE,
};

/** The terminal panel shot 2 and shot 4 both write into. */
async function panel(out: string, x0: number, y0: number, x1: number, y1: number) {
  const box = `roundrectangle ${S(x0)},${S(y0)} ${S(x1)},${S(y1)} ${S(5)},${S(5)}`;
  await $`magick ${BACKDROP} -fill ${PANEL} -stroke none -draw ${box} -fill none -stroke ${PANEL_EDGE} -strokewidth ${S(1)} -draw ${box} ${out}`.quiet();
}

const P2 = { x0: 26, y0: 40, x1: 574, y1: 300 };
await panel(`${BITS}panel2.png`, P2.x0, P2.y0, P2.x1, P2.y1);

// ---------------------------------------------------------------------------
// what shot 2 shows — read out of the log rather than retyped
// ---------------------------------------------------------------------------

/**
 * ⭐ The pose lines are LIFTED from `pose/poseB.log`, not copied by hand.
 *
 * A number retyped into a caption is a number nobody can check, and this film's
 * whole claim is that its numbers came back from the tools. So the three lines
 * on screen are the log's own bytes, whitespace-squeezed to fit 548 px, and the
 * script fails if the parts it wants are not in there.
 */
const poseLog = (await Bun.file(`${ROOT}pose/poseB.log`).text()).split('\n');

/**
 * One line of the report, with its own column spacing kept.
 *
 * ⚠️ The first cut squeezed the whitespace to be safe about width and lost the
 * alignment that makes a table a table — `rot=   4.4°` collapsed to `rot= 4.4°`
 * and the head's row stopped lining up under the hand's. So: strip the log's
 * two-space indent and the trailing columns the panel has no room for, and
 * touch nothing in between. Anything that does not fit is a layout problem to
 * solve with the panel, not with the numbers.
 */
const reportLine = (needle: string) => {
  const found = poseLog.find((l) => l.includes(needle) && /^\s+(PLACE|\.\.)\s/.test(l));
  if (found === undefined) throw new Error(`pose/poseB.log has no line for "${needle}"`);
  return found
    .replace(/^\s{2}/, '')
    .replace(/\s+residual=.*$/, '')
    .replace(/ · refuse above residual [\d.]+$/, '')
    .replace(/\s+$/, '');
};

/**
 * The tally, counted rather than claimed.
 *
 * The first cut typed "14 parts read", which is true but reads as "14 parts
 * placed" — and four of them were not. §2.2's whole point about `AMBIG` is that
 * an unordered answer is an answer the instrument is telling you not to use, so
 * a caption that hides the count is the one dishonest line the film could have
 * had.
 */
const placed = poseLog.filter((l) => /^\s+PLACE\s/.test(l)).length;
const ambig = poseLog.filter((l) => /^\s+AMBIG\s/.test(l)).length;
const summary = `..     ${placed} placed · ${ambig} ambiguous — the end poses are given, not targets`;

const POSE_LINES: { text: string; fill: string }[] = [
  { text: '$ rigc pose --images parts --frame poseB.png --scale 0.88,1.0', fill: HEAD },
  { text: reportLine('search'), fill: DIM },
  { text: reportLine('arm_b.png'), fill: BODY },
  { text: reportLine('arm_f.png'), fill: BODY },
  { text: reportLine('hand_f.png'), fill: BODY },
  { text: reportLine('head.png'), fill: BODY },
  { text: reportLine('scarf_tail.png'), fill: BODY },
  { text: summary, fill: OK },
];
/**
 * The size each line is set at: 11pt, or — for a line that does not fit the
 * panel at 11 — the smaller of the two sizes this film already uses for type.
 *
 * ⚠️ The comment above says a line that does not fit is a layout problem, not a
 * reason to edit the numbers, and that is what this is. It became one when the
 * film moved to the current `rig-c` (issue #1503): `rigc pose` reworded its
 * `search` line since the version the film was cut on, and at 11pt it ran 58px
 * past the panel and off the frame's right edge. The line is still the log's own
 * bytes; only its point size gives way, and only for a line that needs it.
 */
const PANEL_TEXT_W = P2.x1 - P2.x0 - 32;
const adv = (pt: number) => {
  const a = ADV[pt];
  if (a === undefined) throw new Error(`no advance was measured for ${pt}pt`);
  return a;
};
const fitPt = (text: string) => [11, 9.5].find((pt) => text.length * adv(pt) <= PANEL_TEXT_W);
for (const l of POSE_LINES) {
  const pt = fitPt(l.text);
  if (pt === undefined) {
    console.log(`⚠️  shot 2's line is ${Math.round(l.text.length * adv(9.5))}px at 9.5pt in a ${PANEL_TEXT_W}px panel: ${l.text}`);
  } else if (pt !== 11) {
    console.log(`   shot2 | set at ${pt}pt — ${Math.round(l.text.length * adv(11))}px at 11pt, ${Math.round(l.text.length * adv(pt))}px at ${pt}pt, in a ${PANEL_TEXT_W}px panel`);
  }
}
/** Each line's size, in `POSE_LINES` order. */
const POSE_PT = POSE_LINES.map((l) => fitPt(l.text) ?? 9.5);
for (const l of POSE_LINES) console.log(`   shot2 | ${l.text}`);

// ---------------------------------------------------------------------------
// what shot 4 shows — read out of the ledger run rather than retyped
// ---------------------------------------------------------------------------

const recordLog = await Bun.file(`${ROOT}vote/record.log`).text();
const winnerLine = recordLog.split('\n').find((l) => l.includes('winner '));
if (winnerLine === undefined) throw new Error('vote/record.log has no winner line');
const passes = recordLog.split('\n').filter((l) => /^\s*PASS\s+V\d\d/.test(l));
const ballotId: string = (await Bun.file(`${ROOT}vote/vote-from-browser.json`).json()).ballot;
const shortId = (name: string) => name.split('_')[0];
const first_pass = shortId(passes[0].trim().split(/\s+/)[1]);
const last_pass = shortId(passes[passes.length - 1].trim().split(/\s+/)[1]);
const winnerShort = winnerLine
  .replace(/^\s*\.\.\s*/, '')
  .replace(/(sha256:[0-9a-f]{12})[0-9a-f]+/, '$1…')
  .trim();

const VOTE_LINES: { text: string; fill: string }[] = [
  { text: `$ rigc vote --record vote-${ballotId}.json --ballot ballot.html`, fill: HEAD },
  { text: `  ${first_pass}…${last_pass}   ·   ${passes.length} of ${passes.length} PASS`, fill: LABEL },
  { text: `  ${winnerShort}`, fill: OK },
];
for (const l of VOTE_LINES) console.log(`   shot4 | ${l.text}`);

// ---------------------------------------------------------------------------
// the shot list
// ---------------------------------------------------------------------------

interface Shot {
  /** The base image every layer goes on top of. */
  base: string;
  /** Extra images to composite, as [file, x, y]. */
  put: [string, number, number][];
  /** `-draw` / `-annotate` arguments, in order. */
  ink: string[];
  /** The command line the band shows under this shot. */
  command: string;
}

const shots: Shot[] = [];

/** A mouse pointer, as a polygon, tip at (x, y). */
const pointer = (x: number, y: number): string[] => {
  const p = [
    [0, 0],
    [0, 18],
    [4.4, 13.6],
    [7.4, 20.4],
    [10.6, 19.0],
    [7.6, 12.3],
    [12.6, 12.0],
  ]
    .map(([dx, dy]) => `${S(x + dx).toFixed(1)},${S(y + dy).toFixed(1)}`)
    .join(' ');
  return ['-fill', '#f4f6fa', '-stroke', '#20242c', '-strokewidth', String(S(1.2)), '-draw', `polygon ${p}`, '-stroke', 'none'];
};

/** A ring around a box, inset/outset by `pad`. */
const ring = (b: typeof BBOX, pad: number, w: number, colour: string): string[] => [
  '-fill',
  'none',
  '-stroke',
  colour,
  '-strokewidth',
  String(S(w)),
  '-draw',
  `roundrectangle ${S(b.x0 - pad).toFixed(0)},${S(b.y0 - pad).toFixed(0)} ${S(b.x1 + pad).toFixed(0)},${S(b.y1 + pad).toFixed(0)} ${S(5)},${S(5)}`,
  '-stroke',
  'none',
];

// ── shot 1 — two pictures ─────────────────────────────────────────────────
const S1 = 30;
const CARD_Y = 44;
const CARD_AX = 30;
const CARD_BX = 330;
const CMD1 = 'rigc pose --images parts --frame poseA.png    (and poseB.png)';
for (let i = 0; i < S1; i += 1) {
  // The `?` in the gutter arrives a beat after the pictures, so the shot states
  // the two givens first and the missing thing second.
  const q = Math.max(0, Math.min(1, (i - 8) / 6));
  shots.push({
    base: BACKDROP,
    put: [
      [`${BITS}cardA.png`, CARD_AX - 1, CARD_Y - 1],
      [`${BITS}cardB.png`, CARD_BX - 1, CARD_Y - 1],
    ],
    ink: [
      ...type(11, LABEL, 24, 26, 'you have two pictures of the pose — and nothing in between'),
      ...type(11, BODY, centre('poseA.png', 11, CARD_AX + FIG_W / 2), CARD_Y + FIG_H + 22, 'poseA.png'),
      ...type(11, BODY, centre('poseB.png', 11, CARD_BX + FIG_W / 2), CARD_Y + FIG_H + 22, 'poseB.png'),
      // ⛔ Nothing goes below the filename labels. The band starts at
      // y=348 and the first cut put a subtitle at 360, straight through
      // the tagline — the one collision the layout has room to make.
      ...type(40, fade(OK, q * 0.8), centre('?', 40, 300), CARD_Y + FIG_H / 2 + 14, '?'),
    ],
    command: CMD1,
  });
}

// ── shot 2 — the instrument ───────────────────────────────────────────────
const S2 = 32;
const CMD2 = 'rigc pose --images parts --frame poseB.png --scale 0.88,1.0';
const LINE_Y = 78;
const LINE_H = 26;
for (let i = 0; i < S2; i += 1) {
  // one line every three frames, then hold
  const shown = Math.min(POSE_LINES.length, Math.floor(i / 3) + 1);
  const ink: string[] = [...type(11, LABEL, 24, 26, 'rigc pose reads a picture and reports where each part sits')];
  for (let k = 0; k < shown; k += 1) {
    const l = POSE_LINES[k];
    // the newest line arrives at 60 % and comes up to full on the next frame
    const fresh = k === shown - 1 && i % 3 === 0 ? 0.6 : 1;
    ink.push(...type(POSE_PT[k] ?? 9.5, fade(l.fill, fresh), P2.x0 + 16, LINE_Y + k * LINE_H, l.text));
  }
  ink.push(
    ...type(9.5, DIM, 24, 324, 'these are the run\'s own lines — pose/poseB.log, kept verbatim'),
  );
  shots.push({ base: `${BITS}panel2.png`, put: [], ink, command: CMD2 });
}

// ── shot 3 — two interpretations ──────────────────────────────────────────
const CMD3 = 'rigc build --motion cheer-a.motion.json  ·  --motion cheer-b.motion.json';
const PANE_Y = 70;
/** One cycle of the comparison: the move, a hold on B, a walk back, a hold on A. */
const CYCLE = [
  ...Array.from({ length: N }, (_, i) => String(i).padStart(2, '0')),
  ...Array(7).fill(String(N - 1).padStart(2, '0')),
  'b0',
  'b1',
  'b2',
  '00',
  '00',
];
const CYCLES = 3;
for (let c = 0; c < CYCLES; c += 1) {
  for (const k of CYCLE) {
    shots.push({
      base: BACKDROP,
      put: [
        [`${BITS}pane-cheer-a-${k}.png`, CARD_AX - 1, PANE_Y - 1],
        [`${BITS}pane-cheer-b-${k}.png`, CARD_BX - 1, PANE_Y - 1],
      ],
      ink: [
        ...type(11, LABEL, 24, 26, 'two readings of that same A → B, built and rendered'),
        ...type(15, HEAD, CARD_AX + 2, 50, 'A'),
        ...type(15, HEAD, CARD_BX + 2, 50, 'B'),
        ...type(9.5, LABEL, CARD_AX + 20, 50, 'all together · one curve'),
        ...type(9.5, LABEL, CARD_BX + 20, 50, 'staggered · anticipation · overshoot'),
      ],
      command: CMD3,
    });
  }
}
const S3 = CYCLE.length * CYCLES;

// ── shot 4 — the choice ───────────────────────────────────────────────────
const S4 = 32;
const CMD4 = 'rigc vote --candidate build-cheer-a --candidate build-cheer-b';
const PTR_FROM = [430, 250];
const PTR_TO = [BBOX.x0 + 28, BBOX.y0 + 22];
for (let i = 0; i < S4; i += 1) {
  const t = Math.min(1, i / 11);
  // ease-out on the approach, so the pointer arrives rather than stops
  const e = 1 - (1 - t) ** 3;
  const pxy = [PTR_FROM[0] + (PTR_TO[0] - PTR_FROM[0]) * e, PTR_FROM[1] + (PTR_TO[1] - PTR_FROM[1]) * e];
  const clicked = i >= 12;
  const ink: string[] = [
    ...type(11, LABEL, 24, 26, 'the instruments have run out — a person picks'),
    ...type(9.5, DIM, SHOT_X, SHOT_Y - 14, `ballot ${ballotId}  ·  2 candidates — cheer, looping`),
  ];
  if (clicked) ink.push(...ring(BBOX, i === 12 ? 6 : 4, i === 12 ? 3 : 2, fade(OK, 1)));
  ink.push(...pointer(pxy[0], pxy[1]));
  for (const [k, l] of VOTE_LINES.entries()) {
    const at = 14 + k * 4;
    if (i >= at) ink.push(...type(11, fade(l.fill, i === at ? 0.55 : 1), 46, 200 + k * 24, l.text));
  }
  if (i >= 26) ink.push(...type(9.5, DIM, 46, 296, 'appended line 1 to votes.jsonl — the winner is a digest, not the label'));
  shots.push({
    base: BACKDROP,
    put: [[`${BITS}ballot-${clicked ? 'post' : 'pre'}.png`, SHOT_X - 1, SHOT_Y - 1]],
    ink,
    command: CMD4,
  });
}

// ── shot 5 — the winner, full size ────────────────────────────────────────
const CMD5 = 'rigc render --candidate build-cheer-b --fps 20';
const WIN: number[] = [
  ...Array(6).fill(0),
  ...Array.from({ length: N - 1 }, (_, i) => i + 1),
  ...Array(32).fill(N - 1),
];
const S5 = WIN.length;
for (const [i, k] of WIN.entries()) {
  shots.push({
    base: frameFile('cheer-b', 'cheer', k),
    put: [],
    ink: [
      ...type(11, LABEL, 24, 26, 'the one that was chosen, at full size'),
      ...type(12, fade(HEAD, Math.max(0, Math.min(1, (i - 22) / 8))), 24, 46, 'candidate B'),
    ],
    command: CMD5,
  });
}

console.log(
  `shots: pictures ${S1} + instrument ${S2} + candidates ${S3} + choice ${S4} + winner ${S5} = ${shots.length} (${(shots.length / 20).toFixed(2)}s)`,
);

// ---------------------------------------------------------------------------
// composite every frame
// ---------------------------------------------------------------------------

const pad = (i: number) => String(i).padStart(4, '0');

/** Every shot frame, composited once, in the order the shots were pushed. */
for (const [i, shot] of shots.entries()) {
  const args: string[] = [shot.base];
  // A rigc frame needs cropping to the plate first; a bit built above is
  // already at final size.
  if (shot.base.startsWith(`${ROOT}render-`)) {
    args.push('-crop', PLATE_CROP, '+repage', '-filter', 'Lanczos', '-resize', `${OUT_W}x${OUT_H}!`);
  }
  args.push('-alpha', 'remove', '-alpha', 'off');
  for (const [file, x, y] of shot.put) {
    args.push(file, '-geometry', `+${Math.round(S(x))}+${Math.round(S(y))}`, '-composite');
  }
  args.push(...shot.ink, ...bandArgs(shot.command), `${WORK}r${pad(i)}.png`);
  await $`magick ${args}`.quiet();
}
const raw = (i: number) => `${WORK}r${pad(i)}.png`;

/**
 * The joins — four inside the film and one that closes the loop.
 *
 * Film one had exactly one join and it argued the case there: the step SIZE is
 * what reads as a cut, and it measured a straight loop join at 21 % of frame
 * RMSE against 1.4 % for a normal frame-to-frame step. This film is five shots
 * rather than one continuous flow, so it has five joins, and measuring them
 * gave the same answer in a place I had not expected to need it: the SHOT
 * boundaries were hopping 27 %, an order of magnitude past anything inside a
 * shot. ⇒ every join gets a dissolve.
 *
 * Two lengths, because the two kinds of join are not the same thing. A cut
 * between shots is grammar — it should be soft enough not to snap and short
 * enough to still read as "next" (3 steps, 150 ms). The loop seam is a join the
 * film would rather nobody noticed at all, and it spans the largest change in
 * the film (a full-screen figure to two small cards), so it gets a longer ramp
 * weighted toward the end — the seam is measured on the LAST hop, and even
 * steps left that hop at 2.6 %.
 */
const CUT = [26, 55, 80];
const SEAM = [12, 26, 42, 58, 72, 84, 93];

/** Where a new shot starts, in `shots` indices. */
const STARTS = [S1, S1 + S2, S1 + S2 + S3, S1 + S2 + S3 + S4];

/** The final ordered frame list: shot frames, with blends spliced at the joins. */
const plan: string[] = [];
let blendN = 0;
const blend = async (a: string, b: string, mix: number) => {
  const out = `${WORK}x${pad(blendN)}.png`;
  blendN += 1;
  await $`magick ${a} ${b} -compose blend -define compose:args=${String(mix)} -composite ${out}`.quiet();
  return out;
};

for (let i = 0; i < shots.length; i += 1) {
  if (STARTS.includes(i)) {
    for (const mix of CUT) plan.push(await blend(raw(i - 1), raw(i), mix));
  }
  plan.push(raw(i));
}
for (const mix of SEAM) plan.push(await blend(raw(shots.length - 1), raw(0), mix));

const total = plan.length;
console.log(
  `+ ${STARTS.length}x${CUT.length} shot dissolves + ${SEAM.length} loop dissolve = ${total} frames (${(total / 20).toFixed(2)}s)`,
);

// ---------------------------------------------------------------------------
// the GIF
// ---------------------------------------------------------------------------

/**
 * 🚨 The frame list is an EXPLICIT ordered array, never a glob and never a
 * directory listing. Film one shipped a shuffled GIF once: Bun's shell expands
 * `s*.png` in directory order rather than lexicographic order — measured,
 * `s0002 s0016 s0017 s0003 …` — and the result played as a perfectly valid
 * animation of the right length and size, with the damage invisible in the
 * file's own stats. It also produced a convincing WRONG diagnosis first, because
 * shuffled frames make consecutive-frame differencing produce nonsense and
 * `-layers Optimize` looked like the culprit.
 *
 * ⚠️ Film one's fix was `readdirSync(...).sort()`, which works only while every
 * frame is one zero-padded series. This film's order is not a sortable series —
 * shot frames and join blends interleave — so sorting a listing would shuffle it
 * again, differently. ⇒ `plan` IS the order, it is built in playback order
 * above, and the checks below are: every file exists, no file appears where the
 * plan did not put it, and the written GIF is diffed against the plan frame by
 * frame.
 *
 * `+dither -colors 256 -layers OptimizeTransparency` is film one's measured
 * encode: a smaller palette comes out BIGGER because dither noise costs more
 * than the colours it saves, and `OptimizeTransparency` leaves every frame
 * full-canvas with one dispose mode — the encoding least able to go wrong in
 * somebody else's viewer.
 */
for (const [i, f] of plan.entries()) {
  if (!existsSync(f)) throw new Error(`plan frame ${i} is missing: ${f}`);
}
const onDisk = readdirSync(WORK).filter((f) => /^[rx]\d+\.png$/.test(f)).length;
const named = new Set(plan).size;
if (onDisk !== named) throw new Error(`${onDisk} frame files on disk but the plan names ${named} of them`);
if (named !== shots.length + blendN) throw new Error(`the plan drops a frame: ${named} distinct, ${shots.length + blendN} written`);
await $`magick -delay ${DELAY} -loop 0 ${plan} +dither -colors 256 -layers OptimizeTransparency ${OUT}`;

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
 * The seam, against the MEDIAN frame-to-frame step rather than one hand-picked
 * pair — the first cut sampled a frame inside a hold and got 0.00 %, which makes
 * any seam look infinitely bad. Holds are most of this film, so the median is
 * taken over the moving steps only.
 */
const seam = await rmse(co(rows.length - 1), co(0));
const steps: number[] = [];
for (let i = 1; i < rows.length; i += 1) steps.push(await rmse(co(i - 1), co(i)));
const moving = steps.filter((v) => v > 65535 * 0.001).sort((a, b) => a - b);
const typical = moving[Math.floor(moving.length / 2)];
/**
 * The biggest hop that is NOT a join, so the joins have something to be
 * compared against. Every join's frames are blends, so they are excluded by
 * name rather than by position — the joins are no longer all at the end.
 */
const isJoin = new Set<number>();
for (let i = 0; i < plan.length; i += 1) {
  if (/\/x\d+\.png$/.test(plan[i])) {
    isJoin.add(i);
    isJoin.add(i + 1);
  }
}
const inShot = steps.filter((_, k) => !isJoin.has(k + 1));
const biggest = [...inShot].sort((a, b) => b - a)[0];
const joinHops = steps.filter((_, k) => isJoin.has(k + 1));
const worstJoin = [...joinHops].sort((a, b) => b - a)[0];

console.log(`\n${OUT}`);
console.log(`  frames      ${rows.length}`);
console.log(`  canvas      ${[...geoms].map((g) => g.split('+')[0]).join(', ')}`);
console.log(`  delay       ${[...delays].join(', ')} cs  (= ${(100 / Number([...delays][0])).toFixed(0)} fps, ${(rows.length * Number([...delays][0])) / 100}s)`);
console.log(`  loop        Iterations: ${iterations}  (0 = forever)`);
console.log(`  dispose     ${[...disposals].join(', ')}`);
console.log(`  bytes       ${bytes.toLocaleString()}  (${(bytes / 1024 / 1024).toFixed(2)} MiB)`);
console.log(`  fidelity    mean ${pc(sum / rows.length)}, worst ${pc(worst.v)} at frame ${worst.i}`);
console.log(
  `  seam        ${pc(seam)} last->first, against a ${pc(typical)} median moving step and a ${pc(biggest)} biggest in-shot step`,
);
console.log(`  joins       ${joinHops.length} dissolve hops, worst ${pc(worstJoin)}`);
console.log(`  band top    y=${S(BAND_TOP)} of ${OUT_H}`);
if (!existsSync(OUT)) throw new Error('no GIF was written');
