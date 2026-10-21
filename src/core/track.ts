/**
 * The core's live track (issue #1276): one animation opened on a track and
 * stepped one `dt` at a time — a player's frame loop, whose steps are not known
 * in advance — every pose the raw entry's (`RawPose` in `./raw.ts`), the doubles
 * the core computed.
 *
 * It is not new math. Both batch walks — the raw entry's `poseRawAnimation`
 * and A10's looping walk (`./walk.ts`) — take their steps up front and pose
 * every step from the setup pose, carrying from one step to the next only the
 * physics context, the running track time and the animation time of the step
 * before. That carry is one object (`TrackState` in `./raw.ts`), and the batch
 * walk is "open, then step over the list"; this track opens the same walk and
 * takes its steps as they come. Measured before and after that split, over the
 * nineteen tree rows' 54 animations: 956 batch walks — the raw entry at 12, 24
 * and 60 fps from each reset, held three times past the duration, its two
 * one-step jumps under each reset, `poseRawAnimationEach`, A10's walk and its
 * scan on A10's schedule and at 60 fps over three cycles — 157,771 poses, every
 * one the same bits (the PR of issue #1276 carries the table).
 *
 * Several animations on several tracks, set, queued and mixed as spine-core's
 * `AnimationState` mixes them, are `openTracks` (`./tracks.ts`, issue #1336):
 * a second state machine over the same pose path past the timelines, which
 * this track reaches with the locals its one animation posed.
 *
 * ## The walk
 *
 * - **Held** (`loop: false`): the raw entry's walk — the track time the
 *   running sum of the steps, the animation time held at the duration, the
 *   physics clock moved by the step (or by `clock`, *The physics clock*
 *   below), events over `(previous animation time,
 *   animation time]` (`./raw.ts`, *One step*). `CO46` holds it to
 *   `poseRawAnimation` pose for pose, every field, bit for bit.
 * - **Looped** (`loop: true`): A10's looping walk's time, clock and `reset`
 *   keys across the wrap (`./walk.ts`, *The walk*) — and, which that walk does
 *   not carry because its one reader reads neither, the events it fires across
 *   the wrap and the clipped rows it cuts. `CO46` holds it to
 *   `poseLoopingWalk` narrowed to what that walk carries, bit for bit.
 * - **The reset is the caller's**, as on the raw entry (`RawReset`): pose 0
 *   (`first`) is posed when the track is opened, the batch walk's pose 0
 *   under the same reset, and every `step` is one pose after it.
 * - **Neither keeps a value that is not finite** (`keep: false`, the raw
 *   entry's argument: a renderer handed one draws a different picture in
 *   silence). What the raw entry refuses is a drawn vertex, a clip or clipped
 *   vertex, a clipped UV and an event's numbers; a bone's matrix and a slot's
 *   colour channel it passes on (NaN, `null`), and so does this track. Of
 *   108 forged animations of the tree rows (a leaf and its parent scaled past
 *   the largest double), 98 were refused at the first non-finite vertex and 4
 *   walked holding a non-finite bone no drawn vertex reads; `CO49` holds both
 *   halves, the second on a slotless bone chain.
 *
 * ## Across the wrap — what a looping track fires, measured
 *
 * Read off spine-core 4.3.13 — `AnimationState` with `setAnimation(0, name,
 * true)`, pose 0 applied at 0 and reset there or reset at the setup pose
 * with nothing applied, then per step `update(dt)`, `apply`,
 * `Skeleton.update(dt)`, `updateWorldTransform(Physics.update)` — by a
 * listener collecting `event` and `complete` in the order queued, on the
 * tree rows' six animations keying events and on 300 seeded probes whose keys
 * sit at 0, 1e-3 after it, in the middle, one float32 ulp and 1e-3 before the
 * duration, on it, and one ulp and 1e-3 past the bone's last key (where the
 * key sets the duration); over step lists that cross the wrap once and
 * several times, land exactly on the duration, and carry the track past it by
 * more than a cycle: 4,284 walks, 229,656 steps, 13,436 across the wrap, 8,846
 * longer than a cycle, 52,880 events and 24,587 completes, each in the
 * listener's order on every step. `CO47` holds the rule on its own population.
 *
 * - **A step whose animation time rose fires `(previous time, time]`**, as the
 *   raw entry's — so a step that carries the track past the duration once or
 *   more while its animation time still rises fires only that interval: the
 *   keys it passed on the way are not fired.
 * - **A step whose animation time went down — the wrap — fires the keys after
 *   the previous time, in key order, then the keys at or before the new time,
 *   in key order** (`eventsFired`'s `wrapped`): the second interval opens at
 *   −1, so a key at 0 fires on every wrap. Read in key order instead, 7,680 of
 *   the steps read off; with the second interval opening at 0, 6,066; with
 *   nothing fired across the wrap, 12,956.
 * - **A key at exactly the duration fires on the wrap step and on no other**,
 *   before the keys from 0: 11,978 such firings, every one on a wrap step. A
 *   key one float32 ulp before the duration is an ordinary key — it fired on a
 *   rising step 545 times, where the animation time reached it before the wrap.
 * - **An equal time is not a wrap** (`loopedTime`: a track time of exactly the
 *   duration applies at 0). A track stepped by exactly the duration applies at
 *   0 on every step, so it fires its keys at 0 on its first step and nothing
 *   after; stepped by half the duration it wraps on every second step.
 * - **`complete` is not carried** — a listener is the player's. Measured, it is
 *   queued once on a step whose track time's whole cycles rose past 0 —
 *   `⌊T / d⌋ > 0` and `⌊T / d⌋ > ⌊T_before / d⌋`, on every step at a duration
 *   of 0 — however many cycles the step crossed, after the keys after the
 *   previous time and before the keys from 0. A player derives it from
 *   `trackTime` and `duration`.
 *
 * ## The clipped rows
 *
 * The looping mode cuts every drawn attachment under a clip as the raw entry
 * does — the oracle's rows, and the core's own decomposition under a concave
 * or inverse clip (`clipThrough`) — where A10's walk cuts none. That is a
 * mode and not a measurement: the cut is per pose and does not read whether
 * the track loops. `CO48` holds it: on the clipping probe and the tree row
 * that clips, every looping pose, past the wrap included, equals the raw
 * entry's one step to its animation time in every field but the track time
 * and the events (4,009 of 4,009 on the tree row, 690 of them cutting 12,420
 * rows).
 *
 * ## The adjustment (issue #1336)
 *
 * `adjust` is a player's own bone-local value — a breath's scale, a look's
 * rotation — written onto the bones every pose, after the animation's
 * timelines posed the locals at the step's time and before the world
 * transforms, the constraints and the physics step (`LocalAdjust` in
 * `./animation.ts`, which states the view's rules). It runs on every pose the
 * animation is applied to — every `step`, and pose 0 under `reset:
 * 'animation'` — and not on pose 0 under `reset: 'setup'`, the setup pose
 * with nothing applied: a player applies its adjustment wherever it applies
 * the animation state, the first frame included, and spine-core's reset at
 * the setup pose applies none. Absent, every pose is the one the track posed
 * before it existed, bit for bit (`CO46`, unchanged; `CO50` holds a hook that
 * writes nothing to the same bits).
 *
 * `CO50` holds it to spine-core 4.3.13 on gallery/look, whose `head` carries
 * the deformed head mesh and every face bone, and the physics-driven
 * `ahoge_whip` two bones below it: the same `scaleY` written on `head` by the
 * core's hook and on `Bone.pose` between `AnimationState.apply` and
 * `updateWorldTransform(Physics.update)`, every bone's world transform and
 * every drawn vertex equal at tolerance 0 over looping and held walks under
 * both resets — spine-core's skeleton brought back to the setup pose
 * (`setupPoseBones`) before each `apply`, which is the core's own reading:
 * every pose is posed from the setup pose. Measured, and held red there:
 *
 * - **The write carried from frame to frame** — spine-core without that
 *   reset, where no timeline writes an unkeyed channel back, so a `scaleY`
 *   multiplied every frame compounds (every walk off from pose 2). The core
 *   carries no local from one step to the next; a value a player wants
 *   carried it keeps and writes again.
 * - **The write at draw time** — made after `updateWorldTransform`, the
 *   bone's own matrix alone brought up to date: the bone moves, its
 *   children, the meshes they carry and the physics do not.
 * - **Pose 0 not adjusted** under `reset: 'animation'`.
 *
 * ## The physics clock (issue #1396)
 *
 * `clock` is what each step moves the skeleton's physics clock by — the time
 * a physics constraint integrates — with `poseRawAnimationEach`'s meaning.
 * Absent, it is the step itself, and every pose is the one the track posed
 * before the option existed (`CO46`–`CO50`, unchanged). `physicsClockStep` is
 * the render's clock (issue #1380), for a player stepping at a fixed rate.
 * The track time, the animation time, the wrap, the events and `trackTime`
 * stay on the running sum of the steps: the clock moves the physics and
 * nothing else.
 *
 * - **Why the track takes it.** Stepped at a fixed rate whose frame lasts a
 *   whole number of physics steps, a spring shows the render's defect. On the
 *   public trailer's `show`, read with play#103's detector, the frame clock
 *   adds outlier poses 5, 11–13, 44–45 and 187–189 at a fixed 1/20 and 8,
 *   15–17, 31–33 and 505–507 at 1/60, and `clock: physicsClockStep` removes
 *   every one (the PR of issue #1396 carries the table). A player scaling its
 *   own `dt` instead moves the animation time too: a key at 0.5 s fires on
 *   the tenth step of 1/20 where the render and the runtime fire it on the
 *   eleventh, and the player stops agreeing with `rigc render`.
 * - **The reset.** Pose 0 under `reset: 'animation'` is a step of 0 and moves
 *   the clock by `clock(0)`, as the render's walk does — 0 for
 *   `physicsClockStep`; under `setup` nothing is stepped. A physics `reset`
 *   key restarts a constraint's time from the clock as it stands, so it is
 *   read on the same clock as every other step.
 * - **The seek** stays the caller's — open, then step to the time — and its
 *   steps go through the same clock, so a seek's physics is the physics of
 *   the steps it took.
 * - **A clock that returns no time** — not finite, or below 0 — refuses the
 *   step by name after the track time has moved, so the track stays refused.
 *
 * `CO53` holds the mechanism on LS05's spring probe (every constraint update
 * takes the steps exact arithmetic takes; the frame clock is red), `CO54` the
 * poses (equal to the render's walk, to `poseRawAnimationEach` on the same
 * clock, between the two live entries, and to spine-core with its
 * `AnimationState` updated by the step and its `Skeleton` by the clock), and
 * `CO55` that the times and the events are those of the walk without it.
 *
 * ## The environment, and the rig moved from outside (issue #1416)
 *
 * The rig states how each physics constraint answers the world — its `wind`
 * and `gravity` — and the consumer states the world. `setEnvironment({ wind,
 * gravity })` sets it from the next pose on and it stands until set again,
 * as spine-core's four `Skeleton` fields do: `wind` is `[windX, windY]`,
 * `gravity` is `[gravityX, gravityY]`, x to the right and **y down**, and
 * until set it is the runtime's own `{ wind: [1, 0], gravity: [0, 1] }`
 * (`./constraints_physics.ts`, *The environment*). Either half may be left
 * out to keep the one that stands. So a gust is the consumer setting `wind`
 * to `[0, 0]` at rest and `[k, 0]` while it blows, and a constraint that
 * states `wind: 0` does not feel it — the response is the rig's, the gust the
 * scene's.
 *
 * `physicsTranslate(x, y)` and `physicsRotate(x, y, degrees)` are the
 * runtime's `Skeleton` methods of those names: the consumer moved or turned
 * the whole rig since the last pose — in the skeleton's world, y up, degrees
 * counter-clockwise — and every constraint's next update sees its bone move
 * by that much, so a rig walked across the screen trails what hangs from it.
 * A player forwards what spine-core's `SkeletonPhysicsMovement` forwards: the
 * change of its display object's position since the last frame, converted into
 * the skeleton's units and axes, and the change of its rotation about the
 * skeleton's origin, `physicsRotate(0, 0, Δ)`, both before the `step` that
 * poses the frame.
 *
 * `CO56` holds the poses to spine-core 4.3.13 given the same values on its
 * `Skeleton`, and holds red the readings the mapping rejects; `CO57` holds that
 * nothing set — or the runtime's own values set on every step and a move of 0
 * — poses what the track posed before the methods existed, bit for bit.
 *
 * ## The oracle chain
 *
 * Nothing here is held to spine-core directly but the events: the live track
 * is held to the batch walk (`CO46`), the held batch walk to spine-core's
 * render and deform-measure recipes (`CR03`), the looped one to A10's recipe
 * (`CO25`), and both to `tools/pose_oracle.ts`'s stepped dump, whose schedule
 * is `stepSchedule` in `./constraints_physics.ts`. A second dump would be the
 * same numbers twice.
 *
 * ⛔ **A track refused part-way stays refused.** A step is checked before
 * anything moves; a refusal past that — a construct the core leaves out, a
 * non-finite vertex or write — comes after the track time and the physics
 * have moved, so every later `step` refuses naming the step it was refused
 * at, and the caller opens the track again. So does an error the caller's own
 * `adjust` throws: it is thrown mid-step, after the same moves. Seeking is the caller's too: a physics rig has
 * history, so a seek is "open, then step to the time".
 */
import { CoreInputError, type CompiledDocument } from './index.ts';
import { checkedClock, environmentOf, openRawTrack, rotateOn, setEnvironmentOn, stepRawTrack, translateOn, type RawPose, type RawReset, type TrackState, type WalkMode } from './raw.ts';
import type { LocalAdjust, TimelinePlant } from './animation.ts';
import type { PhysicsEnvironment } from './constraints_physics.ts';
import { LivePhysicsParameters, type PhysicsParameterPatch, type PhysicsParameterRead } from './physics_parameters.ts';
export type { PhysicsParameters, PhysicsParameterPatch, PhysicsParameterRead } from './physics_parameters.ts';
export type { AdjustableLocals, BoneLocals, LocalAdjust } from './animation.ts';
export type { PhysicsEnvironment } from './constraints_physics.ts';

/** How a live track is opened: whether it loops, and where its physics is reset (`RawReset`) — both the caller's, neither with a default — the caller's adjustment of every pose's bone locals (the header's *The adjustment*), and what each step moves the physics clock by (the header's *The physics clock*). */
export interface TrackOptions {
  loop: boolean;
  reset: RawReset;
  adjust?: LocalAdjust;
  /** What each step of `dt` moves the skeleton's physics clock by — `physicsClockStep` is the render's; absent, the step itself. The track time, the animation time and the events stay on the running sum of the steps. */
  clock?: (dt: number) => number;
}

/** A live track (`openTrack`): pose 0, then one pose per `step`. */
export interface LiveTrack {
  /** Pose 0, posed when the track was opened: the batch walk's first pose under the same `reset`. */
  readonly first: RawPose;
  /** The next pose: the track time moved by `dt`, a finite time at or above 0. */
  step(dt: number): RawPose;
  /** The running sum of the steps taken, 0 before the first. */
  readonly trackTime: number;
  /** The time the latest pose applied the animation at (0 for pose 0). */
  readonly animationTime: number;
  /** The runtime's duration of the animation (`CoreAnimationTimelines.duration`). */
  readonly duration: number;
  /** Sets the world every physics constraint answers from the next pose on (the header's *The environment*): `wind` and `gravity` as spine-core's `Skeleton.windX, windY` and `gravityX, gravityY` — x right, y down — either left out to keep the one that stands. Until set, `{ wind: [1, 0], gravity: [0, 1] }`, the runtime's own. */
  setEnvironment(environment: Partial<PhysicsEnvironment>): void;
  /** The environment the next pose answers. */
  readonly environment: PhysicsEnvironment;
  /** Merges a finite six-field patch for one physics constraint, applied from the next pose until clear. */
  setPhysicsParameters(name: string, patch: PhysicsParameterPatch): void;
  /** Pending patch and the last evaluated six values; null effective means not yet evaluated (e.g. inactive). */
  readPhysicsParameters(name: string): PhysicsParameterRead;
  /** Removes the patch for the next pose without resetting velocities, offsets or the clock. */
  clearPhysicsParameters(name: string): void;
  /** spine-core's `Skeleton.physicsTranslate`: the consumer moved the whole rig by `(x, y)` in the skeleton's world (y up) since the last pose, and every physics constraint's next update sees it. */
  physicsTranslate(x: number, y: number): void;
  /** spine-core's `Skeleton.physicsRotate`: the consumer turned the whole rig by `degrees` (counter-clockwise) about `(x, y)` in the skeleton's world since the last pose. */
  physicsRotate(x: number, y: number, degrees: number): void;
}

/** The two modes: a track that holds at its duration is the raw entry's walk; a looping one fires its events across the wrap and cuts its clipped rows (`live`). Neither keeps a non-finite value. */
const HELD: WalkMode = { loop: false, keep: false };
const LOOPED: WalkMode = { loop: true, keep: false, live: true };

/**
 * One animation opened on a live track (the header): refused by name where the
 * batch walk refuses the same document and animation, pose 0 posed, then
 * stepped one `dt` at a time.
 */
export function openTrack(doc: CompiledDocument, animation: string, options: TrackOptions, plant: TimelinePlant = {}): LiveTrack {
  if (typeof options !== 'object' || options === null || typeof options.loop !== 'boolean') throw new CoreInputError(`the live track's options.loop is ${JSON.stringify((options as Partial<TrackOptions> | null)?.loop)}, not true or false`);
  if (options.reset !== 'animation' && options.reset !== 'setup') throw new CoreInputError(`the live track's options.reset is ${JSON.stringify(options.reset)}, not "animation" or "setup"`);
  if (options.adjust !== undefined && typeof options.adjust !== 'function') throw new CoreInputError(`the live track's options.adjust is ${typeof options.adjust}, not a function`);
  if (options.clock !== undefined && typeof options.clock !== 'function') throw new CoreInputError(`the live track's options.clock is ${typeof options.clock}, not a function`);
  const mode = options.loop ? LOOPED : HELD;
  const clock = options.clock === undefined ? undefined : checkedClock(options.clock, 'the live track\'s');
  const parameters = new LivePhysicsParameters(doc);
  const { track, first } = openRawTrack(doc, animation, plant, options.reset, clock === undefined ? mode : { ...mode, clock: (dt) => clock(dt) }, options.adjust, (ctx) => { ctx.parameters = parameters; });
  return new Track(track, first, parameters);
}

class Track implements LiveTrack {
  readonly first: RawPose;
  private readonly track: TrackState<RawPose>;
  private steps = 0;
  private latest: number;
  private refused: string | null = null;

  constructor(track: TrackState<RawPose>, first: RawPose, private readonly parameters: LivePhysicsParameters) {
    this.track = track;
    this.first = first;
    this.latest = first.animationTime;
  }

  get trackTime(): number {
    return this.track.trackTime;
  }

  get animationTime(): number {
    return this.latest;
  }

  get duration(): number {
    return this.track.duration;
  }

  get environment(): PhysicsEnvironment {
    return environmentOf(this.track.ctx);
  }

  setEnvironment(environment: Partial<PhysicsEnvironment>): void {
    this.live('setEnvironment');
    setEnvironmentOn(this.track.ctx, environment, 'the live track\'s');
  }

  setPhysicsParameters(name: string, patch: PhysicsParameterPatch): void {
    this.live('setPhysicsParameters');
    this.parameters.set(name, patch);
  }

  readPhysicsParameters(name: string): PhysicsParameterRead {
    return this.parameters.read(name);
  }

  clearPhysicsParameters(name: string): void {
    this.live('clearPhysicsParameters');
    this.parameters.clear(name);
  }

  physicsTranslate(x: number, y: number): void {
    this.live('physicsTranslate');
    translateOn(this.track.ctx, x, y, 'the live track\'s');
  }

  physicsRotate(x: number, y: number, degrees: number): void {
    this.live('physicsRotate');
    rotateOn(this.track.ctx, x, y, degrees, 'the live track\'s');
  }

  /** A refused track refuses every call that would move it, naming the step it was refused at. */
  private live(call: string): void {
    if (this.refused !== null) throw new CoreInputError(`the live track was refused at step ${this.refused}, after its time and physics had moved; open the track again (${call} not made)`);
  }

  step(dt: number): RawPose {
    const n = this.steps + 1;
    if (this.refused !== null) throw new CoreInputError(`the live track was refused at step ${this.refused}, after its time and physics had moved; open the track again`);
    if (typeof dt !== 'number' || !Number.isFinite(dt) || dt < 0) throw new CoreInputError(`the live track's step ${n} is ${String(dt)}, not a finite time at or above 0`);
    try {
      const pose = stepRawTrack(this.track, dt);
      this.steps = n;
      this.latest = pose.animationTime;
      return pose;
    } catch (err) {
      this.refused = `${n} (${err instanceof Error ? err.message : String(err)})`;
      throw err;
    }
  }
}
