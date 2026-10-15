/**
 * Construct 5 of the core, third and fourth cuts (issue #938, step 2e-iii,
 * and issue #956, step 2e-iv, of issue #380): the physics constraint — under
 * `Physics.none`, the oracle's default phase, where it applies nothing, and
 * stepped, `Physics.reset` then `Physics.update` at a fixed `dt`, where it
 * integrates.
 *
 * ## What an unstepped physics constraint contributes: nothing
 *
 * Measured by posing hand-written skeletons through `tools/pose_oracle.ts
 * dump` (spine-core 4.3.13, `--skin all`, `--physics none`) twice — once as
 * written, once with every physics constraint and every physics timeline
 * taken out — and comparing the two dumps at tolerance 0:
 *
 * - 400 one-constraint skeletons: the constrained bone in all five inherit
 *   modes under a reflecting, sheared, scaled parent, with amplifier bones ten
 *   thousand units out along its axes; each of the five components (`x`, `y`,
 *   `rotate`, `scaleX`, `shearX`) at 1, between 0 and 2 or negative; `limit`,
 *   `fps`, `inertia`, `strength`, `damping`, `mass`, `wind`, `gravity` and
 *   `mix` at random, each `…Global` flag at random; half of them with
 *   physics timelines keying `mix`, `wind` and `reset` in an animation that
 *   also swings the parent — sampled at seven `grid` or `irr` times, every
 *   sample posed on the ONE skeleton the dump reuses: **400 of 400
 *   identical**.
 * - 462 nine-bone rigs whose two to six constraints mix physics constraints
 *   with ik and world- and local-space transform constraints in random order
 *   (so a physics constraint sits between a world-space edit and a constraint
 *   that re-poses it), physics timelines keying `mix` and `inertia`, five
 *   `irr` samples: **462 of 462 identical**, 41,577 bone-samples.
 *
 * So under `Physics.none` the physics constraint neither moves its bone nor
 * re-poses anything below it, whatever its parameters, its `mix` or its
 * timelines, and wherever it stands in the update order: `applyConstraints`
 * is given no step context and applies nothing.
 *
 * ## The stepped phase, measured (issue #956)
 *
 * Every rule below was fixed the same way: hand-written skeletons dumped by
 * `tools/pose_oracle.ts dump --physics step --dt <s>` (spine-core 4.3.13) and
 * by the core, compared at tolerance 0, most with amplifier bones ten
 * thousand units out so a difference of 1e-10 in a matrix reads as a grid
 * step. spine-core's source was not read; each rule is the reading the dump
 * left exact, and each is stated with the population that fixed it and the
 * readings it rejected. The figures `n of 400` below are one population
 * (seed 81 of the lab): 400 rigs of six bones under one to five constraints —
 * physics with every component, setting, `…Global` flag and timeline at
 * random, ik and transform among them, skin-required constraints, two
 * animations, `dt` among 1/60, 1/30, 1/120 and a random 0.005–0.05 — exact
 * on 400 of 400 (63,982 bone-samples) under the rules as written, and the
 * count is how many stayed exact with ONE rule replaced by the reading named.
 * The core suite's `CK` controls hold the probes.
 *
 * **Defaults.** A field the record leaves out reads the parser's value, read
 * off the oracle's `physics` block for a constraint stating nothing: every
 * component 0, `limit` 5000, `fps` 60 (`step` = 1 / fps: 45 read 0.022222),
 * `inertia` 0.5, `strength` 100, `damping` 0.85, `mass` 1 (the block holds
 * `massInverse`: 3 read 0.333333), `wind`, `gravity` 0, `mix` 1, every flag
 * false, `scaleY` `None`. The core writes that block from its records
 * (`physicsRows`), under both phases.
 *
 * **The schedule** (`stepSchedule`) is the oracle's, from its header: a
 * fresh state per animation, the animation applied at 0 and the skeleton
 * reset; then from each sample's predecessor `p`, a step to `p + k·dt` while
 * that is before `t`, then to `t`. The skeleton's clock is the SUM of the
 * steps' deltas (`s − previous s`), not `s`: the constraint reads its delta
 * off that clock. The setup pose under the step is the reset pose. Each step
 * applies the animation from the time the walk last applied it at
 * (`PhysicsStepContext.last`, −1 before the first), as a player does — which
 * decides only when a `reset` key fires (*reset*, below).
 *
 * **Which constraints step.** A constraint on an inactive bone does not. A
 * constraint with `skin: true` steps exactly when an applied skin's
 * `constraints.physics` list names it — under `--skin all` every skin is
 * applied at once, under `--skin <name>` the named skin alone
 * (`listedBySkin`, set per skin view by `underSkin` in `./index.ts`;
 * `physicsActive`). Measured on the
 * commander's private-corpus finding (two rows DIFF, the core leaving such
 * constraints inert): hand-written documents dumped under `--physics step`
 * with `--skin all`, `--skin s1` and `--skin default` — named by no skin:
 * not stepped under any; named by `s1`: stepped under `all` and `s1`, not
 * under `default`; named by the default skin: stepped (under `all`, and —
 * issue #932 — under `default` but not under `s1`); a skin naming the
 * constrained bone (skin-required or not), another physics constraint or an
 * ik constraint, but not this one: not stepped; no skins at all: not
 * stepped. The reading inherited from issue #938 — `skin: true` is never
 * applied under `--skin all` — was measured under `Physics.none`, where a
 * physics constraint applies nothing either way; it is rejected (`CK13`
 * plants it and turns the listed probe red). A
 * constraint whose `mix` is 0 does nothing at all at that update — not even
 * read its clock: a constraint muted from 0 to 0.3 s and then keyed to 1
 * integrates the whole 0.3 s on its first live update after the pending one
 * (sack-pro's `fall-in`; advancing the clock at `mix` 0 kept 394 of 400). A
 * constraint never updated is pending, like a reset one: its first update
 * takes the bone where it is and integrates nothing (not pending kept 399 of
 * 400 and turned sack-pro red).
 *
 * **The components.** Each is on when it is ABOVE 0: `x`, `y`, `scaleX`, and
 * the rotation when `rotate` or `shearX` is (reading any non-zero as on kept
 * 279 of 400). A negative `rotate` or `shearX` still weighs the rotation: its
 * weight is `(rotate + shearX)·mix` (dropping the negative kept 369 of 400).
 *
 * **The step** (`stepPhysics`), in the order measured. `reset` clears every
 * offset, velocity and lag, zeroes what remains and sets the constraint's
 * clock to now; it is also what a `reset` key does, while the animation is
 * applied — before the step's delta is added. Then:
 *
 * - `delta` is the clock since the constraint last read it (never below 0),
 *   added to what remains. A pending constraint takes the bone's origin as
 *   the one it follows and integrates nothing; what remains is kept.
 * - `x`, `y`: the offset gains `(previous origin − origin)·inertia`, held to
 *   `±limit·delta`. Then while at least one fixed `step` remains: `velocity
 *   += (wind·R − offset·strength)·massInverse·step` (`y`: `−= (gravity·R +
 *   offset·strength)·…`), `offset += velocity·step`, `velocity *=
 *   damping^(60·step)` (`damping` itself kept 268 of 400; exact at 60 fps,
 *   where the exponent is 1), and one step is taken off. What remains is
 *   carried to the next update (dropping it kept 116 of 400; integrating once
 *   per update at `dt` in place of `step` kept 116).
 * - The offset shown is `offset − lag·(1 − remaining/step)` (at least 0),
 *   `lag` the change the integration just made: the pose between two fixed
 *   steps (showing the integrated offset kept 116 of 400). The bone's origin
 *   moves by it times `mix` times the component.
 * - Rotation and shear follow the bone's tip: with `ca` the bone's x-axis
 *   angle and `(dx, dy)` how far its origin moved since the last update (each
 *   held to `±limit·delta`), the offset gains `atan2(dy + ty, dx + tx) − ca −
 *   (offset − lag·z₀)·w`, brought into (−π, π] with the runtime's π
 *   (3.1415927: `Math.PI` kept 369 of 400), times `inertia` — `(tx, ty)` the
 *   tip `length·(a, c)` the last update left, `w` the weight above, and `z₀`
 *   the SHOWN weight of the previous update: `1 − remaining/step` before
 *   this update's delta is added (after it kept 177 of 400; no lag at all
 *   kept 176). The spring then runs as for `x` with `−((wind·sin + gravity·
 *   cos)·length/R + offset·strength)·massInverse` — `sin`, `cos` of the
 *   shown angle, re-read after every step.
 * - `scaleX` follows the tip along the bone: the offset gains `(dx·cos +
 *   dy·sin)·inertia / r`, `r = length·|x column|`, and springs with `(wind·cos
 *   − gravity·sin − offset·strength)·massInverse`. ⚠️ With no rotation on,
 *   `r` is `length·|x column| − lag·z₀` — a dimensionless lag taken from a
 *   length. It is the measured reading, not a derived one: the plain `r`
 *   left scale-only probes off by a relative `(inertia step)·lag/length`
 *   (`1 − 0.00020008` on a 50-unit bone moved one unit a step, `5e-5` at 100
 *   units, `8e-4` at 25), and the subtraction made them exact (the plain `r`
 *   kept 357 of 400; with rotation on the plain `r` is the exact one).
 * - Applied last: the rotation `o = (offset − lag·z)·mix` turns both columns
 *   by `o·rotate`; with `shearX` on, the y column turns by `o·rotate` and
 *   the x column by `o·(rotate + shearX)` (the first reading turned the y
 *   column for the shear and read 0.049 off). The x column is scaled by `1 +
 *   (offset − lag·z)·mix·scaleX`. The tip `length·(a, c)` is kept for the next
 *   update.
 * - After it the bone is a world edit, as a world-space transform constraint
 *   leaves one: its local values read back (`localFromWorld`) and every bone
 *   below it posed again — so a constraint whose components are all 0 but
 *   whose `mix` is not still re-derives its bone.
 *
 * **referenceScale.** `R` above is the skeleton's `referenceScale`. A Spine
 * header stating 50 moved 30 of 50 wind-and-gravity probes, and moved none
 * without them. The model document states it (`referenceScale`, issue
 * #958): `readModel` refuses a document without it by name and stamps it on
 * every physics record (`CorePhysicsRecord.referenceScale`), which is what
 * the step reads. Until #958 the core read the parser's 100 as a constant.
 *
 * ## The timelines
 *
 * `inertia`, `strength`, `damping`, `mass`, `wind`, `gravity` and `mix`
 * keys, one channel each, construct 4's key search and curves (key times and
 * values float32), applied in the animation's order. Before the first key
 * the setup value; after it `setup + (value − setup)` — the blend at alpha 1,
 * not the value itself: the two differ by a unit in the last place, and a
 * mass probe (a parent thrown 3e11 units) and a two-constraint wind-and-mix
 * probe both read it (the value itself kept 400 of 400 in the population and
 * turned both probes red). A `mass` key states a mass: the pose holds
 * `1 / (m₀ + (value − m₀))`, `m₀ = 1 / massInverse`. A key omitting its
 * value reads 0, a `mix` key 1 (`docs/AUTHORING.md` §4.4; a first key with
 * no value, on each of the seven, read exact — the `mass` one NaN in both
 * dumps). The timeline that
 * names no constraint (`*`) writes every active constraint whose `…Global`
 * flag for that value is on, and resets every active constraint. A
 * slider's animation keys them too, at the slider's place in the update
 * order (issue #1049, `./constraints_slider.ts` *Its physics timelines*).
 *
 * **reset.** A `reset` key resets its constraints on the step whose apply
 * crosses it — a key in `(last, t]`, `last` the time the walk last applied
 * the animation at, −1 before the first (`resetCrossed`) — so once, as a
 * player crosses it (issue #960, measured against `Animation.apply(last,
 * t)` and against `AnimationState` with one track, which agreed to the bit:
 * `tools/pose_oracle.ts` §`--physics step`). Until issue #960 the oracle
 * applied the animation from 0 at every step, and this walk mirrored it: a
 * key reset its constraints at EVERY step from it on, holding the rig still
 * (ignoring the key, or firing it once, kept 278 of 400 under that
 * oracle). That
 * reading is rejected as a schedule no player runs; the core suite's `SC`
 * controls plant it and turn the probe red on the steps after the key.
 *
 * ## The environment (issue #1416)
 *
 * A constraint's `wind` and `gravity` are not forces: they are how strongly it
 * answers two directions the SKELETON carries — spine-core 4.3.13's
 * `Skeleton.windX, windY` and `gravityX, gravityY`, initially `1, 0` and `0,
 * 1` (`DEFAULT_PHYSICS_ENVIRONMENT`). The step weighs them as the runtime
 * does: for `x` and `y`, `ax = (wind·windX + gravity·gravityX)·R` and `ay =
 * (wind·windY + gravity·gravityY)·R`, `velocity += (ax − offset·strength)·…`
 * on `x` and `−= (ay + offset·strength)·…` on `y`; for the rotation and the
 * scale the same two sums without `R`, `(ax·sin + ay·cos)·length/R` and `ax·cos
 * − ay·sin` in place of the wind and gravity terms above. The skeleton's own
 * scale, which the runtime multiplies the `x` and `y` sums by, is 1 here. So
 * the environment's y points DOWN — `[0, 1]` pulls toward the bottom of the
 * screen — and with the initial values every expression is the one this file
 * computed before the environment existed: `wind·1 + gravity·0` is `wind` for
 * every finite `gravity` (a `wind` of −0 aside, which it reads as +0, as the
 * runtime does), and the render and emit bases did not move.
 *
 * The consumer sets it (`setEnvironment` on a live track, `./track.ts`), and
 * moves the rig from outside with `translatePhysics` and `rotatePhysics` —
 * `Skeleton.physicsTranslate` and `physicsRotate`, which shift what each
 * constraint last saw (`ux, uy, cx, cy`) so its next update reads the bone as
 * having moved. A constraint with no state yet is pending, and its first
 * update overwrites both, so it is left alone, as the runtime's translation of
 * it is read by nothing. The core suite's `CO56` holds all of it to spine-core
 * given the same values at tolerance 0, and `CO57` that nothing set poses what
 * was posed before.
 *
 * ## What is not exact, and why
 *
 * Over 3,000 random rigs of three shapes (all five inherit modes; ik and
 * transform among them; skin-required constraints; the timeline naming no
 * constraint) the step read exact on 2,986. The fourteen: three are wrong
 * under `--physics none` too (a transform collapsing its bone's scale, and
 * no step involved); one is a bone under an inactive parent, whose zero
 * matrix both dumpers take to NaN by different routes; the other ten are
 * last-bit differences upstream of the step, amplified by it — seven on a
 * bone in `noScale`, `noScaleOrReflection` or `noRotationOrReflection`,
 * whose world transform `./world.ts` reproduces to the grid but not to the
 * bit (a probe amplified a billion units read one of those modes a few
 * units in the last place on 61 of 61 samples, and the four other modes on
 * none), two after `localFromWorld` re-derived a bone the step then moves
 * again, and one under a constraint whose rotation weight is negative, where
 * the inertia pushes away and any difference grows. Each is exact with the
 * bones normal, or with the weight positive. The step itself holds no
 * residual found.
 *
 * ## Purity
 *
 * As the rest of the core: nothing from the Spine runtime package, nothing
 * from `src/transform.ts`, no clock, no randomness, no I/O.
 */
import { channelAt, keyIndexAt, poseAnimations, sampleTime, type CoreAnimationPose, type CoreCurve, type CoreKey, type SamplePhase, type TimelinePlant } from './animation.ts';
import { RUNTIME_PI, type CoreWorld } from './world.ts';

/** Degrees to radians as the runtime converts them (`MathUtils.degRad`, `pi / 180` with the runtime's pi). */
const RUNTIME_RAD = RUNTIME_PI / 180;
import { previousPassSlotBones, type CoreConstraintRecord } from './constraints.ts';
import { activeBones, type CompiledDocument } from './index.ts';

/** The fields a physics constraint's record may carry after `kind`, `name`, `declaredIn` — the rig branch of `buildRigConstraint` and the motion spec's physics table (`src/compile.ts`). */
export const PHYSICS_FIELDS = [
  'bone', 'scaleY', 'x', 'y', 'rotate', 'scaleX', 'shearX', 'limit', 'fps', 'inertia', 'strength', 'damping', 'mass', 'wind', 'gravity', 'mix',
  'inertiaGlobal', 'strengthGlobal', 'dampingGlobal', 'massGlobal', 'windGlobal', 'gravityGlobal', 'mixGlobal', 'skin',
] as const;
const PHYSICS_NUMBERS = ['x', 'y', 'rotate', 'scaleX', 'shearX', 'limit', 'fps', 'inertia', 'strength', 'damping', 'mass', 'wind', 'gravity', 'mix'] as const;
const PHYSICS_FLAGS = ['inertiaGlobal', 'strengthGlobal', 'dampingGlobal', 'massGlobal', 'windGlobal', 'gravityGlobal', 'mixGlobal', 'skin'] as const;
/** The `scaleY` modes, first letter in either case (the ik constraint's enum, which a physics constraint shares). */
const SCALE_Y_MODES = ['none', 'uniform', 'volume'] as const;

/** The five components a physics constraint drives, in the row's order. */
export const PHYSICS_COMPONENTS = ['x', 'y', 'rotate', 'scaleX', 'shearX'] as const;
/** The seven values its pose holds and its timelines key, in the row's order (`mass` as the key states it; the pose holds its inverse). */
export const PHYSICS_PARAMETERS = ['inertia', 'strength', 'damping', 'mass', 'wind', 'gravity', 'mix'] as const;
export type PhysicsParameter = (typeof PHYSICS_PARAMETERS)[number];
/** The timelines a physics constraint is keyed by: the seven values and `reset`. */
export const PHYSICS_TIMELINE_KINDS = [...PHYSICS_PARAMETERS, 'reset'] as const;
export type PhysicsTimelineKind = (typeof PHYSICS_TIMELINE_KINDS)[number];
/** The model's name for the timeline that names no constraint (`EVERY_GLOBAL_PHYSICS` in `src/motion.ts`). */
export const EVERY_GLOBAL_PHYSICS = '*';

/**
 * The parser's value for a field the record leaves out, measured off the
 * oracle's `physics` block for a constraint stating nothing (the header's
 * *Defaults*): every component 0, `limit` 5000, `fps` 60, `inertia` 0.5,
 * `strength` 100, `damping` 0.85, `mass` 1, `wind` and `gravity` 0, `mix` 1.
 */
export const PHYSICS_DEFAULTS = { x: 0, y: 0, rotate: 0, scaleX: 0, shearX: 0, limit: 5000, fps: 60, inertia: 0.5, strength: 100, damping: 0.85, mass: 1, wind: 0, gravity: 0, mix: 1 } as const;

/** The values a physics constraint's pose holds — what its timelines set and its step reads. */
export interface PhysicsPose {
  inertia: number;
  strength: number;
  damping: number;
  massInverse: number;
  wind: number;
  gravity: number;
  mix: number;
}

/** A physics constraint, read field by field: its bone, the components it drives, its settings and its setup pose. */
export interface CorePhysicsRecord extends PhysicsPose {
  kind: 'physics';
  name: string;
  bone: string;
  skin: boolean;
  /** An applied skin's `constraints.physics` list names it — what makes a skin-required constraint step (the header's *Which constraints step*); set per skin view by `underSkin` in `./index.ts`. */
  listedBySkin: boolean;
  x: number;
  y: number;
  rotate: number;
  scaleX: number;
  shearX: number;
  limit: number;
  /** `1 / fps`, the integrator's fixed step in seconds. */
  step: number;
  /** The skeleton's reference scale — the document's `referenceScale` (issue #958), which wind and gravity act over. */
  referenceScale: number;
  /** Each `…Global` flag, by the value it opts in to being driven by the timeline that names no constraint. */
  global: Record<PhysicsParameter, boolean>;
  scaleYMode: 'None' | 'Uniform' | 'Volume';
}

/**
 * A physics constraint's record, read field by field — every field the writer
 * can write for the kind and no other, each of its type, its bone a bone of
 * the document — or `undefined` with the problems named. A field left out
 * reads the parser's value (`PHYSICS_DEFAULTS`). `referenceScale` is the
 * document's, read by `readModel` (issue #958), and stamped on the record.
 */
export function readPhysicsRecord(raw: Record<string, unknown>, name: string, where: string, bones: ReadonlySet<string>, referenceScale: number, problems: string[]): CorePhysicsRecord | undefined {
  const before = problems.length;
  for (const key of Object.keys(raw)) {
    if (key === 'kind' || key === 'name' || key === 'declaredIn') continue;
    if (!(PHYSICS_FIELDS as readonly string[]).includes(key)) problems.push(`${where}: field "${key}" is not one this reader knows; it reads [${PHYSICS_FIELDS.join(', ')}]`);
  }
  if (typeof raw.bone !== 'string' || !bones.has(raw.bone)) problems.push(`${where}: bone is ${JSON.stringify(raw.bone)}, not a bone of this document`);
  for (const key of PHYSICS_NUMBERS) {
    const v = raw[key];
    if (v !== undefined && (typeof v !== 'number' || !Number.isFinite(v))) problems.push(`${where}: ${key} is ${JSON.stringify(v)}, not a finite number`);
  }
  for (const key of PHYSICS_FLAGS) {
    const v = raw[key];
    if (v !== undefined && typeof v !== 'boolean') problems.push(`${where}: ${key} is ${JSON.stringify(v)}, not a boolean`);
  }
  let scaleYMode: CorePhysicsRecord['scaleYMode'] = 'None';
  if (raw.scaleY !== undefined) {
    const folded = typeof raw.scaleY === 'string' && raw.scaleY.length > 0 ? raw.scaleY[0].toLowerCase() + raw.scaleY.slice(1) : '';
    if (!(SCALE_Y_MODES as readonly string[]).includes(folded)) problems.push(`${where}: scaleY is ${JSON.stringify(raw.scaleY)}, none of ${SCALE_Y_MODES.join(', ')}`);
    else scaleYMode = folded === 'uniform' ? 'Uniform' : folded === 'volume' ? 'Volume' : 'None';
  }
  if (problems.length !== before) return undefined;
  const n = (key: keyof typeof PHYSICS_DEFAULTS): number => (typeof raw[key] === 'number' ? (raw[key] as number) : PHYSICS_DEFAULTS[key]);
  const global = {} as Record<PhysicsParameter, boolean>;
  for (const p of PHYSICS_PARAMETERS) global[p] = raw[`${p}Global`] === true;
  return {
    kind: 'physics', name, bone: raw.bone as string, skin: raw.skin === true, listedBySkin: false,
    x: n('x'), y: n('y'), rotate: n('rotate'), scaleX: n('scaleX'), shearX: n('shearX'), limit: n('limit'), step: 1 / n('fps'), referenceScale,
    inertia: n('inertia'), strength: n('strength'), damping: n('damping'), massInverse: 1 / n('mass'), wind: n('wind'), gravity: n('gravity'), mix: n('mix'),
    global, scaleYMode,
  };
}

/** Whether a physics record steps under the skin view posed: its bone active, and not skin-required unless an applied skin lists it — measured, the header's *Which constraints step*. */
export function physicsActive(r: CorePhysicsRecord, active: ReadonlySet<string>): boolean {
  return (!r.skin || r.listedBySkin) && active.has(r.bone);
}

/** One physics timeline: the constraint it names (`EVERY_GLOBAL_PHYSICS` for none), what it keys, its keys (a `reset` key's `values` empty). */
export interface CorePhysicsTimeline {
  name: string;
  kind: PhysicsTimelineKind;
  keys: CoreKey[];
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * How many physics timelines one animation record's `constraints.physics`
 * holds — the census's count. Their key times also set the animation's
 * duration, which `./animation.ts` reads.
 */
export function physicsTimelineCount(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  let n = 0;
  for (const entry of value) {
    if (typeof entry === 'object' && entry !== null && Array.isArray((entry as { timelines?: unknown }).timelines)) n += (entry as { timelines: unknown[] }).timelines.length;
  }
  return n;
}

/**
 * One animation record's physics timelines, read in the record's order —
 * which is the order the runtime applies them in — each naming a declared
 * physics constraint or `EVERY_GLOBAL_PHYSICS`, each kind once per name, keys
 * strictly increasing in time with a finite `value` (absent: 1 for `mix`, 0
 * for the rest — the parser's reading) and a `reset` key a time alone.
 */
export function readPhysicsTimelines(value: unknown, label: string, declared: ReadonlySet<string>, problems: string[]): CorePhysicsTimeline[] {
  const out: CorePhysicsTimeline[] = [];
  if (!Array.isArray(value)) return out;
  value.forEach((entry, i) => {
    const at = `${label}.constraints.physics[${i}]`;
    if (!isObject(entry) || typeof entry.name !== 'string') {
      problems.push(`${at} names no physics constraint`);
      return;
    }
    const name = entry.name;
    if (name !== EVERY_GLOBAL_PHYSICS && !declared.has(name)) problems.push(`${at}: "${name}" is not a physics constraint of this document (nor "${EVERY_GLOBAL_PHYSICS}", the timeline naming none)`);
    if (!Array.isArray(entry.timelines)) {
      problems.push(`${at}: timelines is not a list`);
      return;
    }
    const seen = new Set<string>();
    entry.timelines.forEach((raw: unknown, j: number) => {
      const tat = `${at}.timelines[${j}]`;
      const kind = isObject(raw) ? PHYSICS_TIMELINE_KINDS.find((k) => k === raw.name) : undefined;
      if (!isObject(raw) || kind === undefined) {
        problems.push(`${tat}: ${JSON.stringify(isObject(raw) ? raw.name : raw)} is not a physics timeline; one keys ${PHYSICS_TIMELINE_KINDS.join(', ')}`);
        return;
      }
      if (seen.has(kind)) problems.push(`${tat}: "${kind}" is keyed twice on "${name}"`);
      seen.add(kind);
      const keys: CoreKey[] = [];
      const rawKeys: unknown = raw.keys;
      if (!Array.isArray(rawKeys) || rawKeys.length === 0) {
        problems.push(`${tat} "${kind}": keys is not a non-empty list`);
        return;
      }
      let last = -Infinity;
      rawKeys.forEach((k: unknown, q: number) => {
        const kat = `${tat} "${kind}".keys[${q}]`;
        if (!isObject(k)) {
          problems.push(`${kat} is not an object`);
          return;
        }
        const known = kind === 'reset' ? ['time'] : ['time', 'value', 'curve'];
        for (const f of Object.keys(k)) if (!known.includes(f)) problems.push(`${kat}: field "${f}" is not one this reader knows; it reads [${known.join(', ')}]`);
        const time = k.time;
        if (typeof time !== 'number' || !Number.isFinite(time) || time < 0) {
          problems.push(`${kat}: time is ${JSON.stringify(time)}, not a finite time at or after 0`);
          return;
        }
        if (time <= last) problems.push(`${kat}: time ${time} is not after the key before it — the writer refuses key times that do not strictly increase`);
        last = Math.max(last, time);
        if (kind === 'reset') {
          keys.push({ time: Math.fround(time), values: [], stated: { time, values: [] }, curve: 'stepped' });
          return;
        }
        let v = kind === 'mix' ? 1 : 0;
        if (k.value !== undefined) {
          if (typeof k.value !== 'number' || !Number.isFinite(k.value)) problems.push(`${kat}: value is ${JSON.stringify(k.value)}, not a finite number`);
          else v = k.value;
        }
        let curve: CoreCurve = 'linear';
        if (k.curve !== undefined) {
          if (q === rawKeys.length - 1) problems.push(`${kat}: the last key carries a curve, which eases to no key — the writer refuses it`);
          else if (k.curve === 'stepped') curve = 'stepped';
          else if (Array.isArray(k.curve) && k.curve.length === 4 && k.curve.every((c) => typeof c === 'number' && Number.isFinite(c))) curve = k.curve as number[];
          else problems.push(`${kat}: curve is ${JSON.stringify(k.curve)}, not "stepped" nor four finite numbers`);
        }
        keys.push({ time: Math.fround(time), values: [Math.fround(v)], stated: { time, values: [v] }, curve });
      });
      out.push({ name, kind, keys });
    });
  });
  return out;
}

/** What evaluates one channel of a key and finds the key — construct 4's unless a plant passes others. */
export interface PhysicsTimelinePlant {
  channel?: (keys: readonly CoreKey[], index: number, channel: number, t: number) => number;
  search?: (keys: readonly CoreKey[], t: number) => number;
}

/**
 * The records a physics timeline that names no constraint (`*`) writes: every
 * active one whose `…Global` flag for `kind` is on, and for `reset` every
 * active one (the header's *The timelines*), in the order given. `posedPhysics`
 * asks it, and so does the additive probe (`./additive.ts`, issue #1025).
 */
export function unnamedPhysicsTargets<R extends CorePhysicsRecord>(records: readonly R[], kind: PhysicsTimelineKind, active: (r: CorePhysicsRecord) => boolean): R[] {
  return records.filter((r) => active(r) && (kind === 'reset' || r.global[kind]));
}

/**
 * Every physics record posed by the animation's physics timelines at `t`, in
 * the timelines' order (the header's *The timelines*), and the names of the
 * constraints a `reset` key resets while the animation is applied from
 * `last` to `t` (`resetCrossed`). `active`
 * says whether a constraint is applied at all (its skin and its bone).
 */
export function posedPhysics(records: readonly CorePhysicsRecord[], timelines: readonly CorePhysicsTimeline[], t: number, last: number, active: (r: CorePhysicsRecord) => boolean, plant: PhysicsTimelinePlant = {}, wrapped = false): { records: Map<string, CorePhysicsRecord>; reset: Set<string> } {
  const search = plant.search ?? keyIndexAt;
  const channel = plant.channel ?? channelAt;
  const setupOf = new Map(records.map((r) => [r.name, r]));
  const posed = new Map(records.map((r) => [r.name, { ...r }]));
  const reset = new Set<string>();
  for (const tl of timelines) {
    const targets = tl.name === EVERY_GLOBAL_PHYSICS ? unnamedPhysicsTargets([...posed.values()], tl.kind, active) : [posed.get(tl.name) as CorePhysicsRecord].filter((r) => active(r));
    if (tl.kind === 'reset') {
      if (resetCrossed(tl.keys, last, t, wrapped)) for (const r of targets) reset.add(r.name);
      continue;
    }
    const i = search(tl.keys, t);
    for (const r of targets) {
      const setup = setupOf.get(r.name) as CorePhysicsRecord;
      if (tl.kind === 'mass') {
        // The key states a mass; the pose holds its inverse, and the setup the blend starts from is the inverse inverted.
        const from = 1 / setup.massInverse;
        r.massInverse = i < 0 ? setup.massInverse : 1 / (from + (channel(tl.keys, i, 0, t) - from));
      } else {
        r[tl.kind] = i < 0 ? setup[tl.kind] : setup[tl.kind] + (channel(tl.keys, i, 0, t) - setup[tl.kind]);
      }
    }
  }
  return { records: posed, reset };
}

/**
 * Whether a `reset` timeline resets its constraints when the animation is
 * applied from `last` to `t`, as a player applies it (the header's *reset*,
 * issue #960): exactly when a key lies in `(last, t]` — so a key is crossed
 * once, by the step that reaches it, and `last` is −1 before the walk's
 * first apply, where a key at 0 is crossed.
 *
 * `wrapped` is a looping track's step whose animation time went DOWN (issue
 * #1025, `./walk.ts`): the key crossed is then one after `last` or one at or
 * before `t` — `(last, ∞)` and `(−1, t]` — measured against spine-core's
 * `PhysicsConstraint.reset` calls on A10's walk. A step that wraps the track
 * one or more times while its animation time still rises is not `wrapped`:
 * the runtime fired only `(last, t]` there (a key at 0.25 of a 0.3 s
 * animation stepped by 0.7 s, crossed by the track twice between two applies
 * at 0.1 and 0.2, fired on neither).
 */
export function resetCrossed(keys: readonly CoreKey[], last: number, t: number, wrapped = false): boolean {
  return wrapped ? keys.some((k) => k.time > last || k.time <= t) : keys.some((k) => last < k.time && k.time <= t);
}

// ---------------------------------------------------------------------------
// the step
// ---------------------------------------------------------------------------

/** One physics constraint's state between two updates (the header's *The step*). */
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

/** The runtime's two phases the oracle steps with: `reset` resets the state first. */
export type PhysicsPhase = 'reset' | 'update';

/** What steps one constraint — `stepPhysics` unless a plant passes another. */
export type PhysicsStepper = (r: CorePhysicsRecord, w: CoreWorld, length: number, ctx: PhysicsStepContext) => boolean;

/** What a stepped pose carries into every physics constraint it applies. */
export interface PhysicsStepContext {
  phase: PhysicsPhase;
  /** The skeleton's clock: the sum of every step's delta so far. */
  time: number;
  /** Each constraint's state, by name, carried from update to update. */
  states: Map<string, PhysicsState>;
  /** The step itself; a control passes a planted copy. */
  step?: PhysicsStepper;
  /**
   * The animation time the walk last applied the animation at, −1 before its
   * first apply — a fresh track's `TrackEntry.animationLast`, read −1 on
   * spine-core 4.3.13 (issue #960). A `reset` key fires on an apply from it
   * to the step's time (`resetCrossed`).
   */
  last: number;
  /**
   * The walk's track loops (`./walk.ts`, issue #1025): a step whose animation
   * time went down from `last` wrapped, and crosses the keys `resetCrossed`
   * names for that. Absent on every walk but the looping one.
   */
  loop?: boolean;
  /** A plant only (issue #1049, `sliderPhysicsLastsOnePass: false`): what the sliders wrote on the step before, by constraint and field. */
  carried?: Map<string, Partial<Record<'inertia' | 'strength' | 'damping' | 'massInverse' | 'wind' | 'gravity' | 'mix', number>>>;
  /** Each `constraint/field` the step's own animation keys — what the planted carried write gives way to. */
  keyedNow?: Set<string>;
  /** A plant only (issue #1049, `sliderPhysicsFromCurrent: false`): each physics record's setup values, before the step's own animation. */
  setupRecords?: Map<string, CorePhysicsRecord>;
  /**
   * The world every constraint answers (issue #1416, the header's *The
   * environment*): the skeleton's wind and gravity directions, as a caller set
   * them on the live track. Absent, spine-core's own initial values
   * (`DEFAULT_PHYSICS_ENVIRONMENT`), which is every walk but a live one a
   * caller set it on.
   */
  env?: PhysicsEnvironment;
}

/**
 * The world a physics constraint answers (issue #1416): spine-core 4.3.13's
 * four skeleton fields `windX`, `windY`, `gravityX` and `gravityY`, as
 * `wind: [windX, windY]` and `gravity: [gravityX, gravityY]` — the
 * DIRECTIONS the constraints' own `wind` and `gravity` act along, which are
 * each constraint's response to them (the header's *The environment*). In the
 * runtime's convention: x to the right, **y down** — a positive y component
 * pulls a constraint toward the bottom of the screen, as `gravity: [0, 1]`
 * does.
 */
export interface PhysicsEnvironment {
  readonly wind: readonly [number, number];
  readonly gravity: readonly [number, number];
}

/** spine-core 4.3.13's initial `Skeleton.windX, windY, gravityX, gravityY` — `1, 0, 0, 1` — the world of every walk nobody set one on. */
export const DEFAULT_PHYSICS_ENVIRONMENT: PhysicsEnvironment = Object.freeze({ wind: Object.freeze([1, 0] as const), gravity: Object.freeze([0, 1] as const) });

/**
 * `Skeleton.physicsTranslate(x, y)` on the states in `ctx` (issue #1416): every
 * constraint's next update sees its bone moved by `(x, y)` in the skeleton's
 * world (y up) — the consumer moved the whole rig by that much since the last
 * pose. A constraint with no state yet has not been updated, and its first
 * update is pending, so the runtime's translation of it is read by nothing.
 */
export function translatePhysics(ctx: PhysicsStepContext, x: number, y: number): void {
  for (const s of ctx.states.values()) {
    s.ux -= x;
    s.uy -= y;
    s.cx -= x;
    s.cy -= y;
  }
}

/**
 * `Skeleton.physicsRotate(x, y, degrees)` on the states in `ctx` (issue
 * #1416): every constraint's next update sees its bone turned by `degrees`
 * (counter-clockwise, the runtime's pi) about `(x, y)` in the skeleton's world —
 * a translation of each constraint by how far that turn carries the origin it
 * last saw, as `PhysicsConstraint.rotate` computes it.
 */
export function rotatePhysics(ctx: PhysicsStepContext, x: number, y: number, degrees: number): void {
  const r = degrees * RUNTIME_RAD;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  for (const s of ctx.states.values()) {
    const dx = s.cx - x;
    const dy = s.cy - y;
    const tx = dx * cos - dy * sin - dx;
    const ty = dx * sin + dy * cos - dy;
    s.ux -= tx;
    s.uy -= ty;
    s.cx -= tx;
    s.cy -= ty;
  }
}

/** A constraint's state in `ctx`, created fresh on its first update. */
export function physicsState(ctx: PhysicsStepContext, name: string): PhysicsState {
  let s = ctx.states.get(name);
  if (s === undefined) {
    s = freshPhysicsState();
    ctx.states.set(name, s);
  }
  return s;
}

const PI2 = RUNTIME_PI * 2;
const INV_PI2 = 1 / PI2;

/** What a physics constraint's step moves, by its five component fields. */
export interface PhysicsDrives {
  x: boolean;
  y: boolean;
  /** `rotate` or `shearX` above 0: the two share the angular part of the step. */
  rotateOrShearX: boolean;
  scaleX: boolean;
}

/**
 * Which parts of the step a constraint drives: a component above 0 drives its
 * part and nothing else does — the test `stepPhysics` takes before each part
 * of *The step* above, posed against the runtime with the rest of it. Exported
 * because `src/ingest.ts` asks the same question of a raw file (a
 * constraint that drives none of the four moves no bone, issue #731) and
 * answers it through this function (issue #1015).
 */
export function physicsDrives(r: { x: number; y: number; rotate: number; shearX: number; scaleX: number }): PhysicsDrives {
  return { x: r.x > 0, y: r.y > 0, rotateOrShearX: r.rotate > 0 || r.shearX > 0, scaleX: r.scaleX > 0 };
}

/**
 * One physics constraint updated on its bone's world transform `w`
 * (mutated), `length` the bone's length — the header's *The step*, every
 * expression in the order measured. Returns false when its `mix` is 0: the
 * constraint then does nothing at all, its clock included, and the bone is
 * not re-posed.
 */
export function stepPhysics(r: CorePhysicsRecord, w: CoreWorld, length: number, ctx: PhysicsStepContext): boolean {
  const mix = r.mix;
  if (mix === 0) return false;
  const s = physicsState(ctx, r.name);
  const { x, y, rotateOrShearX, scaleX } = physicsDrives(r);
  const l = length;
  if (ctx.phase === 'reset') resetPhysicsState(s, ctx.time);
  const delta = Math.max(ctx.time - s.lastTime, 0);
  // The interpolation weight of the previous update, before this one's time is added: the rotate and the scale-only inertia read the pose as it was shown.
  const shown = Math.max(0, 1 - s.remaining / r.step);
  s.remaining += delta;
  s.lastTime = ctx.time;
  const bx = w.worldX;
  const by = w.worldY;
  const env = ctx.env ?? DEFAULT_PHYSICS_ENVIRONMENT;
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
        const ax = wind * env.wind[0] + g * env.gravity[0];
        const ay = wind * env.wind[1] + g * env.gravity[1];
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
      if (x) w.worldX += (s.xOffset - s.xLag * z) * mix * r.x;
      if (y) w.worldY += (s.yOffset - s.yLag * z) * mix * r.y;
    }
    if (rotateOrShearX || scaleX) {
      const ca = Math.atan2(w.c, w.a);
      let c = 0;
      let sn = 0;
      let mr = 0;
      let dx = s.cx - w.worldX;
      let dy = s.cy - w.worldY;
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
          rr = l * Math.sqrt(w.a * w.a + w.c * w.c);
          if (rr > 0) s.scaleOffset += ((dx * c + dy * sn) * i) / rr;
        }
      } else {
        c = Math.cos(ca);
        sn = Math.sin(ca);
        const rr = l * Math.sqrt(w.a * w.a + w.c * w.c) - s.scaleLag * shown;
        if (rr > 0) s.scaleOffset += ((dx * c + dy * sn) * i) / rr;
      }
      a = s.remaining;
      if (a >= t) {
        if (d === -1) d = Math.pow(r.damping, 60 * t);
        const m = r.massInverse * t;
        const e = r.strength;
        const ax = r.wind * env.wind[0] + r.gravity * env.gravity[0];
        const ay = r.wind * env.wind[1] + r.gravity * env.gravity[1];
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
  s.cx = w.worldX;
  s.cy = w.worldY;
  if (rotateOrShearX) {
    let o = (s.rotateOffset - s.rotateLag * z) * mix;
    let sn = 0;
    let c = 0;
    let a = 0;
    if (r.shearX > 0) {
      let rr = 0;
      if (r.rotate > 0) {
        // The rotation's share turns the y column here, and the x column with the shear below.
        rr = o * r.rotate;
        sn = Math.sin(rr);
        c = Math.cos(rr);
        a = w.b;
        w.b = c * a - sn * w.d;
        w.d = sn * a + c * w.d;
      }
      rr += o * r.shearX;
      sn = Math.sin(rr);
      c = Math.cos(rr);
      a = w.a;
      w.a = c * a - sn * w.c;
      w.c = sn * a + c * w.c;
    } else {
      o *= r.rotate;
      sn = Math.sin(o);
      c = Math.cos(o);
      a = w.a;
      w.a = c * a - sn * w.c;
      w.c = sn * a + c * w.c;
      a = w.b;
      w.b = c * a - sn * w.d;
      w.d = sn * a + c * w.d;
    }
  }
  if (scaleX) {
    const k = 1 + (s.scaleOffset - s.scaleLag * z) * mix * r.scaleX;
    w.a *= k;
    w.c *= k;
    // The transverse column follows the authored mode (issue #1453), after
    // the X column: the native Volume branch bounds reciprocal compression
    // below 0.7; it is not an area-preservation promise on that branch.
    if (r.scaleYMode === 'Uniform') {
      w.b *= k;
      w.d *= k;
    } else if (r.scaleYMode === 'Volume') {
      const magnitude = Math.abs(k);
      const transverse = magnitude >= 0.7 ? 1 / magnitude : 4 - 3.67347 * magnitude;
      w.b *= transverse;
      w.d *= transverse;
    }
  }
  s.tx = l * w.a;
  s.ty = l * w.c;
  return true;
}

/** The oracle's `physics` block written from the records, in constraint order, rounded as the oracle rounds. */
export function physicsRows(records: readonly CorePhysicsRecord[], round: (v: number) => number | null): Array<Record<string, unknown>> {
  return records.map((r) => ({
    name: r.name, bone: r.bone,
    x: round(r.x), y: round(r.y), rotate: round(r.rotate), scaleX: round(r.scaleX), shearX: round(r.shearX), limit: round(r.limit), step: round(r.step),
    inertia: round(r.inertia), strength: round(r.strength), damping: round(r.damping), massInverse: round(r.massInverse), wind: round(r.wind), gravity: round(r.gravity), mix: round(r.mix),
    inertiaGlobal: r.global.inertia, strengthGlobal: r.global.strength, dampingGlobal: r.global.damping, massGlobal: r.global.mass, windGlobal: r.global.wind, gravityGlobal: r.global.gravity, mixGlobal: r.global.mix,
    skinRequired: r.skin, scaleYMode: r.scaleYMode,
  }));
}

// ---------------------------------------------------------------------------
// the walk
// ---------------------------------------------------------------------------

/**
 * One step's constraint records: every physics record posed by the
 * animation's physics timelines at `t` (`posedPhysics`), and each constraint
 * a `reset` key resets reset now — while the animation is applied, before
 * the skeleton's clock moves to this step (`before` is the clock it reads;
 * the header's *reset*). `./animation.ts` calls it for every step of the walk.
 */
export function stepPhysicsRecords(records: readonly CoreConstraintRecord[], keyed: readonly CorePhysicsTimeline[], t: number, active: ReadonlySet<string>, ctx: PhysicsStepContext, before: number): CoreConstraintRecord[] {
  const physics = records.filter((r): r is CorePhysicsRecord => r.kind === 'physics');
  const posed = posedPhysics(physics, keyed, t, ctx.last, (r) => physicsActive(r, active), {}, ctx.loop === true && t < ctx.last);
  ctx.last = t;
  ctx.setupRecords = new Map(physics.map((r) => [r.name, r]));
  ctx.keyedNow = new Set(keyed.flatMap((tl) => (tl.kind === 'reset' ? [] : (tl.name === EVERY_GLOBAL_PHYSICS ? unnamedPhysicsTargets(physics, tl.kind, (r) => physicsActive(r, active)).map((r) => r.name) : [tl.name]).map((n) => `${n}/${tl.kind === 'mass' ? 'massInverse' : tl.kind}`))));
  for (const name of posed.reset) resetPhysicsState(physicsState(ctx, name), before);
  return records.map((r) => (r.kind === 'physics' ? (posed.records.get(r.name) as CorePhysicsRecord) : r));
}

/** A fresh step context for one animation's walk (or the setup's reset), the plant's step in place of `stepPhysics` when a control passes one. */
export function freshStepContext(step?: PhysicsStepper): PhysicsStepContext {
  return { phase: 'reset', time: 0, states: new Map(), last: -1, ...(step ? { step } : {}) };
}

/**
 * Why the samples' bones are left out under the step, or null: a path
 * constraint whose offset reads its slot bone from the previous pose, which
 * is then the previous step's — a pose the walk does not carry.
 */
export function steppedPreviousPassWhy(doc: CompiledDocument): string | null {
  const reads = previousPassSlotBones(doc, activeBones(doc));
  return reads.length === 0 ? null : `${reads.map((r) => `path constraint "${r.constraint}" reads slot bone "${r.bone}" from the previous pose`).join('; ')} — under the step the previous pose is the previous step's, which the stepped walk does not carry`;
}

/**
 * The oracle's schedule (the header's *The schedule*): for each of the `n`
 * samples of an animation of duration `d` under `phase`, the times the walk
 * steps to after the sample before it — from the previous sample's time `p`
 * (0 before the first), `p + k·dt` for `k = 1, 2, …` while that is before
 * the sample's `t`, then `t` itself unless the walk is already there. The
 * walk starts at 0 with the reset, so a sample at 0 takes no step.
 */
export function stepSchedule(phase: SamplePhase, d: number, n: number, dt: number): number[][] {
  const out: number[][] = [];
  let now = 0;
  for (let i = 0; i < n; i++) {
    const t = sampleTime(phase, d, i, n);
    const from = now;
    const steps: number[] = [];
    for (let k = 1; from + k * dt < t; k++) steps.push(from + k * dt);
    if (steps.length > 0) now = steps[steps.length - 1];
    if (t > now) {
      steps.push(t);
      now = t;
    }
    out.push(steps);
  }
  return out;
}

/**
 * Every animation of the document walked as the oracle's `--physics step
 * --dt <dt>` walks it (the header's *The schedule*) — `poseAnimations` in
 * `./animation.ts` given `dt`, which poses every block of each sample off
 * the last step's pose — and the steps the schedule takes to reach each
 * sample, per animation.
 */
export function poseSteppedAnimations(doc: CompiledDocument, phase: SamplePhase, n: number, dt: number, plant: TimelinePlant = {}): { animations: CoreAnimationPose[]; absent: Array<[string, string]>; steps: number[][] } {
  const posed = poseAnimations(doc, phase, n, plant, dt);
  return { ...posed, steps: doc.animations.map((a) => stepSchedule(phase, a.timelines.duration, n, dt).map((x) => x.length)) };
}
