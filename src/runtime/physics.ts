/** Indexed in-place physics. Arithmetic and operation order mirror the measured oracle;
 * state is allocated once per pose, never during an update. */
import type { CorePhysicsRecord } from '../core/constraints_physics.ts';
import { RUNTIME_PI } from '../core/world.ts';
const PI2 = RUNTIME_PI * 2;
const INV_PI2 = 1 / PI2;
export interface PhysicsState {
  /** The next update takes the bone where it is and integrates nothing: set by a reset and on a constraint never updated. */
  pending: boolean;
  lastTime: number;
  remaining: number;
  ux: number;
  uy: number;
  cx: number;
  cy: number;
  tx: number;
  ty: number;
  xOffset: number;
  xLag: number;
  xVelocity: number;
  yOffset: number;
  yLag: number;
  yVelocity: number;
  rotateOffset: number;
  rotateLag: number;
  rotateVelocity: number;
  scaleOffset: number;
  scaleLag: number;
  scaleVelocity: number;
}

/** A constraint's state before its first update: pending, its clock at 0. */
export function freshPhysicsState(): PhysicsState {
  return { pending: true, lastTime: 0, remaining: 0, ux: 0, uy: 0, cx: 0, cy: 0, tx: 0, ty: 0, xOffset: 0, xLag: 0, xVelocity: 0, yOffset: 0, yLag: 0, yVelocity: 0, rotateOffset: 0, rotateLag: 0, rotateVelocity: 0, scaleOffset: 0, scaleLag: 0, scaleVelocity: 0 };
}

/** A reset: offsets, velocities and lags cleared, nothing remaining, the clock read at `time`, pending. */
export function resetPhysicsState(s: PhysicsState, time: number): void {
  s.remaining = 0;
  s.lastTime = time;
  s.pending = true;
  s.xOffset = s.xLag = s.xVelocity = 0;
  s.yOffset = s.yLag = s.yVelocity = 0;
  s.rotateOffset = s.rotateLag = s.rotateVelocity = 0;
  s.scaleOffset = s.scaleLag = s.scaleVelocity = 0;
}

export function stepRuntimePhysics(r: CorePhysicsRecord, s: PhysicsState, w: Float64Array, boneOffset: number, length: number, time: number, reset: boolean, env: Float64Array): boolean {
  const mix = r.mix;
  if (mix === 0) return false;
  const x = r.x > 0, y = r.y > 0, rotateOrShearX = r.rotate > 0 || r.shearX > 0, scaleX = r.scaleX > 0;
  const l = length;
  if (reset) resetPhysicsState(s, time);
  const delta = Math.max(time - s.lastTime, 0);
  // The interpolation weight of the previous update, before this one's time is added: the rotate and the scale-only inertia read the pose as it was shown.
  const shown = Math.max(0, 1 - s.remaining / r.step);
  s.remaining += delta;
  s.lastTime = time;
  const bx = w[boneOffset + 4];
  const by = w[boneOffset + 5];
  let z = 0;
  if (s.pending) {
    s.pending = false;
    s.ux = bx;
    s.uy = by;
  } else {
    let a = s.remaining;
    const i = r.inertia;
    const t = r.step;
    const f = r.referenceScale;
    let d = -1;
    const qx = r.limit * delta;
    const qy = qx;
    if (x || y) {
      if (x) {
        const u = (s.ux - bx) * i;
        s.xOffset += u > qx ? qx : u < -qx ? -qx : u;
        s.ux = bx;
      }
      if (y) {
        const u = (s.uy - by) * i;
        s.yOffset += u > qy ? qy : u < -qy ? -qy : u;
        s.uy = by;
      }
      if (a >= t) {
        d = Math.pow(r.damping, 60 * t);
        const m = r.massInverse * t;
        const e = r.strength;
        const wind = r.wind * f;
        const g = r.gravity * f;
        // The environment's directions (issue #1416), as the runtime weighs them; the skeleton's scale is 1 here, so its factor is left out.
        const ax = wind * env[0] + g * env[2];
        const ay = wind * env[1] + g * env[3];
        const xs = s.xOffset;
        const ys = s.yOffset;
        do {
          if (x) {
            s.xVelocity += (ax - s.xOffset * e) * m;
            s.xOffset += s.xVelocity * t;
            s.xVelocity *= d;
          }
          if (y) {
            s.yVelocity -= (ay + s.yOffset * e) * m;
            s.yOffset += s.yVelocity * t;
            s.yVelocity *= d;
          }
          a -= t;
        } while (a >= t);
        s.xLag = s.xOffset - xs;
        s.yLag = s.yOffset - ys;
      }
      z = Math.max(0, 1 - a / t);
      if (x) w[boneOffset + 4] += (s.xOffset - s.xLag * z) * mix * r.x;
      if (y) w[boneOffset + 5] += (s.yOffset - s.yLag * z) * mix * r.y;
    }
    if (rotateOrShearX || scaleX) {
      const ca = Math.atan2(w[boneOffset + 2], w[boneOffset + 0]);
      let c = 0;
      let sn = 0;
      let mr = 0;
      let dx = s.cx - w[boneOffset + 4];
      let dy = s.cy - w[boneOffset + 5];
      if (dx > qx) dx = qx;
      else if (dx < -qx) dx = -qx;
      if (dy > qy) dy = qy;
      else if (dy < -qy) dy = -qy;
      if (rotateOrShearX) {
        mr = (r.rotate + r.shearX) * mix;
        const lagged = s.rotateLag * shown;
        let rr = Math.atan2(dy + s.ty, dx + s.tx) - ca - (s.rotateOffset - lagged) * mr;
        s.rotateOffset += (rr - Math.ceil(rr * INV_PI2 - 0.5) * PI2) * i;
        rr = (s.rotateOffset - lagged) * mr + ca;
        c = Math.cos(rr);
        sn = Math.sin(rr);
        if (scaleX) {
          rr = l * Math.sqrt(w[boneOffset + 0] * w[boneOffset + 0] + w[boneOffset + 2] * w[boneOffset + 2]);
          if (rr > 0) s.scaleOffset += ((dx * c + dy * sn) * i) / rr;
        }
      } else {
        c = Math.cos(ca);
        sn = Math.sin(ca);
        const rr = l * Math.sqrt(w[boneOffset + 0] * w[boneOffset + 0] + w[boneOffset + 2] * w[boneOffset + 2]) - s.scaleLag * shown;
        if (rr > 0) s.scaleOffset += ((dx * c + dy * sn) * i) / rr;
      }
      a = s.remaining;
      if (a >= t) {
        if (d === -1) d = Math.pow(r.damping, 60 * t);
        const m = r.massInverse * t;
        const e = r.strength;
        const ax = r.wind * env[0] + r.gravity * env[2];
        const ay = r.wind * env[1] + r.gravity * env[3];
        const h = l / f;
        const rs = s.rotateOffset;
        const ss = s.scaleOffset;
        for (;;) {
          a -= t;
          if (scaleX) {
            s.scaleVelocity += (ax * c - ay * sn - s.scaleOffset * e) * m;
            s.scaleOffset += s.scaleVelocity * t;
            s.scaleVelocity *= d;
          }
          if (rotateOrShearX) {
            s.rotateVelocity -= ((ax * sn + ay * c) * h + s.rotateOffset * e) * m;
            s.rotateOffset += s.rotateVelocity * t;
            s.rotateVelocity *= d;
            if (a < t) break;
            const rr = s.rotateOffset * mr + ca;
            c = Math.cos(rr);
            sn = Math.sin(rr);
          } else if (a < t) break;
        }
        s.rotateLag = s.rotateOffset - rs;
        s.scaleLag = s.scaleOffset - ss;
      }
      z = Math.max(0, 1 - a / t);
    }
    s.remaining = a;
  }
  s.cx = w[boneOffset + 4];
  s.cy = w[boneOffset + 5];
  if (rotateOrShearX) {
    let angle = (s.rotateOffset - s.rotateLag * z) * mix;
    let sn = 0;
    let c = 0;
    let a = 0;
    if (r.shearX > 0) {
      let rr = 0;
      if (r.rotate > 0) {
        // The rotation's share turns the y column here, and the x column with the shear below.
        rr = angle * r.rotate;
        sn = Math.sin(rr);
        c = Math.cos(rr);
        a = w[boneOffset + 1];
        w[boneOffset + 1] = c * a - sn * w[boneOffset + 3];
        w[boneOffset + 3] = sn * a + c * w[boneOffset + 3];
      }
      rr += angle * r.shearX;
      sn = Math.sin(rr);
      c = Math.cos(rr);
      a = w[boneOffset + 0];
      w[boneOffset + 0] = c * a - sn * w[boneOffset + 2];
      w[boneOffset + 2] = sn * a + c * w[boneOffset + 2];
    } else {
      angle *= r.rotate;
      sn = Math.sin(angle);
      c = Math.cos(angle);
      a = w[boneOffset + 0];
      w[boneOffset + 0] = c * a - sn * w[boneOffset + 2];
      w[boneOffset + 2] = sn * a + c * w[boneOffset + 2];
      a = w[boneOffset + 1];
      w[boneOffset + 1] = c * a - sn * w[boneOffset + 3];
      w[boneOffset + 3] = sn * a + c * w[boneOffset + 3];
    }
  }
  if (scaleX) {
    const k = 1 + (s.scaleOffset - s.scaleLag * z) * mix * r.scaleX;
    w[boneOffset + 0] *= k;
    w[boneOffset + 2] *= k;
    // The transverse column follows the authored mode (issue #1453), after
    // the X column: the native Volume branch bounds reciprocal compression
    // below 0.7; it is not an area-preservation promise on that branch.
    if (r.scaleYMode === 'Uniform') {
      w[boneOffset + 1] *= k;
      w[boneOffset + 3] *= k;
    } else if (r.scaleYMode === 'Volume') {
      const magnitude = Math.abs(k);
      const transverse = magnitude >= 0.7 ? 1 / magnitude : 4 - 3.67347 * magnitude;
      w[boneOffset + 1] *= transverse;
      w[boneOffset + 3] *= transverse;
    }
  }
  s.tx = l * w[boneOffset + 0];
  s.ty = l * w[boneOffset + 2];
  return true;
}
