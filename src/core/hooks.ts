/**
 * The core's hooks for the deform survey (issue #969, step 3e of issue #380):
 * the poses `src/deformmeasure.ts` takes, and what it reads off them, in full
 * doubles — the raw entry's arithmetic (`./raw.ts`) reached at the survey's
 * own seams rather than at a renderer's.
 *
 * The survey poses a skeleton two ways and reads four things off it. Each is
 * an entry here, and each was measured against spine-core 4.3.13 running the
 * survey's own recipe on hand-written documents and on every built row of the
 * tree, at tolerance 0 — every double equal, every float32 equal to the bit
 * (the selftest's `DM` controls; the PR of issue #969 carries the counts). The
 * runtime's source was not read.
 *
 * - **A jump** (`poseJump`) — `deformmeasure.ts`'s `poseAt`: a fresh skeleton,
 *   the setup pose, `update(0)`, `Physics.reset`; then ONE step of `time`
 *   (`AnimationState.update(time)`, `apply`, `Skeleton.update(time)`,
 *   `Physics.update`). It is the raw walk's `setup` reset with one step
 *   (`poseRawAnimation(doc, animation, [time], {}, 'setup')`, measured there),
 *   returning what the walk computes and does not hand out: the world
 *   transforms, the slot rows and every slot's shown record with the deform
 *   array its timelines set.
 * - **A dial** (`poseDial`) — the survey's slider probe: the setup pose with ONE
 *   local field of one bone overridden (`bone.pose[field] = u` after
 *   `setupPose`) or one bone-less slider's time overridden
 *   (`slider.pose.time = u`), `update(0)`, `Physics.reset`. The override is
 *   the pose's, not the setup's: a slider's non-additive blend still reads the
 *   bone's SETUP value (`CoreSliderRecord.setup`), so the view carries the
 *   overridden bone and the slider records keep the ones they were read with.
 *   Two readings come back:
 *   - `read` — the dial's property as `FromProperty.value(skeleton,
 *     bone.appliedPose, local, zeros)` returns it after the whole update (and,
 *     under `local`, after `BonePose.validateLocalTransform`): `sourceValue` in
 *     `./constraints.ts` with no offset, over the solver's LAST state — every
 *     bone's local values as the constraints left them (`applyConstraints`'
 *     `settled`), its world as they left it;
 *   - `applied` — `SliderPose.time` off the applied pose: the time
 *     `sliderTime` computed when the slider ran, before its animation's loop
 *     wrap (`SliderApplication.time`); a slider that did not run (mix 0, or
 *     not active under the skin) keeps its pose's time, the record's `time`
 *     (the override, on a bone-less dial).
 * - **The mesh's world vertices with the slot's deform as posed, cleared, or
 *   replaced** (`meshWorld`) — `VertexAttachment.computeWorldVertices(skeleton,
 *   slot, …)` over the slot's `appliedPose.deform`: an empty array reads the
 *   attachment's own vertices (float32, `worldVertices`' default coords); a
 *   non-empty one IS the vertex array — positions unweighted, offsets added to
 *   each binding's float32 coordinate weighted (`deformedVertices`) — read as
 *   the doubles it holds (`EXACT_COORDS`). The array is the slot's, not the
 *   attachment's: the runtime reads whatever the slot carries, so the posed
 *   array is the one the shown record's timelines set (`ShownGeometry.deform`)
 *   whichever record the vertices are asked of — including another mesh's
 *   array, when the slot shows another mesh that a timeline deforms. That
 *   array is read as the runtime reads it whatever its length: its first
 *   `deformLength` numbers, and NaN past its end (an unweighted mesh reads the
 *   array AS its positions; a weighted one adds it binding by binding) —
 *   measured on a slot switched to a three-vertex mesh while a four-vertex
 *   one's key is asked of it, and on the reverse (`DM02`).
 * - **What a slot shows and at what alpha** (`slotDraw`): the slot row's shown
 *   name and light alpha, the shown record's timeline identity
 *   (`timelineIdentity` in `./deform.ts` — the runtime's
 *   `Attachment.timelineAttachment` compared by record) and its own colour's
 *   alpha on a mesh or linked mesh (1 on anything else, as the survey reads
 *   `shown instanceof MeshAttachment ? shown.color.a : 1`).
 * - **Float32 rows** (`float32Rows`): the survey holds world vertices in a
 *   `Float32Array` (`computeWorldVertices` into one), so the core's doubles are
 *   stored through the same conversion — a store, `Math.fround` per value.
 *
 * ⛔ Nothing is posed that the core would leave out: a construct the raw entry
 * refuses (`./raw.ts`), a block the setup pose leaves absent that the survey
 * reads (bones, slots, the shown records), a record the survey names that the
 * view does not hold — each is a `CoreInputError` naming it, and the survey's
 * seam then says which poser it used and why.
 *
 * ## Purity
 *
 * As the rest of the core: nothing from the Spine runtime package, nothing
 * from `src/transform.ts`, no clock, no randomness, no I/O.
 */
import type { ModelBone } from '../model.ts';
import { activeBones, constraintRecords, CoreInputError, poseSetup, rawNumber, readColour, shownAttachment, type CompiledDocument, type CorePlant, type CoreSlotRow } from './index.ts';
import { posedBoneWorld, posedSlots } from './animation.ts';
import { applyConstraints, constraintsAbsentWhy, pathAnimationsWhy, sourceValue, type SolverState, type TransformProperty } from './constraints.ts';
import { freshStepContext, steppedPreviousPassWhy } from './constraints_physics.ts';
import type { CoreSliderRecord, SliderApplication } from './constraints_slider.ts';
import { attachmentStates, deformedVertices, deformLength, timelineIdentity } from './deform.ts';
import { EXACT_COORDS, worldVertices, type ShownGeometry } from './vertices.ts';
import { worldTransforms, type CoreWorld } from './world.ts';

const RAW_PLANT: CorePlant = { round: rawNumber };

/** The six local fields a dial can drive, as a `ModelBone` names them. */
export const DIAL_BONE_FIELDS = ['rotation', 'x', 'y', 'scaleX', 'scaleY', 'shearY'] as const;
export type DialBoneField = (typeof DIAL_BONE_FIELDS)[number];

/** One pose the survey reads: the view it was posed under, the world transforms, the slot rows and the shown records. */
export interface CoreSurveyPose {
  doc: CompiledDocument;
  world: ReadonlyMap<string, CoreWorld>;
  slots: readonly CoreSlotRow[];
  shown: readonly ShownGeometry[];
}

/** A dial's override: one bone's local field, or one bone-less slider's time. */
export type DialOverride = { bone: string; field: DialBoneField; value: number } | { slider: string; time: number };

/** A dial pose, and its two readings (the header's *A dial*). */
export interface CoreDialPose extends CoreSurveyPose {
  /** Complete posed slot order, including slots without a shown attachment. */
  drawOrder: readonly string[];
  /** The slider's property read off its bone, or `null` on a bone-less slider. */
  read: number | null;
  applied: number;
}

/** The slider record `name` of the view, refused by name when it has none. */
export function sliderRecordOf(doc: CompiledDocument, name: string): CoreSliderRecord {
  const c = doc.constraints.find((x) => x.kind === 'slider' && x.name === name);
  if (c?.record?.kind !== 'slider') throw new CoreInputError(`the model document carries no slider "${name}" (it declares [${doc.constraints.filter((x) => x.kind === 'slider').map((x) => x.name).join(', ')}])`);
  return c.record;
}

/**
 * The jump (the header's first entry): the setup pose reset, then one step of
 * `time`, as `poseRawAnimation(doc, animation, [time], {}, 'setup')` walks it.
 */
export function poseJump(doc: CompiledDocument, animation: string, time: number): CoreSurveyPose {
  const anim = doc.animations.find((a) => a.name === animation);
  if (anim === undefined) throw new CoreInputError(`animation "${animation}" is not one of this document's [${doc.animations.map((a) => a.name).join(', ')}]`);
  if (!Number.isFinite(time) || time < 0) throw new CoreInputError(`the jump's time is ${time}, not a finite time at or above 0`);
  const why = constraintsAbsentWhy(doc) ?? pathAnimationsWhy(doc) ?? steppedPreviousPassWhy(doc);
  if (why !== null) throw new CoreInputError(`the jump leaves the bones out: ${why}`);
  const ctx = freshStepContext();
  const reset = poseSetup(doc, RAW_PLANT, ctx);
  const resetWhy = reset.absent.filter(([b]) => b === 'setup.bones');
  if (resetWhy.length > 0 || reset.world === null) throw new CoreInputError(`the jump's reset pose leaves ${resetWhy.map(([b, w]) => `${b} out (${w})`).join('; ') || 'the bones out'}`);
  ctx.phase = 'update';
  const t = time < anim.timelines.duration ? time : anim.timelines.duration;
  const before = ctx.time;
  ctx.time += time;
  const sliders: SliderApplication[] = [];
  const posed = posedBoneWorld(doc, anim.timelines, t, RAW_PLANT, anim.constraints, sliders, { ctx, before });
  const placeholders = new Map<string, string | null>();
  const slots = posedSlots(doc, anim.timelines, t, RAW_PLANT, sliders, placeholders);
  if (slots.conflicts.length > 0) throw new CoreInputError(`the jump leaves the slots out: ${slots.conflicts.join('; ')}`);
  const states = attachmentStates(doc, shownAttachment, placeholders, { timelines: anim.timelines, t }, sliders, {});
  if (states.why.length > 0) throw new CoreInputError(`the jump leaves the attachments out: ${states.why.join('; ')}`);
  return { doc, world: posed.world, slots: slots.rows, shown: states.shown };
}

/** The view with the override written into the pose — a bone's local field, or a slider record's time. */
function overridden(doc: CompiledDocument, override: DialOverride): CompiledDocument {
  if ('bone' in override) {
    if (!doc.bones.some((b) => b.name === override.bone)) throw new CoreInputError(`the dial's bone "${override.bone}" is not a bone of the model document`);
    return { ...doc, bones: doc.bones.map((b): ModelBone => (b.name === override.bone ? { ...b, [override.field]: override.value } : b)) };
  }
  sliderRecordOf(doc, override.slider);
  return {
    ...doc,
    constraints: doc.constraints.map((c) => (c.kind === 'slider' && c.name === override.slider && c.record?.kind === 'slider' ? { ...c, record: { ...c.record, time: override.time } } : c)),
  };
}

const ZERO_OFFSETS: Record<TransformProperty, number> = { rotate: 0, x: 0, y: 0, scaleX: 0, scaleY: 0, shearY: 0 };

/**
 * The dial (the header's second entry): the setup pose with `override`
 * written into it, every physics state reset, and `slider`'s two readings.
 */
export function poseDial(doc: CompiledDocument, override: DialOverride, slider: string): CoreDialPose {
  const view = overridden(doc, override);
  const record = sliderRecordOf(view, slider);
  const posed = poseSetup(view, RAW_PLANT, freshStepContext());
  const missing = posed.absent.filter(([b]) => b === 'setup.bones' || b === 'setup.slots' || b === 'setup.drawOrder');
  if (missing.length > 0 || posed.world === null || posed.setup.slots === null || posed.setup.drawOrder === null) throw new CoreInputError(`the dial pose leaves ${missing.map(([b, w]) => `${b} out (${w})`).join('; ') || 'the bones out'}`);
  if (posed.shown === null) throw new CoreInputError('the dial pose leaves the shown records out (a timeline keys a placeholder several skins fill)');
  // The solver's last state, for the reading: the same pass `poseSetup` ran, with its `settled` sink.
  const active = activeBones(view);
  const applied: SliderApplication[] = [];
  const sink: { state: SolverState | null } = { state: null };
  const again = applyConstraints(view.bones, worldTransforms(view.bones, active), active, constraintRecords(view), null, applied, freshStepContext(), (state) => {
    sink.state = state;
  });
  const settled = sink.state;
  if (settled === null) throw new CoreInputError('the dial pose\'s solver left no state to read');
  for (const [name, w] of posed.world) {
    const v = again.get(name);
    if (v === undefined || v.a !== w.a || v.b !== w.b || v.c !== w.c || v.d !== w.d || v.worldX !== w.worldX || v.worldY !== w.worldY) {
      throw new CoreInputError(`the dial pose's two passes disagree on bone "${name}" — the reading would not be the pose's`);
    }
  }
  const read = record.bone === null ? null : sourceValue(settled, { source: record.bone, localSource: record.local, offsets: ZERO_OFFSETS }, record.property);
  const ran = applied.find((a) => a.name === slider);
  return { doc: view, world: posed.world, slots: posed.setup.slots, shown: posed.shown, drawOrder: posed.setup.drawOrder, read, applied: ran === undefined ? record.time : ran.time };
}

/** `skin/slot/placeholder` — the identity a deform timeline keys a record under (`timelineIdentity`). */
export function recordIdentity(skin: string, slot: string, placeholder: string): string {
  return `${skin}/${slot}/${placeholder}`;
}

/**
 * The world vertices of the mesh record `skin/slot/placeholder` drawn on
 * `slot` (the header's third entry): with the slot's deform as posed
 * (`posed`), cleared (`cleared`), or replaced by `deform`. Doubles; the
 * survey stores them through `float32Rows`.
 */
export function meshWorld(pose: CoreSurveyPose, slot: string, record: { skin: string; slot: string; placeholder: string }, deform: 'posed' | 'cleared' | ArrayLike<number>): number[] {
  const where = recordIdentity(record.skin, record.slot, record.placeholder);
  const g = pose.doc.skins.find((k) => k.name === record.skin)?.attachments[record.slot]?.[record.placeholder]?.geometry;
  if (g?.kind !== 'mesh') throw new CoreInputError(`${where} is not a mesh record of the model document`);
  const slotRecord = pose.doc.slots.find((s) => s.name === slot);
  if (slotRecord === undefined) throw new CoreInputError(`slot "${slot}" is not a slot of the model document`);
  const bone = pose.world.get(slotRecord.bone);
  if (bone === undefined) throw new CoreInputError(`slot "${slot}"'s bone "${slotRecord.bone}" has no world transform`);
  const array: readonly number[] =
    deform === 'cleared' ? [] : deform === 'posed' ? (pose.shown.find((s) => s.slot === slot)?.deform ?? []) : Array.from(deform);
  if (array.length === 0) return worldVertices(g.vertices, bone, pose.world);
  // The slot's array read as the runtime reads it whatever its length: its first `deformLength` numbers, and NaN past its end (the header's third entry).
  const length = deformLength(g.vertices);
  const fitted = array.length === length ? array : Array.from({ length }, (_v, i) => (i < array.length ? array[i] : Number.NaN));
  return worldVertices(deformedVertices(g.vertices, fitted), bone, pose.world, EXACT_COORDS);
}

/** What one slot shows and at what alpha (the header's fourth entry). */
export interface CoreSlotDraw {
  /** The shown attachment's name, or `null` for none. */
  shown: string | null;
  /** The shown record's timeline identity (`timelineIdentity`), or `null` when none can key it. */
  identity: string | null;
  /** The slot's light alpha as posed. */
  slotAlpha: number;
  /** The shown record's own colour alpha on a mesh or linked mesh; 1 otherwise. */
  attachmentAlpha: number;
}

export function slotDraw(pose: CoreSurveyPose, slot: string): CoreSlotDraw {
  const row = pose.slots.find((r) => r[0] === slot);
  if (row === undefined) throw new CoreInputError(`slot "${slot}" has no row in the pose`);
  const slotAlpha = row[5];
  if (slotAlpha === null) throw new CoreInputError(`slot "${slot}"'s alpha is not finite`);
  const shown = pose.shown.find((s) => s.slot === slot);
  const record = shown === undefined ? undefined : pose.doc.skins.find((k) => k.name === shown.skin)?.attachments[slot]?.[shown.placeholder];
  if (shown === undefined || record === undefined) return { shown: row[1], identity: null, slotAlpha, attachmentAlpha: 1 };
  const identity = timelineIdentity(slot, { skin: shown.skin, placeholder: shown.placeholder, record });
  const mesh = record.kind === 'mesh' || record.kind === 'linkedmesh';
  return { shown: row[1], identity, slotAlpha, attachmentAlpha: mesh && record.color !== undefined ? readColour(record.color)[3] : 1 };
}

/** Doubles stored as the survey stores world vertices: one `Float32Array`, each value through the store's `Math.fround`. */
export function float32Rows(values: readonly number[]): Float32Array {
  return Float32Array.from(values);
}
