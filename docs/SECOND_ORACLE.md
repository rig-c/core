# The second oracle — rigc's own core, admitted construct by construct against spine-core

**Status: shipped — a record, as of 2026-10-04, of a design that has landed.** Started
2026-09-29 by the owner's call (issue #380, the start gate of its 2026-09-17 comment);
steps 0a–3 landed by 2026-10-01 and shipped in 1.6.1 (1.6.0 was tagged and never
served, #1003); step 4 landed 2026-10-01 to 10-02 over 1.7.0–1.9.3 and shipped as
**2.0.0** (2026-10-02, #1071), which closed #380 (§6). #380 carries the history of the
argument, including the two shapes it rejected on 2026-09-04 and what has become of
each since (§7); [ROADMAP.md](../ROADMAP.md) *What changes the frame* is the frame —
*the milestone is not the second backend, it is the second oracle.*

---

## 1. The sentence

A posing core of rigc's own — `src/core/`, pure, importing nothing from
`@esotericsoftware/spine-core` — that reads rigc's own **compiled model** and poses it.
That model exists since 2026-09-29: step 0a measured that `compile.ts` built the Spine
objects directly — 14 `Spine*` types, 111 references, the 4.3 spellings applied in the
constructors, and 24 sites that read those objects back
([COMPILED_MODEL.md](COMPILED_MODEL.md), §1.4 and *The finding*) — and step 1 changed
how `compile` builds, in six cuts, each landing under byte identity of every Spine file
on every corpus (§6). `build` now writes `skeleton.model.json` beside the Spine pair
(`rigc-compiled/1` at step 1; `/3` since 1.9.0, #1037), the Spine emitter (`src/emit_spine.ts`) is the one writer of
Spine data, and `compile.ts` names no Spine shape, held by `MD02`/`MD03`. The core
poses that document — since step 2 a description of `src/core/` rather than a target,
shipped in 1.6.1 (§5, §6): bones with their inherit modes, slots and colours, every attachment kind's
world vertices, deform, draw order, clipping, events, and the five constraint kinds; such
that for **every spec in every corpus**, the pose our core produces from the compiled
model equals the pose spine-core produces from the Spine backend's emission of the same
spec, at the oracle's reading of *identical* (§4). The Spine backend's output does not
change. spine-core stays the oracle — the round trip wherever it is installed — and is
in addition the yardstick our core and, since 2.0.0, rigc's own validator are measured
against (§7).

## 2. Two readings of "our own core", and the one taken

| | reads | what it is |
| --- | --- | --- |
| **R1** | Spine 4.3 skeleton data | a runtime for Spine data written by someone other than Esoteric Software |
| **R2** | rigc's compiled model | a runtime for rigc's own format; Spine data reaches it through `ingest` and the compiler |

**R2 is taken.** The reasons, in order of weight:

1. It is the shape #380 settled on 2026-09-04 (*two backends, one core; the licence sits
   on exactly one of them*), with the rejected shapes written down. Nothing measured
   since has contradicted it.
2. It needs no position on third-party playback of Spine data. Whether such a player is
   something this project should be is a licence-posture question; the tree cannot
   answer it and the owner has not taken it. R2 never asks it: the only thing that plays
   Spine data here is spine-core.
3. The instrument is the same either way (§4), so nothing built under R2 is lost if R1 is
   ever wanted.
4. R1 remains reachable from R2 through `ingest`: the 1.0 exam measured `ingest → build`
   pose-identical to the editor's own export on production rigs
   ([ROADMAP.md](../ROADMAP.md), *1.0 — claimed*), so a Spine file our core needs to
   pose is a spec first.

What R2 costs, stated: a corpus row enters through `ingest`, so an ingest `BLOCK` or
`LOSS` on that row is a **HOLE** for the constructs it would have exercised, named per row,
never a pass.

## 3. What the core must not be

**Not a port of spine-core.** The licence shipped with the package this repository pins
says, in its first paragraph, that *"creating derivative works of the Spine Runtimes"* is
permitted on the condition that *"each user of the Products must obtain their own Spine
Editor license"* (`node_modules/@esotericsoftware/spine-core/LICENSE`, dated April 5,
2025). A port is a derivative work, so a ported core would move nothing: it would carry
the same licence as the link it replaced, and a copy of an oracle is not a second oracle.

The working rule, until the owner states another: the core is written from the compiled
model's own semantics and from **measured behaviour**. A squad writing it may run
spine-core and read what it outputs, may read the public format and runtime
documentation, and may read this repository's own [SPEC_COVERAGE.md](SPEC_COVERAGE.md);
it does not open spine-core's source to write from. The brief says so, and two controls
hold what a machine can hold of it: `CO04`, that `src/core/` imports nothing from
spine-core and nothing impure, and `CO23`, that the core cites no runtime source file,
that no comment under `src/` claims a routine copies a runtime routine, and that no core
string names a runtime export (#1023, #1062). Identifiers are not held, and that is
measured rather than omitted (#1011): the ones spelling a runtime export are rigc's own
seam types or the format's and the language's words (`bone`, `slot`, `mix`, `get`,
`length`), which no scan tells apart without an exception table — so that half of the
rule stays the brief's.

The mathematics of a 2D bone hierarchy, a Bézier curve, an IK solver or a path follower
belongs to nobody; what the rule protects is that the *text* is ours.

One place in the tree already sits on this line: the routines that described
themselves as transcriptions now call the core's measured form (#1023, every emitted
byte unchanged), including `src/transform.ts` calling `worldTransforms` in
`src/core/world.ts`. No transcribed text remains on this line.

Since 2026-09-29 (#929): the part of this question the core depended on was closed by
measurement — posed with `transform.ts`'s evaluator, the core read 1 of the 12
unconstrained recipes identical to spine-core, so `src/core/` poses with an evaluator of
its own, written from measurement, and imports nothing from `transform.ts` (`CO04`
refuses it). #929 left `transform.ts` untouched, its comment included. #1023 later
replaced the transcription with the core's measured form, every emitted byte unchanged.

## 4. The oracle — the equivalence gate

The instrument began as a prototype — the 1.0 exam's pose oracle in private scratch,
which read **IDENTICAL** on 14 of 14 graded production rigs after #803 and #804 — and
step 0b (#911) promoted it into `tools/pose_oracle.ts` with what its *Not yet* list
named. That file holds both dumpers (`dump` through `spine-core` 4.3.13, `dump --core`
through `src/core/`) and `compare`; `tools/core_gate.ts` runs the pair over a corpus,
judges each block of each row on its own, and prints a census of what the corpus
reaches.

**Definition.** For a spec S, let B be the Spine backend's build of S and M the compiled
model of S.

- P_spine(B): spine-core's pose dump of B — the setup pose and N samples per animation
  in the oracle's phases (`grid`, `off`, `irr`, `dense`): every bone's world
  `x y a b c d`, active flag and parent; every slot's attachment name, colour and region
  path; **and, added at promotion and since:** the slot's blend mode (#947), every drawn
  attachment's world vertices, the draw order, the clipping polygons and the triangles
  drawn under them (#971), each drawn attachment's atlas page and page UVs (#974),
  events fired, and physics stepped from `Physics.reset` at a fixed `dt` on rigs that
  have it.
- P_ours(M): the same dump, same JSON shape, from our core on M.

**The gate: P_ours(M) ≡ P_spine(B).** Rosters and names exact, and the numbers read
two ways. **On the grid**, equal at the oracle's rounding (six decimals): the reading
every construct of step 2 was admitted under (§5). **Under `--raw`** (#976), full
doubles at tolerance 0 with the worst difference printed in ulps: the reading step 3
switched the consumers under, because they read full doubles; it reads GREEN on every
row of both corpora since #981, and the core suite holds it on every built row
(`CR06`). The renders: `tools/render_hashes.ts` (#972) measured two runs on one machine
byte-identical (19 rows, 2,827 files), and Linux CI's encoder wrote other PNG bytes for
the same frames, so its tracked base holds decoded pixels and `RH05` holds those across
platforms; posed through the core against through spine-core, the 19 rows read
IDENTICAL on all 2,827 files, bytes and pixels (#980). A sample where a bone's
|det| < ε in either runtime is ill-conditioned — reported, not compared, with its
descendants (the rule the exam's calibration derived).

**A row is judged only on constructs already admitted** (§5). A row that uses a construct
not yet admitted prints `SKIP` with the construct named, and counts as not run. A
construct no row in any corpus uses prints a `HOLE` — the gate has nothing to hold it
to, and that is the finding.

**Positive control.** Every admitted construct has a planted difference in our core
(one wrong sign, one swapped mode) that must turn the gate red on the rows using it. A
gate nobody has seen fail is not a gate.

**Three classes the definition did not foresee**, each added when a measurement met it:

- **Per skin** (#973). `--skin all` is the instrument's view, not a state a runtime is
  ever in, so a row declaring several skins is also judged once per skin, both dumpers
  under `--skin <name>`. No public row declares several (`core_gate` prints a
  `per skin` HOLE); on the private corpus it is 48 skin runs over five rigs.
- **History** (#983). Where a constraint writes into a bone the posed skin leaves
  inactive, the runtime reads values its previous pass left, and its sequential and
  fresh-skeleton readings disagree. `pose_oracle unposed` classes such a bone-sample
  HISTORY by measurement — never IDENTICAL, never DIFF — and where such a value reaches a
  posed bone the core refuses the pose by name (`CC15`) and `render` poses through
  spine-core instead where the runtime is installed, and refuses by name where it is
  not (the published package since 2.0.0). 0 of 19 public rows are refused; one private rig carries HISTORY
  rows on 18 of its 19 skins, and no refusal fires on any private skin.
- **Unposed bones** (#980, #983). A bone the posed skin leaves unposed — inactive, or
  below an inactive bone, which the runtime may still flag active — holds no pose in
  either runtime: its zero matrix is ill-conditioned, so `compare` never reads it (and
  JSON spells `-0` as `0`, which is why `unposed` exists), and the render seam snapshots
  it as zero in both posers (`RC07`).

**Populations**, every one read by machine and none by eye:

| corpus | rows | how it enters |
| --- | --- | --- |
| the selftest's core suite | hand-written probe documents and seeded random rigs, every population read `--raw` since #1001; not the four rigs `fixtures/public.ts` generates | directly |
| the public example corpus (`examples/`, spine-runtimes branch `4.3`) | 12 exports | `ingest` |
| this repository's gallery | 7 rigs (with the 12 exports, the 19 rows `core_gate` runs); the ladder's bench candidates are not among them | directly |
| a private production corpus | 14 production rigs, 48 per-skin runs; steps 1, 2, 3 and 4 were each read on it | `ingest`, under `core_gate --recipes`; figures only, no content |

The larger private population this page first named — the 1.0 exam's 67 rigs' 4.3
exports and the 42 byte-round-trip rigs — has not been run through the gate; it remains
the intent, not a reading.

## 5. Admission, construct by construct

The construct list is not written here by hand: it is the Spine 4.3 parser surface
[SPEC_COVERAGE.md](SPEC_COVERAGE.md) documents, intersected with what the compiler emits
([AUTHORING.md](AUTHORING.md)). The order below is the runtime's own update order,
because a construct can only be measured once everything it depends on is admitted:

1. bones and the five inherit modes; the world-transform composition
2. slots, colours (`rgba`, `rgb`, `alpha`, two-colour tint), blend modes, attachment
   swaps, skins and skin-required members
3. attachments and their world vertices: region, mesh (unweighted, weighted), linked
   mesh, sequence, bounding box, path, point, clipping
4. timelines and curves: bone (rotate, translate and its split axes, scale and its
   split axes, shear and its split axes, inherit), slot (attachment, the colour
   families), deform, draw order, events; linear, stepped and Bézier curves; the mixing
   `render` and `check` actually call — anything beyond that is a named absence, not
   an implementation
5. constraints in the file's declaration order — no sort; this item said "update-cache
   order" until #951 measured that the runtime sorts nothing on these documents — ik,
   transform, path, slider, and physics as two constructs: under `Physics.none` a
   physics constraint applies nothing (#953), and the fixed-`dt` step from `reset` is
   its own (#963) — and their timelines
6. clipping applied to the draw

A construct is **admitted** when all three hold: its planted difference turns the gate
red; the gate reads identical on every corpus row that uses it; and at least one row
uses it. Until every construct a consumer needs is admitted, that consumer keeps posing
through spine-core (§6, step 3).

**Where admission stands.** Every construct listed is admitted, and the core's own list
of what it leaves out (`NOT_ADMITTED` in `src/core/index.ts`) is empty:

| construct | PR | what decided it, as the PR states it |
| --- | --- | --- |
| 1 bones, five inherit modes | #929 | an evaluator of the core's own: exact on 12 of 12 unconstrained recipes; either measured difference alone, 0 of 12 |
| 2 slots, colours, skins | #934, #947 (blend), #973 (per skin) | 18 of 19 rows, 1 SKIP by construct (#934); 36 corpus slots stating a blend (#947); 48 of 48 private skin runs (#973) |
| 3 attachments' world vertices | #945 (on #939's atlas rectangle) | the region rule exact on 6,000 of 6,000 hand-written regions |
| 4 timelines and curves | #943, #962 | the Bézier as a ten-piece recurrence, 0 misses on 18,430 corpus samples (#943); deform, sequence, draw order and events, the deform curve's far end fixed over 1,134 curve points (#962) |
| 5 constraints | #951, #954, #953, #963 | the declaration order (#951); path, 32 hand-written and 400 random orders (#954); physics unstepped, 400 of 400, 462 of 462 and 240 of 240 (#953); stepped, 400 of 400 random rigs (#963) |
| 6 clipping applied to the draw | #971, #982 | strictly convex clips, 2,641 of 2,641 (#971); concave and inverse clips through the core's own decomposition, 0 differing pixels on every probe (#982) |

Two kinds in item 3 have no world-vertex reading: a bounding box, whose vertices the
oracle's dump does not write, and a point, which rigc does not emit (#934).

**The live track** ([#1276](https://github.com/rig-c/core/issues/1276)) is admitted
on the same terms, as a construct of the walk rather than of the skeleton:
`openTrack` in `src/core/track.ts` opens the raw entry's walk and steps it one `dt` at
a time, as a player's frame loop does. It adds no pose math — the batch walk's body is
the same function behind a held context — so it is held to the batch walk rather than
to a second dump: before and after that split, 956 batch walks over the nineteen
public rows' 54 animations (157,771 poses) read the same bits, and the core suite's
`CO46` holds the track to `poseRawAnimation` (held) and to `poseLoopingWalk` (looped)
pose for pose. What the looping walk never carried was measured against spine-core
4.3.13's `AnimationState` listener: the events a looping track fires across the wrap —
the keys after the previous time, then the keys from −1 to the new time, a key at
exactly the duration on the wrap step alone — matched on 229,656 of 229,656 steps
(52,880 events, 24,587 completes; 306 animations, six of them public rows'), and the
reading that fires nothing across the wrap read 12,956 steps off (`CO47`); the clipped
rows it cuts equal the raw entry's at the same animation time on 4,009 of 4,009 poses
of the public row that clips (`CO48`).

**The live track's adjustment** ([#1336](https://github.com/rig-c/core/issues/1336))
is held to spine-core directly, because it is a player's input rather than a
construct the batch walk already carries: `openTrack`'s `adjust` writes the bone
locals after the animation's timelines and before the world transforms, the
constraints and the physics step, and spine-core's player writes `Bone.pose`
between `AnimationState.apply` and `updateWorldTransform(Physics.update)`. On
gallery/look — `scaleY` written on `head`, which carries the deformed head mesh,
every face bone, and the physics-driven `ahoge_whip` two bones below it — 12 walks
(three animations, looping and held, both resets, 150 mixed steps each) read 1,812
of 1,812 poses equal in every bone's world transform and every drawn vertex at
tolerance 0, 1,806 of them moved by the write (`CO50`). The equality needs
spine-core's bones brought back to the setup pose before each `apply`, which is
the core's own reading — every pose is posed from the setup pose; without it the
write on a channel no timeline keys compounds frame to frame and every walk reads
off. The write made at draw time (after `updateWorldTransform`, the bone's own
matrix alone) and pose 0 left unadjusted read off on every walk they apply to.

**The live tracks** ([#1336](https://github.com/rig-c/core/issues/1336), the
issue's other piece) are held to spine-core directly too, because they are a
second state machine rather than a construct the walk carries: `openTracks` in
`src/core/tracks.ts` is `AnimationState`'s update, apply, mix, hold and queue
ported field for field over the core's timelines, and shares the single track's
pose path past the timelines (the adjustment, the world, the constraints and the
physics step, the slot rows and the sliders, the draw order and the attachments).
That path was split out of the walk without moving a bit: 18,361 poses of the
seven gallery rows — every animation on `openTrack` looping and held, both resets,
with and without an adjustment, the raw entry's walk and A10's — hashed the same
before and after. The script is the player's four shapes (a looping base on track
0; a pose held past its end, replaced over 0.2 s and replaced back before that mix
ends, so three entries chain; a one-shot set with mix 0 and
`addEmptyAnimation(2, 0.2, 0)`; later a track emptied and requeued, a looping
one-shot emptied at its next completion; the adjustment on the bone the role
animations key most), on every gallery row whose animations the tracks accept and
an event probe: 12 walks of 220 seeded mixed steps, 2,652 poses equal at tolerance
0 in every bone's world transform, drawn vertex, slot attachment and colour, the
draw order and 92 events, over 568 steps mixing out, 346 holding, 182 chaining
three entries, 62 across a mix's end, 34 across track 0's wrap and 22 starting a
queued entry (`CO51`). The oracle's bones are reset to the setup pose before each
`apply`, as `CO50`'s are; measured, `AnimationState` with no reset at all agrees
on every walk when nothing but it writes the skeleton, so the reset is needed for
the player's write alone. Each reading the runtime rejects reads off: the mix
reversed, the tracks above 0 mixed from the setup pose, the hold faded and a
queued delay read as "now" on 12 of 12 walks, and an entry mixing out firing its
events until the mix is half done on the walks that cross such a key — it fires
none, since `eventThreshold` is 0. Track 0 alone equals `openTrack` on 5,304
poses, every field. An animation keying a constraint timeline, a sequence, the
draw order or a path's deform is refused by name (`gallery/walk`, `gallery/ride`).

**An entry's alpha and additive blending**
([#1344](https://github.com/rig-c/core/issues/1344)) are held the same way:
`MixOptions.alpha` and `MixOptions.additive` are spine-core's `TrackEntry.alpha`
and `TrackEntry.additive` (4.3.13 has no `MixBlend` on an entry — `additive` is a
boolean), and `setAlpha` changes the current entry's alpha while it plays. One
script per subject — a layer over a looping base at alpha 0.6, changed to 0.85, 0
and 1 mid-entry and mixed out; the layer additive, mixed in, at 0.6, mixed out
and in again; an additive entry replaced by a replacing one and back; an
additive one-shot emptied; track 0 itself below alpha 1 and finally additive —
with roles by structure (the pair sharing the most bone rotate channels: on
`gallery/look`, `tilt` under `turn`, sharing `headroll`), on CO51's subjects and
a blend probe keying every bone timeline kind, an inherit and three colour
kinds, plus a second script where an attachment-keying animation is mixed into
itself additive: 18 walks, 3,978 poses equal to `AnimationState` at tolerance 0
in every field CO51 holds, over 1,582 steps adding over a lower track, 1,212
mixing an additive entry in and 366 mixing one out (`CO52`). Measured, not
recalled: the current entry fires its events and keeps its attachments at any
alpha, 0 included (`alphaAttachmentThreshold` 0; `eventThreshold` and
`mixAttachmentThreshold` 0 leave an entry mixing out with neither); an additive
entry adds what the runtime marks additive — every bone timeline that keys
numbers and the deform — with no shortest-angle wrap, is never held and does not
hold what it replaces, and mixing out adds at its faded alpha; colour,
attachment, inherit and event timelines under it apply as under a replacing
entry, so nothing more is refused. The oracle here resets bones and slots
(`setupPose()`): `setupPoseBones()` alone disagrees on the blend probe, where a
two-colour key at a partial alpha over track 0's `rgba` mixes the dark colour
from what the previous frame left. Each rejected reading reads off on at least
4 of 18 walks — alpha inverted or ignored, additive as replace, an additive
rotation through the remembered direction, an additive entry's attachments as a
plain timeline, the hold blind to the alpha mixing in, the holds as if no entry
added, an alpha threshold on attachments — and CO51's script with alpha 1 and
additive false stated equals it unstated on 3,094 poses, bit for bit.

**The live tracks' physics clock** ([#1396](https://github.com/rig-c/core/issues/1396))
is the render's clock (#1380) offered to a player: `clock` on `TrackOptions` and
`TracksOptions` is what each step moves the skeleton's physics clock by, and the
track time, the animation time and the events stay on the steps. Held three ways
on LS05's spring probe at 12, 20, 24, 30 and 60 fps. The mechanism: 9,344
constraint updates through both live entries, held and looped, opened with
`clock: physicsClockStep`, each take the whole steps exact arithmetic takes, and
the same walks without the option mis-step on 20 of 20 (`CO53`). The poses:
3,496 `openTrack` poses equal `poseRawAnimationEach`'s on the same clock bit for
bit, 1,748 of them the render's walk, `openTracks`' track 0 equals `openTrack`
on as many, and 4,692 looping poses equal spine-core's with its `AnimationState`
updated by the step and its `Skeleton` by `physicsClockStep` of it — while the
same spine-core updated by the step itself reads off on 20 of 20 walks (`CO54`).
The scope: 13,648 poses whose times, events and entry times are identical with
and without the clock, and the player scaling its own `dt` instead reads the
times off on 48 of 48 walks and fires a key a step early on 40 (`CO55`).

**The environment the physics answers** ([#1416](https://github.com/rig-c/core/issues/1416))
is spine-core 4.3's own: the `Skeleton` carries the wind and gravity directions
(`windX, windY, gravityX, gravityY`, initially `1, 0, 0, 1`, y down) and each
constraint's `wind` and `gravity` weigh them. The live tracks take it as
`setEnvironment`, and the rig moved from outside as `physicsTranslate` and
`physicsRotate`, the `Skeleton`'s methods of those names. Held on three
subjects — a probe with one constraint per branch of the step under a
`referenceScale` of 50, gallery/look as it ships (whose `whip` states no wind
or gravity, so only the movement reaches it) and gallery/look with the `whip`
answering wind 25 and gravity 30 — over a side gust at 60 fps and 150 seeded
mixed steps that change the environment and move and turn the rig: 18,592 poses
of `openTrack` and `openTracks`, held and looped, under both resets, equal at
tolerance 0 in every bone's world transform and drawn vertex to spine-core given
the same values on its `Skeleton`; on spine-core's side the environment alone
moved 32 of 56 walks and the movement alone 28 of 28, and each reading the
mapping rejects — the environment ignored or its y read up, the translation
ignored or read y down, the turn read clockwise or about the origin — is red on
every walk it can reach (`CO56`). Nothing set, the runtime's own values set on
every step and a move of 0 pose the same 18,592 poses bit for bit (`CO57`).

**What no public row reaches.** `bun tools/core_gate.ts` over the 19 public rows prints
a HOLE for each of these (2026-10-01; the tool's own lines are the current list, each
saying what holds it instead, where anything does). Some are reached by the private
corpus — a trimmed region, a linked mesh, rotate 180 and 270, several pages (#974):

| family | HOLEs |
| --- | --- |
| bones | inherit `noScaleOrReflection`; `shearX`, `shearY`, `skinRequired`, `negativeScale`, `rotation360`, `reflectingParent` |
| slots | `secondSkin`, `multiFilled`, `conflicting`, `unfilled`, `colour6`, `dark`, `dark8`, `blendNormal`, `blendScreen`, `nameDiffers`, `pathDiffers`, `linkedmesh`, `boundingbox`, `clipping`, `inactiveBone` |
| attachments | `skewedBinding`, `linkedMesh`, `trimmedRegion`, `mirroredRegion`, `sequenceRegion`, `nullAtlas`, `clipping`, `clipEnd`, `boundingbox`, `path` |
| uvs | `linkedmesh`, `rotate180`, `rotateOther`, `trimmed`, `sequence`, `pathDiffers` |
| animations | `bone.shearx`, `bone.sheary`, `bone.inherit`, `slot.rgb`, `slot.alpha`, `slot.rgba2`, `slot.rgb2`, `slot.stepped`, `overlappingBoneChannels`, `deformPath`, `deformClipping`, `deformLinked`, `sequence`, `sequenceRegion`, `sequenceSlider`, `drawOrderEmpty`, `drawOrderSlider`, `eventPayload` |
| constraints | `ik.mixPartial`, `ik.softness`, `ik.compress`, `ik.stretch`, `ik.scaleYUniform`, `ik.scaleYVolume`, `ik.nonNormal`, `ik.nonUniformParent`, `ik.timelineFlags`; `transform.crossMapping`, `transform.additive`, `transform.clamp`, `transform.fromOffset`, `transform.toOffset`, `transform.toScale`, `transform.timelineBezier`; `skin`; `slider.boneWorld`, `slider.boneless`, `slider.mixPartial`, `slider.loop`, `slider.timeline` |
| paths | `severalBones`, `positionFixed`, `spacingLength`, `spacingFixed`, `spacingProportional`, `spacingNegative`, `chain`, `chainScale`, `offsetRotation`, `mixPartial`, `mixZero`, `closed`, `statedLengths`, `weighted`, `beyondEnds`, `slotBoneEarlier`, `slotBonePrevious`, `noPathShown`, `afterConstraint`, `timelineSpacing`, `timelineMix` |
| stepped physics | `sameBone`, `skin`, `scaleX`, `shearX`, `componentNegative`, `mass`, `wind`, `gravity`, `mix`, `limit`, `fps`, `timeline.gravity`, `timeline.reset`, `timeline.global` |
| per skin | no row declares several skins |

## 6. Steps, and what gates each

| step | what | gate | tier | landed |
| --- | --- | --- | --- | --- |
| **0a** | a census of `src/compile.ts` (8,770 lines, measured 2026-09-29): every emission site classified *neutral* (a bone, a key, a mesh) or *Spine-shape* (a 4.3 spelling, a key order, an omitted default), and the compiled model's fields listed from the types that exist (`CompileResult`, `CompiledImage`, the contexts) | a table, and a draft of the model's type; nothing moves | squad | #912 |
| **0b** | the oracle promoted from scratch into `tools/pose_oracle.ts`: dump, compare, phases, the ill-conditioned rule, and the *Not yet* list (mesh world vertices, deform, draw order, events, physics stepping, per-skin posing); the JSON shape written so a second dumper can produce it | the exam's 14/14 IDENTICAL reproduced on the public examples' rigc rebuilds; three rows held by the selftest the way `pose_floor` is; its own mutant | squad | #911 — 12 of 12 public exports IDENTICAL (`POR08`); the PR notes their rebuilds are value-identical to the exports, so that population cannot fail it |
| **1** | the split: `compile` builds the compiled model — a serialisable, deterministic document (`rigc-compiled/1`, fixed key order) written beside the Spine files — and the Spine emitter becomes its first consumer. 0a's census is the map: 144 neutral rows are the model's (the `f32`/`keyTime` quantisation included — spelling a fraction as its full double moved the pose on 19 of 19 builds, so which decimal is named is a value), 72 Spine-shape rows are the emitter's, and every one of the 24 read-back sites needs a model-side source, eleven of them a by-name form of the weighted run that nothing keeps today | **byte identity**: every build in every corpus emits the same bytes before and after — `A18`'s discipline applied across the refactor. #379's invariant becomes checkable: `compile.ts` names no Spine shape | judgement-heavy: the coupling is measured, not hidden, but the model-side source of each read-back site is a design choice per site; the commander briefs it from the census | #916 #918 #920 #923 #924 #927, + #939 (the atlas rectangle each region record carries) |
| **2** | the core, one construct at a time in §5's order, each its own card and squad | §5's three conditions | squad per construct | the construct PRs in §5's table: #929 #934 #945 #943 #962 #951 #954 #953 #963 #971 #982, with #947 and #973 extending the oracle |
| **3** | consumers switch: `render.ts` and `deformmeasure.ts` pose through our core once every construct they use is admitted. `validate.ts`'s round trip stays on spine-core | the same renders, bit-identical, on every corpus; the three link points in CLAUDE.md become two — they stayed three, as `CUR07` reads the tree: at step 3's landing both consumers pose a rigc build through the core and keep spine-core for what is not one — a Spine export, a skeleton whose bytes no longer match its model's `spine.sha256` (#980), `validate`'s own A39 survey (#978) — and `render.ts` also links it for the atlas pages and texture substitution (CLAUDE.md *Conventions* states what each links it for today) | squad | #972 #976 #974 #980 #978 #987, + #977 #981 #982 #983 #985 #986 #988 #992 #995 #1001 |
| **4** | decided by the owner and landed in cuts 4a–4f: **one package** (`spine-rigc`) with `@esotericsoftware/spine-core` a devDependency. A clone, CI, or an install with the runtime beside it runs `cli.ts`, whose `build` is gated by the round trip; the published package runs `cli_core.ts`, whose `build` is gated by rigc's own validator over the model document and the emitted text (CLAUDE.md, *Validation is not optional*). The 🔒 invariant now names one body of assertions with two suppliers (§7). The web player this row first listed as the owner's third is not part of it | the second supplier admitted on measurement: of the 50 assertions, the 41 the model side runs held to the round trip's verdict lines by `verdict_gate` (19 public recipes 1,520 of 1,520 line sets; 14 production rigs 1,120 of 1,120); the 8 restated over the emitted text by `RC28` (152 of 152); `A00_ROUNDTRIP_PARSE` a SKIP that says so; `core_gate` holding the core's poses to spine-core's at tolerance 0; the full entry's emitted bytes and renders unchanged on both corpora across every cut (#380's closing comment) | owner, then squads | 1.7.0 (#1017 #1022 #1023 #1024), 1.8.0 (#1027 #1029 #1030 #1031), 1.9.0 (#1032 #1036 #1037), 1.9.1 (#1044 #1045), 1.9.2 (#1050 #1053), 1.9.3 (#1056 #1059 #1062); **2.0.0** (#1066 spine-core a devDependency, #1069 the core entry's `build`, #1070 the documents) |

Estimates, carried from #380's 2026-09-04 text: a posing core of 5–8k lines; the split
1–2 squad-days; 0a was to refine both. Measured instead, after step 3: `src/core/` is
9,523 lines over 16 modules, 10,105 with the render's adapter `src/render_core.ts`
(`wc -l`, 2026-10-01); the split took six cuts in one day (below).

### Step 1, cut by the census

0a measured the split as a model to be *constructed* (24 read-back sites, eleven of
them a weighted vertex naming its bone by index in the emitted array), so step 1 is
not one change. It is the sequence below, each cut landing on its own under the same
gate — byte identity of every build in every corpus, held by the instrument of 1a —
and each cut's diff boundary is a set of rows in [COMPILED_MODEL.md](COMPILED_MODEL.md):

| cut | what moves | the census rows it closes |
| --- | --- | --- |
| **1a** | the instrument: every build in every corpus hashed across two commits (`tools/emit_hashes.ts`), before any line of `compile.ts` moves | — |
| **1b** | bones by name: the model's `bones` built first, the emitter producing `SpineBone[]` from them; world transforms, the rig info walk, segments and derived group values read the model | §1.4 rows 1, 2, 12, 21, 24 |
| **1c** | the weighted run by name: the four vertex-attachment kinds (mesh, path, bounding box, clipping) as model records whose bindings name their bone, encoded to indexes only at emission; deform geometry, path lengths and the mesh-bone reads decoded from the model | §1.4 rows 8, 13–23, 14, 17; §2.1's first bullet |
| **1d** | slots, skins, the remaining attachment kinds (region, point, linked mesh), constraints, events as model records; the emitter owns the `type` discriminators, the inline omissions and the sequence frame spelling | §1.4 rows 3–7, 9–11, 16; §3 *Omission* and *Spellings* |
| **1e** | animations: keys as the model holds them, the emitter restating every constructor insertion order the key-order table does not list | §3 *Layout and order*'s ⚠️ |
| **1f** | the model written beside the Spine files (`rigc-compiled/1`, fixed key order), `A18` extended to it, and #379's rule made a control: `compile.ts` names no Spine shape | — |

The `f32`/`keyTime` quantisation stays on the model side throughout (0a's first
correction), and the two `open` rows (`filter`, `pma`) are decided at 1d. Every cut landed on 2026-09-29 — 1a #916, 1b #918, 1c #920, 1d #923, 1e #924, 1f #927 —
each byte-identical on the tree's 19 recipes and on a private corpus of 14 production
rigs, each on the first run after its refactor, each briefed to an Opus squad from the
census rows; what each cut found that the brief or the census had wrong is in its PR.
The 19 recipes proved blind to most of the keys the later cuts moved (a second skin,
linked meshes, event payloads, most constraint fields, slider and sequence timelines),
so each cut also holds those with probe rigs; a probe corpus that reaches every key is
a card of its own.

## 7. What this page does not change

- **The Spine backend's output.** The full entry's emitted bytes and renders stayed
  identical on both corpora across every cut of step 4 (#380's closing comment). What
  gates them did change, in step 4, and the 🔒 invariant in [CLAUDE.md](../CLAUDE.md)
  was re-worded in the same change (#1070): the gate is one body of assertions with
  two suppliers — the round trip through spine-core wherever the runtime is installed,
  and rigc's own validator over the model document and the emitted text where it is
  not (the published package since 2.0.0), the second admitted on `verdict_gate`,
  `RC28` and `core_gate`, with `A00_ROUNDTRIP_PARSE` a SKIP that says so. What it
  requires is that everything written to disk was gated by a reader held to a parser
  rigc did not write; the no-bypass rule (no `--no-validate`, no escape, no API handing
  back ungated artifacts) is unchanged.
- **What the core poses, now that a dependant poses through it.** A runtime-free web
  player (rig-play) poses the model document through the named entry `rig-c/core`
  (#1275, [RELEASING.md](../RELEASING.md) *The import surface*): a module that
  re-exports this core and adds nothing, so what it poses is what the gates above hold.
  Live track movement accepts an optional final array of exact physics constraint
  names (`physicsTranslate(x, y, scope)` / `physicsRotate(x, y, degrees, scope)`).
  Omission preserves the whole-context operation; explicit names are validated
  atomically before the selected remembered origins change. The native reference
  calls individual official constraints, while `CO64` holds independent outsider
  states identical. This is input selection, not isolation from solver dependencies;
  [AUTHORING](AUTHORING.md) states units, pivot and before-evaluation/reset limits.
- **The licence posture** in [README.md](../README.md), *Licensing, stated plainly*.
  Step 4 brought that section's text to what the package links and where the Spine
  Runtimes License applies (#1070); this page states nothing about it.
- **The generation policy** ([GENERATIONS.md](GENERATIONS.md)): our core reads our
  model at 4.3 semantics; data from another generation reaches it the way it reaches
  rigc today.
- **The rejected shapes on #380**, and what the tree records of each since. A Spine
  emitter with no runtime dependency: its stated reason was retired on 2026-09-05
  (#398, recorded in CLAUDE.md), and the published package has been one since 2.0.0 —
  with an oracle behind it, which CLAUDE.md still requires of every emit path. A new
  format plus a new runtime built without an oracle: still rejected.

## 8. Rejected on this page, with the reason

- **Porting spine-core.** A derivative work carries the same licence as the link it
  replaces, and a copy is not a second oracle (§3).
- **Replacing `validate.ts`'s round trip first.** It would give up a per-file guarantee
  before the per-population one exists.
- **Starting the web player before the core is admitted.** A player over a core with
  no oracle is output nobody can check — the ROADMAP's own sentence.
- **glTF as the second backend.** Rejected on #380 on 2026-09-04: a container for
  contents it cannot carry (live constraints, skins, draw order, two-colour tint,
  clipping), each a silent drop or a named absence; stays rejected.
- **Splitting the package along the licence line — not adopted in 2.0.0, which is not
  the same as rejected.** #380's 2026-09-04 sequencing named a packaging split, and step
  4 as this page first stated it left the packaging and the name open "if the licence
  line splits the package". 2.0.0 kept the single `spine-rigc` package and moved
  spine-core to a development dependency (#1066, 2026-10-02). The shape and its grounds
  are recorded in `CLAUDE.md`'s *Validation is not optional* bullet: one body of
  assertions with two suppliers — the round trip where the runtime is installed, rigc's
  own validator in the published package — and the fact about what the code links
  (this repository links `spine-core` as a devDependency; the published package links
  none; `NOTICE.md` states it). The split was not taken; this page does not call it
  rejected.
- **Reading R1 into the owner's words.** The owner asked for the spine-core oracle to be
  *replaced*; the shape on the card since 2026-09-04 is R2, and this page keeps it. If
  the owner meant R1, the correction is one line on #380 and §2 is rewritten; nothing in
  steps 0a–0b depends on the reading. The owner approved this page as written, R2 with
  it, on PR #910 (2026-10-04).
