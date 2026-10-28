/**
 * The runtime poser's per-instance half (issue #1591, stage 9): one
 * `RuntimePose` per skeleton on screen, every buffer allocated when it is
 * made and overwritten in place on every pose, so that posing a frame
 * allocates nothing.
 *
 * ## What a pose is
 *
 * The oracle's sample, as `src/core/animation.ts` poses it (`poseAnimations`):
 * every pose is posed from the setup pose — the bones' setup local values,
 * then the animation's bone timelines at `t` at full weight, then the world
 * transforms parents first, then the draw order and each slot's light and dark
 * colour, attachment and own deform timelines, then the ik, transform, path,
 * physics and slider constraints in the document's order with their timelines'
 * values at `t`, each followed by the bones below what it moved posed again,
 * then the sliders' draw-order, slot and deform timelines; then, when asked,
 * every shown attachment's world vertices. Nothing of one unstepped pose
 * survives but key cursors. A stepped pose also keeps its physics clock,
 * offsets, velocities and lags; sliders select values within this pose rather
 * than advancing an independent track.
 *
 * ## The arithmetic is the oracle's
 *
 * Every formula below is the one the named function of `src/core/` computes,
 * in its order of operations, on the same doubles: a bone's frame and its
 * five inherit modes (`world.ts`), the timelines (`animation.ts`), the one-
 * and two-bone ik, the world-space transform, the path constraint (`constraints_path.ts`),
 * the read-back of a moved bone's local values and the update order (`constraints.ts`),
 * a region's corners and a mesh's vertices (`vertices.ts`). Each of those orders was fixed
 * there by measurement against spine-core 4.3.13 to the last bit; the runtime
 * does not re-measure them, it is held to the oracle at tolerance 0
 * (`tools/core_gate.ts`, *The runtime poser*), so an order changed here is a
 * difference there.
 *
 * ⚠️ The exactness hazards, each kept as the oracle has it: the setup value
 * plus 0 before a timeline's first key (which turns a `-0` setup into `0`);
 * a keyed ik, transform or path value reaching the pose through the setup blend
 * `setup + (value − setup)·1`; `Math.PI` for a folded uniform two-bone ik and
 * the runtime's 3.1415927 everywhere else; the `(−180, 180]` wrap; a mix of
 * exactly 0 touching nothing; an inactive bone posed as zeros by the
 * hierarchy and never posed again by a constraint, nor the bones below it.
 */
import { RuntimeDrawClipper } from './clip_draw.ts';
import type { CorePhysicsRecord } from '../core/constraints_physics.ts';
import { freshPhysicsState, resetPhysicsState, stepRuntimePhysics, type PhysicsState } from './physics.ts';
import { COLLAPSED_X_AXIS_SQ, RUNTIME_DEG, RUNTIME_PI } from '../core/world.ts';
import { channelValue, keyAt, deformFraction, CURVE_STEPPED } from './curves.ts';
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
  PATH_POSITION_PERCENT,
  PATH_ROTATE_CHAIN,
  PATH_ROTATE_CHAIN_SCALE,
  PATH_ROTATE_TANGENT,
  PATH_SPACING_LENGTH,
  PATH_SPACING_PERCENT,
  PATH_SPACING_PROPORTIONAL,
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
  type RuntimeConstraint,
  type RuntimeEvent,
  type RuntimeIk,
  type RuntimeModel,
  type RuntimePath,
  type RuntimeTransform,
  type RuntimeSlider,
  type RuntimePhysicsTimeline,
} from './model.ts';

const DEG = RUNTIME_DEG;
const TWO_PI = 2 * RUNTIME_PI;
const PATH_EPSILON = 0.00001;
// The transform properties, by `TRANSFORM_PROPERTIES` index (src/core/constraints.ts).
const P_ROTATE = 0;
const P_X = 1;
const P_Y = 2;
const P_SCALE_X = 3;
const P_SCALE_Y = 4;
// `applyLocal` in src/core/constraints.ts: the six transform properties' local fields.
const PROPERTY_LOCAL = new Int32Array([L_ROTATION, L_X, L_Y, L_SCALE_X, L_SCALE_Y, L_SHEAR_Y]);

/** A change brought once into (−180, 180] — −180 goes to 180 (src/core/constraints.ts). */
function wrap180(r: number): number {
  return r > 180 ? r - 360 : r <= -180 ? r + 360 : r;
}

/** The runtime's `scaleY` for a bone an ik scaled by `s` along its length (src/core/constraints.ts, the `volume` measurement). */
function volumeScaleY(scaleY: number, s: number): number {
  return scaleY / (s < 0.7 ? 0.25 + s * 0.642857 : s);
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** A caller-supplied physics clock; animation/track time still uses dt itself. */
export interface RuntimePoseOptions { readonly clock?: (dt: number) => number }
export type RuntimePhysicsPhase = 'none' | 'reset' | 'update';

/** One skeleton's pose, every value in place. Read `world`, `light`, `dark`, `shown`, `drawOrder` and `vertices` after a pose. */
export class RuntimePose {
  readonly model: RuntimeModel;
  /** Every bone's local values, `LOCALS` per bone (`L_*`). */
  readonly locals: Float64Array;
  /** Every bone's world transform, `WORLDS` per bone (`W_*`). */
  readonly world: Float64Array;
  /** Every slot's light colour, four per slot. */
  readonly light: Float64Array;
  /** Every slot's dark colour, three per slot (`r2`, `g2`, `b2`), or zeros when `model.slots[s].dark === null`. */
  readonly dark: Float64Array;
  /** What every slot shows: an index into `model.attachments`, or −1 for nothing. */
  readonly shown: Int32Array;
  /** The slot indices in the live frame's draw order (`0 .. model.slots.length - 1`), updated in place. */
  readonly drawOrder: Int32Array;
  /** Every attachment's world vertices at its `offset`, written by `computeVertices` for the attachments shown. */
  readonly vertices: Float64Array;
  /** Buffered clipping output; null when the compiled model has no clipping attachments. */
  readonly clipping: RuntimeDrawClipper | null;
  /** Held/interpolated deform values, one pair per binding when weighted. */
  readonly deform: Float64Array;
  private readonly deformed: Uint8Array;
  /** The running sum of `step`'s steps, and the animation time the last pose was posed at. */
  trackTime = 0;
  time = 0;

  private readonly fired: RuntimeEvent[] = [];
  /** Borrowed immutable event records, in delivery order, until the next apply/step. */
  get events(): readonly RuntimeEvent[] { return this.fired; }
  private eventTime = -1;

  private current: RuntimeAnimation | null = null;
  private readonly cursors: Int32Array;
  // The constraints' values as posed: an ik's mix, softness and flags, a transform's six mixes, a path's position, spacing and three mixes.
  private readonly ikMix: Float64Array;
  private readonly ikSoftness: Float64Array;
  private readonly ikFlags: Uint8Array;
  private readonly mixes: Float64Array;
  private readonly pathValues: Float64Array;
  private readonly pathSlotSign: Int8Array;
  private readonly pathSpaces: Float64Array;
  private readonly pathLengths: Float64Array;
  private readonly pathPositions: Float64Array;
  private readonly pathWorldPts: Float64Array;
  private readonly pathChain: Float64Array;
  private readonly pathCurveEnds: Float64Array;
  private readonly pathSegmentEnds = new Float64Array(10);
  // The update order's scratch: the bones a constraint changed and moved in world space, in order (repeats kept, as the oracle keeps them), and per-bone marks.
  private readonly changed: Int32Array;
  private readonly inWorld: Int32Array;
  private readonly changedMark: Uint8Array;
  private readonly inWorldMark: Uint8Array;
  private readonly below: Uint8Array;
  private readonly visit: Uint8Array;
  private readonly w = new Float64Array(WORLDS);

  /** Sum of caller-supplied physics deltas, independent of animation time. */
  physicsTime = 0;
  private physicsLast = -1;
  private physicsPhase: RuntimePhysicsPhase = 'none';
  private physicsReady = false;
  private readonly hasPhysics: boolean;
  private readonly physicsStates: PhysicsState[];
  private readonly physicsRecords: Array<CorePhysicsRecord | null>;
  private readonly physicsScope: Uint8Array;
  private readonly environment = new Float64Array([1, 0, 0, 1]);
  private readonly sliderTime: Float64Array;
  private readonly sliderMix: Float64Array;
  private readonly sliderAt: Float64Array;
  private readonly clock: ((dt: number) => number) | undefined;

  constructor(model: RuntimeModel, options: RuntimePoseOptions = {}) {
    this.model = model;
    this.clipping = model.attachments.some(at => at.clip !== undefined) ? new RuntimeDrawClipper(model) : null;
    this.clock = options.clock;
    this.hasPhysics = model.constraints.some(c => c.kind === 'physics');
    this.physicsStates = model.constraints.map(() => freshPhysicsState());
    this.physicsRecords = model.constraints.map(c => c.kind === 'physics' ? { ...c.setup } : null);
    this.sliderTime = new Float64Array(model.constraints.length);
    this.sliderMix = new Float64Array(model.constraints.length);
    this.sliderAt = new Float64Array(model.constraints.length);
    const nb = model.boneNames.length;
    const ns = model.slots.length;
    const nc = model.constraints.length;
    this.physicsScope = new Uint8Array(nc);
    this.locals = new Float64Array(nb * LOCALS);
    this.world = new Float64Array(nb * WORLDS);
    this.light = new Float64Array(ns * 4);
    this.dark = new Float64Array(ns * 3);
    this.shown = new Int32Array(ns);
    this.drawOrder = new Int32Array(ns);
    for (let s = 0; s < ns; s++) this.drawOrder[s] = s;
    this.vertices = new Float64Array(model.vertexCount);
    this.deform = new Float64Array(model.deformCount);
    this.deformed = new Uint8Array(model.attachments.length);
    this.cursors = new Int32Array(Math.max(1, model.cursors)).fill(-1);
    this.ikMix = new Float64Array(nc);
    this.ikSoftness = new Float64Array(nc);
    this.ikFlags = new Uint8Array(nc);
    this.mixes = new Float64Array(nc * 6);
    this.pathValues = new Float64Array(nc * 5);
    this.pathSlotSign = new Int8Array(nc);
    const ms = model.maxPathSpaces;
    const mv = model.maxPathVertices;
    this.pathSpaces = new Float64Array(ms);
    this.pathLengths = new Float64Array(ms);
    this.pathPositions = new Float64Array(ms > 0 ? ms * 3 + 2 : 0);
    this.pathWorldPts = new Float64Array(mv);
    this.pathChain = new Float64Array(mv > 0 ? mv + 4 : 0);
    this.pathCurveEnds = new Float64Array(mv > 0 ? Math.ceil(mv / 6) + 1 : 0);
    // Sized by the longest target list (`RuntimeModel.scratch`): a transform may name one bone several times, and every entry is applied and reposed.
    this.changed = new Int32Array(model.scratch);
    this.inWorld = new Int32Array(model.scratch);
    this.changedMark = new Uint8Array(nb);
    this.inWorldMark = new Uint8Array(nb);
    this.below = new Uint8Array(nb);
    this.visit = new Uint8Array(nb);
  }

  /** The animation this pose plays (a covered one: `model.animation` throws a `RuntimeRefusal` for a refused one), from track time 0. */
  setAnimation(name: string): void {
    this.current = this.model.animation(name);
    this.physicsTime = 0;
    this.physicsLast = -1;
    this.physicsReady = false;
    for (let k = 0; k < this.physicsStates.length; k++) resetPhysicsState(this.physicsStates[k], 0);
    this.cursors.fill(-1);
    this.trackTime = 0;
    this.time = 0;
    this.eventTime = -1;
    this.fired.length = 0;
  }

  /**
   * Restore one animation's two clocks without delivering keys already passed.
   * A skin/view replacement uses the old pose's trackTime and wrapped time.
   * Unlike setAnimation + apply, restoration never replays the initial interval.
   */
  restore(name: string, trackTime: number, animationTime: number): void {
    if (!Number.isFinite(trackTime)) throw new RuntimeInputError(`restore: track time ${trackTime} is not finite`);
    if (!Number.isFinite(animationTime)) throw new RuntimeInputError(`restore: animation time ${animationTime} is not finite`);
    this.setAnimation(name);
    this.trackTime = trackTime;
    if (!this.model.restoreEventsFromStart) this.eventTime = animationTime;
    this.apply(animationTime);
  }

  /** The setup pose: every constraint applied with its own values, every slot as it is set up. */
  setupPose(physics: RuntimePhysicsPhase = 'none'): void {
    this.physicsPhase = physics;
    this.current = null;
    this.time = 0;
    this.eventTime = -1;
    this.fired.length = 0;
    this.physicsValues(null, 0, false);
    this.locals.set(this.model.setup);
    this.hierarchy();
    this.slotValues(null, 0);
    this.deformValues(null, 0);
    this.constraintValues(null, 0);
    this.solveConstraints();
    this.sliderAttachments();
  }

  /** The animation posed at its time `t`, from the setup pose (the header). */
  apply(t: number, physics: RuntimePhysicsPhase = 'none', delta = 0): void {
    const anim = this.current;
    if (anim === null) throw new RuntimeInputError('apply: no animation is set (setAnimation first)');
    if (!Number.isFinite(t)) throw new RuntimeInputError(`apply: the time ${t} is not finite`);
    if (!Number.isFinite(delta) || delta < 0) throw new RuntimeInputError(`apply: physics delta ${delta} is not finite and at or above 0`);
    this.physicsPhase = physics;
    // Reset keys see the old clock. The skeleton moves by delta only after application.
    this.physicsValues(anim, t, physics !== 'none');
    if (physics !== 'none') {
      this.physicsTime += delta;
      this.physicsReady = true;
    }
    this.collectEvents(anim, t);
    this.time = t;
    this.boneTimelines(anim, t);
    this.hierarchy();
    this.slotValues(anim, t);
    this.deformValues(anim, t);
    this.constraintValues(anim, t);
    this.solveConstraints();
    this.sliderAttachments();
  }

  /** One step of a looping track: the track time moved by `dt`, the animation posed at it wrapped by the duration (`loopedTime` in src/core/raw.ts). */
  step(dt: number): void {
    const anim = this.current;
    if (anim === null) throw new RuntimeInputError('step: no animation is set (setAnimation first)');
    if (!Number.isFinite(dt) || dt < 0) throw new RuntimeInputError(`step: delta ${dt} is not finite and at or above 0`);
    if (!this.physicsReady && this.hasPhysics) {
      // Initial physics setup must not consume the event interval of this step.
      const lastEventTime = this.eventTime;
      this.apply(this.time, 'reset', 0);
      this.eventTime = lastEventTime;
    }
    const moved = this.clock === undefined ? dt : this.clock(dt);
    if (!Number.isFinite(moved) || moved < 0) throw new RuntimeInputError(`step: physics clock moved by ${moved}, not finite and at or above 0`);
    this.trackTime += dt;
    this.apply(anim.duration === 0 ? 0 : this.trackTime % anim.duration, 'update', moved);
  }

  /** The oracle interval (last,t], tail then head on a wrap; never copies a payload. */
  private collectEvents(anim: RuntimeAnimation, t: number): void {
    const last = this.eventTime;
    const wrapped = t < last;
    const keys = anim.eventKeys;
    let count = 0;
    if (wrapped) for (let i = 0; i < keys.length; i++) if (keys[i].time > last) this.fired[count++] = keys[i];
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (key.time <= t && (wrapped ? !this.model.eventWrapOffByOne || key.time > 0 : key.time > last)) this.fired[count++] = key;
    }
    this.fired.length = count;
    this.eventTime = t;
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
      } else if (c.kind === 'transform') {
        const o = k * 6;
        for (let p = 0; p < 6; p++) this.mixes[o + p] = tl === null || i < 0 ? c.mixes[p] : c.mixes[p] + (channelValue(tl.curve, i, p, t) - c.mixes[p]) * 1;
      } else if (c.kind === 'slider') {
        const keyed = anim === null ? null : anim.sliders[k];
        let time = c.setup.time, mix = c.setup.mix;
        if (keyed !== null) {
          if (keyed.time !== null) {
            const q = keyAt(keyed.time, this.cursors, keyed.timeCursor, t);
            if (q >= 0) time += (channelValue(keyed.time, q, 0, t) - time) * 1;
          }
          if (keyed.mix !== null) {
            const q = keyAt(keyed.mix, this.cursors, keyed.mixCursor, t);
            if (q >= 0) mix += (channelValue(keyed.mix, q, 0, t) - mix) * 1;
          }
        }
        this.sliderTime[k] = time;
        this.sliderMix[k] = mix;
      } else if (c.kind === 'path') {
        const keyed = anim === null ? null : anim.paths[k];
        let position = c.position;
        let spacing = c.spacing;
        let mixRotate = c.mixRotate;
        let mixX = c.mixX;
        let mixY = c.mixY;
        if (keyed !== null) {
          if (keyed.position !== null) {
            const q = keyAt(keyed.position, this.cursors, keyed.positionCursor, t);
            if (q >= 0) position = c.position + (channelValue(keyed.position, q, 0, t) - c.position) * 1;
          }
          if (keyed.spacing !== null) {
            const q = keyAt(keyed.spacing, this.cursors, keyed.spacingCursor, t);
            if (q >= 0) spacing = c.spacing + (channelValue(keyed.spacing, q, 0, t) - c.spacing) * 1;
          }
          if (keyed.mix !== null) {
            const q = keyAt(keyed.mix, this.cursors, keyed.mixCursor, t);
            if (q >= 0) {
              mixRotate = c.mixRotate + (channelValue(keyed.mix, q, 0, t) - c.mixRotate) * 1;
              mixX = c.mixX + (channelValue(keyed.mix, q, 1, t) - c.mixX) * 1;
              mixY = c.mixY + (channelValue(keyed.mix, q, 2, t) - c.mixY) * 1;
            }
          }
        }
        const o = k * 5;
        this.pathValues[o] = position;
        this.pathValues[o + 1] = spacing;
        this.pathValues[o + 2] = mixRotate;
        this.pathValues[o + 3] = mixX;
        this.pathValues[o + 4] = mixY;
      }
    }
  }

  /** Every applied constraint in the document's order, each followed by the update order's repose (`applyConstraints`). */
  private solveConstraints(): void {
    const cs = this.model.constraints;
    const hasPath = this.model.hasPath;
    for (let k = 0; k < cs.length; k++) {
      if (hasPath) this.snapSlotBones(k, false);
      const c = cs[k];
      if (!c.applied) continue;
      if (c.kind === 'ik') this.solveIk(c, k);
      else if (c.kind === 'transform') this.solveTransform(c, k);
      else if (c.kind === 'slider') this.solveSlider(c, k);
      else if (c.kind === 'path') this.solvePath(c, k);
      else if (this.physicsPhase !== 'none' && !this.model.omitPhysics) {
        const b = c.bones[0];
        if (stepRuntimePhysics(this.physicsRecords[k]!, this.physicsStates[k], this.world, b * WORLDS, this.model.lengths[b], this.physicsTime, this.physicsPhase === 'reset', this.environment)) {
          this.changed[0] = this.inWorld[0] = b;
          this.repose(1, 1);
        }
      }
      if (hasPath) this.snapSlotBones(k, true);
    }
  }

  private snapSlotBones(at: number, after: boolean): void {
    const cs = this.model.constraints;
    const W = this.world;
    for (let k = 0; k < cs.length; k++) {
      const c = cs[k];
      if (c.kind !== 'path' || c.slotEventAt !== at || c.slotEventAfter !== after || (k === at && !after)) continue;
      const sb = c.slotBone * WORLDS;
      this.pathSlotSign[k] = W[sb + W_A] * W[sb + W_D] - W[sb + W_B] * W[sb + W_C] > 0 ? 1 : -1;
    }
  }

  /** Reset where the consumer starts: the setup pose or animation pose zero. */
  resetPhysics(at: 'setup' | 'animation' = 'animation'): void {
    this.physicsTime = 0;
    this.physicsLast = -1;
    for (let k = 0; k < this.physicsStates.length; k++) resetPhysicsState(this.physicsStates[k], 0);
    if (at === 'animation') this.apply(0, 'reset', 0);
    else {
      const current = this.current;
      this.setupPose('reset');
      this.current = current;
    }
    this.physicsReady = true;
  }

  private checkPhysicsScope(scope: readonly string[] | undefined): Uint8Array | null {
    if (scope === undefined) return null;
    if (!Array.isArray(scope)) throw new RuntimeInputError(`physics movement scope is ${String(scope)}, not an array of physics constraint names`);
    const selected = this.physicsScope;
    selected.fill(0);
    const cs = this.model.constraints;
    for (let i = 0; i < scope.length; i++) {
      const name = scope[i];
      if (typeof name !== 'string') throw new RuntimeInputError(`physics movement scope name ${String(name)} is not a string`);
      let found: RuntimeConstraint | undefined;
      for (let k = 0; k < cs.length; k++) {
        if (cs[k].kind === 'physics' && cs[k].name === name) {
          found = cs[k];
          break;
        }
      }
      if (found === undefined) {
        for (let k = 0; k < cs.length; k++) {
          if (cs[k].name === name) {
            found = cs[k];
            break;
          }
        }
      }
      if (found === undefined) throw new RuntimeInputError(`physics movement scope: no constraint "${name}"; this document declares [${cs.map((c) => c.name).join(', ')}]`);
      if (found.kind !== 'physics') throw new RuntimeInputError(`physics movement scope: constraint "${name}" is ${found.kind}, not physics`);
      selected[found.index] = 1;
    }
    return this.model.ignorePhysicsScope ? null : selected;
  }

  /** External motion changes the previous origin, never the authored locals. */
  physicsTranslate(x: number, y: number, scope?: readonly string[]): void {
    const selected = this.checkPhysicsScope(scope);
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new RuntimeInputError('physicsTranslate: x and y must be finite');
    for (let k = 0; k < this.physicsStates.length; k++) {
      if (selected !== null && selected[k] === 0) continue;
      const s = this.physicsStates[k];
      s.ux -= x; s.uy -= y; s.cx -= x; s.cy -= y;
    }
  }

  physicsRotate(x: number, y: number, degrees: number, scope?: readonly string[]): void {
    const selected = this.checkPhysicsScope(scope);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(degrees)) throw new RuntimeInputError('physicsRotate: x, y and degrees must be finite');
    const r = degrees * RAD, cos = Math.cos(r), sin = Math.sin(r);
    for (let k = 0; k < this.physicsStates.length; k++) {
      if (selected !== null && selected[k] === 0) continue;
      const s = this.physicsStates[k];
      const dx = s.cx - x, dy = s.cy - y;
      const tx = dx * cos - dy * sin - dx, ty = dx * sin + dy * cos - dy;
      s.ux -= tx; s.uy -= ty; s.cx -= tx; s.cy -= ty;
    }
  }

  setEnvironment(env: { readonly wind: readonly [number, number]; readonly gravity: readonly [number, number] }): void {
    if (!Number.isFinite(env.wind[0]) || !Number.isFinite(env.wind[1]) || !Number.isFinite(env.gravity[0]) || !Number.isFinite(env.gravity[1])) throw new RuntimeInputError('setEnvironment: wind and gravity must be finite');
    this.environment[0] = env.wind[0]; this.environment[1] = env.wind[1];
    this.environment[2] = env.gravity[0]; this.environment[3] = env.gravity[1];
  }

  /** The per-pass values start at setup, before any slider writes. */
  private physicsValues(anim: RuntimeAnimation | null, t: number, resets: boolean): void {
    const cs = this.model.constraints;
    for (let k = 0; k < cs.length; k++) {
      const c = cs[k];
      if (c.kind !== 'physics') continue;
      const r = this.physicsRecords[k]!;
      r.inertia = c.setup.inertia; r.strength = c.setup.strength; r.damping = c.setup.damping;
      r.massInverse = c.setup.massInverse; r.wind = c.setup.wind; r.gravity = c.setup.gravity; r.mix = c.setup.mix;
    }
    if (anim !== null) this.physicsTimelines(anim.physics, t, 1, false, true, resets);
    if (resets) this.physicsLast = t;
  }

  private physicsTimelines(timelines: readonly RuntimePhysicsTimeline[], t: number, alpha: number, additive: boolean, setup: boolean, resets = false): void {
    for (let q = 0; q < timelines.length; q++) {
      const tl = timelines[q];
      if (tl.kind === 'reset') {
        if (!resets) continue; // a slider applies at one value; no key is crossed
        let crossed = false;
        const last = this.physicsLast;
        for (let i = 0; i < tl.curve.keys; i++) {
          const time = tl.curve.times[i];
          if (t < last ? time > last || time <= t : time > last && time <= t) crossed = true;
        }
        if (crossed) for (let j = 0; j < tl.targets.length; j++) resetPhysicsState(this.physicsStates[tl.targets[j]], this.physicsTime);
        continue;
      }
      const i = keyAt(tl.curve, this.cursors, tl.cursor, t);
      if (i < 0) {
        // A track's before-first key restores setup even if an earlier global
        // timeline wrote this parameter. A slider's before-first key writes nothing.
        if (setup) for (let j = 0; j < tl.targets.length; j++) {
          const k = tl.targets[j], r = this.physicsRecords[k]!;
          const original = (this.model.constraints[k] as { setup: CorePhysicsRecord }).setup;
          if (tl.kind === 'mass') r.massInverse = original.massInverse;
          else r[tl.kind] = original[tl.kind];
        }
        continue;
      }
      const v = channelValue(tl.curve, i, 0, t);
      for (let j = 0; j < tl.targets.length; j++) {
        const k = tl.targets[j], r = this.physicsRecords[k]!;
        const from = setup ? (this.model.constraints[k] as { setup: CorePhysicsRecord }).setup : r;
        if (tl.kind === 'mass') {
          const mass = 1 / from.massInverse;
          r.massInverse = 1 / (mass + (v - mass) * alpha);
        } else {
          r[tl.kind] = additive && (tl.kind === 'wind' || tl.kind === 'gravity') ? r[tl.kind] + v * alpha : from[tl.kind] + (v - from[tl.kind]) * alpha;
        }
      }
    }
  }

  /** Read the dial where previous constraints left it; this value is never track time. */
  private solveSlider(c: RuntimeSlider, k: number): void {
    const alpha = this.sliderMix[k];
    if (alpha === 0) return;
    let time = this.sliderTime[k];
    const r = c.setup, a = c.animation;
    if (c.bone >= 0) {
      const b = c.bone, w = b * WORLDS, l = b * LOCALS;
      let value: number;
      if (r.local) {
        const field = c.property === 0 ? L_ROTATION : c.property === 1 ? L_X : c.property === 2 ? L_Y : c.property === 3 ? L_SCALE_X : c.property === 4 ? L_SCALE_Y : L_SHEAR_Y;
        value = this.locals[l + field] + 0;
      } else {
        const W = this.world, x = W[w], y = W[w + 2], bx = W[w + 1], by = W[w + 3];
        switch (c.property) {
          case 0: value = Math.atan2(y, x) * DEG + (x * by - bx * y > 0 ? 0 : -0); if (value < 0) value += 360; break;
          case 1: value = x * 0 + bx * 0 + W[w + W_X]; break;
          case 2: value = y * 0 + by * 0 + W[w + W_Y]; break;
          case 3: value = Math.sqrt(x * x + y * y) + 0; break;
          case 4: value = Math.sqrt(bx * bx + by * by) + 0; break;
          default: value = (Math.atan2(by, bx) - Math.atan2(y, x)) * DEG - 90 + 0;
        }
      }
      time = r.to + (value - r.from) * r.scale;
      time = r.loop ? a.duration === 0 ? 0 : a.duration + time % a.duration : Math.max(0, time);
    }
    const at = this.model.sliderAsTrack ? this.time : r.loop && a.duration !== 0 ? time % a.duration : time;
    this.sliderAt[k] = at;
    if (this.physicsPhase !== 'none') this.physicsTimelines(a.physics, at, alpha, r.additive, false);
    const L = this.locals, S = this.model.setup;
    for (let q = 0; q < a.sliderBones.length; q++) {
      const tl = a.sliderBones[q], i = keyAt(tl.curve, this.cursors, tl.cursor, at);
      if (i < 0) continue;
      const o = tl.bone * LOCALS;
      for (let f = 0; f < tl.fields.length; f++) {
        const n = o + tl.fields[f], v = channelValue(tl.curve, i, f, at), current = L[n], setup = S[n];
        if (tl.multiply[f]) {
          if (r.additive) L[n] = current + (v * setup - setup) * alpha;
          else {
            const target = setup * v, from = Math.abs(current) * Math.sign(target);
            L[n] = alpha === 1 ? target : from + (target - from) * alpha;
          }
        } else L[n] = r.additive ? current + v * alpha : current + (setup + v - current) * alpha;
      }
    }
    for (let q = 0; q < c.bones.length; q++) this.changed[q] = c.bones[q];
    if (c.bones.length > 0) this.repose(c.bones.length, 0);
  }

  /** A path constraint (`solvePath` in `src/core/constraints_path.ts`), every buffer overwritten in place. */
  private solvePath(c: RuntimePath, k: number): void {
    if (c.attachment < 0 || this.model.omitPath) return;
    const o5 = k * 5;
    const position = this.pathValues[o5];
    const spacing = this.pathValues[o5 + 1];
    const mixRotate = this.pathValues[o5 + 2];
    const mixX = this.pathValues[o5 + 3];
    const mixY = this.pathValues[o5 + 4];
    if (mixRotate === 0 && mixX === 0 && mixY === 0) return;
    const wantsTangent = c.rotateMode === PATH_ROTATE_TANGENT;
    const scale = c.rotateMode === PATH_ROTATE_CHAIN_SCALE;
    const bones = c.bones;
    const boneCount = bones.length;
    const spaceCount = wantsTangent ? boneCount : boneCount + 1;
    const spaces = this.pathSpaces;
    const lengths = this.pathLengths;
    const W = this.world;
    const modelLengths = this.model.lengths;
    spaces[0] = 0;
    if (c.spacingMode === PATH_SPACING_PERCENT) {
      if (scale) {
        for (let i = 0; i < spaceCount - 1; i++) {
          const bi = bones[i];
          const boneLength = modelLengths[bi];
          const w = bi * WORLDS;
          const x = boneLength * W[w + W_A];
          const y = boneLength * W[w + W_C];
          lengths[i] = Math.sqrt(x * x + y * y);
        }
      }
      for (let i = 1; i < spaceCount; i++) spaces[i] = spacing;
    } else if (c.spacingMode === PATH_SPACING_PROPORTIONAL) {
      let sum = 0;
      for (let i = 0, n = spaceCount - 1; i < n; ) {
        const bi = bones[i];
        const boneLength = modelLengths[bi];
        if (boneLength < PATH_EPSILON) {
          if (scale) lengths[i] = 0;
          spaces[++i] = spacing;
        } else {
          const w = bi * WORLDS;
          const x = boneLength * W[w + W_A];
          const y = boneLength * W[w + W_C];
          const length = Math.sqrt(x * x + y * y);
          if (scale) lengths[i] = length;
          spaces[++i] = length;
          sum += length;
        }
      }
      if (sum > 0) {
        sum = (spaceCount / sum) * spacing;
        for (let i = 1; i < spaceCount; i++) spaces[i] *= sum;
      }
    } else {
      const addsLength = c.spacingMode === PATH_SPACING_LENGTH;
      for (let i = 0, n = spaceCount - 1; i < n; ) {
        const bi = bones[i];
        const boneLength = modelLengths[bi];
        if (boneLength < PATH_EPSILON) {
          if (scale) lengths[i] = 0;
          spaces[++i] = spacing;
        } else {
          const w = bi * WORLDS;
          const x = boneLength * W[w + W_A];
          const y = boneLength * W[w + W_C];
          const length = Math.sqrt(x * x + y * y);
          if (scale) lengths[i] = length;
          spaces[++i] = ((addsLength ? Math.max(0, boneLength + spacing) : spacing) * length) / boneLength;
        }
      }
    }
    this.positionsOfPath(c, position, spaceCount, wantsTangent);
    const positions = this.pathPositions;
    let atX = positions[0];
    let atY = positions[1];
    let offsetRotation = c.offsetRotation;
    let fromTip: boolean;
    if (offsetRotation === 0) fromTip = c.rotateMode === PATH_ROTATE_CHAIN;
    else {
      fromTip = false;
      let positive: boolean;
      if (c.slotEventAt === k && !c.slotEventAfter) {
        const sb = c.slotBone * WORLDS;
        positive = W[sb + W_A] * W[sb + W_D] - W[sb + W_B] * W[sb + W_C] > 0;
      } else {
        positive = c.slotEventAt >= 0 && this.pathSlotSign[k] > 0;
      }
      offsetRotation *= positive ? RAD : -RAD;
    }
    for (let i = 0, p = 3; i < boneCount; i++, p += 3) {
      const bi = bones[i];
      const o = bi * WORLDS;
      let wa = W[o + W_A];
      let wb = W[o + W_B];
      let wc = W[o + W_C];
      let wd = W[o + W_D];
      const wx = W[o + W_X] + (atX - W[o + W_X]) * mixX;
      const wy = W[o + W_Y] + (atY - W[o + W_Y]) * mixY;
      const x = positions[p];
      const y = positions[p + 1];
      const dx = x - atX;
      const dy = y - atY;
      if (scale) {
        const length = lengths[i];
        if (length >= PATH_EPSILON) {
          const s = (Math.sqrt(dx * dx + dy * dy) / length - 1) * mixRotate + 1;
          wa *= s;
          wc *= s;
        }
      }
      atX = x;
      atY = y;
      if (mixRotate > 0) {
        const a = wa;
        const bb = wb;
        const cc = wc;
        const d = wd;
        let r: number;
        if (wantsTangent) r = positions[p - 1];
        else if (spaces[i + 1] === 0) r = positions[p + 2];
        else r = Math.atan2(dy, dx);
        r -= Math.atan2(cc, a);
        if (fromTip) {
          const cos = Math.cos(r);
          const sin = Math.sin(r);
          const length = modelLengths[bi];
          atX += (length * (cos * a - sin * cc) - dx) * mixRotate;
          atY += (length * (sin * a + cos * cc) - dy) * mixRotate;
        } else r += offsetRotation;
        if (r > RUNTIME_PI) r -= TWO_PI;
        else if (r < -RUNTIME_PI) r += TWO_PI;
        r *= mixRotate;
        const cos = Math.cos(r);
        const sin = Math.sin(r);
        wa = cos * a - sin * cc;
        wb = cos * bb - sin * d;
        wc = sin * a + cos * cc;
        wd = sin * bb + cos * d;
      }
      W[o + W_A] = wa;
      W[o + W_B] = wb;
      W[o + W_C] = wc;
      W[o + W_D] = wd;
      W[o + W_X] = wx;
      W[o + W_Y] = wy;
      this.changed[i] = bi;
      this.inWorld[i] = bi;
    }
    if (boneCount > 0) this.repose(boneCount, boneCount);
  }

  private computePathWorld(c: RuntimePath): void {
    const at = this.model.attachments[c.attachment];
    const W = this.world;
    const pts = this.pathWorldPts;
    const deformed = this.deformed[c.attachment] !== 0;
    if (at.bindingCounts.length === 0) {
      const b = c.slotBone * WORLDS;
      const a = W[b + W_A];
      const bb = W[b + W_B];
      const cc = W[b + W_C];
      const d = W[b + W_D];
      const wx = W[b + W_X];
      const wy = W[b + W_Y];
      const local = deformed ? this.deform : at.local;
      const lo = deformed ? at.deformOffset : 0;
      for (let q = 0; q < c.pathVertices; q += 2) {
        const x = local[lo + q];
        const y = local[lo + q + 1];
        pts[q] = x * a + y * bb + wx;
        pts[q + 1] = x * cc + y * d + wy;
      }
      return;
    }
    const counts = at.bindingCounts;
    const bones = at.bindingBones;
    const xs = at.bindingX;
    const ys = at.bindingY;
    const weights = at.bindingWeights;
    let n = 0;
    let o = 0;
    for (let v = 0; v < counts.length; v++) {
      let wx = 0;
      let wy = 0;
      const end = n + counts[v];
      for (; n < end; n++) {
        const b = bones[n] * WORLDS;
        const weight = weights[n];
        const x = deformed ? xs[n] + this.deform[at.deformOffset + n * 2] : xs[n];
        const y = deformed ? ys[n] + this.deform[at.deformOffset + n * 2 + 1] : ys[n];
        wx += (x * W[b + W_A] + y * W[b + W_B] + W[b + W_X]) * weight;
        wy += (x * W[b + W_C] + y * W[b + W_D] + W[b + W_Y]) * weight;
      }
      pts[o++] = wx;
      pts[o++] = wy;
    }
  }

  private positionsOfPath(c: RuntimePath, position: number, spaceCount: number, wantsTangent: boolean): void {
    this.computePathWorld(c);
    const pts = this.pathWorldPts;
    const vc = c.pathVertices;
    const n = vc / 2;
    const spaces = this.pathSpaces;
    const out = this.pathPositions;
    const outLen = spaceCount * 3 + 2;
    for (let i = 0; i < outLen; i++) out[i] = 0;
    const closed = c.closed;
    if (!c.constantSpeed) {
      const lengths = c.lengths;
      const curveCount = n / 3 - (closed ? 1 : 2);
      const total = lengths[curveCount];
      if (c.positionMode === PATH_POSITION_PERCENT) position *= total;
      const spaceScale = c.spacingMode === PATH_SPACING_PERCENT ? total : c.spacingMode === PATH_SPACING_PROPORTIONAL ? total / spaceCount : 1;
      let curve = 0;
      for (let i = 0, o = 0; i < spaceCount; i++, o += 3) {
        const space = spaces[i] * spaceScale;
        position += space;
        let p = position;
        if (closed) {
          p %= total;
          if (p < 0) p += total;
          curve = 0;
        } else if (p < 0) {
          onLineBefore(p, pts[2], pts[3], pts[4], pts[5], out, o);
          continue;
        } else if (p > total) {
          const m0 = 2 * (n - 3);
          const m1 = 2 * (n - 2);
          onLinePast(p - total, pts[m0], pts[m0 + 1], pts[m1], pts[m1 + 1], out, o);
          continue;
        }
        for (;; curve++) {
          const length = lengths[curve];
          if (p > length) continue;
          if (curve === 0) p /= length;
          else {
            const prev = lengths[curve - 1];
            p = (p - prev) / (length - prev);
          }
          break;
        }
        const kk = 3 * curve + 1;
        const i0 = (kk % n) * 2;
        const i1 = ((kk + 1) % n) * 2;
        const i2 = ((kk + 2) % n) * 2;
        const i3 = ((kk + 3) % n) * 2;
        onCurve(p, pts[i0], pts[i0 + 1], pts[i1], pts[i1 + 1], pts[i2], pts[i2 + 1], pts[i3], pts[i3 + 1], out, o, wantsTangent || (i > 0 && space === 0));
      }
      return;
    }
    const chain = this.pathChain;
    let chainLen = 0;
    if (closed) {
      for (let q = 2; q < vc; q++) chain[chainLen++] = pts[q];
      chain[chainLen++] = pts[0];
      chain[chainLen++] = pts[1];
      chain[chainLen++] = pts[2];
      chain[chainLen++] = pts[3];
    } else {
      for (let q = 2; q < vc - 2; q++) chain[chainLen++] = pts[q];
    }
    const curveCount = closed ? n / 3 : n / 3 - 1;
    const curveEnds = this.pathCurveEnds;
    let total = 0;
    let cx0 = chain[0];
    let cy0 = chain[1];
    for (let i = 0, w = 2; i < curveCount; i++, w += 6) {
      const cx1 = chain[w];
      const cy1 = chain[w + 1];
      const cx2 = chain[w + 2];
      const cy2 = chain[w + 3];
      const x2 = chain[w + 4];
      const y2 = chain[w + 5];
      const h2x = (cx0 - cx1 * 2 + cx2) * 0.1875;
      const h2y = (cy0 - cy1 * 2 + cy2) * 0.1875;
      const d3x = ((cx1 - cx2) * 3 - cx0 + x2) * 0.09375;
      const d3y = ((cy1 - cy2) * 3 - cy0 + y2) * 0.09375;
      let d2x = h2x * 2 + d3x;
      let d2y = h2y * 2 + d3y;
      let d1x = (cx1 - cx0) * 0.75 + h2x + d3x * 0.16666667;
      let d1y = (cy1 - cy0) * 0.75 + h2y + d3y * 0.16666667;
      total += Math.sqrt(d1x * d1x + d1y * d1y);
      d1x += d2x;
      d1y += d2y;
      d2x += d3x;
      d2y += d3y;
      total += Math.sqrt(d1x * d1x + d1y * d1y);
      d1x += d2x;
      d1y += d2y;
      total += Math.sqrt(d1x * d1x + d1y * d1y);
      d1x += d2x + d3x;
      d1y += d2y + d3y;
      total += Math.sqrt(d1x * d1x + d1y * d1y);
      curveEnds[i] = total;
      cx0 = x2;
      cy0 = y2;
    }
    const pathTotal = curveCount > 0 ? curveEnds[curveCount - 1] : 0;
    if (c.positionMode === PATH_POSITION_PERCENT) position *= pathTotal;
    const spaceScale = c.spacingMode === PATH_SPACING_PERCENT ? pathTotal : c.spacingMode === PATH_SPACING_PROPORTIONAL ? pathTotal / spaceCount : 1;
    const segmentEnds = this.pathSegmentEnds;
    for (let s = 0; s < 10; s++) segmentEnds[s] = 0;
    let curveTotal = 0;
    let lastCurve = -1;
    let x1 = 0, y1 = 0, cx1 = 0, cy1 = 0, cx2 = 0, cy2 = 0, x2 = 0, y2 = 0;
    for (let i = 0, o = 0, curve = 0, segment = 0; i < spaceCount; i++, o += 3) {
      const space = spaces[i] * spaceScale;
      position += space;
      let p = position;
      if (closed) {
        p %= pathTotal;
        if (p < 0) p += pathTotal;
        curve = 0;
        segment = 0;
      } else if (p < 0) {
        onLineBefore(p, chain[0], chain[1], chain[2], chain[3], out, o);
        continue;
      } else if (p > pathTotal) {
        onLinePast(p - pathTotal, chain[chainLen - 4], chain[chainLen - 3], chain[chainLen - 2], chain[chainLen - 1], out, o);
        continue;
      }
      for (;; curve++) {
        const length = curveEnds[curve];
        if (p > length) continue;
        if (curve === 0) p /= length;
        else {
          const prev = curveEnds[curve - 1];
          p = (p - prev) / (length - prev);
        }
        break;
      }
      if (curve !== lastCurve) {
        lastCurve = curve;
        const ii = curve * 6;
        x1 = chain[ii];
        y1 = chain[ii + 1];
        cx1 = chain[ii + 2];
        cy1 = chain[ii + 3];
        cx2 = chain[ii + 4];
        cy2 = chain[ii + 5];
        x2 = chain[ii + 6];
        y2 = chain[ii + 7];
        const h2x = (x1 - cx1 * 2 + cx2) * 0.03;
        const h2y = (y1 - cy1 * 2 + cy2) * 0.03;
        const d3x = ((cx1 - cx2) * 3 - x1 + x2) * 0.006;
        const d3y = ((cy1 - cy2) * 3 - y1 + y2) * 0.006;
        let d2x = h2x * 2 + d3x;
        let d2y = h2y * 2 + d3y;
        let d1x = (cx1 - x1) * 0.3 + h2x + d3x * 0.16666667;
        let d1y = (cy1 - y1) * 0.3 + h2y + d3y * 0.16666667;
        curveTotal = Math.sqrt(d1x * d1x + d1y * d1y);
        segmentEnds[0] = curveTotal;
        for (let s = 1; s < 8; s++) {
          d1x += d2x;
          d1y += d2y;
          d2x += d3x;
          d2y += d3y;
          curveTotal += Math.sqrt(d1x * d1x + d1y * d1y);
          segmentEnds[s] = curveTotal;
        }
        d1x += d2x;
        d1y += d2y;
        curveTotal += Math.sqrt(d1x * d1x + d1y * d1y);
        segmentEnds[8] = curveTotal;
        d1x += d2x + d3x;
        d1y += d2y + d3y;
        curveTotal += Math.sqrt(d1x * d1x + d1y * d1y);
        segmentEnds[9] = curveTotal;
        segment = 0;
      }
      p *= curveTotal;
      for (;; segment++) {
        const length = segmentEnds[segment];
        if (p > length) continue;
        if (segment === 0) p /= length;
        else {
          const prev = segmentEnds[segment - 1];
          p = segment + (p - prev) / (length - prev);
        }
        break;
      }
      onCurve(p * 0.1, x1, y1, cx1, cy1, cx2, cy2, x2, y2, out, o, wantsTangent || (i > 0 && space === 0));
    }
  }

  private sliderAttachments(): void {
    for (let k = 0; k < this.model.constraints.length; k++) {
      this.sliderSlots(k);
      this.sliderDeforms(k);
    }
  }

  private sliderSlots(index: number): void {
    const cs = this.model.constraints;
    {
      const k = index, c = cs[k];
      if (c.kind !== 'slider' || !c.applied || this.sliderMix[k] === 0) return;
      const a = c.animation, t = this.sliderAt[k], alpha = this.sliderMix[k];
      if (!this.model.omitDrawOrder && a.drawOrder !== null) {
        const di = keyAt(a.drawOrder.curve, this.cursors, a.drawOrder.cursor, t);
        if (di >= 0) {
          const ns = this.drawOrder.length, orders = a.drawOrder.orders, base = di * ns;
          for (let s = 0; s < ns; s++) this.drawOrder[s] = orders[base + s];
        }
      }
      for (let q = 0; q < a.slots.length; q++) {
        const tl = a.slots[q], i = keyAt(tl.curve, this.cursors, tl.cursor, t);
        if (i < 0) continue;
        if (tl.attachments !== null) {
          const next = tl.attachments[i];
          if (next !== this.shown[tl.slot] && next >= 0) this.deformed[next] = 0;
          this.shown[tl.slot] = next;
        }
        else {
          const channels = tl.channels!;
          const slot = this.model.slots[tl.slot];
          const o = tl.slot * 4, d = tl.slot * 3;
          for (let f = 0; f < channels.length; f++) {
            const at = channels[f], v = channelValue(tl.curve, i, f, t);
            if (at < 4) {
              const n = o + at;
              this.light[n] = clamp01(alpha === 1 ? v : this.light[n] + (v - this.light[n]) * alpha);
            } else if (slot.dark !== null && !this.model.omitDarkColour) {
              const n = d + (at - 4);
              this.dark[n] = clamp01(alpha === 1 ? v : this.dark[n] + (v - this.dark[n]) * alpha);
            }
          }
        }
      }
    }
  }

  private sliderDeforms(index: number): void {
    if (this.model.omitDeform) return;
    const cs = this.model.constraints;
    {
      const k = index, c = cs[k];
      if (c.kind !== 'slider' || !c.applied || this.sliderMix[k] === 0) return;
      const a = c.animation, t = this.sliderAt[k], alpha = this.sliderMix[k];
      for (let q = 0; q < a.deforms.length; q++) {
        const tl = a.deforms[q], i = keyAt(tl.curve, this.cursors, tl.cursor, t);
        if (i < 0) continue;
        const held = i + 1 === tl.curve.keys || tl.curve.kinds[i] === CURVE_STEPPED;
        const p = held ? 0 : deformFraction(tl.curve, i, t), start = i * tl.count;
        for (let slot = 0; slot < this.shown.length; slot++) {
          const index = this.shown[slot];
          if (index < 0 || !this.model.slots[slot].live) continue;
          const at = this.model.attachments[index];
          if (at.timeline !== tl.identity || at.deformCount === 0) continue;
          const current = this.deformed[index] !== 0;
          for (let f = 0; f < tl.count; f++) {
            const v = tl.held[start + f], target = held ? v : v + (tl.held[start + tl.count + f] - v) * p;
            const setup = at.draw === DRAW_MESH ? at.local[f] : 0, n = at.deformOffset + f;
            const from = current ? this.deform[n] : setup;
            this.deform[n] = alpha === 1 && (!c.setup.additive || !current) ? target : c.setup.additive ? from + (target - setup) * alpha : from + (target - from) * alpha;
          }
          this.deformed[index] = 1;
        }
      }
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

  /** Absolute/additive transform, matching `solveTransform` in src/core/constraints.ts:
   * read the source per target/property, edit locals or the scratch world,
   * then repose the union in bone order (`repose` in that module). No read-back for a local target.
   */
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
          if (c.localTarget) {
            const at = bi * LOCALS + PROPERTY_LOCAL[property];
            const current = this.locals[at];
            this.locals[at] = c.additive
              ? property === P_SCALE_X || property === P_SCALE_Y ? current * (1 + (v - 1) * mix) : current + v * mix
              : current + (v - current) * mix;
          } else applyWorld(w, property, v, mix, c.additive);
        }
      }
      if (!applied) continue;
      if (!c.localTarget) {
        W[o + W_A] = w[W_A];
        W[o + W_B] = w[W_B];
        W[o + W_C] = w[W_C];
        W[o + W_D] = w[W_D];
        W[o + W_X] = w[W_X];
        W[o + W_Y] = w[W_Y];
      }
      this.changed[n] = bi;
      this.inWorld[n] = bi;
      n++;
    }
    if (n > 0) this.repose(n, c.localTarget ? 0 : n);
  }

  /** The source's current local or world value (`sourceValue` in src/core/constraints.ts). */
  private sourceValue(c: RuntimeTransform, property: number): number {
    if (c.localSource) return this.locals[c.source * LOCALS + PROPERTY_LOCAL[property]] + c.offsets[property];
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

  /** A bone's locals read back from its world transform (`localFromWorld` in src/core/constraints.ts).
   * All five inherit modes: the no-scale forms read rotation first, rebuild
   * `noScaleDirection`, and retain the x-angle residual as shearX in `decompose`.
   */
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
    if (mode === MODE_NO_SCALE || mode === MODE_NO_SCALE_OR_REFLECTION) {
      const det = pa * pd - pb * pc;
      const flip = mode === MODE_NO_SCALE && det < 0 ? -1 : 1;
      const sign = det < 0 ? -1 : 1;
      const rotation = Math.atan2((pa * wc - pc * wa) * sign, (pd * wa - pb * wc) * sign) * DEG;
      const rr = rotation * RAD;
      const cos = Math.cos(rr), sin = Math.sin(rr);
      let ux = pa * cos + pb * sin, uy = pc * cos + pd * sin;
      const length = 1 / Math.sqrt(ux * ux + uy * uy);
      ux *= length; uy *= length;
      this.decompose(l, ux * wa + uy * wc, (ux * wc - uy * wa) * flip, ux * wb + uy * wd, (ux * wd - uy * wb) * flip, true);
      L[l + L_ROTATION] = rotation;
      return;
    }
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
  private decompose(l: number, la: number, lc: number, lb: number, ld: number, shearX = false): void {
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
    L[l + (shearX ? L_SHEAR_X : L_ROTATION)] = xAngle;
    L[l + L_SCALE_X] = sx;
    L[l + L_SCALE_Y] = det < 0 ? -yLength : yLength;
    const right = det < 0 ? -90 : 90;
    let shear = yAngle - ((shearX ? 0 : xAngle) + right);
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
    const dark = this.dark;
    for (let s = 0; s < slots.length; s++) {
      const slot = slots[s];
      this.shown[s] = slot.setupAttachment;
      this.drawOrder[s] = s;
      const o = s * 4;
      light[o] = slot.light[0];
      light[o + 1] = slot.light[1];
      light[o + 2] = slot.light[2];
      light[o + 3] = slot.light[3];
      const setupDark = slot.dark;
      if (setupDark !== null) {
        const d = s * 3;
        dark[d] = setupDark[0];
        dark[d + 1] = setupDark[1];
        dark[d + 2] = setupDark[2];
      }
    }
    if (anim === null) return;
    if (!this.model.omitDrawOrder && anim.drawOrder !== null) {
      const di = keyAt(anim.drawOrder.curve, this.cursors, anim.drawOrder.cursor, t);
      if (di >= 0) {
        const ns = slots.length, orders = anim.drawOrder.orders, base = di * ns;
        for (let s = 0; s < ns; s++) this.drawOrder[s] = orders[base + s];
      }
    }
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
      const slot = slots[tl.slot];
      const setup = slot.light;
      const setupDark = slot.dark;
      const o = tl.slot * 4;
      const d = tl.slot * 3;
      for (let c = 0; c < channels.length; c++) {
        const at = channels[c];
        if (at < 4) {
          light[o + at] = i < 0 ? setup[at] : clamp01(channelValue(tl.curve, i, c, t));
        } else if (setupDark !== null && !this.model.omitDarkColour) {
          dark[d + (at - 4)] = i < 0 ? setupDark[at - 4] : clamp01(channelValue(tl.curve, i, c, t));
        }
      }
    }
  }

  /** Reset on every pose, then match source identity after switches; no old frame's offsets survive. */
  private deformValues(anim: RuntimeAnimation | null, t: number): void {
    this.deformed.fill(0);
    this.deform.fill(0);
    if (anim === null || this.model.omitDeform) return;
    for (let k = 0; k < anim.deforms.length; k++) {
      const tl = anim.deforms[k];
      const i = keyAt(tl.curve, this.cursors, tl.cursor, t);
      if (i < 0) continue;
      const held = i + 1 === tl.curve.keys || tl.curve.kinds[i] === CURVE_STEPPED;
      const p = held ? 0 : deformFraction(tl.curve, i, t);
      const start = i * tl.count;
      for (let s = 0; s < this.shown.length; s++) {
        const index = this.shown[s];
        if (index < 0 || !this.model.slots[s].live) continue;
        const at = this.model.attachments[index];
        if (at.timeline !== tl.identity || at.deformCount === 0) continue;
        this.deformed[index] = 1;
        for (let q = 0; q < tl.count; q++) {
          const v = tl.held[start + q];
          this.deform[at.deformOffset + q] = held ? v : v + (tl.held[start + tl.count + q] - v) * p;
        }
      }
    }
  }

  /** Recompute vertices and overwrite clipping output, without per-frame allocation.
   * Concave/inverse rows describe the core's drawn coverage, not Spine's native triangle list.
   */
  computeClipped(): void {
    this.computeVertices();
    this.clipping?.frame(this);
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
        const local = this.deformed[index] && at.draw === DRAW_MESH ? this.deform : at.local;
        const lo = this.deformed[index] && at.draw === DRAW_MESH ? at.deformOffset : 0;
        if (at.draw === DRAW_REGION) {
          for (let q = 0; q < 8; q += 2) {
            const lx = local[q];
            const ly = local[q + 1];
            out[o++] = a * lx + bb * ly + wx;
            out[o++] = c * lx + d * ly + wy;
          }
        } else {
          for (let q = 0; q < at.count; q += 2) {
            const x = local[lo + q];
            const y = local[lo + q + 1];
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
          const weight = weights[n];
          // The pair belongs to this influence, before its transform and weight, never to the logical vertex.
          const deformed = this.deformed[index] !== 0;
          const x = deformed ? xs[n] + this.deform[at.deformOffset + n * 2] : xs[n];
          const y = deformed ? ys[n] + this.deform[at.deformOffset + n * 2 + 1] : ys[n];
          if (deformed && m.deformAfterWeights) {
            wx += (xs[n] * W[b + W_A] + ys[n] * W[b + W_B] + W[b + W_X]) * weight + this.deform[at.deformOffset + n * 2];
            wy += (xs[n] * W[b + W_C] + ys[n] * W[b + W_D] + W[b + W_Y]) * weight + this.deform[at.deformOffset + n * 2 + 1];
            continue;
          }
          wx += (x * W[b + W_A] + y * W[b + W_B] + W[b + W_X]) * weight;
          wy += (x * W[b + W_C] + y * W[b + W_D] + W[b + W_Y]) * weight;
        }
        out[o++] = wx;
        out[o++] = wy;
      }
    }
  }
}

/** A world-space absolute/additive property, in `applyWorld` order from src/core/constraints.ts. */
function applyWorld(w: Float64Array, property: number, v: number, mix: number, additive: boolean): void {
  switch (property) {
    case P_ROTATE: {
      let r = additive ? v * RAD : v * RAD - Math.atan2(w[W_C], w[W_A]);
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
      w[W_X] = additive ? w[W_X] + v * mix : w[W_X] + (v - w[W_X]) * mix;
      return;
    case P_Y:
      w[W_Y] = additive ? w[W_Y] + v * mix : w[W_Y] + (v - w[W_Y]) * mix;
      return;
    case P_SCALE_X:
    case P_SCALE_Y: {
      const p = property === P_SCALE_X ? W_A : W_B;
      const q = property === P_SCALE_X ? W_C : W_D;
      const s = Math.sqrt(w[p] * w[p] + w[q] * w[q]);
      if (s === 0) return;
      const k = additive ? 1 + (v - 1) * mix : 1 + ((v - s) * mix) / s;
      w[p] *= k;
      w[q] *= k;
      return;
    }
    default: {
      const yAngle = Math.atan2(w[W_D], w[W_B]);
      const xAngle = Math.atan2(w[W_C], w[W_A]);
      // Keep the right-angle subtraction: simplifying it to v * RAD changes bits.
      let r = (v + 90) * RAD - (additive ? 90 * RAD : yAngle - xAngle);
      if (!additive) r = r > RUNTIME_PI ? r - TWO_PI : r < -RUNTIME_PI ? r + TWO_PI : r;
      const angle = yAngle + r * mix;
      const s = Math.sqrt(w[W_B] * w[W_B] + w[W_D] * w[W_D]);
      w[W_B] = Math.cos(angle) * s;
      w[W_D] = Math.sin(angle) * s;
    }
  }
}

function onLineBefore(p: number, x1: number, y1: number, x2: number, y2: number, out: Float64Array, o: number): void {
  const r = Math.atan2(y2 - y1, x2 - x1);
  out[o] = x1 + p * Math.cos(r);
  out[o + 1] = y1 + p * Math.sin(r);
  out[o + 2] = r;
}

function onLinePast(p: number, x0: number, y0: number, x1: number, y1: number, out: Float64Array, o: number): void {
  const r = Math.atan2(y1 - y0, x1 - x0);
  out[o] = x1 + p * Math.cos(r);
  out[o + 1] = y1 + p * Math.sin(r);
  out[o + 2] = r;
}

function onCurve(p: number, x1: number, y1: number, cx1: number, cy1: number, cx2: number, cy2: number, x2: number, y2: number, out: Float64Array, o: number, wantsTangent: boolean): void {
  if (Number.isNaN(p)) {
    out[o] = x1;
    out[o + 1] = y1;
    out[o + 2] = Math.atan2(cy1 - y1, cx1 - x1);
    return;
  }
  const t2 = p * p;
  const t3 = t2 * p;
  const u = 1 - p;
  const u2 = u * u;
  const u3 = u2 * u;
  const ut = u * p;
  const ut3x = ut * 3;
  const w1 = u * ut3x;
  const w2 = ut3x * p;
  const x = x1 * u3 + cx1 * w1 + cx2 * w2 + x2 * t3;
  const y = y1 * u3 + cy1 * w1 + cy2 * w2 + y2 * t3;
  out[o] = x;
  out[o + 1] = y;
  if (wantsTangent) {
    if (p < 0.001) out[o + 2] = Math.atan2(cy1 - y1, cx1 - x1);
    else out[o + 2] = Math.atan2(y - (y1 * u2 + cy1 * ut * 2 + cy2 * t2), x - (x1 * u2 + cx1 * ut * 2 + cx2 * t2));
  }
}
