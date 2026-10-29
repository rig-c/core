import { localChannels, deformChannels, identifyAttachment } from './render_channels.ts';
/**
 * The rasteriser — one code path for reference frames and for candidates.
 *
 * ⭐ Why this is a module and not a script. `bench/render_reference.ts` renders
 * the official export to the PNG frames an authoring agent is allowed to see;
 * `rigc check` renders the agent's own candidate and compares it against those
 * frames. If those two drew pixels differently, every number `check` reports
 * would carry the difference between two renderers on top of the difference
 * between two rigs — and the second is the only one anybody wants to read. So
 * there is exactly one rasteriser, and both callers are thin.
 *
 * ## What it draws
 *
 * Region and mesh attachments, in draw order, tinted by slot colour x attachment
 * colour. Both are **affine** texture maps and neither divides by w:
 *
 * - a **region** is one quad. `spine-core` computes its four world vertices on
 *   the CPU, a destination pixel maps back into the region's rectangle by
 *   inverting one 2x2, and there is no triangle split at all;
 * - a **mesh** is a triangle list. `MeshAttachment.computeWorldVertices` does the
 *   work — it is the runtime's own routine, so weighted vertices resolve through
 *   their bones and a `deform` timeline's offsets are applied, exactly the way a
 *   real runtime would. Each triangle is then filled with barycentric UV
 *   interpolation.
 *
 * A **clipping attachment** draws no pixel of its own and removes the pixels of
 * every slot from the one carrying it through its `end` slot. `piecesOf` runs
 * spine-core's own `SkeletonClipping` beside the draw-order walk, in the call
 * sequence spine-webgl's `SkeletonRenderer.draw` runs, so a slot inside a clip
 * reaches the rasteriser as the geometry the runtime draws rather than as the
 * attachment's whole (issue #844).
 *
 * ⭐ **Sampling is bilinear on both paths, and the source is straight alpha —
 * so the interpolation is premultiplied.** One filter rather than two is not a
 * detail: `check` measures a candidate against reference frames, and a mesh
 * triangle sampled nearest against a reference sampled bilinear would put a
 * filter difference into the residual where only a rig difference belongs.
 * Bilinear rather than nearest because the region path was already bilinear and
 * the five committed rungs are rendered with it.
 *
 * Straight alpha is a property of the SOURCE, not a licence to average it
 * channel by channel: a transparent texel's `(0, 0, 0, 0)` is the absence of a
 * colour, and giving it a vote drew a dark rim along every region edge — over
 * the top of whatever was behind the part, and into `check`'s residual on the
 * candidate side. `bilinear` weights each colour by its own alpha and divides
 * back out; see it for what that does and does not move (issue #292).
 *
 * ⚠️ **Region rasterising is untouched by the mesh path**, deliberately. A region
 * could be drawn as two triangles and very nearly the same pixels would come out;
 * "very nearly" would have silently rewritten five rungs of committed reference
 * frames. `rasteriseQuad` still owns regions, `rasteriseMesh` owns meshes, and
 * `rasterisePiece` picks.
 *
 * ## The fill rule, and why a mesh needs one
 *
 * Two triangles that share an edge must cover the pixels along it exactly once.
 * Include the boundary in both and every interior edge of a mesh blends twice —
 * a visible lattice of seams wherever the art is not opaque. Exclude it in both
 * and the seams become holes.
 *
 * So `rasteriseMesh` normalises each triangle's winding and applies the standard
 * **top-left rule**: a pixel centre exactly on an edge belongs to the triangle
 * only when that edge is a top or a left one. The two triangles sharing an edge
 * traverse it in opposite directions, so exactly one of them calls it top-left —
 * which is the property that makes the rule watertight without an epsilon.
 *
 * ## Two conventions this file owns
 *
 * - **Spine world is y up; an image is y down.** The projection from world to
 *   frame pixels lives in `projector` and nowhere else.
 * - **The framing box is measured at `FRAMING_FPS`, whatever rate frames are
 *   written at.** The union of the posed vertices depends on WHICH TIMES you
 *   sample, so taking it at the output rate made the viewport a property of the
 *   rate: rung 1's `balls` framed to 256x240 at 12 fps and 256x239 at 24 fps.
 *   One pixel is enough to be a trap — the two sets look comparable, an author
 *   measures a distance in one and a time in the other, and the scale between
 *   them is silently off.
 *
 * ⚠️ Two notes on where this sits. It imports `spine-core`, which `src/` is
 * otherwise careful about: posing a skeleton *is* running the runtime, and there
 * is no honest way to render one without it. (Since issue #968 that holds for a
 * Spine export: a rigc build is posed by rigc's own core through
 * `./render_core.ts`, and this file keeps the runtime for the export's poser,
 * the export's atlas pages and texture substitution — see *which poser* below.
 * Since issue #1014 a rigc build the core poses touches none of it: what a
 * render reads off the candidate besides the pose comes from its model
 * document and the skeleton's own JSON (`loadCandidate`), and since issue
 * #1020 its pages and a `--texture-from` atlas through rigc's own reader, so
 * spine-core is reached only where it poses an export or a fallback.) The rule that matters is unchanged
 * — `src/compile.ts` must stay independent of the runtime so the compiler and
 * the gate are not checking each other's assumptions — and this file is neither.
 * It also imports `tools/plate.ts` for the PNG codec, which is dependency-free.
 *
 * ## What is here, and what is not (issue #1052)
 *
 * Only what names the runtime: spine-core's implementation of the posing seam
 * (`spinePoser`), loading a Spine export (`posableFromText`, `loadPosedSkeleton`,
 * and the half of `loadCandidate` an export takes), the atlas class's readings
 * (`atlasPageNames`, the `spine` reader of a texture substitution), and what
 * reads a posed spine-core skeleton (`piecesOf`, `boneSnapshots`,
 * `posedNumbersOf`, the rest table). Everything else — the frame-set contract,
 * the samplers, the candidate and its poser choice, the geometry export, the
 * framing and the rasteriser — is `./render_shared.ts`, which links nothing of
 * the runtime, and every name it holds that this file exported is re-exported
 * from here. That module reaches this one's half through the seam
 * (`./spine_side.ts`): loading this file registers it (`registerSpinePosing`,
 * at the bottom), so every program that imports it renders exactly as before,
 * and one that does not refuses an export by name.
 */
import {
  AnimationState,
  AnimationStateData,
  AtlasAttachmentLoader,
  ClippingAttachment,
  MeshAttachment,
  Physics,
  RegionAttachment,
  Skeleton,
  SkeletonClipping,
  SkeletonJson,
  Slider,
  TextureAtlas,
  TextureAtlasRegion,
  SkeletonData,
  type Slot,
} from '@esotericsoftware/spine-core';
import { readFileSync } from 'node:fs';
// `dirname` is read by no body here today: RC23's `bonedist-pages` plant puts a `loadPosable(…, dirname(atlasPath))` back into
// `loadPosedSkeleton`, and kept, the plant reads red for its own reason rather than for a missing name.
import { dirname, join } from 'node:path';
import { Plate, readPlate } from '../tools/plate.ts';
import { clipSourceOf, corePoser, inactiveBoneSnapshot, physicsClockStep, subsetOver, unposedBones } from './render_core.ts';
import { type PosedVertices, type WorldTransform } from './nonfinite.ts';
import type { EnvironmentChange } from './environment.ts';
import {
  atlasScales,
  choosePosers,
  pairRefusal,
  refuseUnchosen,
  regionKey,
  type AttachmentPose,
  type AttachmentRest,
  type BoneSnapshot,
  type DrawOptions,
  type MakeCorePoser,
  type Piece,
  type PieceTexture,
  type PoseOptions,
  type Posed,
  type Poser,
  type PoserChoice,
  type PoserName,
  type SkeletonFacts,
  type SkinRoster,
  type SlotSubset,
  type SubstituteRegion,
} from './render_shared.ts';
import { POSING_RUNTIME_TAIL, registerSpinePosing, SpineRuntimeError, spineRuntimeSentence } from './spine_side.ts';

// Every name `./render_shared.ts` holds that this file exported before issue #1052, re-exported so a dependant's
// import resolves where it always did.
export {
  BACKGROUND,
  CandidateAtlasError,
  CandidatePairError,
  EMPTY_FOOTPRINT,
  FRAMES_SIDECAR,
  FRAMES_SPEC,
  FRAMING_FPS,
  GEOMETRY_COORDINATES,
  GEOMETRY_FILE,
  GEOMETRY_SPEC,
  GeometryError,
  PAD,
  POSER_NAMES,
  PROTOCOL_FPS,
  PoserChoiceError,
  SETUP_POSE_DIR,
  SHEET_COLUMNS,
  SHEET_FILE,
  SHEET_GAP,
  SHEET_LABEL,
  SHEET_RULE,
  SHEET_TILE,
  SUBSTITUTE_PAGE,
  SlotSubsetError,
  UnframeablePoseError,
  atlasScales,
  bilinear,
  bilinearChannels,
  blitPiece,
  contactSheet,
  fill,
  frameGeometry,
  framingViewport,
  geometryFileOf,
  geometryText,
  loadCandidate,
  nonFinitePoseOf,
  pageFor,
  projector,
  rasteriseMesh,
  rasterisePiece,
  rasteriseQuad,
  refuseUnchosen,
  regionTrim,
  renderFrame,
  sampleAll,
  sampleAnimation,
  sampleSetupPose,
  sidecarViewport,
  skeletonFacts,
  slotsOnUnposedBones,
  substituteTexture,
  textureSubstitutionFromText,
  throughPoser,
  trimmedUnionBounds,
  unframeableSentence,
  unionBounds,
  viewportFor,
  viewportOfSize,
} from './render_shared.ts';
export type {
  AttachmentPose,
  AttachmentRest,
  BoneSnapshot,
  Candidate,
  ClipSource,
  DrawOptions,
  EmitPixel,
  Footprint,
  Frame,
  FrameGeometry,
  FrameSet,
  FramesSidecar,
  GeometryBone,
  GeometryFile,
  GeometryFrame,
  MakeCorePoser,
  Mesh,
  Piece,
  PieceCommon,
  PieceTexture,
  PoseOptions,
  Posed,
  Poser,
  PoserChoice,
  PoserName,
  Quad,
  RegionTrim,
  SkeletonFacts,
  SkinRoster,
  SlotSubset,
  SubstituteRegion,
  SubstitutionReader,
  TextureSubstitution,
  UvWindow,
  Viewport,
} from './render_shared.ts';
// The refusal of a run that needs the runtime and cannot use it — `./spine_side.ts`'s since issue #1052, where an
// entry that registered no Spine side is refused in the same words.
export { SpineRuntimeError };

/**
 * Resolve `slots` / `hidden` against `data` as posed under `skin`, or refuse by name.
 *
 * `undefined` when neither is set — the whole rig, which is the ordinary case and
 * costs nothing. Refused, each naming what would have worked:
 *
 * - **both at once** — one statement two ways, as `--rig` with `--cut` is;
 * - **a name the skeleton does not declare** — with every slot it does declare,
 *   in draw order, and how many;
 * - **a slot whose attachments live only under skins this pose does not
 *   resolve through.** Every slot is declared at the skeleton's top level, so
 *   "a slot only a named skin declares" is not a shape the format has — what a
 *   skin declares is the slot's ART. A pose resolves an attachment through the
 *   skin it was set to and then the default skin (`Skeleton.getAttachment`), so
 *   a slot none of whose attachments is in either of those draws nothing in
 *   every frame, and `--slot` on it would be a blank picture that looks like an
 *   answer. The refusal names the skin(s) that do carry it.
 *
 * ⚠️ A declared slot with no attachment in ANY skin is accepted: it draws
 * nothing under every skin, so there is no skin to name and no picture of it
 * that a different invocation would produce.
 */
export function slotSubsetOf(
  data: SkeletonData,
  opts: Pick<PoseOptions, 'slots' | 'hidden'> | undefined,
  skin: string | undefined,
): SlotSubset | undefined {
  // The rule is `subsetOver`'s (`./render_core.ts`), shared with the core
  // poser; this is the roster a parsed Spine skeleton gives it.
  return subsetOver(
    {
      declared: data.slots.map((slot) => slot.name),
      carriers: (name) => {
        const index = data.findSlot(name)?.index ?? -1;
        return data.skins.filter((s) => s.getAttachments().some((entry) => entry.slotIndex === index)).map((s) => s.name);
      },
      defaultSkin: data.defaultSkin?.name ?? null,
    },
    opts,
    skin,
  );
}

/**
 * A fresh skeleton with `skin` applied, or refused by name.
 *
 * ## Why the skin goes on before `setupPose`, and why nothing else is needed
 *
 * `Skeleton.setSkin` (spine-core 4.3.13 `Skeleton.js:279-311`) attaches the new
 * skin's art into each slot's pose and calls `updateCache`, which is what turns
 * on a `skinRequired` bone or constraint the skin names. Every sampler below
 * then calls `skeleton.setupPose()`, and `setupPose` → `setupPoseSlots`
 * (`Skeleton.js:231-249`) re-resolves each slot's setup attachment through
 * `Slot.setupPose` → `Skeleton.getAttachment`, which checks `this.skin` first
 * and `SkeletonData.defaultSkin` second (`Skeleton.js:335-346`). So the setup
 * pose of a skinned skeleton is already the skin's, and the extra
 * `setSlotsToSetupPose()` a 4.1-era recipe prescribes has no 4.3 spelling to
 * call: the method is named `setupPoseSlots` here, and `setupPose()` runs it.
 *
 * `setSkin(string)` exists too, but its by-name half throws
 * `Skin not found: <name>` (`Skeleton.js:286-291`) — a message that names the
 * miss and not the alternatives. Everything in a rig resolves by name and a miss
 * is refused **by name, with the names that would have worked**, so the lookup
 * happens here and the runtime is handed a `Skin` it cannot fail on.
 */
function skeletonUnderSkin(data: SkeletonData, skin: string | undefined): Skeleton {
  const skeleton = new Skeleton(data);
  if (skin === undefined) return skeleton;
  const found = data.findSkin(skin);
  if (!found) {
    throw new Error(
      `no skin ${JSON.stringify(skin)} in this skeleton; it declares [${
        data.skins.map((s) => s.name).join(', ') || 'none'
      }]`,
    );
  }
  skeleton.setSkin(found);
  return skeleton;
}

/**
 * Every bone's world transform in the skeleton's own declaration order — a bone
 * the posed skin leaves unposed (inactive, or below an inactive bone) written as the zero transform
 * (`inactiveBoneSnapshot` in `./render_core.ts`: it is not posed, and what a
 * constraint left in its matrix is not a pose — issue #968).
 */
export function boneSnapshots(skeleton: Skeleton): BoneSnapshot[] {
  const unposed = unposedBones(skeleton.bones.map((bone) => ({ name: bone.data.name, parent: bone.parent?.data.name ?? null, active: bone.active })));
  return skeleton.bones.map((bone) => {
    // Not posed under this skin: the seam's zero snapshot (`inactiveBoneSnapshot`, issue #968).
    if (unposed.has(bone.data.name)) return inactiveBoneSnapshot(bone.data.name);
    const pose = bone.appliedPose;
    return {
      name: bone.data.name,
      worldX: pose.worldX,
      worldY: pose.worldY,
      a: pose.a,
      b: pose.b,
      c: pose.c,
      d: pose.d,
      rotationX: pose.getWorldRotationX(),
      rotationY: pose.getWorldRotationY(),
      scaleX: pose.getWorldScaleX(),
      scaleY: pose.getWorldScaleY(),
    };
  });
}

/** A loaded skeleton and every atlas page it can sample, keyed by page name. */
export interface Posable {
  data: SkeletonData;
  pages: Map<string, Plate>;
}

/**
 * Load a skeleton, its atlas and every page the atlas declares.
 *
 * Every page, not the first: rigc emits **one part per page**, so a rigc
 * candidate for rung 1 has eight of them. `render_reference.ts` used to insist
 * on exactly one because an editor export packs into one — that assumption is
 * true of the reference and false of every candidate, and a renderer both sides
 * share cannot hold it.
 */
export function loadPosable(skeletonPath: string, atlasPath: string, atlasDir: string): Posable {
  return posableFromText(readFileSync(skeletonPath, 'utf8'), readFileSync(atlasPath, 'utf8'), atlasDir);
}

/**
 * The page names an atlas declares, in the order it declares them.
 *
 * Through `TextureAtlas` rather than by reading the lines: a page name and a
 * region name are both unindented in the atlas format, so anything that told them
 * apart here would be a second opinion about the file's syntax — and the one
 * caller that needs this list (`rigc preview`, embedding each page) has to agree
 * exactly with the player that will ask for them by name.
 */
export function atlasPageNames(atlasText: string): string[] {
  return new TextureAtlas(atlasText).pages.map((page) => page.name);
}

/** Same, for artifacts held in memory rather than on disk. */
export function posableFromText(skeletonText: string, atlasText: string, atlasDir: string): Posable {
  const atlas = new TextureAtlas(atlasText);
  const pages = new Map<string, Plate>();
  for (const page of atlas.pages) pages.set(page.name, readPlate(join(atlasDir, page.name)));
  const data = new SkeletonJson(new AtlasAttachmentLoader(atlas)).readSkeletonData(JSON.parse(skeletonText));
  return { data, pages };
}

/** The facts as spine-core loaded them — an export's reading, and every candidate's before issue #1014; `atlasText` the atlas it was loaded through. */
export function spineFacts(data: SkeletonData, atlasText: string | null): SkeletonFacts {
  return {
    atlasScales: atlasText === null ? null : atlasScales(atlasText),
    animations: data.animations.map((a) => a.name),
    skins: data.skins.map((s) => s.name),
    // `SkeletonJson` copies both header fields across unconditionally, so an omitted extent is `undefined` here, not 0.
    declaresStage: typeof data.width === 'number' && typeof data.height === 'number',
    bones: data.bones.map((bone) => ({ name: bone.name, parent: bone.parent === null ? null : bone.parent.name })),
    slots: data.slots.map((slot) => ({ name: slot.name, bone: slot.boneData.name })),
    subset: (opts, skin) => slotSubsetOf(data, opts, skin),
  };
}

/** Touch the runtime once, before anything is parsed through it, and refuse by name when it cannot be used. */
function requireSpineRuntime(label: string, why: string): void {
  try {
    // A property read on the class the load starts from: no runtime code runs, and a runtime that cannot be used throws here.
    void TextureAtlas.prototype;
  } catch (err) {
    // The sentence an entry that registered no Spine side is refused in too (`./spine_side.ts`), with the runtime's own words as the reason.
    throw new SpineRuntimeError(spineRuntimeSentence(label, why, (err as Error).message, POSING_RUNTIME_TAIL));
  }
}

/**
 * The one place a candidate's skeleton is handed to the runtime's parser
 * against its atlas (issues #1033, #1042): a pair it cannot load is `refuse`'s
 * refusal, given the runtime's own message, rather than the runtime's throw
 * and a stack. The JSON is parsed outside the catch: a file that is not JSON
 * is not something the runtime said, and the CLI refuses it by name before it
 * gets here (`readSkeletonText`).
 */
function spineSkeletonData(skeletonText: string, atlasText: string, refuse: (runtime: string) => Error): SkeletonData {
  const json = JSON.parse(skeletonText);
  const reader = new SkeletonJson(new AtlasAttachmentLoader(new TextureAtlas(atlasText)));
  try {
    return reader.readSkeletonData(json);
  } catch (err) {
    throw refuse(err instanceof Error ? err.message : String(err));
  }
}

/**
 * A skeleton a user named, posed through spine-core for what its bones do —
 * `bonedist`'s two sides (issue #1042). A pair that does not load is refused
 * by name (`CandidatePairError`, `pairRefusal` with `poses`), `why` saying
 * which side and what the pose is read for.
 *
 * ⭐ The skeleton data alone, and no page: `bonedist` reads bone world
 * transforms and samples no pixel, and the atlas's regions — which the
 * runtime resolves every attachment against — are in the atlas text. Reading
 * the page PNGs as `loadPosable` does made a pair whose pages are elsewhere
 * die on an ENOENT for images the command never looks at; the figures are the
 * same with or without them (the PR of #1042 measures it).
 *
 * `loadPosable` and `posableFromText` stay the unguarded loaders, for pairs
 * the caller wrote itself (the tools and the selftest), where the runtime's
 * own message is what the caller reads.
 */
export function loadPosedSkeleton(skeletonPath: string, atlasPath: string, why: string): SkeletonData {
  const paths = { skeleton: skeletonPath, atlas: atlasPath };
  return spineSkeletonData(readFileSync(skeletonPath, 'utf8'), readFileSync(atlasPath, 'utf8'), (runtime) => pairRefusal(skeletonPath, paths, why, runtime, 'poses'));
}

/** What every sampler takes: a poser, or spine-core's parsed skeleton, which is posed through `spinePoser`. */
export type PoseSource = Poser | SkeletonData;

// ---------------------------------------------------------------------------
// the spine-core implementation of the seam
// ---------------------------------------------------------------------------

/**
 * `Poser` over spine-core: the runtime's own `Skeleton`, `AnimationState` and
 * `SkeletonClipping`, stepped the way a runtime steps them.
 *
 * The pose is driven through `AnimationState` rather than `Animation.apply`
 * because that is the path a runtime actually takes, and 4.3's
 * `Animation.apply` takes a `MixFrom` that only the state machine has any
 * business choosing. Frame 0 applies, updates by 0 and resets physics; every
 * later frame is one `state.update(1/fps)`, apply, `skeleton.update` and
 * `Physics.update` — one continuous trajectory, so the track time of frame `i`
 * is the sum of `i` steps. The skeleton's clock, which only the physics reads,
 * moves by `physicsClockStep(1/fps)` (`PHYSICS_CLOCK_LEAD`, issue #1380).
 */
export function spinePoser(data: SkeletonData): Poser {
  return {
    animations: data.animations.map((a) => ({ name: a.name, duration: a.duration })),
    bones: data.bones.map((bone) => ({ name: bone.name, parent: bone.parent?.name ?? null })),
    slots: data.slots.map((slot) => ({ name: slot.name, bone: slot.boneData.name })),
    subset: (opts, skin) => slotSubsetOf(data, opts, skin),
    setup: (skin) => spinePosed(setupPosed(data, skin)),
    animation: (name, skin, fps, count, visit, environment) => {
      const skeleton = skeletonUnderSkin(data, skin);
      const state = new AnimationState(new AnimationStateData(data));
      // Not looping: the last frame sits at the animation's duration, and a looping
      // entry would wrap it back onto the first pose.
      state.setAnimation(0, name, false);
      skeleton.setupPose();
      const step = 1 / fps;
      // The physics clock runs `PHYSICS_CLOCK_LEAD` fast, so no frame ends on a physics step's tie (issue #1380).
      const clock = physicsClockStep(step);
      const posed = spinePosed(skeleton);
      for (let i = 0; i <= count; i++) {
        if (i > 0) {
          state.update(step);
          state.apply(skeleton);
          setSkeletonEnvironment(skeleton, environment?.(i));
          skeleton.update(clock);
          skeleton.updateWorldTransform(Physics.update);
        } else {
          state.apply(skeleton);
          setSkeletonEnvironment(skeleton, environment?.(i));
          skeleton.update(0);
          skeleton.updateWorldTransform(Physics.reset);
        }
        visit(i, posed);
      }
    },
    rest: (skin, shown) => restOf(data, skin, shown),
  };
}

/**
 * `render --environment`'s change for one frame (issue #1416), set on spine-core's own `Skeleton` before the update that
 * poses the frame: `wind` is `windX, windY` and `gravity` is `gravityX, gravityY`, both in the runtime's convention, x
 * right and y down — the live track's `setEnvironment` mapping, held to these four fields by the core suite's `CO56`. A
 * half left out keeps the one standing, as the core merges it.
 */
function setSkeletonEnvironment(skeleton: Skeleton, change: EnvironmentChange | undefined): void {
  if (change?.wind !== undefined) [skeleton.windX, skeleton.windY] = change.wind;
  if (change?.gravity !== undefined) [skeleton.gravityX, skeleton.gravityY] = change.gravity;
}

/** A spine-core skeleton as it stands posed, read through the seam's `Posed`. */
function spinePosed(skeleton: Skeleton): Posed {
  return {
    pieces: (draw) => drawPieces(skeleton, draw),
    bones: () => boneSnapshots(skeleton),
    attachments: (identity) => attachmentsOf(skeleton, identity),
    physics: () => steppedPhysicsOf(skeleton),
    channels: () => {
      const values = localChannels(skeleton.bones.map((b) => {
        const p = b.appliedPose;
        return { name: b.data.name, rotation: p.rotation, x: p.x, y: p.y, scaleX: p.scaleX, scaleY: p.scaleY, shearX: p.shearX, shearY: p.shearY };
      }), skeleton.constraints.filter((c): c is Slider => c instanceof Slider && c.active && c.appliedPose.mix !== 0 && (c.bone === null || c.bone.active)).map((c) => ({ name: c.data.name, time: c.appliedPose.time })));
      for (const slot of skeleton.slots) {
        const a = slot.appliedPose.attachment;
        if (!(a instanceof MeshAttachment)) continue;
        const setup = a.bones === null ? Array.from(a.vertices) : new Array<number>(a.vertices.length / 3 * 2).fill(0);
        values.push(...deformChannels(slot.data.name, a.name, slot.appliedPose.deform, setup, a));
      }
      return values;
    },
  };
}

/**
 * `Posed.physics` on spine-core (issue #1467): every physics constraint whose
 * `lastTime` reads the skeleton's `time` after a step that moved it — which
 * `PhysicsConstraint.update` sets under `Physics.update` and `Physics.reset`,
 * and which an inactive constraint, a mix of 0 or `Physics.none` leaves where
 * it was. The setup pose and frame 0 sit at time 0 and step none.
 */
function steppedPhysicsOf(skeleton: Skeleton): string[] {
  if (!(skeleton.time > 0)) return [];
  return skeleton.physics
    .filter((c) => c.lastTime === skeleton.time)
    .map((c) => c.data.name)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * A fresh skeleton under `skin`, stepped into its setup pose — the one recipe
 * `sampleSetupPose` and the geometry export's `rest` table both pose from, so
 * the two cannot come to describe different rest poses.
 */
function setupPosed(data: SkeletonData, skin: string | undefined): Skeleton {
  const skeleton = skeletonUnderSkin(data, skin);
  skeleton.setupPose();
  skeleton.update(0);
  skeleton.updateWorldTransform(Physics.reset);
  return skeleton;
}

/** A named clip's authored setup polygon under its own skin, with no deform. */
export function setupClipPolygon(
  data: SkeletonData,
  skin: string,
  slotName: string,
  attachmentName: string,
): number[] {
  const skeleton = setupPosed(data, skin);
  const index = data.findSlot(slotName)?.index ?? -1;
  const slot = skeleton.slots[index];
  const attachment = data.findSkin(skin)?.getAttachment(index, attachmentName);
  if (slot === undefined || !(attachment instanceof ClippingAttachment)) {
    throw new Error(
      `setup clip skin ${JSON.stringify(skin)} slot ${JSON.stringify(slotName)} attachment ${JSON.stringify(attachmentName)} did not resolve`,
    );
  }
  slot.appliedPose.deform.length = 0;
  const polygon = new Array<number>(attachment.worldVerticesLength).fill(0);
  attachment.computeWorldVertices(skeleton, slot, 0, attachment.worldVerticesLength, polygon, 0, 2);
  return polygon;
}

/**
 * Both posers for the skeleton at `skeletonPath` drawn through the atlas at
 * `atlasPath`, with spine-core's parse of it already in hand (`data`) — the
 * choice `loadCandidate` makes, for a caller that loaded the pair itself.
 * `forced` is `--poser`; `core` on an input that cannot carry it is refused by
 * name (`PoserChoiceError`).
 */
export function candidatePosers(
  data: SkeletonData,
  skeletonPath: string,
  atlasPath: string,
  forced: PoserName | undefined,
  /** What builds the core poser: `corePoser` — the suite's `RC02`, `RC43` and `RC44` pass planted or counted copies, and nothing else passes any. */
  make: MakeCorePoser = corePoser,
): PoserChoice {
  return refuseUnchosen(choosePosers(skeletonPath, atlasPath, readFileSync(atlasPath, 'utf8'), forced, () => data, make).choice);
}

/**
 * The posed drawables of one frame, in draw order.
 *
 * Regions and meshes take the same three steps — resolve the sequence index,
 * ask `spine-core` for the world vertices, read the page UVs back off the same
 * sequence — and differ only in which runtime call does step two. An attachment
 * type that is neither is skipped rather than refused: a bounding box, a point
 * and a clipping attachment are all things a rig legitimately carries and none
 * of them draws a pixel.
 *
 * ## A clipping attachment is skipped as a piece and applied as a mask
 *
 * It draws nothing, and it removes what every slot from its own through its
 * `end` slot draws outside its polygon. Skipping it outright drew those pixels —
 * measured on a port whose eye masks clip the irises: the blink frame read MAE
 * 1.07 against 0.53 at an open eye, with both irises drawn over closed lids,
 * where spine-webgl reads 0.16 (issue #844). So spine-core's own
 * `SkeletonClipping` runs beside the walk, and the call sequence is
 * spine-webgl's `SkeletonRenderer.draw` (branch `4.3`) step for step: at a
 * clipping attachment `clipEnd(slot)` then `clipStart(skeleton, slot, clip)` and
 * nothing drawn; at every other slot, drawn or not, `clipEnd(slot)` after it,
 * which is what ends a clip AT its end slot rather than before it; `clipEnd()`
 * after the walk. The polygon, its convex decomposition, `inverse` and `convex`
 * are the clipper's, so there is no second opinion about any of them here.
 *
 * A slot inside a clip hands its world vertices, its triangles — a region's are
 * the runtime's own `0 1 2 2 3 0` — and its UVs to `clipTrianglesUnpacked`, and
 * the piece carries what comes back. ⚠️ **Only when the clipper says it clipped**,
 * exactly as spine-webgl uses the result only when `clipTriangles` returns
 * true: an attachment wholly inside the polygon draws its own geometry, so a
 * region there is still a `Quad` and its pixels are the unclipped ones to the
 * bit. One that is cut becomes a `Mesh` — the clipper's output is a triangle
 * list — and one wholly outside becomes a mesh with no triangle, which keeps the
 * slot in the frame, undrawn, rather than absent.
 *
 * ⭐ A cut piece's pixels are sampled at each drawn triangle's SOURCE triangle's
 * affine UV (`Mesh.source`), not at its own float32 corner UVs (issue #964):
 * which convex pieces a clipper cuts a concave polygon into is the clipper's —
 * spine-core's, the core's, or spine-core's under another spelling of the same
 * polygon — and only this keeps the picture from depending on it. Measured: the
 * same notched square spelled from four start vertices moved up to 18 pixels one
 * level against itself through spine-core before, 0 after; the 19 tree rows'
 * renders did not move (spineboy-pro's portal, the one clipped row, included).
 * An unclipped piece carries no `source` and is rasterised as before, byte for
 * byte.
 *
 * The clip is applied whatever `slots`/`hidden` draw: a hidden clip still masks
 * what is shown, so a subset frame is the whole frame's pixels for those slots.
 * `unclipped` turns it off for the framing box alone — see its note.
 */
export function piecesOf(skeleton: Skeleton, opts?: PoseOptions): Piece[] {
  // A skin is chosen before a skeleton is posed, and this one is already posed —
  // so there is nothing honest to do with the name except say so. Silently
  // ignoring it is the shape of defect #571 itself: a skin asked for, no skin
  // applied, and a picture that looks like an answer.
  if (opts?.skin !== undefined) {
    throw new Error(
      `piecesOf was asked for skin ${JSON.stringify(opts.skin)}, and it reads a skeleton that is already posed. ` +
        'Ask a sampler for it — sampleSetupPose/sampleAnimation/sampleAll take { skin } — or call ' +
        'skeleton.setSkin(...) and skeleton.setupPose() before this.',
    );
  }
  // Resolved against the skeleton as it was posed — its own slots and the skin
  // it was set to — so a name that draws nothing is refused here, where the one
  // application point is, rather than matching no piece in silence.
  const subset = slotSubsetOf(skeleton.data, opts, skeleton.skin?.name);
  return drawPieces(skeleton, { subset, unclipped: opts?.unclipped === true, texture: opts?.texture === true });
}

/** `piecesOf`'s walk over a posed spine-core skeleton, the subset already resolved — the spine poser's `Posed.pieces`. */
function drawPieces(skeleton: Skeleton, draw: DrawOptions): Piece[] {
  const { subset } = draw;
  const named = subset === undefined ? undefined : new Set(subset.names);
  const clipper = draw.unclipped ? null : new SkeletonClipping();
  const pieces: Piece[] = [];
  for (const slot of skeleton.drawOrder.appliedPose) {
    const attachment = slot.appliedPose.attachment;
    if (attachment instanceof ClippingAttachment) {
      if (clipper !== null) {
        clipper.clipEnd(slot);
        // spine-webgl ends the clip at a slot whose bone is inactive and starts
        // none there; the order of the two calls is the same either way.
        if (slot.bone.active) clipper.clipStart(skeleton, slot, attachment);
      }
      continue;
    }
    const drawn = subset === undefined || named === undefined || named.has(slot.data.name) === (subset.mode === 'slots');
    const piece = drawn ? pieceOf(skeleton, slot, draw.texture, clipper) : null;
    if (piece !== null) pieces.push(piece);
    clipper?.clipEnd(slot);
  }
  clipper?.clipEnd();
  return pieces;
}

/** The runtime's own triangulation of a region's quad — spine-webgl's `QUAD_TRIANGLES`. */
const QUAD_TRIANGLES = [0, 1, 2, 2, 3, 0];

/**
 * One slot's posed drawable, or `null` for an attachment that draws nothing —
 * clipped by `clipper` when a clip is active over it (see `piecesOf`).
 */
function pieceOf(
  skeleton: Skeleton,
  slot: Slot,
  withTexture: boolean,
  clipper: SkeletonClipping | null,
): Piece | null {
  const pose = slot.appliedPose;
  const attachment = pose.attachment;
  if (!attachment) return null;
  const isMesh = attachment instanceof MeshAttachment;
  if (!isMesh && !(attachment instanceof RegionAttachment)) return null;

  const index = attachment.sequence.resolveIndex(pose);
  const region = attachment.sequence.regions[index];
  if (!(region instanceof TextureAtlasRegion)) {
    throw new Error(
      `slot "${slot.data.name}" attachment "${attachment.name}" resolved to no atlas region; ` +
        'the attachment names a region the atlas does not have',
    );
  }
  const tint = tintOf(slot, attachment);
  // The dark colour is the SLOT's alone — an attachment has a `color` and no
  // dark one, so there is nothing to multiply it by. Read off `appliedPose`
  // like the light colour, so an `rgba2` timeline reaches the picture.
  const darkPose = pose.darkColor;
  const dark: [number, number, number] | undefined =
    darkPose === null ? undefined : [darkPose.r, darkPose.g, darkPose.b];
  const common = { tint, dark, slot: slot.data.name, page: region.page.name };
  const texture = withTexture ? artUvsOf(attachment, region) : undefined;
  const uvs = attachment.sequence.getUVs(index);

  let piece: Piece;
  let triangles: number[];
  const world = worldVerticesOf(skeleton, slot, attachment);
  if (isMesh) {
    triangles = attachment.triangles;
    piece = { kind: 'mesh', ...common, texture, world, uvs, triangles };
  } else {
    triangles = QUAD_TRIANGLES;
    piece = { kind: 'region', ...common, texture, world, uvs };
  }
  if (clipper === null || !clipper.isClipping()) return piece;
  return clippedPiece(piece, triangles, uvs, clipper);
}

/** Slot colour x attachment colour, straight alpha — what a piece is tinted by and a geometry entry records. */
function tintOf(slot: Slot, attachment: MeshAttachment | RegionAttachment): [number, number, number, number] {
  const colour = slot.appliedPose.color;
  const own = attachment.color;
  return [colour.r * own.r, colour.g * own.g, colour.b * own.b, colour.a * own.a];
}

/**
 * One attachment's world vertices on `slot`, whole, by the runtime's own routine.
 *
 * The one place either kind is asked for them: `pieceOf` draws what this returns
 * and `attachmentsOf` records it, so a drawn frame and its geometry export
 * cannot disagree about where a vertex is.
 *
 * `worldVerticesLength` is 2 per vertex whether or not the mesh is weighted —
 * the weight runs live in `vertices`, not here — so this is the full output
 * length and the whole mesh is computed in one call. Deform offsets, if the
 * slot's pose carries any, are applied inside it; a region's offsets are read
 * for the sequence frame the slot's pose resolves.
 */
function worldVerticesOf(skeleton: Skeleton, slot: Slot, attachment: MeshAttachment | RegionAttachment): number[] {
  if (attachment instanceof MeshAttachment) {
    const world = new Array<number>(attachment.worldVerticesLength).fill(0);
    attachment.computeWorldVertices(skeleton, slot, 0, attachment.worldVerticesLength, world, 0, 2);
    return world;
  }
  const world = new Array<number>(8).fill(0);
  attachment.computeWorldVertices(slot, attachment.getOffsets(slot.appliedPose), world, 0, 2);
  return world;
}

/**
 * Every slot's region or mesh attachment, whole, in the posed draw order — see
 * `Frame.attachments`. No subset and no clip: those are `piecesOf`'s business.
 */
function attachmentsOf(skeleton: Skeleton, identity = false): AttachmentPose[] {
  const out: AttachmentPose[] = [];
  for (const slot of skeleton.drawOrder.appliedPose) {
    const attachment = slot.appliedPose.attachment;
    if (!(attachment instanceof MeshAttachment) && !(attachment instanceof RegionAttachment)) continue;
    const row = {
      slot: slot.data.name,
      attachment: attachment.name,
      vertices: worldVerticesOf(skeleton, slot, attachment),
      color: tintOf(slot, attachment),
    };
    out.push(identity ? identifyAttachment(row, attachment) : row);
  }
  return out;
}

/**
 * `piece` as the active clip leaves it, or `piece` itself when the clipper cut
 * nothing — see `piecesOf`.
 *
 * The page UVs and the original-art UVs (`PieceTexture`, when the piece carries
 * them) each go through their own `clipTrianglesUnpacked` call over the same
 * vertices and triangles. The clipper's geometry depends on the positions alone
 * and it interpolates a UV set barycentrically inside each source triangle, so
 * the two calls cut the same polygons and each UV set lands on them — which is
 * what lets `substituteTexture` re-seat a clipped piece exactly as it re-seats a
 * whole one, through the drawing's own coordinates. The vertex count is compared
 * all the same, because a clipped piece whose two UV sets disagreed on it would
 * sample the wrong texels and say nothing.
 */
function clippedPiece(piece: Piece, triangles: number[], uvs: Float32Array, clipper: SkeletonClipping): Piece {
  if (!clipper.clipTrianglesUnpacked(piece.world, 0, triangles, triangles.length, uvs, 2)) return piece;
  const world = Array.from(clipper.clippedVerticesTyped);
  const clippedUvs = Array.from(clipper.clippedUVsTyped);
  const clipped = Array.from(clipper.clippedTrianglesTyped);
  // Which source triangle each drawn triangle was cut from (`Mesh.source`): the clipper cuts triangle by triangle, so each source
  // triangle is clipped alone and its drawn triangles counted; the concatenation is held to the whole call's output, vertex for vertex.
  const sources: number[] = [];
  const again: number[] = [];
  for (let t = 0; t + 2 < triangles.length; t += 3) {
    clipper.clipTrianglesUnpacked(piece.world, 0, triangles.slice(t, t + 3), 3, uvs, 2);
    for (let k = 0; k < clipper.clippedTrianglesTyped.length; k += 3) sources.push(t / 3);
    again.push(...clipper.clippedVerticesTyped);
  }
  if (sources.length !== clipped.length / 3 || again.length !== world.length || again.some((v, i) => v !== world[i])) {
    throw new Error(`slot "${piece.slot}": the clipper cut ${clipped.length / 3} triangle(s) in one call and ${sources.length} triangle by triangle, over other vertices — the source of each drawn triangle cannot be named`);
  }
  let texture = piece.texture;
  const source = clipSourceOf(piece.world, Array.from(uvs), triangles, sources, texture?.artUvs);
  if (texture !== undefined) {
    clipper.clipTrianglesUnpacked(piece.world, 0, triangles, triangles.length, texture.artUvs, 2);
    const artUvs = Array.from(clipper.clippedUVsTyped);
    if (artUvs.length !== clippedUvs.length) {
      throw new Error(
        `slot "${piece.slot}": the clip cut ${clippedUvs.length / 2} vertices for the page UVs and ` +
          `${artUvs.length / 2} for the original-art UVs over the same geometry`,
      );
    }
    texture = { region: texture.region, artUvs, sourceArtUvs: source.artUvs };
  }
  const { tint, dark, slot, page } = piece;
  return { kind: 'mesh', tint, dark, slot, page, texture, world, uvs: clippedUvs, triangles: clipped, source: { world: source.world, uvs: source.uvs } };
}

/**
 * The rest table: every (slot, attachment) the given frames show, in order of
 * first appearance, posed on one setup skeleton with the slot's deform empty.
 *
 * The attachment is resolved the way the pose resolved it — `Skeleton.getAttachment`,
 * the skin first and the default skin second — so a name means the object the
 * frames drew. A region's rest corners are read for the sequence frame the setup
 * pose resolves, which is the frame its setup pose draws.
 */
function restOf(data: SkeletonData, skin: string | undefined, shown: readonly AttachmentPose[][]): AttachmentRest[] {
  const skeleton = setupPosed(data, skin);
  // Slot, then attachment: two maps rather than one joined key, so no pair of
  // names can fold into another's entry whatever characters they carry.
  const seen = new Map<string, Set<string>>();
  const out: AttachmentRest[] = [];
  for (const entries of shown) {
    for (const entry of entries) {
      const names = seen.get(entry.slot) ?? new Set<string>();
      if (names.has(entry.attachment)) continue;
      names.add(entry.attachment);
      seen.set(entry.slot, names);
      const slotIndex = data.findSlot(entry.slot)?.index ?? -1;
      const slot = skeleton.slots[slotIndex];
      const attachment = slot === undefined ? null : skeleton.getAttachment(slotIndex, entry.attachment);
      if (slot === undefined || !(attachment instanceof MeshAttachment || attachment instanceof RegionAttachment)) {
        throw new Error(
          `slot ${JSON.stringify(entry.slot)} showed attachment ${JSON.stringify(entry.attachment)} in a frame, and ` +
            'the setup skeleton resolves no region or mesh of that name there',
        );
      }
      // A mesh reads the slot's deform array; the setup pose leaves it empty,
      // and emptying it here says so rather than trusting that it is.
      slot.appliedPose.deform.length = 0;
      const vertices = worldVerticesOf(skeleton, slot, attachment);
      out.push(
        attachment instanceof MeshAttachment
          ? {
              slot: entry.slot,
              attachment: entry.attachment,
              kind: 'mesh',
              vertices,
              triangles: Array.from(attachment.triangles),
              hull: attachment.hullLength / 2,
              uvs: Array.from(attachment.regionUVs),
            }
          : { slot: entry.slot, attachment: entry.attachment, kind: 'region', vertices, triangles: [...QUAD_TRIANGLES] },
      );
    }
  }
  return out;
}

/**
 * One skeleton as it stands posed now, as the numbers `firstNonFinite`
 * (`./nonfinite.ts`) reads: every bone's six world-transform terms, in skeleton
 * order, then the world vertices of every region and mesh its slots show, in
 * draw order — the runtime's reading of each (`worldVerticesOf`).
 *
 * ⭐ This is how `A10_NO_NAN_AFTER_STEPPING` reads each pose spine-core steps
 * (issue #882; its runtime supplier in `validate.ts` since issue #1025), so the
 * gate and the renderer hold one definition of "not finite": the six terms
 * `firstNonFinite` reads off a bone, and the vertices the runtime computes from
 * them. Before #882 A10 read the world POSITION alone, and a bone at `rotation:
 * 1e309` — finite position, NaN `a`, `b`, `c`, `d` — was gated green and then
 * refused here. The vertices are read too because a bone can be finite and
 * still carry one that is not: a two-bone `scaleX` chain of 1e154 × 1e154
 * leaves the child's `a` at 1e308, finite, and every vertex of its attachment
 * past the largest double. `firstNonFinite` reads the bones first, so a broken
 * bone is named as the cause rather than through its vertices.
 */
export function posedNumbersOf(skeleton: Skeleton): { bones: WorldTransform[]; drawn: PosedVertices[] } {
  const bones: WorldTransform[] = skeleton.bones.map((bone) => {
    const { a, b, c, d, worldX, worldY } = bone.appliedPose;
    return { name: bone.data.name, a, b, c, d, worldX, worldY };
  });
  const drawn: PosedVertices[] = [];
  for (const slot of skeleton.drawOrder.appliedPose) {
    const attachment = slot.appliedPose.attachment;
    if (!(attachment instanceof MeshAttachment) && !(attachment instanceof RegionAttachment)) continue;
    drawn.push({ slot: slot.data.name, attachment: attachment.name, vertices: worldVerticesOf(skeleton, slot, attachment) });
  }
  return { bones, drawn };
}

// ---------------------------------------------------------------------------
// texture-only substitution — see `substituteTexture`
// ---------------------------------------------------------------------------

/**
 * One piece's UVs in the drawing's own space, for the region it resolved to.
 *
 * ## The two shapes, and why only one needs arithmetic
 *
 * A **mesh** already carries them. `MeshAttachment.regionUVs` are read by
 * `spine-core` as coordinates over the *untrimmed* drawing — that is what its own
 * `u -= region.offsetX / textureWidth` and `width = region.originalWidth /
 * textureWidth` mean — so a mesh's authored UVs are atlas-independent by
 * construction, and so is its geometry: `MeshAttachment.computeWorldVertices`
 * reads `vertices` and bones and never touches the region at all. A mesh
 * therefore has nothing an atlas swap could move except its texels.
 *
 * A **region** is the case issue #199 is about. Its quad is derived from the
 * region rectangle — `RegionAttachment.computeUVs` insets it by `offsetX/offsetY`
 * and sizes it by `region.width/height` over `originalWidth/originalHeight` — so
 * swapping the atlas re-seats the quad as well as the texels. Its four corners
 * span the sub-rectangle of the drawing its own atlas kept, in `spine-core`'s
 * corner order (left-bottom, left-top, right-top, right-bottom, read straight off
 * that function's `uvs` assignments).
 *
 * ⚠️ `null` for a region whose own atlas packs it **rotated**: the corner order
 * above is the unrotated one, and `RegionAttachment.computeUVs` assigns a
 * different one at 90°. rigc emits one unrotated part per page and never packs, so
 * no candidate this ships for reaches that branch; a refusal that names itself is
 * better than a fourth opinion about a mapping only three callers have.
 */
function artUvsOf(attachment: MeshAttachment | RegionAttachment, region: TextureAtlasRegion): PieceTexture | undefined {
  if (attachment instanceof MeshAttachment) {
    return { region: regionKey(region), artUvs: Array.from(attachment.regionUVs) };
  }
  if (region.degrees !== 0) return undefined;
  const ow = region.originalWidth;
  const oh = region.originalHeight;
  if (!(ow > 0) || !(oh > 0)) return undefined;
  const s0 = region.offsetX / ow;
  const s1 = (region.offsetX + region.width) / ow;
  // `offsetY` is the trim measured from the drawing's BOTTOM and art space runs
  // downwards, so the region's bottom edge is the larger of the two.
  const tBottom = 1 - region.offsetY / oh;
  const tTop = 1 - (region.offsetY + region.height) / oh;
  return { region: regionKey(region), artUvs: [s0, tBottom, s0, tTop, s1, tTop, s1, tBottom] };
}

/**
 * The skin roster of a parsed Spine file, as the runtime flags it —
 * `unposedBones` over a fresh skeleton's `active` under each skin, so Spine's
 * activation rule is the runtime's and is not restated here. Nothing is posed
 * until a question is asked: the framing asks one (the skin it frames under,
 * `slotsOnUnposedBones`) and the refusal asks one per skin.
 */
export function skinRosterOf(data: SkeletonData): SkinRoster {
  return {
    skins: data.skins.map((k) => k.name),
    unposedUnder: (skin) => {
      const skeleton = skeletonUnderSkin(data, skin);
      return unposedBones(skeleton.bones.map((bone) => ({ name: bone.data.name, parent: bone.parent?.data.name ?? null, active: bone.active })));
    },
  };
}

/**
 * An atlas's pages and regions as spine-core's `TextureAtlas` reads them, each
 * region mapping the drawing's own coordinates onto its page through the
 * runtime's `MeshAttachment.computeUVs` — the `spine` reader of
 * `textureSubstitutionFromText` (`SubstitutionReader`), which reaches it
 * through the seam. Moved here unchanged from that function's branch (issue
 * #1052): it names the runtime, and that function does not.
 */
function spineSubstitution(atlasText: string): { pages: string[]; regions: Map<string, SubstituteRegion> } {
  const regions = new Map<string, SubstituteRegion>();
  const names: string[] = [];
  const atlas = new TextureAtlas(atlasText);
  for (const page of atlas.pages) names.push(page.name);
  for (const region of atlas.regions) {
    const page = { name: region.page.name, width: region.page.width, height: region.page.height };
    regions.set(regionKey(region), {
      page,
      x: region.x,
      y: region.y,
      width: region.width,
      height: region.height,
      degrees: region.degrees,
      pageUvs: (art) => {
        const uvs = new Array<number>(art.length).fill(0);
        MeshAttachment.computeUVs(region, [...art], uvs);
        return uvs;
      },
    });
  }
  return { pages: names, regions };
}

// ---------------------------------------------------------------------------
// the Spine side, registered (issue #1052)
// ---------------------------------------------------------------------------
//
// ⭐ Loading this file is what fills the seam `./render_shared.ts` reads: every
// program that imports it — `cli.ts`, the tools, the selftest — poses an export,
// `--poser spine` and a fallback through spine-core exactly as before, and one
// that never loads it links nothing of the runtime. Functions only: nothing of
// the runtime is touched here, so a runtime that cannot be used is still met
// where a run first needs it (`requireSpineRuntime`).
registerSpinePosing({
  requireRuntime: requireSpineRuntime,
  skeletonData: (skeletonText, atlasText, refuse) => spineSkeletonData(skeletonText, atlasText, refuse),
  facts: (data, atlasText) => spineFacts(data as SkeletonData, atlasText),
  poser: (data) => spinePoser(data as SkeletonData),
  skinRoster: (data) => skinRosterOf(data as SkeletonData),
  atlasPageNames,
  substitution: spineSubstitution,
});
