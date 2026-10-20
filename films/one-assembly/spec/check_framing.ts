/**
 * Does the stage plate, and only the stage plate, decide rigc's framing box?
 *
 * This matters because the GIF crops rigc's frames back to the plate using the
 * viewport in `frames.json`. If any part's QUAD leaves the plate at any moment,
 * rigc frames to that instead, the plate stops filling a known rectangle, and
 * the crop either clips a part or stops being an exact 2:1 downsample.
 *
 * ⚠️ It has to be a real sample rather than an extreme pose, and that is the
 * whole reason this file exists. `make_specs.ts` checks the scatter pose and
 * the anticipation pose, and both looked fine while the real animation put a
 * quad corner 18 world units off the left edge: the widest moment is a TIER B
 * part at its own anticipation carrying children that have already seated, and
 * that configuration is not any single scaling of the scatter deltas.
 *
 * ⭐ It also measures QUADS, not pixels — a region attachment's quad is the
 * whole PNG including its transparent margin (render.ts's own note), so a
 * rotated plate can push the box without drawing anything there. Scanning the
 * rendered PNGs for stray ink finds nothing and proves nothing.
 */
import { fileURLToPath } from 'node:url';
import { loadPosable, sampleAnimation, unionBounds, FRAMING_FPS } from 'rig-c/render';
import { PLATE_W, PLATE_H } from '../art/layout';

const build = fileURLToPath(new URL('../build/', import.meta.url));
const posable = loadPosable(`${build}skeleton.json`, `${build}skeleton.atlas`, build);
const data = posable.data;

let worst: { anim: string; frame: number; slot: string; x: number; y: number } | null = null;
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
        if (over > 0.01 && (worst === null || over > Math.max(-worst.x, worst.x - PLATE_W, -worst.y, worst.y - PLATE_H))) {
          worst = { anim: animation.name, frame: i, slot: piece.slot, x, y };
        }
      }
    }
  }
}

const f = (n: number) => n.toFixed(2);
console.log(`plate       0..${PLATE_W}  0..${PLATE_H}`);
console.log(`union box   x ${f(box.minX)}..${f(box.maxX)}  y ${f(box.minY)}..${f(box.maxY)}`);
if (worst === null) {
  console.log('✅ every quad corner of every sampled frame is inside the plate');
} else {
  console.log(
    `❌ worst offender: "${worst.slot}" in "${worst.anim}" at frame ${worst.frame}/${FRAMING_FPS}fps ` +
      `— corner (${f(worst.x)}, ${f(worst.y)})`,
  );
  process.exitCode = 1;
}
