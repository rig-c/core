/** Independent source-surface reading plus existing core/SkeletonClipping render oracle. */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { AnimationState, AnimationStateData, Skeleton, Physics, ClippingAttachment, type SkeletonData } from '@esotericsoftware/spine-core';
import { ALPHA_CLIP_FIXTURE as F, ALPHA_CLIP_STATES, writeAlphaClipFixture, type AlphaClipForm } from '../fixtures/alpha_clip.ts';
import { compile } from '../src/compile.ts';
import { loadPosable, posableFromText, candidatePosers } from '../src/render.ts';
import { sampleAnimation, renderFrame, type Frame, type Piece, type Poser } from '../src/render_shared.ts';
import { Plate, readPlate } from './plate.ts';
import { uvCarriers } from '../src/meshcarriers.ts';
import { traceAlphaOutline, type AlphaMask } from '../src/mesh.ts';
import { clipDistance, type ClipPoint } from '../src/alpha_clip.ts';
import { modelDocument } from '../src/model.ts';
import type { MotionSpec } from '../src/types.ts';

const sha = (data: Uint8Array | string): string => createHash('sha256').update(data).digest('hex');
const assert = (ok: boolean, message: string): void => { if (!ok) throw new Error(message); };
export const ALPHA_CLIP_BOUNDS = Object.freeze({
  // Budget for the actual emitted single-anchor fixture chain, not a renderer tolerance:
  // <=64 float operations (bind, key, affine pose), magnitude <=128, float32 unit roundoff.
  coordinateMagnitude: 128, floatOps: 64, unitRoundoff: 2 ** -24,
  modelGridHalf: 0.5e-6, reportDisplayHalf: 0.5e-6,
  filterSourceRadius: Math.SQRT2, // bilinear support: one source texel in each axis.
  contourProbeStep: 0.25, // half-step Lipschitz envelope accompanies the boundary reading.
});
export function clipRoundingWorld(): number {
  const b = ALPHA_CLIP_BOUNDS, gamma = b.floatOps * b.unitRoundoff / (1 - b.floatOps * b.unitRoundoff);
  return gamma * b.coordinateMagnitude + b.modelGridHalf;
}
function difference(a: Plate, b: Plate): { differing: number; mae: number; max: number; alphaMae: number } {
  assert(a.width === b.width && a.height === b.height, 'reference grids differ');
  let differing = 0, sum = 0, alpha = 0, max = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    let changed = false;
    for (let c = 0; c < 4; c++) { const d = Math.abs(a.data[i + c] - b.data[i + c]); sum += d; max = Math.max(max, d); changed ||= d > 0; if (c === 3) alpha += d; }
    if (changed) differing++;
  }
  return { differing, mae: sum / a.data.length, max, alphaMae: alpha / (a.width * a.height) };
}
function mapped(carrier: ReturnType<typeof uvCarriers>[number], world: number[]): ClipPoint {
  assert(carrier !== null, 'independent source UV sample is uncarried');
  const c = carrier!;
  return [c.corners.reduce((v, k, i) => v + c.bary[i] * world[2 * k], 0), c.corners.reduce((v, k, i) => v + c.bary[i] * world[2 * k + 1], 0)];
}
function clipWorld(data: SkeletonData, animation: string): { polygon: ClipPoint[]; end: string | null } {
  const skeleton = new Skeleton(data), state = new AnimationState(new AnimationStateData(data));
  state.setAnimation(0, animation, false); skeleton.setupPose(); state.apply(skeleton); skeleton.update(0); skeleton.updateWorldTransform(Physics.reset);
  const slot = skeleton.findSlot('clip'); assert(slot !== null, 'clip slot missing');
  const clip = slot!.appliedPose.attachment;
  assert(clip instanceof ClippingAttachment, 'editor/runtime dropped clipping attachment');
  const att = clip as ClippingAttachment, vertices = new Float32Array(att.worldVerticesLength);
  att.computeWorldVertices(skeleton, slot!, 0, att.worldVerticesLength, vertices, 0, 2);
  return { polygon: Array.from({ length: vertices.length / 2 }, (_, i) => [vertices[2 * i], vertices[2 * i + 1]]), end: att.endSlot?.name ?? null };
}
function maskImage(source: Piece, pages: Map<string, Plate>, threshold: boolean): Plate {
  const old = pages.get(source.page); assert(old !== undefined, `page ${source.page} missing`);
  const page = new Plate(old!.width, old!.height);
  for (let i = 0; i < old!.data.length; i += 4) { page.data[i] = page.data[i + 1] = page.data[i + 2] = 255; page.data[i + 3] = threshold ? (old!.data[i + 3] >= F.threshold ? 255 : 0) : old!.data[i + 3]; }
  // The existing rasterizer supplies pixel-centre inversion, premultiplied bilinear and <=0.5 alpha cutoff.
  return renderFrame({ index: 0, time: 0, pieces: [{ ...source, tint: [1, 1, 1, 1] }] }, new Map([[source.page, page]]), F.viewport, F.background);
}
function masked(content: Plate, mask: Plate): Plate {
  const image = new Plate(content.width, content.height);
  for (let i = 0; i < content.data.length; i += 4) {
    const alpha = Math.round(content.data[i + 3] * mask.data[i + 3] / 255);
    if (alpha <= 0) continue;
    for (let c = 0; c < 3; c++) image.data[i + c] = content.data[i + c];
    image.data[i + 3] = alpha;
  }
  return image;
}
function sourceJacobian(source: Piece, uvs: number[], triangles: number[]): number {
  let worst = 0;
  for (let i = 0; i < triangles.length; i += 3) {
    const [a, b, c] = triangles.slice(i, i + 3);
    const ux = (uvs[2 * b] - uvs[2 * a]) * F.width, uy = (uvs[2 * b + 1] - uvs[2 * a + 1]) * F.height;
    const vx = (uvs[2 * c] - uvs[2 * a]) * F.width, vy = (uvs[2 * c + 1] - uvs[2 * a + 1]) * F.height;
    const det = ux * vy - uy * vx; if (det === 0) continue;
    const bx = source.world[2 * b] - source.world[2 * a], by = source.world[2 * b + 1] - source.world[2 * a + 1];
    const cx = source.world[2 * c] - source.world[2 * a], cy = source.world[2 * c + 1] - source.world[2 * a + 1];
    worst = Math.max(worst, Math.hypot((bx * vy - cx * uy) / det, (cx * ux - bx * vx) / det, (by * vy - cy * uy) / det, (cy * ux - by * vx) / det));
  }
  assert(worst > 0, 'no source affine mapping measured'); return worst;
}
/** Conservative byte error from the actual target inverse affine map and visible bilinear tap span. */
function contentRoundingEnvelope(piece: Piece, pages: Map<string, Plate>): { bytes: number; texelError: number; inverseNorm: number; visibleTapSpan: number } {
  const page = pages.get(piece.page)!;
  const ids = piece.kind === 'mesh' ? Array.from(piece.triangles) : [0, 1, 2, 2, 3, 0];
  let inverseNorm = 0;
  for (let k = 0; k < ids.length; k += 3) {
    const [a, b, c] = ids.slice(k, k + 3);
    const bx = piece.world[2 * b] - piece.world[2 * a], by = piece.world[2 * b + 1] - piece.world[2 * a + 1];
    const cx = piece.world[2 * c] - piece.world[2 * a], cy = piece.world[2 * c + 1] - piece.world[2 * a + 1];
    const ux = (piece.uvs[2 * b] - piece.uvs[2 * a]) * page.width, uy = (piece.uvs[2 * b + 1] - piece.uvs[2 * a + 1]) * page.height;
    const vx = (piece.uvs[2 * c] - piece.uvs[2 * a]) * page.width, vy = (piece.uvs[2 * c + 1] - piece.uvs[2 * a + 1]) * page.height;
    const det = bx * cy - by * cx; assert(det !== 0, 'content inverse map is singular');
    inverseNorm = Math.max(inverseNorm, Math.hypot((ux * cy - vx * by) / det, (vx * bx - ux * cx) / det, (uy * cy - vy * by) / det, (vy * bx - uy * cx) / det));
  }
  let visibleTapSpan = 0;
  for (let y = 0; y + 1 < page.height; y++) for (let x = 0; x + 1 < page.width; x++) {
    const taps = [page.get(x, y), page.get(x + 1, y), page.get(x, y + 1), page.get(x + 1, y + 1)].filter((rgba) => rgba[3] > 0);
    if (!taps.length) continue;
    for (let c = 0; c < 3; c++) visibleTapSpan = Math.max(visibleTapSpan, Math.max(...taps.map((v) => v[c])) - Math.min(...taps.map((v) => v[c])));
  }
  const texelError = clipRoundingWorld() * inverseNorm;
  // Two axes, alpha derivative <=255/texel; unpremultiplication denominator >0.5.
  // One final byte-rounding tie is added, rather than asserting nearest-mask equality.
  const bytes = 1 + Math.ceil(Math.max(2 * 255 * texelError, 2 * visibleTapSpan * 255 / 0.5 * texelError));
  return { bytes, texelError, inverseNorm, visibleTapSpan };
}
interface SourceBoundaryReading {
  accepted: boolean;
  rejections: string[];
  projectionError: number;
  rounding: number;
  boundaryError: number;
  boundaryLimit: number;
}

/** One predicate for the positive and actual-mutant source-boundary readings. */
function sourceBoundaryCheck(
  expected: ClipPoint[], boundary: ClipPoint[], polygon: ClipPoint[], jacobian: number,
): SourceBoundaryReading {
  const rounding = clipRoundingWorld();
  const boundaryLimit = jacobian * F.tolerance + rounding;
  const rejections: string[] = [];
  const finite = [...expected, ...boundary, ...polygon].every((point) => point.every(Number.isFinite));
  if (!finite || polygon.length < 3 || expected.length !== polygon.length || boundary.length === 0) {
    return { accepted: false, rejections: ['invalid geometry/vertex roster'], projectionError: Infinity, rounding, boundaryError: Infinity, boundaryLimit };
  }
  let projectionError = 0;
  expected.forEach((point, i) => {
    projectionError = Math.max(projectionError, Math.hypot(point[0] - polygon[i][0], point[1] - polygon[i][1]));
  });
  let boundaryError = 0;
  for (const point of boundary) {
    const distance = Math.min(...polygon.map((a, i) => clipDistance(point, a, polygon[(i + 1) % polygon.length])));
    boundaryError = Math.max(boundaryError, distance);
  }
  if (projectionError > rounding) rejections.push('source-to-clip projection bound');
  if (boundaryError > boundaryLimit) rejections.push('source aperture boundary bound');
  return { accepted: rejections.length === 0, rejections, projectionError, rounding, boundaryError, boundaryLimit };
}

function transformMetadata(motion: MotionSpec, name: string, requestedYaw: number): {
  requestedYaw: number; effectiveYaw: number | null; depthYawApplied: boolean;
  transformKind: string; sourceTransformKind: string; clipTransformKind: string;
} {
  const tracks = motion.animations[name]?.deform ?? [];
  // This frozen protocol samples frame 0; every fixture/control transform is
  // explicitly authored at t=0. A request label is never evidence it was applied.
  const source = tracks.find((track) => track.slot === 'aperture' && track.attachment === 'aperture')?.keys.find((key) => key.t === 0)?.transform;
  const clip = tracks.find((track) => track.slot === 'clip' && track.attachment === 'clip')?.keys.find((key) => key.t === 0)?.transform;
  const sourceKind = source?.kind ?? 'none';
  const clipKind = clip?.kind ?? 'none';
  const sourceYaw = source?.kind === 'yaw' ? source.degrees : null;
  const clipYaw = clip?.kind === 'yaw' ? clip.degrees : null;
  const depthYawApplied = source?.kind === 'yaw' && source.depth === true &&
    clip?.kind === 'yaw' && clip.depth === true && sourceYaw === requestedYaw && clipYaw === requestedYaw;
  return {
    requestedYaw,
    effectiveYaw: sourceYaw !== null && sourceYaw === clipYaw ? sourceYaw : null,
    depthYawApplied,
    transformKind: sourceKind === clipKind ? sourceKind : `${sourceKind}/${clipKind}`,
    sourceTransformKind: sourceKind,
    clipTransformKind: clipKind,
  };
}

/** Pose equivalence uses the already-frozen rounding envelope, not request names or image hashes. */
function poseIdentity(poses: number[][], coordinates: number[]): number {
  const existing = poses.findIndex((pose) => pose.length === coordinates.length &&
    pose.every((value, i) => Math.abs(value - coordinates[i]) <= clipRoundingWorld()));
  if (existing >= 0) return existing + 1;
  poses.push(coordinates);
  return poses.length;
}

/** Exact union of the existing distance band, evaluated at output pixel centres. */
function boundaryBand(boundary: ClipPoint[], radius: number): Uint8Array {
  const band = new Uint8Array(F.viewport.width * F.viewport.height);
  for (let k = 0; k < boundary.length; k++) {
    const a = boundary[k], b = boundary[(k + 1) % boundary.length];
    const minX = Math.max(0, Math.ceil(Math.min(a[0], b[0]) - radius - 0.5));
    const maxX = Math.min(F.viewport.width - 1, Math.floor(Math.max(a[0], b[0]) + radius - 0.5));
    const minY = Math.max(0, Math.ceil(Math.min(a[1], b[1]) - radius - 0.5));
    const maxY = Math.min(F.viewport.height - 1, Math.floor(Math.max(a[1], b[1]) + radius - 0.5));
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const index = y * F.viewport.width + x;
      if (!band[index] && clipDistance([x + 0.5, y + 0.5], a, b) <= radius) band[index] = 1;
    }
  }
  return band;
}

type ProofState = ReturnType<typeof transformMetadata> & {
  state: string; physicalPoseId: number; sourcePoseId: number;
  [field: string]: unknown;
};
interface ProofResult {
  form: string;
  states: ProofState[];
  requestedRows: number;
  actualDepthYawStateCount: number;
  uniquePhysicalPoseCount: number;
  uniqueSourcePoseCount: number;
  transformKinds: string[];
  depthYawRequirement: boolean;
}

function screen(p: ClipPoint): ClipPoint { return [(p[0] - F.viewport.minX) * F.viewport.scale, (F.viewport.maxY - p[1]) * F.viewport.scale]; }

export function proveAlphaClipBuild(dir: string, form: AlphaClipForm, build = join(dir, 'build')): ProofResult {
  const skeleton = join(build, 'skeleton.json'), atlas = join(build, 'skeleton.atlas');
  const { data, pages } = loadPosable(skeleton, atlas, build), choice = candidatePosers(data, skeleton, atlas, undefined);
  assert(choice.core !== null, `core poser absent: ${choice.why}`);
  const input = compile({ rigPath: join(dir, 'rig.json'), motionPath: join(dir, 'motion.json'), imagesDir: dir, outDir: build });
  const report = input.alphaClips?.[0]; assert(report !== undefined, 'no generated clip report');
  const plate = readPlate(join(dir, 'aperture.png')), alpha = new Uint8Array(F.width * F.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = plate.data[4 * i + 3];
  const mask: AlphaMask = { width: F.width, height: F.height, alpha };
  const raw = traceAlphaOutline(mask, F.threshold).outline;
  const dense = raw.flatMap((p, i) => {
    const q = raw[(i + 1) % raw.length], n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / ALPHA_CLIP_BOUNDS.contourProbeStep));
    return Array.from({ length: n }, (_, j): ClipPoint => [(p[0] + (q[0] - p[0]) * j / n) / F.width, (p[1] + (q[1] - p[1]) * j / n) / F.height]);
  });
  const sourceModel = input.model.skins.find((s) => s.name === 'default')!.attachments.aperture.aperture;
  let uvs: number[], triangles: number[];
  let base = sourceModel;
  if (base.kind === 'linkedmesh') { const link = base; base = input.model.skins.find((s) => s.name === link.skin)!.attachments[link.slot][link.source]; }
  if (base.kind === 'mesh') { uvs = base.uvs; triangles = base.triangles; }
  else { uvs = [0, 1, 0, 0, 1, 0, 1, 1]; triangles = [0, 1, 2, 2, 3, 0]; }
  const carriers = uvCarriers(uvs, triangles, dense.map((uv) => ({ uv })), 'independent threshold outline');
  const generatedCarriers = uvCarriers(uvs, triangles, report!.uvs.map((uv) => ({ uv })), 'generated clip source placement');
  const states: ProofState[] = [];
  const physicalPoses: number[][] = [], sourcePoses: number[][] = [];
  const motion = JSON.parse(readFileSync(join(dir, 'motion.json'), 'utf8')) as MotionSpec;
  const output = join(dir, 'proof'); mkdirSync(output, { recursive: true });
  const text = readFileSync(skeleton, 'utf8');
  for (const state of ALPHA_CLIP_STATES) {
    const opts = { geometry: true, texture: true };
    const official = sampleAnimation(choice.spine, state.name, F.fps, opts)[F.sampleIndex];
    const own = sampleAnimation(choice.core as Poser, state.name, F.fps, opts)[F.sampleIndex];
    const actual = renderFrame(official, pages, F.viewport, F.background), core = renderFrame(own, pages, F.viewport, F.background);
    const parity = difference(actual, core); assert(parity.differing === 0, `${form}/${state.name}: core/runtime pixels differ: ${JSON.stringify(parity)}`);
    const uncut = sampleAnimation(choice.spine, state.name, F.fps, { ...opts, unclipped: true })[F.sampleIndex];
    const source = uncut.pieces.find((p) => p.slot === 'aperture'), pupil = uncut.pieces.find((p) => p.slot === 'pupil');
    assert(source !== undefined && pupil !== undefined, 'source/content pieces absent');
    assert(source!.world.every((v) => Number.isFinite(v) && Math.abs(v) <= ALPHA_CLIP_BOUNDS.coordinateMagnitude), 'actual source mapping exceeds frozen rounding magnitude bound');
    const content = renderFrame({ ...uncut, pieces: [pupil!] }, pages, F.viewport, F.background);
    const alphaMask = maskImage(source!, pages, false);
    const thresholdMask = maskImage(source!, pages, true);
    const alphaReference = masked(content, alphaMask);
    const thresholdReference = masked(content, thresholdMask);
    const soft = difference(actual, alphaReference), simplification = difference(actual, thresholdReference), quantization = difference(thresholdReference, alphaReference);
    assert(difference(actual, content).differing > 0, `${state.name}: clipping did not remove any content`);
    const clip = clipWorld(data, state.name); assert(clip.end === 'pupil', `clip ends at ${clip.end}, required pupil`);
    const expected = generatedCarriers.map((c) => mapped(c, source!.world));
    const jacobian = sourceJacobian(source!, uvs, triangles);
    const boundary = carriers.map((carrier) => mapped(carrier, source!.world));
    const sourceCheck = sourceBoundaryCheck(expected, boundary, clip.polygon, jacobian);
    assert(sourceCheck.accepted, `${state.name}: independent source-boundary check rejected: ${JSON.stringify(sourceCheck)}`);
    const { projectionError, rounding, boundaryError, boundaryLimit } = sourceCheck;
    const metadata = transformMetadata(motion, state.name, state.yaw);
    const physicalPoseId = poseIdentity(physicalPoses, [...source!.world, ...pupil!.world, ...clip.polygon.flat()]);
    const sourcePoseId = poseIdentity(sourcePoses, [...source!.world]);
    const sampleRemainder = jacobian * ALPHA_CLIP_BOUNDS.contourProbeStep / 2;
    const bandPx = F.viewport.scale * (jacobian * (F.tolerance + ALPHA_CLIP_BOUNDS.filterSourceRadius) + rounding + sampleRemainder);
    const boundaryScreen = boundary.map(screen);
    // Different quad/triangle inverse maps may straddle one byte rounding tie.
    // Bound the input sample perturbation from actual inverse-map conditioning;
    // report differences <=that quantization envelope separately, never call them exact parity.
    const contentEnvelope = contentRoundingEnvelope(pupil!, pages);
    const quantizationEnvelope = contentEnvelope.bytes;
    assert(Number.isFinite(quantizationEnvelope) && quantizationEnvelope >= 0 && quantizationEnvelope < 255,
      `${state.name}: content byte envelope ${quantizationEnvelope} cannot provide a nonvacuous byte comparison`);
    const band = boundaryBand(boundaryScreen, bandPx);
    let outsideBand = 0, outsideBandRoundingOnly = 0;
    let outsideBandPopulation = 0, outsideBandInsideAperture = 0, outsideBandOutsideAperture = 0;
    let apertureInsidePopulation = 0, apertureOutsidePopulation = 0;
    for (let y = 0; y < actual.height; y++) for (let x = 0; x < actual.width; x++) {
      const pixel = y * actual.width + x, i = 4 * pixel;
      const inside = thresholdMask.data[i + 3] >= F.threshold;
      if (inside) apertureInsidePopulation++; else apertureOutsidePopulation++;
      if (band[pixel]) continue;
      outsideBandPopulation++;
      if (inside) outsideBandInsideAperture++; else outsideBandOutsideAperture++;
      const delta = Math.max(...actual.data.slice(i, i + 4).map((value, channel) =>
        Math.abs(value - thresholdReference.data[i + channel])));
      if (delta > quantizationEnvelope) outsideBand++;
      else if (delta > 0) outsideBandRoundingOnly++;
    }
    assert(outsideBandPopulation > 0, `${state.name}: outside-band comparison has no pixels`);
    assert(apertureInsidePopulation === 0 || outsideBandInsideAperture > 0,
      `${state.name}: aperture interior exists but no interior pixels are outside the band`);
    assert(apertureOutsidePopulation === 0 || outsideBandOutsideAperture > 0,
      `${state.name}: aperture exterior exists but no exterior pixels are outside the band`);
    assert(outsideBand === 0, `${state.name}: ${outsideBand} violations outside band ${bandPx}px`);
    let shiftedControl: Record<string, unknown> | null = null;
    if ((form === 'grid' || form === 'contour') && state.name === ALPHA_CLIP_STATES[0].name) {
      // Deliberately wrong, private negative artifact. Both existing posers load
      // the same shifted binding; the unchanged positive source checker must reject it.
      const mutantRoot = join(output, `shifted-${state.name}`), mutantBuild = join(mutantRoot, 'build');
      mkdirSync(mutantBuild, { recursive: true });
      const mutantSkeleton = JSON.parse(text) as {
        skins: Array<{ name: string; attachments: Record<string, Record<string, { vertices: number[] }>> }>;
      };
      const run = mutantSkeleton.skins.find((skin) => skin.name === 'default')!.attachments.clip.clip.vertices;
      for (let cursor = 0; cursor < run.length;) {
        const influences = run[cursor++];
        for (let k = 0; k < influences; k++, cursor += 4) run[cursor + 1] = Math.fround(run[cursor + 1] + 2);
      }
      const mutantModel = structuredClone(input.model);
      const record = mutantModel.skins.find((skin) => skin.name === 'default')!.attachments.clip.clip;
      assert(record.kind === 'clipping' && record.vertices.weighted, 'shifted fixture requires named weighted clip');
      if (record.kind !== 'clipping' || !record.vertices.weighted) throw new Error('shifted clip is not weighted');
      for (const vertex of record.vertices.bindings) for (const binding of vertex) binding.x = Math.fround(binding.x + 2);
      const mutantText = JSON.stringify(mutantSkeleton, null, 2) + '\n';
      const mutantAtlas = readFileSync(atlas, 'utf8');
      const mutantModelText = modelDocument(mutantModel, mutantText, mutantAtlas);
      const mutantPath = join(mutantBuild, 'skeleton.json'), mutantAtlasPath = join(mutantBuild, 'skeleton.atlas');
      writeFileSync(mutantPath, mutantText);
      writeFileSync(mutantAtlasPath, mutantAtlas);
      writeFileSync(join(mutantBuild, 'skeleton.model.json'), mutantModelText);
      for (const [name, page] of pages) {
        const destination = resolve(mutantBuild, name);
        assert(destination.startsWith(mutantRoot + '/'), 'shifted negative page escapes its private fixture');
        mkdirSync(resolve(destination, '..'), { recursive: true });
        page.writePng(destination);
      }
      const loaded = loadPosable(mutantPath, mutantAtlasPath, mutantBuild);
      const mutantChoice = candidatePosers(loaded.data, mutantPath, mutantAtlasPath, undefined);
      assert(mutantChoice.core !== null, `shifted artifact core poser absent: ${mutantChoice.why}`);
      const wrongOfficial = renderFrame(sampleAnimation(mutantChoice.spine, state.name, F.fps, opts)[0], loaded.pages, F.viewport, F.background);
      const wrongCore = renderFrame(sampleAnimation(mutantChoice.core!, state.name, F.fps, opts)[0], loaded.pages, F.viewport, F.background);
      const wrongParity = difference(wrongOfficial, wrongCore);
      assert(wrongParity.differing === 0, `shifted artifact renderers disagree: ${JSON.stringify(wrongParity)}`);
      const changed = difference(actual, wrongOfficial);
      assert(changed.differing > 0, 'actual shifted binding did not change rendered pixels');
      const wrongPolygon = clipWorld(loaded.data, state.name).polygon;
      const rejected = sourceBoundaryCheck(expected, boundary, wrongPolygon, jacobian);
      assert(!rejected.accepted && rejected.rejections.includes('source-to-clip projection bound'),
        'same positive source-boundary projection predicate did not reject the actual shifted artifact');
      wrongOfficial.writePng(join(mutantRoot, 'spine.png'));
      wrongCore.writePng(join(mutantRoot, 'core.png'));
      shiftedControl = {
        state: state.name, bindingShift: [2, 0], wrongParity, changed, sourceCheck: rejected,
        skeletonSha256: sha(mutantText), modelSha256: sha(mutantModelText),
        artifact: mutantRoot, boundary: 'private deliberately wrong binding; ordinary product emit path unchanged',
      };
      writeFileSync(join(mutantRoot, 'result.json'), JSON.stringify(shiftedControl, null, 2) + '\n');
    }
    const clipBone = input.model.bones.find((b) => b.name === 'clip_bone')!;
    assert(clipBone.x !== input.model.bones.find((b) => b.name === 'head')!.x, 'distinct source/clip-bone control collapsed');
    const misbound = JSON.parse(text) as { bones: Array<{ name: string }>; skins: Array<{ name: string; attachments: Record<string, Record<string, { vertices: number[] }>> }> };
    const badRun = misbound.skins.find((skin) => skin.name === 'default')!.attachments.clip.clip.vertices;
    const badBone = misbound.bones.findIndex((bone) => bone.name === 'clip_bone');
    for (let cursor = 0; cursor < badRun.length;) { const influences = badRun[cursor++]; for (let k = 0; k < influences; k++, cursor += 4) badRun[cursor] = badBone; }
    const badBinding = posableFromText(JSON.stringify(misbound), readFileSync(atlas, 'utf8'), build);
    const wrongClip = clipWorld(badBinding.data, state.name).polygon;
    const wrongBindingCheck = sourceBoundaryCheck(expected, boundary, wrongClip, jacobian);
    const wrongBindingError = wrongBindingCheck.projectionError;
    assert(!wrongBindingCheck.accepted, 'wrong source-bone binding did not fail the same independent source checker');
    if (form === 'grid' || form === 'contour') {
      const noDepth = JSON.parse(text) as { animations: Record<string, { attachments?: Record<string, Record<string, Record<string, unknown>>> }> };
      const track = noDepth.animations[state.name].attachments?.default?.clip;
      assert(track !== undefined, 'clip deform track missing'); delete track!.clip;
      const mutant = posableFromText(JSON.stringify(noDepth), readFileSync(atlas, 'utf8'), build);
      const bad = renderFrame(sampleAnimation(mutant.data, state.name, F.fps)[0], mutant.pages, F.viewport, F.background);
      assert(difference(actual, bad).differing > 0, `${state.name}: omitted depth motion was invisible`);
    }
    for (const [name, image] of [['polygon', actual], ['alpha', alphaReference], ['threshold', thresholdReference]] as const) image.writePng(join(output, `${state.name}-${name}.png`));
    states.push({ state: state.name, ...metadata, physicalPoseId, sourcePoseId, gaze: [state.dx, state.dy], comparedPixels: actual.width * actual.height, parity, soft, simplification, quantization, projectionError, rounding, boundaryError, boundaryLimit, boundaryUpperBound: boundaryError + sampleRemainder, boundaryUpperLimit: boundaryLimit + sampleRemainder, sampleRemainder, jacobian, bandPx, quantizationEnvelope, contentEnvelope, outsideBand, outsideBandRoundingOnly, outsideBandPopulation, outsideBandInsideAperture, outsideBandOutsideAperture, apertureInsidePopulation, apertureOutsidePopulation, wrongBindingError, wrongBindingCheck, sourceCheck, unclippedChanged: difference(actual, content).differing, shiftedControl, rgbaSha256: sha(actual.data) });
  }
  assert(states.length === 8, `required 8 state rows, got ${states.length}`);
  const depthYawRequirement = form === 'grid' || form === 'contour';
  const actualDepthYawStateCount = states.filter((row) => row.depthYawApplied).length;
  const uniquePhysicalPoseCount = physicalPoses.length, uniqueSourcePoseCount = sourcePoses.length;
  if (depthYawRequirement) {
    assert(actualDepthYawStateCount === 8 && uniquePhysicalPoseCount === 8 && uniqueSourcePoseCount >= 2,
      `${form}: required eight actual gaze/depth-yaw states and distinct yaw source poses, got ${actualDepthYawStateCount}/${uniquePhysicalPoseCount}/${uniqueSourcePoseCount}`);
  }
  const result: ProofResult = {
    form, states, requestedRows: states.length, actualDepthYawStateCount, uniquePhysicalPoseCount,
    uniqueSourcePoseCount, transformKinds: [...new Set(states.map((row) => row.transformKind))], depthYawRequirement,
  };
  writeFileSync(join(output, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  return result;
}

export function buildAlphaClipProof(root: string, form: AlphaClipForm): ReturnType<typeof proveAlphaClipBuild> {
  const dir = join(root, form), opts = writeAlphaClipFixture(dir, form);
  const child = spawnSync(process.execPath, [join(import.meta.dir, '..', 'cli.ts'), 'build', '--rig', opts.rigPath, '--motion', opts.motionPath, '--images', dir, '--out', opts.outDir], { encoding: 'utf8' });
  writeFileSync(join(dir, 'build.log'), (child.stdout ?? '') + (child.stderr ?? ''));
  assert(child.status === 0, `${form}: gated build exited ${child.status}: ${child.stderr}`);
  assert(existsSync(join(opts.outDir, 'skeleton.json')), `${form}: no gated artifact`);
  return proveAlphaClipBuild(dir, form);
}
/** Read an actual editor export separately from parser/stub controls. */
export function compareAlphaClipEditor(dir: string, exported: string, out: string): void {
  const build = join(dir, 'build'), atlas = readFileSync(join(build, 'skeleton.atlas'), 'utf8');
  const original = posableFromText(readFileSync(join(build, 'skeleton.json'), 'utf8'), atlas, build);
  const after = posableFromText(readFileSync(exported, 'utf8'), atlas, build);
  const motion = JSON.parse(readFileSync(join(dir, 'motion.json'), 'utf8')) as MotionSpec;
  const rows = ALPHA_CLIP_STATES.map((state) => {
    const before = renderFrame(sampleAnimation(original.data, state.name, F.fps)[0], original.pages, F.viewport, F.background);
    const image = renderFrame(sampleAnimation(after.data, state.name, F.fps)[0], after.pages, F.viewport, F.background);
    const pixels = difference(before, image), a = clipWorld(original.data, state.name), b = clipWorld(after.data, state.name);
    assert(a.end === b.end && b.end === 'pupil', 'editor changed clipping end');
    assert(a.polygon.length === b.polygon.length, 'editor changed clipping vertex count');
    const posedBoundaryError = Math.max(...a.polygon.map((p, i) => Math.hypot(p[0] - b.polygon[i][0], p[1] - b.polygon[i][1])));
    assert(pixels.differing === 0 && posedBoundaryError <= clipRoundingWorld(), `editor changed ${state.name}: ${JSON.stringify({ pixels, posedBoundaryError })}`);
    return { state: state.name, ...transformMetadata(motion, state.name, state.yaw), compared: 1, comparedPixels: image.width * image.height, pixels, posedBoundaryError, end: b.end, vertexCount: b.polygon.length };
  });
  // Named influence identity is checked independently of world-position coincidence.
  const influenceNames = (data: SkeletonData): string[][] => {
    const skeleton = new Skeleton(data), attachment = skeleton.findSlot('clip')!.appliedPose.attachment;
    assert(attachment instanceof ClippingAttachment, 'editor lost clip');
    const att = attachment as ClippingAttachment, bones = att.bones;
    if (!bones) return Array.from({ length: att.worldVerticesLength / 2 }, () => ['clip_bone']);
    const names: string[][] = [];
    for (let cursor = 0; cursor < bones.length;) { const n = bones[cursor++]; names.push(Array.from({ length: n }, () => data.bones[bones[cursor++]].name).sort()); }
    return names;
  };
  assert(JSON.stringify(influenceNames(original.data)) === JSON.stringify(influenceNames(after.data)), 'editor changed named clipping bindings');
  writeFileSync(out, JSON.stringify({ exportSha256: sha(readFileSync(exported)), states: rows }, null, 2) + '\n');
}
if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.length === 4 && args[0] === '--editor-export') { compareAlphaClipEditor(resolve(args[1]), resolve(args[2]), resolve(args[3])); process.exit(0); }
  assert(args.length === 2 && args[0] === '--out', 'usage: bun tools/alpha_clip_proof.ts --out <private evidence root>');
  const root = resolve(args[1]); mkdirSync(root, { recursive: true });
  const results = (['region', 'grid', 'contour', 'authored', 'linked'] as AlphaClipForm[]).map((form) => buildAlphaClipProof(root, form));
  writeFileSync(join(root, 'result.json'), JSON.stringify({ fixture: F, bounds: ALPHA_CLIP_BOUNDS, actualDepthYawStateCount: results.reduce((n, r) => n + r.actualDepthYawStateCount, 0), results }, null, 2) + '\n');
  console.log(`alpha clip proof: ${results.length} forms, ${results.reduce((n, r) => n + r.requestedRows, 0)} requested rows; ${results.reduce((n, r) => n + r.actualDepthYawStateCount, 0)} actual depth-yaw state rows; per-form unique physical poses ${results.map((r) => `${r.form}=${r.uniquePhysicalPoseCount}`).join(', ')}`);
}
