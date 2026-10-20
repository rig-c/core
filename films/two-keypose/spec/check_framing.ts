/**
 * Does the stage plate, and only the stage plate, decide rigc's framing box —
 * in every one of the four builds?
 *
 * The film crops rigc's frames back to the plate using the viewport in
 * `frames.json`, and there are FOUR renders here (the stills and three
 * candidates) rather than film one's single one. So this has to hold twice
 * over: no quad may leave the plate in any build, AND the four viewports have
 * to come out identical — a build whose framing box is one unit wider gets a
 * different scale, and two shots cut together at two scales is a jump nobody
 * can name afterwards.
 *
 * ⭐ It measures QUADS, not pixels: a region attachment's quad is the whole PNG
 * including its transparent margin, so a rotated plate can push the box without
 * drawing anything there. Scanning the rendered PNGs for stray ink finds
 * nothing and proves nothing.
 *
 * ⚠️ And it has to be a real SAMPLE. `make_specs.ts` can only check the two
 * poses; candidate B's anticipation and overshoot put every part a little
 * outside both of them, at times no pose contains.
 */
import { fileURLToPath } from 'node:url';
import { loadPosable, sampleAnimation, unionBounds, FRAMING_FPS } from 'rig-c/render';
import { PLATE_W, PLATE_H } from '../art/layout';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const BUILDS = ['poses', 'cheer-a', 'cheer-b'];

let bad = false;
const viewports = new Map<string, string>();

for (const name of BUILDS) {
  const dir = `${ROOT}build-${name}/`;
  const posable = loadPosable(`${dir}skeleton.json`, `${dir}skeleton.atlas`, dir);
  const data = posable.data;
  let worst: { anim: string; frame: number; slot: string; over: number } | null = null;
  let box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };

  for (const animation of data.animations) {
    const frames = sampleAnimation(data, animation.name, FRAMING_FPS);
    const b = unionBounds([frames]);
    box = {
      minX: Math.min(box.minX, b.minX),
      minY: Math.min(box.minY, b.minY),
      maxX: Math.max(box.maxX, b.maxX),
      maxY: Math.max(box.maxY, b.maxY),
    };
    for (const [i, frame] of frames.entries()) {
      for (const piece of frame.pieces) {
        for (let k = 0; k < piece.world.length; k += 2) {
          const x = piece.world[k];
          const y = piece.world[k + 1];
          // 0.01 of slack: the plate's own corners land on 0 and PLATE_W to
          // within float noise, and that is not a part leaving the stage.
          const over = Math.max(-x, x - PLATE_W, -y, y - PLATE_H);
          if (over > 0.01 && (worst === null || over > worst.over)) {
            worst = { anim: animation.name, frame: i, slot: piece.slot, over };
          }
        }
      }
    }
  }

  const f = (n: number) => n.toFixed(2);
  const key = `${f(box.minX)},${f(box.minY)},${f(box.maxX)},${f(box.maxY)}`;
  viewports.set(name, key);
  if (worst === null) {
    console.log(`✅ ${name.padEnd(8)} every quad inside the plate — box x ${f(box.minX)}..${f(box.maxX)}  y ${f(box.minY)}..${f(box.maxY)}`);
  } else {
    bad = true;
    console.log(
      `❌ ${name.padEnd(8)} "${worst.slot}" in "${worst.anim}" frame ${worst.frame}/${FRAMING_FPS}fps is ${f(worst.over)} units off the plate`,
    );
  }
}

const distinct = new Set(viewports.values());
if (distinct.size === 1) {
  console.log(`✅ all ${BUILDS.length} builds share one framing box, so one crop fits every shot`);
} else {
  bad = true;
  console.log(`❌ ${distinct.size} different framing boxes: ${[...viewports].map(([k, v]) => `${k}=${v}`).join('  ')}`);
}
if (bad) process.exitCode = 1;
