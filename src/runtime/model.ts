/**
 * The runtime poser's load-time half (issue #1591, stage 0): a skin view of
 * the compiled model (`readModel`, then `underSkin` / `underNoSkin` — the
 * oracle's reader and its views, read and never written) compiled once into
 * index-resolved bones and slots, a constraint plan, compiled timelines and
 * the sizes of every buffer a pose needs (`./pose.ts`).
 *
 * ## Refused by name, at load
 *
 * A construct the runtime does not pose yet is never guessed at. `compileRuntime`
 * collects every one it meets, each with the object it was found on
 * (`RuntimeMissing`), and:
 *
 * - **refuses the model** (`RuntimeRefusal`, every missing feature listed)
 *   when one is a property of the whole model — a skin other than `default`, a
 *   path, physics or slider constraint, a transform constraint reading or
 *   writing local values or adding (`localSource`, `localTarget`,
 *   `additive`), an ik or transform constraint over a bone the view leaves
 *   inactive, a world-space transform onto a `noScale` or
 *   `noScaleOrReflection` bone, a clipping attachment or a region with no
 *   atlas rectangle shown at setup, a placeholder the skins fill
 *   differently, or a block the oracle itself leaves out;
 * - **refuses an animation** (`RuntimeModel.refused`; `animation(name)`
 *   throws the same `RuntimeRefusal`) when the construct is the animation's
 *   — an `inherit` timeline, a deform or sequence timeline, a draw-order
 *   timeline, event keys, a dark-colour (`rgba2`, `rgb2`) timeline, or an
 *   attachment key showing a clipping attachment or a region with no atlas
 *   rectangle. Every other animation of the model is posed.
 *
 * `RUNTIME_FEATURES` is the closed list of what can be named. Events are the
 * one construct that moves no pose, so they alone can be ignored on request
 * (`RuntimeOptions.ignore`): a consumer that reads no event says so, and is
 * then handed a poser that fires none. Without the request an animation with
 * event keys is refused, because a poser that dropped them silently would be
 * a player that misses its cues and reports nothing.
 *
 * ## What the oracle decides, the runtime reads
 *
 * Which bones are active, which constraints apply under the view, what a slot
 * shows for a placeholder and the name and path its row carries, a slot's
 * colour and blend, a linked mesh's source — each is the oracle's own answer,
 * read here once (`activeBones`, `constraintInactiveWhy`, `shownAttachment`,
 * `shownRow`, `readColour`, `readBlend`, `sourceOfDoc`). What the runtime
 * computes is the pose, and that is what the gate holds equal
 * (`tools/core_gate.ts`, *The runtime poser*).
 *
 * Pure, as all of `src/`: nothing from the Spine runtime package, no clock,
 * no randomness, no I/O.
 */
import type { ModelVertices } from '../model.ts';
import { activeBones, constraintRecords, CORE_REGION_KINDS, foldInheritMode, readBlend, readColour, shownAttachment, shownRow, sourceOfDoc, type CompiledDocument, type CoreAnimation, type CoreBlendMode } from '../core/index.ts';
import { constraintInactiveWhy, constraintsAbsentWhy, TRANSFORM_PROPERTIES, type CoreIkRecord, type CoreTransformRecord } from '../core/constraints.ts';
import { CORE_DEFAULT_SKIN } from '../core/skins.ts';
import { RUNTIME_PI } from '../core/world.ts';
import { compileCurve, type RuntimeCurve } from './curves.ts';

/** The stage of issue #1591 this poser implements. */
export const RUNTIME_STAGE = 0;

/** Every construct the runtime poser can refuse, by the name its refusals carry. */
export const RUNTIME_FEATURES = [
  'skin',
  'path-constraint',
  'physics-constraint',
  'slider-constraint',
  'local-transform',
  'additive-transform',
  'inactive-constrained-bone',
  'noscale-world-target',
  'clipping',
  'null-atlas-region',
  'skin-conflict',
  'oracle-absent',
  'inherit-timeline',
  'deform-timeline',
  'sequence-timeline',
  'draw-order-timeline',
  'events',
  'dark-colour-timeline',
] as const;
export type RuntimeFeature = (typeof RUNTIME_FEATURES)[number];

/** One construct not posed: what, on which object, and the animation it was found in (`null` for the model's own). */
export interface RuntimeMissing {
  readonly feature: RuntimeFeature;
  readonly detail: string;
  readonly animation: string | null;
}

/** Spelled once, so a refusal and a report say the same words. */
export function missingText(m: RuntimeMissing): string {
  return `${m.feature}: ${m.detail}${m.animation === null ? '' : ` (animation "${m.animation}")`}`;
}

/** What the runtime poser does not pose, named — the model's, or one animation's. */
export class RuntimeRefusal extends Error {
  readonly missing: readonly RuntimeMissing[];
  constructor(missing: readonly RuntimeMissing[]) {
    super(`not posed by the runtime poser (stage ${RUNTIME_STAGE}), ${missing.length} construct(s) missing: ${missing.map(missingText).join('; ')}`);
    this.missing = missing;
  }
}

/** A call the runtime poser cannot answer: a name the model does not have, a time that is not finite. */
export class RuntimeInputError extends Error {}

/** What a consumer states at load. */
export interface RuntimeOptions {
  /** Constructs that move no pose, posed as absent on request. `events` is the only one. */
  readonly ignore?: readonly 'events'[];
}

/**
 * What a control passes in place of a part of the load (the selftest's
 * `runtime-poser` suite); nothing else passes one. Each acts at load only, so
 * a pose runs the same code with or without one.
 */
export interface RuntimePlant {
  /** Added to one bone's setup local value: the planted perturbation. */
  readonly setupNudge?: { readonly bone: string; readonly field: number; readonly delta: number };
  /** A weighted binding's bone index rewritten: the wrong-index plant. */
  readonly bindingIndex?: (index: number, bones: number) => number;
  /** Refusals let through, the construct posed as if absent: the smuggling plant. */
  readonly admit?: readonly RuntimeFeature[];
  /** The update order's scratch sized by the bone count instead of the longest target list: the short-buffer plant. */
  readonly scratchByBones?: boolean;
}

// A bone's local values, seven per bone.
export const L_X = 0;
export const L_Y = 1;
export const L_ROTATION = 2;
export const L_SCALE_X = 3;
export const L_SCALE_Y = 4;
export const L_SHEAR_X = 5;
export const L_SHEAR_Y = 6;
export const LOCALS = 7;
/** The local fields by the name a `ModelBone` gives them, in `L_*` order. */
export const LOCAL_FIELD_NAMES = ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'shearX', 'shearY'] as const;

// A bone's world transform, six per bone: the matrix `[a b; c d]` and the origin.
export const W_A = 0;
export const W_B = 1;
export const W_C = 2;
export const W_D = 3;
export const W_X = 4;
export const W_Y = 5;
export const WORLDS = 6;

// The five inherit modes.
export const MODE_NORMAL = 0;
export const MODE_ONLY_TRANSLATION = 1;
export const MODE_NO_ROTATION_OR_REFLECTION = 2;
export const MODE_NO_SCALE = 3;
export const MODE_NO_SCALE_OR_REFLECTION = 4;
const MODE_CODES = { normal: MODE_NORMAL, onlyTranslation: MODE_ONLY_TRANSLATION, noRotationOrReflection: MODE_NO_ROTATION_OR_REFLECTION, noScale: MODE_NO_SCALE, noScaleOrReflection: MODE_NO_SCALE_OR_REFLECTION } as const;

// How an attachment draws.
export const DRAW_NONE = 0;
export const DRAW_REGION = 1;
export const DRAW_MESH = 2;
export const DRAW_WEIGHTED = 3;

// An ik constraint's scaleY mode.
export const SCALE_Y_NONE = 0;
export const SCALE_Y_UNIFORM = 1;
export const SCALE_Y_VOLUME = 2;

// An ik constraint's three flags, packed.
export const IK_BEND_POSITIVE = 1;
export const IK_COMPRESS = 2;
export const IK_STRETCH = 4;

/** Degrees to radians, with the runtime's pi (`src/core/world.ts`). */
export const RAD = RUNTIME_PI / 180;

/**
 * One record a slot can show, resolved at load: the row's name and path (the
 * oracle's `shownRow`), how it draws, its bone, where its world vertices go in
 * a pose's buffer and the numbers they are computed from — a region's four
 * corners before the bone (`regionCorners`' local half, the same operations),
 * an unweighted mesh's coordinates through `Math.fround`, a weighted mesh's
 * bindings (bone index, float32 coordinates, float32 weight) in their order.
 */
export interface RuntimeAttachment {
  readonly slot: number;
  readonly name: string;
  /** Exact resolved source table identity; display names need not be unique. */
  readonly skin: string;
  readonly placeholder: string;
  readonly path: string | null;
  readonly draw: number;
  readonly bone: number;
  /** Offset into `RuntimePose.vertices`, and how many numbers (two per vertex). */
  readonly offset: number;
  readonly count: number;
  readonly local: Float64Array;
  readonly bindingCounts: Int32Array;
  readonly bindingBones: Int32Array;
  readonly bindingX: Float64Array;
  readonly bindingY: Float64Array;
  readonly bindingWeights: Float64Array;
}

/** One slot: its bone, whether its timelines apply, what it shows at setup (an attachment index or −1), its colours and blend. */
export interface RuntimeSlot {
  readonly name: string;
  readonly bone: number;
  readonly live: boolean;
  readonly setupAttachment: number;
  readonly light: Float64Array;
  readonly dark: Float64Array | null;
  readonly blend: CoreBlendMode;
}

/** An ik constraint as the plan runs it. */
export interface RuntimeIk {
  readonly kind: 'ik';
  readonly name: string;
  readonly index: number;
  readonly applied: boolean;
  readonly bones: Int32Array;
  readonly target: number;
  readonly scaleY: number;
  readonly mix: number;
  readonly softness: number;
  readonly flags: number;
}

/** A world-space, absolute transform constraint as the plan runs it: each source property's offset and its targets'. */
export interface RuntimeTransform {
  readonly kind: 'transform';
  readonly name: string;
  readonly index: number;
  readonly applied: boolean;
  readonly bones: Int32Array;
  readonly source: number;
  readonly fromProperty: Int32Array;
  readonly fromOffset: Float64Array;
  readonly toStart: Int32Array;
  readonly toEnd: Int32Array;
  readonly toProperty: Int32Array;
  readonly toOffset: Float64Array;
  readonly toScale: Float64Array;
  readonly toMax: Float64Array;
  /** The constraint's offsets and its setup mixes, by `TRANSFORM_PROPERTIES` index. */
  readonly offsets: Float64Array;
  readonly mixes: Float64Array;
  readonly clamp: boolean;
}

export type RuntimeConstraint = RuntimeIk | RuntimeTransform;

/** A bone timeline: the bone, its curve, and per channel the local field it writes and whether it multiplies the setup value (scale) or adds to it. */
export interface RuntimeBoneTimeline {
  readonly bone: number;
  readonly curve: RuntimeCurve;
  readonly cursor: number;
  readonly fields: Int32Array;
  readonly multiply: Uint8Array;
}

/** A slot timeline: an attachment timeline (each key's attachment index, −1 nothing) or a colour timeline (each channel's index into the light colour). */
export interface RuntimeSlotTimeline {
  readonly slot: number;
  readonly curve: RuntimeCurve;
  readonly cursor: number;
  readonly attachments: Int32Array | null;
  readonly channels: Int32Array | null;
}

/** A constraint timeline: its constraint's index in the plan, its curve, and an ik key's flags. */
export interface RuntimeConstraintTimeline {
  readonly constraint: number;
  readonly curve: RuntimeCurve;
  readonly cursor: number;
  readonly flags: Uint8Array | null;
}

/** One covered animation, compiled. */
export interface RuntimeAnimation {
  readonly name: string;
  readonly duration: number;
  readonly bones: readonly RuntimeBoneTimeline[];
  readonly slots: readonly RuntimeSlotTimeline[];
  /** Per constraint of the plan, its timeline in this animation or `null`. */
  readonly constraints: ReadonlyArray<RuntimeConstraintTimeline | null>;
  /** How many key cursors a pose keeps for it. */
  readonly cursors: number;
  /** Event keys it holds — 0 unless the consumer asked for events to be ignored. */
  readonly events: number;
}

/** The compiled model a pose is made of (`compileRuntime`). Read-only once built. */
export interface RuntimeModel {
  readonly doc: CompiledDocument;
  readonly boneNames: readonly string[];
  readonly parents: Int32Array;
  readonly modes: Uint8Array;
  readonly active: Uint8Array;
  readonly lengths: Float64Array;
  /** Every bone's setup local values, `LOCALS` per bone. */
  readonly setup: Float64Array;
  /** Each bone's subtree, itself first, ascending: `subtrees[subtreeStart[b] … subtreeStart[b + 1])`. */
  readonly subtreeStart: Int32Array;
  readonly subtrees: Int32Array;
  readonly slots: readonly RuntimeSlot[];
  readonly attachments: readonly RuntimeAttachment[];
  readonly vertexCount: number;
  readonly constraints: readonly RuntimeConstraint[];
  readonly animations: ReadonlyMap<string, RuntimeAnimation>;
  /** The animations refused, in the document's order, each with what it misses. */
  readonly refused: ReadonlyArray<{ readonly animation: string; readonly missing: readonly RuntimeMissing[] }>;
  /** The most key cursors any covered animation needs. */
  readonly cursors: number;
  /**
   * How many bones one constraint can change at once: the longest target list,
   * and never less than the bone count. A transform constraint may name a bone
   * more than once (`readConstraintRecord` reads the list as written, and the
   * oracle applies each entry in turn), so the list, not the skeleton, bounds it.
   */
  readonly scratch: number;
  /** A covered animation by name; a refused one throws its `RuntimeRefusal`, an unknown one a `RuntimeInputError`. */
  animation(name: string): RuntimeAnimation;
}

/** The ten bone timeline kinds that key numbers: per channel, the local field and whether it multiplies (`src/core/animation.ts`, *The bone timelines*). */
const BONE_KINDS: Record<string, ReadonlyArray<readonly [number, 0 | 1]>> = {
  rotate: [[L_ROTATION, 0]],
  translate: [[L_X, 0], [L_Y, 0]],
  translatex: [[L_X, 0]],
  translatey: [[L_Y, 0]],
  scale: [[L_SCALE_X, 1], [L_SCALE_Y, 1]],
  scalex: [[L_SCALE_X, 1]],
  scaley: [[L_SCALE_Y, 1]],
  shear: [[L_SHEAR_X, 0], [L_SHEAR_Y, 0]],
  shearx: [[L_SHEAR_X, 0]],
  sheary: [[L_SHEAR_Y, 0]],
};

/** The light colour's channels each colour timeline sets, in its curve's channel order. */
const COLOUR_CHANNELS: Record<string, readonly number[]> = { rgba: [0, 1, 2, 3], rgb: [0, 1, 2], alpha: [3] };

/** Where refusals are gathered while a model compiles. */
class Refusals {
  readonly model: RuntimeMissing[] = [];
  readonly byAnimation = new Map<string, RuntimeMissing[]>();
  constructor(private readonly admitted: ReadonlySet<RuntimeFeature>) {}

  /** Records the construct unless a plant admits it. The caller poses the construct as absent either way. */
  note(feature: RuntimeFeature, detail: string, animation: string | null = null): void {
    if (this.admitted.has(feature)) return;
    const m: RuntimeMissing = { feature, detail, animation };
    if (animation === null) this.model.push(m);
    else {
      const list = this.byAnimation.get(animation) ?? [];
      list.push(m);
      this.byAnimation.set(animation, list);
    }
  }
}

/** The view compiled for the runtime poser, or every construct it misses refused by name — the header. */
export function compileRuntime(doc: CompiledDocument, options: RuntimeOptions = {}, plant: RuntimePlant = {}): RuntimeModel {
  const refusals = new Refusals(new Set(plant.admit ?? []));
  const ignoreEvents = (options.ignore ?? []).includes('events');

  if (doc.skins.some((k) => k.name !== CORE_DEFAULT_SKIN)) refusals.note('skin', `the document declares skins [${doc.skins.map((k) => k.name).join(', ')}]; stage ${RUNTIME_STAGE} poses the default skin alone`);
  const absentWhy = constraintsAbsentWhy(doc);
  if (absentWhy !== null) refusals.note('oracle-absent', `the oracle leaves the bones out: ${absentWhy}`);

  // --- bones ---
  const nb = doc.bones.length;
  const boneIndex = new Map(doc.bones.map((b, i) => [b.name, i]));
  const indexOf = (name: string): number => {
    const i = boneIndex.get(name);
    if (i === undefined) throw new RuntimeInputError(`bone "${name}" is not a bone of this document (readModel refuses it first)`);
    return i;
  };
  const active = activeBones(doc);
  const parents = new Int32Array(nb);
  const modes = new Uint8Array(nb);
  const activeFlags = new Uint8Array(nb);
  const lengths = new Float64Array(nb);
  const setup = new Float64Array(nb * LOCALS);
  doc.bones.forEach((b, i) => {
    parents[i] = b.parent === undefined ? -1 : indexOf(b.parent);
    if (parents[i] >= i) throw new RuntimeInputError(`bone "${b.name}" is listed before its parent (readModel refuses it first)`);
    const mode = b.inheritMode === undefined ? 'normal' : foldInheritMode(b.inheritMode);
    if (mode === null) throw new RuntimeInputError(`bone "${b.name}": inheritMode ${JSON.stringify(b.inheritMode)} is no mode (readModel refuses it first)`);
    modes[i] = MODE_CODES[mode];
    activeFlags[i] = active.has(b.name) ? 1 : 0;
    lengths[i] = b.length ?? 0;
    const o = i * LOCALS;
    setup[o + L_X] = b.x ?? 0;
    setup[o + L_Y] = b.y ?? 0;
    setup[o + L_ROTATION] = b.rotation ?? 0;
    setup[o + L_SCALE_X] = b.scaleX ?? 1;
    setup[o + L_SCALE_Y] = b.scaleY ?? 1;
    setup[o + L_SHEAR_X] = b.shearX ?? 0;
    setup[o + L_SHEAR_Y] = b.shearY ?? 0;
  });
  if (plant.setupNudge !== undefined) setup[indexOf(plant.setupNudge.bone) * LOCALS + plant.setupNudge.field] += plant.setupNudge.delta;
  // Each bone's subtree, in bone order: bones are listed parents first, so each index is appended to its own list and its ancestors' in ascending order.
  const lists: number[][] = doc.bones.map(() => []);
  for (let k = 0; k < nb; k++) for (let at = k; at >= 0; at = parents[at]) lists[at].push(k);
  const subtreeStart = new Int32Array(nb + 1);
  const flat: number[] = [];
  for (let k = 0; k < nb; k++) {
    subtreeStart[k] = flat.length;
    for (const x of lists[k]) flat.push(x);
  }
  subtreeStart[nb] = flat.length;

  // --- constraints, in the document's order ---
  const constraints: RuntimeConstraint[] = [];
  for (const c of doc.constraints) if (c.kind === 'path' || c.kind === 'physics' || c.kind === 'slider') refusals.note(`${c.kind}-constraint`, `${c.kind} constraint "${c.name}"`);
  for (const r of constraintRecords(doc)) {
    if (r.kind !== 'ik' && r.kind !== 'transform') continue;
    const applied = constraintInactiveWhy(r, active) === null;
    const bones = Int32Array.from(r.bones.map(indexOf));
    if (applied && r.bones.some((b) => !active.has(b))) refusals.note('inactive-constrained-bone', `${r.kind} constraint "${r.name}" names bone(s) ${r.bones.filter((b) => !active.has(b)).map((b) => `"${b}"`).join(', ')}, which the view leaves inactive — what the oracle writes there depends on the pass before`);
    const index = constraints.length;
    if (r.kind === 'ik') constraints.push(compileIk(r, index, applied, bones, indexOf));
    else {
      if (r.localSource || r.localTarget) refusals.note('local-transform', `transform constraint "${r.name}" ${[r.localSource ? 'reads local values (localSource)' : '', r.localTarget ? 'writes local values (localTarget)' : ''].filter((x) => x !== '').join(' and ')}`);
      if (r.additive) refusals.note('additive-transform', `transform constraint "${r.name}" is additive`);
      const t = compileTransform(r, index, applied, bones, indexOf);
      if (applied) {
        for (let k = 0; k < bones.length; k++) {
          const m = modes[bones[k]];
          if (parents[bones[k]] >= 0 && (m === MODE_NO_SCALE || m === MODE_NO_SCALE_OR_REFLECTION)) refusals.note('noscale-world-target', `transform constraint "${r.name}" moves bone "${r.bones[k]}" in world space, and its local values are read back in a noScale mode`);
        }
      }
      constraints.push(t);
    }
  }

  // --- slots and the records they show ---
  const attachments: RuntimeAttachment[] = [];
  let vertexCount = 0;
  const sourceOf = sourceOfDoc(doc);
  /** Per slot, each placeholder's attachment index (−1 shows nothing) and what it misses, resolved once and its refusal noted for every animation that shows it. */
  const resolvedBySlot = doc.slots.map(() => new Map<string | null, { index: number; missing: readonly [RuntimeFeature, string] | null }>());
  const resolve = (si: number, placeholder: string | null, animation: string | null): number => {
    const cache = resolvedBySlot[si];
    let kept = cache.get(placeholder);
    if (kept === undefined) {
      kept = resolveRecord(si, placeholder);
      cache.set(placeholder, kept);
    }
    if (kept.missing !== null) refusals.note(kept.missing[0], kept.missing[1], animation);
    return kept.index;
  };
  const resolveRecord = (si: number, placeholder: string | null): { index: number; missing: readonly [RuntimeFeature, string] | null } => {
    const slot = doc.slots[si];
    const shown = placeholder === null ? null : shownAttachment(doc, slot, placeholder);
    if (shown === null) return { index: -1, missing: null };
    if ('conflict' in shown) return { index: -1, missing: ['skin-conflict', `slot "${slot.name}" placeholder "${placeholder}" is filled by skins that disagree`] };
    const row = shownRow(shown);
    const g = shown.record.geometry;
    const at = { slot: si, name: row.name, skin: shown.skin, placeholder: shown.placeholder, path: CORE_REGION_KINDS.has(shown.record.kind) ? row.path : null, bone: indexOf(slot.bone), offset: vertexCount };
    let made: RuntimeAttachment | null = null;
    let missing: readonly [RuntimeFeature, string] | null = null;
    if (g?.kind === 'clipping') missing = ['clipping', `slot "${slot.name}" shows clipping attachment "${row.name}"`];
    else if (g?.kind === 'region') {
      const r = g.region;
      if (r.atlas === null) missing = ['null-atlas-region', `slot "${slot.name}" shows region "${row.name}", whose atlas rectangle the model states as null`];
      else {
        // `regionCorners`' local half (src/core/vertices.ts), the same operations in the same order: only `a·lx + b·ly + worldX` depends on the pose.
        const W = r.width;
        const H = r.height;
        const sx = r.scaleX ?? 1;
        const sy = r.scaleY ?? 1;
        const rect = r.atlas;
        const kx = (W / rect.originalWidth) * sx;
        const ky = (H / rect.originalHeight) * sy;
        const x1 = (-W / 2) * sx + rect.offsetX * kx;
        const y1 = (-H / 2) * sy + rect.offsetY * ky;
        const x2 = x1 + rect.width * kx;
        const y2 = y1 + rect.height * ky;
        const angle = (r.rotation ?? 0) * RAD;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const x = r.x ?? 0;
        const y = r.y ?? 0;
        const local = new Float64Array(8);
        const corners = [x1, y1, x1, y2, x2, y2, x2, y1];
        for (let k = 0; k < 8; k += 2) {
          const px = corners[k];
          const py = corners[k + 1];
          local[k] = px * cos + x - py * sin;
          local[k + 1] = py * cos + y + px * sin;
        }
        made = vertexAttachment(at, DRAW_REGION, local, 8);
      }
    } else if (g?.kind === 'mesh' || g?.kind === 'linkedmesh') {
      const source = g.kind === 'mesh' ? g.vertices : sourceOf(g.skin, g.slot, g.source);
      if (typeof source === 'string') throw new RuntimeInputError(`slot "${slot.name}": ${source} (readModel refuses it first)`);
      made = meshAttachment(at, source, indexOf, plant.bindingIndex, nb);
    }
    // A bounding box, a path, a refused record admitted by a plant: the row's name and path, and nothing drawn.
    if (made === null) made = vertexAttachment(at, DRAW_NONE, new Float64Array(0), 0);
    attachments.push(made);
    vertexCount += made.count;
    return { index: attachments.length - 1, missing };
  };
  const slots: RuntimeSlot[] = doc.slots.map((slot, si) => {
    const bone = indexOf(slot.bone);
    const light = slot.color === undefined ? [1, 1, 1, 1] : readColour(slot.color);
    return {
      name: slot.name,
      bone,
      // A slot on a bone the view leaves inactive is not animated (`slotTimelinesApply` in src/core/skins.ts).
      live: active.has(slot.bone),
      setupAttachment: resolve(si, slot.setup, null),
      light: Float64Array.from(light),
      dark: slot.dark === undefined ? null : Float64Array.from(readColour(slot.dark).slice(0, 3)),
      blend: readBlend(slot),
    };
  });
  const slotIndex = new Map(doc.slots.map((s, i) => [s.name, i]));

  // --- animations ---
  const animations = new Map<string, RuntimeAnimation>();
  const refused: Array<{ animation: string; missing: RuntimeMissing[] }> = [];
  let cursorMax = 0;
  for (const anim of doc.animations) {
    const compiled = compileAnimation(anim, refusals, ignoreEvents, boneIndex, slotIndex, slots, constraints, (si, ph) => resolve(si, ph, anim.name));
    const missing = refusals.byAnimation.get(anim.name);
    if (missing !== undefined && missing.length > 0) refused.push({ animation: anim.name, missing });
    else {
      animations.set(anim.name, compiled);
      cursorMax = Math.max(cursorMax, compiled.cursors);
    }
  }

  if (refusals.model.length > 0) throw new RuntimeRefusal(refusals.model);
  const names = doc.animations.map((a) => a.name);
  return {
    doc,
    boneNames: doc.bones.map((b) => b.name),
    parents,
    modes,
    active: activeFlags,
    lengths,
    setup,
    subtreeStart,
    subtrees: Int32Array.from(flat),
    slots,
    attachments,
    vertexCount,
    constraints,
    animations,
    refused,
    cursors: cursorMax,
    scratch: plant.scratchByBones === true ? Math.max(1, nb) : Math.max(1, nb, ...constraints.map((c) => c.bones.length)),
    animation(name: string): RuntimeAnimation {
      const found = animations.get(name);
      if (found !== undefined) return found;
      const no = refused.find((r) => r.animation === name);
      if (no !== undefined) throw new RuntimeRefusal(no.missing);
      throw new RuntimeInputError(`animation ${JSON.stringify(name)} is not one of this document's [${names.join(', ')}]`);
    },
  };
}

type AttachmentHead = { slot: number; name: string; skin: string; placeholder: string; path: string | null; bone: number; offset: number };

const NO_INTS = new Int32Array(0);
const NO_NUMBERS = new Float64Array(0);

function vertexAttachment(at: AttachmentHead, draw: number, local: Float64Array, count: number): RuntimeAttachment {
  return { ...at, draw, local, count, bindingCounts: NO_INTS, bindingBones: NO_INTS, bindingX: NO_NUMBERS, bindingY: NO_NUMBERS, bindingWeights: NO_NUMBERS };
}

/** A mesh's (or a linked mesh's source's) vertices: every stored number through `Math.fround` (src/core/vertices.ts, *A mesh's vertices*). */
function meshAttachment(at: AttachmentHead, vertices: ModelVertices, indexOf: (name: string) => number, rewrite: RuntimePlant['bindingIndex'], bones: number): RuntimeAttachment {
  if (!vertices.weighted) {
    const n = vertices.xy.length - (vertices.xy.length % 2);
    const local = new Float64Array(n);
    for (let i = 0; i < n; i++) local[i] = Math.fround(vertices.xy[i]);
    return vertexAttachment(at, DRAW_MESH, local, n);
  }
  const counts: number[] = [];
  const ids: number[] = [];
  const xs: number[] = [];
  const ys: number[] = [];
  const ws: number[] = [];
  for (const influences of vertices.bindings) {
    counts.push(influences.length);
    for (const b of influences) {
      const i = indexOf(b.bone);
      ids.push(rewrite === undefined ? i : rewrite(i, bones));
      xs.push(Math.fround(b.x));
      ys.push(Math.fround(b.y));
      ws.push(Math.fround(b.weight));
    }
  }
  return { ...at, draw: DRAW_WEIGHTED, local: NO_NUMBERS, count: counts.length * 2, bindingCounts: Int32Array.from(counts), bindingBones: Int32Array.from(ids), bindingX: Float64Array.from(xs), bindingY: Float64Array.from(ys), bindingWeights: Float64Array.from(ws) };
}

function compileIk(r: CoreIkRecord, index: number, applied: boolean, bones: Int32Array, indexOf: (name: string) => number): RuntimeIk {
  return {
    kind: 'ik', name: r.name, index, applied, bones, target: indexOf(r.target),
    scaleY: r.scaleY === 'uniform' ? SCALE_Y_UNIFORM : r.scaleY === 'volume' ? SCALE_Y_VOLUME : SCALE_Y_NONE,
    mix: r.mix, softness: r.softness, flags: ikFlags(r.bendPositive, r.compress, r.stretch),
  };
}

function ikFlags(bendPositive: boolean, compress: boolean, stretch: boolean): number {
  return (bendPositive ? IK_BEND_POSITIVE : 0) | (compress ? IK_COMPRESS : 0) | (stretch ? IK_STRETCH : 0);
}

function compileTransform(r: CoreTransformRecord, index: number, applied: boolean, bones: Int32Array, indexOf: (name: string) => number): RuntimeTransform {
  const fromProperty: number[] = [];
  const fromOffset: number[] = [];
  const toStart: number[] = [];
  const toEnd: number[] = [];
  const toProperty: number[] = [];
  const toOffset: number[] = [];
  const toScale: number[] = [];
  const toMax: number[] = [];
  for (const from of r.properties) {
    fromProperty.push(TRANSFORM_PROPERTIES.indexOf(from.property));
    fromOffset.push(from.offset);
    toStart.push(toProperty.length);
    for (const to of from.to) {
      toProperty.push(TRANSFORM_PROPERTIES.indexOf(to.property));
      toOffset.push(to.offset);
      toScale.push(to.scale);
      toMax.push(to.max);
    }
    toEnd.push(toProperty.length);
  }
  return {
    kind: 'transform', name: r.name, index, applied, bones, source: indexOf(r.source),
    fromProperty: Int32Array.from(fromProperty), fromOffset: Float64Array.from(fromOffset), toStart: Int32Array.from(toStart), toEnd: Int32Array.from(toEnd),
    toProperty: Int32Array.from(toProperty), toOffset: Float64Array.from(toOffset), toScale: Float64Array.from(toScale), toMax: Float64Array.from(toMax),
    offsets: Float64Array.from(TRANSFORM_PROPERTIES.map((p) => r.offsets[p])),
    mixes: Float64Array.from(TRANSFORM_PROPERTIES.map((p) => r.mixes[p])),
    clamp: r.clamp,
  };
}

/**
 * One animation compiled, its constructs not yet posed noted against it. The
 * oracle's lookups are kept: a bone or slot keyed by two targets takes the
 * LAST target (`posedBones`, `posedSlots` build a map of them), a constraint
 * keyed by two timelines the FIRST (`posedRecords` finds it).
 */
function compileAnimation(
  anim: CoreAnimation,
  refusals: Refusals,
  ignoreEvents: boolean,
  boneIndex: ReadonlyMap<string, number>,
  slotIndex: ReadonlyMap<string, number>,
  slots: readonly RuntimeSlot[],
  constraints: readonly RuntimeConstraint[],
  resolve: (slot: number, placeholder: string | null) => number,
): RuntimeAnimation {
  const tl = anim.timelines;
  const name = anim.name;
  let cursors = 0;
  const deform = tl.attachments.filter((a) => a.deform !== null);
  const sequence = tl.attachments.filter((a) => a.sequence !== null);
  if (deform.length > 0) refusals.note('deform-timeline', `${deform.length} deform timeline(s): ${deform.slice(0, 3).map((a) => `${a.skin}/${a.slot}/${a.attachment}`).join(', ')}${deform.length > 3 ? ', …' : ''}`, name);
  if (sequence.length > 0) refusals.note('sequence-timeline', `${sequence.length} sequence timeline(s): ${sequence.slice(0, 3).map((a) => `${a.skin}/${a.slot}/${a.attachment}`).join(', ')}${sequence.length > 3 ? ', …' : ''}`, name);
  if (tl.drawOrder.length > 0) refusals.note('draw-order-timeline', `${tl.drawOrder.length} draw-order key(s)`, name);
  if (tl.events.length > 0 && !ignoreEvents) refusals.note('events', `${tl.events.length} event key(s); a poser that fires none is handed out only on request (ignore: ['events'])`, name);

  const lastBy = <T extends { name: string }>(targets: readonly T[]): Map<string, T> => new Map(targets.map((t) => [t.name, t]));
  const bones: RuntimeBoneTimeline[] = [];
  for (const target of lastBy(tl.bones).values()) {
    const bone = boneIndex.get(target.name);
    if (bone === undefined) continue;
    for (const t of target.timelines) {
      if (t.kind === 'inherit') {
        refusals.note('inherit-timeline', `bone "${target.name}" keys its inherit mode`, name);
        continue;
      }
      const spec = BONE_KINDS[t.kind];
      bones.push({ bone, curve: compileCurve(t.keys, spec.length), cursor: cursors++, fields: Int32Array.from(spec.map((s) => s[0])), multiply: Uint8Array.from(spec.map((s) => s[1])) });
    }
  }
  const slotTimelines: RuntimeSlotTimeline[] = [];
  const keyedSlots = [...lastBy(tl.slots).values()].flatMap((target) => {
    const si = slotIndex.get(target.name);
    return si === undefined ? [] : [{ si, target }];
  }).sort((a, b) => a.si - b.si);
  for (const { si, target } of keyedSlots) {
    // A slot on an inactive bone is not animated: its timelines are read and posed by nothing.
    if (!slots[si].live) continue;
    for (const t of target.timelines) {
      if (t.kind === 'attachment') {
        const ids = Int32Array.from(t.keys.map((k) => resolve(si, k.name ?? null)));
        slotTimelines.push({ slot: si, curve: compileCurve(t.keys, 0), cursor: cursors++, attachments: ids, channels: null });
      } else if (t.kind === 'rgba2' || t.kind === 'rgb2') {
        refusals.note('dark-colour-timeline', `slot "${target.name}" keys an ${t.kind} timeline`, name);
      } else {
        const channels = COLOUR_CHANNELS[t.kind];
        slotTimelines.push({ slot: si, curve: compileCurve(t.keys, channels.length), cursor: cursors++, attachments: null, channels: Int32Array.from(channels) });
      }
    }
  }
  const constraintTimelines: Array<RuntimeConstraintTimeline | null> = constraints.map(() => null);
  for (const c of constraints) {
    if (c.kind === 'ik') {
      const keyed = anim.constraints.ik.find((x) => x.name === c.name);
      if (keyed === undefined) continue;
      constraintTimelines[c.index] = { constraint: c.index, curve: compileCurve(keyed.keys, 2), cursor: cursors++, flags: Uint8Array.from(keyed.keys.map((k) => ikFlags(k.flags.bendPositive, k.flags.compress, k.flags.stretch))) };
    } else {
      const keyed = anim.constraints.transform.find((x) => x.name === c.name);
      if (keyed === undefined) continue;
      constraintTimelines[c.index] = { constraint: c.index, curve: compileCurve(keyed.keys, TRANSFORM_PROPERTIES.length), cursor: cursors++, flags: null };
    }
  }
  return { name, duration: tl.duration, bones, slots: slotTimelines, constraints: constraintTimelines, cursors, events: tl.events.length };
}
