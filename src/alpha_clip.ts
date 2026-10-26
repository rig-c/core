/** Alpha-outline geometry and UV carriers, independent of emitters and posers. */
import { CompileError } from './errors.ts';
import {
  earClip, findSelfIntersection, traceAlphaOutline, simplifyClosedPolygon,
  measureAuthoredMeshFit, rasteriseTriangles, MeshError, type AlphaMask,
} from './mesh.ts';
import { uvCarriers, CONTAINS, type Carrier } from './meshcarriers.ts';
import { hypot2 } from './numeric.ts';
import type { RigAlphaClip } from './rig.ts';
import type { AlphaClipReport } from './types.ts';

export type ClipPoint = [number, number];
const cross = (a: ClipPoint, b: ClipPoint): number => a[0] * b[1] - a[1] * b[0];
const sub = (a: ClipPoint, b: ClipPoint): ClipPoint => [a[0] - b[0], a[1] - b[1]];

export function clipDistance(p: readonly number[], a: readonly number[], b: readonly number[]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length2 = dx * dx + dy * dy;
  const projection = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (length2 || 1);
  const t = Math.max(0, Math.min(1, projection));
  return hypot2(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** Neighbour degeneracies are not covered by the nonadjacent intersection check. */
export function refuseClipDegeneracy(points: ClipPoint[], where: string): void {
  if (points.length < 3) {
    throw new CompileError(
      `${where}: clipping has ${points.length} vertices; required >=3 after final coordinate rounding.`,
      'CE_COMPILE_ALPHA_CLIP_TOPOLOGY',
    );
  }
  let area2 = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const c = points[(i + 2) % points.length];
    if (!a.every(Number.isFinite) || (a[0] === b[0] && a[1] === b[1])) {
      throw new CompileError(
        `${where}: adjacent clipping vertices ${i} and ${(i + 1) % points.length} are ` +
          `[${a}] and [${b}]; required finite distinct neighbours after final coordinate rounding. ` +
          'Lower the source coordinate magnitude or simplify the outline.',
        'CE_COMPILE_ALPHA_CLIP_TOPOLOGY',
      );
    }
    const incoming = sub(b, a);
    const outgoing = sub(c, b);
    if (cross(incoming, outgoing) === 0 && incoming[0] * outgoing[0] + incoming[1] * outgoing[1] < 0) {
      throw new CompileError(
        `${where}: adjacent edges ${i} and ${(i + 1) % points.length} fold back after rounding; ` +
          'required a nondegenerate simple clipping boundary.',
        'CE_COMPILE_ALPHA_CLIP_TOPOLOGY',
      );
    }
    area2 += cross(a, b);
  }
  if (area2 === 0) {
    throw new CompileError(
      `${where}: clipping doubled area is ${area2} after coordinate rounding; required nonzero area.`,
      'CE_COMPILE_ALPHA_CLIP_TOPOLOGY',
    );
  }
}

/** Check simplifier output and mapped source-triangle crossings before emission. */
export function refuseClipCrossing(points: ClipPoint[], where: string): void {
  const crossing = findSelfIntersection(points);
  if (crossing) {
    throw new CompileError(
      `${where}: selfintersectionaftersimplification: edges ${crossing[0]} and ${crossing[1]} ` +
        'intersect; required one simple outline. Lower tolerance or repair the source topology.',
      'CE_COMPILE_ALPHA_CLIP_SELF_INTERSECTION',
    );
  }
}

type OutlineReport = Omit<AlphaClipReport, 'target' | 'source' | 'vertices' | 'uvs' | 'maxBindingDeviationWorld'>;

export function alphaClipOutline(
  mask: AlphaMask,
  spec: RigAlphaClip,
  where: string,
  pageScale = 1,
): { points: ClipPoint[]; report: OutlineReport } {
  if (!Number.isInteger(spec.alpha) || spec.alpha < 1 || spec.alpha > 255) {
    throw new CompileError(
      `${where}: alphaClip.alpha is ${String(spec.alpha)}; required an integer in 1..255. Declare the threshold.`,
      'CE_COMPILE_ALPHA_CLIP_PARAMETERS',
    );
  }
  if (!Number.isFinite(spec.tolerance) || spec.tolerance <= 0 || !Number.isFinite(pageScale) || pageScale <= 0) {
    throw new CompileError(
      `${where}: alphaClip.tolerance=${String(spec.tolerance)}, page scale=${pageScale}; ` +
        'required finite positive drawing-pixel tolerance and page scale.',
      'CE_COMPILE_ALPHA_CLIP_PARAMETERS',
    );
  }
  if (!Number.isInteger(spec.maxVertices) || spec.maxVertices < 3) {
    throw new CompileError(
      `${where}: alphaClip.maxVertices is ${String(spec.maxVertices)}; required an integer >=3. ` +
        'Declare the complete mapped polygon budget.',
      'CE_COMPILE_ALPHA_CLIP_PARAMETERS',
    );
  }
  let below = 0;
  let above = 0;
  for (const alpha of mask.alpha) {
    if (alpha < spec.alpha) below++;
    else above++;
  }
  if (above === 0 || below === 0) {
    throw new CompileError(
      `${where}: slotwithnoalpha: ${above} of ${mask.width * mask.height} pixels reach alpha ${spec.alpha}; ` +
        'required a nonempty silhouette with transparent exterior. Supply alpha art or declare a threshold that measures a silhouette.',
      'CE_COMPILE_ALPHA_CLIP_NO_ALPHA',
    );
  }
  let traced: ReturnType<typeof traceAlphaOutline>;
  try {
    traced = traceAlphaOutline(mask, spec.alpha);
  } catch (error) {
    if (!(error instanceof MeshError)) throw error;
    throw new CompileError(
      `${where}: alpha outline cannot be represented: ${error.message}; required one simple connected outline.`,
      'CE_COMPILE_ALPHA_CLIP_TOPOLOGY',
    );
  }
  if (traced.islands !== 1 || traced.holePixels !== 0) {
    throw new CompileError(
      `${where}: alpha ${spec.alpha} has ${traced.islands} islands and ${traced.holePixels} hole pixels; ` +
        'required one island without holes. Separate the source or author clipping geometry.',
      'CE_COMPILE_ALPHA_CLIP_TOPOLOGY',
    );
  }
  const points = simplifyClosedPolygon(traced.outline, spec.tolerance * pageScale);
  refuseClipCrossing(points, where);
  refuseClipDegeneracy(points, where);
  const triangles = clipTrianglesOf(points);
  const fit = measureAuthoredMeshFit(mask, spec.alpha, points, triangles);
  let maxTraceDeviation = 0;
  for (const point of traced.outline) {
    const distance = Math.min(...points.map((a, i) => clipDistance(point, a, points[(i + 1) % points.length])));
    maxTraceDeviation = Math.max(maxTraceDeviation, distance);
  }
  const filled = rasteriseTriangles(points, triangles, mask.width, mask.height).reduce((sum, bit) => sum + bit, 0);
  return {
    points,
    report: {
      alpha: spec.alpha,
      tolerance: spec.tolerance,
      maxVertices: spec.maxVertices,
      tracedVertices: traced.outline.length,
      simplifiedVertices: points.length,
      artPixels: fit.artPixels,
      coveredArt: fit.coveredArt,
      coverage: fit.coverage,
      falsePositive: filled - fit.coveredArt,
      falseNegative: fit.artPixels - fit.coveredArt,
      maxTraceDeviation: maxTraceDeviation / pageScale,
      overshoot: fit.overshoot / pageScale,
    },
  };
}

export function clipTrianglesOf(points: ClipPoint[]): number[] {
  return earClip(points);
}

/** Offline cell/reference reading, not a runtime alpha-mask feature. */
export function clipContains(points: readonly (readonly number[])[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i];
    const b = points[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function carriersOf(
  points: ClipPoint[], uvs: readonly number[], triangles: readonly number[], where: string,
): Array<Carrier | null> {
  try {
    return uvCarriers(uvs, triangles, points.map((uv) => ({ uv })), where);
  } catch (error) {
    throw new CompileError(
      `${where}: source UV carrier is ambiguous: ${error instanceof Error ? error.message : String(error)}; ` +
        'required unique source geometry. Repair overlapping UV triangles.',
      'CE_COMPILE_ALPHA_CLIP_CARRIER',
    );
  }
}

/** Split BEFORE mapping: an edge across source triangles is piecewise affine, not one chord. */
export function clipCarriers(
  ring: ClipPoint[], uvs: readonly number[], triangles: readonly number[], where: string,
): { points: ClipPoint[]; carriers: Carrier[] } {
  const edges = new Map<string, [number, number]>();
  for (let i = 0; i < triangles.length; i += 3) {
    const triplet = triangles.slice(i, i + 3);
    for (const [a, b] of [[triplet[0], triplet[1]], [triplet[1], triplet[2]], [triplet[2], triplet[0]]]) {
      edges.set(`${Math.min(a, b)}/${Math.max(a, b)}`, [a, b]);
    }
  }
  const points: ClipPoint[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const direction = sub(b, a);
    const cuts = [0];
    for (const [v, w] of edges.values()) {
      const c: ClipPoint = [uvs[2 * v], uvs[2 * v + 1]];
      const e: ClipPoint = [uvs[2 * w], uvs[2 * w + 1]];
      const edge = sub(e, c);
      const denominator = cross(direction, edge);
      if (denominator === 0) continue;
      const t = cross(sub(c, a), edge) / denominator;
      const u = cross(sub(c, a), direction) / denominator;
      if (t > CONTAINS && t < 1 - CONTAINS && u >= -CONTAINS && u <= 1 + CONTAINS) cuts.push(t);
    }
    cuts.sort((x, y) => x - y);
    for (let k = 0; k < cuts.length; k++) {
      if (k === 0 || cuts[k] - cuts[k - 1] > CONTAINS) {
        points.push([a[0] + cuts[k] * direction[0], a[1] + cuts[k] * direction[1]]);
      }
    }
  }
  const carriers = carriersOf(points, uvs, triangles, where);
  const missing = carriers.findIndex((carrier) => carrier === null);
  if (missing >= 0) {
    throw new CompileError(
      `${where}: source has no UV carrier for outline vertex ${missing} at [${points[missing]}]; ` +
        'required coverage of the complete clipping outline. Extend the source geometry or lower tolerance.',
      'CE_COMPILE_ALPHA_CLIP_CARRIER',
    );
  }
  // Endpoints can all be carried while an edge bridges a missing strip. Since all
  // triangle-edge crossings partition the ring, a unique open midpoint identifies
  // the actual affine source map throughout that entire open segment.
  const midpoints = points.map((a, i): ClipPoint => {
    const b = points[(i + 1) % points.length];
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  });
  const intervals = carriersOf(midpoints, uvs, triangles, `${where} open outline intervals`);
  const gap = intervals.findIndex((carrier) => carrier === null);
  if (gap >= 0) {
    throw new CompileError(
      `${where}: outline interval ${gap} from [${points[gap]}] to [${points[(gap + 1) % points.length]}] ` +
        `has no source UV carrier at open midpoint [${midpoints[gap]}]; required complete interval coverage. ` +
        'Fill the source UV gap; carried endpoints cannot authorize a bridge.',
      'CE_COMPILE_ALPHA_CLIP_CARRIER',
    );
  }
  return { points, carriers: carriers as Carrier[] };
}
