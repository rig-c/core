/**
 * The core's live tracks (issue #1336, piece (a)): several animations over
 * one document, each on a track of its own, queued, replaced and mixed out the
 * way spine-core 4.3.13's `AnimationState` does it, stepped one `dt` at a
 * time — a player composing a character in real time: a looping base on
 * track 0, a pose held at its end on track 1 and replaced over a mix, a
 * one-shot on track 2 played once and mixed back out, and the player's own
 * bone-local adjustment (`LocalAdjust`, issue #1336's piece (b)) after every
 * track. Every pose is the raw entry's (`RawPose` in `./raw.ts`).
 *
 * It sits beside `openTrack` (`./track.ts`) rather than inside it because it
 * is a different object: one track holds one animation and its walk, and the
 * mixing below is a second state machine as long as that module's whole body.
 * What the two share is the pose path past the timelines — the adjustment,
 * the world, every constraint and the physics step (`steppedLocalsWorld` in
 * `./animation.ts`), the slot rows and the sliders (`slotRowsFrom`), the draw
 * order, the attachments and the pose's assembly (`openRawTracksPath` in
 * `./raw.ts`) — one body that the single track reaches with the locals one
 * animation posed and this state with the locals its mixed entries posed.
 *
 * ## What a step is
 *
 * `step(dt)` is a player's frame on spine-core: `AnimationState.update(dt)`,
 * `apply`, `Skeleton.update(dt)`, `updateWorldTransform(Physics.update)`. The
 * update moves every entry's track time, starts a queued entry whose delay
 * has passed, moves every mix and ends the entries a finished mix leaves; the
 * apply poses every track in order 0..N over the setup pose — every pose is
 * posed from the setup pose, as the single track's is, so nothing but the
 * entries' state survives a step — and then the adjustment, the constraints
 * and the physics. `start()` is pose 0, the reset, where `reset` says
 * (`RawReset`): at the setup pose with nothing applied, or with the tracks set
 * so far applied at 0 (an `apply` with no `update`) and reset there.
 *
 * ## The mixing — spine-core's, ported and measured
 *
 * The state below is `AnimationState`'s, field for field and in its order of
 * operations, over the core's own timelines — so that every number is the one
 * the runtime computes, which is the only thing a control at tolerance 0 can
 * hold. In brief:
 *
 * - **Track 0 at full weight poses from the setup pose** (`MixFrom.setup`,
 *   alpha 1): exactly the single track's pose. `CO51`'s positive control holds
 *   a state with only track 0 set to `openTrack` on the same animation, every
 *   field, bit for bit.
 * - **Every other application reads its `timelineMode`**: a property no
 *   earlier entry of the same track and no lower track keys mixes from the
 *   setup pose (`SETUP`); one a lower track keys mixes from the value it left
 *   (`CURRENT`: a bone channel `current + (value + setup − current)·alpha`,
 *   and nothing at all before the timeline's first key); one an older entry of
 *   the same track keys mixes from the current value, and before its first key
 *   towards the setup value (`FIRST`). A property the entry mixing in keys too
 *   is HELD on the entry mixing out — applied at the hold alpha
 *   `alphaMix / (1 − mix)` rather than faded, so the two do not dip through
 *   the setup pose — and a hold whose next entry stops keying it fades by that
 *   entry's own mix (`timelineHoldMix`).
 * - **The mix**: `mixTime / mixDuration` clamped to 1 (a mix of 0 is 1), the
 *   mixing-out entry applied at `alphaMix = a·(1 − mix)`; the entry mixing in
 *   at the mix. A rotation mixed at an alpha below 1 turns the way it first
 *   turned (`applyRotateTimeline`'s remembered direction); a scale mixed out
 *   keeps the sign of the value it mixes from.
 * - **Attachments**: an entry mixing out never keeps an attachment it keys —
 *   it shows it for its own deform timelines and the slot goes back to its
 *   setup attachment at the end of the apply unless an entry applied at full
 *   strength keyed it (`ATTACH_SETUP` / `ATTACH_RETAIN`).
 * - **The queue**: `addAnimation` with a delay at or below 0 starts the entry
 *   when the entry before it completes less its mix — at its duration, or for
 *   a looping one at the end of its current cycle (`getTrackComplete`) — plus
 *   the delay; `addEmptyAnimation(track, mix, 0)` after a one-shot so mixes it
 *   out over its last `mix` seconds. A `delay` above 0 is that many seconds
 *   after the entry before starts.
 * - **Events** fire from each track's current entry as the single live track
 *   fires them (`CO47`'s rule, across the wrap included). ⚠️ **An entry mixing
 *   out fires none** — not "until the mix passes half way": `eventThreshold`
 *   defaults to 0 and an entry's events are applied only while `mix <
 *   eventThreshold`, which no mix is. `complete` is not carried (issue #1276).
 * - **Physics** steps on top of the mixed locals, as on one track — and on
 *   the same clock: `TracksOptions.clock`, what each step moves the physics
 *   clock by, has the single track's meaning (`./track.ts`, *The physics
 *   clock*, issue #1396). The entries' track times, the mixes, the queue and
 *   the events stay on the steps; `start()` under `reset: 'animation'` moves
 *   the clock by `clock(0)`.
 *
 * `CO51` holds all of it to spine-core 4.3.13 at tolerance 0 — every bone's
 * world transform, every drawn attachment's world vertices, every slot's
 * colour and attachment, the draw order and the events — over scripted calls
 * and seeded steps on the tree's rows, and reads each rejected reading red
 * (`TracksPlant`). The oracle's bones are brought back to the setup pose
 * (`Skeleton.setupPoseBones`) before every `apply`, as `CO50`'s are, and
 * measured that reset is needed for one thing only: with no adjustment,
 * spine-core with no reset at all agrees on every walk — `AnimationState`
 * writes back every property it keyed, through mixes, holds, empties and the
 * queue — while the player's write on a channel no entry keys carries and
 * compounds without it. The state carries nothing from one step to the next
 * but its entries, so a write lasts one pose, as on the single track.
 *
 * ## Alpha and additive entries (issue #1344)
 *
 * An entry carries spine-core's `TrackEntry.alpha` (`MixOptions.alpha`, 1 when
 * absent, changed while it plays by `setAlpha`) and `TrackEntry.additive`
 * (`MixOptions.additive`). 4.3.13 has no `MixBlend` on an entry — `additive` is
 * a boolean fixed before the next apply — so the option carries that name and
 * that type. What the runtime does with them, ported and measured (`CO52`):
 *
 * - **Alpha is a weight, multiplied in**: the current entry applies at
 *   `alpha · mix`; one mixing out at `from.alpha · fromMix · (1 − mix)`, its
 *   held timelines at that over `1 − mix · to.alpha`. Track 0 below alpha 1
 *   leaves the setup-pose shortcut and mixes as a higher track does.
 * - **Events ignore alpha**: the current entry fires its events at any alpha,
 *   0 included; an entry mixing out fires none (`eventThreshold` 0, above).
 * - **Attachments ignore alpha**: `alphaAttachmentThreshold` is 0, so the
 *   current entry keeps its attachments at any alpha, 0 included;
 *   `mixAttachmentThreshold` is 0, so an entry mixing out keeps none. The draw
 *   order stays refused, so `mixDrawOrderThreshold` has nothing to act on.
 * - **Additive adds what the runtime marks additive** (`Timeline.additive`):
 *   every bone timeline keying numbers and the deform. On a property a lower
 *   track or an older entry keyed, the keyed value (a rotation's, a
 *   translation's, a shear's) is added times alpha — `current + value · alpha`
 *   — a scale's offset from the setup scale is added, and a deform's offset
 *   from the setup vertices (weighted: the offsets themselves). From the setup
 *   pose it is the same as replacing. A rotation is added as it stands, with
 *   no shortest-angle wrap and no remembered direction (`shortestRotation` is
 *   `additive || …`). Colour, attachment, inherit and event timelines do not
 *   read `add`: under an additive entry they apply as under a replacing one.
 *   Track 0 at alpha 1 with no mix adds nothing — the runtime passes `add`
 *   false on that shortcut.
 * - **An additive entry is never held**, and does not hold what it mixes in
 *   over: its additive timelines take their mode with no `HOLD` bit, and a
 *   timeline of an entry it replaces is not held for it. Mixing out, an
 *   additive entry adds at its faded alpha, so its offset fades to nothing.
 *
 * `CO52`'s oracle resets bones and slots (`setupPose()`) before every apply,
 * not the bones alone as `CO51`'s does: on its blend probe a two-colour key at
 * a partial alpha over track 0's `rgba` mixes the dark colour from what the
 * previous frame left, which carries in a runtime whose slots are not reset —
 * measured off with the bones-only reset, equal with the full one. The state
 * poses every frame from the setup pose, slots included, as it always has.
 *
 * Each rejected reading is planted (`TracksPlant`) and read red by `CO52`:
 * alpha inverted, alpha ignored, additive as replace, an additive rotation
 * through the remembered direction, an additive entry's attachments as a
 * plain timeline, the hold blind to the entry mixing in, the holds as if no
 * entry were additive, and an alpha threshold of one half on attachments.
 *
 * ## What is left out, by name
 *
 * An animation is refused when it is set or queued if it keys what the state
 * does not mix: a constraint timeline (ik, transform, path, physics, slider),
 * a sequence timeline, the draw order, or a deform of a path attachment (a
 * path's deformed curve reaches the constraints, which this state poses from
 * their records as they stand). `timeScale`, `holdPrevious`, `reverse`,
 * `shortestRotation` on a replacing entry, the thresholds as options, per-pair
 * mix tables and the listeners are not offered. An additive entry is refused
 * nothing more: every timeline the state accepts is defined under it (*Alpha
 * and additive entries* below).
 *
 * ⛔ **A state refused part-way stays refused**, as a live track does: a step
 * is checked before anything moves, and a refusal past that — a construct the
 * core leaves out, a non-finite vertex or write, an error the caller's own
 * `adjust` throws — comes after the entries and the physics have moved, so
 * every later call refuses naming the call it was refused at.
 */
import type { ModelBone, ModelSlot, ModelVertices } from '../model.ts';
import { activeBones, CoreInputError, rawNumber, readColour, shownAttachment, type CompiledDocument, type CoreShown } from './index.ts';
import { channelAt, keyIndexAt, SLOT_COLOUR_TIMELINES, slotRowsFrom, steppedLocalsWorld, type BoneTimelineKind, type CoreKey, type LocalAdjust, type SlotBase, type SlotColourKind, type TimelinePlant } from './animation.ts';
import { deformAt, setupArray, type CoreAttachmentTimeline } from './deform.ts';
import { eventsFired, type CoreEventKey, type CoreEventRow } from './events.ts';
import { checkedClock, environmentOf, openRawTracksPath, rotateOn, setEnvironmentOn, translateOn, type RawPose, type RawReset, type RawTracksPath } from './raw.ts';
import type { PhysicsEnvironment } from './constraints_physics.ts';
import { slotTimelinesApply } from './skins.ts';

/** How the live tracks are opened: where the physics is reset (`RawReset`, the caller's, no default), the caller's adjustment of every pose's bone locals, and what each step moves the physics clock by (the header's *The physics clock*). */
export interface TracksOptions {
  reset: RawReset;
  adjust?: LocalAdjust;
  /** What each step of `dt` moves the skeleton's physics clock by — `physicsClockStep` is the render's; absent, the step itself. Every entry's track time, the mixes, the queue and the events stay on the steps. */
  clock?: (dt: number) => number;
}

/**
 * How `setAnimation` starts an entry: whether it loops, over how many seconds
 * the entry it replaces mixes out (0 cuts), and — issue #1344 — how strongly
 * it applies and whether it adds (the header's *Alpha and additive entries*).
 */
export interface MixOptions {
  loop: boolean;
  mixDuration: number;
  /** `TrackEntry.alpha`: from 0 to 1, multiplied into every timeline's weight; 1 when absent. Changed while the entry plays with `LiveTracks.setAlpha`. */
  alpha?: number;
  /** `TrackEntry.additive`: the entry's bone and deform timelines add their keyed values to what the tracks below posed rather than replacing it; `false` when absent. Fixed when the entry is set or queued, as the runtime fixes it before the next apply. */
  additive?: boolean;
}

/** How `addAnimation` queues an entry: `MixOptions`, and its delay — at or below 0 relative to when the entry before it completes, above 0 seconds after the entry before starts. */
export interface QueueOptions extends MixOptions {
  delay: number;
}

/** A track's current entry as a player reads it: what it plays (`null` the empty animation), its times and the animation's duration — what a player detects a completion from. */
export interface TrackEntryView {
  animation: string | null;
  loop: boolean;
  trackTime: number;
  /** The animation time the entry applies at now (`getAnimationTime`): the track time wrapped or held at the duration. */
  animationTime: number;
  duration: number;
  /** The entry's alpha as it stands (`MixOptions.alpha`, `LiveTracks.setAlpha`). */
  alpha: number;
  /** Whether the entry adds (`MixOptions.additive`). */
  additive: boolean;
}

/** The live tracks (`openTracks`). */
export interface LiveTracks {
  /** Replaces what `track` plays; the entry it replaces mixes out over `mixDuration` seconds (0 cuts). Every queued entry on the track is dropped. */
  setAnimation(track: number, animation: string, options: MixOptions): void;
  /** Mixes `track` out to nothing over `mixDuration` seconds. */
  setEmptyAnimation(track: number, mixDuration: number): void;
  /** Queues `animation` after the last entry on `track` (`QueueOptions`); on an empty track, it is set. */
  addAnimation(track: number, animation: string, options: QueueOptions): void;
  /** Queues a mix out to nothing after the last entry on `track`; `delay` 0 ends the mix when that entry completes. */
  addEmptyAnimation(track: number, mixDuration: number, delay: number): void;
  /** Sets the alpha of `track`'s current entry (`TrackEntry.alpha`), from the next pose on; an entry it mixes from keeps its own. A track playing nothing is refused. */
  setAlpha(track: number, alpha: number): void;
  /** Pose 0, the reset (the header's *What a step is*): once, before the first `step`. */
  start(): RawPose;
  /** The next pose: every entry moved by `dt`, a finite time at or above 0. */
  step(dt: number): RawPose;
  /** `track`'s current entry, or `null` where it plays nothing. */
  current(track: number): TrackEntryView | null;
  /** The running sum of the steps taken, 0 before the first. */
  readonly trackTime: number;
  /** Sets the world every physics constraint answers from the next pose on, as `LiveTrack.setEnvironment` (`./track.ts`, *The environment*). */
  setEnvironment(environment: Partial<PhysicsEnvironment>): void;
  /** The environment the next pose answers. */
  readonly environment: PhysicsEnvironment;
  /** spine-core's `Skeleton.physicsTranslate`, as `LiveTrack.physicsTranslate`. */
  physicsTranslate(x: number, y: number): void;
  /** spine-core's `Skeleton.physicsRotate`, as `LiveTrack.physicsRotate`. */
  physicsRotate(x: number, y: number, degrees: number): void;
}

/**
 * The rejected readings `CO51` plants back, each on its own: the mix reversed
 * (`1 − mix`), every track above 0 mixed from the setup pose rather than the
 * value the tracks below left, the hold ignored (an entry mixing out faded on
 * a property the entry mixing in keys too), a queued entry's delay at or
 * below 0 read as "now" rather than as the entry before's completion, and an
 * entry mixing out firing its events until the mix passes one half. Nothing
 * but a control passes one.
 */
export interface TracksPlant extends TimelinePlant {
  mixReversed?: boolean;
  higherTracksFromSetup?: boolean;
  holdFaded?: boolean;
  queueDelayNow?: boolean;
  /** An entry mixing out fires its events while the mix is below one half — the reading the issue's brief stated, which the runtime's `eventThreshold` of 0 contradicts. */
  eventsUntilHalfMix?: boolean;
  /** `CO52`'s, issue #1344: every entry's alpha read as `1 − alpha`. */
  alphaInverted?: boolean;
  /** Every entry's alpha read as 1 — the option ignored. */
  alphaIgnored?: boolean;
  /** An additive entry applied, and its modes computed, as a replacing one. */
  additiveAsReplace?: boolean;
  /** An additive entry's rotations mixed through the remembered direction (`applyRotateTimeline`) as a replacing entry's are, rather than added through the timeline itself. */
  additiveRotateRemembered?: boolean;
  /** An additive entry's attachment timelines applied as a plain timeline (`AttachmentTimeline.apply`, no attachment state) rather than under the threshold rule (`applyAttachmentTimeline`). */
  additiveAttachmentsDirect?: boolean;
  /** The hold alpha computed as if the entry mixing in were at alpha 1 (`keep = 1 − mix`, not `1 − mix·to.alpha`). */
  holdIgnoresEntryAlpha?: boolean;
  /** The holds computed as if no entry were additive: an additive entry's own timelines held, and a timeline held under an additive entry mixing in. */
  additiveHeld?: boolean;
  /** An entry applied below alpha one half keeps none of its attachments — a threshold the runtime's `alphaAttachmentThreshold` of 0 does not have. */
  attachmentsBelowHalfAlpha?: boolean;
}

// ---------------------------------------------------------------------------
// the timelines, as the state applies them
// ---------------------------------------------------------------------------

/** `timelineMode`'s bits, as `AnimationState` spells them: where a timeline mixes from, and whether it is held. */
const CURRENT = 0;
const SETUP = 1;
const FIRST = 2;
const MODE = 3;
const HOLD = 4;

/** One timeline of an animation in the order spine-core's `Animation.timelines` holds them: the slots' (attachment and colour), the bones', the deforms, then the events. */
type MixTimeline =
  | { type: 'bone'; bone: number; kind: BoneTimelineKind; keys: CoreKey[]; ids: string[]; instant: boolean }
  | { type: 'colour'; slot: number; kind: SlotColourKind; keys: CoreKey[]; ids: string[]; instant: false }
  | { type: 'attachment'; slot: number; keys: CoreKey[]; ids: string[]; instant: true }
  | { type: 'deform'; identity: string; timeline: CoreAttachmentTimeline; ids: string[]; instant: false }
  | { type: 'events'; keys: CoreEventKey[]; ids: string[]; instant: true };

/** An animation as the state applies it: its runtime duration, its timelines and every property they key (`Animation.hasTimeline`). */
interface MixAnimation {
  name: string | null;
  duration: number;
  timelines: MixTimeline[];
  ids: ReadonlySet<string>;
}

/** The empty animation (`AnimationState.emptyAnimation`): no timeline, duration 0 — one object, so setting it on an entry never applied replaces that entry. */
const EMPTY: MixAnimation = { name: null, duration: 0, timelines: [], ids: new Set() };

/** `Timeline.additive`: the timelines the runtime adds under an additive entry — every bone timeline that keys numbers, and the deform. Colour, attachment, inherit and event timelines do not read `add`. */
function addable(tl: MixTimeline): boolean {
  return tl.type === 'deform' || (tl.type === 'bone' && tl.kind !== 'inherit');
}

/** The properties a bone timeline keys, spine-core's `propertyIds` by bone name. */
const BONE_PROPERTIES: Record<BoneTimelineKind, readonly string[]> = {
  rotate: ['rotate'], translate: ['x', 'y'], translatex: ['x'], translatey: ['y'], scale: ['scaleX', 'scaleY'], scalex: ['scaleX'], scaley: ['scaleY'], shear: ['shearX', 'shearY'], shearx: ['shearX'], sheary: ['shearY'], inherit: ['inherit'],
};

/** The properties a slot colour timeline keys. */
const COLOUR_PROPERTIES: Record<SlotColourKind, readonly string[]> = { rgba: ['rgb', 'alpha'], rgb: ['rgb'], alpha: ['alpha'], rgba2: ['rgb', 'alpha', 'rgb2'], rgb2: ['rgb', 'rgb2'] };

/**
 * An animation compiled for the state, or refused by name where it keys what
 * the state does not mix (the header's *What is left out*). The property ids
 * are spine-core's by name — `x|bone`, `rgb|slot`, `deform|slot|record` — so
 * two timelines key one property exactly where the runtime's do.
 */
function mixAnimationOf(doc: CompiledDocument, name: string): MixAnimation {
  const anim = doc.animations.find((a) => a.name === name);
  if (anim === undefined) throw new CoreInputError(`animation "${name}" is not one of this document's [${doc.animations.map((a) => a.name).join(', ')}]`);
  const t = anim.timelines;
  const c = anim.constraints;
  const left: string[] = [];
  for (const [kind, n] of [['ik', c.ik.length], ['transform', c.transform.length], ['path', c.path.length], ['physics', c.physics + (c.physicsKeyed?.length ?? 0)], ['slider', c.slider.length]] as const) if (n > 0) left.push(`${kind} constraint timelines`);
  if (t.attachments.some((a) => a.sequence !== null)) left.push('a sequence timeline');
  if (t.drawOrder.length > 0) left.push('the draw order');
  for (const a of t.attachments) {
    if (a.deform === null) continue;
    const g = doc.skins.find((k) => k.name === a.skin)?.attachments[a.slot]?.[a.attachment]?.geometry;
    if (g?.kind === 'path') left.push(`a deform of path attachment "${a.skin}/${a.slot}/${a.attachment}"`);
  }
  if (left.length > 0) throw new CoreInputError(`animation "${name}" keys ${left.join(', ')}, which the live tracks do not mix — they mix bone, slot colour, attachment and deform timelines, and fire events (issue #1336)`);
  const boneIndex = new Map(doc.bones.map((b, i) => [b.name, i]));
  const slotIndex = new Map(doc.slots.map((s, i) => [s.name, i]));
  const timelines: MixTimeline[] = [];
  for (const target of t.slots) {
    const slot = slotIndex.get(target.name) as number;
    for (const tl of target.timelines) {
      if (tl.kind === 'attachment') timelines.push({ type: 'attachment', slot, keys: tl.keys, ids: [`attachment|${target.name}`], instant: true });
      else timelines.push({ type: 'colour', slot, kind: tl.kind, keys: tl.keys, ids: COLOUR_PROPERTIES[tl.kind].map((p) => `${p}|${target.name}`), instant: false });
    }
  }
  for (const target of t.bones) {
    const bone = boneIndex.get(target.name) as number;
    for (const tl of target.timelines) timelines.push({ type: 'bone', bone, kind: tl.kind, keys: tl.keys, ids: BONE_PROPERTIES[tl.kind].map((p) => `${p}|${target.name}`), instant: tl.kind === 'inherit' });
  }
  for (const a of t.attachments) {
    if (a.deform === null) continue;
    const identity = `${a.skin}/${a.slot}/${a.attachment}`;
    timelines.push({ type: 'deform', identity, timeline: a, ids: [`deform|${a.slot}|${identity}`], instant: false });
  }
  if (t.events.length > 0) timelines.push({ type: 'events', keys: t.events, ids: ['event'], instant: true });
  return { name, duration: t.duration, timelines, ids: new Set(timelines.flatMap((x) => x.ids)) };
}

/**
 * The property ids an animation's timelines key, in the order the state
 * applies them — what `CO51` holds to spine-core's `Animation.timelines`, since
 * a timeline's mode depends on which timeline of the same track saw its
 * property first.
 */
export function mixPropertyOrder(doc: CompiledDocument, animation: string): string[][] {
  return mixAnimationOf(doc, animation).timelines.map((x) => x.ids);
}

// ---------------------------------------------------------------------------
// the entries — `TrackEntry`
// ---------------------------------------------------------------------------

interface Entry {
  anim: MixAnimation;
  loop: boolean;
  previous: Entry | null;
  next: Entry | null;
  mixingFrom: Entry | null;
  mixingTo: Entry | null;
  delay: number;
  trackTime: number;
  trackLast: number;
  nextTrackLast: number;
  trackEnd: number;
  animationLast: number;
  nextAnimationLast: number;
  mixTime: number;
  mixDuration: number;
  totalAlpha: number;
  /** `TrackEntry.alpha`. */
  alpha: number;
  /** `TrackEntry.additive`. */
  additive: boolean;
  keepHold: boolean;
  timelineMode: number[];
  timelineHoldMix: Array<Entry | null | undefined>;
  /** Each rotate timeline's remembered direction, two numbers per timeline; its length is what marks the first frame (`applyRotateTimeline`). */
  timelinesRotation: number[];
}

/** A new entry (`AnimationState.trackEntry`): every field the runtime's default; the mix duration 0, `AnimationStateData`'s default mix, alpha 1, not additive. */
function newEntry(anim: MixAnimation, loop: boolean): Entry {
  return {
    anim, loop, previous: null, next: null, mixingFrom: null, mixingTo: null,
    delay: 0, trackTime: 0, trackLast: -1, nextTrackLast: -1, trackEnd: Number.MAX_VALUE,
    animationLast: -1, nextAnimationLast: -1, mixTime: 0, mixDuration: 0, totalAlpha: 0, alpha: 1, additive: false, keepHold: false,
    timelineMode: [], timelineHoldMix: [], timelinesRotation: [],
  };
}

/** `TrackEntry.getAnimationTime`: the track time wrapped by the duration (0 over a duration of 0) when looping, else held at the duration. */
function animationTimeOf(e: Entry): number {
  if (!e.loop) return Math.min(e.trackTime + 0, e.anim.duration);
  const d = e.anim.duration;
  if (d === 0) return 0;
  return (e.trackTime % d) + 0;
}

/** `TrackEntry.getTrackComplete`: when a looping entry ends its current cycle, when a held one reaches its duration, or now. */
function trackComplete(e: Entry): number {
  const d = e.anim.duration;
  if (d !== 0) {
    if (e.loop) return d * (1 + ((e.trackTime / d) | 0));
    if (e.trackTime < d) return d;
  }
  return e.trackTime;
}

const signum = (v: number): number => (v > 0 ? 1 : v < 0 ? -1 : 0);
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

// ---------------------------------------------------------------------------
// one step's skeleton — the pose the entries are applied to
// ---------------------------------------------------------------------------

/** `Slot.attachmentState` against the apply's `unkeyedState`: untouched, shown for a deform only, or kept. */
const ATTACH_NONE = 0;
const ATTACH_SETUP = 1;
const ATTACH_RETAIN = 2;

interface SlotState {
  placeholder: string | null;
  light: number[];
  dark: number[] | null;
  deform: number[] | null;
  seen: string[];
  attachmentState: number;
}

/** What a slot's placeholder resolves to, as the state compares attachments: the record's own key, whether it is a vertex attachment, and the record its deform timelines are keyed as (`VertexAttachment.timelineAttachment`). */
interface Resolved {
  key: string | null;
  vertex: boolean;
  timeline: string | null;
  vertices: ModelVertices | null;
}

class Pose {
  readonly bones: ModelBone[];
  readonly slots: SlotState[];
  readonly events: CoreEventRow[] = [];
  private readonly active: ReadonlySet<string>;
  private readonly live: boolean[];
  private readonly resolved = new Map<string, Resolved>();

  constructor(
    private readonly doc: CompiledDocument,
    private readonly plant: TracksPlant,
  ) {
    this.bones = [...doc.bones];
    this.active = activeBones(doc);
    const colour = plant.colour ?? readColour;
    const gate = plant.slotTimelines ?? slotTimelinesApply;
    this.live = doc.slots.map((s) => gate(doc, s, this.active));
    this.slots = doc.slots.map((slot): SlotState => {
      const setupDark = slot.dark === undefined ? null : readColour(slot.dark);
      return { placeholder: slot.setup, light: slot.color === undefined ? [1, 1, 1, 1] : colour(slot.color), dark: setupDark === null ? null : [setupDark[0], setupDark[1], setupDark[2]], deform: null, seen: [], attachmentState: ATTACH_NONE };
    });
  }

  /** Bone `i`'s locals to write: the setup bone copied on its first write, as `posedBones` copies a keyed one. */
  bone(i: number): ModelBone | null {
    const b = this.bones[i];
    if (!this.active.has(b.name)) return null;
    if (b === this.doc.bones[i]) this.bones[i] = { ...b };
    return this.bones[i];
  }

  slotLive(i: number): boolean {
    return this.live[i];
  }

  /** What `placeholder` shows in slot `i` (`Resolved`). */
  resolve(i: number, placeholder: string | null): Resolved {
    if (placeholder === null) return { key: null, vertex: false, timeline: null, vertices: null };
    const slot = this.doc.slots[i];
    const memo = `${i}\u0000${placeholder}`;
    const known = this.resolved.get(memo);
    if (known !== undefined) return known;
    const s = (this.plant.shown ?? shownAttachment)(this.doc, { ...slot, setup: placeholder });
    let out: Resolved;
    if (s === null) out = { key: null, vertex: false, timeline: null, vertices: null };
    else if ('conflict' in s) out = { key: `conflict\u0000${placeholder}`, vertex: false, timeline: null, vertices: null };
    else out = resolvedOf(this.doc, slot, s);
    this.resolved.set(memo, out);
    return out;
  }

  /** `SlotPose.setAttachment`: a different attachment clears the deform unless both play the same record's timelines. */
  setAttachment(i: number, placeholder: string | null): void {
    const s = this.slots[i];
    const was = this.resolve(i, s.placeholder);
    const now = this.resolve(i, placeholder);
    s.placeholder = placeholder;
    if (was.key === now.key) return;
    if (!now.vertex || !was.vertex || now.timeline !== was.timeline) s.deform = null;
  }
}

/** A shown record as the state compares it (`Resolved`): a vertex attachment plays its own record's timelines, a linked mesh that plays its source's those. */
function resolvedOf(doc: CompiledDocument, slot: ModelSlot, s: CoreShown): Resolved {
  const g = s.record.geometry;
  const key = `${s.skin}\u0000${s.placeholder}`;
  if (g === undefined || g.kind === 'region') return { key, vertex: false, timeline: null, vertices: null };
  if (g.kind === 'linkedmesh') {
    const source = doc.skins.find((k) => k.name === g.skin)?.attachments[g.slot]?.[g.source]?.geometry;
    const vertices = source !== undefined && source.kind !== 'region' && source.kind !== 'linkedmesh' ? source.vertices : null;
    return { key, vertex: true, timeline: s.record.timelines === true ? `${g.skin}/${g.slot}/${g.source}` : `${s.skin}/${slot.name}/${s.placeholder}`, vertices };
  }
  return { key, vertex: true, timeline: `${s.skin}/${slot.name}/${s.placeholder}`, vertices: g.vertices };
}

// ---------------------------------------------------------------------------
// the state — `AnimationState`
// ---------------------------------------------------------------------------

class Mixer {
  readonly tracks: Array<Entry | null> = [];
  private animationsChanged = false;
  private readonly propertyIds = new Map<string, number>();
  private readonly anims = new Map<string, MixAnimation>();

  constructor(
    private readonly doc: CompiledDocument,
    private readonly plant: TracksPlant,
  ) {}

  animation(name: string): MixAnimation {
    let a = this.anims.get(name);
    if (a === undefined) {
      a = mixAnimationOf(this.doc, name);
      this.anims.set(name, a);
    }
    return a;
  }

  private changed(): void {
    this.animationsChanged = true;
  }

  private expandToIndex(index: number): Entry | null {
    while (this.tracks.length <= index) this.tracks.push(null);
    return this.tracks[index];
  }

  private clearNext(entry: Entry): void {
    entry.next = null;
  }

  private setTrack(index: number, current: Entry): void {
    const from = this.expandToIndex(index);
    this.tracks[index] = current;
    current.previous = null;
    if (from !== null) {
      from.next = null;
      current.mixingFrom = from;
      from.mixingTo = current;
      current.mixTime = 0;
      // Reset rotation for mixing out, in case the entry was mixed in.
      from.timelinesRotation.length = 0;
    }
    this.changed();
  }

  setAnimation(track: number, anim: MixAnimation, loop: boolean): Entry {
    let current = this.expandToIndex(track);
    if (current !== null) {
      if (current.nextTrackLast === -1 && current.anim === anim) {
        // Don't mix from an entry that was never applied.
        this.tracks[track] = current.mixingFrom;
        this.changed();
        this.clearNext(current);
        current = current.mixingFrom;
      } else this.clearNext(current);
    }
    const entry = newEntry(anim, loop);
    this.setTrack(track, entry);
    return entry;
  }

  addAnimation(track: number, anim: MixAnimation, loop: boolean, delay: number): Entry {
    let last = this.expandToIndex(track);
    if (last !== null) while (last.next !== null) last = last.next;
    const entry = newEntry(anim, loop);
    if (last === null) {
      this.setTrack(track, entry);
      if (delay < 0) delay = 0;
    } else {
      last.next = entry;
      entry.previous = last;
      if (delay <= 0) delay = Math.max(delay + this.complete(last) - entry.mixDuration, 0);
    }
    entry.delay = delay;
    return entry;
  }

  /** `TrackEntry.setMixDuration(mixDuration, delay)`. */
  setMixDuration(entry: Entry, mixDuration: number, delay: number): void {
    entry.mixDuration = mixDuration;
    if (delay <= 0) delay = entry.previous === null ? 0 : Math.max(delay + this.complete(entry.previous) - mixDuration, 0);
    entry.delay = delay;
  }

  /** `getTrackComplete`, or 0 under the plant that reads a queued delay as "now". */
  complete(e: Entry): number {
    return this.plant.queueDelayNow === true ? e.trackTime : trackComplete(e);
  }

  /** `TrackEntry.mix()`: `mixTime / mixDuration` clamped to 1, 1 over a mix of 0 — reversed under the plant. */
  mixOf(e: Entry): number {
    let m: number;
    if (e.mixDuration === 0) m = 1;
    else {
      m = e.mixTime / e.mixDuration;
      if (m >= 1) m = 1;
    }
    return this.plant.mixReversed === true ? 1 - m : m;
  }

  /** `TrackEntry.alpha` — inverted or ignored under the plants. */
  alphaOf(e: Entry): number {
    if (this.plant.alphaIgnored === true) return 1;
    return this.plant.alphaInverted === true ? 1 - e.alpha : e.alpha;
  }

  /** `TrackEntry.additive` — never under the plant that applies an additive entry as a replacing one. */
  additiveOf(e: Entry): boolean {
    return e.additive && this.plant.additiveAsReplace !== true;
  }

  /** Whether `computeHold` reads an entry as additive — never under the plant that holds as if none were. */
  private holdsAdditive(e: Entry | null): boolean {
    return e !== null && this.additiveOf(e) && this.plant.additiveHeld !== true;
  }

  update(delta: number): void {
    const tracks = this.tracks;
    for (let i = 0, n = tracks.length; i < n; i++) {
      const current = tracks[i];
      if (current === null) continue;
      current.animationLast = current.nextAnimationLast;
      current.trackLast = current.nextTrackLast;
      let currentDelta = delta;
      if (current.delay > 0) {
        current.delay -= currentDelta;
        if (current.delay > 0) continue;
        currentDelta = -current.delay;
        current.delay = 0;
      }
      let next = current.next;
      if (next !== null) {
        // When the next entry's delay is passed, change to the next entry, preserving leftover time.
        const nextTime = current.trackLast - next.delay;
        if (nextTime >= 0) {
          next.delay = 0;
          next.trackTime += nextTime + delta;
          current.trackTime += currentDelta;
          this.setTrack(i, next);
          while (next.mixingFrom !== null) {
            next.mixTime += delta;
            next = next.mixingFrom;
          }
          continue;
        }
      } else if (current.trackLast >= current.trackEnd && current.mixingFrom === null) {
        tracks[i] = null;
        this.changed();
        this.clearNext(current);
        continue;
      }
      if (current.mixingFrom !== null && this.updateMixingFrom(current, delta)) {
        // End mixing from entries once all have completed.
        const from = current.mixingFrom;
        current.mixingFrom = null;
        if (from !== null) from.mixingTo = null;
        this.changed();
      }
      current.trackTime += currentDelta;
    }
  }

  private updateMixingFrom(to: Entry, delta: number): boolean {
    const from = to.mixingFrom;
    if (from === null) return true;
    const finished = this.updateMixingFrom(from, delta);
    from.animationLast = from.nextAnimationLast;
    from.trackLast = from.nextTrackLast;
    // The from entry was applied at least once and the mix is complete.
    if (to.nextTrackLast !== -1 && to.mixTime >= to.mixDuration) {
      // Mixing is complete for all entries before the from entry or the mix is instantaneous.
      if (from.totalAlpha === 0 || to.mixDuration === 0) {
        to.mixingFrom = from.mixingFrom;
        if (from.mixingFrom !== null) from.mixingFrom.mixingTo = to;
        if (from.totalAlpha === 0) for (let next: Entry | null = to; next.mixingTo !== null; next = next.mixingTo) next.keepHold = true;
        this.changed();
      }
      return finished;
    }
    from.trackTime += delta;
    to.mixTime += delta;
    return false;
  }

  /** `AnimationState.apply` onto one step's pose, every track in order; returns track 0's current entry's animation time (0 where it applied none). */
  apply(pose: Pose): number {
    if (this.animationsChanged) this.computeModes();
    let base = 0;
    const tracks = this.tracks;
    for (let i = 0, n = tracks.length; i < n; i++) {
      const current = tracks[i];
      if (current === null || current.delay > 0) continue;
      // Apply mixing from entries first.
      let alpha = this.alphaOf(current);
      if (current.mixingFrom !== null) alpha *= this.applyMixingFrom(current, pose, i);
      else if (current.trackTime >= current.trackEnd && current.next === null) alpha = 0;
      // Apply the current entry.
      const animationLast = current.animationLast;
      const animationTime = animationTimeOf(current);
      const timelines = current.anim.timelines;
      const count = timelines.length;
      if (i === 0 && alpha === 1) {
        // Track 0 at full weight poses from the setup pose and adds nothing, additive or not — the runtime passes `add` false here.
        for (const tl of timelines) {
          if (tl.type === 'attachment') this.applyAttachment(pose, tl, animationTime, SETUP, true);
          else this.applyTimeline(pose, tl, animationLast, animationTime, true, 1, SETUP, false, false);
        }
      } else {
        const modes = current.timelineMode;
        // `alphaAttachmentThreshold` is 0: an entry keeps its attachments at any alpha, 0 included.
        const retain = this.plant.attachmentsBelowHalfAlpha === true ? alpha >= 0.5 : alpha >= 0;
        const add = this.additiveOf(current);
        // `shortestRotation = add || …`: an additive entry's rotations go through the timeline itself, never the remembered direction.
        const shortest = add && this.plant.additiveRotateRemembered !== true;
        const firstFrame = !shortest && current.timelinesRotation.length !== count << 1;
        if (firstFrame) current.timelinesRotation.length = count << 1;
        timelines.forEach((tl, ii) => {
          const from = this.fromOf(modes[ii] & MODE, i);
          if (!shortest && tl.type === 'bone' && tl.kind === 'rotate') this.applyRotate(pose, tl, animationTime, alpha, from, current.timelinesRotation, ii << 1, firstFrame);
          else if (tl.type === 'attachment') {
            if (add && this.plant.additiveAttachmentsDirect === true) this.applyAttachmentDirect(pose, tl, animationTime, from, false);
            else this.applyAttachment(pose, tl, animationTime, from, retain);
          } else this.applyTimeline(pose, tl, animationLast, animationTime, true, alpha, from, false, add);
        });
      }
      if (i === 0) base = animationTime;
      current.nextAnimationLast = animationTime;
      current.nextTrackLast = current.trackTime;
    }
    // Set slot attachments to the setup pose if they were set temporarily to apply deform timelines.
    pose.slots.forEach((s, k) => {
      if (s.attachmentState === ATTACH_SETUP) pose.setAttachment(k, this.doc.slots[k].setup);
    });
    return base;
  }

  /** Where a timeline mixes from — `CURRENT` read as `SETUP` above track 0 under the plant. */
  private fromOf(from: number, track: number): number {
    return this.plant.higherTracksFromSetup === true && track > 0 && from === CURRENT ? SETUP : from;
  }

  private applyMixingFrom(to: Entry, pose: Pose, track: number): number {
    const from = to.mixingFrom as Entry;
    const fromMix = from.mixingFrom !== null ? this.applyMixingFrom(from, pose, track) : 1;
    const mix = this.mixOf(to);
    const a = this.alphaOf(from) * fromMix;
    const keep = 1 - mix * (this.plant.holdIgnoresEntryAlpha === true ? 1 : this.alphaOf(to));
    const alphaMix = a * (1 - mix);
    const alphaHold = keep > 0 ? alphaMix / keep : a;
    const timelines = from.anim.timelines;
    const count = timelines.length;
    const modes = from.timelineMode;
    const holdMix = from.timelineHoldMix;
    const add = this.additiveOf(from);
    const shortest = add && this.plant.additiveRotateRemembered !== true;
    const firstFrame = !shortest && from.timelinesRotation.length !== count << 1;
    if (firstFrame) from.timelinesRotation.length = count << 1;
    const animationLast = from.animationLast;
    const animationTime = animationTimeOf(from);
    const fire = this.plant.eventsUntilHalfMix === true && mix < 0.5;
    from.totalAlpha = 0;
    timelines.forEach((tl, i) => {
      const mode = modes[i];
      const mixFrom = this.fromOf(mode & MODE, track);
      let alpha: number;
      if ((mode & HOLD) !== 0 && this.plant.holdFaded !== true) {
        const h = holdMix[i];
        alpha = h === null || h === undefined ? alphaHold : alphaHold * (1 - this.mixOf(h));
      } else alpha = alphaMix;
      from.totalAlpha += alpha;
      if (!shortest && tl.type === 'bone' && tl.kind === 'rotate') this.applyRotate(pose, tl, animationTime, alpha, mixFrom, from.timelinesRotation, i << 1, firstFrame);
      else if (tl.type === 'attachment') {
        // `mixAttachmentThreshold` is 0: an entry mixing out never keeps an attachment, whatever its alpha.
        if (add && this.plant.additiveAttachmentsDirect === true) this.applyAttachmentDirect(pose, tl, animationTime, mixFrom, true);
        else this.applyAttachment(pose, tl, animationTime, mixFrom, false);
      }
      // An entry mixing out fires no event: `eventThreshold` is 0 and its events are applied only while the mix is below it.
      // An additive one mixing out adds at the faded alpha — its additive timelines are never held (`computeHold`).
      else this.applyTimeline(pose, tl, animationLast, animationTime, fire, alpha, mixFrom, true, add);
    });
    from.nextAnimationLast = animationTime;
    from.nextTrackLast = from.trackTime;
    return mix;
  }

  /** `_animationsChanged`: every track's entries' modes, oldest first, the property owners cleared after. */
  private computeModes(): void {
    this.animationsChanged = false;
    this.tracks.forEach((top, i) => {
      if (top === null) return;
      let entry: Entry | null = top;
      while (entry.mixingFrom !== null) entry = entry.mixingFrom;
      do {
        this.computeHold(entry, i);
        entry = entry.mixingTo;
      } while (entry !== null);
    });
    this.propertyIds.clear();
  }

  private computeHold(entry: Entry, track: number): void {
    const timelines = entry.anim.timelines;
    const modes = entry.timelineMode;
    modes.length = timelines.length;
    const holdMix = entry.timelineHoldMix;
    holdMix.length = 0;
    const to = entry.mixingTo;
    const add = this.holdsAdditive(entry);
    const toAdds = this.holdsAdditive(to);
    timelines.forEach((tl, i) => {
      const from = this.propertyFrom(track, tl.ids);
      // An additive entry's additive timelines are never held, and the entry's keepHold does not reach them.
      if (add && addable(tl)) {
        modes[i] = from;
        return;
      }
      let mode: number;
      // Hold if the next entry will overwrite this property — an additive one adding to it does not.
      if (to === null || tl.instant || (toAdds && addable(tl)) || !hasAny(to.anim, tl.ids)) mode = from;
      else {
        mode = from | HOLD;
        // Find the next entry that doesn't overwrite this property. Its mix fades out the hold, instead of it ending abruptly.
        for (let next = to.mixingTo; next !== null; next = next.mixingTo) {
          if ((this.holdsAdditive(next) && addable(tl)) || !hasAny(next.anim, tl.ids)) {
            if (next.mixDuration > 0) holdMix[i] = next;
            break;
          }
        }
      }
      if (entry.keepHold) mode = (mode & ~HOLD) | ((modes[i] ?? 0) & HOLD);
      modes[i] = mode;
    });
  }

  /** `AnimationState.from`: `SETUP` for a property no one keyed yet, `FIRST` for one this track keyed first, `CURRENT` for one a lower track keyed. */
  private propertyFrom(track: number, ids: readonly string[]): number {
    const owners = this.propertyIds;
    let from = SETUP;
    for (let i = 0, n = ids.length; i < n; i++) {
      const owner = owners.get(ids[i]);
      if (owner === undefined) owners.set(ids[i], track);
      else {
        if (owner !== track) {
          while (++i < n) if (!owners.has(ids[i])) owners.set(ids[i], track);
          return CURRENT;
        }
        from = FIRST;
      }
    }
    return from;
  }

  // -------------------------------------------------------------------------
  // the timelines' `apply`
  // -------------------------------------------------------------------------

  private values(keys: readonly CoreKey[], t: number): number[] | null {
    const index = (this.plant.search ?? keyIndexAt)(keys, t);
    if (index < 0) return null;
    const channel = this.plant.channel ?? channelAt;
    return keys[index].values.map((_v, c) => channel(keys, index, c, t));
  }

  /** `Timeline.apply` for every timeline but an attachment's and a rotation mixed below full weight; `add` is the entry's, read only by the timelines the runtime adds (`addable`). */
  private applyTimeline(pose: Pose, tl: MixTimeline, lastTime: number, time: number, fire: boolean, alpha: number, from: number, out: boolean, add: boolean): void {
    switch (tl.type) {
      case 'bone': return this.applyBone(pose, tl, time, alpha, from, out, add);
      case 'colour': return this.applyColour(pose, tl, time, alpha, from);
      case 'deform': return this.applyDeform(pose, tl, time, alpha, from, add);
      case 'events':
        if (fire) pose.events.push(...eventsFired(tl.keys, lastTime, time, rawNumber, time < lastTime));
        return;
      case 'attachment': return;
    }
  }

  private applyBone(pose: Pose, tl: Extract<MixTimeline, { type: 'bone' }>, time: number, alpha: number, from: number, out: boolean, add: boolean): void {
    const bone = pose.bone(tl.bone);
    if (bone === null) return;
    const setup = this.doc.bones[tl.bone];
    if (tl.kind === 'inherit') {
      const restore = (): void => {
        if (setup.inheritMode === undefined) delete bone.inheritMode;
        else bone.inheritMode = setup.inheritMode;
      };
      if (out) {
        if (from !== CURRENT) restore();
        return;
      }
      const index = (this.plant.search ?? keyIndexAt)(tl.keys, time);
      if (index < 0) {
        if (from !== CURRENT) restore();
      } else bone.inheritMode = tl.keys[index].mode;
      return;
    }
    const v = this.values(tl.keys, time);
    const relative = (field: 'x' | 'y' | 'rotation' | 'shearX' | 'shearY', i: number): void => {
      const s = setup[field] ?? 0;
      const c = bone[field] ?? 0;
      // `getRelativeValue`: from the setup pose the same either way; else the keyed value added, or the value over the setup mixed in.
      bone[field] = v === null ? beforeFirstKey(from, alpha, c, s) : from === SETUP ? s + v[i] * alpha : c + (add ? v[i] : v[i] + s - c) * alpha;
    };
    const pair = (fx: 'x' | 'shearX', fy: 'y' | 'shearY'): void => {
      const sx = setup[fx] ?? 0;
      const sy = setup[fy] ?? 0;
      if (v === null) {
        if (from === SETUP) {
          bone[fx] = sx;
          bone[fy] = sy;
        } else if (from === FIRST) {
          bone[fx] = (bone[fx] ?? 0) + (sx - (bone[fx] ?? 0)) * alpha;
          bone[fy] = (bone[fy] ?? 0) + (sy - (bone[fy] ?? 0)) * alpha;
        }
        return;
      }
      if (from === SETUP) {
        bone[fx] = sx + v[0] * alpha;
        bone[fy] = sy + v[1] * alpha;
      } else if (add) {
        bone[fx] = (bone[fx] ?? 0) + v[0] * alpha;
        bone[fy] = (bone[fy] ?? 0) + v[1] * alpha;
      } else {
        bone[fx] = (bone[fx] ?? 0) + (sx + v[0] - (bone[fx] ?? 0)) * alpha;
        bone[fy] = (bone[fy] ?? 0) + (sy + v[1] - (bone[fy] ?? 0)) * alpha;
      }
    };
    const scale = (field: 'scaleX' | 'scaleY', i: number): void => {
      const s = setup[field] ?? 1;
      const c = bone[field] ?? 1;
      bone[field] = v === null ? beforeFirstKey(from, alpha, c, s) : scaleValue(v[i] * s, alpha, from, out, add, c, s);
    };
    switch (tl.kind) {
      case 'rotate': relative('rotation', 0); break;
      case 'translate': pair('x', 'y'); break;
      case 'translatex': relative('x', 0); break;
      case 'translatey': relative('y', 0); break;
      case 'shear': pair('shearX', 'shearY'); break;
      case 'shearx': relative('shearX', 0); break;
      case 'sheary': relative('shearY', 0); break;
      case 'scale':
        if (v === null) {
          const sx = setup.scaleX ?? 1;
          const sy = setup.scaleY ?? 1;
          if (from === SETUP) {
            bone.scaleX = sx;
            bone.scaleY = sy;
          } else if (from === FIRST) {
            bone.scaleX = (bone.scaleX ?? 1) + (sx - (bone.scaleX ?? 1)) * alpha;
            bone.scaleY = (bone.scaleY ?? 1) + (sy - (bone.scaleY ?? 1)) * alpha;
          }
        } else {
          bone.scaleX = scaleValue(v[0] * (setup.scaleX ?? 1), alpha, from, out, add, bone.scaleX ?? 1, setup.scaleX ?? 1);
          bone.scaleY = scaleValue(v[1] * (setup.scaleY ?? 1), alpha, from, out, add, bone.scaleY ?? 1, setup.scaleY ?? 1);
        }
        break;
      case 'scalex': scale('scaleX', 0); break;
      case 'scaley': scale('scaleY', 0); break;
    }
  }

  /** `applyRotateTimeline`: a rotation mixed below full weight turns the way it first turned. */
  private applyRotate(pose: Pose, tl: Extract<MixTimeline, { type: 'bone' }>, time: number, alpha: number, from: number, rotations: number[], i: number, firstFrame: boolean): void {
    if (firstFrame) rotations[i] = 0;
    if (alpha === 1) {
      this.applyBone(pose, tl, time, 1, from, false, false);
      return;
    }
    const bone = pose.bone(tl.bone);
    if (bone === null) return;
    const setup = this.doc.bones[tl.bone].rotation ?? 0;
    const v = this.values(tl.keys, time);
    let r1: number;
    let r2: number;
    if (v === null) {
      if (from === SETUP) {
        bone.rotation = setup;
        return;
      }
      if (from === CURRENT) return;
      r1 = bone.rotation ?? 0;
      r2 = setup;
    } else {
      r1 = from === SETUP ? setup : (bone.rotation ?? 0);
      r2 = setup + v[0];
    }
    // Mix between rotations using the direction of the shortest route on the first frame while detecting crosses.
    let total: number;
    let diff = r2 - r1;
    diff -= Math.ceil(diff / 360 - 0.5) * 360;
    if (diff === 0) total = rotations[i];
    else {
      let lastTotal: number;
      let lastDiff: number;
      if (firstFrame) {
        lastTotal = 0;
        lastDiff = diff;
      } else {
        lastTotal = rotations[i];
        // A slot the runtime's array never wrote reads `undefined`, which compares as NaN.
        lastDiff = rotations[i + 1] ?? Number.NaN;
      }
      const loops = lastTotal - (lastTotal % 360);
      total = diff + loops;
      const current = diff >= 0;
      let dir = lastTotal >= 0;
      if (Math.abs(lastDiff) <= 90 && signum(lastDiff) !== signum(diff)) {
        if (Math.abs(lastTotal - loops) > 180) {
          total += 360 * signum(lastTotal);
          dir = current;
        } else if (loops !== 0) total -= 360 * signum(lastTotal);
        else dir = current;
      }
      if (dir !== current) total += 360 * signum(lastTotal);
      rotations[i] = total;
    }
    rotations[i + 1] = diff;
    bone.rotation = r1 + total * alpha;
  }

  /** `applyAttachmentTimeline`: shown for good when retained, else for the deform timelines only and set back at the end of the apply. */
  private applyAttachment(pose: Pose, tl: Extract<MixTimeline, { type: 'attachment' }>, time: number, from: number, retain: boolean): void {
    if (!pose.slotLive(tl.slot)) return;
    const s = pose.slots[tl.slot];
    if (!retain && s.attachmentState === ATTACH_RETAIN) return;
    const index = (this.plant.search ?? keyIndexAt)(tl.keys, time);
    let setup = index < 0;
    let name: string | null = null;
    if (!setup) {
      name = tl.keys[index].name ?? null;
      setup = !retain && name === null;
    }
    if (setup) {
      if (from === CURRENT) return;
      name = this.doc.slots[tl.slot].setup;
    }
    pose.setAttachment(tl.slot, name);
    if (retain) s.attachmentState = ATTACH_RETAIN;
    else if (!setup) s.attachmentState = ATTACH_SETUP;
  }

  /** `AttachmentTimeline.apply` — the plain timeline, writing no attachment state: only `additiveAttachmentsDirect` reaches it, the reading `CO52` rejects. */
  private applyAttachmentDirect(pose: Pose, tl: Extract<MixTimeline, { type: 'attachment' }>, time: number, from: number, out: boolean): void {
    if (!pose.slotLive(tl.slot)) return;
    const index = (this.plant.search ?? keyIndexAt)(tl.keys, time);
    if (out || index < 0) {
      if (from !== CURRENT) pose.setAttachment(tl.slot, this.doc.slots[tl.slot].setup);
    } else pose.setAttachment(tl.slot, tl.keys[index].name ?? null);
  }

  private applyColour(pose: Pose, tl: Extract<MixTimeline, { type: 'colour' }>, time: number, alpha: number, from: number): void {
    if (!pose.slotLive(tl.slot)) return;
    const slot = this.doc.slots[tl.slot];
    const s = pose.slots[tl.slot];
    const l = s.light;
    const d = s.dark;
    const sl = slot.color === undefined ? [1, 1, 1, 1] : (this.plant.colour ?? readColour)(slot.color);
    const sdFull = slot.dark === undefined ? null : readColour(slot.dark);
    const sd = sdFull === null ? [0, 0, 0] : [sdFull[0], sdFull[1], sdFull[2]];
    const clampLight = (): void => {
      for (let k = 0; k < 4; k++) l[k] = clamp01(l[k]);
    };
    const v = this.values(tl.keys, time);
    const channels = SLOT_COLOUR_TIMELINES[tl.kind].channels.length;
    switch (tl.kind) {
      case 'rgba': {
        if (v === null) {
          if (from === SETUP) for (let k = 0; k < 4; k++) l[k] = sl[k];
          else if (from === FIRST) {
            for (let k = 0; k < 4; k++) l[k] += (sl[k] - l[k]) * alpha;
            clampLight();
          }
          return;
        }
        if (alpha === 1) for (let k = 0; k < 4; k++) l[k] = v[k];
        else if (from === SETUP) for (let k = 0; k < 4; k++) l[k] = sl[k] + (v[k] - sl[k]) * alpha;
        else for (let k = 0; k < 4; k++) l[k] += (v[k] - l[k]) * alpha;
        clampLight();
        return;
      }
      case 'rgb': {
        if (v === null) {
          if (from === SETUP) for (let k = 0; k < 3; k++) l[k] = sl[k];
          else if (from === FIRST) for (let k = 0; k < 3; k++) l[k] += (sl[k] - l[k]) * alpha;
          return;
        }
        const rgb = [v[0], v[1], v[2]];
        if (alpha !== 1) for (let k = 0; k < 3; k++) rgb[k] = from === SETUP ? sl[k] + (rgb[k] - sl[k]) * alpha : l[k] + (rgb[k] - l[k]) * alpha;
        for (let k = 0; k < 3; k++) l[k] = clamp01(rgb[k]);
        return;
      }
      case 'alpha': {
        if (v === null) {
          if (from === SETUP) l[3] = sl[3];
          else if (from === FIRST) l[3] += (sl[3] - l[3]) * alpha;
          return;
        }
        let a = v[0];
        if (alpha !== 1) a = from === SETUP ? sl[3] + (a - sl[3]) * alpha : l[3] + (a - l[3]) * alpha;
        l[3] = clamp01(a);
        return;
      }
      case 'rgba2':
      case 'rgb2': {
        if (d === null) return;
        const withAlpha = tl.kind === 'rgba2';
        const lightN = withAlpha ? 4 : 3;
        if (v === null) {
          if (from === SETUP) {
            for (let k = 0; k < lightN; k++) l[k] = sl[k];
            for (let k = 0; k < 3; k++) d[k] = sd[k];
          } else if (from === FIRST) {
            for (let k = 0; k < lightN; k++) l[k] += (sl[k] - l[k]) * alpha;
            if (withAlpha) clampLight();
            for (let k = 0; k < 3; k++) d[k] += (sd[k] - d[k]) * alpha;
          }
          return;
        }
        const light = v.slice(0, lightN);
        const dark = v.slice(lightN, channels);
        if (withAlpha) {
          if (alpha === 1) for (let k = 0; k < 4; k++) l[k] = light[k];
          else if (from === SETUP) {
            for (let k = 0; k < 4; k++) l[k] = sl[k] + (light[k] - sl[k]) * alpha;
            for (let k = 0; k < 3; k++) dark[k] = sd[k] + (dark[k] - sd[k]) * alpha;
          } else {
            for (let k = 0; k < 4; k++) l[k] += (light[k] - l[k]) * alpha;
            for (let k = 0; k < 3; k++) dark[k] = d[k] + (dark[k] - d[k]) * alpha;
          }
          clampLight();
        } else {
          if (alpha !== 1) {
            for (let k = 0; k < 3; k++) {
              light[k] = from === SETUP ? sl[k] + (light[k] - sl[k]) * alpha : l[k] + (light[k] - l[k]) * alpha;
              dark[k] = from === SETUP ? sd[k] + (dark[k] - sd[k]) * alpha : d[k] + (dark[k] - d[k]) * alpha;
            }
          }
          for (let k = 0; k < 3; k++) l[k] = clamp01(light[k]);
        }
        for (let k = 0; k < 3; k++) d[k] = clamp01(dark[k]);
        return;
      }
    }
  }

  /** `DeformTimeline.apply`: every live slot showing the record the timeline keys, its deform array mixed. */
  private applyDeform(pose: Pose, tl: Extract<MixTimeline, { type: 'deform' }>, time: number, alpha: number, from: number, add: boolean): void {
    const keys = tl.timeline.deform;
    if (keys === null) return;
    pose.slots.forEach((s, k) => {
      if (!pose.slotLive(k)) return;
      const shown = pose.resolve(k, s.placeholder);
      if (!shown.vertex || shown.timeline !== tl.identity || shown.vertices === null) return;
      const vertices = shown.vertices;
      if (!s.seen.includes(tl.identity)) s.seen.push(tl.identity);
      const target = (this.plant.deform ?? deformAt)(vertices, keys, time);
      let mixFrom = from;
      if (s.deform === null) mixFrom = SETUP;
      if (target === null) {
        // `applyBeforeFirst`.
        if (mixFrom === SETUP) s.deform = null;
        else if (mixFrom === FIRST) {
          if (alpha === 1) {
            s.deform = null;
            return;
          }
          const current = s.deform as number[];
          if (!vertices.weighted) {
            const setup = setupArray(vertices);
            s.deform = current.map((c, i) => c + (setup[i] - c) * alpha);
          } else {
            const keep = 1 - alpha;
            s.deform = current.map((c) => c * keep);
          }
        }
        return;
      }
      // `applyToSlot`: added only over a deform already there — over none it is the setup pose's branch, additive or not.
      const fromSetup = mixFrom === SETUP;
      if (alpha === 1) {
        if (add && !fromSetup) {
          const current = s.deform as number[];
          if (!vertices.weighted) {
            const setup = setupArray(vertices);
            s.deform = current.map((c, i) => c + (target[i] - setup[i]));
          } else s.deform = current.map((c, i) => c + target[i]);
        } else s.deform = [...target];
      } else if (fromSetup) {
        if (!vertices.weighted) {
          const setup = setupArray(vertices);
          s.deform = target.map((v, i) => setup[i] + (v - setup[i]) * alpha);
        } else s.deform = target.map((v) => v * alpha);
      } else if (add) {
        const current = s.deform as number[];
        if (!vertices.weighted) {
          const setup = setupArray(vertices);
          s.deform = current.map((c, i) => c + (target[i] - setup[i]) * alpha);
        } else s.deform = current.map((c, i) => c + target[i] * alpha);
      } else {
        const current = s.deform as number[];
        s.deform = current.map((c, i) => c + (target[i] - c) * alpha);
      }
    });
  }
}

/** `CurveTimeline1.beforeFirstKey`. */
function beforeFirstKey(from: number, alpha: number, current: number, setup: number): number {
  if (from === SETUP) return setup;
  if (from === FIRST) return current + (setup - current) * alpha;
  return current;
}

/** `CurveTimeline1.getScaleValue` past the first key, `value` the curve times the setup scale; added, its offset from the setup scale is added to the base. */
function scaleValue(value: number, alpha: number, from: number, out: boolean, add: boolean, current: number, setup: number): number {
  if (alpha === 1 && !add) return value;
  let base = from === SETUP ? setup : current;
  if (add) return base + (value - setup) * alpha;
  if (out) return base + (Math.abs(value) * Math.sign(base) - base) * alpha;
  base = Math.abs(base) * Math.sign(value);
  return base + (value - base) * alpha;
}

function hasAny(anim: MixAnimation, ids: readonly string[]): boolean {
  for (const id of ids) if (anim.ids.has(id)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// the live tracks
// ---------------------------------------------------------------------------

/** A track index: a whole number at or above 0, or the call refused naming it. */
function trackIndex(track: number, call: string): number {
  if (typeof track !== 'number' || !Number.isInteger(track) || track < 0) throw new CoreInputError(`the live tracks' ${call} names track ${String(track)}, not a whole number at or above 0`);
  return track;
}

function finiteAtOrAbove0(v: number, what: string, call: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new CoreInputError(`the live tracks' ${call} ${what} is ${String(v)}, not a finite time at or above 0`);
  return v;
}

function loopOf(options: MixOptions | undefined, call: string): boolean {
  if (typeof options !== 'object' || options === null || typeof options.loop !== 'boolean') throw new CoreInputError(`the live tracks' ${call} options.loop is ${JSON.stringify((options as Partial<MixOptions> | null | undefined)?.loop)}, not true or false`);
  return options.loop;
}

/** An alpha: a finite number from 0 to 1, or the call refused naming it — the runtime clamps nothing and defines no weight outside it. */
function alphaValue(v: unknown, what: string, call: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) throw new CoreInputError(`the live tracks' ${call} ${what} is ${typeof v === 'number' ? String(v) : JSON.stringify(v)}, not a number from 0 to 1`);
  return v;
}

/** `options.alpha` and `options.additive`: 1 and `false` when absent, else refused by name where they are not a weight and a boolean. */
function blendOf(options: MixOptions, call: string): { alpha: number; additive: boolean } {
  const alpha = options.alpha === undefined ? 1 : alphaValue(options.alpha, 'options.alpha', call);
  const additive: unknown = options.additive;
  if (additive !== undefined && typeof additive !== 'boolean') throw new CoreInputError(`the live tracks' ${call} options.additive is ${JSON.stringify(additive)}, not true or false — an entry adds or it does not`);
  return { alpha, additive: additive === true };
}

function delayOf(v: number, call: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new CoreInputError(`the live tracks' ${call} delay is ${String(v)}, not a finite number`);
  return v;
}

/**
 * The live tracks over `doc` (the header): refused by name where a walk on the
 * document would be, then animations set, queued and mixed out on any track,
 * pose 0 posed by `start()` and one pose per `step`.
 */
export function openTracks(doc: CompiledDocument, options: TracksOptions, plant: TracksPlant = {}): LiveTracks {
  if (typeof options !== 'object' || options === null || (options.reset !== 'animation' && options.reset !== 'setup')) throw new CoreInputError(`the live tracks' options.reset is ${JSON.stringify((options as Partial<TracksOptions> | null)?.reset)}, not "animation" or "setup"`);
  if (options.adjust !== undefined && typeof options.adjust !== 'function') throw new CoreInputError(`the live tracks' options.adjust is ${typeof options.adjust}, not a function`);
  if (options.clock !== undefined && typeof options.clock !== 'function') throw new CoreInputError(`the live tracks' options.clock is ${typeof options.clock}, not a function`);
  const clock = options.clock === undefined ? undefined : checkedClock(options.clock, 'the live tracks\'');
  return new Tracks(doc, options.reset, options.adjust, clock, plant, openRawTracksPath(doc, plant));
}

class Tracks implements LiveTracks {
  private readonly mixer: Mixer;
  private started = false;
  private steps = 0;
  private time = 0;
  private refused: string | null = null;

  constructor(
    private readonly doc: CompiledDocument,
    private readonly reset: RawReset,
    private readonly adjust: LocalAdjust | undefined,
    private readonly clock: ((dt: number) => number) | undefined,
    private readonly plant: TracksPlant,
    private readonly path: RawTracksPath,
  ) {
    this.mixer = new Mixer(doc, plant);
  }

  get trackTime(): number {
    return this.time;
  }

  get environment(): PhysicsEnvironment {
    return environmentOf(this.path.ctx);
  }

  setEnvironment(environment: Partial<PhysicsEnvironment>): void {
    this.live('setEnvironment');
    setEnvironmentOn(this.path.ctx, environment, 'the live tracks\'');
  }

  physicsTranslate(x: number, y: number): void {
    this.live('physicsTranslate');
    translateOn(this.path.ctx, x, y, 'the live tracks\'');
  }

  physicsRotate(x: number, y: number, degrees: number): void {
    this.live('physicsRotate');
    rotateOn(this.path.ctx, x, y, degrees, 'the live tracks\'');
  }

  private live(call: string): void {
    if (this.refused !== null) throw new CoreInputError(`the live tracks were refused at ${this.refused}, after their entries and physics had moved; open them again (${call} not made)`);
  }

  setAnimation(track: number, animation: string, options: MixOptions): void {
    this.live('setAnimation');
    const i = trackIndex(track, 'setAnimation');
    const loop = loopOf(options, 'setAnimation');
    const mix = finiteAtOrAbove0(options.mixDuration, 'mixDuration', 'setAnimation');
    const blend = blendOf(options, 'setAnimation');
    const entry = this.mixer.setAnimation(i, this.mixer.animation(animation), loop);
    entry.mixDuration = mix;
    entry.alpha = blend.alpha;
    entry.additive = blend.additive;
  }

  setEmptyAnimation(track: number, mixDuration: number): void {
    this.live('setEmptyAnimation');
    const i = trackIndex(track, 'setEmptyAnimation');
    const mix = finiteAtOrAbove0(mixDuration, 'mixDuration', 'setEmptyAnimation');
    const entry = this.mixer.setAnimation(i, EMPTY, false);
    entry.mixDuration = mix;
    entry.trackEnd = mix;
  }

  addAnimation(track: number, animation: string, options: QueueOptions): void {
    this.live('addAnimation');
    const i = trackIndex(track, 'addAnimation');
    const loop = loopOf(options, 'addAnimation');
    const mix = finiteAtOrAbove0(options.mixDuration, 'mixDuration', 'addAnimation');
    const delay = delayOf(options.delay, 'addAnimation');
    const blend = blendOf(options, 'addAnimation');
    const entry = this.mixer.addAnimation(i, this.mixer.animation(animation), loop, delay);
    this.mixer.setMixDuration(entry, mix, delay);
    entry.alpha = blend.alpha;
    entry.additive = blend.additive;
  }

  addEmptyAnimation(track: number, mixDuration: number, delay: number): void {
    this.live('addEmptyAnimation');
    const i = trackIndex(track, 'addEmptyAnimation');
    const mix = finiteAtOrAbove0(mixDuration, 'mixDuration', 'addEmptyAnimation');
    const d = delayOf(delay, 'addEmptyAnimation');
    const entry = this.mixer.addAnimation(i, EMPTY, false, d);
    if (d <= 0) entry.delay = Math.max(entry.delay + entry.mixDuration - mix, 0);
    entry.mixDuration = mix;
    entry.trackEnd = mix;
  }

  setAlpha(track: number, alpha: number): void {
    this.live('setAlpha');
    const i = trackIndex(track, 'setAlpha');
    const a = alphaValue(alpha, 'alpha', 'setAlpha');
    const e = this.mixer.tracks[i] ?? null;
    if (e === null) throw new CoreInputError(`the live tracks' setAlpha names track ${i}, which plays nothing — there is no entry to weigh`);
    e.alpha = a;
  }

  current(track: number): TrackEntryView | null {
    const e = this.mixer.tracks[trackIndex(track, 'current')] ?? null;
    if (e === null) return null;
    return { animation: e.anim.name, loop: e.loop, trackTime: e.trackTime, animationTime: animationTimeOf(e), duration: e.anim.duration, alpha: e.alpha, additive: e.additive };
  }

  start(): RawPose {
    this.live('start');
    if (this.started) throw new CoreInputError('the live tracks were started already; pose 0 is posed once');
    this.started = true;
    return this.guard('start', () => {
      if (this.reset === 'setup') return this.path.setupPose();
      return this.pose(0, true);
    });
  }

  step(dt: number): RawPose {
    const n = this.steps + 1;
    this.live(`step ${n}`);
    if (!this.started) throw new CoreInputError(`the live tracks' step ${n} comes before start(), which poses pose 0`);
    if (typeof dt !== 'number' || !Number.isFinite(dt) || dt < 0) throw new CoreInputError(`the live tracks' step ${n} is ${String(dt)}, not a finite time at or above 0`);
    return this.guard(`step ${n}`, () => {
      this.time += dt;
      this.mixer.update(dt);
      const pose = this.pose(dt, false);
      this.steps = n;
      return pose;
    });
  }

  /** `f`, the state refused for good if it throws once anything has moved. */
  private guard(call: string, f: () => RawPose): RawPose {
    try {
      return f();
    } catch (err) {
      this.refused = `${call} (${err instanceof Error ? err.message : String(err)})`;
      throw err;
    }
  }

  /** One pose: the entries applied over the setup pose, then the raw pose path (`openRawTracksPath`). */
  private pose(dt: number, first: boolean): RawPose {
    const { doc, path } = this;
    const ctx = path.ctx;
    const before = ctx.time;
    ctx.time += this.clock === undefined ? dt : this.clock(dt);
    const pose = new Pose(doc, this.plant);
    const animationTime = this.mixer.apply(pose);
    const entry = this.mixer.tracks[0] ?? null;
    const adjustment = this.adjust === undefined ? undefined : {
      callback: this.adjust,
      context: { trackTime: entry?.trackTime ?? null, animation: entry?.anim.name ?? null, globalTime: this.time },
    };
    const mixed = new Map(doc.slots.map((s, k) => [s.name, { deform: pose.slots[k].deform, seen: pose.slots[k].seen }]));
    return path.step(first, this.time, animationTime, {
      world: (sliders) => steppedLocalsWorld(doc, pose.bones, path.raw, sliders, { ctx, before, adjustment }, true),
      slots: (sliders, placeholders) => slotRowsFrom(doc, path.raw, sliders, placeholders, (_slot, _live): SlotBase => {
        const s = pose.slots[doc.slots.indexOf(_slot)];
        return { placeholder: s.placeholder, light: s.light, dark: s.dark };
      }),
      drawOrder: [],
      at: 0,
      sample: null,
      mixed,
      events: () => pose.events,
    });
  }
}
