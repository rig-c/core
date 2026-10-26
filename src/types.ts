/**
 * Input and output shapes for rigc.
 *
 * Three inputs, one domain each:
 *   - the cut manifest, which owns measured geometry: crop, part offsets, part sizes, mask
 *     polygons, the state machine, anchors, the axis and the measured ceilings.
 *     Optional — a foreign skeleton has none;
 *   - the **rig spec** ([`src/rig.ts`](rig.ts), `spec: "rigc-rig/1"`), which owns
 *     skeleton structure: bones, slots, skins, constraints, invariants. Required.
 *     It replaced the three hard-coded archetype tables that used to be code;
 *   - the motion spec, which owns time: keys, named
 *     easings, groups, declared durations.
 *
 * Nothing else is an input, and the compiler never invents a value that is in
 * none of them.
 */
import type { AtlasRegion } from './atlas.ts';
import type { DeformTransform, DeformTransformReport } from './deformgen.ts';
import type { TurnCeiling } from './depth.ts';
import type { SpecEnumTable, SpecTypeRow } from './keys.ts';
import type { MeshKind } from './mesh.ts';
import type { CompiledModel } from './model.ts';
import type { TrackDerive, TrackDeriveReport } from './trackgen.ts';

// ---------------------------------------------------------------------------
// Cut manifest (face class)
// ---------------------------------------------------------------------------

/**
 * Mesh declaration for a part — geometry, so it belongs to the manifest and not
 * to the motion spec. It says WHERE the deformable ring
 * is; the motion spec says WHEN it moves, by keying the control bone.
 */
export interface FaceManifestMesh {
  /**
   * Which generator builds this mesh. Absent means `ring`, so every manifest
   * written before the joint archetype keeps its meaning.
   *
   *   ring   — three concentric rings + a hub. The outer two are pinned (region
   *            border, then mask contour) and only the aperture ring moves.
   *   ribbon — a two-wide strip along a bone chain. Length changes, width does
   *            not, because paired vertices carry identical weights.
   */
  kind?: 'ring' | 'ribbon';
  /** Ring only. The part's own mask polygon, which is the seam. */
  hull?: 'polygon';
  /** Ring only. Aperture centre in CROP pixels (y down) — measured, not guessed. */
  center?: [number, number];
  /** Ring only. Inner ring position between centre (0) and hull (1). */
  inner?: number;
  /**
   * Ring only, legacy form: ONE control bone which the compiler CREATES as a
   * child of the slot bone. Used by archetypes that have no explicit bone tree.
   */
  control_bone?: string;
  /**
   * Control bones that already exist in the archetype's bone tree — the ring's
   * authority is split between them by angular position, so a four-grip ring
   * can expand asymmetrically without a key per vertex.
   */
  control_bones?: string[];
  /** Ribbon only. Number of cross rows; triangles = 2 * (rows - 1). */
  rows?: number;
  /** Ribbon only. The bone chain the strip rides, root first. */
  chain?: string[];
  /**
   * Directional weighting. Without it the ring deforms symmetrically about the
   * centre, which moves the upper lip and the upper teeth along with the jaw —
   * anatomically wrong, and the owner spotted it on the first review.
   *
   * `axis_deg` is the mouth line measured on the art (screen degrees, y down).
   * `ramp` is the signed distance across that axis, in part pixels, over which
   * control authority goes 0 -> 1; positive is the jaw side.
   */
  bias?: { axis_deg: number; ramp: [number, number]; note?: string };
}

export interface FaceManifestPart {
  slot: string;
  /**
   * The archetype slot this part joins on, when it differs from `slot`.
   *
   * ⚠️ A cut manifest is often ALSO the record of the pipeline that generated
   * the art, and that pipeline names parts after what they depict while a rig
   * names them after the role they play. The rig's slot table has to stay
   * single-valued — the runtime, the tooling and A26 all join on the emitted slot
   * name, and a second alias for one slot is how a slot vanishes with no error.
   * So the manifest carries the mapping and `slot` keeps meaning what its author
   * meant. Absent = the two are the same name.
   */
  rig_slot?: string;
  draw_order: number;
  /**
   * Base plate only: the unmodified crop. Explicit `null` (with no `states`)
   * means the manifest is recording a part this cut does NOT carry, and the
   * compiler skips it and reports the absence.
   */
  image?: string | null;
  /** Top-left of the part window in crop pixels, y down. */
  offset: [number, number];
  /** Part window size in pixels. Absent on the base plate (= the crop size). */
  size?: [number, number];
  /** Which key of `state_machine` drives this slot. */
  state_key?: string;
  /** state name -> PNG path relative to the manifest, or null for "base pixels". */
  states?: Record<string, string | null>;
  /** Mask polygon in CROP pixels (y down). Required when `mesh` is present. */
  polygon?: Array<[number, number]>;
  /** Promote this part's attachments from regions to ring meshes. */
  mesh?: FaceManifestMesh;
}

export interface FaceManifest {
  schema: string;
  crop: { x: number; y: number; w: number; h: number; resample: string };
  base: string;
  /** Overlay archetypes only; the joint archetype has no per-slot state list. */
  state_machine?: Record<string, string[]>;
  parts: FaceManifestPart[];

  // -- articulated-cut fields ------------------------------------------------
  /**
   * Entry point in crop pixels, y down — the origin of the cut's axis frame.
   */
  insertion?: [number, number];
  /**
   * ⭐ The one value a new cut of this archetype changes.
   * `deg` is SCREEN degrees, y down, the same convention as `mesh.bias.axis_deg`;
   * the compiler negates it into Spine's y-up CCW rotation. `unit` is the same
   * direction as a vector and is cross-checked against `deg`, because a manifest
   * that disagrees with itself is the cheapest bug to catch and the worst to
   * debug later.
   */
  axis?: { deg: number; unit: [number, number] };
  /**
   * One-way stroke amplitude in axis pixels, the extension the plate covers, and
   * the DERIVED ceiling on inward travel.
   *
   * 🎯 `contact_depth` is the owner's rule of 2026-08-22 made mechanical: the
   * swallow goes at most until the inserting mass touches the occluder. It is a
   * MEASURED fact about two plates (rigc/tools/contact.ts), so it belongs in the
   * manifest for exactly the reason `mesh.center` does — the compiler never
   * re-measures art. Assertion A29 holds every animation to it.
   */
  stroke?: {
    amplitude?: number;
    extension?: number;
    contact_depth?: number | null;
    /**
     * 🎯 The second, independent ceiling on inward travel: the deepest insert at
     * which the moving part's cap contour is still entirely inside the occluder's
     * opaque footprint. Past it the cap is DRAWN where it should be swallowed.
     *
     * It is not a restatement of `contact_depth`. Contact asks when two masses
     * collide; containment asks when the drawn flesh runs out of patch to hide
     * behind — and a cut can have one without the other. The real tier-2 cut has
     * exactly that shape: no contact ceiling at all, and a containment ceiling of
     * 118px. Measured, like every other art fact in this file. Assertion A30.
     */
    cap_containment_ceiling?: number | null;
  };
  /** ROI box, recorded for provenance; the compiler does not read it. */
  roi?: { x: number; y: number; w: number; h: number };
  /**
   * Bone positions in crop pixels, y down: `[x, y]`, or `[x, y, facing_deg]`
   * where the third element is a SCREEN-space facing angle that becomes the
   * bone's setup rotation. A grip whose local +X points radially outward turns
   * "expand the ring" into one shared translate key, which is the same trick the
   * `axis` bone plays for the stroke.
   */
  anchors?: Record<string, number[]>;
}

/**
 * The type every field of the cut manifest holds, shape by shape — what
 * `refuseValuesOfTheWrongType` refuses a manifest value against (issue #890).
 * The three interfaces above name three rows; the inline object types they
 * declare (`crop`, `axis`, `stroke`, `roi`, `mesh.bias`) are rows named
 * `<interface>.<field>`, and the selftest derives every row's keys and checked
 * types from the declarations here.
 *
 * ⚠️ A manifest has no key scan, and this table does not add one: a manifest is
 * often also the record of the pipeline that made the art and carries fields
 * rigc does not read. A key outside a row is left alone, exactly as before; a
 * key inside one must hold its type. Measured before the walk existed, 62 of 84
 * wrong-typed plants on the three fixture manifests built green —
 * `crop.h: "256"` among them — and 4 threw a TypeError from `node:path`.
 *
 * Unchecked by this walk: `mesh.kind` and `mesh.hull` (`enum`) — see
 * `MANIFEST_ENUMS`, below; `crop` and the other nested shapes, `parts` and
 * `mesh` (`object`) — the readers that walk them.
 */
export const MANIFEST_TYPES = {
  FaceManifest: {
    schema: 'string', crop: 'object', base: 'string', state_machine: 'map of string[]', parts: 'object[]',
    insertion: 'number[]', axis: 'object', stroke: 'object', roi: 'object', anchors: 'map of number[]',
  },
  'FaceManifest.crop': { x: 'number', y: 'number', w: 'number', h: 'number', resample: 'string' },
  'FaceManifest.axis': { deg: 'number', unit: 'number[]' },
  'FaceManifest.stroke': {
    amplitude: 'number', extension: 'number', contact_depth: 'number | null', cap_containment_ceiling: 'number | null',
  },
  'FaceManifest.roi': { x: 'number', y: 'number', w: 'number', h: 'number' },
  FaceManifestPart: {
    slot: 'string', rig_slot: 'string', draw_order: 'number', image: 'string | null', offset: 'number[]', size: 'number[]',
    state_key: 'string', states: 'map of string | null', polygon: 'number[][]', mesh: 'object',
  },
  FaceManifestMesh: {
    kind: 'enum', hull: 'enum', center: 'number[]', inner: 'number', control_bone: 'string', control_bones: 'string[]',
    rows: 'number', chain: 'string[]', bias: 'object',
  },
  'FaceManifestMesh.bias': { axis_deg: 'number', ramp: 'number[]', note: 'string' },
} as const satisfies Record<string, SpecTypeRow>;

/** The two mesh generators a manifest part may name (`FaceManifestMesh.kind`); absent means `ring`. */
export const MANIFEST_MESH_KINDS = ['ring', 'ribbon'] as const satisfies ReadonlyArray<NonNullable<FaceManifestMesh['kind']>>;

/**
 * Who refuses each `enum` row of `MANIFEST_TYPES` outside its set (issue #900);
 * `SpecEnumTable` in [`keys.ts`](keys.ts) says what an entry means.
 *
 * 🚨 `mesh.kind` was listed as held by "the manifest mesh reader", and it was
 * not held at all: that reader has three places that ask the kind, and they
 * disagreed about a value outside the two. The mesh checks read `"foo"` as a
 * ribbon, while the control-bone reader and the geometry builder read it as a
 * ring — so a ring part was refused as *a ribbon mesh needs mesh.rows and a
 * mesh.chain*, and a ribbon part as *a mesh with no control bone deforms
 * nothing*, both naming a fault the part did not have. `hull` is held: the ring
 * check refuses anything but `"polygon"` by name, and keeps that sentence.
 */
export const MANIFEST_ENUMS = {
  FaceManifestMesh: {
    kind: {
      set: MANIFEST_MESH_KINDS,
      readAs:
        'anything else was read as a ribbon by the mesh checks and as a ring by the control-bone reader and the ' +
        'geometry builder, so the refusal it got named a fault the part did not have',
    },
    hull: { owner: 'compileInto' },
  },
} as const satisfies SpecEnumTable<typeof MANIFEST_TYPES>;

// ---------------------------------------------------------------------------
// Motion spec  (spec: "rigc-motion/1")
// ---------------------------------------------------------------------------

/** Graph-view style normalised handles [hx1, hy1, hx2, hy2]. */
export type EasingHandles = [number, number, number, number];

/**
 * One value per group member, keyed by member name — the map form of `MotionKey.v`.
 *
 * Each entry is exactly what `v` would be for that one member: `[x, y]` on a
 * paired property, `[value]` on a single-axis one, `[r, g, b, a]` on `rgba`, an
 * attachment name on `attachment`. The times, the easings and the key count stay
 * shared, because those being shared is what makes a group a group.
 */
export type MotionMemberValues = Record<string, number[] | string | null>;

export interface MotionKey {
  /** Time in seconds. */
  t: number;
  /**
   * Value. Meaning depends on the track property:
   *   rgba       -> [r, g, b, a] in 0..1
   *   attachment -> attachment name, or null for "show nothing"
   *   translate  -> [x, y] in pixels, relative to the bone's setup position
   *   scale      -> [x, y] as multipliers (1 = setup)
   *   rotate     -> [degrees]
   *   inherit    -> a mode name (`normal`, `onlyTranslation`,
   *                 `noRotationOrReflection`, `noScale`, `noScaleOrReflection`);
   *                 stepped by the format, so no `ease` and no `curve`
   *   mix        -> [0..1] physics authority
   *   inertia / strength / damping / mass / wind / gravity
   *              -> [value]; the physics constraint's own setting, over time
   *   reset      -> null; the key is the event
   *
   * ⭐ On a track that names a `group`, this may instead be a **map keyed by
   * member name** (`MotionMemberValues`) — the six numbers of a head turn side
   * by side rather than six tracks apart, which is the only arrangement in which
   * a reader notices that one of them has the wrong sign (issue #295). A
   * non-map `v` keeps meaning exactly what it means today: every member gets it.
   *
   * ⚠️ Absent only when the key states a `derive` instead. Every other timeline
   * still refuses a key with no value, by name.
   */
  v?: number[] | string | null | MotionMemberValues;
  /**
   * The model form of `v`: a named kind whose per-member values the compiler
   * evaluates from stated parameters (`src/trackgen.ts`, AUTHORING §4.5.1).
   *
   * ⭐ A `v` map states six numbers; this states the one line of arithmetic that
   * produced them plus the six **depths** that are the actual decisions. A key
   * carries one or the other and never both — two answers to one question, the
   * same refusal a `deform` key's `transform` has against a `vertices` run.
   */
  derive?: TrackDerive;
  /** Named easing from `easings`, or "stepped". Absent = linear. */
  ease?: string;
  /**
   * Escape hatch: this key's bezier written out, as ABSOLUTE (time, value)
   * control points — four numbers per value channel, in field order, which is
   * exactly what the emitted JSON holds.
   *
   * ⭐ `ease` stays the recommended path and a key may carry one or the other,
   * never both. A named easing says "this shape, wherever it is used", which is
   * what makes a motion spec readable as intent; this says "these numbers", which
   * is what a transcription of an editor export needs, because an export has a
   * different shape per key per channel.
   *
   * ⚠️ Not the normalised graph-view handles `easings` takes. Those go through
   * `bezierForChannel`; writing them here loads clean and plays a different
   * curve.
   */
  curve?: number[] | 'stepped';
}

/**
 * Bone timelines the compiler emits. Channel counts live in the validator.
 *
 * The single-axis forms are not sugar for the paired ones: Spine keys them as
 * separate timelines, and an export that used `translatex` alone is not
 * reproduced by a `translate` whose y channel happens to be flat — the key
 * counts differ, and so does what a runtime blends against.
 */
export type BoneProperty =
  | 'translate'
  | 'translatex'
  | 'translatey'
  | 'scale'
  | 'scalex'
  | 'scaley'
  | 'shear'
  | 'shearx'
  | 'sheary'
  | 'rotate'
  | 'inherit';

/**
 * Physics timelines the compiler emits — all eight `SkeletonJson`'s physics
 * branch reads, in the order it reads them (`SkeletonJson.js:1063-1094`).
 *
 * Six of them are one number that overrides the constraint's own setting for
 * the length of an animation: `[inertia]`, `[strength]`, `[damping]`, `[mass]`,
 * `[wind]`, `[gravity]`. `mix` is the constraint's authority and `reset`
 * carries no value at all.
 *
 * ⚠️ A key that omits its value reads **0** on all six, and 1 on `mix` — the
 * per-key default, which is NOT the constraint default (`inertia` 0.5,
 * `strength` 100, `damping` 0.85, `mass` 1). rigc never omits a channel, so the
 * distinction only bites a reader comparing an emitted file with an editor
 * export; `PHYSICS_TRACKS` in `compile.ts` carries the argument.
 *
 * 🔒 **Four of them have a compile-time range** (issue #610): `mass` must be
 * `> 0`, `damping` inside the half-open `[0, 1)` (issue #1422; closed from #794),
 * and `mix` and `strength` `0` or more. The bounds are `PHYSICS_POSE_RULES` in `src/timelines.ts`, and each row's
 * `basis` says, per way out, whose they are (issue #798). Two are the
 * runtime's arithmetic: a `mass` of 0 is an infinite `massInverse` and NaN from
 * the first step, and a `damping` below 0 is a negative base under a fractional
 * exponent at any `fps` where `60 / fps` is not whole. The other seven are rigc's
 * call — the rig runs, finitely, and runs wrongly: `mass` below 0 and
 * `strength` below 0 run away, `damping` above 1 diverges until it overflows,
 * `damping` at 1 never decays and resonates on a chain,
 * `mix` below 0 is the jiggle inverted, and a setup `mix` or `strength` of 0 is
 * a constraint muted or pulled back by nothing. `inertia`, `wind`, `gravity`
 * and the top of `mix` are bounded nowhere, because the runtime documents
 * nothing for the first three and documents `mix` as "a percentage (0+)" —
 * which is also the text the bottom of `mix` rests on. The same four rows are what
 * `A23_PHYSICS_CONSTRAINT_EFFECTIVE` judges a setup pose and a foreign file's
 * timeline keys with, which is why they are not stated here as numbers.
 *
 * ⚠️ **Two of the four are wider on a KEY than at rest**, and `A23` holds a
 * constraint's own tuning to the narrower one: a setup `mix` or `strength` of 0
 * is a constraint that does nothing, while a key of 0 is an animation muting or
 * releasing it for a span and the next key restores it (issues #610, #727).
 */
export type PhysicsProperty =
  | 'inertia'
  | 'strength'
  | 'damping'
  | 'mass'
  | 'wind'
  | 'gravity'
  | 'mix'
  | 'reset';

/**
 * Path constraint timelines. `mix` is three values in one key —
 * `[mixRotate, mixX, mixY]` — because the format writes them as one timeline
 * with three curve channels (`SkeletonJson.ts:1025-1056`).
 */
export type PathProperty = 'position' | 'spacing' | 'mix';

/** Slider timelines. `time` is the animation time the slider applies. */
export type SliderProperty = 'time' | 'mix';

/**
 * One physics constraint.
 *
 * Structure, so it could argue for the manifest — but every field here is a
 * tuning number for motion over time, so the starting-parameter table goes into
 * the motion spec. It lives with the keys it competes against.
 *
 * ⚠️ The component fields (`x`/`y`/`rotate`/`scaleX`/`shearX`) all default to 0,
 * which means a constraint that names none of them parses cleanly and does
 * absolutely nothing. That is assertion A23.
 */
export interface MotionPhysics {
  bone: string;
  x?: number;
  y?: number;
  rotate?: number;
  scaleX?: number;
  shearX?: number;
  inertia?: number;
  strength?: number;
  damping?: number;
  mass?: number;
  wind?: number;
  gravity?: number;
  mix?: number;
  fps?: number;
  limit?: number;
  note?: string;
}

/**
 * One target, one property, a list of keys.
 *
 * ⭐ **The target field picks the family, not the property.** Three constraint
 * families spell a timeline `group.<constraint>.<timeline>` and all three of them
 * have a timeline called `mix`, so `property` alone cannot say which one a track
 * means — `physics`, `path` and `slider` each name their own constraint, and a
 * track that names none of them is a slot or bone track as before.
 */
export interface MotionTrack {
  /** Target one slot... */
  slot?: string;
  /** ...or a named group of slots. */
  group?: string;
  /** ...or one bone, for the mesh tier: the control bone carries every key. */
  bone?: string;
  /** ...or one physics constraint, by name. */
  physics?: string;
  /** ...or one path constraint, by name. */
  path?: string;
  /** ...or one slider, by name. */
  slider?: string;
  property: 'rgba' | 'rgb' | 'alpha' | 'rgba2' | 'rgb2' | 'attachment' | BoneProperty | PhysicsProperty | PathProperty | SliderProperty;
  /** Seconds added to every key time of this track. */
  lag?: number;
  /** Extra per-member delay inside a group, in member order. */
  stagger?: number;
  keys: MotionKey[];
}

/**
 * A track after its per-member values have been resolved **for one target**.
 *
 * ⭐ The type exists to make the resolution order an invariant rather than a
 * convention: a `v` that is a map and a `v` that is a value mean different
 * things, so nothing downstream of `resolveMemberTrack` is allowed to see the
 * first. By the time a key reaches `compileValueTrack`, `v` means one thing —
 * which is the same guarantee `evaluateDeformTransform`'s `setup` array carries,
 * stated in the type system instead of in a comment.
 */
export interface MotionValueKey extends Omit<MotionKey, 'v' | 'derive'> {
  v?: number[] | string | null;
}

export interface MotionValueTrack extends Omit<MotionTrack, 'keys'> {
  keys: MotionValueKey[];
}

/**
 * One slot moved, at one draw-order key: `offset` positions later in the array.
 *
 * ⚠️ The offset is counted against the SETUP order, not against wherever the
 * slot ended up at the previous key — `readDrawOrder` rebuilds the whole
 * permutation from the setup array every time (SkeletonJson.ts:1336-1374). A key
 * is a complete statement of the change, not an edit to the one before it.
 */
export interface MotionDrawOrderOffset {
  slot: string;
  /** How many places later this slot is drawn. Negative moves it earlier. */
  offset: number;
}

/**
 * One key of the whole-animation draw-order timeline.
 *
 * A key with **no** `offsets` restores the setup draw order — that is the
 * parser's own encoding (`readDrawOrder` returns null, and the timeline sets the
 * setup array), and it is how an animation that has swapped two slots puts them
 * back.
 */
export interface MotionDrawOrderKey {
  /** Time in seconds. */
  t: number;
  offsets?: MotionDrawOrderOffset[];
}

/**
 * One firing of a declared event, at one time.
 *
 * ⚠️ Like `drawOrder` and unlike a `track`, this timeline names **no target**:
 * 4.3 writes it as `animations.<a>.events` beside `bones` and `slots`
 * (SPEC_COVERAGE part 1-8), and there is one per animation. The `name` picks
 * an entry out of the rig spec's `events` table; the optional payload fields
 * override that entry's defaults for this firing only.
 *
 * A key with no `int`/`float`/`string` inherits the event's setup payload
 * (`:1250-1252`) — which is what the editor writes, and why `{ "t": 0.5,
 * "name": "footstep" }` is the common shape.
 */
export interface MotionEventKey {
  /** Time in seconds. */
  t: number;
  /** An event the rig spec declares. A miss throws in the parser; rigc refuses it. */
  name: string;
  /** Payload overrides for this firing. Omit to inherit the event's defaults. */
  int?: number;
  float?: number;
  string?: string;
  /** Read only when the declared event carries an `audio` path — see `RigEvent`. */
  volume?: number;
  balance?: number;
}

/**
 * One key of an IK constraint's timeline (`animations.<a>.ik.<constraint>`).
 *
 * ⚠️ Every field is **optional and absolute**, and that pairing is the trap. The
 * parser reads each one with its own default per key
 * (`SkeletonJson.ts`: `mix` 1, `softness` 0, `bendPositive` true, `compress`
 * false, `stretch` false) — so a key that omits `softness` does not hold the
 * previous key's softness, it snaps to 0. rigc therefore refuses a track whose
 * keys do not all name the SAME set of fields: state the value on every key, or
 * on none of them.
 *
 * `mix` and `softness` are the timeline's two curve channels, in that order.
 * The three booleans are stepped by nature — nothing interpolates them.
 */
export interface MotionIkKey {
  /** Time in seconds. */
  t: number;
  /** 0..1: how much of the constrained rotation is applied. Parser default 1. */
  mix?: number;
  /** Distance from full reach at which the bones stop straightening. Default 0. */
  softness?: number;
  /** Two-bone IK bend direction. Default true. */
  bendPositive?: boolean;
  /** One-bone IK: scale the bone down to reach a close target. Default false. */
  compress?: boolean;
  /** Scale the bone up to reach a far target. Default false. */
  stretch?: boolean;
  /** Named easing from `easings`, or "stepped". Absent = linear. */
  ease?: string;
  /** The raw form: 4 absolute (time, value) numbers per channel — 8 here. */
  curve?: number[] | 'stepped';
}

/**
 * One IK constraint keyed over time.
 *
 * 4.3 writes this as `animations.<a>.ik.<constraint>` — **one unnamed timeline
 * per constraint**, so the constraint name is the only target there is and the
 * group carries no timeline name at all.
 */
export interface MotionIkTrack {
  /** An `ik` constraint the rig spec declares. */
  constraint: string;
  keys: MotionIkKey[];
}

/**
 * One key of a transform constraint's timeline
 * (`animations.<a>.transform.<constraint>`).
 *
 * Six mixes, six curve channels, in the order written here — which is the order
 * the parser reads them and therefore the order a curve array concatenates.
 * The same absent-means-default rule as `MotionIkKey` applies, with one extra
 * quirk: `mixY` defaults to **this key's own `mixX`**, not to 1.
 */
export interface MotionTransformKey {
  /** Time in seconds. */
  t: number;
  /** Parser default 1. */
  mixRotate?: number;
  /** Parser default 1. */
  mixX?: number;
  /** Parser default: the same key's `mixX`. */
  mixY?: number;
  /** Parser default 1. */
  mixScaleX?: number;
  /** Parser default 1. */
  mixScaleY?: number;
  /** Parser default 1. */
  mixShearY?: number;
  ease?: string;
  /** 4 absolute (time, value) numbers per channel — 24 here. */
  curve?: number[] | 'stepped';
}

/** One transform constraint keyed over time. Same shape rule as `MotionIkTrack`. */
export interface MotionTransformTrack {
  /** A `transform` constraint the rig spec declares. */
  constraint: string;
  keys: MotionTransformKey[];
}

/**
 * One key of a deform timeline
 * (`animations.<a>.attachments.<skin>.<slot>.<attachment>.deform`).
 *
 * 🚨 This is the only key in the format whose meaning depends on the object it
 * is attached to. The parser builds a zero-filled array as long as the
 * attachment's own deform array, copies this key's `vertices` into it starting at
 * `offset`, and leaves the rest alone — so a key is a **sparse edit of the setup
 * geometry**, and both the length of that array and the meaning of an index into
 * it come from the attachment (`SkeletonJson.ts`, the `deform` branch):
 *
 *   - **unweighted** attachment — the array is one `x, y` pair per VERTEX, and
 *     the parser adds the setup position back on load. The numbers here are
 *     therefore offsets from setup, in the slot bone's space.
 *   - **weighted** attachment — the array is one `x, y` pair per BONE INFLUENCE
 *     (`vertices.length / 3 * 2`), each in the bind space of that influence's
 *     bone. A vertex with three bones on it occupies three pairs.
 *
 * `offset` is an index into that array and works for both. `fromVertex` is
 * rigc's ergonomic form — a VERTEX index, which rigc translates — and it is
 * accepted only where the translation is honest: always on an unweighted
 * attachment, and on a weighted one only when every vertex the run covers has
 * exactly one bone influence. Anything else is refused by name rather than
 * emitted as a plausible-looking lie.
 */
export interface MotionDeformKey {
  /** Time in seconds. */
  t: number;
  /**
   * Where the run starts in the attachment's own deform array. Default 0.
   *
   * Any index the array holds, **odd ones included** (issue #576): the parser
   * copies at this index and does no pair arithmetic, so an odd start is what an
   * editor writes when it trims the leading numbers off a delta run.
   */
  offset?: number;
  /** The same start, given as a vertex index. Never together with `offset`. */
  fromVertex?: number;
  /**
   * The run: consecutive numbers written into the deform array from `offset` on,
   * `x, y` per array slot. Absent or `null` is the parser's own encoding for
   * "back to the setup pose" — the key with no edit.
   *
   * ⚠️ **An ODD count is legal and means something** (issue #576). Both readers
   * copy the run verbatim — `Utils.arrayCopy(vertices, 0, deform, offset,
   * vertices.length)` in `SkeletonJson`, a `for (let v = start; v < end; v++)`
   * fill in `SkeletonBinary` — so a run of three numbers moves one vertex in x
   * and y and the next in x alone, leaving that y at its setup value. Padding a
   * `0` to even it out is a different animation whenever that setup y is
   * non-zero, which is why the even-length rule that stood here could not be kept
   * as a convenience: it left one production export with no spelling in this
   * spec at all.
   */
  vertices?: number[] | null;
  /**
   * The run stated as a **model** instead, which the compiler evaluates over the
   * attachment's own setup geometry (`src/deformgen.ts`, issue #294).
   *
   * ⭐ The same move `generator` already made for geometry: a table of numbers is
   * the wrong way to say a deformation model. `gallery/portrait`'s held 12° yaw
   * is 160 hand-transcribed floats of one closed form, and none of them is a
   * judgement — so the spec states the model and the compiler states the
   * numbers.
   *
   * Never together with `vertices`, for the same reason `generator` and authored
   * geometry cannot sit on one attachment, and never with `offset` or
   * `fromVertex`: a transform covers **every** vertex, because a model applied
   * to part of an attachment leaves a step at the end of its run.
   */
  transform?: DeformTransform;
  ease?: string;
  /**
   * One channel, and it interpolates the deform FRACTION from 0 to 1 rather than
   * any value in `vertices` (`readCurve(..., 0, 1, 1)`). So a raw curve is 4
   * numbers whose value axis runs 0..1.
   */
  curve?: number[] | 'stepped';
}

/** One attachment's geometry keyed over time. */
export interface MotionDeformTrack {
  /** The skin the attachment lives in. Absent = `"default"`. */
  skin?: string;
  slot: string;
  /** The attachment's placeholder name inside that skin and slot. */
  attachment: string;
  keys: MotionDeformKey[];
}

/**
 * One key of a sequence timeline
 * (`animations.<a>.attachments.<skin>.<slot>.<attachment>.sequence`), which
 * picks the frame of an attachment's `sequence` block (see `RigSequence`).
 *
 * From the key's time on, the frame shown is `index` advanced by one every
 * `delay` seconds and folded back into the series by `mode` —
 * `SequenceTimeline.applyToSlot` (`Animation.js`):
 * `index + floor((time - keyTime) / delay + 0.00001)`, then per mode (`hold`
 * never advances; `once` stops on the last frame; `loop` wraps; `pingpong`
 * bounces; the three `Reverse` modes run from the last frame down). Before the
 * first key the frame is the attachment's `setup`.
 *
 * ⚠️ Three silences the compiler refuses, every one measured on spine-core
 * 4.3.13: a `mode` outside the seven loads as `hold`; a `delay` of 0 under an
 * advancing mode divides by zero and `Infinity | 0` is 0, so the frame never
 * moves; an `index` at or past the series' `count` is clamped to the last frame
 * and a fractional one is truncated (`1.5` showed frame 1).
 *
 * 🔑 Each field is optional in the FORMAT and none is invented here: `mode`
 * defaults to `"hold"` and `index` to 0 in the parser, and `delay` defaults to
 * the PREVIOUS key's delay (0 on the first) — so a key that omits it keeps its
 * neighbour's rate, and the compiler emits exactly the fields the spec states.
 */
export interface MotionSequenceKey {
  /** Time in seconds. */
  t: number;
  /** One of the seven `SEQUENCE_MODES`. Parser default `"hold"`. */
  mode?: string;
  /** The frame this key starts on, 0-based. Parser default 0. */
  index?: number;
  /** Seconds per frame. Parser default: the previous key's, 0 on the first. */
  delay?: number;
}

/** One attachment's frame keyed over time — the `deform` family's triple, a sequence's keys. */
export interface MotionSequenceTrack {
  /** The skin the attachment lives in. Absent = `"default"`. */
  skin?: string;
  slot: string;
  /** The attachment's placeholder name inside that skin and slot. */
  attachment: string;
  keys: MotionSequenceKey[];
}

export interface MotionAnimation {
  /** Declared, then verified against the compiled result (rule 4). */
  duration: number;
  /**
   * Player hint only; not expressible in skeleton JSON, and therefore optional.
   *
   * ⚠️ It was declared required until issue #307 put a parser in front of this
   * type and the corpus disagreed: 20 of the 37 motion specs in the repository
   * name no `loop` at all. Nothing in the emitted artifact depends on it, so a
   * required-field refusal here would have refused most of the benchmark corpus
   * over a field the compiler never reads.
   */
  loop?: boolean;
  note?: string;
  tracks: MotionTrack[];
  /**
   * IK constraint timelines, one entry per constraint.
   *
   * ⭐ Not a `track`, and the reason is the key rather than the target. A track's
   * key is one `v` — an array, a name, or nothing — and these three families each
   * carry a shape of their own: five named fields for IK, six for a transform
   * constraint, and for a deform a sparse run whose meaning depends on the
   * attachment. Folding them into `MotionKey` would make `v` mean four different
   * things depending on `property`, and the type would stop documenting any of
   * them. So they sit beside `tracks`, where 4.3 also writes them
   * (`animations.<a>.ik`, `.transform`, `.attachments`).
   */
  ik?: MotionIkTrack[];
  /** Transform constraint timelines, one entry per constraint. */
  transform?: MotionTransformTrack[];
  /** Deform timelines, one entry per skin/slot/attachment triple. */
  deform?: MotionDeformTrack[];
  /**
   * Sequence timelines, one entry per skin/slot/attachment triple — the other
   * of the two timelines an attachment carries, beside `deform` for the same
   * reason: a key of three named fields aimed at an attachment rather than at a
   * slot.
   */
  sequence?: MotionSequenceTrack[];
  /**
   * The draw-order timeline. **One per animation, and it names no target** —
   * which is why it is not a `track`: 4.3 writes it as `animations.<a>.drawOrder`
   * beside `bones` and `slots`, not inside either (SPEC_COVERAGE part 1-8).
   *
   * Draw order is the one thing about a slot that the slots array already
   * states (rule R4), so this timeline is the only way to say it changes over
   * time. First needed at ladder rung 5.
   */
  drawOrder?: MotionDrawOrderKey[];
  /**
   * The event timeline. One per animation, names no target, and for the same
   * reason `drawOrder` is not a `track`. First needed at the spineboy rung.
   */
  events?: MotionEventKey[];
}

/**
 * Setup pose per slot. Declared, never inferred — rule 5. It decides which of
 * the two overlay mechanisms a slot uses:
 *   - an attachment + alpha 0  => the lid tier, driven by rgba timelines;
 *   - attachment null          => the swap tier, driven by attachment timelines
 *                                 (null = the untouched base pixels show).
 */
export interface MotionSetupSlot {
  attachment?: string | null;
  /** [r, g, b, a] in 0..1. Omit for opaque white. */
  color?: [number, number, number, number];
}

export interface MotionSpec {
  spec: 'rigc-motion/1';
  /**
   * The rig this spec was authored against — it must equal the rig spec's
   * `name`, and a mismatch is a compile error rather than a silent pairing.
   *
   * It named a hard-coded table until 2026-08-22; now it names a file's own
   * name, and the file's path comes from the cuts table. The check is kept
   * because the keys in here are aimed at bones by NAME: pair the spec with
   * another rig whose names happen to overlap and every one of them lands on
   * something that means something else.
   */
  archetype: string;
  cut: string;
  note?: string;
  easings: Record<string, EasingHandles>;
  groups?: Record<string, string[]>;
  setup?: Record<string, MotionSetupSlot>;
  /** Physics constraints by name. Emitted into the 4.3 `constraints` array. */
  physics?: Record<string, MotionPhysics>;
  animations: Record<string, MotionAnimation>;
  /** Player-side AnimationStateData config; not emitted into skeleton JSON. */
  mix?: MotionMix;
}

/**
 * The player-side mix table — a default crossfade and the pairs that override
 * it. Never emitted, which is why nothing had ever looked at it before issue
 * #307's parse.
 *
 * ⭐ Named rather than inline so that `MOTION_KEYS` can pair a key set with it:
 * `CUR17` resolves each set against an interface of the same name, and an
 * anonymous shape is one the pairing cannot reach.
 */
export interface MotionMix {
  default: number;
  pairs?: Array<[string, string, number]>;
}

// ---------------------------------------------------------------------------
// Emitted Spine 4.3 skeleton JSON
// ---------------------------------------------------------------------------

/**
 * Field order here is the EDITOR's, for every field its exports write — the
 * order `src/keyorder.ts`'s `EDITOR_KEY_ORDER` states per kind and the emitter
 * writes since issue #716 (`length, rotation, x, y` on a bone, `x, y, …, width,
 * height` on a region, `type` before `name` on a constraint). `CUR84` in
 * `selftest.ts` holds each interface below to its row, so this is a checked
 * claim rather than a description. A field no export writes (`shearX`, a
 * region's `name` and `path`) sits where it reads best: the table leaves such a
 * key at the position its constructor gives it.
 *
 * ⚠️ This comment said the opposite until #716 — *"rigc's, not the editor's …
 * changing it would be a byte-level diff that says nothing"*. It says something:
 * a rebuild of an editor export is the export only if it is the same text, and
 * 269 objects over the twelve exports under `examples/` were not.
 *
 * A field is present exactly when the rig spec declared it; see `src/rig.ts`.
 */
export interface SpineBone {
  name: string;
  parent?: string;
  length?: number;
  /** Spine degrees, CCW in a y-up world. */
  rotation?: number;
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
  shearX?: number;
  shearY?: number;
  /** 4.2+ name. 4.0/4.1's `transform` still loads and is silently ignored — A02. */
  inherit?: string;
  skin?: boolean;
  color?: string;
  /** Editor-only affordance, read at `SkeletonJson.ts:121-126`. */
  icon?: string;
}

export interface SpineSlot {
  name: string;
  bone: string;
  color?: string;
  attachment?: string;
  dark?: string;
  blend?: string;
}

/**
 * The attachment's own name, as distinct from the placeholder it is filed under.
 *
 * `readAttachment` reads `const name = getValue(map, "name", placeholder)`
 * (`SkeletonJson.ts:526`), so an absent field means "the placeholder is also the
 * name". Nothing in the format resolves by it — skins, setup attachments,
 * attachment and deform timelines and a linked mesh's `source` are keyed by the
 * placeholder — so several skins' entries under one placeholder may carry one
 * name, which is what the editor itself exports (issue #796).
 *
 * 🚨 It moves a second field's default with it. For the three types that carry
 * texture art, `path` defaults to **`name`**, not to the placeholder
 * (`:529`, `:559`), so an attachment given a name and no path resolves the region
 * that name spells. rigc emits it exactly when the rig spec states it
 * (`RigAttachmentName` in `rig.ts`); from #541 to #796 it composed
 * `<skin>/<placeholder>` for a placeholder several skins fill, and that is gone.
 *
 * ⚠️ And the **`default` skin may never be one of the skins sharing a
 * placeholder** — a fact about the editor rather than about the format (issue
 * #567, Spine 4.3.26, round trips 7 and 8), and a `CompileError` rather than a
 * spelling. The editor's named skins hold *skin placeholders*, a key holding a
 * named attachment, and come back untouched. Its default skin holds no
 * placeholders: an attachment there hangs on the slot and is known by its name
 * alone. So writing a name there gets it re-keyed by that name on export and
 * the slot's setup `attachment` stops resolving (trip 7), and NOT writing one
 * makes that attachment's name collide with the named skins' placeholder of the
 * same name, which the editor refuses at import (trip 8). Both spellings are
 * measured, so there is no third; `refuseDefaultSkinContest` in `compile.ts` is
 * where that lives.
 */
export interface SpineRegionAttachment {
  name?: string;
  path?: string;
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
  /**
   * Cancels the bone's world rotation so a plate authored in screen space stays
   * screen-upright under a rotated bone. Without it every slot hanging off the
   * `axis` bone would render tilted by the axis angle.
   */
  rotation?: number;
  /** Required. Omitting these yields NaN with no error. */
  width: number;
  height: number;
  color?: string;
  sequence?: SpineSequence;
}

/** `readSequence`'s four fields, emitted as the spec stated them (`RigSequence`). */
export interface SpineSequence {
  count: number;
  start?: number;
  digits?: number;
  setup?: number;
}

/**
 * Weighted mesh. `triangles` and `uvs` are not optional in practice: a missing
 * `triangles` loads as `undefined` and `uvs` is
 * what decides `worldVerticesLength`.
 */
export interface SpineMeshAttachment {
  type: 'mesh';
  /** See `SpineRegionAttachment.name` — and it takes `path` with it. */
  name?: string;
  /** `path` and `color` are written right after `type` — `compile.ts`'s `meshTextureKeys` says where that is measured. */
  path?: string;
  color?: string;
  uvs: number[];
  triangles: number[];
  /** Weighted encoding: boneCount, (boneIndex, bindX, bindY, weight)*n, repeated. */
  vertices: number[];
  /**
   * Hull vertex count — the outline polygon is the first `hull` vertices, in
   * order. The loader stores this doubled, and the binary reader derives the
   * triangle count from it, so it is always the count the triangles state
   * (`traceOutline` in mesh.ts) and never 0.
   */
  hull: number;
  /**
   * Nonessential edge list the editor draws: vertex index pairs, each index
   * TIMES TWO (`meshEdges` in mesh.ts). Always written — authored edges are
   * carried through, every other mesh gets its triangle edges — because a mesh
   * without one imports with its interior edges reported lost.
   */
  edges: number[];
  /** Nonessential, but they make the mesh budget assertions readable. */
  width: number;
  height: number;
  sequence?: SpineSequence;
}

/**
 * A mesh that borrows another mesh's geometry (`RigLinkedMeshAttachment`).
 *
 * Only the keys the parser reads, and only where they differ from its defaults:
 * `slot` defaults to the link's own slot, `skin` to the default skin and
 * `timelines` to true (`SkeletonJson.js:571-581`), so writing one at its default
 * would be a byte the editor's own export does not carry. `width`/`height` are
 * emitted for the editor and overwritten by the source's at load
 * (`MeshAttachment.setSourceMesh`), which is why nothing reads them back.
 */
export interface SpineLinkedMeshAttachment {
  type: 'linkedmesh';
  /** See `SpineRegionAttachment.name` — and it takes `path` with it. */
  name?: string;
  path?: string;
  source: string;
  slot?: string;
  skin?: string;
  timelines?: boolean;
  width: number;
  height: number;
  color?: string;
  sequence?: SpineSequence;
}

/**
 * The two vertex-only attachments: a polygon and nothing else.
 *
 * `vertexCount` is not optional the way a mesh's is absent-by-design: the parser
 * reads `map.vertexCount << 1`, so an omission is `0` and `readVertices` decodes
 * the coordinate array as a weight run and stores nothing.
 */
export interface SpineBoundingBoxAttachment {
  type: 'boundingbox';
  /** See `SpineRegionAttachment.name`. No `path`: this type reads none. */
  name?: string;
  vertexCount: number;
  /** Unweighted x/y pairs, or the weighted run — same encoding as a mesh's. */
  vertices: number[];
  color?: string;
}

export interface SpineClippingAttachment {
  type: 'clipping';
  /** See `SpineRegionAttachment.name`. No `path`: this type reads none. */
  name?: string;
  /** The last slot the clip applies to. Absent = to the bottom of the order. */
  end?: string;
  convex?: boolean;
  inverse?: boolean;
  vertexCount: number;
  vertices: number[];
  color?: string;
}

/**
 * A composite cubic Bezier, for a path constraint to slide bones along.
 *
 * `lengths` is the cumulative length at the end of each curve in the setup pose,
 * measured **the way `PathConstraint` measures it** — a four-sample forward
 * difference per curve (`PathConstraint.js:301-320`), which is also what the
 * Spine editor exports and which reads about **0.5 % below the true arc**.
 * `vertexCount / 3` entries on both shapes — one per curve on a closed path, and
 * one more than the curves on an open one, the wrap-around curve's cumulative,
 * which nothing reads (below). It has no parser default and the parser
 * dereferences `map.lengths.length` unconditionally, so an absent array is one of
 * the format's few loud failures. Since issue #804 rigc emits a stated array as
 * stated and measures only an omitted one — see `buildRigPath`.
 *
 * ⚠️ That sentence read *"the cumulative **arc** length"* until issue #560, and
 * the word was load-bearing in the wrong direction: this is not an arc length,
 * and no refinement of the integral converges on it. It is the number the
 * field's own consumer computes when it is not given one. ⇒ Do not derive a
 * physical quantity from it — how far a wheel rolls, how long a ribbon is.
 * `position` is stated against it; arc length is not it.
 *
 * ⚠️ **The EDITOR writes `vertexCount / 3` entries on BOTH — measured**
 * (round trip 6, 2026-09-16, Spine 4.3.26). It computes the wrap-around curve
 * even for an open path: `gallery/ride`'s 12-vertex open path came back with
 * **four** entries on 2026-09-04 (4.3.23) and the fourth, `2136.228`, is the
 * *closed*-chain cumulative. ⚠️ Neither array is wrong, and this is not a case
 * of the editor knowing something rigc does not. `SkeletonJson.js:601` allocates
 * `Utils.newArray(vertexCount / 3, 0)` and copies whatever is there, while
 * `PathConstraint` reads at most `lengths[curveCount]` with
 * `curveCount = verticesLength / 6 − (closed ? 1 : 2)` — index 2 on that path.
 * The trailing entry the editor adds to an open path is never read by anything.
 * Since issue #804 rigc writes it too, over the closed chain, and the `ride`
 * build ends on the editor's `2136.228`: a rebuild is the file the editor
 * writes rather than one entry short of it.
 *
 * 🚨 **What the editor writes INTO those entries is its own measurement, and it
 * is the runtime's, not calculus'** (issue #560, measured on the same trip).
 * `PathConstraint`'s `constantSpeed` re-measure is a four-sample forward
 * difference per curve — its constants are `0.1875 = 3t²`, `0.09375 = 6t³` and
 * `(cx1 − x1) · 0.75 = 3t` at **t = 1/4**, accumulating four `Math.sqrt` terms —
 * and the editor's stored `lengths` are that same computation. A 4-sample chord
 * sum over the same control points reproduces the editor to every digit it
 * prints, on two rigs and two editor builds: `pathmodes` (closed, 4.3.26) came
 * back `[152.7006, 305.4012, 458.1019, 610.8025]` and `ride` (open, 4.3.23)
 * `[430.8389, 838.0142, 1127.736, …]`. It is a recomputation at **export** — the
 * inflated `.spine` project holds the imported numbers verbatim — so a path rig
 * is re-parameterised by the trip rather than corrupted by it.
 *
 * ⇒ **rigc emits that computation, not a sampler aimed at it** (issue #560).
 * `pathCurveLengths` in [`compile.ts`](compile.ts) measures with the core's
 * curve table (`curveLengthTable` in `src/core/constraints_path.ts`, issue
 * #1015), down to `Math.sqrt(dx * dx + dy * dy)` rather than `Math.hypot` and
 * `0.16666667` rather than `1 / 6`; `PS67`, `PS68` and `PS186` in `selftest.ts`
 * hold it there by requiring it to reproduce a real `PathConstraint.curves`
 * array **bit for bit** on the runtime's own posed chain. Measured after the change, all
 * seven entries of both editor exports above come back at the precision the
 * editor prints them.
 *
 * ⚠️ This paragraph used to point at a constant — `PATH_LENGTH_SAMPLES` — and ask
 * *how finely rigc should sample*. There is no such constant now, and the
 * question was the wrong one. The chord-sum reading above is true and it is not
 * sufficient: a 4-sample chord sum agrees with the forward difference to about
 * **nine significant digits**, which is *below* what float32 can hold — so no
 * editor export can tell the two apart, and that reading can only settle the
 * MODEL — and *above* rigc's six-decimal rounding, so the emitted file can. On
 * both rigs above the two spellings round apart on the **last** curve, where the
 * running total has accumulated most: `610.802519` against `610.802520`, and
 * `1127.735817` against `1127.735818`. So the editor is the evidence for what is
 * being computed and only the runtime is evidence for how.
 *
 * 📌 For the record of what the disagreement cost when it was found: the build
 * rigc **0.21.0** emitted for `pathmodes` sat a uniform **0.70 %** above the
 * editor's four numbers, and `check` read **4.9612 mean MAE** against 0.0000 on
 * the seven rigs of that run without a path. ⚠️ What decides whether that moves a
 * pixel is the POSITION mode, not the spacing mode: `pathmodes` is
 * `positionMode: fixed`, where an absolute `position` is compared against a total
 * that scaled, so the bone slides. Under `positionMode: percent` a uniform scale
 * cancels out of both the position and the spacing — `gallery/ride` is
 * percent/percent and every one of its 74 rendered frames came back **byte
 * identical** across this change, on an emitted array all three of whose numbers
 * moved. `A33_VERTEX_ATTACHMENT_GEOMETRY` asks only that the array strictly
 * increase, which both arrays do, and `diff` does not compare it at all.
 */
export interface SpinePathAttachment {
  type: 'path';
  /** See `SpineRegionAttachment.name`. No texture `path`: this type reads none. */
  name?: string;
  closed?: boolean;
  constantSpeed?: boolean;
  vertexCount: number;
  /** Unweighted x/y pairs, or the weighted run — same encoding as a mesh's. */
  vertices: number[];
  lengths: number[];
  color?: string;
}

export type SpineAttachment =
  | SpineRegionAttachment
  | SpineMeshAttachment
  | SpineLinkedMeshAttachment
  | SpineBoundingBoxAttachment
  | SpineClippingAttachment
  | SpinePathAttachment;

export type SpineTimelineKey = Record<string, unknown>;

/**
 * 4.3 puts every constraint type in ONE top-level `constraints` array and
 * branches on `type` (SkeletonJson.js:129-350). The 4.1-era per-type arrays
 * (`physics: [...]`, `ik: [...]`) are not read at all — the constraint vanishes
 * with no error, which is assertion A01.
 */
export type SpineConstraint = { type: string; name: string } & Record<string, unknown>;

export interface SpineSkeletonJson {
  skeleton: {
    spine: string;
    /**
     * The setup-pose bounding box — and since issue #907 that is what `build`
     * writes here, computed by rigc's core (`headerBoundsOf` in `compile.ts`);
     * it used to copy the stage. All four together or none of them: a rig spec
     * that declares no stage (`skeleton.width`/`height` stated `null` — see
     * `RigSkeletonHeader`) emits a header without any of them, which is what an
     * export of a skeleton whose bounds were never set carries (issue #578).
     *
     * ⚠️ Optional here because the *runtime* leaves them `undefined` when they
     * are absent, not 0. `SkeletonData` declares `x = 0 … height = 0`
     * (`SkeletonData.js:55-61`), and `SkeletonJson` then overwrites all four
     * unconditionally — `skeletonData.x = skeletonMap.x` (`SkeletonJson.js:70-73`,
     * no `getValue` default) — so an absent field lands as `undefined` on a
     * `SkeletonData` whose own `.d.ts` types it `number`. Anything reading these
     * back off a parsed skeleton guards for it; `validate.ts`'s `data.width || 0`
     * is why A14 and A19 were already right about a stage-less file.
     */
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    fps?: number;
    referenceScale?: number;
    images?: string;
    /** Nonessential, carried from `RigSkeletonHeader.audio` as stated — `null` included. */
    audio?: string | null;
  };
  bones: SpineBone[];
  slots: SpineSlot[];
  constraints?: SpineConstraint[];
  /**
   * Field order inside a skin entry is `readSkeletonData`'s reading order —
   * `bones`, then the five constraint lists, then `attachments` — and every one
   * of them but `name` and `attachments` is emitted only when the rig declared
   * it, so a spec that names no per-skin member emits exactly what it always did.
   */
  skins: Array<{
    name: string;
    /** Bone names this skin activates. Each one carries `skin: true`. */
    bones?: string[];
    ik?: string[];
    transform?: string[];
    path?: string[];
    physics?: string[];
    slider?: string[];
    attachments: Record<string, Record<string, SpineAttachment>>;
  }>;
  /**
   * Event definitions, keyed by name (`SkeletonJson.ts:451-464`). An object, not
   * an array — one of the **two** top-level collections in the format that are,
   * `animations` being the other.
   *
   * ⚠️ This sentence said "the one" until issue #535, and the collection it was
   * overlooking is where the defect that card is about lived. The distinction is
   * not cosmetic: the binary format addresses both of these by ORDINAL
   * (`SkeletonBinary`: `animations[readInt()]` for a slider's animation,
   * `events[readInt()]` for an event key), and an editor round trip was measured
   * to re-key every name-keyed object while returning the arrays it was taken
   * over in the order they were given. So a reference into either of these two
   * is a reference whose ordinal an editor can move.
   *
   * ✅ **`events` does not need what `animations` needed, and that is measured
   * rather than owed.** This comment said *unmeasured* until issue #539 carried
   * three of them through the editor on the same session's discriminator rigs:
   * `zebra, mike, alpha` came back keyed `alpha, mike, zebra`, and every firing
   * still resolved **by name** — `0.3 -> mike`, `0.6 -> alpha`, payloads intact.
   * So the editor re-keys `events` and repoints nothing, while the same re-key
   * of `animations` repoints every slider (#535). `animations` is emitted in the
   * editor's order for that reason (`compile.ts`'s `editorAnimationOrder`);
   * `events` is emitted in the order the rig spec declares them.
   *
   * ⚠️ Two more of this paragraph's claims were falsified by the same session,
   * and both stood here for a release because nothing re-read them (#544):
   *
   * - **The re-key is not in codepoint order.** It is natural and
   *   case-insensitive: `Turn, sweep, wave` came back `sweep, Turn, wave` and
   *   `turn10, turn2, zoom` came back `turn2, turn10, zoom` (#539). rigc emits
   *   `animations` in **that** comparator's order since issue #543, and since
   *   #728 the comparator itself is measured rather than quantified over —
   *   five stored round trips, folders and all — so only what those files leave
   *   open is refused by name. See `compile.ts`'s `editorNameOrder` and
   *   `refuseNamesTheEditorCouldKeyDifferently`. It emitted codepoint until
   *   #543, with the refusal widened to cover every pair codepoint could order
   *   differently; that refused both rigs above, which are the only two anybody
   *   had measured then, and it moved no byte to stop doing so.
   * - 🚨 **`skins` is NOT an array the editor leaves alone. It is the first one
   *   measured moved** (#541). A four-skin rig built `default, zulu, mike,
   *   alpha` came back `default, alpha, mike, zulu`: `default` is pinned first
   *   and the rest are re-sorted, and the deform timelines came back keyed
   *   `mike, zulu` rather than `zulu, mike` with it. `SkeletonBinary` addresses
   *   skins by ORDINAL — `skins[readInt()]` for an attachment timeline,
   *   `skins[skinIndex]` for a linked mesh — so this is #535 in the collection
   *   nobody had checked. rigc emits `default` first and the rest in that
   *   order since #541; see `compile.ts`'s `editorSkinOrder`.
   *
   *   ⚠️ **The two readings this replaces, kept because the second is the one
   *   that cost something.** #537's pull request called `skins` "measured
   *   preserved"; #544 corrected that to *unmeasured*, on the grounds that the
   *   arrays the round trip actually returned element for element were `bones`
   *   (30), `slots` (24) and `constraints` (3), that every rig in this tree
   *   declares exactly ONE skin, and that a one-element array comes back in
   *   order whatever the editor does with it. Both readings were reached by
   *   generalising from the three arrays that *were* measured — "an editor does
   *   not move arrays" — and the generalisation is what was false. #544 also
   *   said the measurement could not be taken, because the editor refused a
   *   four-skin rig on import without a word: that refusal was rigc's own
   *   harness discarding the editor's stderr, and the editor had named the
   *   cause all along.
   *
   * - ✅ **What round trip 6 added to the `constraints` line is TYPES, not
   *   order** (2026-09-16, Spine 4.3.26, eight rigs). The three that stood here
   *   were `gallery/look`'s, and they are two types: `yaw` and `tilt`
   *   (**slider**) and `whip` (**physics**). The trip carried a `transform`
   *   with its whole 4.3 `source` + `properties` map, a `path` with three
   *   non-default modes, another `physics` and another `slider`, and every one
   *   came back field for field — so the array is now measured over **four**
   *   of the format's types. `ik` is in none of the rigs anybody has
   *   round-tripped, which is why the count is four and not five.
   *
   *   ⚠️ **None of round 6's own constraint arrays can tell order preserved
   *   from a name sort, and reading them as if they could would be #537's
   *   mistake in a second collection.** The three rigs that carry constraints
   *   hold `aim, hold` (xform), `hold, knob` (physlider) and `ride` alone
   *   (pathmodes). All three came back in the order they were given — and all
   *   three were *already* in name order, so a re-sort and a preservation are
   *   the same picture there, exactly as a one-element array is for `skins`
   *   above. ⇒ The order claim still rests entirely on `gallery/look`, whose
   *   build order `yaw, tilt, whip` is **not** name order (`tilt < whip < yaw`)
   *   and which #539 read back unchanged. That one rig is load-bearing and
   *   nothing in this tree re-takes it.
   */
  events?: Record<string, SpineEvent>;
  animations: Record<
    string,
    {
      slots?: Record<string, Record<string, SpineTimelineKey[]>>;
      bones?: Record<string, Record<string, SpineTimelineKey[]>>;
      /**
       * `ik.<constraint> = keys[]` — the constraint IS the timeline, so there is
       * no timeline name between the two. Same for `transform`.
       */
      ik?: Record<string, SpineTimelineKey[]>;
      transform?: Record<string, SpineTimelineKey[]>;
      /** `path.<constraint>.<position|spacing|mix> = keys[]` — the physics shape. */
      path?: Record<string, Record<string, SpineTimelineKey[]>>;
      physics?: Record<string, Record<string, SpineTimelineKey[]>>;
      /** `slider.<constraint>.<time|mix> = keys[]`. */
      slider?: Record<string, Record<string, SpineTimelineKey[]>>;
      /** `attachments.<skin>.<slot>.<attachment>.<timeline> = keys[]` — four deep. */
      attachments?: Record<string, Record<string, Record<string, Record<string, SpineTimelineKey[]>>>>;
      /** Whole-animation timeline: no target name, one array per animation. */
      drawOrder?: SpineTimelineKey[];
      /** The other whole-animation timeline; same shape, same reason. */
      events?: SpineTimelineKey[];
    }
  >;
}

/** One entry of the emitted `skins` array — what `emitSkins` in `src/emit_spine.ts` writes per skin. */
export type SpineSkin = SpineSkeletonJson['skins'][number];

/** One animation of the emitted `animations` object — what `emitAnimations` in `src/emit_spine.ts` writes per animation. */
export type SpineAnimation = SpineSkeletonJson['animations'][string];

/** One entry of the emitted `events` map: the payload a firing inherits. */
export interface SpineEvent {
  int?: number;
  float?: number;
  string?: string;
  audio?: string;
  volume?: number;
  balance?: number;
}

// ---------------------------------------------------------------------------
// Compiler result
// ---------------------------------------------------------------------------

export interface CompiledImage {
  /** Region name = attachment name = PNG basename. */
  region: string;
  /** Atlas page name: the PNG path relative to the atlas file. */
  page: string;
  /** Absolute path on disk, for the size assertions. */
  absPath: string;
  width: number;
  height: number;
  /**
   * A per-pixel alpha channel, and only that — colour types 4 and 6.
   *
   * ⚠️ Not "this part can be transparent": indexed and greyscale art keeps its
   * transparency in a `tRNS` chunk and reads `false` here. Anything asking
   * whether the art can draw a transparent pixel wants `PngInfo.hasTransparency`
   * ([`src/png.ts`](png.ts)), which is the distinction A19 got wrong (#215).
   */
  hasAlpha: boolean;
  isBase: boolean;
  /**
   * The atlas region this part was resolved FROM, when it came out of a
   * pre-packed atlas (`build --atlas-in`). Absent for the ordinary case, where
   * the part is a loose PNG and its region covers its page exactly.
   *
   * Carried rather than flattened because a packed region says things a loose
   * PNG cannot: where on the page it sits, how much border the packer trimmed,
   * whether it is turned. `width`/`height` above are the untrimmed DRAWING's
   * size — the region's `originalWidth`/`originalHeight` divided by the page's
   * `scale:` — so every existing reader of this interface keeps the meaning it
   * had; this field is for the two that need the rectangle itself, in the page's
   * own texels (lifting the drawing back off the page, and reporting the pack).
   *
   * ⚠️ So these two are in DIFFERENT units whenever the page declares a `scale:`
   * other than 1: `width` is world/art size, `atlas.width` is texels. See
   * `atlasScale`.
   */
  atlas?: AtlasRegion;
  /**
   * The `scale:` of the page the region above sits on, when it declares one
   * other than 1. Absent otherwise, and absent for a loose PNG.
   *
   * Present so a message can show its work: `width`/`height` are already
   * descaled, and a refusal that says "region X is 746" without saying it read
   * 373 texels at `scale: 0.5` names a number that is in neither file.
   *
   * And so a figure taken off the lifted texels can be stated in the drawing's
   * pixels, which is what `width`/`height` are in (issue #762): a distance
   * measured on this page's grid is `texels / atlasScale` pixels of the drawing,
   * and a sheet made at the drawing's size is read at the same ratio. It is the
   * value the atlas states, never one rigc measured.
   */
  atlasScale?: number;
  /**
   * The page this region sits on, when that page's file is not the size the
   * atlas declares for it (issue #750): `said` is `pageGridSaid`'s clause and
   * `sentence` is `A06`'s whole sentence (`pageGridSentence`). Absent for a
   * page whose file agrees, and for a loose PNG, which is its own page.
   *
   * Carried because the region lift (`partPlate`) addresses the page at the
   * coordinates the atlas states, and on such a file those are not where the
   * part's texels are: every reader of the lift has to know that before it
   * takes a figure off it.
   */
  pageGrid?: { said: string; sentence: string };
}

/**
 * Structural expectations the validator cannot read out of skeleton JSON.
 *
 * Some invariants of a rig are simply not written down in the artifact:
 * nothing in the file says "this mesh is a ribbon" or "this emitter must not
 * hang off the part that released it". The compiler knows, because the rig
 * spec's `invariants` block says so, and it hands the knowledge over rather than
 * letting the validator guess. Mutants stay honest because a mutant edits the
 * ARTIFACT while this block keeps saying what the rig was supposed to be.
 */
export interface RigInfo {
  /** The rig spec's `name`. Reported by the validator so a green names its rig. */
  archetype: string;
  /** The bone whose setup rotation carries the cut's axis, if the rig has one. */
  axisBone: string | null;
  /** Bones under the axis bone, whose translate keys must stay on the axis. */
  axisSubtree: string[];
  /** [bone, ancestor it must never have] — see `invariants.detached`. */
  detached: Array<[string, string]>;
  /** Canonical draw order (the rig's slot array), or null if it declares none. */
  slotOrder: string[] | null;
  /**
   * slot -> what built this mesh, for the kind-aware mesh assertions.
   *
   * `ring`, `ribbon` and `contour` are rigc's own generators, whose topology it
   * therefore knows: where the rim is, which edge is the entry row, that the
   * rows pair up, that a contour's hull IS every vertex it has.
   * **`authored`** is geometry that came in through the rig spec — drawn by an
   * animator, transcribed from an export — and rigc knows nothing about its
   * topology at all. An assertion that measures generator topology has nothing
   * to say about one, so it SKIPs with that as the reason rather than checking
   * a ring the mesh was never supposed to be.
   */
  meshKinds: Record<string, MeshKind | 'authored'>;
  /**
   * slot -> every bone the compiler bound this mesh to, in the order the `MESH`
   * report line prints them: the slot bone first, then the control bones the
   * generator named.
   *
   * ⭐ A20 reads it to ask the one question a weighted run cannot answer about
   * itself — whether a bone the mesh DECLARES is bound by any vertex at all. A
   * ring that named two grips and bound one was a green build on every
   * per-vertex rule there is, because each of those rules reads a vertex and the
   * missing bone is in none of them (issue #684).
   *
   * ⚠️ On an `authored` mesh this is the set the weights themselves name, so it
   * is a tautology there and A20's clause skips it with the rest of the
   * generator policy — rigc did not choose those bindings.
   */
  meshDeclaredBones: Record<string, string[]>;
  /**
   * Slots whose mesh carries a SOFT region on a second bone, and which bone —
   * from a generator's `soft` block.
   *
   * ⭐ A21 reads it. A rim vertex the mask CARRIED is supposed to move — that
   * is what a soft region is — so the rule splits by declaration rather than
   * being relaxed, exactly as it already splits for a ribbon's entry row: on
   * such a mesh the invariant is that a vertex is either pinned to the slot
   * bone or shared between it and the declared bone, and never anything else.
   */
  meshSoftBones: Record<string, string>;
  /**
   * Slots whose deform timelines may turn a triangle inside out, from
   * `invariants.deformMayFold`. Empty is the ordinary case, and A39 gates every
   * mesh not named here — see `RigInvariants.deformMayFold` for why the default
   * is on.
   */
  deformMayFold: string[];
  /**
   * Ik and transform constraints whose mix the consumer sets, from
   * `invariants.consumerDrivenMix`, in the rig spec's order. `A47` / `A48` do
   * not measure these: a declared constraint is named on the stats line, and it
   * is the SKIP's subject when nothing else of its kind is left to measure. A
   * bare `validate <dir>` has no rig and so no declaration, and refuses every
   * muted constraint as before (issue #784).
   */
  consumerDrivenMix: Array<{ type: 'ik' | 'transform'; constraint: string; why: string }>;
  /**
   * The `why` of `invariants.idleDrivesMeshes`, or null when the rig does not
   * declare that its `idle` deforms meshes on purpose. Declared, `A15` SKIPs
   * with the renderer cost it measured, or FAILs when the `idle` keys no
   * mesh-driving bone and the declaration switches off nothing. A bare
   * `validate <dir>` has no rig, so null, and A15 refuses per bone as before.
   */
  idleDrivesMeshes: string | null;
  /**
   * The lines the rig declares some of its bones to lie along, from
   * `invariants.axes`, in the rig spec's order — each with the two bones whose
   * setup-pose world origins draw it, the bones held to it and the tolerance in
   * degrees. Empty is the ordinary case, and `A51` SKIPs on it. `parseRigSpec`
   * resolved every name and refused every shape before this was built (issue
   * #1351).
   */
  axes: Array<{ name: string; through: [string, string]; bones: string[]; tolerance: number }>;
  /**
   * The atlas region(s) the build names as its base plate — the one image
   * `A19_OVERLAY_PNGS_HAVE_ALPHA` lets be opaque — in compile order.
   *
   * A cut manifest states it: the part whose window IS the crop
   * (`CompiledImage.isBase`), with no stage box involved. A rig spec has no way
   * to state it, so a build from one names none and this is empty. `A19` reads
   * this first and falls back to "an attachment at least the stage's size" only
   * when it is empty (issue #770) — two readings that can disagree need an
   * order, and the statement outranks the measurement.
   */
  basePlates: string[];
  /** Mesh slots this rig budgets for, or null when it declares no budget. */
  meshSlotBudget: number | null;
  /** Triangles one mesh may carry, or null when the rig declares no budget. */
  meshTriangleBudget: number | null;
  /** Deepest inward advance the two masses allow, from the manifest. */
  contactDepth: number | null;
  /**
   * Deepest inward advance at which the cap contour is still covered, from the
   * manifest. Null when the cut has not measured one — A30 then says nothing
   * rather than inventing a wall.
   */
  capContainmentCeiling: number | null;
  /**
   * The bone the inserting mass hangs on. Its own inward keys spend the same
   * clearance the stroke does: if both move in, both close the gap.
   */
  massBone: string | null;
  /** Inward unit vector in SPINE world (y up), for projecting off-axis keys. */
  inwardUnit: [number, number] | null;
}

/**
 * A state the manifest lists whose art was not where the manifest said.
 *
 * Named rather than written inline in `CompileResult` because it outlives the
 * result: a compile that REFUSES returns nothing, and the drops it recorded on
 * the way to that refusal are facts about the inputs the caller still has to be
 * told (issue #671). `CompileError.droppedStates` carries them, and it can only
 * do that if the shape has a name.
 */
export interface DroppedState {
  slot: string;
  state: string;
  path: string;
  /**
   * What was consulted and came up empty, when it was not a file on disk.
   *
   * Absent on the ordinary path, where "no PNG at <path>" says everything. An
   * `--atlas-in` build opened no such file — it looked for a REGION — so
   * reporting the path would send the reader to a directory instead of to the
   * pack that is missing it.
   */
  why?: string;
}

/** Alpha-derived clipping fit, on the source plate's pixel-centre grid. */
export interface AlphaClipReport {
  target: string;
  source: string;
  alpha: number;
  tolerance: number;
  maxVertices: number;
  tracedVertices: number;
  simplifiedVertices: number;
  vertices: number;
  artPixels: number;
  coveredArt: number;
  coverage: number;
  falsePositive: number;
  falseNegative: number;
  /** Original trace-corner distance to simplified outline, in drawing pixels, before binding. */
  maxTraceDeviation: number;
  /** Maximum setup-world displacement caused by final float32 bind/world rounding, in world units. */
  maxBindingDeviationWorld: number;
  overshoot: number;
  /** source normalized UVs in the emitted clipping vertex order, including carrier crossings. */
  uvs: Array<[number, number]>;
}

export interface CompileResult {
  /** Present only for generated clipping; does not alter emitted model/skeleton geometry. */
  alphaClips?: AlphaClipReport[];
  /**
   * The compiled model (`src/model.ts`): what the skeleton below was emitted
   * from. This cut fills its `bones` and `setupWorld`; every other field is
   * this result's own, carried by reference.
   */
  model: CompiledModel;
  /**
   * The Spine 4.3 skeleton: `emitSkeleton`'s value over `model` (issue #922),
   * the one call the assembly makes. `build` writes its text, and beside it
   * `modelDocument(model)` as `skeleton.model.json`.
   */
  skeleton: SpineSkeletonJson;
  skeletonText: string;
  atlasText: string;
  images: CompiledImage[];
  /**
   * Every page of an `--atlas-in` pack whose file is not the size the atlas
   * declares, in the pack's page order, each with `pageGridSaid`'s clause.
   * Empty on the loose and packing routes, and on a pack whose pages agree.
   */
  pageGrids: Array<{ page: string; said: string }>;
  /** States listed in the manifest whose PNG is not on disk. */
  droppedStates: DroppedState[];
  /**
   * Parts the manifest declares and the cut does not carry (`image: null`, no
   * states). Reported rather than swallowed: "the optional slots are optional" is
   * a claim about the emit path, so the emit path says out loud which ones it
   * left out.
   */
  absentParts: Array<{ slot: string; why: string }>;
  /** Declared durations, carried into the validator (rule 4). */
  declaredDurations: Record<string, number>;
  /** Bones that drive a mesh attachment: the slot bone plus its control bone. */
  meshBones: string[];
  /** Mesh slots emitted, with triangle counts — reported by `build`. */
  meshes: Array<{
    slot: string;
    kind: MeshKind | 'authored';
    attachments: string[];
    vertices: number;
    triangles: number;
    bones: string[];
    /**
     * Share of the part's own art the triangles cover, 0..1.
     *
     * Measured for every mesh that names an `image`, generated or authored: it is
     * a number between two things the compiler has in front of it — the emitted
     * triangles and the PNG — and it assumes nothing about how the vertices are
     * arranged (issue #277). Absent on a mesh with no `image`, which has nothing
     * to be measured against, and on a `ring` or `ribbon`, whose window size
     * comes from the spec rather than from art.
     */
    coverage?: number;
    /**
     * How far past the silhouette that mesh reaches, in the DRAWING's pixels —
     * the unit `CompiledImage.width` is in, and the one an author draws in.
     *
     * The distance is measured on the grid the part's alpha is read off, and on
     * a page that declares a `scale:` that grid is the page's texels, so it is
     * divided by the stated scale here (issue #762). It printed 8.00px on a
     * `scale: 0.5` page for a mesh that reaches 16.00px past the same drawing
     * on the page it was packed from. `pageScale` says when that happened.
     */
    overshoot?: number;
    /**
     * The `scale:` of the page the fit above was measured on, when it is not 1
     * (`CompiledImage.atlasScale`). Absent on a loose part and on a page at
     * scale 1, where the texel grid is the drawing's. Carried so the report can
     * say the figure was taken on a grid whose step is `1 / pageScale` pixels
     * of the drawing, which is the precision it has.
     */
    pageScale?: number;
    /**
     * Why `coverage` and `overshoot` are absent on a mesh that names an image:
     * its part sits on a packed page whose file is not the size the atlas
     * declares, and this is `pageGridSaid`'s clause for that page (issue #750).
     * The fit is a measurement between the triangles and the part's texels,
     * and the coordinates the atlas states do not locate those texels on such
     * a file, so the figure is withheld rather than taken off the wrong ones.
     */
    fitWithheld?: string;
    /**
     * Transparent pixels the traced outline encloses — inside the mesh, drawing
     * nothing. Only a `contour` has one: it is a property of the trace, and an
     * authored mesh was not traced.
     */
    holePixels?: number;
    /**
     * The soft region a `soft` block carried to its own bone, when one was
     * named — the mask, its digest, and how many vertices it reached.
     *
     * ⚠️ Separate from `depth` on purpose. It WAS a depth threshold and that
     * conflated two properties: the most prominent thing on a face is the nose,
     * and a nose does not wobble.
     */
    soft?: { mask: string; digest: string; bone: string; carried: number; ramped: number };
    /**
     * How a `segments` mesh's bones share its vertices — the figures `build`
     * and `explain` print under its line. Only `segments` has one: it is the
     * generator whose weights are the whole point, and every other generator's
     * weighting is fixed by its kind.
     */
    influence?: {
      /** Most bones any one vertex binds, and the mean over the mesh. */
      maxBones: number;
      meanBones: number;
      /** Vertices bound to exactly one bone. */
      singleBone: number;
      /** The bones some vertex binds, in the order `bones` names them. */
      bound: string[];
      /** The lattice: its cell, cells across and down, cells with art, cells kept, islands joined. */
      cell: number;
      cols: number;
      rows: number;
      artCells: number;
      keptCells: number;
      islands: number;
      /**
       * Present only when the mesh is weighted by an `influence` block (issue
       * #1415): the block as stated, how many vertices had more links in reach
       * than `max` — the vertices the cap dropped a link from — and the most
       * links in reach at any one vertex, which is the `max` that would drop none.
       */
      reach?: {
        radius: number;
        across: boolean;
        max: number;
        shape: 'linear' | 'smooth';
        capped: number;
        widest: number;
      };
    };
    /**
     * What a depth map put on this mesh's vertices, when one was named.
     *
     * The digest is over the levels rather than the file, so a re-encode of the
     * same sheet reports the same provenance; `range` is what was actually
     * sampled. Absent when no map was named — never zeroes, which would read as
     * "sampled and found flat".
     *
     * ⚠️ This comment sat above `soft` rather than above the field it describes
     * until issue #449 came to add to it, which is the same drift `CUR07` was
     * built for one file over — nothing derives a doc comment's neighbour.
     */
    depth?: {
      /** The sheet, as written in the spec. */
      image: string;
      /** First 16 hex of a sha256 over width, height and levels. */
      digest: string;
      near: 'white' | 'black';
      zScale: number;
      /** The stated curve, in full — `1 / 1 / 0` is the straight line. */
      tone: { gamma: number; contrast: number; bias: number };
      /** Least and greatest `z` over the mesh's vertices, in attachment units. */
      range: [number, number];
      /**
       * How many of the mesh's vertices took their depth from a texel **the
       * part image does not draw** (issue #449).
       *
       * ⚠️ Not what `range` says, and this is the field that exists because
       * `range` was claimed to say it. A map that is half background has
       * exactly as full a range as one that is all subject, because a
       * background level is a legitimate depth — so a full-frame sheet over a
       * cut-out part reports a healthy `[0, 223.97]` of 224 with 54 % of the
       * mesh reading background.
       *
       * A count and never a refusal: the same defect is already a named refusal
       * when the sheet's alpha is cut to the art, and a sheet that is opaque
       * everywhere is a statement rigc has no authority to guess away. Zero is
       * a real answer here rather than an absence — every mesh that names a
       * depth map also names an image, so the measurement is taken whenever
       * the image's texels can be located.
       *
       * `null` is the one case they cannot (issue #750): a part lifted off a
       * packed page whose file is not the size its atlas declares, where the
       * coordinates the atlas states are not where the part's texels are. The
       * count is withheld rather than taken off whatever sits there — a
       * number measured over the wrong pixels reads exactly like a right one.
       */
      undrawn: number | null;
      /** `pageGridSaid`'s clause for the page, exactly when `undrawn` is `null`. */
      unlocated?: string;
      /**
       * The turn this geometry takes on this sheet before a triangle reverses,
       * per axis and per direction — `src/depth.ts`'s `turnCeiling`.
       *
       * ⭐ It is what an author needs BEFORE writing a key, and the loop it
       * replaces is "pick an angle, build, read `A39`'s refusal, guess again".
       * A report and never a refusal: `A39` owns the refusal, from the artifact.
       */
      ceiling: TurnCeiling;
    };
  }>;
  /** Structural expectations handed to the validator. */
  rig: RigInfo;
  /** Physics constraints emitted, with the bone each one drives. */
  physics: Array<{ name: string; bone: string; components: string[]; mix: number; drivesMesh: boolean }>;
  /**
   * Deform keys that stated a `transform` instead of a run, one entry per key in
   * emit order — reported by `explain` (issue #294).
   *
   * ⭐ The report carries the offsets it **emitted**, not a second evaluation of
   * the same model, so the printed audit and the artifact cannot disagree — and
   * where the two are not one array, `expanded` carries the second (issue #389).
   * An empty array is the ordinary case: a spec whose deform keys are all
   * authored runs generated nothing to report.
   */
  deformTransforms: Array<
    DeformTransformReport & {
      animation: string;
      skin: string;
      slot: string;
      attachment: string;
      /** The key's own time, as emitted. */
      time: number;
      /**
       * The deform array actually written, when it is not `offsets` itself
       * (issue #389).
       *
       * Present only on a multi-influence attachment, where the model is
       * evaluated at setup **world** positions and `offsets` is therefore one
       * world displacement per vertex, while the array holds one `Mᵢ⁻¹ · D` pair
       * per bone INFLUENCE. Absent everywhere else, because there the two are
       * the same numbers and a second copy of them could only ever drift.
       */
      expanded?: number[];
    }
  >;
  /**
   * Group-track keys whose per-member values were **stated as a map** or
   * **derived from a model**, one entry per key in emit order — reported by
   * `explain` (issue #295).
   *
   * ⭐ Both spellings are here, and that is the point of the report rather than
   * an accident of it: what an author needs to see is the members' values *side
   * by side*, and whether they were transcribed or derived is one column of that
   * table. The values carried are the **emitted** ones, so the printed audit and
   * the artifact cannot disagree.
   */
  trackDerivations: Array<{
    animation: string;
    /** The group the track named, or the bone if a bone track stated a model. */
    target: string;
    /** `group` or `bone` — which field carried the target. */
    targetKind: 'group' | 'bone';
    property: string;
    /** The key's own time, as emitted for the FIRST member (before any `stagger`). */
    time: number;
    /** The authored key time, which is what the spec names. */
    authoredTime: number;
    /** Absent when the key stated a `v` map rather than a model. */
    model: TrackDeriveReport | null;
    /** Every member's emitted value, in member order. */
    members: Array<{ member: string; value: number[] | string | null }>;
  }>;
}
