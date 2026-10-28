/** Stage-nine buffered draw walk; RuntimePose owns the frame buffers. */
import type { RuntimeModel } from './model.ts';
import type { RuntimePose } from './pose.ts';
import { RuntimeClipper, RuntimeClipBuffer } from './clipping.ts';
/** Load once from the same model/view as the pose; frame() overwrites arrays and counts. */
export class RuntimeDrawClipper {
  readonly clipSlots: Int32Array;
  readonly drawSlots: Int32Array;
  readonly outputs: readonly RuntimeClipBuffer[];
  nativeRows = true;
  clipCount = 0;
  drawCount = 0;
  private readonly triangles: readonly (Int32Array | null)[];
  private readonly uvs: readonly (Float64Array | null)[];
  private readonly clipper: RuntimeClipper;
  constructor(readonly model: RuntimeModel) {
    const triangles: Array<Int32Array | null> = [], uvs: Array<Float64Array | null> = [], maxTriangles = new Int32Array(model.slots.length);
    let maxPolygon = 3;
    for (const at of model.attachments) {
      const t = at.clipTopology?.triangles ?? null, uv = at.clipTopology?.uvs ?? null;
      if (at.clip !== undefined) maxPolygon = Math.max(maxPolygon, at.count / 2);
      triangles.push(t); uvs.push(uv); if (t !== null) maxTriangles[at.slot] = Math.max(maxTriangles[at.slot], t.length / 3);
    }
    this.triangles = triangles; this.uvs = uvs; this.clipper = new RuntimeClipper(maxPolygon);
    this.clipSlots = new Int32Array(model.slots.length); this.drawSlots = new Int32Array(model.slots.length);
    this.outputs = Array.from(maxTriangles, n => new RuntimeClipBuffer(n, maxPolygon));
  }
  /** pose.computeVertices() must precede this walk. Omission is a diagnostic plant only. */
  frame(pose: RuntimePose, omit = false): void {
    if (pose.model !== this.model) throw new Error('runtime clip draw: pose differs from the prepared model');
    this.clipCount = 0; this.drawCount = 0; this.nativeRows = true;
    let active = false, end: string | null = null;
    for (let i = 0; i < pose.drawOrder.length; i++) {
      const s = pose.drawOrder[i], slot = this.model.slots[s], shown = pose.shown[s], at = shown < 0 ? null : this.model.attachments[shown];
      if (at?.clip !== undefined) {
        this.clipSlots[this.clipCount++] = s;
        if (active && end === slot.name) active = false;
        if (!omit && !active && this.model.active[at.bone] === 1) {
          this.clipper.prepare(pose.vertices, at.offset, at.count, at.clip.inverse, at.clip.convex); this.nativeRows &&= this.clipper.nativeRows; active = true; end = at.clip.end;
        }
        continue;
      }
      if (active && at !== null) {
        const triangles = this.triangles[shown], uvs = this.uvs[shown];
        if (triangles !== null && uvs !== null) {
          this.clipper.clip(pose.vertices, at.offset, triangles, uvs, this.outputs[s]); this.drawSlots[this.drawCount++] = s;
        }
      }
      if (active && end === slot.name) active = false;
    }
  }
}
