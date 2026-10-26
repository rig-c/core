/**
 * Construct 4 of the core (issue #936, step 2d of issue #380): an animation's
 * bone and slot timelines at a sample time — the key search, the curve as the
 * runtime evaluates it, and every bone and slot timeline kind — posed on the
 * setup pose with the animation alone at full weight, the way the oracle
 * samples one (`tools/pose_oracle.ts`, *How a pose is posed*: the setup pose,
 * then the animation applied at `t` with alpha 1 from the setup pose, then the
 * world transforms).
 *
 * Every rule below was measured by posing a hand-written skeleton through
 * `tools/pose_oracle.ts dump` (spine-core 4.3.13) and reading the rows it
 * printed; nothing here was written from the runtime's source. The core
 * suite's `CA` controls hold the same skeletons against the core at tolerance
 * 0, and `tools/core_gate.ts` holds every recipe of the tree's corpus.
 *
 * ## The key search
 *
 * A timeline's value at `t` comes from the LAST key whose time is at or
 * before `t`. Measured on a `translatex` keyed at 0.5, 1 and 1.5 on a bone at
 * setup `x` 5, sampled on a grid of quarter seconds over 2 s:
 *
 * - **Before the first key the channel is at its setup value** — `x` read 5
 *   at 0 and 0.25. ⚠️ Not "untouched": the timeline POSES the setup value. A
 *   bone keyed by `translate` (0 → 10, 2 → 20) and by a `translatex` whose
 *   first key is at 1 read `x` = setup (1, not 11) before 1 when `translatex`
 *   is listed after `translate`, and 11 when it is listed before — each
 *   timeline, in the animation's order, writes its channels at every time.
 * - **On a key exactly, that key** — a stepped key at 0.5 (value 10) followed
 *   by a key at 1 (value 30) read 30 at t = 1, not 10.
 * - **At and after the last key, the last key's value** — 45 (setup 5 + 40)
 *   at 1.5, 1.75 and 2.
 * - Key times are compared as the runtime stores them, float32
 *   (`Math.fround`), against the sample time as a double; key values are read
 *   as float32 too. A linear segment from (0, 0) to (0.4666667, 100000)
 *   sampled at `off` read 12500, 37500, 62500, 87500 exactly — the key time
 *   and the duration both the float32 0.46666669845581055; the double
 *   0.4666667 would have read 4.1e-5 to 2.9e-4 higher.
 *
 * ## The three curves, per segment
 *
 * A key's `curve` shapes the segment from it to the next key.
 *
 * - **None — linear**: `v0 + (t − t0) / (t1 − t0) · (v1 − v0)`, per channel.
 * - **`stepped`**: the key's own value until the next key's time.
 * - **Bézier** — four absolute numbers per channel, `cx1, cy1, cx2, cy2`, the
 *   two handles of the cubic from `(t0, v0)` to `(t1, v1)` (the format's
 *   documentation: a curve's control points are in the timeline's own time and
 *   value). ⭐ **The runtime does not evaluate the cubic.** Posed on one bone,
 *   one `translatex` from (0, 0) to (1, 1000) with handles (0.1, 800) and
 *   (0.3, 1000), 2,000 `dense` samples read BELOW the exact cubic solved for
 *   `t` at every interior sample, by up to 10.34 — the residual of chords
 *   under a concave curve — and the slopes between consecutive samples fall
 *   into exactly ten runs whose nine intersections are the cubic's points at
 *   the parameter `u = 0.1, 0.2, …, 0.9` (to the fourth decimal of `t`). So
 *   the curve is the POLYLINE through the key, the cubic's nine points at
 *   tenths of its parameter, and the next key, and a sample is interpolated
 *   linearly on the piece whose end is the first point at or after `t`.
 *
 *   **The nine points, to the last float32 step.** They are stored float32,
 *   and which float32 each lands on was fixed by two measurements, both with
 *   the samples of spine-core's dump as the judge at the oracle's rounding:
 *
 *   1. *The recurrence.* Over 60 random segments whose every number was
 *      already a float32 (82,731 samples), the cubic's tenths evaluated
 *      directly missed 866 samples: each miss a point one float32 step off,
 *      where the exact double lay within a few hundredths of a step of a
 *      rounding midpoint — so the runtime's points carry a relative error
 *      near 1e-9 before the rounding. Forward differencing the cubic at the
 *      step h = 1/10 (the textbook recurrence: each point the previous plus a
 *      first difference, which grows by a second, which grows by a third)
 *      reproduces that error exactly when the third difference's one-sixth
 *      is the eight-digit decimal `0.16666667`: 0 misses. With 1/6 exact it
 *      missed 867, with 1/6 as a float32 1,694; a recurrence whose running
 *      sums are float32 missed more than any.
 *   2. *The numbers it runs on.* Over 300 of the 8,145 Bézier channel
 *      segments in the 19 recipes' bone timelines, each re-posed alone
 *      (18,430 samples), the recurrence above missed 4,145 samples when run
 *      on the key times, values and handles as float32 — and 0 when run on
 *      the numbers AS THE FILE STATES THEM (the doubles its text parses to),
 *      with only the polyline's two ends, the keys themselves, float32. The
 *      mixed readings missed 2,479 (handles stated, keys float32), 2,587
 *      (keys stated, handles float32) and 1,054 (the ends stated too). The
 *      first population could not tell these apart because its numbers were
 *      float32 to begin with; the model's numbers are float32 SHORTEST NAMES
 *      (`f32` in `src/compile.ts`), whose doubles are not the float32 itself.
 *
 *   So a key keeps both (`CoreKey.stated` and its float32 `time`/`values`),
 *   and `bezierPolyline` is the recurrence over the stated numbers. The core
 *   suite's `CA02` holds the measurement and every rejected reading missing.
 *
 * ## The bone timelines — alpha 1 from the setup pose
 *
 * Measured on bones with non-trivial setup values:
 *
 * - `rotate` ADDS to the setup rotation: setup 20, keys 350 → 10 read a world
 *   x axis at 10° at t = 0 and at 200° (−160°) half way — the value is
 *   interpolated as a number, 350 → 10 passing 180, and never wrapped to the
 *   short way round.
 * - `translate`, `translatex`, `translatey` ADD to the setup position.
 * - `scale`, `scalex`, `scaley` MULTIPLY the setup scale: setup (2, 0.5) and a
 *   key (3, 1) read (6, 0.5); a negative key or setup multiplies through
 *   (setup −2, keys −1 → 3 read 2 → −6 through 0).
 * - `shear`, `shearx`, `sheary` ADD to the setup shear.
 * - `inherit` sets the bone's inherit mode, stepped by the format: before its
 *   first key the setup mode, from each key that key's mode (measured
 *   `normal → onlyTranslation → normal` under a rotated, scaled parent).
 *
 * The posed values replace the setup values in a copy of the bone and the
 * core's own evaluator (`worldTransforms`, `./world.ts`) poses the copies.
 *
 * ## The slot timelines
 *
 * - `attachment`: stepped by nature; before its first key the setup
 *   attachment, from a key its placeholder, resolved exactly as the setup
 *   placeholder is (`shownAttachment`), a placeholder no skin fills and a
 *   `null` name both showing nothing.
 * - `rgba`, `rgb`, `alpha`, `rgba2`, `rgb2` SET the channels they name (they do
 *   not add to or scale the setup colour) and leave every other channel at
 *   setup: `rgb` keeps the setup alpha, `alpha` the setup rgb; `rgba2` and
 *   `rgb2` set the dark colour too. A key's hex pair reads as its byte over 255
 *   and is stored float32, as every key value is.
 * - **Every colour channel is clamped to [0, 1] after the curve**: an `rgba`
 *   whose green curve dips below 0 and whose red curve rises above 1 read 0
 *   and 1 there.
 * - 🚫 **`rgba2` or `rgb2` on a slot with no dark colour is refused.** Posed
 *   through the runtime, such a timeline throws while the animation is
 *   applied (`TypeError`), so no dump exists to hold a core to; the compiler
 *   refuses the same timeline before any file is written (`compileTrack`).
 *
 * ## The duration and the sample times
 *
 * The oracle's sample times are the tool's formula (`sampleTime`, which the
 * tool calls here, as it rounds with `gridRound`), over the runtime's
 * duration of the animation: the LAST key time of every timeline in it — the
 * later constructs' (constraints, deform, sequence, draw order, events)
 * included — as float32, not the model's declared `duration`. Measured: a
 * rotate ending at 1 beside an event at 2.5, the model stating 0, sampled over
 * 2.5 in spine-core's dump (`CA09`); over the 54 animations of the 19 recipes,
 * every duration agreed.
 *
 * ## What is left out, by name
 *
 * The constraints are applied after the timelines, posed by their own
 * timelines at `t` (issue #938, `./constraints.ts`), and each slider's slot
 * timelines after the sample's own (`./constraints_slider.ts`); a document
 * whose setup bones are absent has no animation bones from the core, for the
 * same reason, and neither has one whose animation keys the attachment of a
 * walked path's slot, deforms a walked path whose placeholder several skins
 * fill, or whose path offset reads a slot bone from the previous pose that
 * changes its reflection (`./constraints_path.ts`); a slider whose animation
 * keys a slot on such a document, or a placeholder skins fill differently,
 * leaves the animation slots out as they leave the setup slots out.
 *
 * ## The rest of a sample (issue #955)
 *
 * The oracle's sample carries `drawOrder`, `attachments`, `clips` and
 * `events` too, and since issue #955 the core poses each: the draw order
 * (`./draw_order.ts`), every drawn attachment's and clipping polygon's world
 * vertices through the sample's bones, in that order, with what the deform
 * and sequence timelines set on them (`./deform.ts`), and the events fired
 * since the sample before (`./events.ts`); each module's header states its
 * rules with the measurements. A path walks the curve the sample's deform
 * timelines left on its slot (`pathDeformed`). The attachments and clips are
 * absent where the bones or the slots are, and the attachments where a shown
 * region's rectangle is `null` or a timeline moves a record several skins
 * fill; the draw order where a slider keys it on a document whose bones are
 * absent.
 */
import type { ModelBone, ModelSlot } from '../model.ts';
import { readAttachmentTimelines, type CoreAttachmentTimeline } from './deform.ts';
import { readDrawOrderKeys, type CoreDrawOrderKey } from './draw_order.ts';
import { readEventKeys, type CoreEventDef, type CoreEventKey } from './events.ts';
import { worldTransforms } from './world.ts';
import { applyConstraints, constraintsAbsentWhy, pathAnimationsWhy, posedRecords, previousPassSlotBones, solverRules, type CoreConstraintRecord, type CoreConstraintTimelines } from './constraints.ts';
import { attachmentStates, deformAt, deformedVertices, timelineIdentity } from './deform.ts';
import { freshStepContext, stepPhysicsRecords, stepSchedule, steppedPreviousPassWhy, type PhysicsStepContext } from './constraints_physics.ts';
import { drawOrderAt } from './draw_order.ts';
import { eventsFired, type CoreEventRow } from './events.ts';
import { poseGeometry, type CoreAttachmentRow, type CoreClipRow } from './vertices.ts';
import type { CoreClippedRow } from './clipping.ts';
import type { CoreWorld } from './world.ts';
import { applySliderSlots, type SliderApplication } from './constraints_slider.ts';
import { slotTimelinesApply } from './skins.ts';
import {
  activeBones,
  constraintRecords,
  CoreInputError,
  drawWalkOf,
  foldInheritMode,
  gridRound,
  readBlend,
  shownAttachment,
  shownRow,
  slidersKeyingWhy,
  sourceOfDoc,
  viewColours,
  WHITE,
  type CompiledDocument,
  type CoreAnimation,
  type CoreBoneRow,
  type CorePlant,
  type CoreSkin,
  type CoreSlotRow,
} from './index.ts';

/** The bone timelines that key numbers, and the channels each key carries, in the order a curve indexes them. */
export const BONE_TIMELINE_CHANNELS = {
  rotate: ['value'],
  translate: ['x', 'y'],
  translatex: ['value'],
  translatey: ['value'],
  scale: ['x', 'y'],
  scalex: ['value'],
  scaley: ['value'],
  shear: ['x', 'y'],
  shearx: ['value'],
  sheary: ['value'],
} as const satisfies Record<string, readonly string[]>;
export type BoneNumberKind = keyof typeof BONE_TIMELINE_CHANNELS;

/** Every bone timeline this construct poses: the ten that key numbers, and `inherit`. */
export const BONE_TIMELINE_KINDS = [...(Object.keys(BONE_TIMELINE_CHANNELS) as BoneNumberKind[]), 'inherit'] as const;
export type BoneTimelineKind = (typeof BONE_TIMELINE_KINDS)[number];

/**
 * The slot timelines that key a colour: the key fields the writer spells each
 * with (`COLOUR_KEYS` in `src/compile.ts`), each field's hex length, and the
 * channels they carry, in the order a curve indexes them.
 */
export const SLOT_COLOUR_TIMELINES = {
  rgba: { fields: [['color', 8]], channels: ['r', 'g', 'b', 'a'] },
  rgb: { fields: [['color', 6]], channels: ['r', 'g', 'b'] },
  alpha: { fields: [], channels: ['a'] },
  rgba2: { fields: [['light', 8], ['dark', 6]], channels: ['r', 'g', 'b', 'a', 'r2', 'g2', 'b2'] },
  rgb2: { fields: [['light', 6], ['dark', 6]], channels: ['r', 'g', 'b', 'r2', 'g2', 'b2'] },
} as const satisfies Record<string, { fields: ReadonlyArray<readonly [string, number]>; channels: readonly string[] }>;
export type SlotColourKind = keyof typeof SLOT_COLOUR_TIMELINES;

/** Every slot timeline this construct poses. */
export const SLOT_TIMELINE_KINDS = ['attachment', ...(Object.keys(SLOT_COLOUR_TIMELINES) as SlotColourKind[])] as const;
export type SlotTimelineKind = (typeof SLOT_TIMELINE_KINDS)[number];

/**
 * The groups of an animation after its bones and slots, in the document's
 * order: the constraint timelines (construct 5, `./constraints.ts`) and this
 * construct's remainder — attachment timelines (`./deform.ts`), the draw
 * order (`./draw_order.ts`) and events (`./events.ts`). Every key time in
 * them sets the runtime's duration.
 */
export const LATER_GROUPS = ['constraints', 'attachments', 'drawOrder', 'events'] as const;

/** A key's curve as read: linear, a hold, or four float32 numbers per channel. */
export type CoreCurve = 'linear' | 'stepped' | number[];

/**
 * One key, as read: its time and channels as the runtime stores them
 * (float32), the same two as the document states them (the doubles the file's
 * text parses to — what a Bézier's polyline is computed from, the header's
 * measurement), its curve, and a name or mode where the kind keys one.
 */
export interface CoreKey {
  time: number;
  values: number[];
  stated: { time: number; values: number[] };
  curve: CoreCurve;
  /** An attachment key's placeholder (`null` shows nothing). */
  name?: string | null;
  /** An inherit key's mode, folded. */
  mode?: string;
}

export interface CoreTimeline<K extends string> {
  kind: K;
  keys: CoreKey[];
}

export interface CoreTarget<K extends string> {
  name: string;
  timelines: Array<CoreTimeline<K>>;
}

/**
 * One animation's timelines, as far as this construct reads them: the bone
 * and slot timelines in full, and of every later group only how many
 * timelines it holds and its key times (which set the runtime's duration).
 */
export interface CoreAnimationTimelines {
  /** The model's declared duration. */
  declared: number;
  /** The runtime's duration: the last key time of every timeline, as float32 — the header's rule. */
  duration: number;
  bones: Array<CoreTarget<BoneTimelineKind>>;
  slots: Array<CoreTarget<SlotTimelineKind>>;
  /** Timelines per later group, in `LATER_GROUPS` order; a group holding none is not listed. */
  later: Array<[(typeof LATER_GROUPS)[number], number]>;
  /** The deform and sequence timelines, each attachment's (`./deform.ts`). */
  attachments: CoreAttachmentTimeline[];
  /** The draw-order keys (`./draw_order.ts`); empty where the animation keys none. */
  drawOrder: CoreDrawOrderKey[];
  /** The event keys (`./events.ts`); empty where the animation fires none. */
  events: CoreEventKey[];
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isHex = (v: unknown, digits: number): v is string => typeof v === 'string' && v.length === digits && /^[0-9a-fA-F]+$/.test(v);

/** A key's time: finite, not negative, float32 as the runtime stores it — or a problem. */
function keyTime(raw: Record<string, unknown>, where: string, problems: string[]): number | null {
  const time = raw.time;
  if (typeof time !== 'number' || !Number.isFinite(time) || time < 0) {
    problems.push(`${where}: time is ${JSON.stringify(time)}, not a finite time at or after 0`);
    return null;
  }
  return time;
}

/** A list of keys, each an object with a strictly later time than the one before — the writer's rule. */
function keyList(value: unknown, where: string, problems: string[]): Array<{ raw: Record<string, unknown>; at: string; time: number }> {
  if (!Array.isArray(value) || value.length === 0) {
    problems.push(`${where}: keys is not a non-empty list`);
    return [];
  }
  const out: Array<{ raw: Record<string, unknown>; at: string; time: number }> = [];
  let last = -Infinity;
  value.forEach((raw, i) => {
    const at = `${where}.keys[${i}]`;
    if (!isRecord(raw)) {
      problems.push(`${at} is not an object`);
      return;
    }
    const time = keyTime(raw, at, problems);
    if (time === null) return;
    if (time <= last) problems.push(`${at}: time ${raw.time} is not after the key before it — the writer refuses key times that do not strictly increase`);
    last = Math.max(last, time);
    out.push({ raw, at, time });
  });
  return out;
}

function unknownKeyFields(raw: Record<string, unknown>, known: readonly string[], at: string, problems: string[]): void {
  for (const key of Object.keys(raw)) if (!known.includes(key)) problems.push(`${at}: field "${key}" is not one this timeline's keys carry; they carry [${known.join(', ')}]`);
}

/** A key's curve: absent (linear), `stepped`, or 4 finite numbers per channel; never on the last key. */
function readCurve(raw: Record<string, unknown>, channels: number, last: boolean, at: string, problems: string[]): CoreCurve {
  const curve = raw.curve;
  if (curve === undefined) return 'linear';
  if (last) {
    problems.push(`${at}: the last key carries a curve, which eases to no key — the writer refuses it`);
    return 'linear';
  }
  if (curve === 'stepped') return 'stepped';
  if (!Array.isArray(curve) || curve.length !== channels * 4 || !curve.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    problems.push(`${at}: curve is ${JSON.stringify(curve)}, not "stepped" nor ${channels * 4} finite numbers (four per channel)`);
    return 'linear';
  }
  return curve as number[];
}

function readBoneTimeline(kind: BoneTimelineKind, keysValue: unknown, where: string, problems: string[]): CoreKey[] {
  const listed = keyList(keysValue, where, problems);
  return listed.map(({ raw, at, time }, i): CoreKey => {
    if (kind === 'inherit') {
      unknownKeyFields(raw, ['time', 'inherit'], at, problems);
      const mode = typeof raw.inherit === 'string' ? foldInheritMode(raw.inherit) : null;
      if (mode === null) problems.push(`${at}: inherit is ${JSON.stringify(raw.inherit)}, which folds to no inherit mode`);
      return { time: Math.fround(time), values: [], stated: { time, values: [] }, curve: 'stepped', mode: mode ?? 'normal' };
    }
    const channels: readonly string[] = BONE_TIMELINE_CHANNELS[kind];
    unknownKeyFields(raw, ['time', ...channels, 'curve'], at, problems);
    const values = channels.map((c) => {
      const v = raw[c];
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        problems.push(`${at}: ${c} is ${JSON.stringify(v)}, not a finite number — the writer states every channel on every key`);
        return 0;
      }
      return v;
    });
    return { time: Math.fround(time), values: values.map(Math.fround), stated: { time, values }, curve: readCurve(raw, channels.length, i === listed.length - 1, at, problems) };
  });
}

/** A hex spelling's channels, each byte over 255 (the stated values; the runtime stores each float32). */
function hexChannels(hex: string, count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(Number.parseInt(hex.slice(2 * i, 2 * i + 2), 16) / 255);
  return out;
}

function readSlotTimeline(kind: SlotTimelineKind, keysValue: unknown, where: string, problems: string[]): CoreKey[] {
  const listed = keyList(keysValue, where, problems);
  return listed.map(({ raw, at, time }, i): CoreKey => {
    if (kind === 'attachment') {
      unknownKeyFields(raw, ['time', 'name'], at, problems);
      if (raw.name !== null && (typeof raw.name !== 'string' || raw.name === '')) problems.push(`${at}: name is ${JSON.stringify(raw.name)}, not a placeholder name or null`);
      return { time: Math.fround(time), values: [], stated: { time, values: [] }, curve: 'stepped', name: typeof raw.name === 'string' ? raw.name : null };
    }
    const shape: { fields: ReadonlyArray<readonly [string, number]>; channels: readonly string[] } = SLOT_COLOUR_TIMELINES[kind];
    let values: number[] = [];
    if (kind === 'alpha') {
      unknownKeyFields(raw, ['time', 'value', 'curve'], at, problems);
      const v = raw.value;
      if (typeof v !== 'number' || !Number.isFinite(v)) problems.push(`${at}: value is ${JSON.stringify(v)}, not a finite number`);
      else values = [v];
    } else {
      unknownKeyFields(raw, ['time', ...shape.fields.map(([f]) => f), 'curve'], at, problems);
      for (const [field, digits] of shape.fields) {
        const v = raw[field];
        if (!isHex(v, digits)) problems.push(`${at}: ${field} is ${JSON.stringify(v)}, not ${digits} hex digits — the one spelling the writer gives a ${kind} key's ${field}`);
        else values.push(...hexChannels(v, field === 'dark' || digits === 6 ? 3 : 4));
      }
    }
    if (values.length !== shape.channels.length) values = shape.channels.map(() => 0);
    return { time: Math.fround(time), values: values.map(Math.fround), stated: { time, values }, curve: readCurve(raw, shape.channels.length, i === listed.length - 1, at, problems) };
  });
}

/** Every key time under an animation's `constraints` group, for the runtime's duration; a time that is not a finite number is a problem. */
function constraintKeyTimes(value: unknown, where: string, problems: string[]): { timelines: number; times: number[] } {
  const times: number[] = [];
  let timelines = 0;
  const keys = (list: unknown, at: string): void => {
    timelines++;
    if (!Array.isArray(list)) {
      problems.push(`${at} is not a list of keys`);
      return;
    }
    list.forEach((k, i) => {
      if (!isRecord(k)) problems.push(`${at}[${i}] is not an object`);
      else {
        const t = keyTime(k, `${at}[${i}]`, problems);
        if (t !== null) times.push(Math.fround(t));
      }
    });
  };
  const named = (list: unknown, at: string, each: (entry: Record<string, unknown>, at: string) => void): void => {
    if (!Array.isArray(list)) {
      problems.push(`${at} is not a list`);
      return;
    }
    list.forEach((entry, i) => (isRecord(entry) ? each(entry, `${at}[${i}]`) : problems.push(`${at}[${i}] is not an object`)));
  };
  if (!isRecord(value)) problems.push(`${where} is not an object`);
  else {
    for (const kind of ['ik', 'transform'] as const) named(value[kind], `${where}.${kind}`, (e, at) => keys(e.keys, `${at}.keys`));
    for (const kind of ['path', 'physics', 'slider'] as const) named(value[kind], `${where}.${kind}`, (e, at) => named(e.timelines, `${at}.timelines`, (tl, at2) => keys(tl.keys, `${at2}.keys`)));
  }
  return { timelines, times };
}

/**
 * One animation record's timelines, read and checked: every bone and slot
 * timeline in full — a target that is not a bone or slot of the document, a
 * kind that is not one of this construct's, a kind keyed twice on one target,
 * a key missing a channel or spelling one otherwise than the writer does, a
 * curve of the wrong length or on the last key, times that do not increase,
 * and `rgba2`/`rgb2` on a slot with no dark colour are each a problem, named —
 * and of the later groups only their key times.
 */
export function readAnimationTimelines(
  raw: Record<string, unknown>,
  label: string,
  bones: ReadonlySet<string>,
  slots: readonly ModelSlot[],
  problems: string[],
  context: { skins: readonly CoreSkin[]; events: ReadonlyMap<string, CoreEventDef> },
): CoreAnimationTimelines {
  const declared = typeof raw.duration === 'number' && Number.isFinite(raw.duration) ? raw.duration : 0;
  if (typeof raw.duration !== 'number' || !Number.isFinite(raw.duration)) problems.push(`${label}: duration is ${JSON.stringify(raw.duration)}, not a finite number`);
  const slotByName = new Map(slots.map((s) => [s.name, s]));
  const times: number[] = [];
  const targets = <K extends string>(group: 'bones' | 'slots', kinds: readonly K[], known: (name: string) => string | null, read: (kind: K, keys: unknown, at: string, target: string) => CoreKey[]): Array<CoreTarget<K>> => {
    const value = raw[group];
    const out: Array<CoreTarget<K>> = [];
    if (!Array.isArray(value)) {
      problems.push(`${label}: ${group} is not a list`);
      return out;
    }
    value.forEach((entry, i) => {
      const at = `${label}.${group}[${i}]`;
      if (!isRecord(entry) || typeof entry.name !== 'string') {
        problems.push(`${at} names no target`);
        return;
      }
      const where = `${at} "${entry.name}"`;
      const miss = known(entry.name);
      if (miss !== null) problems.push(`${where}: ${miss}`);
      if (!Array.isArray(entry.timelines)) {
        problems.push(`${where}: timelines is not a list`);
        return;
      }
      const name = entry.name;
      const target: CoreTarget<K> = { name, timelines: [] };
      entry.timelines.forEach((tl, j) => {
        const tat = `${where}.timelines[${j}]`;
        if (!isRecord(tl) || typeof tl.name !== 'string') {
          problems.push(`${tat} names no timeline`);
          return;
        }
        const kind = kinds.find((k) => k === tl.name);
        if (kind === undefined) {
          problems.push(`${tat}: "${tl.name}" is not a ${group === 'bones' ? 'bone' : 'slot'} timeline this core reads; it reads [${kinds.join(', ')}]`);
          return;
        }
        if (target.timelines.some((x) => x.kind === kind)) problems.push(`${tat}: "${kind}" is keyed twice on ${name} — the writer merges one property's tracks into one`);
        const keys = read(kind, tl.keys, `${tat} "${kind}"`, name);
        for (const k of keys) times.push(k.time);
        target.timelines.push({ kind, keys });
      });
      out.push(target);
    });
    return out;
  };
  const boneTargets = targets('bones', BONE_TIMELINE_KINDS, (n) => (bones.has(n) ? null : `"${n}" is not a bone of this document`), (kind, keys, at) => readBoneTimeline(kind, keys, at, problems));
  const slotTargets = targets('slots', SLOT_TIMELINE_KINDS, (n) => (slotByName.has(n) ? null : `"${n}" is not a slot of this document`), (kind, keys, at, slot) => {
    if ((kind === 'rgba2' || kind === 'rgb2') && slotByName.get(slot)?.dark === undefined) {
      problems.push(`${at}: slot "${slot}" states no dark colour, and a ${kind} timeline on such a slot makes the runtime throw while it is applied — the writer refuses it`);
    }
    return readSlotTimeline(kind, keys, at, problems);
  });
  const later: CoreAnimationTimelines['later'] = [];
  // The constraint timelines' key times only (construct 5 reads them, `./constraints.ts`); the other three groups are read in full here.
  const constraintTimes = constraintKeyTimes(raw.constraints, `${label}.constraints`, problems);
  times.push(...constraintTimes.times);
  if (constraintTimes.timelines > 0) later.push(['constraints', constraintTimes.timelines]);
  const attachments = readAttachmentTimelines(raw.attachments, label, context.skins, problems);
  const drawOrder = readDrawOrderKeys(raw.drawOrder, label, slots, problems);
  const events = readEventKeys(raw.events, label, context.events, problems);
  for (const a of attachments) for (const k of [...(a.deform ?? []), ...(a.sequence ?? [])]) times.push(k.time);
  for (const k of [...drawOrder, ...events]) times.push(k.time);
  const attachmentTimelines = attachments.reduce((n, a) => n + (a.deform === null ? 0 : 1) + (a.sequence === null ? 0 : 1), 0);
  if (attachmentTimelines > 0) later.push(['attachments', attachmentTimelines]);
  if (drawOrder.length > 0) later.push(['drawOrder', 1]);
  if (events.length > 0) later.push(['events', 1]);
  return { declared, duration: times.length === 0 ? 0 : Math.max(...times), bones: boneTargets, slots: slotTargets, later, attachments, drawOrder, events };
}

// ---------------------------------------------------------------------------
// evaluation
// ---------------------------------------------------------------------------

/**
 * The one-sixth of the third forward difference, as the header measured it:
 * the eight-digit decimal, which alone of the spellings tried reproduced
 * 82,731 samples of 60 random Bézier segments and 18,430 of 300 corpus
 * segments at the oracle's rounding.
 */
export const BEZIER_SIXTH = 0.16666667;
/** Pieces of the runtime's polyline per Bézier segment — the header's ten slope runs. */
export const BEZIER_PIECES = 10;

/**
 * The nine interior points of one channel's Bézier segment, `[t1, v1, …, t9,
 * v9]`, each float32: the cubic from `(t0, v0)` through the handles to `(t3,
 * v3)` — every one of the eight the number the document states, not its
 * float32 (the header's second measurement) — at its parameter `u = 0.1 …
 * 0.9`, by forward differences at the step
 * h = 1/10. With `p` the four control numbers of one coordinate, the second
 * difference is `3h²(p0 − 2p1 + p2)` and the third `6h³(3(p1 − p2) − p0 + p3)`;
 * the first starts at `3h(p1 − p0)` plus the second plus the third times
 * `BEZIER_SIXTH`; each step adds the first to the point, the second to the
 * first and the third to the second (the header's measurement fixes the
 * order of those additions and the constant).
 */
export function bezierPolyline(t0: number, v0: number, cx1: number, cy1: number, cx2: number, cy2: number, t3: number, v3: number): number[] {
  const walk = (p0: number, p1: number, p2: number, p3: number): number[] => {
    const second = (p0 - 2 * p1 + p2) * 0.03;
    const third = ((p1 - p2) * 3 - p0 + p3) * 0.006;
    let first = (p1 - p0) * 0.3 + second + third * BEZIER_SIXTH;
    let d2 = second * 2 + third;
    let at = p0;
    const out: number[] = [];
    for (let i = 1; i < BEZIER_PIECES; i++) {
      at += first;
      first += d2;
      d2 += third;
      out.push(Math.fround(at));
    }
    return out;
  };
  const ts = walk(t0, cx1, cx2, t3);
  const vs = walk(v0, cy1, cy2, v3);
  const out: number[] = [];
  for (let i = 0; i < ts.length; i++) out.push(ts[i], vs[i]);
  return out;
}

/** What evaluates one channel of a segment: `channelAt` unless a plant passes another. */
export type ChannelEvaluator = (keys: readonly CoreKey[], index: number, channel: number, t: number) => number;

/** What finds the key a time falls on: `keyIndexAt` unless a plant passes another. */
export type KeySearch = (keys: readonly CoreKey[], t: number) => number;

/** The last key at or before `t`, or −1 before the first — the header's key search. */
export function keyIndexAt(keys: ReadonlyArray<{ time: number }>, t: number): number {
  let found = -1;
  for (let i = 0; i < keys.length; i++) {
    if (keys[i].time <= t) found = i;
    else break;
  }
  return found;
}

/**
 * Each Bézier segment's polylines, one per channel, kept with the key that
 * starts the segment and the key that ends it (issue #1134): a polyline is a
 * function of those two keys' stated numbers and handles only, and a walk
 * evaluated the same segment's on every step. A key read is never written; a
 * plant that changes a key passes a copy, which keeps polylines of its own.
 */
const segmentPolylines = new WeakMap<CoreKey, { end: CoreKey; channels: Array<number[] | undefined> }>();

/** Channel `channel` of the segment starting at key `index` (not the last), at `t` — the header's three curves. */
export function channelAt(keys: readonly CoreKey[], index: number, channel: number, t: number): number {
  const a = keys[index];
  const b = keys[index + 1];
  if (b === undefined || a.curve === 'stepped') return a.values[channel];
  if (a.curve === 'linear') return a.values[channel] + ((t - a.time) / (b.time - a.time)) * (b.values[channel] - a.values[channel]);
  let kept = segmentPolylines.get(a);
  if (kept === undefined || kept.end !== b) {
    kept = { end: b, channels: [] };
    segmentPolylines.set(a, kept);
  }
  let points = kept.channels[channel];
  if (points === undefined) {
    const c = a.curve.slice(channel * 4, channel * 4 + 4);
    const inner = bezierPolyline(a.stated.time, a.stated.values[channel], c[0], c[1], c[2], c[3], b.stated.time, b.stated.values[channel]);
    points = [a.time, a.values[channel], ...inner, b.time, b.values[channel]];
    kept.channels[channel] = points;
  }
  let i = 2;
  while (i < points.length - 2 && points[i] < t) i += 2;
  const [x0, y0, x1, y1] = [points[i - 2], points[i - 1], points[i], points[i + 1]];
  return y0 + ((t - x0) / (x1 - x0)) * (y1 - y0);
}

/** Every plant this construct takes, beside the setup constructs' own (`CorePlant`). */
export interface TimelinePlant extends CorePlant {
  channel?: ChannelEvaluator;
  search?: KeySearch;
}

/** A timeline's channels at `t`, or `null` before its first key (the channels are then at setup). */
function valuesAt(keys: readonly CoreKey[], t: number, plant: TimelinePlant): number[] | null {
  const index = (plant.search ?? keyIndexAt)(keys, t);
  if (index < 0) return null;
  const channel = plant.channel ?? channelAt;
  return keys[index].values.map((_v, c) => channel(keys, index, c, t));
}

/** The key a stepped-by-nature timeline (attachment, inherit) shows at `t`, or `null` before its first key. */
function keyAt(keys: readonly CoreKey[], t: number, plant: TimelinePlant): CoreKey | null {
  const index = (plant.search ?? keyIndexAt)(keys, t);
  return index < 0 ? null : keys[index];
}

/** Each animation's bone timelines by bone name, kept with the timelines they index (`posedBones`). */
const boneTimelinesByName = new WeakMap<CoreAnimationTimelines, ReadonlyMap<string, CoreTarget<BoneTimelineKind>>>();

/** The animation's bone timelines by bone name, built once per timelines object (issue #1134: a walk built it again on every step); timelines read are never written. */
function boneTimelinesOf(timelines: CoreAnimationTimelines): ReadonlyMap<string, CoreTarget<BoneTimelineKind>> {
  let byName = boneTimelinesByName.get(timelines);
  if (byName === undefined) {
    byName = new Map(timelines.bones.map((b) => [b.name, b]));
    boneTimelinesByName.set(timelines, byName);
  }
  return byName;
}

/** The bones posed by the animation's bone timelines at `t`: copies of the setup bones with the posed fields — the header's rules. */
export function posedBones(doc: CompiledDocument, timelines: CoreAnimationTimelines, t: number, plant: TimelinePlant = {}): ModelBone[] {
  const byName = boneTimelinesOf(timelines);
  return doc.bones.map((setup) => {
    const target = byName.get(setup.name);
    if (target === undefined) return setup;
    const bone: ModelBone = { ...setup };
    for (const tl of target.timelines) {
      if (tl.kind === 'inherit') {
        const key = keyAt(tl.keys, t, plant);
        if (key === null) {
          if (setup.inheritMode === undefined) delete bone.inheritMode;
          else bone.inheritMode = setup.inheritMode;
        } else bone.inheritMode = key.mode;
        continue;
      }
      const v = valuesAt(tl.keys, t, plant);
      const add = (field: 'x' | 'y' | 'rotation' | 'shearX' | 'shearY', i: number): void => {
        bone[field] = (setup[field] ?? 0) + (v === null ? 0 : v[i]);
      };
      const times = (field: 'scaleX' | 'scaleY', i: number): void => {
        bone[field] = (setup[field] ?? 1) * (v === null ? 1 : v[i]);
      };
      switch (tl.kind) {
        case 'rotate': add('rotation', 0); break;
        case 'translate': add('x', 0); add('y', 1); break;
        case 'translatex': add('x', 0); break;
        case 'translatey': add('y', 0); break;
        case 'shear': add('shearX', 0); add('shearY', 1); break;
        case 'shearx': add('shearX', 0); break;
        case 'sheary': add('shearY', 0); break;
        case 'scale': times('scaleX', 0); times('scaleY', 1); break;
        case 'scalex': times('scaleX', 0); break;
        case 'scaley': times('scaleY', 0); break;
      }
    }
    return bone;
  });
}

/**
 * A player's bone-local adjustment (issue #1336): a function the live track
 * (`openTrack`'s `adjust`, `./track.ts`) calls once per pose, after the
 * animation's timelines have posed the bone locals at the step's time and
 * before the world transforms, the constraints and the physics step — so a
 * write is what the rest of the step reads: the bone's children, the
 * attachments drawn through it, every constraint and the physics constraint
 * stepped on top of it. It is spine-core's "application code" writing
 * `Bone.pose` between `AnimationState.apply` and `updateWorldTransform`
 * (`CO50` holds the two equal at tolerance 0).
 *
 * - **The view is the step's locals, posed from the setup pose.** Every pose
 *   of a walk is posed from the setup pose at its time (`./raw.ts`,
 *   `TrackState`), so a write lives for the pose it was written in and the
 *   next step's hook reads the timelines' value again, not the write. A
 *   channel no timeline keys reads its setup value on every step.
 * - **A bone the hook does not write is untouched**: the timelines' bone
 *   object as it was, the setup bone itself where nothing keys it. A written
 *   bone is copied before the write, so the document is never written.
 * - **A write that is not a finite number is refused by name**, the bone, the
 *   channel and the value — where the core refuses a non-finite value, by
 *   name, rather than posing a picture with it (`finite` in `./raw.ts`).
 */
export interface BoneLocals {
  rotation: number;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  shearX: number;
  shearY: number;
}

/** The locals of a step's bones, by name (`BoneLocals`). */
export interface AdjustableLocals {
  /** The document's bones, in its order. */
  readonly names: readonly string[];
  /** One bone's locals, read and written in place; a name the document has no bone for is refused by name. */
  bone(name: string): BoneLocals;
}

/** The pose being adjusted (issue #1540), independent of the physics clock. */
export interface LocalAdjustContext {
  /** Current track-0 entry's unwrapped seconds, starting at 0; null without that entry. */
  readonly trackTime: number | null;
  /** That same entry's animation name; null without it or for an explicit empty entry. */
  readonly animation: string | null;
  /** Running sum of this walk's steps, in seconds; never the physics clock. */
  readonly globalTime: number;
}

/** Called once per evaluated pose, after track composition and before world transforms and physics. Unary callbacks remain assignable. */
export type LocalAdjust = (locals: AdjustableLocals, ctx: LocalAdjustContext) => void;

/** The seven channels a `BoneLocals` reads and writes, each with the value an unstated one reads as (`worldTransforms`' defaults). */
const LOCAL_CHANNELS = { rotation: 0, x: 0, y: 0, scaleX: 1, scaleY: 1, shearX: 0, shearY: 0 } as const;
type LocalChannel = keyof typeof LOCAL_CHANNELS;

/** One bone of a step's `bones`, read through and written through, copied on its first write (`BoneLocals`' second rule). */
class StepLocals implements BoneLocals {
  constructor(
    private readonly bones: ModelBone[],
    private readonly index: number,
    private readonly setup: ModelBone,
  ) {}

  private read(channel: LocalChannel): number {
    return this.bones[this.index][channel] ?? LOCAL_CHANNELS[channel];
  }

  private write(channel: LocalChannel, value: number): void {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new CoreInputError(`the adjustment wrote bone "${this.setup.name}" ${channel} = ${String(value)}, not a finite number`);
    if (this.bones[this.index] === this.setup) this.bones[this.index] = { ...this.setup };
    this.bones[this.index][channel] = value;
  }

  get rotation(): number { return this.read('rotation'); }
  set rotation(v: number) { this.write('rotation', v); }
  get x(): number { return this.read('x'); }
  set x(v: number) { this.write('x', v); }
  get y(): number { return this.read('y'); }
  set y(v: number) { this.write('y', v); }
  get scaleX(): number { return this.read('scaleX'); }
  set scaleX(v: number) { this.write('scaleX', v); }
  get scaleY(): number { return this.read('scaleY'); }
  set scaleY(v: number) { this.write('scaleY', v); }
  get shearX(): number { return this.read('shearX'); }
  set shearX(v: number) { this.write('shearX', v); }
  get shearY(): number { return this.read('shearY'); }
  set shearY(v: number) { this.write('shearY', v); }
}

/** The adjustment run over a step's `bones` (`posedBones`' array, in the document's order), which it may replace bone by bone (`BoneLocals`). */
function adjustLocals(doc: CompiledDocument, bones: ModelBone[], adjust: LocalAdjust, context: LocalAdjustContext): void {
  const views = new Map<string, StepLocals>();
  const names = doc.bones.map((b) => b.name);
  adjust({
    names,
    bone(name: string): BoneLocals {
      let view = views.get(name);
      if (view === undefined) {
        const index = names.indexOf(name);
        if (index < 0) throw new CoreInputError(`the adjustment asked for bone ${JSON.stringify(name)}, which is not one of this document's bones`);
        // A copy the timelines made is this step's own; the setup bone is the document's, copied on its first write.
        view = new StepLocals(bones, index, doc.bones[index]);
        views.set(name, view);
      }
      return view;
    },
  }, context);
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * The slot rows at `t`, in the oracle's shape and rounding, or the conflicts
 * that leave them out: a slot showing a placeholder several skins fill
 * differently (the setup slots' ⚠️, `shownAttachment`).
 */
export function posedSlots(
  doc: CompiledDocument,
  timelines: CoreAnimationTimelines,
  t: number,
  plant: TimelinePlant = {},
  sliders: readonly SliderApplication[] = [],
  /** Filled with each slot's placeholder once the sample's own timelines have moved it, before the sliders — what the attachments are posed from (`attachmentStates`). */
  placeholders?: Map<string, string | null>,
): { rows: CoreSlotRow[]; conflicts: string[] } {
  // The view's stated colours, read once (`viewColours`); a planted reader of the light colour is called as it always was.
  const stated = viewColours(doc);
  const colour = plant.colour ?? stated;
  const byName = new Map(timelines.slots.map((s) => [s.name, s]));
  return slotRowsFrom(doc, plant, sliders, placeholders, (slot, live) => {
    let placeholder = slot.setup;
    const setupLight = slot.color === undefined ? WHITE : colour(slot.color);
    const light = [setupLight[0], setupLight[1], setupLight[2], setupLight[3]];
    const setupDark = slot.dark === undefined ? null : stated(slot.dark);
    const dark = setupDark === null ? null : [setupDark[0], setupDark[1], setupDark[2]];
    for (const tl of live ? (byName.get(slot.name)?.timelines ?? []) : []) {
      if (tl.kind === 'attachment') {
        const key = keyAt(tl.keys, t, plant);
        placeholder = key === null ? slot.setup : (key.name ?? null);
        continue;
      }
      const v = valuesAt(tl.keys, t, plant);
      const channels = SLOT_COLOUR_TIMELINES[tl.kind].channels;
      channels.forEach((name, i) => {
        const at = { r: 0, g: 1, b: 2, a: 3, r2: 4, g2: 5, b2: 6 }[name];
        if (at < 4) light[at] = v === null ? setupLight[at] : clamp01(v[i]);
        else if (dark !== null && setupDark !== null) dark[at - 4] = v === null ? setupDark[at - 4] : clamp01(v[i]);
      });
    }
    return { placeholder, light, dark };
  });
}

/**
 * What a slot holds once the timelines have posed it and before the sliders:
 * the placeholder it shows, its light colour and its dark one (`null` where
 * the slot states none). `posedSlots` reads it off one animation at `t`; the
 * live tracks off their mixed entries (`./tracks.ts`, issue #1336).
 */
export interface SlotBase {
  placeholder: string | null;
  light: number[];
  dark: number[] | null;
}

/**
 * The slot rows from each slot's `SlotBase` — `baseOf`, called once per slot
 * in the document's order with whether the slot is animated at all — then the
 * sliders, the resolution and the oracle's row: `posedSlots`' body past the
 * timelines, which the live tracks share (`./tracks.ts`).
 */
export function slotRowsFrom(
  doc: CompiledDocument,
  plant: TimelinePlant,
  sliders: readonly SliderApplication[],
  placeholders: Map<string, string | null> | undefined,
  baseOf: (slot: ModelSlot, live: boolean) => SlotBase,
): { rows: CoreSlotRow[]; conflicts: string[] } {
  const resolve = plant.shown ?? shownAttachment;
  const blend = plant.blend ?? readBlend;
  const round = plant.round ?? gridRound;
  const rows: CoreSlotRow[] = [];
  const conflicts: string[] = [];
  const active = activeBones(doc);
  const gate = plant.slotTimelines ?? slotTimelinesApply;
  for (const slot of doc.slots) {
    // A slot on a bone the skin leaves inactive is not animated — not by the sample's timelines, not by a slider (`./skins.ts`).
    const live = gate(doc, slot, active);
    const base = baseOf(slot, live);
    let placeholder = base.placeholder;
    const { light, dark } = base;
    // The sliders, after the animation, in constraint order (`./constraints_slider.ts`).
    // What the slot shows after the sample's own timelines: the attachments' deform and sequence timelines are matched against it (`./deform.ts`, *A switch*).
    placeholders?.set(slot.name, placeholder);
    const pose = { placeholder, light, dark };
    if (live) applySliderSlots(slot.name, pose, sliders);
    placeholder = pose.placeholder;
    const shown = placeholder === null ? null : resolve(doc, { ...slot, setup: placeholder });
    if (shown !== null && 'conflict' in shown) {
      conflicts.push(`slot "${slot.name}" shows placeholder "${placeholder}", filled by skins ${shown.conflict.map((c) => `"${c.skin}" (shows ${JSON.stringify(c.shown)})`).join(', ')}`);
      continue;
    }
    const row = shown === null ? null : shownRow(shown);
    rows.push([
      slot.name,
      row === null ? null : row.name,
      round(light[0]), round(light[1]), round(light[2]), round(light[3]),
      dark === null ? null : [round(dark[0]), round(dark[1]), round(dark[2])],
      row === null ? null : row.path,
      // The slot's data, not its pose: no timeline moves it (the index header's blend rule).
      blend(slot),
    ]);
  }
  return { rows, conflicts };
}

/**
 * One step of the stepped phase, as a walk hands it to the bones: the physics
 * context and the clock before the step (`./constraints_physics.ts`), and the
 * caller's adjustment of the locals (`LocalAdjust`). The adjustment rides here
 * rather than on the plant because it is not a rule the core measured and a
 * control plants back — it is the caller's input to one walk — and because
 * the step context exists exactly where a walk is stepped: the live track's
 * every pose but a `reset: 'setup'` pose 0, which no animation is applied to.
 */
export interface PoseStep {
  ctx: PhysicsStepContext;
  before: number;
  /** Callback and its authoritative evaluation identity travel together; no inferred clock fallback. */
  adjustment?: { callback: LocalAdjust; context: LocalAdjustContext };
}

/**
 * The bone rows at `t`, in the oracle's shape and rounding. With `constraints`
 * — the animation's constraint timelines — the document's constraints are
 * applied after the timelines, posed at `t` (`./constraints.ts`, construct
 * 5; each slider's application recorded into `sliders` for its slot
 * timelines), with the setup pose standing for the
 * previous pose a path's offset may read (`previousPassWhy` holds that);
 * without, the hierarchy and the timelines alone.
 */
export function posedBoneRows(doc: CompiledDocument, timelines: CoreAnimationTimelines, t: number, plant: TimelinePlant = {}, constraints?: CoreConstraintTimelines, sliders?: SliderApplication[]): CoreBoneRow[] {
  return posedBoneWorld(doc, timelines, t, plant, constraints, sliders).rows;
}

/** `posedBoneRows`, with the world transforms the rows were read off — what the sample's attachments are posed through. */
export function posedBoneWorld(doc: CompiledDocument, timelines: CoreAnimationTimelines, t: number, plant: TimelinePlant = {}, constraints?: CoreConstraintTimelines, sliders?: SliderApplication[], step?: PoseStep): { rows: CoreBoneRow[]; world: Map<string, CoreWorld> } {
  const posed = posedBoneStep(doc, timelines, t, plant, constraints, sliders, step);
  const stage = plant.stage;
  if (stage !== undefined) stage.begin('readout');
  const rows = stepRows(posed);
  if (stage !== undefined) stage.end('readout');
  return { rows, world: posed.world };
}

/**
 * `posedBoneWorld`'s world transforms without its rows (issue #1179, the
 * second part): the same pose by the same operations in the same order, since
 * `stepRows` only reads the world once it is posed. A walk reads `world` and
 * no row, so every walk asks for this — the scan's (`scanWalkIn` in
 * `./raw.ts`, A10's), the raw entry's batch walks and the live track's step.
 * The rows were the only thing the other variant adds, and their rounding
 * (`rawNumber`, `keptNumber`) refuses nothing, so leaving them out moves no
 * number and no refusal of a walk.
 */
export function posedBoneWorldAlone(doc: CompiledDocument, timelines: CoreAnimationTimelines, t: number, plant: TimelinePlant, constraints: CoreConstraintTimelines | undefined, sliders: SliderApplication[] | undefined, step: PoseStep | undefined): Map<string, CoreWorld> {
  return posedBoneStep(doc, timelines, t, plant, constraints, sliders, step).world;
}

/**
 * One pose of the bones before its rows are read: the world transforms, and
 * what the rows are rounded from. A stepped walk reads rows only off the step
 * that lands on a sample (issue #1134: of the stepped run's poses, nine in ten
 * are steps between samples), so `stepRows` rounds them when they are read,
 * once; every bone's transform is required here, at every step.
 */
interface PosedStep {
  bones: ModelBone[];
  world: Map<string, CoreWorld>;
  active: ReadonlySet<string>;
  round: (v: number) => number | null;
  rows?: CoreBoneRow[];
}

/** A step's bone rows, in the oracle's shape and rounding, rounded the first time they are read. */
function stepRows(posed: PosedStep): CoreBoneRow[] {
  if (posed.rows !== undefined) return posed.rows;
  const { world, active, round } = posed;
  posed.rows = posed.bones.map((b): CoreBoneRow => {
    const w = world.get(b.name) as CoreWorld;
    return [b.name, round(w.worldX), round(w.worldY), round(w.a), round(w.b), round(w.c), round(w.d), active.has(b.name) ? 1 : 0, b.parent ?? null];
  });
  return posed.rows;
}

/** `posedBoneWorld` up to its rows, refusing a bone the evaluator gave no transform (`PosedStep`). */
function posedBoneStep(doc: CompiledDocument, timelines: CoreAnimationTimelines, t: number, plant: TimelinePlant, constraints: CoreConstraintTimelines | undefined, sliders: SliderApplication[] | undefined, step: PoseStep | undefined): PosedStep {
  const stage = plant.stage;
  if (stage !== undefined) stage.begin('timeline');
  const bones = posedBones(doc, timelines, t, plant);
  if (stage !== undefined) stage.end('timeline');
  // One step of the stepped phase (issue #956, `./constraints_physics.ts`): the physics records posed by their timelines and stepped under the walk's context; the deformed curve a path walks as above.
  if (constraints !== undefined && step !== undefined) {
    return steppedLocals(doc, bones, plant, () => pathDeformed(doc, posedRecords(constraintRecords(doc), constraints, t), timelines, t, plant), constraints.physicsKeyed ?? [], t, sliders, step);
  }
  const active = activeBones(doc);
  // The caller's adjustment, after the timelines and before anything reads the locals (`LocalAdjust`).
  if (step?.adjustment !== undefined) {
    if (stage !== undefined) stage.begin('timeline');
    adjustLocals(doc, bones, step.adjustment.callback, step.adjustment.context);
    if (stage !== undefined) stage.end('timeline');
  }
  if (stage !== undefined) stage.begin('world');
  const initialWorld = (plant.evaluate ?? worldTransforms)(bones, active);
  if (stage !== undefined) stage.end('world');
  let world = initialWorld;
  if (constraints !== undefined) {
    if (stage !== undefined) stage.begin('constraints');
    const setupRecords = constraintRecords(doc);
    // A path walks the curve the sample's deform timelines left on its slot (`./deform.ts`); a slider's deform of a walked path leaves the bones out (`pathAnimationsWhy`).
    const records = pathDeformed(doc, posedRecords(setupRecords, constraints, t), timelines, t, plant);
    // A path constraint may read a slot bone the runtime has not yet brought up to date in this pass, as the previous pass left it (`./constraints_path.ts`, *Which slot bone*); `poseAnimations` holds that pass to the setup pose's reading.
    const previous = setupRecords.some((r) => r.kind === 'path') ? applyConstraints(doc.bones, (plant.evaluate ?? worldTransforms)(doc.bones, active), active, plant.constraints ? plant.constraints(setupRecords) : setupRecords, null, undefined, undefined, undefined, solverRules(plant.solver)) : null;
    world = applyConstraints(bones, initialWorld, active, plant.constraints ? plant.constraints(records) : records, previous, sliders, undefined, undefined, solverRules(plant.solver));
    if (stage !== undefined) stage.end('constraints');
  }
  for (const b of bones) if (world.get(b.name) === undefined) throw new CoreInputError(`the evaluator returned no transform for bone "${b.name}"`);
  return { bones, world, active, round: plant.round ?? gridRound };
}

/**
 * One step of the stepped phase from locals already posed (issue #1336): the
 * caller's adjustment (`LocalAdjust`), the world transforms, the physics
 * records posed by `records` and stepped under the walk's context, then every
 * constraint. No previous pass: under the step it is the previous step's, and
 * `poseAnimations` leaves such bones out. A single animation's walk reaches it
 * through `posedBoneStep` with the locals `posedBones` posed; the live tracks
 * (`./tracks.ts`) with the locals their mixed entries posed — one pose path
 * past the timelines for both.
 */
function steppedLocals(doc: CompiledDocument, bones: ModelBone[], plant: TimelinePlant, records: () => CoreConstraintRecord[], physicsKeyed: NonNullable<CoreConstraintTimelines['physicsKeyed']>, t: number, sliders: SliderApplication[] | undefined, step: PoseStep): PosedStep {
  const stage = plant.stage;
  const active = activeBones(doc);
  // The caller's adjustment, after the timelines and before anything reads the locals (`LocalAdjust`).
  if (step.adjustment !== undefined) {
    if (stage !== undefined) stage.begin('timeline');
    adjustLocals(doc, bones, step.adjustment.callback, step.adjustment.context);
    if (stage !== undefined) stage.end('timeline');
  }
  if (stage !== undefined) stage.begin('world');
  const initialWorld = (plant.evaluate ?? worldTransforms)(bones, active);
  if (stage !== undefined) {
    stage.end('world');
    stage.begin('constraints');
  }
  const stepped = stepPhysicsRecords(records(), physicsKeyed, t, active, step.ctx, step.before);
  const world = applyConstraints(bones, initialWorld, active, plant.constraints ? plant.constraints(stepped) : stepped, null, sliders, step.ctx, undefined, solverRules(plant.solver));
  if (stage !== undefined) stage.end('constraints');
  for (const b of bones) if (world.get(b.name) === undefined) throw new CoreInputError(`the evaluator returned no transform for bone "${b.name}"`);
  return { bones, world, active, round: plant.round ?? gridRound };
}

/**
 * `steppedLocals`' world transforms, without the oracle's rows (as
 * `posedBoneWorldAlone` poses them): the live tracks' entry to the stepped
 * phase (`./tracks.ts`). The document's constraint records as they stand —
 * the live tracks mix no constraint timeline — and no physics timeline keyed.
 */
export function steppedLocalsWorld(doc: CompiledDocument, bones: ModelBone[], plant: TimelinePlant, sliders: SliderApplication[], step: PoseStep): Map<string, CoreWorld> {
  return steppedLocals(doc, bones, plant, () => constraintRecords(doc), [], 0, sliders, step).world;
}

/** Each path record with the curve its slot shows deformed by the sample's own deform timelines at `t` (`./deform.ts`), or as it was. */
function pathDeformed(doc: CompiledDocument, records: CoreConstraintRecord[], timelines: CoreAnimationTimelines, t: number, plant: TimelinePlant): CoreConstraintRecord[] {
  if (timelines.attachments.every((a) => a.deform === null)) return records;
  return records.map((r) => {
    if (r.kind !== 'path' || r.path === null) return r;
    const slot = doc.slots.find((x) => x.name === r.slot);
    const shown = slot === undefined ? null : (plant.shown ?? shownAttachment)(doc, slot);
    if (shown === null || 'conflict' in shown) return r;
    const identity = timelineIdentity(r.slot, shown);
    const keyed = timelines.attachments.find((a) => a.deform !== null && `${a.skin}/${a.slot}/${a.attachment}` === identity);
    if (keyed === undefined || keyed.deform === null) return r;
    const d = (plant.deform ?? deformAt)(r.path.vertices, keyed.deform, t);
    return d === null ? r : { ...r, path: { ...r.path, vertices: deformedVertices(r.path.vertices, d), exact: true } };
  });
}

// ---------------------------------------------------------------------------
// the samples
// ---------------------------------------------------------------------------

/** The oracle's phases, as `tools/pose_oracle.ts` names them. */
export type SamplePhase = 'grid' | 'off' | 'irr' | 'dense';

/** `1 − 1/φ`, the tool's irrational offset, to the nine places it writes. */
export const IRR_OFFSET = 0.381966011;

/**
 * Sample `i` of `n` over duration `d` under `phase` — the tool's formula
 * (`tools/pose_oracle.ts`, *Sample times*), held here so the two dumpers
 * sample at one set of times: `grid` `d·i/(n−1)` (`0` when `n` is 1), `off`
 * `d·(i+0.5)/n`, `irr` and `dense` `d·(i+IRR_OFFSET)/n`.
 */
export function sampleTime(phase: SamplePhase, d: number, i: number, n: number): number {
  if (phase === 'off') return (d * (i + 0.5)) / n;
  if (phase === 'irr' || phase === 'dense') return (d * (i + IRR_OFFSET)) / n;
  return n === 1 ? 0 : (d * i) / (n - 1);
}

/** One posed sample: the time and the blocks this construct produces (`null` where it leaves one out). */
export interface CoreSample {
  t: number | null;
  events: CoreEventRow[] | null;
  bones: CoreBoneRow[] | null;
  slots: CoreSlotRow[] | null;
  drawOrder: string[] | null;
  attachments: CoreAttachmentRow[] | null;
  clips: CoreClipRow[] | null;
  /** The triangles drawn under a clip (issue #964, `./clipping.ts`). */
  clipped: CoreClippedRow[] | null;
}

export interface CoreAnimationPose {
  name: string;
  duration: number | null;
  samples: CoreSample[];
}


/** Why the animation slots are left out because a slider poses them and the bones are absent, or null. */
function slidersWhy(doc: CompiledDocument): string | null {
  const keyed = doc.constraints.flatMap((c) => {
    if (c.kind !== 'slider') return [];
    const slots = doc.animations.find((a) => a.name === c.animation)?.slots ?? [];
    return slots.length === 0 ? [] : [`slider "${c.name}" applies animation "${c.animation}", which keys slot(s) ${slots.map((x) => `"${x}"`).join(', ')}`];
  });
  return keyed.length === 0 ? null : `${keyed.join('; ')} — the oracle applies sliders after every animation, and a slider poses the slots its animation keys at a time read off the bones, which are absent`;
}

/**
 * Why the samples' bones are left out although each was posed, or null: a
 * path constraint whose offset reads its slot bone from the previous pass
 * (`previousPassSlotBones`) is posed with the setup pose's reading of it,
 * which is the runtime's exactly when that bone's world keeps the sign of
 * its determinant — its reflection — at the setup pose and at every sample;
 * the oracle's previous pass is the sample before, in its own order of
 * animations, which the model does not hold.
 */
function previousPassWhy(doc: CompiledDocument, animations: readonly CoreAnimationPose[], plant: TimelinePlant): string | null {
  const active = activeBones(doc);
  const reads = previousPassSlotBones(doc, active);
  if (reads.length === 0) return null;
  const records = constraintRecords(doc);
  const setup = applyConstraints(doc.bones, (plant.evaluate ?? worldTransforms)(doc.bones, active), active, plant.constraints ? plant.constraints(records) : records, null, undefined, undefined, undefined, solverRules(plant.solver));
  const bad: string[] = [];
  for (const { constraint, bone } of reads) {
    const w = setup.get(bone);
    const sign = w === undefined ? 0 : Math.sign(w.a * w.d - w.b * w.c);
    const flips = animations.flatMap((a) => a.samples.filter((x) => {
      const row = x.bones?.find((r) => r[0] === bone);
      if (row === undefined || row[3] === null || row[4] === null || row[5] === null || row[6] === null) return true;
      const det = row[3] * row[6] - row[4] * row[5];
      return Math.abs(det) < 1e-6 || Math.sign(det) !== sign;
    }).map((x) => `${a.name}@${x.t}`));
    if (sign === 0 || flips.length > 0) bad.push(`path constraint "${constraint}" reads slot bone "${bone}" from the previous pose, and its reflection is not the setup's at ${flips.slice(0, 3).join(', ')}${flips.length > 3 ? ` and ${flips.length - 3} more` : ''}`);
  }
  return bad.length === 0 ? null : `${bad.join('; ')} — the runtime's previous pose is the sample before in the Spine file's order of animations, which the model does not hold`;
}

/**
 * Every animation of the document sampled as the oracle samples it: `n`
 * samples in `phase` over each animation's runtime duration, each the bone
 * rows and the slot rows at `t`, in the model's order of animations. Returns
 * the blocks left out with their reasons, `animations.bones` and
 * `animations.slots` in document order.
 */
export function poseAnimations(doc: CompiledDocument, phase: SamplePhase, n: number, plant: TimelinePlant = {}, dt?: number): { animations: CoreAnimationPose[]; absent: Array<[string, string]> } {
  let bonesReason = constraintsAbsentWhy(doc, solverRules(plant.solver)) ?? pathAnimationsWhy(doc) ?? (dt === undefined ? null : steppedPreviousPassWhy(doc));
  const slotConflicts: string[] = [];
  const attachmentWhy: string[] = [];
  const clippedWhy: string[] = [];
  const resolve = plant.shown ?? shownAttachment;
  const round = plant.round ?? gridRound;
  const animations = doc.animations.map((anim: CoreAnimation): CoreAnimationPose => {
    const d = anim.timelines.duration;
    const samples: CoreSample[] = [];
    let last = -1;
    // Under `--physics step` (issue #956): one walk per animation — reset at 0, then the oracle's schedule, each sample posed off its last step (`./constraints_physics.ts`).
    const walk = dt === undefined || bonesReason !== null ? null : { ctx: freshStepContext(plant.physicsStep), now: 0, schedule: stepSchedule(phase, d, n, dt), sliders: [] as SliderApplication[], posed: null as PosedStep | null };
    if (walk !== null) {
      walk.posed = posedBoneStep(doc, anim.timelines, 0, plant, anim.constraints, walk.sliders, { ctx: walk.ctx, before: 0 });
      walk.ctx.phase = 'update';
    }
    for (let i = 0; i < n; i++) {
      const t = sampleTime(phase, d, i, n);
      let sliders: SliderApplication[] = [];
      let posed: { rows: CoreBoneRow[]; world: Map<string, CoreWorld> } | null = null;
      if (walk !== null) {
        for (const s of walk.schedule[i]) {
          const before = walk.ctx.time;
          walk.ctx.time += s - walk.now;
          walk.sliders = [];
          walk.posed = posedBoneStep(doc, anim.timelines, s, plant, anim.constraints, walk.sliders, { ctx: walk.ctx, before });
          walk.now = s;
        }
        sliders = walk.sliders;
        posed = walk.posed === null ? null : { rows: stepRows(walk.posed), world: walk.posed.world };
      } else posed = bonesReason === null ? posedBoneWorld(doc, anim.timelines, t, plant, anim.constraints, sliders) : null;
      const placeholders = new Map<string, string | null>();
      const slots = posedSlots(doc, anim.timelines, t, plant, sliders, placeholders);
      for (const c of slots.conflicts) if (!slotConflicts.includes(`${c} at animation "${anim.name}"`)) slotConflicts.push(`${c} at animation "${anim.name}"`);
      // The draw order: the sample's key, or the setup order before it, then each slider's key (`./draw_order.ts`).
      const evalOrder = plant.drawOrder ?? drawOrderAt;
      let order = evalOrder(doc.slots.length, anim.timelines.drawOrder, t) ?? doc.slots.map((_s, k) => k);
      for (const app of sliders) order = evalOrder(doc.slots.length, app.timelines.drawOrder, app.at) ?? order;
      const drawOrder = order.map((k) => doc.slots[k].name);
      // The attachments and clips, in the draw order, with the deform and sequence timelines' state (`./deform.ts`).
      let attachments: CoreAttachmentRow[] | null = null;
      let clips: CoreClipRow[] | null = null;
      let clipped: CoreClippedRow[] | null = null;
      if (posed !== null) {
        const states = attachmentStates(doc, resolve, placeholders, { timelines: anim.timelines, t }, sliders, plant);
        for (const w of states.why) if (!attachmentWhy.includes(w)) attachmentWhy.push(w);
        const rank = new Map(order.map((k, r) => [doc.slots[k].name, r]));
        const shown = [...states.shown].sort((a, b) => (rank.get(a.slot) ?? 0) - (rank.get(b.slot) ?? 0));
        const geometry = poseGeometry(shown, posed.world, sourceOfDoc(doc), round, { region: plant.region, vertices: plant.vertices }, drawWalkOf(doc, drawOrder, plant));
        if (geometry.attachmentsWhy !== null && !attachmentWhy.includes(geometry.attachmentsWhy)) attachmentWhy.push(geometry.attachmentsWhy);
        attachments = geometry.attachments;
        clips = geometry.clips;
        clipped = geometry.clipped;
        if (geometry.clippedWhy !== null && geometry.attachmentsWhy === null && !clippedWhy.includes(geometry.clippedWhy)) clippedWhy.push(geometry.clippedWhy);
      }
      const events = (plant.events ?? eventsFired)(anim.timelines.events, last, t, round);
      last = t;
      samples.push({ t: round(t), events, bones: posed === null ? null : posed.rows, slots: slots.rows, drawOrder, attachments, clips, clipped });
    }
    return { name: anim.name, duration: round(d), samples };
  });
  if (bonesReason === null && dt === undefined) bonesReason = previousPassWhy(doc, animations, plant);
  if (bonesReason !== null) for (const a of animations) for (const s of a.samples) s.bones = null;
  const slotsReason = (bonesReason === null ? null : slidersWhy(doc)) ?? (slotConflicts.length === 0
    ? null
    : `${slotConflicts.slice(0, 5).join('; ')}${slotConflicts.length > 5 ? `; and ${slotConflicts.length - 5} more` : ''} — under --skin all the LAST of them in the Spine file's skin order wins, and that order is the emitter's, not the model's`);
  if (slotsReason !== null) for (const a of animations) for (const s of a.samples) s.slots = null;
  const orderReason = bonesReason === null ? null : slidersKeyingWhy(doc, 'drawOrder');
  if (orderReason !== null) for (const a of animations) for (const s of a.samples) s.drawOrder = null;
  // Every vertex goes through a bone's world matrix and follows what the slot shows, so the attachments and clips need both blocks.
  const upstream = [bonesReason === null ? null : `animations.bones is absent (${bonesReason}), and every vertex goes through a bone's world matrix`, slotsReason === null ? null : 'animations.slots is absent, so what a slot shows is not posed'].filter((x): x is string => x !== null);
  const clipsReason = upstream.length > 0 ? upstream.join('; ') : attachmentWhy.some((w) => !w.includes('(atlas: null)')) ? attachmentWhy.filter((w) => !w.includes('(atlas: null)')).join('; ') : null;
  const attachmentsReason = clipsReason ?? (attachmentWhy.length === 0 ? null : attachmentWhy.join('; '));
  if (attachmentsReason !== null) for (const a of animations) for (const s of a.samples) s.attachments = null;
  if (clipsReason !== null) for (const a of animations) for (const s of a.samples) s.clips = null;
  // The clipped triangles follow the attachments and the clips, and are left out where a clip starts over a polygon the core does not clip against (`./clipping.ts`).
  const clippedReason = attachmentsReason ?? orderReason ?? (clippedWhy.length === 0 ? null : clippedWhy.join('; '));
  if (clippedReason !== null) for (const a of animations) for (const s of a.samples) s.clipped = null;
  const absent: Array<[string, string]> = [];
  if (bonesReason !== null) absent.push(['animations.bones', bonesReason]);
  if (slotsReason !== null) absent.push(['animations.slots', slotsReason]);
  if (orderReason !== null) absent.push(['animations.drawOrder', orderReason]);
  if (attachmentsReason !== null) absent.push(['animations.attachments', attachmentsReason]);
  if (clipsReason !== null) absent.push(['animations.clips', clipsReason]);
  if (clippedReason !== null) absent.push(['animations.clipped', clippedReason]);
  return { animations, absent };
}
