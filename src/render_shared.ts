/**
 * What a render is, whichever poser draws it — everything `./render.ts` held
 * that does not link spine-core (issue #1052, step 4e of #380).
 *
 * Moved unchanged: the frame-set contract (`frames.json`, the contact sheet),
 * the posing seam and its samplers, the candidate a render or a check loads
 * and its poser choice, the geometry export, texture substitution, the framing
 * and the rasteriser. `./render.ts` keeps what names the runtime — spine-core's
 * implementation of the seam, loading a Spine export, the atlas class — and
 * re-exports every name below that it exported before, so a dependant's import
 * resolves where it always did. See `./render.ts`'s header for what the
 * rasteriser draws and the conventions it owns; they are this file's now.
 *
 * ⭐ Where a function here reaches an input only the runtime can read — a
 * Spine export, `--poser spine`, a fallback the poser line names, a skeleton
 * spine-core already parsed — it asks the seam (`./spine_side.ts`) for the
 * Spine side rather than importing it. The local functions under *the Spine
 * side, through the seam* below carry the names the bodies always called, so
 * the bodies read as they did; `./render.ts` registers the implementations
 * when it is loaded. An entry that never loads it links nothing of the
 * runtime here, and such an input is refused by name (`SpineRuntimeError`).
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { Plate, readPlate, type RGBA } from '../tools/plate.ts';
import { pageFootprint, parseAtlasText } from './atlas.ts';
import { CoreInputError } from './core/index.ts';
import { computeUvs } from './core/uvs.ts';
import { ATLAS_SCALE_LINE, MODEL_DOCUMENT_FILE } from './model.ts';
import {
  coreDocumentFacts,
  corePoser,
  SlotSubsetError,
  subsetOver,
  type CoreDocumentFacts,
  type SubsetRoster,
} from './render_core.ts';
import { spinePosingFor, type SpineSkeletonData } from './spine_side.ts';
import { walkTimelines } from './timelines.ts';
import { firstNonFinite, type PosedVertices, type WorldTransform } from './nonfinite.ts';
import { environmentAt, type EnvironmentChange, type EnvironmentStep } from './environment.ts';

// ---------------------------------------------------------------------------
// the Spine side, through the seam (issue #1052)
// ---------------------------------------------------------------------------
//
// ⭐ The names `./render.ts` gives these, so the bodies below call what they
// always called; each asks the seam for the side `./render.ts` registered and
// is refused by name (`SpineRuntimeError`) where nothing did. The first call
// on every path that reaches the runtime is `requireSpineRuntime`, so the
// refusal names the input and why it needed the runtime, as #1014 says it.

/** A skeleton spine-core parsed — opaque here (`SpineSkeletonData`); `./render.ts` reads it as the runtime's `SkeletonData`. */
type SkeletonData = SpineSkeletonData;

/** What the seam's refusals name a parsed skeleton handed straight to a sampler as. */
const PARSED_SKELETON = 'a skeleton spine-core parsed';
const PARSED_WHY = 'handed over already parsed';

/** Touch the runtime once, before anything is parsed through it, and refuse by name when it cannot be used. */
function requireSpineRuntime(label: string, why: string): void {
  spinePosingFor(label, why).requireRuntime(label, why);
}

/** The skeleton parsed against its atlas through the runtime, a pair it cannot load being `refuse`'s refusal. */
function spineSkeletonData(skeletonText: string, atlasText: string, refuse: (runtime: string) => Error): SkeletonData {
  return spinePosingFor(PARSED_SKELETON, 'loaded through its atlas').skeletonData(skeletonText, atlasText, refuse);
}

/** The facts as spine-core loaded them. */
function spineFacts(data: SkeletonData, atlasText: string | null): SkeletonFacts {
  return spinePosingFor(PARSED_SKELETON, PARSED_WHY).facts(data, atlasText);
}

/** spine-core's poser over a parsed skeleton. */
function spinePoser(data: SkeletonData): Poser {
  return spinePosingFor(PARSED_SKELETON, PARSED_WHY).poser(data);
}

/** The skin roster of a parsed skeleton, as the runtime flags it. */
function skinRosterOf(data: SkeletonData): SkinRoster {
  return spinePosingFor(PARSED_SKELETON, PARSED_WHY).skinRoster(data);
}

/** The page names an atlas declares, as the runtime's atlas reader reads them. */
function atlasPageNames(atlasText: string): string[] {
  return spinePosingFor('an atlas', "read through spine-core's atlas reader").atlasPageNames(atlasText);
}

/** An atlas's pages and regions as the runtime reads them, for a substitution. */
function spineSubstitution(atlasText: string): { pages: string[]; regions: Map<string, SubstituteRegion> } {
  return spinePosingFor('a --texture-from atlas', "read through spine-core's atlas reader, for a candidate spine-core poses").substitution(atlasText);
}

/** `./render.ts`'s choice of posers over a skeleton it parsed itself (`candidatePosers`). */
export { choosePosers, pairRefusal, regionKey };

/** Opaque, and light: both of rung 3's parts are dark slate, so is every ground. */
export const BACKGROUND: RGBA = [232, 232, 232, 255];
/** Padding around the union bounding box, as a fraction of its long side. */
export const PAD = 0.04;
/**
 * Directory a skeleton with no animation writes its one frame into.
 *
 * It cannot collide with an animation's directory, because an animation named
 * `setup` would have to live in a skeleton that has at least one animation, and
 * this name is only ever used when there are none.
 */
export const SETUP_POSE_DIR = 'setup';
/**
 * The sampling rate the ladder's briefs are written against.
 *
 * It is a constant rather than a bare `12` in the default because it is also the
 * rate at which the directory name says nothing: a rung rendered at the protocol
 * rate writes `<animation>/`, and any other rate writes `<animation>@<fps>fps/`.
 */
export const PROTOCOL_FPS = 12;

/**
 * The directory a frame set of `animation` sampled at `fps` is written to under
 * the render root: the animation's own name at the protocol rate, and
 * `<animation>@<fps>fps` at any other — so two rates of one animation sit side by
 * side. `render` and `bench/render_reference.ts` both name their sets through
 * it, and `render --help` and AUTHORING §0 say what it does (issue #1414).
 */
export function frameSetDir(animation: string, fps: number): string {
  return fps === PROTOCOL_FPS ? animation : `${animation}@${fps}fps`;
}
/** The rate the framing box is measured at, whatever `--fps` writes frames at. */
export const FRAMING_FPS = 60;

// ---------------------------------------------------------------------------
// the frame-set sidecar
// ---------------------------------------------------------------------------
//
// ⭐ A rendered frame set is a picture of a world box, and the box used to be
// nowhere. That cost two things. An author measuring a distance in pixels had no
// way to turn it into the units a rig is authored in except by finding something
// of a known size in the shot; and nothing could render a SECOND skeleton onto
// the same pixel grid, because the grid was a number that existed only inside one
// run of `render_reference.ts`. `frames.json` writes it down.

/** The sidecar's file name and format tag. */
export const FRAMES_SIDECAR = 'frames.json';
export const FRAMES_SPEC = 'rigc-frames/1';

/**
 * The contact sheet beside a frame set, and the one number its layout needs.
 *
 * ⭐ A sheet is **part of the frame set**, not an illustration of it: a long shot
 * commits a couple of stills and folds every sampled frame into one PNG, so for
 * such a set the sheet is the only picture of the 309 frames in between, and
 * `check` compares against its tiles (issue #36). That makes the layout a
 * contract between two programs — `bench/render_reference.ts` writes the grid and
 * `src/check.ts` reads it — so the column count lives here rather than in either.
 *
 * The tile SIZE is deliberately not here. It is a `--tile` choice per run, and a
 * reader can measure it exactly off the sheet's own dimensions given the frame
 * count and the column count (`check`'s `sheetGeometry` does), so recording it
 * would be a second definition of something already written down in pixels.
 */
export const SHEET_COLUMNS = 8;
/** The sheet's file name inside a frame directory. */
export const SHEET_FILE = 'contact.png';
/** One pixel of rule between tiles, and one around the outside. */
export const SHEET_GAP = 1;
/** Default long side of one contact-sheet tile, in pixels. */
export const SHEET_TILE = 128;
/** The rule between tiles, and the frame number drawn in each. */
export const SHEET_RULE: RGBA = [176, 176, 176, 255];
export const SHEET_LABEL: RGBA = [96, 96, 96, 255];

/** One rendered frame directory: which animation, at what rate, and what is on disk. */
export interface FrameSet {
  /** Directory name under the skeleton root — `heavy`, or `heavy@24fps`. */
  dir: string;
  /** The animation these frames show, or `null` for a skeleton with none. */
  animation: string | null;
  fps: number;
  /** How many frames the animation sampled to at this rate. */
  sampled: number;
  /** How many were actually written (a stride writes fewer). */
  written: number;
  stride: number;
  /**
   * The last sampled frame's time, in seconds.
   *
   * ⚠️ Which indices are on disk is deliberately NOT recorded here. The
   * directory is the only author of that fact, and a second copy of it in this
   * file could only ever be the stale one.
   */
  duration: number;
  /**
   * Whether the physics ran while these frames were posed (issue #1467): how
   * many physics constraints the poser stepped on at least one frame of this
   * set, and the rate it stepped them at — the set's own `fps`, one skeleton
   * update a frame. `render` prints the same two figures on its `physics:` line.
   *
   * ⭐ Absent on a rig that declares no physics constraint, for `skin`'s
   * reason in `FramesSidecar`: there is nothing for the field to count, and
   * every frame set written before it existed says the same. Present, a 0 is a
   * claim — the rig declares physics and no constraint took a step on any
   * frame — and that is what tells a reading taken with physics from one
   * taken without.
   */
  physics?: { stepped: number; fps: number };
}

export interface FramesSidecar {
  spec: string;
  example?: string;
  rung?: string;
  skeleton?: string;
  /**
   * The skin these frames were posed under, when one was asked for (issue #571).
   *
   * ⭐ **Absent is not `"default"`.** A render with no skin sets none — every
   * slot resolves through `SkeletonData.defaultSkin` alone — and a frame set
   * written before this field existed says nothing either, so the two are the
   * same fact on disk and the field is omitted for both. That is what keeps
   * every frame set in this repository byte-identical across this change, and it
   * is why `check` can refuse a mismatch it can SEE (`skin` present and
   * different, or present where the run asked for none) and can only NOTE the
   * one it cannot (`skin` absent while the run asked for one).
   */
  skin?: string;
  /**
   * The slots these frames draw, when `render --slot` narrowed them to a subset
   * (issue #835) — in the skeleton's draw order, whatever order they were named in.
   *
   * ⭐ Absent on a render of every slot, for the reason `skin` is: that is what
   * every frame set written before this field existed says too, so the whole-rig
   * render stays byte-identical and the key's presence is the claim. A frame set
   * carrying this or `hidden` is a picture of PART of the rig, and `check` refuses
   * it as a reference by name rather than scoring a whole candidate against it.
   */
  slots?: string[];
  /** The slots these frames leave out, when `render --hide` named them — see `slots`. */
  hidden?: string[];
  /**
   * The schedule the physics answered, when `render --environment` gave one
   * (issue #1416) — its steps as read, each `{ t, wind?, gravity? }`.
   *
   * ⭐ Absent on a render without it, for `skin`'s reason: every frame set
   * written before the field existed says the same. A frame set carrying it is
   * a picture of the rig in a world `check` does not pose, so `check` refuses
   * it as a reference by name.
   */
  environment?: EnvironmentStep[];
  /**
   * The box was given rather than fitted, when `render --viewport` or
   * `render --viewport-from` gave it (issue #1414): which flag, and every slot
   * that reaches past the box, by set and frame — what lies past it is not in
   * the frames, since each frame is the box.
   *
   * ⭐ Absent on a fitted render, for `skin`'s reason: every frame set written
   * before the field existed says the same, and a fitted box is measured over
   * the rig's own poses (every animation at `FRAMING_FPS`), padded, rather than
   * stated by anyone.
   */
  pinned?: PinnedViewport;
  /** The colour the frames were cleared to, straight RGBA 0..255. */
  background: RGBA;
  viewport: {
    /** World box, y up, matching Spine's own coordinates. */
    x: number;
    y: number;
    width: number;
    height: number;
    /** Frame pixels per world unit. */
    scale: number;
    pixelWidth: number;
    pixelHeight: number;
  };
  sets: FrameSet[];
}

/** How a given box was given, and what it leaves out — `FramesSidecar.pinned`. */
export interface PinnedViewport {
  by: '--viewport' | '--viewport-from';
  /** Every slot whose drawn geometry reaches past the box, per set, in the order the sets were drawn and the slots first reached past it. */
  outside: Array<{ set: string; slot: string; frames: number[] }>;
}

// ---------------------------------------------------------------------------
// posing
// ---------------------------------------------------------------------------

/** What every drawable has in common, whatever shape it is. */
export interface PieceCommon {
  /**
   * World-space vertex positions, `x, y` per vertex.
   *
   * ⭐ The one field the framing code reads, and the reason it is spelled the
   * same on both shapes: a union over "every posed point" is a loop over this
   * array in steps of two, and it does not need to know whether four numbers are
   * a rectangle's corners or two hundred are a mesh's hull.
   */
  world: number[];
  /** Slot colour x attachment colour, straight alpha, 0..1. */
  tint: [number, number, number, number];
  /**
   * The slot's **dark** colour, 0..1 — the other half of Spine's two-colour
   * tint, and absent on every slot that does not carry one.
   *
   * ⚠️ Absent rather than black, and that is the whole of why it is optional.
   * `(0, 0, 0)` is a real dark colour and the identity of the blend, so the two
   * spellings paint the same pixels — but the runtime distinguishes them
   * (`SlotPose.darkColor` is `null` for a slot with no `dark`, and `Slot`'s
   * constructor never allocates one), and a piece that carried a black default
   * would take the two-colour path for every slot in every frame this
   * repository renders. `undefined` is what keeps the arithmetic below off the
   * ordinary case (issue #690).
   *
   * Three channels, not four: the format writes `dark` as `rrggbb` and
   * `RGBA2Timeline` stores three dark channels. The alpha a shader reads on the
   * dark colour is not a colour at all — see `tintChannel`.
   */
  dark?: [number, number, number];
  /** The slot this was drawn for — what per-slot tracking is keyed by. */
  slot: string;
  /** The atlas page name this samples, so a multi-page atlas resolves. */
  page: string;
  /**
   * What a **texture-only** substitution needs to re-seat this piece on another
   * atlas — see `PieceTexture`.
   *
   * Absent unless `piecesOf` was asked for it, because it is a second copy of the
   * UVs and every posed frame of every set is held in memory at once.
   */
  texture?: PieceTexture;
  /**
   * The page-UV rectangle this piece may sample, and no further — see `UvWindow`.
   *
   * Absent on a piece posed from its own atlas: its UVs cover its own region's
   * rectangle exactly, so there is nothing to fence off. It is set by
   * `substituteTexture`, where the piece's geometry spans an area of the original
   * drawing that the substituting atlas may have trimmed away.
   */
  uvWindow?: UvWindow;
}

/**
 * One piece's texture coordinates in the **original drawing's** own space, plus
 * the name of the region it came from.
 *
 * ## Why original-art space and not the page's
 *
 * Page UVs are useless for substitution: they name texels in *this* atlas, and
 * two atlases pack the same drawing at different places, at different scales, and
 * possibly rotated or trimmed. What survives a repack is the position **within the
 * drawing** — the coordinate an artist would point at — so that is the space a
 * substitution goes through. `(0, 0)` is the untrimmed drawing's top-left corner
 * and `(1, 1)` its bottom-right, which is the convention `spine-core`'s own
 * `MeshAttachment.computeUVs` reads its `regionUVs` in; going through it is what
 * lets `substituteTexture` reuse the runtime's rotation and trim arithmetic
 * instead of holding a second opinion about it.
 */
export interface PieceTexture {
  /** The atlas region this piece samples, by the name its atlas gives it. */
  region: string;
  /** Original-art coordinates, `u, v` per vertex, parallel to `uvs`. */
  artUvs: number[];
  /**
   * A clipped piece only (`Mesh.source`): the original-art UVs of each drawn
   * triangle's SOURCE triangle, six numbers per drawn triangle, parallel to
   * `Mesh.source.uvs` — what `substituteTexture` re-seats the source map with.
   */
  sourceArtUvs?: number[];
}

/** A page-UV rectangle outside which a piece samples nothing. */
export interface UvWindow {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

/** Options for `piecesOf` and the samplers that call it. */
export interface PoseOptions {
  /** Also record each piece's original-art UVs — see `PieceTexture`. */
  texture?: boolean;
  /**
   * Also record every bone's world transform — see `BoneSnapshot` and
   * `Frame.bones`. Off by default: nothing that draws needs it, and the
   * one instrument that does (`bonedist.ts`) needs it on every frame.
   */
  bones?: boolean;
  /**
   * Also record every slot's attachment geometry, whole — see `AttachmentPose`
   * and `Frame.attachments` (issue #864). Off by default for `bones`' reason:
   * nothing that draws reads it, and `render --geometry` is the one caller.
   *
   * ⭐ **It is not filtered by `slots`/`hidden` and not cut by a clip.** Those
   * are statements about which pixels are drawn; the geometry is a statement
   * about where the pose put each attachment, and it is the same pose whatever
   * a picture of it leaves out.
   */
  geometry?: boolean;
  /**
   * Pose under this skin, by the name the skeleton declares for it.
   *
   * ⭐ Absent means **no skin is set at all**, which is spine-core's own initial
   * state (`Skeleton.skin` is null) and resolves every slot through
   * `SkeletonData.defaultSkin` alone. That is not the same claim as "the default
   * skin was chosen": it is the absence of a choice, and the two are spelled
   * differently everywhere this travels — the frames sidecar omits the field
   * rather than writing `"default"` into it (issue #571).
   *
   * ⚠️ Read by the SAMPLERS, never by `piecesOf`, which is handed a skeleton
   * somebody else already posed; handing it one is refused by name rather than
   * ignored, because a skin quietly dropped here is exactly the silence this
   * whole flag exists to remove.
   */
  skin?: string;
  /**
   * Draw only these slots, by name (issue #835). `hidden` is the same statement
   * the other way round, and the two together are refused.
   *
   * ⭐ **It is a filter on what is DRAWN, never on what is framed.**
   * `framingViewport` takes both off before it samples, so a frame with `head`
   * hidden sits on exactly the pixel grid of the frame with it and the two
   * overlay — which is the whole use of the picture: *which part is this pixel*
   * is answered by the difference between two frames of one grid, and a subset
   * re-framed to its own extent would have no second frame to differ from.
   *
   * ⚠️ Applied in `piecesOf`, where the pieces are collected, and resolved there
   * against the posed skeleton's own slots and skin — see `slotSubsetOf` — so a
   * name that draws nothing is refused by name rather than quietly matching no
   * piece.
   */
  slots?: string[];
  /** Draw every slot but these — see `slots`. */
  hidden?: string[];
  /**
   * Pose every attachment whole, with no clipping attachment applied — set by
   * `framingViewport` and by nothing that draws.
   *
   * ⭐ **The framing box counts what a clip removes**, for the reason it counts
   * what `--slot`/`--hide` leave out: the box is a property of the shot, and a
   * clip is a statement about which pixels of it are drawn. Framed on the
   * clipped geometry, a rig's viewport would move the moment a clip is added or
   * keyed, and every frame set already on disk for it — `frames.json`'s world
   * box, the grid `check` compares on — would stop describing the frames a
   * second render writes.
   */
  unclipped?: boolean;
  /**
   * The world the physics answers, in time — `render --environment` (issue
   * #1416, `./environment.ts`): each step's change set before the step that
   * poses the first frame at or after its `t`, on the sampler's own frame grid,
   * on whichever poser draws. Absent, nothing is set and every pose is the one
   * it always was.
   *
   * ⭐ **It is part of the shot, so the framing reads it.** Unlike `slots` and
   * `hidden`, which say which pixels are drawn of one pose, an environment
   * changes the pose — a gust can carry a coat past the box a still rig fills —
   * so `framingViewport` keeps it and the box holds what the frames draw.
   */
  environment?: readonly EnvironmentStep[];
  /** Also record the physics constraints the step that posed each frame stepped — see `Frame.physics` (issue #1467). */
  physics?: boolean;
}

/**
 * Why a slot subset cannot be drawn — `./render_core.ts` declares it, so the
 * spine-core poser and the core poser throw one class (issue #968).
 */
export { SlotSubsetError };

/**
 * A slot subset resolved against a skeleton: which half was asked for, and the
 * names in the skeleton's **draw order** rather than the order they were typed.
 *
 * Draw order because the names are a set and the sidecar records them: `--hide
 * b,a` and `--hide a,b` are one picture, and a sidecar whose bytes depended on
 * the spelling would make two identical frame sets differ.
 */
export interface SlotSubset {
  mode: 'slots' | 'hidden';
  names: string[];
}

/**
 * One bone's world transform in one posed frame.
 *
 * ⚠️ Read off `spine-core`'s own `BonePose` and derived by its own routines —
 * `getWorldRotationX`, `getWorldScaleX` and friends — rather than recomputed
 * from `a b c d` here. A second opinion about what a bone's world rotation *is*
 * is exactly what an instrument comparing two skeletons must not carry: it
 * would show up as a difference between the two rigs.
 */
export interface BoneSnapshot {
  name: string;
  /** World origin. */
  worldX: number;
  worldY: number;
  /**
   * The world matrix's linear part, `[a b][c d]`. **Complete**: rotation, scale
   * and shear all live in these four numbers, and they are dimensionless — they
   * map a local offset to a world offset, both in world units.
   */
  a: number;
  b: number;
  c: number;
  d: number;
  /** The direction the bone points, in degrees CCW. */
  rotationX: number;
  /** The y axis's own direction — the pair with `rotationX` is where shear shows. */
  rotationY: number;
  /** Magnitudes, always positive. */
  scaleX: number;
  scaleY: number;
}

export interface Quad extends PieceCommon {
  kind: 'region';
  /** World-space corners, in spine-core's region order: bl, ul, ur, br (verified against computeWorldVertices — the 2026-09-03 run reconstructed this from measurement after the old comment cost it days). */
  world: number[];
  /** Page UVs for the same four corners. */
  uvs: ArrayLike<number>;
}

/**
 * A posed mesh attachment: world vertices, page UVs, and the triangulation.
 *
 * The vertices arrive from `MeshAttachment.computeWorldVertices`, which is the
 * runtime's own routine and therefore the only place the weighting and deform
 * arithmetic lives. Reimplementing either here would give `check` a second
 * opinion about where a vertex is, and a second opinion is exactly what a gate
 * must not have.
 */
export interface Mesh extends PieceCommon {
  kind: 'mesh';
  /** Page UVs, `u, v` per vertex, parallel to `world`. */
  uvs: ArrayLike<number>;
  /** Vertex index triplets. */
  triangles: ArrayLike<number>;
  /**
   * A piece a clip cut only: for each drawn triangle, in triangle order, the
   * SOURCE triangle it was cut from — its three world corners and their page
   * UVs, six numbers each per drawn triangle (`ClipSource`). The rasteriser
   * samples such a triangle's pixels at the source triangle's affine UV map,
   * so the picture does not depend on which convex pieces the clipper cut
   * (issue #964). Absent on every piece no clip cut, whose path is unchanged.
   */
  source?: ClipSource;
}

/** The source triangles of a clipped piece's drawn triangles — see `Mesh.source`. */
export interface ClipSource {
  /** Three world corners (`x, y` each) per drawn triangle. */
  world: number[];
  /** The page UVs of those corners, parallel to `world`. */
  uvs: number[];
}

/** One drawable in a posed frame. */
export type Piece = Quad | Mesh;

export interface Frame {
  /** Index within the sampled sequence — the number in `f0000.png`. */
  index: number;
  time: number;
  /**
   * Everything the frame draws, in draw order.
   *
   * Named `pieces` rather than `quads` since meshes joined it: a mesh is not a
   * quad, and a field that says otherwise is the kind of name a reader trusts
   * and then indexes `world[6]` through.
   */
  pieces: Piece[];
  /**
   * Every bone's world transform at this frame — present only when
   * `PoseOptions.bones` asked for it, so a renderer neither pays for it nor
   * sees a field it would have to ignore.
   *
   * ⭐ It rides on `Frame` rather than being sampled by a loop of its own so
   * that the ladder's stage 3 and the reference frames step a skeleton through
   * **one** recipe. `sampleAnimation`'s stepping order — `state.update`,
   * `state.apply`, `skeleton.update`, `updateWorldTransform(Physics.update)`,
   * and `Physics.reset` on the first frame alone — is a sequence two
   * implementations would drift on, and a per-frame pose comparison that
   * drifted from the renderer would report the drift as a difference between
   * the two rigs.
   */
  bones?: BoneSnapshot[];
  /**
   * Every slot's attachment as the pose left it, in draw order — present only
   * when `PoseOptions.geometry` asked for it (issue #864).
   *
   * ⚠️ Not `pieces` again. A piece is what gets DRAWN: `--slot`/`--hide` remove
   * pieces and a clip replaces one with the clipper's own triangle list, whose
   * vertices are not the attachment's and are not numbered like them. A
   * consumer comparing a triangle's edges across frames needs vertex `i` to be
   * the same vertex in every frame, so these are the attachment's own vertices,
   * whole, for every slot that shows a region or a mesh.
   *
   * Read off the same skeleton at the same step as `pieces` and `bones`, which
   * is what puts it on render's frame grid by construction rather than by a
   * second derivation of it.
   */
  attachments?: AttachmentPose[];
  /**
   * The physics constraints the step that posed this frame stepped, by name in
   * code-unit order — present only when `PoseOptions.physics` asked for it
   * (issue #1467). See `Posed.physics` for what counts as a step.
   */
  physics?: string[];
}

/**
 * One slot's region or mesh attachment in one posed frame (issue #864).
 *
 * `vertices` come from the runtime's own `computeWorldVertices` over the whole
 * attachment — the call `pieceOf` makes, through the one helper both share —
 * so skinning and deform live in spine-core and nowhere here.
 */
export interface AttachmentPose {
  slot: string;
  /** The attachment's own name, which is what a deform or attachment timeline keys. */
  attachment: string;
  /**
   * World positions, `x, y` per vertex, **y up**. A region's four corners are in
   * spine-core's order — bottom-left, top-left, top-right, bottom-right — and a
   * mesh's vertices in the attachment's own order, so index `i` names the same
   * vertex in every frame.
   */
  vertices: number[];
  /** Slot colour x attachment colour, straight alpha, 0..1 — the piece's `tint`, by the same arithmetic. */
  color: [number, number, number, number];
}

/** Where the world sits in a frame: the four world numbers plus the scale. */
export interface Viewport {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** Frame pixels per world unit. */
  scale: number;
  /** Frame size in pixels. */
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// what a render and a check read off a candidate besides its pose (issue #1014)
// ---------------------------------------------------------------------------
//
// ⭐ `render` and `check` read a handful of facts off the candidate before and
// beside the pose: the animation and skin names their flags are checked
// against, the slot subset's roster, whether a stage is declared, the bone
// tree `check` draws its chains from, the skin roster the framing reads, and
// the atlas pages the rasteriser samples. Until issue #1014 every one of them
// came off the skeleton spine-core had parsed, so a rigc build the core poses
// still loaded and ran the runtime before its poser was chosen. Now the choice
// comes first (`loadCandidate`), and a build the core poses reads each fact
// where it is written: the names, the tree, the subset's roster and the stage
// off the skeleton's own JSON (`skeletonFacts`), the pages off rigc's atlas
// reader, and the skin roster off the model document (`coreSkinRoster` in
// `./render_core.ts`). Every one of those readings was measured equal to the
// spine-core reading it replaces on every input the tree carries — the
// nineteen built corpus rows and the twelve editor exports (the PR of #1014
// carries the counts). A Spine export, `--poser spine` and a fallback the
// poser line names load spine-core as before and read every fact off it.
//
// Since issue #1020 a build the core poses reads what its model document
// states off the document (`coreFacts`): the bone tree, the slot list and the
// subset's roster, and the page images by the names its `pages` section gives
// — so with a `rigc-compiled/2` document the atlas file is not needed at all.
// Since issue #1026 a `rigc-compiled/3` document also states what only the
// Spine files held — the order the animations and skins are listed in (the
// emitter's, not the model's), the stage, and each page's `scale:` line — so
// a build the core poses reads every fact off its document. A `/2` or `/1`
// document's reader still takes those off `skeleton.json` and the atlas, and
// the poser line says so (`unstatedClause`).

/** What `render` and `check` read off a candidate's skeleton besides its pose. */
export interface SkeletonFacts {
  /** Every animation name, in the skeleton's own order. */
  readonly animations: readonly string[];
  /** Every skin name, in the skeleton's own order. */
  readonly skins: readonly string[];
  /** Whether the header states a numeric `width` and `height` — a setup stage (issue #714). */
  readonly declaresStage: boolean;
  /** Every bone in declaration order, and its parent's name. */
  readonly bones: ReadonlyArray<{ name: string; parent: string | null }>;
  /** Every slot in declaration order, and the bone it hangs from. */
  readonly slots: ReadonlyArray<{ name: string; bone: string }>;
  /** `slotSubsetOf` over this skeleton — refused by `SlotSubsetError`. */
  subset(opts: Pick<PoseOptions, 'slots' | 'hidden'> | undefined, skin: string | undefined): SlotSubset | undefined;
  /**
   * The `scale:` lines the candidate's atlas declares (`atlasScales`), or, for
   * a build posed from a `rigc-compiled/3` document, the ones its pages state
   * (issue #1026); `null` where neither was read — a `/2` or `/1` build drawn
   * with its atlas gone (issue #1020). `check`'s texture note reads it.
   */
  readonly atlasScales: readonly number[] | null;
}

type JsonObject = Record<string, unknown>;

/** A JSON value as an object, or an empty one where it is not one. */
function objectOf(value: unknown): JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as JsonObject) : {};
}

/** A JSON value as a list of objects, or an empty list where it is not one. */
function objectsOf(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.map(objectOf) : [];
}

/**
 * The same facts off the skeleton's own JSON — a candidate the core poses
 * (issue #1014), whose skeleton spine-core never loads.
 *
 * Each is the file's own statement, read in the file's order: the animation
 * names are the keys of `animations` (the order the parser iterates them), the
 * skins `skins[].name` (the default skin the one named `default`), a slot's
 * carriers the skins whose `attachments` give it at least one entry, the tree
 * `bones[]` and `slots[]`, and the stage `skeleton.width`/`height`. The core
 * poses only a rigc build whose `skeleton.json` hashes to the digest its model
 * document records, so the file read here is the one `build` wrote and the
 * gate round-tripped.
 */
export function skeletonFacts(skeletonText: string, atlasText: string | null): SkeletonFacts {
  const root = objectOf(JSON.parse(skeletonText));
  const skins = objectsOf(root.skins);
  const slots = objectsOf(root.slots).map((slot) => ({ name: String(slot.name), bone: String(slot.bone) }));
  const header = objectOf(root.skeleton);
  const roster: SubsetRoster = {
    declared: slots.map((slot) => slot.name),
    carriers: (slot) => skins.filter((skin) => Object.keys(objectOf(objectOf(skin.attachments)[slot])).length > 0).map((skin) => String(skin.name)),
    defaultSkin: skins.some((skin) => skin.name === 'default') ? 'default' : null,
  };
  return {
    atlasScales: atlasText === null ? null : atlasScales(atlasText),
    animations: Object.keys(objectOf(root.animations)),
    skins: skins.map((skin) => String(skin.name)),
    declaresStage: typeof header.width === 'number' && typeof header.height === 'number',
    bones: objectsOf(root.bones).map((bone) => ({ name: String(bone.name), parent: typeof bone.parent === 'string' ? bone.parent : null })),
    slots,
    subset: (opts, skin) => subsetOver(roster, opts, skin),
  };
}

/**
 * Each animation's duration off the skeleton's own JSON, in the file's order —
 * what `rosterDifference` holds a model document's durations to without
 * loading the skeleton through spine-core (issue #1014).
 *
 * ⚠️ Skeleton JSON carries no duration, so this is the parser's derivation of
 * one, and it is stated as measured rather than as read: the LAST key time of
 * each timeline, the largest of them, held as a float32 — equal to
 * spine-core's `Animation.duration` on every animation of every input the tree
 * carries (the PR of #1014). The timelines are the ones `walkTimelines` walks,
 * the walk `A05` and `A12` stand on, so a group it did not descend would be
 * missing from both.
 */
function skeletonDurations(root: JsonObject): Array<{ name: string; duration: number }> {
  return Object.entries(objectOf(root.animations)).map(([name, animation]) => {
    let duration = 0;
    walkTimelines({ animations: { [name]: animation } }, (_path, _kind, _timeline, keys) => {
      if (keys.length === 0) return;
      const last = objectOf(keys[keys.length - 1]);
      duration = Math.max(duration, Math.fround(typeof last.time === 'number' ? last.time : 0));
    });
    return { name, duration };
  });
}

/**
 * Every page named, read from `atlasDir` by that name — the images a candidate
 * is drawn from, whichever poser draws it. A page that is not there is
 * `absent`'s refusal, handed the page's absolute path (issues #1033, #1042):
 * left to `readPlate`, it surfaced as an ENOENT and a stack. A page that is
 * there and is not a PNG says so itself (`readPlate`).
 */
function pagesAt(names: readonly string[], atlasDir: string, absent: (page: string) => Error): Map<string, Plate> {
  const pages = new Map<string, Plate>();
  for (const name of names) {
    const path = join(atlasDir, name);
    if (!existsSync(path)) throw absent(resolve(path));
    pages.set(name, readPlate(path));
  }
  return pages;
}

/**
 * A candidate with no atlas beside it that has to be read through one —
 * refused naming the file and why (issue #1020).
 *
 * A rigc build whose model document states where each region sits on its page
 * (`rigc-compiled/2`, the `pages` section) is drawn by the core without its
 * atlas. Everything else reads one: a Spine export, `--poser spine`, a
 * `rigc-compiled/1` document, and a build the core refuses and spine-core
 * draws instead. A class of its own so `cli.ts` refuses it as an invocation
 * (exit 2, nothing written), as it refuses a missing atlas on an export.
 */
export class CandidateAtlasError extends Error {}

/** The refusal for a candidate that has to be read through an atlas it does not have. */
function atlasAbsent(atlasPath: string, label: string, why: string): CandidateAtlasError {
  return new CandidateAtlasError(
    `nothing at ${atlasPath}: ${label} is drawn through its atlas (${why}). ` +
      'Only a rigc build whose skeleton.model.json is a rigc-compiled/2 or /3 document, posed by the core, is drawn ' +
      'without one — it states where each region sits on its page',
  );
}

/**
 * A candidate whose skeleton spine-core cannot load against the atlas beside
 * it — refused naming both files, why the runtime was drawing them, and what
 * the runtime could not resolve, in its own words (issue #1033).
 *
 * On a rigc build this is a directory whose files are not one build: a
 * `skeleton.json` or a `skeleton.atlas` from another build put beside this
 * one's `skeleton.model.json`. The core refuses the pair first (the digest, or
 * the atlas's pages, on the poser line's reason), the fallback hands it to
 * spine-core, and the runtime stops at the first name it cannot resolve —
 * which surfaced as its own uncaught error and a stack. A class of its own so
 * `cli.ts` refuses it as an invocation (exit 2, nothing written), as it
 * refuses a missing atlas on an export: the files the command was pointed at
 * have to change, not the rig.
 *
 * Since issue #1042 it is also `bonedist`'s (and `bench --bones`'), on either
 * side (`loadPosedSkeleton`), and the refusal for a page a candidate is drawn
 * from that is not there on every poser's path — the core's included, where a
 * build moved whole away from where it was built died on `readPlate`'s ENOENT.
 */
export class CandidatePairError extends Error {}

/** Where a candidate's files sit, as the refusals below name them: the atlas, and the directory when it holds a model document. */
function pairPlace(paths: { skeleton: string; atlas: string } | null): { atlas: string; build: string | null } {
  const dir = paths === null ? null : dirname(resolve(paths.skeleton));
  return { atlas: paths === null ? 'the atlas handed over with it' : resolve(paths.atlas), build: dir !== null && existsSync(join(dir, MODEL_DOCUMENT_FILE)) ? dir : null };
}

/** What a directory whose files are not one build is told to do. */
function notOneBuild(dir: string): string {
  return (
    `${dir} is not one build: ${MODEL_DOCUMENT_FILE}, skeleton.json and skeleton.atlas are written together by one \`rigc build\`, ` +
    "and these are not one build's — build it again, or put that build's own files back beside each other"
  );
}

/**
 * The refusal for a skeleton the runtime could not load against its atlas:
 * `runtime` is the runtime's own message, and `does` what spine-core was
 * loading it to do — `draws` for `render` and `check`, `poses` for a command
 * that reads the posed bones and draws nothing (`bonedist`, issue #1042).
 */
function pairRefusal(
  label: string,
  paths: { skeleton: string; atlas: string } | null,
  why: string,
  runtime: string,
  does: 'draws' | 'poses' = 'draws',
): CandidatePairError {
  const { atlas, build } = pairPlace(paths);
  const head = `${label} does not load against ${atlas}: spine-core ${does} this pair (${why}) and could not resolve it — ${JSON.stringify(runtime)}. `;
  return new CandidatePairError(head + (build === null ? 'The skeleton and the atlas are not one pair: the atlas has to be the one the skeleton was exported or built with' : notOneBuild(build)));
}

/**
 * The refusal for a page a candidate is drawn from that is not there — the
 * page's path is relative to the directory of the file that names it, so the
 * file was written somewhere else. What the last clause may claim depends on
 * what is known about the directory:
 *
 * - an export (no model document): only that the page has to be there;
 * - a rigc build whose files the core REFUSED (issue #1033): an atlas copied
 *   from another build's directory, and the directory is not one build — the
 *   core's own reason, on the poser line's words, says so;
 * - a rigc build the core ACCEPTED, or one `--poser spine` never asked the
 *   core about (issue #1042): the build was moved or copied away from where it
 *   was built. "Not one build" would be a guess there, and on a build moved
 *   whole — measured — a false one.
 *
 * `by` is the file that names the page (`null`: the atlas), `draws` what is
 * drawn from it.
 */
function pageRefusal(
  page: string,
  paths: { skeleton: string; atlas: string } | null,
  why: string,
  reading: { by: string | null; draws: string; refusedBuild: boolean },
): CandidatePairError {
  const { atlas, build } = pairPlace(paths);
  // The poser line's reason, unless it is only the document's path — which the sentence has just named.
  const because = why === reading.by ? '' : ` (${why})`;
  const head =
    `nothing at ${page}: ${reading.by ?? atlas} names it as a page, and ${reading.draws}${because}. ` +
    `A page path is relative to the ${reading.by === null ? "atlas's own" : "build's"} directory`;
  const tail =
    build === null
      ? ', and the page has to be there'
      : reading.refusedBuild
        ? `, so an atlas copied from another build's directory names pages that are not here. ${notOneBuild(build)}`
        : `, so a build moved or copied away from the directory it was built in names pages that are not here — ` +
          'build it again where it is, or build it with --copy-images, which writes its pages beside it';
  return new CandidatePairError(head + tail);
}

/** A candidate as `render` and `check` read it: the posers, the facts and the pages (issue #1014). */
export interface Candidate {
  choice: PoserChoice;
  facts: SkeletonFacts;
  pages: Map<string, Plate>;
}

/**
 * Load a candidate for `render` or `check`, choosing its poser FIRST (issue
 * #1014): a rigc build the core poses reads its facts off its model document
 * and its own JSON (`coreFacts`), its page images by the names the
 * document's `pages` gives (a `rigc-compiled/1` document's, by its atlas's)
 * and its skin roster off the document, and spine-core is never loaded for
 * it; `input.atlasText` is `null` where the atlas file is not there, which only
 * a `rigc-compiled/2` document the core poses is drawn without (issue #1020 —
 * anything else is refused, `CandidateAtlasError`); anything else — a Spine export,
 * `--poser spine`, a candidate handed over as text (`paths` null, `unplaced`
 * the reason) — is loaded through spine-core as `posableFromText` always
 * loaded it. The choice's spine-core poser stays unloaded until something
 * reads it, which on a rigc build is a fallback the poser line names.
 *
 * `--poser core` on an input that cannot carry it is NOT refused here: the
 * caller says it where it always has (`refuseUnchosen`), after the flags that
 * refuse before it.
 */
export function loadCandidate(
  input: { skeletonText: string; atlasText: string | null; atlasDir: string; label: string },
  paths: { skeleton: string; atlas: string } | null,
  forced: PoserName | undefined,
  options: { make?: MakeCorePoser; unplaced?: string } = {},
): Candidate {
  let data: SkeletonData | null = null;
  let choice: PoserChoice | null = null;
  // `null` is an atlas file that is not there (issue #1020): a candidate the core draws from its document needs none, and anything read through one is refused naming the file before the runtime is touched.
  const atlasText = (why: string): string => {
    if (input.atlasText === null) throw atlasAbsent(paths?.atlas ?? '(no atlas)', input.label, why);
    return input.atlasText;
  };
  // A pair the runtime cannot load — a skeleton.json or an atlas from another build beside this one's document — is
  // refused by name rather than surfacing the runtime's own throw and stack (issue #1033); `spineSkeletonData` is
  // where the catch is.
  // Under `--poser core` the runtime is loaded only for the facts the flags are checked against, and nothing would be
  // drawn through it: the refusal that is true there is the flag's, the one `refuseUnchosen` would have said next.
  const refusing = (refusal: CandidatePairError): Error =>
    forced === 'core' && choice !== null && choice.core === null ? new PoserChoiceError(`--poser core: ${choice.why}`) : refusal;
  const spineLoad = (text: string, why: string): SkeletonData =>
    spineSkeletonData(input.skeletonText, text, (runtime) => refusing(pairRefusal(input.label, paths, why, runtime)));
  const spineData = (): SkeletonData => {
    if (data === null) {
      const why = choice === null || choice.core !== null ? 'a fallback from the core poser' : choice.why;
      const text = atlasText(why);
      requireSpineRuntime(input.label, why);
      data = spineLoad(text, why);
    }
    return data;
  };
  const chosen =
    paths === null
      ? { choice: posersOver(forced, null, forced === 'spine' ? '--poser spine' : (options.unplaced ?? 'no path to find a model document beside'), spineData), document: null }
      : choosePosers(paths.skeleton, paths.atlas, input.atlasText, forced, spineData, options.make ?? corePoser);
  choice = chosen.choice;
  if (choice.core !== null && chosen.document !== null) {
    // A rigc-compiled/2 document names its pages; a /1 document is posed only with its atlas beside it, which names them (`choosePosers`).
    const named = chosen.document.pageNames;
    const names = named ?? parseAtlasText(atlasText(choice.why)).pages.map((page) => page.name);
    // A page the build names that is not here is a build moved away from where it was built (issue #1042): the
    // core accepted these files as one build, so the refusal does not say they are not one.
    const by = named === null || paths === null ? null : join(dirname(resolve(paths.skeleton)), MODEL_DOCUMENT_FILE);
    const reading = { by, draws: 'the core draws this build from it', refusedBuild: false };
    const accepted = choice.why;
    const pages = pagesAt(names, input.atlasDir, (page) => pageRefusal(page, paths, accepted, reading));
    return { choice, facts: coreFacts(input.skeletonText, input.atlasText, choice.core, chosen.document), pages };
  }
  const text = atlasText(choice.why);
  requireSpineRuntime(input.label, choice.why);
  // `posableFromText`'s two steps, in its order — every page the atlas declares, then the skeleton — each refusing
  // by name where the pair is not one: a page that is not there (`pageRefusal`), a skeleton the runtime cannot load
  // against the atlas (`spineLoad`). The directory is called "not one build" only where the core refused its files —
  // `--poser spine` never asked the core, and a build moved whole is one build whose pages are elsewhere.
  const reading = { by: null, draws: 'spine-core draws this pair through that atlas', refusedBuild: forced !== 'spine' };
  const why = choice.why;
  const pages = pagesAt(
    atlasPageNames(text),
    input.atlasDir,
    (page) => refusing(pageRefusal(page, paths, why, reading)),
  );
  data = spineLoad(text, choice.why);
  return { choice, facts: spineFacts(data, text), pages };
}

/**
 * A candidate's facts when the core poses it (issue #1020): what the model
 * document states, read from it — the bone tree and the slot list (the core
 * poser's own, which `rosterDifference` held to the Spine file's before the
 * core was chosen) and the slot subset's roster (`coreDocumentFacts`). Since
 * issue #1026 a `rigc-compiled/3` document states the rest too — the order
 * the animations and skins are listed in (the editor's, `editorOrder`),
 * whether a stage is declared (`stage`) and its pages' `scale:` lines — and
 * nothing is read off `skeleton.json` or the atlas. A `/2` or `/1` document
 * states none of those, so they are read where they were before: the orders
 * and the stage off the skeleton's own JSON, the scale lines off the atlas
 * (`null` with it gone) — and the poser line says so (`unstatedClause`).
 */
function coreFacts(skeletonText: string, atlasText: string | null, poser: Poser, document: CoreDocumentFacts): SkeletonFacts {
  const unstated = (): Pick<SkeletonFacts, 'atlasScales' | 'animations' | 'skins' | 'declaresStage'> => {
    const spine = skeletonFacts(skeletonText, atlasText);
    return { atlasScales: spine.atlasScales, animations: spine.animations, skins: spine.skins, declaresStage: spine.declaresStage };
  };
  const read = document.stated === null ? unstated() : { ...document.stated, atlasScales: document.stated.scales };
  return {
    atlasScales: read.atlasScales,
    animations: read.animations,
    skins: read.skins,
    declaresStage: read.declaresStage,
    bones: poser.bones,
    slots: poser.slots,
    subset: (opts, skin) => subsetOver(document.subset, opts, skin),
  };
}

// ---------------------------------------------------------------------------
// the posing seam (issue #965, step 3a of #380)
// ---------------------------------------------------------------------------
//
// ⭐ Everything this file reads off a posed skeleton goes through one
// interface, `Poser`, and the samplers below are written against it alone. The
// implementation behind it today is spine-core's (`spinePoser`, further down);
// the core-backed poser of issue #968 is a SECOND implementation of the same
// interface, handed to the same samplers, rather than a rewrite of them. What
// the interface fixes is exactly what a consumer of a posed frame reads:
//
// - the setup pose, under a skin or under none;
// - an animation's frames at `i/fps` for `i = 0..count`, one continuous
//   trajectory stepped once per frame (the stepping recipe is the
//   implementation's; the schedule — which `i`, what `count`, what time a
//   frame is filed under — is the sampler's, and stays here);
// - per posed frame: the pieces in draw order (world vertices, page UVs,
//   triangles, tint, dark, page, clip output), the bone snapshots, and every
//   slot's whole attachment geometry;
// - the rest table, and the names a geometry file and a slot subset read.
//
// The framing samples are not a fourth entry: `framingViewport` is the same
// animation entry at `FRAMING_FPS` with the clip off.
//
// 🔒 What stays spine-core's and outside the seam, deliberately: an export's
// atlas (`posableFromText`'s pages, and `substituteTexture`'s region lookup on
// anything spine-core poses — a rigc build the core poses reads both through
// rigc's own reader since issue #1020) and `posedNumbersOf`, which `validate.ts` calls on a spine-core
// skeleton it stepped itself (A10's runtime supplier), so the round trip keeps its spine-core
// entry whatever poses the renders.

/** What a sampler hands a posed frame's draw walk — `PoseOptions` with the subset already resolved. */
export interface DrawOptions {
  /** The slots drawn, resolved against the posed skeleton (`slotSubsetOf`); `undefined` draws every slot. */
  subset: SlotSubset | undefined;
  /** Every attachment whole, no clip applied — the framing box's reading. */
  unclipped: boolean;
  /** Also record each piece's original-art UVs — see `PieceTexture`. */
  texture: boolean;
}

/**
 * One posed moment, readable only while the `Poser` call that produced it is
 * running: an implementation may step one skeleton in place, so a reader takes
 * what it needs before the next frame is posed.
 */
export interface Posed {
  /** The drawables in draw order — see `piecesOf` for the walk and the clip. */
  pieces(draw: DrawOptions): Piece[];
  /** Every bone's world transform, in the skeleton's declaration order. */
  bones(): BoneSnapshot[];
  /** Every slot's region or mesh attachment, whole, in the posed draw order. */
  attachments(): AttachmentPose[];
  /**
   * The physics constraints the step that posed this moment stepped, by name in
   * code-unit order (issue #1467). A constraint is stepped when, after a step
   * that moved the skeleton's clock, its own clock reads the skeleton's: the
   * physics update sets it there, and every way of not running — inactive, a
   * mix of 0, the step skipped — leaves it behind. Read off the posed state on
   * both posers, never off which call was made, so a step removed reads 0. The
   * setup pose and a reset pose, where the clock has not moved, step none.
   */
  physics(): string[];
}

/**
 * The posing seam: one skeleton, posed on demand.
 *
 * Named for what it does rather than for the runtime behind it, because the
 * point of the name is that there are two: `spinePoser` today, the core's at
 * #968. Every sampler, the framing, the geometry export and the non-finite
 * sentence take one (or a `SkeletonData`, which they wrap in `spinePoser`).
 */
export interface Poser {
  /** Every animation, in declaration order, with its duration in seconds. */
  readonly animations: ReadonlyArray<{ name: string; duration: number }>;
  /** Every bone in declaration order, and its parent's name. */
  readonly bones: ReadonlyArray<{ name: string; parent: string | null }>;
  /** Every slot in declaration order, and the bone it hangs from. */
  readonly slots: ReadonlyArray<{ name: string; bone: string }>;
  /** `slotSubsetOf` against this skeleton posed under `skin` — refused by `SlotSubsetError`. */
  subset(opts: Pick<PoseOptions, 'slots' | 'hidden'> | undefined, skin: string | undefined): SlotSubset | undefined;
  /** The setup pose under `skin` (absent: no skin set at all). */
  setup(skin: string | undefined): Posed;
  /**
   * Animation `name` under `skin`, not looping: `visit(i, posed)` for every
   * `i` from 0 to `count`, the pose at `i/fps`. The caller has checked `name`.
   * `environment(i)`, when given, is the change to the world the physics
   * answers set before the step that poses frame `i` (issue #1416).
   */
  animation(name: string, skin: string | undefined, fps: number, count: number, visit: (index: number, posed: Posed) => void, environment?: (index: number) => EnvironmentChange | undefined): void;
  /** The rest table for the (slot, attachment) pairs `shown` holds — see `AttachmentRest`. */
  rest(skin: string | undefined, shown: readonly AttachmentPose[][]): AttachmentRest[];
}

/**
 * What every sampler takes: a poser, or spine-core's parsed skeleton, which is
 * posed through `spinePoser` — the seam's (`./render.ts` declares the same
 * union over the runtime's own `SkeletonData`).
 */
export type PoseSource = Poser | SkeletonData;

/**
 * Whether a pose source is a `Poser` — told by the seam's own entries rather
 * than by `instanceof SkeletonData`, which reads the runtime's class and so
 * reached spine-core on every sample a rigc build took through the core
 * (issue #1014). A parsed skeleton carries none of the three.
 */
function isPoser(source: PoseSource): source is Poser {
  const seam = source as Partial<Poser>;
  return typeof seam.setup === 'function' && typeof seam.animation === 'function' && typeof seam.rest === 'function';
}

function poserOf(source: PoseSource): Poser {
  return isPoser(source) ? source : spinePoser(source);
}

/** A sampler's `PoseOptions` as a draw walk reads them, the subset resolved once, on the first frame posed. */
function drawResolver(poser: Poser, opts: PoseOptions | undefined): () => DrawOptions {
  let draw: DrawOptions | undefined;
  return () => {
    draw ??= { subset: poser.subset(opts, opts?.skin), unclipped: opts?.unclipped === true, texture: opts?.texture === true };
    return draw;
  };
}

/** One frame off one posed moment, with what `opts` asked to record beside the pieces. */
function frameOf(index: number, time: number, posed: Posed, draw: DrawOptions, opts: PoseOptions | undefined): Frame {
  return {
    index,
    time,
    pieces: posed.pieces(draw),
    ...(opts?.bones ? { bones: posed.bones() } : {}),
    ...(opts?.geometry ? { attachments: posed.attachments() } : {}),
    ...(opts?.physics ? { physics: posed.physics() } : {}),
  };
}

/**
 * Sample one animation at a fixed rate and collect the posed pieces per frame.
 *
 * Frame `i` is the pose at `i/fps`, for `i = 0..round(duration·fps)` — the
 * schedule is this function's; how a pose reaches `i/fps` is the poser's.
 */
export function sampleAnimation(source: PoseSource, name: string, fps: number, opts?: PoseOptions): Frame[] {
  const poser = poserOf(source);
  const animation = poser.animations.find((a) => a.name === name);
  if (!animation) {
    throw new Error(
      `no animation "${name}" in this skeleton; it has [${poser.animations.map((a) => a.name).join(', ') || 'none'}]`,
    );
  }
  const step = 1 / fps;
  const count = Math.round(animation.duration * fps);
  const draw = drawResolver(poser, opts);
  const frames: Frame[] = [];
  const visit = (i: number, posed: Posed): void => {
    frames.push(frameOf(i, i * step, posed, draw(), opts));
  };
  // Without an environment the call is the one it always was, so a poser that takes none is asked nothing new.
  if (opts?.environment === undefined) poser.animation(name, opts?.skin, fps, count, visit);
  else poser.animation(name, opts.skin, fps, count, visit, environmentAt(opts.environment, fps));
  return frames;
}

/**
 * The setup pose as a single frame — what a skeleton with **no animation at all**
 * looks like.
 *
 * ⭐ Not a degenerate case to be tolerated: a static rig is a deliverable. The
 * ladder's first rung ships one (`1-weight-and-mass`'s second export), and its
 * whole content is the setup pose.
 */
export function sampleSetupPose(source: PoseSource, opts?: PoseOptions): Frame[] {
  const poser = poserOf(source);
  const posed = poser.setup(opts?.skin);
  return [frameOf(0, 0, posed, drawResolver(poser, opts)(), opts)];
}

/**
 * Every animation of one skeleton at one rate, keyed by the name its frames are
 * filed under. A skeleton with no animation at all contributes its setup pose
 * under `SETUP_POSE_DIR`.
 */
export function sampleAll(source: PoseSource, fps: number, opts?: PoseOptions): Map<string, Frame[]> {
  const poser = poserOf(source);
  const out = new Map<string, Frame[]>();
  if (poser.animations.length === 0) out.set(SETUP_POSE_DIR, sampleSetupPose(poser, opts));
  else for (const animation of poser.animations) out.set(animation.name, sampleAnimation(poser, animation.name, fps, opts));
  return out;
}

// ---------------------------------------------------------------------------
// which poser a render poses through (issue #968, step 3d of #380)
// ---------------------------------------------------------------------------
//
// ⭐ Two implementations of the seam, chosen by what the input carries and
// never guessed: a rigc build writes `skeleton.model.json` beside the Spine
// pair, and that document is what the core poses (`./render_core.ts`); a
// Spine export (`bench/reference/*`, `examples/*/export/*`) has none and
// poses through spine-core. The choice, and the reason for it, is returned
// beside the result so the caller can say it (`render` prints it as its
// `poser` line) — a render that fell back without saying so would be a
// second opinion about the pose that nobody could see.

/** Which implementation of the seam posed a render: rigc's own core, or spine-core. */
export type PoserName = 'core' | 'spine';

/** The `--poser` spellings, in the order the usage lists them. */
export const POSER_NAMES: readonly PoserName[] = ['core', 'spine'];

/**
 * A `--poser` the input cannot carry — `--poser core` on a Spine export, or on
 * a build whose document the core refuses. A class of its own so `cli.ts`
 * refuses it as a usage error (exit 2, nothing written).
 */
export class PoserChoiceError extends Error {}

/** Both posers for one input, and why the core one is or is not there. */
export interface PoserChoice {
  /** What `--poser` asked for, or `undefined` for the input's own choice. */
  forced: PoserName | undefined;
  /** The core poser, or `null` when the input cannot carry it (`why`). */
  core: Poser | null;
  /** For a core poser, the document it poses; otherwise why there is none. */
  why: string;
  /**
   * spine-core's poser over the same skeleton — loaded the first time it is
   * read (issue #1014), which on a rigc build the core poses is a fallback the
   * poser line names, or never.
   */
  readonly spine: Poser;
  /**
   * The skin roster behind `poser` (`SkinRoster`): the model document's for
   * the core poser (`coreSkinRoster`), the parsed skeleton's for spine-core's
   * (`skinRosterOf`) — so a render the core poses reads its framing's roster
   * without loading the runtime (issue #1014).
   */
  rosterOf(poser: Poser): SkinRoster;
}

/** What builds the core poser — `corePoser`, or a planted copy the suite passes (`RC02`, `CH01`). */
export type MakeCorePoser = (modelText: string, atlasText: string, where: string, skeleton: { path: string; bytes: Uint8Array }) => Poser;

/** A skeleton's three rosters, as `rosterDifference` compares them. */
interface SkeletonRosters {
  bones: ReadonlyArray<{ name: string; parent: string | null }>;
  slots: ReadonlyArray<{ name: string; bone: string }>;
  animations: ReadonlyArray<{ name: string; duration: number }>;
  /** Every skin name, in the skeleton's order — the roster `coreSkinRoster` names skins in. */
  skins: readonly string[];
}

/**
 * The rosters off the skeleton's own JSON (issue #1014): its bones, slots and
 * skins as `skeletonFacts` reads them, and its animations' durations as
 * `skeletonDurations` derives them. Before #1014 these were spine-core's parse
 * of the same file; the two were measured equal on every input the tree
 * carries.
 */
function skeletonRosters(skeletonText: string): SkeletonRosters {
  const facts = skeletonFacts(skeletonText, null);
  return { bones: facts.bones, slots: facts.slots, animations: skeletonDurations(objectOf(JSON.parse(skeletonText))), skins: facts.skins };
}

/**
 * The first way a model document's rosters differ from the Spine skeleton they
 * sit beside, or `null` — a document from another build would pose another
 * rig in the same files' name, so it is refused rather than drawn.
 */
function rosterDifference(core: Poser, skeleton: SkeletonRosters): string | null {
  const bones = (list: ReadonlyArray<{ name: string; parent: string | null }>): string => list.map((b) => `${b.name}<${b.parent ?? ''}`).join('|');
  const slots = (list: ReadonlyArray<{ name: string; bone: string }>): string => list.map((x) => `${x.name}@${x.bone}`).join('|');
  if (bones(core.bones) !== bones(skeleton.bones)) return 'the bones (names, parents or order) differ';
  if (slots(core.slots) !== slots(skeleton.slots)) return 'the slots (names, bones or draw order) differ';
  const animations = (list: ReadonlyArray<{ name: string; duration: number }>): string =>
    list.map((a) => `${a.name}=${a.duration}`).sort().join('|');
  if (animations(core.animations) !== animations(skeleton.animations)) return 'the animations (names or durations) differ';
  return null;
}

/**
 * A `PoserChoice` over a core poser (or none) and a skeleton spine-core loads
 * only when something reads its side — `spine`, or the roster behind it.
 */
function posersOver(
  forced: PoserName | undefined,
  core: { poser: Poser; roster: SkinRoster } | null,
  why: string,
  spineData: () => SkeletonData,
): PoserChoice {
  let spine: Poser | null = null;
  let spineRoster: SkinRoster | null = null;
  return {
    forced,
    core: core === null ? null : core.poser,
    why,
    get spine(): Poser {
      spine ??= spinePoser(spineData());
      return spine;
    },
    rosterOf: (poser) => {
      if (core !== null && poser === core.poser) return core.roster;
      spineRoster ??= skinRosterOf(spineData());
      return spineRoster;
    },
  };
}

/**
 * The choice `candidatePosers` and `loadCandidate` share, refusing nothing:
 * the core poser when `skeleton.model.json` sits beside the skeleton, the
 * skeleton's bytes hash to the digest the document records (`spine.sha256`:
 * it is the file that build wrote, not one edited after it), the atlas is the
 * one beside it too, the core reads both and the document's rosters are the
 * skeleton's — read off the skeleton's own JSON (`skeletonRosters`), so
 * choosing loads nothing through spine-core (issue #1014).
 */
function choosePosers(
  skeletonPath: string,
  atlasPath: string,
  /** The atlas file's text, or `null` when there is no file at `atlasPath` (issue #1020). */
  atlasText: string | null,
  forced: PoserName | undefined,
  spineData: () => SkeletonData,
  make: MakeCorePoser,
): { choice: PoserChoice; document: CoreDocumentFacts | null } {
  const dir = dirname(resolve(skeletonPath));
  const modelPath = join(dir, MODEL_DOCUMENT_FILE);
  let core: { poser: Poser; roster: SkinRoster } | null = null;
  let document: CoreDocumentFacts | null = null;
  let why: string;
  if (forced === 'spine') why = '--poser spine';
  else if (!existsSync(modelPath)) why = `no ${MODEL_DOCUMENT_FILE} beside ${resolve(skeletonPath)} — a Spine export, not a rigc build`;
  else if (dirname(resolve(atlasPath)) !== dir) {
    why =
      `the atlas ${resolve(atlasPath)} is not beside ${modelPath}: the document's region trims are its own build's ` +
      "atlas's, and the core would pose them against another one's pages";
  } else {
    try {
      const modelText = readFileSync(modelPath, 'utf8');
      const bytes = readFileSync(skeletonPath);
      // No atlas is `''`: a rigc-compiled/2 document draws from its own `pages`, and a /1 document is refused by name (`placementOf`). An atlas that is there is held to the document's `pages` (#1016) and refused, naming the first difference, when it is not the one the build wrote.
      const candidate = make(modelText, atlasText ?? '', modelPath, { path: resolve(skeletonPath), bytes });
      const rosters = skeletonRosters(bytes.toString('utf8'));
      const differs = rosterDifference(candidate, rosters);
      if (differs === null) {
        document = coreDocumentFacts(modelText, modelPath, rosters.skins);
        core = { poser: candidate, roster: document.roster };
        // The poser line names where the placement came from when it is not the document's own (issue #1020): a /1 document states none, and the core reads it from the atlas beside it.
        // And, since issue #1026, where the orders, the stage and the scale lines came from when the document does not state them: a /2 or /1 document's are read off the files beside it.
        const unstated = document.stated === null ? unstatedClause(resolve(skeletonPath), atlasText === null ? null : resolve(atlasPath)) : '';
        why =
          document.pageNames === null
            ? `${modelPath} — a ${document.spec} document, which does not state where each region sits on its page: that is read from ${resolve(atlasPath)}; nor ${unstated}`
            : document.stated === null
              ? `${modelPath} — a ${document.spec} document, which does not state ${unstated}`
              : modelPath;
      } else why = `${modelPath} does not describe ${resolve(skeletonPath)}: ${differs}`;
    } catch (err) {
      if (!(err instanceof CoreInputError)) throw err;
      // The reader names the document itself (`readModel`'s `where`), so a message that already starts with its path is not given it twice.
      why = `the core refused ${err.message.startsWith(`${modelPath}: `) ? err.message : `${modelPath}: ${err.message}`}`;
    }
  }
  return { choice: posersOver(forced, core, why, spineData), document: core === null ? null : document };
}

/**
 * What a `rigc-compiled/2` or `/1` document does not state and a render or a
 * check reads off the files beside it instead (issue #1026), as the poser line
 * says it: the order the skeleton lists its skins and animations in and its
 * stage, off `skeleton`, and its pages' `scale:` lines, off `atlas` — or not
 * at all where no atlas is beside it (issue #1020).
 */
function unstatedClause(skeleton: string, atlas: string | null): string {
  return (
    `the order its skins and animations are listed in or its stage, read from ${skeleton}, ` +
    `or its pages' scale: lines, ${atlas === null ? 'not read — no atlas is beside it' : `read from ${atlas}`}`
  );
}

/**
 * `--poser core` on an input that cannot carry it, refused by name
 * (`PoserChoiceError`) — said by the caller where its refusals have always
 * stood, after the flags that refuse before it. Returns the choice otherwise.
 */
export function refuseUnchosen(choice: PoserChoice): PoserChoice {
  if (choice.forced === 'core' && choice.core === null) throw new PoserChoiceError(`--poser core: ${choice.why}`);
  return choice;
}

/**
 * `run` through the chosen poser: the core one when there is one, and
 * spine-core otherwise — or when the core refuses the input partway
 * (`CoreInputError`, e.g. a clip polygon that is not simple), in
 * which case `run` starts again from nothing on spine-core and `note` names the
 * refusal. Under `--poser core` that refusal is a `PoserChoiceError` instead.
 * `run` must write nothing: a fallback re-runs it whole. It is handed the
 * skin roster behind the poser it runs (`PoserChoice.rosterOf`), so a run
 * through the core reads nothing through spine-core (issue #1014).
 */
export function throughPoser<T>(choice: PoserChoice, run: (poser: Poser, roster: SkinRoster) => T): { value: T; poser: PoserName; note: string } {
  const through = (poser: Poser): T => run(poser, choice.rosterOf(poser));
  if (choice.core !== null) {
    try {
      return { value: through(choice.core), poser: 'core', note: `rigc core — ${choice.why}` };
    } catch (err) {
      if (!(err instanceof CoreInputError)) throw err;
      if (choice.forced === 'core') throw new PoserChoiceError(`--poser core: the core refused this input: ${err.message}`);
      return { value: through(choice.spine), poser: 'spine', note: `spine-core — the core refused this input: ${err.message}` };
    }
  }
  return { value: through(choice.spine), poser: 'spine', note: `spine-core — ${choice.why}` };
}

// ---------------------------------------------------------------------------
// the geometry export — `render --geometry` (issue #864)
// ---------------------------------------------------------------------------
//
// ⭐ A frame set is pixels, and two judgements a consumer that does not link
// spine-core wants to make are not about pixels: how far a mesh triangle is
// stretched over its rest shape, and whether a region holds still in its own
// bone's frame. Both need the numbers the pose was drawn FROM. So `render` writes
// them beside the pictures, off the very `Frame`s it drew — one call, one frame
// grid, one viewport — rather than a second command re-deriving any of the three.

/** The export's file name inside an animation's frame directory, and its format tag. */
export const GEOMETRY_FILE = 'geometry.json';
export const GEOMETRY_SPEC = 'rigc-geometry/1';
/** Stated in the file, so a reader cannot take the numbers for frame pixels. */
export const GEOMETRY_COORDINATES = 'spine world, y up, world units';

/** A geometry file's frame: `Frame` reduced to the numbers the export promises. */
export interface GeometryFrame {
  index: number;
  time: number;
  bones: GeometryBone[];
  attachments: AttachmentPose[];
}

/** One bone's world transform: `world = [a b; c d]·local + (worldX, worldY)`. */
export interface GeometryBone {
  name: string;
  a: number;
  b: number;
  c: number;
  d: number;
  worldX: number;
  worldY: number;
}

/**
 * One attachment's rest geometry and its topology — the half of a stretch ratio
 * no frame carries.
 *
 * ⭐ **Rest is the setup pose's bones with no deform**, taken for every
 * attachment any frame of the file shows — including one the setup pose does not
 * show, which a slot only swaps to later. For an attachment the setup pose does
 * show, these vertices are the `setup` entry's own, bit for bit: both come off
 * one skeleton posed by `setupPosed`.
 */
export interface AttachmentRest {
  slot: string;
  attachment: string;
  kind: 'region' | 'mesh';
  vertices: number[];
  /** Vertex index triplets. A region's are the runtime's own `0 1 2 2 3 0`. */
  triangles: number[];
  /** A mesh's hull vertex count — the first `hull` vertices, as the format's `hull` field counts them. */
  hull?: number;
  /** A mesh's `uvs`, `u, v` per vertex over the untrimmed drawing, y down — the attachment's own, not a page's. */
  uvs?: number[];
}

export interface GeometryFile {
  spec: string;
  coordinates: string;
  /** The animation, or `null` for a skeleton with none (its one frame is the setup pose). */
  animation: string | null;
  skin?: string;
  /** The schedule the physics answered (`render --environment`, issue #1416) — `frames.json`'s own `environment`; absent without it. */
  environment?: EnvironmentStep[];
  fps: number;
  /** The box the PNG frames beside this file were drawn over — `frames.json`'s own `viewport`. */
  viewport: FramesSidecar['viewport'];
  /** Every bone in the skeleton's declaration order, and its parent's name. */
  bones: Array<{ name: string; parent: string | null }>;
  /**
   * Every slot in the skeleton's declaration order, and the bone it hangs from —
   * which is the bone whose frame "still in its own bone's frame" is read in.
   */
  slots: Array<{ name: string; bone: string }>;
  rest: AttachmentRest[];
  /** The setup pose, sampled the way `sampleSetupPose` samples it. */
  setup: Omit<GeometryFrame, 'index' | 'time'>;
  frames: GeometryFrame[];
}

/**
 * A pose holding a number that is not finite — refused by the bone or the vertex
 * that holds it, and the value, rather than drawn, framed or written.
 *
 * Two callers throw it, with one sentence between them (`nonFiniteSentence`):
 * the geometry export, because `JSON.stringify` writes `NaN` and `Infinity` as
 * `null` and a consumer would read a hole in the geometry as a vertex at
 * nothing; and `framingViewport`, because a box over an infinite vertex is no
 * box at all (issue #873). Before that second caller the framing answered `null`
 * for it, which `render` prints as "posed no drawable attachment" — true of a
 * skeleton that draws nothing and false of this one, whose attachment is there
 * and posed to a number no picture can hold.
 */
export class GeometryError extends Error {}

/** `frames.json`'s viewport block for `v` — the one spelling both files use. */
export function sidecarViewport(v: Viewport): FramesSidecar['viewport'] {
  return {
    x: v.minX,
    y: v.minY,
    width: v.maxX - v.minX,
    height: v.maxY - v.minY,
    scale: v.scale,
    pixelWidth: v.width,
    pixelHeight: v.height,
  };
}

/**
 * The geometry file for one frame set — `frames` exactly as a sampler returned
 * them with `{ bones: true, geometry: true }`, which is what makes its grid the
 * frame set's own.
 *
 * Refused by `GeometryError`, naming the frame, the slot, the attachment and the
 * vertex (or the bone), when any number in it is not finite.
 */
export function geometryFileOf(
  source: PoseSource,
  animation: string | null,
  fps: number,
  frames: Frame[],
  viewport: Viewport,
  skin: string | undefined,
  environment?: EnvironmentStep[],
): GeometryFile {
  const geometryFrame = (frame: Frame, where: string): Omit<GeometryFrame, 'index' | 'time'> => {
    if (frame.bones === undefined || frame.attachments === undefined) {
      throw new Error(`${where} was sampled without { bones: true, geometry: true }; the geometry export needs both`);
    }
    return {
      bones: frame.bones.map(({ name, a, b, c, d, worldX, worldY }) => ({ name, a, b, c, d, worldX, worldY })),
      attachments: frame.attachments,
    };
  };
  const posed = frames.map((frame) => ({
    index: frame.index,
    time: frame.time,
    ...geometryFrame(frame, `frame ${frame.index}`),
  }));
  const poser = poserOf(source);
  const setupFrame = sampleSetupPose(poser, { ...(skin === undefined ? {} : { skin }), bones: true, geometry: true })[0];
  const setup = geometryFrame(setupFrame, 'the setup pose');
  const file: GeometryFile = {
    spec: GEOMETRY_SPEC,
    coordinates: GEOMETRY_COORDINATES,
    animation,
    ...(skin === undefined ? {} : { skin }),
    ...(environment === undefined ? {} : { environment }),
    fps,
    viewport: sidecarViewport(viewport),
    bones: poser.bones.map(({ name, parent }) => ({ name, parent })),
    slots: poser.slots.map(({ name, bone }) => ({ name, bone })),
    rest: poser.rest(skin, [setup.attachments, ...posed.map((frame) => frame.attachments)]),
    setup,
    frames: posed,
  };
  refuseNonFinite(file);
  return file;
}

/**
 * How a sampled frame is named in that sentence: the animation, the frame's
 * index at the rate it was sampled and its time — or the bare index for the one
 * frame of a skeleton with no animation, whose setup pose is checked first.
 */
function frameWhere(animation: string | null, index: number, time: number, fps: number): string {
  if (animation === null) return `frame ${index}`;
  return `animation ${JSON.stringify(animation)} frame ${index} at ${fps} fps (t=${time.toFixed(4)}s)`;
}

/** One sampled frame's numbers, under the name the sentence gives it. */
interface NamedPose {
  where: string;
  attachments: readonly PosedVertices[];
  bones: readonly WorldTransform[];
}

/**
 * ⭐ **The one derivation of the non-finite sentence** (issue #873): the setup
 * pose, then every frame in order, then the rest table. The export and the
 * framing both reach it, so `render` and `render --geometry` refuse one planted
 * overflow in the same words.
 *
 * The setup pose first because a setup bone that overflowed is named there as
 * the BONE, and the rest table — the setup's bones with no deform — would name
 * the same fault one step on, as a vertex. Rest is still checked, last: it holds
 * attachments the setup pose does not show.
 */
function nonFiniteSentence(
  setup: Pick<NamedPose, 'attachments' | 'bones'>,
  frames: readonly NamedPose[],
  rest: readonly PosedVertices[],
): string | null {
  const first = firstNonFinite('the setup pose', setup.attachments, setup.bones);
  if (first !== null) return first;
  for (const frame of frames) {
    const found = firstNonFinite(frame.where, frame.attachments, frame.bones);
    if (found !== null) return found;
  }
  return firstNonFinite('the rest table', rest, []);
}

/** Throw a `GeometryError` at the first number in `file` that is not finite, naming where it sits. */
function refuseNonFinite(file: GeometryFile): void {
  const sentence = nonFiniteSentence(
    file.setup,
    file.frames.map((frame) => ({ ...frame, where: frameWhere(file.animation, frame.index, frame.time, file.fps) })),
    file.rest,
  );
  if (sentence !== null) throw new GeometryError(sentence);
}

/**
 * Where a skeleton's pose is not finite, as the sentence the geometry export
 * refuses on — or `null` when every bone and vertex of it is finite.
 *
 * Each set is sampled at its own rate, with its bones and whole attachments —
 * `animation: null` is the setup pose alone — so the frame it names is a frame of
 * the caller's own grid. It samples again rather than taking the caller's
 * frames, because a caller that only draws sampled no bones; it is run only
 * once the caller has found a number that is not finite, so a finite pose never
 * pays for it.
 */
export function nonFinitePoseOf(
  source: PoseSource,
  skin: string | undefined,
  sets: ReadonlyArray<{ animation: string | null; fps: number }>,
): string | null {
  const poser = poserOf(source);
  const opts: PoseOptions = { ...(skin === undefined ? {} : { skin }), bones: true, geometry: true };
  // Every attachment list the frames showed, for the rest table's roster.
  const shown: AttachmentPose[][] = [];
  const named = (frame: Frame, where: string): NamedPose => {
    if (frame.bones === undefined || frame.attachments === undefined) {
      throw new Error(`${where} was sampled without { bones: true, geometry: true }`);
    }
    shown.push(frame.attachments);
    return { where, attachments: frame.attachments, bones: frame.bones };
  };
  const setup = named(sampleSetupPose(poser, opts)[0], 'the setup pose');
  const frames = sets.flatMap(({ animation, fps }) =>
    animation === null
      ? []
      : sampleAnimation(poser, animation, fps, opts).map((frame) =>
          named(frame, frameWhere(animation, frame.index, frame.time, fps)),
        ),
  );
  // Not read unless the setup pose and every frame are finite: `restOf` poses
  // what they show, and would be posing the same overflow a third time.
  const found = nonFiniteSentence(setup, frames, []);
  if (found !== null) return found;
  return nonFiniteSentence({ attachments: [], bones: [] }, [], poser.rest(skin, shown));
}

/**
 * The file's text: a JSON object whose header fields sit one per line and whose
 * `rest` entries and `frames` sit one per line each, so a diff of two exports
 * names the frame that moved.
 *
 * Numbers are `JSON.stringify`'s, which is how every JSON this tree writes prints
 * them — the shortest decimal that reads back as the same double, fixed by the
 * language rather than a locale — so a vertex in the file IS the runtime's
 * vertex, not a rounding of it.
 */
export function geometryText(file: GeometryFile): string {
  const lines: string[] = [];
  const entries = Object.entries(file);
  entries.forEach(([key, value], i) => {
    const comma = i + 1 < entries.length ? ',' : '';
    if ((key === 'rest' || key === 'frames') && Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`  ${JSON.stringify(key)}: []${comma}`);
        return;
      }
      lines.push(`  ${JSON.stringify(key)}: [`);
      value.forEach((item, j) => lines.push(`    ${JSON.stringify(item)}${j + 1 < value.length ? ',' : ''}`));
      lines.push(`  ]${comma}`);
      return;
    }
    lines.push(`  ${JSON.stringify(key)}: ${JSON.stringify(value)}${comma}`);
  });
  return `{\n${lines.join('\n')}\n}\n`;
}

/**
 * The name two atlases have to agree on for a substitution to find a region.
 *
 * Trimmed, because `TextureAtlas` names a region after the raw line it was read
 * from — so the same region in a file written with CRLF and one without would be
 * two different strings, and a substitution would report every region unmatched
 * for a reason that is invisible in both files. The index is folded in because a
 * sequence packs several regions under one name and `findRegion` returns only the
 * first of them.
 */
function regionKey(region: { name: string; index: number }): string {
  return `${region.name.trim()}#${region.index}`;
}

/**
 * Page names of a substituting atlas carry this prefix, so an own page and a
 * substituted page that happen to share a filename cannot be taken for each other.
 */
export const SUBSTITUTE_PAGE = 'texture-from:';

/**
 * One region of a substituting atlas, as `substituteTexture` reads it: where
 * it sits on which page, and the mapping from the drawing's own coordinates
 * onto it (`MeshAttachment.computeUVs`'s job).
 */
export interface SubstituteRegion {
  page: { name: string; width: number; height: number };
  x: number;
  y: number;
  width: number;
  height: number;
  degrees: number;
  /** Art-space UVs (`u, v` per vertex) mapped onto this region of its page, in doubles. */
  pageUvs(art: readonly number[]): number[];
}

/** An atlas whose texels can stand in for another's — see `substituteTexture`. */
export interface TextureSubstitution {
  /** Prefixed page name → the page, ready to merge into a render's page map. */
  pages: Map<string, Plate>;
  /** The atlas's regions, by the key both sides agree on — see `regionKey`. */
  regions: Map<string, SubstituteRegion>;
  /** Every `scale:` the atlas text declares, in the order the pages declare them. */
  scales: number[];
}

/**
 * Who reads a substituting atlas (issue #1020): `rigc` — `parseAtlasText` and
 * `./core/uvs.ts`'s `computeUvs`, for a candidate the core poses, so a rigc
 * build's `check --texture-from` reads nothing through spine-core — or
 * `spine`, the runtime's `TextureAtlas` and `MeshAttachment.computeUVs`, for
 * everything spine-core poses (an export keeps the reading it always had).
 *
 * The two were measured to agree: the region list (`TextureAtlas.regions` is
 * file order, and so is `parseAtlasText`'s, the pairing the selftest holds on
 * every corpus atlas) and the mapping (`computeUvs`, bit for bit in doubles
 * over 6,000 calls — its header). The PR of #1020 carries the substituted
 * frames, pixel for pixel, on the corpus rows that exercise it.
 */
export type SubstitutionReader = 'rigc' | 'spine';

/** Load an atlas and its pages as a substitution source, read by `reader` — see `SubstitutionReader`. */
export function textureSubstitutionFromText(atlasText: string, atlasDir: string, reader: SubstitutionReader = 'spine'): TextureSubstitution {
  const regions = new Map<string, SubstituteRegion>();
  const names: string[] = [];
  if (reader === 'rigc') {
    for (const page of parseAtlasText(atlasText).pages) {
      names.push(page.name);
      const at = { name: page.name, width: page.width, height: page.height };
      for (const region of page.regions) {
        regions.set(regionKey(region), { page: at, x: region.x, y: region.y, width: region.width, height: region.height, degrees: region.degrees, pageUvs: (art) => computeUvs(region, at, art) });
      }
    }
  } else {
    // spine-core's `TextureAtlas` and `MeshAttachment.computeUVs`, through the seam (`spineSubstitution`, `./render.ts`).
    const read = spineSubstitution(atlasText);
    names.push(...read.pages);
    for (const [key, region] of read.regions) regions.set(key, region);
  }
  const pages = new Map<string, Plate>();
  for (const name of names) {
    if (name.startsWith(SUBSTITUTE_PAGE)) {
      throw new Error(`atlas page "${name}" starts with the reserved prefix ${JSON.stringify(SUBSTITUTE_PAGE)}`);
    }
    pages.set(SUBSTITUTE_PAGE + name, readPlate(join(atlasDir, name)));
  }
  return { pages, regions, scales: atlasScales(atlasText) };
}

/**
 * The `scale:` values an atlas text declares, read off the text.
 *
 * ⚠️ Off the text, and reluctantly: `TextureAtlas` drops the field (its page
 * reader silently ignores every key it has no handler for), because `scale:` is
 * an instruction to whoever *imports* the pack — "the artwork was this much
 * bigger than these texels" — and a runtime has nothing to do with it. It is
 * nevertheless the one line that says a pack is coarser than the drawing it came
 * from, which is exactly the fact a reader of an MAE needs (issue #171), so it is
 * read here rather than left unreported.
 *
 * Narrow on purpose: an indented `scale:` line inside a page block, and nothing
 * else. It is not a second parser for the format and must not grow into one.
 * The line's pattern is `ATLAS_SCALE_LINE` (`src/model.ts`), which the model
 * document reads a page's own `scale:` with (issue #1026) — one pattern, so the
 * figure `check` reports off an atlas and off a document cannot drift apart.
 */
export function atlasScales(atlasText: string): number[] {
  const out: number[] = [];
  for (const line of atlasText.split(/\r\n|\r|\n/)) {
    const m = ATLAS_SCALE_LINE.exec(line);
    if (!m) continue;
    const value = Number(m[1]);
    if (Number.isFinite(value)) out.push(value);
  }
  return out;
}

/**
 * The page rectangle a region occupies, as UVs — the fence `substituteTexture`
 * puts around a substituted piece.
 *
 * ⚠️ Derived from `region.x/y/width/height` and its rotation rather than read off
 * `region.u2/v2`, and that is not fastidiousness: `TextureAtlas` transposes a
 * rotated region's rectangle when computing `u2/v2` **only at `degrees === 90`**,
 * so at 180 and 270 those two numbers describe a rectangle the page does not have.
 * (The same gap is why `RegionAttachment.computeUVs` draws a 270-packed region
 * wrong, which is what `--atlas` was measuring on rung 7 — issue #199.)
 * `region.u/v` are always `x/pageWidth, y/pageHeight` and are used as they are; the
 * size is `pageFootprint`'s, which is the region's own transposed for a quarter
 * turn — what the atlas format means by `bounds` on a rotated region. That
 * derivation was written out here, and in three other places that wanted the same
 * rectangle; two of them had it wrong at 270 (issue #579), so it is one function
 * now and this is one of its callers.
 */
function windowOf(region: SubstituteRegion): UvWindow {
  const rect = pageFootprint(region);
  const page = region.page;
  return {
    u0: region.x / page.width,
    v0: region.y / page.height,
    u1: (region.x + rect.width) / page.width,
    v1: (region.y + rect.height) / page.height,
  };
}

/**
 * The same posed frame, drawn from another atlas's **texels only**.
 *
 * ## 🔒 What is and is not substituted, and why that is the whole point
 *
 * `world` is copied across untouched — every vertex, both shapes — so the
 * substituted frame draws the candidate's own geometry and nothing else. Only
 * `page` and `uvs` change, and they change through the drawing's own coordinates
 * (`PieceTexture`), so the same point of the artwork lands at the same world
 * position on both sides. What is left between the two renders is a difference of
 * **texels**: the same shapes, in the same places, filtered from a different
 * source.
 *
 * That is what `rigc check --atlas <the frames' own atlas>` was being used for and
 * is not: pointing `--atlas` at another atlas re-loads the skeleton against it, and
 * a region attachment's quad is derived from the region rectangle, so a `rotate:`
 * or a trim in the substituting pack moves the geometry too. Measured on rung 7,
 * whose pack is `rotate: 270` and trimmed: that swap sends the reported MAE **up**
 * on every set, which a texture floor cannot do — a coarser texture can only
 * explain error, never add it (issue #199).
 *
 * ## The window
 *
 * A trimmed pack keeps only the drawing's opaque sub-rectangle, while the
 * candidate's own quad spans the whole drawing. Art-space coordinates outside what
 * the pack kept map to page texels **belonging to whatever was packed next door**,
 * so the substituted piece is fenced to its own rectangle (`UvWindow`) and draws
 * nothing outside it. That is the faithful answer rather than a convenience: a
 * packer trims only fully transparent border, so outside the rectangle the drawing
 * *is* empty.
 */
export function substituteTexture(
  frame: Frame,
  into: TextureSubstitution,
): { frame: Frame; unmatched: string[] } {
  const unmatched: string[] = [];
  const pieces: Piece[] = [];
  for (const piece of frame.pieces) {
    const texture = piece.texture;
    const region = texture ? (into.regions.get(texture.region) ?? null) : null;
    if (!texture || !region) {
      unmatched.push(texture ? texture.region : piece.slot);
      pieces.push(piece);
      continue;
    }
    // The mapping from the drawing's coordinates into a page's, which is where
    // `rotate:` (all four of them) and the trim offsets are handled: spine-core's
    // own `MeshAttachment.computeUVs`, or `./core/uvs.ts`'s `computeUvs`, measured
    // equal to it bit for bit — never a third opinion about the atlas format
    // (`SubstitutionReader`).
    const uvs = region.pageUvs(texture.artUvs);
    // A clipped piece's source map is re-seated the same way, through the drawing's own coordinates (`Mesh.source`).
    if (piece.kind === 'mesh' && piece.source !== undefined) {
      if (texture.sourceArtUvs === undefined) throw new Error(`slot "${piece.slot}": a clipped piece carries no original-art UVs for its source triangles`);
      const sourceUvs = region.pageUvs(texture.sourceArtUvs);
      pieces.push({ ...piece, page: SUBSTITUTE_PAGE + region.page.name, uvs, uvWindow: windowOf(region), source: { world: piece.source.world, uvs: sourceUvs } });
      continue;
    }
    pieces.push({ ...piece, page: SUBSTITUTE_PAGE + region.page.name, uvs, uvWindow: windowOf(region) });
  }
  return { frame: { ...frame, pieces }, unmatched };
}

// ---------------------------------------------------------------------------
// framing
// ---------------------------------------------------------------------------

/**
 * The world-space box every posed vertex of these frames fits inside.
 *
 * `world.length` rather than a literal 8: a region contributes its four corners
 * and a mesh every one of its vertices, and the loop does not need to know which
 * it is holding.
 */
export function unionBounds(frameSets: Iterable<Frame[]>): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const frames of frameSets) {
    for (const frame of frames) {
      for (const piece of frame.pieces) {
        for (let i = 0; i < piece.world.length; i += 2) {
          minX = Math.min(minX, piece.world[i]);
          maxX = Math.max(maxX, piece.world[i]);
          minY = Math.min(minY, piece.world[i + 1]);
          maxY = Math.max(maxY, piece.world[i + 1]);
        }
      }
    }
  }
  return { minX, minY, maxX, maxY };
}

/**
 * The opaque sub-rectangle of one quad's region, in the quad's own `(s, t)`.
 *
 * `(0,0)` is the region's bottom-left corner and `(1,1)` its top-right, so a trim
 * of `{0, 0, 1, 1}` is a region whose art fills it and anything smaller is the
 * transparent margin the art was exported with.
 */
export interface RegionTrim {
  minS: number;
  minT: number;
  maxS: number;
  maxT: number;
}

/**
 * Where a quad's artwork actually is, as opposed to where its rectangle is.
 *
 * ⭐ This is what stops an invisible margin from being able to move anything. A
 * region attachment's quad is the whole PNG, transparent border included, so two
 * exports of the same drawing with different margins pose to different quads and
 * frame themselves differently — which is how rung 5 reported MAE 39.00 for a rig
 * whose every key was right (issue #34). Trimming to the opaque texels makes the
 * box a property of the drawing.
 *
 * Alpha above zero rather than the rasteriser's coverage threshold, deliberately:
 * this is the box that has to CONTAIN the drawing, and a box that is a texel too
 * generous costs nothing while one that is a texel short clips.
 *
 * `cache` is keyed by page and region rectangle, because a scan per quad per frame
 * would be a scan per quad per frame.
 */
export function regionTrim(page: Plate, quad: Quad, cache: Map<string, RegionTrim | null>): RegionTrim | null {
  const [ubr, vbr, ubl, vbl, uul, vul] = [quad.uvs[0], quad.uvs[1], quad.uvs[2], quad.uvs[3], quad.uvs[4], quad.uvs[5]];
  const key = `${quad.page}|${ubr},${vbr},${ubl},${vbl},${uul},${vul}`;
  const seen = cache.get(key);
  if (seen !== undefined) return seen;

  const ox = ubl * page.width;
  const oy = vbl * page.height;
  const ex = [(ubr - ubl) * page.width, (vbr - vbl) * page.height];
  const ey = [(uul - ubl) * page.width, (vul - vbl) * page.height];
  const det = ex[0] * ey[1] - ex[1] * ey[0];
  if (Math.abs(det) < 1e-9) {
    cache.set(key, null);
    return null;
  }
  const corners = [
    [ox, oy],
    [ox + ex[0], oy + ex[1]],
    [ox + ey[0], oy + ey[1]],
    [ox + ex[0] + ey[0], oy + ex[1] + ey[1]],
  ];
  const x0 = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[0]))));
  const x1 = Math.min(page.width - 1, Math.ceil(Math.max(...corners.map((c) => c[0]))));
  const y0 = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[1]))));
  const y1 = Math.min(page.height - 1, Math.ceil(Math.max(...corners.map((c) => c[1]))));

  let minS = Infinity;
  let minT = Infinity;
  let maxS = -Infinity;
  let maxT = -Infinity;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (page.get(x, y)[3] === 0) continue;
      const rx = x + 0.5 - ox;
      const ry = y + 0.5 - oy;
      const s = (rx * ey[1] - ry * ey[0]) / det;
      const t = (ex[0] * ry - ex[1] * rx) / det;
      if (s < 0 || s > 1 || t < 0 || t > 1) continue;
      if (s < minS) minS = s;
      if (s > maxS) maxS = s;
      if (t < minT) minT = t;
      if (t > maxT) maxT = t;
    }
  }
  const trim = Number.isFinite(minS) ? { minS, minT, maxS, maxT } : null;
  cache.set(key, trim);
  return trim;
}

/**
 * The world box every piece's **artwork** fits inside, over these frames.
 *
 * The same union as `unionBounds`, taken over the trimmed rectangles instead of
 * the quads. It is a starting box for `check`'s framing and nothing more — the
 * framing itself is fitted on rendered pixels — but the start has to be free of
 * transparent margins too, or the path the fit takes still depends on them.
 *
 * ⚠️ **A mesh contributes its raw vertices and is not trimmed.** The trim exists
 * because a region attachment's quad is the whole PNG, transparent border and
 * all, so its corners sit where no pixel is. A mesh's hull is authored *onto the
 * drawing* — that is what makes it a mesh — so its vertices already are where the
 * artwork is, and there is no rectangle to invert a margin out of. Passing a
 * triangle fan through the rectangle trim would not be a better estimate of the
 * same box; it would be a different box, computed from a rectangle the mesh does
 * not have.
 */
export function trimmedUnionBounds(
  frameSets: Iterable<Frame[]>,
  pages: Map<string, Plate>,
): { minX: number; minY: number; maxX: number; maxY: number } {
  const cache = new Map<string, RegionTrim | null>();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const see = (x: number, y: number): void => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  for (const frames of frameSets) {
    for (const frame of frames) {
      for (const piece of frame.pieces) {
        if (piece.kind === 'mesh') {
          for (let i = 0; i < piece.world.length; i += 2) see(piece.world[i], piece.world[i + 1]);
          continue;
        }
        const quad = piece;
        const [brx, bry, blx, bly, ulx, uly] = quad.world;
        const trim = regionTrim(pageFor(pages, quad), quad, cache);
        if (!trim) {
          for (let i = 0; i < 8; i += 2) see(quad.world[i], quad.world[i + 1]);
          continue;
        }
        const ex = [brx - blx, bry - bly];
        const ey = [ulx - blx, uly - bly];
        for (const [s, t] of [
          [trim.minS, trim.minT],
          [trim.maxS, trim.minT],
          [trim.minS, trim.maxT],
          [trim.maxS, trim.maxT],
        ]) {
          see(blx + s * ex[0] + t * ey[0], bly + s * ex[1] + t * ey[1]);
        }
      }
    }
  }
  return { minX, minY, maxX, maxY };
}

/**
 * A pose that drew vertices and cannot be framed, because every one of them sits
 * at one point (issue #997) — refused by the slots that drew, the bone each hangs
 * from and, where those bones are unposed, the skins that would pose them.
 *
 * A `GeometryError`, because it is the same family as the non-finite pose of
 * #873: a picture that has no size is as unwritable as a vertex at Infinity. It
 * is a class of its own because the reader's next step is different — there the
 * rig posed a number no picture can hold, here the invocation posed the rig under
 * a skin that leaves every drawn bone without a world transform, and `--skin` is
 * usually the whole fix — so `cli.ts` exits 2 on it, as it does on the other
 * framing refusal, *nothing to draw*.
 *
 * Before it the framing answered a viewport over the one point: `maxSide / 0` is
 * Infinity, `0 · Infinity` is NaN, and `render` wrote a 0×0 frame set with exit
 * 0, its summary saying `NaNxNaNpx` and `frames.json` a viewport of width 0 and
 * scale `null`.
 */
export class UnframeablePoseError extends GeometryError {}

/**
 * Which bones a skin leaves unposed, and which skins there are — the rig
 * structure the unframeable sentence names a skin from (issue #997). Not a
 * poser's: the `Poser` seam carries no skin roster, and both posers pose the one
 * Spine file this is read from (the core's document is bound to it by hash).
 * Two readings stand behind it — the runtime's (`skinRosterOf`) and the model
 * document's (`coreSkinRoster` in `./render_core.ts`, issue #1014), measured
 * to name the same bones under every skin — and `PoserChoice.rosterOf` hands
 * each poser its own.
 */
export interface SkinRoster {
  /** Every skin, in declaration order. */
  readonly skins: readonly string[];
  /** The bones left unposed under `skin` (absent: no skin set) — inactive, or below an inactive bone. */
  unposedUnder(skin: string | undefined): Set<string>;
}

/** The roster behind a pose source: its own when it is Spine data, else the one the caller passed. */
function rosterBehind(source: PoseSource, roster: SkinRoster | undefined): SkinRoster | undefined {
  return isPoser(source) ? roster : skinRosterOf(source);
}

/**
 * ⭐ **The one derivation of "a drawn slot on an unposed bone"** (issues #997,
 * #1000): the names of the slots of `slots` whose bone `roster` says `skin`
 * leaves unposed — inactive itself, or below an inactive bone. Both posers draw
 * such a slot through the zero matrix, so it draws no pixel and every vertex of
 * it sits at the origin. `framingViewport` takes these slots off the box
 * (#1000) and `unframeableSentence` refuses a pose that drew nothing else
 * (#997), from this one set.
 *
 * Empty without a roster: a bare `Poser` carries no skin structure, and what
 * cannot be read is not guessed — every slot then counts, as it did before.
 */
export function slotsOnUnposedBones(
  slots: ReadonlyArray<{ name: string; bone: string }>,
  skin: string | undefined,
  roster: SkinRoster | undefined,
): Set<string> {
  if (roster === undefined) return new Set();
  const unposed = roster.unposedUnder(skin);
  return new Set(slots.filter((slot) => unposed.has(slot.bone)).map((slot) => slot.name));
}

/** How many drawn slots a refusal names before it says how many more there are. */
const UNFRAMEABLE_NAMED = 3;

/**
 * ⭐ **The one derivation of the unframeable sentence** (issue #997): `null`
 * when the vertices of `frameSets` span a box with extent, and otherwise the
 * sentence `UnframeablePoseError` carries. `framingViewport` and `check` both
 * reach it, so `render`, `render --geometry`, `check` and a library caller
 * refuse one rig in the same words.
 *
 * Two sentences, told apart by what the reader must change:
 *
 * - **every drawn slot hangs from a bone the skin leaves unposed** — inactive
 *   itself or below an inactive bone (`unposedBones`). Both posers draw such a
 *   slot through the zero matrix, so every vertex lands on the origin. Each
 *   bone is named with the skins that pose it, read off the runtime's own
 *   `active` flag under each skin rather than restating Spine's rule here.
 * - otherwise **every drawn vertex sits at one point** — the bones posed, and
 *   collapsed their attachments (a world scale of 0 does).
 *
 * `roster` is the skin structure of the Spine file the poser poses
 * (`skinRosterOf`), which is what says whether a bone is unposed
 * (`slotsOnUnposedBones`, the set the framing box leaves out) and which skins
 * pose it. Without it the first sentence cannot be told from the second, and
 * the second is what is said.
 *
 * Distinct from *nothing to draw*: that is a skeleton that posed no vertex at
 * all, and its fix is art; this one posed vertices, and they have no place.
 */
export function unframeableSentence(
  frameSets: ReadonlyArray<readonly Frame[]>,
  slots: ReadonlyArray<{ name: string; bone: string }>,
  skin: string | undefined,
  roster: SkinRoster | undefined,
): string | null {
  const box = unionBounds(frameSets.map((frames) => [...frames]));
  if (![box.minX, box.minY, box.maxX, box.maxY].every(Number.isFinite)) return null;
  if (box.maxX - box.minX !== 0 || box.maxY - box.minY !== 0) return null;
  const drew = new Set<string>();
  for (const frames of frameSets) {
    for (const frame of frames) for (const piece of frame.pieces) if (piece.world.length > 0) drew.add(piece.slot);
  }
  // Declaration order, so the sentence does not depend on which frame drew first.
  const drawn = slots.filter((slot) => drew.has(slot.name));
  const under = skin === undefined ? 'under no skin' : `under skin ${JSON.stringify(skin)}`;
  const counted = `${drawn.length} drawn slot${drawn.length === 1 ? '' : 's'}`;
  const more = drawn.length > UNFRAMEABLE_NAMED ? `; and ${drawn.length - UNFRAMEABLE_NAMED} more` : '';
  const named = (describe: (slot: { name: string; bone: string }) => string): string =>
    drawn.slice(0, UNFRAMEABLE_NAMED).map(describe).join('; ') + more;
  if (roster !== undefined) {
    const offBox = slotsOnUnposedBones(slots, skin, roster);
    if (drawn.length > 0 && drawn.every((slot) => offBox.has(slot.name))) {
      const bySkin = roster.skins.map((name) => ({ name, unposed: roster.unposedUnder(name) }));
      const posers = (bone: string): string => {
        const names = bySkin.filter((k) => !k.unposed.has(bone)).map((k) => JSON.stringify(k.name));
        if (names.length === 0) return 'which no skin poses';
        return `which skin${names.length === 1 ? '' : 's'} ${names.join(', ')} pose${names.length === 1 ? 's' : ''}`;
      };
      return (
        `${under}, every drawn slot hangs from a bone that skin leaves unposed — ${counted}: ` +
        named((slot) => `slot ${JSON.stringify(slot.name)} on bone ${JSON.stringify(slot.bone)}, ${posers(slot.bone)}`) +
        ' — so no drawn vertex has a world transform and the frame would be 0x0: pose it under a skin that poses ' +
        'those bones (`--skin`), or name the bones in the skin it is posed under'
      );
    }
  }
  return (
    `${under}, every drawn vertex sits at the one point (${box.minX}, ${box.minY}) — ${counted}: ` +
    named((slot) => `slot ${JSON.stringify(slot.name)} on bone ${JSON.stringify(slot.bone)}`) +
    ' — so the posed box has no extent and the frame would be 0x0: the bones those slots hang from collapse ' +
    'every vertex onto it (a world scale of 0 does)'
  );
}

/** A box being widened over vertices: `minX`…`maxY`, empty at ±Infinity. */
interface FramingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** `box` widened over the `[x, y, …]` pairs of `world` — `unionBounds`'s arithmetic, in its order of reading. */
function extendBox(box: FramingBox, world: ArrayLike<number>): void {
  for (let i = 0; i < world.length; i += 2) {
    box.minX = Math.min(box.minX, world[i]);
    box.maxX = Math.max(box.maxX, world[i]);
    box.minY = Math.min(box.minY, world[i + 1]);
    box.maxY = Math.max(box.maxY, world[i + 1]);
  }
}

/**
 * How `framingViewport` is handed its frame sets: `sample` called for each of
 * `animations` (`null` the setup pose of a skeleton with none), the sets
 * yielded in that order. The framing reads each set whole before it asks for
 * the next.
 */
export type FramingSets = (sample: (animation: string | null) => Frame[], animations: ReadonlyArray<string | null>) => Iterable<Frame[]>;

/** Each set sampled only when the framing asks for it, so the one before it is no longer held (issue #1180). */
export const ONE_SET_AT_A_TIME: FramingSets = function* (sample, animations) {
  for (const animation of animations) yield sample(animation);
};

/**
 * The viewport a skeleton is framed to: its union box at `FRAMING_FPS`, padded,
 * scaled so the long side is `maxSide` pixels.
 *
 * Measuring the box densely and once makes the framing a property of the SHOT,
 * so every rate of one skeleton lands on the same pixels.
 *
 * `null` means the skeleton posed no vertex at all — nothing to draw. A pose
 * holding a vertex at Infinity or NaN is refused by a `GeometryError` naming the
 * bone or vertex and its value (issue #873), never answered `null`. A pose whose
 * every vertex sits at one point is refused by an `UnframeablePoseError`
 * (`unframeableSentence`, issue #997), never framed at a scale of Infinity.
 *
 * The box is over the slots that POSE (issue #1000): a drawn slot whose bone
 * the skin leaves unposed (`slotsOnUnposedBones`) draws no pixel — both posers
 * put it through the zero matrix — so its vertices at the origin are not part
 * of the shot, and counting them framed every frame of a rig that carries one
 * to a point nothing is drawn at (256x94 where the posed slot alone gives
 * 256x55). When every drawn slot is such a slot there is no posed box at all,
 * and that is #997's refusal, never an empty or invented one.
 *
 * `roster` is the skin roster behind a `Poser` source (`skinRosterOf`) — what
 * says which bones the skin leaves unposed, and lets the refusal name the skins
 * that pose one. Spine data as the source is its own. A bare `Poser` with no
 * roster cannot tell an unposed bone from a posed one, so every drawn slot
 * counts there; every CLI caller passes the roster, so both posers frame alike.
 *
 * ⭐ One animation's frames at a time (issue #1180). The box is a minimum and
 * a maximum per axis, which no order of reading changes, so each animation's
 * frames are read into a box per slot and released before the next animation
 * is sampled; the box over the slots that pose is the union of theirs. Held
 * all at once — every animation at 60 fps — they were the largest single
 * holder of a render's heap: on the production rig whose core-poser render
 * peaked highest, 961 MiB retained at the framing's high-water under the core
 * poser and 293 MiB under spine-core's. `RC42` reads that no animation's
 * frames are read once the next one is sampled; `sets` is a plant's way in.
 */
export function framingViewport(
  source: PoseSource,
  maxSide: number,
  opts?: PoseOptions,
  rosterGiven?: SkinRoster,
  sets: FramingSets = ONE_SET_AT_A_TIME,
): Viewport | null {
  const poser = poserOf(source);
  // The skin belongs here as much as in the frames: the union box is over the
  // attachments that POSE, and two skins fill a slot with art of different sizes
  // in different places. Framing one skin's shot with another skin's box would
  // put the difference between two skins into every measurement taken in it.
  //
  // ⭐ A slot subset is the opposite case, and is taken off (issue #835): what
  // `--slot`/`--hide` leave out still counts toward the box, so a frame with a
  // part hidden lands on the pixel grid of the frame with it and the two overlay.
  // A subset framed to its own extent would move every pixel it kept.
  //
  // A clip is taken off for the same reason (issue #844): what it removes still
  // counts toward the box, so adding or keying a mask moves no pixel it leaves
  // drawn — see `PoseOptions.unclipped`.
  // Neither the bone snapshots nor the geometry export frame anything, and
  // both would be taken at `FRAMING_FPS` for every animation only to be dropped.
  const { slots: _drawn, hidden: _hidden, bones: _bones, geometry: _geometry, ...whole } = opts ?? {};
  const framed: PoseOptions = { ...whole, unclipped: true };
  const sample = (animation: string | null): Frame[] =>
    animation === null ? sampleSetupPose(poser, framed) : sampleAnimation(poser, animation, FRAMING_FPS, framed);
  const animations: Array<string | null> = poser.animations.length === 0 ? [null] : poser.animations.map((a) => a.name);
  // Per slot, in the order a slot first drew: the box over its vertices and whether it drew one. Min and max select, so the
  // union over any grouping of the same vertices is the same four numbers — NaN and the sign of a zero included.
  const bySlot = new Map<string, { box: FramingBox; drew: boolean }>();
  for (const frames of sets(sample, animations)) {
    for (const frame of frames) {
      for (const piece of frame.pieces) {
        let slot = bySlot.get(piece.slot);
        if (slot === undefined) {
          slot = { box: { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }, drew: false };
          bySlot.set(piece.slot, slot);
        }
        if (piece.world.length > 0) slot.drew = true;
        extendBox(slot.box, piece.world);
      }
    }
  }
  // ⚠️ Two different reasons a box is not finite, told apart here and nowhere
  // else (issue #873). A skeleton that posed no vertex at all has nothing to
  // draw, and that is `null`. One that posed a vertex at Infinity or NaN has a
  // drawable attachment in a place no box can hold — so it is refused by the
  // bone or vertex and its value, in the geometry export's own sentence. Before
  // this, the first case's `null` covered both, and a single overflowing bone
  // among finite ones reached neither: its box was finite on one side, and
  // `render` wrote a NaN-by-NaN frame set with exit 0.
  if (![...bySlot.values()].some((slot) => slot.drew)) return null;
  // ⭐ The box is over the slots that pose (issue #1000). A drawn slot on a bone
  // the skin leaves unposed is taken off — it draws no pixel — unless nothing
  // else drew, in which case every slot is kept so the pose reaches #997's
  // refusal below exactly as it did before this: the same inputs, the same
  // sentence, never an empty box framed to something.
  const roster = rosterBehind(source, rosterGiven);
  const offBox = slotsOnUnposedBones(poser.slots, framed.skin, roster);
  const posed = [...bySlot].filter(([name]) => !offBox.has(name));
  const posedOnly = posed.some(([, slot]) => slot.drew);
  const box: FramingBox = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const [, slot] of posedOnly ? posed : [...bySlot]) {
    box.minX = Math.min(box.minX, slot.box.minX);
    box.maxX = Math.max(box.maxX, slot.box.maxX);
    box.minY = Math.min(box.minY, slot.box.minY);
    box.maxY = Math.max(box.maxY, slot.box.maxY);
  }
  if (![box.minX, box.minY, box.maxX, box.maxY].every(Number.isFinite)) {
    const found = nonFinitePoseOf(
      poser,
      framed.skin,
      poser.animations.length === 0
        ? [{ animation: null, fps: FRAMING_FPS }]
        : poser.animations.map((a) => ({ animation: a.name, fps: FRAMING_FPS })),
    );
    // Reaching here with nothing found would mean the pieces and the whole
    // attachments disagree about one pose — a defect here, said as one.
    if (found === null) {
      throw new Error(
        `the framing box is not finite (${box.minX}, ${box.minY}, ${box.maxX}, ${box.maxY}) and no bone or ` +
          'vertex of the pose is — the drawn pieces and the attachments were posed differently',
      );
    }
    throw new GeometryError(found);
  }
  // A finite box over one point (issue #997): every drawn slot on a bone the
  // skin leaves unposed, or every vertex collapsed. Framed, it is a scale of
  // Infinity and a frame of NaN by NaN pixels, written as 0x0 with exit 0.
  // Only a box with no extent can be refused, and only then are the frames
  // sampled again to be read whole — by the sentence's one derivation.
  if (box.maxX - box.minX === 0 && box.maxY - box.minY === 0) {
    const whole = animations.map(sample);
    const boxed = posedOnly ? whole.map((frames) => frames.map((frame) => ({ ...frame, pieces: frame.pieces.filter((piece) => !offBox.has(piece.slot)) }))) : whole;
    const unframeable = unframeableSentence(boxed, poser.slots, framed.skin, roster);
    if (unframeable !== null) throw new UnframeablePoseError(unframeable);
  }
  const pad = Math.max(box.maxX - box.minX, box.maxY - box.minY) * PAD;
  return viewportFor(box.minX - pad, box.minY - pad, box.maxX + pad, box.maxY + pad, maxSide);
}

/** A viewport over an explicit world box, scaled so its long side is `maxSide`. */
export function viewportFor(minX: number, minY: number, maxX: number, maxY: number, maxSide: number): Viewport {
  const scale = maxSide / Math.max(maxX - minX, maxY - minY);
  return {
    minX,
    minY,
    maxX,
    maxY,
    scale,
    width: Math.max(1, Math.round((maxX - minX) * scale)),
    height: Math.max(1, Math.round((maxY - minY) * scale)),
  };
}

/**
 * A viewport over an explicit world box whose pixel size is already known.
 *
 * This is the shape `check` needs: the frames on disk fix the pixel size, and
 * re-deriving it from the box would round to a different integer and silently
 * shift every measurement by up to half a pixel.
 */
export function viewportOfSize(
  minX: number,
  minY: number,
  width: number,
  height: number,
  scale: number,
  pixelWidth: number,
  pixelHeight: number,
): Viewport {
  return { minX, minY, maxX: minX + width, maxY: minY + height, scale, width: pixelWidth, height: pixelHeight };
}

/** World (y up) to frame pixels (y down). The only place that conversion lives. */
export function projector(v: Viewport): (wx: number, wy: number) => [number, number] {
  return (wx, wy) => [(wx - v.minX) * v.scale, (v.maxY - wy) * v.scale];
}

// ---------------------------------------------------------------------------
// rasterising
// ---------------------------------------------------------------------------

/**
 * One colour channel of one texel, tinted — the whole of what a slot's colours
 * do to a pixel.
 *
 * With no dark colour this is the multiply it always was, to the bit: `dark`
 * absent returns `sample * light` and nothing else, which is why every frame in
 * this repository renders byte for byte as it did before two-colour tinting
 * existed.
 *
 * With one, the light colour multiplies the texel and the dark colour fills in
 * what the texel leaves behind, so a black region can be tinted to any colour
 * while its bright parts keep the light tint. [official] — spine-ts's own
 * two-colour fragment shader, `spine-ts/spine-webgl/src/Shader.ts`
 * (`newTwoColoredTextured`), read at branch `4.3` of `EsotericSoftware/spine-runtimes`:
 *
 *     gl_FragColor.a = texColor.a * v_light.a;
 *     gl_FragColor.rgb = ((texColor.a - 1.0) * v_dark.a + 1.0 - texColor.rgb) * v_dark.rgb
 *                        + texColor.rgb * v_light.rgb;
 *
 * ⚠️ `v_dark.a` in that line is **not a colour channel** — it is the
 * premultiplied-alpha flag, which is why the dark colour is six hex digits in
 * the file and four bytes on the vertex. `SkeletonRendererCore` packs it as such:
 * `darkColor = 0xff000000 | …` on the `pma` branch and `darkColor = (r << 16) |
 * (g << 8) | b` — alpha byte **zero** — on the other. This rasteriser composites
 * **straight** alpha (see `premultiplied` below), so the flag is 0 and the shader
 * reduces to the two terms this function computes. Reading `dark.a` out of the
 * file here would be reading a flag as a colour.
 *
 * The clamp is on the dark path only, for the same reason: `sample * light` is
 * already inside the range whenever `light` is, and a clamp on that path would
 * be a change to pixels nothing asked to change.
 */
function tintChannel(sample: number, light: number, dark: number | undefined): number {
  if (dark === undefined) return sample * light;
  const mixed = sample * light + (255 - sample) * dark;
  return mixed < 0 ? 0 : mixed > 255 ? 255 : mixed;
}

/**
 * Walk the destination pixels one affine quad covers, sampling the page.
 *
 * The quad is an affine image of the region's rectangle, so a destination pixel
 * maps back to a (s, t) inside it by inverting one 2x2 — no perspective divide,
 * no triangle split. `emit` is called for every covered pixel whose composited
 * alpha clears the coverage threshold, which is what makes "draw it" and
 * "measure where it landed" the same traversal rather than two that can drift.
 */
export function rasteriseQuad(
  page: Plate,
  quad: Quad,
  project: (wx: number, wy: number) => [number, number],
  clip: { width: number; height: number },
  emit: (px: number, py: number, r: number, g: number, b: number, a: number) => void,
): void {
  // spine-core's region order is br, bl, ul, ur.
  const [brx, bry, blx, bly, ulx, uly] = quad.world;
  const bl = project(blx, bly);
  const br = project(brx, bry);
  const ul = project(ulx, uly);
  const ex = [br[0] - bl[0], br[1] - bl[1]];
  const ey = [ul[0] - bl[0], ul[1] - bl[1]];
  const det = ex[0] * ey[1] - ex[1] * ey[0];
  if (Math.abs(det) < 1e-9) return; // degenerate: zero scale, nothing to draw
  const [ubr, vbr, ubl, vbl, uul, vul] = [quad.uvs[0], quad.uvs[1], quad.uvs[2], quad.uvs[3], quad.uvs[4], quad.uvs[5]];

  const corners = [bl, br, ul, [br[0] + ey[0], br[1] + ey[1]]];
  const minX = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[0]))));
  const maxX = Math.min(clip.width - 1, Math.ceil(Math.max(...corners.map((c) => c[0]))));
  const minY = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[1]))));
  const maxY = Math.min(clip.height - 1, Math.ceil(Math.max(...corners.map((c) => c[1]))));

  for (let py = minY; py <= maxY; py++) {
    for (let px = minX; px <= maxX; px++) {
      const rx = px + 0.5 - bl[0];
      const ry = py + 0.5 - bl[1];
      const s = (rx * ey[1] - ry * ey[0]) / det;
      const t = (ex[0] * ry - ex[1] * rx) / det;
      if (s < 0 || s > 1 || t < 0 || t > 1) continue;
      const u = ubl + s * (ubr - ubl) + t * (uul - ubl);
      const v = vbl + s * (vbr - vbl) + t * (vul - vbl);
      if (outsideWindow(quad.uvWindow, u, v)) continue;
      const sample = bilinear(page, u * page.width - 0.5, v * page.height - 0.5);
      const alpha = sample[3] * quad.tint[3];
      if (alpha <= 0.5) continue;
      emit(
        px,
        py,
        Math.round(tintChannel(sample[0], quad.tint[0], quad.dark?.[0])),
        Math.round(tintChannel(sample[1], quad.tint[1], quad.dark?.[1])),
        Math.round(tintChannel(sample[2], quad.tint[2], quad.dark?.[2])),
        Math.round(alpha),
      );
    }
  }
}

/** A destination pixel and the straight-alpha colour a piece put there. */
export type EmitPixel = (px: number, py: number, r: number, g: number, b: number, a: number) => void;

/**
 * Slack on a `UvWindow`'s edges, in page UVs.
 *
 * The window's bounds *are* the region rectangle's own UVs, and a piece's
 * interpolated UV reaches them exactly at its edge — so the test has to admit
 * equality, and a bare `<` would drop a boundary pixel whenever the arithmetic
 * lands a bit under. A billionth of a page is far below a texel and far above the
 * error of two multiplies.
 */
const WINDOW_SLACK = 1e-9;

/**
 * Is this texel outside the rectangle its piece is allowed to sample?
 *
 * `undefined` is the ordinary case — a piece posed from its own atlas has no
 * window — and answers `false` without arithmetic, which keeps this off the cost
 * of every reference frame ever rendered.
 */
function outsideWindow(window: UvWindow | undefined, u: number, v: number): boolean {
  if (window === undefined) return false;
  return (
    u < window.u0 - WINDOW_SLACK ||
    u > window.u1 + WINDOW_SLACK ||
    v < window.v0 - WINDOW_SLACK ||
    v > window.v1 + WINDOW_SLACK
  );
}

/**
 * Is this edge a top or a left one, for the winding `rasteriseMesh` normalises to?
 *
 * Derived rather than copied, because the answer depends on the sign convention
 * of the edge function and the direction of y. With `edge(p) = dx·(py−y0) −
 * dy·(px−x0)` and y pointing **down**, the triangle `(0,0) → (1,0) → (0,1)` has
 * positive area, and its horizontal edge `(0,0) → (1,0)` — `dx > 0`, `dy = 0` —
 * is the one along its top. Its `(0,1) → (0,0)` edge — `dy < 0`, going up — is
 * the one down its left.
 *
 * What actually makes the rule watertight needs neither of those facts: the two
 * triangles sharing an edge traverse it in opposite directions, so `dy < 0` holds
 * for exactly one of them, and when `dy` is 0 for both, `dx > 0` holds for
 * exactly one. Every shared edge is therefore claimed once. Getting the
 * orientation right on top of that is what keeps the classic meaning — a pixel
 * centre on a boundary belongs to the triangle below-right of it.
 */
function isTopLeftEdge(dx: number, dy: number): boolean {
  return dy < 0 || (dy === 0 && dx > 0);
}

/**
 * Walk the destination pixels one posed mesh covers, sampling the page.
 *
 * Each triangle is filled independently with barycentric UV interpolation and no
 * perspective divide — a Spine mesh is a flat 2D deformation, so its UVs are
 * affine in screen space and there is no `w` to divide by. The winding is
 * normalised per triangle (a mesh's triangles are not guaranteed to agree, and a
 * bone with negative scale flips them all anyway), and the top-left rule then
 * makes every interior edge belong to exactly one of the two triangles that
 * share it.
 *
 * `emit` has the same contract as `rasteriseQuad`'s — every covered pixel whose
 * composited alpha clears the same 0.5 threshold — so "draw it" and "measure
 * where it landed" stay one traversal for meshes exactly as they are for regions.
 */
export function rasteriseMesh(
  page: Plate,
  mesh: Mesh,
  project: (wx: number, wy: number) => [number, number],
  clip: { width: number; height: number },
  emit: EmitPixel,
): void {
  const count = mesh.world.length / 2;
  // Project once per vertex, not once per triangle: an interior vertex of a
  // 40-vertex hull belongs to half a dozen triangles, and projecting it six times
  // invites six answers the moment anything about `project` stops being exact.
  const px = new Float64Array(count);
  const py = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const [x, y] = project(mesh.world[i * 2], mesh.world[i * 2 + 1]);
    px[i] = x;
    py[i] = y;
  }

  for (let t = 0; t + 2 < mesh.triangles.length; t += 3) {
    let i0 = mesh.triangles[t];
    let i1 = mesh.triangles[t + 1];
    const i2 = mesh.triangles[t + 2];
    let area = (px[i1] - px[i0]) * (py[i2] - py[i0]) - (py[i1] - py[i0]) * (px[i2] - px[i0]);
    if (area === 0) continue; // degenerate: a zero-height triangle covers nothing
    if (area < 0) {
      const swap = i0;
      i0 = i1;
      i1 = swap;
      area = -area;
    }

    const x0 = px[i0];
    const y0 = py[i0];
    const x1 = px[i1];
    const y1 = py[i1];
    const x2 = px[i2];
    const y2 = py[i2];
    const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
    const maxX = Math.min(clip.width - 1, Math.ceil(Math.max(x0, x1, x2)));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
    const maxY = Math.min(clip.height - 1, Math.ceil(Math.max(y0, y1, y2)));
    if (maxX < minX || maxY < minY) continue;

    // Edge `k` is the one opposite vertex `k`, so its edge function IS the
    // unnormalised barycentric weight of that vertex.
    const topLeft0 = isTopLeftEdge(x2 - x1, y2 - y1);
    const topLeft1 = isTopLeftEdge(x0 - x2, y0 - y2);
    const topLeft2 = isTopLeftEdge(x1 - x0, y1 - y0);

    const u0 = mesh.uvs[i0 * 2];
    const v0 = mesh.uvs[i0 * 2 + 1];
    const u1 = mesh.uvs[i1 * 2];
    const v1 = mesh.uvs[i1 * 2 + 1];
    const u2 = mesh.uvs[i2 * 2];
    const v2 = mesh.uvs[i2 * 2 + 1];

    // A clipped piece (`Mesh.source`, issue #964): the UV of a pixel is the SOURCE triangle's affine map, in doubles from its own
    // projected corners and page UVs, so which convex pieces the clipper cut changes no pixel. Coverage is still this triangle's.
    const src = mesh.source === undefined ? null : sourceMap(mesh.source, t / 3, project);

    for (let y = minY; y <= maxY; y++) {
      const sy = y + 0.5;
      for (let x = minX; x <= maxX; x++) {
        const sx = x + 0.5;
        const w0 = (x2 - x1) * (sy - y1) - (y2 - y1) * (sx - x1);
        if (topLeft0 ? w0 < 0 : w0 <= 0) continue;
        const w1 = (x0 - x2) * (sy - y2) - (y0 - y2) * (sx - x2);
        if (topLeft1 ? w1 < 0 : w1 <= 0) continue;
        const w2 = (x1 - x0) * (sy - y0) - (y1 - y0) * (sx - x0);
        if (topLeft2 ? w2 < 0 : w2 <= 0) continue;

        let u: number;
        let v: number;
        if (src === null) {
          const b0 = w0 / area;
          const b1 = w1 / area;
          const b2 = w2 / area;
          u = b0 * u0 + b1 * u1 + b2 * u2;
          v = b0 * v0 + b1 * v1 + b2 * v2;
        } else [u, v] = src(sx, sy);
        if (outsideWindow(mesh.uvWindow, u, v)) continue;
        const sample = bilinear(page, u * page.width - 0.5, v * page.height - 0.5);
        const alpha = sample[3] * mesh.tint[3];
        if (alpha <= 0.5) continue;
        emit(
          x,
          y,
          Math.round(tintChannel(sample[0], mesh.tint[0], mesh.dark?.[0])),
          Math.round(tintChannel(sample[1], mesh.tint[1], mesh.dark?.[1])),
          Math.round(tintChannel(sample[2], mesh.tint[2], mesh.dark?.[2])),
          Math.round(alpha),
        );
      }
    }
  }
}

/**
 * The UV map of a clipped piece's drawn triangle `t`: its source triangle's
 * affine map (`Mesh.source`), from the three projected source corners and their
 * page UVs, in doubles — the barycentric weights of the pixel centre in the
 * projected source triangle times the corners' UVs. The same for every
 * decomposition of the source triangle, which is the point (issue #964).
 */
function sourceMap(source: ClipSource, t: number, project: (wx: number, wy: number) => [number, number]): (sx: number, sy: number) => [number, number] {
  const o = t * 6;
  const [ax, ay] = project(source.world[o], source.world[o + 1]);
  const [bx, by] = project(source.world[o + 2], source.world[o + 3]);
  const [cx, cy] = project(source.world[o + 4], source.world[o + 5]);
  const uv = source.uvs;
  const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  return (sx, sy) => {
    const wa = ((cx - bx) * (sy - by) - (cy - by) * (sx - bx)) / area;
    const wb = ((ax - cx) * (sy - cy) - (ay - cy) * (sx - cx)) / area;
    const wc = ((bx - ax) * (sy - ay) - (by - ay) * (sx - ax)) / area;
    return [wa * uv[o] + wb * uv[o + 2] + wc * uv[o + 4], wa * uv[o + 1] + wb * uv[o + 3] + wc * uv[o + 5]];
  };
}

/**
 * Rasterise whichever shape this piece is.
 *
 * ⭐ Every caller that used to reach for `rasteriseQuad` goes through here, so
 * "what counts as a covered pixel" has one definition for both shapes — which is
 * what lets `frameGeometry`, the framing box and the drawn frame agree about a
 * mesh without any of them knowing what a triangle is.
 */
export function rasterisePiece(
  page: Plate,
  piece: Piece,
  project: (wx: number, wy: number) => [number, number],
  clip: { width: number; height: number },
  emit: EmitPixel,
): void {
  if (piece.kind === 'mesh') rasteriseMesh(page, piece, project, clip, emit);
  else rasteriseQuad(page, piece, project, clip, emit);
}

/** Blit one piece onto the plate, source-over. */
export function blitPiece(
  dst: Plate,
  page: Plate,
  piece: Piece,
  project: (wx: number, wy: number) => [number, number],
): void {
  rasterisePiece(page, piece, project, dst, (px, py, r, g, b, a) => dst.blend(px, py, [r, g, b, a]));
}

/** The four texels one bilinear tap reads, and the fractions between them. */
interface Taps {
  c00: RGBA;
  c10: RGBA;
  c01: RGBA;
  c11: RGBA;
  fx: number;
  fy: number;
}

/**
 * The four texels around `(x, y)`, CLAMPED at the page edge.
 *
 * ⚠️ The clamp is load-bearing beyond this function: `src/atlas.ts` sizes the
 * gutter between packed regions against the fact that one tap reaches exactly one
 * texel, and `gallery/portrait`'s lid runs its art flush to its own window
 * because a clamped tap has no transparent neighbour to reach into. Widening the
 * tap is not a local change.
 */
function taps(page: Plate, x: number, y: number): Taps {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const at = (ix: number, iy: number): RGBA => {
    const cx = Math.max(0, Math.min(page.width - 1, ix));
    const cy = Math.max(0, Math.min(page.height - 1, iy));
    return page.get(cx, cy);
  };
  return { c00: at(x0, y0), c10: at(x0 + 1, y0), c01: at(x0, y0 + 1), c11: at(x0 + 1, y0 + 1), fx: x - x0, fy: y - y0 };
}

/** One channel of a bilinear tap: lerp along x on both rows, then between them. */
function lerpTap(v00: number, v10: number, v01: number, v11: number, fx: number, fy: number): number {
  const top = v00 + (v10 - v00) * fx;
  const bottom = v01 + (v11 - v01) * fx;
  return top + (bottom - top) * fy;
}

/**
 * Sample a straight-alpha page bilinearly — interpolating in PREMULTIPLIED space.
 *
 * ⭐ **Why the premultiply.** The source is straight alpha, so a transparent
 * texel beside the art is `(0, 0, 0, 0)`: its colour is not a colour, it is the
 * absence of one. Averaging R, G and B against it pulls the sample toward black
 * while alpha only drops part of the way, and the difference between those two
 * rates IS a dark rim, one pixel wide, drawn over whatever is behind the part.
 * Weighting each colour by its own alpha and dividing the sum back out gives the
 * transparent texel no vote in the colour, which is the whole of the fix: two
 * parts of one colour, overlapping, come out that colour. Measured before the
 * fix at −60/255 between two parts sharing one flat field, and −31/255 down
 * `gallery/portrait`'s forehead — issue #292.
 *
 * ⭐ **Why alpha is computed the old way, and why equal alpha short-circuits.**
 * `rasteriseQuad` and `rasteriseMesh` gate coverage on `alpha > 0.5`, so the
 * alpha arithmetic decides WHICH pixels are drawn — and through `frameGeometry`,
 * the framing box every reference frame was rendered inside. `lerpTap` on the
 * alpha channel is therefore the original expression, unchanged, not an
 * algebraically equal rearrangement: equal-but-rearranged is a last-bit
 * difference, and a last bit either side of 0.5 is a pixel.
 *
 * For the same reason the equal-alpha case returns early. When all four taps
 * carry one alpha, premultiplying by it and dividing it back out is the identity
 * — so the straight path is not an approximation there, it is the same number,
 * and taking it reproduces the five committed rungs BIT for bit rather than
 * merely closely. What moves is exactly the mixed-alpha tap: the edges, where the
 * rim was.
 */
export function bilinear(page: Plate, x: number, y: number): [number, number, number, number] {
  const { c00, c10, c01, c11, fx, fy } = taps(page, x, y);
  const a = lerpTap(c00[3], c10[3], c01[3], c11[3], fx, fy);
  if (c00[3] === c10[3] && c00[3] === c01[3] && c00[3] === c11[3]) {
    return [
      lerpTap(c00[0], c10[0], c01[0], c11[0], fx, fy),
      lerpTap(c00[1], c10[1], c01[1], c11[1], fx, fy),
      lerpTap(c00[2], c10[2], c01[2], c11[2], fx, fy),
      a,
    ];
  }
  // Every tap is transparent in some proportion that sums to nothing: there is no
  // colour to recover and no pixel to draw (both callers gate on alpha anyway).
  if (a <= 0) return [0, 0, 0, 0];
  const out: [number, number, number, number] = [0, 0, 0, a];
  for (let c = 0; c < 3; c++) {
    const pm = lerpTap(c00[c] * c00[3], c10[c] * c10[3], c01[c] * c01[3], c11[c] * c11[3], fx, fy);
    // Bounded by 255 in exact arithmetic — the weighted mean of the taps' colours
    // cannot exceed their maximum — so the clamp absorbs float error only. It is
    // here rather than trusted because `Plate`'s store is a `Uint8Array`, which
    // WRAPS: 256 would land as a black pixel in the brightest part of the art.
    out[c] = Math.min(255, pm / a);
  }
  return out;
}

/**
 * The same tap, each channel interpolated independently — the arithmetic
 * `bilinear` used until #292, kept as the CONTROL that fix is measured against.
 *
 * 🚫 **Nothing in `src/` calls this, and nothing in `src/` should.** It had one
 * production caller until #306: `src/pose.ts`'s `errBilinear`, on the argument
 * that `materialPlate`'s fourth channel is a material mask rather than opacity.
 * That argument was wrong in the direction that mattered — the mask is exactly
 * the weight the colour wanted, because a texel with no material carries the
 * background's colour and not the part's — so `errBilinear` now takes
 * `bilinear` too, and the only importer left is `selftest.ts`.
 *
 * ⭐ It lives here rather than in the suite so the control shares `taps` — the
 * edge clamp above — with the sampler it is a control for. A hand copy in the
 * test file would drift from it silently, and then `SM01` would be comparing the
 * fix against something that is not what the renderer used to do.
 * `SM08_NO_PRODUCTION_MODULE_READS_THE_STRAIGHT_TAP` is what keeps the first
 * paragraph true rather than merely written down.
 */
export function bilinearChannels(page: Plate, x: number, y: number): [number, number, number, number] {
  const { c00, c10, c01, c11, fx, fy } = taps(page, x, y);
  const out: [number, number, number, number] = [0, 0, 0, 0];
  for (let c = 0; c < 4; c++) out[c] = lerpTap(c00[c], c10[c], c01[c], c11[c], fx, fy);
  return out;
}

export function fill(plate: Plate, colour: RGBA): void {
  for (let y = 0; y < plate.height; y++) for (let x = 0; x < plate.width; x++) plate.set(x, y, colour);
}

/** Look a page up by name, with a failure that names what the atlas did declare. */
export function pageFor(pages: Map<string, Plate>, piece: Piece): Plate {
  const page = pages.get(piece.page);
  if (!page) {
    throw new Error(
      `slot "${piece.slot}" samples atlas page "${piece.page}", which is not among [${[...pages.keys()].join(', ')}]`,
    );
  }
  return page;
}

/** One frame, composited over `background`, at the viewport's pixel size. */
export function renderFrame(frame: Frame, pages: Map<string, Plate>, viewport: Viewport, background: RGBA): Plate {
  const plate = new Plate(viewport.width, viewport.height);
  fill(plate, background);
  const project = projector(viewport);
  for (const piece of frame.pieces) blitPiece(plate, pageFor(pages, piece), piece, project);
  return plate;
}

/**
 * Every frame of one animation as one labelled grid, row major.
 *
 * Not decoration: rung 3's subject is *spacing* — how far a thing travels
 * between two consecutive frames — and that is a comparison across frames. A
 * reader flipping through 65 separate files is comparing against memory.
 *
 * ⭐ It lives here rather than beside either caller because the layout is a
 * CONTRACT: `bench/render_reference.ts` writes the grid, `rigc render` writes the
 * same grid for a user's own build, and `src/check.ts` reads a sheet's tiles back
 * out of it (issue #36). Three programs reading one geometry is one definition or
 * it is a bug waiting for the day two of them are edited apart.
 */
export function contactSheet(frames: Frame[], pages: Map<string, Plate>, viewport: Viewport, tile: number): Plate {
  const tileScale = tile / Math.max(viewport.width, viewport.height);
  const tileW = Math.max(1, Math.round(viewport.width * tileScale));
  const tileH = Math.max(1, Math.round(viewport.height * tileScale));
  const columns = Math.min(SHEET_COLUMNS, frames.length);
  const rows = Math.ceil(frames.length / columns);
  const sheet = new Plate(columns * (tileW + SHEET_GAP) + SHEET_GAP, rows * (tileH + SHEET_GAP) + SHEET_GAP);
  fill(sheet, SHEET_RULE);
  const base = projector(viewport);
  frames.forEach((frame, i) => {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const ox = col * (tileW + SHEET_GAP) + SHEET_GAP;
    const oy = row * (tileH + SHEET_GAP) + SHEET_GAP;
    const plate = new Plate(tileW, tileH);
    fill(plate, BACKGROUND);
    const project = (wx: number, wy: number): [number, number] => {
      const [px, py] = base(wx, wy);
      return [px * tileScale, py * tileScale];
    };
    for (const piece of frame.pieces) blitPiece(plate, pageFor(pages, piece), piece, project);
    plate.text(String(i), 2, 2, 1, SHEET_LABEL);
    for (let y = 0; y < tileH; y++) for (let x = 0; x < tileW; x++) sheet.set(ox + x, oy + y, plate.get(x, y));
  });
  return sheet;
}

/** Where one thing landed in a frame, in frame pixels. */
export interface Footprint {
  /** Alpha-weighted count of covered pixels. 0 means nothing was drawn. */
  pixels: number;
  cx: number;
  cy: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const EMPTY_FOOTPRINT: Footprint = { pixels: 0, cx: 0, cy: 0, minX: 0, minY: 0, maxX: 0, maxY: 0 };

/** Where a frame's pixels went: the coverage mask, and each slot's own footprint. */
export interface FrameGeometry {
  /** 1 where any piece drew, in `viewport.width * viewport.height` row-major order. */
  coverage: Uint8Array;
  footprints: Map<string, Footprint>;
  /**
   * Which owner drew each pixel last, or `-1` — `null` unless `owners` was given.
   *
   * "Last" is the composite's own rule: pieces arrive in draw order, so the owner
   * left in a pixel is the one you would see there. That is deliberately the
   * opposite of `footprints`, which measures each slot on its own pixels
   * *ignoring* what covers it — a footprint answers "where is this part", and
   * this mask answers "whose part is this pixel", and only the second one can be
   * a partition.
   */
  owner: Int32Array | null;
}

/**
 * Rasterise one frame for measurement rather than for looking at: which pixels
 * it covers, and where each slot landed.
 *
 * ⚠️ A slot's footprint is measured on the pixels **that slot draws**, ignoring
 * what is drawn over it. That is deliberate. A slot hidden behind another still
 * has a position, and it is the position the rig gives it; measuring it on the
 * composite would report the occluder's geometry instead and call the rig wrong
 * for being covered up. What the composite costs is on the reference side, where
 * an occluded part merges into its occluder's component — and that is what the
 * matcher reports as ambiguity rather than as drift.
 */
export function frameGeometry(
  frame: Frame,
  pages: Map<string, Plate>,
  viewport: Viewport,
  /** Slot name → owner id, when the caller also wants the per-pixel owner mask. */
  owners?: Map<string, number>,
): FrameGeometry {
  const coverage = new Uint8Array(viewport.width * viewport.height);
  const owner = owners === undefined ? null : new Int32Array(viewport.width * viewport.height).fill(-1);
  const footprints = new Map<string, Footprint>();
  const project = projector(viewport);
  for (const piece of frame.pieces) {
    const owned = owners === undefined ? -1 : (owners.get(piece.slot) ?? -1);
    let weight = 0;
    let sx = 0;
    let sy = 0;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    rasterisePiece(pageFor(pages, piece), piece, project, viewport, (px, py, _r, _g, _b, a) => {
      coverage[py * viewport.width + px] = 1;
      if (owner !== null && owned >= 0) owner[py * viewport.width + px] = owned;
      const w = a / 255;
      weight += w;
      sx += (px + 0.5) * w;
      sy += (py + 0.5) * w;
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    });
    const previous = footprints.get(piece.slot);
    const here: Footprint =
      weight === 0
        ? EMPTY_FOOTPRINT
        : { pixels: weight, cx: sx / weight, cy: sy / weight, minX, minY, maxX: maxX + 1, maxY: maxY + 1 };
    // A slot shows one attachment at a time, so this only merges when a caller
    // hands us a frame with two pieces on one slot; merging is still the honest
    // answer, and it keeps the map keyed by slot the way the report reads it.
    footprints.set(piece.slot, previous && previous.pixels > 0 ? mergeFootprints(previous, here) : here);
  }
  return { coverage, footprints, owner };
}

function mergeFootprints(a: Footprint, b: Footprint): Footprint {
  if (b.pixels === 0) return a;
  const pixels = a.pixels + b.pixels;
  return {
    pixels,
    cx: (a.cx * a.pixels + b.cx * b.pixels) / pixels,
    cy: (a.cy * a.pixels + b.cy * b.pixels) / pixels,
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}
