/**
 * A group track's **per-member** values, evaluated from a model the spec states.
 *
 * ## Why this module exists
 *
 * `groups` keys several bones **identically**, which is the right tool for a
 * wheel pair and the wrong one for a face: on a face the whole content of the
 * motion is that each part gets a *different* number. `gallery/portrait`'s held
 * 12° yaw was **20 tracks**, sixteen of them the same two properties on six
 * sibling bones with identical times, identical easings and six different
 * values — so `groups` bought exactly one of the sixteen, the pair that happened
 * to share `cos t` (issue #295).
 *
 * And not one of those numbers was a judgement either. Each feature's own
 * `translatex` is `x·(cos t − 1) − (z − R)·sin t` and its `scalex` is
 * `cos(α − t)/cos α` — docs/FACE.md §3 and §5 derive both, and the *only* free
 * parameter per member is its **depth**. So this is `src/deformgen.ts`'s move on
 * the bone half of the same turn: **the spec states the model and the compiler
 * states the numbers.**
 *
 * ⭐ **The depth table is the point, not the line count.** FACE §2's sharp edge
 * is that `x` is in the file and `z` is not — `grep -c '"z"'` over the worked
 * example's two specs returned `0` and `0`, and every depth that produced every
 * number lived only in a README beside them. A `derive` key states each
 * member's depth, so the table a reader needs in order to check a sign is in the
 * file that uses it.
 *
 * ## What this is NOT, and the rules that keep it that way
 *
 * 1. **It never authors.** Every parameter arrives from the spec — the angle,
 *    each member's depth, what the parent already carries. The one number read
 *    off the rig is the member bone's own **setup position**, which is the same
 *    licence `evaluateDeformTransform` has to read an attachment's setup
 *    vertices: it is a coordinate the spec already states, resolved by name.
 * 2. **It generates no in-betweens.** MOTION §7 refuses a `rigc tween`. A model
 *    is evaluated **at one key**, from parameters that key states, and what
 *    happens between two keys is still the timeline's own curve. Sweeping an
 *    angle is editing one number per key.
 * 3. **It does not do timing.** `stagger` already shifts a member's keys in
 *    member order (AUTHORING §4.3), so nothing here takes a phase, an index or
 *    a delay. Two mechanisms for one lag would mean two places to look for it.
 * 4. **It is one closed form per kind, named and refusable.** There is no
 *    expression language here and no `v` that is a formula string: a kind the
 *    compiler does not know is refused *by name*, which is the whole reason a
 *    reviewer can check a claim.
 *
 * ## Determinism
 *
 * Each closed form is a fixed sequence of float64 operations over numbers read
 * from the spec, evaluated in **member order** — the group's own array order,
 * never an iteration over an unordered set. The caller quantises with the
 * compiler's `onModelGrid` — the model's 1e-6 resolution, then the float32 name
 * every emitted number takes — so the same spec emits the same bytes and
 * `A18_DETERMINISTIC_EMIT` proves it on a second independent compile.
 */

import { CompileError } from './errors.ts';

/** The kinds this module evaluates, in the order the docs list them. */
export const TRACK_DERIVE_KINDS = ['yaw', 'pitch'] as const;

export type TrackDeriveKind = (typeof TRACK_DERIVE_KINDS)[number];

/**
 * A **2.5D turn**, read per member instead of per vertex.
 *
 * The members are treated as rigid parts sitting on a surface that turns about
 * one axis, and the key is that rotation projected back onto the screen. `yaw`
 * stands the axis vertically and reads each member's setup `x`; `pitch` lays it
 * horizontally and reads `y`. docs/FACE.md §3 is the displacement's derivation
 * and §5 the foreshortening's.
 *
 * ⚠️ **`depth` is a decision, not a measurement.** FACE §2: a depth is not
 * readable off the art — it is a statement about a shape the drawing only
 * implies. Derive its *sign* from the draw order and argue only about the size.
 */
export interface TrackDeriveTurn {
  kind: TrackDeriveKind;
  /** The turn, in degrees. Positive yaws toward −x, which is FACE §1's sign. */
  degrees: number;
  /**
   * Each member's depth: `{ member: z }` on a group track, one number on a bone
   * track. `z` runs **toward the viewer** (FACE §1), so a **larger** depth is
   * **nearer** — a nose in front of the skull surface takes a bigger number than
   * the socket beside it — and a **negative** depth is behind the axis, which is
   * what makes the back of a head swing the other way (FACE §2).
   *
   * ⚠️ That sign is the one thing here no assertion can check, and this comment
   * had it backwards until issue #350's neighbour
   * ([#351](https://github.com/rig-c/core/issues/351)). The closed form is
   * the arbiter: `d = (x−about)·(cos t − 1) − (depth − carried)·sin t` gives a
   * part with `depth > carried` a **negative** residual, and FACE §3 makes
   * exactly that the nose diagnostic — *if the nose's residual is not negative,
   * the depths are wrong*. That only holds if a larger depth means nearer.
   */
  depth: number | Record<string, number>;
  /**
   * The depth whose shift a **parent bone already applies**. Default 0.
   *
   * ⭐ This is FACE §3's shared-shift split, stated. Put a bone at the plate's
   * own origin, key `−carried·sin t` there, and each member then keys only what
   * is left: `x·(cos t − 1) + (carried − z)·sin t`. A residual is 1–6 units
   * where a total is 30–40, and **that is an auditing decision before it is a
   * rigging one** — nobody can eyeball a wrong sign in the second and everybody
   * can in the first.
   *
   * 0 means the parent carries nothing, which is the honest reading for a part
   * hanging off the head itself rather than off the shared-shift bone. It is
   * deliberately not named for the surface it usually is: `surface: 0` would
   * claim a skull surface at depth 0, and what the number means is *what has
   * already been applied*.
   */
  carried?: number;
  /** Where the axis crosses the driving coordinate, in the members' shared parent's space. Default 0. */
  about?: number;
  /**
   * Whether the displacement includes the foreshortening of the member's setup
   * position `(at − about)·(cos t − 1)`. Default `true`.
   *
   * When `false`, the displacement is `−(depth − carried)·sin t` — the depth
   * shift alone, for a rig whose plate proportions are held at their front-view
   * width across the turn (issue #1584). Valid on the displacement projection
   * (`translatex` / `translatey`) only; refused on the foreshortening projection
   * (`scalex` / `scaley`).
   */
  narrowing?: boolean;
}

export type TrackDerive = TrackDeriveTurn;

/**
 * Which bone property each kind projects onto, and which setup coordinate it
 * reads.
 *
 * ⭐ **The property picks the projection.** A turn does two things to a part
 * sitting on a curved surface — it moves it, and it narrows it — and those are
 * two Spine timelines rather than two models. So the track's `property`, which
 * the author has already stated, says which half of the same turn this key is;
 * a property the kind has no projection onto is refused by name rather than
 * quietly driven by the wrong half.
 */
export const TRACK_DERIVE_PROJECTIONS: Record<
  TrackDeriveKind,
  { coordinate: 'x' | 'y'; shift: string; foreshorten: string }
> = {
  yaw: { coordinate: 'x', shift: 'translatex', foreshorten: 'scalex' },
  pitch: { coordinate: 'y', shift: 'translatey', foreshorten: 'scaley' },
};

/** One member, as the compiler resolved it against the rig. */
export interface TrackDeriveMember {
  /** The bone's name. */
  name: string;
  /** Its setup coordinate on the kind's driving axis, in its parent's space. */
  at: number;
}

/** One evaluated member row, for `explain` to print and a reviewer to check. */
export interface TrackDeriveMemberValue {
  member: string;
  /** The setup coordinate read off the rig, already relative to `about`. */
  at: number;
  /** The depth the spec stated for this member. */
  depth: number;
  /** The emitted value, quantised by the caller's rounder. */
  value: number;
}

/**
 * What one evaluation did.
 *
 * `stated` is the spec's own parameters, `derived` the scalars the closed form
 * got out of them, and `members` the per-member rows in member order — the
 * three things that let somebody re-derive a row by hand. The values are the
 * **emitted** ones, so the report and the artifact cannot disagree (the same
 * rule `DeformTransformReport` holds to, and issue #319's `DEFORM` block reads
 * that report rather than recomputing it).
 */
export interface TrackDeriveReport {
  kind: TrackDeriveKind;
  /** Which half of the turn this key is: the displacement or the foreshortening. */
  projection: 'shift' | 'foreshorten';
  /** The model as the spec states it. */
  stated: string;
  /** The closed form, written out. */
  formula: string;
  /** The scalars the closed form derived, e.g. `sin t = 0.207912`. */
  derived: string[];
  members: TrackDeriveMemberValue[];
}

/** The compiler's `onModelGrid` (1e-6, then float32), passed in so the quantiser stays in one place. */
export type Rounder = (n: number) => number;

/**
 * Evaluate one `derive` over a track's members.
 *
 * `members` arrive in the group's own declared order, each with the setup
 * coordinate the kind reads. The caller owns resolving those against the rig and
 * refusing the cases where they do not mean one thing — by the time execution
 * reaches here every `at` is measured from the same origin.
 *
 * Returns one value per member, in the same order, plus the report.
 */
export function evaluateTrackDerive(
  derive: TrackDerive,
  property: string,
  members: readonly TrackDeriveMember[],
  round: Rounder,
  where: string,
): TrackDeriveReport {
  if (derive === null || typeof derive !== 'object' || Array.isArray(derive)) {
    throw new CompileError(`${where}: "derive" is ${JSON.stringify(derive)}; it is an object with a "kind"`, 'CE_TRACK_DERIVE_OBJECT');
  }
  const kind = (derive as { kind?: unknown }).kind;
  if (typeof kind !== 'string' || !(TRACK_DERIVE_KINDS as readonly string[]).includes(kind)) {
    throw new CompileError(
      `${where}: "derive" has kind ${JSON.stringify(kind)}; this spec evaluates ${TRACK_DERIVE_KINDS.join(', ')}. ` +
        'A model that is none of those is still authorable as a per-member "v" map, or as one track per member.', 'CE_TRACK_DERIVE_KIND',
    );
  }
  const turn = derive as TrackDeriveTurn;
  const projections = TRACK_DERIVE_PROJECTIONS[kind as TrackDeriveKind];
  const projection: 'shift' | 'foreshorten' =
    property === projections.shift ? 'shift' : property === projections.foreshorten ? 'foreshorten' : refuseProperty(kind, property, where);

  const degrees = num(turn.degrees, 'degrees', where);
  const about = turn.about === undefined ? 0 : num(turn.about, 'about', where);
  // `carried` is subtracted from a depth, and the foreshortening does not read a
  // depth difference at all — it reads the member's own angle off the axis. So a
  // `carried` here changes nothing, and a parameter that changes nothing is a
  // reader's false lead about which model produced the numbers.
  if (projection === 'foreshorten' && turn.carried !== undefined) {
    throw new CompileError(
      `${where}: derive ${kind} states carried=${JSON.stringify(turn.carried)} on a "${property}" track, and the ` +
        'foreshortening reads no depth difference — it is cos(α − t)/cos α, where α is the member\'s own angle off the ' +
        `axis. "carried" belongs on the "${projections.shift}" track, whose shared shift is the thing it names.`, 'CE_TRACK_CARRIED_PROJECTION',
    );
  }
  if (projection === 'foreshorten' && turn.narrowing !== undefined) {
    throw new CompileError(
      `${where}: derive ${kind} states narrowing=${JSON.stringify(turn.narrowing)} on a "${property}" track, and a ` +
        `"${property}" track IS the foreshortening — its whole output is cos(α − t)/cos α. "narrowing" belongs on the ` +
        `"${projections.shift}" track, where it drops (${projections.coordinate}−about)·(cos t − 1) from the displacement; ` +
        `to turn without narrowing the plate's scale, omit the "${property}" track.`, 'CE_TRACK_NARROWING_PROJECTION',
    );
  }
  const carried = turn.carried === undefined ? 0 : num(turn.carried, 'carried', where);
  const narrowing = turn.narrowing !== false;

  const rad = (degrees * Math.PI) / 180;
  const cosMinus1 = Math.cos(rad) - 1;
  const sin = Math.sin(rad);

  const values: TrackDeriveMemberValue[] = [];
  for (const member of members) {
    const depth = depthOf(turn.depth, member.name, members, where, kind);
    const u = member.at - about;
    if (projection === 'shift') {
      values.push({ member: member.name, at: u, depth, value: round((narrowing ? u * cosMinus1 : 0) - (depth - carried) * sin) });
      continue;
    }
    // A part behind the axis has no patch of front surface to foreshorten, and
    // `atan2(u, z)` there is an angle measured round the back — so the closed
    // form would silently evaluate a different model. Refused by name, which is
    // also FACE §2's "derive the sign from the draw order" as a check.
    if (depth <= 0) {
      throw new CompileError(
        `${where}: derive ${kind} projects onto "${property}" and member "${member.name}" states depth ${depth}. ` +
          'Foreshortening is cos(α − t)/cos α with α = atan2(coordinate, depth), which needs the part to be IN FRONT ' +
          'of the axis; at or behind it there is no front surface to narrow. A part behind the axis still takes the ' +
          `"${projections.shift}" projection, where a negative depth is exactly what swings it the other way.`, 'CE_TRACK_FORESHORTEN_DEPTH',
      );
    }
    const alpha = Math.atan2(u, depth);
    const scale = Math.cos(alpha - rad) / Math.cos(alpha);
    if (scale <= 0) {
      throw new CompileError(
        `${where}: derive ${kind} turns member "${member.name}" (${projections.coordinate}=${u}, depth=${depth}) past ` +
          `its own edge: α = ${round(alpha)} rad and the turn is ${round(rad)} rad, so cos(α − t) is ` +
          `${round(Math.cos(alpha - rad))} and the scale would be ${round(scale)}. A scale at or below 0 mirrors the ` +
          'drawing rather than narrowing it. The part has turned edge-on — the turn is past what this construction ' +
          'carries, and FACE §8 is the page that picks a construction from the angle.', 'CE_TRACK_FORESHORTEN_EDGE_ON',
      );
    }
    values.push({ member: member.name, at: u, depth, value: round(scale) });
  }

  const c = projections.coordinate;
  const stated =
    `degrees=${degrees}` +
    (projection === 'shift' && turn.carried !== undefined ? ` carried=${carried}` : '') +
    (turn.about === undefined ? '' : ` about=${about}`) +
    (projection === 'shift' && !narrowing ? ' narrowing=false' : '');
  const formula =
    projection === 'shift'
      ? narrowing
        ? `d${c} = (${c}−about)·(cos t − 1) − (depth − carried)·sin t`
        : `d${c} = −(depth − carried)·sin t`
      : `scale${c.toUpperCase()} = cos(α − t) / cos α,   α = atan2(${c}−about, depth)`;
  const derived =
    projection === 'shift'
      ? [
          `t = ${round(rad)} rad`,
          ...(narrowing ? [`cos t − 1 = ${round(cosMinus1)}`] : []),
          `sin t = ${round(sin)}`,
          `shift the parent carries = −carried·sin t = ${round(-carried * sin)}`,
        ]
      : [`t = ${round(rad)} rad`, `cos t = ${round(Math.cos(rad))}, which is the value on the axis (α = 0)`];

  return { kind: kind as TrackDeriveKind, projection, stated, formula, derived, members: values };
}

/**
 * The property refusal, as its own function so the message can list both
 * projections rather than only the one that missed.
 */
function refuseProperty(kind: string, property: string, where: string): never {
  const p = TRACK_DERIVE_PROJECTIONS[kind as TrackDeriveKind];
  throw new CompileError(
    `${where}: derive ${kind} has no projection onto "${property}". It projects onto "${p.shift}" (the displacement, ` +
      `FACE §3) and "${p.foreshorten}" (the narrowing, FACE §5), and onto nothing else — a turn about one axis moves ` +
      `nothing along it, so a paired "translate"/"scale" would need a second channel this model does not state. ` +
      'State the axis, or write the values as a per-member "v" map.', 'CE_TRACK_PROPERTY_PROJECTION',
  );
}

/**
 * One member's depth, from either shape of the field.
 *
 * A group track's `depth` is a map and a bone track's is one number, and each
 * refuses the other's shape: a map on a bone track names members that track has
 * no way to reach, and a number on a group track is the shared value `groups`
 * already keys without any of this (issue #295's own starting point).
 */
function depthOf(
  depth: unknown,
  member: string,
  members: readonly TrackDeriveMember[],
  where: string,
  kind: string,
): number {
  if (typeof depth === 'number') {
    if (members.length !== 1) {
      throw new CompileError(
        `${where}: derive ${kind} states one depth ${depth} for ${members.length} members ` +
          `(${members.map((m) => m.name).join(', ')}). One number for every member is the shared value a plain "v" ` +
          'already keys — state a depth per member, as { "member": z, … }.', 'CE_TRACK_GROUP_SHARED_DEPTH',
      );
    }
    return num(depth, 'depth', where);
  }
  if (depth === null || typeof depth !== 'object' || Array.isArray(depth)) {
    throw new CompileError(
      `${where}: derive ${kind} has depth ${JSON.stringify(depth)}; it is a number on a bone track and ` +
        '{ "member": z, … } on a group track', 'CE_TRACK_DEPTH_SHAPE',
    );
  }
  const table = depth as Record<string, unknown>;
  const stated = Object.keys(table);
  const known = new Set(members.map((m) => m.name));
  for (const name of stated) {
    if (!known.has(name)) {
      throw new CompileError(
        `${where}: derive ${kind} states a depth for "${name}", which this track does not key ` +
          `(its members are: ${members.map((m) => m.name).join(', ')})`, 'CE_TRACK_DEPTH_MEMBER_UNKNOWN',
      );
    }
  }
  if (!(member in table)) {
    throw new CompileError(
      `${where}: derive ${kind} states no depth for member "${member}" ` +
        `(it states: ${stated.length ? stated.join(', ') : 'nothing'}). ` +
        'A depth is refused rather than defaulted: a member silently at depth 0 would be keyed with a DIFFERENT ' +
        'model from the ones beside it, and that is exactly the error a table of six is written to make visible.', 'CE_TRACK_DEPTH_MEMBER_REQUIRED',
    );
  }
  return num(table[member], `depth.${member}`, where);
}

/** One required finite number, refused by field name rather than compiled as a NaN. */
function num(value: unknown, field: string, where: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new CompileError(`${where}: derive field "${field}" is ${JSON.stringify(value)}; it is a finite number the spec has to state`, 'CE_TRACK_FIELD_NUMBER_FINITE');
  }
  return value;
}
