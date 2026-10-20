/**
 * Does the raised paw ever land on the face?
 *
 * This exists because it happened. Candidate B's §3.8 overshoot swings the near
 * arm past pose B toward vertical, and because the hand is the "link after
 * that" in §3.7's table its own overshoot turns the paw further — the two
 * compound, the arm sweeps inward, and R4's slot order draws `hand_f` in FRONT
 * of the head. Frames 6–9 had the paw sitting on Rigby's right eye. Nothing in
 * the toolchain can see that: the build is valid, the framing box is clean, the
 * two given poses are stated exactly, and the candidate that is supposed to
 * read BETTER is the one covering its own face.
 *
 * ⭐ Which is the whole shape of MOTION.md §3.8's warning about interior keys,
 * arriving from a direction the document does not name: an overshoot is a value
 * no picture contains, so a pose pair cannot rule it out. The pose is fine at
 * both ends and wrong 60 % of the way through.
 *
 * So: sample every animation of every build, take the drawn quads of `hand_f`
 * and of `eyes`, and refuse an overlap. Quads rather than pixels, for the same
 * reason `check_framing.ts` uses them — except here the transparent margin
 * makes the test STRICTER than the eye, so the margin is trimmed off the
 * comparison by insetting each quad to the part's own ink box.
 */
import { fileURLToPath } from 'node:url';
import { loadPosable, sampleAnimation } from 'rig-c/render';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const BUILDS = ['poses', 'cheer-a', 'cheer-b'];
const FPS = 60;

/**
 * The ink box of each plate as a fraction of its own image, measured once with
 * ImageMagick (`magick identify -format %@`) rather than guessed.
 */
async function inkFraction(image: string) {
  const proc = Bun.spawn(['magick', 'identify', '-format', '%@', `${ROOT}art/parts/${image}`], {
    stdout: 'pipe',
  });
  const out = (await new Response(proc.stdout).text()).trim();
  const m = /^(\d+)x(\d+)\+(-?\d+)\+(-?\d+)$/.exec(out);
  if (m === null) throw new Error(`could not read the ink box of ${image}: "${out}"`);
  const proc2 = Bun.spawn(['magick', 'identify', '-format', '%w %h', `${ROOT}art/parts/${image}`], {
    stdout: 'pipe',
  });
  const [w, h] = (await new Response(proc2.stdout).text()).trim().split(' ').map(Number);
  return {
    // fractional inset from each edge, 0..0.5
    left: Number(m[3]) / w,
    top: Number(m[4]) / h,
    right: 1 - (Number(m[3]) + Number(m[1])) / w,
    bottom: 1 - (Number(m[4]) + Number(m[2])) / h,
  };
}

const ink = {
  hand_f: await inkFraction('hand_f.png'),
  eyes: await inkFraction('eyes.png'),
};

/**
 * A piece's world quad, insets applied. `piece.world` is 4 corners in the
 * region attachment's own order (bl, ul, ur, br as rigc writes it), so an inset
 * is a bilinear step toward the opposite corner along each edge.
 */
function insetQuad(world: number[], f: { left: number; top: number; right: number; bottom: number }) {
  const P = [
    [world[0], world[1]],
    [world[2], world[3]],
    [world[4], world[5]],
    [world[6], world[7]],
  ];
  // bilinear corner at (u, v) in [0,1]^2 over the quad P0..P3
  const at = (u: number, v: number) => {
    const a = [P[0][0] + (P[3][0] - P[0][0]) * u, P[0][1] + (P[3][1] - P[0][1]) * u];
    const b = [P[1][0] + (P[2][0] - P[1][0]) * u, P[1][1] + (P[2][1] - P[1][1]) * u];
    return [a[0] + (b[0] - a[0]) * v, a[1] + (b[1] - a[1]) * v];
  };
  const u0 = f.left;
  const u1 = 1 - f.right;
  const v0 = f.bottom;
  const v1 = 1 - f.top;
  return [at(u0, v0), at(u0, v1), at(u1, v1), at(u1, v0)];
}

/** Separating-axis test for two convex quads; returns the overlap depth or 0. */
function overlapDepth(a: number[][], b: number[][]): number {
  let least = Infinity;
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i += 1) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const ax = -(q[1] - p[1]);
      const ay = q[0] - p[0];
      const len = Math.hypot(ax, ay);
      if (len < 1e-9) continue;
      const nx = ax / len;
      const ny = ay / len;
      const proj = (poly2: number[][]) => {
        let lo = Infinity;
        let hi = -Infinity;
        for (const v of poly2) {
          const d = v[0] * nx + v[1] * ny;
          lo = Math.min(lo, d);
          hi = Math.max(hi, d);
        }
        return [lo, hi];
      };
      const [alo, ahi] = proj(a);
      const [blo, bhi] = proj(b);
      const o = Math.min(ahi, bhi) - Math.max(alo, blo);
      if (o <= 0) return 0;
      least = Math.min(least, o);
    }
  }
  return least;
}

let bad = false;
for (const name of BUILDS) {
  const dir = `${ROOT}build-${name}/`;
  const posable = loadPosable(`${dir}skeleton.json`, `${dir}skeleton.atlas`, dir);
  let worst = { anim: '', t: 0, depth: 0 };
  for (const animation of posable.data.animations) {
    const frames = sampleAnimation(posable.data, animation.name, FPS);
    for (const [i, frame] of frames.entries()) {
      const hand = frame.pieces.find((p) => p.slot === 'hand_f');
      const eyes = frame.pieces.find((p) => p.slot === 'eyes');
      if (hand === undefined || eyes === undefined) continue;
      const d = overlapDepth(insetQuad(hand.world, ink.hand_f), insetQuad(eyes.world, ink.eyes));
      if (d > worst.depth) worst = { anim: animation.name, t: i / FPS, depth: d };
    }
  }
  if (worst.depth > 0) {
    bad = true;
    console.log(
      `❌ ${name.padEnd(8)} the paw covers the eyes in "${worst.anim}" at t=${worst.t.toFixed(3)}s — ${worst.depth.toFixed(1)} world units deep`,
    );
  } else {
    console.log(`✅ ${name.padEnd(8)} the paw never reaches the eyes`);
  }
}
if (bad) process.exitCode = 1;
