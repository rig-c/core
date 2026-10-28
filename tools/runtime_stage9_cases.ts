/** Stage-nine buffered clipping controls, held to the unchanged core oracle. */
import { clipThrough, type ClipResult } from '../src/core/clipping.ts';
import { readModel } from '../src/core/index.ts';
import { poseRawSetup } from '../src/core/raw.ts';
import { compileRuntime, RuntimePose } from '../src/runtime/index.ts';
import { probeModel } from './runtime_poser_cases.ts';
import { RuntimeClipper, RuntimeClipBuffer } from '../src/runtime/clipping.ts';

export interface ClipPrimitiveFixture {
  name: string;
  polygon: number[];
  inverse: boolean;
  convex: boolean;
  vertices: number[];
  triangles: number[];
  uvs: number[];
}
export function clippingPrimitiveFixtures(): ClipPrimitiveFixture[] {
  const polygons = [[0, 0, 0, 10, 10, 10, 10, 0], [0, 0, 0, 10, 4, 5, 10, 10, 10, 0], [0, 0, 0, 5, 0, 10, 10, 10, 10, 0], [0, 0, 0, 10, 10, 10, 10, 0, 10, 0]];
  let state = 591;
  const random = (): number => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const fixtures: ClipPrimitiveFixture[] = [];
  for (const [shape, polygon] of polygons.entries()) for (const inverse of [false, true]) for (const convex of [false, true]) for (let i = 0; i < 80; i++) {
    const vertices = Array.from({ length: 6 }, () => random() * 30 - 10), triangles = [0, 1, 2], uvs = [0, 0, 1, 0, 0, 1];
    if (clipThrough({ polygon, inverse, convex }, vertices, triangles, uvs) === null) continue;
    fixtures.push({ name: `${shape}/${inverse}/${convex}/${i}`, polygon, inverse, convex, vertices, triangles, uvs });
  }
  return fixtures;
}
export function clippingPrimitiveProof(): { fixtures: number; cells: number; mismatch: number; omissionDiff: number } {
  const clipper = new RuntimeClipper(20), output = new RuntimeClipBuffer(2, 20);
  let fixtures = 0, cells = 0, mismatch = 0, omissionDiff = 0;
  const equal = (expected: ClipResult, count: boolean): boolean => {
    if (expected.clipped !== output.clipped) return false;
    for (const [a, b, n] of [[expected.vertices, output.vertices, output.vertexCount * 2], [expected.uvs, output.uvs, output.vertexCount * 2], [expected.triangles, output.triangles, output.triangleCount * 3], [expected.sources, output.sources, output.triangleCount]] as const) {
      if (a.length !== n) return false;
      for (let i = 0; i < n; i++) { if (count) cells++; if (!Object.is(a[i], b[i])) return false; }
    }
    return true;
  };
  for (const f of clippingPrimitiveFixtures()) {
    const expected = clipThrough(f, f.vertices, f.triangles, f.uvs)!;
    clipper.prepare(Float64Array.from(f.polygon), 0, f.polygon.length, f.inverse, f.convex);
    clipper.clip(Float64Array.from(f.vertices), 0, Int32Array.from(f.triangles), Float64Array.from(f.uvs), output);
    fixtures++; if (!equal(expected, true)) mismatch++;
    // Skip the operation: the output stays empty with no cut flag.
    output.vertexCount = 0; output.triangleCount = 0; output.clipped = false;
    if (!equal(expected, false)) omissionDiff++;
  }
  return { fixtures, cells, mismatch, omissionDiff };
}

/** The same setup documents used by the pre-admission red measurement. */
export function clippingRuntimeModel(f: ClipPrimitiveFixture, animated = false): string {
  return probeModel({ bones: [{ name: 'root' }], slots: [{ name: 'clip', bone: 'root', setup: 'mask' }, { name: 'draw', bone: 'root', setup: 'body' }, { name: 'end', bone: 'root', setup: null }], attachments: {
    clip: { mask: { kind: 'clipping', end: 'end', inverse: f.inverse, convex: f.convex, vertexCount: f.polygon.length / 2, vertices: { weighted: false, xy: f.polygon } } },
    draw: { body: { kind: 'mesh', uvs: f.uvs, triangles: f.triangles, vertices: { weighted: false, xy: f.vertices } } },
  }, animations: animated ? [{ name: 'a', duration: 1, bones: [{ name: 'root', timelines: [{ name: 'rotate', keys: [{ time: 0, value: 0 }, { time: 1, value: 20 }] }] }] }] : undefined });
}
export function clippingAdmissionProof(): { fixtures: number; cells: number; mismatch: number; omissionDiff: number; refused: number } {
  let fixtures = 0, cells = 0, mismatch = 0, omissionDiff = 0, refused = 0;
  for (const f of clippingPrimitiveFixtures()) {
    fixtures++;
    try {
      const doc = readModel(clippingRuntimeModel(f)), pose = new RuntimePose(compileRuntime(doc)), raw = poseRawSetup(doc);
      pose.setupPose('reset'); pose.computeClipped(); const draw = pose.clipping;
      if (draw === null || draw.drawCount !== raw.clipped.length || draw.clipCount !== raw.clips.length) { mismatch++; continue; }
      for (let q = 0; q < raw.clipped.length; q++) {
        const row = raw.clipped[q], slot = draw.drawSlots[q], out = draw.outputs[slot];
        if (row[0] !== pose.model.slots[slot].name || row[2] !== Number(out.clipped)) mismatch++;
        for (const [a, b, n] of [[row[3], out.vertices, out.vertexCount * 2], [row[4], out.uvs, out.vertexCount * 2], [row[5], out.triangles, out.triangleCount * 3]] as const) {
          if (a.length !== n) { mismatch++; continue; }
          for (let i = 0; i < n; i++) { cells++; if (!Object.is(a[i], b[i])) { mismatch++; break; } }
        }
      }
      draw.frame(pose, true); if (draw.drawCount !== raw.clipped.length) omissionDiff++;
    } catch { refused++; }
  }
  return { fixtures, cells, mismatch, omissionDiff, refused };
}
function poseAllocation(shape: string, plant: string): void {
  const f = clippingPrimitiveFixtures().find(f => f.name.startsWith(shape === 'concave' ? '1/false/false/' : shape === 'inverse' ? '0/true/false/' : '0/false/false/'))!;
  const pose = new RuntimePose(compileRuntime(readModel(clippingRuntimeModel(f, true)))); pose.setAnimation('a'); pose.apply(0, 'reset', 0);
  let sink: unknown = null;
  const frame = (i: number): void => { pose.step(.016); pose.computeClipped(); if (plant === 'object') sink = { i, x: pose.clipping!.drawCount }; };
  for (let i = 0; i < 3000; i++) frame(i);
  let bytes = Infinity;
  for (let batch = 0; batch < 3; batch++) { const before = process.memoryUsage().heapUsed; for (let i = 0; i < 4000; i++) frame(i); bytes = Math.min(bytes, (process.memoryUsage().heapUsed - before) / 4000); }
  void sink; console.log(JSON.stringify({ shape, plant, bytesPerFrame: bytes, frames: 4000 }));
}
export function runtimeStage9Cases(say: (name: string, problems: string[], detail: string) => void): void {
  const primitive = clippingPrimitiveProof();
  say('RP53_BUFFERED_CLIPPING_PRIMITIVE_MATCHES_ORACLE_AT_ZERO', primitive.mismatch ? [JSON.stringify(primitive)] : [], JSON.stringify(primitive));
  const admission = clippingAdmissionProof();
  say('RP54_DEFAULT_CLIPPING_ADMISSION_MATCHES_RAW_ORACLE', admission.mismatch || admission.refused ? [JSON.stringify(admission)] : [], JSON.stringify(admission));
  say('RP55_OMITTED_CLIPPING_MAKES_EVERY_FIXTURE_RED', admission.omissionDiff !== admission.fixtures || primitive.omissionDiff !== primitive.fixtures ? [JSON.stringify(admission)] : [], `${admission.omissionDiff}/${admission.fixtures} model outputs and ${primitive.omissionDiff}/${primitive.fixtures} primitives DIFF under omission`);
  const problems: string[] = [], details: string[] = [];
  for (const shape of ['convex', 'concave', 'inverse']) for (const plant of ['none', 'object']) {
    const run = Bun.spawnSync([process.execPath, import.meta.path, '--pose-alloc', shape, plant], { env: { ...process.env, BUN_JSC_useGC: '0' } });
    try { const measured = JSON.parse(new TextDecoder().decode(run.stdout)) as { bytesPerFrame: number }; details.push(`${shape}/${plant}: ${measured.bytesPerFrame} B/frame`); if (run.exitCode !== 0 || (plant === 'none' ? measured.bytesPerFrame !== 0 : measured.bytesPerFrame < 16)) problems.push(`${shape}/${plant}: exit ${run.exitCode}, ${measured.bytesPerFrame} B/frame`); }
    catch { problems.push(`${shape}/${plant}: allocation child failed, exit ${run.exitCode}`); }
  }
  say('RP56_CLIPPED_POSE_STEADY_STATE_ZERO_ALLOCATION', problems, details.join('; '));
}

/** Collector-off heap growth, minimum of three 4000-frame batches, as RP33/RP37. */
function allocation(shape: string, plant: string): void {
  const polygons: Record<string, number[]> = { convex: [0, 0, 0, 10, 10, 10, 10, 0], concave: [0, 0, 0, 10, 4, 5, 10, 10, 10, 0], inverse: [0, 0, 0, 10, 10, 10, 10, 0] };
  const p = Float64Array.from(polygons[shape]);
  const v = new Float64Array([-3, -2, 4, 12, 15, 0]), tri = new Int32Array([0, 1, 2]), uv = new Float64Array([0, 0, 1, 0, 0, 1]);
  const clipper = new RuntimeClipper(20), out = new RuntimeClipBuffer(1, 20); let sink: unknown = null;
  const frame = (i: number): void => { clipper.prepare(p, 0, p.length, shape === 'inverse', false); clipper.clip(v, 0, tri, uv, out); if (plant === 'object') sink = { i, x: out.vertices[0] }; };
  for (let i = 0; i < 3000; i++) frame(i);
  let bytes = Infinity;
  for (let batch = 0; batch < 3; batch++) { const before = process.memoryUsage().heapUsed; for (let i = 0; i < 4000; i++) frame(i); bytes = Math.min(bytes, (process.memoryUsage().heapUsed - before) / 4000); }
  void sink; console.log(JSON.stringify({ shape, plant, bytesPerFrame: bytes, frames: 4000 }));
}
if (import.meta.main) {
  if (process.argv[2] === '--pose-alloc') poseAllocation(process.argv[3], process.argv[4]);
  else if (process.argv[2] === '--alloc') allocation(process.argv[3], process.argv[4]);
  else { const proof = clippingPrimitiveProof(); console.log(JSON.stringify(proof)); process.exit(proof.mismatch === 0 && proof.omissionDiff === proof.fixtures ? 0 : 1); }
}
