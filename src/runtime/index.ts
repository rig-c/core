/**
 * rigc's runtime poser (issue #1591): the model document posed in place, for
 * a player drawing many skeletons a frame — separate from the verification
 * oracle (`src/core/`) and held equal to it at tolerance 0.
 *
 * ## Why there are two posers
 *
 * The oracle is the reference. Each of its poses is a pure function of the
 * document, the skin and the time, returned as a fresh, name-keyed, detached
 * record — the shape a comparison needs, and the shape the core gate holds to
 * spine-core 4.3.13 to the last bit. A player that consumes that record every
 * frame pays for the record: the audit behind issue #1591 measured 175–251
 * KiB allocated per skeleton per frame, against under half a KiB for the
 * official runtime. The runtime poser keeps one pose per skeleton, resolves
 * every name to an index once at load (`compileRuntime`) and overwrites typed
 * arrays in place (`RuntimePose`), so a steady-state frame allocates nothing.
 *
 * It does not re-derive the oracle's rules. Every formula is the oracle's, in
 * the oracle's order of operations (`./pose.ts`'s header), and the gate is the
 * oracle itself: `tools/core_gate.ts`'s third dumper poses every model of the
 * corpus through both at the oracle's samples and compares full doubles at
 * tolerance 0 (*The runtime poser* there). The oracle is not changed for it.
 *
 * ## Stage 6: what it poses, and what it refuses
 *
 * Bones and their five inherit modes; the rotate, translate, scale and shear
 * timelines; a slot's attachment, light colour (`rgba`, `rgb`, `alpha`) and
 * dark colour (`rgba2`, `rgb2`) timelines; draw-order timelines (including
 * slider draw-order application); weighted/unweighted deform timelines; region, mesh, weighted mesh and linked mesh vertices; one- and
 * two-bone ik, absolute transforms with local/world sources and targets, path constraints, physics (with optional movement scope) and value-mapped sliders with their
 * timelines; skin-required bones and constraints under the view's skin. One
 * animation at full weight from the setup pose, at a time or stepped as a
 * looping track. Everything else is refused at load by name with the list of
 * what is missing (`./model.ts`'s header and `RUNTIME_FEATURES`); a consumer
 * falls back to the oracle for a refused model or animation, so nothing breaks
 * while coverage grows. Named skin views and their required bones are posed;
 * to switch, compile the new underSkin/underNoSkin view at load and restore the
 * animation/time and event cursor with newPose.restore(name, old.trackTime,
 * old.time). Restoration delivers no already-passed cue. `pose.events` borrows immutable seven-field
 * deliveries over the last interval, in oracle order, until the next apply/step.
 *
 * ```ts
 * const model = compileRuntime(underNoSkin(readModel(text)));
 * const pose = new RuntimePose(model);
 * pose.setAnimation('walk');
 * pose.step(1 / 60);       // or pose.apply(t)
 * pose.computeVertices();  // pose.world, pose.light, pose.dark, pose.shown, pose.drawOrder, pose.vertices
 * ```
 *
 * This module is the `rig-c/runtime` entry (`exports` in package.json), which
 * is **experimental**: not promised until the poser stabilises (RELEASING.md,
 * *The import surface*). Pure, as all of `src/`, linking nothing from the Spine
 * runtime package (`RP10`), and safe to bundle for a browser: its value closure
 * is this directory and `src/core/` (`CUR136`).
 */
export {
  compileRuntime,
  missingText,
  RuntimeInputError,
  RuntimeRefusal,
  RUNTIME_FEATURES,
  RUNTIME_STAGE,
  DRAW_MESH,
  DRAW_NONE,
  DRAW_REGION,
  DRAW_WEIGHTED,
  LOCAL_FIELD_NAMES,
  LOCALS,
  WORLDS,
  W_A,
  W_B,
  W_C,
  W_D,
  W_X,
  W_Y,
  L_X,
  L_Y,
  L_ROTATION,
  L_SCALE_X,
  L_SCALE_Y,
  L_SHEAR_X,
  L_SHEAR_Y,
} from './model.ts';
export type { RuntimeAnimation, RuntimeEvent, RuntimeAttachment, RuntimeFeature, RuntimeMissing, RuntimeModel, RuntimeOptions, RuntimePlant, RuntimeSlot } from './model.ts';
export type { RuntimePoseOptions, RuntimePhysicsPhase } from './pose.ts';
export { RuntimePose } from './pose.ts';
