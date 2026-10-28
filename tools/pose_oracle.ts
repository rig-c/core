/**
 * pose_oracle — one skeleton posed into a document, and two such documents
 * compared (issue #909, step 0b of issue #380).
 *
 *   bun tools/pose_oracle.ts dump <build dir> --out <json>
 *                                 [--samples 9] [--phase grid|off|irr|dense]
 *                                 [--skin all|none|<name>] [--physics none|step] [--dt 1/60] [--raw]
 *   bun tools/pose_oracle.ts dump <skeleton.json> <atlas> --out <json> [same flags]
 *   bun tools/pose_oracle.ts dump --core <skeleton.model.json> [--atlas <atlas>] --out <json> [same flags]
 *   bun tools/pose_oracle.ts compare <a.json> <b.json> [--tol-xy 1e-6] [--tol-m 1e-6]
 *   bun tools/pose_oracle.ts unposed <build dir> [dump's flags but --out, --raw, --core, --atlas]
 *
 * ⭐ Why this is a document and not a function. The equivalence gate issue
 * #380 stands on (`P_ours(M) ≡ P_spine(B)`) compares the pose spine-core gives
 * a Spine file against the pose a SECOND implementation gives the same rig. The
 * second implementation does not link spine-core — that is the whole point of
 * it — so the contract between the two cannot be a TypeScript type or a call
 * into this file. It is the JSON below. Everything a second dumper needs to
 * write the same document is stated in this header: every field, in the order
 * it is written, and which spine-core 4.3.13 call produced it here, so that
 * the call's semantics can be reproduced rather than imported. If a sentence
 * below is not enough to reproduce a field, that is a defect in this header.
 *
 * The prototype this was promoted from graded rigc's builds against the
 * editor's exports on the 1.0 exam and read IDENTICAL on 14 of 14 production
 * rigs. What was added to it is what its own notes listed as not yet dumped:
 * world vertices (with deform and weights), the draw order, clipping, events,
 * stepped physics and posing under one skin.
 *
 * ## `dump` — the document, `"spec": "pose-oracle/4"`
 *
 * 🔢 **The number in `spec` changes whenever a field is added, removed or
 * moved.** `compare` reads a row by position and a reader refuses any `spec`
 * but its own, so a document with a cell the reader does not know is refused
 * by name rather than compared on the cells the reader does know — which
 * would read IDENTICAL over a difference it never looked at. `/1` became `/2`
 * when the slot row gained its blend mode (issue #933), `/2` became `/3`
 * when a pose gained its `clipped` block (issue #964), and `/3` became `/4`
 * when it gained its `uvs` block (issue #967).
 *
 * One JSON object on one line, then a newline. Key order is fixed and is the
 * order written here. Two dumps of one input are byte-identical: no clock, no
 * randomness, no unordered iteration (every list is in the skeleton's own
 * order, stated per field).
 *
 * 🔢 **Every number is rounded** by `r(v) = floor(v * 1e6 + 0.5) / 1e6`
 * (JavaScript's `Math.round(v * 1e6) / 1e6` — round half UP, not half to even),
 * and written as the shortest decimal that reads back to that double. A value
 * that is not finite is written `null`. The one number not rounded is
 * `options.dt`, because it defines the stepping schedule and a rounded 1/60
 * would step a different one.
 *
 * Top level, in order:
 *
 * - `spec` — the string `"pose-oracle/4"`.
 * - `dumper` — who posed it, free text (`"spine-core 4.3.13"` here). Never
 *   compared.
 * - `source` — `{ "spine": <string|null>, "hash": <string|null> }`, the
 *   skeleton file's own `skeleton.spine` and `skeleton.hash`
 *   (`SkeletonData.version`/`.hash`). Never compared: a rebuild states the
 *   runtime it links and an export the editor that wrote it.
 * - `options` — `{ "phase", "samples", "skin", "physics", "dt" }`, the flags
 *   the dump was taken under; `dt` is `null` unless `physics` is `"step"`.
 *   Two dumps taken under different options are not comparable and `compare`
 *   refuses the pair (exit 2).
 * - `absent` — written only by a dumper that leaves a block out (the core,
 *   below): `[[block, why], …]` naming every block that is `null` in this
 *   document, in document order, with the construct not yet admitted. A block
 *   is one of `bones`, `slots`, `skins`, `constraints`, `physics`, `paths`,
 *   `pathAttachments`, `setup.bones`, `setup.slots`, `setup.drawOrder`,
 *   `setup.attachments`, `setup.clips`, `setup.clipped`, `setup.uvs`,
 *   `animations`, and the eight a sample carries — `animations.bones`,
 *   `animations.slots`, `animations.drawOrder`, `animations.attachments`,
 *   `animations.clips`, `animations.clipped`, `animations.uvs`,
 *   `animations.events`
 *   (`ORACLE_BLOCKS`). A sample block left out is `null` in EVERY sample and
 *   named once; one not named is a list in every sample; with `animations`
 *   itself `null` the sample blocks are nobody's and are not named. A `null`
 *   block the list does not name, a name that is not a `null` block, or a
 *   sample block `null` in some samples and not others makes the document
 *   unreadable (exit 2). The spine-core dump leaves nothing out and writes no
 *   `absent` key.
 * - `bones` — every bone name in skeleton order (`SkeletonData.bones`, which is
 *   parent-before-child).
 * - `slots` — `[name, bone]` per slot in setup order (`SkeletonData.slots`,
 *   `SlotData.boneData.name`). The bone is here so a comparison can carry the
 *   ill-conditioned rule from a bone to the geometry its slots draw.
 * - `skins` — every skin name in file order (`SkeletonData.skins`).
 * - `constraints` — `[[type, name], …]` in `SkeletonData.constraints` order,
 *   which is the order the runtime updates them in; `type` is one of `ik`,
 *   `transform`, `path`, `physics`, `slider`.
 * - `physics` — one object per physics constraint, constraint order:
 *   `name, bone, x, y, rotate, scaleX, shearX, limit, step, inertia, strength,
 *   damping, massInverse, wind, gravity, mix, inertiaGlobal, strengthGlobal,
 *   dampingGlobal, massGlobal, windGlobal, gravityGlobal, mixGlobal,
 *   skinRequired, scaleYMode` — the `PhysicsConstraintData` fields of those
 *   names, the seven pose values off its `setupPose`, `scaleYMode` as the
 *   enum's name (`None`, `Uniform`, `Volume`).
 * - `paths` — one object per path constraint, constraint order: `name, slot,
 *   bones, positionMode, spacingMode, rotateMode, offsetRotation, position,
 *   spacing, mixRotate, mixX, mixY` — `PathConstraintData` and its
 *   `setupPose`, each mode as its enum's name (`Fixed`/`Percent`,
 *   `Length`/`Fixed`/`Percent`/`Proportional`, `Tangent`/`Chain`/`ChainScale`).
 * - `pathAttachments` — one object per path attachment in any skin: `skin,
 *   slot, placeholder, closed, constantSpeed, lengths`, in skin order and, in a
 *   skin, in `Skin.getAttachments()` order. `compare` matches them by
 *   `skin/slot/placeholder`, never by position.
 * - `setup` — the setup pose (below).
 * - `animations` — one object per animation in `SkeletonData.animations`
 *   order: `{ "name", "duration", "samples": [ … ] }`, and each sample is
 *   `{ "t", "events", …pose }`.
 *
 * A **pose** is, in order:
 *
 * - `bones` — `[name, worldX, worldY, a, b, c, d, active, parent]` per bone in
 *   skeleton order, read off `Bone.appliedPose` (`BonePose.worldX` … `.d`, the
 *   world matrix `[a b][c d]` and origin); `active` is `1` or `0`
 *   (`Bone.active`, false for a `skinRequired` bone the skin does not name);
 *   `parent` is the parent bone's name or `null`.
 * - `slots` — `[name, attachment, r, g, b, a, dark, path, blend]` per slot in
 *   setup order, off `Slot.appliedPose`: the attachment's `name` or `null`, the
 *   light colour, `dark` as `[r, g, b]` or `null` when the slot has no dark
 *   colour, and the attachment's `path` (region and mesh attachments, which
 *   default `path` to their name) or `null` for any other attachment or none;
 *   then `blend`, off the slot's data (`SlotData.blendMode`) as its enum's
 *   name — `Normal`, `Additive`, `Multiply`, `Screen` — or `null` when the
 *   runtime holds no mode (it reads a stated `ADDITIVE` so). The blend mode is
 *   data, not pose: a `SlotPose` carries `color`, `darkColor`, `attachment`,
 *   `sequenceIndex` and `deform` and no mode, and an animation leaves it where
 *   setup put it; it is in the row because the renderer draws the posed slot
 *   with it. Of the pose's other two fields, `deform` is in `attachments`'
 *   world vertices and `sequenceIndex` is not dumped (issue #933's report).
 * - `drawOrder` — slot names in the posed draw order
 *   (`Skeleton.drawOrder.appliedPose`).
 * - `attachments` — `[slot, attachment, kind, vertices]` for every slot, in
 *   draw order, whose attachment is a region or a mesh; `kind` is `region` or
 *   `mesh`; `vertices` is the flat `[x0, y0, x1, y1, …]` in world units, y up:
 *   for a region the four corners from
 *   `RegionAttachment.computeWorldVertices(slot, getOffsets(slot.appliedPose),
 *   out, 0, 2)` — in the runtime's corner order, bottom-left, upper-left,
 *   upper-right, bottom-right of the region's own frame — and for a mesh every
 *   vertex from `MeshAttachment.computeWorldVertices(skeleton, slot, 0,
 *   worldVerticesLength, out, 0, 2)`, which applies the slot's deform offsets
 *   and the vertex weights. A slot is listed whether or not its bone is active
 *   and whatever its alpha: this is geometry, not a picture.
 * - `clips` — `[slot, attachment, end, polygon]` for every slot, in draw
 *   order, whose attachment is a clipping attachment: `end` is the name of the
 *   slot the clip ends at (`ClippingAttachment.endSlot`) or `null`, and
 *   `polygon` the world polygon from `computeWorldVertices(skeleton, slot, 0,
 *   worldVerticesLength, out, 0, 2)`.
 * - `clipped` (issue #964) — `[slot, attachment, clipped, vertices, uvs,
 *   triangles]` for every slot drawn while a clip is active, in draw order: a
 *   `SkeletonClipping` walked beside the draw order exactly as `src/render.ts`'s
 *   `piecesOf` walks it — at a clipping attachment `clipEnd(slot)`, then
 *   `clipStart(skeleton, slot, clip)` when the slot's bone is active; at every
 *   other slot, when `isClipping()` and it shows a region or a mesh,
 *   `clipTrianglesUnpacked(world, 0, triangles, triangles.length, uvs, 2)`,
 *   then `clipEnd(slot)`; `clipEnd()` after the walk. `world` is the
 *   attachment's world vertices as `attachments` computes them; `triangles` a
 *   mesh's own and a region's `0 1 2 2 3 0`; `uvs` the attachment's LOCAL ones
 *   — a mesh's `regionUVs` (a linked mesh's are its source's) and a region's
 *   `0 1, 0 0, 1 0, 1 1` in the corner order above — not the page UVs the
 *   renderer passes, because where a region sits on a page is not the
 *   model's (`ModelAtlasRect`'s 🔸 in `src/model.ts`); the clipper's UV rule
 *   is linear (`src/core/clipping.ts`), so the page UVs are the same map of
 *   the same weights. `clipped` is the call's return value, `1` or `0` — the
 *   renderer draws the attachment's own geometry on `0` — and the three
 *   arrays are `clippedVerticesTyped`, `clippedUVsTyped` and
 *   `clippedTrianglesTyped` as returned, whichever it is. Empty when nothing
 *   is drawn under a clip.
 * - `uvs` (issue #967) — `[slot, attachment, page, uvs]` for every slot, in
 *   draw order, whose attachment is a region or a mesh — the slots
 *   `attachments` lists: the frame `index = sequence.resolveIndex(
 *   slot.appliedPose)`, `page` the name of `sequence.regions[index]`'s page
 *   (`TextureAtlasRegion.page.name`, the atlas's page line trimmed) and `uvs`
 *   `sequence.getUVs(index)` as the attachment holds it — a region's four
 *   corners in the corner order above, a mesh's one pair per vertex. These
 *   are what `src/render.ts`'s `pieceOf` draws with; the rules that
 *   reproduce them from the atlas are `src/core/uvs.ts`'s.
 *
 * A sample adds, before its pose:
 *
 * - `t` — the sample's time in seconds.
 * - `events` — `[name, time, int, float, string]` for every event an
 *   `EventTimeline` of the animation fires over `(previous sample's t, t]`,
 *   in firing order; the first sample's interval opens at `-1`, so an event
 *   keyed at 0 fires at the first sample. `string` is the key's, else the
 *   event definition's, else `""` — measured on issue #955, where this line
 *   said `null`: an event declared with no string fired `""`
 *   (`src/core/events.ts`). Events after the last sample are not listed.
 *
 * ## How a pose is posed
 *
 * A skeleton is `new Skeleton(data)` with one skin set before anything is
 * posed: under `--skin all` a new skin named `__all` to which every skin is
 * added in file order (`Skin.addSkin`, later skins overriding earlier ones at
 * the same slot and placeholder); under `--skin <name>` that skin, where the
 * default skin still fills what it does not name (`Skeleton.getAttachment`);
 * under `--skin none` (issue #1051) no skin at all — `setSkin` is never
 * called, the state `render` without `--skin`, A10's walk and `validate()`
 * pose in.
 *
 * Sample times, for an animation of duration `d` and `N` samples, sample `i`
 * from 0: `grid` — `d·i/(N-1)` (and `0` when `N` is 1); `off` —
 * `d·(i+0.5)/N`; `irr` and `dense` — `d·(i+0.381966011)/N`, an offset of
 * `1 − 1/φ` so no sample lands on a key authored on a frame grid. `dense` is
 * `irr`'s formula under its own name, for a dump taken with a large `N`.
 * The formula is held in the core (`sampleTime` in `src/core/animation.ts`)
 * and this tool calls it, as it rounds with `gridRound`, so the two dumpers
 * sample at one set of times. `d` is spine-core's `Animation.duration`: the
 * last key time of every timeline in the animation, as float32 — measured
 * against the model's declared duration on issue #936 (an animation whose
 * bones stop at 1 and whose event fires at 2.5 samples over 2.5).
 *
 * `--physics none` (the default), which is the prototype's posing exactly: one
 * skeleton for the whole dump; the setup pose is `setupPose()` then
 * `updateWorldTransform(Physics.none)`; each sample is `setupPose()`, then
 * `Animation.apply(skeleton, 0, t, false, null, 1, MixFrom.setup, false,
 * false, false)`, then `updateWorldTransform(Physics.none)`. Physics
 * constraints are not simulated: they hold the bones where the animation left
 * them — measured on issue #938, the dump of a rig with its physics
 * constraints and timelines is the dump of the rig without them
 * (`src/core/constraints_physics.ts`).
 *
 * `--physics step --dt <s>`: a fresh skeleton per animation (and one for the
 * setup pose), `setupPose()`, `update(0)` and `updateWorldTransform(Physics.
 * reset)` at time 0 — for an animation after applying it at 0 as below. Then
 * the skeleton is walked forward in one continuous trajectory through every
 * sample in order: from the previous sample's time `p` (0 at the start), for
 * `k = 1, 2, …` while `p + k·dt < t`, one step to `p + k·dt`, and then one step
 * to `t` itself unless the walk is already there. A step to time `s` is
 * `setupPose()`, `Animation.apply(skeleton, last, s, false, null, 1,
 * MixFrom.setup, false, false, false)` — `last` the time the walk last
 * applied the animation at, −1 before the apply at 0 — `update(s − previous
 * s)` and `updateWorldTransform(Physics.update)`; the pose is read after the
 * step to `t` without posing again.
 *
 * ⏱️ **`last`, not 0: the animation is applied as a player applies it**
 * (issue #960). Until then every step applied it from 0, so a physics
 * `reset` key at `k` reset its constraints at EVERY step from `k` on — the
 * rig held still — where a player crosses it once. Measured on a probe (a
 * bone under a physics constraint, `x`, `y` and `rotate` at 1, inertia 0.9,
 * strength 40, damping 0.95, its parent keyed at 0, 0.3, 0.7 and 1, a
 * `reset` key at 0.5; nine grid samples at dt 1/60) under three schedules
 * in full doubles: (a) apply from 0 at every step; (b1) `Animation.apply`
 * from the previous step's time, −1 before the first; (b2) `AnimationState`
 * with one non-looping track, `update(s − previous s)` then `apply` —
 * `src/core/raw.ts`'s recipe, with and without `setupPose()` first. (b1) and
 * (b2) agreed to the bit at every sample, and with reset keys at 0, 0.0001,
 * 0.51, 1, {0, 0.5} and {0.2, 0.6}; (a) agreed with them up to and at the
 * first key after 0 and was off by whole units from the step after it (the
 * bone 30.0, 24.0, 24.6 and 48.1 units off at 0.625, 0.75, 0.875 and 1 on
 * the probe). A key at 0 changes nothing under either reading (the walk
 * resets at 0 anyway) and a key at the last step's time fires in both. So
 * the dump walks (b1): the instrument measures what a player plays, and the
 * core's walk (`resetCrossed` in `src/core/constraints_physics.ts`) crosses
 * a key once — a key in `(last, s]` — with it. Keeping (a) was rejected: it
 * is a schedule no player runs, which both dumpers agreeing on proves
 * nothing about. None of the nineteen tree rows keys a `reset` (the
 * stepped census's `timeline.reset`, `tools/core_gate.ts`), and every
 * stepped dump of them, both dumpers, grid and `--raw`, was byte-identical
 * before and after the change.
 *
 * spine-core integrates physics on its own fixed
 * `step` inside that call, carrying the remainder, so `dt` decides how often
 * the animated bones are re-posed under the simulation, not the integrator.
 * Measured on issue #956 (`src/core/constraints_physics.ts`): the same rig
 * under dt 1/60, 1/30 and 0.025 reads three trajectories — a bone under an
 * `x` spring whose parent moves 60 units a second sat at 4.517945, 4.613321
 * and 4.611427 at t = 0.125 — each reproduced by the core at tolerance 0.
 *
 * ## `dump --core` — the second dumper
 *
 * The same document from rigc's own core (`src/core/index.ts`, issue #925)
 * posing a `rigc-compiled/1` document (`skeleton.model.json`, which `build`
 * writes beside the Spine pair) — no spine-core call is made for it. `dumper`
 * is `"rigc-core"`; `source` is `{ "spine": null, "hash": null }`, since the
 * model states neither; `options` as given. `--skin` is `all` or a skin the
 * model declares (issue #932, `underSkin` and `src/core/skins.ts`): under a
 * named skin a slot shows the named skin's record, else the default skin's,
 * else nothing, and only the named skin's `bones` and constraint lists are
 * applied — the default skin's are not — each measured against the dump
 * above; under `--skin none` the document with no skin set (`noSkinView`,
 * issue #1051: no skin's lists applied, a slot resolved through the default
 * skin alone); a skin the model does not declare is refused (exit 2) by name. Under `--physics step --dt <s>` the core walks the
 * schedule above itself (issue #956, `poseSteppedAnimations` and
 * `stepSchedule` in `src/core/constraints_physics.ts`): the setup pose is the
 * reset pose, every animation a fresh state reset at 0 and stepped through
 * the samples, each physics constraint integrated as that file's header
 * states with its measurements, `options.dt` the `dt` given. The rosters
 * `bones`, `slots`, `skins` and `constraints` are the document's own, in its
 * order, and `physics` is each physics constraint's row as above, written
 * from the model's record with the parser's value for a field it leaves out
 * (`physicsRows`).
 * `paths` and `pathAttachments` are the document's path constraints and path
 * attachments as the runtime reads them (issue #938, second cut,
 * `src/core/constraints_path.ts`). `setup.bones` is the core's setup pose
 * with the document's ik, transform, path, physics and slider constraints
 * applied in its order (issue #938, `src/core/constraints.ts`; under
 * `--physics none` a physics constraint applies nothing, stepped it is
 * reset, and a slider applies its animation), or absent when a path walks a slot whose
 * placeholder skins fill with different curves, or a slider's animation
 * keys a constraint timeline or deforms a walked curve; `setup.slots` is every slot's row as the pose
 * above words it (issue #928), each slider's slot timelines applied after
 * the bones, or absent when a slot's setup placeholder is filled
 * by skins that disagree, since which of them `--skin all` shows is the Spine
 * file's skin order and the model does not carry it (the core's header says
 * why, with the measurements) — a case that arises under `all` only, and
 * that the per-skin dumps judge; `setup.attachments` and `setup.clips` are the
 * world vertices of every region, mesh, linked mesh and clipping polygon shown
 * at setup, in the setup draw order (issue #931, `src/core/vertices.ts`),
 * each slider's deform and sequence keys applied (issue #955), absent when
 * either block above is, and `setup.attachments` also when a shown region's
 * atlas rectangle is `null` in the model or a slider's timeline moves a
 * record several skins fill. `animations` is every animation of
 * the model, in the model's order, sampled at the phase's times over its
 * runtime duration (issue #936, `src/core/animation.ts`): each sample's
 * `bones` and `slots` posed from the setup pose with the animation's bone and
 * slot timelines at alpha 1, then the constraints posed by their timelines
 * at the sample's time, a path walking the curve the sample's deform left —
 * `animations.bones` absent when `setup.bones` is, when an animation keys
 * the attachment of a walked path's slot or deforms a walked path whose
 * placeholder several skins fill, or when a path's offset reads a slot bone from the previous pose
 * whose reflection changes across the samples (under the step: whenever a
 * path's offset reads a slot bone from the previous pose, which is then the
 * previous step's); `animations.slots` absent
 * when a slider keys a slot on such a document or skins disagree over a
 * placeholder a slot shows — and, since issue #955, its `drawOrder` (the
 * sample's draw-order key over the setup order, then each slider's,
 * `src/core/draw_order.ts`), its `attachments` and `clips` (through the
 * sample's bones, in that draw order, with the deform and sequence
 * timelines' state, `src/core/deform.ts`; absent when the bones or the slots
 * are, and the attachments when a timeline moves a record several skins
 * fill) and its `events` (`src/core/events.ts`). `setup.drawOrder` is the slot
 * order with each slider's draw-order key applied. The physics parameters
 * are `null` and named in `absent`.
 * `setup.uvs` and `animations.uvs` (issue #967, `src/core/uvs.ts`) are each
 * pose's page and page UVs, from the atlas given by `--atlas <file>` — the
 * build's `skeleton.atlas`, read by rigc's own reader (`parseAtlasText`,
 * `atlasRegionLookup` in `src/atlas.ts`): the model carries no page layout,
 * so without `--atlas` both blocks are absent, saying so. They are absent
 * too where what a slot shows is not posed (that pose's slots or draw order
 * absent), under `--physics step` when a slider keys a slot's attachment or
 * a sequence, and where `src/core/uvs.ts` names a case it does not pose; an
 * atlas lacking a region the pose draws is refused (exit 2), as spine-core
 * refuses to load the pair.
 *
 * ## The third dumper — the runtime poser (issue #1591)
 *
 * `runtimeDump` writes the same document from the runtime poser
 * (`src/runtime/`), the in-place poser a player runs, which `tools/core_gate.ts`
 * holds to the core's document at tolerance 0 (*The runtime poser* there). It
 * is a function, not a `dump` flag: what it is compared with is the core in
 * the same process. `dumper` is `"rigc-runtime (stage N)"`, `source` and
 * `options` as the core's; the rosters, `physics`, `paths` and
 * `pathAttachments` included, are the document's own. The view is the core's
 * (`viewOf`); the setup pose and every sample are posed by ONE runtime pose,
 * every animation in turn, so a value one pose left behind would be a
 * difference in the next. `setup.drawOrder` and every sample's is the slot
 * order and `clips` and `clipped` are empty, because a draw-order timeline and
 * a clipping attachment are refused at load. Absent, always: `setup.uvs` and
 * `animations.uvs` (the atlas's, not posed); and `animations.events` where a
 * posed animation keys events, which the dump compiles past (`ignore:
 * ['events']`) so that the animation's pose is compared. A model the runtime
 * refuses throws its `RuntimeRefusal`, every missing construct named; an
 * animation it refuses is left out of `animations` and listed beside the
 * document, so a comparison takes the core's document down to the same
 * animations. `--physics none` and `--physics step` are both posed.
 *
 * ## `--raw` — full doubles (issue #966)
 *
 * `dump --raw` (either dumper) writes the same document with every number the
 * double as computed — `JSON.stringify` of the number, no grid: `rawNumber`
 * in `src/core/index.ts`, `null` for a value that is not finite and `-0`
 * written `0` as above — under the spec `pose-oracle-raw/3` (`ORACLE_RAW_SPEC`,
 * derived from `ORACLE_SPEC`, so a field added there moves both). Nothing
 * else changes: the fields, their order, the options (which carry no `raw`
 * key — the spec says it), the sample times and the walk. A reader of the
 * rounded spec refuses a raw document by name rather than comparing full
 * doubles on the grid. `compare` reads two raw documents in units in the
 * last place (`ulpDistance`: the count of doubles between the two, `0` and
 * `-0` equal) at tolerance 0, and refuses a raw document against a rounded
 * one, and a `--tol-xy` or `--tol-m` other than 0 on two raw ones (exit 2):
 * a raw comparison has no tolerance to widen. The reports print each delta
 * as `N ulp`. The ill-conditioned rule applies unchanged.
 *
 * ## `compare` — two documents
 *
 * Refused (exit 2) when either file is not a `pose-oracle/4` document, when
 * the two were taken under different `options`, or when a block is absent
 * from BOTH — there is then nothing to compare it with. A block absent from
 * exactly one side prints `SKIP <block>: not produced by <dumper>` (and the
 * absent side's reason) and is neither compared nor counted: IDENTICAL then
 * speaks for the blocks both documents carry, and its line says how many were
 * skipped and which. A sample block is judged the same way inside the
 * animations both documents carry, and not at all when either carries none.
 * Otherwise every roster (bones, slots, skins, animations, constraints, path
 * attachments, sample counts) and every name must agree exactly — skins and
 * animations as sets, matched by name, because the order they are listed in
 * is the Spine file's spelling (the emitter's editor order) and not a pose —
 * and every number within tolerance: world
 * positions and vertex coordinates within `--tol-xy`, everything else (the
 * matrix, colours, times, parameters, page UVs) within `--tol-m`; `uvs` rows
 * matched by slot and attachment as the attachments are, each row's page name
 * and length exactly. Both default to 1e-6,
 * one step of the rounding grid; deltas are computed on the grid, in integer
 * millionths, so a rounding tie cannot read as over.
 *
 * 🔒 The ill-conditioned rule, from the prototype's calibration: at a sample,
 * a bone whose `|a·d − b·c| < 1e-6` in EITHER document is excluded from that
 * sample's comparison, and so is every descendant of it; so are the
 * attachments and clips on the slots of the excluded bones. Excluded
 * bone-samples are counted and printed, never compared. A collapsed matrix's
 * four numbers carry no rotation to agree about, and float noise in them is
 * not a difference between two rigs.
 *
 * Prints `IDENTICAL` and exits 0 when nothing differs; otherwise, per
 * animation, the worst Δxy and Δabcd with the bone and the sample, the count of
 * bone-samples over tolerance, the worst vertex delta, and every roster, name,
 * draw-order and event mismatch by name, then the first difference, and exits
 * 1.
 *
 * 🔒 Not a selftest control in full: grading the corpus is a table, and a
 * table is PR_BODY material. `selftest.ts` holds three rows of it the way it
 * holds `pose_floor` — two dumps of one build byte-identical, a planted 1°
 * named by `compare`, and one public example's rebuild against its export at
 * the reading measured.
 */
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  Animation,
  AnimationState,
  AnimationStateData,
  AtlasAttachmentLoader,
  BlendMode,
  ClippingAttachment,
  EventTimeline,
  IkConstraintData,
  MeshAttachment,
  MixFrom,
  PathAttachment,
  PathConstraintData,
  Physics,
  PhysicsConstraintData,
  PositionMode,
  RegionAttachment,
  RotateMode,
  ScaleYMode,
  Skeleton,
  SkeletonClipping,
  type SkeletonData,
  SkeletonJson,
  Skin,
  type Slot,
  SliderData,
  SpacingMode,
  TextureAtlas,
  TextureAtlasRegion,
  TransformConstraintData,
  Vector2,
  type Event,
} from '@esotericsoftware/spine-core';
import { historyTaint } from '../src/core/constraints.ts';
import { CORE_DUMPER, CoreInputError, gridRound, poseSetup, rawNumber, readModel, underSkin, type CompiledDocument } from '../src/core/index.ts';
import { REGION_TRIANGLES, REGION_UVS } from '../src/core/clipping.ts';
import { IRR_OFFSET as CORE_IRR_OFFSET, poseAnimations, sampleTime as coreSampleTime, type TimelinePlant } from '../src/core/animation.ts';
import { pathAttachmentRows, pathRows, type CorePathRecord } from '../src/core/constraints_path.ts';
import { freshStepContext, physicsRows, stepSchedule, poseSteppedAnimations, type CorePhysicsRecord } from '../src/core/constraints_physics.ts';
import { poseUvs, readUvSequences, shownAtSample, shownAtSetup, steppedUvsWhy, type UvReading, type UvSource } from '../src/core/uvs.ts';
import { atlasRegionLookup, parseAtlasText } from '../src/atlas.ts';
import { poseLoopingWalk, poseWalkSetup, walkHistory, type WalkPlant, type WalkPose } from '../src/core/walk.ts';
import { noSkinView } from '../src/render_core.ts';
import { STEP_FRAMES } from '../src/assertions/bodies/a10.ts';
import { fileAnimationOrder } from '../src/compile.ts';
import { compileRuntime, DRAW_NONE, DRAW_REGION, RUNTIME_STAGE, RuntimePose, RuntimeRefusal, W_A, W_B, W_C, W_D, W_X, W_Y, WORLDS, type RuntimeAnimation, type RuntimeMissing, type RuntimePlant } from '../src/runtime/index.ts';

export const ORACLE_SPEC = 'pose-oracle/4';
// --- #966 raw: begin ---
/**
 * The raw document's spec (issue #966): `pose-oracle/N`'s shape, field for
 * field, with every number the double as computed (`rawNumber`) instead of on
 * the grid — derived from `ORACLE_SPEC`, so a field added there moves both.
 * A reader of the rounded spec refuses it by name rather than comparing full
 * doubles on the grid, and `compare` compares two raw documents in ulps at
 * tolerance 0 and refuses a raw document against a rounded one.
 */
export const ORACLE_RAW_SPEC = ORACLE_SPEC.replace('pose-oracle/', 'pose-oracle-raw/');
/** The number a dump writes: the grid (`gridRound`), or under `--raw` the double itself (`rawNumber`). */
export const roundOf = (options: { raw?: boolean; signed?: boolean }): ((v: number) => Num) => (options.signed === true ? signedNumber : options.raw === true ? rawNumber : gridRound);
/** The distance between two doubles in units in the last place — 0 for equal values (`0` and `-0` included), the count of representable doubles between them otherwise. */
export function ulpDistance(a: number, b: number): number {
  if (a === b) return 0;
  const f = new Float64Array(2);
  const i = new BigInt64Array(f.buffer);
  f[0] = a;
  f[1] = b;
  // Map the sign-magnitude bit patterns onto one ordered integer line.
  const ordered = (x: bigint): bigint => (x < 0n ? -(x & 0x7fffffffffffffffn) : x);
  const d = ordered(i[0]) - ordered(i[1]);
  return Number(d < 0n ? -d : d);
}
// --- #966 raw: end ---
export const ORACLE_DUMPER = 'spine-core 4.3.13';
export const ORACLE_PHASES = ['grid', 'off', 'irr', 'dense'] as const;
export type OraclePhase = (typeof ORACLE_PHASES)[number];
export const ORACLE_PHYSICS = ['none', 'step'] as const;
export type OraclePhysics = (typeof ORACLE_PHYSICS)[number];
/** `1 − 1/φ`, the prototype's irrational offset, to the nine places it wrote — held by the core (`src/core/animation.ts`), so the two dumpers sample at one set of times. */
export const IRR_OFFSET = CORE_IRR_OFFSET;
/** The rounding grid: six decimals. */
export const ORACLE_GRID = 1e6;
/** The ill-conditioned bound on `|det|`, the prototype's `EPS_DET`. */
export const ORACLE_EPS_DET = 1e-6;
export const ORACLE_DEFAULT_SAMPLES = 9;
export const ORACLE_DEFAULT_DT = '1/60';
export const ORACLE_DEFAULT_TOL = 1e-6;

/** A refusal about an input — the command exits 2 on it. */
export class OracleInputError extends Error {}

export type Num = number | null;
export type BoneRow = [string, Num, Num, Num, Num, Num, Num, 0 | 1, string | null];
export type SlotRow = [string, string | null, Num, Num, Num, Num, [Num, Num, Num] | null, string | null, string | null];
export type AttachmentRow = [string, string, 'region' | 'mesh', Num[]];
export type ClipRow = [string, string, string | null, Num[]];
export type ClippedRow = [string, string, 0 | 1, Num[], Num[], number[]];
/** One row of `uvs` (issue #967): `[slot, attachment, page, uvs]`. */
export type UvRow = [string, string, string, Num[]];
export type EventRow = [string, Num, number, Num, string | null];

export interface OraclePose {
  bones: BoneRow[];
  slots: SlotRow[];
  drawOrder: string[];
  attachments: AttachmentRow[];
  clips: ClipRow[];
  clipped: ClippedRow[];
  uvs: UvRow[];
}

export interface OracleSample extends OraclePose {
  t: Num;
  events: EventRow[];
}

export interface OracleAnimation {
  name: string;
  duration: Num;
  samples: OracleSample[];
}

/** A sample in which a block may be absent (`null` in every sample, and named in `absent`). */
export interface OracleDocumentSample {
  t: Num;
  events: EventRow[] | null;
  bones: BoneRow[] | null;
  slots: SlotRow[] | null;
  drawOrder: string[] | null;
  attachments: AttachmentRow[] | null;
  clips: ClipRow[] | null;
  clipped: ClippedRow[] | null;
  uvs: UvRow[] | null;
}

export interface OracleDocumentAnimation {
  name: string;
  duration: Num;
  samples: OracleDocumentSample[];
}

export interface OracleOptions {
  phase: OraclePhase;
  samples: number;
  skin: string;
  physics: OraclePhysics;
  dt: number | null;
  /** `dump --raw` (issue #966): every number unrounded and the spec `ORACLE_RAW_SPEC`. Not written into the document's `options`: the spec says it. */
  raw?: boolean;
  /** The `unposed` command's in-memory reading (issue #979): every number the double as computed with its sign of zero kept (`signedNumber`). Never written: JSON spells `-0` as `0`. */
  signed?: boolean;
  /** The `unposed` command's second runtime reading (issue #979): under `--physics none`, every sample posed on a skeleton of its own rather than on the one before it. Never written. */
  fresh?: boolean;
}

export interface OraclePhysicsRow {
  name: string;
  bone: string;
  x: Num;
  y: Num;
  rotate: Num;
  scaleX: Num;
  shearX: Num;
  limit: Num;
  step: Num;
  inertia: Num;
  strength: Num;
  damping: Num;
  massInverse: Num;
  wind: Num;
  gravity: Num;
  mix: Num;
  inertiaGlobal: boolean;
  strengthGlobal: boolean;
  dampingGlobal: boolean;
  massGlobal: boolean;
  windGlobal: boolean;
  gravityGlobal: boolean;
  mixGlobal: boolean;
  skinRequired: boolean;
  scaleYMode: string;
}

export interface OraclePathRow {
  name: string;
  slot: string;
  bones: string[];
  positionMode: string;
  spacingMode: string;
  rotateMode: string;
  offsetRotation: Num;
  position: Num;
  spacing: Num;
  mixRotate: Num;
  mixX: Num;
  mixY: Num;
}

export interface OraclePathAttachmentRow {
  skin: string;
  slot: string;
  placeholder: string;
  closed: boolean;
  constantSpeed: boolean;
  lengths: Num[];
}

export interface OracleDump {
  spec: string;
  dumper: string;
  source: { spine: string | null; hash: string | null };
  options: OracleOptions;
  bones: string[];
  slots: Array<[string, string]>;
  skins: string[];
  constraints: Array<[string, string]>;
  physics: OraclePhysicsRow[];
  paths: OraclePathRow[];
  pathAttachments: OraclePathAttachmentRow[];
  setup: OraclePose;
  animations: OracleAnimation[];
}

/**
 * Every block a document may leave absent (`null`), by the name `compare` and
 * a SKIP line use: the top-level lists, then the setup pose's own, then
 * `animations` — the document's key order.
 */
export const ORACLE_BLOCKS = [
  'bones', 'slots', 'skins', 'constraints', 'physics', 'paths', 'pathAttachments',
  'setup.bones', 'setup.slots', 'setup.drawOrder', 'setup.attachments', 'setup.clips', 'setup.clipped', 'setup.uvs', 'animations',
  'animations.bones', 'animations.slots', 'animations.drawOrder', 'animations.attachments', 'animations.clips', 'animations.clipped', 'animations.uvs', 'animations.events',
] as const;
export type OracleBlock = (typeof ORACLE_BLOCKS)[number];

/** The blocks a sample carries, by their block names: absent from a document means `null` in every one of its samples. */
export const SAMPLE_BLOCKS = ['animations.bones', 'animations.slots', 'animations.drawOrder', 'animations.attachments', 'animations.clips', 'animations.clipped', 'animations.uvs', 'animations.events'] as const;
export type SampleBlock = (typeof SAMPLE_BLOCKS)[number];
const sampleField = (block: SampleBlock): 'bones' | 'slots' | 'drawOrder' | 'attachments' | 'clips' | 'clipped' | 'uvs' | 'events' =>
  block.slice('animations.'.length) as 'bones' | 'slots' | 'drawOrder' | 'attachments' | 'clips' | 'clipped' | 'uvs' | 'events';

/** A setup pose in which a block may be absent. */
export interface OracleDocumentPose {
  bones: BoneRow[] | null;
  slots: SlotRow[] | null;
  drawOrder: string[] | null;
  attachments: AttachmentRow[] | null;
  clips: ClipRow[] | null;
  clipped: ClippedRow[] | null;
  uvs: UvRow[] | null;
}

/**
 * A `pose-oracle/4` document from either dumper: an `OracleDump` is one with
 * nothing absent. `absent` names every `null` block with the construct its
 * dumper has not admitted; a spine-core dump carries none and writes no
 * `absent` key.
 */
export interface OracleDocument {
  spec: string;
  dumper: string;
  source: { spine: string | null; hash: string | null };
  options: OracleOptions;
  absent?: Array<[string, string]>;
  bones: string[] | null;
  slots: Array<[string, string]> | null;
  skins: string[] | null;
  constraints: Array<[string, string]> | null;
  physics: OraclePhysicsRow[] | null;
  paths: OraclePathRow[] | null;
  pathAttachments: OraclePathAttachmentRow[] | null;
  setup: OracleDocumentPose;
  animations: OracleDocumentAnimation[] | null;
}

/**
 * Six decimals, round half up; `null` for a value that is not finite. The
 * function is the core's (`gridRound` in `src/core/index.ts`), so the two
 * dumpers round with one body rather than two that could drift.
 */
export function r(v: number): Num {
  return gridRound(v);
}

/** Sample `i` of `n` over duration `d` under `phase` — see the header. */
export function sampleTime(phase: OraclePhase, d: number, i: number, n: number): number {
  return coreSampleTime(phase, d, i, n);
}

/** `1/60`, `0.02` — a positive step in seconds, or a refusal naming the spelling. */
export function parseDt(text: string): number {
  const ratio = /^(\d+)\/(\d+)$/.exec(text);
  const value = ratio ? Number(ratio[1]) / Number(ratio[2]) : /^\d*\.?\d+(e-?\d+)?$/i.test(text) ? Number(text) : NaN;
  if (!Number.isFinite(value) || value <= 0) {
    throw new OracleInputError(`--dt ${JSON.stringify(text)} is not a positive step in seconds (write 1/60 or 0.016667)`);
  }
  return value;
}

/** Parse a skeleton through spine-core, or refuse naming the file and what the runtime said. */
export function loadOracleData(skeletonText: string, atlasText: string, where: string): SkeletonData {
  let json: unknown;
  try {
    json = JSON.parse(skeletonText);
  } catch (err) {
    throw new OracleInputError(`${where}: not JSON — ${(err as Error).message}`);
  }
  try {
    const atlas = new TextureAtlas(atlasText);
    return new SkeletonJson(new AtlasAttachmentLoader(atlas)).readSkeletonData(json);
  } catch (err) {
    throw new OracleInputError(`${where}: spine-core did not load it — ${(err as Error).message}`);
  }
}

/**
 * The setup-pose bounding box as spine-core returns it (issue #907): a fresh
 * `Skeleton` — no skin set — posed by `updateWorldTransform(Physics.none)`
 * and bounded by `getBounds(offset, size, temp)`, called without a clipper,
 * in full doubles: `[x, y, width, height]`, or `null` where it returned an
 * infinite offset (nothing drawn). The reading `src/core/raw.ts`'s
 * `setupBounds` is held to at tolerance 0 by `tools/core_gate.ts`'s bounds
 * rows.
 */
export function spineSetupBounds(data: SkeletonData): [number, number, number, number] | null {
  const skeleton = new Skeleton(data);
  skeleton.updateWorldTransform(Physics.none);
  const offset = new Vector2();
  const size = new Vector2();
  skeleton.getBounds(offset, size, []);
  if (!Number.isFinite(offset.x) || !Number.isFinite(offset.y)) return null;
  return [offset.x, offset.y, size.x, size.y];
}

function constraintType(c: unknown, name: string): string {
  if (c instanceof IkConstraintData) return 'ik';
  if (c instanceof TransformConstraintData) return 'transform';
  if (c instanceof PathConstraintData) return 'path';
  if (c instanceof PhysicsConstraintData) return 'physics';
  if (c instanceof SliderData) return 'slider';
  throw new OracleInputError(`constraint "${name}" is none of ik, transform, path, physics, slider — this dumper has no row for it`);
}

function readPose(skeleton: Skeleton, r: (v: number) => Num = gridRound): OraclePose {
  const bones: BoneRow[] = skeleton.bones.map((b) => {
    const p = b.appliedPose;
    return [b.data.name, r(p.worldX), r(p.worldY), r(p.a), r(p.b), r(p.c), r(p.d), b.active ? 1 : 0, b.parent ? b.parent.data.name : null];
  });
  const slots: SlotRow[] = skeleton.slots.map((s) => {
    const p = s.appliedPose;
    const att = p.attachment;
    const dark = p.darkColor;
    const path = att instanceof RegionAttachment || att instanceof MeshAttachment ? att.path : null;
    return [
      s.data.name,
      att ? att.name : null,
      r(p.color.r),
      r(p.color.g),
      r(p.color.b),
      r(p.color.a),
      dark === null ? null : [r(dark.r), r(dark.g), r(dark.b)],
      path ?? null,
      BlendMode[s.data.blendMode] ?? null,
    ];
  });
  const drawOrder: string[] = [];
  const attachments: AttachmentRow[] = [];
  const clips: ClipRow[] = [];
  const clipped: ClippedRow[] = [];
  const uvs: UvRow[] = [];
  // The page and page UVs the renderer draws with (`pieceOf` in src/render.ts) — see the header's `uvs`.
  const drawUvs = (slot: Slot, att: MeshAttachment | RegionAttachment): void => {
    const index = att.sequence.resolveIndex(slot.appliedPose);
    const region = att.sequence.regions[index];
    if (!(region instanceof TextureAtlasRegion)) throw new OracleInputError(`slot "${slot.data.name}" attachment "${att.name}" resolved to no atlas region at frame ${index}`);
    uvs.push([slot.data.name, att.name, region.page.name, Array.from(att.sequence.getUVs(index)).map(r)]);
  };
  // The renderer's walk (`piecesOf` in src/render.ts), with the attachment's local UVs — see the header's `clipped`.
  const clipper = new SkeletonClipping();
  const drawClipped = (slot: Slot, name: string, world: number[], triangles: ArrayLike<number>, uvs: ArrayLike<number>): void => {
    if (!clipper.isClipping()) return;
    const tri = Array.from(triangles);
    const ret = clipper.clipTrianglesUnpacked(world, 0, tri, tri.length, Float32Array.from(uvs), 2);
    clipped.push([slot.data.name, name, ret ? 1 : 0, Array.from(clipper.clippedVerticesTyped).map(r), Array.from(clipper.clippedUVsTyped).map(r), Array.from(clipper.clippedTrianglesTyped)]);
  };
  for (const slot of skeleton.drawOrder.appliedPose) {
    drawOrder.push(slot.data.name);
    const att = slot.appliedPose.attachment;
    if (att instanceof MeshAttachment) {
      const out = new Array<number>(att.worldVerticesLength).fill(0);
      att.computeWorldVertices(skeleton, slot, 0, att.worldVerticesLength, out, 0, 2);
      attachments.push([slot.data.name, att.name, 'mesh', out.map(r)]);
      drawClipped(slot, att.name, out, att.triangles, att.regionUVs);
      drawUvs(slot, att);
    } else if (att instanceof RegionAttachment) {
      const out = new Array<number>(8).fill(0);
      att.computeWorldVertices(slot, att.getOffsets(slot.appliedPose), out, 0, 2);
      attachments.push([slot.data.name, att.name, 'region', out.map(r)]);
      drawClipped(slot, att.name, out, REGION_TRIANGLES, REGION_UVS);
      drawUvs(slot, att);
    } else if (att instanceof ClippingAttachment) {
      const out = new Array<number>(att.worldVerticesLength).fill(0);
      att.computeWorldVertices(skeleton, slot, 0, att.worldVerticesLength, out, 0, 2);
      clips.push([slot.data.name, att.name, att.endSlot ? att.endSlot.name : null, out.map(r)]);
      clipper.clipEnd(slot);
      if (slot.bone.active) clipper.clipStart(skeleton, slot, att);
      continue;
    }
    clipper.clipEnd(slot);
  }
  clipper.clipEnd();
  return { bones, slots, drawOrder, attachments, clips, clipped, uvs };
}

function firedBetween(skeleton: Skeleton, anim: Animation, last: number, t: number, r: (v: number) => Num = gridRound): EventRow[] {
  const fired: Event[] = [];
  for (const timeline of anim.timelines) {
    if (timeline instanceof EventTimeline) timeline.apply(skeleton, last, t, fired, 1, MixFrom.setup, false, false, false);
  }
  return fired.map((e) => [e.data.name, r(e.time), e.intValue, r(e.floatValue), e.stringValue ?? null]);
}

/**
 * `--skin none` (issue #1051): no skin set — spine-core's `new Skeleton(data)`
 * with `setSkin` never called, and the core's `noSkinView`, the state
 * `render` without `--skin`, A10's walk and `validate()` pose in. A skin
 * literally named `none` is reached as `all`'s namesake is: not at all.
 */
export const ORACLE_NO_SKIN = 'none';

/** How the core dumper turns the `--skin` option into the document it poses — `viewOf`, unless a control plants a misreading (issue #1051's `CO30`). */
export type SkinViewOf = (model: CompiledDocument, skin: string) => CompiledDocument;

/** The core's view of `model` under the `--skin` option: no skin set, every skin merged, or one by name (`underSkin`). */
export function viewOf(model: CompiledDocument, skin: string): CompiledDocument {
  return skin === ORACLE_NO_SKIN ? noSkinView(model) : underSkin(model, skin);
}

/** Pose one skeleton into a `pose-oracle/3` document — see the header for every field. */
export function dumpSkeleton(data: SkeletonData, options: OracleOptions): OracleDump {
  const r = roundOf(options);
  let skin: Skin | null;
  if (options.skin === ORACLE_NO_SKIN) {
    // Issue #1051: no skin set — `new Skeleton(data)` posed as it comes.
    skin = null;
  } else if (options.skin === 'all') {
    skin = new Skin('__all');
    for (const s of data.skins) skin.addSkin(s);
  } else {
    const found = data.findSkin(options.skin);
    if (!found) {
      throw new OracleInputError(
        `--skin ${JSON.stringify(options.skin)}: no such skin; this skeleton declares [${data.skins.map((s) => s.name).join(', ') || 'none'}] (or pass all)`,
      );
    }
    skin = found;
  }
  if (options.physics === 'step' && (options.dt === null || !(options.dt > 0))) {
    throw new OracleInputError('--physics step needs a positive --dt');
  }
  const fresh = (): Skeleton => {
    const s = new Skeleton(data);
    if (skin !== null) s.setSkin(skin);
    return s;
  };

  const constraints: Array<[string, string]> = data.constraints.map((c) => [constraintType(c, c.name), c.name]);
  const physics: OraclePhysicsRow[] = [];
  const paths: OraclePathRow[] = [];
  for (const c of data.constraints) {
    if (c instanceof PhysicsConstraintData) {
      const s = c.setupPose;
      physics.push({
        name: c.name,
        bone: c.bone.name,
        x: r(c.x),
        y: r(c.y),
        rotate: r(c.rotate),
        scaleX: r(c.scaleX),
        shearX: r(c.shearX),
        limit: r(c.limit),
        step: r(c.step),
        inertia: r(s.inertia),
        strength: r(s.strength),
        damping: r(s.damping),
        massInverse: r(s.massInverse),
        wind: r(s.wind),
        gravity: r(s.gravity),
        mix: r(s.mix),
        inertiaGlobal: c.inertiaGlobal,
        strengthGlobal: c.strengthGlobal,
        dampingGlobal: c.dampingGlobal,
        massGlobal: c.massGlobal,
        windGlobal: c.windGlobal,
        gravityGlobal: c.gravityGlobal,
        mixGlobal: c.mixGlobal,
        skinRequired: c.skinRequired,
        scaleYMode: ScaleYMode[c.scaleYMode] ?? String(c.scaleYMode),
      });
    } else if (c instanceof PathConstraintData) {
      const s = c.setupPose;
      paths.push({
        name: c.name,
        slot: c.slot.name,
        bones: c.bones.map((b) => b.name),
        positionMode: PositionMode[c.positionMode] ?? String(c.positionMode),
        spacingMode: SpacingMode[c.spacingMode] ?? String(c.spacingMode),
        rotateMode: RotateMode[c.rotateMode] ?? String(c.rotateMode),
        offsetRotation: r(c.offsetRotation),
        position: r(s.position),
        spacing: r(s.spacing),
        mixRotate: r(s.mixRotate),
        mixX: r(s.mixX),
        mixY: r(s.mixY),
      });
    }
  }
  const pathAttachments: OraclePathAttachmentRow[] = [];
  for (const sk of data.skins) {
    for (const e of sk.getAttachments()) {
      const a = e.attachment;
      if (!(a instanceof PathAttachment)) continue;
      pathAttachments.push({
        skin: sk.name,
        slot: data.slots[e.slotIndex].name,
        placeholder: e.placeholder,
        closed: a.closed,
        constantSpeed: a.constantSpeed,
        lengths: a.lengths.map(r),
      });
    }
  }

  const n = options.samples;
  const animations: OracleAnimation[] = [];
  let setup: OraclePose;
  if (options.physics === 'none') {
    let skeleton = fresh();
    skeleton.setupPose();
    skeleton.updateWorldTransform(Physics.none);
    setup = readPose(skeleton, r);
    for (const anim of data.animations) {
      const samples: OracleSample[] = [];
      let last = -1;
      for (let i = 0; i < n; i++) {
        const t = sampleTime(options.phase, anim.duration, i, n);
        // #979: the fresh reading poses each sample on a skeleton no earlier pass has touched.
        if (options.fresh === true) skeleton = fresh();
        skeleton.setupPose();
        anim.apply(skeleton, 0, t, false, null, 1, MixFrom.setup, false, false, false);
        skeleton.updateWorldTransform(Physics.none);
        const events = firedBetween(skeleton, anim, last, t, r);
        last = t;
        samples.push({ t: r(t), events, ...readPose(skeleton, r) });
      }
      animations.push({ name: anim.name, duration: r(anim.duration), samples });
    }
  } else {
    const dt = options.dt as number;
    const rest = fresh();
    rest.setupPose();
    rest.update(0);
    rest.updateWorldTransform(Physics.reset);
    setup = readPose(rest, r);
    for (const anim of data.animations) {
      const skeleton = fresh();
      // #960: applied from the time it was last applied at (−1 before the first, a fresh track's `animationLast`), as a player applies it, so a physics `reset` key is crossed once.
      let applied = -1;
      const poseAt = (s: number): void => {
        skeleton.setupPose();
        anim.apply(skeleton, applied, s, false, null, 1, MixFrom.setup, false, false, false);
        applied = s;
      };
      poseAt(0);
      skeleton.update(0);
      skeleton.updateWorldTransform(Physics.reset);
      let now = 0;
      const stepTo = (s: number): void => {
        poseAt(s);
        skeleton.update(s - now);
        skeleton.updateWorldTransform(Physics.update);
        now = s;
      };
      const samples: OracleSample[] = [];
      let last = -1;
      for (let i = 0; i < n; i++) {
        const t = sampleTime(options.phase, anim.duration, i, n);
        const from = now;
        for (let k = 1; from + k * dt < t; k++) stepTo(from + k * dt);
        if (t > now) stepTo(t);
        const events = firedBetween(skeleton, anim, last, t, r);
        last = t;
        samples.push({ t: r(t), events, ...readPose(skeleton, r) });
      }
      animations.push({ name: anim.name, duration: r(anim.duration), samples });
    }
  }

  return {
    spec: options.raw === true ? ORACLE_RAW_SPEC : ORACLE_SPEC,
    dumper: ORACLE_DUMPER,
    source: { spine: data.version ?? null, hash: data.hash ?? null },
    options: { phase: options.phase, samples: options.samples, skin: options.skin, physics: options.physics, dt: options.physics === 'step' ? options.dt : null },
    bones: data.bones.map((b) => b.name),
    slots: data.slots.map((s): [string, string] => [s.name, s.boneData.name]),
    skins: data.skins.map((s) => s.name),
    constraints,
    physics,
    paths,
    pathAttachments,
    setup,
    animations,
  };
}

/** The document's bytes: one line and a newline, keys in the order the objects above were built in. */
export function dumpText(dump: OracleDocument): string {
  return `${JSON.stringify(dump)}\n`;
}

/**
 * The second dumper: a `rigc-compiled/1` document posed by rigc's own core
 * (`src/core/index.ts`) into the same shape — see the header's *`dump --core`*.
 * `options.skin` is `all` or a skin of the document (`underSkin`, issue
 * #932); a skin it does not declare is refused by name, as the spine-core
 * dump refuses it.
 */
export function coreDump(model: CompiledDocument, options: OracleOptions, plant: TimelinePlant = {}, uv: UvSource | null = null, view: SkinViewOf = viewOf): OracleDocument {
  let doc: CompiledDocument;
  try {
    doc = view(model, options.skin);
  } catch (err) {
    if (err instanceof CoreInputError) throw new OracleInputError(`dump --core: ${err.message}`);
    throw err;
  }
  const stepped = options.physics === 'step';
  if (stepped && (options.dt === null || !(options.dt > 0))) throw new OracleInputError('dump --core: --physics step needs a positive --dt');
  // `--raw` (issue #966): the core writes its rows' doubles unrounded.
  const round = roundOf(options);
  if (options.raw === true || options.signed === true) plant = { ...plant, round };
  const posed = stepped ? poseSetup(doc, plant, freshStepContext(plant.physicsStep)) : poseSetup(doc, plant);
  const { setup } = posed;
  const sampled = stepped ? poseSteppedAnimations(doc, options.phase, options.samples, options.dt as number, plant) : poseAnimations(doc, options.phase, options.samples, plant);
  const uvs = coreUvs(doc, options, uv, setup, posed.absent, sampled);
  const leftOut = new Set([...sampled.absent, ...uvs.absent].map((x) => x[0]));
  const absent = [...posed.absent, ...sampled.absent, ...uvs.absent].sort((x, y) => ORACLE_BLOCKS.indexOf(x[0] as OracleBlock) - ORACLE_BLOCKS.indexOf(y[0] as OracleBlock));
  const animations: OracleDocumentAnimation[] = sampled.animations.map((a, ai) => ({
    name: a.name,
    duration: a.duration,
    samples: a.samples.map((x, si) => ({
      t: x.t,
      events: x.events,
      bones: leftOut.has('animations.bones') ? null : x.bones,
      slots: leftOut.has('animations.slots') ? null : x.slots,
      drawOrder: leftOut.has('animations.drawOrder') ? null : x.drawOrder,
      attachments: leftOut.has('animations.attachments') ? null : x.attachments,
      clips: leftOut.has('animations.clips') ? null : x.clips,
      clipped: leftOut.has('animations.clipped') ? null : x.clipped,
      uvs: leftOut.has('animations.uvs') ? null : (uvs.samples[ai]?.[si] ?? null),
    })),
  }));
  return {
    spec: options.raw === true ? ORACLE_RAW_SPEC : ORACLE_SPEC,
    dumper: CORE_DUMPER,
    source: { spine: null, hash: null },
    options: { phase: options.phase, samples: options.samples, skin: options.skin, physics: options.physics, dt: stepped ? options.dt : null },
    absent,
    bones: doc.bones.map((b) => b.name),
    slots: doc.slots.map((s): [string, string] => [s.name, s.bone]),
    skins: doc.skins.map((s) => s.name),
    constraints: doc.constraints.map((c): [string, string] => [c.kind, c.name]),
    physics: physicsRows(doc.constraints.flatMap((c) => (c.record?.kind === 'physics' ? [c.record as CorePhysicsRecord] : [])), round) as unknown as OraclePhysicsRow[],
    paths: pathRows(doc.constraints.flatMap((c) => (c.record?.kind === 'path' ? [c.record as CorePathRecord] : [])), round),
    pathAttachments: pathAttachmentRows(doc.skins, round),
    setup: { ...setup, uvs: uvs.setup },
    animations,
  };
}

// ---------------------------------------------------------------------------
// the third dumper: the runtime poser (issue #1591)
// ---------------------------------------------------------------------------

/** Who posed a runtime dump — the header's *The third dumper*. */
export const RUNTIME_DUMPER = `rigc-runtime (stage ${RUNTIME_STAGE})`;

/** Why a runtime dump carries no page UVs. */
export const RUNTIME_NO_UVS_WHY = `the runtime poser (stage ${RUNTIME_STAGE}) poses no page UVs: where a drawing sits on a page is the atlas's, read by the consumer`;

/** Why a runtime dump carries no events — written only where a covered animation keys some, which the dump compiles past (`ignore: ['events']`). */
export const RUNTIME_NO_EVENTS_WHY = `an explicitly event-muted runtime dump was requested with ignore: ['events'] so the animations that key them are posed`;

/** A runtime dump: the document, holding the covered animations alone, and the animations refused with what each misses. */
export interface RuntimeDump {
  document: OracleDocument;
  refused: ReadonlyArray<{ animation: string; missing: readonly RuntimeMissing[] }>;
}

/**
 * The third dumper (the header's *The third dumper*): a `rigc-compiled/1`
 * document posed by the runtime poser (`src/runtime/`) into the same shape.
 * A model the runtime refuses throws its `RuntimeRefusal`, every missing
 * construct named; an animation it refuses is left out of `animations` and
 * listed in `refused`. `--physics step` is refused: the runtime has no
 * physics clock at this stage.
 */
export function runtimeDump(model: CompiledDocument, options: OracleOptions, plant: RuntimePlant = {}, view: SkinViewOf = viewOf): RuntimeDump {
  let doc: CompiledDocument;
  try {
    doc = view(model, options.skin);
  } catch (err) {
    if (err instanceof CoreInputError) throw new OracleInputError(`runtime dump: ${err.message}`);
    throw err;
  }
  const round = roundOf(options);
  const runtime = compileRuntime(doc, {}, plant);
  const pose = new RuntimePose(runtime);
  const read = (): OracleDocumentPose => {
    pose.computeClipped();
    const clipping = pose.clipping;
    if (clipping !== null && !clipping.nativeRows) throw new RuntimeRefusal([{ feature: 'oracle-absent', detail: 'the oracle has no native clipped rows for a concave, inverse or repeated-vertex polygon; core coverage is available through RuntimePose.computeClipped', animation: null }]);
    const bones = runtime.boneNames.map((name, i): BoneRow => {
      const o = i * WORLDS;
      const w = pose.world;
      const parent = runtime.parents[i];
      return [name, round(w[o + W_X]), round(w[o + W_Y]), round(w[o + W_A]), round(w[o + W_B]), round(w[o + W_C]), round(w[o + W_D]), runtime.active[i] === 1 ? 1 : 0, parent < 0 ? null : runtime.boneNames[parent]];
    });
    const slots = runtime.slots.map((slot, s): SlotRow => {
      const shown = pose.shown[s];
      const at = shown < 0 ? null : runtime.attachments[shown];
      const o = s * 4;
      const d = s * 3;
      return [slot.name, at === null ? null : at.name, round(pose.light[o]), round(pose.light[o + 1]), round(pose.light[o + 2]), round(pose.light[o + 3]), slot.dark === null ? null : [round(pose.dark[d]), round(pose.dark[d + 1]), round(pose.dark[d + 2])], at === null ? null : at.path, slot.blend];
    });
    const drawOrder: string[] = [];
    const attachments: AttachmentRow[] = [];
    for (let i = 0; i < pose.drawOrder.length; i++) {
      const s = pose.drawOrder[i];
      const slot = runtime.slots[s];
      drawOrder.push(slot.name);
      const shown = pose.shown[s];
      const at = shown < 0 ? null : runtime.attachments[shown];
      if (at !== null && at.clip === undefined && at.draw !== DRAW_NONE) attachments.push([slot.name, at.name, at.draw === DRAW_REGION ? 'region' : 'mesh', [...pose.vertices.subarray(at.offset, at.offset + at.count)].map(round)]);
    }
    const clips: ClipRow[] = [], clipped: ClippedRow[] = [];
    if (clipping !== null) {
      for (let i = 0; i < clipping.clipCount; i++) {
        const s = clipping.clipSlots[i], at = runtime.attachments[pose.shown[s]];
        clips.push([runtime.slots[s].name, at.name, at.clip!.end, Array.from(pose.vertices.subarray(at.offset, at.offset + at.count), round)]);
      }
      for (let i = 0; i < clipping.drawCount; i++) {
        const s = clipping.drawSlots[i], at = runtime.attachments[pose.shown[s]], out = clipping.outputs[s];
        clipped.push([runtime.slots[s].name, at.name, out.clipped ? 1 : 0, Array.from(out.vertices.subarray(0, out.vertexCount * 2), round), Array.from(out.uvs.subarray(0, out.vertexCount * 2), round), Array.from(out.triangles.subarray(0, out.triangleCount * 3))]);
      }
    }
    return { bones, slots, drawOrder, attachments, clips, clipped, uvs: null };
  };
  pose.setupPose(options.physics === 'step' ? 'reset' : 'none');
  const setup = read();
  const covered = doc.animations.filter((a) => runtime.animations.has(a.name));
  // One pose for the whole document, every animation in turn: a value one pose left behind is a difference in the next.
  const animations: OracleDocumentAnimation[] = covered.map((a) => {
    pose.setAnimation(a.name);
    const d = a.timelines.duration;
    const samples: OracleDocumentSample[] = [];
    const schedule = options.physics === 'step' ? stepSchedule(options.phase, d, options.samples, options.dt!) : null;
    let previous = 0;
    let lastSample = -1;
    if (schedule !== null) pose.apply(0, 'reset', 0);
    for (let i = 0; i < options.samples; i++) {
      const t = coreSampleTime(options.phase, d, i, options.samples);
      if (schedule === null) pose.apply(t);
      else for (const next of schedule[i]) { pose.apply(next, 'update', next - previous); previous = next; }
      const sampleEvents = a.timelines.events.filter(e => e.time > lastSample && e.time <= t).map(e => [e.name, round(e.time), e.int, round(e.float), e.string] as [string, number | null, number, number | null, string | null]);
      lastSample = t;
      samples.push({ t: round(t), events: schedule === null ? pose.events.map(e => [e.name, round(e.time), e.int, round(e.float), e.string]) : sampleEvents, ...read() });
    }
    return { name: a.name, duration: round(d), samples };
  });
  const absent: Array<[string, string]> = [['setup.uvs', RUNTIME_NO_UVS_WHY], ['animations.uvs', RUNTIME_NO_UVS_WHY]];
  return {
    document: {
      spec: options.raw === true ? ORACLE_RAW_SPEC : ORACLE_SPEC,
      dumper: RUNTIME_DUMPER,
      source: { spine: null, hash: null },
      options: { phase: options.phase, samples: options.samples, skin: options.skin, physics: options.physics, dt: options.dt },
      absent,
      bones: doc.bones.map((b) => b.name),
      slots: doc.slots.map((s): [string, string] => [s.name, s.bone]),
      skins: doc.skins.map((s) => s.name),
      constraints: doc.constraints.map((c): [string, string] => [c.kind, c.name]),
      physics: physicsRows(doc.constraints.flatMap(c => c.record?.kind === 'physics' ? [c.record as CorePhysicsRecord] : []), round) as unknown as OraclePhysicsRow[],
      paths: pathRows(doc.constraints.flatMap(c => c.record?.kind === 'path' ? [c.record as CorePathRecord] : []), round),
      pathAttachments: pathAttachmentRows(doc.skins, round),
      setup,
      animations,
    },
    refused: runtime.refused,
  };
}

// ---------------------------------------------------------------------------
// the core's uvs blocks (issue #967)
// ---------------------------------------------------------------------------

/**
 * What the core's `uvs` blocks read besides the model: the atlas text — the
 * build's `skeleton.atlas`, read by rigc's own reader — and the model text,
 * whose sequences `readUvSequences` reads (`readModel` keeps a series' count
 * only). `reading` is a plant's (`UvReading`); nothing else passes one.
 */
export function uvSourceOf(atlasText: string, modelText: string, reading?: UvReading): UvSource {
  let document: unknown;
  try {
    document = JSON.parse(modelText);
  } catch (err) {
    throw new OracleInputError(`the model document is not JSON — ${(err as Error).message}`);
  }
  let sequences;
  try {
    sequences = readUvSequences(document);
  } catch (err) {
    if (err instanceof CoreInputError) throw new OracleInputError(`dump --core: ${err.message}`);
    throw err;
  }
  return { lookup: atlasRegionLookup(parseAtlasText(atlasText)), sequences, ...(reading === undefined ? {} : { reading }) };
}

/** Why no `uvs` block is posed without an atlas — the header's `dump --core`. */
export const NO_ATLAS_WHY = 'no atlas was given (dump --core <model> --atlas <file>); the model carries no page layout — the page, x, y and rotate are the packer\'s (ModelAtlasRect in src/model.ts)';

/**
 * The core's `setup.uvs` and every sample's `uvs` (`src/core/uvs.ts`), or the
 * blocks left out with their reasons — the header's `dump --core`. A region
 * the atlas lacks is refused (`OracleInputError`, exit 2).
 */
function coreUvs(
  doc: CompiledDocument,
  options: OracleOptions,
  uv: UvSource | null,
  setup: { slots: unknown[] | null; drawOrder: string[] | null },
  setupAbsent: ReadonlyArray<[string, string]>,
  sampled: { animations: Array<{ samples: Array<{ slots: unknown[] | null; drawOrder: string[] | null }> }>; absent: ReadonlyArray<[string, string]> },
): { setup: UvRow[] | null; samples: Array<Array<UvRow[] | null>>; absent: Array<[string, string]> } {
  const none = { setup: null, samples: [] };
  if (uv === null) return { ...none, absent: [['setup.uvs', NO_ATLAS_WHY], ['animations.uvs', NO_ATLAS_WHY]] };
  const stepWhy = options.physics === 'step' ? steppedUvsWhy(doc) : null;
  const slidersWithoutBones = (bones: string): string | null => (doc.constraints.some((c) => c.kind === 'slider') ? `${bones} is absent, and a slider's time — which can switch what a slot shows and its frame — is read off the bones` : null);
  const upstream = (absent: ReadonlyArray<[string, string]>, prefix: 'setup' | 'animations'): string | null => {
    const has = (block: string): boolean => absent.some((x) => x[0] === block);
    if (has(`${prefix}.slots`)) return `${prefix}.slots is absent, so what a slot shows is not posed`;
    if (has(`${prefix}.drawOrder`)) return `${prefix}.drawOrder is absent, and the rows are in the draw order`;
    return has(`${prefix}.bones`) ? slidersWithoutBones(`${prefix}.bones`) : null;
  };
  const posedRows = (shown: { shown: Parameters<typeof poseUvs>[1]; why: string[] }, order: readonly string[]): { rows: UvRow[] | null; why: string | null } => {
    if (shown.why.length > 0) return { rows: null, why: shown.why.join('; ') };
    try {
      return poseUvs(doc, shown.shown, order, uv, roundOf(options));
    } catch (err) {
      if (err instanceof CoreInputError) throw new OracleInputError(`dump --core: ${err.message}`);
      throw err;
    }
  };
  const absent: Array<[string, string]> = [];
  let setupRows: UvRow[] | null = null;
  const setupWhy = stepWhy ?? upstream(setupAbsent, 'setup');
  if (setupWhy === null && setup.drawOrder !== null) {
    const posed = posedRows(shownAtSetup(doc), setup.drawOrder);
    setupRows = posed.rows;
    if (posed.why !== null) absent.push(['setup.uvs', posed.why]);
  } else absent.push(['setup.uvs', setupWhy ?? 'setup.drawOrder is absent, and the rows are in the draw order']);
  const samples: Array<Array<UvRow[] | null>> = [];
  const sampleWhy = stepWhy ?? upstream(sampled.absent, 'animations');
  const whys: string[] = [];
  if (sampleWhy === null) {
    doc.animations.forEach((anim, ai) => {
      const out: Array<UvRow[] | null> = [];
      (sampled.animations[ai]?.samples ?? []).forEach((x, i) => {
        const t = coreSampleTime(options.phase, anim.timelines.duration, i, options.samples);
        const posed = x.drawOrder === null ? { rows: null, why: 'the sample\'s draw order is absent' } : posedRows(shownAtSample(doc, anim, t), x.drawOrder);
        if (posed.why !== null && !whys.includes(posed.why)) whys.push(posed.why);
        out.push(posed.rows);
      });
      samples.push(out);
    });
  }
  if (sampleWhy !== null) absent.push(['animations.uvs', sampleWhy]);
  else if (whys.length > 0) absent.push(['animations.uvs', whys.join('; ')]);
  return { setup: setupRows, samples, absent };
}

/**
 * A block of a document, or `null` when the document leaves it absent. A
 * sample block is every sample's field, in order, or `null` when the document
 * names it absent or carries no animations.
 */
export function blockOf(doc: OracleDocument, block: OracleBlock): unknown[] | null {
  if ((SAMPLE_BLOCKS as readonly string[]).includes(block)) {
    if (doc.animations === null || doc.absent?.some((x) => x[0] === block)) return null;
    const field = sampleField(block as SampleBlock);
    return doc.animations.flatMap((a) => a.samples.map((x) => x[field]));
  }
  switch (block) {
    case 'setup.bones':
      return doc.setup.bones;
    case 'setup.slots':
      return doc.setup.slots;
    case 'setup.drawOrder':
      return doc.setup.drawOrder;
    case 'setup.attachments':
      return doc.setup.attachments;
    case 'setup.clips':
      return doc.setup.clips;
    case 'setup.clipped':
      return doc.setup.clipped;
    case 'setup.uvs':
      return doc.setup.uvs;
    default:
      return doc[block as 'bones' | 'slots' | 'skins' | 'constraints' | 'physics' | 'paths' | 'pathAttachments' | 'animations'];
  }
}

/** Where a dump's input is: a build directory, or a skeleton and its atlas. */
export function resolveDumpInput(paths: readonly string[]): { skeleton: string; atlas: string } {
  if (paths.length === 1) {
    const dir = paths[0];
    if (!existsSync(dir) || !statSync(dir).isDirectory()) {
      throw new OracleInputError(`dump: ${dir} is not a build directory (pass <build dir>, or <skeleton.json> <atlas>)`);
    }
    const skeleton = join(dir, 'skeleton.json');
    const atlas = join(dir, 'skeleton.atlas');
    const missing = [skeleton, atlas].filter((p) => !existsSync(p));
    if (missing.length > 0) {
      throw new OracleInputError(`dump: build directory ${dir} has no ${missing.map((p) => p.slice(dir.length + 1)).join(' and no ')} — rigc build writes both`);
    }
    return { skeleton, atlas };
  }
  if (paths.length === 2) {
    const missing = paths.filter((p) => !existsSync(p));
    if (missing.length > 0) throw new OracleInputError(`dump: no such file: ${missing.join(', ')}`);
    return { skeleton: paths[0], atlas: paths[1] };
  }
  throw new OracleInputError(`dump: expected <build dir> or <skeleton.json> <atlas>, got ${paths.length} path(s)`);
}

// ---------------------------------------------------------------------------
// compare
// ---------------------------------------------------------------------------

export interface OracleTolerance {
  xy: number;
  m: number;
}

interface Worst {
  d: number;
  what: string;
}

/** One row of the comparison: the setup pose, or one animation. */
export interface OracleRowReport {
  name: string;
  samples: number;
  boneSamples: number;
  exact: number;
  over: number;
  excluded: number;
  worstXy: Worst;
  worstM: Worst;
  vertices: number;
  verticesOver: number;
  worstVertex: Worst;
  mismatches: Record<string, number>;
  /** Every named difference, in the order found; `first` is the first. */
  findings: string[];
}

export interface OracleComparison {
  /** Two `--raw` documents (issue #966): every worst below is in ulps, and every tolerance was 0. */
  raw?: boolean;
  identical: boolean;
  /**
   * `<block>: not produced by <dumper>[ — why]`, one per block exactly one side
   * leaves absent, in document order. Neither compared nor counted: IDENTICAL
   * is a statement about the blocks both documents carry.
   */
  skipped: string[];
  rows: OracleRowReport[];
  /** Differences that belong to no row: rosters, constraints, parameters. */
  document: string[];
  first: string | null;
  worstXy: number;
  worstM: number;
  worstVertex: number;
  excluded: number;
  boneSamples: number;
}

/** Integer millionths — the grid every number was rounded to. */
const units = (v: number): number => Math.round(v * ORACLE_GRID);
// --- #966 raw: begin ---
/**
 * How two numbers are measured apart: on the grid, in integer millionths; on
 * two raw documents (issue #966), in ulps (`ulpDistance`), with every
 * tolerance 0. `compareDumps` sets it for the one comparison it runs.
 */
interface Metric {
  raw: boolean;
  delta: (a: number, b: number) => number;
  fmt: (d: number) => string;
  /** What a tolerance in the document's units is multiplied by to read in the metric's. */
  scale: number;
}
const GRID_METRIC: Metric = { raw: false, delta: (a, b) => Math.abs(units(a) - units(b)), fmt: (u) => (u / ORACLE_GRID).toFixed(6), scale: ORACLE_GRID };
const RAW_METRIC: Metric = { raw: true, delta: ulpDistance, fmt: (u) => `${u} ulp`, scale: 1 };
let metric: Metric = GRID_METRIC;
const fmt = (u: number): string => metric.fmt(u);
// --- #966 raw: end ---
const at = (row: string, t: Num): string => (row === '(setup)' ? 'the setup pose' : `animation "${row}" t=${t ?? 'null'}`);

/** Throws naming the first field that is not what a `pose-oracle/3` document has. */
export function asOracleDump(value: unknown, where: string): OracleDump {
  if (typeof value !== 'object' || value === null) throw new OracleInputError(`${where}: not a JSON object`);
  const v = value as Record<string, unknown>;
  if (v.spec !== ORACLE_SPEC) throw new OracleInputError(`${where}: spec is ${JSON.stringify(v.spec)}, not "${ORACLE_SPEC}"`);
  for (const key of ['options', 'setup', 'source'] as const) {
    if (typeof v[key] !== 'object' || v[key] === null) throw new OracleInputError(`${where}: no ${key} object`);
  }
  for (const key of ['bones', 'slots', 'skins', 'constraints', 'physics', 'paths', 'pathAttachments', 'animations'] as const) {
    if (!Array.isArray(v[key])) throw new OracleInputError(`${where}: ${key} is not a list`);
  }
  return value as OracleDump;
}

/**
 * Throws naming the first field that is not what a `pose-oracle/3` document
 * has — either dumper's: a block may be `null`, and then the document's
 * `absent` list must name it, and name nothing else.
 */
export function asOracleDocument(value: unknown, where: string): OracleDocument {
  if (typeof value !== 'object' || value === null) throw new OracleInputError(`${where}: not a JSON object`);
  const v = value as Record<string, unknown>;
  if (v.spec !== ORACLE_SPEC && v.spec !== ORACLE_RAW_SPEC) throw new OracleInputError(`${where}: spec is ${JSON.stringify(v.spec)}, not "${ORACLE_SPEC}" (or "${ORACLE_RAW_SPEC}", a --raw dump)`);
  for (const key of ['options', 'setup', 'source'] as const) {
    if (typeof v[key] !== 'object' || v[key] === null) throw new OracleInputError(`${where}: no ${key} object`);
  }
  const doc = value as OracleDocument;
  const absent = v.absent;
  if (absent !== undefined && !(Array.isArray(absent) && absent.every((x) => Array.isArray(x) && x.length === 2 && typeof x[0] === 'string' && typeof x[1] === 'string'))) {
    throw new OracleInputError(`${where}: absent is not a list of [block, why] pairs`);
  }
  const named = absent === undefined ? [] : (absent as Array<[string, string]>).map((x) => x[0]);
  const nulls: string[] = [];
  for (const block of ORACLE_BLOCKS) {
    const sample = (SAMPLE_BLOCKS as readonly string[]).includes(block);
    // With no animations the sample blocks are nobody's: the `animations` line speaks for them.
    if (sample && doc.animations === null) continue;
    if (sample) {
      // Named absent: null in every sample. Not named: a list in every sample.
      const field = sampleField(block as SampleBlock);
      const cells = (doc.animations ?? []).flatMap((a) => (Array.isArray(a?.samples) ? a.samples.map((x) => x?.[field]) : [undefined]));
      const leftOut = named.includes(block);
      const odd = cells.findIndex((c) => (leftOut ? c !== null : !Array.isArray(c)));
      if (odd >= 0) throw new OracleInputError(`${where}: ${block} is ${leftOut ? 'named absent and a sample carries it' : 'not named absent and a sample carries no list for it'} (sample ${odd} in document order)`);
      if (leftOut) nulls.push(block);
      continue;
    }
    const b = blockOf(doc, block);
    if (b === undefined || (b !== null && !Array.isArray(b))) throw new OracleInputError(`${where}: ${block} is neither a list nor null`);
    if (b === null) nulls.push(block);
  }
  const unnamed = nulls.filter((b) => !named.includes(b));
  const extra = named.filter((b) => !nulls.includes(b));
  if (unnamed.length > 0) throw new OracleInputError(`${where}: ${unnamed.join(', ')} ${unnamed.length === 1 ? 'is' : 'are'} null and the absent list does not say why`);
  if (extra.length > 0) throw new OracleInputError(`${where}: the absent list names ${extra.join(', ')}, which ${extra.length === 1 ? 'is' : 'are'} present or no block of the document`);
  return doc;
}

/** Bones excluded at one sample: `|det| < ε` in either pose, and their descendants. */
export function illConditioned(a: BoneRow[], b: Map<string, BoneRow>): Set<string> {
  const bad = new Set<string>();
  const det = (row: BoneRow): number | null =>
    row[3] === null || row[4] === null || row[5] === null || row[6] === null ? null : row[3] * row[6] - row[4] * row[5];
  for (const row of a) {
    const other = b.get(row[0]);
    const da = det(row);
    const db = other === undefined ? null : det(other);
    if ((da !== null && Math.abs(da) < ORACLE_EPS_DET) || (db !== null && Math.abs(db) < ORACLE_EPS_DET)) bad.add(row[0]);
  }
  if (bad.size === 0) return bad;
  // Bones are listed parent-before-child, so one pass carries the exclusion down.
  for (const row of a) if (row[8] !== null && bad.has(row[8])) bad.add(row[0]);
  return bad;
}

function listDiff(kind: string, a: readonly string[], b: readonly string[]): string[] {
  const out: string[] = [];
  const onlyA = a.filter((x) => !b.includes(x));
  const onlyB = b.filter((x) => !a.includes(x));
  if (onlyA.length > 0) out.push(`${kind} only in A: ${onlyA.map((x) => JSON.stringify(x)).join(', ')}`);
  if (onlyB.length > 0) out.push(`${kind} only in B: ${onlyB.map((x) => JSON.stringify(x)).join(', ')}`);
  if (out.length === 0 && a.join('\u0000') !== b.join('\u0000')) out.push(`${kind} are the same names in a different order`);
  return out;
}

function numDelta(a: Num, b: Num): number | 'nonfinite' {
  if (a === null || b === null) return 'nonfinite';
  return metric.delta(a, b);
}

function paramDiffs(kind: string, key: string, a: Record<string, unknown>, b: Record<string, unknown>, tolM: number): string[] {
  const out: string[] = [];
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  for (const k of keys) {
    const va = a[k];
    const vb = b[k];
    if (typeof va === 'number' && typeof vb === 'number') {
      const d = metric.delta(va, vb);
      if (d > tolM) out.push(`${kind} "${key}" ${k}: ${va} vs ${vb}`);
    } else if (JSON.stringify(va) !== JSON.stringify(vb)) {
      if (Array.isArray(va) && Array.isArray(vb) && va.length === vb.length && va.every((x) => typeof x === 'number')) {
        const d = Math.max(...va.map((x, i) => metric.delta(x as number, vb[i] as number)));
        if (d > tolM) out.push(`${kind} "${key}" ${k}: worst Δ ${fmt(d)}`);
      } else {
        out.push(`${kind} "${key}" ${k}: ${JSON.stringify(va)} vs ${JSON.stringify(vb)}`);
      }
    }
  }
  return out;
}

function newRow(name: string): OracleRowReport {
  return {
    name,
    samples: 0,
    boneSamples: 0,
    exact: 0,
    over: 0,
    excluded: 0,
    worstXy: { d: 0, what: '' },
    worstM: { d: 0, what: '' },
    vertices: 0,
    verticesOver: 0,
    worstVertex: { d: 0, what: '' },
    mismatches: {},
    findings: [],
  };
}

/** The pose blocks a comparison reads; a setup pose one side leaves partly absent passes fewer. */
type PoseBlock = 'bones' | 'slots' | 'drawOrder' | 'attachments' | 'clips' | 'clipped' | 'uvs';
const EVERY_POSE_BLOCK: ReadonlySet<PoseBlock> = new Set<PoseBlock>(['bones', 'slots', 'drawOrder', 'attachments', 'clips', 'clipped', 'uvs']);

function comparePose(
  row: OracleRowReport,
  t: Num,
  pa: OracleDocumentPose,
  pb: OracleDocumentPose,
  tolXy: number,
  tolM: number,
  slotBones: Map<string, string>,
  carry: ReadonlySet<PoseBlock> = EVERY_POSE_BLOCK,
): void {
  const where = at(row.name, t);
  const note = (kind: string, text: string): void => {
    row.mismatches[kind] = (row.mismatches[kind] ?? 0) + 1;
    row.findings.push(`${where}: ${text}`);
  };
  // A block not carried is compared as empty on both sides, which is nothing.
  const take = <T>(block: PoseBlock, l: T[] | null): T[] => (carry.has(block) && l !== null ? l : []);
  const a = { bones: take('bones', pa.bones), slots: take('slots', pa.slots), drawOrder: take('drawOrder', pa.drawOrder), attachments: take('attachments', pa.attachments), clips: take('clips', pa.clips), clipped: take('clipped', pa.clipped), uvs: take('uvs', pa.uvs) };
  const b = { bones: take('bones', pb.bones), slots: take('slots', pb.slots), drawOrder: take('drawOrder', pb.drawOrder), attachments: take('attachments', pb.attachments), clips: take('clips', pb.clips), clipped: take('clipped', pb.clipped), uvs: take('uvs', pb.uvs) };
  row.samples++;
  const bBones = new Map(b.bones.map((x) => [x[0], x]));
  const excluded = illConditioned(a.bones, bBones);
  row.excluded += excluded.size;
  for (const bone of a.bones) {
    const other = bBones.get(bone[0]);
    if (other === undefined) {
      note('roster', `bone "${bone[0]}" is in A's pose and not in B's`);
      continue;
    }
    if (bone[7] !== other[7]) note('active', `bone "${bone[0]}" active ${bone[7]} vs ${other[7]}`);
    if (bone[8] !== other[8]) note('parent', `bone "${bone[0]}" parent ${JSON.stringify(bone[8])} vs ${JSON.stringify(other[8])}`);
    if (excluded.has(bone[0])) continue;
    row.boneSamples++;
    let dxy = 0;
    let dm = 0;
    let nonFinite = false;
    for (let i = 1; i <= 6; i++) {
      const d = numDelta(bone[i] as Num, other[i] as Num);
      if (d === 'nonfinite') {
        nonFinite = true;
        continue;
      }
      if (i <= 2) dxy = Math.max(dxy, d);
      else dm = Math.max(dm, d);
    }
    if (nonFinite) note('nonFinite', `bone "${bone[0]}" has a non-finite term in A or B`);
    if (dxy === 0 && dm === 0 && !nonFinite) row.exact++;
    if (dxy > row.worstXy.d) row.worstXy = { d: dxy, what: `bone "${bone[0]}" at ${where}` };
    if (dm > row.worstM.d) row.worstM = { d: dm, what: `bone "${bone[0]}" at ${where}` };
    if (dxy > tolXy || dm > tolM) {
      row.over++;
      row.findings.push(
        `${where}: bone "${bone[0]}" Δxy ${fmt(dxy)} Δabcd ${fmt(dm)} — A [${bone.slice(1, 7).join(', ')}] B [${other.slice(1, 7).join(', ')}]`,
      );
    }
  }
  for (const bone of b.bones) if (!a.bones.some((x) => x[0] === bone[0])) note('roster', `bone "${bone[0]}" is in B's pose and not in A's`);

  const bSlots = new Map(b.slots.map((x) => [x[0], x]));
  for (const slot of a.slots) {
    const other = bSlots.get(slot[0]);
    if (other === undefined) {
      note('roster', `slot "${slot[0]}" is in A's pose and not in B's`);
      continue;
    }
    if (slot[1] !== other[1]) note('attachment', `slot "${slot[0]}" shows ${JSON.stringify(slot[1])} vs ${JSON.stringify(other[1])}`);
    if (slot[7] !== other[7]) note('path', `slot "${slot[0]}" region path ${JSON.stringify(slot[7])} vs ${JSON.stringify(other[7])}`);
    if (slot[8] !== other[8]) note('blend', `slot "${slot[0]}" blend ${JSON.stringify(slot[8])} vs ${JSON.stringify(other[8])}`);
    let dc = 0;
    for (let i = 2; i <= 5; i++) {
      const d = numDelta(slot[i] as Num, other[i] as Num);
      dc = d === 'nonfinite' ? Infinity : Math.max(dc, d);
    }
    if (dc > tolM) note('colour', `slot "${slot[0]}" colour Δ ${Number.isFinite(dc) ? fmt(dc) : 'non-finite'}`);
    const da = slot[6];
    const db = other[6];
    if ((da === null) !== (db === null)) note('dark', `slot "${slot[0]}" dark colour ${da === null ? 'absent' : 'present'} vs ${db === null ? 'absent' : 'present'}`);
    else if (da !== null && db !== null) {
      const d = Math.max(...[0, 1, 2].map((i) => {
        const x = numDelta(da[i], db[i]);
        return x === 'nonfinite' ? Infinity : x;
      }));
      if (d > tolM) note('dark', `slot "${slot[0]}" dark colour Δ ${Number.isFinite(d) ? fmt(d) : 'non-finite'}`);
    }
  }
  for (const slot of b.slots) if (!a.slots.some((x) => x[0] === slot[0])) note('roster', `slot "${slot[0]}" is in B's pose and not in A's`);

  if (a.drawOrder.join('\u0000') !== b.drawOrder.join('\u0000')) {
    const i = a.drawOrder.findIndex((s, k) => s !== b.drawOrder[k]);
    note('drawOrder', `draw order differs from position ${i}: A ${JSON.stringify(a.drawOrder[i] ?? null)} vs B ${JSON.stringify(b.drawOrder[i] ?? null)}`);
  }

  const geometry = (kind: 'attachment' | 'clip', la: Array<AttachmentRow | ClipRow>, lb: Array<AttachmentRow | ClipRow>, boneOf: (slot: string) => string | null): void => {
    const key = (x: AttachmentRow | ClipRow): string => `${x[0]}/${x[1]}`;
    const mb = new Map(lb.map((x) => [key(x), x]));
    for (const x of la) {
      const y = mb.get(key(x));
      if (y === undefined) {
        note(`${kind}Roster`, `${kind} "${key(x)}" is drawn in A and not in B`);
        continue;
      }
      if (x[2] !== y[2]) note(kind === 'attachment' ? 'kind' : 'clipEnd', `${kind} "${key(x)}" ${kind === 'attachment' ? 'kind' : 'end slot'} ${JSON.stringify(x[2])} vs ${JSON.stringify(y[2])}`);
      const bone = boneOf(x[0]);
      if (bone !== null && excluded.has(bone)) continue;
      const va = x[3];
      const vb = y[3];
      if (va.length !== vb.length) {
        note('vertexCount', `${kind} "${key(x)}" has ${va.length / 2} vertices in A and ${vb.length / 2} in B`);
        continue;
      }
      let worst = 0;
      let worstAt = -1;
      let nonFinite = false;
      for (let i = 0; i < va.length; i++) {
        const d = numDelta(va[i], vb[i]);
        if (d === 'nonfinite') {
          nonFinite = true;
          continue;
        }
        if (d > worst) {
          worst = d;
          worstAt = i >> 1;
        }
      }
      row.vertices += va.length / 2;
      if (nonFinite) note('nonFinite', `${kind} "${key(x)}" has a non-finite vertex in A or B`);
      if (worst > row.worstVertex.d) row.worstVertex = { d: worst, what: `${kind} "${key(x)}" vertex ${worstAt} at ${where}` };
      if (worst > tolXy) {
        row.verticesOver++;
        row.findings.push(`${where}: ${kind} "${key(x)}" vertex ${worstAt} moved ${fmt(worst)}`);
      }
    }
    const ma = new Set(la.map(key));
    for (const y of lb) if (!ma.has(key(y))) note(`${kind}Roster`, `${kind} "${key(y)}" is drawn in B and not in A`);
  };
  // A slot whose bone is excluded draws geometry the rule does not compare.
  geometry('attachment', a.attachments, b.attachments, (slot) => slotBones.get(slot) ?? null);
  geometry('clip', a.clips, b.clips, (slot) => slotBones.get(slot) ?? null);

  // The triangles drawn under a clip (issue #964): the rows in draw order, the clipper's return value and triangle list exact, vertices within --tol-xy and UVs within --tol-m.
  const ckey = (x: ClippedRow): string => `${x[0]}/${x[1]}`;
  if (a.clipped.map(ckey).join('\u0000') !== b.clipped.map(ckey).join('\u0000')) {
    note('clippedRoster', `the slots drawn under a clip are [${a.clipped.map(ckey).join(', ')}] in A and [${b.clipped.map(ckey).join(', ')}] in B`);
  } else {
    a.clipped.forEach((x, i) => {
      const y = b.clipped[i];
      const bone = slotBones.get(x[0]) ?? null;
      if (bone !== null && excluded.has(bone)) return;
      if (x[2] !== y[2]) note('clippedFlag', `clipped "${ckey(x)}": the clipper returned ${x[2]} in A and ${y[2]} in B`);
      if (x[5].join(',') !== y[5].join(',')) note('clippedTriangles', `clipped "${ckey(x)}": ${x[5].length / 3} triangle(s) in A and ${y[5].length / 3} in B${x[5].length === y[5].length ? ', indexed differently' : ''}`);
      if (x[3].length !== y[3].length || x[4].length !== y[4].length) {
        note('clippedCount', `clipped "${ckey(x)}" has ${x[3].length / 2} vertices in A and ${y[3].length / 2} in B`);
        return;
      }
      let worst = 0;
      let worstAt = -1;
      let worstUv = 0;
      for (let k = 0; k < x[3].length; k++) {
        const d = numDelta(x[3][k], y[3][k]);
        const du = numDelta(x[4][k], y[4][k]);
        if (d === 'nonfinite' || du === 'nonfinite') {
          note('nonFinite', `clipped "${ckey(x)}" has a non-finite number in A or B`);
          return;
        }
        if (d > worst) {
          worst = d;
          worstAt = k >> 1;
        }
        worstUv = Math.max(worstUv, du);
      }
      row.vertices += x[3].length / 2;
      if (worst > row.worstVertex.d) row.worstVertex = { d: worst, what: `clipped "${ckey(x)}" vertex ${worstAt} at ${where}` };
      if (worst > tolXy) {
        row.verticesOver++;
        row.findings.push(`${where}: clipped "${ckey(x)}" vertex ${worstAt} moved ${fmt(worst)}`);
      }
      if (worstUv > tolM) note('clippedUv', `clipped "${ckey(x)}" UV Δ ${fmt(worstUv)}`);
    });
  }

  // Each drawn attachment's page and page UVs (issue #967): matched by slot and attachment, as the attachments are — their order is the draw order's, which that block judges; the page and the count exact, every UV within --tol-m. Not excused by the ill-conditioned rule: a UV reads no bone.
  const ukey = (x: UvRow): string => `${x[0]}/${x[1]}`;
  const ub = new Map(b.uvs.map((x) => [ukey(x), x]));
  for (const x of a.uvs) {
    const y = ub.get(ukey(x));
    if (y === undefined) {
      note('uvRoster', `uvs "${ukey(x)}" is drawn in A and not in B`);
      continue;
    }
    if (x[2] !== y[2]) note('uvPage', `uvs "${ukey(x)}": page ${JSON.stringify(x[2])} in A and ${JSON.stringify(y[2])} in B`);
    if (x[3].length !== y[3].length) {
      note('uvCount', `uvs "${ukey(x)}" has ${x[3].length / 2} UV pair(s) in A and ${y[3].length / 2} in B`);
      continue;
    }
    let worst = 0;
    let worstAt = -1;
    let nonFinite = false;
    for (let k = 0; k < x[3].length; k++) {
      const d = numDelta(x[3][k], y[3][k]);
      if (d === 'nonfinite') {
        nonFinite = true;
        continue;
      }
      if (d > worst) {
        worst = d;
        worstAt = k;
      }
    }
    if (nonFinite) note('nonFinite', `uvs "${ukey(x)}" has a non-finite UV in A or B`);
    if (worst > tolM) note('uv', `uvs "${ukey(x)}" ${worstAt % 2 === 0 ? 'u' : 'v'} of pair ${worstAt >> 1} Δ ${fmt(worst)} — A ${x[3][worstAt]} B ${y[3][worstAt]}`);
  }
  const ua = new Set(a.uvs.map(ukey));
  for (const y of b.uvs) if (!ua.has(ukey(y))) note('uvRoster', `uvs "${ukey(y)}" is drawn in B and not in A`);
}

function compareEvents(row: OracleRowReport, t: Num, a: EventRow[], b: EventRow[], tolM: number): void {
  const where = at(row.name, t);
  const same =
    a.length === b.length &&
    a.every((e, i) => {
      const f = b[i];
      const dt = numDelta(e[1], f[1]);
      const df = numDelta(e[3], f[3]);
      return e[0] === f[0] && e[2] === f[2] && e[4] === f[4] && dt !== 'nonfinite' && dt <= tolM && df !== 'nonfinite' && df <= tolM;
    });
  if (same) return;
  row.mismatches.event = (row.mismatches.event ?? 0) + 1;
  const show = (l: EventRow[]): string => (l.length === 0 ? 'none' : l.map((e) => `${e[0]}@${e[1]}(${e[2]}, ${e[3]}, ${JSON.stringify(e[4])})`).join(' '));
  row.findings.push(`${where}: events fired A ${show(a)} vs B ${show(b)}`);
}

/** Compare two `pose-oracle/3` documents — see the header. */
export function compareDumps(a: OracleDocument, b: OracleDocument, tol: OracleTolerance): OracleComparison {
  // --- #966 raw: begin ---
  if (a.spec !== b.spec) throw new OracleInputError(`the two documents are ${a.spec} (A) and ${b.spec} (B): a --raw dump compares only with a --raw dump`);
  const raw = a.spec === ORACLE_RAW_SPEC;
  if (raw && (tol.xy !== 0 || tol.m !== 0)) throw new OracleInputError(`two --raw documents compare at tolerance 0 in ulps; --tol-xy ${tol.xy} / --tol-m ${tol.m} would widen it`);
  const saved = metric;
  metric = raw ? RAW_METRIC : GRID_METRIC;
  try {
    return compareWith(a, b, tol);
  } finally {
    metric = saved;
  }
}

function compareWith(a: OracleDocument, b: OracleDocument, tol: OracleTolerance): OracleComparison {
  // --- #966 raw: end ---
  const oa = JSON.stringify(a.options);
  const ob = JSON.stringify(b.options);
  if (oa !== ob) throw new OracleInputError(`the two documents were posed under different options: A ${oa} vs B ${ob}`);
  // Absence first: a block one side leaves out is a SKIP by name, and one
  // neither side carries is no comparison at all.
  const skipped: string[] = [];
  const carried = new Set<OracleBlock>();
  for (const block of ORACLE_BLOCKS) {
    // A sample block is compared only where both documents carry animations; otherwise the `animations` line speaks for it.
    if ((SAMPLE_BLOCKS as readonly string[]).includes(block) && (a.animations === null || b.animations === null)) continue;
    const na = blockOf(a, block) === null;
    const nb = blockOf(b, block) === null;
    if (na && nb) {
      throw new OracleInputError(`${block} is absent from both documents (A posed by ${a.dumper}, B by ${b.dumper}), so there is nothing to compare it with`);
    }
    if (!na && !nb) {
      carried.add(block);
      continue;
    }
    const side = na ? a : b;
    const why = side.absent?.find((x) => x[0] === block)?.[1];
    skipped.push(`${block}: not produced by ${side.dumper}${why === undefined ? '' : ` — ${why}`}`);
  }
  const has = (block: OracleBlock): boolean => carried.has(block);
  const tolXy = tol.xy * metric.scale;
  const tolM = tol.m * metric.scale;
  const aSlots = a.slots ?? [];
  const bSlots = b.slots ?? [];
  const slotBones = new Map((a.slots ?? bSlots).map((s) => [s[0], s[1]]));
  const bSlotBones = new Map(bSlots.map((s) => [s[0], s[1]]));
  const document: string[] = [
    ...(has('bones') ? listDiff('bones', a.bones ?? [], b.bones ?? []) : []),
    ...(has('slots') ? listDiff('slots', aSlots.map((s) => s[0]), bSlots.map((s) => s[0])) : []),
    ...(has('slots')
      ? aSlots.flatMap(([slot, bone]) => {
          const other = bSlotBones.get(slot);
          return other === undefined || other === bone ? [] : [`slot "${slot}" is on bone "${bone}" in A and "${other}" in B`];
        })
      : []),
    ...(has('skins') ? listDiff('skins', [...(a.skins ?? [])].sort(), [...(b.skins ?? [])].sort()) : []),
    ...(has('animations') ? listDiff('animations', (a.animations ?? []).map((x) => x.name).sort(), (b.animations ?? []).map((x) => x.name).sort()) : []),
    ...(has('constraints') ? listDiff('constraints', (a.constraints ?? []).map((c) => `${c[0]} ${c[1]}`), (b.constraints ?? []).map((c) => `${c[0]} ${c[1]}`)) : []),
  ];
  const byName = <T extends { name: string }>(l: T[]): Map<string, T> => new Map(l.map((x) => [x.name, x]));
  const aPhysics = has('physics') ? (a.physics ?? []) : [];
  const bPhysics = has('physics') ? (b.physics ?? []) : [];
  const pb = byName(bPhysics);
  for (const p of aPhysics) {
    const q = pb.get(p.name);
    if (q === undefined) document.push(`physics constraint "${p.name}" only in A`);
    else document.push(...paramDiffs('physics constraint', p.name, p as unknown as Record<string, unknown>, q as unknown as Record<string, unknown>, tolM));
  }
  for (const q of bPhysics) if (!aPhysics.some((p) => p.name === q.name)) document.push(`physics constraint "${q.name}" only in B`);
  const aPaths = has('paths') ? (a.paths ?? []) : [];
  const bPaths = has('paths') ? (b.paths ?? []) : [];
  const qb = byName(bPaths);
  for (const p of aPaths) {
    const q = qb.get(p.name);
    if (q === undefined) document.push(`path constraint "${p.name}" only in A`);
    else document.push(...paramDiffs('path constraint', p.name, p as unknown as Record<string, unknown>, q as unknown as Record<string, unknown>, tolM));
  }
  for (const q of bPaths) if (!aPaths.some((p) => p.name === q.name)) document.push(`path constraint "${q.name}" only in B`);
  const aPa = has('pathAttachments') ? (a.pathAttachments ?? []) : [];
  const bPa = has('pathAttachments') ? (b.pathAttachments ?? []) : [];
  const paKey = (x: OraclePathAttachmentRow): string => `${x.skin}/${x.slot}/${x.placeholder}`;
  const pab = new Map(bPa.map((x) => [paKey(x), x]));
  for (const p of aPa) {
    const q = pab.get(paKey(p));
    if (q === undefined) document.push(`path attachment "${paKey(p)}" only in A`);
    else document.push(...paramDiffs('path attachment', paKey(p), p as unknown as Record<string, unknown>, q as unknown as Record<string, unknown>, tolM));
  }
  for (const q of bPa) if (!pab.has(paKey(q)) || !aPa.some((p) => paKey(p) === paKey(q))) document.push(`path attachment "${paKey(q)}" only in B`);

  const rows: OracleRowReport[] = [];
  const setupCarry = new Set<PoseBlock>((['bones', 'slots', 'drawOrder', 'attachments', 'clips', 'clipped', 'uvs'] as const).filter((k) => has(`setup.${k}`)));
  if (setupCarry.size > 0) {
    const setupRow = newRow('(setup)');
    comparePose(setupRow, null, a.setup, b.setup, tolXy, tolM, slotBones, setupCarry);
    rows.push(setupRow);
  }
  const animB = byName(has('animations') ? (b.animations ?? []) : []);
  const sampleCarry = new Set<PoseBlock>((['bones', 'slots', 'drawOrder', 'attachments', 'clips', 'clipped', 'uvs'] as const).filter((k) => has(`animations.${k}`)));
  for (const anim of has('animations') ? (a.animations ?? []) : []) {
    const other = animB.get(anim.name);
    if (other === undefined) continue;
    const row = newRow(anim.name);
    const dd = numDelta(anim.duration, other.duration);
    if (dd === 'nonfinite' || dd > tolM) {
      row.mismatches.duration = 1;
      row.findings.push(`animation "${anim.name}": duration ${anim.duration} vs ${other.duration}`);
    }
    if (anim.samples.length !== other.samples.length) {
      row.mismatches.samples = 1;
      row.findings.push(`animation "${anim.name}": ${anim.samples.length} samples vs ${other.samples.length}`);
    }
    const count = Math.min(anim.samples.length, other.samples.length);
    for (let i = 0; i < count; i++) {
      const sa = anim.samples[i];
      const sb = other.samples[i];
      const dt = numDelta(sa.t, sb.t);
      if (dt === 'nonfinite' || dt > tolM) {
        row.mismatches.time = (row.mismatches.time ?? 0) + 1;
        row.findings.push(`animation "${anim.name}" sample ${i}: t=${sa.t} vs ${sb.t}`);
      }
      comparePose(row, sa.t, sa, sb, tolXy, tolM, slotBones, sampleCarry);
      if (has('animations.events')) compareEvents(row, sa.t, sa.events ?? [], sb.events ?? [], tolM);
    }
    rows.push(row);
  }
  const all = [...document, ...rows.flatMap((x) => x.findings)];
  return {
    raw: metric.raw,
    identical: all.length === 0,
    skipped,
    rows,
    document,
    first: all[0] ?? null,
    worstXy: Math.max(0, ...rows.map((x) => x.worstXy.d)) / metric.scale,
    worstM: Math.max(0, ...rows.map((x) => x.worstM.d)) / metric.scale,
    worstVertex: Math.max(0, ...rows.map((x) => x.worstVertex.d)) / metric.scale,
    excluded: rows.reduce((s, x) => s + x.excluded, 0),
    boneSamples: rows.reduce((s, x) => s + x.boneSamples, 0),
  };
}

/** The report `compare` prints, one line per row, then the verdict. */
export function comparisonLines(c: OracleComparison, listed = 5): string[] {
  const saved = metric;
  metric = c.raw === true ? RAW_METRIC : GRID_METRIC;
  try {
    return linesOf(c, listed);
  } finally {
    metric = saved;
  }
}

function linesOf(c: OracleComparison, listed: number): string[] {
  const out: string[] = [];
  for (const s of c.skipped) out.push(`  SKIP  ${s}`);
  for (const d of c.document.slice(0, listed * 4)) out.push(`  DOC   ${d}`);
  if (c.document.length > listed * 4) out.push(`  DOC   … ${c.document.length - listed * 4} more`);
  for (const row of c.rows) {
    const kinds = Object.entries(row.mismatches)
      .sort((x, y) => (x[0] < y[0] ? -1 : 1))
      .map(([k, v]) => `${k}×${v}`);
    out.push(
      `  ${row.findings.length === 0 ? 'SAME' : 'DIFF'}  ${row.name === '(setup)' ? '(setup)' : JSON.stringify(row.name)}: ` +
        `${row.samples} sample(s), ${row.boneSamples} bone-sample(s) compared (${row.exact} exact), ${row.over} over tolerance, ` +
        `${row.excluded} excluded (|det| < ${ORACLE_EPS_DET}); worst Δxy ${fmt(row.worstXy.d)}${row.worstXy.what ? ` (${row.worstXy.what})` : ''}, ` +
        `worst Δabcd ${fmt(row.worstM.d)}${row.worstM.what ? ` (${row.worstM.what})` : ''}; ${row.vertices} vertex-sample(s), ` +
        `${row.verticesOver} attachment-sample(s) over, worst Δvertex ${fmt(row.worstVertex.d)}${row.worstVertex.what ? ` (${row.worstVertex.what})` : ''}` +
        (kinds.length === 0 ? '' : `; mismatches ${kinds.join(' ')}`),
    );
    for (const f of row.findings.slice(0, listed)) out.push(`          ${f}`);
    if (row.findings.length > listed) out.push(`          … ${row.findings.length - listed} more`);
  }
  out.push(
    (c.identical
      ? `IDENTICAL — ${c.boneSamples} bone-sample(s) over ${c.rows.length} row(s), ${c.excluded} excluded as ill-conditioned`
      : `DIFF — first difference: ${c.first}`) +
      (c.skipped.length === 0 ? '' : `; ${c.skipped.length} block(s) SKIPPED, not compared: ${c.skipped.map((x) => x.slice(0, x.indexOf(':'))).join(', ')}`),
  );
  return out;
}

// --- #979 unposed: begin ---
/**
 * `unposed` — the bones a posed skin leaves unposed, compared to the bit with
 * their signs of zero (issue #979).
 *
 *   bun tools/pose_oracle.ts unposed <build dir> [--samples 9] [--phase grid|off|irr|dense]
 *                                    [--skin all|none|<name>] [--physics none|step] [--dt 1/60]
 *
 * `compare` never reads these rows: an unposed bone — inactive, or below an
 * inactive bone — holds a zero matrix, so the ill-conditioned rule excludes
 * it and its subtree at every sample, and a document spells `-0` as `0`.
 * Yet a constraint can write into such a bone (issue #968's private reading:
 * a world transform constraint wrote `worldX` 19.99999979 into one; a
 * two-bone ik wrote `-0` into `b` and `d`), and what it wrote is read on: a
 * later constraint taking the bone as its source reads `atan2` of those
 * zeros, where `+0` and `-0` are 0 and 180 degrees apart.
 *
 * So this command poses the build twice in memory — `skeleton.json` and
 * `skeleton.atlas` through spine-core (`dumpSkeleton`), `skeleton.model.json`
 * through the core (`coreDump`) — under the given options, with every number
 * the double as computed and its sign of zero kept (`signedNumber`; nothing
 * is written, so JSON's spelling never reaches it), and compares, at the
 * setup pose and every sample, every bone unposed in EITHER pose (`unposedOf`
 * over the rows' `active` and `parent` columns): `worldX`, `worldY`, `a`,
 * `b`, `c`, `d` by `Object.is`, so `0` against `-0` is a difference and a
 * value that is not finite (`null`) equals only another. It prints each
 * unposed bone's distinct rows on both sides with `-0` spelled, then
 * `IDENTICAL` (exit 0) or `DIFF` and every difference (exit 1). A build with
 * no unposed bone under the options is refused (exit 2): a comparison of
 * nothing is not a pass. A block the core leaves absent is refused by name.
 *
 * ⏳ **HISTORY, by measurement.** Under `--physics none` spine-core poses the
 * build a second time with every sample on a skeleton of its own
 * (`OracleOptions.fresh`). A bone-sample where the two runtime readings
 * disagree by `Object.is` is HISTORY: the runtime's value there depends on
 * the pass before (issue #979 — a constraint writing into an inactive bone),
 * so it is compared with nothing, never folded into IDENTICAL and never
 * counted as DIFF. Each constraint writing into an inactive bone above such
 * a bone prints `HISTORY <kind>/<name> on inactive <bone>: the runtime's value
 * depends on the previous pass — sequential vs fresh differ at N of M
 * samples`, and the verdict line counts them; where the runtime's two
 * readings agree and the core does not, it is DIFF (exit 1). Under
 * `--physics step` no fresh reading is taken — a stepped pass carries the
 * one before by design, and the core walks the same steps — and the header
 * line says so. There a differing bone-sample is HISTORY **by taint, not by
 * measurement**: when its bone is one a constraint writing into an inactive
 * bone reaches (`historyTaint` in src/core/constraints.ts, the walk the core's
 * leak refusal reads), it prints per writer as `HISTORY (by the writer's
 * taint; no fresh reading under the step) <kind>/<name> on inactive <bone>:
 * N of M samples (bones …)` and is counted apart on the verdict line; a
 * differing bone-sample outside the taint stays DIFF (exit 1).
 */
export function signedNumber(v: number): Num {
  return Number.isFinite(v) ? v : null;
}

/** A number as `unposed` prints it: `-0` spelled, `null` for a value that is not finite. */
export function signedText(v: Num): string {
  return v === null ? 'null' : Object.is(v, -0) ? '-0' : String(v);
}

/** The bones of one pose that nothing poses: inactive (`active` 0), or below such a bone — the rows are parent-before-child. */
export function unposedOf(rows: readonly BoneRow[]): Set<string> {
  const out = new Set<string>();
  for (const row of rows) if (row[7] === 0 || (row[8] !== null && out.has(row[8]))) out.add(row[0]);
  return out;
}

export interface UnposedComparison {
  /** Poses read: the setup and every sample of every animation. */
  poses: number;
  /** Unposed bone-samples compared, and how many agreed in all six numbers. */
  boneSamples: number;
  exact: number;
  /** Bone-samples where the runtime's two readings — sample after sample (A) and on a fresh skeleton (`fresh`) — disagree: HISTORY, neither IDENTICAL nor DIFF. */
  history: number;
  /** Per bone, the poses where the runtime's two readings disagree, by where. */
  historyByBone: Map<string, string[]>;
  /** With no fresh reading (the step): bone-samples that differ on a bone a writer into an inactive bone reaches (`taint`) — HISTORY by the writer's taint, not by measurement. */
  taintHistory: number;
  /** Per writer label, the bones and poses `taintHistory` counts. */
  taintByWriter: Map<string, { bones: Set<string>; poses: Set<string> }>;
  /** Per unposed bone, its distinct rows on each side: `bone: A [...] ×n | B [...] ×n`. */
  readings: string[];
  findings: string[];
}

/**
 * Two documents' unposed bones, compared by `Object.is` — see the section's
 * header. With `fresh` (the runtime's own second reading of A's input, each
 * sample on a fresh skeleton), a bone-sample where A and `fresh` disagree is
 * HISTORY: the runtime's value there depends on the pass before, so it is
 * compared with nothing and counted apart.
 */
export function compareUnposed(a: OracleDocument, b: OracleDocument, fresh: OracleDocument | null = null, taint: ReadonlyMap<string, string> | null = null): UnposedComparison {
  const out: UnposedComparison = { poses: 0, boneSamples: 0, exact: 0, history: 0, historyByBone: new Map(), taintHistory: 0, taintByWriter: new Map(), readings: [], findings: [] };
  const seen = new Map<string, { a: Map<string, number>; b: Map<string, number> }>();
  const rowText = (row: BoneRow): string => `[${row.slice(1, 7).map((v) => signedText(v as Num)).join(', ')}]`;
  const same = (x: BoneRow, y: BoneRow): boolean => [1, 2, 3, 4, 5, 6].every((i) => Object.is(x[i], y[i]));
  const pose = (where: string, pa: BoneRow[] | null, pb: BoneRow[] | null, pf: BoneRow[] | null): void => {
    if (pa === null || pb === null) throw new OracleInputError(`unposed: ${where}: the bones are absent from the ${pa === null ? 'first' : 'second'} document${pb === null ? ` — ${(b.absent ?? []).find((x) => x[0] === 'setup.bones' || x[0] === 'animations.bones')?.[1] ?? 'no reason given'}` : ''}`);
    out.poses++;
    const bRows = new Map(pb.map((r) => [r[0], r]));
    const fRows = new Map((pf ?? []).map((r) => [r[0], r]));
    const names = new Set([...unposedOf(pa), ...unposedOf(pb)]);
    for (const ra of pa) {
      if (!names.has(ra[0])) continue;
      const rb = bRows.get(ra[0]);
      if (rb === undefined) throw new OracleInputError(`unposed: ${where}: bone "${ra[0]}" is in the first document and not the second`);
      const rf = fRows.get(ra[0]);
      if (rf !== undefined && !same(ra, rf)) {
        out.history++;
        out.historyByBone.set(ra[0], [...(out.historyByBone.get(ra[0]) ?? []), where]);
        continue;
      }
      out.boneSamples++;
      const entry = seen.get(ra[0]) ?? { a: new Map<string, number>(), b: new Map<string, number>() };
      seen.set(ra[0], entry);
      const ta = rowText(ra);
      const tb = rowText(rb);
      entry.a.set(ta, (entry.a.get(ta) ?? 0) + 1);
      entry.b.set(tb, (entry.b.get(tb) ?? 0) + 1);
      if (same(ra, rb)) out.exact++;
      else if (fresh === null && taint !== null && taint.has(ra[0])) {
        // The step takes no fresh reading: a difference on a bone a writer into an inactive bone reaches is HISTORY by that writer's taint.
        out.boneSamples--;
        out.taintHistory++;
        const writer = taint.get(ra[0]) as string;
        const w = out.taintByWriter.get(writer) ?? { bones: new Set<string>(), poses: new Set<string>() };
        w.bones.add(ra[0]);
        w.poses.add(where);
        out.taintByWriter.set(writer, w);
      } else out.findings.push(`${where}: bone "${ra[0]}" (active ${ra[7]} / ${rb[7]}) A ${ta} B ${tb}`);
    }
  };
  pose('(setup)', a.setup.bones, b.setup.bones, fresh?.setup.bones ?? null);
  const bAnimations = new Map((b.animations ?? []).map((x) => [x.name, x]));
  const fAnimations = new Map((fresh?.animations ?? []).map((x) => [x.name, x]));
  for (const anim of a.animations ?? []) {
    const other = bAnimations.get(anim.name);
    if (other === undefined) throw new OracleInputError(`unposed: animation "${anim.name}" is in the first document and not the second`);
    anim.samples.forEach((s, i) => pose(`"${anim.name}" t=${signedText(s.t)}`, s.bones, other.samples[i]?.bones ?? null, fAnimations.get(anim.name)?.samples[i]?.bones ?? null));
  }
  const spell = (m: Map<string, number>): string => [...m].map(([t, n]) => `${t} ×${n}`).join(' ');
  for (const [name, e] of seen) out.readings.push(`bone "${name}": A ${spell(e.a)} | B ${spell(e.b)}`);
  return out;
}

/**
 * The HISTORY lines of a comparison: per constraint of `data` that writes
 * into an inactive bone at or above a HISTORY bone, how many poses it reaches
 * — `HISTORY <kind>/<name> on inactive <bone>: …`, one line each, in
 * constraint order; a HISTORY bone no such constraint is above is named as
 * such rather than attributed.
 */
export function historyLines(data: SkeletonData, c: UnposedComparison, activeAtSetup: ReadonlySet<string>): string[] {
  const parent = new Map(data.bones.map((bd) => [bd.name, bd.parent?.name ?? null]));
  const above = (bone: string, x: string): boolean => {
    for (let at: string | null = bone; at !== null; at = parent.get(at) ?? null) if (at === x) return true;
    return false;
  };
  const out: string[] = [];
  const claimed = new Set<string>();
  for (const cd of data.constraints) {
    const type = constraintType(cd, cd.name);
    const moved = cd instanceof IkConstraintData || cd instanceof TransformConstraintData || cd instanceof PathConstraintData ? cd.bones.map((x) => x.name) : cd instanceof PhysicsConstraintData ? [cd.bone.name] : [];
    for (const inactive of moved.filter((m) => !activeAtSetup.has(m))) {
      const reached = [...c.historyByBone].filter(([bone]) => above(bone, inactive));
      if (reached.length === 0) continue;
      const poses = new Set(reached.flatMap(([, w]) => w));
      for (const [bone] of reached) claimed.add(bone);
      out.push(`HISTORY ${type}/${cd.name} on inactive ${inactive}: the runtime's value depends on the previous pass — sequential vs fresh differ at ${poses.size} of ${c.poses} samples (bones ${reached.map(([bone]) => `"${bone}"`).join(', ')})`);
    }
  }
  for (const [bone, w] of c.historyByBone) if (!claimed.has(bone)) out.push(`HISTORY bone "${bone}", below no constraint writing into an inactive bone: sequential vs fresh differ at ${w.length} of ${c.poses} samples`);
  return out;
}

/** `unposed <build dir>`: spine-core twice (sequential and fresh) and the core, in memory, signed — the section's header. Returns the exit code. */
function unposedCommand(rest: readonly string[], print: (line: string) => void): number {
  const { positional, flags } = parseFlags(rest, ['--samples', '--phase', '--skin', '--physics', '--dt']);
  if (positional.length !== 1) throw new OracleInputError(`unposed: expected <build dir>, got ${positional.length} path(s)`);
  const input = resolveDumpInput(positional);
  const modelPath = join(positional[0], 'skeleton.model.json');
  if (!existsSync(modelPath)) throw new OracleInputError(`unposed: build directory ${positional[0]} has no skeleton.model.json — rigc build writes it beside skeleton.json`);
  const options: OracleOptions = { ...dumpOptions(flags), signed: true };
  const data = loadOracleData(readFileSync(input.skeleton, 'utf8'), readFileSync(input.atlas, 'utf8'), input.skeleton);
  let model: CompiledDocument;
  try {
    model = readModel(readFileSync(modelPath, 'utf8'), modelPath);
  } catch (err) {
    if (err instanceof CoreInputError) throw new OracleInputError(err.message);
    throw err;
  }
  const sequential = dumpSkeleton(data, options);
  // The fresh reading is taken under --physics none: under the step a pass carries the one before it by design, and the core walks the same steps.
  const fresh = options.physics === 'none' ? dumpSkeleton(data, { ...options, fresh: true }) : null;
  // Under the step, a differing bone-sample is HISTORY only by the taint of a writer into an inactive bone (`historyTaint` in src/core/constraints.ts) — the core's own walk, not a measurement.
  let taint: Map<string, string> | null = null;
  if (fresh === null) {
    let view: CompiledDocument;
    try {
      view = viewOf(model, options.skin);
    } catch (err) {
      if (err instanceof CoreInputError) throw new OracleInputError(`unposed: ${err.message}`);
      throw err;
    }
    taint = new Map([...historyTaint(view).tainted].map(([bone, w]) => [bone, `${w.kind}/${w.name} on inactive ${w.inactive}`]));
  }
  const c = compareUnposed(sequential, coreDump(model, options), fresh, taint);
  if (c.boneSamples + c.history + c.taintHistory === 0) throw new OracleInputError(`unposed: no bone of ${positional[0]} is unposed under --skin ${options.skin} in either pose — nothing to compare, which is not a pass`);
  print(`pose_oracle unposed A=spine-core B=core ${positional[0]} (skin ${options.skin}, ${options.phase}, ${options.samples} sample(s), physics ${options.physics}${fresh === null ? '; no fresh reading under the step, so a bone-sample is classed HISTORY only by the taint of a writer into an inactive bone, never by measurement' : ''})`);
  const activeAtSetup = new Set((sequential.setup.bones ?? []).filter((r) => r[7] === 1).map((r) => r[0]));
  for (const line of historyLines(data, c, activeAtSetup)) print(`  ${line}`);
  for (const [writer, w] of c.taintByWriter) print(`  HISTORY (by the writer's taint; no fresh reading under the step) ${writer}: ${w.poses.size} of ${c.poses} samples (bones ${[...w.bones].map((b) => `"${b}"`).join(', ')})`);
  for (const line of c.readings) print(`  ${line}`);
  for (const f of c.findings.slice(0, 20)) print(`  ${f}`);
  if (c.findings.length > 20) print(`  … ${c.findings.length - 20} more`);
  const history = `${c.history} HISTORY bone-sample(s) by measurement and ${c.taintHistory} by a writer's taint (the step), compared with nothing`;
  print(
    c.findings.length === 0
      ? `IDENTICAL — ${c.boneSamples} unposed bone-sample(s) over ${c.poses} pose(s), every number equal by Object.is (signed zeros included); ${history}`
      : `DIFF — ${c.boneSamples - c.exact} of ${c.boneSamples} unposed bone-sample(s) differ where the runtime's two readings agree; ${history}; first: ${c.findings[0]}`,
  );
  return c.findings.length === 0 ? 0 : 1;
}
// --- #979 unposed: end ---

// ---------------------------------------------------------------------------
// the command
// ---------------------------------------------------------------------------

const USAGE = [
  'usage:',
  '  bun tools/pose_oracle.ts dump <build dir> --out <json> [--samples 9] [--phase grid|off|irr|dense] [--skin all|none|<name>] [--physics none|step] [--dt 1/60] [--raw]',
  '  bun tools/pose_oracle.ts dump <skeleton.json> <atlas> --out <json> [same flags]',
  '  bun tools/pose_oracle.ts dump --core <skeleton.model.json> [--atlas <atlas>] --out <json> [same flags]',
  '  bun tools/pose_oracle.ts compare <a.json> <b.json> [--tol-xy 1e-6] [--tol-m 1e-6]',
  '  bun tools/pose_oracle.ts unposed <build dir> [--samples 9] [--phase grid|off|irr|dense] [--skin all|none|<name>] [--physics none|step] [--dt 1/60]',
].join('\n');

function parseFlags(args: readonly string[], known: readonly string[], switches: readonly string[] = []): { positional: string[]; flags: Map<string, string> } {
  const positional: string[] = [];
  const flags = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    // A switch takes no value (`--raw`, issue #966).
    if (switches.includes(arg)) {
      if (flags.has(arg)) throw new OracleInputError(`${arg} given twice`);
      flags.set(arg, 'true');
      continue;
    }
    if (!known.includes(arg)) throw new OracleInputError(`unknown flag ${arg}; this command takes ${[...known, ...switches].join(', ')}`);
    const value = args[i + 1];
    if (value === undefined || value.startsWith('--')) throw new OracleInputError(`${arg} needs a value`);
    if (flags.has(arg)) throw new OracleInputError(`${arg} given twice`);
    flags.set(arg, value);
    i++;
  }
  return { positional, flags };
}

function tolerance(flag: string, text: string | undefined): number {
  if (text === undefined) return ORACLE_DEFAULT_TOL;
  const v = Number(text);
  if (!Number.isFinite(v) || v < 0) throw new OracleInputError(`${flag} ${JSON.stringify(text)} is not a non-negative number`);
  return v;
}

/** Parse the dump flags into options, refusing every bad value by name. */
export function dumpOptions(flags: Map<string, string>): OracleOptions {
  const phase = flags.get('--phase') ?? 'grid';
  if (!(ORACLE_PHASES as readonly string[]).includes(phase)) throw new OracleInputError(`--phase ${JSON.stringify(phase)} is not one of ${ORACLE_PHASES.join(', ')}`);
  const samplesText = flags.get('--samples') ?? String(ORACLE_DEFAULT_SAMPLES);
  const samples = Number(samplesText);
  if (!Number.isInteger(samples) || samples < 1) throw new OracleInputError(`--samples ${JSON.stringify(samplesText)} is not a whole number of at least 1`);
  const physics = flags.get('--physics') ?? 'none';
  if (!(ORACLE_PHYSICS as readonly string[]).includes(physics)) throw new OracleInputError(`--physics ${JSON.stringify(physics)} is not one of ${ORACLE_PHYSICS.join(', ')}`);
  if (physics === 'none' && flags.has('--dt')) throw new OracleInputError('--dt is the stepping interval and --physics none steps nothing; pass --physics step or drop --dt');
  const dt = physics === 'step' ? parseDt(flags.get('--dt') ?? ORACLE_DEFAULT_DT) : null;
  const options: OracleOptions = { phase: phase as OraclePhase, samples, skin: flags.get('--skin') ?? 'all', physics: physics as OraclePhysics, dt };
  if (flags.has('--raw')) options.raw = true;
  return options;
}

/** The command; returns the exit code. */
export function oracleMain(argv: readonly string[], print: (line: string) => void = console.log, warn: (line: string) => void = console.error): number {
  const [command, ...rest] = argv;
  try {
    if (command === 'dump') {
      const { positional, flags } = parseFlags(rest, ['--out', '--samples', '--phase', '--skin', '--physics', '--dt', '--core', '--atlas'], ['--raw']);
      const out = flags.get('--out');
      if (out === undefined) throw new OracleInputError('dump: --out <json> is required');
      const options = dumpOptions(flags);
      const core = flags.get('--core');
      const atlasFlag = flags.get('--atlas');
      // The spine-core dump reads its atlas as the second path; --atlas is the core's, which reads no page layout off the model.
      if (atlasFlag !== undefined && core === undefined) throw new OracleInputError('--atlas is the core dump\'s (dump --core <model> --atlas <file>); the spine-core dump takes its atlas as the second path, <skeleton.json> <atlas>');
      if (atlasFlag !== undefined && !existsSync(atlasFlag)) throw new OracleInputError(`dump --core: --atlas ${atlasFlag}: no such file`);
      if (core !== undefined) {
        if (positional.length > 0) throw new OracleInputError(`dump --core takes the model document and no other path, got ${positional.join(' ')}`);
        if (!existsSync(core)) throw new OracleInputError(`dump --core: no such file ${core}`);
        let model: CompiledDocument;
        try {
          model = readModel(readFileSync(core, 'utf8'), core);
        } catch (err) {
          if (err instanceof CoreInputError) throw new OracleInputError(err.message);
          throw err;
        }
        const dump = coreDump(model, options, {}, atlasFlag === undefined ? null : uvSourceOf(readFileSync(atlasFlag, 'utf8'), readFileSync(core, 'utf8')));
        writeFileSync(out, dumpText(dump));
        print(
          `pose_oracle: the core posed ${core}: ${model.bones.length} bones, setup.bones ${dump.setup.bones === null ? 'ABSENT' : 'posed'}, ` +
            `${model.slots.length} slots, setup.slots ${dump.setup.slots === null ? 'ABSENT' : 'posed'}, ` +
            `setup.attachments ${dump.setup.attachments === null ? 'ABSENT' : `${dump.setup.attachments.length} posed`}, setup.clips ${dump.setup.clips === null ? 'ABSENT' : `${dump.setup.clips.length} posed`}, setup.clipped ${dump.setup.clipped === null ? 'ABSENT' : `${dump.setup.clipped.length} posed`}; ` +
            `${model.animations.length} animation(s) × ${options.samples} sample(s), animations.bones ${(dump.absent ?? []).some((x) => x[0] === 'animations.bones') ? 'ABSENT' : 'posed'}, ` +
            `animations.slots ${(dump.absent ?? []).some((x) => x[0] === 'animations.slots') ? 'ABSENT' : 'posed'}, ` +
            `setup.uvs ${dump.setup.uvs === null ? 'ABSENT' : `${dump.setup.uvs.length} posed`}, animations.uvs ${(dump.absent ?? []).some((x) => x[0] === 'animations.uvs') ? 'ABSENT' : 'posed'}; ` +
            `absent: ${(dump.absent ?? []).map((x) => x[0]).join(', ')} → ${out}`,
        );
        return 0;
      }
      const input = resolveDumpInput(positional);
      const data = loadOracleData(readFileSync(input.skeleton, 'utf8'), readFileSync(input.atlas, 'utf8'), input.skeleton);
      const dump = dumpSkeleton(data, options);
      writeFileSync(out, dumpText(dump));
      print(
        `pose_oracle: posed ${input.skeleton} (${options.phase}, ${options.samples} sample(s), skin ${options.skin}, physics ${options.physics}): ` +
          `${dump.bones.length} bones, ${dump.slots.length} slots, ${dump.animations.length} animation(s) → ${out}`,
      );
      return 0;
    }
    if (command === 'unposed') return unposedCommand(rest, print);
    if (command === 'compare') {
      const { positional, flags } = parseFlags(rest, ['--tol-xy', '--tol-m']);
      if (positional.length !== 2) throw new OracleInputError(`compare: expected <a.json> <b.json>, got ${positional.length} path(s)`);
      const read = (path: string): OracleDocument => {
        if (!existsSync(path)) throw new OracleInputError(`compare: no such file ${path}`);
        let value: unknown;
        try {
          value = JSON.parse(readFileSync(path, 'utf8'));
        } catch (err) {
          throw new OracleInputError(`${path}: not JSON — ${(err as Error).message}`);
        }
        return asOracleDocument(value, path);
      };
      const a = read(positional[0]);
      const b = read(positional[1]);
      // Two --raw documents compare at tolerance 0 (issue #966): a tolerance flag on them is refused by compareDumps, and none given means 0, not the grid's default.
      const rawPair = a.spec === ORACLE_RAW_SPEC && b.spec === ORACLE_RAW_SPEC;
      const c = compareDumps(a, b, rawPair && !flags.has('--tol-xy') && !flags.has('--tol-m') ? { xy: 0, m: 0 } : { xy: tolerance('--tol-xy', flags.get('--tol-xy')), m: tolerance('--tol-m', flags.get('--tol-m')) });
      print(`pose_oracle compare A=${positional[0]} B=${positional[1]}`);
      for (const line of comparisonLines(c)) print(line);
      return c.identical ? 0 : 1;
    }
    throw new OracleInputError(command === undefined ? 'no command' : `unknown command ${JSON.stringify(command)}`);
  } catch (err) {
    if (err instanceof OracleInputError) {
      warn(`pose_oracle: ${err.message}`);
      if (err.message.startsWith('no command') || err.message.startsWith('unknown command')) warn(USAGE);
      return 2;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// A10's walk, both dumpers (issue #1025, cut 4c-5a)
// ---------------------------------------------------------------------------
//
// Not the document above: `A10_NO_NAN_AFTER_STEPPING` does not sample a grid,
// it walks. With no skin set, the setup pose is posed and every physics state
// reset (`setupPose()`, `update(0)`, `updateWorldTransform(Physics.reset)`);
// then each animation, on a fresh skeleton posed the same way, is set on a
// LOOPING track and stepped `STEP_FRAMES` times by `max(duration, 1) /
// STEP_FRAMES` — `AnimationState.update(step)`, `apply`, `Skeleton.update
// (step)`, `updateWorldTransform(Physics.update)` — one pose read after each.
// A pose is every bone's world transform, every shown region's and mesh's
// world vertices in draw order, every slot's light and dark colour, and the
// track's two times. Every number is the double itself, a non-finite one
// included: the walk is how A10 finds one, so a dumper that rounded or
// refused it would hide the subject. `tools/core_gate.ts --walk` compares
// the two documents over a corpus, and the core suite's `CO25` over the
// tree's rows and a seeded population.

/** One pose of A10's walk: the track's times, then bones `[name, a, b, c, d, worldX, worldY]`, drawn `[slot, attachment, vertices]` and slots `[name, r, g, b, a, dark]`. */
export interface WalkDocumentPose {
  track: number;
  time: number;
  bones: Array<[string, number, number, number, number, number, number]>;
  drawn: Array<[string, string, number[]]>;
  slots: Array<[string, number, number, number, number, [number, number, number] | null]>;
}

/** A10's walk over one skeleton: the setup pose, then each animation's walk. */
export interface WalkDocument {
  setup: WalkDocumentPose;
  animations: Array<{ name: string; duration: number; step: number; poses: WalkDocumentPose[] }>;
  /**
   * The core's document only: the bones and slots whose numbers are HISTORY
   * (`walkHistory` in src/core/walk.ts) — each bone with the constraint
   * writing into an inactive bone that reaches it — compared with nothing.
   */
  history?: { bones: Record<string, string>; slots: Record<string, string> };
}

/** One spine-core skeleton as it stands posed, in the walk's shape. */
function spineWalkPose(skeleton: Skeleton, track: number, time: number): WalkDocumentPose {
  const drawn: WalkDocumentPose['drawn'] = [];
  for (const slot of skeleton.drawOrder.appliedPose) {
    const att = slot.appliedPose.attachment;
    if (!(att instanceof MeshAttachment) && !(att instanceof RegionAttachment)) continue;
    const world = new Array<number>(att instanceof MeshAttachment ? att.worldVerticesLength : 8).fill(0);
    if (att instanceof MeshAttachment) att.computeWorldVertices(skeleton, slot, 0, att.worldVerticesLength, world, 0, 2);
    else att.computeWorldVertices(slot, att.getOffsets(slot.appliedPose), world, 0, 2);
    drawn.push([slot.data.name, att.name, world]);
  }
  return {
    track,
    time,
    bones: skeleton.bones.map((b) => {
      const p = b.appliedPose;
      return [b.data.name, p.a, p.b, p.c, p.d, p.worldX, p.worldY];
    }),
    drawn,
    slots: skeleton.slots.map((sl) => {
      const c = sl.appliedPose.color;
      const d = sl.appliedPose.darkColor;
      return [sl.data.name, c.r, c.g, c.b, c.a, d === null ? null : [d.r, d.g, d.b]];
    }),
  };
}

/** A10's walk as spine-core 4.3.13 takes it (the section's header). */
export function spineWalkDocument(data: SkeletonData, frames: number = STEP_FRAMES): WalkDocument {
  const rest = new Skeleton(data);
  rest.setupPose();
  rest.update(0);
  rest.updateWorldTransform(Physics.reset);
  const animations: WalkDocument['animations'] = [];
  for (const anim of data.animations) {
    const step = Math.max(anim.duration, 1) / frames;
    const skeleton = new Skeleton(data);
    const state = new AnimationState(new AnimationStateData(data));
    const entry = state.setAnimation(0, anim.name, true);
    skeleton.setupPose();
    skeleton.update(0);
    skeleton.updateWorldTransform(Physics.reset);
    const poses: WalkDocumentPose[] = [];
    for (let i = 0; i < frames; i++) {
      state.update(step);
      state.apply(skeleton);
      skeleton.update(step);
      skeleton.updateWorldTransform(Physics.update);
      poses.push(spineWalkPose(skeleton, entry.trackTime, entry.getAnimationTime()));
    }
    animations.push({ name: anim.name, duration: anim.duration, step, poses });
  }
  return { setup: spineWalkPose(rest, 0, 0), animations };
}

/** One core walk pose in the walk's shape. */
function coreWalkPose(p: WalkPose): WalkDocumentPose {
  const n = (v: number | null): number => (v === null ? Number.NaN : v);
  return {
    track: p.trackTime,
    time: p.animationTime,
    bones: p.bones.map((b) => [b.name, b.a, b.b, b.c, b.d, b.worldX, b.worldY]),
    drawn: p.drawn.map((d) => [d.slot, d.attachment, d.vertices]),
    slots: p.slots.map((r) => [r[0], n(r[2]), n(r[3]), n(r[4]), n(r[5]), r[6] === null ? null : [n(r[6][0]), n(r[6][1]), n(r[6][2])]]),
  };
}

/**
 * A10's walk as rigc's core takes it (`src/core/walk.ts`), the animations in
 * the file's order, over the document with no skin set (`noSkinView`, issue
 * #1051 — or `view`, a control's plant). A construct the core leaves out
 * refuses by name (`CoreInputError`); a non-finite value does not.
 */
export function coreWalkDocument(model: CompiledDocument, frames: number = STEP_FRAMES, plant: TimelinePlant = {}, walkPlant: WalkPlant = {}, view: (model: CompiledDocument) => CompiledDocument = noSkinView): WalkDocument {
  const doc = view(model);
  // The file's order (`fileAnimationOrder`), which is spine-core's: the document's own is the model's.
  const animations: WalkDocument['animations'] = fileAnimationOrder(model).flatMap((name) => doc.animations.filter((a) => a.name === name)).map((anim) => {
    const step = Math.max(anim.timelines.duration, 1) / frames;
    const poses = poseLoopingWalk(doc, anim.name, new Array<number>(frames).fill(step), plant, walkPlant).slice(1).map(coreWalkPose);
    return { name: anim.name, duration: anim.timelines.duration, step, poses };
  });
  const history = walkHistory(doc);
  return { setup: coreWalkPose(poseWalkSetup(doc, plant, walkPlant)), animations, history: { bones: Object.fromEntries(history.bones), slots: Object.fromEntries(history.slots) } };
}

/** Two walks of one skeleton, compared number by number at tolerance 0. */
export interface WalkComparison {
  /** Poses compared — the setup and every step of every animation both walk. */
  poses: number;
  /** Numbers compared (times, bone terms, vertices, colour channels). */
  numbers: number;
  /** Poses equal in every number (`Object.is`: a NaN equals a NaN, and −0 is not 0). */
  exact: number;
  /** Steps whose track time had reached the duration — the wrap — on side A. */
  wrapped: number;
  /** Poses holding a number that is not finite, on side A. */
  nonFinite: number;
  /** Each animation the walk wrapped at least once, on side A. */
  wrappedAnimations: number;
  /** The first difference, or `null`. */
  first: string | null;
  /** Numbers on a HISTORY bone or slot (`WalkDocument.history`) that differ — compared with nothing — and of them those that differ only in the sign of zero. */
  historyNumbers: number;
  historySignOnly: number;
  /** The HISTORY bones such a number sat on, each with its writer. */
  historyBones: Map<string, string>;
}

/** Compare two walk documents of one skeleton (`spineWalkDocument` as A, `coreWalkDocument` as B). */
export function compareWalkDocuments(a: WalkDocument, b: WalkDocument): WalkComparison {
  const out: WalkComparison = { poses: 0, numbers: 0, exact: 0, wrapped: 0, nonFinite: 0, wrappedAnimations: 0, first: null, historyNumbers: 0, historySignOnly: 0, historyBones: new Map() };
  const note = (why: string): void => {
    out.first ??= why;
  };
  const historyBones = new Map(Object.entries(b.history?.bones ?? {}));
  const historySlots = new Map(Object.entries(b.history?.slots ?? {}));
  /** Every number of a pose, each with the HISTORY bone it sits on (`null` for a number the walk vouches for). */
  const numbersOf = (p: WalkDocumentPose): Array<[number, string | null]> => [
    [p.track, null], [p.time, null],
    ...p.bones.flatMap((r) => (r.slice(1) as number[]).map((v): [number, string | null] => [v, historyBones.has(r[0]) ? r[0] : null])),
    ...p.drawn.flatMap((r) => r[2].map((v): [number, string | null] => [v, historySlots.get(r[0]) ?? null])),
    ...p.slots.flatMap((r) => [r[1], r[2], r[3], r[4], ...(r[5] ?? [])].map((v): [number, string | null] => [v, null])),
  ];
  const shapeOf = (p: WalkDocumentPose): string => JSON.stringify([p.bones.map((r) => r[0]), p.drawn.map((r) => [r[0], r[1], r[2].length]), p.slots.map((r) => [r[0], r[5] === null])]);
  const pose = (where: string, x: WalkDocumentPose, y: WalkDocumentPose | undefined): void => {
    out.poses++;
    const xs = numbersOf(x);
    out.numbers += xs.length;
    if (!xs.every(([v]) => Number.isFinite(v))) out.nonFinite++;
    if (y === undefined) return note(`${where}: only in A`);
    if (shapeOf(x) !== shapeOf(y)) return note(`${where}: the bones, drawn attachments or slots differ — A ${shapeOf(x).slice(0, 200)}, B ${shapeOf(y).slice(0, 200)}`);
    const ys = numbersOf(y);
    let k = -1;
    let historical = false;
    xs.forEach(([v, owner], i) => {
      const w = ys[i][0];
      if (Object.is(v, w)) return;
      if (owner === null) {
        if (k === -1) k = i;
        return;
      }
      historical = true;
      out.historyNumbers++;
      if (v === w) out.historySignOnly++;
      out.historyBones.set(owner, historyBones.get(owner) ?? owner);
    });
    if (k === -1 && !historical) out.exact++;
    else if (k !== -1) note(`${where}: number ${k} of the pose — A ${String(xs[k][0])}, B ${String(ys[k][0])} (track A ${x.track}, B ${y.track}; time A ${x.time}, B ${y.time})`);
  };
  pose('the setup pose', a.setup, b.setup);
  if (JSON.stringify(a.animations.map((x) => x.name)) !== JSON.stringify(b.animations.map((x) => x.name))) note(`the animations — A [${a.animations.map((x) => x.name).join(', ')}], B [${b.animations.map((x) => x.name).join(', ')}]`);
  for (const x of a.animations) {
    const y = b.animations.find((z) => z.name === x.name);
    if (y !== undefined && (!Object.is(x.duration, y.duration) || !Object.is(x.step, y.step))) note(`animation ${JSON.stringify(x.name)}: duration A ${x.duration}, B ${y.duration}`);
    let wrapped = false;
    x.poses.forEach((p, i) => {
      if (p.track >= x.duration) {
        out.wrapped++;
        wrapped = true;
      }
      pose(`animation ${JSON.stringify(x.name)} step ${i + 1}`, p, y?.poses[i]);
    });
    if (wrapped) out.wrappedAnimations++;
  }
  return out;
}

if (import.meta.main) process.exit(oracleMain(process.argv.slice(2)));
