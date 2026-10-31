/** Warning-only region minification, in world units per stored texture pixel. */
import type { Piece, Poser, Posed } from './render_shared.ts';
import type { Plate } from '../tools/plate.ts';
import { walkTimelines } from './timelines.ts';
import { hypot2 } from './numeric.ts';

export const TEXTURE_SCALE_WARNING = 'REGION_TEXTURE_MINIFIED';
export const TEXTURE_SCALE_THRESHOLD = 0.5;
export const TEXTURE_SCALE_FPS = 60;
export const TEXTURE_SCALE_LIMIT =
  'Minimum among sampled poses only: grid + float32 key times + key-interval midpoints + endpoint; ' +
  'interpolated scale/shear/constraints can have smaller extrema between samples. ' +
  'World units per texture pixel, before consumer camera/viewport; no occlusion test.';

export interface RegionScale {
  slot: string;
  attachment: string;
  region: string;
  index: number;
  page: string;
  texture: { width: number; height: number };
  smallestSampledScale: number;
  animation: string | null;
  time: number;
}
export interface TextureScaleReport {
  spec: 'rigc-texture-scale/1';
  threshold: number;
  fps: number;
  skin: string | null;
  sampling: string;
  samples: Array<{ animation: string | null; times: number[] }>;
  drawnRegions: number;
  warnings: Array<RegionScale & { name: typeof TEXTURE_SCALE_WARNING }>;
}

/** Stable 2x2 sigma-min: |det| / sigma-max avoids subtracting nearly equal eigenvalues. */
export function smallestSingularValue(a: number, b: number, c: number, d: number): number {
  const scale = Math.max(Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d));
  if (scale === 0) return 0;
  a /= scale; b /= scale; c /= scale; d /= scale;
  const sum = a * a + b * b + c * c + d * d;
  const disc = hypot2(a * a + c * c - b * b - d * d, 2 * (a * b + c * d));
  return scale * Math.abs(a * d - b * c) / Math.sqrt((sum + disc) / 2);
}

/** Texel-space affine map from three corresponding quad corners; includes trim, rotation, reflection and shear. */
export function regionDrawScale(piece: Piece, page: Pick<Plate, 'width' | 'height'>): number {
  const [x0, y0, x1, y1, x2, y2] = piece.world;
  const u0 = piece.uvs[0] * page.width, v0 = piece.uvs[1] * page.height;
  const u1 = piece.uvs[2] * page.width - u0, v1 = piece.uvs[3] * page.height - v0;
  const u2 = piece.uvs[4] * page.width - u0, v2 = piece.uvs[5] * page.height - v0;
  const det = u1 * v2 - u2 * v1;
  if (det === 0) throw new Error(`slot ${JSON.stringify(piece.slot)}: region has a singular texture rectangle`);
  return smallestSingularValue(
    ((x1 - x0) * v2 - (x2 - x0) * v1) / det,
    ((x2 - x0) * u1 - (x1 - x0) * u2) / det,
    ((y1 - y0) * v2 - (y2 - y0) * v1) / det,
    ((y2 - y0) * u1 - (y1 - y0) * u2) / det,
  );
}

/** A schedule, not an extrema solver. Key times use the same float32 storage as the poser. */
export function textureScaleTimes(skeletonText: string, animation: string, duration: number, fps: number): number[] {
  if (!Number.isFinite(fps) || fps < 1) throw new Error(`texture-scale fps ${fps}: expected a finite number >= 1`);
  const root = JSON.parse(skeletonText) as { animations?: Record<string, unknown> };
  const keys = new Set<number>([0, duration]);
  walkTimelines({ animations: { [animation]: root.animations?.[animation] } }, (_p, _k, _n, rows) => {
    for (const row of rows) {
      const t = Math.fround((row as { time?: number }).time ?? 0);
      if (Number.isFinite(t) && t >= 0 && t <= duration) keys.add(t);
    }
  });
  const sorted = [...keys].sort((a, b) => a - b);
  const times = new Set(sorted);
  for (let i = 1; i < sorted.length; i++) times.add((sorted[i - 1] + sorted[i]) / 2);
  for (let i = 0; i / fps < duration; i++) times.add(i / fps);
  return [...times].sort((a, b) => a - b);
}

/** Has a submitted triangle of positive area; fully clipped or collapsed geometry draws nothing. */
function hasArea(p: Piece): boolean {
  const ts = p.kind === 'region' ? [0, 1, 2, 2, 3, 0] : p.triangles;
  for (let i = 0; i < ts.length; i += 3) {
    const a = ts[i] * 2, b = ts[i + 1] * 2, c = ts[i + 2] * 2;
    if (Math.abs((p.world[b] - p.world[a]) * (p.world[c + 1] - p.world[a + 1]) -
      (p.world[b + 1] - p.world[a + 1]) * (p.world[c] - p.world[a])) > 0) return true;
  }
  return false;
}

/** Excludes wholly transparent source rectangles; no per-frame raster or screen-space occlusion claim. */
function hasAlpha(piece: Piece, page: Plate): boolean {
  const us = [0, 2, 4, 6].map(i => piece.uvs[i] * page.width);
  const vs = [1, 3, 5, 7].map(i => piece.uvs[i] * page.height);
  const x0 = Math.max(0, Math.round(Math.min(...us))), x1 = Math.min(page.width, Math.round(Math.max(...us)));
  const y0 = Math.max(0, Math.round(Math.min(...vs))), y1 = Math.min(page.height, Math.round(Math.max(...vs)));
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (page.data[(y * page.width + x) * 4 + 3] > 0) return true;
  return false;
}

/** Streaming read: setup first, then animations in declaration order; ties keep the first observation. Never emits a build. */
export function textureScaleReading(poser: Poser, pages: Map<string, Plate>, skeletonText: string, fps = TEXTURE_SCALE_FPS, skin?: string): { report: TextureScaleReport; regions: RegionScale[] } {
  if (!Number.isFinite(fps) || fps < 1) throw new Error(`texture-scale fps ${fps}: expected a finite number >= 1`);
  const readings = new Map<string, RegionScale>();
  const slotBones = new Map(poser.slots.map(s => [s.name, s.bone]));
  const alpha = new Map<string, boolean>();
  const samples: TextureScaleReport['samples'] = [{ animation: null, times: [0] }];
  const visit = (pose: Posed, animation: string | null, time: number): void => {
    const unposed = new Set(pose.bones().filter(b => b.a === 0 && b.b === 0 && b.c === 0 && b.d === 0).map(b => b.name));
    const drawn = new Map(pose.pieces({ subset: undefined, unclipped: false, texture: false }).map(p => [p.slot, p]));
    for (const whole of pose.pieces({ subset: undefined, unclipped: true, texture: false, regionInfo: true })) {
      if (unposed.has(slotBones.get(whole.slot) ?? '')) continue;
      if (whole.kind !== 'region' || whole.regionInfo === undefined || !(whole.tint[3] > 0)) continue;
      const visible = drawn.get(whole.slot);
      if (visible === undefined || !hasArea(visible)) continue;
      const info = whole.regionInfo;
      const page = pages.get(whole.page);
      if (page === undefined) throw new Error(`region ${JSON.stringify(info.region)}: page ${JSON.stringify(whole.page)} is absent`);
      const key = JSON.stringify([whole.slot, info.attachment, whole.page, info.region, info.index]);
      const sourceAlpha = alpha.get(key) ?? hasAlpha(whole, page);
      alpha.set(key, sourceAlpha);
      if (!sourceAlpha) continue;
      const scale = regionDrawScale(whole, page);
      if (!Number.isFinite(scale)) throw new Error(`region ${JSON.stringify(info.region)} at ${animation ?? 'setup'} t=${time}: draw scale ${scale} is not finite`);
      const old = readings.get(key);
      if (old === undefined || scale < old.smallestSampledScale) readings.set(key, {
        slot: whole.slot, attachment: info.attachment, region: info.region, index: info.index, page: whole.page,
        texture: { width: info.width, height: info.height }, smallestSampledScale: scale, animation, time,
      });
    }
  };
  visit(poser.setup(skin), null, 0);
  for (const a of poser.animations) {
    const times = textureScaleTimes(skeletonText, a.name, a.duration, fps);
    samples.push({ animation: a.name, times });
    poser.animation(a.name, skin, fps, times.length - 1, (i, posed) => visit(posed, a.name, times[i]), undefined, false, times);
  }
  const regions = [...readings.values()];
  return { regions, report: {
    spec: 'rigc-texture-scale/1', threshold: TEXTURE_SCALE_THRESHOLD, fps, skin: skin ?? null, sampling: TEXTURE_SCALE_LIMIT,
    samples, drawnRegions: regions.length,
    warnings: regions.filter(r => r.smallestSampledScale < TEXTURE_SCALE_THRESHOLD).map(r => ({ name: TEXTURE_SCALE_WARNING, ...r })),
  } };
}

export function textureScaleLines(report: TextureScaleReport): string[] {
  return [
    `texture-scale: ${report.warnings.length} warning(s) / ${report.drawnRegions} drawn region attachment(s), threshold < ${report.threshold}, ${report.fps} fps + keys/midpoints/endpoints`,
    report.sampling,
    ...report.warnings.map(r => `WARN ${r.name}: region ${JSON.stringify(r.region)} slot ${JSON.stringify(r.slot)} attachment ${JSON.stringify(r.attachment)} texture ${r.texture.width}x${r.texture.height}, smallest sampled draw scale ${r.smallestSampledScale.toFixed(6)} at ${r.animation === null ? 'setup' : JSON.stringify(r.animation)} t=${r.time}s`),
  ];
}
