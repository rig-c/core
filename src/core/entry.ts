/**
 * `rig-c/core` — the named entry a player with no Spine runtime poses the
 * model document through (issue #1275).
 *
 * A dependant was observed importing these symbols from the core's own files
 * through the pattern courtesy (`rig-c/src/core/raw`), which RELEASING.md
 * *The import surface* says is not promised. This module re-exports exactly
 * the observed list, so the core's files keep their names and may move: the
 * entry moves with them, and a symbol leaves only as a breaking change.
 *
 * 🔒 It re-exports and does nothing else. What it reaches by value is the
 * core and nothing outside `src/core/` — the core links no `node:` module and
 * no runtime, and its imports of `../model.ts` are type imports — so a bundler
 * targeting a browser takes this entry's closure without a node polyfill.
 * `CUR123` holds the closure, by name; the install smoke bundles it for a
 * browser and holds the bundle to zero `node:` strings.
 *
 * ⚠️ A symbol is listed here only because a dependant was seen using it,
 * or asked for it in writing before it could be (`openTrack`, issue #1276;
 * `openTracks`, issue #1336; `physicsClockStep` and `PHYSICS_CLOCK_LEAD`,
 * the clock a live track's `clock` option takes, issue #1396;
 * `PhysicsEnvironment`, what a live track's `setEnvironment` takes, issue
 * #1416; `bezierPolyline` and `BEZIER_PIECES`, the polyline the poser draws
 * a Bézier segment as, so that a fitter holds its tolerance to the poser's
 * own evaluation rather than to a mirror of it, issue #1417 — re-exported,
 * never copied, because a copy is the drift the request exists to remove;
 * `CA12` holds the identity).
 * The list is `scripts/install_smoke.ts`'s `OBSERVED_SYMBOLS` rows for
 * `./core`, and a symbol added here and not there is not promised.
 */
export { readModel, underSkin, underNoSkin, CoreInputError, CORE_DOCUMENT_SPEC, CORE_DOCUMENT_SPECS, CORE_BLEND_MODES, activeBones } from './index.ts';
export type { CompiledDocument, CoreSlotRow, CoreBlendMode } from './index.ts';
export { poseRawSetup, poseRawAnimation, poseRawAnimationEach, loopedTime, setupBounds, physicsClockStep, PHYSICS_CLOCK_LEAD } from './raw.ts';
export type { RawPose, RawBone, RawDrawn, RawClip, RawClipped, RawEvent, RawReset } from './raw.ts';
export { poseWalkSetup, poseLoopingWalk } from './walk.ts';
export { openTrack } from './track.ts';
export type { LiveTrack, TrackOptions, AdjustableLocals, BoneLocals, LocalAdjust, LocalAdjustContext, PhysicsEnvironment } from './track.ts';
export { openTracks } from './tracks.ts';
export type { LiveTracks, TracksOptions, MixOptions, QueueOptions, TrackEntryView } from './tracks.ts';
export type { WalkPose } from './walk.ts';
export { documentPageLookup, drawnRegions, regionPageUvs, meshPageUvs, readUvSequences } from './uvs.ts';
export type { DrawnRegion, UvPage, UvRegion, UvSource } from './uvs.ts';
export { clipThrough, clipShapeOf, convexWhy, REGION_UVS, REGION_TRIANGLES } from './clipping.ts';
export type { ClipShape, ClipResult } from './clipping.ts';
export { eventsFired } from './events.ts';
export { bezierPolyline, BEZIER_PIECES } from './animation.ts';
export type { ModelPage, ModelPageRegion } from '../model.ts';
