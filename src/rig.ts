/**
 * The rig spec — `"spec": "rigc-rig/1"`. The skeleton as **data**.
 *
 * Until this file existed the bone tree and the slot table were code: three
 * hard-coded formations in `src/archetype.ts`, a slot outside their tables a
 * compile error, and therefore **no skeleton anybody else owns could be stated
 * at all**. That was blocker B1 of [docs/LADDER.md](../docs/LADDER.md), and it
 * gated every rung of the benchmark ladder.
 *
 * ## The vocabulary is Spine's
 *
 * ⭐ Wherever rigc has no better abstraction, this format uses **Spine 4.3's own
 * concept and its own field name, with Spine's own default**, so that an agent
 * that has read Spine's documentation can author a rig here without learning a
 * second vocabulary. `bones[]` is Spine's bone list; `slots[]` is Spine's slot
 * list and its array order is the draw order; `skins` holds Spine's placeholder
 * → attachment maps; `constraints[]` is 4.3's single typed constraint array.
 * Field lists below cite `SkeletonJson.ts` line numbers, which
 * [docs/SPEC_COVERAGE.md](../docs/SPEC_COVERAGE.md) part 1 enumerates in full.
 *
 * Everything rigc adds sits **on top** of that vocabulary and is namespaced so a
 * reader can see where Spine stops:
 *
 * - `from` on a bone — take this bone's setup position from the cut manifest
 *   (an anchor, a part window, a mesh centre) instead of writing a literal that
 *   would drift away from the measured art.
 * - `generator` on a mesh attachment — build the geometry with one of the
 *   builders in `src/mesh.ts` instead of authoring vertex arrays by hand.
 * - `image` on an attachment — name a PNG and let rigc **measure** it, rather
 *   than restating a `width`/`height` that can silently disagree with the file
 *   (SPEC_COVERAGE part 1-6: a missing `width` loads as `NaN`, with no error).
 * - `invariants` — the structural facts skeleton JSON cannot state about itself,
 *   which the validator's archetype assertions read. Nothing in the file says
 *   "this bone carries the cut's axis" or "this parentage is forbidden".
 * - `stops` — a swinging chain held off a leg, one declaration for the network
 *   of bones and constraints it stands for (`RigStop`), expanded into plain
 *   bones and constraints before anything else reads the rig.
 *
 * ## What a field's PRESENCE means
 *
 * 🔑 **A field is emitted exactly when the spec declares it.** Not "when it
 * differs from the default" — Spine's own exporter omits defaults, but rigc
 * cannot, because a rig may need to say `x: 0` out loud (the overlay formation's
 * handle bone does) and because deciding emission from the *value* makes the
 * emitted file depend on arithmetic rather than on what the author wrote. Omit a
 * field and Spine's default stands; write it and it is in the file. A bone whose
 * position comes `from` the manifest counts as declaring `x` and `y`, because
 * the manifest declared them.
 *
 * ## What this format does NOT own
 *
 * rigc joins three files and each owns a domain:
 *
 * - the **cut manifest** owns measured geometry — crop, part offsets and sizes,
 *   mask polygons, the state machine, anchors, the axis, the measured ceilings;
 * - the **rig spec** (this file) owns skeleton structure — bones, slots, skins,
 *   constraints, and the invariants;
 * - the **motion spec** owns time — named easings, groups, setup pose, the
 *   physics tuning table, and the animations.
 *
 * A cut compiled from all three declares its attachments in the manifest (see
 * `slots` below for the join rule) and leaves `skins` empty. A foreign skeleton
 * with no manifest at all declares them here.
 */
import { ikShapeFault } from './assertions/bodies/a47.ts';
import { CompileError, NotImplementedError } from './errors.ts';
import { expandStops } from './stop.ts';
import { dottedPath, refuseNumbersTheFileCannotCarry, refuseUnknownKeys, refuseValuesOfTheWrongType, refuseValuesOutsideTheirSet } from './keys.ts';
import type { ShapeVisit, SpecEnumTable, SpecValueType } from './keys.ts';

export { CompileError, NotImplementedError };

/** The only version this compiler reads. */
export const RIG_SPEC_VERSION = 'rigc-rig/1';

// ---------------------------------------------------------------------------
// skeleton header — `root.skeleton` (SkeletonJson.ts:75-87)
// ---------------------------------------------------------------------------

/**
 * The stage and the runtime hints, all optional.
 *
 * 🔁 The four box fields here are rigc's **stage** — the working area the art
 * was painted in, the frame the coordinate transform and `A14`/`A19` read —
 * and not the Spine header's box of the same names, which the format defines
 * as the setup-pose bounding box. Since issue #907 `build` writes that box
 * into the header, computed from the rig (`headerBoundsOf` in
 * `src/compile.ts`), and states the stage in `skeleton.model.json`.
 *
 * `x`/`y` default to 0 and `width`/`height` fall back to the cut manifest's crop
 * when there is one. With neither a manifest nor a declaration here the compile
 * fails by name: `width`/`height` are what `A14_NO_FULL_FRAME_MESH` and
 * `A19_OVERLAY_PNGS_HAVE_ALPHA` measure against, and a guessed stage is a gate
 * that measures against a number nobody wrote down.
 *
 * ⭐ **`width: null, height: null` is the third state: this skeleton declares no
 * stage** (issue #578). Omitting them is silence and stays a refusal by name;
 * stating them `null` is a claim, and the emitted header then carries none of
 * `x`/`y`/`width`/`height` — which is what an editor export of a skeleton whose
 * bounds were never set looks like, and what a transcriber of one has to be able
 * to write down. `null` is this spec's spelling for a stated absence everywhere
 * else it has one (`RigSlot.attachment` = "show nothing", the cut manifest's
 * `image` = "this cut does not carry the part"), so it is the spelling here too
 * and no new key is introduced: the pair already exists, and only a third value
 * of it is new.
 *
 * Two shapes are refused rather than interpreted, both in `parseRigSpec`:
 * stating one of the pair `null` and the other a number (a stage with one
 * extent is not a stage, and guessing which half was meant is inventing), and
 * stating `x` or `y` alongside the absence (an origin for a box that is not
 * there). ⚠️ A stated absence also beats a cut manifest's `crop`, for the reason
 * a stated `width` already does: the rig spec is where a claim about the
 * skeleton is made, and the manifest is a record of what the art measured.
 *
 * `spine` is not here: rigc emits its own version label and `A16` re-checks it.
 * `hash` is not here either — it is the editor's change-detection token and
 * inventing one would be claiming an export this file did not come from.
 */
export interface RigSkeletonHeader {
  x?: number;
  y?: number;
  /** A number, or `null` with `height` for "this skeleton declares no stage". */
  width?: number | null;
  /** A number, or `null` with `width` for "this skeleton declares no stage". */
  height?: number | null;
  /** Nonessential; `SkeletonData.fps` stays 30 when absent. */
  fps?: number;
  /** 4.2+; the runtime's physics/scale reference. Parser default 100. */
  referenceScale?: number;
  /**
   * Nonessential: where the editor's import looks for the part images, as a path
   * from the skeleton file. Declared here it is carried through verbatim; absent,
   * rigc writes the path from `--out` to the one directory the spec names every
   * part PNG in — `--out` itself, spelled `../<its basename>/`, under
   * `--copy-images`, which moved them beside the skeleton and overrides a
   * declaration for the same reason it rewrites the atlas's page names (the
   * editor drops a literal `./` on import; a named directory it keeps). Parts
   * spread over several directories have no single true path, so nothing is
   * written (issue #370).
   */
  images?: string;
  /**
   * Nonessential: where the editor looks for the skeleton's audio files, as a
   * path from the skeleton file — or `null`, which is what an editor export
   * writes when no audio folder is set. Carried verbatim, `null` included, and
   * written only when stated: rigc has no audio to point at, so this is a value
   * a spec states or does not (issue #716 — every one of the twelve editor
   * exports under `examples/` writes `"audio": null`, and `ingest` carries it).
   */
  audio?: string | null;
  /**
   * Carry the stage in the Spine files as a bounding-box attachment — opt-in,
   * and absent changes no emitted byte (issue #1168). See `RigStageBox`.
   */
  stageBox?: RigStageBox;
}

/**
 * Where the stage travels in the shipped Spine files: one bounding-box
 * attachment `build` writes from the stage, never from numbers typed here
 * (issue #1168).
 *
 * ⭐ **Why it is needed.** Since issue #907 the header's `x`, `y`, `width`,
 * `height` are the setup-pose bounding box — what the format says they are —
 * and the stage is stated in `skeleton.model.json`. A consumer that ships
 * `skeleton.json`, the atlas and its pages and nothing else has no stage to
 * fit the rig to. A key the format does not define would be read by no
 * runtime and dropped by the editor without a word; a bounding box is returned
 * by every runtime by slot and name, in JSON and in binary.
 *
 * The box's four vertices are the stage's corners in Spine world — `(x, y)`,
 * `(x + width, y)`, `(x + width, y + height)`, `(x, y + height)`, the
 * bottom-left first and counter-clockwise, y up — written unweighted in the
 * slot bone's space. Its numbers come from the stage alone, so they cannot
 * drift from the frame the coordinate transform reads.
 *
 * 🔒 **The rules, each refused by name in `compile`:**
 *
 *   - `slot` is a slot `slots` declares, and nothing else fills it — no skin
 *     entry and no manifest part. The box is the slot's one attachment, filed
 *     in the `default` skin under `attachment`. Its setup pose is the slot's
 *     own, stated the way any slot's is (the rig slot's `attachment`, or the
 *     motion spec's `setup`) — name the box there for a slot that shows it at
 *     setup, which is what a reader of the slot's current attachment sees.
 *   - The slot hangs on the **root**, and the root states no setup
 *     transform — no `x`, `y`, `rotation`, scale or shear. The vertices are
 *     then the stage's numbers themselves, which a reader of the attachment
 *     data gets without posing anything. A bone below the root is refused
 *     even when it states nothing: the runtime spells an unrotated frame's
 *     `b` as cos 90° at its pi (−2.3e-8), once per level, so the posed box
 *     lands on the stage through the root's frame — the residue the header's
 *     own box already carries — and drifts further at every level below it.
 *     A constraint that moves the root at setup is not seen by `compile`,
 *     which poses none; `A50_STAGE_BOX_IS_THE_STAGE` names it.
 *   - The rig declares a stage. Asking for its box with `"width": null,
 *     "height": null` asks for a box around nothing.
 *
 * ⚠️ The claim is the setup pose's. An animation that keys the root moves the
 * box with it, as it moves anything else on the root; the stage is the
 * attachment's vertices, read at setup or straight off the data.
 */
export interface RigStageBox {
  /** The slot the box goes in, declared in `slots`; its `bone` is the box's bone. */
  slot: string;
  /** The box's attachment name — its placeholder in the `default` skin and its `Attachment.name`. */
  attachment: string;
}

/**
 * Does this header state that the skeleton has no stage?
 *
 * One reading of the spelling, exported so that the compiler, the emitter and
 * anything that grows a third opinion later read it the same way. `parseRigSpec`
 * has already refused the half-stated shapes by the time this is asked, so the
 * two `null`s travel together.
 */
export function declaresNoStage(header: RigSkeletonHeader | undefined): boolean {
  return header !== undefined && header.width === null && header.height === null;
}

// ---------------------------------------------------------------------------
// bones — `root.bones[]` (SkeletonJson.ts:90-118)
// ---------------------------------------------------------------------------

/**
 * `BoneData.ts:80`. Resolved by `Utils.enumValue`, which upper-cases the first
 * letter, so `"noScale"` and `"NoScale"` both load; rigc accepts either and
 * emits the lower-camel spelling the editor writes.
 *
 * ⚠️ 4.0/4.1 called this field `transform`. That name still *loads* in 4.3 and
 * the inheritance silently falls back to Normal — assertion `A02`.
 */
export type RigBoneInherit = 'normal' | 'onlyTranslation' | 'noRotationOrReflection' | 'noScale' | 'noScaleOrReflection';

export const RIG_BONE_INHERIT: readonly RigBoneInherit[] = [
  'normal',
  'onlyTranslation',
  'noRotationOrReflection',
  'noScale',
  'noScaleOrReflection',
];

/**
 * The mode a spelling of `inherit` resolves to, in the table's own spelling —
 * or `undefined` for one the runtime cannot resolve.
 *
 * ⭐ **One rule for both places the format spells a mode**: a bone's setup
 * `inherit` and an `inherit` timeline key are read by the same call,
 * `Utils.enumValue(Inherit, name)`, which is `Inherit[name[0].toUpperCase() +
 * name.slice(1)]` — the FIRST letter is folded and nothing else. So `noScale`
 * and `NoScale` resolve and `NOSCALE` or `noscale` do not, and a spelling that
 * misses loads as `undefined`: the setup pose holds no mode at all and a
 * timeline frame holds NaN, and in both cases `updateWorldTransform`'s switch
 * matches no case and leaves the world matrix where it was. Nothing throws.
 *
 * 🚨 The setup check was **case-insensitive** until issue #733, which is wider
 * than the runtime's rule by exactly that silence: `"inherit": "NOSCALE"`
 * compiled, gated green on all 45 assertions, and loaded `setupPose.inherit ===
 * undefined`. Measured, not argued — and a key read through the same wide rule
 * would have shipped the same spelling into a timeline.
 */
export function resolveBoneInherit(value: unknown): RigBoneInherit | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  const folded = value[0].toLowerCase() + value.slice(1);
  return RIG_BONE_INHERIT.find((mode) => mode === folded);
}

/**
 * The value REQUIRED, as both refusals of an unresolvable mode print it: the
 * five, and the one liberty the runtime's lookup allows.
 */
export const BONE_INHERIT_KNOWN =
  `known: ${RIG_BONE_INHERIT.join(', ')} — the runtime folds the case of the first letter and of nothing else`;

/**
 * Take a bone's setup transform from the cut manifest rather than from a literal.
 *
 * ⭐ This is the one place the rig spec deliberately does not mirror Spine, and
 * the reason is the oldest rule in this project: **the compiler never re-measures
 * art, and a measured number lives in exactly one file.** A rig that wrote
 * `x: 456.5` would be a second copy of a part offset the manifest already holds,
 * and the two would drift the first time the art moved — silently, because both
 * files would still be valid.
 *
 * Exactly one of `anchor` / `slotWindow` / `meshCenter` may be given, and it
 * supplies the bone's `x` and `y`. All three name a point in **crop pixels, y
 * down**; the compiler converts it to Spine world (y up, origin at the crop's
 * bottom-left) and then into the parent bone's local space, so a rotated parent
 * is handled by the same inverse the mesh binder uses.
 */
export interface RigBoneFrom {
  /** A key of the manifest's `anchors` block: `[x, y]` or `[x, y, facing_deg]`. */
  anchor?: string;
  /** The centre of a manifest part's window, named by the rig slot it fills. */
  slotWindow?: string;
  /** A manifest part's `mesh.center` — the aperture a ring deforms about. */
  meshCenter?: string;
  /**
   * Where the setup rotation comes from. Omit and no rotation is emitted.
   *
   *   `axis`   — the manifest's `axis.deg`, negated into Spine's y-up CCW. This
   *              is the keystone of an articulated cut: the stroke is a
   *              translateX along this bone, so a sibling cut at another camera
   *              angle changes one number instead of every key.
   *   `anchor` — the third element of the named anchor, a screen-space facing
   *              angle. A grip whose local +X points radially outward turns
   *              "expand the ring" into one shared translate key.
   */
  rotation?: 'axis' | 'anchor';
}

/**
 * One bone. Spine's field set, Spine's defaults (`SkeletonJson.ts:90-118`).
 *
 * `parent` is resolved by name and **must be declared earlier in the array** —
 * the parser resolves against the bones it has already read, so a forward
 * reference is not a rigc restriction.
 */
export interface RigBone {
  name: string;
  /** Omitted only by the skeleton's single root bone. */
  parent?: string;
  /**
   * Default 0. Drawing reads it nowhere, but a physics constraint driving
   * `rotate`, `shearX` or `scaleX` on this bone steps off its tip — `length`
   * along the bone's x axis is the solver's lever — so a length of 0 there is
   * refused by `A23_PHYSICS_CONSTRAINT_EFFECTIVE` (issue #1195).
   */
  length?: number;
  /** Local to the parent. Default 0. Supplied by `from` when that is given. */
  x?: number;
  y?: number;
  /** Degrees, CCW, y up. Default 0. Supplied by `from.rotation` when given. */
  rotation?: number;
  /** Default 1. */
  scaleX?: number;
  scaleY?: number;
  /** Default 0. */
  shearX?: number;
  shearY?: number;
  /** Default `normal`. 4.2+ name; 4.0/4.1 called it `transform` — see A02. */
  inherit?: RigBoneInherit;
  /**
   * Default false → `BoneData.skinRequired`: this bone is **inactive** unless the
   * applied skin names it in its `bones` list (see `RigSkinEntry`). Half a switch
   * on its own, so rigc refuses the flag without a skin that activates it.
   */
  skin?: boolean;
  /** `rrggbbaa`. Editor affordance; no rendering effect. */
  color?: string;
  /**
   * The editor's icon for this bone. Editor affordance; no rendering effect,
   * and no assertion checks the name — the icon vocabulary belongs to the
   * editor, so an unknown one is not rigc's error to raise.
   */
  icon?: string;
  /** rigc extension — see `RigBoneFrom`. */
  from?: RigBoneFrom;
}

// ---------------------------------------------------------------------------
// slots — `root.slots[]` (SkeletonJson.ts:121-141)
// ---------------------------------------------------------------------------

/**
 * `SlotData.ts:64`, read by `SkeletonJson.js:124` through `Utils.enumValue`, so
 * only the first letter's case is free: `additive` and `Additive` read
 * `Additive`, while `ADDITIVE`, `mUlTiPlY` and `foo` read as no mode with no
 * error (issue #946, measured with `tools/pose_oracle.ts dump` on spine-core
 * 4.3.13). The parser refuses those by name and the emitter writes the
 * spelling as stated, which is one the runtime resolves.
 */
export type RigSlotBlend =
  | 'normal'
  | 'additive'
  | 'multiply'
  | 'screen'
  | 'Normal'
  | 'Additive'
  | 'Multiply'
  | 'Screen';

/** The four modes, as a refusal names them; each also reads with its first letter upper-cased. */
export const RIG_SLOT_BLEND: readonly RigSlotBlend[] = ['normal', 'additive', 'multiply', 'screen'];

/** Whether the runtime resolves a stated blend to a mode: its first letter folded, the rest exactly one of the four. */
export function isRigSlotBlend(value: unknown): value is RigSlotBlend {
  return typeof value === 'string' && (RIG_SLOT_BLEND as readonly string[]).includes(value.charAt(0).toLowerCase() + value.slice(1));
}

/**
 * One slot. **The array order IS the draw order** — there is no separate setup
 * draw-order field anywhere in the format.
 *
 * The rig's slot list is the CANONICAL table and **every slot in it is emitted**,
 * in this order, whether or not anything fills it. A slot no skin and no manifest
 * part fills is emitted with no setup attachment — the shape an editor export
 * carries for a slot that shows nothing (the slot reader above takes `attachment`
 * with a `null` default) — so the emitted array and this one are the same array.
 * `A26_SLOT_DRAW_ORDER` checks both halves of that: nothing out of order, and
 * nothing missing. Declaring a slot no cut fills is therefore legitimate, and it
 * fixes where that slot sits whether or not this cut has art for it.
 *
 * ⚠️ Until issue #575 such a slot was **dropped**, and the gate licensed it: the
 * emitted array was allowed to be any *subsequence* of this one. What that
 * bought was the format's own silence. Nothing said which slot had gone, and
 * every slot below it moved up one index — the index a `drawOrder` key's offsets
 * are counted against, and the one an index-keyed consumer splits on. Two
 * production exports declaring 53 and 61 slots built green at 51 and 57 and read
 * 0.962 and 0.934 under `diff` against the file they were transcribed from.
 */
export interface RigSlot {
  name: string;
  /** Required. A miss throws in the parser: `Couldn't find bone … for slot …`. */
  bone: string;
  /**
   * The setup-pose attachment name, or `null` for "show nothing".
   *
   * ⚠️ For a cut compiled with a motion spec this is **not** where the setup pose
   * comes from: `motion.setup` owns it, because which of the two overlay
   * mechanisms a slot uses (attachment + alpha 0, or attachment swapping) is a
   * decision about time. Declaring it in both is a compile error.
   *
   * Required for a slot something fills — the compiler will not guess which of
   * the slot's attachments the setup pose shows — and **optional for a slot
   * nothing fills**, where it can only be `null` and saying so changes no
   * emitted byte. Naming an attachment on a slot nothing fills is refused: the
   * name resolves to nothing, which is the shape of a half-finished wiring-up.
   */
  attachment?: string | null;
  /** `rrggbbaa`. Default opaque white. */
  color?: string;
  /** Two-colour tint, `rrggbb`. 🚫 `A12_NO_DARK_COLOR` under `rig-play`. */
  dark?: string;
  /** Default `normal`. Only the first letter's case is free (`RigSlotBlend`). */
  blend?: RigSlotBlend;
}

// ---------------------------------------------------------------------------
// attachments — `readAttachment` (SkeletonJson.ts:535-654)
// ---------------------------------------------------------------------------

/**
 * A greyscale sheet, in a part's own pixel grid, giving each vertex a depth —
 * what `yaw` and `pitch` otherwise derive from one cylinder radius.
 * [`src/depth.ts`](depth.ts) is the model and the order of operations;
 * `docs/FACE.md` §2.1 is when to reach for it.
 *
 * ⚠️ Naming it changes no emitted byte on its own. It puts a `z` on every
 * vertex, which a `yaw` or `pitch` key then reads by saying `"depth": true`
 * instead of a `radius`. A map that nothing reads is reported and otherwise
 * inert — deliberately, so that adding the input and adopting it are two
 * reviewable steps rather than one.
 */
export interface RigDepthMap {
  /**
   * The sheet, relative to the rig's `images` directory, and the same pixel
   * size as this attachment's own `image`.
   *
   * It is NOT packed into the atlas: it is a measurement rigc reads at compile
   * time, not art anything draws. A sheet that reached the atlas would be a
   * page the runtime loads and never samples.
   */
  image: string;
  /**
   * Which end of the range is closest to the viewer. Stated rather than
   * defaulted, because both conventions are in use and a sheet that means the
   * opposite of what the spec assumes produces a part that turns inside out —
   * with every gate still green, since the arithmetic is correct and only the
   * input was backwards.
   */
  near: 'white' | 'black';
  /**
   * How many units the map's full 0..1 range spans: setup world units on an
   * authored mesh, the generator's bind units on a generated mesh.
   *
   * Authored, never measured: 8 bits of level say nothing about scale, so a
   * compiler that picked one would be inventing the depth of the art.
   */
  zScale: number;
  /** Tone curve applied to the nearness. Defaults 1 / 1 / 0, a straight line. */
  gamma?: number;
  contrast?: number;
  bias?: number;
}

/**
 * Which part of a mesh is **soft**, and which bone carries it — so a physics
 * constraint on that bone answers an impact over exactly that region.
 *
 * ## Why this is a painted mask and not a depth threshold
 *
 * 🚨 It was a depth threshold for one day (2026-09-05) and that was wrong.
 * Softness and prominence are different properties of the art: on a face the
 * most prominent thing is the **nose**, and a nose does not wobble. A threshold
 * over the depth map produced a region that was plausible, gated green and
 * carried the wrong pixels — the exact shape of failure this compiler exists to
 * refuse, arrived at by reaching for a number that was already in the manifest.
 *
 * It also claimed something untrue. "No mask painted" was the selling line, and
 * a consumer rendering the same effect had a hand-painted spring mask all
 * along. rigc does not get to delete an input by guessing it.
 *
 * ⇒ The mask is authored, like `zScale` and like every other number here that
 * describes a decision about the art rather than a measurement of it.
 */
export interface RigSoftRegion {
  /**
   * The bone the soft region is carried by. It must already exist — a bone a
   * physics constraint targets is part of the skeleton, not a side effect of a
   * mesh.
   */
  bone: string;
  /**
   * A greyscale sheet in the part's own pixel grid: the level IS the weight,
   * black still and white fully carried, sampled at each vertex.
   *
   * ⭐ The ramp is painted rather than parameterised. A `feather` would be this
   * file guessing the shape of a falloff somebody can simply draw, and a hard
   * edge — which a threshold gives you by default — puts the whole difference
   * between carried and still into one triangle.
   *
   * Alpha is not read: a transparent pixel is black, which is weight 0.
   */
  mask: string;
}

/**
 * Directional authority across an axis — see `sideWeight` in
 * [`mesh.ts`](mesh.ts).
 *
 * ⭐ It was an inline object type until issue #545. The four generator kinds
 * were too: the union is spelled as four **named** interfaces now because
 * `RIG_KEYS` pairs a key set with an interface by name, and a shape with no name
 * is a shape the pairing cannot reach — so an anonymous corner of this file
 * would have been a corner whose key set nothing checked.
 */
export interface RigMeshBias {
  /** The axis, in SCREEN degrees, y down — a manifest's own convention. */
  axis_deg: number;
  /** Signed distance across that axis over which authority goes 0 -> 1. */
  ramp: [number, number];
}

/** A ring: a seam contour, an aperture inside it, and the bones that open it. */
export interface RigRingGenerator {
  kind: 'ring';
  /** The seam contour, in part-local pixels, y down. At least 6 points. */
  hull: Array<[number, number]>;
  /** Aperture centre, part-local pixels, y down. */
  center: [number, number];
  /** Inner ring position between the centre (0) and the hull (1). */
  inner: number;
  /** Part window size, for UVs. */
  size: [number, number];
  /** Directional authority across an axis — see `sideWeight` in mesh.ts. */
  bias?: RigMeshBias;
  /**
   * Control bones, by name. More than one splits the ring by angle, and the
   * angle of each is measured from where the rig put that bone relative to
   * `center` — never stated here, so the split cannot drift from the skeleton.
   */
  controls: string[];
}

/** A ribbon: a strip of cross rows riding a bone chain. */
export interface RigRibbonGenerator {
  kind: 'ribbon';
  /** Part window size in pixels. The strip spans it. */
  size: [number, number];
  /** Cross rows, entry first. Triangles = 2 * (rows - 1). */
  rows: number;
  /** The bone chain the strip rides, root first. */
  chain: string[];
}

/**
 * A mesh cut to the part's own alpha silhouette: trace the mask, simplify
 * the outline, push it out by a margin, ear-clip it (`buildContourMesh`).
 *
 * ⭐ It takes no `size` and no geometry. The shape is MEASURED off the
 * attachment's own `image` — the same rule a region attachment's
 * `width`/`height` follow (R5) — so there is no number here that can
 * disagree with the pixels, and no polygon to keep in step with the art.
 *
 * 🚨 It is geometry, not a deformation model: every vertex is pinned to
 * the slot bone at weight 1, so an undeformed contour mesh draws exactly
 * what the region drew and no bone can bend it. See the section header in
 * [`src/mesh.ts`](mesh.ts) for what it buys instead, and reach for `ring`
 * or authored `weights` when a bone has to move the art.
 */
export interface RigContourGenerator {
  kind: 'contour';
  /**
   * Douglas-Peucker tolerance in the drawing's pixels — the unit every other
   * size here is in, on a packed page that declares a `scale:` as on loose
   * parts: there the trace runs on the page's texels and this is applied as
   * `tolerance × scale` of them (issue #779). Bigger spends fewer vertices
   * and cuts more corners; the builder measures how much of the art the
   * result still covers and refuses a mesh that clips it.
   */
  tolerance: number;
  /**
   * How far the outline is pushed out past the traced silhouette, in the
   * drawing's pixels (`margin × scale` texels on a `scale:` page). Default 1. Simplification may bite `tolerance` pixels INTO the art, so
   * `margin >= tolerance` is the setting that survives the coverage check.
   */
  margin?: number;
  /** Refuse rather than emit more outline vertices than this. Default 64. */
  maxVertices?: number;
  /** Alpha at or above which a pixel counts as art, 1..255. Default 1. */
  alpha?: number;
  /** A depth map for this part — see `RigDepthMap`. */
  depth?: RigDepthMap;
  /** A soft region carried by its own bone — see `RigSoftRegion`. */
  soft?: RigSoftRegion;
}

/**
 * A lattice over the part window — the topology `docs/FACE.md` §4 turns a
 * plate into so a turn has columns to move.
 *
 * ⭐ It takes no `size`: like a `contour`, the window is the attachment's
 * own `image`, so there is no number here that can disagree with the
 * pixels. Every vertex is pinned to the slot bone at weight 1, which
 * makes the lattice geometry to DEFORM rather than an authority split —
 * reach for `ring` when bones have to move it.
 */
export interface RigGridGenerator {
  kind: 'grid';
  /**
   * Column positions across the window, 0..1, ascending. At least 2.
   *
   * ⚠️ Positions, not a count, and that is deliberate: FACE §4.1 places
   * columns where the drawing needs them, and the worked example's are
   * dense at the silhouette and sparse across the middle. They need not
   * reach the window edge — that example's run 0.0235 to 0.9765.
   */
  us?: number[];
  /** Row positions down the window, 0..1, ascending. At least 2. */
  vs?: number[];
  /**
   * Even division instead: `cols` columns and `rows` rows spanning the
   * whole window. A convenience for a plate with no shape to follow, and
   * refused beside `us`/`vs`, which say the same thing more precisely.
   */
  cols?: number;
  rows?: number;
  /** A depth map for this part — see `RigDepthMap`. */
  depth?: RigDepthMap;
  /** A soft region carried by its own bone — see `RigSoftRegion`. */
  soft?: RigSoftRegion;
}

/**
 * One segment stated outright, for a pull that no bone's own span describes.
 *
 * `from` and `to` are in the part's own pixels, y down — the frame every other
 * point a generator takes is in (`ring.center`, `ring.hull`). The bone is
 * resolved by name like everything else; the two points belong to this mesh
 * alone, which is the case a bone's `length` cannot cover: two meshes over one
 * bone that each want it to pull along a different line.
 */
export interface RigSegmentSpan {
  bone: string;
  from: [number, number];
  to: [number, number];
}

/**
 * How distance to a segment becomes a weight: `w = 1 / (d + radius)^power`
 * per candidate bone, the strongest `maxBones` kept and normalised, any share
 * under `minWeight` dropped, the rest normalised again.
 */
export interface RigSegmentsFalloff {
  /** The exponent. Default 2. */
  power?: number;
  /**
   * **Required.** Added to every distance, in the part's pixels, so a vertex
   * ON a segment has a finite weight and the blend between two segments is as
   * wide as this says. No default: it is a length on this part's art.
   */
  radius: number;
  /** At most this many bones pull one vertex. Default 4. */
  maxBones?: number;
  /** A normalised share under this is dropped. Default 0.03. */
  minWeight?: number;
}

/** The two curves an `influence` pull falls to zero along — see `RigSegmentsInfluence.shape`. */
export const RIG_INFLUENCE_SHAPES = ['linear', 'smooth'] as const;

/**
 * A falloff that **reaches zero** at a stated distance, so a vertex follows
 * every chain link near it and no link far from it (issue #1415) — the model a
 * cloth surface needs, where a vertex between two chains blends the springs of
 * both and the surface bends as one sheet rather than as strips.
 *
 * Per vertex: `d` is the distance to each link's **segment** (its nearest
 * point, the same distance `falloff` measures), read at the setup pose. A link
 * with `d < radius` pulls `shape(d / radius)` — one whose pull is not above 0
 * in doubles, a hair inside the reach, pulls nothing; the strongest `max` pulls are
 * kept — equal pulls in the order `bones` first names their bones — and
 * normalised; a share the 6-decimal grid would write as 0 is dropped and the
 * rest normalised again. Each vertex lists its bones in the order `bones`
 * names them, so the attachment has one bone order by construction (A52).
 *
 * ⭐ Every number is a field and none has a default: the reach and the cap are
 * judgements about this cloth, and the shape is the one thing that decides
 * how a link enters a vertex's blend.
 */
export interface RigSegmentsInfluence {
  /**
   * **Required.** How far a link reaches, in the part's pixels (the skeleton's
   * units on this generator's route): a link whose segment is `radius` or
   * farther from a vertex never pulls it. Positive.
   */
  radius: number;
  /**
   * **Required.** `true`: every link of every `bones` entry within `radius`
   * pulls. `false`: only the links of ONE entry — the entry holding the link
   * nearest the vertex, the earlier entry on a tie — so a chain moves its own
   * strip and nothing across.
   */
  across: boolean;
  /** **Required.** At most this many links pull one vertex — the strongest. A whole number of at least 1. */
  max: number;
  /**
   * **Required.** How a pull falls from 1 at `d = 0` to 0 at `d = radius`, with
   * `x = d / radius`: `"linear"` is `1 - x`; `"smooth"` is `1 - x²(3 - 2x)`,
   * which also arrives at both ends with zero slope, so a link enters and leaves
   * a vertex's blend without a crease.
   */
  shape: (typeof RIG_INFLUENCE_SHAPES)[number];
}

/**
 * A lattice over the part's alpha, weighted by distance to named bone segments
 * (`buildSegmentsLattice` and `segmentWeights` in [`mesh.ts`](mesh.ts)).
 *
 * ⭐ The one authoring decision is `bones` — which segments may pull this part.
 * The geometry comes off the attachment's own `image`, the segments off the
 * skeleton's setup pose, and the weights off the distance between the two, so
 * nothing else here is a judgement about the art.
 */
export interface RigSegmentsGenerator {
  kind: 'segments';
  /** **Required.** The lattice's cell, in the part's pixels, a whole number of at least 1. */
  cell: number;
  /**
   * **Required, at least one entry.** Each is a bone name (origin to its
   * `length` tip), a chain — a list of bone names, root first, each link
   * running from its origin to the next link's (the last to its `length` tip) —
   * or a `RigSegmentSpan` stated outright.
   */
  bones: Array<string | string[] | RigSegmentSpan>;
  /**
   * The falloff — see `RigSegmentsFalloff`. Exactly one of `falloff` and
   * `influence` is stated: both turn a distance into a share, in two models,
   * and a mesh weighted by both would be weighted by neither.
   */
  falloff?: RigSegmentsFalloff;
  /** A falloff that reaches zero at a stated distance — see `RigSegmentsInfluence`. */
  influence?: RigSegmentsInfluence;
  /** Alpha at or above which a pixel counts as art, 1..255. Default 1 — `contour`'s own. */
  alpha?: number;
  /**
   * Where the slot bone sits in the part's pixels, y down. Default the window's
   * centre — the placement every generator on this route uses.
   */
  anchor?: [number, number];
}

/**
 * Which builder in `src/mesh.ts` makes this mesh's geometry, and its parameters.
 *
 * The builders stay **code** and are invoked by **data**: they encode a
 * deformation model (what is pinned, what may move, how authority falls off),
 * and a model is not a table of numbers.
 *
 * ⚠️ A cut with a manifest does not use this. There the generator is invoked
 * through the manifest's `mesh` block, because everything a generator needs —
 * the mask contour, the aperture centre, the part window — is *measured art*,
 * and measured art lives in the manifest. `generator` is for a skeleton with no
 * manifest behind it.
 */
export type RigMeshGenerator =
  | RigRingGenerator
  | RigRibbonGenerator
  | RigContourGenerator
  | RigGridGenerator
  | RigSegmentsGenerator;

/** The five `kind` names a generator may carry, and the order `RIG_KEYS` takes them in. */
export const RIG_GENERATOR_KINDS = ['ring', 'ribbon', 'contour', 'grid', 'segments'] as const;

/**
 * The attachment's own NAME, as distinct from the placeholder key it is filed
 * under — one field, the same on every attachment type (issue #796).
 *
 * `readAttachment` reads `name = getValue(map, "name", placeholder)`
 * (`SkeletonJson.js:526`) for every type, so this is the runtime's
 * `Attachment.name` — what a consumer reads off `slot.attachment.name` — and,
 * on the three types that draw, the default of `path` (`:529`, `:560`). Absent,
 * the runtime names the attachment by its placeholder.
 *
 * 🔑 Nothing in the format resolves BY it. A skin's table, a slot's setup
 * `attachment`, an attachment or deform timeline and a linked mesh's `source`
 * are all keyed by the placeholder (`:415-418`, `:433`, `:1140`) — measured: a
 * link whose `source` spells its source's name rather than its key throws
 * `Source mesh not found`. So two skins may give one placeholder two
 * attachments of one name, and the runtime keeps both.
 *
 * ⭐ rigc writes this field exactly when the spec states it and never derives
 * one. Until #796 it composed `<skin>/<placeholder>` for a placeholder several
 * skins fill, and a transcribed name had no field to live in — so a rebuild of
 * an editor export answered to other names than its source did, which a
 * consumer reading `attachment.name` can see and no gate could.
 */
export type RigAttachmentName = string;

/** `SkeletonJson.ts:540-559`. `type` defaults to `region` (`:539`). */
export interface RigRegionAttachment {
  type?: 'region';
  /** The runtime's attachment name — see `RigAttachmentName`. Absent, it is the placeholder. */
  name?: RigAttachmentName;
  /** The atlas region to resolve. Defaults to the attachment's own name. */
  path?: string;
  /**
   * rigc extension: a PNG, relative to the rig's `images` directory.
   *
   * ⭐ Naming a file instead of a size is the point. `width`/`height` have **no
   * parser default** — an omission loads as `NaN` and every UV collapses with no
   * error — so a spec that restates them by hand carries a number that can
   * disagree with the pixels. Give an `image` and rigc reads the PNG header and
   * fills both in; the atlas page it emits is that same file, so the size in the
   * skeleton and the size in the atlas cannot drift apart.
   */
  image?: string;
  x?: number;
  y?: number;
  /** Degrees. Cancels a rotated bone for a plate authored in screen space. */
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  /** Required by the format; may be omitted here when `image` is given. */
  width?: number;
  height?: number;
  /** `rrggbbaa`. */
  color?: string;
  /** A numbered image series in place of one region — see `RigSequence`. */
  sequence?: RigSequence;
}

/**
 * A numbered image series drawn by ONE attachment — `readSequence`
 * (`SkeletonJson.js:641-649`), on a region, a mesh or a linked mesh.
 *
 * The attachment's `path` (or, with none, its placeholder) is the series'
 * **stem**, and frame `i` is the atlas region `stem + (start + i)` left-padded
 * with zeros to `digits` — `Sequence.getPath` (`Sequence.js:124-132`), which
 * `AtlasAttachmentLoader.findRegions` walks for every `i` below `count`. A
 * `sequence` timeline (the motion spec's `sequence` family) chooses which frame
 * shows; without one, the frame is `setup`.
 *
 * ⭐ **The frames resolve by name and a missing one is refused by name.** On the
 * loose route frame `i` is the PNG `<images>/<region>.png`; under `--atlas-in`
 * it is the pack's region of that name. The compiler looks each one up and names
 * the frame number and the region it looked for when one is absent — it never
 * stands one frame in for another, and the loader's own miss
 * (`Region not found in atlas`) names neither the frame nor the series.
 *
 * ⚠️ An attachment carrying a sequence states no `image`: an image names one
 * region and a sequence names `count` of them, so the pair would be two claims
 * about what the attachment draws. And no `generator`: a generator traces one
 * plate, and which frame it should trace is not something the spec says.
 */
export interface RigSequence {
  /**
   * How many frames. **Required** — the parser's default is 0
   * (`new Sequence(getValue(map, "count", 0), true)`), which loads an attachment
   * holding no region at all and draws nothing, with no error.
   */
  count: number;
  /** The number the first frame's name carries. Parser default 1. */
  start?: number;
  /** Zero-pad the frame number to at least this many digits. Parser default 0 (no padding). */
  digits?: number;
  /**
   * The frame the setup pose shows, 0-based. Parser default 0. Spelled as the
   * FILE spells it (`getValue(map, "setup", 0)`); `setupIndex` is the runtime's
   * field name and is not a key the format has.
   */
  setup?: number;
}

/**
 * `SkeletonJson.ts:568-605`. Either authored geometry or a `generator`, never
 * both.
 *
 * ⚠️ `vertices` has no encoding flag anywhere in the format. If its length
 * equals `uvs.length` the parser reads unweighted x/y pairs; otherwise it reads
 * the weighted run `boneCount, (boneIndex, bindX, bindY, weight) × n, …`. A
 * coincidental length match reads weight data as coordinates, silently — which
 * is `A04_MESH_TRIANGLES_AND_ENCODING`.
 */
/**
 * One bone's pull on one vertex of an authored mesh, **named**.
 *
 * `x`/`y` are the vertex's position in that bone's own setup space — the same
 * pair Spine's weighted run carries after the bone index. `weight` is its share;
 * a vertex's weights sum to 1.
 */
export interface RigMeshBinding {
  /** Resolved against the rig's bone list at emit. An unknown name is refused. */
  bone: string;
  x: number;
  y: number;
  weight: number;
}

export interface RigMeshAttachment {
  type: 'mesh';
  /** The runtime's attachment name — see `RigAttachmentName`. Absent, it is the placeholder. */
  name?: RigAttachmentName;
  path?: string;
  image?: string;
  /** Its length defines `worldVerticesLength`; required with authored geometry. */
  uvs?: number[];
  triangles?: number[];
  /**
   * Geometry, in one of two forms.
   *
   * **Unweighted** — one `x, y` pair per uv pair, and `vertices.length` equals
   * `uvs.length`. Nothing here names a bone, so nothing here can be rebound.
   *
   * **Weighted, raw** — Spine's own encoding,
   * `boneCount, (boneIndex, bindX, bindY, weight) x n` per vertex, where
   * `boneIndex` is a position in the EMITTED bone array. 🚨 That array is not
   * something a rig spec writes or can see, so those indices shift under any
   * edit to the bone list and every vertex silently rebinds — the mesh still
   * loads, every weight still sums to 1, and nothing in the file objects. rigc
   * therefore refuses this form unless the attachment says `boneIndexing: "raw"`
   * out loud. Use `weights` instead.
   */
  vertices?: number[];
  /**
   * Weighted geometry that binds **by name**: one entry per vertex, each a list
   * of `{ bone, x, y, weight }`. This is the default form and the one everything
   * else in a rig spec already uses — a bone's `parent`, a slot's `bone`, a
   * constraint's `bones` and `target` all resolve by name and refuse a miss by
   * name. The compiler resolves these to indices on emit, so inserting a bone
   * moves the indices and changes nothing about what the mesh is bound to.
   *
   * Mutually exclusive with `vertices`.
   */
  weights?: RigMeshBinding[][];
  /**
   * How a weighted `vertices` run names its bones. Default `"name"`, which means
   * "there is no weighted run here — use `weights`". `"raw"` opts into the index
   * encoding above, for a spec transcribed from an export that has not been
   * migrated yet. It is an opt-in because the cost of it is silence.
   */
  boneIndexing?: 'name' | 'raw';
  /** Hull vertex count. The loader stores it doubled. */
  hull?: number;
  /** Edge index pairs; nonessential, editor-drawn. */
  edges?: number[];
  width?: number;
  height?: number;
  color?: string;
  /** Build the geometry instead of authoring it — see `RigMeshGenerator`. */
  generator?: RigMeshGenerator;
  /** A setup-world depth turn over authored geometry; sampled in the part's pixel grid. */
  depth?: RigDepthMap;
  /** A numbered image series over this one triangulation — see `RigSequence`. */
  sequence?: RigSequence;
}

/**
 * A mesh that borrows another mesh's geometry — Spine's `linkedmesh`, the type
 * a skin variant uses to draw its own art over one triangulation.
 *
 * 🔑 **`source` is the source attachment's PLACEHOLDER — the key it is filed
 * under in its skin — and not its `name`.** The resolution is
 * `skin.getAttachment(sourceSlotIndex, source)` (`SkeletonJson.js:433`), and a
 * skin's table is keyed by the JSON key `readSkin` iterated (`:415-418`), so a
 * source that states a `name` of its own is still found under its placeholder
 * alone — and a `source` spelling that name throws `Source mesh not found`.
 * Two skins each filling the source's placeholder are told apart by `skin`,
 * never by a name (issue #796, which retired #541's reading that a link
 * resolves its source by name).
 *
 * 🚨 **A linked mesh states no geometry of its own, and the parser is silent
 * about one that does.** The `source` branch returns before `readVertices`
 * (`:582-586`), so `uvs`, `triangles`, `vertices`, `weights`, `hull` and `edges`
 * on a link are read by nothing at all. Measured on a forged skeleton: a link
 * declaring 5 uvs, 3 triangles, `hull: 5` and `edges: [0, 2]` beside a 4-vertex
 * source loaded with the SOURCE's 8-long `worldVerticesLength`, 6 triangles,
 * `hullLength` 8 and 10 edges — the numbers the author wrote reached nothing and
 * nothing said so. rigc refuses them by name.
 *
 * ⚠️ `width`/`height` are the link's own art, and the RUNTIME overwrites both
 * with the source's at resolution time (`MeshAttachment.setSourceMesh`,
 * `:102-103`; measured: a link stating 99x77 beside a 32x32 source loads as
 * 32x32). They are emitted because the editor reads them off the file and
 * because the spec stated them, and the gate cannot see them — which is the
 * reason this note exists rather than an assertion.
 */
export interface RigLinkedMeshAttachment {
  type: 'linkedmesh';
  /** The runtime's attachment name — see `RigAttachmentName`. Absent, it is the placeholder. */
  name?: RigAttachmentName;
  /** The art this link draws, exactly as a mesh's: its own region. */
  path?: string;
  image?: string;
  /**
   * The placeholder of the mesh whose geometry this one borrows. Required — and
   * required in the strong sense: `getValue(map, "source", null)` is FALSY-tested
   * (`:582`), so an absent or empty `source` is not a link at all and the parser
   * falls through to `map.uvs`, which a link does not have, and throws.
   */
  source: string;
  /**
   * The slot the source lives in. Default: **the link's own slot**
   * (`sourceIndex = slotIndex`, `:571-580`). Resolved by name; a slot the rig
   * does not declare is refused.
   */
  slot?: string;
  /**
   * The skin the source lives in. Default: **the default skin**
   * (`!linkedMesh.skin ? skeletonData.defaultSkin : findSkin(...)`, `:429`).
   * Resolved by name; a skin the rig does not declare is refused.
   */
  skin?: string;
  /**
   * Whether the link plays the source's deform keys. Default **true**, which
   * also sets `timelineAttachment` to the source and adds this link's slot to
   * the source's `timelineSlots` when the two differ (`:437-448`). `false` makes
   * the link its own `timelineAttachment`, so only keys written against the link
   * itself move it.
   */
  timelines?: boolean;
  width?: number;
  height?: number;
  color?: string;
  /** The link's OWN numbered series — see `RigSequence`. */
  sequence?: RigSequence;
  /**
   * 🚫 Every geometry field a mesh may state, refused by name on a link. They
   * are declared so the refusal can name them: a key the shape
   * does not hold at all comes back as *keys this compiler does not read … fix
   * the spelling or remove it*, and the remedy sentence is wrong here — the
   * fault is not a typo, it is that the parser reads none of them on a link.
   */
  uvs?: number[];
  triangles?: number[];
  vertices?: number[];
  weights?: RigMeshBinding[][];
  boneIndexing?: 'name' | 'raw';
  hull?: number;
  edges?: number[];
  generator?: RigMeshGenerator;
}

/**
 * The geometry every non-region attachment shares: a polygon, either pinned to
 * one bone or weighted across several.
 *
 * ⭐ `vertexCount` is REQUIRED and cross-checked, and that is the whole design of
 * these two types. A mesh gets its vertex count from `uvs.length`, so there is
 * nothing to state; a bounding box and a clipping polygon have no uvs, and the
 * parser reads `map.vertexCount << 1` — with the field absent that is
 * `undefined << 1` = **0**, so `readVertices` takes the weighted branch,
 * decodes coordinates as a weight run, and hands back an attachment with no
 * vertices at all. Nothing throws. So the count is declared here and checked
 * against whichever encoding the spec used.
 *
 * The two encodings are the mesh's, unchanged, and for the same reason:
 * `weights` binds by NAME and is the default; `vertices` is either an unweighted
 * `x, y` run (one pair per vertex) or Spine's index-encoded weighted run, and
 * the second of those needs `boneIndexing: "raw"` said out loud because a bone
 * inserted anywhere above shifts every index in silence (issue #45).
 */
export interface RigVertexGeometry {
  /** Required. No parser default: absent reads as 0 and the polygon vanishes. */
  vertexCount: number;
  /**
   * Unweighted `x, y` pairs (`vertices.length === vertexCount * 2`), or Spine's
   * weighted run behind `boneIndexing: "raw"`. Mutually exclusive with `weights`.
   */
  vertices?: number[];
  /** Weighted geometry bound by name — one entry per vertex. The default form. */
  weights?: RigMeshBinding[][];
  /** `"raw"` opts a `vertices` weighted run into the index encoding. */
  boneIndexing?: 'name' | 'raw';
  /** `rrggbbaa`. Editor affordance: the colour the box is drawn in. */
  color?: string;
}

/**
 * `type: "boundingbox"` (`SkeletonJson.ts:560-567`).
 *
 * **When you need one:** a polygon the game can hit-test against — a hurt box, a
 * pick region, a trigger volume — that moves with the skeleton and draws
 * nothing. It is the only attachment type whose entire purpose is outside the
 * renderer, which is why it has no `path`, no size and no uvs.
 */
export interface RigBoundingBoxAttachment extends RigVertexGeometry {
  type: 'boundingbox';
  /** The runtime's attachment name — see `RigAttachmentName`. Absent, it is the placeholder. */
  name?: RigAttachmentName;
}

/**
 * `type: "clipping"` (`SkeletonJson.ts:635-651`).
 *
 * **When you need one:** a mask. The polygon clips every slot drawn from the one
 * carrying it up to and including `end`, so a window, a portal or a wipe is one
 * attachment rather than a second set of art.
 *
 * ⚠️ `end` is resolved with `skeletonData.findSlot(end)`, which returns **null**
 * on a miss and assigns that null without complaint (`:626-627`). The clip then
 * never ends — it runs to the bottom of the draw order and takes every slot
 * below it with it. rigc refuses a name the rig does not declare.
 */
export interface RigClippingAttachment extends RigVertexGeometry {
  type: 'clipping';
  /** The runtime's attachment name — see `RigAttachmentName`. Absent, it is the placeholder. */
  name?: RigAttachmentName;
  /**
   * The last slot this clip applies to, by name. Absent leaves `endSlot` null,
   * which is the parser's own encoding for "clip everything after this one".
   */
  end?: string;
  /** 4.3. Default false. */
  convex?: boolean;
  /** 4.3. Default false. */
  inverse?: boolean;
}

/**
 * `type: "path"` (`SkeletonJson.ts:606-623`) — a composite cubic Bezier the
 * skeleton carries as an attachment.
 *
 * **When you need one:** a path constraint has nowhere to aim without it. The
 * polygon here is not drawn (no runtime renders a path); it is the curve
 * `RigPathConstraint` slides bones along, and it deforms with the slot's bone
 * like any other vertex attachment.
 *
 * 🚨 **`vertexCount` is knots AND handles, and it must be a multiple of 3.**
 * The parser hands `vertexCount << 1` to `readVertices` and then walks the
 * result in groups of six (`PathConstraint.computeWorldPositions`): the first
 * and last points are the outer control handles of the end knots and are
 * dropped, leaving a `3K + 1` chain — so an OPEN path of K curves has
 * `vertexCount = 3(K + 1)` (minimum 6) and a CLOSED one has `3K` (minimum 3,
 * because the chain wraps). A count that is not a multiple of 3 does not throw:
 * `Utils.newArray(vertexCount / 3, 0)` accepts a fractional size, the groups of
 * six then straddle the knots, and the constraint slides bones along a curve
 * nobody drew.
 *
 * ⭐ `lengths` is **stated or measured** (issue #804). It is the cumulative
 * length at the end of each curve, in world units, and `vertexCount / 3` entries
 * on an open path and a closed one alike — the parser's allocation, one more
 * than an open path's curves, the last being the wrap-around curve's cumulative,
 * which nothing reads. Stated, it is emitted as stated: that is what `ingest`
 * writes from an export, because the editor measured it on a pose rigc does not
 * reproduce (below). Left out, rigc measures it off the geometry on the
 * unconstrained setup pose. Only `constantSpeed: false` reads it.
 *
 * ⚠️ Why a stated one is not re-measured: the editor's numbers are
 * `PathConstraint`'s own measurement of the pose the first update gives it —
 * with every constraint ordered before the path constraint applied. rigc does
 * not pose, so an authored path whose bones a constraint moves at rest gets the
 * unconstrained figure, and an export's own array is the only way to carry the
 * constrained one. Re-deriving it moved 232 of a production rig's 259 bones in
 * issue #804's pose comparison.
 *
 * 🔸 *Which* length, exactly, is `SpinePathAttachment`'s subject in
 * [`types.ts`](types.ts) and it is not the arc: it is `PathConstraint`'s own
 * four-sample forward difference, about 0.5 % below the arc, which is what the
 * Spine editor writes back too (issue #560). This comment said "arc length"
 * until then.
 */
export interface RigPathAttachment extends RigVertexGeometry {
  type: 'path';
  /** The runtime's attachment name — see `RigAttachmentName`. Absent, it is the placeholder. */
  name?: RigAttachmentName;
  /** Default false. When true the last knot joins the first. */
  closed?: boolean;
  /**
   * Default **true** (`:610`) — note the direction: leaving it out asks for the
   * expensive-and-correct traversal, in which the runtime re-measures the path
   * every frame and `lengths` is never read. `false` makes the runtime trust the
   * emitted `lengths` instead: cheaper, exact only while the path holds its setup
   * shape, and the reason a deformed path wants the default.
   */
  constantSpeed?: boolean;
  /**
   * Stated: exactly `vertexCount / 3` finite entries, none below the one before
   * it, emitted as stated. Absent: measured — see the note above.
   */
  lengths?: number[];
}

/**
 * The two types the format holds and rigc's emitter does not cover. They are
 * in the type so a spec can *say* them and get a named `NotImplementedError`;
 * the alternative is the parser's own behaviour, which is to return `null` for
 * an unknown `type` and drop the attachment without a word
 * (`SkeletonJson.ts:653`).
 *
 * 🚧 It appears nowhere in the benchmark corpus, so it is not on the ladder's
 * critical path — which is the reason it is deferred rather than an oversight.
 * `linkedmesh` stood here beside it until issue #691; `RigLinkedMeshAttachment`
 * is the shape that replaced it.
 */
export interface RigUnimplementedAttachment {
  type: 'point';
  [field: string]: unknown;
}

export type RigAttachment =
  | RigRegionAttachment
  | RigLinkedMeshAttachment
  | RigMeshAttachment
  | RigBoundingBoxAttachment
  | RigClippingAttachment
  | RigPathAttachment
  | RigUnimplementedAttachment;

/** `slotName -> placeholderName -> attachment` (`SkeletonJson.ts:431-439`). */
export type RigSkinAttachments = Record<string, Record<string, RigAttachment>>;

/** The five per-type constraint lists a skin entry can carry (`:386-429`). */
export const RIG_SKIN_CONSTRAINT_KEYS = ['ik', 'transform', 'path', 'physics', 'slider'] as const;

export type RigSkinConstraintKey = (typeof RIG_SKIN_CONSTRAINT_KEYS)[number];

/**
 * Every key the long form of a skin entry owns.
 *
 * ⚠️ Which is exactly the set of names a SLOT may not have, because these are
 * the keys that tell the two forms apart — see `splitRigSkin`. `parseRigSpec`
 * refuses such a slot by name rather than letting one form be read as the other.
 */
export const RIG_SKIN_KEYS = ['attachments', 'bones', ...RIG_SKIN_CONSTRAINT_KEYS] as const;

/**
 * A skin's full 4.3 shape: attachments, plus the bones and constraints this skin
 * **activates** (`SkeletonJson.ts:377-429`).
 *
 * ⭐ The lists are not a second way to declare a bone or a constraint. They are
 * the other half of a switch whose first half already existed: a bone's
 * `skin: true` and a constraint's `skin: true` set `skinRequired`, and
 * `Skeleton.updateCache` starts every `skinRequired` object **inactive**, turning
 * it on only for the skin that names it here (`Skeleton.ts:191-217`; a listed
 * bone activates its whole ancestor chain). So either half alone is dead data,
 * in opposite directions and both in silence — `skin: true` with no list is a
 * bone that never poses, a list without `skin: true` is a list that changes
 * nothing — which is why rigc refuses both halves by name and
 * `A38_SKIN_MEMBERS_ARE_SKIN_REQUIRED` checks the artifact for them.
 */
export interface RigSkinEntry {
  /** `slotName -> placeholderName -> attachment`. */
  attachments?: RigSkinAttachments;
  /** Bone names this skin activates. Each one must declare `skin: true`. */
  bones?: string[];
  /** `ik` constraint names this skin activates. Each must declare `skin: true`. */
  ik?: string[];
  transform?: string[];
  path?: string[];
  physics?: string[];
  slider?: string[];
}

/**
 * One skin, in either of two spellings.
 *
 * The short one — `slotName -> placeholderName -> attachment` — is the shape
 * every rig spec in this repository already uses and it stays exactly that. The
 * long one carries the 4.3 lists beside the attachments and is recognised by its
 * own keys (`RIG_SKIN_KEYS`); see `splitRigSkin` for the one ambiguity that
 * creates and how it is refused rather than guessed.
 */
export type RigSkin = RigSkinAttachments | RigSkinEntry;

/** The two halves of a skin entry, whichever spelling the spec used. */
export interface RigSkinParts {
  attachments: RigSkinAttachments;
  bones: string[];
  constraints: Record<RigSkinConstraintKey, string[]>;
  /** True when the spec used the long form. Only the messages care. */
  explicit: boolean;
}

/**
 * Normalise one skin entry.
 *
 * ⚠️ The two spellings are told apart by the keys in `RIG_SKIN_KEYS`: a skin
 * that uses any of them is the long form. That is the one thing here that could
 * ever be ambiguous, and it is ambiguous in exactly one case — a rig with a SLOT
 * of one of those names — so rigc does not guess: `parseRigSpec` refuses such a
 * slot by name, because the alternative is a member list read as a slot's
 * placeholder table or the other way round.
 *
 * In the long form EVERY key must be one of them. A key outside the set is
 * almost always a slot name left behind by a half-finished conversion from the
 * short form, so it is refused with that as the message rather than ignored — an
 * ignored slot is an attachment that vanishes.
 */
export function splitRigSkin(skin: RigSkin, where: string): RigSkinParts {
  const empty = (): Record<RigSkinConstraintKey, string[]> => ({
    ik: [],
    transform: [],
    path: [],
    physics: [],
    slider: [],
  });
  if (!isObj(skin)) throw new CompileError(`${where}: a skin must be an object`, 'CE_RIG_SKIN_OBJECT');
  const known = new Set<string>(RIG_SKIN_KEYS);
  const keys = Object.keys(skin);
  if (!keys.some((key) => known.has(key))) {
    return { attachments: skin as RigSkinAttachments, bones: [], constraints: empty(), explicit: false };
  }
  const entry = skin as RigSkinEntry;
  if (entry.attachments !== undefined && !isObj(entry.attachments)) {
    throw new CompileError(`${where}: "attachments" is \`slotName -> placeholderName -> attachment\`, not ${JSON.stringify(entry.attachments)}`, 'CE_RIG_SKIN_ATTACHMENTS_SHAPE');
  }
  for (const key of keys) {
    if (known.has(key)) continue;
    throw new CompileError(
      `${where}: uses the long form (it declares ${keys.filter((k) => known.has(k)).map((k) => `"${k}"`).join(', ')}) ` +
        `and also has a key "${key}". In that form every key is one of ${RIG_SKIN_KEYS.join(', ')} — so "${key}" reads ` +
        'as neither a member list nor a slot, and a slot left outside the block is an attachment that vanishes. ' +
        'Move it inside "attachments".', 'CE_RIG_SKIN_LONG_FORM_STRAY_SLOT',
    );
  }
  const nameList = (value: unknown, field: string): string[] => {
    if (value === undefined) return [];
    if (!Array.isArray(value)) throw new CompileError(`${where}: "${field}" must be an array of names, not ${JSON.stringify(value)}`, 'CE_RIG_SKIN_MEMBERS_ARRAY');
    return value.map((name, i) => {
      if (typeof name !== 'string' || name.length === 0) {
        throw new CompileError(`${where}: ${field}[${i}] is ${JSON.stringify(name)}; a skin lists bones and constraints BY NAME`, 'CE_RIG_SKIN_MEMBER_NAME');
      }
      return name;
    });
  };
  const constraints = empty();
  for (const key of RIG_SKIN_CONSTRAINT_KEYS) constraints[key] = nameList(entry[key], key);
  return {
    attachments: entry.attachments ?? {},
    bones: nameList(entry.bones, 'bones'),
    constraints,
    explicit: true,
  };
}

// ---------------------------------------------------------------------------
// constraints — `root.constraints[]` (SkeletonJson.ts:144-369), the 4.3 shape
// ---------------------------------------------------------------------------

/**
 * A constraint's identity in this format: its KIND and its name, never the name
 * alone (issue #692).
 *
 * `SkeletonData.findConstraint(name, type)` tests `constraint instanceof type`
 * before it compares the name, so `ik` `leg` and `transform` `leg` are two
 * objects and every resolution in the format — a timeline group, a skin's member
 * list, a slider's animation pass — reaches exactly one of them. It doubles as
 * the phrase a refusal uses, so the key a lookup misses on and the words the
 * message says it missed on cannot drift apart.
 *
 * @internal
 */
export function constraintAt(type: string, name: string): string {
  return `${type} constraint "${name}"`;
}

/**
 * 4.3 folds every constraint into ONE array with a `type` discriminator. The
 * 4.1/4.2 shape — top-level `ik`/`transform`/`path`/`physics` arrays — still
 * loads clean and the constraints simply vanish, which is `A01`.
 *
 * 🚨 An entry whose `type` matches no case is dropped with no error and no
 * `default:` branch (`:148-367`). rigc therefore refuses an unknown `type` by
 * name rather than passing it through.
 */
export interface RigConstraintCommon {
  name: string;
  /**
   * Default false → `skinRequired` (`:147`): the constraint does not run unless
   * the applied skin lists it under its own type (see `RigSkinEntry`). Half a
   * switch on its own, so rigc refuses the flag without a skin that activates it.
   */
  skin?: boolean;
}

/**
 * `ScaleYMode` (`ConstraintData.ts:37-45`), which an **ik** and a **physics**
 * constraint both carry under the JSON key `scaleY`.
 *
 * ⚠️ Resolved by `Utils.enumValue`, so only the first letter's case is free and
 * an unresolved name is assigned as `undefined` without a word — the hazard
 * `RIG_PATH_POSITION_MODES` is checked for, at a field that had no check at all.
 */
export const RIG_SCALE_Y_MODES = ['None', 'Uniform', 'Volume'] as const;

/** The three names, as a rig spec writes them. */
export type RigScaleYMode = 'none' | 'uniform' | 'volume' | 'None' | 'Uniform' | 'Volume';

/** `type: "ik"` (`:149-176`). `scaleY` is 4.3's replacement for 4.2's `uniform`. */
export interface RigIkConstraint extends RigConstraintCommon {
  type: 'ik';
  /**
   * One bone, or two where the second's parent is the first; resolved by
   * name, and a miss throws in the parser. Any other shape is refused by name
   * (issue #1205): the runtime applies nothing for three or more, and solves
   * a pair through the first bone's matrix from the second's local offset, so
   * a bone standing between them is left out of the triangle it solves.
   */
  bones: string[];
  target: string;
  /** `ConstraintData.ts:50`. Absent → `None`. */
  scaleY?: RigScaleYMode;
  /** Default 1. */
  mix?: number;
  /** Default 0. */
  softness?: number;
  /** Default true → `bendDirection = ±1`. */
  bendPositive?: boolean;
  /** Default false. */
  compress?: boolean;
  stretch?: boolean;
}

/**
 * One entry of a transform constraint's `properties` map: which source property
 * drives which target properties, and by how much (`:241`, `:521`).
 *
 * The `from` and `to` names are drawn from a fixed six — `rotate`, `x`, `y`,
 * `scaleX`, `scaleY`, `shearY` — and **anything else throws in the parser**.
 */
export interface RigTransformProperty {
  offset?: number;
  to: Record<string, RigTransformTo>;
}

/** One driven property of a `RigTransformProperty.to` map. */
export interface RigTransformTo {
  offset?: number;
  max?: number;
  scale?: number;
}

/** `type: "transform"` (`:177-268`) — rebuilt from scratch in 4.3. */
export interface RigTransformConstraint extends RigConstraintCommon {
  type: 'transform';
  bones: string[];
  /** 4.2 called this `target`. */
  source: string;
  localSource?: boolean;
  localTarget?: boolean;
  additive?: boolean;
  clamp?: boolean;
  /** `fromName -> { offset, to: { toName -> { offset, max, scale } } }`. */
  properties?: Record<string, RigTransformProperty>;
  /** The offsets array. Default 0 each. */
  rotation?: number;
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
  shearY?: number;
  /**
   * Default 1. ⚠️ Each mix is read **only if the matching `to` property was
   * declared** (`:259-264`), so a mix without its property is dead data.
   */
  mixRotate?: number;
  mixX?: number;
  /** Defaults to `mixX`. */
  mixY?: number;
  mixScaleX?: number;
  /** Defaults to `mixScaleX`. */
  mixScaleY?: number;
  mixShearY?: number;
}

/**
 * `type: "physics"` (`:301-339`), 4.2+.
 *
 * ⚠️ The five components all default to 0, so a constraint that names none of
 * them parses cleanly and does absolutely nothing — `A23`.
 */
export interface RigPhysicsConstraint extends RigConstraintCommon {
  type: 'physics';
  bone: string;
  /** The components. All zero = a constraint that parses and does nothing. */
  x?: number;
  y?: number;
  rotate?: number;
  scaleX?: number;
  shearX?: number;
  /**
   * 4.3; absent → `ScaleYMode.None`. Same field, same enum and same spelling as
   * `RigIkConstraint.scaleY`.
   *
   * 🚨 It was called `scaleYMode` from this file's first commit (c0e9944,
   * 2026-08-22) until issue #545, and the name was not a synonym — it was the
   * one key in this file that no code anywhere read.
   * `SkeletonJson.js:299` is `getValue(constraintMap, "scaleY", null)`, so the
   * emitter copied `scaleY`, an author writing TypeScript against this interface
   * got a type error on the key that works and silence on the key that does
   * nothing, and `scaleYMode` occurred exactly once in the whole tree: here.
   *
   * ⭐ The rename rather than teaching the emitter to read `scaleYMode`, and the
   * argument is not "the format's name wins" in the abstract — the tree had
   * already answered it four hundred lines above. `RigIkConstraint.scaleY`
   * carries the *same* `ScaleYMode` enum through the *same* `Utils.enumValue`
   * call under the *same* JSON key, and spells it `scaleY`. Teaching the emitter
   * the other name would have left one Spine enum with two rig-spec spellings
   * chosen by constraint type, which is a worse format than either name alone.
   */
  scaleY?: RigScaleYMode;
  /** Default 5000. */
  limit?: number;
  /** Default 60 → `step = 1/fps`. */
  fps?: number;
  /** Defaults: 0.5 / 100 / 0.85 / 1 / 0 / 0 / 1. */
  inertia?: number;
  strength?: number;
  damping?: number;
  /** Stored as `massInverse = 1/mass`, so 0 becomes Infinity — `A23`. */
  mass?: number;
  wind?: number;
  gravity?: number;
  mix?: number;
  inertiaGlobal?: boolean;
  strengthGlobal?: boolean;
  dampingGlobal?: boolean;
  massGlobal?: boolean;
  windGlobal?: boolean;
  gravityGlobal?: boolean;
  mixGlobal?: boolean;
}

/**
 * The three enums a path constraint chooses its model with, spelled as the
 * runtime's own enum members (`PathConstraintData.ts:77-87`).
 *
 * 🚨 They are checked, and this is one of the places where checking matters most:
 * `Utils.enumValue` is `type[name[0].toUpperCase() + name.slice(1)]`, so a name
 * outside the set resolves to **`undefined`** and is assigned without complaint.
 * The constraint then behaves as some *other* mode — an unknown `spacingMode`
 * fails the `=== Length` test and spaces bones as though `Fixed` had been asked
 * for; an unknown `rotateMode` is neither `Tangent` nor `ChainScale`, so bones
 * follow the path and never turn along it. Both load, both animate, neither is
 * what was written. Only the first letter's case is free, because that is exactly
 * what `enumValue` normalises.
 */
export const RIG_PATH_POSITION_MODES = ['Fixed', 'Percent'] as const;
export const RIG_PATH_SPACING_MODES = ['Length', 'Fixed', 'Percent', 'Proportional'] as const;
export const RIG_PATH_ROTATE_MODES = ['Tangent', 'Chain', 'ChainScale'] as const;

/** The six property names a slider or a transform constraint may read (`:241`, `:521`). */
export const RIG_FROM_PROPERTIES = ['rotate', 'x', 'y', 'scaleX', 'scaleY', 'shearY'] as const;

/**
 * `type: "path"` (`:269-300`).
 *
 * **When you need one:** anything that travels — a cart along a track, a fish
 * along a current, a chain of links wrapping a pulley. The constraint takes a
 * `RigPathAttachment` off `slot` and slides `bones` along it, so one `position`
 * key moves the whole train and the shape of the motion lives in the curve
 * rather than in the keys.
 *
 * ⚠️ `slot` must be a slot that carries a path attachment. `PathConstraint.update`
 * begins `if (!(attachment instanceof PathAttachment)) return` — so a constraint
 * aimed at a slot showing a region does nothing at all, with no error anywhere.
 * rigc refuses a slot that has no path attachment in any skin.
 */
export interface RigPathConstraint extends RigConstraintCommon {
  type: 'path';
  /** At least one, in the order they ride the path. Resolved by name. */
  bones: string[];
  /** The slot whose path attachment the bones follow. Required by the parser. */
  slot: string;
  /** Default `"Percent"`: `position` 0..1 along the path rather than in world units. */
  positionMode?: (typeof RIG_PATH_POSITION_MODES)[number] | 'fixed' | 'percent';
  /** Default `"Length"`: spacing measured in each bone's own length. */
  spacingMode?: (typeof RIG_PATH_SPACING_MODES)[number] | 'length' | 'fixed' | 'percent' | 'proportional';
  /** Default `"Tangent"`: each bone turns to the path's tangent where it sits. */
  rotateMode?: (typeof RIG_PATH_ROTATE_MODES)[number] | 'tangent' | 'chain' | 'chainScale';
  /** Default 0 → `offsetRotation`, degrees added after the path's own rotation. */
  rotation?: number;
  /** Default 0. Where the first bone sits: 0..1 under `Percent`, world units under `Fixed`. */
  position?: number;
  /** Default 0. Gap between bones, in the unit `spacingMode` chooses. */
  spacing?: number;
  /** Default 1. */
  mixRotate?: number;
  mixX?: number;
  /** Defaults to `mixX` (`:283`). */
  mixY?: number;
}

/**
 * `type: "slider"` (`:340-366`) — 4.3's own constraint, and the only one that
 * applies an **animation** rather than a transform.
 *
 * **When you need one:** a pose that has to be driven by a value instead of by
 * time — a dial that opens a door, a blend shape on a face, a suspension that
 * compresses as the wheel rises. `animation` is applied at a time the slider
 * chooses, `mix` is its authority, and everything that animation keys is under
 * its control while it is on.
 *
 * The time comes from one of two models and `bone` is the switch (`:350`):
 *
 * - **property-driven** — with a `bone`, the slider reads one transform
 *   `property` off it and maps it to a time: `time = to + (value - from) * scale`.
 *   This is the dial.
 * - **time-driven** — with no `bone`, `time` is the slider's own setup value and
 *   an `animations.<a>.slider.<name>.time` timeline keys it.
 *
 * ⚠️ `animation` is resolved in a **second pass** over the constraints array,
 * after the animations are read (`:495-507`), and a miss **throws**
 * `Slider animation not found`. It names an animation in the MOTION spec — the
 * one place a rig spec points across the file boundary, and the mirror of
 * `events`, where the rig declares a name the motion spec fires.
 */
export interface RigSliderConstraint extends RigConstraintCommon {
  type: 'slider';
  /** An animation the motion spec declares. Required: a miss throws in the parser. */
  animation: string;
  /** Default 1. The slider's authority over what its animation keys. */
  mix?: number;
  /** Default false. Add the animation to the current pose instead of overwriting it. */
  additive?: boolean;
  /**
   * Default false. Repeat past the animation's duration instead of holding the
   * last frame. ⚠️ With a `bone`, `loop` divides by the animation's duration
   * (`Slider.ts:63-64`), so looping a zero-length animation yields a NaN time.
   */
  loop?: boolean;
  /** The driving bone. Its presence switches the whole model — see above. */
  bone?: string;
  /** Which of the six transform properties to read. Required when `bone` is set. */
  property?: (typeof RIG_FROM_PROPERTIES)[number];
  /** Default 0. The property value that maps to time `to`. */
  from?: number;
  /** Default 0. The time `from` maps to. */
  to?: number;
  /** Default 1. Seconds of animation per unit of the property. */
  scale?: number;
  /** Default 0. Nonessential: the editor's top of the slider's range. */
  max?: number;
  /** Default false. Read the bone's local transform instead of its world one. */
  local?: boolean;
  /** The setup time, for the time-driven model. Read only when `bone` is absent. */
  time?: number;
}

export type RigConstraint =
  | RigIkConstraint
  | RigTransformConstraint
  | RigPathConstraint
  | RigPhysicsConstraint
  | RigSliderConstraint;

// ---------------------------------------------------------------------------
// events — `root.events` (SkeletonJson.ts:469-484), an OBJECT, not an array
// ---------------------------------------------------------------------------

/**
 * One event **definition**: a name the skeleton owns, plus the payload a firing
 * carries when the animation does not override it.
 *
 * ⭐ The declaration lives in the rig spec and the firings live in the motion
 * spec, for the same reason slots live here and their colour keys live there:
 * the name is structure — the runtime looks it up, the game listens for it —
 * and *when* it fires is time. `skeletonData.findEvent` resolves an animation's
 * key against this table and **throws** on a miss (`:1244`), so an animation
 * that names an event nobody declared does not load at all. rigc refuses it at
 * compile instead, where the message can name the file that has to change.
 *
 * ⚠️ `volume` and `balance` are read **only when `audio` is set** (`:478-481`).
 * Declared without one they are dropped in silence, so rigc refuses that pairing
 * rather than emitting two numbers the runtime will never look at.
 */
export interface RigEvent {
  /** Default 0. The `int` payload every firing inherits unless it overrides it. */
  int?: number;
  /** Default 0. */
  float?: number;
  /** Default `""`. */
  string?: string;
  /**
   * Audio path the editor recorded for this event. Nonessential to playback —
   * no runtime here loads it — but it is what makes `volume`/`balance` legible.
   */
  audio?: string;
  /** Only read when `audio` is set. */
  volume?: number;
  balance?: number;
}

// ---------------------------------------------------------------------------
// invariants — what skeleton JSON cannot say about itself
// ---------------------------------------------------------------------------

/**
 * Structural facts the emitted artifact does not record, handed to the validator
 * so its archetype assertions have something to check instead of a guess.
 *
 * These are the fields that used to be properties of a hard-coded formation.
 * They are optional, and an assertion whose field is absent reports **SKIP** —
 * never a pass, because an assertion with nothing to look at has not looked.
 */
export interface RigInvariants {
  /**
   * How many slots of this rig may carry a mesh. A budget, not a Spine rule:
   * every mesh is a canvas that re-rasterises whenever a bone driving it moves.
   */
  meshSlots?: number;
  /**
   * How many triangles one of those meshes may carry. Also a budget, and also
   * not a Spine rule — the editor's own example projects ship meshes several
   * times this size and they are perfectly valid.
   *
   * ⚠️ Declare it or `A13_MESH_BUDGET` has nothing to measure against and SKIPs.
   * A number baked into the validator would be one project's frame time
   * masquerading as a property of the format, and would fail every foreign
   * skeleton that is merely denser than that project can afford.
   */
  meshTriangles?: number;
  /**
   * The bone whose setup rotation carries the cut's insertion axis. Its subtree
   * is authored in **axis space** — translateX only — which is what lets one set
   * of keys move to a cut at another camera angle (`A24`).
   */
  axisBone?: string;
  /**
   * The bone carrying the inserting mass. Its own inward keys spend the same
   * clearance the stroke does, so `A29`/`A30` add them together.
   */
  massBone?: string;
  /** Parentage that must never happen, with the reason it is tempting (`A25`). */
  detached?: RigDetachedRule[];
  /**
   * Mesh slots whose `deform` timelines are allowed to turn a triangle inside
   * out, exempting them from `A39_DEFORM_KEEPS_TRIANGLE_WINDING`.
   *
   * 🚨 **This is an opt-OUT, and the default is gated.** A39's whole value is
   * that a fold is caught without anybody suspecting one, so an author who has
   * not thought about folding gets the check. What the field exists for is the
   * art that folds on purpose — a page turning over, a cloth creasing back on
   * itself — where the reversed winding IS the drawing and refusing it would be
   * refusing correct work.
   *
   * ⚠️ `why` is **required**, and empty is refused by name. An exemption with no
   * reason is the failure mode this field would otherwise introduce: somebody
   * declares a slot to get a green build, and the next reader cannot tell a
   * deliberate page turn from a defect that was waved through. The one exemption
   * in this repository (`gallery/flex`'s leaf) says outright that it is the
   * second kind, and names the issue.
   */
  deformMayFold?: RigDeformFoldExemption[];
  /**
   * Ik and transform constraints whose mix **the consumer sets**, from code,
   * rather than any animation in this file — so `A47` / `A48` do not refuse
   * them for resting muted with nothing keying them up (issue #784).
   *
   * 🔑 **The file cannot say this about itself.** A constraint resting at 0
   * that no animation keys above 0 is either a leftover that moves nothing or a
   * dial a game turns on at runtime, and the two export as the same bytes. The
   * gate refuses the shape because nothing *in the file* ever moves it; this is
   * the statement that something outside it does. It is the rig-side spelling of
   * `gallery/look`'s rule that a face angle is a value rather than a time: the
   * object offers the dial and the consumer decides when it turns.
   *
   * 🚨 **An opt-OUT, held to `deformMayFold`'s standard.** Each entry names the
   * constraint AND its `type` — names are unique per kind (issue #692), so a
   * name alone could mean an ik and a transform at once — and a `why`, required
   * and non-blank. A name that resolves to nothing, a kind that has no such
   * rule (a path, physics or slider constraint: `A36`, `A23` and `A37` read no
   * declaration, so the entry would exempt nothing), a repeat and a blank `why`
   * are each refused by name. A declared constraint that the file itself
   * switches on — resting live, or keyed above 0 — is refused at the gate, for
   * the same reason: the declaration would exempt nothing.
   *
   * ⚠️ What it buys is a SKIP, never a pass: a declared constraint is not
   * measured, and `A47`/`A48` say so by name when nothing else of that kind is
   * left to measure, and on the build's stats line when something is.
   */
  consumerDrivenMix?: RigConsumerDrivenMix[];
  /**
   * The rig's `idle` deforms meshes **on purpose**, so
   * `A15_IDLE_NO_MESH_BONE_KEYS` reports the renderer cost instead of refusing
   * each keyed bone (issues #855, #858).
   *
   * 🔑 **What A15 assumes, and the genre that breaks it.** The rule exists for a
   * renderer that skips redrawing a mesh nothing moved, so an `idle` keying a
   * mesh-driving bone spends that skip on every frame — right for a rig whose
   * meshes are mostly static, wrong for a painting rig: one illustration
   * decomposed into layers, most of them weighted meshes over bone chains, with
   * an `idle` whose whole job is to move them (hair, sleeves, breathing). The
   * only way through without this field was a same-origin parent above every
   * keyed bone — 42 extra bones on the first such rig, the same pose, the rule's
   * wording met and its purpose not.
   *
   * 🚨 **An opt-OUT, held to `deformMayFold`'s standard.** The shape is
   * `{ "why": … }` and a missing, blank or non-string `why` is refused by name.
   * What it buys is a **SKIP, never a pass**, and the SKIP carries the cost —
   * the keyed bones, how many mesh attachments they drive and how many vertices
   * those hold. A declaration on a rig whose `idle` keys no mesh-driving bone is
   * refused at the gate: it would switch off nothing while reading like it did.
   */
  idleDrivesMeshes?: RigIdleDrivesMeshes;
  /**
   * Lines some of the rig's bones are held to: for each entry, the line
   * through the setup-pose world origins of the two `through` bones, and every
   * bone in `bones` with its setup-pose world x axis within `tolerance` degrees
   * of it, as a line — `A51_BONES_LIE_ALONG_THEIR_DECLARED_AXIS` (issue #1351).
   *
   * 🔑 **Why a bone's axes are the rig's business.** A `scaleY` key squashes
   * along the bone's own y axis and a `translateY` key moves along it. On a face
   * painted upright with every bone at rotation 0 that is the face's axis; on a
   * face painted tilted it is the page's, so a blink squashes the eye along the
   * page's vertical rather than across the eye line, a brow rises toward the
   * page's top rather than the forehead — and the parser, the round trip and
   * every other rule accept it. The author cannot see it. Rotating the bones to
   * the face's line (their attachments counter-rotated, so the setup pose is
   * unmoved) is the fix, and this is the declaration that holds it.
   *
   * 🚨 **Held whether or not any animation keys the bones.** A consumer writes
   * them at run time (`openTrack({ adjust })` on the core entry), which no
   * animation in the file shows, so "nothing keys it" is not "nothing reads it".
   *
   * ⚠️ `tolerance` is **required**, finite, above 0 and below 90 — the compiler
   * does not invent one. Two lines meet at 0° to 90°, so a tolerance of 90 or
   * more admits every orientation and could never fail; and a bone's world
   * angle is read off a posed matrix in floating point, so 0 would refuse a
   * bone rotated exactly onto the line whenever the arithmetic rounds.
   *
   * Every name resolves or is refused by name: an unknown bone in `through` or
   * `bones`, `through` naming one bone twice, a repeated entry `name`. Two
   * `through` bones that land on one world origin draw no line, and that is
   * known only once the setup pose is posed — constraints included — so the
   * gate refuses it, by the entry's name, rather than this parser.
   */
  axes?: RigAxis[];
}

/** One line some bones are held to — `invariants.axes` (`A51`). */
export interface RigAxis {
  /** Names the entry in every failure; unique among the rig's axes. */
  name: string;
  /** The two bones whose setup-pose world origins draw the line, first to second. Two different bones. */
  through: string[];
  /** The bones whose setup-pose world x axis must lie along it. */
  bones: string[];
  /** Degrees, required: above 0 and below 90 — see `RigInvariants.axes`. */
  tolerance: number;
}

/** The rig's `idle` is meant to deform meshes — `invariants.idleDrivesMeshes` (`A15`). */
export interface RigIdleDrivesMeshes {
  /** Required, and blank is refused by name — see `idleDrivesMeshes`. */
  why: string;
}

/** One constraint whose mix the consumer drives — `invariants.consumerDrivenMix`. */
export interface RigConsumerDrivenMix {
  /** The constraint's `name`. */
  constraint: string;
  /** Its `type`: `ik` or `transform`, the two kinds `A47`/`A48` read the declaration for. */
  type: 'ik' | 'transform';
  /** Required, and blank is refused by name — see `consumerDrivenMix`. */
  why: string;
}

/** One forbidden parentage — `invariants.detached` (`A25`). */
export interface RigDetachedRule {
  bone: string;
  notUnder: string;
  why?: string;
}

/** One slot exempted from `A39` — `invariants.deformMayFold`. */
export interface RigDeformFoldExemption {
  slot: string;
  /** Required, and empty is refused by name — see `deformMayFold`. */
  why: string;
}

// ---------------------------------------------------------------------------
// stops — a swinging chain held off a leg (issue #1413)
// ---------------------------------------------------------------------------

/**
 * One chain held off a leg: the network [`src/stop.ts`](stop.ts) expands it to,
 * written once instead of by hand. Spine has no collider and no angle limit, so
 * a physics-driven skirt chain swings its hem through the thigh it hangs in
 * front of; this holds the chain's DRAWN links — the bones its mesh is
 * weighted to — so they may swing away from the leg and not toward it past
 * their rest angle.
 *
 * It expands, before anything else reads the rig, to exactly:
 *
 *   - `<chain>_touch` — a point bone, child of `against`, at `at`;
 *   - `<chain>_stop` — a frame hung where the first link hangs (its parent,
 *     `x`, `y` and `length`), aimed at the point by the ik constraint
 *     `<chain>_stop_aim`;
 *   - `<link>_rel` — a child of the frame that the transform constraint
 *     `<link>_rel_copy` gives the first link's world rotation;
 *   - `<link>_d` — the first link's drawn link, a child of the frame, which the
 *     transform constraint `<link>_clamp` gives `_rel`'s turn in the frame,
 *     clamped to the range;
 *   - for each link below the first, `<link>_d` — its drawn link, a sibling
 *     with its stated transform — and `<link>_clamp`, which gives it the link's
 *     own turn, clamped to `lower`.
 *
 * So a chain's next link hangs from the drawn link above it: author the chain
 * with each link's parent below `<previous link>_d`, and weight the mesh to the
 * `_d` bones. What the expansion derives, it derives from the setup pose this
 * file states (`src/stop.ts` lists it); nothing is measured off the art.
 */
export interface RigStop {
  /** The name the point, the frame and the aim are called after. */
  chain: string;
  /**
   * The chain's swinging links, root first: each one written by a constraint
   * in `constraints` (its swing), each below the first hanging from the drawn
   * link of the one above. Resolved by name.
   */
  links: string[];
  /** The bone the point rides on — the leg. Resolved by name. */
  against: string;
  /** The point, `[x, y]` in `against`'s local space. Required: the compiler places no point. */
  at: [number, number];
  /**
   * The first drawn link's range, as its two ends: degrees from its rest angle
   * to the aim line, counted positive AWAY from the point. `inward: 0,
   * outward: 60` — never past rest toward the leg, up to 60° away from it.
   * Both required, `inward` not above `outward`.
   */
  inward: number;
  outward: number;
  /** Each lower drawn link's range off its own rest bend, the same way round. Required when `links` has more than one. */
  lower?: RigStopLower;
}

/** A lower link's range — `RigStop.lower`. */
export interface RigStopLower {
  inward: number;
  outward: number;
}

// ---------------------------------------------------------------------------
// the file
// ---------------------------------------------------------------------------

export interface RigSpec {
  spec: 'rigc-rig/1';
  /**
   * The rig's own name. A motion spec's `archetype` field must equal it: the
   * spec was authored against one formation, and pairing it with a different rig
   * silently produces keys aimed at bones that mean something else.
   */
  name: string;
  note?: string;
  skeleton?: RigSkeletonHeader;
  /**
   * Base directory for every `image` in this file, relative to the rig file
   * itself. The CLI's `--images <dir>` overrides it (and is then relative to the
   * working directory), which is how a foreign corpus is compiled without
   * editing its rig spec.
   */
  images?: string;
  bones: RigBone[];
  slots: RigSlot[];
  /**
   * `default`, if the rig has one, becomes `skeletonData.defaultSkin` (`:441`).
   * It is emitted exactly when this map carries the key — an empty `{}` included
   * — or a manifest part files its states under it; a rig whose art is all in
   * named skins states no `default` and gets none, which is what the editor's
   * export of such a rig declares (issue #801).
   *
   * Each entry is either the short form — `slotName -> placeholderName ->
   * attachment` — or the long one, `{ "attachments": {…}, "bones": [...],
   * "ik": [...] }`, which also says which bones and constraints the skin
   * activates. `splitRigSkin` normalises the two.
   */
  skins?: Record<string, RigSkin>;
  constraints?: RigConstraint[];
  /**
   * `eventName -> payload defaults`. Emitted as `root.events`, which is an
   * OBJECT keyed by name and not an array. The motion spec's per-animation
   * `events` timeline fires them; a firing whose name is not a key here is a
   * compile error, because the parser throws on it at load.
   */
  events?: Record<string, RigEvent>;
  invariants?: RigInvariants;
  /**
   * Chains held off a leg — see `RigStop`. Expanded by `parseRigSpec` into
   * bones and constraints before anything else reads them; kept as written,
   * and emitted nowhere.
   */
  stops?: RigStop[];
}

// ---------------------------------------------------------------------------
// reading
// ---------------------------------------------------------------------------

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Every key each shape of this format owns, keyed by the interface above that
 * declares it — the runtime shadow of the types, which TypeScript erases.
 *
 * 🔒 **Hand-written and mechanically held to the interfaces.** `CUR17` in
 * `selftest.ts` reads this file's own source, extracts each named interface's
 * field list and compares it to the entry here, so the pair cannot drift: adding
 * a field and forgetting this table is a red run, not a key an author cannot
 * write. `CUR18` closes the other direction — a key declared here and occurring
 * nowhere else in the tree is refused, which is exactly what `scaleYMode` was.
 *
 * ⚠️ `RigUnimplementedAttachment` is deliberately absent. It carries
 * `[field: string]: unknown` because its whole job is to let a spec *say* a
 * `point` or a `linkedmesh` and get a named `NotImplementedError` back; checking
 * the keys of an attachment rigc is about to refuse by type would name the wrong
 * fault.
 */
export const RIG_KEYS = {
  RigSpec: ['spec', 'name', 'note', 'skeleton', 'images', 'bones', 'slots', 'skins', 'constraints', 'events', 'invariants', 'stops'],
  RigStop: ['chain', 'links', 'against', 'at', 'inward', 'outward', 'lower'],
  RigStopLower: ['inward', 'outward'],
  RigSkeletonHeader: ['x', 'y', 'width', 'height', 'fps', 'referenceScale', 'images', 'audio', 'stageBox'],
  RigStageBox: ['slot', 'attachment'],
  RigBone: ['name', 'parent', 'length', 'x', 'y', 'rotation', 'scaleX', 'scaleY', 'shearX', 'shearY', 'inherit', 'skin', 'color', 'icon', 'from'],
  RigBoneFrom: ['anchor', 'slotWindow', 'meshCenter', 'rotation'],
  RigSlot: ['name', 'bone', 'attachment', 'color', 'dark', 'blend'],
  RigEvent: ['int', 'float', 'string', 'audio', 'volume', 'balance'],
  RigInvariants: ['meshSlots', 'meshTriangles', 'axisBone', 'massBone', 'detached', 'deformMayFold', 'consumerDrivenMix', 'idleDrivesMeshes', 'axes'],
  RigAxis: ['name', 'through', 'bones', 'tolerance'],
  RigIdleDrivesMeshes: ['why'],
  RigDetachedRule: ['bone', 'notUnder', 'why'],
  RigDeformFoldExemption: ['slot', 'why'],
  RigConsumerDrivenMix: ['constraint', 'type', 'why'],
  // Not retyped: `RIG_SKIN_KEYS` already IS this set, and it is the set
  // `splitRigSkin` refuses a long-form skin's stray key against. A second
  // spelling of it here would be two lists that have to agree, which is the
  // defect this whole table is checked to avoid.
  RigSkinEntry: RIG_SKIN_KEYS,
  RigIkConstraint: ['name', 'skin', 'type', 'bones', 'target', 'scaleY', 'mix', 'softness', 'bendPositive', 'compress', 'stretch'],
  RigTransformConstraint: [
    'name', 'skin', 'type', 'bones', 'source', 'localSource', 'localTarget', 'additive', 'clamp', 'properties',
    'rotation', 'x', 'y', 'scaleX', 'scaleY', 'shearY',
    'mixRotate', 'mixX', 'mixY', 'mixScaleX', 'mixScaleY', 'mixShearY',
  ],
  RigPathConstraint: [
    'name', 'skin', 'type', 'bones', 'slot', 'positionMode', 'spacingMode', 'rotateMode',
    'rotation', 'position', 'spacing', 'mixRotate', 'mixX', 'mixY',
  ],
  RigPhysicsConstraint: [
    'name', 'skin', 'type', 'bone', 'x', 'y', 'rotate', 'scaleX', 'shearX', 'scaleY', 'limit', 'fps',
    'inertia', 'strength', 'damping', 'mass', 'wind', 'gravity', 'mix',
    'inertiaGlobal', 'strengthGlobal', 'dampingGlobal', 'massGlobal', 'windGlobal', 'gravityGlobal', 'mixGlobal',
  ],
  RigSliderConstraint: [
    'name', 'skin', 'type', 'animation', 'mix', 'additive', 'loop', 'bone', 'property', 'from', 'to', 'scale',
    'max', 'local', 'time',
  ],
  RigTransformProperty: ['offset', 'to'],
  RigTransformTo: ['offset', 'max', 'scale'],
  RigRegionAttachment: ['type', 'name', 'path', 'image', 'x', 'y', 'rotation', 'scaleX', 'scaleY', 'width', 'height', 'color', 'sequence'],
  RigMeshAttachment: [
    'type', 'name', 'path', 'image', 'uvs', 'triangles', 'vertices', 'weights', 'boneIndexing', 'hull', 'edges',
    'width', 'height', 'color', 'generator', 'depth', 'sequence',
  ],
  RigLinkedMeshAttachment: [
    'type', 'name', 'path', 'image', 'source', 'slot', 'skin', 'timelines', 'width', 'height', 'color', 'sequence',
    // Declared so the refusal can name them — see `RigLinkedMeshAttachment`.
    'uvs', 'triangles', 'vertices', 'weights', 'boneIndexing', 'hull', 'edges', 'generator',
  ],
  RigMeshBinding: ['bone', 'x', 'y', 'weight'],
  RigSequence: ['count', 'start', 'digits', 'setup'],
  RigBoundingBoxAttachment: ['vertexCount', 'vertices', 'weights', 'boneIndexing', 'color', 'type', 'name'],
  RigClippingAttachment: ['vertexCount', 'vertices', 'weights', 'boneIndexing', 'color', 'type', 'name', 'end', 'convex', 'inverse'],
  RigPathAttachment: ['vertexCount', 'vertices', 'weights', 'boneIndexing', 'color', 'type', 'name', 'closed', 'constantSpeed', 'lengths'],
  RigRingGenerator: ['kind', 'hull', 'center', 'inner', 'size', 'bias', 'controls'],
  RigRibbonGenerator: ['kind', 'size', 'rows', 'chain'],
  RigContourGenerator: ['kind', 'tolerance', 'margin', 'maxVertices', 'alpha', 'depth', 'soft'],
  RigGridGenerator: ['kind', 'us', 'vs', 'cols', 'rows', 'depth', 'soft'],
  RigSegmentsGenerator: ['kind', 'cell', 'bones', 'falloff', 'influence', 'alpha', 'anchor'],
  RigSegmentsFalloff: ['power', 'radius', 'maxBones', 'minWeight'],
  RigSegmentsInfluence: ['radius', 'across', 'max', 'shape'],
  RigSegmentSpan: ['bone', 'from', 'to'],
  RigMeshBias: ['axis_deg', 'ramp'],
  RigDepthMap: ['image', 'near', 'zScale', 'gamma', 'contrast', 'bias'],
  RigSoftRegion: ['bone', 'mask'],
} as const satisfies Record<string, readonly string[]>;

/**
 * The type every key of `RIG_KEYS` holds, shape by shape — what
 * `refuseValuesOfTheWrongType` refuses a value against (issue #890).
 *
 * 🔒 **Beside the key table, and held equal to it twice.** `satisfies` over
 * `RigTypeTable` makes a key typed here and absent there, or admitted there and
 * untyped here, a type error; the selftest compares the two at runtime as well,
 * and derives each checked type from the interface the row is named for, so a
 * field declared `number` and typed `string` here is a red run rather than a
 * refusal of correct work.
 *
 * Where an unchecked `object` or `mixed` row is refused: a nested shape by the
 * reader that walks it; `RigSegmentsGenerator.bones` (`mixed`: a name, a chain
 * of names or a span) by the segments generator, by index. Where an `enum` row
 * is refused is not a list in prose any more: `RIG_ENUMS`, below, has one entry
 * per `enum` row — a set refused by `refuseValuesOutsideTheirSet`, or the
 * reader that refuses it — and `satisfies` makes a row without one a type error.
 *
 * ⚠️ Until issue #900 this comment carried that list, and ended by naming three
 * `enum` keys with **no** owner: `boneIndexing`, `from.rotation` and a
 * generator `kind`. The list was right about the three and wrong by omission
 * about a fourth — the cut manifest's `mesh.kind`, which `MANIFEST_TYPES` said
 * "the manifest mesh reader" held and which that reader read as a ribbon in one
 * place and a ring in another. A list of owners in a comment is a claim nothing
 * checks; the table is one a control reads.
 */
type RigTypeTable = {
  readonly [S in keyof typeof RIG_KEYS]: { readonly [K in (typeof RIG_KEYS)[S][number]]: SpecValueType };
};

export const RIG_TYPES = {
  RigSpec: {
    spec: 'enum', name: 'string', note: 'string', skeleton: 'object', images: 'string', bones: 'object[]', slots: 'object[]',
    skins: 'map of object', constraints: 'object[]', events: 'map of object', invariants: 'object', stops: 'object[]',
  },
  RigStop: { chain: 'string', links: 'string[]', against: 'string', at: 'number[]', inward: 'number', outward: 'number', lower: 'object' },
  RigStopLower: { inward: 'number', outward: 'number' },
  RigSkeletonHeader: {
    x: 'number', y: 'number', width: 'number | null', height: 'number | null', fps: 'number', referenceScale: 'number',
    images: 'string', audio: 'string | null', stageBox: 'object',
  },
  RigStageBox: { slot: 'string', attachment: 'string' },
  RigBone: {
    name: 'string', parent: 'string', length: 'number', x: 'number', y: 'number', rotation: 'number', scaleX: 'number',
    scaleY: 'number', shearX: 'number', shearY: 'number', inherit: 'enum', skin: 'boolean', color: 'string', icon: 'string',
    from: 'object',
  },
  RigBoneFrom: { anchor: 'string', slotWindow: 'string', meshCenter: 'string', rotation: 'enum' },
  RigSlot: { name: 'string', bone: 'string', attachment: 'string | null', color: 'string', dark: 'string', blend: 'enum' },
  RigEvent: { int: 'number', float: 'number', string: 'string', audio: 'string', volume: 'number', balance: 'number' },
  RigInvariants: {
    meshSlots: 'number', meshTriangles: 'number', axisBone: 'string', massBone: 'string', detached: 'object[]',
    deformMayFold: 'object[]', consumerDrivenMix: 'object[]', idleDrivesMeshes: 'object', axes: 'object[]',
  },
  RigAxis: { name: 'string', through: 'string[]', bones: 'string[]', tolerance: 'number' },
  RigIdleDrivesMeshes: { why: 'string' },
  RigDetachedRule: { bone: 'string', notUnder: 'string', why: 'string' },
  RigDeformFoldExemption: { slot: 'string', why: 'string' },
  RigConsumerDrivenMix: { constraint: 'string', type: 'enum', why: 'string' },
  RigSkinEntry: {
    attachments: 'map of object', bones: 'string[]', ik: 'string[]', transform: 'string[]', path: 'string[]',
    physics: 'string[]', slider: 'string[]',
  },
  RigIkConstraint: {
    name: 'string', skin: 'boolean', type: 'enum', bones: 'string[]', target: 'string', scaleY: 'enum', mix: 'number',
    softness: 'number', bendPositive: 'boolean', compress: 'boolean', stretch: 'boolean',
  },
  RigTransformConstraint: {
    name: 'string', skin: 'boolean', type: 'enum', bones: 'string[]', source: 'string', localSource: 'boolean',
    localTarget: 'boolean', additive: 'boolean', clamp: 'boolean', properties: 'map of object',
    rotation: 'number', x: 'number', y: 'number', scaleX: 'number', scaleY: 'number', shearY: 'number',
    mixRotate: 'number', mixX: 'number', mixY: 'number', mixScaleX: 'number', mixScaleY: 'number', mixShearY: 'number',
  },
  RigPathConstraint: {
    name: 'string', skin: 'boolean', type: 'enum', bones: 'string[]', slot: 'string', positionMode: 'enum',
    spacingMode: 'enum', rotateMode: 'enum', rotation: 'number', position: 'number', spacing: 'number',
    mixRotate: 'number', mixX: 'number', mixY: 'number',
  },
  RigPhysicsConstraint: {
    name: 'string', skin: 'boolean', type: 'enum', bone: 'string', x: 'number', y: 'number', rotate: 'number',
    scaleX: 'number', shearX: 'number', scaleY: 'enum', limit: 'number', fps: 'number', inertia: 'number',
    strength: 'number', damping: 'number', mass: 'number', wind: 'number', gravity: 'number', mix: 'number',
    inertiaGlobal: 'boolean', strengthGlobal: 'boolean', dampingGlobal: 'boolean', massGlobal: 'boolean',
    windGlobal: 'boolean', gravityGlobal: 'boolean', mixGlobal: 'boolean',
  },
  RigSliderConstraint: {
    name: 'string', skin: 'boolean', type: 'enum', animation: 'string', mix: 'number', additive: 'boolean',
    loop: 'boolean', bone: 'string', property: 'enum', from: 'number', to: 'number', scale: 'number', max: 'number',
    local: 'boolean', time: 'number',
  },
  RigTransformProperty: { offset: 'number', to: 'map of object' },
  RigTransformTo: { offset: 'number', max: 'number', scale: 'number' },
  RigRegionAttachment: {
    type: 'enum', name: 'string', path: 'string', image: 'string', x: 'number', y: 'number', rotation: 'number',
    scaleX: 'number', scaleY: 'number', width: 'number', height: 'number', color: 'string', sequence: 'object',
  },
  RigMeshAttachment: {
    type: 'enum', name: 'string', path: 'string', image: 'string', uvs: 'number[]', triangles: 'number[]',
    vertices: 'number[]', weights: 'object[][]', boneIndexing: 'enum', hull: 'number', edges: 'number[]',
    width: 'number', height: 'number', color: 'string', generator: 'object', depth: 'object', sequence: 'object',
  },
  RigLinkedMeshAttachment: {
    type: 'enum', name: 'string', path: 'string', image: 'string', source: 'string', slot: 'string', skin: 'string',
    timelines: 'boolean', width: 'number', height: 'number', color: 'string', sequence: 'object',
    uvs: 'number[]', triangles: 'number[]', vertices: 'number[]', weights: 'object[][]', boneIndexing: 'enum',
    hull: 'number', edges: 'number[]', generator: 'object',
  },
  RigMeshBinding: { bone: 'string', x: 'number', y: 'number', weight: 'number' },
  RigSequence: { count: 'number', start: 'number', digits: 'number', setup: 'number' },
  RigBoundingBoxAttachment: {
    vertexCount: 'number', vertices: 'number[]', weights: 'object[][]', boneIndexing: 'enum', color: 'string', type: 'enum', name: 'string',
  },
  RigClippingAttachment: {
    vertexCount: 'number', vertices: 'number[]', weights: 'object[][]', boneIndexing: 'enum', color: 'string', type: 'enum', name: 'string',
    end: 'string', convex: 'boolean', inverse: 'boolean',
  },
  RigPathAttachment: {
    vertexCount: 'number', vertices: 'number[]', weights: 'object[][]', boneIndexing: 'enum', color: 'string', type: 'enum', name: 'string',
    closed: 'boolean', constantSpeed: 'boolean', lengths: 'number[]',
  },
  RigRingGenerator: {
    kind: 'enum', hull: 'number[][]', center: 'number[]', inner: 'number', size: 'number[]', bias: 'object',
    controls: 'string[]',
  },
  RigRibbonGenerator: { kind: 'enum', size: 'number[]', rows: 'number', chain: 'string[]' },
  RigContourGenerator: {
    kind: 'enum', tolerance: 'number', margin: 'number', maxVertices: 'number', alpha: 'number', depth: 'object',
    soft: 'object',
  },
  RigGridGenerator: { kind: 'enum', us: 'number[]', vs: 'number[]', cols: 'number', rows: 'number', depth: 'object', soft: 'object' },
  RigSegmentsGenerator: {
    kind: 'enum', cell: 'number', bones: 'mixed', falloff: 'object', influence: 'object', alpha: 'number', anchor: 'number[]',
  },
  RigSegmentsFalloff: { power: 'number', radius: 'number', maxBones: 'number', minWeight: 'number' },
  RigSegmentsInfluence: { radius: 'number', across: 'boolean', max: 'number', shape: 'enum' },
  RigSegmentSpan: { bone: 'string', from: 'number[]', to: 'number[]' },
  RigMeshBias: { axis_deg: 'number', ramp: 'number[]' },
  RigDepthMap: { image: 'string', near: 'enum', zScale: 'number', gamma: 'number', contrast: 'number', bias: 'number' },
  RigSoftRegion: { bone: 'string', mask: 'string' },
} as const satisfies RigTypeTable;

/** The two sources a bone's `from.rotation` names (`RigBoneFrom.rotation`). */
export const RIG_FROM_ROTATIONS = ['axis', 'anchor'] as const satisfies ReadonlyArray<NonNullable<RigBoneFrom['rotation']>>;

/** The two ways a weighted `vertices` run names its bones (`RigMeshAttachment.boneIndexing`). */
export const RIG_BONE_INDEXING = ['name', 'raw'] as const satisfies ReadonlyArray<NonNullable<RigMeshAttachment['boneIndexing']>>;

/** What `boneIndexing` outside its set was read as, measured before issue #900. */
const BONE_INDEXING_READ_AS =
  'anything else was read as the default "name" in silence: a weighted "vertices" run was refused as unflagged, ' +
  'and every other attachment built byte for byte as if the key were absent';

/**
 * Who refuses each `enum` row of `RIG_TYPES` outside its set (issue #900) —
 * `SpecEnumTable` in [`keys.ts`](keys.ts) says what the two kinds of entry
 * mean, and `satisfies` makes an `enum` row without one a type error.
 *
 * ⭐ A `set` is stated for exactly the rows nobody held: measured when this
 * table was written, `boneIndexing` built green at `5`, `"foo"` and `"named"`
 * (the spelling the issue itself used) as the default, and `from.rotation`
 * built green at `5` and `"foo"` with the bone's setup rotation dropped. Every
 * other row already had a reader that refused a planted `5` and `"foo"` by
 * name, and keeps it; the generator's `kind` is the one of those that is a
 * dispatch, and its refusal is new — it threw a `TypeError` (*undefined is not
 * an object (evaluating 'generator.size')*), because the scan skipped a `kind`
 * it had no row for and the mesh builder fell through to the ring branch.
 */
export const RIG_ENUMS = {
  RigSpec: { spec: { owner: 'parseRigSpec' } },
  RigBone: { inherit: { owner: 'parseRigSpec' } },
  RigBoneFrom: {
    rotation: {
      set: RIG_FROM_ROTATIONS,
      readAs: 'anything else was read as no rotation source, and the bone was emitted without the setup rotation it asked for',
    },
  },
  RigSlot: { blend: { owner: 'parseRigSpec' } },
  RigConsumerDrivenMix: { type: { owner: 'parseRigSpec' } },
  RigIkConstraint: { type: { owner: 'buildRigConstraint' }, scaleY: { owner: 'buildRigConstraint' } },
  RigTransformConstraint: { type: { owner: 'buildRigConstraint' } },
  RigPathConstraint: {
    type: { owner: 'buildRigConstraint' },
    positionMode: { owner: 'buildRigConstraint' },
    spacingMode: { owner: 'buildRigConstraint' },
    rotateMode: { owner: 'buildRigConstraint' },
  },
  RigPhysicsConstraint: { type: { owner: 'buildRigConstraint' }, scaleY: { owner: 'buildRigConstraint' } },
  RigSliderConstraint: { type: { owner: 'buildRigConstraint' }, property: { owner: 'buildRigConstraint' } },
  RigRegionAttachment: { type: { owner: 'buildRigAttachment' } },
  RigMeshAttachment: { type: { owner: 'buildRigAttachment' }, boneIndexing: { set: RIG_BONE_INDEXING, readAs: BONE_INDEXING_READ_AS } },
  RigLinkedMeshAttachment: { type: { owner: 'buildRigAttachment' }, boneIndexing: { set: RIG_BONE_INDEXING, readAs: BONE_INDEXING_READ_AS } },
  RigBoundingBoxAttachment: { type: { owner: 'buildRigAttachment' }, boneIndexing: { set: RIG_BONE_INDEXING, readAs: BONE_INDEXING_READ_AS } },
  RigClippingAttachment: { type: { owner: 'buildRigAttachment' }, boneIndexing: { set: RIG_BONE_INDEXING, readAs: BONE_INDEXING_READ_AS } },
  RigPathAttachment: { type: { owner: 'buildRigAttachment' }, boneIndexing: { set: RIG_BONE_INDEXING, readAs: BONE_INDEXING_READ_AS } },
  // The generator's `kind` chooses the row its other keys are checked against,
  // so a `kind` outside the five has no row to be visited in: the scan that
  // dispatches on it is where it is refused.
  RigRingGenerator: { kind: { owner: 'checkRigSpecKeys' } },
  RigRibbonGenerator: { kind: { owner: 'checkRigSpecKeys' } },
  RigContourGenerator: { kind: { owner: 'checkRigSpecKeys' } },
  RigGridGenerator: { kind: { owner: 'checkRigSpecKeys' } },
  RigSegmentsGenerator: { kind: { owner: 'checkRigSpecKeys' } },
  RigSegmentsInfluence: { shape: { owner: 'segmentsInfluenceOf' } },
  RigDepthMap: { near: { owner: 'sampleMeshDepth' } },
} as const satisfies SpecEnumTable<typeof RIG_TYPES>;

/**
 * The five constraint `type` names, and the shape each one's keys come from.
 *
 * `satisfies` over `RigSkinConstraintKey` is what makes the five exhaustive: a
 * sixth constraint type added to that union without an entry here is a type
 * error rather than a shape whose keys go unchecked.
 */
const CONSTRAINT_SHAPE: Record<string, keyof typeof RIG_KEYS> = {
  ik: 'RigIkConstraint',
  transform: 'RigTransformConstraint',
  path: 'RigPathConstraint',
  physics: 'RigPhysicsConstraint',
  slider: 'RigSliderConstraint',
} satisfies Record<RigSkinConstraintKey, keyof typeof RIG_KEYS>;

/** The attachment `type` names, and the shape each one's keys come from. */
const ATTACHMENT_SHAPE: Record<string, keyof typeof RIG_KEYS> = {
  region: 'RigRegionAttachment',
  mesh: 'RigMeshAttachment',
  linkedmesh: 'RigLinkedMeshAttachment',
  boundingbox: 'RigBoundingBoxAttachment',
  clipping: 'RigClippingAttachment',
  path: 'RigPathAttachment',
};

/** The generator `kind` names, and the shape each one's keys come from. */
const GENERATOR_SHAPE: Record<(typeof RIG_GENERATOR_KINDS)[number], keyof typeof RIG_KEYS> = {
  ring: 'RigRingGenerator',
  ribbon: 'RigRibbonGenerator',
  contour: 'RigContourGenerator',
  grid: 'RigGridGenerator',
  segments: 'RigSegmentsGenerator',
};

/**
 * The attachment kinds that carry a `sequence` — the three `readAttachment`
 * branches that call `readSequence` (`SkeletonJson.js:530`, `:561`; `mesh` and
 * `linkedmesh` share the second).
 */
export const SEQUENCE_ATTACHMENT_TYPES = ['region', 'mesh', 'linkedmesh'] as const;

/**
 * One attachment's `sequence` block, refused by name where the parser would read
 * it into a series that is not the one the spec states.
 *
 * Every refusal here is a silence measured on spine-core 4.3.13 (issue #729):
 *
 *   - no `count` — the parser's default is 0, and the attachment loads holding
 *     no region at all;
 *   - a `setup` at or past `count` — `Sequence.resolveIndex` clamps it to the
 *     last frame (`setup: 7` on a four-frame series showed frame 4), and a
 *     negative one indexes `regions[-1]`;
 *   - a fractional `count`, `start`, `digits` or `setup` — `start: 1.5` makes
 *     `Sequence.getPath` ask the atlas for `stem1.5`;
 *   - an `image` beside it — one file names one region, and the series names
 *     `count` of them;
 *   - a `generator` beside it — a generator traces one plate, and which frame it
 *     should trace is not something the spec says.
 */
function checkRigSequence(att: Record<string, unknown>, who: string, where: string): void {
  const seq = att.sequence;
  const at = `${who} "sequence"`;
  if (!isObj(seq)) {
    throw new CompileError(
      `${where}: ${at} is ${JSON.stringify(seq) ?? String(seq)}, and a sequence is an object: ` +
        '`{ "count": <frames>, "start"?: <first number>, "digits"?: <zero padding>, "setup"?: <setup frame> }`', 'CE_RIG_SEQUENCE_OBJECT',
    );
  }
  const whole = (field: string, min: number): void => {
    const value = seq[field];
    if (value === undefined) return;
    // A number the file cannot carry is `refuseNumbersTheFileCannotCarry`'s,
    // one sentence for the whole family. This check runs inside the key scan,
    // before that walk, and printed a stated 1e309 as `null` (issue #881).
    if (typeof value === 'number' && !Number.isFinite(Math.fround(value))) return;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min) {
      throw new CompileError(
        `${where}: ${at}.${field} is ${JSON.stringify(value) ?? String(value)}; it is a whole number` +
          (min > 0 ? ` of at least ${min}` : min === 0 ? ' of at least 0' : '') +
          ' — `Sequence.getPath` writes `start + i` into the region name digit for digit, so a fraction names a ' +
          'region like `stem1.5` and a non-number names none', 'CE_RIG_SEQUENCE_INTEGER_FIELD',
      );
    }
  };
  if (seq.count === undefined) {
    throw new CompileError(
      `${where}: ${at} states no "count". The parser reads \`getValue(map, "count", 0)\` ` +
        '(`SkeletonJson.js:644`), so an omitted count is a series of NO frames: the attachment loads holding no ' +
        'region and draws nothing, without an error. State how many frames the series has.', 'CE_RIG_SEQUENCE_COUNT_REQUIRED',
    );
  }
  whole('count', 1);
  whole('start', 0);
  whole('digits', 0);
  whole('setup', 0);
  const count = seq.count as number;
  if (typeof seq.setup === 'number' && Number.isFinite(Math.fround(seq.setup)) && Number.isFinite(Math.fround(count)) && seq.setup >= count) {
    throw new CompileError(
      `${where}: ${at}.setup is ${seq.setup}, and a ${count}-frame series has frames 0 to ${count - 1}. ` +
        '`Sequence.resolveIndex` clamps an index at or past the end to the LAST frame (measured: `setup: 7` on ' +
        'four frames showed frame 4), so this would show a frame the spec does not name. `setup` is 0-based.', 'CE_RIG_SEQUENCE_SETUP_RANGE',
    );
  }
  for (const [field, why] of [
    ['image', 'an image names ONE region and a sequence names `count` of them — the frames are the regions ' +
      '`<path><number>`, and on the loose route each is the PNG of that name in the images directory'],
    ['generator', 'a generator traces one plate, and which frame of the series it should trace is not something ' +
      'the spec says — author the geometry, which every frame shares'],
  ] as const) {
    if (att[field] !== undefined) {
      throw new CompileError(`${where}: ${who} states "${field}" beside "sequence"; ${why}. Remove "${field}".`, 'CE_RIG_SEQUENCE_CONFLICTING_FIELD');
    }
  }
}

/**
 * Refuse every key of this rig spec that no shape above declares.
 *
 * ⭐ It walks the file rather than the emitter's route, and that is the whole
 * design. `compile` reaches an attachment only through a slot it is going to
 * draw and a `setup` entry only through a slot that has attachments, so a check
 * riding along with the emitter inherits its blind spots — which is how issue
 * #293's refusal sat green for three weeks on exactly the half-finished rigs it
 * was written for. Every node of the document is visited here, whether or not
 * anything downstream would have looked at it.
 *
 * A node that is not an object is left alone: its shape is somebody else's
 * refusal, and naming its keys would be a second opinion on a fault already
 * reported (see the note at the head of `parseMotionSpec`).
 */
function checkRigSpecKeys(raw: Record<string, unknown>, where: string): Array<{ node: Record<string, unknown>; shape: keyof typeof RIG_KEYS; path: Array<string | number> }> {
  const visits: Array<{ node: Record<string, unknown>; shape: keyof typeof RIG_KEYS; path: Array<string | number> }> = [];
  const at = (node: unknown, shape: keyof typeof RIG_KEYS, what: string, path: Array<string | number>): void => {
    if (!isObj(node)) return;
    refuseUnknownKeys(node, RIG_KEYS[shape], where, what);
    visits.push({ node, shape, path });
  };

  at(raw, 'RigSpec', 'this rig spec', []);
  at(raw.skeleton, 'RigSkeletonHeader', '"skeleton"', ['skeleton']);
  if (isObj(raw.skeleton)) at(raw.skeleton.stageBox, 'RigStageBox', 'skeleton.stageBox', ['skeleton', 'stageBox']);

  for (const [i, bone] of (Array.isArray(raw.bones) ? raw.bones : []).entries()) {
    const who = isObj(bone) && typeof bone.name === 'string' ? `bone "${bone.name}"` : `bones[${i}]`;
    at(bone, 'RigBone', who, ['bones', i]);
    if (isObj(bone)) at(bone.from, 'RigBoneFrom', `${who}'s "from"`, ['bones', i, 'from']);
  }

  for (const [i, slot] of (Array.isArray(raw.slots) ? raw.slots : []).entries()) {
    at(slot, 'RigSlot', isObj(slot) && typeof slot.name === 'string' ? `slot "${slot.name}"` : `slots[${i}]`, ['slots', i]);
  }

  for (const [i, constraint] of (Array.isArray(raw.constraints) ? raw.constraints : []).entries()) {
    if (!isObj(constraint)) continue;
    const named = typeof constraint.name === 'string' ? `constraint "${constraint.name}"` : `constraints[${i}]`;
    const shape = CONSTRAINT_SHAPE[String(constraint.type)];
    // An unknown `type` is `buildRigConstraint`'s refusal and names the five
    // that exist; there is no key set to check it against and no honest one to
    // guess, so it goes past here to the message that can say something.
    if (shape === undefined) continue;
    at(constraint, shape, `${named} (${String(constraint.type)})`, ['constraints', i]);
    for (const [from, entry] of Object.entries(isObj(constraint.properties) ? constraint.properties : {})) {
      at(entry, 'RigTransformProperty', `${named} properties."${from}"`, ['constraints', i, 'properties', from]);
      if (!isObj(entry)) continue;
      for (const [to, driven] of Object.entries(isObj(entry.to) ? entry.to : {})) {
        at(driven, 'RigTransformTo', `${named} properties."${from}".to."${to}"`, ['constraints', i, 'properties', from, 'to', to]);
      }
    }
  }

  for (const [name, event] of Object.entries(isObj(raw.events) ? raw.events : {})) {
    at(event, 'RigEvent', `event "${name}"`, ['events', name]);
  }

  for (const [i, stop] of (Array.isArray(raw.stops) ? raw.stops : []).entries()) {
    const who = isObj(stop) && typeof stop.chain === 'string' ? `stop "${stop.chain}"` : `stops[${i}]`;
    at(stop, 'RigStop', who, ['stops', i]);
    if (isObj(stop)) at(stop.lower, 'RigStopLower', `${who}'s "lower"`, ['stops', i, 'lower']);
  }

  if (isObj(raw.invariants)) {
    at(raw.invariants, 'RigInvariants', '"invariants"', ['invariants']);
    for (const [i, rule] of (Array.isArray(raw.invariants.detached) ? raw.invariants.detached : []).entries()) {
      at(rule, 'RigDetachedRule', `invariants.detached[${i}]`, ['invariants', 'detached', i]);
    }
    for (const [i, rule] of (Array.isArray(raw.invariants.deformMayFold) ? raw.invariants.deformMayFold : []).entries()) {
      at(rule, 'RigDeformFoldExemption', `invariants.deformMayFold[${i}]`, ['invariants', 'deformMayFold', i]);
    }
    for (const [i, rule] of (Array.isArray(raw.invariants.consumerDrivenMix) ? raw.invariants.consumerDrivenMix : []).entries()) {
      at(rule, 'RigConsumerDrivenMix', `invariants.consumerDrivenMix[${i}]`, ['invariants', 'consumerDrivenMix', i]);
    }
    at(raw.invariants.idleDrivesMeshes, 'RigIdleDrivesMeshes', 'invariants.idleDrivesMeshes', ['invariants', 'idleDrivesMeshes']);
    for (const [i, rule] of (Array.isArray(raw.invariants.axes) ? raw.invariants.axes : []).entries()) {
      at(rule, 'RigAxis', `invariants.axes[${i}]`, ['invariants', 'axes', i]);
    }
  }

  for (const [skinName, skin] of Object.entries(isObj(raw.skins) ? raw.skins : {})) {
    if (!isObj(skin)) continue;
    // The long form's own key check is `splitRigSkin`'s and it already names the
    // likeliest cause (a slot left outside `attachments`), so it is reused
    // rather than restated — one refusal per fault.
    const parts = splitRigSkin(skin as RigSkin, `${where}: skin "${skinName}"`);
    // The long form's own lists are typed too; `splitRigSkin` has just refused
    // a key outside them, so the row's keys are the node's keys.
    if (parts.explicit) visits.push({ node: skin, shape: 'RigSkinEntry', path: ['skins', skinName] });
    const base: Array<string | number> = parts.explicit ? ['skins', skinName, 'attachments'] : ['skins', skinName];
    for (const [slot, placeholders] of Object.entries(parts.attachments)) {
      if (!isObj(placeholders)) continue;
      for (const [placeholder, att] of Object.entries(placeholders)) {
        if (!isObj(att)) continue;
        const who = `skin "${skinName}" slot "${slot}" attachment "${placeholder}"`;
        // `type` absent means `region` — the parser's own default (`:539`).
        // A mesh carrying `source` is a LINKED mesh — `type: "mesh"` and
        // `type: "linkedmesh"` share one parser branch and the `source` key is
        // what decides (`:568-569`, `:582`; SPEC_COVERAGE part 1-6). So its keys
        // are checked against the LINK's shape whichever of the two spellings it
        // used: against a mesh's the fault came out as *2 keys this compiler does
        // not read: "source", "skin" … fix the spelling or remove it*, where
        // removing `source` is what unmakes the linked mesh. Until issue #691
        // this branch skipped the check entirely, because the construct had no
        // key set of its own to check against.
        const stated = att.type === undefined ? 'region' : String(att.type);
        const type = stated === 'mesh' && att.source !== undefined ? 'linkedmesh' : stated;
        const shape = ATTACHMENT_SHAPE[type];
        if (shape === undefined) continue;
        // Before the key check, so a `sequence` on a kind that has no texture is
        // named as that — "a key this compiler does not read … fix the spelling"
        // would send the author hunting for a typo in a word spelled right.
        if (att.sequence !== undefined && !(SEQUENCE_ATTACHMENT_TYPES as readonly string[]).includes(type)) {
          throw new CompileError(
            `${where}: ${who} is a ${type} and states a "sequence". A sequence is a numbered series of atlas ` +
              `regions, and only the ${SEQUENCE_ATTACHMENT_TYPES.length} kinds that draw a region carry one — ` +
              `${SEQUENCE_ATTACHMENT_TYPES.join(', ')} (\`readAttachment\` calls \`readSequence\` in exactly those ` +
              `branches, \`SkeletonJson.js:530\` and \`:561\`); on a ${type} the parser never reads the key, so the ` +
              'series would be dropped in silence. Remove it, or put it on a region or a mesh.', 'CE_RIG_SEQUENCE_ATTACHMENT_KIND',
          );
        }
        const here = [...base, slot, placeholder];
        at(att, shape, `${who} (${type})`, here);
        if (att.sequence !== undefined) {
          at(att.sequence, 'RigSequence', `${who} "sequence"`, [...here, 'sequence']);
          checkRigSequence(att, who, where);
        }
        for (const [i, vertex] of (Array.isArray(att.weights) ? att.weights : []).entries()) {
          for (const [j, binding] of (Array.isArray(vertex) ? vertex : []).entries()) {
            at(binding, 'RigMeshBinding', `${who} weights[${i}][${j}]`, [...here, 'weights', i, j]);
          }
        }
        at(att.depth, 'RigDepthMap', `${who} depth`, [...here, 'depth']);
        if (!isObj(att.generator)) continue;
        const gen = att.generator;
        const kind = RIG_GENERATOR_KINDS.find((k) => k === gen.kind);
        const genShape = kind === undefined ? undefined : GENERATOR_SHAPE[kind];
        // 🚨 An unknown `kind` used to be skipped here as "the mesh builder's
        // refusal", and the mesh builder had none: `buildGeneratedMesh` fell
        // through to the ring branch and threw a TypeError reading
        // `generator.size` (issue #900). `kind` chooses the row every other key
        // of the generator is checked against, so this dispatch is the one
        // place that can refuse it — before any of those keys is judged.
        if (genShape === undefined) {
          const stated = gen.kind === undefined ? 'absent' : (JSON.stringify(gen.kind) ?? String(gen.kind));
          throw new CompileError(
            `${where}: ${who} generator.kind is ${stated}; one of ${RIG_GENERATOR_KINDS.map((k) => JSON.stringify(k)).join(', ')} — ` +
              'the kind names the builder, and each builder reads its own keys, so nothing about the mesh can be checked or built without one', 'CE_RIG_GENERATOR_KIND',
          );
        }
        at(gen, genShape, `${who} generator (${String(gen.kind)})`, [...here, 'generator']);
        at(gen.bias, 'RigMeshBias', `${who} generator.bias`, [...here, 'generator', 'bias']);
        at(gen.depth, 'RigDepthMap', `${who} generator.depth`, [...here, 'generator', 'depth']);
        at(gen.soft, 'RigSoftRegion', `${who} generator.soft`, [...here, 'generator', 'soft']);
        at(gen.falloff, 'RigSegmentsFalloff', `${who} generator.falloff`, [...here, 'generator', 'falloff']);
        at(gen.influence, 'RigSegmentsInfluence', `${who} generator.influence`, [...here, 'generator', 'influence']);
        for (const [i, entry] of (Array.isArray(gen.bones) ? gen.bones : []).entries()) {
          at(entry, 'RigSegmentSpan', `${who} generator.bones[${i}]`, [...here, 'generator', 'bones', i]);
        }
      }
    }
  }
  return visits;
}


/**
 * A rig-spec path in the words the other refusals in this file use for it:
 * `bone "hip" x`, `constraint "aim" mixRotate`, `skin "default" slot "tail"
 * attachment "tail" weights[0][1].x`, `event "step" float`. Anything else is
 * the dotted path, which names every number exactly.
 */
function rigPlace(raw: Record<string, unknown>): (path: ReadonlyArray<string | number>) => string {
  const named = (list: unknown, i: number, kind: string, plural: string): string => {
    const node = Array.isArray(list) ? list[i] : undefined;
    return isObj(node) && typeof node.name === 'string' ? `${kind} ${JSON.stringify(node.name)}` : `${plural}[${i}]`;
  };
  const rest = (path: ReadonlyArray<string | number>): string => {
    const tail = dottedPath(path);
    return tail === '' ? '' : ` ${tail}`;
  };
  return (path) => {
    const [head, second] = path;
    if (typeof second === 'number') {
      if (head === 'bones') return `${named(raw.bones, second, 'bone', 'bones')}${rest(path.slice(2))}`;
      if (head === 'slots') return `${named(raw.slots, second, 'slot', 'slots')}${rest(path.slice(2))}`;
      if (head === 'constraints') return `${named(raw.constraints, second, 'constraint', 'constraints')}${rest(path.slice(2))}`;
      if (head === 'stops') {
        const node = Array.isArray(raw.stops) ? raw.stops[second] : undefined;
        const who = isObj(node) && typeof node.chain === 'string' ? `stop ${JSON.stringify(node.chain)}` : `stops[${second}]`;
        return `${who}${rest(path.slice(2))}`;
      }
    }
    if (head === 'events' && typeof second === 'string') return `event ${JSON.stringify(second)}${rest(path.slice(2))}`;
    if (head === 'skins' && typeof second === 'string') {
      const inner = path[2] === 'attachments' ? path.slice(3) : path.slice(2);
      const [slot, attachment] = inner;
      if (typeof slot === 'string' && typeof attachment === 'string') {
        return `skin ${JSON.stringify(second)} slot ${JSON.stringify(slot)} attachment ${JSON.stringify(attachment)}${rest(inner.slice(2))}`;
      }
      return `skin ${JSON.stringify(second)}${rest(path.slice(2))}`;
    }
    return dottedPath(path);
  };
}

/**
 * Parse and check the envelope, then hand back a typed spec.
 *
 * What is checked here is what makes the REST of the compiler able to assume its
 * inputs: the version tag, the two required arrays, name uniqueness, and that
 * every parent and every slot bone resolves against a bone declared earlier.
 * Deeper checks (does an attachment's image exist, does a constraint's target
 * bone exist) belong where the data is used, so their message can name the
 * consumer.
 */
export function parseRigSpec(raw: unknown, where: string): RigSpec {
  if (!isObj(raw)) throw new CompileError(`${where}: a rig spec must be a JSON object`, 'CE_RIG_SPEC_OBJECT');
  if (raw.spec !== RIG_SPEC_VERSION) {
    throw new CompileError(`${where}: unknown rig spec version ${JSON.stringify(raw.spec)}, expected "${RIG_SPEC_VERSION}"`, 'CE_RIG_SPEC_VERSION');
  }
  // Before anything resolves by name AND before the required keys are asked
  // for, because a key nothing reads is very often the CAUSE of the name — or
  // the array — that is not there: `"bones"` typed on a slider is a slider with
  // no driving bone, and `"slot"` typed at the root is a rig with no `slots` at
  // all. The refusal an author wants names the typo rather than the consequence.
  //
  // ⚠️ This comment argued exactly that while sitting three lines BELOW the
  // throws it was arguing about (issue #672), so misspelling a required key —
  // the commonest way to lose one — printed `a rig spec needs a "slots" array`
  // and never named the `"slot"` the file carried. `parseMotionSpec` was
  // written to this order and cites this function as its precedent; the
  // precedent was the prose here rather than the code.
  //
  // 🔒 Two checks stay above it, and both are the scan's own preconditions
  // rather than a preference. `isObj` is what makes `raw` an object to read
  // keys off at all. The version tag decides WHICH key set applies: a file
  // declaring a spec version this compiler does not know would otherwise be
  // refused key by key against `rigc-rig/1`'s sets — a list of "keys this
  // compiler does not read" for a format it has never read at all. The three
  // throws directly below are the required-key checks, and each of them is the
  // consequence a typo at the root produces.
  const visits = checkRigSpecKeys(raw, where);
  const place = rigPlace(raw);
  // Every value the scan admitted, against the type its key holds, before any
  // reader — here or in `compile` — has done arithmetic on it (issue #890).
  // ⚠️ It runs ahead of this function's own field checks on purpose: those read
  // values too, and a reader that meets a wrong type names the wrong fault —
  // `constraint.skin === true` reads `"skin": "true"` as a constraint that asks
  // for no skin. The price, measured, is three controls whose type half pinned an
  // older sentence (RF86, PS177, PS189); their other halves are unchanged.
  const shapeVisits: ShapeVisit[] = visits.map((v) => ({ node: v.node, shape: v.shape, name: (tail) => place([...v.path, ...tail]) }));
  refuseValuesOfTheWrongType(shapeVisits, RIG_TYPES, where);
  // A name outside an `enum` row's stated set (issue #900), after the type walk
  // and over the same visits: `boneIndexing: "foo"` built as the default and
  // `from.rotation: "foo"` as no rotation, both green. A row whose entry names
  // an owner is that reader's to refuse, in its own words.
  refuseValuesOutsideTheirSet(shapeVisits, RIG_TYPES, RIG_ENUMS, where);
  // After the key check, so a misspelled key is named as a misspelling before
  // its value is judged, and before every reader below, so no range rule or
  // derived number ever meets a value the file cannot carry (issue #881).
  refuseNumbersTheFileCannotCarry(raw, where, place);

  if (typeof raw.name !== 'string' || raw.name.length === 0) {
    throw new CompileError(`${where}: a rig spec needs a "name" — a motion spec names it to pick this rig`, 'CE_RIG_NAME_REQUIRED');
  }
  if (!Array.isArray(raw.bones) || raw.bones.length === 0) {
    throw new CompileError(`${where}: a rig spec needs a non-empty "bones" array`, 'CE_RIG_BONES_ARRAY_REQUIRED');
  }
  if (!Array.isArray(raw.slots)) {
    throw new CompileError(`${where}: a rig spec needs a "slots" array (it may be empty; its ORDER is the draw order)`, 'CE_RIG_SLOTS_ARRAY_REQUIRED');
  }

  // `stops` first, ahead of every name this function resolves: a chain's next
  // link hangs from the drawn link a stop generates, so the bones below are
  // read as the expansion lays them out — and every reader after this one sees
  // ordinary bones and constraints (`src/stop.ts`).
  const spec = expandStops(raw as unknown as RigSpec, where);

  // The stage, stated or stated absent. Half a statement is refused here rather
  // than resolved in `compile`, because which half was meant is not derivable
  // and a compiler that picks one is inventing a number (issue #578).
  const header = spec.skeleton;
  if (header !== undefined) {
    if (header.audio !== undefined && header.audio !== null && typeof header.audio !== 'string') {
      throw new CompileError(
        `${where}: "skeleton" states audio ${JSON.stringify(header.audio)}; it is a path from the skeleton file to ` +
          'its audio folder, or null for none — a string or null', 'CE_RIG_SKELETON_AUDIO_TYPE',
      );
    }
    const noWidth = header.width === null;
    const noHeight = header.height === null;
    if (noWidth !== noHeight) {
      const stated = noWidth ? 'height' : 'width';
      const absent = noWidth ? 'width' : 'height';
      throw new CompileError(
        `${where}: "skeleton" states ${absent}: null and a ${stated} of ` +
          `${JSON.stringify(noWidth ? header.height : header.width)}. A stage has both extents or neither: ` +
          'write both as null for "this skeleton declares no stage", or give both a number', 'CE_RIG_STAGE_EXTENTS_PAIR',
      );
    }
    if (noWidth && noHeight && (header.x !== undefined || header.y !== undefined)) {
      const origin = [header.x !== undefined ? 'x' : null, header.y !== undefined ? 'y' : null].filter((k) => k !== null);
      throw new CompileError(
        `${where}: "skeleton" declares no stage (width: null, height: null) and still states ${origin.join(' and ')}. ` +
          `${origin.length === 1 ? 'That is an origin' : 'Those are an origin'} for a box that is not there: ` +
          'drop them, or state a width and a height', 'CE_RIG_ABSENT_STAGE_ORIGIN',
      );
    }
    // The stage's box (issue #1168): both names stated, and a stage to draw it from.
    const box = header.stageBox;
    if (box !== undefined) {
      const missing = (['slot', 'attachment'] as const).filter((key) => typeof box[key] !== 'string' || box[key].length === 0);
      if (missing.length > 0) {
        throw new CompileError(
          `${where}: skeleton.stageBox states no ${missing.map((key) => `"${key}"`).join(' and ')}. It names the slot the ` +
            'stage box goes in and the attachment name it carries — `{ "slot": "stage", "attachment": "stage" }` — ' +
            'and both are required: rigc writes the box\'s numbers from the stage and names nothing on its own', 'CE_RIG_STAGE_BOX_NAMES_REQUIRED',
        );
      }
      if (noWidth && noHeight) {
        throw new CompileError(
          `${where}: skeleton.stageBox asks for the stage as a bounding box in slot "${box.slot}", and "skeleton" ` +
            'declares no stage (width: null, height: null) — a box around nothing. State a width and a height, or ' +
            'drop stageBox', 'CE_RIG_STAGE_BOX_WITHOUT_STAGE',
        );
      }
    }
  }

  const seen = new Set<string>();
  for (const bone of spec.bones) {
    if (!isObj(bone) || typeof bone.name !== 'string' || bone.name.length === 0) {
      throw new CompileError(`${where}: every bone needs a "name"`, 'CE_RIG_BONE_NAME_REQUIRED');
    }
    if (seen.has(bone.name)) {
      throw new CompileError(`${where}: two bones are called "${bone.name}"; bone names are the join key for slots, meshes and timelines`, 'CE_RIG_BONE_NAME_DUPLICATE');
    }
    seen.add(bone.name);
    if (bone.parent === undefined) continue;
    if (typeof bone.parent !== 'string' || !seen.has(bone.parent)) {
      // The parser resolves `parent` against the bones it has already read, so a
      // forward reference is not a rigc restriction — it is a bone with no parent
      // in the loaded skeleton, which loads as a second root.
      throw new CompileError(
        `${where}: bone "${bone.name}" names parent ${JSON.stringify(bone.parent)}, which is not declared before it`, 'CE_RIG_BONE_PARENT_ORDER',
      );
    }
    if (bone.inherit !== undefined && resolveBoneInherit(bone.inherit) === undefined) {
      throw new CompileError(
        `${where}: bone "${bone.name}" has inherit ${JSON.stringify(bone.inherit)}; ${BONE_INHERIT_KNOWN}`, 'CE_RIG_BONE_INHERIT_MODE',
      );
    }
    const from = bone.from;
    if (from !== undefined) {
      const sources = ['anchor', 'slotWindow', 'meshCenter'].filter((k) => from[k as keyof RigBoneFrom] !== undefined);
      if (sources.length > 1) {
        throw new CompileError(
          `${where}: bone "${bone.name}" takes its position from more than one source (${sources.join(', ')}); name exactly one`, 'CE_RIG_BONE_POSITION_SOURCES',
        );
      }
      if ((bone.x !== undefined || bone.y !== undefined) && sources.length === 1) {
        throw new CompileError(
          `${where}: bone "${bone.name}" declares both a literal x/y and from.${sources[0]}; the two would disagree the first time the art moved`, 'CE_RIG_BONE_POSITION_CONFLICT',
        );
      }
      if (from.rotation !== undefined && bone.rotation !== undefined) {
        throw new CompileError(`${where}: bone "${bone.name}" declares both a literal rotation and from.rotation`, 'CE_RIG_BONE_ROTATION_CONFLICT');
      }
      if (from.rotation === 'anchor' && from.anchor === undefined) {
        throw new CompileError(`${where}: bone "${bone.name}" wants its rotation from an anchor but names no from.anchor`, 'CE_RIG_BONE_ROTATION_ANCHOR_REQUIRED');
      }
    }
  }

  const slotNames = new Set<string>();
  for (const slot of spec.slots) {
    if (!isObj(slot) || typeof slot.name !== 'string' || slot.name.length === 0) {
      throw new CompileError(`${where}: every slot needs a "name"`, 'CE_RIG_SLOT_NAME_REQUIRED');
    }
    if (slotNames.has(slot.name)) throw new CompileError(`${where}: two slots are called "${slot.name}"`, 'CE_RIG_SLOT_NAME_DUPLICATE');
    slotNames.add(slot.name);
    if (typeof slot.bone !== 'string' || !seen.has(slot.bone)) {
      throw new CompileError(
        `${where}: slot "${slot.name}" names bone ${JSON.stringify(slot.bone)}, which this rig does not declare`, 'CE_RIG_SLOT_BONE_UNKNOWN',
      );
    }
    // Issue #946: this used to compare case-insensitively, so `ADDITIVE` built
    // green and the runtime read the slot as no mode at all. The rule is now the
    // runtime's own, the one `buildRigConstraint`'s enums state.
    if (slot.blend !== undefined && !isRigSlotBlend(slot.blend)) {
      throw new CompileError(
        `${where}: slot "${slot.name}" has blend ${JSON.stringify(slot.blend)}; known: ${RIG_SLOT_BLEND.join(', ')} ` +
          "(only the first letter's case is free — the parser's enumValue uppercases that one character and nothing " +
          'else, and an unresolved name becomes undefined without an error)', 'CE_RIG_SLOT_BLEND_MODE',
      );
    }
  }

  // `invariants.deformMayFold` — one of the three fields in this file that TURN
  // A CHECK OFF (`consumerDrivenMix` and `idleDrivesMeshes`, below, are the
  // others), so its own shape is checked harder than the fields that turn one on. A
  // typo in a slot name here would silently exempt nothing and gate everything,
  // which reads exactly like the check working; and an exemption with no reason
  // is unreviewable six months later. Both are refused by name.
  const mayFold = spec.invariants?.deformMayFold;
  if (mayFold !== undefined) {
    if (!Array.isArray(mayFold)) {
      throw new CompileError(
        `${where}: invariants.deformMayFold is ${JSON.stringify(mayFold)}, expected an array of { "slot": …, "why": … }`, 'CE_RIG_DEFORM_FOLD_EXEMPTIONS_SHAPE',
      );
    }
    const declared = new Set<string>();
    for (const entry of mayFold) {
      if (!isObj(entry) || typeof entry.slot !== 'string' || entry.slot.length === 0) {
        throw new CompileError(`${where}: every invariants.deformMayFold entry needs a "slot"`, 'CE_RIG_DEFORM_FOLD_SLOT_REQUIRED');
      }
      if (!slotNames.has(entry.slot)) {
        throw new CompileError(
          `${where}: invariants.deformMayFold exempts slot "${entry.slot}", which this rig does not declare — ` +
            'a name that resolves to nothing exempts nothing, and reads like the exemption worked', 'CE_RIG_DEFORM_FOLD_SLOT_UNKNOWN',
        );
      }
      if (declared.has(entry.slot)) {
        throw new CompileError(`${where}: invariants.deformMayFold names slot "${entry.slot}" twice`, 'CE_RIG_DEFORM_FOLD_SLOT_DUPLICATE');
      }
      declared.add(entry.slot);
      if (typeof entry.why !== 'string' || entry.why.trim().length === 0) {
        throw new CompileError(
          `${where}: invariants.deformMayFold entry for slot "${entry.slot}" needs a "why" — this field switches ` +
            'A39_DEFORM_KEEPS_TRIANGLE_WINDING off for that slot, and an exemption nobody can date or justify is ' +
            'how a defect ships as a decision', 'CE_RIG_DEFORM_FOLD_REASON_REQUIRED',
        );
      }
    }
  }

  // A constraint's namespace is its KIND, not the array (issue #692).
  // `SkeletonData.findConstraint(name, type)` tests `constraint instanceof type`
  // BEFORE it compares the name, and every resolution in the format goes through
  // it: a timeline group, a skin's member list, a slider's own second pass. So an
  // ik constraint and a transform constraint called `leg` are two objects nothing
  // can confuse, and the rig spec refusing them was stricter than the file it
  // emits — a shape four skeletons of a production corpus have, where the chain
  // and the transform constraint that follows it carry the chain's name.
  /** Every constraint, in declaration order, so the refusals below read in file order. */
  const constraintsDeclared: Array<{ type: string; name: string; skinRequired: boolean }> = [];
  /** `<kind> constraint "<name>"` -> that constraint. The key IS the namespace. */
  const constraintFacts = new Map<string, { type: string; name: string; skinRequired: boolean }>();
  /** name -> the kinds that declare it, for the message that has to say which. */
  const constraintKinds = new Map<string, string[]>();
  for (const constraint of spec.constraints ?? []) {
    if (!isObj(constraint) || typeof constraint.name !== 'string' || constraint.name.length === 0) {
      throw new CompileError(`${where}: every constraint needs a "name"`, 'CE_RIG_CONSTRAINT_NAME_REQUIRED');
    }
    const declared = { type: String(constraint.type), name: constraint.name, skinRequired: constraint.skin === true };
    if (constraintFacts.has(constraintAt(declared.type, declared.name))) {
      throw new CompileError(
        `${where}: two ${declared.type} constraints are called "${declared.name}" — a constraint resolves by name ` +
          'AND type (`SkeletonData.findConstraint`), so names are unique PER KIND: an ik and a transform constraint ' +
          'may share one, two of a kind may not', 'CE_RIG_CONSTRAINT_NAME_DUPLICATE',
      );
    }
    constraintsDeclared.push(declared);
    constraintFacts.set(constraintAt(declared.type, declared.name), declared);
    constraintKinds.set(declared.name, [...(constraintKinds.get(declared.name) ?? []), declared.type]);
    // An ik's `bones` as a shape (issue #1205): more than two, or a pair that is
    // not a parent and its child, both load and build green and the solver then
    // moves nothing or solves a triangle nobody drew — `ikShapeFault` says which.
    // Read only once every name resolves to a declared bone, so a misspelling is
    // still the compiler's refusal by name rather than a shape it does not have.
    const ikBones = constraint.type === 'ik' ? constraint.bones : undefined;
    if (Array.isArray(ikBones) && ikBones.every((b): b is string => typeof b === 'string' && seen.has(b))) {
      const secondAncestors: string[] = [];
      if (ikBones.length === 2) {
        for (let at = spec.bones.find((b) => b.name === ikBones[1])?.parent; at !== undefined; at = spec.bones.find((b) => b.name === at)?.parent) secondAncestors.push(at);
      }
      const fault = ikShapeFault(constraint.name, ikBones, secondAncestors);
      if (fault !== null) throw new CompileError(`${where}: ${fault}`, 'CE_RIG_IK_BONES_SHAPE');
    }
  }

  // `invariants.consumerDrivenMix` — the second field in `invariants` that TURNS
  // A CHECK OFF, so it is held to `deformMayFold`'s standard above: every way an
  // entry could exempt nothing while reading like it worked is refused by name
  // (issue #784). It resolves against `constraintFacts` because a constraint's
  // namespace is its kind — the entry says which kind, and the lookup is that key.
  const consumerDriven = spec.invariants?.consumerDrivenMix;
  if (consumerDriven !== undefined) {
    const shape = 'an array of { "constraint": …, "type": "ik" | "transform", "why": … }';
    if (!Array.isArray(consumerDriven)) {
      throw new CompileError(`${where}: invariants.consumerDrivenMix is ${JSON.stringify(consumerDriven)}, expected ${shape}`, 'CE_RIG_CONSUMER_MIX_EXEMPTIONS_SHAPE');
    }
    const named = new Set<string>();
    for (const entry of consumerDriven) {
      if (!isObj(entry) || typeof entry.constraint !== 'string' || entry.constraint.length === 0) {
        throw new CompileError(`${where}: every invariants.consumerDrivenMix entry needs a "constraint" — ${shape}`, 'CE_RIG_CONSUMER_MIX_CONSTRAINT_REQUIRED');
      }
      if (entry.type !== 'ik' && entry.type !== 'transform') {
        const declaredAs = constraintKinds.get(entry.constraint) ?? [];
        throw new CompileError(
          `${where}: invariants.consumerDrivenMix entry for "${entry.constraint}" has type ${JSON.stringify(entry.type)}; ` +
            'only "ik" and "transform" read this declaration (A47_IK_CONSTRAINT_NOT_MUTED_THROUGHOUT, ' +
            'A48_TRANSFORM_CONSTRAINT_NOT_MUTED_THROUGHOUT). A path, physics or slider constraint resting muted is ' +
            'A36, A23 or A37, which read no declaration, so the entry would exempt nothing' +
            (declaredAs.length ? ` — the rig declares "${entry.constraint}" as ${declaredAs.map((t) => `${t === 'ik' ? 'an' : 'a'} ${t}`).join(' and ')} constraint` : ''), 'CE_RIG_CONSUMER_MIX_KIND',
        );
      }
      const key = constraintAt(entry.type, entry.constraint);
      if (!constraintFacts.has(key)) {
        const declaredAs = constraintKinds.get(entry.constraint) ?? [];
        throw new CompileError(
          `${where}: invariants.consumerDrivenMix names ${key}, which this rig does not declare` +
            (declaredAs.length
              ? ` — "${entry.constraint}" is declared as ${declaredAs.map((t) => `${t === 'ik' ? 'an' : 'a'} ${t}`).join(' and ')} constraint, and a constraint resolves by name AND type`
              : '') +
            '. A name that resolves to nothing exempts nothing, and reads like the exemption worked', 'CE_RIG_CONSUMER_MIX_CONSTRAINT_UNKNOWN',
        );
      }
      if (named.has(key)) throw new CompileError(`${where}: invariants.consumerDrivenMix names ${key} twice`, 'CE_RIG_CONSUMER_MIX_CONSTRAINT_DUPLICATE');
      named.add(key);
      if (typeof entry.why !== 'string' || entry.why.trim().length === 0) {
        throw new CompileError(
          `${where}: invariants.consumerDrivenMix entry for ${key} needs a "why" — this field switches ` +
            `${entry.type === 'ik' ? 'A47_IK_CONSTRAINT_NOT_MUTED_THROUGHOUT' : 'A48_TRANSFORM_CONSTRAINT_NOT_MUTED_THROUGHOUT'} ` +
            'off for that constraint, and an exemption nobody can date or justify is how a defect ships as a decision', 'CE_RIG_CONSUMER_MIX_REASON_REQUIRED',
        );
      }
    }
  }

  // `invariants.idleDrivesMeshes` — the third field that TURNS A CHECK OFF
  // (issues #855, #858), so it is held to the same standard: the one shape it
  // accepts is `{ "why": … }`, and a `why` that is missing, blank or not a
  // string is refused by name. `true` is refused too, even though it reads like
  // the obvious spelling — a switch with no reason attached is exactly the
  // exemption nobody can review later. Whether the declaration switches off
  // anything is a question about the emitted `idle`, so it is the gate's (A15
  // refuses a stale one), not this parser's.
  const idleDrives = spec.invariants?.idleDrivesMeshes;
  if (idleDrives !== undefined) {
    const shape = '{ "why": "<why this idle deforms meshes on purpose>" }';
    if (!isObj(idleDrives)) {
      throw new CompileError(`${where}: invariants.idleDrivesMeshes is ${JSON.stringify(idleDrives)}, expected ${shape}`, 'CE_RIG_IDLE_MESH_EXEMPTION_SHAPE');
    }
    if (typeof idleDrives.why !== 'string' || idleDrives.why.trim().length === 0) {
      throw new CompileError(
        `${where}: invariants.idleDrivesMeshes needs a "why" (a non-blank string), got ` +
          `${idleDrives.why === undefined ? 'none' : JSON.stringify(idleDrives.why)} — expected ${shape}. This field switches ` +
          'A15_IDLE_NO_MESH_BONE_KEYS off, and an exemption nobody can date or justify is how a defect ships as a decision', 'CE_RIG_IDLE_MESH_REASON_REQUIRED',
      );
    }
  }

  // `invariants.axes` (issue #1351) — a field that TURNS A CHECK ON, and every
  // way an entry could check nothing while reading like it did is refused by
  // name: a bone that resolves to nothing, a line through one bone, a repeated
  // name, a tolerance that is missing or admits every orientation. What it
  // cannot refuse is two `through` bones landing on one world origin: that is
  // a fact about the posed setup pose, constraints included, which this parser
  // does not pose — `A51_BONES_LIE_ALONG_THEIR_DECLARED_AXIS` refuses it by the
  // entry's name.
  const axes = spec.invariants?.axes;
  if (axes !== undefined) {
    const shape = 'an array of { "name": …, "through": [<bone>, <bone>], "bones": [<bone>, …], "tolerance": <degrees> }';
    if (!Array.isArray(axes)) throw new CompileError(`${where}: invariants.axes is ${JSON.stringify(axes)}, expected ${shape}`, 'CE_RIG_AXES_SHAPE');
    const named = new Set<string>();
    for (const [i, entry] of axes.entries()) {
      const field = `invariants.axes[${i}]`;
      if (!isObj(entry) || typeof entry.name !== 'string' || entry.name.length === 0) {
        throw new CompileError(`${where}: ${field} needs a "name" — ${shape}`, 'CE_RIG_AXIS_NAME_REQUIRED');
      }
      const axis = `${field} "${entry.name}"`;
      if (named.has(entry.name)) throw new CompileError(`${where}: ${field}: invariants.axes names "${entry.name}" twice — a failure names its entry, and two entries of one name could not be told apart`, 'CE_RIG_AXIS_NAME_DUPLICATE');
      named.add(entry.name);
      const through: unknown = entry.through;
      if (!Array.isArray(through) || through.length !== 2 || !through.every((b): b is string => typeof b === 'string')) {
        throw new CompileError(`${where}: ${axis}: "through" is ${JSON.stringify(through)}, expected two bone names — the line is drawn through their setup-pose world origins`, 'CE_RIG_AXIS_THROUGH_PAIR');
      }
      for (const [k, bone] of through.entries()) {
        if (!seen.has(bone)) throw new CompileError(`${where}: ${axis}: through[${k}] names bone "${bone}", which this rig does not declare — a line through nothing holds nothing`, 'CE_RIG_AXIS_THROUGH_BONE_UNKNOWN');
      }
      if (through[0] === through[1]) {
        throw new CompileError(`${where}: ${axis}: "through" names bone "${through[0]}" twice — one bone's origin is a point, and a point draws no line`, 'CE_RIG_AXIS_THROUGH_BONE_DUPLICATE');
      }
      const bones: unknown = entry.bones;
      if (!Array.isArray(bones) || bones.length === 0 || !bones.every((b): b is string => typeof b === 'string')) {
        throw new CompileError(`${where}: ${axis}: "bones" is ${JSON.stringify(bones)}, expected a non-empty array of bone names — the bones held to the line`, 'CE_RIG_AXIS_BONES_ARRAY');
      }
      const held = new Set<string>();
      for (const [k, bone] of bones.entries()) {
        if (!seen.has(bone)) throw new CompileError(`${where}: ${axis}: bones[${k}] names bone "${bone}", which this rig does not declare — a name that resolves to nothing is held to nothing, and reads like it was`, 'CE_RIG_AXIS_HELD_BONE_UNKNOWN');
        if (held.has(bone)) throw new CompileError(`${where}: ${axis}: "bones" names bone "${bone}" twice`, 'CE_RIG_AXIS_HELD_BONE_DUPLICATE');
        held.add(bone);
      }
      const tolerance: unknown = entry.tolerance;
      if (typeof tolerance !== 'number' || !Number.isFinite(tolerance) || !(tolerance > 0) || !(tolerance < 90)) {
        throw new CompileError(
          `${where}: ${axis}: "tolerance" is ${tolerance === undefined ? 'absent' : JSON.stringify(tolerance)}; it must be a number of degrees above 0 and below 90, ` +
            'and there is no default — two lines meet at 0° to 90°, so 90 or more admits every orientation and can never fail, ' +
            'and 0 refuses a bone rotated exactly onto the line whenever the posed arithmetic rounds', 'CE_RIG_AXIS_TOLERANCE_RANGE',
        );
      }
    }
  }

  // --- skins: the attachment table, and what the skin ACTIVATES --------------
  //
  // The lists resolve by name like everything else in this format, and the
  // parser is loud about a miss (`Couldn't find bone X for skin Y`) — but in the
  // consumer's process, so they are refused here where the message can name the
  // rig spec. What the parser does NOT check is the pairing with `skin: true`,
  // and that half is silent in both directions (see `RigSkinEntry`).
  //
  // ⭐ **Sets rather than "which skin owns this", because a name may be in
  // several lists.** Until issue #725 these were `name -> the skin that claimed
  // it first`, and a second skin naming the same bone or constraint was refused
  // with *"a bone belongs to one skin"*. The rule was never the parser's and the
  // comment above it said so; what it rested on was that "which skin am I for"
  // has no answer for a name in two lists. It has one, and the runtime gives it:
  // `Skeleton.updateCache` activates the bones of the skin being WORN, so a bone
  // two mutually exclusive variants both list is active under either — measured
  // on a hand-forged file the refusal used to prevent, `bone.active` true under
  // each of the two skins, false under a third that lists nothing and false with
  // no skin set. `Skin.addSkin` deduplicates by object identity, so even a
  // consumer combining both variants gets the bone once. The format is a
  // per-skin SET and rigc now says the same thing.
  //
  // ⚠️ **The worn skin, and only the worn skin.** `updateCache` reads
  // `this.skin` and never `SkeletonData.defaultSkin` — the default-skin fallback
  // is `getAttachment`'s and covers art alone — so a `skin: true` bone that only
  // the `default` skin lists is measured INACTIVE under every other skin and
  // with no skin set. That is why nothing here is a union, and it is the one
  // shape an author is most likely to write expecting "always on".
  //
  // What the rule was really guarding — a second list that was meant to name a
  // different bone — is not derivable from the file, so it is not refused. Every
  // refusal that IS derivable stays: a name the rig does not declare, a name
  // declared under another constraint kind, and both halves of the `skin: true`
  // switch, each of which the rig suite now measures on a shared member.
  const skinBoneUse = new Set<string>();
  const skinConstraintUse = new Set<string>();
  if (spec.skins !== undefined) {
    if (!isObj(spec.skins)) throw new CompileError(`${where}: "skins" is an object keyed by skin name`, 'CE_RIG_SKINS_TABLE');
    const collision = RIG_SKIN_KEYS.find((key) => slotNames.has(key));
    if (collision !== undefined) {
      // The long form is recognised by these keys, so a slot of one of those
      // names is genuinely ambiguous in the short form. Guessing either way
      // loses an attachment table or a member list in silence.
      throw new CompileError(
        `${where}: a slot is called "${collision}", which is one of the keys that tell a skin's long form ` +
          '(`{ "attachments": {…}, "bones": [...] }`) from its short one (`slotName -> placeholder -> attachment`): ' +
          `${RIG_SKIN_KEYS.join(', ')}. Rename the slot.`, 'CE_RIG_SLOT_SKIN_KEY_COLLISION',
      );
    }
    for (const [skinName, skin] of Object.entries(spec.skins)) {
      const at = `${where}: skin "${skinName}"`;
      const parts = splitRigSkin(skin, at);
      for (const bone of parts.bones) {
        if (!seen.has(bone)) {
          throw new CompileError(`${at} activates bone "${bone}", which this rig does not declare`, 'CE_RIG_SKIN_BONE_UNKNOWN');
        }
        skinBoneUse.add(bone);
        const declared = spec.bones.find((b) => b.name === bone);
        if (declared?.skin !== true) {
          throw new CompileError(
            `${at} activates bone "${bone}", but that bone does not declare \`"skin": true\`. ` +
              'Skeleton.updateCache starts a bone active unless it is skinRequired, so this list changes nothing — ' +
              'the bone poses under every skin.', 'CE_RIG_SKIN_BONE_NOT_REQUIRED',
          );
        }
      }
      for (const type of RIG_SKIN_CONSTRAINT_KEYS) {
        for (const name of parts.constraints[type]) {
          const facts = constraintFacts.get(constraintAt(type, name));
          if (facts === undefined) {
            // The lookup is by name AND type here for the same reason the parser's
            // is, so "no constraint of this kind" and "no constraint at all" are
            // two different misses and say so.
            const kinds = constraintKinds.get(name) ?? [];
            if (kinds.length === 0) {
              throw new CompileError(`${at} activates ${type} constraint "${name}", which this rig does not declare`, 'CE_RIG_SKIN_CONSTRAINT_UNKNOWN');
            }
            // `findConstraint(name, IkConstraintData)` resolves by name AND type,
            // and the parser throws on the miss.
            throw new CompileError(
              `${at} lists "${name}" under "${type}", but the rig declares it as a "${kinds.join('", "')}" constraint — ` +
                'a skin looks its constraints up by name AND type, so this one is a miss and the loader throws', 'CE_RIG_SKIN_CONSTRAINT_KIND',
            );
          }
          skinConstraintUse.add(constraintAt(type, name));
          if (!facts.skinRequired) {
            throw new CompileError(
              `${at} activates ${type} constraint "${name}", but that constraint does not declare \`"skin": true\`. ` +
                'A constraint is active unless it is skinRequired, so this list changes nothing.', 'CE_RIG_SKIN_CONSTRAINT_NOT_REQUIRED',
            );
          }
        }
      }
    }
  }
  // The other direction, and the silent one that costs a pose: an object that
  // declared `skin: true` and appears in no list is switched off under every skin
  // there is. Outside the block above on purpose — a rig with no `skins` at all
  // is the strongest case of it. A listed bone activates its ancestors too
  // (`Skeleton.ts:198-205`), so a parent reachable only that way is not dead.
  const activated = new Set(skinBoneUse);
  const parentOf = new Map(spec.bones.map((b) => [b.name, b.parent]));
  for (const bone of [...activated]) {
    for (let cursor = parentOf.get(bone); cursor; cursor = parentOf.get(cursor)) activated.add(cursor);
  }
  for (const bone of spec.bones) {
    if (bone.skin === true && !activated.has(bone.name)) {
      throw new CompileError(
        `${where}: bone "${bone.name}" declares \`"skin": true\` but no skin activates it, so it is never active — ` +
          'list it in the skin it belongs to, or drop the flag', 'CE_RIG_BONE_SKIN_NEVER_ACTIVE',
      );
    }
  }
  for (const { type, name, skinRequired } of constraintsDeclared) {
    if (skinRequired && !skinConstraintUse.has(constraintAt(type, name))) {
      throw new CompileError(
        `${where}: ${type} constraint "${name}" declares \`"skin": true\` but no skin activates it, so it never runs — ` +
          `list it in that skin's "${type}" array, or drop the flag`, 'CE_RIG_CONSTRAINT_SKIN_NEVER_ACTIVE',
      );
    }
  }

  if (raw.events !== undefined) {
    if (!isObj(raw.events)) {
      throw new CompileError(
        `${where}: "events" is an object keyed by event name (\`{ "footstep": {} }\`), not an array — the format's own shape`, 'CE_RIG_EVENTS_TABLE',
      );
    }
    for (const [name, def] of Object.entries(raw.events)) {
      if (name.length === 0) throw new CompileError(`${where}: an event has an empty name`, 'CE_RIG_EVENT_NAME_EMPTY');
      if (!isObj(def)) {
        throw new CompileError(`${where}: event "${name}" must be an object of payload defaults (use {} for none)`, 'CE_RIG_EVENT_DEFAULTS_OBJECT');
      }
      for (const field of ['int', 'float', 'volume', 'balance'] as const) {
        const v = def[field];
        if (v !== undefined && (typeof v !== 'number' || !Number.isFinite(v))) {
          throw new CompileError(`${where}: event "${name}" has ${field} ${JSON.stringify(v)}, which is not a finite number`, 'CE_RIG_EVENT_NUMBER_FINITE');
        }
      }
      if (def.int !== undefined && !Number.isInteger(def.int)) {
        throw new CompileError(`${where}: event "${name}" has int ${JSON.stringify(def.int)}; the payload is an integer`, 'CE_RIG_EVENT_INT_WHOLE');
      }
      for (const field of ['string', 'audio'] as const) {
        if (def[field] !== undefined && typeof def[field] !== 'string') {
          throw new CompileError(`${where}: event "${name}" has ${field} ${JSON.stringify(def[field])}, which is not a string`, 'CE_RIG_EVENT_STRING_TYPE');
        }
      }
      // SkeletonJson.ts:478-481 reads these two ONLY inside `if (data.audioPath)`.
      // Without an audio path they are dropped with no error, so a spec that
      // wrote them down would carry a number no runtime ever reads.
      for (const field of ['volume', 'balance'] as const) {
        if (def[field] !== undefined && def.audio === undefined) {
          throw new CompileError(
            `${where}: event "${name}" declares ${field} but no "audio"; the parser reads ${field} only when an audio path is set, so it would be dropped in silence`, 'CE_RIG_EVENT_AUDIO_REQUIRED',
          );
        }
      }
    }
  }

  return spec;
}
