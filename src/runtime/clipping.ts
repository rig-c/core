/** Buffered counterpart of clipShapeOf/clipThrough/clipTriangles in src/core/clipping.ts.
 * RuntimePose.computeClipped overwrites these buffers for the live draw order.
 * Scratch and outputs are allocated at load; a frame changes counts and array cells only.
 * Concave/inverse output follows the core's drawn geometry, not an unclaimed Spine triangulation.
 */
export class RuntimeClipBuffer {
  readonly vertices: Float32Array;
  readonly uvs: Float32Array;
  readonly triangles: Int32Array;
  readonly sources: Int32Array;
  vertexCount = 0;
  triangleCount = 0;
  clipped = false;
  constructor(triangles: number, polygonVertices: number) {
    const points = triangles * Math.max(3, polygonVertices * (polygonVertices + 3));
    if (!Number.isSafeInteger(points) || points < 0) throw new Error('runtime clip: output capacity is not a safe non-negative integer');
    this.vertices = new Float32Array(points * 2); this.uvs = new Float32Array(points * 2);
    this.triangles = new Int32Array(points * 3); this.sources = new Int32Array(points);
  }
}

export class RuntimeClipper {
  /** Whether the original world polygon has the oracle native convex triangle-list contract. */
  nativeRows = false;
  private readonly points: Float64Array;
  private readonly ring: Int32Array;
  private readonly work: Int32Array;
  private readonly sorted: Int32Array;
  private readonly hull: Int32Array;
  private readonly pieces: Int32Array;
  private readonly sizes: Int32Array;
  private readonly merged: Int32Array;
  private readonly regions: Float64Array;
  private readonly regionSizes: Int32Array;
  private readonly a: Float64Array;
  private readonly b: Float64Array;
  private readonly outside: Float64Array;
  private readonly tri = new Float64Array(6);
  private readonly uv = new Float64Array(6);
  private regionsCount = 0;
  private inverse = false;
  private cut = false;
  private n = 0;
  constructor(readonly maxPolygonVertices: number) {
    const n = Math.max(3, maxPolygonVertices);
    this.points = new Float64Array(n * 2); this.ring = new Int32Array(n); this.work = new Int32Array(n);
    this.sorted = new Int32Array(n); this.hull = new Int32Array(n * 2); this.pieces = new Int32Array(n * n);
    this.sizes = new Int32Array(n); this.merged = new Int32Array(n * 2);
    this.regions = new Float64Array(n * n * 2); this.regionSizes = new Int32Array(n);
    this.a = new Float64Array((n * 2 + 16) * 2); this.b = new Float64Array(this.a.length); this.outside = new Float64Array(this.a.length);
  }
  private cross(a: number, b: number, c: number): number {
    const p = this.points; return (p[b * 2] - p[a * 2]) * (p[c * 2 + 1] - p[a * 2 + 1]) - (p[b * 2 + 1] - p[a * 2 + 1]) * (p[c * 2] - p[a * 2]);
  }
  private area(indices: Int32Array, n: number): number {
    const p = this.points; let area = 0;
    for (let i = 0; i < n; i++) { const a = indices[i] * 2, b = indices[(i + 1) % n] * 2; area += p[a] * p[b + 1] - p[b] * p[a + 1]; }
    return area;
  }
  private convex(indices: Int32Array, n: number, start = 0): boolean {
    let sign = 0;
    for (let i = 0; i < n; i++) {
      const p = this.points, a = indices[start + i] * 2, b = indices[start + (i + 1) % n] * 2, c = indices[start + (i + 2) % n] * 2;
      // convexWhy takes the second edge from b, unlike cross3 used by triangulation.
      const cross = (p[b] - p[a]) * (p[c + 1] - p[b + 1]) - (p[b + 1] - p[a + 1]) * (p[c] - p[b]);
      if (cross === 0) return false;
      const next = Math.sign(cross); if (sign === 0) sign = next; else if (sign !== next) return false;
    }
    return true;
  }
  private on(a: number, b: number, r: number): boolean {
    const p = this.points; return Math.min(p[a * 2], p[b * 2]) <= p[r * 2] && p[r * 2] <= Math.max(p[a * 2], p[b * 2]) && Math.min(p[a * 2 + 1], p[b * 2 + 1]) <= p[r * 2 + 1] && p[r * 2 + 1] <= Math.max(p[a * 2 + 1], p[b * 2 + 1]);
  }
  private meet(a: number, b: number, c: number, d: number): boolean {
    const d1 = this.cross(c, d, a), d2 = this.cross(c, d, b), d3 = this.cross(a, b, c), d4 = this.cross(a, b, d);
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
    return d1 === 0 && this.on(c, d, a) || d2 === 0 && this.on(c, d, b) || d3 === 0 && this.on(a, b, c) || d4 === 0 && this.on(a, b, d);
  }
  private region(indices: Int32Array, n: number, r: number, start = 0): void {
    const p = this.points; let area = 0;
    for (let i = 0; i < n; i++) { const a = indices[start + i] * 2, b = indices[start + (i + 1) % n] * 2; area += p[a] * p[b + 1] - p[b] * p[a + 1]; }
    const base = r * this.maxPolygonVertices * 2;
    for (let i = 0; i < n; i++) { const j = indices[start + (area > 0 ? n - 1 - i : i)] * 2; this.regions[base + i * 2] = p[j]; this.regions[base + i * 2 + 1] = p[j + 1]; }
    this.regionSizes[r] = n;
  }
  private makeHull(count: number): number {
    const idx = this.sorted, p = this.points, h = this.hull;
    for (let i = 0; i < count; i++) {
      const v = this.ring[i]; let j = i;
      while (j > 0) { const u = idx[j - 1]; if (p[u * 2] < p[v * 2] || p[u * 2] === p[v * 2] && p[u * 2 + 1] <= p[v * 2 + 1]) break; idx[j] = u; j--; }
      idx[j] = v;
    }
    let used = 0;
    for (let i = 0; i < count; i++) { const v = idx[i]; while (used >= 2 && this.cross(h[used - 2], h[used - 1], v) <= 0) used--; h[used++] = v; }
    used--;
    const lower = used;
    for (let i = count - 1; i >= 0; i--) { const v = idx[i]; while (used >= lower + 2 && this.cross(h[used - 2], h[used - 1], v) <= 0) used--; h[used++] = v; }
    return used - 1;
  }
  private plan(inverse: boolean, convex: boolean): boolean {
    this.nativeRows = false;
    const n = this.n, p = this.points, ring = this.ring;
    let repeats = 0, distinct = 0;
    for (let i = 0; i < n; i++) {
      ring[i] = i;
      for (let j = i + 1; j < n; j++) if (p[i * 2] === p[j * 2] && p[i * 2 + 1] === p[j * 2 + 1]) repeats++;
      const j = (i + 1) % n;
      if (p[i * 2] !== p[j * 2] || p[i * 2 + 1] !== p[j * 2 + 1]) this.work[distinct++] = i;
    }
    if (repeats > 0) {
      if (!inverse && distinct === n - repeats && distinct >= 3 && this.convex(this.work, distinct)) { this.regionsCount = 1; this.inverse = false; this.region(ring, n, 0); return false; }
      throw new Error('runtime clip: polygon has repeated vertices unsupported by clipShapeOf');
    }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, k = (i + 2) % n;
      if (this.cross(i, j, k) === 0 && (p[k * 2] - p[j * 2]) * (p[i * 2] - p[j * 2]) + (p[k * 2 + 1] - p[j * 2 + 1]) * (p[i * 2 + 1] - p[j * 2 + 1]) > 0) throw new Error('runtime clip: neighbouring polygon edges fold back');
      for (let q = i + 2; q < n; q++) if (!(i === 0 && q === n - 1) && this.meet(i, j, q, (q + 1) % n)) throw new Error('runtime clip: polygon edges cross or touch');
    }
    const originalConvex = this.convex(ring, n);
    this.nativeRows = !inverse && originalConvex;
    let count = n;
    for (let changed = true; changed && count > 3;) {
      changed = false;
      for (let i = 0; i < count; i++) if (this.cross(ring[(i + count - 1) % count], ring[i], ring[(i + 1) % count]) === 0) { ring.copyWithin(i, i + 1, count); count--; changed = true; break; }
    }
    if (count === 3 && this.cross(ring[0], ring[1], ring[2]) === 0) throw new Error('runtime clip: every polygon vertex lies on one line');
    this.inverse = inverse;
    if (inverse || !originalConvex && convex) { this.regionsCount = 1; this.region(this.hull, this.makeHull(count), 0); return false; }
    if (originalConvex) { for (let i = 0; i < n; i++) ring[i] = i; this.regionsCount = 1; this.region(ring, n, 0); return false; }
    if (this.area(ring, count) < 0) for (let i = 0; i < count / 2; i++) { const j = count - 1 - i, v = ring[i]; ring[i] = ring[j]; ring[j] = v; }
    this.work.set(ring); let left = count, pieces = 0;
    while (left > 3) {
      let found = false;
      for (let k = 0; k < left; k++) {
        const a = this.work[(k + left - 1) % left], b = this.work[k], c = this.work[(k + 1) % left];
        if (this.cross(a, b, c) <= 0) continue;
        let inside = false;
        for (let j = 0; j < left; j++) { const v = this.work[j]; if (v !== a && v !== b && v !== c && this.cross(a, b, v) >= 0 && this.cross(b, c, v) >= 0 && this.cross(c, a, v) >= 0) { inside = true; break; } }
        if (inside) continue;
        const base = pieces * this.maxPolygonVertices; this.pieces[base] = a; this.pieces[base + 1] = b; this.pieces[base + 2] = c; this.sizes[pieces++] = 3;
        this.work.copyWithin(k, k + 1, left); left--; found = true; break;
      }
      if (!found) throw new Error('runtime clip: no ear left in a polygon held simple');
    }
    for (let i = 0; i < 3; i++) this.pieces[pieces * this.maxPolygonVertices + i] = this.work[i]; this.sizes[pieces++] = 3;
    for (let changed = true; changed;) {
      changed = false;
      search: for (let a = 0; a < pieces; a++) for (let b = a + 1; b < pieces; b++) {
        const an = this.sizes[a], bn = this.sizes[b], ab = a * this.maxPolygonVertices, bb = b * this.maxPolygonVertices;
        for (let i = 0; i < an; i++) {
          const u = this.pieces[ab + i], v = this.pieces[ab + (i + 1) % an]; let j = -1;
          for (let k = 0; k < bn; k++) if (this.pieces[bb + k] === v) { j = k; break; }
          if (j < 0 || this.pieces[bb + (j + 1) % bn] !== u) continue;
          let size = 0;
          for (let k = 0; k <= i; k++) this.merged[size++] = this.pieces[ab + k];
          for (let k = (j + 2) % bn; k !== j; k = (k + 1) % bn) this.merged[size++] = this.pieces[bb + k];
          for (let k = i + 1; k < an; k++) this.merged[size++] = this.pieces[ab + k];
          let strict = true;
          for (let k = 0; k < size; k++) if (this.cross(this.merged[(k + size - 1) % size], this.merged[k], this.merged[(k + 1) % size]) <= 0) { strict = false; break; }
          if (!strict) continue;
          for (let k = 0; k < size; k++) this.pieces[ab + k] = this.merged[k]; this.sizes[a] = size;
          this.pieces.copyWithin(bb, bb + this.maxPolygonVertices, pieces * this.maxPolygonVertices); this.sizes.copyWithin(b, b + 1, pieces); pieces--; changed = true; break search;
        }
      }
    }
    this.regionsCount = pieces;
    for (let i = 0; i < pieces; i++) this.region(this.pieces, this.sizes[i], i, i * this.maxPolygonVertices);
    return pieces > 1;
  }
  /** Plan again after float32 conversion exactly when clipThrough first finds pieces. */
  prepare(polygon: Float64Array, offset: number, count: number, inverse: boolean, convex: boolean): void {
    this.n = count / 2;
    if (!Number.isInteger(this.n) || this.n < 3 || this.n > this.maxPolygonVertices) throw new Error('runtime clip: polygon vertex count exceeds its load-time capacity');
    for (let i = 0; i < count; i++) { const value = polygon[offset + i]; if (!Number.isFinite(value)) throw new Error('runtime clip: polygon contains a non-finite coordinate'); this.points[i] = value; }
    const replan = this.plan(inverse, convex), nativeRows = this.nativeRows;
    if (replan) { for (let i = 0; i < count; i++) this.points[i] = Math.fround(polygon[offset + i]); this.plan(inverse, convex); }
    this.nativeRows = nativeRows;
  }
  private half(input: Float64Array, n: number, px: number, py: number, qx: number, qy: number, out: Float64Array): number {
    let size = 0; this.cut = false; const ex = qx - px, ey = qy - py;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, sx = input[i * 2], sy = input[i * 2 + 1], tx = input[j * 2], ty = input[j * 2 + 1];
      const si = ex * (sy - py) - ey * (sx - px) < 0, ei = ex * (ty - py) - ey * (tx - px) < 0;
      if (!si || !ei) this.cut = true;
      if (si !== ei) { const dx = tx - sx, dy = ty - sy, t = (ex * (sy - py) - ey * (sx - px)) / (ey * dx - ex * dy); if (size * 2 + 2 > out.length) throw new Error('runtime clip: scratch polygon exceeds its load-time capacity'); out[size * 2] = sx + t * dx; out[size * 2 + 1] = sy + t * dy; size++; }
      if (ei) { if (size * 2 + 2 > out.length) throw new Error('runtime clip: scratch polygon exceeds its load-time capacity'); out[size * 2] = tx; out[size * 2 + 1] = ty; size++; }
    }
    return size;
  }
  private emit(points: Float64Array, count: number, cut: boolean, source: number, out: RuntimeClipBuffer): void {
    if (count < 3) return;
    if ((out.vertexCount + count) * 2 > out.vertices.length || out.triangleCount + count - 2 > out.sources.length) throw new Error('runtime clip: output exceeds its load-time capacity');
    const tri = this.tri, uv = this.uv, base = out.vertexCount;
    const d0 = tri[3] - tri[5], d1 = tri[4] - tri[2], d2 = tri[0] - tri[4], d4 = tri[5] - tri[1], d = 1 / (d0 * d2 + d1 * (tri[1] - tri[5]));
    for (let i = 0; i < count; i++) {
      const x = cut ? points[i * 2] : tri[i * 2], y = cut ? points[i * 2 + 1] : tri[i * 2 + 1], at = out.vertexCount++ * 2;
      out.vertices[at] = x; out.vertices[at + 1] = y;
      if (!cut) { out.uvs[at] = uv[i * 2]; out.uvs[at + 1] = uv[i * 2 + 1]; }
      else { const a = (d0 * (x - tri[4]) + d1 * (y - tri[5])) * d, b = (d4 * (x - tri[4]) + d2 * (y - tri[5])) * d, c = 1 - a - b; out.uvs[at] = uv[0] * a + uv[2] * b + uv[4] * c; out.uvs[at + 1] = uv[1] * a + uv[3] * b + uv[5] * c; }
    }
    for (let i = base * 2; i < out.vertexCount * 2; i++) if (!Number.isFinite(out.vertices[i]) || !Number.isFinite(out.uvs[i])) throw new Error(`runtime clip: triangle ${source} produced a non-finite clipped coordinate or UV`);
    for (let i = 1; i + 1 < count; i++) { const at = out.triangleCount * 3; out.triangles[at] = base; out.triangles[at + 1] = base + i; out.triangles[at + 2] = base + i + 1; out.sources[out.triangleCount++] = source; }
  }
  clip(vertices: Float64Array, offset: number, triangles: Int32Array, uvs: Float64Array, out: RuntimeClipBuffer): void {
    out.vertexCount = 0; out.triangleCount = 0; out.clipped = this.inverse;
    for (let k = 0; k < triangles.length; k += 3) {
      for (let j = 0; j < 3; j++) { const n = triangles[k + j] * 2; this.tri[j * 2] = vertices[offset + n]; this.tri[j * 2 + 1] = vertices[offset + n + 1]; this.uv[j * 2] = Math.fround(uvs[n]); this.uv[j * 2 + 1] = Math.fround(uvs[n + 1]); }
      if (!this.inverse) for (let r = 0; r < this.regionsCount; r++) {
        let input = this.a, output = this.b, count = 3, cut = false; for (let i = 0; i < 6; i++) input[i] = this.tri[i];
        const n = this.regionSizes[r], base = r * this.maxPolygonVertices * 2;
        for (let e = 0; e < n && count > 0; e++) { const p = base + e * 2, q = base + ((e + 1) % n) * 2; count = this.half(input, count, this.regions[p], this.regions[p + 1], this.regions[q], this.regions[q + 1], output); cut ||= this.cut; const swap = input; input = output; output = swap; }
        out.clipped ||= cut; this.emit(input, count, cut, k / 3, out);
      } else {
        let input = this.a, output = this.b, count = 3, cutSoFar = false; for (let i = 0; i < 6; i++) input[i] = this.tri[i];
        const n = this.regionSizes[0];
        for (let e = 0; e < n && count > 0; e++) { const p = e * 2, q = ((e + 1) % n) * 2, px = this.regions[p], py = this.regions[p + 1], qx = this.regions[q], qy = this.regions[q + 1];
          const outside = this.half(input, count, qx, qy, px, py, this.outside), cut = this.cut || cutSoFar; this.emit(this.outside, outside, cut, k / 3, out);
          count = this.half(input, count, px, py, qx, qy, output); cutSoFar ||= this.cut; const swap = input; input = output; output = swap;
        }
      }
    }
  }
}
