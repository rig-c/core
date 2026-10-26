/** Controlled painted aperture. No external art and no runtime alpha-mask feature. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Plate } from '../tools/plate.ts';
import type { RigSpec, RigAttachment } from '../src/rig.ts';
import type { MotionSpec } from '../src/types.ts';

export const ALPHA_CLIP_FIXTURE = Object.freeze({
  width: 64, height: 48, centre: [32, 24] as const, radii: [24, 12] as const,
  feather: 2, threshold: 128, tolerance: 0.5, maxVertices: 41184,
  depthScale: 16, grid: [9, 7] as const, sourceBone: [8, -3] as const,
  clipBone: [-37, 19] as const,
  viewport: { minX: -64, minY: -48, maxX: 64, maxY: 48, scale: 4, width: 512, height: 384 },
  background: [0, 0, 0, 0] as [number, number, number, number],
  fps: 1, sampleIndex: 0,
});
// Gaze = half the aperture's corresponding radius; clipping is deliberately exercised.
export const ALPHA_CLIP_STATES = [-15, 15].flatMap((yaw) => [
  { gaze: 'left', dx: -12, dy: 0 }, { gaze: 'right', dx: 12, dy: 0 },
  { gaze: 'up', dx: 0, dy: 6 }, { gaze: 'down', dx: 0, dy: -6 },
].map((gaze) => ({ ...gaze, yaw, name: `${gaze.gaze}_${yaw < 0 ? 'minus' : 'plus'}15` })));
export type AlphaClipForm = 'region' | 'grid' | 'contour' | 'authored' | 'linked';

export function apertureAlpha(x: number, y: number): number {
  const f = ALPHA_CLIP_FIXTURE;
  const r = Math.hypot((x + 0.5 - f.centre[0]) / f.radii[0], (y + 0.5 - f.centre[1]) / f.radii[1]);
  return Math.round(255 * Math.max(0, Math.min(1, 0.5 + (1 - r) * Math.min(...f.radii) / f.feather)));
}
/** An opaque grey ramp, explicitly decoded before source depth sampling. */
export function apertureDepthLevel(x: number): number { return 64 + 2 * x; }

export function alphaClipInputs(form: AlphaClipForm): { rig: RigSpec; motion: MotionSpec } {
  const f = ALPHA_CLIP_FIXTURE;
  let source: RigAttachment;
  if (form === 'region') source = { image: 'aperture.png' };
  else if (form === 'authored' || form === 'linked') source = {
    type: 'mesh', image: 'aperture.png', uvs: [0, 1, 0, 0, 1, 0, 1, 1],
    triangles: [0, 1, 2, 2, 3, 0], vertices: [-32, -24, -32, 24, 32, 24, 32, -24], hull: 4,
  };
  else source = { type: 'mesh', image: 'aperture.png', generator: form === 'grid'
    ? { kind: 'grid', cols: f.grid[0], rows: f.grid[1], depth: { image: 'depth.png', near: 'white', zScale: f.depthScale } }
    : { kind: 'contour', alpha: f.threshold, tolerance: f.tolerance, margin: f.feather, maxVertices: f.maxVertices, depth: { image: 'depth.png', near: 'white', zScale: f.depthScale } } };
  const attachments: Record<string, Record<string, RigAttachment>> = {
    clip: { clip: { type: 'clipping', end: 'pupil', alphaClip: { skin: 'default', slot: 'aperture', attachment: 'aperture', alpha: f.threshold, tolerance: f.tolerance, maxVertices: f.maxVertices } } },
    pupil: { pupil: { image: 'pupil.png' } }, aperture: { aperture: source },
  };
  if (form === 'linked') { attachments.base = { base: source }; attachments.aperture.aperture = { type: 'linkedmesh', image: 'aperture.png', source: 'base', slot: 'base' }; }
  const rig: RigSpec = {
    spec: 'rigc-rig/1', name: 'alpha_clip_probe', skeleton: { width: 128, height: 96 },
    invariants: { meshSlots: 2, meshTriangles: 4096 },
    bones: [{ name: 'root' }, { name: 'head', parent: 'root', x: f.sourceBone[0], y: f.sourceBone[1] },
      { name: 'clip_bone', parent: 'root', x: f.clipBone[0], y: f.clipBone[1], rotation: 21 },
      { name: 'pupil', parent: 'head' }],
    slots: [{ name: 'clip', bone: 'clip_bone', attachment: 'clip' },
      { name: 'pupil', bone: 'pupil', attachment: 'pupil' },
      { name: 'aperture', bone: 'head', attachment: 'aperture', color: 'ffffff00' },
      ...(form === 'linked' ? [{ name: 'base', bone: 'head', attachment: 'base', color: 'ffffff00' }] : [])],
    skins: { default: attachments },
  };
  const motion: MotionSpec = { spec: 'rigc-motion/1', archetype: 'alpha_clip_probe', cut: 'alpha_clip_probe', easings: {}, animations: {} };
  for (const state of ALPHA_CLIP_STATES) {
    const keys = [0, 1].map((t) => ({ t, transform: { kind: 'yaw' as const, depth: true, degrees: state.yaw } }));
    motion.animations[state.name] = {
      duration: 1, tracks: [{ bone: 'pupil', property: 'translate', keys: [0, 1].map((t) => ({ t, v: [state.dx, state.dy] })) }],
      ...(form === 'grid' || form === 'contour' ? { deform: [{ slot: 'aperture', attachment: 'aperture', keys }, { slot: 'clip', attachment: 'clip', keys }] } : {}),
    };
  }
  return { rig, motion };
}

export function writeAlphaClipFixture(dir: string, form: AlphaClipForm): { rigPath: string; motionPath: string; outDir: string; imagesDir: string } {
  mkdirSync(dir, { recursive: true });
  const f = ALPHA_CLIP_FIXTURE;
  const aperture = new Plate(f.width, f.height), pupil = new Plate(f.width, f.height), depth = new Plate(f.width, f.height);
  for (let y = 0; y < f.height; y++) for (let x = 0; x < f.width; x++) {
    aperture.set(x, y, [120 + x, 90 + y, 160, apertureAlpha(x, y)]);
    const ink = Math.hypot((x + 0.5 - 32) / 20, (y + 0.5 - 24) / 10) <= 1;
    pupil.set(x, y, [30 + 3 * x, 80 + 2 * y, 210 - 2 * x, ink ? 255 : 0]);
    const level = apertureDepthLevel(x); depth.set(x, y, [level, level, level, 255]);
  }
  aperture.writePng(join(dir, 'aperture.png')); pupil.writePng(join(dir, 'pupil.png')); depth.writePng(join(dir, 'depth.png'));
  const input = alphaClipInputs(form), rigPath = join(dir, 'rig.json'), motionPath = join(dir, 'motion.json');
  writeFileSync(rigPath, JSON.stringify(input.rig, null, 2) + '\n'); writeFileSync(motionPath, JSON.stringify(input.motion, null, 2) + '\n');
  return { rigPath, motionPath, outDir: join(dir, 'build'), imagesDir: dir };
}
