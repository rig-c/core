/** Geometry-only observations for a dial; no assertion or acceptance threshold. */
export type FitKind = 'affine' | 'homography';
export interface MotionFit {
  status: 'READ' | 'SKIP'; reason: string; method: string;
  vertices: number; motionRms: number | null; rms: number | null; ratio: number | null;
  /** Observed minus fitted positions, world x/y; used by the residual picture. */
  residuals: number[];
}
export interface ParallaxMesh {
  slot: string; attachment: string; kind: 'mesh' | 'region'; vertices: number[];
  /** Only actual per-vertex declarations, never inferred from motion or a depth range. */
  depths?: number[];
  /** Runtime source identity, deliberately excluded from serialized readings. */
  identity?: object;
}
export interface DialSample { value: number; meshes: ParallaxMesh[] }
const method = (kind: FitKind): string => kind === 'affine'
  ? 'per-sample forward geometric least squares, centered isotropic coordinates, reorthogonalized QR'
  : 'per-sample normalized inhomogeneous linear initializer and affine initializer, forward geometric LM refinement (80 iterations each); lowest finite objective found, not certified global optimum';
/** Scaled sum of squares avoids intermediate over/underflow using only reproducible arithmetic. */
const norm = (a: readonly number[]): number => {
  const scale = a.reduce((largest, v) => Math.max(largest, Math.abs(v)), 0);
  if (scale === 0) return 0;
  return scale * Math.sqrt(a.reduce((sum, v) => { const r = v / scale; return sum + r * r; }, 0));
};
const rms = (a: readonly number[]): number => norm(a) / Math.sqrt(a.length / 2);

/** Tiny full-column-rank least squares; twice-reorthogonalized QR, no normal-equation initializer. */
function leastSquares(rows: number[][], rhs: number[]): number[] | null {
  const n = rows[0]?.length ?? 0;
  if (n === 0 || rows.length < n) return null;
  const q: number[][] = [], r: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let j = 0; j < n; j++) {
    const v = rows.map((row) => row[j]);
    const original = norm(v);
    for (let pass = 0; pass < 2; pass++) for (let k = 0; k < j; k++) {
      const dot = q[k].reduce((s, a, i) => s + a * v[i], 0);
      r[k][j] += dot;
      for (let i = 0; i < v.length; i++) v[i] -= dot * q[k][i];
    }
    r[j][j] = norm(v);
    if (r[j][j] <= 1e-10 * Math.max(1, original)) return null;
    q.push(v.map((a) => a / r[j][j]));
  }
  const x = q.map((v) => v.reduce((s, a, i) => s + a * rhs[i], 0));
  for (let j = n - 1; j >= 0; j--) {
    for (let k = j + 1; k < n; k++) x[j] -= r[j][k] * x[k];
    x[j] /= r[j][j];
  }
  return x.every(Number.isFinite) ? x : null;
}
function normalized(a: readonly number[]): { points: number[]; scale: number } | null {
  const n = a.length / 2, x0 = a[0], y0 = a[1];
  const cx = a.reduce((s, v, i) => s + (i % 2 ? 0 : (v - x0) / n), 0) + x0;
  const cy = a.reduce((s, v, i) => s + (i % 2 ? (v - y0) / n : 0), 0) + y0;
  const centered = a.map((v, i) => v - (i % 2 ? cy : cx));
  const scale = rms(centered);
  return Number.isFinite(scale) && scale > 0 ? { points: centered.map((v) => v / scale), scale } : null;
}
function predict(h: number[], x: number, y: number): [number, number] | null {
  const den = 1 + h[6] * x + h[7] * y;
  if (Math.abs(den) < 1e-9 || !Number.isFinite(den)) return null;
  const out: [number, number] = [(h[0] * x + h[1] * y + h[2]) / den, (h[3] * x + h[4] * y + h[5]) / den];
  return out.every(Number.isFinite) ? out : null;
}
function errors(h: number[], p: number[], t: number[]): number[] | null {
  const out: number[] = [];
  for (let i = 0; i < p.length; i += 2) {
    const got = predict(h, p[i], p[i + 1]);
    if (got === null) return null;
    out.push(t[i] - got[0], t[i + 1] - got[1]);
  }
  return out;
}
const sse = (a: number[]): number => a.reduce((s, v) => s + v * v, 0);
/** LM minimizes actual forward x/y distances, rather than the initializer's algebraic objective. */
function refine(start: number[], p: number[], t: number[]): number[] {
  let h = [...start], lambda = 1e-4;
  for (let iteration = 0; iteration < 80; iteration++) {
    const e = errors(h, p, t);
    if (e === null) break;
    const rows: number[][] = [];
    for (let i = 0; i < p.length; i += 2) {
      const x = p[i], y = p[i + 1], den = 1 + h[6] * x + h[7] * y;
      const got = predict(h, x, y)!;
      rows.push([x / den, y / den, 1 / den, 0, 0, 0, -got[0] * x / den, -got[0] * y / den]);
      rows.push([0, 0, 0, x / den, y / den, 1 / den, -got[1] * x / den, -got[1] * y / den]);
    }
    // Damped least squares as an augmented QR problem; numerical failures never become a score.
    const rhs = [...e];
    for (let j = 0; j < 8; j++) {
      rows.push(Array.from({ length: 8 }, (_, k) => k === j ? Math.sqrt(lambda) : 0)); rhs.push(0);
    }
    const step = leastSquares(rows, rhs);
    if (step === null) break;
    const candidate = h.map((v, i) => v + step[i]);
    const next = errors(candidate, p, t);
    if (next !== null && sse(next) < sse(e)) {
      h = candidate; lambda = Math.max(1e-12, lambda / 3);
      if (norm(step) < 1e-12) break;
    } else { lambda *= 10; if (lambda > 1e12) break; }
  }
  return h;
}
export function fitMotion(source: readonly number[], target: readonly number[], kind: FitKind): MotionFit {
  const result: MotionFit = { status: 'SKIP', reason: '', method: method(kind), vertices: source.length / 2, motionRms: null, rms: null, ratio: null, residuals: [] };
  const skip = (reason: string): MotionFit => ({ ...result, reason, rms: null, ratio: null, residuals: [] });
  if (source.length !== target.length || source.length % 2 || !source.length || [...source, ...target].some((v) => !Number.isFinite(v))) return skip('no comparable finite x/y vertices');
  if (source.length / 2 <= (kind === 'affine' ? 3 : 4)) return skip(`at most ${kind === 'affine' ? 3 : 4} correspondences: a saturated ${kind} fit cannot test relief`);
  const a = normalized(source), b = normalized(target);
  if (a === null || b === null) return skip('zero extent or non-finite normalization');
  const motion = rms(source.map((v, i) => target[i] - v));
  result.motionRms = motion;
  const coordinateUlp = Number.EPSILON * Math.max(...source.map(Math.abs), ...target.map(Math.abs));
  if (motion <= Math.max(a.scale * 1e-12, coordinateUlp * 16)) return skip('stationary or below coordinate resolution: RMS motion denominator unavailable');
  const p = a.points, t = b.points;
  const rows: number[][] = [], rhs: number[] = [];
  for (let i = 0; i < p.length; i += 2) {
    const x = p[i], y = p[i + 1];
    rows.push([x, y, 1, 0, 0, 0]); rhs.push(t[i]);
    rows.push([0, 0, 0, x, y, 1]); rhs.push(t[i + 1]);
  }
  const affine = leastSquares(rows, rhs);
  if (affine === null) return skip('rank deficient source geometry');
  let h = [...affine, 0, 0];
  if (kind === 'homography') {
    const projectiveRows = rows.map((row, i) => [...row, -rhs[i] * p[2 * Math.floor(i / 2)], -rhs[i] * p[2 * Math.floor(i / 2) + 1]]);
    const linear = leastSquares(projectiveRows, rhs);
    if (linear === null) return skip('rank deficient homography design');
    const starts = [h, linear].map((start) => refine(start, p, t)).filter((start) => errors(start, p, t) !== null);
    if (!starts.length) return skip('homography prediction denominator unavailable');
    h = starts.reduce((best, next) => sse(errors(next, p, t)!) < sse(errors(best, p, t)!) ? next : best);
  }
  const det = h[0] * (h[4] - h[5] * h[7]) - h[1] * (h[3] - h[5] * h[6]) + h[2] * (h[3] * h[7] - h[4] * h[6]);
  if (Math.abs(det) < 1e-10) return skip('singular fitted map');
  const e = errors(h, p, t);
  if (e === null) return skip('fitted map has unavailable prediction denominator');
  result.residuals = e.map((v) => v * b.scale);
  result.rms = rms(result.residuals); result.ratio = result.rms / motion;
  if (![result.rms, result.ratio].every(Number.isFinite)) return skip('non-finite geometric residual');
  return { ...result, status: 'READ', reason: 'geometry only; zero residual does not certify flatness or volume' };
}
function ranks(a: number[]): number[] {
  const sorted = a.map((value, i) => ({ value, i })).sort((a, b) => a.value - b.value);
  const out: number[] = [];
  for (let i = 0; i < sorted.length;) {
    let end = i + 1; while (end < sorted.length && sorted[end].value === sorted[i].value) end++;
    for (let k = i; k < end; k++) out[sorted[k].i] = (i + end - 1) / 2;
    i = end;
  }
  return out;
}
export function spearman(a: number[], b: number[]): number | null {
  if (a.length !== b.length || a.length < 2 || [...a, ...b].some((v) => !Number.isFinite(v))) return null;
  const x = ranks(a), y = ranks(b), mean = (a.length - 1) / 2;
  let xy = 0, xx = 0, yy = 0;
  for (let i = 0; i < x.length; i++) { const u = x[i] - mean, v = y[i] - mean; xy += u * v; xx += u * u; yy += v * v; }
  return xx > 0 && yy > 0 ? xy / Math.sqrt(xx * yy) : null;
}
function depthReading(rest: ParallaxMesh, target: ParallaxMesh, delta: number, axis?: [number, number]) {
  const skip = (reason: string) => ({ status: 'SKIP' as const, reason, spearman: null, nearTravel: null, farTravel: null, units: 'world px / dial unit' });
  const z = rest.depths;
  if (z === undefined || z.length * 2 !== rest.vertices.length || z.some((v) => !Number.isFinite(v))) return skip('declared per-vertex depth unavailable; model depth summaries are not vertex depths');
  const lo = Math.min(...z), hi = Math.max(...z);
  if (lo === hi) return skip('constant declared depth: ranks and near/far split undefined');
  if (!Number.isFinite(delta) || delta === 0) return skip('zero or unavailable dial distance from setup');
  if (axis === undefined) return skip('turn axis unavailable: a generic slider does not declare a world turn axis');
  const d = rest.vertices.map((v, i) => target.vertices[i] - v);
  const along = z.map((_, i) => d[2 * i] * axis[0] + d[2 * i + 1] * axis[1]);
  const rho = spearman(z, along);
  const travel = (near: boolean): number => {
    const indices = z.flatMap((v, i) => (near ? v === hi : v === lo) ? [i] : []);
    return Math.sqrt(indices.reduce((s, i) => s + d[2 * i] ** 2 + d[2 * i + 1] ** 2, 0) / indices.length) / Math.abs(delta);
  };
  return { status: rho === null ? 'SKIP' as const : 'READ' as const, reason: rho === null ? 'constant motion along axis: correlation undefined' : 'signed setup-to-sample projected motion; sign may reverse at opposite extremes', spearman: rho, nearTravel: travel(true), farTravel: travel(false), units: 'world px / dial unit' };
}
export function parallaxOf(dial: string, rest: ParallaxMesh[], samples: DialSample[], setupValue?: number, axis?: [number, number]) {
  const rows = samples.map((sample) => {
    const pairs = rest.map((r) => ({ r, t: sample.meshes.find((m) => m.slot === r.slot && m.attachment === r.attachment && m.kind === r.kind && (r.identity === undefined || m.identity === r.identity)) }));
    const comparable = pairs.filter((p): p is { r: ParallaxMesh; t: ParallaxMesh } => p.t !== undefined && p.t.vertices.length === p.r.vertices.length);
    const meshes = pairs.filter((p) => p.r.kind === 'mesh').map(({ r, t }) => {
      const target = t?.vertices ?? [];
      return { slot: r.slot, attachment: r.attachment, affine: fitMotion(r.vertices, target, 'affine'), homography: fitMotion(r.vertices, target, 'homography'), depth: t === undefined || target.length !== r.vertices.length ? { status: 'SKIP' as const, reason: 'attachment correspondence unavailable', spearman: null, nearTravel: null, farTravel: null, units: 'world px / dial unit' } : depthReading(r, t, sample.value - (setupValue ?? NaN), axis) };
    });
    const appearing = sample.meshes.filter((t) => !rest.some((r) => r.slot === t.slot && r.attachment === t.attachment && r.kind === t.kind));
    for (const t of appearing.filter((t) => t.kind === 'mesh')) meshes.push({
      slot: t.slot, attachment: t.attachment, affine: fitMotion([], t.vertices, 'affine'), homography: fitMotion([], t.vertices, 'homography'),
      depth: { status: 'SKIP', reason: 'no setup correspondence for appearing mesh', spearman: null, nearTravel: null, farTravel: null, units: 'world px / dial unit' },
    });
    const whole = fitMotion(comparable.flatMap((p) => p.r.vertices), comparable.flatMap((p) => p.t.vertices), 'affine');
    const centers: Array<{ slot: string; attachment: string; residual: [number, number] }> = [];
    let offset = 0;
    if (whole.status === 'READ') for (const { r } of comparable) {
      const n = r.vertices.length / 2;
      if (n > 0) centers.push({ slot: r.slot, attachment: r.attachment, residual: [0, 1].map((axis) => r.vertices.reduce((s, _, i) => s + (i % 2 === axis ? whole.residuals[offset + i] / n : 0), 0)) as [number, number] });
      offset += r.vertices.length;
    }
    const center = [0, 1].map((k) => centers.reduce((s, c) => s + c.residual[k] / centers.length, 0));
    const spread = centers.length > 1 ? Math.sqrt(centers.reduce((s, c) => s + (c.residual[0] - center[0]) ** 2 + (c.residual[1] - center[1]) ** 2, 0) / centers.length) : null;
    return { value: sample.value, meshes, layers: { status: spread === null ? 'SKIP' : 'READ', reason: spread === null ? 'need a moving full-rank whole-rig fit and at least two comparable layers' : 'unweighted RMS spread of per-layer mean residual vectors after one whole-rig affine fit; regions and meshes, including stationary layers', spread, ratio: spread === null || whole.motionRms === null ? null : spread / whole.motionRms, units: 'world px', whole, centers, omitted: [...pairs.filter((p) => !comparable.includes(p as { r: ParallaxMesh; t: ParallaxMesh })).map((p) => [p.r.slot, p.r.attachment]), ...appearing.map((t) => [t.slot, t.attachment])] } };
  });
  const hasVertices = rest.some((r) => r.vertices.length > 0);
  const measured = rows.some((s) => s.layers.status === 'READ' || s.meshes.some((m) => m.affine.status === 'READ' || m.homography.status === 'READ'));
  return { spec: 'rigc-parallax/1', dial, status: measured ? 'READ' : 'SKIP', reason: !hasVertices ? 'no vertices to fit' : measured ? 'observations only; no flatness or volume certificate' : 'no moving full-rank comparable fits on this grid', setupValue: setupValue ?? null, axis: axis ?? null,
    method: { grid: 'independent setup-to-sample position fits; never pool different dial values into one map', normalization: 'residual RMS / setup-to-sample RMS motion, same vertices, world px; no stationary denominator', scope: 'original mesh and region vertices before clipping/visibility; surface on meshes only; no draw order, colour, occlusion or optical flow', limitations: 'non-affine articulation or deformation can produce relief readings without depth; orthographic sloped depth can be affine; zero does not prove paper; homography refinement is local, not a global optimum certificate' }, samples: rows };
}
export type ParallaxReading = ReturnType<typeof parallaxOf>;
export const parallaxText = (reading: ParallaxReading): string => JSON.stringify(reading, null, 2) + '\n';
