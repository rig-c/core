import { localChannels, deformChannels, identifyAttachment } from './render_channels.ts';
import type { ChannelValue } from './render_shared.ts';
/**
 * The render's second poser (issue #968, step 3d of issue #380): the posing
 * seam of `src/render.ts` (`Poser` / `Posed`) implemented over rigc's own
 * core — the compiled model document (`skeleton.model.json`) posed by
 * `src/core/`, each drawn region placed on its page by the document's own
 * `pages` section (issue #1016; a `rigc-compiled/1` document, which has none,
 * by the atlas beside it, read by rigc's own reader `src/atlas.ts`). Nothing
 * here links spine-core, and nothing here is reached
 * from `src/core/`: the core stays pure, and this module is the adapter from
 * its raw entry to the renderer's shapes.
 *
 * ⭐ Why a module of its own rather than a second block in `src/render.ts`.
 * `render.ts` links spine-core (an export's atlas pages and texture
 * substitution, and `spinePoser`), so a core poser written there would share an import list
 * with the runtime it replaces — and "the core poser imports nothing from
 * spine-core" could then only be said, not read off the file. Here it can be:
 * the value imports below are the core, the atlas reader and nothing else, and
 * the one thing taken from `render.ts` is its types (erased at run time). The
 * modules that link spine-core stay three (`CUR07`).
 *
 * ## What each part of a pose is read from
 *
 * - **The walk** is `poseRawAnimation` (`src/core/raw.ts`, issue #966) with
 *   `count` steps of `1/fps` and the reset taken at the animation
 *   (`'animation'`): pose `i` is the running sum of `i` steps, applied at
 *   `min(sum, duration)`, physics reset at pose 0 and stepped by `1/fps` after
 *   — the recipe `spinePoser` runs, measured bit-exact against it on every
 *   frame of the nineteen tree rows by the core suite's `CR03`. The setup pose
 *   is `poseRawSetup`. Since issue #1180 the walk is `poseRawAnimationEach`,
 *   the same walk handing each pose over as it is posed (`CORE_RAW_WALK`), so
 *   one pose is held at a time. Since issue #1380 the physics clock — and
 *   nothing else — moves by `physicsClockStep(1/fps)` rather than by the step
 *   (`PHYSICS_CLOCK_LEAD`, `./core/raw.ts`), in both posers: `CR03` still holds the walk
 *   under the step itself, and the loop-seam suite's `LS06` holds the two
 *   posers equal under the render's clock.
 * - **Vertices, triangles, bones, slot colours, draw order** are the raw
 *   pose's, unchanged: the same doubles `computeWorldVertices`,
 *   `getWorldRotationX` and the slot pose hold (`CR03`).
 * - **The page and page UVs** are `./core/uvs.ts`'s (issue #967): which
 *   region a drawn attachment samples (`drawnRegions` over the pose's `shown`
 *   records and draw order), a region's four UVs (`regionPageUvs`) and a
 *   mesh's (`meshPageUvs`), each held to `sequence.getUVs(index)` at
 *   tolerance 0 on every corpus by `core_gate`'s `uvs` blocks. Where each
 *   region sits — its page, `x`, `y`, turn and the page's size — is the
 *   document's `pages` section (issue #1016, `placementOf`), the atlas `build`
 *   wrote spelled into the document, so a build draws with its `.atlas`
 *   removed.
 * - **The tint** is the slot's light colour times the attachment's colour,
 *   channel by channel, as `src/render.ts`'s `tintOf` forms it; the dark
 *   colour is the slot's, absent where the slot carries none.
 * - **The clip.** Which slot a clip covers is the core's walk
 *   (`./core/clipping.ts`, issue #964), whose rows the raw pose carries with
 *   the attachment's LOCAL UVs. The render samples PAGE UVs, so each clipped
 *   row is cut again with `clipThrough` over the page UVs — the UV rule is
 *   linear in the corner UVs, and the vertices and triangles depend on
 *   positions alone, so the second cut must return the core's vertices,
 *   triangles and verdict to the bit, and a disagreement is thrown as a
 *   defect here rather than drawn. The polygon is the clip slot's world
 *   polygon from the pose's `clips` rows, and the walk that pairs a slot with
 *   the clip over it is the core's rule restated: a clip whose bone is active
 *   starts when none is active, and ends after its end slot is walked.
 * - **A concave or inverse clip** is cut through the core's own convex
 *   decomposition (`clipThrough`, issue #964), and each drawn triangle carries
 *   its source triangle (`clipSourceOf`, `Mesh.source`): the rasteriser
 *   samples it at the source triangle's affine UV, so the pixels are the
 *   spine-core render's whatever pieces either clipper cut (`RC08`). A clip
 *   that is not simple is refused by the raw entry, naming the slot
 *   (`CoreInputError`); the render then falls back to `spinePoser` for that
 *   input and says so (`throughPoser` in `src/render.ts`).
 *
 * ## The skin
 *
 * `--skin <name>` poses `underSkin(doc, name)` — the named skin's record,
 * else the default skin's; the named skin's bones and constraints —
 * measured against spine-core's `setSkin(name)` by the per-skin gate
 * (issue #932). No `--skin` is spine-core's "no skin set" — a fresh skeleton
 * whose `setSkin` was never called — posed as `underNoSkin` (`noSkinView`,
 * issue #1051): no skin's bones or constraints applied, the default skin's
 * included, and every slot resolved through the default skin alone, or
 * through nothing where the document declares skins and no `default` one
 * (`./core/skins.ts`, *No skin set*, for the measurement). Until #1051 it was
 * posed as `underSkin(doc, 'default')`, and the two documents that reading
 * did not cover — a default skin naming a skin-required member, skins with
 * no default one — were refused here and rendered through spine-core.
 */
import type {
  AttachmentPose,
  AttachmentRest,
  BoneSnapshot,
  DrawOptions,
  Piece,
  PieceTexture,
  PoseOptions,
  Posed,
  Poser,
  SkinRoster,
  SlotSubset,
} from './render.ts';
import { atlasRegionLookup, parseAtlasText } from './atlas.ts';
import { pagesOfAtlas, spineFileSha256, type ModelPage } from './model.ts';
import { clipThrough, type ClipShape, type ShapeClipper } from './core/clipping.ts';
import { activeBones, CoreInputError, readModel, sourceOfDoc, underNoSkin, underSkin, type CompiledDocument, type CoreSlotRow } from './core/index.ts';
import { PHYSICS_CLOCK_LEAD, physicsClockStep, poseRawAnimationEach, poseRawSetup, type RawDrawn, type RawPose, type StepEnvironment } from './core/raw.ts';
import type { TimelinePlant } from './core/animation.ts';
import { stepPhysics, type PhysicsStepper } from './core/constraints_physics.ts';
import { CORE_DEFAULT_SKIN, lookupSkins } from './core/skins.ts';
import { documentPageLookup, drawnRegions, meshPageUvs, readUvSequences, regionPageUvs, type DrawnRegion, type UvRegion, type UvSource } from './core/uvs.ts';
import { regionCorners, worldVertices } from './core/vertices.ts';
import type { CoreWorld } from './core/world.ts';

// ---------------------------------------------------------------------------
// the slot subset, spelled once for both posers
// ---------------------------------------------------------------------------

/**
 * Why a slot subset cannot be drawn — a `--slot`/`--hide` naming no slot, a slot
 * whose art only another skin carries, or both flags at once (issue #835).
 *
 * A class of its own so `cli.ts` can turn it into a usage refusal (exit 2,
 * nothing written) without reading a message to decide what kind it is. It
 * lives here, and `src/render.ts` re-exports it, so both posers throw the one
 * class.
 */
export class SlotSubsetError extends Error {}

/** The flag spelling each half of a subset is refused under — the UI's, since that is who reads it. */
const SUBSET_FLAG = { slots: '--slot', hidden: '--hide' } as const;

/** What `subsetOver` reads off a skeleton: its slots in draw order, which skins carry a slot's art, and its default skin. */
export interface SubsetRoster {
  /** Every declared slot, in the setup draw order. */
  declared: readonly string[];
  /** The skins, in the skeleton's order, holding at least one attachment for `slot`. */
  carriers(slot: string): string[];
  /** The default skin's name, or `null` when there is none. */
  defaultSkin: string | null;
}

/**
 * `slotSubsetOf`'s rule over a roster rather than a parsed Spine skeleton, so
 * the spine-core poser and the core poser refuse a subset in the same words —
 * see `slotSubsetOf` in `src/render.ts` for the rule and its three refusals.
 */
export function subsetOver(
  roster: SubsetRoster,
  opts: Pick<PoseOptions, 'slots' | 'hidden'> | undefined,
  skin: string | undefined,
): SlotSubset | undefined {
  if (opts?.slots !== undefined && opts.hidden !== undefined) {
    throw new SlotSubsetError(
      '--slot and --hide are one statement two ways; name the slots to draw or the slots to hide, not both',
    );
  }
  const mode = opts?.slots !== undefined ? 'slots' : opts?.hidden !== undefined ? 'hidden' : undefined;
  if (mode === undefined) return undefined;
  const asked = (mode === 'slots' ? opts?.slots : opts?.hidden) ?? [];
  const flag = SUBSET_FLAG[mode];
  const declared = [...roster.declared];

  const unknown = asked.filter((name) => !declared.includes(name));
  if (unknown.length > 0 || asked.length === 0) {
    const named =
      unknown.length === 0
        ? 'was given no slot name'
        : `${unknown.map((name) => JSON.stringify(name)).join(', ')} ${unknown.length === 1 ? 'names' : 'name'} no slot`;
    throw new SlotSubsetError(
      `${flag} ${named}; this skeleton declares, in draw order: ${declared.join(', ') || 'none'} (${declared.length})`,
    );
  }

  const resolving = new Set([skin ?? null, roster.defaultSkin]);
  const underThisPose =
    skin === undefined ? 'under no skin (the default skin alone)' : `under skin ${JSON.stringify(skin)}`;
  for (const name of asked) {
    const carriers = roster.carriers(name);
    if (carriers.length === 0 || carriers.some((s) => resolving.has(s))) continue;
    const skins = carriers.map((s) => JSON.stringify(s));
    throw new SlotSubsetError(
      `${flag} ${JSON.stringify(name)} draws nothing ${underThisPose}: its attachments are declared only under ` +
        `${skins.length === 1 ? 'skin' : 'skins'} ${skins.join(', ')} — pass --skin ${
          skins.length === 1 ? skins[0] : 'with one of them'
        }`,
    );
  }
  const chosen = new Set(asked);
  return { mode, names: declared.filter((name) => chosen.has(name)) };
}

// ---------------------------------------------------------------------------
// a bone the posed skin leaves inactive, spelled once for both posers
// ---------------------------------------------------------------------------

/**
 * The snapshot of a bone the posed skin leaves UNPOSED — inactive itself (a
 * skin-required bone the skin does not name) or below an inactive bone: the
 * zero transform, every number `0` (issue #968).
 *
 * ⚠️ "Below an inactive bone" is the half the runtime's flag does not say. A
 * bone that is not skin-required reads `active` true under an inactive parent
 * (measured: `arm` skin-required and unnamed, its child `hand` not
 * skin-required — spine-core reads `arm=false hand=true`), yet its matrix is
 * never computed: it stays the zero matrix over every frame unless a
 * constraint writes into it. So the predicate is the bone's own flag and every
 * ancestor's (`unposedBones`).
 *
 * ⭐ Why the seam defines it rather than relaying either runtime. An inactive
 * bone is not posed: neither poser computes its world transform, so its
 * matrix holds whatever a constraint listing it happened to write into a zero
 * matrix. Measured on hand-written rigs under no skin (a skin-required `arm`
 * and its child `hand`, both inactive): a one-bone ik on `hand` left
 * spine-core's matrix at zeros and the core's at NaN; a two-bone ik on `arm,
 * hand` left spine-core's `b` and `d` at `-0` — so `getWorldRotationY` read
 * −179.99999734 (`atan2(−0, …)` at the runtime's pi) — and the core's at `+0`,
 * reading 0; a world transform constraint wrote `worldX` 19.99999979 and a
 * `-0` into both alike. The private corpus met the second case on two rigs:
 * 508 rotation readings of 179.99999734 against 0, every pixel identical. None
 * of those numbers is a pose — a rotation of ±180 is the sign of a zero, and
 * the core's NaN the same degenerate arithmetic taken another way — so the
 * snapshot says what is true of the bone, that it is not posed, in both
 * posers alike. The drawn pieces are untouched: they are posed vertices, not
 * snapshots.
 */
export function inactiveBoneSnapshot(name: string): BoneSnapshot {
  return { name, worldX: 0, worldY: 0, a: 0, b: 0, c: 0, d: 0, rotationX: 0, rotationY: 0, scaleX: 0, scaleY: 0 };
}

/** The bones the posed skin leaves unposed — inactive, or below an inactive bone — from each bone's parent and flag, parents first. */
export function unposedBones(bones: ReadonlyArray<{ name: string; parent: string | null; active: boolean }>): Set<string> {
  const out = new Set<string>();
  for (const b of bones) if (!b.active || (b.parent !== null && out.has(b.parent))) out.add(b.name);
  return out;
}

// ---------------------------------------------------------------------------
// a clipped piece's source triangles, spelled once for both posers
// ---------------------------------------------------------------------------

/**
 * `Mesh.source` of a clipped piece (issue #964): for each drawn triangle, in
 * order, its source triangle's world corners and page UVs — and, with
 * `artUvs`, their original-art UVs — six numbers each, read off the UNCLIPPED
 * piece's own arrays. `sources[i]` is the source triangle of drawn triangle `i`
 * (an index into `triangles` by threes). The rasteriser samples a drawn
 * triangle at that source triangle's affine map, so the pixels do not depend on
 * which convex pieces a clipper cut.
 */
export function clipSourceOf(
  world: ArrayLike<number>,
  uvs: ArrayLike<number>,
  triangles: ArrayLike<number>,
  sources: readonly number[],
  artUvs?: ArrayLike<number>,
): { world: number[]; uvs: number[]; artUvs: number[] | undefined } {
  const w: number[] = [];
  const u: number[] = [];
  const a: number[] | undefined = artUvs === undefined ? undefined : [];
  for (const t of sources) {
    for (let k = 0; k < 3; k++) {
      const i = triangles[3 * t + k];
      w.push(world[2 * i], world[2 * i + 1]);
      u.push(uvs[2 * i], uvs[2 * i + 1]);
      if (a !== undefined && artUvs !== undefined) a.push(artUvs[2 * i], artUvs[2 * i + 1]);
    }
  }
  return { world: w, uvs: u, artUvs: a };
}

// ---------------------------------------------------------------------------
// the core poser
// ---------------------------------------------------------------------------

/** The runtime's own triangulation of a region's quad — `src/render.ts`'s `QUAD_TRIANGLES`. */
const QUAD_TRIANGLES: readonly number[] = [0, 1, 2, 2, 3, 0];

/** A region as texture substitution reads it: the page-UV rules' numbers, and the name and `index:` its key is made of (`regionKey`). */
type TextureRegion = UvRegion & { name: string; index: number };

/** Everything a core pose reads besides the pose: the document under one skin, and where each region sits on its page. */
interface CoreInput {
  doc: CompiledDocument;
  source: UvSource;
  /** The region a name draws — the document's `pages`, or for a `/1` document the atlas's — what an original-art UV reads its trim from. */
  region: (name: string) => TextureRegion | null;
  /** The page UVs and triangle lists the pieces hold (`PieceArrays`), one table for every pose of this poser. */
  arrays: PieceArrays;
}

/**
 * The two arrays a drawn piece holds that are not a function of the pose
 * (issue #1180): its page UVs — a function of the region it samples and,
 * for a mesh, the attachment's own UVs — and a mesh's triangle list.
 *
 * ⭐ Why a table rather than an array per piece. A render holds its frames
 * before it writes one (every animation at `PROTOCOL_FPS`), and the framing
 * reads every animation at `FRAMING_FPS`; a fresh copy of both arrays in every
 * piece of every frame was what made the core poser's render peak at 3.3x
 * spine-core's resident size on a production rig (4,015 against 1,214 MiB,
 * n = 5), where spine-core's pieces hold the attachment's own `uvs` and
 * `triangles` and only the world vertices are per frame. Held here, the count
 * of these arrays is bounded by what the rig draws — one per region and
 * attachment UVs, one per distinct triangle list of a slot's attachment — and
 * not by how many frames are posed (`RC43`).
 *
 * The values are the same doubles either way: the UVs are computed once by
 * the same call from the same inputs, and a triangle list is reused only where
 * it is equal, index for index, to the one the pose carries. No reader writes
 * into a piece's arrays — spine-core's pieces have always shared theirs.
 */
export interface PieceArrays {
  /** The page UVs `found` is drawn with: `regionPageUvs` for a region, `meshPageUvs` over the attachment's UVs for a mesh. */
  uvs(found: DrawnRegion): number[];
  /** A triangle list equal, index for index, to `drawn.triangles`. */
  triangles(drawn: RawDrawn): number[];
}

/** `PieceArrays` kept for the poser's lifetime — what `corePoser` builds unless a plant passes another. */
export function keptPieceArrays(): PieceArrays {
  // Keyed on the placement's own object (one per region name, `documentPageLookup`/`atlasRegionLookup`) and the
  // document's UV array (or `null` for a region): both live as long as the poser, so a key is never a copy.
  const uvs = new WeakMap<object, Map<readonly number[] | null, number[]>>();
  // Keyed by slot and attachment, and each list compared index for index before it is reused: a key names where
  // a list was drawn, the comparison is what makes reusing it exact.
  const triangles = new Map<string, number[][]>();
  return {
    uvs: (found) => {
      let byArt = uvs.get(found.found);
      if (byArt === undefined) {
        byArt = new Map();
        uvs.set(found.found, byArt);
      }
      let kept = byArt.get(found.art);
      if (kept === undefined) {
        kept = found.art === null ? regionPageUvs(found.found.region, found.found.page) : meshPageUvs(found.found.region, found.found.page, found.art);
        byArt.set(found.art, kept);
      }
      return kept;
    },
    triangles: (drawn) => {
      const key = `${drawn.slot}\u0000${drawn.attachment}`;
      let lists = triangles.get(key);
      if (lists === undefined) {
        lists = [];
        triangles.set(key, lists);
      }
      const wanted = drawn.triangles;
      const equal = (list: readonly number[]): boolean => {
        if (list.length !== wanted.length) return false;
        for (let i = 0; i < list.length; i++) if (list[i] !== wanted[i]) return false;
        return true;
      };
      let kept = lists.find(equal);
      if (kept === undefined) {
        kept = [...wanted];
        lists.push(kept);
      }
      return kept;
    },
  };
}

/**
 * The raw walk the core poser steps an animation with (issue #1180):
 * `poseRawAnimationEach`, which hands each pose to `visit` as it is posed, so
 * one pose is held at a time rather than the animation's whole series. A plant
 * passes another (`RC44`).
 */
export type CoreRawWalk = (doc: CompiledDocument, animation: string, steps: readonly number[], plant: TimelinePlant, visit: (pose: RawPose, index: number) => void, environment?: StepEnvironment) => void;

/**
 * The walk `corePoser` steps with unless a plant passes another: one pose posed, drawn and released before the next, the
 * physics clock moved by `physicsClockStep` (issue #1380), and `render --environment`'s change for each pose set before it
 * is posed (issue #1416, `StepEnvironment`).
 */
export const CORE_RAW_WALK: CoreRawWalk = (doc, animation, steps, plant, visit, environment) => poseRawAnimationEach(doc, animation, steps, plant, 'animation', visit, physicsClockStep, environment);

/**
 * The render's physics clock (issue #1380): defined beside the walk that takes it (`./core/raw.ts`), where the mesh
 * comparison (`./meshcompare.ts`, issue #1389) reads the same clock without this module's closure.
 */
export { PHYSICS_CLOCK_LEAD, physicsClockStep };

/**
 * What a suite passes `corePoser` in place of the poser's own parts — `PieceArrays` (`RC43`), the raw walk (`RC44`), and
 * the physics step the walk runs (issue #1467: a step that does nothing has to read 0 on the render's `physics:` line).
 */
export interface CorePoserPlants {
  arrays?: () => PieceArrays;
  walk?: CoreRawWalk;
  physicsStep?: PhysicsStepper;
}

/**
 * The document posed with no skin set — spine-core's initial state, a fresh
 * skeleton whose `setSkin` was never called: `underNoSkin` (issue #1051), no
 * skin's `bones` or constraint lists applied, the default skin's included,
 * and every slot resolved through the default skin alone — or through
 * nothing, where the document declares skins and none of them `default`
 * (`./core/skins.ts`, *No skin set*, for the measurement).
 *
 * Exported for the model side of the validator (issue #1025), which poses a
 * slot the way `validate()` does — a fresh skeleton, no skin set — and must
 * resolve that state by this rule rather than by a copy of it.
 */
export function noSkinView(doc: CompiledDocument): CompiledDocument {
  return underNoSkin(doc);
}

/** A slot row's number, which the raw entry writes as a double — `null` only for a value that is not finite. */
function channel(value: number | null, slot: string): number {
  if (value === null) throw new CoreInputError(`slot "${slot}": the raw pose computed a colour channel that is not finite`);
  return value;
}

/** The world transforms of a raw pose's bones, by name — what the rest table poses through. */
function worldOf(pose: RawPose): Map<string, CoreWorld> {
  return new Map(pose.bones.map((b) => [b.name, { a: b.a, b: b.b, c: b.c, d: b.d, worldX: b.worldX, worldY: b.worldY }]));
}

/** `regionKey` in `src/render.ts`: the trimmed name and the sequence index — the key a substitution matches on. */
function regionKey(region: TextureRegion): string {
  return `${region.name.trim()}#${region.index}`;
}

/** `artUvsOf` in `src/render.ts`, over rigc's atlas reader: a mesh's own UVs, a region's kept rectangle in the drawing's space. */
function artUvsOf(drawn: RawDrawn, region: TextureRegion): PieceTexture | undefined {
  if (drawn.kind === 'mesh') return { region: regionKey(region), artUvs: [...drawn.uvs] };
  if (region.degrees !== 0) return undefined;
  const ow = region.originalWidth;
  const oh = region.originalHeight;
  if (!(ow > 0) || !(oh > 0)) return undefined;
  const s0 = region.offsetX / ow;
  const s1 = (region.offsetX + region.width) / ow;
  const tBottom = 1 - region.offsetY / oh;
  const tTop = 1 - (region.offsetY + region.height) / oh;
  return { region: regionKey(region), artUvs: [s0, tBottom, s0, tTop, s1, tTop, s1, tBottom] };
}

/**
 * The clip polygon over each slot of the draw order, where a clip covers it —
 * the core's walk (`poseClipped` in `./core/clipping.ts`) restated to pair a
 * slot with its polygon; `clippedPieces` holds its answer to the core's own
 * rows.
 */
function clipCover(pose: RawPose, active: ReadonlySet<string>): Map<string, ClipShape> {
  const polygons = new Map(pose.clips.map((c) => [c[0], { end: c[2], polygon: c[3] }]));
  const kinds = new Map(pose.shown.map((s) => [s.slot, s]));
  const cover = new Map<string, ClipShape>();
  let current: { end: string | null; shape: ClipShape } | null = null;
  for (const slot of pose.drawOrder) {
    const shown = kinds.get(slot);
    const g = shown?.geometry;
    const clip = g?.kind === 'clipping' ? polygons.get(slot) : undefined;
    if (shown !== undefined && g?.kind === 'clipping' && clip !== undefined) {
      if (current !== null && current.end === slot) current = null;
      if (active.has(shown.bone) && current === null) current = { end: clip.end, shape: { polygon: clip.polygon, inverse: g.inverse, convex: g.convex } };
      continue;
    }
    if (current !== null) cover.set(slot, current.shape);
    if (current !== null && current.end === slot) current = null;
  }
  return cover;
}

/** One posed moment of the core, read through the seam's `Posed`. */
function corePosed(input: CoreInput, pose: RawPose, through: ShapeClipper, stepped: readonly string[], channels?: ChannelValue[]): Posed {
  const slotRows = new Map<string, CoreSlotRow>(pose.slots.map((row) => [row[0], row]));
  let regions: Map<string, DrawnRegion> | null = null;
  const regionsOf = (): Map<string, DrawnRegion> => {
    if (regions !== null) return regions;
    const { drawn, why } = drawnRegions(input.doc, pose.shown, pose.drawOrder, input.source);
    if (drawn === null) throw new CoreInputError(`the page UVs are not posed: ${why}`);
    regions = new Map(drawn.map((d) => [d.slot, d]));
    return regions;
  };
  const tintOf = (d: RawDrawn): [number, number, number, number] => {
    const row = slotRows.get(d.slot);
    if (row === undefined) throw new CoreInputError(`slot "${d.slot}" drew and has no slot row`);
    return [
      channel(row[2], d.slot) * d.colour[0],
      channel(row[3], d.slot) * d.colour[1],
      channel(row[4], d.slot) * d.colour[2],
      channel(row[5], d.slot) * d.colour[3],
    ];
  };
  const darkOf = (d: RawDrawn): [number, number, number] | undefined => {
    const dark = slotRows.get(d.slot)?.[6] ?? null;
    return dark === null ? undefined : [channel(dark[0], d.slot), channel(dark[1], d.slot), channel(dark[2], d.slot)];
  };
  return {
    pieces: (draw: DrawOptions): Piece[] => pieces(input, pose, draw, regionsOf(), tintOf, darkOf, through),
    bones: (): BoneSnapshot[] => {
      const unposed = unposedBones(pose.bones);
      return pose.bones.map((b) => !unposed.has(b.name) ? ({
        name: b.name,
        worldX: b.worldX,
        worldY: b.worldY,
        a: b.a,
        b: b.b,
        c: b.c,
        d: b.d,
        rotationX: b.rotationX,
        rotationY: b.rotationY,
        scaleX: b.scaleX,
        scaleY: b.scaleY,
      }) : inactiveBoneSnapshot(b.name));
    },
    attachments: (identity = false): AttachmentPose[] =>
      pose.drawn.map((d) => {
        const row = { slot: d.slot, attachment: d.attachment, vertices: [...d.vertices], color: tintOf(d) };
        if (!identity) return row;
        const source = pose.shown.find((s) => s.slot === d.slot)?.geometry;
        if (source === undefined) throw new CoreInputError(`slot "${d.slot}" has no original attachment identity`);
        return identifyAttachment(row, source);
      }),
    ...(channels === undefined ? {} : { channels: (): ChannelValue[] => {
      const out = [...channels];
      for (const shown of pose.shown) {
        const g = shown.geometry;
        const v = g.kind === 'mesh' ? g.vertices : g.kind === 'linkedmesh' ? sourceOfDoc(input.doc)(g.skin, g.slot, g.source) : null;
        if (v === null || typeof v === 'string') continue;
        const setup = v.weighted ? new Array<number>(v.bindings.reduce((n, b) => n + b.length * 2, 0)).fill(0) : v.xy;
        out.push(...deformChannels(shown.slot, shown.name, shown.deform ?? [], setup, g));
      }
      return out;
    } }),
    physics: (): string[] => [...stepped],
  };
}

/** The drawables of one core pose, in draw order — `drawPieces` in `src/render.ts`, read off the raw pose. */
function pieces(
  input: CoreInput,
  pose: RawPose,
  draw: DrawOptions,
  regions: Map<string, DrawnRegion>,
  tintOf: (d: RawDrawn) => [number, number, number, number],
  darkOf: (d: RawDrawn) => [number, number, number] | undefined,
  through: ShapeClipper,
): Piece[] {
  const named = draw.subset === undefined ? undefined : new Set(draw.subset.names);
  const cover = draw.unclipped ? new Map<string, ClipShape>() : clipCover(pose, new Set(pose.bones.filter((b) => b.active).map((b) => b.name)));
  const rows = new Map(pose.clipped.map((row) => [row[0], row]));
  if (!draw.unclipped) {
    const walked = [...cover.keys()].filter((slot) => pose.drawn.some((d) => d.slot === slot)).join();
    const cored = pose.clipped.map((row) => row[0]).join();
    if (walked !== cored) throw new Error(`the clip cover [${walked}] is not the core's clipped roster [${cored}] — the two walks disagree`);
  }
  const out: Piece[] = [];
  for (const d of pose.drawn) {
    const drawn = draw.subset === undefined || named === undefined || named.has(d.slot) === (draw.subset.mode === 'slots');
    if (!drawn) continue;
    const found = regions.get(d.slot);
    if (found === undefined) throw new CoreInputError(`slot "${d.slot}" drew "${d.attachment}", and no atlas region was resolved for it`);
    const uvs = input.arrays.uvs(found);
    const atlasRegion = draw.texture ? input.region(found.region) : null;
    if (draw.texture && atlasRegion === null) throw new CoreInputError(`slot "${d.slot}": atlas region "${found.region}" is not in the atlas`);
    const texture = atlasRegion === null ? undefined : artUvsOf(d, atlasRegion);
    const common = { tint: tintOf(d), dark: darkOf(d), slot: d.slot, page: found.found.page.name };
    const world = [...d.vertices];
    const piece: Piece =
      d.kind === 'mesh'
        ? { kind: 'mesh', ...common, texture, world, uvs, triangles: input.arrays.triangles(d) }
        : { kind: 'region', ...common, texture, world, uvs };
    const shape = cover.get(d.slot);
    out.push(shape === undefined ? piece : clippedPiece(piece, d, shape, uvs, rows.get(d.slot), through));
  }
  return out;
}

/**
 * `piece` cut by the clip over it, over the page UVs (the header's *The clip*),
 * or `piece` itself when the clipper cut nothing — `clippedPiece` in
 * `src/render.ts`. The cut's vertices, triangles and verdict are held to the
 * core's own row for the slot.
 */
function clippedPiece(piece: Piece, d: RawDrawn, shape: ClipShape, uvs: number[], row: RawPose['clipped'][number] | undefined, through: ShapeClipper): Piece {
  const cut = through(shape, d.vertices, d.triangles, uvs);
  if (cut === null) throw new Error(`slot "${d.slot}": the clip over it is one the core does not draw, and the raw pose carried it — a defect in src/render_core.ts`);
  if (row === undefined || (row[2] === 1) !== cut.clipped || row[3].join() !== cut.vertices.join() || row[5].join() !== cut.triangles.join()) {
    throw new Error(`slot "${d.slot}": the clip over the page UVs cut other geometry than the core's clipped row — a defect in src/render_core.ts`);
  }
  if (!cut.clipped) return piece;
  let texture = piece.texture;
  const source = clipSourceOf(d.vertices, uvs, d.triangles, cut.sources, texture?.artUvs);
  if (texture !== undefined) {
    const art = through(shape, d.vertices, d.triangles, texture.artUvs);
    if (art === null || art.uvs.length !== cut.uvs.length) {
      throw new Error(
        `slot "${piece.slot}": the clip cut ${cut.uvs.length / 2} vertices for the page UVs and ` +
          `${(art?.uvs.length ?? 0) / 2} for the original-art UVs over the same geometry`,
      );
    }
    texture = { region: texture.region, artUvs: art.uvs, sourceArtUvs: source.artUvs };
  }
  const { tint, dark, slot, page } = piece;
  return { kind: 'mesh', tint, dark, slot, page, texture, world: cut.vertices, uvs: cut.uvs, triangles: cut.triangles, source: { world: source.world, uvs: source.uvs } };
}

/**
 * The rest table (`restOf` in `src/render.ts`): every (slot, attachment) the
 * frames show, in order of first appearance, posed on the setup bones with no
 * deform — the attachment looked up by that name as a placeholder in the
 * posed skin, then the default skin, as `Skeleton.getAttachment` does.
 */
function restOf(view: CompiledDocument, setup: RawPose, shown: readonly AttachmentPose[][]): AttachmentRest[] {
  const world = worldOf(setup);
  const bones = new Map(view.slots.map((s) => [s.name, s.bone]));
  const sourceOf = sourceOfDoc(view);
  const seen = new Map<string, Set<string>>();
  const out: AttachmentRest[] = [];
  for (const entries of shown) {
    for (const entry of entries) {
      const names = seen.get(entry.slot) ?? new Set<string>();
      if (names.has(entry.attachment)) continue;
      names.add(entry.attachment);
      seen.set(entry.slot, names);
      const skin = lookupSkins(view).find((k) => k.attachments[entry.slot]?.[entry.attachment] !== undefined);
      const record = skin?.attachments[entry.slot]?.[entry.attachment];
      const g = record?.geometry;
      const boneName = bones.get(entry.slot);
      const bone = boneName === undefined ? undefined : world.get(boneName);
      if (skin === undefined || g === undefined || bone === undefined || (g.kind !== 'region' && g.kind !== 'mesh' && g.kind !== 'linkedmesh')) {
        throw new Error(
          `slot ${JSON.stringify(entry.slot)} showed attachment ${JSON.stringify(entry.attachment)} in a frame, and ` +
            'the setup skeleton resolves no region or mesh of that name there',
        );
      }
      if (g.kind === 'region') {
        const rect = g.region.atlas;
        if (rect === null) throw new CoreInputError(`slot "${entry.slot}" region "${entry.attachment}": the model states the build had no atlas rectangle for it`);
        out.push({ slot: entry.slot, attachment: entry.attachment, kind: 'region', vertices: regionCorners({ ...g.region, atlas: rect }, bone), triangles: [...QUAD_TRIANGLES] });
        continue;
      }
      const mesh = g.kind === 'mesh' ? g : view.skins.find((k) => k.name === g.skin)?.attachments[g.slot]?.[g.source]?.geometry;
      const vertices = g.kind === 'mesh' ? g.vertices : sourceOf(g.skin, g.slot, g.source);
      if (mesh === undefined || mesh.kind !== 'mesh' || typeof vertices === 'string') throw new CoreInputError(`slot "${entry.slot}": the linked mesh "${entry.attachment}" resolves no source mesh`);
      if (mesh.hull === undefined) throw new CoreInputError(`slot "${entry.slot}" mesh "${entry.attachment}": the model states no hull`);
      out.push({
        slot: entry.slot,
        attachment: entry.attachment,
        kind: 'mesh',
        vertices: worldVertices(vertices, bone, world),
        triangles: [...mesh.triangles],
        hull: mesh.hull,
        uvs: [...mesh.uvs],
      });
    }
  }
  return out;
}

/**
 * The first place two `pages` sections differ, by path, or `null` when they
 * are the same — the page count, a page's name or size, its `pma` or `scale`
 * where `stated` carries them (a `rigc-compiled/3` document's, issue #1026), a
 * region count, or a region's name or one of its numbers.
 */
export function firstPageDifference(stated: readonly ModelPage[], found: readonly ModelPage[]): string | null {
  if (stated.length !== found.length) return `the document states ${stated.length} page(s), the atlas has ${found.length}`;
  for (let i = 0; i < stated.length; i++) {
    const a = stated[i];
    const b = found[i];
    for (const key of ['name', 'width', 'height'] as const) {
      if (a[key] !== b[key]) return `pages[${i}].${key} is ${JSON.stringify(a[key])} in the document and ${JSON.stringify(b[key])} in the atlas`;
    }
    // A rigc-compiled/3 page states its `pma` and `scale` too (issue #1026), and an atlas edited in either after the build is not the one it was written beside; a /2 page states neither, and is held to its placement alone.
    for (const key of ['pma', 'scale'] as const) {
      if (a[key] !== undefined && a[key] !== b[key]) return `pages[${i}] "${a.name}": ${key} is ${JSON.stringify(a[key])} in the document and ${JSON.stringify(b[key])} in the atlas`;
    }
    if (a.regions.length !== b.regions.length) return `pages[${i}] "${a.name}" holds ${a.regions.length} region(s) in the document and ${b.regions.length} in the atlas`;
    for (let j = 0; j < a.regions.length; j++) {
      const r = a.regions[j];
      const q = b.regions[j];
      for (const key of Object.keys(r) as Array<keyof typeof r>) {
        if (r[key] !== q[key]) return `pages[${i}] "${a.name}" region ${JSON.stringify(r.name)}: ${key} is ${JSON.stringify(r[key])} in the document and ${JSON.stringify(q[key])} in the atlas`;
      }
    }
  }
  return null;
}

/**
 * Where each region a core pose draws sits on its page, read from the
 * document's `pages` section (issue #1016) — or, for a `rigc-compiled/1`
 * document, which has none, from `atlasText` as before. With both, the atlas
 * must be the one the document was written beside: a page or region that
 * differs is refused naming the first difference, so the core never draws the
 * build's placement over another atlas's pages while spine-core, reading that
 * atlas, would draw another picture.
 */
function placementOf(doc: CompiledDocument, atlasText: string, where: string): { lookup: UvSource['lookup']; region: CoreInput['region'] } {
  if (doc.pages !== null) {
    if (atlasText !== '') {
      const differs = firstPageDifference(doc.pages, pagesOfAtlas(atlasText));
      if (differs !== null) {
        throw new CoreInputError(
          `the atlas beside ${where} is not the one it was written beside: ${differs} — ` +
            'the core would draw the build\'s placement over pages the atlas has rearranged',
        );
      }
    }
    const lookup = documentPageLookup(doc.pages);
    return { lookup, region: (name) => lookup(name)?.region ?? null };
  }
  if (atlasText === '') {
    throw new CoreInputError(
      `${where} is a ${doc.spec} document, which does not state where each region sits on its page (the pages section, issue #1016), ` +
        'and no atlas was given to read it from — rebuild it to carry them, or pose it beside the atlas it was built with',
    );
  }
  const lookup = atlasRegionLookup(parseAtlasText(atlasText));
  return { lookup, region: (name) => lookup(name)?.region ?? null };
}

/**
 * `Poser` over rigc's own core: `modelText` a `rigc-compiled/3` or `/2` document
 * (`skeleton.model.json`), which states where each region sits on its page
 * (`pages`, issue #1016), so `atlasText` may be `''`; given, it is held to
 * the document's `pages` (`placementOf`). A `rigc-compiled/1` document states
 * no placement and is drawn through `atlasText`, the atlas `build` wrote
 * beside it, as before; with none given it is refused by name. With `skeleton`, the Spine file beside the document
 * is held to the digest the document records (`spine.sha256`, issue #968) and
 * refused, naming both digests, when it is not that build's. Refused by
 * `CoreInputError`, naming why, where the document or the atlas cannot be read; a pose the core leaves a block of out
 * is refused the same way when it is asked for (the header).
 */
export function corePoser(
  modelText: string,
  atlasText: string,
  where = 'skeleton.model.json',
  skeleton?: { path: string; bytes: Uint8Array },
  through: ShapeClipper = clipThrough,
  plants: CorePoserPlants = {},
): Poser {
  const doc = readModel(modelText, where);
  // The document poses the rig it was built with; the Spine file beside it must be that build's (issue #968).
  if (skeleton !== undefined) {
    const found = spineFileSha256(skeleton.bytes);
    if (found !== doc.spine.sha256) {
      throw new CoreInputError(
        `${skeleton.path} is not the skeleton.json ${where} was written beside: its sha256 is ${found}, the document records ${doc.spine.sha256} — ` +
          'the Spine file was edited or replaced after the build, and the core would draw the build\'s rig instead of it',
      );
    }
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(modelText);
  } catch (err) {
    throw new CoreInputError(`${where}: not JSON — ${(err as Error).message}`);
  }
  const sequences = readUvSequences(parsed);
  const { lookup, region } = placementOf(doc, atlasText, where);
  const views = new Map<string, CompiledDocument>();
  const arrays = (plants.arrays ?? keptPieceArrays)();
  const walk = plants.walk ?? CORE_RAW_WALK;
  const inputOf = (skin: string | undefined): CoreInput => {
    const key = skin === undefined ? '' : `=${skin}`;
    let view = views.get(key);
    if (view === undefined) {
      view = skin === undefined ? noSkinView(doc) : underSkin(doc, skin);
      views.set(key, view);
    }
    return { doc: view, source: { lookup, sequences }, region, arrays };
  };
  const roster: SubsetRoster = {
    declared: doc.slots.map((s) => s.name),
    carriers: (slot) => doc.skins.filter((k) => Object.keys(k.attachments[slot] ?? {}).length > 0).map((k) => k.name),
    defaultSkin: doc.skins.some((k) => k.name === CORE_DEFAULT_SKIN) ? CORE_DEFAULT_SKIN : null,
  };
  return {
    animations: doc.animations.map((a) => ({ name: a.name, duration: a.timelines.duration })),
    bones: doc.bones.map((b) => ({ name: b.name, parent: b.parent ?? null })),
    slots: doc.slots.map((s) => ({ name: s.name, bone: s.bone })),
    subset: (opts, skin) => subsetOver(roster, opts, skin),
    setup: (skin, channels) => {
      const input = inputOf(skin);
      let values: ChannelValue[] | undefined;
      const observe = channels ? { readLocals: (bones: readonly import('./model.ts').ModelBone[], sliders: readonly import('./core/constraints_slider.ts').SliderApplication[]) => { values = localChannels(bones, sliders); } } : {};
      const pose = poseRawSetup(input.doc, { through, ...observe });
      return corePosed(input, pose, through, [], values);
    },
    animation: (name, skin, fps, count, visit, environment, channels) => {
      let values: ChannelValue[] | undefined;
      const observe = channels ? { readLocals: (bones: readonly import('./model.ts').ModelBone[], sliders: readonly import('./core/constraints_slider.ts').SliderApplication[]) => { values = localChannels(bones, sliders); } } : {};
      const input = inputOf(skin);
      const step = 1 / fps;
      // Each pose is drawn as it is posed and released before the next (issue #1180), so the walk holds one pose and not
      // the animation's series. What is thrown is what was thrown when the series was posed first and drawn after: a
      // walk that refuses a later pose still refuses the call, and a draw that throws is re-thrown once the walk has
      // finished without refusing — the first such throw, by frame — and no frame after it is drawn.
      const drawFailed: unknown[] = [];
      // `Posed.physics` on the core (issue #1467): the constraints whose state's clock reads the skeleton's after a step
      // that moved it — spine-core's reading (`steppedPhysicsOf` in `src/render.ts`), taken off the same state the step
      // writes, as each constraint is stepped, and handed to the pose the step made.
      const steppedNow = new Set<string>();
      const inner = plants.physicsStep ?? stepPhysics;
      const physicsStep: PhysicsStepper = (r, w, length, ctx) => {
        const moved = inner(r, w, length, ctx);
        if (ctx.time > 0 && ctx.states.get(r.name)?.lastTime === ctx.time) steppedNow.add(r.name);
        return moved;
      };
      walk(input.doc, name, new Array<number>(count).fill(step), { through, physicsStep, ...observe }, (pose, i) => {
        const stepped = [...steppedNow].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
        steppedNow.clear();
        if (drawFailed.length > 0) return;
        try {
          visit(i, corePosed(input, pose, through, stepped, values));
        } catch (thrown) {
          drawFailed.push(thrown);
        }
      }, environment);
      if (drawFailed.length > 0) throw drawFailed[0];
    },
    rest: (skin, shown) => {
      const input = inputOf(skin);
      return restOf(input.doc, poseRawSetup(input.doc), shown);
    },
  };
}

/**
 * The skin roster behind the core poser (`SkinRoster` in `src/render.ts`,
 * issue #1014): the bones each skin leaves unposed, read off the model
 * document — `unposedBones` over `activeBones` of the skin's view, the
 * predicate the raw pose flags its bones with, and under no skin the view the
 * core poses with no skin set (`noSkinView`). `skins` is the skin list in the Spine file's order:
 * a `rigc-compiled/3` document's `editorOrder` (issue #1026), else the file's
 * own list, which a `/2` or `/1` document does not hold (`resolveSkinView`'s
 * note in `./core/index.ts`).
 *
 * Measured against the runtime's reading (`skinRosterOf`, a fresh skeleton's
 * `active` under each skin and under none) on every rigc build the tree
 * carries: the same bones, under every skin. Since issue #1020 it is handed the
 * document `coreDocumentFacts` read for the run's other facts, so the roster
 * costs no reading of its own; a skin's view is still built only when a
 * question is asked of it.
 */
function coreSkinRoster(doc: CompiledDocument, skins: readonly string[]): SkinRoster {
  return {
    skins,
    unposedUnder: (skin) => {
      const view = skin === undefined ? noSkinView(doc) : underSkin(doc, skin);
      const active = activeBones(view);
      return unposedBones(view.bones.map((b) => ({ name: b.name, parent: b.parent ?? null, active: active.has(b.name) })));
    },
  };
}

/**
 * What `render` and `check` read off a rigc build's model document besides the
 * pose (issue #1020) — so a build the core poses draws with its
 * `skeleton.atlas` gone, and reads off `skeleton.json` only what the document
 * does not state.
 */
export interface CoreDocumentFacts {
  /** The document's spec: `rigc-compiled/3` and `/2` state where each region sits on its page, `rigc-compiled/1` does not; `/3` alone states the orders, the stage and the pages' `scale:` lines (issue #1026). */
  spec: string;
  /**
   * Every page the `pages` section states, by name, in file order — the
   * images the draw samples, read by these names; `null` for a
   * `rigc-compiled/1` document, whose pages only its atlas names.
   */
  pageNames: readonly string[] | null;
  /** The skin roster behind the core poser (`coreSkinRoster`), over this one reading. */
  roster: SkinRoster;
  /**
   * What a `rigc-compiled/3` document states that `skeleton.json` and the
   * atlas were the only place of before issue #1026 — the order the file lists
   * animations and skins in, whether a stage is declared, and the `scale:`
   * lines its pages state, in page order — or `null` for a `/2` or `/1`
   * document, whose reader takes them off the files beside it and says so.
   */
  stated: { animations: readonly string[]; skins: readonly string[]; declaresStage: boolean; scales: readonly number[] } | null;
  /**
   * The slot subset's roster (`subsetOver`): the slots in the document's draw
   * order, its default skin, and the skins the document files a slot's
   * attachments under. A refusal lists those skins, and the order it lists
   * them in is the Spine file's (`./core/index.ts`, *Several skins filling one
   * placeholder*) — so they are put in the skin order a `rigc-compiled/3`
   * document states (`editorOrder`, issue #1026), or, for a `/2` or `/1`
   * document, which does not hold it, the Spine file's own list.
   */
  subset: SubsetRoster;
}

/**
 * The document's facts for `render` and `check` (`CoreDocumentFacts`), read
 * once. `fileSkins` is the Spine file's skin list, in its order — what a
 * `rigc-compiled/2` or `/1` document does not state; a `/3` document's own
 * `editorOrder` is read instead (issue #1026). Refused by `CoreInputError`
 * where `readModel` refuses the document.
 */
export function coreDocumentFacts(modelText: string, where: string, fileSkins: readonly string[]): CoreDocumentFacts {
  const doc = readModel(modelText, where);
  const stated = doc.stated;
  const skins = stated === null ? fileSkins : stated.editorOrder.skins.map((k) => k.name);
  const rank = (name: string): number => {
    const at = skins.indexOf(name);
    return at < 0 ? skins.length : at;
  };
  return {
    spec: doc.spec,
    pageNames: doc.pages === null ? null : doc.pages.map((page) => page.name),
    roster: coreSkinRoster(doc, skins),
    stated:
      stated === null
        ? null
        : {
            animations: stated.editorOrder.animations,
            skins,
            declaresStage: stated.stage !== null,
            scales: (doc.pages ?? []).flatMap((page) => (typeof page.scale === 'number' ? [page.scale] : [])),
          },
    subset: {
      declared: doc.slots.map((s) => s.name),
      carriers: (slot) =>
        doc.skins
          .filter((k) => Object.keys(k.attachments[slot] ?? {}).length > 0)
          .map((k) => k.name)
          .sort((a, b) => rank(a) - rank(b)),
      defaultSkin: doc.skins.some((k) => k.name === CORE_DEFAULT_SKIN) ? CORE_DEFAULT_SKIN : null,
    },
  };
}
