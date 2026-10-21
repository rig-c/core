/**
 * The core's raw entry (issue #966, step 3b of issue #380): one pose, or one
 * animation walked at the caller's own steps, returned as the doubles the
 * core computed — no grid — with everything a renderer or a deform measurer
 * reads past the oracle's rows: each bone's world rotation and scale
 * readings, each drawn attachment's local UVs, triangles, hull, sequence
 * frame and colour, the clip polygons, the triangles drawn under a clip, and
 * the events fired.
 *
 * The oracle's document (`tools/pose_oracle.ts`) samples an animation on a
 * phase grid, re-applying it from the setup pose at every sample; the two
 * consumers step instead. `src/render.ts` resets a track at 0 and then takes
 * exactly one step of `1/fps` per frame; `src/deformmeasure.ts` resets and
 * takes one step of `time`. So the entry takes a list of steps rather than a
 * list of times, and this header states what one step is, as measured.
 *
 * ## One step — the walk, measured
 *
 * Measured against spine-core 4.3.13 running `src/render.ts`'s recipe
 * (`AnimationState` with one non-looping track: frame 0 `apply`,
 * `Skeleton.update(0)`, `updateWorldTransform(Physics.reset)`; every later
 * frame `AnimationState.update(dt)`, `apply`, `Skeleton.update(dt)`,
 * `updateWorldTransform(Physics.update)`), read off `TrackEntry.trackTime`,
 * `TrackEntry.getAnimationTime()` and every bone's `appliedPose` in full
 * doubles (the PR of issue #966 carries the table):
 *
 * - **The track time is the running sum of the steps**, `T += dt` in double,
 *   not `i·dt`, and the animation is applied at the sum. Over every
 *   animation of the nineteen tree rows `TrackEntry.trackTime` equalled the
 *   running sum on 2,612 of 2,612 frames at 12 fps (12,850 of 12,850 at 60,
 *   5,173 of 5,173 at 24) and `i·dt` on only 662 (1,168; 810): at 12 fps
 *   frame 6 reads `0.49999999999999994`, not `0.5`, and frame 10
 *   `0.8333333333333334`, not `0.8333333333333333`. `src/render.ts` files a
 *   frame under `i·dt`, which is its label and not the time posed.
 * - **A non-looping track holds at its duration**: the animation time is
 *   `min(T, duration)`, where `duration` is the runtime's (the last key of
 *   every timeline, as float32 — `CoreAnimationTimelines.duration`). With
 *   `round(duration·fps)` frames the last one overshoots on 20 animation
 *   frames of the 2,612 at 12 fps (19 at 60, 25 at 24), and
 *   `getAnimationTime()` read the duration on every one of them.
 * - **The physics clock moves by the step itself**, `time += dt` (the
 *   skeleton's `update`), and a physics constraint integrates the time it
 *   moved (`./constraints_physics.ts`). Pose 0 is the reset, every physics
 *   state reset there (where, below).
 * - **Events fire over `(previous animation time, animation time]`**, the
 *   first step's interval opening at −1 — so held past the duration, a step
 *   fires nothing. Measured against `AnimationState`'s event listener on
 *   every frame above.
 * - **Where the reset is taken is the caller's** (`RawReset`): render's
 *   frame 0 applies the animation at 0 and resets there (`animation`);
 *   deformmeasure's `poseAt` resets at the setup pose and then applies the
 *   animation in its one step (`setup`). On a physics rig the two differ by
 *   whole units, not bits: of the 162 one-jump poses (three per animation),
 *   12 read off under `animation` — six on `7-anticipation`'s physics rig (a
 *   cape bone 1.7° off at 0.617 s) and six on `gallery/look`'s — and none
 *   under `setup`.
 *
 * Every step poses the animation from the setup pose at its animation time
 * (the setup blend at alpha 1), as the oracle's stepped dump does, applied
 * from the animation time of the step before (−1 before the first): a
 * physics `reset` key fires on the step that crosses it, once. Until issue
 * #960 this walk fired such a key at every step from it on (the oracle's
 * reading then), and against the recipe above a probe with a key at 0.5
 * read 32 of 61 frames bit-exact at 60 fps, the rest off by up to 53 units;
 * with the key crossed once, 61 of 61 at 60 fps and 13 of 13 at 12. None of
 * the nineteen tree rows keys a `reset`, which is why the raw gate never
 * saw it. The one difference from `--physics step` is where the steps fall,
 * which is the caller's.
 *
 * ## What a pose carries
 *
 * - `bones` — the world matrix and origin, and the four readings the
 *   runtime's getters give: `rotationX = atan2(c, a)·DEG`, `rotationY =
 *   atan2(d, b)·DEG`, `scaleX = √(a² + c²)`, `scaleY = √(b² + d²)`, with
 *   `DEG = 180 / π` at the runtime's π (`RUNTIME_DEG` in `./world.ts`) —
 *   measured bit-exact against `BonePose.getWorldRotationX/Y` and
 *   `getWorldScaleX/Y` on every bone of 2,793 poses of the nineteen tree
 *   rows (the setup, every 12 fps frame, three jumps per animation).
 * - `slots` — the oracle's slot row as doubles (`posedSlots`).
 * - `drawn` — every region and mesh a slot shows, in draw order: its world
 *   vertices (the oracle's `attachments` row as doubles), its LOCAL UVs as the
 *   runtime holds them (a region's unit corners `0 1, 0 0, 1 0, 1 1` in the
 *   corner order; a mesh's `uvs` — a linked mesh's source's — as the
 *   document spells them: `MeshAttachment.regionUVs` read the doubles, not
 *   their float32, on every mesh of the nineteen rows — `6-arcs`'
 *   `2.554152e-7` where `Math.fround` gives `2.5541518766658555e-7`), its
 *   triangles (a region's `0 1 2 2
 *   3 0`), its hull (a mesh's; `null` for a region), its sequence frame (the
 *   frame a sequence timeline set, else the series' setup frame, else 0 —
 *   the runtime gives every region and mesh a series, one frame long when
 *   the record states none, and `Sequence.resolveIndex` read 0 on every such
 *   attachment of the nineteen rows) and its own colour (the record's `color`, white
 *   unstated) — so the caller forms the tint, slot colour times attachment
 *   colour, itself. Where a region sits on a page is not the model's
 *   (`ModelAtlasRect`'s 🔸); the page UVs are issue #967's.
 * - `clips`, `clipped` — the oracle's rows as doubles; `clipped` is what the
 *   core DRAWS, which is the oracle's block wherever the core poses it and,
 *   under a clip that is not strictly convex or is inverse (a block the core
 *   leaves out), the core's own convex decomposition (`clipThrough` in
 *   `./clipping.ts`, issue #964), held to spine-core by the render's pixels.
 * - `events` — the oracle's event rows as doubles.
 *
 * 🔁 **A second walk shares this one** (issue #1025, cut 4c-5a): A10's
 * LOOPING walk, which keeps a non-finite value rather than refusing it, is
 * `./walk.ts`; both are `walkIn` below in a `WalkMode`, and every difference
 * is a branch on the mode — so this entry's walk is the one it was, and the
 * raw gate's lines did not move.
 *
 * ⛔ **Nothing is posed that the core would leave out.** Where the oracle's
 * core dump names a block absent — a constraint the core cannot pose
 * exactly, skins disagreeing over a placeholder under the merged view, a
 * region with no atlas rectangle — the raw entry refuses the whole call,
 * naming why (`CoreInputError`): a renderer handed a pose with a block
 * missing would draw a different picture in silence.
 */
import { activeBones, CoreInputError, drawWalkOf, poseSetup, rawNumber, readColour, shownAttachment, sourceOfDoc, underNoSkin, underSkin, type CompiledDocument, type CorePlant, type CoreSlotRow } from './index.ts';
import { posedBoneWorld, posedBoneWorldAlone, posedSlots, type CoreAnimationTimelines, type LocalAdjust, type TimelinePlant } from './animation.ts';
import { constraintsAbsentWhy, pathAnimationsWhy } from './constraints.ts';
import { freshStepContext, rotatePhysics, steppedPreviousPassWhy, translatePhysics, DEFAULT_PHYSICS_ENVIRONMENT, type PhysicsEnvironment, type PhysicsStepContext } from './constraints_physics.ts';
import { attachmentStates } from './deform.ts';
import { drawOrderAt, type CoreDrawOrderKey } from './draw_order.ts';
import { eventsFired, type CoreEventRow } from './events.ts';
import { REGION_TRIANGLES, REGION_UVS, type CoreClippedRow, type ShapeClipper } from './clipping.ts';
import { meshArraysOf, poseGeometry, worldVertices, type CoreAttachmentRow, type CoreClipRow, type ShownGeometry } from './vertices.ts';
import { RUNTIME_DEG, type CoreWorld } from './world.ts';
import { fillingSkins } from './skins.ts';
import type { SliderApplication } from './constraints_slider.ts';

/** One bone, posed: the world transform and the runtime getters' four readings (the header's `bones`). */
export interface RawBone {
  name: string;
  parent: string | null;
  active: boolean;
  a: number;
  b: number;
  c: number;
  d: number;
  worldX: number;
  worldY: number;
  rotationX: number;
  rotationY: number;
  scaleX: number;
  scaleY: number;
}

/** One region or mesh drawn, in draw order (the header's `drawn`). */
export interface RawDrawn {
  slot: string;
  attachment: string;
  kind: 'region' | 'mesh';
  vertices: number[];
  /** Frozen, and the same array on every pose of the document view (issue #1530): `REGION_UVS` for a region, `meshArraysOf` for a mesh. */
  uvs: readonly number[];
  /** Frozen and identity-stable, as `uvs` is. */
  triangles: readonly number[];
  hull: number | null;
  sequenceIndex: number;
  colour: [number, number, number, number];
}

/** One clip polygon: `[slot, attachment, end, polygon]` as doubles. */
export type RawClip = [string, string, string | null, number[]];
/** One attachment drawn under a clip: `[slot, attachment, clipped, vertices, uvs, triangles]` as the clipper returns them. */
export type RawClipped = [string, string, 0 | 1, number[], number[], number[]];
/** One event fired: `[name, time, int, float, string]`. */
export type RawEvent = [string, number, number, number, string | null];

/**
 * Where a walk's physics is reset (the header's *One step*): `animation` —
 * the animation applied at 0 and the reset taken there (`src/render.ts`'s
 * frame 0); `setup` — the reset taken at the setup pose before the animation
 * is applied (`src/deformmeasure.ts`'s `poseAt`), pose 0 then the setup pose.
 */
export type RawReset = 'animation' | 'setup';

/** One pose — the setup's, or one step of an animation's walk. */
export interface RawPose {
  /** The track time (the running sum of the steps), 0 for the setup pose. */
  trackTime: number;
  /** The time the animation was applied at: the track time held at the duration. */
  animationTime: number;
  bones: RawBone[];
  slots: CoreSlotRow[];
  drawOrder: string[];
  drawn: RawDrawn[];
  clips: RawClip[];
  clipped: RawClipped[];
  events: RawEvent[];
  // --- #968 render: begin ---
  /**
   * What each slot shows, in draw order — the records `drawn` was posed from
   * (skin, placeholder, series frame, deform). `src/render_core.ts` resolves
   * each drawn attachment's atlas region and page UVs through it, with
   * `./uvs.ts`'s `drawnRegions` (issue #967's gated rule), rather than walking
   * which record a slot shows a second time.
   */
  shown: ShownGeometry[];
  // --- #968 render: end ---
}

/**
 * One bone as the scan reads it (issue #1179, the second part): the world
 * matrix and origin `RawBone` carries, and none of the readings it forms from
 * them. `A10_NO_NAN_AFTER_STEPPING` reads these six numbers and the name off a
 * bone, and nothing else (`firstNonFinite` in `src/nonfinite.ts`).
 */
export interface ScanBone {
  name: string;
  a: number;
  b: number;
  c: number;
  d: number;
  worldX: number;
  worldY: number;
}

/**
 * One pose as the scan reads it (issue #1179, the second part) — the scan's
 * walk (`scanWalkIn`, `scanSetupIn`): the time the animation was applied at,
 * and the bones, slot rows and drawn attachments computed exactly as a
 * `RawPose`'s are. Internal to A10's walk (`./walk.ts`); no exported pose type
 * changed for it.
 */
export interface ScanPose {
  animationTime: number;
  bones: ScanBone[];
  slots: CoreSlotRow[];
  drawn: ScanDrawn[];
}

/** One region or mesh drawn, as the scan reads it: its slot, its name and its world vertices, as `RawDrawn` carries them. */
export interface ScanDrawn {
  slot: string;
  attachment: string;
  vertices: number[];
}

// --- #968 render: begin ---
/** The shown records in `order`, the pose's draw order (a pose's `shown`). */
function drawOrderOf(shown: readonly ShownGeometry[], order: readonly string[]): ShownGeometry[] {
  const rank = new Map(order.map((n, r) => [n, r]));
  return [...shown].sort((a, b) => (rank.get(a.slot) ?? 0) - (rank.get(b.slot) ?? 0));
}
// --- #968 render: end ---

/** A double the entry computed: never `null`, since a non-finite pose is refused rather than passed on. */
function finite(v: number | null, what: string): number {
  if (v === null) throw new CoreInputError(`the raw pose computed a non-finite ${what}`);
  return v;
}

/**
 * How a walk treats the two things the raw entry and the looping walk
 * (`./walk.ts`, issue #1025) read differently: whether the track loops, and
 * whether a value that is not finite is kept in the pose or refuses the call.
 * The raw entry is `{ loop: false, keep: false }`, and that is its contract.
 */
export interface WalkMode {
  loop: boolean;
  keep: boolean;
  /** A plant only (the core suite's `CO26`): the animation time a looping step applies at, from its track time, the duration and the track time before it — `loopedTime` unless given. */
  time?: (trackTime: number, duration: number, before: number) => number;
  /** What the physics clock moves by, from the step and how far the animation time moved — the step itself unless given: a plant (`CO26`), the render's offline clock passed to `poseRawAnimationEach` (issue #1380), or a live track's `clock` option (`./track.ts`, issue #1396). */
  clock?: (dt: number, moved: number) => number;
  /** A plant only (`CO26`): `false` fires no `reset` key across the wrap — the reading the walk was measured against and rejected. */
  wrapResets?: boolean;
  /**
   * The live track's looping mode (`./track.ts`, issue #1276): a looping walk
   * that fires its events across the wrap and cuts its clipped rows, as the
   * raw entry does. Absent on A10's looping walk (`./walk.ts`), which does
   * neither — its one reader reads no event and no clipped row.
   */
  live?: boolean;
}

/** The raw entry's mode: a track that holds at its duration, and a non-finite value refused. */
const RAW_MODE: WalkMode = { loop: false, keep: false };

/** What a kept walk writes a number as: the double itself, finite or not — so a NaN and an Infinity stay what they are. */
const keptNumber = (v: number): number => v;

/** The plant a walk in `mode` poses with: the raw entry's unrounded double, or under `keep` the number whatever it is. */
const roundPlant = (mode: WalkMode): CorePlant => ({ round: mode.keep ? keptNumber : rawNumber });

/** A double a kept walk computed, as it is; a raw walk's, refused when it is not finite (`finite`). */
function numberOf(v: number | null, what: string, mode: WalkMode): number {
  return mode.keep ? (v === null ? Number.NaN : v) : finite(v, what);
}

/**
 * What the looping walk cuts a drawn attachment through under a clip: nothing
 * (issue #1179). Its one reader, A10, reads no clipped row — `./walk.ts`
 * narrows them away with the events — so the walk does not cut them; what it
 * still does is plan every clip it starts (`poseClipped`'s `clipShapeOf`), so
 * a clip the core does not draw refuses the walk by name as before. Every
 * number a looping pose carries is computed as it was.
 */
const NO_CLIPPED_ROWS: ShapeClipper = () => null;

/** The bones of a pose from the world transforms (the header's `bones`). */
function rawBones(doc: CompiledDocument, world: ReadonlyMap<string, CoreWorld>): RawBone[] {
  const active = activeBones(doc);
  return doc.bones.map((b): RawBone => {
    const w = world.get(b.name);
    if (w === undefined) throw new CoreInputError(`bone "${b.name}" has no world transform`);
    return {
      name: b.name,
      parent: b.parent ?? null,
      active: active.has(b.name),
      a: w.a,
      b: w.b,
      c: w.c,
      d: w.d,
      worldX: w.worldX,
      worldY: w.worldY,
      rotationX: Math.atan2(w.c, w.a) * RUNTIME_DEG,
      rotationY: Math.atan2(w.d, w.b) * RUNTIME_DEG,
      scaleX: Math.sqrt(w.a * w.a + w.c * w.c),
      scaleY: Math.sqrt(w.b * w.b + w.d * w.d),
    };
  });
}

/**
 * The bones of a scan pose (`ScanBone`): `rawBones` less the parent, the
 * active flag and the four getter readings, which nothing the scan reads is
 * computed from — each reading is formed from the world after it is posed,
 * and the matrix and origin are copied as they are.
 */
function scanBones(doc: CompiledDocument, world: ReadonlyMap<string, CoreWorld>): ScanBone[] {
  return doc.bones.map((b): ScanBone => {
    const w = world.get(b.name);
    if (w === undefined) throw new CoreInputError(`bone "${b.name}" has no world transform`);
    return { name: b.name, a: w.a, b: w.b, c: w.c, d: w.d, worldX: w.worldX, worldY: w.worldY };
  });
}

/**
 * What a pose draws, posed and refused where the core leaves it out: the
 * attachment rows, the clip rows and the drawn clipped rows — what `rawDrawn`
 * and `scanDrawn` both assemble from.
 */
function drawnGeometry(doc: CompiledDocument, shown: readonly ShownGeometry[], world: ReadonlyMap<string, CoreWorld>, order: readonly string[], plant: CorePlant, mode: WalkMode): { rows: CoreAttachmentRow[]; clips: CoreClipRow[]; drawnClipped: CoreClippedRow[] } {
  const draw = drawWalkOf(doc, order, plant);
  const geometry = poseGeometry(shown, world, sourceOfDoc(doc), mode.keep ? keptNumber : rawNumber, { region: plant.region, vertices: plant.vertices }, mode.loop && mode.live !== true && plant.through === undefined ? { ...draw, through: NO_CLIPPED_ROWS } : draw);
  if (geometry.attachments === null) throw new CoreInputError(`the raw pose leaves the attachments out: ${geometry.attachmentsWhy}`);
  // The drawn rows (issue #964): the oracle's `clipped` rows where it is posed, and a concave or inverse clip cut through the core's own decomposition.
  if (geometry.drawnClipped === null) throw new CoreInputError(`the raw pose leaves the clipped triangles out: ${geometry.drawnClippedWhy}`);
  return { rows: geometry.attachments, clips: geometry.clips, drawnClipped: geometry.drawnClipped };
}

/**
 * The drawn attachments of a scan pose (`ScanDrawn`): `rawDrawn`'s rows, each
 * its slot, its name and its world vertices through the same `numberOf`, and
 * none of what `rawDrawn` reads past them for a renderer — the UVs and
 * triangles it copies, the record it looks up for the colour and the sequence
 * frame, the hull, the clip rows' numbers. No vertex is computed from any of
 * those. The one refusal `rawDrawn` makes past the rows, a linked mesh whose
 * source carries no mesh, is not reachable here: `poseGeometry` resolved the
 * same source by the same lookup (`sourceOfDoc`) and throws before it returns.
 *
 * 🔁 **No copy of the vertices** (issue #1179, the second part): `rawDrawn`
 * maps each row through `numberOf` into a new array; under `keep` that map is
 * the identity on every number and turns only a `null` into NaN. The scan
 * hands the row's own array on wherever it holds no `null` (`allNumbers`) and
 * maps it as before where it does, so A10 reads the same values either way.
 * What makes the row's array safe to keep past the step — A10 collects an
 * animation's 120 frames before it scans one — is that it is the pose's own:
 * `poseGeometry` (`./vertices.ts`) hands every row the corners or the skinned
 * vertices the poser just computed, a new array per attachment per pose, or a
 * rounded copy of it (`roundedRow`, issue #1530), held by nothing but the row.
 * The core suite's `CO45` plants a scan that hands every pose the same array
 * and `CO59` a poser that does, and both read the retained frames red.
 */
function scanDrawn(doc: CompiledDocument, shown: readonly ShownGeometry[], world: ReadonlyMap<string, CoreWorld>, order: readonly string[], plant: CorePlant, mode: WalkMode, scanPlant: ScanPlant = {}): ScanDrawn[] {
  const { rows } = drawnGeometry(doc, shown, world, order, plant, mode);
  const drawn: ScanDrawn[] = [];
  let k = 0;
  for (const s of shown) {
    const g = s.geometry;
    if (g.kind !== 'region' && g.kind !== 'mesh' && g.kind !== 'linkedmesh') continue;
    const row = rows[k++];
    if (row === undefined || row[0] !== s.slot) throw new CoreInputError(`slot "${s.slot}": the attachment rows are not in the shown records' order`);
    const vertices = row[3];
    const kept = mode.keep && allNumbers(vertices) ? vertices : vertices.map((v) => numberOf(v, `vertex of slot "${s.slot}"`, mode));
    drawn.push({ slot: s.slot, attachment: row[1], vertices: scanPlant.vertices === undefined ? kept : scanPlant.vertices(kept, s.slot) });
  }
  return drawn;
}

/**
 * A row's numbers as the pose hands them on (issue #1530): the row's own
 * array wherever it holds no `null` — `numberOf` is then the identity on
 * every one of them, under either mode — and mapped through `numberOf` as
 * before where it does, so a raw walk refuses the same value by the same
 * name and a kept one turns it into NaN. The row's array is the pose's own:
 * `poseGeometry` (`./vertices.ts`, `roundedRow`) hands each row the array
 * the poser just built or a fresh rounded copy of it, and `poseClipped` maps
 * every clipped row into a new array; nothing else holds one, so a frame a
 * consumer keeps is not written by the next pose. The core suite's
 * retained-frame control plants a poser that keeps one buffer per slot and
 * reads the kept frames red.
 */
function numbersOf(values: Array<number | null>, what: string, mode: WalkMode): number[] {
  return allNumbers(values) ? values : values.map((v) => numberOf(v, what, mode));
}

/** Whether a row's vertices hold no `null` — what `numberOf` would map — so the row's own array can be handed on as numbers. */
function allNumbers(values: Array<number | null>): values is number[] {
  for (const v of values) if (v === null) return false;
  return true;
}

/**
 * The scan's one plant (the core suite's `CO45`): what a drawn row's vertices
 * are handed on as, given the array the scan would hand on. A poser that
 * reuses one buffer per slot across steps is the plant `CO45` passes.
 * Nothing but a control passes one.
 */
export interface ScanPlant {
  vertices?: (vertices: number[], slot: string) => number[];
}

/** Every region and mesh the shown records draw, with what the renderer reads past the vertices (the header's `drawn`). */
function rawDrawn(doc: CompiledDocument, shown: readonly ShownGeometry[], world: ReadonlyMap<string, CoreWorld>, order: readonly string[], plant: CorePlant, mode: WalkMode = RAW_MODE): { drawn: RawDrawn[]; clips: RawClip[]; clipped: RawClipped[] } {
  const geometry = drawnGeometry(doc, shown, world, order, plant, mode);
  // Under a concave or inverse clip the oracle's `clipped` block is absent (the runtime's own triangle list); what the core draws is `drawnClipped`,
  // its own decomposition, and the render samples each drawn triangle at its source triangle's affine UV, so the pixels are the decomposition's
  // coverage alone (issue #964, `Mesh.source` in src/render.ts).
  const rows = geometry.rows;
  const drawn: RawDrawn[] = [];
  let k = 0;
  for (const s of shown) {
    const g = s.geometry;
    if (g.kind !== 'region' && g.kind !== 'mesh' && g.kind !== 'linkedmesh') continue;
    const row = rows[k++];
    if (row === undefined || row[0] !== s.slot) throw new CoreInputError(`slot "${s.slot}": the attachment rows are not in the shown records' order`);
    const record = doc.skins.find((x) => x.name === s.skin)?.attachments[s.slot]?.[s.placeholder];
    const colour = record?.color === undefined ? ([1, 1, 1, 1] as [number, number, number, number]) : readColour(record.color);
    let uvs: readonly number[];
    let triangles: readonly number[];
    let hull: number | null = null;
    if (g.kind === 'region') {
      uvs = REGION_UVS;
      triangles = REGION_TRIANGLES;
    } else {
      const source = g.kind === 'mesh' ? g : doc.skins.find((x) => x.name === g.skin)?.attachments[g.slot]?.[g.source]?.geometry;
      if (source === undefined || source.kind !== 'mesh') throw new CoreInputError(`slot "${s.slot}": the linked mesh's source carries no mesh`);
      ({ uvs, triangles } = (plant.meshArrays ?? meshArraysOf)(source));
      hull = source.hull ?? null;
    }
    const sequenceIndex = s.frame ?? record?.sequenceSetup ?? 0;
    drawn.push({ slot: s.slot, attachment: row[1], kind: row[2], vertices: numbersOf(row[3], `vertex of slot "${s.slot}"`, mode), uvs, triangles, hull, sequenceIndex, colour });
  }
  const clips = geometry.clips.map((c): RawClip => [c[0], c[1], c[2], numbersOf(c[3], `clip vertex of slot "${c[0]}"`, mode)]);
  const clipped = geometry.drawnClipped.map((c): RawClipped => [c[0], c[1], c[2], numbersOf(c[3], `clipped vertex of slot "${c[0]}"`, mode), numbersOf(c[4], `clipped uv of slot "${c[0]}"`, mode), c[5]]);
  return { drawn, clips, clipped };
}

/**
 * The setup pose as the renderer poses a skeleton with no animation — the
 * setup pose, every physics state reset — in full doubles. Refused by name
 * where the core leaves a block of it out.
 */
export function poseRawSetup(doc: CompiledDocument, plant: CorePlant = {}): RawPose {
  return setupPoseIn(doc, plant, RAW_MODE);
}

/** A table key to read, with an optional skin-view override; omitted skin keeps the supplied view. */
export interface SetupMeshTarget {
  readonly slot: string;
  readonly attachment: string;
  /** A named skin (with default fallback), `all`, or `null` for no skin set. */
  readonly skin?: string | null;
}

/** A detached named mesh in setup world units, y up; hull counts vertices, not coordinates. */
export interface SetupMesh {
  slot: string;
  /** The requested attachment table key, even when the record states another display name. */
  attachment: string;
  /** The skin whose table supplied the requested record, including a fallback. */
  skin: string;
  vertices: number[];
  triangles: number[];
  hull: number | null;
}

/** Model definitions by value: object key order is irrelevant, array positions and signed zero are not. */
function sameSetupMeshDefinition(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b) && a.length !== b.length) return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) =>
    Object.prototype.hasOwnProperty.call(right, key) && sameSetupMeshDefinition(left[key], right[key]));
}

/**
 * Read a named mesh without changing the setup selection or playing anything
 * (issue #1538). Setup constraints and reset physics use the raw poser's own
 * path. A selected mesh includes its setup-slider deform; an unselected mesh
 * reads its stored geometry through those same matrices, with no hypothetical
 * attachment switch or deform. Linked meshes use their source topology and
 * bindings, and the queried slot's bone for unweighted vertices; `timelines`
 * affects only a selected mesh's setup-slider deform, as in `poseRawSetup`.
 *
 * Skin resolution is the supplied view's unless explicitly overridden. Under
 * `all`, differing definitions of the requested mesh are refused: the model
 * does not carry the file order that would choose one. Object property order
 * does not distinguish definitions; array positions and Object.is leaf values
 * do. Identical definitions keep the resolver's first supplying skin. All arrays are fresh.
 */
export function readSetupMesh(doc: CompiledDocument, target: SetupMeshTarget): SetupMesh {
  const view = target.skin === undefined ? doc : target.skin === null ? underNoSkin(doc) : underSkin(doc, target.skin);
  const where = `setup mesh slot ${JSON.stringify(target.slot)} attachment ${JSON.stringify(target.attachment)} under skin ${JSON.stringify(view.skin)}`;
  const slot = view.slots.find((s) => s.name === target.slot);
  if (slot === undefined) throw new CoreInputError(`${where}: no such slot`);
  const resolved = shownAttachment(view, slot, target.attachment);
  if (resolved === null) throw new CoreInputError(`${where}: no such attachment`);
  const fills = fillingSkins(view, slot.name, target.attachment);
  const definitions = fills.map((name) => view.skins.find((k) => k.name === name)?.attachments[slot.name]?.[target.attachment]);
  if ('conflict' in resolved || definitions.some((r) => !sameSetupMeshDefinition(r, definitions[0]))) {
    throw new CoreInputError(`${where}: skins [${fills.join(', ')}] fill this attachment differently; choose a named skin`);
  }
  const geometry = resolved.record.geometry;
  const mesh = geometry?.kind === 'linkedmesh'
    ? view.skins.find((s) => s.name === geometry.skin)?.attachments[geometry.slot]?.[geometry.source]?.geometry
    : geometry;
  if (mesh?.kind !== 'mesh') throw new CoreInputError(`${where}: ${resolved.record.kind} is not a mesh`);
  const { world, shown, drawOrder } = setupPosed(view, {}, RAW_MODE);
  const selected = shown.find((s) => s.slot === slot.name && s.placeholder === target.attachment && s.skin === resolved.skin);
  const bone = world.get(slot.bone);
  if (bone === undefined) throw new CoreInputError(`${where}: no setup transform for bone ${JSON.stringify(slot.bone)}`);
  const vertices = selected === undefined
    ? numbersOf(worldVertices(mesh.vertices, bone, world).map(rawNumber), `${where} vertex`, RAW_MODE)
    : rawDrawn(view, [selected], world, drawOrder, {}).drawn[0].vertices;
  return { slot: slot.name, attachment: target.attachment, skin: resolved.skin, vertices: [...vertices], triangles: [...mesh.triangles], hull: mesh.hull ?? null };
}

/** `poseRawSetup` in `mode` — under `keep`, a value that is not finite stays in the pose (`./walk.ts`). */
export function setupPoseIn(doc: CompiledDocument, plant: CorePlant, mode: WalkMode): RawPose {
  const { world, shown, slots, drawOrder } = setupPosed(doc, plant, mode);
  const drawn = rawDrawn(doc, shown, world, drawOrder, plant, mode);
  return { trackTime: 0, animationTime: 0, bones: rawBones(doc, world), slots, drawOrder, ...drawn, events: [], shown: drawOrderOf(shown, drawOrder) };
}

/** `setupPoseIn` as the scan reads it (`ScanPose`): the same setup pose, the same refusals in the same order, assembled into the scan's pose. */
export function scanSetupIn(doc: CompiledDocument, plant: CorePlant, mode: WalkMode, scanPlant: ScanPlant = {}): ScanPose {
  const { world, shown, slots, drawOrder } = setupPosed(doc, plant, mode);
  const drawn = scanDrawn(doc, shown, world, drawOrder, plant, mode, scanPlant);
  return { animationTime: 0, bones: scanBones(doc, world), slots, drawn };
}

/** The setup pose `setupPoseIn` and `scanSetupIn` assemble, refused by name where the core leaves a block of it out. */
function setupPosed(doc: CompiledDocument, plant: CorePlant, mode: WalkMode): { world: Map<string, CoreWorld>; shown: ShownGeometry[]; slots: CoreSlotRow[]; drawOrder: string[] } {
  const posed = poseSetup(doc, { ...plant, ...roundPlant(mode) }, freshStepContext(plant.physicsStep));
  // `setup.clipped` is the oracle's block, left out under a concave or inverse clip whose triangle list is the runtime's own; what the core draws there is `rawDrawn`'s to refuse or pose (issue #964).
  const absent = posed.absent.filter(([block]) => block !== 'setup.clipped');
  if (absent.length > 0) throw new CoreInputError(`the raw setup pose leaves ${absent.map(([b, why]) => `${b} out (${why})`).join('; ')}`);
  const { setup, world, shown } = posed;
  if (world === null || shown === null || setup.slots === null || setup.drawOrder === null) throw new CoreInputError('the raw setup pose was not posed');
  return { world, shown, slots: setup.slots, drawOrder: setup.drawOrder };
}

/**
 * One animation walked at the caller's steps (the header's *One step*): the
 * reset pose at 0, then one pose per step of `steps` — `steps.length + 1`
 * poses in all. `src/render.ts`'s walk is `count` steps of `1/fps`;
 * `src/deformmeasure.ts`'s is one step of `time`. A step must be a finite
 * time at or above 0; the animation must be the document's; a construct the
 * core would leave out refuses the call by name. `reset` is where the
 * physics is reset (`RawReset`): `animation` for render's walk, `setup` for
 * deformmeasure's one jump.
 */
export function poseRawAnimation(doc: CompiledDocument, animation: string, steps: readonly number[], plant: TimelinePlant = {}, reset: RawReset = 'animation'): RawPose[] {
  return walkIn(doc, animation, steps, plant, reset, RAW_MODE);
}

/**
 * `poseRawAnimation`, each pose handed to `visit` as it is posed rather than
 * collected (issue #1180): the same walk, the same poses in the same order,
 * and the caller holds as many of them as it keeps. `src/render_core.ts`
 * draws each and lets it go, so a render holds one pose and not an
 * animation's series — on the production rig the core poser's render peaked
 * highest on, the largest animation's series was 153 MiB of retained heap.
 * A refusal is thrown from the pose it is met at, after `visit` has seen the
 * poses before it. `clock`, when given, is what each step moves the physics
 * clock by in place of the step itself — the render's offline schedule
 * (`physicsClockStep` below, issue #1380); the track time and
 * the animation time are the steps' running sum either way.
 */
export function poseRawAnimationEach(doc: CompiledDocument, animation: string, steps: readonly number[], plant: TimelinePlant, reset: RawReset, visit: (pose: RawPose, index: number) => void, clock?: (dt: number) => number, environment?: StepEnvironment): void {
  walkEach(doc, animation, steps, plant, reset, clock === undefined ? RAW_MODE : { ...RAW_MODE, clock: (dt) => clock(dt) }, RAW_SHAPE, visit, environment);
}

/**
 * What a batch walk sets on its physics before a pose (issue #1416, part C):
 * pose `index`'s change to the world every physics constraint answers — either
 * half, merged over the one standing as a live track's `setEnvironment` merges
 * it (`setEnvironmentOn`) — or `undefined` for none. Pose 0 is the reset pose;
 * pose `k + 1` is the one step `k` makes. `rigc render --environment` is the
 * caller (`src/render_core.ts`), and spine-core's poser sets the same values on
 * its `Skeleton` before the same update (`src/render.ts`), so the two posers
 * see one world at every step.
 */
export type StepEnvironment = (index: number) => Partial<PhysicsEnvironment> | undefined;

/** `environment`'s change for pose `index`, set on `ctx` as a live track sets one — validated and merged by `setEnvironmentOn`. */
function setStepEnvironment(ctx: PhysicsStepContext, environment: StepEnvironment | undefined, index: number): void {
  const change = environment?.(index);
  if (change !== undefined) setEnvironmentOn(ctx, change, `the walk's, at pose ${index},`);
}

/**
 * How much faster than the frames a render's physics clock runs — and, since issue
 * #1389, a mesh comparison's (`src/meshcompare.ts`, `comparisonWalk`): each frame
 * moves the skeleton's clock — the time a physics constraint integrates — by
 * `physicsClockStep(1 / fps)`, the frame's step and `2⁻³⁰` of it more, while
 * the animation is applied at the running sum of the frame steps as before
 * (issue #1380).
 *
 * ⭐ **Why a render's physics clock is not the frame clock.** A physics
 * constraint keeps the time it has not yet integrated (`remaining`), takes
 * whole steps of `1 / fps` (its own `fps`, 60 by default) while at least one
 * step remains, and shows `offset − lag·(1 − remaining / step)`, `lag` being
 * everything this update's steps moved (`src/core/constraints_physics.ts`,
 * *The step*). Whenever a frame lasts a whole number of physics steps — 12,
 * 20, 30 and 60 fps against 60 Hz, and every second frame at 24 — the time
 * left at the frame's end is zero in exact arithmetic, and in doubles it is
 * either a few ulps above zero or a few ulps short of one whole step. Which of
 * the two is decided by rounding, not by the motion: the shown weight is 1 or
 * 0, so the spring is drawn one frame late or on time, and it changes regime
 * on a single frame. Measured on the public trailer (`show`, 20 fps, 321
 * frames): every spring jumps at frames 5, 12, 45 and 188 — the four frames
 * that arithmetic alone predicts — and the loop's start (frame 80, on time)
 * and end (frame 320, a frame late, which is what exact arithmetic draws)
 * differ by 31.70 units of vertex and 10.37 of bone
 * while every keyed bone agrees to 1.3e-12. spine-core 4.3.13 stepped the
 * same way draws the same frames to the bit: this is the runtime under a
 * fixed offline step, not a defect of the core's port, which is why the fix
 * is the render's schedule and the physics is untouched.
 *
 * Running the clock `2⁻³⁰` fast puts the time left a little ABOVE every
 * whole number of steps instead of on it, by `2⁻³⁰ · t` after `t` seconds:
 * 1.5e-8 s at 16 s, against a rounding error of at most a few ulps of the
 * clock (3.6e-15 s at 16 s) — so every tie resolves the way exact arithmetic
 * resolves it, a step taken, and the shown weight sits at 1 − 9e-7 rather
 * than flipping. It stays below the smallest gap a step boundary can fall
 * into for 7.8e5 s even at 23 fps against 60 Hz (a gap of 1/1380 s), and a
 * physics `reset` key, which restarts the time left from zero, is resolved
 * the same way on every frame after it, because the lead is taken on every
 * frame rather than once (read off the clock arithmetic with a reset at frame
 * 100, 16 s at the five rates: no tie; no tree probe keys a reset under the
 * render's clock). A pose stays a function of its frame
 * index alone: the lead does not depend on how many frames are asked for.
 *
 * Rejected, measured over the same arithmetic (16 s at 12, 20, 24, 25, 30 and
 * 60 fps): the clock as `i / fps` rather than a running sum (90 frames still
 * flipped at 20 fps); a one-time lead of half a step (114 flipped at 24 fps,
 * where half a step lands on the other tie); a one-time lead of any size,
 * which a `reset` key cancels; and snapping `remaining` inside the physics,
 * which changes the runtime's physics rather than the render's schedule and
 * which spine-core's poser could not follow.
 */
export const PHYSICS_CLOCK_LEAD = 2 ** -30;

/** What one frame of `step` seconds moves a render's physics clock by — `PHYSICS_CLOCK_LEAD`; both render posers and the mesh comparison step with it. */
export function physicsClockStep(step: number): number {
  return step + step * PHYSICS_CLOCK_LEAD;
}

/**
 * A live track's `clock` option (issue #1396, `./track.ts` and `./tracks.ts`):
 * the caller's function, called with each step, its answer checked before the
 * skeleton's clock moves by it — a finite time at or above 0, or the step
 * refused by name, as a step itself is. `who` names the track in the refusal.
 */
export function checkedClock(clock: (dt: number) => number, who: string): (dt: number) => number {
  return (dt) => {
    const moved = clock(dt);
    if (typeof moved !== 'number' || !Number.isFinite(moved) || moved < 0) throw new CoreInputError(`${who} clock moved the physics by ${String(moved)} for a step of ${dt}, not a finite time at or above 0`);
    return moved;
  };
}

/**
 * A live track's `setEnvironment` (issue #1416, `./track.ts` and `./tracks.ts`):
 * the world every physics constraint answers from the next pose on, set on the
 * track's physics context — `wind` and `gravity` each a pair of finite numbers,
 * either left out to keep the one that stands, and nothing else — or refused by
 * name, before anything moves. The pair is copied: the caller's array changed
 * later moves nothing.
 */
export function setEnvironmentOn(ctx: PhysicsStepContext, env: unknown, who: string): void {
  if (typeof env !== 'object' || env === null || Array.isArray(env)) throw new CoreInputError(`${who} setEnvironment was given ${env === null ? 'null' : Array.isArray(env) ? 'an array' : typeof env}, not an object { wind?: [x, y], gravity?: [x, y] }`);
  const given = env as Record<string, unknown>;
  for (const key of Object.keys(given)) {
    if (key !== 'wind' && key !== 'gravity') throw new CoreInputError(`${who} setEnvironment names "${key}", which is not one of [wind, gravity]`);
  }
  const pair = (key: 'wind' | 'gravity'): readonly [number, number] | undefined => {
    const v = given[key];
    if (v === undefined) return undefined;
    if (!Array.isArray(v) || v.length !== 2 || v.some((n) => typeof n !== 'number' || !Number.isFinite(n))) throw new CoreInputError(`${who} setEnvironment's ${key} is ${JSON.stringify(v)}, not a pair of finite numbers [x, y] (x to the right, y down)`);
    return Object.freeze([v[0] as number, v[1] as number] as const);
  };
  const wind = pair('wind');
  const gravity = pair('gravity');
  const standing = ctx.env ?? DEFAULT_PHYSICS_ENVIRONMENT;
  ctx.env = Object.freeze({ wind: wind ?? standing.wind, gravity: gravity ?? standing.gravity });
}

/** The environment a live track's physics answers now (`setEnvironmentOn`): spine-core's initial one where none was set. */
export function environmentOf(ctx: PhysicsStepContext): PhysicsEnvironment {
  return ctx.env ?? DEFAULT_PHYSICS_ENVIRONMENT;
}

/** A live track's `physicsTranslate` (issue #1416): `x` and `y` finite, or refused by name before anything moves; then `translatePhysics`. */
export function translateOn(ctx: PhysicsStepContext, x: number, y: number, who: string): void {
  for (const [k, v] of [['x', x], ['y', y]] as const) {
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new CoreInputError(`${who} physicsTranslate's ${k} is ${String(v)}, not a finite distance in the skeleton's world`);
  }
  translatePhysics(ctx, x, y);
}

/** A live track's `physicsRotate` (issue #1416): `x`, `y` and `degrees` finite, or refused by name before anything moves; then `rotatePhysics`. */
export function rotateOn(ctx: PhysicsStepContext, x: number, y: number, degrees: number, who: string): void {
  for (const [k, v] of [['x', x], ['y', y], ['degrees', degrees]] as const) {
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new CoreInputError(`${who} physicsRotate's ${k} is ${String(v)}, not a finite number`);
  }
  rotatePhysics(ctx, x, y, degrees);
}

/**
 * The animation time a looping track applies its animation at (`./walk.ts`,
 * *The time*): the track time wrapped by the duration, and 0 over a duration
 * of 0.
 */
export function loopedTime(trackTime: number, duration: number): number {
  return duration === 0 ? 0 : trackTime % duration;
}

/**
 * `poseRawAnimation` in `mode`: the raw entry's walk, or the looping walk
 * `./walk.ts` documents — the animation time the track time wrapped by the
 * duration, every value kept whatever it is. Each difference is a branch on
 * `mode` here, so the raw entry's walk is the one it was.
 */
export function walkIn(doc: CompiledDocument, animation: string, steps: readonly number[], plant: TimelinePlant, reset: RawReset, mode: WalkMode): RawPose[] {
  const poses: RawPose[] = [];
  walkEach(doc, animation, steps, plant, reset, mode, RAW_SHAPE, (pose) => poses.push(pose));
  return poses;
}

/**
 * `walkIn` as the scan reads it (`ScanPose`, issue #1179, the second part):
 * the same walk — every pose posed by the same operations in the same order,
 * every refusal at the same place — each pose assembled into what A10 reads.
 * `./walk.ts`'s `scanLoopingWalk` is its one caller.
 */
export function scanWalkIn(doc: CompiledDocument, animation: string, steps: readonly number[], plant: TimelinePlant, reset: RawReset, mode: WalkMode, scanPlant: ScanPlant = {}): ScanPose[] {
  const poses: ScanPose[] = [];
  walkEach(doc, animation, steps, plant, reset, mode, scanPlant.vertices === undefined ? SCAN_SHAPE : scanShape(scanPlant), (pose) => poses.push(pose));
  return poses;
}

/** What one step of a walk posed, before a pose is assembled from it (`PoseShape`). */
interface WalkStep {
  trackTime: number;
  animationTime: number;
  world: Map<string, CoreWorld>;
  slots: CoreSlotRow[];
  drawOrder: string[];
  shown: ShownGeometry[];
  /** The events the step fired, computed when called — after the drawn rows, as the raw entry has always ordered its refusals. */
  events: () => RawEvent[];
}

/**
 * What a walk assembles each pose into (issue #1179, the second part): the raw
 * entry's whole pose (`RAW_SHAPE`), or the scan's (`SCAN_SHAPE`). The walk
 * (`walkEach`) is one body: every number a pose carries is computed there and
 * in the two assemblers below, by the same calls, whatever the shape. A shape
 * chooses only what is assembled from what was posed — the scan drops the
 * readings, rows and copies nothing it reads is computed from — and keeps the
 * order of every call that can refuse.
 */
interface PoseShape<P> {
  /** Whether a step forms the oracle's bone rows beside its world (`posedBoneWorld`), which no walk pose carries; `false` poses the world alone (`posedBoneWorldAlone`). */
  rows: boolean;
  /** The reset pose at the setup (`reset: 'setup'`). */
  setup: (doc: CompiledDocument, world: Map<string, CoreWorld>, slots: CoreSlotRow[], drawOrder: string[], shown: ShownGeometry[], plant: CorePlant, mode: WalkMode) => P;
  /** One step's pose. */
  step: (doc: CompiledDocument, posed: WalkStep, plant: CorePlant, mode: WalkMode) => P;
}

/** The raw entry's pose, assembled as it always was: at the reset the bones, then the drawn rows; at a step the drawn rows, the events, then the bones. */
const RAW_SHAPE: PoseShape<RawPose> = {
  rows: true,
  setup: (doc, world, slots, drawOrder, shown, plant, mode) => ({ trackTime: 0, animationTime: 0, bones: rawBones(doc, world), slots, drawOrder, ...rawDrawn(doc, shown, world, drawOrder, plant, mode), events: [], shown: drawOrderOf(shown, drawOrder) }),
  step: (doc, p, plant, mode) => {
    const drawn = rawDrawn(doc, p.shown, p.world, p.drawOrder, plant, mode);
    const events = p.events();
    return { trackTime: p.trackTime, animationTime: p.animationTime, bones: rawBones(doc, p.world), slots: p.slots, drawOrder: p.drawOrder, ...drawn, events, shown: p.shown };
  },
};

/** The scan's pose (`ScanPose`), in the raw shape's order: the scan's walk is a looping one, which fires no event. */
function scanShape(scanPlant: ScanPlant): PoseShape<ScanPose> {
  return {
    rows: false,
    setup: (doc, world, slots, drawOrder, shown, plant, mode) => {
      const bones = scanBones(doc, world);
      return { animationTime: 0, bones, slots, drawn: scanDrawn(doc, shown, world, drawOrder, plant, mode, scanPlant) };
    },
    step: (doc, p, plant, mode) => {
      const drawn = scanDrawn(doc, p.shown, p.world, p.drawOrder, plant, mode, scanPlant);
      return { animationTime: p.animationTime, bones: scanBones(doc, p.world), slots: p.slots, drawn };
    },
  };
}
const SCAN_SHAPE: PoseShape<ScanPose> = scanShape({});

/**
 * A walk between two of its steps (issue #1276): everything `walkEach` carries
 * from one step to the next, held in one object, so the walk can be stepped one
 * `dt` at a time (`openTrack` in `./track.ts`) as well as over a list. That is
 * the physics context (`ctx`: the skeleton's clock, the phase, each physics
 * constraint's state, the animation time a `reset` key is crossed from, whether
 * the track loops), the running track time, the animation time of the step
 * before (−1 before the first) and what the walk was opened with. Nothing else
 * survives a step: every pose is posed from the setup pose at its time.
 */
export interface TrackState<P> {
  readonly doc: CompiledDocument;
  readonly anim: CompiledDocument['animations'][number];
  /** The runtime's duration (`CoreAnimationTimelines.duration`). */
  readonly duration: number;
  readonly mode: WalkMode;
  readonly plant: TimelinePlant;
  /** `plant` with the mode's rounding (`roundPlant`). */
  readonly raw: TimelinePlant;
  readonly resolve: NonNullable<TimelinePlant['shown']>;
  readonly shape: PoseShape<P>;
  readonly ctx: ReturnType<typeof freshStepContext>;
  /** The caller's adjustment of each step's locals (`LocalAdjust` in `./animation.ts`): the live track's `adjust`, absent on every batch walk. */
  readonly adjust?: LocalAdjust;
  /** The running sum of the steps taken. */
  trackTime: number;
  /** The animation time of the step before, −1 before the first. */
  last: number;
}

/** The document's animation named `animation`, or the walk refused naming the document's animations. */
function animationOf(doc: CompiledDocument, animation: string): CompiledDocument['animations'][number] {
  const anim = doc.animations.find((a) => a.name === animation);
  if (anim === undefined) throw new CoreInputError(`animation "${animation}" is not one of this document's [${doc.animations.map((a) => a.name).join(', ')}]`);
  return anim;
}

/**
 * A walk opened (issue #1276): the refusals a walk makes before its first pose,
 * then pose 0 — the reset — and the state the walk steps on from. Under
 * `reset: 'setup'` pose 0 is the setup pose, reset; under `animation` it is the
 * animation applied at 0 and reset there, a step of 0 (`stepWalk`'s `first`).
 */
function openWalk<P>(doc: CompiledDocument, anim: CompiledDocument['animations'][number], plant: TimelinePlant, reset: RawReset, mode: WalkMode, shape: PoseShape<P>, adjust?: LocalAdjust, before?: (ctx: PhysicsStepContext) => void): { track: TrackState<P>; first: P } {
  const why = constraintsAbsentWhy(doc) ?? pathAnimationsWhy(doc) ?? steppedPreviousPassWhy(doc);
  if (why !== null) throw new CoreInputError(`the raw walk leaves the bones out: ${why}`);
  const ctx = freshStepContext(plant.physicsStep);
  // What the caller sets before pose 0 (issue #1416, part C): the batch walk's environment for the reset pose.
  before?.(ctx);
  if (mode.loop && mode.wrapResets !== false) ctx.loop = true;
  const track: TrackState<P> = { doc, anim, duration: anim.timelines.duration, mode, plant, raw: { ...plant, ...roundPlant(mode) }, resolve: plant.shown ?? shownAttachment, shape, ctx, adjust, trackTime: 0, last: -1 };
  if (reset === 'setup') {
    // The reset taken at the setup pose, before the animation is applied (`src/deformmeasure.ts`'s `poseAt`): pose 0 is the setup pose.
    const setup = poseSetup(doc, { ...plant, ...roundPlant(mode) }, ctx);
    const absent = setup.absent.filter(([block]) => block !== 'setup.clipped');
    if (absent.length > 0) throw new CoreInputError(`the raw walk's reset pose leaves ${absent.map(([b, w]) => `${b} out (${w})`).join('; ')}`);
    if (setup.world === null || setup.shown === null || setup.setup.slots === null || setup.setup.drawOrder === null) throw new CoreInputError('the raw walk\'s reset pose was not posed');
    ctx.phase = 'update';
    return { track, first: shape.setup(doc, setup.world, setup.setup.slots, setup.setup.drawOrder, setup.shown, plant, mode) };
  }
  return { track, first: stepWalk(track, 0, true) };
}

/**
 * One step of a walk (the header's *One step*): the track time moved by `dt`,
 * the animation applied at the mode's time from the setup pose, the physics
 * clock moved by the step, and the pose assembled in the track's shape.
 * `first` is the reset pose under `reset: 'animation'` — a step of 0 that
 * resets the physics there — and nothing else passes it.
 */
function stepWalk<P>(track: TrackState<P>, dt: number, first = false): P {
  const { doc, anim, duration, mode, plant, raw, resolve, shape, ctx, adjust } = track;
  track.trackTime += dt;
  const trackTime = track.trackTime;
  const last = track.last;
  const t = mode.loop ? (mode.time ?? loopedTime)(trackTime, duration, trackTime - dt) : trackTime < duration ? trackTime : duration;
  const before = ctx.time;
  ctx.time += mode.clock === undefined ? dt : mode.clock(dt, t - (first ? 0 : Math.max(last, 0)));
  // A10's looping walk fires no event here — its one reader reads none — nor cuts its drawn attachments through a clip (`NO_CLIPPED_ROWS`), so its
  // `clipped` rows are empty. The live track's looping mode (`live`) fires its events across the wrap by the rule `./track.ts` states as measured.
  const fire = plant.events ?? eventsFired;
  const keys = anim.timelines.events;
  const adjustment = adjust === undefined ? undefined : { callback: adjust, context: { trackTime, animation: anim.name, globalTime: trackTime } };
  const pose = poseStepFrom(doc, plant, resolve, shape, mode, ctx, first, trackTime, t, {
    world: (sliders) => (shape.rows ? posedBoneWorld(doc, anim.timelines, t, raw, anim.constraints, sliders, { ctx, before, adjustment }).world : posedBoneWorldAlone(doc, anim.timelines, t, raw, anim.constraints, sliders, { ctx, before, adjustment })),
    slots: (sliders, placeholders) => posedSlots(doc, anim.timelines, t, raw, sliders, placeholders),
    drawOrder: anim.timelines.drawOrder,
    at: t,
    sample: { timelines: anim.timelines, t },
    events: () => (mode.loop && mode.live !== true ? [] : mode.loop ? fire(keys, last, t, rawNumber, t < last) : fire(keys, last, t, rawNumber)),
  });
  track.last = t;
  return pose;
}

/**
 * What decides one step's pose before it is assembled (issue #1336): the bone
 * world through the stepped phase, filling the sliders it applied; the slot
 * rows, filling the placeholders the timelines left; the draw-order keys and
 * the time they are read at; the deform and sequence timelines' sample, or the
 * mixed deforms in its place; the events, computed when called. A walk's step
 * reads every one off one animation at its time (`stepWalk`); the live tracks
 * off their mixed entries (`./tracks.ts`). Everything past these is one body,
 * `poseStepFrom`.
 */
export interface StepPosers {
  world: (sliders: SliderApplication[]) => Map<string, CoreWorld>;
  slots: (sliders: readonly SliderApplication[], placeholders: Map<string, string | null>) => { rows: CoreSlotRow[]; conflicts: string[] };
  drawOrder: readonly CoreDrawOrderKey[];
  at: number;
  sample: { timelines: CoreAnimationTimelines; t: number } | null;
  mixed?: ReadonlyMap<string, { deform: number[] | null; seen: readonly string[] }>;
  events: () => CoreEventRow[];
}

/**
 * One step's pose from what decided it (`StepPosers`): the bone world, the
 * physics phase moved past the reset on `first`, the slot rows, the draw
 * order (the keys' order, else the setup's, then each slider's key), the
 * attachments drawn in it, and the pose assembled in `shape` — refused by name
 * where the core leaves a block out, in that order. The one body a walk's step
 * and a live tracks' step share.
 */
function poseStepFrom<P>(doc: CompiledDocument, plant: TimelinePlant, resolve: NonNullable<TimelinePlant['shown']>, shape: PoseShape<P>, mode: WalkMode, ctx: ReturnType<typeof freshStepContext>, first: boolean, trackTime: number, animationTime: number, posers: StepPosers): P {
  const sliders: SliderApplication[] = [];
  const world = posers.world(sliders);
  if (first) ctx.phase = 'update';
  const placeholders = new Map<string, string | null>();
  const slots = posers.slots(sliders, placeholders);
  if (slots.conflicts.length > 0) throw new CoreInputError(`the raw walk leaves the slots out: ${slots.conflicts.join('; ')}`);
  const evalOrder = plant.drawOrder ?? drawOrderAt;
  let order = evalOrder(doc.slots.length, posers.drawOrder, posers.at) ?? doc.slots.map((_s, k) => k);
  for (const app of sliders) order = evalOrder(doc.slots.length, app.timelines.drawOrder, app.at) ?? order;
  const drawOrder = order.map((k) => doc.slots[k].name);
  const states = attachmentStates(doc, resolve, placeholders, posers.sample, sliders, plant, posers.mixed);
  if (states.why.length > 0) throw new CoreInputError(`the raw walk leaves the attachments out: ${states.why.join('; ')}`);
  const rank = new Map(drawOrder.map((n, r) => [n, r]));
  const shown = [...states.shown].sort((a, b) => (rank.get(a.slot) ?? 0) - (rank.get(b.slot) ?? 0));
  const events = (): RawEvent[] => posers.events().map((e): RawEvent => [e[0], finite(e[1], 'event time'), e[2], finite(e[3], 'event float'), e[4]]);
  return shape.step(doc, { trackTime, animationTime, world, slots: slots.rows, drawOrder, shown, events }, plant, mode);
}

/**
 * The live tracks' side of the raw pose path (issue #1336, `./tracks.ts`):
 * the refusals a walk makes before its first pose, a fresh physics context,
 * the plant with the raw entry's rounding, and the two ways a pose is made —
 * the setup pose reset (`reset: 'setup'`'s pose 0) and one step from what the
 * mixed entries decided, assembled as the raw entry's pose (`RAW_SHAPE`,
 * `RAW_MODE`: a non-finite value refused, every clipped row cut).
 */
export interface RawTracksPath {
  readonly ctx: ReturnType<typeof freshStepContext>;
  /** `plant` with the raw entry's rounding. */
  readonly raw: TimelinePlant;
  setupPose(): RawPose;
  step(first: boolean, trackTime: number, animationTime: number, posers: StepPosers): RawPose;
}

/** `RawTracksPath` opened on `doc`, refused by name where a walk on it would be (`openWalk`). */
export function openRawTracksPath(doc: CompiledDocument, plant: TimelinePlant): RawTracksPath {
  const why = constraintsAbsentWhy(doc) ?? pathAnimationsWhy(doc) ?? steppedPreviousPassWhy(doc);
  if (why !== null) throw new CoreInputError(`the raw walk leaves the bones out: ${why}`);
  const ctx = freshStepContext(plant.physicsStep);
  const raw: TimelinePlant = { ...plant, ...roundPlant(RAW_MODE) };
  const resolve = plant.shown ?? shownAttachment;
  return {
    ctx,
    raw,
    setupPose: () => {
      const setup = poseSetup(doc, raw, ctx);
      const absent = setup.absent.filter(([block]) => block !== 'setup.clipped');
      if (absent.length > 0) throw new CoreInputError(`the raw walk's reset pose leaves ${absent.map(([b, w]) => `${b} out (${w})`).join('; ')}`);
      if (setup.world === null || setup.shown === null || setup.setup.slots === null || setup.setup.drawOrder === null) throw new CoreInputError('the raw walk\'s reset pose was not posed');
      ctx.phase = 'update';
      return RAW_SHAPE.setup(doc, setup.world, setup.setup.slots, setup.setup.drawOrder, setup.shown, plant, RAW_MODE);
    },
    step: (first, trackTime, animationTime, posers) => poseStepFrom(doc, plant, resolve, RAW_SHAPE, RAW_MODE, ctx, first, trackTime, animationTime, posers),
  };
}

/** `walkIn`'s walk, each pose assembled in `shape` and handed to `visit` in order as it is posed (`poseRawAnimationEach`): the walk opened, then stepped over `steps`. */
function walkEach<P>(doc: CompiledDocument, animation: string, steps: readonly number[], plant: TimelinePlant, reset: RawReset, mode: WalkMode, shape: PoseShape<P>, visit: (pose: P, index: number) => void, environment?: StepEnvironment): void {
  const anim = animationOf(doc, animation);
  const bad = steps.findIndex((s) => !Number.isFinite(s) || s < 0);
  if (bad >= 0) throw new CoreInputError(`step ${bad} is ${steps[bad]}, not a finite time at or above 0`);
  const { track, first } = openWalk(doc, anim, plant, reset, mode, shape, undefined, environment === undefined ? undefined : (ctx) => setStepEnvironment(ctx, environment, 0));
  let visited = 0;
  visit(first, visited++);
  for (const dt of steps) {
    setStepEnvironment(track.ctx, environment, visited);
    visit(stepWalk(track, dt), visited++);
  }
}

/**
 * The raw entry's walk opened for stepping one `dt` at a time (issue #1276,
 * `openTrack` in `./track.ts`): the same refusals in the same order as
 * `walkIn`'s past the step list, pose 0 as `walkIn` poses it, and the state
 * `stepRawTrack` steps. Every pose is assembled as the raw entry's
 * (`RAW_SHAPE`).
 */
export function openRawTrack(doc: CompiledDocument, animation: string, plant: TimelinePlant, reset: RawReset, mode: WalkMode, adjust?: LocalAdjust): { track: TrackState<RawPose>; first: RawPose } {
  return openWalk(doc, animationOf(doc, animation), plant, reset, mode, RAW_SHAPE, adjust);
}

/** One step of an opened raw track (`openRawTrack`): `walkIn`'s step, the step itself checked by the caller. */
export function stepRawTrack(track: TrackState<RawPose>, dt: number): RawPose {
  return stepWalk(track, dt);
}

// --- #907 the setup-pose bounding box: begin ---
/**
 * The setup-pose bounding box (issue #907) — `setupBounds` below: the axis-aligned box around every
 * region and mesh a skeleton draws at its setup pose, as spine-core's
 * `Skeleton.getBounds(offset, size, temp)` returns it on a fresh skeleton —
 * no skin set, `updateWorldTransform(Physics.none)` — which is what the Spine
 * format says the header's `x`, `y`, `width` and `height` are.
 *
 * Every rule below was measured by running spine-core 4.3.13 through the
 * tree's own loader, not read off its source:
 *
 * - **The view is "no skin set"** (`underNoSkin`, issue #1051): a skeleton
 *   `build` writes is loaded and bounded before anyone calls `setSkin`, so
 *   the slots resolve through the default skin alone and no skin's bones or
 *   constraint lists apply.
 * - **Constraints applied.** The box is of the pose `updateWorldTransform`
 *   leaves, every ik, transform, path and slider constraint applied in the
 *   document's order — the pose `poseSetup` computes. The editor's own
 *   header is of that pose too: on `examples/spineboy/export/spineboy-pro.json`
 *   (seven ik and seven transform constraints) `getBounds` with the
 *   constraints applied is within 0.0035 of the header the editor wrote, and
 *   with them stripped it is 0.31 off in `y` and `height`.
 * - **Physics.none.** A physics constraint applies nothing at the setup pose
 *   (the oracle's setup reading). Under `Physics.reset` spine-core's box was
 *   the same, to the bit, on all nineteen tree rows (two declare a physics constraint).
 * - **What is counted.** A region's four corners and a mesh's (a linked
 *   mesh's) world vertices — the rows of the oracle's `setup.attachments`
 *   block, in full doubles. A clipping polygon, a bounding box, a path and a
 *   point are not counted (measured: each placed 5000 units out moved
 *   `getBounds` by nothing), and the box is not clipped: `getBounds` called
 *   without its optional clipper.
 * - **A slot on an inactive bone is not counted** — measured: a skin-required
 *   bone 1000 units out, which only a named skin activates, carrying a region
 *   left `getBounds` at the other region's 20 units with no skin set, and 1020
 *   with the bone not skin-required. A bone that is not skin-required under an
 *   inactive parent is active and unposed, and its slot is counted at the
 *   vertices that pose gives; the core poses the same vertices (the oracle's
 *   `setup.attachments`, held at tolerance 0), and a probe of that shape read
 *   the same box both ways.
 * - **The box.** `x`, `y` are the least `x` and `y` over every counted
 *   vertex and `width`, `height` the greatest less the least — the
 *   bottom-left corner in Spine's y-up world, not the top-left. In full
 *   doubles; `build` writes each on the model's 1e-6 grid at float32
 *   (`headerBoxNumber` in `src/compile.ts`, whose comment says why).
 * - **Nothing drawn is no box.** `getBounds` over no vertex returns an offset
 *   of `+Infinity` and a size of `-Infinity`, which is not a box; this
 *   returns `null` for it, and the emitter writes no box rather than a number
 *   nobody measured.
 *
 * Pure, like the rest of `src/core/`: it links nothing from the runtime, and
 * `tools/core_gate.ts` holds it to `getBounds` at tolerance 0 over the corpus
 * (its `BOUNDS` rows).
 */

/** The setup-pose box: its bottom-left corner and its extent, in Spine world units, in full doubles. */
export interface CoreBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The setup-pose bounding box of a model document (the header's rules), or
 * `null` where nothing is drawn. Refused by name — `CoreInputError` — where
 * the core leaves the setup attachments out, since a box over the rest would
 * be a box of a different pose.
 */
export function setupBounds(doc: CompiledDocument, plant: CorePlant = {}): CoreBounds | null {
  const view = underNoSkin(doc);
  const posed = poseSetup(view, { ...plant, round: rawNumber });
  const rows = posed.setup.attachments;
  if (rows === null) {
    const why = posed.absent.find(([block]) => block === 'setup.attachments')?.[1] ?? 'the setup attachments were not posed';
    throw new CoreInputError(`the setup-pose bounding box cannot be computed: ${why}`);
  }
  const active = activeBones(view);
  const boneOf = new Map(view.slots.map((s) => [s.name, s.bone]));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [slot, attachment, , vertices] of rows) {
    const bone = boneOf.get(slot);
    if (bone === undefined || !active.has(bone)) continue;
    for (let i = 0; i + 1 < vertices.length; i += 2) {
      const x = vertices[i];
      const y = vertices[i + 1];
      if (x === null || y === null) throw new CoreInputError(`the setup-pose bounding box cannot be computed: slot "${slot}" attachment "${attachment}" vertex ${i / 2} is not finite`);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (minX === Infinity) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
// --- #907 the setup-pose bounding box: end ---
