/**
 * The runtime poser's per-instance half (issue #1591, stage 0): one
 * `RuntimePose` per skeleton on screen, every buffer allocated when it is
 * made and overwritten in place on every pose, so that posing a frame
 * allocates nothing.
 *
 * ## What a pose is
 *
 * The oracle's sample, as `src/core/animation.ts` poses it (`poseAnimations`):
 * every pose is posed from the setup pose — the bones' setup local values,
 * then the animation's bone timelines at `t` at full weight, then the world
 * transforms parents first, then the ik and transform constraints in the
 * document's order with their timelines' values at `t`, each followed by the
 * bones below what it moved posed again; then each slot's colour and what it
 * shows; then, when asked, every shown attachment's world vertices. Nothing
 * of one pose survives into the next but the key cursors, which only make
 * the key search start nearer.
 *
 * ## The arithmetic is the oracle's
 *
 * Every formula below is the one the named function of `src/core/` computes,
 * in its order of operations, on the same doubles: a bone's frame and its
 * five inherit modes (`world.ts`), the timelines (`animation.ts`), the one-
 * and two-bone ik, the world-space transform, the read-back of a moved bone's
 * local values and the update order (`constraints.ts`), a region's corners
 * and a mesh's vertices (`vertices.ts`). Each of those orders was fixed
 * there by measurement against spine-core 4.3.13 to the last bit; the runtime
 * does not re-measure them, it is held to the oracle at tolerance 0
 * (`tools/core_gate.ts`, *The runtime poser*), so an order changed here is a
 * difference there.
 *
 * ⚠️ The exactness hazards, each kept as the oracle has it: the setup value
 * plus 0 before a timeline's first key (which turns a `-0` setup into `0`);
 * a keyed ik or transform value reaching the pose through the setup blend
 * `setup + (value − setup)·1`; `Math.PI` for a folded uniform two-bone ik and
 * the runtime's 3.1415927 everywhere else; the `(−180, 180]` wrap; a mix of
 * exactly 0 touching nothing; an inactive bone posed as zeros by the
 * hierarchy and never posed again by a constraint, nor the bones below it.
 */
import { COLLAPSED_X_AXIS_SQ, RUNTIME_DEG, RUNTIME_PI } from '../core/world.ts';
import { channelValue, keyAt } from './curves.ts';
import {
  DRAW_MESH,
  DRAW_NONE,
  DRAW_REGION,
  IK_BEND_POSITIVE,
  IK_COMPRESS,
  IK_STRETCH,
  L_ROTATION,
  L_SCALE_X,
  L_SCALE_Y,
  L_SHEAR_X,
  L_SHEAR_Y,
  L_X,
  L_Y,
  LOCALS,
  MODE_NO_ROTATION_OR_REFLECTION,
  MODE_NO_SCALE,
  MODE_NO_SCALE_OR_REFLECTION,
  MODE_NORMAL,
  MODE_ONLY_TRANSLATION,
  RAD,
  RuntimeInputError,
  SCALE_Y_UNIFORM,
  SCALE_Y_VOLUME,
  W_A,
  W_B,
  W_C,
  W_D,
  W_X,
  W_Y,
  WORLDS,
  type RuntimeAnimation,
  type RuntimeIk,
  type RuntimeModel,
  type RuntimeTransform,
} from './model.ts';

const DEG = RUNTIME_DEG;
const TWO_PI = 2 * RUNTIME_PI;
// The transform properties, by `TRANSFORM_PROPERTIES` index (src/core/constraints.ts).
const P_ROTATE = 0;
const P_X = 1;
const P_Y = 2;
const P_SCALE_X = 3;
const P_SCALE_Y = 4;

/** A change brought once into (−180, 180] — −180 goes to 180 (src/core/constraints.ts). */
function wrap180(r: number): number {
  return r > 180 ? r - 360 : r <= -180 ? r + 360 : r;
}

/** The runtime's `scaleY` for a bone an ik scaled by `s` along its length (src/core/constraints.ts, the `volume` measurement). */
function volumeScaleY(scaleY: number, s: number): number {
  return scaleY / (s < 0.7 ? 0.25 + s * 0.642857 : s);
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** One skeleton's pose, every value in place. Read `world`, `light`, `shown` and `vertices` after a pose. */
export class RuntimePose {
  readonly model: RuntimeModel;
  /** Every bone's local values, `LOCALS` per bone (`L_*`). */
  readonly locals: Float64Array;
  /** Every bone's world transform, `WORLDS` per bone (`W_*`). */
  readonly world: Float64Array;
  /** Every slot's light colour, four per slot. */
  readonly light: Float64Array;
  /** What every slot shows: an index into `model.attachments`, or −1 for nothing. */
  readonly shown: Int32Array;
  /** Every attachment's world vertices at its `offset`, written by `computeVertices` for the attachments shown. */
  readonly vertices: Float64Array;
  /** The running sum of `step`'s steps, and the animation time the last pose was posed at. */
  trackTime = 0;
  time = 0;

  private current: RuntimeAnimation | null = null;
  private readonly cursors: Int32Array;
  // The constraints' values as posed: an ik's mix, softness and flags, a transform's six mixes.
  private readonly ikMix: Float64Array;
  private readonly ikSoftness: Float64Array;
  private readonly ikFlags: Uint8Array;
  private readonly mixes: Float64Array;
  // The update order's scratch: the bones a constraint changed and moved in world space, in order, and per-bone marks.
  private readonly changed: Int32Array;
  private readonly inWorld: Int32Array;
  private readonly changedMark: Uint8Array;
  private readonly inWorldMark: Uint8Array;
  private readonly below: Uint8Array;
  private readonly visit: Uint8Array;
  private readonly w = new Float64Array(WORLDS);

  constructor(model: RuntimeModel) {
    this.model = model;
    const nb = model.boneNames.length;
    const ns = model.slots.length;
    const nc = model.constraints.length;
    this.locals = new Float64Array(nb * LOCALS);
    this.world = new Float64Array(nb * WORLDS);
    this.light = new Float64Array(ns * 4);
    this.shown = new Int32Array(ns);
    this.vertices = new Float64Array(model.vertexCount);
    this.cursors = new Int32Array(Math.max(1, model.cursors)).fill(-1);
    this.ikMix = new Float64Array(nc);
    this.ikSoftness = new Float64Array(nc);
    this.ikFlags = new Uint8Array(nc);
    this.mixes = new Float64Array(nc * 6);
    this.changed = new Int32Array(Math.max(1, nb));
    this.inWorld = new Int32Array(Math.max(1, nb));
    this.changedMark = new Uint8Array(nb);
    this.inWorldMark = new Uint8Array(nb);
    this.below = new Uint8Array(nb);
    this.visit = new Uint8Array(nb);
  }

  /** The animation this pose plays (a covered one: `model.animation` throws a `RuntimeRefusal` for a refused one), from track time 0. */
  setAnimation(name: string): void {
    this.current = this.model.animation(name);
    this.cursors.fill(-1);
    this.trackTime = 0;
    this.time = 0;
  }

  /** The setup pose: every constraint applied with its own values, every slot as it is set up. */
  setupPose(): void {
    this.current = null;
    this.time = 0;
    this.locals.set(this.model.setup);
    this.hierarchy();
    this.constraintValues(null, 0);
    this.solveConstraints();
    this.slotValues(null, 0);
  }

  /** The animation posed at its time `t`, from the setup pose (the header). */
  apply(t: number): void {
    const anim = this.current;
    if (anim === null) throw new RuntimeInputError('apply: no animation is set (setAnimation first)');
    if (!Number.isFinite(t)) throw new RuntimeInputError(`apply: the time ${t} is not finite`);
    this.time = t;
    this.boneTimelines(anim, t);
    this.hierarchy();
    this.constraintValues(anim, t);
    this.solveConstraints();
    this.slotValues(anim, t);
  }

  /** One step of a looping track: the track time moved by `dt`, the animation posed at it wrapped by the duration (`loopedTime` in src/core/raw.ts). */
  step(dt: number): void {
    const anim = this.current;
    if (anim === null) throw new RuntimeInputError('step: no animation is set (setAnimation first)');
    this.trackTime += dt;
    this.apply(anim.duration === 0 ? 0 : this.trackTime % anim.duration);
  }

  // ---------------------------------------------------------------------------
  // the bones
  // ---------------------------------------------------------------------------

  /** The setup locals with the bone timelines' values at `t` (`posedBones`): added, or multiplied for a scale; a channel before its timeline's first key at setup plus 0, or times 1. */
  private boneTimelines(anim: RuntimeAnimation, t: number): void {
    const L = this.locals;
    const S = this.model.setup;
    L.set(S);
    const timelines = anim.bones;
    for (let k = 0; k < timelines.length; k++) {
      const tl = timelines[k];
      const i = keyAt(tl.curve, this.cursors, tl.cursor, t);
      const o = tl.bone * LOCALS;
      const fields = tl.fields;
      for (let c = 0; c < fields.length; c++) {
        const at = o + fields[c];
        if (tl.multiply[c] === 1) L[at] = S[at] * (i < 0 ? 1 : channelValue(tl.curve, i, c, t));
        else L[at] = S[at] + (i < 0 ? 0 : channelValue(tl.curve, i, c, t));
      }
    }
  }

  /** Every bone's world transform from its locals, parents first (`worldTransforms`): an inactive bone as zeros. */
  private hierarchy(): void {
    const nb = this.model.boneNames.length;
    for (let i = 0; i < nb; i++) this.poseBone(i, true);
  }

  /**
   * One bone's world transform from its locals under its parent's current
   * world (`worldTransforms` and the update order's `poseBone`). An inactive
   * bone is zeroed by the hierarchy (`fresh`) and left as it is by a repose.
   */
  private poseBone(i: number, fresh: boolean): void {
    const m = this.model;
    const W = this.world;
    const o = i * WORLDS;
    if (m.active[i] === 0) {
      if (fresh) {
        W[o + W_A] = 0;
        W[o + W_B] = 0;
        W[o + W_C] = 0;
        W[o + W_D] = 0;
        W[o + W_X] = 0;
        W[o + W_Y] = 0;
      }
      return;
    }
    const L = this.locals;
    const l = i * LOCALS;
    const x = L[l + L_X];
    const y = L[l + L_Y];
    const rotation = L[l + L_ROTATION];
    const scaleX = L[l + L_SCALE_X];
    const scaleY = L[l + L_SCALE_Y];
    const shearX = L[l + L_SHEAR_X];
    const shearY = L[l + L_SHEAR_Y];
    const parent = m.parents[i];
    if (parent < 0) {
      // A root is its own frame at its own x, y.
      const xAngle = (rotation + shearX) * RAD;
      const yAngle = (rotation + 90 + shearY) * RAD;
      W[o + W_A] = Math.cos(xAngle) * scaleX;
      W[o + W_B] = Math.cos(yAngle) * scaleY;
      W[o + W_C] = Math.sin(xAngle) * scaleX;
      W[o + W_D] = Math.sin(yAngle) * scaleY;
      W[o + W_X] = x;
      W[o + W_Y] = y;
      return;
    }
    const q = parent * WORLDS;
    const pa = W[q + W_A];
    const pb = W[q + W_B];
    const pc = W[q + W_C];
    const pd = W[q + W_D];
    const px = W[q + W_X];
    const py = W[q + W_Y];
    switch (m.modes[i]) {
      case MODE_NORMAL: {
        const xAngle = (rotation + shearX) * RAD;
        const yAngle = (rotation + 90 + shearY) * RAD;
        const la = Math.cos(xAngle) * scaleX;
        const lb = Math.cos(yAngle) * scaleY;
        const lc = Math.sin(xAngle) * scaleX;
        const ld = Math.sin(yAngle) * scaleY;
        W[o + W_A] = pa * la + pb * lc;
        W[o + W_B] = pa * lb + pb * ld;
        W[o + W_C] = pc * la + pd * lc;
        W[o + W_D] = pc * lb + pd * ld;
        break;
      }
      case MODE_ONLY_TRANSLATION: {
        const xAngle = (rotation + shearX) * RAD;
        const yAngle = (rotation + 90 + shearY) * RAD;
        W[o + W_A] = Math.cos(xAngle) * scaleX;
        W[o + W_B] = Math.cos(yAngle) * scaleY;
        W[o + W_C] = Math.sin(xAngle) * scaleX;
        W[o + W_D] = Math.sin(yAngle) * scaleY;
        break;
      }
      case MODE_NO_ROTATION_OR_REFLECTION: {
        const xLengthSq = pa * pa + pc * pc;
        let c0: number;
        let c1: number;
        let c2: number;
        let c3: number;
        let r: number;
        if (xLengthSq > COLLAPSED_X_AXIS_SQ) {
          const k = Math.abs(pa * pd - pb * pc) / xLengthSq;
          c0 = pa;
          c1 = -pc * k;
          c2 = pc;
          c3 = pa * k;
          r = rotation - Math.atan2(pc, pa) * DEG;
        } else {
          c0 = 0;
          c1 = -pb;
          c2 = 0;
          c3 = pd;
          r = rotation - 90 + Math.atan2(pd, pb) * DEG;
        }
        const xAngle = (r + shearX) * RAD;
        const yAngle = (r + shearY + 90) * RAD;
        const la = Math.cos(xAngle) * scaleX;
        const lb = Math.cos(yAngle) * scaleY;
        const lc = Math.sin(xAngle) * scaleX;
        const ld = Math.sin(yAngle) * scaleY;
        W[o + W_A] = c0 * la + c1 * lc;
        W[o + W_B] = c0 * lb + c1 * ld;
        W[o + W_C] = c2 * la + c3 * lc;
        W[o + W_D] = c2 * lb + c3 * ld;
        break;
      }
      default: {
        // noScale and noScaleOrReflection (`noScaleDirection`, then the frame at rotation 0).
        const rr = rotation * RAD;
        const cos = Math.cos(rr);
        const sin = Math.sin(rr);
        const ux0 = pa * cos + pb * sin;
        const uy0 = pc * cos + pd * sin;
        const inverse = 1 / Math.sqrt(ux0 * ux0 + uy0 * uy0);
        const ux = ux0 * inverse;
        const uy = uy0 * inverse;
        const flip = m.modes[i] === MODE_NO_SCALE && pa * pd - pb * pc < 0 ? -1 : 1;
        const t0 = ux;
        const t1 = -uy * flip;
        const t2 = uy;
        const t3 = ux * flip;
        const xAngle = (0 + shearX) * RAD;
        const yAngle = (0 + 90 + shearY) * RAD;
        const la = Math.cos(xAngle) * scaleX;
        const lb = Math.cos(yAngle) * scaleY;
        const lc = Math.sin(xAngle) * scaleX;
        const ld = Math.sin(yAngle) * scaleY;
        W[o + W_A] = t0 * la + t1 * lc;
        W[o + W_B] = t0 * lb + t1 * ld;
        W[o + W_C] = t2 * la + t3 * lc;
        W[o + W_D] = t2 * lb + t3 * ld;
      }
    }
    W[o + W_X] = pa * x + pb * y + px;
    W[o + W_Y] = pc * x + pd * y + py;
  }

  // ---------------------------------------------------------------------------
  // the constraints
  // ---------------------------------------------------------------------------

  /** Each constraint's values at `t` (`posedRecords`): its own before its timeline's first key, else the keyed values through the setup blend and the key's flags. */
  private constraintValues(anim: RuntimeAnimation | null, t: number): void {
    const cs = this.model.constraints;
    for (let k = 0; k < cs.length; k++) {
      const c = cs[k];
      const tl = anim === null ? null : anim.constraints[k];
      const i = tl === null ? -1 : keyAt(tl.curve, this.cursors, tl.cursor, t);
      if (c.kind === 'ik') {
        if (tl === null || i < 0) {
          this.ikMix[k] = c.mix;
          this.ikSoftness[k] = c.softness;
          this.ikFlags[k] = c.flags;
        } else {
          this.ikMix[k] = c.mix + (channelValue(tl.curve, i, 0, t) - c.mix) * 1;
          this.ikSoftness[k] = c.softness + (channelValue(tl.curve, i, 1, t) - c.softness) * 1;
          this.ikFlags[k] = (tl.flags as Uint8Array)[i];
        }
      } else {
        const o = k * 6;
        for (let p = 0; p < 6; p++) this.mixes[o + p] = tl === null || i < 0 ? c.mixes[p] : c.mixes[p] + (channelValue(tl.curve, i, p, t) - c.mixes[p]) * 1;
      }
    }
  }

  /** Every applied constraint in the document's order, each followed by the update order's repose (`applyConstraints`). */
  private solveConstraints(): void {
    const cs = this.model.constraints;
    for (let k = 0; k < cs.length; k++) {
      const c = cs[k];
      if (!c.applied) continue;
      if (c.kind === 'ik') this.solveIk(c, k);
      else this.solveTransform(c, k);
    }
  }

  private solveIk(c: RuntimeIk, k: number): void {
    const mix = this.ikMix[k];
    if (mix === 0) return;
    const flags = this.ikFlags[k];
    if (c.bones.length === 1) {
      this.solveOne(c.bones[0], c.target, mix, (flags & IK_COMPRESS) !== 0, (flags & IK_STRETCH) !== 0, c.scaleY);
      this.changed[0] = c.bones[0];
      this.repose(1, 0);
    } else if (this.solveTwo(c, mix, this.ikSoftness[k], flags)) {
      this.changed[0] = c.bones[0];
      this.repose(1, 0);
    }
  }

  /** A one-bone ik (`solveOne`). */
  private solveOne(bi: number, ti: number, mix: number, compress: boolean, stretch: boolean, scaleYMode: number): void {
    const m = this.model;
    const L = this.locals;
    const W = this.world;
    const parent = m.parents[bi];
    const q = parent * WORLDS;
    let pa = 1;
    let pb = 0;
    let pc = 0;
    let pd = 1;
    let pwx = 0;
    let pwy = 0;
    if (parent >= 0) {
      pa = W[q + W_A];
      pb = W[q + W_B];
      pc = W[q + W_C];
      pd = W[q + W_D];
      pwx = W[q + W_X];
      pwy = W[q + W_Y];
    }
    const bw = bi * WORLDS;
    const tw = ti * WORLDS;
    const l = bi * LOCALS;
    const mode = m.modes[bi];
    let turn = 0;
    let lx: number;
    let ly: number;
    if (mode === MODE_NO_ROTATION_OR_REFLECTION) {
      const k = Math.abs(pa * pd - pb * pc) / Math.max(0.00001, pa * pa + pc * pc);
      pb = -pc * k;
      pd = pa * k;
      turn = Math.atan2(pc, pa) * DEG;
      const det = pa * pd - pb * pc;
      const x = W[tw + W_X] - pwx;
      const y = W[tw + W_Y] - pwy;
      if (Math.abs(det) <= 0.00001) {
        lx = 0;
        ly = 0;
      } else {
        lx = (x * pd - y * pb) / det - L[l + L_X];
        ly = (y * pa - x * pc) / det - L[l + L_Y];
      }
    } else if (mode === MODE_ONLY_TRANSLATION) {
      lx = W[tw + W_X] - W[bw + W_X];
      ly = W[tw + W_Y] - W[bw + W_Y];
    } else {
      const det = pa * pd - pb * pc;
      const x = W[tw + W_X] - pwx;
      const y = W[tw + W_Y] - pwy;
      if (Math.abs(det) <= 0.00001) {
        lx = 0;
        ly = 0;
      } else {
        lx = (x * pd - y * pb) / det - L[l + L_X];
        ly = (y * pa - x * pc) / det - L[l + L_Y];
      }
    }
    const rotation = L[l + L_ROTATION];
    const scaleX = L[l + L_SCALE_X];
    let r = -L[l + L_SHEAR_X] - rotation + turn + Math.atan2(ly, lx) * DEG;
    if (scaleX < 0) r += 180;
    L[l + L_ROTATION] = rotation + wrap180(r) * mix;
    const len = m.lengths[bi] * scaleX;
    if ((compress || stretch) && len > 0.00001) {
      const wx = W[tw + W_X] - W[bw + W_X];
      const wy = W[tw + W_Y] - W[bw + W_Y];
      const d = mode === MODE_NO_SCALE || mode === MODE_NO_SCALE_OR_REFLECTION ? Math.sqrt(wx * wx + wy * wy) : Math.sqrt(lx * lx + ly * ly);
      if ((compress && d < len) || (stretch && d > len)) {
        const s = (d / len - 1) * mix + 1;
        L[l + L_SCALE_X] = scaleX * s;
        if (scaleYMode === SCALE_Y_UNIFORM) L[l + L_SCALE_Y] = L[l + L_SCALE_Y] * s;
        else if (scaleYMode === SCALE_Y_VOLUME) L[l + L_SCALE_Y] = volumeScaleY(L[l + L_SCALE_Y], s);
      }
    }
  }

  /** A two-bone ik (`solveTwo`): whether it changed the parent. */
  private solveTwo(c: RuntimeIk, mix: number, softness: number, flags: number): boolean {
    const m = this.model;
    const L = this.locals;
    const W = this.world;
    const pi = c.bones[0];
    const ci = c.bones[1];
    if (m.modes[pi] !== MODE_NORMAL || m.modes[ci] !== MODE_NORMAL) return false;
    const stretch = (flags & IK_STRETCH) !== 0;
    const g = m.parents[pi] * WORLDS;
    const pw = pi * WORLDS;
    const tw = c.target * WORLDS;
    const pl = pi * LOCALS;
    const cl = ci * LOCALS;
    const ga = W[g + W_A];
    const gb = W[g + W_B];
    const gc = W[g + W_C];
    const gd = W[g + W_D];
    const gx = W[g + W_X];
    const gy = W[g + W_Y];
    const gdet = ga * gd - gb * gc;
    const gid = Math.abs(gdet) <= 0.00001 ? 0 : 1 / gdet;
    const px = L[pl + L_X];
    const py = L[pl + L_Y];
    const psx = L[pl + L_SCALE_X];
    const psy = L[pl + L_SCALE_Y];
    const csx = L[cl + L_SCALE_X];
    let sx = psx;
    let sy = psy;
    const cx = L[cl + L_X];
    let cy = L[cl + L_Y];
    const uniform = Math.abs(Math.abs(psx) - Math.abs(psy)) <= 0.00001;
    if (!uniform || stretch) cy = 0;
    let x = W[pw + W_A] * cx + W[pw + W_B] * cy + W[pw + W_X] - gx;
    let y = W[pw + W_C] * cx + W[pw + W_D] * cy + W[pw + W_Y] - gy;
    const ox = (x * gd - y * gb) * gid;
    const oy = (y * ga - x * gc) * gid;
    const dx = ox - px;
    const dy = oy - py;
    const l1 = Math.sqrt(dx * dx + dy * dy);
    let l2 = m.lengths[ci] * Math.abs(csx);
    if (l1 < 0.00001) {
      this.solveOne(pi, c.target, mix, false, stretch, 0);
      L[cl + L_ROTATION] = 0;
      L[cl + L_Y] = cy;
      return true;
    }
    x = W[tw + W_X] - gx;
    y = W[tw + W_Y] - gy;
    let tx = (x * gd - y * gb) * gid;
    let ty = (y * ga - x * gc) * gid;
    tx -= px;
    ty -= py;
    let d2 = tx * tx + ty * ty;
    const bend = (flags & IK_BEND_POSITIVE) !== 0 ? 1 : -1;
    if (softness !== 0) {
      const soft = softness * (Math.abs(psx) * (Math.abs(csx) + 1) * 0.5);
      const d = Math.sqrt(d2);
      const sd = d - l1 - l2 * Math.abs(psx) + soft;
      if (sd > 0) {
        const q = Math.min(1, sd / (soft * 2)) - 1;
        const pull = (sd - soft * (1 - q * q)) / d;
        tx -= pull * tx;
        ty -= pull * ty;
        d2 = tx * tx + ty * ty;
      }
    }
    let a1: number;
    let a2: number;
    if (uniform) {
      l2 *= Math.abs(psx);
      let cos = (d2 - l1 * l1 - l2 * l2) / (2 * l1 * l2);
      if (cos < -1) {
        cos = -1;
        a2 = Math.PI * bend;
      } else if (cos > 1) {
        cos = 1;
        a2 = 0;
        if (stretch) {
          const f = (Math.sqrt(d2) / (l1 + l2) - 1) * mix + 1;
          sx *= f;
          if (c.scaleY === SCALE_Y_UNIFORM) sy *= f;
          else if (c.scaleY === SCALE_Y_VOLUME) sy = volumeScaleY(sy, f);
        }
      } else a2 = Math.acos(cos) * bend;
      const along = l1 + l2 * cos;
      const across = l2 * Math.sin(a2);
      a1 = Math.atan2(ty * along - tx * across, tx * along + ty * across);
    } else {
      const ea = Math.abs(psx) * l2;
      const eb = Math.abs(psy) * l2;
      const aa = ea * ea;
      const bb = eb * eb;
      const qa = bb - aa;
      const qb = -2 * bb * l1;
      const qc = bb * l1 * l1 + aa * d2 - aa * bb;
      const disc = qb * qb - 4 * qa * qc;
      let solved = false;
      a1 = 0;
      a2 = 0;
      if (disc >= 0) {
        let q = Math.sqrt(disc);
        if (qb < 0) q = -q;
        q = -(qb + q) * 0.5;
        const r0 = q / qa;
        const r1 = qc / q;
        const X = Math.abs(r0) < Math.abs(r1) ? r0 : r1;
        const y2 = d2 - X * X;
        if (y2 >= 0) {
          const Y = Math.sqrt(y2) * bend;
          a1 = Math.atan2(ty, tx) - Math.atan2(Y, X);
          a2 = Math.atan2(Y / Math.abs(psy), (X - l1) / Math.abs(psx));
          solved = true;
        }
      }
      if (!solved) {
        let nearAngle = RUNTIME_PI;
        let nearX = l1 - ea;
        let nearY = 0;
        let nearDist = (l1 - ea) * (l1 - ea);
        let farAngle = 0;
        let farX = l1 + ea;
        let farY = 0;
        let farDist = (l1 + ea) * (l1 + ea);
        const vertex = (-ea * l1) / (aa - bb);
        if (vertex >= -1 && vertex <= 1) {
          const angle = Math.acos(vertex);
          const vx = ea * Math.cos(angle) + l1;
          const vy = eb * Math.sin(angle);
          const dist = vx * vx + vy * vy;
          if (dist < nearDist) {
            nearAngle = angle;
            nearX = vx;
            nearY = vy;
            nearDist = dist;
          }
          if (dist > farDist) {
            farAngle = angle;
            farX = vx;
            farY = vy;
            farDist = dist;
          }
        }
        if (d2 <= (nearDist + farDist) * 0.5) {
          a1 = Math.atan2(ty, tx) - Math.atan2(nearY * bend, nearX);
          a2 = nearAngle * bend;
        } else {
          a1 = Math.atan2(ty, tx) - Math.atan2(farY * bend, farX);
          a2 = farAngle * bend;
        }
      }
    }
    const signs = (psx < 0 ? -1 : 1) * (psy < 0 ? -1 : 1);
    const offset = Math.atan2(cy, cx);
    const parentRotation = L[pl + L_ROTATION];
    const parentChange = (a1 - signs * offset) * DEG + (psx < 0 ? 180 : 0) - parentRotation;
    L[pl + L_ROTATION] = parentRotation + wrap180(parentChange) * mix;
    L[pl + L_SCALE_X] = sx;
    L[pl + L_SCALE_Y] = sy;
    const childTarget = ((a2 + signs * offset) * DEG - L[cl + L_SHEAR_X]) * signs + (csx < 0 ? 180 : 0);
    const childRotation = L[cl + L_ROTATION];
    L[cl + L_Y] = cy;
    L[cl + L_ROTATION] = childRotation + wrap180(childTarget - childRotation) * mix;
    return true;
  }

  /** A world-space, absolute transform (`solveTransform`): each bone's world edited in turn and written back, then the repose. */
  private solveTransform(c: RuntimeTransform, k: number): void {
    const W = this.world;
    const w = this.w;
    const mixes = this.mixes;
    const o6 = k * 6;
    let n = 0;
    for (let bk = 0; bk < c.bones.length; bk++) {
      const bi = c.bones[bk];
      const o = bi * WORLDS;
      w[W_A] = W[o + W_A];
      w[W_B] = W[o + W_B];
      w[W_C] = W[o + W_C];
      w[W_D] = W[o + W_D];
      w[W_X] = W[o + W_X];
      w[W_Y] = W[o + W_Y];
      let applied = false;
      for (let f = 0; f < c.fromProperty.length; f++) {
        const value = this.sourceValue(c, c.fromProperty[f]) - c.fromOffset[f];
        for (let q = c.toStart[f]; q < c.toEnd[f]; q++) {
          const property = c.toProperty[q];
          const mix = mixes[o6 + property];
          if (mix === 0) continue;
          let v = value * c.toScale[q] + c.toOffset[q];
          if (c.clamp) {
            const lo = Math.min(c.toOffset[q], c.toMax[q]);
            const hi = Math.max(c.toOffset[q], c.toMax[q]);
            v = v < lo ? lo : v > hi ? hi : v;
          }
          applied = true;
          applyWorld(w, property, v, mix);
        }
      }
      if (!applied) continue;
      W[o + W_A] = w[W_A];
      W[o + W_B] = w[W_B];
      W[o + W_C] = w[W_C];
      W[o + W_D] = w[W_D];
      W[o + W_X] = w[W_X];
      W[o + W_Y] = w[W_Y];
      this.changed[n] = bi;
      this.inWorld[n] = bi;
      n++;
    }
    if (n > 0) this.repose(n, n);
  }

  /** The source's world value of a property (`sourceValue`, world source). */
  private sourceValue(c: RuntimeTransform, property: number): number {
    const W = this.world;
    const s = c.source * WORLDS;
    const o = c.offsets;
    const a = W[s + W_A];
    const b = W[s + W_B];
    const cc = W[s + W_C];
    const d = W[s + W_D];
    switch (property) {
      case P_ROTATE: {
        const det = a * d - b * cc;
        let r = Math.atan2(cc, a) * DEG + (det > 0 ? o[P_ROTATE] : -o[P_ROTATE]);
        if (r < 0) r += 360;
        return r;
      }
      case P_X:
        return a * o[P_X] + b * o[P_Y] + W[s + W_X];
      case P_Y:
        return cc * o[P_X] + d * o[P_Y] + W[s + W_Y];
      case P_SCALE_X:
        return Math.sqrt(a * a + cc * cc) + o[P_SCALE_X];
      case P_SCALE_Y:
        return Math.sqrt(b * b + d * d) + o[P_SCALE_Y];
      default:
        return (Math.atan2(d, b) - Math.atan2(cc, a)) * DEG - 90 + o[5];
    }
  }

  /**
   * After a constraint (`repose`): the `nInWorld` bones it moved in world space
   * (the first of `inWorld`) read back into local values, then every bone below
   * one of the `nChanged` it changed (`changed`) posed again, in bone order —
   * but not through an inactive bone it did not move itself, and not a bone it
   * moved in world space.
   */
  private repose(nChanged: number, nInWorld: number): void {
    const m = this.model;
    const changed = this.changed;
    const changedMark = this.changedMark;
    const inWorldMark = this.inWorldMark;
    const below = this.below;
    for (let k = 0; k < nInWorld; k++) {
      this.localFromWorld(this.inWorld[k]);
      inWorldMark[this.inWorld[k]] = 1;
    }
    for (let k = 0; k < nChanged; k++) {
      changedMark[changed[k]] = 1;
      below[changed[k]] = 1;
    }
    const starts = m.subtreeStart;
    const list = m.subtrees;
    const parents = m.parents;
    const active = m.active;
    if (nChanged === 1) {
      const e = starts[changed[0] + 1];
      for (let q = starts[changed[0]]; q < e; q++) this.reposeOne(list[q], parents, active);
      for (let q = starts[changed[0]]; q < e; q++) below[list[q]] = 0;
    } else {
      // The union of the changed bones' subtrees, in bone order.
      const visit = this.visit;
      let first = parents.length;
      for (let k = 0; k < nChanged; k++) {
        const b = changed[k];
        if (b < first) first = b;
        const e = starts[b + 1];
        for (let q = starts[b]; q < e; q++) visit[list[q]] = 1;
      }
      for (let b = first; b < parents.length; b++) if (visit[b] === 1) this.reposeOne(b, parents, active);
      for (let b = first; b < parents.length; b++) {
        visit[b] = 0;
        below[b] = 0;
      }
    }
    for (let k = 0; k < nChanged; k++) changedMark[changed[k]] = 0;
    for (let k = 0; k < nInWorld; k++) inWorldMark[this.inWorld[k]] = 0;
  }

  private reposeOne(b: number, parents: Int32Array, active: Uint8Array): void {
    const below = this.below;
    const p = parents[b];
    if (p >= 0 && below[p] === 1 && (active[p] === 1 || this.changedMark[p] === 1)) below[b] = 1;
    if (below[b] === 1 && this.inWorldMark[b] === 0) this.poseBone(b, false);
  }

  /** A bone's local values read back from its world transform (`localFromWorld`) — `normal`, `onlyTranslation` and `noRotationOrReflection`; a world target in a `noScale` mode is refused at load. */
  private localFromWorld(bi: number): void {
    const m = this.model;
    const W = this.world;
    const L = this.locals;
    const w = bi * WORLDS;
    const l = bi * LOCALS;
    const parent = m.parents[bi];
    const mode = parent < 0 ? MODE_NORMAL : m.modes[bi];
    let pa = 1;
    let pb = 0;
    let pc = 0;
    let pd = 1;
    let px = 0;
    let py = 0;
    if (parent >= 0) {
      const q = parent * WORLDS;
      pa = W[q + W_A];
      pb = W[q + W_B];
      pc = W[q + W_C];
      pd = W[q + W_D];
      px = W[q + W_X];
      py = W[q + W_Y];
    }
    const pid = 1 / (pa * pd - pb * pc);
    const dx = W[w + W_X] - px;
    const dy = W[w + W_Y] - py;
    L[l + L_X] = dx * (pd * pid) - dy * (pb * pid);
    L[l + L_Y] = dy * (pa * pid) - dx * (pc * pid);
    L[l + L_SHEAR_X] = 0;
    const wa = W[w + W_A];
    const wb = W[w + W_B];
    const wc = W[w + W_C];
    const wd = W[w + W_D];
    if (mode === MODE_ONLY_TRANSLATION) {
      this.decompose(l, wa, wc, wb, wd);
      return;
    }
    if (mode === MODE_NO_ROTATION_OR_REFLECTION) {
      const xLengthInverse = 1 / (pa * pa + pc * pc);
      const detInverse = 1 / Math.abs(pa * pd - pb * pc);
      this.decompose(l, (pa * wa + pc * wc) * xLengthInverse, (pa * wc - pc * wa) * detInverse, (pa * wb + pc * wd) * xLengthInverse, (pa * wd - pc * wb) * detInverse);
      L[l + L_ROTATION] = L[l + L_ROTATION] + Math.atan2(pc, pa) * DEG;
      return;
    }
    const ia = pd * pid;
    const ib = pb * pid;
    const ic = pc * pid;
    const id = pa * pid;
    this.decompose(l, ia * wa - ib * wc, id * wc - ic * wa, ia * wb - ib * wd, id * wd - ic * wb);
  }

  /** A local matrix with columns `(la, lc)` and `(lb, ld)` as rotation, scales and shear (`decompose`). */
  private decompose(l: number, la: number, lc: number, lb: number, ld: number): void {
    const L = this.locals;
    const sx = Math.sqrt(la * la + lc * lc);
    const yLength = Math.sqrt(lb * lb + ld * ld);
    if (!(sx > 0.0001)) {
      L[l + L_SCALE_X] = 0;
      L[l + L_SCALE_Y] = yLength;
      L[l + L_SHEAR_Y] = 0;
      L[l + L_ROTATION] = yLength > 0.00001 ? Math.atan2(ld, lb) * DEG - 90 : 0;
      return;
    }
    const xAngle = Math.atan2(lc, la) * DEG;
    const det = la * ld - lb * lc;
    const yAngle = Math.atan2(ld, lb) * DEG;
    L[l + L_ROTATION] = xAngle;
    L[l + L_SCALE_X] = sx;
    L[l + L_SCALE_Y] = det < 0 ? -yLength : yLength;
    const right = det < 0 ? -90 : 90;
    let shear = yAngle - (xAngle + right);
    shear = shear > 180 ? shear - 360 : shear < -180 ? shear + 360 : shear;
    L[l + L_SHEAR_Y] = yLength > 0.00001 ? shear : 0;
  }

  // ---------------------------------------------------------------------------
  // the slots and the vertices
  // ---------------------------------------------------------------------------

  /** Every slot's colour and what it shows (`posedSlots`): the setup's, then each of its timelines at `t` in order. */
  private slotValues(anim: RuntimeAnimation | null, t: number): void {
    const slots = this.model.slots;
    const light = this.light;
    for (let s = 0; s < slots.length; s++) {
      const slot = slots[s];
      this.shown[s] = slot.setupAttachment;
      const o = s * 4;
      light[o] = slot.light[0];
      light[o + 1] = slot.light[1];
      light[o + 2] = slot.light[2];
      light[o + 3] = slot.light[3];
    }
    if (anim === null) return;
    const timelines = anim.slots;
    for (let k = 0; k < timelines.length; k++) {
      const tl = timelines[k];
      const i = keyAt(tl.curve, this.cursors, tl.cursor, t);
      const attachments = tl.attachments;
      if (attachments !== null) {
        this.shown[tl.slot] = i < 0 ? slots[tl.slot].setupAttachment : attachments[i];
        continue;
      }
      const channels = tl.channels as Int32Array;
      const setup = slots[tl.slot].light;
      const o = tl.slot * 4;
      for (let c = 0; c < channels.length; c++) {
        const at = channels[c];
        light[o + at] = i < 0 ? setup[at] : clamp01(channelValue(tl.curve, i, c, t));
      }
    }
  }

  /** Every shown attachment's world vertices into `vertices` at its offset (`regionCorners`, `worldVertices`). */
  computeVertices(): void {
    const m = this.model;
    const W = this.world;
    const out = this.vertices;
    const shown = this.shown;
    const attachments = m.attachments;
    for (let s = 0; s < shown.length; s++) {
      const index = shown[s];
      if (index < 0) continue;
      const at = attachments[index];
      if (at.draw === DRAW_NONE) continue;
      let o = at.offset;
      if (at.draw === DRAW_REGION || at.draw === DRAW_MESH) {
        const b = at.bone * WORLDS;
        const a = W[b + W_A];
        const bb = W[b + W_B];
        const c = W[b + W_C];
        const d = W[b + W_D];
        const wx = W[b + W_X];
        const wy = W[b + W_Y];
        const local = at.local;
        if (at.draw === DRAW_REGION) {
          for (let q = 0; q < 8; q += 2) {
            const lx = local[q];
            const ly = local[q + 1];
            out[o++] = a * lx + bb * ly + wx;
            out[o++] = c * lx + d * ly + wy;
          }
        } else {
          for (let q = 0; q < at.count; q += 2) {
            const x = local[q];
            const y = local[q + 1];
            out[o++] = x * a + y * bb + wx;
            out[o++] = x * c + y * d + wy;
          }
        }
        continue;
      }
      // Weighted: per vertex, the sum over its bindings in order.
      const counts = at.bindingCounts;
      const bones = at.bindingBones;
      const xs = at.bindingX;
      const ys = at.bindingY;
      const weights = at.bindingWeights;
      let n = 0;
      for (let v = 0; v < counts.length; v++) {
        let wx = 0;
        let wy = 0;
        const end = n + counts[v];
        for (; n < end; n++) {
          const b = bones[n] * WORLDS;
          const x = xs[n];
          const y = ys[n];
          const weight = weights[n];
          wx += (x * W[b + W_A] + y * W[b + W_B] + W[b + W_X]) * weight;
          wy += (x * W[b + W_C] + y * W[b + W_D] + W[b + W_Y]) * weight;
        }
        out[o++] = wx;
        out[o++] = wy;
      }
    }
  }
}

/** A world-space, absolute transform of one property on a world transform (`applyWorld`). */
function applyWorld(w: Float64Array, property: number, v: number, mix: number): void {
  switch (property) {
    case P_ROTATE: {
      let r = v * RAD - Math.atan2(w[W_C], w[W_A]);
      if (r > RUNTIME_PI) r -= TWO_PI;
      else if (r < -RUNTIME_PI) r += TWO_PI;
      r *= mix;
      const cos = Math.cos(r);
      const sin = Math.sin(r);
      const a = w[W_A];
      const b = w[W_B];
      w[W_A] = cos * a - sin * w[W_C];
      w[W_B] = cos * b - sin * w[W_D];
      w[W_C] = sin * a + cos * w[W_C];
      w[W_D] = sin * b + cos * w[W_D];
      return;
    }
    case P_X:
      w[W_X] = w[W_X] + (v - w[W_X]) * mix;
      return;
    case P_Y:
      w[W_Y] = w[W_Y] + (v - w[W_Y]) * mix;
      return;
    case P_SCALE_X:
    case P_SCALE_Y: {
      const p = property === P_SCALE_X ? W_A : W_B;
      const q = property === P_SCALE_X ? W_C : W_D;
      const s = Math.sqrt(w[p] * w[p] + w[q] * w[q]);
      if (s === 0) return;
      const k = 1 + ((v - s) * mix) / s;
      w[p] *= k;
      w[q] *= k;
      return;
    }
    default: {
      const yAngle = Math.atan2(w[W_D], w[W_B]);
      const xAngle = Math.atan2(w[W_C], w[W_A]);
      let r = (v + 90) * RAD - (yAngle - xAngle);
      r = r > RUNTIME_PI ? r - TWO_PI : r < -RUNTIME_PI ? r + TWO_PI : r;
      const angle = yAngle + r * mix;
      const s = Math.sqrt(w[W_B] * w[W_B] + w[W_D] * w[W_D]);
      w[W_B] = Math.cos(angle) * s;
      w[W_D] = Math.sin(angle) * s;
    }
  }
}
