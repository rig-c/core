# The benchmark — rigc's proof-of-concept dossier

This document is the record of **whether rigc works**, and it holds the text that was
the bulk of the README until the README became the arriving user's document: the
yardstick rigc is measured against, the three instruments that do the measuring
(`rigc diff`, `rigc bonedist` and `rigc check`) and what none of them can see, the eight-rung
benchmark ladder and the spineboy graduation exam, the commands that let you look at a
rig with no reference at all, the run viewer, the input and output surface as it stands
today, the 50 named assertions and their profiles, the selftest that has watched every
one of them fire, and the layout of the repository all of that lives in.

It is **repository material rather than package material** — most of what it names
(`bench/`, `examples/`, `viewer/`, `fixtures/`) exists only in a clone — so it is not
in the npm tarball, and the README links it by URL. The arriving user's document is
[the README](../README.md); the guide an agent authors from is
[AUTHORING.md](AUTHORING.md); the live rung ledger is
[LADDER.md](https://github.com/rig-c/core/blob/main/docs/LADDER.md) and the clauses a
candidate is graded against are in
[GATE.md](https://github.com/rig-c/core/blob/main/docs/GATE.md).

> 📎 The sections below are the README's own prose, **moved rather than rewritten**.
> Only link paths were re-pointed for this document's location, and the `docs/` line of
> *Layout* now lists this file.

## The yardstick

The measure of whether this works is **Spine's own official example projects** —
the `1-weight-and-mass` … `8-follow-through` series as a difficulty ladder (one
animation principle per rig, in roughly ascending order), and **spineboy as the
graduation exam**. The question is structural and per-frame: given the same source
art and a spec, does a compiled rig match the official export in bone hierarchy,
timeline shape, mesh topology and posed vertex positions?

`scripts/fetch-examples.sh` downloads those projects into a gitignored `examples/`
directory (they are not redistributed here — see [NOTICE.md](../NOTICE.md) for the
per-example licence terms).

### Comparing a rig against a reference — `rigc diff`

```bash
bun cli.ts diff candidate.json reference.json [--json report.json]
```

`diff` reads two skeletons and reports a ratio per **measure**, grouped into six
sections — bones, slots, attachments, constraints, animations, events — and it
does **not** combine them into a score. A single "87% match" cannot tell a rig
with the right skeleton and the wrong timing apart from a rig with the right
timing and the wrong skeleton, and those are opposite diagnoses.

Three properties the measures are built to have:

- **`diff X X` is 1.000 on every measure.** A comparison tool that cannot
  recognise identity is reporting noise, and noise looks like a small honest gap.
  The selftest asserts it.
- **A difference moves as few measures as possible.** Reordering two slots moves
  `slots.order` and nothing else — not the slot-to-bone bindings, not the setup
  attachments — so the report says *where* a rig is wrong, not just *how much*.
  Each selftest case names the exact set of measures its edit may disturb.
- **Name-agnostic figures sit beside name-matched ones.** A candidate that builds
  the right tree under its own bone names scores 0 on `bones.parent_by_name` and
  1.000 on `bones.depth_histogram` and `bones.degree_sequence`. Reporting only the
  first calls a correct rig a total failure; reporting only the second calls any
  14-bone tree a match. That holds at the section level too: `bones` and `slots`
  are the two sections whose measures are mostly name-keyed, so each reports **two
  figures**, and the pair is the finding —

  ```
  bones 0.567 (name-matched) · 1.000 (name-agnostic)
  ```

  reads *"the tree is right and the vocabulary is different"*, which the single
  mean on its own could not say. They are two comparisons with their own measure
  sets rather than two halves of one; the name-matched figure is unchanged, so
  older reports stay comparable. `sections[].nameAgnostic` in the JSON lists them.

  ⭐ **`animations` carries the same pair, once something has PAIRED the two
  sides' shots.** A bone is matched to a bone by its depth and its child count,
  which the file states; two animations have no such shape, so the candidate's
  `take01` and the reference's `arcs` are the same shot only because somebody
  says they are. Two things say it and nothing else does:

  ```bash
  bun cli.ts diff candidate.json reference.json --as take01=arcs --as take02=jump
  ```

  and, with no flag, **one animation each side**, which pairs by position
  because there is exactly one reading of which shot is which. Anything else —
  two against two, three against one — has several, so the block is **absent**
  rather than guessed at, and its absence is the report saying so. The heading
  states which of the two it used:

  ```
  animations (name-agnostic) mean 1.000  over 6 measures  — the same two skeletons compared with names thrown away, paired by position: take01=arcs, the one animation each side carries
  ```

  `names` stays in the name-matched block alone, and reading the pair is the
  whole point of the split: **agnostic 1.000 beside `names` 0.000** says the
  shot is right and its name is the author's own. Before this existed, a
  candidate written from a brief that withholds the animation name read `count`
  1/1 and **0.000 on every other animation measure** — including the `duration`
  and `key_counts` it had got exactly right
  ([#720](https://github.com/rig-c/core/issues/720)).

An assertion or measure with nothing to compare reports its `total` as 0 and says
so, exactly as the validator's SKIP does — a vacuous 1.000 that looks earned is
the same false green in a different costume.

#### The measure inventory

Six sections. `bones` and `slots` each carry a **second** comparison made without
consulting a name (`sections[].nameAgnostic`), `animations` carries one too
wherever something has paired its shots — `--as <candidate>=<reference>`, or one
animation each side — and `attachments` and `animations`
each carry a **`(reported)`** block (`sections[].reported`) — measures that report
and never gate, with no mean over them. The three figures a section can carry are
three different comparisons and none is a part of another; `sections[].ratio` is
the mean of the **first** column only, which is what every stored `bench.json`
quotes.

⚠️ **`animations`'s second comparison is the one block that can be absent**, and
that is a statement rather than a gap: with two shots on each side and nothing
pairing them there is no reading of which is which, so the report says so by
carrying none. `sections[].nameAgnostic.pairedBy` names the pairing wherever the
block is there.

Beside the six, the file's own `skeleton` header block is compared and reported —
`header` in the JSON, printed first because that is where it sits in the file. It
is **not** a seventh section, and the reason is the one thing a section must have:
a `ratio`. These measures cannot be in a mean (below), so a `skeleton` section
would carry either a vacuous `mean 1.000 over 0 measures` or a nullable figure
every reader of every other section would then have to handle.

| Block | Name-matched measures | Name-agnostic | Reported |
| --- | --- | --- | --- |
| `skeleton` (the header) | — | — | **`bounds_present`** · **`bounds_box`** |
| `bones` | `count` · `names` · `parent_by_name` · `order` · `length_present` · `inherit_present` · `depth_histogram` · `degree_sequence` | `count` · `depth_histogram` · `degree_sequence` · `shape_histogram` · `order_shape` | — |
| `slots` | `count` · `names` · `order` · `bone` · `attachment` · `blend` · `color_present` | `count` · `attachment_types_by_position` · `bone_binding_shape` · `order_shape` | — |
| `attachments` | `skins` · `count` · `names` · `type_counts` · `mesh_vertices` · `mesh_triangles` · `mesh_weighted` · `mesh_hull` · `region_size` · `refs` · `skin_members` | — | **`mesh_edges`** · **`runtime_name`** |
| `constraints` | `count` · `names` · `type_counts` · `type_by_name` · `refs` · `order` | — | — |
| `animations` | `count` · `names` · `duration` · `timeline_kinds` · `key_counts` · `curve_kinds` · `event_keys` · `draw_order` · `deform` · `targets` · `keyed_names` | over the paired shots, and only where something pairs them: `duration` · `timeline_kinds` · `key_counts` · `curve_kinds` · `draw_order` · `deform` | **`key_density`** · **`keys_per_timeline`** |
| `events` | `names` · `payloads` | — | — |

##### Why a measure can be reported and not gating

`docs/GATE.md`'s *What never gates* seals off "anything unobservable by
construction", and its test is not *is this measure hard?* but **could any
reading of the frames have decided it?** For the six measures in the last
column the answer is no, whatever the frames are:

- **`attachments.mesh_edges`** — *each mesh declares an edge list, or declares
  none, alike.* `edges` constrains triangulation in the editor and has **no
  runtime effect at all**; it draws no pixel.
- **`attachments.runtime_name`** — *each attachment both sides hold answers to the
  same name at runtime*: its `name` if stated, else its placeholder
  (`SkeletonJson.js:526`). A name draws no pixel, and it is a value a consumer
  reads off `slot.attachment.name`, which is why it is measured at all: two
  production rebuilds renamed attachments under every key while every other
  measure here read 1.000 ([#796](https://github.com/rig-c/core/issues/796)).
  Scored over the keys **both** sides hold, so a key one side lacks moves
  `names` and `count` and not this.
- **`animations.key_density`** and **`animations.keys_per_timeline`** — two
  keyings of one curve render the same pictures at every rate, which is measured
  under *Key density* below.
- **`skeleton.bounds_present`** and **`skeleton.bounds_box`** — the setup-pose
  bounding box draws no pixel; `render` frames from the posed bounds and never
  reads it. Unwinnable a second way too: since issue #907 an author does not
  write it — `build` computes it — and the editor's own box is its arithmetic,
  up to 0.0071 units from `getBounds` on the twelve examples, so not even a
  rebuild reads it 4/4.

They are still findings against the reference export, so they are printed — and
they are printed in a block of their own, with **no mean**, for two reasons. The
first is arithmetic: a presence share and a keys-per-second agreement have unlike
units, so an average over them is a number with no referent. The second is that
`sections[].ratio` is the one figure a stored ladder row quotes, and keeping a
non-gating measure out of it is what let the three section-level ones be added
without moving a recorded figure — verified over the whole committed
transcription corpus, every section mean and every existing measure identical to
the digit. The header's two moved nothing for a stronger version of the same
reason: they are not in a section at all.

##### The nine value measures, and why they are not in the inventory above

Every measure in that table reads *presence*, *names*, *counts*, *order* and
*kinds* — never the numbers inside them. So a decompiler that halved every
rotation, dropped every bone's `length` or mirrored every vertex reads **1.000 on
all 54 measures**, which is what [issue #615](https://github.com/rig-c/core/issues/615)
was opened about. `diffSkeletonValues` is the answer and it is a **separate call**
with a report of its own:

| Measure | Compares |
| --- | --- |
| `values.skeleton` | the header and the setup-pose stage |
| `values.bones` | every bone setup pose, its `length` and its colour |
| `values.slots` | every slot colour, dark colour, blend mode and setup attachment |
| `values.attachments` | every attachment offset, size, vertex, weight, uv and triangle |
| `values.constraints` | every constraint field the parser reads: its pose, its flags and modes, a transform's six offsets and its property map — each `from` and `to` by its class (`properties/FromX/to/ToY/max`), and a slider's property by its class (`property/kind`) |
| `values.events` | every event payload in the setup pose |
| `values.key_times` | every key time, and each animation's duration |
| `values.key_values` | every keyed value: poses, deform vertices, draw orders, event payloads |
| `values.curves` | every curve type and the Bezier samples the parser built from its handles |

Three properties, and each is the reason for the one after it:

- **Its defaults come from the parser, not from a table.** Telling `undefined vs
  0` apart from a difference needs the format's per-field defaults — `time`
  absent is 0, `scaleX` absent is 1, a physics key's `value` absent is 0 while
  its `mix` is 1 — and a second spelling of those inside a gate is what this
  repository refuses. So both files are read through `spine-core`'s
  `SkeletonJson` (`skeletonValues` in [`src/validate.ts`](../src/validate.ts),
  one of the three modules allowed to link the runtime) and this compares what
  comes back.
- **It therefore needs both skeletons *and* both atlases**, which is why it is
  not part of `rigc diff`'s 54 and why `bench.json` is unchanged by it. A
  skeleton whose attachments carry a `sequence` cannot be parsed without the
  pack that resolves it, and half the corpus does.
- **Its tolerance is derived, never fitted.** `valueTolerance(m) = 1e-6 +
  2⁻²³·m`: the first term is the one absolute grid rigc still emits on — the
  1e-6 its closed-form models (a deform `transform`, a track `derive`) are
  evaluated onto, `onModelGrid` in `src/compile.ts` — and the second is one
  float32 ULP, because `spine-core` stores frames, curves and vertices in a
  `Float32Array` and every other number rigc emits is its float32's shortest
  name. Over the twelve editor exports in `examples/` the widest gap between a
  rebuild and the file it was read from is **0**: not one of 189,699 numeric
  values differs, because the rebuild spells every number as the editor did
  (`IG73`). (188,339 until [#1084](https://github.com/rig-c/core/issues/1084) let
  1,360 more numbers into the walk — the colour channels, the transform offsets and
  property maps — and the gap over them is 0 as well.) It was **0.81** of the bound, over 56,951 values that differed,
  while rigc wrote six fixed decimals (issue #716).
  ⛔ It is also the floor of what the measure can see at all: a difference
  smaller than one float32 step is invisible to the parser and so to this.

⚠️ **It reports; it gates in exactly one place.** No reading of a rung's frames
could decide a bone `length` or a constraint `mix` at rest, so *What never gates*
applies to it word for word on the ladder. The corpus round trip is the case that
rule does not cover — there the reference **is** the file the specs were read
from, so a value that moved is a decompiler loss and there is nothing for a
candidate to be entitled to — and `IG16` in `selftest.ts` gates it for that
reason, the same one that makes it gate `mesh_edges` there.

##### What `diff` reads, and what it leaves — the census of #1084 and #1085

Two cards asked the same question from two sides: *which field or order does the
format write that nothing here compares, and does a difference there reach a pose?*
[#1084](https://github.com/rig-c/core/issues/1084) for the value walk,
[#1085](https://github.com/rig-c/core/issues/1085) for the names `diff` reads.
Every row below was **planted** — one change to one field of a public build, an
editor export or a gallery rig — and read four ways: the value walk, `diff`'s
structural measures, the pose (`tools/pose_oracle.ts`'s document, the one
`tools/core_gate.ts` compares: bones, slot colours, draw order, attachment vertices,
clipping and UVs, setup and nine samples per animation, and stepped once more for a
physics field), and, where the pose agreed, the frames `rigc render` draws. *Reaches*
is that measurement and not a reading of the format.

**The value walk's blind spots** — fields it skipped, all of which reach a pose or a
frame, all of which it now reads:

| Field | Planted on | Reaches | Why the walk missed it |
| --- | --- | --- | --- |
| a transform's six offsets (`rotation`, `x`, `y`, `scaleX`, `scaleY`, `shearY`) | `6-arcs-pro` `tail` (`x`, `y`); `spineboy-pro` `front-foot-board-transform`, every property mapped (all six) | pose — every sample of the constraint's bones | the parser holds them as `offsets`, a name the skip list kept for a sequence's region offsets |
| a transform's `properties`: each `from`'s `offset`, each `to`'s `offset`, `scale`, `max` | `tail`'s `x>x` (`offset`, `scale`); `front-foot-board-transform` with `clamp` (`max`) | pose (`max` only where the constraint clamps: 97 of 99 samples, none without) | the whole map was skipped as *derived from the constraint*, which it is not |
| which property a `from` reads and a `to` writes, as the walk sees them | `tail` `x>x` → `x>y` | pose | the classes (`FromX`, `ToY`) have the same fields, so a remap moved only `mixX`, by side effect |
| a slider's `property` | `gallery/look` `yaw`, `rotate` → `x` | pose, 7 of 27 samples | same shape: `FromRotate` and `FromX` are both `{ offset, to }` |
| a slider's `local` | `yaw`, flipped | pose, 5 of 27 samples | shares its name with a bone pose's derived `local` |
| a colour's alpha and blue (`a`, `b`) | `spineboy-pro`: a slot's alpha `ff` → `80`, a slot's blue; a region's own colour | slot: pose, every slot row; attachment: frame, 1 of 190 (the pose document does not hold an attachment's colour) | share their names with two entries of a bone's world matrix |

So the walk now reads a list of unnamed objects of one shared-shape class each —
`properties` and every `to` — by those classes rather than by position, and pushes the
class of any such object as a value of its own (`property/kind`). Writing the map in
another key order moves nothing, posed or walked (`D56`). Over the 76 constraint fields
SPEC_COVERAGE §1.4 lists, the walk read **67** and now reads **76**; the nine it
gained are the six offsets, `properties`, and a slider's `property` (its class) and
`local`. What it still cannot see is what the parser does not read: a transform's mix
for a property the constraint does not map, and a slider's `time` once it has a
`bone` — planted, each moves no value and no pose, because no value moved.

**The names `diff` did not read** — each now a measure:

| Field or order | Planted on | Reaches | Measure |
| --- | --- | --- | --- |
| the order of the one constraint array | `spineboy-pro`, `6-arcs-pro`, `sack-pro` reversed; `aim-torso-ik` ⇄ `aim-torso-transform` | pose: 98 of 99, 8 of 9, 8 of 36 (33 of 36 stepped); the swap 9 of 99 | `constraints.order` |
| a timeline's target — a bone, slot, ik, transform, path or physics constraint | each kind retargeted onto one with none of that group (`gallery/look`, `spineboy-pro`, `gallery/ride`, `sack-pro`) | pose: 7 of 27 (bone), 7 of 99 (slot), 9 of 99 (ik, transform), 8 of 18 (path); physics in the stepped pose, 8 of 36 | `animations.targets` |
| the slots a draw-order folder holds | `spineboy-ess`, a folder given to both sides with one slot swapped | draw order, 9 of 72 | `animations.targets` |
| an attachment key's attachment | `spineboy-pro`: two slots' first keys swapped; one key renamed within its slot | draw: 9 of 99; 1 of 99 | `animations.keyed_names` |
| a draw-order offset's slot | `spineboy-ess`, one offset moved onto the next slot | draw order, 9 of 72 | `animations.keyed_names` |
| an event key's event | `spineboy-pro`, a key firing a second, identical event | the event block, 1 of 99 | `animations.keyed_names` |
| the region an attachment draws (`path`) | `spineboy-pro`'s eye pointed at the other eye | draw: 94 of 99 | `attachments.refs` |
| a clipping polygon's `end` | `spineboy-pro`, six slots on | clipping: 9 of 99 | `attachments.refs` |
| a linked mesh's `source` (and the `skin` and `slot` it is found under) | `gallery/nod`, a linked mesh taking `ear_r` instead of `ear_l` | every sampled pose, 18 of 18 | `attachments.refs` |
| what a skin activates (`bones`, `ik`, `transform`, `path`, `physics`, `slider`) | `gallery/look` `yaw_dial`, `gallery/walk` `leg_b_ik`, each skin-required and dropped from the list | pose: 27 of 27; 9 of 9 | `attachments.skin_members` |

Three things were measured and are **not** a measure, each for a reason the plant
gave:

- **Two timelines swapped between two targets that both keep one** — `gallery/nod`'s
  two ear deforms traded — leaves the same names on both sides; what moved is which
  keys sit under which name, a value. The walk sees it (it keys timelines by owner);
  `diff` by its own rule does not read values.
- **Not every reordering poses differently.** `gallery/look`'s two sliders and
  `gallery/walk`'s two legs drive disjoint bones and pose the same either way, and
  `constraints.order` still moves: it reports the order a file states, as
  `bones.order` does, and the pose is the reading that says whether it mattered.
- **A writer's key order is not a difference**: an animation's groups and a
  transform's map written backwards move nothing (`D72`, `D50`, `D56`).

⭐ Two of the measures are **non-vacuous on every export without the construct
being there**, and on purpose. `attachments.refs` compares every attachment, because
every region and mesh draws a region even when the file leaves its `path` to the
parser — read as the runtime resolves it, `path`, else `name`, else the key, so a
writer that spells the path out and one that does not agree (`D71`). And
`attachments.skin_members` reads `1/1` per skin on a file that declares no membership
list, which is agreement and not an absence of data, the way `bounds_present` counts
two missing boxes. Neither of the twelve editor exports' constructs that are absent
everywhere — a stated `path`, a linked mesh, a membership list, a draw-order folder —
could otherwise have been given a fixture `IG18` would accept; the `diff` suite
plants each one instead.

##### `skeleton.bounds_present` / `skeleton.bounds_box` — the value that was required and unmeasured

🔁 **Called `stage_present` / `stage_box` until issue #907**, when `build` stopped
copying rigc's stage into the header and started writing what the format says the
header is: the setup-pose bounding box, computed by rigc's core and held to
spine-core's `getBounds` at tolerance 0. Since then both sides of every comparison
carry a bounding box, the stage is the model document's, and a measure named for
the stage would send a reader to change a value that no longer moves it. The
history below is the measure's, under its old name.

[Issue #578](https://github.com/rig-c/core/issues/578). `build` refused a rig
spec without a `skeleton.width`/`height`, and **no instrument in this repository
read one**: `validate`, `check` and `render` all ignore the stage, and `diff` had
no header measure at all. A sweep that handed a deliberately absurd unit stage
`0,0,1,1` to 37 real exports found **32 of them still reading 1.000 on all 52
measures**. Required and unmeasured is the worst combination a field can have —
the only way to satisfy it was to invent a number, and nothing would ever
contradict the invention.

**`bounds_present` is counted `1/1` or `0/1` and never `0/0`.** Both sides always
have a presence to compare, *including* when both declare nothing: that is
agreement, not an absence of data, and scoring it vacuous would put the one shape
the measure exists for back into silence. **`bounds_box` is the one that goes
vacuous**, at `0/0`, when there are not two boxes to compare — and it compares the
four numbers **exactly**. Each side's box is its writer's own computation, and an
epsilon chosen to absorb the editor's arithmetic would be a number nobody measured;
the
**structural** measures in `src/diff.ts` hold exactly one tolerance (`FRAME`, for
`animations.duration`) and no spatial one anywhere, because they compare no
position at all — that is `bonedist.ts`, and, for two files rather than two poses,
the value comparison below.

What a header "carries a box" means here is its **extent**: a numeric `width`
and `height`. An `x`/`y` with no extent is an origin for a box that is not there
— no export carries that shape and rigc never emits it — so it does not make a
box on its own.

**Inside a stated box, an omitted `x`/`y` is read as `0`**
([#620](https://github.com/rig-c/core/issues/620)) — *exactly* is about the
comparison, not about the spelling. The editor's writer omits a header field at
its default, so a stage at the origin exports with a `width` and a `height` and
no origin at all, and three rigc builds sitting at `0,0` each read their own
editor export as `stage_box` (as it was then called) **2/4** with the note `candidate 64x64 at
null,null; reference 64x64 at 0,0` — the same box, reported half moved. The
reading is derived rather than assumed: all twelve exports under `examples/`
omit `referenceScale`, whose default the parser spells as `100`, and none of the
389 bone origin, rotation and shear values those files write is an explicit `0`;
`SkeletonBinary.js:69-72` reads the four as four unconditional floats, so one
skeleton's origin is `0` in a `.skel` and absent in a `.json`; and
`SkeletonJson.js:70-73` is a raw `skeletonData.x = skeletonMap.x` that does the
same to `fps`, which every one of the twelve omits. The default stops at the
origin: defaulting the extent would turn a box-less header into a `0x0` box
and answer the question `bounds_present` exists to ask.

##### `attachments.mesh_edges` — the third of rung 6's three features

`docs/LADDER.md` gates rung 6 on transform constraints, weighted meshes from
authored geometry, and **mesh `edges`**. `bench` could see the first two and not
the third at all: the section measured nine things and none read `edges`, so a
candidate that dropped one of the rung's own gating features scored a clean 1.000
for the meshes it kept ([issue #46](https://github.com/rig-c/core/issues/46)).

**Present-vs-absent, and not the list**, keyed on the name-matched mesh pairs.
`edges` has no runtime effect, so two candidates can carry different-but-equivalent
lists and mean the same rig, and index equality would score a correct rig below
1.000. `edges.length` has the same defect in weaker form — `6-arcs`' `tail`
declares 116 entries and a mesh triangulated differently declares a different
number while being just as right. Present-vs-absent is the only distinction that
is unambiguous, and it is exactly the one that was invisible. Declaring
`"edges": []` reads as *declared*: that is a different statement from omitting
the key, and it is how `bench/count_features.ts`'s `mesh_hasEdges` survey counts
it too, so the corpus census and the measure agree on what "has edges" means.

On the committed corpus it reads **2/2** on the rung-6 transcription, **12/12**
on `spineboy-pro`, and vacuous `0/0` where neither side has a mesh.

##### Key density — measured, and why neither of #20's routes was taken

[Issue #20](https://github.com/rig-c/core/issues/20) reported rung 3's one real
gap as `key_counts` 42/69 and proposed making key density **observable**: render
the reference frames at 24 or 30 fps, or state a key-density hint in the brief.
Both were measured before either was built, on rung 3's own export, with the
stage-3 instrument below as the measuring device — the maximum bone-world
position difference over **all** time, converted to reference-frame pixels at
rung 3's own render scale (0.1176 px per unit; one skeleton size = 86.70 px):

| variant | bone keys (ref: 69) | 12 fps | 24 fps | 30 fps | 240 fps ≈ the true maximum |
| --- | --- | --- | --- | --- | --- |
| over-keyed — resampled at 60 Hz, same motion | 1688 (24.5×) | **0.0000 px** | 0.2139 px | **0.0000 px** | 0.2139 px |
| over-keyed — resampled at 47 Hz, same motion | 1324 (19.2×) | 0.4824 px | 0.4824 px | 0.8229 px | 0.8229 px |
| under-keyed — every second key dropped | 41 (0.59×) | 6.0195 px | 6.0195 px | 5.9947 px | 6.0539 px |

Three findings, and they close the question in both directions.

1. **Over-keying is sub-pixel at every rate.** A candidate carrying 19 to 24
   times the reference's keys along the same curve differs from it by **at most
   0.82 frame pixels, anywhere, ever** — against the 0.67 px of slot drift that
   `check`'s own *faithful* transcription control already carries from atlas
   resampling. There is nothing above the instrument's noise floor for any rate
   to sample. This is the failure mode the ladder actually hit: the rung-4
   re-climb cleared every pixel-side measure while carrying `key_counts`
   421/1339, over-keyed roughly 3×.
2. **Under-keying that matters is already fully visible at 12 fps**, which reads
   99.4 % of the position maximum and 99.9 % of the rotation maximum (37.90° of
   37.93°). Going to 30 fps reads 0.4 % *lower* — it misses the peak. And a
   6 px / 38° error is far above the gate's 6.0 px drift bar, so it was never the
   invisible case.
3. **"Higher is more observable" is false as stated.** 12 fps and 30 fps saw
   *exactly nothing* of the 60 Hz over-keying because both rates divide 60 and
   every sample lands on a knot where the two curves coincide, while 24 fps saw
   the whole residual. What a rate reveals depends on whether it is commensurate
   with the candidate's own keying grid, not on being higher — which is not a
   property a protocol can choose in advance, because the candidate's grid is
   the thing being measured.

⇒ **The frame rate is not the ceiling; the pixels are.** So no reference set was
re-rendered and `bench/render_reference.ts` is unchanged — it already writes any
`--fps` to a `<animation>@<fps>fps` directory beside the 12 fps set, so a higher
rate was always available to anyone who wanted one; what the measurements say is
that it buys ≤ 0.4 % on the observable case and nothing on the unobservable one,
for two to three times the committed frame bytes.

🚫 **And the brief-side hint is refused, on the honesty rule rather than on
cost.** `docs/LADDER.md` lists **key counts** among what a brief may *not* carry,
and [#158](https://github.com/rig-c/core/issues/158)'s sealing test states the
general form: text is forbidden in an allowed-reading surface **iff it states or
constrains a reference-side value of a scored measure**. `animations.key_counts`
and `animations.curve_kinds` are scored rows, so a key-density hint is exactly
that text. It would also not make density *observable* — it would make it
**told**, which converts a measure into an input and then measures whether an
author can copy a number. Nothing needs it as an input either: gate v2.3
([#153](https://github.com/rig-c/core/issues/153)) settled that no clause
reads a figure the authoring loop cannot see, which is the question #20's own
follow-up sharpened it into. ⇒ **No brief-format field was added and no brief was
rewritten.** The convention stands as it was: a brief states each animation's
duration and whether it loops, and states nothing about how it is keyed.

⭐ **What was actually wrong was the report, and that is what changed.**
`animations.key_counts` is a histogram intersection over
`max(candidate, reference)`, so **it cannot say which side is the bigger one**:
rung 4's 421/1339 is indistinguishable from a candidate carrying a third of the
reference's keys rather than three times them, and the author read it as a gap
and left it — correctly, because nothing in the report said *over-keyed*. Two
reported rates say so, each with its convention printed beside it:

- **`animations.key_density`** — every key of every timeline over the summed
  last-key time of every animation, in **keys per second**, compared as
  `min/max` at three decimal places, with the direction in the note.
- **`animations.keys_per_timeline`** — the same key total over the number of
  timelines that exist, in **keys per timeline**.

Two and not one, because a key total can differ two ways and the repairs are
opposite. On the committed corpus every candidate reads **1.000** against its own
reference; the cross-comparison of the two spineboy skeletons shows the pair
working — `spineboy-pro` against `ess` reads *1.67× — OVER-keyed* per second and
*0.87× — UNDER-keyed* per timeline, which says **more timelines, not denser
ones** (421 against 153). The flat `key_counts` 744/1791 says neither.

### Comparing the poses themselves — `rigc bonedist` (stage 3)

```bash
bun cli.ts bonedist --candidate path/to/spine \
                    --reference examples/6-arcs/export/6-arcs-pro.json \
                    --bones correspondence.json   # or: --bones identity
bun cli.ts bench 6 --candidate path/to/spine --bones identity   # folded into a rung
```

⭐ `docs/LADDER.md`'s *How a rung is scored* names three stages, and the third had
never been built: *"per-frame bone world-transform distance … **None of it
exists.** Do not report a per-frame figure until it does"*
([issue #8](https://github.com/rig-c/core/issues/8)). The structural diff
compares what the two files *say*, and two structurally identical rigs can pose
completely differently — a rotation of 30° and a rotation of 300° are one key
each. `bonedist` steps both skeletons through the paired animation at a fixed
rate and reports, per frame and per corresponded bone, how far apart they are.

**It is not `check` with bones.** `check` measures a candidate against
**pictures**, which is what lets it run inside an authoring loop; `bonedist`
reads the **reference skeleton**, so it is a finish-line instrument subject to
the honesty rule. Four things follow, and each is a hole `check` has by design:
its unit is a drawn slot, so a bone that drives nothing visible has no footprint
at all; it reports a centroid and a bbox, so rotation is only inferred and scale
and shear are not separated; its matcher *guesses* the pairing and says when it
is guessing; and everything below the render scale is invisible to it (0.117 px
per unit on rung 3).

**The correspondence is an input, never a derivation.** A candidate is entitled
to its own bone names, so a mapping worked out by the tool would be a guess
reported as a measurement — and a wrong guess reads as a rig that poses wrongly,
which is the one conclusion this figure is for. Pass a file:

```json
{ "spec": "rigc-bonedist/1",
  "bones": { "<candidate bone>": "<reference bone>" },
  "animations": { "<candidate animation>": "<reference animation>" } }
```

…or `--bones identity` to state that the two skeletons use the same names, which
is the transcription case. The report says which it used, so a figure can never
be read as though a mapping had been supplied when none was, and a name present
on one side only is **named** rather than dropped.

**Four quantities, no score.** Every figure is printed under the conventions it
was measured at, and the report carries them verbatim in
`BoneDistReport.conventions`:

| Quantity | What it is | Unit |
| --- | --- | --- |
| `position` | each bone's world origin **relative to its own skeleton's root** and divided by **its own skeleton's size**, then the Euclidean distance between the two | skeleton sizes |
| `rotation` | `\|Δ getWorldRotationX()\|`, wrapped to ±180 | degrees |
| `scale` | `max(\|Δ getWorldScaleX()\|, \|Δ getWorldScaleY()\|)` | dimensionless |
| `linear` | `max(\|Δa\|, \|Δb\|, \|Δc\|, \|Δd\|)` over the world matrix's linear part — **complete**: rotation, scale *and shear* all live in those four numbers | dimensionless |

- **Size** is the greatest root-to-bone distance in that skeleton's **setup
  pose**, and the report names the bone it came from. Two-sided normalisation on
  purpose: a candidate is authored in its own coordinate system and under the
  honesty rule could not be authored in any other, so a different origin or a
  different unit is absorbed, exactly as `check`'s fitted similarity absorbs
  them for pixels. ⚠️ A globally **rotated** rig is not absorbed — it arrives as
  a constant rotation on every bone, which is the diagnosis. ⚠️ And the size is a
  property of the whole rig, so a candidate that moves the bone setting its size
  renormalises every position figure; read the two sizes in the header first.
- **Frames** — both sides sampled from t=0 at one rate over **their own**
  durations, compared index by index over the shorter of the two. Every animation
  states both frame counts and both durations, so a candidate that runs long
  reads as that rather than as a pose error.
- **Aggregate** — per bone: the mean and the worst over the compared frames. Per
  animation: the mean of the bone means, and the single worst (bone, frame).
  Nothing is combined **across** the four quantities and there is no score, for
  the reason `diff` opens with: a rig with the right positions and the wrong
  rotations and a rig with the right rotations and the wrong positions call for
  opposite fixes.
- 🚫 **It gates nothing.** `docs/GATE.md` reads no figure from this table, and no
  threshold or recorded figure moved when it was added.

**What the committed transcriptions read**, at 12 fps under `--bones identity`:

| candidate | frames × bone pairs | worst position | worst rotation | worst scale | worst linear |
| --- | --- | --- | --- | --- | --- |
| rung 3 `ess` | 86 × 3 | 0.000000 | 0.0002° | 0.000000 | 0.000003 |
| rung 6 `pro` | 69 × 14 | 0.000003 | 0.0006° | 0.000000 | 0.000010 |
| `spineboy-ess` | 132 × 18 | 0.000003 | 0.0005° | 0.000001 | 0.000008 |
| `spineboy-pro` | 190 × 67 | 0.049394 | 13.1730° | 0.184070 | 0.257906 |

The first three are the floor: a few parts per million of a skeleton size, which
is the rig spec's own rounding of the curve handles and nothing else. That is
what a real candidate is read against.

🔬 **The fourth is the instrument's first finding, and it is a sampling knife
edge rather than a pose defect** — worth writing down because it is the shape a
reader will meet again. It is one animation (`hoverboard`) and two bones
(`side-glow1`, `side-glow2`) out of 190 frames × 67 pairs; every other reading
sits on the floor. Both bones are keyed **stepped**, the reference's key times
are `0.16666667` / `0.2666667` / `0.8666667` and the transcription's are
`0.166666` / `0.266666` / `0.866666` — and 12 fps samples land exactly on those
boundaries, so the two sides read opposite sides of one step (13.1730° is
precisely the 40.95424 → 27.781216 step). Re-run at **11 or 13 fps and it is
gone**, floor to floor. ⇒ Two lessons the report now carries in its own
conventions: a spike on one bone at one frame is worth re-running at another rate
before it is read as motion, and a **stepped** key time cannot be rounded as
freely as a bezier one. 🚫 Neither the transcription nor any recorded verdict was
changed for it: `spineboy` is a cleared rung under gate v2.3, this figure gates
nothing, and the transcriptions measure expressiveness rather than authoring.

### Checking a rig against the pictures — `rigc check`

```bash
bun cli.ts check --candidate path/to/spine --frames bench/reference/3-timing-and-spacing
```

⭐ **Neither the gate nor `diff` can see a wrong animation.** The gate checks
validity: it parses the skeleton, steps every animation and refuses anything
degenerate, and it has no opinion about whether the animation is the one that was
asked for. `diff` checks structure: a reversed easing is the same timeline, the
same key count and the same curve kind. Three honest ladder runs have now produced
**zero** validator FAILs between them, and one of them shipped a build in which
every easing in the file was reversed — green, and sincerely reported as done.

`check` is the instrument for that. It renders the candidate with the same
rasteriser that drew the reference frames, onto the same pixel grid, and reports
per animation and per frame:

- **MAE over the union alpha** — the mean absolute RGB difference over the pixels
  either side covers, 0..255. The whole-frame figure is printed beside it and never
  instead of it: most of a frame is background on both sides, so that number is
  small for every candidate and the gap between a good one and a bad one smaller
  still.
- **The texture floor** — how much of that MAE is **resampling** rather than the
  rig, when you ask for it with `--texture-from <atlas>`. The reference frames come
  through the example's own **packed** atlas, which may carry a `scale:` line (the
  ladder's are packed at 0.4 and 0.5) while a candidate samples the art at its own
  resolution, so every edge of every part is filtered from a different source in
  every frame. `--pack` does not change that in either direction: rigc's packer is
  lossless and writes no `scale:` line. It is a constant of the
  *pipeline*: invisible to the content box, to the fit residual and to the
  whole-pixel refinement, and **no key moves it**. Measured twice by hand before it
  was attributed here — about two thirds of rung 3's figure — and the report said
  nothing (issue #171). The flag renders the candidate's **own geometry** through
  that atlas's texels and prints two figures beside the MAE: `floor`, the
  resampling on its own, and `above it`, the MAE with that difference taken out.
  They **bound** rather than subtract: absolute errors do not add, so what holds is
  `|MAE − above| ≤ floor` — the triangle inequality over the pixels all three are
  averaged on. 🚫 `above it` is not a better number and the MAE stays the figure of
  record; a floor near zero is a proof the texture is *not* the story. See the
  atlas-floor recipe in [AUTHORING §9.2](AUTHORING.md).
- **The framing** — where the candidate's drawn pixels sit against the reference's,
  as a scale, an offset and a residual. It is printed first because it is upstream
  of everything else: get it wrong and the error arrives disguised as motion. On a
  skeleton root it is decided **per animation directory**: a set whose own pixels
  land in the box `frames.json` records is measured there, exactly, and the rest
  share one fitted framing. `--framing shared` measures every set in the shared one
  — the whole-root behaviour before issue #100, and worth 15–25 MAE on a character.
  A **fitted** framing then gets one last pass that searches whole-pixel offsets
  (±2 px) for the lowest MAE and takes the best one, because a fit registers extent
  and the best fit of two extents is not the best alignment of two pictures — a
  constant pixel is worth up to 30 % of a set's figure (issue #146). The line says
  what it moved and what that was worth, and it says so when the identity won as
  well. A box that is **not** an estimate — `frames.json`'s own, or one you pinned —
  is never moved: there the same search is reported as a finding, because a constant
  pixel inside the right box is the candidate's own figure sitting off, not framing.
- **Whether the frames' own box applies, and on which clause** — one `declared`
  line per set, whether the box was taken or refused, with the numbers that decided.
  Two clauses take it. **Coincident** is the original: the correction a fit at that
  box asks for is under a pixel, which separates a candidate in the frames' own
  coordinates from one in its own (those differ by an origin or a unit — tens to
  hundreds of pixels — not a fraction of one). **Extent-spread** is the tolerance
  issue #194 asked for: the correction reaches no further than 5 % of the
  reference's own content box *and* the fit leaves more than a pixel rms it cannot
  explain. A difference of units or of origin **is** a similarity and the fit
  absorbs it exactly, so a residual that size is a silhouette differing at the
  extremes — and the frames' own box is where the frames were drawn whatever a
  candidate's outline does out there. Without it, a candidate whose setup box lands
  on the reference's to the pixel was refused for a few per cent of extent and paid
  a fitted framing for it: rung 7 was refused on all twelve sets and reads better on
  every one in the declared box, by 0.28 to 2.01 MAE. ⚠️ Both halves are load-bearing
  — the residual test alone takes a rig 300 units away, whose content box is
  truncated by the box it is being probed in and whose fit is therefore garbage.
  When the tolerance engages the report says so by name, with the reach it stayed
  inside and the residual it stood on.
- **The whole shot, against the contact sheet** — a set that ships a couple of
  stills and folds every sampled frame into one `contact.png` (rung 2's do,
  spineboy's `@30fps` sets do) used to be compared on the stills alone, honestly
  reported and empty behind: nothing at all was measured about the frames in
  between. `check` now samples the candidate at the set's own rate and compares it
  against the sheet's own tiles, whose grid it measures off the sheet (issue #36).
  MAE only, and a sheet that is not a grid of those frames is refused by name.
- **Per-frame change** — how many pixels each side moved since **its own** previous
  frame, compared against each other. It is the only measure here that looks at the
  relation between two frames rather than at one, and it is what catches a held pose
  the candidate does not hold, or a one-frame event that never fired: both are cheap
  in every individual frame and invisible to an aggregate.
- **Per-slot drift** — where each of the candidate's own slots landed against the
  reference frame, in pixels. MAE says *how wrong*; a slot's drift says *which
  part, which way, how far*. Where the reference merged two parts into one blob —
  the trap [AUTHORING §8](AUTHORING.md) opens with, and it counts as merged
  even when one part is most of the blob (issue #37) — the slot is
  template-matched against its own rendered pixels instead, with a confidence; and
  where nothing inside the distance that slot could plausibly have moved matches
  it, the answer is **no match** rather than a number about some other part.
- **Per-chain attribution** — the same two, rolled up onto the unit an author
  repairs. `check` cuts the **candidate's own** bone tree into chains at its branch
  points and prints, per chain per set, the worst slot drift with its slot and
  frame, the mean, the error per pixel inside it, and its share of the set's error
  over the reference's own drawn pixels — plus one rollup line per chain across
  every set. A figure with a dozen joints otherwise collapses to one number a shot,
  and *"motion ✗"* over sixteen shots does not say which limb to re-key.

🔒 **It never reads the reference skeleton.** It opens the candidate and PNG
frames, and nothing else: every reference-side read goes through one guard that
refuses a path which is not a `.png` or the frame set's `frames.json`, and the
selftest makes that guard fire. That is what lets `check` sit *inside* an
authoring loop where `bench` cannot — running it as often as you like does not
stop a run being an authoring run.

⚠️ **`--texture-from` and `--atlas` are not the same flag, and the difference is
the whole of issue #199.** `--atlas` names the **candidate's own** atlas for the
case where it does not sit beside the skeleton, and pointing it at a foreign one
re-loads the skeleton against that atlas — a region attachment's quad is derived
from the region rectangle (`RegionAttachment.computeUVs` insets it by the trim
offsets and sizes it against `orig`), so a `rotate:` or a trim in the substituting
pack re-seats the **geometry** as well as the texels. On rung 7, whose pack is
`rotate: 270` and whose non-square regions `TextureAtlas` transposes only at 90,
that swap sends the reported MAE *up* on every set — and a texture floor cannot do
that, because a coarser texture can only ever explain error. `--texture-from`
copies every world vertex across untouched and swaps only the page and the UVs,
remapping them through the drawing's own coordinates, so the same point of the
artwork lands at the same world position on both sides and the two renders differ
by texels alone. It is fenced to each substituting region's own rectangle as well,
because a trimmed pack keeps only the drawing's opaque part and art-space outside
it maps onto whatever was packed next door.

The candidate is framed **by its own drawn pixels**, not by the reference's world
box. A candidate is authored in its own coordinate system and under the ladder's
honesty rule could not be authored in any other, so both sides are measured the
same way — the content box of what each actually draws — and one similarity
transform, fitted by least squares over every edge of every frame, carries the
candidate's onto the reference's. Two skeletons depicting the same shot land on the
same pixels whatever coordinates they were authored in, an invisible transparent
margin cannot move the result, and no single quad corner in a single frame can set
the scale for a run.

There is no pass mark **in the tool**, for the same reason `diff` has none. The
ladder's pass definition and its thresholds are a document read by a person over
the whole table — [docs/GATE.md](https://github.com/rig-c/core/blob/main/docs/GATE.md) states the clauses and
[docs/LADDER.md](https://github.com/rig-c/core/blob/main/docs/LADDER.md)'s *Operating rules* derives them — and not an
exit code either command could produce.

### Benchmark ladder — the rungs, and where they stand

🎓 **The ladder is complete, 2026-08-28.** All eight numbered rungs and the
spineboy graduation exam are cleared and hold under the current gate, **v2.4**, every clause PASS or SKIP:
worst attributable slot drift **5.5550 px** against a 6.0 px bar — a **1.0801×**
margin, the thinnest of the ladder's **G2** figures, and **G5**'s 1.0376× is thinner
still — and **0 of 124** frame-change disagreements. Recompiling the same spec in a
different session reproduced every field of the measurement record **to the digit**.
The rungs stay in place as regression gates.

🗓️ **One rung's pass was withdrawn and restored on 2026-09-02, and both are dated
facts.** `check`'s extent tolerance ([PR #254](https://github.com/rig-c/core/pull/254))
changed which box a set is measured in, and rung 7's stored candidate failed **G2**
under it — `cape-back` draws in all twelve sets, is attributable in none, and no
read-down ground survived the framing change. **Gate v2.3** then answered the two
clause questions that exposed: a read-down names the framing of every figure it
cites and prefers a framing-independent quantity to a per-pixel one, and a slot
whose attributability has a **measured** ceiling below a calibrated bar reads down
provided everything observable about it is independently verified strict. Rung 7's
third attempt clears on those grounds, on the candidate it already had, and the
sweep of every standing candidate under the new gate moved **no other verdict**.
**Rungs 1–6 and 8 and the graduation exam were unaffected throughout**: each keeps
its pass on the clause, and recompiling a stored candidate reproduces its record
**to the digit within one gate**. Across an instrument change the digits do move,
and the record says where — the graduation **G2** figure went 5.5491 → 5.5544 →
**5.5550 px** over the #301 sampler repair and v2.4's adoption of the re-rendered
reference basis, while **0 of 124** held throughout. Both verdicts, and the sweep
of every candidate under the gate of the day, are in [LADDER.md](LADDER.md)'s
*PR #254 instrument re-inspection* and *gate-v2.3 re-inspection*; the standing
figures quoted above are from its *gate-v2.4 re-inspection*, which is the current
sweep.

⚠️ **What that certifies, stated exactly.** That **the tool, the guide and the
protocol reach the bar across a bounded series of honest attempts, each residual
diagnosed and fixed** — spineboy took five, and the last inherited its
predecessor's specs under the run protocol's inheritance clause. It is **not**
that an agent authors a spineboy-scale rig from the brief alone in one run: the
ladder has not demonstrated that, and each row records which of the two it is.

**[docs/LADDER.md](https://github.com/rig-c/core/blob/main/docs/LADDER.md) is the live ledger**: the rung order
(blockers → rung 3 first → 1 · 2 · 4 · 5 → 6 → 8 → 7 → spineboy), what each
rung gates on, how a rung is scored, the honesty rule that keeps the reference
export away from the authoring agent, the operating rules — what a pass is, and
the numbered thresholds of the current gate (**gate v2.4**, stated in [docs/GATE.md](https://github.com/rig-c/core/blob/main/docs/GATE.md)) that decide one — and a status table. Run
one with:

```bash
bun cli.ts bench 3 --candidate path/to/candidate/spine
```

`bench` validates the candidate under `--profile spine`, diffs it against that
rung's reference export, and prints both. It exits non-zero only when validation
fails: the diff has no threshold, because there is no rung score. Add
`--frames <dir>` and it folds in the `check` table below, so a ladder row carries
fidelity as well as structure.

#### What the rungs need

[docs/SURVEY_2026-08-22.md](SURVEY_2026-08-22.md) surveys the full Spine 4.3 export surface against what
rigc emits and against what the nine examples measurably use (`bun run bench:usage` regenerates the
counts). Three blockers sat *before* rung 1: **B1**, the bone tree was code in `archetype.ts` rather
than data, so no example could be expressed at all; **B2**, `A16`'s regex rejected the `"4.3.75-beta"`
that every example declares; and **B3**, every example ships a **packed** atlas (13–50 regions per
page) against rigc's one-part-per-page model, which `A06` enforced unconditionally. **B1 and B2 are
closed**; B3's validator half is (the packed-atlas clauses live behind `--profile`, above) and its
emitter half closed on 2026-09-03 (issue #4): `build --pack` packs the loose parts onto shared pages
and `build --atlas-in` resolves them against a pack somebody else made — both opt-in, both narrow
(no trimming, no rotation, no scaling), with the limits in
[AUTHORING §0.1–§0.2](AUTHORING.md). Ordered gap list in Part 4 of that document;
live status, and B1's proof, in [docs/LADDER.md](https://github.com/rig-c/core/blob/main/docs/LADDER.md).

## Looking at a rig — `rigc render` and `rigc preview`

The validator cannot see a wrong pose and says so honestly; `check` can, and needs
reference frames a first user does not have. That left looking as the one thing
the package could not do, and these two commands are it. Both take a compiled
artifact — the directory `build --out` wrote — and neither needs a reference, a
clone or a server:

```bash
rigc render  --candidate spine [--animation <name>] [--fps 12] [--max 256] [--out render/]
rigc preview --candidate spine [--animation <name>] [--out preview.html]
```

`render` writes `render/<animation>/f0000.png…` plus a `contact.png` grid of every
frame and a `frames.json` sidecar describing the world box they are pictures of —
the same frame-set shape `bench/render_reference.ts` writes and `rigc check`
reads, drawn by the same rasteriser, so the output is a frame set rather than a
pile of images. `preview` writes one self-contained `.html` that plays the
artifact in the official Spine Web Player, with the skeleton, the atlas and every
page embedded as data URIs; the player is loaded from unpkg rather than copied, so
the first open needs a network and rigc redistributes nothing Esoteric Software
owns ([NOTICE.md](../NOTICE.md)).

They complement each other rather than overlap. `render` is offline, deterministic
and measurable — its pixels are the ones `check` reports on. `preview` is the
interop proof: what plays there was played by Esoteric's own runtime, not by ours.

🎞️ **Authoring the movement that these two show you** — key poses, in-betweening,
and how to spread candidates so a ballot informs — is
[docs/MOTION.md](MOTION.md).

### Letting someone choose — `rigc vote`

Sometimes looking is not enough on its own, because there is more than one
candidate and no instrument that can separate them: a pose fit with two local
optima that measure the same, a key density that is a matter of taste, a first
draft with no reference to compare against. `vote` is the deliberate human gate
for exactly that residue, and only for that residue.

```bash
rigc vote --candidate spine-a --candidate spine-b [--animation <name>] [--out ballot.html]
rigc vote --record vote-<id>.json [--ballot ballot.html] [--ledger votes.jsonl] [--again]
```

The first form writes one self-contained `ballot.html`: two to four compiled
candidates side by side, each in its own official player, looping, with one
button that restarts them together. The panes are labelled `A`, `B`, `C`, `D` and
show **no paths** — a voter who can see that `B` came out of `experiments/` is not
comparing pictures any more — so the path→label mapping lives in a manifest
embedded in the same file and is never rendered. A voter picks a winner or says
"tie / no preference", optionally writes a sentence, and copies or downloads a
small JSON result the page prints the filename for.

The second form checks that result against the ballot's own manifest and appends
it to an append-only JSONL ledger. Nothing is trusted: the result carries a
content **digest** per candidate, and a result whose digests are not this
ballot's, whose choice is not on it, or whose reason code contradicts its choice
is refused by a named rule (`V02_CANDIDATE_DIGESTS_ARE_THE_BALLOTS` and friends)
with nothing appended. A second vote on one ballot needs `--again`.

The loop it is built for, in one line: **the agent compiles N candidates that all
pass the gate → `rigc vote` writes the ballot → a human opens it, watches, and
votes → `rigc vote --record` checks the answer into `votes.jsonl` → the agent
reads the ledger and proceeds.** Compile first, vote last: a candidate reaches a
ballot only because it already validated green, so the human is never asked to
read JSON, a diff or a spec.

Three properties are worth stating because they are what make the ledger usable
by the next agent rather than by a reader:

- **A tie is a recorded outcome, not a missing one.** The ledger distinguishes a
  ballot with a winner, a ballot the human called a tie, and a ballot nobody
  opened. `both-unacceptable` is the tie that means *propose again*, and it is
  unreachable if ties are not recordable.
- **The winner is a digest, not a label.** `B` means nothing outside one ballot;
  the digest identifies the same pixels anywhere. Every line also carries its
  `coverage` — which candidates the vote compared — so completeness is
  computable rather than assumed.
- **Every line carries a reason code** from a closed enumeration, and the
  enumeration is enforced: "tie, because this one is better" is refused.

Same player, same posture as `preview`: referenced from a CDN, never vendored,
and the file contains only your own art ([NOTICE.md](../NOTICE.md)).

## Reading a pose you were given — `rigc pose`

```bash
rigc pose --images parts/ --frame poseA.png [--out pose.json]
```

Every command above takes something you authored and tells you about it. This one
runs the other way: it takes a **picture the user already has** — one key pose —
and reports where each loose part PNG sits in it, so an agent can write those
coordinates into a rig and a motion **by construction** and spend its effort on the
part no instrument can measure, the movement between two poses.

```
  AMBIG  arm.png      x=   28.4  y=   56.2  rot=  -35.0°  scale=1.117  residual=0.0227  unexplained=  1%
                      alt 2: x=   63.0  y=   56.2  rot=   35.2°  scale=1.111  residual=0.0229  unexplained=  1%
                      ambiguous: part is 10x30 px (span 33.5 frame px, opaque 1) with texture 0.0291, detail 0.873; 31 candidate(s), best 0.0227, next 0.0229, spread 0.0002 — above the measured floor (AUTHORING §11.5: detail 0.5, measured from 24 px up), so size and texture do not explain this; every placement in the margin is at the best's scale (within 0.55%, bar 2%) and in another place (the nearest 1.03 span(s) away, bar 0.45), which is the part — or a near-copy, such as a left/right pair cut from one drawing — drawn more than once: read the placements as an unordered set and order it across frames (MOTION.md §2.2 🔀); a --rotation window that excludes one place chooses the answer rather than measuring it
  PLACE  ball.png     x=   45.7  y=  104.6  rot=    0.0°  scale=1.141  residual=0.0226  unexplained=  4%
                      rotation is a FREE degree of freedom — the 0° above is a placeholder
  REFUSE foreign.png  x=   48.7  y=   76.4  rot= -139.9°  scale=0.679  residual=0.4254  unexplained=100%
                      no-match: foreign.png: the best placement found has residual 0.4254, above --max-residual 0.25; part is 20x20 px (span 13.6 frame px, opaque 1) with texture 0.1404, detail 2.807; 18 candidate(s), best 0.4254, next 0.4254, spread 0.0000 — below the measured floor (AUTHORING §11.5: detail 0.5, measured from 24 px up): smaller than the smallest size the floor was measured at, so nothing measured says pose can place it; that says nothing about whether the cut is right
  AMBIG  torso.png    x=   45.6  y=   65.5  rot=    0.0°  scale=1.121  residual=0.0930  unexplained= 24%
                      alt 2: x=   44.2  y=   55.8  rot=  -17.0°  scale=0.500  residual=0.0937  unexplained= 32%
                      ambiguous: part is 24x36 px (span 40.4 frame px, opaque 1) with texture 0.0295, detail 1.063; 20 candidate(s), best 0.0930, next 0.0937, spread 0.0007 — above the measured floor (AUTHORING §11.5: detail 0.5, measured from 24 px up), so size and texture do not explain this; either the frame holds more than one place this part fits, or every candidate missed the true one — a narrower --scale or --rotation window around what you know of the part tells the two apart
```

📎 **Where those figures come from, so the next reader can re-run them rather than
trust them**: the selftest's own pose fixture (`buildPoseFixture` in
[`selftest.ts`](../selftest.ts)) — five plates posed by a rig and rendered into one
91×137 frame — read back with `pose --images parts --frame poseA.png`. The rows
above are a trim: the `head`, `blank` and `toobig` parts, the anchor-grid lines and
the trailing alternates are cut for width, and the two refusals those two parts
carry are the last bullet below. The `ambiguous:` lines and the tail of the
`no-match:` line are the reading `pose` has given every refused or ambiguous part
since [#857](https://github.com/rig-c/core/issues/857) — the part's size, texture
and candidate spread against the floor [AUTHORING §11.5](AUTHORING.md) measures; no
residual above moved with them.

📏 **Instrument re-baseline, 2026-09-03 — [#306](https://github.com/rig-c/core/issues/306).**
`pose`'s objective now interpolates its frame premultiplied, so a tap across a
silhouette no longer charges a part for the ground's colour. Three separate
changes have moved this block since it was first printed and only the last is
#306's, which is exactly why it is dated: the fixture's arm plate grew from 10×26
to 10×30 with `chainfit` ([#286](https://github.com/rig-c/core/pull/286)) and
that re-framed the whole picture, `bilinear` moved to premultiplied for the
*renderer* ([#301](https://github.com/rig-c/core/pull/301)) and re-rendered it,
and #306 moved the objective that reads it. ⚠️ **A residual from either side of
those dates is not the same measurement.** #306's own contribution here is small
and one-directional: `arm.png` 0.0240 → 0.0227 — it is the part that crosses the
torso's edge — while `ball`, `head`, `torso` and `foreign` do not move at four
decimals at all.

🚨 **Nothing here is a score, and no pass bar attaches to any of it.** `check` and
`bench` measure a build against a reference, so their numbers mean *how close*. A
pose frame is not a reference — it is a **given condition**, and once the spec
states those coordinates there is nothing left to be close to. The residual says
how far to trust a placement and where two answers are equally good, which is a
different job and needs the opposite defaults:

- a part that matches nowhere is **refused by name**, with its best guess still in
  the JSON — a refusal tells you not to trust a number rather than hiding it;
- two near-equal optima are reported as **both**, flagged `ambiguous`, never
  silently resolved. Two identical limbs look exactly like that;
- a part whose rotation genuinely does not matter — a ball — reports rotation as a
  **free degree of freedom** rather than as a failure;
- a part the canvas cannot contain at any tested scale, and a part with no material
  in it at all, each get their own named refusal.

⚠️ **Residuals degrade under occlusion and there is no depth solver here.** A part
drawn behind another has the occluder's pixels where its own should be, so its
residual rises at the *correct* placement; `unexplained` is the share of the part
that disagrees, and a middling residual beside a high `unexplained` usually means
*right place, seen through something else*. The output carries its own `caveats`
block saying so. Fields, coordinate contract and the rest of the limits:
**[AUTHORING.md §11](AUTHORING.md)**.

## Run viewer — watching a *run* instead of reading it

🔎 **This is the ladder's instrument, not the way to look at your own rig** — that
is the section above. The viewer is reference-bound and repository-bound, and it
deliberately never ships.

`check.txt` says a candidate's worst frame is f0012 at 56 MAE. The viewer shows
you f0012.

```bash
bun run viewer      # http://localhost:5173
```

Pick a run, a candidate and an animation. The left pane plays the candidate's
emitted `skeleton.json` — rendered by **[spine-html](https://github.com/rig-c/play)**,
plain DOM, one CSS matrix per slot — and the right pane shows the reference
frames for the same animation from `bench/reference/`, indexed by the scrubber's
time at the frame set's own fps. Both panes use the world box the run was
measured in (`bench.json`'s `check.viewport`, per frame set where the run framed
them separately), so the two pictures are comparable exactly as far as the
check's numbers say they are — and the pane label names which box that was.
Under them: `bench.json`'s section means and the framing plus per-animation
summary from `check.txt`.

It is also the smallest end-to-end proof the two modules have. rigc emits Spine
data; spine-html consumes Spine data; neither is checking its own work when the
skeleton one wrote comes up animating in the other.

Every run under `bench/runs/` is listed, including the ones that predate a
convention — those are greyed out with the reason (a missing atlas page usually
means `bun run fetch-examples` has not run) rather than dropped, because the
ladder's history is part of what the viewer is for.

🚫 **There is no build, and that is deliberate.** The viewer reads the working
tree: the runs, the reference frames, and `examples/`. Both of the last two carry
Esoteric Software's image data — `examples/` fetched and never committed, the
reference frames committed under each example's own redistribution grant with its
`license.txt` beside them — and **non-commercial either way** (see
[NOTICE.md](../NOTICE.md)). A bundle would copy those pixels into a distributable
artifact, away from the licence files that condition them. So there is one mode, `vite dev` on localhost, the dev
server serves nothing outside `bench/` and `examples/`, and `vite build` fails
on purpose. `viewer/` is not in `package.json`'s `files`, so it never ships
either; it is also outside the root `tsconfig.json` (it needs the DOM lib, which
the rest of the repository must not have) and is type-checked on its own with
`bunx tsc -p viewer --noEmit`. `bun run lint` covers it like everything else.

## What exists today

**Inputs — three files, one domain each.** Only the middle one is required.

- A **cut manifest** (`FaceManifest` in [`src/types.ts`](../src/types.ts)) owns
  **measured art**. Crop rectangle, the base plate, one entry per part with its
  offset and size, mask polygons, the state machine, bone anchors, and — for a
  joint cut — the entry point, the insertion axis (`deg` in screen degrees plus a
  `unit` vector, cross-checked against each other), stroke amplitudes and any
  measured ceilings. The compiler **never re-measures art**: every number here is
  produced by a measuring tool or by the pipeline that cut the plates, and rigc
  only reads it. **Optional** — a skeleton with no measured art behind it (any of
  the benchmark examples) has none.
- A **rig spec** (`RigSpec` in [`src/rig.ts`](../src/rig.ts), `spec: "rigc-rig/1"`)
  owns **skeleton structure**: bones, slots, skins and their attachments, the 4.3
  typed `constraints` array, and the invariants the emitted JSON cannot state
  about itself. Its vocabulary is deliberately **Spine's own** — same concepts,
  same field names, same defaults, cited to `SkeletonJson.ts` line numbers — so an
  agent that has read Spine's documentation can author one without learning a
  second vocabulary. rigc's additions sit on top and are namespaced: `from` on a
  bone takes its position from the manifest instead of a literal that would drift
  away from the art; `image` on an attachment names a PNG and rigc measures it;
  `generator` on a mesh invokes a builder from `src/mesh.ts`; `invariants` carries
  the axis bone, the forbidden parentage, the mesh budget.
- A **motion spec** (`MotionSpec`, `spec: "rigc-motion/1"`) owns **time**: the rig
  it was authored against, named easing handles, setup overrides, a physics tuning
  table, and the animations — each with a declared duration, a loop flag, its
  tracks, and five timeline families that sit on the animation rather than in `tracks`:
  `drawOrder` and `events`, which name no target at all, and `ik`, `transform`
  and `deform`, whose keys carry named fields instead of one value (an IK mix and
  softness, six transform mixes, a sparse run of vertex offsets) — which is also
  where 4.3 writes each of them. The `path` and `slider` groups are ordinary
  tracks, because the format gives them a timeline name under the constraint the
  way `physics` has one, and a key that carries one value fits that.

**Outputs — two files per cut**, written to the cut's `out` directory:

- `skeleton.json` — Spine **4.3** skeleton data. Bones, slots in draw order, the
  skins with their attachments and the bones and constraints each one activates,
  animations, and constraints in the 4.3 single `constraints` array — all five
  types of them.
- `skeleton.atlas` — by default a **one-part-per-page** atlas: every region covers
  its whole page, `pma: false`. That convention is what makes the
  region/attachment/filename join key checkable exactly rather than by convention.
  `--pack` writes the other shape — the parts arranged onto shared pages, emitted
  beside the pair as real PNGs — and `--atlas-in` re-emits a pack somebody else
  made; the join key is unchanged either way, because a region's name is still the
  PNG basename ([AUTHORING §0.1–§0.2](AUTHORING.md)).

**Where the three meet.** A manifest part joins a rig slot by its `rig_slot` field
(falling back to `slot`), and that slot's position in the rig's `slots` array **is**
the draw order — a manifest whose `draw_order` numbers disagree is a compile error
rather than a silent overrule. A slot filled by both a manifest part and a rig skin
is likewise refused, as is a setup pose declared in both the rig and the motion
spec: one fact, one author. A missing anchor is a compile error by design, so that
copying another cut's numbers is not the path of least resistance.

Two things are code and stay code, because neither is a table of numbers: the
**mesh generators** in [`src/mesh.ts`](../src/mesh.ts), which encode a deformation
model (what is pinned, what may move, how authority falls off), and the
**coordinate contract** in [`src/transform.ts`](../src/transform.ts).

### The validator

[`src/validate.ts`](../src/validate.ts) parses the emitted artifacts with `spine-core`
and then runs 50 named assertions over the loaded skeleton. Each one exists because
the failure it catches is **silent**: the file loads, animates, and lies.

Assertions whose data is absent are reported as **SKIP**, never folded into the pass
count — an assertion with nothing to check has not checked anything.

#### Profiles — "wrong" versus "not how we do it here"

Not all 50 rules are about Spine. Some are about **spine-html**, the renderer this
compiler was built to feed, and about one project's frame budget; they fire on real,
correct, editor-produced Spine data, because the official example projects carry
unweighted meshes, 116-triangle meshes and packed atlases —
all valid, none of them things spine-html will draw. Others are about **rigc's own
rigs** and mean nothing at all on a skeleton rigc did not compile — they read the
rig spec's `invariants` block, and they **SKIP** when it is absent rather than
counting as passes.

So `validate` and `build` take a `--profile`:

| Profile | Runs | For |
| --- | --- | --- |
| `spine` | the 36 validity rules | **the default.** Is this valid Spine 4.3 that any runtime plays correctly? |
| `rig-play` | all 50 — those 36 plus 6 renderer and 8 archetype | Opt-in. Is this a rig *this* project can ship? |

Those are the two numbers `src/validate.ts` exports rather than states in prose:
`ASSERTION_NAMES.length` is 50 and `assertionCountForProfile('spine')` is 36, so a
control can count them instead of quoting a figure that goes stale the next time one
is added.

`spine` is the default because it is the question this package's output answers:
the artifact imports into the Spine editor and plays in any 4.3 runtime, and
that is what the 36 validity rules are about. The other 14 are somebody's policy
— one renderer's, one canvas budget's, one compiler's own formations' — and a
rig arriving from anywhere else has no stake in them. Ask for them with
`--profile rig-play` when you want them.

The **Profile** column below says which is which — `both` = validity, `renderer` and
`archetype` = `rig-play` only, and **`both ◑`** = a mixed assertion whose validity
half always runs while its policy clauses are gated (A06's `pma`/rotation/full-page
clauses and A20's "a mesh must be weighted at all"; A08 carried "the two names must be
identical" until [#574](https://github.com/rig-c/core/issues/574) retired it as a
rule no renderer performed). A report always names the profile it ran and lists what that profile left
out, on `PROF` lines: a `--profile spine` green means *valid Spine*, never *passes
the renderer policy*.

| Assertion | Profile | Holds that |
| --- | --- | --- |
| `A00_ROUNDTRIP_PARSE` | both | `spine-core` parses the skeleton and the atlas without throwing |
| `A01_NO_LEGACY_TOPLEVEL_CONSTRAINT_ARRAYS` | both | no 4.1/4.2-shaped `physics`/`ik`/… array — 4.3 folds them into one typed `constraints` array, and the old shape loads clean while the constraint vanishes |
| `A02_NO_BONE_TRANSFORM_KEY` | both | no bone uses 4.0/4.1's `transform`; 4.2 renamed it `inherit`, 4.3 kept it, and the old key silently falls back to Normal inheritance |
| `A03_REGION_WIDTH_HEIGHT_FINITE` | both | every region attachment loaded a finite, positive width and height (a missing field loads as NaN, with no error) |
| `A04_MESH_TRIANGLES_AND_ENCODING` | both | triangles are a multiple of 3, indices are in range, and the vertex array's encoding agrees with the UV count |
| `A05_CURVE_ARRAY_LENGTH` | both | curve arrays carry 4 numbers per value channel and hold no non-finite value; timelines that cannot take a curve do not carry one. Covers all eleven 4.3 timeline groups — bone, slot, ik, transform, path, physics, slider, deform, drawOrder, drawOrderFolder, events |
| `A06_ATLAS_PAGE_SIZE_MATCHES_PNG` | both ◑ | each page's declared `size:` matches the PNG on disk, and its region covers the whole page |
| `A07_ATLAS_TEXT_SHAPE` | both | the atlas text obeys the parser's whitespace rules — no stray indentation on region names, no blank line splitting a page block |
| `A08_REGION_NAMES_MATCH_ATTACHMENTS` | both | every attachment resolves to a region the atlas holds, and no region name carries stray whitespace. It has no opinion about how the attachment is *spelled*: a placeholder may differ from the region its `path` names, which is what `path` is for |
| `A09_ANIMATION_DURATION_MATCHES_SPEC` | both | the compiled duration equals the duration the spec declared (skeleton JSON has no duration field — the last key *is* the duration). Two tolerances: a frame of slack for a duration declared long, but a key landing *past* the declared end is held to the grid the times are stored on, because nothing playing the animation ever reaches it. SKIPs without a motion spec |
| `A10_NO_NAN_AFTER_STEPPING` | both | stepping every animation frame by frame produces no NaN anywhere in the pose |
| `A12_NO_DARK_COLOR` | renderer | no dark / two-colour tint on slots or timelines — parsed, then ignored |
| `A13_MESH_BUDGET` | renderer | no more mesh slots than the rig's `invariants.meshSlots`, and no mesh past its `invariants.meshTriangles`. SKIPs when the rig declares neither |
| `A14_NO_FULL_FRAME_MESH` | renderer | no mesh spans the whole stage (a full-frame mesh is a full-frame canvas that can never dirty-skip). SKIPs when the skeleton declares no stage |
| `A15_IDLE_NO_MESH_BONE_KEYS` | renderer | `idle` keys no bone that drives a mesh, directly or as its control bone |
| `A16_SKELETON_VERSION_4_3` | both | the `skeleton.spine` version label is on the 4.3 line (the parser never checks it) |
| `A17_ATLAS_PAGE_FILES_EXIST` | both | every page the atlas declares is a file on disk |
| `A18_DETERMINISTIC_EMIT` | both | a second, independent compile of the same inputs is byte-identical. SKIPs when re-gating artifacts already on disk |
| `A19_OVERLAY_PNGS_HAVE_ALPHA` | renderer | every overlay part draws a transparent pixel somewhere, and the **texels** say so on both routes ([#777](https://github.com/rig-c/core/issues/777)): a loose page is read whole, a region on a shared page over its own rectangle. The header is the fast negative — a file with no alpha channel (colour type 4 or 6) **and** no `tRNS` chunk, which is where indexed and greyscale PNGs keep theirs, is refused unopened. A file that could be transparent and is not is refused by its texels — `is opaque in every one of its 200x80 texels` … `its file can hold transparency — colour type 6 (truecolour + alpha) carries an alpha channel — and no texel uses it` — so an RGBA part at full alpha everywhere fails loose exactly as it fails packed. Only the base plate may be opaque: the one the build names (a cut manifest's part whose window is the crop), or, when it names none, the region covering the stage. With neither — a stageless rig-spec build — an opaque part is refused with *"the build names no base plate. Either would decide it"*, and the sentence names both ([#770](https://github.com/rig-c/core/issues/770)) |
| `A20_MESH_WEIGHTS_COHERENT` | both ◑ | every weighted vertex has at least one bone, no negative weight, bone indices in range, and each vertex's weights sum to 1. `rig-play` also requires that a mesh be weighted at all and that no binding sit at weight 0 |
| `A21_MESH_RIM_PINNED` | archetype | a ring mesh's rim vertices are pinned to the anchor bone and its hull is a real ring; a ribbon's entry row stays put; a contour's outline — which is every vertex it has — is pinned. **SKIPs on authored geometry** — rigc did not place its rim |
| `A22_MESH_UVS_IN_UNIT_RANGE` | both | every UV lies inside its region |
| `A23_PHYSICS_CONSTRAINT_EFFECTIVE` | both | each physics constraint actually drives a component, is not left muted — resting at `mix: 0` with no animation keying that `mix` above 0 — has non-zero mass, and has `damping < 1` so it settles |
| `A24_AXIS_SPACE_STROKE` | archetype | the stroke is authored in **axis space** — no screen-space Y component anywhere in the axis subtree, and no keys at all on the axis bone (its rotation is the one per-cut setup value) |
| `A25_DETACHED_BONE_PARENTAGE` | archetype | bones that must stay detached are not parented under a moving part |
| `A26_SLOT_DRAW_ORDER` | archetype | the slots array — which *is* the draw order — matches the rig spec's slot table |
| `A28_RIBBON_ROWS_SHARE_WEIGHTS` | archetype | both vertices of a ribbon row carry the same bones at the same weights, so the strip can lengthen and curve but never widen. **SKIPs on authored geometry and on contour meshes** — rigc did not pair the first's rows, and the second is one silhouette loop |
| `A29_STROKE_WITHIN_CONTACT_DEPTH` | archetype | the stroke plus any inward keys stays within the cut's measured contact depth (skipped when the manifest declares none) |
| `A30_STROKE_WITHIN_CAP_CONTAINMENT` | archetype | the stroke stays within the cut's measured containment ceiling, and nothing in the axis subtree scales — a scale key changes the contour the ceiling was measured on (skipped when the manifest declares none) |
| `A31_DRAW_ORDER_OFFSETS_RESOLVE` | both | every draw-order key resolves to a real permutation: known slots, one entry per slot, each landing inside the slots array, offsets in ascending slot order. The **only assertion that runs before `A00`** — descending offsets make `readDrawOrder`'s forward-only cursor spin rather than return, so the round trip is refused by name instead of attempted |
| `A32_EVENT_KEYS_RESOLVE` | both | every event key fires an event the skeleton declares, no key sits earlier in time than the one before it, and `volume`/`balance` appear only on an event with an `audio` path. Only the first of those is loud in the parser; the other two load clean and drop the firing or the value in silence. SKIPs when no animation carries an event timeline |
| `A33_VERTEX_ATTACHMENT_GEOMETRY` | both | every bounding box, clipping polygon and path states a `vertexCount` that agrees with its vertex array, its weighted run decodes to that many vertices with bone indices in range, a clipping `end` names a slot that exists, and a path's count is a multiple of 3 with a strictly increasing `lengths` array. Every one of those loads clean: a missing count reads as zero and empties the polygon, a missing end slot makes the clip run to the bottom of the draw order, and a path whose count is not a multiple of 3 walks curves that straddle its knots. SKIPs when the skeleton carries none of the three |
| `A34_CONSTRAINT_TIMELINE_TARGETS` | both | every `ik` / `transform` / `path` / `slider` timeline names a constraint of that type and carries at least one key. The name-and-type miss is loud in the parser (`IK Constraint not found`) and this one says which constraints the skeleton *does* have; the empty key array is silent — `readAnimation` reads key 0, finds nothing and skips the timeline without a word. SKIPs when no animation carries one |
| `A35_DEFORM_KEYS_FIT_THE_ATTACHMENT` | both | every deform key's run lands inside the attachment's own deform array, holds finite numbers, and names a skin/slot/attachment triple that resolves. The array is one `x, y` pair per **vertex** on an unweighted attachment and one per **bone influence** on a weighted one, so its length is measured from the attachment rather than assumed. An overlong run is the format's quietest defect: `Utils.arrayCopy` into a `Float32Array` drops everything past the end, so part of the mesh deforms and it looks nearly right. The run's *endpoints* are not checked for pair alignment — the runtime copies at a raw index and a trimmed editor run starts mid-pair (issue #262). SKIPs when no animation carries a deform timeline |
| `A36_PATH_CONSTRAINT_EFFECTIVE` | both | every path constraint follows a slot that some skin gives a path attachment, constrains at least one bone, and is either mixed in at setup or keyed above 0 by an animation — a `mix` timeline keying 0 only is no rescue (#752). The first is the quietest failure in the constraint half of the format: `PathConstraint.update` opens with `if (!(attachment instanceof PathAttachment)) return`, so a constraint aimed at a slot showing a region loads, appears in the update cache, reports the mixes it was given, and moves nothing at all. SKIPs when the skeleton declares no path constraint |
| `A37_SLIDER_CONSTRAINT_EFFECTIVE` | both | every slider applies an animation that carries at least one timeline, does not loop a zero-length one, does not read a bone property at `scale: 0`, and is either mixed in at setup or keyed above 0. A slider is the only constraint that applies an **animation**, so its failures are about that animation: an empty one changes nothing, and looping a zero-length one computes `duration + (time % duration)` and applies the animation at **NaN**. SKIPs when the skeleton declares no slider |
| `A38_SKIN_MEMBERS_ARE_SKIN_REQUIRED` | both | a bone or constraint a skin activates is `skinRequired`, and everything `skinRequired` is activated by some skin. Two halves of one switch that live in two places — the member's own `skin: true` and the skin's list — and either half alone is dead data in silence: listed without the flag, the object is active under every skin and the list changes nothing; flagged and listed nowhere, it is inactive under every skin there is. The artifact is internally consistent either way, which is why nothing else can see it. SKIPs when no skin activates anything and nothing is `skinRequired` |
| `A39_DEFORM_KEEPS_TRIANGLE_WINDING` | archetype | a `deform` key reverses a triangle's winding. Measured at the key's own time as the deformed mesh against the same posed bones with the deform cleared, so the bone pose — a mirror included — cancels and what is left is what the key did. A reversed triangle draws its texture backwards and the mesh has locally turned inside out; a *wrong projection* whose winding survives is correctly silent here and visible only to `check` against a trusted render. Not `validity`, and measured rather than assumed: an official `spineboy-pro` export reverses one of `hoverboard-board`'s 101 triangles, so a rule that fired on every skeleton would refuse correct editor output. `invariants.deformMayFold` exempts a slot that folds on purpose, and a key whose slot draws no pixels at that key's own time — alpha exactly 0, or another attachment shown — is measured and then passed over by name (issue #401): "draws its texture backwards" is false when nothing of it is drawn. The **spans between** consecutive keys are scanned as well (issue #403), because the runtime interpolates and a deform inside its fold angle at every key can be past it in between. And the FRAME it is posed in is the one the animation is reached in (issue #407): on a track when nothing applies it, otherwise once per **slider**, with that slider's mapping inverted and its bone driven until the runtime selects the key's own time — a slider picks the time, so the two are one number and posing them independently is a frame no playthrough contains — the fold fraction is a root of a quadratic in the interpolation parameter rather than a sampled search, and the time it names is then posed and measured, alpha included, exactly as a key is. SKIPs when no animation carries a deform timeline, when nothing keyed has triangles, when every mesh keyed is exempt, when every key measured draws no pixels and no span between them folds where anything is drawn, or with no rig info |
| `A40_SLIDERS_COMPOSE_ON_A_SHARED_TARGET` | both | two or more sliders whose animations key the same timeline, where one of the later ones is not `additive`. `Slider.update` applies its animation with `MixFrom.current` and that flag, and at `mix: 1` a non-additive apply writes the value outright — so the slider later in the `constraints` array wins the property and every earlier one on it is dead weight on every frame. Measured: two dials on one bone contributing 7.50° and 18.75° pose 18.75° at the default, 7.50° with the array order swapped, and 26.25° — the sum — when both are additive. It also fires when the shared timeline **cannot** be additive at all (a slot colour, an attachment swap, a draw order, a sequence ignore the `add` argument), because there `"additive": true` is not the fix and a message recommending it would be a green gate over the same dead axis. `validity` rather than policy: the arithmetic is the runtime's, not this project's. Three shapes are excluded structurally rather than by a threshold — a slider below `mix: 1` or with its `mix` keyed (the apply is then a lerp from the current pose, and a chain of those is a legitimate weighting), two `skinRequired` sliders no single skin activates, and two sliders on different properties. SKIPs when fewer than two sliders are at full authority |
| `A42_DRIVEN_CONSTRAINTS_UPDATE_AFTER_THEIR_DRIVER` | both | a slider whose animation keys a property of a constraint at or before it in the `constraints` array — which is the update order for every constraint kind, so the key is written after the only read of it and `Posed.resetConstrained` puts the pose back before the next frame. Measured: two dials where the second keys the first's `mix`, posed over 99 cells of both dials — in the declared order the driven dial moves the shared bone by up to 75.000000°, with the array entries swapped by 0.000e+0 against a float64 floor of 2.434e-13 (issue #658); and one dial against each other kind, posed at 6 positions in both orders — the constraint's own pose holds the same ramp either way while what it drives travels 0.000e+0 with the constraint declared first against 1.662e+1 (ik), 4.000e+1 (transform), 1.620e+2 (path) and 4.256e+2 (physics, over 30 frames) with it declared last (issue #665). The two indices equal is the same failure and is the one `A37` cannot see: it asks whether any animation keys the `mix` above 0, and a slider's own animation is one of them, so a slider muted at setup that keys its own `mix` up reported green and never ran. Two measured exclusions: a `physics` `reset` key never fires from a slider in either order, so no reorder repairs it; a physics timeline naming no constraint is every physics constraint declaring that property global, and those already run are refused. `validity` rather than policy: the update order is the runtime's. SKIPs when no slider drives a constraint, and names the absence |
| `A43_TWO_COLOR_TINT_LOADS_AND_POSES_AS_WRITTEN` | both | a two-colour tint the runtime does not hold as the file states it: a slot `dark` the parser drops (it takes the field through a truthiness test, so `""` is discarded in silence), a `dark` that is not six hex digits (fixed `parseInt` slices store `NaN`), an `rgba2` or `rgb2` timeline on a slot with no dark colour to pose — measured: `SkeletonJson` loads that file without complaint and the first `state.apply` throws `TypeError: null is not an object` inside `RGBA2Timeline.apply1` (and inside `RGB2Timeline.apply1`, measured the same way for #730), because `Slot`'s constructor allocates a dark colour only for a slot whose setup pose has one — or a key whose posed light or dark is not what it states, read by stepping the animation to the key's own time and comparing `appliedPose` to half a quantisation step (`1/510`). The required value is parsed independently of `Color.fromString`, so the check is not the parser agreeing with itself. `validity` rather than policy: every one of the three is a file the format admits and no runtime plays as written. An `rgb2` key's light colour is compared over its three channels, since it states no alpha. SKIPs when nothing declares a `dark` and nothing keys an `rgba2` or `rgb2` |
| `A44_LINKED_MESH_STATES_NO_GEOMETRY_OF_ITS_OWN` | both | a linked mesh — `type: "linkedmesh"`, or a `type: "mesh"` carrying `source`, which is the key the parser actually decides on — that also states `uvs`, `triangles`, `vertices`, `hull` or `edges`. `readAttachment` returns from the `source` branch before `readVertices` (`SkeletonJson.ts:582-586`), so nothing reads them and `setSourceMesh` fills the attachment with the source's arrays: measured on a forged skeleton, a link declaring 5 uvs and 3 triangles beside a 4-vertex source loaded the source's 4 and 2, and the whole gate was green. The detail names the attachment, every key, the `source` with the skin and slot the parser looks in, and both shapes. `width`/`height` are deliberately excluded — the source overwrites them too, but the parser reads them and the format carries them on a link. **SKIP** when no attachment links to another |
| `A45_SEPARABLE_COLOR_TIMELINES_OWN_THEIR_CHANNELS_AND_POSE_AS_WRITTEN` | both | an `rgb` or `alpha` timeline — the separable colour timelines, which pose part of a slot's colour and leave the rest — the runtime does not hold as the file states it. Two shapes, both parsing in silence: another colour timeline of the same slot and animation poses a channel this one poses (`rgba` beside `alpha`, which is what a converter leaves when it writes a separable `rgb` back as `rgba` next to the `alpha` it kept) — each poses its channels at every time, setup value included, so the one the file states later overwrites the other everywhere; or a key the pose does not reproduce, read by stepping to the key's own time — a colour that is not six hex digits loads as NaN, a repeated key time leaves one key read by nothing. The channel table (`SLOT_COLOR_CHANNELS`) is shared with the compiler's refusal of the same pair and held to the runtime's property ids by a selftest control. It is its own rule rather than a clause on `A43` because neither timeline poses a dark colour, and a rig with a `dark` and no separable timeline would have given such a clause a PASS for an absent subject. ⚠️ An `rgb` alone written as `rgba` with the setup alpha is a correct `rgba` and cannot be seen from the file. SKIPs when nothing keys an `rgb` or `alpha` |
| `A46_SEQUENCE_ATTACHMENTS_SHOW_THE_FRAME_THE_FILE_STATES` | both | a numbered image series the runtime does not show as the file states it — a `sequence` block with no `count` or a `setup` past the end, a key whose `mode` is outside the seven (loads as `hold`), whose `index` is fractional or past the end, whose advancing mode runs at an effective delay of 0 (`Infinity \| 0` is 0: it never advances), or that steps an attachment with no block — and then the pose: every key sampled mid-frame and the region shown held to the frame the file's statement gives, the arithmetic of `SequenceTimeline.applyToSlot` transcribed rather than read back. Measured on forged skeletons through spine-core 4.3.13, every one of those loads without a word (issue #729). `validity`: the arithmetic is the runtime's. SKIPs when no attachment carries a `sequence` and no animation keys one |
| `A47_IK_CONSTRAINT_NOT_MUTED_THROUGHOUT` | both | every ik constraint is either mixed in at setup or keyed away from 0 by an animation — a `mix` timeline keying 0 only is no rescue, a lifted Bezier between two keys of 0 is (#765). `IkConstraint.update` returns on `mix === 0`, so a constraint resting there that nothing keys loads, sits in the update cache and moves nothing. SKIPs when the skeleton declares no ik constraint |
| `A48_TRANSFORM_CONSTRAINT_NOT_MUTED_THROUGHOUT` | both | every transform constraint drives some property, and a mix of a property it drives is away from 0 at setup or on a value an animation poses (#765). The mixes of properties it does not drive are never read, which matters because a key that omits a mix reads it as 1. A negative mix runs, and the editor's own example exports rest five transforms at −1, so live is `!== 0`. SKIPs when the skeleton declares no transform constraint |
| `A49_PACKED_FOOTPRINTS_DO_NOT_OVERLAP` | renderer | no two regions on one page draw over each other: a pair is refused where the rectangles overlap **and** the footprints do — a mesh region's hull, from its UVs over the region's bounds, and every other region's rectangle — so a `--pack-shape polygon` page whose rectangles overlap outside the hulls passes ([#1099](https://github.com/rig-c/core/issues/1099)). For two rectangles it is the tiling clause `A06` held until then. SKIPs when no page carries two regions |
| `A50_STAGE_BOX_IS_THE_STAGE` | both | a rig that asks for its stage as a bounding box (`skeleton.stageBox`) carries one whose stored vertices are the stage's corners exactly and whose world vertices at the setup pose are those corners on the header's grid, read through spine-core's loaded skeleton and through the model document and rigc's core alike ([#1168](https://github.com/rig-c/core/issues/1168)). The header carries the setup-pose bounding box since 2.2.0, so this is how the stage travels in the files a consumer ships. SKIPs when nothing asks — every build without the field, and every export |
| `A51_BONES_LIE_ALONG_THEIR_DECLARED_AXIS` | both | a bone a rig holds to a line (`invariants.axes`) has its world x axis at the setup pose within the declared tolerance of the line through two named bones' world origins, as a line — so a blink keyed as `scaleY` squashes across a tilted face's eye line rather than along the page. Held whether or not an animation keys the bone, because a consumer writes it at run time; SKIP when nothing is declared |

## Usage

📘 **Writing a spec? Read [docs/AUTHORING.md](AUTHORING.md) first.** It is the
guide an agent rigs from: both input files with a complete minimal example each,
every field with its Spine meaning, the rules that decide what is emitted, the
build → read the report → fix → repeat loop, the map from every named failure to
the file that has to change, and the list of format features rigc refuses by name
so you do not spend a loop discovering them. It travels **inside the npm package**
too, so an agent working from an install has it on disk at
`node_modules/rig-c/docs/AUTHORING.md`.

Compile by spelling out the paths. `--manifest` is optional; `--images <dir>` says
where a rig spec's `image` references live (it overrides the rig's own `images`
field):

```bash
bun cli.ts build \
  --rig      path/to/my_rig.rig.json \
  --motion   path/to/my.motion.json \
  --out      path/to/spine \
  [--manifest path/to/manifest.json] [--images path/to/images]
```

By default, atlas page paths point back at the source art wherever it lives —
often outside `--out` — so add `--copy-images` when `spine/` itself needs to be
self-contained (zipped, committed, or handed off on its own): it copies every
referenced page PNG into `--out` and rewrites the atlas to match. `--pack` is the
other way to get there and gives you one texture instead of many; the two are
refused together, because a packed atlas does not reference the loose PNGs a copy
would bring along.

…or register cuts in a `cuts.json` and build them by name. Every path in the table
resolves **relative to the `cuts.json` file itself**, so the table lives with the
project that owns the art:

```json
{
  "my_cut": {
    "rig": "rigs/my_rig.rig.json",
    "manifest": "output/my_cut/manifest.json",
    "motion": "specs/my_cut.motion.json",
    "out": "output/my_cut/spine"
  }
}
```

```bash
bun cli.ts build --cut my_cut --cuts path/to/cuts.json
```

`build` compiles, then validates, and **writes only if the gate is green**. Other
commands:

```bash
bun cli.ts explain  --cut my_cut --cuts path/to/cuts.json   # the compiled rig as a table
bun cli.ts validate path/to/spine                           # re-gate artifacts already on disk
bun cli.ts validate --profile rig-play path/to/spine      # …and this project's policy too (see Profiles)
bun cli.ts diff candidate.json reference.json               # structural comparison
bun cli.ts check --candidate path/to/spine \
                 --frames bench/reference/3-timing-and-spacing   # against pictures
bun cli.ts bonedist --candidate path/to/spine \
                 --reference ref.json --bones identity      # per-frame pose distance (stage 3)
bun cli.ts bench 3 --candidate path/to/spine                # one rung of the ladder
bun cli.ts render  --candidate path/to/spine                # PNG frames + a contact sheet
bun cli.ts preview --candidate path/to/spine                # one .html that plays it
bun cli.ts vote    --candidate path/to/a --candidate path/to/b   # one .html that asks which
bun cli.ts vote    --record vote-<id>.json                  # check the answer into votes.jsonl
bun cli.ts pose    --images path/to/parts --frame poseA.png # read a pose OUT of a picture
```

`validate` on a bare directory checks what it can see. Adding `--cut`/`--cuts` lets
it re-derive the declared durations and the structural expectations too, and the
report says which it had. `build` and `validate` both default to `--profile spine`,
the 36 validity rules; `--profile rig-play` adds this project's renderer and
archetype policy on top.

`render` and `preview` are the two that need no reference at all — see
[Looking at a rig](#looking-at-a-rig--rigc-render-and-rigc-preview). Run either
straight after a green `build`, on the same directory `--out` wrote. `vote` is the
same idea with more than one candidate in the page and an answer coming back —
see [Letting someone choose](#letting-someone-choose--rigc-vote). `pose` is the
one command that runs *before* a spec exists rather than after — see
[Reading a pose you were given](#reading-a-pose-you-were-given--rigc-pose).

## Checks

```bash
bun run typecheck    # bunx tsc --noEmit over cli.ts, selftest.ts, src/, bench/, tools/, fixtures/
bun run lint         # one rule: @typescript-eslint/no-explicit-any, as an error
bun run selftest     # the validator's own negative controls (next section)
```

All three run on every push and pull request —
[`.github/workflows/ci.yml`](https://github.com/rig-c/core/blob/main/.github/workflows/ci.yml). Bun runs the sources
directly, so the first two are not on the path of anything; they exist because a
convention nothing checks is a convention. `tsconfig.json` is full `strict`
since 2026-10-02 and says in place what was measured before raising it;
`eslint.config.js` says why it carries exactly one rule.

## Selftest

```bash
bun run selftest                            # everything below; no arguments needed
bun run selftest --cuts path/to/cuts.json   # …plus an extra suite over those cuts
```

A gate nobody has seen fail is not a gate. The selftest compiles a rig, breaks the
result one way at a time — 45 deliberate breaks, each modelled on a mistake that was
actually made or actually measured — and asserts that the **named** assertion fires
for each. Two further edits are *tolerance* controls the gate must let through,
because a widened assertion can fail by firing too often as easily as by firing too
rarely.

**The rigs it breaks are generated.** [`fixtures/public.ts`](https://github.com/rig-c/core/blob/main/fixtures/public.ts)
writes three synthetic cuts into a temp directory on every run, and between them
they carry every structure the assertions have an opinion about — region
attachments, attachment swaps, rgba fades, a ring mesh on a control bone, a ribbon
on a bone chain, an axis bone whose subtree travels along it, a detached emitter,
physics constraints, and two measured ceilings. Every plate is a checkerboard with
`PLACEHOLDER` burned into it: they exist to be structurally real, and no claim
about appearance is made from any of them.

A fifth suite breaks an **input** instead of an artifact: nine malformed rig specs
that the compiler must refuse by name — a forward parent reference, a duplicate bone
name, a slot naming a missing bone, an ik target that does not exist, an attachment
image that is not on disk, an authored mesh binding a bone the rig does not have,
one that uses raw bone indices without asking for them, a wrong `spec` field, and a
constraint type the emitter cannot write. Each of those produces a file Spine's own
parser would accept while quietly meaning something else.

A **motion** spec can be wrong the same way, and the shape that costs the most is
the quietest: a key time that lands past the animation's declared duration is never
sampled, so the motion it was meant to carry simply does not happen. Five controls
hold that line — a key sitting exactly on a duration of 68/12 s is legal and must
compile, a key that 4 dp rounding pushed 0.000034 s past one is refused by name, the
same overshoot in an artifact the compiler never saw is caught by `A09`, an animation
whose last key is a frame short of its declared end is still accepted because that
direction is a different question, and a 32-second animation keyed exactly on its own
duration is *not* failed for the float32 grid its times come back on.

There is a positive control per suite as well: the pristine artifacts must come back
with zero failures, because a validator that failed everything would otherwise look
like a validator that worked.

`rigc check` gets the same treatment, and its pair is deliberately the same rig
twice: the rung 3 transcription against rung 3's frames, and then that transcription
with every key time reversed. Reversing leaves the structure untouched — same
timelines, same key count, same duration, and the gate stays green, which the
control asserts — and changes only what the shot looks like. Faithful reads 0.67 px
of slot drift; reversed reads 66.8 px. A third control makes the frames-only read
guard refuse a reference skeleton, because an honesty invariant nobody has seen
refuse anything is not an invariant.

The **mesh** path gets the same pair, on the rung 6 transcription against rung 6's
frames. Faithful reads a median 0.08 px of drift on the mesh-bearing slots; the
break is the one an authored mesh is actually exposed to — its weights bind bones
by *index*, so inserting a bone anywhere ahead of them rebinds every vertex in
silence — and it reads 31 px with the gate still green. Four further controls run
on a generated fixture and need no corpus: a ring mesh is posed at all, its pixels
reach the coverage mask `check` reads, an all-zero deform is the identity while a
real one moves the centroid, and two triangles sharing an edge draw it once.

Point the run at a `cuts.json` and an **extra suite** compiles every cut in it,
gates the result, and compiles it a second time for `A18`. That one is a positive
control on purpose: what real art adds is geometry a fixture cannot fake — measured
offsets, a measured axis, a measured ceiling, a mesh built over a contour nobody
drew by hand — so the question it asks is whether the whole gate still comes back
green on it. Without a cuts file it says it was skipped and the run passes on the
public suite alone; a cuts path that is *named and missing* exits 2.

Two suites measure against the Spine example corpus, which is downloaded rather
than redistributed. When `examples/` is absent they say so loudly and the summary
repeats it — an absent corpus is a hole in the run, not a pass — and a run in which
nothing substantive executed exits 2 rather than printing green. That floor is one
per suite, not one on their sum, and it is counted off the case lines each suite
prints: a suite that reports it ran and then measures nothing exits 2 by name, even
when the run's total grew around it (issue #439).

## Layout

```
tsconfig.json   type-check config (noEmit); eslint.config.js — the no-any gate
cli.ts          build / validate / explain / diff / check / bonedist / bench / render / preview / vote / pose
selftest.ts     the validator's own negative controls, and diff's, bonedist's and check's
fixtures/       public.ts — the three synthetic cuts the selftest breaks
src/
  compile.ts    rig + motion spec (+ manifest) -> skeleton JSON + atlas text (pure data assembly)
  atlas.ts      the atlas as a structure: the format read back in (`--atlas-in`), a
                MaxRects packer that arranges the parts onto shared pages (`--pack`),
                and the one emitter both shapes are written through
  emit.ts       `--copy-images` — the pages copied into `--out` and the atlas rewritten
  rig.ts        the rig spec — `spec: "rigc-rig/1"`, the skeleton as data
  validate.ts   spine-core round trip + the named assertions
  diff.ts       structural comparison of two skeletons, one ratio per measure
  render.ts     the rasteriser (regions + meshes), shared by the reference renderer,
                `rigc render` and check
  preview.ts    the single-file HTML player page — the artifact embedded as data
                URIs, played by the official Spine Web Player (referenced, not vendored)
  ballot.ts     the same page with 2–4 candidates in it and a vote coming back —
                candidate digests, the ballot manifest, and the refusals that
                stand between a saved vote and the ledger
  check.ts      a candidate against rendered frames — pixels and per-slot drift,
                and it never opens the reference skeleton
  bonedist.ts   the ladder's stage 3 — per-frame, per-bone world-transform distance
                between two POSED skeletons, on a supplied bone correspondence. It
                does read the reference skeleton, so it sits beside bench and not
                inside an authoring loop
  pose.ts       the other direction: loose part PNGs against ONE pose frame, and
                where each part sits in it. An entry instrument — it reads a given
                condition into spec coordinates and grades nothing
  ladder.ts     which example is which rung, and which file in it is the reference
  timelines.ts  the 4.3 timeline catalogue and its walker (shared, pure JSON)
  mesh.ts       ring and ribbon mesh builders, weighted-vertex encoding
  transform.ts  crop pixels (y down) <-> Spine world (y up), world transforms
  png.ts        PNG header reader (size, colour type, tRNS; no pixel decode)
  errors.ts     CompileError, and NotImplementedError for what the format holds
                and the emitter does not write
  types.ts      manifest, motion spec, and emitted-JSON shapes
tools/          measurement and plate helpers (see below)
scripts/        fetch-examples.sh
bench/          count_features.ts — what the example corpus actually uses
                render_reference.ts — a rung's official export as PNG frames
                briefs/ — what an authoring agent is told about a rung
                reference/ — those frames, with the licence they travel under
                runs/ — one directory per attempt, and the run protocol
                transcriptions/ — rung specs transcribed from a reference export,
                which measure expressiveness and NOT authoring (see LADDER.md)
viewer/         the run viewer — dev server only, no build (see above)
                  vite.config.ts  /api/inventory and /repo/<path>, and the build refusal
                  inventory.ts    what is under bench/runs, resolved to URLs
                  main.ts         the two panes, the transport, the report
docs/           AUTHORING.md (how to author a rig), BENCHMARK.md (this document),
                GATE.md (the clause statements a candidate is graded against),
                LADDER.md (live rung status), SPEC_COVERAGE.md (format reference),
                SURVEY_2026-08-22.md (the dated survey), feature_matrix.{csv,json}
.github/        workflows/ — ci.yml (the gates), selftest-shards.yml (the sharded selftest
                both call) and release.yml (release-please and the publish)
CONTRIBUTING.md how to propose a change; RELEASING.md — how a version is cut
```

`tools/` are standalone utilities, each taking its paths as arguments:

| Tool | Does |
| --- | --- |
| `measure_contact_depth.ts` | measures a cut's contact depth from its plates, with the two-sided proof it has to satisfy. Both slot names are required: which plate is the mass and which is the occluder is a fact about one cut, and a default would measure the wrong pair and still print a number |
| `contact.ts` | plate-vs-plate overlap measurement — the largest advance that keeps two footprints disjoint |
| `plate.ts` / `png_probe.mjs` | minimal PNG read/write and decode. The writer emits colour type 6 only; the reader takes every colour type and bit depth PNG allows except interlaced, expanding indexed palettes (`PLTE` + `tRNS`) and greyscale to RGBA — because the gate accepts that art, so the renderer has to as well (issue #226) |
| `font5x7.ts` | bitmap labels for diagnostic images and generated plates |
| `hull_ceiling.ts` / `pack_anchor.ts` / `trace_footprint.ts` | what polygon packing could buy and what it does buy, over the tree's recipes or a private `--recipes` document. `hull_ceiling` states the ceiling — Σ mesh hull, and Σ traced contour with region attachments converted (a region the tracer refuses kept as its rectangle, as a conversion keeps it), over Σ rectangle — without packing; `pack_anchor` packs every built set `rect` and `polygon` and states Σ page area under `free` and `pot`. `pack_anchor --trace-regions <tolerance>` is the realised figure for converting region attachments (issue #1115): every region-kind region packed by its traced contour, converted in memory and read back through `packFootprints` (nothing on disk changes), at tolerance 0 — the corner-lattice outline the ceiling counts — and at `buildContourMesh` with that tolerance and the contour generator's defaults for the rest (margin 1, maxVertices 64, alpha 1; the generator has no default tolerance, so the flag takes one). `trace_footprint` is the tracing and in-memory conversion both tools share |
